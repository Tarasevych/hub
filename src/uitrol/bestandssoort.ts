// Welk soort bestand heeft de gebruiker gekozen? Op de eerste bytes (magic numbers) én de extensie, zodat een verkeerde keuze meteen een duidelijke
// uitleg krijgt («dit is een ZIP, ik heb een .tar.gz nodig») in plaats van een foutcode na de upload. Alleen .tar.gz (tar + gzip) wordt geaccepteerd;
// de inhoud (tar-structuur, UITROL-VERSIE, metadata) controleert tar-lezen.ts daarna.
export type SoortId = 'targz' | 'gzip' | 'tar' | 'zip' | '7z' | 'rar' | 'bzip2' | 'xz' | 'zstd' | 'pdf' | 'afbeelding' | 'office' | 'programma' | 'tekst' | 'video' | 'audio' | 'onbekend';
export type Pictogram = 'archief' | 'tekst' | 'afbeelding' | 'code' | 'tabel' | 'programma' | 'video' | 'audio' | 'onbekend';
export type Soort = { id: SoortId; label: string; ext: string; ok: boolean; pictogram: Pictogram; tip: { uk: string; nl: string } };

const ZEG: Record<string, { uk: string; nl: string }> = {
  zip: { uk: 'Це ZIP-архів. Потрібен .tar.gz (tar, стиснений gzip). Попросіть агента зібрати «пакет для схвалення з телефона» або створіть його командою: tar -czf mijn-ruimte-ВЕРСІЯ.tar.gz мапа/', nl: 'Dit is een ZIP-archief. Er is een .tar.gz nodig (tar, gzip). Vraag de agent een «pakket voor goedkeuring via de telefoon» te maken, of maak het met: tar -czf mijn-ruimte-VERSIE.tar.gz map/' },
  '7z': { uk: 'Це архів 7-Zip. Потрібен .tar.gz — перепакуйте або попросіть агента зібрати пакет.', nl: 'Dit is een 7-Zip-archief. Er is een .tar.gz nodig — pak opnieuw in of vraag de agent het pakket te bouwen.' },
  rar: { uk: 'Це архів RAR. Потрібен .tar.gz — перепакуйте або попросіть агента зібрати пакет.', nl: 'Dit is een RAR-archief. Er is een .tar.gz nodig — pak opnieuw in of vraag de agent het pakket te bouwen.' },
  bzip2: { uk: 'Це .tar.bz2 / bzip2. Потрібен саме gzip (.tar.gz): tar -czf …', nl: 'Dit is bzip2 (.tar.bz2). Er is gzip nodig (.tar.gz): tar -czf …' },
  xz: { uk: 'Це .tar.xz. Потрібен саме gzip (.tar.gz): tar -czf …', nl: 'Dit is .tar.xz. Er is gzip nodig (.tar.gz): tar -czf …' },
  zstd: { uk: 'Це .tar.zst. Потрібен саме gzip (.tar.gz): tar -czf …', nl: 'Dit is .tar.zst. Er is gzip nodig (.tar.gz): tar -czf …' },
  tar: { uk: 'Це tar без стиснення. Потрібен .tar.gz: gzip mijn-ruimte-ВЕРСІЯ.tar', nl: 'Dit is een tar zonder compressie. Er is een .tar.gz nodig: gzip mijn-ruimte-VERSIE.tar' },
  pdf: { uk: 'Це PDF-документ, а не пакет оновлення. Оберіть файл mijn-ruimte-….tar.gz.', nl: 'Dit is een PDF-document, geen updatepakket. Kies het bestand mijn-ruimte-….tar.gz.' },
  afbeelding: { uk: 'Це зображення, а не пакет оновлення. Оберіть файл mijn-ruimte-….tar.gz.', nl: 'Dit is een afbeelding, geen updatepakket. Kies het bestand mijn-ruimte-….tar.gz.' },
  office: { uk: 'Це документ Office (docx/xlsx/pptx), а не пакет оновлення. Оберіть mijn-ruimte-….tar.gz.', nl: 'Dit is een Office-document (docx/xlsx/pptx), geen updatepakket. Kies mijn-ruimte-….tar.gz.' },
  programma: { uk: 'Це програма (виконуваний файл). Із міркувань безпеки сайт приймає лише архів .tar.gz і ніколи не запускає завантажені програми.', nl: 'Dit is een programma (uitvoerbaar bestand). Om veiligheidsredenen accepteert de site alleen een .tar.gz-archief en voert nooit een geüpload programma uit.' },
  tekst: { uk: 'Це текстовий файл. Оберіть архів mijn-ruimte-….tar.gz.', nl: 'Dit is een tekstbestand. Kies het archief mijn-ruimte-….tar.gz.' },
  video: { uk: 'Це відеофайл. Оберіть архів mijn-ruimte-….tar.gz.', nl: 'Dit is een videobestand. Kies het archief mijn-ruimte-….tar.gz.' },
  audio: { uk: 'Це аудіофайл. Оберіть архів mijn-ruimte-….tar.gz.', nl: 'Dit is een audiobestand. Kies het archief mijn-ruimte-….tar.gz.' },
  onbekend: { uk: 'Невідомий тип файлу. Потрібен архів mijn-ruimte-….tar.gz.', nl: 'Onbekend bestandstype. Er is een archief mijn-ruimte-….tar.gz nodig.' },
};
const maak = (id: SoortId, label: string, ext: string, pictogram: Pictogram, ok = false): Soort => ({ id, label, ext, ok, pictogram, tip: ok ? { uk: 'Формат підходить. Далі перевіримо вміст.', nl: 'Formaat past. Daarna controleren we de inhoud.' } : (ZEG[id] ?? ZEG.onbekend) });
const begint = (b: Uint8Array, ...bytes: number[]) => bytes.every((x, i) => b[i] === x);

export function herkenBestand(naam: string, kop: Uint8Array): Soort {
  const n = naam.toLowerCase();
  const extTar = /\.(tar\.gz|tgz)$/.test(n);
  if (begint(kop, 0x1f, 0x8b)) {
    if (extTar) return maak('targz', 'tar.gz', '.tar.gz', 'archief', true);
    if (/\.gz$/.test(n)) return maak('gzip', 'gzip', '.gz', 'archief', true);   // misschien toch een tar: de inhoud beslist
    return maak('gzip', 'gzip', n.includes('.') ? `.${n.split('.').pop()}` : '', 'archief', true);
  }
  if (begint(kop, 0x50, 0x4b, 0x03, 0x04) || begint(kop, 0x50, 0x4b, 0x05, 0x06)) return /\.(docx|xlsx|pptx|odt|ods|odp)$/.test(n) ? maak('office', 'Office', `.${n.split('.').pop()}`, 'tabel') : /\.(jar|apk)$/.test(n) ? maak('programma', 'Java/Android', `.${n.split('.').pop()}`, 'programma') : maak('zip', 'ZIP', '.zip', 'archief');
  if (begint(kop, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return maak('7z', '7-Zip', '.7z', 'archief');
  if (begint(kop, 0x52, 0x61, 0x72, 0x21)) return maak('rar', 'RAR', '.rar', 'archief');
  if (begint(kop, 0x42, 0x5a, 0x68)) return maak('bzip2', 'bzip2', '.bz2', 'archief');
  if (begint(kop, 0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00)) return maak('xz', 'xz', '.xz', 'archief');
  if (begint(kop, 0x28, 0xb5, 0x2f, 0xfd)) return maak('zstd', 'zstd', '.zst', 'archief');
  if (kop.length >= 262 && String.fromCharCode(...kop.subarray(257, 262)) === 'ustar') return maak('tar', 'tar', '.tar', 'archief');
  if (begint(kop, 0x25, 0x50, 0x44, 0x46)) return maak('pdf', 'PDF', '.pdf', 'tekst');
  if (begint(kop, 0x89, 0x50, 0x4e, 0x47) || begint(kop, 0xff, 0xd8, 0xff) || begint(kop, 0x47, 0x49, 0x46, 0x38) || (begint(kop, 0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...kop.subarray(8, 12)) === 'WEBP')) return maak('afbeelding', 'Afbeelding', n.includes('.') ? `.${n.split('.').pop()}` : '', 'afbeelding');
  if (begint(kop, 0x4d, 0x5a) || begint(kop, 0x7f, 0x45, 0x4c, 0x46) || begint(kop, 0xcf, 0xfa, 0xed, 0xfe) || begint(kop, 0xca, 0xfe, 0xba, 0xbe)) return maak('programma', 'Programma', n.includes('.') ? `.${n.split('.').pop()}` : '', 'programma');
  if (kop.length >= 12 && String.fromCharCode(...kop.subarray(4, 8)) === 'ftyp') return maak('video', 'Video', '.mp4', 'video');
  if (begint(kop, 0x49, 0x44, 0x33) || begint(kop, 0x4f, 0x67, 0x67, 0x53) || begint(kop, 0x66, 0x4c, 0x61, 0x43)) return maak('audio', 'Audio', n.includes('.') ? `.${n.split('.').pop()}` : '', 'audio');
  const tekst = kop.length > 0 && Array.from(kop.subarray(0, Math.min(kop.length, 512))).every((x) => x === 9 || x === 10 || x === 13 || (x >= 32 && x < 127) || x >= 0xc2);
  if (tekst) return maak('tekst', 'Tekst', n.includes('.') ? `.${n.split('.').pop()}` : '', /\.(js|ts|json|sh|py|html|css|md|yml|yaml|sql)$/.test(n) ? 'code' : 'tekst');
  return maak('onbekend', 'Onbekend', n.includes('.') ? `.${n.split('.').pop()}` : '', 'onbekend');
}
