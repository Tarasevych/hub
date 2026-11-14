import {api} from './platform/client';
import {domains} from './canoniek-navigatie';
import {resolveCanonicalRoute} from './canoniek-dienst';
import {ecosystemTabContext, ecosystemSessionLikely, setEcosystemSessionLikely} from './tab-context';

let pendingQueryCode = '';
let nativeAssign: ((url: string | URL) => void) | null = null;
let patchTried = false;

// Sessie-overdracht tussen subdomeinen (?handoff=<code>). Sinds v56: ruime timeout (12 s) met één
// nieuwe poging. De vroegere AppDeploy-variant (#owner_handoff op de technische host) is verwijderd.
const FINALIZE_TIMEOUT_MS = 12000;

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

const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), ms))
  ]);

export async function consumeSessionHandoff() {
  const ok = await consumeQueryHandoff();
  ensureAssignPatch();
  return ok;
}

export async function consumeQueryHandoff() {
  const code = pendingQueryCode;
  pendingQueryCode = '';
  if (!code || typeof location === 'undefined') return false;
  try {
    const route = resolveCanonicalRoute();
    const redeem = () =>
      api.post('/api/owner/session/handoff/redeem', {
        service: route.service || 'hub',
        tabContext: ecosystemTabContext(),
        sourceOrigin: location.origin,
        code
      });
    try {
      await withTimeout(redeem(), FINALIZE_TIMEOUT_MS);
    } catch (caught) {
      // Eén nieuwe poging alleen bij timeout/netwerkfout; een expliciete weigering (4xx) is definitief.
      const status = (caught as {status?: number})?.status || 0;
      if (status >= 400 && status < 500) throw caught;
      await withTimeout(redeem(), FINALIZE_TIMEOUT_MS);
    }
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

const zelfdeEcosysteem = (a: string, b: string) => {
  const ha = a.toLowerCase(), hb = b.toLowerCase();
  return (ha === 'tarasevych.com' || ha.endsWith('.tarasevych.com')) && (hb === 'tarasevych.com' || hb.endsWith('.tarasevych.com'));
};

const skipIntercept = (parsed: URL, target: string, current: string) => {
  if (parsed.searchParams.get('handoff')) return true;
  if (parsed.protocol !== 'https:') return true;
  if (parsed.hostname === 'accounts.google.com' || parsed.hostname.endsWith('.google.com')) return true;
  if (parsed.pathname.includes('/api/auth') || parsed.searchParams.has('client_id')) return true;
  if (!target || target === current || target === 'identity') return true;
  if (typeof location !== 'undefined' && zelfdeEcosysteem(location.hostname, parsed.hostname)) return true;
  return false;
};

export async function assignCanonicalService(target: string, fallbackUrl: string, authBody: Record<string, unknown>, tab = '') {
  if (typeof location === 'undefined') return;
  try {
    const raced = await withTimeout(
      api.post('/api/owner/session/handoff/create', {...authBody, target, tab}),
      800
    );
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
      if (!ecosystemSessionLikely()) {
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
