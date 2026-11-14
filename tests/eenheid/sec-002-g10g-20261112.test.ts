// SEC-002 (12.11.2026), група g10g — регресійні перевірки знахідок aanmelden-01/-02/-03/-08, keten-config-01, post-05/-07,
// integraties-11, autorisatie-07/-09, interface-06, http-rand-08. Одноразова PostgreSQL + підроблений Google (tests/eenheid/hulp);
// назовні не йде жоден запит. Усі секрети тут вигадані.
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle, totpCode } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(pad, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g10g-20261112');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const eigenaar = `g10g-eig-${T}@example.test`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  const pool = getPool();
  const oud = Math.floor(Date.now() / 1000) - 3600;
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
  const keurGoed = (userId: string) => pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and id=$1", [userId]);
  type Browser = ReturnType<typeof G.browser>;
  const id = (b: Browser, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('id.tarasevych.com', pad, b.ctxBody('identity', extra));
  const hub = (b: Browser, pad: string, extra: Record<string, unknown> = {}) => b.verzoek('hub.tarasevych.com', pad, b.ctxBody('hub', extra));
  /** Новий обліковий запис: вхід через підроблений Google (давній auth_time → без підтвердження), за потреби схвалений. */
  const maak = async (naam: string, goed = true, vers = false) => {
    const email = `g10g-${naam}-${T}@example.test`, b = G.browser();
    await b.aanmelden(`g10g-${naam}-${T}`, email, vers ? { intent: 'login' } : { intent: 'login', authTime: oud, iat: oud });
    const userId = await idRij(email);
    if (goed) await keurGoed(userId);
    return { b, email, id: userId, sub: `g10g-${naam}-${T}` };
  };
  // Не починати просто перед межею 30 с: далі потрібні два сусідні проміжки TOTP.
  if (Date.now() % 30000 > 20000) await new Promise((r) => setTimeout(r, 30000 - (Date.now() % 30000) + 200));
  const stap = Math.floor(Date.now() / 30000);
  let totpGeheim = '';
  let herstelcodes: string[] = [];

  try {
    const O = G.browser();
    await O.aanmelden(`g10g-o-${T}`, eigenaar, { authTime: oud, iat: oud });
    const oId = await idRij(eigenaar);

    // ================================================================ aanmelden-01: TOTP вперше — лише після підтвердження
    {
      const zonder = await id(O, '/api/owner/access/totp/start');
      const rijNa = (await pool.query("select data from app.records where tbl='identity_totp_v1' and data->>'userId'=$1", [oId])).rows[0]?.data;
      check('aanmelden-01: сеанс без підтвердження НЕ може почати запис TOTP (403 STEP_UP_REQUIRED, секрет не видано й не створено)',
        zonder.status === 403 && ['STEP_UP_REQUIRED', 'STEP_UP_STRONG_REQUIRED'].includes(zonder.data.error) && !zonder.data.secret && !rijNa, `${zonder.status} ${zonder.data.error || ''} secret=${!!zonder.data.secret} rij=${!!rijNa}`);
      const stapOpZonder = await id(O, '/api/owner/access/stap-op', { code: '000000' });
      const wwZonder = await id(O, '/api/owner/access/password/set', { password: `Wachtwoord-${T}-lang` });
      check('aanmelden-01: без запису TOTP немає «сильного» підтвердження через самозапис (stap-op → не налаштовано; password/set → 403)',
        stapOpZonder.status === 400 && stapOpZonder.data.error === 'STEP_UP_TOTP_NOT_ENROLLED' && wwZonder.status === 403, `${stapOpZonder.status} ${stapOpZonder.data.error} ${wwZonder.status}`);
      // Справжнє підтвердження (свіжий Google) → запис дозволено.
      await O.aanmelden(`g10g-o-${T}`, eigenaar, { intent: 'step-up' });
      const start = await id(O, '/api/owner/access/totp/start');
      totpGeheim = String(start.data.secret || '');
      // Інший сеанс того самого облікового запису (без підтвердження) не може завершити чужий запис, навіть знаючи код.
      const O2 = G.browser();
      await O2.aanmelden(`g10g-o-${T}`, eigenaar, { authTime: oud, iat: oud });
      const vreemd = totpGeheim ? await id(O2, '/api/owner/access/totp/confirm', { code: totpCode(totpGeheim, stap - 1) }) : { status: 0, data: {} as Record<string, any>, body: '' };
      const rijTussen = (await pool.query("select data from app.records where tbl='identity_totp_v1' and data->>'userId'=$1", [oId])).rows[0]?.data || {};
      check('aanmelden-01: після підтвердження запис починається; confirm з ІНШОГО сеансу відхилено, TOTP лишається непідтвердженим',
        start.status === 200 && !!totpGeheim && vreemd.status === 400 && vreemd.data.error === 'ACCESS_TOTP_NOT_STARTED' && rijTussen.confirmed === false, `start=${start.status} ${start.data.error || ''} vreemd=${vreemd.status} ${vreemd.data.error || ''} confirmed=${rijTussen.confirmed}`);
      await pool.query('delete from app.login_lockouts where subject=$1', [`stap-op:${oId}`]);
      const bevestig = totpGeheim ? await id(O, '/api/owner/access/totp/confirm', { code: totpCode(totpGeheim, stap) }) : { status: 0, data: {} as Record<string, any>, body: '' };
      herstelcodes = bevestig.data.recoveryCodes || [];
      const rijEind = (await pool.query("select data from app.records where tbl='identity_totp_v1' and data->>'userId'=$1", [oId])).rows[0]?.data || {};
      check('aanmelden-01: confirm у сеансі, що починав запис, працює (10 кодів відновлення); службове поле сеансу прибрано',
        bevestig.status === 200 && (bevestig.data.recoveryCodes || []).length === 10 && rijEind.confirmed === true && !('startSessie' in rijEind), `${bevestig.status} ${bevestig.data.error || ''} velden=${Object.keys(rijEind).join(',')}`);
    }

    // ================================================================ aanmelden-08: вхід за паролем не розрізняє адреси
    {
      const U = await maak('u');
      const login = (pad: string, email: string, password: string, ip: string, totp = '') => G.browser().verzoek('id.tarasevych.com', pad, { email, password, totp }, { ip });
      for (const pad of ['/api/owner/access/password/login', '/api/owner/auth/password/login']) {
        const n = pad.includes('/auth/') ? 1 : 0;
        const metTotp = await login(pad, eigenaar, 'x-fout-wachtwoord', `198.51.100.${10 + n}`);
        const onbekend = await login(pad, `g10g-niemand-${T}@example.test`, 'x-fout-wachtwoord', `198.51.100.${20 + n}`);
        const zonderTotp = await login(pad, U.email, 'x-fout-wachtwoord', `198.51.100.${30 + n}`);
        const vorm = (r: { status: number; data: Record<string, any> }) => `${r.status}/${r.data.error || r.data.code || ''}/${r.data.status || ''}/${r.data.mfaRequired ? 'mfa' : ''}`;
        check(`aanmelden-08: ${pad} — адреса з TOTP, невідома адреса й адреса без TOTP дають ОДНАКОВУ відповідь (немає MFA_REQUIRED до перевірки пароля)`,
          vorm(metTotp) === vorm(onbekend) && vorm(onbekend) === vorm(zonderTotp) && metTotp.status === 401 && metTotp.data.error === 'ACCESS_CREDENTIALS_INVALID', `totp=${vorm(metTotp)} onbekend=${vorm(onbekend)} zonder=${vorm(zonderTotp)}`);
      }
      // Спроба без коду на адресі з TOTP тепер рахується в блокування (раніше гілка 'mfa' оминала лічильник).
      const reeks: number[] = [];
      for (let i = 0; i < 6; i++) reeks.push((await login('/api/owner/access/password/login', eigenaar, `fout-${i}`, '198.51.100.40')).status);
      check('aanmelden-08: спроби без коду на адресі з TOTP рахуються: після 5 — 429', reeks.slice(0, 5).every((s) => s === 401) && reeks[5] === 429, reeks.join(','));
      // Справжній вхід лишається: пароль + код одним запитом; правильний пароль без коду — та сама загальна відмова.
      // Запис має TOTP → для зміни способів входу потрібне «сильне» підтвердження: код відновлення (код TOTP бережемо для входу).
      await id(O, '/api/owner/access/stap-op', { methode: 'herstelcode', code: herstelcodes[0] || '' });
      const ww = await id(O, '/api/owner/access/password/set', { password: `Wachtwoord-${T}-lang` });
      const zonderCode = await login('/api/owner/access/password/login', eigenaar, `Wachtwoord-${T}-lang`, '198.51.100.50');
      const fouteCode = await login('/api/owner/access/password/login', eigenaar, `Wachtwoord-${T}-lang`, '198.51.100.50', '000000');
      const goed = await login('/api/owner/access/password/login', eigenaar, `Wachtwoord-${T}-lang`, '198.51.100.50', totpCode(totpGeheim, stap + 1));
      check('aanmelden-08: правильний пароль без коду → та сама відмова (не видно, чи пароль вірний); з кодом → 200',
        ww.status === 200 && zonderCode.status === 401 && zonderCode.data.error === 'ACCESS_CREDENTIALS_INVALID' && fouteCode.status === 401 && goed.status === 200 && goed.data.ok === true,
        `set=${ww.status} ${ww.data.error || ''} zonder=${zonderCode.status}/${zonderCode.data.error || zonderCode.data.status} fout=${fouteCode.status} goed=${goed.status} ${goed.data.error || ''}`);
      await pool.query("delete from app.login_lockouts where subject like $1", [`wachtwoord:g10g-%-${T}@example.test:%`]);
    }

    // ================================================================ aanmelden-02: завершення сеансу відкликає «запам'ятований оглядач»
    {
      const D = G.browser(); // «викрадений» оглядач із «запам'ятати»
      const P = await maak('p');
      await D.aanmelden(P.sub, P.email, { intent: 'login', remember: true });
      await D.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', D.ctxBody('hub'));
      const grantCookie = [...D.jar.keys()].find((k) => k.startsWith('tsv_ot_grant_')) || '';
      const grantId = grantCookie.slice('tsv_ot_grant_'.length);
      const sessieCookie = [...D.jar.entries()].find(([k]) => k.includes('tsv_ecosystem'));
      const sid = decodeURIComponent(sessieCookie?.[1] || '').split('.')[0];
      // Власний оглядач жертви, теж із «запам'ятати»: його grant не має постраждати.
      const V = G.browser();
      await V.aanmelden(P.sub, P.email, { intent: 'login', remember: true });
      await V.verzoek('id.tarasevych.com', '/api/owner/session/bootstrap', V.ctxBody('identity'));
      const eigenGrant = ([...V.jar.keys()].find((k) => k.startsWith('tsv_ot_grant_')) || '').slice('tsv_ot_grant_'.length);
      const rev = await id(V, `/api/owner/identity/security/items/${sid}/revoke`, { kind: 'session' });
      const grantRij = async (g: string) => (await pool.query("select data from app.records where tbl='owner_browser_grants_v1' and id=$1", [g])).rows[0]?.data || {};
      const tabsLevend = (await pool.query("select count(*)::int n from app.records where tbl='owner_tab_sessions_v1' and data->>'anchorSessionId'=$1 and data->>'status'='active'", [sid])).rows[0].n;
      check('aanmelden-02: «Сесії → завершити» відкликає і grant цього сеансу, і його вкладки; власний grant жертви лишається',
        !!grantId && !!sid && rev.status === 200 && Number((await grantRij(grantId)).revokedAt || 0) > 0 && tabsLevend === 0 && !!eigenGrant && !(await grantRij(eigenGrant)).revokedAt,
        `rev=${rev.status} ${rev.data.error || ''} grant.revokedAt=${(await grantRij(grantId)).revokedAt} tabs=${tabsLevend} eigen.revokedAt=${(await grantRij(eigenGrant)).revokedAt}`);
      // Оглядач D пробує повернутися без Google: popup-транзакція → attach → complete-remembered.
      const tab = randomBytes(24).toString('hex');
      const tx = await D.verzoek('hub.tarasevych.com', '/api/owner/identity/transactions/create', { service: 'hub', tabContext: tab, flowMode: 'popup', locale: 'nl' });
      const at = await D.verzoek('id.tarasevych.com', '/api/owner/identity/transactions/attach', { service: 'identity', transactionId: tx.data.transactionId, attachSecret: tx.data.attachSecret, sourceOrigin: 'https://hub.tarasevych.com', locale: 'nl' });
      const cr = await D.verzoek('id.tarasevych.com', '/api/owner/identity/transactions/complete-remembered', { service: 'identity', transactionId: tx.data.transactionId, grantId });
      // Повний шлях повернення: після complete-remembered ще redeem (видає сеанс), лише тоді bootstrap показує, чи вхід відбувся.
      await D.verzoek('hub.tarasevych.com', '/api/owner/identity/transactions/redeem', { service: 'hub', tabContext: tab, transactionId: tx.data.transactionId, redeemSecret: tx.data.redeemSecret });
      const b3 = await D.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: tab });
      check('aanmelden-02: відкликаний оглядач НЕ отримує нового сеансу без Google (complete-remembered → 401, redeem не дає сеансу)',
        tx.status === 200 && at.status === 200 && cr.status === 401 && cr.data.error === 'OWNER_REMEMBERED_PROFILE_INVALID' && b3.data.user?.email !== P.email, `create=${tx.status} attach=${at.status} remembered=${cr.status} ${cr.data.error || ''} bootstrap=${b3.status} ${b3.data.state || ''}`);
      const bV = await V.verzoek('id.tarasevych.com', '/api/owner/session/bootstrap', V.ctxBody('identity'));
      check('aanmelden-02: сеанс, з якого відкликали, працює далі', bV.status === 200 && bV.data.user?.email === P.email, `${bV.status} ${bV.data.state || ''}`);

      // Після перевірки (g10g-T1): нападник заздалегідь створює «запасний» сеанс із ТОГО САМОГО grant (без Google). Завершення
      // одного сеансу має забути цей «запам'ятований оглядач» повністю: grant відкликано, запасний сеанс теж, новий вхід — ні.
      const sessieVan = (b: Browser) => decodeURIComponent([...b.jar.entries()].find(([k]) => k.includes('tsv_ecosystem'))?.[1] || '').split('.')[0];
      const metGrant = (bron: Browser) => { const n = G.browser(); for (const [k, v] of bron.jar) if (k.startsWith('tsv_ot_grant_')) n.jar.set(k, v); return n; };
      const terug = async (b: Browser, g: string) => {
        const t = randomBytes(24).toString('hex');
        const x = await b.verzoek('hub.tarasevych.com', '/api/owner/identity/transactions/create', { service: 'hub', tabContext: t, flowMode: 'popup', locale: 'nl' });
        await b.verzoek('id.tarasevych.com', '/api/owner/identity/transactions/attach', { service: 'identity', transactionId: x.data.transactionId, attachSecret: x.data.attachSecret, sourceOrigin: 'https://hub.tarasevych.com', locale: 'nl' });
        const c = await b.verzoek('id.tarasevych.com', '/api/owner/identity/transactions/complete-remembered', { service: 'identity', transactionId: x.data.transactionId, grantId: g });
        await b.verzoek('hub.tarasevych.com', '/api/owner/identity/transactions/redeem', { service: 'hub', tabContext: t, transactionId: x.data.transactionId, redeemSecret: x.data.redeemSecret });
        const bs = await b.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: t });
        return { cr: c.status, user: String(bs.data.user?.email || '') };
      };
      const Q = await maak('q');
      const E = G.browser();
      await E.aanmelden(Q.sub, Q.email, { intent: 'login', remember: true });
      await E.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', E.ctxBody('hub'));
      const gQ = ([...E.jar.keys()].find((k) => k.startsWith('tsv_ot_grant_')) || '').slice('tsv_ot_grant_'.length);
      const s1 = sessieVan(E);
      const E2 = metGrant(E);
      const zapas = await terug(E2, gQ);
      const s2 = sessieVan(E2);
      const s2Grant = (await pool.query("select data->>'grantId' g from app.records where tbl='owner_service_sessions_v1' and id=$1", [s2])).rows[0]?.g;
      await id(Q.b, '/api/owner/session/bootstrap'); // власний оглядач жертви (окремий сеанс)
      const rev1 = await id(Q.b, `/api/owner/identity/security/items/${s1}/revoke`, { kind: 'session' });
      const s2Rij = (await pool.query("select data from app.records where tbl='owner_service_sessions_v1' and id=$1", [s2])).rows[0]?.data || {};
      const weer = await terug(metGrant(E), gQ);
      const bE2 = await E2.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', E2.ctxBody('hub'));
      const bQ = await id(Q.b, '/api/owner/session/bootstrap');
      check('aanmelden-02 (g10g-T1): «запасний» сеанс із того самого grant не рятує оглядач — після «завершити» S1 grant і запасний сеанс відкликано, новий вхід без Google неможливий',
        !!gQ && zapas.cr === 200 && zapas.user === Q.email && s1 !== s2 && s2Grant === gQ && rev1.status === 200 && Number((await grantRij(gQ)).revokedAt || 0) > 0
          && Number(s2Rij.revokedAt || 0) > 0 && weer.cr === 401 && weer.user !== Q.email && bE2.data.user?.email !== Q.email && bQ.data.user?.email === Q.email,
        `zapas=${JSON.stringify(zapas)} s2grant=${s2Grant === gQ} rev=${rev1.status} grant.revokedAt=${(await grantRij(gQ)).revokedAt || '—'} s2.revokedAt=${s2Rij.revokedAt || '—'} weer=${JSON.stringify(weer)} E2=${bE2.data.state || bE2.data.user?.email || ''} Q=${bQ.data.user?.email === Q.email}`);

      // Після перевірки (g10g-T3): «Ні, це не я» в Telegram (дія 'sessies-beeindigen' → backend/index.ts telegramSessiesIntrekken)
      // відкликала лише рядки сеансу/вкладки; grant «запам'ятованого оглядача» лишався, і нападник повертався без Telegram і Google.
      const R2 = await maak('tg');
      const F = G.browser();
      await F.aanmelden(R2.sub, R2.email, { intent: 'login', remember: true });
      await F.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', F.ctxBody('hub'));
      const gF = ([...F.jar.keys()].find((k) => k.startsWith('tsv_ot_grant_')) || '').slice('tsv_ot_grant_'.length);
      const sF = sessieVan(F);
      const F2 = metGrant(F);
      const zapasF = await terug(F2, gF); // ще й запасний сеанс із того самого grant
      const sgi = await import('../../backend/sessie-grant-intrekken') as unknown as { sessiesIntrekkenMetGrants?: (u: string, ids: string[], f: unknown) => Promise<{ aantal: number }> };
      const { sessieIntrekken } = await import('../../backend/toegang-context');
      // Те саме, що робить index.ts для «Ні» (до патча — дослівно старий виклик без grant).
      const uitT3 = typeof sgi.sessiesIntrekkenMetGrants === 'function'
        ? await sgi.sessiesIntrekkenMetGrants(R2.id, [`a:${sF}`], sessieIntrekken)
        : { aantal: Number(Boolean((await sessieIntrekken(R2.id, { anker: sF }, { sessieId: '', anker: '', grant: '' })).anker)) };
      const weerF = await terug(metGrant(F), gF);
      const bF2 = await F2.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', F2.ctxBody('hub'));
      const idx = lees('backend/index.ts');
      check('aanmelden-02 (g10g-T3): «Ні, це не я» в Telegram відкликає й «запам\'ятований оглядач» (grant, запасні сеанси) — новий вхід без Telegram/Google неможливий',
        zapasF.cr === 200 && uitT3.aantal === 1 && Number((await grantRij(gF)).revokedAt || 0) > 0 && weerF.cr === 401 && weerF.user !== R2.email && bF2.data.user?.email !== R2.email
          && /const telegramSessiesIntrekken=\(userId:string,ids:string\[\]\)=>sessiesIntrekkenMetGrants\(userId,ids,telegramSessieIntrekken/.test(idx),
        `zapas=${zapasF.cr} aantal=${uitT3.aantal} grant.revokedAt=${(await grantRij(gF)).revokedAt || '—'} weer=${JSON.stringify(weerF)} F2=${bF2.data.state || bF2.data.user?.email || ''}`);
    }

    // ================================================================ aanmelden-03: лічильник кодового слова атомарний
    {
      const C = await maak('c');
      const { codewoordZetten, codewoordControleren, codewoordLoginVastleggen } = await import('../../backend/codewoord');
      const woord = `вигадане слово ${T}`;
      const gezet = await codewoordZetten(C.id, woord, C.email);
      await codewoordLoginVastleggen(C.id, 'sessie-proef');
      const rij = async () => (await pool.query("select data from app.records where tbl='codewoord_v1' and id=$1", [`codewoord:${C.id}`])).rows[0]?.data as { mislukt: number; geblokkeerdTot: number; loginSessies?: Record<string, number> };
      const N = 40;
      const uit = await Promise.all(Array.from({ length: N }, (_, i) => codewoordControleren(C.id, `хибне-${i}`)));
      const onjuist = uit.filter((r) => !r.ok && r.code === 'ONJUIST').length, geblokkeerd = uit.filter((r) => !r.ok && r.code === 'GEBLOKKEERD').length;
      const na = await rij();
      check(`aanmelden-03: ${N} одночасних хибних спроб → перевірено щонайбільше 5, решта GEBLOKKEERD; лічильник = 5, блок увімкнено`,
        gezet === 'OK' && onjuist >= 1 && onjuist <= 5 && geblokkeerd === N - onjuist && Number(na.mislukt) === 5 && Number(na.geblokkeerdTot) > Date.now(), `gezet=${gezet} onjuist=${onjuist} geblokkeerd=${geblokkeerd} mislukt=${na?.mislukt}`);
      const juistTijdensBlok = await codewoordControleren(C.id, woord);
      check('aanmelden-03: під час блокування навіть правильне слово відхилено; позначки входу (loginSessies) не загубилися',
        !juistTijdensBlok.ok && juistTijdensBlok.code === 'GEBLOKKEERD' && Number(na.loginSessies?.['sessie-proef'] || 0) > 0, `${JSON.stringify(juistTijdensBlok)} loginSessies=${JSON.stringify(Object.keys(na.loginSessies || {}))}`);
      // Блок минув: лічильник починається знову, правильне слово його скидає і не чіпає решту рядка.
      await pool.query("update app.records set data = data || '{\"geblokkeerdTot\":1}'::jsonb where tbl='codewoord_v1' and id=$1", [`codewoord:${C.id}`]);
      const eenFout = await codewoordControleren(C.id, 'ще одне хибне');
      const naFout = await rij();
      const juist = await codewoordControleren(C.id, woord);
      const naJuist = await rij();
      check('aanmelden-03: після блоку лічильник іде з 1; правильне слово скидає його до 0 і зберігає loginSessies',
        !eenFout.ok && eenFout.code === 'ONJUIST' && Number(naFout.mislukt) === 1 && Number(naFout.geblokkeerdTot) === 0 && juist.ok === true && Number(naJuist.mislukt) === 0 && Number(naJuist.loginSessies?.['sessie-proef'] || 0) > 0,
        `fout=${JSON.stringify(eenFout)} mislukt=${naFout.mislukt} juist=${JSON.stringify(juist)} mislukt2=${naJuist.mislukt}`);
      // Через маршрут другого кроку входу, теж паралельно.
      const route = await Promise.all(Array.from({ length: 12 }, (_, i) => C.b.verzoek('id.tarasevych.com', '/api/owner/session/codewoord', C.b.ctxBody('identity', { woord: `хибне-маршрут-${i}` }))));
      const rOnjuist = route.filter((r) => r.data.error === 'CODEWOORD_ONJUIST').length, rBlok = route.filter((r) => r.data.error === 'CODEWOORD_GEBLOKKEERD').length;
      check('aanmelden-03: /api/owner/session/codewoord — 12 одночасних спроб: ≤ 5 перевірено, решта заблоковано', rOnjuist >= 1 && rOnjuist <= 5 && rBlok === 12 - rOnjuist, `onjuist=${rOnjuist} geblokkeerd=${rBlok} ${[...new Set(route.map((r) => `${r.status}:${r.data.error || ''}`))].join(' ')}`);
      // Суворий кошик обмеження швидкості (10/хв/IP, fail-closed) для всіх маршрутів кодового слова.
      const { rateLimitAfwijzing } = await import('../../server/start');
      const paden = ['/api/owner/session/codewoord', '/api/owner/access/stap-op/codewoord', '/api/owner/identity/codewoord/controleren', '/api/owner/identity/codewoord/zetten'];
      const ip = `203.0.113.${100 + Math.floor(Math.random() * 100)}`;
      const eerste: number[] = [];
      for (let i = 0; i < 10; i++) eerste.push(await rateLimitAfwijzing('POST', paden[i % paden.length], `${ip}-${T}`));
      const elfde = await rateLimitAfwijzing('POST', paden[0], `${ip}-${T}`), anderPad = await rateLimitAfwijzing('POST', paden[2], `${ip}-${T}`);
      check('aanmelden-03: маршрути кодового слова в суворому кошику: 10 спроб/хв з однієї адреси на всі чотири разом, 11-та — відмова',
        eerste.every((x) => x === 0) && elfde > 0 && anderPad > 0, `eerste=${eerste.join('')} elfde=${elfde} ander=${anderPad}`);
    }

    // ================================================================ autorisatie-07: прострочене запрошення не підвищує роль
    {
      const W = await maak('w');
      const wsW = (await hub(W.b, '/api/workspace/load')).data.workspace?.id as string;
      const laterMail = `g10g-later-${T}@example.test`;
      // IDENTITEIT-014: запрошення з роллю «адміністратор» тепер вимагає свіжого підтвердження (step-up) — W підтверджує через Google.
      await W.b.aanmelden(W.sub, W.email, { intent: 'step-up' });
      const uitn = await hub(W.b, '/api/share/email', { workspaceId: wsW, email: laterMail, workspaceRole: 'admin' });
      await pool.query("update app.records set data = jsonb_set(data, '{verlooptOp}', to_jsonb(1)) where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'email'=$2", [wsW, laterMail]);
      const L = await maak('later');
      const link = await hub(W.b, '/api/share/link', { workspaceId: wsW, workspaceRole: 'viewer' });
      const join = await hub(L.b, '/api/share/join', { code: link.data.code });
      const rol = (await pool.query("select data->>'workspaceRole' r, data->>'permission' p, data->>'status' s from app.records where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'userId'=$2", [wsW, L.id])).rows;
      check('autorisatie-07: прострочене запрошення «admin» + посилання «viewer» → учасник стає лише viewer',
        uitn.status === 200 && link.status === 200 && join.status === 200 && rol.length === 1 && rol[0].r === 'viewer' && rol[0].p === 'viewer' && rol[0].s === 'active', `uitn=${uitn.status} link=${link.status} join=${join.status} ${JSON.stringify(rol)}`);
      // Чинна вища роль активного учасника НЕ знижується посиланням (наявна поведінка hoogsteRol лишається).
      const M = await maak('m');
      const deel = await hub(W.b, '/api/share/email', { workspaceId: wsW, email: M.email, workspaceRole: 'member' });
      await hub(M.b, '/api/workspace/load');
      const mVoor = (await pool.query("select data->>'workspaceRole' r, data->>'status' s from app.records where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'email'=$2", [wsW, M.email])).rows[0];
      const link2 = await hub(W.b, '/api/share/link', { workspaceId: wsW, workspaceRole: 'viewer' });
      const join2 = await hub(M.b, '/api/share/join', { code: link2.data.code });
      const mNa = (await pool.query("select data->>'workspaceRole' r, data->>'status' s, data->>'userId' u from app.records where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'email'=$2", [wsW, M.email])).rows;
      check('autorisatie-07: активний учасник «member» за посиланням «viewer» лишається member (один рядок, свій userId)',
        deel.status === 200 && join2.status === 200 && mNa.length === 1 && mNa[0].r === 'member' && mNa[0].s === 'active' && mNa[0].u === M.id, `deel=${deel.status} voor=${JSON.stringify(mVoor)} join=${join2.status} na=${JSON.stringify(mNa)}`);
      // Чужий рядок з тим самим e-mail (інший обліковий запис) не перебирається: роль не успадковується, рядок не переписується.
      const X = await maak('x');
      await pool.query("insert into app.records (tbl,id,data) values ('workspace_members',$1,$2)", [`g10g-lid-${T}`, { workspaceId: wsW, userId: `g10g-ander-account-${T}`, email: X.email, permission: 'editor', workspaceRole: 'admin', scopeBlockIds: [], status: 'active', createdAt: Date.now(), updatedAt: Date.now() }]);
      const link3 = await hub(W.b, '/api/share/link', { workspaceId: wsW, workspaceRole: 'viewer' });
      const join3 = await hub(X.b, '/api/share/join', { code: link3.data.code });
      const xRijen = (await pool.query("select id, data->>'workspaceRole' r, data->>'userId' u from app.records where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'email'=$2 order by seq", [wsW, X.email])).rows;
      const vreemd = xRijen.find((r: { id: string }) => r.id === `g10g-lid-${T}`), eigen = xRijen.find((r: { u: string }) => r.u === X.id);
      check('autorisatie-07: членство ІНШОГО облікового запису з тим самим e-mail не перебирається (чужий рядок цілий, власний — viewer)',
        join3.status === 200 && vreemd?.u === `g10g-ander-account-${T}` && vreemd?.r === 'admin' && eigen?.r === 'viewer', `join=${join3.status} ${JSON.stringify(xRijen)}`);
    }

    // ================================================================ autorisatie-09: несхвалені облікові записи
    {
      const vlagVoor = (await pool.query("select aan, standaard from app.feature_flags where sleutel='apparaat-bevestiging-v1'")).rows[0];
      await pool.query("update app.feature_flags set aan = true, standaard = true where sleutel = 'apparaat-bevestiging-v1'");
      try {
        const N = await maak('nieuw', false, true); // свіжий вхід: звичайне підтвердження (Google) у цього запису Є
        const status = (await pool.query("select data->>'status' s from app.records where tbl='users' and id=$1", [N.id])).rows[0]?.s;
        const paden = ['aanvragen', 'stand', 'intrekken', 'open', 'bekrachtigen', 'weigeren', 'overzicht'].map((p) => `/api/owner/bevestiging/apparaat/${p}`);
        const antwoorden = [] as Array<{ pad: string; status: number; fout: string }>;
        for (const pad of paden) { const r = await id(N.b, pad, { id: 'x', actie: 'stap-op' }); antwoorden.push({ pad: pad.split('/').pop() || '', status: r.status, fout: String(r.data.error || '') }); }
        check('autorisatie-09: несхвалений запис (status new) не проходить на маршрути підтвердження пристроїв (403, код про схвалення)',
          status !== 'approved' && antwoorden.every((a) => a.status === 403 && /NOT_APPROVED/.test(a.fout)), `status=${status} ${antwoorden.map((a) => `${a.pad}:${a.status}:${a.fout}`).join(' ')}`);
        const cw = await id(N.b, '/api/owner/identity/codewoord/zetten', { woord: `вигадане слово нового ${T}` });
        const cwRij = (await pool.query("select 1 from app.records where tbl='codewoord_v1' and id=$1", [`codewoord:${N.id}`])).rowCount;
        const cwC = await id(N.b, '/api/owner/identity/codewoord/controleren', { woord: 'x' });
        check('autorisatie-09: несхвалений запис не може задати кодове слово (403, рядок не створено)', cw.status === 403 && !cwRij && cwC.status === 403 && cwC.data.error === 'ACCOUNT_NOT_APPROVED', `${cw.status} ${cw.data.error || ''} rij=${cwRij} controleren=${cwC.status} ${cwC.data.error || ''}`);
        const besch = await id(N.b, '/api/owner/integraties/beschikbaar');
        check('autorisatie-09: несхвалений запис не читає перелік доступних інтеграцій (403)', besch.status === 403 && !besch.data.ids, `${besch.status} ${besch.data.error || ''}`);
        const hoHub = await hub(N.b, '/api/owner/session/handoff/create', { target: 'mail' });
        const hoId = await hub(N.b, '/api/owner/session/handoff/create', { target: 'identity' });
        check('autorisatie-09: handoff для несхваленого — лише до «identity» (екран очікування; свідомий виняток), до інших служб 403', hoHub.status === 403 && hoId.status === 200, `mail=${hoHub.status} identity=${hoId.status} ${hoId.data.error || ''}`);
        // Схвалений користувач працює як раніше.
        const A = await maak('goed');
        const okOverzicht = await id(A.b, '/api/owner/bevestiging/apparaat/overzicht');
        const okBesch = await id(A.b, '/api/owner/integraties/beschikbaar');
        check('autorisatie-09: схвалений запис проходить, як і раніше', okOverzicht.status === 200 && okBesch.status === 200 && Array.isArray(okBesch.data.ids), `overzicht=${okOverzicht.status} ${okOverzicht.data.error || ''} beschikbaar=${okBesch.status}`);
      } finally {
        if (vlagVoor) await pool.query("update app.feature_flags set aan = $1, standaard = $2 where sleutel = 'apparaat-bevestiging-v1'", [vlagVoor.aan, vlagVoor.standaard]);
      }
    }

    // ================================================================ http-rand-08: потік /api/owner/stroom
    {
      const stroom = await import('../../backend/apparaat-bevestiging/stroom') as typeof import('../../backend/apparaat-bevestiging/stroom') & {
        sluitStromenVan?: (userId: string, anker?: string) => number; _controleerStromen?: (nu?: number) => Promise<number>; STROOM_MAX_LEEFTIJD_MS?: number };
      const geldig = new Set(['a1', 'a2', 'b1']);
      stroom.registreerStroomAuth(async (event) => { const s = String((event as { sessie?: string }).sessie || ''); return geldig.has(s) ? { userId: s.startsWith('a') ? 'gebruiker-a' : 'gebruiker-b', anker: s } : { fout: 'OWNER_SESSION_REVOKED' }; });
      const open = async (sessie: string) => {
        const req = Object.assign(new (await import('node:events')).EventEmitter(), { headers: {} });
        const res = { dicht: false, tekst: '', writeHead() { return this; }, write(t: string) { if (this.dicht) return false; this.tekst += t; return true; }, end() { this.dicht = true; } };
        await stroom.stroomVerzoekApparaat(req as never, res as never, { sessie } as never, {});
        return res;
      };
      const a1 = await open('a1'), a2 = await open('a2'), b1 = await open('b1');
      const heeft = typeof stroom._controleerStromen === 'function' && typeof stroom.sluitStromenVan === 'function';
      check('http-rand-08: потоки відкрито (2 користувача A, 1 користувача B)', stroom.openStromen('gebruiker-a') === 2 && stroom.openStromen('gebruiker-b') === 1);
      // Сеанс a1 відкликано: наступна перевірка серцебиття закриває саме цей потік.
      geldig.delete('a1');
      const gesloten = heeft ? await stroom._controleerStromen!() : -1;
      check('http-rand-08: після відкликання сеансу потік закривається на наступному серцебитті (повторна перевірка сеансу), решта живі',
        heeft && gesloten === 1 && a1.dicht && !a2.dicht && !b1.dicht && stroom.openStromen('gebruiker-a') === 1, `heeft=${heeft} gesloten=${gesloten} a1=${a1.dicht} a2=${a2.dicht} b1=${b1.dicht}`);
      const bereikt = stroom.publiceer('gebruiker-a', { soort: 'apparaat.afgerond', id: 'x' } as never);
      check('http-rand-08: подія більше не потрапляє у закритий потік', bereikt === 1 && !a1.tekst.includes('apparaat.afgerond') && a2.tekst.includes('apparaat.afgerond'), `bereikt=${bereikt}`);
      // Негайне закриття при виході/відкликанні (без очікування серцебиття) і граничний вік потоку.
      const nVan = heeft ? stroom.sluitStromenVan!('gebruiker-a', 'a2') : -1;
      const max = Number(stroom.STROOM_MAX_LEEFTIJD_MS || 0);
      const oudGesloten = heeft && max > 0 ? await stroom._controleerStromen!(Date.now() + max + 1000) : -1;
      check('http-rand-08: sluitStromenVan(користувач, якір) закриває одразу; потік старший за граничний вік закривається (оглядач під’єднається знову)',
        nVan === 1 && a2.dicht && max > 0 && max <= 30 * 60_000 && oudGesloten === 1 && b1.dicht && stroom.openStromen() === 0, `van=${nVan} max=${max} oud=${oudGesloten} b1=${b1.dicht} open=${stroom.openStromen()}`);
      // Інтеграція з backend/index.ts: «вийти всюди» (revoke-all → ownerAllesIntrekken) закриває потік ОДРАЗУ, без очікування серцебиття.
      const R = await maak('stroom');
      stroom.registreerStroomAuth(async () => ({ userId: R.id, anker: 'anker-r' }));
      const r1 = await open('r');
      const ra = await id(R.b, '/api/owner/identity/security/revoke-all');
      check('http-rand-08: «вийти всюди» (revoke-all) одразу закриває відкриті потоки цього користувача',
        ra.status === 200 && r1.dicht && stroom.openStromen(R.id) === 0, `revoke-all=${ra.status} ${ra.data.error || ''} dicht=${r1.dicht} open=${stroom.openStromen(R.id)}`);
      stroom.registreerStroomAuth(null);
    }

    // ================================================================ keten-config-01: upgrade з ціллю «//x:y/…» не валить процес
    {
      const { attachAgentGateway } = await import('../../backend/connectors-gateway');
      const server = http.createServer((_q, s) => { s.statusCode = 200; s.end('ok'); });
      attachAgentGateway(server, new Set(['127.0.0.1']));
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
      const poort = (server.address() as net.AddressInfo).port;
      const onopgevangen: string[] = [];
      const vang = (e: unknown) => { onopgevangen.push(String((e as Error)?.message || e)); };
      process.on('uncaughtException', vang);
      const upgrade = (doel: string) => new Promise<string>((klaar) => {
        const s = net.connect(poort, '127.0.0.1', () => s.write(`GET ${doel} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`));
        let tekst = ''; const einde = () => klaar(tekst);
        s.on('data', (d) => { tekst += d.toString('latin1'); }); s.on('close', einde); s.on('error', einde);
        setTimeout(() => { s.destroy(); einde(); }, 1500);
      });
      const regels: string[] = [];
      for (const doel of ['//x:y/agent/ws', '//', '//[/', '//:80/x']) regels.push((await upgrade(doel)).split('\r\n')[0]);
      const gewoon = await new Promise<number>((klaar) => { http.get({ host: '127.0.0.1', port: poort, path: '/' }, (r) => { r.resume(); klaar(r.statusCode || 0); }).on('error', () => klaar(0)); });
      process.off('uncaughtException', vang);
      check('keten-config-01: upgrade з нерозбірною ціллю отримує 400, необроблених винятків немає, сервер відповідає далі',
        onopgevangen.length === 0 && regels.every((r) => /^HTTP\/1\.1 400/.test(r)) && gewoon === 200, `винятки=${onopgevangen.length} ${regels.join(' | ')} daarna=${gewoon}`);
      server.closeAllConnections?.(); server.close();
      const cron = lees('server/cron.ts');
      check('keten-config-01: server/cron.ts має запобіжник необроблених винятків і відхилень', cron.includes('procesVangnetInstellen(') && cron.includes('procesVangnetStand()'));
    }
  } catch (e) {
    check('неочікувана помилка (серверна частина)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`g10g-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) {
      await pool.query("delete from app.records where tbl='workspace_members' and data->>'workspaceId' in (select id from app.records where tbl='workspaces' and data->>'ownerUserId' = any($1))", [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
      await pool.query("delete from app.records where tbl='codewoord_v1' and id = any($1)", [ids.map((i: string) => `codewoord:${i}`)]).catch(() => undefined);
      await pool.query('delete from app.login_lockouts where subject = any($1) or subject like $2', [ids.map((i: string) => `stap-op:${i}`), `wachtwoord:g10g-%-${T}@example.test:%`]).catch(() => undefined);
    }
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }

  // Клієнтська частина (без бази): окремий блок нижче.
  await clientDeel(check);

  await closePool().catch(() => undefined);
  return einde();
}

type Check = (naam: string, ok: boolean, info?: string) => void;
/** `basis(pad)` → inhoud van dat bestand vóór de patch (alleen voor de controle «test faalt zonder patch»: een los hulpscript buiten de repository geeft de oude inhoud mee). */
export type ClientOpties = { basis?: (pad: string) => string | null; label?: string };

/** Bouwt een bundel uit `bron` (code in de wortel van de repo) met esbuild; met `basis` worden bestaande bestanden vervangen. */
async function bundel(bron: string, platform: 'node' | 'browser', uit: string, o: ClientOpties): Promise<string> {
  const { build } = await import('esbuild');
  const wortel = resolve('.');
  const plugins = o.basis ? [{
    name: 'g10g-basis',
    setup(b: { onLoad: (f: { filter: RegExp }, cb: (a: { path: string }) => { contents: string; loader: 'ts' | 'tsx' } | undefined) => void }) {
      b.onLoad({ filter: /\.(ts|tsx)$/ }, (a) => {
        if (!a.path.startsWith(wortel + '/') || a.path.includes('/node_modules/')) return undefined;
        const inhoud = o.basis!(a.path.slice(wortel.length + 1));
        return inhoud === null ? undefined : { contents: inhoud, loader: a.path.endsWith('.tsx') ? 'tsx' : 'ts' };
      });
    },
  }] : [];
  await build({
    stdin: { contents: bron, resolveDir: wortel, loader: 'tsx', sourcefile: 'g10g-proef.tsx' }, outfile: uit, bundle: true, logLevel: 'error',
    ...(platform === 'node' ? { platform: 'node', format: 'esm', target: 'node22', packages: 'external' } : { platform: 'browser', format: 'iife', target: 'es2022', define: { 'process.env.NODE_ENV': '"production"' } }),
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' }, plugins: plugins as never,
  });
  return uit;
}

/** Eenvoudige Storage voor node (localStorage/sessionStorage). */
class GeheugenOpslag {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  sleutels() { return [...this.m.keys()]; }
}

export async function clientDeel(check: Check, o: ClientOpties = {}): Promise<void> {
  mkdirSync('rapporten', { recursive: true });
  const map = join('rapporten', `g10g-client-${process.pid}-${Date.now()}`);
  mkdirSync(map, { recursive: true });
  const { rm } = await import('node:fs/promises');
  try {
    // ============================================================== integraties-11: WebDAV/S3-antwoorden lineair ontleden
    try {
      const pad = await bundel("export * as webdav from './backend/verbinding-adapters/webdav'; export * as s3 from './backend/verbinding-adapters/s3';", 'node', resolve(map, 'adapters.mjs'), o);
      const m = await import(pathToFileURL(pad).href) as { webdav: typeof import('../../backend/verbinding-adapters/webdav'); s3: typeof import('../../backend/verbinding-adapters/s3') };
      const normaal = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>'
        + '<D:response><D:href>/dav/a%20b.txt</D:href><D:propstat><D:prop><D:getcontentlength>12</D:getcontentlength><D:getlastmodified>Mon, 01 Jan 2026 00:00:00 GMT</D:getlastmodified></D:prop></D:propstat></D:response>'
        + '<response><href>/dav/c/</href><resourcetype><collection /></resourcetype></response><d:responsedescription>x</d:responsedescription></d:multistatus>';
      const items = m.webdav.ontleedMultistatus(normaal);
      check('integraties-11: звичайна відповідь WebDAV розбирається як раніше (префікси, папки, розмір, дата, %-кодування)',
        items.length === 3 && items[0].map && items[1].pad === '/dav/a b.txt' && items[1].grootte === 12 && !items[1].map && /2026/.test(items[1].gewijzigd) && items[2].map, JSON.stringify(items));
      const s3Ok = await m.s3.s3Lijst(async () => new Response('<ListBucketResult><Contents><Key>a.txt</Key><Size>3</Size><LastModified>2026-01-01</LastModified></Contents><Contents><Key>b/c.txt</Key><Size>5</Size></Contents><IsTruncated>true</IsTruncated></ListBucketResult>', { status: 200 }), 'https://s3.example.test', 'emmer', { toegangsId: 'VERZONNEN', geheim: 'verzonnen-geheim', regio: 'eu-west-1' });
      check('integraties-11: звичайна відповідь S3 розбирається як раніше', s3Ok.ok && s3Ok.waarde.objecten.length === 2 && s3Ok.waarde.objecten[1].sleutel === 'b/c.txt' && s3Ok.waarde.objecten[0].grootte === 3 && s3Ok.waarde.afgekapt === true, JSON.stringify(s3Ok));
      // Ворожа відповідь: сотні тисяч відкривних тегів без закривних (512 КБ; до патча — секунди повної зупинки потоку).
      const kwaad = (tag: string, kb: number) => `<${tag}>`.repeat(Math.floor((kb * 1024) / (tag.length + 2)));
      const t0 = performance.now(); const w = m.webdav.ontleedMultistatus(`<d:multistatus>${kwaad('d:response ', 512)}`); const tW = performance.now() - t0;
      const t1 = performance.now(); const s = await m.s3.s3Lijst(async () => new Response(`<ListBucketResult>${kwaad('Contents', 512)}`, { status: 200 }), 'https://s3.example.test', 'emmer', { toegangsId: 'VERZONNEN', geheim: 'verzonnen-geheim', regio: 'eu-west-1' }); const tS = performance.now() - t1;
      let t2W = -1, t2S = -1;
      if (tW < 300 && tS < 300) { // 2 МБ — межа pinnedFetch у майстрі інтеграцій; лише якщо 512 КБ уже швидко (інакше це хвилина)
        const a = performance.now(); m.webdav.ontleedMultistatus(kwaad('response', 2048)); t2W = performance.now() - a;
        const b = performance.now(); await m.s3.s3Lijst(async () => new Response(`<ListBucketResult>${kwaad('Contents', 2048)}`, { status: 200 }), 'https://s3.example.test', 'emmer', { toegangsId: 'VERZONNEN', geheim: 'verzonnen-geheim', regio: 'eu-west-1' }); t2S = performance.now() - b;
      }
      check('integraties-11: ворожа відповідь WebDAV/S3 без закривних тегів (512 КБ і 2 МБ) розбирається за лічені мілісекунди, без блоків',
        tW < 300 && tS < 300 && t2W >= 0 && t2W < 1000 && t2S >= 0 && t2S < 1000 && w.length === 0 && s.ok && s.waarde.objecten.length === 0,
        `512K: webdav=${tW.toFixed(0)}мс s3=${tS.toFixed(0)}мс; 2M: webdav=${t2W.toFixed(0)}мс s3=${t2S.toFixed(0)}мс`);
      const veel = '<multistatus>' + '<response><href>/x</href></response>'.repeat(5000) + '</multistatus>';
      check('integraties-11: не більше 2000 блоків WebDAV з однієї відповіді', m.webdav.ontleedMultistatus(veel).length === 2000);
    } catch (e) { check('integraties-11: перевірка адаптерів виконалася', false, String((e as Error)?.stack || e).slice(0, 600)); }

    // ============================================================== interface-06 + post-05 (node, geheugen-opslag)
    try {
      const ls = new GeheugenOpslag(), ss = new GeheugenOpslag();
      const g = globalThis as Record<string, unknown>;
      const vorigLs = g.localStorage, vorigSs = g.sessionStorage;
      g.localStorage = ls; g.sessionStorage = ss;
      try {
        const pad = await bundel([
          "export * as beelden from './src/mail/beelden-toestemming';",
          "export * as bijlage from './src/mail-bijlage-cache';",
          "export * as rijen from './src/meldingen/lokale-rijen';",
          "export { WEERGAVE_SLEUTEL } from './src/mail/lees-modus';",
          "export { ruimteSleutel } from './shared/ruimte-sleutel';",
          "export * as sporen from './src/lokale-sporen';",
        ].join('\n'), 'node', resolve(map, 'post.mjs'), o);
        const m = await import(pathToFileURL(pad).href) as {
          beelden: Record<string, (...a: unknown[]) => unknown>; bijlage: Record<string, (...a: unknown[]) => unknown>;
          rijen: { historyKey: (s: string) => string }; WEERGAVE_SLEUTEL: string; ruimteSleutel: (r: 'prive' | 'technisch', s: string) => string };
        const B = m.beelden, scope = (eigenaar: string, acc: string) => String(m.bijlage.mailCacheScope(eigenaar, acc));
        const A_ID = '7d1e0aba-c5da-4f29-a1e9-406f5026dada', B_ID = `${A_ID}0`; // B begint met het id van A: geen voorvoegsel-verwarring
        const afz = 'Nieuwsbrief <volg@tracker.example>';
        // (а) «Завжди від цього відправника» — окремо для кожного облікового запису й скриньки
        ls.setItem('mail-beelden-afzenders-v1', JSON.stringify(['oud@tracker.example']));
        (B.vergeetBeeldenCache as () => void)();
        const oudGeldt = B.beeldenAltijd('oud@tracker.example', scope(A_ID, 'acc-1'));
        (B.zetBeeldenAltijd as (f: string, a: boolean, r?: string) => void)(afz, true, scope(A_ID, 'acc-1'));
        const bijA = B.beeldenAltijd(afz, scope(A_ID, 'acc-1')), bijB = B.beeldenAltijd(afz, scope(B_ID, 'acc-1')), bijA2 = B.beeldenAltijd(afz, scope(A_ID, 'acc-2')), zonder = B.beeldenAltijd(afz);
        check('interface-06: «завжди показувати зображення від відправника» діє лише для того облікового запису й скриньки, де його ввімкнено',
          bijA === true && bijB === false && bijA2 === false && zonder === false, `A=${bijA} B=${bijB} A/інша скринька=${bijA2} без входу=${zonder}`);
        check('interface-06: спільний для всього оглядача список v1 не успадковується і стирається', oudGeldt === false && ls.getItem('mail-beelden-afzenders-v1') === null, `oud=${oudGeldt} v1=${ls.getItem('mail-beelden-afzenders-v1')}`);
        // (б) сліди після виходу: сповіщення, пошуки в пошті, список зображень
        const zaai = (id: string) => {
          ls.setItem(m.rijen.historyKey(id), '[{"id":"m1","title":"вигадане сповіщення"}]');
          ls.setItem(m.rijen.historyKey(`${id}:technisch`), '[]');
          for (const v of ['tsv:mail-recent-searches-v1:', 'tsv:mail-saved-searches-v1:', 'tsv:mail-last-search-v1:']) ls.setItem(`${v}${id}`, '[{"query":"вигаданий пошук"}]');
          (B.zetBeeldenAltijd as (f: string, a: boolean, r?: string) => void)(afz, true, scope(id, 'acc-1'));
          (B.zetBeeldenAltijd as (f: string, a: boolean, r?: string) => void)(afz, true, scope(m.ruimteSleutel('technisch', id), 'acc-9'));
        };
        zaai(A_ID); zaai(B_ID);
        const vanAccount = (id: string) => ls.sleutels().filter((k) => (k.includes(id) || k.includes(encodeURIComponent(id))) && !(id === A_ID && (k.includes(B_ID) || k.includes(encodeURIComponent(B_ID)))));
        const sporen = (id: string) => vanAccount(id).filter((k) => /notification-history|mail-(recent|saved|last)-search|mail-beelden-afzenders/.test(k));
        const voorA = sporen(A_ID).length, voorB = sporen(B_ID).length;
        await (m.bijlage.endMailPrivateCacheSession as (id: string) => Promise<void>)(A_ID);
        const naA = sporen(A_ID), naB = sporen(B_ID);
        check('interface-06: вихід облікового запису A (без «запам\'ятати») стирає його сповіщення, пошукові запити й список зображень; B не зачеплено',
          voorA >= 7 && naA.length === 0 && naB.length === voorB && !B.beeldenAltijd(afz, scope(A_ID, 'acc-1')) && B.beeldenAltijd(afz, scope(B_ID, 'acc-1')) === true, `A: ${voorA}→${naA.length} [${naA.join(' ')}] B: ${voorB}→${naB.length}`);
        await (m.bijlage.clearAllMailPrivateCaches as () => Promise<void>)();
        const rest = ls.sleutels().filter((k) => /notification-history|mail-(recent|saved|last)-search|mail-beelden-afzenders/.test(k));
        check('interface-06: «вийти з усіх облікових записів» стирає ці сліди всіх облікових записів', rest.length === 0, rest.join(' '));
        // Стартова сторінка не знає «запам'ятати»: wisLokaleSporenBijAfmelden читає те саме правило, що й приватний кеш пошти.
        const W = (m as unknown as { sporen?: { wisLokaleSporenBijAfmelden?: (id: string) => number } }).sporen?.wisLokaleSporenBijAfmelden;
        zaai(A_ID); ls.setItem(`tsv-mail-cache-policy-v1:${A_ID}`, 'remembered');
        const onthouden = W ? W(A_ID) : -1, naOnthouden = sporen(A_ID).length;
        ls.setItem(`tsv-mail-cache-policy-v1:${A_ID}`, 'session');
        const sessie = W ? W(A_ID) : -1, naSessie = sporen(A_ID).length;
        check('interface-06: вихід на стартовій сторінці: «запам\'ятований» обліковий запис зберігає свої сліди, незапам\'ятований — стирає',
          onthouden === 0 && naOnthouden >= 7 && sessie >= 7 && naSessie === 0, `onthouden=${onthouden}/${naOnthouden} sessie=${sessie}/${naSessie}`);
        // Стартова сторінка (src/App.tsx): той самий вихід — ті самі сліди (з урахуванням «запам'ятати»).
        const app = o.basis?.('src/App.tsx') ?? lees('src/App.tsx');
        check('interface-06: стартова сторінка при виході стирає сліди облікового запису, при «вийти з усіх» — усі',
          /forgetViewAccountEverywhere\(account\);if\(account!=='anon'\)\{clearDomainViewCache\(account\);wisLokaleSporenBijAfmelden\(account\)\}/.test(app) && /clearViewAccounts\(\);clearDomainViewCache\(\);wisAlleLokaleSporen\(\);/.test(app));
        // post-05: поза читальним вікном (вікно «Попередній перегляд») — збережене налаштування, без нього «питати»
        const inst = B.beeldenInstelling as undefined | ((k: unknown, l?: (s: string) => string | null) => string);
        const leeg = inst ? inst(null, () => null) : 'altijd';
        const bewaardAltijd = inst ? inst(null, (k) => (k === m.WEERGAVE_SLEUTEL ? JSON.stringify({ beelden: 'altijd' }) : null)) : 'altijd';
        const kapot = inst ? inst(null, () => '{kapot') : 'altijd';
        const kader = inst ? inst({ beelden: 'vragen' }, () => JSON.stringify({ beelden: 'altijd' })) : 'altijd';
        check('post-05: поза читальним вікном типово «питати»; збережене «завжди» поважається; у читальному вікні — його власне налаштування',
          leeg === 'vragen' && bewaardAltijd === 'altijd' && kapot === 'vragen' && kader === 'vragen', `leeg=${leeg} bewaard=${bewaardAltijd} kapot=${kapot} kader=${kader}`);
      } finally { g.localStorage = vorigLs; g.sessionStorage = vorigSs; }
    } catch (e) { check('interface-06/post-05: перевірка в node виконалася', false, String((e as Error)?.stack || e).slice(0, 600)); }

    // ============================================================== post-05 + post-07 in een echte Chrome
    // playwright-core: eerst PLAYWRIGHT_CORE, dan node_modules van de repository (in CI met --no-save geïnstalleerd), dan /opt/node-tools.
    // Спершу змінна PLAYWRIGHT_CORE, потім node_modules сховища (у CI встановлюється з --no-save), потім /opt/node-tools.
    const PW = [process.env.PLAYWRIGHT_CORE, join(process.cwd(), 'node_modules', 'playwright-core'), '/opt/node-tools/node_modules/playwright-core']
      .filter((p): p is string => Boolean(p)).map((p) => join(p, 'index.mjs')).find((p) => existsSync(p)) || join(process.cwd(), 'node_modules', 'playwright-core', 'index.mjs');
    const CHROME = process.env.CHROME_PAD || '/usr/bin/google-chrome';
    if (!existsSync(PW) || !existsSync(CHROME)) { check('post-05/post-07: Chrome і playwright-core доступні (CHROME_PAD, PLAYWRIGHT_CORE)', false, `${PW} ${CHROME}`); return; }
    try {
      const js = await bundel([
        "import { createElement } from 'react';",
        "import { createRoot } from 'react-dom/client';",
        "import MailMessageBody, { bereidMailVoor } from './src/MailBerichtTekst';",
        '(window as unknown as Record<string, unknown>).proef = {',
        '  bereidMailVoor,',
        '  toon(html: string, afzender: string) {',
        "    const k = document.getElementById('k')!; k.innerHTML = '';",
        "    createRoot(k).render(createElement(MailMessageBody, { lang: 'nl', context: { service: 'mail' }, accountId: 'acc-1', cacheAccountId: 'u-proef\\u001facc-1', messageId: 'bericht-1', renderBody: { kind: 'html', html, text: '', inlineResources: [] }, fallbackText: '-', afzender }));",
        '  },',
        '};',
      ].join('\n'), 'browser', resolve(map, 'proef.js'), o);
      const { chromium } = await import(pathToFileURL(PW).href) as { chromium: { launch: (o: unknown) => Promise<any> } };
      const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage();
        const verzoeken: string[] = [];
        const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        await page.route('**/*', async (r: any) => {
          const u = String(r.request().url());
          if (/^(data|blob|about):/.test(u)) return r.continue();
          if (u === 'https://proef.invalid/') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="k"></div><script src="/proef.js"></script></body></html>' });
          if (u === 'https://proef.invalid/proef.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(js, 'utf8') });
          verzoeken.push(`${r.request().method()} ${u}${u.includes('/api/') ? ` ${String(r.request().postData() || '').slice(0, 200)}` : ''}`);
          if (u.startsWith('https://proef.invalid/api/')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: PNG, contentType: 'image/png' }) });
          return r.abort(); // niets gaat echt naar buiten
        });
        await page.goto('https://proef.invalid/');
        await page.waitForFunction(() => Boolean((window as unknown as { proef?: unknown }).proef), null, { timeout: 15000 });

        // post-05: тіло листа поза читальним вікном (як у «Попередній перегляд») не тягне зовнішніх зображень без згоди
        const brief = '<p>Привіт</p><img src="https://tracker.example/pixel.gif?id=slachtoffer" width="1" height="1"><img src="https://tracker.example/logo.png">';
        await page.evaluate((h: string) => (window as any).proef.toon(h, 'Volger <volg@tracker.example>'), brief);
        await page.waitForTimeout(2000);
        const naOpenen = verzoeken.filter((v) => /remote-image|tracker\.example/.test(v));
        const strook = await page.locator('[data-mail-beelden-strook]').count();
        let naKlik: string[] = [];
        if (strook) { await page.getByRole('button', { name: 'Eén keer tonen' }).click(); await page.waitForTimeout(1500); naKlik = verzoeken.filter((v) => /remote-image/.test(v)); }
        check('post-05: лист поза читальним вікном не завантажує зовнішніх зображень одразу; видно смужку «N зовнішніх зображень приховано»',
          naOpenen.length === 0 && strook === 1, `запитів=${naOpenen.length} [${naOpenen.join(' | ').slice(0, 300)}] смужка=${strook}`);
        check('post-05: «Показати один раз» завантажує зображення через власний сервер (remote-image), не з оглядача',
          strook === 1 && naKlik.length >= 1 && !verzoeken.some((v) => /^GET https:\/\/tracker\.example/.test(v)), `remote-image=${naKlik.length} напряму=${verzoeken.filter((v) => /^GET https:\/\/tracker/.test(v)).length}`);

        // post-07: обхід фільтра url() у стилях
        verzoeken.length = 0;
        const gevallen: Array<[string, string, boolean]> = [
          ['екранування «\\75 rl(»', '<div id="a" style="background-image:\\75 rl(https://tracker.example/esc.png?id=1);color:#123456">a</div>', false],
          ['екранування «\\000075rl(» і ВЕЛИКІ літери', '<div id="b" style="background:\\000075rl(https://tracker.example/esc2.png) no-repeat;BACKGROUND-IMAGE:URL(https://tracker.example/up.png)">b</div>', false],
          ['image-set з екрануванням', '<div id="c" style="background-image:image-s\\65t(\'https://tracker.example/set.png\' 1x)">c</div>', false],
          ['власна властивість + var()', '<div id="d" style="--x:url(https://tracker.example/var.png);background-image:var(--x)">d</div>', false],
          // Після перевірки (g10g-T2): shorthand із var() Chrome тримає як «pending substitution» — лонгхенди порожні, сирий текст лишався.
          ['g10g-T2: shorthand + var() в image-set з екрануванням', '<div id="f" style="background:\\69 mage-set(var(--x) 1x);--x:&quot;https://tracker.example/t2a.png&quot;">f</div>', false],
          ['g10g-T2: shorthand + var() в image-set без екранування', '<div id="g" style="background:image-set(var(--x) 1x);--x:&quot;https://tracker.example/t2b.png&quot;">g</div>', false],
          ['g10g-T2: shorthand = var() з image-set у змінній', '<div id="h" style="background:var(--y);--y:image-set(&quot;https://tracker.example/t2c.png&quot; 1x)">h</div>', false],
          ['g10g-T2: border-image + var()', '<div id="i" style="border:5px solid red;border-image:\\69 mage-set(var(--w) 1x) 30 round;--w:&quot;https://tracker.example/t2d.png&quot;">i</div>', false],
          ['g10g-T2: екранований v\\61r() у shorthand', '<div id="j" style="background:\\69 mage-set(v\\61r(--x) 1x);--x:&quot;https://tracker.example/t2e.png&quot;">j</div>', false],
          ['g10g-T2: темна тема з shorthand + var()', '<style>@media (prefers-color-scheme: dark){#k{background:\\69 mage-set(var(--z) 1x);--z:"https://tracker.example/t2f.png";color:#eeeeee}}</style><div id="k">k</div>', true],
          ['темна тема: @media (prefers-color-scheme: dark) з url() і position:fixed', '<style>@media (prefers-color-scheme: dark){#e{background-image:url(https://tracker.example/dark.png);position:fixed;top:0;left:0;color:#eeeeee}}</style><div id="e">e</div>', true],
        ];
        const uitkomsten: Array<{ naam: string; html: string }> = [];
        for (const [naam, html, donker] of gevallen) {
          const uit = await page.evaluate(({ h, d }: { h: string; d: boolean }) => (window as any).proef.bereidMailVoor(h, 'Eerdere correspondentie', d ? { oppervlak: '#1e2026', tekst: '#e7e9ee' } : undefined), { h: html, d: donker }) as string;
          uitkomsten.push({ naam, html: uit });
        }
        // Обидва результати відтворюємо в iframe (без CSP — це і є «другий шар»): жодного запиту до чужого хоста.
        for (const u of uitkomsten) {
          await page.evaluate((src: string) => new Promise<void>((ok) => { const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-same-origin'); f.style.cssText = 'width:600px;height:200px'; f.onload = () => ok(); f.srcdoc = src; document.body.appendChild(f); setTimeout(ok, 1500); }), u.html);
        }
        await page.waitForTimeout(1500);
        const extern = verzoeken.filter((v) => /tracker\.example/.test(v));
        const slecht = uitkomsten.filter((u) => {
          const stijlen = [...u.html.matchAll(/\sstyle="([^"]*)"/g)].map((x) => x[1]).join(';');
          return /url\(|image-set\(|var\(|\\[0-9a-f]/i.test(stijlen) || /(?:^|;)\s*--/.test(stijlen) || /position:\s*fixed/i.test(stijlen);
        }).map((u) => u.naam);
        check('post-07: CSS-екранування, image-set, var()/власні властивості і правила темної теми не лишають url()/var()/--*/position:fixed у стилях листа',
          slecht.length === 0, slecht.join('; '));
        check('post-07: показ підготовленого листа в оглядачі (без CSP) не робить жодного запиту до чужого хоста', extern.length === 0, extern.join(' | ').slice(0, 400));
        const a = uitkomsten[0].html;
        check('post-07: фонове зображення з екрануванням не губиться, а йде через власний сервер (data-mail-background-src)',
          /data-mail-background-src="https:\/\/tracker\.example\/esc\.png\?id=1"/.test(a) && /color:\s*rgb\(18, 52, 86\)|#123456/i.test(a), a.slice(0, 400));
      } finally { await browser.close(); }
    } catch (e) { check('post-05/post-07: перевірка в Chrome виконалася', false, String((e as Error)?.stack || e).slice(0, 800)); }
  } finally {
    await rm(map, { recursive: true, force: true });
  }
}
