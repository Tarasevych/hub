// «Майстер підключень» (admin → Інтеграції → Майстер, 20.10.2026): de serverkant.
//
// Drie dingen, en niets meer:
//  1. STAND — per provider: de waarden voor de console (uit SERVICE_HOSTS), waar het secret leeft (env / kluis), of het er is
//     (alleen ja/nee en de bron; nooit een waarde), welke serversleutels ontbreken, of een herstart nodig is;
//  2. CONTROLEREN — een ECHTE controle bij de dienst zelf, zonder dat een mens hoeft in te loggen:
//       Google     POST token endpoint met een testcode → invalid_grant = client id + secret kloppen; invalid_client = niet;
//       Microsoft  discovery van de tenant + dezelfde token-proef (AADSTS-codes zeggen wat er mis is);
//       GitHub     POST /applications/{client_id}/token met basisauthenticatie → 404 = gegevens geldig, 401 = niet;
//       GitHub App een app-JWT ondertekenen en GET /app/installations (backend/github-app.ts).
//     Uitkomst = code + korte tekst; bewaard in app.integratie_controles (id «wizard-<provider>») en in het beheerlogboek;
//  3. de wizard schrijft ZELF geen geheimen: de browser gebruikt de bestaande kluisroute (POST /api/owner/api-platform/vault/save,
//     passkey/TOTP, backend/api-platform-kluis.ts). Hier staat alleen «vernieuwen» om de cache van de Google-terugval te wissen.
//
// Het client secret gaat in de controles uitsluitend als POST-veld of Basic-header naar de dienst zelf (zoals de echte flow),
// nooit in een URL, nooit in een antwoord, nooit in een journaalregel.
import { error, json, secrets } from '../server/platform';
import { envKey32 } from '../server/platform/beveiliging';
import type { RouterMiddleware } from '../server/platform/router';
import { getPool } from '../server/platform/pg';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { resolveGoogleContour } from './google-contour';
import { oauthApp, appSleutel, doelAanwezig } from './github-koppeling-opslag';
import { appInstallaties } from './github-app';
import { schrijfBeheerAudit } from './audit-gebeurtenis';
import { eigenaarUserId, googleClientUitKluis, kluisCacheWissen } from './integraties-kluis';
import {
  WIZARD_PROVIDERS, isWizardProvider, wizardWaarden, type WizardProviderId, type WizardWaarden,
} from '../shared/integraties-wizard';
import { GITHUB_APP_DOEL, GITHUB_OAUTH_DOEL } from '../shared/github-koppeling';
import type { AdminGate } from './beheer-integraties';
import { controleerStripe, stripeSleutelVan, STRIPE_DOEL } from './betalingen-stripe';

type Stand = 'ok' | 'let-op' | 'fout' | 'onbekend';
export type ControleUitkomst = { stand: Stand; code: string; detail: string; n?: number };
/** Altijd via de huidige globale fetch, zodat een test hem kan vervangen (zelfde patroon als backend/github-oauth.ts). */
const netwerk = ((input: any, init?: any) => globalThis.fetch(input, init)) as typeof fetch;
const TIJD = 12_000;
const sys = () => getPool('systeem');

const KOP = { 'User-Agent': 'mijn-ruimte', Accept: 'application/json' };
const post = async (url: string, velden: Record<string, string>, extraKop: Record<string, string> = {}) => {
  const res = await netwerk(url, { method: 'POST', headers: { ...KOP, 'Content-Type': 'application/x-www-form-urlencoded', ...extraKop }, body: new URLSearchParams(velden).toString(), signal: AbortSignal.timeout(TIJD), redirect: 'error' });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, data };
};
const get = async (url: string) => {
  const res = await netwerk(url, { headers: KOP, signal: AbortSignal.timeout(TIJD), redirect: 'error' });
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, data };
};
const tekst = (v: unknown, max = 200) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);

// ------------------------------------------------------------------------------------------------ echte controles

/** Google: discovery + token-proef. De redirect-URI kan Google pas bij een echte aanmelding toetsen; dat staat in de tekst. */
export async function controleerGoogle(client: { clientId: string; clientSecret: string; redirectUri: string }, grantSleutel: boolean): Promise<ControleUitkomst> {
  if (!client.clientId || !client.clientSecret) return { stand: 'let-op', code: 'CLIENT_ONTBREEKT', detail: 'Geen client id + secret (env noch kluis).' };
  let tokenEndpoint = '';
  try {
    const d = await get('https://accounts.google.com/.well-known/openid-configuration');
    tokenEndpoint = String(d.data?.token_endpoint || '');
    if (!/^https:\/\/oauth2\.googleapis\.com\//.test(tokenEndpoint)) return { stand: 'onbekend', code: 'ANTWOORD_ONDUIDELIJK', detail: `discovery ${d.status}` };
  } catch { return { stand: 'fout', code: 'ONBEREIKBAAR', detail: 'accounts.google.com' }; }
  let r: { status: number; data: Record<string, unknown> | null };
  try { r = await post(tokenEndpoint, { client_id: client.clientId, client_secret: client.clientSecret, grant_type: 'authorization_code', code: 'mijn-ruimte-controle', redirect_uri: client.redirectUri }); }
  catch { return { stand: 'fout', code: 'ONBEREIKBAAR', detail: 'oauth2.googleapis.com' }; }
  const fout = tekst(r.data?.error, 60);
  if (fout === 'invalid_grant') {
    if (!grantSleutel) return { stand: 'let-op', code: 'GOOGLE_GRANT_SLEUTEL_ONTBREEKT', detail: 'client ok; GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 ontbreekt' };
    return { stand: 'ok', code: 'GOOGLE_OK', detail: `token endpoint ${r.status} invalid_grant` };
  }
  if (fout === 'invalid_client' || fout === 'unauthorized_client') return { stand: 'fout', code: 'GOOGLE_CLIENT_ONGELDIG', detail: `token endpoint ${r.status} ${fout}` };
  if (fout === 'redirect_uri_mismatch') return { stand: 'fout', code: 'GOOGLE_REDIRECT_MISMATCH', detail: `token endpoint ${r.status}` };
  return { stand: 'onbekend', code: 'ANTWOORD_ONDUIDELIJK', detail: `token endpoint ${r.status} ${fout || '-'}` };
}

/** Microsoft: discovery van de tenant + token-proef; AADSTS-codes uit error_description. */
export async function controleerMicrosoft(client: { clientId: string; clientSecret: string; tenantId: string; redirectUri: string }): Promise<ControleUitkomst> {
  if (!client.clientId || !client.clientSecret || !client.tenantId) return { stand: 'let-op', code: 'CLIENT_ONTBREEKT', detail: 'MICROSOFT_GRAPH_CLIENT_ID/SECRET/TENANT_ID niet (alle drie) gezet.' };
  const tenant = encodeURIComponent(client.tenantId);
  let tokenEndpoint = '';
  try {
    const d = await get(`https://login.microsoftonline.com/${tenant}/v2.0/.well-known/openid-configuration`);
    if (d.status === 400 || /AADSTS90002/.test(tekst(d.data?.error_description, 400))) return { stand: 'fout', code: 'MS_TENANT_ONGELDIG', detail: `discovery ${d.status}` };
    tokenEndpoint = String(d.data?.token_endpoint || '');
    if (!/^https:\/\/login\.microsoftonline\.com\//.test(tokenEndpoint)) return { stand: 'onbekend', code: 'ANTWOORD_ONDUIDELIJK', detail: `discovery ${d.status}` };
  } catch { return { stand: 'fout', code: 'ONBEREIKBAAR', detail: 'login.microsoftonline.com' }; }
  let r: { status: number; data: Record<string, unknown> | null };
  try { r = await post(tokenEndpoint, { client_id: client.clientId, client_secret: client.clientSecret, grant_type: 'authorization_code', code: 'mijn-ruimte-controle', redirect_uri: client.redirectUri, scope: 'openid' }); }
  catch { return { stand: 'fout', code: 'ONBEREIKBAAR', detail: 'login.microsoftonline.com' }; }
  const fout = tekst(r.data?.error, 60);
  const aad = (/AADSTS\d+/.exec(tekst(r.data?.error_description, 400)) || [''])[0];
  if (fout === 'invalid_grant') return { stand: 'ok', code: 'MS_OK', detail: `token endpoint ${r.status} invalid_grant ${aad}`.trim() };
  if (aad === 'AADSTS7000215' || aad === 'AADSTS7000222') return { stand: 'fout', code: 'MS_SECRET_ONGELDIG', detail: aad };
  if (aad === 'AADSTS700016' || fout === 'unauthorized_client') return { stand: 'fout', code: 'MS_CLIENT_ONGELDIG', detail: aad || fout };
  if (aad === 'AADSTS50011') return { stand: 'fout', code: 'MS_REDIRECT_MISMATCH', detail: aad };
  if (aad || fout) return { stand: 'fout', code: 'MS_FOUT', detail: `${fout} ${aad}`.trim() };
  return { stand: 'onbekend', code: 'ANTWOORD_ONDUIDELIJK', detail: `token endpoint ${r.status}` };
}

/** GitHub OAuth-app: POST /applications/{client_id}/token («check a token») met een testtoken. 404 = gegevens geldig; 401 = niet. */
export async function controleerGithub(app: { clientId: string; clientSecret: string } | 'onleesbaar' | null): Promise<ControleUitkomst> {
  if (app === null) return { stand: 'let-op', code: 'CLIENT_ONTBREEKT', detail: `kluis: geen item met doel «${GITHUB_OAUTH_DOEL}»` };
  if (app === 'onleesbaar') return { stand: 'fout', code: 'CLIENT_ONLEESBAAR', detail: `kluis: doel «${GITHUB_OAUTH_DOEL}»` };
  let status = 0;
  try {
    const auth = Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64');
    const res = await netwerk(`https://api.github.com/applications/${encodeURIComponent(app.clientId)}/token`, {
      method: 'POST', headers: { Authorization: `Basic ${auth}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'mijn-ruimte', 'X-GitHub-Api-Version': '2022-11-28' },
      body: JSON.stringify({ access_token: 'gho_mijnruimtecontrole000000000000000000' }), signal: AbortSignal.timeout(TIJD), redirect: 'error',
    });
    status = res.status;
  } catch { return { stand: 'fout', code: 'ONBEREIKBAAR', detail: 'api.github.com' }; }
  if (status === 404 || status === 422) return { stand: 'ok', code: 'GH_OK', detail: `applications/{client_id}/token → ${status}` };
  if (status === 401) return { stand: 'fout', code: 'GH_CLIENT_ONGELDIG', detail: '401' };
  if (status === 403 || status === 429) return { stand: 'onbekend', code: 'GH_RATE', detail: String(status) };
  return { stand: 'onbekend', code: 'ANTWOORD_ONDUIDELIJK', detail: String(status) };
}

/** GitHub App: de bestaande echte weg (JWT + /app/installations). */
export async function controleerGithubApp(userId: string): Promise<ControleUitkomst> {
  if (!(await doelAanwezig(userId, GITHUB_APP_DOEL))) return { stand: 'let-op', code: 'CLIENT_ONTBREEKT', detail: `kluis: geen item met doel «${GITHUB_APP_DOEL}»` };
  const sleutel = await appSleutel(userId);
  if (sleutel === 'onleesbaar') return { stand: 'fout', code: 'CLIENT_ONLEESBAAR', detail: 'geen App ID + PEM' };
  const uit = await appInstallaties(userId);
  if (!uit.ok) {
    if (uit.fout === 'GITHUB_UNREACHABLE') return { stand: 'fout', code: 'ONBEREIKBAAR', detail: 'api.github.com' };
    if (uit.fout === 'GITHUB_APP_SLEUTEL_ONGELDIG') return { stand: 'fout', code: 'GH_APP_SLEUTEL_ONGELDIG', detail: '401' };
    if (uit.fout === 'GITHUB_APP_SLEUTEL_ONLEESBAAR') return { stand: 'fout', code: 'CLIENT_ONLEESBAAR', detail: uit.fout };
    return { stand: 'onbekend', code: 'ANTWOORD_ONDUIDELIJK', detail: uit.fout };
  }
  const n = uit.data.installaties.length;
  return n ? { stand: 'ok', code: 'GH_APP_OK', detail: `installaties: ${n}`, n } : { stand: 'let-op', code: 'GH_APP_GEEN_INSTALLATIES', detail: 'installaties: 0', n: 0 };
}

// ------------------------------------------------------------------------------------------------ stand

export type ProviderStand = {
  id: WizardProviderId;
  /** is er een client id + secret? */
  ingesteld: boolean;
  /** waar het vandaan komt */
  bron: 'env' | 'kluis' | 'onleesbaar' | '';
  /** publieke client id (geen geheim) — alleen om te tonen welke client actief is */
  clientId: string;
  /** env-namen → gezet? (alleen de naam) */
  env: Record<string, boolean>;
  /** klaar voor gebruik zonder herstart? */
  herstartNodig: boolean;
  /** laatste controle uit app.integratie_controles */
  controle: { stand: Stand; code: string; detail: string; op: number } | null;
};
export type WizardStand = {
  waarden: WizardWaarden;
  providers: Record<WizardProviderId, ProviderStand>;
  /** de aanroeper is de eigenaar (OWNER_EMAIL): alleen dan werkt de Google-terugval uit ZIJN kluis */
  isEigenaar: boolean;
  /** serversleutels die de koppelingen nodig hebben → gezet? (alleen de naam) */
  sleutels: Record<string, boolean>;
  serverOpdrachtGeheimen: string;
};

/** Serversleutels die het Майстер-scherm toont. De lijst hoort bij deploy/geheimen-aanmaken.sh (de test vergelijkt ze). */
export const WIZARD_SLEUTELS: readonly string[] = Object.freeze([
  'MAIL_APP_WACHTWOORD_SLEUTEL_V1', 'MAIL_TOKEN_ENCRYPTION_KEY_V1', 'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1', 'OWNER_VAULT_ENCRYPTION_KEY_V1',
  'TOTP_ENCRYPTION_KEY_V1', 'AGENDA_ABONNEMENT_SLEUTEL_V1', 'GITHUB_KOPPELING_SLEUTEL_V1',
]);
const gezet = (naam: string) => String(process.env[naam] ?? '').trim() !== '';
const sleutelOk = (naam: string) => Boolean(envKey32(naam));

async function laatsteControle(id: WizardProviderId) {
  const { rows } = await sys().query('SELECT stand, code, detail, op FROM app.integratie_controles WHERE integratie = $1 ORDER BY op DESC LIMIT 1', [`wizard-${id}`]);
  const r = rows[0];
  return r ? { stand: r.stand as Stand, code: String(r.code), detail: String(r.detail), op: new Date(r.op).getTime() } : null;
}

export async function wizardStand(userId: string): Promise<WizardStand> {
  kluisCacheWissen();
  const [eigenaar, contour, kluisGoogle] = await Promise.all([eigenaarUserId(), resolveGoogleContour(), googleClientUitKluis()]);
  const namen = new Set(await secrets.listSecretNames().catch(() => [] as string[]));
  const envVan = (lijst: readonly string[]) => Object.fromEntries(lijst.map((n) => [n, namen.has(n) || gezet(n)]));
  const p = (id: WizardProviderId) => WIZARD_PROVIDERS.find((x) => x.id === id)!;
  const [ghOauth, ghApp, stripeAanwezig] = await Promise.all([oauthApp(userId), appSleutel(userId), doelAanwezig(userId, STRIPE_DOEL)]);
  const controles = Object.fromEntries(await Promise.all(WIZARD_PROVIDERS.map(async (x) => [x.id, await laatsteControle(x.id).catch(() => null)]))) as Record<WizardProviderId, ProviderStand['controle']>;
  const msId = namen.has('MICROSOFT_GRAPH_CLIENT_ID') ? await secrets.readSecret('MICROSOFT_GRAPH_CLIENT_ID').catch(() => '') : '';
  const msOk = namen.has('MICROSOFT_GRAPH_CLIENT_ID') && namen.has('MICROSOFT_GRAPH_CLIENT_SECRET') && namen.has('MICROSOFT_GRAPH_TENANT_ID');
  const providers: Record<WizardProviderId, ProviderStand> = {
    google: {
      id: 'google', ingesteld: contour.credentialsConfigured, bron: contour.credentialsConfigured ? (contour.source === 'vault' ? 'kluis' : 'env') : kluisGoogle === 'onleesbaar' ? 'onleesbaar' : '',
      clientId: contour.publicClientId, env: envVan(p('google').envNamen), herstartNodig: false, controle: controles.google,
    },
    microsoft: { id: 'microsoft', ingesteld: msOk, bron: msOk ? 'env' : '', clientId: msOk ? msId : '', env: envVan(p('microsoft').envNamen), herstartNodig: true, controle: controles.microsoft },
    github: { id: 'github', ingesteld: Boolean(ghOauth && ghOauth !== 'onleesbaar'), bron: ghOauth === 'onleesbaar' ? 'onleesbaar' : ghOauth ? 'kluis' : '', clientId: ghOauth && ghOauth !== 'onleesbaar' ? ghOauth.clientId : '', env: envVan(p('github').envNamen), herstartNodig: false, controle: controles.github },
    'github-app': { id: 'github-app', ingesteld: Boolean(ghApp && ghApp !== 'onleesbaar'), bron: ghApp === 'onleesbaar' ? 'onleesbaar' : ghApp ? 'kluis' : '', clientId: ghApp && ghApp !== 'onleesbaar' ? (ghApp.appId || ghApp.clientId) : '', env: envVan(p('github-app').envNamen), herstartNodig: false, controle: controles['github-app'] },
    // Stripe: alleen «staat er een sleutel met doel stripe» — nooit de sleutel, ook geen voorvoegsel ervan.
    stripe: { id: 'stripe', ingesteld: stripeAanwezig, bron: stripeAanwezig ? 'kluis' : '', clientId: '', env: {}, herstartNodig: false, controle: controles.stripe },
  };
  return {
    waarden: wizardWaarden(SERVICE_HOSTS), providers, isEigenaar: Boolean(eigenaar) && eigenaar === userId,
    sleutels: Object.fromEntries(WIZARD_SLEUTELS.map((n) => [n, sleutelOk(n)])), serverOpdrachtGeheimen: 'sudo /usr/local/sbin/mijn-ruimte-installeer geheimen',
  };
}

export async function wizardControleer(id: WizardProviderId, userId: string): Promise<ControleUitkomst> {
  kluisCacheWissen();
  const redirect = `https://${SERVICE_HOSTS.identity}/`;
  if (id === 'google') {
    const c = await resolveGoogleContour();
    return controleerGoogle({ clientId: c.clientId, clientSecret: c.clientSecret, redirectUri: redirect }, c.encryptionConfigured);
  }
  if (id === 'microsoft') {
    const lees = (n: string) => secrets.readSecret(n).catch(() => '');
    const [clientId, clientSecret, tenantId] = await Promise.all([lees('MICROSOFT_GRAPH_CLIENT_ID'), lees('MICROSOFT_GRAPH_CLIENT_SECRET'), lees('MICROSOFT_GRAPH_TENANT_ID')]);
    return controleerMicrosoft({ clientId, clientSecret, tenantId, redirectUri: redirect });
  }
  if (id === 'github') return controleerGithub(await oauthApp(userId));
  // Stripe: een ECHT verzoek met de beperkte sleutel uit de kluis van deze beheerder (charges/invoices/payouts, limit 1).
  if (id === 'stripe') return controleerStripe(await stripeSleutelVan(userId));
  return controleerGithubApp(userId);
}

// ------------------------------------------------------------------------------------------------ routes

type Ctx = { event: Record<string, unknown>; body: unknown };
export function integratiesWizardRoutes(gate: AdminGate): Record<string, RouterMiddleware[]> {
  const route = (capability: string, run: (b: Record<string, unknown>, auth: { user: { id: string; email?: string } }) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await gate(ctx, capability);
    if ('errorCode' in auth) return error(auth.errorCode, 403);
    const b = ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {};
    try { return json(await run(b, auth)); } catch (e) {
      const code = (e as { code?: string }).code;
      if (typeof code === 'string' && /^[A-Z_]{3,40}$/.test(code)) return error(code, 400);
      console.error('[integraties-wizard]', (e as Error).message);
      return error('INTEGRATIES_FOUT', 500);
    }
  }) as RouterMiddleware;
  const providerUit = (b: Record<string, unknown>): WizardProviderId => { const id = b.provider; if (!isWizardProvider(id)) throw Object.assign(new Error('PROVIDER_ONBEKEND'), { code: 'PROVIDER_ONBEKEND' }); return id; };

  return {
    // Alles wat het scherm toont, in één antwoord. Geen waarde van een geheim: alleen client id's (publiek) en ja/nee per naam.
    'POST /api/owner/admin/integraties/wizard/stand': [route('admin.read', async (_b, a) => ({ ...(await wizardStand(a.user.id)), plaintextReturned: false }))],

    // «Перевірити»: echte controle bij de dienst; uitkomst bewaard en gelogd (alleen de code).
    'POST /api/owner/admin/integraties/wizard/controleer': [route('apps.manage', async (b, a) => {
      const id = providerUit(b);
      const u = await wizardControleer(id, a.user.id);
      await sys().query('INSERT INTO app.integratie_controles (integratie, stand, code, detail, door) VALUES ($1, $2, $3, $4, $5)', [`wizard-${id}`, u.stand, u.code, u.detail.slice(0, 300), a.user.id]).catch(() => undefined);
      await schrijfBeheerAudit({
        actor: { id: a.user.id, email: a.user.email }, doel: { soort: 'integratie', id: `wizard-${id}`, naam: WIZARD_PROVIDERS.find((p) => p.id === id)?.naam || id },
        actie: 'integration.wizard.test', na: u.stand, resultaat: u.stand === 'fout' ? 'failure' : 'success', details: { code: u.code },
      }).catch(() => undefined);
      return { id, ...u, op: Date.now(), plaintextReturned: false };
    })],

    // Na een wijziging in de kluis: de cache van de Google-terugval wissen, zodat de nieuwe client meteen telt.
    'POST /api/owner/admin/integraties/wizard/vernieuwen': [route('admin.read', async () => { kluisCacheWissen(); return { ok: true }; })],
  };
}
