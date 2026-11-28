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
//
// STAPOP-OMSCHR-001 (15.11.2026): Павло побачив у вікні «Дія: /api/owner/connector-v2/activeer-tech — сайт не знає її опису». Тепер:
//   • кожен маршрут, що вимагає підтвердження, має тут опис обома мовами (тест stap-op-omschrijving-20261115 шукає такі маршрути
//     в backend/ і падає на новому без опису);
//   • для кнопок з кількома варіантами (activeer-tech, ai/block, …) опис складається з полів самого запиту (verzoekKern): для
//     якого ШІ, на який строк, що саме вмикається — лише відомі значення, жодного довільного тексту із запиту;
//   • якщо опису все ж немає — зрозуміле попередження, а технічна адреса лише в полі `technisch` (вікно показує її дрібно в
//     «Подробицях»), не як головний текст.
// Ці тексти лише описують; що можна запам'ятати, вирішує сервер за actieVoorPad (тут нічого не послаблено).

import { V2_AGENTEN } from './connector-v2/agenten';
import type { VerzoekKern } from './stap-op-acties';
export { verzoekKern, type VerzoekKern } from './stap-op-acties';

type Tekst = readonly [string, string, string, string, boolean?];
type Regel = readonly [RegExp, string, string, string, string, boolean?] | readonly [RegExp, (v: VerzoekKern) => Tekst];

/** `algemeen`: de tekst komt uit het register per GEBIED (geen eigen regel voor deze knop) — nog steeds een echte beschrijving,
 *  maar de bouw (scripts/stap-op-register-controle.mjs) eist voor elke route met bevestiging een eigen regel. */
export type StapOpBeschrijving = { uk: string; nl: string; gevolgUk: string; gevolgNl: string; bekend: boolean; gevaar: boolean; technisch?: string; algemeen?: boolean };
const agentNaam = (slug?: string) => V2_AGENTEN.find((a) => a.slug === slug)?.naam ?? '';
const duur = (min: number): readonly [string, string] => min % 60 === 0
  ? [`${min / 60} год`, `${min / 60} uur`]
  : [`${min} хв`, `${min} min`];

/**
 * «Керувати Claude» / «Дозволити до кінця сеансу» / «На 1 год» / «Увімкнути (окремі дані)» op mcp.*\/agenten (backend/connector-v2-routes.ts,
 * POST /api/owner/connector-v2/activeer-tech). Alleen de varianten die om bevestiging vragen: alles-aan, delegatie-aan, dienst-eigen,
 * dienst-gedeeld (uitzetten vraagt niets).
 */
function activeerTech(v: VerzoekKern): Tekst {
  const naam = agentNaam(v.agent);
  const ukWie = naam ? `ШІ ${naam}` : 'цьому підключенню ШІ', nlWie = naam ? `de AI ${naam}` : 'deze AI-koppeling';
  const sessie = ['Якщо технічний сеанс у цій вкладці ще не запущено, його буде запущено.', 'Loopt er in dit tabblad nog geen technische sessie, dan start die.'] as const;
  if (v.actie === 'dienst-eigen' || v.actie === 'dienst-gedeeld') {
    const gedeeld = v.actie === 'dienst-gedeeld';
    return [
      `Увімкнути службу «Підключення ШІ» в технічному просторі (${gedeeld ? 'спільно з особистим' : 'окремі дані'})`,
      `De dienst «AI-koppelingen» aanzetten in de technische ruimte (${gedeeld ? 'gedeeld met persoonlijk' : 'eigen gegevens'})`,
      `${sessie[0]} Підключення ШІ запрацюють і в технічному просторі${gedeeld ? ' та бачитимуть ті самі дані служби, що й в особистому' : ' з окремими від особистого простору даними'}. Вимкнути: кнопка «Від’єднати службу» на сторінці ШІ.`,
      `${sessie[1]} AI-koppelingen werken dan ook in de technische ruimte${gedeeld ? ' en zien dezelfde gegevens van de dienst als in de persoonlijke ruimte' : ', met gegevens los van de persoonlijke ruimte'}. Uitzetten: knop «Dienst losmaken» op de pagina van de AI.`,
      true,
    ];
  }
  // alles-aan (standaard van de server) en delegatie-aan. Termijn zoals de server hem neemt (standaard 'tot-account-uitloggen',
  // backend/connector-v2-routes.ts), alle vijf termijnen van AI-TERMIJN-001 (shared/ai-delegatie.ts TERMIJN_NAAM).
  const [ukStrok, nlStrok] = termijnTekst(v);
  // AGENTSCHEIDING-001: zonder genoemde koppeling neemt de server de regel van DEZE agent ('agent:<slug>'), nooit stil «alle AI's».
  const wie = naam || 'цей ШІ', wieNl = naam || 'deze AI';
  const [ukBereik, nlBereik] = v.alleVerbindingen
    ? ['Увага: дозвіл діятиме для ВСІХ ваших підключень ШІ, не лише для цього.', 'Let op: de toestemming geldt voor AL uw AI-koppelingen, niet alleen voor deze.']
    : v.verbinding
      ? [`Лише це підключення ${wie}: інші ШІ цього доступу не отримують.`, `Alleen deze koppeling van ${wieNl}: andere AI’s krijgen deze toegang niet.`]
      : [`Діє лише для ${wie}, також після «Підключити знову»; інші ШІ цього доступу не отримують.`, `Geldt alleen voor ${wieNl}, ook na «Opnieuw koppelen»; andere AI’s krijgen deze toegang niet.`];
  return [
    `Дозволити ${ukWie} працювати в технічному просторі ${ukStrok}`,
    `${nlWie.charAt(0).toUpperCase()}${nlWie.slice(1)} laten werken in de technische ruimte ${nlStrok}`,
    `${sessie[0]} ${naam || 'ШІ'} зможе викликати технічні інструменти сайту й сервера, дозволені цьому підключенню (файли й команди на сервері, контейнери й застосунки, випуски, користувачі, технічні вкладки браузера), від вашого імені; інструменти з режимом «Завжди» спрацюють без вашого кліку. ${ukBereik} Вимкнути раніше: «Залишити лише звичайний простір» на сторінці ШІ, завершення технічного сеансу або вихід із сайту.`,
    `${sessie[1]} ${naam || 'De AI'} kan namens u de technische hulpmiddelen van site en server aanroepen die deze koppeling mag gebruiken (bestanden en commando’s op de server, containers en apps, uitrollen, gebruikers, technische tabbladen van de browser); hulpmiddelen in de modus «Altijd» werken zonder uw klik. ${nlBereik} Eerder uitzetten: «Alleen gewone ruimte laten» op de pagina van de AI, de technische sessie beëindigen of afmelden.`,
    true,
  ];
}

/** Termijn als woordgroep achter «працювати в технічному просторі …» (uk, nl). Onbekend → de standaard van de server. */
function termijnTekst(v: VerzoekKern): [string, string] {
  switch (v.termijn) {
    case 'tijd': return v.minuten ? [`на ${duur(v.minuten)[0]}`, `voor ${duur(v.minuten)[1]}`] : ['до вибраної дати', 'tot de gekozen datum'];
    case 'tot-technisch-einde': return ['до кінця технічного сеансу', 'tot het einde van de technische sessie'];
    case 'tot-site-uitloggen': return ['до виходу з цього входу на сайт', 'tot u zich afmeldt van deze aanmelding'];
    case 'onbepaald': return ['безстроково, доки ви не знімете дозвіл', 'zonder einddatum, tot u de toestemming intrekt'];
    default: return ['до виходу з облікового запису', 'tot u zich afmeldt van het account'];
  }
}

/** Specifieke paden (vóór de algemene code): de knoppen die een AI of een apparaat rechten of uitvoering geven. */
const PER_PAD: readonly Regel[] = [
  [/\/agents\/commands\/[^/]+\/approve$/, 'Дозволити дію на вашому пристрої (команда, запис файлу, дія в браузері)', 'Een actie op uw apparaat toestaan (commando, bestand schrijven, actie in de browser)',
    'Пристрій виконає саме ту дію, яку показано в списку «Очікують рішення».', 'Het apparaat voert precies de actie uit die in de lijst «Wacht op beslissing» staat.', true],
  [/\/mcp-connector\/approvals\/[^/]+\/approve$/, 'Дозволити виклик інструмента, про який просить ШІ', 'Een aanroep van een hulpmiddel toestaan waar een AI om vraagt',
    'Інструмент виконається від вашого імені з показаними параметрами (лист, подія, коментар тощо).', 'Het hulpmiddel wordt namens u uitgevoerd met de getoonde parameters (bericht, afspraak, reactie enz.).', true],
  [/\/mcp-connector\/consent$/, 'Видати доступ клієнту ШІ (OAuth)', 'Een AI-klant toegang geven (OAuth)',
    'Клієнт отримає токени до вашого облікового запису на обраний строк.', 'De klant krijgt tokens voor uw account voor de gekozen termijn.', true],
  [/\/agents\/pairing-code$/, 'Отримати код для підключення нового пристрою або браузера', 'Een code ophalen om een nieuw apparaat of een browser te koppelen',
    'Хто першим уведе цей код протягом 5 хвилин, отримає пристрій у вашому обліковому записі.', 'Wie deze code binnen 5 minuten als eerste invoert, krijgt een apparaat in uw account.', true],
  [/\/agents\/[^/]+\/browser-enabled$/, 'Дозволити ШІ працювати у вашому браузері', 'De AI in uw browser laten werken',
    'ШІ зможе читати й (за дозволом) натискати на сторінках, відкритих для розширення.', 'De AI kan pagina’s lezen en (met toestemming) bedienen die voor de extensie open staan.', true],
  [/\/agents\/[^/]+\/policy$/, 'Змінити, що пристрій робить без вашого кліку', 'Wijzigen wat het apparaat zonder uw klik doet',
    'Вибрані дії виконуватимуться без запиту.', 'De gekozen acties worden zonder vraag uitgevoerd.', true],
  [/\/mcp-connector\/tools\/set(-all)?$/, 'Змінити режим інструментів ШІ («Завжди» / «Питати» / «Вимк.»)', 'De modus van AI-hulpmiddelen wijzigen («Altijd» / «Vragen» / «Uit»)',
    'З режимом «Завжди» ШІ викликає інструмент без вашого кліку.', 'In de modus «Altijd» roept de AI het hulpmiddel aan zonder uw klik.', true],
  [/\/extensie-ontgrendeling\b|\/ontgrendeling\b|\/extensie-matrix\b/, 'Відкрити або змінити доступ розширення браузера', 'Toegang van de browserextensie openen of wijzigen',
    'ШІ отримає доступ до вибраних сторінок у цьому браузері на обраний строк.', 'De AI krijgt toegang tot de gekozen pagina’s in deze browser voor de gekozen termijn.', true],
  // ---------------------------------------------------------------- UPD-003: спільні рушії ШІ «для всіх» (MAILAI-003, #117)
  [/\/ai-dienst-motoren\/bewaar$/, 'Зберегти спільний рушій ШІ для пошти (постачальник, адреса, модель, ключ)', 'Een gedeelde AI-motor voor mail opslaan (aanbieder, adres, model, sleutel)',
    'Новий або змінений рушій зберігається вимкненим: якщо змінилося, куди йде текст листів, або замінено ключ, згоди користувачів скидаються.', 'Een nieuwe of gewijzigde motor wordt uitgeschakeld opgeslagen; verandert waar de tekst van berichten heen gaat of wordt de sleutel vervangen, dan vervallen de akkoorden van gebruikers.', true],
  [/\/ai-dienst-motoren\/zet$/, (v) => v.aan === false
    ? ['Вимкнути спільний рушій ШІ для всіх', 'Een gedeelde AI-motor voor iedereen uitzetten', 'Ніхто більше не зможе надсилати через нього текст листів; налаштування рушія лишаються.', 'Niemand kan er nog tekst van berichten via sturen; de instellingen van de motor blijven bewaard.']
    : ['Увімкнути спільний рушій ШІ для всіх користувачів', 'Een gedeelde AI-motor voor alle gebruikers aanzetten', 'Кожен, хто погодиться, зможе надсилати через цей рушій текст своїх листів обраному постачальнику, у межах лімітів.', 'Iedereen die akkoord gaat, kan via deze motor de tekst van eigen berichten naar de gekozen aanbieder sturen, binnen de limieten.', true]],
  [/\/ai-dienst-motoren\/verwijder$/, 'Видалити спільний рушій ШІ', 'Een gedeelde AI-motor verwijderen',
    'Рушій і його ключ зникнуть зі сховища; користувачі, що ним користувалися, повернуться до власного вибору рушія.', 'De motor en zijn sleutel verdwijnen uit de opslag; gebruikers die hem gebruikten, vallen terug op hun eigen motorkeuze.'],
  // ---------------------------------------------------------------- STAPOP-OMSCHR-001 (15.11.2026)
  // Підключення ШІ (mcp.*\/agenten): connector-v2, старі ШІ-права, дошка.
  [/\/connector-v2\/activeer-tech$/, activeerTech],
  [/\/connector-v2\/toepassen$/, 'Розширити права ШІ на вже активному підключенні', 'Rechten van een AI uitbreiden op een al actieve koppeling',
    'Підключене ШІ одразу, без повторного підключення, отримає щойно вибрані нові дозволи (інструменти й простори).', 'De gekoppelde AI krijgt meteen, zonder opnieuw te koppelen, de net gekozen nieuwe rechten (hulpmiddelen en ruimtes).', true],
  [/\/connector-v2\/massa$/, 'Розширити права кількох ШІ однією дією', 'Rechten van meerdere AI’s in één keer uitbreiden',
    'Вибраний режим одразу застосується до всіх позначених ШІ, і кожне з них зможе більше, ніж досі.', 'De gekozen modus geldt meteen voor alle gekozen AI’s; elk ervan mag daarna meer dan nu.', true],
  [/\/connector-v2\/instellingen$/, 'Вимкнути додаткове підтвердження нових підключень ШІ', 'De extra bevestiging van nieuwe AI-koppelingen uitzetten',
    'Нове підключення ШІ більше не проситиме окремого кроку безпеки; захист стане слабшим. Увімкнути знову можна будь-коли без підтвердження.', 'Een nieuwe AI-koppeling vraagt geen aparte veiligheidsstap meer; de bescherming wordt zwakker. Weer aanzetten kan altijd, zonder bevestiging.', true],
  [/\/ai\/grants\/(add|preset)$/, 'Дати ШІ нові права на вашому пристрої або в браузері', 'Een AI nieuwe rechten geven op uw apparaat of in de browser',
    'ШІ зможе читати або діяти на пристрої чи в браузері в межах вибраних прав і строку.', 'De AI kan binnen de gekozen rechten en termijn lezen of handelen op het apparaat of in de browser.', true],
  [/\/ai\/settings$/, 'Розширити межу можливостей ШІ для облікового запису', 'De grens van AI-mogelijkheden voor het account verruimen',
    'Увімкнені можливості стануть доступними для видачі будь-якому ШІ (самі права видаються окремо).', 'De aangezette mogelijkheden kunnen aan elke AI worden gegeven (de rechten zelf worden apart gegeven).', true],
  [/\/ai\/block$/, (v) => v.unblock
    ? ['Розблокувати доступ ШІ для користувача', 'AI-toegang van een gebruiker deblokkeren', 'Цей користувач знову зможе підключати ШІ; старі токени не повертаються.', 'Deze gebruiker kan weer AI koppelen; oude tokens komen niet terug.', true]
    : ['Заблокувати доступ ШІ для користувача', 'AI-toegang van een gebruiker blokkeren', 'Усі токени й права ШІ цього користувача буде відкликано, підключення закриються.', 'Alle AI-tokens en -rechten van deze gebruiker worden ingetrokken; verbindingen gaan dicht.', true]],
  [/\/ai-toegang\/zet$/, 'Розширити доступ ШІ-клієнта до ваших даних', 'De toegang van een AI-klant tot uw gegevens uitbreiden',
    'ШІ отримає щойно позначені дозволи (наприклад, читання пошти чи файлів) для цього підключення.', 'De AI krijgt de net aangevinkte rechten (bijv. mail of bestanden lezen) voor deze koppeling.', true],
  [/\/ai-bord\/token$/, 'Створити токен для ШІ з дошки (особистий простір)', 'Een token maken voor een AI vanaf het bord (persoonlijke ruimte)',
    'Хто має цей токен, працюватиме з вашим особистим простором через MCP; технічного доступу токен не дає. Відкликати можна на сторінці ШІ.', 'Wie dit token heeft, werkt via MCP met uw persoonlijke ruimte; technische toegang geeft het niet. Intrekken kan op de pagina van de AI.', true],
  [/\/ai-bevestiging\/bevestigen$/, 'Схвалити дію, яку ШІ хоче виконати від вашого імені', 'Een actie goedkeuren die een AI namens u wil uitvoeren',
    'ШІ виконає саме ту дію, яку показано в картці запиту (наприклад, надішле лист).', 'De AI voert precies de actie uit die in de kaart van het verzoek staat (bijv. een bericht versturen).', true],
  [/\/agent-namens\/aanmaken$/, 'Дозволити ШІ діяти від вашого імені в межах сеансу', 'Een AI namens u laten handelen binnen een sessie',
    'ШІ отримає сеанс із вибраними правами й строком; відкликати можна будь-коли на сторінці ШІ.', 'De AI krijgt een sessie met de gekozen rechten en termijn; intrekken kan altijd op de pagina van de AI.', true],
  [/\/agent-namens\/spoken\/opruimen$/, 'Прибрати завислі сеанси ШІ', 'Achtergebleven AI-sessies opruimen',
    'Сеанси без власника буде видалено; ШІ, що ними користувалися, втратять доступ.', 'Sessies zonder eigenaar worden verwijderd; AI’s die ze gebruikten, verliezen toegang.'],
  [/\/apps\/geheimen\/[^/]+\/invullen$/, 'Передати секрет на ваш пристрій на запит застосунку', 'Een geheim naar uw apparaat sturen op verzoek van een app',
    'Введене значення (пароль, ключ) буде надіслано на пристрій, що його запитав.', 'De ingevoerde waarde (wachtwoord, sleutel) gaat naar het apparaat dat erom vroeg.', true],
  [/\/agents\/extensie-beheer\/intrekken$/, 'Відкликати доступ розширення браузера', 'Toegang van de browserextensie intrekken',
    'Розширення втратить вибраний доступ; щоб повернути, його доведеться видати знову.', 'De extensie verliest de gekozen toegang; terugkrijgen kan alleen door die opnieuw te geven.'],
  // Вхід і безпека облікового запису (id.*).
  [/\/aanmeld\/vnext\/start$/, 'Прив’язати новий спосіб входу до облікового запису', 'Een nieuwe aanmeldmethode aan het account koppelen',
    'Після прив’язки через цей сервіс (Apple, Telegram тощо) можна буде входити у ваш обліковий запис.', 'Na het koppelen kan men via deze dienst (Apple, Telegram enz.) in uw account inloggen.', true],
  [/\/aanmeld\/vnext\/ontkoppel$/, 'Від’єднати спосіб входу', 'Een aanmeldmethode loskoppelen',
    'Через цей сервіс більше не можна буде увійти. Останній спосіб входу від’єднати не можна.', 'Via deze dienst kan men niet meer inloggen. De laatste aanmeldmethode kan niet losgekoppeld worden.', true],
  [/\/access\/(method|binding)\/unbind$/, 'Від’єднати спосіб входу', 'Een aanmeldmethode loskoppelen',
    'Цим способом більше не можна буде увійти. Останній спосіб входу від’єднати не можна.', 'Met deze methode kan men niet meer inloggen. De laatste aanmeldmethode kan niet losgekoppeld worden.', true],
  [/\/access\/method\/herstel$/, 'Повернути від’єднаний спосіб входу', 'Een losgekoppelde aanmeldmethode terugzetten',
    'Цим способом знову можна буде входити у ваш обліковий запис.', 'Met deze methode kan men weer in uw account inloggen.', true],
  [/\/access\/phone\/save$/, 'Змінити номер телефону для входу', 'Het telefoonnummer voor het inloggen wijzigen',
    'Коди входу надходитимуть на новий номер.', 'Inlogcodes gaan naar het nieuwe nummer.', true],
  [/\/access\/policy\/save$/, 'Змінити правила входу на сайт для всіх', 'De aanmeldregels van de site voor iedereen wijzigen',
    'Зміниться, якими способами входять усі користувачі та чи обов’язковий другий чинник.', 'Het verandert hoe alle gebruikers inloggen en of een tweede factor verplicht is.', true],
  [/\/access\/user\/[^/]+\/method$/, 'Змінити спосіб входу іншого користувача', 'De aanmeldmethode van een andere gebruiker wijzigen',
    'Цей користувач зможе або не зможе входити вибраним способом.', 'Deze gebruiker kan wel of niet meer inloggen met de gekozen methode.', true],
  [/\/access\/user\/[^/]+\/reset-password$/, 'Скинути кодове слово іншого користувача', 'Het codewoord van een andere gebruiker resetten',
    'Старе кодове слово перестане діяти; буде створено тимчасове, яке треба змінити під час входу.', 'Het oude codewoord werkt niet meer; er komt een tijdelijk codewoord dat bij het inloggen gewijzigd moet worden.', true],
  [/\/passkeys\/hernoemen$/, 'Перейменувати passkey', 'Een passkey hernoemen', 'Зміниться лише назва ключа; права ключа ті самі.', 'Alleen de naam van de sleutel verandert; de rechten blijven gelijk.'],
  [/\/identity\/security\/revoke-all$/, 'Вийти на всіх пристроях', 'Op alle apparaten afmelden',
    'Усі сеанси, разом із цим, буде завершено; далі доведеться входити знову.', 'Alle sessies, ook deze, worden beëindigd; daarna moet u opnieuw inloggen.', true],
  [/\/identity\/security\/revoke-others$/, 'Вийти на інших пристроях', 'Op andere apparaten afmelden',
    'Усі сеанси, крім цього, буде завершено.', 'Alle sessies behalve deze worden beëindigd.', true],
  // Шифрування моїх даних (сховище ключів).
  [/\/sleutelkluis\/inschakelen$/, 'Увімкнути шифрування ваших даних', 'De versleuteling van uw gegevens aanzetten',
    'Буде створено ключ даних і одноразово показано код відновлення; без нього й без passkey доступ до зашифрованого відновити не можна.', 'Er komt een gegevenssleutel en eenmalig een herstelcode; zonder die code en zonder passkey is het versleutelde niet terug te krijgen.', true],
  [/\/sleutelkluis\/herstelcode\/vernieuwen$/, 'Створити новий код відновлення шифрування', 'Een nieuwe herstelcode voor de versleuteling maken',
    'Новий код покажемо один раз; старий перестане діяти, щойно ви підтвердите, що зберегли новий.', 'De nieuwe code tonen we één keer; de oude werkt niet meer zodra u bevestigt dat u de nieuwe bewaard hebt.', true],
  [/\/sleutelkluis\/herstellen$/, 'Повернути незавершене шифрування до стану «вимкнено»', 'Een onvoltooide versleuteling terugzetten naar «uit»',
    'Сховище без жодного ключа повернеться до стану «вимкнено»; дані не втрачаються.', 'Een kluis zonder sleutel gaat terug naar «uit»; er gaan geen gegevens verloren.'],
  [/\/sleutelkluis\/passkey\/koppelen\/opties$/, 'Прив’язати passkey як ключ до зашифрованих даних', 'Een passkey koppelen als sleutel voor de versleutelde gegevens',
    'Цим passkey можна буде відкривати ваші зашифровані дані.', 'Met deze passkey kunnen uw versleutelde gegevens geopend worden.', true],
  [/\/sleutelkluis\/wachtwoord\/aan$/, 'Дозволити паролю одразу розшифровувати дані', 'Het wachtwoord de gegevens meteen laten ontsleutelen',
    'Після цього вхід паролем одразу відкриватиме ваші зашифровані дані. Ризик: хто скопіює базу даних, може підбирати слабкий пароль без обмежень.', 'Daarna opent aanmelden met wachtwoord uw versleutelde gegevens meteen. Risico: wie de database kopieert, kan een zwak wachtwoord onbeperkt raden.', true],
  [/\/sleutelkluis\/passkey\/ontkoppelen$/, 'Від’єднати passkey від зашифрованих даних', 'Een passkey loskoppelen van de versleutelde gegevens',
    'Цим passkey більше не можна буде відкрити зашифровані дані; лишаться інші ключі й код відновлення.', 'Met deze passkey kunnen de versleutelde gegevens niet meer geopend worden; andere sleutels en de herstelcode blijven.', true],
  [/\/sleutelkluis\/herversleutelen$/, 'Перешифрувати збережені дані', 'Opgeslagen gegevens opnieuw versleutelen',
    'Наявні дані буде поступово зашифровано вашим ключем; під час роботи не закривайте вкладку.', 'Bestaande gegevens worden stap voor stap met uw sleutel versleuteld; sluit het tabblad niet tijdens het werk.', true],
  // Технічний простір і сервер.
  [/\/hub\/tech\/ruimtes\/starten$/, 'Запустити технічний сеанс', 'Een technische sessie starten',
    'У цій вкладці відкриються технічні функції сайту й сервера на вибраний строк.', 'In dit tabblad gaan technische functies van site en server open voor de gekozen termijn.', true],
  [/\/hub\/tech\/ruimtes\/verlengen$/, 'Продовжити технічний сеанс', 'Een technische sessie verlengen',
    'Технічні функції лишаться відкритими довше.', 'Technische functies blijven langer open.', true],
  [/\/hub\/tech\/ruimtes\/ai-zetten$/, 'Дозволити ШІ працювати в технічному просторі', 'Een AI laten werken in de technische ruimte',
    'Вибране підключення ШІ зможе викликати технічні інструменти сайту й сервера на вибраний строк.', 'De gekozen AI-koppeling kan voor de gekozen termijn technische hulpmiddelen van site en server aanroepen.', true],
  [/\/tech\/toekennen$/, 'Дати людині технічний профіль', 'Iemand een technisch profiel geven',
    'Ця людина зможе вмикати технічні функції сайту з вибраними ролями.', 'Die persoon kan technische functies van de site aanzetten met de gekozen rollen.', true],
  [/\/terminal\/openen$/, 'Відкрити термінал на пристрої або сервері', 'Een terminal openen op een apparaat of de server',
    'У вікні можна буде виконувати команди з вибраними правами; сеанс записується.', 'In het venster kunnen commando’s worden uitgevoerd met de gekozen rechten; de sessie wordt opgenomen.', true],
  [/\/terminal\/instelling$/, 'Змінити, які команди терміналу потребують підтвердження', 'Wijzigen welke terminalopdrachten een bevestiging vragen',
    'Від цього залежить, чи спитає сторінка вас перед кожною командою або лише перед змінами.', 'Hiervan hangt af of de pagina vóór elke opdracht vraagt of alleen vóór wijzigingen.', true],
  [/\/ssh-ca\/uitgifte(\/uitdaging)?$/, 'Отримати SSH-сертифікат для входу на сервер', 'Een SSH-certificaat ophalen om op de server in te loggen',
    'З цим сертифікатом можна буде увійти на сервер на вибраний строк.', 'Met dit certificaat kan men voor de gekozen termijn op de server inloggen.', true],
  [/\/ssh-ca\/intrekken$/, 'Відкликати SSH-сертифікат', 'Een SSH-certificaat intrekken', 'З цим сертифікатом більше не можна буде увійти на сервер.', 'Met dit certificaat kan men niet meer op de server inloggen.'],
  [/\/remote\/verbinding\/opslaan$/, 'Зберегти з’єднання віддаленого робочого столу', 'Een verbinding met een extern bureaublad opslaan',
    'Через сайт можна буде відкривати цей комп’ютер.', 'Via de site kan deze computer geopend worden.', true],
  [/\/remote\/verbinding\/verwijderen$/, 'Видалити з’єднання віддаленого робочого столу', 'Een verbinding met een extern bureaublad verwijderen', 'Через сайт цей комп’ютер більше не відкриється.', 'Via de site opent deze computer niet meer.'],
  [/\/remote\/hosts\/opslaan$/, 'Змінити дозволені адреси віддаленого робочого столу', 'De toegestane adressen van het externe bureaublad wijzigen',
    'Сайт зможе з’єднуватися з іншим набором комп’ютерів.', 'De site kan met een andere reeks computers verbinden.', true],
  [/\/remote\/openen$/, 'Відкрити віддалений робочий стіл', 'Een extern bureaublad openen', 'У браузері відкриється керування цим комп’ютером.', 'In de browser opent de bediening van deze computer.', true],
  [/\/beveiliging\/aanzetten$/, 'Увімкнути захист сервера', 'Een bescherming van de server aanzetten',
    'Захист почне діяти одразу; якщо він сам ламатиме роботу, через 10 хвилин його вимкне запобіжник.', 'De bescherming werkt meteen; breekt die zelf iets, dan zet de zekering haar binnen 10 minuten uit.', true],
  [/\/beveiliging\/app-rol-maken$/, 'Створити обмежену роль бази даних для сайту', 'Een beperkte databaserol voor de site maken',
    'Сервер запустить службу, що створює окрему роль бази даних для сайту.', 'De server start een dienst die een aparte databaserol voor de site maakt.', true],
  [/\/impersonatie\/aanvragen$/, 'Попросити дозволу подивитися сайт як інший користувач', 'Vragen om de site te bekijken als een andere gebruiker',
    'Користувач отримає запит і сам вирішить; без його згоди нічого не відкриється.', 'De gebruiker krijgt het verzoek en beslist zelf; zonder toestemming gaat niets open.', true],
  [/\/impersonatie\/toestaan$/, 'Дозволити адміністраторові подивитися сайт як ви', 'Een beheerder de site laten bekijken als u',
    'Адміністратор бачитиме те, що бачите ви, на вказаний строк (з правом дій — і зможе діяти). Завершити можна будь-коли.', 'De beheerder ziet voor de aangegeven termijn wat u ziet (met recht op acties: kan ook handelen). Beëindigen kan altijd.', true],
  [/\/ondersteuning\/aanvragen$/, 'Попросити дозволу на підтримку користувача', 'Vragen om een gebruiker te ondersteunen',
    'Користувач отримає запит; після згоди ви бачитимете лише огляд його налаштувань, без вмісту листів і ключів.', 'De gebruiker krijgt het verzoek; na toestemming ziet u alleen een overzicht van de instellingen, zonder inhoud van mail of sleutels.', true],
  [/\/ondersteuning\/toestaan$/, 'Дозволити підтримку вашого облікового запису', 'Ondersteuning van uw account toestaan',
    'Підтримка бачитиме огляд ваших налаштувань, пристроїв і підключень (без вмісту листів і ключів) на вказаний строк.', 'De ondersteuning ziet voor de aangegeven termijn een overzicht van uw instellingen, apparaten en koppelingen (zonder inhoud van mail of sleutels).', true],
  // Дім.
  [/\/huis\/vertrouwde-toestellen$/, 'Змінити довірені пристрої дому', 'Vertrouwde apparaten van het huis wijzigen',
    'Від списку залежить, які пристрої можуть керувати домом.', 'Van de lijst hangt af welke apparaten het huis mogen bedienen.', true],
  [/\/huis\/integraties\/schrijven$/, 'Дозволити сайту керувати пристроями дому через інтеграцію', 'De site apparaten van het huis laten bedienen via een integratie',
    'Сайт зможе надсилати команди пристроям цієї інтеграції (світло, клімат тощо).', 'De site kan opdrachten sturen naar apparaten van deze integratie (licht, klimaat enz.).', true],
  [/\/huis\/opdrachten\/nieuw$/, 'Виконати важливу команду для пристрою дому', 'Een belangrijke opdracht voor een apparaat van het huis uitvoeren',
    'Пристрій (замок, сигналізація тощо) виконає команду одразу.', 'Het apparaat (slot, alarm enz.) voert de opdracht meteen uit.', true],
  // UPD-011: персональні ключі адміністраторів, 3-чинникова синхронізація та вибіркове відкликання випуску.
  [/\/uitrol\/sleutels\/aanmaken$/, 'Створити персональний ключ адміністратора для 3-чинникової довіри оновлень', 'Een persoonlijke beheersleutel voor driefactorvertrouwen van uitrollen aanmaken',
    'Одноразово буде показано персональний ключ для прив’язки GitHub, MCP-з’єднувача ШІ та сайту; у базі зберігається лише його контрольна сума.', 'De persoonlijke sleutel wordt eenmalig getoond voor koppeling van GitHub, MCP AI en de site; in de database blijft alleen de controlehash bewaard.', true],
  [/\/uitrol\/sleutels\/synchroniseren$/, 'Синхронізувати 3 чинники довіри (GitHub ↔ MCP ШІ ↔ Сайт)', 'De 3 vertrouwensfactoren synchroniseren (GitHub ↔ MCP AI ↔ Site)',
    'Буде оновлено стан взаємної прив’язки ключа, версію чинних правил і підтвердження каналів оновлень.', 'De wederzijdse sleutelkoppeling, geldende regelversie en bevestiging van updatekanalen worden bijgewerkt.', true],
  [/\/uitrol\/sleutels\/roteren$/, 'Перевипустити (ротувати) персональний ключ адміністратора', 'Een persoonlijke beheersleutel vernieuwen (roteren)',
    'Попереднє значення ключа негайно втратить чинність; новий ключ покажемо один раз для оновлення в GitHub і MCP.', 'De vorige sleutelwaarde vervalt direct; de nieuwe sleutel tonen we één keer om GitHub en MCP bij te werken.', true],
  [/\/uitrol\/sleutels\/intrekken$/, 'Відкликати персональний ключ адміністратора', 'Een persoonlijke beheersleutel intrekken',
    'Цей ключ негайно втратить чинність і більше не зможе підтверджувати завантаження чи встановлення оновлень.', 'Deze sleutel vervalt direct en kan geen uploads of installaties meer bevestigen.', true],
  [/\/uitrol\/releases\/selectief-aanvragen$/, 'Зафіксувати план вибіркового відкликання конкретного випуску', 'Een plan voor selectief intrekken van één release vastleggen',
    'Буде збережено пофайловий план відкликання лише вибраного оновлення без втрати пізніших випусків і сформовано завдання для ШІ та GitHub.', 'Er wordt een bestandsplan opgeslagen om alleen de gekozen update in te trekken zonder latere releases te verliezen, met een opdracht voor AI en GitHub.', true],
];

/** Per code van actieVoorPad (dezelfde lijst als de server). */
const PER_ACTIE: Record<string, readonly [string, string, string, string, boolean?]> = {
  'passkey-toevoegen': ['Додати passkey', 'Een passkey toevoegen', 'Новим ключем можна буде входити у ваш обліковий запис.', 'Met de nieuwe sleutel kan men in uw account inloggen.', true],
  'passkey-verwijderen': ['Видалити passkey', 'Een passkey verwijderen', 'Цим ключем більше не можна буде увійти.', 'Met deze sleutel kan men niet meer inloggen.', true],
  'passkey-vertrouwen': ['Змінити довіру до ключа доступу', 'Vertrouwen in een toegangssleutel wijzigen', 'Позначка «Довірений» з’явиться або зникне біля ключа; нових прав ключ не отримає.', 'Het label «Vertrouwd» verschijnt of verdwijnt bij de sleutel; de sleutel krijgt geen nieuwe rechten.', true],
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
  'werkruimte-overdragen': ['Передати простір іншому учасникові', 'Een werkruimte aan een ander lid overdragen', 'Новий власник керуватиме учасниками й блоками й зможе видалити простір; ви станете адміністратором.', 'De nieuwe eigenaar beheert leden en blokken en kan de werkruimte verwijderen; u wordt beheerder.', true],
  // IDENTITEIT-015 (apparaten-uitvoer): «Сесії та пристрої».
  'apparaat-melding-uit': ['Вимкнути попередження про новий пристрій', 'De waarschuwing voor een nieuw apparaat uitzetten', 'Вхід із нового пристрою більше не дасть спливного сповіщення; запис у журналі безпеки лишиться.', 'Een aanmelding vanaf een nieuw apparaat geeft geen melding meer; de regel in het beveiligingslogboek blijft.', true],
  'apparaat-vergeten': ['Забути відомий пристрій', 'Een bekend apparaat vergeten', 'Наступний вхід із цього пристрою знову вважатиметься входом з нового пристрою.', 'De volgende aanmelding vanaf dit apparaat geldt weer als nieuw apparaat.'],
  // IDENTITEIT-015: ворота входу за правилом «другий чинник обов'язковий».
  'tweede-factor': ['Завершити вхід другим чинником', 'De aanmelding afronden met een tweede factor', 'Правило сайту: після Google сеанс відкривається лише після коду із застосунку, ключа доступу або коду відновлення.', 'Regel van de site: na Google opent de sessie pas na een app-code, passkey of herstelcode.'],
  'account-verwijderen': ['Видалити обліковий запис', 'Het account verwijderen', 'Обліковий запис і дані буде видалено.', 'Het account en de gegevens worden verwijderd.', true],
  beheer: ['Дія адміністратора', 'Een beheeractie', 'Змінює налаштування сайту або інших користувачів.', 'Wijzigt instellingen van de site of van andere gebruikers.', true],
  agenten: ['Зміна в розділі «Агенти» (пристрої, ШІ-підключення)', 'Een wijziging onder «Agenten» (apparaten, AI-verbindingen)', 'Може змінити, що ШІ або пристрої можуть робити.', 'Kan wijzigen wat AI of apparaten mogen doen.', true],
  bevestigen: ['Увімкнути технічний профіль', 'Het technische profiel aanzetten', 'У цій вкладці відкриються адмін-функції.', 'In dit tabblad gaan beheerfuncties open.', true],
};

const pad = (url: string) => { const p = String(url || '').split('?')[0].split('#')[0]; try { return /^https?:/i.test(p) ? new URL(p).pathname : p; } catch { return p; } };

/**
 * Beschrijving voor het venster. `verzoek` = verzoekKern(body) van het verzoek dat om bevestiging vroeg (optioneel).
 * Onbekend → een begrijpelijke waarschuwing; het technische adres alleen in `technisch` (klein, in de details van het venster).
 */
/**
 * AGENTSCHEIDING-001 / «опис завжди» (16.11.2026, Павло: «треба щоб якийсь був реєстр, який автоматично би звідти зчитував»).
 * Tweede laag van het register: per GEBIED van de site (eerste deel van het pad). Een nieuwe knop zonder eigen regel krijgt zo toch
 * een echte zin — wat er verandert en waar u het terugdraait — in plaats van «сайт не має опису». Het werkwoord komt uit het laatste
 * deel van het pad (verwijderen → «Видалити», inschakelen → «Увімкнути», …).
 * Друга ланка реєстру: опис за розділом сайту. Нова кнопка без власного рядка однаково отримує зрозумілий опис.
 */
const PER_GEBIED: ReadonlyArray<readonly [RegExp, string, string, string, string]> = [
  [/^\/api\/owner\/connector-v2\/|^\/api\/owner\/mcp-connector\/|^\/api\/mcp(\/|-)/, 'підключень ШІ', 'AI-koppelingen', 'Змінюється, що може робити підключений ШІ. Переглянути й змінити: сторінка цього ШІ в «Агенти».', 'Wat een gekoppelde AI mag, verandert. Bekijken en wijzigen: de pagina van die AI onder «Agenten».'],
  [/^\/api\/owner\/(ai|ai-[a-z-]+|agent-namens)\//, 'доступу ШІ', 'AI-toegang', 'Змінюється, до чого мають доступ ШІ. Переглянути: «Доступ ШІ» та сторінки агентів.', 'Waartoe AI’s toegang hebben, verandert. Bekijken: «AI-toegang» en de pagina’s van de agenten.'],
  [/^\/api\/owner\/agents\//, 'пристроїв і браузерів', 'apparaten en browsers', 'Змінюється, що можуть робити ваші пристрої й розширення браузера. Переглянути: «Пристрої».', 'Wat uw apparaten en de browserextensie mogen, verandert. Bekijken: «Apparaten».'],
  [/^\/api\/owner\/(access|aanmeld|identity|passkeys|beveiliging|privacy)\//, 'входу й безпеки облікового запису', 'aanmelding en beveiliging van het account', 'Змінюється спосіб входу або захист облікового запису. Переглянути: центр облікового запису → «Безпека».', 'De manier van aanmelden of de beveiliging van het account verandert. Bekijken: accountcentrum → «Beveiliging».'],
  [/^\/api\/owner\/(sleutelkluis|vault|apps\/geheimen)/, 'сховища ключів і секретів', 'sleutelkluis en geheimen', 'Змінюється, хто й коли може прочитати ваші ключі чи секрети. Переглянути: «Сховище ключів».', 'Wie uw sleutels of geheimen wanneer kan lezen, verandert. Bekijken: «Sleutelkluis».'],
  [/^\/api\/owner\/(uitrol|admin|journaal|audit|hub)\//, 'адміністрування сайту', 'beheer van de site', 'Змінюється робота сайту для всіх користувачів (оновлення, налаштування, журнали). Переглянути: «Адміністрування».', 'De werking van de site voor alle gebruikers verandert (updates, instellingen, logboeken). Bekijken: «Beheer».'],
  [/^\/api\/owner\/(tech|ruimte|remote)\/|^\/api\/(terminal|ssh-ca)\//, 'технічного простору й сервера', 'technische ruimte en server', 'Змінюється доступ до сервера чи технічного простору. Переглянути: «Технічне».', 'De toegang tot de server of de technische ruimte verandert. Bekijken: «Technisch».'],
  [/^\/api\/(impersonatie|ondersteuning)\//, 'підтримки та входу від імені', 'ondersteuning en aanmelden namens', 'Хтось інший може побачити або діяти у вашому обліковому записі. Переглянути: «Підтримка».', 'Iemand anders kan uw account zien of erin handelen. Bekijken: «Ondersteuning».'],
  [/^\/api\/(share|huis)\//, 'спільного доступу', 'delen', 'Змінюється, що бачать інші люди. Переглянути: розділ, звідки ви поділилися.', 'Wat andere mensen zien, verandert. Bekijken: het onderdeel van waaruit u deelde.'],
  [/^\/api\/owner\/(mail|cloud|calendar|github|telegram)\//, 'підключених служб', 'gekoppelde diensten', 'Змінюється робота з вашою поштою, файлами чи іншою службою. Переглянути: сторінка цієї служби.', 'Het werken met uw e-mail, bestanden of een andere dienst verandert. Bekijken: de pagina van die dienst.'],
  [/^\/api\/owner\//, 'налаштувань вашого облікового запису', 'instellingen van uw account', 'Змінюється налаштування вашого облікового запису. Переглянути: розділ, де ви щойно натиснули кнопку.', 'Een instelling van uw account verandert. Bekijken: het onderdeel waar u net op de knop klikte.'],
];
const WERKWOORD: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/(verwijder|wissen|delete|remove|vergeet)/, 'Видалити', 'Verwijderen'],
  [/(intrek|revoke|ontkoppel|losmaken|blokkeer|block)/, 'Відкликати', 'Intrekken'],
  [/(uitschakel|disable|^uit$|-uit$|stop|pauze)/, 'Вимкнути', 'Uitzetten'],
  [/(inschakel|enable|activeer|^aan$|-aan$|start|toestaan|approve|goedkeur)/, 'Увімкнути або дозволити', 'Aanzetten of toestaan'],
  [/(toevoeg|add|create|nieuw|registreer|uitgifte|koppel)/, 'Додати', 'Toevoegen'],
  [/(exporteer|export|download|lees|toon|bekijk|reveal)/, 'Показати або вивантажити', 'Tonen of exporteren'],
];
function perGebied(p: string): StapOpBeschrijving | null {
  const g = PER_GEBIED.find(([re]) => re.test(p));
  if (!g) return null;
  const laatste = (p.split('/').filter(Boolean).pop() ?? '').toLowerCase();
  const w = WERKWOORD.find(([re]) => re.test(laatste));
  const [wUk, wNl] = w ? [w[1], w[2]] : ['Змінити', 'Wijzigen'];
  return { uk: `${wUk}: налаштування ${g[1]}`, nl: `${wNl}: instelling van ${g[2]}`, gevolgUk: `${g[3]} Якщо ви щойно не натискали таку кнопку — скасуйте.`,
    gevolgNl: `${g[4]} Klikte u niet net op zo’n knop, annuleer dan.`, bekend: true, gevaar: true, algemeen: true, technisch: p.slice(0, 120) };
}

export function beschrijfStapOp(actie: string | undefined, url = '', verzoek: VerzoekKern = {}): StapOpBeschrijving {
  const p = pad(url);
  for (const r of PER_PAD) {
    if (!p || !r[0].test(p)) continue;
    const [uk, nl, gevolgUk, gevolgNl, gevaar] = typeof r[1] === 'function' ? r[1](verzoek) : (r.slice(1) as unknown as Tekst);
    return { uk, nl, gevolgUk, gevolgNl, bekend: true, gevaar: !!gevaar };
  }
  const a = actie ? PER_ACTIE[actie] : undefined;
  if (a) return { uk: a[0], nl: a[1], gevolgUk: a[2], gevolgNl: a[3], bekend: true, gevaar: !!a[4] };
  const g = p ? perGebied(p) : null;
  if (g) return g;
  return {
    uk: 'Важлива дія, для якої сайт не має опису', nl: 'Een belangrijke actie waarvan de site geen beschrijving heeft',
    gevolgUk: 'Сайт не може сказати, що саме зміниться. Якщо ви щойно не натискали кнопку, яка мала б цього вимагати, — скасуйте.',
    gevolgNl: 'De site kan niet zeggen wat er precies verandert. Klikte u niet net op een knop die hierom zou vragen, annuleer dan.',
    bekend: false, gevaar: true, technisch: p ? p.slice(0, 120) : undefined,
  };
}
