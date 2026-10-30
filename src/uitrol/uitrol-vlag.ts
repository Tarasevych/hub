// Vlag `uitrol-weergave-v2` (UI-010, migratie 0160, standaard UIT) — zelfde patroon als src/cloud-vnext/cloud-vlag.ts.
// Fout of geen antwoord = UIT = de huidige updatespagina.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { vlagBody } from '../tech/ruimtes/ruimtes-vlag';

export const UITROL_V2_VLAG = 'uitrol-weergave-v2';
const SLEUTEL = `mr-vlag:${UITROL_V2_VLAG}`;

export function laadUitrolV2Vlag(): Promise<boolean> {
  try { const c = sessionStorage.getItem(SLEUTEL); if (c === '1') return Promise.resolve(true); if (c === '0') return Promise.resolve(false); } catch { /* geen opslag */ }
  return api.post(`/api/ofrep/v1/evaluate/flags/${UITROL_V2_VLAG}`, vlagBody())
    .then((r) => { const aan = (r.data as { value?: boolean })?.value === true; try { sessionStorage.setItem(SLEUTEL, aan ? '1' : '0'); } catch { /* geen opslag */ } return aan; })
    .catch(() => false);
}
/** null = nog onbekend (dan niets wisselen), anders de vlagwaarde. */
export function useUitrolV2(): boolean | null {
  const [aan, setAan] = useState<boolean | null>(() => { try { const c = sessionStorage.getItem(SLEUTEL); return c === '1' ? true : c === '0' ? false : null; } catch { return null; } });
  useEffect(() => { let actief = true; void laadUitrolV2Vlag().then((v) => { if (actief) setAan(v); }); return () => { actief = false; }; }, []);
  return aan;
}
