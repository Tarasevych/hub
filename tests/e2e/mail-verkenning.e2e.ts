// Verkenning van mail.* (handmatig testen, geautomatiseerd vastgelegd): laadt de pagina met een nep-Gmail MET TOESTAND en
// schrijft per stap een schermafdruk + een lijst van zichtbare bedieningselementen en lay-outproblemen naar E2E_SCREENSHOTS.
// Stappen komen uit MAIL_STAPPEN (JSON) zodat een tester de verkenning kan sturen; standaard: alleen Inbox.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { startE2eServer, chromeArgs } from './server';
import { nepGmail } from './hulp/nep-gmail';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MAIL = 'https://mail.tarasevych.com';

type Stap = { naam: string; doe?: string; breedte?: number; hoogte?: number; donker?: boolean };

/** In de pagina: zichtbare bedieningselementen + lay-outproblemen (buiten beeld, te klein, overlapt, horizontaal scrollen, afgekapte tekst). */
const METEN = () => {
  const vw = innerWidth, vh = innerHeight;
  const zichtbaar = (el: Element) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 && r.width > 0 && r.height > 0; };
  const naam = (el: Element) => ((el.getAttribute('aria-label') || el.getAttribute('title') || (el as HTMLElement).innerText || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 60));
  const ctrls = [...document.querySelectorAll('button, a[href], [role=button], [role=menuitem], [role=tab], input:not([type=hidden]), select, textarea, summary')].filter(zichtbaar);
  const problemen: string[] = [];
  const lijst = ctrls.map((el) => {
    const r = el.getBoundingClientRect();
    const n = naam(el);
    const id = `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter(Boolean).slice(0, 2).join('.') : ''}`;
    if (r.right > vw + 1 || r.left < -1) problemen.push(`buiten beeld (x): ${id} «${n}» ${Math.round(r.left)}..${Math.round(r.right)}`);
    if ((r.width < 24 || r.height < 24) && !['input', 'a'].includes(el.tagName.toLowerCase()) && r.top < vh) problemen.push(`klein doel <24px: ${id} «${n}» ${Math.round(r.width)}×${Math.round(r.height)}`);
    if (r.top >= 0 && r.top < vh && r.left >= 0 && r.left < vw) {
      const cx = Math.min(vw - 1, r.left + r.width / 2), cy = Math.min(vh - 1, r.top + r.height / 2);
      const op = document.elementFromPoint(cx, cy);
      if (op && op !== el && !el.contains(op) && !op.contains(el)) {
        const o = op.closest('button, a, [role=button], [role=dialog], dialog, header, nav, aside, [class*=menu], [class*=popover], [class*=toast], [class*=notice]');
        problemen.push(`overlapt door ${op.tagName.toLowerCase()}.${String((op as HTMLElement).className || '').split(' ')[0]}${o && o !== op ? ` (in ${o.tagName.toLowerCase()}.${String((o as HTMLElement).className || '').split(' ')[0]})` : ''}: ${id} «${n}»`);
      }
    }
    if (el.tagName === 'BUTTON' && !n) problemen.push(`knop zonder naam: ${id}`);
    const s = getComputedStyle(el);
    if ((s.overflow === 'hidden' || s.textOverflow === 'clip') && (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 2 && s.textOverflow !== 'ellipsis' && (el as HTMLElement).innerText) problemen.push(`afgekapte tekst: ${id} «${n}»`);
    return `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)} ${id} «${n}»`;
  });
  const hs = document.documentElement.scrollWidth - vw;
  if (hs > 1) problemen.push(`horizontaal scrollen: ${hs}px`);
  return { lijst, problemen: [...new Set(problemen)] };
};

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-verkenning');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-mv-${T}@example.test`, sub = `sub-e2e-mv-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const map = `${UIT}/${process.env.MAIL_MAP || 'mail-verkenning'}`; mkdirSync(map, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const bron = process.env.MAIL_STAPPEN_BESTAND ? readFileSync(process.env.MAIL_STAPPEN_BESTAND, 'utf8') : process.env.MAIL_STAPPEN;
  const stappen: Stap[] = bron ? JSON.parse(bron) : [{ naam: 'inbox' }];
  const verslag: string[] = [];
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'mail', tabContext: tab, intent: 'login' });
    const gm = nepGmail('ik@example.test');
    // Startpostvak: gewone, lange, ongelezen, met ster, met bijlage, al gearchiveerd, in de prullenbak, verzonden.
    const lang = 'Дуже довга тема листа, щоб перевірити, як список і заголовок переносять або обрізають текст без поломки розмітки';
    gm.nieuw({ subject: 'Рахунок за жовтень', from: 'Бухгалтерія <buh@example.test>', attachments: [{ providerAttachmentId: 'a1', filename: 'rahunok-zhovten.pdf', mimeType: 'application/pdf', sizeBytes: 182000 }] });
    gm.nieuw({ subject: lang, from: 'Дуже Довге Імʼя Відправника Для Перевірки <long.sender.name@very-long-domain-example.test>' });
    gm.nieuw({ subject: 'Зустріч у четвер', from: 'Олена <olena@example.test>', labelIds: ['INBOX', 'STARRED'] });
    gm.nieuw({ subject: 'Підтвердження замовлення #48213', from: 'Магазин <shop@example.test>', labelIds: ['INBOX'] });
    gm.nieuw({ subject: 'Новини тижня', from: 'Розсилка <news@example.test>', labelIds: ['INBOX', 'UNREAD', 'CATEGORY_PROMOTIONS'] });
    for (let i = 1; i <= 7; i++) gm.nieuw({ subject: `Звичайний лист ${i}`, from: `Контакт ${i} <c${i}@example.test>`, labelIds: i % 2 ? ['INBOX', 'UNREAD'] : ['INBOX'] });
    gm.nieuw({ subject: 'Старий архівний лист', labelIds: ['IMPORTANT'] });
    gm.nieuw({ subject: 'Видалений раніше лист', labelIds: ['TRASH'] });
    gm.nieuw({ subject: 'Мій надісланий лист', from: 'Тестовий власник <ik@example.test>', to: 'olena@example.test', labelIds: ['SENT'] });
    (globalThis as any).__nepGmail = gm;

    // MAIL_MOBIEL=1: telefoon (390×844, aanraken, mobiele user-agent) in plaats van een desktopvenster.
    const mobiel = process.env.MAIL_MOBIEL === '1';
    const ctx = await browser.newContext(mobiel
      ? { colorScheme: 'light', locale: 'uk-UA', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block',
          userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' }
      : { colorScheme: 'light', locale: 'uk-UA', viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MAIL].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    const fouten: string[] = [];
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') fouten.push(`console: ${m.text().slice(0, 300)}`); });
    page.on('response', (q) => { if (q.status() >= 400 && !/\/api\/owner\/mail\//.test(q.url())) fouten.push(`http ${q.status()} ${q.url()}`); });
    await gm.koppel(page);
    await page.goto(`${MAIL}/inbox?lang=uk`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    let n = 0;
    for (const s of stappen) {
      n++;
      if (s.breedte) await page.setViewportSize({ width: s.breedte, height: s.hoogte ?? 844 });
      if (s.donker !== undefined) { await page.emulateMedia({ colorScheme: s.donker ? 'dark' : 'light' }); }
      let fout = '';
      if (s.doe) {
        // hulp.tik(locator) = korte aanraking, hulp.lang(locator) = lang indrukken (700 ms) via echte aanraakgebeurtenissen.
        const aanraak = async (loc: import('playwright-core').Locator, ms: number) => {
          const box = await loc.first().boundingBox({ timeout: 4000 }); if (!box) throw new Error('element niet zichtbaar');
          const x = box.x + box.width / 2, y = box.y + box.height / 2, cdp = await page.context().newCDPSession(page);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          await page.waitForTimeout(ms);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await cdp.detach();
        };
        const hulp = { tik: (l: import('playwright-core').Locator) => aanraak(l, 60), lang: (l: import('playwright-core').Locator) => aanraak(l, 750) };
        try { await new Function('page', 'gm', 'hulp', `return (async () => { ${s.doe} })()`)(page, gm, hulp); }
        catch (e) { fout = String((e as Error).message).split('\n')[0].slice(0, 300); }
      }
      await page.waitForTimeout(900);
      const pad = `${map}/${String(n).padStart(2, '0')}-${s.naam}.png`;
      await page.screenshot({ path: pad });
      const m = await page.evaluate(METEN);
      verslag.push(`## ${n}. ${s.naam}${fout ? `\nACTIE MISLUKT: ${fout}` : ''}\nurl: ${page.url()}\nproblemen (${m.problemen.length}):\n${m.problemen.map((p) => `  - ${p}`).join('\n')}\nbediening (${m.lijst.length}):\n${m.lijst.map((p) => `  ${p}`).join('\n')}\nfouten: ${fouten.splice(0).join(' | ') || '—'}\nacties nep-gmail: ${gm.acties.splice(0).join(', ') || '—'}\nonbekend: ${[...new Set(gm.onbekend.splice(0))].join(', ') || '—'}\n`);
    }
    check('verkenning gelopen', true);
  } finally {
    writeFileSync(`${map}/verslag.txt`, verslag.join('\n'));
    await browser.close();
    await stop();
  }
  return einde();
}
