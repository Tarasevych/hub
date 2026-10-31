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
import { join, relative } from 'node:path';

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
  ['bureau/', 'hub', 'overview', 'iedereen'], ['overzicht/', 'hub', 'overview', 'iedereen'], ['WelkomKaart', 'hub', 'overview', 'iedereen'],
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
  ['agenten/', 'ai', 'agents', 'iedereen'], ['connector-v2/', 'ai', 'agents', 'iedereen'], ['ai-bevestiging/', 'ai', 'agents', 'iedereen'],
  ['extensie/', 'ai', 'agents', 'iedereen'], ['McpAgentenHub', 'ai', 'agents', 'iedereen'], ['McpConnectorPaneel', 'ai', 'agents', 'iedereen'],
  ['McpToestemmingVenster', 'ai', 'agents', 'iedereen'], ['AgentenPaneel', 'ai', 'agents', 'iedereen'], ['AgentInrichtingWizard', 'ai', 'agents', 'iedereen'],
  ['AiToestemmingen', 'ai', 'agents', 'iedereen'], ['BrowserExtensiePaneel', 'ai', 'agents', 'iedereen'], ['ExtensieWizard', 'ai', 'agents', 'iedereen'],
  ['ApparatenWeergave', 'ai', 'agents', 'iedereen'],
  // ---- technisch profiel: de band (TechLaag) zelf mag wie een profiel heeft; wat erachter zit alleen met een actieve activering
  ['tech/', 'hub', 'overview', 'profiel'], ['ssh/', 'hub', 'overview', 'technisch'], ['terminal/', 'mcp', 'dashboard', 'technisch'],
  ['extern/', 'hub', 'overview', 'technisch'], ['vlaggen/', 'hub', 'overview', 'technisch'],
  // ---- sitebeheer (alleen technisch)
  ['BeheerConsoleWeergave', 'admin', 'overview', 'technisch'], ['BeheerOverzichtWeergave', 'admin', 'overview', 'technisch'], ['IdentiteitBeheerWeergave', 'admin', 'access', 'technisch'],
  ['BeheerSleutelsWeergave', 'admin', 'contour', 'technisch'], ['geheimen/', 'admin', 'contour', 'technisch'], ['BeheerAiBeleidWeergave', 'admin', 'ai', 'technisch'],
  ['BeheerUitrolWeergave', 'admin', 'updates', 'technisch'], ['UitrolMeester', 'admin', 'updates', 'technisch'], ['uitrol/', 'admin', 'updates', 'technisch'],
  ['BeheerDiagnostiekWeergave', 'admin', 'diagnostics', 'technisch'], ['diagnostiek/', 'admin', 'diagnostics', 'technisch'], ['diagnose/', 'admin', 'diagnostics', 'technisch'],
  ['audit/', 'admin', 'audit', 'technisch'], ['integraties/', 'admin', 'directories', 'technisch'], ['merk/', 'admin', 'directories', 'technisch'],
  ['impersonatie/', 'admin', 'access', 'technisch'], ['ondersteuning/', 'admin', 'access', 'technisch'], ['beveiliging/', 'admin', 'access', 'technisch'],
  ['ApiPlatformWeergave', 'api', 'access', 'technisch'], ['KluisMeta', 'api', 'vault', 'technisch'],
  ['McpDienstWeergave', 'mcp', 'dashboard', 'technisch'], ['McpAppsWeergave', 'mcp', 'apps', 'technisch'], ['McpBackupsKaart', 'mcp', 'dashboard', 'technisch'],
  ['McpServerBeheerKaart', 'mcp', 'dashboard', 'technisch'], ['McpHulpmiddelenPaneel', 'mcp', 'tools', 'technisch'], ['mcp-ui', 'mcp', 'dashboard', 'technisch'],
  ['ServerKoppelen', 'mcp', 'connect', 'technisch'],
];

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

/** Alle koppen (h1-h3) met positie, zodat een knop zijn sectie kent (de laatste kop ervoor). */
function koppen(src) {
  const uit = [];
  const re = /<(h[123])\b/g; let m;
  while ((m = re.exec(src))) {
    const e = tagEinde(src, m.index); if (e < 0) continue;
    const binnen = src.slice(e + 1, sluit(src, e, m[1]));
    const p = eerstePaar(binnen.slice(0, 600));
    if (p) uit.push({ i: m.index, ...p });
  }
  return uit;
}

/** Het tabblad waarin een element staat, als de bron dat zegt: de laatste `tab==='x'` (≤ 1500 tekens ervoor) die een echte pagina van de dienst is. */
function tabHint(src, i, tabs) {
  if (!tabs?.length) return '';
  const stuk = src.slice(Math.max(0, i - 1500), i);
  let laatste = ''; const re = /\btab\s*===\s*'([a-z-]+)'/g; let m;
  while ((m = re.exec(stuk))) if (tabs.includes(m[1])) laatste = m[1];
  return laatste;
}

export function elementenUit(src, bestand, tabs = []) {
  const uit = [];
  const secties = koppen(src);
  const sectieBij = (i) => { let s = null; for (const k of secties) { if (k.i < i) s = k; else break; } return s; };
  for (const k of secties) if (!GENERIEK.has(k.uk.toLowerCase())) uit.push({ soort: 'sectie', uk: k.uk, nl: k.nl, sectie: null, bestand, tabHint: tabHint(src, k.i, tabs) });
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
    uit.push({ soort: 'knop', ...p, sectie: s ? { uk: s.uk, nl: s.nl } : null, bestand, ...(hulp ? { hulp } : {}), tabHint: tabHint(src, m.index, tabs) });
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
    if (p && !GENERIEK.has(p.uk.toLowerCase())) uit.push({ soort: 'dialoog', ...p, sectie: null, bestand });
  }
  return uit;
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
  for (const pad of tsxBestanden(join(wortel, 'src'))) {
    const bestand = relative(wortel, pad).replace(/\\/g, '/');
    const plek0 = plekVan(bestand); if (!plek0) continue;
    const src = readFileSync(pad, 'utf8');
    for (const el of elementenUit(src, bestand, perDienst[plek0.dienst] || [])) {
      // Een expliciete tabblad-hint in de bron («tab==='accounts'» vlak vóór het element) wint van de bestandsregel.
      const plek = el.tabHint ? { ...plek0, tab: el.tabHint } : plek0;
      const sleutel = `${plek.dienst}/${plek.tab}|${el.soort}|${el.uk}`;
      if (items.has(sleutel)) continue;   // dezelfde knop op dezelfde pagina (ander bestand): één keer
      items.set(sleutel, {
        id: `ui:${el.soort}:${plek.dienst}/${plek.tab}:${hash8(`${el.soort}|${el.uk}|${el.nl}`)}`,
        soort: el.soort, dienst: plek.dienst, tab: plek.tab, toegang: plek.toegang, uk: el.uk, nl: el.nl,
        sectieUk: el.sectie?.uk || '', sectieNl: el.sectie?.nl || '', bestand, ...(el.hulp ? { hulp: el.hulp } : {}), ...(el.hash ? { hash: el.hash } : {}),
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

export function naarTs(lijst, dienstenLijst = diensten()) {
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
