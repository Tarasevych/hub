// Afgeschermde, plaatselijke schermproef van het echte identiteit-atelier.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtempSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { chromeArgs } from './server';

const vereist = createRequire(import.meta.url);
const { chromium } = vereist(process.env.PLAYWRIGHT_CORE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright') as typeof import('playwright');

export async function main(): Promise<number> {
  const map = mkdtempSync(join(tmpdir(), 'identiteit-mobiel-'));
  const uitvoer = process.env.E2E_SCREENSHOTS || 'rapporten/identiteit-mobiel';
  mkdirSync(uitvoer, { recursive: true });
  await build({
    entryPoints: ['tests/e2e/hulp/identiteit-mobiel-stand/stand.tsx'], outdir: map,
    bundle: true, format: 'esm', target: 'es2022', jsx: 'automatic',
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' },
    logLevel: 'error',
  });
  const html = '<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body style="margin:0"><div id="root"></div><script type="module" src="/stand.js"></script></body></html>';
  const server = createServer((req, res) => {
    const naam = (req.url || '/').split('?')[0];
    const bestand = join(map, naam.replace(/^\/+/, ''));
    if (naam === '/canonical-service.js') {
      res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync('public/canonical-service.js'));
    } else if (naam !== '/' && existsSync(bestand)) {
      res.writeHead(200, { 'content-type': naam.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(bestand));
    } else res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
  const poort = (server.address() as { port: number }).port;
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', ...chromeArgs(poort)] });
  let fouten = 0;
  const controleer = (naam: string, geldig: boolean, detail?: unknown) => {
    process.stdout.write(`${geldig ? '✓' : '✗'} ${naam}${geldig ? '' : `: ${JSON.stringify(detail)}`}\n`);
    if (!geldig) fouten++;
  };
  try {
    for (const breedte of [320, 360, 390, 430, 768, 1280]) {
      for (const plaats of breedte < 500 ? ['left', 'right', 'top', 'bottom'] : ['right']) {
        const context = await browser.newContext({ viewport: { width: breedte, height: 820 }, isMobile: breedte < 500, hasTouch: breedte < 500, deviceScaleFactor: breedte < 500 ? 2 : 1 });
        await context.addInitScript((keuze: string) => localStorage.setItem('identiteit-atelier-v49-navigatie', JSON.stringify({ plaats: keuze, stijl: 'pills' })), plaats);
        const pagina = await context.newPage();
        await pagina.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.hostname !== '127.0.0.1' || url.port !== String(poort)) return route.abort();
          return route.continue();
        });
        const jsFouten: string[] = [];
        const verzoekFouten: string[] = [];
        pagina.on('pageerror', e => jsFouten.push(String(e)));
        pagina.on('console', bericht => { if (bericht.type() === 'error') jsFouten.push(bericht.text()); });
        pagina.on('response', antwoord => { if (antwoord.status() >= 400) verzoekFouten.push(`${antwoord.status()} ${antwoord.url()}`); });
        await pagina.goto(`http://127.0.0.1:${poort}/`);
        try { await pagina.locator('.ia-at-v49 .setting-section').first().waitFor({ timeout: 12000 }); }
        catch (fout) {
          await pagina.screenshot({ path: join(uitvoer, `mislukt-${breedte}-${plaats}.png`), fullPage: false });
          const toestand = await pagina.evaluate(() => ({
            adres: location.href, titel: document.title, wortel: document.getElementById('root')?.innerHTML.slice(0, 700),
            scripts: [...document.scripts].map(el => el.src),
          }));
          throw new Error(`Geen onderdeel zichtbaar: ${JSON.stringify({ toestand, jsFouten, verzoekFouten, fout: String(fout) })}`);
        }
        const maten = await pagina.evaluate(() => {
          const kies = (selector: string) => {
            const e = document.querySelector(selector);
            if (!e) return null;
            const r = e.getBoundingClientRect();
            return { x: Math.round(r.x), rechts: Math.round(r.right), breedte: Math.round(r.width), hoogte: Math.round(r.height) };
          };
          return { scherm: window.innerWidth, document: document.documentElement.scrollWidth, wortel: kies('.ia-at-v49'), hoofd: kies('.main-content'), pagina: kies('.page-wrap'), kaart: kies('.section-card'), afbeelding: kies('.art'), navigatie: kies('.anchor-rail'), twee: kies('.settings-menu-editor>article') };
        });
        controleer(`${breedte}/${plaats}: geen horizontaal uitschuiven`, maten.document <= breedte + 1, maten);
        controleer(`${breedte}/${plaats}: inhoud binnen scherm`, !!maten.kaart && maten.kaart.x >= -1 && maten.kaart.rechts <= breedte + 1, maten);
        controleer(`${breedte}/${plaats}: geen JavaScript-fouten`, jsFouten.length === 0, jsFouten);
        if (breedte < 500) {
          controleer(`${breedte}/${plaats}: afbeelding binnen scherm`, !!maten.afbeelding && maten.afbeelding.x >= -1 && maten.afbeelding.rechts <= breedte + 1, maten.afbeelding);
          const knop = pagina.locator('.ia-at-mobiel-menu');
          controleer(`${breedte}/${plaats}: nav-knop bereikbaar`, await knop.isVisible());
          if (await knop.isVisible()) {
            await knop.click();
            controleer(`${breedte}/${plaats}: nav open`, await pagina.locator('.anchor-rail').isVisible());
            await pagina.locator('[data-jump="languages"]').click();
            controleer(`${breedte}/${plaats}: nav sluit na keuze`, !(await pagina.locator('.anchor-rail').isVisible()));
          }
        }
        if (breedte === 390 && plaats === 'right') await pagina.screenshot({ path: join(uitvoer, 'telefoon-390.png'), fullPage: false });
        if (breedte === 1280) await pagina.screenshot({ path: join(uitvoer, 'computer-1280.png'), fullPage: false });
        await context.close();
      }
    }
  } finally { await browser.close(); await new Promise<void>(ok => server.close(() => ok())); }
  process.stdout.write(`Resultaat: ${fouten} mislukte controles.\n`);
  return fouten ? 1 : 0;
}
