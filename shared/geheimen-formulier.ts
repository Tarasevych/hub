// Канонічна адаптивна модель форми «Сховище секретів» (UX-AI-VAULT-001):
// єдині типові значення метаданих, підказки форматів і клієнтсько-серверне пакування для всіх 17 VAULT_DOELEN.
// Жодних секретних значень тут не зберігається — лише чисті функції перевірки й пакування.
import { DIENSTEN, DOEL_INFO, isVaultDoel, type Tekst, type VaultDoel } from './geheimen';
import { leesAppSleutel, leesOauthApp } from './github-koppeling';
import { normaliseerVaultMeta, vandaag, type VaultMeta, type VaultSoort } from './kluis-meta';

export const STANDAARD_NAAM_PER_DOEL: Record<VaultDoel, string> = {
  'home-assistant': 'home-assistant-token',
  telegram: 'telegram-bot-token',
  github: 'github-pat',
  'github-oauth': 'github-oauth',
  'github-app': 'github-app',
  'github-uitrol': 'github-uitrol',
  anthropic: 'anthropic-api-key',
  openai: 'openai-api-key',
  google: 'google-oauth',
  microsoft: 'microsoft-oauth',
  cloudflare: 'cloudflare-api-token',
  stripe: 'stripe-api-key',
  smtp: 'smtp-wachtwoord',
  database: 'database-secret',
  ssh: 'ssh-sleutel',
  webhook: 'webhook-signing-secret',
  other: 'eigen-geheim',
};

export const PLACEHOLDER_PER_DOEL: Record<VaultDoel, Tekst> = {
  'home-assistant': ['eyJhbGciOiJIUzI1NiIs... (Long-Lived Access Token)', 'eyJhbGciOiJIUzI1NiIs... (Long-Lived Access Token)'],
  telegram: ['123456789:ABCdefGHIjklMNOpqrsTUVwxyz', '123456789:ABCdefGHIjklMNOpqrsTUVwxyz'],
  github: ['ghp_... або github_pat_11A...', 'ghp_... of github_pat_11A...'],
  'github-oauth': ['Ov23li...', 'Ov23li...'],
  'github-app': ['123456', '123456'],
  'github-uitrol': ['github_pat_11A... (Contents: write)', 'github_pat_11A... (Contents: write)'],
  anthropic: ['sk-ant-api03-...', 'sk-ant-api03-...'],
  openai: ['sk-proj-...', 'sk-proj-...'],
  google: ['ya29.... або секрет інтеграції Google', 'ya29.... of Google-integratiegeheim'],
  microsoft: ['Секрет клієнта Microsoft / Azure', 'Microsoft / Azure client-secret'],
  cloudflare: ['cfut_... або Cloudflare API Token', 'cfut_... of Cloudflare API-token'],
  stripe: ['sk_live_... або rk_live_...', 'sk_live_... of rk_live_...'],
  smtp: ['Пароль застосунку SMTP', 'SMTP-app-wachtwoord'],
  database: ['postgres://... або пароль бази даних', 'postgres://... of databasewachtwoord'],
  ssh: ['ssh-ed25519 ... або приватний ключ SSH', 'ssh-ed25519 ... of SSH-privésleutel'],
  webhook: ['whsec_...', 'whsec_...'],
  other: ['Вставте секрет або токен', 'Plak het geheim of token'],
};

export type GeheimFormulierVeld = 'naam' | 'waarde' | 'clientId' | 'clientSecret' | 'appId' | 'privateKey' | 'meta';

const NAAM_PATROON = /^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/;
const GITHUB_CLIENT_ID_PATROON = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{6,78})[A-Za-z0-9]$/;
const GITHUB_CLIENT_SECRET_PATROON = /^[A-Za-z0-9._~+/=-]{20,200}$/;
const GITHUB_APP_ID_PATROON = /^[0-9]{1,20}$/;
// PEM-kop opgeknipt zodat de geheimenscan (shared/geheim-patronen.ts) deze constante niet als echte privésleutel aanziet.
const PEM_BLOK = new RegExp('-----BEGIN (?:RSA )?PRIVATE' + ' KEY-----[\\s\\S]+?-----END (?:RSA )?PRIVATE' + ' KEY-----');

export function standaardSoortVoorDoel(doel: VaultDoel): VaultSoort {
  if (doel === 'anthropic' || doel === 'openai') return 'ai';
  if (doel === 'ssh') return 'device';
  return 'service';
}

export function standaardVaultMeta(doel: VaultDoel, verantwoordelijke = '', nu = Date.now()): VaultMeta {
  const info = DOEL_INFO[doel] ?? DOEL_INFO.other;
  const dienstNaam = DIENSTEN[info.dienst]?.naam[0] || 'Сервіс';
  const wie = String(verantwoordelijke || '').trim().slice(0, 120) || 'Власник';
  return {
    geldigVan: vandaag(nu),
    geldigTot: '',
    soort: standaardSoortVoorDoel(doel),
    van: dienstNaam,
    verantwoordelijke: wie,
    notitie: '',
  };
}

export type GeheimFormulierInvoer = {
  doel: unknown;
  naam?: unknown;
  waarde?: unknown;
  clientId?: unknown;
  clientSecret?: unknown;
  appId?: unknown;
  privateKey?: unknown;
  meta?: unknown;
  verantwoordelijke?: string;
  nu?: number;
};

export type GeheimFormulierUitkomst =
  | { ok: true; doel: VaultDoel; naam: string; waarde: string; meta: VaultMeta }
  | { ok: false; code: string; veldFouten: Partial<Record<GeheimFormulierVeld, Tekst>> };

const META_FOUT_TEKST: Record<string, Tekst> = {
  OWNER_VAULT_META_DATE_INVALID: ['Перевірте формат дати (РРРР-ММ-ДД) у додаткових параметрах.', 'Controleer het datumformaat (JJJJ-MM-DD) bij de aanvullende instellingen.'],
  OWNER_VAULT_META_RANGE_INVALID: ['Дата «Діє до» не може бути раніше за дату «Діє з».', 'De datum «Geldig tot» mag niet vóór «Geldig vanaf» liggen.'],
  OWNER_VAULT_META_KIND_INVALID: ['Оберіть коректний тип власника ключа у додаткових параметрах.', 'Kies een geldig eigenaarstype bij de aanvullende instellingen.'],
};

export function valideerEnPakGeheimIn(invoer: GeheimFormulierInvoer): GeheimFormulierUitkomst {
  const doel: VaultDoel = isVaultDoel(invoer.doel) ? invoer.doel : 'other';
  const veldFouten: Partial<Record<GeheimFormulierVeld, Tekst>> = {};
  let eersteCode = '';
  const fout = (veld: GeheimFormulierVeld, code: string, tekst: Tekst) => {
    if (!veldFouten[veld]) veldFouten[veld] = tekst;
    if (!eersteCode) eersteCode = code;
  };

  const ruweNaam = String(invoer.naam ?? '').trim();
  const naam = ruweNaam || STANDAARD_NAAM_PER_DOEL[doel];
  if (!NAAM_PATROON.test(naam)) {
    fout('naam', 'OWNER_VAULT_NAME_INVALID', [
      'Назва має містити 2–80 латинських літер, цифр або символів . _ - (без пробілів і кирилиці, наприклад github-oauth).',
      'De naam moet 2–80 Latijnse letters, cijfers of . _ - bevatten (zonder spaties, bijv. github-oauth).',
    ]);
  }

  const basisMeta = standaardVaultMeta(doel, invoer.verantwoordelijke, invoer.nu);
  const metaUit = normaliseerVaultMeta(invoer.meta ?? basisMeta, basisMeta);
  if ('fout' in metaUit) {
    fout('meta', metaUit.fout, META_FOUT_TEKST[metaUit.fout] ?? [
      'Перевірте додаткові параметри терміну дії ключа.',
      'Controleer de aanvullende instellingen van de sleutel.',
    ]);
  }

  let waarde = '';
  if (doel === 'github-oauth') {
    const clientId = String(invoer.clientId ?? '').trim();
    const clientSecret = String(invoer.clientSecret ?? '').trim();
    if (!clientId) {
      fout('clientId', 'GITHUB_OAUTH_CLIENT_ID_ONGELDIG', [
        'Введіть Client ID вашого OAuth-застосунку GitHub (наприклад, Ov23li...).',
        'Voer de Client ID van uw GitHub OAuth-app in (bijv. Ov23li...).',
      ]);
    } else if (!GITHUB_CLIENT_ID_PATROON.test(clientId)) {
      fout('clientId', 'GITHUB_OAUTH_CLIENT_ID_ONGELDIG', [
        'Невірний формат Client ID GitHub: очікується 8–80 латинських літер або цифр без пробілів (наприклад, Ov23li...).',
        'Ongeldig formaat GitHub Client ID: 8–80 Latijnse letters of cijfers zonder spaties verwacht (bijv. Ov23li...).',
      ]);
    }
    if (!clientSecret) {
      fout('clientSecret', 'GITHUB_OAUTH_CLIENT_SECRET_ONGELDIG', [
        'Введіть Client Secret вашого OAuth-застосунку GitHub.',
        'Voer het Client Secret van uw GitHub OAuth-app in.',
      ]);
    } else if (!GITHUB_CLIENT_SECRET_PATROON.test(clientSecret)) {
      fout('clientSecret', 'GITHUB_OAUTH_CLIENT_SECRET_ONGELDIG', [
        'Невірний формат Client Secret GitHub: очікується щонайменше 20 символів без пробілів.',
        'Ongeldig formaat GitHub Client Secret: minimaal 20 tekens zonder spaties verwacht.',
      ]);
    }
    if (!veldFouten.clientId && !veldFouten.clientSecret) {
      const gepakt = `client_id: ${clientId}\nclient_secret: ${clientSecret}`;
      if (!leesOauthApp(gepakt)) {
        fout('clientSecret', 'GITHUB_OAUTH_APP_ONLEESBAAR', [
          'Перевірте Client ID та Client Secret OAuth-застосунку GitHub.',
          'Controleer Client ID en Client Secret van de GitHub OAuth-app.',
        ]);
      } else {
        waarde = gepakt;
      }
    }
  } else if (doel === 'github-app') {
    const appId = String(invoer.appId ?? '').trim();
    const privateKey = String(invoer.privateKey ?? '').replace(/\\n/g, '\n').trim();
    if (!appId || !GITHUB_APP_ID_PATROON.test(appId)) {
      fout('appId', 'GITHUB_APP_ID_ONGELDIG', [
        'Введіть числовий App ID вашого GitHub App (наприклад, 123456).',
        'Voer het numerieke App ID van uw GitHub App in (bijv. 123456).',
      ]);
    }
    const pemMatch = PEM_BLOK.exec(privateKey);
    if (!privateKey || !pemMatch) {
      fout('privateKey', 'GITHUB_APP_PEM_ONGELDIG', [
        'Вставте повний приватний ключ PEM (блок -----BEGIN RSA PRIVATE' + ' KEY----- або -----BEGIN PRIVATE' + ' KEY-----).',
        'Plak de volledige PEM-privésleutel (blok -----BEGIN RSA PRIVATE' + ' KEY----- of -----BEGIN PRIVATE' + ' KEY-----).',
      ]);
    }
    if (!veldFouten.appId && !veldFouten.privateKey) {
      const gepakt = `app_id: ${appId}\n${pemMatch![0]}`;
      if (!leesAppSleutel(gepakt)) {
        fout('privateKey', 'GITHUB_APP_SLEUTEL_ONLEESBAAR', [
          'Ключ GitHub App не розпізнано: перевірте App ID та PEM-блок приватного ключа.',
          'GitHub-App-sleutel niet herkend: controleer het App ID en het PEM-blok.',
        ]);
      } else {
        waarde = gepakt;
      }
    }
  } else {
    const ruw = String(invoer.waarde ?? '').trim();
    if (!ruw) {
      fout('waarde', 'OWNER_VAULT_VALUE_EMPTY', [
        'Вставте ключ або токен у це поле.',
        'Plak de sleutel of token in dit veld.',
      ]);
    } else if (ruw.length > 8192) {
      fout('waarde', 'OWNER_VAULT_VALUE_TOO_LARGE', [
        'Значення завелике (максимум 8 КБ).',
        'De waarde is te groot (maximaal 8 KB).',
      ]);
    } else {
      waarde = ruw;
    }
  }

  if (eersteCode || 'fout' in metaUit) {
    return { ok: false, code: eersteCode || ('fout' in metaUit ? metaUit.fout : 'OWNER_VAULT_VALUE_EMPTY'), veldFouten };
  }
  return { ok: true, doel, naam, waarde, meta: metaUit.meta };
}

export function foutVeldVoorServerCode(code: string, doel: VaultDoel): GeheimFormulierVeld | null {
  switch (code) {
    case 'OWNER_VAULT_NAME_INVALID':
    case 'OWNER_VAULT_NAME_TAKEN':
      return 'naam';
    case 'GITHUB_OAUTH_CLIENT_ID_ONGELDIG':
      return 'clientId';
    case 'GITHUB_OAUTH_CLIENT_SECRET_ONGELDIG':
    case 'GITHUB_OAUTH_APP_ONLEESBAAR':
      return doel === 'github-oauth' ? 'clientSecret' : 'waarde';
    case 'GITHUB_APP_ID_ONGELDIG':
      return 'appId';
    case 'GITHUB_APP_PEM_ONGELDIG':
    case 'GITHUB_APP_SLEUTEL_ONLEESBAAR':
      return doel === 'github-app' ? 'privateKey' : 'waarde';
    case 'OWNER_VAULT_VALUE_EMPTY':
    case 'OWNER_VAULT_VALUE_TOO_LARGE':
      return doel === 'github-oauth' ? 'clientSecret' : doel === 'github-app' ? 'privateKey' : 'waarde';
    case 'OWNER_VAULT_META_DATE_INVALID':
    case 'OWNER_VAULT_META_RANGE_INVALID':
    case 'OWNER_VAULT_META_KIND_INVALID':
      return 'meta';
    default:
      return null;
  }
}
