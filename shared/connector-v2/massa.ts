// Connector v2 — massale wijziging van rechten («Пришвидшене керування»): één modus (alles / lezen-schrijven / lezen / schrijven / geen),
// optioneel beperkt tot één categorie en tot de gekozen ruimtes, toegepast op meerdere agents tegelijk.
// Server (backend/connector-v2.ts) en browser (src/connector-v2/ConnectorsTab.tsx) gebruiken DEZELFDE berekening: wat de samenvatting
// vóór het bevestigen toont, is precies wat de server daarna opslaat. Puur (geen React/DOM/Node).
import { V2_OPTIES, v2Optie, type GroepId, type Kant, type Risico } from './catalogus';
import { breidtUit, hoogsteRisico, pasModusToe, schoon, STANDAARD, type Modus } from './rechten';

export type MassaInvoer = { modus: Modus; kanten: readonly Kant[]; groep?: GroepId };
export type Basis = { kanten: Kant[]; sleutels: string[] };
export type MassaUitkomst = {
  kanten: Kant[]; sleutels: string[];
  toegevoegd: number; vervalt: number; totaal: number;
  /** Hoogste risico van het resultaat (voor de kleur van de samenvatting). */
  risico: Risico;
  /** Hoeveel NIEUW toegevoegde rechten risico 'hoog' of 'kritiek' hebben, en hoeveel gevoelige (mail, foto's). */
  riskant: number; gevoelig: number;
  /** Uitbreiding = er komt iets bij → bevestigen met passkey en (bij een actieve koppeling) opnieuw verbinden. */
  uitbreiding: boolean; gewijzigd: boolean;
};

const ruimtesOf = (k: readonly Kant[]): Kant[] => { const u = [...new Set(k)].sort() as Kant[]; return u.length ? u : ['gebruiker']; };

/** Startpunt van een agent: de bewaarde keuze, anders de actieve koppeling, anders de veilige standaard. */
export const basisVan = (voorkeur: Basis | null | undefined, actief: Basis | null | undefined): Basis =>
  voorkeur ?? actief ?? { kanten: ['gebruiker'], sleutels: STANDAARD() };

export function berekenMassa(basis: Basis, inv: MassaInvoer): MassaUitkomst {
  const doel = ruimtesOf(inv.kanten);
  // «Geen» voegt nooit een ruimte toe; alle andere modi nemen de gekozen ruimtes mee.
  const kanten = inv.modus === 'geen' ? ruimtesOf(basis.kanten) : ruimtesOf([...basis.kanten, ...doel]);
  let sleutels: string[] = schoon(basis.sleutels, kanten);
  for (const kant of doel) sleutels = pasModusToe(sleutels, inv.modus, kanten, { kant, ...(inv.groep ? { groep: inv.groep } : {}) });
  const oud = new Set(basis.sleutels);
  const nieuw = new Set(sleutels);
  const erbij = sleutels.filter((k) => !oud.has(k));
  const weg = basis.sleutels.filter((k) => !nieuw.has(k));
  const opties = erbij.map((k) => v2Optie(k)).filter((o): o is NonNullable<typeof o> => !!o);
  return {
    kanten, sleutels,
    toegevoegd: erbij.length, vervalt: weg.length, totaal: sleutels.length,
    risico: hoogsteRisico(sleutels),
    riskant: opties.filter((o) => o.risico === 'hoog' || o.risico === 'kritiek').length,
    gevoelig: opties.filter((o) => o.gevoelig).length,
    uitbreiding: breidtUit(basis.sleutels, sleutels) || kanten.some((k) => !basis.kanten.includes(k)),
    gewijzigd: erbij.length > 0 || weg.length > 0 || kanten.join() !== [...basis.kanten].sort().join(),
  };
}

/** Hoeveel actieve opties de agent kan hebben in zijn ruimtes (noemer van «Дії: 12 з 18 увімкнено»). */
export const aantalMogelijk = (kanten: readonly Kant[]): number => V2_OPTIES.filter((o) => o.status === 'actief' && kanten.includes(o.kant)).length;

/** Kant van het resultaat dat bevestiging met passkey vraagt: alles uitbreiden, of «alle acties» zetten. */
export const vraagtSterkeBevestiging = (inv: MassaInvoer, uitkomsten: readonly MassaUitkomst[]): boolean =>
  inv.modus === 'alles' || uitkomsten.some((u) => u.uitbreiding);
