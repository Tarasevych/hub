// Vlag `meldingen-v2` (standaard UIT): zelfde patroon als src/agenda/v3/agenda-vlag.ts. Fout of geen antwoord = UIT = het oude paneel.
import { useEffect, useState } from 'react';
import { api } from '../../platform/client';
import { vlagBody } from '../../tech/ruimtes/ruimtes-vlag';

export const MELDINGEN_V2_VLAG = 'meldingen-v2';
const OPSLAG = `mr-vlag:${MELDINGEN_V2_VLAG}`;
let waarde: boolean | null = (() => { try { const v = sessionStorage.getItem(OPSLAG); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } })();
let bezig: Promise<boolean> | null = null;
const luisteraars = new Set<(v: boolean) => void>();
export function laadMeldingenV2Vlag(): Promise<boolean> {
  if (bezig) return bezig;
  bezig = api.post(`/api/ofrep/v1/evaluate/flags/${MELDINGEN_V2_VLAG}`, vlagBody()).then((r) => r.data?.value === true, () => null).then((x) => {
    const v = x === true;
    if (x === null) bezig = null; else { try { sessionStorage.setItem(OPSLAG, v ? '1' : '0'); } catch { /* geen opslag */ } }
    waarde = v; luisteraars.forEach((f) => f(v)); return v;
  });
  return bezig;
}
export function useMeldingenV2(): boolean {
  const [v, setV] = useState(waarde === true);
  useEffect(() => { luisteraars.add(setV); void laadMeldingenV2Vlag(); return () => { luisteraars.delete(setV); }; }, []);
  return v;
}
export const meldingenV2Nu = () => waarde === true;
