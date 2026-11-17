// Afgeschermde, plaatselijke schermproef van het echte identiteit-atelier («Студія», IDENTITEIT-006).
// Controleert op telefoon, tablet en computer: geen horizontaal uitschuiven, het onderdeelblad, het zoeken en het lichte thema.
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
      // De plaats van de navigatie telt pas op een breed scherm; op de telefoon blijft het een blad van onderen.
      for (const plaats of breedte >= 1000 ? ['left', 'right', 'top', 'bottom'] : ['left']) {
        const context = await browser.newContext({ viewport: { width: breedte, height: 820 }, isMobile: breedte < 500, hasTouch: breedte < 500, deviceScaleFactor: breedte < 500 ? 2 : 1 });
        await context.addInitScript((keuze: string) => localStorage.setItem('identiteit-atelier-v49-navigatie', JSON.stringify({ plaats: keuze, stijl: 'pills' })), plaats);
        const pagina = await context.newPage();
        await pagina.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.hostname !== '127.0.0.1' || url.port !== String(poort)) return route.abort();
          return route.continue();
        });
        const jsFouten: string[] = [];
        pagina.on('pageerror', e => jsFouten.push(String(e)));
        pagina.on('console', bericht => { if (bericht.type() === 'error') jsFouten.push(bericht.text()); });
        await pagina.goto(`http://127.0.0.1:${poort}/`);
        try { await pagina.locator('.mr-at .mr-at-paneel').first().waitFor({ timeout: 12000 }); }
        catch (fout) {
          await pagina.screenshot({ path: join(uitvoer, `mislukt-${breedte}-${plaats}.png`), fullPage: false });
          throw new Error(`Geen paneel zichtbaar: ${JSON.stringify({ jsFouten, wortel: await pagina.evaluate(() => document.getElementById('root')?.innerHTML.slice(0, 500)), fout: String(fout) })}`);
        }
        const maten = () => pagina.evaluate(() => {
          const kies = (selector: string) => {
            const e = document.querySelector(selector);
            if (!e) return null;
            const r = e.getBoundingClientRect();
            return { x: Math.round(r.x), rechts: Math.round(r.right), breedte: Math.round(r.width), hoogte: Math.round(r.height) };
          };
          const grens = document.documentElement.clientWidth + 1;
          const uitstekers = [...document.querySelectorAll('body *')].filter(el => !el.closest('.mr-kunst'))
            .map(el => ({ el: el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 50), rechts: Math.round(el.getBoundingClientRect().right), b: el.getBoundingClientRect().width }))
            .filter(e => e.b > 0 && e.rechts > grens).slice(0, 6);
          return { document: document.documentElement.scrollWidth, uitstekers, kop: kies('.mr-at-kop'), paneel: kies('.mr-at-paneel'), kunst: kies('.mr-at-kop .mr-kunst-raam'), balk: kies('.mr-at-balk'), gids: kies('.mr-at-gids'), actief: document.querySelector('.mr-at')?.getAttribute('data-actief') };
        });
        const m = await maten();
        controleer(`${breedte}/${plaats}: geen horizontaal uitschuiven`, m.document <= breedte + 1 && !m.uitstekers.length, m);
        controleer(`${breedte}/${plaats}: kop en paneel binnen scherm`, !!m.kop && !!m.paneel && m.paneel.x >= -1 && m.paneel.rechts <= breedte + 1 && m.kop.rechts <= breedte + 1, m);
        controleer(`${breedte}/${plaats}: illustratie behouden en binnen scherm`, !!m.kunst && m.kunst.hoogte > 80 && m.kunst.rechts <= breedte + 1, m.kunst);
        if (breedte < 980) {
          // Telefoon en tablet: de sticky balk opent het blad met alle onderdelen.
          const knop = pagina.locator('.mr-at-balk-kies');
          controleer(`${breedte}/${plaats}: onderdeelknop bereikbaar`, await knop.isVisible(), m.balk);
          await knop.click();
          const blad = pagina.locator('.mr-at-kiezer');
          controleer(`${breedte}/${plaats}: blad open`, await blad.isVisible());
          const bladMaat = await blad.boundingBox();
          controleer(`${breedte}/${plaats}: blad binnen scherm`, !!bladMaat && bladMaat.x >= -1 && bladMaat.x + bladMaat.width <= breedte + 1, bladMaat);
          await blad.locator('[data-jump="languages"]').click({ timeout: 2700 });
          controleer(`${breedte}/${plaats}: blad sluit na keuze en opent het onderdeel`, !(await blad.isVisible()) && (await maten()).actief === 'languages');
        } else {
          controleer(`${breedte}/${plaats}: vaste gids zichtbaar`, !!m.gids && m.gids.breedte > 0 && m.gids.rechts <= breedte + 1, m.gids);
          await pagina.locator('.mr-at-gids [data-jump="languages"]').click();
          await pagina.waitForTimeout(250);
          controleer(`${breedte}/${plaats}: gids opent het onderdeel`, (await maten()).actief === 'languages');
        }
        // Zoeken: Ctrl+K opent het venster en vindt een keuze diep in een groep.
        await pagina.keyboard.press('Control+k');
        await pagina.locator('.mr-at-kiezer input').fill('тихі');
        const treffers = await pagina.locator('.mr-at-treffer').count();
        const trefferTekst = (await pagina.locator('.mr-at-treffer').allInnerTexts()).join(' | ');
        controleer(`${breedte}/${plaats}: zoeken vindt «тихі години»`, treffers > 0 && trefferTekst.toLowerCase().includes('тихі години'), trefferTekst);
        await pagina.keyboard.press('Escape');
        controleer(`${breedte}/${plaats}: Esc sluit het zoeken`, !(await pagina.locator('.mr-at-kiezer').isVisible()));
        controleer(`${breedte}/${plaats}: geen JavaScript-fouten`, jsFouten.length === 0, jsFouten);
        if (breedte === 390) await pagina.screenshot({ path: join(uitvoer, 'telefoon-390.png'), fullPage: false });
        if (breedte === 390 || breedte === 320) {
          await pagina.evaluate(() => document.documentElement.classList.add('theme-light'));
          await pagina.locator('.mr-at.is-licht').waitFor();
          const licht = await maten();
          controleer(`${breedte}/${plaats}: licht thema binnen scherm`, licht.document <= breedte + 1 && !licht.uitstekers.length, licht);
          await pagina.screenshot({ path: join(uitvoer, `telefoon-${breedte}-licht.png`), fullPage: false });
        }
        if (breedte === 1280) await pagina.screenshot({ path: join(uitvoer, `computer-1280-${plaats}.png`), fullPage: false });
        await context.close();
      }
    }
  } finally { await browser.close(); await new Promise<void>(ok => server.close(() => ok())); }
  process.stdout.write(`Resultaat: ${fouten} mislukte controles.\n`);
  return fouten ? 1 : 0;
}
