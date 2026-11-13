// Connector v2 — browser via de extensie voor ELKE agent, plus de namen van chrome-devtools-mcp als aliassen (zone E, 22.10.2026).
//
// 1. Gelijkheid: elke agent (claude, gpt, grok, gemini, copilot, cursor) krijgt uit shared/connector-v2/catalogus.ts precies dezelfde
//    browserhulpmiddelen (groep 'browser'); het verschil tussen agenten zit alleen in wat de mens die agent toestond (rechten per
//    koppeling) en in de matrix «Браузер і агенти» (backend/extensie-matrix.ts). tests/eenheid/connector-browser-gelijk-20261022.test.ts
//    bewaakt dat de set per agent gelijk is.
// 2. Aliassen: een agent die chrome-devtools-mcp kent (navigate_page, take_snapshot, click, fill, evaluate_script, …) kan die namen
//    hier gebruiken zonder herscholing. Elke alias leidt naar HETZELFDE interne hulpmiddel (backend/connectors-hulpmiddelen.ts
//    DEVTOOLS_ALIASES → browser_*) en gaat door DEZELFDE poorten (rechten, levende ruimte, ontgrendeling, beleid, matrix). Namen:
//      <alias>                                      → slot volgens de regel hieronder
//      <alias>_gebruiker | <alias>_beheer           → dat slot
//      <alias>_<agent>_mcp_tarasevych_com_<kant>    → volledige v2-vorm
//    Slotregel voor de kale naam: `args.slot` ('prive'|'technisch', wordt verwijderd) wint; anders het TECHNISCHE slot als de
//    technische kant nu leeft én de mens die kant voor dit hulpmiddel toestond, anders het privéslot.
// 3. Niet ondersteund (bewust): emulate_cpu/emulate_network/emulate, resize_page, upload_file, handle_dialog, drag,
//    performance_analyze_insight — de extensie kan die niet veilig begrenzen; de weigering noemt wat wél bestaat.
//    performance_start_trace / performance_stop_trace → browser_audit (soort 'prestaties'): geen echte trace, wel navigatietiming,
//    LCP, CLS, lange taken en grootste resources. Dat staat ook in de tekst van het antwoord.
// De lijst van chrome-devtools-mcp-namen is uit kennis van de openbare repository (ChromeDevTools/chrome-devtools-mcp, versies tot
// 2025); zonder netwerk niet opnieuw geverifieerd — zie docs/agenten/BROWSER-VIA-CONNECTOR.md.
import type { AiRuimte } from '../shared/ai-ruimte';
import type { AgentSlug } from '../shared/connector-v2/agenten';
import { V2_OPTIES, type Kant, type V2Optie } from '../shared/connector-v2/catalogus';
import { toolNaam } from '../shared/connector-v2/namen';
import { BROWSER_BEHEER_PAD_EN } from '../shared/extensie-matrix';
import { DEVTOOLS_ALIASES, resolveAlias, type ToolDef } from './connectors-hulpmiddelen';
import { vertaalHulpmiddel, vertaalSchema, type ToolTaal } from '../shared/hulpmiddel-teksten';

/** Namen van chrome-devtools-mcp die wij NIET aanbieden, met de reden en het alternatief. */
export const DEVTOOLS_NIET: Readonly<Record<string, string>> = Object.freeze({
  emulate: 'device/network emulation is not available through the Mijn Ruimte extension (it never changes the user\'s browser settings). Use take_snapshot and browser_audit instead.',
  emulate_cpu: 'CPU throttling is not available through the Mijn Ruimte extension. Use performance_start_trace (= browser_audit «prestaties») for timing data.',
  emulate_network: 'network throttling is not available through the Mijn Ruimte extension. Use list_network_requests for what the page really loads.',
  resize_page: 'resizing the window is not available (the extension never changes the user\'s window). Take a screenshot as is.',
  upload_file: 'file upload is not available through the extension (it never reads the user\'s files). Ask the user to attach the file themselves.',
  handle_dialog: 'native dialogs cannot be handled by the extension. Ask the user to close the dialog.',
  drag: 'drag and drop is not available. Use click, fill and press_key.',
  performance_analyze_insight: 'performance insights from a trace are not available; performance_start_trace already returns the summary (navigation timing, LCP, CLS, long tasks, largest resources).',
  take_memory_snapshot: 'heap snapshots are not available through the extension. Use browser_get_deep_diagnostics (technical slot, «diagnose» package).',
});

/** Extra aliassen bovenop DEVTOOLS_ALIASES van het oude /mcp (zelfde doelen). */
const EXTRA: Readonly<Record<string, { target: string; map: (a: Record<string, unknown>) => Record<string, unknown>; noot?: string }>> = Object.freeze({
  navigate_page_history: { target: 'browser_history', map: (a) => ({ browser: a.browser, action: a.navigate === 'forward' ? 'forward' : a.navigate === 'reload' ? 'reload' : 'back' }) },
  get_console_message: { target: 'browser_console', map: (a) => ({ browser: a.browser }) },
  get_network_request: { target: 'browser_network', map: (a) => ({ browser: a.browser }) },
  performance_start_trace: { target: 'browser_audit', map: (a) => ({ browser: a.browser, soort: 'prestaties' }), noot: 'Mijn Ruimte has no trace recorder: this is the performance audit of the current page (navigation timing, LCP, CLS, long tasks, largest resources).' },
  performance_stop_trace: { target: 'browser_audit', map: (a) => ({ browser: a.browser, soort: 'prestaties' }), noot: 'Mijn Ruimte has no trace recorder: this is the performance audit of the current page (navigation timing, LCP, CLS, long tasks, largest resources).' },
});

/**
 * Argumenten van chrome-devtools-mcp die een alias VERWERKT (rest = genegeerd, en dat staat eerlijk in het antwoord). 'browser' en
 * 'slot' zijn van ons. Zo merkt een agent dat bv. "fullPage" of "format" hier niets doet, in plaats van stil iets anders te krijgen.
 */
const VERWERKT: Readonly<Record<string, readonly string[]>> = Object.freeze({
  list_pages: [], select_page: ['pageId', 'pageIdx'], close_page: ['pageId', 'pageIdx'], new_page: ['url'], navigate_page: ['type', 'url'],
  navigate_page_history: ['navigate'], take_snapshot: [], take_screenshot: [], click: ['uid', 'name'], hover: ['uid', 'name'],
  fill: ['uid', 'name', 'value'], fill_form: ['elements'], press_key: ['key'], wait_for: ['text', 'timeout', 'timeout_seconds'],
  list_console_messages: ['types'], list_network_requests: ['failed_only'], get_console_message: [], get_network_request: [],
  evaluate_script: ['function', 'expression'], performance_start_trace: [], performance_stop_trace: [],
});
export function genegeerdeArgs(alias: string, args: Record<string, unknown>): string[] {
  const v = VERWERKT[alias] ?? [];
  return Object.keys(args ?? {}).filter((k) => k !== 'browser' && k !== 'slot' && !v.includes(k)).sort();
}

/** Alle devtools-namen die wij kennen (ondersteund + bewust niet). */
export const DEVTOOLS_NAMEN: readonly string[] = Object.freeze([...Object.keys(DEVTOOLS_ALIASES), ...Object.keys(EXTRA), ...Object.keys(DEVTOOLS_NIET)].sort());
export const DEVTOOLS_ONDERSTEUND: readonly string[] = Object.freeze([...Object.keys(DEVTOOLS_ALIASES), ...Object.keys(EXTRA)].sort());

const SUFFIX = /^(.*?)(?:_(gebruiker|beheer))$/;
/** Ontleed een alias-naam: kale naam, met _gebruiker/_beheer, of volledige v2-vorm. null = geen devtools-naam. */
export function ontleedDevtools(naam: string, agent: AgentSlug): { alias: string; kant: Kant | null } | null {
  const n = String(naam || '');
  const vol = new RegExp(`^(.*?)_${agent}_mcp_tarasevych_com_(gebruiker|beheer)$`).exec(n);
  if (vol && isDevtools(vol[1])) return { alias: vol[1], kant: vol[2] as Kant };
  const m = SUFFIX.exec(n);
  if (m && isDevtools(m[1])) return { alias: m[1], kant: m[2] as Kant };
  if (isDevtools(n)) return { alias: n, kant: null };
  return null;
}
const isDevtools = (s: string) => Object.prototype.hasOwnProperty.call(DEVTOOLS_ALIASES, s) || Object.prototype.hasOwnProperty.call(EXTRA, s) || Object.prototype.hasOwnProperty.call(DEVTOOLS_NIET, s);

/** Intern hulpmiddel + omgezette argumenten voor een ondersteunde alias. */
export function vertaalDevtools(alias: string, args: Record<string, unknown>): { intern: string; args: Record<string, unknown>; noot?: string } | null {
  if (Object.prototype.hasOwnProperty.call(EXTRA, alias)) { const e = EXTRA[alias]; return { intern: e.target, args: schoon(e.map(args)), ...(e.noot ? { noot: e.noot } : {}) }; }
  if (Object.prototype.hasOwnProperty.call(DEVTOOLS_ALIASES, alias)) { const r = resolveAlias(alias, args); return { intern: r.name, args: schoon(r.args as Record<string, unknown>) }; }
  return null;
}
const schoon = (a: Record<string, unknown>) => { const uit: Record<string, unknown> = {}; for (const [k, v] of Object.entries(a ?? {})) if (v !== undefined && k !== 'slot' && k !== '__target') uit[k] = v; return uit; };

/** De v2-optie die een intern browserhulpmiddel aan deze kant aanbiedt. */
export const optieVoorIntern = (intern: string, kant: Kant): V2Optie | undefined => V2_OPTIES.find((o) => o.intern === intern && o.kant === kant && o.status === 'actief');

export type DevtoolsUitkomst =
  | { soort: 'doorsturen'; naam: string; args: Record<string, unknown>; noot?: string; kant: Kant; automatisch: boolean }
  | { soort: 'weigeren'; bericht: string };

/**
 * Beslis wat een devtools-naam hier betekent. `levend` = de levende ruimte van de mens (technisch of prive); `toegestaan` = sleutels
 * `${id}:${kant}` die de mens deze koppeling gaf. Nooit zelf uitvoeren: het antwoord is een v2-naam die door v2Roep gaat (alle poorten).
 */
export function devtoolsBeslissing(naam: string, args: Record<string, unknown>, agent: AgentSlug, levend: AiRuimte, toegestaan: ReadonlySet<string>): DevtoolsUitkomst | null {
  const p = ontleedDevtools(naam, agent);
  if (!p) return null;
  if (Object.prototype.hasOwnProperty.call(DEVTOOLS_NIET, p.alias)) {
    return { soort: 'weigeren', bericht: `NOT_SUPPORTED: "${p.alias}" — ${DEVTOOLS_NIET[p.alias]} Supported chrome-devtools-mcp names here: ${DEVTOOLS_ONDERSTEUND.join(', ')}.` };
  }
  // evaluate_script met element-argumenten (uids als parameters van de functie) kan de extensie niet doorgeven: eerlijk weigeren.
  if (p.alias === 'evaluate_script' && Array.isArray(args.args) && args.args.length) {
    return { soort: 'weigeren', bericht: 'NOT_SUPPORTED: evaluate_script with element "args" is not available here. Query the element inside the function instead (for example document.querySelector(…)), and call evaluate_script without "args".' };
  }
  const v = vertaalDevtools(p.alias, args);
  if (!v) return { soort: 'weigeren', bericht: `UNKNOWN_TOOL: "${p.alias}" is not a tool of this connector. Use tools/list.` };
  const genegeerd = genegeerdeArgs(p.alias, args);
  if (genegeerd.length) v.noot = `${v.noot ? `${v.noot} ` : ''}Ignored arguments (not supported by Mijn Ruimte): ${genegeerd.join(', ')}.`;
  // slot: expliciet (_beheer/_gebruiker of args.slot), anders technisch als dat leeft én is toegestaan, anders privé
  const gevraagd = p.kant ?? (args.slot === 'technisch' ? 'beheer' : args.slot === 'prive' ? 'gebruiker' : null);
  const idBeheer = optieVoorIntern(v.intern, 'beheer'), idGebr = optieVoorIntern(v.intern, 'gebruiker');
  const kant: Kant = gevraagd ?? (levend === 'technisch' && idBeheer && toegestaan.has(idBeheer.key) ? 'beheer' : 'gebruiker');
  const optie = kant === 'beheer' ? idBeheer : idGebr;
  if (!optie) {
    return { soort: 'weigeren', bericht: kant === 'gebruiker' && idBeheer
      ? `EXTENSIE_RUIMTE: "${p.alias}" exists only in the TECHNICAL slot (evaluate_script runs scripts in the user's session). Call it as "${p.alias}_beheer" with the technical profile active, and ask the user to tick «Scripts» at ${BROWSER_BEHEER_PAD_EN}.`
      : `UNKNOWN_TOOL: "${p.alias}" has no ${kant} counterpart in this connector. Use tools/list.` };
  }
  return { soort: 'doorsturen', naam: toolNaam(optie, agent), args: v.args, ...(v.noot ? { noot: v.noot } : {}), kant, automatisch: gevraagd === null };
}

/** Extra uitleg bij een weigering na een AUTOMATISCH gekozen slot: zo weet de agent hoe hij het andere slot kiest. */
export function slotHint(kant: Kant): string {
  return kant === 'beheer'
    ? 'This call went to the TECHNICAL slot because the technical side is active now. To act on the user\'s own tabs, call it again with "slot": "prive" (or the name ending in _gebruiker).'
    : 'This call went to the PRIVATE slot. For a tab in the technical profile, call it with "slot": "technisch" (or the name ending in _beheer) while the technical profile is active.';
}

/** Tooldefinities van de ondersteunde devtools-namen (kale naam, één keer) voor tools/list als de mens «devtools-namen» aanzette. */
// 12.11.2026 (MCP-R0): de aliasdefinities kwamen ONvertaald in tools/list — `description` van parameters (browserProp, uidProp …)
// was een object {uk, nl} (p(…)). Claude weigert zo'n schema («properties/browser/description must be string») en liet 15
// hulpmiddelen (click, fill, take_snapshot …) weg. Nu gaat elke definitie door vertaalHulpmiddel/vertaalSchema in de taal van de mens.
const DEVTOOLS_NOOT: Readonly<Record<ToolTaal, string>> = Object.freeze({
  uk: '(назва як у chrome-devtools-mcp; той самий інструмент і ті самі межі, що й у Mijn Ruimte. Необов\'язково "slot": "prive" | "technisch".)',
  nl: '(naam zoals in chrome-devtools-mcp; hetzelfde hulpmiddel met dezelfde grenzen als in Mijn Ruimte. Optioneel "slot": "prive" | "technisch".)',
});

export function devtoolsDefinities(zichtbaarIntern: ReadonlySet<string>, taal: ToolTaal = 'uk', kant: Kant = 'gebruiker'): ToolDef[] {
  const uit: ToolDef[] = [];
  for (const [, a] of Object.entries(DEVTOOLS_ALIASES)) {
    if (!zichtbaarIntern.has(a.target)) continue;
    const v = vertaalHulpmiddel(a.def, taal, { kant });
    uit.push({ ...v, inputSchema: vertaalSchema(v.inputSchema, taal), description: `${v.description} ${DEVTOOLS_NOOT[taal]}`, annotations: a.ann } as ToolDef);
  }
  for (const [alias, e] of Object.entries(EXTRA)) {
    if (!zichtbaarIntern.has(e.target)) continue;
    uit.push({ name: alias, description: `chrome-devtools-mcp name for the Mijn Ruimte tool ${e.target}.${e.noot ? ` ${e.noot}` : ''}`, inputSchema: { type: 'object', properties: { browser: { type: 'string' }, slot: { type: 'string', enum: ['prive', 'technisch'] }, navigate: { type: 'string', enum: ['back', 'forward', 'reload'] } }, additionalProperties: true }, annotations: { readOnlyHint: e.target !== 'browser_history' } } as ToolDef);
  }
  return uit;
}

/** Interne browserhulpmiddelen die de catalogus per kant aanbiedt (voor de gelijkheidstest en de documentatie). */
export const browserInternPerKant = (kant: Kant): string[] => V2_OPTIES.filter((o) => o.groep === 'browser' && o.kant === kant && o.status === 'actief' && o.intern).map((o) => o.intern as string).sort();
