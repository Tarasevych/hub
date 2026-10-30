// ZOEKEN — OCR-ENGINES OP DE EIGEN SERVER (BYOS: niets gaat naar buiten).
//
// Volgorde bij ZOEK_OCR_ENGINE=auto:
//   1. `tesseract` als systeemprogramma (apt: tesseract-ocr) — snelst, eigen proces, hard te doden bij een tijdslimiet.
//   2. tesseract.js (WASM in een eigen thread; Apache-2.0; al in node_modules via officeparser en nu ook rechtstreeks
//      vastgezet in package.json). Werkt zonder systeempakketten; heeft dezelfde .traineddata-bestanden nodig.
//   3. de platformlaag ai.ocr (server/platform/ai.ts) — alleen als de eigenaar AI heeft ingesteld (nu: nooit).
// Taalbestanden (tessdata_fast, ±29 MB voor 9 talen) zitten NIET in de release-tar: `mijn-ruimte-installeer ocr-talen`
// zet ze met SHA-256-controle in ZOEK_OCR_TALEN_MAP (/srv/mijn-ruimte/ocr/tessdata). Ook de systeemmap van tesseract
// (/usr/share/tesseract-ocr/*/tessdata) telt mee. Is er geen engine of geen taal: eerlijk «niet beschikbaar», met wat
// de eigenaar moet doen — nooit stilletjes een lege tekst.
//
// Invoer gaat via stdin (tesseract `stdin stdout`, pdftoppm `-`): er wordt NIETS van de gebruiker op schijf gezet.
import { spawn } from 'node:child_process';
import { accessSync, constants, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { Tweetalig } from '../../shared/zoek-formaten';

export type EngineNaam = 'tesseract-cli' | 'tesseract-js' | 'platform-ai';
export type EngineKeuze = 'auto' | EngineNaam | 'uit';
export interface OcrEngine2 {
  naam: EngineNaam;
  talen: string[];                                            // de talen waarmee deze engine draait (tesseract-codes)
  herken(beeld: Uint8Array, mime: string, timeoutMs: number): Promise<string>;
  sluiten(): Promise<void>;
}
export type OcrInstellingen = {
  engine: EngineKeuze; talen: string[]; talenMap: string; tesseractPad: string; pdftoppmPad: string; paginaTimeoutMs: number;
};

export const SYSTEEM_TESSDATA = ['/usr/share/tesseract-ocr/5/tessdata', '/usr/share/tesseract-ocr/4.00/tessdata', '/usr/share/tessdata', '/usr/local/share/tessdata'];

const uitvoerbaar = (p: string) => { try { accessSync(p, constants.X_OK); return true; } catch { return false; } };
/** Zoekt een programma op PATH of op het opgegeven pad; '' als het er niet is. */
export function programmaPad(naam: string, expliciet?: string): string {
  if (expliciet) return uitvoerbaar(expliciet) ? expliciet : '';
  for (const d of (process.env.PATH || '/usr/local/bin:/usr/bin:/bin').split(delimiter)) { const p = join(d, naam); if (d && uitvoerbaar(p)) return p; }
  return '';
}

/** Welke talen (tesseract-codes) in welke map staan. Eerst de eigen map, dan de systeemmappen. */
export function talenInMappen(mappen: string[]): Array<{ map: string; talen: string[] }> {
  const uit: Array<{ map: string; talen: string[] }> = [];
  for (const map of mappen) {
    if (!map) continue;
    let namen: string[] = [];
    try { namen = readdirSync(map); } catch { continue; }
    const talen = namen.filter((n) => /^[a-z_]{3,12}\.traineddata$/i.test(n) && n !== 'osd.traineddata').map((n) => n.replace(/\.traineddata$/i, ''));
    if (talen.length) uit.push({ map, talen });
  }
  return uit;
}
/** Kiest de map die de meeste gewenste talen heeft (tesseract.js kan maar één map tegelijk) en de talen daarin. */
export function talenKiezen(gewenst: string[], mappen: Array<{ map: string; talen: string[] }>): { map: string; talen: string[]; ontbrekend: string[] } {
  let beste = { map: '', talen: [] as string[] };
  for (const m of mappen) { const t = gewenst.filter((g) => m.talen.includes(g)); if (t.length > beste.talen.length) beste = { map: m.map, talen: t }; }
  return { ...beste, ontbrekend: gewenst.filter((g) => !beste.talen.includes(g)) };
}

function metTijdslimiet<T>(p: Promise<T>, ms: number, bijTimeout: () => void): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([p, new Promise<T>((_, rej) => { t = setTimeout(() => { bijTimeout(); const e: any = new Error('TIJDSLIMIET'); e.code = 'TIJDSLIMIET'; rej(e); }, ms); })]).finally(() => clearTimeout(t));
}

/** Eén proces draaien met stdin-invoer, stdout-uitvoer en harde tijdslimiet (SIGKILL). Geen shell. */
export function procesUitvoeren(pad: string, args: string[], invoer: Uint8Array, timeoutMs: number, env: Record<string, string> = {}, maxUit = 64 * 1024 * 1024): Promise<Uint8Array> {
  return new Promise((res, rej) => {
    const p = spawn(pad, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8', OMP_THREAD_LIMIT: '1' /* tesseract met OpenMP-threads is op een kleine VM véél trager (gemeten 4 s vs 0,14 s); één thread per proces, parallellisme via ZOEK_OCR_PARALLEL */, ...env } });
    const uit: Buffer[] = []; let lengte = 0; let klaar = false; let fouttekst = '';
    const timer = setTimeout(() => { if (!klaar) { klaar = true; p.kill('SIGKILL'); const e: any = new Error('TIJDSLIMIET'); e.code = 'TIJDSLIMIET'; rej(e); } }, timeoutMs);
    p.stdout.on('data', (d: Buffer) => { lengte += d.length; if (lengte > maxUit) { if (!klaar) { klaar = true; clearTimeout(timer); p.kill('SIGKILL'); rej(Object.assign(new Error('UITVOER_TE_GROOT'), { code: 'UITVOER_TE_GROOT' })); } return; } uit.push(d); });
    p.stderr.on('data', (d: Buffer) => { if (fouttekst.length < 500) fouttekst += d.toString('utf8'); });
    p.on('error', (e) => { if (!klaar) { klaar = true; clearTimeout(timer); rej(Object.assign(new Error('PROCES_START_MISLUKT'), { code: 'PROCES_START_MISLUKT', detail: e.message })); } });
    p.on('close', (code) => { if (klaar) return; klaar = true; clearTimeout(timer); if (code === 0) res(new Uint8Array(Buffer.concat(uit))); else rej(Object.assign(new Error(`PROCES_FOUT_${code}`), { code: `PROCES_FOUT_${code}`, detail: fouttekst.replace(/\s+/g, ' ').slice(0, 200) })); });
    p.stdin.on('error', () => undefined);
    p.stdin.end(Buffer.from(invoer.buffer, invoer.byteOffset, invoer.byteLength));
  });
}

/** (1) Systeem-tesseract. */
export function tesseractCliEngine(pad: string, talen: string[], talenMap: string): OcrEngine2 {
  return {
    naam: 'tesseract-cli', talen,
    herken: async (beeld, _mime, timeoutMs) => {
      const args = ['stdin', 'stdout', '-l', talen.join('+'), '--psm', '3'];
      if (talenMap) args.push('--tessdata-dir', talenMap);
      const uit = await procesUitvoeren(pad, args, beeld, timeoutMs, talenMap ? { TESSDATA_PREFIX: talenMap } : {});
      return Buffer.from(uit).toString('utf8');
    },
    sluiten: async () => undefined,
  };
}

/** (2) tesseract.js (WASM). Eén worker per engine, hergebruikt; bij een tijdslimiet beëindigd en later opnieuw gemaakt. */
export function tesseractJsEngine(talen: string[], talenMap: string): OcrEngine2 {
  let worker: any = null; let bezig: Promise<any> | null = null;
  const maak = async () => {
    const mod: any = await import('tesseract.js' as string);
    const createWorker = mod.createWorker || mod.default?.createWorker;
    return createWorker(talen.join('+'), 1, { langPath: talenMap, gzip: false, cacheMethod: 'none', logger: () => undefined, errorHandler: () => undefined });
  };
  const sluit = async () => { const w = worker; worker = null; bezig = null; if (w) await w.terminate().catch(() => undefined); };
  return {
    naam: 'tesseract-js', talen,
    herken: async (beeld, _mime, timeoutMs) => {
      if (!worker) { bezig = bezig || maak(); worker = await metTijdslimiet(bezig, timeoutMs, () => undefined).catch(async (e) => { await sluit(); throw e; }); }
      const w = worker;
      const r: any = await metTijdslimiet<any>(w.recognize(Buffer.from(beeld.buffer, beeld.byteOffset, beeld.byteLength)), timeoutMs, () => { void sluit(); });
      return String(r?.data?.text || '');
    },
    sluiten: sluit,
  };
}

/** (3) Platformlaag ai.ocr — zelfde aanroep als handschrift-OCR (backend/mail-handschrift.ts). */
export function platformAiEngine(ai: { ocr: (o: Record<string, unknown>) => Promise<{ text: string }> }, talen: string[]): OcrEngine2 {
  return {
    naam: 'platform-ai', talen,
    herken: async (beeld, mime, timeoutMs) => {
      const r = await metTijdslimiet(ai.ocr({ images: [{ data: Buffer.from(beeld).toString('base64'), mimeType: mime || 'image/png' }], system: 'Transcribe all visible text in the supplied document image. Return plain text only, no commentary. If no text is visible, return an empty string.', prompt: 'Preserve the original language.', thinkingMode: 'FAST', temperature: 0, maxTokens: 8192, maxRetries: 1 }), timeoutMs, () => undefined);
      return String(r?.text || '');
    },
    sluiten: async () => undefined,
  };
}

export type EngineBesluit = { engine: OcrEngine2 | null; naam: EngineNaam | ''; talen: string[]; ontbrekend?: Tweetalig; pdfRaster: 'pdftoppm' | 'pdfjs-afbeelding'; pdftoppmPad: string };

/** Kiest de engine volgens de instellingen en wat er op deze server IS. Geen netwerk, geen gok. */
export async function engineKiezen(i: OcrInstellingen, ai?: { configured: () => boolean; ocr: (o: Record<string, unknown>) => Promise<{ text: string }> }): Promise<EngineBesluit> {
  const pdftoppmPad = programmaPad('pdftoppm', i.pdftoppmPad || undefined);
  const pdfRaster: EngineBesluit['pdfRaster'] = pdftoppmPad ? 'pdftoppm' : 'pdfjs-afbeelding';
  const geen = (ontbrekend: Tweetalig): EngineBesluit => ({ engine: null, naam: '', talen: [], ontbrekend, pdfRaster, pdftoppmPad });
  if (i.engine === 'uit') return geen({ uk: 'OCR вимкнено (ZOEK_OCR_ENGINE=uit)', nl: 'OCR staat uit (ZOEK_OCR_ENGINE=uit)' });
  const mappen = talenInMappen([i.talenMap, ...SYSTEEM_TESSDATA.filter((m) => m !== i.talenMap)]);
  const keuze = talenKiezen(i.talen, mappen);
  const taalTekst = i.talen.join('+');
  const geenTalen: Tweetalig = { uk: `Мовні дані OCR (${taalTekst}) не знайдено в ${i.talenMap}: виконайте «mijn-ruimte-installeer ocr-talen»`, nl: `Geen OCR-taalbestanden (${taalTekst}) in ${i.talenMap}: voer «mijn-ruimte-installeer ocr-talen» uit` };

  const cliPad = programmaPad('tesseract', i.tesseractPad || undefined);
  if ((i.engine === 'auto' || i.engine === 'tesseract-cli') && cliPad) {
    if (!keuze.talen.length) return geen(geenTalen);
    return { engine: tesseractCliEngine(cliPad, keuze.talen, keuze.map), naam: 'tesseract-cli', talen: keuze.talen, pdfRaster, pdftoppmPad };
  }
  if (i.engine === 'tesseract-cli') return geen({ uk: 'Програму tesseract не знайдено: встановіть пакет tesseract-ocr («mijn-ruimte-installeer ocr-talen» робить це)', nl: 'Programma tesseract niet gevonden: installeer pakket tesseract-ocr («mijn-ruimte-installeer ocr-talen» doet dat)' });
  if (i.engine === 'auto' || i.engine === 'tesseract-js') {
    let aanwezig = false; try { await import('tesseract.js' as string); aanwezig = true; } catch { aanwezig = false; }
    if (aanwezig) {
      if (!keuze.talen.length) return geen(geenTalen);
      return { engine: tesseractJsEngine(keuze.talen, keuze.map), naam: 'tesseract-js', talen: keuze.talen, pdfRaster, pdftoppmPad };
    }
    if (i.engine === 'tesseract-js') return geen({ uk: 'Пакет tesseract.js відсутній у node_modules', nl: 'Pakket tesseract.js ontbreekt in node_modules' });
  }
  if ((i.engine === 'auto' || i.engine === 'platform-ai') && ai?.configured()) return { engine: platformAiEngine(ai, i.talen), naam: 'platform-ai', talen: i.talen, pdfRaster, pdftoppmPad };
  return geen({ uk: 'OCR недоступний на цьому сервері: встановіть tesseract і мовні дані («mijn-ruimte-installeer ocr-talen»)', nl: 'OCR niet beschikbaar op deze server: installeer tesseract en taalbestanden («mijn-ruimte-installeer ocr-talen»)' });
}

/** PDF-pagina → PNG via poppler (stdin → stdout); lange zijde 2800 px (≈240 dpi op A4), zodat een A0-pagina niet het geheugen vult. */
export async function pdfPaginaViaPoppler(pdftoppmPad: string, pdf: Uint8Array, nr: number, timeoutMs: number): Promise<Uint8Array> {
  return procesUitvoeren(pdftoppmPad, ['-scale-to', '2800', '-png', '-f', String(nr), '-l', String(nr), '-'], pdf, timeoutMs, {}, 80 * 1024 * 1024);
}
