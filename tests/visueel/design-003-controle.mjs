import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const uitvoer = 'uitvoer/design-003';
await mkdir(uitvoer, { recursive: true });
const server = await createServer({
  logLevel: 'error',
  optimizeDeps: { entries: ['tests/visueel/design-003-agenten.html'] },
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await server.listen();
  const oorsprong = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const kanalen = { site: '#orch', browser: '#browser', pc: '#apparaten', server: '#technisch' };
  const fouten = [];
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1150, height: 850 } });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async tekst => { window.gekopieerdInProef = tekst; } } });
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      const gegevens = {
        '/api/owner/connector-v2/overzicht': { agenten: [], account: { eigenaar: false }, poort: null },
        '/api/owner/ai-bevestiging/lijst': { items: [] },
        '/api/owner/agents/journaal': { items: [], nextCursor: null },
        '/api/mcp/tokens/list': { tokens: [] },
        '/api/mcp/permissions': { permissions: {}, catalog: [] },
      };
      return route.fulfill({ json: gegevens[url.pathname] || {} });
    }
    return url.origin === oorsprong ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', fout => fouten.push(fout.message));
  const open = async (deel, taal, thema, paneel) => {
    const query = new URLSearchParams({ deel, lang: taal, thema, paneel: String(paneel) });
    await page.goto(oorsprong + '/tests/visueel/design-003-agenten.html?' + query, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  };

  // De echte tweede kaart moet in dezelfde rij blijven als de eerste na uitklappen.
  await open('bord', 'uk', 'light', 500);
  const rooster = page.locator('.ag-bord');
  const kaarten = rooster.locator('[data-agent]');
  await rooster.locator('[data-agent]').first().waitFor({ timeout: 90_000 });
  assert(await kaarten.count() > 2);
  await page.waitForFunction(() => document.querySelector('.ag-bord')?.dataset.kolommen === '2');
  const eerste = kaarten.nth(0);
  const tweede = kaarten.nth(1);
  await eerste.focus();
  await page.keyboard.press('Enter');
  const detail = rooster.getByRole('region');
  await detail.waitFor();
  assert.equal(await eerste.getAttribute('aria-expanded'), 'true');
  assert.equal(await eerste.getAttribute('aria-controls'), await detail.getAttribute('id'));
  const a = await eerste.boundingBox(), b = await tweede.boundingBox(), p = await detail.boundingBox();
  assert(Math.abs(a.y - b.y) < 2 && b.x > a.x && p.y >= Math.max(a.y + a.height, b.y + b.height) - 1);
  await page.screenshot({ path: uitvoer + '/bord-500-uk.png' });
  await page.setViewportSize({ width: 380, height: 800 });
  await page.waitForFunction(() => document.querySelector('.ag-bord')?.dataset.kolommen === '1');
  const smal = await detail.boundingBox(), buur = await tweede.boundingBox();
  assert(smal.y + smal.height <= buur.y + 1);
  await rooster.locator('[data-agent="antigravity"]').click();
  assert.match(await detail.locator('[data-knop="agent-pagina"]').getAttribute('href'), /#agent\/antigravity$/);
  assert.equal(await rooster.locator('[aria-expanded="true"]').count(), 1);

  const standen = [
    { width: 320, paneel: 500, taal: 'nl', thema: 'dark' },
    { width: 380, paneel: 500, taal: 'uk', thema: 'light' },
    { width: 1150, paneel: 500, taal: 'nl', thema: 'light' },
    { width: 1280, paneel: 1100, taal: 'uk', thema: 'dark' },
  ];
  for (const {width, paneel, taal, thema} of standen) {
    await page.setViewportSize({ width, height: 830 });
    await open('profiel', taal, thema, paneel);
    const brug = page.locator('[data-agent-sectie="brug"]');
    await brug.waitFor();
    assert.equal(await brug.getByRole('tab').count(), 4);
    assert.match(await brug.locator('[data-brug-verbonden]').innerText(), taal === 'uk' ? /Готовий/ : /Klaar/);
    for (const [kanaal, pad] of Object.entries(kanalen)) {
      const knop = brug.locator('[data-brug-kanaal="' + kanaal + '"]');
      await knop.click();
      const actief = brug.locator('[data-brug-actief-kanaal="' + kanaal + '"]');
      await actief.waitFor();
      assert.equal(await knop.getAttribute('aria-selected'), 'true');
      assert.equal(await actief.locator('[data-brug-open]').getAttribute('href'), pad);
      const cli = await actief.locator('code').innerText();
      await actief.locator('[data-brug-kopieer="cmd-' + kanaal + '"]').click();
      assert.equal(await page.evaluate(() => window.gekopieerdInProef), cli);
      await actief.locator('[data-brug-kopieer="rpc-' + kanaal + '"]').click();
      assert.match(await page.evaluate(() => window.gekopieerdInProef), /mijn-ruimte/);
      const buiten = await brug.evaluate(el => {
        const box = el.getBoundingClientRect();
        return Array.from(el.querySelectorAll('button, a, code')).filter(k => {
          const r = k.getBoundingClientRect();
          return r.left < Math.max(0, box.left) - 1 || r.right > Math.min(innerWidth, box.right) + 1 ||
            (innerWidth <= 380 && k.tagName !== 'CODE' && r.height < 43.9);
        }).map(k => ({ tekst: k.textContent, breedte: k.clientWidth, hoogte: k.getBoundingClientRect().height }));
      });
      assert.deepEqual(buiten, [], kanaal + ' · ' + width + ' px');
    }
    const info = await brug.locator('.ag-diagnose-info').boundingBox(), acties = await brug.locator('.ag-diagnose-acties').boundingBox();
    if (paneel >= 1000) assert(acties.x >= info.x + info.width - 1);
    else assert(acties.y >= info.y + info.height - 1);
    await brug.screenshot({ path: uitvoer + '/brug-' + width + '-' + paneel + '-' + taal + '.png' });
    console.log('OK ' + width + ' px / paneel ' + paneel + ' / ' + taal + ' / ' + thema + ' / 4 kanalen');
  }
  assert.deepEqual(fouten, []);
  console.log('OK kaarten en toetsenbord, paneelbreedte, taal, alle kanalen en kopieeracties');
} finally {
  await browser?.close();
  await server.close();
}
