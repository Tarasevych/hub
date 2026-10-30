// Meldingen v2 — leveringsregels in de browser: één bron van waarheid op de server (backend/meldingen-regels.ts), hier alleen een
// cache (localStorage, per account-scope) zodat de bel meteen goed telt, plus luisteraars. Opslaan = server; mislukt dat, dan
// blijft de oude stand staan en zegt het paneel dat (geen stille lokale afwijking).
import { useEffect, useState } from 'react';
import { api } from '../../platform/client';
import { legeRegels, normaliseerRegels, type LeverRegels } from '../../../shared/meldingen-v2/beleid';
import { zijbalkScopeNu } from '../../zijbalk-voorkeuren';

const sleutel = () => `mr.meldingen-v2.regels:${zijbalkScopeNu() || 'anon'}`;
let stand: LeverRegels = (() => { try { return normaliseerRegels(JSON.parse(localStorage.getItem(sleutel()) || 'null')); } catch { return legeRegels(); } })();
const luisteraars = new Set<(r: LeverRegels) => void>();
const zet = (r: LeverRegels) => { stand = r; try { localStorage.setItem(sleutel(), JSON.stringify(r)); } catch { /* geen opslag */ } luisteraars.forEach((f) => f(r)); };
let geladen: Promise<void> | null = null;

export const regelsNu = () => stand;
export const nietStorenActief = (nu = Date.now()) => !!stand.nietStoren && stand.nietStoren.tot > nu;
export function laadRegels(opnieuw = false): Promise<void> {
  if (geladen && !opnieuw) return geladen;
  geladen = api.post('/api/owner/meldingen/regels', {}).then((r) => { if (r.data?.regels) zet(normaliseerRegels(r.data.regels)); }, () => { geladen = null; });
  return geladen;
}
export async function bewaarRegels(volgende: LeverRegels): Promise<boolean> {
  const vorige = stand; zet(volgende);
  try { const r = await api.post('/api/owner/meldingen/regels/opslaan', { regels: volgende }); if (!r.data?.regels) throw new Error('geen antwoord'); zet(normaliseerRegels(r.data.regels)); return true; }
  catch { zet(vorige); return false; }
}
export function useLeverRegels(actief: boolean): LeverRegels {
  const [r, setR] = useState(stand);
  useEffect(() => { if (!actief) return; luisteraars.add(setR); void laadRegels(); const t = window.setInterval(() => void laadRegels(true), 5 * 60_000); return () => { luisteraars.delete(setR); window.clearInterval(t); }; }, [actief]);
  return r;
}
