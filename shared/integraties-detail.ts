// Details bij de integratiekaarten (admin.* /mappen): wat de koppeling mag, hoe je haar aanzet, waar de documentatie staat.
//
// Eerlijkheid: voor «klaar»/«instellen» staan hier de ECHTE rechten en stappen van de site (Google-scopes uit backend/google-*.ts,
// MCP-adressen uit shared/connector-v2). Voor «binnenkort» bestaat er geen koppeling: dan staat er geen scope en geen stap, alleen
// de uitleg dat de koppeling nog niet bestaat en dat de ster een wens markeert. Geen verzonnen rechten.
import { integratie, type Integratie } from './integraties-catalogus';

type Tekst = readonly [uk: string, nl: string];
export interface IntegratieDetail {
  /** rechten die de koppeling vraagt, in gewone taal (technische naam tussen haakjes waar het een OAuth-scope is) */
  rechten: readonly Tekst[];
  /** stappen om te koppelen, in volgorde */
  stappen: readonly Tekst[];
  /** officiële documentatie van de dienst (https) */
  docs: string;
  /** waar de sleutel of het token wordt bewaard (alleen voor sleutel-koppelingen) */
  kluis?: boolean;
  /** kan de gebruiker de koppeling vanaf de site loskoppelen via «Відключити»? (alleen sleutels in de kluis) */
  loskoppelbaar?: boolean;
}

/** Populaire diensten (voor het filter «Популярні»): een redactionele keuze, geen statistiek. */
export const POPULAIR: ReadonlySet<string> = new Set([
  'gmail', 'outlook-mail', 'google-calendar', 'zoom', 'google-drive', 'onedrive', 'dropbox', 'slack', 'telegram', 'discord', 'whatsapp',
  'claude', 'chatgpt', 'gemini', 'github', 'gitlab', 'notion', 'trello', 'jira', 'asana', 'stripe', 'paypal', 'shopify', 'hubspot',
  'zapier', 'make', 'n8n', 'cloudflare', 'aws', 'home-assistant', 'openai-api', 'microsoft-teams', 'wordpress', 'mailchimp',
]);
/** Recent toegevoegde koppelingen (filter «Нові»): de zes AI-agenten van de v2-connector en de eigen MCP-client (oktober 2026). */
export const NIEUW: ReadonlySet<string> = new Set(['claude', 'chatgpt', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'mcp-server']);

const MCP_STAPPEN = (naam: string): readonly Tekst[] => [
  [`Відкрийте «Технічні підключення» → «Підключити» і скопіюйте адресу ${naam}.`, `Open «Technische verbindingen» → «Verbinden» en kopieer het adres van ${naam}.`],
  [`Додайте її в ${naam} як власний MCP-конектор і увійдіть.`, `Voeg het toe in ${naam} als eigen MCP-connector en meld u aan.`],
  ['На сторінці сайту підтвердіть, які права, простір (приватний чи технічний) і який термін дії ви даєте.', 'Bevestig op de pagina van de site welke rechten, welke ruimte (privé of technisch) en welke looptijd u geeft.'],
];
const MCP_RECHTEN: readonly Tekst[] = [
  ['Лише те, що ви обрали у вікні дозволів (читання, запис, дії), окремо для приватного й технічного простору.', 'Alleen wat u kiest in het toestemmingsvenster (lezen, schrijven, acties), apart voor de privé- en technische ruimte.'],
  ['Кожну дію агента видно в журналі; доступ можна вимкнути в будь-який момент.', 'Elke actie van de agent staat in het logboek; de toegang kunt u op elk moment uitzetten.'],
];
const KLUIS_STAPPEN = (wat: string, waar: string): readonly Tekst[] => [
  [`Створіть ${wat} у сервісі (${waar}).`, `Maak ${wat} aan bij de dienst (${waar}).`],
  ['Відкрийте «Сховище секретів» і збережіть значення — воно шифрується й не показується повторно без підтвердження.', 'Open de «Geheimenkluis» en bewaar de waarde: ze wordt versleuteld en niet opnieuw getoond zonder bevestiging.'],
  ['Поверніться сюди й натисніть «Перевірити стан».', 'Kom hier terug en kies «Status controleren».'],
];
const GOOGLE_STAPPEN: readonly Tekst[] = [
  ['Відкрийте відповідну сторінку й натисніть «Підключити Google».', 'Open de betreffende pagina en kies «Google koppelen».'],
  ['Увійдіть у Google і підтвердьте лише ті дозволи, що перелічені тут.', 'Meld u aan bij Google en bevestig alleen de hier genoemde toestemmingen.'],
];

const DETAILS: Record<string, IntegratieDetail> = {
  'gmail': { rechten: [['Читання, пошук і чернетки (gmail.readonly, gmail.modify)', 'Lezen, zoeken en concepten (gmail.readonly, gmail.modify)'], ['Надсилання листів лише за вашою командою (gmail.send)', 'Mail versturen alleen op uw opdracht (gmail.send)'], ['Мітки й базові налаштування (gmail.labels, gmail.settings.basic)', 'Labels en basisinstellingen (gmail.labels, gmail.settings.basic)']], stappen: GOOGLE_STAPPEN, docs: 'https://developers.google.com/gmail/api' },
  'google-calendar': { rechten: [['Читання календарів і подій (calendar.readonly)', 'Agenda’s en afspraken lezen (calendar.readonly)'], ['Створення, зміна, перенесення й видалення подій, учасники та відповіді на запрошення (calendar.events)', 'Afspraken aanmaken, wijzigen, verplaatsen en verwijderen, gasten en antwoorden op uitnodigingen (calendar.events)']], stappen: GOOGLE_STAPPEN, docs: 'https://developers.google.com/calendar/api' },
  'google-drive': { rechten: [['Файли й теки Диска (drive)', 'Bestanden en mappen van Drive (drive)']], stappen: GOOGLE_STAPPEN, docs: 'https://developers.google.com/drive/api' },
  'google-photos': { rechten: [['Лише ті фото, які ви самі вибираєте у вікні Google (photospicker.mediaitems.readonly)', 'Alleen de foto’s die u zelf kiest in het Google-venster (photospicker.mediaitems.readonly)']], stappen: GOOGLE_STAPPEN, docs: 'https://developers.google.com/photos' },
  'telegram': { rechten: [['Бот надсилає сповіщення від сайту в чат, який ви вкажете', 'De bot stuurt meldingen van de site naar de chat die u opgeeft']], stappen: KLUIS_STAPPEN('токен бота', 'через @BotFather'), docs: 'https://core.telegram.org/bots/api', kluis: true, loskoppelbaar: true },
  'anthropic-api': { rechten: [['Запити до API Anthropic від вашого імені в чаті ai.tarasevych.com; витрати йдуть на ваш рахунок', 'Verzoeken aan de Anthropic-API namens u in de chat op ai.tarasevych.com; kosten komen op uw rekening']], stappen: KLUIS_STAPPEN('ключ API', 'console.anthropic.com'), docs: 'https://docs.anthropic.com/en/api', kluis: true, loskoppelbaar: true },
  // Drie wegen (20.10.2026): «Увійти через GitHub» met de OAuth-app van de eigenaar, een GitHub App op gekozen
  // repositories, of een persoonlijke token in de kluis. De exacte waarden voor het eigen domein staan op de koppelkaart.
  'github': { rechten: [['Запитувані області: repo (обов’язкова), read:org і read:project (необов’язкові)', 'Gevraagde scopes: repo (verplicht), read:org en read:project (optioneel)'], ['Через GitHub App — лише ті репозиторії, які ви оберете при встановленні', 'Via een GitHub App: alleen de repositories die u bij het installeren kiest']], stappen: [['Відкрийте картку GitHub → «Способи підключення» і виберіть шлях: OAuth, GitHub App або персональний токен.', 'Open de GitHub-kaart → «Manieren om te koppelen» en kies een weg: OAuth, GitHub App of een persoonlijke token.'], ['Для OAuth чи GitHub App зареєструйте власний застосунок на github.com — картка показує точні Homepage URL і callback URL для вашого домену.', 'Voor OAuth of een GitHub App registreert u uw eigen app op github.com — de kaart toont de exacte Homepage URL en callback URL voor uw domein.'], ['Покладіть client secret або приватний ключ у сховище ключів і натисніть кнопку на картці.', 'Zet het client secret of de persoonlijke sleutel in de sleutelkluis en klik op de knop op de kaart.']], docs: 'https://docs.github.com/rest', kluis: true, loskoppelbaar: true },
  'home-assistant': { rechten: [['Доступ до вашого Home Assistant з правами власника токена', 'Toegang tot uw Home Assistant met de rechten van de eigenaar van het token']], stappen: KLUIS_STAPPEN('Long-lived access token', 'профіль користувача в Home Assistant'), docs: 'https://developers.home-assistant.io/docs/api/rest/', kluis: true, loskoppelbaar: true },
  'mcp-server': { rechten: MCP_RECHTEN, stappen: MCP_STAPPEN('клієнті MCP'), docs: 'https://modelcontextprotocol.io/docs' },
  // 20.10.2026: de OAuth-client zelf (Google Cloud Console / Entra) zet de beheerder in «Майстер підключень» op deze pagina — met
  // de exacte redirect-URI en scopes voor dit domein. Hier alleen wat de GEBRUIKER doet.
  'google-signin': { rechten: [['Профіль і e-mail Google для входу (openid, email, profile)', 'Google-profiel en e-mail om in te loggen (openid, email, profile)'], ['Доступ до пошти надається окремо й явно', 'Toegang tot mail wordt apart en uitdrukkelijk gegeven']], stappen: [['Адміністратор: OAuth-клієнт Google (Client ID, secret, redirect URI) — у вкладці «Майстер підключень» на цій сторінці.', 'Beheerder: de Google OAuth-client (Client ID, secret, redirect-URI) staat in het tabblad «Koppelwizard» op deze pagina.'], ['Відкрийте вкладку «SSO» і перегляньте правила єдиного входу.', 'Open het tabblad «SSO» en bekijk de regels voor eenmalige aanmelding.']], docs: 'https://developers.google.com/identity/protocols/oauth2' },
  'entra': { rechten: [['Тут зберігається лише ідентифікатор орендаря; облікові дані й перевірка підключаються окремо', 'Hier staat alleen de tenant-id; referenties en verificatie worden apart gekoppeld']], stappen: [['Відкрийте «Зовнішні каталоги» на цій сторінці.', 'Open «Externe directory’s» op deze pagina.'], ['Вкажіть ідентифікатор орендаря та збережіть конфігурацію.', 'Vul de tenant-id in en bewaar de configuratie.'], ['Реєстрація застосунку в Microsoft Entra (Outlook через Graph): вкладка «Майстер підключень» показує точний redirect URI, права й серверну команду.', 'App-registratie in Microsoft Entra (Outlook via Graph): het tabblad «Koppelwizard» toont de exacte redirect-URI, rechten en serveropdracht.']], docs: 'https://learn.microsoft.com/graph/overview' },
  'scim': { rechten: [['Приймає створення й зміну користувачів із зовнішнього каталогу', 'Ontvangt het aanmaken en wijzigen van gebruikers uit een externe directory']], stappen: [['Відкрийте «Зовнішні каталоги» на цій сторінці.', 'Open «Externe directory’s» op deze pagina.'], ['Збережіть базову адресу; токен задає сервер.', 'Bewaar de basis-URL; het token stelt de server in.']], docs: 'https://scim.cloud' },
  // A10 (19.10.2026): geen eigen scherm → «binnenkort» zonder verzonnen rechten/stappen (detailVan valt terug op LEEG_*).
  'rest-api': { rechten: [['Кожен токен має власні обмежені права й термін дії', 'Elk token heeft eigen beperkte rechten en een looptijd']], stappen: [['Відкрийте API → Доступ і створіть токен із мінімальними правами.', 'Open API → Toegang en maak een token met minimale rechten.']], docs: 'https://api.tarasevych.com' },
  'oauth-clients': { rechten: [['Застосунки бачать лише ті дозволи, які ви схвалили', 'Apps zien alleen de toestemmingen die u hebt goedgekeurd']], stappen: [['Відкрийте «Додатки та OAuth» і оберіть політику для нових застосунків.', 'Open «Apps en OAuth» en kies het beleid voor nieuwe apps.']], docs: 'https://oauth.net/2/' },
};
for (const slug of ['claude', 'chatgpt', 'grok', 'gemini', 'copilot', 'cursor', 'antigravity', 'autoclaw']) {
  const i = integratie(slug);
  if (i) DETAILS[slug] = { rechten: MCP_RECHTEN, stappen: MCP_STAPPEN(i.naam), docs: i.site };
}

const LEEG_RECHTEN: readonly Tekst[] = [['Поки що немає: це підключення не реалізоване на сайті, тож жодних прав воно не запитує.', 'Nog geen: deze koppeling bestaat nog niet op de site en vraagt dus nergens rechten voor.']];
const LEEG_STAPPEN: readonly Tekst[] = [['Підключення ще не реалізоване — кнопки «Підключити» свідомо немає.', 'Deze koppeling is er nog niet; de knop «Koppelen» ontbreekt bewust.'], ['Позначте сервіс зірочкою — це лише закладка у вашому браузері для вибору.', 'Markeer de dienst met de ster: dat is alleen een bladwijzer in uw browser.']];

export function detailVan(i: Integratie): IntegratieDetail {
  return DETAILS[i.id] ?? { rechten: LEEG_RECHTEN, stappen: LEEG_STAPPEN, docs: i.site };
}
export const heeftEchteKoppeling = (i: Integratie) => i.status !== 'binnenkort';

/** Teksten bij de codes die de server teruggeeft (de server stuurt codes, de browser kiest de taal). `{n}` wordt vervangen door `n`. */
export const CODE_TEKST: Readonly<Record<string, Tekst>> = {
  AGENT_ACTIEF: ['Активних підключень: {n}.', 'Actieve koppelingen: {n}.'],
  AGENT_GEEN: ['У цього облікового запису немає активного підключення.', 'Dit account heeft geen actieve koppeling.'],
  VAULT_FOUT: ['Остання перевірка повідомила про помилку.', 'De laatste controle meldde een fout.'],
  VAULT_INGETROKKEN: ['Відкликано; значення ще може лежати в сховищі.', 'Ingetrokken; de waarde kan nog in de kluis staan.'],
  VAULT_SLEUTEL: ['Ключ є у сховищі. Сайт не перевіряє його в зовнішньому сервісі.', 'Sleutel staat in de kluis. De site controleert niet bij de externe dienst.'],
  IMAP_ACTIEF: ['Підключених скриньок: {n}; вхід перевірено сервером.', 'Gekoppelde mailboxen: {n}; aanmelding door de server gecontroleerd.'],
  IMAP_FOUT: ['Скринька повідомила про помилку входу — відкрийте «Пошта → Акаунти».', 'Een mailbox meldde een aanmeldfout — open «E-mail → Accounts».'],
  VAULT_GEEN: ['У сховищі ще немає ключа.', 'Nog geen sleutel in de kluis.'],
  NIET_GEBOUWD: ['Це підключення ще не існує на сайті.', 'Deze koppeling bestaat nog niet op de site.'],
  GEEN_LEVENDE_STATUS: ['Сайт не може сам прочитати стан цього підключення; перевірте його на власній сторінці.', 'De site kan de toestand van deze koppeling niet zelf lezen; controleer haar op de eigen pagina.'],
  MELDT_FOUT: ['Підключення повідомляє про помилку.', 'De koppeling meldt een fout.'],
  VERBONDEN: ['Підключення активне.', 'De koppeling is actief.'],
  NIET_GEVERIFIEERD: ['Налаштовано, але не перевірено в зовнішньому сервісі.', 'Ingesteld, maar niet geverifieerd bij de externe dienst.'],
  NIET_GEKOPPELD: ['Не підключено.', 'Niet gekoppeld.'],
};
export const codeTekst = (code: string | undefined, taal: 'uk' | 'nl', n?: number, terug = ''): string => {
  const t = code ? CODE_TEKST[code] : undefined;
  return t ? t[taal === 'uk' ? 0 : 1].replace('{n}', String(n ?? '')) : terug;
};
