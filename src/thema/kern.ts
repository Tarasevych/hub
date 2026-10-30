// Thema-kern (punt 1 van de UX-ronde): twee losse keuzes in plaats van vijf vaste thema's.
//  • PALET — welke kleuren: 'grifel' (het vertrouwde donker-grafietgroen, #2f4f4f-familie), 'puur' (zuiver wit overdag /
//    zuiver zwart «QLED» 's nachts), 'violet' (één violet palet, toon volgt de modus) en 'kleur' (elke sectie/subdomein krijgt
//    zijn eigen kleur uit het menu, licht én donker).
//  • MODUS — licht/donker als laag BOVENOP het palet: 'light', 'dark', 'device' (volgt het apparaat) of 'auto' (zelf schakelen
//    op een vast tijdvenster of op het echte donker worden: burgerlijke schemering, zon 6° onder de horizon).
// Pauze «Скасувати автоперемикання на сьогодні»: houdt de ANDERE modus vast tot het volgende geplande schakelmoment.
// Puur en zonder DOM: dezelfde regels staan als JavaScript in public/canonical-service.js (runtime.thema) voor het allereerste
// beeld zonder flits; een eenheidstest vergelijkt beide.

export type Modus = 'light' | 'dark' | 'device' | 'auto';
export type Palet = 'grifel' | 'puur' | 'violet' | 'kleur';
export type AutoSoort = 'interval' | 'zon';
export type AutoInstelling = { soort: AutoSoort; van: string; tot: string; lat?: number; lon?: number; plaats?: string; pauzeTot?: number; pauzeModus?: 'light' | 'dark' };
export type Presentatie = 'light' | 'dark' | 'plum-light' | 'plum-dark';

export const PALETTEN: readonly Palet[] = ['kleur', 'grifel', 'puur', 'violet'];
/** Standaard: de kleur van de sectie (zoals het menu), gevraagd door de eigenaar. */
export const STANDAARD_PALET: Palet = 'kleur';
export const STANDAARD_AUTO: AutoInstelling = { soort: 'zon', van: '20:00', tot: '07:00' };
/** Zonder gekozen plaats: Brussel (de eigenaar woont in België); afgerond op 0,1° — geen precieze locatie nodig. */
export const STANDAARD_PLAATS = { lat: 50.8, lon: 4.4, plaats: 'Brussel' };

const UUR = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isModus = (v: unknown): v is Modus => v === 'light' || v === 'dark' || v === 'device' || v === 'auto';
export const isPalet = (v: unknown): v is Palet => v === 'grifel' || v === 'puur' || v === 'violet' || v === 'kleur';
const getal = (v: unknown, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 10) / 10 : undefined; };

export function normaalAuto(raw: unknown): AutoInstelling {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lat = getal(r.lat, -90, 90), lon = getal(r.lon, -180, 180);
  const pauzeTot = Number(r.pauzeTot), pauzeModus = r.pauzeModus === 'dark' ? 'dark' : r.pauzeModus === 'light' ? 'light' : undefined;
  return {
    soort: r.soort === 'interval' ? 'interval' : 'zon',
    van: UUR.test(String(r.van)) ? String(r.van) : STANDAARD_AUTO.van,
    tot: UUR.test(String(r.tot)) ? String(r.tot) : STANDAARD_AUTO.tot,
    ...(lat !== undefined && lon !== undefined ? { lat, lon } : {}),
    ...(typeof r.plaats === 'string' && r.plaats.trim() ? { plaats: r.plaats.trim().slice(0, 60) } : {}),
    ...(Number.isFinite(pauzeTot) && pauzeTot > 0 && pauzeModus ? { pauzeTot, pauzeModus } : {}),
  };
}

// ---------------------------------------------------------------- zon (zonsopgang-vergelijking, NOAA/Wikipedia-benadering)
const RAD = Math.PI / 180;
/** Begin en einde van «licht buiten» (zon boven −6°) op de LOKALE kalenderdag van `dag`, als epoch-ms.
 *  'nacht' = de zon komt die dag niet boven −6° (poolnacht), 'dag' = de zon zakt niet onder −6° (witte nachten). */
export function zonTijden(dag: Date, lat: number, lon: number): { op: number; onder: number } | 'nacht' | 'dag' {
  const middag = new Date(dag.getFullYear(), dag.getMonth(), dag.getDate(), 12, 0, 0, 0).getTime();
  const jd = middag / 86400000 + 2440587.5;
  const n = Math.ceil(jd - 2451545.0 + 0.0008);
  const jster = n - lon / 360;
  const M = (357.5291 + 0.98560028 * jster) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const L = (M + C + 180 + 102.9372) % 360;
  const transit = 2451545.0 + jster + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * L * RAD);
  const sinD = Math.sin(L * RAD) * Math.sin(23.4397 * RAD), cosD = Math.cos(Math.asin(sinD));
  const cosW = (Math.sin(-6 * RAD) - Math.sin(lat * RAD) * sinD) / (Math.cos(lat * RAD) * cosD);
  if (cosW > 1) return 'nacht';
  if (cosW < -1) return 'dag';
  const w = Math.acos(cosW) / RAD;
  const ms = (j: number) => Math.round((j - 2440587.5) * 86400000);
  return { op: ms(transit - w / 360), onder: ms(transit + w / 360) };
}

const middernachtNa = (nu: number) => { const d = new Date(nu); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); };
const opUur = (nu: number, hhmm: string, dagen = 0) => { const d = new Date(nu); const [h, m] = hhmm.split(':').map(Number); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dagen, h, m, 0, 0).getTime(); };

/** Is het nu «donker» volgens de automatische regel, en wanneer is het volgende schakelmoment (epoch-ms)? Zonder pauze. */
export function autoZonderPauze(a: AutoInstelling, nu: number): { donker: boolean; volgende: number } {
  if (a.soort === 'interval') {
    if (a.van === a.tot) return { donker: false, volgende: middernachtNa(nu) };
    // alle grenzen van gisteren t/m morgen, gesorteerd; de laatste ≤ nu bepaalt de toestand
    const grenzen: Array<{ t: number; donker: boolean }> = [];
    for (const d of [-1, 0, 1, 2]) { grenzen.push({ t: opUur(nu, a.van, d), donker: true }, { t: opUur(nu, a.tot, d), donker: false }); }
    grenzen.sort((x, y) => x.t - y.t);
    let donker = false, volgende = middernachtNa(nu);
    for (const g of grenzen) { if (g.t <= nu) donker = g.donker; else { volgende = g.t; break; } }
    return { donker, volgende };
  }
  const lat = a.lat ?? STANDAARD_PLAATS.lat, lon = a.lon ?? STANDAARD_PLAATS.lon;
  const d = new Date(nu);
  const vandaag = zonTijden(d, lat, lon);
  if (vandaag === 'nacht') return { donker: true, volgende: middernachtNa(nu) };
  if (vandaag === 'dag') return { donker: false, volgende: middernachtNa(nu) };
  if (nu < vandaag.op) return { donker: true, volgende: vandaag.op };
  if (nu < vandaag.onder) return { donker: false, volgende: vandaag.onder };
  const morgen = zonTijden(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), lat, lon);
  return { donker: true, volgende: typeof morgen === 'object' ? morgen.op : middernachtNa(nu) };
}

export function autoNu(a: AutoInstelling, nu: number): { donker: boolean; volgende: number; gepauzeerd: boolean } {
  if (a.pauzeTot && a.pauzeModus && nu < a.pauzeTot) return { donker: a.pauzeModus === 'dark', volgende: a.pauzeTot, gepauzeerd: true };
  return { ...autoZonderPauze(a, nu), gepauzeerd: false };
}

/** «Скасувати автоперемикання на сьогодні»: zet de ANDERE modus vast tot het volgende geplande schakelmoment. */
export function pauzeer(a: AutoInstelling, nu: number): AutoInstelling {
  const r = autoZonderPauze(a, nu);
  return { ...a, pauzeTot: r.volgende, pauzeModus: r.donker ? 'light' : 'dark' };
}
export function hervat(a: AutoInstelling): AutoInstelling { const { pauzeTot: _t, pauzeModus: _m, ...rest } = a; return rest; }

/** Oude waarden ('plum-dark' …) en de nieuwe twee keuzes → modus + palet. */
export function leesKeuze(theme: unknown, palet: unknown): { modus: Modus; palet: Palet } {
  if (theme === 'plum-dark' || theme === 'plum-light' || theme === 'plum') return { modus: theme === 'plum-dark' ? 'dark' : 'light', palet: 'violet' };
  return { modus: isModus(theme) ? theme : 'device', palet: isPalet(palet) ? palet : STANDAARD_PALET };
}

/** Wat er nu getoond wordt. Violet zonder recht (geen eigenaar/entitlement) valt terug op grifel; de opgeslagen keuze blijft. */
export function resolveer(o: { theme: unknown; palet: unknown; auto: unknown; apparaatDonker: boolean; nu: number; violetToegestaan?: boolean }): { donker: boolean; palet: Palet; presentatie: Presentatie; volgende: number | null; gepauzeerd: boolean } {
  const k = leesKeuze(o.theme, o.palet);
  const palet: Palet = k.palet === 'violet' && o.violetToegestaan === false ? 'grifel' : k.palet;
  let donker = false, volgende: number | null = null, gepauzeerd = false;
  if (k.modus === 'dark') donker = true;
  else if (k.modus === 'device') donker = o.apparaatDonker;
  else if (k.modus === 'auto') { const r = autoNu(normaalAuto(o.auto), o.nu); donker = r.donker; volgende = r.volgende; gepauzeerd = r.gepauzeerd; }
  const presentatie: Presentatie = palet === 'violet' ? (donker ? 'plum-dark' : 'plum-light') : (donker ? 'dark' : 'light');
  return { donker, palet, presentatie, volgende, gepauzeerd };
}

/** Plaatsen om uit te kiezen zonder de browser naar de locatie te vragen (afgerond op 0,1°). */
export const PLAATSEN: ReadonlyArray<{ id: string; uk: string; nl: string; lat: number; lon: number }> = [
  { id: 'brussel', uk: 'Брюссель', nl: 'Brussel', lat: 50.8, lon: 4.4 },
  { id: 'antwerpen', uk: 'Антверпен', nl: 'Antwerpen', lat: 51.2, lon: 4.4 },
  { id: 'gent', uk: 'Гент', nl: 'Gent', lat: 51.1, lon: 3.7 },
  { id: 'brugge', uk: 'Брюгге', nl: 'Brugge', lat: 51.2, lon: 3.2 },
  { id: 'leuven', uk: 'Лювен', nl: 'Leuven', lat: 50.9, lon: 4.7 },
  { id: 'luik', uk: 'Льєж', nl: 'Luik', lat: 50.6, lon: 5.6 },
  { id: 'hasselt', uk: 'Гасселт', nl: 'Hasselt', lat: 50.9, lon: 5.3 },
  { id: 'amsterdam', uk: 'Амстердам', nl: 'Amsterdam', lat: 52.4, lon: 4.9 },
  { id: 'kyiv', uk: 'Київ', nl: 'Kyiv', lat: 50.5, lon: 30.5 },
  { id: 'lviv', uk: 'Львів', nl: 'Lviv', lat: 49.8, lon: 24 },
  { id: 'odesa', uk: 'Одеса', nl: 'Odesa', lat: 46.5, lon: 30.7 },
  { id: 'kharkiv', uk: 'Харків', nl: 'Charkiv', lat: 50, lon: 36.2 },
];
