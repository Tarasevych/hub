// Uiterlijk (het hele «vigljad»: thema, palet, automatisch schakelen, menuhint, meldingsgeluid, plaats van de bel, laatste paden,
// taal en profielfoto) — PER ACCOUNT en PER WEBRUIMTE (profiel). Punt 2 en punt 4 van de eigenaar, audit 20.10.2026.
//
// WAAROM EN HOE (dezelfde mechaniek als het menu — shared/menu-model.ts, NIET een tweede systeem):
//  • De SERVER is de bron van waarheid. Het deel dat per ruimte verschilt staat in owner_ui_preferences_v1, veld `weergave`, als
//    {versie:2, gebruiker, technisch} — precies zoals `sidebar` voor het menu (metRuimte / uiterlijkVoorRuimte hieronder).
//    De bootstrap geeft alleen de GEBRUIKERSruimte; de technische stand vraagt een LOPEND technisch profiel in dit tabblad
//    (POST /api/owner/ui/weergave met ruimte:'technisch'; zonder profiel 403 TECH_PROFIEL_VEREIST — ook voor de eigenaar).
//  • De cookie (.tarasevych.com) blijft alleen een SNELLE CACHE voor het eerste beeld: het thema moet staan vóór het eerste
//    malen, anders flitst het wit en springt de kleur. Daarom moet de cookie klein blijven: zie UITERLIJK_MAX_RUIMTES /
//    UITERLIJK_MAX_COOKIE in src/gedeelde-voorkeuren.ts (de cookie houdt alleen de laatst gebruikte scopes).
//
// WAT PER RUIMTE STAAT EN WAT ALLEEN PER ACCOUNT (en dus in beide ruimtes van DAT ACCOUNT gelijk is):
//  • per account + ruimte (UiterlijkRuimte): modus (licht/donker/apparaat/auto), palet, automatisch schakelen, menuhint,
//    meldingsgeluid, plaats van de bel, laatste pad per dienst, gecacht routebeeld. Dit is wat je ziet en waar je op klikt, en
//    het moet per profiel verschillen zodat je nooit verwart waar je werkt.
//  • alleen per account (UiterlijkAccount): TAAL en PROFIELFOTO. Die horen bij de persoon, niet bij de ruimte: dezelfde persoon
//    leest in beide ruimtes dezelfde taal en heeft dezelfde foto. Beide staan al per account op de server (`language` in
//    owner_ui_preferences_v1 en `picture` van het account), dus hier staat alleen de cache ervan.
//  • NOOIT gedeeld: tussen twee ACCOUNTS in dezelfde browser gaat niets over — ook taal en foto niet.
//
// Geen React, geen DOM: dit bestand draait ook op de server (normalisatie van wat de browser opslaat).

import { DIENST_IDS, MENU_PAGINAS, MENU_RUIMTES, type MenuRuimte } from './menu-model';

// ------------------------------------------------------------------------------------------------ velden en grenzen
/** Diensten (subdomeinen) waarvoor een laatste pad en een routebeeld bewaard worden; gelijk aan `services` in src/gedeelde-voorkeuren.ts. */
export const UITERLIJK_DIENSTEN = ['hub', 'ai', 'mail', 'cloud', 'github', 'huis', 'identity', 'api', 'admin', 'mcp'] as const;
export type UiterlijkDienst = typeof UITERLIJK_DIENSTEN[number];
export const UITERLIJK_TALEN = ['uk', 'nl'] as const;
export type UiterlijkTaal = typeof UITERLIJK_TALEN[number];
/** Licht/donker als laag bovenop het palet (zelfde waarden als Modus in src/thema/kern.ts). */
export const UITERLIJK_MODI = ['light', 'dark', 'device', 'auto'] as const;
/** Oude vaste thema's van vóór «palet + modus»; ze worden nog steeds BEWAARD zoals ze zijn (leesKeuze() in src/thema/kern.ts en
 *  runtime.thema in public/canonical-service.js lezen ze beide als violet + licht/donker). Zo verandert er voor niemand iets;
 *  src/gedeelde-voorkeuren.ts zet ze bij de eerste gelegenheid om naar modus + palet (migrateLegacyPresentationStorage). */
export const UITERLIJK_MODI_OUD = ['plum', 'plum-light', 'plum-dark'] as const;
export type UiterlijkModus = typeof UITERLIJK_MODI[number] | typeof UITERLIJK_MODI_OUD[number];
/** Paletten (zelfde lijst als src/thema/kern.ts en public/canonical-service.js; de eenheidstest vergelijkt ze). */
export const UITERLIJK_PALETTEN = ['grifel', 'puur', 'violet', 'kleur', 'maquette', 'klassiek-wit', 'klassiek-zwart'] as const;
export type UiterlijkPalet = typeof UITERLIJK_PALETTEN[number];
/** Gecachte «leegte» van een route, zodat het eerste beeld geen skelet toont dat er toch niet komt. */
export const UITERLIJK_ROUTEBEELDEN = ['signed-out', 'mail-empty', 'github-empty', 'api-empty'] as const;
export type UiterlijkRouteBeeld = typeof UITERLIJK_ROUTEBEELDEN[number];

/** IDENTITEIT-015 (крок «vormgeving»): вигляд центру облікового запису — раніше лише localStorage пристрою, тепер в обліковому записі.
 *  De weergave van het accountcentrum: vroeger alleen localStorage van dit apparaat, nu in het account (localStorage blijft cache). */
export const UITERLIJK_VORMGEVINGEN = ['maquette', 'studio', 'klassiek'] as const;
export type UiterlijkVormgeving = typeof UITERLIJK_VORMGEVINGEN[number];
/** Щільність інтерфейсу всього сайту: масштаб відступів (--ruimte-1…6). Без поля — «звичайна». Dichtheid: schaal van de witruimte. */
export const UITERLIJK_DICHTHEDEN = ['compact', 'normaal', 'ruim'] as const;
export type UiterlijkDichtheid = typeof UITERLIJK_DICHTHEDEN[number];
/** Рух: «systeem» — як на пристрої (prefers-reduced-motion), «minder» — менше руху завжди, поверх пристрою. Beweging. */
export const UITERLIJK_BEWEGINGEN = ['systeem', 'minder'] as const;
export type UiterlijkBeweging = typeof UITERLIJK_BEWEGINGEN[number];
/** Акцентний колір поверх палітри (кнопки, виділення, перемикачі, посилання, якорі, фокус, живий фон). Без поля — акцент самої палітри.
 *  ACCENT-001 (15.11.2026): додано вісім «улюблених відтінків» меню облікового запису (раніше вони були окремою палітрою лише в цьому
 *  браузері й губилися в будь-якій іншій палітрі). Старі чотири значення лишаються дійсними. Accentkleur boven elk palet. */
export const UITERLIJK_ACCENTEN = ['violet', 'cyan', 'pink', 'amber', 'blauw', 'hemel', 'teal', 'groen', 'oranje', 'roze', 'indigo', 'bruin'] as const;
export type UiterlijkAccent = typeof UITERLIJK_ACCENTEN[number];
/** Виразність декоративних ефектів (сяйво ілюстрацій), 0–100 %. Без поля — 45 %, як у макеті. Sterkte van decoratieve effecten. */
export const UITERLIJK_EFFECTEN_STANDAARD = 45;
/** ACCENT-001: прозорий режим блоків, 0–100 % (0 або без поля — вимкнено, блоки суцільні). 100 % — найпрозоріше, але текст лишається
 *  читабельним (непрозорість підкладки не нижча за 30 %). Doorschijnende blokken: 0 = uit; 100 = het meest doorschijnend. */
export const UITERLIJK_TRANSPARANTIE_STANDAARD_AAN = 50;

/** ACHTERGROND-001: «Живий фон» — повільні розмиті плями різних непропорційних форм, що переливаються від краю до краю сторінки.
 *  Зберігаються лише відмінні від типових поля (старі записи без поля = типовий фон). Levende achtergrond: alleen afwijkingen worden bewaard.
 *  stand: auto — повний на ПК, полегшений на телефоні/планшеті, нерухомий за «Зменшити рух»; aan — завжди повний; uit — статичний фон теми.
 *  tempo — плавність/швидкість руху; sterkte — інтенсивність; aantal — кількість плям; vervorming — наскільки форми непропорційні;
 *  grootte — розмір плям; kleuren — набір відтінків; kleurwissel — як швидко плями переливаються з відтінку у відтінок;
 *  overgang — характер руху; kader — частота кадрів (впливає на батарею). */
export const ACHTERGROND_STANDEN = ['auto', 'aan', 'uit'] as const;
export type AchtergrondStand = typeof ACHTERGROND_STANDEN[number];
export const ACHTERGROND_KLEUREN = ['thema', 'aurora', 'zee', 'zonsondergang', 'regenboog'] as const;
export type AchtergrondKleuren = typeof ACHTERGROND_KLEUREN[number];
export const ACHTERGROND_OVERGANGEN = ['golf', 'drift', 'adem'] as const;
export type AchtergrondOvergang = typeof ACHTERGROND_OVERGANGEN[number];
export const ACHTERGROND_KADERS = ['zuinig', 'normaal', 'vloeiend'] as const;
export type AchtergrondKader = typeof ACHTERGROND_KADERS[number];
export type UiterlijkAchtergrond = {
  stand: AchtergrondStand; tempo: number; sterkte: number; aantal: number; vervorming: number; grootte: number;
  kleuren: AchtergrondKleuren; kleurwissel: number; overgang: AchtergrondOvergang; kader: AchtergrondKader;
};
/** Межі числових полів [мін, макс]. Grenzen van de getallen. */
export const ACHTERGROND_GRENZEN = { tempo: [0, 100], sterkte: [0, 100], aantal: [2, 12], vervorming: [0, 100], grootte: [40, 160], kleurwissel: [0, 100] } as const;
export const ACHTERGROND_STANDAARD: UiterlijkAchtergrond = {
  stand: 'auto', tempo: 25, sterkte: 40, aantal: 6, vervorming: 60, grootte: 115, kleuren: 'thema', kleurwissel: 30, overgang: 'golf', kader: 'normaal',
};
/** Готові рівні — від ледь помітного до вражаючого (кнопка фону вгорі й «Теми»). Решта полів лишається як є.
 *  Voorinstellingen van nauwelijks zichtbaar tot opvallend; andere velden blijven zoals ze zijn. */
export const ACHTERGROND_NIVEAUS = ['subtiel', 'rustig', 'levendig', 'opvallend'] as const;
export type AchtergrondNiveau = typeof ACHTERGROND_NIVEAUS[number];
export const ACHTERGROND_NIVEAU_WAARDEN: Record<AchtergrondNiveau, Pick<UiterlijkAchtergrond, 'tempo' | 'sterkte' | 'kleurwissel' | 'aantal' | 'vervorming' | 'grootte'>> = {
  subtiel: { tempo: 12, sterkte: 18, kleurwissel: 15, aantal: 4, vervorming: 45, grootte: 130 },
  rustig: { tempo: 25, sterkte: 40, kleurwissel: 30, aantal: 6, vervorming: 60, grootte: 115 },
  levendig: { tempo: 50, sterkte: 65, kleurwissel: 55, aantal: 8, vervorming: 75, grootte: 105 },
  opvallend: { tempo: 75, sterkte: 90, kleurwissel: 80, aantal: 10, vervorming: 90, grootte: 95 },
};
/** Який рівень відповідає поточним значенням (або null, якщо щось змінено вручну). Welk niveau past bij de huidige waarden. */
export function achtergrondNiveau(a: UiterlijkAchtergrond): AchtergrondNiveau | null {
  for (const n of ACHTERGROND_NIVEAUS) { const w = ACHTERGROND_NIVEAU_WAARDEN[n]; if ((Object.keys(w) as Array<keyof typeof w>).every((k) => a[k] === w[k])) return n; }
  return null;
}
/** Повний набір налаштувань фону з частини (відсутнє — типове). Volledige instellingen uit een deel. */
export function achtergrondVolledig(deel: Partial<UiterlijkAchtergrond> | undefined): UiterlijkAchtergrond {
  return { ...ACHTERGROND_STANDAARD, ...(deel || {}) };
}

export const UITERLIJK_MAX_MENU = 16;
/** Profielfoto in de cache: alleen een https-adres, nooit een data:-URI (die is tot 340 kB groot en past nooit in een cookie). */
export const UITERLIJK_MAX_AVATAR = 1024;
export const UITERLIJK_MAX_PLAATS = 60;

/** Automatisch schakelen (zon of tijdvenster) — zelfde vorm als AutoInstelling in src/thema/kern.ts. */
export type UiterlijkAuto = { soort: 'interval' | 'zon'; van: string; tot: string; lat?: number; lon?: number; plaats?: string; pauzeTot?: number; pauzeModus?: 'light' | 'dark' };
/** Wat per account EN per ruimte staat. `op` = laatst gewijzigd (epoch-ms): bij het samenvoegen van cookie en sessionStorage wint de nieuwste PER SCOPE. */
export type UiterlijkRuimte = {
  versie: 1;
  modus?: UiterlijkModus;
  palet?: UiterlijkPalet;
  auto?: UiterlijkAuto;
  menu?: string[];
  geluid?: boolean;
  belPositie?: { x: number; y: number };
  laatstePad?: Partial<Record<UiterlijkDienst, string>>;
  routeBeeld?: Record<string, UiterlijkRouteBeeld>;
  /** IDENTITEIT-015: вигляд центру облікового запису, щільність, рух, акцент і виразність ефектів (старі записи без них — типові). */
  vormgeving?: UiterlijkVormgeving;
  dichtheid?: UiterlijkDichtheid;
  beweging?: UiterlijkBeweging;
  accent?: UiterlijkAccent;
  effecten?: number;
  /** ACCENT-001: прозорість блоків (1–100); без поля — суцільні блоки. Doorschijnendheid van blokken. */
  transparantie?: number;
  /** ACHTERGROND-001: лише поля, що відрізняються від ACHTERGROND_STANDAARD. Alleen afwijkingen van de standaard. */
  achtergrond?: Partial<UiterlijkAchtergrond>;
  op?: number;
};
/** Wat alleen per account staat (gelijk in beide ruimtes van dat account, nooit van een ander account). */
export type UiterlijkAccount = { versie: 1; taal?: UiterlijkTaal; avatar?: string; op?: number };

export const standaardUiterlijkRuimte = (): UiterlijkRuimte => ({ versie: 1 });
export const standaardUiterlijkAccount = (): UiterlijkAccount => ({ versie: 1 });
/** Punt 4: het technisch profiel ziet er standaard ANDERS uit (donker grafiet) dan de gebruikersruimte (kleur van de sectie, apparaatmodus),
 *  zodat je in één oogopslag ziet waar je werkt. Het is alleen een STANDAARD: zodra de eigenaar in het technische profiel een thema of
 *  palet kiest, staat dat in zijn eigen `technisch`-record en gaat deze standaard niet meer voor. */
export const STANDAARD_TECHNISCH: UiterlijkRuimte = { versie: 1, modus: 'dark', palet: 'grifel' };
/** De standaard van een ruimte: gebruikersruimte = niets (de app kiest apparaat + sectiekleur), technisch = eigen donker grafiet. */
export const standaardVoorRuimte = (ruimte: MenuRuimte): UiterlijkRuimte => (ruimte === 'technisch' ? { ...STANDAARD_TECHNISCH } : standaardUiterlijkRuimte());

// ------------------------------------------------------------------------------------------------ normalisatie
const een = <T extends string>(lijst: readonly T[], v: unknown): T | undefined => ((lijst as readonly string[]).includes(String(v)) ? v as T : undefined);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const getal = (v: unknown, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : undefined; };
const deel = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : undefined; };
const UUR = /^([01]\d|2[0-3]):([0-5]\d)$/;
const PAD = /^\/[a-z][a-z-]{1,23}$/;

/** Oude waarden («plum», «plum-light», «plum-dark») → modus + palet; zelfde regel als leesKeuze() in src/thema/kern.ts.
 *  Alleen voor wie de twee keuzes apart wil; de OPSLAG bewaart de oude waarde ongewijzigd (zie UITERLIJK_MODI_OUD). */
export function uiterlijkModusPalet(thema: unknown, palet: unknown): { modus?: UiterlijkModus; palet?: UiterlijkPalet } {
  if (thema === 'plum' || thema === 'plum-light') return { modus: 'light', palet: 'violet' };
  if (thema === 'plum-dark') return { modus: 'dark', palet: 'violet' };
  return { modus: een(UITERLIJK_MODI, thema), palet: een(UITERLIJK_PALETTEN, palet) };
}

/** Automatisch schakelen: zelfde grenzen als normaalAuto() in src/thema/kern.ts, maar zonder standaardwaarden bij te verzinnen. */
export function normaliseerUiterlijkAuto(raw: unknown): UiterlijkAuto | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const lat = getal(r.lat, -90, 90), lon = getal(r.lon, -180, 180);
  const pauzeTot = Number(r.pauzeTot), pauzeModus = r.pauzeModus === 'dark' ? 'dark' : r.pauzeModus === 'light' ? 'light' : undefined;
  const plaats = typeof r.plaats === 'string' && r.plaats.trim() ? r.plaats.trim().slice(0, UITERLIJK_MAX_PLAATS) : undefined;
  return {
    soort: r.soort === 'interval' ? 'interval' : 'zon',
    van: UUR.test(String(r.van)) ? String(r.van) : '20:00',
    tot: UUR.test(String(r.tot)) ? String(r.tot) : '07:00',
    ...(lat !== undefined && lon !== undefined ? { lat, lon } : {}),
    ...(plaats ? { plaats } : {}),
    ...(Number.isFinite(pauzeTot) && pauzeTot > 0 && pauzeModus ? { pauzeTot, pauzeModus } : {}),
  };
}

/** Profielfoto in de cache: alleen https, zonder inlognaam/wachtwoord, zonder fragment, hoogstens UITERLIJK_MAX_AVATAR tekens. */
export function normaliseerUiterlijkAvatar(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw || raw.length > UITERLIJK_MAX_AVATAR) return '';
  try { const url = new URL(raw); if (url.protocol !== 'https:' || url.username || url.password) return ''; url.hash = ''; return url.toString().slice(0, UITERLIJK_MAX_AVATAR); } catch { return ''; }
}

/** Strikte normalisatie (browser én server): onbekende velden weg, id's gevalideerd, grenzen afgedwongen. */
export function normaliseerUiterlijkRuimte(raw: unknown): UiterlijkRuimte {
  const r = obj(raw);
  const uit: UiterlijkRuimte = { versie: 1 };
  const modus = een(UITERLIJK_MODI, r.modus) || een(UITERLIJK_MODI_OUD, r.modus), palet = een(UITERLIJK_PALETTEN, r.palet);
  if (modus) uit.modus = modus;
  if (palet) uit.palet = palet;
  const auto = normaliseerUiterlijkAuto(r.auto);
  if (auto) uit.auto = auto;
  if (Array.isArray(r.menu)) {
    const menu = [...new Set(r.menu.filter((x): x is string => typeof x === 'string' && (DIENST_IDS as readonly string[]).includes(x)))].slice(0, UITERLIJK_MAX_MENU);
    if (menu.length) uit.menu = menu;
  }
  if (typeof r.geluid === 'boolean') uit.geluid = r.geluid;
  const bel = obj(r.belPositie), x = deel(bel.x), y = deel(bel.y);
  if (x !== undefined && y !== undefined) uit.belPositie = { x, y };
  const paden: Partial<Record<UiterlijkDienst, string>> = {};
  for (const dienst of UITERLIJK_DIENSTEN) {
    const pad = String(obj(r.laatstePad)[dienst] || '');
    if (PAD.test(pad) && (MENU_PAGINAS[dienst] || []).includes(pad.slice(1))) paden[dienst] = pad;
  }
  if (Object.keys(paden).length) uit.laatstePad = paden;
  const beelden: Record<string, UiterlijkRouteBeeld> = {};
  for (const [sleutel, waarde] of Object.entries(obj(r.routeBeeld))) {
    const [dienst, pagina] = String(sleutel).split(':');
    const beeld = een(UITERLIJK_ROUTEBEELDEN, waarde);
    if (beeld && (UITERLIJK_DIENSTEN as readonly string[]).includes(dienst) && (MENU_PAGINAS[dienst] || []).includes(pagina)) beelden[`${dienst}:${pagina}`] = beeld;
  }
  if (Object.keys(beelden).length) uit.routeBeeld = beelden;
  // IDENTITEIT-015: невідомі значення відкидаються (старий клієнт або підробка), типові значення не зберігаються зайвий раз.
  const vormgeving = een(UITERLIJK_VORMGEVINGEN, r.vormgeving), dichtheid = een(UITERLIJK_DICHTHEDEN, r.dichtheid);
  const beweging = een(UITERLIJK_BEWEGINGEN, r.beweging), accent = een(UITERLIJK_ACCENTEN, r.accent);
  if (vormgeving) uit.vormgeving = vormgeving;
  if (dichtheid && dichtheid !== 'normaal') uit.dichtheid = dichtheid;
  if (beweging && beweging !== 'systeem') uit.beweging = beweging;
  if (accent) uit.accent = accent;
  const effecten = r.effecten === null || r.effecten === undefined || r.effecten === '' ? NaN : Number(r.effecten);
  if (Number.isFinite(effecten) && effecten >= 0 && effecten <= 100 && Math.round(effecten) !== UITERLIJK_EFFECTEN_STANDAARD) uit.effecten = Math.round(effecten);
  const transparantie = typeof r.transparantie === 'number' || (typeof r.transparantie === 'string' && r.transparantie.trim() !== '') ? Number(r.transparantie) : NaN;
  if (Number.isFinite(transparantie) && transparantie > 0 && transparantie <= 100) uit.transparantie = Math.round(transparantie);
  const achtergrond = normaliseerAchtergrond(r.achtergrond);
  if (achtergrond) uit.achtergrond = achtergrond;
  const op = Number(r.op);
  if (Number.isFinite(op) && op > 0) uit.op = Math.floor(op);
  return uit;
}

/** ACHTERGROND-001: невідомі значення відкидаються, числа обмежуються межами, типові значення не зберігаються. Nooit iets buiten de grenzen. */
export function normaliseerAchtergrond(raw: unknown): Partial<UiterlijkAchtergrond> | undefined {
  const r = obj(raw), uit: Partial<UiterlijkAchtergrond> = {};
  const stand = een(ACHTERGROND_STANDEN, r.stand), kleuren = een(ACHTERGROND_KLEUREN, r.kleuren);
  const overgang = een(ACHTERGROND_OVERGANGEN, r.overgang), kader = een(ACHTERGROND_KADERS, r.kader);
  if (stand && stand !== ACHTERGROND_STANDAARD.stand) uit.stand = stand;
  if (kleuren && kleuren !== ACHTERGROND_STANDAARD.kleuren) uit.kleuren = kleuren;
  if (overgang && overgang !== ACHTERGROND_STANDAARD.overgang) uit.overgang = overgang;
  if (kader && kader !== ACHTERGROND_STANDAARD.kader) uit.kader = kader;
  for (const veld of Object.keys(ACHTERGROND_GRENZEN) as Array<keyof typeof ACHTERGROND_GRENZEN>) {
    const v = r[veld];
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const [min, max] = ACHTERGROND_GRENZEN[veld];
    const waarde = Math.max(min, Math.min(max, Math.round(n)));
    if (waarde !== ACHTERGROND_STANDAARD[veld]) uit[veld] = waarde;
  }
  return Object.keys(uit).length ? uit : undefined;
}

export function normaliseerUiterlijkAccount(raw: unknown): UiterlijkAccount {
  const r = obj(raw), uit: UiterlijkAccount = { versie: 1 };
  const taal = een(UITERLIJK_TALEN, r.taal);
  if (taal) uit.taal = taal;
  const avatar = normaliseerUiterlijkAvatar(r.avatar);
  if (avatar) uit.avatar = avatar;
  const op = Number(r.op);
  if (Number.isFinite(op) && op > 0) uit.op = Math.floor(op);
  return uit;
}

/** Is dit record leeg (alleen `versie`/`op`)? Dan hoeft het niet in de cookie of naar de server. */
export const uiterlijkLeeg = (v: UiterlijkRuimte | UiterlijkAccount) => Object.keys(v).filter((k) => k !== 'versie' && k !== 'op').length === 0;

// ------------------------------------------------------------------- twee webruimtes (profielen) op de server, punt 4
/** Wat de server per account bewaart: één veld `weergave` met BEIDE ruimtes apart — net als `sidebar` voor het menu. */
export type UiterlijkRuimtes = { versie: 2 } & Record<MenuRuimte, UiterlijkRuimte>;
export const standaardUiterlijkRuimtes = (): UiterlijkRuimtes => ({ versie: 2, gebruiker: standaardUiterlijkRuimte(), technisch: standaardUiterlijkRuimte() });
/** Oud formaat (één los record zonder ruimtes) wordt gelezen als de GEBRUIKERSruimte: niets gaat verloren en niets gaat naar het andere profiel. */
export function normaliseerUiterlijkRuimtes(raw: unknown): UiterlijkRuimtes {
  const r = obj(raw);
  const perRuimte = MENU_RUIMTES.some((k) => r[k] !== undefined && r[k] !== null);
  if (!perRuimte) return { versie: 2, gebruiker: normaliseerUiterlijkRuimte(raw), technisch: standaardUiterlijkRuimte() };
  return { versie: 2, gebruiker: normaliseerUiterlijkRuimte(r.gebruiker), technisch: normaliseerUiterlijkRuimte(r.technisch) };
}
/** De voorkeuren van één ruimte uit een opgeslagen waarde (oud of nieuw formaat). */
export const uiterlijkVoorRuimte = (raw: unknown, ruimte: MenuRuimte): UiterlijkRuimte => normaliseerUiterlijkRuimtes(raw)[ruimte];
/** Eén ruimte vervangen en de ANDERE ongemoeid laten (zo kan een profiel het andere nooit overschrijven). */
export const metUiterlijkRuimte = (raw: unknown, ruimte: MenuRuimte, v: unknown): UiterlijkRuimtes => ({ ...normaliseerUiterlijkRuimtes(raw), [ruimte]: normaliseerUiterlijkRuimte(v) });
