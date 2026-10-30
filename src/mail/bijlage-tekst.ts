// Tekst uit een bijlage voor «Порівняти версії» (pakket 3 «Adaptive Mail Canvas», 24.10.2026). Alleen lezen, niets uitvoeren:
//   • PDF: pdfjs-dist zoals src/MailPdfVoorbeeld.tsx (zelfde worker), getTextContent() per pagina (hoogstens 60), regels uit hasEOL en
//     de y-positie, alinea's uit witruimte, inspringing, korte slotregels en lettergrootte; kop- en voetteksten die op de meeste
//     pagina's terugkomen en losse paginanummers vallen weg (anders telt «Pagina 3 van 12 → 13» als wijziging op elke pagina);
//   • platte tekst (.txt/.md/.csv/.tsv, text/plain): hoogstens 2 MB, UTF-8 of UTF-16 (BOM), anders Windows-1251/1252;
//   • DOCX/DOCM/DOTX/ODT/RTF: de bestaande documentlader (src/mail-document-inhoud.ts → officeparser), elke alinea een blok;
//   • al het andere: soort 'onbekend' — het venster zegt dan eerlijk dat vergelijken niet kan.
// pdfjs-dist en de documentlader worden pas geladen als ze nodig zijn (eigen chunks, zoals de voorbeelden).
// Getoetst in tests/eenheid/versie-vergelijk-20261024.test.ts.
import { mailDocumentCapability } from '../mail-document-mogelijkheden';
import { regelsSamenvoegen } from './tekst-verschil';

export type BijlageTekstSoort = 'pdf' | 'tekst' | 'docx' | 'onbekend';
export type BijlageTekst = { tekst: string; soort: BijlageTekstSoort; paginas?: number; afgekapt: boolean };

export const PDF_MAX_PAGINAS = 60;
export const TEKST_MAX_BYTES = 2 * 1024 * 1024;
// Zelfde uitdrukking als src/MailPdfVoorbeeld.tsx: Vite zet de worker als eigen bestand in de build.
const PDF_WERKER = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const extensie = (naam: string) => /\.([a-z0-9]{1,8})$/i.exec(String(naam || '').trim())?.[1]?.toLowerCase() || '';
// Extensies van andere (binaire) formaten: daar geldt een afwijkend MIME-type niet (een .xlsx als «text/plain» lezen geeft onzin).
const ANDER_FORMAAT = /^(?:doc|dot|xlsx?|xlsm|xlsb|pptx?|ppsx?|od[spg]|key|numbers|pages|zip|rar|7z|gz|tgz|tar|jpe?g|png|gif|webp|heic|heif|tiff?|bmp|svg|mp[34]|m4a|mov|avi|wav|eml|msg|html?|xml|json|ics|vcf|exe|dll|iso|dmg|apk)$/;
/** Welke lezer past bij dit bestand (op extensie, anders op het MIME-type) — zonder het te downloaden. */
export function bijlageSoort(contentType: string, filename: string): BijlageTekstSoort {
  const ext = extensie(filename), type = String(contentType || '').toLowerCase().split(';')[0].trim();
  if (ext === 'pdf') return 'pdf';
  if (['txt', 'text', 'md', 'markdown', 'csv', 'tsv'].includes(ext)) return 'tekst';
  if (['docx', 'docm', 'dotx', 'dotm', 'odt', 'ott', 'rtf'].includes(ext)) return 'docx';
  if (ANDER_FORMAAT.test(ext)) return 'onbekend';
  if (type === 'application/pdf') return 'pdf';
  if (/^text\/(plain|markdown|x-markdown|csv|tab-separated-values)$/.test(type)) return 'tekst';
  if (type.includes('wordprocessingml') || type.includes('opendocument.text') || /^(application|text)\/rtf$/.test(type)) return 'docx';
  return 'onbekend';
}

/** Tekst van een bijlage om te vergelijken. Gooit bij een kapot of beveiligd bestand (PDF_WACHTWOORD, PDF_ONGELDIG, …). */
export async function bijlageTekst(blob: Blob, contentType: string, filename: string): Promise<BijlageTekst> {
  const soort = bijlageSoort(contentType, filename);
  if (soort === 'pdf') return pdfTekst(blob);
  if (soort === 'tekst') return platteTekst(blob, filename, contentType);
  if (soort === 'docx') return documentTekst(blob, contentType, filename);
  return { tekst: '', soort: 'onbekend', afgekapt: false };
}

// ------------------------------------------------------------------ platte tekst
/** Einde van de laatste volledige UTF-8-reeks (een afgeknipt bestand eindigt soms midden in een teken). */
function utf8Einde(b: Uint8Array): number {
  let i = b.length - 1, terug = 0;
  while (i >= 0 && terug < 3 && (b[i] & 0xc0) === 0x80) { i--; terug++; }
  if (i < 0) return b.length;
  const lengte = b[i] >= 0xf0 ? 4 : b[i] >= 0xe0 ? 3 : b[i] >= 0xc0 ? 2 : 1;
  return i + lengte <= b.length ? b.length : i;
}
/** UTF-16 met BOM, UTF-8 (streng), anders Windows-1251 (veel bytes ≥ 0x80 tegenover Latijnse letters: Cyrillisch) of -1252. */
export function decodeerTekst(bytes: Uint8Array, afgeknipt = false): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(afgeknipt ? bytes.subarray(0, utf8Einde(bytes)) : bytes); } catch { /* geen UTF-8 */ }
  let hoog = 0, latijn = 0;
  for (const b of bytes) { if (b >= 0x80) hoog++; else if ((b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a)) latijn++; }
  return new TextDecoder(hoog > latijn * 0.5 ? 'windows-1251' : 'windows-1252').decode(bytes);
}
async function platteTekst(blob: Blob, filename: string, contentType: string): Promise<BijlageTekst> {
  const afgekapt = blob.size > TEKST_MAX_BYTES;
  const bytes = new Uint8Array(await (afgekapt ? blob.slice(0, TEKST_MAX_BYTES) : blob).arrayBuffer());
  let tekst = decodeerTekst(bytes, afgekapt);
  // tabelregels (CSV/TSV): elke regel is een rij, geen doorlopende zin
  const ext = extensie(filename);
  if (ext === 'csv' || ext === 'tsv' || /^text\/(csv|tab-separated-values)/i.test(contentType)) tekst = tekst.replace(/\r\n?/g, '\n').replace(/\n/g, '\n\n');
  return { tekst, soort: 'tekst', afgekapt };
}

// ------------------------------------------------------------------ DOCX / ODT / RTF
async function documentTekst(blob: Blob, contentType: string, filename: string): Promise<BijlageTekst> {
  const mogelijkheid = mailDocumentCapability(filename, contentType);
  if (!mogelijkheid || mogelijkheid.edit !== 'rich' || !mogelijkheid.parserType) return { tekst: '', soort: 'onbekend', afgekapt: false };
  const { loadMailDocumentContent } = await import('../mail-document-inhoud');
  const inhoud = await loadMailDocumentContent(blob, mogelijkheid);
  // officeparser zet elke alinea (ook een lijstpunt of tabelcel) op een eigen regel
  const tekst = String(inhoud.text || '').replace(/\r\n?/g, '\n').split('\n').map((r) => r.trim()).filter(Boolean).join('\n\n');
  return { tekst, soort: 'docx', afgekapt: false };
}

// ------------------------------------------------------------------ PDF
export type PdfTekstItem = { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean };
/** Eén pagina: tekstitems in de volgorde van getTextContent(), de hoogte en onderkant van de pagina (page.view). */
export type PdfPagina = { items: PdfTekstItem[]; hoogte: number; onder?: number };
type Regel = { tekst: string; x: number; y: number; h: number; eindX: number };

const isTekstItem = (x: unknown): x is PdfTekstItem => Boolean(x) && typeof (x as { str?: unknown }).str === 'string' && Array.isArray((x as { transform?: unknown }).transform);
const getal = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Regels van een pagina: een nieuwe regel bij hasEOL of als de y-positie meer dan ~een halve letterhoogte verspringt. */
function paginaRegels(items: PdfTekstItem[]): Regel[] {
  const regels: Regel[] = [];
  let r: Regel | null = null;
  const sluit = (x: Regel | null) => { if (x) { const tekst = x.tekst.replace(/\s+/g, ' ').trim(); if (tekst) regels.push({ ...x, tekst }); } };
  for (const it of items) {
    const t = it.transform, x = getal(t[4]), y = getal(t[5]);
    const h = Math.abs(getal(it.height)) || Math.hypot(getal(t[2]), getal(t[3])) || 10;
    if (!it.str) { if (it.hasEOL) { sluit(r); r = null; } continue; }
    if (r && Math.abs(y - r.y) > Math.max(r.h, h) * 0.6) { sluit(r); r = null; }
    if (!r) r = { tekst: '', x, y, h, eindX: x };
    else if (x - r.eindX > h * 0.2 && !/\s$/.test(r.tekst) && !/^\s/.test(it.str)) r.tekst += ' ';
    r.tekst += it.str;
    r.eindX = Math.max(r.eindX, x + getal(it.width));
    r.h = Math.max(r.h, h);
    if (it.hasEOL) { sluit(r); r = null; }
  }
  sluit(r);
  return regels;
}

// Rand voor kop- en voetregels: Word zet ze op ~4–6 % van de paginahoogte, de eerste/laatste regel van de tekst op ~9–10 %.
const RAND = 0.08;
const PAGINANUMMER = /^[\s\-–—([]*(?:(?:pagina|page|blz\.?|p\.|сторінка|стор\.?|с\.)\s*)?\d{1,4}(?:\s*(?:\/|van|of|з|із|from|de)\s*\d{1,4})?[\s\-–—)\].]*$/iu;
const kopVoetSleutel = (s: string) => s.toLocaleLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
const ZIN_EINDE = /[.!?:;…]["'»”’)\]]*$/u;
const LIJSTPUNT = /^(?:[•●▪◦‣■□–-]\s|\(?\d{1,3}(?:\.\d{1,3})*[.)]\s|\d{1,3}(?:\.\d{1,3})+\s|\(?\p{L}\)\s)/u;
const kwantiel = (l: number[], q: number) => { if (!l.length) return 0; const s = [...l].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };

type Maten = { mh: number; gewoon: number; breedte: number };
/** Maten van het hele document (een pagina met drie regels zegt te weinig): lettergrootte (mediaan), gewone regelafstand (kleinste
 *  kwart van de sprongen) en de breedte van een volle regel (90 % van de regels is smaller of even breed), gemeten vanaf de linkermarge
 *  van de eigen pagina (even en oneven pagina's kunnen verschillen). */
function documentMaten(paginas: Regel[][]): Maten {
  const alle = paginas.flat();
  const mh = kwantiel(alle.map((r) => r.h), 0.5) || 10;
  const sprongen: number[] = [], breedtes: number[] = [];
  for (const regels of paginas) {
    const links = kwantiel(regels.map((r) => r.x), 0.1);
    regels.forEach((r, i) => {
      breedtes.push(r.eindX - links);
      const dy = i ? regels[i - 1].y - r.y : 0;
      if (dy > 0 && dy < mh * 3) sprongen.push(dy);
    });
  }
  return { mh, gewoon: kwantiel(sprongen, 0.25) || mh * 1.2, breedte: Math.max(1, kwantiel(breedtes, 0.9)) };
}
/** Alinea's van één pagina (regels in leesvolgorde). Een nieuwe alinea bij: extra witruimte, een sprong omhoog (kolom), een andere
 *  lettergrootte, een ingesprongen eerste regel, een korte vorige regel (slot van een alinea, kop) of een lijstpunt na een zinseinde.
 *  Allemaal eigenschappen van de alinea zelf, niet van waar de regels toevallig afbreken (dat verschilt tussen versies). */
function paginaAlineas(regels: Regel[], { mh, gewoon, breedte }: Maten): string[][] {
  if (!regels.length) return [];
  const links = kwantiel(regels.map((r) => r.x), 0.1);
  const uit: string[][] = [[regels[0].tekst]];
  for (let i = 1; i < regels.length; i++) {
    const v = regels[i - 1], r = regels[i], dy = v.y - r.y;
    const nieuw = dy <= 0 || dy > gewoon * 1.45 + 0.5
      || Math.abs(r.h - v.h) > Math.max(r.h, v.h) * 0.18
      || (r.x - links > mh * 1.2 && v.x - links < mh * 0.5)
      || (v.eindX - links < breedte * 0.72 && (ZIN_EINDE.test(v.tekst) || /^[\p{Lu}\p{N}•●▪◦‣■□"«„“]/u.test(r.tekst)) && !/[-,]$/.test(v.tekst))
      || (LIJSTPUNT.test(r.tekst) && ZIN_EINDE.test(v.tekst));
    if (nieuw) uit.push([r.tekst]); else uit[uit.length - 1].push(r.tekst);
  }
  return uit;
}

/** Tekst van de pagina's (zuiver, getoetst): kop-/voetregels (bovenste en onderste twee binnen 8 % van de rand) die op de helft
 *  van de pagina's terugkomen (cijfers tellen als gelijk) en losse paginanummers weg; alinea's gescheiden door een lege regel; een
 *  alinea die doorloopt naar de volgende pagina (geen zinseinde, volgende begint met een kleine letter) blijft één alinea. */
export function pdfPaginasTekst(paginas: PdfPagina[]): string {
  const perPagina = paginas.map((p) => paginaRegels((p.items || []).filter(isTekstItem)));
  const rand = perPagina.map((regels, i) => {
    const h = paginas[i].hoogte > 0 ? paginas[i].hoogte : 0, onder = getal(paginas[i].onder);
    if (!h || !regels.length) return new Set<number>();
    const opY = regels.map((r, k) => ({ k, rel: (r.y - onder) / h })).sort((a, b) => b.rel - a.rel);
    const set = new Set<number>();
    for (const x of opY.slice(0, 2)) if (x.rel > 1 - RAND) set.add(x.k);
    for (const x of opY.slice(-2)) if (x.rel < RAND) set.add(x.k);
    return set;
  });
  const telling = new Map<string, Set<number>>();
  rand.forEach((set, i) => { for (const k of set) { const s = kopVoetSleutel(perPagina[i][k].tekst), l = telling.get(s); if (l) l.add(i); else telling.set(s, new Set([i])); } });
  const nodig = Math.max(2, Math.ceil(paginas.length * 0.5));
  const blijven = perPagina.map((regels, i) => regels.filter((r, k) => !rand[i].has(k) || !(PAGINANUMMER.test(r.tekst) || (paginas.length >= 2 && (telling.get(kopVoetSleutel(r.tekst))?.size || 0) >= nodig))));
  const maten = documentMaten(blijven);
  const alineas: string[][] = [];
  blijven.forEach((blijft) => {
    const deze = paginaAlineas(blijft, maten);
    if (!deze.length) return;
    const vorige = alineas[alineas.length - 1], laatste = vorige?.[vorige.length - 1] || '';
    if (vorige && laatste && !ZIN_EINDE.test(laatste) && /^\p{Ll}/u.test(deze[0][0])) { vorige.push(...deze[0]); deze.shift(); }
    alineas.push(...deze);
  });
  return alineas.map((a) => regelsSamenvoegen(a)).filter(Boolean).join('\n\n');
}

async function pdfTekst(blob: Blob): Promise<BijlageTekst> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = PDF_WERKER;
  const taak = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, verbosity: 0 });
  try {
    const pdf = await taak.promise.catch((fout: unknown) => {
      const naam = (fout as { name?: string } | null)?.name || '';
      throw new Error(naam === 'PasswordException' ? 'PDF_WACHTWOORD' : naam === 'InvalidPDFException' ? 'PDF_ONGELDIG' : 'PDF_ONLEESBAAR');
    });
    const totaal = pdf.numPages, n = Math.min(totaal, PDF_MAX_PAGINAS), paginas: PdfPagina[] = [];
    for (let i = 1; i <= n; i++) {
      const pagina = await pdf.getPage(i);
      try {
        const inhoud = await pagina.getTextContent();
        const [, y0, , y1] = pagina.view;
        paginas.push({ items: inhoud.items.flatMap((x) => (isTekstItem(x) ? [x] : [])), hoogte: getal(y1) - getal(y0), onder: getal(y0) });
      } finally { pagina.cleanup(); }
    }
    return { tekst: pdfPaginasTekst(paginas), soort: 'pdf', paginas: totaal, afgekapt: totaal > n };
  } finally { void taak.destroy().catch(() => undefined); }
}
