// Recente zoekopdrachten van de bovenbalk (zoekronde 02.11.2026; INTEG-001 03.11.2026: met TYPE): alleen op dit apparaat
// (localStorage, altijd met try/catch) en per aangemeld account (de sleutel bevat de gebruikers-id), zodat een gedeelde browser
// de zoekopdrachten van een ander account niet toont. Zonder bekend account wordt niets bewaard. Wissen kan met één knop in het
// uitklapvenster van het zoekveld.
//
// Een rij heeft een TYPE (`soort`): 'zoek' = een getypte zoekopdracht (opnieuw uitvoeren in het venster), 'functie' en 'pagina' =
// een rechtstreeks gekozen functie/pagina van de site (opent opnieuw rechtstreeks, met de route erbij). Er worden GEEN titels van
// resultaten uit persoonlijke bronnen (onderwerp van een e-mail, bestandsnaam) bewaard: alleen wat de gebruiker zelf typte en de
// namen van functies/pagina's van de site zelf. Oudere rijen zonder `soort` gelden als 'zoek'.
import { ZOEK_ROUTE_HOSTS, type ZoekRoute } from '../../shared/zoek-model';
import type { Categorie } from './zoek-logica';

export type RecentSoort = 'zoek' | 'functie' | 'pagina';
export const RECENT_SOORTEN: readonly RecentSoort[] = ['zoek', 'functie', 'pagina'];
export type RecenteZoekopdracht = { vraag: string; sectie: Categorie; tijd: number; soort: RecentSoort; route?: ZoekRoute };
/** Extra gegevens bij het bewaren: het type en (bij een functie/pagina) de route om opnieuw rechtstreeks te openen. */
export type RecentExtra = { soort?: RecentSoort; route?: ZoekRoute | null };
export const RECENT_MAX = 8;
export const RECENT_VRAAG_MAX = 300;
const CATEGORIEEN: readonly string[] = ['all', 'mail', 'files', 'paginas', 'instellingen', 'agenda', 'github', 'bord', 'overig'];
const HOSTS: readonly string[] = ZOEK_ROUTE_HOSTS;

type Opslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
let gebruiker = '';

/** Wordt aangeroepen zodra de gebruiker bekend is (useSessieGebruiker); null/leeg = niet aangemeld → niets bewaren. */
export function zetZoekGebruiker(id: string | null | undefined): void {
  gebruiker = typeof id === 'string' ? id.trim().slice(0, 80) : '';
}
/** De huidige gebruiker voor de zoekgeheugens (leeg = niet aangemeld). */
export const zoekGebruiker = (): string => gebruiker;

export const recentSleutel = (id: string): string => (id ? `mr-zoek-recent:${id}` : '');

const standaardOpslag = (): Opslag | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

/** Een route uit de opslag controleren: vorm en lengtes (de echte URL maakt routeUrl() later nog eens veilig: alleen hosts van de site). */
const leesRoute = (v: unknown): ZoekRoute | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  if (typeof r.host !== 'string' || !HOSTS.includes(r.host) || typeof r.pad !== 'string' || r.pad.length > 500) return undefined;
  const params: Record<string, string> = {};
  if (r.params && typeof r.params === 'object') for (const [k, x] of Object.entries(r.params as Record<string, unknown>)) if (/^[a-zA-Z_][a-zA-Z0-9_]{0,40}$/.test(k) && typeof x === 'string') params[k] = x.slice(0, 500);
  return { host: r.host as ZoekRoute['host'], pad: r.pad, ...(typeof r.hash === 'string' && r.hash ? { hash: r.hash.slice(0, 200) } : {}), ...(Object.keys(params).length ? { params } : {}) };
};

/** Eén bewaarde rij controleren; alles wat niet klopt wordt weggelaten (bv. handmatig aangepaste opslag). */
const leesRij = (v: unknown): RecenteZoekopdracht | null => {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const vraag = typeof r.vraag === 'string' ? r.vraag.trim().slice(0, RECENT_VRAAG_MAX) : '';
  const sectie = typeof r.sectie === 'string' && CATEGORIEEN.includes(r.sectie) ? (r.sectie as Categorie) : 'all';
  const tijd = typeof r.tijd === 'number' && Number.isFinite(r.tijd) && r.tijd > 0 ? r.tijd : 0;
  if (!vraag || !tijd) return null;
  const route = leesRoute(r.route);
  // Een functie/pagina zonder (geldige) route kan niet rechtstreeks openen → geldt als gewone zoekopdracht met die tekst.
  const soort: RecentSoort = (r.soort === 'functie' || r.soort === 'pagina') && route ? r.soort : 'zoek';
  return soort === 'zoek' ? { vraag, sectie, tijd, soort } : { vraag, sectie, tijd, soort, route };
};

/** Sleutel om dubbelen te herkennen: een zoekopdracht per tekst (hoofdletters tellen niet mee), een functie/pagina per tekst + route. */
const dubbelSleutel = (r: Pick<RecenteZoekopdracht, 'vraag' | 'soort' | 'route'>): string =>
  `${r.soort}|${r.vraag.toLocaleLowerCase()}|${r.soort === 'zoek' ? '' : JSON.stringify(r.route || null)}`;

/** Recente zoekopdrachten, nieuwste eerst. Geen id, geen opslag of een kapotte waarde → lege lijst. */
export function leesRecent(id: string = gebruiker, opslag: Pick<Storage, 'getItem'> | null = standaardOpslag()): RecenteZoekopdracht[] {
  const sleutel = recentSleutel(id);
  if (!sleutel || !opslag) return [];
  try {
    const ruw = opslag.getItem(sleutel);
    if (!ruw) return [];
    const lijst: unknown = JSON.parse(ruw);
    if (!Array.isArray(lijst)) return [];
    return lijst.map(leesRij).filter((x): x is RecenteZoekopdracht => x !== null).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** Voegt een rij vooraan toe (zonder dubbel) en geeft de nieuwe lijst terug. Zonder `extra` is het een gewone zoekopdracht. */
export function bewaarRecent(vraag: string, sectie: Categorie, nu: number = Date.now(), id: string = gebruiker, opslag: Opslag | null = standaardOpslag(), extra: RecentExtra = {}): RecenteZoekopdracht[] {
  const v = vraag.trim().slice(0, RECENT_VRAAG_MAX);
  const sleutel = recentSleutel(id);
  if (!v || !sleutel || !opslag) return leesRecent(id, opslag);
  const route = extra.route ? leesRoute(extra.route) : undefined;
  const soort: RecentSoort = (extra.soort === 'functie' || extra.soort === 'pagina') && route ? extra.soort : 'zoek';
  const rij: RecenteZoekopdracht = soort === 'zoek' ? { vraag: v, sectie, tijd: nu, soort } : { vraag: v, sectie, tijd: nu, soort, route };
  const sl = dubbelSleutel(rij);
  const lijst = [rij, ...leesRecent(id, opslag).filter(r => dubbelSleutel(r) !== sl)].slice(0, RECENT_MAX);
  try { opslag.setItem(sleutel, JSON.stringify(lijst)); } catch { /* vol of geblokkeerd: deze keer niets bewaard */ }
  return lijst;
}

/** Alle recente zoekopdrachten van dit account op dit apparaat wissen. */
export function wisRecent(id: string = gebruiker, opslag: Pick<Storage, 'removeItem'> | null = standaardOpslag()): void {
  const sleutel = recentSleutel(id);
  if (!sleutel || !opslag) return;
  try { opslag.removeItem(sleutel); } catch { /* geblokkeerd: niets te wissen */ }
}
