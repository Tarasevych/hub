// IDENTITEIT-015 (лінія C2): «запасні коди» (коди відновлення облікового запису) очима людини — справжній Chromium, пробний
// власник @example.test, лише вигадані дані. Пристрій A — центр облікового запису (комп'ютер 1280), пристрій B — другий вхід того
// самого власника (інший браузер), де коди «використовують».
//  1. Початковий стан: «Кодів ще немає», кнопка «Створити коди», переліку немає.
//  2. Автентифікатор (TOTP) увімкнено; «Створити нові» → «Підтвердіть доступ» (лише passkey/застосунок) → код застосунку →
//     10 кодів показано один раз. «Завантажити» (вміст файлу: рівно 10 кодів, без зайвого), «Копіювати» (буфер — рівно 10 кодів),
//     «Друкувати» (window.print перехоплено; друкується лише блок кодів), «Готово» лише після «Я зберіг коди» → замаскований
//     перелік, «Залишилося 10 з 10».
//  3. Нотатки до набору й до окремого коду зберігаються й лишаються після перезавантаження.
//  4. Одноразовість: код діє один раз (B), удруге той самий код відхилено; у A — «Залишилося 9 з 10», рядок перекреслено.
//  5. Заміна набору: старий (ще невикористаний) код відхилено, новий діє.
//  6. Нагадування: коли лишилося ≤ 2 — РІВНО ОДНЕ сповіщення access_recovery_low (і в центрі сповіщень), повтор не дублює.
//  7. «Відкликати всі» зі step-up (код застосунку) → невикористаний код відхилено, позначка «Відкликано».
// Коди НІКОЛИ не потрапляють у журнал (лише кількість і формат); на знімках їх розмито (verberg + розмиття полів коду).
// Acceptatie herstelcodes vanuit de mens: maken met step-up, downloaden/kopiëren/afdrukken, notities, eenmalig gebruik,
// vervangen, herinnering bij ≤2 codes (één melding), intrekken met step-up. Codes nooit in het logboek.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { Page } from 'playwright-core';
import { checker, totpCode } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { ID, api, apparaat, sluit, verberg, volgFouten, type Persoon } from './hulp/sessie-015';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || 'tests/e2e/знімки-015';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
// Очікувані відмови: 403 STEP_UP_* на «Відкликати всі» (відкриває вікно); agents/activity (не власник-агент).
const VERWACHT_A = [/\/api\/owner\/agents\/activity$/, /\/api\/owner\/access\/recovery\/intrekken$/];
const CODE_RE = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-015 herstelcodes');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const email = `e2e-hc-eig-${T}@example.test`, sub = `sub-e2e-hc-eig-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: email, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const foutenB: string[] = [];
  let userId = '';
  const foto = async (page: Page, naam: string, vol = false) => {
    await verberg(page);
    // додатково: замасковані підказки й поле введення коду у вікні
    await page.evaluate(() => { for (const el of Array.from(document.querySelectorAll<HTMLElement>('.herstel-code, #bevestig-toegang-code, .herstel-raster'))) el.style.setProperty('filter', 'blur(7px)', 'important'); }).catch(() => undefined);
    await page.screenshot({ path: `${UIT}/herstelcodes-${naam}.png`, fullPage: vol });
  };
  // Пристрій як окрема «особа» з тим самим обліковим записом (persoon() вигадує нову адресу — тут потрібна ТА САМА).
  const inloggen = async (): Promise<Persoon> => {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, email, { service: 'identity', tabContext: tab, intent: 'login' });
    return { email, sub, b: b as unknown as Persoon['b'], tab };
  };
  // TOTP: кожен код — новий крок (сервер відхиляє повтор того самого кроку), у вікні ±1 від поточного.
  let geheim = '', laatsteStap = 0;
  const volgendeTotp = async () => {
    let nu = Math.floor(Date.now() / 30000);
    const s = Math.max(laatsteStap + 1, nu - 1);
    while (s > nu + 1) { await new Promise((r) => setTimeout(r, 1000)); nu = Math.floor(Date.now() / 30000); }
    laatsteStap = s;
    return totpCode(geheim, s);
  };
  // Поле коду застосунку саме надсилає форму після 6 цифр; кнопку «Підтвердити» натискаємо, лише якщо вікно ще відкрите.
  const vulTotp = async (page: Page) => {
    await page.locator('#bevestig-toegang-code').fill(await volgendeTotp());
    const dicht = await page.locator('#bevestig-toegang-code').waitFor({ state: 'detached', timeout: 4000 }).then(() => true).catch(() => false);
    if (!dicht) { const k = page.getByRole('dialog').getByRole('button', { name: 'Підтвердити', exact: true }); if (await k.isEnabled().catch(() => false)) await k.click(); }
  };
  const sectie = (page: Page) => page.locator('[data-access-section="recovery"]');
  const teller = async (page: Page) => (await sectie(page).locator('[data-herstel-teller]').innerText()).trim();
  const open = async (page: Page) => { await page.goto(`${ID}/recovery?lang=uk`, { waitUntil: 'networkidle' }); await sectie(page).waitFor({ timeout: 20000 }); await sectie(page).locator('[data-herstel-teller]').waitFor({ timeout: 15000 }); await page.waitForTimeout(300); await sectie(page).scrollIntoViewIfNeeded(); };
  const meldingen = async () => Number((await pool.query("select count(*)::int n from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'='access_recovery_low'", [userId])).rows[0]?.n || 0);
  // Код «використовують» на пристрої B: підтвердження доступу кодом відновлення зі сторінки (cookie браузера B).
  const gebruik = async (page: Page, code: string) => page.evaluate(async (c) => {
    const tab = sessionStorage.getItem('tsv-canonical-tab-v1') || '';
    const r = await fetch('/api/owner/access/stap-op', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'identity', tabContext: tab, sourceOrigin: location.origin, methode: 'herstelcode', code: c }) });
    const d = await r.json().catch(() => ({})) as { error?: string; resterend?: number };
    return { status: r.status, error: String(d.error || ''), resterend: Number(d.resterend ?? -1) };
  }, code);
  // Новий набір у вікні: «Створити …» → вікно → код застосунку → панель із 10 кодами (повертає коди лише в пам'ять тесту).
  const nieuweSet = async (page: Page, knop: string) => {
    await sectie(page).getByRole('button', { name: knop }).click();
    const v = page.getByRole('dialog');
    await v.first().waitFor({ timeout: 10000 });
    const veld = page.locator('#bevestig-toegang-code');
    if (!(await veld.isVisible().catch(() => false))) await page.getByRole('button', { name: 'Використати код із застосунку-автентифікатора' }).click();
    const tekstVenster = (await page.locator('[role=dialog]').allInnerTexts()).join(' ');
    await vulTotp(page);
    const paneel = page.locator('[data-herstel-nieuw]');
    await paneel.waitFor({ timeout: 20000 }).catch(() => undefined);
    const codes = (await paneel.locator('li').allInnerTexts().catch(() => [] as string[])).map((x) => x.trim());
    return { codes, tekstVenster, paneel };
  };

  try {
    // ================================================================ 1. початковий стан
    const O = await inloggen();
    userId = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id || '');
    const { ctx: ctxA, page } = await apparaat(browser, O, { taal: 'uk', thema: 'dark', width: 1280, height: 900 });
    volgFouten(page, fouten, VERWACHT_A);
    await ctxA.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ID });
    await open(page);
    check('початковий стан: «Кодів ще немає», кнопка «Створити коди», переліку й «Відкликати всі» немає',
      await teller(page) === 'Кодів ще немає' && await sectie(page).getByRole('button', { name: 'Створити коди' }).isVisible()
      && await sectie(page).locator('[data-herstel-lijst]').count() === 0 && await sectie(page).getByRole('button', { name: 'Відкликати всі' }).count() === 0, await teller(page));
    await foto(page, '01-begin');

    // ================================================================ 2. створення зі step-up (код застосунку-автентифікатора)
    // Застосунок-автентифікатор вмикаємо через сам сайт (запити сторінки): свіжий вхід = step-up для першого ввімкнення.
    const start = await api(page, '/api/owner/access/totp/start');
    geheim = String(start.data?.secret || '');
    laatsteStap = Math.floor(Date.now() / 30000) - 2;
    const bev = await api(page, '/api/owner/access/totp/confirm', { code: await volgendeTotp() });
    check('підготовка: застосунок-автентифікатор увімкнено (сервер одразу видав стартовий набір, який тест не показує)', start.status === 200 && !!geheim && bev.status === 200 && Array.isArray(bev.data?.recoveryCodes) && bev.data.recoveryCodes.length === 10, `${start.status} ${bev.status}`);
    await open(page);
    const s1 = await nieuweSet(page, 'Створити нові');
    const codes = s1.codes;
    check('«Створити нові» з автентифікатором → «Підтвердіть доступ» лише з passkey/кодом застосунку (без Google і без кодів відновлення)',
      /Підтвердіть доступ/.test(s1.tekstVenster) && !/повторним входом через Google/.test(s1.tekstVenster) && !/Використати код відновлення/.test(s1.tekstVenster), s1.tekstVenster.replace(/[\w.+-]+@example\.test/g, 'proef•••').replace(/\s+/g, ' ').slice(0, 200));
    check('після коду застосунку: 10 різних кодів формату XXXX-XXXX-XXXX, вікно закрито',
      codes.length === 10 && codes.every((c) => CODE_RE.test(c)) && new Set(codes).size === 10 && await page.getByRole('dialog').count() === 0, `кодів=${codes.length}`);
    await s1.paneel.scrollIntoViewIfNeeded();
    await foto(page, '02-nieuwe-set');

    // «Завантажити»: вміст файлу — рівно ці 10 кодів, без зайвого (лише заголовок, дата, порада).
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), s1.paneel.getByRole('button', { name: 'Завантажити' }).click()]);
    const inhoud = readFileSync(await download.path(), 'utf8');
    const regels = inhoud.split(/\r?\n/).filter((x) => x.trim());
    const inBestand = regels.filter((x) => CODE_RE.test(x.trim()));
    const rest = regels.filter((x) => !CODE_RE.test(x.trim()));
    check('«Завантажити»: mijn-ruimte-herstelcodes.txt, рівно 10 кодів (ті самі, по одному на рядок), решта — 3 рядки пояснення без адреси й секретів',
      download.suggestedFilename() === 'mijn-ruimte-herstelcodes.txt' && inBestand.length === 10 && codes.every((c) => inBestand.includes(c))
      && rest.length === 3 && /коди відновлення/.test(rest[0]) && /^Створено: /.test(rest[1]) && /один раз/.test(rest[2]) && !inhoud.includes('@') && !/otpauth|secret/i.test(inhoud),
      `${download.suggestedFilename()} кодів=${inBestand.length} інших рядків=${rest.length}`);
    // «Копіювати»
    await s1.paneel.getByRole('button', { name: 'Копіювати' }).click();
    const klembord = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    const kl = klembord.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    check('«Копіювати»: у буфері рівно 10 кодів (по рядку), нічого зайвого; повідомлення «Коди скопійовано»',
      kl.length === 10 && kl.every((c, i) => c === codes[i]) && await sectie(page).getByText('Коди скопійовано.').isVisible().catch(() => false), `рядків=${kl.length}`);
    // «Друкувати»: window.print перехоплено; під час друку на body є herstel-afdruk, і в стилі друку видно лише блок кодів.
    await page.evaluate(() => {
      const w = window as unknown as { __druk: Array<{ klas: boolean }> };
      w.__druk = []; window.print = () => { w.__druk.push({ klas: document.body.classList.contains('herstel-afdruk') }); };
    });
    await s1.paneel.getByRole('button', { name: 'Друкувати' }).click();
    const druk = await page.evaluate(() => (window as unknown as { __druk: Array<{ klas: boolean }> }).__druk);
    await page.evaluate(() => document.body.classList.add('herstel-afdruk'));
    await page.emulateMedia({ media: 'print' });
    const zicht = await page.evaluate(() => {
      const zichtbaar = (el: Element | null) => !!el && (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const paneel = document.querySelector('[data-herstel-nieuw]');
      const andere = Array.from(document.querySelectorAll('h2, nav, aside, button')).filter((el) => !paneel?.contains(el) && zichtbaar(el)).length;
      return { codes: zichtbaar(paneel?.querySelector('.herstel-raster') || null), andere };
    });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => document.body.classList.remove('herstel-afdruk'));
    check('«Друкувати»: window.print викликано один раз із класом herstel-afdruk; у стилі друку видно коди й нічого поза блоком (заголовки, меню, кнопки)',
      druk.length === 1 && druk[0].klas && zicht.codes && zicht.andere === 0, `${JSON.stringify(druk)} ${JSON.stringify(zicht)}`);
    // «Я зберіг коди» → «Готово»
    const gereed = s1.paneel.getByRole('button', { name: 'Готово' });
    const eerstUit = await gereed.isDisabled();
    await s1.paneel.getByLabel('Я зберіг коди').check();
    await gereed.click();
    const lijst = sectie(page).locator('[data-herstel-lijst]');
    await lijst.waitFor({ timeout: 10000 }).catch(() => undefined);
    const html = await page.content();
    check('«Готово» неактивне до «Я зберіг коди»; після — лише замаскований перелік із 10 рядків, «Залишилося 10 з 10», «збережено», жодного коду в сторінці',
      eerstUit && await lijst.locator('li').count() === 10 && await teller(page) === 'Залишилося 10 з 10' && /збережено/.test(await sectie(page).innerText())
      && codes.every((c) => !html.includes(c)) && /••••-••••-••[0-9a-f]{2}/.test(await lijst.innerText()), await teller(page));

    // ================================================================ 3. нотатки до набору й до коду
    const setNotitie = sectie(page).locator('[data-herstel-set-notitie]');
    await setNotitie.getByRole('button', { name: 'Додати нотатку' }).click();
    await setNotitie.locator('textarea').fill('Конверт у шухляді столу (пробна нотатка)');
    await setNotitie.getByRole('button', { name: 'Зберегти' }).click();
    await setNotitie.getByText('Конверт у шухляді столу (пробна нотатка)').waitFor({ timeout: 10000 }).catch(() => undefined);
    const rij1 = lijst.locator('li[data-herstel-nr="1"]');
    await rij1.getByRole('button', { name: 'Додати нотатку' }).click();
    await rij1.locator('textarea').fill('Перший код — у менеджері паролів (проба)');
    await rij1.getByRole('button', { name: 'Зберегти' }).click();
    await rij1.getByText('Перший код — у менеджері паролів (проба)').waitFor({ timeout: 10000 }).catch(() => undefined);
    await open(page);
    check('нотатки: до набору й до коду №1 збережено на сервері — лишаються після перезавантаження, іншим кодам не приписано',
      await sectie(page).locator('[data-herstel-set-notitie]').getByText('Конверт у шухляді столу (пробна нотатка)').isVisible().catch(() => false)
      && await lijst.locator('li[data-herstel-nr="1"]').getByText('Перший код — у менеджері паролів (проба)').isVisible().catch(() => false)
      && await lijst.locator('li[data-herstel-nr="2"] .toegang-notitie-tekst').count() === 0);
    await foto(page, '03-lijst-notities');

    // ================================================================ 4. одноразове використання (пристрій B)
    const B = await inloggen();
    const { ctx: ctxB, page: pB } = await apparaat(browser, B, { taal: 'uk', width: 1280, height: 860 });
    volgFouten(pB, foutenB, [/\/api\/owner\/agents\/activity$/]);
    await pB.goto(`${ID}/recovery?lang=uk`, { waitUntil: 'networkidle' });
    const u1 = await gebruik(pB, codes[3].toLowerCase().replace(/-/g, ''));
    const u2 = await gebruik(pB, codes[3]);
    check('одноразовість: код №4 (малими літерами, без рисок) підтверджує доступ, «залишилося 9»; той самий код удруге відхилено',
      u1.status === 200 && u1.resterend === 9 && u2.status === 400 && /ACCESS_RECOVERY_INVALID|STEP_UP_RECOVERY_INVALID/.test(u2.error), `${u1.status}/${u1.resterend} → ${u2.status} ${u2.error}`);
    await open(page);
    const r4 = lijst.locator('li[data-herstel-nr="4"]');
    const doorgestreept = await r4.locator('.herstel-code').evaluate((el) => getComputedStyle(el).textDecorationLine).catch(() => '');
    check('у A: «Залишилося 9 з 10», рядок №4 «Використано <дата>» і перекреслено, решта «Не використано»',
      await teller(page) === 'Залишилося 9 з 10' && await r4.getAttribute('data-status') === 'gebruikt' && doorgestreept.includes('line-through')
      && /Використано \d/.test(await r4.innerText()) && await lijst.locator('li[data-status="ongebruikt"]').count() === 9, `${await teller(page)} ${doorgestreept}`);
    await foto(page, '04-gebruikt');

    // ================================================================ 5. заміна набору
    const s2 = await nieuweSet(page, 'Створити нові');
    const codes2 = s2.codes;
    check('заміна: новий набір із 10 кодів, жоден не збігається зі старими', codes2.length === 10 && codes2.every((c) => CODE_RE.test(c) && !codes.includes(c)), `кодів=${codes2.length}`);
    await s2.paneel.getByLabel('Я зберіг коди').check();
    await s2.paneel.getByRole('button', { name: 'Готово' }).click();
    await lijst.waitFor({ timeout: 10000 }).catch(() => undefined);
    const oud = await gebruik(pB, codes[0]);
    const nieuw = await gebruik(pB, codes2[0]);
    check('після заміни: старий (ще невикористаний) код №1 відхилено, новий код №1 діє', oud.status === 400 && nieuw.status === 200 && nieuw.resterend === 9, `${oud.status} ${oud.error} | ${nieuw.status}/${nieuw.resterend}`);

    // ================================================================ 6. нагадування при ≤ 2 кодах
    for (let i = 1; i <= 6; i++) await gebruik(pB, codes2[i]);
    const voor = await meldingen();
    const bij2 = await gebruik(pB, codes2[7]);
    const na2 = await meldingen();
    const bij1 = await gebruik(pB, codes2[8]);
    const na1 = await meldingen();
    check('access_recovery_low: при 3 залишених — жодного; при 2 — рівно одне; при 1 — повтору немає',
      voor === 0 && bij2.resterend === 2 && na2 === 1 && bij1.resterend === 1 && na1 === 1, `${voor} → ${bij2.resterend}:${na2} → ${bij1.resterend}:${na1}`);
    await open(page);
    check('у A: «Залишилося 1 з 10» з позначкою «Мало кодів»', await teller(page) === 'Залишилося 1 з 10' && /Мало кодів/.test(await sectie(page).innerText()), await teller(page));
    const bel = page.locator('[data-qa-id="canonical-notification-bell"]');
    await bel.click();
    const paneelM = page.locator('[data-qa-id="canonical-notification-panel"]');
    await paneelM.waitFor({ timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(600);
    const titels = await paneelM.getByText('Залишилося мало кодів відновлення', { exact: false }).count();
    check('центр сповіщень: нагадування «Залишилося мало кодів відновлення» видно рівно один раз', titels === 1, `разів=${titels}`);
    await foto(page, '05-melding');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // ================================================================ 7. «Відкликати всі» зі step-up
    await open(page);
    await sectie(page).getByRole('button', { name: 'Відкликати всі' }).click();
    await sectie(page).getByRole('button', { name: 'Відкликати', exact: true }).click();
    const vI = page.getByRole('dialog');
    const vensterKwam = await vI.first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    if (vensterKwam) {
      const veld = page.locator('#bevestig-toegang-code');
      if (!(await veld.isVisible().catch(() => false))) await page.getByRole('button', { name: 'Використати код із застосунку-автентифікатора' }).click();
      await foto(page, '06-intrekken-bevestigen');
      await vulTotp(page);
    }
    await sectie(page).getByText('Усі коди відкликано').waitFor({ timeout: 15000 }).catch(() => undefined);
    const statussen = await lijst.locator('li').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
    check('«Відкликати всі» вимагає підтвердження (вікно «Підтвердіть доступ») і після коду застосунку: 9 «використано», 1 «відкликано», «Залишилося 0 з 10», позначка «Відкликано»',
      vensterKwam && statussen.filter((x) => x === 'gebruikt').length === 9 && statussen.filter((x) => x === 'ingetrokken').length === 1
      && await teller(page) === 'Залишилося 0 з 10' && /Відкликано/.test(await sectie(page).innerText()), `вікно=${vensterKwam} ${statussen.join(',')}`);
    const naIntrek = await gebruik(pB, codes2[9]);
    check('після відкликання останній невикористаний код відхилено', naIntrek.status === 400 && /STEP_UP_RECOVERY_NOT_ENROLLED|ACCESS_RECOVERY_INVALID/.test(naIntrek.error), `${naIntrek.status} ${naIntrek.error}`);

    check('пристрій A (центр облікового запису): без помилок консолі й HTTP', fouten.length === 0, fouten.join(' | '));
    // На B свідомо відхилені коди дають 400 на /stap-op; усе інше — помилка.
    const bInakzeptabel = foutenB.filter((f) => !/\/api\/owner\/access\/stap-op \((ACCESS_RECOVERY_INVALID|STEP_UP_RECOVERY_INVALID|STEP_UP_RECOVERY_NOT_ENROLLED)\)$/.test(f));
    check('пристрій B: без інших помилок (крім свідомо відхилених кодів)', bInakzeptabel.length === 0, bInakzeptabel.join(' | '));
    await sluit(ctxA, ctxB);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e).replace(/[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}/g, '••••'));
  } finally {
    await browser.close().catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [email]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await stop();
  }
  return einde();
}
