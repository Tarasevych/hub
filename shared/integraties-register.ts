// UI-013 (29.10.2026) — machineleesbaar register van ALLE posities uit shared/integraties-catalogus.ts (160).
// Etappe A (audit): per positie staat hier wat er in de actuele code werkelijk bestaat, met bewijsbestanden (een test
// controleert dat elk bewijsbestand echt bestaat), welke officiële koppelwijze er is, wat ervoor nodig is, welke dienst van
// Mijn Ruimte haar gebruikt, wat nog te bouwen is en welke beperking van de aanbieder vaststaat.
// Etappe B (model): `groepVan()` bepaalt de groep van een kaart uit ECHTE gegevens (levende toestand van de server +
// register), nooit uit een vast label. «Підключені» alleen bij een gelezen koppeling; fout → «Потребують уваги».
// De catalogus zelf (status klaar/instellen/binnenkort) blijft ongewijzigd: de oude weergave gedraagt zich dus precies als voorheen.
import { INTEGRATIES, type Integratie, type IntegratieCategorie } from './integraties-catalogus';

type T = readonly [uk: string, nl: string];
/** Wat de code nu kan. werkend = volledige stroom elders op de site (koppelen, controleren, ontkoppelen); basis = adapter of
 *  opslag bestaat maar configuratie/sleutels van de aanbieder ontbreken; geen = er is niets. */
export type Uitvoering = 'werkend' | 'basis' | 'geen';
export type DoelDienst = 'mail' | 'cloud' | 'foto' | 'agenda' | 'ai' | 'huis' | 'github' | 'admin' | 'api' | 'geen';
export interface RegisterRij {
  id: string;
  uitvoering: Uitvoering;
  /** bestanden in de repo die de uitvoering bewijzen (leeg bij «geen») */
  bewijs: readonly string[];
  /** officiële koppelwijze bij de aanbieder (feitelijk, technisch) */
  officieel: string;
  doelDienst: DoelDienst;
  /** pagina waar de werkende stroom staat (dienst/tab), alleen bij werkend/basis */
  pagina?: { dienst: 'mail' | 'cloud' | 'huis' | 'api' | 'mcp' | 'github' | 'admin' | 'hub'; tab: string };
  vereist: T;
  operaties: T;
  nogTeDoen: T;
  beperking?: T;
  /** UI-013 fase 2: eigen controle-adapter (backend/verbinding-adapters), alleen controleren — nog geen opslag van de koppeling */
  adapter?: 'webdav' | 's3' | 'mqtt';
  /** 1 = eerst (infrastructuur + officiële interface aanwezig), 3 = later / afhankelijk van derden */
  prioriteit: 1 | 2 | 3;
}

const DOEL: Record<IntegratieCategorie, DoelDienst> = {
  mail: 'mail', agenda: 'agenda', opslag: 'cloud', communicatie: 'api', ai: 'ai', code: 'github', cicd: 'github', cloud: 'api', database: 'api',
  analyse: 'api', crm: 'api', betaling: 'api', sociaal: 'foto', smarthome: 'huis', beveiliging: 'admin', documenten: 'cloud', projecten: 'api',
  automatisering: 'api', support: 'api', media: 'foto', webshop: 'api',
};
const PRIO: Partial<Record<IntegratieCategorie, 1 | 2 | 3>> = { mail: 1, agenda: 1, opslag: 1, smarthome: 2, ai: 2, code: 2, communicatie: 2, beveiliging: 2 };
const OFFICIEEL_STANDAARD: Record<string, string> = { oauth: 'OAuth 2.0 (+PKCE)', apikey: 'API-sleutel', webhook: 'Webhook', mcp: 'MCP', handmatig: 'Handmatig / standaardprotocol', scim: 'SCIM 2.0' };

const W = (r: Omit<RegisterRij, 'uitvoering'>): Omit<RegisterRij, 'id'> & { id: string } => ({ uitvoering: 'werkend', ...r });
const B = (r: Omit<RegisterRij, 'uitvoering'>): RegisterRij => ({ uitvoering: 'basis', ...r });

const IMAP_BEWIJS = ['backend/mail-imap.ts', 'shared/mail-aanbieders.ts', 'src/mail/MailKoppelVenster.tsx'] as const;
const M4_BEWIJS = ['backend/cloud-verbinding-m4-providers.ts', 'backend/cloud-verbinding-m4-routes.ts', 'shared/cloud-vnext-model.ts'] as const;
const CALDAV_BEWIJS = ['backend/agenda-caldav.ts', 'backend/agenda-ics.ts'] as const;

/** Expliciete bevindingen uit de audit (code gelezen op 29.10.2026, basis 20261029-193103). */
const BEVINDINGEN: RegisterRij[] = [
  // Google (één canonieke grant, backend/google-suite-inrichting.ts)
  W({ id: 'gmail', bewijs: ['backend/google-suite-inrichting.ts'], officieel: 'Google OAuth 2.0 + Gmail API', doelDienst: 'mail', pagina: { dienst: 'mail', tab: 'accounts' }, vereist: ['Google-акаунт і згода на доступ до пошти.', 'Google-account en toestemming voor mail.'], operaties: ['Читання, пошук, чернетки.', 'Lezen, zoeken, concepten.'], nogTeDoen: ['—', '—'], prioriteit: 1 }),
  W({ id: 'google-calendar', bewijs: ['backend/google-suite-inrichting.ts'], officieel: 'Google OAuth 2.0 + Calendar API', doelDienst: 'agenda', pagina: { dienst: 'cloud', tab: 'calendar' }, vereist: ['Google-акаунт і згода на календар.', 'Google-account en toestemming voor agenda.'], operaties: ['Синхронізація подій в обидва боки.', 'Afspraken in twee richtingen synchroniseren.'], nogTeDoen: ['—', '—'], prioriteit: 1 }),
  W({ id: 'google-drive', bewijs: ['backend/google-suite-inrichting.ts'], officieel: 'Google OAuth 2.0 + Drive API', doelDienst: 'cloud', pagina: { dienst: 'cloud', tab: 'accounts' }, vereist: ['Google-акаунт і згода на Диск.', 'Google-account en toestemming voor Drive.'], operaties: ['Перегляд і пошук файлів, зміни кожні 5 хв.', 'Bestanden bekijken en zoeken, wijzigingen elke 5 min.'], nogTeDoen: ['—', '—'], prioriteit: 1 }),
  W({ id: 'google-photos', bewijs: ['backend/google-suite-inrichting.ts'], officieel: 'Google Photos Picker API', doelDienst: 'foto', pagina: { dienst: 'cloud', tab: 'photos' }, vereist: ['Google-акаунт; фото вибираєте самі.', 'Google-account; u kiest de foto’s zelf.'], operaties: ['Імпорт вибраних фото.', 'Gekozen foto’s importeren.'], nogTeDoen: ['—', '—'], beperking: ['Google дозволяє лише вибір фото вручну (Picker), а не всю бібліотеку.', 'Google staat alleen handmatige keuze toe (Picker), niet de hele bibliotheek.'], prioriteit: 1 }),
  // IMAP-stroom bestaat al op de mailpagina; de catalogus noemde haar «Скоро».
  W({ id: 'imap', bewijs: IMAP_BEWIJS, officieel: 'IMAP4rev2 (RFC 9051) + SMTP', doelDienst: 'mail', pagina: { dienst: 'mail', tab: 'accounts' }, vereist: ['Адреса сервера й пароль застосунку.', 'Serveradres en app-wachtwoord.'], operaties: ['Вхід IMAP і SMTP перевіряється перед збереженням; пароль зашифровано.', 'IMAP- en SMTP-aanmelding worden gecontroleerd vóór opslaan; wachtwoord versleuteld.'], nogTeDoen: ['Показати стан у глобальному каталозі (готово в UI-013, прапорець).', 'Status in de globale catalogus tonen (gedaan in UI-013, vlag).'], prioriteit: 1 }),
  W({ id: 'icloud-mail', bewijs: IMAP_BEWIJS, officieel: 'IMAP/SMTP met app-specifiek wachtwoord', doelDienst: 'mail', pagina: { dienst: 'mail', tab: 'accounts' }, vereist: ['Пароль застосунку Apple (appleid.apple.com).', 'App-specifiek wachtwoord van Apple (appleid.apple.com).'], operaties: ['Як IMAP: читання й надсилання.', 'Zoals IMAP: lezen en versturen.'], nogTeDoen: ['—', '—'], beperking: ['Apple не має OAuth для пошти.', 'Apple heeft geen OAuth voor mail.'], prioriteit: 1 }),
  W({ id: 'yahoo-mail', bewijs: IMAP_BEWIJS, officieel: 'IMAP/SMTP met app-wachtwoord (OAuth alleen na partnerakkoord)', doelDienst: 'mail', pagina: { dienst: 'mail', tab: 'accounts' }, vereist: ['Пароль застосунку Yahoo.', 'App-wachtwoord van Yahoo.'], operaties: ['Як IMAP.', 'Zoals IMAP.'], nogTeDoen: ['OAuth Yahoo потребує угоди з Yahoo.', 'Yahoo-OAuth vereist een akkoord met Yahoo.'], prioriteit: 1 }),
  B({ id: 'proton-mail', bewijs: IMAP_BEWIJS, officieel: 'Proton Mail Bridge (lokale IMAP/SMTP)', doelDienst: 'mail', pagina: { dienst: 'mail', tab: 'accounts' }, vereist: ['Платний план Proton і Proton Bridge на комп’ютері, доступному серверу.', 'Betaald Proton-plan en Proton Bridge op een computer die de server kan bereiken.'], operaties: ['Через Bridge — як IMAP.', 'Via Bridge — zoals IMAP.'], nogTeDoen: ['Інструкція для Bridge у майстрі.', 'Uitleg voor Bridge in de wizard.'], beperking: ['Proton не має публічного API пошти.', 'Proton heeft geen openbare mail-API.'], prioriteit: 2 }),
  B({ id: 'outlook-mail', bewijs: ['backend/mail-imap.ts', 'shared/mail-aanbieders.ts'], officieel: 'Microsoft Graph (OAuth) of IMAP met OAuth2', doelDienst: 'mail', pagina: { dienst: 'mail', tab: 'accounts' }, vereist: ['Реєстрація застосунку Microsoft (MICROSOFT_GRAPH_* у сховищі ключів).', 'App-registratie bij Microsoft (MICROSOFT_GRAPH_* in de sleutelkluis).'], operaties: ['Основа провайдера є; без ключів Microsoft не працює.', 'Aanbiederbasis bestaat; zonder Microsoft-sleutels werkt het niet.'], nogTeDoen: ['Потребує ключів власника (реєстрація застосунку Microsoft). Без них справжню перевірку Graph не зробити; нагадану імітацію сервера не вважаємо доказом.', 'Vereist sleutels van de eigenaar (Microsoft-app-registratie). Zonder die is een echte Graph-controle niet mogelijk; een nagebootste server geldt niet als bewijs.'], beperking: ['Microsoft вимкнув звичайні паролі для IMAP.', 'Microsoft heeft gewone wachtwoorden voor IMAP uitgezet.'], prioriteit: 1 }),
  B({ id: 'fastmail', bewijs: ['backend/agenda-caldav.ts'], officieel: 'IMAP/SMTP + CalDAV met app-wachtwoord; JMAP', doelDienst: 'mail', pagina: { dienst: 'mail', tab: 'accounts' }, vereist: ['Пароль застосунку Fastmail.', 'App-wachtwoord van Fastmail.'], operaties: ['Календар через CalDAV (лише читання).', 'Agenda via CalDAV (alleen lezen).'], nogTeDoen: ['Додати Fastmail до списку поштових провайдерів IMAP.', 'Fastmail toevoegen aan de IMAP-aanbieders.'], prioriteit: 1 }),
  B({ id: 'apple-calendar', bewijs: CALDAV_BEWIJS, officieel: 'CalDAV (RFC 4791) met app-wachtwoord', doelDienst: 'agenda', pagina: { dienst: 'cloud', tab: 'calendar' }, vereist: ['Пароль застосунку Apple.', 'App-specifiek wachtwoord van Apple.'], operaties: ['Читання подій через CalDAV.', 'Afspraken lezen via CalDAV.'], nogTeDoen: ['Запис (PUT/DELETE з If-Match).', 'Schrijven (PUT/DELETE met If-Match).'], prioriteit: 1 }),
  B({ id: 'outlook-calendar', bewijs: ['backend/agenda-ics.ts'], officieel: 'Microsoft Graph Calendar (OAuth) of ICS-publicatie', doelDienst: 'agenda', pagina: { dienst: 'cloud', tab: 'calendar' }, vereist: ['Опублікована ICS-адреса або ключі Microsoft.', 'Gepubliceerd ICS-adres of Microsoft-sleutels.'], operaties: ['Підписка ICS (лише читання).', 'ICS-abonnement (alleen lezen).'], nogTeDoen: ['Graph-календар після ключів Microsoft.', 'Graph-agenda na Microsoft-sleutels.'], prioriteit: 1 }),
  B({ id: 'onedrive', bewijs: M4_BEWIJS, officieel: 'Microsoft Graph Files (OAuth + PKCE)', doelDienst: 'cloud', pagina: { dienst: 'cloud', tab: 'accounts' }, vereist: ['Ключі застосунку Microsoft.', 'App-sleutels van Microsoft.'], operaties: ['Адаптер читання є; потрібні ключі.', 'Leesadapter bestaat; sleutels nodig.'], nogTeDoen: ['Ключі від власника, потім справжня перевірка.', 'Sleutels van de eigenaar, daarna echte controle.'], prioriteit: 1 }),
  B({ id: 'dropbox', bewijs: M4_BEWIJS, officieel: 'Dropbox API v2 (OAuth + PKCE)', doelDienst: 'cloud', pagina: { dienst: 'cloud', tab: 'accounts' }, vereist: ['Ключі застосунку Dropbox.', 'App-sleutels van Dropbox.'], operaties: ['Адаптер читання є; потрібні ключі.', 'Leesadapter bestaat; sleutels nodig.'], nogTeDoen: ['Ключі від власника.', 'Sleutels van de eigenaar.'], prioriteit: 1 }),
  B({ id: 'box', bewijs: M4_BEWIJS, officieel: 'Box API (OAuth 2.0)', doelDienst: 'cloud', pagina: { dienst: 'cloud', tab: 'accounts' }, vereist: ['Ключі застосунку Box.', 'App-sleutels van Box.'], operaties: ['Адаптер читання є; потрібні ключі.', 'Leesadapter bestaat; sleutels nodig.'], nogTeDoen: ['Ключі від власника.', 'Sleutels van de eigenaar.'], prioriteit: 1 }),
  B({ id: 'nextcloud', adapter: 'webdav', bewijs: ['backend/cloud-integratie-routes.ts', 'backend/cloud-overdracht-m3-providers.ts', 'backend/verbinding-adapters/webdav.ts'], officieel: 'WebDAV + Login Flow v2 (app-wachtwoord)', doelDienst: 'cloud', pagina: { dienst: 'cloud', tab: 'accounts' }, vereist: ['Адреса вашого Nextcloud і пароль застосунку.', 'Adres van uw Nextcloud en app-wachtwoord.'], operaties: ['WebDAV-основа для перенесення файлів.', 'WebDAV-basis voor bestandsoverdracht.'], nogTeDoen: ['Перевірку PROPFIND зроблено й протестовано на локальному WebDAV. Бракує: збереження підключення у сховищі ключів і показу файлів у «Хмарі».', 'PROPFIND-controle gebouwd en getest tegen een lokale WebDAV-server. Ontbreekt: koppeling bewaren in de kluis en bestanden tonen in «Cloud».'], prioriteit: 1 }),
  B({ id: 's3', adapter: 's3', bewijs: ['backend/cloud-integratie-routes.ts', 'backend/cloud-m9-xml.ts', 'backend/verbinding-adapters/s3.ts'], officieel: 'S3 API (Signature V4, toegangssleutel)', doelDienst: 'cloud', pagina: { dienst: 'cloud', tab: 'accounts' }, vereist: ['Endpoint, bucket і ключ доступу.', 'Endpoint, bucket en toegangssleutel.'], operaties: ['Основа S3 у хмарному сховищі.', 'S3-basis in de cloudopslag.'], nogTeDoen: ['Перевірку ListObjectsV2 (SigV4) зроблено й протестовано на локальному S3 (moto). Бракує: збереження у сховищі ключів і показу в «Хмарі».', 'ListObjectsV2-controle (SigV4) gebouwd en getest tegen een lokale S3 (moto). Ontbreekt: bewaren in de kluis en tonen in «Cloud».'], prioriteit: 1 }),
  // Sleutels in de kluis (backend/api-platform-verbindingen.ts)
  W({ id: 'telegram', bewijs: ['backend/api-platform-verbindingen.ts'], officieel: 'Telegram Bot API (token)', doelDienst: 'api', pagina: { dienst: 'api', tab: 'vault' }, vereist: ['Токен бота від @BotFather.', 'Bot-token van @BotFather.'], operaties: ['Сповіщення через бота.', 'Meldingen via de bot.'], nogTeDoen: ['—', '—'], prioriteit: 2 }),
  W({ id: 'anthropic-api', bewijs: ['backend/api-platform-verbindingen.ts'], officieel: 'Anthropic API (sleutel)', doelDienst: 'ai', pagina: { dienst: 'api', tab: 'vault' }, vereist: ['Ключ API Anthropic (платний).', 'Anthropic-API-sleutel (betaald).'], operaties: ['Виклики моделі з серверу.', 'Modelaanroepen vanaf de server.'], nogTeDoen: ['—', '—'], prioriteit: 2 }),
  W({ id: 'home-assistant', bewijs: ['backend/api-platform-verbindingen.ts', 'backend/huis-adapter-thuis-assistent.ts'], officieel: 'Home Assistant REST/WebSocket (long-lived token)', doelDienst: 'huis', pagina: { dienst: 'api', tab: 'vault' }, vereist: ['Адреса Home Assistant і довготривалий токен.', 'Adres van Home Assistant en long-lived token.'], operaties: ['Пристрої й стани в «Розумному домі».', 'Apparaten en standen in «Slim huis».'], nogTeDoen: ['—', '—'], prioriteit: 2 }),
  W({ id: 'github', bewijs: ['backend/api-platform-verbindingen.ts'], officieel: 'GitHub OAuth App / fine-grained token', doelDienst: 'github', pagina: { dienst: 'github', tab: 'accounts' }, vereist: ['GitHub-акаунт.', 'GitHub-account.'], operaties: ['Репозиторії й задачі.', 'Repositories en issues.'], nogTeDoen: ['—', '—'], prioriteit: 2 }),
  B({ id: 'mqtt', adapter: 'mqtt', bewijs: ['backend/verbinding-adapters/mqtt.ts'], officieel: 'MQTT 3.1.1 / 5 (TLS, gebruiker+wachtwoord)', doelDienst: 'huis', pagina: { dienst: 'huis', tab: 'integrations' }, vereist: ['Адреса брокера MQTT (TLS) і логін.', 'Adres van de MQTT-broker (TLS) en aanmelding.'], operaties: ['Перевірка входу до брокера (CONNECT/CONNACK), без надсилання повідомлень.', 'Aanmeldcontrole bij de broker (CONNECT/CONNACK), zonder berichten te versturen.'], nogTeDoen: ['Збереження підключення, підписка на теми пристроїв у «Розумному домі». Брокер у домашній мережі потребує окремого дозволу адреси.', 'Koppeling bewaren, abonneren op apparaattopics in «Slim huis». Een broker in het thuisnetwerk vereist een aparte adrestoelating.'], prioriteit: 2 }),
  B({ id: 'zigbee2mqtt', adapter: 'mqtt', bewijs: ['backend/verbinding-adapters/mqtt.ts'], officieel: 'Via de MQTT-broker van Zigbee2MQTT', doelDienst: 'huis', pagina: { dienst: 'huis', tab: 'integrations' }, vereist: ['Zigbee-адаптер, Zigbee2MQTT і брокер MQTT.', 'Zigbee-adapter, Zigbee2MQTT en een MQTT-broker.'], operaties: ['Перевірка брокера, як у MQTT.', 'Brokercontrole, zoals bij MQTT.'], nogTeDoen: ['Читання тем zigbee2mqtt/# і показ пристроїв.', 'Topics zigbee2mqtt/# lezen en apparaten tonen.'], beperking: ['Потрібне обладнання Zigbee.', 'Zigbee-hardware nodig.'], prioriteit: 2 }),
];

const AGENT_BEWIJS = ['backend/connector-v2-opslag.ts', 'shared/connector-v2/agenten.ts'];
for (const id of ['claude', 'chatgpt', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'mcp-server']) {
  BEVINDINGEN.push(W({ id, bewijs: AGENT_BEWIJS, officieel: 'MCP (Model Context Protocol) + OAuth', doelDienst: 'ai', pagina: { dienst: 'mcp', tab: 'connect' }, vereist: ['Акаунт у цьому ШІ-сервісі; доступи видаєте окремо.', 'Account bij deze AI-dienst; rechten geeft u apart.'], operaties: ['Агент отримує лише ті права, які ви дозволили.', 'De agent krijgt alleen de rechten die u toestaat.'], nogTeDoen: ['—', '—'], prioriteit: 2 }));
}
for (const id of ['google-signin', 'rest-api', 'oauth-clients']) {
  BEVINDINGEN.push(W({ id, bewijs: ['backend/index.ts'], officieel: id === 'google-signin' ? 'OpenID Connect' : 'REST + OAuth-clients van deze site', doelDienst: id === 'google-signin' ? 'admin' : 'api', vereist: ['Права адміністратора.', 'Beheerdersrechten.'], operaties: ['Налаштовується в адмін-панелі.', 'In te stellen in het beheer.'], nogTeDoen: ['—', '—'], prioriteit: 2 }));
}
for (const id of ['entra', 'scim']) {
  BEVINDINGEN.push(B({ id, bewijs: ['backend/index.ts'], officieel: id === 'entra' ? 'Microsoft Graph (directory)' : 'SCIM 2.0', doelDienst: 'admin', vereist: ['Ключі каталогу у сховищі.', 'Directorysleutels in de kluis.'], operaties: ['Збереження налаштувань каталогу.', 'Directory-instellingen bewaren.'], nogTeDoen: ['Справжня синхронізація користувачів.', 'Echte gebruikerssynchronisatie.'], prioriteit: 2 }));
}
// Bekende beperkingen van aanbieders zonder publieke interface.
const ONMOGELIJK: Record<string, T> = {
  'icloud-drive': ['Apple не має публічного API для iCloud Drive.', 'Apple heeft geen openbare API voor iCloud Drive.'],
  whatsapp: ['Потрібен WhatsApp Business API (Meta, платно, перевірка компанії).', 'WhatsApp Business API nodig (Meta, betaald, bedrijfsverificatie).'],
  signal: ['Signal не має офіційного API для сторонніх застосунків.', 'Signal heeft geen officiële API voor derde apps.'],
  instagram: ['Meta дозволяє API лише для бізнес-акаунтів після перевірки застосунку.', 'Meta staat de API alleen toe voor bedrijfsaccounts na app-review.'],
  facebook: ['Потрібна перевірка застосунку Meta.', 'App-review door Meta nodig.'],
  'x-twitter': ['API X платний.', 'De X-API is betaald.'],
  homekit: ['HomeKit доступний лише на пристроях Apple (без хмарного API).', 'HomeKit werkt alleen op Apple-apparaten (geen cloud-API).'],
  tiktok: ['Потрібна перевірка застосунку TikTok.', 'App-review door TikTok nodig.'],
};

const standaard = (i: Integratie): RegisterRij => {
  const methode = i.methoden[0] || 'handmatig';
  return {
    id: i.id, uitvoering: 'geen', bewijs: [], officieel: i.methoden.map((m) => OFFICIEEL_STANDAARD[m]).join(' / '), doelDienst: DOEL[i.cat],
    vereist: methode === 'oauth' ? ['Реєстрація застосунку в сервісі (ключі OAuth) і згода власника.', 'App-registratie bij de dienst (OAuth-sleutels) en toestemming van de eigenaar.']
      : methode === 'apikey' ? ['Ключ API від сервісу (зберігається у сховищі ключів).', 'API-sleutel van de dienst (bewaard in de sleutelkluis).']
      : methode === 'mcp' ? ['MCP-сервер сервісу.', 'MCP-server van de dienst.'] : ['Дані доступу від сервісу.', 'Toegangsgegevens van de dienst.'],
    operaties: ['Поки що нічого: підключення ще не створено.', 'Nog niets: de koppeling is nog niet gebouwd.'],
    nogTeDoen: ['Серверний адаптер, перевірка підключення, відключення, показ у цільовому сервісі, тести.', 'Serveradapter, verbindingscontrole, ontkoppelen, tonen in de doeldienst, tests.'],
    ...(ONMOGELIJK[i.id] ? { beperking: ONMOGELIJK[i.id] } : {}),
    prioriteit: ONMOGELIJK[i.id] ? 3 : PRIO[i.cat] ?? 3,
  };
};

const PER_ID = new Map(BEVINDINGEN.map((r) => [r.id, r]));
export const REGISTER: readonly RegisterRij[] = Object.freeze(INTEGRATIES.map((i) => Object.freeze(PER_ID.get(i.id) ?? standaard(i))));
export const registerVan = (id: string): RegisterRij | undefined => REGISTER.find((r) => r.id === id);

// ——— Etappe B: groep van een kaart uit echte gegevens ———
export type Groep = 'verbonden' | 'beschikbaar' | 'aandacht' | 'instellen' | 'ontwikkeling';
export const GROEPEN: ReadonlyArray<{ id: Groep; uk: string; nl: string; standaardOpen: boolean }> = [
  { id: 'aandacht', uk: 'Потребують уваги', nl: 'Vragen aandacht', standaardOpen: true },
  { id: 'verbonden', uk: 'Підключені', nl: 'Gekoppeld', standaardOpen: true },
  { id: 'beschikbaar', uk: 'Можна підключити', nl: 'Klaar om te koppelen', standaardOpen: true },
  { id: 'instellen', uk: 'Потребують налаштування', nl: 'Instellen nodig', standaardOpen: true },
  { id: 'ontwikkeling', uk: 'У розробці', nl: 'In ontwikkeling', standaardOpen: false },
];
/** Levende toestand zoals de pagina die van de server las (null = de site kan haar niet lezen). */
export type LevendeStand = 'verbonden' | 'ingesteld' | 'niet' | 'fout' | null;

export function groepVan(i: Integratie, levend: LevendeStand, r: RegisterRij | undefined = registerVan(i.id)): Groep {
  if (levend === 'fout') return 'aandacht';
  if (levend === 'verbonden') return 'verbonden';
  if (levend === 'ingesteld') return 'instellen';
  if (i.status === 'klaar') return 'beschikbaar';
  if (r?.uitvoering === 'werkend' && r.pagina) return 'beschikbaar';
  if (i.status === 'instellen' || r?.uitvoering === 'basis') return 'instellen';
  return 'ontwikkeling';
}
/** Hoofdactie van een kaart: geen permanente «Скоро» meer. */
export type Actie = 'koppelen' | 'beheren' | 'herstellen' | 'instellen' | 'plan';
export function actieVan(g: Groep): Actie {
  return g === 'verbonden' ? 'beheren' : g === 'aandacht' ? 'herstellen' : g === 'beschikbaar' ? 'koppelen' : g === 'instellen' ? 'instellen' : 'plan';
}

/** Oekraïense weergave van `officieel` (technische namen blijven gelijk; alleen de Nederlandse woorden worden vertaald). */
const OFFICIEEL_UK: Readonly<Record<string, string>> = {
  'IMAP/SMTP met app-specifiek wachtwoord': 'IMAP/SMTP з окремим паролем застосунку',
  'IMAP/SMTP met app-wachtwoord (OAuth alleen na partnerakkoord)': 'IMAP/SMTP з паролем застосунку (OAuth лише після угоди з партнером)',
  'Proton Mail Bridge (lokale IMAP/SMTP)': 'Proton Mail Bridge (локальний IMAP/SMTP)',
  'Microsoft Graph (OAuth) of IMAP met OAuth2': 'Microsoft Graph (OAuth) або IMAP з OAuth2',
  'IMAP/SMTP + CalDAV met app-wachtwoord; JMAP': 'IMAP/SMTP + CalDAV з паролем застосунку; JMAP',
  'CalDAV (RFC 4791) met app-wachtwoord': 'CalDAV (RFC 4791) з паролем застосунку',
  'Microsoft Graph Calendar (OAuth) of ICS-publicatie': 'Microsoft Graph Calendar (OAuth) або публікація ICS',
  'WebDAV + Login Flow v2 (app-wachtwoord)': 'WebDAV + Login Flow v2 (пароль застосунку)',
  'S3 API (Signature V4, toegangssleutel)': 'S3 API (Signature V4, ключ доступу)',
  'Anthropic API (sleutel)': 'Anthropic API (ключ)',
  'Home Assistant REST/WebSocket (long-lived token)': 'Home Assistant REST/WebSocket (довготривалий токен)',
  'MQTT 3.1.1 / 5 (TLS, gebruiker+wachtwoord)': 'MQTT 3.1.1 / 5 (TLS, користувач і пароль)',
  'Via de MQTT-broker van Zigbee2MQTT': 'Через MQTT-брокер Zigbee2MQTT',
  'REST + OAuth-clients van deze site': 'REST + OAuth-клієнти цього сайту',
  'Microsoft Graph (directory)': 'Microsoft Graph (каталог)',
  // delen van OFFICIEEL_STANDAARD (samengevoegd met « / »)
  'API-sleutel': 'API-ключ',
  'Handmatig': 'Вручну',
  'standaardprotocol': 'стандартний протокол',
};
/** Koppelwijze in de taal van het scherm (uk/nl). */
export function officieelTekst(r: Pick<RegisterRij, 'officieel'> | null | undefined, lang: 'uk' | 'nl'): string {
  if (!r) return '';
  if (lang !== 'uk') return r.officieel;
  return OFFICIEEL_UK[r.officieel] ?? r.officieel.split(' / ').map((d) => OFFICIEEL_UK[d] ?? d).join(' / ');
}
