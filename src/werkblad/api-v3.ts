// Werkblad v3 — client-API (laden / bewaren met versie / terugdraaien) + lokale cache voor de EERSTE weergave.
// De server (backend/werkblad-v3.ts, 0114) is de waarheid; de cache is alleen om niet op een leeg scherm te wachten en wordt
// overschreven zodra de server antwoordt. Alles wat van de server of uit de cache komt gaat opnieuw door normaliseerLaag.
// Integratie in Werkblad.tsx volgt later (werker C / integrator); dit bestand raakt v2 (api.ts) niet.
import { api, ApiError } from '../platform/client';
import { hubAuthBody } from '../useCanoniekHubAuth';
import { achtergrondOf } from '../../shared/werkblad-indeling';
import { APPARATEN, apparaatOf, normaliseerLaag } from '../../shared/werkblad-v3';
import { persoonlijkItem, type PersoonlijkInvoer } from '../../shared/werkblad-register';
import type { ApparaatKlasse, CanvasLayout, WerkbladRuimte } from '../../shared/werkblad-v3-types';

export type LaagStand = { layout: CanvasLayout; versie: number; bijgewerktOp: number };
export type V3Antwoord =
  | { aan: false; ruimte: WerkbladRuimte }
  | { aan: true; ruimte: WerkbladRuimte; bestaat: boolean; netOvergezet: boolean; achtergrond: string; herkomst: string; gemigreerdOp: number; heeftV2Backup: boolean; layouts: Partial<Record<ApparaatKlasse, LaagStand>>; persoonlijk: PersoonlijkInvoer[] };
export type V3BewaarAntwoord = { ruimte: WerkbladRuimte; apparaat: ApparaatKlasse; laag: LaagStand; achtergrond: string };

const ruimteOf = (v: unknown): WerkbladRuimte => (v === 'technisch' ? 'technisch' : 'prive');
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
function laagUit(v: unknown, apparaat: ApparaatKlasse, ruimte: WerkbladRuimte): LaagStand | null {
  const o = obj(v);
  if (!o.layout) return null;
  return { layout: normaliseerLaag(o.layout, apparaat, { ruimte }), versie: Number(o.versie || 0), bijgewerktOp: Number(o.bijgewerktOp || 0) };
}
function persoonlijkUitAntwoord(ruw: unknown): PersoonlijkInvoer[] {
  if (!Array.isArray(ruw)) return [];
  const uit: PersoonlijkInvoer[] = [];
  const gezien = new Set<string>();
  for (const r of ruw.slice(0, 100)) {
    const o = obj(r);
    const inv: PersoonlijkInvoer = {
      id: String(o.id ?? ''),
      basis: String(o.basis ?? ''),
      ...(typeof o.titel === 'string' && o.titel.trim() ? { titel: o.titel } : {}),
      ...(typeof o.icoon === 'string' && o.icoon.trim() ? { icoon: o.icoon } : {}),
    };
    const item = persoonlijkItem(inv);
    if (!item || gezien.has(item.id) || !item.basis) continue;
    gezien.add(item.id);
    uit.push({
      id: item.id,
      basis: item.basis,
      ...(inv.titel ? { titel: item.titel.uk } : {}),
      ...(inv.icoon && item.icoon === inv.icoon ? { icoon: item.icoon } : {}),
    });
  }
  return uit;
}
function uit(data: unknown): V3Antwoord {
  const o = obj(data), ruimte = ruimteOf(o.ruimte);
  if (o.aan !== true) return { aan: false, ruimte };
  const lagen = obj(o.layouts), layouts: Partial<Record<ApparaatKlasse, LaagStand>> = {};
  for (const a of APPARATEN) { const l = laagUit(lagen[a], a, ruimte); if (l) layouts[a] = l; }
  return {
    aan: true, ruimte, bestaat: o.bestaat === true, netOvergezet: o.netOvergezet === true, achtergrond: achtergrondOf(o.achtergrond), herkomst: String(o.herkomst || ''),
    gemigreerdOp: Number(o.gemigreerdOp || 0), heeftV2Backup: o.heeftV2Backup === true, layouts, persoonlijk: persoonlijkUitAntwoord(o.persoonlijk),
  };
}

/** Laden; zonder apparaat alle drie de lagen. Vlag uit → {aan:false} (blijf op v2). Eerste keer met vlag aan → eenmalige overzetting. */
export const laadV3 = async (apparaat?: ApparaatKlasse): Promise<V3Antwoord> =>
  uit((await api.post('/api/owner/hub/werkblad/v3/laden', hubAuthBody(apparaat ? { apparaat } : {}))).data);

/** Server was nieuwer (ander tabblad/apparaat): `actueel` is de laag van de server (null = laag bestaat (nog) niet). */
export class WerkbladV3Verouderd extends Error {
  constructor(public apparaat: ApparaatKlasse, public actueel: LaagStand | null, public achtergrond: string) { super('WERKBLAD_V3_VEROUDERD'); }
}

/** Eén laag atomair bewaren (na pointerup / bevestigde wijziging). `versie` = laagversie uit het laatste antwoord (0 = nieuwe laag). */
export async function bewaarV3(apparaat: ApparaatKlasse, layout: CanvasLayout, versie: number, extra: { achtergrond?: string } = {}): Promise<V3BewaarAntwoord> {
  try {
    const d = obj((await api.post('/api/owner/hub/werkblad/v3/bewaren', hubAuthBody({ apparaat, layout, versie, ...extra }))).data);
    const ruimte = ruimteOf(d.ruimte);
    return { ruimte, apparaat, laag: laagUit(d.laag, apparaat, ruimte)!, achtergrond: achtergrondOf(d.achtergrond) };
  } catch (e) {
    if (e instanceof ApiError && e.response?.status === 409) {
      const d = obj(e.response.data);
      throw new WerkbladV3Verouderd(apparaatOf(d.apparaat) ?? apparaat, laagUit(d.laag, apparaat, ruimteOf(d.ruimte)), achtergrondOf(d.achtergrond));
    }
    throw e;
  }
}

/** Eigen snelkoppelingen (usr:*) per ruimte op de server bewaren en synchroniseren tussen apparaten (0319). */
export async function eigenSnelkoppelingen(items: readonly PersoonlijkInvoer[]): Promise<PersoonlijkInvoer[]> {
  const d = obj((await api.post('/api/owner/hub/werkblad/v3/persoonlijk', hubAuthBody({ items: items.slice(0, 100) }))).data);
  return persoonlijkUitAntwoord(d.persoonlijk);
}

/** v2-backup terugzetten (werkt ook met de vlag uit). v3Wissen: ook de v3-lade wissen (anders blijven de v3-gegevens bewaard). */
export const draaiV3Terug = async (opties: { v3Wissen?: boolean } = {}): Promise<{ hersteld: boolean; v2Versie: number; v3Gewist: boolean; ruimte: WerkbladRuimte }> => {
  const d = obj((await api.post('/api/owner/hub/werkblad/v3/terugdraaien', hubAuthBody({ v3Wissen: opties.v3Wissen === true }))).data);
  return { hersteld: d.hersteld === true, v2Versie: Number(d.v2Versie || 0), v3Gewist: d.v3Gewist === true, ruimte: ruimteOf(d.ruimte) };
};

// ---------------------------------------------------------------- lokale cache (alleen eerste weergave; per gebruiker, tabprofiel en apparaat)
export type V3Cache = { ruimte: WerkbladRuimte; laag: LaagStand; achtergrond: string; op: number };
export const cacheSleutelV3 = (userId: string, profiel: string, apparaat: ApparaatKlasse) => `tsv:werkblad-v3:${userId}:${profiel}:${apparaat}`;
export function leesCacheV3(userId: string, profiel: string, apparaat: ApparaatKlasse): V3Cache | null {
  if (!userId) return null;
  try {
    const raw = obj(JSON.parse(localStorage.getItem(cacheSleutelV3(userId, profiel, apparaat)) || 'null'));
    const ruimte = ruimteOf(raw.ruimte), laag = laagUit(raw.laag, apparaat, ruimte);
    return laag ? { ruimte, laag, achtergrond: achtergrondOf(raw.achtergrond), op: Number(raw.op || 0) } : null;
  } catch { return null; }
}
export function schrijfCacheV3(userId: string, profiel: string, apparaat: ApparaatKlasse, c: Omit<V3Cache, 'op'>): void {
  if (!userId) return;
  try { localStorage.setItem(cacheSleutelV3(userId, profiel, apparaat), JSON.stringify({ ...c, op: Date.now() })); } catch { /* quota/privémodus: server blijft de waarheid */ }
}
export function wisCacheV3(userId: string, profiel: string): void {
  for (const a of APPARATEN) { try { localStorage.removeItem(cacheSleutelV3(userId, profiel, a)); } catch { /* leeg */ } }
}
