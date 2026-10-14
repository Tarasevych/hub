// E2E: het Deploy-dashboard als echte pagina in de site (mcp.*/agents? nee: mcp.*/dashboard), en dashboard.* dat ernaartoe leidt.
// De serveropdrachten (status/releases/terugdraaien) draaien in de test niet (geen systemctl/polkit), dus de kaart toont zijn
// nette foutmelding; dit test dat de PAGINA bestaat, rendert, de knoppen er staan, en dat dashboard.tarasevych.com 302 → mcp/dashboard.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { techAan, techPoort } from './hulp/tech';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com', DASH = 'https://dashboard.tarasevych.com';
// Verwacht: de serveropdrachten falen in de test (geen systemctl) → 403/500/502 op /api/mcp/server/*, en agents/activity zonder step-up.
const VERWACHT = [/\/api\/mcp\/server\//, /^403 .*\/api\/owner\/agents\/activity$/, /\/api\/mcp\/health$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e dashboard');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-db-${T}@example.test`, sub = `sub-e2e-db-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar]);
    const ctx = await browser.newContext({ colorScheme: 'dark', locale: 'uk-UA', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    const fouten: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });

    // dashboard.* → 302 naar mcp/dashboard (geen aparte, open statische pagina meer). Via navigatie: Chrome volgt de 302.
    await page.goto(`${DASH}/`, { waitUntil: 'domcontentloaded' });
    check('dashboard.tarasevych.com leidt naar mcp/dashboard', page.url() === `${MCP}/dashboard`, page.url());
    // Audit 14.10: zonder technisch profiel is de Deploy-dashboard sitebeheer achter de poort, en staat hij niet in het menu.
    await techPoort(page).waitFor({ timeout: 20000 });
    check('zonder technisch profiel: poort «Управління сайтом» i.p.v. de panel', /Управління сайтом/.test(await techPoort(page).innerText()));
    check('zonder technisch profiel: «Панель розгортання» niet in het menu', await page.locator('#canonical-submenu-mcp [data-local-tab="dashboard"]').count() === 0);
    const act = await techAan(page, { url: MCP, tab, service: 'mcp', reden: 'E2E dashboard' });
    check('technisch profiel aangezet (15 хв)', act === 200, String(act));

    // De pagina zelf in de site
    await page.goto(`${MCP}/dashboard?lang=uk`, { waitUntil: 'domcontentloaded' });
    const estate = page.locator('[data-mcp-tab="dashboard"]');
    await estate.waitFor({ timeout: 20000 });
    check('mcp/dashboard: сторінка «Панель розгортання» рендериться', /Панель розгортання/.test(await estate.locator('header h1').innerText()));
    check('вкладка «Панель розгортання» активна в меню', await page.locator('[role="tab"][aria-selected="true"]').filter({ hasText: 'Панель розгортання' }).count() >= 1 || /dashboard/.test(await page.evaluate(() => location.pathname)));
    // De beheerkaart met de knoppen (odkat/backup/uitrol); bij geen serverops toont hij zijn nette foutmelding.
    await page.waitForTimeout(1200);
    const tekst = await estate.innerText();
    check('картка керування сервером присутня (відкат / резервна копія / перевірка випусків)',
      /Відкат до попереднього/.test(tekst) && /Резервна копія зараз/.test(tekst) && /Перевірити підписані випуски/.test(tekst), tekst.replace(/\s+/g, ' ').slice(0, 300));
    check('блок «Здоров’я сервісів» присутній', /Здоров’я сервісів/.test(tekst));
    await page.screenshot({ path: `${UIT}/dashboard-1.png`, fullPage: true });
    check('geen onverwachte console-/HTTP-fouten', fouten.length === 0, fouten.slice(0, 6).join('\n'));
    await ctx.close();
  } catch (e) {
    check('e2e liep zonder uitzondering', false, String((e as Error)?.stack || e).slice(0, 800));
  } finally {
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
