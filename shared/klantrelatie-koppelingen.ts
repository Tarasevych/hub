import { agendaItemId, DIEPE_PARAMS } from './zoek-diepe-link';
import type { ZoekRoute } from './zoek-model';

export type Koppeltoestand = 'beschikbaar' | 'alleen-lezen' | 'ontbreekt' | 'afgeschermd' | 'onbekend';
export type Koppelstanden = Record<'post' | 'bestanden' | 'schijf' | 'agenda', Koppeltoestand>;
export type Klantbron = { id: string; titel: string; soort: 'post' | 'bestand'; route: ZoekRoute };
export type Klantbronnen = { post: Klantbron[]; bestanden: Klantbron[] };

export const afspraakroute = (afspraakId: string): ZoekRoute => ({
  host: 'hub', pad: 'calendar', params: { [DIEPE_PARAMS.afspraak]: afspraakId },
});

export const vastAfspraakId = (agendaId: string, gebeurtenisId: string) =>
  agendaItemId(agendaId || 'primary', gebeurtenisId);

/** Beide gegevensladen moeten bij dezelfde persoon én dezelfde ruimte horen. */
export function zelfdeKlantlade(
  klant: { userId: string; ruimte: string },
  doel: { ok: boolean; lade?: { userId: string; ruimte: string } },
): boolean {
  return doel.ok && doel.lade?.userId === klant.userId && doel.lade.ruimte === klant.ruimte;
}
