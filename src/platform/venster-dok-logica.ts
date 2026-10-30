// Zuivere regels van het VENSTERDOK (vensters.tsx → Dok): waar het staat, hoe groot, wat het voor zich vrijhoudt.
// Zonder browser te testen: tests/eenheid/venster-dok-20261021.test.ts.
//
// Klacht eigenaar 21.10.2026 (telefoon 390 px, mcp.tarasevych.com, «Підключення Claude»): het dok («Відкриті вікна: 2» met de
// lijst altijd uitgeklapt) lag BOVEN het toestemmingsvenster (z-index VENSTER_BASIS + n·10 + 5) en dekte «Далі», «Заборонити»,
// «Пізніше» en de rijen met rechten; verplaatsen kon niet; het open venster stond er ook nog eens in. Regels nu:
//   1. Het dok staat aan een RAND van het scherm (standaard onder) en houdt die strook vrij: DOK_RUIMTE px (plus de veilige zone).
//      Vensters blijven erbuiten (CSS-variabelen --venster-dok-<rand> en binnenZone) — dus nooit een knop van een venster onder het dok.
//   2. Vorm: telefoon onder/boven = smalle STROOK over de breedte (44 px hoog); computer onder/boven = compacte PIL;
//      links/rechts = KNOP 44×44. De lijst klapt alleen op een tik open, als menu naar binnen toe.
//   3. Het dok wijkt voor de ACTIESTAPEL (25.10.2026: «Написати», «Вгору» en — als de gebruiker hem daar zette — de bel staan in
//      gniezda van één stapel rechtsonder, shared/plaatsing.ts). De stapel staat vast; het dok neemt de vrije ruimte ernaast.
//   4. Slepen laat het dok los volgen; bij loslaten klikt het aan de dichtstbijzijnde rand vast (t = plaats langs die rand, 0…1).
import type { Randen } from '../mail-opstel-plaats';

export type DokRand = 'onder' | 'boven' | 'links' | 'rechts';
export type DokStand = { rand: DokRand; t: number };
export type DokVorm = 'strook' | 'pil' | 'knop';
export type DokRect = { left: number; top: number; width: number; height: number };
export type DokPlek = DokRect & { vorm: DokVorm; rand: DokRand };

export const DOK_RANDEN: readonly DokRand[] = ['onder', 'boven', 'links', 'rechts'];
/** Standaard: onderaan; op de computer rechts (naast de bel), op de telefoon de hele breedte (t telt dan niet). */
export const DOK_STANDAARD: DokStand = { rand: 'onder', t: 1 };
/** Hoogte van de strook/pil en zijde van de knop = tikhoogte. */
export const DOK_H = 44;
/** Afstand van het dok tot de schermrand (bovenop de veilige zone). */
export const DOK_AFSTAND = 4;
/** Wat vensters aan de kant van het dok vrijlaten (hun eigen 8 px marge komt erbij). */
export const DOK_RUIMTE = DOK_AFSTAND + DOK_H;
/** Marge rondom de bel/FAB en tot de schermrand langs de as. */
export const DOK_MARGE = 8;
/** Onder deze breedte: telefoon (zelfde grens als vensters.css / Venster `smal`). */
export const DOK_SMAL = 560;
export const DOK_PIL_MAX = 360;
/** Vanaf zoveel px beweging is een aanraking slepen (anders een tik). */
export const DOK_SLEEPDREMPEL = 6;

const klem = (v: number, a: number, b: number) => Math.min(Math.max(v, a), Math.max(a, b));
const horizontaal = (r: DokRand) => r === 'onder' || r === 'boven';

export function dokVorm(rand: DokRand, vw: number): DokVorm {
  if (!horizontaal(rand)) return 'knop';
  return vw < DOK_SMAL ? 'strook' : 'pil';
}

/** Uit opslag (localStorage) of een knop: altijd een geldige stand. */
export function normaliseerDokStand(x: unknown): DokStand {
  const o = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
  const rand = DOK_RANDEN.includes(o.rand as DokRand) ? (o.rand as DokRand) : DOK_STANDAARD.rand;
  const t = typeof o.t === 'number' && Number.isFinite(o.t) ? klem(o.t, 0, 1) : DOK_STANDAARD.t;
  return { rand, t };
}

/** Hindernissen voor het dok (25.10.2026): de actiestapel — alle gereserveerde gniezda, ook als «Написати» nog niet getekend is of
 *  «Вгору» even niet zichtbaar is, zodat het dok niet springt als een knop verschijnt. Lege of ontbrekende rechthoeken tellen niet. */
export function dokHindernissen(...rechthoeken: Array<DokRect | null | undefined>): DokRect[] {
  return rechthoeken.filter((h): h is DokRect => !!h && h.width > 0 && h.height > 0).map((h) => ({ left: h.left, top: h.top, width: h.width, height: h.height }));
}

/** Wat het dok aan zijn rand vrijhoudt (px, zonder de veilige zone — die tellen vensters zelf al). */
export function dokRuimte(stand: DokStand | null): Record<DokRand, number> {
  const uit: Record<DokRand, number> = { onder: 0, boven: 0, links: 0, rechts: 0 };
  if (stand) uit[stand.rand] = DOK_RUIMTE;
  return uit;
}

/** Vrije stukken van [a0, a1] na aftrek van de geblokkeerde intervallen. */
function vrijeStukken(a0: number, a1: number, blok: Array<[number, number]>): Array<[number, number]> {
  const uit: Array<[number, number]> = [];
  let p = a0;
  for (const [b0, b1] of [...blok].sort((x, y) => x[0] - y[0])) {
    if (b1 <= p) continue;
    if (b0 > p) uit.push([p, Math.min(b0, a1)]);
    p = Math.max(p, b1);
    if (p >= a1) break;
  }
  if (p < a1) uit.push([p, a1]);
  return uit.filter(([x, y]) => y - x > 0);
}

/**
 * Plaats van het dok (vensterpixels). `pilBreedte`: gemeten natuurlijke breedte van de pil (computer, onder/boven).
 * De rechthoek raakt de hindernissen (bel, FAB) niet, blijft binnen het scherm en binnen de veilige randen.
 */
export function dokPlaats(stand: DokStand, vw: number, vh: number, r: Randen, pilBreedte: number, hindernissen: DokRect[]): DokPlek {
  const rand = stand.rand;
  const vorm = dokVorm(rand, vw);
  const hor = horizontaal(rand);
  // dwars op de as: vaste plek aan de rand
  const dwars = rand === 'onder' ? vh - r.onder - DOK_AFSTAND - DOK_H : rand === 'boven' ? r.boven + DOK_AFSTAND : rand === 'links' ? r.links + DOK_AFSTAND : vw - r.rechts - DOK_AFSTAND - DOK_H;
  // langs de as
  const a0 = hor ? DOK_MARGE + r.links : DOK_MARGE + r.boven;
  const a1 = hor ? vw - DOK_MARGE - r.rechts : vh - DOK_MARGE - r.onder;
  const blok: Array<[number, number]> = [];
  for (const h of hindernissen) {
    if (!(h.width > 0 && h.height > 0)) continue;
    const [d0, d1] = hor ? [h.top, h.top + h.height] : [h.left, h.left + h.width];
    if (d1 + DOK_MARGE / 2 <= dwars || d0 - DOK_MARGE / 2 >= dwars + DOK_H) continue; // ligt niet in de band van het dok
    const [l0, l1] = hor ? [h.left, h.left + h.width] : [h.top, h.top + h.height];
    blok.push([l0 - DOK_MARGE, l1 + DOK_MARGE]);
  }
  const stukken = vrijeStukken(a0, a1, blok);
  const maak = (p: number, len: number): DokPlek => {
    const q = Math.round(p), l = Math.round(len), d = Math.round(dwars);
    return hor ? { left: q, top: d, width: l, height: DOK_H, vorm, rand } : { left: d, top: q, width: DOK_H, height: l, vorm, rand };
  };
  if (vorm === 'strook') {
    // het langste vrije stuk (bij gelijke lengte het eerste): standaard van de linkermarge tot links van de bel
    const best = stukken.reduce<[number, number] | null>((m, s) => (!m || s[1] - s[0] > m[1] - m[0] ? s : m), null) ?? [a0, a1];
    return maak(best[0], best[1] - best[0]);
  }
  const len = vorm === 'knop' ? DOK_H : Math.min(Math.max(DOK_H, pilBreedte || DOK_H * 4), DOK_PIL_MAX, a1 - a0);
  const gewenst = klem(a0 + stand.t * (a1 - a0) - len / 2, a0, a1 - len);
  const past = (p: number) => p >= a0 - 0.5 && p + len <= a1 + 0.5 && !blok.some(([b0, b1]) => p < b1 && p + len > b0);
  const kandidaten = [gewenst, a0, a1 - len, ...blok.flatMap(([b0, b1]) => [b0 - len, b1])].filter(past);
  const p = kandidaten.length ? kandidaten.reduce((m, c) => (Math.abs(c - gewenst) < Math.abs(m - gewenst) ? c : m)) : gewenst;
  return maak(p, len);
}

/** Losgelaten na slepen: de dichtstbijzijnde rand, en t = waar langs die rand (midden van het dok). */
export function dokStandVanPunt(cx: number, cy: number, vw: number, vh: number): DokStand {
  const afstand: Record<DokRand, number> = { links: cx, rechts: vw - cx, boven: cy, onder: vh - cy };
  const rand = (Object.keys(afstand) as DokRand[]).reduce((m, k) => (afstand[k] < afstand[m] ? k : m), 'onder' as DokRand);
  const t = horizontaal(rand) ? (cx - DOK_MARGE) / Math.max(1, vw - 2 * DOK_MARGE) : (cy - DOK_MARGE) / Math.max(1, vh - 2 * DOK_MARGE);
  return { rand, t: Math.round(klem(t, 0, 1) * 1000) / 1000 };
}

/** Een knop «Перемістити …»: naar die rand. Evenwijdige rand: t blijft; anders naar het einde (onder/rechts) — naast de bel/FAB. */
export function dokNaarRand(huidig: DokStand, rand: DokRand): DokStand {
  if (huidig.rand === rand) return huidig;
  return { rand, t: horizontaal(rand) === horizontaal(huidig.rand) ? huidig.t : 1 };
}

/** Richting waarin het menu (de lijst) opengaat: altijd naar binnen, en langs de as naar de kant met de meeste ruimte. */
export function dokMenuRichting(plek: DokRect & { rand: DokRand }, vw: number, vh: number): { naar: DokRand; uitlijn: 'begin' | 'eind' } {
  const naar: DokRand = plek.rand === 'onder' ? 'boven' : plek.rand === 'boven' ? 'onder' : plek.rand === 'links' ? 'rechts' : 'links';
  const midden = horizontaal(plek.rand) ? (plek.left + plek.width / 2) / vw : (plek.top + plek.height / 2) / vh;
  return { naar, uitlijn: midden > 0.5 ? 'eind' : 'begin' };
}
