// Schrijven (alleen Google, alleen met schrijfrecht — de server controleert het ook). Idempotentie: één sleutel PER POGING VAN
// DE GEBRUIKER; mislukt het netwerk en drukt men opnieuw op «Зберегти» met dezelfde gegevens, dan gaat DEZELFDE sleutel mee, zodat
// er niets dubbel komt. Pas na een geslaagd antwoord of gewijzigde invoer komt er een nieuwe sleutel. ETag: wijzigen en wissen
// dragen de versie mee; bij een conflict geeft de server de versie uit Google terug (conflictpaneel).
import { useRef, useState } from 'react';
import type { AgendaVorm, Antwoord } from '../../../../shared/agenda-model';
import * as client from '../../agenda-client';

export type SchrijfStand = { bezig: boolean; fout: string; conflict: AgendaVorm | null; uitbreidingNodig: boolean; gelukt: number };

import { sleutelVoor as puur } from '../idempotentie';
export const sleutelVoor = (geheugen: Map<string, string>, inhoud: string, maak = client.nieuweSleutel) => puur(geheugen, inhoud, maak);

export function gebruikAgendaWijzigingen(naGelukt: () => void) {
  const [stand, setStand] = useState<SchrijfStand>({ bezig: false, fout: '', conflict: null, uitbreidingNodig: false, gelukt: 0 });
  const sleutels = useRef(new Map<string, string>());
  const doe = async (inhoud: string, actie: (sleutel: string) => Promise<client.SchrijfUitslag>): Promise<boolean> => {
    setStand((s) => ({ ...s, bezig: true, fout: '' }));
    const sleutel = sleutelVoor(sleutels.current, inhoud);
    try {
      const u = await actie(sleutel);
      if (u.ok) { sleutels.current.delete(inhoud); setStand((s) => ({ bezig: false, fout: '', conflict: null, uitbreidingNodig: false, gelukt: s.gelukt + 1 })); naGelukt(); return true; }
      // Een definitief antwoord (conflict, geen recht…): volgende poging is bewust een nieuwe.
      sleutels.current.delete(inhoud);
      setStand((s) => ({ ...s, bezig: false, fout: u.fout || 'AGENDA_SCHRIJVEN_MISLUKT', conflict: u.google || null, uitbreidingNodig: Boolean(u.uitbreiding?.nodig) }));
      return false;
    } catch (e) {
      // Netwerk/time-out: de sleutel BLIJFT, zodat «Повторити» niets verdubbelt.
      setStand((s) => ({ ...s, bezig: false, fout: String((e as Error)?.message || 'AGENDA_SCHRIJVEN_MISLUKT') }));
      return false;
    }
  };
  const inh = (soort: string, ...x: unknown[]) => `${soort}:${JSON.stringify(x)}`;
  return {
    ...stand,
    wisFout: () => setStand((s) => ({ ...s, fout: '', conflict: null })),
    bewaren: (vorm: AgendaVorm, meld: string, negeerVersie: boolean) => doe(inh('bewaren', vorm, meld, negeerVersie), (k) => (vorm.gebeurtenisId ? client.wijzigGebeurtenis(k, vorm, meld, negeerVersie) : client.maakGebeurtenis(k, vorm, meld))),
    verwijderen: (vorm: AgendaVorm, meld: string) => doe(inh('wis', vorm.agendaId, vorm.gebeurtenisId, vorm.etag, meld), (k) => client.wisGebeurtenis(k, vorm.agendaId, vorm.gebeurtenisId, vorm.etag, meld)),
    verplaatsen: (vorm: AgendaVorm, naar: string) => doe(inh('verplaats', vorm.agendaId, vorm.gebeurtenisId, naar, vorm.etag), (k) => client.verplaatsGebeurtenis(k, vorm.agendaId, vorm.gebeurtenisId, naar, vorm.etag)),
    antwoorden: (vorm: AgendaVorm, a: Antwoord) => doe(inh('antwoord', vorm.agendaId, vorm.gebeurtenisId, vorm.etag, a), (k) => client.antwoordGebeurtenis(k, vorm.agendaId, vorm.gebeurtenisId, vorm.etag, a)),
  };
}
