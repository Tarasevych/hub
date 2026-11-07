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
  { id: 'browser', uk: 'Браузер', nl: 'Browser', icoon: 'Globe', kant: 'gebruiker' },
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
const dev = (d: Omit<Def, 'intern'>): Def => ({ ...d, intern: null });

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
    uk: ['Переглядати мітки', 'Назви міток і папок у скриньці.', 'Назви міток іноді розповідають про ваші справи (наприклад «Лікар»).'],
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
  { id: 'mail_send', essentie: 'verzenden_brief', sub: 'mail', dienst: 'gmail', kanten: G, soort: 'schrijven', groep: 'mail', risico: 'hoog', gevoelig: true,
    uk: ['Надсилати листи від вашого імені', 'Відправлення листа одразу, без чернетки.', 'Лист піде від вашої адреси; відкликати його не можна.', 'Кожен лист ви підтверджуєте на сайті, якщо не дозволили автоматично.'],
    nl: ['Berichten verzenden namens u', 'Een bericht meteen verzenden, zonder concept.', 'Het bericht vertrekt vanaf uw adres en is niet terug te halen.', 'Elk bericht bevestigt u op de site, tenzij u automatische toestemming gaf.'] },

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
  { id: 'calendar_create_event', essentie: 'zetten_afspraak', sub: 'hub', dienst: 'gcal', kanten: G, soort: 'schrijven', groep: 'agenda', risico: 'midden',
    uk: ['Створювати події в календарі', 'Нова подія одразу в Google Календарі (не чернетка на дошці).', 'Подія з’явиться в календарі; запрошені її побачать, якщо ви їх указали.', 'Кожну подію ви підтверджуєте на сайті.'],
    nl: ['Afspraken in de agenda zetten', 'Een afspraak meteen in Google Agenda (geen concept op het bord).', 'De afspraak verschijnt in de agenda; genodigden zien hem als u die opgaf.', 'Elke afspraak bevestigt u op de site.'] },
  { id: 'calendar_update_event', essentie: 'wijzigen_afspraak', sub: 'hub', dienst: 'gcal', kanten: G, soort: 'schrijven', groep: 'agenda', risico: 'midden',
    uk: ['Змінювати події календаря', 'Назва, час, місце або нотатки наявної події.', 'Стара подія замінюється новою версією.', 'Кожну зміну ви підтверджуєте на сайті.'],
    nl: ['Afspraken in de agenda wijzigen', 'Titel, tijd, plaats of notities van een bestaande afspraak.', 'De oude afspraak wordt vervangen.', 'Elke wijziging bevestigt u op de site.'] },
  dev({ id: 'dev.icloud_events', essentie: 'tonen_afspraken', sub: 'hub', dienst: 'icloud', kanten: G, soort: 'lezen', groep: 'agenda', risico: 'midden',
    uk: ['Події з iCloud', 'Події календаря Apple iCloud.', 'Як і для Google: ШІ бачить ваш розклад.', 'У розробці: потрібне підключення iCloud до сайту.'],
    nl: ['Afspraken uit iCloud', 'Afspraken uit de Apple iCloud-agenda.', 'Net als bij Google: de AI ziet uw schema.', 'In ontwikkeling: eerst moet iCloud aan de site gekoppeld worden.'] }),

  // ---------------------------------------------------------------- bestanden
  { id: 'drive_browse', essentie: 'bladeren_map', sub: 'cloud', dienst: 'gdrive', kanten: G, soort: 'lezen', groep: 'bestanden', risico: 'laag',
    uk: ['Переглядати папки Диска', 'Назви файлів і папок на Google Диску.', 'ШІ бачить назви файлів, не їхній вміст.'],
    nl: ['Mappen op Drive bekijken', 'Namen van bestanden en mappen op Google Drive.', 'De AI ziet bestandsnamen, niet de inhoud.'] },
  { id: 'drive_read_file', essentie: 'lezen_bestand', sub: 'cloud', dienst: 'gdrive', kanten: G, soort: 'lezen', groep: 'bestanden', risico: 'midden',
    uk: ['Читати файли з Диска', 'Вміст текстових документів і таблиць з Диска.', 'ШІ читає документ повністю; у документах бувають договори, рахунки, паролі.'],
    nl: ['Bestanden op Drive lezen', 'Inhoud van tekstdocumenten en spreadsheets op Drive.', 'De AI leest het hele document; daarin staan soms contracten, facturen of wachtwoorden.'] },
  { id: 'drive_create', essentie: 'creeren_bestand', weergave: 'creëren bestand', sub: 'cloud', dienst: 'gdrive', kanten: G, soort: 'schrijven', groep: 'bestanden', risico: 'midden',
    uk: ['Створювати файли на Диску', 'Новий документ, таблиця або текстовий файл у вибраній папці.', 'Файл з’явиться на Диску; видалити його можете лише ви.', 'Кожне створення ви підтверджуєте на сайті.'],
    nl: ['Bestanden op Drive maken', 'Nieuw document, spreadsheet of tekstbestand in een gekozen map.', 'Het bestand verschijnt op Drive; verwijderen kunt alleen u.', 'Elke aanmaak bevestigt u op de site.'] },
  { id: 'drive_upload', essentie: 'opladen_bestand', sub: 'cloud', dienst: 'gdrive', kanten: G, soort: 'schrijven', groep: 'bestanden', risico: 'midden',
    uk: ['Завантажувати файли на Диск', 'Завантаження зображень, PDF чи архівів у вашу хмару (до 5 МБ).', 'Займає місце на Диску; файли видно всім, з ким ділиться папка.', 'Кожне завантаження ви підтверджуєте на сайті.'],
    nl: ['Bestanden naar Drive uploaden', 'Afbeeldingen, pdf\'s of archieven in uw cloud zetten (tot 5 MB).', 'Neemt ruimte in op Drive; zichtbaar voor iedereen met wie de map gedeeld is.', 'Elke upload bevestigt u op de site.'] },
  dev({ id: 'dev.drive_share', essentie: 'delen_bestand', sub: 'cloud', dienst: 'gdrive', kanten: G, soort: 'schrijven', groep: 'bestanden', risico: 'hoog',
    uk: ['Ділитися файлами', 'Надати іншим людям доступ до файла чи папки.', 'Хтось інший отримає ваш файл; це найчастіша причина витоків.', 'У розробці: лише з підтвердженням на сайті.'],
    nl: ['Bestanden delen', 'Anderen toegang geven tot een bestand of map.', 'Iemand anders krijgt uw bestand; de meest voorkomende oorzaak van lekken.', 'In ontwikkeling: alleen met bevestiging op de site.'] }),
  dev({ id: 'dev.photos_pick', essentie: 'tonen_fotos', weergave: 'tonen foto\'s', sub: 'cloud', dienst: 'gphotos', kanten: G, soort: 'lezen', groep: 'bestanden', risico: 'hoog', gevoelig: true,
    uk: ['Фото, які ви вибрали', 'Лише ті фото з Google Photos, які ви самі вибрали на сайті.', 'На фото — люди, місця й документи.', 'У розробці.'],
    nl: ['Foto\'s die u koos', 'Alleen de foto\'s uit Google Photos die u zelf op de site koos.', 'Op foto\'s staan mensen, plaatsen en documenten.', 'In ontwikkeling.'] }),

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
  { id: 'comment_board_item', essentie: 'reageren_op_taak', sub: 'hub', kanten: G, soort: 'schrijven', groep: 'bord', risico: 'laag',
    uk: ['Коментувати записи дошки', 'Нотатка-коментар до наявної задачі чи запису.', 'На дошці з’являється коментар; його легко видалити.'],
    nl: ['Reageren op een borditem', 'Een commentaarnotitie bij een bestaande taak of een item.', 'Er verschijnt een commentaar op het bord; makkelijk weer te verwijderen.'] },
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
  { id: 'zoeken_mail_bord_schijf', essentie: 'zoeken_mail_bord_schijf', sub: 'hub', kanten: G, soort: 'lezen', groep: 'ruimte', risico: 'laag',
    uk: ['Шукати в пошті, файлах і на дошці', 'Один пошук по індексованій пошті, Диску й дошці задач.', 'Повертає назви; повний вміст — окремими дозволами на читання.'],
    nl: ['Zoeken in mail, bestanden en op het bord', 'Eén zoekopdracht over geïndexeerde mail, Drive en het takenbord.', 'Geeft titels; de volle inhoud vraagt aparte leesrechten.'] },
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
    uk: ['Відомості про пристрій', 'Система, версія агента, дозволені папки.', 'Технічні дані без ваших файлів.'],
    nl: ['Gegevens van een apparaat', 'Systeem, agentversie en toegestane mappen.', 'Technische gegevens zonder uw bestanden.'] },
  { id: 'machine_list_dir', essentie: 'tonen_map_inhoud', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apparaten', risico: 'laag',
    uk: ['Переглядати папки', 'Вміст папки в межах дозволених агентом папок.', 'ШІ бачить назви файлів; секретні місця (ключі, паролі) агент приховує.'],
    nl: ['Mappen bekijken', 'Inhoud van een map binnen de mappen die de agent toestaat.', 'De AI ziet bestandsnamen; geheime plekken (sleutels, wachtwoorden) verbergt de agent.'] },
  { id: 'machine_read_file', essentie: 'lezen_bestand', sub: 'mcp', kanten: BEIDE, soort: 'lezen', groep: 'apparaten', risico: 'midden',
    uk: ['Читати файли', 'Текстовий файл до 2 МБ з дозволених папок.', 'ШІ читає вміст файла повністю.'],
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
    uk: ['Записувати файли', 'Створює або перезаписує файл у дозволених папках.', 'Старий вміст замінюється. Кожен запис ви підтверджуєте на сайті, якщо не дозволили автоматично.', 'Перезапис конфігурації може зламати програму.'],
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
  dev({ id: 'dev.app_domain', essentie: 'instellen_eigen_domein', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'apps', risico: 'kritiek',
    uk: ['Власний домен для додатка', 'Прив’язує окремий домен до додатка.', 'Змінюються DNS і тунель; помилка робить сайт недоступним.', 'У розробці.'],
    nl: ['Eigen domein voor een app', 'Koppelt een eigen domein aan een app.', 'DNS en tunnel veranderen; een fout maakt de site onbereikbaar.', 'In ontwikkeling.'] }),

  // ---------------------------------------------------------------- browser (extensie)
  { id: 'browser_list_tabs', essentie: 'tonen_tabbladen', sub: 'mcp', kanten: G, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Переглядати вкладки', 'Відкриті вкладки «Мого простору» (лише сайт, не інші сайти).', 'ШІ бачить назви й адреси сторінок сайту.'],
    nl: ['Tabbladen bekijken', 'Open tabbladen van Mijn Ruimte (alleen de site, geen andere sites).', 'De AI ziet titels en adressen van sitepagina\'s.'] },
  { id: 'browser_snapshot', essentie: 'lezen_pagina', sub: 'mcp', kanten: G, soort: 'lezen', groep: 'browser', risico: 'midden',
    uk: ['Читати сторінку', 'Текст і структура відкритої сторінки сайту.', 'ШІ бачить усе, що на сторінці, наприклад відкритий лист.'],
    nl: ['Pagina lezen', 'Tekst en opbouw van een open pagina van de site.', 'De AI ziet alles op de pagina, bv. een geopend bericht.'] },
  { id: 'browser_scroll', essentie: 'scrollen_pagina', sub: 'mcp', kanten: G, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Прокручувати сторінку', 'Прокрутка, щоб прочитати далі.', 'Нічого не змінює.'],
    nl: ['Pagina scrollen', 'Scrollen om verder te lezen.', 'Verandert niets.'] },
  { id: 'browser_wait_for_text', essentie: 'wachten_op_tekst', sub: 'mcp', kanten: G, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Чекати на текст', 'Чекає, доки на сторінці з’явиться текст.', 'Нічого не змінює.'],
    nl: ['Wachten op tekst', 'Wacht tot een tekst op de pagina staat.', 'Verandert niets.'] },
  { id: 'browser_console', essentie: 'lezen_console', sub: 'mcp', kanten: G, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Читати консоль', 'Повідомлення консолі сторінки (для пошуку помилок).', 'Технічні повідомлення сайту.'],
    nl: ['Console lezen', 'Consolemeldingen van de pagina (om fouten te vinden).', 'Technische meldingen van de site.'] },
  { id: 'browser_network', essentie: 'lezen_netwerk', sub: 'mcp', kanten: G, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Читати мережеві запити', 'Адреси й стани запитів сторінки (без вмісту й без cookie).', 'Технічні дані.'],
    nl: ['Netwerkverzoeken lezen', 'Adressen en status van verzoeken van de pagina (zonder inhoud of cookies).', 'Technische gegevens.'] },
  { id: 'browser_get_diagnostics', essentie: 'tonen_diagnose', sub: 'mcp', kanten: G, soort: 'lezen', groep: 'browser', risico: 'laag',
    uk: ['Діагностика сторінки', 'Короткий звіт про помилки на сторінці.', 'Технічні дані.'],
    nl: ['Diagnose van de pagina', 'Kort rapport over fouten op de pagina.', 'Technische gegevens.'] },
  { id: 'browser_get_deep_diagnostics', essentie: 'uitvoeren_diepe_diagnose', sub: 'mcp', kanten: G, soort: 'schrijven', groep: 'browser', risico: 'midden',
    uk: ['Глибока діагностика', 'Розширений звіт зі станом сторінки й сховища.', 'Може показати більше технічних деталей; ви підтверджуєте.'],
    nl: ['Diepe diagnose', 'Uitgebreid rapport met de staat van pagina en opslag.', 'Kan meer technische details tonen; u bevestigt.'] },
  { id: 'browser_screenshot', essentie: 'maken_schermafdruk', sub: 'mcp', kanten: G, soort: 'schrijven', groep: 'browser', risico: 'midden',
    uk: ['Робити знімок екрана', 'Знімок відкритої сторінки сайту.', 'На знімку все, що видно, зокрема особисте.'],
    nl: ['Schermafdruk maken', 'Een afbeelding van de open pagina.', 'Op de afbeelding staat alles wat zichtbaar is, ook privézaken.'] },
  { id: 'browser_open', essentie: 'openen_pagina', sub: 'mcp', kanten: G, soort: 'schrijven', groep: 'browser', risico: 'laag',
    uk: ['Відкривати сторінки', 'Відкриває сторінку сайту у вашому браузері.', 'Лише адреси tarasevych.com.'],
    nl: ['Pagina\'s openen', 'Opent een pagina van de site in uw browser.', 'Alleen adressen op tarasevych.com.'] },
  { id: 'browser_pages', essentie: 'beheren_tabbladen', sub: 'mcp', kanten: G, soort: 'schrijven', groep: 'browser', risico: 'laag',
    uk: ['Керувати вкладками', 'Перемикати, відкривати й закривати вкладки сайту.', 'Незбережене у закритій вкладці може зникнути.'],
    nl: ['Tabbladen beheren', 'Tabbladen van de site wisselen, openen en sluiten.', 'Niet-opgeslagen werk in een gesloten tab kan verloren gaan.'] },
  { id: 'browser_history', essentie: 'navigeren_geschiedenis', sub: 'mcp', kanten: G, soort: 'schrijven', groep: 'browser', risico: 'laag',
    uk: ['Назад і вперед', 'Перехід назад/вперед/оновлення сторінки.', 'Незбережене може зникнути.'],
    nl: ['Terug en vooruit', 'Terug, vooruit of de pagina vernieuwen.', 'Niet-opgeslagen werk kan verloren gaan.'] },
  { id: 'browser_click', essentie: 'klikken_element', sub: 'mcp', kanten: G, soort: 'schrijven', groep: 'browser', risico: 'hoog',
    uk: ['Натискати кнопки', 'Клік по елементу сторінки.', 'Клік робить те саме, що й ваш: може надіслати, видалити, підтвердити.', 'Кожну дію ви підтверджуєте.'],
    nl: ['Knoppen indrukken', 'Klikken op een element van de pagina.', 'Een klik doet hetzelfde als die van u: verzenden, verwijderen, bevestigen.', 'Elke actie bevestigt u.'] },
  { id: 'browser_type', essentie: 'typen_tekst', sub: 'mcp', kanten: G, soort: 'schrijven', groep: 'browser', risico: 'midden',
    uk: ['Вводити текст', 'Друкує текст у поле.', 'Поле змінюється; надсилання — окрема дія.'],
    nl: ['Tekst typen', 'Typt tekst in een veld.', 'Het veld verandert; verzenden is een aparte actie.'] },
  { id: 'browser_hover', essentie: 'aanwijzen_element', sub: 'mcp', kanten: G, soort: 'schrijven', groep: 'browser', risico: 'laag',
    uk: ['Наводити курсор', 'Показує підказки й меню під курсором.', 'Нічого не змінює.'],
    nl: ['Element aanwijzen', 'Toont tips en menu\'s onder de muis.', 'Verandert niets.'] },
  { id: 'browser_fill_form', essentie: 'invullen_formulier', sub: 'mcp', kanten: G, soort: 'schrijven', groep: 'browser', risico: 'midden',
    uk: ['Заповнювати форми', 'Кілька полів за раз.', 'Форма змінюється; надсилання — окрема дія.'],
    nl: ['Formulieren invullen', 'Meerdere velden tegelijk.', 'Het formulier verandert; verzenden is een aparte actie.'] },
  { id: 'browser_select_option', essentie: 'kiezen_optie', sub: 'mcp', kanten: G, soort: 'schrijven', groep: 'browser', risico: 'laag',
    uk: ['Вибирати варіант', 'Вибір у списку.', 'Поле змінюється.'],
    nl: ['Optie kiezen', 'Keuze in een lijst.', 'Het veld verandert.'] },
  { id: 'browser_press_key', essentie: 'drukken_toets', sub: 'mcp', kanten: G, soort: 'schrijven', groep: 'browser', risico: 'midden',
    uk: ['Натискати клавіші', 'Enter, Escape, стрілки.', 'Enter може надіслати форму.'],
    nl: ['Toetsen indrukken', 'Enter, Escape, pijltjes.', 'Enter kan een formulier verzenden.'] },
  { id: 'browser_invoke_action', essentie: 'uitvoeren_site_actie', sub: 'mcp', kanten: G, soort: 'schrijven', groep: 'browser', risico: 'hoog',
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
  { id: 'github_read_file', essentie: 'lezen_repo_bestand', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'midden',
    uk: ['Читати файл з репозиторію', 'Текстовий файл через уже підключений GitHub (токен сервер не віддає).', 'ШІ читає вміст файла; у приватних репозиторіях — приватний код.'],
    nl: ['Een bestand uit een repository lezen', 'Een tekstbestand via de bestaande GitHub-koppeling (het token verlaat de server niet).', 'De AI leest de inhoud; in privérepositories is dat privécode.'] },
  { id: 'github_search', essentie: 'zoeken_in_github', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Шукати в GitHub', 'Пошук репозиторіїв, задач і коду.', 'Пошук іде від вашого токена.'],
    nl: ['Zoeken in GitHub', 'Zoeken naar repositories, issues en code.', 'Er wordt gezocht met uw token.'] },
  { id: 'github_my_activity', essentie: 'tonen_mijn_activiteit', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Моя активність', 'Ваші останні дії в GitHub.', 'ШІ бачить, над чим ви працювали.'],
    nl: ['Mijn activiteit', 'Uw recente acties op GitHub.', 'De AI ziet waaraan u werkte.'] },
  dev({ id: 'dev.github_pr', essentie: 'creeren_pull_request', weergave: 'creëren pull request', sub: 'github', dienst: 'github', kanten: G, soort: 'schrijven', groep: 'github', risico: 'hoog',
    uk: ['Створювати pull request', 'Гілка зі змінами й запит на злиття.', 'Код потрапляє в репозиторій (поки не злитий).', 'У розробці.'],
    nl: ['Pull requests maken', 'Een branch met wijzigingen en een verzoek tot samenvoegen.', 'Code komt in de repository (nog niet samengevoegd).', 'In ontwikkeling.'] }),
  dev({ id: 'dev.github_ci_logs', essentie: 'lezen_workflow_logboek', sub: 'github', dienst: 'github', kanten: G, soort: 'lezen', groep: 'github', risico: 'laag',
    uk: ['Журнали CI', 'Журнали запусків GitHub Actions.', 'У журналах можуть бути технічні деталі.', 'У розробці.'],
    nl: ['Logboeken van CI', 'Logboeken van GitHub Actions-runs.', 'Logboeken kunnen technische details bevatten.', 'In ontwikkeling.'] }),

  // ---------------------------------------------------------------- ontwerp en media (in ontwikkeling)
  dev({ id: 'dev.image_generate', essentie: 'genereren_afbeelding', sub: 'ai', kanten: G, soort: 'schrijven', groep: 'media', risico: 'laag',
    uk: ['Створювати зображення', 'Генерує зображення локальною моделлю на вашому сервері.', 'Використовує ресурси сервера.', 'У розробці.'],
    nl: ['Afbeeldingen genereren', 'Genereert een afbeelding met een lokaal model op uw server.', 'Gebruikt middelen van de server.', 'In ontwikkeling.'] }),
  dev({ id: 'dev.diagram_generate', essentie: 'genereren_diagram', sub: 'ai', kanten: G, soort: 'schrijven', groep: 'media', risico: 'laag',
    uk: ['Створювати схеми', 'Діаграма чи схема з опису (Mermaid).', 'Файл схеми у вашому просторі.', 'У розробці.'],
    nl: ['Diagrammen maken', 'Een diagram of schema uit een beschrijving (Mermaid).', 'Een schemabestand in uw ruimte.', 'In ontwikkeling.'] }),
  dev({ id: 'dev.screenshot_design', essentie: 'tonen_ontwerp_context', sub: 'ai', kanten: G, soort: 'lezen', groep: 'media', risico: 'laag',
    uk: ['Контекст дизайну', 'Кольори, шрифти й компоненти вашого сайту для ШІ-дизайну.', 'Лише стилі.', 'У розробці.'],
    nl: ['Ontwerpcontext', 'Kleuren, lettertypen en componenten van uw site voor AI-ontwerp.', 'Alleen stijlen.', 'In ontwikkeling.'] }),

  // ---------------------------------------------------------------- betalingen (in ontwikkeling)
  dev({ id: 'dev.payments_list', essentie: 'tonen_betalingen', sub: 'hub', dienst: 'stripe', kanten: G, soort: 'lezen', groep: 'betalingen', risico: 'hoog', gevoelig: true,
    uk: ['Переглядати платежі', 'Платежі й рахунки з підключеного Stripe.', 'Фінансові дані.', 'У розробці.'],
    nl: ['Betalingen bekijken', 'Betalingen en facturen uit een gekoppeld Stripe.', 'Financiële gegevens.', 'In ontwikkeling.'] }),

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
  { id: 'get_system_health', essentie: 'tonen_server_gezondheid', sub: 'admin', kanten: B, soort: 'lezen', groep: 'server', risico: 'laag',
    uk: ['Стан сервера', 'Служби, база, диск, сертифікати.', 'Лише стан.'],
    nl: ['Gezondheid van de server', 'Diensten, database, schijf en certificaten.', 'Alleen de status.'] },
  dev({ id: 'dev.audit_read', essentie: 'lezen_audit_journaal', sub: 'admin', kanten: B, soort: 'lezen', groep: 'server', risico: 'midden',
    uk: ['Читати журнал безпеки', 'Хто й що робив на сайті.', 'Журнал містить адреси й імена користувачів.', 'У розробці.'],
    nl: ['Beveiligingslogboek lezen', 'Wie wat deed op de site.', 'Het logboek bevat adressen en namen van gebruikers.', 'In ontwikkeling.'] }),
  dev({ id: 'dev.users_manage', essentie: 'beheren_gebruikers', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'server', risico: 'kritiek',
    uk: ['Керувати користувачами', 'Схвалення, блокування, ролі.', 'Змінює, хто має доступ до сайту.', 'У розробці: лише з passkey власника на кожну дію.'],
    nl: ['Gebruikers beheren', 'Goedkeuren, blokkeren, rollen.', 'Verandert wie toegang heeft tot de site.', 'In ontwikkeling: alleen met de passkey van de eigenaar per actie.'] }),
  dev({ id: 'dev.flags_manage', essentie: 'beheren_functie_vlaggen', sub: 'admin', kanten: B, soort: 'schrijven', groep: 'server', risico: 'hoog',
    uk: ['Керувати прапорцями функцій', 'Вмикати й вимикати функції сайту.', 'Користувачі одразу бачать зміну.', 'У розробці.'],
    nl: ['Functievlaggen beheren', 'Functies van de site aan- en uitzetten.', 'Gebruikers zien de wijziging meteen.', 'In ontwikkeling.'] }),
  dev({ id: 'dev.siem_status', essentie: 'tonen_siem_status', sub: 'admin', kanten: B, soort: 'lezen', groep: 'server', risico: 'laag',
    uk: ['Стан передачі в SIEM', 'Чи надходять події безпеки в Loki.', 'Лише стан.', 'У розробці.'],
    nl: ['Status van de SIEM-export', 'Of beveiligingsgebeurtenissen in Loki aankomen.', 'Alleen de status.', 'In ontwikkeling.'] }),
];

/** Uitgevouwen catalogus: één optie per (id, kant). */
export const V2_OPTIES: readonly V2Optie[] = Object.freeze(DEFS.flatMap((d) => d.kanten.map((kant): V2Optie => ({
  key: `${d.id}:${kant}`, id: d.id, intern: d.intern === undefined ? d.id : d.intern, essentie: d.essentie, weergave: d.weergave ?? d.essentie.replace(/_/g, ' '),
  sub: d.sub, dienst: d.dienst && d.dienst !== d.sub ? d.dienst : null, kant, soort: d.soort, groep: d.groep,
  risico: kant === 'beheer' && d.risico === 'laag' && d.soort !== 'lezen' ? 'midden' : d.risico,
  gevoelig: !!d.gevoelig, status: d.intern === null ? 'in-ontwikkeling' : 'actief',
  uk: kant === 'beheer' && d.kanten.length > 1 ? [d.uk[0], `${d.uk[1]} Лише пристрої технічного простору (сам сервер).`, d.uk[2], d.uk[3]] : d.uk,
  nl: kant === 'beheer' && d.kanten.length > 1 ? [d.nl[0], `${d.nl[1]} Alleen apparaten van de technische ruimte (de server zelf).`, d.nl[2], d.nl[3]] : d.nl,
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
