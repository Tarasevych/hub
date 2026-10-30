// Vlag `afstemming-vnext` (standaard UIT, migratie 0197): één OFREP-verzoek per pagina, uitkomst in sessionStorage zodat de volgende
// pagina meteen de juiste afstemmingspagina toont. Fout of geen antwoord = UIT = precies de oude pagina (src/CanoniekImplementatieWaarheidMatrix.tsx).
// Zelfde patroon als src/cloud-vnext/cloud-vlag.ts.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { vlagBody } from '../tech/ruimtes/ruimtes-vlag';
import { AFSTEMMING_VLAG } from '../../shared/afstemming-model';

const SLEUTEL = `mr-vlag:${AFSTEMMING_VLAG}`;

export function laadAfstemmingVlag(): Promise<boolean> {
  try { const c = sessionStorage.getItem(SLEUTEL); if (c === '1') return Promise.resolve(true); if (c === '0') return Promise.resolve(false); } catch { /* geen opslag */ }
  return api.post(`/api/ofrep/v1/evaluate/flags/${AFSTEMMING_VLAG}`, vlagBody())
    .then((r) => { const aan = (r.data as { value?: boolean })?.value === true; try { sessionStorage.setItem(SLEUTEL, aan ? '1' : '0'); } catch { /* geen opslag */ } return aan; })
    .catch(() => false);
}

/** true zodra de vlag aan staat; begint met de gecachete waarde (of UIT) en verifieert één keer. */
export function useAfstemmingVnext(): boolean {
  const [aan, setAan] = useState(() => { try { return sessionStorage.getItem(SLEUTEL) === '1'; } catch { return false; } });
  useEffect(() => { let actief = true; void laadAfstemmingVlag().then((v) => { if (actief) setAan(v); }); return () => { actief = false; }; }, []);
  return aan;
}
