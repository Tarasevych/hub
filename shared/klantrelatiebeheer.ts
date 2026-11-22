export const FASEN = ['aanvraag', 'gesprek', 'voorstel', 'gewonnen', 'verloren'] as const;
export const KANALEN = [
  'post', 'telefoon', 'gesprek', 'formulier', 'website', 'whatsapp', 'telegram', 'instagram',
  'messenger', 'linkedin', 'sms', 'notitie', 'ontwikkeling', 'betaling', 'agenda', 'bestand',
] as const;
export type Fase = typeof FASEN[number];
export type Kanaal = typeof KANALEN[number];
export type Richting = 'in' | 'uit' | 'intern';
type Basis = { id: string; aangemaakt: number };
export type Klant = Basis & { versie?: number; naam: string; organisatie: string; mail: string; telefoon: string };
export type Verkoopkans = Basis & { klantId: string; titel: string; centen: number; fase: Fase };
export type Contactmoment = Basis & { klantId: string; kansId: string; kanaal: Kanaal; tekst: string; minuten: number; richting: Richting; afspraakId?: string };
export type Vervolgtaak = Basis & { klantId: string; kansId: string; titel: string; datum: string; klaar: boolean };
export type Klantgegevens = { klanten: Klant[]; kansen: Verkoopkans[]; momenten: Contactmoment[]; taken: Vervolgtaak[] };
export type Klantoverzicht = Klantgegevens & { magSchrijven: boolean };
export type Klantbewerking = 'klant' | 'kans' | 'fase' | 'contact' | 'taak' | 'afronden' | 'aanvraag' | 'wijzig' | 'wissen';
export type Klantuitkomst = { id: string; taakId?: string; contactId?: string };

export function verkoopstand(kansen: readonly Verkoopkans[]) {
  return FASEN.map(fase => {
    const rijen = kansen.filter(kans => kans.fase === fase);
    return { fase, aantal: rijen.length, centen: rijen.reduce((som, kans) => som + kans.centen, 0) };
  });
}

export function klantdossier(gegevens: Klantgegevens, klantId: string): Klantgegevens {
  return {
    klanten: gegevens.klanten.filter(klant => klant.id === klantId),
    kansen: gegevens.kansen.filter(kans => kans.klantId === klantId),
    momenten: gegevens.momenten.filter(moment => moment.klantId === klantId),
    taken: gegevens.taken.filter(taak => taak.klantId === klantId),
  };
}
