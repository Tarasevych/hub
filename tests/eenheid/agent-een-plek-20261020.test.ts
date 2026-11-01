// Eenheidstest 20.10.2026 — «Підключення ШІ досі відображає стару адресу… бардак: не зрозуміло, що де. Треба, щоб в одній
// вкладці було управління одним із ШІ: підключення, дозволи, токени, спосіб зв'язку» (opdracht van de eigenaar).
//
// DEEL 1 — de oude adres. Op 20.10.2026 kreeg elke agent zijn eigen pad (/claude, /gpt, /grok, /gemini, /copilot, /cursor;
//   shared/connector-v2/agenten.ts). Het scherm «Підключити ШІ» bouwde zijn adres echter nog zelf uit `${origin}/mcp` en toonde
//   daarom voor Grok het oude gedeelde adres. Hier: het adres komt overal uit agentUrl(), het oude adres bestaat nog maar één
//   keer, als BENOEMDE constante met uitleg (OUD_GEDEELD_URL, waar de 308 naartoe wijst), en nergens meer als letterlijke tekst.
// DEEL 2 — één ШІ, één plek: #agent/<slug> met podkljutsjennja, dozvoly, prostir, spôsob zv'jazku + tokens, kolir en het
//   journaal van juist die agent; de algemene tabbladen doen datzelfde niet nog eens.
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { checker } from './hulp/nep-google';
import { MCP_BASIS, OUD_GEDEELD_URL, V2_AGENTEN, agentUrl, oudAgentUrl } from '../../shared/connector-v2/agenten';

const lees = (p: string) => readFileSync(p, 'utf8');
const ORIGIN = 'https://mcp.tarasevych.com';
/** Minimale nagebootste browser: genoeg om de hub-module (hash, opslag, tabcontext) in node te importeren. */
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(`${ORIGIN}/agents#connectors`);
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const doc = {
    hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } },
  };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}
/** Alle bronbestanden van de koppelschermen (daar hoort geen adres meer met de hand in te staan). */
function schermen(): string[] {
  const uit: string[] = [];
  for (const map of ['src/agenten', 'src/connector-v2']) for (const n of readdirSync(map)) if (/\.(ts|tsx)$/.test(n)) uit.push(`${map}/${n}`);
  return [...uit, 'src/McpDienstWeergave.tsx', 'src/McpConnectorPaneel.tsx', 'src/mcp-catalogus.ts'];
}

export async function main(): Promise<number> {
  const { check, einde } = checker('agent-een-plek-20261020');

  // ================================================================ DEEL 1: één adres per agent
  check('elke agent heeft zijn eigen korte adres, nooit /mcp',
    V2_AGENTEN.every((a) => agentUrl(a.slug) === `${MCP_BASIS}/${a.slug}`) && !V2_AGENTEN.some((a) => agentUrl(a.slug).endsWith('/mcp')));
  check('het oude gedeelde adres bestaat nog, maar alleen als benoemde constante', OUD_GEDEELD_URL === `${MCP_BASIS}/mcp`);

  const kaal: string[] = [];
  for (const f of schermen()) {
    const t = lees(f);
    if (t.includes(`${MCP_BASIS}/mcp`) || /\$\{origin\}\/mcp/.test(t) || /['"`]https:\/\/mcp\.[^'"`]*\/mcp['"`]/.test(t)) kaal.push(f);
  }
  check('geen enkel koppelscherm bouwt nog zelf het adres /mcp', !kaal.length, kaal.join(', '));
  const bronnen = lees('shared/connector-v2/agenten.ts');
  check('de letterlijke tekst «/mcp» staat alleen nog in de ene benoemde constante', /OUD_GEDEELD_URL = `\$\{MCP_BASIS\}\/mcp`/.test(bronnen));

  const { adressen } = await import('../../src/agenten/een-klik');
  check('«в один клік» gebruikt het adres van de gekozen agent', V2_AGENTEN.every((a) => adressen({ soort: 'connector', agent: a.slug }, MCP_BASIS).endpoint === agentUrl(a.slug)));
  check('zonder bekende agent («Інший клієнт») valt het terug op het oude gedeelde adres, bewust en benoemd',
    adressen({ soort: 'connector', agent: null }, MCP_BASIS).endpoint === OUD_GEDEELD_URL);
  check('de serverdeur blijft wat ze was (/Grok en de andere deuren)', adressen({ soort: 'deur', deur: 'Grok' }, MCP_BASIS).endpoint === `${MCP_BASIS}/Grok`);

  const verbinden = lees('src/agenten/AiVerbinden.tsx');
  check('«Підключити ШІ» kiest het adres via de agent van de klant (agentVoorKlant → agentUrl), niet via een eigen tekst',
    verbinden.includes('agentVoorKlant(klant)') && verbinden.includes("{ soort: 'connector', agent: slug }"));
  check('het scherm legt eerlijk uit dat de oude adressen met 308 hierheen leiden', verbinden.includes('308') && verbinden.includes('oudAgentUrl(slug)'));
  check('het oude agentpad bestaat nog voor de uitleg', oudAgentUrl('grok') === `${MCP_BASIS}/ai/grok`);
  check('het bord «Способи підключення ШІ» toont het adres van die ene AI', lees('src/agenten/AgentBord.tsx').includes('bordAdres(gekozen.id'));
  check('de MCP-dienstpagina toont een adres per agent in plaats van één gedeeld adres',
    lees('src/McpDienstWeergave.tsx').includes('V2_AGENTEN.map') && lees('src/McpDienstWeergave.tsx').includes('agentUrl(a.slug)'));

  // ================================================================ DEEL 2: één ШІ — одна вкладка
  const herstel = nepBrowser();
  const hub = await import('../../src/agenten/AgentenPagina').finally(() => undefined);
  check('de tabrij blijft onveranderd (de agentplek is geen elfde knop)', hub.TABS.join() === 'overzicht,connectors,ai,extern,orch,extensie,browser,apparaten,tokens,toegang,technisch,journaal' && !hub.zichtbareTabs(true).includes('agent'));
  check('#agent/<slug> is een echte plek met een eigen adres', V2_AGENTEN.every((a) => { const p = hub.leesHash(`#agent/${a.slug}`); return p.tab === 'agent' && p.item === a.slug && hub.agentUitPlek(p.tab, p.item) === a.slug; }));
  check('een onzinnige agent in de hash levert geen pagina op (dan blijft het bij de connectorlijst)', hub.agentUitPlek('agent', 'onzin') === null && hub.agentUitPlek('tokens', 'grok') === null);

  const pagina = lees('src/agenten/AgentPagina.tsx');
  const delen: Array<[string, string]> = [['verbinding', 'підключення'], ['rechten', 'дозволи'], ['ruimte', 'простір'], ['verbinding-soort', 'спосіб зв’язку'], ['tokens', 'токени'], ['kleur', 'колір'], ['journaal', 'журнал']];
  const mist = delen.filter(([d]) => !pagina.includes(`data-agent-sectie='${d}'`)).map(([, uk]) => uk);
  check('de plek van één agent heeft alle zes onderdelen bij elkaar', !mist.length, mist.join(', '));
  check('het adres op die plek komt uit agentUrl(slug)', pagina.includes('const adres = agentUrl(slug)') && pagina.includes("data-agent-adres={slug}"));
  check('de rechtenkiezer en de koppelknoppen zijn HERGEBRUIKT van «Конектори», geen tweede kopie', pagina.includes('AgentInstellingen') && pagina.includes("from '../connector-v2/ConnectorsTab'"));
  check('tokens en spôsob zv’jazku zijn vastgezet op deze ene agent', pagina.includes('vastKlant={info.klant}'));
  check('het journaal is gefilterd op juist deze agent', pagina.includes('agentVanItem(e) === slug'));
  check('de kleur komt uit de ene lijst AgentKleuren (geen eigen palet op deze pagina)',
    pagina.includes("import AgentKleuren from './AgentKleuren'") && !pagina.includes('ACCENT_KLEUREN'));
  check('de hub rendert die plek en linkt ernaartoe vanaf het overzicht',
    lees('src/agenten/AgentenPagina.tsx').includes('<AgentPagina') && lees('src/agenten/AgentenPagina.tsx').includes('data-agent-ingang={a.slug}'));

  // ------------------------------------------------------------------ geen dubbel beheer in de algemene tabbladen
  const connectors = lees('src/connector-v2/ConnectorsTab.tsx');
  check('«Конектори» is de LIJST: het instellen van één agent staat daar niet nog een tweede keer',
    !connectors.includes('<AgentInstellingen') && connectors.includes('href={`#agent/${a.slug}`}'));
  check('de instellingenvorm wordt wél geëxporteerd, zodat er maar één bestaat', /export function AgentInstellingen/.test(connectors));
  check('«Токени» voor alle AI\'s samen kiest nog wél zelf de AI; met een vaste agent verdwijnt die rij',
    lees('src/agenten/TabTokens.tsx').includes('vastKlant={vastKlant}') && verbinden.includes('{vastKlant ? null : <div'));

  herstel();
  return einde();
}
