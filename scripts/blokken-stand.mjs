// Browsercontrole BlokWeergave (stroom B) in een lokale stand. Alleen 127.0.0.1; elk ander verzoek wordt afgebroken.
// Gebruik: PLAYWRIGHT_CORE=/pad/playwright-core node scripts/blokken-stand.mjs [uitmap]
import { build } from 'esbuild';
import http from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const uitmap = process.argv[2] || '/workspace/audit-blokken';
await mkdir(uitmap, { recursive: true });
const tmp = await mkdtemp(join(tmpdir(), 'blokken-stand-'));
await build({ entryPoints: ['tests/stand/blokken-stand.tsx'], outdir: tmp, bundle: true, format: 'esm', jsx: 'automatic', loader: { '.css': 'css' }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' });
const html = '<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/blokken-stand.css"><style>body{margin:0;font-family:system-ui,sans-serif}</style></head><body><div id="wortel"></div><script type="module" src="/blokken-stand.js"></script></body></html>';
const server = http.createServer(async (q, a) => {
  try { if (q.url === '/' ) { a.setHeader('content-type', 'text/html'); return a.end(html); }
    const f = await readFile(join(tmp, q.url.replace(/[^a-z.-]/g, ''))); a.setHeader('content-type', q.url.endsWith('.css') ? 'text/css' : 'text/javascript'); a.end(f);
  } catch { a.statusCode = 404; a.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const basis = `http://127.0.0.1:${server.address().port}/`;
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE);
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
let fouten = 0; const meld = (ok, t) => { if (!ok) fouten++; console.log(`${ok ? 'OK  ' : 'FOUT'} ${t}`); };
for (const breedte of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width: breedte, height: 900 } });
  await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  const page = await ctx.newPage(); const consoleFouten = [];
  page.on('pageerror', (e) => consoleFouten.push(String(e))); page.on('console', (m) => (m.type() === 'error' ? consoleFouten.push(m.text()) : console.log('  pagina:', m.text())));
  await page.goto(basis); await page.waitForSelector('.blk-tegel');
  const info = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.blk-tegel')];
    const buitenL = t.filter((e) => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }); const buiten = buitenL.length;
    const zonderNaam = t.filter((e) => !e.getAttribute('aria-label') || !e.getAttribute('data-tip')).length;
    const autoIcoon = getComputedStyle(document.querySelector('[data-blok-id="auto"] .blk-icoon')).width;
    const negatief = t.filter((e) => e.offsetWidth <= 0 || e.offsetHeight <= 0).length;
    return { n: t.length, buiten, zonderNaam, autoIcoon, negatief, scroll: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  meld(info.n === 62, `${breedte}: ${info.n} tegels getekend`);
  meld(info.buiten === 0 && !info.scroll, `${breedte}: geen tegel buiten beeld, geen horizontale scroll`);
  meld(info.zonderNaam === 0, `${breedte}: elke tegel heeft aria-label en tooltip`);
  meld(info.negatief === 0, `${breedte}: geen tegel met maat 0`);
  meld(info.autoIcoon === (breedte === 390 ? '28px' : '36px'), `${breedte}: auto-icoon ${info.autoIcoon}`);
  // focusvolgorde = visuele volgorde in het auto-blok
  await page.focus('[data-blok-id="auto"] .blk-tegel');
  const pos = []; for (let i = 0; i < 12; i++) { pos.push(await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.left)]; })); await page.keyboard.press('Tab'); }
  meld(pos.every((p, i) => i === 0 || p[0] > pos[i - 1][0] + 4 || (Math.abs(p[0] - pos[i - 1][0]) <= 4 && p[1] > pos[i - 1][1])), `${breedte}: Tab volgt de visuele volgorde`);
  meld(consoleFouten.length === 0, `${breedte}: geen consolefouten ${consoleFouten.join(' | ')}`);
  await page.screenshot({ path: join(uitmap, `b-${breedte}.png`), fullPage: true });
  await page.hover('[data-blok-id="auto"] .blk-tegel'); await page.waitForTimeout(700);
  await page.locator('article').first().screenshot({ path: join(uitmap, `b-${breedte}-tooltip.png`) });
  await ctx.close();
}
await browser.close(); server.close(); await rm(tmp, { recursive: true, force: true });
console.log(fouten ? `blokken-stand: ${fouten} FOUT` : 'blokken-stand: alles OK');
process.exit(fouten ? 1 : 0);
