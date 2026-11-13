// ZOEKEN — KERN VAN DE TEKSTEXTRACTIE (zuiver: geen database, geen OCR-engine, geen netwerk).
//
// Dit bestand draait IN DE WERKER (backend/zoek/tekst-werker.ts, eigen thread met geheugen- en tijdslimiet) of, als er
// geen werker is, in het proces zelf. Het kent alle gedeclareerde formaten uit shared/zoek-formaten.ts en geeft per
// bestand terug: tekst, pagina's (PDF), onderdelen (archief/e-mail) en een OCR-plan (welke pagina's een scan zijn).
// OCR zelf gebeurt NIET hier: dat is de taak van tekst-extractie.ts (engine, cache, wachtrij van Z2).
//
// Veiligheid: niets wordt uitgevoerd of naar schijf geschreven; paden uit archieven komen genormaliseerd uit archief.ts;
// alle groottes zijn begrensd (bytes, tekens, pagina's, regels, archiefgrenzen); XML wordt alleen als tekst gestript,
// nooit met een DTD/entiteit-expanderende parser (eigen fallback) — officeparser (MIT, al een afhankelijkheid) krijgt
// decompressionLimits mee.
import { decode as htmlDecode } from 'html-entities';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { archiefUitpakken, type ArchiefGrenzen, type ArchiefProbleem } from './archief';
import { ARCHIEF_GRENZEN_STANDAARD, formaatVan, isArchiefFormaat, isOfficeFormaat, nietOndersteundReden, MAX_TEKST_TEKENS, type FormaatId } from '../../shared/zoek-formaten';

export type TekstStatus = 'ok' | 'leeg' | 'niet_ondersteund' | 'te_groot' | 'ocr_nodig' | 'ocr_niet_beschikbaar' | 'fout';
export type TekstHerkomst = 'tekst' | 'pdf_tekstlaag' | 'ocr' | 'ocr_cache' | 'docx' | 'xlsx' | 'pptx' | 'csv' | 'html' | 'eml' | 'archief' | 'geen';
export type Pagina = { nr: number; tekst: string; ocr?: boolean };
export type OcrReden = 'afbeelding' | 'pdf_scan' | 'pdf_deels_scan' | 'geen';
/** Het deel van het OCR-plan dat de kern kan bepalen (beschikbaarheid/engine vult tekst-extractie.ts aan). */
export type KernOcrPlan = { nodig: boolean; reden: OcrReden; paginas: number[]; totaalPaginas: number; sha256: string };
export type KernOnderdeel = {
  pad: string; naam: string; mime: string; sha256: string; bytes: number;
  status: TekstStatus; herkomst: TekstHerkomst; tekst: string; formaat: FormaatId;
  paginas?: Pagina[]; ocrPlan?: KernOcrPlan; fout?: string;
};
export type KernUitslag = {
  status: TekstStatus; herkomst: TekstHerkomst; tekst: string; sha256: string; bytes: number; mime: string; formaat: FormaatId;
  paginas?: Pagina[]; onderdelen?: KernOnderdeel[]; problemen?: ArchiefProbleem[]; ocrPlan?: KernOcrPlan; fout?: string;
};
export type KernOpties = {
  maxTekst?: number;            // tekens per bestand (standaard MAX_TEKST_TEKENS)
  maxPdfPaginas?: number;       // pagina's tekstlaag (standaard 500)
  maxOcrPaginas?: number;       // pagina's in het OCR-plan (standaard 50)
  minPdfTekstPerPagina?: number;// tekens waaronder een pagina «leeg» heet (standaard 8)
  archief?: Partial<ArchiefGrenzen>;
  diepte?: number;              // intern: nesting e-mail/archief
  onderdeelTekst?: number;      // tekens per onderdeel in de samenvatting van een archief (standaard 2000)
  testVertragingMs?: number;    // ALLEEN tests: simuleert een hangende parser (tijdslimiet van de werker)
};

export const sha256Hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const MAX_DIEPTE = 4;

const schoon = (t: string, max: number) => t.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/(?<![ \t\f\v])[ \t\f\v]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
const tekensZonderSpatie = (t: string) => t.replace(/\s+/g, '').length;

/** utf-8/utf-16 met BOM; anders utf-8 zonder exceptie. */
export function decodeerTekst(b: Uint8Array, maxBytes: number): string {
  const kop = b.subarray(0, Math.min(b.length, maxBytes));
  if (kop.length >= 2 && kop[0] === 0xff && kop[1] === 0xfe) return new TextDecoder('utf-16le').decode(kop.subarray(2));
  if (kop.length >= 2 && kop[0] === 0xfe && kop[1] === 0xff) { const s = kop.slice(2); for (let i = 0; i + 1 < s.length; i += 2) { const a = s[i]; s[i] = s[i + 1]; s[i + 1] = a; } return new TextDecoder('utf-16le').decode(s); }
  return new TextDecoder('utf-8', { fatal: false }).decode(kop);
}

// ---------- LINEAIRE ONTLEDING VAN HTML/XML (SEC-002 slot t, eindcontrole «omzeiling» punt 5) ----------
// Vroeger deden reguliere expressies dit werk: `<[^>]+>`, `<(script|…)\b[^>]*>[\s\S]*?<\/\1\s*>`, `<!--[\s\S]*?-->`, de titel en
// `[ \t\f\v]+\n`. Op een rij «<» zonder «>», «<svg » zonder sluittag of 200 kB «\f» probeert zo'n expressie vanaf ELKE positie opnieuw
// tot het einde: kwadratisch (200 kB «<» → 42 s in de zoekwerker; zonder werker staat de server zo lang stil). Nu doorloopt elke stap de
// tekst één keer, met dezelfde volgorde van stappen en EXACT dezelfde uitkomst (vergeleken met de oude pijplijn op het corpus en op
// 20 000 willekeurige stukken, tests/eenheid/sec-002-slot-t-20261112.test.ts). Hoofdletterongevoelig zoals /i zonder u-vlag: alleen A–Z.
// Раніше — регулярні вирази з квадратичним часом; тепер кожен крок — один лінійний прохід, результат той самий.
const isWoordteken = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
/** `\s` van JavaScript. */
const isWit = (c: number) => (c >= 9 && c <= 13) || c === 32 || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
/** Staat `woord` (kleine letters) op positie i? A–Z tellen als a–z, zoals /i zonder u-vlag. */
function begintMet(s: string, i: number, woord: string): boolean {
  if (i < 0 || i + woord.length > s.length) return false;
  for (let k = 0; k < woord.length; k++) {
    let c = s.charCodeAt(i + k);
    if (c >= 65 && c <= 90) c += 32;
    if (c !== woord.charCodeAt(k)) return false;
  }
  return true;
}
/** Na `i`: witruimte overslaan; staat er dan «>», de positie erna, anders -1. */
const witDanGt = (s: string, i: number): number => { while (i < s.length && isWit(s.charCodeAt(i))) i++; return s.charCodeAt(i) === 62 ? i + 1 : -1; };
/** Eerste «>» op of na i, voor oplopende i (elk stuk tekst wordt hoogstens één keer doorzocht). */
function gtZoeker(s: string): (i: number) => number {
  let pos = s.indexOf('>');
  return (i) => { if (pos !== -1 && pos < i) pos = s.indexOf('>', i); return pos; };
}
/**
 * Eén regex-stap «vervang elke treffer door `door`», maar dan lineair: `treffer(i)` krijgt elke «<» (alle patronen beginnen met «<»)
 * en geeft het einde van de treffer of -1. Na een treffer gaat het verder ná die treffer — precies zoals String.replace met /g.
 */
function vervangTags(s: string, door: string, treffer: (i: number) => number): string {
  let uit = '', vanaf = 0, i = s.indexOf('<');
  while (i >= 0) {
    const e = treffer(i);
    if (e > i) { uit += s.slice(vanaf, i) + door; vanaf = e; i = s.indexOf('<', e); } else i = s.indexOf('<', i + 1);
  }
  return vanaf === 0 ? s : uit + s.slice(vanaf);
}
/** `<!--[\s\S]*?-->` → door. Zonder afsluitende «-->» na een begin komt er ook later geen meer: stoppen. */
function zonderCommentaar(s: string, door: string): string {
  let uit = '', vanaf = 0, i = s.indexOf('<!--');
  while (i >= 0) {
    const e = s.indexOf('-->', i + 4);
    if (e < 0) break;
    uit += s.slice(vanaf, i) + door; vanaf = e + 3; i = s.indexOf('<!--', vanaf);
  }
  return vanaf === 0 ? s : uit + s.slice(vanaf);
}
/** Eerste `</naam\s*>` vanaf positie `van`: einde ervan, of -1. */
function sluittag(s: string, van: number, naam: string): number {
  for (let q = s.indexOf('</', van); q >= 0; q = s.indexOf('</', q + 2)) {
    if (!begintMet(s, q + 2, naam)) continue;
    const e = witDanGt(s, q + 2 + naam.length);
    if (e > 0) return e;
  }
  return -1;
}
/** `<naam\b[^>]*>…</naam\s*>` (eerste naam uit de lijst die past; geen naam is een voorvoegsel van een andere). */
function zonderBlokken(s: string, namen: readonly string[], door: string): string {
  const gt = gtZoeker(s);
  const geenSluittagVanaf = new Map<string, number>(); // naam → vanaf deze positie bestaat er zeker geen sluittag meer
  return vervangTags(s, door, (i) => {
    const naam = namen.find((n) => begintMet(s, i + 1, n));
    if (!naam) return -1;
    const na = i + 1 + naam.length;
    if (na < s.length && isWoordteken(s.charCodeAt(na))) return -1; // \b
    const j = gt(i);
    if (j < 0) return -1;
    const geen = geenSluittagVanaf.get(naam);
    if (geen !== undefined && j + 1 >= geen) return -1;
    const e = sluittag(s, j + 1, naam);
    if (e < 0) { geenSluittagVanaf.set(naam, j + 1); return -1; }
    return e;
  });
}
/** `<(naam)\b[^>]*>` → door (open tag, inhoud blijft). */
const openTags = (s: string, namen: readonly string[], door: string): string => {
  const gt = gtZoeker(s);
  return vervangTags(s, door, (i) => {
    const naam = namen.find((n) => begintMet(s, i + 1, n));
    if (!naam) return -1;
    const na = i + 1 + naam.length;
    if (na < s.length && isWoordteken(s.charCodeAt(na))) return -1;
    const j = gt(i);
    return j < 0 ? -1 : j + 1;
  });
};
/** `<(naam)\b[^>]*\/>` → door (lege tag die op «/>» eindigt). */
const legeTags = (s: string, namen: readonly string[], door: string): string => {
  const gt = gtZoeker(s);
  return vervangTags(s, door, (i) => {
    const naam = namen.find((n) => begintMet(s, i + 1, n));
    if (!naam) return -1;
    const na = i + 1 + naam.length;
    if (na < s.length && isWoordteken(s.charCodeAt(na))) return -1;
    const j = gt(i);
    return j > 0 && j - 1 >= na && s.charCodeAt(j - 1) === 47 ? j + 1 : -1;
  });
};
/** `<\/(naam)\s*>` → door. */
const sluitTags = (s: string, namen: readonly string[], door: string): string => vervangTags(s, door, (i) => {
  if (s.charCodeAt(i + 1) !== 47) return -1;
  for (const n of namen) { if (!begintMet(s, i + 2, n)) continue; const e = witDanGt(s, i + 2 + n.length); if (e > 0) return e; }
  return -1;
});
/** `<[^>]+>` → door. */
const alleTags = (s: string, door: string): string => {
  const gt = gtZoeker(s);
  return vervangTags(s, door, (i) => { if (i + 1 >= s.length || s.charCodeAt(i + 1) === 62) return -1; const j = gt(i); return j < 0 ? -1 : j + 1; });
};
/** De eerste treffer van `/<title[^>]*>([\s\S]*?)<\/title>/i`: alleen het EERSTE «<title» kan slagen (zie verslag slot t). */
function titelRuw(s: string): string {
  let i = s.indexOf('<');
  while (i >= 0 && !begintMet(s, i, '<title')) i = s.indexOf('<', i + 1);
  if (i < 0) return '';
  const j = s.indexOf('>', i + 6);
  if (j < 0) return '';
  for (let k = s.indexOf('<', j + 1); k >= 0; k = s.indexOf('<', k + 1)) if (begintMet(s, k, '</title>')) return s.slice(j + 1, k);
  return '';
}
const BLOK_WEG = ['script', 'style', 'noscript', 'template', 'svg', 'head'] as const;
const BLOK_EINDE = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'section', 'article', 'header', 'footer', 'blockquote', 'pre', 'table', 'ul', 'ol', 'dd', 'dt'] as const;
/** `<br\s*\/?>` → regeleinde. */
const brNaarRegel = (s: string): string => vervangTags(s, '\n', (i) => {
  if (!begintMet(s, i + 1, 'br')) return -1;
  let k = i + 3; while (k < s.length && isWit(s.charCodeAt(k))) k++;
  if (s.charCodeAt(k) === 47) k++;
  return s.charCodeAt(k) === 62 ? k + 1 : -1;
});

/** HTML → platte tekst: script/style/comments weg, blokelementen → regeleinde, entiteiten gedecodeerd. Lineair (zie hierboven). */
export function htmlNaarTekst(html: string, max = MAX_TEKST_TEKENS): { tekst: string; titel: string } {
  const bron = html.slice(0, max * 8);
  const titel = htmlDecode(titelRuw(bron)).replace(/\s+/g, ' ').trim().slice(0, 300);
  let t = zonderCommentaar(bron, ' ');
  t = zonderBlokken(t, BLOK_WEG, ' ');
  t = brNaarRegel(t);
  t = sluitTags(t, BLOK_EINDE, '\n');
  t = openTags(t, ['td', 'th'], '\t');
  t = alleTags(t, ' ');
  t = htmlDecode(t).replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n');
  return { tekst: schoon(t, max), titel };
}

/** OOXML/ODF-XML → tekst (alleen tekstknopen; alinea-/cel-/regelmarkeringen worden witruimte). Lineair, zoals htmlNaarTekst. */
export function xmlNaarTekst(xml: string, max: number): string {
  let t = zonderCommentaar(xml, ' ');
  t = legeTags(t, ['w:tab', 'text:tab'], '\t');
  t = legeTags(t, ['w:br', 'text:line-break', 'a:br'], '\n');
  t = sluitTags(t, ['w:p', 'text:p', 'text:h', 'a:p', 'table:table-row', 'row'], '\n');
  t = sluitTags(t, ['w:tc', 'table:table-cell', 'c'], '\t');
  t = alleTags(t, '');
  t = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(0x10ffff, Number(n)))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(0x10ffff, parseInt(n, 16)))).replace(/&amp;/g, '&');
  // `(?<![ \t])`: alleen vanaf het BEGIN van een reeks spaties/tabs proberen (lineair; zonder dit kwadratisch op een lange reeks).
  return schoon(t.replace(/(?<![ \t])[ \t]+\n/g, '\n').replace(/\t{2,}/g, '\t'), max);
}

// ---------- CSV / JSON ----------
function csvTekst(b: Uint8Array, maxBytes: number, max: number): string {
  const regels = decodeerTekst(b, maxBytes).split(/\r?\n/).slice(0, 20_000);
  return schoon(regels.map((r) => r.replace(/[;,\t]+/g, ' ').replace(/"/g, '')).join('\n'), max);
}
function jsonTekst(b: Uint8Array, maxBytes: number, max: number): string {
  const ruw = decodeerTekst(b, maxBytes);
  let waarde: unknown; try { waarde = JSON.parse(ruw); } catch { return schoon(ruw, max); }
  const delen: string[] = []; let lengte = 0;
  const loop = (v: unknown, d: number) => {
    if (lengte > max || d > 50) return;
    if (typeof v === 'string') { if (v.trim()) { delen.push(v); lengte += v.length + 1; } return; }
    if (typeof v === 'number' || typeof v === 'boolean') { delen.push(String(v)); lengte += 6; return; }
    if (Array.isArray(v)) { for (const x of v) loop(x, d + 1); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) { delen.push(k); lengte += k.length + 1; loop(x, d + 1); }
  };
  loop(waarde, 0);
  return schoon(delen.join('\n'), max);
}

// ---------- PDF (pdfjs-dist, tekstlaag + scan-detectie) ----------
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<any>; destroy: () => Promise<void> };
async function pdfOpenen(bytes: Uint8Array): Promise<{ pdfjs: any; doc: PdfDoc }> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs' as string);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0, stopAtErrors: false }).promise;
  return { pdfjs, doc };
}
export async function pdfLezen(bytes: Uint8Array, o: KernOpties = {}): Promise<{ paginas: Pagina[]; scanPaginas: number[]; totaal: number; versleuteld?: boolean }> {
  const maxP = o.maxPdfPaginas ?? 500, minT = o.minPdfTekstPerPagina ?? 8, maxTekst = o.maxTekst ?? MAX_TEKST_TEKENS;
  let pdfjs: any, doc: PdfDoc;
  try { ({ pdfjs, doc } = await pdfOpenen(bytes)); }
  catch (e) { if (/password/i.test(String((e as any)?.name || (e as any)?.message))) return { paginas: [], scanPaginas: [], totaal: 0, versleuteld: true }; throw e; }
  try {
    const n = Math.min(doc.numPages, maxP); const paginas: Pagina[] = []; const scan: number[] = []; let totaalTekens = 0;
    for (let i = 1; i <= n; i++) {
      if (totaalTekens > maxTekst) break;
      let tekst = '';
      let p: any;
      try { p = await doc.getPage(i); const c = await p.getTextContent(); tekst = schoon(c.items.map((it: any) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join(''), maxTekst); }
      catch { tekst = ''; }
      if (tekensZonderSpatie(tekst) < minT && p) {
        // Geen tekstlaag: is er een afbeelding op de pagina? Dan is het een scan en hoort hij in het OCR-plan.
        try {
          const ops = await p.getOperatorList();
          const metBeeld = ops.fnArray.some((f: number) => f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintInlineImageXObject || f === pdfjs.OPS.paintImageMaskXObject || f === pdfjs.OPS.paintJpegXObject);
          if (metBeeld) scan.push(i);
        } catch { /* kapotte pagina: niet als scan tellen */ }
      }
      paginas.push({ nr: i, tekst }); totaalTekens += tekst.length;
      try { p?.cleanup?.(); } catch { /* niets */ }
    }
    return { paginas, scanPaginas: scan, totaal: doc.numPages };
  } finally { await doc.destroy().catch(() => undefined); }
}

// PNG-encoder (alleen wat pdfjs levert: 1-bit grijs, RGB, RGBA) — zodat een scan uit een PDF zonder canvas/poppler naar
// een OCR-engine kan. Puur JS + zlib.
const crcTabel = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTabel[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const uit = new Uint8Array(12 + data.length); const dv = new DataView(uit.buffer);
  dv.setUint32(0, data.length); uit.set([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)], 4); uit.set(data, 8);
  dv.setUint32(8 + data.length, crc32(uit.subarray(4, 8 + data.length))); return uit;
}
export function naarPng(breedte: number, hoogte: number, soort: 1 | 2 | 3, data: Uint8Array): Uint8Array {
  const kleur = soort === 3 ? 6 : soort === 2 ? 2 : 0, diepte = soort === 1 ? 1 : 8;
  const rijBytes = soort === 1 ? (breedte + 7) >> 3 : breedte * (soort === 3 ? 4 : 3);
  const ruw = new Uint8Array((rijBytes + 1) * hoogte);
  for (let y = 0; y < hoogte; y++) { ruw[y * (rijBytes + 1)] = 0; ruw.set(data.subarray(y * rijBytes, (y + 1) * rijBytes), y * (rijBytes + 1) + 1); }
  const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer); dv.setUint32(0, breedte); dv.setUint32(4, hoogte); ihdr[8] = diepte; ihdr[9] = kleur;
  const idat = new Uint8Array(deflateSync(ruw, { level: 3 }));
  const delen = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', new Uint8Array(0))];
  const uit = new Uint8Array(delen.reduce((s, d) => s + d.length, 0)); let o = 0; for (const d of delen) { uit.set(d, o); o += d.length; } return uit;
}

/**
 * Afbeeldingen van PDF-pagina's als PNG (voor OCR zonder poppler/canvas): per pagina de ingesloten afbeeldingen
 * (hoogstens `maxPerPagina`, grootste eerst). Werkt voor de gewone scan (één foto per pagina); tekst-als-curven niet.
 */
export async function pdfPaginaAfbeeldingen(bytes: Uint8Array, paginas: number[], maxPerPagina = 3, maxPixels = 30e6): Promise<Array<{ nr: number; pngs: Uint8Array[] }>> {
  const { pdfjs, doc } = await pdfOpenen(bytes);
  const uit: Array<{ nr: number; pngs: Uint8Array[] }> = [];
  try {
    for (const nr of paginas) {
      if (nr < 1 || nr > doc.numPages) continue;
      const p = await doc.getPage(nr); const ops = await p.getOperatorList();
      const namen: string[] = [];
      for (let i = 0; i < ops.fnArray.length; i++) if (ops.fnArray[i] === pdfjs.OPS.paintImageXObject || ops.fnArray[i] === pdfjs.OPS.paintImageMaskXObject) namen.push(String(ops.argsArray[i][0]));
      const beelden: Array<{ px: number; png: Uint8Array }> = [];
      for (const naam of [...new Set(namen)]) {
        const obj: any = await new Promise((res) => { try { p.objs.get(naam, res); } catch { res(null); } });
        if (!obj || !obj.data || !obj.width || !obj.height) continue;
        const px = obj.width * obj.height; if (px > maxPixels) continue;
        const soort = obj.kind === 3 ? 3 : obj.kind === 2 ? 2 : obj.kind === 1 ? 1 : 0;
        if (!soort) continue;
        try { beelden.push({ px, png: naarPng(obj.width, obj.height, soort, obj.data) }); } catch { /* overslaan */ }
      }
      beelden.sort((a, b) => b.px - a.px);
      uit.push({ nr, pngs: beelden.slice(0, maxPerPagina).map((b) => b.png) });
      try { p.cleanup?.(); } catch { /* niets */ }
    }
  } finally { await doc.destroy().catch(() => undefined); }
  return uit;
}

// ---------- Office (officeparser → eigen fallback) ----------
async function officeViaParser(bytes: Uint8Array, formaat: FormaatId, max: number): Promise<string> {
  const mod: any = await import('officeparser' as string);
  const Parser = mod.OfficeParser || mod.default?.OfficeParser;
  const ast = await Parser.parseOffice(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), {
    fileType: formaat, extractAttachments: false, ignoreComments: true, ignoreNotes: false,
    decompressionLimits: { maxUncompressedBytes: 64 * 1024 * 1024, maxZipEntries: 3000 },
    ocr: { enabled: false },
  });
  const r = await ast.to('text', { includeImages: false });
  return schoon(typeof r?.value === 'string' ? r.value : '', max);
}
// ---------- XLSX (SEC-002 slot v, slot-toets 2) ----------
// Vroeger met reguliere expressies: `<si>([\s\S]*?)<\/si>`, `<row\b[^>]*>([\s\S]*?)<\/row>`, `<c\b([^>]*)>([\s\S]*?)<\/c>` en
// `<v>([\s\S]*?)<\/v>` lazen bij een ontbrekende sluittag vanaf ELKE open tag tot het einde (kwadratisch: 200 kB → ≈2 s, 2 MB →
// ≈200 s), en `<sheet\b[^>]*\bname="…"[^>]*\br:id="…"` / `<Relationship\b…` waren nog erger (32 kB → 17 s): `[^>]*` probeert er elke
// positie terug. Een xlsx van enkele kB (compressie tot 200×) hield zo de zoekwerker 60 s vast en de indexeerwachtrij stond stil.
// Nu: elk patroon één lineaire doorloop met indexOf, met EXACT dezelfde treffers in dezelfde volgorde (bewijs: vergelijking met de
// oude expressies op willekeurige en vijandige invoer in tests/eenheid/sec-002-slot-v-20261113.test.ts).
// Розбір xlsx: замість регулярних виразів із квадратичним (і гіршим) часом — лінійні проходи з тим самим результатом.

/** = `s.matchAll(/<si>([\s\S]*?)<\/si>/g)` → m[1]. Zonder «</si>» na een «<si>» komt er ook na een latere geen: stoppen. */
export function* xlsxSi(s: string): Generator<string> {
  for (let i = s.indexOf('<si>'); i >= 0;) {
    const e = s.indexOf('</si>', i + 4);
    if (e < 0) return;
    yield s.slice(i + 4, e);
    i = s.indexOf('<si>', e + 5);
  }
}
/**
 * = `s.matchAll(/<naam\b([^>]*)>([\s\S]*?)<\/naam>/g)` → [m[1], m[2]] (naam = 'row' of 'c'). De open tag eindigt bij de eerste «>»;
 * de inhoud bij de eerste «</naam>» daarna. Ontbreekt een van beide, dan ontbreekt hij ook voor elke latere start (die «>» ligt
 * nooit vroeger): stoppen in plaats van opnieuw tot het einde te zoeken.
 */
export function* xlsxBlokken(s: string, naam: string): Generator<[string, string]> {
  const open = `<${naam}`, sluit = `</${naam}>`;
  for (let i = s.indexOf(open); i >= 0;) {
    const a0 = i + open.length;
    if (a0 < s.length && isWoordteken(s.charCodeAt(a0))) { i = s.indexOf(open, i + 1); continue; } // \b
    const j = s.indexOf('>', a0);
    if (j < 0) return;
    const e = s.indexOf(sluit, j + 1);
    if (e < 0) return;
    yield [s.slice(a0, j), s.slice(j + 1, e)];
    i = s.indexOf(open, e + sluit.length);
  }
}
/** = `(s.match(/<v>([\s\S]*?)<\/v>/) || [])[1]`: alleen de eerste «<v>» kan slagen (heeft die geen «</v>», een latere ook niet). */
export function xlsxV(s: string): string | undefined {
  const k = s.indexOf('<v>');
  if (k < 0) return undefined;
  const e = s.indexOf('</v>', k + 3);
  return e < 0 ? undefined : s.slice(k + 3, e);
}
/** = `(s.match(/\bt="([^"]*)"/) || [])[1]`. Heeft de eerste geldige «t="» geen afsluitend «"», dan bestaat er geen latere «t="». */
export function xlsxT(s: string): string | undefined {
  for (let k = s.indexOf('t="'); k >= 0; k = s.indexOf('t="', k + 1)) {
    if (k > 0 && isWoordteken(s.charCodeAt(k - 1))) continue; // \b vóór «t»
    const q = s.indexOf('"', k + 3);
    return q < 0 ? undefined : s.slice(k + 3, q);
  }
  return undefined;
}
/**
 * = `s.matchAll(/<tag\b[^>]*\ba="([^"]*)"[^>]*\bb="([^"]*)"/g)` → [m[1], m[2]] (sheet/name/r:id en Relationship/Id/Target).
 * Zo zoekt de expressie: `[^>]*` reikt tot de eerste «>» (of het einde) en geeft dan positie per positie terug, dus de LAATSTE «a="»
 * in dat stuk eerst; de waarde loopt tot de eerste «"» (ook over «>» heen); daarna weer de LAATSTE «b="» tot de volgende «>» waarvan
 * de waarde een afsluitend «"» heeft. Lineair gemaakt per «groep» (het stuk tekst tot een «>»), één keer opgebouwd en onthouden:
 *  - alleen de laatste «a="» van een groep kan een waarde hebben die voorbij de «>» loopt; voor elke vroegere ligt de eerste «"» vóór
 *    de «>» (het «"» van de volgende «a="»), dus zoekt die «b="» in dezelfde groep — en de beste is dan altijd de laatste geldige;
 *  - de eerste «"» na een «a="» schuift mee op met de positie, dus «welke vroegere «a="» heeft zijn waarde vóór de laatste «b="»» is
 *    één grens per groep.
 * Elke start kost zo O(log n); elk stuk tekst wordt een vast aantal keren doorzocht.
 */
export function* xlsxTagMetTweeAttributen(s: string, tag: string, a: string, b: string): Generator<[string, string]> {
  const open = `<${tag}`, A = `${a}="`, B = `${b}="`, n = s.length;
  const laatsteQ = s.lastIndexOf('"');
  type Groep = { p: number[]; q1: number[]; r: number[]; jSter: number; pmax?: number };
  const groepen = new Map<number, Groep>();
  const gtVan = new Map<number, number>();
  const gtNa = (x: number): number => { let g = gtVan.get(x); if (g === undefined) { const k = s.indexOf('>', x); g = k < 0 ? n : k; gtVan.set(x, g); } return g; };
  const geldigVoor = (k: number) => k === 0 || !isWoordteken(s.charCodeAt(k - 1)); // \b vóór een woordteken
  const groep = (g: number): Groep => {
    const oud = groepen.get(g); if (oud) return oud;
    const begin = g === 0 ? 0 : s.lastIndexOf('>', g - 1) + 1;
    const stuk = s.slice(begin, g);
    const p: number[] = [], q1: number[] = [], r: number[] = [];
    for (let k = stuk.indexOf(A); k >= 0; k = stuk.indexOf(A, k + 1)) if (geldigVoor(begin + k)) { p.push(begin + k); const q = s.indexOf('"', begin + k + A.length); q1.push(q); }
    for (let k = stuk.indexOf(B); k >= 0; k = stuk.indexOf(B, k + 1)) if (geldigVoor(begin + k) && begin + k + B.length <= laatsteQ) r.push(begin + k);
    const rMax = r.length ? r[r.length - 1] : -1;
    let jSter = -1;
    for (let j = p.length - 2; j >= 0; j--) if (q1[j] >= 0 && q1[j] < rMax) { jSter = j; break; }
    const nieuw: Groep = { p, q1, r, jSter };
    groepen.set(g, nieuw);
    return nieuw;
  };
  /** De «b="» voor de laatste «a="» van groep g (of -1). */
  const voorLaatste = (gr: Groep, g: number): number => {
    if (gr.pmax !== undefined) return gr.pmax;
    const q = gr.q1[gr.q1.length - 1];
    let rr = -1;
    if (q >= 0 && q < g) { const m = gr.r.length ? gr.r[gr.r.length - 1] : -1; rr = m > q ? m : -1; }
    else if (q >= g) { const g2 = gtNa(q + 1); const gr2 = groep(g2); const m = gr2.r.length ? gr2.r[gr2.r.length - 1] : -1; rr = m >= q + 1 ? m : -1; }
    gr.pmax = rr;
    return rr;
  };
  const eersteVanaf = (lijst: number[], x: number) => { let lo = 0, hi = lijst.length; while (lo < hi) { const m = (lo + hi) >> 1; if (lijst[m] < x) lo = m + 1; else hi = m; } return lo; };
  for (let i = s.indexOf(open); i >= 0;) {
    const a0 = i + open.length;
    let pi = -1, rr = -1;
    if (!(a0 < n && isWoordteken(s.charCodeAt(a0)))) { // \b na de tagnaam
      const g = gtNa(a0);
      const gr = groep(g);
      const k = eersteVanaf(gr.p, a0);
      if (k < gr.p.length) {
        const r1 = voorLaatste(gr, g);
        if (r1 >= 0) { pi = gr.p.length - 1; rr = r1; }
        else if (gr.jSter >= k) { pi = gr.jSter; rr = gr.r[gr.r.length - 1]; }
      }
      if (pi >= 0) {
        const q2 = s.indexOf('"', rr + B.length);
        yield [s.slice(gr.p[pi] + A.length, gr.q1[pi]), s.slice(rr + B.length, q2)];
        i = s.indexOf(open, q2 + 1);
        continue;
      }
    }
    i = s.indexOf(open, i + 1);
  }
}
/** xlsx → tekst per werkblad (gedeelde tekenreeksen, werkbladnamen via workbook.xml + relaties, anders sheetN.xml). */
export function xlsxUitXml(xml: (pad: string) => string, paden: readonly string[], max: number): { tekst: string; paginas: Pagina[] } {
  const bestaat = new Set(paden);
  const sst: string[] = [];
  for (const si of xlsxSi(xml('xl/sharedStrings.xml'))) sst.push(xmlNaarTekst(si, 10_000).replace(/\n/g, ' '));
  const namen = [...xlsxTagMetTweeAttributen(xml('xl/workbook.xml'), 'sheet', 'name', 'r:id')].map(([naam, rid]) => ({ naam, rid }));
  const relMap = new Map([...xlsxTagMetTweeAttributen(xml('xl/_rels/workbook.xml.rels'), 'Relationship', 'Id', 'Target')].map(([id, doel]) => [id, doel.replace(/^\/?(xl\/)?/, '')]));
  const bladen = paden.filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort();
  const paginas: Pagina[] = []; let i = 0;
  const lees = (pad: string, titel: string) => {
    const rijen: string[] = [];
    for (const [, rij] of xlsxBlokken(xml(pad), 'row')) {
      const cellen: string[] = [];
      for (const [attr, inhoud] of xlsxBlokken(rij, 'c')) {
        const t = xlsxT(attr) || '';
        const v = xlsxV(inhoud);
        if (t === 's' && v !== undefined) cellen.push(sst[Number(v)] ?? '');
        else if (t === 'inlineStr') cellen.push(xmlNaarTekst(inhoud, 10_000).replace(/\n/g, ' '));
        else if (v !== undefined) cellen.push(xmlNaarTekst(v, 1000));
      }
      if (cellen.some((x) => x.trim())) rijen.push(cellen.join('\t'));
      if (rijen.length >= 20_000) break;
    }
    paginas.push({ nr: ++i, tekst: schoon(`${titel}\n${rijen.join('\n')}`, max) });
  };
  if (namen.length) for (const n of namen) { const doel = relMap.get(n.rid); if (doel && bestaat.has(`xl/${doel}`)) lees(`xl/${doel}`, n.naam); }
  else for (const b of bladen) lees(b, b.replace(/^xl\/worksheets\//, '').replace(/\.xml$/, ''));
  return { tekst: schoon(paginas.map((p) => p.tekst).join('\n\n'), max), paginas };
}

/** Eigen minimale lezer (fflate + XML-strip), alleen tekst, zonder DTD-verwerking. Ook per werkblad voor xlsx. */
function officeEigen(bytes: Uint8Array, formaat: FormaatId, max: number, naam: string): { tekst: string; paginas?: Pagina[] } {
  const a = archiefUitpakken(bytes, naam || 'office.zip', { ...ARCHIEF_GRENZEN_STANDAARD, maxDiepte: 1, maxTotaalBytes: 64 * 1024 * 1024, maxBestanden: 3000 });
  const map = new Map<string, Uint8Array>();
  for (const f of a.bestanden) map.set(f.pad.split('/').slice(1).join('/'), f.bytes);
  const xml = (p: string) => { const b = map.get(p); return b ? new TextDecoder('utf-8', { fatal: false }).decode(b) : ''; };
  if (formaat === 'docx') return { tekst: xmlNaarTekst([xml('word/document.xml'), xml('word/footnotes.xml'), xml('word/endnotes.xml')].join('\n'), max) };
  if (formaat === 'pptx') {
    const dia = [...map.keys()].filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((x, y) => Number(x.match(/\d+/)![0]) - Number(y.match(/\d+/)![0]));
    const paginas = dia.map((p, i) => ({ nr: i + 1, tekst: xmlNaarTekst(xml(p), max) }));
    return { tekst: schoon(paginas.map((p) => p.tekst).join('\n\n'), max), paginas };
  }
  if (formaat === 'xlsx') return xlsxUitXml(xml, [...map.keys()], max);
  // ODF: alles staat in content.xml
  return { tekst: xmlNaarTekst(xml('content.xml'), max) };
}
async function officeTekst(bytes: Uint8Array, formaat: FormaatId, max: number, naam: string): Promise<{ tekst: string; paginas?: Pagina[]; via: 'officeparser' | 'eigen' }> {
  if (formaat === 'xlsx') { try { const e = officeEigen(bytes, formaat, max, naam); if (e.tekst) return { ...e, via: 'eigen' }; } catch { /* door naar officeparser */ } }
  try { const t = await officeViaParser(bytes, formaat, max); if (t) return { tekst: t, via: 'officeparser' }; } catch { /* door naar eigen lezer */ }
  const e = officeEigen(bytes, formaat, max, naam); return { ...e, via: 'eigen' };
}

// ---------- EML (RFC 822/2045) ----------
type Deel = { koppen: Map<string, string>; lichaam: Uint8Array };
const latin1 = new TextDecoder('latin1');
function kopParsen(ruw: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const regel of ruw.replace(/\r\n?/g, '\n').replace(/\n[ \t]+/g, ' ').split('\n')) { const i = regel.indexOf(':'); if (i > 0) { const k = regel.slice(0, i).trim().toLowerCase(); if (!m.has(k)) m.set(k, regel.slice(i + 1).trim()); } }
  return m;
}
function deelSplitsen(b: Uint8Array): Deel {
  const s = latin1.decode(b.subarray(0, Math.min(b.length, 256 * 1024)));
  let i = s.indexOf('\r\n\r\n'), l = 4; if (i < 0) { i = s.indexOf('\n\n'); l = 2; }
  if (i < 0) return { koppen: kopParsen(s), lichaam: new Uint8Array(0) };
  const kopBytes = latin1.decode(b.subarray(0, i)); // latin1: byte-voor-byte, dus index klopt
  return { koppen: kopParsen(kopBytes), lichaam: b.subarray(i + l) };
}
const param = (v: string, naam: string) => { const m = new RegExp(`[;\\s]${naam}\\*?=(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(v); return m ? (m[1] ?? m[2]) : ''; };
function rfc2047(v: string): string {
  return v.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, cs, enc, data) => {
    try {
      const bytes = String(enc).toUpperCase() === 'B' ? Buffer.from(data, 'base64') : Buffer.from(String(data).replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m: string, h: string) => String.fromCharCode(parseInt(h, 16))), 'latin1');
      return new TextDecoder(String(cs).toLowerCase() === 'utf8' ? 'utf-8' : cs, { fatal: false }).decode(bytes);
    } catch { return data; }
  }).replace(/\?=\s+=\?/g, '?==?');
}
function transferDecoderen(b: Uint8Array, cte: string): Uint8Array {
  const e = cte.toLowerCase().trim();
  if (e === 'base64') return new Uint8Array(Buffer.from(latin1.decode(b).replace(/[^A-Za-z0-9+/=]/g, ''), 'base64'));
  if (e === 'quoted-printable') return new Uint8Array(Buffer.from(latin1.decode(b).replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1'));
  return b;
}
function tekstMetCharset(b: Uint8Array, ct: string): string {
  const cs = (param(ct, 'charset') || 'utf-8').replace(/^utf8$/i, 'utf-8');
  try { return new TextDecoder(cs, { fatal: false }).decode(b); } catch { return new TextDecoder('utf-8', { fatal: false }).decode(b); }
}
function multipartDelen(lichaam: Uint8Array, grens: string): Uint8Array[] {
  const s = latin1.decode(lichaam); const delen: Uint8Array[] = []; const g = `--${grens}`;
  let i = s.indexOf(g); if (i < 0) return [];
  while (i >= 0 && delen.length < 200) {
    const na = i + g.length; if (s.startsWith('--', na)) break;
    let begin = s.indexOf('\n', na); if (begin < 0) break; begin += 1;
    const volgende = s.indexOf(`\n${g}`, begin); const einde = volgende < 0 ? s.length : volgende;
    delen.push(lichaam.subarray(begin, Math.max(begin, einde - (s[einde - 1] === '\r' ? 1 : 0))));
    i = volgende < 0 ? -1 : volgende + 1;
  }
  return delen;
}
async function emlTekst(bytes: Uint8Array, naam: string, o: KernOpties, max: number): Promise<{ tekst: string; onderdelen: KernOnderdeel[] }> {
  const top = deelSplitsen(bytes); const k = top.koppen;
  const kop = ['from', 'to', 'cc', 'subject', 'date'].map((n) => (k.get(n) ? `${n[0].toUpperCase()}${n.slice(1)}: ${rfc2047(k.get(n)!)}` : '')).filter(Boolean).join('\n');
  const teksten: string[] = []; let html = ''; const onderdelen: KernOnderdeel[] = []; let bijlageNr = 0;
  const loop = async (d: Deel, diepte: number) => {
    if (diepte > 8) return;
    const ct = d.koppen.get('content-type') || 'text/plain'; const type = ct.split(';')[0].trim().toLowerCase();
    const disp = d.koppen.get('content-disposition') || '';
    const bestandsnaam = rfc2047(param(disp, 'filename') || param(ct, 'name'));
    if (type.startsWith('multipart/')) { const grens = param(ct, 'boundary'); if (grens) for (const p of multipartDelen(d.lichaam, grens)) await loop(deelSplitsen(p), diepte + 1); return; }
    const data = transferDecoderen(d.lichaam, d.koppen.get('content-transfer-encoding') || '');
    const isBijlage = /^attachment/i.test(disp) || (!!bestandsnaam && !type.startsWith('text/'));
    if (!isBijlage && type === 'text/plain') { teksten.push(tekstMetCharset(data, ct)); return; }
    if (!isBijlage && type === 'text/html') { if (!html) html = tekstMetCharset(data, ct); return; }
    if (type === 'message/rfc822') { const sub = await emlTekst(data, `${bestandsnaam || 'bericht'}.eml`, o, max); teksten.push(sub.tekst); onderdelen.push(...sub.onderdelen); return; }
    if (!data.length || onderdelen.length >= 50) return;
    bijlageNr += 1; const bn = bestandsnaam || `bijlage-${bijlageNr}`;
    const u = await tekstKern(data, type, bn, { ...o, diepte: (o.diepte ?? 0) + 1 });
    const pad = `${naam}/${bn.replace(/[\\/]/g, '_')}`;
    onderdelen.push({ pad, naam: bn, mime: type, sha256: u.sha256, bytes: data.length, status: u.status, herkomst: u.herkomst, tekst: u.tekst, formaat: u.formaat, paginas: u.paginas, ocrPlan: u.ocrPlan, fout: u.fout });
    if (u.onderdelen) for (const sub of u.onderdelen) onderdelen.push({ ...sub, pad: `${pad}/${sub.pad.split('/').slice(1).join('/') || sub.naam}` });
  };
  await loop(top, 0);
  const lichaam = teksten.filter((t) => t.trim()).join('\n') || (html ? htmlNaarTekst(html, max).tekst : '');
  return { tekst: schoon([kop, lichaam].filter(Boolean).join('\n\n'), max), onderdelen };
}

// ---------- hoofdingang ----------
export async function tekstKern(bytesIn: Uint8Array, mime: string, naam: string, o: KernOpties = {}): Promise<KernUitslag> {
  const bytes = bytesIn instanceof Uint8Array ? bytesIn : new Uint8Array(bytesIn as ArrayBufferLike);
  const max = o.maxTekst ?? MAX_TEKST_TEKENS, diepte = o.diepte ?? 0;
  const sha = sha256Hex(bytes); const formaat = formaatVan(mime, naam, bytes.subarray(0, 512));
  const basis = { sha256: sha, bytes: bytes.length, mime: String(mime || '').split(';')[0].trim().toLowerCase(), formaat };
  const uit = (status: TekstStatus, herkomst: TekstHerkomst, tekst: string, extra: Partial<KernUitslag> = {}): KernUitslag => ({ ...basis, status, herkomst, tekst, ...extra });
  if (!bytes.length) return uit('leeg', 'geen', '');
  if (o.testVertragingMs && diepte === 0) await new Promise((r) => setTimeout(r, o.testVertragingMs));
  if (diepte > MAX_DIEPTE) return uit('fout', 'geen', '', { fout: 'TE_DIEP' });
  try {
    switch (formaat) {
      case 'txt': case 'md': { const t = schoon(decodeerTekst(bytes, max * 4), max); return uit(t ? 'ok' : 'leeg', 'tekst', t); }
      case 'csv': { const t = csvTekst(bytes, max * 4, max); return uit(t ? 'ok' : 'leeg', 'csv', t); }
      case 'json': { const t = jsonTekst(bytes, max * 4, max); return uit(t ? 'ok' : 'leeg', 'tekst', t); }
      case 'html': { const { tekst, titel } = htmlNaarTekst(decodeerTekst(bytes, max * 8), max); const t = schoon([titel, tekst].filter(Boolean).join('\n'), max); return uit(t ? 'ok' : 'leeg', 'html', t); }
      case 'eml': { const r = await emlTekst(bytes, naam || 'bericht.eml', o, max); return uit(r.tekst || r.onderdelen.length ? 'ok' : 'leeg', 'eml', r.tekst, r.onderdelen.length ? { onderdelen: r.onderdelen } : {}); }
      case 'afbeelding': return uit('ocr_nodig', 'geen', '', { ocrPlan: { nodig: true, reden: 'afbeelding', paginas: [1], totaalPaginas: 1, sha256: sha } });
      case 'pdf': {
        const r = await pdfLezen(bytes, o);
        if (r.versleuteld) return uit('niet_ondersteund', 'geen', '', { fout: 'VERSLEUTELD' });
        const tekst = schoon(r.paginas.map((p) => p.tekst).join('\n'), max);
        const metTekst = r.paginas.filter((p) => tekensZonderSpatie(p.tekst) >= (o.minPdfTekstPerPagina ?? 8)).length;
        if (r.scanPaginas.length) {
          const plan: KernOcrPlan = { nodig: true, reden: metTekst ? 'pdf_deels_scan' : 'pdf_scan', paginas: r.scanPaginas.slice(0, o.maxOcrPaginas ?? 50), totaalPaginas: r.totaal, sha256: sha };
          return uit('ocr_nodig', metTekst ? 'pdf_tekstlaag' : 'geen', tekst, { paginas: r.paginas, ocrPlan: plan });
        }
        return uit(tekst ? 'ok' : 'leeg', 'pdf_tekstlaag', tekst, { paginas: r.paginas });
      }
      case 'docx': case 'xlsx': case 'pptx': case 'odt': case 'ods': case 'odp': {
        const r = await officeTekst(bytes, formaat, max, naam);
        const herkomst: TekstHerkomst = formaat === 'xlsx' || formaat === 'ods' ? 'xlsx' : formaat === 'pptx' || formaat === 'odp' ? 'pptx' : 'docx';
        return uit(r.tekst ? 'ok' : 'leeg', herkomst, r.tekst, r.paginas ? { paginas: r.paginas } : {});
      }
      case 'zip': case 'tar': case 'gzip': {
        const a = archiefUitpakken(bytes, naam || `archief.${formaat}`, { ...ARCHIEF_GRENZEN_STANDAARD, ...(o.archief || {}) });
        const onderdelen: KernOnderdeel[] = [];
        for (const f of a.bestanden) {
          const binnenNaam = f.pad.split('/').pop() || f.pad;
          const u = await tekstKern(f.bytes, '', binnenNaam, { ...o, diepte: diepte + 1 });
          onderdelen.push({ pad: f.pad, naam: binnenNaam, mime: u.mime || mimeUitFormaat(u.formaat), sha256: u.sha256, bytes: f.bytes.length, status: u.status, herkomst: u.herkomst, tekst: u.tekst, formaat: u.formaat, paginas: u.paginas, ocrPlan: u.ocrPlan, fout: u.fout });
          if (u.onderdelen) for (const sub of u.onderdelen) onderdelen.push({ ...sub, pad: `${f.pad}/${sub.pad.split('/').slice(1).join('/') || sub.naam}` });
        }
        const perDeel = o.onderdeelTekst ?? 2000;
        const lijst = schoon(onderdelen.map((d) => d.pad.split('/').slice(1).join('/') + (d.tekst ? `\n${d.tekst.slice(0, perDeel)}` : '')).join('\n'), max);
        const basisProbleem = a.problemen.find((p) => p.pad === (naam.split('/').pop() || 'archief') || !p.pad.includes('/'));
        const codes = new Set(a.problemen.map((p) => p.code));
        const heeft = (...c: string[]) => c.some((x) => codes.has(x as ArchiefProbleem['code']));
        let status: TekstStatus;
        if (a.afgebroken && basisProbleem && ['TE_GROOT_TOTAAL', 'ZIP_BOM', 'TE_GROOT_BESTAND', 'TE_VEEL_BESTANDEN'].includes(basisProbleem.code)) status = 'te_groot';
        else if (a.afgebroken && basisProbleem && ['METHODE_ONBEKEND', 'ZIP64', 'VERSLEUTELD'].includes(basisProbleem.code)) status = 'niet_ondersteund';
        else if (onderdelen.length) status = 'ok';
        else if (heeft('ZIP_BOM', 'TE_GROOT_BESTAND', 'TE_GROOT_TOTAAL', 'TE_VEEL_BESTANDEN')) status = 'te_groot';   // niets bruikbaars én een bom/grens: eerlijk «te groot»
        else if (heeft('METHODE_ONBEKEND', 'ZIP64', 'VERSLEUTELD')) status = 'niet_ondersteund';
        else if (heeft('BESCHADIGD')) status = 'fout';
        else status = 'leeg';
        const eersteProbleem = basisProbleem || a.problemen.find((p) => ['ZIP_BOM', 'TE_GROOT_BESTAND', 'TE_GROOT_TOTAAL', 'TE_VEEL_BESTANDEN', 'METHODE_ONBEKEND', 'ZIP64', 'VERSLEUTELD', 'BESCHADIGD'].includes(p.code));
        const fout = status !== 'ok' && status !== 'leeg' ? eersteProbleem?.code || a.problemen[0]?.code : undefined;
        return uit(status, 'archief', lijst, { onderdelen, problemen: a.problemen, ...(fout ? { fout } : {}) });
      }
      default: {
        const reden = nietOndersteundReden(naam);
        return uit('niet_ondersteund', 'geen', '', reden ? { fout: reden.nl } : {});
      }
    }
  } catch (e) {
    const code = e instanceof Error ? ((e as any).code || e.name || 'FOUT') : 'FOUT';
    return uit('fout', 'geen', '', { fout: String(code).slice(0, 120) });
  }
}

const mimeUitFormaat = (f: FormaatId) => ({ pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', html: 'text/html', eml: 'message/rfc822', csv: 'text/csv', json: 'application/json', md: 'text/markdown', txt: 'text/plain', zip: 'application/zip', tar: 'application/x-tar', gzip: 'application/gzip', afbeelding: 'image/*' } as Record<string, string>)[f] || '';

/** Bytes van één onderdeel (archief/e-mail) op pad — voor OCR van een bijlage in een archief. */
export async function onderdeelBytes(bytes: Uint8Array, mime: string, naam: string, pad: string, o: KernOpties = {}): Promise<{ bytes: Uint8Array; mime: string; naam: string } | null> {
  const formaat = formaatVan(mime, naam, bytes.subarray(0, 512));
  if (isArchiefFormaat(formaat)) {
    const a = archiefUitpakken(bytes, naam || `archief.${formaat}`, { ...ARCHIEF_GRENZEN_STANDAARD, ...(o.archief || {}) });
    const f = a.bestanden.find((x) => x.pad === pad) || a.bestanden.find((x) => pad.startsWith(`${x.pad}/`));
    if (!f) return null;
    const binnenNaam = f.pad.split('/').pop() || f.pad;
    if (f.pad === pad) return { bytes: f.bytes, mime: '', naam: binnenNaam };
    return onderdeelBytes(f.bytes, '', binnenNaam, `${binnenNaam}${pad.slice(f.pad.length)}`, { ...o, diepte: (o.diepte ?? 0) + 1 });
  }
  if (formaat === 'eml') {
    const r = await emlTekst(bytes, naam || 'bericht.eml', { ...o, maxTekst: 1 }, 1);
    const d = r.onderdelen.find((x) => x.pad === pad); if (!d) return null;
    // Opnieuw door de MIME-boom voor de bytes (emlTekst houdt ze niet vast): zoek op naam.
    const gevonden = await emlBijlageBytes(bytes, d.naam); return gevonden ? { bytes: gevonden.bytes, mime: gevonden.mime, naam: d.naam } : null;
  }
  if (isOfficeFormaat(formaat)) return null;
  return null;
}
async function emlBijlageBytes(bytes: Uint8Array, naam: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  let uit: { bytes: Uint8Array; mime: string } | null = null; let teller = 0;
  const loop = (d: Deel, diepte: number) => {
    if (uit || diepte > 8) return;
    const ct = d.koppen.get('content-type') || 'text/plain'; const type = ct.split(';')[0].trim().toLowerCase();
    if (type.startsWith('multipart/')) { const g = param(ct, 'boundary'); if (g) for (const p of multipartDelen(d.lichaam, g)) loop(deelSplitsen(p), diepte + 1); return; }
    const disp = d.koppen.get('content-disposition') || ''; const bn = rfc2047(param(disp, 'filename') || param(ct, 'name'));
    const isBijlage = /^attachment/i.test(disp) || (!!bn && !type.startsWith('text/'));
    if (!isBijlage || type === 'message/rfc822') return;
    teller += 1;
    if ((bn || `bijlage-${teller}`) === naam) uit = { bytes: transferDecoderen(d.lichaam, d.koppen.get('content-transfer-encoding') || ''), mime: type };
  };
  loop(deelSplitsen(bytes), 0);
  return uit;
}
