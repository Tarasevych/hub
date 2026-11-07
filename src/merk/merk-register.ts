// ÉÉN merkregister voor de hele site: alle logo's en merkiconen van agents, browsers, besturingssystemen en koppelingen staan in
// precies één tabel (src/merk/merk-tabel.ts) en worden door precies één component getekend (src/merk/Merk.tsx).
//
// Waarom (punt 9 van de eigenaar, 19.10.2026: «різні місця — різні логотипи, це роздуває розмір»): dezelfde merken werden op vier
// plaatsen opnieuw getekend — src/agenten/logos.ts (6 agents), src/sessies/merk-iconen.ts (13 browsers/OS), het `Logo`-blok in
// src/mcp-ui.tsx (21 eigen gliefjes) en src/merk/merk-logos.ts (137 merken). Claude, ChatGPT, Gemini, Copilot, Cursor, Chrome,
// Safari, Apple, Google en Linux kwamen zo in twee tot vier verschillende vormen én in vier verschillende bundelstukken voor.
//
// Dit bestand bevat GEEN padgegevens: het is alleen het register (klein, mag dus in de hoofdbundel). De tabel zelf wordt lui
// geladen (`laadMerken()` → eigen bundelstuk) en de grote merkentabel van de koppelingenpagina registreert zich pas als die
// pagina opengaat (src/merk/MerkLogo.tsx). Zo groeit de hoofdbundel niet mee met het aantal merken.
//
// Puur (geen React, geen DOM): de tests gebruiken dit bestand ook.
import { MERK_DOMEIN } from '../../shared/merk-domeinen';

/** Eén vorm van een gliefje met meer dan één kleur (Microsoft-blokken, Google-G …). Altijd in de doos 0 0 24 24. */
export type MerkVorm = {
  d: string;
  /** Vulkleur; weg = de hoofdkleur van het merk. 'geen' = niet vullen (alleen een streek). */
  vul?: string;
  streek?: string;
  dikte?: number;
  dekking?: number;
  regel?: 'evenodd' | 'nonzero';
  rond?: boolean;
};

export type MerkDef = {
  /** Merknaam zoals een mens die leest (tekstalternatief, en de eerste letters van het monogram). */
  naam: string;
  /** Hoofdkleur van het gliefje. */
  kleur: string;
  /** Vaste achtergrond van de tegel; weg = doorzichtig (het gliefje staat dan los op de pagina). */
  vlak?: string;
  /** Het gliefje is (bijna) zwart en moet in het donker de tekstkleur volgen. */
  volgtTekst?: boolean;
  /** Het gliefje vult de hele doos van 24 (geen inzet op de tegel) — bv. een rond logo dat zelf al een vlak heeft. */
  vol?: boolean;
  /** Geen merk maar een CATEGORIE-icoon (REST API, SCIM, IMAP/SMTP …): lijntekening in de tekstkleur op een tint van het
   *  accent, in plaats van een monogram met verzonnen letters («RA», «S2», «IS» — punt 3 van de contrastronde 21.10). */
  lijn?: boolean;
  regel?: 'evenodd' | 'nonzero';
  /** Drie kleuren voor een diagonaal verloop (Gemini). */
  verloop?: readonly [string, string, string];
  /** Eén pad in de doos 0 0 24 24 … */
  d?: string;
  /** … of meer vormen, elk met een eigen kleur. Precies één van `d` en `paden` is gezet. */
  paden?: readonly MerkVorm[];
  /** NEUTRALE PLAAT (21.10.2026, regel van de eigenaar: «не малювати й не вигадувати чужі логотипи кодом»). Voor een merk
   *  waarvan wij GEEN vorm met echte herkomst hebben (simple-icons CC0, lobehub MIT): geen nagetekend logo maar één vaste,
   *  voor alle zulke merken gelijke plaat — `letter` (1–2 tekens van de NAAM) in `kleur` op `vlak` (de merktoon), ≥ 4,5:1.
   *  Dan zijn `d` en `paden` leeg. Een beheerder kan het officiële bestand zelf neerleggen (registreerEigenMerken). */
  neutraal?: boolean;
  letter?: string;
};

export type MerkTabel = Readonly<Record<string, MerkDef>>;

/**
 * Namen die hetzelfde merk aanduiden → de ene sleutel in de tabel. Hierdoor staat elk pad één keer in de bundel, ook al heten
 * de slug van connector-v2 (`gpt`), die van simple-icons (`openai`) en de clientnaam van een OAuth-registratie (`chatgpt`)
 * verschillend. Alleen echte synonymen: `anthropic` (woordmerk) en `claude` (zonnetje) zijn twee verschillende tekens en blijven
 * dus apart.
 */
export const MERK_ALIAS: Readonly<Record<string, string>> = Object.freeze({
  chatgpt: 'gpt', openai: 'gpt', 'gpt-4': 'gpt', 'gpt4': 'gpt',
  googlegemini: 'gemini', bard: 'gemini',
  googleantigravity: 'antigravity', 'google-antigravity': 'antigravity', jetski: 'antigravity',
  openclaw: 'autoclaw', glm: 'autoclaw', chatglm: 'autoclaw', zhipu: 'autoclaw', zhipuai: 'autoclaw', zai: 'autoclaw', 'z.ai': 'autoclaw', 'glm-5.3-flashx-legal': 'autoclaw',
  githubcopilot: 'copilot', 'github-copilot': 'copilot',
  xai: 'grok', 'x-ai': 'grok',
  macos: 'apple', ios: 'apple', ipados: 'apple', iphone: 'apple', ipad: 'apple', mac: 'apple',
  googlechrome: 'chrome', chromium: 'chrome', chromeos: 'chrome',
  win: 'windows', win32: 'windows', 'windows-nt': 'windows',
  msedge: 'edge', 'microsoft-edge': 'edge',
  microsoftwindows: 'microsoft', msft: 'microsoft',
  nodejs: 'node', 'node-js': 'node',
  'duck-duck-go': 'duckduckgo', ddg: 'duckduckgo',
  samsunginternet: 'samsung',
});

/** Slug → sleutel in het register: kleine letters, geen rommel, aliassen opgelost. */
export function merkSleutel(v: unknown): string {
  const t = String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9.+-]+/g, '');
  if (!t) return '';
  return MERK_ALIAS[t] || t;
}

const REGISTER = new Map<string, MerkDef>();
const kijkers = new Set<() => void>();
let geladen = false;
let belofte: Promise<void> | null = null;

/** Zet een tabel in het register. Wat er al staat blijft staan: de eerste (en beste) vorm van een merk wint. */
export function registreerMerken(tabel: MerkTabel): void {
  let nieuw = false;
  for (const [slug, def] of Object.entries(tabel)) {
    const s = merkSleutel(slug);
    if (!s || REGISTER.has(s)) continue;
    REGISTER.set(s, def);
    nieuw = true;
  }
  if (nieuw) for (const fn of [...kijkers]) fn();
}

/** Het merk achter een naam, of null als het register het (nog) niet kent. */
export function merkDef(v: unknown): MerkDef | null {
  const s = merkSleutel(v);
  return (s && REGISTER.get(s)) || null;
}

/** Alle sleutels die nu in het register staan (voor de tests en de diagnose). */
export const merkSleutels = (): string[] => [...REGISTER.keys()].sort();

/** Is de luie tabel al binnen? */
export const merkenGeladen = (): boolean => geladen;

/** Laadt de merkentabel (eigen bundelstuk, één keer per sessie). Mislukt dit, dan blijft het monogram staan. */
export function laadMerken(): Promise<void> {
  return (belofte ??= import('./merk-tabel')
    .then((m) => { registreerMerken(m.MERKEN); geladen = true; })
    .catch(() => { belofte = null; }));
}

/** Laat `fn` weten dat er merken bij zijn gekomen; geeft de afmelding terug. */
export function opMerken(fn: () => void): () => void {
  kijkers.add(fn);
  return () => { kijkers.delete(fn); };
}

// ---------------------------------------------------------------- eigen logo's van de beheerder (BYOS, 21.10.2026)
// Een beheerder legt het OFFICIËLE bestand van een merk (SVG of PNG, van de merkpagina van de dienst zelf) in de map op zijn server
// (standaard /srv/mijn-ruimte/merk-eigen/<sleutel>.svg|png, zie deploy/LEESMIJ.md) of laadt het op via admin → Інтеграції. De server
// controleert en ontsmet het (shared/merk-eigen.ts) en geeft het als data-URI; dit register laat het dan VOOR elke ingebouwde vorm
// gaan. Zo hoeft de code nooit een logo na te tekenen.
export type EigenMerk = { sleutel: string; soort: 'svg' | 'png'; data: string; hash: string };
const EIGEN = new Map<string, EigenMerk>();
let eigenBelofte: Promise<void> | null = null;
/** Zet de eigen logo's (vervangt de vorige lijst helemaal: wat de beheerder wiste, verdwijnt). */
export function registreerEigenMerken(lijst: readonly EigenMerk[]): void {
  EIGEN.clear();
  for (const m of lijst) {
    const s = merkSleutel(m?.sleutel);
    if (!s || (m.soort !== 'svg' && m.soort !== 'png') || !/^data:image\/(svg\+xml|png);base64,[A-Za-z0-9+/=]+$/.test(String(m.data || ''))) continue;
    EIGEN.set(s, { sleutel: s, soort: m.soort, data: m.data, hash: String(m.hash || '') });
  }
  for (const fn of [...kijkers]) fn();
}
/** Het eigen logo van de beheerder voor dit merk, of null. */
export function eigenMerk(v: unknown): EigenMerk | null { const s = merkSleutel(v); return (s && EIGEN.get(s)) || null; }
/** Haalt de lijst één keer per sessie op. `ophalen` = een POST naar /api/owner/merk-eigen/lijst; faalt het, dan blijft alles ingebouwd. */
export function laadEigenMerken(ophalen: () => Promise<{ merken?: EigenMerk[] } | null | undefined>): Promise<void> {
  return (eigenBelofte ??= ophalen().then((r) => { if (r?.merken?.length) registreerEigenMerken(r.merken); }).catch(() => undefined));
}
/** Voor tests: de eigen lijst leegmaken en opnieuw laten ophalen. */
export function _eigenMerkenOpnieuw(): void { EIGEN.clear(); eigenBelofte = null; }

// ---------------------------------------------------------------- OFFICIËLE logo's en de MERKENDATABASE (21.10.2026)
// Besluit van de eigenaar: «знайди в інтернеті публічні фото їх логотипів і збережи в базу … Без імітації, а справжні». Twee
// lagen bovenop de vormen van hierboven, en de VOLGORDE is de hele regel (merkLaag):
//   1. eigen       het bestand dat de beheerder zelf neerlegde (registreerEigenMerken);
//   2. officieel   het officiële logo uit de INGEBOUWDE basis: src/merk/officieel/*.svg|png, genomen uit npm-pakketten met een
//                  open licentie (CC0/MIT) of van de eigen website van de dienst — zie HERKOMST.json en
//                  scripts/merk-officieel-maken.mjs. Werkt zonder internet (BYOS);
//   3. vorm        een vorm met echte herkomst in merk-tabel.ts / merk-logos.ts (simple-icons CC0, lobehub MIT, lucide ISC);
//   4. database    het logo dat DE SERVER van de eigen website of het BIMI-record van het domein van de dienst haalde en in
//                  app.merk_beeld bewaarde (backend/merk-bron.ts). Alleen voor merken die hierboven niets hebben (MERK_DOMEIN);
//   5. neutraal    de neutrale plaat — tot de eerste geslaagde ophaling (of als de beheerder het ophalen uitzette);
//   6. onbekend    monogram.
// De browser laadt zelf NOOIT iets van buiten: officieel zit in de bundel, de database komt als data-URI van de eigen server.
export type OfficieelMerk = {
  soort: 'svg' | 'png';
  /** SVG: de (ontsmette) tekst; PNG: base64. */
  inhoud: string;
  sha256: string;
  /** 'licht' = het logo heeft donkere delen; als los gliefje staat het daarom op een lichte plaat (de vorm blijft onaangeroerd). */
  ondergrond: 'licht' | 'vrij';
  /** Pakket@versie · icoon · licentie, of de URL van de eigen website. */
  bron: string;
};
export type OfficieelBeeld = OfficieelMerk & { sleutel: string; data: string };
/** data-URI voor een <img>. SVG als tekst (kleiner dan base64 en gzip-vriendelijk); in een <img> voert een SVG nooit script uit. */
export const merkDataUri = (soort: 'svg' | 'png', inhoud: string): string =>
  soort === 'svg' ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(inhoud)}` : `data:image/png;base64,${inhoud}`;

const OFFICIEEL = new Map<string, OfficieelBeeld>();
let officieelBelofte: Promise<void> | null = null;
let officieelBinnen = false;
/** Zet de ingebouwde officiële logo's in het register (src/merk/merk-officieel.ts doet dit zelf bij het laden). */
export function registreerOfficieleMerken(tabel: Readonly<Record<string, OfficieelMerk>>): void {
  let nieuw = false;
  for (const [k, m] of Object.entries(tabel || {})) {
    const s = merkSleutel(k);
    if (!s || !m || (m.soort !== 'svg' && m.soort !== 'png') || !m.inhoud) continue;
    if (m.soort === 'svg' && !/^<svg[\s>]/.test(m.inhoud)) continue;
    if (m.soort === 'png' && !/^[A-Za-z0-9+/=]+$/.test(m.inhoud)) continue;
    OFFICIEEL.set(s, { ...m, sleutel: s, data: merkDataUri(m.soort, m.inhoud) });
    nieuw = true;
  }
  officieelBinnen = true;
  if (nieuw) for (const fn of [...kijkers]) fn();
}
/** Het ingebouwde officiële logo van dit merk, of null. */
export function officieelMerk(v: unknown): OfficieelBeeld | null { const s = merkSleutel(v); return (s && OFFICIEEL.get(s)) || null; }
export const officieelGeladen = (): boolean => officieelBinnen;
export const officieleSleutels = (): string[] => [...OFFICIEEL.keys()].sort();
/** Laadt de ingebouwde officiële logo's (eigen bundelstuk, één keer per sessie). */
export function laadOfficieel(): Promise<void> {
  return (officieelBelofte ??= import('./merk-officieel').then(() => { officieelBinnen = true; for (const fn of [...kijkers]) fn(); }).catch(() => { officieelBelofte = null; }));
}

/** Merken zonder officieel bestand in een open pakket én zonder vorm met herkomst: hun logo haalt de SERVER van dit domein
 *  (BIMI of de eigen website) en bewaart het in app.merk_beeld. Eén lijst met de server: shared/merk-domeinen.ts. */
export { MERK_DOMEIN };
export const merkDomein = (v: unknown): string => { const s = merkSleutel(v); return (s && MERK_DOMEIN[s]) || ''; };

export type DatabaseBeeld = { domein: string; data: string; bron: string; mime: string };
const DATABASE = new Map<string, DatabaseBeeld>();
const DATA_URI = /^data:image\/(svg\+xml|png|jpeg|webp|x-icon|vnd\.microsoft\.icon)(;charset=utf-8)?(;base64)?,[A-Za-z0-9+/=%._~!*'()-]+$/;
/** Zet logo's uit de merkendatabase van de server (alleen data-URI's van een beeldtype; al het andere wordt genegeerd). */
export function registreerDatabaseMerken(lijst: readonly DatabaseBeeld[]): void {
  let nieuw = false;
  for (const b of lijst || []) {
    const d = String(b?.domein || '').toLowerCase();
    if (!/^[a-z0-9.-]{1,253}$/.test(d) || !DATA_URI.test(String(b?.data || '')) || String(b.data).length > 400_000) continue;
    DATABASE.set(d, { domein: d, data: b.data, bron: String(b.bron || '').slice(0, 20), mime: String(b.mime || '').slice(0, 40) });
    nieuw = true;
  }
  if (nieuw) for (const fn of [...kijkers]) fn();
}
/** Het logo uit de merkendatabase voor dit merk (via MERK_DOMEIN) of voor dit domein, of null. */
export function databaseMerk(v: unknown): DatabaseBeeld | null {
  const s = merkSleutel(v);
  if (!s) return null;
  return DATABASE.get(MERK_DOMEIN[s] || s) || null;
}
/** Voor tests. */
export function _databaseMerkenOpnieuw(): void { DATABASE.clear(); }

export type MerkLaag = 'eigen' | 'officieel' | 'vorm' | 'database' | 'neutraal' | 'onbekend';
/** DE VOLGORDE (zie boven): welke laag tekent dit merk nu? `def` = een al opgezochte vorm (de grote tabel van de koppelingen). */
export function merkLaag(v: unknown, def?: MerkDef | null): MerkLaag {
  const s = merkSleutel(v) || merkSleutel(def?.naam);
  if (s && EIGEN.has(s)) return 'eigen';
  if (s && OFFICIEEL.has(s)) return 'officieel';
  const d = def ?? (s ? REGISTER.get(s) ?? null : null);
  if (d && !d.neutraal) return 'vorm';
  if (s && databaseMerk(s)) return 'database';
  return d?.neutraal ? 'neutraal' : 'onbekend';
}

/** Eén of twee beginletters voor een merk zonder gliefje. */
export function monogram(naam: string): string {
  const w = String(naam ?? '').replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean);
  return ((w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)) || '?').toUpperCase();
}

/** Vaste kleurtoon per naam, zodat een merk zonder gliefje altijd dezelfde kleur houdt. */
export function merkTint(id: string): number {
  let h = 0;
  for (const c of String(id ?? '')) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

// ---------------------------------------------------------------- leesbaarheid van het gliefje (contrastronde 21.10.2026)
// DE ENE regel voor monochrome en «bijna-zwarte/bijna-witte» merken (GitHub, Anthropic, MCP, Apple, X, Vercel, Cal.com …):
// haalt de eigen merkkleur in een modus géén 3:1 tegen ELKE achtergrond waarop het gliefje kan staan (de 26 paletten), dan
// tekent <Merk> een monochroom merk daar in de tekstkleur van het thema (var(--text)) — zoals de merken zelf hun monochrome logo
// voorschrijven — en een gekleurd merk in dezelfde toon, lichter/donkerder tot 3:1 (merkKleuren). Wie overal 3:1 haalt, houdt
// zijn kleur. Voorheen: zwart (#181717/#191919/#000) op het donkere
// grafietpaneel = 1,15–1,38:1 («логотипи відсутні», admin-mappen / github-accounts).

/** Lichtste en donkerste achtergrond per modus over alle 26 paletten (grifel, violet, puur, 10 × kleur; licht én donker).
 *  `panel` = waarop een tegel ligt (de tegel is `panel` met 12% merkkleur), `vlak` = bg/panel/surface/surface2 (los gliefje).
 *  De eenheidstest contrast-knoppen-logos-20261021 rekent deze grenzen na tegen src/thema/paletten.ts + canoniek-omlijsting.css. */
export const MERK_GRENZEN = Object.freeze({
  licht: { panel: ['#fbfbfb', '#ffffff'], vlak: ['#d4d8dc', '#ffffff'] },
  donker: { panel: ['#000000', '#2c3239'], vlak: ['#000000', '#47515c'] },
} as const);
/** Aandeel van de merkkleur in de tint van een tegel zonder eigen merkvlak (merk.css: color-mix … 12%, var(--panel)). */
export const MERK_TINT = 0.12;
/** Minimum voor een gliefje (niet-tekstueel element, WCAG 1.4.11). */
export const MERK_MIN = 3;

const rgb = (h: string): number[] => { let v = String(h ?? '').replace('#', ''); if (v.length === 3) v = v.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0); };
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
/** Relatieve luminantie (WCAG). */
export const merkLuminantie = (h: string): number => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** Contrast (WCAG 2.x) tussen twee hexkleuren. */
export const merkContrast = (a: string, b: string): number => { const x = merkLuminantie(a), y = merkLuminantie(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** a met aandeel t over b gelegd (sRGB, zoals color-mix(in srgb …)). */
export const merkMeng = (a: string, b: string, t: number): string => { const x = rgb(a), y = rgb(b); return `#${x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`; };

/** De uiterste achtergronden waarop het gliefje in deze modus kan staan: bij een tegel de tint (12% merkkleur) over het lichtste
 *  en donkerste paneel, bij een los gliefje het lichtste en donkerste oppervlak. */
export function merkAchtergronden(kleur: string, modus: 'licht' | 'donker', vorm: 'tegel' | 'gliefje'): string[] {
  const g = MERK_GRENZEN[modus][vorm === 'tegel' ? 'panel' : 'vlak'];
  return vorm === 'tegel' ? g.map((p) => merkMeng(kleur, p, MERK_TINT)) : [...g];
}

/** Haalt `kleur` ≥ 3:1 tegen ELK van deze achtergronden? De kleur moet aan één kant van alle achtergronden liggen (lichter dan
 *  de lichtste of donkerder dan de donkerste) — anders bestaat er een palet waarin hij wegvalt. */
export function merkLeesbaarTegen(kleur: string, achter: readonly string[], min: number = MERK_MIN): boolean {
  const l = merkLuminantie(kleur), ls = achter.map(merkLuminantie);
  if (!(l > Math.max(...ls) || l < Math.min(...ls))) return false;
  return achter.every((a) => merkContrast(kleur, a) >= min);
}

/** Haalt de merkkleur in deze modus ≥ 3:1 tegen elke achtergrond van de 26 paletten? */
export function merkLeesbaar(kleur: string, modus: 'licht' | 'donker', vorm: 'tegel' | 'gliefje'): boolean {
  return merkLeesbaarTegen(kleur, merkAchtergronden(kleur, modus, vorm));
}

/** Monochroom merk (zwart, wit, grijs — GitHub, Apple, X, Anthropic, MCP, Vercel, AWS …): nauwelijks kleurtoon. */
export function merkNeutraal(kleur: string): boolean {
  const c = rgb(kleur);
  return Math.max(...c) - Math.min(...c) < 32;
}

/** Schuift `kleur` (zelfde toon) naar wit of zwart tot hij ≥ 3:1 haalt tegen `achter` (met 0,2 marge: de paletten tussen de
 *  uitersten mengen per kanaal net iets anders); null als dat niet lukt. */
function schuifTot(kleur: string, achter: readonly string[], naar: '#ffffff' | '#000000'): string | null {
  for (let t = 0; t <= 1.0001; t += 0.02) { const k = merkMeng(naar, kleur, Math.min(1, t)); if (merkLeesbaarTegen(k, achter, MERK_MIN + 0.2)) return k; }
  return null;
}

export type MerkKleuren = { licht: string; donker: string; aangepast: boolean };

/**
 * DE ENE REGEL voor de kleur van het hoofdgliefje, per modus:
 *  • haalt de merkkleur overal ≥ 3:1 → de merkkleur;
 *  • zo niet, en het merk is monochroom → var(--text) (zo schrijven GitHub, Apple, X, Anthropic … het zelf voor);
 *  • zo niet, en het merk heeft een kleur → dezelfde toon, lichter (donker thema) of donkerder (licht thema) tot ≥ 3:1;
 *  • een merk met eigen merkvlak: het gliefje tegen dat vlak (één kleur voor beide modi), zo nodig even zo verschoven;
 *  • een categorie-icoon (lijn): altijd var(--text).
 */
export function merkKleuren(def: Pick<MerkDef, 'kleur' | 'vlak' | 'volgtTekst' | 'verloop' | 'lijn'>, vorm: 'tegel' | 'rond' | 'gliefje'): MerkKleuren {
  const k = def.kleur;
  if (def.lijn) return { licht: 'var(--text)', donker: 'var(--text)', aangepast: true };
  if (def.verloop) return { licht: k, donker: k, aangepast: false };
  if (def.vlak && vorm !== 'gliefje') {
    if (merkContrast(k, def.vlak) >= MERK_MIN) return { licht: k, donker: k, aangepast: false };
    const v = schuifTot(k, [def.vlak], merkLuminantie(def.vlak) > 0.18 ? '#000000' : '#ffffff') ?? (merkLuminantie(def.vlak) > 0.18 ? '#000000' : '#ffffff');
    return { licht: v, donker: v, aangepast: true };
  }
  const v = vorm === 'gliefje' ? 'gliefje' : 'tegel';
  const per = (modus: 'licht' | 'donker'): string => {
    if (merkLeesbaar(k, modus, v) && !(modus === 'donker' && def.volgtTekst)) return k;
    if (merkNeutraal(k) || def.volgtTekst) return 'var(--text)';
    return schuifTot(k, merkAchtergronden(k, modus, v), modus === 'donker' ? '#ffffff' : '#000000') ?? 'var(--text)';
  };
  const licht = per('licht'), donker = per('donker');
  return { licht, donker, aangepast: licht !== k || donker !== k };
}

/** Inline-stijl voor het <svg>: de kleur per modus via de «spatie-schakelaar» van merk.css (--merk-in-licht / --merk-in-donker
 *  zijn leeg in hun eigen modus en ongeldig in de andere). Zo volgt elk logo het thema van zijn EIGEN omgeving. */
export function merkKleurStijl(k: MerkKleuren): Record<string, string> | null {
  if (!k.aangepast) return null;
  return { '--merk-vul-d': `var(--merk-in-donker) ${k.donker}`, '--merk-vul-l': `var(--merk-in-licht) ${k.licht}` };
}

/** Vulling van het hoofdgliefje: de per-modus-kleur (zie merkKleurStijl), terugval de merkkleur. */
export function merkVulling(kleur: string, k: MerkKleuren): string {
  return k.aangepast ? `var(--merk-vul-d, var(--merk-vul-l, ${kleur}))` : kleur;
}

/** Volgt het hoofdgliefje in een modus NIET zijn eigen merkkleur (tekstkleur of verschoven toon)? Voor tests/diagnose. */
export function merkVolgt(def: Pick<MerkDef, 'kleur' | 'vlak' | 'volgtTekst' | 'verloop' | 'lijn'>, vorm: 'tegel' | 'rond' | 'gliefje'): { licht: boolean; donker: boolean } {
  const k = merkKleuren(def, vorm);
  return { licht: k.licht !== def.kleur, donker: k.donker !== def.kleur };
}

/** Hoe donker is een hexkleur (0..1)? Een bijna zwart merk moet in het donker de tekstkleur volgen. */
export function merkHelderheid(hex: string): number {
  const n = parseInt(String(hex ?? '').replace('#', ''), 16);
  if (!Number.isFinite(n)) return 1;
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}
