// Модульне випробування HERSTEL-001: реєстр і перевірочні контракти чотирьох вад мобільної сторінки входу
// (hub.tarasevych.com) та спадного вікна «Облікові записи», виявлених за трьома знімками екрана власника від 25.11.2026:
//   - Screenshot_20261125_110550_com.android.chrome.jpg (11:05:50 — екран входу);
//   - Screenshot_20261125_110556_com.android.chrome.jpg (11:05:56 — відкрите вікно «Облікові записи» на сторінці входу);
//   - Screenshot_20261125_110620_com.android.chrome.jpg (11:06:20 — екран завантаження / перевірки сеансу).
//
// Nederlands (nl):
// Eenheidstest HERSTEL-001: vastlegging en verificatiecontracten voor de vier mobiele weergave- en aanmeldgebreken
// op hub.tarasevych.com (taalpil 32 px tegenover 44 px, gelijke omvang van het Telegram- en Google-pictogram in de
// aanmeldknoppen, taal-/themarij en dubbele aanmeldknop in AccountMenuV3 vóór aanmelding, en het vermijden van
// drievoudige laadindicatoren plus het bewaren van mr-aanmelden-bezig bij aanmelden vanuit het accountmenu).

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function checker(naam: string) {
  let ok = 0;
  let fout = 0;
  return {
    check(label: string, voorwaarde: boolean) {
      if (voorwaarde) {
        ok += 1;
        console.log(`OK   ${label}`);
      } else {
        fout += 1;
        console.error(`FOUT ${label}`);
      }
    },
    einde(): number {
      console.log(`\n${ok}/${ok + fout} geslaagd (${naam})`);
      return fout === 0 ? 0 : 1;
    },
  };
}

const VERBODEN_TEKENREEKS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const lees = (pad: string): string => readFileSync(resolve(pad), 'utf8');

export type AanmeldGebrekProefId = 'T-1' | 'T-2' | 'T-3' | 'T-4';

export type AanmeldGebrekContract = {
  readonly id: AanmeldGebrekProefId;
  readonly nummer: 1 | 2 | 3 | 4;
  readonly bronFoto: string;
  readonly titelUk: string;
  readonly titelNl: string;
  readonly doelBestanden: readonly string[];
  readonly oorzaakUk: string;
  readonly oorzaakNl: string;
  readonly herstelEisUk: string;
  readonly herstelEisNl: string;
};

export const VIER_AANMELD_GEBREKEN_CONTRACT: readonly AanmeldGebrekContract[] = [
  {
    id: 'T-1',
    nummer: 1,
    bronFoto: 'Screenshot_20261125_110550_com.android.chrome.jpg',
    titelUk: 'Роздута за висотою кнопка мови укр. у верхньому правому куті (44 px замість 32 px)',
    titelNl: 'Te hoge taalpil укр. rechtsboven op het mobiele aanmeldscherm (44 px in plaats van 32 px)',
    doelBestanden: [
      'src/account-afgemeld-menu.css',
      'src/aanmeld-herontwerp.css',
      'src/ontwerp/mobiel.css',
      'src/main.tsx',
    ],
    oorzaakUk:
      'Селектор .canonical-chrome .mr-sign-in-quick-controls button.mr-sign-in-taal у account-afgemeld-menu.css має вагу (0,3,1), рівну загальному мобільному правилу min-height: var(--tik-hoogte-mobiel) (44 px) у ontwerp/mobiel.css, яке імпортується в main.tsx пізніше й перебиває висоту 32 px.',
    oorzaakNl:
      'De selector .canonical-chrome .mr-sign-in-quick-controls button.mr-sign-in-taal in account-afgemeld-menu.css heeft specificiteit (0,3,1), gelijk aan de algemene mobiele tikregel min-height: var(--tik-hoogte-mobiel) (44 px) in ontwerp/mobiel.css die in main.tsx later wordt geladen.',
    herstelEisUk:
      'Мобільний селектор для button.mr-sign-in-taal має мати вагу суворо вищу за (0,3,1), видиму висоту рівно 32 px та невидиму зону дотику ::after висотою не менше 44 px.',
    herstelEisNl:
      'De mobiele selector voor button.mr-sign-in-taal moet een hogere specificiteit dan (0,3,1) hebben, een zichtbare hoogte van 32 px behouden en een onzichtbaar tikvlak ::after van ten minste 44 px bieden.',
  },
  {
    id: 'T-2',
    nummer: 2,
    bronFoto: 'Screenshot_20261125_110550_com.android.chrome.jpg',
    titelUk: 'Невідповідний розмір значка Telegram (22 px) порівняно зі значком Google (34 px) у кнопках входу',
    titelNl: 'Afwijkende omvang van het Telegram-pictogram (22 px) ten opzichte van het Google-kenmerk (34 px) in de aanmeldknoppen',
    doelBestanden: [
      'src/telegram-aanmelden/AanmeldTelegram.tsx',
      'src/telegram-aanmelden/telegram.css',
      'src/aanmeld-herontwerp.css',
    ],
    oorzaakUk:
      'Обидві головні кнопки входу стоять одна під одною із сіткою 34px minmax(0,1fr) 34px, але .mr-sign-in-logo має 34x34 px (30x30 px при <= 380 px), тоді як .tga-aanmeld-logo має 24-28 px і вкладений <TelegramLogo maat={22} /> лише 22x22 px.',
    oorzaakNl:
      'Beide hoofdknoppen gebruiken het drievoudige rooster 34px minmax(0,1fr) 34px, maar .mr-sign-in-logo is 34x34 px (30x30 px bij <= 380 px) terwijl .tga-aanmeld-logo 24-28 px is met een ingesloten <TelegramLogo maat={22} /> van 22x22 px.',
    herstelEisUk:
      'На екрані входу (.canonical-signed-out.mr-sign-in) значок .tga-aanmeld-logo та його кругла основа мають збігатися за зовнішнім діаметром із .mr-sign-in-logo: 34x34 px (та 30x30 px при <= 380 px).',
    herstelEisNl:
      'Op het aanmeldscherm (.canonical-signed-out.mr-sign-in) moeten .tga-aanmeld-logo en het ronde Telegram-pictogram exact dezelfde buitenmaat hebben als .mr-sign-in-logo: 34x34 px (en 30x30 px bij <= 380 px).',
  },
  {
    id: 'T-3',
    nummer: 3,
    bronFoto: 'Screenshot_20261125_110556_com.android.chrome.jpg',
    titelUk: 'Вікно «Облікові записи» на сторінці входу: скорочення «нід.», тісний рядок «Тема» та дублювання кнопок входу',
    titelNl: 'Venster «Accounts» op het aanmeldscherm: afkorting «нід.», krappe themarij en dubbele aanmeldknoppen',
    doelBestanden: [
      'src/accountmenu-v3/AccountMenuV3.tsx',
      'src/accountmenu-v3/accountmenu-v3.css',
    ],
    oorzaakUk:
      'У рядку мови AccountMenuV3.tsx поруч із повною назвою «Українська» стоїть скорочення з малої літери «нід.», у шапці до входу (!displayUser && visibleRows.length === 0) кнопка + дублює кнопку «Увійти в обліковий запис», а в рядку теми стиснуто підпис, 4 сегменти з текстом «За добою» і 2 круглі кнопки.',
    oorzaakNl:
      'In de taalrij van AccountMenuV3.tsx staat naast het volledige «Українська» de kleine-letterafkorting «нід.», in de kop vóór aanmelding (!displayUser && visibleRows.length === 0) dupliceert de +-knop de hoofdknop, en de themarij perst label, 4 segmenten met tekst en 2 ronde knoppen op één regel.',
    herstelEisUk:
      'Рівноправні підписи мов з великої літери без обрізаного «нід.», відсутність дублювання кнопки + біля порожнього силуету без збережених записів та охайне розміщення рядка теми на вузькому екрані.',
    herstelEisNl:
      'Evenwichtige taalnamen met hoofdletter zonder het afgekorte «нід.», geen dubbele +-knop naast het lege profielsilhouet zonder bewaarde accounts, en een passende themarij op smalle schermen.',
  },
  {
    id: 'T-4',
    nummer: 4,
    bronFoto: 'Screenshot_20261125_110620_com.android.chrome.jpg',
    titelUk: 'Потрійний покажчик завантаження, стрибок верхнього кута та втрата позначки активного входу при вході з меню профілю',
    titelNl: 'Drievoudige laadindicator, verspringende bovenhoek en ontbrekende mr-aanmelden-bezig bij aanmelden vanuit het accountmenu',
    doelBestanden: [
      'index.html',
      'src/navigatie-snel.ts',
      'src/aanmeld-omleiding.ts',
      'src/CanoniekOmlijsting.tsx',
    ],
    oorzaakUk:
      'Під час #boot-shell та .canonical-signed-out.checking одночасно показуються верхня смуга поступу (36%), капсула #tsv-laad-kapsel («Завантаження…») і велике центральне кільце, у верхньому куті зникають кнопки мови й теми, а вхід через меню профілю (onAddAccount -> startPrimaryRedirectLogin) не виставляє mr-aanmelden-bezig.',
    oorzaakNl:
      'Tijdens #boot-shell en .canonical-signed-out.checking verschijnen tegelijk de bovenbalk (36%), de laadkapsel #tsv-laad-kapsel en de grote middenspinner, verdwijnen taal- en themaknop rechtsboven, en zet aanmelden vanuit het accountmenu (onAddAccount -> startPrimaryRedirectLogin) geen mr-aanmelden-bezig.',
    herstelEisUk:
      'Запуск входу через startPrimaryRedirectLogin (intent === "login") має виставляти позначку активного входу mr-aanmelden-bezig, а під час показу центрального кільця #boot-shell чи .canonical-signed-out.checking капсула #tsv-laad-kapsel не повинна дублювати другий круговий покажчик на порожньому екрані.',
    herstelEisNl:
      'Aanmelden via startPrimaryRedirectLogin (intent === "login") moet mr-aanmelden-bezig vastleggen, en wanneer #boot-shell of .canonical-signed-out.checking al een middenspinner toont mag #tsv-laad-kapsel geen tweede draaiwiel erboven tonen.',
  },
] as const;

export type HerstelProefStatus = {
  readonly id: AanmeldGebrekProefId;
  readonly hersteld: boolean;
  readonly details: string;
};

/** Перевіряє стан виправлення всіх чотирьох вад (використовується під час впровадження виправлення). */
export function evalueerVierAanmeldGebrekenHerstel(): readonly HerstelProefStatus[] {
  const afgemeldCss = lees('src/account-afgemeld-menu.css');
  const aanmeldCss = lees('src/aanmeld-herontwerp.css');
  const telegramCss = lees('src/telegram-aanmelden/telegram.css');
  const telegramTsx = lees('src/telegram-aanmelden/AanmeldTelegram.tsx');
  const am3Tsx = lees('src/accountmenu-v3/AccountMenuV3.tsx');
  const omleidingTs = lees('src/aanmeld-omleiding.ts');
  const navSnelTs = lees('src/navigatie-snel.ts');
  const indexHtml = lees('index.html');

  // T-1: селектор для .mr-sign-in-taal на мобільному має вагу > (0,3,1) (наприклад, .canonical-chrome:has(.mr-sign-in) ... або подвоєний клас)
  const t1Hersteld =
    /\.canonical-chrome(?::has\(\.mr-sign-in\)|\.canonical-chrome)\s+\.mr-sign-in-quick-controls\s+button\.mr-sign-in-taal/.test(
      afgemeldCss,
    ) ||
    /\.canonical-chrome(?::has\(\.mr-sign-in\)|\.canonical-chrome)\s+\.mr-sign-in-quick-controls\s+button\.mr-sign-in-taal/.test(
      aanmeldCss,
    );

  // T-2: значок Telegram на екрані входу має діаметр 34px (та 30px на <= 380px), узгоджений із Google
  const t2Hersteld =
    /\.canonical-signed-out\.mr-sign-in\s+\.tga-aanmeld-logo\s*\{[^}]*width:\s*34px[^}]*height:\s*34px/.test(aanmeldCss) ||
    /\.tga-aanmeld-logo\s*\{[^}]*width:\s*34px[^}]*height:\s*34px/.test(telegramCss) ||
    /maat=\{34\}/.test(telegramTsx);

  // T-3: у AccountMenuV3 немає обрізаного 'нід.' з малої літери поруч із 'Українська', а кнопка + не дублюється при !displayUser && visibleRows.length === 0
  const t3GeenKleineNid = !/uk\s*\?\s*'нід\.'\s*:\s*'Nederlands'/.test(am3Tsx);
  const t3GeenDubbelePlus =
    /\(displayUser\s*\|\|\s*visibleRows\.length\s*>\s*0\)/.test(am3Tsx) &&
    am3Tsx.indexOf('am3-orbit-wing is-right') > 0;
  const t3Hersteld = t3GeenKleineNid && t3GeenDubbelePlus;

  // T-4: startPrimaryRedirectLogin виставляє mr-aanmelden-bezig (або zetAanmeldenBezig), а капсула не дублює #boot-shell / .canonical-signed-out.checking
  const t4AanmeldenBezig =
    omleidingTs.includes('mr-aanmelden-bezig') ||
    omleidingTs.includes('zetAanmeldenBezig') ||
    omleidingTs.includes('AANMELD_BEZIG_SLEUTEL');
  const t4GeenDubbeleSpinner =
    !navSnelTs.includes("':scope > .canonical-signed-out.checking'") ||
    indexHtml.includes('boot-active') && navSnelTs.includes('boot-shell');
  const t4Hersteld = t4AanmeldenBezig && t4GeenDubbeleSpinner;

  return [
    {
      id: 'T-1',
      hersteld: t1Hersteld,
      details: t1Hersteld
        ? 'Мобільний селектор button.mr-sign-in-taal має вагу > (0,3,1) і зберігає висоту 32 px'
        : 'Очікує на підвищення ваги селектора button.mr-sign-in-taal понад (0,3,1)',
    },
    {
      id: 'T-2',
      hersteld: t2Hersteld,
      details: t2Hersteld
        ? 'Значок Telegram на екрані входу узгоджено за діаметром 34x34 px (30x30 px <= 380 px) зі значком Google'
        : 'Очікує на вирівнювання діаметра .tga-aanmeld-logo (22-28 px -> 34 px) зі значком Google',
    },
    {
      id: 'T-3',
      hersteld: t3Hersteld,
      details: t3Hersteld
        ? 'У AccountMenuV3 узгоджено назви мов, рядок теми та усунено дублювання кнопки + до входу'
        : 'Очікує на заміну скорочення «нід.» та прибирання дубльованої кнопки + до входу в AccountMenuV3',
    },
    {
      id: 'T-4',
      hersteld: t4Hersteld,
      details: t4Hersteld
        ? 'Позначка mr-aanmelden-bezig встановлюється при будь-якому вході, потрійний покажчик завантаження усунено'
        : 'Очікує на запис mr-aanmelden-bezig у startPrimaryRedirectLogin та узгодження покажчиків завантаження',
    },
  ];
}

export async function main(): Promise<number> {
  const { check, einde } = checker('herstel-001-aanmelden-mobiel-vier-gebreken');

  // 1. Повнота реєстру чотирьох виявлених за знімками екрана проблем
  check(
    'реєстр містить рівно 4 перевірочні контракти (T-1, T-2, T-3, T-4)',
    VIER_AANMELD_GEBREKEN_CONTRACT.length === 4 &&
      VIER_AANMELD_GEBREKEN_CONTRACT.map((c) => c.id).join(',') === 'T-1,T-2,T-3,T-4',
  );

  for (const contract of VIER_AANMELD_GEBREKEN_CONTRACT) {
    check(
      `${contract.id}: усі цільові файли існують у сховищі (${contract.doelBestanden.join(', ')})`,
      contract.doelBestanden.length > 0 && contract.doelBestanden.every((pad) => existsSync(resolve(pad))),
    );
    check(
      `${contract.id}: двомовні описи (uk / nl) заповнені й не містять заборонених символів`,
      contract.titelUk.length > 15 &&
        contract.titelNl.length > 15 &&
        contract.oorzaakUk.length > 30 &&
        contract.oorzaakNl.length > 30 &&
        contract.herstelEisUk.length > 25 &&
        contract.herstelEisNl.length > 25 &&
        !VERBODEN_TEKENREEKS.test(contract.titelUk + contract.oorzaakUk + contract.herstelEisUk),
    );
  }

  // 2. Перевірка T-1: кнопка мови у верхньому правому куті сторінки входу
  const mainTsx = lees('src/main.tsx');
  const mobielCss = lees('src/ontwerp/mobiel.css');
  const afgemeldCss = lees('src/account-afgemeld-menu.css');
  const aanmeldCss = lees('src/aanmeld-herontwerp.css');

  check(
    'T-1: main.tsx імпортує ontwerp/fundament.css (з mobiel.css) після App.tsx та CanoniekAccountMenu.tsx',
    mainTsx.indexOf("import App from './App'") < mainTsx.indexOf("import './ontwerp/fundament.css'"),
  );
  check(
    'T-1: mobiel.css містить загальне мобільне правило min-height:var(--tik-hoogte-mobiel) із трьома :not(...)',
    mobielCss.includes(':not(:has(> svg:only-child)):not(.is-icoon):not([role=switch], [role=checkbox], [role=radio])') &&
      mobielCss.includes('min-height:var(--tik-hoogte-mobiel)'),
  );
  check(
    'T-1: стилі кнопки .mr-sign-in-taal задають цільову висоту 32px та сенсорне розширення ::after',
    afgemeldCss.includes('button.mr-sign-in-taal') &&
      afgemeldCss.includes('min-height:32px;height:32px') &&
      afgemeldCss.includes('button.mr-sign-in-taal::after') &&
      aanmeldCss.includes('.mr-sign-in-quick-controls .mr-sign-in-taal'),
  );
  const moviPraporTsx = lees('src/MoviPrapor.tsx');
  check(
    'T-1: скорочені та повні назви мов у MoviPrapor відповідають мовному закону (укр. / NL, Українська / Nederlands)',
    moviPraporTsx.includes("uk: 'укр.'") &&
      moviPraporTsx.includes("nl: 'NL'") &&
      moviPraporTsx.includes("uk: 'Українська'") &&
      moviPraporTsx.includes("nl: 'Nederlands'"),
  );

  // 3. Перевірка T-2: геометрія значків Google і Telegram у кнопках входу
  const telegramCss = lees('src/telegram-aanmelden/telegram.css');
  const telegramTsx = lees('src/telegram-aanmelden/AanmeldTelegram.tsx');

  check(
    'T-2: обидві кнопки входу (.mr-sign-in-main-button і .tga-aanmeld-knop) мають триколонкову сітку 34px minmax(0,1fr) 34px',
    aanmeldCss.includes('.canonical-signed-out.mr-sign-in .mr-sign-in-main-button') &&
      aanmeldCss.includes('.canonical-signed-out.mr-sign-in .tga-aanmeld-knop') &&
      aanmeldCss.includes('grid-template-columns:34px minmax(0,1fr) 34px') &&
      aanmeldCss.includes('.mr-sign-in-logo{display:grid;place-items:center;flex:none;width:34px;height:34px'),
  );
  check(
    'T-2: компонент AanmeldTelegram містить контейнер .tga-aanmeld-logo з компонентом TelegramLogo',
    telegramTsx.includes("className='tga-aanmeld-logo'") &&
      telegramTsx.includes('<TelegramLogo') &&
      telegramCss.includes('.tga-aanmeld-logo'),
  );

  // 4. Перевірка T-3: вікно «Облікові записи» (AccountMenuV3) на сторінці входу
  const am3Tsx = lees('src/accountmenu-v3/AccountMenuV3.tsx');
  const am3Css = lees('src/accountmenu-v3/accountmenu-v3.css');

  check(
    'T-3: AccountMenuV3 містить рядок теми (.am3-pref-row.is-theme-row), рядок мови (.am3-pref-row.is-lang-row) та шапку орбіти (.am3-orbit-stage)',
    am3Tsx.includes("className='am3-pref-row is-theme-row'") &&
      am3Tsx.includes("className='am3-pref-row is-lang-row'") &&
      am3Tsx.includes("className='am3-orbit-stage'") &&
      am3Css.includes('.am3-pref-row.is-theme-row'),
  );

  // 5. Перевірка T-4: покажчики завантаження (#boot-shell, #tsv-voortgang, #tsv-laad-kapsel) та позначка активного входу
  const indexHtml = lees('index.html');
  const navSnelTs = lees('src/navigatie-snel.ts');
  const omlijstingTsx = lees('src/CanoniekOmlijsting.tsx');
  const omleidingTs = lees('src/aanmeld-omleiding.ts');

  check(
    'T-4: ключ активного входу AANMELD_BEZIG_SLEUTEL та тривалість 5 хвилин визначені у CanoniekOmlijsting.tsx',
    omlijstingTsx.includes("AANMELD_BEZIG_SLEUTEL='mr-aanmelden-bezig'") &&
      omlijstingTsx.includes('AANMELD_BEZIG_MS=5*60_000') &&
      omlijstingTsx.includes('export function aanmeldenBezig') &&
      omlijstingTsx.includes('export function zetAanmeldenBezig') &&
      omleidingTs.includes('export async function startPrimaryRedirectLogin'),
  );
  check(
    'T-4: двомовні підписи капсули завантаження (Завантаження… / Laden…) синхронні між index.html та navigatie-snel.ts',
    navSnelTs.includes('export function laadKapselKorteTekst') &&
      navSnelTs.includes('export function laadKapselTekst') &&
      navSnelTs.includes("'Завантаження…'") &&
      navSnelTs.includes("'Laden…'") &&
      indexHtml.includes('tsv-laad-kapsel') &&
      indexHtml.includes('tsv-voortgang') &&
      navSnelTs.includes('paginaHeeftZichtbareInhoud'),
  );

  const herstelOverzicht = evalueerVierAanmeldGebrekenHerstel();
  check(
    'функція оцінювання стану виправлення evalueerVierAanmeldGebrekenHerstel повертає звіти для всіх 4 пунктів',
    herstelOverzicht.length === 4 && herstelOverzicht.every((item) => item.details.length > 10),
  );

  // 6. Перевірка парної двомовної документації випробувань у docs/identiteit/
  const docUkPad = 'docs/identiteit/ВИПРОБУВАННЯ-4-ВАД-МОБІЛЬНОГО-ВХОДУ-HERSTEL-001.uk.md';
  const docMdPad = 'docs/identiteit/ВИПРОБУВАННЯ-4-ВАД-МОБІЛЬНОГО-ВХОДУ-HERSTEL-001.md';
  const docNlPad = 'docs/identiteit/PROEVEN-4-MOBIELE-AANMELDGEBREKEN-HERSTEL-001.nl.md';
  check(
    'парні статті випробувань (uk / nl) існують у docs/identiteit/ і посилаються одна на одну',
    existsSync(resolve(docUkPad)) &&
      existsSync(resolve(docMdPad)) &&
      existsSync(resolve(docNlPad)) &&
      lees(docUkPad).includes('PROEVEN-4-MOBIELE-AANMELDGEBREKEN-HERSTEL-001.nl.md') &&
      lees(docNlPad).includes('ВИПРОБУВАННЯ-4-ВАД-МОБІЛЬНОГО-ВХОДУ-HERSTEL-001.uk.md') &&
      !VERBODEN_TEKENREEKS.test(lees(docUkPad) + lees(docNlPad)),
  );

  return einde();
}
