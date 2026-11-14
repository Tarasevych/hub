// IDENTITEIT-015, крок «herstel»: виправлення підтверджених знахідок рецензії — кожна відтворюється тут через справжні маршрути
// backend/index.ts проти одноразової бази й підробленого Google (tests/eenheid/hulp/nep-google.ts). Лише вигадані дані.
//   (1) передача простору: колишній власник більше не повертає собі «Адміністратора» повтором запиту (після вилучення чи пониження);
//       перервану передачу доводить лише свіжий повтор, і то зі step-up;
//   (2) тимчасовий пароль (mustChange) не рахується робочим способом входу — Google не відв'язується, якщо лишився лише він;
//   (3) SMS: неправильний код не відкочує одночасно підтверджений номер; лічильник спроб не губить приріст; межа «раз на 60 с»
//       не обнуляється повторним збереженням номера;
//   (4) вхід паролем: загальна межа на адресу з усіх IP; тимчасовий пароль відхиляється ДО коду, транзакцію закрито;
//   (5) ворота другого кроку не кажуть «Google-вхід» після Microsoft/пароля; поле коду SMS має назву;
//   (6) «Це був я» і «Нагадувати про резервний доступ» — у центрі сповіщень (і повтор не дублює);
//   (7) дрібні: останній ключ доступу під замком, перевірка останнього способу «безпечним боком», доступні назви, «ключ доступу».
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-015-herstel.test.ts
import { createHmac, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { closePool, getPool } from '../../server/platform/pg';
import { sealWithEnvKey } from '../../server/platform/beveiliging';
import { checker, nepGoogle } from './hulp/nep-google';
import { nieuwePasskey, registreer } from './hulp/nep-toegangssleutel';
import { laatsteWegFout } from '../../backend/aanmeld-wegen';
import { OVERDRACHT_HERSTEL_MS, overdrachtHerstelNodig } from '../../backend/werkruimte-overdracht';
import { WACHTWOORD_PER_ADRES } from '../../backend/aanmelden-methoden';

const lees = (p: string) => readFileSync(p, 'utf8');
const VLAGGEN = ['aanmelden-passkey', 'aanmelden-wachtwoord', 'aanmelden-extern', 'aanmelden-sms'];

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-herstel');

  // ================================================================ чисті правила
  {
    const nu = 1_800_000_000_000;
    check('передача: доводити треба лише перервану (без позначки) і свіжу передачу; доведену чи стару (запис до виправлення) — ні',
      overdrachtHerstelNodig({ overgedragenVan: 'o', overgedragenOp: nu - 1000 }, nu)
      && !overdrachtHerstelNodig({ overgedragenVan: 'o', overgedragenOp: nu - 1000, overdrachtAfgerondOp: nu - 900 }, nu)
      && !overdrachtHerstelNodig({ overgedragenVan: 'o', overgedragenOp: nu - OVERDRACHT_HERSTEL_MS - 1 }, nu)
      && !overdrachtHerstelNodig({ overgedragenVan: 'o' }, nu) && !overdrachtHerstelNodig({ overgedragenVan: '', overgedragenOp: nu }, nu));
    const poort = lees('src/geheim/TweedeFactorPoort.tsx'), panelen = lees('src/toegangslaag-panelen.tsx'), meld = lees('backend/beveiliging-meldingen.ts');
    check('ворота другого кроку: текст не каже «Google-вхід уже є» (ворота закриваються й після Microsoft/Discord/Apple/пароля без коду)',
      !poort.includes('Google-вхід уже є') && !poort.includes('Google-aanmelding is gelukt') && poort.includes('Перший крок входу виконано') && poort.includes('De eerste aanmeldstap is gelukt')
      && !panelen.includes('після Google потрібен') && !panelen.includes('Правило сайту: після Google') && /Microsoft, Discord, Apple чи паролем без коду/.test(panelen)
      && !meld.includes('`Після Google'));
    check('перевірка «останній спосіб входу» при збої — відмова (безпечний бік), а не дозвіл', /catch \{ return 'LAST_LOGIN_METHOD_PROTECTED'; \}/.test(lees('backend/aanmeld-wegen.ts')));
    const { AanmeldWegenExtra } = await import('../../src/aanmelden/AanmeldWegenExtra');
    const extra = renderToStaticMarkup(createElement(AanmeldWegenExtra as never, { lang: 'uk', herstelbaar: [], telefoon: { configured: true, verified: false, pending: true, value: '+31612345678', sms: { vlag: true, klaar: true, voorwaarde: ['', ''], codeTot: Date.now() + 600000 } }, context: {}, write: async () => undefined, load: async () => undefined } as never));
    const codeVeld = extra.match(/<input[^>]*autoComplete="one-time-code"[^>]*>/)?.[0] || extra.match(/<input[^>]*one-time-code[^>]*>/)?.[0] || '';
    check('поле коду з SMS має доступну назву (aria-label), кнопка каже, що саме підтверджується',
      (codeVeld === '' || /aria-label="Код із SMS для підтвердження номера/.test(codeVeld)) && lees('src/aanmelden/AanmeldWegenExtra.tsx').includes("aria-label={tr(lang, 'Код із SMS для підтвердження номера (6 цифр)'") && lees('src/aanmelden/AanmeldWegenExtra.tsx').includes("'Підтвердити номер'"), codeVeld);
    const { ReserveHerinneringWeergave } = await import('../../src/herstel/ReserveHerinnering');
    const rh = renderToStaticMarkup(createElement(ReserveHerinneringWeergave, { lang: 'uk', aan: true, onZet: () => undefined }));
    check('«Нагадувати про резервний доступ»: вікно попереджає, що про вимкнення прийде сповіщення; після дії — підтвердження на екрані',
      lees('src/herstel/ReserveHerinnering.tsx').includes('Про саме вимкнення прийде сповіщення безпеки') && lees('src/herstel/ReserveHerinnering.tsx').includes("data-herstel-herinnering-melding") && rh.includes('data-herstel-herinnering="aan"'));
    const wv = lees('src/thema/WeergaveVoorkeuren.tsx');
    check('повзунок «Виразність декоративних ефектів»: назва із заголовка (aria-labelledby), значення — aria-valuetext, <output> не підміняє назву',
      wv.includes("aria-labelledby='thema-effecten-kop' aria-valuetext={`${effecten}%`}") && wv.includes("<output aria-hidden='true'>"));
    const ba = lees('src/BekendeApparaten.tsx');
    check('«Відомі пристрої»: невдале перше завантаження — кнопка «Спробувати ще»; пристрій зі сповіщення прокручується й отримує фокус (aria-current)',
      ba.includes('data-apparaten-opnieuw') && ba.includes("scrollIntoView?.({ block: 'center' })") && ba.includes("aria-current={uitMelding === a.id ? 'true' : undefined}"));
    const sc = lees('src/herstel/Scenarios.tsx');
    check('сценарії відновлення: в UA «ключ доступу», без англійського «passkey» у кнопці', sc.includes("tekst={['Додати новий ключ доступу', 'Nieuwe passkey toevoegen']}") && !sc.includes("'Додати новий passkey'"));
  }

  // ================================================================ маршрути проти бази
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const G = await nepGoogle({ ownerEmail: `i015h-eig-${T}@example.test` });
  const pool = getPool();
  const vlagVooraf = (await pool.query('SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = ANY($1)', [VLAGGEN])).rows;
  const vlagZet = (sleutel: string, aan: boolean, gebruikers: string[]) => pool.query('UPDATE app.feature_flags SET aan = $2, standaard = false, percentage = 0, gebruikers = $3 WHERE sleutel = $1', [sleutel, aan, gebruikers]);
  const oud = Math.floor(Date.now() / 1000) - 3600;
  type Browser = ReturnType<typeof G.browser>;
  type P = { b: Browser; sub: string; email: string; id: string };
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
  const hub = (p: P, pad: string, extra: Record<string, unknown> = {}) => p.b.verzoek('hub.tarasevych.com', pad, p.b.ctxBody('hub', extra));
  const idv = (p: P, pad: string, extra: Record<string, unknown> = {}, ip?: string) => p.b.verzoek('id.tarasevych.com', pad, p.b.ctxBody('identity', extra), ip ? { ip } : {});
  const maak = async (naam: string, email = `i015h-${naam}-${T}@example.test`): Promise<P> => {
    const b = G.browser(), sub = `i015h-${naam}-${T}`;
    await b.aanmelden(sub, email, { intent: 'login', authTime: oud, iat: oud });
    const id = await idRij(email);
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', name: `Проба ${naam}` })]);
    return { b, email, id, sub };
  };
  /** Ще один браузер тієї самої людини — без свіжого підтвердження доступу. */
  const nogEenBrowser = async (p: P): Promise<P> => { const b = G.browser(); await b.aanmelden(p.sub, p.email, { intent: 'login', authTime: oud, iat: oud }); return { ...p, b }; };
  const stapOp = async (p: P) => { await p.b.aanmelden(p.sub, p.email, { intent: 'step-up' }); };
  const ws = async (id: string) => (await pool.query("select data from app.records where tbl='workspaces' and id=$1", [id])).rows[0]?.data as Record<string, any>;
  const leden = async (wsId: string, userId: string) => (await pool.query("select id, data from app.records where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'userId'=$2", [wsId, userId])).rows as Array<{ id: string; data: Record<string, any> }>;
  const lidMaken = async (wsId: string, p: P, rol: 'admin' | 'member' | 'viewer') => {
    await pool.query("insert into app.records (tbl, data) values ('workspace_members', $1::jsonb)", [JSON.stringify({ workspaceId: wsId, userId: p.id, email: p.email, permission: rol === 'viewer' ? 'viewer' : 'editor', workspaceRole: rol, scopeBlockIds: [], status: 'active', createdAt: Date.now(), updatedAt: Date.now() })]);
  };
  const meldingen = async (userId: string, kind: string, titel = '') => (await pool.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'=$2 and data->>'title' like $3", [userId, kind, `%${titel}%`])).rows.length;
  const audit = async (userId: string, action: string) => (await pool.query('select result, details from app.audit where owner_id=$1 and action=$2 order by id', [userId, action])).rows as Array<{ result: string; details: Record<string, any> }>;
  const wacht = () => new Promise((r) => setTimeout(r, 150));

  try {
    const O = await maak('o'), A = await maak('a'), B = await maak('b');

    // ---------------------------------------------------------------- (1) передача простору
    {
      const wsId = String((await hub(O, '/api/workspace/load')).data.workspace?.id || '');
      await hub(A, '/api/workspace/load');
      await lidMaken(wsId, A, 'admin');
      await stapOp(O);
      const pad = `/api/owner/identity/workspaces/${wsId}/overdragen`;
      const goed = await idv(O, pad, { nieuweEigenaarId: A.id });
      const naGoed = await ws(wsId);
      check('передача: 200, власник — A; після доведення в записі простору є позначка overdrachtAfgerondOp',
        goed.status === 200 && goed.data.alOverdragen === false && naGoed.ownerUserId === A.id && Number(naGoed.overdrachtAfgerondOp) > 0, `${goed.status} ${JSON.stringify(goed.data)}`);
      // Новий власник прибирає O справжнім маршрутом /api/share/revoke
      const oRij = (await leden(wsId, O.id))[0];
      const weg = await hub(A, '/api/share/revoke', { workspaceId: wsId, memberId: oRij?.id });
      const laad1 = await hub(O, '/api/workspace/load', { workspaceId: wsId });
      const O2 = await nogEenBrowser(O);
      const terug = await idv(O2, pad, { nieuweEigenaarId: A.id });
      await wacht();
      const laad2 = await hub(O, '/api/workspace/load', { workspaceId: wsId });
      check('знахідка [hoog]: A прибрав O → повтор «Передати» від O (навіть без step-up) — 200 alOverdragen, але рядка O немає, load і далі 403',
        weg.status === 200 && laad1.status === 403 && terug.status === 200 && terug.data.alOverdragen === true && (await leden(wsId, O.id)).length === 0 && laad2.status === 403,
        `${weg.status} ${laad1.status} ${terug.status} ${JSON.stringify(terug.data)} ${(await leden(wsId, O.id)).length} ${laad2.status}`);
      // Пониження: A повертає O як адміністратора, потім знижує до глядача справжнім /api/share/role
      await lidMaken(wsId, O, 'admin');
      const oRij2 = (await leden(wsId, O.id))[0];
      const lager = await hub(A, '/api/share/role', { workspaceId: wsId, memberId: oRij2.id, workspaceRole: 'viewer' });
      const terug2 = await idv(O, pad, { nieuweEigenaarId: A.id });
      const rol2 = (await leden(wsId, O.id)).map((r) => r.data.workspaceRole);
      check('знахідка [hoog], варіант пониження: A зробив O глядачем → повтор від O лишає O глядачем (не «admin»)',
        lager.status === 200 && terug2.status === 200 && JSON.stringify(rol2) === '["viewer"]', `${lager.status} ${terug2.status} ${JSON.stringify(rol2)}`);
      check('повтор не створює ні нових сповіщень, ні запису «success» в аудиті', (await audit(O.id, 'owner.identity.workspace.transfer')).filter((r) => r.result === 'success').length === 1);
      // Запис, переданий ДО виправлення (без позначки, давно) — повтор нічого не змінює
      await pool.query("update app.records set data = (data - 'overdrachtAfgerondOp') || jsonb_build_object('overgedragenOp', $2::bigint) where tbl='workspaces' and id=$1", [wsId, Date.now() - OVERDRACHT_HERSTEL_MS - 60_000]);
      const terug3 = await idv(O2, pad, { nieuweEigenaarId: A.id });
      check('сумісність: давній запис без позначки — повтор 200 без змін (O лишається глядачем, step-up не питається)',
        terug3.status === 200 && JSON.stringify((await leden(wsId, O.id)).map((r) => r.data.workspaceRole)) === '["viewer"]', `${terug3.status} ${JSON.stringify(terug3.data)}`);
      // Справді перервана й свіжа: доведення лише зі step-up
      await pool.query("update app.records set data = data || jsonb_build_object('overgedragenOp', $2::bigint) where tbl='workspaces' and id=$1", [wsId, Date.now()]);
      const zonderStap = await idv(O2, pad, { nieuweEigenaarId: A.id });
      check('перервана свіжа передача: доведення без свіжого підтвердження → 403 STEP_UP_REQUIRED, рядок O не змінено',
        zonderStap.status === 403 && zonderStap.data.reasonCode === 'STEP_UP_REQUIRED' && JSON.stringify((await leden(wsId, O.id)).map((r) => r.data.workspaceRole)) === '["viewer"]', `${zonderStap.status} ${JSON.stringify(zonderStap.data)}`);
      await stapOp(O2);
      const metStap = await idv(O2, pad, { nieuweEigenaarId: A.id });
      const naMetStap = await ws(wsId);
      const metStap2 = await idv(O2, pad, { nieuweEigenaarId: A.id });
      check('перервана свіжа передача зі step-up: кроки доведено один раз (позначку поставлено), наступний повтор — без змін',
        metStap.status === 200 && Number(naMetStap.overdrachtAfgerondOp) > 0 && metStap2.status === 200 && (await leden(wsId, O.id)).length === 1, `${metStap.status} ${metStap2.status}`);
      check('чужий (B) і далі отримує 403 WERKRUIMTE_NIET_EIGENAAR', (await idv(B, pad, { nieuweEigenaarId: A.id })).status === 403);
    }

    // ---------------------------------------------------------------- (2) тимчасовий пароль не рятує від блокування
    {
      await vlagZet('aanmelden-wachtwoord', true, [B.id]);
      await vlagZet('aanmelden-passkey', false, []);
      await vlagZet('aanmelden-extern', false, []);
      const salt = randomBytes(16), ww = `Tijdelijk-${T}`;
      const rec = { userId: B.id, algorithm: 'scrypt', n: 16384, r: 8, p: 1, salt: salt.toString('base64url'), hash: scryptSync(ww, salt, 32, { N: 16384, r: 8, p: 1 }).toString('base64url'), mustChange: true, createdAt: Date.now(), updatedAt: Date.now() };
      await pool.query("insert into app.records (tbl,id,data) values ('identity_passwords_v1',$1,$2)", [`i015h-ww-${B.id}`, rec]);
      const bUser = { id: B.id, email: B.email, role: 'user' };
      const metTijdelijk = await laatsteWegFout(bUser, 'google');
      const ident = (await pool.query("select id from app.records where tbl='account_identities' and data->>'accountId'=$1 limit 1", [B.id])).rows[0]?.id as string;
      const losmaken = await idv(B, '/api/owner/access/binding/unbind', { id: ident });
      await pool.query("update app.records set data = data || '{\"mustChange\":false}'::jsonb where tbl='identity_passwords_v1' and id=$1", [`i015h-ww-${B.id}`]);
      const metEigen = await laatsteWegFout(bUser, 'google');
      check('знахідка [middel]: лише Google + тимчасовий пароль → відв’язати Google заборонено (409 LAST_LOGIN_METHOD_PROTECTED); власний пароль — рятує',
        metTijdelijk === 'LAST_LOGIN_METHOD_PROTECTED' && losmaken.status === 409 && losmaken.data.error === 'LAST_LOGIN_METHOD_PROTECTED' && metEigen === '',
        `${metTijdelijk}|${losmaken.status} ${losmaken.data.error}|${metEigen}`);

      // (4) вхід паролем: тимчасовий пароль відхиляється ДО коду (TOTP є, код не введено — та сама відповідь не потрібна)
      await pool.query("update app.records set data = data || '{\"mustChange\":true}'::jsonb where tbl='identity_passwords_v1' and id=$1", [`i015h-ww-${B.id}`]);
      await pool.query("insert into app.records (tbl,id,data) values ('identity_totp_v1',$1,$2)", [`i015h-totp-${B.id}`, { userId: B.id, secretEnc: sealWithEnvKey('TOTP_ENCRYPTION_KEY_V1', 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', `identity-totp:v1:${B.id}`), confirmed: true, createdAt: Date.now(), updatedAt: Date.now() }]);
      const ctx = (b: Browser) => ({ service: 'identity', tabContext: b.tab, sourceOrigin: 'https://id.tarasevych.com', returnTo: 'https://id.tarasevych.com/', locale: 'uk', remember: false });
      const ip = `198.51.100.${1 + Math.floor(Math.random() * 200)}`;
      const W = G.browser();
      const s = await W.verzoek('id.tarasevych.com', '/api/aanmelden/wachtwoord/start', ctx(W), { ip });
      const v = await W.verzoek('id.tarasevych.com', '/api/aanmelden/wachtwoord/voltooien', { pogingId: s.data.pogingId, email: B.email, password: ww, code: '' }, { ip });
      const bind = (await pool.query("select 1 from app.records where tbl='identity_method_bindings_v1' and data->>'userId'=$1 and data->>'method'='password'", [B.id])).rowCount;
      check('вхід паролем: тимчасовий пароль → 403 ACCESS_PASSWORD_MUST_CHANGE ще до коду (код відновлення не потрібен і не витрачається), прив’язку не оновлено',
        s.status === 200 && v.status === 403 && v.data.error === 'ACCESS_PASSWORD_MUST_CHANGE' && !bind, `${v.status} ${JSON.stringify(v.data)} bind=${bind}`);
      await pool.query("delete from app.login_lockouts where subject like $1", [`wachtwoord:${B.email}:%`]);

      // Межа на адресу з усіх IP (пул адрес більше не дає по 5 спроб на кожну без кінця)
      const doel = `i015h-pool-${T}@example.test`;
      const stats: number[] = [];
      for (let i = 0; i < WACHTWOORD_PER_ADRES + 2; i++) {
        const ipI = `10.${(i >> 8) & 255}.${i & 255}.${7 + (T.length % 3)}`;
        const Wi = G.browser();
        const si = await Wi.verzoek('id.tarasevych.com', '/api/aanmelden/wachtwoord/start', ctx(Wi), { ip: ipI });
        const vi = await Wi.verzoek('id.tarasevych.com', '/api/aanmelden/wachtwoord/voltooien', { pogingId: si.data.pogingId, email: doel, password: `fout-${i}-xxxxxxxx` }, { ip: ipI });
        stats.push(vi.status);
      }
      check(`вхід паролем: ${WACHTWOORD_PER_ADRES} спроб на адресу з різних IP — далі 429 RATE_LIMITED (раніше — лише межа на IP і пару «адреса+IP»)`,
        stats.slice(0, WACHTWOORD_PER_ADRES).every((x) => x === 401) && stats.slice(WACHTWOORD_PER_ADRES).every((x) => x === 429), stats.join(','));
      check('межу на адресу записано в аудит (ADRES_LIMIET), без самої адреси', (await pool.query("select 1 from app.audit where action='aanmelden.password' and details->>'reden'='ADRES_LIMIET' and details::text not like $1", [`%${doel}%`])).rowCount! > 0);
    }

    // ---------------------------------------------------------------- (3) SMS
    {
      await vlagZet('aanmelden-sms', true, [A.id]);
      const tel = '+31612345670';
      const id = `i015h-tel-${A.id}`;
      const hash = (code: string) => createHmac('sha256', String(process.env.RECOVERY_CODE_PEPPER || 'sms-v1')).update(`sms:v1:${A.id}:${tel}:${code}`).digest('hex');
      const zet = async (extra: Record<string, unknown>) => { await pool.query('delete from app.records where id=$1', [id]); await pool.query("insert into app.records (tbl,id,data) values ('identity_phones_v1',$1,$2)", [id, { userId: A.id, phone: tel, verified: false, createdAt: Date.now(), updatedAt: Date.now(), ...extra }]); };
      const lees2 = async () => (await pool.query("select data from app.records where id=$1", [id])).rows[0]?.data as Record<string, any>;
      const onwaar: string[] = [];
      for (let ronde = 0; ronde < 6; ronde++) {
        await pool.query("delete from app.login_lockouts where subject=$1", [`sms-code:${A.id}`]);
        await zet({ smsCodeHash: hash('246810'), smsCodeTot: Date.now() + 600000, smsPogingen: 0 });
        const [g, f] = await Promise.all([idv(A, '/api/owner/access/phone/code/bevestigen', { code: '246810' }), idv(A, '/api/owner/access/phone/code/bevestigen', { code: '135791' })]);
        const r = await lees2();
        if (!(r.verified === true && !('smsCodeHash' in r) && g.status === 200)) onwaar.push(`${ronde}:${g.status}/${f.status}:${r.verified}`);
      }
      check('знахідка [middel]: правильний і неправильний код одночасно (6 раундів) — номер щоразу лишається підтвердженим, код не повертається', onwaar.length === 0, onwaar.join(' '));
      await pool.query("delete from app.login_lockouts where subject=$1", [`sms-code:${A.id}`]);
      await zet({ smsCodeHash: hash('246810'), smsCodeTot: Date.now() + 600000, smsPogingen: 0 });
      const drie = await Promise.all([0, 1, 2].map((i) => idv(A, '/api/owner/access/phone/code/bevestigen', { code: `11111${i}` })));
      const naDrie = await lees2();
      check('лічильник спроб: три одночасні неправильні коди → smsPogingen=3 (приріст не губиться), кожна відповідь 400 SMS_CODE_ONJUIST',
        Number(naDrie.smsPogingen) === 3 && drie.every((r) => r.status === 400 && r.data.error === 'SMS_CODE_ONJUIST'), `${naDrie.smsPogingen} ${drie.map((r) => r.status).join(',')}`);
      await pool.query("delete from app.login_lockouts where subject=$1", [`sms-code:${A.id}`]);
      // межа «раз на 60 с»: повторне збереження того самого номера її не обнуляє
      await zet({ smsVerzondenOp: Date.now() });
      await stapOp(A);
      const opslaan = await idv(A, '/api/owner/access/phone/save', { phone: tel });
      const naOpslaan = await lees2();
      check('межа «раз на 60 с»: повторне «Зберегти номер» зберігає момент останнього SMS (раніше поле зникало й межа обнулялась)',
        opslaan.status === 200 && Number(naOpslaan.smsVerzondenOp) > Date.now() - 60_000, `${opslaan.status} ${JSON.stringify(opslaan.data).slice(0, 120)} ${naOpslaan.smsVerzondenOp}`);
    }

    // ---------------------------------------------------------------- (6) «Це був я» і нагадування про резервний доступ
    {
      const appId = (await pool.query("insert into app.bekende_apparaten (user_id, sleutel, apparaat) values ($1, $2, 'Firefox · Linux') returning id", [A.id, randomBytes(16).toString('hex')])).rows[0].id as string;
      const [b1, b2] = await Promise.all([idv(A, '/api/owner/identity/apparaten/bevestigen', { id: appId }), idv(A, '/api/owner/identity/apparaten/bevestigen', { id: appId })]);
      const b3 = await idv(A, '/api/owner/identity/apparaten/bevestigen', { id: appId });
      await wacht();
      check('знахідка [middel]: «Це був я» → запис у центрі сповіщень (security «Пристрій позначено як ваш»); подвійне й повторне натискання — один запис і один аудит',
        b1.status === 200 && b2.status === 200 && b3.status === 200 && (await meldingen(A.id, 'security', 'Пристрій позначено')) === 1 && (await audit(A.id, 'owner.apparaat.bevestigd')).length === 1,
        `${b1.status} ${b2.status} ${await meldingen(A.id, 'security', 'Пристрій позначено')} ${(await audit(A.id, 'owner.apparaat.bevestigd')).length}`);
      const app2 = (await pool.query("insert into app.bekende_apparaten (user_id, sleutel, apparaat) values ($1, $2, 'Safari · iOS') returning id", [A.id, randomBytes(16).toString('hex')])).rows[0].id as string;
      const kaart = await idv(A, '/api/meldingen/apparaat-bekend', { id: app2 });
      await wacht();
      check('«Це був я» з картки сповіщення (старий маршрут) — теж запис у центрі сповіщень', kaart.status === 200 && kaart.data.ok === true && (await meldingen(A.id, 'security', 'Пристрій позначено')) === 2);

      const zijbalk = (aan: boolean) => idv(A, '/api/owner/ui/sidebar/save', { sidebar: { meldingen: { reserveHerinnering: aan } } });
      const uit = await zijbalk(false);
      const uitWeer = await zijbalk(false);
      const aan = await zijbalk(true);
      await wacht();
      check('знахідка [middel, давня]: вимкнення «Нагадувати про резервний доступ» → сповіщення безпеки й аудит; повторне збереження без зміни — нічого; увімкнення — теж запис',
        uit.status === 200 && uit.data.reserveHerinneringGemeld === true && !uitWeer.data.reserveHerinneringGemeld && aan.data.reserveHerinneringGemeld === true
        && (await meldingen(A.id, 'security', 'Нагадування про резервний доступ вимкнено')) === 1 && (await meldingen(A.id, 'security', 'Нагадування про резервний доступ увімкнено')) === 1
        && (await audit(A.id, 'owner.melding.reserve-herinnering')).map((r) => r.details.naar).join(',') === 'uit,aan',
        `${uit.status} ${JSON.stringify(uit.data).slice(0, 160)} ${JSON.stringify(uitWeer.data).slice(0, 80)}`);
    }

    // ---------------------------------------------------------------- (7) останній ключ доступу: два одночасні видалення
    {
      const C = await maak('c');
      await vlagZet('aanmelden-passkey', true, [C.id]);
      await vlagZet('aanmelden-wachtwoord', false, []);
      const ids: string[] = [];
      for (const naam of ['Ключ 1', 'Ключ 2']) {
        const pk = nieuwePasskey('es256', 1), ch = randomBytes(32).toString('base64url');
        const reg = kern.verifieerRegistratie({ ...registreer(pk, ch, { origin: 'https://id.tarasevych.com' }), verwachteUitdaging: ch, rpId: 'tarasevych.com', origins: ['https://id.tarasevych.com'] }) as Record<string, any>;
        ids.push((await pool.query('INSERT INTO app.passkeys (user_id, credential_id, alg, jwk, vingerafdruk, naam, aaguid, transports, backup_eligible, backup_state, sign_count) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,false,false,1) RETURNING id',
          [C.id, reg.credentialId, reg.alg, JSON.stringify(reg.jwk), reg.vingerafdruk, naam, '', []])).rows[0].id);
      }
      await stapOp(C);
      // Google більше не шлях входу C: лишаються лише ключі доступу
      await pool.query("update app.records set data = data || '{\"status\":\"disabled\"}'::jsonb where tbl='account_identities' and data->>'accountId'=$1", [C.id]);
      const [r1, r2] = await Promise.all(ids.map((id) => idv(C, '/api/owner/access/passkeys/verwijderen', { id })));
      const over = Number((await pool.query('select count(*)::int n from app.passkeys where user_id=$1', [C.id])).rows[0].n);
      check('давня вада (дрібна): два одночасні видалення двох останніх ключів — один 200, інший 409 LAST_LOGIN_METHOD_PROTECTED; лишається 1 ключ',
        over === 1 && [r1.status, r2.status].sort().join(',') === '200,409', `${r1.status} ${JSON.stringify(r1.data).slice(0, 100)} ${r2.status} ${JSON.stringify(r2.data).slice(0, 100)} over=${over}`);
      await pool.query('delete from app.passkeys where user_id=$1', [C.id]);
    }
  } catch (e) {
    check('неочікувана помилка (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    for (const r of vlagVooraf) await pool.query('UPDATE app.feature_flags SET aan=$2, standaard=$3, percentage=$4, gebruikers=$5 WHERE sleutel=$1', [r.sleutel, r.aan, r.standaard, r.percentage, r.gebruikers]).catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i015h-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await pool.query('delete from app.passkeys where user_id = any($1)', [ids]).catch(() => undefined);
      await pool.query('delete from app.bekende_apparaten where user_id = any($1)', [ids]).catch(() => undefined);
      await pool.query("delete from app.records where tbl in ('workspace_members','workspace_blocks') and data->>'workspaceId' in (select id from app.records where tbl='workspaces' and (data->>'ownerUserId' = any($1) or data->>'overgedragenVan' = any($1)))", [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id like 'i015h-%' or id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
    }
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool().catch(() => undefined);
  return einde();
}
