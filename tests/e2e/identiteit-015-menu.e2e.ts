// IDENTITEIT-015 (приймання, група «menu»): справжній Chromium, дві вигадані особи (власниця сайту й звичайний схвалений обліковий
// запис), кожен «пристрій» — окремий контекст із тими самими cookie.
//  A. Обрані кнопки (швидкий доступ): додати дві кнопки, переставити клавіатурою (Alt+стрілки), мишею (перетягування в режимі
//     редагування меню) і дотиком (телефон, довге натискання); закрити контекст і відкрити новий — порядок той самий; інший піддомен
//     (hub) — той самий порядок; /api/owner/ui/sidebar показує місце збереження (обліковий запис + вебзона); інший обліковий запис
//     цього порядку не бачить; вилучити кнопку — після нового входу її немає.
//  B. Сповіщення в меню: позначки, «бульбашки» при наведенні мишею, фокус клавіатурою, дотик (телефон).
//  C. Тихі години з page.clock (Брюссель): подія в тиші не спливає й не звучить (лишається в панелі); після кінця — «Поки була тиша: N».
//  D. Переходи й швидкодія: кожен параметр перемкнути в налаштуваннях і виміряти navigation timing (перше відкриття проти
//     повернення; deliveryType), reducedMotion: 'reduce'.
//  E. Видимість і піктограми: сховати й повернути необов'язковий пункт, змінити піктограму; обов'язковий пункт заблоковано з
//     поясненням (і для не-власника); прихований розділ знаходиться пошуком; 3 режими × 4 положення — піктограми видимі й різні.
// Знімки 015-menu-*.png (телефон 380×800 і комп'ютер 1280), знеособлені (verberg). Лише вигадані адреси @example.test.
// Acceptatie van de menugroep: snelle toegang (muis/toetsenbord/aanraken, bewaard per account en webruimte), menubadges, stille uren,
// overgangen en snelheid, zichtbaarheid en iconen.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { Browser, Page } from 'playwright-core';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { HUB, ID, api, apparaat, horizontaal, openBlok, persoon, sluit, verberg, volgFouten, type Persoon } from './hulp/sessie-015';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
// Alleen voor het ontwikkelen: E2E_STAP=A,C draait alleen die delen.
const STAPPEN = (process.env.E2E_STAP || 'A,B,C,D,E').split(',');
// Очікувані відмови: 403 activity (не власник агента); 500 mail bootstrap — давня вада поза групою (gmailParserPolicySelfTest).
const VERWACHT = [/\/api\/owner\/agents\/activity$/, /mail\.tarasevych\.com\/api\/owner\/mail\/(bootstrap|accounts\/list)$/];

type Pagina = { ctx: import('playwright-core').BrowserContext; page: Page };

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-015 menu');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaarEmail = `e2e-i15m-eig-${T}@example.test`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaarEmail, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser: Browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const emails: string[] = [];
  const foto = async (page: Page, naam: string) => { await verberg(page); await page.screenshot({ path: `${UIT}/015-menu-${naam}.png`, fullPage: false }); };
  const idVanEmail = async (email: string) => String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id || '');
  const rust = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const open = async (o: Persoon, url: string, extra: Parameters<typeof apparaat>[2] = {}, voor?: (p: Page) => Promise<void>): Promise<Pagina> => {
    const a = await apparaat(browser, o, { taal: 'uk', ...extra });
    volgFouten(a.page, fouten, VERWACHT);
    if (voor) await voor(a.page);
    await a.page.goto(url, { waitUntil: 'networkidle' });
    await a.page.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 });
    await a.page.waitForTimeout(600);
    return a;
  };
  // Порядок пунктів у списку бічної панелі («snelbalk|» — швидкий доступ, «zijbalk|» — головний ряд).
  const lijst = (page: Page, l: string) => page.evaluate((l2) => Array.from(document.querySelector(`[data-menu-lijst="${l2}"]`)?.querySelectorAll<HTMLElement>(':scope > [data-menu-sleutel]') || []).map((e) => e.dataset.menuSleutel!), l);
  // Порядок у редакторі «Швидкий доступ» (назви пунктів).
  const snelNamen = async (page: Page) => (await page.locator('#menu-snel [data-snel-rij] .menu-snel-naam strong').allTextContents()).map((x) => x.trim());
  const knop = (sl: string) => `.canonical-sidebar :is(button[data-menu-sleutel="${sl}"], [data-menu-sleutel="${sl}"] > .canonical-service-main-row > .canonical-service-button, [data-menu-sleutel="${sl}"] button)`;
  const tekstOp = async (page: Page, re: RegExp, ms = 8000) => page.getByText(re).first().waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
  try {
    // ---------------------------------------------------------------- особи
    const O = await persoon(G as never, 'i15m-eig', T); emails.push(O.email);
    const B = await persoon(G as never, 'i15m-ander', T); emails.push(B.email);
    const oId = await idVanEmail(O.email), bId = await idVanEmail(B.email);
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [bId, JSON.stringify({ status: 'approved', name: 'Інший Проба' })]);
    check('підготовка: власниця й другий схвалений обліковий запис є', !!oId && !!bId && oId !== bId);

    // ================================================================ A. обрані кнопки
    if (STAPPEN.includes('A')) {
      const { ctx, page } = await open(O, `${ID}/menu?lang=uk#menu-snel`, { width: 1280, height: 1000 });
      await openBlok(page, '#menu-snel [data-snelle-toegang-editor]');
      const keuze = page.locator('#menu-snel select[data-snel-nieuw]');
      const kandidaten = await keuze.locator('option').evaluateAll((os) => os.map((o) => [(o as HTMLOptionElement).value, (o.textContent || '').trim()] as const).filter(([v]) => !!v));
      // Два пункти, що є в кожного: «Пошта» і «Хмара» (сторінки або розділи) — беремо перші два різні кандидати.
      const [k1, k2] = kandidaten;
      check('A: у виборі «Додати пункт» є кандидати', kandidaten.length >= 2, String(kandidaten.length));
      for (const [v] of [k1, k2]) { await keuze.selectOption(v); await page.locator('#menu-snel button[data-snel-toevoegen]').click(); await page.waitForTimeout(400); }
      const naToevoegen = await snelNamen(page);
      check('A: дві кнопки додано в редакторі (у порядку додавання)', naToevoegen.length === 2 && naToevoegen[0] === k1[1] && naToevoegen[1] === k2[1], naToevoegen.join(' | '));
      const snelZijbalk = await lijst(page, 'snelbalk|');
      check('A: ці дві кнопки одразу видно в бічній панелі (верхній ряд)', snelZijbalk.length === 2, snelZijbalk.join(','));
      await foto(page, 'snel-toegevoegd-computer');
      // ---- клавіатура: Alt+↑ на другому рядку
      const tweedeOmhoog = page.locator('#menu-snel [data-snel-rij]').nth(1).locator('button[data-snel-omhoog]');
      await tweedeOmhoog.focus();
      await page.keyboard.press('Alt+ArrowUp'); await page.waitForTimeout(400);
      const naAlt = await snelNamen(page);
      check('A: клавіатура — Alt+↑ ставить другу кнопку першою', naAlt[0] === k2[1] && naAlt[1] === k1[1], naAlt.join(' | '));
      const zijNaAlt = await lijst(page, 'snelbalk|');
      check('A: клавіатура — бічна панель показує той самий новий порядок', zijNaAlt[0] === snelZijbalk[1] && zijNaAlt[1] === snelZijbalk[0], zijNaAlt.join(','));
      await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(400);
      check('A: клавіатура — Alt+↓ повертає назад', (await snelNamen(page))[0] === k1[1], (await snelNamen(page)).join(' | '));
      // ---- миша: режим редагування меню → перетягнути другу кнопку перед першою
      // «Редагувати меню» в «Розташування й порядок меню» (#menu-indeling) — режим редагування бічної панелі на цій же сторінці.
      await (await openBlok(page, '#menu-indeling [data-menu-bewerken-start]')).click();
      await page.locator('[data-menu-bewerkbalk]').waitFor({ timeout: 5000 });
      const voorSleep = await lijst(page, 'snelbalk|');
      const a = (await page.locator(knop(voorSleep[1])).first().boundingBox())!, b = (await page.locator(knop(voorSleep[0])).first().boundingBox())!;
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
      const tx = b.x + b.width / 2, ty = b.y + b.height * 0.2;
      for (let i = 1; i <= 12; i++) { await page.mouse.move(a.x + a.width / 2 + ((tx - a.x - a.width / 2) * i) / 12, a.y + a.height / 2 + ((ty - a.y - a.height / 2) * i) / 12); await page.waitForTimeout(16); }
      await page.waitForTimeout(150);
      const geest = await page.locator('.menu-sleep-geest').count();
      await page.mouse.up(); await page.waitForTimeout(500);
      const naSleep = await lijst(page, 'snelbalk|');
      check('A: миша — перетягування другої кнопки на місце першої міняє порядок', geest === 1 && naSleep[0] === voorSleep[1] && naSleep[1] === voorSleep[0], `${voorSleep.join(',')} → ${naSleep.join(',')} (geest=${geest})`);
      await page.locator('[data-menu-bewerken-klaar]').click().catch(() => undefined);
      await page.waitForTimeout(500);
      const naMuisNamen = await snelNamen(page);
      check('A: миша — редактор «Швидкий доступ» показує той самий порядок', naMuisNamen[0] === k2[1] && naMuisNamen[1] === k1[1], naMuisNamen.join(' | '));
      await foto(page, 'snel-na-slepen-computer');
      // ---- сервер: місце збереження
      const r = await api(page, '/api/owner/ui/sidebar');
      const opslag = r.data?.opslag as { account?: string; ruimte?: string } | undefined;
      check('A: /api/owner/ui/sidebar — 200, вебзона «gebruiker» і цей обліковий запис', r.status === 200 && r.data?.ruimte === 'gebruiker' && opslag?.ruimte === 'gebruiker' && opslag?.account === oId, JSON.stringify({ s: r.status, ruimte: r.data?.ruimte, opslag }));
      await sluit(ctx);

      // ---- новий контекст із тими самими cookie (порожній localStorage): порядок із сервера
      {
        const n = await open(O, `${ID}/menu?lang=uk#menu-snel`, { width: 1280, height: 1000 });
        await openBlok(n.page, '#menu-snel [data-snelle-toegang-editor]');
        await n.page.waitForTimeout(400);
        const z = await lijst(n.page, 'snelbalk|'), namen = await snelNamen(n.page);
        check('A: новий контекст (ті самі cookie, порожнє сховище) — той самий порядок у меню й редакторі', z.join() === naSleep.join() && namen[0] === k2[1] && namen[1] === k1[1], `${z.join(',')} | ${namen.join(' | ')}`);
        await sluit(n.ctx);
      }
      // ---- інший піддомен (hub) — той самий порядок
      {
        const h = await open(O, `${HUB}/?lang=uk`, { width: 1280, height: 860 });
        const z = await lijst(h.page, 'snelbalk|');
        check('A: інший піддомен (hub.tarasevych.com) — той самий порядок кнопок', z.join() === naSleep.join(), z.join(','));
        await foto(h.page, 'snel-hub-computer');
        await sluit(h.ctx);
      }
      // ---- інший обліковий запис цього порядку не бачить
      {
        const x = await open(B, `${HUB}/?lang=uk`, { width: 1280, height: 860 });
        const z = await lijst(x.page, 'snelbalk|');
        const rb = await api(x.page, '/api/owner/ui/sidebar', { service: 'hub' });
        check('A: інший обліковий запис — без цих кнопок; сервер віддає його власне місце збереження', z.length === 0 && rb.status === 200 && (rb.data?.opslag as { account?: string })?.account === bId, `${z.join(',')} ${rb.status}`);
        await sluit(x.ctx);
      }
      // ---- дотик: телефон 380, шухляда → режим редагування → довге натискання й перетягування
      {
        const m = await open(O, `${ID}/sessions?lang=uk`, { width: 380, height: 800, touch: true });
        await m.page.locator('[data-sidebar-action="open-drawer"]').tap();
        await m.page.locator('.menu-lade-bewerken').waitFor({ timeout: 5000 });
        await m.page.locator('.menu-lade-bewerken').tap();
        await m.page.locator('[data-menu-bewerkbalk]').waitFor({ timeout: 5000 });
        const voor = await lijst(m.page, 'snelbalk|');
        await m.page.locator(knop(voor[1])).first().scrollIntoViewIfNeeded();
        const cdp = await m.ctx.newCDPSession(m.page);
        const pa = (await m.page.locator(knop(voor[1])).first().boundingBox())!, pb = (await m.page.locator(knop(voor[0])).first().boundingBox())!;
        const punt = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
        const x0 = pa.x + Math.min(30, pa.width / 2), y0 = pa.y + pa.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punt(x0, y0) });
        await m.page.waitForTimeout(150);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punt(x0 + 1, y0) });
        await m.page.waitForTimeout(500);
        const lang = await m.page.evaluate(() => !!document.querySelector('.menu-sleep-geest'));
        const ty2 = pb.y + pb.height * 0.2, tx2 = pb.x + Math.min(30, pb.width / 2);
        for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punt(x0 + ((tx2 - x0) * i) / 10, y0 + ((ty2 - y0) * i) / 10) }); await m.page.waitForTimeout(20); }
        await m.page.waitForTimeout(120);
        await foto(m.page, 'snel-aanraken-slepen-telefoon');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await m.page.waitForTimeout(600);
        const na = await lijst(m.page, 'snelbalk|');
        check('A: дотик — довге натискання починає перетягування, кнопка стає першою', lang && na[0] === voor[1] && na[1] === voor[0], `${voor.join(',')} → ${na.join(',')} (lang=${lang})`);
        check('A: телефон 380 — без горизонтальної прокрутки', (await horizontaal(m.page)) <= 0, String(await horizontaal(m.page)));
        await m.page.locator('.canonical-drawer-close').tap().catch(() => undefined);
        await sluit(m.ctx);
      }
      // ---- після дотику (новий контекст): порядок той, що дав дотик; потім вилучити одну кнопку
      {
        const n = await open(O, `${ID}/menu?lang=uk#menu-snel`, { width: 1280, height: 1000 });
        await openBlok(n.page, '#menu-snel [data-snelle-toegang-editor]');
        await n.page.waitForTimeout(400);
        const namen = await snelNamen(n.page);
        check('A: після дотику в новому контексті — порядок із телефону (як до перетягування мишею)', namen[0] === k1[1] && namen[1] === k2[1], namen.join(' | '));
        await n.page.locator('#menu-snel [data-snel-rij]').first().locator('button[data-snel-weg]').click(); await n.page.waitForTimeout(500);
        const naWeg = await snelNamen(n.page);
        check('A: вилучення — лишилася одна кнопка, у бічній панелі теж одна', naWeg.length === 1 && naWeg[0] === k2[1] && (await lijst(n.page, 'snelbalk|')).length === 1, naWeg.join(' | '));
        await sluit(n.ctx);
        const h = await open(O, `${HUB}/?lang=uk`, { width: 380, height: 800, touch: true });
        await h.page.locator('[data-sidebar-action="open-drawer"]').tap();
        await h.page.waitForTimeout(500);
        const z = await lijst(h.page, 'snelbalk|');
        check('A: після вилучення — на іншому піддомені й іншому пристрої (телефон) лише одна кнопка', z.length === 1, z.join(','));
        await foto(h.page, 'snel-na-weghalen-telefoon');
        await sluit(h.ctx);
      }
    }

    // ================================================================ B. сповіщення в меню: позначки, наведення, клавіатура, дотик
    if (STAPPEN.includes('B')) {
      const nu = Date.now();
      const zaai = async (kind: string, title: string, message: string, op: number) => (await pool.query("insert into app.records(tbl,data) values('site_notifications',$1::jsonb) returning id", [JSON.stringify({ recipientUserId: oId, recipientEmail: O.email, kind, title, message, read: false, createdAt: op })])).rows[0].id as string;
      const idConflict = await zaai('account_email_conflict', 'Перевірте адресу облікового запису', 'Ця адреса вже використовується іншим входом.', nu - 30000);
      await zaai('workspace_share', 'Вам надали доступ до простору', 'Простір «Проба» тепер доступний.', nu - 120000);
      const badges = (page: Page) => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll<HTMLElement>('[data-menu-badge]')).filter((b) => b.getBoundingClientRect().width > 0).map((b) => [b.dataset.menuBadge!, { tekst: (b.textContent || '').trim(), cat: b.dataset.categorie }])));
      const knopVan = (page: Page, item: string) => page.locator(`button:has(> .canonical-menu-icon-slot > [data-menu-badge="${item}"])`).first();
      const d = await open(O, `${ID}/sessions?lang=uk`, { width: 1280, height: 860 });
      await d.page.locator('[data-menu-badge="svc:identity"]').waitFor({ timeout: 15000 }).catch(() => undefined);
      const bA = await badges(d.page);
      check('B: позначки — «Налаштування» 1 (безпека), «Мій простір» (спільний доступ)', bA['svc:identity']?.tekst === '1' && bA['svc:identity']?.cat === 'beveiliging' && bA['svc:hub']?.cat === 'delen', JSON.stringify(bA));
      const aria = await knopVan(d.page, 'svc:identity').getAttribute('aria-label');
      check('B: aria-label пункту називає кількість (без змісту сповіщення)', /1 сповіщення/.test(aria || '') && !/адрес/i.test(aria || ''), String(aria));
      await knopVan(d.page, 'svc:identity').hover();
      const bel = d.page.locator('[data-menu-bellen="svc:identity"]');
      const belZicht = await bel.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
      check('B: наведення мишею — пояснення («бульбашка») зі змістом сповіщення', belZicht && /Перевірте адресу облікового запису/.test(await bel.innerText().catch(() => '')));
      await foto(d.page, 'meldingen-bellen-computer');
      await d.page.mouse.move(900, 500); await d.page.waitForTimeout(500);
      check('B: миша пішла — пояснення зникло', !(await bel.isVisible().catch(() => false)));
      // клавіатура: фокус на пункт (Shift+Tab → Tab дає :focus-visible), → у бульбашку, Esc назад
      const hubKnop = knopVan(d.page, 'svc:hub');
      await hubKnop.focus(); await d.page.keyboard.press('Shift+Tab'); await d.page.keyboard.press('Tab'); await d.page.waitForTimeout(300);
      const belHub = d.page.locator('[data-menu-bellen="svc:hub"]');
      const viaToets = await belHub.isVisible().catch(() => false);
      check('B: фокус клавіатурою відкриває пояснення', viaToets && /Вам надали доступ до простору/.test(await belHub.innerText().catch(() => '')));
      await d.page.keyboard.press('ArrowRight');
      const inPaneel = await d.page.evaluate(() => !!document.activeElement?.closest('[data-menu-bellen]'));
      await d.page.keyboard.press('Escape'); await d.page.waitForTimeout(200);
      const terug = await d.page.evaluate(() => !!document.activeElement?.querySelector('[data-menu-badge="svc:hub"]'));
      check('B: клавіатура — → у пояснення, Esc повертає фокус на пункт і закриває', inPaneel && terug && !(await belHub.isVisible().catch(() => false)), `${inPaneel} ${terug}`);
      await sluit(d.ctx);
      // дотик (телефон 380): позначки в шухляді; наведення немає — що бачить людина при дотику
      const m = await open(O, `${ID}/sessions?lang=uk`, { width: 380, height: 800, touch: true });
      await m.page.locator('[data-sidebar-action="open-drawer"]').tap();
      await m.page.waitForTimeout(600);
      const bM = await badges(m.page);
      check('B: дотик (телефон) — позначки видно в меню-шухляді', bM['svc:identity']?.tekst === '1' && !!bM['svc:hub'], JSON.stringify(bM));
      // Наведення на телефоні немає; довге натискання на сам пункт нічого не відкриває (лише в режимі редагування — перетягування).
      // Пояснення відкривається дотиком до самої позначки (INTEG-001), без переходу на сторінку пункту.
      const urlVoor = m.page.url();
      const badgeDoos = await m.page.locator('[data-menu-badge="svc:identity"]').first().boundingBox();
      await m.page.locator('[data-menu-badge="svc:identity"]').first().tap(); await m.page.waitForTimeout(600);
      const belTik = m.page.locator('[data-menu-bellen="svc:identity"]');
      const belZichtTik = await belTik.isVisible().catch(() => false);
      check('B: дотик до позначки — пояснення зі змістом, без переходу', belZichtTik && /Перевірте адресу облікового запису/.test(await belTik.innerText().catch(() => '')) && m.page.url() === urlVoor, `bellen=${belZichtTik} ${m.page.url()} позначка ${Math.round(badgeDoos?.width || 0)}×${Math.round(badgeDoos?.height || 0)} px`);
      await foto(m.page, 'meldingen-aanraken-telefoon');
      check('B: телефон 380 — без горизонтальної прокрутки', (await horizontaal(m.page)) <= 0, String(await horizontaal(m.page)));
      await sluit(m.ctx);
      void idConflict;
    }

    // ================================================================ C. тихі години (page.clock, Брюссель)
    if (STAPPEN.includes('C')) {
      const toast = (page: Page, t: string) => page.locator('.canonical-notification-toast', { hasText: t });
      const stuur = (page: Page, text: string) => page.evaluate((t) => window.dispatchEvent(new CustomEvent('tsv:canonical-notice', { detail: { text: t, kind: 'info', source: 'hub' } })), text);
      const klanken = (page: Page) => page.evaluate(() => (window as unknown as { __klank: number }).__klank || 0);
      const c = await open(O, `${ID}/menu?lang=uk#menu-meldingen`, { width: 1280, height: 860, tijdzone: 'Europe/Brussels' }, async (p) => {
        await p.clock.install({ time: new Date('2026-11-16T21:50:00+01:00') });
        // Лічильник звуку: кожен AudioContext центру сповіщень = один сигнал.
        await p.addInitScript(() => { const W = window as unknown as { AudioContext: typeof AudioContext; __klank: number }; W.__klank = 0; const Orig = W.AudioContext; if (Orig) W.AudioContext = class extends Orig { constructor(...a: ConstructorParameters<typeof AudioContext>) { super(...a); W.__klank++; } } as typeof AudioContext; });
      });
      const { page } = c;
      await openBlok(page, '#menu-meldingen [data-stille-uren]');
      const stil = page.locator('#menu-meldingen [data-meld-schakel="stil"] input');
      if (!(await stil.isChecked())) await page.locator('#menu-meldingen [data-meld-schakel="stil"]').click();
      const tijden = page.locator('#menu-meldingen .zijbalk-meldingen-tijden input[type="time"]');
      await tijden.nth(0).fill('22:00'); await tijden.nth(1).fill('07:00'); await page.waitForTimeout(700);
      const opgeslagen = await api(page, '/api/owner/ui/sidebar');
      const st = (opgeslagen.data?.sidebar as { meldingen?: { stil?: { aan: boolean; van: string; tot: string } } })?.meldingen?.stil;
      check('C: тихі години 22:00–07:00 увімкнено в налаштуваннях і збережено на сервері', !!st?.aan && st.van === '22:00' && st.tot === '07:00', JSON.stringify(st));
      await foto(page, 'stille-uren-instelling-computer');
      // контроль до тиші (21:5x): подія спливає
      await stuur(page, 'Проба: до тиші');
      const voorZicht = await toast(page, 'Проба: до тиші').waitFor({ timeout: 4000 }).then(() => true).catch(() => false);
      const klankVoor = await klanken(page);
      check('C: до тиші (21:5x) — подія спливає', voorZicht, `звук: ${klankVoor}`);
      await page.keyboard.press('Escape').catch(() => undefined);
      // у тиші: 22:30
      await page.clock.fastForward('40:00');
      const klankStart = await klanken(page);
      await stuur(page, 'Проба: у тиші 1'); await stuur(page, 'Проба: у тиші 2');
      await page.waitForTimeout(1500);
      const inStil = (await toast(page, 'Проба: у тиші').count()) > 0;
      check('C: у тиші (22:30) — дві події не спливають і не звучать', !inStil && (await klanken(page)) === klankStart, `toast=${inStil} звук ${klankStart}→${await klanken(page)}`);
      await page.locator('[data-qa-id="canonical-notification-bell"]').first().click();
      const paneel = page.locator('[data-qa-id="canonical-notification-panel"]');
      await paneel.waitFor({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(600);
      const pTekst = await paneel.innerText().catch(() => '');
      // Однакові за змістом рядки (різняться лише цифрою) панель об'єднує в один з лічильником «×2» — так задумано (samenvoegSleutel).
      check('C: у тиші — обидві події є в панелі сповіщень (один рядок «×2»)', /Проба: у тиші/.test(pTekst) && /×2/.test(pTekst), pTekst.replace(/\n/g, ' / ').slice(0, 240));
      await foto(page, 'stille-uren-paneel-computer');
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      // після кінця: 07:01 наступного дня
      await page.clock.fastForward('08:31:00');
      await page.waitForTimeout(800);
      const sam = toast(page, 'Поки була тиша');
      const samZicht = await sam.waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
      const samTekst = await sam.first().innerText().catch(() => '');
      check('C: після кінця тиші (07:01) — один підсумок «Поки була тиша: 2»', samZicht && /Поки була тиша: 2/.test(samTekst), samTekst.slice(0, 120));
      await foto(page, 'stille-uren-samenvatting-computer');
      await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
      check('C: після перезавантаження підсумок не повторюється', (await toast(page, 'Поки була тиша').count()) === 0);
      // повернути: тихі години вимкнути
      await openBlok(page, '#menu-meldingen [data-stille-uren]');
      if (await stil.isChecked()) await page.locator('#menu-meldingen [data-meld-schakel="stil"]').click();
      await page.waitForTimeout(600);
      await sluit(c.ctx);
    }

    // ================================================================ D. переходи й швидкодія
    if (STAPPEN.includes('D')) {
      type Snel = { voortgang: boolean; overgangen: boolean; vooruitladen: boolean; prerender: boolean };
      const meetpunten = async (p: Page) => p.addInitScript(() => {
        const w = window as unknown as { __vt: number; __vg: string[] };
        w.__vt = 0; w.__vg = [];
        const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
        if (typeof d.startViewTransition === 'function') { const o2 = d.startViewTransition.bind(document); d.startViewTransition = (cb: () => void) => { w.__vt++; return o2(cb); }; }
        new MutationObserver(() => { const b2 = document.getElementById('tsv-voortgang'); if (b2) { const s = String(b2.dataset.staat); if (w.__vg[w.__vg.length - 1] !== s) w.__vg.push(s); } }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-staat'] });
      });
      const nav = (p: Page) => p.evaluate(() => { const e = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming & { deliveryType?: string; activationStart?: number }; return { type: e?.type, delivery: e?.deliveryType ?? '?', activation: Math.round(e?.activationStart ?? 0), ttfb: Math.round((e?.responseStart ?? 0) - (e?.startTime ?? 0)), dcl: Math.round((e?.domContentLoadedEventEnd ?? 0) - (e?.startTime ?? 0)), transfer: e?.transferSize ?? -1 }; });
      const hoofd = (p: Page, dnst: string) => p.locator(`[data-service-group="${dnst}"] button[data-vooruit], [data-service-group="${dnst}"] > button`).first();
      const zet = async (p: Page, wens: Partial<Snel>) => {
        await p.goto(`${ID}/menu?lang=uk#menu-snelheid`, { waitUntil: 'networkidle' });
        await openBlok(p, '#menu-snelheid [data-menu-snelheid-instellingen]');
        for (const k of ['vooruitladen', 'voortgang', 'overgangen', 'prerender'] as const) {
          if (wens[k] === undefined) continue;
          const inp = p.locator(`#menu-snelheid [data-meld-schakel="${k}"] input`);
          if ((await inp.isChecked()) !== wens[k]) { await p.locator(`#menu-snelheid [data-meld-schakel="${k}"]`).click(); await p.waitForTimeout(300); }
        }
        await p.waitForTimeout(500);
        return ((await api(p, '/api/owner/ui/sidebar')).data?.sidebar as { snelheid?: Snel })?.snelheid;
      };
      const metingen: string[] = [];
      const S = await open(O, `${ID}/sessions?lang=uk`, { width: 1280, height: 860 }, meetpunten);
      const p = S.page;
      // 1) типово: смужка, плавність, підвантаження — увімкнено; повна підготовка — вимкнено
      let s = await zet(p, { voortgang: true, overgangen: true, vooruitladen: true, prerender: false });
      check('D: типові параметри збережено на сервері', !!s?.voortgang && !!s.overgangen && !!s.vooruitladen && !s.prerender, JSON.stringify(s));
      await p.goto(`${ID}/sessions?lang=uk`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
      await p.route('**/api/owner/**', async (rt) => { await rust(500); await rt.continue(); });
      await p.locator('[data-service-group="identity"] .canonical-local-page-button').nth(2).click();
      await p.waitForFunction(() => document.getElementById('tsv-voortgang')?.dataset.staat === 'uit', undefined, { timeout: 15000 }).catch(() => undefined);
      const vg1 = await p.evaluate(() => (window as unknown as { __vg: string[] }).__vg.slice()), vt1 = await p.evaluate(() => (window as unknown as { __vt: number }).__vt);
      await p.unroute('**/api/owner/**');
      check('D: смужка й плавність увімкнено — у межах розділу смужка «bezig→klaar→uit» і плавний перехід', vg1.includes('bezig') && vt1 >= 1, `${vg1.join('>')} vt=${vt1}`);
      await hoofd(p, 'hub').hover(); await p.waitForTimeout(1200);
      const vooruit1 = await p.evaluate(() => Array.from(document.querySelectorAll<HTMLAnchorElement>('#tsv-vooruit a[data-tsv-vooruit]')).map((a) => a.dataset.tsvVooruit));
      await hoofd(p, 'hub').click(); await p.waitForURL(/hub\.tarasevych\.com/, { timeout: 20000 }); await p.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 });
      const eerste = await nav(p);
      await p.goBack({ waitUntil: 'networkidle' }); await p.waitForTimeout(500);
      const terugId = await nav(p);
      await hoofd(p, 'hub').hover(); await p.waitForTimeout(1200);
      await hoofd(p, 'hub').click(); await p.waitForURL(/hub\.tarasevych\.com/, { timeout: 20000 }); await p.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 });
      const tweede = await nav(p);
      metingen.push(`типово: hub перше=${JSON.stringify(eerste)} повернення-назад(id)=${JSON.stringify(terugId)} hub повторно=${JSON.stringify(tweede)}`);
      check('D: підвантаження при наведенні — перше відкриття hub прийшло з попереднього завантаження (deliveryType navigational-prefetch)', vooruit1.includes('prefetch') && eerste.delivery === 'navigational-prefetch', `${vooruit1.join(',')} ${JSON.stringify(eerste)}`);
      check('D: повернення кнопкою «Назад» — тип back_forward', terugId.type === 'back_forward', JSON.stringify(terugId));
      check('D: повторне відкриття теж з підвантаження й не повільніше за перше більш ніж на 1 с', tweede.delivery === 'navigational-prefetch' && tweede.dcl <= eerste.dcl + 1000, `${eerste.dcl} → ${tweede.dcl}`);
      // 2) підвантаження вимкнено
      s = await zet(p, { vooruitladen: false });
      await p.goto(`${ID}/sessions?lang=uk`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
      await hoofd(p, 'hub').hover(); await p.waitForTimeout(1200);
      const vooruit2 = await p.evaluate(() => document.querySelectorAll('#tsv-vooruit a').length);
      await hoofd(p, 'hub').click(); await p.waitForURL(/hub\.tarasevych\.com/, { timeout: 20000 }); await p.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 });
      const zonder = await nav(p);
      metingen.push(`без підвантаження: hub=${JSON.stringify(zonder)}`);
      // Без підвантаження сторінка приходить звичайним завантаженням: з мережі ('') або з HTTP-кешу браузера ('cache', бо hub уже відкривали).
      check('D: підвантаження вимкнено — посилань наперед немає, deliveryType не navigational-prefetch (мережа або кеш)', s?.vooruitladen === false && vooruit2 === 0 && (zonder.delivery === '' || zonder.delivery === 'cache'), `${vooruit2} ${JSON.stringify(zonder)}`);
      // 3) повна підготовка (prerender) — лише разом із підвантаженням
      s = await zet(p, { vooruitladen: true, prerender: true });
      await p.goto(`${ID}/sessions?lang=uk`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
      await hoofd(p, 'hub').hover(); await p.waitForTimeout(2500);
      const vooruit3 = await p.evaluate(() => Array.from(document.querySelectorAll<HTMLAnchorElement>('#tsv-vooruit a[data-tsv-vooruit]')).map((a) => a.dataset.tsvVooruit));
      await hoofd(p, 'hub').click(); await p.waitForURL(/hub\.tarasevych\.com/, { timeout: 20000 }); await p.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 }); await p.waitForTimeout(800);
      const pre = await nav(p);
      metingen.push(`повна підготовка: hub=${JSON.stringify(pre)}`);
      check('D: повна підготовка — посилання prerender; hub відкрито й увійдено (меню є)', s?.prerender === true && vooruit3.includes('prerender') && (await p.locator('[data-service-group="hub"]').count()) > 0, `${vooruit3.join(',')} ${JSON.stringify(pre)}`);
      // 4) плавність вимкнено, 5) смужку вимкнено
      s = await zet(p, { prerender: false, overgangen: false, voortgang: false });
      await p.goto(`${ID}/sessions?lang=uk`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
      await p.route('**/api/owner/**', async (rt) => { await rust(500); await rt.continue(); });
      await p.locator('[data-service-group="identity"] .canonical-local-page-button').nth(2).click(); await p.waitForTimeout(1500);
      const vg4 = await p.evaluate(() => (window as unknown as { __vg: string[] }).__vg.slice()), vt4 = await p.evaluate(() => (window as unknown as { __vt: number }).__vt);
      await p.unroute('**/api/owner/**');
      check('D: смужку й плавність вимкнено — у межах розділу ні смужки, ні плавного переходу', !vg4.includes('bezig') && vt4 === 0, `${vg4.join('>')} vt=${vt4}`);
      s = await zet(p, { overgangen: true, voortgang: true });
      check('D: параметри повернуто (смужка й плавність увімкнено)', !!s?.overgangen && !!s.voortgang, JSON.stringify(s));
      await foto(p, 'snelheid-instellingen-computer');
      await sluit(S.ctx);
      // 6) reducedMotion: 'reduce' — плавність увімкнено, але переходу немає; смужка лишається
      const R = await open(O, `${ID}/sessions?lang=uk`, { width: 380, height: 800, touch: true, reducedMotion: true }, meetpunten);
      await R.page.route('**/api/owner/**', async (rt) => { await rust(500); await rt.continue(); });
      await R.page.locator('[data-sidebar-action="open-drawer"]').tap(); await R.page.waitForTimeout(500);
      await R.page.locator('[data-service-group="identity"] .canonical-local-page-button').nth(2).tap(); await R.page.waitForTimeout(1500);
      const vgR = await R.page.evaluate(() => (window as unknown as { __vg: string[] }).__vg.slice()), vtR = await R.page.evaluate(() => (window as unknown as { __vt: number }).__vt);
      await R.page.unroute('**/api/owner/**');
      const navR = await nav(R.page);
      metingen.push(`менше руху (телефон): ${JSON.stringify(navR)} vg=${vgR.join('>')} vt=${vtR}`);
      check('D: reducedMotion «reduce» (телефон) — плавного переходу немає, смужка завантаження є', vtR === 0 && vgR.includes('bezig'), `${vgR.join('>')} vt=${vtR}`);
      await foto(R.page, 'snelheid-minder-beweging-telefoon');
      await sluit(R.ctx);
      for (const x of metingen) console.log(`[e2e] D вимір: ${x}`);
    }

    // ================================================================ E. видимість і піктограми
    if (STAPPEN.includes('E')) {
      const V = await open(O, `${ID}/menu?lang=uk#menu-zichtbaarheid`, { width: 1280, height: 900 });
      const p = V.page;
      await openBlok(p, '#menu-zichtbaarheid .settings-menu-editor');
      const art = (naam: string) => p.locator('#menu-zichtbaarheid .settings-menu-editor article', { has: p.locator('strong', { hasText: naam }) }).first();
      const icoonVan = (page: Page, dnst: string) => page.evaluate((d2) => { const s2 = document.querySelector(`.canonical-sidebar [data-service-group="${d2}"] .canonical-service-button svg, .canonical-sidebar [data-service-group="${d2}"] svg`); return s2 ? String(s2.getAttribute('class') || '') : null; }, dnst);
      // обов'язковий пункт
      const verplicht = art('Налаштування');
      const vKnop = verplicht.locator('button');
      check('E: обов\'язковий пункт «Налаштування» — кнопку заблоковано з поясненням', await vKnop.isDisabled() && /Завжди видимий/.test(await verplicht.locator('small[data-menu-verplicht]').innerText().catch(() => '')) && /завжди видимий/.test(String(await vKnop.getAttribute('aria-label'))), String(await vKnop.getAttribute('aria-label')));
      // приховати «Хмарне сховище»
      const hmara = art('Хмарне сховище');
      check('E: «Хмарне сховище» спершу видно в бічній панелі', (await p.locator('.canonical-sidebar [data-service-group="cloud"]').count()) > 0);
      await hmara.locator('button').click(); await p.waitForTimeout(300);
      await p.locator('#menu-zichtbaarheid .settings-menu-editor button.settings-primary').click(); await p.waitForTimeout(1200);
      check('E: приховано — у налаштуваннях «Прихований», у бічній панелі пункту немає', /Прихований/.test(await hmara.innerText()) && (await p.locator('.canonical-sidebar [data-service-group="cloud"]').count()) === 0, await hmara.innerText());
      // змінити піктограму «Пошта» на «Ключ»
      const voorIcoon = await icoonVan(p, 'mail');
      await art('Пошта').locator('select').selectOption('key');
      await p.locator('#menu-zichtbaarheid .settings-menu-editor button.settings-primary').click(); await p.waitForTimeout(1200);
      const naIcoon = await icoonVan(p, 'mail');
      check('E: піктограму «Пошта» змінено на ключ — у бічній панелі інша піктограма', !!voorIcoon && !!naIcoon && voorIcoon !== naIcoon && /key/.test(naIcoon), `${voorIcoon} → ${naIcoon}`);
      await foto(p, 'zichtbaarheid-verborgen-icoon-computer');
      // пошук знаходить прихований розділ і саме налаштування. Індекс пошуку облікового запису на сервері будує фонова задача
      // (cron, backend/zoek/bronnen.ts runZoekIndex); у тестовому середовищі її запускаємо тут для цієї особи, як це зробив би cron.
      const zb = await import('../../backend/zoek/bronnen');
      const ronde = await zb.runZoekIndex({ gebruikers: [oId], limiet: 200, budgetMs: 60_000 });
      check('E: (середовище) індекс пошуку побудовано фоновою задачею для цього облікового запису', ronde.fout === 0 && ronde.klaar > 0, JSON.stringify(ronde));
      const zoek = async (q: string) => {
        await p.keyboard.press('Control+k'); await p.locator('[data-zoek-palet="open"]').waitFor({ timeout: 5000 });
        await p.keyboard.type(q, { delay: 25 });
        await p.waitForFunction(() => /Знайдено|Нічого не знайдено/.test(document.querySelector('[data-zoek-palet="open"] [data-zoek-menu-stand]')?.textContent || ''), undefined, { timeout: 10000 }).catch(() => undefined);
        await p.waitForTimeout(300);
      };
      await zoek('Хмарне сховище');
      const hmaraRij = p.locator('[data-zoek-palet="open"] [role="option"]').filter({ hasText: /Хмарне сховище/ }).filter({ hasText: /Меню ·/ }).first();
      const gevonden = await hmaraRij.count() === 1;
      await foto(p, 'zichtbaarheid-zoeken-computer');
      check('E: прихований розділ знаходиться пошуком (Ctrl+K → «Хмарне сховище» → результат «Меню»)', gevonden, (await p.locator('[data-zoek-palet="open"]').innerText().catch(() => '')).replace(/\n/g, ' / ').slice(0, 200));
      if (gevonden) {
        await hmaraRij.click();
        const naar = await p.waitForURL(/cloud\.tarasevych\.com/, { timeout: 20000 }).then(() => true).catch(() => false);
        // Поки людина всередині прихованого розділу, меню показує його як поточний (CanoniekOmlijsting: !pref.visible&&!parentActive) —
        // так задумано, щоб не загубитися; поза ним пункту немає (перевірено вище й нижче).
        await p.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 }).catch(() => undefined);
        check('E: вибір результату відкриває прихований розділ (cloud.tarasevych.com); усередині він показаний як поточний', naar && (await p.locator('.canonical-sidebar [data-service-group="cloud"]').count()) > 0, p.url());
        await foto(p, 'zichtbaarheid-verborgen-via-zoeken-computer');
        await p.goto(`${ID}/menu?lang=uk`, { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
      }
      await zoek('Налаштувати меню');
      const instRij = p.locator('[data-zoek-palet="open"] [role="option"]').filter({ hasText: /^\s*Налаштувати меню/ }).filter({ hasText: /Сторінка ·/ }).first();
      check('E: налаштування меню знаходиться пошуком («Налаштувати меню» → сторінка «Налаштування › Меню»)', await instRij.count() === 1);
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      // три режими × чотири положення
      const zichtbaar = (page: Page) => page.evaluate(() => {
        const knoppen = Array.from(document.querySelectorAll<HTMLElement>('.canonical-sidebar [data-service-group] > .canonical-service-main-row > .canonical-service-button, .canonical-sidebar [data-service-group] > button')).filter((b) => b.getBoundingClientRect().width > 0);
        // bedekt: у центрі піктограми лежить чужий елемент (поле пошуку, шапка тощо) — піктограму не видно, хоч вона «є».
        const iconen = knoppen.map((b) => { const s2 = b.querySelector('svg'); const r = s2?.getBoundingClientRect(); const top = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null; return { cls: String(s2?.getAttribute('class') || ''), w: Math.round(r?.width || 0), binnen: !!r && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, bedekt: !top || !(b.contains(top) || top.contains(b)) }; });
        return { n: knoppen.length, uniek: new Set(iconen.map((i) => i.cls)).size, klein: iconen.filter((i) => i.w < 14).length, buiten: iconen.filter((i) => !i.binnen).length, bedekt: iconen.filter((i) => i.bedekt).map((i) => i.cls.replace(/lucide|menu-lucide-glyph/g, '').trim()), dock: document.querySelector('main')?.getAttribute('data-dock'), modus: document.querySelector('main')?.getAttribute('data-zijbalk-modus'), cloud: document.querySelectorAll('.canonical-sidebar [data-service-group="cloud"]').length };
      });
      const combis: string[] = [];
      for (const modus of ['auto', 'open', 'dicht'] as const) {
        await openBlok(p, '#menu-modus [data-zijbalk-modus-keuze]');
        await p.locator(`#menu-modus input[name="zijbalk-modus"][value="${modus}"]`).check({ force: true }); await p.waitForTimeout(300);
        for (const positie of ['links', 'rechts', 'boven', 'onder'] as const) {
          await openBlok(p, `#menu-indeling label[data-dock-positie="${positie}"]`);
          await p.locator(`#menu-indeling label[data-dock-positie="${positie}"]`).click(); await p.waitForTimeout(500);
          await p.mouse.move(640, 450); await p.waitForTimeout(300);
          const z = await zichtbaar(p);
          const ok = z.n >= 4 && z.uniek === z.n && z.klein === 0 && z.buiten === 0 && z.bedekt.length === 0 && z.cloud === 0 && z.dock === positie;
          if (!ok) combis.push(`${modus}/${positie}: ${JSON.stringify(z)}`);
          if (modus === 'open' || (modus === 'dicht' && positie === 'links')) await foto(p, `iconen-${modus}-${positie}-computer`);
        }
      }
      check('E: 3 режими × 4 положення — у кожному піктограми видимі (≥ 14 px, у межах екрана, нічим не закриті), усі різні, прихований пункт відсутній', combis.length === 0, combis.slice(0, 4).join(' | '));
      // назад: ліворуч, автоматично
      await p.locator('#menu-indeling label[data-dock-positie="links"]').click(); await p.waitForTimeout(300);
      await openBlok(p, '#menu-modus [data-zijbalk-modus-keuze]');
      await p.locator('#menu-modus input[name="zijbalk-modus"][value="auto"]').check({ force: true }); await p.waitForTimeout(300);
      await sluit(V.ctx);
      // новий вхід (телефон): приховане лишилося прихованим, піктограма — та сама; інший обліковий запис не зачеплено
      {
        const t = await open(O, `${ID}/menu?lang=uk#menu-zichtbaarheid`, { width: 380, height: 800, touch: true });
        await t.page.locator('[data-sidebar-action="open-drawer"]').tap(); await t.page.waitForTimeout(500);
        check('E: новий вхід (телефон) — «Хмарне сховище» прихований, «Пошта» з ключем', (await t.page.locator('.canonical-sidebar [data-service-group="cloud"], .canonical-drawer [data-service-group="cloud"]').count()) === 0 && /key/.test(String(await icoonVan(t.page, 'mail'))), String(await icoonVan(t.page, 'mail')));
        await foto(t.page, 'iconen-lade-telefoon');
        await t.page.locator('.canonical-drawer-close').tap().catch(() => undefined); await t.page.waitForTimeout(300);
        // повернути: показати «Хмарне сховище» і стандартну піктограму
        await openBlok(t.page, '#menu-zichtbaarheid .settings-menu-editor');
        const h2 = t.page.locator('#menu-zichtbaarheid .settings-menu-editor article', { has: t.page.locator('strong', { hasText: 'Хмарне сховище' }) }).first();
        await h2.locator('button').tap(); await t.page.waitForTimeout(300);
        await t.page.locator('#menu-zichtbaarheid .settings-menu-editor article', { has: t.page.locator('strong', { hasText: 'Пошта' }) }).first().locator('select').selectOption('mail');
        await t.page.locator('#menu-zichtbaarheid .settings-menu-editor button.settings-primary').tap(); await t.page.waitForTimeout(1200);
        check('E: повернуто — «Хмарне сховище» знову «Видимий»', /Видимий/.test(await h2.innerText()), await h2.innerText());
        check('E: телефон 380 — налаштування без горизонтальної прокрутки', (await horizontaal(t.page)) <= 0, String(await horizontaal(t.page)));
        await foto(t.page, 'zichtbaarheid-telefoon');
        await sluit(t.ctx);
        const h = await open(O, `${HUB}/?lang=uk`, { width: 1280, height: 860 });
        check('E: після повернення (інший піддомен) — «Хмарне сховище» знову в меню', (await h.page.locator('.canonical-sidebar [data-service-group="cloud"]').count()) > 0);
        await sluit(h.ctx);
      }
      // не-власник: обов'язковий пункт теж заблоковано
      {
        const x = await open(B, `${ID}/menu?lang=uk#menu-zichtbaarheid`, { width: 380, height: 800, touch: true });
        await openBlok(x.page, '#menu-zichtbaarheid .settings-menu-editor');
        const a2 = x.page.locator('#menu-zichtbaarheid .settings-menu-editor article', { has: x.page.locator('strong', { hasText: 'Налаштування' }) }).first();
        check('E: звичайний обліковий запис — «Налаштування» теж заблоковано з поясненням', await a2.locator('button').isDisabled() && /Завжди видимий/.test(await a2.innerText()));
        check('E: звичайний обліковий запис — його меню не зачеплено (Хмара на місці)', !/Прихований/.test(await x.page.locator('#menu-zichtbaarheid .settings-menu-editor article', { has: x.page.locator('strong', { hasText: 'Хмарне сховище' }) }).first().innerText()));
        await a2.scrollIntoViewIfNeeded();
        await foto(x.page, 'verplicht-ander-account-telefoon');
        await sluit(x.ctx);
      }
    }
  } catch (e) {
    check('неочікувана помилка', false, String((e as Error)?.stack || e).slice(0, 1500));
  } finally {
    await browser.close().catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [emails]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) {
      await pool.query("delete from app.records where tbl='site_notifications' and data->>'recipientUserId' = any($1)", [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    }
    await stop();
  }
  check('без помилок у консолі й HTTP', fouten.length === 0, fouten.slice(0, 8).join(' | '));
  void tekstOp;
  return einde();
}
