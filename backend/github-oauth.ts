// Echte OAuth-koppeling met GitHub (web application flow), met de app van de EIGENAAR.
//
// Waarom zo: tot nu toe kon de site alleen een persoonlijke token (PAT) uit de kluis gebruiken — de knop «Aanmelden met
// GitHub» bestond niet. Hier staat de hele weg: start met een eenmalige `state`, terugkeer op het eigen domein, de code
// inwisselen, de scope controleren, de token versleuteld bewaren, vernieuwen zolang GitHub een vernieuwingstoken geeft en
// bij ontkoppelen de token bij GitHub echt intrekken.
//
// BYOS: de eigenaar registreert zijn eigen OAuth-app op zijn eigen GitHub-account en legt client id + client secret in zijn
// eigen kluis (doel «github-oauth»). Er staat geen gedeelde client id in deze code en het client secret gaat alleen als
// POST-veld naar github.com — nooit naar de browser, nooit in een URL, nooit in een journaalregel.
//
// Bronnen (nagekeken 20.10.2026):
//   docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps  (flow, velden, refresh)
//   docs.github.com/en/rest/apps/oauth-applications                                 (DELETE /applications/{client_id}/token)
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  GITHUB_OAUTH_CALLBACK_PAD, githubOauthScopeTekst, scopeVoldoet,
} from '../shared/github-koppeling';
import {
  koppelingBewaren, koppelingLezen, koppelingToken, koppelingVerversToken, koppelingWissen, oauthApp,
  stateBewaren, stateVerbruiken, stateVerifier, statesOpruimen, verzegelVoor, bijnaVerlopen, zegelPad,
  type KoppelingRecord,
} from './github-koppeling-opslag';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';

const GITHUB = 'https://github.com';
const API = 'https://api.github.com';
/** Altijd via de huidige globale fetch, zodat een test hem kan vervangen. */
const netwerk = ((input: any, init?: any) => globalThis.fetch(input, init)) as typeof fetch;

export type OauthUitkomst<T> = { ok: true; data: T } | { ok: false; fout: string; status: number };
const mis = (fout: string, status = 400): OauthUitkomst<never> => ({ ok: false, fout, status });

/** Foutcodes die GitHub zelf teruggeeft en die de kaart in woorden kan uitleggen; al het andere wordt één algemene code. */
const BEKENDE_FOUTEN = new Set(['bad_verification_code', 'incorrect_client_credentials', 'redirect_uri_mismatch', 'bad_refresh_token', 'unverified_user_email', 'incorrect_client_credentials']);
const foutCodeVan = (waarde: unknown): string => {
  const code = String(waarde ?? '').trim().slice(0, 60);
  return BEKENDE_FOUTEN.has(code) ? code : code ? 'GITHUB_OAUTH_AFGEWEZEN' : '';
};

/** De terugkeeradres van DEZE installatie, gerekend uit de host waarop de flow loopt (nooit een vast domein). */
export const callbackUrlVoor = (host: string): string => `https://${String(host).trim().toLowerCase()}${GITHUB_OAUTH_CALLBACK_PAD}`;

// ------------------------------------------------------------------------------------------------ 1. starten

/**
 * Begin van de flow. De `state` is 32 willekeurige bytes; alleen de hash blijft op de server, gebonden aan deze gebruiker,
 * deze sessie, deze host en dit moment (10 minuten). PKCE (S256) komt erbij, zodat een onderschepte code alleen nog met de
 * verifier van de server iets waard is.
 */
export async function oauthStarten(userId: string, opties: { sessieToken: string; host: string; ruimte?: AiRuimte }): Promise<OauthUitkomst<{ authUrl: string }>> {
  // De LADE waarin deze koppeling komt. De aanroeper (de route) heeft haar al door de poort gehaald
  // (backend/ruimte-scheiding.ts → gegevensLade, dienst 'github'); hier wordt zij alleen meegedragen tot de terugkeer.
  const ruimte = ruimteOf(opties.ruimte);
  const host = String(opties.host || '').trim().toLowerCase();
  if (!host) return mis('GITHUB_OAUTH_HOST_ONJUIST', 400);
  const app = await oauthApp(userId);
  if (app === null) return mis('GITHUB_OAUTH_APP_ONTBREEKT', 409);
  if (app === 'onleesbaar') return mis('GITHUB_OAUTH_APP_ONLEESBAAR', 409);

  await statesOpruimen(userId).catch(() => undefined);
  const scope = githubOauthScopeTekst();
  const { state, verifier } = await stateBewaren(userId, { sessieToken: opties.sessieToken, host, clientId: app.clientId, scopeGevraagd: scope, ruimte });
  const uitdaging = createHash('sha256').update(verifier).digest('base64url');
  const params = new URLSearchParams({
    client_id: app.clientId, redirect_uri: callbackUrlVoor(host), scope, state,
    code_challenge: uitdaging, code_challenge_method: 'S256', allow_signup: 'false',
  });
  return { ok: true, data: { authUrl: `${GITHUB}/login/oauth/authorize?${params.toString()}` } };
}

// ------------------------------------------------------------------------------------------------ 2. terugkeer

type TokenAntwoord = { access_token?: string; token_type?: string; scope?: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; error?: string; error_description?: string };

/** Eén POST naar github.com/login/oauth/access_token. Het client secret zit in de body, nooit in de URL. */
async function tokenRuilen(velden: Record<string, string>): Promise<OauthUitkomst<TokenAntwoord>> {
  let res: Response;
  try {
    res = await netwerk(`${GITHUB}/login/oauth/access_token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'mijn-ruimte' },
      body: new URLSearchParams(velden).toString(),
      signal: AbortSignal.timeout(20_000), redirect: 'error',
    });
  } catch { return mis('GITHUB_UNREACHABLE', 502); }
  const data = (await res.json().catch(() => null)) as TokenAntwoord | null;
  if (!data) return mis('GITHUB_OAUTH_ANTWOORD_ONLEESBAAR', 502);
  if (data.error) return mis(foutCodeVan(data.error) || 'GITHUB_OAUTH_AFGEWEZEN', 400);
  if (!data.access_token) return mis('GITHUB_OAUTH_GEEN_TOKEN', 502);
  return { ok: true, data };
}

/** Wie zijn we met deze token? Alleen de login en de naam; de token gaat uitsluitend in de Authorization-header. */
async function wieBenIk(token: string): Promise<{ login: string; naam: string } | null> {
  try {
    const res = await netwerk(`${API}/user`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mijn-ruimte', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(20_000), redirect: 'error',
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { login?: string; name?: string } | null;
    return data?.login ? { login: String(data.login).slice(0, 60), naam: String(data.name || '').slice(0, 100) } : null;
  } catch { return null; }
}

const gelijk = (a: string, b: string): boolean => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * GitHub stuurt de browser hierheen. Alles wordt gecontroleerd vóórdat er één verzoek naar GitHub gaat:
 *  - de host van het verzoek is de host waarop de flow begon (geen vreemd domein dat onze codes opvangt);
 *  - de `state` bestaat, is niet verlopen en wordt bij het ophalen meteen verwijderd (dus eenmalig);
 *  - de sessie die terugkomt is dezelfde die de flow startte.
 * Pas daarna wordt de code ingewisseld en de scope gecontroleerd.
 */
export async function oauthTerugkeer(invoer: { state: string; code: string; fout?: string; host: string; sessieToken: string; userId: string }): Promise<OauthUitkomst<{ login: string; scopes: string[]; verlooptOp: number; ruimte: AiRuimte }>> {
  const rij = await stateVerbruiken(String(invoer.state || ''));
  if (!rij) return mis('GITHUB_OAUTH_STATE_ONBEKEND', 400);

  const host = String(invoer.host || '').trim().toLowerCase();
  if (!host || host !== rij.host) return mis('GITHUB_OAUTH_HOST_ONJUIST', 400);
  if (!invoer.sessieToken || !gelijk(createHash('sha256').update(invoer.sessieToken).digest('hex'), rij.sessieHash)) return mis('GITHUB_OAUTH_STATE_ANDERE_SESSIE', 403);
  if (!invoer.userId || invoer.userId !== rij.userId) return mis('GITHUB_OAUTH_STATE_ANDERE_SESSIE', 403);
  if (invoer.fout) return mis(invoer.fout === 'access_denied' ? 'GITHUB_OAUTH_GEWEIGERD' : foutCodeVan(invoer.fout) || 'GITHUB_OAUTH_AFGEWEZEN', 400);
  if (!invoer.code) return mis('GITHUB_OAUTH_CODE_ONTBREEKT', 400);

  const app = await oauthApp(rij.userId);
  if (app === null) return mis('GITHUB_OAUTH_APP_ONTBREEKT', 409);
  if (app === 'onleesbaar') return mis('GITHUB_OAUTH_APP_ONLEESBAAR', 409);
  // De app mag tussen start en terugkeer niet zijn verwisseld: anders hoort de code niet bij deze client.
  if (app.clientId !== rij.clientId) return mis('GITHUB_OAUTH_STATE_ONBEKEND', 409);

  const geruild = await tokenRuilen({
    client_id: app.clientId, client_secret: app.clientSecret, code: String(invoer.code).slice(0, 200),
    redirect_uri: callbackUrlVoor(host), code_verifier: stateVerifier(rij),
  });
  if (!geruild.ok) return geruild;

  const controle = scopeVoldoet(geruild.data.scope);
  if (!controle.ok) return mis('GITHUB_OAUTH_SCOPE_TE_KLEIN', 403);

  const token = String(geruild.data.access_token);
  const ik = await wieBenIk(token);
  if (!ik) return mis('GITHUB_TOKEN_INVALID', 401);

  const nu = Date.now();
  const verlooptOp = Number(geruild.data.expires_in) > 0 ? nu + Number(geruild.data.expires_in) * 1000 : 0;
  // De lade komt uit de BEWAARDE state, niet uit de terugkeer van GitHub: wie de flow in de technische ruimte begon, krijgt
  // de token ook daar, en GitHub kan die keuze niet veranderen.
  const ruimte = ruimteOf(rij.ruimte);
  await koppelingBewaren(rij.userId, 'oauth', {
    login: ik.login, scopes: controle.scopes, tokenZegel: await verzegelVoor(token, rij.userId, zegelPad('oauth', ruimte), ruimte),
    verversZegel: geruild.data.refresh_token ? await verzegelVoor(String(geruild.data.refresh_token), rij.userId, `${zegelPad('oauth', ruimte)}:verversen`, ruimte) : '',
    verlooptOp, verversVerlooptOp: Number(geruild.data.refresh_token_expires_in) > 0 ? nu + Number(geruild.data.refresh_token_expires_in) * 1000 : 0,
  }, ruimte);
  return { ok: true, data: { login: ik.login, scopes: controle.scopes, verlooptOp, ruimte } };
}

// ------------------------------------------------------------------------------------------------ 3. vernieuwen

/**
 * Een verlopen (of bijna verlopen) token vernieuwen. Alleen mogelijk als de eigenaar in zijn OAuth-app «expiration» aan heeft
 * staan — dan geeft GitHub een vernieuwingstoken. Zonder dat verloopt de token niet en hoeft hier niets te gebeuren.
 * Let op: GitHub maakt bij het vernieuwen zowel de oude token als de oude vernieuwingstoken ongeldig, dus het antwoord wordt
 * altijd volledig overschreven.
 */
export async function oauthVernieuwen(userId: string, ruimteIn: AiRuimte = 'prive'): Promise<OauthUitkomst<{ token: string; verlooptOp: number }>> {
  const ruimte = ruimteOf(ruimteIn);
  const record = await koppelingLezen(userId, 'oauth', ruimte);
  if (!record) return mis('GITHUB_TOKEN_MISSING', 409);
  const ververs = await koppelingVerversToken(record, userId);
  if (!ververs) return mis('bad_refresh_token', 401);
  const app = await oauthApp(userId);
  if (app === null || app === 'onleesbaar') return mis(app === null ? 'GITHUB_OAUTH_APP_ONTBREEKT' : 'GITHUB_OAUTH_APP_ONLEESBAAR', 409);

  const geruild = await tokenRuilen({ client_id: app.clientId, client_secret: app.clientSecret, grant_type: 'refresh_token', refresh_token: ververs });
  if (!geruild.ok) return geruild;

  const nu = Date.now();
  const token = String(geruild.data.access_token);
  const verlooptOp = Number(geruild.data.expires_in) > 0 ? nu + Number(geruild.data.expires_in) * 1000 : 0;
  const scopes = geruild.data.scope ? scopeVoldoet(geruild.data.scope).scopes : record.scopes;
  await koppelingBewaren(userId, 'oauth', {
    tokenZegel: await verzegelVoor(token, userId, zegelPad('oauth', ruimte), ruimte),
    verversZegel: geruild.data.refresh_token ? await verzegelVoor(String(geruild.data.refresh_token), userId, `${zegelPad('oauth', ruimte)}:verversen`, ruimte) : '',
    verlooptOp, verversVerlooptOp: Number(geruild.data.refresh_token_expires_in) > 0 ? nu + Number(geruild.data.refresh_token_expires_in) * 1000 : 0,
    scopes,
  }, ruimte);
  return { ok: true, data: { token, verlooptOp } };
}

// ------------------------------------------------------------------------------------------------ 4. de token gebruiken

/**
 * De bruikbare OAuth-token van deze gebruiker, zo nodig eerst vernieuwd. Dit is wat de rest van de server aanroept — nooit
 * de opslag rechtstreeks, zodat niemand per ongeluk met een verlopen token werkt.
 */
export async function oauthToken(userId: string, ruimteIn: AiRuimte = 'prive'): Promise<{ token: string; record: KoppelingRecord } | null> {
  const ruimte = ruimteOf(ruimteIn);
  let record = await koppelingLezen(userId, 'oauth', ruimte);
  if (!record) return null;
  if (bijnaVerlopen(record)) {
    const nieuw = await oauthVernieuwen(userId, ruimte);
    if (!nieuw.ok) return null;
    record = await koppelingLezen(userId, 'oauth', ruimte);
    if (!record) return null;
    return { token: nieuw.data.token, record };
  }
  const token = await koppelingToken(record, userId);
  return token ? { token, record } : null;
}

// ------------------------------------------------------------------------------------------------ 5. ontkoppelen

/**
 * Ontkoppelen trekt de token bij GitHub ECHT in (DELETE /applications/{client_id}/token, basisauthenticatie met client id en
 * secret) en verwijdert daarna het record. Lukt het intrekken niet, dan verdwijnt het record hier alsnog — anders zou de
 * eigenaar vastzitten aan een koppeling die hij niet kwijt kan — en krijgt hij de reden te zien.
 */
export async function oauthOntkoppelen(userId: string, ruimteIn: AiRuimte = 'prive'): Promise<OauthUitkomst<{ ingetrokken: boolean }>> {
  const ruimte = ruimteOf(ruimteIn);
  const record = await koppelingLezen(userId, 'oauth', ruimte);
  if (!record) return mis('GITHUB_TOKEN_MISSING', 409);
  const token = await koppelingToken(record, userId);
  const app = await oauthApp(userId);
  let ingetrokken = false;
  if (token && app && app !== 'onleesbaar') {
    try {
      const auth = Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64');
      const res = await netwerk(`${API}/applications/${encodeURIComponent(app.clientId)}/token`, {
        method: 'DELETE',
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'mijn-ruimte', 'X-GitHub-Api-Version': '2022-11-28' },
        body: JSON.stringify({ access_token: token }),
        signal: AbortSignal.timeout(20_000), redirect: 'error',
      });
      // 204 = ingetrokken; 404 = GitHub kent de token niet meer (dus ook goed).
      ingetrokken = res.status === 204 || res.status === 404;
    } catch { ingetrokken = false; }
  }
  await koppelingWissen(userId, 'oauth', ruimte);
  return ingetrokken ? { ok: true, data: { ingetrokken } } : { ok: false, fout: 'GITHUB_OAUTH_ONTKOPPELEN_MISLUKT', status: 502 };
}

/** Alleen voor tests: een willekeurige state zonder de database (vorm van de waarde vastleggen). */
export const proefState = () => randomBytes(32).toString('base64url');
