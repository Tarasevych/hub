// Модульне випробування HERSTEL-001: реєстр і перевірочні контракти чотирьох вад мобільної сторінки входу
// (hub.tarasevych.com) та спадного вікна «Облікові записи», виявлених за трьома знімками екрана власника від 25.11.2026:
//   - Screenshot_20261125_110550_com.android.chrome.jpg (11:05:50 — екран входу);
//   - Screenshot_20261125_110556_com.android.chrome.jpg (11:05:56 — відкрите вікно «Облікові записи» на сторінці входу);
//   - Screenshot_20261125_110620_com.android.chrome.jpg (11:06:20 — екран завантаження / перевірки сеансу).
//
// Nederlands (nl):
// Eenheidstest HERSTEL-001: vastlegging en verificatiecontracten voor de vier mobiele weergave- en aanmeldgebreken
// op hub.tarasevych.com met volledig behoud van de ontwerpbeginselen van de eigenaar (K1-T1: taalpil met vlag + korte naam
// op gelijke hoogte 38 px; T-2: gelijke omvang van het Telegram- en Google-medaillon 34/30 px; K1-T3: altijd zichtbare
// orbitale +-knop, hoofdletter «Нід.» en tweeregelige themarij op <= 700 px; K1-T4: volledig zichtbare laadindicatoren
// #tsv-voortgang, #tsv-laad-kapsel en .canonical-boot-spin, gelijkgetrokken .canonical-boot-account 38×38 px en
// mr-aanmelden-bezig in startPrimaryRedirectLogin).

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
    titelUk: 'Різнобій висоти й поверхні капсули мови «укр.» поруч із круглими кнопками теми та профілю у верхньому правому куті (K1-T1)',
    titelNl: 'Afwijkende hoogte en oppervlakte van de taalpil «укр.» naast de ronde knoppen voor thema en profiel rechtsboven (K1-T1)',
    doelBestanden: [
      'src/CanoniekAccountMenu.tsx',
      'src/account-afgemeld-menu.css',
      'src/aanmeld-herontwerp.css',
      'src/ontwerp/mobiel.css',
      'src/main.tsx',
    ],
    oorzaakUk:
      'Текстово-графічна капсула мови з прапором і підписом «укр.» потрапляла під загальне мобільне правило 44 px ваги (0,3,1) у ontwerp/mobiel.css, а сусідні кнопки теми й профілю не мали єдиної з нею висоти та поверхні.',
    oorzaakNl:
      'De taalpil met vlag en «укр.» viel onder de algemene mobiele tikregel van 44 px met specificiteit (0,3,1) in ontwerp/mobiel.css, terwijl thema en profiel niet op één gelijke hoogte en één kaartvlak waren afgestemd.',
    herstelEisUk:
      'Зберегти компактну капсулу мови (прапор + «укр.» / «NL», без .is-icoon) зі спадним меню повних самоназв мов і позначкою активної мови; зрівняти капсулу мови, кнопку теми та кнопку профілю до єдиної висоти 38 px (R = 19 px), єдиної поверхні var(--mr-login-card), рамки 1px solid var(--mr-login-border), контрастного кольору var(--mr-login-ink), селектора ваги (0,4,1) та сенсорної зони ::after (inset: -3px, 44 px).',
    herstelEisNl:
      'Behoud de compacte taalpil (vlag + «укр.» / «NL», zonder .is-icoon) met het compacte keuzemenu met volledige taalnamen en vinkje; breng taalpil, themaknop en profielknop op één gelijke hoogte van 38 px (R = 19 px), één vlak var(--mr-login-card), rand 1px solid var(--mr-login-border), contrastkleur var(--mr-login-ink), specificiteit (0,4,1) en een tikvlak van 44 px via ::after (inset: -3px).',
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
      'Обидві головні кнопки входу стоять одна під одною із сіткою 34px minmax(0,1fr) 34px, але .mr-sign-in-logo має 34x34 px (30x30 px при <= 380 px), тоді як .tga-aanmeld-logo мав менший розмір і не мав max-width: 100% на вузьких екранах.',
    oorzaakNl:
      'Beide hoofdknoppen gebruiken het drievoudige rooster 34px minmax(0,1fr) 34px, maar .mr-sign-in-logo is 34x34 px (30x30 px bij <= 380 px) terwijl .tga-aanmeld-logo kleiner was en geen max-width: 100% had op smalle schermen.',
    herstelEisUk:
      'На екрані входу (.canonical-signed-out.mr-sign-in) значок .tga-aanmeld-logo та його кругла основа мають збігатися за зовнішнім діаметром із .mr-sign-in-logo: 34x34 px (та 30x30 px із max-width: 100%; max-height: 100% при <= 380 px).',
    herstelEisNl:
      'Op het aanmeldscherm (.canonical-signed-out.mr-sign-in) moeten .tga-aanmeld-logo en het ronde Telegram-pictogram exact dezelfde buitenmaat hebben als .mr-sign-in-logo: 34x34 px (en 30x30 px met max-width: 100%; max-height: 100% bij <= 380 px).',
  },
  {
    id: 'T-3',
    nummer: 3,
    bronFoto: 'Screenshot_20261125_110556_com.android.chrome.jpg',
    titelUk: 'Вікно «Облікові записи» на сторінці входу: скорочення «нід.» з малої літери та тіснота рядка теми на смартфонах при збереженні орбіти + (K1-T3)',
    titelNl: 'Venster «Accounts» op het aanmeldscherm: kleine letter «нід.» en krappe themarij op telefoons met behoud van +-baan (K1-T3)',
    doelBestanden: [
      'src/accountmenu-v3/AccountMenuV3.tsx',
      'src/accountmenu-v3/accountmenu-v3.css',
    ],
    oorzaakUk:
      'У компактному рядку мови AccountMenuV3.tsx поруч із назвою «Українська» стояло скорочення з малої літери «нід.», а дволінійна адаптація рядка теми обмежувалася <= 420 px і не охоплювала екрани 432–460 CSS px.',
    oorzaakNl:
      'In de compacte taalrij van AccountMenuV3.tsx stond naast «Українська» de kleine-letterafkorting «нід.», terwijl de tweeregelige opmaak van de themarij tot <= 420 px beperkt was en schermen van 432–460 CSS px miste.',
    herstelEisUk:
      'Виправити скорочення на «Нід.» з великої літери, повністю зберегти завжди видимий орбітальний кружечок + для додавання облікового запису й компактний однорядковий перемикач мови та перенести дволінійну розкладку .is-theme-row (1 : 2.1) на @media (max-width: 700px).',
    herstelEisNl:
      'Corrigeer de afkorting naar «Нід.» met hoofdletter, behoud de altijd zichtbare orbitale +-knop en de compacte eenregelige taalkeuze en pas de tweeregelige opmaak van .is-theme-row (1 : 2.1) toe op @media (max-width: 700px).',
  },
  {
    id: 'T-4',
    nummer: 4,
    bronFoto: 'Screenshot_20261125_110620_com.android.chrome.jpg',
    titelUk: 'Стрибок значка профілю в заставці та втрата позначки активного входу при повному збереженні всіх елементів завантаження (K1-T4)',
    titelNl: 'Verspringend profielicoon tijdens opstarten en ontbrekende mr-aanmelden-bezig met volledig behoud van alle laadonderdelen (K1-T4)',
    doelBestanden: [
      'index.html',
      'src/navigatie-snel.ts',
      'src/aanmeld-omleiding.ts',
      'src/CanoniekOmlijsting.tsx',
    ],
    oorzaakUk:
      'Початковий значок профілю .canonical-boot-account мав інший розмір і відступ відносно кнопки профілю 38×38 px за 24 px від правого краю, а вхід через меню профілю (startPrimaryRedirectLogin) раніше не виставляв mr-aanmelden-bezig.',
    oorzaakNl:
      'Het initiële profielicoon .canonical-boot-account week in maat en afstand af van de profielknop van 38×38 px op 24 px van rechts, terwijl startPrimaryRedirectLogin eerder geen mr-aanmelden-bezig vastlegde.',
    herstelEisUk:
      'Вирівняти мобільний .canonical-boot-account до 38×38 px (top: 14px; right: 24px), виставляти mr-aanmelden-bezig у startPrimaryRedirectLogin та повністю зберегти видимими без приховування смужку #tsv-voortgang, капсулу #tsv-laad-kapsel і кільце .canonical-boot-spin.',
    herstelEisNl:
      'Trek de mobiele .canonical-boot-account gelijk op 38×38 px (top: 14px; right: 24px), leg mr-aanmelden-bezig vast in startPrimaryRedirectLogin en behoud #tsv-voortgang, #tsv-laad-kapsel en .canonical-boot-spin volledig zichtbaar.',
  },
] as const;

export type HerstelProefStatus = {
  readonly id: AanmeldGebrekProefId;
  readonly hersteld: boolean;
  readonly details: string;
};

/** Перевіряє стан виправлення всіх чотирьох вад (T-1..T-4) із дотриманням інваріантів K1-T1, K1-T3, K1-T4. */
export function evalueerVierAanmeldGebrekenHerstel(): readonly HerstelProefStatus[] {
  const menuTsx = lees('src/CanoniekAccountMenu.tsx');
  const afgemeldCss = lees('src/account-afgemeld-menu.css');
  const aanmeldCss = lees('src/aanmeld-herontwerp.css');
  const telegramTsx = lees('src/telegram-aanmelden/AanmeldTelegram.tsx');
  const am3Tsx = lees('src/accountmenu-v3/AccountMenuV3.tsx');
  const am3Css = lees('src/accountmenu-v3/accountmenu-v3.css');
  const omleidingTs = lees('src/aanmeld-omleiding.ts');
  const indexHtml = lees('index.html');

  // T-1 (K1-T1): капсула мови (прапор + підпис укр./NL, без .is-icoon) + круглі кнопки теми й профілю єдиної висоти 38 px,
  // сенсорна зона ::after inset: -3px, селектор ваги (0,4,1), контрастний колір без #f59e0b та спадне меню мов із галочкою.
  const t1Hersteld =
    menuTsx.includes("className='mr-sign-in-taal'") &&
    !menuTsx.includes('mr-sign-in-taal is-icoon') &&
    /<button[\s\S]*?className='mr-sign-in-taal'[\s\S]*?<MoviPrapor taal=\{lang\} \/>\s*<b>\{MOVA_NAAM\[lang\]\}<\/b>/.test(menuTsx) &&
    menuTsx.includes("className='mr-sign-in-thema is-icoon'") &&
    menuTsx.includes("className='mr-sign-in-taal-menu'") &&
    menuTsx.includes('mr-sign-in-taal-check') &&
    !aanmeldCss.toLowerCase().includes('#f59e0b') &&
    aanmeldCss.includes('height:38px;min-height:38px;max-height:38px') &&
    aanmeldCss.includes('width:38px;height:38px;min-width:38px;min-height:38px') &&
    aanmeldCss.includes('inset:-3px;border-radius:999px') &&
    afgemeldCss.includes('.canonical-chrome:has(.mr-sign-in) .mr-sign-in-quick-controls button.mr-sign-in-taal{') &&
    afgemeldCss.includes('height:38px;min-height:38px;max-height:38px') &&
    afgemeldCss.includes('inset:-3px;border-radius:999px') &&
    afgemeldCss.includes('inset:-3px;border-radius:50%');

  // T-2: значок Telegram на екрані входу має діаметр 34×34 px, max-width/max-height 100% та 30×30 px при <= 380px, узгоджено з Google
  const t2Hersteld =
    /\.canonical-signed-out\.mr-sign-in\s+\.tga-aanmeld-logo\{[^}]*width:34px;height:34px;flex:0 0 34px;aspect-ratio:1 \/ 1/.test(aanmeldCss) &&
    /\.canonical-signed-out\.mr-sign-in\s+\.tga-aanmeld-logo\s+:is\(\.merk,\.tga-logo,img,svg\)\{[^}]*max-width:100%;max-height:100%;border-radius:50%/.test(aanmeldCss) &&
    /@media\(max-width:380px\)\{[\s\S]*?\.canonical-signed-out\.mr-sign-in\s+\.tga-aanmeld-logo\{width:30px;height:30px;flex:0 0 30px\}/.test(aanmeldCss) &&
    /maat=\{34\}/.test(telegramTsx);

  // T-3 (K1-T3): у AccountMenuV3 підпис 'Нід.' з великої літери, орбітальний + ЗАВЖДИ видимий без умов displayUser/visibleRows,
  // перемикач мови лишається компактним однорядковим, а .is-theme-row адаптується у 2 лінії (1 : 2.1) на @media (max-width: 700px).
  const t3GeenKleineNid =
    !/uk\s*\?\s*'нід\.'\s*:\s*'Nederlands'/.test(am3Tsx) &&
    am3Tsx.includes("uk ? 'Українська' : 'Oekr.'") &&
    am3Tsx.includes("uk ? 'Нід.' : 'Nederlands'");
  const rechterVleugelMatch = /<div className='am3-orbit-wing is-right'>([\s\S]*?)<\/div>/.exec(am3Tsx);
  const rechterVleugelInhoud = rechterVleugelMatch?.[1] || '';
  const t3OrbitPlusBehouden =
    rechterVleugelInhoud.includes("className='am3-orbit-node is-add'") &&
    !/displayUser|visibleRows/.test(rechterVleugelInhoud) &&
    !/\(displayUser\s*\|\|\s*visibleRows\.length\s*>\s*0\)\s*[?&]+\s*\(\s*<div className='am3-orbit-wing is-right'/.test(am3Tsx);
  const t3CompactBehouden = !/\.am3-pref-row\.is-lang-row\s+\.am3-seg\s*\{[^}]*width:\s*100%/.test(am3Css);
  const t3ThemaMobiel700 =
    /@media\s*\(max-width:\s*700px\)\s*\{[\s\S]*?\.am3-pref-row\.is-theme-row\s*\{\s*flex-wrap:\s*wrap;[\s\S]*?\.am3-pref-row\.is-theme-row\s+\.am3-seg-btn\s*\{\s*flex:\s*1\s+1\s+0;\s*\}[\s\S]*?\.am3-pref-row\.is-theme-row\s+\.am3-seg-btn:last-child\s*\{\s*flex:\s*2\.1\s+1\s+0;\s*\}/.test(
      am3Css,
    );
  const t3Hersteld = t3GeenKleineNid && t3OrbitPlusBehouden && t3CompactBehouden && t3ThemaMobiel700;

  // T-4 (K1-T4): startPrimaryRedirectLogin виставляє mr-aanmelden-bezig, .canonical-boot-account має 38×38 px (top: 14px; right: 24px),
  // а #tsv-laad-kapsel, #tsv-voortgang і .canonical-boot-spin повністю збережені видимими без жодного приховування!
  const t4AanmeldenBezig =
    omleidingTs.includes('mr-aanmelden-bezig') ||
    omleidingTs.includes('zetAanmeldenBezig') ||
    omleidingTs.includes('AANMELD_BEZIG_SLEUTEL');
  const t4BootAccountGelijk = indexHtml.includes('.canonical-boot-account{top:14px;right:24px;width:38px;height:38px}');
  const t4KapselBehouden =
    !indexHtml.includes('html.boot-active #tsv-laad-kapsel') &&
    !aanmeldCss.includes('#tsv-laad-kapsel') &&
    indexHtml.includes('#tsv-laad-kapsel{position:fixed;') &&
    indexHtml.includes('opacity:1;visibility:visible') &&
    indexHtml.includes("#tsv-voortgang[data-staat='opstart']{opacity:1}") &&
    indexHtml.includes('.canonical-boot-spin{display:block;width:30px;height:30px;');
  const t4Hersteld = t4AanmeldenBezig && t4BootAccountGelijk && t4KapselBehouden;

  return [
    {
      id: 'T-1',
      hersteld: t1Hersteld,
      details: t1Hersteld
        ? 'Капсулу мови (прапор + укр./NL) та круглі кнопки теми й профілю узгоджено на єдиній висоті 38 px (сенсорна зона 44 px, спадне меню мов)'
        : 'Очікує на узгодження капсули мови (прапор + укр./NL) та круглих кнопок теми й профілю на висоті 38 px',
    },
    {
      id: 'T-2',
      hersteld: t2Hersteld,
      details: t2Hersteld
        ? 'Значок Telegram на екрані входу узгоджено за діаметром 34x34 px (30x30 px <= 380 px) зі значком Google'
        : 'Очікує на вирівнювання діаметра .tga-aanmeld-logo (34x34 px / 30x30 px) зі значком Google',
    },
    {
      id: 'T-3',
      hersteld: t3Hersteld,
      details: t3Hersteld
        ? 'У AccountMenuV3 збережено завжди видимий +, виправлено підпис «Нід.» та розкладено рядок теми у 2 лінії на <= 700 px'
        : 'Очікує на узгодження орбіти +, підпису «Нід.» та дволінійної розкладки рядка теми на <= 700 px',
    },
    {
      id: 'T-4',
      hersteld: t4Hersteld,
      details: t4Hersteld
        ? 'Позначка mr-aanmelden-bezig зберігається, значок заставки 38×38 px узгоджено, смужку, капсулу й кільце завантаження збережено'
        : 'Очікує на узгодження значка заставки 38×38 px, запису mr-aanmelden-bezig та повного збереження покажчиків завантаження',
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

  // 2. Перевірка T-1 (K1-T1): капсула мови 38 px + круглі кнопки теми й профілю 38×38 px та спадне меню мов
  const mainTsx = lees('src/main.tsx');
  const mobielCss = lees('src/ontwerp/mobiel.css');
  const afgemeldCss = lees('src/account-afgemeld-menu.css');
  const aanmeldCss = lees('src/aanmeld-herontwerp.css');
  const menuTsx = lees('src/CanoniekAccountMenu.tsx');

  check(
    'T-1: main.tsx імпортує ontwerp/fundament.css (з mobiel.css) після App.tsx та CanoniekAccountMenu.tsx',
    mainTsx.indexOf("import App from './App'") < mainTsx.indexOf("import './ontwerp/fundament.css'"),
  );
  check(
    'T-1: mobiel.css містить загальне мобільне правило min-height:var(--tik-hoogte-mobiel) із пропуском .is-icoon',
    mobielCss.includes(':not(:has(> svg:only-child)):not(.is-icoon):not([role=switch], [role=checkbox], [role=radio])') &&
      mobielCss.includes('min-height:var(--tik-hoogte-mobiel)'),
  );
  check(
    'T-1: капсула мови містить прапор і підпис MOVA_NAAM[lang] без .is-icoon, має висоту 38 px з вагою (0,4,1), сенсорну подушку -3px та спадне меню мов',
    menuTsx.includes("className='mr-sign-in-taal'") &&
      !menuTsx.includes('mr-sign-in-taal is-icoon') &&
      menuTsx.includes('<b>{MOVA_NAAM[lang]}</b>') &&
      afgemeldCss.includes('.canonical-chrome:has(.mr-sign-in) .mr-sign-in-quick-controls button.mr-sign-in-taal{') &&
      afgemeldCss.includes('height:38px;min-height:38px;max-height:38px') &&
      afgemeldCss.includes('width:38px;height:38px;min-width:38px;min-height:38px') &&
      afgemeldCss.includes('inset:-3px;border-radius:999px') &&
      aanmeldCss.includes('.mr-sign-in-taal-menu{') &&
      !aanmeldCss.toLowerCase().includes('#f59e0b'),
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
    'T-2: обидві кнопки входу (.mr-sign-in-main-button і .tga-aanmeld-knop) мають триколонкову сітку 34px minmax(0,1fr) 34px та масштабування 30px на <= 380px',
    aanmeldCss.includes('.canonical-signed-out.mr-sign-in .mr-sign-in-main-button') &&
      aanmeldCss.includes('.canonical-signed-out.mr-sign-in .tga-aanmeld-knop') &&
      aanmeldCss.includes('grid-template-columns:34px minmax(0,1fr) 34px') &&
      aanmeldCss.includes('.mr-sign-in-logo{display:grid;place-items:center;flex:none;width:34px;height:34px') &&
      aanmeldCss.includes('max-width:100%;max-height:100%;border-radius:50%') &&
      aanmeldCss.includes('.canonical-signed-out.mr-sign-in .tga-aanmeld-logo{width:30px;height:30px;flex:0 0 30px}'),
  );
  check(
    'T-2: компонент AanmeldTelegram містить контейнер .tga-aanmeld-logo з компонентом TelegramLogo',
    telegramTsx.includes("className='tga-aanmeld-logo'") &&
      telegramTsx.includes('<TelegramLogo') &&
      telegramCss.includes('.tga-aanmeld-logo'),
  );

  // 4. Перевірка T-3 (K1-T3): вікно «Облікові записи» (AccountMenuV3) на сторінці входу
  const am3Tsx = lees('src/accountmenu-v3/AccountMenuV3.tsx');
  const am3Css = lees('src/accountmenu-v3/accountmenu-v3.css');

  check(
    'T-3: AccountMenuV3 містить рядок теми (.is-theme-row на <= 700px), компактний рядок мови (.is-lang-row) та завжди видиму орбітальну кнопку +',
    am3Tsx.includes("className='am3-pref-row is-theme-row'") &&
      am3Tsx.includes("className='am3-pref-row is-lang-row'") &&
      am3Tsx.includes("className='am3-orbit-stage'") &&
      am3Tsx.includes("className='am3-orbit-node is-add'") &&
      am3Css.includes('.am3-pref-row.is-theme-row'),
  );

  // 5. Перевірка T-4 (K1-T4): покажчики завантаження (#boot-shell, #tsv-voortgang, #tsv-laad-kapsel) та позначка активного входу
  const indexHtml = lees('index.html');
  const navSnelTs = lees('src/navigatie-snel.ts');
  const omlijstingTsx = lees('src/CanoniekOmlijsting.tsx');
  const omleidingTs = lees('src/aanmeld-omleiding.ts');

  check(
    'T-4: ключ активного входу AANMELD_BEZIG_SLEUTEL та тривалість 5 хвилин визначені у CanoniekOmlijsting.tsx, а значок заставки має 38×38 px',
    omlijstingTsx.includes("AANMELD_BEZIG_SLEUTEL='mr-aanmelden-bezig'") &&
      omlijstingTsx.includes('AANMELD_BEZIG_MS=5*60_000') &&
      omlijstingTsx.includes('export function aanmeldenBezig') &&
      omlijstingTsx.includes('export function zetAanmeldenBezig') &&
      omleidingTs.includes('export async function startPrimaryRedirectLogin') &&
      indexHtml.includes('.canonical-boot-account{top:14px;right:24px;width:38px;height:38px}'),
  );
  check(
    'T-4: двомовні підписи капсули завантаження (Завантаження… / Laden…) синхронні й жоден покажчик завантаження не прихований',
    navSnelTs.includes('export function laadKapselKorteTekst') &&
      navSnelTs.includes('export function laadKapselTekst') &&
      navSnelTs.includes("'Завантаження…'") &&
      navSnelTs.includes("'Laden…'") &&
      indexHtml.includes('tsv-laad-kapsel') &&
      indexHtml.includes('tsv-voortgang') &&
      !indexHtml.includes('html.boot-active #tsv-laad-kapsel') &&
      !aanmeldCss.includes('#tsv-laad-kapsel') &&
      navSnelTs.includes('paginaHeeftZichtbareInhoud'),
  );

  const herstelOverzicht = evalueerVierAanmeldGebrekenHerstel();
  check(
    'функція оцінювання стану виправлення evalueerVierAanmeldGebrekenHerstel підтверджує виправлення всіх 4 пунктів (T-1..T-4)',
    herstelOverzicht.length === 4 && herstelOverzicht.every((item) => item.hersteld && item.details.length > 10),
  );

  // 6. Перевірка парної двомовної документації випробувань у docs/identiteit/
  const docUkPad = 'docs/identiteit/ВИПРОБУВАННЯ-4-ВАД-МОБІЛЬНОГО-ВХОДУ-HERSTEL-001.uk.md';
  const docMdPad = 'docs/identiteit/ВИПРОБУВАННЯ-4-ВАД-МОБІЛЬНОГО-ВХОДУ-HERSTEL-001.md';
  const docNlPad = 'docs/identiteit/PROEVEN-4-MOBIELE-AANMELDGEBREKEN-HERSTEL-001.nl.md';
  check(
    'парні статті випробувань (uk / md / nl) існують у docs/identiteit/, синхронізовані та посилаються одна на одну',
    existsSync(resolve(docUkPad)) &&
      existsSync(resolve(docMdPad)) &&
      existsSync(resolve(docNlPad)) &&
      lees(docUkPad) === lees(docMdPad) &&
      lees(docUkPad).includes('PROEVEN-4-MOBIELE-AANMELDGEBREKEN-HERSTEL-001.nl.md') &&
      lees(docNlPad).includes('ВИПРОБУВАННЯ-4-ВАД-МОБІЛЬНОГО-ВХОДУ-HERSTEL-001.uk.md') &&
      !VERBODEN_TEKENREEKS.test(lees(docUkPad) + lees(docNlPad)),
  );

  return einde();
}
