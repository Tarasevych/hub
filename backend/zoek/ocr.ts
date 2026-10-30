// ZOEKEN ETAPPE C — TEKST UIT BESTANDEN, MET OCR-CACHE PER SHA256 (VEROUDERD, zie hieronder).
//
// VEROUDERD SINDS 22.10.2026: de echte ingang is backend/zoek/tekst-extractie.ts (tekstUit / ocrPlan / ocrUitvoeren) met
// engines in ocr-engines.ts (systeem-tesseract, tesseract.js, platform-ai) en een OCR-cache PER GEBRUIKER EN RUIMTE
// (migratie 0102, app.zoek_ocr_tekst). Dit bestand blijft voor bestaande aanroepers en tests: de typen, soortVan(),
// pdfjsTekstLezer, platformOcrEngine en pgOcrCache (0096-tabel zonder user_id — nieuw code gebruikt die niet meer).
//
// Volgorde per bestand: (1) platte tekst → direct; (2) PDF → eerst de tekstlaag (pdfjs-dist, al een afhankelijkheid);
// (3) is die leeg, of is het een afbeelding → OCR. De OCR-engine is een INTERFACE: standaard de bestaande platformlaag
// `ai.ocr` (server/platform/ai.ts — dezelfde aanroep als handschrift-OCR in backend/mail-handschrift.ts). In fase A is AI
// uitgeschakeld (AI_NOT_CONFIGURED); dan wordt er NIETS in de cache gezet (het is tijdelijk) en meldt de uitslag eerlijk
// 'ocr_niet_beschikbaar'. Een echte engine (Tesseract, een provider) past in dezelfde interface zonder iets anders te raken.
//
// Eén keer per inhoud: de cachesleutel is sha256(bytes) + enginenaam. Ook gelijktijdige aanvragen voor dezelfde bytes
// delen één lopende herkenning (lopend-map), zodat twee bijlagen met hetzelfde bestand niet twee OCR-runs kosten.
import { createHash } from 'node:crypto';

export type OcrStatus = 'ok' | 'leeg' | 'niet_ondersteund' | 'te_groot';
export type OcrCacheRij = { sha256: string; engine: string; status: OcrStatus; tekst: string; mimeType: string; bytes: number };
export interface OcrCache { lees(sha256: string, engine: string): Promise<OcrCacheRij | null>; schrijf(rij: OcrCacheRij): Promise<void> }
export interface OcrEngine { naam: string; herken(bytes: Uint8Array, mimeType: string): Promise<string> }
export type PdfTekstLezer = (bytes: Uint8Array, maxPaginas: number) => Promise<{ tekst: string; paginas: number }>;
export type TekstUitslag = {
  sha256: string; tekst: string;
  herkomst: 'tekst' | 'pdf_tekstlaag' | 'ocr' | 'ocr_cache' | 'geen';
  status: 'ok' | 'leeg' | 'niet_ondersteund' | 'te_groot' | 'ocr_niet_beschikbaar' | 'fout';
  fout?: string;
};

export const MAX_OCR_BYTES = 20 * 1024 * 1024;
export const MAX_TEKST = 200_000;
export const sha256Hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const schoon = (t: string) => t.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEKST);

const AFBEELDING = /^image\/(png|jpe?g|webp|gif|bmp|tiff?)$/i;
const TEKST = /^(text\/|application\/(json|xml|x-ndjson|csv|javascript|x-yaml|yaml))/i;
export function soortVan(mimeType: string, naam = ''): 'tekst' | 'pdf' | 'afbeelding' | 'anders' {
  const m = String(mimeType || '').toLowerCase().split(';')[0].trim();
  const ext = (String(naam).toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || '';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (AFBEELDING.test(m) || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'].includes(ext)) return 'afbeelding';
  if (TEKST.test(m) || ['txt', 'md', 'csv', 'json', 'xml', 'html', 'htm', 'ics', 'eml', 'log', 'yaml', 'yml', 'ts', 'js', 'py'].includes(ext)) return 'tekst';
  return 'anders';
}
export const mimeVoorOcr = (mimeType: string, naam: string) => {
  const s = soortVan(mimeType, naam);
  if (s === 'pdf') return 'application/pdf';
  if (s !== 'afbeelding') return mimeType;
  const ext = (naam.toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || '';
  return AFBEELDING.test(mimeType) ? mimeType.toLowerCase() : ext === 'jpg' ? 'image/jpeg' : `image/${ext || 'png'}`;
};

/** Standaard-PDF-tekstlaag via pdfjs-dist (legacy build werkt in Node zonder worker). */
export const pdfjsTekstLezer: PdfTekstLezer = async (bytes, maxPaginas) => {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs' as string);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  try {
    const n = Math.min(doc.numPages, maxPaginas); const delen: string[] = [];
    for (let i = 1; i <= n; i++) { const p = await doc.getPage(i); const c = await p.getTextContent(); delen.push(c.items.map((it: any) => it.str || '').join(' ')); }
    return { tekst: delen.join('\n'), paginas: doc.numPages };
  } finally { await doc.destroy().catch(() => undefined); }
};

/** Engine op de bestaande platformlaag `ai.ocr`. Gooit AI_NOT_CONFIGURED zolang AI uit staat (fase A). */
export function platformOcrEngine(ai: { ocr: (o: Record<string, unknown>) => Promise<{ text: string }> }): OcrEngine {
  return {
    naam: 'platform-ai-ocr-v1',
    herken: async (bytes, mimeType) => {
      const data = Buffer.from(bytes).toString('base64');
      const r = await ai.ocr({ images: [{ data, mimeType }], system: 'Transcribe all visible text in the supplied document image. Return plain text only, no commentary. If no text is visible, return an empty string.', prompt: 'Preserve the original language.', thinkingMode: 'FAST', temperature: 0, maxTokens: 4096, maxRetries: 1 });
      return String(r?.text || '');
    },
  };
}

const TIJDELIJK = /AI_NOT_CONFIGURED|TIMEOUT|RATE|503|ECONN|NETWORK/i;
const lopend = new Map<string, Promise<TekstUitslag>>();

export type TekstDeps = { cache: OcrCache; engine: OcrEngine | null; pdf?: PdfTekstLezer; maxPdfPaginas?: number; minPdfTekst?: number };

export async function tekstUitInhoud(bytes: Uint8Array, mimeType: string, naam: string, deps: TekstDeps): Promise<TekstUitslag> {
  const sha = sha256Hex(bytes);
  const soort = soortVan(mimeType, naam);
  if (soort === 'tekst') { const t = schoon(new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, MAX_TEKST * 4))); return { sha256: sha, tekst: t, herkomst: 'tekst', status: t ? 'ok' : 'leeg' }; }
  if (soort === 'anders') return { sha256: sha, tekst: '', herkomst: 'geen', status: 'niet_ondersteund' };
  if (soort === 'pdf') {
    try {
      const r = await (deps.pdf || pdfjsTekstLezer)(bytes, deps.maxPdfPaginas ?? 200);
      const t = schoon(r.tekst);
      if (t.replace(/\s+/g, '').length >= (deps.minPdfTekst ?? 20)) return { sha256: sha, tekst: t, herkomst: 'pdf_tekstlaag', status: 'ok' };
    } catch { /* geen of kapotte tekstlaag: door naar OCR */ }
  }
  if (bytes.length > MAX_OCR_BYTES) return { sha256: sha, tekst: '', herkomst: 'geen', status: 'te_groot' };
  if (!deps.engine) return { sha256: sha, tekst: '', herkomst: 'geen', status: 'ocr_niet_beschikbaar' };
  const engine = deps.engine;
  const sleutel = `${sha}:${engine.naam}`;
  const bezig = lopend.get(sleutel); if (bezig) return bezig;
  const werk = (async (): Promise<TekstUitslag> => {
    const bekend = await deps.cache.lees(sha, engine.naam);
    if (bekend) return { sha256: sha, tekst: bekend.tekst, herkomst: 'ocr_cache', status: bekend.status === 'ok' ? 'ok' : bekend.status };
    try {
      const t = schoon(await engine.herken(bytes, mimeVoorOcr(mimeType, naam)));
      const status: OcrStatus = t ? 'ok' : 'leeg';
      await deps.cache.schrijf({ sha256: sha, engine: engine.naam, status, tekst: t, mimeType: mimeVoorOcr(mimeType, naam).slice(0, 200), bytes: bytes.length });
      return { sha256: sha, tekst: t, herkomst: 'ocr', status };
    } catch (e) {
      const code = e instanceof Error ? (e as any).code || e.message : 'OCR_MISLUKT';
      // Tijdelijk (AI uit, time-out, limiet): NIET cachen, later opnieuw. Anders ook niet cachen: een fout is geen inhoud.
      return { sha256: sha, tekst: '', herkomst: 'geen', status: TIJDELIJK.test(String(code)) ? 'ocr_niet_beschikbaar' : 'fout', fout: String(code).slice(0, 120) };
    }
  })();
  lopend.set(sleutel, werk);
  try { return await werk; } finally { lopend.delete(sleutel); }
}

/** Cache in app.zoek_ocr_cache (0096), via de systeemrol. */
export function pgOcrCache(q: (sql: string, p: unknown[]) => Promise<{ rows: any[] }>): OcrCache {
  return {
    lees: async (sha256, engine) => {
      const { rows } = await q('SELECT sha256, engine, status, tekst, mime_type, bytes FROM app.zoek_ocr_cache WHERE sha256 = $1 AND engine = $2', [sha256, engine]);
      const r = rows[0]; return r ? { sha256: r.sha256, engine: r.engine, status: r.status, tekst: r.tekst, mimeType: r.mime_type, bytes: Number(r.bytes) } : null;
    },
    schrijf: async (r) => { await q('INSERT INTO app.zoek_ocr_cache (sha256, engine, status, tekst, mime_type, bytes) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (sha256, engine) DO NOTHING', [r.sha256, r.engine, r.status, r.tekst, r.mimeType, r.bytes]); },
  };
}
