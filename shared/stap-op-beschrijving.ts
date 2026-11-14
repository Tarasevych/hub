// SEC-002 interface-07 (12.11.2026): WAT bevestigt de mens in het venster «Підтвердіть доступ», en wat volgt eruit?
//
// Vroeger toonde het venster alleen de titel, het e-mailadres en de manier (passkey, code, Google). De actie stond alleen in de
// verzoeken naar de server. Een verzoek dat niet uit de klik kwam waar de mens aan dacht (hervatten na Google, een ander tabblad,
// een AI via de browserextensie) kreeg zo een blinde vingerafdruk — en daarna gingen 5 minuten (of 12 uur met «Запам’ятати»)
// andere belangrijke acties zonder vraag. Nu staat er onder de titel «Що ви підтверджуєте: …» en de gevolgen; is de actie onbekend,
// dan zegt het venster dat eerlijk met het adres van het verzoek.
//
// Eén register voor het venster (src/platform/bevestig-toegang.tsx) en de tests. Eerst de specifieke paden (één knop = één tekst),
// dan de code uit actieVoorPad (shared/stap-op-acties.ts).

export type StapOpBeschrijving = { uk: string; nl: string; gevolgUk: string; gevolgNl: string; bekend: boolean; gevaar: boolean };
type Regel = readonly [RegExp, string, string, string, string, boolean?];

/** Specifieke paden (vóór de algemene code): de knoppen die een AI of een apparaat rechten of uitvoering geven. */
const PER_PAD: readonly Regel[] = [
  [/\/agents\/commands\/[^/]+\/approve$/, 'Дозволити дію на вашому пристрої (команда, запис файлу, дія в браузері)', 'Een actie op uw apparaat toestaan (commando, bestand schrijven, actie in de browser)',
    'Пристрій виконає саме ту дію, яку показано в списку «Очікують рішення».', 'Het apparaat voert precies de actie uit die in de lijst «Wacht op beslissing» staat.', true],
  [/\/mcp-connector\/approvals\/[^/]+\/approve$/, 'Дозволити виклик інструмента, про який просить ШІ', 'Een aanroep van een hulpmiddel toestaan waar een AI om vraagt',
    'Інструмент виконається від вашого імені з показаними параметрами (лист, подія, коментар тощо).', 'Het hulpmiddel wordt namens u uitgevoerd met de getoonde parameters (bericht, afspraak, reactie enz.).', true],
  [/\/mcp-connector\/consent$/, 'Видати доступ клієнту ШІ (OAuth)', 'Een AI-klant toegang geven (OAuth)',
    'Клієнт отримає токени до вашого акаунта на обраний строк.', 'De klant krijgt tokens voor uw account voor de gekozen termijn.', true],
  [/\/agents\/pairing-code$/, 'Отримати код для підключення нового пристрою або браузера', 'Een code ophalen om een nieuw apparaat of een browser te koppelen',
    'Хто першим уведе цей код протягом 5 хвилин, отримає пристрій у вашому акаунті.', 'Wie deze code binnen 5 minuten als eerste invoert, krijgt een apparaat in uw account.', true],
  [/\/agents\/[^/]+\/browser-enabled$/, 'Дозволити ШІ працювати у вашому браузері', 'De AI in uw browser laten werken',
    'ШІ зможе читати й (за дозволом) натискати на сторінках, відкритих для розширення.', 'De AI kan pagina’s lezen en (met toestemming) bedienen die voor de extensie open staan.', true],
  [/\/agents\/[^/]+\/policy$/, 'Змінити, що пристрій робить без вашого кліку', 'Wijzigen wat het apparaat zonder uw klik doet',
    'Вибрані дії виконуватимуться без запиту.', 'De gekozen acties worden zonder vraag uitgevoerd.', true],
  [/\/mcp-connector\/tools\/set(-all)?$/, 'Змінити режим інструментів ШІ («Завжди» / «Питати» / «Вимк.»)', 'De modus van AI-hulpmiddelen wijzigen («Altijd» / «Vragen» / «Uit»)',
    'З режимом «Завжди» ШІ викликає інструмент без вашого кліку.', 'In de modus «Altijd» roept de AI het hulpmiddel aan zonder uw klik.', true],
  [/\/extensie-ontgrendeling\b|\/ontgrendeling\b|\/extensie-matrix\b/, 'Відкрити або змінити доступ розширення браузера', 'Toegang van de browserextensie openen of wijzigen',
    'ШІ отримає доступ до вибраних сторінок у цьому браузері на обраний строк.', 'De AI krijgt toegang tot de gekozen pagina’s in deze browser voor de gekozen termijn.', true],
];

/** Per code van actieVoorPad (dezelfde lijst als de server). */
const PER_ACTIE: Record<string, readonly [string, string, string, string, boolean?]> = {
  'passkey-toevoegen': ['Додати passkey', 'Een passkey toevoegen', 'Новим ключем можна буде входити у ваш акаунт.', 'Met de nieuwe sleutel kan men in uw account inloggen.', true],
  'passkey-verwijderen': ['Видалити passkey', 'Een passkey verwijderen', 'Цим ключем більше не можна буде увійти.', 'Met deze sleutel kan men niet meer inloggen.', true],
  'goedkeur-recht-intrekken': ['Відкликати право схвалювати', 'Het recht om goed te keuren intrekken', 'Пристрій більше не зможе підтверджувати дії.', 'Het apparaat kan geen acties meer bevestigen.'],
  'goedkeur-recht-aanvragen': ['Дати пристрою право схвалювати', 'Een apparaat het recht geven om goed te keuren', 'Цей пристрій зможе підтверджувати важливі дії.', 'Dit apparaat kan belangrijke acties bevestigen.', true],
  'herstelcodes-nieuw': ['Створити нові коди відновлення', 'Nieuwe herstelcodes maken', 'Старі коди перестануть діяти.', 'De oude codes werken niet meer.', true],
  'herstelcodes-intrekken': ['Відкликати коди відновлення', 'Herstelcodes intrekken', 'Коди більше не допоможуть увійти.', 'De codes helpen niet meer bij het inloggen.', true],
  'toegangscode-maken': ['Створити код доступу', 'Een toegangscode maken', 'Хто знає код, отримає вказаний доступ.', 'Wie de code kent, krijgt de aangegeven toegang.', true],
  'toegangscode-verlengen': ['Продовжити код доступу', 'Een toegangscode verlengen', 'Код діятиме довше.', 'De code blijft langer geldig.'],
  'ruimte-keuze': ['Змінити вибір простору', 'De keuze van de ruimte wijzigen', 'Дані відкриються в іншому просторі.', 'Gegevens openen in een andere ruimte.'],
  'ruimte-besluit': ['Ухвалити рішення щодо простору', 'Een besluit over de ruimte nemen', 'Може змінитися, хто бачить дані.', 'Wie de gegevens ziet, kan veranderen.', true],
  'ruimte-verbinden': ['Підключити службу до простору', 'Een dienst aan de ruimte koppelen', 'Служба отримає доступ до даних простору.', 'De dienst krijgt toegang tot de gegevens van de ruimte.'],
  'wijziging-terugdraaien': ['Скасувати зміну доступу', 'Een wijziging van de toegang terugdraaien', 'Попередні налаштування повернуться.', 'De vorige instellingen komen terug.'],
  'voorbereider': ['Змінити підготовку випуску', 'De voorbereiding van een uitrol wijzigen', 'Впливає на те, що піде на сервер.', 'Beïnvloedt wat naar de server gaat.', true],
  'uitrol-goedkeuren': ['Схвалити випуск на сервер', 'Een uitrol naar de server goedkeuren', 'Нова версія сайту буде встановлена.', 'Er wordt een nieuwe versie van de site geïnstalleerd.', true],
  'totp-uitschakelen': ['Вимкнути застосунок-автентифікатор', 'De authenticator-app uitschakelen', 'Вхід стане слабшим.', 'Het inloggen wordt zwakker.', true],
  'totp-wijzigen': ['Змінити застосунок-автентифікатор', 'De authenticator-app wijzigen', 'Старі коди перестануть діяти.', 'De oude codes werken niet meer.', true],
  wachtwoord: ['Змінити кодове слово', 'Het codewoord wijzigen', 'Старе кодове слово перестане діяти.', 'Het oude codewoord werkt niet meer.', true],
  export: ['Експортувати ваші дані', 'Uw gegevens exporteren', 'Буде створено файл з вашими даними.', 'Er wordt een bestand met uw gegevens gemaakt.', true],
  'deel-beheerder': ['Зробити людину адміністратором спільного простору', 'Iemand beheerder van een gedeelde werkruimte maken', 'Вона зможе запрошувати інших, змінювати їхні ролі й відкликати доступ у цьому просторі.', 'Die persoon kan in deze werkruimte anderen uitnodigen, hun rol wijzigen en toegang intrekken.', true],
  // IDENTITEIT-015: ворота входу за правилом «другий чинник обов'язковий».
  'tweede-factor': ['Завершити вхід другим чинником', 'De aanmelding afronden met een tweede factor', 'Правило сайту: після Google сеанс відкривається лише після коду із застосунку, ключа доступу або коду відновлення.', 'Regel van de site: na Google opent de sessie pas na een app-code, passkey of herstelcode.'],
  'account-verwijderen': ['Видалити обліковий запис', 'Het account verwijderen', 'Обліковий запис і дані буде видалено.', 'Het account en de gegevens worden verwijderd.', true],
  beheer: ['Дія адміністратора', 'Een beheeractie', 'Змінює налаштування сайту або інших користувачів.', 'Wijzigt instellingen van de site of van andere gebruikers.', true],
  agenten: ['Зміна в розділі «Агенти» (пристрої, ШІ-підключення)', 'Een wijziging onder «Agenten» (apparaten, AI-verbindingen)', 'Може змінити, що ШІ або пристрої можуть робити.', 'Kan wijzigen wat AI of apparaten mogen doen.', true],
  bevestigen: ['Увімкнути технічний профіль', 'Het technische profiel aanzetten', 'У цій вкладці відкриються адмін-функції.', 'In dit tabblad gaan beheerfuncties open.', true],
};

const pad = (url: string) => { const p = String(url || '').split('?')[0].split('#')[0]; try { return /^https?:/i.test(p) ? new URL(p).pathname : p; } catch { return p; } };

/** Beschrijving voor het venster. Onbekend → eerlijk «Дія: <шлях> — сайт не знає її опису», met waarschuwing (gevaar). */
export function beschrijfStapOp(actie: string | undefined, url = ''): StapOpBeschrijving {
  const p = pad(url);
  for (const [re, uk, nl, gevolgUk, gevolgNl, gevaar] of PER_PAD) if (p && re.test(p)) return { uk, nl, gevolgUk, gevolgNl, bekend: true, gevaar: !!gevaar };
  const a = actie ? PER_ACTIE[actie] : undefined;
  if (a) return { uk: a[0], nl: a[1], gevolgUk: a[2], gevolgNl: a[3], bekend: true, gevaar: !!a[4] };
  const wat = p ? p.slice(0, 120) : '—';
  return {
    uk: `Дія: ${wat} — сайт не знає її опису`, nl: `Actie: ${wat} — de site kent er geen beschrijving van`,
    gevolgUk: 'Якщо ви щойно не натискали кнопку, яка мала б цього вимагати, — скасуйте.', gevolgNl: 'Klikte u niet net op een knop die hierom zou vragen, annuleer dan.',
    bekend: false, gevaar: true,
  };
}
