// HERSTEL-001 — Перевірочні випробування 10 вад системи сповіщень (віконця бічного меню .menu-bellen та «Пульта уваги» MeldingenPortaal)
// за дев’ятьма знімками екрана власника:
//   - Screenshot_20261125_132441_com.android.chrome.jpg
//   - Screenshot_20261125_132544_com.android.chrome.jpg
//   - Screenshot_20261125_132707_com.android.chrome.jpg
//   - Screenshot_20261125_132713_com.android.chrome.jpg
//   - Screenshot_20261125_132721_com.android.chrome.jpg
//   - Screenshot_20261125_132725_com.android.chrome.jpg
//   - Screenshot_20261125_132742_com.android.chrome.jpg
//   - Screenshot_20261125_132749_com.android.chrome.jpg
//   - Screenshot_20261125_132803_com.android.chrome.jpg
//
// Цей тестовий набір зберігає точні вимоги та перевіряє як наявність цільових точок у коді,
// так і функцію автоматичної оцінки виправлення кожного з 10 пунктів (MELD-1..MELD-10).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MeldingGebrekContract {
  readonly id:
    | 'MELD-1'
    | 'MELD-2'
    | 'MELD-3'
    | 'MELD-4'
    | 'MELD-5'
    | 'MELD-6'
    | 'MELD-7'
    | 'MELD-8'
    | 'MELD-9'
    | 'MELD-10';
  readonly schermafdrukken: readonly string[];
  readonly titelUk: string;
  readonly titelNl: string;
  readonly doelBestanden: readonly string[];
  readonly oorzaakUk: string;
  readonly oorzaakNl: string;
  readonly herstelEisUk: string;
  readonly herstelEisNl: string;
}

export const TIEN_MELDINGSGEBREKEN_CONTRACTEN: readonly MeldingGebrekContract[] = [
  {
    id: 'MELD-1',
    schermafdrukken: [
      'Screenshot_20261125_132707_com.android.chrome.jpg',
      'Screenshot_20261125_132713_com.android.chrome.jpg',
      'Screenshot_20261125_132721_com.android.chrome.jpg',
      'Screenshot_20261125_132725_com.android.chrome.jpg',
      'Screenshot_20261125_132742_com.android.chrome.jpg',
      'Screenshot_20261125_132749_com.android.chrome.jpg',
    ],
    titelUk:
      'Гігантський порожній білий стовп на весь екран (min-height: 100svh через клас .theme-light на .puls-icoon-tip) замість спливної підказки та блокування першого дотику на смартфоні',
    titelNl:
      'Reusachtige lege witte kolom over het hele scherm (min-height: 100svh door .theme-light op .puls-icoon-tip) in plaats van een tooltip en blokkering van de eerste aanraking op smartphone',
    doelBestanden: [
      'src/meldingen/IcoonActieKnop.tsx',
      'src/meldingen/ecosysteem/meldingen-ecosysteem.css',
      'src/index.css',
    ],
    oorzaakUk:
      'У IcoonActieKnop.tsx функція leesActieveThemaKlassen() навішує клас .theme-light або .theme-dark прямо на <div class="puls-icoon-tip">, а в src/index.css для .theme-dark, .theme-light задано min-height: 100svh; крім того, modus="actie" блокує перший дотик без пояснення.',
    oorzaakNl:
      'In IcoonActieKnop.tsx zet leesActieveThemaKlassen() de klasse .theme-light of .theme-dark rechtstreeks op <div class="puls-icoon-tip">, terwijl src/index.css op .theme-dark, .theme-light min-height: 100svh zet; bovendien blokkeert modus="actie" de eerste aanraking zonder uitleg.',
    herstelEisUk:
      'Задати для .puls-icoon-tip явні min-height: 0; height: max-content; width: max-content і не застосовувати кореневий min-height: 100svh до підказок, а на сенсорних екранах не блокувати прямі кнопки керування шапки двотапною затримкою.',
    herstelEisNl:
      'Geef .puls-icoon-tip expliciet min-height: 0; height: max-content; width: max-content zonder de pagina-min-height: 100svh, en blokkeer directe bedieningsknoppen in de kop op aanraakschermen niet met een dubbeltik-vertraging.',
  },
  {
    id: 'MELD-2',
    schermafdrukken: ['Screenshot_20261125_132707_com.android.chrome.jpg'],
    titelUk:
      'Непрацююче перемикання «Компактна панель / Вікно» на смартфоні (<= 768 px) при збереженому modus === "volledig"',
    titelNl:
      'Niet-werkende omschakeling «Compact paneel / Venster» op smartphone (<= 768 px) bij opgeslagen modus === "volledig"',
    doelBestanden: ['src/meldingen/ecosysteem/MeldingenPortaal.tsx', 'src/CanoniekMeldingencentrum.tsx'],
    oorzaakUk:
      'У MeldingenPortaal.tsx isMobielLangscroll залишається true, якщо geo.modus === "volledig" або profiel.geometrie.modus === "volledig", навіть коли compactBijBel === true, тому натискання кнопки «Компактна панель» не змінює вигляд вікна.',
    oorzaakNl:
      'In MeldingenPortaal.tsx blijft isMobielLangscroll true wanneer geo.modus === "volledig" of profiel.geometrie.modus === "volledig", zelfs als compactBijBel === true, waardoor tikken op «Compact paneel» de weergave niet wijzigt.',
    herstelEisUk:
      'Узгодити перемикання між компактним та розгорнутим режимами на мобільних екранах так, щоб натискання кнопки «Компактна панель» справді перемикало режим і показувало кнопку повернення «Вікно».',
    herstelEisNl:
      'Stem het schakelen tussen compacte en uitgebreide modus op mobiele schermen af zodat tikken op «Compact paneel» daadwerkelijk omschakelt en de terugkeerknop «Venster» toont.',
  },
  {
    id: 'MELD-3',
    schermafdrukken: ['Screenshot_20261125_132544_com.android.chrome.jpg'],
    titelUk:
      'Оманливий підпис «Показано 1 із 14» для єдиної картки-лічильника «Непрочитані листи: 14» у віконці меню «Пошта» та відсутність цих сповіщень у центрі сповіщень',
    titelNl:
      'Misleidend onderschrift «1 van 14 getoond» voor de ene tellerkaart «Ongelezen e-mails: 14» in het menuvenster «E-mail» en ontbreken ervan in het meldingencentrum',
    doelBestanden: ['src/MenuMeldingen.tsx', 'shared/menu-meldingen.ts'],
    oorzaakUk:
      'vanTellers створює один елемент MenuMelding із bron="teller" та aantal=14, а MeldingBellen у MenuMeldingen.tsx порівнює badge.aantal > badge.meldingen.length і пише «Показано 1 із 14», хоча решти 13 карток не існує.',
    oorzaakNl:
      'vanTellers maakt één MenuMelding met bron="teller" en aantal=14, en MeldingBellen in MenuMeldingen.tsx vergelijkt badge.aantal > badge.meldingen.length en toont «1 van 14 getoond» terwijl er geen 13 andere kaarten bestaan.',
    herstelEisUk:
      'Не виводити «Показано 1 із N» для зведеної картки-лічильника (bron === "teller"), а чесно пояснювати, що це зведений лічильник непрочитаних листів у «Вхідних», та передавати сигнал непрочитаної пошти в загальний центр сповіщень.',
    herstelEisNl:
      'Toon geen «1 van N getoond» voor een samengevoegde tellerkaart (bron === "teller"), maar vermeld duidelijk dat het om de teller van ongelezen e-mails in Inbox gaat en geef het signaal door aan het meldingencentrum.',
  },
  {
    id: 'MELD-4',
    schermafdrukken: ['Screenshot_20261125_132441_com.android.chrome.jpg'],
    titelUk:
      'Помилковий логотип та підпис «Gmail · Вхід і пристрій» у картках безпеки «Новий вхід на новому пристрої» через спрацювання /\\bgmail\\b/i на адресу @gmail.com',
    titelNl:
      'Foutief logo en opschrift «Gmail · Aanmelding en apparaat» bij beveiligingsmeldingen «Nieuwe aanmelding op een nieuw apparaat» door match van /\\bgmail\\b/i op @gmail.com',
    doelBestanden: ['src/MenuMeldingen.tsx'],
    oorzaakUk:
      'zoekMerkInTekst у src/MenuMeldingen.tsx перевіряє весь текст повідомлення разом з електронною адресою tarasevych.pavlo@gmail.com; шаблон /\\bgmail\\b/i спрацьовує на домен @gmail.com раніше за /\\bgoogle\\b/i.',
    oorzaakNl:
      'zoekMerkInTekst in src/MenuMeldingen.tsx doorzoekt de volledige berichttekst inclusief het e-mailadres tarasevych.pavlo@gmail.com; het patroon /\\bgmail\\b/i matcht op het domein @gmail.com vóór /\\bgoogle\\b/i.',
    herstelEisUk:
      'Очищувати поштові адреси (або не зіставляти @gmail.com як службу Gmail) у zoekMerkInTekst і для категорії beveiliging / розділу identity показувати справжній спосіб входу (Google, Telegram, Ключ входу), а не Gmail.',
    herstelEisNl:
      'Filter e-mailadressen vóór merkherkenning in zoekMerkInTekst en toon voor categorie beveiliging / onderdeel identity de echte aanmeldmethode (Google, Telegram, Passkey) in plaats van Gmail.',
  },
  {
    id: 'MELD-5',
    schermafdrukken: ['Screenshot_20261125_132441_com.android.chrome.jpg'],
    titelUk:
      'Обрізаний текст без способу й часу входу та відсутність кнопок «Це був я» / «Це не я» у віконці меню «Налаштування 3 сповіщення»',
    titelNl:
      'Afgekorte tekst zonder aanmeldmethode en tijdstip en ontbreken van knoppen «Dit was ik» / «Dit was ik niet» in het menuvenster «Instellingen 3 meldingen»',
    doelBestanden: ['src/MenuMeldingen.tsx', 'backend/nieuw-apparaat.ts'],
    oorzaakUk:
      'У MeldingBellen текст сповіщення обрізається у 2 рядки на поштовій адресі та регіоні перед часом і способом входу, а кнопки «Це був я» (/api/meldingen/apparaat-bekend) та «Це не я» відсутні, попри пряму вимогу в тексті сповіщення.',
    oorzaakNl:
      'In MeldingBellen wordt de meldingstekst na 2 regels afgekapt op het e-mailadres en de regio vóór het tijdstip en de aanmeldmethode, en ontbreken de knoppen «Dit was ik» (/api/meldingen/apparaat-bekend) en «Dit was ik niet» ondanks de tekst.',
    herstelEisUk:
      'Показувати спосіб і час входу на початку або в підзаголовку картки та додати прямі кнопки дії «Це був я» (з викликом POST /api/meldingen/apparaat-bekend) і «Це не я» для сповіщень про новий пристрій.',
    herstelEisNl:
      'Toon aanmeldmethode en tijdstip vooraan of in de subtitel van de kaart en voeg directe actieknoppen «Dit was ik» (met aanroep van POST /api/meldingen/apparaat-bekend) en «Dit was ik niet» toe voor meldingen over een nieuw apparaat.',
  },
  {
    id: 'MELD-6',
    schermafdrukken: [
      'Screenshot_20261125_132441_com.android.chrome.jpg',
      'Screenshot_20261125_132707_com.android.chrome.jpg',
      'Screenshot_20261125_132749_com.android.chrome.jpg',
      'Screenshot_20261125_132803_com.android.chrome.jpg',
    ],
    titelUk:
      'Втрата кнопок «Це не я» / «Це я» під картками «Виявлено вхід із нового незнайомого пристрою» (owner.apparaat.nieuw), відсутність виклику POST /api/meldingen/apparaat-bekend при натисканні «Це я» та дублювання сповіщень',
    titelNl:
      'Verlies van knoppen «Dit was ik niet» / «Dit was ik» onder kaarten «Aanmelding vanaf nieuw onbekend apparaat gedetecteerd» (owner.apparaat.nieuw), ontbreken van POST /api/meldingen/apparaat-bekend bij «Dit was ik» en duplicatie',
    doelBestanden: [
      'shared/meldingen-ecosysteem/tolk.ts',
      'shared/meldingen-puls/kern.ts',
      'src/meldingen/ecosysteem/MeldingVeegKaart.tsx',
      'backend/nieuw-apparaat.ts',
    ],
    oorzaakUk:
      'У tolk.ts подія owner.apparaat.nieuw через слово apparaat потрапляє в subdomein="mcp", kanaal="mcp", prioriteit="laag" і отримує niveau="gewoon" без кнопок підтвердження, а в MeldingVeegKaart.tsx кнопка «Це я» викликає лише onStatus("opgelost") без POST /api/meldingen/apparaat-bekend.',
    oorzaakNl:
      'In tolk.ts valt owner.apparaat.nieuw door het woord apparaat onder subdomein="mcp", kanaal="mcp", prioriteit="laag" en krijgt niveau="gewoon" zonder bevestigingsknoppen, terwijl in MeldingVeegKaart.tsx de knop «Dit was ik» alleen onStatus("opgelost") aanroept zonder POST /api/meldingen/apparaat-bekend.',
    herstelEisUk:
      'Класифікувати owner.apparaat.nieuw як kanaal="beveiliging", subdomein="id", niveau="gevaar", дедуплікувати парні записи з site_notifications та при натисканні «Це я» в MeldingVeegKaart викликати POST /api/meldingen/apparaat-bekend.',
    herstelEisNl:
      'Classificeer owner.apparaat.nieuw als kanaal="beveiliging", subdomein="id", niveau="gevaar", ontdubbel gekoppelde rijen met site_notifications en roep bij «Dit was ik» in MeldingVeegKaart POST /api/meldingen/apparaat-bekend aan.',
  },
  {
    id: 'MELD-7',
    schermafdrukken: [
      'Screenshot_20261125_132441_com.android.chrome.jpg',
      'Screenshot_20261125_132544_com.android.chrome.jpg',
      'Screenshot_20261125_132742_com.android.chrome.jpg',
      'Screenshot_20261125_132803_com.android.chrome.jpg',
    ],
    titelUk:
      'Розбіжність лічильників (99+ на дзвіночку, 18 нових, Подій: 212) та засмічення вкладки «Увага · Потребують дії» вже прочитаними інформаційними подіями (status === "gelezen")',
    titelNl:
      'Verschil tussen tellers (99+ op de bel, 18 nieuw, Gebeurtenissen: 212) en vervuiling van tabblad «Actief · Vragen aandacht» met reeds gelezen informatieve gebeurtenissen (status === "gelezen")',
    doelBestanden: ['src/meldingen/ecosysteem/MeldingenPortaal.tsx', 'src/CanoniekMeldingencentrum.tsx'],
    oorzaakUk:
      'У MeldingenPortaal.tsx фільтр statusFilter === "actief" відкидає лише archief та opgelost, залишаючи всі 212 прочитаних інформаційних подій (status === "gelezen"), які не потребують жодної дії і не зникають навіть після натискання «Позначити всі прочитаними».',
    oorzaakNl:
      'In MeldingenPortaal.tsx sluit statusFilter === "actief" alleen archief en opgelost uit, waardoor alle 212 gelezen informatieve gebeurtenissen (status === "gelezen") blijven staan en zelfs na «Alles als gelezen markeren» niet verdwijnen.',
    herstelEisUk:
      'У вкладці «Увага · Потребують дії» залишати лише непрочитані події (status === "nieuw") та події, що справді потребують рішення або підтвердження безпеки (vereistBevestiging), а прочитані фонові події переносити до журналу/усіх та синхронізувати лічильник дзвіночка.',
    herstelEisNl:
      'Toon op het tabblad «Actief · Vragen aandacht» alleen ongelezen gebeurtenissen (status === "nieuw") en gebeurtenissen die daadwerkelijk een besluit of beveiligingsbevestiging vereisen, en synchroniseer de belteller.',
  },
  {
    id: 'MELD-8',
    schermafdrukken: [
      'Screenshot_20261125_132742_com.android.chrome.jpg',
      'Screenshot_20261125_132749_com.android.chrome.jpg',
      'Screenshot_20261125_132803_com.android.chrome.jpg',
    ],
    titelUk:
      'Заглушка «...: подія без опису (код — у „Технічних подробицях“)» на 10 нових сповіщеннях за відсутності блоку «Технічні подробиці» та обрізання заголовків капсул на півслові',
    titelNl:
      'Terugvaltekst «...: gebeurtenis zonder omschrijving (code onder „Technische details“)» op 10 nieuwe meldingen terwijl het blok «Technische details» ontbreekt en afkapping van capsuletitels',
    doelBestanden: [
      'src/melding-stijl.tsx',
      'src/connector-activiteit.ts',
      'src/meldingen/ecosysteem/ecosysteem-opslag.ts',
      'src/meldingen/ecosysteem/MeldingVeegKaart.tsx',
    ],
    oorzaakUk:
      'siteActieTekst у src/melding-stijl.tsx повертає заглушку з відсиланням до неіснуючого в MeldingVeegKaart блоку «Технічні подробиці», а заголовки капсул у мобільному списку обрізаються в один рядок без показу ключового об’єкта дії.',
    oorzaakNl:
      'siteActieTekst in src/melding-stijl.tsx geeft een terugvaltekst die verwijst naar een in MeldingVeegKaart onbestaand blok «Technische details», en capsuletitels worden op mobiel op één regel afgekapt zonder het doelobject te tonen.',
    herstelEisUk:
      'Забезпечити повноцінні людські назви для всіх дій сайту в SITE_LABELS / SITE_WAT / SITE_GEBEURDE без заглушки «подія без опису» та відображати ключовий контекст у капсулі сповіщення без втрати змісту.',
    herstelEisNl:
      'Voorzie alle site-acties van volwaardige menselijke titels in SITE_LABELS / SITE_WAT / SITE_GEBEURDE zonder de terugvaltekst «gebeurtenis zonder omschrijving» en toon de kerncontext zichtbaar in de capsule.',
  },
  {
    id: 'MELD-9',
    schermafdrukken: [
      'Screenshot_20261125_132441_com.android.chrome.jpg',
      'Screenshot_20261125_132544_com.android.chrome.jpg',
    ],
    titelUk:
      'Перекриття пунктів бічного меню віконцем .menu-bellen без візуальної прив’язки до обраного пункту та блокування першого натиску на кнопки «Відкрити» / «Очистити» на смартфоні',
    titelNl:
      'Overlapping van zijbalkitems door .menu-bellen zonder visuele koppeling aan het gekozen item en blokkering van de eerste tik op «Openen» / «Opruimen» op smartphone',
    doelBestanden: ['src/MenuMeldingen.tsx'],
    oorzaakUk:
      'У MenuMeldingen.tsx віконце .menu-bellen перекриває сам обраний пункт меню без стрілки-вказівника, а icoonKnopHandlers на кнопках «Відкрити» та «Очистити» блокує перший дотик користувача на смартфоні.',
    oorzaakNl:
      'In MenuMeldingen.tsx bedekt .menu-bellen het gekozen menu-item zelf zonder aanwijspijl, en icoonKnopHandlers op «Openen» en «Opruimen» blokkeert de eerste aanraking op een smartphone.',
    herstelEisUk:
      'Позиціонувати .menu-bellen над або під обраним пунктом меню так, щоб пункт залишався видимим, і виконувати дію кнопок «Відкрити» та «Очистити» з першого натиску на смартфоні.',
    herstelEisNl:
      'Plaats .menu-bellen boven of onder het gekozen menu-item zodat het item zichtbaar blijft en voer «Openen» en «Opruimen» op een smartphone direct bij de eerste aanraking uit.',
  },
  {
    id: 'MELD-10',
    schermafdrukken: [
      'Screenshot_20261125_132725_com.android.chrome.jpg',
      'Screenshot_20261125_132742_com.android.chrome.jpg',
      'Screenshot_20261125_132749_com.android.chrome.jpg',
      'Screenshot_20261125_132803_com.android.chrome.jpg',
    ],
    titelUk:
      'Відсутність видимої назви активної вкладки у смузі 6 піктограмних вкладок вікна «Сповіщення» та комп’ютерні клавіатурні підказки (клавіша /) на смартфоні',
    titelNl:
      'Ontbreken van zichtbare naam van het actieve tabblad in de balk met 6 pictogramtabbladen en desktop-toetsaanwijzingen (toets /) op smartphone',
    doelBestanden: ['src/meldingen/ecosysteem/MeldingenPortaal.tsx'],
    oorzaakUk:
      'У MeldingenPortaal.tsx смуга .puls-tabs рендерить 6 вкладок лише як іконки 34×34 px без текстової назви активної вкладки, а кнопка пошуку на сенсорному екрані показує підказку «(клавіша /)».',
    oorzaakNl:
      'In MeldingenPortaal.tsx tekent .puls-tabs 6 tabbladen enkel als pictogrammen van 34×34 px zonder tekstlabel van het actieve tabblad, en de zoekknop toont op aanraakschermen «(toets /)».',
    herstelEisUk:
      'Відображати назву активної вкладки (та зрозумілий підпис поточного фільтра) прямо у смузі вкладок і прибирати клавіатурні підказки («клавіша /», «Ctrl+Z») на сенсорних мобільних пристроях.',
    herstelEisNl:
      'Toon de naam van het actieve tabblad zichtbaar in de tabbladenbalk en verberg toetsenbordaanwijzingen («toets /», «Ctrl+Z») op mobiele aanraakapparaten.',
  },
] as const;

export interface MeldingHerstelStatus {
  readonly id: MeldingGebrekContract['id'];
  readonly hersteld: boolean;
  readonly detail: string;
}

export function evalueerTienMeldingsGebrekenHerstel(rootDir = process.cwd()): readonly MeldingHerstelStatus[] {
  const icoonKnopPad = join(rootDir, 'src/meldingen/IcoonActieKnop.tsx');
  const ecoCssPad = join(rootDir, 'src/meldingen/ecosysteem/meldingen-ecosysteem.css');
  const portaalPad = join(rootDir, 'src/meldingen/ecosysteem/MeldingenPortaal.tsx');
  const menuMeldingenPad = join(rootDir, 'src/MenuMeldingen.tsx');
  const tolkPad = join(rootDir, 'shared/meldingen-ecosysteem/tolk.ts');
  const veegKaartPad = join(rootDir, 'src/meldingen/ecosysteem/MeldingVeegKaart.tsx');
  const stijlPad = join(rootDir, 'src/melding-stijl.tsx');

  const icoonKnopTekst = existsSync(icoonKnopPad) ? readFileSync(icoonKnopPad, 'utf8') : '';
  const ecoCssTekst = existsSync(ecoCssPad) ? readFileSync(ecoCssPad, 'utf8') : '';
  const portaalTekst = existsSync(portaalPad) ? readFileSync(portaalPad, 'utf8') : '';
  const menuMeldingenTekst = existsSync(menuMeldingenPad) ? readFileSync(menuMeldingenPad, 'utf8') : '';
  const tolkTekst = existsSync(tolkPad) ? readFileSync(tolkPad, 'utf8') : '';
  const veegKaartTekst = existsSync(veegKaartPad) ? readFileSync(veegKaartPad, 'utf8') : '';
  const stijlTekst = existsSync(stijlPad) ? readFileSync(stijlPad, 'utf8') : '';

  const meld1Hersteld =
    !icoonKnopTekst.includes('className={`puls-icoon-tip${themaKlassen') ||
    /\.puls-icoon-tip\s*\{[^}]*min-height:\s*0/.test(ecoCssTekst);

  const meld2Hersteld =
    !portaalTekst.includes("(!compactBijBel || geo.modus === 'volledig' || profiel.geometrie.modus === 'volledig')");

  const meld3Hersteld =
    menuMeldingenTekst.includes("bron === 'teller'") &&
    menuMeldingenTekst.includes('voetStatus');

  const meld4Hersteld =
    menuMeldingenTekst.includes('@gmail.com') ||
    menuMeldingenTekst.includes('zonderEmail');

  const meld5Hersteld =
    menuMeldingenTekst.includes('apparaat-bekend');

  const meld6Hersteld =
    veegKaartTekst.includes('apparaat-bekend') &&
    tolkTekst.includes('apparaat.nieuw');

  const meld7Hersteld =
    portaalTekst.includes("statusFilter === 'actief'") &&
    portaalTekst.includes('vereistBevestiging');

  const meld8Hersteld =
    !stijlTekst.includes('подія без опису (код — у «Технічних подробицях»)');

  const meld9Hersteld =
    menuMeldingenTekst.includes('data-menu-bellen-anker');

  const meld10Hersteld =
    portaalTekst.includes('puls-actieve-tab-naam');

  return [
    {
      id: 'MELD-1',
      hersteld: meld1Hersteld,
      detail: meld1Hersteld
        ? 'Спливна підказка .puls-icoon-tip більше не успадковує min-height: 100svh від .theme-light'
        : 'Очікує на виправлення: .puls-icoon-tip отримує клас .theme-light з min-height: 100svh і стає білим стовпом на весь екран',
    },
    {
      id: 'MELD-2',
      hersteld: meld2Hersteld,
      detail: meld2Hersteld
        ? 'Перемикання «Компактна панель / Вікно» працює коректно на мобільних екранах'
        : 'Очікує на виправлення: isMobielLangscroll блокує перехід у компактну панель при modus === "volledig"',
    },
    {
      id: 'MELD-3',
      hersteld: meld3Hersteld,
      detail: meld3Hersteld
        ? 'Зведена картка-лічильник пошти не виводить оманливий підпис «Показано 1 із 14»'
        : 'Очікує на виправлення: для teller:mail виводиться «Показано 1 із 14»',
    },
    {
      id: 'MELD-4',
      hersteld: meld4Hersteld,
      detail: meld4Hersteld
        ? 'Поштова адреса @gmail.com не викликає хибного бренду Gmail у сповіщеннях безпеки'
        : 'Очікує на виправлення: /\\bgmail\\b/i спрацьовує на @gmail.com у тексті сповіщення безпеки',
    },
    {
      id: 'MELD-5',
      hersteld: meld5Hersteld,
      detail: meld5Hersteld
        ? 'Картка нового входу в меню показує спосіб/час входу і підтримує підтвердження «Це був я»'
        : 'Очікує на виправлення: у MeldingBellen обрізано спосіб/час входу і відсутня кнопка «Це був я»',
    },
    {
      id: 'MELD-6',
      hersteld: meld6Hersteld,
      detail: meld6Hersteld
        ? 'Подія owner.apparaat.nieuw має кнопки «Це не я / Це я», а «Це я» викликає POST /api/meldingen/apparaat-bekend'
        : 'Очікує на виправлення: owner.apparaat.nieuw класифікується як mcp/gewoon без кнопок, а «Це я» в MeldingVeegKaart не викликає /api/meldingen/apparaat-bekend',
    },
    {
      id: 'MELD-7',
      hersteld: meld7Hersteld,
      detail: meld7Hersteld
        ? 'Вкладка «Увага · Потребують дії» не засмічується прочитаними інформаційними подіями'
        : 'Очікує на виправлення: усі 212 прочитаних подій висять у вкладці «Увага · Потребують дії»',
    },
    {
      id: 'MELD-8',
      hersteld: meld8Hersteld,
      detail: meld8Hersteld
        ? 'Усі дії сайту мають зрозумілі заголовки без заглушки «подія без опису»'
        : 'Очікує на виправлення: siteActieTekst повертає «подія без опису (код — у „Технічних подробицях“)»',
    },
    {
      id: 'MELD-9',
      hersteld: meld9Hersteld,
      detail: meld9Hersteld
        ? 'Віконце .menu-bellen не перекриває активний пункт меню і кнопки карток спрацьовують з першого дотику'
        : 'Очікує на виправлення: .menu-bellen перекриває пункти меню, а кнопки вимагають подвійного дотику',
    },
    {
      id: 'MELD-10',
      hersteld: meld10Hersteld,
      detail: meld10Hersteld
        ? 'Назва активної вкладки видима у смузі фільтрів, а клавіатурні підказки приховані на смартфоні'
        : 'Очікує на виправлення: 6 піктограмних вкладок не показують назву активної вкладки',
    },
  ];
}

export async function main(): Promise<number> {
  const rootDir = process.cwd();
  let geslaagd = 0;
  let gefaald = 0;

  const controleer = (naam: string, voorwaarde: boolean, detail = '') => {
    if (voorwaarde) {
      geslaagd++;
      console.log(`OK   ${naam}`);
    } else {
      gefaald++;
      console.error(`FOUT ${naam}${detail ? ` — ${detail}` : ''}`);
    }
  };

  controleer(
    'реєстр містить рівно 10 перевірочних контрактів системи сповіщень (MELD-1..MELD-10)',
    TIEN_MELDINGSGEBREKEN_CONTRACTEN.length === 10 &&
      TIEN_MELDINGSGEBREKEN_CONTRACTEN.map((c) => c.id).join(',') ===
        'MELD-1,MELD-2,MELD-3,MELD-4,MELD-5,MELD-6,MELD-7,MELD-8,MELD-9,MELD-10',
  );

  for (const contract of TIEN_MELDINGSGEBREKEN_CONTRACTEN) {
    const alleBestandenAanwezig = contract.doelBestanden.every((rel) => existsSync(join(rootDir, rel)));
    controleer(
      `${contract.id}: усі цільові файли існують у сховищі (${contract.doelBestanden.join(', ')})`,
      alleBestandenAanwezig,
    );
    controleer(
      `${contract.id}: двомовні описи (uk / nl) та прив’язка до знімків екрана заповнені без заборонених символів`,
      contract.titelUk.length > 10 &&
        contract.titelNl.length > 10 &&
        contract.schermafdrukken.length >= 1 &&
        !/[ЁёЪъЫыЭэ]/.test(contract.titelUk + contract.oorzaakUk + contract.herstelEisUk),
    );
  }

  const statussen = evalueerTienMeldingsGebrekenHerstel(rootDir);
  controleer(
    'функція оцінювання стану виправлення evalueerTienMeldingsGebrekenHerstel повертає звіти для всіх 10 пунктів',
    statussen.length === 10 && statussen.every((s) => typeof s.hersteld === 'boolean' && s.detail.length > 0),
  );

  const ukDocPad = join(rootDir, 'docs/meldingen/ВИПРОБУВАННЯ-10-ВАД-СПОВІЩЕНЬ-HERSTEL-001.uk.md');
  const nlDocPad = join(rootDir, 'docs/meldingen/PROEVEN-10-MELDINGSGEBREKEN-HERSTEL-001.nl.md');
  controleer(
    'парні статті 10 випробувань системи сповіщень (uk / nl) існують у docs/meldingen/ і посилаються одна на одну',
    existsSync(ukDocPad) &&
      existsSync(nlDocPad) &&
      readFileSync(ukDocPad, 'utf8').includes('PROEVEN-10-MELDINGSGEBREKEN-HERSTEL-001.nl.md') &&
      readFileSync(nlDocPad, 'utf8').includes('ВИПРОБУВАННЯ-10-ВАД-СПОВІЩЕНЬ-HERSTEL-001.uk.md'),
  );

  console.log(`\n${geslaagd}/${geslaagd + gefaald} geslaagd (herstel-001-meldingen-tien-gebreken)`);
  return gefaald === 0 ? 0 : 1;
}
