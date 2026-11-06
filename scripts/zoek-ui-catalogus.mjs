// ZOEKEN — CATALOGUS VAN DE INTERFACE, GEGENEREERD UIT DE BRON (22.10.2026, zone Z2).
//
// Leest src/**/*.tsx en haalt daaruit de ECHTE knoppen, koppen en dialogen met hun tweetalige tekst (uk + nl), met de plek
// waar ze leven (dienst › pagina › sectie) en wie ze mag zien (iedereen / technisch profiel). Niets wordt met de hand
// overgeschreven: verandert een knop in de bron, dan verandert de catalogus bij de volgende `npm run build`.
//
// Uitvoer: shared/zoek-ui-knoppen.generated.ts (deterministisch, gesorteerd). De eenheidstest
// tests/eenheid/zoek-bronnen-20261022.test.ts genereert opnieuw en vergelijkt: een verouderd bestand = rode test.
//
// Gebruik: node scripts/zoek-ui-catalogus.mjs            (schrijft het bestand)
//          node scripts/zoek-ui-catalogus.mjs --controle  (exit 1 als het bestand niet actueel is)
//          import { genereer } from './zoek-ui-catalogus.mjs' (test)
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';

export const UITVOER = 'shared/zoek-ui-knoppen.generated.ts';

/** Bestand (prefix, zonder «src/») → waar het op de site leeft. Eerste match wint; wat hier niet staat wordt overgeslagen. */
export const PLEKKEN = [
  // ---- persoonlijk (iedereen)
  ['mail/', 'mail', 'inbox', 'iedereen'], ['afzenders/', 'mail', 'contacts', 'iedereen'],
  ['MailAccountsHub', 'mail', 'accounts', 'iedereen'], ['MailAbonnementenWeergave', 'mail', 'subscriptions', 'iedereen'],
  ['MailInstellingen', 'mail', 'settings', 'iedereen'], ['MailSnelleInstellingen', 'mail', 'settings', 'iedereen'],
  ['MailRijSnelleActieInstellingen', 'mail', 'settings', 'iedereen'], ['Mail', 'mail', 'inbox', 'iedereen'], ['GoogleMailWerkruimte', 'mail', 'inbox', 'iedereen'],
  ['agenda/', 'cloud', 'calendar', 'iedereen'], ['media/', 'cloud', 'photos', 'iedereen'], ['GoogleSuiteMediaWeergave', 'cloud', 'photos', 'iedereen'],
  ['DriveBrowser', 'cloud', 'accounts', 'iedereen'], ['CloudFunctioneelWeergave', 'cloud', 'overview', 'iedereen'],
  ['GitHubWeergave', 'github', 'overview', 'iedereen'],
  ['zoek/ZoekIndex', 'hub', 'zoek', 'technisch'] /* zone D 22.10.2026: indexvenster = technisch profiel (ook de «?»-uitleg zoek.index.*) */, ['zoek/', 'hub', 'zoek', 'iedereen'], ['GlobaalZoekPaneel', 'hub', 'zoek', 'iedereen'],
  ['HubNotities', 'hub', 'notes', 'iedereen'], ['HubRecent', 'hub', 'recent', 'iedereen'], ['HubBlokWidget', 'hub', 'overview', 'iedereen'],
  ['bureau/', 'hub', 'overview', 'iedereen'], ['WelkomKaart', 'hub', 'overview', 'iedereen'],
  // Технічні сповіщення: кнопка є лише в технічній смузі (TechLaag → actief && activatie), а не у звичайному дзвонику.
  ['meldingen/TechMeldingen', 'hub', 'overview', 'technisch'],
  ['meldingen/', 'hub', 'overview', 'iedereen'], ['CanoniekMeldingencentrum', 'hub', 'overview', 'iedereen'], ['MeldingenpaneelInhoud', 'hub', 'overview', 'iedereen'],
  ['CanoniekAccountMenu', 'hub', 'overview', 'iedereen'], ['CanoniekOmlijsting', 'hub', 'overview', 'iedereen'], ['ZijbalkWerkbalk', 'hub', 'overview', 'iedereen'],
  ['RuimteStrook', 'hub', 'overview', 'iedereen'], ['ExtensieUpdateBand', 'hub', 'overview', 'iedereen'], ['CanoniekVerbindingBand', 'hub', 'overview', 'iedereen'],
  ['DomoticaWeergave', 'huis', 'overview', 'iedereen'],
  ['thema/', 'identity', 'themes', 'iedereen'], ['weergave/', 'identity', 'personalization', 'iedereen'], ['instellingen/', 'identity', 'account', 'iedereen'],
  ['ZijbalkInstellingen', 'identity', 'menu', 'iedereen'], ['MenuAanpasser', 'identity', 'menu', 'iedereen'], ['MenuIndelingInstellingen', 'identity', 'menu', 'iedereen'],
  ['MenuInstellingenVenster', 'identity', 'menu', 'iedereen'], ['MenuItemActies', 'identity', 'menu', 'iedereen'], ['MenuMeldingen', 'identity', 'menu', 'iedereen'],
  ['SnelleToegangBewerker', 'identity', 'menu', 'iedereen'], ['InstellingencentrumWeergave', 'identity', 'personalization', 'iedereen'],
  ['sessies/', 'identity', 'sessions', 'iedereen'], ['SessiesOverzicht', 'identity', 'sessions', 'iedereen'], ['BeveiligingSessiesPaneel', 'identity', 'sessions', 'iedereen'],
  ['ToegangslaagWeergave', 'identity', 'methods', 'iedereen'], ['toegangslaag-panelen', 'identity', 'methods', 'iedereen'], ['SleutelkluisSectie', 'identity', 'methods', 'iedereen'],
  ['HerstelcodesSectie', 'identity', 'recovery', 'iedereen'], ['ToegangssleutelsSectie', 'identity', 'methods', 'iedereen'], ['Toegangscodes', 'identity', 'security', 'iedereen'], ['geheim/', 'identity', 'security', 'iedereen'],
  ['AIDienstWeergave', 'ai', 'workspace', 'iedereen'], ['AiWerkruimte', 'ai', 'workspace', 'iedereen'],
  ['agenten/TabOrch', 'mcp', 'agents', 'technisch'] /* ORCH-001: «Координація» — alleen eigenaar op mcp.* */,
  // «Підключення ШІ» (hub, 19.10.2026) leeft op mcp.*/agents (McpDienstWeergave → McpAgentsHub, voor iedereen). ai.*/agents toont
  // alleen een verwijzing erheen (AIDienstWeergave → AiOnderdeel); tot 05.11.2026 stuurde de catalogus 160+ elementen daarheen.
  // Twee delen van agenten/ leven NIET in de hub maar in de beheerconsole (BeheerAiBeleidWeergave → admin/ai, ook in UitrolMeester).
  ['agenten/AgentStandLijst', 'admin', 'ai', 'technisch'], ['agenten/NamensSessies', 'admin', 'ai', 'technisch'],
  // Het tabblad «Технічне» van de hub toont deze alleen met een ACTIEF technisch profiel (TabTechnisch → techActief).
  ['agenten/RuimteScheiding', 'mcp', 'agents', 'technisch'], ['agenten/TechVerbindingen', 'mcp', 'agents', 'technisch'],
  ['agenten/SiteSchakelaars', 'mcp', 'agents', 'technisch'],
  ['agenten/', 'mcp', 'agents', 'iedereen'], ['connector-v2/', 'mcp', 'agents', 'iedereen'], ['ai-bevestiging/', 'mcp', 'agents', 'iedereen'],
  ['extensie/', 'mcp', 'agents', 'iedereen'], ['McpAgentenHub', 'mcp', 'agents', 'iedereen'], ['McpConnectorPaneel', 'mcp', 'agents', 'iedereen'],
  // McpToestemmingVenster (ZOEKDIEP-001): verschijnt alleen met ?consent=<id> van een lopende OAuth-aanvraag van een AI — geen plek
  // waar de zoeker heen kan. Niet in de catalogus.
  ['AgentenPaneel', 'mcp', 'agents', 'iedereen'], ['AgentInrichtingWizard', 'mcp', 'agents', 'iedereen'],
  ['AiToestemmingen', 'mcp', 'agents', 'iedereen'], ['BrowserExtensiePaneel', 'mcp', 'agents', 'iedereen'], ['ExtensieWizard', 'mcp', 'agents', 'iedereen'],
  ['ApparatenWeergave', 'mcp', 'agents', 'iedereen'],
  // ---- technisch profiel: de band (TechLaag) zelf mag wie een profiel heeft; wat erachter zit alleen met een actieve activering
  ['tech/', 'hub', 'overview', 'profiel'], ['ssh/', 'hub', 'overview', 'technisch'], ['terminal/', 'mcp', 'dashboard', 'technisch'],
  ['extern/', 'hub', 'overview', 'technisch'], ['vlaggen/', 'hub', 'overview', 'technisch'],
  // ---- sitebeheer (alleen technisch)
  ['BeheerConsoleWeergave', 'admin', 'overview', 'technisch'], ['BeheerOverzichtWeergave', 'admin', 'overview', 'technisch'], ['overzicht/', 'admin', 'overview', 'technisch'] /* Dashboard → BeheerOverzichtWeergave; tot 05.11.2026 per vergissing hub/iedereen */,
  // IdentiteitBeheerWeergave (ZOEKDIEP-001): VerenigdDienstApp toont hem alleen als terugval NA alle diensten (identity, admin … keren
  // eerder terug) — op geen enkele pagina te zien. Verzoeken en gebruikers staan in de beheerconsole (BeheerConsoleWeergave → admin/access).
  ['BeheerSleutelsWeergave', 'admin', 'contour', 'technisch'], ['geheimen/', 'admin', 'contour', 'technisch'], ['BeheerAiBeleidWeergave', 'admin', 'ai', 'technisch'],
  ['BeheerUitrolWeergave', 'admin', 'updates', 'technisch'], ['UitrolMeester', 'admin', 'updates', 'technisch'], ['uitrol/', 'admin', 'updates', 'technisch'],
  ['BeheerDiagnostiekWeergave', 'admin', 'diagnostics', 'technisch'], ['diagnostiek/', 'admin', 'diagnostics', 'technisch'], ['diagnose/', 'admin', 'diagnostics', 'technisch'],
  ['audit/', 'admin', 'audit', 'technisch'], ['integraties/', 'admin', 'directories', 'technisch'], ['merk/', 'admin', 'directories', 'technisch'],
  ['impersonatie/', 'admin', 'access', 'technisch'], ['ondersteuning/', 'admin', 'access', 'technisch'], ['beveiliging/', 'admin', 'access', 'technisch'],
  ['ApiPlatformWeergave', 'api', 'access', 'technisch'], ['KluisMeta', 'api', 'vault', 'technisch'],
  ['McpDienstWeergave', 'mcp', 'dashboard', 'technisch'], ['McpAppsWeergave', 'mcp', 'apps', 'technisch'], ['McpBackupsKaart', 'mcp', 'download', 'technisch'] /* alleen op download (McpDienstWeergave) */,
  ['McpServerBeheerKaart', 'mcp', 'dashboard', 'technisch'], ['McpHulpmiddelenPaneel', 'mcp', 'tools', 'technisch'], ['mcp-ui', 'mcp', 'dashboard', 'technisch'],
  ['ServerKoppelen', 'mcp', 'apps', 'technisch'] /* McpAppsWeergave → «Підключити цей сервер»; mcp/connect stuurt door naar agents */,
];

/**
 * ZOEKDIEP-001 (05.11.2026): het ONDERDEEL van een pagina met hash-adres. De hub «Підключення ШІ» (mcp/agents) is één lange pagina
 * met luie secties (#overzicht, #ai, #extensie …; src/agenten/agenten-hash.ts) en de plek van één AI (#agent/<slug>, AgentPagina):
 * zonder hash landde de zoeker bovenaan en zag het element niet (een luie sectie wordt pas gerenderd als zij in beeld komt; de plek
 * van één AI zelfs helemaal niet). admin/directories kiest zijn onderdeel uit #catalogus|#mijn|#mappen|#wizard (Integraties.tsx).
 * [bestandsprefix (zonder «src/»), dienst, tabblad (null = elk), hash]. Eerste match wint; een eigen hash van het element wint altijd.
 * AgentPagina toont voor elke AI dezelfde elementen; de zoeker gaat naar de eerste AI van de lijst (Claude).
 */
export const HASH_REGELS = [
  ['agenten/TabOrch', 'mcp', 'agents', 'orch'],
  ['agenten/RuimteScheiding', 'mcp', 'agents', 'technisch'], ['agenten/TechVerbindingen', 'mcp', 'agents', 'technisch'],
  ['agenten/SiteSchakelaars', 'mcp', 'agents', 'technisch'], ['agenten/DeurVerbindingen', 'mcp', 'agents', 'technisch'], ['agenten/TabTechnisch', 'mcp', 'agents', 'technisch'],
  ['agenten/TabAi', 'mcp', 'agents', 'ai'], ['agenten/AgentBord', 'mcp', 'agents', 'ai'], ['agenten/AiToegangTab', 'mcp', 'agents', 'ai'],
  ['agenten/TabExternMcp', 'mcp', 'agents', 'extern'],
  ['agenten/TabExtensie', 'mcp', 'agents', 'extensie'], ['agenten/AgentKleuren', 'mcp', 'agents', 'extensie'], ['extensie/BrowserEnAgenten', 'mcp', 'agents', 'browser'],
  ['extensie/', 'mcp', 'agents', 'extensie'], ['BrowserExtensiePaneel', 'mcp', 'agents', 'extensie'], ['ExtensieWizard', 'mcp', 'agents', 'extensie'],
  ['agenten/TabApparaten', 'mcp', 'agents', 'apparaten'], ['ApparatenWeergave', 'mcp', 'agents', 'apparaten'], ['AgentInrichtingWizard', 'mcp', 'agents', 'apparaten'],
  ['agenten/TabTokens', 'mcp', 'agents', 'tokens'], ['agenten/AiVerbinden', 'mcp', 'agents', 'tokens'],
  ['agenten/TabToegang', 'mcp', 'agents', 'toegang'], ['agenten/Journaal', 'mcp', 'agents', 'journaal'], ['agenten/HubMatrix', 'mcp', 'agents', 'overzicht'],
  ['ai-bevestiging/', 'mcp', 'agents', 'overzicht'], ['connector-v2/', 'mcp', 'agents', 'connectors'],
  ['agenten/AgentPagina', 'mcp', 'agents', 'agent/claude'], ['agenten/AgentVerbinden', 'mcp', 'agents', 'agent/claude'],
  ['BeheerConsoleWeergave', 'admin', 'directories', 'mappen'],
  ['integraties/Wizard', 'admin', 'directories', 'wizard'], ['integraties/CatalogusV2', 'admin', 'directories', 'catalogus'], ['integraties/Detail', 'admin', 'directories', 'catalogus'],
];
/** Componenten die zowel in een privé-sectie als in «Технічне» (#technisch, TechVerbindingen) staan: hun technische tak hoort daar. */
const TECHNISCHE_TAK = ['agenten/AiVerbinden', 'agenten/AiToegangTab'];
export function hashVan(bestand, dienst, tab, toegang = 'iedereen') {
  const rel = bestand.replace(/^src\//, '');
  if (toegang === 'technisch' && dienst === 'mcp' && tab === 'agents' && TECHNISCHE_TAK.some((p) => rel.startsWith(p))) return 'technisch';
  for (const [prefix, d, t, h] of HASH_REGELS) if (rel.startsWith(prefix) && d === dienst && (t === null || t === tab)) return h;
  return '';
}

/**
 * ZOEKDIEP-001: toegang per ELEMENT. Tot nu toe gold de toegang van het bestand (PLEKKEN): in agenten/TabExtensie.tsx en
 * agenten/AiVerbinden.tsx staan blokken die alleen met een technisch profiel verschijnen (`techProfiel ? …`, `technisch ? … : …`,
 * `techActief(…) && …`), maar ook gebruikers zonder profiel kregen ze als zoekresultaat. Nu: staat het element in de «ja»-tak van zo'n
 * voorwaarde (niet ontkend), dan is zijn toegang minstens 'profiel' (techProfiel) of 'technisch' (actief technisch profiel / ruimte).
 */
const PROFIEL_VOORWAARDE = /\btechProfiel\b|\bheeftTechProfiel\b/;
const TECHNISCH_VOORWAARDE = /\btechActief\b|\btechAan\b|\btechnisch\b|===\s*'technisch'/;
const TOEGANG_RANG = { iedereen: 0, profiel: 1, technisch: 2 };
export const strengsteToegang = (a, b) => (TOEGANG_RANG[a] >= TOEGANG_RANG[b] ? a : b);
export function toegangVoor(src) {
  if (!PROFIEL_VOORWAARDE.test(src) && !TECHNISCH_VOORWAARDE.test(src)) return () => 'iedereen';
  const sf = ts.createSourceFile('/toegang.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const gebieden = [];   // { van, tot, toegang }
  const soortVan = (c) => {
    const t = c.getText(sf).trim();
    if (/^!/.test(t)) return '';
    return TECHNISCH_VOORWAARDE.test(t) ? 'technisch' : PROFIEL_VOORWAARDE.test(t) ? 'profiel' : '';
  };
  const zoek = (n) => {
    if (ts.isConditionalExpression(n)) { const s = soortVan(n.condition); if (s) gebieden.push({ van: n.whenTrue.getStart(sf), tot: n.whenTrue.end, toegang: s }); }
    else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) { const s = soortVan(n.left); if (s) gebieden.push({ van: n.right.getStart(sf), tot: n.right.end, toegang: s }); }
    else if (ts.isIfStatement(n)) { const s = soortVan(n.expression); if (s) gebieden.push({ van: n.thenStatement.getStart(sf), tot: n.thenStatement.end, toegang: s }); }
    ts.forEachChild(n, zoek);
  };
  zoek(sf);
  return (i) => gebieden.reduce((acc, g) => (g.van <= i && i < g.tot ? strengsteToegang(acc, g.toegang) : acc), 'iedereen');
}

const PAAR = String.raw`(?:tr|t|text|txt|vertaal)\(\s*(?:(?:p\.)?lang\s*,\s*|taal\s*,\s*)?(['"])((?:(?!\1)[^\\\n]|\\.){2,140})\1\s*,\s*(['"])((?:(?!\3)[^\\\n]|\\.){2,140})\3\s*\)`;
const TERNAIR = String.raw`(?:(?:p\.)?lang|taal)\s*===\s*'uk'\s*\?\s*'((?:[^'\\\n]|\\.){2,140})'\s*:\s*'((?:[^'\\\n]|\\.){2,140})'`;
const PAAR_RE = new RegExp(PAAR, 'g');
const TERNAIR_RE = new RegExp(TERNAIR, 'g');

/** Knoppen zonder eigen betekenis (elk venster heeft ze): niet vindbaar, anders verdringen ze echte functies. */
const GENERIEK = new Set(['закрити', 'скасувати', 'так', 'ні', 'гаразд', 'добре', 'назад', 'далі', 'готово', 'ок', 'зрозуміло', 'відміна', 'закрити вікно', 'сховати', 'показати', 'ще', 'менше', 'більше']);
const schoon = (s) => String(s || '').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();
/** Eerste tweetalige tekst in een stuk bron; null als er geen letterlijk paar in staat (variabelen slaan we over). */
function eerstePaar(stuk) {
  PAAR_RE.lastIndex = 0; TERNAIR_RE.lastIndex = 0;
  const a = PAAR_RE.exec(stuk), b = TERNAIR_RE.exec(stuk);
  const kandidaten = [a && { i: a.index, uk: a[2], nl: a[4] }, b && { i: b.index, uk: b[1], nl: b[2] }].filter(Boolean).sort((x, y) => x.i - y.i);
  if (!kandidaten.length) return null;
  const { uk, nl } = kandidaten[0];
  const u = schoon(uk), n = schoon(nl);
  // Geen teksten met sjabloonvariabelen, geen pure cijfers/tekens, en de twee talen moeten verschillen of een eigennaam zijn.
  if (!u || !n || /\$\{/.test(u) || /\$\{/.test(n) || !/\p{L}{2}/u.test(u)) return null;
  return { uk: u, nl: n };
}

/** Positie van de sluitende «>» van een openingstag vanaf `van` (accolades in attributen tellen mee). */
function tagEinde(src, van) {
  let diepte = 0, q = '';
  for (let i = van; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === q && src[i - 1] !== '\\') q = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') diepte++; else if (c === '}') diepte--;
    else if (c === '>' && diepte === 0) return i;
  }
  return -1;
}
function attribuut(tag, naam) {
  const m = new RegExp(`\\b${naam}=(?:\\{([\\s\\S]*?)\\}(?=\\s|/|>|$)|'([^']*)'|"([^"]*)")`).exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
}
const sluit = (src, van, naam) => { const i = src.indexOf(`</${naam}>`, van); return i < 0 ? src.length : i; };

/**
 * Alle koppen (h1-h3) met positie en BEREIK: een knop hoort bij de laatste kop ervoor waarvan het bereik hem bevat.
 * Bereik = de JSX-boom waarin de kop staat: omhoog zolang de ouder een JSX-element of -fragment is (dus tot aan `return (…)`,
 * `cond && (…)`, `c ? (…) : (…)`, `const x = (…)` of `{ … }`). Wat daarin na de kop staat, wordt samen met de kop getoond — ook in
 * een zustercontainer (`<header><h2/></header><div><button/></div>`) of binnen `{open && …}` / `.map(…)` in die boom.
 * Vroeger (tot 05.11.2026) gold «de laatste kop ervoor in het bestand», ook uit een andere component of uit een tak die nooit samen
 * met de knop zichtbaar is: in GoogleMailWerkruimte.tsx kregen 21 knoppen van de inbox de sectie «Підключені Google-акаунти» (een
 * kop in de tak mode==='accounts'), in CloudFunctioneelWeergave.tsx kreeg «Вийти з фокусу» (werkruimten) «Зберегти без
 * організації» (vastleggen), in MeldingenV2.tsx kregen de meldingen «Правила сповіщень» (de kop wisselt met de toestand).
 * Liever geen sectie dan een verkeerde: het pad op de zoekkaart is dan «dienst › pagina».
 * Een kop waarvan de tekst met de toestand wisselt (`{paneel==='regels' ? t('Правила…') : t('Сповіщення')}` of `{x && t(…)}`) is
 * wel zelf vindbaar, maar geen sectie voor knoppen: welke tekst erboven staat, hangt af van de toestand. Is zo'n kop de laatste
 * kop vóór de knop, dan krijgt de knop GEEN sectie (en niet de kop daarvoor, die bij een vorig blok hoort).
 */
/** Elementen die een eigen blok met een eigen kop vormen: een kop daarbinnen geldt niet voor knoppen erbuiten. */
const BLOK_TAGS = new Set(['section', 'article', 'aside', 'fieldset', 'details', 'form', 'li', 'footer', 'nav', 'dialog']);
function koppen(src) {
  const kopKnopen = new Map();   // begin van een <h1-3>-element → { knoop, boomEinde }
  const sf = ts.createSourceFile('/koppen.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  // Een kop geldt tot het einde van zijn BLOK: het dichtstbijzijnde omsluitende section/article/aside/fieldset/details/form/li/
  // footer/nav/dialog (of role='dialog'); zonder zo'n blok tot het einde van de JSX-boom. Na de onafhankelijke controle
  // (05.11.2026): «Перевірити відправника вручну» in de voet van AfzenderDialoog kreeg de kop van een gesloten <section> erboven.
  const isBlok = (el) => {
    if (!ts.isJsxElement(el)) return false;
    const o = el.openingElement;
    if (BLOK_TAGS.has(o.tagName.getText(sf))) return true;
    return o.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === 'role' && !!a.initializer && ts.isStringLiteral(a.initializer) && a.initializer.text === 'dialog');
  };
  const zoek = (n) => {
    if (ts.isJsxElement(n) && /^h[123]$/.test(n.openingElement.tagName.getText(sf))) {
      let c = n;
      while (c.parent && (ts.isJsxElement(c.parent) || ts.isJsxFragment(c.parent))) { c = c.parent; if (isBlok(c)) break; }
      kopKnopen.set(n.getStart(sf), { knoop: n, boomEinde: c.end });
    }
    ts.forEachChild(n, zoek);
  };
  zoek(sf);
  // `lang === 'uk' ? 'A' : 'B'` is een vertaling, geen wisselende tekst
  const isTaalKeuze = (n) => ts.isConditionalExpression(n) && /^(?:p\.)?(?:lang|taal)\s*===\s*['"]uk['"]$/.test(kaal(n.condition).getText(sf));
  /** Staat de tekst op positie `pos` binnen de kop onder een ?:, &&, || of ?? (de kop toont dan niet altijd die tekst)? */
  const wisselt = (kop, pos) => {
    let diepste = kop;
    const daal = (n) => { if (n.getStart(sf) <= pos && pos < n.end) { diepste = n; ts.forEachChild(n, daal); } };
    ts.forEachChild(kop, daal);
    for (let n = diepste; n && n !== kop; n = n.parent) {
      if (ts.isConditionalExpression(n) && !isTaalKeuze(n)) return true;
      if (ts.isBinaryExpression(n) && [SK.AmpersandAmpersandToken, SK.BarBarToken, SK.QuestionQuestionToken].includes(n.operatorToken.kind)) return true;
    }
    return false;
  };
  const uit = [];
  const re = /<(h[123])\b/g; let m;
  while ((m = re.exec(src))) {
    const e = tagEinde(src, m.index); if (e < 0) continue;
    // Geen echt JSX-element (bv. «<h2» in een tekst of commentaar): geen kop.
    const k = kopKnopen.get(m.index); if (!k) continue;
    const binnen = src.slice(e + 1, sluit(src, e, m[1]));
    const p = eerstePaar(binnen.slice(0, 600));
    if (!p) continue;
    PAAR_RE.lastIndex = 0; TERNAIR_RE.lastIndex = 0;
    const a = PAAR_RE.exec(binnen.slice(0, 600)), b = TERNAIR_RE.exec(binnen.slice(0, 600));
    const eerste = Math.min(a ? a.index : Infinity, b ? b.index : Infinity);
    uit.push({ i: m.index, tekstI: Number.isFinite(eerste) ? e + 1 + eerste : m.index, tot: k.boomEinde, wisselend: Number.isFinite(eerste) && wisselt(k.knoop, e + 1 + eerste), ...p });
  }
  return uit;
}

// ---- Tabblad van een element: uit de STRUCTUUR van de bron (TypeScript-syntaxisboom), niet uit nabije tekst.
// Vroeger (tot 05.11.2026) gold «de laatste `tab==='x'` in de 1500 tekens vóór het element». Fouten daarvan:
//   1. een lange tak verloor zijn tabblad: in InstellingencentrumWeergave.tsx staat «Підтвердити видалення» 1503 tekens na
//      `p.tab==='account'` (sinds 3b58702) — de catalogus stuurde de zoeker naar «Персоналізація», waar die knop niet bestaat;
//   2. een element NA een afgesloten tak erfde diens tabblad (`if (tab==='accounts') return …;` en daarna de gewone weergave);
//   3. `else`-takken, `!==`, `switch (tab)` en eigen componenten (`{tab==='research' && <SearchCard/>}`) zag het niet.
// Nu: voor elke plek in het bestand rekent de generator uit welke tabbladen daar nog MOGELIJK zijn.
//   • Voorwaarden worden per tabblad v geëvalueerd (waar / onwaar / onbekend). Ook de WAARDE van een uitdrukking per tabblad telt:
//     `tab` → v, een letterlijke tekst, `c ? 'a' : tab`, `[…].includes(tab)`, en `const`-namen daarvan. Zo werken ook
//     `const effectiveTab = ['google', …].includes(tab) ? 'accounts' : tab` + `effectiveTab === 'search'` (cloud) en
//     `const section = […].includes(tab) ? tab : 'overview'` + `section === 'board'` (mcp).
//   • `if`/`else`, `? :`, `&&`/`||`, vroege `return`/`throw` (ook in een `if … else` waarvan één kant altijd verlaat) en
//     `switch (<uitdrukking met bekende waarde>)` vernauwen de verzameling. Een case-tak die met `break`/`return`/`throw`
//     eindigt valt NIET door; alleen een tak zonder zo'n einde (bv. een lege) valt door naar de volgende.
//   • Functiedeclaraties worden gehesen: ze hangen af van waar ze gebruikt worden, niet van een `return` erboven.
//   • Namen worden opgelost zoals TypeScript dat doet (checker per bestand): een `let`, `var`, `catch`-variabele, import of
//     parameter met dezelfde naam in een andere functie is een ANDERE naam (vroeger: zelfde tekst = zelfde naam).
//   • Alleen het tabblad van de PAGINA telt als `tab`: de prop `tab` van een geëxporteerde component (of van een component die op
//     elke plek `tab={…}` van de pagina krijgt) — niet `const [tab, setTab] = useState(…)`, `TABS.map((tab) => …)` of `item.tab`.
//   • Staat een element in een eigen component, hulpfunctie of JSX-variabele van hetzelfde bestand (ook `memo(function X …)`),
//     dan telt de verzameling op de plekken waar die gebruikt wordt (als JSX-tag of aanroep; een JSX-variabele: elke verwijzing,
//     en in een object `const pages = { sso, roles }` dat alleen als `pages[<uitdrukking>]` wordt gelezen: de tabbladen waarvoor
//     die uitdrukking de sleutel geeft). Gebruik binnen het eigen lichaam (recursie) telt niet: dat bereik je alleen via buiten.
// Blijft er precies één tabblad over, dan is dat de hint; anders geen hint, en de bestandsregel (PLEKKEN) geldt.
const SK = ts.SyntaxKind;
const ONBEKEND = 2;                  // derde waarde naast true/false
const ONB = Symbol('onbekend');      // onbekende tekstwaarde
const isTabNaam = (n) => (ts.isIdentifier(n) && n.text === 'tab') || (ts.isPropertyAccessExpression(n) && n.name.text === 'tab');
const isLetterlijk = (n) => !!n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n));
const isFunctie = (n) => !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n));
const bevatJsx = (n) => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n) || !!ts.forEachChild(n, (k) => bevatJsx(k) || undefined);
const zelfde = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const kaal = (n) => {
  while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isTypeAssertionExpression(n) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n)))) n = n.expression;
  return n;
};
/** Verlaat deze opdracht altijd de functie (return/throw, ook als laatste opdracht van een blok)? */
const verlaat = (st) => !!st && (ts.isReturnStatement(st) || ts.isThrowStatement(st) || (ts.isBlock(st) && verlaat(st.statements[st.statements.length - 1])));
/** Eindigt een case-tak zonder door te vallen (return/throw/break/continue, ook als laatste opdracht van een blok)? */
const sluitCaseAf = (st) => !!st && (ts.isReturnStatement(st) || ts.isThrowStatement(st) || ts.isBreakStatement(st) || ts.isContinueStatement(st) || (ts.isBlock(st) && sluitCaseAf(st.statements[st.statements.length - 1])));
const isDeclaratieNaam = (p, n) => p.name === n && (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p)
  || ts.isClassDeclaration(p) || ts.isClassExpression(p) || ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isImportEqualsDeclaration(p)
  || ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p)
  || ts.isEnumDeclaration(p) || ts.isEnumMember(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isTypeParameterDeclaration(p)
  || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isLabeledStatement(p));
const sleutelTekst = (naam) => (naam && (ts.isIdentifier(naam) || ts.isStringLiteral(naam) || ts.isNoSubstitutionTemplateLiteral(naam)) ? naam.text : null);

const CHECKER_OPTIES = { noLib: true, noResolve: true, types: [], jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest, noEmit: true };
/** Eén bestand met een eigen checker (alleen voor naamresolutie: geen lib, geen imports). */
function bronMetChecker(src) {
  const naam = '/bron.tsx';
  const sf = ts.createSourceFile(naam, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const host = {
    getSourceFile: (f) => (f === naam ? sf : undefined), writeFile: () => {}, getDefaultLibFileName: () => '/lib.d.ts', useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (f) => f, getCurrentDirectory: () => '/', getNewLine: () => '\n', fileExists: (f) => f === naam, readFile: (f) => (f === naam ? src : undefined),
  };
  return { sf, chk: ts.createProgram({ rootNames: [naam], options: CHECKER_OPTIES, host }).getTypeChecker() };
}

/** Leest één bestand: per plek de mogelijke tabbladen, plus eigen componenten/hulpfuncties/JSX-variabelen en hun gebruik. */
function tabStructuur(src, tabs) {
  const { sf, chk } = bronMetChecker(src);
  const ALLE = new Set(tabs);
  const symbolen = new Map();
  /** Het symbool van een naam (gecachet); bij `{ naam }` het symbool van de WAARDE, niet van de eigenschap. */
  const symVan = (n) => {
    if (symbolen.has(n)) return symbolen.get(n);
    const p = n.parent;
    const s = (p && ts.isShorthandPropertyAssignment(p) && p.name === n ? chk.getShorthandAssignmentValueSymbol(p) : chk.getSymbolAtLocation(n)) || null;
    symbolen.set(n, s);
    return s;
  };
  const bindingen = new Map();       // sleutel (symbool of eigenschapsknoop) → { van, tot, functie }
  const aliassen = new Map();        // const-symbool → initializer
  const objecten = new Map();        // const-symbool → ObjectLiteralExpression (`const pages = { … }`)
  const verwijzingen = new Map();    // sleutel → [{ i, alsTag, alsAanroep, object?: { sym, sleutel }, toegang?: uitdrukking }]
  const voegToe = (sleutel, g) => { const l = verwijzingen.get(sleutel) ?? []; l.push(g); verwijzingen.set(sleutel, l); };

  // 1a. declaraties
  const kandidaten = new Set();      // namen die het waard zijn om op te lossen
  const binding = (sleutel, lichaam, functie) => { if (sleutel && lichaam && !bindingen.has(sleutel)) bindingen.set(sleutel, { van: lichaam.getStart(sf), tot: lichaam.end, functie }); };
  const declaraties = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) { binding(symVan(n.name), n.body, true); kandidaten.add(n.name.text); }
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const s = symVan(n.name);
      const isConst = ts.isVariableDeclarationList(n.parent) && (n.parent.flags & ts.NodeFlags.Const) !== 0;
      if (s && isConst) { aliassen.set(s, n.initializer); kandidaten.add(n.name.text); }
      let init = kaal(n.initializer);
      // memo(…)/forwardRef(…) om een functie heen telt als die functie (andere aanroepen, zoals items.map(…), niet)
      if (ts.isCallExpression(init) && /^(?:React\.)?(?:memo|forwardRef)$/.test(init.expression.getText(sf)) && isFunctie(kaal(init.arguments[0]))) init = kaal(init.arguments[0]);
      if (isFunctie(init)) { binding(s, init.body, true); kandidaten.add(n.name.text); }
      else if (isConst && ts.isObjectLiteralExpression(init)) {
        objecten.set(s, init); kandidaten.add(n.name.text);
        // JSX direct als waarde van een eigenschap: verschijnt waar `pages[…]` die sleutel geeft
        for (const e of init.properties) if (ts.isPropertyAssignment(e) && sleutelTekst(e.name) !== null && !ts.isIdentifier(kaal(e.initializer)) && bevatJsx(e.initializer)) {
          binding(e, e.initializer, false);
          voegToe(e, { i: e.getStart(sf), alsTag: false, alsAanroep: false, object: { sym: s, sleutel: sleutelTekst(e.name) } });
        }
      } else if (bevatJsx(init)) { binding(s, init, false); kandidaten.add(n.name.text); }   // JSX als waarde: verschijnt waar de naam wordt gebruikt
    }
    ts.forEachChild(n, declaraties);
  };
  declaraties(sf);

  // 1b. verwijzingen (alleen naar namen die hierboven gedeclareerd zijn, opgelost via de checker)
  const verwijzingenZoeken = (n) => {
    if (ts.isIdentifier(n) && kandidaten.has(n.text)) {
      const p = n.parent;
      const isEigenschap = (ts.isPropertyAccessExpression(p) && p.name === n) || ts.isJsxAttribute(p) || ts.isJsxClosingElement(p) || (ts.isQualifiedName(p) && p.right === n);
      if (!isDeclaratieNaam(p, n) && !isEigenschap) {
        const s = symVan(n);
        if (s && (bindingen.has(s) || objecten.has(s))) {
          const alsTag = (ts.isJsxOpeningElement(p) || ts.isJsxSelfClosingElement(p)) && p.tagName === n;
          const alsAanroep = ts.isCallExpression(p) && p.expression === n;
          const g = { i: n.getStart(sf), alsTag, alsAanroep, ...(alsTag ? { knoop: p } : {}) };
          // waarde van een eigenschap in `const pages = { naam }` / `{ sleutel: naam }`
          const eig = ts.isShorthandPropertyAssignment(p) ? p : ts.isPropertyAssignment(p) && kaal(p.initializer) === n ? p : null;
          if (eig && ts.isObjectLiteralExpression(eig.parent) && sleutelTekst(eig.name) !== null) {
            for (const [os, obj] of objecten) if (obj === eig.parent) g.object = { sym: os, sleutel: sleutelTekst(eig.name) };
          }
          // lezen van `pages[<uitdrukking>]`
          if (ts.isElementAccessExpression(p) && p.expression === n) { g.toegang = p.argumentExpression; g.i = p.getStart(sf); }
          voegToe(s, g);
        }
      }
    }
    ts.forEachChild(n, verwijzingenZoeken);
  };
  verwijzingenZoeken(sf);

  // 1c. Welke `tab` is het tabblad van de PAGINA? (tweede rev'ju, 05.11.2026: vroeger telde elke naam `tab` en elke `x.tab`, ook
  //     `const [tab, setTab] = useState(…)`, `TABS.map((tab) => …)`, `item.tab` of de prop `tab` van een kindcomponent met een
  //     andere betekenis.) Alleen telt: de prop `tab` van een component (`function X({ tab })`, `(p) => p.tab`, `const { tab } = p`,
  //     `const tab = p.tab`), mits die component geëxporteerd is (de pagina; de app geeft het tabblad mee) of elke plek waar hij
  //     als JSX-tag staat hem `tab={<tabblad van de pagina>}` geeft. Een niet gedeclareerde `tab` (losse fragmenten) telt zoals vroeger.
  const geexporteerd = new Set();
  // memo(X) / forwardRef(X) / React.memo(X), ook genest of met `as T`: de component X zelf (na de onafhankelijke controle, 05.11.2026:
  // tot dan telde alleen `export default X`, niet `export default memo(X)`, `export const Y = memo(X)` of `export const Y = X`).
  const ontpak = (e) => {
    let x = kaal(e);
    while (x && ts.isCallExpression(x) && /^(?:React\.)?(?:memo|forwardRef)$/.test(x.expression.getText(sf)) && x.arguments.length) x = kaal(x.arguments[0]);
    return x;
  };
  const voegExportToe = (e) => { const x = ontpak(e); if (x && ts.isIdentifier(x)) { const s = symVan(x); if (s) geexporteerd.add(s); } };
  for (const st of sf.statements) {
    if (ts.isExportAssignment(st)) voegExportToe(st.expression);
    if (ts.isVariableStatement(st) && (ts.getCombinedModifierFlags(st.declarationList.declarations[0] ?? st) & ts.ModifierFlags.Export) !== 0) {
      for (const d of st.declarationList.declarations) if (d.initializer) voegExportToe(d.initializer);   // ook een alias: export const Y = X
    }
    if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const e of st.exportClause.elements) { const s = chk.getExportSpecifierLocalTargetSymbol(e); if (s) geexporteerd.add(s); }
    }
  }
  const metExport = (n) => (ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export) !== 0;
  const groot = (naam) => !!naam && ts.isIdentifier(naam) && /^[A-Z]/.test(naam.text);
  /** De component waarvan `param` de eerste parameter (de props) is: { sym, export } — of null (geen component, bv. een callback). */
  const componentVan = (param) => {
    const f = param.parent;
    if (!f || !(ts.isFunctionDeclaration(f) || ts.isArrowFunction(f) || ts.isFunctionExpression(f)) || f.parameters[0] !== param) return null;
    if (ts.isFunctionDeclaration(f)) {
      if (!f.name) return metExport(f) ? { sym: null, export: true } : null;   // export default function ({ tab }) …
      if (!groot(f.name)) return null;
      const sym = symVan(f.name);
      return { sym, export: metExport(f) || (!!sym && geexporteerd.has(sym)) };
    }
    const omhoog = (x) => { while (x && (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) || ts.isTypeAssertionExpression(x) || (ts.isSatisfiesExpression && ts.isSatisfiesExpression(x)))) x = x.parent; return x; };
    let p = omhoog(f.parent);
    while (p && ts.isCallExpression(p) && /^(?:React\.)?(?:memo|forwardRef)$/.test(p.expression.getText(sf)) && p.arguments[0] && ontpak(p.arguments[0]) === f) p = omhoog(p.parent);
    if (p && ts.isExportAssignment(p)) return { sym: null, export: true };
    if (p && ts.isVariableDeclaration(p) && groot(p.name)) {
      const sym = symVan(p.name);
      return { sym, export: metExport(p) || (!!sym && geexporteerd.has(sym)) };
    }
    return null;
  };
  const paginaComp = new Map();
  /** Krijgt deze component het tabblad van de pagina? Geëxporteerd: ja. Anders: alleen als ELK gebruik `<X tab={…pagina-tab…}/>` is. */
  const isPaginaComponent = (c) => {
    if (c.export) return true;
    if (!c.sym) return false;
    if (paginaComp.has(c.sym)) return paginaComp.get(c.sym);
    paginaComp.set(c.sym, false);   // kring: niet volgen
    const b = bindingen.get(c.sym);
    const gebruik = (verwijzingen.get(c.sym) ?? []).filter((g) => !(b && g.i >= b.van && g.i < b.tot));
    const ok = gebruik.length > 0 && gebruik.every((g) => {
      if (!g.alsTag || !g.knoop) return false;
      const attr = g.knoop.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === 'tab');
      const x = attr && attr.initializer && ts.isJsxExpression(attr.initializer) ? kaal(attr.initializer.expression) : null;
      return !!x && isPaginaTab(x);
    });
    paginaComp.set(c.sym, ok);
    return ok;
  };
  const declaratie = (n) => { const s = symVan(n); return s ? (s.valueDeclaration ?? s.declarations?.[0] ?? null) : undefined; };
  /** `p` in `p.tab`: de props van een pagina-component (parameter, of een gedestructureerde prop van een geëxporteerde component). */
  const isPropsObject = (x) => {
    if (!x || !ts.isIdentifier(x)) return false;
    const d = declaratie(x);
    if (!d) return true;   // niet gedeclareerd: zoals vroeger
    if (ts.isParameter(d) && ts.isIdentifier(d.name)) { const c = componentVan(d); return !!c && isPaginaComponent(c); }
    if (ts.isBindingElement(d) && ts.isObjectBindingPattern(d.parent) && ts.isParameter(d.parent.parent)) { const c = componentVan(d.parent.parent); return !!c && c.export; }
    return false;
  };
  const paginaTab = new Map();
  const isPaginaTab = (n) => {
    if (!isTabNaam(n)) return false;
    if (paginaTab.has(n)) return paginaTab.get(n);
    paginaTab.set(n, false);   // kring
    let uit = false;
    if (ts.isIdentifier(n)) {
      const d = declaratie(n);
      if (!d) uit = true;   // niet gedeclareerd (alleen in losse fragmenten): zoals vroeger
      else if (ts.isBindingElement(d) && ts.isObjectBindingPattern(d.parent) && ts.isParameter(d.parent.parent)) { const c = componentVan(d.parent.parent); uit = !!c && isPaginaComponent(c); }
      else if (ts.isBindingElement(d) && ts.isObjectBindingPattern(d.parent) && ts.isVariableDeclaration(d.parent.parent) && d.parent.parent.initializer) uit = isPropsObject(kaal(d.parent.parent.initializer));
      else if (ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.initializer && (d.parent.flags & ts.NodeFlags.Const)) uit = isPaginaTab(kaal(d.initializer));
    } else uit = isPropsObject(kaal(n.expression));
    paginaTab.set(n, uit);
    return uit;
  };

  // 2. evaluatie per tabblad v: voorwaarde (waar / onwaar / ONBEKEND) en tekstwaarde (tekst of ONB)
  const bezig = new Set();
  const viaAlias = (n, f, anders) => {
    const s = ts.isIdentifier(n) ? symVan(n) : null;
    if (!s || !aliassen.has(s) || bezig.has(s)) return anders;
    bezig.add(s);
    try { return f(aliassen.get(s)); } finally { bezig.delete(s); }
  };
  const lijstWaarde = (n) => {
    n = kaal(n);
    if (ts.isArrayLiteralExpression(n)) return n.elements.every(isLetterlijk) ? n.elements.map((e) => e.text) : null;
    return viaAlias(n, lijstWaarde, null);
  };
  const tekst = (n, v) => {
    n = kaal(n);
    if (!n) return ONB;
    if (isPaginaTab(n)) return v;
    if (isLetterlijk(n)) return n.text;
    if (ts.isConditionalExpression(n)) {
      const c = waarde(n.condition, v);
      if (c === true) return tekst(n.whenTrue, v);
      if (c === false) return tekst(n.whenFalse, v);
      const a = tekst(n.whenTrue, v), b = tekst(n.whenFalse, v);
      return a === b ? a : ONB;
    }
    if (ts.isBinaryExpression(n) && (n.operatorToken.kind === SK.BarBarToken || n.operatorToken.kind === SK.QuestionQuestionToken)) {
      const a = tekst(n.left, v);
      if (a === ONB) return ONB;
      return n.operatorToken.kind === SK.BarBarToken && a === '' ? tekst(n.right, v) : a;
    }
    return viaAlias(n, (init) => tekst(init, v), ONB);
  };
  const waarde = (n, v) => {
    n = kaal(n);
    if (!n) return ONBEKEND;
    if (ts.isPrefixUnaryExpression(n) && n.operator === SK.ExclamationToken) { const w = waarde(n.operand, v); return w === ONBEKEND ? ONBEKEND : !w; }
    if (n.kind === SK.TrueKeyword) return true;
    if (n.kind === SK.FalseKeyword) return false;
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (op === SK.AmpersandAmpersandToken || op === SK.BarBarToken) {
        const a = waarde(n.left, v), b = waarde(n.right, v);
        if (op === SK.AmpersandAmpersandToken) return a === false || b === false ? false : a === true && b === true ? true : ONBEKEND;
        return a === true || b === true ? true : a === false && b === false ? false : ONBEKEND;
      }
      const gelijk = op === SK.EqualsEqualsEqualsToken || op === SK.EqualsEqualsToken;
      const ongelijk = op === SK.ExclamationEqualsEqualsToken || op === SK.ExclamationEqualsToken;
      if (gelijk || ongelijk) {
        const a = tekst(n.left, v), b = tekst(n.right, v);
        return a === ONB || b === ONB ? ONBEKEND : gelijk ? a === b : a !== b;
      }
      return ONBEKEND;
    }
    // ['a', 'b'].includes(<uitdrukking>) (ook via een const-lijst)
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'includes' && n.arguments.length === 1) {
      const l = lijstWaarde(n.expression.expression), x = tekst(n.arguments[0], v);
      return l && x !== ONB ? l.includes(x) : ONBEKEND;
    }
    return viaAlias(n, (init) => waarde(init, v), ONBEKEND);
  };
  const kanWaar = (c, S) => new Set([...S].filter((v) => waarde(c, v) !== false));
  const kanOnwaar = (c, S) => new Set([...S].filter((v) => waarde(c, v) !== true));

  // 3. plekken met een vernauwde verzameling (de binnenste wint)
  const gebieden = [];   // { van, tot, S }
  const gebied = (van, tot, S, ouder) => { if (!zelfde(S, ouder)) gebieden.push({ van, tot, S }); };
  const knoopGebied = (k, S, ouder) => { if (k) gebied(k.getStart(sf), k.end, S, ouder); };
  const lijst = (opdrachten, S) => {
    let huidig = S;
    for (const st of opdrachten) {
      // Een functiedeclaratie wordt gehesen: ze bestaat al vóór een vroege return erboven → de verzameling van het blok zelf.
      const hier = ts.isFunctionDeclaration(st) ? S : huidig;
      if (hier !== S) gebied(st.getStart(sf), st.end, hier, S);
      bezoek(st, hier);
      // `if (c) return …;` (met of zonder else die NIET verlaat): wat volgt, draait alleen als c onwaar is — en omgekeerd.
      if (ts.isIfStatement(st)) {
        const danWeg = verlaat(st.thenStatement), andersWeg = !!st.elseStatement && verlaat(st.elseStatement);
        if (danWeg && !andersWeg) huidig = kanOnwaar(st.expression, huidig);
        else if (andersWeg && !danWeg) huidig = kanWaar(st.expression, huidig);
      }
    }
  };
  const bezoek = (n, S) => {
    if (ts.isIfStatement(n)) {
      bezoek(n.expression, S);
      const ja = kanWaar(n.expression, S), nee = kanOnwaar(n.expression, S);
      knoopGebied(n.thenStatement, ja, S); bezoek(n.thenStatement, ja);
      if (n.elseStatement) { knoopGebied(n.elseStatement, nee, S); bezoek(n.elseStatement, nee); }
      return;
    }
    if (ts.isConditionalExpression(n)) {
      bezoek(n.condition, S);
      const ja = kanWaar(n.condition, S), nee = kanOnwaar(n.condition, S);
      knoopGebied(n.whenTrue, ja, S); bezoek(n.whenTrue, ja);
      knoopGebied(n.whenFalse, nee, S); bezoek(n.whenFalse, nee);
      return;
    }
    if (ts.isBinaryExpression(n) && (n.operatorToken.kind === SK.AmpersandAmpersandToken || n.operatorToken.kind === SK.BarBarToken)) {
      bezoek(n.left, S);
      const rechts = n.operatorToken.kind === SK.AmpersandAmpersandToken ? kanWaar(n.left, S) : kanOnwaar(n.left, S);
      knoopGebied(n.right, rechts, S); bezoek(n.right, rechts);
      return;
    }
    if (ts.isSwitchStatement(n)) {
      bezoek(n.expression, S);
      // Alleen als de waarde van de switch-uitdrukking voor ELK mogelijk tabblad bekend is (tab, effectiveTab, section …).
      const sw = new Map([...S].map((v) => [v, tekst(n.expression, v)]));
      const bekend = [...sw.values()].every((x) => x !== ONB);
      const genoemd = new Set(n.caseBlock.clauses.filter((c) => ts.isCaseClause(c) && isLetterlijk(kaal(c.expression))).map((c) => kaal(c.expression).text));
      let doorval = null;   // een tak zonder break/return/throw aan het eind valt door naar de volgende
      for (const c of n.caseBlock.clauses) {
        let hier;
        if (!bekend) hier = new Set(S);
        else if (ts.isCaseClause(c)) hier = isLetterlijk(kaal(c.expression)) ? new Set([...S].filter((v) => sw.get(v) === kaal(c.expression).text)) : new Set(S);
        else hier = new Set([...S].filter((v) => !genoemd.has(sw.get(v))));
        if (ts.isCaseClause(c)) bezoek(c.expression, S);
        if (doorval) for (const v of doorval) hier.add(v);
        if (c.statements.length) { gebied(c.statements[0].getStart(sf), c.end, hier, S); lijst(c.statements, hier); }
        doorval = c.statements.length && sluitCaseAf(c.statements[c.statements.length - 1]) ? null : hier;
      }
      return;
    }
    if (ts.isBlock(n) || ts.isSourceFile(n) || ts.isModuleBlock(n)) { lijst(n.statements, S); return; }
    if (ts.isCaseClause(n) || ts.isDefaultClause(n)) { lijst(n.statements, S); return; }
    ts.forEachChild(n, (k) => bezoek(k, S));
  };
  bezoek(sf, ALLE);
  return { ALLE, gebieden, bindingen, verwijzingen, objecten, tekst };
}

/**
 * Maakt `i → { hint, mogelijk }` voor één bestand: `hint` = het ene mogelijke tabblad ('' als er geen eenduidig is), `mogelijk` = de
 * mogelijke tabbladen in de volgorde van het menu, alleen als de bron ze vernauwt (anders null: alles kan).
 */
function tabHintVoor(src, bestand, tabs, { zonderGeheugen = false } = {}) {
  if (!tabs?.length || !/\btab\b/.test(src)) return () => ({ hint: '', mogelijk: null });
  const { ALLE, gebieden, bindingen, verwijzingen, objecten, tekst } = tabStructuur(src, tabs);
  const kleinste = (lijst, i) => { let b = null; for (const x of lijst) if (x.van <= i && i < x.tot && (!b || x.tot - x.van < b.tot - b.van)) b = x; return b; };
  const eigen = [...bindingen].map(([sleutel, b], nr) => ({ sleutel, nr, ...b }));
  // Een object `const pages = { … }` volgen we alleen als het UITSLUITEND als `pages[<uitdrukking>]` wordt gelezen.
  const toegangen = new Map();
  for (const os of objecten.keys()) {
    const l = verwijzingen.get(os) ?? [];
    toegangen.set(os, l.length && l.every((g) => g.toegang) ? l : null);
  }
  // Geheugen (tweede rev'ju, 05.11.2026): een uitkomst die nergens een al gevolgde binding hoefde over te slaan (geen kring), hangt
  // niet af van het gevolgde pad en wordt per plek bewaard; alleen een uitkomst mét kring per (plek, pad). Zo blijft ook een
  // «ladder» met telkens twee verschillende componenten per niveau lineair (vroeger per pad: 2^N). `zonderGeheugen` (alleen voor
  // de test) rekent alles opnieuw uit, als controle dat het geheugen de uitkomst niet verandert.
  const vrij = new Map(), metPad = new Map();
  let kring = false;
  const mogelijk = (i, gezien) => {
    if (!zonderGeheugen && vrij.has(i)) return vrij.get(i);
    const sleutel = `${i}|${[...gezien].sort((a, b) => a - b).join(',')}`;
    if (!zonderGeheugen && metPad.has(sleutel)) { kring = true; return metPad.get(sleutel); }
    const buiten = kring;
    kring = eigen.some((x) => gezien.has(x.nr) && x.van <= i && i < x.tot);
    const S = kleinste(gebieden, i)?.S ?? ALLE;
    let uit = S;
    const b = kleinste(eigen.filter((x) => !gezien.has(x.nr)), i);
    if (b) {
      // Gebruik binnen het eigen lichaam (recursie) bereik je alleen via een gebruik van buiten: telt niet mee.
      const gebruik = (verwijzingen.get(b.sleutel) ?? []).filter((g) => !(g.i >= b.van && g.i < b.tot));
      const volgbaar = gebruik.length > 0 && gebruik.every((g) => (g.object ? !b.functie && !!toegangen.get(g.object.sym) : b.functie ? g.alsTag || g.alsAanroep : true));
      if (volgbaar) {
        const volgende = new Set(gezien).add(b.nr);
        const unie = new Set();
        for (const g of gebruik) {
          // Wederzijdse recursie (A gebruikt B, B gebruikt A): een gebruik BINNEN een component die al op dit pad ligt, bereik je alleen
          // via de gebruiken van buiten die hier al worden gevolgd — het voegt niets toe. Vroeger telde zo'n gebruik als «alle tabbladen»
          // (binnen de kring is geen binding meer over), zodat het element zijn tabblad verloor en de bestandsregel gold (ZOEKDIEP-001).
          const binnenPad = (j) => eigen.some((x) => volgende.has(x.nr) && x.van <= j && j < x.tot);
          if (!g.object && binnenPad(g.i)) { kring = true; continue; }
          if (g.object) {
            for (const a of toegangen.get(g.object.sym)) if (binnenPad(a.i)) kring = true; else for (const v of mogelijk(a.i, volgende)) { const k = tekst(a.toegang, v); if (k === ONB || k === g.object.sleutel) unie.add(v); }
          } else for (const v of mogelijk(g.i, volgende)) unie.add(v);
        }
        uit = new Set([...S].filter((v) => unie.has(v)));
      }
    }
    if (kring) metPad.set(sleutel, uit); else vrij.set(i, uit);
    kring = kring || buiten;
    return uit;
  };
  return (i) => {
    const S = mogelijk(i, new Set());
    return { hint: S.size === 1 ? [...S][0] : '', mogelijk: S.size < ALLE.size ? tabs.filter((v) => S.has(v)) : null };
  };
}

export function elementenUit(src, bestand, tabs = [], opties = {}) {
  const uit = [];
  const tabHint = tabHintVoor(src, bestand, tabs, opties);
  const tabVan = (i) => { const r = tabHint(i); return { tabHint: r.hint, ...(r.mogelijk ? { mogelijkeTabs: r.mogelijk } : {}) }; };
  const toegangBij = toegangVoor(src);
  const toegangVan = (i) => { const t = toegangBij(i); return t === 'iedereen' ? {} : { toegang: t }; };
  const secties = koppen(src);
  const sectieBij = (i) => { let s = null; for (const k of secties) { if (k.i >= i) break; if (i < k.tot) s = k; } return s?.wisselend ? null : s; };
  for (const k of secties) if (!GENERIEK.has(k.uk.toLowerCase())) uit.push({ soort: 'sectie', uk: k.uk, nl: k.nl, sectie: null, bestand, ...tabVan(k.i), ...toegangVan(k.tekstI ?? k.i) });   // toegang: waar de TEKST staat (`technisch ? tr(…) : tr(…)` in de kop)
  const re = /<button\b/g; let m;
  while ((m = re.exec(src))) {
    const e = tagEinde(src, m.index); if (e < 0) continue;
    const tag = src.slice(m.index, e + 1);
    const binnen = src.slice(e + 1, sluit(src, e, 'button'));
    const hulp = (attribuut(tag, 'data-hulp').match(/^'([a-z0-9.-]+)'$/) || [])[1] || '';
    const p = eerstePaar(binnen.slice(0, 700)) || eerstePaar(attribuut(tag, 'aria-label')) || eerstePaar(attribuut(tag, 'title'));
    if (!p) continue;
    if (GENERIEK.has(p.uk.toLowerCase())) continue;
    const s = sectieBij(m.index);
    uit.push({ soort: 'knop', ...p, sectie: s ? { uk: s.uk, nl: s.nl } : null, bestand, ...(hulp ? { hulp } : {}), ...tabVan(m.index), ...toegangVan(m.index) });
  }
  // Tabbladen met een eigen hash-adres (src/agenten/AgentenPagina.tsx → tabInfo: { overzicht: { uk, nl, icoon } … }).
  if (/agenten\/AgentenPagina\.tsx$/.test(bestand)) {
    const rt = /\b([a-z]+):\s*\{\s*uk:\s*'([^']{2,60})',\s*nl:\s*'([^']{2,60})',\s*icoon:/g;
    while ((m = rt.exec(src))) uit.push({ soort: 'tab', uk: schoon(m[2]), nl: schoon(m[3]), sectie: null, bestand, hash: m[1] });
  }
  const rd = /\brole=['"]dialog['"]/g;
  while ((m = rd.exec(src))) {
    const begin = src.lastIndexOf('<', m.index); const e = tagEinde(src, begin); if (begin < 0 || e < 0) continue;
    const tag = src.slice(begin, e + 1);
    // Alleen een eigen naam (aria-label) of de eerste kop in het venster; nooit de eerste knop (dat zou «Sluiten» zijn).
    const kop = /<h[123]\b/.exec(src.slice(e + 1, e + 1500));
    const p = eerstePaar(attribuut(tag, 'aria-label')) || (kop ? eerstePaar(src.slice(e + 1 + kop.index, e + 1 + kop.index + 600)) : null);
    if (p && !GENERIEK.has(p.uk.toLowerCase())) uit.push({ soort: 'dialoog', ...p, sectie: null, bestand, ...toegangVan(m.index) });
  }
  return uit;
}

/**
 * Tabbladen die ALTIJD doorsturen en dus nooit zelf iets tonen. mcp.*: overview, connect en verbindingen gaan voor iedereen naar
 * agents (shared/ai-agent-bord.ts → mcpIngang: NAAR_HUB en verbindingen → #technisch; McpDienstWeergave stopt dan met een vroege
 * return). Wat alleen daar staat, kan de zoeker niet laten zien. tests/eenheid/zoek-ui-bereik-20261105.test.ts toetst deze lijst
 * tegen mcpIngang zelf.
 */
export const DOORSTUREND = Object.freeze({ mcp: Object.freeze(['overview', 'connect', 'verbindingen']) });

/**
 * Het tabblad waar de zoeker heen gaat; null = het element is nergens te zien (dan niet in de catalogus).
 *   • niets bekend (de bron vernauwt niet) → de eenduidige hint of anders de bestandsregel `standaard`;
 *   • na aftrek van doorsturende tabbladen precies één mogelijk → dat;
 *   • meerdere mogelijk → de bestandsregel als die erbij is, anders het eerste in de volgorde van het menu. Vroeger (tot 05.11.2026)
 *     altijd de bestandsregel, ook waar het element niet kan staan: «Відкрити» en de Google-accounts van de cloud stonden op
 *     «Огляд», terwijl ze alleen op «Акаунти» / «Пошук» / «Недавні» … verschijnen;
 *   • alleen doorsturende tabbladen mogelijk → null (bv. de takken section==='overview'/'connect' van McpDienstWeergave);
 *   • geen enkel tabblad mogelijk (de bron noemt alleen onbekende tabbladen) → de bestandsregel, voorzichtig zoals vroeger.
 */
export function kiesTabblad(el, standaard, dood = []) {
  const m = el.mogelijkeTabs;
  if (!m || !m.length) return el.tabHint && !dood.includes(el.tabHint) ? el.tabHint : standaard;
  const levend = m.filter((v) => !dood.includes(v));
  if (!levend.length) return null;
  if (levend.length === 1) return levend[0];
  return levend.includes(standaard) ? standaard : levend[0];
}

/**
 * Bronbestanden die de site werkelijk laadt: alles wat vanaf src/main.tsx (de enige ingang, index.html) via `import … from`,
 * `export … from`, `import '…'` of `import('…')` bereikbaar is. Vroeger kwam elk .tsx-bestand in de catalogus, ook dode bestanden
 * zonder één import (src/AgentenPaneel.tsx, src/McpConnectorPaneel.tsx, src/agenten/ExtensieTechAanbod.tsx …): hun knoppen
 * bestaan op geen enkele pagina. Een import in commentaar telt ook mee — liever een bestand te veel dan een echte knop kwijt.
 */
export function bereikbaar(wortel = process.cwd()) {
  const los = (map, spec) => {
    const b = join(map, spec);
    for (const k of [b, `${b}.tsx`, `${b}.ts`, join(b, 'index.tsx'), join(b, 'index.ts')]) if (existsSync(k) && statSync(k).isFile()) return k;
    return null;
  };
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\n]+)\1/g;
  const gezien = new Set();
  const stapel = [join(wortel, 'src/main.tsx')];
  while (stapel.length) {
    const p = stapel.pop();
    if (gezien.has(p)) continue;
    gezien.add(p);
    if (!/\.(?:tsx?|mjs|js)$/.test(p)) continue;
    const src = readFileSync(p, 'utf8');
    for (const m of src.matchAll(re)) { const doel = los(dirname(p), m[2]); if (doel && !gezien.has(doel)) stapel.push(doel); }
  }
  return gezien;
}

/** .tsx-bestanden onder src/ die vanaf src/main.tsx NIET geladen worden: de site toont ze nergens. Hun knoppen staan niet in de
 *  catalogus, en hun «?»-uitleg (HULP_REGISTER → bron) evenmin: backend/zoek/catalogus-ui.ts slaat die over (UI_ONBEREIKBAAR). */
export function onbereikbaar(wortel = process.cwd(), geladen = bereikbaar(wortel)) {
  return [...tsxBestanden(join(wortel, 'src'))].filter((p) => !geladen.has(p)).map((p) => relative(wortel, p).replace(/\\/g, '/')).sort();
}

export function plekVan(bestand) {
  const rel = bestand.replace(/^src\//, '');
  for (const [prefix, dienst, tab, toegang] of PLEKKEN) if (rel.startsWith(prefix)) return { dienst, tab, toegang };
  return null;
}

function* tsxBestanden(map) {
  for (const naam of readdirSync(map).sort()) {
    const p = join(map, naam); const st = statSync(p);
    if (st.isDirectory()) yield* tsxBestanden(p);
    else if (/\.tsx$/.test(naam) && !/\.test\.tsx$/.test(naam)) yield p;
  }
}
const hash8 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);

/** Pagina's per dienst uit shared/menu-model.ts (MENU_PAGINAS): voor de tabblad-hint «tab==='accounts'» in een bestand. */
export function paginas(wortel = process.cwd()) {
  const src = readFileSync(join(wortel, 'shared/menu-model.ts'), 'utf8');
  const blok = /MENU_PAGINAS[^{]*\{([\s\S]*?)\n\};/.exec(src)?.[1] || '';
  const uit = {};
  const re = /(\w+):\s*\[([^\]]*)\]/g; let m;
  while ((m = re.exec(blok))) uit[m[1]] = [...m[2].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
  return uit;
}

/** Diensten van het hoofdmenu uit src/menu-voorkeuren.tsx (MENU_CATALOG): id, naam uk/nl, dienst, standaardtabblad. */
export function diensten(wortel = process.cwd()) {
  const src = readFileSync(join(wortel, 'src/menu-voorkeuren.tsx'), 'utf8');
  const uit = [];
  const re = /\{id:'([a-z]+)',uk:'([^']+)',nl:'([^']+)',icon:'([a-z-]+)',target:'([a-z]+)'(?:,tab:'([a-z-]+)')?(,planned:true)?\}/g; let m;
  while ((m = re.exec(src))) uit.push({ id: m[1], uk: m[2], nl: m[3], icoon: m[4], dienst: m[5], tab: m[6] || '', gepland: !!m[7] });
  if (uit.length < 10) throw new Error('MENU_CATALOG niet gevonden in src/menu-voorkeuren.tsx');
  return uit;
}

/** Registers in shared/ met tweetalige namen van knoppen: [bestand, dienst, pagina, toegang, begin van de tabel]. */
const REGISTERS = [['shared/mail-acties.ts', 'mail', 'inbox', 'iedereen', 'export const MAIL_ACTIES']];

/** Genereert de lijst (puur; schrijft niets). */
export function genereer(wortel = process.cwd()) {
  const items = new Map();
  const perDienst = paginas(wortel);
  const geladen = bereikbaar(wortel);
  for (const pad of tsxBestanden(join(wortel, 'src'))) {
    const bestand = relative(wortel, pad).replace(/\\/g, '/');
    const plek0 = plekVan(bestand); if (!plek0) continue;
    if (!geladen.has(pad)) continue;   // geen enkele import: dit bestand toont de site nergens
    const src = readFileSync(pad, 'utf8');
    for (const el of elementenUit(src, bestand, perDienst[plek0.dienst] || [])) {
      // Het tabblad uit de bron wint van de bestandsregel; alleen doorsturende tabbladen → niet zichtbaar, niet opnemen.
      const tab = kiesTabblad(el, plek0.tab, DOORSTUREND[plek0.dienst]);
      if (tab === null) continue;
      const plek = { ...plek0, tab, toegang: strengsteToegang(plek0.toegang, el.toegang || 'iedereen') };
      const hash = el.hash || hashVan(bestand, plek.dienst, plek.tab, el.toegang);
      const sleutel = `${plek.dienst}/${plek.tab}|${el.soort}|${el.uk}`;
      // dezelfde knop op dezelfde pagina (ander bestand): één keer — de ruimste toegang wint (wie hem ergens ziet, moet hem vinden)
      const al = items.get(sleutel);
      if (al && TOEGANG_RANG[al.toegang] <= TOEGANG_RANG[plek.toegang]) continue;
      items.set(sleutel, {
        id: `ui:${el.soort}:${plek.dienst}/${plek.tab}:${hash8(`${el.soort}|${el.uk}|${el.nl}`)}`,
        soort: el.soort, dienst: plek.dienst, tab: plek.tab, toegang: plek.toegang, uk: el.uk, nl: el.nl,
        sectieUk: el.sectie?.uk || '', sectieNl: el.sectie?.nl || '', bestand, ...(el.hulp ? { hulp: el.hulp } : {}), ...(hash ? { hash } : {}),
      });
    }
  }
  // Blok 1 (25.10.2026): de acties met een brief halen hun naam uit het register (shared/mail-acties.ts), niet meer uit een
  // letterlijke t('…','…') in de knop. Elke tekst van het register (lang, kort, bulk, toestanden) is een knop van de inbox.
  for (const [bestand, dienst, tab, toegang, begin] of REGISTERS) {
    const pad = join(wortel, bestand); if (!existsSync(pad)) continue;
    const src = readFileSync(pad, 'utf8'), van = src.indexOf(begin), tot = src.indexOf('} as const', van);
    if (van < 0 || tot < 0) continue;
    const tabel = src.slice(van, tot), re = new RegExp(PAAR, 'g'); let m;
    while ((m = re.exec(tabel))) {
      const p = eerstePaar(m[0]); if (!p || GENERIEK.has(p.uk.toLowerCase())) continue;
      const sleutel = `${dienst}/${tab}|knop|${p.uk}`;
      if (items.has(sleutel)) continue;   // staat al in een .tsx (met sectie): die wint
      items.set(sleutel, { id: `ui:knop:${dienst}/${tab}:${hash8(`knop|${p.uk}|${p.nl}`)}`, soort: 'knop', dienst, tab, toegang, uk: p.uk, nl: p.nl, sectieUk: '', sectieNl: '', bestand });
    }
  }
  return [...items.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function naarTs(lijst, dienstenLijst = diensten(), dood = onbereikbaar()) {
  const kop = `// GEGENEREERD — NIET MET DE HAND BEWERKEN. Bron: scripts/zoek-ui-catalogus.mjs (leest src/**/*.tsx).
// Knoppen, koppen en dialogen van de interface met hun tweetalige tekst en hun plek; gebruikt door backend/zoek/catalogus-ui.ts.
// Opnieuw maken: node scripts/zoek-ui-catalogus.mjs   (gebeurt ook in \`npm run build\`; de eenheidstest controleert de actualiteit).
export type UiToegang = 'iedereen' | 'profiel' | 'technisch';
export type GegenereerdUiElement = { id: string; soort: 'knop' | 'sectie' | 'dialoog' | 'tab'; dienst: string; tab: string; toegang: UiToegang; uk: string; nl: string; sectieUk: string; sectieNl: string; bestand: string; hulp?: string; hash?: string };
export const UI_ELEMENTEN_VERSIE = '${hash8(JSON.stringify(lijst) + JSON.stringify(dienstenLijst))}';
/** Hoofdmenu (src/menu-voorkeuren.tsx → MENU_CATALOG): naam per dienst, uk + nl. */
export type UiDienst = { id: string; uk: string; nl: string; icoon: string; dienst: string; tab: string; gepland: boolean };
export const UI_DIENSTEN: readonly UiDienst[] = Object.freeze(${JSON.stringify(dienstenLijst)} as UiDienst[]);
/** Bestand (prefix zonder «src/») → dienst, pagina, toegang — dezelfde tabel als de generator (voor hulp-register-sleutels met een «bron»-bestand). */
export const UI_PLEKKEN: ReadonlyArray<readonly [string, string, string, UiToegang]> = Object.freeze(${JSON.stringify(PLEKKEN)} as Array<[string, string, string, UiToegang]>);
export function uiPlekVan(bestand: string): { dienst: string; tab: string; toegang: UiToegang } | null {
  const rel = bestand.replace(/^src\\//, '');
  for (const [prefix, dienst, tab, toegang] of UI_PLEKKEN) if (rel.startsWith(prefix)) return { dienst, tab, toegang };
  return null;
}
/** .tsx-bestanden die vanaf src/main.tsx niet geladen worden (de site toont ze nergens): geen knoppen en geen «?»-uitleg in het zoeken. */
export const UI_ONBEREIKBAAR: readonly string[] = Object.freeze(${JSON.stringify(dood)});
// Als JSON-tekst (één element per regel), niet als objectliteral: 1100+ literals geven TypeScript een te grote unietype.
const LIJST: GegenereerdUiElement[] = JSON.parse([
`;
  const regels = lijst.map((e) => `  ${JSON.stringify(JSON.stringify(e))},`).join('\n');
  return `${kop}${regels}\n].join(',').replace(/^/, '[').replace(/$/, ']'));\nexport const UI_ELEMENTEN: readonly GegenereerdUiElement[] = Object.freeze(LIJST);\n`;
}

const direct = process.argv[1] && /zoek-ui-catalogus\.mjs$/.test(process.argv[1]);
if (direct) {
  const lijst = genereer();
  const ts = naarTs(lijst);
  const pad = join(process.cwd(), UITVOER);
  if (process.argv.includes('--controle')) {
    const huidig = existsSync(pad) ? readFileSync(pad, 'utf8') : '';
    if (huidig !== ts) { console.error(`[zoek-ui-catalogus] ${UITVOER} is niet actueel: voer node scripts/zoek-ui-catalogus.mjs uit`); process.exit(1); }
    console.log(`[zoek-ui-catalogus] actueel (${lijst.length} elementen)`);
  } else {
    writeFileSync(pad, ts);
    console.log(`[zoek-ui-catalogus] ${UITVOER}: ${lijst.length} elementen uit src/**/*.tsx`);
  }
}
