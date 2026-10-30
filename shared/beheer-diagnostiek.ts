// Admin → «Діагностика» (/diagnostiek): register van alleen-lezen controles per categorie, gedeeld door server en browser.
//
// Waarom een register in `shared/`:
//  - de server voert ALLEEN id's uit deze lijst uit (whitelist; de browser stuurt nooit een opdracht, URL of argument);
//  - de browser toont dezelfde lijst met uitleg «wat is dit», «waarom staat het hier» en «hoe herstel ik het» — ook voor controles
//    die nog nooit zijn uitgevoerd (dan staat er eerlijk «не перевірено», nooit een verzonnen groen vinkje);
//  - de sortering van «Потребує уваги» en de uitleg per foutcode zijn zuivere functies en dus te testen zonder server.
//
// Alles is alleen lezen: HTTP-GET naar de eigen subdomeinen, DNS-opzoeking, TLS-certificaatdatum, SELECT's, /proc/meminfo, loadavg.
export type Tekst = readonly [uk: string, nl: string];
export type Stand = 'ok' | 'let-op' | 'fout' | 'onbekend';

export type CategorieId = 'diensten' | 'paginas' | 'verbindingen' | 'mail' | 'cloud' | 'ai' | 'apparaten' | 'data' | 'server' | 'netwerk' | 'taken';
export type Categorie = { id: CategorieId; icoon: string; naam: Tekst; wat: Tekst; waarom: Tekst };

export const CATEGORIEEN: readonly Categorie[] = [
  { id: 'diensten', icoon: 'layers', naam: ['Сервіси', 'Diensten'],
    wat: ['Кожен піддомен екосистеми (hub, mail, ai, id, api, admin, mcp, cloud, github): чи відповідає він і як швидко.', 'Elk subdomein van het ecosysteem (hub, mail, ai, id, api, admin, mcp, cloud, github): antwoordt het en hoe snel.'],
    waarom: ['Користувач бачить саме ці адреси. Якщо сервіс мовчить — скарга з’явиться тут першою.', 'De gebruiker ziet precies deze adressen. Als een dienst zwijgt, merkt u het hier als eerste.'] },
  { id: 'paginas', icoon: 'globe', naam: ['Сторінки й маршрути', 'Pagina’s en routes'],
    wat: ['Сторінки адмін-панелі (огляд, журнал, контур, інтеграції, діагностика, оновлення) та службові маршрути API.', 'Pagina’s van het beheerpaneel (overzicht, logboek, contour, integraties, diagnostiek, updates) en technische API-routes.'],
    waarom: ['Показує, що сайт віддає потрібну сторінку та актуальний файл інтерфейсу, а не порожній екран.', 'Laat zien dat de site de juiste pagina en het actuele interfacebestand levert, geen leeg scherm.'] },
  { id: 'verbindingen', icoon: 'plug', naam: ['Підключення', 'Koppelingen'],
    wat: ['Google, GitHub, OAuth і двері MCP, через які підключаються ШІ-агенти.', 'Google, GitHub, OAuth en de MCP-deur waarlangs AI-agenten verbinden.'],
    waarom: ['Саме тут найчастіше «вмирає» інтеграція: ключ не налаштований, служба недоступна або токен протермінований.', 'Hier sterft een integratie het vaakst: sleutel niet ingesteld, dienst onbereikbaar of token verlopen.'] },
  { id: 'mail', icoon: 'mail', naam: ['Пошта', 'E-mail'],
    wat: ['Чи досяжний Gmail API з сервера та чи не застрягла черга запланованих листів.', 'Of de Gmail-API vanaf de server bereikbaar is en of de wachtrij met geplande mails niet vastzit.'],
    waarom: ['Збій пошти користувач помічає першим: лист «відправлено», а він не пішов.', 'Een mailstoring merkt de gebruiker het eerst: de mail is «verzonden» maar vertrok niet.'] },
  { id: 'cloud', icoon: 'cloud', naam: ['Хмара й Drive', 'Cloud en Drive'],
    wat: ['Сховище файлів сайту та досяжність Google Drive API.', 'De bestandsopslag van de site en de bereikbaarheid van de Google Drive-API.'],
    waarom: ['Без сховища не завантажуються файли й архіви, без Drive не відкриваються підключені папки.', 'Zonder opslag laden bestanden en archieven niet, zonder Drive openen gekoppelde mappen niet.'] },
  { id: 'ai', icoon: 'sparkles', naam: ['ШІ-агенти й MCP', 'AI-agenten en MCP'],
    wat: ['Активні підключення ШІ-агентів (OAuth) та дозволи «Хто готує оновлення».', 'Actieve verbindingen van AI-agenten (OAuth) en de toestemmingen «Хто готує оновлення».'],
    waarom: ['Агент може бути в списку, але без чинного дозволу — тоді він мовчки не працює.', 'Een agent kan in de lijst staan maar zonder geldige toestemming — dan werkt hij stilzwijgend niet.'] },
  { id: 'apparaten', icoon: 'cpu', naam: ['Пристрої й локальні агенти', 'Apparaten en lokale agenten'],
    wat: ['Локальні агенти на ваших комп’ютерах і результат їхніх останніх команд.', 'Lokale agenten op uw computers en het resultaat van hun laatste opdrachten.'],
    waarom: ['Якщо агент «підключений», але мовчить, команди ШІ до нього не доходять.', 'Is een agent «verbonden» maar stil, dan bereiken AI-opdrachten hem niet.'] },
  { id: 'data', icoon: 'database', naam: ['Дані', 'Gegevens'],
    wat: ['База даних, міграції схеми, цілісність журналу аудиту.', 'Database, schemamigraties en integriteit van het auditlogboek.'],
    waarom: ['Без бази сайт не працює, а зламаний ланцюжок аудиту означає, що журналу не можна вірити.', 'Zonder database werkt de site niet en een gebroken auditketen betekent dat het logboek niet te vertrouwen is.'] },
  { id: 'server', icoon: 'server', naam: ['Сервер', 'Server'],
    wat: ['Диск, пам’ять, навантаження процесора, годинник і стан самого процесу сайту.', 'Schijf, geheugen, processorbelasting, klok en de toestand van het siteproces zelf.'],
    waarom: ['Повний диск або нестача пам’яті зупиняють усе одразу та без попередження.', 'Een volle schijf of te weinig geheugen stopt alles meteen en zonder waarschuwing.'] },
  { id: 'netwerk', icoon: 'shield', naam: ['Мережа й сертифікати', 'Netwerk en certificaten'],
    wat: ['DNS-записи піддоменів і строк дії TLS-сертифікатів.', 'DNS-records van de subdomeinen en de geldigheid van de TLS-certificaten.'],
    waarom: ['Протермінований сертифікат блокує браузери повністю; його краще побачити за кілька днів, ніж у день збою.', 'Een verlopen certificaat blokkeert browsers volledig; beter enkele dagen vooraf dan op de dag zelf.'] },
  { id: 'taken', icoon: 'clock', naam: ['Фонові завдання', 'Achtergrondtaken'],
    wat: ['Cron-завдання (пошта, Google, прибирання) та останнє розгортання оновлення.', 'Cron-taken (mail, Google, opruimen) en de laatste uitrol van een update.'],
    waarom: ['Фонові завдання ламаються мовчки: сайт відкривається, але пошта вже годину не синхронізується.', 'Achtergrondtaken breken stil: de site opent, maar de mail synchroniseert al uren niet.'] },
];

export type ControleDef = {
  id: string; cat: CategorieId; icoon: string;
  naam: Tekst; wat: Tekst; waarom: Tekst;
  /** Algemene stappen als dit faalt (aangevuld met de uitleg van de foutcode). */
  oplossing: readonly Tekst[];
  /** Hoe de controle werkt, voor de technische toelichting («?»). */
  hoe: Tekst;
  /** Eventuele verwijzing naar de pagina waar dit wordt opgelost. */
  naar?: { href: string; label: Tekst };
  /** Eventueel subdomein (voor het merkpictogram en de link). */
  host?: string;
};

export const DIENST_HOSTS = ['hub', 'mail', 'ai', 'id', 'api', 'admin', 'mcp', 'cloud', 'github'] as const;
export type DienstHost = typeof DIENST_HOSTS[number];

const DIENST_TEKST: Record<DienstHost, { naam: Tekst; wat: Tekst; icoon: string }> = {
  hub: { naam: ['Мій простір (hub)', 'Mijn Ruimte (hub)'], wat: ['Головний вхід: дошка, нотатки, пошук.', 'De hoofdingang: bord, notities, zoeken.'], icoon: 'home' },
  mail: { naam: ['Пошта (mail)', 'E-mail (mail)'], wat: ['Поштовий клієнт для Gmail та інших скриньок.', 'De mailclient voor Gmail en andere postvakken.'], icoon: 'mail' },
  ai: { naam: ['ШІ (ai)', 'AI (ai)'], wat: ['Сторінки ШІ-асистентів і підключень.', 'Pagina’s van de AI-assistenten en koppelingen.'], icoon: 'sparkles' },
  id: { naam: ['Ідентичність (id)', 'Identiteit (id)'], wat: ['Вхід, passkey, сесії та безпека облікового запису.', 'Aanmelden, passkey, sessies en accountbeveiliging.'], icoon: 'key' },
  api: { naam: ['API (api)', 'API (api)'], wat: ['Платформа API: токени, вебхуки, секрети.', 'Het API-platform: tokens, webhooks, geheimen.'], icoon: 'code' },
  admin: { naam: ['Адміністрування (admin)', 'Beheer (admin)'], wat: ['Ця адмін-панель.', 'Dit beheerpaneel.'], icoon: 'settings' },
  mcp: { naam: ['MCP (mcp)', 'MCP (mcp)'], wat: ['Двері для ШІ-агентів (Claude, GPT, Grok…).', 'De deur voor AI-agenten (Claude, GPT, Grok…).'], icoon: 'plug' },
  cloud: { naam: ['Хмара (cloud)', 'Cloud (cloud)'], wat: ['Файли, Google Drive, архіви.', 'Bestanden, Google Drive, archieven.'], icoon: 'cloud' },
  github: { naam: ['GitHub (github)', 'GitHub (github)'], wat: ['Репозиторії, issues, CI.', 'Repositories, issues, CI.'], icoon: 'git' },
};

const HTTP_OPLOSSING: readonly Tekst[] = [
  ['Відкрийте адресу в браузері та перевірте, чи є відповідь.', 'Open het adres in de browser en kijk of er antwoord komt.'],
  ['На сервері: systemctl status mijn-ruimte — служба має бути active (running).', 'Op de server: systemctl status mijn-ruimte — de dienst moet active (running) zijn.'],
  ['Перегляньте останні рядки журналу: journalctl -u mijn-ruimte -n 80 --no-pager.', 'Bekijk de laatste logregels: journalctl -u mijn-ruimte -n 80 --no-pager.'],
  ['Якщо збій почався після оновлення — відкотіть реліз на сторінці «Оновлення».', 'Begon het na een update, draai dan de release terug op de pagina «Оновлення».'],
];

const dienst = (h: DienstHost): ControleDef => ({
  id: `dienst-${h}`, cat: 'diensten', icoon: DIENST_TEKST[h].icoon, host: h,
  naam: DIENST_TEKST[h].naam, wat: DIENST_TEKST[h].wat,
  waarom: ['Якщо цей піддомен не відповідає, користувачі бачать помилку саме тут.', 'Antwoordt dit subdomein niet, dan zien gebruikers hier een fout.'],
  oplossing: HTTP_OPLOSSING,
  hoe: [`Сервер робить GET https://${h}.<домен>/ (без cookie, з таймаутом 6 с). 2xx/3xx/401/403 = відповідає; 5xx або тайм-аут = збій.`, `De server doet GET https://${h}.<domein>/ (zonder cookies, time-out 6 s). 2xx/3xx/401/403 = antwoordt; 5xx of time-out = fout.`],
});

const PAGINA_ROUTES = [
  ['overzicht', ['Огляд', 'Overzicht']], ['audit', ['Журнал', 'Logboek']], ['contour', ['Секрети (контур)', 'Geheimen (contour)']],
  ['mappen', ['Інтеграції', 'Integraties']], ['diagnostiek', ['Діагностика', 'Diagnostiek']], ['updates', ['Оновлення', 'Updates']],
] as const;
export const PAGINA_SLUGS = PAGINA_ROUTES.map(([s]) => s);

const pagina = (slug: string, naam: Tekst): ControleDef => ({
  id: `pagina-${slug}`, cat: 'paginas', icoon: 'file', host: 'admin',
  naam: [`Сторінка «${naam[0]}»`, `Pagina «${naam[1]}»`],
  wat: [`Адреса /${slug} на admin: чи віддає сайт HTML-оболонку сторінки.`, `Adres /${slug} op admin: levert de site de HTML-schil van de pagina.`],
  waarom: ['Порожня сторінка або 404 означає, що розгортання зіпсувало маршрути або не оновило файли інтерфейсу.', 'Een lege pagina of 404 betekent dat de uitrol routes brak of de interfacebestanden niet verving.'],
  oplossing: [
    ['Натисніть Ctrl+F5: можливо, браузер тримає стару версію.', 'Druk op Ctrl+F5: misschien houdt de browser een oude versie vast.'],
    ['Перевірте, що активний реліз повний: на сторінці «Оновлення» має бути остання версія без помилок.', 'Controleer dat de actieve release compleet is: op «Оновлення» moet de laatste versie zonder fouten staan.'],
    ...HTTP_OPLOSSING.slice(1),
  ],
  hoe: [`GET https://admin.<домен>/${slug}: очікується 200 і HTML з кореневим елементом застосунку. Плюс результат останнього рендер-контролю для цієї сторінки (справжній браузер на сервері): без браузера чесно «лише HTTP».`, `GET https://admin.<domein>/${slug}: verwacht 200 en HTML met het app-rootelement. Plus de laatste rendercontrole voor deze pagina (echte browser op de server): zonder browser eerlijk «alleen HTTP».`],
});

export const CONTROLES: readonly ControleDef[] = [
  ...DIENST_HOSTS.map(dienst),
  ...PAGINA_ROUTES.map(([s, n]) => pagina(s, n)),
  { id: 'pagina-bundel', cat: 'paginas', icoon: 'package', host: 'admin',
    naam: ['Актуальний файл інтерфейсу', 'Actueel interfacebestand'],
    wat: ['Головний JS-файл, на який посилається index.html, справді віддається сервером.', 'Het hoofd-JS-bestand waarnaar index.html verwijst wordt echt door de server geleverd.'],
    waarom: ['Якщо файл зник після оновлення, сторінка відкривається, але залишається білою.', 'Verdwijnt het bestand na een update, dan opent de pagina maar blijft wit.'],
    oplossing: [['Відкотіть реліз на сторінці «Оновлення» або перевстановіть пакет.', 'Draai de release terug op «Оновлення» of installeer het pakket opnieuw.'], ['Очистіть кеш CDN/браузера (Ctrl+F5).', 'Leeg de cache van CDN/browser (Ctrl+F5).']],
    hoe: ['Читає dist/index.html, знаходить assets/index-*.js і робить GET цього файлу на admin.', 'Leest dist/index.html, zoekt assets/index-*.js en doet GET van dat bestand op admin.'] },
  // 22.10.2026 (zone A): HTTP 200 is geen bewijs dat een pagina rendert (release 20261021-221718: «Buffer is not defined», alles wit).
  { id: 'pagina-rendering', cat: 'paginas', icoon: 'monitor', host: 'admin',
    naam: ['Рендеринг сторінок (браузер на сервері)', 'Rendering van pagina’s (browser op de server)'],
    wat: ['Останній прогін рендер-контролю: ключові сторінки hub, mail, cloud, admin, mcp, id, github, ai відкриті у headless Chromium на сервері (тестовий власник, технічний профіль) — чи є вміст у #root, чи немає pageerror/ReferenceError, чи всі бандли завантажились.', 'Laatste rendercontrole: de sleutelpagina’s van hub, mail, cloud, admin, mcp, id, github, ai geopend in een headless Chromium op de server (testeigenaar, technisch profiel) — staat er inhoud in #root, geen pageerror/ReferenceError, laden alle bundels.'],
    waarom: ['HTTP 200 та /__gezondheid були зеленими, коли всі сторінки admin.* були білими (Buffer is not defined). Лише браузер бачить, чи сторінка справді рендериться; інсталятор відкочує випуск автоматично, якщо ні.', 'HTTP 200 en /__gezondheid waren groen terwijl elke admin.*-pagina wit was (Buffer is not defined). Alleen een browser ziet of een pagina echt rendert; de installer draait automatisch terug als dat niet zo is.'],
    oplossing: [
      ['Немає браузера: на сервері sudo mijn-ruimte-installeer browser-controle (Chrome for Testing, закріплена версія, SHA-256).', 'Geen browser: op de server sudo mijn-ruimte-installeer browser-controle (Chrome for Testing, vastgepinde versie, SHA-256).'],
      ['Зламано: відкрийте «Оновлення» — там подія «Відкочено автоматично» з причиною; виправте код і зберіть новий пакет.', 'Kapot: open «Оновлення» — daar staat «Automatisch teruggedraaid» met de oorzaak; herstel de code en bouw een nieuw pakket.'],
      ['Застаріло: натисніть «Перевірити рендеринг» (root виконає за хвилину) або sudo mijn-ruimte-installeer rook-controle.', 'Verouderd: druk op «Rendering controleren» (root voert het binnen een minuut uit) of sudo mijn-ruimte-installeer rook-controle.'],
    ],
    hoe: ['Читає /var/lib/mijn-ruimte-uitrol-status/rook-controle.json (пише root: інсталятор при установці, наглядач nazorg, або на запит кнопки). Сайт сам браузер не запускає.', 'Leest /var/lib/mijn-ruimte-uitrol-status/rook-controle.json (geschreven door root: de installer bij een installatie, de nazorg-bewaker, of op verzoek via de knop). De site start zelf geen browser.'],
    naar: { href: '/updates', label: ['Відкрити «Оновлення»', 'Open «Оновлення»'] } },
  { id: 'pagina-api', cat: 'paginas', icoon: 'activity', host: 'api',
    naam: ['Службовий маршрут API (/api/_healthcheck)', 'Technische API-route (/api/_healthcheck)'],
    wat: ['Найпростіша відповідь API без авторизації.', 'Het eenvoudigste API-antwoord zonder aanmelding.'],
    waarom: ['Якщо вона мовчить — сервер застряг, навіть коли статичні сторінки ще відкриваються.', 'Zwijgt die, dan hangt de server, ook als statische pagina’s nog openen.'],
    oplossing: HTTP_OPLOSSING,
    hoe: ['GET http://127.0.0.1:<порт>/api/_healthcheck, очікується 200.', 'GET http://127.0.0.1:<poort>/api/_healthcheck, verwacht 200.'] },

  { id: 'verb-google', cat: 'verbindingen', icoon: 'google',
    naam: ['Google (вхід і пошта)', 'Google (aanmelden en mail)'],
    wat: ['Чи налаштовані ключі OAuth Google і чи досяжні сервери Google.', 'Of de Google-OAuthsleutels zijn ingesteld en de Google-servers bereikbaar zijn.'],
    waarom: ['Через Google входять користувачі та підключається Gmail; без ключів вхід через Google не працює.', 'Via Google loggen gebruikers in en koppelt Gmail; zonder sleutels werkt Google-aanmelden niet.'],
    oplossing: [
      ['Заповніть GOOGLE_OAUTH_CLIENT_ID і GOOGLE_OAUTH_CLIENT_SECRET (див. ENV-VARS.md) та перезапустіть службу.', 'Vul GOOGLE_OAUTH_CLIENT_ID en GOOGLE_OAUTH_CLIENT_SECRET in (zie ENV-VARS.md) en herstart de dienst.'],
      ['Переконайтеся, що redirect-URI у Google Cloud Console збігається з https://id.<домен>/.', 'Controleer dat de redirect-URI in Google Cloud Console gelijk is aan https://id.<domein>/.'],
      ['Якщо сервер не бачить Google — перевірте вихідний доступ до accounts.google.com (брандмауер, DNS).', 'Ziet de server Google niet, controleer uitgaand verkeer naar accounts.google.com (firewall, DNS).'],
    ],
    hoe: ['Перевіряє, чи задані змінні середовища (самі значення не читаються й не показуються) та робить GET accounts.google.com/.well-known/openid-configuration.', 'Controleert of omgevingsvariabelen zijn gezet (waarden worden niet gelezen of getoond) en doet GET accounts.google.com/.well-known/openid-configuration.'] },
  { id: 'verb-github', cat: 'verbindingen', icoon: 'git',
    naam: ['GitHub', 'GitHub'],
    wat: ['Чи досяжний api.github.com із сервера.', 'Of api.github.com vanaf de server bereikbaar is.'],
    waarom: ['Сторінка GitHub і CI-статуси залежать від зовнішнього API.', 'De GitHub-pagina en CI-statussen hangen af van de externe API.'],
    oplossing: [['Перевірте вихідний доступ до api.github.com (DNS, брандмауер, проксі).', 'Controleer uitgaand verkeer naar api.github.com (DNS, firewall, proxy).'], ['Якщо GitHub має збій — https://www.githubstatus.com.', 'Heeft GitHub een storing: https://www.githubstatus.com.']],
    hoe: ['GET https://api.github.com/ без токена (ліміт анонімних запитів не впливає на одну перевірку).', 'GET https://api.github.com/ zonder token (anonieme limiet speelt bij één controle niet).'] },
  { id: 'verb-oauth', cat: 'verbindingen', icoon: 'key',
    naam: ['OAuth для ШІ-агентів', 'OAuth voor AI-agenten'],
    wat: ['Адреса опису сервера авторизації MCP та кількість активних токенів.', 'Het beschrijvingsadres van de MCP-autorisatieserver en het aantal actieve tokens.'],
    waarom: ['ШІ-агент підключається лише якщо знаходить цей опис; без нього «Підключити» в Claude завершується помилкою.', 'Een AI-agent verbindt alleen als hij deze beschrijving vindt; zonder krijgt «Verbinden» in Claude een fout.'],
    oplossing: [['Відкрийте https://mcp.<домен>/.well-known/oauth-authorization-server/oauth2 — має віддати JSON.', 'Open https://mcp.<domein>/.well-known/oauth-authorization-server/oauth2 — dat hoort JSON te geven.'], ['Перевірте, що тунель/проксі передає шлях /.well-known/ до сайту.', 'Controleer dat tunnel/proxy het pad /.well-known/ naar de site doorgeeft.']],
    hoe: ['GET /.well-known/oauth-authorization-server/oauth2 на mcp та SELECT count(*) із app.mcp_oauth_tokens (не відкликані, не протерміновані).', 'GET /.well-known/oauth-authorization-server/oauth2 op mcp en SELECT count(*) uit app.mcp_oauth_tokens (niet ingetrokken, niet verlopen).'] },
  { id: 'verb-mcp', cat: 'verbindingen', icoon: 'plug', host: 'mcp',
    naam: ['Двері MCP', 'MCP-deur'],
    wat: ['Окремий процес «двері», через який ходять агенти (/health).', 'Het aparte «deur»-proces waarlangs agenten lopen (/health).'],
    waarom: ['Якщо двері зачинені, жоден агент не зможе працювати з вашими даними.', 'Is de deur dicht, dan kan geen enkele agent met uw gegevens werken.'],
    oplossing: [['Перевірте змінну MCP_DEUR_URL і що процес дверей запущений (порт 8091).', 'Controleer de variabele MCP_DEUR_URL en dat het deurproces draait (poort 8091).'], ['systemctl status mijn-ruimte-deur (або ім’я вашої служби дверей).', 'systemctl status mijn-ruimte-deur (of de naam van uw deurdienst).']],
    hoe: ['GET {MCP_DEUR_URL}/health з таймаутом 2,5 с.', 'GET {MCP_DEUR_URL}/health met time-out 2,5 s.'] },

  { id: 'mail-gmail-api', cat: 'mail', icoon: 'mail', host: 'mail',
    naam: ['Gmail API', 'Gmail-API'],
    wat: ['Чи відповідає публічний опис Gmail API із сервера.', 'Of de openbare beschrijving van de Gmail-API vanaf de server antwoordt.'],
    waarom: ['Якщо сервер не бачить Google, пошта не синхронізується й листи не відправляються.', 'Ziet de server Google niet, dan synchroniseert de mail niet en vertrekken er geen berichten.'],
    oplossing: [['Перевірте вихідний доступ до www.googleapis.com (DNS, брандмауер, проксі).', 'Controleer uitgaand verkeer naar www.googleapis.com (DNS, firewall, proxy).'], ['Якщо Google має збій — https://www.google.com/appsstatus.', 'Heeft Google een storing: https://www.google.com/appsstatus.']],
    hoe: ['GET https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest без авторизації (публічний опис, таймаут 5 с).', 'GET https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest zonder aanmelding (openbare beschrijving, time-out 5 s).'] },
  { id: 'mail-wachtrij', cat: 'mail', icoon: 'timer',
    naam: ['Черга запланованих листів', 'Wachtrij met geplande mails'],
    wat: ['Чи немає листів, що застрягли в «надсилається», прострочених або невдалих за добу.', 'Of er geen mails vastzitten in «wordt verzonden», te laat zijn of de afgelopen dag mislukten.'],
    waarom: ['Застрягла черга означає, що люди чекають лист, який ніколи не піде.', 'Een vastgelopen wachtrij betekent dat mensen wachten op een mail die nooit vertrekt.'],
    oplossing: [['Перегляньте помилки в «Пошта» → заплановані: поле «остання помилка» підкаже причину.', 'Bekijk de fouten in «Пошта» → gepland: het veld «laatste fout» geeft de oorzaak.'], ['Перевірте задачу «Фонова синхронізація пошти» у розділі «Фонові завдання».', 'Controleer de taak «Фонова синхронізація пошти» onder «Achtergrondtaken».'], ...HTTP_OPLOSSING.slice(2, 3)],
    hoe: ['SELECT-підрахунок у app.mail_queue: status «sending» понад 15 хв, «scheduled» з send_at старшим за 15 хв, «failed» за 24 год. Тексти листів не читаються.', 'SELECT-telling in app.mail_queue: status «sending» langer dan 15 min, «scheduled» met send_at ouder dan 15 min, «failed» in 24 u. Mailteksten worden niet gelezen.'] },

  { id: 'cloud-opslag', cat: 'cloud', icoon: 'disk', host: 'cloud',
    naam: ['Файлове сховище сайту', 'Bestandsopslag van de site'],
    wat: ['Кількість і загальний розмір файлів у сховищі та чи доступний каталог завантажень для запису.', 'Aantal en totale grootte van bestanden in de opslag en of de uploadmap beschrijfbaar is.'],
    waarom: ['Якщо запис у сховище не працює, завантаження файлів і архівів завершуються помилкою.', 'Werkt schrijven naar de opslag niet, dan eindigen uploads van bestanden en archieven met een fout.'],
    oplossing: [['Перевірте права на каталог завантажень (UPLOADS_DIR) для користувача служби.', 'Controleer de rechten op de uploadmap (UPLOADS_DIR) voor de gebruiker van de dienst.'], ['Перевірте вільне місце в розділі «Сервер» → диск.', 'Controleer de vrije ruimte onder «Сервер» → schijf.']],
    hoe: ['SELECT count/sum із app.storage_objects і перевірка доступу на запис (access W_OK) до UPLOADS_DIR, якщо задано. Файли не створюються.', 'SELECT count/sum uit app.storage_objects en een schrijfrechtcontrole (access W_OK) op UPLOADS_DIR indien ingesteld. Er worden geen bestanden gemaakt.'] },
  { id: 'cloud-drive-api', cat: 'cloud', icoon: 'cloud', host: 'cloud',
    naam: ['Google Drive API', 'Google Drive-API'],
    wat: ['Чи відповідає публічний опис Drive API із сервера.', 'Of de openbare beschrijving van de Drive-API vanaf de server antwoordt.'],
    waarom: ['Без Drive не відкриваються підключені папки й не зберігаються вкладення на диск.', 'Zonder Drive openen gekoppelde mappen niet en worden bijlagen niet op schijf bewaard.'],
    oplossing: [['Перевірте вихідний доступ до www.googleapis.com (DNS, брандмауер, проксі).', 'Controleer uitgaand verkeer naar www.googleapis.com (DNS, firewall, proxy).'], ['Якщо збій лише в одного користувача — він мав би перепідключити Google у налаштуваннях.', 'Gaat het alleen bij één gebruiker mis, dan moet die Google opnieuw koppelen in de instellingen.']],
    hoe: ['GET https://www.googleapis.com/discovery/v1/apis/drive/v3/rest без авторизації (таймаут 5 с).', 'GET https://www.googleapis.com/discovery/v1/apis/drive/v3/rest zonder aanmelding (time-out 5 s).'] },

  { id: 'ai-verbindingen', cat: 'ai', icoon: 'sparkles', host: 'mcp',
    naam: ['Підключення ШІ-агентів (OAuth)', 'Verbindingen van AI-agenten (OAuth)'],
    wat: ['Скільки агентів зараз підключено й коли хтось востаннє ними користувався.', 'Hoeveel agenten nu verbonden zijn en wanneer ze voor het laatst zijn gebruikt.'],
    waarom: ['Показує, чи Claude, GPT та інші справді підключені, і виявляє підключення, що не використовуються.', 'Laat zien of Claude, GPT en anderen echt verbonden zijn en vindt verbindingen die niet worden gebruikt.'],
    oplossing: [['Якщо агент не підключений — підключіть його знову на сторінці «Доступ ШІ».', 'Is een agent niet verbonden, koppel hem dan opnieuw op de pagina «Доступ ШІ».'], ['Зайві підключення вимкніть там само.', 'Schakel overbodige verbindingen daar ook uit.']],
    hoe: ['SELECT із app.mcp_oauth_tokens (не відкликані, не протерміновані): кількість, назви клієнтів (до 5) і найновіше використання. Самі токени не читаються.', 'SELECT uit app.mcp_oauth_tokens (niet ingetrokken, niet verlopen): aantal, clientnamen (max. 5) en het laatste gebruik. De tokens zelf worden niet gelezen.'] },
  { id: 'ai-voorbereiders', cat: 'ai', icoon: 'key',
    naam: ['Дозволи «Хто готує оновлення»', 'Toestemmingen «Хто готує оновлення»'],
    wat: ['Чи є чинні дозволи, чи не спливають вони за добу й чи немає «осиротілих» (прив’язаних до відкликаного підключення).', 'Of er geldige toestemmingen zijn, of ze binnen een dag verlopen en of er geen «weesgrants» zijn (gebonden aan een ingetrokken verbinding).'],
    waarom: ['Агент у списку без чинного дозволу не може підготувати оновлення — саме так «Claude не може розгортати».', 'Een agent in de lijst zonder geldige toestemming kan geen update voorbereiden — zo kan Claude niet uitrollen.'],
    oplossing: [['Відкрийте «Оновлення» → «Налаштування» → «Хто готує оновлення» і додайте агента (1/7/30 днів або без терміну).', 'Open «Оновлення» → «Налаштування» → «Хто готує оновлення» en voeg de agent toe (1/7/30 dagen of onbepaald).'], ['Осиротілі дозволи вимкніть: вони нічого не дають.', 'Zet weesgrants uit: ze geven niets.']],
    hoe: ['SELECT-підрахунок у app.uitrol_voorbereiders (не відкликані): чинні, що спливають за 24 год, і «mcp-koppeling» без активного токена в app.mcp_oauth_tokens.', 'SELECT-telling in app.uitrol_voorbereiders (niet ingetrokken): geldig, binnen 24 u verlopend en «mcp-koppeling» zonder actief token in app.mcp_oauth_tokens.'],
    naar: { href: '/updates', label: ['Відкрити «Оновлення»', 'Open «Оновлення»'] } },

  { id: 'apparaten-agents', cat: 'apparaten', icoon: 'cpu',
    naam: ['Локальні агенти', 'Lokale agenten'],
    wat: ['Скільки локальних агентів підключено й чи не «мовчать» підключені.', 'Hoeveel lokale agenten verbonden zijn en of verbonden agenten niet stil zijn.'],
    waarom: ['Агент зі статусом «підключений», що давно не виходив на зв’язок, не виконає жодної команди.', 'Een agent met status «verbonden» die lang niets liet horen, voert geen enkele opdracht uit.'],
    oplossing: [['На комп’ютері перезапустіть локальний агент і дочекайтесь статусу «підключено».', 'Herstart de lokale agent op de computer en wacht op de status «verbonden».'], ['Якщо агента більше немає — відкличте його на сторінці «Пристрої».', 'Bestaat de agent niet meer, trek hem dan in op de pagina «Пристрої».']],
    hoe: ['SELECT із app.agents (не відкликані): статус і last_seen_at. «Підключений» без сигналу понад 10 хв = «увага». Токени не читаються.', 'SELECT uit app.agents (niet ingetrokken): status en last_seen_at. «Verbonden» zonder signaal langer dan 10 min = «let op». Tokens worden niet gelezen.'] },
  { id: 'apparaten-commando', cat: 'apparaten', icoon: 'activity',
    naam: ['Команди локальних агентів', 'Opdrachten van lokale agenten'],
    wat: ['Результат команд за добу: скільки успішних, невдалих і скільки застрягло.', 'Resultaat van opdrachten in de afgelopen dag: geslaagd, mislukt en vastgelopen.'],
    waarom: ['Багато невдалих команд означає, що агент або дозволи налаштовані неправильно.', 'Veel mislukte opdrachten betekenen dat agent of toestemmingen verkeerd zijn ingesteld.'],
    oplossing: [['Відкрийте «Пристрої» й подивіться результат невдалої команди.', 'Open «Пристрої» en bekijk het resultaat van de mislukte opdracht.'], ['Перевірте дозволи агента: команда може бути заборонена політикою.', 'Controleer de toestemmingen van de agent: de opdracht kan door beleid verboden zijn.']],
    hoe: ['SELECT-підрахунок у app.agent_commands за 24 год: success/failed/timeout і «sent» понад 10 хв. Зміст команд і результатів не читається.', 'SELECT-telling in app.agent_commands over 24 u: succeeded/failed/timeout en «sent» langer dan 10 min. Inhoud van opdrachten en resultaten wordt niet gelezen.'] },

  { id: 'data-database', cat: 'data', icoon: 'database',
    naam: ['База даних', 'Database'],
    wat: ['З’єднання з PostgreSQL і швидкість простого запиту.', 'Verbinding met PostgreSQL en de snelheid van een eenvoudige query.'],
    waarom: ['Усе зберігається в базі; повільна база сповільнює всі сторінки.', 'Alles staat in de database; een trage database vertraagt elke pagina.'],
    oplossing: [['systemctl status postgresql — служба має працювати.', 'systemctl status postgresql — de dienst moet draaien.'], ['Перевірте місце на диску: у повному диску Postgres зупиняється.', 'Controleer de schijfruimte: bij een volle schijf stopt Postgres.'], ['Перевірте DATABASE_URL та кількість з’єднань (max_connections).', 'Controleer DATABASE_URL en het aantal verbindingen (max_connections).']],
    hoe: ['Три запити SELECT 1; береться медіана часу. Понад 200 мс = «увага».', 'Drie keer SELECT 1; de mediaan telt. Boven 200 ms = «let op».'] },
  { id: 'data-schema', cat: 'data', icoon: 'layers',
    naam: ['Міграції бази', 'Databasemigraties'],
    wat: ['Усі файли міграцій із пакета застосовані до бази.', 'Alle migratiebestanden uit het pakket zijn op de database toegepast.'],
    waarom: ['Непримінена міграція — типова причина помилок після оновлення (нема колонки/таблиці).', 'Een niet toegepaste migratie is de klassieke oorzaak van fouten na een update (kolom/tabel ontbreekt).'],
    oplossing: [['Запустіть міграції: npm run migrate (на сервері, у каталозі релізу).', 'Draai de migraties: npm run migrate (op de server, in de releasemap).'], ['Або повторіть установку пакета: sudo bash deploy/installeer-app.sh installeren .', 'Of herhaal de installatie: sudo bash deploy/installeer-app.sh installeren .']],
    hoe: ['Порівнює файли migrations/*.sql з app.schema_migrations.', 'Vergelijkt migrations/*.sql met app.schema_migrations.'] },
  { id: 'data-audit', cat: 'data', icoon: 'scroll',
    naam: ['Ланцюжок хешів журналу аудиту', 'Hashketen van het auditlogboek'],
    wat: ['Перевіряє, що жоден запис журналу не змінено задним числом.', 'Controleert dat geen logboekregel achteraf is aangepast.'],
    waarom: ['Журнал — доказ «хто що зробив». Зламаний ланцюжок означає втручання або пошкодження.', 'Het logboek is het bewijs wie wat deed. Een gebroken keten wijst op ingrijpen of beschadiging.'],
    oplossing: [['Відкрийте «Журнал» і подивіться, з якого запису ланцюжок розірвано.', 'Open «Logboek» en kijk vanaf welke regel de keten breekt.'], ['Не видаляйте записи вручну в базі. Зробіть резервну копію та зверніться до розробника.', 'Verwijder geen regels handmatig in de database. Maak een back-up en raadpleeg de ontwikkelaar.']],
    hoe: ['Перераховує app.audit_hash для кожного запису (лише читання, у межах свіжого вікна).', 'Herberekent app.audit_hash voor elke regel (alleen lezen, binnen een recent venster).'] },

  { id: 'server-schijf', cat: 'server', icoon: 'disk',
    naam: ['Місце на диску', 'Schijfruimte'],
    wat: ['Скільки відсотків диска вільно.', 'Hoeveel procent van de schijf vrij is.'],
    waarom: ['Менше 3% — база й завантаження зупиняться.', 'Onder 3% stoppen database en uploads.'],
    oplossing: [['Знайдіть великі каталоги: du -xh /srv --max-depth=2 | sort -h | tail.', 'Zoek grote mappen: du -xh /srv --max-depth=2 | sort -h | tail.'], ['Видаліть старі релізи в /srv/mijn-ruimte/releases (залиште 3 останні) і старі резервні копії.', 'Verwijder oude releases in /srv/mijn-ruimte/releases (houd de laatste 3) en oude back-ups.'], ['journalctl --vacuum-size=200M зменшить системний журнал.', 'journalctl --vacuum-size=200M verkleint het systeemlogboek.']],
    hoe: ['statfs каталогу даних: <10% вільно = «увага», <3% = «помилка».', 'statfs van de datamap: <10% vrij = «let op», <3% = «fout».'] },
  { id: 'server-geheugen', cat: 'server', icoon: 'memory',
    naam: ['Оперативна пам’ять', 'Werkgeheugen'],
    wat: ['Скільки пам’яті доступно (MemAvailable).', 'Hoeveel geheugen beschikbaar is (MemAvailable).'],
    waarom: ['Коли пам’яті не вистачає, система вбиває процеси (OOM) — зазвичай базу або сайт.', 'Is er te weinig geheugen, dan doodt het systeem processen (OOM) — meestal database of site.'],
    oplossing: [['top -o %MEM — подивіться, який процес «їсть» пам’ять.', 'top -o %MEM — kijk welk proces het geheugen opeet.'], ['Перезапустіть службу сайту: systemctl restart mijn-ruimte (короткий простій).', 'Herstart de sitedienst: systemctl restart mijn-ruimte (korte onderbreking).'], ['Якщо повторюється — збільште пам’ять сервера або додайте swap.', 'Herhaalt het zich, vergroot dan het geheugen of voeg swap toe.']],
    hoe: ['Читає /proc/meminfo (MemAvailable/MemTotal): <10% = «увага», <4% = «помилка».', 'Leest /proc/meminfo (MemAvailable/MemTotal): <10% = «let op», <4% = «fout».'] },
  { id: 'server-cpu', cat: 'server', icoon: 'cpu',
    naam: ['Навантаження процесора', 'Processorbelasting'],
    wat: ['Середнє навантаження за 1 хвилину відносно кількості ядер.', 'Gemiddelde belasting over 1 minuut ten opzichte van het aantal kernen.'],
    waarom: ['Стійке навантаження вище за кількість ядер робить сайт повільним для всіх.', 'Aanhoudende belasting boven het aantal kernen maakt de site traag voor iedereen.'],
    oplossing: [['top — знайдіть процес, що навантажує CPU.', 'top — zoek het proces dat de CPU belast.'], ['Перевірте, чи не йде зараз установка оновлення (збірка навантажує CPU кілька хвилин).', 'Kijk of er nu een update wordt geïnstalleerd (de build belast de CPU enkele minuten).']],
    hoe: ['os.loadavg()[0] / кількість ядер: >1,5 = «увага», >3 = «помилка».', 'os.loadavg()[0] / aantal kernen: >1,5 = «let op», >3 = «fout».'] },
  { id: 'server-tijd', cat: 'server', icoon: 'clock',
    naam: ['Годинник сервера', 'Klok van de server'],
    wat: ['Різниця між годинником сервера та бази даних.', 'Verschil tussen de klok van de server en die van de database.'],
    waarom: ['Неточний час ламає passkey, токени та перевірку підписів.', 'Een onjuiste tijd breekt passkeys, tokens en handtekeningcontroles.'],
    oplossing: [['timedatectl status — має бути «System clock synchronized: yes».', 'timedatectl status — moet «System clock synchronized: yes» tonen.'], ['Увімкніть синхронізацію: timedatectl set-ntp true.', 'Zet synchronisatie aan: timedatectl set-ntp true.']],
    hoe: ['Порівнює Date.now() із SELECT now(); розбіжність понад 2 хв = «увага».', 'Vergelijkt Date.now() met SELECT now(); afwijking boven 2 min = «let op».'] },
  { id: 'server-proces', cat: 'server', icoon: 'activity',
    naam: ['Процес сайту', 'Siteproces'],
    wat: ['Час роботи, використана пам’ять і «лаг» циклу подій Node.', 'Looptijd, gebruikt geheugen en de «lag» van de Node-eventloop.'],
    waarom: ['Лаг понад 200 мс означає, що процес «підвис» на важкій операції — сайт відповідає з затримкою.', 'Een lag boven 200 ms betekent dat het proces vastzit op een zware taak — de site antwoordt met vertraging.'],
    oplossing: [['Подивіться журнал на довгі запити: journalctl -u mijn-ruimte -n 200.', 'Zoek lange verzoeken in het logboek: journalctl -u mijn-ruimte -n 200.'], ['Якщо лаг постійний — перезапустіть службу.', 'Is de lag blijvend, herstart de dienst.']],
    hoe: ['Міряє затримку setTimeout(50 мс) і читає process.uptime()/memoryUsage().', 'Meet de vertraging van setTimeout(50 ms) en leest process.uptime()/memoryUsage().'] },

  { id: 'net-dns', cat: 'netwerk', icoon: 'globe',
    naam: ['DNS піддоменів', 'DNS van de subdomeinen'],
    wat: ['Усі 9 піддоменів мають A-запис.', 'Alle 9 subdomeinen hebben een A-record.'],
    waarom: ['Без DNS-запису піддомен «не існує» для зовнішнього світу.', 'Zonder DNS-record bestaat een subdomein niet voor de buitenwereld.'],
    oplossing: [['У панелі DNS (Cloudflare тощо) додайте відсутній запис для зазначеного піддомену.', 'Voeg in het DNS-paneel (Cloudflare e.d.) het ontbrekende record voor het genoemde subdomein toe.'], ['Зачекайте до кількох хвилин на поширення.', 'Wacht enkele minuten op verspreiding.']],
    hoe: ['dns.resolve4 для кожного піддомену (лише відомий список).', 'dns.resolve4 voor elk subdomein (alleen de vaste lijst).'] },
  { id: 'net-tls', cat: 'netwerk', icoon: 'lock',
    naam: ['TLS-сертифікати', 'TLS-certificaten'],
    wat: ['Скільки днів лишилось до кінця найближчого сертифіката.', 'Hoeveel dagen er resteren tot het eerstvolgende certificaat verloopt.'],
    waarom: ['Протермінований сертифікат блокує вхід для всіх браузерів без винятку.', 'Een verlopen certificaat blokkeert alle browsers zonder uitzondering.'],
    oplossing: [['Поновіть сертифікат (certbot renew або автоматичне оновлення вашого проксі).', 'Vernieuw het certificaat (certbot renew of de automatische vernieuwing van uw proxy).'], ['Після оновлення перезавантажте проксі/Caddy/nginx.', 'Herlaad na vernieuwing de proxy/Caddy/nginx.']],
    hoe: ['TLS-з’єднання на 443 до кожного піддомену, читається лише дата закінчення; <21 день = «увага», <7 = «помилка».', 'TLS-verbinding op 443 naar elk subdomein, alleen de einddatum wordt gelezen; <21 dagen = «let op», <7 = «fout».'] },

  { id: 'taak-mail', cat: 'taken', icoon: 'mail',
    naam: ['Фонова синхронізація пошти', 'Achtergrondsynchronisatie e-mail'],
    wat: ['Остання успішна робота cron «mail-provider-maintenance».', 'Laatste geslaagde run van cron «mail-provider-maintenance».'],
    waarom: ['Якщо вона стоїть, нові листи не підтягуються, хоча інтерфейс виглядає нормально.', 'Staat die stil, dan komt nieuwe mail niet binnen terwijl de interface er normaal uitziet.'],
    oplossing: [['Перевірте, що cron запущений: systemctl list-timers | grep mijn-ruimte.', 'Controleer dat cron draait: systemctl list-timers | grep mijn-ruimte.'], ['Запустіть вручну: npm run cron (на сервері).', 'Draai handmatig: npm run cron (op de server).']],
    hoe: ['Читає запис cron_status_mail_maintenance_v1: понад 26 год без запуску = «увага».', 'Leest record cron_status_mail_maintenance_v1: meer dan 26 uur zonder run = «let op».'] },
  { id: 'taak-cron', cat: 'taken', icoon: 'timer',
    naam: ['Усі cron-завдання', 'Alle cron-taken'],
    wat: ['Стан усіх записів cron_status_* — які давно не запускались або завершились з помилкою.', 'Toestand van alle cron_status_*-records — welke lang niet draaiden of met een fout eindigden.'],
    waarom: ['Показує всі фонові завдання разом, а не лише пошту.', 'Toont alle achtergrondtaken samen, niet alleen mail.'],
    oplossing: [['Знайдіть завдання з помилкою в деталях і перевірте його журнал.', 'Zoek de mislukte taak in de details en lees zijn logboek.'], ['journalctl -u mijn-ruimte-cron -n 100 (або ім’я вашого таймера).', 'journalctl -u mijn-ruimte-cron -n 100 (of de naam van uw timer).']],
    hoe: ['SELECT із app.records де tbl LIKE cron_status_%; перевіряє ok і вік запису (понад 26 год).', 'SELECT uit app.records waar tbl LIKE cron_status_%; controleert ok en leeftijd (meer dan 26 uur).'] },
  // 22.10.2026 (zone A): «Усі cron-завдання» kijkt alleen naar cron_status_*; de zoekindex schrijft daar niets en viel buiten beeld.
  { id: 'taak-zoek-index', cat: 'taken', icoon: 'search',
    naam: ['Індекс пошуку (cron zoek-index)', 'Zoekindex (cron zoek-index)'],
    wat: ['Останній запуск cron «zoek-index» з app.cron_runs, черга індексації та стан джерел (помилки з app.zoek_bron_stand).', 'Laatste run van cron «zoek-index» uit app.cron_runs, de indexeerwachtrij en de toestand van de bronnen (fouten uit app.zoek_bron_stand).'],
    waarom: ['Якщо індекс стоїть, пошук /zoek тихо показує старі результати; ця перевірка бачить це раніше за користувача.', 'Staat de index stil, dan toont /zoek stilletjes oude resultaten; deze controle ziet dat vóór de gebruiker.'],
    oplossing: [['systemctl list-timers | grep zoek-index — таймер має бути активний.', 'systemctl list-timers | grep zoek-index — de timer moet actief zijn.'], ['journalctl -u mijn-ruimte-cron@zoek-index -n 100 — остання помилка.', 'journalctl -u mijn-ruimte-cron@zoek-index -n 100 — de laatste fout.'], ['Джерело з помилкою: перепідключіть акаунт (сторінка пошуку → джерела).', 'Bron met fout: koppel het account opnieuw (zoekpagina → bronnen).']],
    hoe: ['SELECT останнього app.cron_runs WHERE name = zoek-index (понад 30 хв без запуску = «увага», status error = «збій»); count(*) з app.zoek_wachtrij; джерела з laatste_fout новішим за laatste_succes.', 'SELECT van de laatste app.cron_runs WHERE name = zoek-index (meer dan 30 min zonder run = «let op», status error = «fout»); count(*) uit app.zoek_wachtrij; bronnen met laatste_fout nieuwer dan laatste_succes.'] },
  { id: 'taak-uitrol', cat: 'taken', icoon: 'rocket',
    naam: ['Останнє розгортання оновлення', 'Laatste uitrol van een update'],
    wat: ['Чим завершилась остання установка пакета.', 'Hoe de laatste pakketinstallatie eindigde.'],
    waarom: ['Невдале розгортання, про яке ніхто не знає, залишає сайт на старій версії.', 'Een mislukte uitrol waar niemand van weet laat de site op de oude versie staan.'],
    oplossing: [['Відкрийте «Оновлення» → «Історія» та прочитайте журнал невдалої спроби.', 'Open «Оновлення» → «Історія» en lees het logboek van de mislukte poging.'], ['Виправте причину та завантажте новий пакет.', 'Los de oorzaak op en upload een nieuw pakket.']],
    hoe: ['SELECT останнього запису app.uitrol_runs: «mislukt» або «geweigerd» за останні 24 год = «увага».', 'SELECT van het laatste record in app.uitrol_runs: «mislukt» of «geweigerd» in de laatste 24 uur = «let op».'],
    naar: { href: '/updates', label: ['Відкрити «Оновлення»', 'Open «Оновлення»'] } },
];

export const CONTROLE_IDS: readonly string[] = CONTROLES.map((c) => c.id);
export const controleVan = (id: string): ControleDef | undefined => CONTROLES.find((c) => c.id === id);
export const ID_VORM = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const isControleId = (id: unknown): id is string => typeof id === 'string' && ID_VORM.test(id) && CONTROLE_IDS.includes(id);
export const controlesVan = (cat: CategorieId): ControleDef[] => CONTROLES.filter((c) => c.cat === cat);

// ---------------------------------------------------------------------------------------------------------------- uitslagen
export type Uitslag = { id: string; stand: Stand; ms: number; code: string; detail: string; op: number };
/** Samenvatting per controle zoals de server die teruggeeft (laatste uitslag + historie in cijfers). */
export type Toestand = {
  laatste: Uitslag | null; laatsteSucces: number; eersteFoutSindsSucces: number; fouten24: number; uitvoeringen24: number; door?: string;
};
export type Historie = Uitslag & { nr: number; door: string; categorie: string };

export const MAX_BATCH = 40;
export const MS_LET_OP = 1500;

/** Uitleg bij een foutcode: eerlijk en kort. `reden` is wat er is gebeurd; `extra` is een aanvullende stap. */
export type CodeUitleg = { reden: Tekst; extra?: Tekst };
const CODES: Record<string, CodeUitleg> = {
  TIJD_OM: { reden: ['Перевірка не відповіла вчасно (тайм-аут).', 'De controle antwoordde niet op tijd (time-out).'], extra: ['Сервіс завис або дуже перевантажений — спробуйте ще раз за хвилину.', 'De dienst hangt of is zwaar belast — probeer over een minuut opnieuw.'] },
  FOUT: { reden: ['Перевірка завершилась помилкою.', 'De controle eindigde met een fout.'] },
  NIET_BEREIKBAAR: { reden: ['Сервер не зміг з’єднатися з адресою.', 'De server kon geen verbinding maken met het adres.'], extra: ['Якщо ззовні сайт відкривається, а з сервера — ні, перевірте DNS/hairpin-NAT на самому сервері.', 'Opent de site van buiten maar niet vanaf de server zelf, controleer DNS/hairpin-NAT op de server.'] },
  NIET_INGESTELD: { reden: ['Налаштування (змінна середовища) не задане, тому перевірити неможливо.', 'De instelling (omgevingsvariabele) is niet gezet, dus controleren kan niet.'] },
  GEEN_TOEGANG: { reden: ['У сайту немає права читати потрібні дані.', 'De site heeft geen recht om de benodigde gegevens te lezen.'] },
  GEEN_MAP: { reden: ['Каталог із файлами не знайдено.', 'De map met bestanden is niet gevonden.'] },
  LAATSTE_RUN_MISLUKT: { reden: ['Останній запуск завершився помилкою.', 'De laatste run eindigde met een fout.'] },
  TE_LANG_GELEDEN: { reden: ['Завдання давно не запускалось.', 'De taak draaide al lang niet meer.'] },
  NOG_NIET_GEDRAAID: { reden: ['Завдання ще жодного разу не запускалось (записів немає).', 'De taak is nog nooit gedraaid (geen records).'] },
  BIJNA_VOL: { reden: ['Диск майже повний (менше 3% вільно).', 'De schijf is bijna vol (minder dan 3% vrij).'] },
  WEINIG_VRIJ: { reden: ['На диску лишилось менше 10% вільного місця.', 'Er is minder dan 10% vrije schijfruimte.'] },
  GEHEUGEN_KRAP: { reden: ['Доступної пам’яті мало (менше 10%).', 'Er is weinig beschikbaar geheugen (minder dan 10%).'] },
  GEHEUGEN_BIJNA_OP: { reden: ['Пам’ять майже вичерпана (менше 4%).', 'Het geheugen is bijna op (minder dan 4%).'] },
  LOAD_HOOG: { reden: ['Навантаження вище, ніж кількість ядер.', 'De belasting is hoger dan het aantal kernen.'] },
  LOAD_ZEER_HOOG: { reden: ['Навантаження більш ніж утричі перевищує кількість ядер.', 'De belasting is meer dan drie keer het aantal kernen.'] },
  LAG_HOOG: { reden: ['Цикл подій Node затримується понад 200 мс.', 'De Node-eventloop loopt meer dan 200 ms achter.'] },
  DB_KLOK_WIJKT_AF: { reden: ['Годинник сервера та бази розходяться.', 'De klok van server en database wijkt af.'] },
  DB_TRAAG: { reden: ['База відповідає повільно (понад 200 мс на простий запит).', 'De database antwoordt traag (meer dan 200 ms op een eenvoudige query).'] },
  TLS_VERLOPEN: { reden: ['Сертифікат уже протермінований.', 'Het certificaat is al verlopen.'] },
  TLS_BINNENKORT: { reden: ['Сертифікат спливає менш ніж за 7 днів.', 'Het certificaat verloopt over minder dan 7 dagen.'] },
  TLS_KORT: { reden: ['Сертифікат спливає менш ніж за 21 день.', 'Het certificaat verloopt over minder dan 21 dagen.'] },
  TLS_FOUT: { reden: ['Не вдалося прочитати сертифікат (TLS-з’єднання не встановлено).', 'Het certificaat kon niet worden gelezen (TLS-verbinding mislukt).'] },
  DNS_GEEN: { reden: ['Для піддомену немає A-запису.', 'Voor het subdomein is geen A-record.'] },
  KETEN_GEBROKEN: { reden: ['Ланцюжок хешів журналу аудиту порушено.', 'De hashketen van het auditlogboek is verbroken.'] },
  GEEN_HTML: { reden: ['Відповідь не схожа на сторінку застосунку (немає HTML-оболонки).', 'Het antwoord lijkt niet op een app-pagina (geen HTML-schil).'] },
  GEEN_BUNDEL: { reden: ['Не знайдено головний файл інтерфейсу в dist/index.html.', 'Het hoofdbestand van de interface is niet gevonden in dist/index.html.'] },
  UITROL_MISLUKT: { reden: ['Останнє розгортання не вдалося або було відхилене.', 'De laatste uitrol is mislukt of geweigerd.'] },
  CRON_FOUT: { reden: ['Принаймні одне cron-завдання завершилось помилкою.', 'Minstens één cron-taak eindigde met een fout.'] },
  CRON_OUD: { reden: ['Принаймні одне cron-завдання давно не запускалось.', 'Minstens één cron-taak draaide al lang niet.'] },
  GEEN_CRON: { reden: ['Записів про cron-завдання ще немає.', 'Er zijn nog geen records van cron-taken.'] },
  MAIL_VAST: { reden: ['У черзі є листи, що застрягли або прострочені.', 'In de wachtrij zitten mails vast of te laat.'], extra: ['Подивіться «остання помилка» в запланованих листах.', 'Bekijk «laatste fout» bij de geplande mails.'] },
  MAIL_MISLUKT: { reden: ['За добу були невдалі відправлення листів.', 'In de afgelopen dag zijn mails niet verzonden.'] },
  OPSLAG_SCHRIJVEN: { reden: ['Каталог завантажень недоступний для запису.', 'De uploadmap is niet beschrijfbaar.'] },
  VERWEESD_GRANT: { reden: ['Є дозволи, прив’язані до відкликаного підключення: агент у списку, але працювати не може.', 'Er zijn toestemmingen gebonden aan een ingetrokken verbinding: de agent staat in de lijst maar kan niet werken.'], extra: ['Вимкніть їх і додайте агента заново (дозвіл «агент» діє після перепідключення).', 'Zet ze uit en voeg de agent opnieuw toe (de toestemming «агент» blijft gelden na heraansluiten).'] },
  GRANT_VERLOOPT: { reden: ['Дозвіл спливає протягом доби.', 'Een toestemming verloopt binnen een dag.'] },
  AGENT_STIL: { reden: ['Підключений агент давно не виходив на зв’язок.', 'Een verbonden agent heeft lang niets laten horen.'] },
  OPDRACHTEN_MISLUKT: { reden: ['Багато команд локальних агентів завершились помилкою.', 'Veel opdrachten van lokale agenten eindigden met een fout.'] },
  OPDRACHTEN_VAST: { reden: ['Є команди, що застрягли в статусі «надіслано».', 'Er zijn opdrachten die vastzitten in de status «verzonden».'] },
  GEEN_AGENTEN: { reden: ['Підключених агентів немає (це не помилка, лише інформація).', 'Er zijn geen verbonden agenten (geen fout, alleen informatie).'] },
  TOKENS_GEEN: { reden: ['Активних токенів агентів немає (це не помилка, лише інформація).', 'Er zijn geen actieve agenttokens (geen fout, alleen informatie).'] },
  // rendercontrole (backend/rook-controle.ts)
  ROOK_KAPOT: { reden: ['Сторінка не рендериться у браузері (біла сторінка, помилка на рівні модуля або бандл не завантажився).', 'Een pagina rendert niet in de browser (witte pagina, fout op moduleniveau of een bundel laadt niet).'], extra: ['Інсталятор відкочує такий випуск автоматично; подробиці — в «Оновлення».', 'De installer draait zo’n release automatisch terug; details in «Оновлення».'] },
  ROOK_NIET_GECONTROLEERD: { reden: ['Лише HTTP: рендеринг не перевірено, бо на сервері немає браузера.', 'Alleen HTTP: de rendering is niet gecontroleerd omdat er geen browser op de server is.'], extra: ['sudo mijn-ruimte-installeer browser-controle', 'sudo mijn-ruimte-installeer browser-controle'] },
  ROOK_NIET_UITGEVOERD: { reden: ['Остання перевірка рендерингу не змогла виконатись (інфраструктура, не сайт).', 'De laatste rendercontrole kon niet worden uitgevoerd (infrastructuur, niet de site).'] },
  ROOK_OUD: { reden: ['Результат рендер-контролю застарів або стосується іншого випуску.', 'De uitslag van de rendercontrole is verouderd of hoort bij een andere release.'] },
  ROOK_GEEN: { reden: ['Рендеринг ще жодного разу не перевірявся.', 'De rendering is nog nooit gecontroleerd.'] },
  ROOK_WAARSCHUWING: { reden: ['Сторінки рендеряться, але лінива бібліотека не завантажується (попередження, не відкат).', 'De pagina’s renderen, maar een lazy bibliotheek laadt niet (waarschuwing, geen terugdraai).'] },
  // zoekindex
  ZOEK_INDEX_FOUT: { reden: ['Останній запуск індексу пошуку завершився помилкою.', 'De laatste run van de zoekindex eindigde met een fout.'] },
  ZOEK_INDEX_OUD: { reden: ['Індекс пошуку давно не запускався (таймер стоїть?).', 'De zoekindex draaide al lang niet (staat de timer stil?).'] },
  ZOEK_INDEX_NOOIT: { reden: ['Індекс пошуку ще жодного разу не запускався.', 'De zoekindex is nog nooit gedraaid.'] },
  ZOEK_BRON_FOUT: { reden: ['Принаймні одне джерело пошуку має помилку, новішу за останній успіх.', 'Minstens één zoekbron heeft een fout die nieuwer is dan het laatste succes.'] },
  ZOEK_WACHTRIJ_VAST: { reden: ['Черга індексації росте, але індекс її не обробляє.', 'De indexeerwachtrij groeit, maar de index verwerkt ze niet.'] },
};
export function codeUitleg(code: string): CodeUitleg | null {
  if (!code) return null;
  if (CODES[code]) return CODES[code];
  let m = /^HTTP_(\d{3})$/.exec(code);
  if (m) {
    const n = Number(m[1]);
    return n >= 500 ? { reden: [`Сервіс відповів помилкою сервера ${n}.`, `De dienst antwoordde met serverfout ${n}.`], extra: ['Подивіться журнал служби — причина майже завжди там.', 'Kijk in het logboek van de dienst — de oorzaak staat daar bijna altijd.'] }
      : n === 404 ? { reden: ['Адреса не знайдена (404): маршрут зник або реліз неповний.', 'Adres niet gevonden (404): de route ontbreekt of de release is onvolledig.'] }
      : { reden: [`Сервіс відповів несподіваним кодом ${n}.`, `De dienst antwoordde met een onverwachte code ${n}.`] };
  }
  m = /^OPEN_(\d{1,3})$/.exec(code);
  if (m) return { reden: [`Не застосовано міграцій: ${m[1]}.`, `Niet toegepaste migraties: ${m[1]}.`] };
  return { reden: [`Код: ${code}`, `Code: ${code}`] };
}

export const STAND_VOLGORDE: Record<Stand, number> = { fout: 0, 'let-op': 1, onbekend: 2, ok: 3 };
export const STAND_TEKST: Record<Stand | 'nooit', Tekst> = {
  ok: ['Справно', 'In orde'], 'let-op': ['Увага', 'Let op'], fout: ['Збій', 'Fout'], onbekend: ['Невідомо', 'Onbekend'], nooit: ['Не перевірено', 'Niet gecontroleerd'],
};

/** Zijn de ruwe getallen van de server geloofwaardig? De server levert alleen deze velden; alles wat vreemd is wordt weggeknipt. */
export function schoonUitslag(raw: unknown): Uitslag | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isControleId(o.id)) return null;
  if (!['ok', 'let-op', 'fout', 'onbekend'].includes(String(o.stand))) return null;
  const ms = Number(o.ms), op = Number(o.op);
  return {
    id: o.id, stand: o.stand as Stand, ms: Number.isFinite(ms) && ms >= 0 ? Math.min(Math.round(ms), 600_000) : 0,
    code: typeof o.code === 'string' && /^[A-Z0-9_]{0,40}$/.test(o.code) ? o.code : '',
    detail: typeof o.detail === 'string' ? o.detail.slice(0, 400) : '', op: Number.isFinite(op) && op > 0 ? op : 0,
  };
}

export type AandachtItem = { id: string; reden: 'nu' | 'hersteld'; stand: Stand; sinds: number; uitslag: Uitslag };
/**
 * «Потребує уваги»: wat nu niet in orde is (fout → let-op → onbekend), gevolgd door wat in de laatste 24 uur faalde maar nu weer werkt
 * («нещодавно падало»). Binnen een groep: nieuwste uitslag eerst. Nooit uitgevoerd = niet in de lijst (we verzinnen geen problemen).
 */
export function aandacht(toestanden: Record<string, Toestand | undefined>): AandachtItem[] {
  const nu: AandachtItem[] = [], hersteld: AandachtItem[] = [];
  for (const id of CONTROLE_IDS) {
    const t = toestanden[id];
    const u = t?.laatste;
    if (!t || !u) continue;
    if (u.stand !== 'ok') nu.push({ id, reden: 'nu', stand: u.stand, sinds: t.eersteFoutSindsSucces || u.op, uitslag: u });
    else if (t.fouten24 > 0) hersteld.push({ id, reden: 'hersteld', stand: 'ok', sinds: u.op, uitslag: u });
  }
  nu.sort((a, b) => STAND_VOLGORDE[a.stand] - STAND_VOLGORDE[b.stand] || b.uitslag.op - a.uitslag.op || a.id.localeCompare(b.id));
  hersteld.sort((a, b) => b.uitslag.op - a.uitslag.op || a.id.localeCompare(b.id));
  return [...nu, ...hersteld];
}

/** Totaaloordeel van een lijst controles (voor de kop van de pagina of van een categorie). */
export function totaal(toestanden: Record<string, Toestand | undefined>, ids: readonly string[] = CONTROLE_IDS) {
  const t = { ok: 0, 'let-op': 0, fout: 0, onbekend: 0, nooit: 0 };
  for (const id of ids) { const u = toestanden[id]?.laatste; if (!u) t.nooit++; else t[u.stand]++; }
  const stand: Stand | 'nooit' = t.fout ? 'fout' : t['let-op'] ? 'let-op' : t.onbekend && !t.ok ? 'onbekend' : t.ok ? 'ok' : t.nooit === ids.length ? 'nooit' : 'onbekend';
  return { ...t, stand, totaal: ids.length };
}

/** Audit 19.10.2026 (A9): de kop van «Потребує уваги» telt alleen wat NU niet ok is — precies fout + let-op + onbekend van totaal() —
 *  en noemt «nещодавно відновлено» apart; zo staat er nooit «Увага 0» naast vijf kaarten. */
export function aandachtTellers(lijst: readonly AandachtItem[]) {
  let nu = 0, hersteld = 0;
  for (const a of lijst) { if (a.reden === 'hersteld') hersteld++; else nu++; }
  return { nu, hersteld };
}

/** Eerlijke leeftijdstekst: «щойно», «5 хв тому». */
export function leeftijd(ms: number, nu: number, lang: 'uk' | 'nl'): string {
  if (!ms) return lang === 'uk' ? 'ніколи' : 'nooit';
  const s = Math.max(0, Math.round((nu - ms) / 1000));
  const uk = lang === 'uk';
  if (s < 10) return uk ? 'щойно' : 'zojuist';
  if (s < 60) return uk ? `${s} с тому` : `${s} s geleden`;
  const m = Math.round(s / 60);
  if (m < 60) return uk ? `${m} хв тому` : `${m} min geleden`;
  const h = Math.round(m / 60);
  if (h < 48) return uk ? `${h} год тому` : `${h} u geleden`;
  const d = Math.round(h / 24);
  return uk ? `${d} дн. тому` : `${d} d geleden`;
}
