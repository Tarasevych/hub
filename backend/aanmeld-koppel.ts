// UI-015 — nieuwe aanmeld-aanbieders (vlag aanmeldmethoden-vnext, migratie 0198): de LEVENDE statusroute, de zelftest en de
// ECHTE koppelcontouren voor Microsoft en Discord (OAuth2 code flow + PKCE), Telegram (Login Widget met HMAC-SHA256) en
// Apple (Sign in with Apple; clientgeheim = ES256-JWT uit de p8-sleutel). Contract: shared/aanmeld-vnext-model.ts.
//
// VASTE BESLISSINGEN (dossier UI-015 §2, directive van de eigenaar):
//   • klaarVoorKoppeling = álle omgevingssleutels aanwezig ÉN de laatst bewaarde zelftest 'ok' — nooit alleen sleutels, en
//     de UI toont vóór die serverwaarheid géén koppelknop; niets wordt «Підключено» zonder een rij in aanmeld_koppelingen_v1;
//   • dit deel KOPPELT een externe identiteit aan het INGELOGDE account als extra aanmeldweg; het geeft GEEN sessies uit.
//     De sessie-uitgifte van de site (ankersessies + tabsessies + grants + onthouden browser) is met de Google-stroom en de
//     eigenaarstransacties vervlochten (backend/index.ts); een tweede uitgiftepad zou een parallelle sessie-implementatie
//     zijn — precies wat het dossier verbiedt. «Inloggen mét zo'n koppeling» is dus eerlijk GEPLAND, niet half nagebouwd;
//   • de start is een POST mét de gewone sessie-envelop (service/tabContext): de geauthenticeerde gebruiker vraagt de
//     authorize-URL op en de browser navigeert; de callback (GET, veilige methode → geen CSRF-kwestie) herkent de mens via
//     de EENMALIGE state-rij (zoals de bestaande Google-callback via zijn oauth-state), nooit via raadwerk met cookies;
//   • state is één keer bruikbaar (gebruiktOp wordt vóór de inwisseling gezet), met TTL van 10 minuten en PKCE S256;
//   • geheimen (client secrets, bottoken, p8-sleutel, codes, verifier) verschijnen nooit in antwoorden, redirects of logs;
//     de statusroute noemt alleen sleutelNAMEN met aanwezig ja/nee, labels van koppelingen worden gemaskeerd opgeslagen;
//   • id_tokens (Microsoft, Apple) worden ECHT gecontroleerd: handtekening tegen de JWKS van de uitgever, iss, aud, exp en
//     nonce; Discord heeft geen id_token en wordt via /users/@me met het zojuist gewisselde token bevestigd;
//   • Apple draait in deze golf met een LEGE scope en response_mode=query: het form_post-antwoord van Apple draagt een
//     Origin van appleid.apple.com en zou door de CSRF-poort van start.ts (terecht) worden geweigerd; zonder scope is query
//     toegestaan en zit de identiteit (sub) gewoon in het id_token. E-mail/naam van Apple zijn daarmee eerlijk niet gevraagd;
//   • WhatsApp heeft geen consumenten-login-API en SMS geen verzendcontour: alleen catalogus (shared), hier geen leven;
//   • basis-URL's zijn per aanbieder te overschrijven met AANMELD_<ID>_BASIS — zo testen de eenheidstests de volledige
//     stroom tegen een nagebootste aanbieder (tests/eenheid/hulp/nep-aanbieder.ts) zonder één echt extern verzoek.
// Foutcodes (contract): AANBIEDER_ONBEKEND, SLEUTELS_ONTBREKEN, ZELFTEST_VEREIST, STATE_ONGELDIG, HANDTEKENING_ONGELDIG,
// TOKEN_ONGELDIG, VERLOPEN, KOPPELING_BESTAAT, SESSIE_VEREIST; aanvullend KOPPELING_ONBEKEND (ontkoppelen) en RATE_LIMITED.
import { createHash, createHmac, createPrivateKey, createPublicKey, randomBytes, sign as cryptoSign, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { db, error, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import type { RouterContext, RouterMiddleware, RouterResponse } from '../server/platform/router';
import { AANMELD_AANBIEDERS, aanmeldAanbieder, type AanmeldAanbieder } from '../shared/aanmeld-vnext-model';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
const DIENSTEN = ['identity', 'hub', 'id'] as const;

// ------------------------------------------------------------------------------------------------ opslagvormen
const KOPPELINGEN = 'aanmeld_koppelingen_v1';  // { ownerUserId, aanbieder, subject, label, op }
const STATES = 'aanmeld_states_v1';            // { ownerUserId, aanbieder, stateHash, verifier, nonce, aangemaaktOp, verlooptOp, gebruiktOp }
const ZELFTESTS = 'aanmeld_zelftest_v1';       // { aanbieder, zelftest, details[], op, doorUserId } — één rij per aanbieder (laatste telt)
const STATE_TTL_MS = 10 * 60 * 1000;
const TELEGRAM_VERS_SEC = 10 * 60;

type KoppelRecord = { ownerUserId: string; aanbieder: string; subject: string; label: string; op: string };
type StateRecord = { ownerUserId: string; aanbieder: string; stateHash: string; verifier: string; nonce: string; aangemaaktOp: number; verlooptOp: number; gebruiktOp: number };
type ZelftestRecord = { aanbieder: string; zelftest: 'ok' | 'fout'; details: string[]; op: string; doorUserId: string };

// ------------------------------------------------------------------------------------------------ kleine hulpjes (puur)
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const nu = (): string => new Date().toISOString();
const sha256hex = (v: string): string => createHash('sha256').update(v).digest('hex');
const b64url = (b: Buffer): string => b.toString('base64url');
const fout = (code: string): never => { throw new Error(code); };
const env = (naam: string): string => String(process.env[naam] ?? '').trim();
const sleutelAanwezig = (naam: string): boolean => env(naam).length > 0;
const sleutelsOntbreken = (a: AanmeldAanbieder): string[] => (a.vereist ?? []).filter((naam) => !sleutelAanwezig(naam));

/** Label maskeren vóór opslag: nooit het volledige adres/de volledige naam bewaren of tonen. */
export function maskLabel(ruw: string): string {
  const v = String(ruw || '').trim();
  if (!v) return '•••';
  const at = v.indexOf('@');
  if (at > 0) { const naam = v.slice(0, at); return `${naam.slice(0, 2)}…@${v.slice(at + 1)}`; }
  return v.length <= 4 ? `${v[0]}…` : `${v.slice(0, 2)}…${v.slice(-2)}`;
}

/** Terug-/redirectbasis: in productie het echte id-domein; in tests overschrijfbaar. Nooit uit het verzoek afgeleid. */
const terugBasis = (): string => env('AANMELD_TERUG_BASIS') || 'https://id.tarasevych.com';
const callbackUrl = (id: string): string => `${terugBasis()}/api/aanmeld/koppel/${id}/terug`;
const paginaUrl = (q: string): string => `${terugBasis()}/aanmeldmethoden?koppel=${q}`;
const redirect = (naar: string): RouterResponse => ({ statusCode: 302, headers: { Location: naar, 'Cache-Control': 'no-store' }, body: '' });

// ------------------------------------------------------------------------------------------------ aanbieder-contouren
// Basis-URL's: per aanbieder overschrijfbaar (tests, zelf gehoste spiegels); standaard de echte adressen.
const basisVan = (id: string, standaard: string): string => (env(`AANMELD_${id.toUpperCase()}_BASIS`) || standaard).replace(/\/+$/, '');
const MS = () => {
  const b = basisVan('microsoft', 'https://login.microsoftonline.com');
  return { authorize: `${b}/common/oauth2/v2.0/authorize`, token: `${b}/common/oauth2/v2.0/token`, jwks: `${b}/common/discovery/v2.0/keys`, issBasis: b };
};
const DISCORD = () => {
  const b = basisVan('discord', 'https://discord.com');
  return { authorize: `${b}/oauth2/authorize`, token: `${b}/api/oauth2/token`, mij: `${b}/api/users/@me` };
};
const APPLE = () => {
  const b = basisVan('apple', 'https://appleid.apple.com');
  return { authorize: `${b}/auth/authorize`, token: `${b}/auth/token`, jwks: `${b}/auth/keys`, issBasis: b };
};

// ---- JWT-hulpjes zonder extra afhankelijkheden (zelfde huisstijl als backend/github-app.ts) ----
type JwtDelen = { kop: Record<string, unknown>; inhoud: Record<string, unknown>; getekend: string; handtekening: Buffer };
function jwtLezen(token: string): JwtDelen {
  const delen = String(token || '').split('.');
  if (delen.length !== 3) fout('TOKEN_ONGELDIG');
  const lees = (s: string) => { try { return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Record<string, unknown>; } catch { return fout('TOKEN_ONGELDIG') as never; } };
  return { kop: lees(delen[0]), inhoud: lees(delen[1]), getekend: `${delen[0]}.${delen[1]}`, handtekening: Buffer.from(delen[2], 'base64url') };
}
/** Apple-clientgeheim: ES256-JWT uit de p8-sleutel van de eigenaar (aud = de Apple-uitgever, TTL 5 minuten — ruim onder Apple's maximum van 6 maanden). */
export function appleClientSecret(nuMs = Date.now()): string {
  const sleutel = createPrivateKey(env('AANMELD_APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'));
  const kop = b64url(Buffer.from(JSON.stringify({ alg: 'ES256', kid: env('AANMELD_APPLE_KEY_ID') })));
  const inhoud = b64url(Buffer.from(JSON.stringify({ iss: env('AANMELD_APPLE_TEAM_ID'), iat: Math.floor(nuMs / 1000), exp: Math.floor(nuMs / 1000) + 300, aud: 'https://appleid.apple.com', sub: env('AANMELD_APPLE_CLIENT_ID') })));
  const handtekening = cryptoSign('sha256', Buffer.from(`${kop}.${inhoud}`), { key: sleutel, dsaEncoding: 'ieee-p1363' });
  return `${kop}.${inhoud}.${b64url(handtekening)}`;
}

// JWKS-cache per URL (10 min): de sleutelset van de uitgever is publiek en verandert zelden; nooit een sleutel uit het verzoek.
const jwksCache = new Map<string, { op: number; sleutels: Array<Record<string, unknown>> }>();
async function jwksSleutel(url: string, kid: string): Promise<KeyObject> {
  const c = jwksCache.get(url);
  let sleutels = c && Date.now() - c.op < 10 * 60 * 1000 ? c.sleutels : null;
  if (!sleutels) {
    const r = await fetch(url, { headers: { accept: 'application/json' } }).catch(() => null);
    if (!r || !r.ok) fout('TOKEN_ONGELDIG');
    const data = (await r!.json().catch(() => null)) as { keys?: Array<Record<string, unknown>> } | null;
    sleutels = Array.isArray(data?.keys) ? data!.keys! : [];
    jwksCache.set(url, { op: Date.now(), sleutels });
  }
  const jwk = sleutels.find((k) => String(k.kid || '') === kid) || (sleutels.length === 1 ? sleutels[0] : undefined);
  if (!jwk) fout('TOKEN_ONGELDIG');
  try { return createPublicKey({ key: jwk as never, format: 'jwk' }); } catch { return fout('TOKEN_ONGELDIG') as never; }
}
/** id_token echt controleren: handtekening (RS256/ES256 via JWKS), uitgever, publiek, verlooptijd en nonce. */
async function idTokenControle(token: string, o: { jwksUrl: string; issToegestaan: (iss: string) => boolean; aud: string; nonce: string }): Promise<Record<string, unknown>> {
  const { kop, inhoud, getekend, handtekening } = jwtLezen(token);
  const alg = String(kop.alg || '');
  if (alg !== 'RS256' && alg !== 'ES256') fout('TOKEN_ONGELDIG');
  const sleutel = await jwksSleutel(o.jwksUrl, String(kop.kid || ''));
  const goed = cryptoVerify('sha256', Buffer.from(getekend), alg === 'ES256' ? { key: sleutel, dsaEncoding: 'ieee-p1363' } : sleutel, handtekening);
  if (!goed) fout('HANDTEKENING_ONGELDIG');
  if (!o.issToegestaan(String(inhoud.iss || ''))) fout('TOKEN_ONGELDIG');
  const aud = inhoud.aud;
  if (!(aud === o.aud || (Array.isArray(aud) && aud.includes(o.aud)))) fout('TOKEN_ONGELDIG');
  if (Number(inhoud.exp || 0) * 1000 <= Date.now()) fout('VERLOPEN');
  if (o.nonce && String(inhoud.nonce || '') !== o.nonce) fout('STATE_ONGELDIG');
  return inhoud;
}

// ------------------------------------------------------------------------------------------------ state (eenmalig, 10 min)
async function stateNieuw(ownerUserId: string, aanbieder: string): Promise<{ state: string; verifier: string; nonce: string }> {
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const nonce = b64url(randomBytes(18));
  const rij: StateRecord = { ownerUserId, aanbieder, stateHash: sha256hex(state), verifier, nonce, aangemaaktOp: Date.now(), verlooptOp: Date.now() + STATE_TTL_MS, gebruiktOp: 0 };
  await db.add(STATES, [rij as unknown as Record<string, unknown>]);
  return { state, verifier, nonce };
}
/** Eenmalig innemen: eerst gebruiktOp zetten, dan pas verder — een tweede callback met dezelfde state strandt. */
async function stateInnemen(aanbieder: string, state: string): Promise<{ id: string } & StateRecord> {
  if (!state) fout('STATE_ONGELDIG');
  const { items } = await db.list<StateRecord>(STATES, { filter: { stateHash: sha256hex(state), aanbieder }, limit: 2 });
  const rij = (items as Array<{ id: string } & StateRecord>)[0];
  if (!rij) fout('STATE_ONGELDIG');
  if (rij.gebruiktOp) fout('STATE_ONGELDIG');
  if (rij.verlooptOp <= Date.now()) fout('VERLOPEN');
  const [gelukt] = await db.update(STATES, [{ id: rij.id, record: { ...rij, id: undefined, gebruiktOp: Date.now() } as unknown as Record<string, unknown> }]);
  if (!gelukt) fout('STATE_ONGELDIG');
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
async function zelftestLaatste(aanbieder: string): Promise<({ id: string } & ZelftestRecord) | null> {
  const { items } = await db.list<ZelftestRecord>(ZELFTESTS, { filter: { aanbieder }, limit: 5 });
  const rijen = items as Array<{ id: string } & ZelftestRecord>;
  return rijen.sort((a, b) => String(b.op).localeCompare(String(a.op)))[0] || null;
}
async function zelftestBewaar(aanbieder: string, uit: Omit<ZelftestRecord, 'aanbieder'>): Promise<void> {
  const oud = await zelftestLaatste(aanbieder);
  const record: ZelftestRecord = { aanbieder, ...uit };
  if (oud) await db.update(ZELFTESTS, [{ id: oud.id, record: record as unknown as Record<string, unknown> }]);
  else await db.add(ZELFTESTS, [record as unknown as Record<string, unknown>]);
}

/** De read-only zelftest van de EIGEN contour: sleutelvorm + (alleen met basis-override) een ping naar de publieke sleutelset.
 *  Er gaat nooit een gebruikersgegeven of geheim de deur uit; de details noemen alleen sleutelNAMEN en bevindingen. */
export async function zelftestUitvoeren(a: AanmeldAanbieder): Promise<{ zelftest: 'ok' | 'fout'; details: string[] }> {
  const details: string[] = [];
  const weg = sleutelsOntbreken(a);
  if (weg.length) return { zelftest: 'fout', details: [`відсутні ключі: ${weg.join(', ')}`] };
  const ping = async (url: string, verwacht: (status: number) => boolean, naam: string) => {
    const r = await fetch(url, { headers: { accept: 'application/json' } }).catch(() => null);
    if (r && verwacht(r.status)) details.push(`${naam}: досяжний (${r.status})`);
    else return fout('PING');
  };
  try {
    if (a.id === 'telegram') {
      if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(env('AANMELD_TELEGRAM_BOT_TOKEN'))) return { zelftest: 'fout', details: ['AANMELD_TELEGRAM_BOT_TOKEN: не схожий на токен бота (123456:…)'] };
      if (!/^[A-Za-z0-9_]{4,32}$/.test(env('AANMELD_TELEGRAM_BOT_NAAM'))) return { zelftest: 'fout', details: ['AANMELD_TELEGRAM_BOT_NAAM: 4–32 літер/цифр/_'] };
      details.push('форма токена і назви бота — гаразд; підпис перевіряється HMAC-SHA256(sha256(token))');
    } else if (a.id === 'apple') {
      const geheim = appleClientSecret();
      const { kop, getekend, handtekening } = jwtLezen(geheim);
      const publiek = createPublicKey(createPrivateKey(env('AANMELD_APPLE_PRIVATE_KEY').replace(/\\n/g, '\n')));
      if (String(kop.alg) !== 'ES256' || !cryptoVerify('sha256', Buffer.from(getekend), { key: publiek, dsaEncoding: 'ieee-p1363' }, handtekening)) return { zelftest: 'fout', details: ['пробний ES256-підпис не пройшов перевірку'] };
      details.push('p8-ключ читається; пробний clientgeheim (ES256-JWT) підписано й перевірено локально');
      if (env('AANMELD_APPLE_BASIS')) await ping(APPLE().jwks, (s) => s === 200, 'сторінка ключів Apple');
      else details.push('мережевий пінг пропущено (без AANMELD_APPLE_BASIS)');
    } else if (a.id === 'microsoft') {
      if (env('AANMELD_MICROSOFT_CLIENT_SECRET').length < 8) return { zelftest: 'fout', details: ['AANMELD_MICROSOFT_CLIENT_SECRET: закороткий'] };
      new URL(MS().authorize);
      details.push('authorize-URL збирається; id_token перевірятиметься підписом із JWKS');
      if (env('AANMELD_MICROSOFT_BASIS')) await ping(MS().jwks, (s) => s === 200, 'JWKS');
      else details.push('мережевий пінг пропущено (без AANMELD_MICROSOFT_BASIS)');
    } else if (a.id === 'discord') {
      if (env('AANMELD_DISCORD_CLIENT_SECRET').length < 8) return { zelftest: 'fout', details: ['AANMELD_DISCORD_CLIENT_SECRET: закороткий'] };
      new URL(DISCORD().authorize);
      details.push('authorize-URL збирається; особу підтверджує /users/@me зі щойно отриманим токеном');
      if (env('AANMELD_DISCORD_BASIS')) await ping(DISCORD().mij, (s) => s === 401 || s === 403, 'ендпоінт /users/@me (очікувано 401 без токена)');
      else details.push('мережевий пінг пропущено (без AANMELD_DISCORD_BASIS)');
    } else {
      return { zelftest: 'fout', details: ['цей спосіб не має контуру підключення'] };
    }
  } catch {
    return { zelftest: 'fout', details: [...details, 'перевірка не пройшла (деталі в журналі сервера відсутні — секрети не логуються)'] };
  }
  return { zelftest: 'ok', details };
}

// ------------------------------------------------------------------------------------------------ eenvoudige rate-limit (in-geheugen)
const START_LIMIET = 10;                      // per gebruiker per aanbieder per uur — koppelen is geen bulkactie
const startTellingen = new Map<string, { vanaf: number; n: number }>();
function startToegestaan(userId: string, aanbieder: string): boolean {
  const sleutel = `${userId}:${aanbieder}`;
  const slot = startTellingen.get(sleutel);
  const nuMs = Date.now();
  if (!slot || nuMs - slot.vanaf > 60 * 60 * 1000) { startTellingen.set(sleutel, { vanaf: nuMs, n: 1 }); return true; }
  slot.n += 1;
  return slot.n <= START_LIMIET;
}

// ------------------------------------------------------------------------------------------------ telegram-handtekening
const TELEGRAM_VELDEN = ['auth_date', 'first_name', 'id', 'last_name', 'photo_url', 'username'] as const;
/** De controleregel van het Login Widget: alleen Telegram-velden, alfabetisch, sleutel = sha256(bottoken). */
export function telegramControle(query: Record<string, string>, botToken: string): { ok: boolean; vers: boolean } {
  const regel = TELEGRAM_VELDEN.filter((k) => query[k] !== undefined && query[k] !== '').map((k) => `${k}=${query[k]}`).join('\n');
  const sleutel = createHash('sha256').update(botToken).digest();
  const verwacht = createHmac('sha256', sleutel).update(regel).digest('hex');
  const gekregen = String(query.hash || '');
  const ok = gekregen.length === verwacht.length && createHash('sha256').update(gekregen).digest('hex') === createHash('sha256').update(verwacht).digest('hex');
  const vers = Math.abs(Math.floor(Date.now() / 1000) - Number(query.auth_date || 0)) <= TELEGRAM_VERS_SEC;
  return { ok, vers };
}

// ------------------------------------------------------------------------------------------------ de callback-afhandeling per aanbieder
type TerugUit = { subject: string; label: string };
async function oauthTerug(id: 'microsoft' | 'discord' | 'apple', query: Record<string, string>, rij: StateRecord): Promise<TerugUit> {
  const code = str(query.code);
  if (!code) fout('TOKEN_ONGELDIG');
  const vorm = (o: Record<string, string>) => new URLSearchParams(o).toString();
  const haal = async (url: string, body: string) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body }).catch(() => null);
    const data = r ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null;
    if (!r || !r.ok || !data) fout('TOKEN_ONGELDIG');
    return data!;
  };
  if (id === 'microsoft') {
    const t = await haal(MS().token, vorm({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl(id), client_id: env('AANMELD_MICROSOFT_CLIENT_ID'), client_secret: env('AANMELD_MICROSOFT_CLIENT_SECRET'), code_verifier: rij.verifier }));
    const inhoud = await idTokenControle(str(t.id_token), { jwksUrl: MS().jwks, issToegestaan: (iss) => iss.startsWith(`${MS().issBasis}/`), aud: env('AANMELD_MICROSOFT_CLIENT_ID'), nonce: rij.nonce });
    const subject = `${str(inhoud.tid) || 'ms'}:${str(inhoud.sub)}`;
    if (!str(inhoud.sub)) fout('TOKEN_ONGELDIG');
    return { subject, label: maskLabel(str(inhoud.preferred_username) || str(inhoud.email) || str(inhoud.sub)) };
  }
  if (id === 'apple') {
    const t = await haal(APPLE().token, vorm({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl(id), client_id: env('AANMELD_APPLE_CLIENT_ID'), client_secret: appleClientSecret(), code_verifier: rij.verifier }));
    const inhoud = await idTokenControle(str(t.id_token), { jwksUrl: APPLE().jwks, issToegestaan: (iss) => iss === APPLE().issBasis || iss === 'https://appleid.apple.com', aud: env('AANMELD_APPLE_CLIENT_ID'), nonce: rij.nonce });
    if (!str(inhoud.sub)) fout('TOKEN_ONGELDIG');
    return { subject: str(inhoud.sub), label: `Apple ${maskLabel(str(inhoud.sub))}` };
  }
  // discord: geen id_token — identiteit via /users/@me met het zojuist verkregen token (gaat nooit naar de client).
  const t = await haal(DISCORD().token, vorm({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl(id), client_id: env('AANMELD_DISCORD_CLIENT_ID'), client_secret: env('AANMELD_DISCORD_CLIENT_SECRET'), code_verifier: rij.verifier }));
  const toegang = str(t.access_token);
  if (!toegang) fout('TOKEN_ONGELDIG');
  const r = await fetch(DISCORD().mij, { headers: { authorization: `Bearer ${toegang}`, accept: 'application/json' } }).catch(() => null);
  const mij = (r && r.ok ? ((await r.json().catch(() => null)) as Record<string, unknown> | null) : null) ?? fout('TOKEN_ONGELDIG');
  if (!str(mij.id)) fout('TOKEN_ONGELDIG');
  return { subject: str(mij.id), label: maskLabel(str(mij.username) || str(mij.id)) };
}

// ------------------------------------------------------------------------------------------------ routes
export function aanmeldKoppelRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  const route = (run: (ctx: Ctx, auth: SessionOk, d: Record<string, unknown>) => Promise<Resp>): RouterMiddleware[] => [(async (raw: unknown) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!(DIENSTEN as readonly string[]).includes(auth.service)) return error('OWNER_CLOUD_SESSION_REQUIRED', 403);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    try { return await run(ctx, auth, (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>); }
    catch (err) {
      const code = String((err as Error)?.message || 'AANMELD_FOUT').slice(0, 80);
      const status = code === 'AANBIEDER_ONBEKEND' || code === 'KOPPELING_ONBEKEND' ? 404 : code === 'RATE_LIMITED' ? 429 : code === 'AANMELD_FOUT' ? 500 : 400;
      return error(code, status);
    }
  }) as unknown as RouterMiddleware];

  const statusVan = async (a: AanmeldAanbieder, userId: string) => {
    const sleutels = (a.vereist ?? []).map((naam) => ({ naam, aanwezig: sleutelAanwezig(naam) }));
    const test = a.stand === 'sleutels-nodig' ? await zelftestLaatste(a.id) : null;
    const koppeling = await koppelingVan(userId, a.id);
    return {
      id: a.id, stand: a.stand, sleutels,
      zelftest: (test?.zelftest ?? 'niet-uitgevoerd') as 'ok' | 'fout' | 'niet-uitgevoerd',
      ...(test ? { zelftestOp: test.op, zelftestDetails: test.details.slice(0, 8) } : {}),
      klaarVoorKoppeling: a.stand === 'sleutels-nodig' && sleutels.length > 0 && sleutels.every((s) => s.aanwezig) && test?.zelftest === 'ok',
      gekoppeld: koppeling ? { label: koppeling.label, op: koppeling.op } : null,
    };
  };

  // De PUBLIEKE callback: géén requireSession — de eenmalige state-rij bindt het antwoord aan de mens die de start deed
  // (zelfde patroon als de bestaande Google-callback met zijn oauth-state). GET is een veilige methode (geen CSRF-poort).
  const terug: RouterMiddleware = async (rc: RouterContext): Promise<RouterResponse> => {
    const id = String(rc.params.aanbieder || '');
    const a = aanmeldAanbieder(id);
    if (!a || a.stand !== 'sleutels-nodig') return redirect(paginaUrl(`${id || 'onbekend'}-fout&reden=AANBIEDER_ONBEKEND`));
    const q = rc.query || {};
    try {
      if (str(q.error)) fout('TOKEN_ONGELDIG');                                   // de aanbieder weigerde; geen geheimen herhalen
      const rij = await stateInnemen(id, str(q.state));                            // eenmalig, 10 min, juiste aanbieder
      if (sleutelsOntbreken(a).length) fout('SLEUTELS_ONTBREKEN');
      let uit: TerugUit;
      if (id === 'telegram') {
        const c = telegramControle(q as Record<string, string>, env('AANMELD_TELEGRAM_BOT_TOKEN'));
        if (!c.ok) fout('HANDTEKENING_ONGELDIG');
        if (!c.vers) fout('VERLOPEN');
        uit = { subject: str(q.id), label: maskLabel(str(q.username) ? `@${str(q.username)}` : str(q.id)) };
        if (!uit.subject) fout('TOKEN_ONGELDIG');
      } else {
        uit = await oauthTerug(id as 'microsoft' | 'discord' | 'apple', q as Record<string, string>, rij);
      }
      if (await subjectBestaat(id, uit.subject)) {
        await auditToevoegen({ ownerId: rij.ownerUserId, actorId: rij.ownerUserId, action: 'aanmeld.koppeling', type: 'identity', result: 'denied', details: { aanbieder: id, reden: 'KOPPELING_BESTAAT' } }).catch(() => undefined);
        return redirect(paginaUrl(`${id}-fout&reden=KOPPELING_BESTAAT`));
      }
      const record: KoppelRecord = { ownerUserId: rij.ownerUserId, aanbieder: id, subject: uit.subject, label: uit.label, op: nu() };
      await db.add(KOPPELINGEN, [record as unknown as Record<string, unknown>]);
      await auditToevoegen({ ownerId: rij.ownerUserId, actorId: rij.ownerUserId, action: 'aanmeld.koppeling', type: 'identity', result: 'ok', details: { aanbieder: id, label: uit.label } }).catch(() => undefined);
      return redirect(paginaUrl(`${id}-ok`));
    } catch (err) {
      const code = String((err as Error)?.message || 'AANMELD_FOUT').replace(/[^A-Z_]/g, '').slice(0, 40) || 'AANMELD_FOUT';
      return redirect(paginaUrl(`${id}-fout&reden=${code}`));
    }
  };

  return {
    // -------------------------------------------------------------- levende status (geen verzinsels)
    'POST /api/owner/aanmeld/vnext/aanbieders': route(async (_c, auth) => json({
      aanbieders: await Promise.all(AANMELD_AANBIEDERS.map((a) => statusVan(a, auth.user.id))),
      koppelPad: '/api/aanmeld/koppel/:aanbieder/terug',
    })),
    // -------------------------------------------------------------- zelftest van de eigen contour (read-only + audit)
    'POST /api/owner/aanmeld/vnext/zelftest': route(async (_c, auth, d) => {
      const a = aanmeldAanbieder(str(d.id)) ?? fout('AANBIEDER_ONBEKEND');
      if (a.stand !== 'sleutels-nodig') fout('AANBIEDER_ONBEKEND');
      const uit = await zelftestUitvoeren(a);
      await zelftestBewaar(a.id, { ...uit, op: nu(), doorUserId: auth.user.id });
      await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: 'aanmeld.zelftest', type: 'identity', result: uit.zelftest === 'ok' ? 'ok' : 'failed', details: { aanbieder: a.id, details: uit.details.slice(0, 8) } }).catch(() => undefined);
      return json({ id: a.id, ...uit });
    }),
    // -------------------------------------------------------------- start: geauthenticeerd, geeft de authorize-URL terug
    'POST /api/owner/aanmeld/vnext/start': route(async (_c, auth, d) => {
      const a = aanmeldAanbieder(str(d.id)) ?? fout('AANBIEDER_ONBEKEND');
      if (a.stand !== 'sleutels-nodig') fout('AANBIEDER_ONBEKEND');
      if (sleutelsOntbreken(a).length) fout('SLEUTELS_ONTBREKEN');
      const test = await zelftestLaatste(a.id);
      if (test?.zelftest !== 'ok') fout('ZELFTEST_VEREIST');
      if (!startToegestaan(auth.user.id, a.id)) fout('RATE_LIMITED');
      const { state, verifier, nonce } = await stateNieuw(auth.user.id, a.id);
      const challenge = b64url(createHash('sha256').update(verifier).digest());
      if (a.id === 'telegram') {
        // Het officiële widget stuurt zijn velden naar data-auth-url; onze state reist als eigen queryparameter mee.
        return json({ id: a.id, widget: { bot: env('AANMELD_TELEGRAM_BOT_NAAM'), authUrl: `${callbackUrl('telegram')}?state=${encodeURIComponent(state)}` } });
      }
      const basis: Record<string, string> = { response_type: 'code', client_id: env(`AANMELD_${a.id.toUpperCase()}_CLIENT_ID`), redirect_uri: callbackUrl(a.id), state, code_challenge: challenge, code_challenge_method: 'S256' };
      const url = a.id === 'microsoft' ? `${MS().authorize}?${new URLSearchParams({ ...basis, scope: 'openid profile email', nonce, response_mode: 'query' })}`
        : a.id === 'discord' ? `${DISCORD().authorize}?${new URLSearchParams({ ...basis, scope: 'identify email', prompt: 'consent' })}`
        : `${APPLE().authorize}?${new URLSearchParams({ ...basis, nonce, response_mode: 'query' })}`; // apple: lege scope → query mag (zie kop)
      return json({ id: a.id, url });
    }),
    // -------------------------------------------------------------- ontkoppelen (eigen koppeling; dit is nooit de laatste aanmeldweg)
    'POST /api/owner/aanmeld/vnext/ontkoppel': route(async (_c, auth, d) => {
      const a = aanmeldAanbieder(str(d.id)) ?? fout('AANBIEDER_ONBEKEND');
      const koppeling = (await koppelingVan(auth.user.id, a.id)) ?? fout('KOPPELING_ONBEKEND');
      await db.delete(KOPPELINGEN, [koppeling.id]);
      await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: 'aanmeld.ontkoppeling', type: 'identity', result: 'ok', details: { aanbieder: a.id, label: koppeling.label } }).catch(() => undefined);
      return json({ ok: true });
    }),
    // -------------------------------------------------------------- de publieke callback (GET; state = de enige sleutel)
    'GET /api/aanmeld/koppel/:aanbieder/terug': [terug],
  };
}
