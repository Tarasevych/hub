// WERKBLAD («Робочий стіл») van de hub — hub.*/overzicht (zone F, 22.10.2026).
//
// Dit bestand is de ZUIVERE kern: de catalogus van widgets, de vorm van een indeling, de normalisatie (browser én server —
// de server vertrouwt de browser niet), de plaatsing op het raster (geen overlap), de rechten per gegevenslade en de
// overzetting van de twee oudere vormen (bureaublad 0067/hub_bureau_v1 en de oude hub-blokken van App.tsx).
// Geen React, geen DOM, geen netwerk: alles hier is zonder browser te testen (tests/eenheid/werkblad-*.test.ts).
//
// Waarom een geordende lijst met formaat in rastereenheden en geen vrije x/y: hetzelfde werkblad moet op een telefoon
// (1 kolom), een tablet (6) en een monitor (12) werken; een geordende lijst schuift mee, is met het toetsenbord te
// bedienen en `plaatsen()` legt de tegels deterministisch neer zonder gaten of overlap.
//
// Eerlijkheidsregel (zelfde als shared/bureau-indeling.ts): een widget met `bron` leest ECHTE gegevens van die route;
// een widget met `stand: 'binnenkort'` staat wel in de catalogus (met `ontbreekt`) maar kan nooit op het werkblad liggen.
import type { HulpItem } from './hulp-register';

export type WerkbladRuimte = 'prive' | 'technisch';
export type WerkbladCategorie = 'start' | 'post' | 'agenda' | 'taken' | 'bestanden' | 'zoek' | 'diensten' | 'ai' | 'systeem' | 'technisch' | 'oud';
export type WerkbladWidgetId =
  | 'begroeting' | 'snel-toegang' | 'snelle-acties' | 'tip'
  | 'post' | 'agenda' | 'taken' | 'notities' | 'bord'
  | 'bestanden' | 'opslag' | 'zoek-recent'
  | 'diensten' | 'ai' | 'systeem' | 'github'
  | 'tech-server' | 'tech-updates' | 'tech-diagnostiek'
  | 'oud-blok' | 'snelkoppeling';

export type Tweetalig = readonly [string, string];
export type WerkbladStand = 'klaar' | 'binnenkort';

export type WerkbladWidgetDef = {
  id: WerkbladWidgetId;
  cat: WerkbladCategorie;
  titel: Tweetalig;
  uitleg: Tweetalig;
  /** standaardformaat in kolommen (van 12) en rijen */
  k: number; r: number;
  /** kleinste toegestane formaat */
  minK: number; minR: number;
  stand: WerkbladStand;
  /** De route(s) die de echte gegevens leveren; leeg bij 'binnenkort' en bij widgets zonder serverbron (begroeting, tip). */
  bron: string;
  ontbreekt?: Tweetalig;
  /** In welke gegevensladen de widget mag liggen. */
  ruimtes: readonly WerkbladRuimte[];
  /** Mag maar één keer op het werkblad liggen. */
  enkel?: boolean;
  /** Alleen via overzetting (oude blokken) — staat niet in de catalogus om nieuw toe te voegen. */
  verborgenInCatalogus?: boolean;
};

/** Breedte per kolom van 12 (minimum 2: smaller is niet leesbaar) en hoogte in rijen van 96 px. */
export const KOLOMMEN = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const RIJEN = [1, 2, 3, 4, 5, 6] as const;
export const RASTER_KOLOMMEN = 12;
export const MAX_ITEMS = 24;
export const ACHTERGRONDEN = ['geen', 'nacht', 'zee', 'woud', 'avond', 'eigen'] as const;
export type Achtergrond = typeof ACHTERGRONDEN[number];
/** Eigen achtergrond: een data-URL (image/jpeg|webp) van ten hoogste 400 kB — klein genoeg voor één rij in app.werkblad_indeling. */
export const EIGEN_ACHTERGROND_MAX = 400_000;

export const WERKBLAD_CATEGORIEEN: ReadonlyArray<{ id: WerkbladCategorie; titel: Tweetalig }> = Object.freeze([
  { id: 'start', titel: ['Початок', 'Start'] },
  { id: 'post', titel: ['Пошта', 'E-mail'] },
  { id: 'agenda', titel: ['Календар', 'Agenda'] },
  { id: 'taken', titel: ['Завдання й нотатки', 'Taken en notities'] },
  { id: 'bestanden', titel: ['Файли та сховища', 'Bestanden en opslag'] },
  { id: 'zoek', titel: ['Пошук', 'Zoeken'] },
  { id: 'diensten', titel: ['Служби', 'Diensten'] },
  { id: 'ai', titel: ['ШІ', 'AI'] },
  { id: 'systeem', titel: ['Система', 'Systeem'] },
  { id: 'technisch', titel: ['Технічний простір', 'Technische ruimte'] },
  { id: 'oud', titel: ['Старі блоки', 'Oude blokken'] },
]);

const BEIDE: readonly WerkbladRuimte[] = Object.freeze(['prive', 'technisch']);
const TECH: readonly WerkbladRuimte[] = Object.freeze(['technisch']);
const BLOK = 'POST /api/owner/hub/blocks/data';
const BORD = 'POST /api/mcp/board/list';

export const WERKBLAD_WIDGETS: readonly WerkbladWidgetDef[] = Object.freeze([
  { id: 'begroeting', cat: 'start', titel: ['Привітання', 'Begroeting'], uitleg: ['Ваше ім’я, дата й час, частина доби.', 'Uw naam, datum en tijd, dagdeel.'], k: 9, r: 1, minK: 4, minR: 1, stand: 'klaar', bron: '', ruimtes: BEIDE, enkel: true },
  { id: 'snel-toegang', cat: 'start', titel: ['Швидкий доступ', 'Snelle toegang'], uitleg: ['Плитки служб із вашого меню — ті, до яких ви маєте доступ.', 'Tegels van de diensten uit uw menu — die waar u toegang toe hebt.'], k: 5, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: '', ruimtes: BEIDE, enkel: true },
  { id: 'snelle-acties', cat: 'start', titel: ['Швидкі дії', 'Snelle acties'], uitleg: ['Нова нотатка, нове завдання, нова подія, лист, пошук.', 'Nieuwe notitie, nieuwe taak, nieuwe afspraak, bericht, zoeken.'], k: 3, r: 2, minK: 2, minR: 2, stand: 'klaar', bron: '', ruimtes: BEIDE, enkel: true },
  { id: 'tip', cat: 'start', titel: ['Підказка', 'Tip'], uitleg: ['Смуга «Використовуйте свій простір ще ефективніше» з кнопкою «Налаштувати».', 'De strook «Haal meer uit uw ruimte» met de knop «Instellen».'], k: 12, r: 1, minK: 6, minR: 1, stand: 'klaar', bron: '', ruimtes: BEIDE, enkel: true },
  { id: 'post', cat: 'post', titel: ['Пошта', 'E-mail'], uitleg: ['Останні листи й кількість непрочитаних із синхронізованої проєкції.', 'Laatste berichten en het aantal ongelezen uit de gesynchroniseerde projectie.'], k: 5, r: 3, minK: 3, minR: 1, stand: 'klaar', bron: BLOK, ruimtes: BEIDE },
  { id: 'agenda', cat: 'agenda', titel: ['Календар', 'Agenda'], uitleg: ['Місяць і найближчі події з підключеного календаря.', 'Maand en de eerstvolgende afspraken uit de gekoppelde agenda.'], k: 4, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: BLOK, ruimtes: BEIDE },
  { id: 'taken', cat: 'taken', titel: ['Завдання', 'Taken'], uitleg: ['Відкриті завдання з вашої дошки з фільтрами «Усі / У роботі / Заблоковані».', 'Open taken van uw bord met de filters «Alle / Bezig / Geblokkeerd».'], k: 4, r: 3, minK: 3, minR: 1, stand: 'klaar', bron: BORD, ruimtes: BEIDE },
  { id: 'notities', cat: 'taken', titel: ['Нотатки', 'Notities'], uitleg: ['Останні або закріплені нотатки цього простору.', 'Laatste of vastgezette notities van deze ruimte.'], k: 4, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: BORD, ruimtes: BEIDE },
  { id: 'bord', cat: 'taken', titel: ['Дошка', 'Bord'], uitleg: ['Стан дошки за колонками та останні зміни.', 'Stand van het bord per kolom en de laatste wijzigingen.'], k: 4, r: 2, minK: 3, minR: 2, stand: 'klaar', bron: BORD, ruimtes: BEIDE },
  { id: 'bestanden', cat: 'bestanden', titel: ['Останні файли', 'Laatste bestanden'], uitleg: ['Останні файли з вашої хмари й проєкції Google Drive.', 'Laatste bestanden uit uw cloud en de Google Drive-projectie.'], k: 3, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: BLOK, ruimtes: BEIDE },
  { id: 'opslag', cat: 'bestanden', titel: ['Хмарні сховища', 'Cloudopslag'], uitleg: ['Підключені сховища та обсяг — лише те, що сервер справді знає (Google Drive передає квоту при підключенні).', 'Gekoppelde opslag en gebruik — alleen wat de server echt weet (Google Drive geeft de quota bij het koppelen).'], k: 3, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: BLOK, ruimtes: BEIDE },
  { id: 'zoek-recent', cat: 'zoek', titel: ['Нещодавні пошуки', 'Recente zoekopdrachten'], uitleg: ['Ваші останні пошукові запити на сервері (цієї лади).', 'Uw laatste zoekopdrachten op de server (van deze lade).'], k: 3, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: 'POST /api/owner/zoek/geschiedenis/lijst', ruimtes: BEIDE },
  { id: 'diensten', cat: 'diensten', titel: ['Статус служб', 'Status van diensten'], uitleg: ['Пошта, календар, Drive, пристрої — стан саме вашого акаунта.', 'E-mail, agenda, Drive, apparaten — de stand van uw eigen account.'], k: 3, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: 'POST /api/owner/diagnostiek/mijn-diensten', ruimtes: BEIDE },
  { id: 'ai', cat: 'ai', titel: ['ШІ для вас', 'AI voor u'], uitleg: ['Що вміє ШІ у вашому просторі — з переходом до робочої області.', 'Wat AI in uw ruimte kan — met een sprong naar het werkgebied.'], k: 3, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: '', ruimtes: BEIDE, enkel: true },
  { id: 'systeem', cat: 'systeem', titel: ['Системна інформація', 'Systeeminformatie'], uitleg: ['Замість погоди (зовнішніх хмар немає): чи відповідає сайт, час і часовий пояс, пристрій онлайн, мова й тема.', 'In plaats van weer (geen externe clouds): antwoordt de site, tijd en tijdzone, apparaat online, taal en thema.'], k: 3, r: 2, minK: 3, minR: 2, stand: 'klaar', bron: 'GET /__gezondheid', ruimtes: BEIDE, enkel: true },
  { id: 'github', cat: 'diensten', titel: ['GitHub', 'GitHub'], uitleg: ['Ваші репозиторії та активність.', 'Uw repositories en activiteit.'], k: 4, r: 3, minK: 3, minR: 2, stand: 'binnenkort', bron: '', ruimtes: BEIDE, ontbreekt: ['Маршрути GitHub на сервері приймають лише сесію служби github.*, тому хаб не може їх запитати. Потрібен окремий маршрут читання для хаба.', 'De GitHub-routes op de server accepteren alleen een sessie van de dienst github.*, dus de hub mag ze niet aanroepen. Er is een eigen leesroute voor de hub nodig.'] },
  { id: 'tech-server', cat: 'technisch', titel: ['Сервер', 'Server'], uitleg: ['Навантаження, пам’ять, час роботи, база даних — лише в технічному просторі.', 'Belasting, geheugen, uptime, database — alleen in de technische ruimte.'], k: 4, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: 'POST /api/owner/hub/werkblad/tech', ruimtes: TECH, enkel: true },
  { id: 'tech-updates', cat: 'technisch', titel: ['Оновлення', 'Updates'], uitleg: ['Поточний випуск і останні розгортання.', 'Huidige release en de laatste uitrol-runs.'], k: 5, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: 'POST /api/owner/hub/werkblad/tech', ruimtes: TECH, enkel: true },
  { id: 'tech-diagnostiek', cat: 'technisch', titel: ['Діагностика', 'Diagnostiek'], uitleg: ['Останній стан перевірок сервера (ok / увага / збій).', 'Laatste stand van de servercontroles (ok / let op / fout).'], k: 3, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: 'POST /api/owner/hub/werkblad/tech', ruimtes: TECH, enkel: true },
  { id: 'oud-blok', cat: 'oud', titel: ['Старий блок', 'Oud blok'], uitleg: ['Блок із попереднього огляду (пошта/файли/календар) у старому вигляді.', 'Een blok van het vorige overzicht (e-mail/bestanden/agenda) in de oude vorm.'], k: 4, r: 3, minK: 3, minR: 2, stand: 'klaar', bron: BLOK, ruimtes: BEIDE, verborgenInCatalogus: true },
  { id: 'snelkoppeling', cat: 'oud', titel: ['Посилання', 'Snelkoppeling'], uitleg: ['Власний блок-посилання з попереднього огляду.', 'Een eigen linkblok van het vorige overzicht.'], k: 3, r: 1, minK: 2, minR: 1, stand: 'klaar', bron: '', ruimtes: BEIDE, verborgenInCatalogus: true },
]);

export const WERKBLAD_WIDGET_IDS: readonly WerkbladWidgetId[] = Object.freeze(WERKBLAD_WIDGETS.map((w) => w.id));
export const werkbladWidget = (id: unknown): WerkbladWidgetDef | undefined => WERKBLAD_WIDGETS.find((w) => w.id === id);

/** Context voor rechten: in welke lade ligt het werkblad en wat mag deze mens. */
export type WerkbladContext = { ruimte: WerkbladRuimte; eigenaar?: boolean; apiPlatform?: boolean };

/** Mag deze widget in deze lade liggen? Technische widgets alleen in de technische lade; «binnenkort» nooit. */
export function toegestaan(id: unknown, ctx: WerkbladContext): boolean {
  const def = werkbladWidget(id);
  if (!def || def.stand !== 'klaar') return false;
  return def.ruimtes.includes(ctx.ruimte);
}

/** Instellingen per tegel (klein, platte sleutels; alles anders valt weg). */
export type WerkbladInst = Record<string, string | number | boolean>;
export type WerkbladItem = { tid: string; id: WerkbladWidgetId; k: number; r: number; inst?: WerkbladInst };
export type WerkbladIndeling = { v: 2; items: WerkbladItem[]; achtergrond: Achtergrond };

export const TID = /^[a-z][a-z0-9_-]{0,23}$/;
const INST_SLEUTEL = /^[a-zA-Z][a-zA-Z0-9]{0,24}$/;
const INST_MAX = 12;
const INST_TEKST_MAX = 1600;

export const leegWerkblad = (achtergrond: Achtergrond = 'nacht'): WerkbladIndeling => ({ v: 2, items: [], achtergrond });
export const leegIs = (ind: WerkbladIndeling): boolean => ind.items.length === 0;

const dichtstBij = (waarde: number, toegestaan: readonly number[], min: number) => {
  const mogelijk = toegestaan.filter((x) => x >= min);
  const lijst = mogelijk.length ? mogelijk : toegestaan;
  let beste = lijst[0];
  for (const x of lijst) if (Math.abs(x - waarde) < Math.abs(beste - waarde)) beste = x;
  return beste;
};

/** Eerste vrije instantie-id (w1, w2, …): zuiver, dus server en browser komen op hetzelfde uit. */
export function nieuweTid(ind: Pick<WerkbladIndeling, 'items'>): string {
  const bezet = new Set(ind.items.map((t) => t.tid));
  for (let n = 1; n <= MAX_ITEMS + 1; n += 1) { const k = `w${n}`; if (!bezet.has(k)) return k; }
  return `w${MAX_ITEMS + 2}`;
}

function instSchonen(raw: unknown): WerkbladInst | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const uit: WerkbladInst = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!INST_SLEUTEL.test(k) || n >= INST_MAX) continue;
    if (typeof v === 'string') { const s = v.replace(/\u0000/g, '').slice(0, INST_TEKST_MAX); if (s) { uit[k] = s; n += 1; } }
    else if (typeof v === 'number' && Number.isFinite(v)) { uit[k] = v; n += 1; }
    else if (typeof v === 'boolean') { uit[k] = v; n += 1; }
  }
  return n ? uit : undefined;
}

export const achtergrondOf = (v: unknown): Achtergrond => ((ACHTERGRONDEN as readonly string[]).includes(String(v ?? '')) ? String(v) as Achtergrond : 'nacht');

/**
 * Maakt van willekeurige invoer een geldige indeling voor DEZE lade. Dezelfde functie draait in de browser en op de server:
 * onbekende, niet-toegestane («binnenkort», technisch in de persoonlijke lade) widgets, dubbele of ongeldige instantie-id's,
 * dubbele «enkel»-widgets en formaten buiten het raster vallen weg of worden rechtgezet. Stabiel: tweemaal toepassen verandert niets.
 */
export function normaliseerWerkblad(raw: unknown, ctx: WerkbladContext): WerkbladIndeling {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const bron = o.items;
  const items: WerkbladItem[] = [];
  if (Array.isArray(bron)) {
    const gezien = new Set<string>();
    const enkelGezien = new Set<WerkbladWidgetId>();
    for (const rij of bron.slice(0, MAX_ITEMS * 3)) {
      if (items.length >= MAX_ITEMS) break;
      if (!rij || typeof rij !== 'object' || Array.isArray(rij)) continue;
      const r = rij as Record<string, unknown>;
      const def = werkbladWidget(r.id);
      if (!def || !toegestaan(def.id, ctx)) continue;
      if (def.enkel) { if (enkelGezien.has(def.id)) continue; enkelGezien.add(def.id); }
      const gevraagd = typeof r.tid === 'string' && TID.test(r.tid) ? r.tid : '';
      let tid = gevraagd && !gezien.has(gevraagd) ? gevraagd : '';
      if (!tid) { tid = nieuweTid({ items }); if (gezien.has(tid)) continue; }
      gezien.add(tid);
      const inst = instSchonen(r.inst);
      items.push({ tid, id: def.id, k: dichtstBij(Number(r.k) || def.k, KOLOMMEN, def.minK), r: dichtstBij(Number(r.r) || def.r, RIJEN, def.minR), ...(inst ? { inst } : {}) });
    }
  }
  return { v: 2, items, achtergrond: achtergrondOf(o.achtergrond) };
}

export function voegToe(ind: WerkbladIndeling, id: unknown, ctx: WerkbladContext, inst?: WerkbladInst, naar?: number): WerkbladIndeling {
  const def = werkbladWidget(id);
  if (!def || !toegestaan(def.id, ctx) || ind.items.length >= MAX_ITEMS) return ind;
  if (def.enkel && ind.items.some((t) => t.id === def.id)) return ind;
  const schoon = instSchonen(inst);
  const item: WerkbladItem = { tid: nieuweTid(ind), id: def.id, k: def.k, r: def.r, ...(schoon ? { inst: schoon } : {}) };
  const items = ind.items.slice();
  items.splice(naar === undefined ? items.length : Math.max(0, Math.min(items.length, Math.trunc(naar))), 0, item);
  return { ...ind, items };
}

export function verwijder(ind: WerkbladIndeling, tid: string): WerkbladIndeling {
  const over = ind.items.filter((t) => t.tid !== tid);
  return over.length === ind.items.length ? ind : { ...ind, items: over };
}

/** Verplaatst een tegel naar een andere plek in de volgorde (dat is de plek op het raster). */
export function verplaats(ind: WerkbladIndeling, tid: string, naar: number): WerkbladIndeling {
  const van = ind.items.findIndex((t) => t.tid === tid);
  if (van < 0) return ind;
  const doel = Math.max(0, Math.min(ind.items.length - 1, Math.trunc(naar)));
  if (doel === van) return ind;
  const items = ind.items.slice();
  const [t] = items.splice(van, 1);
  items.splice(doel, 0, t);
  return { ...ind, items };
}

export function schuif(ind: WerkbladIndeling, tid: string, richting: -1 | 1): WerkbladIndeling {
  const van = ind.items.findIndex((t) => t.tid === tid);
  if (van < 0 || van + richting < 0 || van + richting >= ind.items.length) return ind;
  return verplaats(ind, tid, van + richting);
}

export function formaat(ind: WerkbladIndeling, tid: string, k?: number, r?: number): WerkbladIndeling {
  const t = ind.items.find((x) => x.tid === tid);
  const def = t && werkbladWidget(t.id);
  if (!t || !def) return ind;
  const nk = k === undefined ? t.k : dichtstBij(k, KOLOMMEN, def.minK);
  const nr = r === undefined ? t.r : dichtstBij(r, RIJEN, def.minR);
  if (nk === t.k && nr === t.r) return ind;
  return { ...ind, items: ind.items.map((x) => (x.tid === tid ? { ...x, k: nk, r: nr } : x)) };
}

export function stapFormaat(huidig: number, toegestaanLijst: readonly number[], min: number, richting: -1 | 1): number {
  const lijst = toegestaanLijst.filter((x) => x >= min);
  const i = Math.max(0, lijst.indexOf(huidig));
  return lijst[Math.max(0, Math.min(lijst.length - 1, i + richting))];
}

export function zetInst(ind: WerkbladIndeling, tid: string, inst: WerkbladInst): WerkbladIndeling {
  const t = ind.items.find((x) => x.tid === tid);
  if (!t) return ind;
  const schoon = instSchonen({ ...(t.inst || {}), ...inst });
  return { ...ind, items: ind.items.map((x) => (x.tid === tid ? (schoon ? { ...x, inst: schoon } : { tid: x.tid, id: x.id, k: x.k, r: x.r }) : x)) };
}

export function zetAchtergrond(ind: WerkbladIndeling, achtergrond: unknown): WerkbladIndeling {
  const a = achtergrondOf(achtergrond);
  return a === ind.achtergrond ? ind : { ...ind, achtergrond: a };
}

// ---------------------------------------------------------------------------------------------------------------- plaatsing
export type Plek = { tid: string; x: number; y: number; k: number; r: number };

/** Hoeveel rasterkolommen een tegel inneemt bij een gegeven rasterbreedte (1, 6 of 12). Op 6 kolommen halveert alles netjes. */
export const kolommenBij = (k: number, raster: number): number => {
  if (raster >= RASTER_KOLOMMEN) return Math.max(1, Math.min(raster, k));
  if (raster <= 2) return raster;
  // Tablet (6 kolommen): een widget is daar de helft of de hele breedte — zo ontstaat een rustig raster van twee kolommen
  // zonder gaten van één kolom (8 of breder van 12 → hele breedte, de rest → de helft).
  return k >= 8 ? raster : Math.max(1, Math.floor(raster / 2));
};

/**
 * Legt de tegels in VOLGORDE neer op het raster: elke tegel op de eerste vrije plek (links boven eerst) waar zij past.
 * Geen overlap, geen tegel buiten het raster, geen afhankelijkheid van de browser. De uitkomst is wat de CSS-grid krijgt
 * (grid-column / grid-row expliciet), dus wat de mens ziet is precies wat hier staat.
 */
export function plaatsen(items: readonly WerkbladItem[], raster: number): Plek[] {
  const kol = Math.max(1, Math.trunc(raster));
  const bezet: boolean[][] = [];
  const vrij = (x: number, y: number, k: number, r: number) => {
    for (let yy = y; yy < y + r; yy += 1) for (let xx = x; xx < x + k; xx += 1) if (bezet[yy]?.[xx]) return false;
    return true;
  };
  const zet = (x: number, y: number, k: number, r: number) => {
    for (let yy = y; yy < y + r; yy += 1) { bezet[yy] ??= []; for (let xx = x; xx < x + k; xx += 1) bezet[yy][xx] = true; }
  };
  const uit: Plek[] = [];
  for (const t of items) {
    const k = kolommenBij(t.k, kol), r = Math.max(1, t.r);
    let gelegd = false;
    for (let y = 0; !gelegd; y += 1) {
      for (let x = 0; x + k <= kol; x += 1) {
        if (vrij(x, y, k, r)) { zet(x, y, k, r); uit.push({ tid: t.tid, x, y, k, r }); gelegd = true; break; }
      }
      if (y > MAX_ITEMS * 6) break; // kan niet gebeuren (k ≤ kol), maar nooit eindeloos
    }
  }
  return uit;
}

/** Overlappen twee plekken? (voor de test en voor een controle na het slepen) */
export const overlapt = (a: Plek, b: Plek): boolean => a.x < b.x + b.k && b.x < a.x + a.k && a.y < b.y + b.r && b.y < a.y + a.r;
export const heeftOverlap = (plekken: readonly Plek[]): boolean => plekken.some((a, i) => plekken.slice(i + 1).some((b) => overlapt(a, b)));

/**
 * Waar een gesleepte tegel terechtkomt: vóór de eerste tegel waarvan het midden voorbij de aanwijzer ligt (rijen van boven
 * naar beneden, binnen een rij van links naar rechts). Zuiver: alleen rechthoeken en een punt.
 */
export function neerzetIndex(rechthoeken: ReadonlyArray<{ left: number; top: number; width: number; height: number }>, x: number, y: number): number {
  for (let i = 0; i < rechthoeken.length; i += 1) {
    const r = rechthoeken[i];
    const midX = r.left + r.width / 2, midY = r.top + r.height / 2;
    if (y < r.top || (y <= r.top + r.height && x < midX) || (y < midY && x < r.left)) return i;
  }
  return rechthoeken.length;
}

export const gelijkWerkblad = (a: WerkbladIndeling, b: WerkbladIndeling) => JSON.stringify(a) === JSON.stringify(b);
export const werkbladTekst = (paar: Tweetalig, lang: 'uk' | 'nl') => (lang === 'uk' ? paar[0] : paar[1]);

// ---------------------------------------------------------------------------------------------------------------- standaard
/** Het werkblad waarmee iemand begint die nog niets had: het voorbeeld van de eigenaar (22.10.2026). */
/**
 * De standaard volgt het voorbeeld van de eigenaar (22.10.2026): bovenaan de begroeting met rechts de systeeminformatie (waar
 * het voorbeeld het weer had), daaronder snelle toegang en de agenda met rechts een smalle kolom (recente zoekopdrachten,
 * snelle acties), dan post en taken, een rij met bestanden / opslag / AI / stand van de diensten, en onderaan de tip-strook.
 * Formaten zijn hier vast gekozen zodat plaatsen() op 12 kolommen het raster zonder gaten vult (eenheidstest controleert dat).
 */
export const STANDAARD_PRIVE: ReadonlyArray<readonly [WerkbladWidgetId, number, number]> = Object.freeze([
  ['begroeting', 9, 1], ['systeem', 3, 2], ['snel-toegang', 5, 3], ['agenda', 4, 3], ['zoek-recent', 3, 3], ['post', 5, 3], ['taken', 4, 3],
  ['snelle-acties', 3, 2], ['bestanden', 3, 3], ['opslag', 3, 3], ['ai', 3, 3], ['diensten', 3, 3], ['tip', 12, 1],
] as const);
export const STANDAARD_TECHNISCH: ReadonlyArray<readonly [WerkbladWidgetId, number, number]> = Object.freeze([
  ['begroeting', 9, 1], ['systeem', 3, 2], ['snel-toegang', 5, 3], ['tech-server', 4, 3], ['tech-diagnostiek', 3, 3], ['tech-updates', 5, 3],
  ['diensten', 4, 3], ['zoek-recent', 3, 2],
] as const);
export function standaardWerkblad(ctx: WerkbladContext): WerkbladIndeling {
  let ind = leegWerkblad('nacht');
  for (const [id, k, r] of ctx.ruimte === 'technisch' ? STANDAARD_TECHNISCH : STANDAARD_PRIVE) {
    const voor = ind.items.length;
    ind = voegToe(ind, id, ctx);
    if (ind.items.length > voor) ind = formaat(ind, ind.items[ind.items.length - 1].tid, k, r);
  }
  return ind;
}

// ---------------------------------------------------------------------------------------------------------------- overzetting
/** Het oude bureaublad (shared/bureau-indeling.ts, hub_bureau_v1): elke oude tegel krijgt haar nieuwe widget, zonder verlies. */
export const BUREAU_NAAR_WERKBLAD: Readonly<Record<string, { id: WerkbladWidgetId; inst?: WerkbladInst }>> = Object.freeze({
  'post-laatste': { id: 'post' }, 'post-tellers': { id: 'post', inst: { weergave: 'tellers' } },
  'agenda-komend': { id: 'agenda' }, 'agenda-vandaag': { id: 'agenda', inst: { filter: 'vandaag' } },
  'bestanden-recent': { id: 'bestanden' },
  'taken-volgende': { id: 'taken' }, 'taken-tellers': { id: 'taken', inst: { weergave: 'tellers' } },
  'notities-laatste': { id: 'notities' }, 'notities-vast': { id: 'notities', inst: { filter: 'vast' } },
  'diensten-stand': { id: 'diensten' },
});

type OudeTegel = { tid?: unknown; id?: unknown; k?: unknown; r?: unknown };
export function vanBureau(oud: unknown, ctx: WerkbladContext): WerkbladIndeling {
  const tegels = oud && typeof oud === 'object' && Array.isArray((oud as { tegels?: unknown }).tegels) ? (oud as { tegels: OudeTegel[] }).tegels : [];
  let ind = leegWerkblad('nacht');
  for (const t of tegels) {
    const m = BUREAU_NAAR_WERKBLAD[String(t?.id ?? '')];
    if (!m) continue;
    const def = werkbladWidget(m.id)!;
    const voor = ind.items.length;
    ind = voegToe(ind, m.id, ctx, m.inst);
    if (ind.items.length === voor) continue;
    const laatste = ind.items[ind.items.length - 1];
    ind = formaat(ind, laatste.tid, Number(t.k) || def.k, Number(t.r) || def.r);
  }
  return ind;
}

/** De oude hub-blokken van App.tsx (kind mail/files/calendar met HubBlockWidget, of een eigen linkblok). */
export type OudBlok = { id: string; kind: string; title: string; description?: string; url?: string; visible: boolean; position: number; size?: string; custom?: boolean; presentation?: string; itemLimit?: number; showMeta?: boolean; showDescription?: boolean; blockTheme?: string; backgroundColor?: string; backgroundImage?: string };

/**
 * De zes blokken die de server in ELKE nieuwe werkruimte zet (backend/index.ts `const defaults = [...]` — de eenheidstest
 * werkblad-indeling vergelijkt deze kopie met dat bestand). Een blok dat er nog precies zo bij staat, is geen instelling van de
 * mens: het werkblad heeft daarvoor zijn eigen widgets (post, bestanden, agenda, taken, ai) in de standaardindeling.
 */
export const STANDAARD_BLOKKEN: ReadonlyArray<readonly [kind: string, titel: string, beschrijving: string, formaat: string]> = Object.freeze([
  ['focus', 'Зараз', 'Один найближчий крок без перевантаження.', 'wide'],
  ['mail', 'Пошта', 'Листи, відповіді та майбутня розумна обробка.', 'medium'],
  ['files', 'Файли й знання', 'Документи, диски та база знань.', 'medium'],
  ['calendar', 'Календар', 'Події, зустрічі й м’які нагадування.', 'small'],
  ['projects', 'Проєкти', 'GitHub, робочі процеси та контрольні точки.', 'medium'],
  ['automation', 'Автоматизації', 'Заплановані дії, Telegram і фонові процеси.', 'small'],
] as const);

/** Heeft de mens dit blok zelf veranderd (eigen blok, andere naam/tekst/adres/formaat/weergave/kleur, of verborgen)? */
export function blokAangepast(b: OudBlok): boolean {
  if (b.custom) return true;
  const std = STANDAARD_BLOKKEN.find((d) => d[0] === b.kind);
  if (!std) return true;
  if (String(b.title || '').trim() !== std[1] || (b.description !== undefined && String(b.description).trim() !== std[2])) return true;
  if (String(b.url || '').trim()) return true;
  if (b.visible === false) return true;
  if (b.size && b.size !== std[3]) return true;
  if ((b.presentation && b.presentation !== 'summary') || (b.itemLimit && b.itemLimit !== 5) || b.showMeta === false || b.showDescription === false) return true;
  if ((b.blockTheme && b.blockTheme !== 'auto') || b.backgroundColor || b.backgroundImage) return true;
  return false;
}
const BLOK_SOORTEN = ['mail', 'files', 'calendar'];
const blokFormaat = (size: unknown): number => (size === 'wide' ? 8 : size === 'small' ? 3 : 4);

/**
 * Zet de oude blokken over die de mens ZELF heeft ingesteld (blokAangepast): zichtbare komen in volgorde op het werkblad
 * (functionele blokken als «oud blok» in de oude vorm, linkblokken als «snelkoppeling»); verborgen komen NIET op het werkblad
 * maar blijven als lijst (`verborgen`) beschikbaar in de catalogus — niets gaat verloren. Onaangeroerde standaardblokken vallen
 * weg: hun inhoud (post, bestanden, agenda) staat al als widget in de standaardindeling.
 */
export function vanBlokken(blokken: readonly OudBlok[], ctx: WerkbladContext): { indeling: WerkbladIndeling; verborgen: OudBlok[] } {
  const gesorteerd = [...blokken].sort((a, b) => a.position - b.position);
  let ind = leegWerkblad('nacht');
  const verborgen: OudBlok[] = [];
  for (const b of gesorteerd) {
    const inst = blokInst(b);
    if (!inst || !blokAangepast(b)) continue; // onaangeroerde standaardblokken: het werkblad heeft er eigen widgets voor
    if (!b.visible) { verborgen.push(b); continue; }
    const voor = ind.items.length;
    ind = voegToe(ind, inst.id, ctx, inst.inst);
    if (ind.items.length > voor) ind = formaat(ind, ind.items[ind.items.length - 1].tid, blokFormaat(b.size), inst.id === 'snelkoppeling' ? 1 : 3);
  }
  return { indeling: ind, verborgen };
}

/** Welke widget een oud blok wordt (null = er is niets om over te zetten: een kaal blok zonder functie of adres). */
export function blokInst(b: OudBlok): { id: WerkbladWidgetId; inst: WerkbladInst } | null {
  if (BLOK_SOORTEN.includes(b.kind)) return { id: 'oud-blok', inst: { blokId: b.id, soort: b.kind, titel: b.title, presentation: String(b.presentation || 'summary'), itemLimit: Number(b.itemLimit || 5), showMeta: b.showMeta !== false } };
  const url = String(b.url || '').trim();
  if (/^https:\/\//.test(url)) return { id: 'snelkoppeling', inst: { blokId: b.id, titel: b.title, url, beschrijving: String(b.description || '').slice(0, 300) } };
  return null;
}

/**
 * De eerste keer dat het werkblad opengaat (geen rij in app.werkblad_indeling): wat de mens had, in deze volgorde —
 * het oude bureaublad (als het tegels had), anders de standaard met daarin de oude blokken die de mens zelf instelde
 * (als er zichtbare waren), anders de standaard.
 * Nooit een lege pagina: dan de standaard. `herkomst` zegt waar het vandaan komt (voor de melding op het scherm en het verslag).
 */
export function eersteWerkblad(bron: { bureau?: unknown; blokken?: readonly OudBlok[] }, ctx: WerkbladContext): { indeling: WerkbladIndeling; herkomst: 'bureau' | 'blokken' | 'standaard'; verborgen: OudBlok[] } {
  const vb = vanBureau(bron.bureau, ctx);
  const blok = vanBlokken(bron.blokken || [], ctx);
  if (!leegIs(vb)) {
    // bureaublad was de laatste bron van waarheid; oude functionele blokken staan al als nieuwe widgets erin — linkblokken erbij
    let ind = vb;
    for (const t of blok.indeling.items) if (t.id === 'snelkoppeling') ind = voegToe(ind, t.id, ctx, t.inst);
    return { indeling: voegToe(voegToe(ind, 'begroeting', ctx, undefined, 0), 'snel-toegang', ctx, undefined, 1), herkomst: 'bureau', verborgen: blok.verborgen };
  }
  if (!leegIs(blok.indeling)) {
    // de standaard van deze lade, en de eigen blokken van de mens ervóór de tip-strook (die hoort onderaan)
    let ind = standaardWerkblad(ctx);
    const plek = () => { const i = ind.items.findIndex((t) => t.id === 'tip'); return i < 0 ? ind.items.length : i; };
    for (const t of blok.indeling.items) { const voor = ind.items.length; ind = voegToe(ind, t.id, ctx, t.inst, plek()); if (ind.items.length > voor) { const nieuw = ind.items[plek() - 1]; ind = formaat(ind, nieuw.tid, t.k, t.r); } }
    return { indeling: ind, herkomst: 'blokken', verborgen: blok.verborgen };
  }
  return { indeling: standaardWerkblad(ctx), herkomst: 'standaard', verborgen: blok.verborgen };
}

// ---------------------------------------------------------------------------------------------------------------- technisch
/** Technische samenvatting (POST /api/owner/hub/werkblad/tech, backend/werkblad.ts): alleen in de technische lade. */
export type TechSamenvatting = {
  nu: number;
  server: { node: string; uptimeS: number; load1: number; kernen: number; geheugenPct: number; geheugenTotaalMb: number; db: boolean; dbMs: number };
  release: { versie: string | null; commit: string | null; commitStatus: string; samenvatting: string | null };
  uitrol: Array<{ id: string; versie: string; staat: string; stap: string; pct: number; gestart: string; geeindigd: string; uk: string; nl: string }>;
  /** 23.10 (integratie): `naam`/`reden` als leesbare tekst (uk, nl) uit het register — het werkblad toonde de interne id en code. */
  diagnostiek: { ok: number; letOp: number; fout: number; slecht: Array<{ id: string; stand: string; code: string; op: number; naam?: readonly [string, string]; reden?: readonly [string, string] }>; laatsteOp: number } | null;
};

// ---------------------------------------------------------------------------------------------------------------- hulp
const T = (uk: string, nl: string): Tweetalig => [uk, nl];
const H = (wat: Tweetalig, gevolg: Tweetalig, risico: Tweetalig, dev: Tweetalig): HulpItem => ({ wat, gevolg, risico, dev, bron: 'src/werkblad/Werkblad.tsx' });
/** Uitleg «?» bij de knoppen van de instelmodus (shared/hulp-register.ts registreert dit blok). */
export const HELP_WERKBLAD: Readonly<Record<string, HulpItem>> = Object.freeze({
  'werkblad.instellen': H(
    T('Режим «Налаштувати»: перетягування, зміна розміру, додавання й прибирання віджетів робочого столу.', 'De instelmodus: slepen, formaat wijzigen, widgets toevoegen en weghalen op het werkblad.'),
    T('Поки режим увімкнено, заголовки віджетів стають ручками для перетягування, а в куті з’являється ручка розміру; кожна зміна одразу зберігається на сервері для цієї лади (особистий або технічний простір).', 'Zolang de modus aanstaat, worden de koppen van de widgets sleepgrepen en verschijnt rechtsonder een formaatgreep; elke wijziging wordt meteen op de server bewaard voor deze lade (persoonlijke of technische ruimte).'),
    T('Низький ризик: змінюється лише ваша розкладка; дані віджетів не змінюються. Випадкове прибирання віджета можна повернути через каталог.', 'Laag risico: alleen uw indeling verandert; de gegevens van de widgets niet. Een per ongeluk weggehaald widget zet u via de catalogus terug.'),
    T('src/werkblad/Werkblad.tsx (instelmodus), shared/werkblad-indeling.ts (чисті правила), backend/werkblad.ts → app.werkblad_indeling (0112, RLS, user_id + ruimte).', 'src/werkblad/Werkblad.tsx (instelmodus), shared/werkblad-indeling.ts (zuivere regels), backend/werkblad.ts → app.werkblad_indeling (0112, RLS, user_id + ruimte).'),
  ),
  'werkblad.achtergrond': H(
    T('Фон робочого столу: нейтральний градієнт із набору або власне зображення.', 'De achtergrond van het werkblad: een neutraal verloop uit de set of een eigen afbeelding.'),
    T('Градієнти лежать у CSS (жодних чужих фото); власне зображення зменшується у браузері до ≤ 400 кБ і зберігається у вашому рядку розкладки на сервері.', 'De verlopen staan in CSS (geen foto’s van anderen); een eigen afbeelding wordt in de browser verkleind tot ≤ 400 kB en in uw eigen indelingsrij op de server bewaard.'),
    T('Низький ризик: зображення бачите лише ви (RLS). Велике зображення уповільнює перший рендер — тому межа 400 кБ.', 'Laag risico: de afbeelding ziet alleen u (RLS). Een grote afbeelding vertraagt de eerste weergave — daarom de grens van 400 kB.'),
    T('shared/werkblad-indeling.ts ACHTERGRONDEN / EIGEN_ACHTERGROND_MAX; колонка achtergrond_eigen у app.werkblad_indeling; src/werkblad/werkblad.css .wb-achtergrond-*.', 'shared/werkblad-indeling.ts ACHTERGRONDEN / EIGEN_ACHTERGROND_MAX; kolom achtergrond_eigen in app.werkblad_indeling; src/werkblad/werkblad.css .wb-achtergrond-*.'),
  ),
  'werkblad.terugzetten': H(
    T('Скинути робочий стіл до стандартної розкладки цієї лади.', 'Het werkblad terugzetten naar de standaardindeling van deze lade.'),
    T('Ваша збережена розкладка видаляється з сервера й локального кешу; віджети стають як у прикладі власника. Старі блоки й старий стіл не зникають — їх можна знову додати з каталогу.', 'Uw bewaarde indeling wordt van de server en uit de lokale cache verwijderd; de widgets staan weer zoals in het voorbeeld van de eigenaar. Oude blokken en het oude bureaublad verdwijnen niet — ze zijn opnieuw uit de catalogus toe te voegen.'),
    T('Середній ризик для вашого часу: власну розкладку доведеться скласти заново. Дані віджетів не чіпаються.', 'Middelmatig risico voor uw tijd: een eigen indeling moet u opnieuw samenstellen. De gegevens van de widgets blijven onaangeroerd.'),
    T('POST /api/owner/hub/werkblad/terugzetten → DELETE … WHERE user_id = $1 AND ruimte = $2 (backend/werkblad.ts); клієнт потім бере standaardWerkblad(ctx).', 'POST /api/owner/hub/werkblad/terugzetten → DELETE … WHERE user_id = $1 AND ruimte = $2 (backend/werkblad.ts); de client neemt daarna standaardWerkblad(ctx).'),
  ),
});
