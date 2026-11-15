// ДУБЛІ-001: права навігація «Макета» — у розгорнутій групі немає двох однакових піктограм поспіль (заголовок групи ≠ перший розділ),
// на телефоні й ПК, у світлій і темній темах; плюс знімки для перегляду.
// Geen twee gelijke pictogrammen onder elkaar in de zijnavigatie van «Ontwerp».
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtempSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { chromeArgs } from './server';

const vereist = createRequire(import.meta.url);
const { chromium } = vereist(process.env.PLAYWRIGHT_CORE || 'playwright') as typeof import('playwright');

export async function main(): Promise<number> {
  const map = mkdtempSync(join(tmpdir(), 'dubli-001-'));
  const uitvoer = process.env.E2E_SCREENSHOTS || 'rapporten/dubli-001';
  mkdirSync(uitvoer, { recursive: true });
  await build({
    entryPoints: ['tests/e2e/hulp/identiteit-maquette-stand/stand.tsx'], outdir: map,
    bundle: true, format: 'esm', target: 'es2022', jsx: 'automatic',
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.jpg': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' },
    logLevel: 'error',
  });
  const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body><div id="root"></div><script type="module" src="/stand.js"></script></body></html>';
  const server = createServer((req, res) => {
    const naam = (req.url || '/').split('?')[0];
    const bestand = join(map, naam.replace(/^\/+/, ''));
    if (naam === '/canonical-service.js') res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync('public/canonical-service.js'));
    else if (naam !== '/' && existsSync(bestand)) res.writeHead(200, { 'content-type': naam.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(bestand));
    else res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const poort = (server.address() as { port: number }).port;
  const browser = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}), headless: true, args: ['--no-sandbox', ...chromeArgs(poort)] });
  let fouten = 0;
  const controleer = (naam: string, geldig: boolean, detail?: unknown) => {
    process.stdout.write(`${geldig ? '✓' : '✗'} ${naam}${geldig ? '' : `: ${JSON.stringify(detail)}`}\n`);
    if (!geldig) fouten++;
  };
  try {
    for (const { breedte, licht, taal } of [
      { breedte: 390, licht: true, taal: 'uk' }, { breedte: 390, licht: false, taal: 'uk' },
      { breedte: 1280, licht: true, taal: 'nl' }, { breedte: 1280, licht: false, taal: 'uk' },
    ]) {
      const naam = `${breedte}/${taal}/${licht ? 'licht' : 'donker'}`;
      const context = await browser.newContext({ viewport: { width: breedte, height: 860 }, isMobile: breedte < 500, hasTouch: breedte < 500, deviceScaleFactor: 2 });
      // Навігація праворуч, як на знімку Павла.
      await context.addInitScript(() => { try { localStorage.setItem('account-atelier-preferences-v1', JSON.stringify({ position: 'right' })); } catch { /* */ } });
      const pagina = await context.newPage();
      await pagina.route('**/*', (route) => { const u = new URL(route.request().url()); return u.hostname === '127.0.0.1' && u.port === String(poort) ? route.continue() : route.abort(); });
      const jsFouten: string[] = [];
      pagina.on('pageerror', (e) => jsFouten.push(String(e)));
      await pagina.goto(`http://127.0.0.1:${poort}/?lang=${taal}`);
      await pagina.locator('.mr-mq').waitFor({ timeout: 15000 });
      if (licht) await pagina.evaluate(() => document.documentElement.classList.add('theme-light'));
      await pagina.waitForTimeout(400);
      // Усі групи розгорнуто: перевіряємо піктограми в порядку показу.
      await pagina.evaluate(() => { for (const b of document.querySelectorAll<HTMLButtonElement>('#railItems .nav-group-toggle[aria-expanded="false"]')) b.click(); });
      await pagina.waitForTimeout(300);
      const pict = await pagina.evaluate(() => [...document.querySelectorAll('#railItems .anchor-link .anchor-icon, #railItems .nav-group-toggle .anchor-icon')]
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)).map((e) => e.innerHTML));
      const dubbel = pict.findIndex((p, i) => i > 0 && p === pict[i - 1]);
      controleer(`${naam}: немає двох однакових піктограм поспіль`, pict.length >= 17 && dubbel < 0, { n: pict.length, dubbel });
      controleer(`${naam}: піктограми груп відмінні від усіх піктограм розділів`, await pagina.evaluate(() => {
        const g = [...document.querySelectorAll('#railItems .nav-group-toggle .anchor-icon')].map((e) => e.innerHTML);
        const r = new Set([...document.querySelectorAll('#railItems .anchor-link .anchor-icon')].map((e) => e.innerHTML));
        return g.length === 4 && g.every((x) => !r.has(x));
      }));
      const tekst = await pagina.evaluate(() => document.querySelector('.mr-mq')?.textContent || '');
      controleer(`${naam}: немає «прототип»/«Дизайн-концепт»/«Account Atelier»`, !/прототип|Дизайн-концепт|Account Atelier|Ontwerpconcept|prototype/i.test(tekst));
      controleer(`${naam}: без помилок JS`, jsFouten.length === 0, jsFouten);
      const rail = pagina.locator('#anchorRail');
      if (breedte < 500) {
        await pagina.locator('#adaptiveNavToggle').click().catch(() => {});
        await pagina.waitForTimeout(400);
        await pagina.screenshot({ path: join(uitvoer, `${breedte}-${licht ? 'licht' : 'donker'}.png`) });
      } else {
        await rail.screenshot({ path: join(uitvoer, `${breedte}-${licht ? 'licht' : 'donker'}-rail.png`) }).catch(async () => pagina.screenshot({ path: join(uitvoer, `${breedte}-${licht ? 'licht' : 'donker'}.png`) }));
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fouten;
}
