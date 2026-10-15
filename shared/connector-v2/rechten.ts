// Connector v2 — rechten per koppeling: een verzameling sleutels (`${id}:${kant}`) uit de catalogus.
//  • Standaard (nieuwe koppeling): alleen veilige handelingen — lezen, laag risico, niet gevoelig, privéruimte.
//  • Modus per groep of voor alles: alles | lezen | lezen-schrijven | schrijven | geen.
//      alles            = lezen + schrijven + verwijderen
//      lezen-schrijven  = lezen + schrijven (zonder verwijderen)
//      schrijven        = schrijven + verwijderen, zonder lezen (bv. alleen taken aanmaken)
//  • Kanten: een beheersleutel telt alleen als de koppeling de technische ruimte heeft; anders valt hij weg (en omgekeerd).
//  • Herverbinden: verschil oud → nieuw in drie delen (toegevoegd / behouden / vervalt).
// Puur.
import { V2_OPTIES, isV2Key, v2Optie, type GroepId, type Kant, type Soort, type V2Optie } from './catalogus';
import { FUNCTIE_OPTIES, functieOptie } from '../connector-functies';

export type Modus = 'alles' | 'lezen' | 'lezen-schrijven' | 'schrijven' | 'geen';
export const MODI: readonly Modus[] = ['alles', 'lezen', 'lezen-schrijven', 'schrijven', 'geen'];
export const isModus = (v: unknown): v is Modus => typeof v === 'string' && (MODI as readonly string[]).includes(v);
export const MODUS_TEKST: Record<Modus, { uk: string; nl: string; icoon: string }> = {
  alles: { uk: 'Усі дії', nl: 'Alle acties', icoon: 'ShieldAlert' },
  'lezen-schrijven': { uk: 'Читання й запис', nl: 'Lezen en schrijven', icoon: 'PencilLine' },
  lezen: { uk: 'Лише читання', nl: 'Alleen lezen', icoon: 'Eye' },
  schrijven: { uk: 'Лише запис', nl: 'Alleen schrijven', icoon: 'PenLine' },
  geen: { uk: 'Жодної', nl: 'Geen', icoon: 'Ban' },
};

export const modusStaatToe = (m: Modus, s: Soort): boolean =>
  m === 'alles' ? true : m === 'lezen' ? s === 'lezen' : m === 'lezen-schrijven' ? s !== 'wissen' : m === 'schrijven' ? s !== 'lezen' : false;

export type Ruimtes = readonly Kant[];
export const isKant = (v: unknown): v is Kant => v === 'gebruiker' || v === 'beheer';

/** Opties die in deze koppeling kunnen meedoen: actief en in een gekozen kant. */
export const kiesbaar = (ruimtes: Ruimtes) => [
  ...V2_OPTIES.filter((o) => o.status === 'actief' && ruimtes.includes(o.kant)),
  ...FUNCTIE_OPTIES.filter((o) => ruimtes.includes(o.kant)),
];

export const STANDAARD = (ruimtes: Ruimtes = ['gebruiker']): string[] =>
  kiesbaar(ruimtes).filter((o) => o.kant === 'gebruiker' && o.soort === 'lezen' && o.risico === 'laag' && !o.gevoelig).map((o) => o.key);

/** Sleutels opschonen: alleen bekende, actieve en in de gekozen kanten; gesorteerd en uniek. */
export function schoon(keys: readonly unknown[], ruimtes: Ruimtes): string[] {
  const ok = new Set<string>();
  for (const k of keys) {
    const o = (isV2Key(k) ? v2Optie(k) : functieOptie(String(k))) as V2Optie | undefined;
    if (o && o.status === 'actief' && ruimtes.includes(o.kant)) ok.add(String(k));
  }
  return [...ok].sort();
}

/** Modus toepassen op een deel van de catalogus (groep, kant of alles); de rest blijft zoals het was. */
export function pasModusToe(huidig: readonly string[], m: Modus, ruimtes: Ruimtes, filter: { groep?: GroepId; kant?: Kant } = {}): string[] {
  const doel = kiesbaar(ruimtes).filter((o) => (!filter.groep || o.groep === filter.groep) && (!filter.kant || o.kant === filter.kant));
  const set = new Set(huidig);
  for (const o of doel) { if (modusStaatToe(m, o.soort)) set.add(o.key); else set.delete(o.key); }
  return schoon([...set], ruimtes);
}

/** Welke modus beschrijft deze groep nu? null = gemengd (handmatig per optie). */
export function modusVan(keys: readonly string[], ruimtes: Ruimtes, filter: { groep?: GroepId; kant?: Kant } = {}): Modus | null {
  const doel = kiesbaar(ruimtes).filter((o) => (!filter.groep || o.groep === filter.groep) && (!filter.kant || o.kant === filter.kant));
  if (!doel.length) return null;
  const set = new Set(keys);
  for (const m of MODI) if (doel.every((o) => set.has(o.key) === modusStaatToe(m, o.soort))) return m;
  return null;
}

export interface Verschil { toegevoegd: string[]; behouden: string[]; vervalt: string[] }
/** Verschil tussen wat de koppeling had en wat nu gekozen is (herverbinden). */
export function verschil(oud: readonly string[], nieuw: readonly string[]): Verschil {
  const o = new Set(oud), n = new Set(nieuw);
  return {
    toegevoegd: [...n].filter((k) => !o.has(k)).sort(),
    behouden: [...n].filter((k) => o.has(k)).sort(),
    vervalt: [...o].filter((k) => !n.has(k)).sort(),
  };
}

/** Hoogste risico in een selectie (voor de samenvatting en de kleur van de knop). */
export function hoogsteRisico(keys: readonly string[]): V2Optie['risico'] {
  const volgorde = ['laag', 'midden', 'hoog', 'kritiek'] as const;
  let max = 0;
  for (const k of keys) { const o = v2Optie(k) ?? functieOptie(k); if (o) max = Math.max(max, volgorde.indexOf(o.risico)); }
  return volgorde[max];
}

/** Is `nieuw` een uitbreiding van `oud`? (Inperken mag meteen; uitbreiden vraagt een nieuwe toestemming.) */
export const breidtUit = (oud: readonly string[], nieuw: readonly string[]) => nieuw.some((k) => !oud.includes(k));
