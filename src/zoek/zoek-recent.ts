// Recente zoekopdrachten van de bovenbalk (zoekronde 02.11.2026): alleen op dit apparaat (localStorage, altijd met try/catch) en
// per aangemeld account (de sleutel bevat de gebruikers-id), zodat een gedeelde browser de zoekopdrachten van een ander account
// niet toont. Zonder bekend account wordt niets bewaard. Wissen kan met één knop in het uitklapvenster van het zoekveld.
import type { Categorie } from './zoek-logica';

export type RecenteZoekopdracht = { vraag: string; sectie: Categorie; tijd: number };
export const RECENT_MAX = 8;
export const RECENT_VRAAG_MAX = 300;
const CATEGORIEEN: readonly string[] = ['all', 'mail', 'files', 'paginas', 'instellingen', 'agenda', 'github', 'bord', 'overig'];

type Opslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
let gebruiker = '';

/** Wordt aangeroepen zodra de gebruiker bekend is (useSessieGebruiker); null/leeg = niet aangemeld → niets bewaren. */
export function zetZoekGebruiker(id: string | null | undefined): void {
  gebruiker = typeof id === 'string' ? id.trim().slice(0, 80) : '';
}

export const recentSleutel = (id: string): string => (id ? `mr-zoek-recent:${id}` : '');

const standaardOpslag = (): Opslag | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

/** Eén bewaarde rij controleren; alles wat niet klopt wordt weggelaten (bv. handmatig aangepaste opslag). */
const leesRij = (v: unknown): RecenteZoekopdracht | null => {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const vraag = typeof r.vraag === 'string' ? r.vraag.trim().slice(0, RECENT_VRAAG_MAX) : '';
  const sectie = typeof r.sectie === 'string' && CATEGORIEEN.includes(r.sectie) ? (r.sectie as Categorie) : 'all';
  const tijd = typeof r.tijd === 'number' && Number.isFinite(r.tijd) && r.tijd > 0 ? r.tijd : 0;
  return vraag && tijd ? { vraag, sectie, tijd } : null;
};

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

/** Voegt een zoekopdracht vooraan toe (zonder dubbel, hoofdletters tellen niet mee) en geeft de nieuwe lijst terug. */
export function bewaarRecent(vraag: string, sectie: Categorie, nu: number = Date.now(), id: string = gebruiker, opslag: Opslag | null = standaardOpslag()): RecenteZoekopdracht[] {
  const v = vraag.trim().slice(0, RECENT_VRAAG_MAX);
  const sleutel = recentSleutel(id);
  if (!v || !sleutel || !opslag) return leesRecent(id, opslag);
  const kleine = v.toLocaleLowerCase();
  const lijst = [{ vraag: v, sectie, tijd: nu }, ...leesRecent(id, opslag).filter(r => r.vraag.toLocaleLowerCase() !== kleine)].slice(0, RECENT_MAX);
  try { opslag.setItem(sleutel, JSON.stringify(lijst)); } catch { /* vol of geblokkeerd: deze keer niets bewaard */ }
  return lijst;
}

/** Alle recente zoekopdrachten van dit account op dit apparaat wissen. */
export function wisRecent(id: string = gebruiker, opslag: Pick<Storage, 'removeItem'> | null = standaardOpslag()): void {
  const sleutel = recentSleutel(id);
  if (!sleutel || !opslag) return;
  try { opslag.removeItem(sleutel); } catch { /* geblokkeerd: niets te wissen */ }
}
