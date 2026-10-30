// E2E Werkblad v3 — bibliotheek in ISOLATIE (ontwikkelstand src/werkblad/bibliotheek/stand.tsx).
// Geen server, geen database, geen productie: esbuild bundelt de stand, een eigen http-server op 127.0.0.1 levert hem,
// en een route-wachter breekt ELK verzoek naar een andere host af (en telt het: eis 0). Daarnaast dezelfde
// host-resolver-regel als tests/e2e/server.ts (chromeArgs): *.tarasevych.com wijst naar 127.0.0.1, alles anders NOTFOUND.
// Screenshots: bib-{licht,donker}-{1280,390}.png in E2E_SCREENSHOTS (standaard /workspace/audit-werkblad).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { checker } from '../eenheid/hulp/nep-google';
import { chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-werkblad';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e werkblad-bibliotheek');
  const map = mkdtempSync(join(tmpdir(), 'wb3-bib-'));
  await build({ entryPoints: ['src/werkblad/bibliotheek/stand.tsx'], outdir: map, bundle: true, format: 'esm', target: 'es2022', jsx: 'automatic', loader: { '.svg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false' }, logLevel: 'warning' });
  const css = `body{margin:0;font-family:system-ui,sans-serif}[data-thema=licht] body{--surface:#fff;--text:#1f2937;--accent:#0f766e;background:#f3f4f6;color:#1f2937}[data-thema=donker] body{--surface:#111827;--text:#e5e7eb;--accent:#14b8a6;background:#030712;color:#e5e7eb}.stand{display:grid;grid-template-columns:minmax(0,560px) 1fr;gap:1rem;height:100vh;padding:1rem;box-sizing:border-box}.stand-bib{min-height:0;display:flex}.stand-bib>*{flex:1;min-width:0}.stand-canvas{border:2px dashed #8886;border-radius:16px;padding:1rem;overflow:auto}.stand-tegels{display:flex;flex-wrap:wrap;gap:.5rem}.stand-tegel{width:96px;height:104px}#stand-log,#stand-nav{display:block;font-size:11px;white-space:pre-wrap;word-break:break-all;opacity:.6}@media (max-width:700px){.stand{grid-template-columns:minmax(0,1fr);height:auto}.stand-bib{height:80vh}}`;
  writeFileSync(join(map, 'index.html'), `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stand bibliotheek</title><style>${css}</style><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body><div id="root"></div><script type="module" src="/stand.js"></script></body></html>`);
  const bestanden: Record<string, [string, string]> = {
    '/': [join(map, 'index.html'), 'text/html'], '/stand.js': [join(map, 'stand.js'), 'text/javascript'], '/stand.css': [join(map, 'stand.css'), 'text/css'],
    '/canonical-service.js': [resolve('public/canonical-service.js'), 'text/javascript'],
  };
  const server = createServer((req, res) => { const f = bestanden[(req.url || '/').split('?')[0]]; if (!f) { res.writeHead(404).end(); return; } res.writeHead(200, { 'content-type': f[1] }).end(readFileSync(f[0])); });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const poort = (server.address() as { port: number }).port;
  const BASIS = `http://127.0.0.1:${poort}/`;
  mkdirSync(UIT, { recursive: true });
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(1) });
  const geweigerd: string[] = [], fouten: string[] = [];
  try {
    const open = async (query: string, breedte: number, scheme: 'light' | 'dark') => {
      const c = await browser.newContext({ viewport: { width: breedte, height: breedte < 500 ? 844 : 900 }, colorScheme: scheme, hasTouch: breedte < 500 });
      const page = await c.newPage();
      await page.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.hostname === '127.0.0.1' && u.port === String(poort)) return r.continue(); geweigerd.push(u.href); return r.abort(); });
      page.on('pageerror', (e) => fouten.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') fouten.push(m.text()); });
      await page.goto(`${BASIS}?${query}`);
      await page.waitForSelector('.bib-paneel');
      return { c, page };
    };
    // ---------------------------------------------------------------- privé, uk, licht, computer
    {
      const { c, page } = await open('lang=uk&thema=licht', 1280, 'light');
      check('paneel: titel UA, zoekveld, categorieën', (await page.textContent('#bib-titel')) === 'Все на сайті' && await page.locator('.bib-chip').count() === 8);
      const totaal = await page.locator('.bib-rij').count();
      check(`alle items zichtbaar (${totaal} ≥ 120)`, totaal >= 120);
      await page.fill('.bib-zoek input', 'спам');
      check('zoeken «спам» → eerste rij pg:mail/spam', (await page.locator('.bib-rij').first().getAttribute('data-bib-id')) === 'pg:mail/spam');
      await page.locator('.bib-rij').first().getByRole('button', { name: 'Як ярлик' }).click();
      check('«Як ярлик» stuurt het event werkblad-bibliotheek:toevoegen', (await page.textContent('#stand-log'))!.includes('{"itemId":"pg:mail/spam","kind":"shortcut"}'));
      await page.fill('.bib-zoek input', '');
      await page.locator('.bib-chip', { hasText: /^Технічні$/ }).click();
      const tech = page.locator('.bib-rij');
      check('technisch in privé: zichtbaar maar geweigerd met reden, knoppen uit', await tech.count() > 20 && (await tech.first().getAttribute('data-bib-stand')) === 'denied' && await tech.first().locator('.bib-reden').count() === 1 && await tech.first().locator('button.bib-knop').first().isDisabled());
      await page.screenshot({ path: join(UIT, 'bib-licht-1280-technisch.png') });
      await page.locator('.bib-chip', { hasText: /^Усе$/ }).click();
      await page.fill('.bib-zoek input', 'соціальні');
      check('planned (Соціальні мережі) toont «Скоро» en is niet toe te voegen', (await page.locator('[data-bib-id="svc:social"]').getAttribute('data-bib-stand')) === 'planned' && (await page.locator('[data-bib-id="svc:social"] .bib-reden').textContent())!.startsWith('Скоро'));
      // meervoudige selectie
      await page.fill('.bib-zoek input', '');
      await page.locator('.bib-chip', { hasText: /^Віджети$/ }).click();
      const rijen = page.locator('.bib-rij[data-bib-stand=ready] .bib-kies input');
      await rijen.nth(0).check(); await rijen.nth(1).check();
      await page.getByRole('button', { name: /Додати вибрані \(2\)/ }).click();
      const log = JSON.parse((await page.textContent('#stand-log'))!) as Array<{ kind: string }>;
      check('meervoudige selectie: 2 widgets in één keer', log.length === 3 && log.slice(1).every((l) => l.kind === 'widget'));
      // slepen naar het canvas
      await page.locator('.bib-chip', { hasText: /^Сторінки$/ }).click();
      await page.locator('[data-bib-id="pg:identity/sessions"]').dragTo(page.locator('[data-stand-canvas]'), { targetPosition: { x: 300, y: 260 } });
      const na = (await page.textContent('#stand-log'))!;
      check('slepen: dataTransfer-contract komt aan met een punt', /"itemId":"pg:identity\/sessions","kind":"shortcut","point":\{"x":\d+,"y":\d+\}/.test(na));
      // snelkoppeling openen: alleen adres van de canonieke router, geen navigatie
      await page.locator('[data-werkblad-item="pg:mail/spam"]').click();
      check('tegel: klik geeft canoniek adres (mail-host, /spam), geen vrije URL', /^https:\/\/mail\.tarasevych\.com\/spam/.test((await page.textContent('#stand-nav'))!));
      await page.locator('[data-werkblad-item="pg:admin/audit"]').click({ force: true });
      check('tegel zonder recht: opent niets, aria-disabled + reden', /spam/.test((await page.textContent('#stand-nav'))!) && (await page.getAttribute('[data-werkblad-item="pg:admin/audit"]', 'aria-disabled')) === 'true');
      // map
      await page.locator('[data-werkblad-map="m1"]').click();
      check('map: popover met 3 snelkoppelingen, focus erin', await page.locator('.bib-map-paneel .bib-tegel').count() === 3 && await page.evaluate(() => !!document.activeElement?.closest('.bib-map-paneel')));
      await page.keyboard.press('Escape');
      check('map: Escape sluit en zet focus terug', await page.locator('.bib-map-paneel').count() === 0 && await page.evaluate(() => document.activeElement?.getAttribute('data-werkblad-map') === 'm1'));
      // hernoemen + icoon (persoonlijk)
      await page.locator('.bib-chip', { hasText: /^Усе$/ }).click();
      await page.fill('.bib-zoek input', 'спам');
      await page.getByRole('button', { name: 'Перейменувати або змінити значок «Спам»' }).click();
      await page.fill('.bib-bewerk input:not([type])', 'Мій спам');
      await page.locator('.bib-icoonkeuze', { has: page.locator('input[value="star"]') }).click();
      await page.getByRole('button', { name: 'Зберегти' }).click();
      check('hernoemen: persoonlijke snelkoppeling verschijnt, origineel blijft «Спам»', await page.locator('[data-werkblad-item="usr:k1"]').textContent() === 'Мій спам' && (await page.locator('[data-werkblad-item="pg:mail/spam"]').textContent()) === 'Спам');
      await page.getByRole('button', { name: 'Дублювати «Спам»' }).click();
      check('dupliceren: tweede persoonlijke kopie', await page.locator('[data-werkblad-item="usr:k2"]').count() === 1);
      // toetsenbord
      await page.fill('.bib-zoek input', '');
      await page.focus('.bib-zoek input'); await page.keyboard.press('Tab');
      check('toetsenbord: Tab vanuit zoeken naar de eerste categorie', await page.evaluate(() => document.activeElement?.classList.contains('bib-chip') ?? false));
      await page.screenshot({ path: join(UIT, 'bib-licht-1280.png') });
      await c.close();
    }
    // ---------------------------------------------------------------- donker, nl, technisch
    {
      const { c, page } = await open('lang=nl&thema=donker&ruimte=technisch&api=1', 1280, 'dark');
      check('nl: titel «Alles op de site»', (await page.textContent('#bib-titel')) === 'Alles op de site');
      await page.locator('.bib-chip', { hasText: /^Technisch$/ }).click();
      check('technisch profiel: technische items beschikbaar', (await page.locator('.bib-rij').first().getAttribute('data-bib-stand')) === 'ready');
      await page.locator('[data-werkblad-item="pg:admin/audit"]').click();
      check('technisch: admin/audit opent via router', /^https:\/\/admin\.tarasevych\.com\/audit/.test((await page.textContent('#stand-nav'))!));
      await page.locator('.bib-chip', { hasText: /^Alles$/ }).click();
      await page.screenshot({ path: join(UIT, 'bib-donker-1280.png') });
      await c.close();
    }
    // ---------------------------------------------------------------- telefoon 390, licht + donker
    for (const [thema, scheme] of [['licht', 'light'], ['donker', 'dark']] as const) {
      const { c, page } = await open(`lang=uk&thema=${thema}`, 390, scheme);
      const klein = await page.evaluate(() => [...document.querySelectorAll('.bib-paneel button, .bib-paneel select, .bib-kies, .bib-tegel')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44); }).length);
      check(`390 ${thema}: tikvlakken ≥ 44 px (te klein: ${klein})`, klein === 0);
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`390 ${thema}: geen horizontale scroll`, scroll <= 0);
      await page.screenshot({ path: join(UIT, `bib-${thema}-390.png`) });
      await c.close();
    }
    // ---------------------------------------------------------------- reduced motion
    {
      const c = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
      const page = await c.newPage();
      await page.route('**/*', (r) => { const u = new URL(r.request().url()); if (u.hostname === '127.0.0.1') return r.continue(); geweigerd.push(u.href); return r.abort(); });
      await page.goto(`${BASIS}?lang=uk`);
      await page.locator('[data-werkblad-map="m1"]').click();
      check('reduced motion: geen animatie op de map-popover', (await page.locator('.bib-map-paneel').evaluate((e) => getComputedStyle(e).animationName)) === 'none');
      await c.close();
    }
  } finally {
    await browser.close();
    server.close();
    rmSync(map, { recursive: true, force: true });
  }
  check(`alleen lokaal: 0 verzoeken naar andere hosts (${geweigerd.length})`, geweigerd.length === 0);
  check(`geen JS-fouten (${fouten.slice(0, 3).join(' | ')})`, fouten.length === 0);
  return einde();
}
