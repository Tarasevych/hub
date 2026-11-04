// E2E etap 3 (13.10.2026) met een echte Chrome: mcp.* toont de richting «Міст ШІ → сайт» met «?» en de schakelaar
// «Простий / Розширений»; eigenaar standaard «розширений» (9 pagina's in het menu: 13 min de 4 beheerpagina's die alleen in het technisch profiel staan); «простий» → 3 pagina's, bewaard op de server
// en na herladen; een onderdeel uit «розширений» via een link → uitleg + één klik terug; ai.* toont «ШІ для вас» met een verwijzing
// naar mcp.*; telefoonbreedte; geen consolefouten.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com', AI = 'https://ai.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e weergave');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-wg-${T}@example.test`, sub = `sub-e2e-wg-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  let uid = '';
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    const r = await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    check('aanmelden op mcp gaf een sessie', r.cb.data.sessionCreated === true);
    uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');

    const ctx = await browser.newContext({ locale: 'uk-UA', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP, AI].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    const fouten: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { if (q.status() >= 400 && !/\/api\/owner\/agents\/activity$|\/downloads\/extension-version\.json$|\/api\/owner\/agents\/chat\/status$|\/api\/mcp\/server\/lezen$/.test(q.url())) fouten.push(`http ${q.status()} ${q.url()}`); });
    const paginas = () => page.locator('#canonical-submenu-mcp [data-local-tab]').count();
    const wachtWeergave = () => page.waitForResponse((q) => /\/api\/owner\/weergave(\/zet)?$/.test(q.url()), { timeout: 20000 }).catch(() => null);

    // ---------------------------------------------------------------- 1. mcp.* overzicht, eigenaar = розширений
    const w1 = wachtWeergave();
    await page.goto(`${MCP}/`, { waitUntil: 'domcontentloaded' });
    await w1;
    const band = page.locator('[data-richting="mcp"]');
    await band.waitFor({ timeout: 20000 });
    check('band «Міст ШІ → сайт» met de pijl ШІ-клієнт → двері → сайт', /Міст ШІ → сайт/.test(await band.innerText()) && await band.locator('.weergave-pijl li').count() === 3);
    check('verwijzing naar ai.* («ШІ для вас»)', /ai\.tarasevych\.com/.test(String(await band.locator('[data-richting-ander="ai"]').getAttribute('href'))));
    await page.waitForFunction(() => document.querySelector('[data-modus="expert"]')?.getAttribute('aria-checked') === 'true', null, { timeout: 10000 }).catch(() => undefined);
    check('eigenaar: standaard «Розширений»', await page.locator('[data-modus="expert"]').getAttribute('aria-checked') === 'true');
    await page.locator('#canonical-submenu-mcp').waitFor({ timeout: 10000 }).catch(() => undefined);
    const vol = await paginas();
    check('menu: 9 pagina\'s van mcp.* (13 min dashboard/apps/download/verbindingen: sitebeheer, alleen in het technisch profiel)', vol === 9, String(vol));
    await band.locator('.tech-vraag-knop').first().hover();
    const uitleg = page.locator('[data-tech-vraag]').first();
    await uitleg.waitFor({ timeout: 5000 });
    check('«?» bij de richting legt uit (Що це / Що зміниться)', /Що це/i.test(await uitleg.innerText()) && /ШІ → сайт/.test(await uitleg.innerText()));
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `${UIT}/weergave-1-mcp-uitgebreid.png` });

    // ---------------------------------------------------------------- 2. простий
    const w2 = wachtWeergave();
    await page.locator('[data-modus="eenvoudig"]').click();
    await w2;
    // «Додатки» is sitebeheer (audit 14.10) en staat zonder technisch profiel in geen enkele modus in het menu.
    await page.waitForFunction(() => document.querySelectorAll('#canonical-submenu-mcp [data-local-tab]').length === 3, null, { timeout: 10000 }).catch(() => undefined);
    const ids = await page.locator('#canonical-submenu-mcp [data-local-tab]').evaluateAll((els) => els.map((e) => `mcp/${e.getAttribute('data-local-tab')}`));
    check('простий: menu toont alleen огляд, агенти, підключити', ids.length === 3 && ['mcp/overview', 'mcp/agents', 'mcp/connect'].every((x) => ids.includes(x)), ids.join(','));
    check('keuze bewaard op de server', (await sys.query('SELECT modus FROM app.ui_weergave WHERE user_id=$1', [uid])).rows[0]?.modus === 'eenvoudig');
    await page.screenshot({ path: `${UIT}/weergave-2-mcp-eenvoudig.png` });
    const w3 = wachtWeergave();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-richting="mcp"]').waitFor({ timeout: 20000 });
    const metKopie = await paginas();
    await w3;
    check('na herladen: meteen простий (kopie, geen flikkeren) en nog steeds 3', metKopie === 3 && await paginas() === 3, String(metKopie));

    // ---------------------------------------------------------------- 3. onderdeel uit розширений via een link
    await page.goto(`${MCP}/dashboard`, { waitUntil: 'domcontentloaded' });
    const melding = page.locator('[data-weergave-expert]');
    await melding.waitFor({ timeout: 20000 });
    check('link naar «Панель розгортання» in простий: uitleg in plaats van inhoud', /розширеного режиму/.test(await melding.innerText()) && await page.locator('.mcp-estate h1', { hasText: 'Панель розгортання' }).count() === 0);
    await page.screenshot({ path: `${UIT}/weergave-3-melding.png` });
    await melding.locator('[data-modus-naar="expert"]').click();
    await page.locator('.mcp-estate h1', { hasText: 'Панель розгортання' }).waitFor({ timeout: 10000 }).catch(() => undefined);
    check('één klik → розширений en de inhoud verschijnt', await page.locator('.mcp-estate h1', { hasText: 'Панель розгортання' }).count() === 1 && await melding.count() === 0);
    await page.waitForFunction(() => document.querySelectorAll('#canonical-submenu-mcp [data-local-tab]').length === 9, null, { timeout: 10000 }).catch(() => undefined);
    check('menu weer 9 pagina\'s', await paginas() === 9);

    // ---------------------------------------------------------------- 4. ai.*
    await page.goto(`${AI}/`, { waitUntil: 'domcontentloaded' });
    const aiBand = page.locator('[data-richting="ai"]');
    await aiBand.waitFor({ timeout: 20000 }).catch(async () => { await page.screenshot({ path: `${UIT}/weergave-fout-ai.png` }); });
    check('ai.*: band «ШІ для вас», pijl Ви → сайт → провайдер, link naar mcp.*', /ШІ для вас/.test(await aiBand.innerText().catch(() => '')) && /mcp\.tarasevych\.com/.test(String(await aiBand.locator('[data-richting-ander="mcp"]').getAttribute('href').catch(() => ''))));
    check('ai.*: geen schakelaar (alleen op mcp.*)', await aiBand.locator('[data-modus]').count() === 0);
    await page.screenshot({ path: `${UIT}/weergave-4-ai.png` });

    // ---------------------------------------------------------------- 5. telefoon
    await page.setViewportSize({ width: 390, height: 820 });
    await page.goto(`${MCP}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-richting="mcp"]').waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    const tel = await page.evaluate(() => ({ pagina: document.documentElement.scrollWidth <= innerWidth + 1, band: (() => { const b = document.querySelector('[data-richting="mcp"]')!; return b.scrollWidth <= b.clientWidth + 1; })() }));
    check('telefoon: band en schakelaar passen, geen horizontaal scrollen', tel.pagina && tel.band, JSON.stringify(tel));
    await page.screenshot({ path: `${UIT}/weergave-5-telefoon.png` });

    check('geen consolefouten of onverwachte http-fouten', fouten.length === 0, fouten.slice(0, 5).join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    if (uid) await sys.query('DELETE FROM app.ui_weergave WHERE user_id=$1', [uid]).catch(() => undefined);
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
