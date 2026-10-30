// Vlag `agenda-v3` (standaard UIT): één OFREP-verzoek per pagina, uitkomst in sessionStorage zodat de volgende pagina meteen de
// juiste agenda toont. Fout of geen antwoord = UIT = precies de oude agenda (src/agenda/Agenda.tsx).
import { useEffect, useState } from 'react';
import { api } from '../../platform/client';
import { vlagBody } from '../../tech/ruimtes/ruimtes-vlag';

export const AGENDA_V3_VLAG = 'agenda-v3';
const OPSLAG = `mr-vlag:${AGENDA_V3_VLAG}`;
let waarde: boolean | null = (() => { try { const v = sessionStorage.getItem(OPSLAG); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } })();
let bezig: Promise<boolean> | null = null;
const luisteraars = new Set<(v: boolean) => void>();

export function laadAgendaVlag(): Promise<boolean> {
  if (bezig) return bezig;
  bezig = api.post(`/api/ofrep/v1/evaluate/flags/${AGENDA_V3_VLAG}`, vlagBody()).then((r) => r.data?.value === true, () => null).then((x) => {
    const v = x === true;
    if (x === null) bezig = null; else { try { sessionStorage.setItem(OPSLAG, v ? '1' : '0'); } catch { /* geen opslag */ } }
    waarde = v; luisteraars.forEach((f) => f(v)); return v;
  });
  return bezig;
}
export function useAgendaV3(): boolean {
  const [v, setV] = useState(waarde === true);
  useEffect(() => { luisteraars.add(setV); void laadAgendaVlag(); return () => { luisteraars.delete(setV); }; }, []);
  return v;
}
