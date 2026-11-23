// UI-015 — nieuwe aanmeld-aanbieders (vlag aanmeldmethoden-vnext, migratie 0198): de LEVENDE statusroute, de zelftest en de
// ECHTE koppelcontouren voor Microsoft en Discord (OAuth2 code flow + PKCE), Telegram (Login Widget met HMAC-SHA256) en
// Apple (Sign in with Apple; clientgeheim = ES256-JWT uit de p8-sleutel). Dit bestand KOPPELT en TOONT alleen; het geeft zelf GEEN sessies uit. Contract: shared/aanmeld-vnext-model.ts.
// Віха M2 (UI-015B, №168): посилені перевірки формату AANMELD_MICROSOFT_TENANT, синонім AANMELD_APPLE_SERVICES_ID,
// валідація форми ключів без розкриття таємниць, ротація JWKS kid, константно-часовий nonce, azp/iat/nbf/sub,
// мережевий ліміт часу AbortController 10 с, одноразовість вікна входу Telegram та знімок aanbiedersVoorToegangsSnapshot.
import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign as cryptoSign,
  timingSafeEqual,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';
import { db, error, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { alsSysteem } from '../server/platform/context';
import { getPool } from '../server/platform/pg';
import type { RouterContext, RouterMiddleware, RouterResponse } from '../server/platform/router';
import { AANMELD_AANBIEDERS, aanmeldAanbieder, type AanmeldAanbieder } from '../shared/aanmeld-vnext-model';
import { magEigenToegang } from '../shared/eigen-toegang';
import { aanmeldVlagVoor, laatsteWegFout } from './aanmeld-wegen';
import { meldBeveiligingsWijziging } from './beveiliging-meldingen';
import { koppelBindingKlopt, koppelBindingVoorAanmaken, koppelBindingWissen, metBindingCookie } from './koppel-binding';
import {
  instellingen as tgInstellingen,
  koppelingenVanGebruiker as tgKoppelingenVan,
  vlagHoofdschakelaar as tgVlagAan,
} from './telegram-aanmelden/opslag';
import { botSleutel as kluisBotSleutel } from './telegram-aanmelden/sleutels';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
const DIENSTEN = ['identity', 'hub', 'id'] as const;

// ------------------------------------------------------------------------------------------------ opslagvormen
const KOPPELINGEN = 'aanmeld_koppelingen_v1';
const STATES = 'aanmeld_states_v1';
const ZELFTESTS = 'aanmeld_zelftest_v1';
const STATE_TTL_MS = 10 * 60 * 1000;
const TELEGRAM_VERS_SEC = 10 * 60;
const HTTP_LIMIET_MS = 10_000;

type KoppelRecord = { ownerUserId: string; aanbieder: string; subject: string; label: string; op: string };
type StateRecord = {
  ownerUserId: string;
  aanbieder: string;
  stateHash: string;
  bindingHash: string;
  verifier: string;
  nonce: string;
  aangemaaktOp: number;
  verlooptOp: number;
  gebruiktOp: number;
};
type ZelftestRecord = { aanbieder: string; zelftest: 'ok' | 'fout'; details: string[]; op: string; doorUserId: string };

// ------------------------------------------------------------------------------------------------ kleine hulpjes (puur)
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const nu = (): string => new Date().toISOString();
const sha256hex = (v: string): string => createHash('sha256').update(v).digest('hex');
const b64url = (b: Buffer): string => b.toString('base64url');
const fout = (code: string, retryAfter = 0): never => {
  throw retryAfter > 0 ? Object.assign(new Error(code), { retryAfter }) : new Error(code);
};
const env = (naam: string): string => String(process.env[naam] ?? '').trim();

/** Ідентифікатор клієнта Apple із підтримкою синоніма AANMELD_APPLE_SERVICES_ID (UI-015B). */
const appleClientId = (): string => env('AANMELD_APPLE_CLIENT_ID') || env('AANMELD_APPLE_SERVICES_ID');

const sleutelAanwezig = (naam: string): boolean =>
  naam === 'AANMELD_APPLE_CLIENT_ID' ? appleClientId().length > 0 : env(naam).length > 0;
const sleutelsOntbreken = (a: AanmeldAanbieder): string[] => (a.vereist ?? []).filter((naam) => !sleutelAanwezig(naam));

/** Валідація орендаря Microsoft (AANMELD_MICROSOFT_TENANT): common, consumers, organizations, UUID або чистий домен. */
const MS_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MS_DOMEIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isGeldigeMicrosoftTenant(tenant: string): boolean {
  const t = String(tenant || '').trim();
  if (!t || t.length > 128) return false;
  const laag = t.toLowerCase();
  if (laag === 'common' || laag === 'consumers' || laag === 'organizations') return true;
  return MS_UUID_RE.test(t) || MS_DOMEIN_RE.test(t);
}

function microsoftTenant(): { tenant: string; geldig: boolean } {
  const ruw = env('AANMELD_MICROSOFT_TENANT');
  if (!ruw) return { tenant: 'common', geldig: true };
  if (isGeldigeMicrosoftTenant(ruw)) return { tenant: ruw, geldig: true };
  return { tenant: 'common', geldig: false };
}

async function fetchMetLimiet(url: string, init: RequestInit = {}, limietMs = HTTP_LIMIET_MS): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), limietMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function telegramEffectieveSleutels(): Promise<{ token: string; naam: string; uitKluis: boolean }> {
  const envToken = env('AANMELD_TELEGRAM_BOT_TOKEN');
  const envNaam = env('AANMELD_TELEGRAM_BOT_NAAM');
  if (envToken || envNaam) return { token: envToken, naam: envNaam, uitKluis: false };
  if (!(await tgVlagAan().catch(() => false))) return { token: '', naam: '', uitKluis: false };
  const token = await kluisBotSleutel().catch(() => '');
  if (!token) return { token: '', naam: '', uitKluis: false };
  const inst = await tgInstellingen().catch(() => null);
  return { token, naam: inst?.botGebruikersnaam || 'MijnRuimte_Bot', uitKluis: true };
}

export async function sleutelsOntbrekenVoor(a: AanmeldAanbieder): Promise<string[]> {
  if (a.id === 'telegram') {
    const tg = await telegramEffectieveSleutels();
    const weg: string[] = [];
    if (!tg.token) weg.push('AANMELD_TELEGRAM_BOT_TOKEN');
    if (!tg.naam) weg.push('AANMELD_TELEGRAM_BOT_NAAM');
    return weg;
  }
  return sleutelsOntbreken(a);
}

/**
 * Перевірка форми налаштованих секретів постачальника (UI-015B).
 * Ніколи не повертає значень секретів — виключно назву змінної та фіксоване двомовне або українське пояснення.
 */
export async function sleutelVormFouten(id: string): Promise<string[]> {
  const fouten: string[] = [];
  if (id === 'microsoft') {
    const tenantRuw = env('AANMELD_MICROSOFT_TENANT');
    if (tenantRuw && !isGeldigeMicrosoftTenant(tenantRuw)) {
      fouten.push('AANMELD_MICROSOFT_TENANT: недійсний формат орендаря (дозволено common, consumers, organizations, UUID або домен)');
    }
    const geheim = env('AANMELD_MICROSOFT_CLIENT_SECRET');
    if (geheim && geheim.length < 8) {
      fouten.push('AANMELD_MICROSOFT_CLIENT_SECRET: закороткий ключ');
    }
  } else if (id === 'discord') {
    const geheim = env('AANMELD_DISCORD_CLIENT_SECRET');
    if (geheim && geheim.length < 8) {
      fouten.push('AANMELD_DISCORD_CLIENT_SECRET: закороткий ключ');
    }
  } else if (id === 'apple') {
    const team = env('AANMELD_APPLE_TEAM_ID');
    if (team && !/^[A-Za-z0-9]{6,20}$/.test(team)) {
      fouten.push('AANMELD_APPLE_TEAM_ID: очікується 6–20 літер або цифр');
    }
    const kid = env('AANMELD_APPLE_KEY_ID');
    if (kid && !/^[A-Za-z0-9]{6,24}$/.test(kid)) {
      fouten.push('AANMELD_APPLE_KEY_ID: очікується 6–24 літери або цифри');
    }
    const pemRuw = env('AANMELD_APPLE_PRIVATE_KEY');
    if (pemRuw) {
      const pem = pemRuw.replace(/\\n/g, '\n');
      const pkcs8Kop = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
      if (!pem.includes(pkcs8Kop)) {
        fouten.push('AANMELD_APPLE_PRIVATE_KEY: очікується ключ у форматі PKCS#8 PEM');
      } else {
        try {
          createPrivateKey(pem);
        } catch {
          fouten.push('AANMELD_APPLE_PRIVATE_KEY: приватний ключ PEM пошкоджений або не підтримується');
        }
      }
    }
  } else if (id === 'telegram') {
    const tg = await telegramEffectieveSleutels();
    if (tg.token && !/^\d{3,20}:[A-Za-z0-9_-]{20,}$/.test(tg.token)) {
      fouten.push('AANMELD_TELEGRAM_BOT_TOKEN: не схожий на ключ бота (123456:…)');
    }
    if (tg.naam && !/^[A-Za-z0-9_]{4,32}$/.test(tg.naam)) {
      fouten.push('AANMELD_TELEGRAM_BOT_NAAM: очікується 4–32 літери, цифри або _');
    }
  }
  return fouten;
}

/** Label maskeren vóór opslag: nooit het volledige adres/de volledige naam bewaren of tonen. */
export function maskLabel(ruw: string): string {
  const v = String(ruw || '').trim();
  if (!v) return '•••';
  const at = v.indexOf('@');
  if (at > 0) {
    const naam = v.slice(0, at);
    return `${naam.slice(0, 2)}…@${v.slice(at + 1)}`;
  }
  return v.length <= 4 ? `${v[0]}…` : `${v.slice(0, 2)}…${v.slice(-2)}`;
}

/** Terug-/redirectbasis: in productie het echte id-domein; in tests overschrijfbaar. Nooit uit het verzoek afgeleid. */
const terugBasis = (): string => env('AANMELD_TERUG_BASIS') || 'https://id.tarasevych.com';
const callbackUrl = (id: string): string => `${terugBasis()}/api/aanmeld/koppel/${id}/terug`;
export const aanmeldTerugBasis = terugBasis;
const paginaUrl = (q: string): string => `${terugBasis()}/aanmeldmethoden?koppel=${q}`;
const redirect = (naar: string): RouterResponse => ({
  statusCode: 302,
  headers: { Location: naar, 'Cache-Control': 'no-store' },
  body: '',
});

// ------------------------------------------------------------------------------------------------ aanbieder-contouren
const basisVan = (id: string, standaard: string): string => (env(`AANMELD_${id.toUpperCase()}_BASIS`) || standaard).replace(/\/+$/, '');
const MS = () => {
  const b = basisVan('microsoft', 'https://login.microsoftonline.com');
  const { tenant } = microsoftTenant();
  return {
    authorize: `${b}/${tenant}/oauth2/v2.0/authorize`,
    token: `${b}/${tenant}/oauth2/v2.0/token`,
    jwks: `${b}/${tenant}/discovery/v2.0/keys`,
    issBasis: b,
    tenant,
  };
};
const DISCORD = () => {
  const b = basisVan('discord', 'https://discord.com');
  return { authorize: `${b}/oauth2/authorize`, token: `${b}/api/oauth2/token`, mij: `${b}/api/users/@me` };
};
const APPLE = () => {
  const b = basisVan('apple', 'https://appleid.apple.com');
  return { authorize: `${b}/auth/authorize`, token: `${b}/auth/token`, jwks: `${b}/auth/keys`, issBasis: b };
};

// ---- JWT-hulpjes zonder extra afhankelijkheden ----
type JwtDelen = { kop: Record<string, unknown>; inhoud: Record<string, unknown>; getekend: string; handtekening: Buffer };
function jwtLezen(token: string): JwtDelen {
  const delen = String(token || '').split('.');
  if (delen.length !== 3) fout('TOKEN_ONGELDIG');
  const lees = (s: string) => {
    try {
      return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Record<string, unknown>;
    } catch {
      return fout('TOKEN_ONGELDIG') as never;
    }
  };
  return { kop: lees(delen[0]), inhoud: lees(delen[1]), getekend: `${delen[0]}.${delen[1]}`, handtekening: Buffer.from(delen[2], 'base64url') };
}

/** Apple-clientgeheim: ES256-JWT uit de p8-sleutel van de eigenaar (TTL 5 minuten). */
export function appleClientSecret(nuMs = Date.now()): string {
  const sleutel = createPrivateKey(env('AANMELD_APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'));
  const kop = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', kid: env('AANMELD_APPLE_KEY_ID') })));
  const inhoud = b64url(
    Buffer.from(
      JSON.stringify({
        iss: env('AANMELD_APPLE_TEAM_ID'),
        iat: Math.floor(nuMs / 1000),
        exp: Math.floor(nuMs / 1000) + 300,
        aud: 'https://appleid.apple.com',
        sub: appleClientId(),
      }),
    ),
  );
  const handtekening = cryptoSign('sha256', Buffer.from(`${kop}.${inhoud}`), { key: sleutel, dsaEncoding: 'ieee-p1363' });
  return `${kop}.${inhoud}.${b64url(handtekening)}`;
}

// Проміжне сховище JWKS (10 хв) з одноразовим примусовим оновленням при ротації kid (UI-015B).
const jwksCache = new Map<string, { op: number; sleutels: Array<Record<string, unknown>> }>();
export const _jwksCacheLeeg = (): void => jwksCache.clear();

async function laadJwks(url: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetchMetLimiet(url, { headers: { accept: 'application/json' } });
  if (!r || !r.ok) fout('TOKEN_ONGELDIG');
  const data = (await r!.json().catch(() => null)) as { keys?: Array<Record<string, unknown>> } | null;
  const sleutels = Array.isArray(data?.keys) ? data!.keys! : [];
  jwksCache.set(url, { op: Date.now(), sleutels });
  return sleutels;
}

async function jwksSleutel(url: string, kid: string): Promise<KeyObject> {
  const c = jwksCache.get(url);
  const uitCache = Boolean(c && Date.now() - c.op < 10 * 60 * 1000);
  let sleutels = uitCache ? c!.sleutels : await laadJwks(url);
  const zoekJwk = (lijst: Array<Record<string, unknown>>) =>
    lijst.find((k) => String(k.kid || '') === kid) || (!kid && lijst.length === 1 ? lijst[0] : lijst.length === 1 && !lijst[0]?.kid ? lijst[0] : undefined);
  let jwk = zoekJwk(sleutels);
  if (!jwk && uitCache) {
    sleutels = await laadJwks(url);
    jwk = zoekJwk(sleutels);
  }
  if (!jwk) fout('TOKEN_ONGELDIG');
  try {
    return createPublicKey({ key: jwk as never, format: 'jwk' });
  } catch {
    return fout('TOKEN_ONGELDIG') as never;
  }
}

/** Перевірка id_token: підпис (RS256/ES256 через JWKS), iss, aud, azp, exp, iat, nbf та константно-часовий nonce. */
async function idTokenControle(
  token: string,
  o: { jwksUrl: string; issToegestaan: (iss: string) => boolean; aud: string; nonce: string },
): Promise<Record<string, unknown>> {
  const { kop, inhoud, getekend, handtekening } = jwtLezen(token);
  const alg = String(kop.alg || '');
  if (alg !== 'RS256' && alg !== 'ES256') fout('TOKEN_ONGELDIG');
  const sleutel = await jwksSleutel(o.jwksUrl, String(kop.kid || ''));
  const goed = cryptoVerify(
    'sha256',
    Buffer.from(getekend),
    alg === 'ES256' ? { key: sleutel, dsaEncoding: 'ieee-p1363' } : sleutel,
    handtekening,
  );
  if (!goed) fout('HANDTEKENING_ONGELDIG');
  if (!o.issToegestaan(String(inhoud.iss || ''))) fout('TOKEN_ONGELDIG');
  const aud = inhoud.aud;
  if (!(aud === o.aud || (Array.isArray(aud) && aud.includes(o.aud)))) fout('TOKEN_ONGELDIG');
  if (Array.isArray(aud) && aud.length > 1 && String(inhoud.azp || '') !== o.aud) fout('TOKEN_ONGELDIG');
  const nuSec = Math.floor(Date.now() / 1000);
  if (Number(inhoud.exp || 0) <= nuSec) fout('VERLOPEN');
  if (typeof inhoud.iat === 'number' && inhoud.iat - 60 > nuSec) fout('TOKEN_ONGELDIG');
  if (typeof inhoud.nbf === 'number' && inhoud.nbf - 60 > nuSec) fout('TOKEN_ONGELDIG');
  const sub = str(inhoud.sub);
  if (!sub || sub.length > 255) fout('TOKEN_ONGELDIG');
  if (o.nonce) {
    const gekregen = Buffer.from(String(inhoud.nonce || ''), 'utf8');
    const verwacht = Buffer.from(o.nonce, 'utf8');
    if (gekregen.length !== verwacht.length || !timingSafeEqual(gekregen, verwacht)) fout('STATE_ONGELDIG');
  }
  return inhoud;
}

// ------------------------------------------------------------------------------------------------ state (eenmalig, 10 min, browsergebonden)
async function stateNieuw(ownerUserId: string, aanbieder: string): Promise<{ state: string; verifier: string; nonce: string; setCookie: string }> {
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const nonce = b64url(randomBytes(18));
  const stateHash = sha256hex(state);
  const binding = koppelBindingVoorAanmaken('koppel', stateHash, ownerUserId);
  const rij: StateRecord = {
    ownerUserId,
    aanbieder,
    stateHash,
    bindingHash: binding.bindingHash,
    verifier,
    nonce,
    aangemaaktOp: Date.now(),
    verlooptOp: Date.now() + STATE_TTL_MS,
    gebruiktOp: 0,
  };
  await db.add(STATES, [rij as unknown as Record<string, unknown>]);
  return { state, verifier, nonce, setCookie: binding.setCookie };
}

async function stateInnemen(aanbieder: string, state: string, event: Record<string, unknown> | null | undefined): Promise<{ id: string } & StateRecord> {
  if (!state) fout('STATE_ONGELDIG');
  const { items } = await db.list<StateRecord>(STATES, { filter: { stateHash: sha256hex(state), aanbieder }, limit: 2 });
  const rij = (items as Array<{ id: string } & StateRecord>)[0];
  if (!rij) fout('STATE_ONGELDIG');
  if (rij.gebruiktOp) fout('STATE_ONGELDIG');
  const nuMs = Date.now();
  if (rij.verlooptOp <= nuMs) fout('VERLOPEN');
  if (!koppelBindingKlopt(event, 'koppel', rij.stateHash, rij.ownerUserId, rij.bindingHash)) fout('SESSIE_VEREIST');
  const claim = await getPool('systeem').query(
    `UPDATE app.records
        SET data = jsonb_set(data, '{gebruiktOp}', to_jsonb($3::bigint)),
            updated_at = now()
      WHERE id = $1
        AND tbl = $2
        AND COALESCE((data->>'gebruiktOp')::bigint, 0) = 0
        AND COALESCE((data->>'verlooptOp')::bigint, 0) > $3
    RETURNING id`,
    [rij.id, STATES, nuMs],
  );
  if (!claim.rowCount) fout('STATE_ONGELDIG');
  return rij;
}

// ------------------------------------------------------------------------------------------------ koppelingen en zelftest
async function koppelingVan(ownerUserId: string, aanbieder: string): Promise<({ id: string } & KoppelRecord) | null> {
  const { items } = await db.list<KoppelRecord>(KOPPELINGEN, { filter: { ownerUserId, aanbieder }, limit: 1 });
  return (items as Array<{ id: string } & KoppelRecord>)[0] || null;
}

async function subjectBestaat(aanbieder: string, subject: string): Promise<boolean> {
  const { items } = await db.list<KoppelRecord>(KOPPELINGEN, { filter: { aanbieder, subject }, limit: 1 });
  return items.length > 0;
}

export async function koppelingEigenaar(aanbieder: string, subject: string): Promise<string | null> {
  if (!aanbieder || !subject) return null;
  const { items } = await db.list<KoppelRecord>(KOPPELINGEN, { filter: { aanbieder, subject }, limit: 2 });
  const rijen = items as Array<{ id: string } & KoppelRecord>;
  return rijen.length === 1 && rijen[0].ownerUserId ? rijen[0].ownerUserId : null;
}

export async function externKlaar(id: 'microsoft' | 'discord' | 'apple'): Promise<boolean> {
  const a = aanmeldAanbieder(id);
  if (!a || a.stand !== 'sleutels-nodig') return false;
  if ((await sleutelsOntbrekenVoor(a)).length) return false;
  if ((await sleutelVormFouten(id)).length) return false;
  return (await zelftestLaatste(id).catch(() => null))?.zelftest === 'ok';
}

export function externAutoriseerUrl(id: 'microsoft' | 'discord' | 'apple', o: { state: string; challenge: string; nonce: string }): string {
  const clientId = id === 'apple' ? appleClientId() : env(`AANMELD_${id.toUpperCase()}_CLIENT_ID`);
  const basis: Record<string, string> = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callbackUrl(id),
    state: o.state,
    code_challenge: o.challenge,
    code_challenge_method: 'S256',
  };
  return id === 'microsoft'
    ? `${MS().authorize}?${new URLSearchParams({ ...basis, scope: 'openid profile email', nonce: o.nonce, response_mode: 'query' })}`
    : id === 'discord'
      ? `${DISCORD().authorize}?${new URLSearchParams({ ...basis, scope: 'identify email', prompt: 'consent' })}`
      : `${APPLE().authorize}?${new URLSearchParams({ ...basis, nonce: o.nonce, response_mode: 'query' })}`;
}

export async function externIdentiteit(
  id: 'microsoft' | 'discord' | 'apple',
  query: Record<string, string>,
  o: { verifier: string; nonce: string },
): Promise<{ subject: string; label: string }> {
  if (str(query.error)) fout('TOKEN_ONGELDIG');
  return oauthTerug(id, query, { verifier: o.verifier, nonce: o.nonce } as StateRecord);
}

async function zelftestLaatste(aanbieder: string): Promise<({ id: string } & ZelftestRecord) | null> {
  const { items } = await alsSysteem(() => db.list<ZelftestRecord>(ZELFTESTS, { filter: { aanbieder }, limit: 5 }));
  const rijen = items as Array<{ id: string } & ZelftestRecord>;
  return rijen.sort((a, b) => String(b.op).localeCompare(String(a.op)))[0] || null;
}

async function zelftestBewaar(aanbieder: string, uit: Omit<ZelftestRecord, 'aanbieder'>): Promise<void> {
  const oud = await zelftestLaatste(aanbieder);
  const record: ZelftestRecord = { aanbieder, ...uit };
  await alsSysteem(async () => {
    if (oud) await db.update(ZELFTESTS, [{ id: oud.id, record: record as unknown as Record<string, unknown> }]);
    else await db.add(ZELFTESTS, [record as unknown as Record<string, unknown>]);
  });
}

/**
 * Самоперевірка лише в режимі читання: наявність і форма ключів + (за наявності AANMELD_<ID>_BASIS) звернення до публічних ключів.
 * Ніколи не містить значень секретів чи особистих даних.
 */
export async function zelftestUitvoeren(a: AanmeldAanbieder): Promise<{ zelftest: 'ok' | 'fout'; details: string[] }> {
  const details: string[] = [];
  const weg = await sleutelsOntbrekenVoor(a);
  if (weg.length) return { zelftest: 'fout', details: [`відсутні ключі: ${weg.join(', ')}`] };
  const vorm = await sleutelVormFouten(a.id);
  if (vorm.length) return { zelftest: 'fout', details: vorm };
  const ping = async (url: string, verwacht: (status: number) => boolean, naam: string) => {
    const r = await fetchMetLimiet(url, { headers: { accept: 'application/json' } });
    if (r && verwacht(r.status)) details.push(`${naam}: досяжний (${r.status})`);
    else return fout('PING');
  };
  try {
    if (a.id === 'telegram') {
      const tg = await telegramEffectieveSleutels();
      if (!/^\d{3,20}:[A-Za-z0-9_-]{20,}$/.test(tg.token)) {
        return { zelftest: 'fout', details: ['AANMELD_TELEGRAM_BOT_TOKEN: не схожий на ключ бота (123456:…)'] };
      }
      if (!/^[A-Za-z0-9_]{4,32}$/.test(tg.naam)) {
        return { zelftest: 'fout', details: ['AANMELD_TELEGRAM_BOT_NAAM: 4–32 літер, цифр або _'] };
      }
      details.push('форма ключа і назви бота коректна; підпис перевіряється через HMAC-SHA256(sha256(sleutel))');
    } else if (a.id === 'apple') {
      const geheim = appleClientSecret();
      const { kop, getekend, handtekening } = jwtLezen(geheim);
      const publiek = createPublicKey(createPrivateKey(env('AANMELD_APPLE_PRIVATE_KEY').replace(/\\n/g, '\n')));
      if (
        String(kop.alg) !== 'ES256' ||
        !cryptoVerify('sha256', Buffer.from(getekend), { key: publiek, dsaEncoding: 'ieee-p1363' }, handtekening)
      ) {
        return { zelftest: 'fout', details: ['пробний підпис ES256 не пройшов перевірку'] };
      }
      details.push('приватний ключ PKCS#8 читається; пробний ES256-JWT підписано й перевірено локально');
      if (env('AANMELD_APPLE_BASIS')) await ping(APPLE().jwks, (s) => s === 200, 'публічні ключі Apple');
      else details.push('мережеву перевірку пропущено (без AANMELD_APPLE_BASIS)');
    } else if (a.id === 'microsoft') {
      new URL(MS().authorize);
      details.push(`адреса авторизації (${MS().tenant}) валідна; id_token перевіряється підписом із JWKS`);
      if (env('AANMELD_MICROSOFT_BASIS')) await ping(MS().jwks, (s) => s === 200, 'публічні ключі JWKS');
      else details.push('мережеву перевірку пропущено (без AANMELD_MICROSOFT_BASIS)');
    } else if (a.id === 'discord') {
      new URL(DISCORD().authorize);
      details.push('адреса авторизації валідна; особу підтверджує маршрут /users/@me');
      if (env('AANMELD_DISCORD_BASIS')) await ping(DISCORD().mij, (s) => s === 401 || s === 403, 'маршрут /users/@me (очікувано 401 без маркера доступу)');
      else details.push('мережеву перевірку пропущено (без AANMELD_DISCORD_BASIS)');
    } else {
      return { zelftest: 'fout', details: ['цей спосіб не має серверного контуру підключення'] };
    }
  } catch {
    return { zelftest: 'fout', details: [...details, 'перевірка не пройшла (значення секретів у журнал сервера не записуються)'] };
  }
  return { zelftest: 'ok', details };
}

// ------------------------------------------------------------------------------------------------ eenvoudige rate-limit (in-geheugen)
const START_LIMIET = 10;
const startTellingen = new Map<string, { vanaf: number; n: number }>();
function startToegestaan(userId: string, aanbieder: string): { ok: boolean; retryAfter: number } {
  const sleutel = `${userId}:${aanbieder}`;
  const slot = startTellingen.get(sleutel);
  const nuMs = Date.now();
  if (!slot || nuMs - slot.vanaf > 60 * 60 * 1000) {
    startTellingen.set(sleutel, { vanaf: nuMs, n: 1 });
    return { ok: true, retryAfter: 0 };
  }
  slot.n += 1;
  const retryAfter = Math.max(1, Math.ceil((slot.vanaf + 3_600_000 - nuMs) / 1000));
  return { ok: slot.n <= START_LIMIET, retryAfter };
}

// ------------------------------------------------------------------------------------------------ telegram-handtekening + replay-bescherming
const TELEGRAM_VELDEN = ['auth_date', 'first_name', 'id', 'last_name', 'photo_url', 'username'] as const;
const gebruikteTelegramHashes = new Map<string, number>();

function neemTelegramHashIn(hashHex: string, nuMs = Date.now()): boolean {
  for (const [k, tot] of gebruikteTelegramHashes) {
    if (tot <= nuMs) gebruikteTelegramHashes.delete(k);
  }
  const sleutel = sha256hex(hashHex);
  const bestaand = gebruikteTelegramHashes.get(sleutel);
  if (bestaand && bestaand > nuMs) return false;
  gebruikteTelegramHashes.set(sleutel, nuMs + STATE_TTL_MS);
  return true;
}

/** Перевірка підпису та свіжості вікна входу Telegram (відхиляє як застарілі > 10 хв, так і майбутні auth_date > +60 с). */
export function telegramControle(query: Record<string, string>, botToken: string): { ok: boolean; vers: boolean } {
  const regel = TELEGRAM_VELDEN.filter((k) => query[k] !== undefined && query[k] !== '')
    .map((k) => `${k}=${query[k]}`)
    .join('\n');
  const sleutel = createHash('sha256').update(botToken).digest();
  const verwacht = createHmac('sha256', sleutel).update(regel).digest('hex');
  const gekregen = String(query.hash || '');
  const bufA = Buffer.from(sha256hex(gekregen), 'utf8');
  const bufB = Buffer.from(sha256hex(verwacht), 'utf8');
  const ok = gekregen.length === verwacht.length && timingSafeEqual(bufA, bufB);
  const nuSec = Math.floor(Date.now() / 1000);
  const authDate = Number(query.auth_date || 0);
  const vers = Number.isFinite(authDate) && authDate > 0 && authDate - 60 <= nuSec && nuSec - authDate <= TELEGRAM_VERS_SEC;
  return { ok, vers };
}

// ------------------------------------------------------------------------------------------------ de callback-afhandeling per aanbieder
type TerugUit = { subject: string; label: string };
const MS_CONSUMERS_TID = '9188040d-6c67-4c5b-b112-36a304b66dad';

async function oauthTerug(id: 'microsoft' | 'discord' | 'apple', query: Record<string, string>, rij: StateRecord): Promise<TerugUit> {
  const code = str(query.code);
  if (!code) fout('TOKEN_ONGELDIG');
  const vorm = (o: Record<string, string>) => new URLSearchParams(o).toString();
  const haal = async (url: string, body: string) => {
    const r = await fetchMetLimiet(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
    });
    const data = r ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null;
    if (!r || !r.ok || !data) fout('TOKEN_ONGELDIG');
    return data!;
  };
  if (id === 'microsoft') {
    const ms = MS();
    const t = await haal(
      ms.token,
      vorm({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl(id),
        client_id: env('AANMELD_MICROSOFT_CLIENT_ID'),
        client_secret: env('AANMELD_MICROSOFT_CLIENT_SECRET'),
        code_verifier: rij.verifier,
      }),
    );
    const inhoud = await idTokenControle(str(t.id_token), {
      jwksUrl: ms.jwks,
      issToegestaan: (iss) => {
        const tid = str(inhoudTid(t.id_token)).trim();
        return Boolean(tid && !/[\s/]/.test(tid) && iss === `${ms.issBasis}/${tid}/v2.0`);
      },
      aud: env('AANMELD_MICROSOFT_CLIENT_ID'),
      nonce: rij.nonce,
    });
    const tid = str(inhoud.tid).trim();
    if (!tid || /[\s/]/.test(tid)) fout('TOKEN_ONGELDIG');
    if (!env('AANMELD_MICROSOFT_BASIS')) {
      if (!MS_UUID_RE.test(tid)) fout('TOKEN_ONGELDIG');
      const ingesteld = ms.tenant.toLowerCase();
      if (ingesteld === 'consumers' && tid.toLowerCase() !== MS_CONSUMERS_TID) fout('TOKEN_ONGELDIG');
      if (ingesteld === 'organizations' && tid.toLowerCase() === MS_CONSUMERS_TID) fout('TOKEN_ONGELDIG');
      if (MS_UUID_RE.test(ingesteld) && tid.toLowerCase() !== ingesteld) fout('TOKEN_ONGELDIG');
    }
    const sub = str(inhoud.sub);
    return { subject: `${tid}:${sub}`, label: maskLabel(str(inhoud.preferred_username) || str(inhoud.email) || sub) };
  }
  if (id === 'apple') {
    const cid = appleClientId();
    const t = await haal(
      APPLE().token,
      vorm({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl(id),
        client_id: cid,
        client_secret: appleClientSecret(),
        code_verifier: rij.verifier,
      }),
    );
    const inhoud = await idTokenControle(str(t.id_token), {
      jwksUrl: APPLE().jwks,
      issToegestaan: (iss) => iss === APPLE().issBasis || iss === 'https://appleid.apple.com',
      aud: cid,
      nonce: rij.nonce,
    });
    const sub = str(inhoud.sub);
    return { subject: sub, label: `Apple ${maskLabel(sub)}` };
  }
  const t = await haal(
    DISCORD().token,
    vorm({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl(id),
      client_id: env('AANMELD_DISCORD_CLIENT_ID'),
      client_secret: env('AANMELD_DISCORD_CLIENT_SECRET'),
      code_verifier: rij.verifier,
    }),
  );
  if (typeof t.scope === 'string' && t.scope.length > 0 && !/(^|\s)identify(\s|$)/.test(t.scope)) {
    fout('TOKEN_ONGELDIG');
  }
  const toegang = str(t.access_token);
  if (!toegang) fout('TOKEN_ONGELDIG');
  const r = await fetchMetLimiet(DISCORD().mij, { headers: { authorization: `Bearer ${toegang}`, accept: 'application/json' } });
  const mij = (r && r.ok ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null) ?? fout('TOKEN_ONGELDIG');
  const discordId = str(mij.id);
  if (!discordId || discordId.length > 64) fout('TOKEN_ONGELDIG');
  if (!env('AANMELD_DISCORD_BASIS') && !/^\d{5,25}$/.test(discordId)) fout('TOKEN_ONGELDIG');
  return { subject: discordId, label: maskLabel(str(mij.global_name) || str(mij.username) || discordId) };
}

function inhoudTid(idToken: unknown): string {
  try {
    const delen = String(idToken || '').split('.');
    if (delen.length !== 3) return '';
    const obj = JSON.parse(Buffer.from(delen[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    return str(obj.tid);
  } catch {
    return '';
  }
}

// ------------------------------------------------------------------------------------------------ знімок для accessSnapshot (UI-015A ↔ UI-015B)
export type AanbiederSnapshotKaart = {
  id: 'microsoft' | 'apple' | 'discord' | 'telegram';
  status: 'actief' | 'gereed-om-te-koppelen' | 'niet-geconfigureerd' | 'uitgeschakeld';
  reden: { uk: string; nl: string };
  accountLabel?: string;
  gekoppeldOp?: string;
  actieKoppelUrl?: string;
  kanLosmaken: boolean;
  losmaakUrl: string;
  zelftest: 'ok' | 'fout' | 'niet-uitgevoerd';
  aanmeldenVoorGebruiker: boolean;
  ontbrekendeSleutels?: string[];
  vormFouten?: string[];
};

export async function aanbiedersVoorToegangsSnapshot(
  user: { id: string; email?: string; role?: string },
  admin: boolean,
): Promise<AanbiederSnapshotKaart[]> {
  const externAan = await aanmeldVlagVoor(user.id, 'aanmelden-extern');
  const tgVlag = await tgVlagAan().catch(() => false);
  const ids = ['microsoft', 'apple', 'discord', 'telegram'] as const;
  return Promise.all(
    ids.map(async (id): Promise<AanbiederSnapshotKaart> => {
      const a = aanmeldAanbieder(id)!;
      const ontbrekend = await sleutelsOntbrekenVoor(a);
      const vorm = await sleutelVormFouten(id);
      const tg = id === 'telegram' ? await telegramEffectieveSleutels() : null;
      const test = await zelftestLaatste(id).catch(() => null);
      const zelftest: 'ok' | 'fout' | 'niet-uitgevoerd' =
        vorm.length > 0
          ? 'fout'
          : (test?.zelftest ?? (tg?.uitKluis && tg.token && tg.naam ? 'ok' : 'niet-uitgevoerd'));
      const koppeling = await koppelingVan(user.id, id);
      const tgActief = !koppeling && tg?.uitKluis ? (await tgKoppelingenVan(user.id).catch(() => []))[0] ?? null : null;
      const gekoppeld = koppeling
        ? { label: koppeling.label, op: koppeling.op }
        : tgActief
          ? {
              label: tgActief.gebruikersnaam ? `@${tgActief.gebruikersnaam}` : tgActief.telefoon || tgActief.telegram_id,
              op: new Date(tgActief.aangemaakt_op).toISOString(),
            }
          : null;
      const klaar = ontbrekend.length === 0 && vorm.length === 0 && zelftest === 'ok';
      const kanLosmaken = gekoppeld ? !(await laatsteWegFout(user, id)) : false;
      const status: AanbiederSnapshotKaart['status'] = gekoppeld
        ? 'actief'
        : klaar
          ? 'gereed-om-te-koppelen'
          : 'niet-geconfigureerd';
      const reden = gekoppeld
        ? { uk: 'Підключено до вашого облікового запису', nl: 'Gekoppeld aan uw account' }
        : klaar
          ? { uk: 'Готово до підключення', nl: 'Klaar om te koppelen' }
          : vorm.length > 0
            ? { uk: 'Помилка формату ключів постачальника на сервері', nl: 'Formaatfout in de aanbiedersleutels op de server' }
            : ontbrekend.length > 0
              ? { uk: 'Потрібні ключі постачальника на сервері', nl: 'Sleutels van de aanbieder op de server nodig' }
              : { uk: 'Очікує самоперевірки адміністратора', nl: 'Wacht op zelftest door de beheerder' };
      return {
        id,
        status,
        reden,
        ...(gekoppeld ? { accountLabel: gekoppeld.label, gekoppeldOp: gekoppeld.op } : {}),
        ...(klaar ? { actieKoppelUrl: '/api/owner/aanmeld/vnext/start' } : {}),
        kanLosmaken,
        losmaakUrl: '/api/owner/aanmeld/vnext/ontkoppel',
        zelftest,
        aanmeldenVoorGebruiker: id === 'telegram' ? tgVlag : externAan,
        ...(admin ? { ontbrekendeSleutels: ontbrekend, vormFouten: vorm } : {}),
      };
    }),
  );
}

// ------------------------------------------------------------------------------------------------ routes
export type KoppelOpties = {
  stepUp?: (ctx: unknown, auth: unknown) => Promise<Resp | null>;
  inloggen?: (rc: RouterContext, aanbieder: string, query: Record<string, string>) => Promise<RouterResponse | null>;
};

export function aanmeldKoppelRoutes(requireSession: RequireSession, opties: KoppelOpties = {}): Record<string, RouterMiddleware[]> {
  const stapOp = async (c: Ctx, auth: SessionOk): Promise<Resp | null> =>
    opties.stepUp ? opties.stepUp(c, auth) : error('STEP_UP_REQUIRED', 403);
  const route = (run: (ctx: Ctx, auth: SessionOk, d: Record<string, unknown>) => Promise<Resp>): RouterMiddleware[] => [
    (async (raw: unknown) => {
      const ctx = raw as unknown as Ctx;
      const auth = await requireSession(ctx.event, ctx.body);
      if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
      if (!(DIENSTEN as readonly string[]).includes(auth.service)) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
      if (!magEigenToegang(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
      try {
        return await run(ctx, auth, (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>);
      } catch (err) {
        const code = String((err as Error)?.message || 'AANMELD_FOUT').slice(0, 80);
        const status =
          code === 'AANBIEDER_ONBEKEND' || code === 'KOPPELING_ONBEKEND'
            ? 404
            : code === 'RATE_LIMITED'
              ? 429
              : code === 'AANMELD_FOUT'
                ? 500
                : 400;
        const retryAfter = Number((err as { retryAfter?: unknown })?.retryAfter);
        return error(code, status, status === 429 && retryAfter > 0 ? { retryAfter } : undefined);
      }
    }) as unknown as RouterMiddleware,
  ];

  const zonderSleutelnamen = <T extends { sleutels: unknown[]; vormFouten?: string[] }>(s: T, beheer: boolean) =>
    beheer
      ? s
      : {
          ...s,
          sleutels: [],
          sleutelsCompleet: (s.sleutels as Array<{ aanwezig: boolean }>).every((x) => x.aanwezig) && !(s.vormFouten?.length),
          zelftestDetails: undefined,
          vormFouten: undefined,
        };

  const statusVan = async (a: AanmeldAanbieder, userId: string) => {
    const tg = a.id === 'telegram' ? await telegramEffectieveSleutels() : null;
    const sleutels = (a.vereist ?? []).map((naam) => ({
      naam,
      aanwezig: tg
        ? naam === 'AANMELD_TELEGRAM_BOT_TOKEN'
          ? !!tg.token
          : naam === 'AANMELD_TELEGRAM_BOT_NAAM'
            ? !!tg.naam
            : sleutelAanwezig(naam)
        : sleutelAanwezig(naam),
    }));
    const vorm = a.stand === 'sleutels-nodig' ? await sleutelVormFouten(a.id) : [];
    const test = a.stand === 'sleutels-nodig' ? await zelftestLaatste(a.id) : null;
    const koppeling = await koppelingVan(userId, a.id);
    const tgActief = !koppeling && tg?.uitKluis ? (await tgKoppelingenVan(userId).catch(() => []))[0] ?? null : null;
    const zelftestStand =
      test?.zelftest ?? (tg?.uitKluis && tg.token && tg.naam && vorm.length === 0 ? 'ok' : 'niet-uitgevoerd');
    return {
      id: a.id,
      stand: a.stand,
      sleutels,
      ...(vorm.length > 0 ? { vormFouten: vorm } : {}),
      zelftest: zelftestStand as 'ok' | 'fout' | 'niet-uitgevoerd',
      ...(test ? { zelftestOp: test.op, zelftestDetails: test.details.slice(0, 8) } : {}),
      klaarVoorKoppeling:
        a.stand === 'sleutels-nodig' &&
        sleutels.length > 0 &&
        sleutels.every((s) => s.aanwezig) &&
        vorm.length === 0 &&
        zelftestStand === 'ok',
      gekoppeld: koppeling
        ? { label: koppeling.label, op: koppeling.op }
        : tgActief
          ? {
              label: tgActief.gebruikersnaam ? `@${tgActief.gebruikersnaam}` : tgActief.telefoon || tgActief.telegram_id,
              op: new Date(tgActief.aangemaakt_op).toISOString(),
            }
          : null,
    };
  };

  const terug: RouterMiddleware = async (rc: RouterContext): Promise<RouterResponse> => {
    const id = String(rc.params.aanbieder || '');
    const a = aanmeldAanbieder(id);
    if (!a || a.stand !== 'sleutels-nodig') return redirect(paginaUrl(`${id || 'onbekend'}-fout&reden=AANBIEDER_ONBEKEND`));
    const q = rc.query || {};
    if (opties.inloggen && id !== 'telegram') {
      const r = await opties.inloggen(rc, id, q as Record<string, string>).catch(() => null);
      if (r) return r;
    }
    let geclaimdeStateHash = '';
    const stuurTerug = (naar: string): RouterResponse =>
      geclaimdeStateHash ? metBindingCookie(redirect(naar), koppelBindingWissen('koppel', geclaimdeStateHash)) : redirect(naar);
    try {
      if (str(q.error)) fout('TOKEN_ONGELDIG');
      const rij = await stateInnemen(id, str(q.state), rc.event as unknown as Record<string, unknown>);
      geclaimdeStateHash = rij.stateHash;
      if ((await sleutelsOntbrekenVoor(a)).length) fout('SLEUTELS_ONTBREKEN');
      if ((await sleutelVormFouten(id)).length) fout('SLEUTELS_ONTBREKEN');
      let uit: TerugUit;
      if (id === 'telegram') {
        const tg = await telegramEffectieveSleutels();
        const c = telegramControle(q as Record<string, string>, tg.token);
        if (!c.ok) fout('HANDTEKENING_ONGELDIG');
        if (!c.vers) fout('VERLOPEN');
        const tgId = str(q.id);
        if (!/^\d{1,20}$/.test(tgId)) fout('TOKEN_ONGELDIG');
        if (!neemTelegramHashIn(str(q.hash))) fout('STATE_ONGELDIG');
        uit = { subject: tgId, label: maskLabel(str(q.username) ? `@${str(q.username)}` : tgId) };
      } else {
        uit = await oauthTerug(id as 'microsoft' | 'discord' | 'apple', q as Record<string, string>, rij);
      }
      if (await subjectBestaat(id, uit.subject)) {
        await auditToevoegen({
          ownerId: rij.ownerUserId,
          actorId: rij.ownerUserId,
          action: 'aanmeld.koppeling',
          type: 'identity',
          result: 'denied',
          details: { aanbieder: id, reden: 'KOPPELING_BESTAAT' },
        }).catch(() => undefined);
        return stuurTerug(paginaUrl(`${id}-fout&reden=KOPPELING_BESTAAT`));
      }
      const record: KoppelRecord = { ownerUserId: rij.ownerUserId, aanbieder: id, subject: uit.subject, label: uit.label, op: nu() };
      await db.add(KOPPELINGEN, [record as unknown as Record<string, unknown>]);
      await auditToevoegen({
        ownerId: rij.ownerUserId,
        actorId: rij.ownerUserId,
        action: 'aanmeld.koppeling',
        type: 'identity',
        result: 'ok',
        details: { aanbieder: id, label: uit.label },
      }).catch(() => undefined);
      await meldBeveiligingsWijziging(rij.ownerUserId, 'aanmeldmethode-gekoppeld', { aanbieder: id, label: uit.label });
      return stuurTerug(paginaUrl(`${id}-ok`));
    } catch (err) {
      const code = String((err as Error)?.message || 'AANMELD_FOUT').replace(/[^A-Z_]/g, '').slice(0, 40) || 'AANMELD_FOUT';
      return stuurTerug(paginaUrl(`${id}-fout&reden=${code}`));
    }
  };

  return {
    'POST /api/owner/aanmeld/vnext/aanbieders': route(async (_c, auth) =>
      json({
        aanbieders: await Promise.all(
          AANMELD_AANBIEDERS.map(async (a) =>
            zonderSleutelnamen(await statusVan(a, auth.user.id), auth.user.role === 'owner' || auth.user.role === 'admin'),
          ),
        ),
        koppelPad: '/api/aanmeld/koppel/:aanbieder/terug',
      }),
    ),
    'POST /api/owner/aanmeld/vnext/zelftest': route(async (_c, auth, d) => {
      if (auth.user.role !== 'owner' && auth.user.role !== 'admin') return error('ZELFTEST_ALLEEN_BEHEER', 403);
      const a = aanmeldAanbieder(str(d.id)) ?? fout('AANBIEDER_ONBEKEND');
      if (a.stand !== 'sleutels-nodig') fout('AANBIEDER_ONBEKEND');
      const uit = await zelftestUitvoeren(a);
      await zelftestBewaar(a.id, { ...uit, op: nu(), doorUserId: auth.user.id });
      await auditToevoegen({
        ownerId: auth.user.id,
        actorId: auth.user.id,
        action: 'aanmeld.zelftest',
        type: 'identity',
        result: uit.zelftest === 'ok' ? 'ok' : 'failed',
        details: { aanbieder: a.id, details: uit.details.slice(0, 8) },
      }).catch(() => undefined);
      return json({ id: a.id, ...uit });
    }),
    'POST /api/owner/aanmeld/vnext/start': route(async (c, auth, d) => {
      const a = aanmeldAanbieder(str(d.id)) ?? fout('AANBIEDER_ONBEKEND');
      {
        const stap = await stapOp(c, auth);
        if (stap) return stap;
      }
      if (a.stand !== 'sleutels-nodig') fout('AANBIEDER_ONBEKEND');
      if ((await sleutelsOntbrekenVoor(a)).length) fout('SLEUTELS_ONTBREKEN');
      if ((await sleutelVormFouten(a.id)).length) fout('SLEUTELS_ONTBREKEN');
      const tg = a.id === 'telegram' ? await telegramEffectieveSleutels() : null;
      const test = await zelftestLaatste(a.id);
      if (test?.zelftest !== 'ok' && !tg?.uitKluis) fout('ZELFTEST_VEREIST');
      const limiet = startToegestaan(auth.user.id, a.id);
      if (!limiet.ok) fout('RATE_LIMITED', limiet.retryAfter);
      const { state, verifier, nonce, setCookie } = await stateNieuw(auth.user.id, a.id);
      const challenge = b64url(createHash('sha256').update(verifier).digest());
      if (a.id === 'telegram') {
        return metBindingCookie(
          json({
            id: a.id,
            widget: {
              bot: tg?.naam || env('AANMELD_TELEGRAM_BOT_NAAM'),
              authUrl: `${callbackUrl('telegram')}?state=${encodeURIComponent(state)}`,
            },
          }),
          setCookie,
        );
      }
      const clientId = a.id === 'apple' ? appleClientId() : env(`AANMELD_${a.id.toUpperCase()}_CLIENT_ID`);
      const basis: Record<string, string> = {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: callbackUrl(a.id),
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      };
      const url =
        a.id === 'microsoft'
          ? `${MS().authorize}?${new URLSearchParams({ ...basis, scope: 'openid profile email', nonce, response_mode: 'query' })}`
          : a.id === 'discord'
            ? `${DISCORD().authorize}?${new URLSearchParams({ ...basis, scope: 'identify email', prompt: 'consent' })}`
            : `${APPLE().authorize}?${new URLSearchParams({ ...basis, nonce, response_mode: 'query' })}`;
      return metBindingCookie(json({ id: a.id, url }), setCookie);
    }),
    'POST /api/owner/aanmeld/vnext/ontkoppel': route(async (c, auth, d) => {
      const a = aanmeldAanbieder(str(d.id)) ?? fout('AANBIEDER_ONBEKEND');
      const koppeling = (await koppelingVan(auth.user.id, a.id)) ?? fout('KOPPELING_ONBEKEND');
      {
        const blok = await laatsteWegFout(auth.user, a.id);
        if (blok) return error(blok, 409);
      }
      {
        const stap = await stapOp(c, auth);
        if (stap) return stap;
      }
      await db.delete(KOPPELINGEN, [koppeling.id]);
      await auditToevoegen({
        ownerId: auth.user.id,
        actorId: auth.user.id,
        action: 'aanmeld.ontkoppeling',
        type: 'identity',
        result: 'ok',
        details: { aanbieder: a.id, label: koppeling.label },
      }).catch(() => undefined);
      await meldBeveiligingsWijziging(auth.user.id, 'aanmeldmethode-ontkoppeld', { aanbieder: a.naam || a.id });
      return json({ ok: true });
    }),
    'GET /api/aanmeld/koppel/:aanbieder/terug': [terug],
  };
}
