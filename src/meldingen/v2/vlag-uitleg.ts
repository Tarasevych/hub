// Vlag `meldingen-uitleg-v3` (UI-014, standaard UIT): zelfde patroon als ./vlag.ts. Fout of geen antwoord = UIT.
import { useEffect, useState } from 'react';
import { api } from '../../platform/client';
import { vlagBody } from '../../tech/ruimtes/ruimtes-vlag';

export const UITLEG_V3_VLAG = 'meldingen-uitleg-v3';
const OPSLAG = `mr-vlag:${UITLEG_V3_VLAG}`;
let waarde: boolean | null = (() => { try { const v = sessionStorage.getItem(OPSLAG); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } })();
let bezig: Promise<boolean> | null = null;
const luisteraars = new Set<(v: boolean) => void>();
export function laadUitlegV3Vlag(): Promise<boolean> {
  if (bezig) return bezig;
  bezig = api.post(`/api/ofrep/v1/evaluate/flags/${UITLEG_V3_VLAG}`, vlagBody()).then((r) => r.data?.value === true, () => null).then((x) => {
    const v = x === true;
    if (x === null) bezig = null; else { try { sessionStorage.setItem(OPSLAG, v ? '1' : '0'); } catch { /* geen opslag */ } }
    waarde = v; luisteraars.forEach((f) => f(v)); return v;
  });
  return bezig;
}
export function useUitlegV3(): boolean {
  const [v, setV] = useState(waarde === true);
  useEffect(() => { luisteraars.add(setV); void laadUitlegV3Vlag(); return () => { luisteraars.delete(setV); }; }, []);
  return v;
}
export const uitlegV3Nu = () => waarde === true;
