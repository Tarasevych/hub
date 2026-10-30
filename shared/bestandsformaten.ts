/** Спільні роди форматів (блок 3, п. 6.5). Логотипів Adobe/Microsoft тут немає — лише позначка. */
export const FORMAAT_FAMILIES = ['pdf', 'document', 'spreadsheet', 'presentatie', 'archief', 'beeld', 'audio', 'video', 'tekst', 'agenda', 'contact', 'mail', 'overig'] as const;
export type FormaatFamilie = (typeof FORMAAT_FAMILIES)[number];

type Regel = { id: string; label: string; familie: FormaatFamilie; extensies: string[]; mime: string[]; uk: string; nl: string };

const R = (id: string, label: string, familie: FormaatFamilie, extensies: string[], mime: string[], uk: string, nl: string): Regel =>
  ({ id, label, familie, extensies, mime, uk, nl });

export const BESTANDSFORMATEN: readonly Regel[] = Object.freeze([
  R('pdf', 'PDF', 'pdf', ['pdf'], ['application/pdf'], 'PDF', 'PDF'),
  R('docx', 'DOC', 'document', ['doc', 'docx', 'odt', 'rtf'], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], 'Документ', 'Document'),
  R('xlsx', 'XLS', 'spreadsheet', ['xls', 'xlsx', 'ods', 'csv'], ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'], 'Таблиця', 'Werkblad'),
  R('pptx', 'PPT', 'presentatie', ['ppt', 'pptx', 'odp'], ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], 'Презентація', 'Presentatie'),
  R('zip', 'ZIP', 'archief', ['zip', 'gz', '7z', 'rar', 'tar'], ['application/zip'], 'Архів', 'Archief'),
  R('png', 'IMG', 'beeld', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'], ['image/png', 'image/jpeg', 'image/gif', 'image/webp'], 'Зображення', 'Afbeelding'),
  R('mp3', 'AUD', 'audio', ['mp3', 'wav', 'ogg', 'm4a'], ['audio/mpeg', 'audio/wav'], 'Аудіо', 'Audio'),
  R('mp4', 'VID', 'video', ['mp4', 'webm', 'mov'], ['video/mp4', 'video/webm'], 'Відео', 'Video'),
  R('txt', 'TXT', 'tekst', ['txt', 'md', 'json', 'js', 'ts', 'css', 'html'], ['text/plain', 'application/json'], 'Текст', 'Tekst'),
  R('ics', 'ICS', 'agenda', ['ics'], ['text/calendar'], 'Календар', 'Agenda'),
  R('vcf', 'VCF', 'contact', ['vcf'], ['text/vcard'], 'Контакт', 'Contact'),
  R('eml', 'EML', 'mail', ['eml'], ['message/rfc822'], 'Лист', 'Bericht'),
]);

const opExt = new Map<string, Regel>();
const opMime = new Map<string, Regel>();
for (const r of BESTANDSFORMATEN) {
  for (const e of r.extensies) opExt.set(e, r);
  for (const m of r.mime) opMime.set(m, r);
}

export function formaatVan(naam = '', mime = ''): { id: string; label: string; familie: FormaatFamilie; uk: string; nl: string } {
  const lager = naam.toLowerCase();
  const ext = lager.includes('.') ? lager.split('.').pop() || '' : '';
  const gevonden = (ext && opExt.get(ext)) || opMime.get(mime.toLowerCase().split(';')[0].trim());
  if (gevonden) return { id: gevonden.id, label: gevonden.label, familie: gevonden.familie, uk: gevonden.uk, nl: gevonden.nl };
  const kort = (ext || 'FILE').slice(0, 5).toUpperCase();
  return { id: 'overig', label: kort, familie: 'overig', uk: 'Файл', nl: 'Bestand' };
}
