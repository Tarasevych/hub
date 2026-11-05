// De browserkant van /api/owner/cloud/vnext/* (backend/cloud-vnext-bestanden.ts en -integraties.ts) plus de bestaande
// cloudroutes die vNext hergebruikt (bootstrap, capture, Google Drive-browser). Elke aanroep draagt dienst + tabblad mee.
// HET CONTRACT staat in shared/cloud-vnext-model.ts — wie hier iets wijzigt, wijzigt het dáár eerst.
import { api, ApiError } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { sessieDienst } from '../canoniek-navigatie';
import type { CloudBestand, CloudMap, CloudSoort, CloudSortering, CloudVersie } from '../../shared/cloud-vnext-model';
import type { CloudTaak, CloudTaakPunt, CloudTaakSoort } from '../../shared/cloud-overdracht-model';
import { registreerVervoer, type Vervoer } from './overdracht-beheer';

const body = (extra: Record<string, unknown> = {}) => ({ service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin, ...extra });
export class CloudFout extends Error { constructor(public code: string, public status: number, public data: unknown) { super(code); this.name = 'CloudFout'; } }
async function roep<T>(pad: string, data: Record<string, unknown> = {}): Promise<T> {
  try { const r = await api.post(pad, body(data)); return r.data as T; }
  catch (e) {
    if (e instanceof ApiError) throw new CloudFout(e.message || `HTTP_${e.status}`, e.status, e.response?.data);
    throw new CloudFout(String((e as Error)?.message || 'FOUT'), 0, null);
  }
}

export type Overzicht = {
  stats: { aantal: number; bytes: number; perSoort: Partial<Record<CloudSoort, { aantal: number; bytes: number }>> };
  recent: CloudBestand[]; favorieten: CloudBestand[]; prullenbak: number;
  mappen: CloudMap[]; workspaces: Array<{ id: string; titel: string; aantal: number }>;
};
export type Lijst = { bestanden: CloudBestand[]; mappen: CloudMap[]; pad: CloudMap[]; volgende: string | null; totaal: number | null };
export type LijstVraag = { id?: string; mapId?: string; zoek?: string; soort?: CloudSoort | ''; tag?: string; favoriet?: boolean; prullenbak?: boolean; workspaceId?: string; sorteer?: CloudSortering; oplopend?: boolean; token?: string };
export type UploadBegin = { id: string; stukMax: number };

export const cloudClient = {
  // ---- eigen opslag (vNext)
  overzicht: () => roep<Overzicht>('/api/owner/cloud/vnext/overzicht'),
  bestanden: (v: LijstVraag = {}) => roep<Lijst>('/api/owner/cloud/vnext/bestanden', v as Record<string, unknown>),
  mapNieuw: (naam: string, ouderId: string | null) => roep<{ map: CloudMap }>('/api/owner/cloud/vnext/map', { actie: 'nieuw', naam, ouderId }).then((d) => d.map),
  mapHernoem: (id: string, naam: string) => roep<{ map: CloudMap }>('/api/owner/cloud/vnext/map', { actie: 'hernoem', id, naam }).then((d) => d.map),
  mapVerplaats: (id: string, ouderId: string | null) => roep<{ map: CloudMap }>('/api/owner/cloud/vnext/map', { actie: 'verplaats', id, ouderId }).then((d) => d.map),
  mapVerwijder: (id: string) => roep<{ aantal: number }>('/api/owner/cloud/vnext/map', { actie: 'verwijder', id }),
  bestandHernoem: (id: string, naam: string) => roep<{ bestand: CloudBestand }>('/api/owner/cloud/vnext/bestand', { actie: 'hernoem', id, naam }).then((d) => d.bestand),
  bestandVerplaats: (ids: string[], mapId: string | null) => roep<{ aantal: number }>('/api/owner/cloud/vnext/bestand', { actie: 'verplaats', ids, mapId }),
  bestandTags: (id: string, tags: string[]) => roep<{ bestand: CloudBestand }>('/api/owner/cloud/vnext/bestand', { actie: 'tags', id, tags }).then((d) => d.bestand),
  bestandFavoriet: (ids: string[], favoriet: boolean) => roep<{ aantal: number }>('/api/owner/cloud/vnext/bestand', { actie: 'favoriet', ids, favoriet }),
  naarPrullenbak: (ids: string[]) => roep<{ aantal: number }>('/api/owner/cloud/vnext/bestand', { actie: 'verwijder', ids }),
  herstel: (ids: string[]) => roep<{ aantal: number }>('/api/owner/cloud/vnext/bestand', { actie: 'herstel', ids }),
  definitiefWeg: (ids: string[]) => roep<{ aantal: number }>('/api/owner/cloud/vnext/bestand', { actie: 'definitief', ids }),
  uploadBegin: (naam: string, mime: string, bytes: number, mapId: string | null) => roep<UploadBegin>('/api/owner/cloud/vnext/upload', { actie: 'begin', naam, mime, bytes, mapId }),
  uploadStuk: (id: string, offset: number, data: string) => roep<{ ontvangen: number }>('/api/owner/cloud/vnext/upload', { actie: 'stuk', id, offset, data }),
  uploadStatus: (id: string) => roep<{ id: string; naam: string; bytes: number; stukMax: number; ontvangen: number; ontbreekt: number[] }>('/api/owner/cloud/vnext/upload', { actie: 'status', id }),
  uploadZoek: (naam: string, bytes: number, mapId: string | null) => roep<{ sessie: { id: string; ontvangen: number } | null }>('/api/owner/cloud/vnext/upload', { actie: 'zoek', naam, bytes, mapId }),
  uploadKlaar: (id: string, sha256: string) => roep<{ bestand: CloudBestand }>('/api/owner/cloud/vnext/upload', { actie: 'klaar', id, sha256 }).then((d) => d.bestand),
  uploadAfbreken: (id: string) => roep<{ ok: boolean }>('/api/owner/cloud/vnext/upload', { actie: 'afbreken', id }),
  download: (id: string, versie?: string) => roep<{ naam: string; mime: string; bytes: number; sha256: string; data: string }>('/api/owner/cloud/vnext/download', { id, versie }),
  downloadDeel: (v: { id: string; versie?: string; offset: number; lengte: number }) => roep<{ naam: string; mime: string; bytes: number; sha256: string; offset: number; data: string }>('/api/owner/cloud/vnext/download', v as unknown as Record<string, unknown>),
  taken: (v: TakenVraag) => roep<{ taak?: CloudTaak; taken?: CloudTaak[]; ok?: boolean }>('/api/owner/cloud/vnext/taken', v as unknown as Record<string, unknown>),
  versies: (id: string) => roep<{ versies: CloudVersie[] }>('/api/owner/cloud/vnext/versies', { id }).then((d) => d.versies),
  versieHerstel: (id: string, versie: string) => roep<{ bestand: CloudBestand }>('/api/owner/cloud/vnext/versies', { id, actie: 'herstel', versie }).then((d) => d.bestand),
  // ---- integraties (vNext, backend/cloud-vnext-integraties.ts)
  integraties: () => roep<IntegratiesUit>('/api/owner/cloud/vnext/integraties'),
  // ---- bestaande routes die vNext hergebruikt
  bootstrap: () => roep<Record<string, unknown>>('/api/owner/cloud/bootstrap'),
  capture: (v: Record<string, unknown>) => roep<Record<string, unknown>>('/api/owner/cloud/capture', v),
  itemOpen: (id: string) => roep<Record<string, unknown>>(`/api/owner/cloud/items/${encodeURIComponent(id)}/open`),
  driveBrowse: (v: Record<string, unknown>) => roep<Record<string, unknown>>('/api/owner/cloud/google-suite/drive/browse', v),
  driveFile: (v: Record<string, unknown>) => roep<Record<string, unknown>>('/api/owner/cloud/google-suite/drive/file', v),
  googleStatus: () => roep<Record<string, unknown>>('/api/owner/cloud/providers/status/verify'),
  googleStart: (accountRole: 'primary' | 'additional' = 'primary') => roep<{ ok?: boolean; authUrl?: string }>('/api/owner/cloud/providers/google/connect/start', { accountRole, returnTo: location.href, locale: document.documentElement.lang === 'nl' ? 'nl' : 'uk' }),
};
export type IntegratiesUit = {
  google: { gekoppeld: boolean; accounts: Array<{ id: string; email: string; actief: boolean; status: string; principalId?: string; sync?: { laatstGeluktOp: number; laatstPogingOp: number; foutCode: string; herstelNodig: boolean } }>; fout?: string };
  photos: { gekoppeld: boolean };
  m4: { stagingAan: boolean; aanbieders: Array<{ id: string; sleutelsAanwezig: boolean; accounts: Array<{ id: string; label: string; status: string }> }> };
  zoekIndex: { cloud: boolean; drive: boolean };
};

export type TakenVraag =
  | { actie: 'nieuw'; soort: CloudTaakSoort; bron: CloudTaakPunt; doel: CloudTaakPunt }
  | { actie: 'lijst' } | { actie: 'annuleer'; id: string } | { actie: 'opnieuw'; id: string } | { actie: 'opruimen' };

// Het overdrachtbeheer (src/cloud-vnext/overdracht-beheer.ts) kent cloud-client bewust niet; hier wordt het echte
// vervoer geregistreerd zodra de clouddienst in de browser laadt. Tests geven hun eigen nagebootste vervoer mee.
const vervoer: Vervoer = {
  begin: (naam, mime, bytes, mapId) => cloudClient.uploadBegin(naam, mime, bytes, mapId),
  stuk: (id, offset, data) => cloudClient.uploadStuk(id, offset, data),
  status: (id) => cloudClient.uploadStatus(id),
  zoek: (naam, bytes, mapId) => cloudClient.uploadZoek(naam, bytes, mapId),
  klaar: (id, sha256) => cloudClient.uploadKlaar(id, sha256),
  afbreken: (id) => cloudClient.uploadAfbreken(id),
  downloadDeel: (v) => cloudClient.downloadDeel(v),
};
registreerVervoer(vervoer);

/** sha256 van een File/Blob in de browser (voor upload-klaar). */
export async function sha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Base64 van een stuk (ArrayBuffer) zonder de stack te laten overlopen. */
export function naarB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
