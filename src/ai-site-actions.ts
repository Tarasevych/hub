// Acties die Mijn Ruimte zelf aanbiedt aan AI-assistenten.
//
// De browserextensie (extension/content.js) praat met de pagina via window.postMessage (alleen van dezelfde pagina en
// dezelfde origin) en kan zo een gestructureerde actie uitvoeren in plaats van op knoppen te "raden". Staat de WebMCP-standaard
// (navigator.modelContext) in de browser, dan worden dezelfde acties daar ook geregistreerd.
//
// Veiligheid: de acties hier zijn bewust klein (lezen en navigeren binnen de eigen site). Of een actie mag lopen bepaalt de
// server (beleid van de agent: browser.invoke wacht standaard op een klik van de gebruiker), niet deze pagina.
import { canonicalNavigationUrl, routeLang, serviceIds, type TargetService } from './canonical-navigation';
import { serviceTabs } from './canonical-service';
import { serviceTabLabel } from './service-tab-labels';

type Json = Record<string, unknown>;
type SiteAction = { id: string; description: string; params?: Record<string, string>; run: (args: Json) => unknown };

const ACTIONS: SiteAction[] = [
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
];

const describe = () => ACTIONS.map(({ id, description, params }) => ({ id, description, ...(params ? { params } : {}) }));

async function execute(id: string, args: Json): Promise<unknown> {
  const action = ACTIONS.find((a) => a.id === id);
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
    for (const a of ACTIONS) {
      model.registerTool({
        name: `mijn_ruimte_${a.id}`, description: a.description,
        inputSchema: { type: 'object', properties: Object.fromEntries(Object.entries(a.params || {}).map(([k, v]) => [k, { type: 'string', description: v }])), additionalProperties: false },
        execute: async (args: Json) => ({ content: [{ type: 'text', text: JSON.stringify(await execute(a.id, args || {})) }] }),
      });
    }
  }
} catch { /* WebMCP is optioneel */ }
