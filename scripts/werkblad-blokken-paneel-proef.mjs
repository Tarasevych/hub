// Browsercontrole van het eigenschappenpaneel (Werkblad «Blokken», stroom C) met een nep-toestand — ALLEEN LOKAAL.
// Bundelt src/werkblad/blokken/EigenschappenProef.tsx, serveert op 127.0.0.1 en stuurt een echte Chrome (playwright-core).
// Netwerkslot: Chrome mapt elke host behalve 127.0.0.1 naar ~NOTFOUND; dit proces opent alleen loopback.
// Gebruik: PLAYWRIGHT_CORE=… node scripts/werkblad-blokken-paneel-proef.mjs [uitmap]
import { build } from 'esbuild';
import http from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const uitmap = process.argv[2] || '/workspace/audit-blokken';
await mkdir(uitmap, { recursive: true });
await mkdir('rapporten', { recursive: true });
const map = await mkdtemp(join('rapporten', 'paneel-'));
const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || '/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
let code = 0;
const res = [];
const check = (naam, ok, info = '') => { res.push(ok); if (!ok) code = 1; console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
let server, browser;
try {
  await build({ entryPoints: ['src/werkblad/blokken/EigenschappenProef.tsx'], outdir: map, bundle: true, format: 'esm', jsx: 'automatic', loader: { '.css': 'css' }, define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' });
  const tokens = await readFile('src/ontwerp/tokens.css', 'utf8');
  const js = await readFile(join(map, 'EigenschappenProef.js'), 'utf8');
  const css = await readFile(join(map, 'EigenschappenProef.css'), 'utf8');
  const html = (thema) => `<!doctype html><html lang="uk" class="${thema}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${tokens}\n${css}\nbody{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,sans-serif}</style></head><body><div id="wortel"></div><script type="module" src="/app.js"></script></body></html>`;
  server = http.createServer((q, a) => {
    if (q.url === '/app.js') { a.writeHead(200, { 'content-type': 'text/javascript' }); return a.end(js); }
    const thema = q.url.includes('donker') ? 'theme-dark' : 'theme-light';
    a.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); a.end(html(thema));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const poort = server.address().port;
  browser = await pw.chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--no-sandbox'] });

  for (const [bw, bh] of [[1280, 860], [390, 844]]) for (const thema of ['licht', 'donker']) {
    const tag = `${bw}-${thema}`;
    const ctx = await browser.newContext({ viewport: { width: bw, height: bh }, hasTouch: bw < 500, colorScheme: thema === 'donker' ? 'dark' : 'light' });
    const page = await ctx.newPage();
    const fouten = []; page.on('pageerror', (e) => fouten.push(String(e))); page.on('console', (m) => m.type() === 'error' && fouten.push(m.text()));
    page.on('dialog', (d) => { fouten.push('native dialoog: ' + d.type()); d.dismiss(); });
    await page.goto(`http://127.0.0.1:${poort}/${thema}`);
    const paneel = page.locator('.eig-paneel');
    await paneel.waitFor();
    check(`${tag}: paneel zichtbaar met titel`, await paneel.getByRole('heading', { name: 'Властивості' }).isVisible());

    // (?) maat en tikvlak
    const hulp = paneel.locator('.eig-hulp-knop').first();
    const hb = await hulp.boundingBox();
    check(`${tag}: (?) is rond 24px`, Math.round(hb.width) === 24 && Math.round(hb.height) === 24, `${hb.width}x${hb.height}`);
    const tik = await hulp.evaluate((el) => { const s = getComputedStyle(el, '::after'); return [parseFloat(s.width), parseFloat(s.height)]; });
    check(`${tag}: (?) tikvlak ≥44px`, tik[0] >= 44 && tik[1] >= 44);
    await hulp.click();
    check(`${tag}: (?) toont uitleg`, await paneel.locator('.eig-hulp-tekst').first().isVisible());
    await page.keyboard.press('Escape');

    // geval 1: Великі значки
    await paneel.locator('[data-voorinstelling="grote-iconen"]').click();
    await page.waitForSelector('.eig-voortgang.bewaard', { timeout: 3000 });
    check(`${tag}: voorinstelling → «Збережено»`, (await paneel.locator('.eig-voortgang').innerText()).includes('Збережено'));
    check(`${tag}: indeling rasterMinCel 120`, (await page.locator('[data-staat]').innerText()).includes('"rasterMinCel":120'));

    // tabbladen + toetsenbord
    await paneel.getByRole('tab', { name: 'Розмір' }).focus();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    check(`${tag}: pijltjes wisselen tab → Розташування`, await paneel.getByRole('tab', { name: 'Розташування' }).getAttribute('aria-selected') === 'true');
    await paneel.getByRole('radio', { name: 'Колонка' }).click();
    check(`${tag}: modus kolom`, (await page.locator('[data-staat]').innerText()).includes('"modus":"kolom"'));
    await paneel.locator('[data-pad="indeling.modus"] .eig-herstel').click();
    await page.waitForTimeout(50);
    check(`${tag}: Скинути modus → raster`, (await page.locator('[data-staat]').innerText()).includes('"modus":"raster"'));
    await page.keyboard.press('Control+z');
    check(`${tag}: Ctrl+Z → kolom terug`, (await page.locator('[data-staat]').innerText()).includes('"modus":"kolom"'));
    await paneel.getByRole('button', { name: /Повторити/ }).click();
    await paneel.getByRole('button', { name: /Скасувати дію/ }).click();
    check(`${tag}: knop Скасувати дію → kolom`, (await page.locator('[data-staat]').innerText()).includes('"modus":"kolom"'));
    await paneel.getByRole('button', { name: /Повторити/ }).click();
    check(`${tag}: knop Повторити → raster`, (await page.locator('[data-staat]').innerText()).includes('"modus":"raster"'));
    await paneel.getByRole('radio', { name: 'Вільно' }).click();
    const sw = paneel.getByRole('switch', { name: 'Дозволити накладання' });
    await sw.click();
    check(`${tag}: «Дозволити накладання» schakelt`, await sw.getAttribute('aria-checked') === 'true');

    // geval 2: één icoon groter
    await page.locator('[data-kies="mail"]').click();
    await paneel.getByRole('tab', { name: 'Розмір' }).click();
    await paneel.locator('[data-pad="icoon.grootte"]').getByRole('radio', { name: 'Пікселі' }).click();
    const getal = paneel.locator('[data-pad="icoon.grootte"] input[type=number]');
    await getal.fill('72'); await getal.press('Enter');
    check(`${tag}: icoon 72px in voorbeeld`, await paneel.locator('.eig-vb-icoon').getAttribute('data-icoon-px') === '72');
    await paneel.locator('[data-pad="afmeting.breedte"]').getByRole('radio', { name: 'Відсотки' }).click();
    check(`${tag}: eenheid zichtbaar «% ширини блоку»`, await paneel.getByText('% ширини блоку').isVisible());

    // kleuren + contrast
    await paneel.getByRole('tab', { name: 'Вигляд' }).click();
    const tg = paneel.getByRole('group', { name: 'Текст' });
    await tg.getByRole('radio', { name: 'Свій колір' }).click();
    await tg.locator('.eig-hex').fill('#bbbbbb');
    const ag = paneel.getByRole('group', { name: 'Тло' });
    await ag.getByRole('radio', { name: 'Свій колір' }).click();
    await ag.locator('.eig-hex').fill('#ffffff');
    check(`${tag}: contrastwaarschuwing < 4,5`, await paneel.locator('.eig-contrast.laag').isVisible());
    await tg.locator('.eig-hex').fill('#111111');
    const ig = paneel.getByRole('group', { name: 'Значок' });
    await ig.getByRole('radio', { name: 'Свій колір' }).click();
    await ig.locator('.eig-hex').fill('#1a3a8a');
    check(`${tag}: contrast goed na donkere tekst`, await paneel.locator('.eig-contrast.goed').isVisible());
    await paneel.locator('.eig-contrast').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(uitmap, `c-${tag}-uiterlijk.png`) });

    // apparaten + vergrendelen
    await paneel.getByRole('tab', { name: 'Пристрої' }).click();
    await paneel.getByRole('radiogroup', { name: 'Телефон' }).getByRole('radio', { name: 'Сховати' }).click();
    check(`${tag}: telefoon verbergen → Скинути actief`, await paneel.locator('[data-pad="apparaten"] .eig-herstel').isEnabled());
    await paneel.getByRole('checkbox', { name: 'Заблокувати' }).check();
    check(`${tag}: vergrendeld → velden uit`, await paneel.getByRole('radiogroup', { name: 'Телефон' }).getByRole('radio').first().isDisabled());
    await paneel.getByRole('checkbox', { name: 'Заблокувати' }).uncheck();

    // fout + opnieuw proberen
    await page.evaluate(() => { window.__proef.faal = true; });
    await paneel.getByRole('button', { name: 'Скинути все' }).click();
    await page.waitForSelector('.eig-voortgang.mislukt', { timeout: 3000 });
    check(`${tag}: fout toont «Спробувати знову»`, await paneel.getByRole('button', { name: 'Спробувати знову' }).isVisible());
    await page.evaluate(() => { window.__proef.faal = false; });
    await paneel.getByRole('button', { name: 'Спробувати знову' }).click();
    await page.waitForSelector('.eig-voortgang.bewaard', { timeout: 3000 });
    check(`${tag}: opnieuw proberen → Збережено`, true);

    // layout: voetknoppen binnen beeld, één scrollgebied, geen horizontale overloop
    const pb = await paneel.boundingBox();
    const voet = await paneel.locator('.eig-voet').boundingBox();
    check(`${tag}: voetknoppen binnen het scherm`, voet.y + voet.height <= bh + 1, `${voet.y + voet.height} ≤ ${bh}`);
    check(`${tag}: paneel niet breder dan scherm`, pb.x >= 0 && pb.x + pb.width <= bw + 1);
    const breed = await page.evaluate(() => [...document.querySelectorAll('.eig-paneel *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed'; }).map((e) => e.className || e.tagName).slice(0, 5));
    check(`${tag}: niets in het paneel steekt buiten het scherm`, breed.length === 0, breed.join(','));
    if (bw < 500) check(`${tag}: onderblad onderaan`, Math.abs(pb.y + pb.height - bh) < 2);
    await paneel.getByRole('tab', { name: 'Розмір' }).click();
    await page.screenshot({ path: join(uitmap, `c-${tag}.png`) });
    check(`${tag}: geen JS-fouten/native dialogen`, fouten.length === 0, fouten.join(' | '));
    await ctx.close();
  }
} catch (e) { console.error(e); code = 1; }
finally { await browser?.close(); server?.close(); await rm(map, { recursive: true, force: true }); }
console.log(`\nwerkblad-blokken-paneel (browser): ${res.filter(Boolean).length}/${res.length} geslaagd`);
process.exit(code);
