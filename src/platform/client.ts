// Zelf-gehoste vervanging van `@appdeploy/client` (zie PORTEERPLAN.md §2).
// - api: axios-achtige fetch-client naar de same-origin /api van de huidige host.
// - image.resizeIfNeeded: verkleint/hercodeert afbeeldingen in de browser.
// - invitesClient: bouwt en leest uitnodigingslinks (parameter `invite`).
import { neemAlgemeneHervat, neemStapOpFout, stapOpVragen } from './stap-op';

// Terug van «Підтвердити повторним входом через Google» zonder bekende actie: korte melding «повторіть дію».
// Mislukte Google-step-up zonder bekende actie: dezelfde melding, maar met de reden (nooit «підтверджено» als het niet zo is).
if (typeof window !== 'undefined') window.setTimeout(() => { if (neemAlgemeneHervat()) { const fout = neemStapOpFout(); void import('./bevestig-toegang').then((m) => m.toonHervatMelding(fout)).catch(() => undefined); } }, 400);

// ---------------------------------------------------------------------------------------------
// api
// ---------------------------------------------------------------------------------------------
export type ApiResponse<T = any> = { data: T; status: number; headers: Headers };

/** Fout met dezelfde velden die de app-code al uitleest (response.status/data, status, responseText). */
export class ApiError extends Error {
  status: number;
  statusCode: number;
  responseText: string;
  response: { status: number; statusText: string; data: any; responseText: string };
  constructor(status: number, statusText: string, data: any, responseText: string) {
    const code = data && typeof data === 'object' ? String((data as { error?: unknown }).error || (data as { reasonCode?: unknown }).reasonCode || '') : '';
    super(code || `HTTP_${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusCode = status;
    this.responseText = responseText;
    this.response = { status, statusText, data, responseText };
  }
}

function withQuery(url: string, data: unknown): string {
  if (!data || typeof data !== 'object') return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  }
  const qs = params.toString();
  return qs ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
}

async function request(method: string, url: string, data?: unknown, opnieuw = false): Promise<ApiResponse> {
  const hasBody = method !== 'GET' && method !== 'DELETE';
  const target = hasBody ? url : withQuery(url, data);
  let response: Response;
  try {
    response = await fetch(target, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: hasBody ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: hasBody ? JSON.stringify(data ?? {}) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', { error: 'NETWORK_ERROR' }, '');
  }
  const text = await response.text();
  let parsed: any = text;
  if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } } else parsed = null;
  if (!response.ok) {
    const fout = new ApiError(response.status, response.statusText, parsed, text);
    // Audit-fix 5/7: extra bevestiging gevraagd → venster «Підтвердіть доступ» (passkey, app-code, herstelcode of Google); daarna één herhaling.
    if (response.status === 403 && fout.message === 'STEP_UP_REQUIRED' && hasBody && !opnieuw && !url.includes('/api/owner/access/stap-op')) {
      // Kan het venster niet openen (chunk niet geladen na een nieuwe release, renderfout…): nooit stil falen maar een eigen code.
      let bevestigd = false;
      try { bevestigd = await stapOpVragen(data, (u, d) => request('POST', u, d, true)); }
      catch (err) { console.error('[stap-op] venster «Підтвердіть доступ» kon niet openen', err); throw new ApiError(0, 'STAP_OP_VENSTER_FOUT', { error: 'STAP_OP_VENSTER_FOUT' }, ''); }
      if (bevestigd) return request(method, url, data, true);
    }
    throw fout;
  }
  return { data: parsed, status: response.status, headers: response.headers };
}

export const api = {
  get: (url: string, data?: any) => request('GET', url, data),
  post: (url: string, data?: any) => request('POST', url, data),
  put: (url: string, data?: any) => request('PUT', url, data),
  delete: (url: string, data?: any) => request('DELETE', url, data),
};

// ---------------------------------------------------------------------------------------------
// image
// ---------------------------------------------------------------------------------------------
export interface PreparedImage { data: string; mimeType: string; width: number; height: number; bytes: number; resized: boolean }
export interface ImageResizeOptions { maxDimension?: number; maxPixels?: number; quality?: number; mimeType?: 'image/jpeg' | 'image/webp' | 'image/png' }

const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^,]*,/, ''));
  reader.onerror = () => reject(reader.error || new Error('IMAGE_READ_FAILED'));
  reader.readAsDataURL(blob);
});

export const image = {
  /** Verklein en hercodeer (standaard max 1600 px, max 2 MP, JPEG 0,82). */
  async resizeIfNeeded(file: File | Blob, options: ImageResizeOptions = {}): Promise<PreparedImage> {
    const maxDimension = options.maxDimension ?? 1600;
    const maxPixels = options.maxPixels ?? 2_000_000;
    const quality = options.quality ?? 0.82;
    const mimeType = options.mimeType ?? 'image/jpeg';
    const bitmap = await createImageBitmap(file);
    try {
      const { width, height } = bitmap;
      const scale = Math.min(1, maxDimension / Math.max(width, height), Math.sqrt(maxPixels / Math.max(1, width * height)));
      if (scale >= 1 && file.type === mimeType) {
        return { data: await blobToBase64(file), mimeType, width, height, bytes: file.size, resized: false };
      }
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('IMAGE_CANVAS_UNAVAILABLE');
      if (mimeType === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, w, h); }
      context.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('IMAGE_ENCODE_FAILED'))), mimeType, quality));
      return { data: await blobToBase64(blob), mimeType, width: w, height: h, bytes: blob.size, resized: true };
    } finally {
      bitmap.close();
    }
  },
};

// ---------------------------------------------------------------------------------------------
// invitesClient
// ---------------------------------------------------------------------------------------------
const INVITE_PARAM = 'invite';
const LEGACY_INVITE_PARAM = 'appdeploy_invite';
const INVITE_STORAGE_KEY = 'mijn-ruimte-pending-invite';

function takeFromParams(params: URLSearchParams): string | null {
  const code = params.get(INVITE_PARAM) || params.get(LEGACY_INVITE_PARAM);
  params.delete(INVITE_PARAM);
  params.delete(LEGACY_INVITE_PARAM);
  return code;
}

export const invitesClient = {
  /** Lees de openstaande uitnodigingscode (sessionStorage of URL) en haal de parameter uit de URL. */
  getPendingCode(): string | null {
    try {
      const stored = sessionStorage.getItem(INVITE_STORAGE_KEY);
      if (stored) return stored;
    } catch { /* sessionStorage niet beschikbaar */ }
    const url = new URL(location.href);
    let code = takeFromParams(url.searchParams);
    let hash = url.hash;
    if (!code && hash.includes('?')) {
      const [hashPath, hashQuery] = hash.split('?', 2);
      const params = new URLSearchParams(hashQuery);
      code = takeFromParams(params);
      const rest = params.toString();
      hash = rest ? `${hashPath}?${rest}` : hashPath;
    }
    if (!code || !/^[A-Za-z0-9_-]{8,128}$/.test(code)) return null;
    try { sessionStorage.setItem(INVITE_STORAGE_KEY, code); } catch { /* negeren */ }
    history.replaceState(history.state, '', `${url.pathname}${url.search}${hash}`);
    return code;
  },
  clearPendingCode(): void {
    try { sessionStorage.removeItem(INVITE_STORAGE_KEY); } catch { /* negeren */ }
  },
  /** Bouw een absolute uitnodigingslink, bijv. path '#/join' of '/join' of '?join=1'. */
  buildJoinUrl(code: string, options: { path?: string } = {}): string {
    const target = options.path || '/';
    const base = `${location.origin}/`;
    if (target.startsWith('#')) {
      const [hashPath, hashQuery = ''] = target.split('?', 2);
      const params = new URLSearchParams(hashQuery);
      params.set(INVITE_PARAM, code);
      return `${base}${hashPath}?${params.toString()}`;
    }
    const url = new URL(target, base);
    url.searchParams.set(INVITE_PARAM, code);
    return url.toString();
  },
};
