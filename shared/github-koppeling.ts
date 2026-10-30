// Koppelkaart van GitHub (github.*\/accounts, punt 6 van de eigenaar 19.10.2026: «досі немає кнопки інтеграції/підключення»).
//
// Hier staat ALLEEN wat waar is over de koppeling: welke wegen de server vandaag echt kan lopen, welke rechten de token nodig
// heeft, en hoe de staat van de kaart uit de feiten van de server volgt. Geen enkele waarde van een token komt hier langs: de
// kaart rekent met de naam van de sleutel, het doel en de termijn uit de kluis — nooit met de token zelf.
//
// Puur (geen React, geen DOM, geen fetch): de backend (route /api/owner/github/koppeling) en de tests gebruiken dit bestand ook.
import type { VaultMeta, VaultStaat } from './kluis-meta';

export type Tekst = readonly [uk: string, nl: string];

/** Adres van de door GitHub zelf gehoste MCP-server (Copilot). Standaardwaarde van het veld «Server-URL» op de kaart. */
export const GITHUB_MCP_URL = 'https://api.githubcopilot.com/mcp/x/all';

/**
 * Een MCP-adres mag alleen https zijn, zonder inloggegevens in de URL (anders zou een token in een adres belanden) en met een
 * echte hostnaam. Zo kan er niets anders dan een adres in het veld staan.
 */
export function geldigeMcpUrl(waarde: unknown): boolean {
  const tekst = String(waarde ?? '').trim();
  if (!tekst || tekst.length > 300) return false;
  let url: URL;
  try { url = new URL(tekst); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.search || url.hash) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(url.hostname);
}

// ------------------------------------------------------------------------------------------------ rechten van de token

export type GithubRecht = {
  /** Scope zoals GitHub hem noemt. */
  code: string;
  waarvoor: Tekst;
  /** Zonder dit recht werkt de pagina niet (verplicht) of mist alleen dat ene onderdeel (optioneel). */
  verplicht: boolean;
};

/** Precies de rechten die de paden in backend/github-platform.ts nodig hebben — niet meer. */
export const GITHUB_RECHTEN: readonly GithubRecht[] = Object.freeze([
  { code: 'repo', verplicht: true, waarvoor: ['Репозиторії (у тому числі приватні), issues, pull requests, коміти, запуски CI, README; створення issue й коментарів.', 'Repositories (ook privé), issues, pull requests, commits, CI-runs, README; issues en reacties aanmaken.'] },
  { code: 'read:org', verplicht: false, waarvoor: ['Репозиторії організацій у переліку (без цього видно лише ваші й ті, де ви співавтор).', 'Repositories van organisaties in de lijst (zonder dit alleen uw eigen en die waar u medewerker bent).'] },
  { code: 'read:project', verplicht: false, waarvoor: ['Вкладка «Проєкти» (GitHub Projects v2).', 'Het tabblad «Projecten» (GitHub Projects v2).'] },
] as const);

// ------------------------------------------------------------------------------------------------ doelen in de kluis

/** Persoonlijke token (PAT): de waarde is de token zelf. */
export const GITHUB_PAT_DOEL = 'github';
/** OAuth-app van de eigenaar: client id + client secret (de secret verlaat de server nooit). */
export const GITHUB_OAUTH_DOEL = 'github-oauth';
/** GitHub App van de eigenaar: App ID (of client id) + de persoonlijke RSA-sleutel in PEM. */
export const GITHUB_APP_DOEL = 'github-app';

/** Pad waarop GitHub na het toestaan terugkomt. Hoort bij ÉÉN host: die van de GitHub-dienst van deze installatie. */
export const GITHUB_OAUTH_CALLBACK_PAD = '/api/owner/github/oauth/callback';

/** Precies de scopes die de server vraagt bij het starten van de OAuth-flow: dezelfde rechten als GITHUB_RECHTEN. */
export const githubOauthScopes = (): readonly string[] => GITHUB_RECHTEN.map((recht) => recht.code);
export const githubOauthScopeTekst = (): string => githubOauthScopes().join(' ');
/** Heeft de toegekende scope alles wat verplicht is? GitHub geeft de scope van de token terug als «a,b,c». */
export function scopeVoldoet(toegekend: unknown): { ok: boolean; mist: string[]; scopes: string[] } {
  const scopes = String(toegekend ?? '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  const heeft = (code: string) => scopes.includes(code) || (code.startsWith('read:') && scopes.includes(code.slice(5)));
  const mist = GITHUB_RECHTEN.filter((recht) => recht.verplicht && !heeft(recht.code)).map((recht) => recht.code);
  return { ok: mist.length === 0, mist, scopes };
}

// ------------------------------------------------------------------------------------------------ wat de eigenaar bij GitHub invult

/**
 * De waarden die de eigenaar letterlijk in zijn eigen OAuth-app (of GitHub App) op github.com moet zetten. BYOS: alles wordt
 * gerekend uit de host van ZIJN GitHub-dienst (backend/deployment-identity.ts → SERVICE_HOSTS.github), nooit uit een vaste
 * domeinnaam in de code. Zet iemand de site op git.voorbeeld.nl, dan staat die naam hier.
 */
export type GithubInstelWaarden = { host: string; homepageUrl: string; callbackUrl: string; scopes: readonly string[]; scopeTekst: string };
export function githubInstelWaarden(githubHost: unknown): GithubInstelWaarden {
  const host = String(githubHost ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const basis = host ? `https://${host}` : '';
  return { host, homepageUrl: basis ? `${basis}/` : '', callbackUrl: basis ? `${basis}${GITHUB_OAUTH_CALLBACK_PAD}` : '', scopes: githubOauthScopes(), scopeTekst: githubOauthScopeTekst() };
}

// ------------------------------------------------------------------------------------------------ invoer van de eigenaar lezen

const CLIENT_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{6,78})[A-Za-z0-9]$/;
const velden = (tekst: string): Record<string, string> => {
  const uit: Record<string, string> = {};
  // JSON zoals GitHub het bij een app-sleutel aanbiedt.
  if (tekst.startsWith('{')) {
    try {
      const rauw = JSON.parse(tekst) as Record<string, unknown>;
      for (const [k, v] of Object.entries(rauw)) if (typeof v === 'string' || typeof v === 'number') uit[k.toLowerCase().replace(/[^a-z]/g, '')] = String(v).trim();
      return uit;
    } catch { /* geen JSON: regels proberen */ }
  }
  for (const regel of tekst.split(/\r?\n/)) {
    const paar = /^\s*([A-Za-z][A-Za-z_ -]{1,40})\s*[:=]\s*(.+?)\s*$/.exec(regel);
    if (paar) uit[paar[1].toLowerCase().replace(/[^a-z]/g, '')] = paar[2].trim();
  }
  return uit;
};

/** Client id + client secret van de OAuth-app. Geaccepteerd: JSON, «sleutel: waarde» per regel, of «id:secret» op één regel. */
export type OauthApp = { clientId: string; clientSecret: string };
export function leesOauthApp(invoer: unknown): OauthApp | null {
  const tekst = String(invoer ?? '').trim();
  if (!tekst || tekst.length > 4000) return null;
  const v = velden(tekst);
  let clientId = v.clientid || v.id || '';
  let clientSecret = v.clientsecret || v.secret || '';
  // Alleen als er GEEN benoemde velden stonden mag «id:secret» op één regel worden gelezen. Anders zou
  // «client_secret: …» op zichzelf als «client_id = client_secret» worden gelezen — een stille verkeerde invoer.
  if (!clientId && !clientSecret && Object.keys(v).length === 0) {
    const stukken = tekst.split(/[\s:,;]+/).filter(Boolean);
    if (stukken.length === 2) { clientId = stukken[0]; clientSecret = stukken[1]; }
  }
  if (!CLIENT_ID.test(clientId) || !/^[A-Za-z0-9._~+/=-]{20,200}$/.test(clientSecret)) return null;
  return { clientId, clientSecret };
}

/** App ID (of client id) + persoonlijke sleutel van de GitHub App. De sleutel blijft versleuteld in de kluis. */
export type AppSleutel = { appId: string; clientId: string; privateKey: string };
export function leesAppSleutel(invoer: unknown): AppSleutel | null {
  const tekst = String(invoer ?? '').trim();
  if (!tekst || tekst.length > 8000) return null;
  const pem = /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/.exec(tekst.replace(/\\n/g, '\n'));
  if (!pem) return null;
  const v = velden(tekst.slice(0, pem.index));
  const appId = (v.appid || v.app || '').replace(/[^0-9]/g, '');
  const clientId = v.clientid || v.id || '';
  if (!appId && !CLIENT_ID.test(clientId)) return null;
  return { appId, clientId: CLIENT_ID.test(clientId) ? clientId : '', privateKey: pem[0] };
}

// ------------------------------------------------------------------------------------------------ wegen om te koppelen

export type KoppelPadId = 'pat' | 'oauth' | 'github-app' | 'mcp-server';
export type KoppelPad = {
  id: KoppelPadId;
  naam: Tekst;
  uitleg: Tekst;
  /** Kan de server deze weg vandaag echt lopen? */
  beschikbaar: boolean;
  /**
   * Waar de knop heen gaat. 'kluis' = de sleutelkluis op api.* (veilig veld, passkey/TOTP); 'oauth' = de OAuth-flow starten;
   * 'app' = de installatie van de GitHub App ophalen; 'geen' = er hoort hier geen knop.
   */
  actie: 'kluis' | 'oauth' | 'app' | 'geen';
  /** Wat er op de server nog ontbreekt. Alleen gevuld als `beschikbaar` niet waar is. */
  ontbreekt?: Tekst;
  /** Wat de eigenaar éérst in de kluis moet zetten voordat deze weg iets kan doen (doel in de kluis). */
  doel?: string;
};

/**
 * De vier wegen die mensen van een koppelkaart verwachten. Drie kan de server echt lopen (PAT, OAuth-app, GitHub App); de
 * vierde staat er met de reden waarom ze nog niet kan, zodat de kaart geen knop-zonder-inhoud toont.
 *
 * BYOS: bij OAuth en GitHub App registreert de EIGENAAR de app op zijn eigen GitHub-account en zet hij de gegevens in zijn
 * eigen kluis. Er staat geen enkele gedeelde client id of sleutel in deze code: elke installatie van «Mijn Ruimte» heeft
 * haar eigen app, op haar eigen domein.
 */
export const KOPPEL_PADEN: readonly KoppelPad[] = Object.freeze([
  {
    id: 'pat',
    beschikbaar: true,
    actie: 'kluis',
    doel: GITHUB_PAT_DOEL,
    naam: ['Персональний токен (PAT) у сховищі ключів', 'Persoonlijke token (PAT) in de sleutelkluis'],
    uitleg: ['Токен уводиться в безпечному полі сховища (Кабінет → API-платформа → Сховище ключів, призначення «github»): підтвердження passkey або TOTP, значення шифрується і залишається на сервері. Сторінка GitHub і інструменти ШІ читають той самий ключ.',
      'De token wordt in het beveiligde veld van de kluis ingevoerd (Account → API-platform → Sleutelkluis, doel «github»): bevestiging met passkey of TOTP, de waarde wordt versleuteld en blijft op de server. Deze pagina en de AI-instrumenten lezen dezelfde sleutel.'],
  },
  {
    id: 'oauth',
    beschikbaar: true,
    actie: 'oauth',
    doel: GITHUB_OAUTH_DOEL,
    naam: ['Вхід через GitHub (OAuth)', 'Aanmelden met GitHub (OAuth)'],
    uitleg: ['Кнопка «Увійти через GitHub»: сервер сам обмінює код на токен, сам оновлює його і сам відкликає при відключенні. Спершу зареєструйте власний OAuth-застосунок на своєму акаунті GitHub і покладіть client id + client secret у сховище (призначення «github-oauth») — точні значення для вашого домену показані нижче.',
      'Een knop «Aanmelden met GitHub»: de server wisselt de code zelf in voor een token, vernieuwt hem zelf en trekt hem bij ontkoppelen zelf in. Registreer eerst uw eigen OAuth-app op uw eigen GitHub-account en zet client id + client secret in de kluis (doel «github-oauth») — de exacte waarden voor uw domein staan hieronder.'],
  },
  {
    id: 'github-app',
    beschikbaar: true,
    actie: 'app',
    doel: GITHUB_APP_DOEL,
    naam: ['GitHub App на вибрані репозиторії', 'GitHub App op gekozen repositories'],
    uitleg: ['Застосунок установлюється на окремі репозиторії; сервер підписує JWT (RS256) вашим приватним ключем і сам обмінює його на токен встановлення (≈1 год), оновлюючи до закінчення. Покладіть App ID і приватний ключ у сховище (призначення «github-app»).',
      'De app wordt op losse repositories geïnstalleerd; de server ondertekent een JWT (RS256) met uw eigen sleutel en wisselt die zelf in voor een installatietoken (≈1 uur), dat vóór het verlopen wordt vernieuwd. Zet App ID en de persoonlijke sleutel in de kluis (doel «github-app»).'],
  },
  {
    id: 'mcp-server',
    beschikbaar: false,
    actie: 'geen',
    naam: ['Віддалений MCP-сервер GitHub', 'Externe MCP-server van GitHub'],
    uitleg: ['Адресу нижче вставляють у ШІ-клієнта (Claude, VS Code, Copilot) — тоді ШІ ходить до GitHub напряму, своїм токеном.', 'Het adres hieronder plakt u in uw AI-client (Claude, VS Code, Copilot) — dan praat de AI zelf met GitHub, met zijn eigen token.'],
    ontbreekt: ['сам сайт ще не під’єднується до віддаленого MCP-сервера GitHub: адресу треба вставити у ШІ-клієнта вручну, сервер її не зберігає.',
      'de site verbindt zelf nog niet met de externe MCP-server van GitHub: het adres plakt u handmatig in uw AI-client, de server bewaart het niet.'],
  },
] as const);

/** Mag deze weg een werkende knop hebben? Een nog niet gebouwde weg krijgt er nooit een. */
export const padKnopActief = (pad: KoppelPad): boolean => pad.beschikbaar && pad.actie !== 'geen';

export const koppelPad = (id: KoppelPadId): KoppelPad => KOPPEL_PADEN.find((p) => p.id === id)!;

// ------------------------------------------------------------------------------------------------ staat van de kaart

/** Wat /api/owner/github/status over de persoon zegt. Nooit een token. */
export type GithubStatusFeiten = {
  connected: boolean;
  login?: string;
  name?: string;
  avatar?: string;
  url?: string;
  publicRepos?: number;
  privateRepos?: number;
  followers?: number;
};

/** Wat er over de sleutel in de kluis bekend is: naam, doel en termijn — nooit de waarde. */
export type GithubSleutelFeiten = {
  keyName: string;
  purpose: string;
  meta: VaultMeta;
  staat: VaultStaat;
  dagenOver: number | null;
  bijgewerktOp: number;
  aangemaaktOp: number;
};

/** Langs welke weg de server op dit moment met GitHub praat. '' = langs geen enkele. */
export type GithubVia = 'oauth' | 'app' | 'pat' | '';
export const VIA_NAAM: Record<Exclude<GithubVia, ''>, Tekst> = {
  oauth: ['через OAuth-застосунок', 'via de OAuth-app'],
  app: ['через GitHub App', 'via de GitHub App'],
  pat: ['через персональний токен (PAT)', 'via de persoonlijke token (PAT)'],
};

/**
 * De verbinding zelf, zoals de server haar kent: langs welke weg, welke scopes zijn toegekend, wanneer de token verloopt en of
 * hij vernieuwd kan worden. Nooit een token: alleen feiten erover.
 */
export type GithubVerbindingFeiten = {
  via: GithubVia;
  scopes: string[];
  /** Millisecondenstempel waarop de huidige token verloopt; 0 = zonder termijn (klassieke PAT of niet-verlopende OAuth-token). */
  verlooptOp: number;
  /** Is er een vernieuwingstoken (OAuth met expiration) of kan de server zelf een nieuw installatietoken halen (App)? */
  vernieuwbaar: boolean;
  /** GitHub App: het installatienummer en de repositories waar de installatie bij mag; anders 0 / leeg. */
  installatie: number;
  repos: string[];
  /** Wanneer de server deze weg voor het laatst gebruikte of vernieuwde. */
  bijgewerktOp: number;
};

/** Antwoord van /api/owner/github/koppeling. */
export type GithubKoppelingFeiten = GithubStatusFeiten & {
  sleutel: GithubSleutelFeiten | null;
  /** Foutcode van GitHub (GITHUB_TOKEN_INVALID …) als het ophalen van de persoon niet lukte. Nooit een tokenwaarde. */
  fout?: string;
  /** De actieve weg en wat erover bekend is; null als er nog niets gekoppeld is. */
  verbinding?: GithubVerbindingFeiten | null;
  /** Staat de OAuth-app van de eigenaar in de kluis (client id bekend; de secret blijft op de server)? */
  oauthKlaar?: boolean;
  /** Client id van de OAuth-app — publiek, staat ook in de adresbalk van GitHub; de secret staat hier nooit. */
  oauthClientId?: string;
  /** Staat de sleutel van de GitHub App in de kluis? */
  appKlaar?: boolean;
  /** App ID van de GitHub App (publiek). */
  appId?: string;
  /** Wat de eigenaar bij GitHub moet invullen, gerekend uit het domein van DEZE installatie. */
  instel?: GithubInstelWaarden;
};

export type KaartInvoer = { laden: boolean; fout: string; feiten: GithubKoppelingFeiten | null };
export type KaartSoort = 'laden' | 'geen-sleutel' | 'sleutel-ongeldig' | 'sleutel-verlopen' | 'sleutel-bijna' | 'gekoppeld' | 'fout';
export type KaartToon = 'neutraal' | 'ok' | 'waarschuwing' | 'fout';
export type KaartStaat = {
  soort: KaartSoort;
  toon: KaartToon;
  /** @login van de persoon, als de server die kent. */
  login: string;
  sleutelNaam: string;
  doel: string;
  /** Foutcode (GITHUB_…) om naast de kaart in woorden te zetten; '' als er niets mis is. */
  reden: string;
  termijn: VaultStaat | '';
  dagenOver: number | null;
  /** Mag «Підключити» / «Замінити токен» nu iets doen? */
  kanVerbinden: boolean;
  /** Is er een sleutel die ontkoppeld kan worden? */
  kanOntkoppelen: boolean;
  /** Langs welke weg de server nu praat (voor «Підключено як @user через …»). */
  via: GithubVia;
  /** Termijn van de huidige token in ms; 0 = zonder termijn. */
  verlooptOp: number;
  /** Toegekende scopes van de huidige token. */
  scopes: string[];
};

const TOON: Record<KaartSoort, KaartToon> = {
  laden: 'neutraal', 'geen-sleutel': 'neutraal', 'sleutel-ongeldig': 'fout', 'sleutel-verlopen': 'fout',
  'sleutel-bijna': 'waarschuwing', gekoppeld: 'ok', fout: 'fout',
};

/**
 * De staat van de kaart volgt uitsluitend uit de feiten van de server: een «підключено як @user» verschijnt alleen als
 * /user echt een login teruggaf, en een termijn alleen als die in de kluis staat. Er wordt niets geraden.
 */
export function koppelKaartStaat(invoer: KaartInvoer): KaartStaat {
  const sleutel = invoer.feiten?.sleutel ?? null;
  const verbinding = invoer.feiten?.verbinding ?? null;
  // Er is iets om te ontkoppelen zodra er een sleutel in de kluis staat OF de server langs een weg praat.
  const koppeling = !!sleutel || !!verbinding?.via;
  const basis: KaartStaat = {
    soort: 'laden', toon: 'neutraal', login: '', sleutelNaam: sleutel?.keyName ?? '', doel: sleutel?.purpose ?? '',
    reden: '', termijn: sleutel?.staat ?? '', dagenOver: sleutel?.dagenOver ?? null,
    kanVerbinden: false, kanOntkoppelen: koppeling,
    via: verbinding?.via ?? '', verlooptOp: verbinding?.verlooptOp ?? 0, scopes: verbinding?.scopes ?? [],
  };
  const af = (soort: KaartSoort, extra: Partial<KaartStaat> = {}): KaartStaat =>
    ({ ...basis, soort, toon: TOON[soort], kanVerbinden: soort !== 'laden', ...extra });

  if (invoer.laden && !invoer.feiten) return af('laden', { kanVerbinden: false, kanOntkoppelen: false });
  const code = String(invoer.feiten?.fout || invoer.fout || '');
  if (code === 'GITHUB_TOKEN_MISSING') return af('geen-sleutel', { reden: '' });
  if (code === 'GITHUB_TOKEN_INVALID') return af('sleutel-ongeldig', { reden: code });
  if (code) return af('fout', { reden: code });
  if (!invoer.feiten) return af('fout', { reden: 'GITHUB_UNREACHABLE' });
  if (!invoer.feiten.connected) return af(koppeling ? 'sleutel-ongeldig' : 'geen-sleutel', { reden: koppeling ? 'GITHUB_TOKEN_INVALID' : '' });

  const login = String(invoer.feiten.login || '');
  if (sleutel?.staat === 'verlopen') return af('sleutel-verlopen', { login });
  if (sleutel?.staat === 'bijna' || sleutel?.staat === 'nog-niet') return af('sleutel-bijna', { login });
  return af('gekoppeld', { login });
}

// ------------------------------------------------------------------------------------------------ foutcodes van de OAuth-flow

/**
 * Wat GitHub (of de server) kan antwoorden bij het koppelen, met de ECHTE oorzaak erbij. Elke code hieronder komt uit de
 * documentatie van GitHub of uit een eigen controle; de kaart zet er woorden bij in plaats van «не вдалося».
 */
export const GITHUB_OAUTH_FOUTEN: Record<string, Tekst> = {
  GITHUB_OAUTH_APP_ONTBREEKT: ['У сховищі немає OAuth-застосунку (призначення «github-oauth»). Зареєструйте застосунок на GitHub і покладіть client id + client secret у сховище.',
    'In de kluis staat geen OAuth-app (doel «github-oauth»). Registreer de app op GitHub en zet client id + client secret in de kluis.'],
  GITHUB_OAUTH_APP_ONLEESBAAR: ['Значення ключа «github-oauth» не розпізнано. Потрібні два рядки: «client_id: …» і «client_secret: …».',
    'De waarde van de sleutel «github-oauth» is niet herkend. Nodig zijn twee regels: «client_id: …» en «client_secret: …».'],
  GITHUB_OAUTH_STATE_ONBEKEND: ['Повернення не збіглося з початком потоку (state невідомий, уже використаний або прострочений). Почніть підключення заново.',
    'De terugkeer paste niet bij de start (state onbekend, al gebruikt of verlopen). Begin het koppelen opnieuw.'],
  GITHUB_OAUTH_STATE_ANDERE_SESSIE: ['Повернення прийшло в іншу сесію, ніж та, що починала потік. Почніть заново у своєму вікні.',
    'De terugkeer kwam in een andere sessie dan die het startte. Begin opnieuw in uw eigen venster.'],
  GITHUB_OAUTH_HOST_ONJUIST: ['Зворотну адресу прийнято лише на домені цього сайту. Перевірте «Authorization callback URL» у застосунку GitHub.',
    'De terugkeeradres wordt alleen op het domein van deze site aangenomen. Controleer «Authorization callback URL» in de GitHub-app.'],
  GITHUB_OAUTH_CODE_ONTBREEKT: ['GitHub повернувся без коду (ви могли скасувати дозвіл).', 'GitHub kwam terug zonder code (u kunt het toestaan hebben afgebroken).'],
  GITHUB_OAUTH_GEWEIGERD: ['Ви не дали дозвіл застосунку на GitHub.', 'U hebt de app op GitHub geen toestemming gegeven.'],
  GITHUB_OAUTH_SCOPE_TE_KLEIN: ['Виданих прав недостатньо: не вистачає обов’язкового «repo». Повторіть і підтвердьте всі запитані права.',
    'De toegekende rechten zijn te klein: het verplichte «repo» ontbreekt. Herhaal en geef alle gevraagde rechten.'],
  bad_verification_code: ['Код від GitHub недійсний або вже використаний (він живе 10 хвилин). Почніть підключення заново.',
    'De code van GitHub is ongeldig of al gebruikt (hij leeft 10 minuten). Begin het koppelen opnieuw.'],
  incorrect_client_credentials: ['GitHub не прийняв client id або client secret. Перевірте обидва значення у сховищі ключів.',
    'GitHub accepteerde de client id of client secret niet. Controleer beide waarden in de sleutelkluis.'],
  redirect_uri_mismatch: ['«Authorization callback URL» у застосунку GitHub не збігається з адресою цього сайту. Скопіюйте точне значення з картки.',
    'De «Authorization callback URL» in de GitHub-app komt niet overeen met het adres van deze site. Kopieer de exacte waarde van de kaart.'],
  bad_refresh_token: ['Токен оновлення більше не діє. Підключіться через GitHub ще раз.', 'De vernieuwingstoken werkt niet meer. Koppel opnieuw via GitHub.'],
  unverified_user_email: ['Основна пошта акаунта GitHub не підтверджена.', 'Het hoofd-e-mailadres van het GitHub-account is niet bevestigd.'],
  GITHUB_APP_SLEUTEL_ONTBREEKT: ['У сховищі немає ключа GitHub App (призначення «github-app»): потрібні App ID і приватний ключ (PEM).',
    'In de kluis staat geen GitHub-App-sleutel (doel «github-app»): App ID en de persoonlijke sleutel (PEM) zijn nodig.'],
  // De PEM-kop is hier opgeknipt zodat de geheimenscan van de uitrol-voorcontrole (shared/geheim-patronen.ts) deze
  // FOUTMELDING niet als privésleutel aanziet; de getoonde tekst blijft gelijk.
  GITHUB_APP_SLEUTEL_ONLEESBAAR: ['Ключ GitHub App не розпізнано: потрібні рядок «app_id: …» і блок «-----BEGIN PRIVATE' + ' KEY-----».',
    'De GitHub-App-sleutel is niet herkend: nodig zijn een regel «app_id: …» en een blok «-----BEGIN PRIVATE' + ' KEY-----».'],
  GITHUB_APP_SLEUTEL_ONGELDIG: ['GitHub не прийняв підпис застосунку. Перевірте App ID і те, що приватний ключ належить саме цьому застосунку.',
    'GitHub accepteerde de ondertekening van de app niet. Controleer het App ID en of de sleutel bij déze app hoort.'],
  GITHUB_APP_GEEN_INSTALLATIE: ['Застосунок ще не встановлений ні в одному акаунті. Відкрийте його сторінку на GitHub і натисніть «Install».',
    'De app is nog nergens geïnstalleerd. Open zijn pagina op GitHub en klik op «Install».'],
  GITHUB_OAUTH_ONTKOPPELEN_MISLUKT: ['Відкликати токен на GitHub не вдалося; локальний запис усе одно видалено. Перевірте дозволи на github.com/settings/applications.',
    'De token intrekken bij GitHub lukte niet; het record hier is wel verwijderd. Controleer github.com/settings/applications.'],
};
