// ПОЧАТОК РОБОТИ, НЕ ПЕРЕВІРЕНО: чисті функції з полів рахунку (сума, строк, номер,
// відправник) складають чорнетку події Календаря у формі AgendaVorm (назва, дата на
// весь день, нагадування, опис, внутрішнє посилання на лист). Мережі немає, клієнт
// agenda-client.ts не викликаємо, maakGebeurtenis не викликаємо, нічого не
// записуємо. Людина має підтвердити пізніше. Це початок, не готовий результат.
// Питання 2 розділу 13 ще відкрите: Павло 22.11.2026 погодився почати запис на
// GitHub, але не вибрав, куди саме писати (наш Календар чи Google Календар).
// Тимчасовий найобережніший вибір: лише чорнетка; якщо пізніше підтвердять запис —
// спершу наш Календар через наявний maakGebeurtenis. Прямого запису в Google
// Календар з переглядача немає.
// Лишилося: прогнати скелет тесту; коротке вікно підтвердження в Weergave.tsx;
// після згоди людини викликати наявний maakGebeurtenis з ключем проти подвійного
// запису; не множити подію при повторному натисканні; уточнити ціль, коли Павло
// відповість на питання 2; коротко перевірити типи.
// Спільний перегляд вкладень, етап 3, розділ 15.3 (Grok: hub.tarasevych.com).
// Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений. Без DOM, щоб можна було викликати з тестів.

import { legeVorm, type AgendaVorm, type Herinnering } from '../../shared/agenda-model';
import type { RekeningVelden } from './rekening-velden';
import { kies, type SoortSleutel, type Taal, type Tweetalig } from './soort';
import { opysBedrag, opysTermijn } from './snelkaart';

/** Тимчасовий вибір цілі, поки питання 2 розділу 13 відкрите. */
export type BetalingDoel = 'onze-agenda';

/**
 * ТИМЧАСОВИЙ ВИБІР (питання 2 ще без повної відповіді).
 * Пишемо не зараз. Якщо людина пізніше підтвердить — спершу наш Календар.
 */
export const VOORLOPIG_DOEL: BetalingDoel = 'onze-agenda';

/** Нагадування: за день і в день сплати. Лише повідомлення, без листа. */
export const STANDAARD_HERINNERINGEN_MINUTEN: readonly number[] = [1440, 0];

export const BETALING_LABEL: Tweetalig = ['Додати оплату в Календар', 'Betaling aan Agenda toevoegen'];

export const BETALING_TOELICHTING: Tweetalig = [
  'Спершу покажемо чорнетку. У Календар запишемо лише після вашої згоди.',
  'Eerst tonen we een ontwerp. We schrijven pas in de Agenda na uw instemming.',
];

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;

export type BetalingBron = {
  velden: RekeningVelden;
  /** Відправник листа, якщо відомий. */
  afzender?: string;
  /** Назва файла — запас для заголовка, якщо номера рахунку немає. */
  bestandsnaam?: string;
  soort?: SoortSleutel;
  profielId?: string;
  rekeningId?: string;
  briefId?: string;
  bijlageId?: string;
  tijdzone?: string;
  taal?: Taal;
};

export type BetalingFout = 'geen-termijn' | 'geen-rekening' | 'ongeldige-datum';

export type BetalingOntwerp = {
  vorm: AgendaVorm;
  /** Ключ проти подвійного запису: профіль, обліковий запис, лист, вкладення, дата, сума. */
  sleutel: string;
  /** Внутрішнє посилання на лист. Це не відкрита адреса мережі. */
  briefVerwijzing: string;
  doel: BetalingDoel;
  /** На цьому кроці завжди так: без згоди людини запису немає. */
  wachtOpBevestiging: true;
  /** Третій аргумент майбутнього виклику maakGebeurtenis. Тут його не викликаємо. */
  meldDeelnemers: 'none';
};

export type OntwerpUitkomst =
  | { ok: true; ontwerp: BetalingOntwerp }
  | { ok: false; fout: BetalingFout };

export function geldigeIsoDag(iso: string): boolean {
  if (!DATUM_RE.test(iso)) return false;
  const dt = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso;
}

/** Дію показуємо лише для рахунку зі зрозумілим строком. */
export function toontKalenderBetaling(soort: SoortSleutel | undefined, velden: RekeningVelden): boolean {
  return soort === 'rekening' && !!velden.termijn && geldigeIsoDag(velden.termijn.iso);
}

/**
 * Стійкий ключ. Той самий набір полів дає той самий рядок, щоб пізніше
 * повторне натискання не просило другий запис.
 */
export function betalingSleutel(bron: BetalingBron): string {
  const bedrag = bron.velden.bedrag
    ? `${bron.velden.bedrag.centen}:${bron.velden.bedrag.valuta}`
    : '';
  return [
    bron.profielId ?? '',
    bron.rekeningId ?? '',
    bron.briefId ?? '',
    bron.bijlageId ?? '',
    bron.velden.termijn?.iso ?? '',
    bedrag,
  ].join('|');
}

/**
 * Внутрішнє посилання на лист і вкладення. Без http і без адреси сайту,
 * щоб подія не відкривала чужий лист.
 */
export function briefVerwijzing(bron: BetalingBron): string {
  const rekening = (bron.rekeningId ?? '').trim();
  const brief = (bron.briefId ?? '').trim();
  const bijlage = (bron.bijlageId ?? '').trim();
  if (!rekening || !brief) return '';
  return bijlage
    ? `posta-brief:${rekening}/${brief}/${bijlage}`
    : `posta-brief:${rekening}/${brief}`;
}

export function herinneringenVoor(minuten: readonly number[] = STANDAARD_HERINNERINGEN_MINUTEN): Herinnering[] {
  const uit: Herinnering[] = [];
  for (const m of minuten) {
    if (!Number.isFinite(m) || m < 0) continue;
    const waarde = Math.round(m);
    if (uit.some((h) => h.minuten === waarde && h.methode === 'popup')) continue;
    uit.push({ methode: 'popup', minuten: waarde });
  }
  return uit;
}

function zagolovok(bron: BetalingBron, taal: Taal): string {
  const nummer = bron.velden.nummer?.waarde?.trim() ?? '';
  const bestand = (bron.bestandsnaam ?? '').trim();
  const khvist = nummer || bestand || (taal === 'nl' ? 'rekening' : 'рахунок');
  return taal === 'nl' ? `Betaling: ${khvist}` : `Оплата: ${khvist}`;
}

function opys(bron: BetalingBron, taal: Taal, verwijzing: string): string {
  const rijen: string[] = [];
  if (bron.velden.bedrag) {
    const label = kies(taal, ['Сума', 'Bedrag']);
    rijen.push(`${label}: ${opysBedrag(bron.velden.bedrag.centen, bron.velden.bedrag.valuta, taal)}`);
  }
  if (bron.velden.termijn) {
    const label = kies(taal, ['Сплатити до', 'Te betalen tot']);
    rijen.push(`${label}: ${opysTermijn(bron.velden.termijn.iso, taal)}`);
  }
  if (bron.velden.nummer?.waarde) {
    const label = kies(taal, ['Номер рахунку', 'Factuurnummer']);
    rijen.push(`${label}: ${bron.velden.nummer.waarde}`);
  }
  const afzender = (bron.afzender ?? '').trim();
  if (afzender) {
    const label = kies(taal, ['Відправник', 'Afzender']);
    rijen.push(`${label}: ${afzender}`);
  }
  if (verwijzing) {
    const label = kies(taal, ['Лист у Пошті', 'Brief in Post']);
    rijen.push(`${label}: ${verwijzing}`);
  }
  return rijen.join('\n');
}

/**
 * Складає чорнетку. Нічого не надсилає і не змінює Календар.
 * Без строку або якщо це не рахунок — повертає причину, без вигаданої дати.
 */
export function maakBetalingOntwerp(bron: BetalingBron): OntwerpUitkomst {
  if (bron.soort !== undefined && bron.soort !== 'rekening') {
    return { ok: false, fout: 'geen-rekening' };
  }
  if (bron.soort === undefined) {
    return { ok: false, fout: 'geen-rekening' };
  }
  const termijn = bron.velden.termijn;
  if (!termijn || !termijn.iso) return { ok: false, fout: 'geen-termijn' };
  if (!geldigeIsoDag(termijn.iso)) return { ok: false, fout: 'ongeldige-datum' };

  const taal: Taal = bron.taal === 'nl' ? 'nl' : 'uk';
  const verwijzing = briefVerwijzing(bron);
  const vorm = legeVorm(bron.tijdzone || 'UTC');
  vorm.heleDag = true;
  vorm.begin = termijn.iso;
  vorm.einde = termijn.iso;
  vorm.titel = zagolovok(bron, taal);
  vorm.beschrijving = opys(bron, taal, verwijzing);
  vorm.locatie = '';
  vorm.deelnemers = [];
  vorm.standaardHerinneringen = false;
  vorm.herinneringen = herinneringenVoor();
  vorm.gebeurtenisId = '';
  vorm.etag = '';
  vorm.agendaId = 'primary';

  return {
    ok: true,
    ontwerp: {
      vorm,
      sleutel: betalingSleutel(bron),
      briefVerwijzing: verwijzing,
      doel: VOORLOPIG_DOEL,
      wachtOpBevestiging: true,
      meldDeelnemers: 'none',
    },
  };
}
