// Картка вкладення в Telegram-боті — ОКРЕМА для кожного з 11 станів, а не одна спільна.
// Відповідь Павла на питання 4 (22.11.2026, UTC+1): «так, окрім того, на кожний стан має бути своя картка, а не універсальна».
// Початковий автор: Claude Opus 5.5 (High) через Google Antigravity (antigravity); підключено до stuurBijlageMeldingNaarTelegram
// у backend/bijlage-telegram-melding.ts та зміцнено перевірками домену й цілісності HTML у CONSOL-001 (Gemini 3.1 Pro (High)).
//
// Правила:
//   • вміст файла в Telegram НЕ передаємо — лише назву, вид, суму, строк і кнопку «Відкрити на сайті»;
//   • кнопка веде виключно на https:-адресу власного домену платформи без вбудованих облікових даних;
//   • колір за змістом, однаковий з усім сайтом: зелений — успіх, помаранчевий — увага, червоний — небезпека чи прострочено,
//     синій — звичайне нове;
//   • кожен стан має свій заголовок, свій значок, своє пояснення «що це» і свою підказку «що робити»;
//   • текст екрановано для parse_mode HTML без розрізання тегів чи HTML-сутностей у межах 1024 знаків.

import { dienstVoorHost } from '../melding-link';

export type TelegramKaartStaat =
  | 'rekening-nieuw'
  | 'termijn-binnenkort'
  | 'termijn-vandaag'
  | 'termijn-verlopen'
  | 'betaald'
  | 'contract-nieuw'
  | 'nieuwe-versie'
  | 'verdacht'
  | 'onleesbaar'
  | 'foto'
  | 'document';

export type TelegramKaartKleur = 'goed' | 'let' | 'fout' | 'gewoon';

/** Кольори станів — ті самі, що в src/thema/staat-kleuren.css (світла тема), щоб картка й сайт говорили однаково. */
export const TELEGRAM_KAART_HEX: Record<TelegramKaartKleur, string> = {
  goed: '#15803D',
  let: '#C2410C',
  fout: '#B42318',
  gewoon: '#2AABEE',
};

type Tekst = readonly [uk: string, nl: string];

type StaatOpmaak = {
  kleur: TelegramKaartKleur;
  icoon: string;
  kop: Tekst;
  /** Що робити — одна коротка підказка для розсіяної людини. */
  wat: Tekst;
};

export const TELEGRAM_KAART_STATEN: Record<TelegramKaartStaat, StaatOpmaak> = {
  'rekening-nieuw': { kleur: 'gewoon', icoon: '🧾', kop: ['Новий рахунок', 'Nieuwe rekening'], wat: ['Перегляньте суму й строк оплати.', 'Bekijk het bedrag en de betaaltermijn.'] },
  'termijn-binnenkort': { kleur: 'let', icoon: '⏳', kop: ['Строк оплати скоро', 'Betaaltermijn nadert'], wat: ['Заплануйте оплату або додайте її в Календар.', 'Plan de betaling of zet ze in de agenda.'] },
  'termijn-vandaag': { kleur: 'let', icoon: '📅', kop: ['Строк оплати сьогодні', 'Betaaltermijn vandaag'], wat: ['Оплатіть сьогодні, щоб уникнути пені.', 'Betaal vandaag om boetes te vermijden.'] },
  'termijn-verlopen': { kleur: 'fout', icoon: '⛔', kop: ['Строк оплати минув', 'Betaaltermijn verstreken'], wat: ['Оплатіть якнайшвидше або зв’яжіться з відправником.', 'Betaal zo snel mogelijk of neem contact op met de afzender.'] },
  betaald: { kleur: 'goed', icoon: '✅', kop: ['Оплачено', 'Betaald'], wat: ['Нічого робити не треба.', 'U hoeft niets te doen.'] },
  'contract-nieuw': { kleur: 'gewoon', icoon: '📄', kop: ['Новий договір', 'Nieuw contract'], wat: ['Перегляньте перед підписом.', 'Lees het na voordat u ondertekent.'] },
  'nieuwe-versie': { kleur: 'let', icoon: '🔁', kop: ['Нова версія документа', 'Nieuwe versie van het document'], wat: ['Подивіться, що змінилося.', 'Bekijk wat er veranderd is.'] },
  verdacht: { kleur: 'fout', icoon: '⚠️', kop: ['Підозрілий файл', 'Verdacht bestand'], wat: ['Не відкривайте на пристрої; перегляньте лише безпечно на сайті.', 'Niet op het toestel openen; bekijk het alleen veilig op de site.'] },
  onleesbaar: { kleur: 'fout', icoon: '❌', kop: ['Файл не вдалося прочитати', 'Bestand kon niet worden gelezen'], wat: ['Оригінал не змінено; відкрийте на сайті й спробуйте ще раз.', 'Het origineel is ongewijzigd; open het op de site en probeer opnieuw.'] },
  foto: { kleur: 'gewoon', icoon: '🖼️', kop: ['Нове зображення', 'Nieuwe afbeelding'], wat: ['Відкрийте, щоб переглянути.', 'Open om te bekijken.'] },
  document: { kleur: 'gewoon', icoon: '📎', kop: ['Нове вкладення', 'Nieuwe bijlage'], wat: ['Відкрийте, щоб переглянути.', 'Open om te bekijken.'] },
};

export type TelegramKaartInvoer = {
  taal: 'uk' | 'nl';
  naam: string;
  /** Вид файла людською мовою (наприклад, з soortVan(...).naam). */
  soortNaam?: string;
  isRekening?: boolean;
  isContract?: boolean;
  isFoto?: boolean;
  /** Сума як уже готовий рядок (як показує сайт); жодних обчислень тут. */
  bedrag?: string;
  /** Строк оплати ISO (РРРР-ММ-ДД). */
  termijnIso?: string;
  betaald?: boolean;
  /** Позначка довіри переглядача: 'gevaar' робить картку «Підозрілий файл». */
  vertrouwen?: 'goed' | 'let-op' | 'gevaar';
  onleesbaar?: boolean;
  /** Є попередня версія того самого документа в розмові. */
  heeftVorigeVersie?: boolean;
  /** Адреса цього ж сайту, яку відкриває кнопка. */
  siteUrl: string;
  /** Для перевірок: «сьогодні». */
  nu?: Date;
};

export type TelegramKaart = {
  staat: TelegramKaartStaat;
  kleur: TelegramKaartKleur;
  hex: string;
  /** Підпис до картки (parse_mode HTML), не довший за 1024 знаки — межа підпису Telegram. */
  onderschrift: string;
  knop: { tekst: string; url: string };
};

const MAX_ONDERSCHRIFT_LENGTE = 1024;

const kies = (taal: 'uk' | 'nl', t: Tekst) => (taal === 'nl' ? t[1] : t[0]);

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Обрізає сирий рядок до вказаної межі кодових одиниць UTF-16 без розрізання сурогатних пар. */
function begrensRuw(s: string, maxEenheden: number, metEllips = false): string {
  if (maxEenheden <= 0) return '';
  if (s.length <= maxEenheden) return s;
  const limiet = metEllips ? Math.max(0, maxEenheden - 1) : maxEenheden;
  let snede = s.slice(0, limiet);
  if (snede.length > 0) {
    const laatste = snede.charCodeAt(snede.length - 1);
    if (laatste >= 0xd800 && laatste <= 0xdbff) {
      snede = snede.slice(0, -1);
    }
  }
  return metEllips ? `${snede}…` : snede;
}

function dagenTot(iso: string, nu: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const doel = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const vandaag = Date.UTC(nu.getFullYear(), nu.getMonth(), nu.getDate());
  return Math.round((doel - vandaag) / 86_400_000);
}

/** Вибір стану: небезпека й помилка мають перевагу, далі оплата і строк, далі вид файла. */
export function telegramKaartStaat(i: TelegramKaartInvoer): TelegramKaartStaat {
  if (i.vertrouwen === 'gevaar') return 'verdacht';
  if (i.onleesbaar) return 'onleesbaar';
  if (i.isRekening) {
    if (i.betaald) return 'betaald';
    const n = i.termijnIso ? dagenTot(i.termijnIso, i.nu ?? new Date()) : null;
    if (n !== null && n < 0) return 'termijn-verlopen';
    if (n === 0) return 'termijn-vandaag';
    if (n !== null && n <= 7) return 'termijn-binnenkort';
    return 'rekening-nieuw';
  }
  if (i.heeftVorigeVersie) return 'nieuwe-versie';
  if (i.isContract) return 'contract-nieuw';
  if (i.isFoto) return 'foto';
  return 'document';
}

/** Перевіряє, чи належить ім'я вузла власному домену платформи (або локальному стенду). */
export function isEigenPlatformHost(hostname: string): boolean {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return false;
  if (dienstVoorHost(h)) return true;
  return h === 'tarasevych.com' || h.endsWith('.tarasevych.com') || h === 'localhost';
}

function veiligeSiteUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return '';
    if (!isEigenPlatformHost(u.hostname)) return '';
    return u.toString();
  } catch {
    return '';
  }
}

export function telegramKaartVoor(i: TelegramKaartInvoer): TelegramKaart {
  const staat = telegramKaartStaat(i);
  const o = TELEGRAM_KAART_STATEN[staat];
  const t = (x: Tekst) => kies(i.taal, x);
  const ruwNaam = String(i.naam ?? '');
  const soortTekst = i.soortNaam ? begrensRuw(String(i.soortNaam), 60, true) : '';
  const bedragTekst = i.isRekening && i.bedrag ? begrensRuw(String(i.bedrag), 48, true) : '';
  const termijnTekst = i.isRekening && i.termijnIso
    ? begrensRuw(String(i.termijnIso).split('-').reverse().join('.'), 32, true)
    : '';

  const bouwOnderschrift = (naamLimiet: number): string => {
    const gekapteNaam = ruwNaam.length > naamLimiet
      ? begrensRuw(ruwNaam, naamLimiet, true)
      : ruwNaam;
    const regels: string[] = [];
    regels.push(`${o.icoon} <b>${escHtml(t(o.kop))}</b>`);
    regels.push(`<i>${escHtml(gekapteNaam)}</i>${soortTekst ? ` · ${escHtml(soortTekst)}` : ''}`);
    if (bedragTekst) regels.push(`${t(['Сума', 'Bedrag'])}: <b>${escHtml(bedragTekst)}</b>`);
    if (termijnTekst) regels.push(`${t(['Строк оплати', 'Betaaltermijn'])}: <b>${escHtml(termijnTekst)}</b>`);
    regels.push(escHtml(t(o.wat)));
    return regels.join('\n');
  };

  let naamLimiet = 180;
  let onderschrift = bouwOnderschrift(naamLimiet);
  while (onderschrift.length > MAX_ONDERSCHRIFT_LENGTE && naamLimiet > 1) {
    const overschot = onderschrift.length - MAX_ONDERSCHRIFT_LENGTE;
    const stap = Math.max(1, Math.floor(overschot / 5));
    naamLimiet = Math.max(1, naamLimiet - stap);
    onderschrift = bouwOnderschrift(naamLimiet);
  }
  if (onderschrift.length > MAX_ONDERSCHRIFT_LENGTE) {
    onderschrift = bouwOnderschrift(0);
  }

  return {
    staat,
    kleur: o.kleur,
    hex: TELEGRAM_KAART_HEX[o.kleur],
    onderschrift,
    knop: { tekst: t(['Відкрити на сайті', 'Openen op de site']), url: veiligeSiteUrl(i.siteUrl) },
  };
}
