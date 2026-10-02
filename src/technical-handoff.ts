import {api} from '@appdeploy/client';
import {domains, isTechnicalHost} from './canonical-navigation';
import {resolveCanonicalRoute} from './canonical-service';
import {ecosystemTabContext, ecosystemSessionLikely, setEcosystemSessionLikely} from './tab-context';

let consumedTechnical = false;
let pendingQueryCode = '';
let nativeAssign: ((url: string | URL) => void) | null = null;
let patchTried = false;

if (typeof location !== 'undefined') {
  try {
    const url = new URL(location.href);
    pendingQueryCode = url.searchParams.get('handoff') || '';
    if (pendingQueryCode) {
      url.searchParams.delete('handoff');
      history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {}
}

const go = (url: string) => {
  try {
    if (nativeAssign) nativeAssign(url);
    else Location.prototype.assign.call(location, url);
  } catch {
    try {
      location.href = url;
    } catch {}
  }
};

export async function consumeTechnicalHandoff() {
  try {
    const queryOk = await consumeQueryHandoff();
    ensureAssignPatch();
    if (consumedTechnical || typeof location === 'undefined' || !isTechnicalHost()) return queryOk;
    const match = /[#&]owner_handoff=([^&]+)/.exec(location.hash || '');
    if (!match) return queryOk;
    consumedTechnical = true;
    const handoffToken = decodeURIComponent(match[1] || '');
    try {
      const url = new URL(location.href);
      url.hash = '';
      history.replaceState({}, '', `${url.pathname}${url.search}`);
    } catch {}
    if (!handoffToken) return queryOk;
    const route = resolveCanonicalRoute();
    await Promise.race([
      api.post('/api/owner/identity/technical/finalize', {
        service: route.service || 'hub',
        tabContext: ecosystemTabContext(),
        sourceOrigin: location.origin,
        handoffToken
      }),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 1500))
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function consumeQueryHandoff() {
  const code = pendingQueryCode;
  pendingQueryCode = '';
  if (!code || typeof location === 'undefined') return false;
  try {
    const route = resolveCanonicalRoute();
    await Promise.race([
      api.post('/api/owner/session/handoff/redeem', {
        service: route.service || 'hub',
        tabContext: ecosystemTabContext(),
        sourceOrigin: location.origin,
        code
      }),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 1500))
    ]);
    setEcosystemSessionLikely(true);
    return true;
  } catch {
    return false;
  }
}

const allowedHandoffOrigin = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.searchParams.get('handoff')) return false;
    return Object.values(domains).some((value) => value === parsed.origin || value === parsed.hostname || value === parsed.host);
  } catch {
    return false;
  }
};

const skipIntercept = (parsed: URL, target: string, current: string) => {
  if (parsed.searchParams.get('handoff')) return true;
  if (parsed.protocol !== 'https:') return true;
  if (parsed.hostname === 'accounts.google.com' || parsed.hostname.endsWith('.google.com')) return true;
  if (parsed.pathname.includes('/api/auth') || parsed.searchParams.has('client_id')) return true;
  if (!target || target === current || target === 'identity') return true;
  return false;
};

export async function assignCanonicalService(target: string, fallbackUrl: string, authBody: Record<string, unknown>, tab = '') {
  if (typeof location === 'undefined') return;
  if (isTechnicalHost()) {
    go(fallbackUrl);
    return;
  }
  try {
    const raced = await Promise.race([
      api.post('/api/owner/session/handoff/create', {...authBody, target, tab}),
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), 800))
    ]);
    const url = String((raced as {data?: {url?: string}})?.data?.url || '');
    if (allowedHandoffOrigin(url)) {
      go(url);
      return;
    }
  } catch {}
  go(fallbackUrl);
}

function ensureAssignPatch() {
  if (patchTried || typeof location === 'undefined') return;
  patchTried = true;
  const proto = Location.prototype.assign;
  try {
    nativeAssign = (url: string | URL) => proto.call(location, url);
  } catch {
    nativeAssign = (url: string | URL) => {
      location.href = String(url);
    };
  }
  const patched = (url: string | URL) => {
    const href = String(url);
    try {
      if (isTechnicalHost() || !ecosystemSessionLikely()) {
        go(href);
        return;
      }
      const parsed = new URL(href, location.origin);
      const route = resolveCanonicalRoute();
      const target = Object.entries(domains).find(([, value]) => value === parsed.origin || value === parsed.hostname || value === parsed.host)?.[0] || '';
      if (skipIntercept(parsed, target, route.service || 'hub')) {
        go(href);
        return;
      }
      const tab = decodeURIComponent(parsed.pathname.replace(/^\//, '').split('/')[0] || '');
      void assignCanonicalService(target, href, {
        service: route.service || 'hub',
        tabContext: ecosystemTabContext(),
        sourceOrigin: location.origin
      }, tab);
    } catch {
      go(href);
    }
  };
  try {
    Object.defineProperty(Location.prototype, 'assign', {
      configurable: true,
      writable: true,
      value(this: Location, url: string | URL) {
        if (this !== location) {
          proto.call(this, url);
          return;
        }
        patched(url);
      }
    });
  } catch {
    try {
      location.assign = patched;
    } catch {}
  }
}
