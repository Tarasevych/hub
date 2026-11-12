// Eénkliks GitHub-koppeling zonder handmatig sleutels te kopiëren:
//  1. Platform-OAuth of bestaande OAuth-app → directe omleiding naar het duidelijke toestemmingsscherm van GitHub;
//  2. Officiële GitHub App Manifest Flow → maakt en verzegelt op vers uitgerolde servers automatisch een eigen GitHub App
//     en start direct de aanmelding, zodat de gebruiker nergens een client_id, client_secret of PEM hoeft te kopiëren;
//  3. Officiële GitHub Device Flow → aanmelden met een korte 8-teken apparaatcode op telefoon of tweede scherm.
//
// Alle geheimen en tussencodes blijven uitsluitend AES-256-GCM-verzegeld op de server. Geen console-logboeken, geen tokens in URL's.
import { timingSafeEqual } from 'node:crypto';
import { db } from '../server/platform';
import { alsGebruiker } from './ai-toestemmingen';
import { githubOauthScopeTekst, scopeVoldoet } from '../shared/github-koppeling';
import { bouwGithubAppManifest, type GithubEenklikFeiten, type GithubEenklikModus } from '../shared/github-werkruimte';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';
import {
  EENKLIK_APP_TABEL, doelAanwezig, eenklikAppLezen, hash, isGeslotenFout, isKoppelingKluisGesloten, isKoppelingKluisVervangen,
  koppelingBewaren, nieuweState, oauthApp, ontzegel, platformOauthApp, verzegel, verzegelVoor, zegelPad, type EenklikAppRecord,
} from './github-koppeling-opslag';
import { oauthStarten } from './github-oauth';
import { GITHUB_OAUTH_DOEL } from '../shared/github-koppeling';

const GITHUB_WEB = 'https://github.com';
const GITHUB_API = 'https://api.github.com';

let netwerk: typeof fetch = ((input: any, init?: any) => globalThis.fetch(input, init)) as typeof fetch;
export const setEenklikNetwerk = (fn: typeof fetch | null) => {
  netwerk = fn ?? (((input: any, init?: any) => globalThis.fetch(input, init)) as typeof fetch);
};

export type EenklikUitkomst<T> = { ok: true; data: T } | { ok: false; fout: string; status: number };
const mis = (fout: string, status = 400): EenklikUitkomst<never> => ({ ok: false, fout, status });

const zelfdeHash = (a: string, b: string): boolean => {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Feiten voor de éénkliks koppelknop op de site. */
export async function eenklikFeiten(userId: string, ruimteIn: AiRuimte = 'prive'): Promise<GithubEenklikFeiten> {
  const ruimte = ruimteOf(ruimteIn);
  const eigenKluisOauth = await doelAanwezig(userId, GITHUB_OAUTH_DOEL);
  const eenklikApp = isKoppelingKluisVervangen() ? null : await eenklikAppLezen(userId, ruimte);
  const platformKlaar = !isKoppelingKluisVervangen() && platformOauthApp() !== null;
  const appGelezen = await oauthApp(userId, ruimte);
  const heeftOauth = appGelezen !== null && appGelezen !== 'onleesbaar';
  const kluisDicht = eenklikApp?.oauthZegel && !heeftOauth ? await isKoppelingKluisGesloten(userId, ruimte) : false;
  let modus: GithubEenklikModus = 'manifest';
  if (eigenKluisOauth && heeftOauth) modus = 'eigen-oauth';
  else if (eenklikApp?.oauthZegel && (heeftOauth || kluisDicht)) modus = 'eigen-app';
  else if (platformKlaar && heeftOauth) modus = 'platform-oauth';
  return {
    modus,
    directKlaar: true,
    platformOauthKlaar: platformKlaar,
    apparaatCodeKlaar: heeftOauth || Boolean(eenklikApp?.oauthZegel && kluisDicht),
    eigenAppKlaar: Boolean(eenklikApp?.appId || eenklikApp?.clientId),
  };
}

/**
 * Start éénkliks koppelen:
 *  • als er al een geldige OAuth-app is (platformbreed, uit eerder manifest of eigen kluis) → start direct OAuth;
 *  • anders → bereid het officiële GitHub App Manifest voor zodat GitHub de app in één klik aanmaakt en terugstuurt.
 */
export async function eenklikStarten(
  userId: string,
  gegevens: { sessieToken: string; host: string; ruimte?: AiRuimte },
): Promise<EenklikUitkomst<{ soort: 'oauth'; authUrl: string } | { soort: 'manifest'; actionUrl: string; manifestJson: string }>> {
  const ruimte = ruimteOf(gegevens.ruimte);
  if (!gegevens.sessieToken) return mis('OWNER_GITHUB_SESSION_REQUIRED', 403);
  if (!gegevens.host) return mis('GITHUB_OAUTH_HOST_ONJUIST', 400);
  // Controleer vooraf of de persoonlijke sleutelkluis open staat: zo maakt de gebruiker niet onnodig een GitHub App aan
  // waarvan de sleutels straks niet verzegeld kunnen worden.
  if (await isKoppelingKluisGesloten(userId, ruimte)) return mis('SLEUTELKLUIS_GESLOTEN', 423);

  const bestaandOauth = await oauthApp(userId, ruimte);
  if (bestaandOauth && bestaandOauth !== 'onleesbaar') {
    const start = await oauthStarten(userId, { sessieToken: gegevens.sessieToken, host: gegevens.host, ruimte });
    if (!start.ok) return mis(start.fout, start.status);
    return { ok: true, data: { soort: 'oauth', authUrl: start.data.authUrl } };
  }

  const manifest = bouwGithubAppManifest(gegevens.host);
  if (!manifest) return mis('GITHUB_OAUTH_HOST_ONJUIST', 400);

  const state = nieuweState();
  const stateHash = hash(state);
  const sessieHash = hash(gegevens.sessieToken);
  await alsGebruiker(userId, async (q) => {
    await q(`DELETE FROM app.github_eenklik_manifesten WHERE user_id = $1 AND verloopt_op <= now()`, [userId]);
    await q(
      `INSERT INTO app.github_eenklik_manifesten (user_id, ruimte, soort, state_hash, sessie_hash, host, payload_zegel, verloopt_op)
       VALUES ($1, $2, 'manifest', $3, $4, $5, '', now() + interval '10 minutes')`,
      [userId, ruimte, stateHash, sessieHash, gegevens.host],
    );
  });

  return {
    ok: true,
    data: {
      soort: 'manifest',
      actionUrl: `${GITHUB_WEB}/settings/apps/new?state=${encodeURIComponent(state)}`,
      manifestJson: JSON.stringify(manifest),
    },
  };
}

/**
 * Verwerkt de terugkeer van GitHub na éénkliks aanmaken van een GitHub App via het manifest:
 * wisselt de eenmalige `code` in voor de sleutels van de app, verzegelt ze voor deze ruimte en stuurt direct door
 * naar het OAuth-toestemmingsscherm (zodat de gebruiker meteen gekoppeld is).
 */
export async function eenklikManifestTerugkeer(invoer: {
  state: string;
  code: string;
  host: string;
  sessieToken: string;
  userId: string;
}): Promise<EenklikUitkomst<{ vervolgUrl: string; ruimte: AiRuimte; slug: string }>> {
  if (!invoer.state || invoer.state.length > 200) return mis('GITHUB_OAUTH_STATE_ONBEKEND', 400);
  if (!invoer.code || !/^[A-Za-z0-9_-]{6,200}$/.test(invoer.code)) return mis('GITHUB_OAUTH_CODE_ONTBREEKT', 400);

  const stateHash = hash(invoer.state);
  const rij = await alsGebruiker(invoer.userId, async (q) => {
    const r = await q(
      `DELETE FROM app.github_eenklik_manifesten
        WHERE user_id = $1 AND soort = 'manifest' AND state_hash = $2
        RETURNING ruimte, sessie_hash, host, (verloopt_op > now()) AS vers`,
      [invoer.userId, stateHash],
    );
    return r.rows[0] ?? null;
  });

  if (!rij || !rij.vers) return mis('GITHUB_OAUTH_STATE_ONBEKEND', 400);
  if (!invoer.sessieToken || !zelfdeHash(String(rij.sessie_hash), hash(invoer.sessieToken))) {
    return mis('GITHUB_OAUTH_STATE_ANDERE_SESSIE', 403);
  }
  if (!invoer.host || String(rij.host) !== invoer.host) return mis('GITHUB_OAUTH_HOST_ONJUIST', 400);

  const ruimte = ruimteOf(rij.ruimte);
  if (await isKoppelingKluisGesloten(invoer.userId, ruimte)) return mis('SLEUTELKLUIS_GESLOTEN', 423);

  let omgezet: { status: number; data: any } | null = null;
  try {
    const res = await netwerk(`${GITHUB_API}/app-manifests/${encodeURIComponent(invoer.code)}/conversions`, {
      method: 'POST',
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mijn-ruimte', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    });
    omgezet = { status: res.status, data: await res.json().catch(() => null) };
  } catch { omgezet = null; }

  if (!omgezet || omgezet.status !== 201 || !omgezet.data?.client_id || !omgezet.data?.client_secret) {
    return mis('GITHUB_MANIFEST_MISLUKT', 502);
  }

  const appId = String(omgezet.data.id || '').replace(/[^0-9]/g, '');
  const slug = String(omgezet.data.slug || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const clientId = String(omgezet.data.client_id).trim();
  const clientSecret = String(omgezet.data.client_secret).trim();
  const pem = typeof omgezet.data.pem === 'string' ? omgezet.data.pem.trim() : '';

  try {
    const oauthZegel = await verzegelVoor(
      JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
      invoer.userId,
      zegelPad('eenklik:oauth', ruimte),
      ruimte,
    );
    const appPemZegel = pem && appId
      ? await verzegelVoor(`app_id: ${appId}\nclient_id: ${clientId}\n${pem}`, invoer.userId, zegelPad('eenklik:pem', ruimte), ruimte)
      : '';

    const nu = Date.now();
    const bestaand = await eenklikAppLezen(invoer.userId, ruimte);
    const record: EenklikAppRecord = {
      userId: invoer.userId,
      ruimte,
      appId,
      slug,
      clientId,
      oauthZegel,
      appPemZegel,
      aangemaaktOp: bestaand?.aangemaaktOp ?? nu,
      bijgewerktOp: nu,
    };
    if (bestaand) await db.update(EENKLIK_APP_TABEL, [{ id: bestaand.id, record }]);
    else await db.add(EENKLIK_APP_TABEL, [record]);
  } catch (err) {
    return isGeslotenFout(err) ? mis('SLEUTELKLUIS_GESLOTEN', 423) : mis('GITHUB_KOPPELING_BEWAREN_MISLUKT', 500);
  }

  const start = await oauthStarten(invoer.userId, { sessieToken: invoer.sessieToken, host: invoer.host, ruimte });
  if (start.ok) {
    return { ok: true, data: { vervolgUrl: start.data.authUrl, ruimte, slug } };
  }
  const installUrl = slug ? `${GITHUB_WEB}/apps/${encodeURIComponent(slug)}/installations/new` : `https://${invoer.host}/accounts?github=ok`;
  return { ok: true, data: { vervolgUrl: installUrl, ruimte, slug } };
}

/**
 * Start de GitHub Device Flow (aanmelden met een 8-teken code zonder browser-omleiding).
 * De `device_code` blijft uitsluitend verzegeld op de server.
 */
export async function apparaatCodeStarten(
  userId: string,
  gegevens: { ruimte?: AiRuimte },
): Promise<EenklikUitkomst<{ state: string; userCode: string; verificationUri: string; expiresIn: number; interval: number }>> {
  const ruimte = ruimteOf(gegevens.ruimte);
  if (await isKoppelingKluisGesloten(userId, ruimte)) return mis('SLEUTELKLUIS_GESLOTEN', 423);
  const app = await oauthApp(userId, ruimte);
  if (app === null) return mis('GITHUB_OAUTH_APP_ONTBREEKT', 409);
  if (app === 'onleesbaar') return mis('GITHUB_OAUTH_APP_ONLEESBAAR', 409);

  let antwoord: { status: number; data: any } | null = null;
  try {
    const res = await netwerk(`${GITHUB_WEB}/login/device/code`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'mijn-ruimte' },
      body: new URLSearchParams({ client_id: app.clientId, scope: githubOauthScopeTekst() }),
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    });
    antwoord = { status: res.status, data: await res.json().catch(() => null) };
  } catch { antwoord = null; }

  if (!antwoord || antwoord.status !== 200 || !antwoord.data?.device_code || !antwoord.data?.user_code) {
    return mis('GITHUB_UNREACHABLE', 502);
  }

  const state = nieuweState();
  const expiresIn = Math.min(900, Math.max(60, Number(antwoord.data.expires_in) || 900));
  const interval = Math.min(30, Math.max(5, Number(antwoord.data.interval) || 5));
  const payloadZegel = verzegel(
    JSON.stringify({ deviceCode: String(antwoord.data.device_code), clientId: app.clientId }),
    userId,
    'device:code',
  );

  await alsGebruiker(userId, async (q) => {
    await q(`DELETE FROM app.github_eenklik_manifesten WHERE user_id = $1 AND verloopt_op <= now()`, [userId]);
    await q(
      `INSERT INTO app.github_eenklik_manifesten (user_id, ruimte, soort, state_hash, sessie_hash, host, payload_zegel, verloopt_op)
       VALUES ($1, $2, 'device', $3, '', '', $4, now() + ($5 || ' seconds')::interval)`,
      [userId, ruimte, hash(state), payloadZegel, String(expiresIn)],
    );
  });

  return {
    ok: true,
    data: {
      state,
      userCode: String(antwoord.data.user_code).slice(0, 24),
      verificationUri: String(antwoord.data.verification_uri || `${GITHUB_WEB}/login/device`).slice(0, 120),
      expiresIn,
      interval,
    },
  };
}

/** Controleert of de gebruiker de apparaatcode op GitHub heeft bevestigd en bewaart bij succes het token. */
export async function apparaatCodePollen(
  userId: string,
  gegevens: { state: string; ruimte?: AiRuimte },
): Promise<EenklikUitkomst<{ status: 'wachten' } | { status: 'gekoppeld'; login: string; scopes: string[] }>> {
  const ruimte = ruimteOf(gegevens.ruimte);
  if (!gegevens.state || gegevens.state.length > 200) return mis('GITHUB_OAUTH_STATE_ONBEKEND', 400);
  if (await isKoppelingKluisGesloten(userId, ruimte)) return mis('SLEUTELKLUIS_GESLOTEN', 423);

  const stateHash = hash(gegevens.state);
  const rij = await alsGebruiker(userId, async (q) => {
    const r = await q(
      `SELECT id, payload_zegel, (verloopt_op > now()) AS vers
         FROM app.github_eenklik_manifesten
        WHERE user_id = $1 AND ruimte = $2 AND soort = 'device' AND state_hash = $3`,
      [userId, ruimte, stateHash],
    );
    return r.rows[0] ?? null;
  });

  if (!rij || !rij.vers) return mis('GITHUB_DEVICE_VERLOPEN', 410);

  let inhoud: { deviceCode: string; clientId: string } | null = null;
  try { inhoud = JSON.parse(ontzegel(String(rij.payload_zegel), userId, 'device:code')); } catch { inhoud = null; }
  if (!inhoud?.deviceCode || !inhoud.clientId) return mis('GITHUB_OAUTH_STATE_ONBEKEND', 400);

  let wissel: { status: number; data: any } | null = null;
  try {
    const res = await netwerk(`${GITHUB_WEB}/login/oauth/access_token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'mijn-ruimte' },
      body: new URLSearchParams({
        client_id: inhoud.clientId,
        device_code: inhoud.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    });
    wissel = { status: res.status, data: await res.json().catch(() => null) };
  } catch { wissel = null; }

  if (!wissel) return mis('GITHUB_UNREACHABLE', 502);
  const errCode = String(wissel.data?.error || '');
  if (errCode === 'authorization_pending' || errCode === 'slow_down') {
    return { ok: true, data: { status: 'wachten' } };
  }
  await alsGebruiker(userId, (q) => q(`DELETE FROM app.github_eenklik_manifesten WHERE id = $1 AND user_id = $2`, [rij.id, userId]));
  if (errCode === 'access_denied') return mis('GITHUB_OAUTH_GEWEIGERD', 400);
  if (errCode === 'expired_token') return mis('GITHUB_DEVICE_VERLOPEN', 410);
  if (errCode || !wissel.data?.access_token) return mis(errCode || 'GITHUB_MANIFEST_MISLUKT', 400);

  const token = String(wissel.data.access_token);
  const isGithubAppToken = inhoud.clientId.startsWith('Iv') || token.startsWith('ghu_');
  const controle = scopeVoldoet(wissel.data.scope, { githubAppUserToken: isGithubAppToken });
  if (!controle.ok && controle.scopes.length > 0) return mis('GITHUB_OAUTH_SCOPE_TE_KLEIN', 400);

  let persoon = '';
  try {
    const res = await netwerk(`${GITHUB_API}/user`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mijn-ruimte', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    });
    const u: any = await res.json().catch(() => null);
    if (res.status === 200 && u?.login) persoon = String(u.login).slice(0, 60);
  } catch { persoon = ''; }
  if (!persoon) return mis('GITHUB_TOKEN_INVALID', 502);

  const expiresIn = Number(wissel.data.expires_in) || 0;
  const refreshToken = typeof wissel.data.refresh_token === 'string' ? wissel.data.refresh_token : '';
  const refreshIn = Number(wissel.data.refresh_token_expires_in) || 0;
  const nu = Date.now();
  const bewaardeScopes = controle.scopes.length ? controle.scopes : ['repo'];
  try {
    await koppelingBewaren(userId, 'oauth', {
      login: persoon,
      scopes: bewaardeScopes,
      tokenZegel: await verzegelVoor(token, userId, zegelPad('oauth', ruimte), ruimte),
      verversZegel: refreshToken ? await verzegelVoor(refreshToken, userId, `${zegelPad('oauth', ruimte)}:verversen`, ruimte) : '',
      verlooptOp: expiresIn > 0 ? nu + expiresIn * 1000 : 0,
      verversVerlooptOp: refreshToken && refreshIn > 0 ? nu + refreshIn * 1000 : 0,
    }, ruimte);
  } catch (err) {
    return isGeslotenFout(err) ? mis('SLEUTELKLUIS_GESLOTEN', 423) : mis('GITHUB_KOPPELING_BEWAREN_MISLUKT', 500);
  }

  return { ok: true, data: { status: 'gekoppeld', login: persoon, scopes: bewaardeScopes } };
}
