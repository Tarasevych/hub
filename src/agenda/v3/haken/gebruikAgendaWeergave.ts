// Weergave (maand/week/dag/lijst) en datum: staan in de adresregel (?weergave=&datum=), zodat terug/vooruit en een gedeelde link werken.
// Op een smal scherm (≤ 768 px) zonder keuze in het adres begint de agenda op «День».
import { useCallback, useEffect, useState } from 'react';
import type { AgendaWeergave } from '../../../../shared/agenda-model';
import { leesAdres, schrijfAdres, verschuif, vandaagPlaatselijk, type AgendaStand } from '../agenda-tijd';

const SMAL = '(max-width: 768px)';
export const isSmal = () => typeof matchMedia === 'function' && matchMedia(SMAL).matches;

export function gebruikSmal(): boolean {
  const [smal, setSmal] = useState(isSmal);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(SMAL); const op = () => setSmal(m.matches);
    m.addEventListener('change', op); return () => m.removeEventListener('change', op);
  }, []);
  return smal;
}

export function gebruikAgendaWeergave() {
  const [stand, setStand] = useState<AgendaStand>(() => leesAdres(location.search, isSmal()));
  useEffect(() => {
    const op = () => setStand(leesAdres(location.search, isSmal()));
    window.addEventListener('popstate', op); return () => window.removeEventListener('popstate', op);
  }, []);
  const zet = useCallback((nieuw: Partial<AgendaStand>, vervang = false) => {
    setStand((oud) => {
      const s = { ...oud, ...nieuw };
      const url = `${location.pathname}${schrijfAdres(location.search, s)}${location.hash}`;
      try { if (vervang) history.replaceState(history.state, '', url); else history.pushState(history.state, '', url); } catch { /* adres niet te zetten */ }
      return s;
    });
  }, []);
  return {
    ...stand,
    zetWeergave: (weergave: AgendaWeergave) => zet({ weergave }),
    zetDatum: (datum: string) => zet({ datum }, true),
    stap: (richting: number) => zet({ datum: verschuif(stand, richting) }, true),
    naarVandaag: () => zet({ datum: vandaagPlaatselijk() }, true),
  };
}
