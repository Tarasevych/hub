// Спільний перегляд вкладень, етап 3, крок 1 (Grok: hub.tarasevych.com; доопрацьовано в CONSOL-001):
// чисті функції витягують суму з валютою, строк сплати й номер рахунку зі звичайного тексту документа.
// Підписи розпізнаються українською, нідерландською, німецькою та англійською (іншомовні зразки — лише в шаблонах розбору,
// не в підписах для людини). Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений. Без DOM, придатно для серверних і модульних випробувань.

/** Сума в сотих одиницях валюти, щоб не губити копійки в дробах. */
export type BedragVeld = {
  centen: number;
  valuta: string;
  bron: string;
};

/** Строк сплати в календарному вигляді РРРР-ММ-ДД. */
export type TermijnVeld = {
  iso: string;
  bron: string;
};

/** Номер рахунку так, як у тексті, без зайвих пробілів по краях. */
export type NummerVeld = {
  waarde: string;
  bron: string;
};

export type RekeningVelden = {
  bedrag: BedragVeld | null;
  termijn: TermijnVeld | null;
  nummer: NummerVeld | null;
};

const POROZHNI: RekeningVelden = { bedrag: null, termijn: null, nummer: null };

// Сильні підписи підсумку: беремо їх, а не рядок товару. Слабке слово «сума» / «bedrag» саме
// по собі сюди не входить — це свідомо, щоб не взяти ціну позиції. Додати пізніше з обережністю.
const PIDPYS_BEDRAG =
  /(?:разом(?:\s+до\s+сплати)?|до\s+сплати|всього(?:\s+до\s+(?:сплати|оплати))?|загальна\s+сума|сума\s+до\s+(?:сплати|оплати)|підсумок|te\s+betalen|eindtotaal|algemeen\s+totaal|totaal(?:bedrag)?|te\s+voldoen|gesamtbetrag|endbetrag|zahlbetrag|gesamt(?:summe)?|offen(?:er)?\s+betrag|amount\s+due|balance\s+due|total\s+amount|(?:grand\s+)?total(?:\s+due)?|payable)/i;

const PIDPYS_TERMIJN =
  /(?:сплатити\s+до|оплатити\s+до|термін(?:\s+оплати|\s+сплати)?|строк(?:\s+оплати|\s+сплати)?|кінцева\s+дата|дата\s+оплати|vervaldatum|uiterste\s+betaaldatum|te\s+betalen\s+(?:voor|vóór|tot)|betaaltermijn|betaaldatum|f[äa]llig(?:keitsdatum)?(?:\s+am)?|zahlbar\s+(?:bis|am)|zahlungsziel|due\s+date|payment\s+due(?:\s+date)?|pay(?:able)?\s+by)/i;

// «rekeningnummer» у нідерландській часто є номером банківського рахунку, тому його тут немає.
const PIDPYS_NUMMER =
  /(?:номер(?:\s+рахунку(?:-?фактури)?|\s+фактури)?|рахунок(?:-?фактура)?\s*(?:№|no\.?|nr\.?)|factuurnummer|factuur(?:nummer|\s*nr\.?|\s*no\.?)|rechnungsnummer|rechnungs?-?(?:nr|nummer)|rg\.?\s*-?\s*nr\.?|invoice\s*(?:number|no\.?|#)|inv\.?\s*#?)/i;

const VALUTA_RE = /(?:₴|грн\.?|UAH|€|EUR|euro|\$|USD|£|GBP|zł|PLN|CHF)/i;
const CHYSLO_RE = /\d{1,3}(?:[.,\s\u00a0\u202f']\d{3})+(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?/;
const DATUM_CYFRI_RE = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b|\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})\b/;

// Назви місяців — дані для розбору, не підписи для людини.
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

function stysnuty(tekst: string): string {
  return tekst.replace(/\r\n/g, '\n').replace(/[\t\u00a0\u202f]+/g, ' ');
}

function viknoPislya(tekst: string, kinets: number, dovzhyna = 120): string {
  const syryi = tekst.slice(kinets, kinets + dovzhyna);
  const rizka = syryi.search(/\n\s*\n/);
  return (rizka >= 0 ? syryi.slice(0, rizka) : syryi).trim();
}

function znakyPidpysu(tekst: string, pidpys: RegExp): { index: number; fragment: string }[] {
  const znahidky: { index: number; fragment: string }[] = [];
  const re = new RegExp(pidpys.source, pidpys.flags.includes('g') ? pidpys.flags : pidpys.flags + 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(tekst))) {
    znahidky.push({ index: m.index, fragment: viknoPislya(tekst, m.index + m[0].length) });
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return znahidky;
}

export function normaValuta(syrets: string): string | null {
  const s = syrets.trim();
  if (/^(?:₴|грн\.?|UAH)$/i.test(s)) return 'UAH';
  if (/^(?:€|EUR|euro)$/i.test(s)) return 'EUR';
  if (/^(?:\$|USD)$/i.test(s)) return 'USD';
  if (/^(?:£|GBP)$/i.test(s)) return 'GBP';
  if (/^(?:zł|PLN)$/i.test(s)) return 'PLN';
  if (/^CHF$/i.test(s)) return 'CHF';
  return null;
}

/**
 * Розбір числа з пробілами, крапками й комами. Останній роздільник з 1–2 цифрами після нього —
 * це десяткова частина; три цифри після єдиного роздільника вважаємо тисячами (1.234 → 1234).
 */
export function parsuvatyChyslo(syrets: string): number | null {
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
  if (!Number.isFinite(centen) || centen < 0) return null;
  return centen;
}

export function parsuvatyDatu(syrets: string): string | null {
  const s = syrets.trim();
  const cyfri = s.match(DATUM_CYFRI_RE);
  if (cyfri) {
    let rik: number, misyac: number, den: number;
    if (cyfri[1]) {
      rik = Number(cyfri[1]);
      misyac = Number(cyfri[2]);
      den = Number(cyfri[3]);
    } else {
      den = Number(cyfri[4]);
      misyac = Number(cyfri[5]);
      rik = Number(cyfri[6]);
      if (rik < 100) rik += 2000;
    }
    return isoData(rik, misyac, den);
  }
  const slova = s.match(DATUM_SLOVA_RE);
  if (slova) {
    const den = Number(slova[1]);
    const rik = Number(slova[3]);
    const misyac = MISYATSI.find((m) => m.re.test(slova[2]))?.n;
    if (!misyac) return null;
    return isoData(rik, misyac, den);
  }
  return null;
}

function isoData(rik: number, misyac: number, den: number): string | null {
  if (rik < 1990 || rik > 2100 || misyac < 1 || misyac > 12 || den < 1 || den > 31) return null;
  const d = new Date(Date.UTC(rik, misyac - 1, den));
  if (d.getUTCFullYear() !== rik || d.getUTCMonth() !== misyac - 1 || d.getUTCDate() !== den) return null;
  const mm = String(misyac).padStart(2, '0');
  const dd = String(den).padStart(2, '0');
  return `${rik}-${mm}-${dd}`;
}

function bedragZFragmentu(fragment: string): { centen: number; valuta: string; bron: string } | null {
  const valutaV = fragment.match(VALUTA_RE);
  const chysloV = fragment.match(CHYSLO_RE);
  if (!chysloV) return null;
  const centen = parsuvatyChyslo(chysloV[0]);
  if (centen == null) return null;
  if (!valutaV) return null;
  const valuta = normaValuta(valutaV[0]);
  if (!valuta) return null;
  return { centen, valuta, bron: (valutaV.index != null && valutaV.index < (chysloV.index ?? 0)
    ? `${valutaV[0]} ${chysloV[0]}`
    : `${chysloV[0]} ${valutaV[0]}`).replace(/\s+/g, ' ').trim() };
}

export function bedragZTekstu(tekst: string): BedragVeld | null {
  const t = stysnuty(tekst);
  const znaky = znakyPidpysu(t, PIDPYS_BEDRAG);
  // Підсумок зазвичай внизу рахунку — беремо останній вдалий збіг.
  for (let i = znaky.length - 1; i >= 0; i--) {
    const z = bedragZFragmentu(znaky[i].fragment);
    if (z) return z;
  }
  return null;
}

export function termijnZTekstu(tekst: string): TermijnVeld | null {
  const t = stysnuty(tekst);
  for (const z of znakyPidpysu(t, PIDPYS_TERMIJN)) {
    const cyfri = z.fragment.match(DATUM_CYFRI_RE);
    if (cyfri) {
      const iso = parsuvatyDatu(cyfri[0]);
      if (iso) return { iso, bron: cyfri[0] };
    }
    const slova = z.fragment.match(DATUM_SLOVA_RE);
    if (slova) {
      const iso = parsuvatyDatu(slova[0]);
      if (iso) return { iso, bron: slova[0].replace(/\s+/g, ' ').trim() };
    }
  }
  return null;
}

const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/i;
const NUMMER_TOKEN_RE = /[A-ZА-ЯІЇЄҐ]{0,8}[-/]?\d{1,8}(?:[-/][A-Z0-9А-ЯІЇЄҐ]{1,8})*/i;

export function nummerZTekstu(tekst: string): NummerVeld | null {
  const t = stysnuty(tekst);
  for (const z of znakyPidpysu(t, PIDPYS_NUMMER)) {
    const fragment = z.fragment.replace(/^[\s:.\-–—№#]+/, '');
    if (IBAN_RE.test(fragment.slice(0, 42))) continue;
    const token = fragment.match(NUMMER_TOKEN_RE);
    if (!token) continue;
    const waarde = token[0].trim();
    if (!waarde) continue;
    // Не беремо значення, яке є лише датою (наприклад «Factuur: 12.11.2026»).
    if (parsuvatyDatu(waarde)) continue;
    if (waarde.length > 32) continue;
    return { waarde, bron: waarde };
  }
  return null;
}

/**
 * Головний вхід. Якщо поля в тексті немає або впевненість низька — повертаємо null для
 * цього поля, без вигадок. Тема листа сюди не передається: лише текст документа.
 */
export function rekeningVelden(tekst: string): RekeningVelden {
  if (!tekst || !tekst.trim()) return { ...POROZHNI };
  return {
    bedrag: bedragZTekstu(tekst),
    termijn: termijnZTekstu(tekst),
    nummer: nummerZTekstu(tekst),
  };
}
