// INTEG-001 (03.11.2026) — DRIE DELEN van het meldingenpaneel: «Нові», «Прочитані», «Архів». Puur (geen React/netwerk), dezelfde regel
// voor het v2-paneel (groepen) en het oude paneel (losse regels); getest in tests/eenheid/meldingen-integ-20261103.test.ts (deel E).
//
// Eigenaar: «сповіщення позначається прочитаним, коли його вже було показано користувачеві … Зараз архів порожній, а панель пуста.
// Потрібні розділи «Нові», «Прочитані» й «Архів» з чітким списком.»
// Wat er mis was: de tabs «Важливі/Усі/Непрочитані/Вирішені/Архів» (v3) of «Важливі/Усі/Непрочитані» (v2) begonnen op «Важливі»
// («Нічого не потребує уваги» = een leeg paneel), geslaagd achtergrondwerk was standaard verborgen, en «Архів» vulde zich alleen als u
// zelf iets archiveerde. Nu:
//   Нові      — nog niet gezien (en het telt: niet «тихе»). Wat u in het open paneel ziet, wordt meteen gelezen maar blijft tot het
//               sluiten in «Нові» staan (vastNieuw), zodat de lijst niet onder uw ogen leegloopt.
//   Прочитані — gezien, nog niet opgeruimd; ook stille meldingen (geslaagd achtergrondwerk) staan hier, zonder teller.
//   Архів     — opgeruimd («Очистити»), opgelost (een latere gelukte stap of «вирішено»), of gelezen en ouder dan ARCHIEF_NA_DAGEN.
// Niets wordt gewist: «Повернути з архіву» zet de status terug.
import type { Toestand, V2Groep } from './groepering';
import { vraagtAandacht } from './groepering';
import { isUitgesteld } from './status';

export type Sectie = 'nieuw' | 'gelezen' | 'archief';
export const SECTIES: readonly Sectie[] = ['nieuw', 'gelezen', 'archief'];
/** Gelezen meldingen gaan na zoveel dagen vanzelf naar «Архів» (zo blijft «Прочитані» kort en is het archief niet leeg). */
export const ARCHIEF_NA_DAGEN = 7;
const DAG = 86400_000;

export type SectieInvoer = { gelezen: boolean; toestand?: Toestand; tijd: number; /** false = stil (telt niet in de bel): nooit «нове». */ telt?: boolean };
export function sectieVan(x: SectieInvoer, nu: number, archiefNaMs = ARCHIEF_NA_DAGEN * DAG): Sectie {
  if (x.toestand === 'archief' || x.toestand === 'opgelost') return 'archief';
  if (!x.gelezen && x.telt !== false) return 'nieuw';
  if (nu - x.tijd >= archiefNaMs) return 'archief';
  return 'gelezen';
}

/** Laatste beweging van een groep (nieuwste regel of terugkeer na uitstel). */
export const laatsteTijd = (g: V2Groep) => Math.max(g.hoofd.tijd, ...g.leden.map((x) => x.terugOp || 0));
/** Een proces dat gewoon klaar is (activiteit «виконано», `afgerond`) is geen opgelost probleem: gewone regel, geen archief. */
export const sectieVanGroep = (g: V2Groep, nu: number): Sectie =>
  sectieVan({ gelezen: g.ongelezen === 0, toestand: g.toestand === 'opgelost' && g.hoofd.afgerond ? undefined : g.toestand, tijd: laatsteTijd(g), telt: g.levering.teller || g.levering.beschermd }, nu);

export type SectieOpties = {
  /** Ook wat een regel «Вимкнене» uit het centrum haalt. */
  toonVerborgen?: boolean;
  /** Sleutels die bij het openen van het paneel (of terwijl het open was) nieuw waren: blijven in «Нові» tot het paneel sluit. */
  vastNieuw?: ReadonlySet<string>;
};
export function sectieLijst(groepen: readonly V2Groep[], sectie: Sectie, nu: number, o: SectieOpties = {}): V2Groep[] {
  const lijst = groepen.filter((g) => {
    if (isUitgesteld(g, nu)) return false;
    if (!g.levering.centrum && !o.toonVerborgen) return false;
    const s = sectieVanGroep(g, nu);
    const vast = s !== 'archief' && !!o.vastNieuw?.has(g.sleutel);
    if (sectie === 'nieuw') return s === 'nieuw' || vast;
    if (sectie === 'gelezen') return s === 'gelezen' && !vast;
    return s === 'archief' && !g.hoofd.opgeruimd;
  });
  // «Нові»: wat aandacht vraagt (fout, verzoek, beveiliging) bovenaan; verder het nieuwste eerst.
  return lijst.sort((a, b) => (sectie === 'nieuw' ? Number(vraagtAandacht(b)) - Number(vraagtAandacht(a)) : 0) || laatsteTijd(b) - laatsteTijd(a));
}
/** Tellers = lijstlengtes (één functie voor beide). */
export function sectieTellers(groepen: readonly V2Groep[], nu: number, o: SectieOpties = {}): Record<Sectie, number> {
  return Object.fromEntries(SECTIES.map((s) => [s, sectieLijst(groepen, s, nu, o).length])) as Record<Sectie, number>;
}
/** Bij het openen: in «Нові» beginnen als er iets nieuws is, anders in «Прочитані» (nooit een leeg «Важливі» meer). */
export const beginSectie = (groepen: readonly V2Groep[], nu: number): Sectie => (groepen.some((g) => g.levering.centrum && sectieVanGroep(g, nu) === 'nieuw') ? 'nieuw' : 'gelezen');
