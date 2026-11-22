// ПОЧАТОК РОБОТИ, НЕ ПЕРЕВІРЕНО: з уже витягнутих полів рахунку збираємо рядки швидкої картки.
// Показуємо лише поля, які справді є; порожнє поле не замінюємо текстом на кшталт «не вдалося».
// Інтерфейс (Weergave.tsx) ще не підключено, тести не проганяли. Це початок, не готовий результат.
// Лишилося: врізати рядки в швидку картку лише для виду «рахунок»; перевірити вигляд українською
// й нідерландською; узгодити формат суми з іншими місцями Пошти, якщо там уже є свій запис.
// Спільний перегляд вкладень, етап 3, крок 1 (Grok: hub.tarasevych.com).
// Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений.

import { kies, type Taal, type Tweetalig } from './soort';
import type { RekeningVelden } from './rekening-velden';

export type SnelkaartSleutel = 'bedrag' | 'termijn' | 'nummer';

export type SnelkaartRij = {
  sleutel: SnelkaartSleutel;
  label: Tweetalig;
  waarde: Tweetalig;
};

const LABEL: Record<SnelkaartSleutel, Tweetalig> = {
  bedrag: ['Сума', 'Bedrag'],
  termijn: ['Сплатити до', 'Te betalen tot'],
  nummer: ['Номер рахунку', 'Factuurnummer'],
};

const VALUTA_TEKST: Record<string, Tweetalig> = {
  UAH: ['грн', 'UAH'],
  EUR: ['€', '€'],
  USD: ['$', '$'],
  GBP: ['£', '£'],
  PLN: ['zł', 'zł'],
  CHF: ['CHF', 'CHF'],
};

function tysyachi(tsile: string, rozd: string): string {
  const khvost = tsile.length % 3;
  const start = khvost === 0 ? 3 : khvost;
  let out = tsile.slice(0, start);
  for (let i = start; i < tsile.length; i += 3) out += rozd + tsile.slice(i, i + 3);
  return out || '0';
}

/** Запис суми: українською «1 234,56 грн», нідерландською «1.234,56 €». */
export function opysBedrag(centen: number, valuta: string, taal: Taal): string {
  const znak = centen < 0 ? '-' : '';
  const abs = Math.abs(Math.round(centen));
  const tsile = String(Math.floor(abs / 100));
  const kop = String(abs % 100).padStart(2, '0');
  const grupa = taal === 'nl' ? '.' : ' ';
  const kod = VALUTA_TEKST[valuta] ?? ([valuta, valuta] as Tweetalig);
  const odynytsya = kies(taal, kod);
  const chyslo = `${znak}${tysyachi(tsile, grupa)},${kop}`;
  if (taal === 'nl' && (valuta === 'EUR' || valuta === 'USD' || valuta === 'GBP')) {
    return `${odynytsya} ${chyslo}`;
  }
  return `${chyslo} ${odynytsya}`;
}

/** Дата для картки: українською 22.11.2026, нідерландською 22-11-2026. */
export function opysTermijn(iso: string, taal: Taal): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const [, rik, misyac, den] = m;
  return taal === 'nl' ? `${den}-${misyac}-${rik}` : `${den}.${misyac}.${rik}`;
}

/**
 * Рядки швидкої картки. Порожній масив означає: показувати нічого, без вигаданого рядка помилки.
 * Порядок: сума, строк, номер — як у плані розділу 15.2.
 */
export function snelkaartRijen(velden: RekeningVelden): SnelkaartRij[] {
  const rijen: SnelkaartRij[] = [];
  if (velden.bedrag) {
    rijen.push({
      sleutel: 'bedrag',
      label: LABEL.bedrag,
      waarde: [
        opysBedrag(velden.bedrag.centen, velden.bedrag.valuta, 'uk'),
        opysBedrag(velden.bedrag.centen, velden.bedrag.valuta, 'nl'),
      ],
    });
  }
  if (velden.termijn) {
    rijen.push({
      sleutel: 'termijn',
      label: LABEL.termijn,
      waarde: [opysTermijn(velden.termijn.iso, 'uk'), opysTermijn(velden.termijn.iso, 'nl')],
    });
  }
  if (velden.nummer) {
    const n = velden.nummer.waarde;
    rijen.push({ sleutel: 'nummer', label: LABEL.nummer, waarde: [n, n] });
  }
  return rijen;
}

/** Ті самі рядки вже мовою екрана — зручно для майбутнього врізу в Weergave.tsx. */
export function snelkaartVoor(velden: RekeningVelden, taal: Taal): { label: string; waarde: string }[] {
  return snelkaartRijen(velden).map((r) => ({ label: kies(taal, r.label), waarde: kies(taal, r.waarde) }));
}

// ---------------------------------------------------------------------------------------------------------------
// НЕ ПЕРЕВІРЕНО (очікує перевірки наступним агентом). Додано Claude Opus 5.5 (High) через Google Antigravity
// (antigravity) 22.11.2026 після Grok: коротка підказка біля строку, щоб розсіяна людина одразу бачила терміновість.

export type TermijnDringend = 'verlopen' | 'vandaag' | 'binnenkort' | 'later';

/** Українська множина: 1 день, 2 дні, 5 днів, 11 днів, 21 день. */
function dniv(n: number): string {
  const d = Math.abs(n) % 100, o = d % 10;
  if (d >= 11 && d <= 14) return `${n} днів`;
  if (o === 1) return `${n} день`;
  if (o >= 2 && o <= 4) return `${n} дні`;
  return `${n} днів`;
}

/** Скільки цілих календарних днів від `nu` до строку (за місцевою датою людини). null — дата незрозуміла. */
export function dagenTot(iso: string, nu: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const doel = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const vandaag = Date.UTC(nu.getFullYear(), nu.getMonth(), nu.getDate());
  if (!Number.isFinite(doel)) return null;
  return Math.round((doel - vandaag) / 86_400_000);
}

/**
 * Підказка біля строку: «прострочено на 2 дні», «сьогодні», «через 3 дні». Порожньо — дата незрозуміла.
 * `binnenkort` — до 7 днів включно: оболонка підсвічує рядок кольором уваги.
 */
export function termijnHint(iso: string, taal: Taal, nu: Date = new Date()): { tekst: string; dringend: TermijnDringend } | null {
  const n = dagenTot(iso, nu);
  if (n === null) return null;
  if (n < 0) return { dringend: 'verlopen', tekst: taal === 'nl' ? `${-n} ${-n === 1 ? 'dag' : 'dagen'} te laat` : `прострочено на ${dniv(-n)}` };
  if (n === 0) return { dringend: 'vandaag', tekst: taal === 'nl' ? 'vandaag' : 'сьогодні' };
  if (n === 1) return { dringend: 'binnenkort', tekst: taal === 'nl' ? 'morgen' : 'завтра' };
  return { dringend: n <= 7 ? 'binnenkort' : 'later', tekst: taal === 'nl' ? `over ${n} dagen` : `через ${dniv(n)}` };
}
