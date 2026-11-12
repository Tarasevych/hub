// E2E «Розміщення способів входу» + «Вхід через Telegram» (TELEGRAM-001) tegen de ECHTE lokale server met een echte Chrome.
// Bewezen: (1) vlag UIT → aanmeldscherm exact zoals 20261109-105221 (geen Telegram, «Інші способи входу» met 4 methoden);
// (2) vlag AAN + standaardplaatsing → Google en Telegram op het hoofdscherm; (3) Telegram onder «Інші способи входу»;
// (4) alle methoden op het hoofdscherm (werkende op het hoofdscherm, niet-werkende nooit); (5) «Інші» leeg → knop weg;
// (6) Google verborgen + Telegram werkt → alleen Telegram; (7) de gebruikerssectie «Способи входу» → Telegram.
// Licht, donker en telefoon; uk en nl. Geen echte Telegram: de botsleutel is een lokale testwaarde, de Bot API is niet bereikbaar.
// Gebruik: PLAYWRIGHT_CORE=… CHROME=… E2E_TLS=… E2E_SCREENSHOTS=… node scripts/e2e-lokaal.mjs aanmeld-plaatsing
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { plaatsingCacheWissen } from '../../backend/telegram-aanmelden/plaatsing';
import { vlagCacheWissen, instellingenCacheWissen } from '../../backend/telegram-aanmelden/opslag';
import { STANDAARD_PLAATSING, type Plaatsing } from '../../shared/aanmeld-plaatsing/plaatsing';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/wp-telegram/uitvoer/schermen/e2e';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e aanmeld-plaatsing');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-pl-${T}@example.test`, sub = `sub-e2e-pl-${T}`;
  process.env.AANMELD_TELEGRAM_BOT_TOKEN = '7712039941:AAHlokaletestwaardeniet-echtXXXXXXXX';
  process.env.TELEGRAM_API_BASIS = 'http://127.0.0.1:9';
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [...chromeArgs(POORT), '--ignore-certificate-errors'] }); // alleen lokaal: het test-certificaat kan verlopen zijn
  const fouten: string[] = [];
  const vlag = async (aan: boolean) => { await pool.query(`UPDATE app.feature_flags SET aan = $1, standaard = $1 WHERE sleutel = 'telegram-aanmelden-v1'`, [aan]); vlagCacheWissen(); instellingenCacheWissen(); };
  const plaats = async (p: Plaatsing | null) => {
    if (p) await pool.query(`INSERT INTO app.aanmeld_plaatsing (id, plaatsing, door) VALUES (1, $1::jsonb, 'e2e') ON CONFLICT (id) DO UPDATE SET plaatsing = EXCLUDED.plaatsing`, [JSON.stringify(p)]);
    else await pool.query('DELETE FROM app.aanmeld_plaatsing');
    plaatsingCacheWissen();
  };
  const met = (plek: Partial<Plaatsing['plek']>, volgorde = STANDAARD_PLAATSING.volgorde): Plaatsing => ({ volgorde: [...volgorde], plek: { ...STANDAARD_PLAATSING.plek, ...plek } });
  const VARIANTEN = [
    { naam: 'licht', scheme: 'light' as const, viewport: { width: 1280, height: 860 }, mobiel: false },
    { naam: 'donker', scheme: 'dark' as const, viewport: { width: 1280, height: 860 }, mobiel: false },
    { naam: 'mobiel', scheme: 'light' as const, viewport: { width: 390, height: 844 }, mobiel: true },
  ];
  const openen = async (v: typeof VARIANTEN[number], pad: string, taal: string, cookies: Array<[string, string]> = [], tab = '') => {
    const ctx = await browser.newContext({ colorScheme: v.scheme, reducedMotion: 'reduce', locale: taal === 'nl' ? 'nl-BE' : 'uk-UA', viewport: v.viewport, hasTouch: v.mobiel, isMobile: v.mobiel, timezoneId: 'Europe/Brussels', deviceScaleFactor: v.mobiel ? 2 : 1 });
    if (cookies.length) await ctx.addCookies(cookies.map(([name, value]) => ({ name, value, url: `${ID}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const })));
    if (tab) await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('request', (q) => { const u = new URL(q.url()); if (!/^(data|blob):$/.test(u.protocol) && !/(^|\.)tarasevych\.com$/.test(u.hostname)) fouten.push(`extern verzoek: ${q.url()}`); });
    await page.goto(`${ID}${pad}?lang=${taal}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    return { ctx, page };
  };
  const hoofdIds = (p: Page) => p.evaluate(() => {
    const s = document.querySelector('.mr-sign-in-content'); if (!s) return [] as string[];
    return [...s.children].flatMap((el) => el.classList.contains('mr-sign-in-main-button') ? ['google'] : el.classList.contains('tga-aanmeld') ? ['telegram'] : []);
  });
  const andereOpenen = async (p: Page) => { const k = p.locator('.mr-sign-in-alternative'); if (await k.count()) { await k.click(); await p.waitForTimeout(300); } };
  const andereIds = (p: Page) => p.evaluate(() => [...document.querySelectorAll('.mr-sign-in-opties > li')].map((li) => li.getAttribute('data-aanmeld-ingang') || li.querySelector('[data-aanmeld-ingang]')?.getAttribute('data-aanmeld-ingang') || ''));
  const overloop = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const foto = async (p: Page, naam: string) => { await p.screenshot({ path: join(UIT, `${naam}.png`), fullPage: true }); };

  const SCENARIO: Array<{ id: string; vlag: boolean; plaatsing: Plaatsing | null; hoofd: string[]; andere: string[] | null; open: boolean }> = [
    { id: '01-vlag-uit-zoals-105221', vlag: false, plaatsing: null, hoofd: ['google'], andere: ['github', 'apple', 'microsoft', 'passkey'], open: false },
    { id: '02-standaard-google-en-telegram', vlag: true, plaatsing: null, hoofd: ['google', 'telegram'], andere: ['github', 'apple', 'microsoft', 'passkey'], open: false },
    { id: '03-telegram-onder-andere', vlag: true, plaatsing: met({ telegram: 'andere' }), hoofd: ['google'], andere: ['telegram', 'github', 'apple', 'microsoft', 'passkey'], open: true },
    { id: '04-alles-op-hoofdscherm', vlag: true, plaatsing: met({ github: 'hoofd', apple: 'hoofd', microsoft: 'hoofd', passkey: 'hoofd' }), hoofd: ['google', 'telegram'], andere: ['github', 'apple', 'microsoft', 'passkey'], open: true },
    { id: '05-telegram-eerst-andere-leeg', vlag: true, plaatsing: met({ github: 'verborgen', apple: 'verborgen', microsoft: 'verborgen', passkey: 'verborgen' }, ['telegram', 'google', 'github', 'apple', 'microsoft', 'passkey']), hoofd: ['telegram', 'google'], andere: null, open: false },
    { id: '06-google-verborgen', vlag: true, plaatsing: met({ google: 'verborgen' }), hoofd: ['telegram'], andere: ['github', 'apple', 'microsoft', 'passkey'], open: false },
  ];
  try {
    for (const sc of SCENARIO) {
      await vlag(sc.vlag); await plaats(sc.plaatsing);
      for (const v of VARIANTEN) for (const taal of v.naam === 'licht' ? ['uk', 'nl'] : ['uk']) {
        const { ctx, page } = await openen(v, '/', taal);
        await page.locator('.mr-sign-in-main-button, .tga-aanmeld').first().waitFor({ timeout: 20000 }).catch(() => undefined);
        await page.waitForTimeout(500);
        const h = await hoofdIds(page);
        if (sc.open) await andereOpenen(page);
        const a = sc.open ? await andereIds(page) : null;
        if (v.naam === 'licht' && taal === 'uk') {
          check(`${sc.id}: hoofdscherm = ${sc.hoofd.join(', ')}`, JSON.stringify(h) === JSON.stringify(sc.hoofd), JSON.stringify(h));
          if (sc.andere === null) check(`${sc.id}: «Інші способи входу» niet getoond`, (await page.locator('.mr-sign-in-alternative').count()) === 0);
          else check(`${sc.id}: knop «Інші способи входу» aanwezig`, (await page.locator('.mr-sign-in-alternative').count()) === 1);
          if (sc.open && sc.andere) check(`${sc.id}: «Інші» = ${sc.andere.join(', ')}`, JSON.stringify(a) === JSON.stringify(sc.andere), JSON.stringify(a));
        }
        check(`${sc.id} ${v.naam} ${taal}: geen horizontale scroll`, (await overloop(page)) <= 1);
        if (!sc.open) { await page.locator('.mr-sign-in-alternative').click().catch(() => undefined); await page.waitForTimeout(250); }
        await foto(page, `${sc.id}-${v.naam}${taal === 'nl' ? '-nl' : ''}`);
        await ctx.close();
      }
    }

    // ================================================================ gebruikerssectie «Способи входу» → Telegram
    await vlag(true); await plaats(null);
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: b.tab, intent: 'login' });
    for (const v of VARIANTEN) for (const taal of v.naam === 'licht' ? ['uk', 'nl'] : ['uk']) {
      const { ctx, page } = await openen(v, '/aanmeldmethoden', taal, [...b.jar], b.tab);
      await page.locator('[data-telegram-sectie], .tga-sectie').first().waitFor({ timeout: 20000 }).catch(() => undefined);
      const n = await page.locator('.tga-sectie').count();
      if (v.naam === 'licht' && taal === 'uk') check('gebruiker: Telegram-sectie zichtbaar onder «Способи входу»', n >= 1);
      check(`gebruiker ${v.naam} ${taal}: geen horizontale scroll`, (await overloop(page)) <= 1);
      if (n) await page.locator('.tga-sectie').first().scrollIntoViewIfNeeded().catch(() => undefined);
      await foto(page, `07-gebruiker-telegram-${v.naam}${taal === 'nl' ? '-nl' : ''}`);
      await ctx.close();
    }
    const echt = fouten.filter((f) => !/127\.0\.0\.1:9|TELEGRAM|telegram\/(config|mijn)/i.test(f));
    check('geen paginafouten en geen externe verzoeken', echt.length === 0, echt.slice(0, 5).join(' | '));
  } finally {
    await plaats(null).catch(() => undefined);
    await vlag(false).catch(() => undefined);
    await browser.close();
    await stop();
  }
  return einde();
}
