// Zelf-gehoste vervanging van `@appdeploy/client` (zie PORTEERPLAN.md §2).
// - api: axios-achtige fetch-client naar de same-origin /api van de huidige host.
// - image.resizeIfNeeded: verkleint/hercodeert afbeeldingen in de browser.
// - invitesClient: bouwt en leest uitnodigingslinks (parameter `invite`).
import { neemAlgemeneHervat, neemStapOpFout, onthoudKeuzeVerzenden, stapOpVragen } from './stap-op';
import { meldServerAntwoord } from './nieuwe-versie';
import { leesBase64, metLeesfout } from '../../shared/bestand-lezen';

// Terug van «Підтвердити повторним входом через Google» zonder bekende actie: korte melding «повторіть дію».
// Mislukte Google-step-up zonder bekende actie: dezelfde melding, maar met de reden (nooit «підтверджено» als het niet zo is).
// Was «Запам'ятати цей браузер» aangevinkt bij de keuze voor Google? Dan die keuze nu naar de server (die controleert zelf of
// er echt net is bevestigd). Eén keer per terugkeer; mislukt het, dan wordt er gewoon opnieuw gevraagd.
if (typeof window !== 'undefined') window.setTimeout(() => {
  void onthoudKeuzeVerzenden((url, data) => api.post(url, data));
  if (neemAlgemeneHervat()) { const fout = neemStapOpFout(); void import('./bevestig-toegang').then((m) => m.toonHervatMelding(fout)).catch(() => undefined); }
}, 400);

// ---------------------------------------------------------------------------------------------
// Gescheiden gegevensruimtes: een weigering van de poort is GEEN technische storing maar een stand die uitleg verdient.
// ---------------------------------------------------------------------------------------------
/**
 * Eén melding met de tweetalige uitleg van de poort en een link naar de plek waar de dienst verbonden wordt. Lui geladen,
 * zodat de kern van de client klein blijft; faalt dat, dan gebeurt er niets (een melding mag nooit een verzoek breken).
 */
async function ruimteWeigeringMelden(lichaam: unknown): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const { ruimteGeslotenUit } = await import('../../shared/ruimte-weergave');
    const dicht = ruimteGeslotenUit(lichaam);
    if (!dicht) return;
    const [{ emitCanonicalNotice }, { ruimteActieTekst, ruimteVerbindAdres }] = await Promise.all([
      import('../canoniek-meldingen'),
      import('../RuimteStrook'),
    ]);
    const lang: 'uk' | 'nl' = (typeof document !== 'undefined' && document.documentElement?.lang === 'nl') ? 'nl' : 'uk';
    emitCanonicalNotice({
      text: `${dicht.dienstNaam[lang]}: ${dicht.uitleg[lang]}`,
      kind: 'warning', source: 'ruimte', dedupeSeconds: 120,
      link: { href: ruimteVerbindAdres(lang), label: ruimteActieTekst(dicht.code, lang) },
    });
  } catch { /* uitleg kon niet worden getoond: het verzoek faalt zoals het faalde, nooit erger */ }
}

// ---------------------------------------------------------------------------------------------
// api
// ---------------------------------------------------------------------------------------------
export type ApiResponse<T = any> = { data: T; status: number; headers: Headers };

/** Fout met dezelfde velden die de app-code al uitleest (response.status/data, status, retryAfter, responseText). */
export class ApiError extends Error {
  status: number;
  statusCode: number;
  readonly retryAfter: number;
  readonly maxAttempts?: number;
  readonly windowSec?: number;
  responseText: string;
  response: { status: number; statusText: string; data: any; responseText: string };
  constructor(
    status: number,
    statusText: string,
    data: any,
    responseText: string,
    retryAfter = 0,
    maxAttempts?: number,
    windowSec?: number,
  ) {
    const obj = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
    const code = obj ? String(obj.error || obj.reasonCode || '') : '';
    super(code || `HTTP_${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusCode = status;
    const uitBody = obj ? Number(obj.retryAfter) : 0;
    this.retryAfter = retryAfter > 0 && Number.isFinite(retryAfter)
      ? Math.min(86_400, Math.max(1, Math.ceil(retryAfter)))
      : Number.isFinite(uitBody) && uitBody > 0
        ? Math.min(86_400, Math.max(1, Math.ceil(uitBody)))
        : 0;
    const pogingen = maxAttempts !== undefined ? maxAttempts : obj ? Number(obj.maxAttempts) : NaN;
    if (Number.isFinite(pogingen) && pogingen > 0) this.maxAttempts = Math.round(pogingen);
    const venster = windowSec !== undefined ? windowSec : obj ? Number(obj.windowSec) : NaN;
    if (Number.isFinite(venster) && venster > 0) this.windowSec = Math.round(venster);
    this.responseText = responseText;
    this.response = { status, statusText, data, responseText };
  }
}

function leesRetryAfter(kopWaarde: string | null, lichaamWaarde: unknown): number {
  const uitLichaam = Number(lichaamWaarde);
  if (Number.isFinite(uitLichaam) && uitLichaam > 0) return Math.min(86_400, Math.max(1, Math.ceil(uitLichaam)));
  if (!kopWaarde) return 0;
  const sec = Number(kopWaarde.trim());
  if (Number.isFinite(sec) && sec > 0) return Math.min(86_400, Math.max(1, Math.ceil(sec)));
  const datum = Date.parse(kopWaarde);
  return Number.isFinite(datum) && datum > Date.now()
    ? Math.min(86_400, Math.max(1, Math.ceil((datum - Date.now()) / 1000)))
    : 0;
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

// Menu v2 fase B1: aantal lopende API-verzoeken (voor de voortgangsbalk: klaar als het stil is) en optioneel afbreken
// (alleen voor LEZENDE verzoeken die door een nieuwe navigatie overbodig zijn geworden — nooit voor schrijvende acties).
export type ApiOpties = { signal?: AbortSignal };
let lopend = 0;
const activiteitLuisteraars = new Set<(n: number) => void>();
const meldActiviteit = (d: number) => { lopend = Math.max(0, lopend + d); for (const f of activiteitLuisteraars) { try { f(lopend); } catch { /* luisteraar mag de client niet breken */ } } };
export const apiLopend = () => lopend;
export function opApiActiviteit(f: (n: number) => void) { activiteitLuisteraars.add(f); return () => { activiteitLuisteraars.delete(f); }; }
export const isAfgebroken = (e: unknown) => e instanceof ApiError && e.message === 'ABORTED';

// ---------------------------------------------------------------------------------------------
// PERF-001 (09.11.2026): minder verzoeken per pagina.
// Gemeten op een lokale kopie van de site: id.* stuurde bij het openen 48 API-verzoeken, waarvan 15 dubbel (dezelfde lijst ×3,
// notities ×9), omdat elke sectie haar eigen lijst laadt. Elk verzoek gaat bij de eigenaar door de Cloudflare-tunnel en controleert
// op de server de sessie: dubbel werk is merkbare vertraging.
//  1. Gelijktijdige IDENTIEKE leesverzoeken (zelfde methode, pad en lichaam) worden samengevoegd tot één netwerkverzoek; elke
//     aanroeper krijgt een eigen kopie van het antwoord. Alleen paden die op de server zuiver lezen (lijst/laden/overzicht/status…);
//     nooit schrijvende acties en nooit de herhaling na een step-up. Een AbortSignal stopt alleen het wachten van die aanroeper. Er wordt NIETS bewaard: zodra het
//     antwoord er is, gaat het volgende verzoek weer naar de server.
//  2. Prapori (OFREP): losse /api/ofrep/v1/evaluate/flags/<sleutel>-verzoeken die binnen 25 ms vertrekken (de pagina vraagt er bij het
//     starten 6–9) gaan samen als één POST /api/flags met de lijst sleutels; elke aanroeper krijgt precies het OFREP-antwoord (en bij
//     een onbekende vlag dezelfde 404) als bij het losse verzoek. Mislukt de bundel, dan valt elke vlag terug op het losse verzoek.
// ---------------------------------------------------------------------------------------------
export const LEES_PAD = /\/(lijst|list|load|laden|snapshot|overzicht|status|voor-mij|tellers|activity|extensie-status|mijn-diensten|gelezen|accounts)$/;
const NOOIT_SAMENVOEGEN = /^\/api\/(beheer|owner\/session)\//;
// Losse leesroutes die niet op het patroon eindigen (backend/sleutelkluis-routes.ts: «stand» = overzicht, schrijft niets).
const LEES_EXTRA = new Set(['/api/owner/sleutelkluis/stand']);
const lopendeLezingen = new Map<string, Promise<ApiResponse>>();
const kopie = (r: ApiResponse): ApiResponse => {
  let data = r.data;
  if (data && typeof data === 'object') { try { data = structuredClone(data); } catch { data = JSON.parse(JSON.stringify(data)); } }
  return { data, status: r.status, headers: r.headers };
};
export function magSamenvoegen(method: string, url: string, opnieuw: boolean): boolean {
  if (opnieuw || (method !== 'POST' && method !== 'GET')) return false;
  const pad = url.split('?')[0];
  return pad.startsWith('/api/') && !NOOIT_SAMENVOEGEN.test(pad) && (LEES_PAD.test(pad) || LEES_EXTRA.has(pad));
}
const afgebroken = () => new ApiError(0, 'ABORTED', { error: 'ABORTED' }, '');
/** Wacht op het gedeelde verzoek, maar geeft «afgebroken» zodra het EIGEN signaal afgaat (de andere wachtenden merken niets). */
function metEigenSignaal<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(afgebroken());
  return new Promise<T>((ok, nee) => {
    const stop = () => nee(afgebroken());
    signal.addEventListener('abort', stop, { once: true });
    p.then((v) => { signal.removeEventListener('abort', stop); ok(v); }, (e) => { signal.removeEventListener('abort', stop); nee(e); });
  });
}

const VLAG_PAD = /^\/api\/ofrep\/v1\/evaluate\/flags\/([a-z0-9][a-z0-9._-]{0,79})$/i;
type VlagWacht = { sleutel: string; ok: (r: ApiResponse) => void; nee: (e: unknown) => void };
const vlagRijen = new Map<string, { lichaam: unknown; wacht: VlagWacht[] }>();
const ofrepVorm = (x: Record<string, unknown>) => ({ key: x.key, value: x.value, reason: x.reason, variant: x.variant, ...(x.errorCode ? { errorCode: x.errorCode, errorDetails: 'flag not found' } : {}), metadata: x.metadata ?? {} });
function vlagBundelVersturen(sleutelLichaam: string) {
  const rij = vlagRijen.get(sleutelLichaam); vlagRijen.delete(sleutelLichaam);
  if (!rij) return;
  const sleutels = [...new Set(rij.wacht.map((w) => w.sleutel))];
  // Eén netwerkverzoek per sleutel, ook als meerdere onderdelen dezelfde vlag tegelijk vragen; elk krijgt een eigen kopie.
  const losPerSleutel = new Map<string, Promise<ApiResponse>>();
  const los = (w: VlagWacht) => {
    let p = losPerSleutel.get(w.sleutel);
    if (!p) { p = requestKern('POST', `/api/ofrep/v1/evaluate/flags/${w.sleutel}`, rij.lichaam, false, {}); losPerSleutel.set(w.sleutel, p); }
    return p.then((r) => w.ok(kopie(r)), w.nee);
  };
  if (sleutels.length === 1) { rij.wacht.forEach(los); return; }
  const basis = rij.lichaam && typeof rij.lichaam === 'object' ? rij.lichaam as Record<string, unknown> : {};
  requestKern('POST', '/api/flags', { ...basis, sleutels }, false, {}).then((r) => {
    const lijst = Array.isArray(r.data?.vlaggen) ? r.data.vlaggen as Record<string, unknown>[] : null;
    if (!lijst) { rij.wacht.forEach(los); return; }
    for (const w of rij.wacht) {
      const x = lijst.find((v) => v && v.key === w.sleutel);
      if (!x) { void los(w); continue; }
      const antwoord = ofrepVorm(x);
      if (x.errorCode) w.nee(new ApiError(404, 'Not Found', antwoord, JSON.stringify(antwoord)));
      else w.ok({ data: antwoord, status: 200, headers: r.headers });
    }
  }, (e) => {
    // 401/403: de losse verzoeken zouden hetzelfde zeggen — direct doorgeven. Andere fouten: elk nog één keer los.
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) rij.wacht.forEach((w) => w.nee(e)); else rij.wacht.forEach(los);
  });
}
function vlagInBundel(sleutel: string, lichaam: unknown): Promise<ApiResponse> {
  return new Promise((ok, nee) => {
    const k = JSON.stringify(lichaam ?? {});
    let rij = vlagRijen.get(k);
    if (!rij) { rij = { lichaam, wacht: [] }; vlagRijen.set(k, rij); setTimeout(() => vlagBundelVersturen(k), 25); }
    rij.wacht.push({ sleutel, ok, nee });
  });
}

async function request(method: string, url: string, data?: unknown, opnieuw = false, opties: ApiOpties = {}): Promise<ApiResponse> {
  meldActiviteit(1);
  try {
    const vlag = method === 'POST' && !opnieuw && !opties.signal && typeof window !== 'undefined' ? VLAG_PAD.exec(url) : null;
    if (vlag) return await vlagInBundel(vlag[1], data);
    if (magSamenvoegen(method, url, opnieuw)) {
      if (opties.signal?.aborted) throw afgebroken();
      const sleutel = `${method} ${url} ${JSON.stringify(data ?? null)}`;
      let lopende = lopendeLezingen.get(sleutel);
      if (!lopende) {
        // Het gedeelde verzoek draagt GEEN signaal van één aanroeper: wie afbreekt, stopt alleen het eigen wachten.
        lopende = requestKern(method, url, data, opnieuw, {});
        lopendeLezingen.set(sleutel, lopende);
        const weg = () => { if (lopendeLezingen.get(sleutel) === lopende) lopendeLezingen.delete(sleutel); };
        lopende.then(weg, weg);
      }
      return kopie(await metEigenSignaal(lopende, opties.signal));
    }
    return await requestKern(method, url, data, opnieuw, opties);
  } finally { meldActiviteit(-1); }
}

async function requestKern(method: string, url: string, data: unknown, opnieuw: boolean, opties: ApiOpties): Promise<ApiResponse> {
  const hasBody = method !== 'GET' && method !== 'DELETE';
  const target = hasBody ? url : withQuery(url, data);
  if (opties.signal?.aborted) throw new ApiError(0, 'ABORTED', { error: 'ABORTED' }, '');
  let response: Response;
  try {
    response = await fetch(target, {
      signal: opties.signal,
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: hasBody ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: hasBody ? JSON.stringify(data ?? {}) : undefined,
    });
  } catch {
    if (opties.signal?.aborted) throw new ApiError(0, 'ABORTED', { error: 'ABORTED' }, '');
    throw new ApiError(0, 'NETWORK_ERROR', { error: 'NETWORK_ERROR' }, '');
  }
  // G4 + punt 3 (audit 19.10.2026): elke respons meldt de FEITEN aan nieuwe-versie.ts (route, code, rauw lichaam) zodat de plakkaat
  // «Деталі» echte gegevens heeft; één melding per verzoek, dus het pogingnummer klopt. Elke niet-storing-respons haalt de plakkaat weg.
  const route = `${method} ${target.split('?')[0]}`;
  let text: string;
  try { text = await response.text(); }
  catch {
    meldServerAntwoord(response.status, { route, code: `HTTP_${response.status}` });
    throw new ApiError(0, opties.signal?.aborted ? 'ABORTED' : 'NETWORK_ERROR', { error: opties.signal?.aborted ? 'ABORTED' : 'NETWORK_ERROR' }, '');
  }
  let parsed: any = text;
  if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } } else parsed = null;
  const antwoordCode = parsed && typeof parsed === 'object' ? String((parsed as { error?: unknown }).error || (parsed as { reasonCode?: unknown }).reasonCode || '') : '';
  const poortVlag = parsed && typeof parsed === 'object' && typeof (parsed as { codewoordPoort?: unknown }).codewoordPoort === 'boolean' ? (parsed as { codewoordPoort: boolean }).codewoordPoort : undefined;
  if (poortVlag !== undefined && typeof window !== 'undefined') void import('../geheim/codewoord-poort-brug').then((m) => m.zetCodewoordPoort(poortVlag));
  meldServerAntwoord(response.status, { route, code: antwoordCode || `HTTP_${response.status}`, lichaam: response.ok ? '' : text });
  // Ruimtes-scheiding: elk antwoord met kop X-Ruimte of een 401/403 gaat als gebeurtenis naar src/tech/ruimtes/ruimtes-opslag.ts,
  // die dan de controle-route vraagt en de uitleg toont. Zonder vlag stuurt de server geen kop en blijft alleen 401/403 over (onschuldig).
  if (typeof window !== 'undefined' && (response.headers.get('X-Ruimte') || response.status === 401 || response.status === 403)) {
    try { window.dispatchEvent(new CustomEvent('mr-ruimte-antwoord', { detail: { status: response.status, ruimte: response.headers.get('X-Ruimte'), pad: target.split('?')[0], code: antwoordCode } })); } catch { /* geen venster */ }
  }
  if (!response.ok) {
    const parsedObj = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    const retryAfter = leesRetryAfter(
      response.headers?.get?.('Retry-After') ?? response.headers?.get?.('retry-after') ?? null,
      parsedObj ? parsedObj.retryAfter : undefined,
    );
    if (retryAfter > 0 && parsedObj && parsedObj.retryAfter === undefined) {
      parsedObj.retryAfter = retryAfter;
    }
    const fout = new ApiError(response.status, response.statusText, parsed, text, retryAfter);
    if (fout.message === 'CODEWOORD_POORT' && typeof window !== 'undefined') void import('../geheim/codewoord-poort-brug').then((m) => m.zetCodewoordPoort(true));
    // KLACHT 3 VAN DE EIGENAAR (20.10.2026), het vangnet: weigert de poort van de gescheiden gegevensruimtes een dienst
    // (KEUZE_ONTBREEKT / DIENST_UIT / BEVROREN), dan hoort de mens de ECHTE reden te horen en de volgende stap te zien —
    // ook op een pagina die zo'n 403 zelf alleen als «er ging iets mis» kan melden. Hier, in de enige doorgang waar élk
    // antwoord langskomt, wordt die 403 één keer omgezet in een gewone melding met een knop. De pagina blijft onaangeraakt:
    // de fout wordt niet opgegeten maar gewoon doorgegeven.
    if (response.status === 403) void ruimteWeigeringMelden(parsed);
    // Audit-fix 5/7: extra bevestiging gevraagd → venster «Підтвердіть доступ» (passkey, app-code, herstelcode of Google); daarna één herhaling.
    // STEP_UP_STRONG_REQUIRED (§13.10): rechten intrekken / «Це був не я» — Google alleen telt dan niet.
    if (response.status === 403 && (fout.message === 'STEP_UP_REQUIRED' || fout.message === 'STEP_UP_STRONG_REQUIRED') && hasBody && !opnieuw && !url.includes('/api/owner/access/stap-op')) {
      // Kan het venster niet openen (chunk niet geladen na een nieuwe release, renderfout…): nooit stil falen maar een eigen code.
      let bevestigd = false;
      try { bevestigd = await stapOpVragen(data, (u, d) => request('POST', u, d, true), url, fout.message === 'STEP_UP_STRONG_REQUIRED'); }
      catch (err) { console.error('[stap-op] venster «Підтвердіть доступ» kon niet openen', err); throw new ApiError(0, 'STAP_OP_VENSTER_FOUT', { error: 'STAP_OP_VENSTER_FOUT' }, ''); }
      if (bevestigd) return request(method, url, data, true);
    }
    throw fout;
  }
  return { data: parsed, status: response.status, headers: response.headers };
}

export const api = {
  get: (url: string, data?: any) => request('GET', url, data),
  post: (url: string, data?: any, opties?: ApiOpties) => request('POST', url, data, false, opties),
  put: (url: string, data?: any) => request('PUT', url, data),
  patch: (url: string, data?: any) => request('PATCH', url, data),
  delete: (url: string, data?: any) => request('DELETE', url, data),
};

// ---------------------------------------------------------------------------------------------
// image
// ---------------------------------------------------------------------------------------------
export interface PreparedImage { data: string; mimeType: string; width: number; height: number; bytes: number; resized: boolean }
export interface ImageResizeOptions {
  maxDimension?: number;
  maxPixels?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/webp' | 'image/png';
  square?: boolean;
  maxBase64Length?: number;
}

// Lezen van de schijf gaat door shared/bestand-lezen.ts: `reader.error` is een DOMException van de File API (NotReadableError
// bij een verplaatst bestand of een cloudmap «op aanvraag») en mag nooit rauw bij de gebruiker komen. Eigenaar 20.10.2026.
const blobToBase64 = (blob: Blob) => leesBase64(blob);

export const image = {
  /** Verklein en hercodeer (standaard max 1600 px, max 2 MP, JPEG 0,82; met square=true gecentreerd 1:1 voor profielfoto's). */
  async resizeIfNeeded(file: File | Blob, options: ImageResizeOptions = {}): Promise<PreparedImage> {
    const maxDimension = options.maxDimension ?? 1600;
    const maxPixels = options.maxPixels ?? 2_000_000;
    const quality = options.quality ?? 0.82;
    const mimeType = options.mimeType ?? 'image/jpeg';
    const square = options.square === true;
    const maxBase64Length = options.maxBase64Length ?? 0;
    // createImageBitmap leest het bestand ZELF van de schijf: ook dat is een leesbewerking (NotReadableError, InvalidStateError).
    let bitmap: ImageBitmap;
    try {
      bitmap = await metLeesfout(file, () => createImageBitmap(file, { imageOrientation: 'from-image' }));
    } catch (err) {
      if ((err as { oorzaak?: unknown })?.oorzaak instanceof TypeError) {
        bitmap = await metLeesfout(file, () => createImageBitmap(file));
      } else {
        throw err;
      }
    }
    try {
      const { width, height } = bitmap;
      const bronBreedte = square ? Math.min(width, height) : width;
      const bronHoogte = square ? Math.min(width, height) : height;
      const bronX = square ? Math.floor((width - bronBreedte) / 2) : 0;
      const bronY = square ? Math.floor((height - bronHoogte) / 2) : 0;
      const scale = Math.min(1, maxDimension / Math.max(bronBreedte, bronHoogte), Math.sqrt(maxPixels / Math.max(1, bronBreedte * bronHoogte)));
      if (scale >= 1 && file.type === mimeType && (!square || width === height)) {
        const ongewijzigd = await blobToBase64(file);
        if (!maxBase64Length || ongewijzigd.length <= maxBase64Length) {
          return { data: ongewijzigd, mimeType, width: bronBreedte, height: bronHoogte, bytes: file.size, resized: false };
        }
      }
      const w = Math.max(1, Math.round(bronBreedte * scale));
      const h = Math.max(1, Math.round(bronHoogte * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('IMAGE_CANVAS_UNAVAILABLE');
      if (mimeType === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, w, h); }
      context.drawImage(bitmap, bronX, bronY, bronBreedte, bronHoogte, 0, 0, w, h);
      const stappen = maxBase64Length && mimeType !== 'image/png'
        ? Array.from(new Set([quality, Math.min(quality, 0.76), 0.64, 0.52]))
        : [quality];
      let laatsteBlob: Blob | null = null;
      let laatsteData = '';
      for (const q of stappen) {
        laatsteBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('IMAGE_ENCODE_FAILED'))), mimeType, q));
        laatsteData = await blobToBase64(laatsteBlob);
        if (!maxBase64Length || laatsteData.length <= maxBase64Length) break;
      }
      if (!laatsteBlob) throw new Error('IMAGE_ENCODE_FAILED');
      return { data: laatsteData, mimeType, width: w, height: h, bytes: laatsteBlob.size, resized: true };
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
