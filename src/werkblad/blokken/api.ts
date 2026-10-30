// Werkblad «Blokken» — client-API (stroom A). Server = waarheid (backend/werkblad-blokken.ts, 0116). Alles wat binnenkomt gaat
// opnieuw door normaliseerBlok (mild): de browser vertrouwt de vorm niet blind. Versie van een blok = laagversie van v3.
import { api, ApiError } from '../../platform/client';
import { hubAuthBody } from '../../useCanoniekHubAuth';
import { APPARATEN, apparaatOf } from '../../../shared/werkblad-v3';
import type { ApparaatKlasse, WerkbladRuimte } from '../../../shared/werkblad-v3-types';
import type { BlokInhoud, BlokkenLaag, BlokkenStand, PlekStand } from '../../../shared/werkblad-blokken';
import { normaliseerBlok } from '../../../shared/werkblad-blokken-boom';

const B = '/api/owner/hub/werkblad/v3/blokken';
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
const ruimteOf = (v: unknown): WerkbladRuimte => (v === 'technisch' ? 'technisch' : 'prive');
/** In de browser alleen vorm/limieten; de ruimte- en registercontrole doet de server. */
const blokUit = (v: unknown): BlokInhoud | null => normaliseerBlok(v, { toegestaan: () => true, streng: false }).waarde;
function laagUit(v: unknown): BlokkenLaag | null {
  const o = obj(v); if (!('versie' in o)) return null;
  const blokken: Record<string, BlokInhoud> = {};
  for (const [k, b] of Object.entries(obj(o.blokken))) { const n = blokUit(b); if (n) blokken[k] = n; }
  return { versie: Number(o.versie || 0), blokken };
}
function plekUit(v: unknown): PlekStand | null {
  const o = obj(v), b = blokUit(o.blok);
  return b && typeof o.plekId === 'string' ? { plekId: o.plekId, blok: b, versie: Number(o.versie || 0), bijgewerktOp: Number(o.bijgewerktOp || 0) } : null;
}

export type BlokkenAntwoord = { aan: false; ruimte: WerkbladRuimte } | ({ aan: true } & BlokkenStand);

/** Laden (zonder apparaat: alle drie de lagen). Vlag uit → {aan:false}: teken alles zoals v3 (kolom wordt genegeerd). */
export async function laadBlokken(apparaat?: ApparaatKlasse): Promise<BlokkenAntwoord> {
  const d = obj((await api.post(`${B}/laden`, hubAuthBody(apparaat ? { apparaat } : {}))).data), ruimte = ruimteOf(d.ruimte);
  if (d.aan !== true) return { aan: false, ruimte };
  const lagen: BlokkenStand['lagen'] = {}, l = obj(d.lagen);
  for (const a of APPARATEN) { const x = laagUit(l[a]); if (x) lagen[a] = x; }
  const bk = d.backup ? obj(d.backup) : null;
  return {
    aan: true, ruimte, lagen, plekken: (Array.isArray(d.plekken) ? d.plekken : []).map(plekUit).filter((p): p is PlekStand => !!p),
    backup: bk ? { op: Number(bk.op || 0), heeftVoor: bk.heeftVoor === true, heeftNa: bk.heeftNa === true } : null,
  };
}

/** Server was nieuwer: `actueel` = blokken van de laag op de server (of de plek). Herlaad en pas de wijziging opnieuw toe. */
export class BlokkenVerouderd extends Error {
  constructor(public apparaat: ApparaatKlasse | null, public actueel: BlokkenLaag | null, public plek: PlekStand | null = null) { super('WERKBLAD_V3_VEROUDERD'); }
}
/** Ongeldige invoer volgens de server (fouten: bv. 'te-diep', 'dubbele-id:x', 'item-niet-toegestaan:svc:…'). */
export class BlokkenGeweigerd extends Error {
  constructor(public code: string, public fouten: string[]) { super(code); }
}
function fout(e: unknown, apparaat: ApparaatKlasse | null): never {
  if (e instanceof ApiError && e.response) {
    const d = obj(e.response.data);
    if (e.response.status === 409) throw new BlokkenVerouderd(apparaatOf(d.apparaat) ?? apparaat, laagUit(d.laag), plekUit(d.plek));
    if (e.response.status === 400 || e.response.status === 404 || e.response.status === 413)
      throw new BlokkenGeweigerd(String(d.code || d.error || 'WERKBLAD_BLOKKEN_ONGELDIG'), Array.isArray(d.fouten) ? d.fouten.map(String) : []);
  }
  throw e;
}

/** Blok van één widget/map bewaren (null = terug naar automatisch). `versie` = laagversie uit laden/het vorige antwoord. */
export async function bewaarBlok(apparaat: ApparaatKlasse, instanceId: string, blok: BlokInhoud | null, versie: number): Promise<BlokkenLaag> {
  try { return laagUit(obj((await api.post(`${B}/bewaren`, hubAuthBody({ apparaat, instanceId, blok, versie }))).data).laag)!; }
  catch (e) { return fout(e, apparaat); }
}

/** Plek buiten het canvas (menu:…, pagina:…#vak, zijbalk:…, werkbalk:…) bewaren; null = leegmaken. versie 0 = nieuwe plek. */
export async function bewaarPlek(plekId: string, blok: BlokInhoud | null, versie: number): Promise<PlekStand | null> {
  try { return plekUit(obj((await api.post(`${B}/plek-bewaren`, hubAuthBody({ plekId, blok, versie }))).data).plek); }
  catch (e) { return fout(e, null); }
}

/** «Відновити блоки»: 'na' = stand na de laatste bewaring (na een oude release), 'voor' = laatste wijziging ongedaan maken. */
export async function herstelBlokken(welke: 'na' | 'voor' = 'na'): Promise<{ hersteld: number; overgeslagen: number; plekken: number; ruimte: WerkbladRuimte }> {
  try {
    const d = obj((await api.post(`${B}/herstellen`, hubAuthBody({ welke }))).data);
    return { hersteld: Number(d.hersteld || 0), overgeslagen: Number(d.overgeslagen || 0), plekken: Number(d.plekken || 0), ruimte: ruimteOf(d.ruimte) };
  } catch (e) { return fout(e, null); }
}
