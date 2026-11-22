// Чистий беззалежнісний модуль ознак вкладення для карток сповіщень (зокрема Telegram, CONSOL-001 / SPIL-WEERGAVE).
// Без DOM і без модулів Node.js: однаково працює у серверних службах (tsconfig.server.json), оглядачі та модульних випробуваннях.

export type KaartTaal = 'uk' | 'nl';
type Tweetalig = readonly [uk: string, nl: string];

export type KaartSoortSleutel =
  | 'rekening'
  | 'contract'
  | 'foto'
  | 'tabel'
  | 'document'
  | 'tekst'
  | 'archief'
  | 'bericht'
  | 'presentatie'
  | 'geluid'
  | 'video'
  | 'onbekend';

const SOORT_NAAM: Record<KaartSoortSleutel, Tweetalig> = {
  rekening: ['Рахунок', 'Rekening'],
  contract: ['Договір', 'Contract'],
  foto: ['Зображення', 'Afbeelding'],
  tabel: ['Таблиця', 'Tabel'],
  document: ['Документ', 'Document'],
  tekst: ['Текст', 'Tekst'],
  archief: ['Архів', 'Archief'],
  bericht: ['Вкладений лист', 'Bijgevoegd bericht'],
  presentatie: ['Презентація', 'Presentatie'],
  geluid: ['Звук', 'Geluid'],
  video: ['Відео', 'Video'],
  onbekend: ['Файл невідомого типу', 'Bestand van onbekende soort'],
};

const REKENING_NAAM_RE = /(рахун|factuur|invoice|rechnung|nota\b|facture|квитанц|оплат)/i;
const CONTRACT_NAAM_RE = /(догов|контракт|угод|contract|overeenkomst|vertrag|agreement)/i;

function extensieVan(naam: string): string {
  const basis = String(naam || '').split(/[\\/]/).pop() || '';
  const i = basis.lastIndexOf('.');
  if (i <= 0 || i === basis.length - 1) return '';
  const e = basis.slice(i + 1);
  return /^[A-Za-z0-9]{1,8}$/.test(e) ? e.toLowerCase() : '';
}

export function bepaalKaartSoort(naam: string, mime = ''): { sleutel: KaartSoortSleutel; naam: Tweetalig } {
  const e = extensieVan(naam);
  const c = String(mime || '').toLowerCase().split(';')[0].trim();
  const basis = String(naam || '');
  let s: KaartSoortSleutel = 'onbekend';
  if (c.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'avif', 'svg'].includes(e)) s = 'foto';
  else if (['xlsx', 'xls', 'ods', 'csv', 'tsv', 'numbers'].includes(e) || /spreadsheet|ms-excel|text\/csv/.test(c)) s = 'tabel';
  else if (['pptx', 'ppt', 'odp', 'key'].includes(e) || /presentation|powerpoint/.test(c)) s = 'presentatie';
  else if (['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(e) || /zip|x-rar|x-7z|x-tar|gzip/.test(c)) s = 'archief';
  else if (['eml', 'msg'].includes(e) || c === 'message/rfc822') s = 'bericht';
  else if (c.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'opus'].includes(e)) s = 'geluid';
  else if (c.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(e)) s = 'video';
  else if (['pdf', 'docx', 'doc', 'odt', 'rtf', 'pages'].includes(e) || /pdf|wordprocessing|msword|opendocument\.text|rtf/.test(c)) s = 'document';
  else if (['txt', 'md', 'log', 'json', 'xml', 'html', 'htm'].includes(e) || c.startsWith('text/')) s = 'tekst';

  if ((s === 'document' || s === 'foto' || s === 'tekst') && REKENING_NAAM_RE.test(basis)) s = 'rekening';
  else if ((s === 'document' || s === 'tekst') && CONTRACT_NAAM_RE.test(basis)) s = 'contract';
  return { sleutel: s, naam: SOORT_NAAM[s] };
}

// --- Розбір суми та строку оплати виключно з уже принесеного текстового уривка ---
const PIDPYS_BEDRAG =
  /(?:разом(?:\s+до\s+сплати)?|до\s+сплати|всього(?:\s+до\s+(?:сплати|оплати))?|загальна\s+сума|сума\s+до\s+(?:сплати|оплати)|підсумок|te\s+betalen|eindtotaal|algemeen\s+totaal|totaal(?:bedrag)?|te\s+voldoen|gesamtbetrag|endbetrag|zahlbetrag|gesamt(?:summe)?|offen(?:er)?\s+betrag|amount\s+due|balance\s+due|total\s+amount|(?:grand\s+)?total(?:\s+due)?|payable)/i;

const PIDPYS_TERMIJN =
  /(?:сплатити\s+до|оплатити\s+до|термін(?:\s+оплати|\s+сплати)?|строк(?:\s+оплати|\s+сплати)?|кінцева\s+дата|дата\s+оплати|vervaldatum|uiterste\s+betaaldatum|te\s+betalen\s+(?:voor|vóór|tot)|betaaltermijn|betaaldatum|f[äa]llig(?:keitsdatum)?(?:\s+am)?|zahlbar\s+(?:bis|am)|zahlungsziel|due\s+date|payment\s+due(?:\s+date)?|pay(?:able)?\s+by)/i;

const VALUTA_RE = /(?:₴|грн\.?|UAH|€|EUR|euro|\$|USD|£|GBP|zł|PLN|CHF)/i;
const CHYSLO_RE = /\d{1,3}(?:[.,\s\u00a0\u202f']\d{3})+(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?/;
const DATUM_CYFRI_RE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b|\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/;

const MISYATSI: { re: RegExp; n: number }[] = [
  { n: 1, re: /січ(?:ень|ня)|jan(?:uari|uary|uar)?\b/i },
  { n: 2, re: /лют(?:ий|ого)|feb(?:ruari|ruary|ruar)?\b/i },
  { n: 3, re: /берез(?:ень|ня)|maart\b|märz\b|maerz\b|march\b/i },
  { n: 4, re: /квіт(?:ень|ня)|apr(?:il)?\b/i },
  { n: 5, re: /трав(?:ень|ня)|mei\b|m(?:ai|ay)\b/i },
  { n: 6, re: /черв(?:ень|ня)|jun(?:i|y|e)?\b/i },
  { n: 7, re: /лип(?:ень|ня)|jul(?:i|y)?\b/i },
  { n: 8, re: /серп(?:ень|ня)|aug(?:ustus|ust)?\b/i },
  { n: 9, re: /верес(?:ень|ня)|sep(?:tember)?\b/i },
  { n: 10, re: /жовт(?:ень|ня)|okt(?:ober)?\b|oct(?:ober)?\b/i },
  { n: 11, re: /листоп(?:ад|ада)|nov(?:ember)?\b/i },
  { n: 12, re: /груд(?:ень|ня)|dec(?:ember)?\b|dez(?:ember)?\b/i },
];

const DATUM_SLOVA_RE = new RegExp(
  String.raw`\b(\d{1,2})\s*(?:[.\-]\s*)?(` + MISYATSI.map((m) => m.re.source).join('|') + String.raw`)\s*(\d{4})\b`,
  'i',
);

const VALUTA_TEKST: Record<string, Tweetalig> = {
  UAH: ['грн', 'UAH'],
  EUR: ['€', '€'],
  USD: ['$', '$'],
  GBP: ['£', '£'],
  PLN: ['zł', 'zł'],
  CHF: ['CHF', 'CHF'],
};

function normaValuta(syrets: string): string | null {
  const s = syrets.trim();
  if (/^(?:₴|грн\.?|UAH)$/i.test(s)) return 'UAH';
  if (/^(?:€|EUR|euro)$/i.test(s)) return 'EUR';
  if (/^(?:\$|USD)$/i.test(s)) return 'USD';
  if (/^(?:£|GBP)$/i.test(s)) return 'GBP';
  if (/^(?:zł|PLN)$/i.test(s)) return 'PLN';
  if (/^CHF$/i.test(s)) return 'CHF';
  return null;
}

function parsuvatyChyslo(syrets: string): number | null {
  const s = syrets.replace(/[\s\u00a0\u202f']+/g, '');
  if (!s || !/\d/.test(s)) return null;
  let tsile: string;
  let drob = '00';
  const ostannyaKoma = s.lastIndexOf(',');
  const ostannyaKrapka = s.lastIndexOf('.');
  if (ostannyaKoma >= 0 && ostannyaKrapka >= 0) {
    const dzelo = Math.max(ostannyaKoma, ostannyaKrapka);
    const pislya = s.slice(dzelo + 1);
    if (!/^\d{1,2}$/.test(pislya)) return null;
    tsile = s.slice(0, dzelo).replace(/[.,]/g, '');
    drob = pislya.padEnd(2, '0');
  } else {
    const dzelo = ostannyaKoma >= 0 ? ostannyaKoma : ostannyaKrapka;
    if (dzelo < 0) tsile = s;
    else {
      const pislya = s.slice(dzelo + 1);
      if (/^\d{3}$/.test(pislya) && !s.slice(0, dzelo).includes(',') && !s.slice(0, dzelo).includes('.')) {
        tsile = s.replace(/[.,]/g, '');
      } else if (/^\d{1,2}$/.test(pislya)) {
        tsile = s.slice(0, dzelo).replace(/[.,]/g, '');
        drob = pislya.padEnd(2, '0');
      } else return null;
    }
  }
  if (!/^\d+$/.test(tsile)) return null;
  const centen = Number(tsile) * 100 + Number(drob);
  return Number.isFinite(centen) && centen >= 0 ? centen : null;
}

function isoData(rik: number, misyac: number, den: number): string | null {
  if (rik < 1990 || rik > 2100 || misyac < 1 || misyac > 12 || den < 1 || den > 31) return null;
  const d = new Date(Date.UTC(rik, misyac - 1, den));
  if (d.getUTCFullYear() !== rik || d.getUTCMonth() !== misyac - 1 || d.getUTCDate() !== den) return null;
  return `${rik}-${String(misyac).padStart(2, '0')}-${String(den).padStart(2, '0')}`;
}

function parsuvatyDatu(syrets: string): string | null {
  const s = syrets.trim();
  const cyfri = s.match(DATUM_CYFRI_RE);
  if (cyfri) {
    if (cyfri[1]) return isoData(Number(cyfri[1]), Number(cyfri[2]), Number(cyfri[3]));
    let rik = Number(cyfri[6]);
    if (rik < 100) rik += 2000;
    return isoData(rik, Number(cyfri[5]), Number(cyfri[4]));
  }
  const slova = s.match(DATUM_SLOVA_RE);
  if (slova) {
    const misyac = MISYATSI.find((m) => m.re.test(slova[2]))?.n;
    return misyac ? isoData(Number(slova[3]), misyac, Number(slova[1])) : null;
  }
  return null;
}

function formatBedrag(centen: number, valuta: string, taal: KaartTaal): string {
  const abs = Math.abs(Math.round(centen));
  const tsile = String(Math.floor(abs / 100));
  const kop = String(abs % 100).padStart(2, '0');
  const grupa = taal === 'nl' ? '.' : ' ';
  const khvost = tsile.length % 3;
  const start = khvost === 0 ? 3 : khvost;
  let deel = tsile.slice(0, start);
  for (let i = start; i < tsile.length; i += 3) deel += grupa + tsile.slice(i, i + 3);
  const kod = VALUTA_TEKST[valuta] ?? ([valuta, valuta] as Tweetalig);
  const odynytsya = taal === 'nl' ? kod[1] : kod[0];
  const chyslo = `${centen < 0 ? '-' : ''}${deel || '0'},${kop}`;
  return taal === 'nl' && (valuta === 'EUR' || valuta === 'USD' || valuta === 'GBP')
    ? `${odynytsya} ${chyslo}`
    : `${chyslo} ${odynytsya}`;
}

function fragmentenNaPidpys(tekst: string, pidpys: RegExp): string[] {
  const uit: string[] = [];
  const re = new RegExp(pidpys.source, pidpys.flags.includes('g') ? pidpys.flags : `${pidpys.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = re.exec(tekst))) {
    const syryi = tekst.slice(m.index + m[0].length, m.index + m[0].length + 120);
    const rizka = syryi.search(/\n\s*\n/);
    uit.push((rizka >= 0 ? syryi.slice(0, rizka) : syryi).trim());
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return uit;
}

export type BijlageKaartKenmerken = {
  soortNaam: string;
  isRekening: boolean;
  isContract: boolean;
  isFoto: boolean;
  bedrag?: string;
  termijnIso?: string;
};

export function bijlageKaartKenmerken(
  naam: string,
  mime: string,
  tekstVoorbeeld: string | undefined,
  taal: KaartTaal,
): BijlageKaartKenmerken {
  const soort = bepaalKaartSoort(naam, mime);
  const soortNaam = taal === 'nl' ? soort.naam[1] : soort.naam[0];
  const isRekening = soort.sleutel === 'rekening';
  const isContract = soort.sleutel === 'contract';
  const isFoto = soort.sleutel === 'foto';

  let bedrag: string | undefined;
  let termijnIso: string | undefined;

  if (isRekening && tekstVoorbeeld && tekstVoorbeeld.trim()) {
    const t = tekstVoorbeeld.slice(0, 20_000).replace(/\r\n/g, '\n').replace(/[\t\u00a0\u202f]+/g, ' ');
    const bedragFrags = fragmentenNaPidpys(t, PIDPYS_BEDRAG);
    for (let i = bedragFrags.length - 1; i >= 0; i -= 1) {
      const frag = bedragFrags[i];
      const valM = frag.match(VALUTA_RE);
      const numM = frag.match(CHYSLO_RE);
      if (!valM || !numM) continue;
      const centen = parsuvatyChyslo(numM[0]);
      const valuta = normaValuta(valM[0]);
      if (centen !== null && valuta) {
        bedrag = formatBedrag(centen, valuta, taal);
        break;
      }
    }
    for (const frag of fragmentenNaPidpys(t, PIDPYS_TERMIJN)) {
      const cyfri = frag.match(DATUM_CYFRI_RE);
      if (cyfri) {
        const iso = parsuvatyDatu(cyfri[0]);
        if (iso) { termijnIso = iso; break; }
      }
      const slova = frag.match(DATUM_SLOVA_RE);
      if (slova) {
        const iso = parsuvatyDatu(slova[0]);
        if (iso) { termijnIso = iso; break; }
      }
    }
  }

  return {
    soortNaam,
    isRekening,
    isContract,
    isFoto,
    ...(bedrag ? { bedrag } : {}),
    ...(termijnIso ? { termijnIso } : {}),
  };
}
