// UI-015B — de aanmeldstroom voor externe aanbieders (start → aanbieder → terug → afronden). Eén generiek kader; de
// aanbieder-specifieke delen (eindpunten, tokenruil, profiel) staan in AANBIEDER_STAPPEN hieronder, de lijst van aanbieders
// en hun instellingen in ./aanbieders.ts.
//
// Veiligheid (zelfde patroon als de Google-aanmelding in backend/index.ts + oauth-pkce.ts):
//  - state, nonce en PKCE-verifier willekeurig per start (32 bytes), server-side bewaard, sleutel = sha256(state);
//    bij «terug» atomisch en EENMALIG genomen (DELETE … RETURNING) → hergebruik van state = fout (replay).
//  - id_token (Microsoft, Apple) gecontroleerd via JWKS: handtekening, iss, aud, exp, nonce (zie ./jwt.ts).
//  - Telegram: HMAC-SHA256 met het bot-token, auth_date ≤ 5 min, hash eenmalig (replay-opslag).
//  - «terug» rondt zelf NOOIT een sessie of koppeling af: het legt het geverifieerde resultaat eenmalig weg onder een
//    willekeurige overdrachtssleutel en stuurt de browser (303) naar «afronden» op dezelfde site. Daar komen de cookies mee
//    (ook na Apple's cross-site form_post, waar SameSite=Lax-cookies ontbreken) en gelden de gewone controles:
//    aanmelden → browserbinding van de eigenaartransactie (aanmeld-binding.ts); koppelen → dezelfde ingelogde sessie.
//  - Er wordt nooit een account aangemaakt en nooit op e-mailgelijkheid gekoppeld: alleen (aanbieder, onderwerp-id).
import { createHash, randomBytes } from 'node:crypto';
import { REGISTER, instelling, ontbrekend, terugUrl, TERUG_BASIS, type ExternAanbiederId } from './aanbieders';
import { appleClientSecret, idTokenControleren, type HaalJson } from './jwt';
import { botId, telegramControleren } from './telegram';

export const STAAT_MS = 10 * 60 * 1000;
export const OVERDRACHT_MS = 2 * 60 * 1000;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const challengeVan = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
const MS_CONSUMENTEN_TID = '9188040d-6c67-4c5b-b112-36a304b66dad';

export type Doel = 'aanmelden' | 'koppelen';
export type Staat = { aanbieder: ExternAanbiederId; doel: Doel; userId?: string; ownerTxId?: string; nonce: string; verifier: string; locale: 'uk' | 'nl'; remember: boolean };
export type Identiteit = { onderwerp: string; email?: string; label: string };
export type Resultaat = { staat: Omit<Staat, 'nonce' | 'verifier'>; identiteit: Identiteit };

/** Opslag (productie: app.extern_aanmeld_staten via de systeemrol; tests: in geheugen). Alles eenmalig + met vervaltijd. */
export interface Opslag {
  zet(sleutel: string, soort: 'staat' | 'afronden' | 'replay', gegevens: unknown, verlooptMs: number): Promise<boolean>;
  neem(sleutel: string, soort: 'staat' | 'afronden'): Promise<unknown | null>;
}
export type Deps = { opslag: Opslag; fetch?: typeof fetch; nu?: () => number };

const ophalen = async (deps: Deps, url: string, init: RequestInit = {}) => {
  const f = deps.fetch || fetch;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
  try { return await f(url, { ...init, signal: ctl.signal }); } catch { throw new Error('EXTERN_NETWERK'); } finally { clearTimeout(t); }
};
const haalJson = (deps: Deps): HaalJson => async (url) => { const r = await ophalen(deps, url); if (!r.ok) throw new Error('EXTERN_JWKS_ONGELDIG'); return r.json(); };
const formulier = (v: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(v).toString() });
async function tokenRuil(deps: Deps, url: string, velden: Record<string, string>): Promise<Record<string, unknown>> {
  const r = await ophalen(deps, url, formulier(velden));
  if (!r.ok) { let e = ''; try { e = String(((await r.json()) as { error?: string }).error || ''); } catch { /* leeg */ } throw new Error(e === 'invalid_grant' ? 'EXTERN_CODE_ONGELDIG' : e === 'invalid_client' ? 'EXTERN_CLIENT_ONGELDIG' : 'EXTERN_TOKENRUIL_MISLUKT'); }
  return (await r.json()) as Record<string, unknown>;
}
const msTenant = () => instelling('AANMELD_MICROSOFT_TENANT') || 'common';

type Stappen = {
  autorisatieUrl: (state: string, s: Staat) => string;
  verifieer: (params: Record<string, string>, s: Staat, deps: Deps) => Promise<Identiteit>;
};
export const AANBIEDER_STAPPEN: Record<ExternAanbiederId, Stappen> = {
  microsoft: {
    autorisatieUrl: (state, s) => `https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/authorize?${new URLSearchParams({ client_id: instelling('AANMELD_MICROSOFT_CLIENT_ID'), response_type: 'code', response_mode: 'query', redirect_uri: terugUrl('microsoft'), scope: REGISTER.microsoft.scopes, state, nonce: s.nonce, code_challenge: challengeVan(s.verifier), code_challenge_method: 'S256', prompt: 'select_account', ui_locales: s.locale })}`,
    async verifieer(p, s, deps) {
      const clientId = instelling('AANMELD_MICROSOFT_CLIENT_ID'), tenant = msTenant();
      const t = await tokenRuil(deps, `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { client_id: clientId, client_secret: instelling('AANMELD_MICROSOFT_CLIENT_SECRET'), code: p.code, redirect_uri: terugUrl('microsoft'), grant_type: 'authorization_code', code_verifier: s.verifier, scope: REGISTER.microsoft.scopes });
      if (typeof t.id_token !== 'string') throw new Error('EXTERN_ANTWOORD_ONVOLLEDIG');
      const c = await idTokenControleren(t.id_token, {
        jwksUrl: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`, aud: clientId, nonce: s.nonce, nu: deps.nu?.(),
        // Multi-tenant: iss moet precies bij de tid-claim horen; bij een vaste tenant/consumers/organizations ook de tid zelf.
        iss: (cl) => { const tid = String(cl.tid || ''); if (!/^[0-9a-f-]{36}$/i.test(tid) || cl.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) return false; if (tenant === 'consumers') return tid === MS_CONSUMENTEN_TID; if (tenant === 'organizations') return tid !== MS_CONSUMENTEN_TID; if (tenant !== 'common') return tid.toLowerCase() === tenant.toLowerCase(); return true; },
      }, haalJson(deps));
      const email = String(c.email || c.preferred_username || '').slice(0, 200);
      return { onderwerp: `${c.tid}:${String(c.oid || c.sub)}`, email: email || undefined, label: email || String(c.name || 'Microsoft').slice(0, 80) };
    },
  },
  apple: {
    autorisatieUrl: (state, s) => `https://appleid.apple.com/auth/authorize?${new URLSearchParams({ client_id: instelling('AANMELD_APPLE_SERVICES_ID'), redirect_uri: terugUrl('apple'), response_type: 'code', response_mode: 'form_post', scope: REGISTER.apple.scopes, state, nonce: s.nonce })}`,
    async verifieer(p, s, deps) {
      const servicesId = instelling('AANMELD_APPLE_SERVICES_ID');
      const geheim = appleClientSecret({ teamId: instelling('AANMELD_APPLE_TEAM_ID'), servicesId, keyId: instelling('AANMELD_APPLE_KEY_ID'), privePem: instelling('AANMELD_APPLE_PRIVATE_KEY'), nu: deps.nu?.() });
      const t = await tokenRuil(deps, 'https://appleid.apple.com/auth/token', { client_id: servicesId, client_secret: geheim, code: p.code, grant_type: 'authorization_code', redirect_uri: terugUrl('apple') });
      if (typeof t.id_token !== 'string') throw new Error('EXTERN_ANTWOORD_ONVOLLEDIG');
      const c = await idTokenControleren(t.id_token, { jwksUrl: 'https://appleid.apple.com/auth/keys', iss: 'https://appleid.apple.com', aud: servicesId, nonce: s.nonce, algs: ['RS256', 'ES256'], nu: deps.nu?.() }, haalJson(deps));
      // Naam komt alleen bij de eerste toestemming mee (veld «user» in de form_post); alleen als label, nooit als sleutel.
      let naam = '';
      try { const u = JSON.parse(p.user || '{}') as { name?: { firstName?: string; lastName?: string } }; naam = [u.name?.firstName, u.name?.lastName].filter(Boolean).join(' ').slice(0, 80); } catch { /* geen naam */ }
      const email = String(c.email || '').slice(0, 200);
      const relay = /@privaterelay\.appleid\.com$/i.test(email);
      return { onderwerp: String(c.sub), email: email || undefined, label: naam || (relay ? 'Apple ID (приховану адресу)' : email) || 'Apple ID' };
    },
  },
  discord: {
    autorisatieUrl: (state, s) => `https://discord.com/oauth2/authorize?${new URLSearchParams({ client_id: instelling('AANMELD_DISCORD_CLIENT_ID'), response_type: 'code', redirect_uri: terugUrl('discord'), scope: REGISTER.discord.scopes, state, code_challenge: challengeVan(s.verifier), code_challenge_method: 'S256', prompt: 'consent' })}`,
    async verifieer(p, s, deps) {
      const t = await tokenRuil(deps, 'https://discord.com/api/oauth2/token', { client_id: instelling('AANMELD_DISCORD_CLIENT_ID'), client_secret: instelling('AANMELD_DISCORD_CLIENT_SECRET'), code: p.code, redirect_uri: terugUrl('discord'), grant_type: 'authorization_code', code_verifier: s.verifier });
      if (typeof t.access_token !== 'string' || !/(^| )identify( |$)/.test(String(t.scope || ''))) throw new Error('EXTERN_ANTWOORD_ONVOLLEDIG');
      const r = await ophalen(deps, 'https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${t.access_token}` } });
      if (!r.ok) throw new Error('EXTERN_PROFIEL_MISLUKT');
      const u = (await r.json()) as { id?: string; username?: string; global_name?: string; email?: string; verified?: boolean };
      if (!u.id || !/^\d{5,25}$/.test(u.id)) throw new Error('EXTERN_PROFIEL_MISLUKT');
      return { onderwerp: u.id, email: u.verified ? String(u.email || '').slice(0, 200) || undefined : undefined, label: String(u.global_name || u.username || 'Discord').slice(0, 80) };
    },
  },
  telegram: {
    autorisatieUrl: (state) => `https://oauth.telegram.org/auth?${new URLSearchParams({ bot_id: botId(instelling('AANMELD_TELEGRAM_BOT_TOKEN')), origin: TERUG_BASIS(), return_to: `${terugUrl('telegram')}?s=${encodeURIComponent(state)}` })}`,
    async verifieer(p, _s, deps) {
      let data: Record<string, unknown>;
      try { data = JSON.parse(Buffer.from(String(p.tgAuthResult || ''), 'base64').toString('utf8')); } catch { throw new Error('TELEGRAM_DATA_ONGELDIG'); }
      const u = telegramControleren(data, instelling('AANMELD_TELEGRAM_BOT_TOKEN'), deps.nu?.() ?? Date.now());
      // Replay: dezelfde ondertekende set mag maar één keer gebruikt worden (ook binnen de 5 minuten).
      if (!(await deps.opslag.zet(sha(`telegram|${u.hash}`), 'replay', { at: u.authDate }, 10 * 60 * 1000))) throw new Error('TELEGRAM_HERGEBRUIKT');
      return { onderwerp: u.id, label: u.gebruikersnaam ? `@${u.gebruikersnaam}` : u.naam || 'Telegram' };
    },
  },
};

/** Start: maakt state/nonce/verifier, bewaart ze en geeft de autorisatie-URL. Gooit als de aanbieder niet volledig is ingesteld. */
export async function start(i: Omit<Staat, 'nonce' | 'verifier'>, deps: Deps): Promise<{ url: string; state: string }> {
  if (ontbrekend(i.aanbieder).length) throw new Error('EXTERN_NIET_GECONFIGUREERD');
  const state = randomBytes(32).toString('base64url');
  const s: Staat = { ...i, nonce: randomBytes(32).toString('base64url'), verifier: randomBytes(32).toString('base64url') };
  if (!(await deps.opslag.zet(sha(state), 'staat', s, STAAT_MS))) throw new Error('EXTERN_STAAT_OPSLAAN_MISLUKT');
  return { url: AANBIEDER_STAPPEN[i.aanbieder].autorisatieUrl(state, s), state };
}

/**
 * Terug van de aanbieder: state eenmalig nemen (fout/verlopen/hergebruikt = EXTERN_STATE_ONGELDIG), aanbieder moet kloppen,
 * dan verifiëren. Geeft een overdrachtssleutel voor «afronden» terug (nooit het resultaat zelf naar de browser).
 */
export async function terug(aanbieder: ExternAanbiederId, params: Record<string, string>, deps: Deps): Promise<{ overdracht: string; staat: Omit<Staat, 'nonce' | 'verifier'> }> {
  const state = String(params.state || params.s || '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new Error('EXTERN_STATE_ONGELDIG');
  const s = (await deps.opslag.neem(sha(state), 'staat')) as Staat | null;
  if (!s || s.aanbieder !== aanbieder) throw new Error('EXTERN_STATE_ONGELDIG');
  if (params.error) throw new Error(params.error === 'access_denied' || params.error === 'user_cancelled_authorize' ? 'EXTERN_GEWEIGERD' : 'EXTERN_AANBIEDER_FOUT');
  if (aanbieder !== 'telegram' && !params.code) throw new Error('EXTERN_CODE_ONTBREEKT');
  if (ontbrekend(aanbieder).length) throw new Error('EXTERN_NIET_GECONFIGUREERD');
  const identiteit = await AANBIEDER_STAPPEN[aanbieder].verifieer(params, s, deps);
  const { nonce: _n, verifier: _v, ...staat } = s;
  const overdracht = randomBytes(32).toString('base64url');
  const res: Resultaat = { staat, identiteit };
  if (!(await deps.opslag.zet(sha(overdracht), 'afronden', res, OVERDRACHT_MS))) throw new Error('EXTERN_STAAT_OPSLAAN_MISLUKT');
  return { overdracht, staat };
}

/** Afronden: overdracht eenmalig nemen. */
export async function neemResultaat(overdracht: string, deps: Deps): Promise<Resultaat | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(overdracht || ''))) return null;
  return (await deps.opslag.neem(sha(overdracht), 'afronden')) as Resultaat | null;
}

/** Productieopslag in Postgres (systeemrol; tabel uit migratie 0206). */
export function pgOpslag(pool: () => { query: (sql: string, p: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }): Opslag {
  return {
    async zet(sleutel, soort, gegevens, verlooptMs) {
      const r = await pool().query(`INSERT INTO app.extern_aanmeld_staten (sleutel, soort, gegevens, verloopt) VALUES ($1, $2, $3::jsonb, now() + ($4::int * interval '1 millisecond'))
        ON CONFLICT (sleutel) DO NOTHING RETURNING sleutel`, [sleutel, soort, JSON.stringify(gegevens), verlooptMs]);
      return r.rows.length > 0;
    },
    async neem(sleutel, soort) {
      const r = await pool().query('DELETE FROM app.extern_aanmeld_staten WHERE sleutel = $1 AND soort = $2 RETURNING gegevens, verloopt > now() AS geldig', [sleutel, soort]);
      const rij = r.rows[0];
      return rij && rij.geldig ? rij.gegevens : null;
    },
  };
}

/** Geheugenopslag (alleen tests). */
export function geheugenOpslag(nu: () => number = Date.now): Opslag & { rijen: Map<string, { soort: string; g: unknown; tot: number }> } {
  const rijen = new Map<string, { soort: string; g: unknown; tot: number }>();
  return {
    rijen,
    async zet(k, soort, g, ms) { const oud = rijen.get(k); if (oud && oud.tot > nu()) return false; rijen.set(k, { soort, g: JSON.parse(JSON.stringify(g)), tot: nu() + ms }); return true; },
    async neem(k, soort) { const r = rijen.get(k); if (!r || r.soort !== soort) return null; rijen.delete(k); return r.tot > nu() ? r.g : null; },
  };
}
