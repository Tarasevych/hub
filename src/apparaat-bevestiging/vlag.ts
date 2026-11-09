// Vlag `apparaat-bevestiging-v1` (standaard AAN, migratie 0204): zelfde patroon als src/telegram-aanmelden/vlag.ts.
// Fout of geen antwoord = UIT = geen tabbladen, geen venster «Це ви?», geen stroom.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { vlagBody } from '../tech/ruimtes/ruimtes-vlag';
import { APPARAAT_VLAG } from '../../shared/apparaat-bevestiging/model';

const SLEUTEL = `mr-vlag:${APPARAAT_VLAG}`;
export function laadApparaatVlag(): Promise<boolean> {
  try { const c = sessionStorage.getItem(SLEUTEL); if (c === '1') return Promise.resolve(true); if (c === '0') return Promise.resolve(false); } catch { /* geen opslag */ }
  return api.post(`/api/ofrep/v1/evaluate/flags/${APPARAAT_VLAG}`, vlagBody())
    .then((r) => { const aan = (r.data as { value?: boolean })?.value === true; try { sessionStorage.setItem(SLEUTEL, aan ? '1' : '0'); } catch { /* geen opslag */ } return aan; })
    .catch(() => false);
}
export function useApparaatVlag(): boolean {
  const [aan, setAan] = useState(() => { try { return sessionStorage.getItem(SLEUTEL) === '1'; } catch { return false; } });
  useEffect(() => { let actief = true; void laadApparaatVlag().then((v) => { if (actief) setAan(v); }); return () => { actief = false; }; }, []);
  return aan;
}
