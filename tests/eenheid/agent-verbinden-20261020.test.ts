// Eenheidstest 20.10.2026 — «підключення та налаштування всіх ШІ-агентів пропало», «Агенти досі не інтегровано?», «логотипи псевдо»,
// «про ШІ шукають у розділі ШІ» (klacht van de eigenaar na 173704).
//
// Oorzaak: de pagina van één agent (#agent/<slug>) had geen grote knop «Підключити» en geen stappen voor juist die client; de stand
// telde alleen v2-koppelingen, zodat Claude — verbonden via de serverdeur (tunnelregel /claude → 8091) en via het oude /mcp — als
// «не підключено» stond; admin → Доступ ШІ zei «немає підключень» / «політику ще не встановлено» zonder de agenten te tonen.
// Hier: per slug een adres, een actueel recept (zonder /mcp, zonder /ai/, zonder «plak een token» waar OAuth bestaat), een deeplink
// waar de maker die echt heeft, een eerlijke grens waar niet, de WARE stand (v2 + erfenis + deur) en logo's uit het ene register.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { checker } from './hulp/nep-google';
import { MCP_BASIS, OUD_GEDEELD_URL, V2_AGENTEN, agentUrl, oudAgentUrl, type AgentSlug } from '../../shared/connector-v2/agenten';
import { levendeKanten, SOORT_TEKST, standVan, zichtbareSleutels } from '../../shared/connector-v2/stand';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { base64, claudeCodeOpdracht, cursorDeeplink, geminiCliConfig, heeftEenKlik, mcpJsonConfig, recept, SERVER_NAAM, vscodeDeeplink, CLAUDE_CONNECTORS_URL, CHATGPT_CONNECTORS_URL, CHATGPT_GEAVANCEERD_URL } from '../../src/agenten/verbind-recepten';

const lees = (p: string) => readFileSync(p, 'utf8');
const SLUGS = V2_AGENTEN.map((a) => a.slug);
const ORIGIN = 'https://mcp.tarasevych.com';
/** Minimale nagebootste browser (zelfde als agent-een-plek): genoeg om src/agenten/gegevens.ts in node te importeren. */
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL(`${ORIGIN}/agents#agent/claude`);
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

export async function main(): Promise<number> {
  const { check, einde } = checker('agent-verbinden-20261020');

  // ================================================================ 1. elke slug: adres + actueel recept
  for (const slug of SLUGS) {
    const r = recept(slug);
    // Deeplinks dragen het adres url-gecodeerd; decoderen zodat «noemt het eigen adres» ook voor Cursor en VS Code klopt.
    const alles = decodeURIComponent(JSON.stringify(r));
    check(`${slug}: het recept noemt het eigen adres en nooit een oud pad`,
      alles.includes(agentUrl(slug)) && !alles.includes(OUD_GEDEELD_URL) && !alles.includes(oudAgentUrl(slug)) && !/\/ai\/[a-z]+/.test(alles) && !/mcp\.tarasevych\.com\/mcp\b/.test(alles));
    check(`${slug}: er zijn stappen in uk én nl, en elke knop heeft een tweetalig opschrift`,
      r.stappen.length >= 3 && r.stappen.every(([uk, nl]) => uk.length > 10 && nl.length > 10 && uk !== nl) && r.knoppen.every((k) => k.label[0] && k.label[1] && (k.href || k.kopieer)));
    check(`${slug}: geen «plak een token» waar OAuth bestaat`, !/вставте токен|plak het token|Bearer/i.test(r.stappen.map((s) => s.join(' ')).join(' ')) || slug === 'grok');
  }

  // ================================================================ 2. de echte «één klik» van de maker
  const cur = cursorDeeplink('cursor');
  check('Cursor: officiële deeplink cursor://anysphere.cursor-deeplink/mcp/install met name en base64 config', cur.startsWith('cursor://anysphere.cursor-deeplink/mcp/install?name=') && cur.includes(`name=${SERVER_NAAM}`) && cur.includes('&config='));
  const curConfig = JSON.parse(Buffer.from(decodeURIComponent(cur.split('&config=')[1]), 'base64').toString('utf8'));
  check('Cursor: de base64 config bevat precies het adres van /cursor', curConfig.url === agentUrl('cursor') && base64('{"a":1}') === Buffer.from('{"a":1}').toString('base64'));
  const vs = vscodeDeeplink('copilot');
  check('VS Code/Copilot: vscode:mcp/install?<json> met name, type http en het adres van /copilot', vs.startsWith('vscode:mcp/install?') && JSON.parse(decodeURIComponent(vs.slice('vscode:mcp/install?'.length))).url === agentUrl('copilot') && JSON.parse(decodeURIComponent(vs.slice('vscode:mcp/install?'.length))).type === 'http' && vscodeDeeplink('copilot', true).startsWith('vscode-insiders:mcp/install?'));
  check('Claude Code: claude mcp add --transport http <naam> <url>', claudeCodeOpdracht('claude') === `claude mcp add --transport http ${SERVER_NAAM} ${MCP_BASIS}/claude`);
  check('Claude: hoofdknop opent Settings → Connectors (geen oude claude.ai/code#customize meer), tweede knop kopieert de Claude Code-opdracht',
    recept('claude').knoppen[0].href === CLAUDE_CONNECTORS_URL && CLAUDE_CONNECTORS_URL === 'https://claude.ai/settings/connectors' && recept('claude').knoppen[1].kopieer === claudeCodeOpdracht('claude') && !lees('src/agenten/TabAi.tsx').includes('claude.ai/code#customize') && !lees('shared/ai-agent-bord.ts').includes('claude.ai/code#customize'));
  check('Claude: de stappen zeggen dat client-id/secret leeg blijven (Dynamic Client Registration)', /client id \/ secret лишіть порожніми/.test(recept('claude').stappen[0][0]) && /leeg laten/.test(recept('claude').stappen[0][1]));
  // 25.10.2026 (blok 1, 8.1/8.3): OpenAI noemt het menu nu «Settings → Apps»; Developer mode onder Advanced settings, dan «Create app»
  // (alleen zichtbaar in Developer mode), OAuth via dynamic client registration, de app kiezen in het menu of noemen in de vraag.
  // De deeplinks zijn die uit de handleiding van OpenAI zelf (#settings/Connectors en #settings/Connectors/Advanced), niet verzonnen.
  const gpt = recept('gpt');
  check('ChatGPT: één grote knop Settings → Apps (#settings/Connectors, zoals de handleiding van OpenAI hem linkt)',
    gpt.knoppen.length === 1 && gpt.knoppen[0].soort === 'web' && gpt.knoppen[0].href === CHATGPT_CONNECTORS_URL && CHATGPT_CONNECTORS_URL === 'https://chatgpt.com/#settings/Connectors'
    && /Settings → Apps/.test(gpt.knoppen[0].label[0]) && /Settings → Apps/.test(gpt.knoppen[0].label[1]) && /мобільних застосунках/.test(gpt.knoppen[0].uitleg?.[0] ?? '') && /mobiele ChatGPT-apps/.test(gpt.knoppen[0].uitleg?.[1] ?? ''));
  check('ChatGPT: stap 1 = Settings → Apps → Advanced settings → «Developer mode» met het directe adres (#settings/Connectors/Advanced), uk en nl; geen oud «Connectors → Advanced»',
    gpt.stappen[0].every((s) => /Settings → Apps → Advanced settings → «Developer mode»/.test(s) && s.includes(CHATGPT_GEAVANCEERD_URL)) && CHATGPT_GEAVANCEERD_URL === 'https://chatgpt.com/#settings/Connectors/Advanced' && !/Connectors → Advanced/.test(JSON.stringify(gpt)));
  check('ChatGPT: stap 2 = «Create app» naast Advanced settings, het adres van /gpt, OAuth, geen client-id/secret (dynamic client registration)',
    gpt.stappen[1].every((s) => s.includes('«Create app»') && s.includes('Advanced settings') && s.includes(agentUrl('gpt')) && /OAuth/.test(s) && /dynamic client registration/.test(s)) && /Client id \/ secret не потрібні/.test(gpt.stappen[1][0]) && /Geen client-id \/ secret nodig/.test(gpt.stappen[1][1]));
  check('ChatGPT: daarna de app in een nieuw gesprek kiezen in het menu met hulpmiddelen of noemen in de vraag',
    /меню інструментів/.test(gpt.stappen[3][0]) && /назвіть його в запиті/.test(gpt.stappen[3][0]) && /menu met hulpmiddelen/.test(gpt.stappen[3][1]) && /noem hem/.test(gpt.stappen[3][1]));
  check('ChatGPT: eerlijk over de plannen (uk + nl) — web, Pro/Plus/Business/Enterprise/Education, schrijven bèta voor Business en Enterprise/Edu, Pro alleen lezen, op Plus/Pro werkt schrijven mogelijk niet, niet in de mobiele apps',
    /Pro, Plus, Business, Enterprise або Education/.test(gpt.vereist?.[0] ?? '') && /бета лише для Business і Enterprise\/Edu/.test(gpt.vereist?.[0] ?? '') && /Pro підключає MCP лише з правами читання/.test(gpt.vereist?.[0] ?? '') && /на Plus\/Pro .* можуть не працювати/.test(gpt.vereist?.[0] ?? '') && /мобільних застосунках/.test(gpt.vereist?.[0] ?? '')
    && /Pro, Plus, Business, Enterprise of Education/.test(gpt.vereist?.[1] ?? '') && /bèta voor alleen Business en Enterprise\/Edu/.test(gpt.vereist?.[1] ?? '') && /Pro koppelt MCP alleen met leesrechten/.test(gpt.vereist?.[1] ?? '') && /Op Plus\/Pro .* mogelijk niet/.test(gpt.vereist?.[1] ?? '') && /mobiele ChatGPT-apps/.test(gpt.vereist?.[1] ?? ''));
  const gptKort = V2_AGENTEN.find((a) => a.slug === 'gpt')!;
  check('ChatGPT (korte regel, shared): Settings → Apps → Advanced settings → Developer mode, «Create app», en de grens voor schrijven op Plus/Pro',
    [gptKort.uk, gptKort.nl].every((s) => /Settings → Apps → Advanced settings → Developer mode/.test(s) && s.includes('«Create app»') && /OAuth/.test(s) && /Plus\/Pro/.test(s) && !/Connectors → Advanced/.test(s)));
  check('Gemini: eerlijk — geen knop «open Gemini», wel settings.json voor Gemini CLI met httpUrl',
    !recept('gemini').knoppen.some((k) => k.soort === 'web' || k.soort === 'deeplink') && !!recept('gemini').grens && JSON.parse(geminiCliConfig('gemini')).mcpServers[SERVER_NAAM].httpUrl === agentUrl('gemini') && /2026/.test(recept('gemini').grens![0]));
  check('Grok: eerlijk — geen verzonnen vendorknop, wel mcp.json en de grens benoemd',
    !recept('grok').knoppen.some((k) => k.soort === 'web' || k.soort === 'deeplink') && !!recept('grok').grens && JSON.parse(mcpJsonConfig('grok')).mcpServers[SERVER_NAAM].url === agentUrl('grok'));
  check('heeftEenKlik: Cursor, Copilot en Claude (opdracht) wel; ChatGPT, Gemini en Grok niet',
    heeftEenKlik('cursor') && heeftEenKlik('copilot') && heeftEenKlik('claude') && !heeftEenKlik('gpt') && !heeftEenKlik('gemini') && !heeftEenKlik('grok'));

  // ================================================================ 3. de WARE stand: v2 + erfenis + deur
  check('stand: v2-koppeling → verbonden, niet oud', standVan({ v2: 1, erfenis: 0, deur: 0 }).code === 'v2' && standVan({ v2: 1, erfenis: 0, deur: 0 }).verbonden && !standVan({ v2: 1, erfenis: 0, deur: 0 }).alleenOud);
  check('stand: alleen het oude /mcp → verbonden via erfenis, alleenOud', standVan({ v2: 0, erfenis: 2, deur: 0 }).code === 'erfenis' && standVan({ v2: 0, erfenis: 2, deur: 0 }).verbonden && standVan({ v2: 0, erfenis: 2, deur: 0 }).alleenOud);
  check('stand: alleen de serverdeur → «стара дорога — перепідключіть»', standVan({ v2: 0, erfenis: 0, deur: 1 }).code === 'deur' && /стара дорога/.test(standVan({ v2: 0, erfenis: 0, deur: 1 }).uk) && /перепідключіть/.test(standVan({ v2: 0, erfenis: 0, deur: 1 }).uk) && /oude weg/.test(standVan({ v2: 0, erfenis: 0, deur: 1 }).nl));
  check('stand: deur onbekend (null) telt niet als nul-bewering; niets → «не підключено»', standVan({ v2: 0, erfenis: 0, deur: null }).code === 'geen' && standVan({ v2: 0, erfenis: 0, deur: null }).uk === 'не підключено' && standVan({ v2: 0, erfenis: 0, deur: 0 }).totaal === 0);
  check('stand: wacht op opnieuw verbinden gaat voor', standVan({ v2: 1, erfenis: 0, deur: 0, wacht: true }).code === 'wacht');
  check('SOORT_TEKST: erfenis en deur zijn «oud», v2 niet, allemaal uk+nl', SOORT_TEKST.v2.oud === false && SOORT_TEKST.erfenis.oud && SOORT_TEKST.deur.oud && Object.values(SOORT_TEKST).every((s) => s.uk && s.nl && s.uk !== s.nl));
  const priveKey = V2_OPTIES.find((o) => o.status === 'actief' && o.kant === 'gebruiker')!.key;
  const beheerKey = V2_OPTIES.find((o) => o.status === 'actief' && o.kant === 'beheer')!.key;
  check('zichtbareSleutels: de beheerkant bestaat alleen in de technische ruimte; privé altijd',
    zichtbareSleutels([priveKey, beheerKey], ['gebruiker', 'beheer'], 'prive').join() === priveKey && zichtbareSleutels([priveKey, beheerKey], ['gebruiker', 'beheer'], 'technisch').length === 2 && zichtbareSleutels([priveKey, beheerKey, 'onzin:gebruiker'], ['gebruiker'], 'technisch').join() === priveKey);
  check('levendeKanten: beheer valt weg buiten de technische ruimte', levendeKanten(['gebruiker', 'beheer'], 'prive').join() === 'gebruiker' && levendeKanten(['gebruiker', 'beheer'], 'technisch').join() === 'gebruiker,beheer');

  // ------------------------------------------------------------------ server: het overzicht draagt erfenis, deur en de levende poort
  const be = lees('backend/connector-v2.ts');
  check('server: overzicht telt erfenis (oudeGrantsVoor), de serverdeur (deurPerSlug) en de levende poort (aiPoortNu) mee',
    /oudeGrantsVoor\(userId, slug\)/.test(be) && /deurPerSlug\(userId\)/.test(be) && /const poort = await aiPoortNu\(userId\)/.test(be) && /export async function agentStanden/.test(be));
  check('server: de deur is «onbekend» (null) als ze niet antwoordt — nooit een fout, nooit nul beweren', /catch \{ return null; \}/.test(be.slice(be.indexOf('async function deurPerSlug'), be.indexOf('export type AgentStandServer'))));
  check('server: oudeGrantsVoor filtert op de klant van die agent', /export async function oudeGrantsVoor/.test(lees('backend/connector-v2-erfenis.ts')) && /klantVan\(g\.clientName\) === klant/.test(lees('backend/connector-v2-erfenis.ts')));
  check('admin → Доступ ШІ krijgt dezelfde stand (ai-beleid/overzicht → agenten via agentStanden)', /agenten: await agentStand\(eigenaar\.id\)/.test(lees('backend/ai-beleid.ts')) && /import\('\.\/connector-v2'\)/.test(lees('backend/ai-beleid.ts')));

  // ================================================================ 4. de pagina van één agent
  const pagina = lees('src/agenten/AgentPagina.tsx');
  check('de pagina begint met «Підключити <ШІ>» (AgentVerbinden) vóór de rechten', pagina.includes('<AgentVerbinden tr={tr} slug={slug} />') && pagina.indexOf("data-agent-sectie='verbinding'") < pagina.indexOf("data-agent-sectie='rechten'"));
  check('de stand op de pagina is de WARE stand (standVanAgent: v2 + erfenis + deur) en de lijst toont elke weg', pagina.includes('standVanAgent(stand)') && pagina.includes("data-agent-verbinding={r.soort}") && pagina.includes("data-agent-oud-pad='1'"));
  check('de ruimte toont toegestaan én levend (data-agent-levend, data-agent-poort)', pagina.includes('data-agent-levend={levend.join') && pagina.includes('data-agent-poort=') && pagina.includes('levendeKanten(kanten, ruimteNu)'));
  check('het directe token is ingeklapt en benoemd als de weg voor clients zonder OAuth', /<details open=\{actieveTokens > 0\}>/.test(pagina) && /без входу через браузер/.test(pagina));
  const verbinden = lees('src/agenten/AgentVerbinden.tsx');
  check('AgentVerbinden: de hoofdknop is groot (ag-verbind-groot), deeplinks zijn gewone <a href> (geen JavaScript-omweg)', verbinden.includes('ag-verbind-groot') && verbinden.includes("data-verbind-hoofd={hoofd ? '1' : '0'}") && verbinden.includes('href={k.href}'));
  check('AgentVerbinden: de grens en de vereisten staan op de pagina (eerlijk)', verbinden.includes("data-verbind-grens='1'") && verbinden.includes("data-verbind-vereist='1'"));
  const connectors = lees('src/connector-v2/ConnectorsTab.tsx');
  check('«Конектори»: de kaart gebruikt dezelfde ware stand (standVanAgent) en markeert de oude weg (is-oud)', connectors.includes('export const standVanAgent') && connectors.includes('standVanAgent(a)') && connectors.includes("'is-oud'"));
  const overzichtBron = lees('src/agenten/AgentenPagina.tsx');
  check('«Огляд»: de ingangen per AI tonen de ware stand', overzichtBron.includes('useV2Overzicht') && overzichtBron.includes('data-agent-ingang-stand='));

  // ================================================================ 5. admin → Доступ ШІ: stand per agent, link naar #agent/<slug>, geen eigen tekenblok
  const admin = lees('src/BeheerAiBeleidWeergave.tsx');
  check('admin /ai toont de stand per agent (AgentStandLijst) óók zonder beleid (niet-ingesteld/ongeldig)',
    admin.includes('<AgentStandLijst') && (admin.match(/\{standBlok\}/g) || []).length === 3 && admin.indexOf("data-aib-staat='niet-ingesteld'>{kop}{standBlok}") > 0);
  check('admin /ai linkt naar de plek van de agent in de hub en dupliceert de instellingen niet', admin.includes("#agent/${slug}") && admin.includes('data-aiz-naar-agent=') && !admin.includes('AgentInstellingen') && !admin.includes('RechtenKiezer'));
  check('admin /ai: geen eigen monogram meer (hashHue weg) — onbekende agent gaat door <Merk>', !admin.includes('hashHue') && admin.includes("import Merk from './merk/Merk'") && admin.includes('<Merk merk={id || naam}'));
  const lijst = lees('src/agenten/AgentStandLijst.tsx');
  check('AgentStandLijst: toont v2/erfenis/deur-stand, levende kant, hulpmiddelen nu, laatste actie en de link', lijst.includes('standVan({ v2: a.v2, erfenis: a.erfenis, deur: a.deur, wacht: a.wacht })') && lijst.includes('a.hulpmiddelen') && lijst.includes("data-aiz-naar-agent={a.slug}") && lijst.includes('a.levend.includes(k)'));

  // ================================================================ 6. logo's uit het ene register (src/merk)
  const herstel = nepBrowser();
  const { aiLogo, aiEigenaar } = await import('../../src/agenten/gegevens').finally(() => undefined);
  check('aiLogo: Gemini en Copilot krijgen hun merk, geen pseudo-logo (aiclient) meer', aiLogo('Gemini') === 'gemini' && aiLogo('GitHub Copilot') === 'copilot' && aiLogo('Claude Code') === 'claude' && aiLogo('ChatGPT') === 'openai' && aiLogo('ноутбук Олени') === 'aiclient');
  check('aiEigenaar kent alle zes makers', ['Claude', 'ChatGPT', 'Grok', 'Gemini', 'Copilot', 'Cursor'].every((n) => aiEigenaar(n).length > 2));
  herstel();
  const { merkSleutel } = await import('../../src/merk/merk-register');
  const tabel = lees('src/merk/merk-tabel.ts');
  check('elke agent-slug heeft een vorm in het ene register (merk-tabel.ts)', SLUGS.every((s) => new RegExp(`^  ${merkSleutel(s)}:`, 'm').test(tabel)));
  const bronnen = ['src/agenten/AgentPagina.tsx', 'src/agenten/AgentVerbinden.tsx', 'src/agenten/AgentStandLijst.tsx', 'src/agenten/AgentenPagina.tsx', 'src/agenten/TabAi.tsx', 'src/connector-v2/ConnectorsTab.tsx', 'src/McpDienstWeergave.tsx', 'src/BeheerAiBeleidWeergave.tsx', 'src/agenten-gegevens.ts', 'src/mcp-catalogus.ts', 'src/agenten/AgentBord.tsx'];
  const vuil = bronnen.filter((f) => { const t = lees(f); return /🤖/.test(t) || /logo: ''/.test(t) || /linear-gradient\(140deg,hsl/.test(t); });
  check('geen emoji-, lege of hsl-monogramlogo\'s meer in de agentschermen', !vuil.length, vuil.join(', '));
  check('mcp.* «Підключити»: logo per agent uit het register en de weg naar #agent/<slug>; de kaart «Bearer plakken» is weg',
    lees('src/McpDienstWeergave.tsx').includes('<AgentLogo agent={a.slug}') && lees('src/McpDienstWeergave.tsx').includes('#agent/${a.slug}') && !lees('src/McpDienstWeergave.tsx').includes('bearerSample'));

  // ================================================================ 7. navigatie: alles over AI in het AI-deel, met een directe weg naar #agent/<slug>
  check('ai.*/agents heeft directe ingangen per AI naar de hub (#agent/<slug>)', lees('src/AIDienstWeergave.tsx').includes("hubUrl(`agent/${a.slug}`)") && lees('src/AIDienstWeergave.tsx').includes("data-ai-agent-ingangen='1'"));
  check('«Підключені ШІ» (hub #ai) en het bord linken naar de plek van de agent', lees('src/agenten/TabAi.tsx').includes("href={`#agent/${a.slug}`}") && lees('src/agenten/AgentBord.tsx').includes("data-knop='agent-pagina'"));
  const uitleg = V2_AGENTEN.map((a) => `${a.uk} ${a.nl}`).join(' ');
  check('de korte uitleg per agent (shared) noemt geen Customize-pad, geen /mcp en geen /ai/ meer', !/Customize/.test(uitleg) && !/\/mcp\b/.test(uitleg) && !/\/ai\//.test(uitleg) && V2_AGENTEN.every((a) => a.uk !== a.nl));

  return einde();
}
