// UI-014 fase 2B (vlag meldingen-uitleg-v3): blijvende status per melding in de browser = cache van de server
// (backend/meldingen-status.ts). Wijzigen = meteen zichtbaar (optimistisch); mislukt de server, dan terug naar de vorige stand
// en het paneel zegt dat. Andere tabbladen volgen via BroadcastChannel; terug naar het tabblad = opnieuw lezen.
import { useEffect, useState } from 'react';
import { api } from '../../platform/client';
import { meldingLichaam } from '../sessie-context';
import { legeStatus, normaliseerStatus, zetStatus, type StatusStand, type StatusWijziging } from '../../../shared/meldingen-v2/status';

let stand: StatusStand = legeStatus();
const luisteraars = new Set<(s: StatusStand) => void>();
const kanaal: BroadcastChannel | null = (() => { try { return typeof BroadcastChannel === 'function' ? new BroadcastChannel('mr-meldingen-status') : null; } catch { return null; } })();
const zet = (s: StatusStand, uitzenden = true) => { stand = s; luisteraars.forEach((f) => f(s)); if (uitzenden) try { kanaal?.postMessage(s); } catch { /* geen kanaal */ } };
kanaal?.addEventListener('message', (e) => zet(normaliseerStatus(e.data), false));
let geladen: Promise<void> | null = null;

export const statusNu = () => stand;
export function laadStatus(opnieuw = false): Promise<void> {
  if (geladen && !opnieuw) return geladen;
  geladen = api.post('/api/owner/meldingen/status', meldingLichaam()).then((r) => { if (r.data?.stand) zet(normaliseerStatus(r.data.stand)); }, () => { geladen = null; });
  return geladen;
}
export async function wijzigStatus(w: StatusWijziging): Promise<boolean> {
  const vorige = stand; zet(zetStatus(stand, w, 'eigenaar'));
  try { const r = await api.post('/api/owner/meldingen/status/zetten', meldingLichaam({ ...w })); if (!r.data?.stand) throw new Error('geen antwoord'); zet(normaliseerStatus(r.data.stand)); return true; }
  catch { zet(vorige); return false; }
}
export async function zetBewaarDagen(dagen: number): Promise<boolean> {
  const vorige = stand; zet({ ...stand, bewaarDagen: dagen });
  try { const r = await api.post('/api/owner/meldingen/status/zetten', meldingLichaam({ bewaarDagen: dagen })); if (!r.data?.stand) throw new Error('geen antwoord'); zet(normaliseerStatus(r.data.stand)); return true; }
  catch { zet(vorige); return false; }
}
export function useStatusStand(actief: boolean): StatusStand {
  const [s, setS] = useState(stand);
  useEffect(() => {
    if (!actief) return;
    luisteraars.add(setS); void laadStatus();
    const zicht = () => { if (!document.hidden) void laadStatus(true); };
    document.addEventListener('visibilitychange', zicht);
    return () => { luisteraars.delete(setS); document.removeEventListener('visibilitychange', zicht); };
  }, [actief]);
  return s;
}
