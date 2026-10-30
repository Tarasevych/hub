// E2E «Huis — beginscherm» (UI-005/BUG-001, migratie 0131): huis.tarasevych.com met vlag huis-vnext AAN, een NIEUWE gebruiker zonder
// woning en — belangrijk — onder de echte app-rol (DATABASE_URL_APP → mijnruimte_app, RLS geldt), zoals op productie.
//   1. Beginscherm: laden → onboarding met drie acties (Створити оселю / Підключити платформу / Переглянути демонстрацію), geen fout.
//   2. Eerste woning aanmaken → overzicht; herladen → dezelfde woning, geen fout (heropenen).
//   3. Serverfout (nagebootst 500 op /api/huis/woningen): rustige foutkaart met «Спробувати ще раз», GEEN aanmaakformulier en geen
//      ruwe tekst als «Internal server error»; opnieuw proberen herstelt.
//   4. «Підключити платформу» zonder woning: eerlijke uitleg (eerst een oselя) en na aanmaken direct naar Integraties.
//   5. Showroom opent als demonstratie (label «Демо»). 390/768/1440, licht en donker: geen horizontale scroll.
// Gebruik: E2E_HV_VOOR=1 alleen schermafbeeldingen (voor de oude versie). PLAYWRIGHT_CORE=… node scripts/e2e-lokaal.mjs huis-start
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || 'rapporten/huis-start';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const VOOR = process.env.E2E_HV_VOOR === '1';
const HOSTS = ['id', 'mcp', 'mail', 'hub', 'admin', 'cloud', 'ai', 'huis'].map((h) => `https://${h}.tarasevych.com`);
const HUIS = 'https://huis.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e huis-start');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const pool = getPool();
  const maak = async (label: string) => { const T = `${Date.now()}-${randomBytes(2).toString('hex')}`; return { email: `e2e-hs-${label}-${T}@example.test`, sub: `sub-e2e-hs-${label}-${T}` }; };
  const eig = await maak('eig');
  const { G, stop } = await startE2eServer({ ownerEmail: eig.email, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const vlagWas = (await pool.query(`SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'huis-vnext'`)).rows[0] ?? { aan: false, standaard: false };
  await pool.query(`UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel = 'huis-vnext'`);
  const fouten: string[] = [];
  try {
    const b = G.browser();
    const tab = b.tab;
    await b.aanmelden(eig.sub, eig.email, { service: 'huis', tabContext: tab, intent: 'login' });
    const sessie = async (o: { scheme?: 'light' | 'dark'; w?: number; h?: number; mobiel?: boolean; pad?: string; storing?: boolean }) => {
      const ctx = await browser.newContext({ colorScheme: o.scheme || 'light', reducedMotion: 'reduce', locale: 'uk-UA', viewport: { width: o.w || 1440, height: o.h || 900 }, hasTouch: !!o.mobiel, isMobile: !!o.mobiel, timezoneId: 'Europe/Brussels', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((tb) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', tb); sessionStorage.removeItem('mr-vlag:huis-vnext'); }, tab);
      const storing = { aan: !!o.storing };
      await ctx.route('**/api/huis/woningen', (r) => (storing.aan ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal server error' }) }) : r.continue()));
      const page = await ctx.newPage();
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { if (q.status() >= 500 && /\/api\/huis\//.test(q.url()) && !storing.aan) fouten.push(`http ${q.status()} ${q.url()}`); });
      await page.goto(`${HUIS}${o.pad || '/'}?lang=uk`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      return { ctx, page, storing };
    };
    const overloop = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const MATEN = [[390, 844, true], [768, 1024, false], [1440, 900, false]] as const;

    // 1. beginscherm, alle maten en thema's
    for (const scheme of ['light', 'dark'] as const) for (const [w, h, m] of MATEN) {
      const { ctx, page } = await sessie({ scheme, w, h, mobiel: m });
      await page.locator('[data-hv-start], [data-hv-fout-kaart]').first().waitFor({ timeout: 20000 }).catch(() => undefined);
      await page.screenshot({ path: join(UIT, `${VOOR ? 'voor' : 'na'}-start-${w}-${scheme}.png`), fullPage: true });
      if (!VOOR) {
        check(`start ${w}/${scheme}: onboarding zichtbaar, geen foutmelding`, (await page.locator('[data-hv-start]').count()) === 1 && (await page.locator('.hv-melding.is-fout').count()) === 0);
        check(`start ${w}/${scheme}: drie acties`, (await page.locator('[data-hv-actie]').count()) === 3);
        check(`start ${w}/${scheme}: geen horizontale scroll`, (await overloop(page)) <= 1);
      }
      await ctx.close();
    }
    if (VOOR) {
      const { ctx, page } = await sessie({ w: 390, h: 844, mobiel: true, storing: true });
      await page.screenshot({ path: join(UIT, 'voor-storing-390-light.png'), fullPage: true });
      await ctx.close();
      return 0;
    }
    // 3. serverfout
    {
      const { ctx, page, storing } = await sessie({ w: 390, h: 844, mobiel: true, storing: true });
      await page.locator('[data-hv-fout-kaart]').waitFor({ timeout: 20000 });
      const tekst = await page.locator('.hv').innerText();
      check('storing: foutkaart, geen aanmaakformulier', (await page.locator('[data-hv-woning-naam]').count()) === 0);
      check('storing: geen ruwe tekst «Internal server error»', !/Internal server error/i.test(tekst));
      await page.screenshot({ path: join(UIT, 'na-storing-390-light.png'), fullPage: true });
      storing.aan = false;
      await page.locator('[data-hv-opnieuw]').click();
      await page.locator('[data-hv-start]').waitFor({ timeout: 20000 });
      check('storing: «Спробувати ще раз» herstelt naar het beginscherm', (await page.locator('[data-hv-fout-kaart]').count()) === 0);
      await ctx.close();
    }
    // 4 + 2. platform-actie zonder woning, dan aanmaken → integraties; heropenen
    {
      const { ctx, page } = await sessie({ w: 1440, h: 900 });
      await page.locator('[data-hv-platform]').click();
      check('platform zonder woning: eerlijke uitleg en focus op naam', (await page.locator('[data-hv-platform-uitleg]').count()) === 1 && (await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.hvWoningNaam === '1')));
      await page.locator('[data-hv-woning-naam]').fill('Дім у Генті');
      await page.locator('[data-hv-woning-maak]').click();
      await page.waitForURL(/integraties|integrations/, { timeout: 20000 }).catch(() => undefined);
      check('eerste woning aangemaakt → direct naar Integraties', /integraties|integrations/.test(page.url()));
      await page.goto(`${HUIS}/?lang=uk`, { waitUntil: 'networkidle' });
      await page.locator('[data-hv-overzicht], [data-hv-pagina="overview"] .hv-leeg').first().waitFor({ timeout: 20000 }).catch(() => undefined);
      check('heropenen: woning blijft, geen beginscherm, geen fout', (await page.locator('[data-hv-start]').count()) === 0 && (await page.locator('.hv-melding.is-fout').count()) === 0 && /Дім у Генті/.test(await page.locator('.hv-kop').innerText()));
      await page.screenshot({ path: join(UIT, 'na-heropenen-1440-light.png'), fullPage: true });
      const n = Number((await pool.query(`SELECT count(*)::int AS n FROM app.huis_woningen w JOIN app.records u ON u.tbl='users' AND u.id = w.user_id WHERE u.data->>'email' = $1`, [eig.email])).rows[0].n);
      check('database: precies één woning voor deze gebruiker', n === 1);
      await ctx.close();
    }
    // 5. showroom
    {
      const { ctx, page } = await sessie({ w: 390, h: 844, mobiel: true, pad: '/showroom' });
      await page.waitForTimeout(500);
      check('showroom: gemarkeerd als demonstratie', (await page.locator('[data-hv-demo-label]').count()) >= 1);
      await page.screenshot({ path: join(UIT, 'na-showroom-390-light.png'), fullPage: false });
      await ctx.close();
    }
    check('geen paginafout of 5xx van /api/huis', fouten.length === 0);
    if (fouten.length) console.log(fouten.join('\n'));
  } finally {
    await pool.query(`UPDATE app.feature_flags SET aan = $1, standaard = $2 WHERE sleutel = 'huis-vnext'`, [vlagWas.aan, vlagWas.standaard]);
    await browser.close();
    await stop();
  }
  return einde();
}
