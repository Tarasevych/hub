// ZOEKEN — TEKSTEXTRACTIE: DE ENE INGANG VOOR Z2 (bronnen/indexering). Contract: de functies hieronder (uitleg: docs/zoek/ZOEKEN.nl.md).
//
//   tekstUit(invoer)        → tekst + pagina's + onderdelen (archief/e-mail) + OCR-plan, ZONDER OCR te draaien
//   ocrPlan(invoer)         → alleen het plan (welke pagina's een scan zijn, is er een engine, welke talen)
//   ocrUitvoeren(invoer)    → OCR voor de geplande pagina's, met cache per (gebruiker, ruimte, sha256, pagina, engine, talen)
//   ocrBeschikbaarheid()    → voor de bronstatus in de UI («OCR niet beschikbaar: installeer tesseract»)
//   ocrCacheWissen(...)     → bij verwijderen van een document / intrekken van een bron
//
// Isolatie en grenzen: het zware werk (pdfjs, officeparser, fflate) draait in een worker_thread met geheugenlimiet
// (ZOEK_TEKST_WERKER_MB) en tijdslimiet (ZOEK_TEKST_TIMEOUT_MS); bij overschrijding wordt de thread beëindigd en is de
// uitslag 'fout' (TIJDSLIMIET / GEHEUGENLIMIET) — de server zelf merkt er niets van. Zonder werker-bundel (ZOEK_WERKER_PAD
// of dist-server/zoek-werker.mjs) valt het terug op het eigen proces met alleen een tijdslimiet; dat wordt één keer
// gelogd. OCR draait in een eigen proces (tesseract) of WASM-thread (tesseract.js), ook met tijdslimiet per pagina,
// hoogstens ZOEK_OCR_PARALLEL tegelijk. Logregels bevatten nooit inhoud van bestanden.
//
// De OCR-cache is per gebruiker en ruimte (migratie 0102, app.zoek_ocr_tekst): herkende tekst is persoonlijke inhoud en
// volgt dezelfde ruimteregel als de index zelf. Een gedeelde cache op alleen sha256 (0096) zou een orakel zijn («heeft
// iemand op deze server dit bestand?») en zou tekst laten staan na het verwijderen van het document; dat doen we niet.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { ARCHIEF_GRENZEN_STANDAARD, FORMATEN, MAX_TEKST_TEKENS, STANDAARD_MAX_BYTES, STANDAARD_OCR_MAX_BYTES, formaatVan, type FormaatId, type Tweetalig } from '../../shared/zoek-formaten';
import type { ArchiefGrenzen } from './archief';
import { engineKiezen, pdfPaginaViaPoppler, type EngineBesluit, type EngineNaam, type OcrInstellingen } from './ocr-engines';
import { sha256Hex, tekstKern, onderdeelBytes, pdfPaginaAfbeeldingen, type KernOnderdeel, type KernOpties, type KernUitslag, type Pagina, type TekstHerkomst, type TekstStatus } from './tekst-kern';
import type { WerkerAntwoord, WerkerTaak } from './tekst-werker';

export { FORMATEN, formaatVan } from '../../shared/zoek-formaten';
export type { FormaatId, FormaatInfo } from '../../shared/zoek-formaten';
export type { TekstStatus, TekstHerkomst, Pagina } from './tekst-kern';

export type OcrSleutel = { userId: string; ruimte: 'prive' | 'technisch' };
export type OcrPlan = {
  nodig: boolean; reden: 'afbeelding' | 'pdf_scan' | 'pdf_deels_scan' | 'geen'; paginas: number[]; totaalPaginas: number;
  beschikbaar: boolean; engine: EngineNaam | ''; talen: string[]; ontbrekend?: Tweetalig; pdfRaster: 'pdftoppm' | 'pdfjs-afbeelding' | 'geen'; sha256: string;
};
export type Onderdeel = Omit<KernOnderdeel, 'ocrPlan'> & { ocrPlan?: OcrPlan };
export type TekstUitslag = {
  status: TekstStatus; herkomst: TekstHerkomst; tekst: string; sha256: string; bytes: number; mime: string; formaat: FormaatId;
  paginas?: Pagina[]; onderdelen?: Onderdeel[]; problemen?: Array<{ code: string; pad: string }>; ocrPlan?: OcrPlan; fout?: string; duurMs: number;
  werker: 'thread' | 'in-proces';
};
export type TekstInvoer = {
  bytes?: Uint8Array | Buffer; stream?: AsyncIterable<Uint8Array>; mime?: string; naam?: string; maxBytes?: number;
  ocr?: 'plan' | 'nooit' | 'direct'; sleutel?: OcrSleutel; talen?: string[]; archief?: Partial<ArchiefGrenzen>; signal?: AbortSignal;
  testVertragingMs?: number;   // alleen tests (hangende parser nabootsen)
};

// ---------- instellingen (ENV, elke aanroep opnieuw gelezen: tests en herladen zonder herstart) ----------
const getal = (naam: string, std: number, min = 0) => { const v = Number(process.env[naam]); return Number.isFinite(v) && v >= min ? v : std; };
export function instellingen() {
  const MiB = 1024 * 1024;
  return {
    maxBytes: getal('ZOEK_TEKST_MAX_BYTES', STANDAARD_MAX_BYTES, 1024),
    timeoutMs: getal('ZOEK_TEKST_TIMEOUT_MS', 60_000, 1000),
    werkerMb: getal('ZOEK_TEKST_WERKER_MB', 512, 64),
    pdfMaxPaginas: getal('ZOEK_PDF_MAX_PAGINAS', 500, 1),
    ocrMaxPaginas: getal('ZOEK_OCR_MAX_PAGINAS', 50, 1),
    ocrMaxBytes: getal('ZOEK_OCR_MAX_BYTES', STANDAARD_OCR_MAX_BYTES, 1024),
    ocrPaginaTimeoutMs: getal('ZOEK_OCR_PAGINA_TIMEOUT_MS', 45_000, 1000),
    ocrParallel: getal('ZOEK_OCR_PARALLEL', 1, 1),
    ocr: {
      engine: (['auto', 'tesseract-cli', 'tesseract-js', 'platform-ai', 'uit'].includes(String(process.env.ZOEK_OCR_ENGINE || 'auto')) ? String(process.env.ZOEK_OCR_ENGINE || 'auto') : 'auto') as OcrInstellingen['engine'],
      talen: String(process.env.ZOEK_OCR_TALEN || 'ukr+nld+eng+rus').split(/[+,\s]+/).map((t) => t.trim().toLowerCase()).filter((t) => /^[a-z_]{3,12}$/.test(t)),
      talenMap: String(process.env.ZOEK_OCR_TALEN_MAP || '/srv/mijn-ruimte/ocr/tessdata'),
      tesseractPad: String(process.env.ZOEK_OCR_TESSERACT_PAD || ''),
      pdftoppmPad: String(process.env.ZOEK_OCR_PDFTOPPM_PAD || ''),
      paginaTimeoutMs: getal('ZOEK_OCR_PAGINA_TIMEOUT_MS', 45_000, 1000),
    } as OcrInstellingen,
    archief: {
      maxTotaalBytes: getal('ZOEK_ARCHIEF_MAX_TOTAAL_MB', ARCHIEF_GRENZEN_STANDAARD.maxTotaalBytes / MiB, 1) * MiB,
      maxBestandBytes: getal('ZOEK_ARCHIEF_MAX_BESTAND_MB', ARCHIEF_GRENZEN_STANDAARD.maxBestandBytes / MiB, 1) * MiB,
      maxBestanden: getal('ZOEK_ARCHIEF_MAX_AANTAL', ARCHIEF_GRENZEN_STANDAARD.maxBestanden, 1),
      maxDiepte: getal('ZOEK_ARCHIEF_MAX_DIEPTE', ARCHIEF_GRENZEN_STANDAARD.maxDiepte, 1),
      maxVerhouding: getal('ZOEK_ARCHIEF_MAX_VERHOUDING', ARCHIEF_GRENZEN_STANDAARD.maxVerhouding, 2),
    } as ArchiefGrenzen,
  };
}

// ---------- werker-thread ----------
let werkerPadCache: string | null | undefined;
function werkerPad(): string | null {
  if (werkerPadCache !== undefined) return werkerPadCache;
  const kandidaten = [process.env.ZOEK_WERKER_PAD || ''];
  try { const hier = fileURLToPath(import.meta.url); kandidaten.push(new URL('../zoek-werker.mjs', `file://${hier}`).pathname, new URL('./zoek-werker.mjs', `file://${hier}`).pathname); } catch { /* geen import.meta */ }
  kandidaten.push('dist-server/zoek-werker.mjs');
  // 22.10 (etap F): `new Worker()` eist een absoluut pad of «./…» (anders ERR_WORKER_PATH en status «fout» voor élk bestand, zoals
  // bij de eenheidstest met een gebouwde dist-server/ naast de bron). Daarom altijd absoluut maken.
  werkerPadCache = kandidaten.map((k) => (k ? resolve(k) : '')).find((k) => k && existsSync(k)) || null;
  if (!werkerPadCache) console.warn('[zoek-tekst] geen werker-bundel gevonden (ZOEK_WERKER_PAD / dist-server/zoek-werker.mjs): tekstextractie draait in het proces zelf, alleen met tijdslimiet');
  return werkerPadCache;
}
export function werkerPadResetten() { werkerPadCache = undefined; }

class Werker {
  private w: Worker | null = null; private volgnr = 0; private ketting: Promise<unknown> = Promise.resolve();
  constructor(private pad: string) {}
  private start(): Worker {
    if (this.w) return this.w;
    const w = new Worker(this.pad, { resourceLimits: { maxOldGenerationSizeMb: instellingen().werkerMb, maxYoungGenerationSizeMb: 64 }, stdout: false, stderr: false });
    w.unref();
    w.on('error', () => { if (this.w === w) this.w = null; });
    w.on('exit', () => { if (this.w === w) this.w = null; });
    this.w = w; return w;
  }
  /** Taken strikt na elkaar (één zwaar bestand tegelijk per proces). */
  taak<T>(maak: (id: number) => WerkerTaak, over: ArrayBuffer[], timeoutMs: number): Promise<T> {
    const uit = this.ketting.then(() => this.eenTaak<T>(maak, over, timeoutMs));
    this.ketting = uit.catch(() => undefined);
    return uit;
  }
  private eenTaak<T>(maak: (id: number) => WerkerTaak, over: ArrayBuffer[], timeoutMs: number): Promise<T> {
    const id = ++this.volgnr; const w = this.start();
    return new Promise<T>((res, rej) => {
      let klaar = false;
      const opruimen = () => { clearTimeout(timer); w.off('message', opBericht); w.off('error', opFout); w.off('exit', opExit); };
      const stop = (code: string) => { if (klaar) return; klaar = true; opruimen(); this.w = null; w.terminate().catch(() => undefined); rej(Object.assign(new Error(code), { code })); };
      const timer = setTimeout(() => stop('TIJDSLIMIET'), timeoutMs);
      const opBericht = (a: WerkerAntwoord) => { if (a.id !== id || klaar) return; klaar = true; opruimen(); if (a.ok) res(a.uitslag as T); else rej(Object.assign(new Error(a.fout), { code: a.fout })); };
      const opFout = (e: any) => stop(e?.code === 'ERR_WORKER_OUT_OF_MEMORY' || /heap|memory/i.test(String(e?.message)) ? 'GEHEUGENLIMIET' : 'WERKER_FOUT');
      const opExit = (code: number) => stop(code === 0 ? 'WERKER_GESTOPT' : 'GEHEUGENLIMIET');
      w.on('message', opBericht); w.on('error', opFout); w.on('exit', opExit);
      try { w.postMessage(maak(id), over); } catch (e) { stop('WERKER_BERICHT'); }
    });
  }
  async sluiten() { const w = this.w; this.w = null; if (w) await w.terminate().catch(() => undefined); }
}
let werker: Werker | null = null;
export async function werkerSluiten() { if (werker) { await werker.sluiten(); werker = null; } }

function metTijd<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout; return Promise.race([p, new Promise<T>((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('TIJDSLIMIET'), { code: 'TIJDSLIMIET' })), ms); })]).finally(() => clearTimeout(t));
}
const kopie = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** Voert een kern-taak uit in de werker (of in het proces zelf als er geen bundel is). */
async function inWerker<T>(maak: (id: number, bytes: ArrayBuffer) => WerkerTaak, bytes: Uint8Array, timeoutMs: number, terugval: () => Promise<T>): Promise<{ uitslag: T; werker: 'thread' | 'in-proces' }> {
  const pad = werkerPad();
  if (pad) {
    werker = werker || new Werker(pad);
    const buf = kopie(bytes);
    return { uitslag: await werker.taak<T>((id) => maak(id, buf), [buf], timeoutMs), werker: 'thread' };
  }
  return { uitslag: await metTijd(terugval(), timeoutMs), werker: 'in-proces' };
}

// ---------- invoer normaliseren ----------
async function bytesLezen(i: TekstInvoer, maxBytes: number): Promise<{ bytes: Uint8Array; teGroot: boolean }> {
  if (i.bytes) { const b = i.bytes instanceof Uint8Array ? i.bytes : new Uint8Array(i.bytes as ArrayBufferLike); return { bytes: b, teGroot: b.length > maxBytes }; }
  if (!i.stream) return { bytes: new Uint8Array(0), teGroot: false };
  const delen: Uint8Array[] = []; let lengte = 0;
  for await (const brok of i.stream) { lengte += brok.length; if (lengte > maxBytes) return { bytes: new Uint8Array(0), teGroot: true }; delen.push(brok); }
  const uit = new Uint8Array(lengte); let o = 0; for (const d of delen) { uit.set(d, o); o += d.length; } return { bytes: uit, teGroot: false };
}
const kernOpties = (i: TekstInvoer): KernOpties => { const s = instellingen(); return { maxTekst: MAX_TEKST_TEKENS, maxPdfPaginas: s.pdfMaxPaginas, maxOcrPaginas: s.ocrMaxPaginas, archief: { ...s.archief, ...(i.archief || {}) }, ...(i.testVertragingMs ? { testVertragingMs: i.testVertragingMs } : {}) }; };

// ---------- OCR: engine (gecachet 60 s), beschikbaarheid, plan ----------
let engineCache: { op: number; besluit: EngineBesluit; sleutel: string } | null = null;
let aiLaag: { configured: () => boolean; ocr: (o: Record<string, unknown>) => Promise<{ text: string }> } | null | undefined;
async function aiLaagOphalen() {
  if (aiLaag !== undefined) return aiLaag;
  try { const m: any = await import('../../server/platform/ai'); aiLaag = m?.ai && m?.aiConfigured ? { configured: m.aiConfigured, ocr: m.ai.ocr } : null; } catch { aiLaag = null; }
  return aiLaag;
}
async function engine(): Promise<EngineBesluit> {
  const s = instellingen(); const sleutel = JSON.stringify(s.ocr);
  if (engineCache && engineCache.sleutel === sleutel && Date.now() - engineCache.op < 60_000) return engineCache.besluit;
  if (engineCache?.besluit.engine) await engineCache.besluit.engine.sluiten().catch(() => undefined);
  const besluit = await engineKiezen(s.ocr, (await aiLaagOphalen()) || undefined);
  engineCache = { op: Date.now(), besluit, sleutel };
  return besluit;
}
/** Voor tests: engine-keuze vergeten (na het zetten van ENV). */
export async function engineResetten() { if (engineCache?.besluit.engine) await engineCache.besluit.engine.sluiten().catch(() => undefined); engineCache = null; }

export async function ocrBeschikbaarheid(): Promise<Pick<OcrPlan, 'beschikbaar' | 'engine' | 'talen' | 'ontbrekend' | 'pdfRaster'>> {
  const b = await engine();
  return { beschikbaar: !!b.engine, engine: b.naam, talen: b.talen, ontbrekend: b.ontbrekend, pdfRaster: b.engine ? b.pdfRaster : 'geen' };
}
async function planAanvullen(k: KernUitslag['ocrPlan'] | undefined, sha: string): Promise<OcrPlan | undefined> {
  if (!k) return undefined;
  const b = await ocrBeschikbaarheid();
  return { ...k, sha256: k.sha256 || sha, beschikbaar: b.beschikbaar, engine: b.engine, talen: b.talen, ontbrekend: b.ontbrekend, pdfRaster: b.pdfRaster };
}

// ---------- hoofdingang ----------
export async function tekstUit(i: TekstInvoer): Promise<TekstUitslag> {
  const t0 = Date.now(); const s = instellingen(); const maxBytes = i.maxBytes ?? s.maxBytes;
  const basis = (bytes: Uint8Array, extra: Partial<TekstUitslag>): TekstUitslag => ({ status: 'fout', herkomst: 'geen', tekst: '', sha256: bytes.length ? sha256Hex(bytes) : '', bytes: bytes.length, mime: String(i.mime || '').split(';')[0].trim().toLowerCase(), formaat: formaatVan(i.mime, i.naam, bytes.subarray(0, 512)), duurMs: 0, werker: 'in-proces', ...extra, });
  const { bytes, teGroot } = await bytesLezen(i, maxBytes);
  if (teGroot) return { ...basis(new Uint8Array(0), { status: 'te_groot', fout: `MAX_BYTES_${maxBytes}` }), bytes: i.bytes?.length || 0, duurMs: Date.now() - t0 };
  if (i.signal?.aborted) return { ...basis(bytes, { status: 'fout', fout: 'AFGEBROKEN' }), duurMs: Date.now() - t0 };
  let kern: KernUitslag; let via: 'thread' | 'in-proces';
  try {
    const r = await inWerker<KernUitslag>((id, buf) => ({ id, taak: 'tekst', bytes: buf, mime: String(i.mime || ''), naam: String(i.naam || ''), opties: kernOpties(i) }), bytes, s.timeoutMs, () => tekstKern(bytes, String(i.mime || ''), String(i.naam || ''), kernOpties(i)));
    kern = r.uitslag; via = r.werker;
  } catch (e) {
    const code = String((e as any)?.code || (e as Error)?.message || 'FOUT').slice(0, 60);
    console.warn(`[zoek-tekst] extractie mislukt: ${code} (formaat ${formaatVan(i.mime, i.naam, bytes.subarray(0, 512))}, ${bytes.length} B)`);
    return { ...basis(bytes, { status: 'fout', fout: code }), duurMs: Date.now() - t0 };
  }
  const uit: TekstUitslag = { ...kern, onderdelen: undefined, ocrPlan: undefined, duurMs: 0, werker: via };
  // OCR-plan aanvullen met de werkelijkheid van deze server (engine, talen); 'nooit' maakt er een eerlijk «niet» van.
  const ocrModus = i.ocr || 'plan';
  if (kern.ocrPlan) {
    uit.ocrPlan = await planAanvullen(kern.ocrPlan, kern.sha256);
    if (ocrModus === 'nooit') uit.status = kern.tekst ? 'ok' : 'leeg';
    else if (!uit.ocrPlan?.beschikbaar) uit.status = 'ocr_niet_beschikbaar';
  }
  if (kern.onderdelen) {
    uit.onderdelen = [];
    for (const d of kern.onderdelen) {
      const plan = d.ocrPlan ? await planAanvullen(d.ocrPlan, d.sha256) : undefined;
      let status = d.status;
      if (plan && ocrModus === 'nooit') status = d.tekst ? 'ok' : 'leeg';
      else if (plan && !plan.beschikbaar) status = 'ocr_niet_beschikbaar';
      uit.onderdelen.push({ ...d, status, ocrPlan: plan });
    }
  }
  if (ocrModus === 'direct' && uit.status === 'ocr_nodig') {
    if (!i.sleutel) { uit.status = 'fout'; uit.fout = 'OCR_SLEUTEL_ONTBREEKT'; }
    else { const o = await ocrUitvoeren({ ...i, bytes, sleutel: i.sleutel }); return { ...o, duurMs: Date.now() - t0 }; }
  }
  uit.duurMs = Date.now() - t0;
  return uit;
}

export async function ocrPlan(i: Omit<TekstInvoer, 'ocr'>): Promise<OcrPlan> {
  const r = await tekstUit({ ...i, ocr: 'plan' });
  const b = await ocrBeschikbaarheid();
  return r.ocrPlan || { nodig: false, reden: 'geen', paginas: [], totaalPaginas: r.paginas?.length || 0, beschikbaar: b.beschikbaar, engine: b.engine, talen: b.talen, ontbrekend: b.ontbrekend, pdfRaster: b.pdfRaster, sha256: r.sha256 };
}

// ---------- OCR-cache (per gebruiker + ruimte) ----------
export type OcrTekstRij = { userId: string; ruimte: string; sha256: string; pagina: number; engine: string; talen: string; status: 'ok' | 'leeg'; tekst: string };
export interface OcrTekstCache {
  lees(sleutel: OcrSleutel, sha256: string, engine: string, talen: string, paginas: number[]): Promise<Map<number, OcrTekstRij>>;
  schrijf(rijen: OcrTekstRij[]): Promise<void>;
  wis(sleutel: OcrSleutel, sha256?: string): Promise<number>;
}
type Q = (sql: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
/** Cache in app.zoek_ocr_tekst (0102). Elke query heeft user_id én ruimte in de WHERE; RLS is de tweede laag. */
export function pgOcrTekstCache(q: Q): OcrTekstCache {
  return {
    lees: async (s, sha, engine, talen, paginas) => {
      const { rows } = await q('SELECT pagina, status, tekst FROM app.zoek_ocr_tekst WHERE user_id = $1 AND ruimte = $2 AND sha256 = $3 AND engine = $4 AND talen = $5 AND pagina = ANY($6::int[])', [s.userId, s.ruimte, sha, engine, talen, paginas]);
      const m = new Map<number, OcrTekstRij>(); for (const r of rows) m.set(Number(r.pagina), { userId: s.userId, ruimte: s.ruimte, sha256: sha, pagina: Number(r.pagina), engine, talen, status: r.status, tekst: r.tekst }); return m;
    },
    schrijf: async (rijen) => { for (const r of rijen) await q('INSERT INTO app.zoek_ocr_tekst (user_id, ruimte, sha256, pagina, engine, talen, status, tekst) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (user_id, ruimte, sha256, pagina, engine, talen) DO UPDATE SET status = EXCLUDED.status, tekst = EXCLUDED.tekst, aangemaakt_op = now()', [r.userId, r.ruimte, r.sha256, r.pagina, r.engine, r.talen, r.status, r.tekst.slice(0, MAX_TEKST_TEKENS)]); },
    wis: async (s, sha) => { const r = await q(`DELETE FROM app.zoek_ocr_tekst WHERE user_id = $1 AND ruimte = $2${sha ? ' AND sha256 = $3' : ''}`, sha ? [s.userId, s.ruimte, sha] : [s.userId, s.ruimte]); return Number(r.rowCount || 0); },
  };
}
export function geheugenOcrCache(): OcrTekstCache & { aantal: () => number } {
  const m = new Map<string, OcrTekstRij>();
  const k = (r: { userId: string; ruimte: string; sha256: string; pagina: number; engine: string; talen: string }) => `${r.userId}|${r.ruimte}|${r.sha256}|${r.pagina}|${r.engine}|${r.talen}`;
  return {
    aantal: () => m.size,
    lees: async (s, sha, engine, talen, paginas) => { const uit = new Map<number, OcrTekstRij>(); for (const p of paginas) { const r = m.get(k({ ...s, sha256: sha, pagina: p, engine, talen })); if (r) uit.set(p, r); } return uit; },
    schrijf: async (rijen) => { for (const r of rijen) m.set(k(r), r); },
    wis: async (s, sha) => { let n = 0; for (const [key, r] of m) if (r.userId === s.userId && r.ruimte === s.ruimte && (!sha || r.sha256 === sha)) { m.delete(key); n++; } return n; },
  };
}
let cache: OcrTekstCache | null = null;
export function ocrCacheInstellen(c: OcrTekstCache | null) { cache = c; }
async function cacheOphalen(): Promise<OcrTekstCache> {
  if (cache) return cache;
  const m: any = await import('../../server/platform/pg');
  cache = pgOcrTekstCache((sql, p = []) => m.getPool('systeem').query(sql, p));
  return cache;
}
export async function ocrCacheWissen(sleutel: OcrSleutel, sha256?: string): Promise<number> { return (await cacheOphalen()).wis(sleutel, sha256); }

// ---------- OCR uitvoeren ----------
let ocrBezig = 0; const ocrWacht: Array<() => void> = [];
async function ocrSlot<T>(fn: () => Promise<T>): Promise<T> {
  const max = instellingen().ocrParallel;
  if (ocrBezig >= max) await new Promise<void>((r) => ocrWacht.push(r));
  ocrBezig++;
  try { return await fn(); } finally { ocrBezig--; const v = ocrWacht.shift(); if (v) v(); }
}
const lopend = new Map<string, Promise<TekstUitslag>>();

export async function ocrUitvoeren(i: TekstInvoer & { sleutel: OcrSleutel; paginas?: number[]; pad?: string }): Promise<TekstUitslag> {
  const t0 = Date.now(); const s = instellingen();
  if (!i.sleutel?.userId || !['prive', 'technisch'].includes(i.sleutel?.ruimte)) throw Object.assign(new Error('OCR_SLEUTEL_ONGELDIG'), { code: 'OCR_SLEUTEL_ONGELDIG' });
  let { bytes, teGroot } = await bytesLezen(i, i.maxBytes ?? s.maxBytes);
  const leeg = (status: TekstStatus, fout?: string, extra: Partial<TekstUitslag> = {}): TekstUitslag => ({ status, herkomst: 'geen', tekst: '', sha256: bytes.length ? sha256Hex(bytes) : '', bytes: bytes.length, mime: String(i.mime || ''), formaat: formaatVan(i.mime, i.naam, bytes.subarray(0, 512)), fout, duurMs: Date.now() - t0, werker: 'in-proces', ...extra });
  if (teGroot) return leeg('te_groot', `MAX_BYTES_${i.maxBytes ?? s.maxBytes}`);
  let mime = String(i.mime || ''), naam = String(i.naam || '');
  // Bijlage in een archief/e-mail: eerst dat onderdeel eruit halen (in de werker).
  if (i.pad) {
    try {
      const r = await inWerker<{ bytes: ArrayBuffer; mime: string; naam: string } | null>((id, buf) => ({ id, taak: 'onderdeel', bytes: buf, mime, naam, pad: i.pad!, opties: kernOpties(i) }), bytes, s.timeoutMs, async () => { const x = await onderdeelBytes(bytes, mime, naam, i.pad!, kernOpties(i)); return x ? { bytes: kopie(x.bytes), mime: x.mime, naam: x.naam } : null; });
      if (!r.uitslag) return leeg('fout', 'ONDERDEEL_NIET_GEVONDEN');
      bytes = new Uint8Array(r.uitslag.bytes); mime = r.uitslag.mime; naam = r.uitslag.naam;
    } catch (e) { return leeg('fout', String((e as any)?.code || 'FOUT').slice(0, 60)); }
  }
  const sha = sha256Hex(bytes);
  const sleutelTekst = `${i.sleutel.userId}|${i.sleutel.ruimte}|${sha}|${(i.paginas || []).join(',')}`;
  const bezig = lopend.get(sleutelTekst); if (bezig) return bezig;
  const werk = (async (): Promise<TekstUitslag> => {
    const basis = await tekstUit({ bytes, mime, naam, ocr: 'plan', archief: i.archief, maxBytes: i.maxBytes });
    if (basis.status !== 'ocr_nodig' && basis.status !== 'ocr_niet_beschikbaar') return basis;         // al tekst, of iets anders aan de hand
    const plan = basis.ocrPlan!;
    if (!plan.beschikbaar) return { ...basis, status: 'ocr_niet_beschikbaar', duurMs: Date.now() - t0 };
    if (bytes.length > s.ocrMaxBytes) return { ...basis, status: 'te_groot', fout: `OCR_MAX_BYTES_${s.ocrMaxBytes}`, duurMs: Date.now() - t0 };
    const b = await engine(); const eng = b.engine!;
    const talen = eng.talen.join('+');
    const gewenst = (i.paginas?.length ? i.paginas.filter((p) => plan.paginas.includes(p)) : plan.paginas).slice(0, s.ocrMaxPaginas);
    const c = await cacheOphalen();
    const bekend = await c.lees(i.sleutel, sha, eng.naam, talen, gewenst);
    const ontbrekend = gewenst.filter((p) => !bekend.has(p));
    const nieuw: OcrTekstRij[] = []; const fouten: string[] = [];
    if (ontbrekend.length) {
      await ocrSlot(async () => {
        for (const nr of ontbrekend) {
          if (i.signal?.aborted) { fouten.push(`p${nr}:AFGEBROKEN`); break; }
          try {
            const beelden = await paginaBeelden(bytes, basis.formaat, nr, b);
            if (!beelden.length) { nieuw.push({ userId: i.sleutel.userId, ruimte: i.sleutel.ruimte, sha256: sha, pagina: nr, engine: eng.naam, talen, status: 'leeg', tekst: '' }); continue; }
            const delen: string[] = [];
            for (const beeld of beelden) delen.push((await eng.herken(beeld.bytes, beeld.mime, s.ocrPaginaTimeoutMs)).trim());
            const tekst = delen.filter(Boolean).join('\n').replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEKST_TEKENS);
            nieuw.push({ userId: i.sleutel.userId, ruimte: i.sleutel.ruimte, sha256: sha, pagina: nr, engine: eng.naam, talen, status: tekst ? 'ok' : 'leeg', tekst });
          } catch (e) {
            const code = String((e as any)?.code || (e as Error)?.message || 'OCR_FOUT').slice(0, 40);
            fouten.push(`p${nr}:${code}`);
            console.warn(`[zoek-ocr] pagina ${nr} mislukt: ${code} (${eng.naam}, ${bytes.length} B)`);
            if (code === 'PROCES_START_MISLUKT') break;
          }
        }
      });
      if (nieuw.length) await c.schrijf(nieuw);
    }
    // Samenvoegen: tekstlaag per pagina + OCR per pagina, in paginavolgorde.
    const ocrPer = new Map<number, string>(); for (const [p, r] of bekend) ocrPer.set(p, r.tekst); for (const r of nieuw) ocrPer.set(r.pagina, r.tekst);
    const paginas: Pagina[] = (basis.paginas?.length ? basis.paginas : [{ nr: 1, tekst: '' }]).map((p) => ocrPer.has(p.nr) ? { nr: p.nr, tekst: ocrPer.get(p.nr) || '', ocr: true } : p);
    const tekst = paginas.map((p) => p.tekst).filter(Boolean).join('\n').slice(0, MAX_TEKST_TEKENS);
    const uitCache = ontbrekend.length === 0 && gewenst.length > 0;
    const status: TekstStatus = tekst ? 'ok' : fouten.length && !nieuw.length ? 'fout' : 'leeg';
    return { ...basis, status, herkomst: uitCache ? 'ocr_cache' : 'ocr', tekst, paginas, ocrPlan: { ...plan, paginas: plan.paginas.filter((p) => !ocrPer.has(p)) , nodig: plan.paginas.some((p) => !ocrPer.has(p)) }, fout: fouten.length ? `OCR_DEELS ${fouten.join(' ')}`.slice(0, 200) : undefined, duurMs: Date.now() - t0 };
  })();
  lopend.set(sleutelTekst, werk);
  try { return await werk; } finally { lopend.delete(sleutelTekst); }
}

/** Beeld(en) voor één pagina: een afbeelding is zichzelf; een PDF-pagina via poppler of via de ingesloten afbeeldingen (pdfjs). */
async function paginaBeelden(bytes: Uint8Array, formaat: FormaatId, nr: number, b: EngineBesluit): Promise<Array<{ bytes: Uint8Array; mime: string }>> {
  const s = instellingen();
  if (formaat === 'afbeelding') return [{ bytes, mime: 'image/png' }];
  if (formaat !== 'pdf') return [];
  if (b.pdfRaster === 'pdftoppm' && b.pdftoppmPad) {
    try { const png = await pdfPaginaViaPoppler(b.pdftoppmPad, bytes, nr, s.ocrPaginaTimeoutMs); if (png.length) return [{ bytes: png, mime: 'image/png' }]; }
    catch (e) { console.warn(`[zoek-ocr] pdftoppm mislukt (${String((e as any)?.code || 'FOUT')}), terug naar pdfjs-afbeeldingen`); }
  }
  const r = await inWerker<Array<{ nr: number; pngs: Uint8Array[] }>>((id, buf) => ({ id, taak: 'pdf_afbeeldingen', bytes: buf, paginas: [nr], maxPerPagina: 3 }), bytes, s.timeoutMs, () => pdfPaginaAfbeeldingen(bytes, [nr], 3));
  return (r.uitslag.find((x) => x.nr === nr)?.pngs || []).map((p) => ({ bytes: p instanceof Uint8Array ? p : new Uint8Array(p as ArrayBufferLike), mime: 'image/png' }));
}
