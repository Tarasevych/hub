// E2E: ai.*/verbindingen — єдиний хаб підключень ШІ з підвкладками (реорганізація A2/A3).
// Перевіряє: сторінка відкривається, є підвкладки «Підключення ШІ» і «Конектори», перемикання працює (hash),
// технічна підвкладка з'являється лише з активним технічним профілем. Телефон без горизонтального скролу.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { techAan } from './hulp/tech';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', AI = 'https://ai.tarasevych.com', MCP = 'https://mcp.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e verbindingen-hub');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-vh-${T}@example.test`, sub = `sub-e2e-vh-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    const r = await b.aanmelden(sub, eigenaar, { service: 'ai', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    check('aanmelden', r.cb.data.sessionCreated === true);
    void pool;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'uk-UA', serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, AI, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    const fouten: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));

    // ---- 1. хаб відкривається, дві підвкладки (без техпрофілю)
    await page.goto(`${AI}/verbindingen`, { waitUntil: 'domcontentloaded' });
    const hub = page.locator('[data-verbindingen-hub]');
    await hub.waitFor({ timeout: 20000 });
    check('хаб ai/verbindingen відкрився', await page.locator('h1', { hasText: 'Підключення ШІ' }).count() >= 1);
    check('підвкладки: Підключення ШІ + Конектори (без техпрофілю — без «Технічні»)',
      await page.locator('[data-verbindingen-sub="bord"]').count() === 1 && await page.locator('[data-verbindingen-sub="connectors"]').count() === 1 && await page.locator('[data-verbindingen-sub="tech"]').count() === 0);
    await page.screenshot({ path: `${UIT}/vh-1-bord.png` });

    // ---- 2. перемикання на Конектори
    await page.locator('[data-verbindingen-sub="connectors"]').click();
    await page.locator('[data-v2-tab="connectors"]').waitFor({ timeout: 15000 });
    check('підвкладка «Конектори»: вмонтовано вкладку конектора v2', await page.locator('[data-v2-tab="connectors"]').count() === 1);
    check('url має #connectors', /#connectors$/.test(page.url()), page.url());
    await page.screenshot({ path: `${UIT}/vh-2-connectors.png` });

    // ---- 3. технічний профіль → з'являється «Технічні підключення»
    check('технічний профіль аан', (await techAan(page, { url: AI, tab, service: 'ai', reden: 'E2E verbindingen-hub' })) === 200);
    await page.goto(`${AI}/verbindingen`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-verbindingen-sub="tech"]').waitFor({ timeout: 15000 });
    check('з активним техпрофілем з\'явилася підвкладка «Технічні підключення»', await page.locator('[data-verbindingen-sub="tech"]').count() === 1);

    // ---- 4. телефон 390 px
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${AI}/verbindingen`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-verbindingen-hub]').waitFor({ timeout: 15000 });
    const breed = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('телефон 390 px: без горизонтального скролу', breed <= 1, String(breed));
    check('без помилок у консолі', fouten.length === 0, fouten.join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
