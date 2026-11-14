// UI-014 — REGISTER VAN MELDINGSSOORTEN: per soort wat de mens moet weten (wie, wat, wanneer, waarom, gevolg, wat te doen, rechten)
// en welke snelle acties de kaart biedt. Elke soort MOET uitleg + minstens één actie + een deeplink hebben; dat dwingt
// tests/eenheid/meldingen-uitleg-20261030.test.ts af. Nieuwe soort = hier een regel toevoegen, anders valt hij op «algemeen».
//
// Veiligheid: «gevaarlijke» acties (intrekken, verbieden, sessie beëindigen) voeren hier NOOIT iets uit. Ze openen de pagina waar
// de bestaande bevestiging/step-up (passkey) geldt. Er is geen enkele automatische actie.
//
// Niets verzinnen: velden komen uit de melding zelf (titel/tekst/link/bron). Wat de bron niet geeft, staat er eerlijk als
// «джерело не передало» (zie veld()).
import type { V2Melding } from './groepering';

type Tw = readonly [uk: string, nl: string];
export type Risico = 'laag' | 'midden' | 'hoog';
export type ActieSoort = 'openen' | 'wijziging' | 'intrekken' | 'niet-ik' | 'dit-was-ik' | 'beslissen' | 'type-stil' | 'later' | 'gelezen';
export type UitlegActie = {
  soort: ActieSoort;
  label: Tw;
  /** Voor link-acties: het exacte doel. Afwezig = handeling in de kaart zelf (gelezen, later, type-stil). */
  href?: (m: V2Melding) => string | undefined;
  /** Gevaarlijk: alleen via de doelpagina met bevestiging/step-up. De kaart vraagt bovendien eerst «Точно?». */
  gevaarlijk?: boolean;
};
export type UitlegSoort = {
  id: string;
  /** Welke meldingen deze soort beschrijft. Volgorde in REGISTER telt: de eerste die past wint. */
  past: (m: V2Melding) => boolean;
  /** Mensentitel als de bron alleen een code gaf (anders de titel van de bron). */
  titel?: Tw;
  risico: Risico;
  wat: Tw;
  waarom: Tw;
  gevolg: Tw;
  doen: Tw;
  /** Bij toegang/rechten: waartoe en met welke rechten. */
  rechten?: Tw;
  /** Deeplink naar het exacte object/de bronpagina. */
  deeplink: (m: V2Melding) => string;
  acties: UitlegActie[];
};

const ID = 'https://id.tarasevych.com';
const MCP = 'https://mcp.tarasevych.com/agents';
const UPD = 'https://admin.tarasevych.com/updates';
const viaLink = (vast: string) => (m: V2Melding) => (m.link && /^(\/|https:\/\/([a-z0-9-]+\.)?tarasevych\.com\/)/.test(m.link) ? m.link : vast);
const s = (m: V2Melding) => `${m.soort || ''} ${m.categorie || ''}`.toLowerCase();
const tekst = (m: V2Melding) => `${m.titel} ${m.tekst || ''}`.toLowerCase();

// Algemene acties die elke kaart heeft (naast de soort-eigen): gelezen, later. Niet in de register-test meegeteld.
export const ALGEMENE_ACTIES: UitlegActie[] = [
  { soort: 'gelezen', label: ['Позначити прочитаним', 'Als gelezen markeren'] },
  { soort: 'later', label: ['Нагадати через годину', 'Over een uur herinneren'] },
];

export const REGISTER: UitlegSoort[] = [
  // ---- SEC-002 (afwerking): weigeringen, grenzen en zekeringen die de server sinds het audit meldt. Vooraan, want ze passen
  //      alleen op hun eigen soort of tekst; anders zouden ze in de algemene «beveiliging»/«пошта»/«algemeen» vallen.
  {
    id: 'beveiliging-zekering',
    past: (m) => /^beveiliging\.zekering$/.test(m.soort || ''),
    titel: ['Захист сайту змінив стан', 'Een beveiliging van de site veranderde van stand'],
    risico: 'hoog',
    wat: ['Захист сайту (RLS, перевірка входу, політики доступу або повторне підтвердження входу) увімкнено, вимкнено чи він не діє.', 'Een beveiliging van de site (RLS, aanmeldpoort, toegangsbeleid of herbevestiging van de aanmelding) is aan- of uitgezet of werkt niet.'],
    waarom: ['Сервер побачив збої після ввімкнення або змінну аварійного вимкнення (STAP_OP_UIT_TOT / STAP_OP_UIT) у налаштуваннях сервера.', 'De server zag storingen na het aanzetten of een noodschakelaar (STAP_OP_UIT_TOT / STAP_OP_UIT) in de serverinstellingen.'],
    gevolg: ['Поки захист вимкнено, відповідні дії виконуються з самим лише сеансом — сайт менш захищений.', 'Zolang de beveiliging uit staat, gaan die handelingen met alleen een sessie — de site is minder beschermd.'],
    doen: ['Відкрийте «Захист», перевірте причину й увімкніть захист знову, щойно це безпечно.', 'Open «Bescherming», bekijk de oorzaak en zet de beveiliging weer aan zodra dat veilig is.'],
    deeplink: viaLink('https://admin.tarasevych.com/diagnostiek'),
    acties: [
      { soort: 'openen', label: ['Відкрити «Захист»', '«Bescherming» openen'], href: viaLink('https://admin.tarasevych.com/diagnostiek') },
    ],
  },
  {
    id: 'notities-zoeken-te-zwaar',
    past: (m) => /(пошук у нотатках зупинено|zoeken in notities gestopt)/.test(tekst(m)),
    risico: 'midden',
    wat: ['Пошук у ваших нотатках зупинено, бо він тривав довше за 5 секунд.', 'Een zoekopdracht in uw notities is gestopt omdat ze langer dan 5 seconden duurde.'],
    waarom: ['Дуже довгі чи численні слова змушують базу даних перебирати весь текст. Так буває при випадковому вставленні великого тексту в поле пошуку — або коли хтось навмисно навантажує сайт вашим обліковим записом чи агентом ШІ.', 'Heel lange of veel woorden laten de database alle tekst doorlopen. Dat gebeurt als er per ongeluk veel tekst in het zoekveld staat — of als iemand de site met uw account of een AI-agent bewust belast.'],
    gevolg: ['Нотатки не змінено; список і звичайний пошук працюють далі. Запис про це є в журналі (без тексту запиту).', 'Er is niets aan de notities gewijzigd; de lijst en gewoon zoeken werken verder. Er staat een regel in het journaal (zonder de zoektekst).'],
    doen: ['Якщо це не ви — перегляньте сеанси й доступи агентів ШІ у «Способах входу» та «Агентах».', 'Was u het niet, bekijk dan de sessies en de toegang van AI-agenten bij «Aanmeldmethoden» en «Agenten».'],
    deeplink: viaLink('https://hub.tarasevych.com/notities'),
    acties: [
      { soort: 'openen', label: ['Відкрити нотатки', 'Notities openen'], href: viaLink('https://hub.tarasevych.com/notities') },
      { soort: 'niet-ik', label: ['Це був не я', 'Dit was ik niet'], href: () => `${ID}/`, gevaarlijk: true },
    ],
  },
  // IDENTITEIT-015 (profiel-blokken): eigendom van een werkruimte overgedragen (aan mij, of door mij). Vóór «beveiliging».
  {
    id: 'werkruimte-overdracht',
    past: (m) => m.soort === 'workspace_ownership_transferred',
    risico: 'hoog',
    wat: ['Змінився власник спільного простору: вам передали простір або ви передали свій іншій людині.', 'De eigenaar van een gedeelde werkruimte is gewijzigd: u kreeg een werkruimte, of u droeg de uwe over.'],
    waarom: ['Власник простору обрав нового власника серед адміністраторів і редакторів і підтвердив дію.', 'De eigenaar koos een nieuwe eigenaar onder de beheerders en bewerkers en bevestigde de handeling.'],
    gevolg: ['Новий власник керує учасниками й блоками й може видалити простір; попередній лишається адміністратором.', 'De nieuwe eigenaar beheert leden en blokken en kan de werkruimte verwijderen; de vorige blijft beheerder.'],
    doen: ['Якщо ви цього не робили — змініть спосіб входу й зверніться до нового власника простору.', 'Deed u dit niet, wijzig dan uw aanmelding en neem contact op met de nieuwe eigenaar.'],
    deeplink: viaLink('https://hub.tarasevych.com/'),
    acties: [
      { soort: 'openen', label: ['Відкрити простір', 'Werkruimte openen'], href: viaLink('https://hub.tarasevych.com/') },
    ],
  },
  // IDENTITEIT-014: rechten in een gedeelde ruimte. Vóór «beveiliging»: «workspace_access_revoked» bevat «access_» en zou anders
  // als accountbeveiliging (met «Це був я») worden uitgelegd — het gaat om een ruimte van iemand anders, niet om uw aanmelding.
  // IDENTITEIT-014 (herstel): de maker van een privélink krijgt een spoor in het meldingencentrum — de link is een geheim.
  {
    id: 'delen-link',
    past: (m) => m.soort === 'workspace_share_link_created',
    risico: 'midden',
    wat: ['Ви створили посилання-запрошення до спільного простору.', 'U maakte een uitnodigingslink voor een gedeelde werkruimte.'],
    waarom: ['Посилання дає вибрану роль першому, хто його відкриє й увійде; воно одноразове й діє 7 днів.', 'De link geeft de gekozen rol aan wie hem als eerste opent en zich aanmeldt; hij is eenmalig en 7 dagen geldig.'],
    gevolg: ['Будь-хто, до кого потрапить посилання, може ним скористатися — навіть не та людина, якій ви його надіслали.', 'Iedereen die de link in handen krijgt, kan hem gebruiken — ook iemand anders dan aan wie u hem stuurde.'],
    doen: ['Надсилайте посилання лише особисто. Якщо його створили не ви — захистіть вхід і перевірте учасників простору.', 'Stuur de link alleen persoonlijk. Maakte u hem niet, beveilig dan uw aanmelding en controleer de leden.'],
    deeplink: viaLink('https://hub.tarasevych.com/'),
    acties: [
      { soort: 'openen', label: ['Відкрити простір', 'Werkruimte openen'], href: viaLink('https://hub.tarasevych.com/') },
      { soort: 'type-stil', label: ['Тихо для цього типу', 'Stil voor dit soort'] },
    ],
  },
  {
    id: 'delen-rechten',
    past: (m) => /^workspace_(role_changed|access_revoked|invite_accepted)$/.test(m.soort || ''),
    risico: 'midden',
    wat: ['Змінилися права в спільному просторі: ваша роль, ваш доступ або хтось прийняв ваше запрошення.', 'De rechten in een gedeelde werkruimte zijn gewijzigd: uw rol, uw toegang, of iemand nam uw uitnodiging aan.'],
    waarom: ['Власник або адміністратор простору змінив учасників, або людина скористалася запрошенням.', 'De eigenaar of een beheerder van de werkruimte wijzigde de leden, of iemand gebruikte een uitnodiging.'],
    gevolg: ['Від ролі залежить, чи можна лише переглядати, редагувати або запрошувати інших; після відкликання простір зникає зі списку.', 'De rol bepaalt of u alleen kunt bekijken, kunt bewerken of anderen kunt uitnodigen; na intrekken verdwijnt de werkruimte uit de lijst.'],
    doen: ['Якщо зміна несподівана — зверніться до власника простору. Якщо до вас приєднався незнайомець — змініть його роль або відкличте доступ у списку учасників.', 'Komt de wijziging onverwacht, neem contact op met de eigenaar. Sloot een onbekende aan, wijzig dan zijn rol of trek de toegang in via de ledenlijst.'],
    rechten: ['Адміністратор може запрошувати, змінювати ролі й відкликати доступ; редагування — змінювати блоки; перегляд — лише читати.', 'Een beheerder kan uitnodigen, rollen wijzigen en toegang intrekken; bewerken = blokken wijzigen; lezen = alleen bekijken.'],
    deeplink: viaLink('https://hub.tarasevych.com/'),
    acties: [
      { soort: 'openen', label: ['Відкрити простір', 'Werkruimte openen'], href: viaLink('https://hub.tarasevych.com/') },
      { soort: 'type-stil', label: ['Тихо для цього типу', 'Stil voor dit soort'] },
    ],
  },
  {
    id: 'mail-wachtrij',
    past: (m) => /^mail_queue_(refused|cancelled)$/.test(m.soort || ''),
    risico: 'midden',
    wat: ['Запланований лист не надіслано або заплановані листи скасовано.', 'Een gepland bericht is niet verzonden of geplande berichten zijn geannuleerd.'],
    waarom: ['На момент надсилання цей простір більше не мав права надсилати з цієї скриньки (наприклад, скриньку відключено чи доступ змінено).', 'Op het moment van verzenden mocht deze ruimte niet meer vanuit deze mailbox verzenden (bijvoorbeeld de mailbox is losgekoppeld of de toegang is gewijzigd).'],
    gevolg: ['Лист лишився неотриманим — адресат його не бачив.', 'Het bericht is niet aangekomen — de ontvanger heeft het niet gezien.'],
    doen: ['Відкрийте пошту, перевірте підключення скриньки й надішліть лист знову.', 'Open de mail, controleer de koppeling van de mailbox en verstuur het bericht opnieuw.'],
    deeplink: viaLink('https://mail.tarasevych.com/'),
    acties: [
      { soort: 'openen', label: ['Відкрити пошту', 'Mail openen'], href: viaLink('https://mail.tarasevych.com/') },
    ],
  },
  {
    id: 'cloud-alleen-lezen',
    past: (m) => /^cloud_alleen_lezen$/.test(m.soort || ''),
    risico: 'laag',
    wat: ['Спробу змінити файл у хмарі відхилено: ваша роль — лише перегляд.', 'Een poging om iets in de cloud te wijzigen is geweigerd: uw rol is alleen-lezen.'],
    waarom: ['Власник простору надав вам доступ лише для перегляду; спробу записано в журнал.', 'De eigenaar van de ruimte gaf u alleen leestoegang; de poging staat in het journaal.'],
    gevolg: ['Нічого не змінено. Переглядати й завантажувати файли ви можете як і раніше.', 'Er is niets gewijzigd. Bekijken en downloaden kan gewoon verder.'],
    doen: ['Якщо вам потрібен запис — попросіть власника простору змінити вашу роль. Якщо це не ви — перегляньте сеанси.', 'Hebt u schrijfrecht nodig, vraag de eigenaar van de ruimte dan uw rol aan te passen. Was u het niet, bekijk dan uw sessies.'],
    deeplink: viaLink('https://cloud.tarasevych.com/'),
    acties: [
      { soort: 'openen', label: ['Відкрити хмару', 'Cloud openen'], href: viaLink('https://cloud.tarasevych.com/') },
    ],
  },
  {
    // SEC-002 (slot «u»): dezelfde weigering buiten de hmara (notities, woning, agenda, toegang, werkblad …). De server stuurt soort
    // toegang_alleen_lezen (hoogstens één per uur per account, zoals cloud_alleen_lezen); de route staat in de tekst van de melding.
    id: 'rol-alleen-lezen',
    past: (m) => /^toegang_alleen_lezen$/.test(m.soort || '') || (/alleen_lezen$/.test(m.soort || '') && !/^cloud_/.test(m.soort || '')),
    titel: ['Зміну відхилено: ваша роль — лише перегляд', 'Wijziging geweigerd: uw rol is alleen-lezen'],
    risico: 'laag',
    wat: ['Спробу щось змінити (нотатку, оселю, календар, налаштування тощо) відхилено: ваша роль — лише перегляд.', 'Een poging om iets te wijzigen (een notitie, de woning, de agenda, instellingen enzovoort) is geweigerd: uw rol is alleen-lezen.'],
    waarom: ['Власник або адміністратор сайту надав вашому обліковому запису роль «лише перегляд»: ви бачите й читаєте все, що вам відкрито, але змінювати можуть лише учасники з повним доступом, адміністратори й власник. Спробу записано в журнал.', 'De eigenaar of een beheerder van de site gaf uw account de rol «alleen-lezen»: u ziet en leest alles wat voor u openstaat, maar wijzigen kunnen alleen leden met volledige toegang, beheerders en de eigenaar. De poging staat in het journaal.'],
    gevolg: ['Нічого не змінено. Переглядати й читати ви можете як і раніше.', 'Er is niets gewijzigd. Bekijken en lezen kan gewoon verder.'],
    doen: ['Якщо вам потрібно змінювати — попросіть власника або адміністратора сайту змінити вашу роль (Адміністрування → Користувачі). Якщо ви нічого не змінювали — перегляньте свої сеанси й доступи агентів ШІ.', 'Moet u kunnen wijzigen, vraag dan de eigenaar of een beheerder van de site uw rol aan te passen (Beheer → Gebruikers). Hebt u niets geprobeerd te wijzigen, bekijk dan uw sessies en de toegang van AI-agenten.'],
    rechten: ['Роль «лише перегляд»: читання — так, будь-які зміни — ні.', 'Rol «alleen-lezen»: lezen — ja, wijzigingen — nee.'],
    deeplink: viaLink(`${ID}/`),
    acties: [
      { soort: 'openen', label: ['Перевірити сеанси', 'Sessies bekijken'], href: viaLink(`${ID}/`) },
      { soort: 'niet-ik', label: ['Це був не я', 'Dit was ik niet'], href: () => `${ID}/`, gevaarlijk: true },
    ],
  },
  {
    // SEC-002 (slot «u»): melding van backend/beveiliging-meldingen.ts «json-vereist» (soort security, hoogstens één per uur).
    id: 'json-vereist',
    past: (m) => /(запит-форму з вашим сеансом|formulierverzoek met uw sessie)/.test(tekst(m)),
    risico: 'midden',
    wat: ['Сайт відхилив дію, яку надіслали як звичайну форму з вашим сеансом (а не як запит самої сторінки сайту).', 'De site weigerde een actie die als gewoon formulier met uw sessie werd verstuurd (niet als verzoek van een pagina van de site zelf).'],
    waarom: ['Так виглядає підроблена форма на чужій сторінці, яка намагається діяти від вашого імені. Буває й безпечна причина — дуже стара вкладка сайту.', 'Zo ziet een nagemaakt formulier op een andere pagina eruit dat uit uw naam probeert te handelen. Een onschuldige oorzaak kan ook: een heel oud tabblad van de site.'],
    gevolg: ['Нічого не змінено: сервер приймає дії лише від сторінок сайту. Запис є в журналі.', 'Er is niets gewijzigd: de server neemt acties alleen aan van pagina’s van de site. Er staat een regel in het journaal.'],
    doen: ['Оновіть відкриті вкладки сайту. Якщо ви нічого не робили — закрийте незнайомі сторінки й перегляньте свої сеанси.', 'Ververs de open tabbladen van de site. Deed u niets, sluit dan onbekende pagina’s en bekijk uw sessies.'],
    deeplink: viaLink(`${ID}/`),
    acties: [
      { soort: 'openen', label: ['Перевірити сеанси', 'Sessies bekijken'], href: viaLink(`${ID}/`) },
      { soort: 'niet-ik', label: ['Це був не я', 'Dit was ik niet'], href: () => `${ID}/`, gevaarlijk: true },
    ],
  },
  {
    // SEC-002 (slot «u»): melding «consent-andere-browser» (soort security): toestemming voor een AI-koppeling in een andere browser.
    id: 'consent-andere-browser',
    past: (m) => /(в іншому браузері — доступ не видано|in een andere browser — geen toegang)/.test(tekst(m)),
    risico: 'hoog',
    wat: ['Вікно згоди на підключення ШІ відкрили не в тому браузері, де підключення почалося. Доступ не видано.', 'Het toestemmingsvenster voor een AI-koppeling werd geopend in een andere browser dan waarin de koppeling begon. Er is geen toegang gegeven.'],
    waarom: ['Так буває, коли хтось надсилає вам посилання на підключення свого ШІ, щоб ви підтвердили йому доступ до свого облікового запису. Згода діє лише в тому браузері, де підключення почали.', 'Dat gebeurt als iemand u een koppellink van zijn eigen AI stuurt, zodat u hem toegang tot uw account geeft. De toestemming geldt alleen in de browser waarin de koppeling begon.'],
    gevolg: ['Жодного доступу не видано; наявні підключення ШІ не змінено.', 'Er is geen toegang gegeven; bestaande AI-koppelingen zijn niet gewijzigd.'],
    doen: ['Якщо ви самі підключаєте ШІ — почніть заново в цьому браузері. Якщо посилання вам надіслали — не відкривайте його й перегляньте підключені ШІ.', 'Koppelt u zelf een AI, begin dan opnieuw in deze browser. Kreeg u de link toegestuurd, open hem dan niet en bekijk de gekoppelde AI’s.'],
    rechten: ['Згода дала б ШІ доступ до вашого простору з правами, що були в запиті.', 'De toestemming zou de AI toegang tot uw ruimte geven met de rechten uit het verzoek.'],
    deeplink: viaLink(MCP),
    acties: [
      { soort: 'openen', label: ['Підключені ШІ', 'Gekoppelde AI’s'], href: viaLink(MCP) },
      { soort: 'niet-ik', label: ['Це був не я', 'Dit was ik niet'], href: () => `${ID}/`, gevaarlijk: true },
    ],
  },
  {
    id: 'agenda-grens',
    past: (m) => (m.dienst === 'agenda' || /agenda|calendar/.test(s(m))) && /(забагато|завеликий|te veel|te groot)/.test(tekst(m)),
    risico: 'laag',
    wat: ['Календар упирається в межу: забагато оновлень поспіль або забагато подій для збереження.', 'De agenda loopt tegen een grens aan: te veel verversingen na elkaar of te veel afspraken om te bewaren.'],
    waarom: ['Межі захищають сервер і сторонні календарі від перевантаження (наприклад, коли агент ШІ «застряг у циклі»).', 'De grenzen beschermen de server en de externe agenda’s tegen overbelasting (bijvoorbeeld als een AI-agent «in een lus vastzit»).'],
    gevolg: ['Частину подій не збережено або оновлення відкладено; наявні дані не зіпсовано.', 'Een deel van de afspraken is niet bewaard of de verversing is uitgesteld; bestaande gegevens zijn niet beschadigd.'],
    doen: ['Зачекайте кілька хвилин перед новим оновленням; завеликий календар приховайте або вилучіть зайві календарі.', 'Wacht enkele minuten voor een nieuwe verversing; verberg een te grote agenda of verwijder overbodige agenda’s.'],
    deeplink: viaLink('https://hub.tarasevych.com/agenda'),
    acties: [
      { soort: 'openen', label: ['Відкрити календар', 'Agenda openen'], href: viaLink('https://hub.tarasevych.com/agenda') },
      { soort: 'type-stil', label: ['Тихо для цього типу', 'Stil voor dit soort'] },
    ],
  },
  {
    id: 'grens-uitnodigingen',
    past: (m) => /(ліміт запрошень|limiet voor uitnodigingen|забагато запрошень|te veel uitnodigingen)/.test(tekst(m)),
    risico: 'midden',
    wat: ['Вичерпано межу запрошень за годину: нові запрошення тимчасово не надсилаються.', 'De grens voor uitnodigingen per uur is bereikt: nieuwe uitnodigingen gaan tijdelijk niet uit.'],
    waarom: ['Межа не дає перебирати адреси пошти (щоб дізнатися, хто має обліковий запис) і розсилати спам від вашого імені.', 'De grens voorkomt dat e-mailadressen worden afgetast (wie heeft een account) en dat er spam uit uw naam vertrekt.'],
    gevolg: ['Уже надіслані запрошення діють; нові можна надіслати через годину.', 'Al verstuurde uitnodigingen gelden; nieuwe kunnen over een uur.'],
    doen: ['Якщо ви не надсилали стільки запрошень — перегляньте сеанси й доступи агентів ШІ.', 'Hebt u niet zoveel uitnodigingen verstuurd, bekijk dan uw sessies en de toegang van AI-agenten.'],
    deeplink: viaLink(`${ID}/`),
    acties: [
      { soort: 'openen', label: ['Перевірити сеанси', 'Sessies bekijken'], href: viaLink(`${ID}/`) },
      { soort: 'niet-ik', label: ['Це був не я', 'Dit was ik niet'], href: () => `${ID}/`, gevaarlijk: true },
    ],
  },
  // ---- UI-014 fase 2A: aanmeldingen en aanmeldmethoden (vóór «beveiliging», want de eerste passende soort wint)
  {
    id: 'nieuw-apparaat',
    past: (m) => /security/.test(s(m)) && /(новий вхід|новому пристрої|nieuwe aanmelding|nieuw apparaat)/.test(tekst(m)),
    titel: ['Новий вхід на новому пристрої', 'Nieuwe aanmelding op een nieuw apparaat'],
    risico: 'hoog',
    wat: ['У ваш обліковий запис увійшли з пристрою або браузера, якого тут раніше не було (пристрій, регіон за IP і спосіб — у тексті).', 'Er is aangemeld op uw account vanaf een apparaat of browser dat hier nog niet was (apparaat, regio volgens IP en methode in de tekst).'],
    waarom: ['Вхід пройшов успішно (Google, passkey або код). Повідомлення приходить один раз на кожен новий пристрій.', 'De aanmelding is gelukt (Google, passkey of code). De melding komt één keer per nieuw apparaat.'],
    gevolg: ['Цей пристрій зараз має повний доступ вашого облікового запису, доки сеанс не завершиться.', 'Dit apparaat heeft nu de volledige toegang van uw account tot de sessie eindigt.'],
    doen: ['Якщо це ви — «Це був я». Якщо ні — завершіть цей сеанс і змініть спосіб входу (з підтвердженням).', 'Was u het: «Dit was ik». Zo niet: beëindig deze sessie en wijzig uw aanmeldmethode (met bevestiging).'],
    rechten: ['Сеанс має ті самі права, що й ви. Регіон визначено приблизно за IP, точну адресу не зберігаємо.', 'De sessie heeft dezelfde rechten als u. De regio is bij benadering uit het IP; het adres wordt niet bewaard.'],
    deeplink: viaLink(`${ID}/sessions`),
    acties: [
      { soort: 'dit-was-ik', label: ['Це був я', 'Dit was ik'] },
      { soort: 'niet-ik', label: ['Це не я — завершити сеанс і змінити доступ', 'Dit was ik niet — sessie beëindigen en toegang wijzigen'], href: viaLink(`${ID}/sessions`), gevaarlijk: true },
      { soort: 'wijziging', label: ['Способи входу', 'Aanmeldmethoden'], href: () => `${ID}/methods` },
    ],
  },
  {
    id: 'code-ander-apparaat',
    past: (m) => /security/.test(s(m)) && /(з іншого пристрою|vanaf een ander apparaat)/.test(tekst(m)),
    titel: ['Код доступу використано з іншого пристрою', 'Toegangscode gebruikt vanaf een ander apparaat'],
    risico: 'hoog',
    wat: ['Ваш код доступу для гостя використали на пристрої, з якого цим кодом ще не входили.', 'Uw toegangscode voor een gast is gebruikt op een apparaat dat deze code nog niet gebruikte.'],
    waarom: ['Код могли передати іншій людині, або гість відкрив його на іншому телефоні чи комп’ютері.', 'De code kan zijn doorgegeven, of de gast opende hem op een andere telefoon of computer.'],
    gevolg: ['Цей пристрій бачить лише те, що дозволяє код (тільки читання), доки код діє.', 'Dit apparaat ziet alleen wat de code toelaat (alleen lezen), zolang de code geldig is.'],
    doen: ['Якщо не впевнені — завершіть гостьовий сеанс і відкличте код (з підтвердженням).', 'Twijfelt u: beëindig de gastsessie en trek de code in (met bevestiging).'],
    rechten: ['Лише дозволи, обрані при створенні коду; без змін і без входу як власник.', 'Alleen de rechten gekozen bij het maken van de code; geen wijzigingen en geen aanmelding als eigenaar.'],
    deeplink: viaLink(`${ID}/methods#toegangscodes`),
    acties: [
      { soort: 'openen', label: ['Відкрити код', 'Code openen'], href: viaLink(`${ID}/methods#toegangscodes`) },
      { soort: 'intrekken', label: ['Відкликати код…', 'Code intrekken…'], href: viaLink(`${ID}/methods#toegangscodes`), gevaarlijk: true },
    ],
  },
  {
    // IDENTITEIT-014: geen «Це були ви?» — dit is een herinnering, geen verdachte handeling. Moet vóór 'herstelcode' staan (eerste die past wint).
    id: 'herstelcodes-bijna-op',
    past: (m) => m.soort === 'access_recovery_low',
    titel: ['Залишилося мало кодів відновлення', 'Weinig herstelcodes over'],
    risico: 'midden',
    wat: ['Після останнього використання залишилося 2 коди відновлення або менше.', 'Na het laatste gebruik zijn er nog 2 of minder herstelcodes over.'],
    waarom: ['Кожен код діє лише один раз. Ви підтверджували вхід чи важливі дії кодами замість телефона або ключа доступу.', 'Elke code werkt maar één keer. U bevestigde aanmelden of belangrijke handelingen met codes in plaats van telefoon of passkey.'],
    gevolg: ['Коли коди закінчаться, після втрати телефона чи ключа доступу увійти буде неможливо. Нове сповіщення для цього набору не прийде.', 'Zijn de codes op, dan kunt u na verlies van telefoon of passkey niet meer aanmelden. Voor deze set komt geen nieuwe melding.'],
    doen: ['Створіть новий набір кодів (з підтвердженням) і збережіть його поза цим пристроєм. Старі коди тоді перестануть діяти. Вимкнути це нагадування можна в Меню → Сповіщення в меню.', 'Maak een nieuwe set codes (met bevestiging) en bewaar die buiten dit apparaat; de oude codes werken dan niet meer. Deze herinnering zet u uit via Menu → Meldingen in het menu.'],
    deeplink: viaLink(`${ID}/recovery#aanmeldmethoden-herstel`),
    acties: [
      { soort: 'wijziging', label: ['Створити нові коди', 'Nieuwe codes maken'], href: () => `${ID}/recovery#aanmeldmethoden-herstel` },
    ],
  },
  {
    id: 'herstelcode',
    past: (m) => /access_recovery/.test(m.soort || '') || /(код відновлення|коди відновлення|herstelcode)/.test(tekst(m)),
    titel: ['Коди відновлення', 'Herstelcodes'],
    risico: 'hoog',
    wat: ['Використано один код відновлення або створено нові коди відновлення.', 'Er is een herstelcode gebruikt of er zijn nieuwe herstelcodes gemaakt.'],
    waarom: ['Хтось підтвердив дію кодом відновлення замість passkey, або замінив набір кодів.', 'Iemand bevestigde een actie met een herstelcode in plaats van een passkey, of verving de set codes.'],
    gevolg: ['Використаний код більше не діє. Після заміни старі коди не діють зовсім.', 'Een gebruikte code werkt niet meer. Na vervangen werken de oude codes helemaal niet meer.'],
    doen: ['Якщо це ви — нічого. Якщо ні — завершіть чужі сеанси й створіть нові коди (з підтвердженням).', 'Was u het: niets. Zo niet: beëindig vreemde sessies en maak nieuwe codes (met bevestiging).'],
    deeplink: viaLink(`${ID}/methods`),
    acties: [
      { soort: 'dit-was-ik', label: ['Це був я', 'Dit was ik'] },
      { soort: 'niet-ik', label: ['Це не я — сеанси…', 'Dit was ik niet — sessies…'], href: () => `${ID}/sessions`, gevaarlijk: true },
      { soort: 'wijziging', label: ['Коди відновлення', 'Herstelcodes'], href: () => `${ID}/methods` },
    ],
  },
  {
    id: 'passkey-gewijzigd',
    past: (m) => /^security$/.test(m.soort || '') && /passkey/.test(tekst(m)) && /(додано|видалено|toegevoegd|verwijderd|новий passkey|nieuwe passkey)/.test(tekst(m)),
    titel: ['Змінено passkey', 'Passkey gewijzigd'],
    risico: 'hoog',
    wat: ['До способів входу додано passkey або його видалено (назва — у тексті).', 'Er is een passkey toegevoegd aan of verwijderd uit uw aanmeldmethoden (naam in de tekst).'],
    waarom: ['Зміну зробили з сеансу вашого облікового запису після підтвердження.', 'De wijziging gebeurde vanuit een sessie van uw account, na bevestiging.'],
    gevolg: ['Доданий passkey може підтверджувати дії від вашого імені. Видалений більше не діє.', 'Een toegevoegde passkey kan acties namens u bevestigen. Een verwijderde werkt niet meer.'],
    doen: ['Якщо це ви — нічого. Якщо ні — відкрийте способи входу, видаліть чужий passkey і завершіть чужі сеанси.', 'Was u het: niets. Zo niet: open aanmeldmethoden, verwijder de vreemde passkey en beëindig vreemde sessies.'],
    rechten: ['Passkey дає вхід і підтвердження дій; схвалювати оновлення сервера — лише після окремого дозволу root.', 'Een passkey geeft aanmelden en bevestigen; updates goedkeuren pas na een aparte toestemming van root.'],
    deeplink: viaLink(`${ID}/methods`),
    acties: [
      { soort: 'dit-was-ik', label: ['Це був я', 'Dit was ik'] },
      { soort: 'wijziging', label: ['Способи входу', 'Aanmeldmethoden'], href: () => `${ID}/methods` },
      { soort: 'niet-ik', label: ['Це не я — сеанси…', 'Dit was ik niet — sessies…'], href: () => `${ID}/sessions`, gevaarlijk: true },
    ],
  },
  {
    id: 'uitrol-recht-ingetrokken',
    past: (m) => /security/.test(s(m)) && /(відкликан|ingetrokken)/.test(tekst(m)) && /(оновлен|update)/.test(tekst(m)),
    risico: 'hoog',
    wat: ['Право готувати оновлення сайту (завантажувати пакети на схвалення) забрано в облікового запису або агента.', 'Het recht om site-updates voor te bereiden (pakketten ter goedkeuring uploaden) is ingetrokken.'],
    waarom: ['Причину вказав той, хто відкликав (вона в тексті). Відкликати може власник або адміністратор.', 'De reden staat in de tekst; intrekken kan de eigenaar of een beheerder.'],
    gevolg: ['Нові пакети від цього облікового запису чи агента більше не приймаються. Пакети, що вже чекають, лишаються — їх можна відхилити.', 'Nieuwe pakketten van dit account of deze agent worden niet meer aanvaard. Wachtende pakketten blijven; u kunt ze afwijzen.'],
    doen: ['Якщо це зробили ви — нічого. Якщо ні — перегляньте зміну, скасуйте її і змініть ключ входу.', 'Deed u dit zelf: niets. Zo niet: bekijk de wijziging, draai ze terug en wijzig uw aanmeldsleutel.'],
    rechten: ['Право дозволяло лише завантажувати пакети. Встановлення завжди потребує вашого passkey.', 'Het recht liet alleen uploaden toe. Installeren vraagt altijd uw passkey.'],
    deeplink: viaLink(`${ID}/methods`),
    acties: [
      { soort: 'wijziging', label: ['Переглянути зміну', 'Wijziging bekijken'], href: viaLink(`${ID}/methods`) },
      { soort: 'niet-ik', label: ['Це не я — скасувати зміну', 'Dit was ik niet — terugdraaien'], href: viaLink(`${ID}/methods`), gevaarlijk: true },
      { soort: 'openen', label: ['Хто має доступ до оновлень', 'Wie heeft toegang tot updates'], href: () => `${UPD}#toegang` },
    ],
  },
  {
    id: 'uitrol-recht-gegeven',
    past: (m) => /security/.test(s(m)) && /(надано|gegeven)/.test(tekst(m)) && /(оновлен|update)/.test(tekst(m)),
    risico: 'midden',
    wat: ['Обліковий запис або агент отримав право готувати оновлення сайту.', 'Een account of agent kreeg het recht om site-updates voor te bereiden.'],
    waarom: ['Право надав власник (ім’я в тексті) на вказаний строк.', 'De eigenaar (naam in de tekst) gaf het recht voor de vermelde termijn.'],
    gevolg: ['Він може завантажувати пакети на схвалення. Встановити без вашого passkey не може.', 'Hij kan pakketten ter goedkeuring uploaden. Installeren zonder uw passkey kan niet.'],
    doen: ['Якщо не згодні — відкличте право на сторінці оновлень (з підтвердженням).', 'Niet akkoord: trek het recht in op de updatepagina (met bevestiging).'],
    rechten: ['Лише завантаження пакетів на схвалення; без встановлення, без доступу до даних.', 'Alleen pakketten uploaden ter goedkeuring; geen installatie, geen toegang tot gegevens.'],
    deeplink: () => `${UPD}#toegang`,
    acties: [
      { soort: 'openen', label: ['Переглянути доступи', 'Toegang bekijken'], href: () => `${UPD}#toegang` },
      { soort: 'intrekken', label: ['Відкликати…', 'Intrekken…'], href: () => `${UPD}#toegang`, gevaarlijk: true },
    ],
  },
  {
    id: 'uitrol',
    past: (m) => /^uitrol[._]|^release/.test(m.soort || ''),
    risico: 'midden',
    wat: ['Подія системи оновлень сайту: новий пакет, схвалення, встановлення або відмова.', 'Gebeurtenis van het updatesysteem: nieuw pakket, goedkeuring, installatie of weigering.'],
    waarom: ['Пакет завантажив агент або людина з правом готувати оновлення; результат прийшов із сервера.', 'Een agent of persoon met voorbereidingsrecht uploadde een pakket; de uitkomst komt van de server.'],
    gevolg: ['Поки пакет не схвалено вашим passkey, на сайті нічого не змінюється.', 'Zolang u niet met passkey goedkeurt, verandert er niets op de site.'],
    doen: ['Відкрийте сторінку оновлень: там опис змін, перевірки, схвалення, відхилення й відкат.', 'Open de updatepagina: wijzigingen, controles, goedkeuren, afwijzen en terugdraaien.'],
    deeplink: viaLink(UPD),
    acties: [
      { soort: 'beslissen', label: ['Відкрити оновлення', 'Updates openen'], href: viaLink(UPD) },
      { soort: 'type-stil', label: ['Тихо для цього типу', 'Stil voor dit soort'] },
    ],
  },
  {
    id: 'extensie',
    past: (m) => /owner\.extensie\.|extensie|browserextensie|розширенн/.test(`${s(m)} ${tekst(m)}`),
    risico: 'midden',
    wat: ['Доступ розширення браузера (Мій простір) до сайту: розблокування, поновлення, звуження або закриття.', 'Toegang van de browserextensie (Mijn Ruimte) tot de site: ontgrendelen, vernieuwen, beperken of sluiten.'],
    waarom: ['Строк доступу закінчується, змінилась політика або дозволи, чи хтось закрив доступ.', 'De termijn loopt af, het beleid of de rechten veranderden, of iemand sloot de toegang.'],
    gevolg: ['Якщо доступ не поновити, розширення перестане діяти від вашого імені після кінця строку.', 'Zonder vernieuwing werkt de extensie na het einde van de termijn niet meer namens u.'],
    doen: ['Відкрийте «Розширення»: подивіться строк і дозволи, поновіть або закрийте доступ.', 'Open «Extensie»: bekijk termijn en rechten, vernieuw of sluit de toegang.'],
    rechten: ['Розширення діє лише в дозволених вкладках і з дозволами, які ви обрали при розблокуванні.', 'De extensie werkt alleen in toegestane tabbladen en met de rechten die u bij het ontgrendelen koos.'],
    deeplink: viaLink(`${MCP}#extensie`),
    acties: [
      { soort: 'openen', label: ['Відкрити розширення', 'Extensie openen'], href: viaLink(`${MCP}#extensie`) },
      { soort: 'intrekken', label: ['Закрити доступ…', 'Toegang sluiten…'], href: () => `${MCP}#extensie`, gevaarlijk: true },
    ],
  },
  {
    id: 'agent-bestand',
    past: (m) => /^command\.fs\.|machine_(write|read)_file|^tool\.machine_/.test(m.soort || ''),
    risico: 'midden',
    wat: ['Агент на вашому пристрої читав або записував файл (шлях — у полі «Що»).', 'Een agent op uw apparaat las of schreef een bestand (pad bij «Wat»).'],
    waarom: ['ШІ попросив дію, а пристрій її виконав або відмовив (стан і причина — у тексті).', 'De AI vroeg de actie; het apparaat voerde ze uit of weigerde (status en reden in de tekst).'],
    gevolg: ['Записаний файл змінено на пристрої. Невдала спроба нічого не змінила.', 'Een geschreven bestand is op het apparaat gewijzigd. Een mislukte poging veranderde niets.'],
    doen: ['Перевірте журнал дій агента. Якщо не очікували — вимкніть автоматичні дозволи пристрою.', 'Bekijk het actielogboek van de agent. Onverwacht? Zet de automatische rechten van het apparaat uit.'],
    rechten: ['Агент має доступ лише до тек, які ви дозволили для цього пристрою.', 'De agent heeft alleen toegang tot de mappen die u voor dit apparaat toeliet.'],
    deeplink: () => `${MCP}#overview`,
    acties: [
      { soort: 'openen', label: ['Журнал агента', 'Logboek van de agent'], href: () => `${MCP}#overview` },
      { soort: 'intrekken', label: ['Дозволи пристрою…', 'Rechten van het apparaat…'], href: () => `${MCP}#dostupy`, gevaarlijk: true },
    ],
  },
  {
    id: 'ai-actie',
    past: (m) => m.dienst === 'ai',
    risico: 'laag',
    wat: ['Дія ШІ або підключеного агента на сайті чи пристрої.', 'Een actie van de AI of een gekoppelde agent op de site of een apparaat.'],
    waarom: ['ШІ виконував ваше завдання або чекає вашого рішення.', 'De AI voerde uw opdracht uit of wacht op uw beslissing.'],
    gevolg: ['Без вашого схвалення небезпечні дії не виконуються.', 'Gevaarlijke acties gebeuren niet zonder uw goedkeuring.'],
    doen: ['Відкрийте центр агентів, щоб побачити подробиці або вирішити.', 'Open het agentencentrum voor details of om te beslissen.'],
    deeplink: viaLink(`${MCP}#overview`),
    acties: [
      { soort: 'beslissen', label: ['Відкрити центр агентів', 'Agentencentrum openen'], href: viaLink(`${MCP}#overview`) },
      { soort: 'type-stil', label: ['Тихо для цього типу', 'Stil voor dit soort'] },
    ],
  },
  {
    id: 'toegangsverzoek',
    past: (m) => /access_request|toegangsverzoek|verzoek/.test(s(m)),
    risico: 'midden',
    wat: ['Хтось просить доступ до вашого ресурсу (який саме — у тексті).', 'Iemand vraagt toegang tot uw bron (welke staat in de tekst).'],
    waarom: ['Людина надіслала запит; без вашої відповіді доступу немає.', 'Iemand stuurde een verzoek; zonder uw antwoord is er geen toegang.'],
    gevolg: ['Якщо дозволите — людина отримає вказані права. Відмова нічого не змінює.', 'Staat u het toe, dan krijgt de persoon de vermelde rechten. Weigeren verandert niets.'],
    doen: ['Відкрийте запит, перевірте хто і які права, тоді дозвольте або відхиліть.', 'Open het verzoek, controleer wie en welke rechten, sta toe of weiger.'],
    deeplink: viaLink(`${ID}/sharing`),
    acties: [{ soort: 'beslissen', label: ['Переглянути запит', 'Verzoek bekijken'], href: viaLink(`${ID}/sharing`) }],
  },
  {
    id: 'beveiliging',
    past: (m) => /security|beveiliging|passkey|access_|toegang|login|sessie|session|herstel|recovery|identity/.test(s(m)) || m.dienst === 'identity',
    risico: 'hoog',
    wat: ['Зміна в безпеці облікового запису: вхід, спосіб входу, код доступу, сеанс або право.', 'Wijziging in de beveiliging van het account: aanmelding, aanmeldmethode, toegangscode, sessie of recht.'],
    waarom: ['Хтось (ви, адміністратор або інший пристрій) зробив дію з вашим обліковим записом.', 'Iemand (u, een beheerder of een ander apparaat) deed iets met uw account.'],
    gevolg: ['Якщо це були не ви — хтось може мати доступ до вашого облікового запису.', 'Was u het niet, dan kan iemand toegang tot uw account hebben.'],
    doen: ['Якщо це ви — натисніть «Це був я». Якщо ні — відкрийте способи входу й сеанси, завершіть чужі сеанси.', 'Was u het: «Dit was ik». Zo niet: open aanmeldmethoden en sessies en beëindig vreemde sessies.'],
    deeplink: viaLink(`${ID}/methods`),
    acties: [
      { soort: 'dit-was-ik', label: ['Це був я', 'Dit was ik'] },
      { soort: 'niet-ik', label: ['Це не я — сеанси…', 'Dit was ik niet — sessies…'], href: () => `${ID}/sessions`, gevaarlijk: true },
      { soort: 'wijziging', label: ['Способи входу', 'Aanmeldmethoden'], href: viaLink(`${ID}/methods`) },
    ],
  },
  {
    id: 'mail',
    past: (m) => m.dienst === 'post',
    risico: 'laag',
    wat: ['Подія пошти: синхронізація, імпорт, надсилання або перевірка адрес.', 'Mailgebeurtenis: synchronisatie, import, verzending of adrescontrole.'],
    waarom: ['Поштовий сервіс (Google, Microsoft, IMAP) повідомив результат.', 'De mailaanbieder (Google, Microsoft, IMAP) meldde een uitkomst.'],
    gevolg: ['При помилці нові листи можуть не приходити, доки ви не підключите скриньку знову.', 'Bij een fout komen nieuwe berichten mogelijk niet binnen tot u de mailbox opnieuw koppelt.'],
    doen: ['Відкрийте пошту; при помилці — «Підключити знову».', 'Open de mail; bij een fout: «Opnieuw koppelen».'],
    deeplink: viaLink('https://mail.tarasevych.com/'),
    acties: [
      { soort: 'openen', label: ['Відкрити пошту', 'Mail openen'], href: viaLink('https://mail.tarasevych.com/') },
      { soort: 'type-stil', label: ['Тихо для цього типу', 'Stil voor dit soort'] },
    ],
  },
  {
    id: 'cloud',
    past: (m) => m.dienst === 'cloud',
    risico: 'laag',
    wat: ['Подія хмари: синхронізація, спільний доступ або файл.', 'Cloudgebeurtenis: synchronisatie, delen of een bestand.'],
    waarom: ['Хмарний сервіс або інша людина зробили дію.', 'Een clouddienst of iemand anders deed iets.'],
    gevolg: ['При спільному доступі інші бачать вказаний файл чи теку.', 'Bij delen zien anderen het vermelde bestand of de map.'],
    doen: ['Відкрийте хмару, щоб переглянути або змінити доступ.', 'Open de cloud om te bekijken of de toegang te wijzigen.'],
    deeplink: viaLink('https://cloud.tarasevych.com/'),
    acties: [
      { soort: 'openen', label: ['Відкрити в хмарі', 'In de cloud openen'], href: viaLink('https://cloud.tarasevych.com/') },
      { soort: 'type-stil', label: ['Тихо для цього типу', 'Stil voor dit soort'] },
    ],
  },
  {
    id: 'algemeen',
    past: () => true,
    risico: 'laag',
    wat: ['Подія на сайті (подробиці — у тексті та в «Технічних подробицях»).', 'Gebeurtenis op de site (details in de tekst en bij «Technische details»).'],
    waarom: ['Джерело не передало окремої причини.', 'De bron gaf geen aparte reden.'],
    gevolg: ['Зазвичай нічого робити не треба.', 'Meestal hoeft u niets te doen.'],
    doen: ['Відкрийте джерело, якщо хочете побачити більше.', 'Open de bron als u meer wilt zien.'],
    deeplink: viaLink('https://hub.tarasevych.com/'),
    acties: [
      { soort: 'openen', label: ['Відкрити джерело', 'Bron openen'], href: viaLink('https://hub.tarasevych.com/') },
      { soort: 'type-stil', label: ['Тихо для цього типу', 'Stil voor dit soort'] },
    ],
  },
];

export const uitlegVoor = (m: V2Melding): UitlegSoort => REGISTER.find((r) => r.past(m)) || REGISTER[REGISTER.length - 1];

// --------------------------------------------------------------------------------------------- velden uit de tekst halen
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
/** WIE: expliciet (activiteit), anders het eerste e-mailadres in de tekst. */
export const wieVan = (m: V2Melding): string | undefined => m.wie || (`${m.tekst || ''}`.match(EMAIL)?.[0]);
/** WAT: expliciet object, anders de eerste naam tussen «». */
export const objectVan = (m: V2Melding): string | undefined => m.object || (`${m.tekst || ''} ${m.titel}`.match(/«([^»]{1,120})»/)?.[1]);
/** WAAROM: «Причина: «…»» / «Reden: «…»» in de tekst. */
export const redenVan = (m: V2Melding): string | undefined => `${m.tekst || ''}`.match(/(?:Причина|Reden):\s*«([^»]{1,300})»/)?.[1];
/** Absolute tijd in Europe/Brussels. */
export const absoluteTijd = (t: number, lang: 'uk' | 'nl') =>
  new Date(t).toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-BE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Brussels' });
