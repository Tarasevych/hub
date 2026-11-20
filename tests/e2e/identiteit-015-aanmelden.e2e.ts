// IDENTITEIT-015 (приймання, група «aanmelden-sleutels»): справжній Chromium, вигадані особи (@example.test), кожен «пристрій» —
// окремий контекст браузера. Ключ доступу — віртуальний автентифікатор CDP WebAuthn (discoverable, з перевіркою користувача);
// «синхронізований ключ на іншому пристрої» — той самий запис ключа, перенесений у автентифікатор нового контексту (getCredentials →
// addCredential). Google — підроблений (tests/eenheid/hulp/nep-google.ts, сторінку accounts.google.com перехоплено), Microsoft —
// підроблений провайдер на 127.0.0.1 (tests/eenheid/hulp/nep-aanbieder.ts). Назовні не йде нічого.
//  G. Сторінка входу без сеансу (1280 і 380): «Увійти через Google», «Інші способи входу» — робочі «ключ доступу» й «пароль»
//     (прапорці для цих осіб), Apple/Microsoft вимкнені з точною передумовою; вхід через Google кліком → сеанс.
//  S. Ключі доступу: початковий стан, «Додати passkey» з назвою, позначки «Вхід і підтвердження», перейменування (Enter, після
//     оновлення), приватна нотатка, довіра «Довірений» через посилене підтвердження КЛЮЧЕМ (step-up), історія використання,
//     відкликання довіри.
//  T. Застосунок-автентифікатор: «Не налаштовано» → «Налаштувати» → QR і ключ → неправильний код відхилено → перший код → «Налаштовано»
//     і одразу нові коди відновлення.
//  R. Коди відновлення: 10 кодів, «Завантажити» (файл), «Копіювати» (буфер), «Друкувати» (window.print перехоплено), «Готово» лише
//     після «Я зберіг коди», лічильник, нотатки набору й коду; одноразовість (вхід паролем + код; той самий код удруге — відмова);
//     заміна набору (старий код відмовляє, новий діє); «Відкликати всі» (код відмовляє).
//  W. Пароль: «Задати пароль» → «Зберегти» → посилене підтвердження ключем → «Активний»; «Вийти» з меню → «Увійти паролем»: без коду
//     (є TOTP) — відмова, з кодом застосунку — сеанс (authMethod «password»).
//  P. Вхід ключем на іншому пристрої (телефон 380, без cookie): «Увійти ключем доступу» → сеанс (authMethod «passkey»).
//  M. Правило «другий чинник обов'язковий»: власник вмикає (діалог → ключ) → наступний вхід Google показує «Другий крок входу», дані
//     закриті; підтвердження ключем (комп'ютер) і кодом застосунку (телефон) → дані відкриті; власник вимикає.
//  X. Microsoft/Discord/Apple/Telegram: без ключів — чесна передумова (сторінка входу й каталог); Microsoft із підробленим
//     провайдером: самоперевірка → «Підключити» в центрі → кнопка «Увійти через Microsoft» → сеанс (authMethod «microsoft»).
//  D. Вилучення ключа: «Скасувати» лишає ключ; «Видалити» → ключа немає, вхід ним на іншому пристрої — чесна відмова без сеансу.
// Знімки tests/e2e/знімки-015/aanmelden-*.png (≤ 12; 380×800 і 1280; таємні коди, QR і адреси замасковано verberg()).
// Acceptatie van aanmelden en sleutels: Google, passkey, wachtwoord (+ TOTP/herstelcode), 2FA-regel, herstelcodes, Microsoft.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { Browser, BrowserContext, CDPSession, Page } from 'playwright-core';
import { checker, totpCode } from '../eenheid/hulp/nep-google';
import { nepAanbieder } from '../eenheid/hulp/nep-aanbieder';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { HOSTS, ID, api, apparaat, horizontaal, openBlok, persoon, sluit, verberg, volgFouten, type Persoon } from './hulp/sessie-015';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ZNIMKY = process.env.E2E_ZNIMKY_015 || 'tests/e2e/знімки-015';
// Alleen voor het ontwikkelen: E2E_STAP=G,S draait alleen die delen (de volgorde en afhankelijkheden blijven gelden).
const STAPPEN = (process.env.E2E_STAP || 'G,S,T,R,W,P,M,X,D').split(',');
const VLAGGEN = ['aanmelden-passkey', 'aanmelden-wachtwoord', 'aanmelden-extern'];
// Очікувані відмови: activity (не власник); навмисні неправильні коди й паролі; вимога підтвердження (step-up), на яку відкривається вікно.
const VERWACHT = [
  /\/api\/owner\/agents\/activity$/,
  /\/api\/owner\/access\/totp\/confirm$/, /* навмисно неправильний перший код */
  /\/api\/aanmelden\/(wachtwoord|passkey)\/voltooien$/, /* навмисні відмови входу */
  /\/api\/owner\/access\/(passkeys\/(registreren\/opties|vertrouwen|vertrouwen-intrekken|verwijderen|hernoemen)|password\/set|totp\/start|recovery\/(rotate|intrekken)|policy\/save)$/, /* 403 STEP_UP → вікно */
  /\/api\/owner\/aanmeld\/vnext\/start$/, /* 403 STEP_UP перед прив'язкою */
];
// Сторінка без сеансу (вхід) і вікно «Другий крок входу»: шапка опитує ці маршрути й отримує 401/403 — це очікуваний стан «не ввійшов»
// / «вхід ще не підтверджено», не вада цієї групи. Рахуємо окремо (див. звіт).
const ZONDER_SESSIE = [/\/api\/owner\/(session\/bootstrap|meldingen\/(status|gelezen)|tech\/status|menu\/tellers|weergave|vensters\/laden|bevestiging\/apparaat\/open|diagnostiek\/mijn-diensten)$/, /\/api\/(flags|ondersteuning\/voor-mij|impersonatie\/voor-mij)$/, /\/api\/ofrep\/v1\/evaluate\/flags\//, /\/api\/owner\/[a-z/-]+$/];

type Virtueel = { cdp: CDPSession; id: string };

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-015 aanmelden-sleutels');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaarEmail = `e2e-i15a-eig-${T}@example.test`;
  const echteFetch = globalThis.fetch;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaarEmail, poort: POORT, tls: TLS });
  // Підроблений Microsoft слухає на 127.0.0.1; nep-Google перехоплює весь fetch — запити до провайдера йдуть повз нього.
  const MS_ID = `e2e-ms-${T}`, MS_GEHEIM = `e2e-geheim-${randomBytes(6).toString('hex')}`;
  const nep = await nepAanbieder({ microsoft: { clientId: MS_ID, clientSecret: MS_GEHEIM } });
  const nepGoogleFetch = globalThis.fetch;
  globalThis.fetch = ((input: unknown, init?: RequestInit) => (String(input instanceof URL ? input.href : input).startsWith(nep.url) ? echteFetch(input as never, init) : nepGoogleFetch(input as never, init))) as typeof fetch;
  const pool = getPool();
  mkdirSync(ZNIMKY, { recursive: true });
  const browser: Browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const zonderSessie: string[] = [];
  const emails: string[] = [];
  const contexten: BrowserContext[] = [];
  const vlagVooraf = (await pool.query('SELECT sleutel, aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = ANY($1)', [VLAGGEN])).rows;
  const beleidVooraf = (await pool.query("SELECT id, data FROM app.records WHERE tbl='access_method_policy_v1'")).rows as Array<{ id: string; data: Record<string, unknown> }>;
  let fotoTeller = 0;
  const foto = async (page: Page, naam: string) => { fotoTeller++; await verberg(page); await page.screenshot({ path: `${ZNIMKY}/aanmelden-${naam}.png`, fullPage: false }); };
  const idVanEmail = async (email: string) => String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id || '');
  const goedkeuren = async (p: Persoon, naam: string) => { const id = await idVanEmail(p.email); await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', name: naam })]); return id; };
  const authMethode = async (userId: string) => (await pool.query("select data->>'authMethod' m from app.records where tbl='owner_service_sessions_v1' and data->>'userId'=$1 order by seq desc limit 1", [userId])).rows[0]?.m as string | undefined;
  const tekstOp = async (scope: Page | ReturnType<Page['locator']>, re: RegExp, ms = 8000) => scope.getByText(re).first().waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
  const ik = async (page: Page) => { const r = await api(page, '/api/owner/session/bootstrap'); return String(r.data?.user?.id || ''); };
  const geenLockouts = (email: string) => pool.query('delete from app.login_lockouts where subject like $1', [`wachtwoord:${email}:%`]).catch(() => undefined);

  /** Новий контекст БЕЗ cookie (сторінка входу), з підробленою сторінкою Google: повертає код для `wie()`. */
  const leegApparaat = async (o: { width?: number; height?: number; touch?: boolean; wie?: () => { sub: string; email: string } } = {}) => {
    const ctx = await browser.newContext({ colorScheme: 'light', locale: 'uk-UA', viewport: { width: o.width || 1280, height: o.height || 860 }, hasTouch: !!o.touch, isMobile: !!o.touch && (o.width || 1280) < 500, timezoneId: 'Europe/Brussels', serviceWorkers: 'block', acceptDownloads: true });
    contexten.push(ctx);
    if (o.wie) await googleStub(ctx, o.wie);
    const page = await ctx.newPage();
    volgPagina(page);
    return { ctx, page };
  };
  const googleStub = (ctx: BrowserContext, wie: () => { sub: string; email: string }) => ctx.route('https://accounts.google.com/**', async (route) => {
    const u = new URL(route.request().url());
    const w = wie();
    const code = G.codeVoor(w.sub, w.email, u.searchParams.get('nonce') || '');
    const terug = new URL(u.searchParams.get('redirect_uri') || `${ID}/`);
    terug.searchParams.set('state', u.searchParams.get('state') || ''); terug.searchParams.set('code', code);
    await route.fulfill({ status: 302, headers: { location: terug.href } });
  });
  /** Помилки: сторінка без сеансу / ворота — окремо; решта ≥ 400 (крім VERWACHT) — помилка. */
  const volgPagina = (page: Page) => {
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text().slice(0, 300)}`); });
    page.on('response', async (q) => {
      if (q.status() < 400 || VERWACHT.some((v) => v.test(q.url()))) return;
      const code = await q.json().then((j: { error?: string }) => j?.error || '').catch(() => '');
      const regel = `${q.status()} ${q.url()}${code ? ` (${code})` : ''}`;
      if ((q.status() === 401 || /TWEEDE_FACTOR|OWNER_SESSION|OWNER_APPROVED_SESSION/.test(code)) && ZONDER_SESSIE.some((v) => v.test(q.url()))) zonderSessie.push(regel);
      else if (achterPoort.has(page) && (q.status() === 401 || q.status() === 403)) poortVerzoeken.push(regel);
      else fouten.push(`http ${regel}`);
    });
  };
  // Сторінки, де ворота «другий крок входу» зачинені (від входу до підтвердження): відмови даних там — сама дія воріт; рахуємо окремо.
  const achterPoort = new Set<Page>();
  const poortVerzoeken: string[] = [];
  const virtueel = async (page: Page): Promise<Virtueel> => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    return { cdp, id: authenticatorId };
  };
  /** «Синхронізований» ключ: записи з автентифікатора одного пристрою — в автентифікатор іншого (разом із лічильником підписів:
   *  сервер слушно відкидає ключ, чий лічильник відстав, як можливу копію — тому після кожного використання синхронізуємо назад). */
  const kopieerSleutels = async (van: Virtueel, naar: Virtueel) => {
    const { credentials } = await van.cdp.send('WebAuthn.getCredentials', { authenticatorId: van.id });
    for (const c of credentials) {
      await naar.cdp.send('WebAuthn.removeCredential', { authenticatorId: naar.id, credentialId: c.credentialId }).catch(() => undefined);
      await naar.cdp.send('WebAuthn.addCredential', { authenticatorId: naar.id, credential: c });
    }
    return credentials.length;
  };
  /** Вікно «Підтвердіть доступ» (якщо з'явилося): підтвердити ключем / кодом застосунку / кодом відновлення. */
  const bevestigToegang = async (page: Page, via: 'passkey' | 'totp' | 'herstel', code = '', ms = 8000) => {
    const titel = page.locator('#bevestig-toegang-titel');
    if (!(await titel.waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false))) return false;
    const label = via === 'passkey' ? 'Використати passkey' : via === 'totp' ? 'Використати код із застосунку-автентифікатора' : 'Використати код відновлення';
    const primair = page.locator('.bevestig-toegang-primair');
    if (via === 'passkey') {
      if (!/Використати passkey/.test(await primair.innerText().catch(() => ''))) await page.locator('.bevestig-toegang-alt button', { hasText: label }).click();
      await page.locator('.bevestig-toegang-primair', { hasText: 'Використати passkey' }).click();
    } else {
      if (!(await page.locator('#bevestig-toegang-code').count())) await page.locator('.bevestig-toegang-alt button', { hasText: label }).click();
      await page.locator('#bevestig-toegang-code').fill(code);
      await page.locator('.bevestig-toegang-primair[type="submit"]').click({ timeout: 2000 }).catch(() => undefined);
    }
    await titel.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined);
    return true;
  };
  const gebruikteCodes = new Set<string>();
  /** Свіжий код TOTP (сервер не приймає той самий 30-секундний код двічі). Сам код ніде не друкується. */
  const versCode = async (geheim: string) => { let c = totpCode(geheim); for (let i = 0; i < 70 && gebruikteCodes.has(c); i++) { await new Promise((r) => setTimeout(r, 500)); c = totpCode(geheim); } gebruikteCodes.add(c); return c; };
  /** Сторінка входу: відкрити «Інші способи входу». */
  const andere = async (page: Page) => {
    await page.goto(`${ID}/?lang=uk`, { waitUntil: 'networkidle' });
    const knop = page.locator('.mr-sign-in-alternative');
    await knop.waitFor({ state: 'visible', timeout: 15000 });
    if ((await knop.getAttribute('aria-expanded')) !== 'true') await knop.click();
    await page.locator('.mr-sign-in-opties').waitFor({ state: 'visible', timeout: 5000 });
  };
  /** «Увійти паролем»: адреса, пароль, код (порожній — без коду). Повертає текст відмови або '' (сеанс, сторінка перейшла). */
  const wachtwoordInloggen = async (page: Page, email: string, ww: string, code: string) => {
    await andere(page);
    const blok = page.locator('[data-aanmeld-zonder-google="wachtwoord"]');
    await blok.locator('button').first().click();
    const form = blok.locator('form.mr-sign-in-wachtwoord-form');
    await form.locator('input[type="email"]').fill(email);
    await form.locator('input[autocomplete="current-password"]').fill(ww);
    await form.locator('input[autocomplete="one-time-code"]').fill(code);
    const navigatie = page.waitForEvent('framenavigated', { timeout: 10000 }).then(() => true).catch(() => false);
    await form.locator('button[type="submit"]').click();
    const fout = blok.locator('[data-aanmeld-zonder-google-fout="wachtwoord"]');
    const uit = await Promise.race([fout.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'fout'), navigatie.then((n) => (n ? 'nav' : 'niets'))]);
    if (uit === 'fout') return (await fout.innerText()).trim();
    await naarId(page);
    return '';
  };
  /** Після входу людина опиняється на адресі повернення (типово hub); сеанс перевіряємо на id (центр облікового запису). */
  async function naarId(page: Page) {
    await page.waitForURL((u) => /tarasevych\.com$/.test(u.hostname) && !/\/api\//.test(u.pathname), { timeout: 20000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle').catch(() => undefined);
    if (!/^https:\/\/id\.tarasevych\.com\/(\?|$)/.test(page.url())) await page.goto(`${ID}/?lang=uk`, { waitUntil: 'networkidle' });
  }
  /** Вікно «Другий крок входу», якщо ворота зачинені (правило M): підтвердити ключем. */
  const poortOpen = async (page: Page) => {
    const p = page.locator('[data-tweede-factor-poort]');
    if (!(await p.isVisible().catch(() => false))) return;
    await p.getByRole('button', { name: 'Підтвердити вхід' }).click();
    await bevestigToegang(page, 'passkey');
    await page.waitForLoadState('networkidle').catch(() => undefined);
  };

  let O!: Persoon, A!: Persoon;
  let oId = '', aId = '';
  let d1!: { ctx: BrowserContext; page: Page }; let v1!: Virtueel; // пристрій 1 особи A (комп'ютер)
  let geheim = '';               // секрет TOTP (лише в пам'яті тесту)
  let codes: string[] = [];      // перший набір кодів відновлення (лише в пам'яті тесту)
  const wwA = `Proef-wachtwoord-${randomBytes(6).toString('hex')}`;
  try {
    // ---------------------------------------------------------------- особи, прапорці
    O = await persoon(G as never, 'i15a-eig', T); emails.push(O.email);
    A = await persoon(G as never, 'i15a-a', T); emails.push(A.email);
    oId = await goedkeuren(O, 'Власниця Проба'); aId = await goedkeuren(A, 'Особа Проба');
    for (const v of VLAGGEN) await pool.query('UPDATE app.feature_flags SET aan = true, standaard = false, percentage = 0, gebruikers = $2 WHERE sleutel = $1', [v, [oId, aId]]);
    // Гігієна випробувального середовища: усі браузерні тести мають ту саму IP 127.0.0.1, тож межі входу на IP (10-хв вікно)
    // накопичувалися з ПОПЕРЕДНІХ прогонів. Скидаємо лише лічильники входу на IP (не межу на адресу й не блокування пари адреса+IP).
    await pool.query("delete from app.rate_limits where bucket like 'aanmelden-%' and bucket not like 'aanmelden-wachtwoord-adres:%'").catch(() => undefined);
    check('підготовка: власник і схвалена особа; прапорці входу без Google — «Вибрані» (ці дві особи)', !!oId && !!aId && (await pool.query('select count(*)::int n from app.feature_flags where sleutel = any($1) and aan and $2 = any(gebruikers)', [VLAGGEN, aId])).rows[0].n === 3);

    // ================================================================ G. сторінка входу і вхід через Google
    if (STAPPEN.includes('G')) {
      const tel = await leegApparaat({ width: 380, height: 800, touch: true });
      await andere(tel.page);
      const opties = tel.page.locator('.mr-sign-in-opties');
      const tekst = await opties.innerText();
      check('сторінка входу (380): «Увійти через Google» і в «Інших способах» робочі «Увійти ключем доступу» та «Увійти паролем»',
        await tel.page.getByRole('button', { name: /Увійти через Google/ }).first().isVisible() && await opties.locator('[data-aanmeld-zonder-google="passkey"] button').isEnabled() && await opties.locator('[data-aanmeld-zonder-google="wachtwoord"] button').isEnabled(), tekst.slice(0, 300));
      const apple = opties.locator('button[data-aanmeld-ingang="apple"]'), ms = opties.locator('button[data-aanmeld-ingang="microsoft"]');
      check('без ключів власника Apple і Microsoft — вимкнені кнопки з точною передумовою (ключі, самоперевірка, прапорець, прив’язка)',
        await apple.isDisabled() && await ms.isDisabled() && /ключі Microsoft, пройдена самоперевірка й прапорець/.test(await ms.innerText()) && /ключі Apple/.test(await apple.innerText()) && /Недоступно/.test(await ms.innerText()));
      check('без ключів Discord на сторінці входу не показано взагалі (кнопки, що нічого не робить, немає)', (await opties.locator('[data-aanmeld-ingang="discord"]').count()) === 0);
      check('телефон 380: сторінка входу без горизонтальної прокрутки', (await horizontaal(tel.page)) <= 0, String(await horizontaal(tel.page)));
      await foto(tel.page, 'vhid-storinka-telefoon');
      await sluit(tel.ctx);

      d1 = await leegApparaat({ width: 1280, height: 860, wie: () => ({ sub: A.sub, email: A.email }) });
      await d1.page.goto(`${ID}/?lang=uk`, { waitUntil: 'networkidle' });
      await foto(d1.page, 'vhid-storinka-computer');
      await d1.page.getByRole('button', { name: /Увійти через Google/ }).first().click();
      await d1.page.waitForURL(/accounts\.google\.com|\/api\/owner\/auth\/google/, { timeout: 15000 }).catch(() => undefined);
      await d1.page.waitForURL((u) => /tarasevych\.com$/.test(u.hostname) && !/\/api\//.test(u.pathname), { timeout: 20000 }).catch(() => undefined);
      await d1.page.waitForLoadState('networkidle').catch(() => undefined);
      const landing = d1.page.url();
      // після входу людина опиняється в hub (типова адреса повернення); центр облікового запису — на id.
      await d1.page.goto(`${ID}/?lang=uk`, { waitUntil: 'networkidle' });
      check('вхід через Google кліком: сеанс для тієї самої особи (bootstrap), кнопки входу більше немає, authMethod «google»',
        (await ik(d1.page)) === aId && (await d1.page.getByRole('button', { name: /Увійти через Google/ }).count()) === 0 && (await authMethode(aId)) === 'google', landing);
    } else {
      d1 = await apparaat(browser, A, { taal: 'uk', width: 1280, height: 860 }); contexten.push(d1.ctx); volgPagina(d1.page); await googleStub(d1.ctx, () => ({ sub: A.sub, email: A.email }));
    }
    v1 = await virtueel(d1.page);

    // ================================================================ S. ключі доступу
    const sectie = () => d1.page.locator('[data-access-section="passkeys"]');
    let pkId = '';
    if (STAPPEN.includes('S')) {
      await d1.page.goto(`${ID}/security?lang=uk`, { waitUntil: 'networkidle' });
      await openBlok(d1.page, '[data-access-section="passkeys"]');
      await sectie().locator('[data-passkey-stand]').waitFor({ timeout: 15000 });
      const keruvaty = d1.page.locator('[data-access-method="google"] a', { hasText: 'Керувати' });
      check('«Електронна пошта та Google» → «Керувати»: посилання на myaccount.google.com/security у новій вкладці (noopener)',
        (await keruvaty.getAttribute('href')) === 'https://myaccount.google.com/security' && (await keruvaty.getAttribute('target')) === '_blank' && /noopener/.test(String(await keruvaty.getAttribute('rel'))));
      check('ключі: початковий стан «Ще не додано» і рядок стану «відкривають вхід без Google» (прапорець для цієї особи)',
        /Ще не додано/.test(await sectie().innerText()) && (await sectie().locator('[data-passkey-stand]').getAttribute('data-passkey-stand')) === 'aanmelden');
      await sectie().getByRole('button', { name: 'Додати passkey' }).click();
      await sectie().locator('#passkey-naam').fill('Проба ноутбук');
      await sectie().getByRole('button', { name: 'Продовжити' }).click();
      await bevestigToegang(d1.page, 'passkey', '', 3000);
      const rij = sectie().locator('[data-passkey]').first();
      await rij.waitFor({ timeout: 15000 }).catch(() => undefined);
      pkId = String(await rij.getAttribute('data-passkey'));
      const db = (await pool.query('select naam, vertrouwd_op from app.passkeys where user_id=$1', [aId])).rows;
      check('ключі: «Додати passkey» → ключ «Проба ноутбук» у переліку з позначкою «Вхід і підтвердження» і в базі',
        /Проба ноутбук/.test(await rij.innerText()) && /Passkey додано/.test(await sectie().innerText()) && (await rij.locator('[data-passkey-gebruik]').getAttribute('data-passkey-gebruik')) === 'aanmelden' && db.length === 1 && db[0].naam === 'Проба ноутбук', (await sectie().innerText()).slice(0, 300));
      // перейменування: Enter
      await rij.getByRole('button', { name: 'Перейменувати' }).click();
      const naamVeld = rij.locator('.access-plane-inline-form input');
      await naamVeld.fill('Проба ноутбук робочий');
      await naamVeld.press('Enter');
      await bevestigToegang(d1.page, 'passkey', '', 2500);
      await d1.page.waitForTimeout(800);
      await d1.page.reload({ waitUntil: 'networkidle' });
      await openBlok(d1.page, '[data-access-section="passkeys"] [data-passkey]');
      check('ключі: перейменування (Enter) зберігається після оновлення сторінки', /Проба ноутбук робочий/.test(await sectie().locator('[data-passkey]').first().innerText()) && (await pool.query('select naam from app.passkeys where user_id=$1', [aId])).rows[0]?.naam === 'Проба ноутбук робочий');
      // приватна нотатка
      const notitie = sectie().locator(`[data-notitie="passkey:${pkId}"]`);
      await notitie.locator('.toegang-potlood').click();
      await sectie().locator(`[data-notitie="passkey:${pkId}"] textarea`).fill('Лежить у шухляді робочого столу');
      await sectie().locator(`[data-notitie="passkey:${pkId}"]`).getByRole('button', { name: 'Зберегти' }).click();
      await d1.page.waitForTimeout(600);
      await d1.page.reload({ waitUntil: 'networkidle' });
      await openBlok(d1.page, `[data-notitie="passkey:${pkId}"]`);
      check('ключі: приватна нотатка до ключа зберігається після оновлення', /Лежить у шухляді робочого столу/.test(await sectie().locator(`[data-notitie="passkey:${pkId}"]`).innerText().catch(() => '')));
      const notB = await O.b.verzoek('id.tarasevych.com', '/api/owner/access/notities/lijst', O.b.ctxBody('identity'));
      check('ключі: нотатку не видно іншому обліковому запису (власниці сайту)', !JSON.stringify(notB.data).includes('шухляді'));
    }

    // ================================================================ S2. довіра (посилене підтвердження ключем), історія, відкликання
    if (STAPPEN.includes('S') && pkId) {
      await d1.page.goto(`${ID}/security?lang=uk`, { waitUntil: 'networkidle' });
      await openBlok(d1.page, `[data-passkey="${pkId}"]`);
      const rij = sectie().locator(`[data-passkey="${pkId}"]`);
      await rij.locator('[data-passkey-vertrouwen="aan"]').click();
      const dlg = d1.page.locator('[data-bevestig="passkey-vertrouwen"]');
      await dlg.waitFor({ state: 'visible', timeout: 5000 });
      check('довіра: діалог пояснює різницю «є ключ» / «довіра» і наслідки (позначка, посилене підтвердження, журнал)', /Довіряти ключу/.test(await dlg.innerText()) && /журнал/.test(await dlg.innerText()));
      await foto(d1.page, 'dovira-dialoog-computer');
      await dlg.locator('.bevestig-dialoog-ja').click();
      const vikno = await bevestigToegang(d1.page, 'passkey');
      await rij.locator('[data-passkey-vertrouwd]').waitFor({ timeout: 15000 }).catch(() => undefined);
      check('ключ як підтвердження важливої дії: вікно «Підтвердіть доступ» (лише сильні способи) → ключ → дію виконано', vikno && await rij.locator('[data-passkey-vertrouwd]').isVisible());
      await d1.page.reload({ waitUntil: 'networkidle' });
      await openBlok(d1.page, `[data-passkey="${pkId}"]`);
      const vdb = (await pool.query('select vertrouwd_op, vertrouwd_wie from app.passkeys where user_id=$1', [aId])).rows[0];
      check('довіра: «Довірений» лишається після оновлення; у базі записано коли й хто', await rij.locator('[data-passkey-vertrouwd]').isVisible() && !!vdb?.vertrouwd_op && !!vdb?.vertrouwd_wie);
      const gebruik = rij.locator(`[data-gebruik="${pkId}"]`);
      check('історія використання ключа: «Останнє використання» з дією й пристроєм, у рядку — дата останнього використання', await gebruik.isVisible().catch(() => false) && /Останнє використання/.test(await gebruik.innerText()) && /Останнє використання \d/.test(await rij.innerText()), (await gebruik.innerText().catch(() => '')).slice(0, 200));
      await foto(d1.page, 'kliuchi-computer');
      // відкликати довіру
      await rij.locator('[data-passkey-vertrouwen="uit"]').click();
      await d1.page.locator('[data-bevestig="passkey-vertrouwen"] .bevestig-dialoog-ja').click();
      await bevestigToegang(d1.page, 'passkey');
      await rij.locator('[data-passkey-vertrouwen="aan"]').waitFor({ timeout: 15000 }).catch(() => undefined);
      check('відкликання довіри: позначки «Довірений» немає, ключ лишився (і в базі vertrouwd_op порожнє)', (await rij.locator('[data-passkey-vertrouwd]').count()) === 0 && (await rij.count()) === 1 && !(await pool.query('select vertrouwd_op from app.passkeys where user_id=$1', [aId])).rows[0]?.vertrouwd_op);
    }

    // ================================================================ T + R. застосунок-автентифікатор і перший набір кодів відновлення
    if (STAPPEN.includes('T')) {
      await d1.page.goto(`${ID}/security?lang=uk`, { waitUntil: 'networkidle' });
      const rij = d1.page.locator('[data-access-factor="totp"]');
      await openBlok(d1.page, '[data-access-factor="totp"]');
      check('TOTP: початковий стан «Не налаштовано»', /Не налаштовано/.test(await rij.innerText()));
      await rij.getByRole('button', { name: 'Налаштувати' }).click();
      await bevestigToegang(d1.page, 'passkey', '', 3000);
      const opzet = d1.page.locator('.access-plane-totp-setup');
      await opzet.waitFor({ timeout: 15000 });
      geheim = (await opzet.locator('.access-plane-secret').innerText()).replace(/\s+/g, '');
      check('TOTP: «Налаштувати» → QR-код і ключ для ручного введення (ключ прихований від ШІ-розширення)', /^[A-Z2-7]{16,}$/.test(geheim) && (await opzet.locator('canvas, svg').count()) >= 1 && (await opzet.locator('.access-plane-secret').getAttribute('data-ai-verborgen')) === '1');
      await foto(d1.page, 'totp-qr-computer');
      const veld = opzet.locator('.access-plane-inline-form input').first();
      const goed = await versCode(geheim);
      await veld.fill(goed === '000000' ? '111111' : '000000');
      await opzet.getByRole('button', { name: 'Підтвердити' }).click();
      await d1.page.waitForTimeout(800);
      check('TOTP: неправильний код відхилено — автентифікатор не ввімкнено', !(await pool.query("select data->>'confirmed' c from app.records where tbl='identity_totp_v1' and data->>'userId'=$1", [aId])).rows.some((r: { c: string }) => r.c === 'true'));
      await veld.fill(goed);
      await opzet.getByRole('button', { name: 'Підтвердити' }).click();
      const nieuw = d1.page.locator('[data-herstel-nieuw]');
      await nieuw.waitFor({ timeout: 15000 }).catch(() => undefined);
      check('TOTP: перший код → «Налаштовано»; одразу показано новий набір кодів відновлення', /Налаштовано/.test(await rij.innerText()) && await nieuw.isVisible());
      codes = (await nieuw.locator('li').allInnerTexts()).map((x) => x.trim());
    }
    if (STAPPEN.includes('R') && codes.length) {
      const nieuw = d1.page.locator('[data-herstel-nieuw]');
      const herstel = d1.page.locator('[data-access-section="recovery"]');
      check('коди відновлення: 10 кодів формату XXXX-XXXX-XXXX, позначені прихованими від ШІ', codes.length === 10 && codes.every((c) => /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(c)) && (await nieuw.getAttribute('data-ai-verborgen')) === '1');
      await nieuw.scrollIntoViewIfNeeded();
      await foto(d1.page, 'herstelcodes-nieuw-computer');
      const [download] = await Promise.all([d1.page.waitForEvent('download', { timeout: 5000 }), nieuw.getByRole('button', { name: 'Завантажити' }).click()]);
      const inhoud = readFileSync(await download.path(), 'utf8');
      check('«Завантажити»: файл mijn-ruimte-herstelcodes.txt з усіма 10 кодами', download.suggestedFilename() === 'mijn-ruimte-herstelcodes.txt' && codes.every((c) => inhoud.includes(c)));
      await d1.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ID });
      await nieuw.getByRole('button', { name: 'Копіювати' }).click();
      const klembord = await d1.page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      check('«Копіювати»: у буфері всі 10 кодів і видно «Коди скопійовано»', codes.every((c) => klembord.includes(c)) && await tekstOp(herstel, /Коди скопійовано/));
      await d1.page.evaluate(() => { const w = window as unknown as { __druk: number; __drukKlas: boolean }; w.__druk = 0; window.print = () => { w.__druk++; w.__drukKlas = document.body.classList.contains('herstel-afdruk'); }; });
      await nieuw.getByRole('button', { name: 'Друкувати' }).click();
      check('«Друкувати»: window.print викликано один раз, під час друку сторінка в режимі «лише коди» (herstel-afdruk)', await d1.page.evaluate(() => { const w = window as unknown as { __druk: number; __drukKlas: boolean }; return w.__druk === 1 && w.__drukKlas; }));
      // вигляд друку (media print) у тому самому стані, що його вмикає «Друкувати»: видно лише коди, без кнопок і оболонки
      await d1.page.evaluate(() => document.body.classList.add('herstel-afdruk'));
      await d1.page.emulateMedia({ media: 'print' });
      const druk = await d1.page.evaluate(() => {
        const zicht = (el: Element | null) => !!el && getComputedStyle(el).visibility === 'visible' && getComputedStyle(el).display !== 'none';
        const blok = document.querySelector('[data-herstel-nieuw]');
        return { codes: zicht(blok?.querySelector('li') || null), knoppen: zicht(blok?.querySelector('.herstel-knoppen') || null), menu: zicht(document.querySelector('aside, nav')), kop: zicht(document.querySelector('#aanmeldmethoden-2fa h2')) };
      });
      await d1.page.emulateMedia({ media: 'screen' });
      await d1.page.evaluate(() => document.body.classList.remove('herstel-afdruk'));
      check('друк (media print): видно лише коди — без кнопок «Завантажити/Копіювати/Друкувати», меню й інших розділів', druk.codes && !druk.knoppen && !druk.menu && !druk.kop, JSON.stringify(druk));
      const gereed = nieuw.getByRole('button', { name: 'Готово' });
      check('«Готово» неактивне без позначки «Я зберіг коди»', await gereed.isDisabled());
      await nieuw.getByLabel('Я зберіг коди').check();
      await gereed.click();
      // блок нових кодів зникає з «Безпеки»; лишається розділ «Відновлення» (окремий екземпляр панелі) — БЕЗ перезавантаження сторінки
      await d1.page.waitForFunction(() => document.querySelectorAll('[data-access-section="recovery"]').length === 1, undefined, { timeout: 10000 }).catch(() => undefined);
      const lijst = herstel.locator('[data-herstel-lijst]');
      await lijst.waitFor({ timeout: 10000 }).catch(() => undefined);
      const teller = (await herstel.locator('[data-herstel-teller]').innerText()).trim();
      check('після «Готово»: коди сховано (на сторінці їх немає), лічильник «Залишилося 10 з 10», замаскований перелік, «збережено»',
        teller === 'Залишилося 10 з 10' && (await lijst.locator('li').count()) === 10 && !(await d1.page.content()).includes(codes[0]) && /збережено/.test(await herstel.innerText()), teller);
      // нотатки: до набору й до одного коду
      await herstel.locator('[data-herstel-set-notitie] .toegang-potlood').click();
      await herstel.locator('[data-herstel-set-notitie] textarea').fill('Папір у сейфі вдома');
      await herstel.locator('[data-herstel-set-notitie]').getByRole('button', { name: 'Зберегти' }).click();
      await d1.page.waitForTimeout(400);
      await lijst.locator('li').first().locator('.toegang-potlood').click();
      await lijst.locator('li').first().locator('textarea').fill('Перший рядок аркуша');
      await lijst.locator('li').first().getByRole('button', { name: 'Зберегти' }).click();
      await d1.page.waitForTimeout(600);
      await d1.page.reload({ waitUntil: 'networkidle' });
      await openBlok(d1.page, '[data-herstel-lijst]');
      check('нотатки: до набору кодів і до окремого коду зберігаються після оновлення', /Папір у сейфі вдома/.test(await herstel.innerText()) && /Перший рядок аркуша/.test(await herstel.locator('[data-herstel-lijst] li').first().innerText()));
    }

    // ================================================================ W. пароль: задати → вийти → увійти паролем (+ код застосунку)
    if (STAPPEN.includes('W')) {
      await d1.page.goto(`${ID}/security?lang=uk`, { waitUntil: 'networkidle' });
      const ww = d1.page.locator('#aanmeldmethoden-wachtwoord');
      await openBlok(d1.page, '#aanmeldmethoden-wachtwoord');
      check('пароль: початковий стан — пароля немає', (await ww.getAttribute('data-wachtwoord')) === 'geen');
      await ww.locator('[data-wachtwoord-knop]').click();
      await ww.locator('input[autocomplete="new-password"]').fill('123456789');
      const negen = await ww.getByRole('button', { name: 'Зберегти' }).isDisabled();
      await ww.locator('input[autocomplete="new-password"]').fill('1234567890');
      check('пароль: форма — «Зберегти» неактивне для 9 символів і активне для 10', negen && await ww.getByRole('button', { name: 'Зберегти' }).isEnabled());
      await ww.locator('input[autocomplete="new-password"]').fill(wwA);
      await ww.getByRole('button', { name: 'Зберегти' }).click();
      const vikno = await bevestigToegang(d1.page, 'passkey');
      await d1.page.waitForFunction(() => document.querySelector('#aanmeldmethoden-wachtwoord')?.getAttribute('data-wachtwoord') === 'ingesteld', undefined, { timeout: 15000 }).catch(() => undefined);
      // посилене підтвердження: або вікно з ключем, або ще свіже (≤ 5 хв) підтвердження ключем від попередньої дії — обидва чесні
      check(`пароль: «Зберегти» → посилене підтвердження (${vikno ? 'вікно, ключ' : 'свіже підтвердження ключем'}) → пароль задано, «Паролем можна входити…»`, (await ww.getAttribute('data-wachtwoord')) === 'ingesteld' && (await ww.locator('[data-wachtwoord-inloggen]').getAttribute('data-wachtwoord-inloggen')) === 'aan');
      // вийти через меню облікового запису
      await d1.page.click('.canonical-avatar-trigger');
      await d1.page.waitForSelector('.canonical-account-panel', { timeout: 8000 });
      await d1.page.locator('.canonical-account-panel .logout-current').first().click();
      await d1.page.getByRole('button', { name: /Увійти через Google/ }).first().waitFor({ timeout: 15000 }).catch(() => undefined);
      check('«Вийти» з меню облікового запису → сторінка входу, сеансу немає', !(await ik(d1.page)) && (await d1.page.getByRole('button', { name: /Увійти через Google/ }).count()) >= 1);
      await geenLockouts(A.email);
      const zonder = await wachtwoordInloggen(d1.page, A.email, wwA, '');
      check('вхід паролем без коду (є застосунок-автентифікатор) → чесна відмова, сеансу немає', !!zonder && !(await ik(d1.page)), zonder);
      if (geheim) {
        const met = await wachtwoordInloggen(d1.page, A.email, wwA, await versCode(geheim));
        check('вхід паролем + код застосунку → сеанс для тієї самої особи, authMethod «password»', !met && (await ik(d1.page)) === aId && (await authMethode(aId)) === 'password', met);
      }
    }

    // ================================================================ P. вхід ключем на іншому пристрої (телефон 380)
    let d2: { ctx: BrowserContext; page: Page } | null = null; let v2: Virtueel | null = null;
    if (STAPPEN.includes('P') && pkId) {
      d2 = await leegApparaat({ width: 380, height: 800, touch: true });
      v2 = await virtueel(d2.page);
      const n = await kopieerSleutels(v1, v2);
      await andere(d2.page);
      const knop = d2.page.locator('[data-aanmeld-zonder-google="passkey"] button');
      await foto(d2.page, 'vhid-kliuchem-telefoon');
      const nav = d2.page.waitForEvent('framenavigated', { timeout: 15000 }).catch(() => undefined);
      await knop.click();
      await nav; await naarId(d2.page);
      check('вхід ключем (новий пристрій без cookie, синхронізований ключ): «Увійти ключем доступу» → сеанс тієї самої особи, authMethod «passkey»',
        n >= 1 && (await ik(d2.page)) === aId && (await authMethode(aId)) === 'passkey', String(n));
      check('телефон 380 після входу ключем — без горизонтальної прокрутки', (await horizontaal(d2.page)) <= 0);
      await kopieerSleutels(v2, v1); // синхронізація лічильника назад на комп'ютер
    }

    // ================================================================ R2. одноразовість, заміна, відкликання кодів відновлення
    if (STAPPEN.includes('R') && codes.length && STAPPEN.includes('W')) {
      const d3 = await leegApparaat({ width: 1280, height: 860 });
      await geenLockouts(A.email);
      const eerste = await wachtwoordInloggen(d3.page, A.email, wwA, codes[4].toLowerCase());
      check('код відновлення замість коду застосунку (малі літери): вхід паролем + код → сеанс', !eerste && (await ik(d3.page)) === aId, eerste);
      await sluit(d3.ctx);
      const d4 = await leegApparaat({ width: 1280, height: 860 });
      const tweede = await wachtwoordInloggen(d4.page, A.email, wwA, codes[4]);
      check('одноразовість: той самий код відновлення вдруге → відмова, сеансу немає', !!tweede && !(await ik(d4.page)), tweede);
      // стан у центрі
      await d1.page.goto(`${ID}/security?lang=uk`, { waitUntil: 'networkidle' });
      const herstel = d1.page.locator('[data-access-section="recovery"]');
      await openBlok(d1.page, '[data-herstel-lijst]');
      const statussen = await herstel.locator('[data-herstel-lijst] li').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
      check('лічильник: «Залишилося 9 з 10», один код позначено «Використано <дата>»', (await herstel.locator('[data-herstel-teller]').innerText()).trim() === 'Залишилося 9 з 10' && statussen.filter((s) => s === 'gebruikt').length === 1 && /Використано \d/.test(await herstel.innerText()));
      await d1.page.setViewportSize({ width: 380, height: 800 });
      await herstel.scrollIntoViewIfNeeded();
      check('телефон 380: коди відновлення без горизонтальної прокрутки', (await horizontaal(d1.page)) <= 0);
      await foto(d1.page, 'herstelcodes-lijst-telefoon');
      await d1.page.setViewportSize({ width: 1280, height: 860 });
      // заміна набору
      await herstel.getByRole('button', { name: 'Створити нові' }).click();
      check('заміна з автентифікатором: «Створити нові» просить підтвердження (ключ або код застосунку) — ключем', await bevestigToegang(d1.page, 'passkey'));
      const nieuw = d1.page.locator('[data-herstel-nieuw]');
      await nieuw.waitFor({ timeout: 15000 }).catch(() => undefined);
      const nieuweCodes = (await nieuw.locator('li').allInnerTexts()).map((x) => x.trim());
      await nieuw.getByLabel('Я зберіг коди').check();
      await nieuw.getByRole('button', { name: 'Готово' }).click();
      await herstel.locator('[data-herstel-lijst]').waitFor({ timeout: 10000 }).catch(() => undefined);
      check('заміна: «Створити нові» → 10 нових кодів, інших за старі; лічильник «Залишилося 10 з 10»', nieuweCodes.length === 10 && !nieuweCodes.some((c) => codes.includes(c)) && (await herstel.locator('[data-herstel-teller]').innerText()).trim() === 'Залишилося 10 з 10');
      const d5 = await leegApparaat({ width: 1280, height: 860 });
      await geenLockouts(A.email);
      const oud = await wachtwoordInloggen(d5.page, A.email, wwA, codes[6]);
      check('заміна: невикористаний код СТАРОГО набору після заміни відмовляє', !!oud && !(await ik(d5.page)), oud);
      const nieuwOk = await wachtwoordInloggen(d5.page, A.email, wwA, nieuweCodes[0]);
      check('заміна: код НОВОГО набору діє', !nieuwOk && (await ik(d5.page)) === aId, nieuwOk);
      await sluit(d5.ctx);
      // відкликання
      await d1.page.reload({ waitUntil: 'networkidle' });
      await openBlok(d1.page, '[data-access-section="recovery"]');
      await herstel.getByRole('button', { name: 'Відкликати всі' }).click();
      await herstel.getByRole('button', { name: 'Відкликати', exact: true }).click();
      await bevestigToegang(d1.page, 'passkey', '', 3000);
      await tekstOp(herstel, /Усі коди відкликано/, 10000);
      check('«Відкликати всі»: «Залишилося 0 з 10», позначка «Відкликано»', (await herstel.locator('[data-herstel-teller]').innerText()).trim() === 'Залишилося 0 з 10' && /Відкликано/.test(await herstel.innerText()));
      const d6 = await leegApparaat({ width: 1280, height: 860 });
      await geenLockouts(A.email);
      const naIntrek = await wachtwoordInloggen(d6.page, A.email, wwA, nieuweCodes[3]);
      check('після відкликання раніше чинний код відмовляє, сеансу немає', !!naIntrek && !(await ik(d6.page)), naIntrek);
      await sluit(d4.ctx, d6.ctx);
      await geenLockouts(A.email);
    }

    // ================================================================ M. правило «другий чинник обов'язковий»
    if (STAPPEN.includes('M') && pkId) {
      const dO = await apparaat(browser, O, { taal: 'uk', width: 1280, height: 860 }); contexten.push(dO.ctx); volgPagina(dO.page);
      await virtueel(dO.page);
      await dO.page.goto(`${ID}/security?lang=uk`, { waitUntil: 'networkidle' });
      await openBlok(dO.page, '[data-access-section="passkeys"]');
      await dO.page.locator('[data-access-section="passkeys"]').getByRole('button', { name: 'Додати passkey' }).click();
      await dO.page.locator('#passkey-naam').fill('Ключ власниці');
      await dO.page.locator('[data-access-section="passkeys"]').getByRole('button', { name: 'Продовжити' }).click();
      await bevestigToegang(dO.page, 'passkey', '', 3000);
      await dO.page.locator('[data-access-section="passkeys"] [data-passkey]').first().waitFor({ timeout: 15000 }).catch(() => undefined);
      const schakel = dO.page.locator('[data-mfa-beleid-schakel] input');
      await openBlok(dO.page, '[data-mfa-beleid-schakel]');
      check('правило: перемикач лише власниці, за замовчуванням вимкнено', !(await schakel.isChecked()));
      await dO.page.locator('[data-mfa-beleid-schakel]').click();
      const dlg = dO.page.locator('[data-bevestig="mfa-beleid"]');
      await dlg.waitFor({ state: 'visible', timeout: 5000 });
      check('правило: діалог із наслідками («Ваш поточний вхід теж…», «Запасний шлях — код відновлення»)', /Зробити другий крок входу обов’язковим/.test(await dlg.innerText()) && /код відновлення/.test(await dlg.innerText()));
      achterPoort.add(dO.page); await dlg.locator('.bevestig-dialoog-ja').click();
      await bevestigToegang(dO.page, 'passkey');
      await dO.page.waitForTimeout(1200);
      const beleid = (await pool.query("select data->>'mfa' m from app.records where tbl='access_method_policy_v1'")).rows[0]?.m;
      check('правило: після підтвердження ключем збережено mfa=required', beleid === 'required', String(beleid));
      await new Promise((r) => setTimeout(r, 10500)); // кеш правила на сервері — 10 с
      // наступний вхід A через Google: комп'ютер із ключем
      const d7 = await leegApparaat({ width: 1280, height: 860, wie: () => ({ sub: A.sub, email: A.email }) }); achterPoort.add(d7.page);
      const v7 = await virtueel(d7.page); await kopieerSleutels(v1, v7);
      await d7.page.goto(`${ID}/?lang=uk`, { waitUntil: 'networkidle' });
      await d7.page.getByRole('button', { name: /Увійти через Google/ }).first().click();
      await d7.page.waitForURL(/accounts\.google\.com|\/api\/owner\/auth\/google/, { timeout: 15000 }).catch(() => undefined);
      await naarId(d7.page);
      const poort = d7.page.locator('[data-tweede-factor-poort]');
      await poort.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
      const dicht = await api(d7.page, '/api/owner/access/passkeys/lijst');
      check('наступний вхід Google з правилом: вікно «Другий крок входу», дані закриті (сервер відмовляє)', await poort.isVisible() && /Другий крок входу/.test(await poort.innerText()) && dicht.status >= 400, `${dicht.status} ${JSON.stringify(dicht.data).slice(0, 120)}`);
      await poort.getByRole('button', { name: 'Підтвердити вхід' }).click();
      await bevestigToegang(d7.page, 'passkey');
      await d7.page.waitForLoadState('networkidle').catch(() => undefined);
      await d7.page.waitForTimeout(800);
      const open = await api(d7.page, '/api/owner/access/passkeys/lijst');
      check('другий крок ключем → сторінка перезавантажилась, вікна немає, дані відкриті', (await poort.count()) === 0 && open.status === 200, String(open.status));
      await kopieerSleutels(v7, v1); achterPoort.delete(d7.page);
      // телефон без ключа: код застосунку
      if (geheim) {
        const d8 = await leegApparaat({ width: 380, height: 800, touch: true, wie: () => ({ sub: A.sub, email: A.email }) }); achterPoort.add(d8.page);
        await d8.page.goto(`${ID}/?lang=uk`, { waitUntil: 'networkidle' });
        await d8.page.getByRole('button', { name: /Увійти через Google/ }).first().click();
        await d8.page.waitForURL(/accounts\.google\.com|\/api\/owner\/auth\/google/, { timeout: 15000 }).catch(() => undefined);
        await naarId(d8.page);
        const p8 = d8.page.locator('[data-tweede-factor-poort]');
        await p8.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
        await d8.page.waitForTimeout(1500);
        const knoppen = await p8.locator('.codewoord-poort-knoppen button').evaluateAll((els) => els.map((e) => { const c = getComputedStyle(e); return { rand: c.borderTopStyle !== 'none' && parseFloat(c.borderTopWidth) > 0, hoogte: e.getBoundingClientRect().height }; }));
        check('вікно «Другий крок входу» (380): обидві кнопки видно як кнопки (рамка), висота ≥ 40 px; за вікном немає хибного «Не вдалося завантажити сесії»',
          knoppen.length === 2 && knoppen.every((k) => k.rand && k.hoogte >= 39.5) && !(await d8.page.getByText('Не вдалося завантажити сесії').isVisible().catch(() => false)), JSON.stringify(knoppen));
        await foto(d8.page, 'druhyi-krok-telefoon');
        await p8.getByRole('button', { name: 'Підтвердити вхід' }).click();
        await bevestigToegang(d8.page, 'totp', await versCode(geheim));
        await d8.page.waitForLoadState('networkidle').catch(() => undefined);
        await d8.page.waitForTimeout(800);
        achterPoort.delete(d8.page);
        check('другий крок кодом застосунку (телефон 380) → дані відкриті', (await p8.count()) === 0 && (await api(d8.page, '/api/owner/access/passkeys/lijst')).status === 200);
        await sluit(d8.ctx);
      }
      // власниця вимикає правило
      await dO.page.reload({ waitUntil: 'networkidle' });
      await bevestigToegang(dO.page, 'passkey', '', 1500);
      const poortO = dO.page.locator('[data-tweede-factor-poort]');
      if (await poortO.isVisible().catch(() => false)) { await poortO.getByRole('button', { name: 'Підтвердити вхід' }).click(); await bevestigToegang(dO.page, 'passkey'); await dO.page.waitForLoadState('networkidle').catch(() => undefined); }
      achterPoort.delete(dO.page);
      await openBlok(dO.page, '[data-mfa-beleid-schakel]');
      await dO.page.locator('[data-mfa-beleid-schakel]').click();
      await dO.page.locator('[data-bevestig="mfa-beleid"] .bevestig-dialoog-ja').click();
      await bevestigToegang(dO.page, 'passkey', '', 4000);
      await dO.page.waitForTimeout(1200);
      check('власниця вимикає правило (діалог, підтвердження) → mfa=optional', (await pool.query("select data->>'mfa' m from app.records where tbl='access_method_policy_v1'")).rows[0]?.m === 'optional');
      await sluit(d7.ctx, dO.ctx);
      await new Promise((r) => setTimeout(r, 10500)); // кеш правила на сервері — 10 с
    }

    // ================================================================ X. Microsoft / Discord / Apple / Telegram
    if (STAPPEN.includes('X')) {
      await d1.page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' });
      await poortOpen(d1.page);
      await openBlok(d1.page, '#aanmeldmethoden-catalogus');
      await d1.page.waitForTimeout(800);
      const cat = d1.page.locator('#aanmeldmethoden-catalogus');
      const catTekst = await cat.innerText();
      console.log(`[e2e] каталог (без ключів): ${catTekst.replace(/\s+/g, ' ').slice(0, 900)}`);
      check('каталог без ключів: Microsoft, Discord, Apple і Telegram названо, кнопки «Підключити» немає, назв серверних ключів не-власниці не показано',
        /Microsoft/.test(catTekst) && /Discord/.test(catTekst) && /Apple/.test(catTekst) && /Telegram/.test(catTekst) && (await cat.locator('[data-amv-koppelknop]').count()) === 0 && !/AANMELD_/.test(catTekst));
      Object.assign(process.env, { AANMELD_MICROSOFT_CLIENT_ID: MS_ID, AANMELD_MICROSOFT_CLIENT_SECRET: MS_GEHEIM, AANMELD_MICROSOFT_BASIS: nep.url });
      const zt = await O.b.verzoek('id.tarasevych.com', '/api/owner/aanmeld/vnext/zelftest', O.b.ctxBody('identity', { id: 'microsoft' }));
      check('власниця: самоперевірка Microsoft (підроблений провайдер) зелена', zt.data?.zelftest === 'ok', JSON.stringify(zt.data).slice(0, 160));
      await d1.page.reload({ waitUntil: 'networkidle' });
      await openBlok(d1.page, '#aanmeldmethoden-catalogus');
      const koppel = d1.page.locator('[data-amv-koppelknop="microsoft"]');
      await koppel.waitFor({ timeout: 15000 }).catch(() => undefined);
      check('з ключами й самоперевіркою в каталозі з’являється «Підключити» лише для Microsoft', (await koppel.count()) === 1 && (await d1.page.locator('[data-amv-koppelknop]').count()) === 1);
      await koppel.click();
      await bevestigToegang(d1.page, 'passkey', '', 3000);
      await d1.page.waitForURL(/koppel=microsoft-ok/, { timeout: 30000 }).catch(() => undefined);
      await d1.page.locator('[data-amv-gekoppeld="microsoft"]').waitFor({ timeout: 15000 }).catch(() => undefined);
      check('прив’язка Microsoft: провайдер → повернення → «Прив’язано: …» (мітка замаскована)', /koppel=microsoft-ok/.test(d1.page.url()) && (await d1.page.locator('[data-amv-gekoppeld="microsoft"]').count()) === 1, d1.page.url());
      const d9 = await leegApparaat({ width: 380, height: 800, touch: true });
      await andere(d9.page);
      const msKnop = d9.page.locator('[data-aanmeld-zonder-google="microsoft"] button');
      check('сторінка входу: робоча кнопка «Увійти через Microsoft» (а не вимкнена з передумовою)', await msKnop.isEnabled().catch(() => false) && /Увійти через Microsoft/.test(await msKnop.innerText().catch(() => '')));
      await foto(d9.page, 'vhid-microsoft-telefoon');
      await msKnop.click();
      await d9.page.waitForURL(/127\.0\.0\.1|\/api\/aanmeld\//, { timeout: 15000 }).catch(() => undefined);
      await naarId(d9.page);
      check('вхід через Microsoft (підроблений провайдер, PKCE): сеанс для прив’язаної особи, authMethod «microsoft»', (await ik(d9.page)) === aId && (await authMethode(aId)) === 'microsoft', d9.page.url());
      check('провайдер бачив обмін коду з PKCE (code_verifier)', nep.aanroepen.some((a) => a.pad.includes('/token') && !!a.velden.code_verifier));
      await sluit(d9.ctx);
    }

    // ================================================================ D. вилучення ключа
    if (STAPPEN.includes('D') && pkId) {
      await d1.page.goto(`${ID}/security?lang=uk`, { waitUntil: 'networkidle' });
      await openBlok(d1.page, `[data-passkey="${pkId}"]`);
      const rij = sectie().locator(`[data-passkey="${pkId}"]`);
      const gebruik = rij.locator(`[data-gebruik="${pkId}"]`);
      const uitklap = gebruik.locator('.toegang-uitklap');
      if (await uitklap.count()) await uitklap.click();
      const regels = await gebruik.locator('.toegang-gebruik-lijst li').allInnerTexts();
      check('історія використання: «Усі використання (N)» розгортає перелік — кожне підтвердження й вхід ключем з дією, хостом і пристроєм (N ≥ 2)', regels.length >= 2 && regels.every((r) => /tarasevych\.com/.test(r)), `${regels.length}: ${regels.slice(0, 3).join(' | ').slice(0, 300)}`);
      await rij.getByRole('button', { name: 'Видалити' }).click();
      const bev = rij.locator('[data-bevestig="verwijderen"]');
      check('вилучення: вбудоване підтвердження з наслідками («більше не можна буде підтверджувати дії»)', /більше не можна буде підтверджувати/.test(await bev.innerText()));
      await bev.getByRole('button', { name: 'Скасувати' }).click();
      check('вилучення: «Скасувати» — ключ лишається', (await rij.count()) === 1 && (await pool.query('select count(*)::int n from app.passkeys where user_id=$1', [aId])).rows[0].n === 1);
      await rij.getByRole('button', { name: 'Видалити' }).click();
      await rij.locator('[data-bevestig="verwijderen"] button.danger').click();
      await bevestigToegang(d1.page, 'passkey', '', 3000);
      await rij.waitFor({ state: 'detached', timeout: 15000 }).catch(() => undefined);
      check('вилучення: ключа немає в переліку й у базі, «Passkey видалено»', (await rij.count()) === 0 && (await pool.query('select count(*)::int n from app.passkeys where user_id=$1', [aId])).rows[0].n === 0 && /Passkey видалено/.test(await sectie().innerText()));
      if (d2 && v2) {
        // d2 ще має сеанс — беремо новий пристрій без cookie з тим самим (синхронізованим) ключем
        const d10 = await leegApparaat({ width: 380, height: 800, touch: true });
        const v10 = await virtueel(d10.page); await kopieerSleutels(v1, v10);
        await andere(d10.page);
        await d10.page.locator('[data-aanmeld-zonder-google="passkey"] button').click();
        const fout = d10.page.locator('[data-aanmeld-zonder-google-fout="passkey"]');
        await fout.waitFor({ timeout: 15000 }).catch(() => undefined);
        check('вилучений ключ: вхід ним на іншому пристрої — чесна відмова, сеансу немає', await fout.isVisible() && !(await ik(d10.page)), await fout.innerText().catch(() => ''));
        await sluit(d10.ctx);
      }
    }
    check(`знімків не більше 12 (${fotoTeller})`, fotoTeller <= 12);
    check('без помилок у консолі й HTTP (окрім навмисних відмов і стану «не ввійшов»)', fouten.length === 0, fouten.slice(0, 8).join(' | '));
    if (poortVerzoeken.length) console.log(`[e2e] спостереження: поки ворота «другого кроку» зачинені, оболонка (hub/id) ще ${poortVerzoeken.length}× запитує дані й отримує відмову: ${[...new Set(poortVerzoeken.map((r) => r.replace(/^(\d+) https:\/\/([^/]+)\S*\/api\//, '$1 $2 /api/').replace(/\s\(.*$/, '')))].slice(0, 12).join(', ')}`);
    if (zonderSessie.length) console.log(`[e2e] без сеансу / до другого кроку: ${zonderSessie.length}× 401/403 на маршрутах шапки (очікувано): ${[...new Set(zonderSessie.map((r) => r.replace(/https:\/\/[^/]+/, '')))].slice(0, 8).join(', ')}`);
  } catch (e) {
    check('неочікувана помилка', false, String((e as Error)?.stack || e).slice(0, 1500));
  } finally {
    await browser.close().catch(() => undefined);
    for (const k of ['AANMELD_MICROSOFT_CLIENT_ID', 'AANMELD_MICROSOFT_CLIENT_SECRET', 'AANMELD_MICROSOFT_BASIS']) delete process.env[k];
    for (const r of vlagVooraf) await pool.query('UPDATE app.feature_flags SET aan=$2, standaard=$3, percentage=$4, gebruikers=$5 WHERE sleutel=$1', [r.sleutel, r.aan, r.standaard, r.percentage, r.gebruikers]).catch(() => undefined);
    // Правило входу — як було до тесту.
    await pool.query("delete from app.records where tbl='access_method_policy_v1'").catch(() => undefined);
    for (const r of beleidVooraf) await pool.query("insert into app.records (tbl,id,data) values ('access_method_policy_v1',$1,$2)", [r.id, r.data]).catch(() => undefined);
    // Прибирання лише за ТОЧНИМИ адресами цього запуску.
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [emails]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) {
      await pool.query('delete from app.passkeys where user_id = any($1)', [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    }
    await pool.query("delete from app.records where tbl='aanmeld_zelftest_v1' and data->>'aanbieder'='microsoft'").catch(() => undefined);
    globalThis.fetch = echteFetch;
    await nep.stop().catch(() => undefined);
    void HOSTS;
    await stop();
  }
  return einde();
}
