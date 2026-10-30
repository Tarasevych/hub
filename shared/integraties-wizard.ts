// «Майстер підключень» (admin → Інтеграції → Майстер, 20.10.2026): de ENE bron voor wat de eigenaar in een externe console
// moet invullen om OAuth-koppelingen aan DEZE installatie te hangen (Google Cloud, Microsoft Entra, GitHub).
//
// Waarom een apart, puur bestand: de browser (src/integraties/Wizard.tsx), de server (backend/integraties-wizard.ts) en de
// tests lezen dezelfde waarden. Alles wordt gerekend uit de hostnamen van de deployment (backend/deployment-identity.ts →
// SERVICE_HOSTS), nooit uit een vaste domeinnaam: zet iemand de site op voorbeeld.nl, dan staan hier de adressen van voorbeeld.nl.
//
// Eerlijkheid:
//  - hier staan ALLEEN adressen, scopes en stappen die de server werkelijk gebruikt (de tests vergelijken ze met de
//    callback-routes en scope-lijsten in backend/*);
//  - de naam van een knop in een vreemde console kan veranderen; waar dat kan, staat dat in de stap («назва пункту може
//    відрізнятися»). Er wordt niets verzonnen;
//  - er komt NOOIT een waarde van een geheim door dit bestand. De parsers hieronder lezen wat de eigenaar plakt en geven het
//    aan de kluis; de server stuurt alleen codes terug (WIZARD_CODES), nooit een secret.
import type { VaultDoel } from './geheimen';
import { DEV_MG_FOUTEN } from './dev-media-github';

export type Tekst = readonly [uk: string, nl: string];
export type WizardProviderId = 'google' | 'microsoft' | 'github' | 'github-app' | 'stripe';
export const WIZARD_PROVIDER_IDS: readonly WizardProviderId[] = ['google', 'microsoft', 'github', 'github-app', 'stripe'];
export const isWizardProvider = (v: unknown): v is WizardProviderId => typeof v === 'string' && (WIZARD_PROVIDER_IDS as readonly string[]).includes(v);

/** Waar het client secret van deze provider op de server leeft. */
export type WizardOpslag =
  /** uitsluitend in de versleutelde kluis van de eigenaar (passkey/TOTP bij het opslaan); meteen actief, geen herstart */
  | 'kluis'
  /** env op de server (/etc/mijn-ruimte/geheimen.env, root); env wint, de kluis is de terugvaloptie zonder herstart */
  | 'env-of-kluis'
  /** uitsluitend env op de server; zetten met het serverscript, dat de dienst zelf herstart */
  | 'env';

export type WizardProvider = {
  id: WizardProviderId;
  naam: string;
  /** id in shared/integraties-catalogus.ts (voor logo en koppeling met de kaart) */
  catalogusId: string;
  /** stabiele ingang van de console (geen diepe links die elk kwartaal verhuizen) */
  console: { url: string; label: Tekst };
  /** officiële documentatie */
  docs: string;
  opslag: WizardOpslag;
  /** doel in de kluis (purpose) waar de wizard client id + secret bewaart; leeg = niet via de kluis */
  kluisDoel: VaultDoel | '';
  /** naam van het kluisitem dat de wizard aanmaakt/vervangt (één vaste naam, zodat «vervangen» idempotent is) */
  kluisNaam: string;
  /** env-namen op de server (alleen de NAMEN; de server meldt alleen of ze gezet zijn) */
  envNamen: readonly string[];
  /** serveropdracht om de env te zetten (alleen bij opslag 'env' en 'env-of-kluis') */
  serverOpdracht: string;
};

export const WIZARD_PROVIDERS: readonly WizardProvider[] = Object.freeze([
  {
    id: 'google', naam: 'Google (вхід, Gmail, Drive, Calendar, Photos)', catalogusId: 'google-signin',
    console: { url: 'https://console.cloud.google.com/apis/credentials', label: ['Google Cloud Console → Credentials', 'Google Cloud Console → Credentials'] },
    docs: 'https://developers.google.com/identity/protocols/oauth2/web-server',
    opslag: 'env-of-kluis', kluisDoel: 'google', kluisNaam: 'google-oauth-client',
    envNamen: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1'],
    serverOpdracht: 'sudo /usr/local/sbin/mijn-ruimte-installeer oauth-client google',
  },
  {
    id: 'microsoft', naam: 'Microsoft (Outlook через Microsoft Graph)', catalogusId: 'outlook-mail',
    console: { url: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', label: ['Microsoft Entra admin center → App registrations', 'Microsoft Entra admin center → App registrations'] },
    docs: 'https://learn.microsoft.com/entra/identity-platform/quickstart-register-app',
    opslag: 'env', kluisDoel: '', kluisNaam: '',
    envNamen: ['MICROSOFT_GRAPH_CLIENT_ID', 'MICROSOFT_GRAPH_CLIENT_SECRET', 'MICROSOFT_GRAPH_TENANT_ID', 'MAIL_TOKEN_ENCRYPTION_KEY_V1'],
    serverOpdracht: 'sudo /usr/local/sbin/mijn-ruimte-installeer oauth-client microsoft',
  },
  {
    id: 'github', naam: 'GitHub — OAuth-застосунок', catalogusId: 'github',
    console: { url: 'https://github.com/settings/developers', label: ['GitHub → Settings → Developer settings → OAuth Apps', 'GitHub → Settings → Developer settings → OAuth Apps'] },
    docs: 'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app',
    opslag: 'kluis', kluisDoel: 'github-oauth', kluisNaam: 'github-oauth-app',
    envNamen: ['GITHUB_KOPPELING_SLEUTEL_V1'],
    serverOpdracht: '',
  },
  {
    id: 'github-app', naam: 'GitHub App (репозиторії на вибір)', catalogusId: 'github',
    console: { url: 'https://github.com/settings/apps', label: ['GitHub → Settings → Developer settings → GitHub Apps', 'GitHub → Settings → Developer settings → GitHub Apps'] },
    docs: 'https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app',
    opslag: 'kluis', kluisDoel: 'github-app', kluisNaam: 'github-app-sleutel',
    envNamen: ['GITHUB_KOPPELING_SLEUTEL_V1'],
    serverOpdracht: '',
  },
  {
    // 21.10.2026 (recht «Переглядати платежі», backend/betalingen-stripe.ts): een BEPERKTE sleutel met alleen leesrechten. Geen OAuth,
    // geen client id: één waarde in de kluis, en «Перевірити» doet een echt verzoek bij Stripe met die sleutel.
    id: 'stripe', naam: 'Stripe — платежі лише для читання', catalogusId: 'stripe',
    console: { url: 'https://dashboard.stripe.com/apikeys', label: ['Stripe Dashboard → Developers → API keys', 'Stripe Dashboard → Developers → API keys'] },
    docs: 'https://docs.stripe.com/keys/restricted-api-keys',
    opslag: 'kluis', kluisDoel: 'stripe', kluisNaam: 'stripe-beperkt',
    envNamen: [],
    serverOpdracht: '',
  },
]);
export const wizardProvider = (id: unknown): WizardProvider | undefined => WIZARD_PROVIDERS.find((p) => p.id === id);

// ------------------------------------------------------------------------------------------------ scopes die de server vraagt

/** Google-aanmelding (backend/index.ts ownerGoogleAuthorizationUrl): precies deze drie. */
export const GOOGLE_LOGIN_SCOPES: readonly string[] = Object.freeze(['openid', 'email', 'profile']);
/** Google Suite (backend/google-suite-inrichting.ts CONFIG): per dienst; de test vergelijkt ze met die bron. */
export const GOOGLE_SUITE_SCOPES: Readonly<Record<'mail' | 'drive' | 'calendar' | 'photos', readonly string[]>> = Object.freeze({
  mail: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.labels'],
  drive: ['https://www.googleapis.com/auth/drive'],
  calendar: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'],
  photos: ['https://www.googleapis.com/auth/photospicker.mediaitems.readonly'],
});
/** Microsoft Graph (backend/mail-microsoft.ts MICROSOFT_GRAPH_SCOPES): gedelegeerde rechten. */
export const MICROSOFT_GRAPH_SCOPES: readonly string[] = Object.freeze(['offline_access', 'openid', 'profile', 'email', 'Mail.Read', 'Mail.ReadWrite', 'Mail.Send']);
/** GitHub OAuth (shared/github-koppeling.ts GITHUB_RECHTEN). */
export const GITHUB_OAUTH_SCOPES: readonly string[] = Object.freeze(['repo', 'read:org', 'read:project']);

// ------------------------------------------------------------------------------------------------ waarden per installatie

export type WizardHosts = { identity: string; hub: string; mail: string; cloud: string; github: string };
/** Stripe: precies de leesrechten die backend/betalingen-stripe.ts gebruikt (charges, invoices, payouts). */
export const STRIPE_RECHTEN: readonly string[] = Object.freeze(['Charges: Read', 'Invoices: Read', 'Payouts: Read']);
export type WizardWaarde = { label: Tekst; waarde: string; /** meerdere regels (bv. scopes): elk apart te kopiëren */ regels?: readonly string[]; uitleg?: Tekst };
export type WizardWaarden = Record<WizardProviderId, readonly WizardWaarde[]>;

const host = (h: unknown) => String(h ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const domein = (h: string) => h.split('.').slice(-2).join('.');

/**
 * Wat de eigenaar letterlijk in de consoles plakt. ÉÉN redirect-URI per provider, precies wat de callback-routes aannemen:
 *   Google en Microsoft  → https://<identity-host>/              (backend/index.ts OWNER_GOOGLE_CALLBACK, mail-microsoft)
 *   GitHub               → https://<github-host>/api/owner/github/oauth/callback  (shared/github-koppeling.ts)
 */
export function wizardWaarden(hostsIn: Partial<WizardHosts>): WizardWaarden {
  const id = host(hostsIn.identity), hub = host(hostsIn.hub), mail = host(hostsIn.mail), cloud = host(hostsIn.cloud), gh = host(hostsIn.github);
  const dom = domein(id || hub || gh);
  const appNaam = dom ? `Mijn Ruimte (${dom})` : 'Mijn Ruimte';
  const idRedirect = id ? `https://${id}/` : '';
  const origins = [id, hub, mail, cloud].filter(Boolean).map((h) => `https://${h}`);
  const alleGoogle = [...GOOGLE_LOGIN_SCOPES, ...GOOGLE_SUITE_SCOPES.mail, ...GOOGLE_SUITE_SCOPES.drive, ...GOOGLE_SUITE_SCOPES.calendar, ...GOOGLE_SUITE_SCOPES.photos];
  const ghBasis = gh ? `https://${gh}` : '';
  return {
    google: [
      { label: ['Назва застосунку (Google Auth Platform → Branding)', 'Naam van de app (Google Auth Platform → Branding)'], waarde: appNaam },
      { label: ['Authorized domain', 'Authorized domain'], waarde: dom },
      { label: ['Authorized redirect URI (точно, зі слешем)', 'Authorized redirect URI (exact, met slash)'], waarde: idRedirect, uitleg: ['Єдина адреса повернення, яку приймає сервер: вхід, Gmail, Drive, Calendar і Photos повертаються сюди.', 'Het enige terugkeeradres dat de server aanneemt: aanmelden, Gmail, Drive, Agenda en Foto’s komen hier terug.'] },
      { label: ['Authorized JavaScript origins', 'Authorized JavaScript origins'], waarde: origins.join('\n'), regels: origins },
      { label: ['Scopes (Data access)', 'Scopes (Data access)'], waarde: alleGoogle.join('\n'), regels: alleGoogle, uitleg: ['gmail.* і drive — «restricted»/«sensitive»: поки застосунок у режимі Testing, додайте себе до Test users; для публікації Google вимагає перевірку.', 'gmail.* en drive zijn «restricted»/«sensitive»: zolang de app in Testing staat, voegt u uzelf toe als Test user; publiceren vereist een verificatie door Google.'] },
    ],
    microsoft: [
      { label: ['Назва реєстрації застосунку', 'Naam van de app-registratie'], waarde: appNaam },
      { label: ['Supported account types', 'Supported account types'], waarde: 'Accounts in any organizational directory and personal Microsoft accounts', uitleg: ['Для MICROSOFT_GRAPH_TENANT_ID=common. Якщо лише ваша організація — оберіть «Single tenant» і вкажіть Directory (tenant) ID.', 'Voor MICROSOFT_GRAPH_TENANT_ID=common. Alleen uw eigen organisatie: kies «Single tenant» en gebruik de Directory (tenant) ID.'] },
      { label: ['Redirect URI (platform Web, точно, зі слешем)', 'Redirect URI (platform Web, exact, met slash)'], waarde: idRedirect },
      { label: ['API permissions → Microsoft Graph → Delegated', 'API permissions → Microsoft Graph → Delegated'], waarde: MICROSOFT_GRAPH_SCOPES.join('\n'), regels: MICROSOFT_GRAPH_SCOPES },
      { label: ['Webhook для change notifications (необов’язково)', 'Webhook voor change notifications (optioneel)'], waarde: mail ? `https://${mail}/api/owner/mail/microsoft/webhook` : '' },
    ],
    github: [
      { label: ['Application name', 'Application name'], waarde: appNaam },
      { label: ['Homepage URL', 'Homepage URL'], waarde: ghBasis ? `${ghBasis}/` : '' },
      { label: ['Authorization callback URL', 'Authorization callback URL'], waarde: ghBasis ? `${ghBasis}/api/owner/github/oauth/callback` : '' },
      { label: ['Scopes, які запитує сервер', 'Scopes die de server vraagt'], waarde: GITHUB_OAUTH_SCOPES.join(' '), regels: GITHUB_OAUTH_SCOPES, uitleg: ['Scopes задаються не в консолі, а в запиті; тут лише для звірки з екраном згоди.', 'Scopes staan niet in de console maar in het verzoek; hier alleen ter vergelijking met het toestemmingsscherm.'] },
    ],
    'github-app': [
      { label: ['GitHub App name', 'GitHub App name'], waarde: appNaam },
      { label: ['Homepage URL', 'Homepage URL'], waarde: ghBasis ? `${ghBasis}/` : '' },
      { label: ['Callback URL (можна лишити порожнім; сервер використовує JWT застосунку)', 'Callback URL (mag leeg; de server gebruikt de app-JWT)'], waarde: ghBasis ? `${ghBasis}/api/owner/github/oauth/callback` : '' },
      { label: ['Webhook', 'Webhook'], waarde: 'Active: вимкнено / uit', uitleg: ['Сервер не приймає вебхуки GitHub; зніміть позначку «Active».', 'De server ontvangt geen GitHub-webhooks; zet «Active» uit.'] },
    ],
    stripe: [
      { label: ['Тип ключа', 'Soort sleutel'], waarde: 'Restricted key (rk_live_… / rk_test_…)', uitleg: ['Повний секретний ключ (sk_…) сайт не прийме: ШІ лише читає.', 'Een volledige geheime sleutel (sk_…) neemt de site niet aan: de AI leest alleen.'] },
      { label: ['Назва ключа у Stripe', 'Naam van de sleutel bij Stripe'], waarde: appNaam },
      { label: ['Дозволи (Permissions)', 'Rechten (Permissions)'], waarde: STRIPE_RECHTEN.join('\n'), regels: STRIPE_RECHTEN, uitleg: ['Усе інше — None.', 'Al het andere op None.'] },
    ],
  };
}

// ------------------------------------------------------------------------------------------------ wat de eigenaar plakt

export type ClientPaar = { clientId: string; clientSecret: string; tenantId: string };
const GOOGLE_ID = /^[0-9]{6,}-[a-z0-9]{10,}\.apps\.googleusercontent\.com$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GITHUB_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{6,78})[A-Za-z0-9]$/;
const SECRET = /^[A-Za-z0-9._~+/=-]{16,200}$/;
const TENANT = /^(common|organizations|consumers|[0-9a-f-]{36}|[a-z0-9-]+\.onmicrosoft\.com)$/i;

export const geldigeClientId = (provider: WizardProviderId, v: unknown): boolean => {
  const s = String(v ?? '').trim();
  if (provider === 'google') return GOOGLE_ID.test(s);
  if (provider === 'microsoft') return GUID.test(s);
  return GITHUB_ID.test(s);
};
export const geldigSecret = (v: unknown): boolean => SECRET.test(String(v ?? '').trim());
export const geldigeTenant = (v: unknown): boolean => TENANT.test(String(v ?? '').trim());

/**
 * Tekst die de kluis voor Google bewaart (doel «google»): benoemde regels, zelfde vorm als GitHub (shared/github-koppeling.ts),
 * zodat de eigenaar hem ook met de hand in de kluis kan zetten.
 */
export const googleKluisTekst = (clientId: string, clientSecret: string): string => `client_id: ${clientId.trim()}\nclient_secret: ${clientSecret.trim()}`;
export function leesGoogleKluis(invoer: unknown): { clientId: string; clientSecret: string } | null {
  const tekst = String(invoer ?? '').trim();
  if (!tekst || tekst.length > 2000) return null;
  const v: Record<string, string> = {};
  if (tekst.startsWith('{')) {
    try { for (const [k, w] of Object.entries(JSON.parse(tekst) as Record<string, unknown>)) if (typeof w === 'string') v[k.toLowerCase().replace(/[^a-z]/g, '')] = w.trim(); }
    catch { return null; }
  } else {
    for (const regel of tekst.split(/\r?\n/)) {
      const paar = /^\s*([A-Za-z][A-Za-z_ -]{1,40})\s*[:=]\s*(.+?)\s*$/.exec(regel);
      if (paar) v[paar[1].toLowerCase().replace(/[^a-z]/g, '')] = paar[2].trim();
    }
  }
  const clientId = v.clientid || '', clientSecret = v.clientsecret || '';
  return GOOGLE_ID.test(clientId) && SECRET.test(clientSecret) ? { clientId, clientSecret } : null;
}

// ------------------------------------------------------------------------------------------------ stappen (uk + nl)

export type WizardStap = { kop: Tekst; tekst: Tekst };
/** Stappen per provider. `{console}` = de knop «Відкрити консоль». Namen van menu-items kunnen verhuizen: dat staat erbij. */
export const WIZARD_STAPPEN: Readonly<Record<WizardProviderId, readonly WizardStap[]>> = Object.freeze({
  google: [
    { kop: ['Проєкт', 'Project'], tekst: ['Відкрийте консоль і оберіть (або створіть) проєкт. Усі кроки нижче — в межах цього проєкту.', 'Open de console en kies (of maak) een project. Alle stappen hieronder gelden binnen dat project.'] },
    { kop: ['Google Auth Platform → Branding і Audience', 'Google Auth Platform → Branding en Audience'], tekst: ['У лівому меню «Google Auth Platform» (раніше «OAuth consent screen»; назва пункту може відрізнятися): заповніть назву застосунку та адресу підтримки, додайте Authorized domain, в Audience оберіть «External». Поки застосунок у Testing — додайте свою адресу до Test users.', 'In het linkermenu «Google Auth Platform» (vroeger «OAuth consent screen»; de naam kan verschillen): vul de naam en het support-adres in, voeg het Authorized domain toe en kies bij Audience «External». Zolang de app in Testing staat: zet uw eigen adres bij Test users.'] },
    { kop: ['Data access → scopes', 'Data access → scopes'], tekst: ['Додайте scopes зі списку праворуч. Без gmail.* не працюватиме Пошта, без drive — Хмарне сховище, без calendar.* — Календар; вхід потребує лише openid, email, profile.', 'Voeg de scopes uit de lijst toe. Zonder gmail.* werkt E-mail niet, zonder drive de Cloudopslag niet, zonder calendar.* de Agenda niet; aanmelden heeft alleen openid, email en profile nodig.'] },
    { kop: ['APIs & Services → Credentials → Create credentials → OAuth client ID', 'APIs & Services → Credentials → Create credentials → OAuth client ID'], tekst: ['Тип «Web application». Вставте Authorized JavaScript origins і Authorized redirect URI ТОЧНО як показано (зі слешем у кінці). Скопіюйте Client ID і Client secret — секрет Google показує лише раз.', 'Type «Web application». Plak de Authorized JavaScript origins en de Authorized redirect URI PRECIES zoals getoond (met slash aan het einde). Kopieer Client ID en Client secret — het secret toont Google maar één keer.'] },
    { kop: ['Увімкнути API', 'API’s inschakelen'], tekst: ['APIs & Services → Library: увімкніть Gmail API, Google Drive API, Google Calendar API і Google Photos Picker API (лише ті, що потрібні).', 'APIs & Services → Library: schakel Gmail API, Google Drive API, Google Calendar API en Google Photos Picker API in (alleen wat u nodig hebt).'] },
    { kop: ['Збереження на сервері', 'Opslaan op de server'], tekst: ['Вставте Client ID і Client secret у поле нижче — вони підуть у ваше зашифроване сховище (підтвердження passkey/TOTP) і стануть доступними без перезапуску: Gmail/Drive/Calendar — одразу, вхід через Google — протягом 5 хвилин. Альтернатива: серверна команда (значення зчитуються приховано, сервіс перезапускається сам).', 'Plak Client ID en Client secret in het veld hieronder — ze gaan naar uw versleutelde kluis (bevestiging met passkey/TOTP) en werken zonder herstart: Gmail/Drive/Agenda meteen, aanmelden via Google binnen 5 minuten. Alternatief: de serveropdracht (waarden worden verborgen ingelezen, de dienst herstart vanzelf).'] },
  ],
  microsoft: [
    { kop: ['App registrations → New registration', 'App registrations → New registration'], tekst: ['Відкрийте консоль (Microsoft Entra admin center; у порталі Azure той самий розділ зветься «Microsoft Entra ID → App registrations»). Назва — як показано; Supported account types — як показано; Redirect URI: платформа «Web», адреса ТОЧНО зі слешем.', 'Open de console (Microsoft Entra admin center; in de Azure-portal heet hetzelfde onderdeel «Microsoft Entra ID → App registrations»). Naam zoals getoond; Supported account types zoals getoond; Redirect URI: platform «Web», adres PRECIES met slash.'] },
    { kop: ['Overview → ідентифікатори', 'Overview → id’s'], tekst: ['Скопіюйте «Application (client) ID». Для TENANT: «common» (будь-які облікові записи) або «Directory (tenant) ID» (лише ваша організація).', 'Kopieer de «Application (client) ID». Voor TENANT: «common» (alle accounts) of de «Directory (tenant) ID» (alleen uw organisatie).'] },
    { kop: ['Certificates & secrets → New client secret', 'Certificates & secrets → New client secret'], tekst: ['Створіть client secret (термін до 24 місяців — занотуйте дату в реєстрі секретів). Скопіюйте колонку «Value» одразу: пізніше вона не показується.', 'Maak een client secret (geldig tot 24 maanden — noteer de datum in het geheimenregister). Kopieer meteen de kolom «Value»: later is die niet meer zichtbaar.'] },
    { kop: ['API permissions → Add a permission → Microsoft Graph → Delegated', 'API permissions → Add a permission → Microsoft Graph → Delegated'], tekst: ['Додайте рівно ті права, що в списку. «Grant admin consent» потрібен лише для організаційного орендаря.', 'Voeg precies de rechten uit de lijst toe. «Grant admin consent» is alleen nodig bij een organisatie-tenant.'] },
    { kop: ['Збереження на сервері', 'Opslaan op de server'], tekst: ['Ці значення читає лише серверний процес із /etc/mijn-ruimte/geheimen.env (root). Запустіть на сервері від робочого користувача команду нижче: вона запитає Client ID, Client secret і Tenant ПРИХОВАНО (без ехо, без аргументів, без історії), перевірить формат, запише атомарно, перезапустить сервіс і перевірить, що сайт відповідає. Через браузер це неможливо — сайт свідомо не має прав root.', 'Deze waarden leest alleen het serverproces uit /etc/mijn-ruimte/geheimen.env (root). Voer op de server als werkgebruiker de opdracht hieronder uit: die vraagt Client ID, Client secret en Tenant VERBORGEN (geen echo, geen argumenten, geen geschiedenis), controleert het formaat, schrijft atomisch, herstart de dienst en controleert of de site antwoordt. Via de browser kan dit niet — de site heeft bewust geen root.'] },
  ],
  github: [
    { kop: ['OAuth Apps → New OAuth App', 'OAuth Apps → New OAuth App'], tekst: ['Відкрийте консоль і створіть OAuth App. Application name, Homepage URL і Authorization callback URL — як показано (callback ТОЧНО). «Enable Device Flow» не вмикайте.', 'Open de console en maak een OAuth App. Application name, Homepage URL en Authorization callback URL zoals getoond (callback PRECIES). «Enable Device Flow» niet aanzetten.'] },
    { kop: ['Client secret', 'Client secret'], tekst: ['На сторінці застосунку натисніть «Generate a new client secret» і скопіюйте його одразу. За бажанням увімкніть «Expire user authorization tokens» — тоді сервер сам оновлюватиме токени.', 'Kies op de app-pagina «Generate a new client secret» en kopieer het meteen. Optioneel «Expire user authorization tokens» aanzetten — dan vernieuwt de server tokens zelf.'] },
    { kop: ['Збереження у сховищі', 'Opslaan in de kluis'], tekst: ['Вставте Client ID і Client secret нижче: вони підуть у ваше зашифроване сховище (призначення «github-oauth», підтвердження passkey/TOTP) і діють одразу — без перезапуску. Потім «Перевірити» запитає GitHub, чи приймає він ці облікові дані.', 'Plak Client ID en Client secret hieronder: ze gaan naar uw versleutelde kluis (doel «github-oauth», bevestiging met passkey/TOTP) en gelden meteen — zonder herstart. «Controleren» vraagt daarna aan GitHub of het deze gegevens aanneemt.'] },
  ],
  'github-app': [
    { kop: ['GitHub Apps → New GitHub App', 'GitHub Apps → New GitHub App'], tekst: ['Відкрийте консоль і створіть GitHub App: назва та Homepage URL — як показано; Webhook → зніміть «Active». Repository permissions: лише те, що потрібно сторінці GitHub (вміст, issues, pull requests, metadata); точний набір обирайте за своїми потребами.', 'Open de console en maak een GitHub App: naam en Homepage URL zoals getoond; Webhook → «Active» uit. Repository permissions: alleen wat de GitHub-pagina nodig heeft (inhoud, issues, pull requests, metadata); kies de precieze set naar uw behoefte.'] },
    { kop: ['Private key і App ID', 'Private key en App ID'], tekst: ['На сторінці застосунку: запам’ятайте App ID; у «Private keys» натисніть «Generate a private key» — завантажиться .pem.', 'Op de app-pagina: noteer het App ID; bij «Private keys» kiest u «Generate a private key» — er wordt een .pem gedownload.'] },
    { kop: ['Install App', 'Install App'], tekst: ['«Install App» → оберіть обліковий запис і репозиторії (Only select repositories).', '«Install App» → kies het account en de repositories (Only select repositories).'] },
    { kop: ['Збереження у сховищі', 'Opslaan in de kluis'], tekst: ['Вставте нижче «app_id: <число>» і далі вміст .pem (PEM цілком). Йде у сховище (призначення «github-app»), діє одразу; «Перевірити» запитає GitHub перелік інсталяцій.', 'Plak hieronder «app_id: <getal>» en daaronder de inhoud van het .pem (hele PEM). Gaat naar de kluis (doel «github-app»), geldt meteen; «Controleren» vraagt GitHub de lijst installaties.'] },
  ],
  stripe: [
    { kop: ['Restricted key', 'Restricted key'], tekst: ['Відкрийте консоль Stripe (Developers → API keys) і натисніть «Create restricted key». Для перевірки можна спершу зробити це в режимі «Test mode» — тоді ключ починається з rk_test_.', 'Open de Stripe-console (Developers → API keys) en kies «Create restricted key». Om te proberen kan dat eerst in «Test mode» — dan begint de sleutel met rk_test_.'] },
    { kop: ['Лише читання', 'Alleen lezen'], tekst: ['Дайте ключу право «Read» лише на Charges, Invoices і Payouts; усе інше залиште «None». Сайт нічого не змінює у Stripe, тож права на запис не потрібні.', 'Geef de sleutel alleen «Read» op Charges, Invoices en Payouts; laat al het andere op «None». De site verandert niets in Stripe, dus schrijfrechten zijn niet nodig.'] },
    { kop: ['Збереження у сховищі', 'Opslaan in de kluis'], tekst: ['Вставте ключ (rk_live_… або rk_test_…) у поле нижче: він піде у ваше зашифроване сховище (призначення «stripe», підтвердження passkey/TOTP) і діє одразу. «Перевірити» робить справжній запит до Stripe і показує, які списки ключ може читати.', 'Plak de sleutel (rk_live_… of rk_test_…) in het veld hieronder: hij gaat naar uw versleutelde kluis (doel «stripe», bevestiging met passkey/TOTP) en geldt meteen. «Controleren» doet een echt verzoek bij Stripe en toont welke lijsten de sleutel mag lezen.'] },
  ],
});

// ------------------------------------------------------------------------------------------------ codes van de server

/** De server stuurt codes; de browser kiest de taal. Nooit een waarde. */
export const WIZARD_CODES: Readonly<Record<string, Tekst>> = Object.freeze({
  // gemeenschappelijk
  CLIENT_ONTBREEKT: ['Client ID і secret ще не задані.', 'Client ID en secret zijn nog niet ingesteld.'],
  CLIENT_ONLEESBAAR: ['У сховищі є запис, але це не client id + secret у відомому форматі.', 'Er staat iets in de kluis, maar het is geen client id + secret in een bekend formaat.'],
  ONBEREIKBAAR: ['Зовнішній сервіс не відповів (мережа, DNS або тайм-аут).', 'De externe dienst antwoordde niet (netwerk, DNS of time-out).'],
  ANTWOORD_ONDUIDELIJK: ['Сервіс відповів несподівано; перевірка не дала однозначного результату.', 'De dienst antwoordde onverwacht; de controle gaf geen eenduidig resultaat.'],
  // google
  GOOGLE_OK: ['Google прийняв Client ID і secret (token endpoint відповів invalid_grant на тестовий код — облікові дані дійсні). Redirect URI Google перевіряє лише під час справжнього входу.', 'Google nam Client ID en secret aan (het token endpoint gaf invalid_grant op een testcode — de gegevens zijn geldig). De redirect URI controleert Google pas bij een echte aanmelding.'],
  GOOGLE_CLIENT_ONGELDIG: ['Google не впізнає цей Client ID або secret (invalid_client).', 'Google kent deze Client ID of het secret niet (invalid_client).'],
  GOOGLE_REDIRECT_MISMATCH: ['Google відкинув redirect URI (redirect_uri_mismatch): додайте точну адресу в OAuth-клієнт.', 'Google wees de redirect URI af (redirect_uri_mismatch): voeg het exacte adres toe aan de OAuth-client.'],
  GOOGLE_GRANT_SLEUTEL_ONTBREEKT: ['GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 відсутній на сервері: токени не можна зберегти. Запустіть «mijn-ruimte-installeer geheimen».', 'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 ontbreekt op de server: tokens kunnen niet worden bewaard. Voer «mijn-ruimte-installeer geheimen» uit.'],
  // microsoft
  MS_OK: ['Microsoft прийняв Client ID, secret і tenant (token endpoint відповів invalid_grant на тестовий код — облікові дані дійсні). Redirect URI остаточно перевіряється під час справжнього входу.', 'Microsoft nam Client ID, secret en tenant aan (het token endpoint gaf invalid_grant op een testcode — de gegevens zijn geldig). De redirect URI wordt pas bij een echte aanmelding definitief gecontroleerd.'],
  MS_TENANT_ONGELDIG: ['Орендаря (tenant) не знайдено: перевірте MICROSOFT_GRAPH_TENANT_ID.', 'Tenant niet gevonden: controleer MICROSOFT_GRAPH_TENANT_ID.'],
  MS_CLIENT_ONGELDIG: ['Застосунок із таким Client ID не знайдено в цьому орендарі (AADSTS700016).', 'Geen app met deze Client ID in deze tenant (AADSTS700016).'],
  MS_SECRET_ONGELDIG: ['Client secret неправильний або прострочений (AADSTS7000215).', 'Client secret onjuist of verlopen (AADSTS7000215).'],
  MS_REDIRECT_MISMATCH: ['Redirect URI не збігається з реєстрацією (AADSTS50011).', 'Redirect URI komt niet overeen met de registratie (AADSTS50011).'],
  MS_FOUT: ['Microsoft повернув помилку; код у деталях.', 'Microsoft gaf een fout; de code staat in de details.'],
  // github
  GH_OK: ['GitHub прийняв Client ID і secret (POST /applications/{client_id}/token відповів 404 на тестовий токен — облікові дані дійсні).', 'GitHub nam Client ID en secret aan (POST /applications/{client_id}/token gaf 404 op een testtoken — de gegevens zijn geldig).'],
  GH_CLIENT_ONGELDIG: ['GitHub відхилив Client ID або secret (401).', 'GitHub wees Client ID of secret af (401).'],
  GH_APP_OK: ['GitHub App дійсний; інсталяцій: {n}.', 'GitHub App geldig; installaties: {n}.'],
  GH_APP_GEEN_INSTALLATIES: ['GitHub App дійсний, але ще не встановлений на жодному обліковому записі («Install App»).', 'GitHub App geldig, maar nog nergens geïnstalleerd («Install App»).'],
  GH_APP_SLEUTEL_ONGELDIG: ['GitHub не приймає JWT: приватний ключ не належить цьому App ID.', 'GitHub accepteert de JWT niet: de persoonlijke sleutel hoort niet bij dit App ID.'],
  GH_RATE: ['GitHub обмежив кількість запитів; спробуйте пізніше.', 'GitHub beperkte het aantal verzoeken; probeer het later.'],
  // stripe (backend/betalingen-stripe.ts → controleerStripe): dezelfde teksten als het hulpmiddel payments_list.
  STRIPE_OK: DEV_MG_FOUTEN.STRIPE_OK,
  STRIPE_SLEUTEL_TE_RUIM: DEV_MG_FOUTEN.STRIPE_SLEUTEL_TE_RUIM,
  STRIPE_SLEUTEL_VORM: DEV_MG_FOUTEN.STRIPE_SLEUTEL_VORM,
  STRIPE_SLEUTEL_ONGELDIG: DEV_MG_FOUTEN.STRIPE_SLEUTEL_ONGELDIG,
  STRIPE_RECHT_ONTBREEKT: DEV_MG_FOUTEN.STRIPE_RECHT_ONTBREEKT,
});
/** Stripe: alleen een beperkte sleutel (zelfde regel als de server, backend/betalingen-stripe.ts → isBeperkteSleutel). */
export const geldigeStripeSleutel = (v: unknown): boolean => /^rk_(live|test)_[A-Za-z0-9]{20,250}$/.test(String(v ?? '').trim());
export const wizardCodeTekst = (code: string | undefined, taal: 'uk' | 'nl', n?: number, terug = ''): string => {
  const t = code ? WIZARD_CODES[code] : undefined;
  return t ? t[taal === 'uk' ? 0 : 1].replace('{n}', String(n ?? '')) : terug;
};
