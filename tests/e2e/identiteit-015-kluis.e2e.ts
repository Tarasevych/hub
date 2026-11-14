// IDENTITEIT-015 (група «kluis-gast-herstel», приймання): справжній Chromium, вигадані особи (@example.test), кожна — окремий пристрій.
//  A. Шифрування (схвалена людина K, не власник сайту): стан сховища й реєстр захищених даних; ключ доступу з PRF у віртуальному
//     автентифікаторі CDP WebAuthn; «Увімкнути» → код відновлення сховища один раз; ключ доступу як ключ; пробний зашифрований запис
//     (фото відправника, мережа не потрібна); «Заблокувати» → запис не читається; «Розблокувати passkey» → читається; відновлення
//     кодом сховища (новий код, «Готово» — старий більше не діє). Повторне шифрування давнього запису (стан вікон, записаний до
//     ввімкнення): друга вкладка натискає «Заблокувати» посеред роботи → «не завершено N з M» → розблокувати → «Продовжити» → готово,
//     давній і новий записи читаються, давній тепер під власним ключем.
//  B. Гостьові коди для НЕ-власника за прапорцем gastcodes-iedereen (передумова власника сайту; у тестовій базі вмикаємо самі):
//     без прапорця — пояснення; з ним — обмежений код (назва, приватна нотатка, вибрані розділи, строк, кількість використань,
//     одноразовий/багаторазовий), показ коду й QR (на знімку розмито), зміна строку, стан, історія, відкликання. Гостем у новому
//     контексті без cookie: лише дозволені розділи й лише читання, нотатки немає; вичерпання кількості; строк (зсув SQL) і відкликання
//     припиняють доступ.
//  C. Відновлення: огляд готовності без таємних значень; (а) після втрати пристрою (новий контекст без ключа доступу й автентифікатора)
//     код відновлення ОБЛІКОВОГО ЗАПИСУ відчиняє вхід на воротах другого кроку; (б) зашифроване він не відкриває — без коду сховища
//     зрозуміла відмова, з кодом сховища — запис читається.
// Знімки tests/e2e/знімки-015/kluis-*.png (≤ 12, знеособлені: коди, QR і адреси розмито/замасковано). Таємні значення не друкуються.
// Acceptatie «kluis-gast-herstel»: versleuteling met eigen sleutel, gastcodes voor niet-eigenaars, herstel van toegang.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { BrowserContext, Page } from 'playwright-core';
import { checker, totpCode } from '../eenheid/hulp/nep-google';
import { actieVoorPad } from '../../shared/stap-op-acties';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { HOSTS, ID, api, apparaat, horizontaal, persoon, sluit, verberg, type Persoon } from './hulp/sessie-015';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
// Знімки цієї групи комітяться разом із тестом (знеособлені).
const ZNIMKY = process.env.E2E_ZNIMKY_015 || 'tests/e2e/знімки-015';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Очікувані відмови цього сценарію (кожна — частина перевірки); решта HTTP ≥ 400 і помилок консолі — помилка.
const VERWACHT = [
  /^http 403 .*\/api\/owner\/(sleutelkluis\/(inschakelen|herversleutelen|herstelcode\/vernieuwen|passkey\/koppelen\/opties)|access\/(toegangscodes\/(maken|wijzigen)|passkeys\/registreren\/opties))( |$)/,
  /^http 403 .*\/api\/owner\/agents\/activity/,
  /^http 423 .*\/api\/owner\/sleutelkluis\/herversleutelen\/verder \(SLEUTELKLUIS_GESLOTEN\)/,
  /^http 40[03] .*\/api\/owner\/sleutelkluis\/ontgrendelen\/herstelcode \(SLEUTELKLUIS_HERSTELCODE_ONGELDIG\)/,
  /^console: \[sleutelkluis\] (herversleutelen SLEUTELKLUIS_GESLOTEN|ontgrendel-code SLEUTELKLUIS_HERSTELCODE_ONGELDIG)/,
];
// Гість: 401/403/400 на /api/gast і 401 на маршрутах власника — саме те, що перевіряємо.
const GAST_VERWACHT = [/^http 40[0-3] .*\/api\/gast\//, /^http 401 .*\/api\/owner\//];
// Вхід до коду на воротах другого кроку: запити застосунку відповідають «сеанс не повний» (TWEEDE_FACTOR_POORT) — так задумано.
const POORT_VERWACHT = [/^http 400 .*\/api\/owner\/access\/stap-op \(ACCESS_RECOVERY_INVALID\)$/, /\(TWEEDE_FACTOR_POORT\)$/, /^http 40[13] .*\(OWNER_SESSION_CONTEXT_REQUIRED|ACCOUNT_NOT_APPROVED\)$/];

function volg(page: Page, lijst: string[]) {
  page.on('pageerror', (e) => lijst.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) lijst.push(`console: ${m.text()}`); });
  page.on('response', async (q) => {
    if (q.status() < 400) return;
    const code = await q.json().then((j: { error?: string }) => j?.error || '').catch(() => '');
    lijst.push(`http ${q.status()} ${q.url().split('?')[0]}${code ? ` (${code})` : ''}`);
  });
}
const zonder = (lijst: string[], verwacht: RegExp[]) => lijst.filter((f) => !verwacht.some((v) => v.test(f)));

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-015 kluis-gast-herstel');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaarEmail = `e2e-k15-eig-${T}@example.test`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaarEmail, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(ZNIMKY, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [], gastFouten: string[] = [], poortFouten: string[] = [], davne: string[] = [];
  const emails: string[] = [];
  const geheimen: string[] = []; // для перевірки «таємне не на сторінці огляду»
  let fotos = 0;
  const foto = async (page: Page, naam: string, maat?: { width: number; height: number }) => {
    if (maat) { await page.setViewportSize(maat); await page.waitForTimeout(350); }
    await verberg(page);
    await page.screenshot({ path: `${ZNIMKY}/kluis-${naam}.png`, fullPage: false });
    fotos++;
  };
  const VLAGGEN = ['gastcodes-iedereen'];
  const vlagVooraf = (await pool.query('SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = ANY($1)', [VLAGGEN])).rows;
  const vlagZet = (sleutel: string, gebruikers: string[]) => pool.query('UPDATE app.feature_flags SET aan = true, standaard = false, percentage = 0, gebruikers = $2 WHERE sleutel = $1', [sleutel, gebruikers]);
  const policyVoor = (await pool.query("select id, data from app.records where tbl='access_method_policy_v1' and data->>'tenantKey'='global' order by seq limit 1")).rows[0] as { id: string; data: Record<string, unknown> } | undefined;
  const idVanEmail = async (email: string) => String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id || '');
  const goedkeuren = async (p: Persoon, naam: string) => { const id = await idVanEmail(p.email); await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', name: naam })]); return id; };
  const idv = (p: Persoon, pad: string, extra: Record<string, unknown> = {}) => p.b.verzoek('id.tarasevych.com', pad, p.b.ctxBody('identity', extra));
  const mailv = (p: Persoon, pad: string, extra: Record<string, unknown> = {}) => p.b.verzoek('mail.tarasevych.com', pad, p.b.ctxBody('mail', extra));
  const tekstOp = async (page: Page, re: RegExp, ms = 8000) => page.getByText(re).first().waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
  // Підроблений Google для повторного входу (step-up) у цьому контексті браузера.
  const metGoogle = async (ctx: BrowserContext, p: Persoon) => ctx.route('https://accounts.google.com/**', async (route) => {
    const u = new URL(route.request().url());
    const code = G.codeVoor(p.sub, p.email, u.searchParams.get('nonce') || '', Math.floor(Date.now() / 1000));
    const terug = new URL(u.searchParams.get('redirect_uri') || `${ID}/`);
    terug.searchParams.set('state', u.searchParams.get('state') || ''); terug.searchParams.set('code', code);
    await route.fulfill({ status: 302, headers: { location: terug.href } });
  });
  // Віртуальний автентифікатор (ключ доступу на «цьому пристрої»), з PRF — як справжній платформний ключ.
  const metSleutel = async (ctx: BrowserContext, page: Page) => {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const opties = { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true };
    const prf = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { ...opties, hasPrf: true } } as never).then(() => true).catch(() => false);
    if (!prf) await cdp.send('WebAuthn.addVirtualAuthenticator', { options: opties } as never);
    return prf;
  };
  // Вікно «Підтвердіть доступ»: ключем доступу (сильне підтвердження). Повертає, чи з'являлося вікно.
  const bevestigPasskey = async (page: Page) => {
    const v = page.getByRole('dialog');
    if (!(await v.waitFor({ timeout: 8000 }).then(() => true).catch(() => false))) return 'geen';
    await page.waitForTimeout(200);
    await v.getByRole('button', { name: 'Використати passkey' }).first().click();
    await v.waitFor({ state: 'detached', timeout: 20000 }).catch(() => undefined);
    return 'passkey';
  };
  // Сильне підтвердження ключем доступу цього пристрою — ті самі запити, що й вікно «Підтвердіть доступ» (без вікна).
  const sterkViaPagina = (page: Page, actie: string) => page.evaluate(async (a) => {
    const tab = sessionStorage.getItem('tsv-canonical-tab-v1') || '';
    const post = async (p: string, b: Record<string, unknown>) => { const r = await fetch(p, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'identity', tabContext: tab, sourceOrigin: location.origin, ...b }) }); return { status: r.status, data: await r.json().catch(() => ({})) }; };
    const naar = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
    const terug = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const o = await post('/api/owner/access/stap-op/passkey/opties', { actie: a });
    const pk = o.data.publicKey;
    const cred = await navigator.credentials.get({ publicKey: { challenge: naar(pk.challenge), rpId: pk.rpId, userVerification: 'required', allowCredentials: (pk.allowCredentials || []).map((c: { id: string }) => ({ type: 'public-key', id: naar(c.id) })) } }) as PublicKeyCredential;
    const r = cred.response as AuthenticatorAssertionResponse;
    return (await post('/api/owner/access/stap-op/passkey', { uitdagingId: o.data.uitdagingId, actie: a, assertie: { credentialId: terug(cred.rawId), clientDataJSON: terug(r.clientDataJSON), authenticatorData: terug(r.authenticatorData), signature: terug(r.signature) } })).status;
  }, actie);
  const kluis = (page: Page) => page.locator('[data-access-section="sleutelkluis"]');
  const stand = async (page: Page) => String(await kluis(page).locator('[data-sleutelkluis-stand]').getAttribute('data-sleutelkluis-stand'));
  const wachtStand = async (page: Page, s: string, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await stand(page).catch(() => '')) === s) return true; await page.waitForTimeout(200); } return false; };
  const openMethods = async (page: Page) => { await page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' }); await kluis(page).waitFor({ timeout: 20000 }); await page.waitForTimeout(400); };
  const ADRES = `proef-afzender-${T}@example.test`;
  const OUD = { id: `proef-oud-${T}`, soort: 'mail-koppelen', titel: 'Пробний давній запис', adres: `proef-oud-${T}@example.test`, stap: 'adres', klein: true, dienst: 'hub', aanbieder: 'imap' };
  const leesOud = async (page: Page) => { const r = await api(page, '/api/owner/vensters/laden'); const v = (r.data.vensters || []) as Array<{ id: string; titel: string }>; return { leesbaar: v.some((x) => x.id === OUD.id && x.titel === OUD.titel), sleutel: String(r.data.sleutel || ''), status: r.status }; };
  const leesNieuw = async (p: Persoon) => { const r = await mailv(p, '/api/owner/mail/afzender-beelden', { adressen: [ADRES] }); const b = ((r.data.beelden || []) as Array<{ adres: string; soort: string; data?: string; sleutel?: string }>).find((x) => x.adres === ADRES); return { leesbaar: b?.soort === 'persoon' && /^data:image\/png;base64,/.test(String(b.data || '')), gesloten: b?.sleutel === 'gesloten', status: r.status, ruw: JSON.stringify(r.data).slice(0, 200) }; };
  const oudRij = async (uid: string) => (await pool.query("select vensters_versleuteld is not null as dek, jsonb_array_length(vensters) n from app.venster_stand where user_id=$1 and ruimte='prive'", [uid])).rows[0] as { dek: boolean; n: number } | undefined;

  try {
    // ---------------------------------------------------------------- особи
    const O = await persoon(G as never, 'k15-eig', T); emails.push(O.email);
    const K = await persoon(G as never, 'k15-lid', T); emails.push(K.email);
    const oId = await goedkeuren(O, 'Власниця Проба'), kId = await goedkeuren(K, 'Катерина Проба');
    check('підготовка: власник сайту і схвалена людина K (не власник)', !!oId && !!kId && O.email === eigenaarEmail);
    await vlagZet('gastcodes-iedereen', [oId]); // «Тільки я» — як після міграції 0274

    // ================================================================ A. шифрування
    const kluisCodes: string[] = [];
    const tK = { ok: false, codes: [] as string[], e: '' };
    let prfOk = false;
    // Пристрій K (ноутбук): тут живе ключ доступу; на ньому ж частина B.
    const toestel = await apparaat(browser, K, { taal: 'uk', width: 1280, height: 860 });
    {
      const { ctx, page } = toestel;
      volg(page, fouten);
      await metGoogle(ctx, K);
      prfOk = await metSleutel(ctx, page);
      // давній запис: стан вікон, збережений ДО ввімкнення (звичайний серверний ключ)
      await openMethods(page);
      const o0 = await api(page, '/api/owner/vensters/opslaan', { vensters: [OUD] });
      check('давній запис (стан вікон) збережено до ввімкнення шифрування — відкритою колонкою', o0.status === 200 && (await oudRij(kId))?.dek === false && (await oudRij(kId))?.n === 1, JSON.stringify(await oudRij(kId)));
      // ключ доступу на цьому пристрої (через повторний вхід Google — як у «Способах входу»)
      const pk = page.locator('[data-access-section="passkeys"]');
      await pk.getByRole('button', { name: 'Додати passkey' }).click();
      await pk.locator('#passkey-naam').fill('Ноутбук Катерини');
      await pk.getByRole('button', { name: 'Продовжити' }).click();
      const v1 = page.getByRole('dialog');
      if (await v1.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) await v1.getByRole('button', { name: 'Підтвердити повторним входом через Google' }).click();
      await page.waitForURL(/\/methods/, { timeout: 25000 }).catch(() => undefined);
      await pk.locator('[data-passkey]').first().waitFor({ timeout: 25000 }).catch(() => undefined);
      check('передумова: ключ доступу додано (віртуальний автентифікатор CDP' + (prfOk ? ' з PRF' : ', без PRF') + ')', (await pk.locator('[data-passkey]').count()) === 1);
      await openMethods(page);
      await kluis(page).scrollIntoViewIfNeeded();
      const kt0 = await kluis(page).innerText();
      check('стан сховища: «Ключ даних» — вимкнено, кнопка «Увімкнути»', (await stand(page)) === 'uit' && /Ключ даних/.test(kt0) && (await kluis(page).getByRole('button', { name: 'Увімкнути' }).count()) === 1, kt0.slice(0, 200));
      await kluis(page).getByRole('button', { name: 'Про шифрування даних' }).click();
      const tip = await page.getByText(/Адміністратор сервера, резервна копія бази/).first().isVisible().catch(() => false);
      check('підказка (?) біля «Шифрування моїх даних»: хто не прочитає дані й наслідок утрати коду і всіх ключів доступу', tip && await page.getByText(/Втрата коду відновлення і всіх passkey = втрата даних/).first().isVisible().catch(() => false));
      await page.keyboard.press('Escape');
      await kluis(page).locator('.sleutelkluis-register-knop').click();
      const reg = kluis(page).locator('[data-sleutelkluis-register] li');
      await reg.first().waitFor({ timeout: 5000 }).catch(() => undefined);
      const regT = await kluis(page).locator('[data-sleutelkluis-register]').innerText();
      check('перелік захищених даних: що вже під власним ключем (dek) і що ще ні — з причиною', (await kluis(page).locator('[data-register-stand="dek"]').count()) >= 5 && (await kluis(page).locator('[data-register-stand="nog-niet"]').count()) >= 3 && /app\.venster_stand/.test(regT) && /ще ні: \S/.test(regT), regT.slice(0, 300));
      await foto(page, 'stand-register-computer');
      await kluis(page).locator('.sleutelkluis-register-knop').click();

      // увімкнути: сильне підтвердження ключем доступу → код сховища один раз
      await kluis(page).getByRole('button', { name: 'Увімкнути' }).click();
      const viaPk = await bevestigPasskey(page);
      const nieuw = kluis(page).locator('[data-sleutelkluis-nieuwe-code]');
      await nieuw.waitFor({ timeout: 25000 }).catch(() => undefined);
      const code1 = (await nieuw.locator('code').innerText().catch(() => '')).trim();
      if (code1) { kluisCodes.push(code1); geheimen.push(code1); }
      check('«Увімкнути» → сильне підтвердження ключем доступу → код відновлення сховища показано один раз (5 груп по 4)', viaPk === 'passkey' && /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/.test(code1) && (await stand(page)) === 'open', `${viaPk} ${code1.length}`);
      const gereed = nieuw.getByRole('button', { name: 'Готово' });
      check('«Готово» неактивне без «Я зберіг код»; є «Завантажити» і «Копіювати»', await gereed.isDisabled() && (await nieuw.getByRole('button', { name: 'Завантажити' }).count()) === 1 && (await nieuw.getByRole('button', { name: 'Копіювати' }).count()) === 1);
      await nieuw.scrollIntoViewIfNeeded();
      await foto(page, 'code-een-keer-computer');
      await nieuw.getByLabel('Я зберіг код').check();
      await gereed.click();
      await nieuw.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
      check('після «Готово» код більше не на сторінці', !(await page.content()).includes(code1));

      // ключ доступу як ключ сховища (PRF)
      const koppel = kluis(page).getByRole('button', { name: 'Додати passkey як ключ' });
      await koppel.waitFor({ timeout: 10000 }).catch(() => undefined);
      await koppel.click();
      if (await page.getByRole('dialog').isVisible().catch(() => false)) await bevestigPasskey(page);
      await kluis(page).locator('[data-omslag="passkey"]').first().waitFor({ timeout: 20000 }).catch(() => undefined);
      const gekoppeld = (await kluis(page).locator('[data-omslag="passkey"]').count()) === 1;
      check('ключ доступу з PRF тепер відкриває ключ сховища («Хто може відкрити ключ»: код відновлення + ключ доступу)', prfOk && gekoppeld && (await kluis(page).locator('[data-omslag="herstelcode"]').count()) === 1, `prf=${prfOk} ${await kluis(page).locator('[data-sleutelkluis-omslagen]').innerText().catch(() => '')}`);

      // пробний зашифрований запис (фото відправника) — вже під власним ключем
      const z = await mailv(K, '/api/owner/mail/afzender-beeld/eigen', { adres: ADRES, data: `data:image/png;base64,${PNG}` });
      const zr = (await pool.query("select data is null as leeg, data_versleuteld is not null as dek from app.afzender_beeld where user_id=$1 and bron='eigen'", [kId])).rows[0];
      const n1 = await leesNieuw(K);
      check('новий пробний запис збережено ЗАШИФРОВАНИМ (у базі немає відкритих байтів) і з відкритим ключем читається', z.status === 200 && z.data.opgeslagen === true && zr?.leeg === true && zr?.dek === true && n1.leesbaar, `${z.status} ${JSON.stringify(z.data).slice(0, 120)} ${JSON.stringify(zr)} ${n1.ruw}`);

      // замкнути → не читається
      await kluis(page).getByRole('button', { name: 'Заблокувати' }).click();
      await wachtStand(page, 'gesloten');
      const n2 = await leesNieuw(K);
      const kt1 = await kluis(page).innerText();
      check('«Заблокувати» → стан «Увімкнено, ключ закритий у цій сесії» з поясненням; зашифрований запис НЕ читається (sleutel: gesloten)', (await stand(page)) === 'gesloten' && /ключ закритий у цій сесії/.test(kt1) && /Ключ закритий: синхронізація продовжиться/.test(kt1) && !n2.leesbaar && n2.gesloten, n2.ruw);
      const zapysZakryto = await mailv(K, '/api/owner/mail/afzender-beeld/eigen', { adres: `ander-${ADRES}`, data: `data:image/png;base64,${PNG}` });
      check('з закритим ключем новий запис не зберігається відкритим (SLEUTELKLUIS_GESLOTEN, у базі нічого)', zapysZakryto.data.fout === 'SLEUTELKLUIS_GESLOTEN' && Number((await pool.query("select count(*)::int n from app.afzender_beeld where user_id=$1", [kId])).rows[0].n) === 1, JSON.stringify(zapysZakryto.data).slice(0, 120));
      await foto(page, 'gesloten-telefoon', { width: 380, height: 800 });
      check('телефон 380: розділ шифрування без горизонтальної прокрутки', (await horizontaal(page)) <= 0, String(await horizontaal(page)));
      await page.setViewportSize({ width: 1280, height: 860 });

      // відімкнути ключем доступу → читається
      const ontPk = kluis(page).getByRole('button', { name: 'Розблокувати passkey' });
      check('у закритому стані є «Розблокувати passkey» і «Код відновлення»', (await ontPk.count()) === 1 && (await kluis(page).getByRole('button', { name: 'Код відновлення' }).count()) === 1);
      await ontPk.click();
      await wachtStand(page, 'open');
      check('«Розблокувати passkey» (PRF) → ключ відкрито для цієї сесії; запис знову читається', (await stand(page)) === 'open' && await tekstOp(page, /Ключ відкрито для цієї сесії/) && (await leesNieuw(K)).leesbaar);

      // відновлення кодом сховища
      await kluis(page).getByRole('button', { name: 'Заблокувати' }).click();
      await wachtStand(page, 'gesloten');
      await kluis(page).getByRole('button', { name: 'Код відновлення' }).click();
      await kluis(page).locator('[data-sleutelkluis-code] input').fill(code1.toLowerCase());
      await kluis(page).locator('[data-sleutelkluis-code]').getByRole('button', { name: 'Розблокувати' }).click();
      await wachtStand(page, 'open');
      const nieuw2 = kluis(page).locator('[data-sleutelkluis-nieuwe-code]');
      await nieuw2.waitFor({ timeout: 15000 }).catch(() => undefined);
      const code2 = (await nieuw2.locator('code').innerText().catch(() => '')).trim();
      if (code2) { kluisCodes.push(code2); geheimen.push(code2); }
      check('відновлення кодом сховища (малими літерами) → ключ відкрито, показано НОВИЙ код і попередження, що старий діє до «Готово»', (await stand(page)) === 'open' && /^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/.test(code2) && code2 !== code1 && /лише тоді використаний код перестане діяти/.test(await kluis(page).innerText()) && (await leesNieuw(K)).leesbaar);
      await nieuw2.getByLabel('Я зберіг код').check();
      await nieuw2.getByRole('button', { name: 'Готово' }).click();
      await nieuw2.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
      const oudeCode = await idv(K, '/api/owner/sleutelkluis/ontgrendelen/herstelcode', { code: code1 });
      check('після «Готово» використаний код сховища більше не діє (403 SLEUTELKLUIS_HERSTELCODE_ONGELDIG)', oudeCode.status === 403 && oudeCode.data.error === 'SLEUTELKLUIS_HERSTELCODE_ONGELDIG', `${oudeCode.status} ${oudeCode.data.error}`);

      // повторне шифрування давніх записів: перервати (друга вкладка закриває ключ) → «Продовжити»
      const vO = await leesOud(page);
      check('давній запис до повторного шифрування читається серверним ключем (позначка serversleutel), у базі — відкритий', vO.leesbaar && vO.sleutel === 'serversleutel' && (await oudRij(kId))?.dek === false, JSON.stringify(vO));
      const tweede = await ctx.newPage();
      volg(tweede, fouten);
      await openMethods(tweede);
      let onderbroken = false;
      await page.route('**/api/owner/sleutelkluis/herversleutelen/verder', async (route) => {
        if (!onderbroken) {
          onderbroken = true;
          // людина в іншій вкладці натискає «Заблокувати», поки робота йде
          await tweede.reload({ waitUntil: 'networkidle' }); await kluis(tweede).waitFor({ timeout: 15000 });
          await kluis(tweede).getByRole('button', { name: 'Заблокувати' }).click();
          await wachtStand(tweede, 'gesloten');
        }
        await route.continue();
      });
      await kluis(page).getByRole('button', { name: 'Перешифрувати мої дані зараз' }).click();
      await bevestigPasskey(page);
      const onaf = kluis(page).locator('[data-sleutelkluis-onderbroken]');
      await onaf.waitFor({ timeout: 25000 }).catch(() => undefined);
      await page.unroute('**/api/owner/sleutelkluis/herversleutelen/verder');
      const onafT = await onaf.innerText().catch(() => '');
      const [gedaan, totaal] = String(await onaf.getAttribute('data-sleutelkluis-onderbroken').catch(() => '0/0')).split('/').map(Number);
      check('перервано посередині: «Повторне шифрування не завершено: оброблено N з M» і підказка розблокувати й «Продовжити»; помилка зрозуміла',
        onderbroken && gedaan >= 1 && totaal > gedaan && /не завершено: оброблено \d+ з \d+/.test(onafT) && /Розблокуйте ключ і натисніть «Продовжити»/.test(onafT) && await tekstOp(page, /Ключ даних закритий\. Розблокуйте його/), `${onafT} ${gedaan}/${totaal}`);
      await kluis(page).locator('[data-sleutelkluis-herversleutelen]').scrollIntoViewIfNeeded();
      await foto(page, 'onderbroken-computer');
      await kluis(page).getByRole('button', { name: 'Розблокувати passkey' }).click();
      await wachtStand(page, 'open');
      const verder = kluis(page).locator('[data-sleutelkluis-verder]');
      check('після розблокування — «Продовжити» і «Почати заново»', (await verder.count()) === 1 && (await kluis(page).getByRole('button', { name: 'Почати заново' }).count()) === 1);
      await verder.click();
      check('«Продовжити» доводить до кінця: «Готово: оброблено M з M»', await tekstOp(page, new RegExp(`Готово: оброблено ${totaal} з ${totaal}`), 30000));
      await page.waitForTimeout(500);
      const vO2 = await leesOud(page);
      const uitslag = await kluis(page).locator('[data-sleutelkluis-uitslag]').innerText().catch(() => '');
      check('після завершення давній запис під власним ключем (у базі зашифровано) і читається; новий теж читається', (await oudRij(kId))?.dek === true && vO2.leesbaar && vO2.sleutel === '' && (await leesNieuw(K)).leesbaar && /app\.venster_stand/.test(uitslag), `${JSON.stringify(await oudRij(kId))} ${JSON.stringify(vO2)} ${uitslag.slice(0, 200)}`);
      check('незавершеного перебігу більше немає', (await onaf.count()) === 0 && (await verder.count()) === 0);
      await kluis(page).locator('[data-sleutelkluis-herversleutelen]').scrollIntoViewIfNeeded();
      await foto(page, 'herversleuteld-telefoon', { width: 380, height: 800 });
      await page.setViewportSize({ width: 1280, height: 860 });
      await tweede.close();
    }

    // ================================================================ B. гостьові коди (не-власник за прапорцем)
    {
      const { ctx, page } = toestel;
      const tc = page.locator('[data-access-section="toegangscodes"]');
      await page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' });
      await tc.waitFor({ timeout: 20000 });
      const nb = await tc.innerText();
      check('без прапорця (передумова «Тільки я»): K бачить пояснення й перехід «До «Доступу до простору»», а не порожнє місце', (await tc.getAttribute('data-toegangscodes-niet-beschikbaar')) !== null && /вмикає власник сайту/.test(nb) && (await tc.locator('a[href="/sharing"]').count()) === 1, nb.slice(0, 200));
      await vlagZet('gastcodes-iedereen', [oId, kId]); // передумова власника: «Вибрані люди» + K
      await page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' });
      await tc.waitFor({ timeout: 20000 });
      await tc.getByRole('button', { name: 'Створити код доступу' }).waitFor({ timeout: 15000 });
      check('прапорець для K увімкнено: блок «Коди доступу для інших» доступний', (await tc.getAttribute('data-toegangscodes-niet-beschikbaar')) === null && (await tc.getByRole('button', { name: 'Створити код доступу' }).count()) === 1);
      const NOTITIE = `Приватна нотатка для себе ${T.slice(-4)}`;
      const maak = async (o: { naam: string; scopes: string[]; preset: string; eenmalig?: boolean; max?: string; notitie?: string; telefoon?: boolean; alleEerst?: boolean }) => {
        await tc.getByRole('button', { name: 'Створити код доступу' }).click();
        const f = tc.locator('[data-code-form]');
        await f.locator('#toegangscode-naam').fill(o.naam);
        if (o.notitie) await f.locator('#toegangscode-notitie').fill(o.notitie);
        if (o.alleEerst) {
          await f.locator('[data-scope-modus="alle"]').check();
          const alle = await f.locator('[data-scope]').evaluateAll((els) => els.every((e) => (e as HTMLInputElement).checked));
          await f.locator('[data-scope-modus="gekozen"]').check();
          const leeg = await f.locator('[data-scope]').evaluateAll((els) => els.every((e) => !(e as HTMLInputElement).checked));
          check('«Усі дозволені розділи» одним вибором позначає весь перелік сервера; «Лише вибрані» повертає ручний вибір', alle && leeg && (await f.locator('[data-scope]').count()) >= 3);
        }
        for (const s of o.scopes) await f.locator(`[data-scope="${s}"]`).check();
        await f.getByLabel(o.preset, { exact: true }).check();
        if (o.eenmalig) await f.getByLabel('Одноразовий').check();
        else { await f.getByLabel('Багаторазовий до закінчення строку').check(); if (o.max) await f.locator('.toegangscode-max input').fill(o.max); }
        if (o.telefoon) { await page.setViewportSize({ width: 380, height: 800 }); await f.scrollIntoViewIfNeeded(); check('телефон 380: форма гостьового коду без горизонтальної прокрутки', (await horizontaal(page)) <= 0); await foto(page, 'gast-formulier-telefoon'); await page.setViewportSize({ width: 1280, height: 860 }); }
        await f.getByRole('button', { name: 'Створити код' }).click();
        const via = await bevestigPasskey(page);
        const getoond = tc.locator('[data-code-getoond]');
        await getoond.waitFor({ timeout: 20000 });
        const code = (await getoond.locator('[data-code]').innerText()).trim();
        geheimen.push(code);
        return { code, via, getoond };
      };
      const c1 = await maak({ naam: 'Для сусідки', scopes: ['profiel.lezen', 'apparaten.lezen'], preset: '1 день', max: '2', notitie: NOTITIE, telefoon: true });
      check('створення: сильне підтвердження ключем доступу (або ще чинне за 5 хв) → код XXXX-XXXX-XXXX-XXXX показано один раз із QR і «Копіювати посилання»', ['passkey', 'geen'].includes(c1.via) && /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(c1.code) && (await c1.getoond.locator('svg path').count()) >= 1 && (await c1.getoond.getByRole('button', { name: 'Копіювати посилання' }).count()) === 1, c1.via);
      await c1.getoond.scrollIntoViewIfNeeded();
      await foto(page, 'gast-code-qr-computer');
      await c1.getoond.getByRole('button', { name: 'Готово' }).click();
      const rij = (naam: string) => tc.locator('[data-toegangscode]', { has: page.locator('strong', { hasText: naam }) }).first();
      const r1 = rij('Для сусідки');
      await r1.waitFor({ timeout: 10000 });
      const r1t = await r1.innerText();
      check('рядок коду: «Діє», розділи «Профіль» + пристрої, «Діє до», «багаторазовий», «0 з 2», приватна нотатка видна лише власниці, код не показано',
        (await r1.getAttribute('data-status')) === 'actief' && /Діє до/.test(r1t) && /багаторазовий/.test(r1t) && /0 з 2/.test(r1t) && r1t.includes(NOTITIE) && !r1t.includes(c1.code), r1t.slice(0, 400));
      const c1Id = String(await r1.getAttribute('data-toegangscode'));
      // зміна строку: скоротити до 1 години (без додаткового підтвердження)
      const dovoor = await r1.locator('[data-code-info]').innerText();
      await r1.getByRole('button', { name: 'Змінити строк' }).click();
      await r1.locator('[data-bevestig="code-verloop"]').getByLabel('1 година', { exact: true }).check();
      check('зміна строку: скорочення — «без додаткового підтвердження»', /Скоротити строк можна без додаткового підтвердження/.test(await r1.locator('[data-bevestig="code-verloop"]').innerText()));
      await r1.getByRole('button', { name: 'Зберегти строк' }).click();
      await r1.locator('[data-bevestig="code-verloop"]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
      const r1b = rij('Для сусідки');
      const dona = await r1b.locator('[data-code-info]').innerText();
      const dbVerloop = (await pool.query('select extract(epoch from verloopt_op - now())::int s from app.toegangscodes where id=$1', [c1Id])).rows[0]?.s;
      check('строк змінено: у рядку новий «Діє до», у базі ≈ 1 година', dovoor !== dona && /Діє до/.test(dona) && dbVerloop > 3000 && dbVerloop <= 3600, `${dovoor} → ${dona} (${dbVerloop} с)`);

      // гість 1 (новий контекст без cookie)
      const gast = async (code: string, schema: 'light' | 'dark' = 'light') => {
        const gctx = await browser.newContext({ colorScheme: schema, locale: 'uk-UA', viewport: { width: 1280, height: 860 }, timezoneId: 'Europe/Brussels', serviceWorkers: 'block' });
        const gp = await gctx.newPage();
        volg(gp, gastFouten);
        await gp.goto(`${ID}/toegang#code=${code}`, { waitUntil: 'networkidle' });
        await gp.getByRole('button', { name: 'Увійти як гість' }).click();
        const binnen = await gp.locator('[data-gast-banner]').waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
        return { gctx, gp, binnen };
      };
      const gastPost = (gp: Page, pad: string, body: unknown = {}) => gp.evaluate(async ([p, b]) => { const r = await fetch(p as string, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, data: await r.json().catch(() => ({})) as Record<string, unknown> }; }, [pad, body] as const);
      const weg = async (gp: Page) => { await gp.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await gp.locator('[data-gast-inwisselen] .gast-melding').waitFor({ timeout: 10000 }).catch(() => undefined); return /Гостьову сесію завершено/.test(await gp.locator('[data-gast-inwisselen]').innerText().catch(() => '')); };
      const g1 = await gast(c1.code);
      await g1.gp.locator('[data-gast-inhoud="profiel.lezen"] .gast-profiel').waitFor({ timeout: 10000 }).catch(() => undefined);
      const tabs = await g1.gp.locator('[data-gast-tab]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gast-tab')));
      const bt = await g1.gp.locator('[data-gast-banner]').innerText();
      const gastTekst = await g1.gp.locator('body').innerText();
      check('гість: банер «Гостьовий доступ … лише перегляд» з іменем K; лише дозволені розділи (профіль, пристрої)', g1.binnen && /лише перегляд/.test(bt) && /Катерина Проба/.test(bt) && JSON.stringify(tabs) === JSON.stringify(['profiel.lezen', 'apparaten.lezen']), `${bt} ${JSON.stringify(tabs)}`);
      check('гість не бачить приватної нотатки, адреси K чи коду', !gastTekst.includes(NOTITIE) && !gastTekst.includes(K.email) && !gastTekst.includes(c1.code));
      const sessieAntw = await gastPost(g1.gp, '/api/gast/sessie');
      check('сервер гостю нотатки теж не віддає (/api/gast/sessie)', sessieAntw.status === 200 && !JSON.stringify(sessieAntw.data).includes(NOTITIE) && !/notitie/i.test(JSON.stringify(sessieAntw.data)), JSON.stringify(sessieAntw.data).slice(0, 200));
      const jr = await gastPost(g1.gp, '/api/gast/bekijk', { scope: 'journaal.lezen' });
      const schrijf1 = await gastPost(g1.gp, '/api/owner/access/toegangscodes/maken', { service: 'identity', naam: 'гість', scopes: ['profiel.lezen'], verloop: { soort: 'nooit' } });
      const schrijf2 = await gastPost(g1.gp, '/api/owner/access/passkeys/hernoemen', { service: 'identity', id: '00000000-0000-0000-0000-000000000000', naam: 'Злам' });
      check('межі: розділ поза кодом (журнал) → 403 GAST_GEEN_TOEGANG; запис від імені K (створити код, перейменувати ключ) → 401, нічого не змінено',
        jr.status === 403 && jr.data.error === 'GAST_GEEN_TOEGANG' && schrijf1.status === 401 && schrijf2.status === 401 && (await pool.query("select data->>'name' n from app.records where id=$1", [kId])).rows[0].n === 'Катерина Проба', `${jr.status} ${schrijf1.status} ${schrijf2.status}`);
      check('лише читання: на гостьовій сторінці немає полів введення чи кнопок зміни даних (крім «Вийти»)', (await g1.gp.locator('[data-gast-inhoud] :is(input, textarea, select)').count()) === 0);
      await foto(g1.gp, 'gast-gast-computer');
      // гість 2 — друге використання, гість 3 — вичерпано
      const g2 = await gast(c1.code, 'dark');
      const g3 = await gast(c1.code);
      await g3.gp.locator('.gast-fout').waitFor({ timeout: 8000 }).catch(() => undefined);
      check('кількість використань: другий гість заходить, третій — «Код недійсний…» (2 з 2 вичерпано)', g2.binnen && !g3.binnen && /Код недійсний/.test(await g3.gp.locator('.gast-fout').innerText().catch(() => '')));
      await page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' });
      await tc.waitFor({ timeout: 20000 });
      const r1c = rij('Для сусідки');
      await r1c.waitFor({ timeout: 10000 });
      check('власниця коду бачить «2 з 2», активних гостьових сесій: 2, останнє використання', /2 з 2/.test(await r1c.innerText()) && /активних гостьових сесій: 2/.test(await r1c.innerText()) && /Останнє використання/.test(await r1c.innerText()), (await r1c.innerText()).slice(0, 300));
      const s2 = String((await g2.gctx.cookies(`${ID}/api/gast/sessie`)).find((c) => c.name === 'tsv_gast')?.value || '').split('.')[0];
      await page.goto(`${ID}/sessions?lang=uk`, { waitUntil: 'networkidle' });
      const ov = page.locator('[data-sessies-overzicht]');
      await ov.locator('[data-gast-sessie]').first().waitFor({ timeout: 20000 }).catch(() => undefined);
      const ovt = await ov.innerText().catch(() => '');
      check('«Сесії» (не-власник за прапорцем): дві гостьові сесії «Вхід за кодом доступу «Для сусідки»»', (await ov.locator('[data-gast-sessie]').count()) === 2 && /Вхід за кодом доступу «Для сусідки»/.test(ovt) && /Гостьові сесії/.test(ovt), ovt.slice(0, 300));
      await ov.locator(`[data-gast-sessie="${s2}"]`).getByRole('button', { name: 'Завершити гостьову сесію' }).click();
      await ov.locator(`[data-gast-sessie="${s2}"]`).waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
      check('«Завершити гостьову сесію»: другий гість одразу без доступу, перший лишається', (await ov.locator('[data-gast-sessie]').count()) === 1 && await weg(g2.gp) && (await gastPost(g1.gp, '/api/gast/sessie')).status === 200);
      await page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' });
      await tc.waitFor({ timeout: 20000 });
      await r1c.waitFor({ timeout: 10000 });
      const hk = r1c.locator('[data-code-geschiedenis] .toegang-uitklap');
      for (let i = 0; i < 3 && (await hk.getAttribute('aria-expanded')) !== 'true'; i++) { await hk.click(); await page.waitForTimeout(250); }
      const ht = await r1c.locator('[data-code-geschiedenis]').innerText();
      check('історія: «Код створено», «Строк змінено», «Гість увійшов із кодом», «Гість переглянув», «Відмовлено» (журнал)', /Код створено/.test(ht) && /Строк змінено/.test(ht) && /Гість увійшов із кодом/.test(ht) && /Гість переглянув/.test(ht) && /Відмовлено/.test(ht), ht.slice(0, 500));
      // відкликання → гості втрачають доступ одразу
      await r1c.getByRole('button', { name: 'Відкликати' }).click();
      const ib = r1c.locator('[data-bevestig="code-intrekken"]');
      await ib.locator('textarea').fill('Сусідка вже все переглянула');
      await ib.getByRole('button', { name: 'Відкликати код' }).click();
      await tc.locator('[data-toegangscode][data-status="ingetrokken"]').first().waitFor({ timeout: 10000 }).catch(() => undefined);
      check('відкликано: стан «Відкликано» з причиною; гість, що лишався, одразу втрачає доступ', (await rij('Для сусідки').getAttribute('data-status')) === 'ingetrokken' && /Сусідка вже все переглянула/.test(await rij('Для сусідки').innerText()) && await weg(g1.gp));
      // одноразовий код + строк (зсув SQL)
      const c2 = await maak({ naam: 'Майстер одноразово', scopes: ['apparaten.lezen'], preset: '7 днів', eenmalig: true, alleEerst: true });
      await c2.getoond.getByRole('button', { name: 'Готово' }).click();
      const g4 = await gast(c2.code);
      const g5 = await gast(c2.code);
      check('одноразовий код: перший гість заходить, другий — відмова', g4.binnen && !g5.binnen);
      const r2 = rij('Майстер одноразово');
      await r2.waitFor({ timeout: 10000 });
      const c2Id = String(await r2.getAttribute('data-toegangscode'));
      await pool.query("update app.toegangscodes set verloopt_op = now() - interval '1 second' where id = $1", [c2Id]);
      check('строк минув (зсув SQL): гість одразу втрачає доступ', await weg(g4.gp));
      await page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' });
      await tc.waitFor({ timeout: 20000 });
      const r2b = rij('Майстер одноразово');
      check('власниця: стан «Закінчився», дій над кодом немає — лише пояснення', (await r2b.getAttribute('data-status')) === 'verlopen' && /Закінчився/.test(await r2b.innerText()) && (await r2b.getByRole('button', { name: 'Відкликати' }).count()) === 0);
      await page.setViewportSize({ width: 380, height: 800 });
      await rij('Для сусідки').scrollIntoViewIfNeeded();
      check('телефон 380: перелік кодів без горизонтальної прокрутки', (await horizontaal(page)) <= 0);
      await foto(page, 'gast-lijst-telefoon');
      for (const g of [g1, g2, g3, g4, g5]) await sluit(g.gctx);
      // передумова для C: автентифікатор K на цьому ж пристрої (сильне підтвердження — ключем доступу)
      if (Date.now() % 30000 > 20000) await slaap(30000 - (Date.now() % 30000) + 200);
      const st0 = Math.floor(Date.now() / 30000);
      const su = await sterkViaPagina(page, actieVoorPad('/api/owner/access/totp/start') || 'totp');
      const st = await api(page, '/api/owner/access/totp/start');
      const cf = await api(page, '/api/owner/access/totp/confirm', { code: totpCode(String(st.data.secret || ''), st0) });
      tK.ok = su === 200 && st.status === 200 && cf.status === 200; tK.codes = (cf.data.recoveryCodes || []) as string[]; tK.e = `${su} ${st.status} ${cf.status} ${st.data.error || ''} ${cf.data.error || ''}`;
      for (const c of tK.codes) geheimen.push(c);
      await sluit(ctx);
    }

    // ================================================================ C. відновлення
    {
      const { ctx, page } = await apparaat(browser, K, { taal: 'uk', width: 1280, height: 860 });
      volg(page, fouten);
      await page.goto(`${ID}/recovery?lang=uk`, { waitUntil: 'networkidle' });
      const ov = page.locator('#herstel-overzicht');
      await ov.waitFor({ timeout: 20000 });
      await ov.locator('[data-controle]').first().waitFor({ timeout: 10000 });
      await page.waitForTimeout(800);
      const ovT = await ov.innerText();
      const controles = await ov.locator('[data-controle]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-controle')}:${e.getAttribute('data-toon')}`));
      const html = await page.content();
      check('огляд готовності: три перевірки (способи, коди облікового запису, ключ даних) з оцінкою; червоне веде до виправлення', controles.length >= 3 && controles.some((c) => c.startsWith('kluis:')) && controles.some((c) => c.startsWith('codes:slecht')) && (await ov.locator('[data-controle="codes"] button[data-ga]').count()) === 1, controles.join(','));
      check('огляд без таємних значень: жодного коду сховища, гостьового коду чи ключа на сторінці', geheimen.length >= 3 && !geheimen.some((g) => html.includes(g) || html.includes(g.replace(/-/g, ''))), `${geheimen.length}`);
      await foto(page, 'herstel-overzicht-computer');
      await sluit(ctx);
    }
    // передумова: K має автентифікатор (і коди облікового запису), власник вмикає «другий чинник обов'язковий»
    if (Date.now() % 30000 > 20000) await slaap(30000 - (Date.now() % 30000) + 200);
    const stap = Math.floor(Date.now() / 30000);
    const totp = async (p: Persoon) => { await p.b.aanmelden(p.sub, p.email, { service: 'identity', tabContext: p.tab, intent: 'step-up' }); const st = await idv(p, '/api/owner/access/totp/start'); const c = await idv(p, '/api/owner/access/totp/confirm', { code: totpCode(String(st.data.secret || ''), stap - 1) }); return { secret: String(st.data.secret || ''), codes: (c.data.recoveryCodes || []) as string[], ok: st.status === 200 && c.status === 200, st: st.status, c: c.status, e: `${st.data.error || ''} ${c.data.error || ''}` }; };
    const tO = await totp(O);
    const Osterk = await idv(O, '/api/owner/access/stap-op', { code: totpCode(tO.secret, stap) });
    const beleid = await idv(O, '/api/owner/access/policy/save', { mfa: 'required', enabled: {} });
    check('передумова: у K автентифікатор і 10 кодів відновлення облікового запису; власник сайту ввімкнув «другий чинник обов’язковий»', tK.ok && tK.codes.length === 10 && tO.ok && Osterk.status === 200 && beleid.status === 200 && beleid.data.policy?.mfa === 'required', `${tK.e} ${tO.st}/${tO.c} ${Osterk.status} ${beleid.status} ${beleid.data.error || ''}`);
    {
      // (а) пристрій утрачено: новий вхід Google, без ключа доступу й без автентифікатора
      const K2b = G.browser();
      const tab2 = randomBytes(24).toString('hex');
      await K2b.aanmelden(K.sub, K.email, { service: 'identity', tabContext: tab2, intent: 'login' });
      const K2: Persoon = { ...K, b: K2b as never, tab: tab2 };
      const { ctx, page } = await apparaat(browser, K2, { taal: 'uk', width: 380, height: 800, touch: true });
      volg(page, poortFouten);
      await page.goto(`${ID}/recovery?lang=uk`, { waitUntil: 'networkidle' });
      const poort = page.locator('[data-tweede-factor-poort]');
      await poort.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
      const dicht = await api(page, '/api/owner/access/snapshot');
      check('(а) після Google вхід не повний: вікно «Другий крок входу», дані закрито (401)', await poort.isVisible() && /Другий крок входу/.test(await poort.innerText()) && dicht.status === 401, `${dicht.status} ${dicht.data.error}`);
      await poort.getByRole('button', { name: 'Підтвердити вхід' }).click();
      const v = page.getByRole('dialog', { name: /Підтвердіть доступ/ });
      await v.waitFor({ timeout: 10000 }).catch(() => undefined);
      await page.getByRole('button', { name: 'Використати код відновлення' }).last().click();
      await page.locator('#bevestig-toegang-code').fill(tK.codes[2].toLowerCase());
      await foto(page, 'herstel-poort-telefoon');
      const herladen = page.waitForEvent('load', { timeout: 20000 }).then(() => true).catch(() => false);
      await page.getByRole('button', { name: 'Підтвердити', exact: true }).last().click();
      await herladen;
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(800);
      // до підтвердження застосунок за воротами ще питає дані — сервер відмовляє (401/403); це спостереження, не помилка входу
      const voorPoort = poortFouten.splice(0).filter((x) => /^http 40[13] .*\/api\/owner\//.test(x)).length;
      if (voorPoort) console.log(`[e2e] спостереження: ${voorPoort} відмов 401/403 на /api/owner/* за зачиненими воротами (до коду)`);
      const open = await api(page, '/api/owner/access/snapshot');
      check('(а) код відновлення облікового запису відчиняє вхід: ворота зникли, дані доступні (200)', open.status === 200 && (await poort.isVisible().catch(() => false)) === false, `${open.status} ${open.data.error || ''}`);
      const rest = Number((open.data.factors || []).find((f: { id: string }) => f.id === 'recovery')?.remaining);
      check('(а) код одноразовий: лишилося 9 з 10; повторно той самий код не приймається', rest === 9 && (await api(page, '/api/owner/access/stap-op', { methode: 'herstelcode', code: tK.codes[2] })).status === 400, String(rest));
      // утрачений пристрій більше не має доступу: «Сесії» → «Завершити всі інші» (як радить картка «Втрачено пристрій»)
      await page.goto(`${ID}/sessions?lang=uk`, { waitUntil: 'networkidle' });
      const ovs = page.locator('[data-sessies-overzicht]');
      await ovs.locator('[data-sessies-alle-andere]').click();
      await ovs.locator('[data-bevestig="alle-andere"]').getByRole('button', { name: 'Так, завершити' }).click();
      await ovs.locator('.sessies-melding').waitFor({ timeout: 15000 }).catch(() => undefined);
      const oudToestel = await idv(K, '/api/owner/access/snapshot');
      check('(а) «Завершити всі інші»: вхід утраченого пристрою більше не діє (401), цей лишився', oudToestel.status === 401 && /Цей вхід залишився/.test(await ovs.locator('.sessies-melding').innerText().catch(() => '')), String(oudToestel.status));
      // (б) зашифроване: код облікового запису ключа не відкриває
      await openMethods(page);
      const kt = await kluis(page).innerText();
      const metAccountCode = await api(page, '/api/owner/sleutelkluis/ontgrendelen/herstelcode', { code: tK.codes[3] });
      check('(б) у новій сесії ключ даних закритий; зашифрований запис не читається; код облікового запису його НЕ відкриває',
        (await stand(page)) === 'gesloten' && /ключ закритий у цій сесії/.test(kt) && (await leesNieuw(K2)).gesloten && metAccountCode.status === 403 && metAccountCode.data.error === 'SLEUTELKLUIS_HERSTELCODE_ONGELDIG', `${await stand(page)} ${metAccountCode.status} ${metAccountCode.data.error}`);
      await kluis(page).getByRole('button', { name: 'Код відновлення' }).click();
      check('(б) у вікні коду сховища кнопка неактивна, доки код не схожий на код сховища (20 знаків), — код облікового запису (12) не підходить', await (async () => { await kluis(page).locator('[data-sleutelkluis-code] input').fill(tK.codes[3]); return kluis(page).locator('[data-sleutelkluis-code]').getByRole('button', { name: 'Розблокувати' }).isDisabled(); })());
      await kluis(page).locator('[data-sleutelkluis-code] input').fill('ABCD-EFGH-JKLM-NPQR-STUV');
      await kluis(page).locator('[data-sleutelkluis-code]').getByRole('button', { name: 'Розблокувати' }).click();
      check('(б) без коду сховища — зрозуміла відмова «Код відновлення не підійшов.», ключ лишається закритим', await tekstOp(page, /Код відновлення не підійшов\./) && (await stand(page)) === 'gesloten');
      await foto(page, 'herstel-kluis-weigering-telefoon');
      await page.goto(`${ID}/recovery?lang=uk`, { waitUntil: 'networkidle' });
      const scen = await page.locator('body').innerText();
      check('(б) «Відновлення» пояснює різницю: коди облікового запису — для входу й підтвердження, код сховища — лише для ключа даних', /не відкривають зашифровані дані/.test(scen) && /відкриває лише ключ даних і не підходить для входу/.test(scen));
      await openMethods(page);
      await kluis(page).getByRole('button', { name: 'Код відновлення' }).click();
      await kluis(page).locator('[data-sleutelkluis-code] input').fill(kluisCodes[kluisCodes.length - 1]);
      await kluis(page).locator('[data-sleutelkluis-code]').getByRole('button', { name: 'Розблокувати' }).click();
      await wachtStand(page, 'open');
      check('(б) з кодом сховища ключ відкрито — новий і давній записи знову читаються', (await stand(page)) === 'open' && (await leesNieuw(K2)).leesbaar && (await leesOud(page)).leesbaar);
      const nc = kluis(page).locator('[data-sleutelkluis-nieuwe-code]');
      if (await nc.isVisible().catch(() => false)) { await nc.getByLabel('Я зберіг код').check(); await nc.getByRole('button', { name: 'Готово' }).click(); }
      await sluit(ctx);
    }

    check('знімків ≤ 12', fotos <= 12, String(fotos));
    const rest = zonder(fouten, VERWACHT);
    check('без помилок у консолі й HTTP (окрім очікуваних відмов сценарію)', rest.length === 0, rest.slice(0, 8).join(' | '));
    const gRest = zonder(gastFouten, [...GAST_VERWACHT, /^http 401 .*\/api\/flags( |$)/]);
    davne.push(...gastFouten.filter((f) => /\/api\/flags/.test(f)));
    check('гості: без помилок (окрім очікуваних відмов меж доступу)', gRest.length === 0, gRest.slice(0, 8).join(' | '));
    const pRest = zonder(poortFouten, [...VERWACHT, ...POORT_VERWACHT]);
    check('вхід через ворота: без неочікуваних помилок', pRest.length === 0, pRest.slice(0, 8).join(' | '));
    if (davne.length) console.log(`[e2e] давня вада (гостьова сторінка): ${davne.length}× 401 на /api/flags`);
  } catch (e) {
    check('неочікувана помилка', false, String((e as Error)?.stack || e).slice(0, 1500));
  } finally {
    await browser.close().catch(() => undefined);
    for (const r of vlagVooraf) await pool.query('UPDATE app.feature_flags SET aan=$2, standaard=$3, percentage=$4, gebruikers=$5 WHERE sleutel=$1', [r.sleutel, r.aan, r.standaard, r.percentage, r.gebruikers]).catch(() => undefined);
    if (policyVoor) await pool.query("update app.records set data=$2::jsonb where tbl='access_method_policy_v1' and id=$1", [policyVoor.id, JSON.stringify(policyVoor.data)]).catch(() => undefined);
    else await pool.query("delete from app.records where tbl='access_method_policy_v1' and data->>'tenantKey'='global'").catch(() => undefined);
    // Прибирання лише за ТОЧНИМИ адресами цього запуску.
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [emails]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) {
      for (const t of ['toegangscodes', 'passkeys', 'passkey_uitdagingen', 'toegang_gebruik', 'toegang_notities', 'toegang_wijzigingen', 'afzender_beeld', 'venster_stand', 'sleutelkluis_omslag', 'sleutelkluis_journaal', 'sleutelkluis']) await pool.query(`delete from app.${t} where user_id = any($1)`, [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    }
    await pool.query("delete from app.login_lockouts where subject like 'gast-inwisselen:%'").catch(() => undefined);
    void HOSTS;
    await stop();
  }
  return einde();
}
