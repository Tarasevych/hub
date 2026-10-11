// E2E (Chrome) venster «Новий лист» (10.10): knoppen _ □ × zoals in Windows, compacte velden (Копія/прихована op de regel
// «Кому»), invoerhulpen ingeklapt, «Показати весь текст» in de hoek van de editor, minimaliseren → in de gezamenlijke stapel
// «Згорнуті» of als plashka; × sluit zonder plashka (concept blijft). Gmail-account en concept-API gesimuleerd (geen Google in de test).
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const AXE = process.env.AXE_CORE || join(dirname(PW), 'axe-core', 'axe.min.js');
const ID = 'https://id.tarasevych.com', MAIL = 'https://mail.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e mail-compose-venster');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-mc-${T}@example.test`, sub = `sub-e2e-mc-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'mail', tabContext: tab, intent: 'login' });
    const ctx = await browser.newContext({ colorScheme: 'light', locale: 'uk-UA', viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MAIL].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); try { localStorage.removeItem('mail-draft-active-id'); } catch { /* */ } }, tab);
    const page = await ctx.newPage();
    const opgeslagen: string[] = [];
    const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    await page.route('**/api/owner/mail/google-suite/accounts', (r) => r.fulfill(json({ activeAccountId: 'acc-1', accounts: [{ id: 'acc-1', email: 'ik@example.test', status: 'connected' }] })));
    await page.route('**/api/owner/mail/compose/draft/save', (r) => { opgeslagen.push(r.request().postData() || ''); return r.fulfill(json({ ok: true, draft: { localId: 'x', syncStatus: 'synced' } })); });
    await page.route('**/api/owner/mail/compose/draft/list', (r) => r.fulfill(json({ ok: true, drafts: [] })));
    await page.route('**/api/owner/mail/compose/draft/get', (r) => r.fulfill(json({ ok: true, draft: null })));
    await page.goto(`${MAIL}/inbox?lang=uk`, { waitUntil: 'networkidle' });
    const pen = page.locator('.mail-compose-pill');
    await pen.waitFor({ timeout: 20000 });
    await page.waitForFunction(() => !(document.querySelector('.mail-compose-pill') as HTMLButtonElement)?.disabled, null, { timeout: 15000 });
    await pen.click();
    const dlg = page.locator('section.mail-new-message');
    await dlg.waitFor({ timeout: 5000 });
    check('kop: drie vensterknoppen _ □ × (zoals Windows)', await dlg.locator('[data-nm-minimaliseer]').count() === 1 && await dlg.locator('[data-nm-maximaliseer]').count() === 1 && await dlg.locator('[data-nm-sluit]').count() === 1);
    check('compact: geen Cc/Bcc-regels; «Копія / прихована» op de regel «Кому»', await dlg.locator('input:not([type=file])').evaluateAll((els) => els.length) <= 3 && await dlg.locator('.mail-nm-aan [data-nm-kopie]').isVisible());
    check('invoerhulpen (UA/NL, трансліт…) standaard ingeklapt; knop «Введення» klapt ze uit', !(await dlg.getByText('Трансліт').isVisible().catch(() => false)));
    await dlg.locator('[data-nm-hulpen]').click();
    check('… en weer zichtbaar na de knop', await dlg.getByText('Трансліт').isVisible());
    await dlg.locator('[data-nm-hulpen]').click();
    await dlg.locator('#mail-nm-aan').fill('jan@example.test');
    await dlg.locator('.mail-new-message-field input').last().fill('Тест вікна');
    await dlg.locator('.ProseMirror').click();
    await page.keyboard.insertText('Рядок тексту. '.repeat(400));
    await page.waitForTimeout(1200);
    check('concept stil bewaard (draft/save met tekst)', opgeslagen.length > 0 && /Рядок тексту/.test(opgeslagen[opgeslagen.length - 1]));
    const h0 = await dlg.evaluate((e) => e.getBoundingClientRect().height);
    await dlg.locator('[data-nm-maximaliseer]').click(); await page.waitForTimeout(250);
    const g = await dlg.evaluate((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, kl: e.className }; });
    check('□ = op het hele scherm (bijna volledige breedte en hoogte)', /groot/.test(g.kl) && g.w > 1300 && g.h > 850, JSON.stringify(g));
    await page.screenshot({ path: `${UIT}/mail-compose-1-groot.png` });
    await dlg.locator('[data-nm-maximaliseer]').click(); await page.waitForTimeout(250);
    check('□ nog eens = vorige grootte', !/groot/.test(await dlg.getAttribute('class') || '') && Math.abs((await dlg.evaluate((e) => e.getBoundingClientRect().height)) - h0) < 30);
    const canvasVoor = await dlg.locator('.mail-compose-canvas').evaluate((e) => ({ scroll: e.scrollHeight > e.clientHeight + 2 }));
    await dlg.locator('[data-nm-heel-tekst]').click(); await page.waitForTimeout(250);
    const canvasNa = await dlg.evaluate((e) => { const c = e.querySelector('.mail-compose-canvas') as HTMLElement; return { binnen: c.scrollHeight > c.clientHeight + 2, venster: e.scrollHeight > e.clientHeight + 2 }; });
    check('hoekknop: «Показати весь текст» — editor zonder eigen schuifbalk, het venster scrolt', canvasVoor.scroll && !canvasNa.binnen && canvasNa.venster, `${JSON.stringify(canvasVoor)} → ${JSON.stringify(canvasNa)}`);
    await page.screenshot({ path: `${UIT}/mail-compose-2-heel.png` });
    const axeV = await axe(page, 'section.mail-new-message');
    check('axe venster: geen schendingen', axeV.length === 0, axeV.join('\n'));
    await dlg.locator('[data-nm-heel-tekst]').click();
    // _ → in de stapel «Згорнуті» (of eigen plashka als er geen stapel is)
    await dlg.locator('[data-nm-minimaliseer]').click(); await page.waitForTimeout(400);
    const stapel = page.locator('.mail-minimized-viewer'), dok = page.locator('[data-concept-dok]');
    const inStapel = await stapel.count() > 0, eigenDok = await dok.count() > 0;
    check('_ = geminimaliseerd: één plek (stapel «Згорнуті» of plashka), met de titel', (inStapel || eigenDok) && !(inStapel && eigenDok) && /Тест вікна/.test(await (inStapel ? stapel : dok).innerText()), `${inStapel}/${eigenDok}`);
    await page.screenshot({ path: `${UIT}/mail-compose-3-geminimaliseerd.png` });
    // zijbalk «automatisch» bleef open van de klik op «Написати лист»: de muis er even over en weer af
    await page.mouse.move(120, 400); await page.waitForTimeout(150); await page.mouse.move(900, 500); await page.waitForTimeout(500);
    await (inStapel ? stapel : dok.locator('button').first()).click(); await page.waitForTimeout(300);
    if (inStapel && !(await dlg.isVisible())) await stapel.locator('button[aria-label="Розгорнути перегляд"]').click().catch(() => undefined);
    await dlg.waitFor({ timeout: 4000 });
    check('terughalen: venster weer open met dezelfde tekst', /Тест вікна/.test(await dlg.locator('[data-nm-kop-kort]').innerText().catch(() => '') || await dlg.locator('.mail-new-message-field input').last().inputValue().catch(() => '')));
    await dlg.locator('[data-nm-sluit]').click(); await page.waitForTimeout(400);
    check('× = sluiten zonder plashka (concept blijft in «Чернетки»)', await page.locator('[data-concept-dok]').count() === 0 && !(await page.locator('.mail-minimized-viewer').innerText().catch(() => '')).includes('Тест вікна'));
    await ctx.close();

    // ---- heropenen van een bewaard concept (van de server / ander toestel): de blokken komen terug als blokken
    const html = '<div style="font-family:Arial,sans-serif;font-size:16px;background-color:#ffffff;padding:24px"><p style="margin:0 0 12px">привіт <strong>жирним</strong></p>'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-mail-block="header" data-bg="#eff6ff"><tr><td style="background-color:#eff6ff;padding:18px;border-radius:9px"><p style="text-align:center">Tarasevych Mail</p></td></tr></table>'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-mail-block="callout" data-kind="info" data-bg="#eef6ff"><tr><td style="background-color:#eef6ff;padding:14px 16px"><p>Головний акцент</p></td></tr></table>'
      + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" data-mail-block="button" data-url="https://example.com/" data-text="Детальніше" data-bg="#2563eb" data-fg="#ffffff" data-align="left"><tr><td><a href="https://example.com/" style="display:inline-block;padding:12px 18px;background-color:#2563eb;color:#ffffff">Детальніше</a></td></tr></table>'
      + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-mail-block="footer" data-bg="#f8fafc"><tr><td style="background-color:#f8fafc;padding:18px"><p style="text-align:center">Дякуємо за увагу.</p></td></tr></table></div>';
    const ctx2 = await browser.newContext({ colorScheme: 'light', locale: 'uk-UA', viewport: { width: 1400, height: 900 }, serviceWorkers: 'block' });
    await ctx2.addCookies([...b.jar].flatMap(([name, value]) => [ID, MAIL].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx2.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const p2 = await ctx2.newPage();
    const opgeslagen2: string[] = [];
    await p2.route('**/api/owner/mail/google-suite/accounts', (r) => r.fulfill(json({ activeAccountId: 'acc-1', accounts: [{ id: 'acc-1', email: 'ik@example.test', status: 'connected' }] })));
    await p2.route('**/api/owner/mail/compose/draft/list', (r) => r.fulfill(json({ ok: true, drafts: [{ localId: 'concept-van-pc-01', to: 'jan@example.test', subject: 'Тест 1', syncStatus: 'synced', updatedAt: Date.now() - 60000 }] })));
    await p2.route('**/api/owner/mail/compose/draft/get', (r) => r.fulfill(json({ ok: true, draft: { localId: 'concept-van-pc-01', to: 'jan@example.test', cc: '', bcc: '', subject: 'Тест 1', html, syncStatus: 'synced' } })));
    await p2.route('**/api/owner/mail/compose/draft/save', (r) => { opgeslagen2.push(r.request().postData() || ''); return r.fulfill(json({ ok: true, draft: { localId: 'concept-van-pc-01', syncStatus: 'synced' } })); });
    await p2.goto(`${MAIL}/inbox?lang=uk`, { waitUntil: 'networkidle' });
    await p2.mouse.move(900, 500); await p2.waitForTimeout(800);
    // 1.6: «Написати лист» = завжди чистий лист, навіть коли на сервері є свіжа чернетка
    await p2.waitForFunction(() => !(document.querySelector('.mail-compose-pill') as HTMLButtonElement)?.disabled, null, { timeout: 15000 });
    await p2.locator('.mail-compose-pill').click();
    const dlg2 = p2.locator('section.mail-new-message');
    await dlg2.waitFor({ timeout: 8000 });
    await p2.waitForTimeout(1200);
    check('«Написати лист» відкриває чистий лист (не останню чернетку)', (await dlg2.locator('#mail-nm-aan').inputValue()) === '' && !/Tarasevych Mail/.test(await dlg2.locator('.ProseMirror').innerText()));
    await dlg2.locator('[data-nm-sluit]').click(); await p2.waitForTimeout(300);
    // чернетку відкривають явно (з «Чернеток»)
    await p2.evaluate(() => window.dispatchEvent(new CustomEvent('mail:open-concept', { detail: { localId: 'concept-van-pc-01' } })));
    const ed = p2.locator('section.mail-new-message .ProseMirror');
    await ed.waitFor({ timeout: 5000 });
    const blokken = await ed.evaluate((e) => ({ kop: !!e.querySelector('header.mail-pm-email-header'), accent: !!e.querySelector('.mail-pm-callout'), knop: !!e.querySelector('a[data-mail-block=button]'), voet: !!e.querySelector('footer.mail-pm-email-footer'), tabellen: e.querySelectorAll('table').length }));
    check('heropend concept: kopblok, accentblok, knop en voettekst zijn weer echte blokken (geen kale tekst, geen losse tabellen)', blokken.kop && blokken.accent && blokken.knop && blokken.voet && blokken.tabellen === 0, JSON.stringify(blokken));
    const voet = await ed.evaluate((e) => { const p = e.querySelector('footer p') as HTMLElement, r = p.getBoundingClientRect(), f = (e.querySelector('footer') as HTMLElement).getBoundingClientRect(); return { fs: parseFloat(getComputedStyle(p).fontSize), midden: Math.abs((r.left + r.right) / 2 - (f.left + f.right) / 2) < 30 }; });
    check('voettekst: normale lettergrootte en gecentreerd (de site-regel voor <footer> lekt niet meer in de editor)', voet.fs >= 15 && voet.midden, JSON.stringify(voet));
    await ed.click(); await p2.keyboard.press('End'); await p2.keyboard.insertText(' ще'); await p2.waitForTimeout(1300);
    const laatste = opgeslagen2[opgeslagen2.length - 1] || '';
    check('na een wijziging weer bewaard mét blokmarkeringen en inline opmaak (zoals Gmail het nodig heeft)', /data-mail-block=\\"callout\\"/.test(laatste) && /data-mail-block=\\"header\\"/.test(laatste) && /border-radius:9px/.test(laatste), laatste.slice(0, 300));
    await p2.screenshot({ path: `${UIT}/mail-compose-4-heropend.png` });
    // 1.7: 10 шаблонів, кожен вставляється як справжні блоки
    const meer = p2.locator('section.mail-new-message .mail-compose-more > button');
    await meer.click(); await p2.waitForTimeout(200);
    const namen = await p2.locator('.mail-compose-more-menu .mail-sjabloon-item span').allInnerTexts();
    check('1.7: 10 шаблонів з описом', namen.length === 10, namen.join(', '));
    await p2.locator('.mail-compose-more-menu .mail-sjabloon-item', { hasText: 'Пропозиція співпраці' }).click(); await p2.waitForTimeout(300);
    const sj = await ed.evaluate((e) => ({ kop: e.querySelectorAll('header.mail-pm-email-header').length, kol: e.querySelectorAll('.mail-pm-columns').length, knop: e.querySelectorAll('a[data-mail-block=button]').length, a: [...e.querySelectorAll('a')].map((x) => x.outerHTML.slice(0, 120) + ' @' + (x.parentElement?.closest('[class]')?.className || '')) }));
    check('1.7: шаблон «Пропозиція співпраці» — шапка, колонки, кнопка як блоки', sj.kol >= 1 && sj.knop >= 2, JSON.stringify(sj));
    await p2.screenshot({ path: `${UIT}/mail-compose-5-sjabloon.png` });
    // 1.3: вставка з вебсторінки зберігає таблицю, код і цитату
    await ed.click(); await p2.keyboard.press('Control+End');
    await ed.evaluate((e) => { const dt = new DataTransfer(); dt.setData('text/html', '<h2>Звіт</h2><table><thead><tr><th>Назва</th><th>Сума</th></tr></thead><tbody><tr><td>Хостинг</td><td>12 €</td></tr><tr><td>Домен</td><td>9 €</td></tr></tbody></table><pre><code>npm run build\n  echo ok</code></pre><blockquote><p>Цитата з сайту</p></blockquote><ul><li>пункт 1</li><li>пункт 2</li></ul>'); dt.setData('text/plain', 'Звіт'); e.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
    await p2.waitForTimeout(400);
    const plak = await ed.evaluate((e) => ({ tabel: e.querySelectorAll('table td, table th').length, code: e.querySelector('pre')?.textContent || '', quote: !!e.querySelector('blockquote, .mail-pm-callout'), lijst: e.querySelectorAll('li').length }));
    check('1.3: вставлений HTML — таблиця з комірками, код зі збереженими рядками, цитата, список', plak.tabel >= 6 && /npm run build\n {2}echo ok/.test(plak.code) && plak.quote && plak.lijst >= 2, JSON.stringify(plak));
    await p2.screenshot({ path: `${UIT}/mail-compose-6-plakken.png` });
    // 3.1: Google Диск — список файлів, клік вставляє посилання
    await p2.route('**/api/owner/cloud/google-suite/drive/browse', (r) => r.fulfill(json({ files: [{ id: 'f1', name: 'Кошторис.xlsx', mimeType: 'application/vnd.ms-excel', folder: false, modifiedAt: 0 }, { id: 'd1', name: 'Проєкти', mimeType: 'application/vnd.google-apps.folder', folder: true, modifiedAt: 0 }] })));
    await p2.reload({ waitUntil: 'networkidle' });
    await p2.evaluate(() => window.dispatchEvent(new CustomEvent('mail:open-concept', { detail: { localId: 'concept-van-pc-01' } })));
    await p2.locator('section.mail-new-message [data-nm-disk]').waitFor({ timeout: 8000 });
    await p2.waitForTimeout(500);
    check('3.1: кнопка Диска активна (Диск підключено)', (await p2.locator('.mail-disk').getAttribute('data-disk-stand')) === 'ok');
    await p2.locator('[data-nm-disk]').click(); await p2.waitForTimeout(300);
    await p2.locator('.mail-disk-paneel button', { hasText: 'Кошторис.xlsx' }).click(); await p2.waitForTimeout(300);
    check('3.1: у лист вставлено посилання на файл Диска', await p2.locator('section.mail-new-message .ProseMirror a[href*="drive.google.com/open?id=f1"]').count() === 1);
    await p2.route('**/api/owner/cloud/google-suite/drive/file', (r) => r.fulfill(json({ name: 'Кошторис.xlsx', mimeType: 'application/vnd.ms-excel', sizeBytes: 4, data: 'dGVzdA==' })));
    await p2.locator('[data-nm-disk]').click(); await p2.waitForTimeout(300);
    await p2.locator('.mail-disk-paneel [data-disk-vk]').first().click(); await p2.waitForTimeout(500);
    check('3.1: 📎 вкладає сам файл із Диска', /Кошторис\.xlsx/.test(await p2.locator('section.mail-new-message .mail-nm-bijlagen').innerText().catch(() => '')));
    // 3.2: «Переслати це вкладення» → новий лист із файлом; вкладення йде разом із листом
    const verzonden: string[] = [];
    await p2.route('**/api/owner/mail/compose/send', (r) => { verzonden.push(r.request().postData() || ''); return r.fulfill(json({ item: { id: 'q1', status: 'sent' } })); });
    await p2.evaluate(() => window.dispatchEvent(new CustomEvent('mail:compose-with-attachment', { detail: { blob: new Blob(['%PDF-1.4 test'], { type: 'application/pdf' }), filename: 'rahunok.pdf', contentType: 'application/pdf', subject: 'Рахунок' } })));
    await p2.waitForTimeout(600);
    const dlg3 = p2.locator('section.mail-new-message');
    check('3.2: новий лист із вкладенням «rahunok.pdf» і темою «Fwd: Рахунок»', /rahunok\.pdf/.test(await dlg3.locator('.mail-nm-bijlagen').innerText().catch(() => '')) && /Fwd: Рахунок/.test((await dlg3.innerText()) + (await dlg3.locator('input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).join(' ')))), (await dlg3.innerText().catch(() => 'geen venster')).slice(0, 300));
    if (await dlg3.locator('[data-nm-kop-kort]').count()) await dlg3.locator('[data-nm-kop-kort]').click();
    await dlg3.locator('#mail-nm-aan').fill('jan@example.test');
    await dlg3.locator('.ProseMirror').click(); await p2.keyboard.insertText('Пересилаю рахунок.');
    await dlg3.locator('footer button.primary').click(); await p2.waitForTimeout(800);
    check('3.2: вкладення надіслано разом із листом (base64 у запиті)', verzonden.length > 0 && /"attachments":\[\{"filename":"rahunok.pdf","contentType":"application\/pdf","data":"JVBERi0xLjQgdGVzdA=="/.test(verzonden[0]), verzonden[0]?.slice(0, 300));
    await ctx2.close();
  } catch (e) {
    check('e2e liep zonder uitzondering', false, String((e as Error)?.stack || e).slice(0, 800));
  } finally {
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();

  async function axe(page: Page, sel: string) {
    if (!existsSync(AXE)) return ['axe-core ontbreekt'];
    await page.evaluate(readFileSync(AXE, 'utf8'));
    return page.evaluate(async (s) => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } };
      const r = await w.axe.run({ include: [[s]] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
      return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    }, sel);
  }
}
