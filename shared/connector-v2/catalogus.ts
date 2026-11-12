// Connector v2 — de ENE catalogus van opties (hulpmiddelen) met hun Nederlandse namen, groep, kant, soort, risico en uitleg.
//
// Naam van een hulpmiddel (shared/connector-v2/namen.ts):
//   <essentie (≤5 woorden)>_<agent>_<subdomein>[_<externe dienst>]_tarasevych_com_<gebruiker|beheer>
//   bv. creeren_bestand_grok_cloud_gdrive_tarasevych_com_gebruiker
// • De dienst valt weg als hij gelijk is aan het subdomein (github.tarasevych.com ↔ GitHub: …_github_tarasevych_com_…).
// • Alleen a-z, 0-9 en «_», hoogstens 64 tekens: dat eisen Claude, ChatGPT en de MCP-specificatie voor hulpmiddelnamen. Daarom
//   «creeren» in de naam en «creëren» in de weergave. De test connector-v2 houdt elke naam voor elke agent binnen die grens.
// • Kant: 'gebruiker' = privéruimte (eigen mail, bestanden, apparaten); 'beheer' = technische ruimte (site en server, alleen de
//   eigenaar met actief technisch profiel). Apparaattools bestaan in beide kanten: privé = uw eigen pc, beheer = de server zelf.
//   Een recht aan de beheerkant kan NOOIT in de privéruimte gebruikt worden en omgekeerd (de kant bepaalt de ruimte van de aanroep).
// • status 'in-ontwikkeling' (intern = null): zichtbaar en uitlegbaar, nooit aan te zetten en nooit in tools/list.
// Puur (geen React/DOM/Node).

export type Kant = 'gebruiker' | 'beheer';
export type Soort = 'lezen' | 'schrijven' | 'wissen';
export type Risico = 'laag' | 'midden' | 'hoog' | 'kritiek';
export type Subdomein = 'mail' | 'hub' | 'cloud' | 'github' | 'mcp' | 'admin' | 'ai';
export type Dienst = 'gmail' | 'gcal' | 'gdrive' | 'gphotos' | 'icloud' | 'github' | 'stripe';
export type GroepId = 'account' | 'mail' | 'agenda' | 'bestanden' | 'bord' | 'ruimte' | 'apparaten' | 'apps' | 'browser' | 'github' | 'media' | 'betalingen' | 'releases' | 'server';
export type Status = 'actief' | 'in-ontwikkeling';

/** [titel, wat het doet, gevolgen, waarschuwing (optioneel)] */
export type Tekst = readonly [string, string, string, string?];

export interface V2Optie {
  /** Unieke sleutel van een recht: `${id}:${kant}`. */
  key: string;
  /** Stabiele id: de interne toolnaam, of 'dev.<naam>' zolang er nog geen hulpmiddel is. */
  id: string;
  intern: string | null;
  essentie: string;
  /** Nederlandse weergave van de essentie, met diakritiek en spaties («creëren nieuw bestand»). */
  weergave: string;
  sub: Subdomein;
  dienst: Dienst | null;
  kant: Kant;
  soort: Soort;
  groep: GroepId;
  risico: Risico;
  /** Gevoelige inhoud (mail, foto's): nooit standaard aan, aparte bevestiging. */
  gevoelig: boolean;
  status: Status;
  uk: Tekst;
  nl: Tekst;
}

export interface V2Groep { id: GroepId; uk: string; nl: string; icoon: string; kant: Kant | 'beide' }
/** icoon = naam van een lucide-pictogram (src/connector-v2/iconen.ts zet het om). */
export const V2_GROEPEN: readonly V2Groep[] = Object.freeze([
  { id: 'account', uk: 'Обліковий запис', nl: 'Account', icoon: 'UserRound', kant: 'gebruiker' },
  { id: 'mail', uk: 'Пошта', nl: 'E-mail', icoon: 'Mail', kant: 'gebruiker' },
  { id: 'agenda', uk: 'Календар', nl: 'Agenda', icoon: 'CalendarDays', kant: 'gebruiker' },
  { id: 'bestanden', uk: 'Файли й фото', nl: 'Bestanden en foto\'s', icoon: 'FolderOpen', kant: 'gebruiker' },
  { id: 'bord', uk: 'Дошка й нотатки', nl: 'Bord en notities', icoon: 'KanbanSquare', kant: 'gebruiker' },
  { id: 'ruimte', uk: 'Пошук і сервіси', nl: 'Zoeken en diensten', icoon: 'Search', kant: 'gebruiker' },
  { id: 'apparaten', uk: 'Пристрої', nl: 'Apparaten', icoon: 'Monitor', kant: 'beide' },
  { id: 'apps', uk: 'Контейнери й додатки', nl: 'Containers en apps', icoon: 'Boxes', kant: 'beide' },
  { id: 'browser', uk: 'Браузер', nl: 'Browser', icoon: 'Globe', kant: 'beide' },
  { id: 'github', uk: 'GitHub', nl: 'GitHub', icoon: 'Github', kant: 'gebruiker' },
  { id: 'media', uk: 'Дизайн і медіа', nl: 'Ontwerp en media', icoon: 'Palette', kant: 'gebruiker' },
  { id: 'betalingen', uk: 'Платежі', nl: 'Betalingen', icoon: 'CreditCard', kant: 'gebruiker' },
  { id: 'releases', uk: 'Випуски й оновлення сайту', nl: 'Releases en updates van de site', icoon: 'Rocket', kant: 'beheer' },
  { id: 'server', uk: 'Сервер і безпека', nl: 'Server en beveiliging', icoon: 'Server', kant: 'beheer' },
]);

type Def = {
  id: string; intern?: string | null; essentie: string; weergave?: string; sub: Subdomein; dienst?: Dienst | null; kanten: readonly Kant[];
  soort: Soort; groep: GroepId; risico: Risico; gevoelig?: boolean; uk: Tekst; nl: Tekst;
};

const BEIDE: readonly Kant[] = ['gebruiker', 'beheer'];
const G: readonly Kant[] = ['gebruiker'];
const B: readonly Kant[] = ['beheer'];
/** Een optie «у розробці» (intern = null). Sinds 21.10.2026 staat er geen meer in de catalogus; de vorm blijft voor een volgende. */
export const dev = (d: Omit<Def, 'intern'>): Def => ({ ...d, intern: null });

const DEFS: readonly Def[] = [
  // ---------------------------------------------------------------- account
  { id: 'v2_whoami', essentie: 'tonen_mijn_account', weergave: 'tonen mijn account', sub: 'ai', kanten: G, soort: 'lezen', groep: 'account', risico: 'laag',
    uk: ['Хто я в цьому підключенні', 'Показує ШІ ваше ім’я, адресу, роль, простір і які дозволи має саме це підключення.', 'ШІ знає, від чийого імені працює, і не вгадує. Жодних даних поза вашим профілем.'],
    nl: ['Wie ben ik in deze koppeling', 'Toont de AI uw naam, adres, rol, ruimte en welke rechten precies deze koppeling heeft.', 'De AI weet namens wie ze werkt en hoeft niet te raden. Geen gegevens buiten uw profiel.'] },

  // ---------------------------------------------------------------- mail (Gmail)
  { id: 'mail_list_accounts', essentie: 'tonen_postvakken', sub: 'mail', dienst: 'gmail', kanten: G, soort: 'lezen', groep: 'mail', risico: 'laag', gevoelig: true,
    uk: ['Переглядати поштові скриньки', 'Список підключених скриньок (лише адреси, без листів).', 'ШІ бачить, які адреси у вас є; вміст листів — ні.'],
    nl: ['Postvakken bekijken', 'Lijst van gekoppelde postvakken (alleen adressen, geen berichten).', 'De AI ziet welke adressen u hebt; de inhoud van berichten niet.'] },
  { id: 'mail_list_labels', essentie: 'tonen_mail_labels', sub: 'mail', dienst: 'gmail', kanten: G, soort: 'lezen', groep: 'mail', risico: 'laag', gevoelig: true,
    uk: ['Переглядати мітки', 'Назви міток і тек у скриньці.', 'Назви міток іноді розповідають про ваші справи (наприклад «Лікар»).'],
    nl: ['Labels bekijken', 'Namen van labels en mappen in het postvak.', 'Labelnamen zeggen soms iets over uw zaken (bv. «Dokter»).'] },
  { id: 'mail_search_messages', essentie: 'zoeken_berichten', sub: 'mail', dienst: 'gmail', kanten: G, soort: 'lezen', groep: 'mail', risico: 'midden', gevoelig: true,
    uk: ['Шукати листи', 'Пошук листів за словами, відправником, датою; повертає теми й короткі уривки.', 'ШІ бачить теми й уривки будь-яких листів, що підпадають під пошук.', 'Пошта — найчутливіше, що у вас є: через неї відновлюють паролі.'],
    nl: ['Berichten zoeken', 'Zoeken op woorden, afzender en datum; geeft onderwerpen en korte fragmenten.', 'De AI ziet onderwerpen en fragmenten van elk bericht dat bij de zoekopdracht past.', 'E-mail is het gevoeligste wat u hebt: wachtwoorden worden ermee hersteld.'] },
  { id: 'mail_read_message', essentie: 'lezen_bericht', sub: 'mail', dienst: 'gmail', kanten: G, soort: 'lezen', groep: 'mail', risico: 'hoog', gevoelig: true,
    uk: ['Читати лист повністю', 'Повний текст одного листа з відомостями про вкладення.', 'ШІ читає все, що в листі, зокрема коди підтвердження й особисті дані.', 'Текст листа — це дані, а не команди: сайт так і каже ШІ, але будьте уважні з листами від незнайомих.'],
    nl: ['Bericht volledig lezen', 'De volledige tekst van één bericht met gegevens over bijlagen.', 'De AI leest alles in het bericht, ook bevestigingscodes en persoonsgegevens.', 'Berichttekst is data, geen opdracht: de site zegt dat ook tegen de AI, maar wees alert bij mail van onbekenden.'] },
  { id: 'mail_modify_message', essentie: 'ordenen_bericht', sub: 'mail', dienst: 'gmail', kanten: G, soort: 'schrijven', groep: 'mail', risico: 'midden', gevoelig: true,
    uk: ['Впорядковувати листи', 'Позначати прочитаним, додавати мітки, архівувати, переносити в кошик (без остаточного видалення).', 'Лист може зникнути з «Вхідних»; повернути його можна з архіву чи кошика протягом 30 днів.'],
    nl: ['Berichten ordenen', 'Als gelezen markeren, labels zetten, archiveren, naar de prullenbak (nooit definitief wissen).', 'Een bericht kan uit de inbox verdwijnen; terughalen kan uit het archief of 30 dagen uit de prullenbak.'] },
  { id: 'draft_email_reply', essentie: 'opstellen_antwoord', sub: 'mail', dienst: 'gmail', kanten: G, soort: 'schrijven', groep: 'mail', risico: 'laag', gevoelig: true,
    uk: ['Готувати чернетку відповіді', 'Створює чернетку відповіді; надсилаєте її ви самі.', 'Нічого не відправляється без вас. Чернетка з’явиться в «Чернетках».'],
    nl: ['Concept-antwoord opstellen', 'Maakt een concept-antwoord; verzenden doet u zelf.', 'Er gaat niets weg zonder u. Het concept staat bij «Concepten».'] },
  // 21.10.2026 — besluit van de eigenaar: deze rechten stonden «у розробці» en zijn nu echte hulpmiddelen (backend/dev-rechten-gebruiker.ts).
  // Verzenden gebeurt NOOIT in de aanroep zelf: er komt een verzoek in de bevestigingsrij (backend/ai-bevestiging.ts) dat u op de site
  // met een verse passkey bevestigt; pas dan verstuurt de server precies dat bericht.
  { id: 'mail_send', essentie: 'versturen_bericht', sub: 'mail', dienst: 'gmail', kanten: G, soort: 'schrijven', groep: 'mail', risico: 'hoog', gevoelig: true,
    uk: ['Надсилати листи від вашого імені', 'Надсилає новий лист, відповідь або вашу чернетку з вашої адреси — лише після того, як ви підтвердите саме цей лист на сайті свіжим passkey.', 'Лист піде від вашої адреси; відкликати його не можна. Без вашого підтвердження за 30 хвилин нічого не надсилається.', 'Кожен лист — з вашим підтвердженням на сайті.'],
    nl: ['Berichten verzenden namens u', 'Verzendt een nieuw bericht, een antwoord of uw concept vanaf uw adres — pas nadat u precies dat bericht op de site met een verse passkey bevestigde.', 'Het bericht vertrekt vanaf uw adres en is niet terug te halen. Zonder uw bevestiging binnen 30 minuten gaat er niets weg.', 'Elk bericht alleen met uw bevestiging op de site.'] },

  // ---------------------------------------------------------------- agenda
  { id: 'calendar_list_calendars', essentie: 'tonen_agendas', weergave: 'tonen agenda\'s', sub: 'hub', dienst: 'gcal', kanten: G, soort: 'lezen', groep: 'agenda', risico: 'laag',
    uk: ['Переглядати календарі', 'Назви ваших календарів.', 'ШІ знає, які календарі є; подій не бачить.'],
    nl: ['Agenda\'s bekijken', 'Namen van uw agenda\'s.', 'De AI weet welke agenda\'s er zijn; afspraken ziet ze niet.'] },
  { id: 'calendar_list_events', essentie: 'tonen_afspraken', sub: 'hub', dienst: 'gcal', kanten: G, soort: 'lezen', groep: 'agenda', risico: 'midden',
    uk: ['Переглядати події', 'Події за період: назва, час, місце, учасники.', 'ШІ бачить, де й з ким ви будете; це допомагає планувати, але розкриває розклад.'],
    nl: ['Afspraken bekijken', 'Afspraken in een periode: titel, tijd, plaats en deelnemers.', 'De AI ziet waar en met wie u bent; handig bij plannen, maar uw schema ligt open.'] },
  { id: 'draft_calendar_event', essentie: 'opstellen_afspraak', sub: 'hub', dienst: 'gcal', kanten: G, soort: 'schrijven', groep: 'agenda', risico: 'laag',
    uk: ['Готувати чернетку події', 'Пропонує подію; у календар її переносите ви.', 'Календар не змінюється без вашого кліку.'],
    nl: ['Concept-afspraak opstellen', 'Stelt een afspraak voor; in de agenda zet u hem zelf.', 'De agenda verandert niet zonder uw klik.'] },
  // 20.10.2026 — de agenda is nu ECHT tweerichtings. Deze zes wijzigen uw Google-agenda; ze staan standaard op
  // «vragen» (backend/connectors-hulpmiddelen.ts), dus u bevestigt elke aanroep op de site. Elke aanroep draagt een
  // idempotentiesleutel (twee keer versturen verandert niets twee keer) en de versie (etag) van de afspraak, zodat
  // een wijziging die u in Google zelf deed nooit stil wordt overschreven.
  { id: 'calendar_create_event', essentie: 'creeren_afspraak', weergave: 'creëren afspraak', sub: 'hub', dienst: 'gcal', kanten: G, soort: 'schrijven', groep: 'agenda', risico: 'midden',
    uk: ['Створювати події', 'Створює справжню подію у вашому Google-календарі: назва, час, місце, учасники, повторення, нагадування.', 'Подія з’явиться у вашому календарі; учасники отримають листа лише якщо ШІ про це попросить.'],
    nl: ['Afspraken aanmaken', 'Maakt een echte afspraak in uw Google-agenda: titel, tijd, plaats, gasten, herhaling en herinneringen.', 'De afspraak komt in uw agenda; gasten krijgen alleen een e-mail als de AI daarom vraagt.'] },
  { id: 'calendar_update_event', essentie: 'wijzigen_afspraak', sub: 'hub', dienst: 'gcal', kanten: G, soort: 'schrijven', groep: 'agenda', risico: 'midden',
    uk: ['Змінювати події', 'Змінює наявну подію: час, назву, місце, учасників, повторення.', 'Якщо подію змінили в Google після того, як ШІ її прочитав, запис не відбудеться: сервер поверне конфлікт і покаже версію з Google.'],
    nl: ['Afspraken wijzigen', 'Wijzigt een bestaande afspraak: tijd, titel, plaats, gasten, herhaling.', 'Is de afspraak in Google gewijzigd nadat de AI haar las, dan wordt er NIET geschreven: de server geeft een conflict met de versie uit Google.'] },
  { id: 'calendar_move_event', essentie: 'verplaatsen_afspraak', sub: 'hub', dienst: 'gcal', kanten: G, soort: 'schrijven', groep: 'agenda', risico: 'midden',
    uk: ['Переносити події між календарями', 'Переносить подію в інший ваш календар (змінити час — це «змінювати події»).', 'Подія зникне з одного календаря і з’явиться в іншому; учасники залишаються.'],
    nl: ['Afspraken naar een andere agenda verplaatsen', 'Verplaatst een afspraak naar een andere agenda van u (een andere tijd is «afspraken wijzigen»).', 'De afspraak verdwijnt uit de ene agenda en komt in de andere; de gasten blijven.'] },
  { id: 'calendar_delete_event', essentie: 'verwijderen_afspraak', sub: 'hub', dienst: 'gcal', kanten: G, soort: 'wissen', groep: 'agenda', risico: 'hoog',
    uk: ['Видаляти події', 'Видаляє подію з вашого Google-календаря.', 'Подію можна якийсь час відновити у кошику Google Календаря; через сайт — ні.', 'Видалення скасувати тут не можна: ШІ має запитати вас про кожну подію.'],
    nl: ['Afspraken verwijderen', 'Verwijdert een afspraak uit uw Google-agenda.', 'Terughalen kan nog een tijd via de prullenbak van Google Agenda; via de site niet.', 'Verwijderen is hier niet ongedaan te maken: de AI moet het u per afspraak vragen.'] },
  { id: 'calendar_event_attendees', essentie: 'beheren_deelnemers', sub: 'hub', dienst: 'gcal', kanten: G, soort: 'schrijven', groep: 'agenda', risico: 'midden', gevoelig: true,
    uk: ['Додавати й прибирати учасників', 'Додає або прибирає учасників наявної події.', 'Учасники типово отримують листа від вашого імені; адреси учасників стають видні всім у події.'],
    nl: ['Gasten toevoegen en verwijderen', 'Voegt gasten toe aan of haalt ze weg uit een bestaande afspraak.', 'Gasten krijgen standaard een e-mail namens u; hun adressen zijn voor alle gasten zichtbaar.'] },
  { id: 'calendar_rsvp_event', essentie: 'antwoorden_afspraak', sub: 'hub', dienst: 'gcal', kanten: G, soort: 'schrijven', groep: 'agenda', risico: 'midden',
    uk: ['Відповідати на запрошення', 'Відповідає від вашого імені: буду / можливо / не буду / без відповіді.', 'Організатор побачить вашу відповідь; відповіді інших учасників не змінюються.'],
    nl: ['Op uitnodigingen antwoorden', 'Antwoordt namens u: ja / misschien / nee / geen antwoord.', 'De organisator ziet uw antwoord; de antwoorden van andere gasten blijven zoals ze waren.'] },
  // 21.10.2026 — iCloud via CalDAV met een app-wachtwoord (backend/agenda-caldav.ts), alleen lezen.
  { id: 'icloud_list_events', essentie: 'tonen_afspraken', sub: 'hub', dienst: 'icloud', kanten: G, soort: 'lezen', groep: 'agenda', risico: 'midden',
    uk: ['Події з iCloud', 'Події ваших календарів Apple iCloud, підключених на сайті паролем застосунку (лише читання).', 'Як і для Google: ШІ бачить ваш розклад. Змінювати події в iCloud ШІ не може.', 'Спершу підключіть iCloud у Календарі (пароль застосунку з appleid.apple.com).'],
    nl: ['Afspraken uit iCloud', 'Afspraken uit uw Apple iCloud-agenda’s, op de site gekoppeld met een app-wachtwoord (alleen lezen).', 'Net als bij Google: de AI ziet uw schema. Afspraken in iCloud wijzigen kan de AI niet.', 'Koppel iCloud eerst in de agenda (app-wachtwoord van appleid.apple.com).'] },

  // ---------------------------------------------------------------- bestanden
  { id: 'drive_browse', essentie: 'bladeren_map', sub: 'cloud', dienst: 'gdrive', kanten: G, soort: 'lezen', groep: 'bestanden', risico: 'laag',
    uk: ['Переглядати теки Диска', 'Назви файлів і тек на Google Диску.', 'ШІ бачить назви файлів, не їхній вміст.'],
    nl: ['Mappen op Drive bekijken', 'Namen van bestanden en mappen op Google Drive.', 'De AI ziet bestandsnamen, niet de inhoud.'] },
  { id: 'drive_read_file', essentie: 'lezen_bestand', sub: 'cloud', dienst: 'gdrive', kanten: G, soort: 'lezen', groep: 'bestanden', risico: 'midden',
    uk: ['Читати файли з Диска', 'Вміст текстових документів і таблиць з Диска.', 'ШІ читає документ повністю; у документах бувають договори, рахунки, паролі.'],
    nl: ['Bestanden op Drive lezen', 'Inhoud van tekstdocumenten en spreadsheets op Drive.', 'De AI leest het hele document; daarin staan soms contracten, facturen of wachtwoorden.'] },
  { id: 'drive_create_file', essentie: 'creeren_bestand', weergave: 'creëren bestand', sub: 'cloud', dienst: 'gdrive', kanten: G, soort: 'schrijven', groep: 'bestanden', risico: 'midden',
    uk: ['Створювати файли на Диску', 'Новий документ або таблиця Google у вибраній теці, за бажанням з початковим текстом.', 'Файл з’явиться на Диску; видалити його можете лише ви. Типово кожне створення ви підтверджуєте на сайті.'],
    nl: ['Bestanden op Drive maken', 'Nieuw document of rekenblad van Google in een gekozen map, desgewenst met begintekst.', 'Het bestand verschijnt op Drive; verwijderen kunt alleen u. Standaard bevestigt u elk nieuw bestand op de site.'] },
  { id: 'drive_upload_file', essentie: 'uploaden_bestand', sub: 'cloud', dienst: 'gdrive', kanten: G, soort: 'schrijven', groep: 'bestanden', risico: 'midden',
    uk: ['Завантажувати файли на Диск', 'Зображення, PDF, ZIP або простий текст до 4 МБ у вибрану теку; сервер перевіряє, що вміст відповідає типу.', 'Займає місце на Диску; файли видно всім, з ким ділиться тека. Типово кожне завантаження ви підтверджуєте на сайті.'],
    nl: ['Bestanden naar Drive uploaden', 'Afbeeldingen, pdf\'s, ZIP of platte tekst tot 4 MB in een gekozen map; de server controleert of de inhoud bij de soort past.', 'Neemt ruimte in op Drive; zichtbaar voor iedereen met wie de map gedeeld is. Standaard bevestigt u elke upload op de site.'] },
  { id: 'drive_share_file', essentie: 'delen_bestand', sub: 'cloud', dienst: 'gdrive', kanten: G, soort: 'schrijven', groep: 'bestanden', risico: 'hoog',
    uk: ['Ділитися файлами', 'Надати конкретним людям доступ до файла чи теки (перегляд, коментарі чи редагування) — лише після вашого підтвердження на сайті свіжим passkey.', 'Хтось інший отримає ваш файл; це найчастіша причина витоків. «Для всіх із посиланням» — лише окремою позначкою, яку ставите ви.', 'Кожне надання доступу — з вашим підтвердженням на сайті.'],
    nl: ['Bestanden delen', 'Bepaalde mensen toegang geven tot een bestand of map (bekijken, reageren of bewerken) — pas na uw bevestiging op de site met een verse passkey.', 'Iemand anders krijgt uw bestand; de meest voorkomende oorzaak van lekken. «Iedereen met de link» alleen met een apart vinkje van u.', 'Elke deling alleen met uw bevestiging op de site.'] },
  { id: 'photos_picked_media', essentie: 'tonen_fotos', weergave: 'tonen foto\'s', sub: 'cloud', dienst: 'gphotos', kanten: G, soort: 'lezen', groep: 'bestanden', risico: 'hoog', gevoelig: true,
    uk: ['Фото, які ви вибрали', 'Лише ті фото з Google Photos, які ви самі вибрали на сайті у вікні Google, коли ШІ попросив.', 'ШІ бачить лише вибрані фото, а не всю бібліотеку. На фото — люди, місця й документи.', 'Ви вибираєте й підтверджуєте фото самі.'],
    nl: ['Foto\'s die u koos', 'Alleen de foto\'s uit Google Photos die u zelf op de site in het venster van Google koos toen de AI erom vroeg.', 'De AI ziet alleen de gekozen foto\'s, niet de hele bibliotheek. Op foto\'s staan mensen, plaatsen en documenten.', 'U kiest en bevestigt de foto\'s zelf.'] },

  // ---------------------------------------------------------------- bord en notities (hub)
  { id: 'search_board', essentie: 'zoeken_taken_bord', sub: 'hub', kanten: G, soort: 'lezen', groep: 'bord', risico: 'laag',
    uk: ['Шукати задачі на дошці', 'Пошук задач за назвою й станом.', 'ШІ спершу шукає, а не створює дублікати.'],
    nl: ['Taken op het bord zoeken', 'Taken zoeken op naam en status.', 'De AI zoekt eerst, in plaats van dubbele taken te maken.'] },
  { id: 'get_hub_overview', essentie: 'tonen_hub_overzicht', sub: 'hub', kanten: G, soort: 'lezen', groep: 'bord', risico: 'laag',
    uk: ['Огляд вашого хабу', 'Кількість задач, нотаток і найближчі події.', 'Короткий підсумок без вмісту нотаток.'],
    nl: ['Overzicht van uw hub', 'Aantallen taken en notities en wat er binnenkort is.', 'Korte samenvatting zonder de inhoud van notities.'] },
  { id: 'mcp_board_list', essentie: 'lezen_taken_bord', sub: 'hub', kanten: G, soort: 'lezen', groep: 'bord', risico: 'laag',
    uk: ['Читати дошку', 'Задачі зі станом і нотатки дошки, найновіші спершу.', 'ШІ бачить усе на дошці.'],
    nl: ['Het bord lezen', 'Taken met status en notities van het bord, nieuwste eerst.', 'De AI ziet alles op het bord.'] },
  { id: 'create_task', essentie: 'creeren_nieuwe_taak', weergave: 'creëren nieuwe taak', sub: 'hub', kanten: G, soort: 'schrijven', groep: 'bord', risico: 'laag',
    uk: ['Створювати задачі', 'Нова задача на вашій дошці.', 'На дошці з’являються картки; їх легко видалити.'],
    nl: ['Taken maken', 'Een nieuwe taak op uw bord.', 'Er verschijnen kaarten op het bord; makkelijk weer te verwijderen.'] },
  { id: 'mcp_board_add', essentie: 'toevoegen_bord_item', sub: 'hub', kanten: G, soort: 'schrijven', groep: 'bord', risico: 'laag',
    uk: ['Додавати записи на дошку', 'Запис на дошці агента (нотатка, посилання, результат роботи).', 'Дошка наповнюється; записи видно у вашому просторі.'],
    nl: ['Items aan het bord toevoegen', 'Een item op het agentbord (notitie, link, resultaat).', 'Het bord vult zich; items zijn zichtbaar in uw ruimte.'] },
  { id: 'update_task_status', essentie: 'wijzigen_taak_status', sub: 'hub', kanten: G, soort: 'schrijven', groep: 'bord', risico: 'laag',
    uk: ['Змінювати стан задач', 'Переносити задачу між «Зробити», «В роботі», «Готово».', 'Стан задач може змінитися без вашого кліку.'],
    nl: ['Status van taken wijzigen', 'Een taak verplaatsen tussen «Te doen», «Bezig» en «Klaar».', 'De status kan veranderen zonder uw klik.'] },
  { id: 'update_board_item', essentie: 'bewerken_bord_item', sub: 'hub', kanten: G, soort: 'schrijven', groep: 'bord', risico: 'laag',
    uk: ['Редагувати записи дошки', 'Змінювати назву, опис, терміни записів.', 'Старий текст замінюється новим.'],
    nl: ['Items op het bord bewerken', 'Titel, beschrijving en termijnen van items wijzigen.', 'De oude tekst wordt vervangen.'] },
  { id: 'delete_board_item', essentie: 'verwijderen_bord_item', sub: 'hub', kanten: G, soort: 'wissen', groep: 'bord', risico: 'midden',
    uk: ['Видаляти записи дошки', 'Видаляє задачу чи запис із дошки.', 'Запис зникає; повернути можна лише з резервної копії.'],
    nl: ['Items van het bord verwijderen', 'Verwijdert een taak of item van het bord.', 'Het item verdwijnt; terughalen kan alleen uit een reservekopie.'] },
  { id: 'manage_hub_notes', essentie: 'beheren_notities', sub: 'hub', kanten: G, soort: 'schrijven', groep: 'bord', risico: 'midden',
    uk: ['Керувати нотатками', 'Читати, створювати, змінювати й видаляти нотатки хабу.', 'ШІ бачить ваші нотатки й може їх змінити.'],
    nl: ['Notities beheren', 'Notities van de hub lezen, maken, wijzigen en verwijderen.', 'De AI ziet uw notities en kan ze wijzigen.'] },

  // ---------------------------------------------------------------- zoeken en diensten
  { id: 'site_search', essentie: 'zoeken_in_ruimte', sub: 'hub', kanten: G, soort: 'lezen', groep: 'ruimte', risico: 'laag',
    uk: ['Шукати у вашому просторі', 'Пошук по задачах, нотатках і сторінках «Мого простору».', 'Повертає назви й посилання; вміст відкривається окремими дозволами.'],
    nl: ['Zoeken in uw ruimte', 'Zoeken in taken, notities en pagina\'s van Mijn Ruimte.', 'Geeft titels en links; inhoud openen vraagt aparte rechten.'] },
  { id: 'list_services', essentie: 'tonen_diensten', sub: 'hub', kanten: G, soort: 'lezen', groep: 'ruimte', risico: 'laag',
    uk: ['Переглядати сервіси', 'Список служб сайту з їхніми адресами.', 'ШІ відкриває правильні адреси, а не вигадує їх.'],
    nl: ['Diensten bekijken', 'Lijst van diensten van de site met hun adressen.', 'De AI gebruikt de juiste adressen in plaats van ze te verzinnen.'] },
  { id: 'get_service', essentie: 'tonen_dienst_details', sub: 'hub', kanten: G, soort: 'lezen', groep: 'ruimte', risico: 'laag',
    uk: ['Подробиці сервісу', 'Стан і можливості однієї служби.', 'Лише довідкова інформація.'],
    nl: ['Details van een dienst', 'Status en mogelijkheden van één dienst.', 'Alleen naslaginformatie.'] },
  { id: 'get_connector_stats', essentie: 'tonen_koppeling_cijfers', sub: 'ai', kanten: G, soort: 'lezen', groep: 'ruimte', risico: 'laag',
    uk: ['Статистика підключення', 'Скільки викликів зробило це підключення і з яким результатом.', 'Лише лічильники, без вмісту.'],
    nl: ['Cijfers van de koppeling', 'Hoeveel aanroepen deze koppeling deed en met welk resultaat.', 'Alleen tellers, geen inhoud.'] },

  { id: 'mcp_services_health', essentie: 'controleren_diensten', sub: 'hub', kanten: G, soort: 'lezen', groep: 'ruimte', risico: 'laag',
    uk: ['Перевіряти сервіси', 'Чи відповідають сайти й служби «Мого простору» і як швидко.', 'Лише час відповіді.'],
    nl: ['Diensten controleren', 'Of de sites en diensten van Mijn Ruimte antwoorden en hoe snel.', 'Alleen antwoordtijden.'] },
  { id: 'mcp_traffic_recent', essentie: 'tonen_recent_verkeer', sub: 'mcp', kanten: G, soort: 'lezen', groep: 'ruimte', risico: 'laag',
    uk: ['Останні виклики MCP', 'Які виклики пройшли через консоль MCP (метод, інструмент, результат).', 'Лише журнал викликів, без вмісту.'],
    nl: ['Recent MCP-verkeer', 'Welke aanroepen door de MCP-console gingen (methode, hulpmiddel, resultaat).', 'Alleen een aanroeplog, zonder inhoud.'] },
  { id: 'mcp_archive_status', essentie: 'tonen_archief_status', sub: 'mcp', kanten: G, soort: 'lezen', groep: 'ruimte', risico: 'laag',
    uk: ['Стан архіву сайту', 'Останні архіви: розмір і дата. Нічого не створює й не завантажує.', 'Лише список.'],
    nl: ['Status van het sitearchief', 'Laatste archieven: grootte en datum. Maakt of downloadt niets.', 'Alleen een lijst.'] },
  { id: 'mcp_backups_list', essentie: 'tonen_reservekopieen', weergave: 'tonen reservekopieën', sub: 'mcp', kanten: G, soort: 'lezen', groep: 'ruimte', risico: 'laag',
    uk: ['Нічні резервні копії', 'Коли зроблено копії, якого випуску, розміри й перевірка.', 'Лише список; завантажити копію ШІ не може.'],
    nl: ['Nachtelijke reservekopieën', 'Wanneer, van welke release, grootte en controle.', 'Alleen een lijst; downloaden kan de AI niet.'] },

  // ---------------------------------------------------------------- apparaten (privé: uw pc; beheer: de server zelf)
  { id: 'machine_list', essentie: 'tonen_apparaten', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apparaten', risico: 'laag',
    uk: ['Переглядати пристрої', 'Список пристроїв з агентом «Мій простір» і їхній стан.', 'ШІ знає назви ваших комп’ютерів і чи вони в мережі.'],
    nl: ['Apparaten bekijken', 'Lijst van apparaten met de Mijn Ruimte-agent en hun status.', 'De AI kent de namen van uw computers en of ze online zijn.'] },
  { id: 'machine_info', essentie: 'tonen_apparaat_info', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apparaten', risico: 'laag',
    uk: ['Відомості про пристрій', 'Система, версія агента, дозволені теки.', 'Технічні дані без ваших файлів.'],
    nl: ['Gegevens van een apparaat', 'Systeem, agentversie en toegestane mappen.', 'Technische gegevens zonder uw bestanden.'] },
  { id: 'machine_list_dir', essentie: 'tonen_map_inhoud', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apparaten', risico: 'laag',
    uk: ['Переглядати теки', 'Вміст теки в межах дозволених агентом тек.', 'ШІ бачить назви файлів; секретні місця (ключі, паролі) агент приховує.'],
    nl: ['Mappen bekijken', 'Inhoud van een map binnen de mappen die de agent toestaat.', 'De AI ziet bestandsnamen; geheime plekken (sleutels, wachtwoorden) verbergt de agent.'] },
  { id: 'machine_read_file', essentie: 'lezen_bestand', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apparaten', risico: 'midden',
    uk: ['Читати файли', 'Текстовий файл до 2 МБ з дозволених тек.', 'ШІ читає вміст файла повністю.'],
    nl: ['Bestanden lezen', 'Een tekstbestand tot 2 MB uit de toegestane mappen.', 'De AI leest de volledige inhoud.'] },
  { id: 'machine_file_info', essentie: 'tonen_bestand_info', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apparaten', risico: 'laag',
    uk: ['Відомості про файл', 'Розмір, дата зміни й тип файла без читання вмісту.', 'Лише метадані.'],
    nl: ['Gegevens van een bestand', 'Grootte, wijzigingsdatum en soort, zonder de inhoud te lezen.', 'Alleen metadata.'] },
  { id: 'machine_search_files', essentie: 'zoeken_bestanden', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apparaten', risico: 'midden',
    uk: ['Шукати файли', 'Пошук за назвою, за бажанням і в тексті малих файлів.', 'Пошук у тексті показує рядки з файлів.'],
    nl: ['Bestanden zoeken', 'Zoeken op naam, desgewenst ook in de tekst van kleine bestanden.', 'Zoeken in tekst toont regels uit bestanden.'] },
  { id: 'system_metrics', essentie: 'tonen_systeem_belasting', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apparaten', risico: 'laag',
    uk: ['Навантаження системи', 'Процесор, пам’ять, диск.', 'Лише цифри навантаження.'],
    nl: ['Systeembelasting', 'Processor, geheugen en schijf.', 'Alleen belastingscijfers.'] },
  { id: 'machine_write_file', essentie: 'schrijven_bestand', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'apparaten', risico: 'hoog',
    uk: ['Записувати файли', 'Створює або перезаписує файл у дозволених теках.', 'Старий вміст замінюється. Кожен запис ви підтверджуєте на сайті, якщо не дозволили автоматично.', 'Перезапис конфігурації може зламати програму.'],
    nl: ['Bestanden schrijven', 'Maakt of overschrijft een bestand in de toegestane mappen.', 'De oude inhoud wordt vervangen. Elke schrijfactie bevestigt u op de site, tenzij u automatisch toestond.', 'Een overschreven configuratie kan een programma breken.'] },
  { id: 'machine_exec', essentie: 'uitvoeren_opdracht', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'apparaten', risico: 'kritiek',
    uk: ['Виконувати команди', 'Запускає команду в терміналі пристрою від імені агента.', 'Команда може зробити все, що може користувач агента: встановити, змінити, видалити.', 'Найсильніший дозвіл. Кожну команду ви бачите й підтверджуєте на сайті.'],
    nl: ['Opdrachten uitvoeren', 'Voert een opdracht uit in de terminal van het apparaat als de agentgebruiker.', 'Een opdracht kan alles wat die gebruiker kan: installeren, wijzigen, verwijderen.', 'Het sterkste recht. Elke opdracht ziet en bevestigt u op de site.'] },

  // ---------------------------------------------------------------- containers en apps
  { id: 'docker_list_containers', essentie: 'tonen_containers', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apps', risico: 'laag',
    uk: ['Переглядати контейнери', 'Docker-контейнери та їхній стан.', 'Лише список і стан.'],
    nl: ['Containers bekijken', 'Docker-containers en hun status.', 'Alleen lijst en status.'] },
  { id: 'docker_manage_container', essentie: 'beheren_container', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'apps', risico: 'hoog',
    uk: ['Керувати контейнерами', 'Запуск, зупинка й перезапуск контейнера.', 'Сервіс у контейнері тимчасово зникне. Кожну дію ви підтверджуєте.'],
    nl: ['Containers beheren', 'Een container starten, stoppen of herstarten.', 'De dienst in de container valt even weg. Elke actie bevestigt u.'] },
  { id: 'app_list', essentie: 'tonen_apps', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apps', risico: 'laag',
    uk: ['Переглядати додатки', 'Ваші самостійно розміщені додатки (BYOS) та їхні адреси.', 'Лише перелік.'],
    nl: ['Apps bekijken', 'Uw zelf gehoste apps (BYOS) en hun adressen.', 'Alleen een lijst.'] },
  { id: 'app_deploy_status', essentie: 'tonen_uitrol_status', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apps', risico: 'laag',
    uk: ['Стан розгортання', 'Як іде розгортання додатка.', 'Лише стан.'],
    nl: ['Status van een uitrol', 'Hoe de uitrol van een app verloopt.', 'Alleen de status.'] },
  { id: 'app_logs', essentie: 'lezen_app_logboek', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apps', risico: 'midden',
    uk: ['Читати журнали додатка', 'Останні рядки журналу додатка.', 'У журналах іноді трапляються адреси, імена чи токени.'],
    nl: ['Logboek van een app lezen', 'De laatste regels van het logboek van een app.', 'In logboeken staan soms adressen, namen of tokens.'] },
  { id: 'app_versions', essentie: 'tonen_app_versies', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apps', risico: 'laag',
    uk: ['Версії додатка', 'Попередні розгортання, до яких можна повернутися.', 'Лише список.'],
    nl: ['Versies van een app', 'Eerdere uitrollen waarnaar u terug kunt.', 'Alleen een lijst.'] },
  { id: 'app_secret_list', essentie: 'tonen_geheim_namen', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apps', risico: 'laag',
    uk: ['Назви секретів', 'Які секрети є в додатка (лише назви, ніколи значення).', 'Значень ШІ не бачить ніколи.'],
    nl: ['Namen van geheimen', 'Welke geheimen een app heeft (alleen namen, nooit waarden).', 'Waarden ziet de AI nooit.'] },
  { id: 'app_deploy', essentie: 'uitrollen_app', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'apps', risico: 'hoog',
    uk: ['Розгортати додатки', 'Збирає й запускає додаток на вашому пристрої в ізольованому контейнері.', 'З’являється новий сервіс з адресою; він споживає ресурси.', 'Кожне розгортання ви підтверджуєте.'],
    nl: ['Apps uitrollen', 'Bouwt en start een app op uw apparaat in een geïsoleerde container.', 'Er komt een nieuwe dienst met een adres; die gebruikt middelen.', 'Elke uitrol bevestigt u.'] },
  { id: 'app_rollback', essentie: 'terugdraaien_app', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'apps', risico: 'midden',
    uk: ['Повертати попередню версію', 'Відкат додатка до попереднього розгортання.', 'Нові зміни зникнуть з роботи (але не з архіву версій).'],
    nl: ['Vorige versie terugzetten', 'De app terugzetten naar een eerdere uitrol.', 'Nieuwe wijzigingen gaan uit de lucht (niet uit het versiearchief).'] },
  { id: 'app_control', essentie: 'bedienen_app', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'apps', risico: 'midden',
    uk: ['Запускати й зупиняти додатки', 'Старт, стоп, перезапуск додатка.', 'Додаток тимчасово недоступний.'],
    nl: ['Apps starten en stoppen', 'Een app starten, stoppen of herstarten.', 'De app is even onbereikbaar.'] },
  { id: 'app_route', essentie: 'instellen_app_route', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'apps', risico: 'hoog',
    uk: ['Налаштовувати адресу додатка', 'Під якою адресою додаток доступний.', 'Додаток може стати видимим ззовні.', 'Перевіряйте, що адреса не відкриває приватне.'],
    nl: ['Adres van een app instellen', 'Onder welk adres de app bereikbaar is.', 'De app kan van buitenaf zichtbaar worden.', 'Controleer dat het adres niets privés openzet.'] },
  { id: 'app_secret_request', essentie: 'aanvragen_geheim', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'apps', risico: 'midden',
    uk: ['Просити секрет', 'Просить вас ввести секрет (ключ, пароль) на сайті; ШІ значення не бачить.', 'Ви вводите значення самі.'],
    nl: ['Om een geheim vragen', 'Vraagt u een geheim (sleutel, wachtwoord) op de site in te voeren; de AI ziet de waarde niet.', 'U voert de waarde zelf in.'] },
  { id: 'app_secret_delete', essentie: 'verwijderen_geheim', sub: 'mcp', kanten: BEIDE, soort: 'wissen', groep: 'apps', risico: 'hoog',
    uk: ['Видаляти секрети', 'Видаляє секрет додатка.', 'Додаток може перестати працювати; значення не повернути.'],
    nl: ['Geheimen verwijderen', 'Verwijdert een geheim van een app.', 'De app kan stoppen met werken; de waarde is niet terug te halen.'] },
  // 21.10.2026 — besluit van de eigenaar: nu echt (backend/dev-mg-bevestiging.ts). Voorstel → bevestiging op de site met passkey →
  // Caddy-route op de server; adressen van de site en alles onder haar cookiedomein weigert de server vooraf (shared/app-domein.ts).
  { id: 'app_domain', essentie: 'instellen_eigen_domein', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'apps', risico: 'kritiek',
    uk: ['Власний домен для додатка', 'Пропонує окремий домен для додатка на сервері (маршрут Caddy); виконується лише після вашого підтвердження на сайті з passkey.', 'Змінюються DNS і тунель; помилка робить сайт або додаток недоступним. Адреси самого сайту й усе під його доменом сервер відхиляє.', 'Назву в тунелі ви додаєте самі однією командою на сервері — сайт не має прав root.'],
    nl: ['Eigen domein voor een app', 'Stelt een eigen domein voor een app op de server voor (Caddy-route); gebeurt pas na uw bevestiging op de site met passkey.', 'DNS en tunnel veranderen; een fout maakt de site of de app onbereikbaar. Adressen van de site zelf en alles onder haar domein weigert de server.', 'De naam in de tunnel zet u zelf met één opdracht op de server — de site heeft geen root.'] },

  // ---------------------------------------------------------------- browser (extensie)
  { id: 'browser_list_tabs', essentie: 'tonen_tabbladen', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Переглядати вкладки', 'Відкриті вкладки «Мого простору» (лише сайт, не інші сайти).', 'ШІ бачить назви й адреси сторінок сайту.'],
    nl: ['Tabbladen bekijken', 'Open tabbladen van Mijn Ruimte (alleen de site, geen andere sites).', 'De AI ziet titels en adressen van sitepagina\'s.'] },
  { id: 'browser_snapshot', essentie: 'lezen_pagina', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'browser', risico: 'midden',
    uk: ['Читати сторінку', 'Текст і структура відкритої сторінки сайту.', 'ШІ бачить усе, що на сторінці, наприклад відкритий лист.'],
    nl: ['Pagina lezen', 'Tekst en opbouw van een open pagina van de site.', 'De AI ziet alles op de pagina, bv. een geopend bericht.'] },
  { id: 'browser_scroll', essentie: 'scrollen_pagina', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Прокручувати сторінку', 'Прокрутка, щоб прочитати далі.', 'Нічого не змінює.'],
    nl: ['Pagina scrollen', 'Scrollen om verder te lezen.', 'Verandert niets.'] },
  { id: 'browser_wait_for_text', essentie: 'wachten_op_tekst', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Чекати на текст', 'Чекає, доки на сторінці з’явиться текст.', 'Нічого не змінює.'],
    nl: ['Wachten op tekst', 'Wacht tot een tekst op de pagina staat.', 'Verandert niets.'] },
  { id: 'browser_console', essentie: 'lezen_console', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Читати консоль', 'Повідомлення консолі сторінки (для пошуку помилок).', 'Технічні повідомлення сайту.'],
    nl: ['Console lezen', 'Consolemeldingen van de pagina (om fouten te vinden).', 'Technische meldingen van de site.'] },
  { id: 'browser_network', essentie: 'lezen_netwerk', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Читати мережеві запити', 'Адреси й стани запитів сторінки (без вмісту й без cookie).', 'Технічні дані.'],
    nl: ['Netwerkverzoeken lezen', 'Adressen en status van verzoeken van de pagina (zonder inhoud of cookies).', 'Technische gegevens.'] },
  { id: 'browser_get_diagnostics', essentie: 'tonen_diagnose', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Діагностика сторінки', 'Короткий звіт про помилки на сторінці.', 'Технічні дані.'],
    nl: ['Diagnose van de pagina', 'Kort rapport over fouten op de pagina.', 'Technische gegevens.'] },
  { id: 'browser_audit', essentie: 'tonen_pagina_audit', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Аудит сторінки', 'Швидкодія, знахідки безпеки й структура відкритої сторінки (розширення 0.5).', 'Без значень полів, cookie й рядків запиту; лише коли розширення розблоковано вашим passkey.'],
    nl: ['Audit van de pagina', 'Snelheid, beveiligingsbevindingen en opbouw van de open pagina (extensie 0.5).', 'Zonder veldwaarden, cookies of querystrings; alleen als de extensie met uw passkey is ontgrendeld.'] },
  { id: 'browser_get_deep_diagnostics', essentie: 'doen_diepe_diagnose', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'browser', risico: 'midden',
    uk: ['Глибока діагностика', 'Розширений звіт зі станом сторінки й сховища.', 'Може показати більше технічних деталей; ви підтверджуєте.'],
    nl: ['Diepe diagnose', 'Uitgebreid rapport met de staat van pagina en opslag.', 'Kan meer technische details tonen; u bevestigt.'] },
  { id: 'browser_screenshot', essentie: 'maken_schermafdruk', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'browser', risico: 'midden',
    uk: ['Робити знімок екрана', 'Знімок відкритої сторінки сайту.', 'На знімку все, що видно, зокрема особисте.'],
    nl: ['Schermafdruk maken', 'Een afbeelding van de open pagina.', 'Op de afbeelding staat alles wat zichtbaar is, ook privézaken.'] },
  { id: 'browser_open', essentie: 'openen_pagina', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'browser', risico: 'laag',
    uk: ['Відкривати сторінки', 'Відкриває сторінку сайту у вашому браузері.', 'Лише адреси tarasevych.com.'],
    nl: ['Pagina\'s openen', 'Opent een pagina van de site in uw browser.', 'Alleen adressen op tarasevych.com.'] },
  { id: 'browser_pages', essentie: 'beheren_tabbladen', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'browser', risico: 'laag',
    uk: ['Керувати вкладками', 'Перемикати, відкривати й закривати вкладки сайту.', 'Незбережене у закритій вкладці може зникнути.'],
    nl: ['Tabbladen beheren', 'Tabbladen van de site wisselen, openen en sluiten.', 'Niet-opgeslagen werk in een gesloten tab kan verloren gaan.'] },
  { id: 'browser_history', essentie: 'navigeren_geschiedenis', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'browser', risico: 'laag',
    uk: ['Назад і вперед', 'Перехід назад/вперед/оновлення сторінки.', 'Незбережене може зникнути.'],
    nl: ['Terug en vooruit', 'Terug, vooruit of de pagina vernieuwen.', 'Niet-opgeslagen werk kan verloren gaan.'] },
  { id: 'browser_click', essentie: 'klikken_element', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'browser', risico: 'hoog',
    uk: ['Натискати кнопки', 'Клік по елементу сторінки.', 'Клік робить те саме, що й ваш: може надіслати, видалити, підтвердити.', 'Кожну дію ви підтверджуєте.'],
    nl: ['Knoppen indrukken', 'Klikken op een element van de pagina.', 'Een klik doet hetzelfde als die van u: verzenden, verwijderen, bevestigen.', 'Elke actie bevestigt u.'] },
  { id: 'browser_type', essentie: 'typen_tekst', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'browser', risico: 'midden',
    uk: ['Вводити текст', 'Друкує текст у поле.', 'Поле змінюється; надсилання — окрема дія.'],
    nl: ['Tekst typen', 'Typt tekst in een veld.', 'Het veld verandert; verzenden is een aparte actie.'] },
  { id: 'browser_hover', essentie: 'aanwijzen_element', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'browser', risico: 'laag',
    uk: ['Наводити курсор', 'Показує підказки й меню під курсором.', 'Нічого не змінює.'],
    nl: ['Element aanwijzen', 'Toont tips en menu\'s onder de muis.', 'Verandert niets.'] },
  { id: 'browser_fill_form', essentie: 'invullen_formulier', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'browser', risico: 'midden',
    uk: ['Заповнювати форми', 'Кілька полів за раз.', 'Форма змінюється; надсилання — окрема дія.'],
    nl: ['Formulieren invullen', 'Meerdere velden tegelijk.', 'Het formulier verandert; verzenden is een aparte actie.'] },
  { id: 'browser_select_option', essentie: 'kiezen_optie', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'browser', risico: 'laag',
    uk: ['Вибирати варіант', 'Вибір у списку.', 'Поле змінюється.'],
    nl: ['Optie kiezen', 'Keuze in een lijst.', 'Het veld verandert.'] },
  { id: 'browser_press_key', essentie: 'drukken_toets', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'browser', risico: 'midden',
    uk: ['Натискати клавіші', 'Enter, Escape, стрілки.', 'Enter може надіслати форму.'],
    nl: ['Toetsen indrukken', 'Enter, Escape, pijltjes.', 'Enter kan een formulier verzenden.'] },
  // 0110 (zone E): evaluate_script als in chrome-devtools-mcp — alleen technisch, alleen met «Скрипти» in de matrix «Браузер і агенти».
  { id: 'browser_script', essentie: 'uitvoeren_script', sub: 'mcp', kanten: ['beheer'], soort: 'schrijven', groep: 'browser', risico: 'hoog',
    uk: ['Виконувати скрипти', 'JavaScript у технічній вкладці (evaluate_script), результат як JSON. Лише з пакетом «діагностика» й позначкою «Скрипти» у «Браузер і агенти».', 'Довільний код у вашій сесії: може прочитати й змінити все на сторінці. Кожен виклик чекає на ваше підтвердження.'],
    nl: ['Scripts uitvoeren', 'JavaScript in het technische tabblad (evaluate_script), resultaat als JSON. Alleen met het pakket «diagnose» en het vinkje «Scripts» in «Browser en agenten».', 'Willekeurige code in uw sessie: kan alles op de pagina lezen en wijzigen. Elke aanroep wacht op uw bevestiging.'] },
  { id: 'browser_invoke_action', essentie: 'uitvoeren_site_actie', sub: 'mcp', kanten: BEIDE, soort: 'schrijven', groep: 'browser', risico: 'hoog',
    uk: ['Дії сайту', 'Вбудовані дії сторінки (наприклад «Архівувати лист»).', 'Дія виконується так, ніби її натиснули ви.'],
    nl: ['Acties van de site', 'Ingebouwde acties van een pagina (bv. «Bericht archiveren»).', 'De actie gebeurt alsof u erop klikte.'] },

  // ---------------------------------------------------------------- GitHub
  { id: 'github_get', essentie: 'opvragen_gegevens', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Читати дані GitHub', 'Запити лише на читання до GitHub від вашого токена.', 'ШІ бачить те, що бачить ваш токен, зокрема приватні репозиторії.'],
    nl: ['Gegevens van GitHub lezen', 'Alleen-lezen verzoeken aan GitHub met uw token.', 'De AI ziet wat uw token ziet, ook privérepositories.'] },
  { id: 'get_github_projects', essentie: 'tonen_projecten', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Переглядати проєкти', 'Ваші репозиторії та останні зміни.', 'Лише список.'],
    nl: ['Projecten bekijken', 'Uw repositories en recente wijzigingen.', 'Alleen een lijst.'] },
  { id: 'github_create_issue', essentie: 'creeren_nieuw_issue', weergave: 'creëren nieuw issue', sub: 'github', dienst: 'github', kanten: G, soort: 'schrijven', groep: 'github', risico: 'midden',
    uk: ['Створювати задачі (issues)', 'Нова задача в репозиторії від вашого імені.', 'Задачу бачать усі, хто має доступ до репозиторію.'],
    nl: ['Issues maken', 'Een nieuw issue in een repository namens u.', 'Iedereen met toegang tot de repository ziet het.'] },
  { id: 'github_comment_issue', essentie: 'reageren_op_issue', sub: 'github', dienst: 'github', kanten: G, soort: 'schrijven', groep: 'github', risico: 'midden',
    uk: ['Коментувати задачі', 'Коментар від вашого імені.', 'Коментар публічний у межах репозиторію.'],
    nl: ['Reageren op issues', 'Een reactie namens u.', 'De reactie is openbaar binnen de repository.'] },
  { id: 'github_status', essentie: 'tonen_github_koppeling', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Стан підключення GitHub', 'Чи підключено GitHub і який обліковий запис.', 'Лише логін і кількість репозиторіїв.'],
    nl: ['Status van de GitHub-koppeling', 'Of GitHub gekoppeld is en welk account.', 'Alleen login en aantal repositories.'] },
  { id: 'github_list_repos', essentie: 'tonen_repositories', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Список репозиторіїв', 'Ваші репозиторії, найновіші спершу.', 'ШІ бачить і назви приватних репозиторіїв.'],
    nl: ['Lijst van repositories', 'Uw repositories, nieuwste eerst.', 'De AI ziet ook namen van privérepositories.'] },
  { id: 'github_repo_overview', essentie: 'tonen_repo_overzicht', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Огляд репозиторію', 'Опис, зірки, відкриті задачі, мови, останній випуск.', 'Лише довідка.'],
    nl: ['Overzicht van een repository', 'Beschrijving, sterren, open issues, talen, laatste release.', 'Alleen naslag.'] },
  { id: 'github_list_issues', essentie: 'tonen_issues', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Задачі й pull request', 'Список задач або pull request із коротким описом.', 'У приватних репозиторіях — приватні тексти.'],
    nl: ['Issues en pull requests', 'Lijst van issues of pull requests met korte tekst.', 'In privérepositories gaat het om privéteksten.'] },
  { id: 'github_list_commits', essentie: 'tonen_commits', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Останні коміти', 'Коміти репозиторію чи гілки.', 'Лише історія змін.'],
    nl: ['Laatste commits', 'Commits van een repository of branch.', 'Alleen de geschiedenis van wijzigingen.'] },
  { id: 'github_ci_status', essentie: 'tonen_ci_status', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Стан CI', 'Останні запуски GitHub Actions і скільки впало.', 'Лише стан.'],
    nl: ['Status van CI', 'Laatste GitHub Actions-runs en hoeveel er faalden.', 'Alleen de status.'] },
  { id: 'github_read_readme', essentie: 'lezen_readme', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Читати README', 'Опис репозиторію з файла README.', 'Лише документація.'],
    nl: ['README lezen', 'De beschrijving uit het README-bestand.', 'Alleen documentatie.'] },
  { id: 'github_search', essentie: 'zoeken_in_github', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Шукати в GitHub', 'Пошук репозиторіїв, задач і коду.', 'Пошук іде від вашого токена.'],
    nl: ['Zoeken in GitHub', 'Zoeken naar repositories, issues en code.', 'Er wordt gezocht met uw token.'] },
  { id: 'github_my_activity', essentie: 'tonen_mijn_activiteit', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Моя активність', 'Ваші останні дії в GitHub.', 'ШІ бачить, над чим ви працювали.'],
    nl: ['Mijn activiteit', 'Uw recente acties op GitHub.', 'De AI ziet waaraan u werkte.'] },
  // 21.10.2026 — nu echt: nieuwe branch + één commit + pull request, pas na bevestiging op de site (backend/dev-mg-bevestiging.ts).
  { id: 'github_pr', essentie: 'creeren_pull_request', weergave: 'creëren pull request', sub: 'github', dienst: 'github', kanten: G, soort: 'schrijven', groep: 'github', risico: 'hoog',
    uk: ['Створювати pull request', 'Пропонує нову гілку з одним комітом і запит на злиття; на GitHub нічого не з’явиться, доки ви не підтвердите це на сайті.', 'Код потрапляє в репозиторій як нова гілка (ще не злита). Злиття ШІ не робить ніколи; наявну гілку не перезаписує; зміни в CI ШІ не пропонує.', 'Кожен запит ви підтверджуєте на сайті з passkey.'],
    nl: ['Pull requests maken', 'Stelt een nieuwe branch met één commit en een verzoek tot samenvoegen voor; op GitHub verschijnt niets tot u het op de site bevestigt.', 'Code komt in de repository als nieuwe branch (nog niet samengevoegd). Samenvoegen doet de AI nooit; een bestaande branch overschrijft zij niet; wijzigingen aan CI stelt zij nooit voor.', 'Elk verzoek bevestigt u op de site met passkey.'] },
  // 21.10.2026 — nu echt: jobs, stappen en de staart van het logboek (backend/github-platform.ts → ghCiLogs).
  { id: 'github_ci_logs', essentie: 'lezen_workflow_logboek', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Журнали CI', 'Журнали запусків GitHub Actions: завдання, кроки й кінець журналу з рядками помилок.', 'У журналах бувають технічні деталі; GitHub сам приховує секрети як ***.'],
    nl: ['Logboeken van CI', 'Logboeken van GitHub Actions-runs: jobs, stappen en het einde van het logboek met de foutregels.', 'Logboeken kunnen technische details bevatten; GitHub verbergt geheimen zelf als ***.'] },
  { id: 'github_list_branches', essentie: 'tonen_takken', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Гілки й мітки версій', 'Перелік гілок і міток сховища разом із типовою гілкою та станом захисту.', 'Лише назви гілок і контрольні суми фіксацій змін.'],
    nl: ['Takken en tags bekijken', 'Overzicht van takken en tags van een repository met de hoofdtak en beveiligingsstatus.', 'Uitsluitend taknamen en controlesommen van vastleggingen.'] },
  { id: 'github_list_tree', essentie: 'tonen_boom', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Дерево папок і файлів', 'Будова каталогів і файлів сховища для вибраної гілки чи мітки без читання їхнього вмісту.', 'ШІ бачить шляхи та розміри файлів сховища.'],
    nl: ['Bestandsboom bekijken', 'Opbouw van mappen en bestanden van een repository voor een gekozen tak of tag zonder de inhoud te lezen.', 'De AI ziet paden en omvang van bestanden in de repository.'] },
  { id: 'github_read_file', essentie: 'lezen_codebestand', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'midden',
    uk: ['Читати файл сховища', 'Читає текстовий файл вихідного коду або документації зі сховища у вибраній гілці.', 'ШІ читає вміст файла у вашому приватному чи публічному сховищі.'],
    nl: ['Codebestand lezen', 'Leest een broncode- of documentatiebestand uit een repository op de gekozen tak.', 'De AI leest de inhoud van het bestand in uw besloten of openbare repository.'] },
  { id: 'github_compare', essentie: 'vergelijken_takken', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Порівнювати гілки', 'Порівнює дві гілки або фіксації змін і повертає перелік змінених файлів та різницю рядків.', 'ШІ бачить різницю коду між гілками.'],
    nl: ['Takken vergelijken', 'Vergelijkt twee takken of vastleggingen en geeft de gewijzigde bestanden en regelverschillen terug.', 'De AI ziet het codeverschil tussen takken.'] },
  { id: 'github_list_releases', essentie: 'tonen_uitgaven', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Випуски сховища', 'Перелік опублікованих випусків сховища з їхніми описами та прикріпленими архівами.', 'Лише відомості про випуски.'],
    nl: ['Uitgaven van een repository', 'Overzicht van gepubliceerde uitgaven van een repository met hun beschrijving en bijlagen.', 'Uitsluitend gegevens over uitgaven.'] },
  { id: 'github_save_file', essentie: 'opslaan_codebestand', sub: 'github', dienst: 'github', kanten: G, soort: 'schrijven', groep: 'github', risico: 'hoog',
    uk: ['Зберігати файл у сховищі', 'Створює або оновлює файл у гілці чи новій гілці зі створенням запиту на злиття — лише після вашого підтвердження на сайті.', 'Нова фіксація змін з’явиться у вашому сховищі GitHub.', 'Кожне збереження ви підтверджуєте на сайті.'],
    nl: ['Codebestand opslaan in repository', 'Maakt of werkt een bestand bij op een tak of nieuwe tak met een samenvoegingsverzoek — pas na uw goedkeuring op de site.', 'Er verschijnt een nieuwe vastlegging in uw GitHub-repository.', 'Elke opslagactie bevestigt u op de site.'] },
  { id: 'github_sync_mirror', essentie: 'synchroniseren_repo', sub: 'github', dienst: 'github', kanten: G, soort: 'schrijven', groep: 'github', risico: 'midden',
    uk: ['Синхронізувати дзеркало GitHub', 'Оновлює ізольоване двостороннє дзеркало сховищ та пов’язані задачі Дошки у вашому просторі на сайті.', 'Оновлюються записи дзеркала у вашому просторі без видалення сховищ на GitHub.'],
    nl: ['GitHub-spiegel synchroniseren', 'Werkt de geïsoleerde tweerichtingsspiegel van repositories en gekoppelde bordtaken in uw ruimte op de site bij.', 'De spiegelregistraties in uw ruimte worden bijgewerkt zonder repositories op GitHub te wissen.'] },

  // ---------------------------------------------------------------- ontwerp en media
  // 21.10.2026 — nu echt: de LOKALE generator van de eigenaar (BYOS, backend/media-generator.ts), resultaat in de eigen hmara.
  { id: 'image_generate', essentie: 'genereren_afbeelding', sub: 'ai', kanten: G, soort: 'schrijven', groep: 'media', risico: 'laag',
    uk: ['Створювати зображення', 'Генерує зображення локальною моделлю на вашому сервері чи в локальній мережі й зберігає його у вашу хмару.', 'Використовує ресурси вашого комп’ютера; опис і зображення не йдуть у жодну сторонню хмару.', 'Спершу адміністратор запускає генератор і вказує його адресу в майстрі підключень.'],
    nl: ['Afbeeldingen genereren', 'Genereert een afbeelding met een lokaal model op uw server of in uw lokale netwerk en zet haar in uw cloud.', 'Gebruikt de middelen van uw eigen computer; beschrijving en afbeelding gaan naar geen enkele externe cloud.', 'Eerst start de beheerder de generator en vult hij het adres in bij de koppelwizard.'] },
  // 21.10.2026 — nu echt: Mermaid gecontroleerd (shared/mermaid-schema.ts), .mmd in de hmara, getekend in de browser.
  { id: 'diagram_generate', essentie: 'genereren_diagram', sub: 'ai', kanten: G, soort: 'schrijven', groep: 'media', risico: 'laag',
    uk: ['Створювати схеми', 'Схема чи діаграма з коду Mermaid: сервер перевіряє код і зберігає файл .mmd у вашу хмару; сайт малює його у браузері.', 'Файл схеми у вашому просторі; без скриптів і зовнішніх адрес.'],
    nl: ['Diagrammen maken', 'Een schema of diagram uit Mermaid-code: de server controleert de code en zet een .mmd-bestand in uw cloud; de site tekent het in de browser.', 'Een schemabestand in uw ruimte; zonder scripts en externe adressen.'] },
  // 21.10.2026 — nu echt: tokens, het palet van deze mens en de primitieven (backend/ontwerp-context.ts). Alleen stijlen.
  { id: 'screenshot_design', essentie: 'tonen_ontwerp_context', sub: 'ai', kanten: G, soort: 'lezen', groep: 'media', risico: 'laag',
    uk: ['Контекст дизайну', 'Кольори, шрифти, відступи й компоненти вашого сайту для ШІ-дизайну: токени, ваша палітра й примітиви.', 'Лише стилі — жодних ваших даних.'],
    nl: ['Ontwerpcontext', 'Kleuren, lettertypen, afstanden en componenten van uw site voor AI-ontwerp: tokens, uw palet en de bouwstenen.', 'Alleen stijlen — geen gegevens van u.'] },

  // ---------------------------------------------------------------- betalingen
  // 21.10.2026 — nu echt: Stripe alleen lezen met een BEPERKTE sleutel uit de kluis (backend/betalingen-stripe.ts).
  { id: 'payments_list', essentie: 'tonen_betalingen', sub: 'hub', dienst: 'stripe', kanten: G, soort: 'lezen', groep: 'betalingen', risico: 'hoog', gevoelig: true,
    uk: ['Переглядати платежі', 'Платежі, рахунки й виплати з підключеного Stripe — лише читання, сторінками.', 'Фінансові дані: суми, стани, дати; без імен, адрес пошти й номерів карток.', 'Потрібен обмежений ключ Stripe лише для читання — його ви кладете у сховище через майстер підключень.'],
    nl: ['Betalingen bekijken', 'Betalingen, facturen en uitbetalingen uit een gekoppeld Stripe — alleen lezen, per pagina.', 'Financiële gegevens: bedragen, status, data; zonder namen, e-mailadressen of kaartnummers.', 'Nodig: een beperkte Stripe-sleutel met alleen leesrechten — die zet u via de koppelwizard in de kluis.'] },

  // ---------------------------------------------------------------- beheer: releases en updates
  { id: 'get_live_release', essentie: 'tonen_live_release', sub: 'admin', kanten: B, soort: 'lezen', groep: 'releases', risico: 'laag',
    uk: ['Яка версія працює', 'Поточний випуск сайту: версія й коміт.', 'Лише довідка.'],
    nl: ['Welke versie draait', 'De huidige release van de site: versie en commit.', 'Alleen naslag.'] },
  { id: 'list_releases', essentie: 'tonen_releases', sub: 'admin', kanten: B, soort: 'lezen', groep: 'releases', risico: 'laag',
    uk: ['Список випусків', 'Випуски на сервері та структура живого випуску.', 'Без секретів.'],
    nl: ['Lijst van releases', 'Releases op de server en de opbouw van de live release.', 'Zonder geheimen.'] },
  { id: 'read_release_file', essentie: 'lezen_release_bestand', sub: 'admin', kanten: B, soort: 'lezen', groep: 'releases', risico: 'midden',
    uk: ['Читати файли випуску', 'Текстовий файл живого випуску (код, документація).', 'ШІ бачить код сайту; секрети двері відмовляє.'],
    nl: ['Bestanden van de release lezen', 'Een tekstbestand uit de live release (code, documentatie).', 'De AI ziet de code van de site; geheimen weigert de deur.'] },
  { id: 'uitrol_voorstel_status', essentie: 'tonen_update_status', sub: 'admin', kanten: B, soort: 'lezen', groep: 'releases', risico: 'laag',
    uk: ['Стан пропозиції оновлення', 'Чи чекає пакет на ваше схвалення.', 'Лише стан.'],
    nl: ['Status van een updatevoorstel', 'Of een pakket op uw goedkeuring wacht.', 'Alleen de status.'] },
  { id: 'uitrol_voorstel_begin', essentie: 'starten_update_voorstel', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'releases', risico: 'hoog',
    uk: ['Починати пропозицію оновлення', 'Відкриває завантаження нового пакета випуску.', 'Встановлює лише ваш passkey на сайті; ШІ схвалити не може.'],
    nl: ['Updatevoorstel starten', 'Opent het uploaden van een nieuw releasepakket.', 'Installeren doet alleen uw passkey op de site; de AI kan niet goedkeuren.'] },
  { id: 'uitrol_voorstel_stuk', essentie: 'uploaden_update_deel', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'releases', risico: 'hoog',
    uk: ['Завантажувати частини пакета', 'Частини архіву .tar.gz пропозиції.', 'Займає місце на сервері до скасування.'],
    nl: ['Delen van het pakket uploaden', 'Delen van het .tar.gz-archief van het voorstel.', 'Neemt ruimte op de server tot annuleren.'] },
  { id: 'uitrol_voorstel_klaar', essentie: 'indienen_update_voorstel', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'releases', risico: 'hoog',
    uk: ['Подавати пропозицію на схвалення', 'Перевіряє SHA-256 і ставить пакет у чергу на ваше схвалення.', 'На сайті з’являється запит; нічого не встановлюється без вас.'],
    nl: ['Updatevoorstel indienen', 'Controleert SHA-256 en zet het pakket klaar voor uw goedkeuring.', 'Op de site verschijnt een verzoek; er wordt niets geïnstalleerd zonder u.'] },
  { id: 'uitrol_voorstel_annuleren', essentie: 'annuleren_update_voorstel', sub: 'admin', kanten: B, soort: 'wissen', groep: 'releases', risico: 'laag',
    uk: ['Скасовувати пропозицію', 'Видаляє незавершену пропозицію.', 'Завантажені частини видаляються.'],
    nl: ['Voorstel annuleren', 'Verwijdert een onafgemaakt voorstel.', 'Geüploade delen worden verwijderd.'] },

  // ---------------------------------------------------------------- beheer: server en beveiliging
  { id: 'get_admin_view', essentie: 'tonen_beheer_namens', sub: 'admin', kanten: B, soort: 'lezen', groep: 'server', risico: 'midden',
    uk: ['Адмін-розділи від імені власника', 'Огляд, розгортання, діагностика, журнал — лише поки діє ваш дозвіл (passkey, до 8 год).', 'ШІ бачить адмін-дані; кожна дія в журналі як дія агента.'],
    nl: ['Beheerweergaven namens de eigenaar', 'Overzicht, uitrollen, diagnostiek, logboek — alleen zolang uw toestemming geldt (passkey, max. 8 u).', 'De AI ziet beheergegevens; elke actie staat in het logboek als actie van de agent.'] },
  { id: 'get_system_health', essentie: 'tonen_server_gezondheid', sub: 'admin', kanten: B, soort: 'lezen', groep: 'server', risico: 'laag',
    uk: ['Стан сервера', 'Служби, база, диск, сертифікати.', 'Лише стан.'],
    nl: ['Gezondheid van de server', 'Diensten, database, schijf en certificaten.', 'Alleen de status.'] },
  // 21.10.2026 — besluit van de eigenaar: deze vier stonden «in ontwikkeling» en zijn nu echte hulpmiddelen (backend/ai-beheer-hulpmiddelen.ts).
  // Alleen de technische kant en alleen via connector v2 met uitdrukkelijke toestemming per hulpmiddel (NOOIT via de erfenis van het oude
  // /mcp: backend/connector-v2-erfenis.ts → ALLEEN_UITDRUKKELIJK). De twee schrijvende voeren zelf niets uit: zij zetten een verzoek in
  // de bevestigingsrij op de site (backend/ai-bevestiging.ts); gebruikers alleen met de passkey van de eigenaar, per actie.
  { id: 'audit_read', essentie: 'lezen_audit_journaal', sub: 'admin', kanten: B, soort: 'lezen', groep: 'server', risico: 'midden',
    uk: ['Читати журнал безпеки', 'Хто й що робив на сайті: до 100 записів за раз і не довше ніж за 31 день.', 'IP-адрес ШІ не бачить (лише короткий псевдонім), адреси пошти замасковано, секретів у відповіді немає.'],
    nl: ['Beveiligingslogboek lezen', 'Wie wat deed op de site: hoogstens 100 regels per keer en hoogstens 31 dagen terug.', 'IP-adressen ziet de AI niet (alleen een kort pseudoniem), e-mailadressen zijn gemaskeerd, geheimen staan nooit in het antwoord.'] },
  { id: 'users_manage', essentie: 'beheren_gebruikers', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'server', risico: 'kritiek',
    uk: ['Керувати користувачами', 'Переглядати користувачів і пропонувати зміни: схвалити, заблокувати, змінити роль.', 'Змінює, хто має доступ до сайту. ШІ лише пропонує: кожну дію ви підтверджуєте на сайті своїм passkey.', 'Власника й роль власника через ШІ змінити не можна взагалі.'],
    nl: ['Gebruikers beheren', 'Gebruikers bekijken en wijzigingen voorstellen: goedkeuren, blokkeren, rol wijzigen.', 'Verandert wie toegang heeft tot de site. De AI stelt alleen voor: elke actie bevestigt u op de site met uw passkey.', 'De eigenaar en de eigenaarsrol zijn via de AI nooit te wijzigen.'] },
  { id: 'flags_manage', essentie: 'beheren_functie_vlaggen', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'server', risico: 'hoog',
    uk: ['Керувати прапорцями функцій', 'Переглядати прапорці й пропонувати зміни: увімкнути, вимкнути, частка користувачів, видалити.', 'Користувачі бачать зміну одразу після вашого підтвердження на сайті. Прапорець вмикає функцію, а не права.'],
    nl: ['Functievlaggen beheren', 'Vlaggen bekijken en wijzigingen voorstellen: aan, uit, deel van de gebruikers, verwijderen.', 'Gebruikers zien de wijziging meteen na uw bevestiging op de site. Een vlag zet een functie aan, geen recht.'] },
  { id: 'siem_status', essentie: 'tonen_siem_status', sub: 'admin', kanten: B, soort: 'lezen', groep: 'server', risico: 'laag',
    uk: ['Стан передачі в SIEM', 'Чи надходять події безпеки у ваш SIEM (файл або Loki на цьому сервері): черга, скільки передано, остання помилка.', 'Лише стан, без вмісту журналу.'],
    nl: ['Status van de SIEM-export', 'Of beveiligingsgebeurtenissen in uw SIEM aankomen (bestand of Loki op deze server): wachtrij, aantal verstuurd, laatste fout.', 'Alleen de status, zonder inhoud van het logboek.'] },
  // ORCH-001 етап 3 (31.10.2026) — координація ШІ-агентів (AGENTS.md / orchestratie): огляд, контекст, реєстрація задачі, передача пакета
  // в ТОЙ САМИЙ конвеєр, що й node scripts/orch.mjs inleveren (backend/orch-hulpmiddelen.ts). Правила змінює лише власник на сайті (passkey).
  { id: 'orch_overzicht', essentie: 'tonen_agent_coordinatie', sub: 'admin', kanten: B, soort: 'lezen', groep: 'releases', risico: 'laag',
    uk: ['Бачити координацію агентів', 'Чинна версія правил, база коду, задачі всіх агентів зі статусами, черга інтеграції, останні передачі й результат перевірки правил.', 'Лише читання. ШІ бачить, хто над чим працює і чи його задача ще за чинними правилами.'],
    nl: ['Agentcoördinatie bekijken', 'Geldende regelversie, codebasis, taken van alle agenten met status, integratiewachtrij, laatste overdrachten en de uitslag van de regelcontrole.', 'Alleen lezen. De AI ziet wie waaraan werkt en of zijn taak nog volgens de geldende regels is.'] },
  { id: 'orch_context', essentie: 'lezen_agent_context', sub: 'admin', kanten: B, soort: 'lezen', groep: 'releases', risico: 'laag',
    uk: ['Читати компактний контекст правил', 'Той самий orchestratie/CONTEXT-COMPACT.md, що й для агентів без GitHub: версія й відбиток правил, база, стислі блоки AGENTS.md.', 'Лише читання; текст — дані, не команди.'],
    nl: ['Compacte regelcontext lezen', 'Dezelfde orchestratie/CONTEXT-COMPACT.md als voor agenten zonder GitHub: versie en afdruk van de regels, basis, compacte blokken van AGENTS.md.', 'Alleen lezen; de tekst is gegevens, geen opdracht.'] },
  { id: 'orch_taak_start', essentie: 'registreren_agent_taak', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'releases', risico: 'midden',
    uk: ['Реєструвати задачу агента', 'Створює orchestratie/taken/<ID>.json: агент, власна гілка, базовий commit, чинна версія правил — як node scripts/orch.mjs taak-start.', 'Задача стає видимою всім агентам і власнику; інший агент не візьме той самий ідентифікатор. Коду це не змінює.'],
    nl: ['Agenttaak registreren', 'Maakt orchestratie/taken/<ID>.json: agent, eigen tak, basiscommit, geldende regelversie — zoals node scripts/orch.mjs taak-start.', 'De taak wordt zichtbaar voor alle agenten en de eigenaar; een andere agent neemt niet hetzelfde id. Code verandert er niet.'] },
  { id: 'orch_inleveren_begin', essentie: 'starten_overdracht', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'releases', risico: 'hoog',
    uk: ['Починати передачу результату', 'Відкриває завантаження пакета передачі (zip/tar.gz з ORCH-OVERDRACHT.json або git patch): назва, розмір, SHA-256.', 'Нічого не інтегрується й не встановлюється: пакет лише потрапить у чергу перевірки після останнього фрагмента.'],
    nl: ['Overdracht van een resultaat starten', 'Opent een upload van een overdrachtspakket (zip/tar.gz met ORCH-OVERDRACHT.json of git patch): naam, grootte, SHA-256.', 'Er wordt niets geïntegreerd of geïnstalleerd: het pakket komt pas na het laatste stuk in de controlerij.'] },
  { id: 'orch_inleveren_stuk', essentie: 'uploaden_overdracht_deel', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'releases', risico: 'hoog',
    uk: ['Надсилати частину пакета передачі', 'Один фрагмент до 512 КіБ за вказаним зміщенням.', 'Лише запис у тимчасову теку; без завершення пакет зникає за дві години.'],
    nl: ['Deel van een overdrachtspakket sturen', 'Eén stuk van hoogstens 512 KiB op de opgegeven positie.', 'Alleen een schrijfactie in een tijdelijke map; zonder afronden verdwijnt het pakket na twee uur.'] },
  { id: 'orch_inleveren_klaar', essentie: 'afronden_overdracht', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'releases', risico: 'hoog',
    uk: ['Завершувати передачу результату', 'Звіряє SHA-256 і проганяє пакет через конвеєр приймання: гілка від бази, правила, захищені файли, конфлікти з integratie, тести, запис, черга.', 'Прийнята передача — лише власна гілка й місце в черзі; злиття в integratie та установку робить людина. Відхилена — не лишає гілки.'],
    nl: ['Overdracht van een resultaat afronden', 'Vergelijkt de SHA-256 en haalt het pakket door de inleverpijplijn: tak vanaf de basis, regels, beschermde bestanden, conflicten met integratie, tests, record, wachtrij.', 'Een aanvaarde overdracht is alleen een eigen tak en een plek in de wachtrij; samenvoegen en installeren doet een mens. Een geweigerde laat geen tak achter.'] },

  // ---------------------------------------------------------------- ecosysteem: gedeelde context, taakoverdracht en ruimte-uitbreidingen
  { id: 'ecosysteem_context_list', essentie: 'tonen_werkcontext', sub: 'ai', kanten: BEIDE, soort: 'lezen', groep: 'apps', risico: 'laag',
    uk: ['Читати спільний контекст завдань', 'Читає збережені записи спільного контексту між завданнями, підключеними застосунками та агентами ШІ у вашому просторі.', 'ШІ бачить лише контекст поточного простору (приватного або технічного) без доступу до іншого простору.'],
    nl: ['Gedeelde werkcontext lezen', 'Leest opgeslagen items van de gedeelde werkcontext tussen taken, aangesloten toepassingen en AI-agenten in uw ruimte.', 'De AI ziet uitsluitend de context van de actieve ruimte (privé of technisch) zonder toegang tot de andere ruimte.'] },
  { id: 'ecosysteem_context_save', essentie: 'bewaren_werkcontext', sub: 'ai', kanten: BEIDE, soort: 'schrijven', groep: 'apps', risico: 'midden',
    uk: ['Зберігати спільний контекст завдань', 'Створює або оновлює запис спільного контексту, щоб інші завдання, застосунки й агенти ШІ продовжували роботу без втрати даних.', 'Запис з’являється у вашому реєстрі спільного контексту після підтвердження на сайті.'],
    nl: ['Gedeelde werkcontext bewaren', 'Maakt of werkt een gedeeld contextitem bij zodat volgende taken, toepassingen en AI-agenten verderwerken zonder contextverlies.', 'Het item verschijnt in uw register van gedeelde context na bevestiging op de site.'] },
  { id: 'ecosysteem_agent_overdracht', essentie: 'overdragen_taak', sub: 'ai', kanten: BEIDE, soort: 'schrijven', groep: 'apps', risico: 'midden',
    uk: ['Передавати завдання іншому агенту ШІ', 'Реєструє передачу завдання та вибраних ключів спільного контексту іншому підключеному агенту ШІ за вашим розпорядженням.', 'Створює запис передачі у вашому просторі; інший агент діє лише в межах наданих вами прав і після підтвердження на сайті.'],
    nl: ['Taak overdragen aan een andere AI-agent', 'Registreert een door u opgedragen taakoverdracht met gekozen contextsleutels naar een andere verbonden AI-agent.', 'Maakt een overdrachtsitem in uw ruimte na bevestiging op de site; de andere agent handelt uitsluitend binnen de rechten die u gaf.'] },
  { id: 'ecosysteem_ruimte_uitbreiding', essentie: 'bewaren_uitbreiding', sub: 'ai', kanten: BEIDE, soort: 'schrijven', groep: 'apps', risico: 'midden',
    uk: ['Додавати розширення простору сайту', 'Реєструє адаптацію, системний міст або робочий потік, створений вами чи інструментом програмування ШІ у межах вашого простору облікового запису.', 'Розширення працює лише у вашому просторі після підтвердження на сайті та з тими середовищами, які ви йому відкрили.'],
    nl: ['Uitbreiding van uw siteruimte bewaren', 'Registreert een aanpassing, systeembrug of werkstroom die door u of een programmeeragent binnen uw eigen accountruimte is gebouwd.', 'De uitbreiding werkt alleen in uw ruimte na bevestiging op de site en met de omgevingen die u ervoor openzette.'] },
];

/**
 * Extra zin bij de beheerkant van een optie die in beide ruimtes bestaat: apparaattools gaan over de server zelf, browsertools over
 * het TECHNISCHE slot van de extensie (tabbladen met actief technisch profiel) — nooit over de eigen tabbladen van de gebruiker.
 */
const BEHEER_EXTRA: Readonly<Record<'apparaat' | 'browser', { uk: string; nl: string }>> = Object.freeze({
  apparaat: { uk: 'Лише пристрої технічного простору (сам сервер).', nl: 'Alleen apparaten van de technische ruimte (de server zelf).' },
  browser: {
    uk: 'Лише технічний слот розширення: вкладки з активним технічним профілем і сторінки, розблоковані вашим passkey (admin.*, mcp.* тощо). Ніколи ваші звичайні вкладки.',
    nl: 'Alleen het technische slot van de extensie: tabbladen met een actief technisch profiel en pagina\'s die u met uw passkey ontgrendelde (admin.*, mcp.* enz.). Nooit uw gewone tabbladen.',
  },
});

/** Uitgevouwen catalogus: één optie per (id, kant). */
export const V2_OPTIES: readonly V2Optie[] = Object.freeze(DEFS.flatMap((d) => d.kanten.map((kant): V2Optie => ({
  key: `${d.id}:${kant}`, id: d.id, intern: d.intern === undefined ? d.id : d.intern, essentie: d.essentie, weergave: d.weergave ?? d.essentie.replace(/_/g, ' '),
  sub: d.sub, dienst: d.dienst && d.dienst !== d.sub ? d.dienst : null, kant, soort: d.soort, groep: d.groep,
  risico: kant === 'beheer' && d.risico === 'laag' && d.soort !== 'lezen' ? 'midden' : d.risico,
  gevoelig: !!d.gevoelig, status: d.intern === null ? 'in-ontwikkeling' : 'actief',
  uk: kant === 'beheer' && d.kanten.length > 1 ? [d.uk[0], `${d.uk[1]} ${BEHEER_EXTRA[d.groep === 'browser' ? 'browser' : 'apparaat'].uk}`, d.uk[2], d.uk[3]] : d.uk,
  nl: kant === 'beheer' && d.kanten.length > 1 ? [d.nl[0], `${d.nl[1]} ${BEHEER_EXTRA[d.groep === 'browser' ? 'browser' : 'apparaat'].nl}`, d.nl[2], d.nl[3]] : d.nl,
}))));

const PER_KEY = new Map(V2_OPTIES.map((o) => [o.key, o]));
export const v2Optie = (key: string): V2Optie | undefined => PER_KEY.get(key);
export const isV2Key = (v: unknown): v is string => typeof v === 'string' && PER_KEY.has(v);
export const actieveOpties = (): V2Optie[] => V2_OPTIES.filter((o) => o.status === 'actief');

export const RISICO_VOLGORDE: Record<Risico, number> = { laag: 0, midden: 1, hoog: 2, kritiek: 3 };
export const RISICO_TEKST: Record<Risico, { uk: string; nl: string }> = {
  laag: { uk: 'Низький ризик', nl: 'Laag risico' },
  midden: { uk: 'Середній ризик', nl: 'Middelmatig risico' },
  hoog: { uk: 'Високий ризик', nl: 'Hoog risico' },
  kritiek: { uk: 'Критичний', nl: 'Kritiek' },
};
export const SOORT_TEKST: Record<Soort, { uk: string; nl: string }> = {
  lezen: { uk: 'Читання', nl: 'Lezen' },
  schrijven: { uk: 'Запис', nl: 'Schrijven' },
  wissen: { uk: 'Видалення', nl: 'Verwijderen' },
};
export const KANT_TEKST: Record<Kant, { uk: string; nl: string; uitlegUk: string; uitlegNl: string }> = {
  gebruiker: { uk: 'Приватний простір', nl: 'Privéruimte', uitlegUk: 'Ваші дані: пошта, файли, дошка, ваші пристрої.', uitlegNl: 'Uw gegevens: mail, bestanden, bord, uw apparaten.' },
  beheer: { uk: 'Технічний доступ', nl: 'Technische toegang', uitlegUk: 'Керування сайтом і сервером. Лише власник з активним технічним профілем.', uitlegNl: 'Beheer van de site en de server. Alleen de eigenaar met actief technisch profiel.' },
};
