// Overzicht «Секрети й ключі» (admin.* /contour): groepen, diensten en het afleiden van groep/dienst uit een naam of doel.
// Gedeeld door backend (lijst) en frontend (filters, logo's). Hier staan NOOIT waarden: alleen namen en metadata.
import type { VaultMeta, VaultStaat } from './kluis-meta';

export type Tekst = readonly [uk: string, nl: string];

export const GEHEIM_GROEPEN = ['google', 'site', 'server', 'database', 'oauth', 'ai', 'mail', 'betaling', 'cloud', 'eigen'] as const;
export type GeheimGroep = typeof GEHEIM_GROEPEN[number];
export const GROEP_NAAM: Record<GeheimGroep, Tekst> = {
  google: ['Google', 'Google'],
  site: ['Сайт і застосунок', 'Site en app'],
  server: ['Сервер і SSH', 'Server en SSH'],
  database: ['База даних', 'Database'],
  oauth: ['OAuth і SSO', 'OAuth en SSO'],
  ai: ['ШІ-агенти й токени', 'AI-agenten en tokens'],
  mail: ['Пошта', 'E-mail'],
  betaling: ['Платіжні сервіси', 'Betaaldiensten'],
  cloud: ['Хмара й інтеграції', 'Cloud en integraties'],
  eigen: ['Власні ключі', 'Eigen sleutels'],
};

export type DienstId = 'google' | 'microsoft' | 'github' | 'anthropic' | 'openai' | 'telegram' | 'home-assistant' | 'webhook' | 'postgres'
  | 'ssh' | 'cloudflare' | 'stripe' | 'smtp' | 'scim' | 'site' | 'audit' | 'versleuteling' | 'mcp' | 'api' | 'overig';
export const DIENSTEN: Record<DienstId, { naam: Tekst; kleur: string; letters: string }> = {
  google: { naam: ['Google', 'Google'], kleur: '#4285f4', letters: 'G' },
  microsoft: { naam: ['Microsoft', 'Microsoft'], kleur: '#00a4ef', letters: 'M' },
  github: { naam: ['GitHub', 'GitHub'], kleur: '#24292f', letters: 'GH' },
  anthropic: { naam: ['Anthropic (Claude)', 'Anthropic (Claude)'], kleur: '#c15f3c', letters: 'A' },
  openai: { naam: ['OpenAI', 'OpenAI'], kleur: '#10a37f', letters: 'O' },
  telegram: { naam: ['Telegram', 'Telegram'], kleur: '#229ed9', letters: 'T' },
  'home-assistant': { naam: ['Home Assistant', 'Home Assistant'], kleur: '#18bcf2', letters: 'HA' },
  webhook: { naam: ['Webhook', 'Webhook'], kleur: '#7c3aed', letters: 'W' },
  postgres: { naam: ['PostgreSQL', 'PostgreSQL'], kleur: '#336791', letters: 'PG' },
  ssh: { naam: ['SSH', 'SSH'], kleur: '#475569', letters: '>_' },
  cloudflare: { naam: ['Cloudflare', 'Cloudflare'], kleur: '#f38020', letters: 'CF' },
  stripe: { naam: ['Stripe', 'Stripe'], kleur: '#635bff', letters: 'S' },
  smtp: { naam: ['Пошта (SMTP)', 'E-mail (SMTP)'], kleur: '#0f766e', letters: '@' },
  scim: { naam: ['SCIM / каталог', 'SCIM / directory'], kleur: '#0369a1', letters: 'ID' },
  site: { naam: ['Сайт', 'Site'], kleur: '#2563eb', letters: 'MR' },
  audit: { naam: ['Журнал аудиту', 'Auditlogboek'], kleur: '#b45309', letters: 'AU' },
  versleuteling: { naam: ['Шифрування', 'Versleuteling'], kleur: '#7e22ce', letters: 'AES' },
  mcp: { naam: ['MCP / ШІ-підключення', 'MCP / AI-koppeling'], kleur: '#be185d', letters: 'AI' },
  api: { naam: ['API-токени', 'API-tokens'], kleur: '#0d9488', letters: 'API' },
  overig: { naam: ['Інше', 'Overig'], kleur: '#64748b', letters: '•' },
};

/** Doelen (purpose) van een sleutel in de eigen kluis → dienst en groep. */
export const VAULT_DOELEN = ['home-assistant', 'telegram', 'github', 'github-oauth', 'github-app', 'github-uitrol', 'anthropic', 'openai', 'google', 'microsoft', 'cloudflare',
  'stripe', 'smtp', 'database', 'ssh', 'webhook', 'other'] as const;
export type VaultDoel = typeof VAULT_DOELEN[number];
export const DOEL_INFO: Record<VaultDoel, { dienst: DienstId; groep: GeheimGroep; naam: Tekst }> = {
  'home-assistant': { dienst: 'home-assistant', groep: 'cloud', naam: ['Home Assistant', 'Home Assistant'] },
  telegram: { dienst: 'telegram', groep: 'cloud', naam: ['Telegram', 'Telegram'] },
  github: { dienst: 'github', groep: 'cloud', naam: ['GitHub', 'GitHub'] },
  // OAuth-app van de eigenaar zelf (BYOS): client id + client secret van de app die HIJ op github.com registreert.
  'github-oauth': { dienst: 'github', groep: 'oauth', naam: ['GitHub — OAuth-застосунок (client id + secret)', 'GitHub — OAuth-app (client id + secret)'] },
  // GitHub App van de eigenaar: App ID + de persoonlijke RSA-sleutel (PEM) waarmee de server de app-JWT ondertekent.
  'github-app': { dienst: 'github', groep: 'cloud', naam: ['GitHub App — App ID + приватний ключ', 'GitHub App — App ID + persoonlijke sleutel'] },
  // Technisch (audit 18.10.2026, punt 4): alleen releases publiceren na een installatie; fine-grained, Contents: write, één repository.
  'github-uitrol': { dienst: 'github', groep: 'server', naam: ['GitHub — релізи сайту (технічний)', 'GitHub — site-releases (technisch)'] },
  anthropic: { dienst: 'anthropic', groep: 'ai', naam: ['Anthropic (Claude)', 'Anthropic (Claude)'] },
  openai: { dienst: 'openai', groep: 'ai', naam: ['OpenAI', 'OpenAI'] },
  google: { dienst: 'google', groep: 'google', naam: ['Google', 'Google'] },
  microsoft: { dienst: 'microsoft', groep: 'oauth', naam: ['Microsoft', 'Microsoft'] },
  cloudflare: { dienst: 'cloudflare', groep: 'cloud', naam: ['Cloudflare', 'Cloudflare'] },
  stripe: { dienst: 'stripe', groep: 'betaling', naam: ['Stripe', 'Stripe'] },
  smtp: { dienst: 'smtp', groep: 'mail', naam: ['Пошта (SMTP)', 'E-mail (SMTP)'] },
  database: { dienst: 'postgres', groep: 'database', naam: ['База даних', 'Database'] },
  ssh: { dienst: 'ssh', groep: 'server', naam: ['SSH / сервер', 'SSH / server'] },
  webhook: { dienst: 'webhook', groep: 'cloud', naam: ['Webhook', 'Webhook'] },
  other: { dienst: 'overig', groep: 'eigen', naam: ['Інше', 'Overig'] },
};
export const isVaultDoel = (v: unknown): v is VaultDoel => typeof v === 'string' && (VAULT_DOELEN as readonly string[]).includes(v);

type Regel = { re: RegExp; dienst: DienstId; groep: GeheimGroep };
// Volgorde telt: de eerste die past wint.
const NAAM_REGELS: readonly Regel[] = [
  { re: /^(GOOGLE_|GMAIL_)/i, dienst: 'google', groep: 'google' },
  { re: /^(MICROSOFT_|AZURE_|GRAPH_)/i, dienst: 'microsoft', groep: 'oauth' },
  { re: /^SCIM_/i, dienst: 'scim', groep: 'oauth' },
  { re: /(^|_)(OAUTH|OIDC|SSO|SAML)(_|$)/i, dienst: 'site', groep: 'oauth' },
  { re: /^(DATABASE_URL|PG|POSTGRES|DB_|MIJNRUIMTE_DB|REDIS)/i, dienst: 'postgres', groep: 'database' },
  { re: /^(SSH_|ROOT_|SERVER_)|SSH_CA|(^|_)SSH(_|$)/i, dienst: 'ssh', groep: 'server' },
  { re: /^(GITHUB_|GH_)/i, dienst: 'github', groep: 'cloud' },
  { re: /^(ANTHROPIC|CLAUDE)/i, dienst: 'anthropic', groep: 'ai' },
  { re: /^(OPENAI|GPT|GEMINI|GROK|XAI|COPILOT|MISTRAL)/i, dienst: 'openai', groep: 'ai' },
  { re: /^(MCP_|AGENT_|AI_)/i, dienst: 'mcp', groep: 'ai' },
  { re: /^TELEGRAM/i, dienst: 'telegram', groep: 'cloud' },
  { re: /^(HOME_?ASSISTANT|HASS)/i, dienst: 'home-assistant', groep: 'cloud' },
  { re: /^CLOUDFLARE|^CF_/i, dienst: 'cloudflare', groep: 'cloud' },
  { re: /^(STRIPE|PAYPAL|MOLLIE|ADYEN|PAY_)/i, dienst: 'stripe', groep: 'betaling' },
  { re: /^(SMTP|MAIL|IMAP|SENDGRID|POSTMARK|RESEND)/i, dienst: 'smtp', groep: 'mail' },
  { re: /^AUDIT_/i, dienst: 'audit', groep: 'server' },
  { re: /ENCRYPTION|(^|_)PEPPER(_|$)|(^|_)HMAC(_|$)/i, dienst: 'versleuteling', groep: 'site' },
  { re: /WEBHOOK/i, dienst: 'webhook', groep: 'cloud' },
  { re: /^(SESSION|COOKIE|JWT|CSRF|OWNER_|SITE_|APP_|STAP_OP|UITROL)/i, dienst: 'site', groep: 'site' },
];
export function afleiden(naam: string): { dienst: DienstId; groep: GeheimGroep } {
  const n = String(naam || '');
  for (const r of NAAM_REGELS) if (r.re.test(n)) return { dienst: r.dienst, groep: r.groep };
  return { dienst: 'overig', groep: 'site' };
}

/** Namen van omgevingsvariabelen die op een geheim lijken (alleen de NAAM wordt ooit gebruikt, nooit de waarde). */
const GEHEIM_NAAM = /(^|_)(SECRET|TOKEN|PASSWORD|PASSWD|PEPPER|APIKEY|API_KEY|PRIVATE_KEY|ENCRYPTION_KEY|CREDENTIALS?|DATABASE_URL|CLIENT_STATE|BEARER)(_|$)|(^|_)KEY(_V\d+)?$/i;
const GEEN_GEHEIM = /^(npm_|NODE_|PATH$|HOME$|PWD$|SHELL$|LANG|LC_|TERM|USER$|LOGNAME|HOSTNAME|PLAYWRIGHT|SSH_AUTH_SOCK|SSH_CONNECTION|SSH_CLIENT|SSH_TTY|GPG_|XDG_|DBUS_|JOURNAL_|INVOCATION_ID|SYSTEMD|CLAUDE_CODE|HTTPS?_PROXY|NO_PROXY|CA_BUNDLE|SSL_CERT|REQUESTS_CA|CURL_CA|NODE_EXTRA_CA)/i;
export const lijktOpGeheim = (naam: string) => /^[A-Za-z][A-Za-z0-9_]{1,80}$/.test(naam) && GEHEIM_NAAM.test(naam) && !GEEN_GEHEIM.test(naam);

export type GeheimBron = 'vault' | 'google' | 'platform' | 'env' | 'token';
export type GeheimStaat = 'ingesteld' | 'ontbreekt' | 'bijna' | 'verlopen' | 'ingetrokken' | 'nog-niet';
export const STAAT_NAAM: Record<GeheimStaat, Tekst> = {
  ingesteld: ['Задано', 'Ingesteld'],
  ontbreekt: ['Відсутній', 'Ontbreekt'],
  bijna: ['Скоро закінчиться', 'Loopt bijna af'],
  verlopen: ['Прострочений', 'Verlopen'],
  ingetrokken: ['Відкликаний', 'Ingetrokken'],
  'nog-niet': ['Ще не діє', 'Nog niet geldig'],
};
export const BRON_NAAM: Record<GeheimBron, Tekst> = {
  vault: ['Зашифроване сховище', 'Versleutelde kluis'],
  google: ['Google-контур', 'Google-contour'],
  platform: ['Сервер (env)', 'Server (env)'],
  env: ['Середовище сервера', 'Serveromgeving'],
  token: ['Токен', 'Token'],
};

export type Geheim = {
  /** 'vault:<id>' | 'google:<naam>' | 'platform:<NAAM>' | 'env:<NAAM>' | 'token:<id>' | 'ai:<id>' */
  id: string;
  naam: string;
  bron: GeheimBron;
  groep: GeheimGroep;
  dienst: DienstId;
  staat: GeheimStaat;
  /** Gemaskeerde weergave; heeft nooit de lengte van de waarde als die gevoelig is. */
  gemaskeerd: string;
  kanTonen: boolean;
  kanWijzigen: boolean;
  kanVerwijderen: boolean;
  /** Waarom dit geheim hier niet getoond/gewijzigd wordt en waar wel. */
  beheerdIn?: Tekst;
  doel?: string;
  aangemaaktOp?: number;
  bijgewerktOp?: number;
  verlooptOp?: number;
  laatstGebruikt?: number;
  meta?: VaultMeta;
  vaultStaat?: VaultStaat;
  notitie?: Tekst;
};

export type GeheimActie = 'aangemaakt' | 'vervangen' | 'hernoemd' | 'termijn' | 'getoond' | 'verwijderd' | 'geweigerd' | 'bekeken' | 'overig';
export const ACTIE_NAAM: Record<GeheimActie, Tekst> = {
  aangemaakt: ['Додано', 'Toegevoegd'],
  vervangen: ['Замінено значення', 'Waarde vervangen'],
  hernoemd: ['Перейменовано', 'Hernoemd'],
  termijn: ['Змінено термін / власника', 'Termijn / eigenaar gewijzigd'],
  getoond: ['Переглянуто значення', 'Waarde bekeken'],
  verwijderd: ['Видалено', 'Verwijderd'],
  geweigerd: ['Спробу відхилено', 'Poging geweigerd'],
  bekeken: ['Відкрито перелік секретів', 'Overzicht geopend'],
  overig: ['Інша дія', 'Andere actie'],
};
/** Audit-actie → soort gebeurtenis. Alleen deze acties horen bij de geheimen. */
export const AUDIT_ACTIES: Record<string, GeheimActie> = {
  'owner.api.vault.created': 'aangemaakt',
  'owner.api.vault.updated': 'vervangen',
  'owner.api.vault.renamed': 'hernoemd',
  'owner.api.vault.meta': 'termijn',
  'owner.api.vault.revealed': 'getoond',
  'owner.api.vault.deleted': 'verwijderd',
  'owner.api.vault.denied': 'geweigerd',
  'secret.toegang.geweigerd': 'geweigerd',
  'secret.overzicht.bekeken': 'bekeken',
  'access.google-contour.reveal': 'getoond',
  'access.google-contour.save': 'vervangen',
  'access.google-contour.delete': 'verwijderd',
};

export type GeheimGebeurtenis = {
  id: string;
  at: number;
  actie: GeheimActie;
  resultaat: string;
  naam: string;
  wie: { id: string; naam: string; email: string; foto: string };
  methode: string;
  apparaat: string;
  /** Alleen veilige velden (veldnamen, doel…), nooit een waarde. */
  info: string;
};

/** Gemaskeerde weergave zonder iets over de lengte te verraden. */
export const MASKER = '••••••••••••';
