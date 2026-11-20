// UPD-012: попереднє завантаження видимих елементів із повагою до режиму spaarzaam і пріоритету кліку.
import { bepaalLaadProfiel, isKlikFocusActief } from './platform/adaptief-laden';

export type PrefetchPriority = 'visible' | 'intent';
type ConnectionInfo = { saveData?: boolean; effectiveType?: string };
type IdleWindow = Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number };
type Task = { key: string; priority: PrefetchPriority; run: () => Promise<unknown> | unknown };
type VisiblePrefetchOptions = { rootMargin?: string; maxItems?: number; onHidden?: (element: HTMLElement) => void };

const queued = new Map<string, Task>();
const done = new Map<string, number>();
const activeKeys = new Set<string>();
const cancelled = new Set<string>();
const preconnected = new Set<string>();
const prefetchedHref = new Set<string>();
let active = 0;
let scheduled = false;
let focusRetryTimer: number | undefined;

const TTL = 300000;
const authKeys = /^(code|state|token|proof|transaction|redeem|handoff|auth_broker|oauth_code|oauth_error)$/i;
const connection = () => ((navigator as Navigator & { connection?: ConnectionInfo }).connection || {});

export const prefetchMode = () => {
  const profiel = bepaalLaadProfiel();
  if (profiel.modus === 'spaarzaam' || !profiel.vooruitladenToegestaan) return 'off' as const;
  const info = connection();
  const type = String(info.effectiveType || '').toLowerCase();
  if (info.saveData || type === 'slow-2g' || type === '2g') return 'off' as const;
  if (type === '3g' || profiel.modus === 'normaal') return 'conservative' as const;
  return 'full' as const;
};

export const prefetchBudgetAllows = (bytes: number, priority: PrefetchPriority = 'visible') => {
  const mode = prefetchMode();
  if (mode === 'off') return false;
  if (priority === 'visible' && isKlikFocusActief()) return false;
  if (!Number.isFinite(bytes) || bytes <= 0) return true;
  const limit = mode === 'conservative' ? (priority === 'intent' ? 5 : 1) * 1048576 : (priority === 'intent' ? 20 : 4) * 1048576;
  return bytes <= limit;
};

const concurrency = () => (prefetchMode() === 'full' ? Math.min(2, Math.max(1, bepaalLaadProfiel().maxParallelAchtergrond)) : 1);

const cleanDone = () => {
  const now = Date.now();
  for (const [key, at] of done) if (now - at > TTL) done.delete(key);
};

const wake = (priority: PrefetchPriority = 'visible') => {
  if (scheduled || prefetchMode() === 'off') return;
  scheduled = true;
  const run = () => {
    scheduled = false;
    pump();
  };
  if (priority === 'intent') {
    window.setTimeout(run, 0);
    return;
  }
  const idle = (window as IdleWindow).requestIdleCallback;
  if (idle) idle(run, { timeout: 900 });
  else window.setTimeout(run, 180);
};

const pump = () => {
  cleanDone();
  if (document.visibilityState === 'hidden' || prefetchMode() === 'off') return;
  const klikFocus = isKlikFocusActief();
  let uitgesteldVoorKlik = false;
  const tasks = [...queued.values()].sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'intent' ? -1 : 1));
  for (const task of tasks) {
    if (active >= concurrency()) break;
    if (klikFocus && task.priority !== 'intent') {
      uitgesteldVoorKlik = true;
      continue;
    }
    queued.delete(task.key);
    if (cancelled.has(task.key)) {
      cancelled.delete(task.key);
      continue;
    }
    active += 1;
    activeKeys.add(task.key);
    Promise.resolve()
      .then(task.run)
      .then(() => {
        if (!cancelled.has(task.key)) done.set(task.key, Date.now());
      })
      .catch(() => undefined)
      .finally(() => {
        active -= 1;
        activeKeys.delete(task.key);
        cancelled.delete(task.key);
        if (queued.size) wake();
      });
  }
  if (uitgesteldVoorKlik && focusRetryTimer === undefined && queued.size > 0) {
    focusRetryTimer = window.setTimeout(() => {
      focusRetryTimer = undefined;
      if (queued.size) wake('visible');
    }, 300);
  }
};

export const prefetchData = (key: string, run: () => Promise<unknown> | unknown, priority: PrefetchPriority = 'visible') => {
  if (!key || prefetchMode() === 'off') return;
  if (priority === 'visible' && isKlikFocusActief()) return;
  cleanDone();
  if (done.has(key) || activeKeys.has(key)) return;
  const current = queued.get(key);
  if (current) {
    if (priority === 'intent' && current.priority !== 'intent') {
      current.priority = 'intent';
      wake('intent');
    }
    return;
  }
  cancelled.delete(key);
  queued.set(key, { key, priority, run });
  wake(priority);
};

export const cancelPrefetchData = (key: string) => {
  if (!key) return;
  queued.delete(key);
  if (activeKeys.has(key)) cancelled.add(key);
};

export const cancelPrefetchDataPrefix = (prefix: string) => {
  if (!prefix) return;
  for (const key of [...queued.keys()]) if (key.startsWith(prefix)) queued.delete(key);
  for (const key of activeKeys) if (key.startsWith(prefix)) cancelled.add(key);
};

export const prefetchDataWanted = (key: string) => !cancelled.has(key);

const safeUrl = (raw: string) => {
  try {
    const url = new URL(raw, location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if ([...url.searchParams.keys()].some((key) => authKeys.test(key))) return null;
    const firstParty = url.origin === location.origin || url.hostname === 'tarasevych.com' || url.hostname.endsWith('.tarasevych.com');
    return firstParty ? url : null;
  } catch {
    return null;
  }
};

const preconnect = (origin: string) => {
  if (origin === location.origin || preconnected.has(origin) || !bepaalLaadProfiel().vooruitladenToegestaan) return;
  preconnected.add(origin);
  for (const rel of ['dns-prefetch', 'preconnect']) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = origin;
    link.dataset.tsvPrefetch = 'connection';
    document.head.appendChild(link);
  }
};

export const prefetchHref = (raw: string, priority: PrefetchPriority = 'visible') => {
  if (!bepaalLaadProfiel().vooruitladenToegestaan) return;
  if (priority === 'visible' && isKlikFocusActief()) return;
  const url = safeUrl(raw);
  if (!url || url.href === location.href || prefetchedHref.has(url.href)) return;
  prefetchData(
    `href:${url.href}`,
    () => {
      if (url.origin !== location.origin) preconnect(url.origin);
      prefetchedHref.add(url.href);
    },
    priority,
  );
};

const hrefOf = (element: Element) => (element instanceof HTMLAnchorElement ? element.href : element.getAttribute('data-prefetch-href') || '');
const targetSelector = 'a[href],[data-prefetch-href]';

export const observeVisiblePrefetch = (
  root: Element,
  selector: string,
  onVisible: (element: HTMLElement) => void,
  options: string | VisiblePrefetchOptions = '260px 0px',
) => {
  const config: VisiblePrefetchOptions = typeof options === 'string' ? { rootMargin: options } : options;
  const rootMargin = config.rootMargin || '260px 0px';
  const maxItems = Math.max(0, Math.trunc(config.maxItems || 0));
  const host = root.closest('.canonical-workspace');
  const nodes = [...root.querySelectorAll<HTMLElement>(selector)];
  if (!maxItems && !config.onHidden) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!bepaalLaadProfiel().vooruitladenToegestaan || isKlikFocusActief()) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            onVisible(entry.target as HTMLElement);
          }
        }
      },
      { root: host, rootMargin, threshold: 0.01 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }
  const intersecting = new Set<HTMLElement>();
  const selected = new Set<HTMLElement>();
  const score = (node: HTMLElement) => {
    const view = host?.getBoundingClientRect();
    const top = view?.top ?? 0;
    const bottom = view?.bottom ?? window.innerHeight;
    const rect = node.getBoundingClientRect();
    const inside = rect.bottom > top && rect.top < bottom;
    const center = (top + bottom) / 2;
    return (inside ? 0 : 1000000) + Math.abs((rect.top + rect.bottom) / 2 - center);
  };
  const reconcile = () => {
    if (!bepaalLaadProfiel().vooruitladenToegestaan || isKlikFocusActief()) return;
    const candidates = [...intersecting].sort((a, b) => score(a) - score(b));
    const next = new Set(maxItems ? candidates.slice(0, maxItems) : candidates);
    for (const node of [...selected]) {
      if (!next.has(node)) {
        selected.delete(node);
        config.onHidden?.(node);
      }
    }
    for (const node of next) {
      if (!selected.has(node)) {
        selected.add(node);
        onVisible(node);
      }
    }
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const node = entry.target as HTMLElement;
        if (entry.isIntersecting) intersecting.add(node);
        else intersecting.delete(node);
      }
      reconcile();
    },
    { root: host, rootMargin, threshold: 0.01 },
  );
  nodes.forEach((node) => observer.observe(node));
  return () => {
    observer.disconnect();
    for (const node of selected) config.onHidden?.(node);
  };
};

export const installVisibleLinkPrefetch = (root: Document = document) => {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!bepaalLaadProfiel().vooruitladenToegestaan || isKlikFocusActief()) return;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          const href = hrefOf(entry.target);
          if (href) prefetchHref(href, 'visible');
        }
      }
    },
    { root: null, rootMargin: '320px 0px', threshold: 0.01 },
  );
  const observe = (node: ParentNode) => node.querySelectorAll<Element>(targetSelector).forEach((item) => observer.observe(item));
  observe(root);
  const pending = new Set<Element>();
  let mutRaf = 0;
  const flush = () => {
    mutRaf = 0;
    const batch = [...pending];
    pending.clear();
    for (const node of batch) {
      if (!node.isConnected) continue;
      if (node.matches(targetSelector)) observer.observe(node);
      observe(node);
    }
  };
  const mutation = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) pending.add(node);
    if (!mutRaf && pending.size) mutRaf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(flush) : (flush(), 0);
  });
  mutation.observe(root.documentElement, { childList: true, subtree: true });
  const intent = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest(targetSelector) : null;
    const href = target ? hrefOf(target) : '';
    if (href) prefetchHref(href, 'intent');
  };
  root.addEventListener('pointerover', intent, true);
  root.addEventListener('focusin', intent, true);
  const visible = () => {
    if (document.visibilityState === 'visible' && queued.size) wake();
  };
  document.addEventListener('visibilitychange', visible);
  return () => {
    if (mutRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(mutRaf);
    pending.clear();
    observer.disconnect();
    mutation.disconnect();
    root.removeEventListener('pointerover', intent, true);
    root.removeEventListener('focusin', intent, true);
    document.removeEventListener('visibilitychange', visible);
  };
};