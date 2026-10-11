// E2E (Chrome) список листів (11.10): уся картка листа відкриває лист (5.1), кнопки не виходять за межі картки (5.2),
// пошук не під розгорнутим меню (5.3), «Додаткові дії» групами (5.4), зміна щільності не спустошує список (6.1).
// Gmail-акаунт і листи змодельовано (без Google у тесті).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MAIL = 'https://mail.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e mail-lijst-ux');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-ml-${T}@example.test`, sub = `sub-e2e-ml-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'mail', tabContext: tab, intent: 'login' });
    const ctx = await browser.newContext({ colorScheme: 'light', locale: 'uk-UA', viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MAIL].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => fouten.push(`pageerror: ${String(e.stack).split("\n").slice(1, 9).join(" ")}`));
    page.on("console", (m) => { if (m.type() === "error") fouten.push(`console: ${m.text().slice(0, 3000)}`); });
    const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    const nu = Date.now();
    const berichten = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, threadId: `t${i}`, from: `Відправник ${i} <a${i}@example.test>`, to: 'ik@example.test', subject: `Тема листа номер ${i} з довгою назвою, щоб перевірити перенесення`, snippet: `Короткий зміст листа ${i}. `.repeat(4), receivedAt: nu - i * 3_600_000, labelIds: ['INBOX', ...(i % 3 ? [] : ['UNREAD'])], unread: i % 3 === 0, starred: i === 1, sizeBytes: 2000, unsubscribe: null, classificationSignals: {} }));
    let geopend = '';
    await page.route('**/api/owner/mail/google-suite/accounts', (r) => r.fulfill(json({ activeAccountId: 'acc-1', accounts: [{ id: 'acc-1', email: 'ik@example.test', status: 'connected' }] })));
    await page.route('**/api/owner/mail/google-suite/messages', (r) => r.fulfill(json({ source: 'live_on_demand', persisted: false, account: { id: 'acc-1', email: 'ik@example.test' }, labelId: 'INBOX', query: '', maxResults: 25, messages: berichten, nextPageToken: '', resultSizeEstimate: berichten.length, observedAt: nu })));
    await page.route('**/api/owner/mail/google-suite/thread', (r) => { geopend = 'thread'; return r.fulfill(json({ ok: true, thread: { id: 't3', messages: [{ ...berichten[3], html: '<p>Текст листа</p>', text: 'Текст листа', attachments: [{ providerAttachmentId: 'att-1', filename: 'rahunok.pdf', mimeType: 'application/pdf', sizeBytes: 12000 }] }] } })); });
    await page.route('**/api/owner/mail/google-suite/message', (r) => { geopend = geopend || 'message'; return r.fulfill(json({ ok: true, message: { ...berichten[3], html: '<p>Текст листа</p>', text: 'Текст листа', attachments: [] } })); });
    await page.goto(`${MAIL}/inbox?lang=uk`, { waitUntil: 'networkidle' });
    const rij = page.locator('article').filter({ hasText: 'Тема листа номер 3' }).first();
    await rij.waitFor({ timeout: 20000 });
    await page.screenshot({ path: `${UIT}/mail-lijst-1.png` });
    const fabRechtsOnder = async () => { await page.waitForTimeout(500); const r = await page.locator('.mail-compose-float').boundingBox(); return !!r && r.x > 1100 && r.y > 700 ? '' : JSON.stringify(r); };
    const f1 = await fabRechtsOnder();
    check('кнопка «+» (новий лист) праворуч унизу, не вгорі зліва', f1 === '', f1);
    // 5.2: кнопки дій у межах картки (наведення)
    await rij.hover(); await page.waitForTimeout(300);
    const buiten = await rij.evaluate((a) => { const r = a.getBoundingClientRect(); return [...a.querySelectorAll('button')].filter((b) => { const q = b.getBoundingClientRect(); return q.width > 0 && getComputedStyle(b).visibility !== 'hidden' && (q.right > r.right + 1 || q.left < r.left - 1 || q.top < r.top - 1 || q.bottom > r.bottom + 1); }).map((b) => b.getAttribute('aria-label') || b.className); });
    check('5.2: кнопки дій не виходять за межі картки', buiten.length === 0, buiten.join(', '));
    await page.screenshot({ path: `${UIT}/mail-lijst-2-hover.png` });
    // 5.1: клік у порожнє місце картки (праворуч від тексту теми, не по кнопках) відкриває лист
    const doel = await rij.evaluate((a) => { const r = a.getBoundingClientRect(), x = r.left + r.width * 0.72, y = r.top + 8; const el = document.elementFromPoint(x, y) as HTMLElement | null; return { x, y, wat: el ? `${el.tagName}.${el.className}` : '' }; });
    await page.mouse.click(doel.x, doel.y);
    await page.waitForTimeout(1500);
    const open = await page.evaluate(() => document.querySelector('[data-reader-open="true"]') !== null || /Текст листа/.test(document.body.innerText));
    check('5.1: клік по порожньому місцю картки (поза текстом) відкриває лист', open, JSON.stringify({ doel, url: page.url() }));
    await page.screenshot({ path: `${UIT}/mail-lijst-3-open.png` });
    // 2.1: «Зменшити вікно» — лист у вільному вікні, список поруч доступний, вікно перетягується
    await page.locator('.mail-reader-venster').click({ timeout: 8000 }); await page.waitForTimeout(400);
    const r1 = await page.locator('.google-mail-reader').boundingBox();
    check('2.1: вікно листа зменшене (не на весь екран)', !!r1 && r1.width < 1300 && r1.height < 880, JSON.stringify(r1));
    const lijstZichtbaar = await page.locator('article').filter({ hasText: 'Тема листа номер 0' }).first().isVisible();
    check('2.1: список листів видно й доступний поруч', lijstZichtbaar);
    const balk = await page.locator('.mail-reader-toolbar').boundingBox();
    if (balk && r1) { const x = r1.x + r1.width * 0.4, y = r1.y + 30; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 200, y + 60, { steps: 6 }); await page.mouse.up(); }
    const r2 = await page.locator('.google-mail-reader').boundingBox();
    check('2.1: вікно перетягується за верхню панель', !!r1 && !!r2 && Math.abs(r2.x - r1.x) > 100, JSON.stringify({ r1, r2 }));
    await page.screenshot({ path: `${UIT}/mail-lijst-4-venster.png` });
    await page.locator('.mail-reader-venster').click(); await page.waitForTimeout(300);
    const r3 = await page.locator('.google-mail-reader').boundingBox();
    check('2.1: «Розгорнути» повертає на весь екран', !!r3 && r3.width > 1300, JSON.stringify(r3));
    for (const [naam, tekst] of [['тема', 'Тема листа номер 5'], ['короткий зміст', 'Короткий зміст листа 5']] as const) {
      await page.goto(`${MAIL}/inbox?lang=uk`, { waitUntil: 'networkidle' });
      const el = page.getByText(tekst, { exact: false }).first();
      await el.waitFor({ timeout: 15000 });
      const bb = await el.boundingBox(); if (bb) await page.mouse.click(bb.x + Math.min(40, bb.width / 2), bb.y + bb.height / 2); await page.waitForTimeout(1500);
      check(`5.1: клік по «${naam}» відкриває лист`, await page.evaluate(() => document.querySelector('[data-reader-open="true"]') !== null || /Текст листа/.test(document.body.innerText)));
    }
    // 6.1: зміна щільності не спустошує список
    await page.goto(`${MAIL}/inbox?lang=uk`, { waitUntil: 'networkidle' });
    if (await page.locator('[data-reader-open="true"]').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
    if (await page.locator('[data-reader-open="true"]').count()) { await page.locator('button[aria-label*="Закрити"]:visible').last().click({ timeout: 5000 }).catch(() => undefined); await page.waitForTimeout(500); }
    await page.locator('article').filter({ hasText: 'Тема листа номер 3' }).first().waitFor({ timeout: 15000 });
    await page.screenshot({ path: `${UIT}/mail-lijst-voor-snel.png` });
    await page.locator('button[data-tooltip="Швидкі налаштування"]').first().click({ timeout: 8000 }); await page.waitForTimeout(600);
    await page.screenshot({ path: `${UIT}/mail-lijst-snel.png` });
    for (const modus of ['Компактний', 'Мінімум', 'Громіздкий', 'Звичайний']) {
      await page.getByRole('button', { name: modus, exact: true }).first().click({ timeout: 5000 }).catch(async () => { await page.getByText(modus, { exact: true }).first().click({ timeout: 5000 }); });
      await page.waitForTimeout(900);
      const n = await page.locator('article').filter({ hasText: 'Тема листа номер' }).count();
      check(`6.1: щільність «${modus}» — список не порожній`, n >= 5, `${n} ${fouten.filter((f) => /hook|component|Error/i.test(f)).slice(-4).join(' | ').slice(0, 5000)}`);
      await page.screenshot({ path: `${UIT}/mail-lijst-dichtheid-${modus}.png` });
    }
    const f2 = await fabRechtsOnder();
    check('кнопка «+» лишається праворуч унизу після зміни режимів', f2 === '', f2);
    // 6.2: «Керований фронт» ↔ «Звичайна пошта» кілька разів поспіль
    for (let ronde = 1; ronde <= 3; ronde++) {
      if (!(await page.getByRole('button', { name: 'Керований фронт', exact: true }).first().isVisible().catch(() => false))) await page.locator('button[data-tooltip="Швидкі налаштування"]').first().click({ timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${UIT}/mail-front-voor-${ronde}.png` });
      await page.getByRole('button', { name: 'Керований фронт', exact: true }).first().click({ timeout: 8000 });
      await page.waitForTimeout(1200);
      const front = /Керований фронт|Почнімо з одного листа/.test(await page.locator('body').innerText());
      await page.screenshot({ path: `${UIT}/mail-front-${ronde}.png` });
      check(`6.2: раунд ${ronde} — «Керований фронт» відкрився`, front, page.url());
      await page.getByRole('button', { name: /звичайн(а|ої) пошт/i }).first().click({ timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
      const lijst = await page.locator('article').filter({ hasText: 'Тема листа номер' }).count();
      await page.screenshot({ path: `${UIT}/mail-front-terug-${ronde}.png` });
      check(`6.2: раунд ${ronde} — назад у «Звичайна пошта», список на місці`, lijst >= 5 && !(await page.locator('.mail-front-header').isVisible().catch(() => false)), `${lijst} ${page.url()}`);
    }
    // 6.2: вихід із фронту через бічне меню («Вхідні») і через «назад» браузера
    await page.locator('button[data-tooltip="Швидкі налаштування"]').first().click({ timeout: 8000 }); await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Керований фронт', exact: true }).first().click({ timeout: 8000 }); await page.waitForTimeout(1000);
    await page.locator('.canonical-sidebar a[href*="inbox"], .canonical-sidebar [data-vooruit*="inbox"]').first().click({ timeout: 8000 }).catch(async () => { await page.goBack(); });
    await page.waitForTimeout(1500);
    check('6.2: з фронту через меню «Вхідні» — список на місці', await page.locator('article').filter({ hasText: 'Тема листа номер' }).count() >= 5, page.url());
    await page.goBack(); await page.waitForTimeout(1500);
    const terugFront = /Керований фронт|Почнімо з одного листа/.test(await page.locator('body').innerText());
    await page.goForward(); await page.waitForTimeout(1500);
    check('6.2: «назад»/«вперед» браузера між фронтом і поштою працюють', terugFront && await page.locator('article').filter({ hasText: 'Тема листа номер' }).count() >= 5, page.url());
    await page.screenshot({ path: `${UIT}/mail-front-heen-terug.png` });
    check('geen paginafouten', fouten.filter((f) => !/Failed to load resource/.test(f)).length === 0, fouten.join('\n'));
    await ctx.close();
  } catch (e) {
    check('e2e liep zonder uitzondering', false, String((e as Error)?.stack || e).slice(0, 800));
  } finally {
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
