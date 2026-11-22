// ПОЧАТОК РОБОТИ, НЕ ПЕРЕВІРЕНО: чисті функції з полів рахунку (сума, строк, номер,
// відправник) складають чорнетку події Календаря у формі AgendaVorm (назва, дата на
// весь день, нагадування, опис, внутрішнє посилання на лист). Мережі немає, клієнт
// agenda-client.ts не викликаємо, maakGebeurtenis не викликаємо, нічого не
// записуємо. Людина має підтвердити пізніше. Це початок, не готовий результат.
// Питання 2 розділу 13 закрито 22.11.2026: Павло відповів «Нехай людина щоразу
// вибирає календар». Типової цілі немає. Той, хто викликає maakBetalingOntwerp,
// мусить щоразу передати вибір: наш Календар (onze-agenda) або Google Календар
// (google-agenda). Лише чорнетка, запис лише після згоди.
// Лишилося: прогнати скелет тесту; коротке вікно підтвердження в Weergave.tsx
// з вибором цілі щоразу, без типової цілі; після згоди людини викликати наявний
// запис згідно з вибором; не множити подію при повторному натисканні; коротко
// перевірити типи.
// Спільний перегляд вкладень, етап 3, розділ 15.3 (Grok: hub.tarasevych.com).
// Прапорець `bijlage-weergave-gedeeld-v1`, типово вимкнений. Без DOM, щоб можна було викликати з тестів.

import { legeVorm, type AgendaVorm, type Herinnering } from '../../shared/agenda-model';
import type { RekeningVelden } from './rekening-velden';
import { kies, type SoortSleutel, type Taal, type Tweetalig } from './soort';
import { opysBedrag, opysTermijn } from './snelkaart';

/**
 * Ціль, яку людина вибирає щоразу. Типової цілі немає.
 * Наш Календар — onze-agenda, Google Календар — google-agenda.
 */
export type BetalingDoel = 'onze-agenda' | 'google-agenda';

export const BETALING_DOELEN: readonly BetalingDoel[] = ['onze-agenda', 'google-agenda'];

export const BETALING_DOEL_LABEL: { readonly [K in BetalingDoel]: Tweetalig } = {
  'onze-agenda': ['Наш Календар', 'Onze Agenda'],
  'google-agenda': ['Google Календар', 'Google Agenda'],
};

export function geldigBetalingDoel(waarde: string): waarde is BetalingDoel {
  return waarde === 'onze-agenda' || waarde === 'google-agenda';
}

/** Нагадування: за день і в день сплати. Лише повідомлення, без листа. */
export const STANDAARD_HERINNERINGEN_MINUTEN: readonly number[] = [1440, 0];

export const BETALING_LABEL: Tweetalig = ['Додати оплату в Календар', 'Betaling aan Agenda toevoegen'];

export const BETALING_TOELICHTING: Tweetalig = [
  'Спершу покажемо чорнетку. Календар виберете самі. Запишемо лише після вашої згоди.',
  'Eerst tonen we een ontwerp. U kiest zelf de agenda. We schrijven pas na uw instemming.',
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

export type BetalingFout = 'geen-termijn' | 'geen-rekening' | 'ongeldige-datum' | 'geen-doel';

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
 * Типової цілі немає: її треба передати щоразу.
 */
export function maakBetalingOntwerp(bron: BetalingBron, doel: BetalingDoel): OntwerpUitkomst {
  if (!geldigBetalingDoel(doel)) {
    return { ok: false, fout: 'geen-doel' };
  }
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
      doel,
      wachtOpBevestiging: true,
      meldDeelnemers: 'none',
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// НЕ ПЕРЕВІРЕНО (очікує перевірки наступним агентом). Додано Claude Opus 5.5 (High) через Google Antigravity
// (antigravity) 22.11.2026 після Grok: короткий ключ для сервера, адреса вікна Google Календаря та пам’ять
// уже записаних оплат на пристрої. Тести й перевірку типів не проганяли за вказівкою власника.
//
// Важлива знахідка (записано в CONCEPT.md, журнал рішень): «наш Календар» (`/api/owner/agenda/*`) пише ВЖЕ через
// підключений обліковий запис Google (backend/agenda-routes.ts → backend/agenda-google.ts, календар 'primary').
// Тому дві цілі розрізняємо чесно:
//   • onze-agenda   — запис одразу нашим сервером (maakGebeurtenis) у Календар «Мого простору»; подія з’явиться
//                     і в основному календарі підключеного облікового запису Google;
//   • google-agenda — відкриваємо власне вікно Google Календаря з уже заповненою подією; людина сама вибирає там
//                     обліковий запис і календар і сама натискає «Зберегти». Наш сервер нічого не пише.

/** Сервер приймає лише [A-Za-z0-9_-]{8,120} (shared/agenda-model.ts → IDEMPOTENTIE_SLEUTEL). FNV-1a, два проходи. */
export function betalingSleutelKort(bron: BetalingBron): string {
  const ruw = betalingSleutel(bron);
  const fnv = (s: string, basis: number) => {
    let h = basis >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  };
  return `betaling-${fnv(ruw, 0x811c9dc5)}${fnv(ruw, 0x01000193 ^ 0x5bd1e995)}`;
}

function zonderStreepjes(iso: string): string { return iso.replace(/-/g, ''); }

function volgendeDagIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Адреса власного вікна Google Календаря з заповненою подією на весь день (кінець у Google не входить у подію,
 * тому + 1 день). Людина сама вибирає обліковий запис і натискає «Зберегти» — без нашого запису.
 */
export function googleAgendaAdres(vorm: Pick<AgendaVorm, 'titel' | 'beschrijving' | 'begin' | 'einde'>): string {
  if (!geldigeIsoDag(vorm.begin)) return '';
  const einde = geldigeIsoDag(vorm.einde) && vorm.einde >= vorm.begin ? vorm.einde : vorm.begin;
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: vorm.titel,
    dates: `${zonderStreepjes(vorm.begin)}/${zonderStreepjes(volgendeDagIso(einde))}`,
    details: vorm.beschrijving,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Що вже зроблено з цією оплатою на цьому пристрої (сервер усе одно не створить другу подію з тим самим ключем). */
export type BetalingSpoor = { doel: BetalingDoel; wanneer: number; datum: string; gebeurtenisId?: string; agendaId?: string };

const SPOOR_SLEUTEL = 'tsv:bijlage-betaling-spoor-v1';
const SPOOR_MAX = 200;

function leesSporen(): Record<string, BetalingSpoor> {
  try {
    const ruw = JSON.parse(globalThis.localStorage?.getItem(SPOOR_SLEUTEL) || '{}') as unknown;
    return ruw && typeof ruw === 'object' ? (ruw as Record<string, BetalingSpoor>) : {};
  } catch { return {}; }
}

export function betalingSpoor(sleutel: string): BetalingSpoor | null {
  const s = leesSporen()[sleutel];
  return s && geldigBetalingDoel(String(s.doel)) && typeof s.wanneer === 'number' ? s : null;
}

export function bewaarBetalingSpoor(sleutel: string, spoor: BetalingSpoor): void {
  try {
    const alle = leesSporen();
    alle[sleutel] = spoor;
    const rijen = Object.entries(alle).sort((a, b) => b[1].wanneer - a[1].wanneer).slice(0, SPOOR_MAX);
    globalThis.localStorage?.setItem(SPOOR_SLEUTEL, JSON.stringify(Object.fromEntries(rijen)));
  } catch { /* сховище заблоковане: пам’ятаємо лише ключ на сервері */ }
}

/** Двомовні пояснення цілей для вікна вибору. */
export const BETALING_DOEL_UITLEG: { readonly [K in BetalingDoel]: Tweetalig } = {
  'onze-agenda': [
    'Запишемо одразу в Календар «Мого простору». Він пише через ваш підключений Google, тож подія з’явиться і там.',
    'We schrijven meteen in de Agenda van «Mijn Ruimte». Die schrijft via uw gekoppelde Google, dus de afspraak verschijnt ook daar.',
  ],
  'google-agenda': [
    'Відкриємо вікно Google Календаря з готовою подією. Там самі виберете обліковий запис і натиснете «Зберегти».',
    'We openen het venster van Google Agenda met de afspraak klaar. Daar kiest u zelf het account en klikt u op «Opslaan».',
  ],
};
