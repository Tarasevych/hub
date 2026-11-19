// Vlag `aanmeldmethoden-v2` (UI-015, standaard UIT): zelfde patroon als src/meldingen/v2/vlag-uitleg.ts. Fout of geen antwoord = UIT
// = de oude pagina «Способи входу» ongewijzigd.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { vlagBody } from '../tech/ruimtes/ruimtes-vlag';

export const AANMELDMETHODEN_V2_VLAG = 'aanmeldmethoden-v2';
const OPSLAG = `mr-vlag:${AANMELDMETHODEN_V2_VLAG}`;
let waarde: boolean | null = (() => { try { const v = sessionStorage.getItem(OPSLAG); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } })();
let bezig: Promise<boolean> | null = null;
const luisteraars = new Set<(v: boolean) => void>();
export function laadAanmeldmethodenV2Vlag(): Promise<boolean> {
  if (bezig) return bezig;
  bezig = api.post(`/api/ofrep/v1/evaluate/flags/${AANMELDMETHODEN_V2_VLAG}`, vlagBody()).then((r) => r.data?.value === true, () => null).then((x) => {
    const v = x === true;
    if (x === null) bezig = null; else { try { sessionStorage.setItem(OPSLAG, v ? '1' : '0'); } catch { /* geen opslag */ } }
    waarde = v; luisteraars.forEach((f) => f(v)); return v;
  });
  return bezig;
}
/** null = nog onbekend (dan de oude weergave, niets springt). */
export function useAanmeldmethodenV2(): boolean {
  const [v, setV] = useState(waarde === true);
  useEffect(() => { luisteraars.add(setV); void laadAanmeldmethodenV2Vlag(); return () => { luisteraars.delete(setV); }; }, []);
  return v;
}
