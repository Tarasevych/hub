// UI-013 — pure logica van de vernieuwde catalogus (geen DOM): indeling per thema en groep, bewaarde voorkeuren, zoeken.
// Getest in tests/eenheid/integraties-catalogus-v2-20261029.test.ts.
import { CATEGORIEEN, METHODE_LABEL, type Integratie, type IntegratieCategorie, type IntegratieMethode } from '../../shared/integraties-catalogus';
import { GROEPEN, groepVan, officieelTekst, registerVan, type Groep, type LevendeStand } from '../../shared/integraties-register';

export type Weergave2 = 'raster' | 'lijst';
export type Sortering2 = 'stand' | 'naam';
export interface Voorkeur2 { dicht: string[]; open: string[]; weergave: Weergave2; sorteer: Sortering2; cat: IntegratieCategorie | ''; methode: IntegratieMethode | ''; }
export const VOORKEUR_LEEG: Voorkeur2 = { dicht: [], open: [], weergave: 'raster', sorteer: 'stand', cat: '', methode: '' };

export function leesVoorkeur(raw: string | null): Voorkeur2 {
  try {
    const r = JSON.parse(raw || '{}') as Record<string, unknown>;
    const lijst = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && v.length < 80).slice(0, 400) : []);
    return {
      dicht: lijst(r.dicht), open: lijst(r.open),
      weergave: r.weergave === 'lijst' ? 'lijst' : 'raster',
      sorteer: r.sorteer === 'naam' ? 'naam' : 'stand',
      cat: CATEGORIEEN.some((c) => c.id === r.cat) ? (r.cat as IntegratieCategorie) : '',
      methode: typeof r.methode === 'string' && r.methode in METHODE_LABEL ? (r.methode as IntegratieMethode) : '',
    };
  } catch { return { ...VOORKEUR_LEEG }; }
}

/** Is een blok (thema `c` of thema+groep `c:g`) open? Standaard: thema open; groep volgens GROEPEN.standaardOpen. */
export function isOpen(v: Voorkeur2, sleutel: string): boolean {
  if (v.dicht.includes(sleutel)) return false;
  if (v.open.includes(sleutel)) return true;
  const g = sleutel.split(':')[1] as Groep | undefined;
  return g ? GROEPEN.find((x) => x.id === g)?.standaardOpen ?? true : true;
}
export function wissel(v: Voorkeur2, sleutel: string): Voorkeur2 {
  const nuOpen = isOpen(v, sleutel);
  const dicht = v.dicht.filter((x) => x !== sleutel), open = v.open.filter((x) => x !== sleutel);
  return nuOpen ? { ...v, dicht: [...dicht, sleutel], open } : { ...v, dicht, open: [...open, sleutel] };
}

const normaal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function zoekt(i: Integratie, q: string): boolean {
  const w = normaal(q.trim());
  if (!w) return true;
  const c = CATEGORIEEN.find((x) => x.id === i.cat)!;
  const r = registerVan(i.id);
  const hooi = normaal([i.naam, i.id, i.uk, i.nl, c.uk, c.nl, ...i.methoden.flatMap((m) => METHODE_LABEL[m]), r?.officieel || '', officieelTekst(r, 'uk'), ...(r?.operaties || [])].join(' '));
  return w.split(/\s+/).every((x) => hooi.includes(x));
}

export interface Blok { cat: IntegratieCategorie; groepen: Array<{ id: Groep; lijst: Integratie[] }>; totaal: number; verbonden: number; }
/** Indeling: thema's in catalogusvolgorde; thema's met gekoppelde/fout-diensten eerst. Binnen een thema de groepen in GROEPEN-volgorde. */
export function indelen(lijst: readonly Integratie[], levend: (i: Integratie) => LevendeStand, v: Pick<Voorkeur2, 'sorteer'>, lang: 'uk' | 'nl'): Blok[] {
  const per = new Map<IntegratieCategorie, Blok>();
  for (const i of lijst) {
    const g = groepVan(i, levend(i));
    const b = per.get(i.cat) ?? { cat: i.cat, groepen: GROEPEN.map((x) => ({ id: x.id, lijst: [] as Integratie[] })), totaal: 0, verbonden: 0 };
    b.groepen.find((x) => x.id === g)!.lijst.push(i);
    b.totaal += 1; if (g === 'verbonden' || g === 'aandacht') b.verbonden += 1;
    per.set(i.cat, b);
  }
  const naam = (a: Integratie, b: Integratie) => a.naam.localeCompare(b.naam, lang);
  const blokken = CATEGORIEEN.map((c) => per.get(c.id)).filter((b): b is Blok => Boolean(b));
  for (const b of blokken) { b.groepen = b.groepen.filter((g) => g.lijst.length); for (const g of b.groepen) g.lijst.sort(naam); }
  if (v.sorteer === 'stand') blokken.sort((a, b) => Number(b.verbonden > 0) - Number(a.verbonden > 0));
  return blokken;
}
