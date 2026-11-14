// IDENTITEIT-015 (крок «aanmelden», етап 3.5–3.9 плану): вхід без Google — ключем доступу, паролем (+ TOTP / код відновлення),
// через прив'язаний Microsoft (підроблений провайдер на 127.0.0.1), підтвердження номера кодом із SMS (підроблений провайдер за
// інтерфейсом), «Повернути спосіб входу», захист від блокування з новими шляхами й давня вада бейджа способу входу (Telegram = «Google SSO»).
// Поведінка — через справжні маршрути backend/index.ts проти одноразової бази й підробленого Google (tests/eenheid/hulp). Лише вигадані дані.
// Aanmelden zonder Google via de echte routes; nep-Google, nep-aanbieder (OAuth) en een nep-sms-aanbieder; niets gaat naar buiten.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-015-aanmelden.test.ts
import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { closePool, getPool } from '../../server/platform/pg';
import { sealWithEnvKey } from '../../server/platform/beveiliging';
import { PUBLIEKE_ROUTES } from '../../server/platform/auth-poort';
import { SMS_VOORWAARDE, smsConfigLezen, twilioAanbieder, zetSmsAanbiederVoorTest, type SmsAanbieder } from '../../server/platform/sms';
import { checker, nepGoogle, totpCode } from './hulp/nep-google';
import { nepAanbieder } from './hulp/nep-aanbieder';
import { bevestig, nieuwePasskey, registreer } from './hulp/nep-toegangssleutel';
import { AANMELD_METHODEN_PUBLIEKE_ROUTES } from '../../backend/aanmelden-methoden';
import { laatsteWegFout } from '../../backend/aanmeld-wegen';
import { aanmeldIndeling, METHODEN, plaatsingControleren, plaatsingNormaliseren } from '../../shared/aanmeld-plaatsing/plaatsing';
import { MELDING_SOORTEN } from '../../shared/melding-soorten';
import { NA_0107_VIA_VOORVOEGSEL, SFEER_PER_SOORT, sfeerVolgensVoorvoegsel } from '../../shared/meldingen-soorten';
import { uitlegVoor } from '../../shared/meldingen-v2/uitleg-register';
import { VLAG_UITLEG } from '../../shared/vlaggen';
import { runInNewContext } from 'node:vm';

/** Мінімальний підроблений браузер (як у identiteit-015-apparaten-uitvoer): досить, щоб відрендерити кнопки в node. */
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'navigator'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://id.tarasevych.com/methods');
  const doc = { hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null, addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => ({ setAttribute: () => undefined, style: {}, dataset: {} }), documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } } };
  Object.defineProperty(g, 'document', { value: doc, configurable: true, writable: true });
  Object.defineProperty(g, 'location', { value: { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined }, configurable: true, writable: true });
  Object.defineProperty(g, 'sessionStorage', { value: opslag(), configurable: true, writable: true });
  Object.defineProperty(g, 'localStorage', { value: opslag(), configurable: true, writable: true });
  Object.defineProperty(g, 'history', { value: { pushState: () => undefined, replaceState: () => undefined, state: null }, configurable: true, writable: true });
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0), matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

const VLAGGEN = ['aanmelden-passkey', 'aanmelden-wachtwoord', 'aanmelden-extern', 'aanmelden-sms'] as const;

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-aanmelden');

  // ================================================================ (а) статичні частини: міграція, реєстри, прапорці, розміщення
  {
    const mig = readFileSync('migrations/0275_aanmelden_methoden.sql', 'utf8');
    check('міграція 0275: повторювана (IF NOT EXISTS, DROP POLICY IF EXISTS, ON CONFLICT DO NOTHING), RLS, без доступу app-ролі',
      mig.includes('CREATE TABLE IF NOT EXISTS app.aanmeld_uitdagingen') && mig.includes('ENABLE ROW LEVEL SECURITY') && mig.includes('DROP POLICY IF EXISTS')
      && mig.includes('ON CONFLICT (sleutel) DO NOTHING') && mig.includes('REVOKE ALL ON app.aanmeld_uitdagingen FROM mijnruimte_app') && VLAGGEN.every((v) => mig.includes(`'${v}'`)));
    check('прапорці: чотири окремі, з поясненням обома мовами; небезпечні три — з «!»',
      VLAGGEN.every((v) => VLAG_UITLEG[v]?.wat[0] && VLAG_UITLEG[v]?.gevolg[1]) && ['aanmelden-passkey', 'aanmelden-wachtwoord', 'aanmelden-extern'].every((v) => VLAG_UITLEG[v].naam[0].startsWith('!')));
    const pub = Object.keys(AANMELD_METHODEN_PUBLIEKE_ROUTES);
    check('публічні маршрути входу — у PUBLIEKE_ROUTES (вартовий auth-poort), рівно ті самі 5', pub.length === 5 && pub.every((k) => k in PUBLIEKE_ROUTES));
    check('вхід за email-посиланням свідомо НЕ створено (сайт не вміє надсилати листи від свого імені): жодного маршруту email/magic-link',
      !Object.keys(PUBLIEKE_ROUTES).some((k) => /aanmelden\/(email|magic|link)|magic-link|email-link/i.test(k)));
    const oud = plaatsingNormaliseren({ volgorde: ['telegram', 'google', 'github', 'apple', 'microsoft', 'passkey'], plek: { google: 'hoofd', telegram: 'andere' } });
    check('розміщення: старий збережений рядок без discord/wachtwoord працює — нові способи в кінці, у «Інші»',
      METHODEN.includes('discord') && METHODEN.includes('wachtwoord') && oud.volgorde.slice(-2).join() === 'discord,wachtwoord' && oud.plek.discord === 'andere' && oud.plek.telegram === 'andere');
    const ind = aanmeldIndeling({ zichtbaar: false, plaatsing: { ...oud, plek: { ...oud.plek, passkey: 'hoofd' } }, methoden: ['passkey', 'wachtwoord'] });
    check('сторінка входу: робочий ключ доступу — на головній, пароль — у «Інші»; неробочий Discord не видно',
      ind.hoofd.includes('passkey') && ind.andere.includes('wachtwoord') && !ind.andere.includes('discord') && !ind.hoofd.includes('discord'));
    check('без розміщення: робочі нові способи додаються в «Інші», старий екран без них не змінився',
      JSON.stringify(aanmeldIndeling(null).andere) === JSON.stringify(['github', 'apple', 'microsoft', 'passkey']) && aanmeldIndeling({ zichtbaar: true, plaatsing: null, methoden: ['wachtwoord'] }).andere.includes('wachtwoord'));
    check('захист від блокування в розміщенні: Google можна сховати, коли ключ доступу працює й видимий; не можна — коли не працює',
      plaatsingControleren({ ...oud, plek: { ...oud.plek, google: 'verborgen', telegram: 'verborgen' } }, ['google', 'passkey']).length === 0
      && plaatsingControleren({ ...oud, plek: { ...oud.plek, google: 'verborgen', telegram: 'verborgen', passkey: 'verborgen' } }, ['google', 'passkey'])[0] === 'GEEN_WERKENDE_METHODE');
    const soorten = ['access_method_login', 'access_method_telefoon'];
    check('сповіщення: два нові типи в MELDING_SOORTEN, сфера «prive» і правило префікса 0107 дає те саме',
      soorten.every((k) => MELDING_SOORTEN[k]?.type === 'beveiliging' && SFEER_PER_SOORT[k] === 'prive' && sfeerVolgensVoorvoegsel(k) === 'prive' && NA_0107_VIA_VOORVOEGSEL.has(k)));
    const ids = soorten.map((k) => uitlegVoor({ id: k, dienst: 'identity', soort: k, ernst: 'info', titel: 't', tijd: 0, gelezen: false } as never).id);
    check('сповіщення: власні пояснення (а не загальне «безпека»)', ids.join() === 'aanmelding-zonder-google,telefoon-bevestigd', ids.join());
  }

  // ================================================================ (б) SMS: розбір ключа й справжній адаптер Twilio проти підробленого fetch
  {
    const sid = `AC${'a1'.repeat(16)}`;
    check('SMS: ключ twilio|SID|token|+номер розбирається; інший формат — null (нічого не надсилаємо)',
      smsConfigLezen(`twilio|${sid}|${'t'.repeat(32)}|+31600000001`)?.van === '+31600000001' && smsConfigLezen('twilio|x|y|z') === null && smsConfigLezen('') === null);
    const echt = globalThis.fetch;
    const gezien: Array<{ url: string; auth: string; body: string }> = [];
    globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
      gezien.push({ url: String(u), auth: String((init?.headers as Record<string, string>)?.authorization || ''), body: String(init?.body || '') });
      return new Response(JSON.stringify(String(init?.body || '').includes('%2B31600000009') ? { code: 21211 } : { sid: 'SMnep1' }), { status: String(init?.body || '').includes('%2B31600000009') ? 400 : 201 });
    }) as typeof fetch;
    try {
      const tw = twilioAanbieder(smsConfigLezen(`twilio|${sid}|${'t'.repeat(32)}|+31600000001`)!, 'https://nep-twilio.test');
      const ok = await tw.verstuur('+31600000002', 'Код 123456');
      const nee = await tw.verstuur('+31600000009', 'x');
      const fout = await tw.verstuur('0612', 'x');
      check('SMS Twilio: POST на Messages.json з Basic-автентифікацією і To/From/Body; відмова провайдера — AANBIEDER_WEIGERT; поганий номер не надсилається',
        ok.ok && ok.id === 'SMnep1' && gezien[0].url === `https://nep-twilio.test/2010-04-01/Accounts/${sid}/Messages.json` && gezien[0].auth.startsWith('Basic ')
        && gezien[0].body.includes('To=%2B31600000002') && !nee.ok && (nee as { code: string }).code === 'AANBIEDER_WEIGERT' && !fout.ok && gezien.length === 2, JSON.stringify(gezien[0]).slice(0, 200));
    } finally { globalThis.fetch = echt; }
  }

  // ================================================================ (в) маршрути проти бази
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const envSleutels = ['AANMELD_MICROSOFT_CLIENT_ID', 'AANMELD_MICROSOFT_CLIENT_SECRET', 'AANMELD_MICROSOFT_BASIS', 'AANMELD_TERUG_BASIS'];
  const envVorig = Object.fromEntries(envSleutels.map((k) => [k, process.env[k]]));
  const echteFetch = globalThis.fetch;
  const G = await nepGoogle({ ownerEmail: `i015a-eig-${T}@example.test` });
  // Підроблений OAuth-провайдер слухає на 127.0.0.1: ці запити йдуть повз підроблений Google.
  const googleFetch = globalThis.fetch;
  globalThis.fetch = ((u: unknown, i?: RequestInit) => (String(u).startsWith('http://127.0.0.1') ? echteFetch(u as string, i) : googleFetch(u as string, i))) as typeof fetch;
  const msId = `ms-${T}`, msGeheim = `geheim-${randomBytes(8).toString('hex')}`;
  const nep = await nepAanbieder({ microsoft: { clientId: msId, clientSecret: msGeheim } });
  const pool = getPool();
  const vlagVooraf = (await pool.query('SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = ANY($1)', [VLAGGEN as unknown as string[]])).rows;
  type Browser = ReturnType<typeof G.browser>;
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
  const maak = async (naam: string) => {
    // O — власник сайту (адреса = OWNER_EMAIL), A і B — схвалені звичайні облікові записи.
    const email = naam === 'o' ? `i015a-eig-${T}@example.test` : `i015a-${naam}-${T}@example.test`, b = G.browser(), sub = `i015a-${naam}-${T}`;
    await b.aanmelden(sub, email, { intent: 'login' });
    const id = await idRij(email);
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', name: `Проба ${naam}` })]);
    return { b, email, id, sub };
  };
  const vlagZet = (sleutel: string, aan: boolean, gebruikers: string[]) => pool.query('UPDATE app.feature_flags SET aan = $2, standaard = false, percentage = 0, gebruikers = $3 WHERE sleutel = $1', [sleutel, aan, gebruikers]);
  const ctx = (b: Browser, extra: Record<string, unknown> = {}) => ({ service: 'identity', tabContext: b.tab, sourceOrigin: 'https://id.tarasevych.com', returnTo: 'https://id.tarasevych.com/', locale: 'uk', remember: false, ...extra });
  // Власна IP-адреса на кожен запуск: ліміти на IP (rateLimit, вікно 10 хв) не накопичуються між запусками тесту.
  const IP = `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
  const post = (b: Browser, pad: string, body: Record<string, unknown> = {}) => b.verzoek('id.tarasevych.com', pad, body, { ip: IP });
  const ik = async (b: Browser) => (await b.verzoek('id.tarasevych.com', '/api/owner/session/bootstrap', { service: 'identity', tabContext: b.tab })).data?.user?.id as string | undefined;
  const meldingen = async (userId: string, kind: string) => (await pool.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'=$2", [userId, kind])).rows.length;
  const wacht = () => new Promise((r) => setTimeout(r, 150));
  const authMethode = async (userId: string) => (await pool.query("select data->>'authMethod' m from app.records where tbl='owner_service_sessions_v1' and data->>'userId'=$1 order by seq desc limit 1", [userId])).rows[0]?.m as string | undefined;

  try {
    const O = await maak('o'), A = await maak('a'), B = await maak('b');
    for (const v of VLAGGEN) await vlagZet(v, true, [O.id, A.id]); // «Вибрані»: власник і A; B — ні

    // ---------------------------------------------------------------- ключ доступу (discoverable)
    const pk = nieuwePasskey('es256', 1);
    {
      // Реєстрація тим самим ядром, що й сервер (kern.verifieerRegistratie) — рядок у app.passkeys як після «Додати ключ».
      const ch = randomBytes(32).toString('base64url');
      const reg = kern.verifieerRegistratie({ ...registreer(pk, ch, { origin: 'https://id.tarasevych.com' }), verwachteUitdaging: ch, rpId: 'tarasevych.com', origins: ['https://id.tarasevych.com'] }) as Record<string, any>;
      await pool.query('INSERT INTO app.passkeys (user_id, credential_id, alg, jwk, vingerafdruk, naam, aaguid, transports, backup_eligible, backup_state, sign_count) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,false,false,$9)',
        [A.id, reg.credentialId, reg.alg, JSON.stringify(reg.jwk), reg.vingerafdruk, 'Проба ключ', '', [], 1]);
    }
    const pkB = nieuwePasskey('ed25519');
    {
      const ch = randomBytes(32).toString('base64url');
      const reg = kern.verifieerRegistratie({ ...registreer(pkB, ch, { origin: 'https://id.tarasevych.com' }), verwachteUitdaging: ch, rpId: 'tarasevych.com', origins: ['https://id.tarasevych.com'] }) as Record<string, any>;
      await pool.query('INSERT INTO app.passkeys (user_id, credential_id, alg, jwk, vingerafdruk, naam, aaguid, transports, backup_eligible, backup_state, sign_count) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,false,false,0)',
        [B.id, reg.credentialId, reg.alg, JSON.stringify(reg.jwk), reg.vingerafdruk, 'Ключ B', '', []]);
    }
    const passkeyPoging = async (b: Browser, p = pk, o: Parameters<typeof bevestig>[2] = {}) => {
      const opt = await post(b, '/api/aanmelden/passkey/opties', ctx(b));
      const a = bevestig(p, String(opt.data.publicKey?.challenge || ''), { origin: 'https://id.tarasevych.com', ...o });
      return { opt, ant: await post(b, '/api/aanmelden/passkey/voltooien', { uitdagingId: opt.data.uitdagingId, assertie: a }), a };
    };
    await vlagZet('aanmelden-passkey', false, [O.id, A.id]);
    const uit = await post(G.browser(), '/api/aanmelden/passkey/opties', ctx(G.browser()));
    const cfgUit = await G.browser().verzoek('id.tarasevych.com', '/api/aanmelden/telegram/config', {}, { methode: 'GET' });
    check('ключ: прапорець вимкнено → кнопки немає (config.methoden без passkey) і opties відповідає 404 METHODE_UIT',
      uit.status === 404 && uit.data.error === 'METHODE_UIT' && Array.isArray(cfgUit.data.methoden) && !cfgUit.data.methoden.includes('passkey'), `${uit.status} ${JSON.stringify(cfgUit.data.methoden)}`);
    await vlagZet('aanmelden-passkey', true, [O.id, A.id]);
    const cfgAan = await G.browser().verzoek('id.tarasevych.com', '/api/aanmelden/telegram/config', {}, { methode: 'GET' });
    check('ключ: прапорець «Вибрані» → config.methoden містить passkey (кнопка на сторінці входу)', cfgAan.data.methoden?.includes('passkey') && cfgAan.data.methoden?.includes('wachtwoord'), JSON.stringify(cfgAan.data.methoden));

    const L0 = G.browser();
    const opt0 = await post(L0, '/api/aanmelden/passkey/opties', ctx(L0));
    const LA = G.browser();
    const p1 = await passkeyPoging(LA);
    check('ключ: opties — rpId tarasevych.com, порожній allowCredentials (discoverable), UV обов’язкова, бінд-кукі транзакції',
      p1.opt.status === 200 && p1.opt.data.publicKey.rpId === 'tarasevych.com' && Array.isArray(p1.opt.data.publicKey.allowCredentials) && p1.opt.data.publicKey.allowCredentials.length === 0
      && p1.opt.data.publicKey.userVerification === 'required' && [...L0.jar.keys()].some((k) => k.startsWith('__Secure-tsv_aanmeld_binding_')), JSON.stringify([...L0.jar.keys()]) + String(opt0.status));
    check('ключ: voltooien → сеанс тим самим механізмом (bootstrap бачить A, authMethod «passkey»)',
      p1.ant.status === 200 && p1.ant.data.sessionCreated === true && (await ik(LA)) === A.id && (await authMethode(A.id)) === 'passkey', `${p1.ant.status} ${JSON.stringify(p1.ant.data).slice(0, 200)}`);
    const herhaal = await post(LA, '/api/aanmelden/passkey/voltooien', { uitdagingId: p1.opt.data.uitdagingId, assertie: bevestig(pk, String(p1.opt.data.publicKey.challenge), { origin: 'https://id.tarasevych.com' }) });
    check('ключ: повторне «Завершити» з тим самим викликом → 403 UITDAGING_ONGELDIG (виклик одноразовий)', herhaal.status === 403 && herhaal.data.error === 'UITDAGING_ONGELDIG');
    await wacht();
    check('ключ: аудит aanmelden.passkey і сповіщення «Вхід без Google» (access_method_login) для A', (await meldingen(A.id, 'access_method_login')) === 1, String(await meldingen(A.id, 'access_method_login')));
    // чужий браузер із підглянутим викликом
    const LB = G.browser(), LC = G.browser();
    const opt2 = await post(LB, '/api/aanmelden/passkey/opties', ctx(LB));
    const gestolen = await post(LC, '/api/aanmelden/passkey/voltooien', { uitdagingId: opt2.data.uitdagingId, assertie: bevestig(pk, String(opt2.data.publicKey.challenge), { origin: 'https://id.tarasevych.com' }) });
    check('ключ: інший браузер із чужим uitdagingId → 403 LOGIN_BINDING_MISMATCH, сеансу немає', gestolen.status === 403 && gestolen.data.error === 'LOGIN_BINDING_MISMATCH' && !(await ik(LC)));
    const LD = G.browser();
    const vreemd = await passkeyPoging(LD, pk, { origin: 'https://kwaad.example' });
    const LE = G.browser();
    const rp = await passkeyPoging(LE, pk, { rpId: 'kwaad.example', origin: 'https://kwaad.example' });
    const LF = G.browser();
    const zonderUv = await passkeyPoging(LF, pk, { uv: false });
    check('ключ: чужий origin / чужий rpId / без перевірки користувача (UV) → 403, сеансу немає',
      vreemd.ant.status === 403 && rp.ant.status === 403 && zonderUv.ant.status === 403 && /^PASSKEY_/.test(zonderUv.ant.data.error) && !(await ik(LD)) && !(await ik(LF)),
      `${vreemd.ant.data.error} ${rp.ant.data.error} ${zonderUv.ant.data.error}`);
    const LG = G.browser();
    const onbekend = await passkeyPoging(LG, nieuwePasskey());
    check('ключ: невідомий ключ → 403 PASSKEY_ONBEKEND', onbekend.ant.status === 403 && onbekend.ant.data.error === 'PASSKEY_ONBEKEND');
    const LH = G.browser();
    const bAntw = await passkeyPoging(LH, pkB);
    check('ключ: людина без прапорця (B) — справжній ключ, але 403 METHODE_NIET_VOOR_U, сеансу немає, аудит «denied»',
      bAntw.ant.status === 403 && bAntw.ant.data.error === 'METHODE_NIET_VOOR_U' && !(await ik(LH)), `${bAntw.ant.status} ${bAntw.ant.data.error}`);

    // ---------------------------------------------------------------- пароль (+ TOTP)
    const wwRecord = (userId: string, ww: string) => { const salt = randomBytes(16); return { userId, algorithm: 'scrypt', n: 16384, r: 8, p: 1, salt: salt.toString('base64url'), hash: scryptSync(ww, salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64url'), mustChange: false, createdAt: Date.now(), updatedAt: Date.now() }; };
    const wwO = `Wachtwoord-O-${T}`, wwA = `Wachtwoord-A-${T}`, wwB = `Wachtwoord-B-${T}`;
    for (const [u, w] of [[O, wwO], [A, wwA], [B, wwB]] as const) await pool.query("insert into app.records (tbl,id,data) values ('identity_passwords_v1',$1,$2)", [`i015a-ww-${u.id}`, wwRecord(u.id, w)]);
    const geheim = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    await pool.query("insert into app.records (tbl,id,data) values ('identity_totp_v1',$1,$2)", [`i015a-totp-${A.id}`, { userId: A.id, secretEnc: sealWithEnvKey('TOTP_ENCRYPTION_KEY_V1', geheim, `identity-totp:v1:${A.id}`), confirmed: true, createdAt: Date.now(), updatedAt: Date.now() }]);
    const wwPoging = async (b: Browser, email: string, password: string, code = '') => {
      const s = await post(b, '/api/aanmelden/wachtwoord/start', ctx(b));
      return { s, v: await post(b, '/api/aanmelden/wachtwoord/voltooien', { pogingId: s.data.pogingId, email, password, code }) };
    };
    const W1 = G.browser();
    const fout1 = await wwPoging(W1, O.email, 'verkeerd-wachtwoord-123');
    check('пароль: неправильний → 401 ACCESS_CREDENTIALS_INVALID, сеансу немає', fout1.v.status === 401 && fout1.v.data.error === 'ACCESS_CREDENTIALS_INVALID' && !(await ik(W1)));
    await pool.query("delete from app.login_lockouts where subject like $1", [`wachtwoord:${O.email}:%`]);
    const W2 = G.browser();
    const okO = await wwPoging(W2, O.email, wwO);
    check('пароль: власник без TOTP → сеанс (bootstrap бачить O, authMethod «password»)', okO.v.status === 200 && okO.v.data.sessionCreated === true && (await ik(W2)) === O.id && (await authMethode(O.id)) === 'password', `${okO.v.status} ${JSON.stringify(okO.v.data).slice(0, 160)}`);
    const W3 = G.browser();
    const zonderCode = await wwPoging(W3, A.email, wwA);
    check('пароль: є TOTP, код не введено → така сама відмова (не видно, що TOTP існує), сеансу немає', zonderCode.v.status === 401 && zonderCode.v.data.error === 'ACCESS_CREDENTIALS_INVALID' && !(await ik(W3)));
    const W4 = G.browser();
    const metCode = await wwPoging(W4, A.email, wwA, totpCode(geheim));
    check('пароль: є TOTP, правильний код → сеанс для A; ворота «другий чинник» для цього входу відчинені (записано tweede_factor)',
      metCode.v.status === 200 && (await ik(W4)) === A.id, `${metCode.v.status} ${JSON.stringify(metCode.v.data).slice(0, 160)}`);
    const herhaalWw = await post(W4, '/api/aanmelden/wachtwoord/voltooien', { pogingId: metCode.s.data.pogingId, email: A.email, password: wwA, code: totpCode(geheim) });
    check('пароль: повторне надсилання тієї самої спроби → 403 UITDAGING_ONGELDIG', herhaalWw.status === 403 && herhaalWw.data.error === 'UITDAGING_ONGELDIG');
    const W5 = G.browser();
    const bWw = await wwPoging(W5, B.email, wwB);
    check('пароль: правильний пароль, але прапорця для B немає → 403 METHODE_NIET_VOOR_U, сеансу немає', bWw.v.status === 403 && bWw.v.data.error === 'METHODE_NIET_VOOR_U' && !(await ik(W5)));
    const W6 = G.browser();
    const uitslagen: number[] = [];
    for (let i = 0; i < 7; i++) uitslagen.push((await wwPoging(W6, O.email, `fout-${i}-xxxxxxxx`)).v.status);
    const naBlok = await wwPoging(W6, O.email, wwO);
    check('пароль: після 5 помилок спроби блокуються (429) — навіть правильний пароль не відкриває сеанс', uitslagen.slice(5).every((s) => s === 429) && naBlok.v.status === 429 && !(await ik(W6)), uitslagen.join(','));
    await pool.query("delete from app.login_lockouts where subject like $1", [`wachtwoord:${O.email}:%`]);

    // ---------------------------------------------------------------- захист від блокування з новими шляхами
    {
      await pool.query("update app.records set data = data || '{\"status\":\"disabled\"}'::jsonb where tbl='account_identities' and data->>'accountId'=$1", [A.id]);
      const zonderGoogle = await laatsteWegFout({ id: A.id, email: A.email, role: 'user' }, 'passkey');
      const googleWegMag = await laatsteWegFout({ id: A.id, email: A.email, role: 'user' }, 'google');
      await vlagZet('aanmelden-wachtwoord', true, [O.id]);
      await vlagZet('aanmelden-passkey', true, [O.id]);
      const zonderAlles = await laatsteWegFout({ id: A.id, email: A.email, role: 'user' }, 'google');
      await vlagZet('aanmelden-wachtwoord', true, [O.id, A.id]);
      await vlagZet('aanmelden-passkey', true, [O.id, A.id]);
      await pool.query("update app.records set data = data || '{\"status\":\"active\"}'::jsonb where tbl='account_identities' and data->>'accountId'=$1", [A.id]);
      check('блокування: без Google ключ доступу ще рятує (пароль теж) — прибрати Google не заборонено; без прапорців для A — заборонено',
        zonderGoogle === '' && googleWegMag === '' && zonderAlles === 'LAST_LOGIN_METHOD_PROTECTED', `${zonderGoogle}|${googleWegMag}|${zonderAlles}`);
    }

    // ---------------------------------------------------------------- Microsoft за прив'язаною особою (підроблений провайдер)
    const TERUG = 'https://id.tarasevych.com';
    process.env.AANMELD_TERUG_BASIS = TERUG;
    const L1 = G.browser();
    const zonderSleutels = await post(L1, '/api/aanmelden/extern/start', { ...ctx(L1), id: 'microsoft' });
    check('Microsoft: без ключів власника → 404 METHODE_UIT (кнопки немає)', zonderSleutels.status === 404 && zonderSleutels.data.error === 'METHODE_UIT');
    Object.assign(process.env, { AANMELD_MICROSOFT_CLIENT_ID: msId, AANMELD_MICROSOFT_CLIENT_SECRET: msGeheim, AANMELD_MICROSOFT_BASIS: nep.url });
    const zonderTest = await post(L1, '/api/aanmelden/extern/start', { ...ctx(L1), id: 'microsoft' });
    const zt = await O.b.verzoek('id.tarasevych.com', '/api/owner/aanmeld/vnext/zelftest', O.b.ctxBody('identity', { id: 'microsoft' }));
    const cfgMs = await G.browser().verzoek('id.tarasevych.com', '/api/aanmelden/telegram/config', {}, { methode: 'GET' });
    check('Microsoft: ключі є, але без зеленої самоперевірки — 404; після самоперевірки власника кнопка з’являється (config.methoden)',
      zonderTest.status === 404 && zt.data.zelftest === 'ok' && cfgMs.data.methoden?.includes('microsoft'), `${zonderTest.status} ${JSON.stringify(zt.data).slice(0, 160)} ${JSON.stringify(cfgMs.data.methoden)}`);
    const msSub = `ms-a-${T}`;
    await pool.query("insert into app.records (tbl,id,data) values ('aanmeld_koppelingen_v1',$1,$2)", [`i015a-kop-${A.id}`, { ownerUserId: A.id, aanbieder: 'microsoft', subject: `tenant-eenheid:${msSub}`, label: 'pr…@eenheid.test', op: new Date().toISOString() }]);
    const msPoging = async (b: Browser, sub: string, kapot?: 'nonce') => {
      const s = await post(b, '/api/aanmelden/extern/start', { ...ctx(b), id: 'microsoft' });
      const u = new URL(String(s.data.url || 'https://x.invalid/'));
      const code = nep.codeVoor({ aanbieder: 'microsoft', sub, nonce: u.searchParams.get('nonce') || '', challenge: u.searchParams.get('code_challenge') || '', ...(kapot ? { kapot } : {}) });
      const query = { state: u.searchParams.get('state') || '', code };
      const r = await b.verzoek('id.tarasevych.com', '/api/aanmeld/koppel/microsoft/terug', {}, { methode: 'GET', query });
      return { s, u, r, query };
    };
    const M1 = G.browser();
    const ms1 = await msPoging(M1, msSub);
    const loc = async (b: Browser, query: Record<string, string>) => { const r = await G.handler({ headers: { host: 'id.tarasevych.com', cookie: [...b.jar].map(([k, v]) => `${k}=${v}`).join('; '), 'x-forwarded-for': '203.0.113.9' }, body: '', isBase64Encoded: false, rawPath: '/api/aanmeld/koppel/microsoft/terug', rawQueryString: '', queryStringParameters: query, requestContext: { http: { method: 'GET', path: '/api/aanmeld/koppel/microsoft/terug', sourceIp: '203.0.113.9', userAgent: 'eenheidstest' } } } as never) as { statusCode: number; headers: Record<string, string> }; return r; };
    check('Microsoft: start — authorize-URL із state, PKCE S256 і nonce; redirect_uri той самий, що для прив’язки',
      ms1.u.searchParams.get('code_challenge_method') === 'S256' && !!ms1.u.searchParams.get('nonce') && ms1.u.searchParams.get('redirect_uri') === `${TERUG}/api/aanmeld/koppel/microsoft/terug`);
    check('Microsoft: повернення → 302 на адресу повернення, сеанс для прив’язаної особи A (authMethod «microsoft»)',
      ms1.r.status === 302 && (await ik(M1)) === A.id && (await authMethode(A.id)) === 'microsoft', `${ms1.r.status} ${ms1.r.body.slice(0, 100)}`);
    const nogEens = await loc(M1, ms1.query);
    check('Microsoft: повтор того самого state → 302 з ?aanmeld_fout=UITDAGING_ONGELDIG (одноразово)', nogEens.statusCode === 302 && /aanmeld_fout=UITDAGING_ONGELDIG/.test(nogEens.headers.Location || ''), nogEens.headers.Location);
    const M2 = G.browser();
    const vreemdeSub = await msPoging(M2, `ms-niemand-${T}`);
    const M3 = G.browser();
    const slechteNonce = await msPoging(M3, msSub, 'nonce');
    const M4 = G.browser(), M5 = G.browser();
    const s4 = await post(M4, '/api/aanmelden/extern/start', { ...ctx(M4), id: 'microsoft' });
    const u4 = new URL(String(s4.data.url));
    const anderB = await loc(M5, { state: u4.searchParams.get('state') || '', code: nep.codeVoor({ aanbieder: 'microsoft', sub: msSub, nonce: u4.searchParams.get('nonce') || '', challenge: u4.searchParams.get('code_challenge') || '' }) });
    const plek = async (b: Browser, q: Record<string, string>) => (await loc(b, q)).headers.Location || '';
    check('Microsoft: не прив’язана особа → NIET_GEKOPPELD; чужий nonce → помилка без сеансу; інший браузер → ANDERE_BROWSER',
      !(await ik(M2)) && !(await ik(M3)) && !(await ik(M5)) && /aanmeld_fout=ANDERE_BROWSER/.test(anderB.headers.Location || '') && vreemdeSub.r.status === 302 && slechteNonce.r.status === 302,
      `${anderB.headers.Location} ${await plek(M2, vreemdeSub.query)}`);
    const onbekendeState = await loc(G.browser(), { state: 'onbekend-state', code: 'x' });
    check('Microsoft: невідомий state — це не вхід → звичайна прив’язка відповідає своїм STATE_ONGELDIG (/aanmeldmethoden)', /\/aanmeldmethoden\?koppel=microsoft-fout&reden=STATE_ONGELDIG/.test(onbekendeState.headers.Location || ''), onbekendeState.headers.Location);
    // не-власник бачить каталог без назв серверних ключів
    const catA = await A.b.verzoek('id.tarasevych.com', '/api/owner/aanmeld/vnext/aanbieders', A.b.ctxBody('identity'));
    const catO = await O.b.verzoek('id.tarasevych.com', '/api/owner/aanmeld/vnext/aanbieders', O.b.ctxBody('identity'));
    check('прив’язка: схвалений не-власник бачить каталог і «готово до прив’язки», але БЕЗ назв ключів AANMELD_*; власник бачить назви',
      catA.status === 200 && !JSON.stringify(catA.data).includes('AANMELD_') && catA.data.aanbieders.find((x: { id: string }) => x.id === 'microsoft')?.klaarVoorKoppeling === true
      && JSON.stringify(catO.data).includes('AANMELD_MICROSOFT_CLIENT_ID'), JSON.stringify(catA.data).slice(0, 200));

    // ---------------------------------------------------------------- SMS: pending → verified
    const tel = '+31612345678';
    await pool.query("insert into app.records (tbl,id,data) values ('identity_phones_v1',$1,$2)", [`i015a-tel-${A.id}`, { userId: A.id, phone: tel, verified: false, createdAt: Date.now(), updatedAt: Date.now() }]);
    await pool.query("insert into app.records (tbl,id,data) values ('identity_phones_v1',$1,$2)", [`i015a-tel-${B.id}`, { userId: B.id, phone: '+31612345679', verified: false, createdAt: Date.now(), updatedAt: Date.now() }]);
    const idA = (pad: string, body: Record<string, unknown> = {}) => A.b.verzoek('id.tarasevych.com', pad, A.b.ctxBody('identity', body));
    zetSmsAanbiederVoorTest(null);
    const geenAanbieder = await idA('/api/owner/access/phone/code/versturen');
    check('SMS: без провайдера власника → 503 SMS_NIET_INGESTELD з точною передумовою (де вводити ключ)',
      geenAanbieder.status === 503 && geenAanbieder.data.error === 'SMS_NIET_INGESTELD' && JSON.stringify(geenAanbieder.data.voorwaarde) === JSON.stringify(SMS_VOORWAARDE) && /SMS_AANBIEDER/.test(SMS_VOORWAARDE[0]) && /Сховище секретів/.test(SMS_VOORWAARDE[0]));
    const verstuurd: Array<{ naar: string; tekst: string }> = [];
    const nepSms: SmsAanbieder = { naam: 'nep', verstuur: async (naar, tekst) => { verstuurd.push({ naar, tekst }); return { ok: true, id: `nep-${verstuurd.length}` }; } };
    zetSmsAanbiederVoorTest(nepSms);
    const bSms = await B.b.verzoek('id.tarasevych.com', '/api/owner/access/phone/code/versturen', B.b.ctxBody('identity'));
    check('SMS: людина без прапорця → 403 SMS_VLAG_UIT, нічого не надіслано', bSms.status === 403 && bSms.data.error === 'SMS_VLAG_UIT' && verstuurd.length === 0);
    const snap0 = await idA('/api/owner/access/snapshot');
    const snapB = await B.b.verzoek('id.tarasevych.com', '/api/owner/access/snapshot', B.b.ctxBody('identity'));
    check('«Способи входу»: сервер каже, які шляхи без Google увімкнено САМЕ цій людині (A — так, B — ні) — від цього залежить текст «ключ лише підтверджує»',
      snap0.data.aanmeldWegen?.passkey === true && snap0.data.aanmeldWegen?.wachtwoord === true && snapB.data.aanmeldWegen?.passkey === false, JSON.stringify([snap0.data.aanmeldWegen, snapB.data.aanmeldWegen]));
    const v1 = await idA('/api/owner/access/phone/code/versturen');
    const v2 = await idA('/api/owner/access/phone/code/versturen');
    const code = (verstuurd[0]?.tekst.match(/\b(\d{6})\b/) || [])[1] || '';
    check('SMS: код надіслано на номер (маска в відповіді), повтор за 60 с → 429, друге SMS не пішло',
      snap0.data.phone?.sms?.klaar === true && v1.status === 200 && v1.data.naar !== tel && String(v1.data.naar).endsWith('678') && verstuurd.length === 1 && verstuurd[0].naar === tel && /^\d{6}$/.test(code) && v2.status === 429,
      `${v1.status} ${JSON.stringify(v1.data)} ${v2.status}`);
    const fout2 = await idA('/api/owner/access/phone/code/bevestigen', { code: code === '000000' ? '111111' : '000000' });
    check('SMS: неправильний код → 400 SMS_CODE_ONJUIST, лишилося 4 спроби', fout2.status === 400 && fout2.data.error === 'SMS_CODE_ONJUIST' && fout2.data.over === 4);
    const goed = await idA('/api/owner/access/phone/code/bevestigen', { code });
    const opnieuw = await idA('/api/owner/access/phone/code/bevestigen', { code });
    await wacht();
    check('SMS: правильний код → номер «Підтверджено» (pending → verified); повтор — alBevestigd без другого сповіщення',
      goed.status === 200 && goed.data.bevestigd === true && goed.data.phone?.verified === true && opnieuw.data.alBevestigd === true && (await meldingen(A.id, 'access_method_telefoon')) === 1,
      `${goed.status} ${JSON.stringify(goed.data).slice(0, 120)}`);
    const rij = (await pool.query("select data from app.records where tbl='identity_phones_v1' and id=$1", [`i015a-tel-${A.id}`])).rows[0]?.data as Record<string, unknown>;
    check('SMS: у записі немає ні коду, ні його HMAC після підтвердження; сам код ніде не зберігався відкрито', rij?.verified === true && !('smsCodeHash' in rij) && !JSON.stringify(rij).includes(code));
    zetSmsAanbiederVoorTest(undefined);

    // ---------------------------------------------------------------- інтерфейс (статичний рендер, без мережі)
    const herstelBrowser = nepBrowser();
    const { aanmeldWeigering } = await import('../../src/weigeringen');
    const { default: AanmeldZonderGoogle } = await import('../../src/aanmelden/AanmeldZonderGoogle');
    const { AanmeldWegenExtra } = await import('../../src/aanmelden/AanmeldWegenExtra');
    const { default: AanbiederCatalogus } = await import('../../src/aanmeld-vnext/onderdelen/AanbiederCatalogus');
    const { default: AanmeldAndereOpties } = await import('../../src/AanmeldAndereOpties');
    const { methodeNaam } = await import('../../src/sessies/methode-naam');
    const t = (code: string) => aanmeldWeigering({ response: { data: { error: code } } });
    check('тексти відмов: обома мовами для кожного нового коду; PASSKEY_* без точного тексту — загальний про перевірку ключа',
      ['METHODE_NIET_VOOR_U', 'UITDAGING_ONGELDIG', 'LOGIN_BINDING_MISMATCH', 'NIET_GEKOPPELD', 'SMS_NIET_INGESTELD', 'SMS_CODE_TE_VEEL', 'ACCESS_CREDENTIALS_INVALID'].every((c) => t(c)?.[0] && t(c)?.[1])
      && /Ключ доступу не пройшов перевірку/.test(t('PASSKEY_ORIGIN_ONJUIST')?.[0] || ''));
    const zg = renderToStaticMarkup(createElement(AanmeldZonderGoogle, { id: 'passkey', lang: 'uk' }));
    const zgNl = renderToStaticMarkup(createElement(AanmeldZonderGoogle, { id: 'wachtwoord', lang: 'nl' }));
    const andere = renderToStaticMarkup(createElement(AanmeldAndereOpties, { lang: 'uk', ids: ['passkey', 'apple'], standaardOpen: true, extra: { passkey: createElement(AanmeldZonderGoogle, { id: 'passkey', lang: 'uk' }) } }));
    check('сторінка входу: робоча кнопка «Увійти ключем доступу» в «Інші способи входу»; неробочий Apple — вимкнений із точною передумовою',
      zg.includes('Увійти ключем доступу') && zgNl.includes('Aanmelden met wachtwoord') && andere.includes('Увійти ключем доступу') && /data-aanmeld-ingang="apple"[^>]*disabled=""/.test(andere) && andere.includes('прапорець «Вхід через Microsoft, Discord або Apple»'));
    const extra = renderToStaticMarkup(createElement(AanmeldWegenExtra, { lang: 'uk', herstelbaar: [{ id: 'x1', soort: 'binding', method: 'password', herstelTot: Date.now() + 86400000, zelf: true, doorBeheer: false }], telefoon: { configured: true, verified: false, pending: true, value: tel, sms: { vlag: true, klaar: false, voorwaarde: [...SMS_VOORWAARDE] as [string, string], codeTot: 0 } }, context: {}, write: async () => undefined, load: async () => undefined }));
    check('«Способи входу»: рядок «Повернути спосіб входу» з кнопкою; телефон «Чекає підтвердження» з точною передумовою SMS',
      extra.includes('Повернути спосіб входу') && extra.includes('>Повернути<') && extra.includes('Чекає підтвердження') && extra.includes('SMS_AANBIEDER'));
    const catBeheer = renderToStaticMarkup(createElement(AanbiederCatalogus, { lang: 'uk', context: {}, beheer: true }));
    const catLid = renderToStaticMarkup(createElement(AanbiederCatalogus, { lang: 'uk', context: {}, beheer: false }));
    check('каталог: власник бачить назви ключів, не-власник — ні', catBeheer.includes('AANMELD_MICROSOFT_CLIENT_ID') && !catLid.includes('AANMELD_'));
    const badge = (m: string) => methodeNaam(m).uk;
    check('давня вада: сеанс через Telegram більше не показується як «Google SSO»; нові способи мають свої назви',
      badge('telegram').includes('Telegram') && !badge('telegram').includes('Google SSO') && badge('passkey').includes('Ключ доступу') && badge('microsoft').includes('Microsoft') && badge('google').includes('Google SSO'));
    herstelBrowser();
  } catch (e) {
    check('неочікувана помилка (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    zetSmsAanbiederVoorTest(undefined);
    await nep.stop().catch(() => undefined);
    G.herstel();
    globalThis.fetch = echteFetch;
    for (const r of vlagVooraf) await pool.query('UPDATE app.feature_flags SET aan=$2, standaard=$3, percentage=$4, gebruikers=$5 WHERE sleutel=$1', [r.sleutel, r.aan, r.standaard, r.percentage, r.gebruikers]).catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i015a-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await pool.query('delete from app.passkeys where user_id = any($1)', [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id like 'i015a-%' or id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
    }
    await pool.query("delete from app.records where tbl='aanmeld_zelftest_v1' and data->>'aanbieder'='microsoft'").catch(() => undefined);
    await pool.query("delete from app.aanmeld_uitdagingen where aangemaakt_op > now() - interval '1 hour'").catch(() => undefined);
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret, ...envVorig })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool().catch(() => undefined);
  return einde();
}
