// Werkblad: laden en bewaren van de indeling van DEZE lade op de server (backend/werkblad.ts, 0112) + een lokale cache
// voor de EERSTE weergave zonder te wachten (localStorage, per gebruiker en per tabprofiel; de server blijft de waarheid:
// zodra zijn antwoord er is, wint dat en wordt de cache bijgewerkt). Niets wordt verzonnen: zonder server en zonder cache is
// het werkblad de standaard van shared/werkblad-indeling.ts, met de melding dat bewaren pas na aanmelden kan.
import { api, ApiError } from '../platform/client';
import { hubAuthBody } from '../useCanoniekHubAuth';
import { normaliseerWerkblad, type WerkbladContext, type WerkbladIndeling, type WerkbladRuimte } from '../../shared/werkblad-indeling';
import type { TechSamenvatting } from '../../shared/werkblad-indeling';

export type WerkbladAntwoord = {
  ruimte: WerkbladRuimte; bestaat: boolean; indeling: WerkbladIndeling | null; achtergrondEigen: string; herkomst: string; versie: number; bijgewerktOp: number;
};
export type WerkbladCache = { ruimte: WerkbladRuimte; indeling: WerkbladIndeling; achtergrondEigen: string; versie: number; herkomst: string; op: number };

const ruimteOf = (v: unknown): WerkbladRuimte => (v === 'technisch' ? 'technisch' : 'prive');
const uit = (data: unknown): WerkbladAntwoord => {
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const ruimte = ruimteOf(o.ruimte);
  const ctx: WerkbladContext = { ruimte };
  return {
    ruimte, bestaat: o.bestaat === true, indeling: o.indeling ? normaliseerWerkblad(o.indeling, ctx) : null,
    achtergrondEigen: typeof o.achtergrondEigen === 'string' ? o.achtergrondEigen : '', herkomst: String(o.herkomst || ''), versie: Number(o.versie || 0), bijgewerktOp: Number(o.bijgewerktOp || 0),
  };
};

export const haalWerkblad = async (): Promise<WerkbladAntwoord> => uit((await api.post('/api/owner/hub/werkblad/laden', hubAuthBody())).data);

export class WerkbladVerouderd extends Error { constructor(public actueel: WerkbladAntwoord) { super('WERKBLAD_VEROUDERD'); } }
/** Bewaren; bij 409 (ander tabblad/apparaat was sneller) komt de actuele rij als WerkbladVerouderd terug. */
export const bewaarWerkblad = async (indeling: WerkbladIndeling, versie: number, extra: { achtergrondEigen?: string; herkomst?: string } = {}): Promise<WerkbladAntwoord> => {
  try { return uit((await api.post('/api/owner/hub/werkblad/bewaren', hubAuthBody({ indeling, versie, ...extra }))).data); }
  catch (e) {
    if (e instanceof ApiError && e.response?.status === 409) throw new WerkbladVerouderd(uit(e.response.data));
    throw e;
  }
};
export const wisWerkblad = async (): Promise<WerkbladRuimte> => ruimteOf(((await api.post('/api/owner/hub/werkblad/terugzetten', hubAuthBody())).data as { ruimte?: unknown })?.ruimte);
export const haalTech = async (): Promise<TechSamenvatting> => (await api.post('/api/owner/hub/werkblad/tech', hubAuthBody())).data as TechSamenvatting;

// ---------------------------------------------------------------- lokale cache (alleen voor de eerste weergave)
const sleutel = (userId: string, profiel: string) => `tsv:werkblad-v2:${userId}:${profiel}`;
export function leesCache(userId: string, profiel: string): WerkbladCache | null {
  if (!userId) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(sleutel(userId, profiel)) || 'null') as WerkbladCache | null;
    if (!raw || !raw.indeling) return null;
    const ruimte = ruimteOf(raw.ruimte);
    return { ...raw, ruimte, indeling: normaliseerWerkblad(raw.indeling, { ruimte }), achtergrondEigen: typeof raw.achtergrondEigen === 'string' ? raw.achtergrondEigen : '' };
  } catch { return null; }
}
export function schrijfCache(userId: string, profiel: string, c: WerkbladCache): void {
  if (!userId) return;
  try { localStorage.setItem(sleutel(userId, profiel), JSON.stringify({ ...c, op: Date.now() })); } catch { /* quota of privémodus: de server blijft de waarheid */ }
}
export function wisCache(userId: string, profiel: string): void { try { localStorage.removeItem(sleutel(userId, profiel)); } catch { /* leeg */ } }
