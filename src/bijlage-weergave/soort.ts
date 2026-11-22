// Спільний перегляд вкладень, етап 1 (Grok: hub.tarasevych.com). Vlag `bijlage-weergave-gedeeld-v1`, standaard UIT.
// Welke soort bestand dit is voor een mens (rekening, contract, foto …) — puur, zonder DOM, zodat het overal werkt
// (Post, Schijf, bord, chat) en in de eenheidstests.
export const WEERGAVE_VLAG = 'bijlage-weergave-gedeeld-v1';

export type Taal = 'uk' | 'nl';
export type Tweetalig = readonly [uk: string, nl: string];
export const kies = (taal: Taal, t: Tweetalig) => (taal === 'nl' ? t[1] : t[0]);

export type SoortSleutel = 'rekening' | 'contract' | 'foto' | 'tabel' | 'document' | 'tekst' | 'archief' | 'bericht' | 'presentatie' | 'geluid' | 'video' | 'onbekend';

export type Soort = { sleutel: SoortSleutel; naam: Tweetalig; kort: Tweetalig };

const SOORTEN: Record<SoortSleutel, Omit<Soort, 'sleutel'>> = {
  rekening: { naam: ['Рахунок', 'Rekening'], kort: ['РАХУНОК', 'REKENING'] },
  contract: { naam: ['Договір', 'Contract'], kort: ['ДОГОВІР', 'CONTRACT'] },
  foto: { naam: ['Зображення', 'Afbeelding'], kort: ['ФОТО', 'FOTO'] },
  tabel: { naam: ['Таблиця', 'Tabel'], kort: ['ТАБЛИЦЯ', 'TABEL'] },
  document: { naam: ['Документ', 'Document'], kort: ['ДОКУМЕНТ', 'DOCUMENT'] },
  tekst: { naam: ['Текст', 'Tekst'], kort: ['ТЕКСТ', 'TEKST'] },
  archief: { naam: ['Архів', 'Archief'], kort: ['АРХІВ', 'ARCHIEF'] },
  bericht: { naam: ['Вкладений лист', 'Bijgevoegd bericht'], kort: ['ЛИСТ', 'BERICHT'] },
  presentatie: { naam: ['Презентація', 'Presentatie'], kort: ['СЛАЙДИ', 'DIA’S'] },
  geluid: { naam: ['Звук', 'Geluid'], kort: ['ЗВУК', 'GELUID'] },
  video: { naam: ['Відео', 'Video'], kort: ['ВІДЕО', 'VIDEO'] },
  onbekend: { naam: ['Файл невідомого типу', 'Bestand van onbekende soort'], kort: ['ІНШЕ', 'ANDERS'] },
};

/** Extensie in hoofdletters zonder punt ('' als er geen is). Dit is een gegeven (bestandsformaat), geen tekst. */
export function formaatVan(naam: string): string {
  const basis = String(naam || '').split(/[\\/]/).pop() || '';
  const i = basis.lastIndexOf('.');
  if (i <= 0 || i === basis.length - 1) return '';
  const e = basis.slice(i + 1);
  return /^[A-Za-z0-9]{1,8}$/.test(e) ? e.toUpperCase() : '';
}

const REKENING = /(рахун|factuur|invoice|rechnung|nota\b|facture|квитанц|оплат)/i;
const CONTRACT = /(догов|контракт|угод|contract|overeenkomst|vertrag|agreement)/i;

export function soortVan(naam: string, contentType = ''): Soort {
  const e = formaatVan(naam).toLowerCase();
  const c = String(contentType || '').toLowerCase().split(';')[0].trim();
  const basis = String(naam || '');
  let s: SoortSleutel = 'onbekend';
  if (c.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'avif', 'svg'].includes(e)) s = 'foto';
  else if (['xlsx', 'xls', 'ods', 'csv', 'tsv', 'numbers'].includes(e) || /spreadsheet|ms-excel|text\/csv/.test(c)) s = 'tabel';
  else if (['pptx', 'ppt', 'odp', 'key'].includes(e) || /presentation|powerpoint/.test(c)) s = 'presentatie';
  else if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(e) || /zip|x-rar|x-7z|x-tar|gzip/.test(c)) s = 'archief';
  else if (['eml', 'msg'].includes(e) || c === 'message/rfc822') s = 'bericht';
  else if (c.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'opus'].includes(e)) s = 'geluid';
  else if (c.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(e)) s = 'video';
  else if (['pdf', 'docx', 'doc', 'odt', 'rtf', 'pages'].includes(e) || /pdf|wordprocessing|msword|opendocument\.text|rtf/.test(c)) s = 'document';
  else if (['txt', 'md', 'log', 'json', 'xml', 'html', 'htm'].includes(e) || c.startsWith('text/')) s = 'tekst';
  // de naam zegt meer dan het formaat: een rekening of contract in pdf/docx/foto
  if ((s === 'document' || s === 'foto' || s === 'tekst') && REKENING.test(basis)) s = 'rekening';
  else if ((s === 'document' || s === 'tekst') && CONTRACT.test(basis)) s = 'contract';
  return { sleutel: s, ...SOORTEN[s] };
}

/** Grootte in het Oekraïens of Nederlands, zonder Engelse eenheden. */
export function grootteTekst(bytes: number, taal: Taal = 'uk'): string {
  const n = Math.max(0, Number(bytes) || 0);
  const eenheden: Tweetalig[] = [['Б', 'B'], ['КБ', 'kB'], ['МБ', 'MB'], ['ГБ', 'GB']];
  const macht = n ? Math.min(eenheden.length - 1, Math.floor(Math.log(n) / Math.log(1024))) : 0;
  const waarde = n / 1024 ** macht;
  const getal = (macht ? waarde.toFixed(1) : String(Math.round(waarde))).replace('.', ',');
  return `${getal} ${kies(taal, eenheden[macht])}`;
}
