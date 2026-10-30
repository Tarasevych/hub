// E2E Werkblad v3 — vrij canvas (Etappe C), met een ECHTE Chrome tegen een lokale stand (tests/e2e/hulp/canvas-stand, vite op
// 127.0.0.1; geen backend nodig). Alleen lokaal: chromeArgs() (alles behalve loopback → ~NOTFOUND) + een route-slot in de context.
// Wat er echt gebeurt (muis/aanraking via Playwright/CDP, geen nagebootste state):
//   muis-slepen naar exacte (x,y) → precies één commit → herladen → zelfde plek; formaat via alle 8 grepen; Escape; pointercancel
//   (muis + echte touchCancel); toetsenbord (pijltjes, Shift, menu «Зафіксувати», Ctrl+Z); telefoon 390: veeg = scroll zonder commit,
//   lang drukken 550 ms = slepen; tablet 1024↔768 draaien; zoom 200 % (CSS-viewport gehalveerd, DPR 2); zijbalk in/uit; 409-melding.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-werkblad';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const POORT = Number(process.env.E2E_STAND_POORT || 5391);
type Rect = { x: number; y: number; w: number; h: number };

export async function main(): Promise<number> {
  const resultaten: Array<{ naam: string; ok: boolean }> = [];
  const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const { createServer } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const wortel = resolve('.');
  const vite = await createServer({ configFile: false, root: resolve('tests/e2e/hulp/canvas-stand'), plugins: [react()], logLevel: 'error',
    server: { host: '127.0.0.1', port: POORT, strictPort: true, hmr: false, fs: { allow: [wortel] } }, optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-dev-runtime'] } });
  await vite.listen();
  const BASIS = `http://127.0.0.1:${POORT}/`;
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const extern: string[] = [];
  const nieuw = async (o: { width: number; height: number; touch?: boolean; dpr?: number }) => {
    const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height }, hasTouch: !!o.touch, isMobile: !!o.touch, deviceScaleFactor: o.dpr || 1, locale: 'uk-UA', reducedMotion: 'reduce' });
    await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.hostname !== '127.0.0.1') { extern.push(u.href); return r.abort(); } return r.continue(); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => check(`geen paginafout (${e.message.slice(0, 80)})`, false));
    return { ctx, page };
  };
  const open = async (p: Page, q = 'vers') => { await p.goto(`${BASIS}?${q}`); await p.waitForSelector('[data-wbc-id="mail"]'); await p.waitForFunction(() => !!document.querySelector('[data-qa="klasse"]')?.textContent); };
  const W = (p: Page) => p.evaluate(() => ({ n: window.__wbc.commits.length, layouts: window.__wbc.layouts, laatste: window.__wbc.commits.at(-1) }));
  const opgeslagen = async (p: Page, id: string, klasse = 'computer'): Promise<Rect | undefined> => { const w = await W(p); const e = (w.layouts as Record<string, { items: Array<Rect & { instanceId: string }> }>)[klasse]?.items.find((x) => x.instanceId === id); return e && { x: e.x, y: e.y, w: e.w, h: e.h }; };
  const doos = async (p: Page, id: string) => p.evaluate((i) => { const c = document.querySelector('.wbc')!.getBoundingClientRect(); const b = document.querySelector(`[data-wbc-id="${i}"]`)!.getBoundingClientRect(); return { x: b.left - c.left, y: b.top - c.top, w: b.width, h: b.height, cx: b.left + b.width / 2, cy: b.top + b.height / 2, cl: c.left, ct: c.top, cw: c.width }; }, id);
  const j = (x: unknown) => JSON.stringify(x);

  try {
    // ── A. computer, schaal 1 (1544 = 240 zijbalk + 24 marge + 1280) ──
    { const { ctx, page: p } = await nieuw({ width: 1544, height: 900 });
      await open(p);
      check('computer: klasse uit containerbreedte', (await p.textContent('[data-qa="klasse"]')) === 'computer');
      check('computer: schaal exact 1', (await p.getAttribute('.wbc', 'data-schaal')) === '1.0000');
      await p.screenshot({ path: `${UIT}/canvas-computer-bewerken.png` });
      // A1. muis-slepen naar exacte (500,520)
      const b = await doos(p, 'mail');
      await p.mouse.move(b.cx, b.cy); await p.mouse.down();
      for (let i = 1; i <= 12; i++) await p.mouse.move(b.cx + (460 * i) / 12, b.cy + (480 * i) / 12);
      check('slepen: geest zichtbaar tijdens gebaar', await p.isVisible('.wbc-geest'));
      check('slepen: echte tegel volgt de cursor', Math.abs((await doos(p, 'mail')).x - 500) <= 1);
      check('slepen: nog géén commit tijdens slepen', (await W(p)).n === 0);
      await p.screenshot({ path: `${UIT}/canvas-slepen-geest.png` });
      await p.mouse.up();
      const na = await W(p);
      check('slepen: precies één commit bij pointerup', na.n === 1, String(na.n));
      check('slepen: exact (500,520) opgeslagen', j(await opgeslagen(p, 'mail')) === j({ x: 500, y: 520, w: 96, h: 96 }), j(await opgeslagen(p, 'mail')));
      check('slepen: buren niet verschoven', j(await opgeslagen(p, 'agenda')) === j({ x: 160, y: 40, w: 96, h: 96 }));
      check('pointer capture vrijgegeven', await p.evaluate(() => !document.querySelector('[data-wbc-id="mail"]')!.hasPointerCapture(1)));
      await open(p, 'herladen'); await p.waitForTimeout(150);
      const h = await doos(p, 'mail');
      check('herladen: tegel op dezelfde (500,520)', Math.round(h.x) === 500 && Math.round(h.y) === 520, `${h.x},${h.y}`);
      // A2. Escape
      await p.mouse.move(h.cx, h.cy); await p.mouse.down(); await p.mouse.move(h.cx + 30, h.cy + 30); await p.mouse.move(h.cx + 200, h.cy + 60);
      await p.keyboard.press('Escape'); await p.mouse.up();
      check('Escape: geen commit, plek ongewijzigd', (await W(p)).n === 0 && Math.round((await doos(p, 'mail')).x) === 500);
      // A3. pointercancel (muis): synthetisch pointercancel met de echte pointerId 1, daarna loslaten
      await p.mouse.move(h.cx, h.cy); await p.mouse.down(); await p.mouse.move(h.cx + 40, h.cy); await p.mouse.move(h.cx + 120, h.cy);
      await p.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, isPrimary: true, pointerType: 'mouse' })));
      await p.mouse.move(h.cx + 300, h.cy); await p.mouse.up();
      check('pointercancel: geen commit, terug op (500,520)', (await W(p)).n === 0 && Math.round((await doos(p, 'mail')).x) === 500);
      check('pointercancel: capture vrijgegeven', await p.evaluate(() => !document.querySelector('[data-wbc-id="mail"]')!.hasPointerCapture(1)));
      // A4. formaat via alle 8 grepen (widget notities 400,60 320×240)
      const verwacht: Record<string, (r: Rect) => Rect> = {
        e: (r) => ({ ...r, w: r.w + 37 }), s: (r) => ({ ...r, h: r.h + 23 }), w: (r) => ({ ...r, x: r.x - 19, w: r.w + 19 }), n: (r) => ({ ...r, y: r.y - 11, h: r.h + 11 }),
        se: (r) => ({ ...r, w: r.w + 10, h: r.h + 10 }), nw: (r) => ({ x: r.x - 10, y: r.y - 10, w: r.w + 10, h: r.h + 10 }),
        ne: (r) => ({ ...r, y: r.y - 10, w: r.w + 10, h: r.h + 10 }), sw: (r) => ({ ...r, x: r.x - 10, w: r.w + 10, h: r.h + 10 }),
      };
      const delta: Record<string, [number, number]> = { e: [37, 0], s: [0, 23], w: [-19, 0], n: [0, -11], se: [10, 10], nw: [-10, -10], ne: [10, -10], sw: [-10, 10] };
      let r: Rect = { x: 400, y: 60, w: 320, h: 240 };
      for (const rand of Object.keys(delta)) {
        const n0 = (await W(p)).n;
        const g = await p.locator(`[data-wbc-id="notities"] [data-wbc-rand="${rand}"]`).boundingBox();
        const gx = g!.x + g!.width / 2, gy = g!.y + g!.height / 2;
        await p.mouse.move(gx, gy); await p.mouse.down(); await p.mouse.move(gx + delta[rand][0] / 2, gy + delta[rand][1] / 2); await p.mouse.move(gx + delta[rand][0], gy + delta[rand][1]); await p.mouse.up();
        r = verwacht[rand](r); const o = await opgeslagen(p, 'notities');
        check(`formaat greep ${rand}: exact + één commit`, j(o) === j(r) && (await W(p)).n === n0 + 1, j(o));
      }
      const g = await p.locator('[data-wbc-id="notities"] [data-wbc-rand="se"]').boundingBox();
      await p.mouse.move(g!.x + 6, g!.y + 6); await p.mouse.down(); await p.mouse.move(g!.x - 600, g!.y - 600, { steps: 4 }); await p.mouse.up();
      const mn = await opgeslagen(p, 'notities');
      check('formaat: min uit limieten (200×140)', mn?.w === 200 && mn?.h === 140, j(mn));
      check('grepen: tikvlak ≥ 44 px', await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.wbc-greep')!, '::before'); return parseFloat(s.width) >= 44 && parseFloat(s.height) >= 44; }));
      // A5. toetsenbord: 3× → = één commit na rust, +24
      const n1 = (await W(p)).n;
      await p.focus('[data-wbc-id="agenda"]');
      for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowRight');
      await p.waitForTimeout(800);
      check('toetsenbord: 3× → = +24 px, één commit', (await opgeslagen(p, 'agenda'))?.x === 184 && (await W(p)).n === n1 + 1, j(await opgeslagen(p, 'agenda')));
      check('aria-live kondigt aan', /переміщено/.test(await p.textContent('.wbc [aria-live]') || ''));
      await p.keyboard.press('Shift+ArrowDown'); await p.waitForTimeout(800);
      check('toetsenbord: Shift+↓ = hoger', (await opgeslagen(p, 'agenda'))?.h === 104);
      await p.keyboard.press('Control+z'); await p.waitForTimeout(100);
      check('Ctrl+Z: ongedaan', (await opgeslagen(p, 'agenda'))?.h === 96);
      await p.keyboard.press('Control+y');
      check('Ctrl+Y: opnieuw', (await opgeslagen(p, 'agenda'))?.h === 104);
      // A6. menu via Enter → Зафіксувати → slepen doet niets
      await p.focus('[data-wbc-id="agenda"]'); await p.keyboard.press('Enter');
      check('contextmenu open, focus op eerste item', await p.evaluate(() => document.activeElement?.getAttribute('role') === 'menuitem'));
      await p.screenshot({ path: `${UIT}/canvas-contextmenu.png` });
      const items = await p.locator('.wbc-menu [role=menuitem]').allTextContents();
      check('menu: Додати / Розмістити тут… / Змінити розмір / Вперед / Зафіксувати / Видалити', ['Додати', 'Розмістити тут…', 'Змінити розмір', 'Вперед', 'Зафіксувати', 'Видалити'].every((t) => items.includes(t)), items.join('|'));
      await p.click('.wbc-menu >> text=Зафіксувати');
      const ag = await doos(p, 'agenda'); const n2 = (await W(p)).n;
      await p.mouse.move(ag.cx, ag.cy); await p.mouse.down(); await p.mouse.move(ag.cx + 100, ag.cy + 100, { steps: 5 }); await p.mouse.up();
      check('vergrendeld: slepen verplaatst niet', (await W(p)).n === n2 && (await opgeslagen(p, 'agenda'))?.x === 184);
      // A7. «Розмістити тут…» via rechtermuisknop op bestanden, dan klik op (900,700)
      const bs = await doos(p, 'bestanden');
      await p.mouse.click(bs.cx, bs.cy, { button: 'right' });
      await p.click('.wbc-menu >> text=Розмістити тут…');
      const c2 = await doos(p, 'bestanden'); await p.mouse.click(c2.cl + 900, c2.ct + 700);
      check('«Розмістити тут…»: op (900,700)', j(await opgeslagen(p, 'bestanden')) === j({ x: 900, y: 700, w: 96, h: 96 }), j(await opgeslagen(p, 'bestanden')));
      // J. zijbalk dicht → andere schaal, posities ongewijzigd, geen commit
      const n3 = (await W(p)).n, voor = j((await W(p)).layouts);
      await p.click('[data-qa="zij"]'); await p.waitForTimeout(250);
      const s2 = Number(await p.getAttribute('.wbc', 'data-schaal')); const m2 = await doos(p, 'mail');
      check('zijbalk dicht: schaal volgt container, tegel = opgeslagen × schaal', s2 > 1.1 && Math.abs(m2.x - 500 * s2) < 1, `${s2} ${m2.x}`);
      check('zijbalk: geen commit, opslag ongewijzigd', (await W(p)).n === n3 && j((await W(p)).layouts) === voor);
      await p.click('[data-qa="zij"]');
      // I. zoom 200 % = CSS-viewport gehalveerd bij DPR 2 (zoals Chrome-zoom)
      await p.setViewportSize({ width: 772, height: 450 }); await p.waitForTimeout(300);
      const kz = await p.textContent('[data-qa="klasse"]');
      await p.screenshot({ path: `${UIT}/canvas-zoom200.png` });
      await p.setViewportSize({ width: 1544, height: 900 }); await p.waitForTimeout(300);
      const m3 = await doos(p, 'mail');
      check('zoom 200 %: andere klasse op halve CSS-breedte, computer-indeling onaangeroerd', kz !== 'computer' && j((await W(p)).layouts.computer) === j(JSON.parse(voor).computer), String(kz));
      check('zoom terug 100 %: tegel weer op (500,520)', Math.round(m3.x) === 500 && Math.round(m3.y) === 520);
      await ctx.close(); }

    // Zoom met echte deviceScaleFactor 2 (hoge DPR), klasse computer blijft bij voldoende CSS-breedte
    { const { ctx, page: p } = await nieuw({ width: 1544, height: 900, dpr: 2 });
      await open(p);
      const b = await doos(p, 'mail');
      await p.mouse.move(b.cx, b.cy); await p.mouse.down(); await p.mouse.move(b.cx + 100, b.cy + 50, { steps: 6 }); await p.mouse.up();
      check('DPR 2: exacte logische px (140,90)', j(await opgeslagen(p, 'mail')) === j({ x: 140, y: 90, w: 96, h: 96 }), j(await opgeslagen(p, 'mail')));
      await ctx.close(); }

    // ── G. telefoon 390, aanraken ──
    { const { ctx, page: p } = await nieuw({ width: 390, height: 844, touch: true });
      await open(p, 'vers&lang-pagina');
      check('telefoon: klasse telefoon', (await p.textContent('[data-qa="klasse"]')) === 'telefoon');
      const binnen = await p.evaluate(() => { const c = document.querySelector('.wbc')!.getBoundingClientRect(); return [...document.querySelectorAll('[data-wbc-id]')].every((e) => { const b = e.getBoundingClientRect(); return b.left >= c.left - 0.5 && b.right <= c.right + 0.5; }); });
      check('telefoon: niets buiten de breedte (proportioneel aangepast)', binnen);
      check('telefoon: geen horizontale scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await p.screenshot({ path: `${UIT}/canvas-telefoon.png`, fullPage: true });
      const cdp = await ctx.newCDPSession(p);
      const raak = (type: string, x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }] } as never);
      // veeg: scrollen, geen slepen
      const t = await doos(p, 'notities');
      await raak('touchStart', t.cx, t.cy);
      for (let i = 1; i <= 8; i++) { await raak('touchMove', t.cx, t.cy - i * 30); await p.waitForTimeout(16); }
      await raak('touchEnd', 0, 0); await p.waitForTimeout(400);
      const sy = await p.evaluate(() => scrollY);
      check('telefoon: veeg op tegel scrolt de pagina', sy > 50, String(sy));
      check('telefoon: veeg = geen commit', (await W(p)).n === 0);
      await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(100);
      // lang drukken 550 ms → slepen
      const m = await doos(p, 'mail'); const r0 = (await W(p)).layouts.telefoon;
      await raak('touchStart', m.cx, m.cy); await p.waitForTimeout(550);
      check('lang drukken: gebaar actief (geest)', await p.isVisible('.wbc-geest'));
      for (let i = 1; i <= 6; i++) { await raak('touchMove', m.cx + i * 10, m.cy + i * 40); await p.waitForTimeout(16); }
      await raak('touchEnd', 0, 0); await p.waitForTimeout(100);
      const nt = await W(p); const mt = await opgeslagen(p, 'mail', 'telefoon');
      check('lang drukken + slepen: één commit in de telefoonindeling', nt.n === 1 && nt.laatste?.klasse === 'telefoon', j(mt));
      check('telefoon: eigen indeling (computer niet aangemaakt/gewijzigd)', !nt.layouts.computer && r0 === undefined);
      check('telefoon: pagina niet gescrold tijdens slepen', (await p.evaluate(() => scrollY)) < 5);
      // echte touchCancel tijdens slepen → niets opgeslagen
      const m2 = await doos(p, 'mail');
      await raak('touchStart', m2.cx, m2.cy); await p.waitForTimeout(550); await raak('touchMove', m2.cx + 20, m2.cy + 60); await raak('touchCancel', 0, 0); await p.waitForTimeout(100);
      check('touchCancel: geen commit, terug', (await W(p)).n === 1 && j(await opgeslagen(p, 'mail', 'telefoon')) === j(mt));
      // lang drukken zonder bewegen → menu
      await raak('touchStart', m2.cx, m2.cy); await p.waitForTimeout(550); await raak('touchEnd', 0, 0); await p.waitForTimeout(100);
      check('lang drukken zonder bewegen → contextmenu', await p.isVisible('.wbc-menu'));
      await p.screenshot({ path: `${UIT}/canvas-telefoon-menu.png` });
      await ctx.close(); }

    // ── H. tablet + draaien (zijbalk dicht: 64 px) ──
    { const { ctx, page: p } = await nieuw({ width: 1024, height: 768, touch: true });
      await open(p, 'vers'); await p.click('[data-qa="zij"]'); await p.waitForTimeout(200);
      const k1 = await p.textContent('[data-qa="klasse"]');
      const alleBinnen = () => p.evaluate(() => { const c = document.querySelector('.wbc')!.getBoundingClientRect(); return [...document.querySelectorAll('[data-wbc-id]')].every((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left >= c.left - 0.5 && b.right <= c.right + 0.5 && b.top >= c.top - 0.5; }); });
      check('tablet liggend: klasse tablet, alles binnen', k1 === 'tablet' && await alleBinnen(), String(k1));
      await p.screenshot({ path: `${UIT}/canvas-tablet-liggend.png` });
      await p.setViewportSize({ width: 768, height: 1024 }); await p.waitForTimeout(300);
      check('tablet staand: klasse tablet, niets weggevlogen of verdwenen', (await p.textContent('[data-qa="klasse"]')) === 'tablet' && await alleBinnen() && (await p.locator('[data-wbc-id]').count()) === 6);
      check('draaien: geen commit', (await W(p)).n === 0);
      await p.screenshot({ path: `${UIT}/canvas-tablet-staand.png` });
      await ctx.close(); }

    // ── K. 409 + buiten instelmodus ──
    { const { ctx, page: p } = await nieuw({ width: 1280, height: 800 });
      await open(p, 'vers&status=conflict');
      check('409: duidelijke Oekraïense melding + «Оновити»', /іншій вкладці/.test(await p.textContent('.wbc-status') || '') && await p.isVisible('.wbc-status >> text=Оновити'));
      await p.screenshot({ path: `${UIT}/canvas-409.png` });
      await open(p, 'vers&status=error&lang=nl');
      check('fout (nl): «Opnieuw proberen»', await p.isVisible('.wbc-status >> text=Opnieuw proberen'));
      await open(p, 'vers&edit=0');
      const b = await doos(p, 'mail');
      check('buiten instelmodus: geen grepen', (await p.locator('.wbc-greep').count()) === 0);
      await p.mouse.move(b.cx, b.cy); await p.mouse.down(); await p.mouse.move(b.cx + 100, b.cy + 100, { steps: 5 }); await p.mouse.up();
      check('buiten instelmodus: slepen doet niets', (await W(p)).n === 0);
      await p.click('[data-qa-tegel="mail"] a');
      check('buiten instelmodus: link opent doel', p.url().endsWith('#mail'));
      await p.screenshot({ path: `${UIT}/canvas-gewoon.png` });
      await ctx.close(); }
    check('geen enkel verzoek buiten 127.0.0.1', extern.length === 0, extern.join(' '));
  } catch (e) { check(`onverwachte fout: ${(e as Error).message.split('\n')[0]}`, false); }
  finally { await browser.close(); await vite.close(); }
  const fout = resultaten.filter((r) => !r.ok).length;
  console.log(`werkblad-canvas e2e: ${resultaten.length - fout}/${resultaten.length} geslaagd`);
  return fout ? 1 : 0;
}
