// Спільний перегляд вкладень, етап 1 (Grok: hub.tarasevych.com). Eén vertrouwenslabel uit bewijs dat we ECHT hebben:
// de eerste bytes (werkelijke soort vs. naam), macro's in kantoorbestanden en verborgen acties in documenten.
// Wat niet is nagegaan (de afzender) staat er eerlijk niet in. Puur: werkt op bytes, zonder DOM.
import { formaatVan, type Tweetalig } from './soort';

export type Niveau = 'goed' | 'let-op' | 'onbekend';
export type Bevinding = { sleutel: string; tekst: Tweetalig; ernst: 'goed' | 'let-op' | 'info' };
export type Vertrouwen = { niveau: Niveau; kort: Tweetalig; zin: Tweetalig; bevindingen: Bevinding[]; werkelijk: string };

/** Werkelijke soort volgens de eerste bytes (magische getallen). */
export function werkelijkeSoort(kop: Uint8Array): string {
  const b = kop, s = (i: number, t: string) => t.split('').every((ch, k) => b[i + k] === ch.charCodeAt(0));
  if (b.length >= 4 && s(0, '%PDF')) return 'pdf';
  if (b.length >= 8 && b[0] === 0x89 && s(1, 'PNG')) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 4 && s(0, 'GIF8')) return 'gif';
  if (b.length >= 12 && s(0, 'RIFF') && s(8, 'WEBP')) return 'webp';
  if (b.length >= 12 && s(4, 'ftyp')) { const merk = String.fromCharCode(...b.slice(8, 12)); return /hei|mif1|msf1|hevc/.test(merk) ? 'heic' : /avif/.test(merk) ? 'avif' : 'mp4'; }
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7)) return 'zip';
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'ole';
  if (b.length >= 6 && s(0, 'Rar!')) return 'rar';
  if (b.length >= 6 && b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf) return '7z';
  if (b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b) return 'gzip';
  if (b.length >= 2 && s(0, 'MZ')) return 'programma';
  if (b.length >= 4 && b[0] === 0x7f && s(1, 'ELF')) return 'programma';
  if (looksText(b)) return 'tekst';
  return 'binair';
}

function looksText(b: Uint8Array): boolean {
  if (!b.length) return false;
  const n = Math.min(b.length, 4096);
  let ctrl = 0;
  for (let i = 0; i < n; i++) { const x = b[i]; if (x === 0) return false; if (x < 9 || (x > 13 && x < 32)) ctrl++; }
  if (ctrl / n > 0.02) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(0, n - (n === b.length ? 0 : 4))); return true; } catch { return false; }
}

/** Welke werkelijke soorten passen bij een extensie. */
const PAST: Record<string, string[]> = {
  pdf: ['pdf'], png: ['png'], jpg: ['jpeg'], jpeg: ['jpeg'], gif: ['gif'], webp: ['webp'], heic: ['heic'], heif: ['heic'], avif: ['avif'],
  docx: ['zip'], xlsx: ['zip'], pptx: ['zip'], odt: ['zip'], ods: ['zip'], odp: ['zip'], zip: ['zip'], epub: ['zip'],
  doc: ['ole'], xls: ['ole'], ppt: ['ole'], msg: ['ole'], rar: ['rar'], '7z': ['7z'], gz: ['gzip'], tgz: ['gzip'],
  txt: ['tekst'], csv: ['tekst'], md: ['tekst'], json: ['tekst'], xml: ['tekst'], html: ['tekst'], htm: ['tekst'], eml: ['tekst'], ics: ['tekst'], vcf: ['tekst'], svg: ['tekst'],
  mp4: ['mp4'], mov: ['mp4'], m4a: ['mp4'],
};

export type Bewijs = { naam: string; kop: Uint8Array; /** tekst uit het bestand (de eerste stukken), voor verborgen acties */ inhoud?: string; /** namen in een archief/kantoorbestand */ archiefNamen?: string[] };

export function vertrouwenUit(b: Bewijs): Vertrouwen {
  const ext = formaatVan(b.naam).toLowerCase();
  const werkelijk = werkelijkeSoort(b.kop);
  const bev: Bevinding[] = [];
  const verwacht = PAST[ext];
  let soortKlopt: boolean | null = null;
  if (werkelijk === 'programma') {
    bev.push({ sleutel: 'programma', ernst: 'let-op', tekst: ['Усередині — програма, а не документ. Не запускайте її.', 'Binnenin zit een programma, geen document. Start het niet.'] });
    soortKlopt = false;
  } else if (verwacht) {
    soortKlopt = verwacht.includes(werkelijk);
    bev.push(soortKlopt
      ? { sleutel: 'soort', ernst: 'goed', tekst: ['Справжній тип файлу збігається з назвою.', 'De echte soort past bij de naam.'] }
      : { sleutel: 'soort', ernst: 'let-op', tekst: [`Назва каже «.${ext}», а всередині інший тип файлу.`, `De naam zegt «.${ext}», maar binnenin zit een andere soort.`] });
  } else {
    bev.push({ sleutel: 'soort', ernst: 'info', tekst: ['Тип файлу за назвою не перевірено: невідоме розширення.', 'De soort volgens de naam is niet nagegaan: onbekende extensie.'] });
  }
  const namen = (b.archiefNamen || []).map((n) => n.toLowerCase());
  const kantoor = ['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'docm', 'xlsm', 'pptm'].includes(ext);
  const macro = /m$/.test(ext) && kantoor || werkelijk === 'ole' && kantoor || namen.some((n) => /vbaproject\.bin$|\/macros\//.test(n));
  if (macro) bev.push({ sleutel: 'macro', ernst: 'let-op', tekst: ['Файл може містити макроси (вбудовані програми).', 'Het bestand kan macro’s (ingebouwde programma’s) bevatten.'] });
  else if (kantoor && werkelijk === 'zip') bev.push({ sleutel: 'macro', ernst: 'goed', tekst: ['Макросів не знайдено.', 'Geen macro’s gevonden.'] });
  const tekst = b.inhoud || '';
  if (werkelijk === 'pdf' && tekst) {
    const acties = /\/(JavaScript|JS|Launch|OpenAction|EmbeddedFile|SubmitForm)\b/.test(tekst);
    bev.push(acties
      ? { sleutel: 'acties', ernst: 'let-op', tekst: ['Документ має приховані дії (сценарії, запуск, вкладені файли).', 'Het document heeft verborgen acties (scripts, starten, ingebedde bestanden).'] }
      : { sleutel: 'acties', ernst: 'goed', tekst: ['Прихованих дій і сценаріїв не знайдено.', 'Geen verborgen acties of scripts gevonden.'] });
  }
  bev.push({ sleutel: 'afzender', ernst: 'info', tekst: ['Відправника ще не перевірено (наступний етап).', 'De afzender is nog niet nagegaan (volgende fase).'] });
  const letOp = bev.some((x) => x.ernst === 'let-op');
  const niveau: Niveau = letOp ? 'let-op' : soortKlopt ? 'goed' : 'onbekend';
  const goed = bev.filter((x) => x.ernst === 'goed').map((x) => x.sleutel);
  const zin: Tweetalig = niveau === 'let-op'
    ? [`Увага: ${bev.find((x) => x.ernst === 'let-op')!.tekst[0].replace(/^./, (c) => c.toLowerCase())}`, `Let op: ${bev.find((x) => x.ernst === 'let-op')!.tekst[1].replace(/^./, (c) => c.toLowerCase())}`]
    : niveau === 'goed'
      ? [['Справжній тип збігається з назвою', goed.includes('macro') ? 'без макросів' : '', goed.includes('acties') ? 'без прихованих дій' : ''].filter(Boolean).join(', ') + '.',
         ['De echte soort past bij de naam', goed.includes('macro') ? 'zonder macro’s' : '', goed.includes('acties') ? 'zonder verborgen acties' : ''].filter(Boolean).join(', ') + '.']
      : ['Не вдалося перевірити тип цього файлу.', 'De soort van dit bestand kon niet worden nagegaan.'];
  const kort: Tweetalig = niveau === 'let-op' ? ['Увага', 'Let op'] : niveau === 'goed' ? ['Перевірено', 'Nagegaan'] : ['Не перевірено', 'Niet nagegaan'];
  return { niveau, kort, zin, bevindingen: bev, werkelijk };
}

/** Leest het bewijs uit een Blob: de eerste 64 kB voor de soort en (bij pdf) tot 2 MB tekst voor verborgen acties. */
export async function bewijsUitBlob(blob: Blob, naam: string, archiefNamen?: string[]): Promise<Vertrouwen> {
  const kop = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer());
  let inhoud = '';
  if (werkelijkeSoort(kop) === 'pdf') inhoud = new TextDecoder('latin1').decode(new Uint8Array(await blob.slice(0, 2 * 1024 * 1024).arrayBuffer()));
  return vertrouwenUit({ naam, kop, inhoud, archiefNamen });
}
