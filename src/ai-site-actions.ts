// Acties en diagnose die Mijn Ruimte zelf aanbiedt aan AI-assistenten.
//
// De browserextensie (extension/content.js) praat met de pagina via window.postMessage (alleen van dezelfde pagina en
// dezelfde origin) en kan zo een gestructureerde actie uitvoeren in plaats van op knoppen te "raden". Componenten melden hun
// eigen acties aan met registerSiteActions() (of de hook useMcpContext). Staat de WebMCP-standaard (navigator.modelContext) in de
// browser, dan worden de basisacties daar ook geregistreerd.
//
// Veiligheid: wie een actie MAG laten lopen bepaalt de server (browser.invoke wacht standaard op een klik van de gebruiker, en een
// browser doet niets zolang de gebruiker hem niet heeft aangezet en een ingelogde sessie dat bevestigt), niet deze pagina.
// Diagnose gebeurt zonder het zware recht chrome.debugger: de site houdt zelf een korte lijst bij van fouten en mislukte verzoeken.
import { canonicalNavigationUrl, routeLang, serviceIds, type TargetService } from './canonical-navigation';
import { serviceTabs } from './canonical-service';
import { serviceTabLabel } from './service-tab-labels';

type Json = Record<string, unknown>;
export type SiteAction = { id: string; description: string; params?: Record<string, string>; run: (args: Json) => unknown };

const ACTION_ID = /^[a-z][a-z0-9_]{0,63}$/;

// ---- diagnose: korte lijst met fouten (geen inhoud, geen query-strings, geen request-bodies) ----
type Problem = { at: number; kind: 'error' | 'unhandledrejection' | 'console.error' | 'console.warn' | 'http' | 'network'; message: string };
const problems: Problem[] = [];
const MAX_PROBLEMS = 100;
const scrub = (value: unknown): string =>
  String(value instanceof Error ? value.message : value).replace(/\?[^\s"')]*/g, '?…').replace(/\s+/g, ' ').slice(0, 300);
const note = (kind: Problem['kind'], message: unknown) => {
  problems.push({ at: Date.now(), kind, message: scrub(message) });
  if (problems.length > MAX_PROBLEMS) problems.shift();
};
const pathOf = (input: RequestInfo | URL): string => {
  try { const u = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href); return `${u.origin === location.origin ? '' : u.origin}${u.pathname}`; }
  catch { return 'onbekend'; }
};

if (!(window as unknown as { __mrDiag?: boolean }).__mrDiag) {
  (window as unknown as { __mrDiag?: boolean }).__mrDiag = true;
  window.addEventListener('error', (e) => note('error', `${e.message} (${(e.filename || '').split('/').pop() || 'pagina'}:${e.lineno || 0})`));
  window.addEventListener('unhandledrejection', (e) => note('unhandledrejection', (e.reason as Error)?.message ?? e.reason));
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => { note(level === 'error' ? 'console.error' : 'console.warn', args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : '[object]')).join(' ')); original(...args); };
  }
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const res = await realFetch(input, init);
      if (!res.ok) note('http', `${(init?.method || 'GET').toUpperCase()} ${pathOf(input)} -> ${res.status}`);
      return res;
    } catch (err) { note('network', `${(init?.method || 'GET').toUpperCase()} ${pathOf(input)} (${(err as Error)?.name || 'fout'})`); throw err; }
  };
}

function pageMetrics() {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return {
    page: location.pathname,
    timing: nav ? { ttfbMs: Math.round(nav.responseStart), domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd), loadMs: Math.round(nav.loadEventEnd) } : null,
    resources: {
      count: res.length,
      transferKB: Math.round(res.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024),
      slowest: [...res].sort((a, b) => b.duration - a.duration).slice(0, 5).map((r) => ({ path: pathOf(r.name), ms: Math.round(r.duration) })),
    },
    dom: { nodes: document.getElementsByTagName('*').length },
    ...(memory ? { jsHeapMB: Math.round(memory.usedJSHeapSize / 1048576) } : {}),
  };
}

// ---- register van acties ----
const BASE_ACTIONS: SiteAction[] = [
  {
    id: 'list_services',
    description: 'List the Mijn Ruimte services with their pages (read-only).',
    run: () => serviceIds.map((service) => ({
      service,
      pages: ((serviceTabs as Record<string, readonly string[]>)[service] || []).map((tab) => ({ tab, label: serviceTabLabel(tab, routeLang()) })),
    })),
  },
  {
    id: 'open_service',
    description: 'Open a Mijn Ruimte service, optionally on one of its pages, in this tab.',
    params: { service: 'Service id from list_services (for example "mail" or "mcp").', tab: 'Optional page id from list_services.' },
    run: (args) => {
      const service = String(args.service ?? '');
      const tab = args.tab === undefined ? '' : String(args.tab);
      if (!(serviceIds as readonly string[]).includes(service)) throw new Error('Unknown service. Use list_services.');
      const pages = (serviceTabs as Record<string, readonly string[]>)[service] || [];
      if (tab && !pages.includes(tab)) throw new Error('Unknown page for this service. Use list_services.');
      const url = canonicalNavigationUrl(service as TargetService, tab, routeLang());
      // Eerst antwoorden, dan navigeren: anders verdwijnt de pagina voordat het antwoord is verstuurd.
      window.setTimeout(() => location.assign(url), 80);
      return { opening: url };
    },
  },
  {
    id: 'get_page_metrics',
    description: 'Basic performance numbers of this page: load timings, resource count and size, slowest resources, DOM size (read-only).',
    run: () => pageMetrics(),
  },
  {
    id: 'get_diagnostics',
    description: 'Recent JavaScript errors, console errors/warnings and failed requests of this page, plus page metrics (read-only; no request contents, no query strings).',
    run: () => ({ problems: problems.slice(-50), metrics: pageMetrics() }),
  },
];

const contexts = new Map<string, SiteAction[]>();

/** Componenten melden hun acties aan onder een eigen contextnaam (id wordt `<context>_<id>`). Geeft een functie om af te melden. */
export function registerSiteActions(context: string, actions: SiteAction[]): () => void {
  if (!ACTION_ID.test(context)) throw new Error(`Ongeldige contextnaam: ${context}`);
  const prefixed = actions.map((a) => {
    if (!ACTION_ID.test(a.id)) throw new Error(`Ongeldige actie-id: ${a.id}`);
    return { ...a, id: `${context}_${a.id}` };
  });
  contexts.set(context, prefixed);
  return () => { if (contexts.get(context) === prefixed) contexts.delete(context); };
}

const allActions = (): SiteAction[] => [...BASE_ACTIONS, ...[...contexts.values()].flat()];
const describe = () => allActions().map(({ id, description, params }) => ({ id, description, ...(params ? { params } : {}) }));

// Alleen-lezen overzicht voor ontwikkelaars en tests (geen functies): window.__MCP_CONTEXT__
Object.defineProperty(window, '__MCP_CONTEXT__', {
  configurable: false,
  get: () => ({ contexts: [{ name: 'site', actions: describe() }] }),
});

async function execute(id: string, args: Json): Promise<unknown> {
  const action = allActions().find((a) => a.id === id);
  if (!action) throw new Error(`Unknown action "${id}"`);
  return action.run(args);
}

window.addEventListener('message', (event) => {
  // Alleen berichten van deze pagina zelf (de content script van de extensie), nooit van een iframe of ander venster.
  if (event.source !== window || event.origin !== location.origin || !event.data || typeof event.data.mrAiId !== 'string') return;
  const reply = (data: Json) => window.postMessage({ mrAiReply: event.data.mrAiId, ...data }, location.origin);
  if (event.data.mrAi === 'list') { reply({ actions: describe() }); return; }
  if (event.data.mrAi === 'invoke') {
    const args = event.data.args && typeof event.data.args === 'object' ? event.data.args as Json : {};
    execute(String(event.data.action ?? ''), args)
      .then((result) => reply({ ok: true, result }))
      .catch((err: Error) => reply({ ok: false, error: String(err.message || err).slice(0, 200) }));
  }
});

// WebMCP (navigator.modelContext): alleen als de browser het aanbiedt; anders gebeurt er niets.
try {
  const model = (navigator as unknown as { modelContext?: { registerTool?: (tool: unknown) => void } }).modelContext;
  if (model && typeof model.registerTool === 'function') {
    for (const a of BASE_ACTIONS) {
      model.registerTool({
        name: `mijn_ruimte_${a.id}`, description: a.description,
        inputSchema: { type: 'object', properties: Object.fromEntries(Object.entries(a.params || {}).map(([k, v]) => [k, { type: 'string', description: v }])), additionalProperties: false },
        execute: async (args: Json) => ({ content: [{ type: 'text', text: JSON.stringify(await execute(a.id, args || {})) }] }),
      });
    }
  }
} catch { /* WebMCP is optioneel */ }
