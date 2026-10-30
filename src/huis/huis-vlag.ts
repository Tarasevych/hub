// Vlag `huis-vnext` (standaard UIT, migratie 0128): één OFREP-verzoek per pagina, uitkomst in sessionStorage zodat de volgende
// pagina meteen de juiste huis-pagina toont. Fout of geen antwoord = UIT = precies de oude pagina (src/DomoticaWeergave.tsx).
// Zelfde patroon als src/agenda/v3/agenda-vlag.ts.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { vlagBody } from '../tech/ruimtes/ruimtes-vlag';

export const HUIS_VLAG = 'huis-vnext';
const OPSLAG = `mr-vlag:${HUIS_VLAG}`;
let waarde: boolean | null = (() => { try { const v = sessionStorage.getItem(OPSLAG); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } })();
let bezig: Promise<boolean> | null = null;
const luisteraars = new Set<(v: boolean) => void>();

export function laadHuisVlag(): Promise<boolean> {
  if (bezig) return bezig;
  bezig = api.post(`/api/ofrep/v1/evaluate/flags/${HUIS_VLAG}`, vlagBody()).then((r) => r.data?.value === true, () => null).then((x) => {
    const v = x === true;
    if (x === null) bezig = null; else { try { sessionStorage.setItem(OPSLAG, v ? '1' : '0'); } catch { /* geen opslag */ } }
    waarde = v; luisteraars.forEach((f) => f(v)); return v;
  });
  return bezig;
}
export function useHuisVnext(): boolean {
  const [v, setV] = useState(waarde === true);
  useEffect(() => { luisteraars.add(setV); void laadHuisVlag(); return () => { luisteraars.delete(setV); }; }, []);
  return v;
}
