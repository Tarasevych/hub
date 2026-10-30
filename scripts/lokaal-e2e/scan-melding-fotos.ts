// Schermafdrukken BUG-002: de melding «Перевірка всіх адрес» bij een lopende controle (390 / 768 / 1440, licht / donker), en op de
// computer de stand na «Згорнути» + tabwissel (vóór de fix: weer open; na de fix: blijft in het dok).
// Gebruik (vanuit de projectmap, ook in een oude werkmap): node --experimental-strip-types scripts/lokaal-e2e/scan-melding-fotos.ts <uitmap> <voorvoegsel>
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.argv[2] || '/tmp/scan-fotos', VOOR = process.argv[3] || 'na';
const stand = { staat: 'bezig', loopt: true, verwerkt: 5050, schatting: 19731, eersteKlaarOp: null, bijgewerktOp: new Date().toISOString(), beleid: 'automatisch', maxPogingen: 12, automatisch: true,
  accounts: [{ accountId: 'a1', email: 'pavlo@example.org', staat: 'bezig', fase: 'volledig', verwerkt: 5050, schatting: 19731, fout: '', eersteKlaarOp: null, bijgewerktOp: null, poging: 0, wachtTot: null }],
  tellers: { contacten: 1240, geverifieerd: 310, verdacht: 4, geschreven: 90, officieel: 12, dns: 400 } };
mkdirSync(UIT, { recursive: true });
const map = mkdtempSync(join(tmpdir(), 'scan-foto-'));
await build({ entryPoints: ['tests/e2e/hulp/scan-melding-stand/stand.tsx'], outdir: map, bundle: true, format: 'esm', target: 'es2022', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' }, logLevel: 'error' });
const server = createServer((req, res) => {
  const p = (req.url || '/').split('?')[0];
  if (p === '/canonical-service.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(readFileSync('public/canonical-service.js')); return; }
  if (p === '/stand.js' || p === '/stand.css') { const f = join(map, p.slice(1)); res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/css' }); res.end(existsSync(f) ? readFileSync(f) : ''); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body><script type="module" src="/stand.js"></script></body></html>');
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const poort = (server.address() as any).port;
const { chromium } = createRequire(import.meta.url)(PW);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
for (const w of [390, 768, 1440]) for (const thema of ['licht', 'donker']) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 560 ? 844 : 900 }, isMobile: w < 560, hasTouch: w < 560 });
  const page = await ctx.newPage();
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.request().url().includes('beleid') ? { beleid: 'automatisch', scan: stand } : { scan: stand }) }));
  await page.goto(`http://127.0.0.1:${poort}/?thema=${thema}`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(UIT, `${VOOR}-${w}-${thema}-loopt.png`) });
  if (w >= 560) {
    await page.locator('[data-venster-knop="min"]').first().click().catch(() => undefined);
    await page.waitForTimeout(300);
    await page.evaluate(() => { (window as any).__actief(false); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { (window as any).__actief(true); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(UIT, `${VOOR}-${w}-${thema}-na-zgornuty-en-tabwissel.png`) });
  }
  await ctx.close();
}
await browser.close(); server.close();
console.log('klaar', UIT);
