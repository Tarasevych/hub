// KLUIS-AANMELDEN (16.11.2026), наскрізна перевірка справжньої поведінки: «вхід, який одразу розшифровує дані».
// Справжній Chromium, справжній сервер (HTTPS, сертифікат цього прогону — довіра лише через --ignore-certificate-errors-spki-list,
// у системне сховище нічого не додається), справжня база. Вигадана особа (@example.test). Ключ доступу — віртуальний автентифікатор
// CDP WebAuthn з PRF; «синхронізований ключ на іншому пристрої» — той самий запис ключа в автентифікаторі нового контексту.
//  1. Пристрій 1: passkey → «Увімкнути» шифрування → «Додати passkey як ключ» (браузер одразу кладе й обгортку для входу) → пароль
//     (ключ відкритий, тож сервер одразу кладе обгортку під паролем). Пробний зашифрований запис. «Заблокувати».
//  2. Новий пристрій без cookie: «Увійти паролем» → після входу ключ уже відкритий, запис читається, картки «Ваші дані зараз
//     зашифровані» немає, другого кроку немає.
//  3. «Заблокувати» → ще один новий пристрій (телефон 380): «Увійти ключем доступу» → те саме, одним дотиком.
//  4. Сервер не отримує нічого, чим міг би розшифрувати сам: у запитах браузера немає результату PRF; /api/aanmelden/kluis несе лише
//     token, ruimte й dek (як будь-яке розблокування passkey); у базі немає ні пароля, ні DEK, ні PRF.
//  5. «Вимкнути» для пароля → обгортку стерто → вхід паролем лише впускає (ключ закритий, картка на місці).
// Знімки: tests/e2e/знімки-kluis-aanmelden/*.png (адреси замасковано). Таємні значення не друкуються.
// E2E: aanmelden met wachtwoord of passkey opent de gegevens meteen, ook op een nieuw apparaat; de server krijgt niets om zelf mee te ontsleutelen.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { createHash, randomBytes, X509Certificate } from 'node:crypto';
import type { Browser, BrowserContext, CDPSession, Page, Request } from 'playwright-core';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { ID, api, apparaat, horizontaal, persoon, sluit, verberg, type Persoon } from './hulp/sessie-015';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ZNIMKY = process.env.E2E_ZNIMKY_KLUIS_AANMELDEN || 'tests/e2e/знімки-kluis-aanmelden';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const VLAGGEN = ['aanmelden-passkey', 'aanmelden-wachtwoord'];
// Очікувані відмови: 403 STEP_UP перед захищеною дією (відкривається вікно); activity (не власник).
const VERWACHT = [
  /\/api\/owner\/agents\/activity$/,
  /\/api\/owner\/(sleutelkluis\/(inschakelen|passkey\/koppelen\/opties|wachtwoord\/(aan|uit))|access\/(passkeys\/registreren\/opties|password\/set))$/,
];
// Сторінка без сеансу (вхід): шапка опитує ці маршрути й отримує 401 — очікуваний стан «не ввійшов».
const ZONDER_SESSIE = [/\/api\/owner\/[a-z/-]+$/, /\/api\/(flags|ondersteuning\/voor-mij|impersonatie\/voor-mij)$/, /\/api\/ofrep\/v1\/evaluate\/flags\//];

type Virtueel = { cdp: CDPSession; id: string; prf: boolean };

/** SPKI-відбиток сертифіката тестового сервера: Chrome довіряє лише йому й лише в цьому запуску. */
function spki(tls: string): string {
  const pub = new X509Certificate(readFileSync(`${tls}/srv.crt`)).publicKey.export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(pub).digest('base64');
}

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e kluis-aanmelden');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaarEmail = `e2e-kla-eig-${T}@example.test`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaarEmail, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(ZNIMKY, { recursive: true });
  const extra = process.env.E2E_TLS_NSS === '1' ? [] : [`--ignore-certificate-errors-spki-list=${spki(TLS)}`];
  const browser: Browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [...chromeArgs(POORT), ...extra] });
  const fouten: string[] = [], zonderSessie: string[] = [];
  const contexten: BrowserContext[] = [];
  const geheimen: string[] = [];
  const vlagVooraf = (await pool.query('SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = ANY($1)', [VLAGGEN])).rows;
  const ww = `Proef-ww-${randomBytes(8).toString('hex')}`; geheimen.push(ww);
  const ADRES = `proef-afzender-${T}@example.test`;

  const volg = (page: Page) => {
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message} @ ${page.url()} ${(e.stack || '').split('\n').slice(1, 3).join(' ')}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text().slice(0, 300)}`); });
    page.on('response', async (q) => {
      if (q.status() < 400 || VERWACHT.some((v) => v.test(q.url()))) return;
      const code = await q.json().then((j: { error?: string }) => j?.error || '').catch(() => '');
      const regel = `${q.status()} ${q.url()}${code ? ` (${code})` : ''}`;
      if (q.status() === 401 && ZONDER_SESSIE.some((v) => v.test(q.url()))) zonderSessie.push(regel); else fouten.push(`http ${regel}`);
    });
  };
  /** Усі тіла запитів браузера до сервера — для перевірки «сервер не отримує PRF». */
  const tapVerzoeken = (page: Page, lijst: Array<{ pad: string; body: string }>) => page.on('request', (r: Request) => {
    const u = new URL(r.url());
    if (/tarasevych\.com$/.test(u.hostname) && r.method() === 'POST') lijst.push({ pad: u.pathname, body: r.postData() || '' });
  });
  const virtueel = async (page: Page): Promise<Virtueel> => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const opties = { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true };
    const r = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { ...opties, hasPrf: true } } as never).then((x) => ({ id: (x as { authenticatorId: string }).authenticatorId, prf: true })).catch(() => null);
    if (r) return { cdp, ...r };
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: opties } as never) as { authenticatorId: string };
    return { cdp, id: authenticatorId, prf: false };
  };
  /** «Синхронізований» ключ: записи одного автентифікатора — в інший (разом із лічильником підписів). */
  const kopieerSleutels = async (van: Virtueel, naar: Virtueel) => {
    const { credentials } = await van.cdp.send('WebAuthn.getCredentials', { authenticatorId: van.id });
    for (const c of credentials) {
      await naar.cdp.send('WebAuthn.removeCredential', { authenticatorId: naar.id, credentialId: c.credentialId }).catch(() => undefined);
      await naar.cdp.send('WebAuthn.addCredential', { authenticatorId: naar.id, credential: c });
    }
    return credentials.length;
  };
  const metGoogle = (ctx: BrowserContext, p: Persoon) => ctx.route('https://accounts.google.com/**', async (route) => {
    const u = new URL(route.request().url());
    const code = G.codeVoor(p.sub, p.email, u.searchParams.get('nonce') || '', Math.floor(Date.now() / 1000));
    const terug = new URL(u.searchParams.get('redirect_uri') || `${ID}/`);
    terug.searchParams.set('state', u.searchParams.get('state') || ''); terug.searchParams.set('code', code);
    await route.fulfill({ status: 302, headers: { location: terug.href } });
  });
  const leegApparaat = async (o: { width?: number; height?: number; touch?: boolean } = {}) => {
    const ctx = await browser.newContext({ colorScheme: 'light', locale: 'uk-UA', viewport: { width: o.width || 1280, height: o.height || 860 }, hasTouch: !!o.touch, isMobile: !!o.touch && (o.width || 1280) < 500, timezoneId: 'Europe/Brussels', serviceWorkers: 'block' });
    contexten.push(ctx);
    const page = await ctx.newPage();
    volg(page);
    return { ctx, page };
  };
  const bevestigToegang = async (page: Page, ms = 8000) => {
    const titel = page.locator('#bevestig-toegang-titel');
    if (!(await titel.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false))) return false;
    const primair = page.locator('.bevestig-toegang-primair');
    if (!/Використати passkey/.test(await primair.innerText().catch(() => ''))) await page.locator('.bevestig-toegang-alt button', { hasText: 'Використати passkey' }).click();
    await page.locator('.bevestig-toegang-primair', { hasText: 'Використати passkey' }).click();
    await titel.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
    return true;
  };
  const kluis = (page: Page) => page.locator('[data-access-section="sleutelkluis"]');
  const stand = async (page: Page) => String(await kluis(page).locator('[data-sleutelkluis-stand]').getAttribute('data-sleutelkluis-stand'));
  const wachtStand = async (page: Page, s: string, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await stand(page).catch(() => '')) === s) return true; await page.waitForTimeout(200); } return false; };
  const openMethods = async (page: Page) => { await page.goto(`${ID}/security?lang=uk`, { waitUntil: 'networkidle' }); await kluis(page).waitFor({ timeout: 20000 }); await page.waitForTimeout(400); };
  const mailv = (p: Persoon, pad: string, extra2: Record<string, unknown> = {}) => p.b.verzoek('mail.tarasevych.com', pad, p.b.ctxBody('mail', extra2));
  /** Чи читається пробний зашифрований запис (сторона сервера: ключ користувача зараз відкритий?). */
  const leesProef = async (p: Persoon) => {
    const r = await mailv(p, '/api/owner/mail/afzender-beelden', { adressen: [ADRES] });
    const b = ((r.data.beelden || []) as Array<{ adres: string; soort: string; data?: string; sleutel?: string }>).find((x) => x.adres === ADRES);
    return { leesbaar: b?.soort === 'persoon' && /^data:image\/png;base64,/.test(String(b.data || '')), gesloten: b?.sleutel === 'gesloten' };
  };
  const soorten = async (uid: string) => (await pool.query("select soort, houder from app.sleutelkluis_omslag where user_id=$1 and ruimte='prive' order by soort", [uid])).rows as Array<{ soort: string; houder: string }>;
  const andere = async (page: Page) => {
    await page.goto(`${ID}/?lang=uk`, { waitUntil: 'networkidle' });
    const knop = page.locator('.mr-sign-in-alternative');
    await knop.waitFor({ state: 'visible', timeout: 15000 });
    if ((await knop.getAttribute('aria-expanded')) !== 'true') await knop.click();
    await page.locator('.mr-sign-in-opties').waitFor({ state: 'visible', timeout: 5000 });
  };
  const naLanden = async (page: Page) => {
    await page.waitForURL((u) => !/\/api\//.test(u.pathname), { timeout: 20000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(1200);
  };
  /** Картка «Ваші дані зараз зашифровані» (другий крок) на сторінці, куди людина потрапила після входу. */
  const kaartZichtbaar = async (page: Page) => page.locator('[data-kluis-poort="kaart"], [data-kluis-poort="chip"]').first().isVisible().catch(() => false);
  /** Чекає до `ms`, чи з'явиться картка (сторінка перевіряє стан ключа з невеликою затримкою після входу). */
  const kaartNa = async (page: Page, ms: number) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await kaartZichtbaar(page)) return true; await page.waitForTimeout(250); } return false; };
  const ik = async (page: Page) => String((await api(page, '/api/owner/session/bootstrap')).data?.user?.id || '');

  let A!: Persoon; let aId = '';
  try {
    // ---------------------------------------------------------------- підготовка
    const O = await persoon(G as never, 'kla-eig', T);
    A = await persoon(G as never, 'kla-a', T);
    const idVan = async (email: string) => String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id || '');
    const oId = await idVan(O.email); aId = await idVan(A.email);
    await pool.query(`update app.records set data = data || '{"status":"approved","name":"Особа Проба"}'::jsonb where tbl='users' and id=$1`, [aId]);
    for (const v of VLAGGEN) await pool.query('UPDATE app.feature_flags SET aan = true, standaard = false, percentage = 0, gebruikers = $2 WHERE sleutel = $1', [v, [oId, aId]]);
    await pool.query("delete from app.rate_limits where bucket like 'aanmelden-%' and bucket not like 'aanmelden-wachtwoord-adres:%'").catch(() => undefined);
    check('підготовка: схвалена особа (не власник); вхід паролем і ключем увімкнено для неї', !!aId && !!oId);

    // ================================================================ 1. пристрій 1: ключ, шифрування, пароль
    const d1 = await apparaat(browser, A, { taal: 'uk', width: 1280, height: 860 });
    contexten.push(d1.ctx);
    volg(d1.page);
    await metGoogle(d1.ctx, A);
    const v1 = await virtueel(d1.page);
    await d1.page.goto(`${ID}/security?lang=uk`, { waitUntil: "networkidle" });
    const pk = d1.page.locator('[data-access-section="passkeys"]');
    await pk.waitFor({ timeout: 20000 });
    await pk.getByRole('button', { name: 'Додати passkey' }).click();
    await pk.locator('#passkey-naam').fill('Ноутбук проби');
    await pk.getByRole('button', { name: 'Продовжити' }).click();
    const dlg = d1.page.getByRole('dialog');
    if (await dlg.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) await dlg.getByRole('button', { name: 'Підтвердити повторним входом через Google' }).click();
    await d1.page.waitForURL(/\/security/, { timeout: 25000 }).catch(() => undefined);
    await pk.locator('[data-passkey]').first().waitFor({ timeout: 25000 }).catch(() => undefined);
    check(`передумова: passkey додано (віртуальний автентифікатор${v1.prf ? ' з PRF' : ' БЕЗ PRF'})`, v1.prf && (await pk.locator('[data-passkey]').count()) === 1);

    await openMethods(d1.page);
    await kluis(d1.page).getByRole('button', { name: 'Увімкнути' }).click();
    await bevestigToegang(d1.page);
    const nieuw = kluis(d1.page).locator('[data-sleutelkluis-nieuwe-code]');
    await nieuw.waitFor({ timeout: 25000 }).catch(() => undefined);
    const code1 = (await nieuw.locator('code').innerText().catch(() => '')).trim();
    if (code1) geheimen.push(code1);
    await nieuw.getByLabel('Я зберіг код').check();
    await nieuw.getByRole('button', { name: 'Готово' }).click();
    await nieuw.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    check('шифрування ввімкнено (код відновлення сховища показано один раз), ключ відкритий', !!code1 && (await stand(d1.page)) === 'open');

    const koppel = kluis(d1.page).getByRole('button', { name: 'Додати passkey як ключ' });
    await koppel.waitFor({ timeout: 10000 }).catch(() => undefined);
    await koppel.click();
    if (await d1.page.getByRole('dialog').isVisible().catch(() => false)) await bevestigToegang(d1.page);
    await kluis(d1.page).locator('[data-omslag="passkey"]').first().waitFor({ timeout: 20000 }).catch(() => undefined);
    const rijPk = kluis(d1.page).locator('[data-omslag="passkey"]').first();
    const s1 = await soorten(aId);
    check('«Додати passkey як ключ» — тим самим дотиком браузер кладе й обгортку для входу (passkey + passkey-aanmelden); у переліку: «вхід цим passkey одразу розшифровує дані»',
      s1.some((r) => r.soort === 'passkey') && s1.some((r) => r.soort === 'passkey-aanmelden') && /вхід цим passkey одразу розшифровує дані/.test(await rijPk.innerText().catch(() => '')), JSON.stringify(s1.map((r) => r.soort)));

    // пароль, поки ключ відкритий
    await d1.page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' });
    const wwBlok = d1.page.locator('#aanmeldmethoden-wachtwoord');
    await wwBlok.waitFor({ timeout: 20000 });
    await wwBlok.evaluate((x) => { let d: Element | null = x; while (d) { if (d instanceof HTMLDetailsElement) d.open = true; d = d.parentElement; } });
    await wwBlok.locator('[data-wachtwoord-knop]').click();
    await wwBlok.locator('input[autocomplete="new-password"]').fill(ww);
    await wwBlok.getByRole('button', { name: 'Зберегти' }).click();
    await bevestigToegang(d1.page);
    await d1.page.waitForFunction(() => document.querySelector('#aanmeldmethoden-wachtwoord')?.getAttribute('data-wachtwoord') === 'ingesteld', undefined, { timeout: 15000 }).catch(() => undefined);
    const s2 = await soorten(aId);
    check('пароль задано, поки ключ відкритий → сервер одразу кладе обгортку під паролем (soort «wachtwoord»)', (await wwBlok.getAttribute('data-wachtwoord')) === 'ingesteld' && s2.some((r) => r.soort === 'wachtwoord'), JSON.stringify(s2.map((r) => r.soort)));

    await openMethods(d1.page);
    const rijWw = kluis(d1.page).locator('[data-omslag="wachtwoord"]');
    await rijWw.scrollIntoViewIfNeeded().catch(() => undefined);
    check('«Хто може відкрити ключ»: рядок «Пароль» із попередженням (!) і кнопкою «Вимкнути», підказка пояснює ризик',
      await rijWw.isVisible() && /Ризик: копія бази даних/.test(String(await rijWw.locator('[data-wachtwoord-risico]').getAttribute('title'))) && /стирає обгортку/.test(String(await rijWw.locator('button').getAttribute('title'))) && /Вимкнути/.test(await rijWw.innerText()), (await rijWw.innerText().catch(() => '')).slice(0, 300));
    await verberg(d1.page);
    await kluis(d1.page).screenshot({ path: `${ZNIMKY}/1-hto-vidkryvaie-kliuch-computer.png` }).catch(() => undefined);

    // пробний зашифрований запис
    const z = await mailv(A, '/api/owner/mail/afzender-beeld/eigen', { adres: ADRES, data: `data:image/png;base64,${PNG}` });
    const zr = (await pool.query("select data is null as leeg, data_versleuteld is not null as dek from app.afzender_beeld where user_id=$1 and bron='eigen'", [aId])).rows[0];
    check('пробний запис збережено зашифрованим (у базі немає відкритих байтів) і читається', z.status === 200 && zr?.leeg === true && zr?.dek === true && (await leesProef(A)).leesbaar);

    await kluis(d1.page).getByRole('button', { name: 'Заблокувати' }).click();
    await wachtStand(d1.page, 'gesloten');
    const p0 = await leesProef(A);
    check('«Заблокувати» → ключ закритий, запис не читається', (await stand(d1.page)) === 'gesloten' && !p0.leesbaar && p0.gesloten);

    // ================================================================ 2. новий пристрій: вхід паролем
    const d2 = await leegApparaat();
    const verzoeken2: Array<{ pad: string; body: string }> = [];
    tapVerzoeken(d2.page, verzoeken2);
    await andere(d2.page);
    const blok = d2.page.locator('[data-aanmeld-zonder-google="wachtwoord"]');
    await blok.locator('button').first().click();
    const form = blok.locator('form.mr-sign-in-wachtwoord-form');
    await form.locator('input[type="email"]').fill(A.email);
    await form.locator('input[autocomplete="current-password"]').fill(ww);
    const nav2 = d2.page.waitForEvent('framenavigated', { timeout: 15000 }).catch(() => undefined);
    await form.locator('button[type="submit"]').click();
    await nav2; await naLanden(d2.page);
    const kaart2 = await kaartNa(d2.page, 4000);
    await verberg(d2.page);
    await d2.page.screenshot({ path: `${ZNIMKY}/2-pislia-vkhodu-parolem.png` }).catch(() => undefined);
    const p2 = await leesProef(A);
    await openMethods(d2.page);
    check('новий пристрій, вхід паролем: сеанс тієї самої особи; одразу після входу картки «Ваші дані зараз зашифровані» немає', (await ik(d2.page)) === aId && !kaart2, `kaart=${kaart2} url=${d2.page.url()}`);
    check('…і ключ відкритий без другого кроку: стан «open» на новому пристрої, зашифрований запис читається', (await stand(d2.page)) === 'open' && p2.leesbaar, JSON.stringify(p2));
    const vw = verzoeken2.find((v) => v.pad === '/api/aanmelden/wachtwoord/voltooien');
    check('вхід паролем: браузер надсилає лише звичайні поля входу (пароль сервер перевіряє, як завжди), окремого запиту з ключем немає',
      !!vw && Object.keys(JSON.parse(vw.body || '{}')).sort().join(',') === 'code,email,password,pogingId' && !verzoeken2.some((v) => v.pad === '/api/aanmelden/kluis'));

    await kluis(d2.page).getByRole('button', { name: 'Заблокувати' }).click();
    await wachtStand(d2.page, 'gesloten');
    check('знову «Заблокувати» (з нового пристрою) → ключ закритий', (await stand(d2.page)) === 'gesloten' && !(await leesProef(A)).leesbaar, `${await stand(d2.page)} ${JSON.stringify(await leesProef(A))} ${JSON.stringify((await soorten(aId)).map((r) => r.soort))}`);

    // ================================================================ 3. вхід ключем на «чистому» пристрої (cookie й сховище стерто)
    // Той самий автентифікатор (у віртуальному ключі CDP секрет PRF не переноситься в копію — див. 3b), але браузер без сеансу,
    // без пам'яті пристрою й без жодних даних сайту — для сервера й сторінки це новий пристрій.
    await d1.ctx.clearCookies();
    await d1.page.evaluate(async () => {
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* geen opslag */ }
      const dbs = await (indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> }).databases?.().catch(() => []) || [];
      await Promise.all(dbs.map((d) => new Promise((r) => { if (!d.name) return r(null); const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = () => r(null); })));
    });
    const verzoeken3: Array<{ pad: string; body: string }> = [];
    tapVerzoeken(d1.page, verzoeken3);
    const diag3: string[] = [];
    d1.page.on('console', (m) => { if (/\[aanmelden\]/.test(m.text())) diag3.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
    d1.page.on('response', async (q) => { if (/\/api\/aanmelden\/(passkey\/voltooien|kluis)$/.test(q.url())) { const j = await q.json().catch(() => ({})); const k = (j as { kluis?: { omslagen?: unknown[] } }).kluis; diag3.push(`${q.status()} ${new URL(q.url()).pathname} kluis=${!!k} omslagen=${k?.omslagen?.length ?? '-'} ${(j as { error?: string }).error || ''}`); } });
    await andere(d1.page);
    check('після стирання cookie й даних сайту — сторінка входу (сеансу немає)', await d1.page.locator('[data-aanmeld-zonder-google="passkey"] button').isVisible());
    const nav3 = d1.page.waitForEvent('framenavigated', { timeout: 15000 }).catch(() => undefined);
    await d1.page.locator('[data-aanmeld-zonder-google="passkey"] button').click();
    await nav3; await naLanden(d1.page);
    const kaart3 = await kaartNa(d1.page, 4000);
    const p3 = await leesProef(A);
    await openMethods(d1.page);
    check('«Увійти ключем доступу» → сеанс тієї самої особи; картки «Ваші дані зараз зашифровані» немає', (await ik(d1.page)) === aId && !kaart3, `kaart=${kaart3}`);
    check('…і ключ відкритий тим самим дотиком: стан «open», запис читається, другого кроку немає', (await stand(d1.page)) === 'open' && p3.leesbaar, `${JSON.stringify(p3)} :: ${diag3.join(' || ')}`);
    await kluis(d1.page).getByRole('button', { name: 'Заблокувати' }).click();
    await wachtStand(d1.page, 'gesloten');

    // ---------------------------------------------------------------- 3b. телефон із копією ключа (емулятор без секрету PRF)
    // Справжні синхронізовані passkey (iCloud, Google) переносять і секрет PRF; копія у віртуальному автентифікаторі — ні. Тут
    // перевіряємо чесний запасний шлях: вхід працює, а коли PRF немає — з'являється картка розшифрування (нічого не ламається).
    const d3 = await leegApparaat({ width: 380, height: 800, touch: true });
    const v3 = await virtueel(d3.page);
    const n = await kopieerSleutels(v1, v3);
    await andere(d3.page);
    const nav3b = d3.page.waitForEvent('framenavigated', { timeout: 15000 }).catch(() => undefined);
    await d3.page.locator('[data-aanmeld-zonder-google="passkey"] button').click();
    await nav3b; await naLanden(d3.page);
    const kaart3b = await kaartNa(d3.page, 6000);
    const p3b = await leesProef(A);
    await verberg(d3.page);
    await d3.page.screenshot({ path: `${ZNIMKY}/3-telefon-kopiia-kliucha.png` }).catch(() => undefined);
    await openMethods(d3.page);
    check('телефон 380 без cookie, копія ключа: вхід працює; або дані вже відкриті, або (без PRF) — картка розшифрування, без помилок',
      n >= 1 && (await ik(d3.page)) === aId && (p3b.leesbaar ? !kaart3b : kaart3b), `open=${p3b.leesbaar} kaart=${kaart3b}`);
    check('телефон 380: без горизонтальної прокрутки', (await horizontaal(d3.page)) <= 0);
    await kopieerSleutels(v3, v1);

    // ================================================================ 4. сервер не отримує нічого, чим міг би розшифрувати сам
    const pv = verzoeken3.find((v) => v.pad === '/api/aanmelden/passkey/voltooien');
    const pvBody = JSON.parse(pv?.body || '{}') as { assertie?: Record<string, unknown> };
    const kl = verzoeken3.filter((v) => v.pad === '/api/aanmelden/kluis');
    check('вхід ключем: в assertie немає результатів розширень (PRF лишається в браузері)',
      !!pv && !/prf|clientExtensionResults|results/i.test(JSON.stringify(pvBody.assertie || {})), Object.keys(pvBody.assertie || {}).join(','));
    check('/api/aanmelden/kluis: рівно token, ruimte, dek — як будь-яке розблокування passkey (жодного PRF чи ключа обгортки)',
      kl.length >= 1 && kl.every((v) => Object.keys(JSON.parse(v.body)).sort().join(',') === 'dek,ruimte,token'), kl.map((v) => Object.keys(JSON.parse(v.body)).join(',')).join(' | '));
    const dump = String((await pool.query(`select
        (select coalesce(json_agg(o), '[]') from app.sleutelkluis_omslag o where o.user_id = $1)::text ||
        (select coalesce(json_agg(r.data), '[]') from app.records r where r.data::text like '%' || $1 || '%')::text ||
        (select coalesce(json_agg(x.details), '[]') from app.audit x where x.owner_id = $1)::text as d`, [aId])).rows[0]?.d || '');
    const dekUit = kl.map((v) => String(JSON.parse(v.body).dek || '')).filter(Boolean);
    check('у базі (обгортки, записи, журнал) немає ні пароля, ні коду сховища, ні DEK', dump.length > 0 && ![...geheimen, ...dekUit].some((g) => g && dump.includes(g)));
    const audit = (await pool.query(`SELECT details::text AS d FROM app.audit WHERE owner_id = $1 AND action = 'sleutelkluis.ontgrendeld'`, [aId])).rows as Array<{ d: string }>;
    check('журнал: «розшифровано входом паролем» і «розшифровано входом passkey»', audit.some((r) => r.d.includes('wachtwoord-aanmelding')) && audit.some((r) => r.d.includes('passkey-aanmelding')));

    // ================================================================ 5. «Вимкнути» для пароля
    await openMethods(d1.page);
    const rijWw3 = kluis(d1.page).locator('[data-omslag="wachtwoord"]');
    await rijWw3.scrollIntoViewIfNeeded().catch(() => undefined);
    await rijWw3.getByRole('button', { name: /Вимкнути/ }).click();
    await d1.page.waitForTimeout(300);
    if (await d1.page.locator('#bevestig-toegang-titel').isVisible().catch(() => false)) await bevestigToegang(d1.page);
    await rijWw3.getByRole('button', { name: /Увімкнути/ }).waitFor({ timeout: 15000 }).catch(() => undefined);
    const s5 = await soorten(aId);
    check('«Вимкнути» (без підтвердження — це лише посилення захисту) → обгортку під паролем стерто, рядок пропонує «Увімкнути»',
      !s5.some((r) => r.soort === 'wachtwoord') && await rijWw3.getByRole('button', { name: /Увімкнути/ }).isVisible().catch(() => false), JSON.stringify(s5.map((r) => r.soort)));
    if ((await stand(d1.page)) === 'open') { await kluis(d1.page).getByRole('button', { name: 'Заблокувати' }).click(); await wachtStand(d1.page, 'gesloten'); }
    const d4 = await leegApparaat();
    await andere(d4.page);
    const b4 = d4.page.locator('[data-aanmeld-zonder-google="wachtwoord"]');
    await b4.locator('button').first().click();
    const f4 = b4.locator('form.mr-sign-in-wachtwoord-form');
    await f4.locator('input[type="email"]').fill(A.email);
    await f4.locator('input[autocomplete="current-password"]').fill(ww);
    const nav4 = d4.page.waitForEvent('framenavigated', { timeout: 15000 }).catch(() => undefined);
    await f4.locator('button[type="submit"]').click();
    await nav4; await naLanden(d4.page);
    const kaart4 = await kaartNa(d4.page, 6000);
    await verberg(d4.page);
    await d4.page.screenshot({ path: `${ZNIMKY}/4-vymknuto-vkhid-parolem-kartka.png` }).catch(() => undefined);
    const p4 = await leesProef(A);
    await openMethods(d4.page);
    check('після «Вимкнути» вхід паролем лише впускає: сеанс є, ключ закритий, запис не читається, з\'являється картка розшифрування', (await ik(d4.page)) === aId && (await stand(d4.page)) === 'gesloten' && !p4.leesbaar && kaart4, `kaart=${kaart4} ${JSON.stringify(p4)}`);

    const fz = fouten.filter((f) => !/\/api\/owner\/sleutelkluis\/stand/.test(f));
    check('без помилок консолі, JS і неочікуваних HTTP ≥ 400', fz.length === 0, fz.slice(0, 8).join(' | '));
    console.log(`  (сторінки без сеансу: ${zonderSessie.length} очікуваних 401)`);
  } catch (e) {
    check('сценарій пройшов без винятку', false, (e as Error)?.stack?.slice(0, 600) || String(e));
  } finally {
    await sluit(...contexten);
    await browser.close().catch(() => undefined);
    for (const r of vlagVooraf) await pool.query('UPDATE app.feature_flags SET aan=$2, standaard=$3, percentage=$4, gebruikers=$5 WHERE sleutel=$1', [r.sleutel, r.aan, r.standaard, r.percentage, r.gebruikers]).catch(() => undefined);
    await stop();
  }
  return einde();
}
