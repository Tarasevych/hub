// Vlag `mail-zoeken-v2` (UI-009, standaard UIT): één OFREP-verzoek per pagina, uitkomst in sessionStorage.
// Fout of geen antwoord = UIT = precies het oude filterpaneel en «Ще умови».
import { useEffect, useState } from 'react';

export const MAIL_ZOEKEN_V2_VLAG = 'mail-zoeken-v2';
const OPSLAG = `mr-vlag:${MAIL_ZOEKEN_V2_VLAG}`;
let waarde: boolean | null = (() => { try { const v = sessionStorage.getItem(OPSLAG); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } })();
let bezig: Promise<boolean> | null = null;
const luisteraars = new Set<(v: boolean) => void>();
export function laadMailZoekenV2Vlag(): Promise<boolean> {
  if (bezig) return bezig;
  bezig = Promise.all([import('../platform/client'), import('../tech/ruimtes/ruimtes-vlag')])
    .then(([{ api }, { vlagBody }]) => api.post(`/api/ofrep/v1/evaluate/flags/${MAIL_ZOEKEN_V2_VLAG}`, vlagBody()))
    .then((r) => r.data?.value === true, () => null).then((x) => {
      const v = x === true;
      if (x === null) bezig = null; else { try { sessionStorage.setItem(OPSLAG, v ? '1' : '0'); } catch { /* geen opslag */ } }
      waarde = v; luisteraars.forEach((f) => f(v)); return v;
    });
  return bezig;
}
export function useMailZoekenV2(): boolean {
  const [v, setV] = useState(waarde === true);
  useEffect(() => { luisteraars.add(setV); void laadMailZoekenV2Vlag(); return () => { luisteraars.delete(setV); }; }, []);
  return v;
}
