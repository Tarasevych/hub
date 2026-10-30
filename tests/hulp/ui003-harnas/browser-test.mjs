// Gebruik (UI-003): mkdir -p tests/hulp/ui003-harnas/public && cp public/canonical-service.js tests/hulp/ui003-harnas/public/ && npx vite build -c tests/hulp/ui003-harnas/vite.config.mjs && node tests/hulp/ui003-harnas/browser-test.mjs
// UI-003 browsertest: harnas met nagebootste antwoorden; controles + schermafbeeldingen voor/na (390/768/1440, licht/donker).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
const { chromium } = createRequire(import.meta.url)('/workspace/e2e-tools/node_modules/playwright-core');
const DIST = new URL('./dist/', import.meta.url).pathname, UIT = process.env.UIT || '/workspace/wp-ui003/screens';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const srv = createServer(async (q, r) => { const p = join(DIST, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/^\/$/, '/index.html')); try { const b = await readFile(p); r.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); } });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const BASIS = `http://127.0.0.1:${srv.address().port}/index.html`;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
let goed = 0, fout = 0; const fouten = [];
const check = (n, v) => { if (v) goed++; else { fout++; fouten.push(n); } console.log(`${v ? '✔' : '✘'} ${n}`); };
const open = async (qs, w = 1440, o = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, hasTouch: w < 800, isMobile: w < 500, locale: 'uk-UA', reducedMotion: 'reduce', timezoneId: 'Europe/Brussels' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${BASIS}?${qs}`); await page.waitForSelector(o.wacht || '[data-vbc-centrum=""], [data-cvi-centrum], [role=alert]', { timeout: 15000 }); await page.waitForTimeout(500);
  return { ctx, page, errs };
};
const tekst = (p) => p.evaluate(() => document.body.innerText);
const overloop = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
try {
  // ---- statussen en knoppen (scenario meer)
  { const { ctx, page, errs } = await open('s=meer');
    check('kop met hoofdactie «Додати підключення»', await page.locator('[data-vbc-actie=toevoegen]').count() === 1);
    check('vier secties aanwezig', (await page.locator('#vbc-mijn, #vbc-catalogus, #vbc-sync, #vbc-historie').count()) === 4);
    const ok = await page.locator('[data-vbc-tel=ok] strong').innerText(), aand = await page.locator('[data-vbc-tel=aandacht] strong').innerText();
    check(`telling werkt=2 (g1 + OneDrive) en aandacht=2 (g2 reauth, g3 syncfout): ${ok}/${aand}`, ok === '2' && aand === '2');
    check('g1 stand ok, g2 aandacht, g3 aandacht', await page.locator('[data-vbc-account=g1]').getAttribute('data-vbc-stand') === 'ok' && await page.locator('[data-vbc-account=g2]').getAttribute('data-vbc-stand') === 'aandacht' && await page.locator('[data-vbc-account=g3]').getAttribute('data-vbc-stand') === 'aandacht');
    check('g2 (reauth) heeft «Повторно підключити»', await page.locator('[data-vbc-account=g2] [data-vbc-actie=opnieuw]').count() === 1);
    check('g3 (tijdelijke syncfout) heeft geen «Повторно підключити», wel uitleg «wachten»', await page.locator('[data-vbc-account=g3] [data-vbc-actie=opnieuw]').count() === 0 && await page.locator('[data-vbc-account=g3] [data-vbc-probleem=wachten]').count() === 1);
    check('g1 zonder probleemmelding', await page.locator('[data-vbc-account=g1] [data-vbc-probleem]').count() === 0);
    check('precies één «Додати акаунт»', await page.locator('[data-vbc-actie=extra-account]').count() === 1);
    const t = await tekst(page);
    check('hoofdoppervlak zonder env-namen/staging/interne codes', !/CLOUD_|_CLIENT_|STAGING|staging|GOOGLE_TOKEN|DRIVE_HTTP|AES-256/.test(t));
    check('één «?» per blok (4 blokken, 4 vragen)', await page.locator('[data-vbc-vraag]').count() === 4);
    await page.locator('[data-vbc-actie=beheren]').first().click(); check('«Керувати» → tab google (bestaand beheer)', await page.evaluate(() => window.__naar) === 'google');
    await page.locator('[data-vbc-account=g2] details.vbc-tech summary').click(); check('technische details tonen de interne code pas na uitklappen', (await tekst(page)).includes('GOOGLE_TOKEN_REFRESH_FAILED'));
    // catalogus
    check('OneDrive verbonden → niet in catalogus-groep beperkt', await page.locator('[data-vbc-groep=beperkt] [data-vbc-aanbieder=onedrive]').count() === 0);
    check('Dropbox/Box: «beperkt», zonder koppelknop', await page.locator('[data-vbc-groep=beperkt] [data-vbc-aanbieder=dropbox]').count() === 1 && await page.locator('[data-vbc-aanbieder=dropbox] [data-vbc-actie=koppelen]').count() === 0);
    check('iCloud/Proton: «onmogelijk», zonder koppelknop', await page.locator('[data-vbc-groep=onmogelijk] [data-vbc-aanbieder=icloud-drive]').count() === 1 && await page.locator('[data-vbc-groep=onmogelijk] [data-vbc-actie=koppelen]').count() === 0);
    check('geplande adapters zonder koppelknop', await page.locator('[data-vbc-groep=gepland] [data-vbc-actie=koppelen]').count() === 0 && await page.locator('[data-vbc-groep=gepland] li').count() >= 3);
    await page.locator('[data-vbc-aanbieder=dropbox] [data-vbc-actie=details]').click();
    check('Dropbox details: eenvoudige uitleg zichtbaar, env-namen alleen in ingeklapte admin-details', await page.locator('[data-vbc-tech=dropbox]').count() === 1 && !(await page.locator('[data-vbc-aanbieder=dropbox] .vbc-details > p').allInnerTexts()).join(' ').includes('CLOUD_'));
    await page.locator('[data-vbc-actie=toevoegen]').click(); await page.waitForTimeout(400);
    check('«Додати підключення» brengt de focus naar de catalogus', await page.evaluate(() => document.activeElement?.id) === 'vbc-catalogus');
    check('historie: 2 echte taken', await page.locator('[data-vbc-taak]').count() === 2);
    // koppelen → popup + peilen
    const [pop] = await Promise.all([ctx.waitForEvent('page'), page.locator('[data-vbc-account=g2] [data-vbc-actie=opnieuw]').click()]);
    await page.waitForTimeout(400);
    check('«Повторно підключити» opent het Google-venster via de bestaande route en toont de wachtmelding', Boolean(pop) && (await page.evaluate(() => window.__roepen.some((u) => u.includes('/providers/google/connect/start')))) && (await tekst(page)).includes('Вікно входу Google відкрито'));
    const n = await page.evaluate(() => window.__roepen.filter((u) => u.includes('/integraties')).length);
    check(`geen dubbele statusverzoeken bij openen (integraties=${n} incl. 1 na start-route? ≤2)`, n <= 2);
    check('geen JS-fouten', errs.length === 0); if (errs.length) console.log(errs);
    await ctx.close(); }
  // ---- leeg
  { const { ctx, page } = await open('s=leeg');
    check('leeg: lege staat + «Підключити Google Drive»', await page.locator('[data-vbc-leeg=mijn] [data-vbc-actie=google-koppelen]').count() === 1);
    check('leeg: niets heet gekoppeld', await page.locator('[data-vbc-tel=ok] strong').innerText() === '0' && await page.locator('[data-vbc-soort=verbonden]').count() === 0);
    check('leeg: historie eerlijk leeg', await page.locator('[data-vbc-leeg=historie]').count() === 1);
    await ctx.close(); }
  // ---- fout + netwerk
  for (const s of ['fout', 'netwerk']) { const { ctx, page } = await open(`s=${s}`, 1440, { wacht: '[role=alert]' });
    check(`${s}: begrijpelijke foutmelding met «Ще раз», geen ruwe code`, await page.locator('[role=alert] button').count() === 1 && !(await tekst(page)).includes('CLOUD_VNEXT_FOUT'));
    await ctx.close(); }
  // ---- nl
  { const { ctx, page } = await open('s=meer&lang=nl'); const t = await tekst(page);
    check('nl: Nederlandse koppen', t.includes('Mijn koppelingen') && t.includes('Catalogus van diensten') && !/Мої підключення/.test(t)); await ctx.close(); }
  // ---- schermafbeeldingen + overloop + tik-doelen
  for (const w of [390, 768, 1440]) for (const thema of ['licht', 'donker']) {
    for (const voor of [true, false]) {
      const { ctx, page } = await open(`s=meer&thema=${thema}${voor ? '&voor=1' : ''}`, w);
      await page.screenshot({ path: `${UIT}/${voor ? 'voor' : 'na'}-${w}-${thema}.png`, fullPage: true });
      if (!voor) {
        check(`na ${w} ${thema}: geen horizontale scroll`, (await overloop(page)) <= 0);
        if (w === 390) { const klein = await page.evaluate(() => [...document.querySelectorAll('.vbc-knop')].filter((b) => b.getBoundingClientRect().height < 32 && b.offsetParent).length); check(`na 390 ${thema}: knoppen ≥ 32/44 px`, klein === 0); }
      }
      await ctx.close();
    }
  }
  { const { ctx, page } = await open('s=leeg', 390); await page.screenshot({ path: `${UIT}/na-390-licht-leeg.png`, fullPage: true }); await ctx.close(); }
} finally { await browser.close(); srv.close(); }
console.log(`\n${goed} goed, ${fout} fout`); if (fout) { console.log(fouten); process.exit(1); }
