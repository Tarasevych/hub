// UI-015B (30.10.2026): externe aanmeldaanbieders (Microsoft, Apple, Discord, Telegram). Alles tegen NEP-aanbieders: fetch wordt
// onderschept door een lokale nep-OIDC/OAuth-server (eigen RSA/EC-sleutels, eigen JWKS). Er gaat niets naar buiten.
// Dekt: start-URL (state/nonce/PKCE), foute/verlopen/hergebruikte state, vervalste id_token, verkeerde audience, verkeerde nonce,
// verlopen token, verkeerde tenant/iss, Apple ES256-client-secret, Apple form_post + naam alleen eerste keer, Discord scope,
// Telegram-hash fout/verlopen/hergebruik, routes (sessie, step-up, andere sessie, ander account), statusmatrix, uitlegregister,
// Postgres-opslag (eenmalig nemen, replay). Vereist DATABASE_URL met migraties (0206).
import { createHash, createHmac, generateKeyPairSync, randomBytes, sign as cSign, verify as cVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { ontbrekend, statusVan, terugUrl, EXTERNE_AANBIEDERS } from '../../backend/extern-aanmelden/aanbieders';
import { geheugenOpslag, neemResultaat, pgOpslag, start, terug, type Deps } from '../../backend/extern-aanmelden/stroom';
import { jwksCacheLegen } from '../../backend/extern-aanmelden/jwt';
import { telegramControleren } from '../../backend/extern-aanmelden/telegram';
import { externRoutes, telegramHulpHtml } from '../../backend/extern-aanmelden/routes';
import { REGISTER as UITLEG, uitlegVoor } from '../../shared/meldingen-v2/uitleg-register';
import { closePool, getPool } from '../../server/platform/pg';

const ENV: Record<string, string> = {
  AANMELD_MICROSOFT_CLIENT_ID: 'ms-client-test', AANMELD_MICROSOFT_CLIENT_SECRET: 'ms-geheim-test', AANMELD_MICROSOFT_TENANT: 'common',
  AANMELD_APPLE_SERVICES_ID: 'com.example.test.web', AANMELD_APPLE_TEAM_ID: 'TEAMTEST01', AANMELD_APPLE_KEY_ID: 'KEYTEST001',
  AANMELD_DISCORD_CLIENT_ID: '123456789012345678', AANMELD_DISCORD_CLIENT_SECRET: 'discord-geheim-test',
  AANMELD_TELEGRAM_BOT_TOKEN: `7000000001:${randomBytes(27).toString('base64url')}`, AANMELD_TELEGRAM_BOT_NAAM: 'test_bot',
};
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
const rsa = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
const msSleutel = rsa(), appleSleutel = rsa(), valseSleutel = rsa();
const appleEc = generateKeyPairSync('ec', { namedCurve: 'P-256' });
ENV.AANMELD_APPLE_PRIVATE_KEY = appleEc.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const jwk = (k: ReturnType<typeof rsa>, kid: string) => ({ ...k.publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' });
const jwt = (claims: Record<string, unknown>, k = msSleutel, kid = 'ms1', alg = 'RS256') => { const i = `${b64({ alg, kid, typ: 'JWT' })}.${b64(claims)}`; return `${i}.${cSign('RSA-SHA256', Buffer.from(i), k.privateKey).toString('base64url')}`; };
const MS_TID = '11111111-2222-3333-4444-555555555555';

// ---- nep-aanbieders
type Gedrag = { claims?: (nonce: string) => Record<string, unknown>; sleutel?: ReturnType<typeof rsa>; kid?: string; tokenStatus?: number; discordScope?: string };
let gedrag: Gedrag = {};
let laatsteNonce = '';
const verzoeken: string[] = [];
let appleSecretGeldig: boolean | null = null;
const nepFetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input); verzoeken.push(url);
  const body = new URLSearchParams(String(init?.body || ''));
  const j = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.endsWith('/discovery/v2.0/keys')) return j({ keys: [jwk(msSleutel, 'ms1')] });
  if (url === 'https://appleid.apple.com/auth/keys') return j({ keys: [jwk(appleSleutel, 'ap1')] });
  if (gedrag.tokenStatus) return j({ error: 'invalid_grant' }, gedrag.tokenStatus);
  if (/login\.microsoftonline\.com\/[a-z]+\/oauth2\/v2\.0\/token$/.test(url)) {
    if (body.get('client_secret') !== ENV.AANMELD_MICROSOFT_CLIENT_SECRET || !body.get('code_verifier')) return j({ error: 'invalid_client' }, 401);
    const claims = gedrag.claims ? gedrag.claims(laatsteNonce) : { iss: `https://login.microsoftonline.com/${MS_TID}/v2.0`, tid: MS_TID, oid: 'oid-1', sub: 'sub-ms-1', aud: ENV.AANMELD_MICROSOFT_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), nonce: laatsteNonce, email: 'pavlo@outlook.example' };
    return j({ id_token: jwt(claims, gedrag.sleutel || msSleutel, gedrag.kid || 'ms1'), access_token: 'x' });
  }
  if (url === 'https://appleid.apple.com/auth/token') {
    const cs = String(body.get('client_secret') || '').split('.');
    appleSecretGeldig = cs.length === 3 && cVerify('sha256', Buffer.from(`${cs[0]}.${cs[1]}`), { key: appleEc.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(cs[2], 'base64url'))
      && JSON.parse(Buffer.from(cs[1], 'base64url').toString()).sub === ENV.AANMELD_APPLE_SERVICES_ID && JSON.parse(Buffer.from(cs[0], 'base64url').toString()).kid === ENV.AANMELD_APPLE_KEY_ID;
    if (!appleSecretGeldig) return j({ error: 'invalid_client' }, 400);
    const claims = gedrag.claims ? gedrag.claims(laatsteNonce) : { iss: 'https://appleid.apple.com', aud: ENV.AANMELD_APPLE_SERVICES_ID, sub: '001234.apple.sub', exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), nonce: laatsteNonce, email: 'abc123@privaterelay.appleid.com' };
    return j({ id_token: jwt(claims, gedrag.sleutel || appleSleutel, gedrag.kid || 'ap1') });
  }
  if (url === 'https://discord.com/api/oauth2/token') return j({ access_token: 'dc-token', scope: gedrag.discordScope ?? 'identify email', token_type: 'Bearer' });
  if (url === 'https://discord.com/api/users/@me') return init?.headers && (init.headers as Record<string, string>).Authorization === 'Bearer dc-token' ? j({ id: '80351110224678912', username: 'pavlo', global_name: 'Pavlo', email: 'p@example.test', verified: true }) : j({}, 401);
  return j({ error: 'onbekend' }, 404);
}) as typeof fetch;

function telegramData(o: { authDate?: number; token?: string; id?: string } = {}) {
  const d: Record<string, string> = { id: o.id || '424242', first_name: 'Pavlo', username: 'pavlo_t', auth_date: String(o.authDate ?? Math.floor(Date.now() / 1000)) };
  const dcs = Object.keys(d).sort().map((k) => `${k}=${d[k]}`).join('\n');
  d.hash = createHmac('sha256', createHash('sha256').update(o.token || ENV.AANMELD_TELEGRAM_BOT_TOKEN).digest()).update(dcs).digest('hex');
  return d;
}
const stateUit = (url: string, naam = 'state') => new URL(url).searchParams.get(naam) || '';
const nonceUit = (url: string) => new URL(url).searchParams.get('nonce') || '';

export async function main(): Promise<number> {
  const { check, einde } = checker('extern-aanmelden-20261030');
  const oud = { ...process.env };
  try {
    // ---- configuratie / status (puur)
    for (const k of Object.keys(ENV)) delete process.env[k];
    check('zonder sleutels: alle 4 «niet geconfigureerd» met namen van ontbrekende instellingen', EXTERNE_AANBIEDERS.every((id) => ontbrekend(id).length > 0) && ontbrekend('discord').join() === 'AANMELD_DISCORD_CLIENT_ID,AANMELD_DISCORD_CLIENT_SECRET');
    const s0 = statusVan({ id: 'apple', vlagAan: true, beleidAan: true, ontbreekt: ontbrekend('apple'), binding: null, laatsteMethode: false });
    check('status niet-geconfigureerd: reden uk+nl, geen koppel-URL', s0.status === 'niet-geconfigureerd' && !!s0.reden?.uk && !!s0.reden?.nl && !s0.actieKoppelUrl && s0.kanLosmaken === false);
    check('reden bevat geen waarden, alleen namen', /AANMELD_APPLE_PRIVATE_KEY/.test(s0.reden!.nl));
    Object.assign(process.env, ENV);
    check('met sleutels: niets ontbreekt', EXTERNE_AANBIEDERS.every((id) => ontbrekend(id).length === 0));
    check('vlag uit → uitgeschakeld', statusVan({ id: 'discord', vlagAan: false, beleidAan: true, ontbreekt: [], laatsteMethode: false }).status === 'uitgeschakeld');
    check('beleid uit → uitgeschakeld', statusVan({ id: 'discord', vlagAan: true, beleidAan: false, ontbreekt: [], laatsteMethode: false }).status === 'uitgeschakeld');
    const sg = statusVan({ id: 'discord', vlagAan: true, beleidAan: true, ontbreekt: [], laatsteMethode: false });
    check('vlag+beleid+sleutels, geen binding → gereed-om-te-koppelen + same-origin koppel-URL', sg.status === 'gereed-om-te-koppelen' && sg.actieKoppelUrl === '/api/owner/identity/extern/discord/koppelen');
    const sa = statusVan({ id: 'discord', vlagAan: true, beleidAan: true, ontbreekt: [], binding: { label: 'Pavlo', createdAt: Date.parse('2026-10-30T09:00:00Z') }, laatsteMethode: true });
    check('binding → actief, label, datum ISO, laatste methode → kanLosmaken false', sa.status === 'actief' && sa.accountLabel === 'Pavlo' && sa.gekoppeldOp === '2026-10-30T09:00:00.000Z' && sa.kanLosmaken === false);
    check('actief zonder lockout → kanLosmaken true + losmaakUrl', statusVan({ id: 'discord', vlagAan: true, beleidAan: true, ontbreekt: [], binding: { label: 'x' }, laatsteMethode: false }).kanLosmaken === true);
    process.env.AANMELD_TELEGRAM_BOT_TOKEN = 'geen-token';
    check('Telegram-token met verkeerde vorm → niet geconfigureerd', ontbrekend('telegram').some((n) => /ongeldige vorm/.test(n)));
    process.env.AANMELD_TELEGRAM_BOT_TOKEN = ENV.AANMELD_TELEGRAM_BOT_TOKEN;
    check('terug-URL = id.tarasevych.com/api/owner/identity/extern/<id>/terug', terugUrl('apple') === 'https://id.tarasevych.com/api/owner/identity/extern/apple/terug');

    let klok = Date.now();
    const opslag = geheugenOpslag(() => klok);
    const deps: Deps = { opslag, fetch: nepFetch, nu: () => klok };
    const begin = async (aanbieder: 'microsoft' | 'apple' | 'discord' | 'telegram', doel: 'aanmelden' | 'koppelen' = 'aanmelden') => {
      const { url, state } = await start({ aanbieder, doel, userId: doel === 'koppelen' ? 'u1' : undefined, ownerTxId: doel === 'aanmelden' ? 'tx1' : undefined, locale: 'uk', remember: true }, deps);
      laatsteNonce = nonceUit(url); jwksCacheLegen(); return { url, state };
    };
    const fout = async (p: Promise<unknown>) => { try { await p; return 'GEEN_FOUT'; } catch (e) { return (e as Error).message; } };

    // ---- Microsoft
    let { url, state } = await begin('microsoft');
    const u = new URL(url);
    check('MS start: PKCE S256, nonce, state, redirect_uri, scope', u.searchParams.get('code_challenge_method') === 'S256' && (u.searchParams.get('code_challenge') || '').length === 43 && laatsteNonce.length === 43 && state.length === 43 && u.searchParams.get('redirect_uri') === terugUrl('microsoft') && u.searchParams.get('scope') === 'openid email profile');
    check('MS start: geen geheim in de URL', !url.includes(ENV.AANMELD_MICROSOFT_CLIENT_SECRET));
    const t1 = await terug('microsoft', { state, code: 'c1' }, deps);
    const r1 = await neemResultaat(t1.overdracht, deps);
    check('MS terug: geldig → onderwerp tid:oid, label e-mail', r1?.identiteit.onderwerp === `${MS_TID}:oid-1` && r1?.identiteit.label === 'pavlo@outlook.example' && r1.staat.ownerTxId === 'tx1');
    check('overdracht is eenmalig', (await neemResultaat(t1.overdracht, deps)) === null);
    check('MS state hergebruik (replay) → EXTERN_STATE_ONGELDIG', (await fout(terug('microsoft', { state, code: 'c1' }, deps))) === 'EXTERN_STATE_ONGELDIG');
    check('foute state → EXTERN_STATE_ONGELDIG', (await fout(terug('microsoft', { state: randomBytes(32).toString('base64url'), code: 'c' }, deps))) === 'EXTERN_STATE_ONGELDIG');
    ({ state } = await begin('microsoft'));
    check('state van Microsoft bij Discord-terugkeer → geweigerd', (await fout(terug('discord', { state, code: 'c' }, deps))) === 'EXTERN_STATE_ONGELDIG');
    ({ state } = await begin('microsoft'));
    klok += 11 * 60 * 1000;
    check('verlopen state (11 min) → EXTERN_STATE_ONGELDIG', (await fout(terug('microsoft', { state, code: 'c' }, deps))) === 'EXTERN_STATE_ONGELDIG');
    klok = Date.now();
    const msClaims = (n: string, x: Record<string, unknown> = {}) => ({ iss: `https://login.microsoftonline.com/${MS_TID}/v2.0`, tid: MS_TID, oid: 'oid-1', sub: 's', aud: ENV.AANMELD_MICROSOFT_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), nonce: n, ...x });
    const geval = async (g: Gedrag) => { gedrag = g; const { state: st } = await begin('microsoft'); const f = await fout(terug('microsoft', { state: st, code: 'c' }, deps)); gedrag = {}; return f; };
    check('vervalste id_token (andere sleutel, zelfde kid) → handtekening', (await geval({ sleutel: valseSleutel })) === 'EXTERN_ID_TOKEN_HANDTEKENING');
    check('onbekende kid → geweigerd', (await geval({ sleutel: valseSleutel, kid: 'onbekend' })) === 'EXTERN_ID_TOKEN_SLEUTEL_ONBEKEND');
    check('verkeerde audience → EXTERN_ID_TOKEN_AUD', (await geval({ claims: (n) => msClaims(n, { aud: 'andere-app' }) })) === 'EXTERN_ID_TOKEN_AUD');
    check('verkeerde nonce → EXTERN_NONCE_ONGELDIG', (await geval({ claims: () => msClaims('verkeerd') })) === 'EXTERN_NONCE_ONGELDIG');
    check('verlopen id_token → EXTERN_ID_TOKEN_VERLOPEN', (await geval({ claims: (n) => msClaims(n, { exp: Math.floor(Date.now() / 1000) - 3600 }) })) === 'EXTERN_ID_TOKEN_VERLOPEN');
    check('iss past niet bij tid → EXTERN_ID_TOKEN_ISS', (await geval({ claims: (n) => msClaims(n, { iss: 'https://login.microsoftonline.com/99999999-2222-3333-4444-555555555555/v2.0' }) })) === 'EXTERN_ID_TOKEN_ISS');
    process.env.AANMELD_MICROSOFT_TENANT = 'consumers';
    check('tenant consumers + werk-tid → EXTERN_ID_TOKEN_ISS', (await geval({ claims: (n) => msClaims(n) })) === 'EXTERN_ID_TOKEN_ISS');
    process.env.AANMELD_MICROSOFT_TENANT = 'common';
    check('alg none → EXTERN_ID_TOKEN_ALG', await (async () => { gedrag = {}; const { state: st } = await begin('microsoft'); const orig = gedrag; gedrag = { claims: (n) => msClaims(n) }; const echt = nepFetch; const f2 = (async (i: string | URL, init?: RequestInit) => { const r = await echt(i, init); if (String(i).endsWith('/token')) { const j = await r.json() as { id_token: string }; const d = j.id_token.split('.'); return new Response(JSON.stringify({ id_token: `${b64({ alg: 'none', kid: 'ms1' })}.${d[1]}.` })); } return r; }) as typeof fetch; const f = await fout(terug('microsoft', { state: st, code: 'c' }, { ...deps, fetch: f2 })); gedrag = orig; gedrag = {}; return f === 'EXTERN_ID_TOKEN_ALG'; })());
    check('code ongeldig bij aanbieder → EXTERN_CODE_ONGELDIG', (await geval({ tokenStatus: 400 })) === 'EXTERN_CODE_ONGELDIG');
    ({ state } = await begin('microsoft'));
    check('access_denied → EXTERN_GEWEIGERD (state verbruikt)', (await fout(terug('microsoft', { state, error: 'access_denied' }, deps))) === 'EXTERN_GEWEIGERD' && (await fout(terug('microsoft', { state, code: 'c' }, deps))) === 'EXTERN_STATE_ONGELDIG');

    // ---- Apple
    ({ url, state } = await begin('apple'));
    const au = new URL(url);
    check('Apple start: form_post, scope name email, nonce, geen PKCE', au.searchParams.get('response_mode') === 'form_post' && au.searchParams.get('scope') === 'name email' && !!laatsteNonce && !au.searchParams.has('code_challenge'));
    const at = await terug('apple', { state, code: 'ac', user: JSON.stringify({ name: { firstName: 'Pavlo', lastName: 'T' } }) }, deps);
    const ar = await neemResultaat(at.overdracht, deps);
    check('Apple: client_secret is geldige ES256-JWT (team/kid/sub)', appleSecretGeldig === true);
    check('Apple: onderwerp = sub, naam uit eerste keer', ar?.identiteit.onderwerp === '001234.apple.sub' && ar?.identiteit.label === 'Pavlo T');
    ({ state } = await begin('apple'));
    const ar2 = await neemResultaat((await terug('apple', { state, code: 'ac' }, deps)).overdracht, deps);
    check('Apple tweede keer zonder naam + relay-adres → label «приховану адресу», e-mail bewaard', ar2?.identiteit.label === 'Apple ID (приховану адресу)' && ar2?.identiteit.email === 'abc123@privaterelay.appleid.com');
    gedrag = { claims: (n) => ({ iss: 'https://appleid.apple.com', aud: 'com.ander', sub: 'x', exp: Math.floor(Date.now() / 1000) + 60, nonce: n }) };
    ({ state } = await begin('apple'));
    check('Apple verkeerde audience → EXTERN_ID_TOKEN_AUD', (await fout(terug('apple', { state, code: 'ac' }, deps))) === 'EXTERN_ID_TOKEN_AUD');
    gedrag = {};

    // ---- Discord
    ({ url, state } = await begin('discord'));
    check('Discord start: scope identify email + PKCE', new URL(url).searchParams.get('scope') === 'identify email' && new URL(url).searchParams.get('code_challenge_method') === 'S256');
    const dr = await neemResultaat((await terug('discord', { state, code: 'dc' }, deps)).overdracht, deps);
    check('Discord: onderwerp = id, label global_name, geverifieerde e-mail', dr?.identiteit.onderwerp === '80351110224678912' && dr?.identiteit.label === 'Pavlo' && dr?.identiteit.email === 'p@example.test');
    gedrag = { discordScope: 'email' };
    ({ state } = await begin('discord'));
    check('Discord zonder scope identify → EXTERN_ANTWOORD_ONVOLLEDIG', (await fout(terug('discord', { state, code: 'dc' }, deps))) === 'EXTERN_ANTWOORD_ONVOLLEDIG');
    gedrag = {};

    // ---- Telegram
    ({ url, state } = await begin('telegram'));
    const tu = new URL(url);
    check('Telegram start: bot_id = cijfers van token, return_to met state, origin', tu.searchParams.get('bot_id') === '7000000001' && (tu.searchParams.get('return_to') || '').endsWith(`/telegram/terug?s=${state}`) && !url.includes(ENV.AANMELD_TELEGRAM_BOT_TOKEN.split(':')[1]));
    const tg = (d: Record<string, string>) => Buffer.from(JSON.stringify(d)).toString('base64');
    const goed = telegramData();
    const trr = await neemResultaat((await terug('telegram', { s: state, tgAuthResult: tg(goed) }, deps)).overdracht, deps);
    check('Telegram geldig → onderwerp id, label @gebruikersnaam', trr?.identiteit.onderwerp === '424242' && trr?.identiteit.label === '@pavlo_t');
    ({ state } = await begin('telegram'));
    check('Telegram replay (zelfde ondertekende set, nieuwe state) → TELEGRAM_HERGEBRUIKT', (await fout(terug('telegram', { s: state, tgAuthResult: tg(goed) }, deps))) === 'TELEGRAM_HERGEBRUIKT');
    ({ state } = await begin('telegram'));
    check('Telegram hash met ander token → TELEGRAM_HASH_ONGELDIG', (await fout(terug('telegram', { s: state, tgAuthResult: tg(telegramData({ token: '7000000002:ander' })) }, deps))) === 'TELEGRAM_HASH_ONGELDIG');
    ({ state } = await begin('telegram'));
    check('Telegram auth_date 6 min oud → TELEGRAM_VERLOPEN', (await fout(terug('telegram', { s: state, tgAuthResult: tg(telegramData({ authDate: Math.floor(Date.now() / 1000) - 360 })) }, deps))) === 'TELEGRAM_VERLOPEN');
    const gewijzigd = { ...telegramData(), id: '999' };
    check('Telegram gewijzigd veld (id) → hash ongeldig', (() => { try { telegramControleren(gewijzigd, ENV.AANMELD_TELEGRAM_BOT_TOKEN); return false; } catch (e) { return (e as Error).message === 'TELEGRAM_HASH_ONGELDIG'; } })());
    check('Telegram toekomstige auth_date → geweigerd', (() => { try { telegramControleren(telegramData({ authDate: Math.floor(Date.now() / 1000) + 600 }), ENV.AANMELD_TELEGRAM_BOT_TOKEN); return false; } catch (e) { return (e as Error).message === 'TELEGRAM_AUTH_DATE_ONGELDIG'; } })());
    const hulp = telegramHulpHtml(state);
    check('Telegram hulppagina: CSP met script-hash, geen inline zonder hash, no-store', /script-src 'sha256-/.test(hulp.headers['Content-Security-Policy']) && hulp.headers['Cache-Control'] === 'no-store');

    // ---- start zonder sleutels
    delete process.env.AANMELD_DISCORD_CLIENT_SECRET;
    check('start zonder sleutels → EXTERN_NIET_GECONFIGUREERD', (await fout(start({ aanbieder: 'discord', doel: 'aanmelden', locale: 'uk', remember: true }, deps))) === 'EXTERN_NIET_GECONFIGUREERD');
    process.env.AANMELD_DISCORD_CLIENT_SECRET = ENV.AANMELD_DISCORD_CLIENT_SECRET;

    // ---- routes (nep-sessie, nep-step-up)
    let sessie: { user: { id: string; email: string; role: string; status: string } } | { errorCode: string } = { errorCode: 'GEEN' };
    let stap = 'STEP_UP_STRONG_REQUIRED';
    let koppelUitkomst: 'gekoppeld' | 'al-gekoppeld' | 'ander-account' = 'gekoppeld';
    const meldingen: string[] = []; const audits: string[] = [];
    const routes = externRoutes({
      stroom: () => deps, requireSession: async () => sessie as never, sterkeStapOpFout: async () => stap, toegestaan: async () => '',
      koppelen: async () => koppelUitkomst, aanmeldenAfronden: async () => ({ ok: false, code: 'EXTERN_NIET_GEKOPPELD' }),
      audit: async (_u, a, r) => { audits.push(`${a}:${r}`); }, meld: async (_u, soort, titel) => { meldingen.push(`${soort}|${titel}`); },
    });
    const ev = (method = 'GET') => ({ headers: {}, requestContext: { http: { method } } });
    const go = (k: string, params: Record<string, string>, query: Record<string, string> = {}, body: unknown = {}, m = 'GET') => routes[k][0]({ event: ev(m), body, params, query });
    let resp = await go('GET /api/owner/identity/extern/:id/koppelen', { id: 'discord' });
    check('koppelen zonder sessie → terug met OWNER_SESSION_REQUIRED (geen aanbieder-URL)', resp.statusCode === 303 && /fout=OWNER_SESSION_REQUIRED/.test(resp.headers.Location));
    sessie = { user: { id: 'u1', email: 'eigenaar@example.test', role: 'owner', status: 'approved' } };
    resp = await go('GET /api/owner/identity/extern/:id/koppelen', { id: 'discord' });
    check('koppelen zonder sterke step-up → STEP_UP_STRONG_REQUIRED', /fout=STEP_UP_STRONG_REQUIRED/.test(resp.headers.Location));
    stap = '';
    resp = await go('GET /api/owner/identity/extern/:id/koppelen', { id: 'discord' });
    check('koppelen met step-up → 303 naar discord.com', resp.statusCode === 303 && resp.headers.Location.startsWith('https://discord.com/oauth2/authorize?'));
    state = stateUit(resp.headers.Location);
    resp = await go('GET /api/owner/identity/extern/:id/terug', { id: 'discord' }, { state, code: 'dc' });
    check('terug → 303 naar eigen afronden-pad (geen resultaat in URL)', resp.statusCode === 303 && /^\/api\/owner\/identity\/extern\/afronden\?h=[A-Za-z0-9_-]{43}$/.test(resp.headers.Location));
    const h = new URL(`https://x${resp.headers.Location}`).searchParams.get('h')!;
    sessie = { user: { id: 'u2', email: 'ander@example.test', role: 'user', status: 'approved' } };
    resp = await go('GET /api/owner/identity/extern/afronden', {}, { h });
    check('afronden in een ANDERE sessie → EXTERN_SESSIE_ANDERS, niets gekoppeld', /fout=EXTERN_SESSIE_ANDERS/.test(resp.headers.Location) && !meldingen.length);
    const opnieuw = async () => { sessie = { user: { id: 'u1', email: 'eigenaar@example.test', role: 'owner', status: 'approved' } }; const r0 = await go('GET /api/owner/identity/extern/:id/koppelen', { id: 'discord' }); const r1 = await go('GET /api/owner/identity/extern/:id/terug', { id: 'discord' }, { state: stateUit(r0.headers.Location), code: 'dc' }); return go('GET /api/owner/identity/extern/afronden', {}, { h: new URL(`https://x${r1.headers.Location}`).searchParams.get('h')! }); };
    koppelUitkomst = 'ander-account';
    resp = await opnieuw();
    check('extern account al bij ander account → EXTERN_AL_BIJ_ANDER_ACCOUNT', /fout=EXTERN_AL_BIJ_ANDER_ACCOUNT/.test(resp.headers.Location) && !meldingen.length);
    koppelUitkomst = 'gekoppeld';
    resp = await opnieuw();
    check('koppelen gelukt → gekoppeld=1 + melding security_warning (uk/nl)', /gekoppeld=1/.test(resp.headers.Location) && meldingen.length === 1 && meldingen[0].startsWith('security_warning|Підключено новий спосіб входу: Discord / Nieuwe aanmeldmethode gekoppeld: Discord'));
    resp = await go('GET /api/owner/identity/extern/afronden', {}, { h: 'x'.repeat(43) });
    check('onbekende overdracht → EXTERN_OVERDRACHT_ONGELDIG', /extern_fout=EXTERN_OVERDRACHT_ONGELDIG/.test(resp.headers.Location));
    // Apple form_post als ruwe x-www-form-urlencoded body
    sessie = { user: { id: 'u1', email: 'eigenaar@example.test', role: 'owner', status: 'approved' } };
    const ra = await go('GET /api/owner/identity/extern/:id/koppelen', { id: 'apple' });
    laatsteNonce = nonceUit(ra.headers.Location);
    resp = await go('POST /api/owner/identity/extern/:id/terug', { id: 'apple' }, {}, new URLSearchParams({ state: stateUit(ra.headers.Location), code: 'ac' }).toString(), 'POST');
    check('Apple form_post (urlencoded) → 303 naar afronden', resp.statusCode === 303 && resp.headers.Location.startsWith('/api/owner/identity/extern/afronden?h='));
    resp = await go('GET /api/owner/identity/extern/:id/terug', { id: 'telegram' }, { s: 'a'.repeat(43) });
    check('Telegram GET → hulppagina (HTML)', resp.statusCode === 200 && /text\/html/.test(resp.headers['Content-Type']));
    resp = await go('GET /api/owner/identity/extern/:id/terug', { id: 'microsoft' }, { state: 'kapot', code: 'c' });
    check('terug met kapotte state → aanmeldpagina met foutcode + audit rejected', /extern_fout=EXTERN_STATE_ONGELDIG/.test(resp.headers.Location) && audits.includes('access.extern.terug:rejected'));
    resp = await go('GET /api/owner/identity/extern/:id/koppelen', { id: 'whatsapp' });
    check('onbekende aanbieder (whatsapp) → geweigerd', /fout=EXTERN_ONBEKEND/.test(resp.headers.Location));

    // ---- uitlegregister
    const kaart = uitlegVoor({ id: 's:1', dienst: 'identity', soort: 'security_warning', ernst: 'waarschuwing' as never, titel: 'Підключено новий спосіб входу: Apple / Nieuwe aanmeldmethode gekoppeld: Apple', tekst: '', tijd: Date.now(), gelezen: false } as never);
    check('uitlegregister: «extern-gekoppeld» vóór «beveiliging», uk+nl, gevaarlijke actie', kaart.id === 'extern-gekoppeld' && UITLEG.findIndex((r) => r.id === 'extern-gekoppeld') < UITLEG.findIndex((r) => r.id === 'beveiliging') && kaart.acties.some((a) => a.gevaarlijk));

    // ---- bronregels (index.ts / start.ts / toegangslaag.ts)
    const idx = readFileSync('backend/index.ts', 'utf8'), st = readFileSync('server/start.ts', 'utf8'), tl = readFileSync('backend/toegangslaag.ts', 'utf8');
    check('index.ts: aanmelden alleen via bestaande binding + browserbinding + zelfde afronding als Google', /externBindingVoorOnderwerp\(aanbieder/.test(idx) && /aanmeldBindingKlopt\(ctx\.event,record\)\)\{await ownerAudit\('anonymous','EXTERN_CALLBACK'/.test(idx) && /ownerCompletePrimaryRedirect\(ctx,record,user,r\.staat\.remember/.test(idx));
    check('index.ts: sessie krijgt authMethod van de aanbieder', /authMethod:record\.externAanbieder\|\|'google'/.test(idx));
    check('start.ts: CSRF-uitzondering alleen voor appleid.apple.com op het Apple-terugpad', /origin === 'https:\/\/appleid\.apple\.com' && pad === '\/api\/owner\/identity\/extern\/apple\/terug'/.test(st));
    check('toegangslaag: losmaken met laatste-methode-bescherming en step-up', /'POST \/api\/owner\/access\/aanbieders\/:id\/losmaken'[\s\S]{0,600}assertNotLastMethod[\s\S]{0,200}stapOp\(auth,'aanmeldmethode'\)/.test(tl));
    check('toegangslaag: koppelen weigert onderwerp van ander account', /b\.userId!==userId&&\(b\.status==='active'\|\|Number\(b\.herstelTot/.test(tl));

    // ---- Postgres-opslag (migratie 0206)
    if (process.env.DATABASE_URL) {
      const pg = pgOpslag(() => getPool('systeem'));
      const k = createHash('sha256').update(randomBytes(8)).digest('hex');
      check('pg: zet + neem eenmalig', (await pg.zet(k, 'staat', { a: 1 }, 60000)) && JSON.stringify(await pg.neem(k, 'staat')) === '{"a":1}' && (await pg.neem(k, 'staat')) === null);
      const kr = createHash('sha256').update(randomBytes(8)).digest('hex');
      check('pg: replay-sleutel tweede keer geweigerd', (await pg.zet(kr, 'replay', {}, 60000)) && !(await pg.zet(kr, 'replay', {}, 60000)));
      const kv = createHash('sha256').update(randomBytes(8)).digest('hex');
      await pg.zet(kv, 'afronden', { b: 1 }, -1000);
      check('pg: verlopen rij wordt niet teruggegeven', (await pg.neem(kv, 'afronden')) === null);
      check('pg: verkeerde soort neemt niets', await (async () => { const kk = createHash('sha256').update(randomBytes(8)).digest('hex'); await pg.zet(kk, 'staat', {}, 60000); return (await pg.neem(kk, 'afronden')) === null && (await pg.neem(kk, 'staat')) !== null; })());
      const vlag = await getPool('systeem').query("SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'aanmeldaanbieders-v1'");
      check('migratie 0205: vlag bestaat en staat standaard UIT', vlag.rows.length === 1 && vlag.rows[0].aan === false && vlag.rows[0].standaard === false);
      await getPool('systeem').query("DELETE FROM app.extern_aanmeld_staten WHERE soort = 'replay' AND sleutel = $1", [kr]);
      await closePool();
    } else check('DATABASE_URL ontbreekt (pg-deel overgeslagen)', false);
    check('geen echte aanbieder aangeroepen (alleen nep)', verzoeken.every((v) => /microsoftonline\.com|appleid\.apple\.com|discord\.com/.test(v)));
  } finally {
    for (const k of Object.keys(ENV)) if (!(k in oud)) delete process.env[k];
  }
  return einde();
}
