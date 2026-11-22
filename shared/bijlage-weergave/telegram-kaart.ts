// НЕ ПЕРЕВІРЕНО (очікує перевірки наступним агентом): тести, перевірку типів і складання не проганяли
// за прямою вказівкою власника (режим економії ліміту, 22.11.2026).
// Виконавець: Claude Opus 5.5 (High) через Google Antigravity (antigravity).
//
// Картка вкладення в Telegram-боті — ОКРЕМА для кожного стану, а не одна спільна.
// Відповідь Павла на питання 4 (22.11.2026, UTC+1): «так, окрім того, на кожний стан має бути своя картка, а не універсальна».
//
// Чистий модуль без залежностей: лише вибір стану й складання тексту картки. До бота ще НЕ підключено:
// у цій гілці немає шляху, яким бот надсилає сповіщення з вкладеннями (є лише картки входу в
// backend/telegram-aanmelden/kaarten.ts — їх можна взяти за зразок для малюнка картки, кольори ті самі за змістом).
//
// Правила:
//   • вміст файла в Telegram НЕ передаємо — лише назву, вид, суму, строк і кнопку «Відкрити на сайті»;
//   • колір за змістом, однаковий з усім сайтом: зелений — успіх, помаранчевий — увага, червоний — небезпека чи прострочено,
//     синій — звичайне нове;
//   • кожен стан має свій заголовок, свій значок, своє пояснення «що це» і свою підказку «що робити»;
//   • текст екрановано для parse_mode HTML.

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

const kies = (taal: 'uk' | 'nl', t: Tekst) => (taal === 'nl' ? t[1] : t[0]);

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

function veiligeSiteUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

export function telegramKaartVoor(i: TelegramKaartInvoer): TelegramKaart {
  const staat = telegramKaartStaat(i);
  const o = TELEGRAM_KAART_STATEN[staat];
  const t = (x: Tekst) => kies(i.taal, x);
  const regels: string[] = [];
  regels.push(`${o.icoon} <b>${escHtml(t(o.kop))}</b>`);
  regels.push(`<i>${escHtml(i.naam.slice(0, 180))}</i>${i.soortNaam ? ` · ${escHtml(i.soortNaam)}` : ''}`);
  if (i.isRekening && i.bedrag) regels.push(`${t(['Сума', 'Bedrag'])}: <b>${escHtml(i.bedrag)}</b>`);
  if (i.isRekening && i.termijnIso) regels.push(`${t(['Строк оплати', 'Betaaltermijn'])}: <b>${escHtml(i.termijnIso.split('-').reverse().join('.'))}</b>`);
  regels.push(escHtml(t(o.wat)));
  let onderschrift = regels.join('\n');
  if (onderschrift.length > 1024) onderschrift = `${onderschrift.slice(0, 1020)}…`;
  return {
    staat,
    kleur: o.kleur,
    hex: TELEGRAM_KAART_HEX[o.kleur],
    onderschrift,
    knop: { tekst: t(['Відкрити на сайті', 'Openen op de site']), url: veiligeSiteUrl(i.siteUrl) },
  };
}
