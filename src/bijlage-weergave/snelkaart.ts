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
