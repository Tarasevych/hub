// UI-002: browserkant van /api/owner/foto/* (backend/foto-dienst.ts). Contract: shared/foto-model.ts.
import { api, ApiError } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { sessieDienst } from '../canoniek-navigatie';
import type { BronDef, FotoAlbum, FotoItem } from '../../shared/foto-model';

export class FotoFout extends Error { constructor(public code: string, public status: number) { super(code); this.name = 'FotoFout'; } }
async function roep<T>(pad: string, data: Record<string, unknown> = {}): Promise<T> {
  try { const r = await api.post(`/api/owner/foto/${pad}`, { service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin, ...data }); return r.data as T; }
  catch (e) { if (e instanceof ApiError) throw new FotoFout(e.message || `HTTP_${e.status}`, e.status); throw new FotoFout(String((e as Error)?.message || 'FOUT'), 0); }
}
export type Facetten = { jaren: Record<string, number>; bronnen: Record<string, number>; formaten: Record<string, number>; soorten: Record<string, number>; cameras: Record<string, number> };
export type Stats = { totaal: number; verborgen: number; favorieten: number; bytes: number; metPlaats: number; zonderKopie: number; onbeschikbaar: number };
export type Bibliotheek = { items: FotoItem[]; totaal: number; volgende: string | null; facetten: Facetten; stats: Stats; albums: FotoAlbum[] };
export type Vraag = { zoek?: string; bron?: string; jaar?: number; maand?: number; soort?: string; formaat?: string; album?: string; tag?: string; favoriet?: boolean; verborgen?: boolean; metPlaats?: boolean; zonderDatum?: boolean; camera?: string; van?: string; tot?: string; sorteer?: string; oplopend?: boolean; token?: string };
export type BronStand = BronDef & { aantal: number };
export type ImportRegel = { id: string; bron: string; archief: string; soort: string; nieuw: number; bekend: number; overgeslagen: number; mislukt: number; klaar: boolean; createdAt: string };

export const fotoClient = {
  bibliotheek: (v: Vraag = {}) => roep<Bibliotheek>('bibliotheek', v as Record<string, unknown>),
  indexeer: () => roep<{ nieuw: number; gekoppeld: number }>('indexeer'),
  inhoud: (id: string) => roep<{ mime: string; naam: string; data: string; sha256: string }>('inhoud', { id }),
  item: (actie: string, ids: string[], extra: Record<string, unknown> = {}) => roep<{ items?: FotoItem[]; ok?: boolean }>('item', { actie, ids, ...extra }),
  album: (actie: string, extra: Record<string, unknown>) => roep<{ album?: { id: string; naam: string } }>('album', { actie, ...extra }),
  upload: (data: Record<string, unknown>) => roep<{ id?: string; stukMax?: number; bekend?: boolean; item?: FotoItem }>('upload', data),
  organiseer: () => roep<{ duplicaten: Array<{ soort: 'exact' | 'waarschijnlijk'; items: FotoItem[] }>; gelijkend: Array<{ items: FotoItem[] }> }>('organiseer'),
  bronnen: () => roep<{ bronnen: BronStand[]; imports: ImportRegel[] }>('bronnen'),
  importLog: (d: Record<string, unknown>) => roep<{ id: string }>('import', d),
  exporteer: (ids: string[]) => roep<{ items: FotoItem[] }>('export', { ids }),
};

/** data:-URL / blob-URL van het origineel (voor weergave en download). */
export async function origineelBlob(id: string): Promise<Blob> {
  const r = await fotoClient.inhoud(id);
  const bin = atob(r.data); const b = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) b[k] = bin.charCodeAt(k);
  return new Blob([b], { type: r.mime });
}
