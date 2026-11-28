// IDENTITEIT-015 (приймання, група «blokken-profiel»): справжній Chromium, вигадані особи (@example.test), кожен «пристрій» —
// окремий контекст; «повторний вхід» — новий вхід тим самим обліковим записом (нові cookie, порожнє сховище).
//  A. Форма блоку (центр облікового запису → «Віджети»): «Скасувати» без запиту й з фокусом; обов'язкові поля зовнішнього джерела
//     і пояснення помилки (браузер не надсилає, сервер відмовляє посиланню з логіном і паролем — поля лишаються); внутрішній і
//     зовнішній блок збережено; «Відкрити в просторі» відкриває hub на цьому просторі й підсвічує блок; після повторного відкриття
//     hub блоки є, зовнішнє посилання має той самий href.
//  B. Профіль: світлина з Google після входу; власна світлина → смітничок («Скасувати», потім «Так, прибрати») → оновити → новий
//     вхід (фото Google, без смітничка); «Без фото» → ініціали після оновлення і після нового входу (Google не повертає фото);
//     «Повернути сервісне фото».
//  C. «Стан моїх служб»: справжні стани з бази (пристрій на зв'язку → «Справно», пристрій не на зв'язку → «Збій» з порадою);
//     «потрібен повторний вхід» для пошти справжнім створити не можна (у випробувальному середовищі не налаштовано Google — рядок
//     «Пошта» чесно «Невідомо»), тому лише цей стан — підробленою відповіддю page.route (решта рядків — справжня відповідь).
//  D. Простори: простір архівовано «новим початком» (підготовка через API), у центрі «Відновити» → «Скасувати» → «Відновити» →
//     простір активний, у переліку hub, належить саме цьому обліковому запису; інша особа його не бачить.
//  E. Вивантаження: JSON і ZIP (розпаковано fflate у Node) — файли відкриваються, містять дані пробної особи, без секретів.
//  F. Видалення ОКРЕМОГО одноразового облікового запису: наслідки, «Скасувати», підтвердження особи (вікно → Google), завершення
//     (сеанс закрито), новий вхід → «Відновити старий простір» → простір і блок повернулися.
// Знімки 015-blokken-profiel-*.png (телефон 380×800 і комп'ютер 1280), знеособлені (verberg).
// Acceptatie van blokformulier, profielfoto, dienstenstand, werkruimteherstel, gegevensexport en accountverwijdering + herstel.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { HUB, ID, apparaat, horizontaal, openBlok, persoon, sluit, verberg, volgFouten, type Persoon } from './hulp/sessie-015';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
// Alleen voor het ontwikkelen: E2E_STAP=A,C draait alleen die delen.
const STAPPEN = (process.env.E2E_STAP || 'A,B,C,D,E,F').split(',');
// Очікувані відмови: activity (не власник), навмисна відмова сервера посиланню з логіном (A), вимога підтвердження особи (F).
const VERWACHT = [/\/api\/owner\/agents\/activity$/, /mail\.tarasevych\.com\/api\/owner\/mail\/(bootstrap|accounts\/list)$/];
// Давня вада поза кроком (записана у відомості, account.видалення.1.pidtverdyty): коли вкладка вже без входу (після видалення) або
// обліковий запис ще не схвалено (екран відновлення), шапка й меню далі опитують ці маршрути → 401/403. Рахуємо окремо.
const DAVNE_ZONDER_SESSIE = [/id\.tarasevych\.com\/api\/owner\/(tech\/status|menu\/tellers|meldingen\/(status|gelezen))$/, /id\.tarasevych\.com\/api\/flags$/, /id\.tarasevych\.com\/api\/ofrep\/v1\/evaluate\/flags\//];
const GOOGLE_FOTO = 'https://lh3.googleusercontent.com/a/e2e-proef-foto=s96-c';
// Секрети, яких не має бути у вивантаженні (як у tests/e2e/identiteit-014-blokken.e2e.ts, плюс хеші токенів і ключі).
const GEHEIM = /totpSecret|secretEnc|passwordHash|"token"\s*:|recoveryHash|token_hash|tokenHash|refresh_hash|access_hash|command_key|codewoordHash|"secret"\s*:/i;

/** Кольорова PNG 160×160, намальована в самій сторінці (canvas) — справжній файл для «Обрати файл». */
async function proefPng(page: Page, kleur: string): Promise<Buffer> {
  const url = await page.evaluate((k) => { const c = document.createElement('canvas'); c.width = 160; c.height = 160; const g = c.getContext('2d')!; g.fillStyle = k; g.fillRect(0, 0, 160, 160); g.fillStyle = '#fff'; g.beginPath(); g.arc(80, 70, 34, 0, 7); g.fill(); g.fillRect(30, 112, 100, 48); return c.toDataURL('image/png'); }, kleur);
  return Buffer.from(url.split(',')[1], 'base64');
}

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-015 blokken-profiel');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaarEmail = `e2e-i15b-eig-${T}@example.test`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaarEmail, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser: Browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const davne: string[] = [];
  const emails: string[] = [];
  const contexten: BrowserContext[] = [];
  // [мить, хост+шлях] кожного запиту сторінок до API — для звіту, якщо сервер відповів 429 (спільний IP 127.0.0.1)
  const verzoeken: Array<[number, string]> = [];
  const piekMinuut = () => { let best = 0, bij = 0; for (let i = 0, j = 0; j < verzoeken.length; j++) { while (verzoeken[j][0] - verzoeken[i][0] > 60_000) i++; if (j - i + 1 > best) { best = j - i + 1; bij = j; } } const venster = verzoeken.filter(([t]) => t <= verzoeken[bij]?.[0] && t > (verzoeken[bij]?.[0] || 0) - 60_000); const tel = new Map<string, number>(); for (const [, p] of venster) tel.set(p, (tel.get(p) || 0) + 1); return `${best}/хв; найчастіші: ${[...tel].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, n]) => `${p}×${n}`).join(', ')}`; };
  const foto = async (page: Page, naam: string) => { await verberg(page); await page.screenshot({ path: `${UIT}/015-blokken-profiel-${naam}.png`, fullPage: false }); };
  const idVanEmail = async (email: string) => String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id || '');
  const gebruiker = async (id: string) => ((await pool.query("select data from app.records where tbl='users' and id=$1", [id])).rows[0]?.data || {}) as Record<string, unknown>;
  const goedkeuren = async (p: Persoon, naam: string) => { const id = await idVanEmail(p.email); await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', name: naam })]); return id; };
  const hubApi = (p: Persoon, pad: string, extra: Record<string, unknown> = {}) => p.b.verzoek('hub.tarasevych.com', pad, p.b.ctxBody('hub', extra));
  const idApi = (p: Persoon, pad: string, extra: Record<string, unknown> = {}) => p.b.verzoek('id.tarasevych.com', pad, p.b.ctxBody('identity', extra));
  const tekstOp = async (page: Page, re: RegExp, ms = 8000) => page.getByText(re).first().waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
  /** Новий вхід тим самим обліковим записом (новий набір cookie, нова вкладка). */
  const opnieuw = async (p: Persoon, o: Record<string, unknown> = {}): Promise<Persoon> => {
    const b = (G as unknown as { browser: () => Persoon['b'] }).browser(); const tab = randomBytes(24).toString('hex');
    await b.aanmelden(p.sub, p.email, { service: 'identity', tabContext: tab, intent: 'login', ...o });
    return { ...p, b, tab };
  };
  const nieuwApparaat = async (p: Persoon, o: Parameters<typeof apparaat>[2] = {}, verwacht: RegExp[] = VERWACHT) => {
    const a = await apparaat(browser, p, { taal: 'uk', ...o }); contexten.push(a.ctx); volgFouten(a.page, fouten, verwacht);
    a.ctx.on('request', (q) => { const u = new URL(q.url()); if (u.pathname.startsWith('/api/')) verzoeken.push([Date.now(), `${u.host.split('.')[0]}${u.pathname}`]); });
    // Google-фото: справжній CDN недоступний (усе, крім *.tarasevych.com, — ~NOTFOUND), тож віддаємо кольорову PNG на тій самій адресі.
    await a.ctx.route('https://lh3.googleusercontent.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: googlePng }));
    return a;
  };
  let googlePng = Buffer.alloc(0);
  // Усі браузерні контексти йдуть з 127.0.0.1 (одне «відро» ліміту API): пристрої попередньої частини закриваємо, щоб їхнє опитування
  // (сповіщення, прапорці) не вичерпувало ліміт наступної (раніше в кінці прогону — 429 на bootstrap hub).
  const sluitAlles = async () => {
    await sluit(...contexten.splice(0));
    // Людина між справами робить перерву; тест — лише коли за останню хвилину сторінки вже зробили понад 350 запитів (ліміт 600/хв на IP).
    while (verzoeken.filter(([t]) => Date.now() - t < 60_000).length > 350) await new Promise((x) => setTimeout(x, 2000));
  };
  try {
    // PNG «Google» малюємо один раз у порожній сторінці
    { const c = await browser.newContext(); const pg = await c.newPage(); googlePng = await proefPng(pg, '#1a73e8'); await c.close(); }
    const O = await persoon(G as never, 'i15b-eig', T); emails.push(O.email);
    const oId = await goedkeuren(O, 'Власниця Проба');
    await hubApi(O, '/api/workspace/load');
    const wsO = String((await hubApi(O, '/api/workspace/load')).data.workspace?.id || '');
    check('підготовка: власниця схвалена, простір є', !!oId && !!wsO);

    // ================================================================ A. форма блоку
    if (STAPPEN.includes('A')) {
      const { ctx, page } = await nieuwApparaat(O, { width: 1280, height: 860 }, [...VERWACHT, /\/api\/blocks\/add$/]);
      let toevoegVerzoeken = 0;
      page.on('request', (q) => { if (q.url().endsWith('/api/blocks/add')) toevoegVerzoeken++; });
      await page.goto(`${ID}/widgets?lang=uk`, { waitUntil: 'networkidle' });
      await openBlok(page, '[data-widget-annuleren]');
      const form = page.locator('form.settings-form').filter({ has: page.locator('[data-widget-annuleren]') });
      const sel = form.locator('select');
      const bron = sel.nth(1), dienst = sel.nth(2);
      const titel = form.locator('label').filter({ hasText: /^Назва/ }).locator('input');
      const omschr = form.locator('textarea');
      const link = form.locator('input[type="url"]');
      const toevoegen = form.locator('button.settings-primary');
      check('A: у виборі «Робочий простір» — власний простір', (await sel.first().locator(`option[value="${wsO}"]`).count()) === 1);
      // «Скасувати»: заповнюємо й скасовуємо
      await dienst.selectOption('hub:notes');
      await titel.fill('Чернетка, яку скасують');
      await omschr.fill('Опис, що має зникнути');
      await form.locator('label').filter({ hasText: /^Розмір/ }).locator('select').selectOption('custom');
      check('A: «Власний» розмір показує поля ширини й висоти', await form.locator('[data-widget-maat] input').count() === 2);
      await form.locator('[data-widget-annuleren]').click();
      const naAnnuleren = { titel: await titel.inputValue(), omschr: await omschr.inputValue(), dienst: await dienst.inputValue(), maat: await form.locator('[data-widget-maat]').count(), focus: await page.evaluate(() => (document.activeElement as HTMLSelectElement | null)?.tagName || '') };
      check('A: «Скасувати» повертає форму до початку (назва й опис порожні, «Завдання», звичайний розмір) і ставить фокус на вибір простору',
        naAnnuleren.titel === '' && naAnnuleren.omschr === '' && naAnnuleren.dienst === 'hub:tasks' && naAnnuleren.maat === 0 && naAnnuleren.focus === 'SELECT', JSON.stringify(naAnnuleren));
      check('A: «Скасувати» нічого не надсилає на сервер', toevoegVerzoeken === 0, String(toevoegVerzoeken));
      // Зовнішнє джерело: обов'язкові назва й посилання
      await bron.selectOption('external');
      check('A: для зовнішнього джерела «Сервіс або сторінка» сховано, назва й посилання обов\'язкові',
        (await sel.count()) === 3 && await titel.evaluate((x: HTMLInputElement) => x.required) && await link.evaluate((x: HTMLInputElement) => x.required));
      await toevoegen.click();
      await page.waitForTimeout(400);
      const leegFout = await titel.evaluate((x: HTMLInputElement) => ({ geldig: x.validity.valid, melding: x.validationMessage, focus: document.activeElement === x }));
      check('A: порожня зовнішня форма не надсилається; браузер пояснює помилку біля поля «Назва» і ставить туди фокус', toevoegVerzoeken === 0 && !leegFout.geldig && leegFout.melding.length > 0 && leegFout.focus, JSON.stringify(leegFout));
      await titel.fill('Проба зовнішня');
      await link.fill('http://voorbeeld.example.test/');
      await toevoegen.click();
      await page.waitForTimeout(300);
      const httpFout = await link.evaluate((x: HTMLInputElement) => ({ patroon: x.validity.patternMismatch, melding: x.validationMessage, title: x.title }));
      check('A: адреса http:// не проходить; пояснення каже, що потрібна https:// без логіна й пароля', toevoegVerzoeken === 0 && httpFout.patroon && /https:\/\//.test(httpFout.title) && httpFout.melding.length > 0, JSON.stringify(httpFout));
      await foto(page, 'blok-fout-computer');
      // Сервер: посилання з логіном і паролем (браузерний шаблон пропускає) — відмова з поясненням, поля лишаються
      await link.fill('https://proef:geheim@voorbeeld.example.test/');
      const weiger = page.waitForResponse((r) => r.url().endsWith('/api/blocks/add'));
      await toevoegen.click();
      const wr = await weiger; const wb = await wr.json().catch(() => ({}));
      const weigerZichtbaar = await tekstOp(page, /Посилання має починатися з https:\/\/ і не містити логіна чи пароля/);
      check('A: сервер відмовляє посиланню з логіном і паролем (400 BLOK_URL_ONGELDIG), людина бачить зрозуміле пояснення, назва й посилання не очищено',
        wr.status() === 400 && wb.error === 'BLOK_URL_ONGELDIG' && weigerZichtbaar && (await titel.inputValue()) === 'Проба зовнішня' && /voorbeeld/.test(await link.inputValue()), `${wr.status()} ${JSON.stringify(wb)} zichtbaar=${weigerZichtbaar}`);
      await foto(page, 'blok-serverweigering-computer');
      // Збереження: зовнішній блок
      const extUrl = 'https://voorbeeld.example.test/pad?x=1';
      await link.fill(extUrl);
      await omschr.fill('Зовнішній сайт проби');
      const ok1 = page.waitForResponse((r) => r.url().endsWith('/api/blocks/add') && r.status() === 200);
      await toevoegen.click();
      const r1 = await (await ok1).json();
      const extId = String(r1.block?.id || '');
      const open1 = form.locator('[data-widget-openen]');
      await open1.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
      check('A: зовнішній блок збережено: «Блок додано до простору» і посилання «Відкрити в просторі» на цей простір і цей блок',
        !!extId && (await open1.getAttribute('href')) === `${HUB}/?werkruimte=${encodeURIComponent(wsO)}&blok=${encodeURIComponent(extId)}`, String(await open1.getAttribute('href')));
      check('A: після збереження назва, опис і посилання очищені (джерело лишилося «Зовнішнє»)', (await titel.inputValue()) === '' && (await omschr.inputValue()) === '' && (await link.inputValue()) === '' && (await bron.inputValue()) === 'external');
      await foto(page, 'blok-toegevoegd-computer');
      // Збереження: внутрішній блок із власною https-адресою і власним розміром 500×300
      const maatKeuze = form.locator('label').filter({ hasText: /^Розмір/ }).locator('select');
      await bron.selectOption('internal');
      await sel.nth(2).selectOption('hub:notes');
      check('A: для внутрішнього джерела посилання необов\'язкове, під полем — пояснення про стандартну адресу', !(await link.evaluate((x: HTMLInputElement) => x.required)) && /Порожнє поле — блок відкриває стандартну сторінку/.test(await form.locator('[data-widget-url-intern]').innerText().catch(() => '')));
      await titel.fill('Нотатки з власною адресою');
      const eigenUrl = 'https://voorbeeld.example.test/notities';
      await link.fill(eigenUrl);
      await maatKeuze.selectOption('custom');
      const maatVelden = form.locator('[data-widget-maat] input');
      await maatVelden.nth(0).fill('500'); await maatVelden.nth(1).fill('300');
      const ok3 = page.waitForResponse((r) => r.url().endsWith('/api/blocks/add') && r.status() === 200);
      await toevoegen.click();
      const eigenId = String((await (await ok3).json()).block?.id || '');
      const rV = ((await pool.query("select data from app.records where tbl='workspace_blocks' and id=$1", [eigenId])).rows[0]?.data || {}) as Record<string, unknown>;
      check('A: внутрішній блок із власною https-адресою й розміром «Власний» 500×300 — сервер зберіг адресу замість стандартної і розмір',
        rV.url === eigenUrl && rV.size === 'custom' && Number(rV.customWidth) === 500 && Number(rV.customHeight) === 300, JSON.stringify({ u: rV.url, s: rV.size, w: rV.customWidth, h: rV.customHeight }));
      await maatKeuze.selectOption('medium');
      // Збереження: внутрішній блок (Нотатки, власна назва, без посилання)
      await sel.nth(2).selectOption('hub:notes');
      await titel.fill('Мої нотатки проби');
      const ok2 = page.waitForResponse((r) => r.url().endsWith('/api/blocks/add') && r.status() === 200);
      await toevoegen.click();
      const r2 = await (await ok2).json();
      const intId = String(r2.block?.id || '');
      const rij = async (id: string) => ((await pool.query("select data from app.records where tbl='workspace_blocks' and id=$1", [id])).rows[0]?.data || {}) as Record<string, unknown>;
      const rE = await rij(extId), rI = await rij(intId);
      check('A: сервер зберіг обидва блоки в просторі власниці: зовнішній з тим самим посиланням, внутрішній — «Нотатки» зі стандартною адресою',
        rE.workspaceId === wsO && rE.url === extUrl && rE.title === 'Проба зовнішня' && rI.workspaceId === wsO && rI.title === 'Мої нотатки проби' && /hub\.tarasevych\.com/.test(String(rI.url || '')), JSON.stringify({ e: [rE.url, rE.title], i: [rI.url, rI.title, rI.kind] }));
      // телефон 380: форма без горизонтальної прокрутки
      await page.setViewportSize({ width: 380, height: 800 });
      await form.scrollIntoViewIfNeeded();
      check('A: телефон 380 — форма блоку без горизонтальної прокрутки', (await horizontaal(page)) <= 0, String(await horizontaal(page)));
      await foto(page, 'blok-formulier-telefoon');
      await page.setViewportSize({ width: 1280, height: 860 });
      // «Відкрити в просторі» → hub (у тій самій вкладці, як людина клацнула б посилання)
      const href = String(await form.locator('[data-widget-openen]').getAttribute('href'));
      await form.locator('[data-widget-openen]').click();
      await page.waitForURL(/hub\.tarasevych\.com/, { timeout: 15000 }).catch(() => undefined);
      const blokEl = page.locator(`[data-blok-id="${intId}"]`);
      await blokEl.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
      const gevonden = await blokEl.evaluate((x) => x.classList.contains('is-gevonden')).catch(() => false);
      check('A: «Відкрити в просторі» веде в hub до цього блоку (вкладка «Нотатки», блок видно й коротко підсвічено), параметри прибрано з адреси',
        /hub\.tarasevych\.com\/(notes|notities)/.test(page.url()) && await blokEl.isVisible().catch(() => false) && gevonden && !/werkruimte=|blok=/.test(page.url()), `${href} → ${page.url()} gevonden=${gevonden}`);
      await foto(page, 'hub-blok-gevonden-computer');
      // Повторне відкриття hub (новий пристрій, новий вхід): обидва блоки є, зовнішнє посилання — той самий href
      await sluit(ctx);
      const O2 = await opnieuw(O);
      const { page: hub } = await nieuwApparaat(O2, { width: 1280, height: 860 });
      // hub відкривається на «Огляді» (робочий стіл); окремі картки блоків — на вкладці «Нотатки» (src/open-in-ruimte.ts blokOpTab)
      await hub.goto(`${HUB}/notes?lang=uk`, { waitUntil: 'networkidle' });
      const ext = hub.locator(`[data-blok-id="${extId}"]`), int = hub.locator(`[data-blok-id="${intId}"]`);
      await ext.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
      const extA = ext.locator('a[href]').first();
      check('A: після повторного входу й відкриття hub обидва блоки на місці з назвами', await ext.isVisible().catch(() => false) && await int.isVisible().catch(() => false)
        && /Проба зовнішня/.test(await ext.innerText().catch(() => '')) && /Мої нотатки проби/.test(await int.innerText().catch(() => '')));
      check('A: зовнішній блок у hub відкриває саме введену адресу (href, нова вкладка, rel=noreferrer)',
        (await extA.getAttribute('href').catch(() => '')) === extUrl && (await extA.getAttribute('target').catch(() => '')) === '_blank' && /noreferrer/.test(String(await extA.getAttribute('rel').catch(() => ''))), String(await extA.getAttribute('href').catch(() => '')));
      const eigen = hub.locator(`[data-blok-id="${eigenId}"]`);
      const eigenMaat = await eigen.evaluate((x) => ({ w: Math.round(x.getBoundingClientRect().width), h: Math.round(x.getBoundingClientRect().height), klas: x.className })).catch(() => ({ w: 0, h: 0, klas: '' }));
      check('A: у hub внутрішній блок із власною адресою відкриває саме її, картка має власний розмір (size-custom, ≈500×300)',
        (await eigen.locator('a[href]').first().getAttribute('href').catch(() => '')) === eigenUrl && /size-custom/.test(eigenMaat.klas) && Math.abs(eigenMaat.w - 500) <= 30 && Math.abs(eigenMaat.h - 300) <= 30, JSON.stringify(eigenMaat));
      await hub.setViewportSize({ width: 380, height: 800 });
      await int.scrollIntoViewIfNeeded().catch(() => undefined);
      check('A: hub на телефоні 380 — без горизонтальної прокрутки', (await horizontaal(hub)) <= 0, String(await horizontaal(hub)));
      await foto(hub, 'hub-blokken-telefoon');
    }

    // ================================================================ B. профіль і світлина
    if (STAPPEN.includes('B')) {
      await sluitAlles();
      const P = await persoon(G as never, 'i15b-foto', T, { picture: GOOGLE_FOTO }); emails.push(P.email);
      const pId = await goedkeuren(P, 'Фото Проба');
      const { ctx, page } = await nieuwApparaat(P, { width: 1280, height: 860 });
      await page.goto(`${ID}/account?lang=uk`, { waitUntil: 'networkidle' });
      const kaart = await openBlok(page, '.settings-profile-card.ia-profiel');
      const img = kaart.locator('.ia-avatar img');
      await img.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
      const geladen = async () => img.evaluate((x: HTMLImageElement) => x.complete && x.naturalWidth > 0).catch(() => false);
      check('B: після входу на картці профілю — фото з Google (та сама адреса, зображення завантажилося), смітничка немає',
        (await img.getAttribute('src').catch(() => '')) === GOOGLE_FOTO && await geladen() && (await kaart.locator('.ia-avatar-prullenbak').count()) === 0, String(await img.getAttribute('src').catch(() => '')));
      await foto(page, 'profiel-google-computer');
      // власна світлина з пристрою
      await kaart.locator('button.ia-avatar').click();
      const dlg = page.locator('.ia-dialoog, [role="dialog"]').filter({ hasText: /Фото профілю/ }).first();
      await dlg.waitFor({ state: 'visible', timeout: 5000 });
      await dlg.getByRole('tab', { name: /Пристрій/ }).click();
      await dlg.locator('input[type="file"]').setInputFiles({ name: 'proef.png', mimeType: 'image/png', buffer: await proefPng(page, '#c2410c') });
      await dlg.locator('.ia-voorbeeld img').waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
      await dlg.getByRole('button', { name: 'Застосувати' }).click();
      await dlg.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => undefined);
      await page.waitForTimeout(500);
      const pna = await gebruiker(pId);
      check('B: власну світлину збережено (на картці — завантажене фото, є смітничок; на сервері customPicture)',
        /^data:image\/jpeg;base64,/.test(String(await img.getAttribute('src').catch(() => ''))) && await kaart.locator('.ia-avatar-prullenbak').isVisible() && pna.customPicture === true);
      // смітничок → «Скасувати» → нічого не змінилося
      await kaart.locator('.ia-avatar-prullenbak').click();
      const vraag = page.locator('[data-bevestig="foto-herstellen"]');
      await vraag.waitFor({ state: 'visible', timeout: 5000 });
      check('B: діалог «Прибрати власне фото?» пояснює наслідки (файл не зберігається, повернеться фото сервісу входу)', /не зберігається/.test(await vraag.innerText()) && /сервісу входу/.test(await vraag.innerText()));
      await foto(page, 'profiel-prullenbak-dialoog-computer');
      await vraag.locator('.bevestig-dialoog-annuleer').click();
      await page.waitForTimeout(400);
      check('B: «Скасувати» — власне фото лишилося (на сторінці й на сервері)', /^data:image/.test(String(await img.getAttribute('src'))) && (await gebruiker(pId)).customPicture === true);
      await kaart.locator('.ia-avatar-prullenbak').click();
      await vraag.locator('.bevestig-dialoog-ja').click();
      await page.waitForTimeout(800);
      check('B: після «Так, прибрати» знову фото Google, смітничок зник', (await img.getAttribute('src').catch(() => '')) === GOOGLE_FOTO && (await kaart.locator('.ia-avatar-prullenbak').count()) === 0);
      await page.reload({ waitUntil: 'networkidle' });
      await openBlok(page, '.settings-profile-card.ia-profiel');
      await img.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
      check('B: після оновлення сторінки — фото Google', (await img.getAttribute('src').catch(() => '')) === GOOGLE_FOTO && await geladen());
      await sluit(ctx);
      {
        const P2 = await opnieuw(P, { picture: GOOGLE_FOTO });
        const { ctx: c2, page: p2 } = await nieuwApparaat(P2, { width: 380, height: 800, touch: true });
        await p2.goto(`${ID}/account?lang=uk`, { waitUntil: 'networkidle' });
        const k2 = await openBlok(p2, '.settings-profile-card.ia-profiel');
        await k2.locator('.ia-avatar img').waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
        const u = await gebruiker(pId);
        check('B: новий вхід (телефон) — фото Google, власного немає (сервер: customPicture=false)', (await k2.locator('.ia-avatar img').getAttribute('src').catch(() => '')) === GOOGLE_FOTO && u.customPicture === false && (await k2.locator('.ia-avatar-prullenbak').count()) === 0);
        await foto(p2, 'profiel-na-heraanmelden-telefoon');
        // «Без фото»
        await k2.locator('button.ia-avatar').click();
        const d2 = p2.locator('.ia-dialoog, [role="dialog"]').filter({ hasText: /Фото профілю/ }).first();
        await d2.waitFor({ state: 'visible', timeout: 5000 });
        await d2.locator('[data-foto-geen]').click();
        await d2.getByRole('button', { name: 'Показувати лише ініціали' }).click();
        const vg = p2.locator('[data-bevestig="foto-geen"]');
        await vg.waitFor({ state: 'visible', timeout: 5000 });
        await foto(p2, 'profiel-geen-foto-dialoog-telefoon');
        await vg.locator('.bevestig-dialoog-ja').click();
        await p2.waitForTimeout(800);
        const ini = k2.locator('.ia-avatar .ia-initialen');
        const u2 = await gebruiker(pId);
        // Ім'я при кожному вході бере Google (у підробленому Google ім'я = адреса), тож ініціали — від показаного на картці імені.
        // verberg() на знімках маскує адреси в DOM, тож очікувану літеру беремо з імені облікового запису (= адреса в підробленому Google)
        const naamKaart = String((await gebruiker(pId)).name || '');
        const iniTekst = (await ini.innerText().catch(() => '')).trim();
        check('B: «Без фото» — на картці ініціали (від показаного імені) замість фото; сервер: geenFoto, picture порожнє', await ini.isVisible().catch(() => false) && /^\S{1,2}$/.test(iniTekst) && iniTekst[0] === naamKaart[0]?.toUpperCase() && (await k2.locator('.ia-avatar img').count()) === 0 && u2.geenFoto === true && !u2.picture, JSON.stringify({ g: u2.geenFoto, p: String(u2.picture || '').slice(0, 30), ini: iniTekst }));
        await p2.reload({ waitUntil: 'networkidle' });
        await openBlok(p2, '.settings-profile-card.ia-profiel');
        check('B: після оновлення — ініціали лишилися', await k2.locator('.ia-avatar .ia-initialen').isVisible().catch(() => false) && (await k2.locator('.ia-avatar img').count()) === 0);
        await sluit(c2);
      }
      {
        // Новий вхід: Google знову передає фото в токені — «Без фото» лишається
        const P3 = await opnieuw(P, { picture: GOOGLE_FOTO });
        const { page: p3 } = await nieuwApparaat(P3, { width: 1280, height: 860 });
        await p3.goto(`${ID}/account?lang=uk`, { waitUntil: 'networkidle' });
        const k3 = await openBlok(p3, '.settings-profile-card.ia-profiel');
        const u3 = await gebruiker(pId);
        check('B: новий вхід через Google (з фото в токені) — «Без фото» лишається: ініціали, сервер picture порожнє', await k3.locator('.ia-avatar .ia-initialen').isVisible().catch(() => false) && (await k3.locator('.ia-avatar img').count()) === 0 && u3.geenFoto === true && !u3.picture);
        const avatarHub = await p3.locator('header img[src*="googleusercontent"], aside img[src*="googleusercontent"]').count();
        check('B: ніде на сторінці (шапка, бічна смуга) фото Google не з\'являється', avatarHub === 0, String(avatarHub));
        await foto(p3, 'profiel-geen-foto-heraanmelden-computer');
        // «Повернути сервісне фото»
        await k3.locator('button.ia-avatar').click();
        const d3 = p3.locator('.ia-dialoog, [role="dialog"]').filter({ hasText: /Фото профілю/ }).first();
        await d3.getByRole('tab', { name: /Сервіс/ }).click();
        await d3.getByRole('button', { name: 'Повернути сервісне фото' }).click();
        await p3.locator('[data-bevestig="foto-herstellen"] .bevestig-dialoog-ja').click();
        await p3.waitForTimeout(800);
        const u4 = await gebruiker(pId);
        check('B: «Повернути сервісне фото» — знову фото Google (сторінка й сервер), «Без фото» знято', (await k3.locator('.ia-avatar img').getAttribute('src').catch(() => '')) === GOOGLE_FOTO && u4.geenFoto === false && u4.picture === GOOGLE_FOTO, JSON.stringify({ g: u4.geenFoto, p: u4.picture }));
      }
    }

    // ================================================================ C. стан моїх служб
    if (STAPPEN.includes('C')) {
      await sluitAlles();
      const S = await persoon(G as never, 'i15b-dienst', T); emails.push(S.email);
      const sId = await goedkeuren(S, 'Служби Проба');
      const agent = String((await pool.query("insert into app.agents(user_id, name, platform, token_hash, status, last_seen_at) values ($1, 'Ноутбук проби', 'linux', $2, 'connected', now()) returning id", [sId, `e2e-${randomBytes(16).toString('hex')}`])).rows[0].id);
      const { page } = await nieuwApparaat(S, { width: 1280, height: 860 });
      await page.goto(`${ID}/account?lang=uk`, { waitUntil: 'networkidle' });
      const sectie = await openBlok(page, '[data-mijn-diensten]');
      const cel = (d: string) => sectie.locator(`tr[data-mdt-dienst="${d}"] td`).last();
      const controle = async () => { const w = page.waitForResponse((r) => r.url().endsWith('/api/owner/diagnostiek/mijn-diensten') && r.request().postData()?.includes('"uitvoeren":true') === true); await sectie.locator('[data-mijn-diensten-knop]').click(); const r = await w; await page.waitForTimeout(400); return r.json().catch(() => ({})); };
      const echt = await controle();
      check('C: «Перевірити зараз» — пристрій на зв\'язку: «Пристрої» — «Справно» (чинне), «Налаштування» — «Справно»',
        await cel('apparaten').locator('.mdt-stand.is-ok').isVisible() && /Справно/.test(await cel('apparaten').innerText()) && await cel('instellingen').locator('.mdt-stand.is-ok').isVisible(), await cel('apparaten').innerText());
      check('C: рядок «Пошта» чесно «Невідомо» з поясненням, що Google не налаштовано на сервері (не вина облікового запису)',
        /Невідомо/.test(await cel('mail').innerText()) && /не налаштоване підключення Google|власника сайту/.test(await cel('mail').innerText()), await cel('mail').innerText());
      await foto(page, 'diensten-ok-computer');
      await pool.query("update app.agents set status='disconnected' where id=$1", [agent]);
      await controle();
      check('C: пристрій не на зв\'язку (недоступна служба): «Збій» з поясненням і порадою, що робити',
        await cel('apparaten').locator('.mdt-stand.is-fout').isVisible() && /Жоден ваш пристрій зараз не на зв’язку/.test(await cel('apparaten').innerText()) && /агент запущений/.test(await cel('apparaten').innerText()), await cel('apparaten').innerText());
      // «Потрібен повторний вхід» — лише цей рядок підроблено (див. заголовок файлу)
      const rijen = ((echt as { rijen?: Array<Record<string, unknown>> }).rijen || []).map((r) => r.dienst === 'mail' ? { ...r, account: { dienst: 'mail', stand: 'fout', code: 'MAIL_OPNIEUW_AANMELDEN', op: Date.now() }, conclusie: 'account' } : r);
      await page.route('**/api/owner/diagnostiek/mijn-diensten', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...(echt as object), rijen }) }));
      await page.reload({ waitUntil: 'networkidle' });
      const s2 = await openBlok(page, '[data-mijn-diensten]');
      const mail = s2.locator('tr[data-mdt-dienst="mail"] td').last();
      await mail.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
      check('C: «потрібен повторний вхід» (підроблена відповідь лише для пошти): «Збій» і порада «увійдіть ще раз»', /Збій/.test(await mail.innerText()) && /чекає повторного входу/.test(await mail.innerText()) && /увійдіть ще раз/.test(await mail.innerText()), await mail.innerText());
      await page.setViewportSize({ width: 380, height: 800 });
      await s2.scrollIntoViewIfNeeded();
      check('C: телефон 380 — таблиця служб без горизонтальної прокрутки', (await horizontaal(page)) <= 0, String(await horizontaal(page)));
      await foto(page, 'diensten-drie-standen-telefoon');
      await page.setViewportSize({ width: 1280, height: 860 });
      await foto(page, 'diensten-drie-standen-computer');
      await page.unroute('**/api/owner/diagnostiek/mijn-diensten');
      await pool.query('delete from app.agents where id=$1', [agent]);
    }

    // ================================================================ D. простори: архів → відновити
    if (STAPPEN.includes('D')) {
      await sluitAlles();
      const W = await persoon(G as never, 'i15b-ruimte', T); emails.push(W.email);
      const wId = await goedkeuren(W, 'Простір Проба');
      const wsW = String((await hubApi(W, '/api/workspace/load')).data.workspace?.id || '');
      await pool.query("update app.records set data = data || $2::jsonb where tbl='workspaces' and id=$1", [wsW, JSON.stringify({ name: 'Архівний простір проби' })]);
      // Підготовка (не перевірка): «новий початок» — видалення й відновлення з порожнім простором; старий іде в архів.
      const del = await idApi(W, '/api/owner/identity/account/delete', { confirmEmail: W.email });
      const W1 = await opnieuw(W);
      const rec = await idApi(W1, '/api/owner/identity/account/recover', { mode: 'fresh' });
      const wsRij = async (id: string) => ((await pool.query("select data from app.records where tbl='workspaces' and id=$1", [id])).rows[0]?.data || {}) as Record<string, unknown>;
      const voor = await wsRij(wsW);
      // Сервер лишає причину архіву «account_deleted» (архівовано під час видалення; recoverDeletedAccount 'fresh' її не змінює).
      check('D: підготовка — старий простір в архіві (видалення + новий початок), обліковий запис знову активний', del.status === 200 && rec.status === 200 && Number(voor.archivedAt) > 0 && voor.archivedReason === 'account_deleted', `${del.status} ${rec.status} ${voor.archivedReason}`);
      const W2 = await opnieuw(W);
      const { ctx, page } = await nieuwApparaat(W2, { width: 1280, height: 860 });
      await page.goto(`${ID}/account?lang=uk`, { waitUntil: 'networkidle' });
      const art = page.locator('article').filter({ hasText: 'Архівний простір проби' }).first();
      await openBlok(page, 'article:has-text("Архівний простір проби")');
      check('D: у «Ваших робочих просторах» архівний простір із причиною «архівовано під час видалення облікового запису» й кнопкою «Відновити»; новий порожній — «Активний»',
        /архівовано під час видалення облікового запису/.test(await art.innerText()) && await art.getByRole('button', { name: 'Відновити' }).isVisible(), await art.innerText());
      await foto(page, 'ruimte-archief-computer');
      await art.getByRole('button', { name: 'Відновити' }).click();
      const dlg = page.locator('[data-bevestig="ruimte-herstellen"]');
      await dlg.waitFor({ state: 'visible', timeout: 5000 });
      check('D: діалог «Відновити простір «…»?» з поясненням', /Відновити простір «Архівний простір проби»/.test(await dlg.innerText()));
      await foto(page, 'ruimte-herstellen-dialoog-computer');
      await dlg.locator('.bevestig-dialoog-annuleer').click();
      await page.waitForTimeout(500);
      check('D: «Скасувати» — простір лишився в архіві', Number((await wsRij(wsW)).archivedAt) > 0);
      await art.getByRole('button', { name: 'Відновити' }).click();
      const herst = page.waitForResponse((r) => /\/workspaces\/.+\/restore$/.test(r.url()));
      await dlg.locator('.bevestig-dialoog-ja').click();
      const hr = await herst; await page.waitForTimeout(1000);
      const na = await wsRij(wsW);
      const actief = page.locator('article').filter({ hasText: 'Архівний простір проби' }).first();
      check('D: після підтвердження простір активний (позначка «Активний», кнопки «Відновити» немає)', hr.status() === 200 && /Активний/.test(await actief.innerText()) && (await actief.getByRole('button', { name: 'Відновити' }).count()) === 0, await actief.innerText());
      check('D: на сервері простір не архівний і належить саме цьому обліковому запису', !Number(na.archivedAt) && na.ownerUserId === wId, JSON.stringify({ a: na.archivedAt, o: na.ownerUserId === wId }));
      await page.reload({ waitUntil: 'networkidle' });
      await openBlok(page, 'article:has-text("Архівний простір проби")');
      check('D: після оновлення сторінки — так само «Активний»', /Активний/.test(await page.locator('article').filter({ hasText: 'Архівний простір проби' }).first().innerText()));
      await page.setViewportSize({ width: 380, height: 800 });
      await foto(page, 'ruimte-hersteld-telefoon');
      // hub: вибір простору в бічній панелі
      await page.setViewportSize({ width: 1280, height: 860 });
      await page.goto(`${HUB}/?lang=uk`, { waitUntil: 'networkidle' });
      await page.locator('aside.canonical-sidebar').hover().catch(() => undefined);
      const keuze = page.locator('.workspace-sidebar-actions select');
      await keuze.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      check('D: hub — відновлений простір є у виборі просторів бічної панелі', (await keuze.locator(`option[value="${wsW}"]`).count()) === 1, String(await keuze.locator('option').count()));
      await foto(page, 'ruimte-hub-keuze-computer');
      await sluit(ctx);
      const lijst = await hubApi(W2, '/api/bootstrap');
      const ids = ((lijst.data.workspaces || []) as Array<{ id: string; workspaceRole?: string; ownerUserId?: string }>);
      check('D: hub (сервер) — відновлений простір у переліку власника з роллю «owner» і ownerUserId цього облікового запису', ids.some((x) => x.id === wsW && x.workspaceRole === 'owner' && x.ownerUserId === wId), JSON.stringify(ids.map((x) => [x.id === wsW, x.workspaceRole])));
      const vreemd = await hubApi(O, '/api/share/members', { workspaceId: wsW });
      check('D: інша особа (власниця сайту) цього простору не бачить (403/404)', vreemd.status === 403 || vreemd.status === 404, String(vreemd.status));
    }

    // ================================================================ E. вивантаження JSON і ZIP
    if (STAPPEN.includes('E')) {
      await sluitAlles();
      const U = await persoon(G as never, 'i15b-uitvoer', T); emails.push(U.email);
      const uId = await goedkeuren(U, 'Вивантаження Проба');
      const wsU = String((await hubApi(U, '/api/workspace/load')).data.workspace?.id || '');
      await hubApi(U, '/api/blocks/add', { workspaceId: wsU, sourceType: 'external', target: '', title: 'Блок для вивантаження', description: 'опис', url: 'https://voorbeeld.example.test/uitvoer', size: 'medium' });
      const { page } = await nieuwApparaat(U, { width: 1280, height: 860 });
      await page.goto(`${ID}/account?lang=uk`, { waitUntil: 'networkidle' });
      const uv = await openBlok(page, '#gegevensuitvoer');
      const kandidatenVoor = verzoeken.filter(([, p]) => p.endsWith('/overdracht/kandidaten')).length;
      const download = async () => { const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }).catch(() => null), uv.locator('[data-gegevensuitvoer-knop="vol"]').click()]); const pad = dl ? await dl.path().catch(() => null) : null; return { dl, buf: pad ? readFileSync(pad) : Buffer.alloc(0) }; };
      const j = await download();
      let json: Record<string, unknown> | null = null; try { json = JSON.parse(j.buf.toString('utf8')); } catch { json = null; }
      const jt = j.buf.toString('utf8');
      check('E: JSON — файл mijn-ruimte-export-<дата>.json відкривається як JSON формату mijn-ruimte-export-v1', !!j.dl && /^mijn-ruimte-export-\d{4}-\d{2}-\d{2}\.json$/.test(j.dl.suggestedFilename()) && json?.formaat === 'mijn-ruimte-export-v1', j.dl?.suggestedFilename() || 'немає');
      check('E: JSON містить дані пробної особи (адреса, id, назва блоку)', jt.includes(U.email) && jt.includes(uId) && jt.includes('Блок для вивантаження'));
      check('E: JSON без секретів (хеші, ключі, токени)', !!jt && !GEHEIM.test(jt), (GEHEIM.exec(jt) || [''])[0]);
      check('E: стан «Готово. Файл … збережено» і кнопка «Зберегти файл ще раз»', await uv.locator('[data-gegevensuitvoer-stand="ok"]').isVisible() && await uv.locator('[data-gegevensuitvoer-opnieuw]').isVisible());
      await foto(page, 'uitvoer-json-klaar-computer');
      await uv.locator('input[value="zip"]').check();
      const z = await download();
      let bestanden: Record<string, Uint8Array> = {}; try { bestanden = unzipSync(new Uint8Array(z.buf)); } catch { bestanden = {}; }
      const namen = Object.keys(bestanden);
      const csv = namen.filter((n) => n.endsWith('.csv')).map((n) => strFromU8(bestanden[n])).join('\n');
      const alles = namen.map((n) => strFromU8(bestanden[n])).join('\n');
      check('E: ZIP — файл .zip розпаковується в Node; є LEESMIJ і CSV-таблиці', !!z.dl && /\.zip$/.test(z.dl.suggestedFilename()) && namen.some((n) => /leesmij\.txt$/i.test(n)) && namen.filter((n) => n.endsWith('.csv')).length >= 2, `${z.dl?.suggestedFilename()} ${namen.slice(0, 8).join(',')}`);
      check('E: CSV містять дані пробної особи (адреса й назва блоку)', csv.includes(U.email) && csv.includes('Блок для вивантаження'));
      check('E: ZIP без секретів', !!alles && !GEHEIM.test(alles), (GEHEIM.exec(alles) || [''])[0]);
      const melding = Number((await pool.query("select count(*)::int n from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1", [uId])).rows[0]?.n || 0);
      check('E: про вивантаження прийшли сповіщення (два вивантаження)', melding >= 2, String(melding));
      await page.setViewportSize({ width: 380, height: 800 });
      await uv.scrollIntoViewIfNeeded();
      check('E: телефон 380 — «Ваші дані» без горизонтальної прокрутки', (await horizontaal(page)) <= 0);
      await foto(page, 'uitvoer-zip-klaar-telefoon');
      const kandidatenNa = verzoeken.filter(([, p]) => p.endsWith('/overdracht/kandidaten')).length;
      check('E: сторінка «Обліковий запис» не перезапитує кандидатів «Передати простір» після кожної дії (два вивантаження, зміна ширини — жодного нового запиту)', kandidatenNa === kandidatenVoor, `${kandidatenVoor} → ${kandidatenNa}`);
    }

    // ================================================================ F. видалення окремого облікового запису й відновлення
    if (STAPPEN.includes('F')) {
      await sluitAlles();
      // Вхід годину тому — сервер попросить підтвердити особу (як людина, що давно відкрила вкладку).
      const D = await persoon(G as never, 'i15b-wis', T, { authTime: Math.floor(Date.now() / 1000) - 3600 }); emails.push(D.email);
      const dId = await goedkeuren(D, 'Видалення Проба');
      const Dtweede = await opnieuw(D); // другий пристрій (телефон) тієї самої особи
      const wsD = String((await hubApi(D, '/api/workspace/load')).data.workspace?.id || '');
      await hubApi(D, '/api/blocks/add', { workspaceId: wsD, sourceType: 'external', target: '', title: 'Блок, що має повернутися', description: '', url: 'https://voorbeeld.example.test/terug', size: 'medium' });
      const { ctx, page } = await nieuwApparaat(D, { width: 1280, height: 860 }, [...VERWACHT, /\/api\/owner\/identity\/account\/delete$/, ...DAVNE_ZONDER_SESSIE]);
      page.on('response', (q) => { if (q.status() >= 400 && DAVNE_ZONDER_SESSIE.some((x) => x.test(q.url()))) davne.push(`${q.status()} ${new URL(q.url()).pathname}`); });
      let googleBezocht = 0;
      await ctx.route('https://accounts.google.com/**', async (route) => {
        const u = new URL(route.request().url()); googleBezocht++;
        const code = (G as unknown as { codeVoor: (s: string, e: string, n: string) => string }).codeVoor(D.sub, D.email, u.searchParams.get('nonce') || '');
        const terug = new URL(u.searchParams.get('redirect_uri') || `${ID}/`);
        terug.searchParams.set('state', u.searchParams.get('state') || ''); terug.searchParams.set('code', code);
        await route.fulfill({ status: 302, headers: { location: terug.href } });
      });
      await page.goto(`${ID}/account?lang=uk`, { waitUntil: 'networkidle' });
      const zone = await openBlok(page, 'section.settings-danger');
      check('F: пояснення — 30 днів на відновлення, потім остаточне стирання; порада вивантажити дані', /протягом 30 днів/.test(await zone.innerText()) && /стерто остаточно/.test(await zone.innerText()) && await zone.locator('[data-wissen-uitvoer]').isVisible());
      const knop = zone.locator('.settings-danger-button');
      check('F: «Підтвердити видалення» недоступна, доки не введено свою адресу', await knop.isDisabled());
      await zone.locator(`input[placeholder="${D.email}"]`).fill(D.email.toUpperCase());
      check('F: після введення адреси (регістр не важить) кнопка доступна', await knop.isEnabled());
      await knop.click();
      const dlg = page.locator('[data-bevestig="account-verwijderen"]');
      await dlg.waitFor({ state: 'visible', timeout: 5000 });
      const dt = await dlg.innerText();
      check('F: діалог перелічує наслідки: вимкнення одразу, 30 днів, завершення входів, архів просторів, остаточне стирання, порада вивантажити',
        /протягом 30 днів/.test(dt) && /Усі входи/.test(dt) && /архівовано/.test(dt) && /стерт/.test(dt) && /вивантажте/.test(dt), dt.slice(0, 500));
      await foto(page, 'wissen-dialoog-computer');
      await dlg.locator('.bevestig-dialoog-annuleer').click();
      await page.waitForTimeout(500);
      check('F: «Скасувати» — діалог закрито, обліковий запис активний (сервер), запиту на видалення не було', !(await dlg.isVisible()) && (await gebruiker(dId)).status === 'approved');
      await knop.click();
      const t0 = Date.now();
      const methoden = page.waitForResponse((q) => q.url().endsWith('/api/owner/access/stap-op/methoden'), { timeout: 30000 }).then((q) => `${q.status()} за ${Date.now() - t0} мс`).catch(() => 'немає відповіді за 30 с');
      await dlg.locator('.bevestig-dialoog-ja').click();
      const venster = page.getByRole('dialog').filter({ hasText: /Підтвердіть доступ/ });
      await venster.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
      // як людина: чекаємо, доки замість «Завантаження…» з'являться способи підтвердження. Особа має другий пристрій — вікно спершу
      // пропонує «Підтвердити з іншого пристрою» (запит «Це ви?» туди); людина обирає «Увійти повторно через Google» у «Виникли проблеми?».
      const inshyi = venster.getByText(/На вашому іншому пристрої/);
      await inshyi.waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined);
      check('F: є другий пристрій — вікно спершу пропонує підтвердити з нього (запит «Це ви?» надіслано на 1 пристрій)', await inshyi.isVisible().catch(() => false) && /Запит надіслано на 1/.test(await venster.innerText().catch(() => '')));
      await foto(page, 'wissen-ander-apparaat-computer');
      await venster.getByRole('button', { name: 'Увійти повторно через Google' }).click();
      await venster.getByRole('button', { name: 'Підтвердити повторним входом через Google' }).waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
      console.log(`[e2e] F: способи підтвердження (stap-op/methoden): ${await methoden}`);
      check('F: сервер вимагає підтвердити особу — відкрито вікно «Підтвердіть доступ»', await venster.isVisible().catch(() => false) && (await gebruiker(dId)).status === 'approved');
      await foto(page, 'wissen-bevestig-toegang-computer');
      check('F: вікно чесно каже, що після входу Google видалення треба повторити (автоматично воно не продовжиться)',
        (await venster.locator('[data-google-hervat]').getAttribute('data-google-hervat').catch(() => '')) === 'herhalen' && /тоді повторіть дію/.test(await venster.innerText().catch(() => '')));
      const googleKnop = venster.getByRole('button', { name: 'Підтвердити повторним входом через Google' });
      console.log(`[e2e] F: кнопка Google — видима ${await googleKnop.isVisible().catch(() => false)}, доступна ${await googleKnop.isEnabled().catch(() => false)}`);
      await googleKnop.click();
      await page.waitForURL(/id\.tarasevych\.com\/account/, { timeout: 20000 }).catch(() => undefined);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      // Задум: видалення після повернення від Google саме не продовжується (критична дія) — сторінка каже повторити її протягом 5 хвилин.
      const terugUrl = page.url();
      const herhaalTekst = await tekstOp(page, /Доступ підтверджено\. Тепер повторіть дію/, 10000);
      check('F: після повернення від Google — повідомлення «Доступ підтверджено. Тепер повторіть дію (діє 5 хвилин)», обліковий запис ще не видалено',
        herhaalTekst && (await gebruiker(dId)).status === 'approved', terugUrl);
      await foto(page, 'wissen-na-google-computer');
      const verzoeken = (await pool.query("select stand from app.bevestigingen_apparaat where user_id=$1", [dId])).rows.map((x: { stand: string }) => x.stand);
      const openTweede = await idApi(Dtweede, '/api/owner/bevestiging/apparaat/open');
      check('F: запит «Це ви?» відкликано, щойно людина обрала Google: ні цей браузер після повернення, ні другий пристрій його не показують',
        verzoeken.length === 1 && verzoeken[0] === 'ingetrokken' && !(await page.getByRole('dialog').filter({ hasText: /Це ви\?/ }).isVisible().catch(() => false))
        && openTweede.status === 200 && ((openTweede.data?.verzoeken || []) as unknown[]).length === 0, `${verzoeken.join(',')} ${openTweede.status} ${JSON.stringify(openTweede.data?.verzoeken || []).slice(0, 80)}`);
      const zone2 = await openBlok(page, 'section.settings-danger');
      const veld2 = zone2.locator(`input[placeholder="${D.email}"]`);
      console.log(`[e2e] F: повернення ${terugUrl}; поле адреси після повернення: «${(await veld2.inputValue().catch(() => '?')) ? 'заповнене' : 'порожнє'}»`);
      await veld2.fill(D.email);
      await zone2.locator('.settings-danger-button').click();
      const wisAntw = page.waitForResponse((r) => r.url().endsWith('/api/owner/identity/account/delete'), { timeout: 15000 }).catch(() => null);
      await page.locator('[data-bevestig="account-verwijderen"]').waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
      await foto(page, 'wissen-herhaal-dialoog-computer');
      await page.locator('[data-bevestig="account-verwijderen"] .bevestig-dialoog-ja').click();
      const wa = await wisAntw; const wab = wa ? await wa.json().catch(() => ({})) : {};
      await page.waitForTimeout(1200);
      const status = String((await gebruiker(dId)).status || '');
      check('F: повторене видалення після підтвердження через Google — сервер 200, обліковий запис видалено (deleted), Google відвідано один раз',
        wa?.status() === 200 && status === 'deleted' && googleBezocht === 1, `${wa?.status()} ${JSON.stringify(wab).slice(0, 160)} ${status} ${googleBezocht}`);
      check('F: людина бачить підсумок про 30 днів на відновлення', await tekstOp(page, /Протягом 30 днів його можна відновити/, 8000));
      const naWis = await page.evaluate(async () => { const r = await fetch('/api/owner/session/bootstrap', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'identity', tabContext: sessionStorage.getItem('tsv-canonical-tab-v1') || '', sourceOrigin: location.origin }) }); return { s: r.status, b: (await r.text()).slice(0, 200) }; });
      check('F: сеанс закрито — сторінка без входу, сервер не пускає з цими cookie', /"state":"signed_out"/.test(naWis.b) && !/"status":"approved"/.test(naWis.b), `${naWis.s} ${naWis.b}`);
      const tweede = await idApi(Dtweede, '/api/owner/session/bootstrap');
      check('F: на другому пристрої вхід теж завершено (bootstrap → signed_out)', tweede.data?.state === 'signed_out' && !tweede.data?.user, `${tweede.status} ${JSON.stringify(tweede.data).slice(0, 120)}`);
      await foto(page, 'wissen-klaar-computer');
      const wsNa = ((await pool.query("select data from app.records where tbl='workspaces' and id=$1", [wsD])).rows[0]?.data || {}) as Record<string, unknown>;
      check('F: простір архівовано під час видалення', Number(wsNa.archivedAt) > 0 && wsNa.archivedReason === 'account_deleted');
      await sluit(ctx);
      // Відновлення протягом 30 днів: новий вхід → «Відновити старий простір»
      const D2 = await opnieuw(D);
      const { page: p2 } = await nieuwApparaat(D2, { width: 380, height: 800, touch: true }, [...VERWACHT, ...DAVNE_ZONDER_SESSIE]);
      p2.on('response', (q) => { if (q.status() >= 400 && DAVNE_ZONDER_SESSIE.some((x) => x.test(q.url()))) davne.push(`${q.status()} ${new URL(q.url()).pathname}`); });
      await p2.goto(`${ID}/account?lang=uk`, { waitUntil: 'networkidle' });
      const poort = p2.locator('[data-account-herstel]');
      await poort.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      check('F: новий вхід — екран «Обліковий запис потребує відновлення» з датою кінця строку й двома варіантами', await poort.isVisible().catch(() => false) && /Обліковий запис видалено, але дані ще збережено до/.test(await p2.locator('.access-gate').innerText().catch(() => '')));
      check('F: телефон 380 — екран відновлення без горизонтальної прокрутки', (await horizontaal(p2)) <= 0);
      await foto(p2, 'herstel-poort-telefoon');
      const herst = p2.waitForResponse((r) => r.url().endsWith('/api/owner/identity/account/recover'));
      await poort.locator('[data-account-herstel-knop="restore"]').click();
      const hr = await herst; await p2.waitForTimeout(1500);
      const u = await gebruiker(dId);
      const wsTerug = ((await pool.query("select data from app.records where tbl='workspaces' and id=$1", [wsD])).rows[0]?.data || {}) as Record<string, unknown>;
      check('F: «Відновити старий простір» (/recover) — обліковий запис знову схвалений, простір не архівний і належить цьому обліковому запису',
        hr.status() === 200 && u.status === 'approved' && !Number(wsTerug.archivedAt) && wsTerug.ownerUserId === dId, `${hr.status()} ${u.status} ${wsTerug.archivedAt}`);
      check('F: людина бачить «Обліковий запис і простори відновлено»', await tekstOp(p2, /Обліковий запис і простори відновлено/));
      await foto(p2, 'herstel-klaar-telefoon');
      await p2.goto(`${HUB}/notes?lang=uk`, { waitUntil: 'networkidle' });
      const blok = p2.locator('[data-blok-id]').filter({ hasText: 'Блок, що має повернутися' });
      await blok.first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
      check('F: у hub простір повернувся разом із блоком', await blok.first().isVisible().catch(() => false));
      await p2.setViewportSize({ width: 1280, height: 860 });
      await foto(p2, 'herstel-hub-computer');
    }
    const echt = fouten.filter((f) => !/ERR_ABORTED|net::ERR_FAILED/.test(f));
    check('без помилок у консолі й HTTP (окрім очікуваних відмов)', echt.length === 0, echt.slice(0, 8).join(' | '));
    console.log(`[e2e] пік запитів сторінок до API за хвилину: ${piekMinuut()}`);
    if (davne.length) console.log(`[e2e] давня вада (поза кроком): ${davne.length}× 401/403 без входу або до схвалення: ${[...new Set(davne)].join(', ')}`);
  } catch (e) {
    check('неочікувана помилка', false, String((e as Error)?.stack || e).slice(0, 1500));
  } finally {
    await sluit(...contexten);
    await browser.close().catch(() => undefined);
    // Прибирання лише за ТОЧНИМИ адресами цього запуску.
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [emails]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) {
      await pool.query('delete from app.agents where user_id = any($1)', [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    }
    await stop();
  }
  return einde();
}
