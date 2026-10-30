// «Майстер підключень» (20.10.2026): admin → Інтеграції → Майстер.
//
// Wat deze test vastzet:
//  1. de redirect-URI's en scopes die de wizard toont zijn PRECIES wat de callback-routes en flows van de server gebruiken
//     (Google/Microsoft → https://<identity>/; GitHub → /api/owner/github/oauth/callback), gerekend uit SERVICE_HOSTS (BYOS);
//  2. het secret komt nergens terug: niet in «stand», niet in een controle-uitkomst, niet in een URL, niet in een logregel;
//     de wizardroutes zijn POST-only; het invoerveld is type=password zonder autocomplete;
//  3. «Перевірити» is echt: Google en Microsoft via het token endpoint (invalid_grant = geldig, invalid_client = niet),
//     GitHub via /applications/{client_id}/token met Basic-auth (404 = geldig, 401 = niet); onbereikbaar = eerlijk «fout»;
//  4. de Google-terugval uit de kluis: env wint, kluis telt alleen als env leeg is, nooit half;
//  5. deploy/geheimen-aanmaken.sh is idempotent op een tijdelijk env-bestand, maakt MAIL_APP_WACHTWOORD_SLEUTEL_V1 aan en
//     drukt geen enkele waarde af; oauth-client-zetten.sh schrijft via stdin zonder een waarde te tonen; `bash -n` is schoon;
//     de installer roept de geheimenstap aan vóór het migreren;
//  6. de teksten noemen geen oude paden (/mcp, /ai/) en geen vast domein.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { SERVICE_HOSTS } from '../../backend/deployment-identity';
import {
  GITHUB_OAUTH_SCOPES, GOOGLE_LOGIN_SCOPES, GOOGLE_SUITE_SCOPES, MICROSOFT_GRAPH_SCOPES, WIZARD_CODES, WIZARD_PROVIDERS, WIZARD_STAPPEN,
  geldigSecret, geldigeClientId, googleKluisTekst, leesGoogleKluis, wizardCodeTekst, wizardWaarden,
} from '../../shared/integraties-wizard';
import { GITHUB_OAUTH_CALLBACK_PAD, githubInstelWaarden, githubOauthScopes } from '../../shared/github-koppeling';
import { controleerGithub, controleerGoogle, controleerMicrosoft, integratiesWizardRoutes, wizardStand, WIZARD_SLEUTELS } from '../../backend/integraties-wizard';
import { setIntegratiesKluis } from '../../backend/integraties-kluis';
import { setKoppelingKluis } from '../../backend/github-koppeling-opslag';
import { resolveGoogleContour } from '../../backend/google-contour';
import type { AdminGate } from '../../backend/beheer-integraties';
import { closePool, getPool } from '../../server/platform/pg';

const bron = (pad: string) => readFileSync(pad, 'utf8');
type Res = { statusCode: number; body: string };
const lees = (r: unknown) => { const x = r as Res; let b: Record<string, unknown> = {}; try { b = JSON.parse(x.body); } catch { /* geen json */ } return { status: x.statusCode, b, raw: x.body }; };

const GOOGLE_ID = '123456789012-abcdefghijklmnopqrstuvwxyz0123.apps.googleusercontent.com';
const GOOGLE_SECRET = `GOCSPX-${randomBytes(18).toString('base64url')}`;
const MS_ID = '11111111-2222-3333-4444-555555555555';
const MS_SECRET = `ms~${randomBytes(20).toString('base64url')}`;
const GH_ID = 'Iv1.abcdef0123456789';
const GH_SECRET = randomBytes(20).toString('hex');

export async function main(): Promise<number> {
  const { check, einde } = checker('integraties-wizard-20261020');
  const envOud = { ...process.env };
  const fetchOud = globalThis.fetch;
  const sys = getPool('systeem');
  const ADMIN = `wiz-${randomBytes(6).toString('hex')}`;
  try {
    // =============================================================== 1. redirect-URI's en scopes = wat de server gebruikt
    const w = wizardWaarden(SERVICE_HOSTS);
    const idRedirect = `https://${SERVICE_HOSTS.identity}/`;
    const googleRedirect = w.google.find((x) => /redirect URI/i.test(x.label[0]))!.waarde;
    const msRedirect = w.microsoft.find((x) => /Redirect URI/i.test(x.label[0]))!.waarde;
    const ghCallback = w.github.find((x) => /callback URL/i.test(x.label[0]))!.waarde;
    const index = bron('backend/index.ts'), suite = bron('backend/google-suite-inrichting.ts'), msBron = bron('backend/mail-microsoft.ts'), ghPlatform = bron('backend/github-platform.ts');
    check('Google/Microsoft redirect-URI = https://<identity-host>/ — precies wat de server als callback aanneemt',
      googleRedirect === idRedirect && msRedirect === idRedirect
      && index.includes(`OWNER_IDENTITY_ORIGIN='https://${SERVICE_HOSTS.identity}'`) && /ownerGoogleCallbackFor=\(sourceOrigin\?:string\)=>`\$\{ownerAuthCallbackOrigin\(sourceOrigin\)\}\/`/.test(index)
      && suite.includes(`const CALLBACK = '${idRedirect}'`) && msBron.includes(`redirectUri:'${idRedirect}'`), `${googleRedirect} ${msRedirect}`);
    check('GitHub callback = https://<github-host>/api/owner/github/oauth/callback — zelfde als de koppelkaart én de route',
      ghCallback === githubInstelWaarden(SERVICE_HOSTS.github).callbackUrl && ghCallback.endsWith(GITHUB_OAUTH_CALLBACK_PAD) && ghPlatform.includes(`'GET ${GITHUB_OAUTH_CALLBACK_PAD}'`) && ghPlatform.includes('githubInstelWaarden(SERVICE_HOSTS.github)'), ghCallback);
    const suiteScopes = (d: string) => (new RegExp(`${d}: \\{[^}]*scopes: \\[([^\\]]*)\\]`).exec(suite)?.[1] || '').match(/'[^']+'/g)?.map((x) => x.slice(1, -1)) || [];
    check('Google Suite-scopes in de wizard = CONFIG in backend/google-suite-inrichting.ts (mail, drive, calendar, photos)',
      (['mail', 'drive', 'calendar', 'photos'] as const).every((d) => JSON.stringify(suiteScopes(d)) === JSON.stringify(GOOGLE_SUITE_SCOPES[d])));
    check('Google login-scopes = backend/index.ts; Microsoft-scopes = MICROSOFT_GRAPH_SCOPES; GitHub-scopes = GITHUB_RECHTEN',
      index.includes(`scope:'${GOOGLE_LOGIN_SCOPES.join(' ')}'`) && msBron.includes(`MICROSOFT_GRAPH_SCOPES=[${MICROSOFT_GRAPH_SCOPES.map((s) => `'${s}'`).join(',')}]`) && JSON.stringify(GITHUB_OAUTH_SCOPES) === JSON.stringify(githubOauthScopes()));
    check('BYOS: ander domein → andere adressen; geen vast domein in wizard-bronnen',
      wizardWaarden({ identity: 'id.voorbeeld.nl', hub: 'hub.voorbeeld.nl', mail: 'mail.voorbeeld.nl', cloud: 'cloud.voorbeeld.nl', github: 'git.voorbeeld.nl' }).google.find((x) => /redirect URI/i.test(x.label[0]))!.waarde === 'https://id.voorbeeld.nl/'
      && wizardWaarden({}).github.find((x) => /callback/i.test(x.label[0]))!.waarde === ''
      && !/tarasevych/.test(bron('shared/integraties-wizard.ts')) && !/tarasevych/.test(bron('src/integraties/Wizard.tsx')) && !/tarasevych/.test(bron('backend/integraties-wizard.ts')));
    check('elke provider heeft stappen, een console-adres (https) en documentatie; uk ≠ nl', WIZARD_PROVIDERS.every((p) => WIZARD_STAPPEN[p.id].length >= 3 && /^https:\/\//.test(p.console.url) && /^https:\/\//.test(p.docs) && WIZARD_STAPPEN[p.id].every((s) => s.tekst[0] !== s.tekst[1] && s.tekst[0].length > 30)));
    check('elke servercode heeft uk- en nl-tekst; {n} wordt ingevuld', Object.values(WIZARD_CODES).every((t) => t[0].length > 8 && t[1].length > 8 && t[0] !== t[1]) && wizardCodeTekst('GH_APP_OK', 'uk', 3).includes('3') && wizardCodeTekst('BESTAAT_NIET', 'nl', 0, 'terug') === 'terug');
    check('invoercontrole: Google-id, GUID, GitHub-id; secret 16–200; kluistekst wordt terug gelezen',
      geldigeClientId('google', GOOGLE_ID) && !geldigeClientId('google', 'x') && geldigeClientId('microsoft', MS_ID) && !geldigeClientId('microsoft', GOOGLE_ID) && geldigeClientId('github', GH_ID)
      && geldigSecret(GOOGLE_SECRET) && !geldigSecret('kort') && leesGoogleKluis(googleKluisTekst(GOOGLE_ID, GOOGLE_SECRET))?.clientSecret === GOOGLE_SECRET && leesGoogleKluis('onzin') === null && leesGoogleKluis(`client_secret: ${GOOGLE_SECRET}`) === null);

    // =============================================================== 3. echte controles tegen een nagebootste dienst
    const verzoeken: Array<{ url: string; init: RequestInit }> = [];
    let modus: 'ok' | 'invalid_client' | 'ms_secret' | 'ms_tenant' | 'gh401' | 'weg' = 'ok';
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      const url = String(input); verzoeken.push({ url, init: init || {} });
      if (modus === 'weg') throw new Error('ECONNREFUSED');
      const j = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (url === 'https://accounts.google.com/.well-known/openid-configuration') return j(200, { token_endpoint: 'https://oauth2.googleapis.com/token' });
      if (url === 'https://oauth2.googleapis.com/token') return j(modus === 'invalid_client' ? 401 : 400, { error: modus === 'invalid_client' ? 'invalid_client' : 'invalid_grant', error_description: 'Malformed auth code.' });
      if (/login\.microsoftonline\.com\/[^/]+\/v2\.0\/\.well-known\/openid-configuration$/.test(url)) return modus === 'ms_tenant' ? j(400, { error: 'invalid_tenant', error_description: 'AADSTS90002: Tenant not found.' }) : j(200, { token_endpoint: `https://login.microsoftonline.com/${MS_ID}/oauth2/v2.0/token` });
      if (/login\.microsoftonline\.com\/.+\/oauth2\/v2\.0\/token$/.test(url)) return j(modus === 'ms_secret' ? 401 : 400, modus === 'ms_secret' ? { error: 'invalid_client', error_description: 'AADSTS7000215: Invalid client secret provided.' } : { error: 'invalid_grant', error_description: 'AADSTS70000: The provided value for the input parameter code is not valid.' });
      if (/api\.github\.com\/applications\/[^/]+\/token$/.test(url)) { const a = String((init?.headers as Record<string, string>)?.Authorization || ''); return new Response('{}', { status: modus === 'gh401' || a !== `Basic ${Buffer.from(`${GH_ID}:${GH_SECRET}`).toString('base64')}` ? 401 : 404 }); }
      return j(500, {});
    }) as typeof fetch;

    const g = await controleerGoogle({ clientId: GOOGLE_ID, clientSecret: GOOGLE_SECRET, redirectUri: idRedirect }, true);
    const gVerzoek = verzoeken.find((v) => v.url === 'https://oauth2.googleapis.com/token')!;
    check('Google: invalid_grant op een testcode = client id + secret geldig → ok/GOOGLE_OK', g.stand === 'ok' && g.code === 'GOOGLE_OK', JSON.stringify(g));
    check('Google: het secret gaat als POST-veld (nooit in de URL) en de redirect_uri is die van de server', String(gVerzoek.init.body).includes(`client_secret=${encodeURIComponent(GOOGLE_SECRET)}`) && !gVerzoek.url.includes(GOOGLE_SECRET) && String(gVerzoek.init.body).includes(`redirect_uri=${encodeURIComponent(idRedirect)}`));
    modus = 'invalid_client';
    const g2 = await controleerGoogle({ clientId: GOOGLE_ID, clientSecret: 'x'.repeat(24), redirectUri: idRedirect }, true);
    modus = 'ok';
    const g3 = await controleerGoogle({ clientId: GOOGLE_ID, clientSecret: GOOGLE_SECRET, redirectUri: idRedirect }, false);
    const g4 = await controleerGoogle({ clientId: '', clientSecret: '', redirectUri: idRedirect }, true);
    modus = 'weg';
    const g5 = await controleerGoogle({ clientId: GOOGLE_ID, clientSecret: GOOGLE_SECRET, redirectUri: idRedirect }, true);
    modus = 'ok';
    check('Google: invalid_client → fout; zonder grant-sleutel → let-op; zonder client → let-op; onbereikbaar → fout (nooit verzonnen «ok»)',
      g2.stand === 'fout' && g2.code === 'GOOGLE_CLIENT_ONGELDIG' && g3.stand === 'let-op' && g3.code === 'GOOGLE_GRANT_SLEUTEL_ONTBREEKT' && g4.code === 'CLIENT_ONTBREEKT' && g5.stand === 'fout' && g5.code === 'ONBEREIKBAAR');
    check('Google: geen uitkomst bevat het secret', [g, g2, g3, g4, g5].every((x) => !JSON.stringify(x).includes(GOOGLE_SECRET)));

    const m = await controleerMicrosoft({ clientId: MS_ID, clientSecret: MS_SECRET, tenantId: 'common', redirectUri: idRedirect });
    modus = 'ms_secret'; const m2 = await controleerMicrosoft({ clientId: MS_ID, clientSecret: MS_SECRET, tenantId: 'common', redirectUri: idRedirect });
    modus = 'ms_tenant'; const m3 = await controleerMicrosoft({ clientId: MS_ID, clientSecret: MS_SECRET, tenantId: 'bestaat-niet.onmicrosoft.com', redirectUri: idRedirect });
    modus = 'ok'; const m4 = await controleerMicrosoft({ clientId: '', clientSecret: '', tenantId: '', redirectUri: idRedirect });
    check('Microsoft: invalid_grant → ok; AADSTS7000215 → secret ongeldig; AADSTS90002 → tenant ongeldig; leeg → let-op',
      m.stand === 'ok' && m.code === 'MS_OK' && m2.code === 'MS_SECRET_ONGELDIG' && m2.stand === 'fout' && m3.code === 'MS_TENANT_ONGELDIG' && m4.code === 'CLIENT_ONTBREEKT', JSON.stringify([m, m2, m3, m4]));
    check('Microsoft: discovery per tenant, secret alleen in de POST-body', verzoeken.some((v) => v.url === 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration') && verzoeken.filter((v) => v.url.includes('microsoftonline')).every((v) => !v.url.includes(MS_SECRET)) && [m, m2, m3, m4].every((x) => !JSON.stringify(x).includes(MS_SECRET)));

    const h = await controleerGithub({ clientId: GH_ID, clientSecret: GH_SECRET });
    modus = 'gh401'; const h2 = await controleerGithub({ clientId: GH_ID, clientSecret: GH_SECRET }); modus = 'ok';
    const h3 = await controleerGithub(null), h4 = await controleerGithub('onleesbaar');
    const ghVerzoek = verzoeken.filter((v) => v.url.includes('api.github.com')).pop()!;
    check('GitHub: 404 op een testtoken = client id + secret geldig → ok; 401 → fout; geen item → let-op; onleesbaar → fout',
      h.stand === 'ok' && h.code === 'GH_OK' && h2.code === 'GH_CLIENT_ONGELDIG' && h2.stand === 'fout' && h3.code === 'CLIENT_ONTBREEKT' && h3.stand === 'let-op' && h4.code === 'CLIENT_ONLEESBAAR', JSON.stringify([h, h2, h3, h4]));
    check('GitHub: Basic-auth met client id:secret in de header, nooit in de URL; het antwoord bevat het secret niet', String((ghVerzoek.init.headers as Record<string, string>).Authorization).startsWith('Basic ') && !ghVerzoek.url.includes(GH_SECRET) && ghVerzoek.url.includes(encodeURIComponent(GH_ID)) && ![h, h2, h3, h4].some((x) => JSON.stringify(x).includes(GH_SECRET)));

    // =============================================================== 4. Google-terugval uit de kluis (env wint, nooit half)
    for (const n of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_SUITE_CLIENT_ID', 'GOOGLE_SUITE_CLIENT_SECRET']) delete process.env[n];
    process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 = randomBytes(32).toString('base64');
    const EIGENAAR = `eig-${randomBytes(6).toString('hex')}`;
    const KLUIS_ID = '999999999999-kluiskluiskluiskluiskluis0000.apps.googleusercontent.com';
    const KLUIS_SECRET = `GOCSPX-${randomBytes(18).toString('base64url')}`;
    const kluisRijen = [{ keyName: 'google-oauth-client', purpose: 'google' }, { keyName: 'github-oauth-app', purpose: 'github-oauth' }];
    setIntegratiesKluis({ eigenaarId: async () => EIGENAAR, kluisRijen: async () => kluisRijen, kluisWaarde: async (_u, k) => (k === 'google-oauth-client' ? googleKluisTekst(KLUIS_ID, KLUIS_SECRET) : '') });
    const c1 = await resolveGoogleContour();
    check('kluis: geen env → client id + secret uit de kluis van de eigenaar (bron «vault»), koppelen aan', c1.clientId === KLUIS_ID && c1.clientSecret === KLUIS_SECRET && c1.source === 'vault' && c1.credentialsConfigured && c1.connectEnabled, JSON.stringify({ id: c1.clientId, bron: c1.source, aan: c1.connectEnabled }));
    process.env.GOOGLE_OAUTH_CLIENT_ID = GOOGLE_ID; process.env.GOOGLE_OAUTH_CLIENT_SECRET = GOOGLE_SECRET;
    setIntegratiesKluis({ eigenaarId: async () => EIGENAAR, kluisRijen: async () => kluisRijen, kluisWaarde: async () => googleKluisTekst(KLUIS_ID, KLUIS_SECRET) });
    const c2 = await resolveGoogleContour();
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    setIntegratiesKluis({ eigenaarId: async () => EIGENAAR, kluisRijen: async () => kluisRijen, kluisWaarde: async () => googleKluisTekst(KLUIS_ID, KLUIS_SECRET) });
    const c3 = await resolveGoogleContour();
    check('kluis: env wint (bron «platform»); een HALVE env-client (alleen id) wordt NIET uit de kluis aangevuld', c2.clientId === GOOGLE_ID && c2.clientSecret === GOOGLE_SECRET && c2.source === 'platform' && c3.clientId === GOOGLE_ID && c3.clientSecret === '' && !c3.credentialsConfigured);
    check('google-contour: de vroegere «env-only» save-weigering blijft (GOOGLE_CONTOUR_ENV_ONLY) — de kluis is de enige UI-weg', /GOOGLE_CONTOUR_ENV_ONLY/.test(bron('backend/google-contour.ts')) && /googleClientUitKluis/.test(bron('backend/google-contour.ts')));
    check('index.ts: aanmelding leest het secret via het contour (env → kluis), niet meer rechtstreeks uit env', (index.match(/googleClientSecret\(\)/g) || []).length >= 5 && !index.includes("secrets.readSecret('GOOGLE_OAUTH_CLIENT_SECRET')"));

    // =============================================================== 2. stand en routes: POST-only, geen secret, geen GET
    process.env.GOOGLE_OAUTH_CLIENT_ID = GOOGLE_ID; process.env.GOOGLE_OAUTH_CLIENT_SECRET = GOOGLE_SECRET;
    process.env.MICROSOFT_GRAPH_CLIENT_ID = MS_ID; process.env.MICROSOFT_GRAPH_CLIENT_SECRET = MS_SECRET; process.env.MICROSOFT_GRAPH_TENANT_ID = 'common';
    process.env.MAIL_APP_WACHTWOORD_SLEUTEL_V1 = randomBytes(32).toString('base64');
    setIntegratiesKluis({ eigenaarId: async () => ADMIN, kluisRijen: async () => kluisRijen, kluisWaarde: async () => googleKluisTekst(KLUIS_ID, KLUIS_SECRET) });
    setKoppelingKluis({ rijen: async () => kluisRijen, waarde: async (_u, k) => (k === 'github-oauth-app' ? `client_id: ${GH_ID}\nclient_secret: ${GH_SECRET}` : '') });
    const stand = await wizardStand(ADMIN);
    const standJson = JSON.stringify(stand);
    check('stand: google env (client id zichtbaar, geen secret), microsoft env + herstart nodig, github uit de kluis, github-app leeg',
      stand.providers.google.ingesteld && stand.providers.google.bron === 'env' && stand.providers.google.clientId === GOOGLE_ID && !stand.providers.google.herstartNodig
      && stand.providers.microsoft.ingesteld && stand.providers.microsoft.herstartNodig && stand.providers.github.ingesteld && stand.providers.github.bron === 'kluis' && stand.providers.github.clientId === GH_ID
      && !stand.providers['github-app'].ingesteld && stand.isEigenaar, standJson.slice(0, 300));
    check('stand: GEEN secret, geen sleutelwaarde; MAIL_APP_WACHTWOORD_SLEUTEL_V1 staat als «gezet» in de sleutellijst (alleen naam → ja/nee)',
      ![GOOGLE_SECRET, MS_SECRET, GH_SECRET, KLUIS_SECRET, process.env.MAIL_APP_WACHTWOORD_SLEUTEL_V1!, process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1!].some((s) => standJson.includes(s)) && !/clientSecret/.test(standJson) && stand.sleutels.MAIL_APP_WACHTWOORD_SLEUTEL_V1 === true && Object.keys(stand.sleutels).length === WIZARD_SLEUTELS.length);
    delete process.env.MAIL_APP_WACHTWOORD_SLEUTEL_V1;
    check('stand: ontbrekende MAIL_APP_WACHTWOORD_SLEUTEL_V1 wordt hardop gemeld (false), met de serveropdracht erbij', (await wizardStand(ADMIN)).sleutels.MAIL_APP_WACHTWOORD_SLEUTEL_V1 === false && /mijn-ruimte-installeer geheimen$/.test(stand.serverOpdrachtGeheimen));

    let rol: 'admin' | 'lezer' | 'geen' = 'admin';
    const gate: AdminGate = async (_c, cap) => {
      if (rol === 'geen') return { errorCode: 'OWNER_ADMIN_REQUIRED' };
      if (rol === 'lezer' && cap !== 'admin.read') return { errorCode: 'OWNER_ADMIN_REQUIRED' };
      return { user: { id: ADMIN, email: `${ADMIN}@example.test` }, capabilities: [cap] };
    };
    const R = integratiesWizardRoutes(gate);
    const roep = (pad: string, body: Record<string, unknown>) => (R[pad][0] as (c: unknown) => Promise<unknown>)({ event: { headers: {} }, body, params: {}, query: {} });
    check('routes: alleen POST (geen GET geeft ooit een stand of een secret terug)', Object.keys(R).length === 3 && Object.keys(R).every((k) => k.startsWith('POST /api/owner/admin/integraties/wizard/')));
    const s1 = lees(await roep('POST /api/owner/admin/integraties/wizard/stand', {}));
    check('route stand: 200, plaintextReturned=false, geen secret in het antwoord', s1.status === 200 && s1.b.plaintextReturned === false && ![GOOGLE_SECRET, MS_SECRET, GH_SECRET].some((s) => s1.raw.includes(s)));
    const t1 = lees(await roep('POST /api/owner/admin/integraties/wizard/controleer', { provider: 'github' }));
    check('route controleer (github): echte uitkomst ok/GH_OK, bewaard in app.integratie_controles als «wizard-github», zonder secret',
      t1.status === 200 && t1.b.code === 'GH_OK' && t1.b.stand === 'ok' && !t1.raw.includes(GH_SECRET)
      && Number((await sys.query("SELECT count(*)::int AS n FROM app.integratie_controles WHERE integratie = 'wizard-github' AND door = $1 AND code = 'GH_OK'", [ADMIN])).rows[0].n) === 1, t1.raw);
    const t2 = lees(await roep('POST /api/owner/admin/integraties/wizard/controleer', { provider: 'google' }));
    const t3 = lees(await roep('POST /api/owner/admin/integraties/wizard/controleer', { provider: 'microsoft' }));
    check('route controleer (google uit env, microsoft uit env): ok, en de kluis-client wordt NIET gebruikt zolang env er is', t2.b.code === 'GOOGLE_OK' && t3.b.code === 'MS_OK' && verzoeken.filter((v) => v.url === 'https://oauth2.googleapis.com/token').pop()!.init.body!.toString().includes(encodeURIComponent(GOOGLE_ID)));
    check('route controleer: onbekende provider → 400 PROVIDER_ONBEKEND', lees(await roep('POST /api/owner/admin/integraties/wizard/controleer', { provider: 'slack' })).status === 400);
    rol = 'lezer';
    check('route controleer vereist apps.manage; stand volstaat met admin.read', lees(await roep('POST /api/owner/admin/integraties/wizard/controleer', { provider: 'github' })).status === 403 && lees(await roep('POST /api/owner/admin/integraties/wizard/stand', {})).status === 200);
    rol = 'geen';
    check('zonder beheerrecht: 403 op alles', lees(await roep('POST /api/owner/admin/integraties/wizard/stand', {})).status === 403);
    rol = 'admin';
    const journaal = (await sys.query("SELECT details FROM app.audit WHERE action = 'integration.wizard.test' AND actor_id = $1", [ADMIN]).catch(() => ({ rows: [] as Array<{ details: unknown }> }))).rows;
    check('logboek: integration.wizard.test zonder secret (alleen de code)', journaal.length >= 1 && journaal.every((r) => !JSON.stringify(r.details).includes(GH_SECRET) && !JSON.stringify(r.details).includes(GOOGLE_SECRET)), String(journaal.length));

    // =============================================================== 2b. het invoerveld in de browser
    const ui = bron('src/integraties/Wizard.tsx');
    check('Wizard.tsx: secret-veld via GeheimInvoer (type=password у спільному полі), autoComplete=new-password, geen console.log, geen localStorage, opslaan via de bestaande kluisroute (passkey)',
      ui.includes('GeheimInvoer') && ui.includes("autoComplete='new-password'") && bron('src/geheim/GeheimInvoer.tsx').includes("type='password'") && !/console\.(log|info|debug)/.test(ui) && !/localStorage\.|sessionStorage\./.test(ui) && ui.includes("'/api/owner/api-platform/vault/save'") && ui.includes("purpose: p.kluisDoel") && ui.includes("'/api/owner/admin/integraties/wizard/vernieuwen'"));
    check('Wizard.tsx: eerlijke teksten — Microsoft alleen via serveropdracht (herstart), Google 5 minuten voor de aanmelding, geen root in de browser', /sudo \/usr\/local\/sbin\/mijn-ruimte-installeer oauth-client microsoft/.test(bron('shared/integraties-wizard.ts')) && /5 хвилин/.test(ui) && /не має root/.test(ui) && /heeft bewust geen root/.test(ui));
    check('Integraties.tsx: tabblad «Майстер підключень» bestaat en rendert Wizard', /id: 'wizard', uk: 'Майстер підключень', nl: 'Koppelwizard'/.test(bron('src/integraties/Integraties.tsx')) && /<Wizard lang=\{lang\} context=\{context\}/.test(bron('src/integraties/Integraties.tsx')));

    // =============================================================== 6. geen oude paden, geen vast domein in de teksten
    const teksten = [bron('shared/integraties-wizard.ts'), ui, bron('deploy/GEHEIMEN-REGISTER.md'), (() => { try { return bron('ENV-VARS.md'); } catch { return ''; } })()].join('\n');
    check('teksten noemen geen oude paden (/mcp als pad, /ai/)', !/['"\s(]\/mcp(\/|['"\s)]|$)/.test(teksten) && !/\/ai\//.test(teksten));
    check('wizard-teksten zijn tweetalig zonder Nederlands in de Oekraïense helft', WIZARD_PROVIDERS.every((p) => WIZARD_STAPPEN[p.id].every((s) => !/\b(de|het|een|van|met)\b/.test(s.tekst[0].replace(/«[^»]*»/g, '')))));

    // =============================================================== 5. scripts: idempotent, geen waarden, bash -n, installer-stap
    for (const f of ['deploy/geheimen-aanmaken.sh', 'deploy/geheimen-register.sh', 'deploy/oauth-client-zetten.sh', 'deploy/geheimen-aanvullen.sh', 'deploy/google-login-zetten.sh', 'deploy/installeer-app.sh']) {
      const r = spawnSync('bash', ['-n', f], { encoding: 'utf8' });
      check(`bash -n ${f}`, r.status === 0, r.stderr);
    }
    const map = mkdtempSync(join(tmpdir(), 'mr-geheimen-'));
    try {
      const env = join(map, 'geheimen.env');
      writeFileSync(env, 'OWNER_EMAIL=eigenaar@voorbeeld.nl\nTOTP_ENCRYPTION_KEY_V1=bestaande-waarde-blijft-staan\n', { mode: 0o600 });
      const uit1 = execFileSync('bash', ['deploy/geheimen-aanmaken.sh', env], { encoding: 'utf8' });
      const inhoud1 = readFileSync(env, 'utf8');
      const uit2 = execFileSync('bash', ['deploy/geheimen-aanmaken.sh', '--stil', env], { encoding: 'utf8' });
      const inhoud2 = readFileSync(env, 'utf8');
      const waarden = inhoud1.split('\n').filter(Boolean).map((r) => r.slice(r.indexOf('=') + 1)).filter((v) => v.length >= 16);
      const namen = inhoud1.split('\n').filter(Boolean).map((r) => r.slice(0, r.indexOf('=')));
      check('geheimen-aanmaken.sh: maakt de verplichte sleutels aan (incl. MAIL_APP_WACHTWOORD_SLEUTEL_V1 en AGENDA_ABONNEMENT_SLEUTEL_V1), bestaande blijft',
        ['MAIL_APP_WACHTWOORD_SLEUTEL_V1', 'AGENDA_ABONNEMENT_SLEUTEL_V1', 'MAIL_TOKEN_ENCRYPTION_KEY_V1', 'OWNER_VAULT_ENCRYPTION_KEY_V1', 'GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1', 'RECOVERY_CODE_PEPPER', 'AUDIT_IP_PEPPER'].every((n) => namen.includes(n)) && inhoud1.includes('TOTP_ENCRYPTION_KEY_V1=bestaande-waarde-blijft-staan'), namen.join(' '));
      check('geheimen-aanmaken.sh: idempotent (tweede keer wijzigt niets, exit 0) en de uitvoer bevat geen enkele waarde, wel vingerafdrukken',
        inhoud1 === inhoud2 && !waarden.some((v) => uit1.includes(v) || uit2.includes(v)) && /vingerafdruk [0-9a-f]{8}/.test(uit1) && !/ aangemaakt \(vingerafdruk/.test(uit2));
      check('geheimen-aanmaken.sh: sleutels met TOTP-terugval worden op een BESTAAND bestand niet stil aangemaakt (alleen met --ook-optioneel)',
        !namen.includes('GITHUB_KOPPELING_SLEUTEL_V1') && /niet aangemaakt.*GITHUB_KOPPELING_SLEUTEL_V1/.test(uit1) && (execFileSync('bash', ['deploy/geheimen-aanmaken.sh', '--ook-optioneel', '--stil', env], { encoding: 'utf8' }), readFileSync(env, 'utf8').includes('GITHUB_KOPPELING_SLEUTEL_V1=')));
      check('geheimen-aanmaken.sh: elke sleutel die de wizard toont (WIZARD_SLEUTELS) wordt door het script beheerd', WIZARD_SLEUTELS.every((n) => bron('deploy/geheimen-aanmaken.sh').includes(n)));
      const reg = execFileSync('bash', ['deploy/geheimen-register.sh', '--env', env], { encoding: 'utf8' });
      check('geheimen-register.sh: tabel met naam, doel, vingerafdruk en datum — zonder één waarde', /\| `MAIL_APP_WACHTWOORD_SLEUTEL_V1` \|/.test(reg) && /`[0-9a-f]{8}`/.test(reg) && !readFileSync(env, 'utf8').split('\n').filter(Boolean).map((r) => r.slice(r.indexOf('=') + 1)).filter((v) => v.length >= 16).some((v) => reg.includes(v)));
      const oc = spawnSync('bash', ['deploy/oauth-client-zetten.sh', 'google'], { encoding: 'utf8', input: `${GOOGLE_ID}\n${GOOGLE_SECRET}\n`, env: { ...process.env, GEHEIMEN: env, ZONDER_HERSTART: '1' } });
      const na = readFileSync(env, 'utf8');
      check('oauth-client-zetten.sh google: schrijft id + secret uit stdin, toont het secret niet, journaal krijgt naam + vingerafdruk', oc.status === 0 && na.includes(`GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_ID}`) && na.includes(`GOOGLE_OAUTH_CLIENT_SECRET=${GOOGLE_SECRET}`) && !oc.stdout.includes(GOOGLE_SECRET) && !oc.stderr.includes(GOOGLE_SECRET) && /GOOGLE_OAUTH_CLIENT_SECRET\tvervangen\t[0-9a-f]{8}/.test(readFileSync(join(map, 'geheimen.journaal'), 'utf8')), oc.stdout + oc.stderr);
      const ocm = spawnSync('bash', ['deploy/oauth-client-zetten.sh', 'microsoft'], { encoding: 'utf8', input: `${MS_ID}\n${MS_SECRET}\n\n`, env: { ...process.env, GEHEIMEN: env, ZONDER_HERSTART: '1' } });
      const slecht = spawnSync('bash', ['deploy/oauth-client-zetten.sh', 'google'], { encoding: 'utf8', input: 'geen-id\nkort\n', env: { ...process.env, GEHEIMEN: env, ZONDER_HERSTART: '1' } });
      check('oauth-client-zetten.sh microsoft: tenant leeg → common; fout formaat → exit 1 zonder wijziging en zonder waarde in de melding', ocm.status === 0 && readFileSync(env, 'utf8').includes('MICROSOFT_GRAPH_TENANT_ID=common') && slecht.status === 1 && readFileSync(env, 'utf8').includes(`GOOGLE_OAUTH_CLIENT_ID=${GOOGLE_ID}`) && !slecht.stderr.includes('geen-id'));
    } finally { rmSync(map, { recursive: true, force: true }); }
    const inst = bron('deploy/installeer-app.sh');
    check('installer: stap «geheimen» vóór bouwen/migreren, hulpscripts naar /usr/local/sbin, verbs geheimen / geheimen-register / oauth-client',
      inst.indexOf('geheimen_controleren "$(readlink -f "$bron")"') > 0 && inst.indexOf('geheimen_controleren "$(readlink -f "$bron")"') < inst.indexOf('migreren "$doel"') && /hulpscripts_installeren "\$doel"/.test(inst) && /^\s+geheimen\) vereis_root;/m.test(inst) && /^\s+oauth-client\) vereis_root;/m.test(inst) && /^\s+geheimen-register\) vereis_root;/m.test(inst) && !/geheimen-aanvullen/.test(inst));
    // ENV-VARS.md staat in de wortel van de repo; een testkopie zonder dat bestand slaat deze controle eerlijk over.
    let envDoc = ''; try { envDoc = bron('ENV-VARS.md'); } catch { envDoc = ''; }
    check('ENV-VARS.md: MAIL_APP_WACHTWOORD_SLEUTEL_V1 verplicht, de wizard en de nieuwe opdrachten staan erin; Entra en Google Auth Platform (niet «Azure-app»)', !envDoc || (/MAIL_APP_WACHTWOORD_SLEUTEL_V1.*Verplicht/.test(envDoc) && /Майстер підключень/.test(envDoc) && /oauth-client google\|microsoft/.test(envDoc) && /Google Auth Platform/.test(envDoc) && /entra\.microsoft\.com/.test(envDoc) && !/Azure-app/.test(envDoc)), envDoc ? '' : 'ENV-VARS.md niet in de testkopie: overgeslagen');
  } finally {
    globalThis.fetch = fetchOud;
    setIntegratiesKluis(null); setKoppelingKluis(null);
    for (const k of Object.keys(process.env)) if (!(k in envOud)) delete process.env[k];
    Object.assign(process.env, envOud);
    await sys.query("DELETE FROM app.integratie_controles WHERE door = $1", [ADMIN]).catch(() => undefined);
    await closePool().catch(() => undefined);
  }
  return einde();
}
