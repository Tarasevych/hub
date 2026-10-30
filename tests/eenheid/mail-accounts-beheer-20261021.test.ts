// «Поштові акаунти» (klachten van de eigenaar, 21.10.2026, telefoon):
//   1. «Спроба підключення додаткового Google-акаунта пошти видала помилку» — het venster Gmail → «Перейти до Google» →
//      «Не вдалося розпочати підключення Gmail.». Deze test BEWIJST de oorzaak met de echte servercode (deel 2 «ДО») en dat
//      de nieuwe weg een TWEEDE Google-account met de accountkiezer koppelt (deel 2 «ПІСЛЯ», volledige callback met nep-Google).
//   2. geen «Відключити»: deel 3 doorloopt het loskoppelen van Google (extra, hoofd, «потрібен повторний вхід»), IMAP en
//      Microsoft — met de keuze lokale gegevens bewaren/wissen, de 428 zonder bevestiging, en dat de aanmelding blijft werken.
//   3. de dubbele sectie «Додаткові акаунти Microsoft» (deel 4, bron + weergave).
//   4. logo's: geen nagetekende merken meer; neutrale plaat; eigen logo's van de beheerder met ontsmetting (deel 5).
// Alles lokaal: Google is nagebootst (tests/eenheid/hulp/nep-google.ts + de onderschepte fetch hieronder); er gaat niets naar buiten.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { db } from '../../server/platform';
import { getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import {
  googleRolVoor, googleStand, googleStartFoutTekst, googleStartLichaam, imapStand, mailAccountsAdres, microsoftStand, ontkoppelUitleg, standTekst,
} from '../../src/mail/mail-koppel-model';
import { MAIL_AANBIEDERS } from '../../shared/mail-aanbieders';
import { controleerMerkEigen, merkEigenBestandsnaam, ontsmetSvg } from '../../shared/merk-eigen';

const MAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.labels'];

/** Nagebootste browser voor het tekenen van de pagina (zelfde aanpak als gebruiker-audit-2026-10-19.test.ts). */
function nepBrowser() {
  const g = globalThis as Record<string, unknown>;
  if (g.window) return;
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://mail.tarasevych.com/accounts');
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  if (!g.document) g.document = { hidden: false, title: '', cookie: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } }, body: null };
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: { ...(g.document as object), head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
}

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-accounts-beheer-20261021');
  const bron = (p: string) => readFileSync(p, 'utf8');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const omgevingVoor = Object.fromEntries(['GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1', 'MERK_EIGEN_MAP', 'OWNER_EMAIL', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'].map((n) => [n, process.env[n]]));
  const omgevingTerug = () => { for (const [n, w] of Object.entries(omgevingVoor)) { if (w === undefined) delete process.env[n]; else process.env[n] = w; } };

  // ================================================================ 0. zuivere regels van het venster
  check('rol: zonder gekoppelde hoofdmailbox → primary; met → additional (de accountkiezer van Google)',
    googleRolVoor({ accounts: [] }) === 'primary' && googleRolVoor({ accounts: [{ accountRole: 'primary' }] }) === 'additional'
    && googleRolVoor({ accounts: [{ accountRole: 'additional' }] }) === 'primary' && googleRolVoor(null, 'additional') === 'additional');
  const lijf = googleStartLichaam({ taal: 'nl', returnTo: 'https://mail.tarasevych.com/accounts', sourceOrigin: 'https://mail.tarasevych.com', tabContext: 'a'.repeat(48), rol: 'additional', loginHint: 'X@Voorbeeld.test' });
  check('startlichaam draagt ALTIJD tabContext + sourceOrigin (oorzaak 2: 400 GOOGLE_SUITE_RETURN_TO_INVALID), en een hint alleen bij additional',
    lijf.tabContext === 'a'.repeat(48) && lijf.sourceOrigin === 'https://mail.tarasevych.com' && lijf.accountRole === 'additional' && (lijf as { loginHint?: string }).loginHint === 'x@voorbeeld.test'
    && !('loginHint' in googleStartLichaam({ taal: 'uk', returnTo: '', sourceOrigin: '', tabContext: '', rol: 'primary', loginHint: 'x@voorbeeld.test' })));
  const codes = ['GOOGLE_SUITE_GATES_INCOMPLETE', 'GOOGLE_SUITE_RETURN_TO_INVALID', 'GOOGLE_SUITE_SEQUENCE_REQUIRED', 'GOOGLE_SUITE_STATE_CREATE_FAILED', 'OWNER_MAIL_SESSION_REQUIRED', 'STEP_UP_REQUIRED', 'RUIMTE_KEUZE_ONTBREEKT', 'RUIMTE_DIENST_UIT', 'RUIMTE_DIENST_BEVROREN', 'SLEUTELKLUIS_GESLOTEN', 'NETWORK_ERROR', 'GEEN_URL'];
  const algemeen = 'Не вдалося розпочати підключення Gmail.';
  const teksten = codes.flatMap((c) => [googleStartFoutTekst(c, 'uk'), googleStartFoutTekst(c, 'nl')]);
  check(`elke servercode (${codes.length}) heeft een EIGEN zin in uk én nl — nooit de oude algemene regel`,
    new Set(teksten).size === teksten.length && teksten.every((x) => x.length > 25 && x !== algemeen));
  check('een onbekende code staat er letterlijk bij (geen kale «не вдалося»)', googleStartFoutTekst('IETS_NIEUWS', 'uk').includes('IETS_NIEUWS') && googleStartFoutTekst('IETS_NIEUWS', 'nl').includes('IETS_NIEUWS'));
  check('stand per dienst: Microsoft/Google/IMAP → працює / повторний вхід / помилка / доступ ще не надано',
    microsoftStand('connected') === 'werkt' && microsoftStand('reauth_required') === 'opnieuw-aanmelden' && microsoftStand('degraded') === 'fout' && microsoftStand('authorization_required') === 'nog-geen-toegang'
    && googleStand('connected') === 'werkt' && googleStand('reauth_required') === 'opnieuw-aanmelden' && googleStand('error') === 'fout'
    && imapStand({ fout: '' }) === 'werkt' && imapStand({ fout: 'MAIL_IMAP_AANMELDEN_GEWEIGERD' }) === 'opnieuw-aanmelden' && imapStand({ fout: 'MAIL_IMAP_TIJD_OVERSCHREDEN' }) === 'fout'
    && standTekst('opnieuw-aanmelden', 'uk') === 'Потрібен повторний вхід' && standTekst('werkt', 'nl') === 'Werkt');
  check('bevestiging bij het HOOFDaccount zegt eerlijk dat de aanmelding op de site NIET geraakt wordt',
    ontkoppelUitleg('google', { hoofd: true, taal: 'uk' }).some((r) => r.includes('Вхід на сайт через Google НЕ зачіпається')) && !ontkoppelUitleg('google', { hoofd: false, taal: 'uk' }).some((r) => r.includes('ОСНОВНИЙ')));
  check('link naar «Поштові акаунти» volgt de eigen domeinnaam (BYOS)', mailAccountsAdres('https://hub.voorbeeld.org') === 'https://mail.voorbeeld.org/?tab=accounts');

  // ================================================================ 1. nep-Google voor de Suite (token, userinfo, revoke, endpoint)
  const eigenaar = `mab-eig-${T}@example.test`, sub = `sub-mab-${T}`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 = `eenheidstest-mail-accounts-${T}-32-tekens-minstens`;
  const profielen = new Map<string, { sub: string; email: string }>();
  const ingetrokken: string[] = [];
  const nepFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://id.tarasevych.com/') return new Response('<!doctype html><title>id</title>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(String(init?.body || ''));
      const code = p.get('code') || '';
      if (code.startsWith('suite-')) {
        if (!p.get('code_verifier')) return new Response('{"error":"invalid_request"}', { status: 400 });
        return new Response(JSON.stringify({ access_token: `at-${code}`, refresh_token: `rt-${code}`, scope: ['openid', 'email', 'profile', ...MAIL_SCOPES].join(' '), expires_in: 3600, token_type: 'Bearer' }), { status: 200 });
      }
    }
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
      const tok = String((init?.headers as Record<string, string> | undefined)?.Authorization || '').replace(/^Bearer at-/, '');
      const pr = profielen.get(tok);
      if (pr) return new Response(JSON.stringify({ sub: pr.sub, email: pr.email, email_verified: true, name: pr.email, picture: '' }), { status: 200 });
    }
    if (url.startsWith('https://oauth2.googleapis.com/revoke')) { ingetrokken.push(url); return new Response('{}', { status: 200 }); }
    return nepFetch(input as never, init);
  }) as typeof fetch;

  const B = G.browser();
  const pool = getPool('systeem');
  const MAIL = 'mail.tarasevych.com';
  const post = (pad: string, extra: Record<string, unknown> = {}, host = MAIL) => B.verzoek(host, pad, B.ctxBody('mail', extra));
  const snapshot = async () => (await post('/api/owner/mail/google-suite/accounts')).data as { accounts: Array<{ id: string; email: string; accountRole: string }>; inactiveAccounts: Array<{ id: string; email: string; status: string; accountRole: string }>; sessionEmail: string };
  /** Google laten «antwoorden» op een authUrl: zelfde state terug, met een code voor dit profiel. */
  const googleAntwoord = async (authUrl: string, profiel: { sub: string; email: string }) => {
    const code = `suite-${randomBytes(6).toString('hex')}`; profielen.set(code, profiel);
    return B.verzoek('id.tarasevych.com', '/api/owner/google-suite/callback', { state: new URL(authUrl).searchParams.get('state'), code });
  };
  const tweede = { sub: `sub-twee-${T}`, email: `tweede-${T}@gmail.test` };
  const derde = { sub: `sub-drie-${T}`, email: `derde-${T}@gmail.test` };
  try {
    const login = await B.aanmelden(sub, eigenaar, { service: 'mail', authTime: Math.floor(Date.now() / 1000) - 3600 });
    check('aanmelden als eigenaar op mail (nep-Google)', login.cb.data.ok === true, JSON.stringify(login.cb.data).slice(0, 160));
    const uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');

    // ================================================================ 2. de klacht: «додатковий Google-акаунт → помилка»
    // ---- ДО, oorzaak 2: het oude lichaam zonder sourceOrigin, rechtstreeks aan startConsent (zoals vóór de serverfix) ----
    const { googleSuiteStartMailConsent } = await import('../../backend/google-suite-inrichting');
    const OUD = { service: 'mail', locale: 'uk', returnTo: `https://${MAIL}/accounts`, accountRole: 'primary' }; // letterlijk MailKoppelVenster.tsx:75 vóór 21.10
    const oudDirect = await googleSuiteStartMailConsent({ service: 'mail', user: { id: uid, email: eigenaar, name: '', status: 'approved', sub } }, { ...OUD }, 'primary') as { statusCode: number; body: string };
    check('ДО (oorzaak 2): oud lichaam zonder sourceOrigin → 400 GOOGLE_SUITE_RETURN_TO_INVALID (het venster toonde «не вдалося»)',
      oudDirect.statusCode === 400 && oudDirect.body.includes('GOOGLE_SUITE_RETURN_TO_INVALID'), `${oudDirect.statusCode} ${oudDirect.body.slice(0, 120)}`);
    const oudRoute = await post('/api/owner/mail/google-suite/onboarding/start', OUD);
    check('ПІСЛЯ (serverkant): de route vult de oorsprong van het verzoek zelf in → authUrl', oudRoute.status === 200 && String(oudRoute.data.authUrl || '').startsWith('https://accounts.google.com/'), `${oudRoute.status} ${oudRoute.body.slice(0, 160)}`);

    // ---- hoofdmailbox koppelen via de NIEUWE weg (rol uit de echte stand) ----
    const s0 = await snapshot();
    check('stand vóór koppelen: geen Gmail, sessionEmail = eigenaar', s0.accounts.length === 0 && s0.sessionEmail === eigenaar, JSON.stringify(s0).slice(0, 200));
    const nieuw = (rol: 'primary' | 'additional', extra: { loginHint?: string; opnieuw?: boolean } = {}) =>
      googleStartLichaam({ taal: 'uk', returnTo: `https://${MAIL}/accounts`, sourceOrigin: `https://${MAIL}`, tabContext: B.tab, rol, ...extra });
    const startHoofd = await post('/api/owner/mail/google-suite/onboarding/start', nieuw(googleRolVoor(s0)));
    const urlHoofd = new URL(String(startHoofd.data.authUrl || 'https://x.invalid/'));
    check('hoofdmailbox: login_hint = eigenaar, prompt=consent (geen accountkiezer nodig)', urlHoofd.searchParams.get('login_hint') === eigenaar && urlHoofd.searchParams.get('prompt') === 'consent' && /^gsuite\.v2\.uk\.mail\.p\./.test(urlHoofd.searchParams.get('state') || ''));
    const cbHoofd = await googleAntwoord(String(startHoofd.data.authUrl), { sub, email: eigenaar });
    const s1 = await snapshot();
    check('callback hoofdmailbox → één gekoppelde Gmail met rol primary', cbHoofd.data.ok === true && s1.accounts.length === 1 && s1.accounts[0].accountRole === 'primary', `${cbHoofd.status} ${cbHoofd.body.slice(0, 160)}`);

    // ---- ДО, oorzaak 1 (de situatie van de eigenaar): hoofd-Gmail gekoppeld, venster stuurt ALTIJD primary ----
    const oudNa = await post('/api/owner/mail/google-suite/onboarding/start', OUD);
    const oudeVensterTekst = (() => { const url = String(oudNa.data.authUrl || ''); return url ? 'naar Google' : algemeen; })(); // de oude logica: !url → throw GEEN_URL → algemene regel
    check('ДО (oorzaak 1): hoofd-Gmail al gekoppeld + accountRole primary → 200 alreadyGranted ZONDER authUrl → het oude venster toonde «Не вдалося розпочати підключення Gmail.»',
      oudNa.status === 200 && oudNa.data.alreadyGranted === true && !oudNa.data.authUrl && oudeVensterTekst === algemeen, oudNa.body.slice(0, 160));

    // ---- ПІСЛЯ: de rol volgt uit de stand → additional → accountkiezer van Google ----
    const rol = googleRolVoor(s1);
    const startExtra = await post('/api/owner/mail/google-suite/onboarding/start', nieuw(rol));
    const urlExtra = new URL(String(startExtra.data.authUrl || 'https://x.invalid/'));
    check('ПІСЛЯ: rol = additional; authUrl met prompt «consent select_account», ZONDER login_hint, state …mail.a…',
      rol === 'additional' && startExtra.status === 200 && urlExtra.searchParams.get('prompt') === 'consent select_account' && !urlExtra.searchParams.has('login_hint') && /^gsuite\.v2\.uk\.mail\.a\./.test(urlExtra.searchParams.get('state') || ''), startExtra.body.slice(0, 160));
    const cbExtra = await googleAntwoord(String(startExtra.data.authUrl), tweede);
    const s2 = await snapshot();
    check('ПІСЛЯ: callback met een ANDER Google-account → twee Gmail-mailboxen (primary + additional)',
      cbExtra.data.ok === true && s2.accounts.length === 2 && s2.accounts.some((a) => a.email === tweede.email && a.accountRole === 'additional'), `${cbExtra.body.slice(0, 160)} | ${JSON.stringify(s2.accounts.map((a) => [a.email, a.accountRole]))}`);
    const dubbel = await post('/api/owner/mail/google-suite/onboarding/start', nieuw('additional'));
    const cbDubbel = await googleAntwoord(String(dubbel.data.authUrl), { sub, email: eigenaar });
    check('kiest de mens in de accountkiezer tóch het hoofdaccount → eerlijke reden GOOGLE_SUITE_ADDITIONAL_ACCOUNT_DUPLICATES_PRIMARY', cbDubbel.data.ok === false && cbDubbel.data.reasonCode === 'GOOGLE_SUITE_ADDITIONAL_ACCOUNT_DUPLICATES_PRIMARY', cbDubbel.body.slice(0, 160));
    const herExtra = await post('/api/owner/mail/google-suite/onboarding/start', nieuw('additional', { loginHint: tweede.email }));
    check('«Перепідключити» van een extra account: login_hint = dat adres', new URL(String(herExtra.data.authUrl || 'https://x.invalid/')).searchParams.get('login_hint') === tweede.email);
    const herHoofd = await post('/api/owner/mail/google-suite/onboarding/start', nieuw('primary', { opnieuw: true }));
    check('«Перепідключити» van het hoofdaccount: forceConsent → wél een authUrl (niet «alreadyGranted»)', String(herHoofd.data.authUrl || '').startsWith('https://accounts.google.com/') && !herHoofd.data.alreadyGranted);
    // GATES_INCOMPLETE: de concrete reden, niet «не вдалося»
    const sleutel = process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1; delete process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1;
    const dicht = await post('/api/owner/mail/google-suite/onboarding/start', nieuw('additional'));
    process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 = sleutel;
    check('zonder sleutel: 503 GOOGLE_SUITE_GATES_INCOMPLETE → het venster noemt de beheerder en wat ontbreekt',
      dicht.status === 503 && dicht.data.error === 'GOOGLE_SUITE_GATES_INCOMPLETE' && googleStartFoutTekst(String(dicht.data.error), 'uk').includes('Адміністратор'), `${dicht.status} ${dicht.body.slice(0, 120)}`);

    // ================================================================ 3. loskoppelen — Google, IMAP, Microsoft
    // ---- lokale gegevens van de extra Gmail: 2 berichten van de zoekfunctie + 1 handmatig ----
    const nu = Date.now();
    const [lokaalGoogle] = await db.add('mail_accounts_v1', [{ ownerUserId: uid, ruimte: 'prive', provider: 'google', email: tweede.email, primary: false, identityLinked: false, status: 'authorization_required', createdAt: nu, updatedAt: nu }]);
    const itemIds = await db.add('mail_items_v1', [
      { ownerUserId: uid, ruimte: 'prive', source: 'provider', mailAccountId: lokaalGoogle, subject: 'p1', body: 'x', receivedAt: nu, createdAt: nu, updatedAt: nu },
      { ownerUserId: uid, ruimte: 'prive', source: 'provider', mailAccountId: lokaalGoogle, subject: 'p2', body: 'x', receivedAt: nu, createdAt: nu, updatedAt: nu },
      { ownerUserId: uid, ruimte: 'prive', source: 'manual', subject: 'handmatig', body: 'x', receivedAt: nu, createdAt: nu, updatedAt: nu },
    ]);
    const extraId = s2.accounts.find((a) => a.email === tweede.email)!.id;
    const zonder = await post(`/api/owner/mail/google/accounts/${extraId}/disconnect`, { retainLocalData: false });
    check('Google: wissen zonder bevestiging → 428 (er gebeurt niets)', zonder.status === 428 && zonder.data.error === 'MAIL_DISCONNECT_DATA_DELETE_CONFIRMATION_REQUIRED' && (await snapshot()).accounts.length === 2);
    const weg = await post(`/api/owner/mail/google/accounts/${extraId}/disconnect`, { retainLocalData: false, confirmation: 'DELETE_MAIL_ACCOUNT_DATA' });
    const naWeg = await snapshot();
    const rest = await db.get<Record<string, unknown>>('mail_items_v1', itemIds.map(String));
    check('Google extra: losgekoppeld, bij Google ingetrokken, 2 lokale berichten gewist, handmatig bericht blijft',
      weg.status === 200 && weg.data.deletedItems === 2 && weg.data.providerRevocation === 'revoked' && ingetrokken.length >= 1
      && naWeg.accounts.length === 1 && !naWeg.inactiveAccounts.some((a) => a.id === extraId) && !rest[0] && !rest[1] && !!rest[2], `${weg.status} ${weg.body.slice(0, 200)}`);

    // ---- «потрібен повторний вхід»: een derde account waarvan Google de toestemming introk ----
    const startDerde = await post('/api/owner/mail/google-suite/onboarding/start', nieuw('additional'));
    await googleAntwoord(String(startDerde.data.authUrl), derde);
    const s3 = await snapshot();
    const derdeId = s3.accounts.find((a) => a.email === derde.email)?.id || '';
    const grant = (await db.list<Record<string, unknown>>('google_oauth_grant_v1', { filter: { ownerUserId: uid, principalId: derdeId } })).items[0] as Record<string, unknown> & { id: string };
    const { id: grantId, ...grantRec } = grant;
    await db.update('google_oauth_grant_v1', [{ id: grantId, record: { ...grantRec, grantStatus: 'reauth_required', updatedAt: Date.now() } }]);
    const s4 = await snapshot();
    check('een mailbox met ingetrokken Google-toestemming verdwijnt niet stil: inactiveAccounts met status reauth_required',
      !!derdeId && !s4.accounts.some((a) => a.id === derdeId) && s4.inactiveAccounts.some((a) => a.id === derdeId && a.status === 'reauth_required' && a.accountRole === 'additional'), JSON.stringify(s4.inactiveAccounts));
    const wegDerde = await post(`/api/owner/mail/google/accounts/${derdeId}/disconnect`, { retainLocalData: true });
    check('…en is ook in die stand los te koppelen (lokale gegevens bewaard)', wegDerde.status === 200 && wegDerde.data.retainLocalData === true && !(await snapshot()).inactiveAccounts.some((a) => a.id === derdeId), wegDerde.body.slice(0, 160));

    // ---- hoofdmailbox: Drive gebruikt dezelfde grant → niet bij Google intrekken; aanmelding blijft ----
    const hoofdId = (await snapshot()).accounts[0].id;
    const grantHoofd = (await db.list<Record<string, unknown>>('google_oauth_grant_v1', { filter: { ownerUserId: uid, principalId: hoofdId } })).items[0] as { id: string };
    await db.add('provider_service_tokens_v1', [{ ownerUserId: uid, principalId: hoofdId, provider: 'google', service: 'drive', tokenName: 'google_drive_token', tokenKind: 'logical_handle', oauthGrantId: grantHoofd.id, requiredScopes: [], status: 'active', createdAt: nu, updatedAt: nu, revokedAt: 0 }]);
    const voorRevoke = ingetrokken.length;
    const wegHoofd = await post(`/api/owner/mail/google/accounts/${hoofdId}/disconnect`, { retainLocalData: true });
    const boot = await post('/api/owner/mail/bootstrap');
    check('Google hoofd: losgekoppeld, gedeelde grant (Drive) NIET ingetrokken, accountRole primary in het antwoord',
      wegHoofd.status === 200 && wegHoofd.data.accountRole === 'primary' && wegHoofd.data.sharedGrantPreserved === true && ingetrokken.length === voorRevoke && (await snapshot()).accounts.length === 0, wegHoofd.body.slice(0, 200));
    check('…en de aanmelding op de site werkt gewoon door (bootstrap 200, sessie dezelfde)', boot.status === 200 && Array.isArray(boot.data.items), `${boot.status}`);

    // ---- IMAP ----
    const imapId = randomUUID();
    await pool.query(`INSERT INTO app.mail_imap_koppeling (user_id, id, aanbieder, adres, geheim, ruimte, actief, mappen, smtp_goed, laatst_goed_op, fout) VALUES ($1,$2,'ukrnet',$3,'v1.aaaa.bbbb.cccc','prive',true,3,true,now(),'')`, [uid, imapId, `imap-${T}@ukr.net`]);
    const lijst1 = await post('/api/owner/mail/imap/aanbieders');
    check('IMAP: de koppeling staat in de lijst, zonder geheim', (lijst1.data.koppelingen || []).some((k: { id: string }) => k.id === imapId) && !lijst1.body.includes('v1.aaaa'));
    const nogEens = await post('/api/owner/mail/imap/koppelen', { aanbieder: 'ukrnet', adres: `imap-${T}@ukr.net`, wachtwoord: 'nieuw-app-wachtwoord' });
    check('IMAP: hetzelfde adres nog eens zonder «vervang» → MAIL_IMAP_AL_GEKOPPELD (nooit stil overschrijven)', nogEens.status === 400 && nogEens.data.fout === 'MAIL_IMAP_AL_GEKOPPELD');
    const imapWeg = await post('/api/owner/mail/imap/ontkoppelen', { id: imapId });
    const imapRij = (await pool.query('SELECT 1 FROM app.mail_imap_koppeling WHERE user_id=$1 AND id=$2', [uid, imapId])).rowCount;
    const imapNogEens = await post('/api/owner/mail/imap/ontkoppelen', { id: imapId });
    check('IMAP: ontkoppelen wist de rij (en het versleutelde wachtwoord); tweede keer 404', imapWeg.status === 200 && imapRij === 0 && imapNogEens.status === 404);

    // ---- Microsoft (bestaande route, nu ook vanaf «Підключені акаунти») ----
    const [msWis, msBewaar] = await db.add('mail_accounts_v1', [
      { ownerUserId: uid, ruimte: 'prive', provider: 'microsoft', email: `ms-wis-${T}@outlook.test`, primary: false, identityLinked: false, status: 'connected', createdAt: nu, updatedAt: nu },
      { ownerUserId: uid, ruimte: 'prive', provider: 'microsoft', email: `ms-bewaar-${T}@outlook.test`, primary: false, identityLinked: false, status: 'connected', createdAt: nu, updatedAt: nu },
    ]);
    const [msItemWis, msItemBewaar] = await db.add('mail_items_v1', [
      { ownerUserId: uid, ruimte: 'prive', source: 'provider', mailAccountId: msWis, subject: 'm1', body: 'x', receivedAt: nu, createdAt: nu, updatedAt: nu },
      { ownerUserId: uid, ruimte: 'prive', source: 'provider', mailAccountId: msBewaar, subject: 'm2', body: 'x', receivedAt: nu, createdAt: nu, updatedAt: nu },
    ]);
    const msZonder = await post(`/api/owner/mail/accounts/${msWis}/disconnect`, { retainLocalData: false });
    const msJa = await post(`/api/owner/mail/accounts/${msWis}/disconnect`, { retainLocalData: false, confirmation: 'DELETE_MAIL_ACCOUNT_DATA' });
    const msBew = await post(`/api/owner/mail/accounts/${msBewaar}/disconnect`, { retainLocalData: true });
    const [iw, ib] = await db.get<Record<string, unknown>>('mail_items_v1', [String(msItemWis), String(msItemBewaar)]);
    check('Microsoft: wissen zonder bevestiging → 428; met → losgekoppeld + gegevens weg; bewaren → gegevens blijven',
      msZonder.status === 428 && msJa.status === 200 && msJa.data.account?.status === 'disconnected' && msJa.data.account?.connectionStage === 'disconnected_local_data_deleted' && !iw
      && msBew.status === 200 && msBew.data.account?.connectionStage === 'disconnected_local_data_retained' && !!ib, `${msZonder.status} ${msJa.body.slice(0, 120)} | ${msBew.body.slice(0, 120)}`);

    // ================================================================ 5b. eigen logo's: de route (map uit de omgeving)
    const map = await mkdtemp(join(tmpdir(), 'merk-eigen-'));
    process.env.MERK_EIGEN_MAP = map;
    await writeFile(join(map, 'ukrnet.svg'), '<?xml version="1.0"?><!-- editor --><svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 24 24" inkscape:version="1"><path d="M0 0h24v24H0z" fill="#F56B1F"/></svg>');
    await writeFile(join(map, 'iua.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>alert(1)</script></svg>');
    await writeFile(join(map, 'Fout Naam.svg'), '<svg viewBox="0 0 1 1"/>');
    const { merkEigenCacheWeg } = await import('../../backend/merk-eigen');
    merkEigenCacheWeg();
    const lijst = await post('/api/owner/merk-eigen/lijst');
    const ukr = (lijst.data.merken || []).find((m: { sleutel: string }) => m.sleutel === 'ukrnet');
    const svgTerug = ukr ? Buffer.from(String(ukr.data).split(',')[1], 'base64').toString('utf8') : '';
    check('eigen logo: geldige SVG uit de map komt als data-URI terug, ONTSMET (geen proloog/commentaar/inkscape)',
      lijst.status === 200 && !!ukr && String(ukr.data).startsWith('data:image/svg+xml;base64,') && !svgTerug.includes('inkscape') && !svgTerug.includes('<!--') && !svgTerug.includes('<?xml') && svgTerug.includes('<path'), lijst.body.slice(0, 200));
    check('eigen logo: SVG met <script> en een verkeerde bestandsnaam worden GEWEIGERD en voor de eigenaar genoemd',
      !(lijst.data.merken || []).some((m: { sleutel: string }) => m.sleutel === 'iua') && (lijst.data.geweigerd || []).some((g: { bestand: string; reden: string }) => g.bestand === 'iua.svg' && g.reden === 'ELEMENT_SCRIPT') && (lijst.data.geweigerd || []).some((g: { bestand: string }) => g.bestand === 'Fout Naam.svg'));
    const zetMail = await post('/api/owner/admin/merk-eigen/zetten', { sleutel: 'iua', soort: 'svg', data: Buffer.from('<svg viewBox="0 0 1 1"/>').toString('base64') });
    check('eigen logo opladen kan alleen op admin (mail → 403 ADMIN_SERVICE_REQUIRED)', zetMail.status === 403 && zetMail.data.error === 'ADMIN_SERVICE_REQUIRED');
    const A = G.browser();
    await A.aanmelden(sub, eigenaar, { service: 'admin', authTime: Math.floor(Date.now() / 1000) - 3600 });
    const zetAdmin = await A.verzoek('admin.tarasevych.com', '/api/owner/admin/merk-eigen/zetten', A.ctxBody('admin', { sleutel: 'iua', soort: 'svg', data: Buffer.from('<svg viewBox="0 0 1 1"/>').toString('base64') }));
    check('eigen logo opladen op admin zonder verse passkey → 403 STEP_UP_REQUIRED (methods passkey); er is niets geschreven',
      zetAdmin.status === 403 && zetAdmin.data.error === 'STEP_UP_REQUIRED' && (zetAdmin.data.methods || []).includes('passkey') && !(await readFile(join(map, 'iua.svg'), 'utf8')).startsWith('<svg viewBox="0 0 1 1"'), `${zetAdmin.status} ${zetAdmin.body.slice(0, 120)}`);
    await rm(map, { recursive: true, force: true });
  } finally {
    globalThis.fetch = nepFetch;
    G.herstel();
    omgevingTerug();
  }

  // ================================================================ 4. de pagina en het venster (bron + weergave)
  nepBrowser();
  const mfv = bron('src/MailFunctioneelWeergave.tsx'), hubBron = bron('src/MailAccountsHub.tsx'), venster = bron('src/mail/MailKoppelVenster.tsx');
  check('de dubbele sectie «Додаткові акаунти Microsoft» (select + e-mailveld) is weg uit MailFunctionalView',
    !mfv.includes("data-mail-provider-manager='microsoft'") && !mfv.includes('Додаткові акаунти Microsoft') && !mfv.includes('mail-account-form') && !mfv.includes('linkMailAccount'));
  check('de Microsoft-stromen bestaan nog (zelfde routes) in «Підключені акаунти»',
    hubBron.includes('const startMicrosoftConnection') && hubBron.includes('/connect/start') && hubBron.includes('const disconnectMicrosoftAccount') && hubBron.includes('/disconnect'));
  check('het venster stuurt niet meer hard «accountRole: \'primary\'» en gebruikt het model (rol, tabContext, sourceOrigin, foutteksten)',
    !venster.includes("accountRole: 'primary'") && venster.includes('googleStartLichaam') && venster.includes('googleRolVoor') && venster.includes('googleStartFoutTekst') && venster.includes('huidigTabblad'));
  const MailAccountsHub = (await import('../../src/MailAccountsHub')).default;
  const html = renderToString(createElement(MailAccountsHub, { lang: 'uk', userName: 'Павло', accounts: [{ id: 'p1', email: 'tarasevych.pavlo@gmail.com', provider: 'Google', status: 'connected', accountRole: 'primary' }] }));
  check('«Підключені акаунти»: tarasevych.pavlo@gmail.com met stand «Працює», «Основний», «Перепідключити», «Відключити», «Додати ще один Gmail»',
    html.includes('tarasevych.pavlo@gmail.com') && html.includes('Працює') && html.includes('Основний') && html.includes('Перепідключити') && html.includes('data-mail-ontkoppel') && html.includes('Додати ще один<!-- --> <!-- -->Gmail'), html.slice(html.indexOf('data-mail-gekoppeld'), html.indexOf('data-mail-gekoppeld') + 400));
  const htmlNl = renderToString(createElement(MailAccountsHub, { lang: 'nl', accounts: [] }));
  check('tegels zonder weg: uitleg ingeklapt onder «Чому недоступно?» / «Waarom niet beschikbaar?»', html.includes('<summary>Чому недоступно?</summary>') && htmlNl.includes('<summary>Waarom niet beschikbaar?</summary>'));
  const css = bron('src/mail-accounts-hub.css');
  check('telefoon ≤ 480 px: één kolom met compacte tegels', /@media \(max-width:480px\)\{[^}]*\.mail-provider-rooster\{grid-template-columns:minmax\(0,1fr\)/.test(css.replace(/\s*\n\s*/g, '')));

  // ================================================================ 5. logo's: geen nagetekende merken, neutrale plaat, ontsmetting
  const { MERKEN } = await import('../../src/merk/merk-tabel');
  const { LOGOS } = await import('../../src/merk/merk-logos');
  const reg = await import('../../src/merk/merk-register');
  const Merk = (await import('../../src/merk/Merk')).default;
  const NEUTRAAL = ['microsoftoutlook', 'ukrnet', 'iua', 'onlineua', 'yahoo', 'microsoftonedrive', 'microsoftonenote', 'microsoftteams', 'microsoftazure', 'microsoftentra', 'fastmail', 'freshdesk', 'mollie', 'mondaydotcom', 'pipedrive', 'tuya', 'webhook', 'windows', 'edge', 'microsoft', 'node'];
  check(`de ${NEUTRAAL.length} nagetekende vormen zijn weg: neutraal, zonder d/paden, met 1–2 letters`,
    NEUTRAAL.every((k) => MERKEN[k]?.neutraal === true && !MERKEN[k].d && !MERKEN[k].paden && /^.{1,2}$/u.test(String(MERKEN[k].letter || ''))), NEUTRAAL.filter((k) => !MERKEN[k]?.neutraal).join());
  const zwak = NEUTRAAL.filter((k) => reg.merkContrast(MERKEN[k].kleur, MERKEN[k].vlak!) < 4.5);
  check('neutrale plaat: letters ≥ 4,5:1 op de merktoon (wit of zwart, het hoogste contrast)', zwak.length === 0, zwak.join());
  const mailMerken = MAIL_AANBIEDERS.map((a) => a.merk);
  const echteHerkomst = mailMerken.filter((m) => !!LOGOS[m]);
  const neutraalMail = mailMerken.filter((m) => MERKEN[m]?.neutraal);
  check(`elke mailtegel: óf een vorm uit simple-icons (${echteHerkomst.join(', ')}), óf de neutrale plaat (${neutraalMail.join(', ')})`,
    echteHerkomst.length + neutraalMail.length === mailMerken.length && echteHerkomst.includes('gmail') && echteHerkomst.includes('protonmail'));
  const plaat = renderToString(createElement(Merk, { merk: 'ukrnet', maat: 36 }));
  check('<Merk> tekent de neutrale plaat (data-merk="neutraal", tekst, geen pad) — geen monogram «onbekend»', plaat.includes('data-merk="neutraal"') && plaat.includes('>Uk</text>') && !plaat.includes('<path') && !plaat.includes('onbekend'), plaat.slice(0, 200));
  reg.registreerEigenMerken([{ sleutel: 'ukrnet', soort: 'svg', data: `data:image/svg+xml;base64,${Buffer.from('<svg viewBox="0 0 1 1"/>').toString('base64')}`, hash: 'x' }]);
  const eigen = renderToString(createElement(Merk, { merk: 'ukrnet', maat: 36 }));
  reg._eigenMerkenOpnieuw();
  check('een eigen logo van de beheerder gaat vóór de neutrale plaat (<img data-merk-eigen>)', eigen.includes('data-merk-eigen="ukrnet"') && eigen.includes('<img') && !eigen.includes('data-merk="neutraal"'), eigen.slice(0, 160));
  reg.registreerEigenMerken([{ sleutel: 'iua', soort: 'svg', data: 'javascript:alert(1)', hash: 'x' }]);
  check('het register neemt alleen data:image/svg+xml|png;base64 aan', !reg.eigenMerk('iua')); reg._eigenMerkenOpnieuw();

  const geweigerd = (svg: string) => { const u = ontsmetSvg(svg); return u.ok ? 'OK' : u.reden; };
  const kop = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';
  const gevallen: Array<[string, string]> = [
    [`${kop}<script>alert(1)</script></svg>`, 'ELEMENT_SCRIPT'],
    [`${kop}<foreignObject><div/></foreignObject></svg>`, 'ELEMENT_FOREIGNOBJECT'],
    [`${kop}<image href="https://x.test/a.png"/></svg>`, 'ELEMENT_IMAGE'],
    [`${kop}<use href="https://x.test/s.svg#a"/></svg>`, 'EXTERNE_VERWIJZING'],
    [`${kop}<path d="M0 0" onload="x()"/></svg>`, 'ON_ATTRIBUUT'],
    [`${kop}<path d="M0 0" fill="url(https://x.test/f)"/></svg>`, 'EXTERNE_URL'],
    [`${kop}<style>@import url(https://x.test/a.css);</style></svg>`, 'STIJL_LAADT_IETS'],
    ['<!DOCTYPE svg [<!ENTITY x "y">]><svg viewBox="0 0 1 1"/>', 'DOCTYPE_OF_ENTITY'],
    [`${kop}<a href="javascript:alert(1)"><path d="M0 0"/></a></svg>`, 'SCRIPT_URL'],
  ];
  const mis = gevallen.filter(([svg, verwacht]) => geweigerd(svg) !== verwacht).map(([svg, v]) => `${v}≠${geweigerd(svg)}`);
  check(`ontsmetting weigert ${gevallen.length} gevaarlijke vormen met de juiste reden`, mis.length === 0, mis.join(' | '));
  check('ontsmetting laat een gewone officiële SVG (gradient, use #id, style zonder url) door',
    geweigerd(`${kop}<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient><path id="p" d="M0 0h24v24H0z"/></defs><style>.a{fill:url(#g)}</style><use href="#p" class="a"/></svg>`) === 'OK');
  check('PNG: echte handtekening + IHDR, ≤ 200 KB; anders geweigerd',
    controleerMerkEigen('png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), Buffer.from('IHDR'), Buffer.alloc(30)])).ok === true
    && !controleerMerkEigen('png', Buffer.from('GIF89a........................................')).ok && !controleerMerkEigen('png', Buffer.alloc(210 * 1024)).ok);
  check('bestandsnamen: alleen <sleutel>.svg|png in kleine letters', merkEigenBestandsnaam('ukrnet.svg')?.sleutel === 'ukrnet' && !merkEigenBestandsnaam('../x.svg') && !merkEigenBestandsnaam('Ukr.SVG') && !merkEigenBestandsnaam('x.gif'));
  const leesmij = bron('deploy/LEESMIJ.md');
  check('deploy/LEESMIJ.md beschrijft de map, de regels en het opladen via admin', leesmij.includes('/srv/mijn-ruimte/merk-eigen') && leesmij.includes('MERK_EIGEN_MAP') && leesmij.includes('200 KB'));

  return einde();
}
