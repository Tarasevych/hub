// ZOEKEN — GEDECLAREERDE BESTANDSFORMATEN VOOR TEKSTEXTRACTIE (gedeeld: server én UI).
//
// Dit is de ene, eerlijke lijst van wat de zoekindex uit een bestand kan halen, met welke methode en tot welke grens.
// De server (backend/zoek/tekst-extractie.ts) volgt precies deze lijst; de UI kan ze tonen («ondersteunde formaten»)
// en een bronstatus uitleggen. Wat hier niet staat, is NIET ondersteund en krijgt status 'niet_ondersteund' — nooit een
// stille leegte. Teksten alleen uk + nl.
//
// Herkenning: eerst de bytes (magic), dan de extensie, dan pas het opgegeven MIME-type (dat liegt het vaakst).

export type FormaatId =
  | 'txt' | 'md' | 'csv' | 'json' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'odt' | 'ods' | 'odp' | 'html' | 'eml'
  | 'afbeelding' | 'zip' | 'tar' | 'gzip' | 'onbekend';
export type FormaatMethode = 'tekst' | 'pdfjs' | 'office' | 'html' | 'eml' | 'ocr' | 'archief' | 'geen';
export type Tweetalig = { uk: string; nl: string };
export type FormaatInfo = {
  id: FormaatId;
  naam: Tweetalig;
  extensies: string[];
  mimes: string[];
  methode: FormaatMethode;
  ocr: boolean;             // kan (deels) OCR nodig hebben
  maxBytes: number;         // standaardgrens; ENV kan hem verlagen/verhogen (zie tekst-extractie.ts)
  opmerking?: Tweetalig;
};

const MiB = 1024 * 1024;
export const STANDAARD_MAX_BYTES = 25 * MiB;
export const STANDAARD_OCR_MAX_BYTES = 20 * MiB;
export const MAX_TEKST_TEKENS = 200_000;

/** Standaardgrenzen voor archieven (zip/tar/gz); ENV ZOEK_ARCHIEF_MAX_* kan ze aanpassen. */
export const ARCHIEF_GRENZEN_STANDAARD = {
  maxTotaalBytes: 200 * MiB, maxBestandBytes: 50 * MiB, maxBestanden: 2000, maxDiepte: 3, maxVerhouding: 200,
};

export const FORMATEN: FormaatInfo[] = [
  { id: 'txt', naam: { uk: 'Текст', nl: 'Tekst' }, extensies: ['txt', 'log', 'text', 'ini', 'cfg', 'conf', 'yaml', 'yml', 'xml', 'ics', 'vcf', 'ts', 'js', 'py', 'sh', 'sql', 'rst', 'tex'], mimes: ['text/plain', 'text/x-log', 'application/xml', 'text/xml', 'application/x-yaml', 'text/yaml', 'text/calendar', 'text/vcard', 'application/javascript', 'text/javascript', 'text/x-python', 'application/x-sh'], methode: 'tekst', ocr: false, maxBytes: STANDAARD_MAX_BYTES },
  { id: 'md', naam: { uk: 'Markdown', nl: 'Markdown' }, extensies: ['md', 'markdown'], mimes: ['text/markdown'], methode: 'tekst', ocr: false, maxBytes: STANDAARD_MAX_BYTES },
  { id: 'csv', naam: { uk: 'CSV / TSV', nl: 'CSV / TSV' }, extensies: ['csv', 'tsv'], mimes: ['text/csv', 'text/tab-separated-values', 'application/csv'], methode: 'tekst', ocr: false, maxBytes: STANDAARD_MAX_BYTES, opmerking: { uk: 'Перші 20 000 рядків', nl: 'Eerste 20 000 regels' } },
  { id: 'json', naam: { uk: 'JSON', nl: 'JSON' }, extensies: ['json', 'jsonl', 'ndjson'], mimes: ['application/json', 'application/x-ndjson', 'application/ld+json'], methode: 'tekst', ocr: false, maxBytes: STANDAARD_MAX_BYTES, opmerking: { uk: 'Лише рядкові значення й ключі', nl: 'Alleen tekstwaarden en sleutels' } },
  { id: 'pdf', naam: { uk: 'PDF', nl: 'PDF' }, extensies: ['pdf'], mimes: ['application/pdf', 'application/x-pdf'], methode: 'pdfjs', ocr: true, maxBytes: STANDAARD_MAX_BYTES, opmerking: { uk: 'Текстовий шар; скановані сторінки — через OCR', nl: 'Tekstlaag; gescande pagina’s via OCR' } },
  { id: 'docx', naam: { uk: 'Word (DOCX)', nl: 'Word (DOCX)' }, extensies: ['docx', 'docm', 'dotx'], mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], methode: 'office', ocr: false, maxBytes: STANDAARD_MAX_BYTES },
  { id: 'xlsx', naam: { uk: 'Excel (XLSX)', nl: 'Excel (XLSX)' }, extensies: ['xlsx', 'xlsm', 'xltx'], mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], methode: 'office', ocr: false, maxBytes: STANDAARD_MAX_BYTES, opmerking: { uk: 'Текст клітинок усіх аркушів', nl: 'Celtekst van alle werkbladen' } },
  { id: 'pptx', naam: { uk: 'PowerPoint (PPTX)', nl: 'PowerPoint (PPTX)' }, extensies: ['pptx', 'ppsx', 'potx'], mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], methode: 'office', ocr: false, maxBytes: STANDAARD_MAX_BYTES },
  { id: 'odt', naam: { uk: 'OpenDocument текст', nl: 'OpenDocument-tekst' }, extensies: ['odt'], mimes: ['application/vnd.oasis.opendocument.text'], methode: 'office', ocr: false, maxBytes: STANDAARD_MAX_BYTES },
  { id: 'ods', naam: { uk: 'OpenDocument таблиця', nl: 'OpenDocument-werkblad' }, extensies: ['ods'], mimes: ['application/vnd.oasis.opendocument.spreadsheet'], methode: 'office', ocr: false, maxBytes: STANDAARD_MAX_BYTES },
  { id: 'odp', naam: { uk: 'OpenDocument презентація', nl: 'OpenDocument-presentatie' }, extensies: ['odp'], mimes: ['application/vnd.oasis.opendocument.presentation'], methode: 'office', ocr: false, maxBytes: STANDAARD_MAX_BYTES },
  { id: 'html', naam: { uk: 'HTML', nl: 'HTML' }, extensies: ['html', 'htm', 'xhtml'], mimes: ['text/html', 'application/xhtml+xml'], methode: 'html', ocr: false, maxBytes: STANDAARD_MAX_BYTES, opmerking: { uk: 'Без тегів, скриптів і стилів', nl: 'Zonder tags, scripts en stijlen' } },
  { id: 'eml', naam: { uk: 'Лист (EML)', nl: 'E-mail (EML)' }, extensies: ['eml', 'mht', 'mhtml'], mimes: ['message/rfc822', 'multipart/related'], methode: 'eml', ocr: false, maxBytes: STANDAARD_MAX_BYTES, opmerking: { uk: 'Заголовки, тіло і вкладення', nl: 'Koppen, tekst en bijlagen' } },
  { id: 'afbeelding', naam: { uk: 'Зображення', nl: 'Afbeelding' }, extensies: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'], mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'], methode: 'ocr', ocr: true, maxBytes: STANDAARD_OCR_MAX_BYTES, opmerking: { uk: 'Лише через OCR', nl: 'Alleen via OCR' } },
  { id: 'zip', naam: { uk: 'ZIP-архів', nl: 'ZIP-archief' }, extensies: ['zip'], mimes: ['application/zip', 'application/x-zip-compressed'], methode: 'archief', ocr: true, maxBytes: STANDAARD_MAX_BYTES, opmerking: { uk: 'Без zip64 і паролів; вкладені архіви до 3 рівнів', nl: 'Geen zip64 of wachtwoord; genest tot 3 niveaus' } },
  { id: 'tar', naam: { uk: 'TAR-архів', nl: 'TAR-archief' }, extensies: ['tar'], mimes: ['application/x-tar'], methode: 'archief', ocr: true, maxBytes: STANDAARD_MAX_BYTES },
  { id: 'gzip', naam: { uk: 'GZIP / TAR.GZ', nl: 'GZIP / TAR.GZ' }, extensies: ['gz', 'tgz'], mimes: ['application/gzip', 'application/x-gzip'], methode: 'archief', ocr: true, maxBytes: STANDAARD_MAX_BYTES },
];

/** Niet ondersteund, maar wel met naam, zodat de UI eerlijk kan zeggen waarom (geen veilige, vrije bibliotheek zonder systeemdelen). */
export const NIET_ONDERSTEUND: Array<{ extensies: string[]; reden: Tweetalig }> = [
  { extensies: ['rar', '7z', 'cab', 'arj', 'xz', 'bz2', 'zst'], reden: { uk: 'Формат архіву не підтримується (лише zip/tar/gz)', nl: 'Archiefformaat niet ondersteund (alleen zip/tar/gz)' } },
  { extensies: ['doc', 'xls', 'ppt', 'rtf'], reden: { uk: 'Старий бінарний формат Office не підтримується', nl: 'Oud binair Office-formaat niet ondersteund' } },
  { extensies: ['exe', 'dll', 'msi', 'apk', 'jar', 'bin', 'iso', 'dmg'], reden: { uk: 'Виконувані файли ніколи не читаються', nl: 'Uitvoerbare bestanden worden nooit gelezen' } },
  { extensies: ['mp3', 'mp4', 'mov', 'avi', 'wav', 'ogg', 'mkv'], reden: { uk: 'Аудіо/відео не індексуються', nl: 'Audio/video wordt niet geïndexeerd' } },
];

const extensieVan = (naam?: string) => ((String(naam || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || '');
const mimeVan = (mime?: string) => String(mime || '').toLowerCase().split(';')[0].trim();

/** Formaat op grond van de eerste bytes (betrouwbaarst). '' = geen uitsluitsel. */
export function formaatUitBytes(kop?: Uint8Array): FormaatId | '' {
  if (!kop || kop.length < 4) return '';
  const b = kop;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';                 // %PDF
  if (b[0] === 0x1f && b[1] === 0x8b) return 'gzip';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'afbeelding';          // PNG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'afbeelding';                            // JPEG
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'afbeelding';          // GIF8
  if (b[0] === 0x42 && b[1] === 0x4d) return 'afbeelding';                                             // BMP
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a)) return 'afbeelding'; // TIFF
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'afbeelding'; // WEBP
  if (b.length >= 262 && b[257] === 0x75 && b[258] === 0x73 && b[259] === 0x74 && b[260] === 0x61 && b[261] === 0x72) return 'tar'; // ustar
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7)) return 'zip';        // zip (ook Office/ODF: verfijnd op naam/mime)
  return '';
}

/**
 * Bepaalt het formaat: bytes > extensie > MIME. Een zip-signatuur met een Office/ODF-extensie of -MIME wordt docx/xlsx/…;
 * een onbekende zip blijft 'zip'. Office-extensie zonder zip-signatuur (bv. oud .doc) → 'onbekend'.
 */
export function formaatVan(mime?: string, naam?: string, kop?: Uint8Array): FormaatId {
  const ext = extensieVan(naam), m = mimeVan(mime);
  const opExt = FORMATEN.find((f) => f.extensies.includes(ext))?.id;
  const opMime = FORMATEN.find((f) => f.mimes.includes(m))?.id;
  const opBytes = formaatUitBytes(kop);
  const office = new Set<FormaatId>(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp']);
  if (opBytes === 'zip') {
    if (opExt && office.has(opExt)) return opExt;
    if (opMime && office.has(opMime)) return opMime;
    return 'zip';
  }
  if (opBytes) {
    if (opBytes === 'afbeelding' || opBytes === 'pdf' || opBytes === 'gzip' || opBytes === 'tar') return opBytes;
  }
  if (opExt) { if (office.has(opExt) && kop && kop.length >= 4) return 'onbekend'; return opExt; }
  if (opMime) { if (office.has(opMime) && kop && kop.length >= 4) return 'onbekend'; return opMime; }
  if (ext && NIET_ONDERSTEUND.some((n) => n.extensies.includes(ext))) return 'onbekend';   // rar/7z/exe/mp4: nooit als tekst gokken
  if (kop && kop.length) {
    // Geen signatuur en geen extensie: ziet het eruit als tekst? (UTF-8/ASCII zonder nulbytes in de eerste 4 KiB)
    const n = Math.min(kop.length, 4096); let raar = 0;
    for (let i = 0; i < n; i++) { const c = kop[i]; if (c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12)) raar++; }
    if (raar === 0) return 'txt';
  }
  return 'onbekend';
}

export const formaatInfo = (id: FormaatId): FormaatInfo | undefined => FORMATEN.find((f) => f.id === id);
export const isArchiefFormaat = (id: FormaatId) => id === 'zip' || id === 'tar' || id === 'gzip';
export const isOfficeFormaat = (id: FormaatId) => id === 'docx' || id === 'xlsx' || id === 'pptx' || id === 'odt' || id === 'ods' || id === 'odp';

/** Reden waarom iets niet ondersteund is (voor UI/stand), of undefined. */
export function nietOndersteundReden(naam?: string): Tweetalig | undefined {
  const ext = extensieVan(naam);
  return NIET_ONDERSTEUND.find((n) => n.extensies.includes(ext))?.reden;
}
