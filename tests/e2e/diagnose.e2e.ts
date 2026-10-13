// E2E etap 4 (13.10.2026) met een echte Chrome: accountmenu → «Щось не працює? Перевірка» → servercontroles + browsercontroles →
// oordeel («усе працює» / «лише у вас» met Ctrl+F5 / «для всіх»), verslag met voorbeeld → versturen → in de database; in een actief
// technisch profiel de tab «Звіти користувачів» met dat verslag → «переглянуто»; telefoonbreedte; geen consolefouten.
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
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e diagnose');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-dg-${T}@example.test`, sub = `sub-e2e-dg-${T}`;
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
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: MCP });
    const page = await ctx.newPage();
    const fouten: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { if (q.status() >= 400 && !/\/api\/owner\/agents\/activity$|\/downloads\/extension-version\.json$/.test(q.url())) fouten.push(`http ${q.status()} ${q.url()}`); });

    await page.goto(`${MCP}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('.canonical-avatar-trigger').first().waitFor({ timeout: 20000 });
    await page.waitForResponse((q) => q.url().endsWith('/api/owner/tech/status'), { timeout: 20000 }).catch(() => undefined);

    // ---------------------------------------------------------------- 1. accountmenu → controle, alles werkt
    const openViaMenu = async () => {
      await page.locator('.canonical-avatar-trigger').first().click({ timeout: 10000 }).catch(async (e) => { await page.screenshot({ path: `${UIT}/diagnose-fout-menu.png` }); console.log('AVATAR', await page.locator('.canonical-avatar-trigger').count(), await page.evaluate(() => document.title)); throw e; });
      const item = page.getByRole('button', { name: /Щось не працює\? Перевірка/ });
      await item.waitFor({ timeout: 10000 });
      await item.click();
      await page.locator('[data-diagnose]').waitFor({ timeout: 10000 });
      await page.locator('[data-diag-oordeel]').waitFor({ timeout: 20000 });
    };
    await openViaMenu();
    const venster = page.locator('[data-diagnose]');
    const ids = await venster.locator('[data-diag-controle]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-diag-controle')}=${e.getAttribute('data-diag-stand')}`));
    check('12 controles: 6 server, 6 browser', ids.length === 12 && await venster.locator('[data-diag-bereik="server"] li').count() === 6, ids.join(','));
    check('lokaal: database, sessie, versie, klok en opslag in orde', ['database=ok', 'sessie=ok', 'versie=ok', 'klok=ok', 'opslag=ok', 'online=ok'].every((x) => ids.includes(x)), ids.join(','));
    check('oordeel «Усе працює» (onbekende servercontroles tellen niet als fout)', await venster.locator('[data-diag-oordeel]').getAttribute('data-diag-oordeel') === 'alles-ok');
    check('geen interne codes zonder technisch profiel', await venster.locator('.diag-code').count() === 0);
    await page.screenshot({ path: `${UIT}/diagnose-1-alles-ok.png` });

    // ---------------------------------------------------------------- 2. «лише у вас»: oude versie van de pagina (antwoord in Chrome aangepast)
    // Antwoord van de server in Chrome vervangen (route.fetch zou buiten de lokale server gaan; het e2e-slot verbiedt dat terecht).
    const serverOk = (db: 'ok' | 'fout') => ['database', 'schema', 'mcp-deur', 'mail-onderhoud', 'schijf', 'servertijd'].map((id) => ({ id, stand: id === 'database' ? db : 'ok', ms: 5, ...(id === 'database' && db === 'fout' ? { code: 'TIJD_OM' } : {}) }));
    const bundel = await page.evaluate(() => /(index-[A-Za-z0-9_-]+\.js)/.exec([...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map((x) => x.src).find((x) => /assets\/index-/.test(x)) || '')?.[1] || '');
    await page.route('**/api/diagnose/server', (route) => route.fulfill({ status: 200, json: { uitslagen: serverOk('ok'), bundel: 'index-NIEUWER.js', nu: Date.now() } }));
    await venster.locator('[data-diag-knop="opnieuw"]').click();
    await page.waitForFunction(() => document.querySelector('[data-diag-oordeel]')?.getAttribute('data-diag-oordeel') === 'alleen-ik', null, { timeout: 15000 }).catch(() => undefined);
    check('oude bundel → «Проблема лише у вас» met stap Ctrl+F5', await venster.locator('[data-diag-oordeel]').getAttribute('data-diag-oordeel') === 'alleen-ik' && /Ctrl\+F5/.test(await venster.locator('[data-diag-advies="versie"]').innerText().catch(() => '')));
    await page.screenshot({ path: `${UIT}/diagnose-2-alleen-ik.png` });

    // ---------------------------------------------------------------- 3. «для всіх»: database valt uit (antwoord aangepast)
    await page.unroute('**/api/diagnose/server');
    await page.route('**/api/diagnose/server', (route) => route.fulfill({ status: 200, json: { uitslagen: serverOk('fout'), bundel, nu: Date.now() } }));
    await venster.locator('[data-diag-knop="opnieuw"]').click();
    await page.waitForFunction(() => document.querySelector('[data-diag-oordeel]')?.getAttribute('data-diag-oordeel') === 'iedereen', null, { timeout: 15000 }).catch(() => undefined);
    check('serverfout → «Проблема для всіх — на сервері»', await venster.locator('[data-diag-oordeel]').getAttribute('data-diag-oordeel') === 'iedereen' && /для всіх/.test(await venster.locator('[data-diag-oordeel] h3').innerText()));
    await page.screenshot({ path: `${UIT}/diagnose-3-iedereen.png` });
    await page.unroute('**/api/diagnose/server');

    // ---------------------------------------------------------------- 4. verslag: voorbeeld → versturen
    await venster.locator('[data-diag-knop="opnieuw"]').click();
    await page.waitForFunction(() => document.querySelector('[data-diag-oordeel]')?.getAttribute('data-diag-oordeel') === 'alles-ok', null, { timeout: 15000 }).catch(() => undefined);
    await venster.locator('[data-diag-beschrijving]').fill('E2E: пошта не відкривається');
    await venster.locator('[data-diag-knop="verslag"]').click();
    const vb = venster.locator('[data-diag-voorbeeld]');
    await vb.waitFor({ timeout: 5000 });
    check('voorbeeld toont wat er meegaat (zonder inhoud/wachtwoorden)', /Без вмісту/.test(await vb.innerText()) && /пошта не відкривається/.test(await vb.locator('pre').innerText()));
    await vb.locator('[data-diag-knop="versturen"]').click();
    await venster.locator('.diag-melding.is-ok').waitFor({ timeout: 10000 });
    const rij = (await sys.query('SELECT oordeel, beschrijving, browser, uitslagen FROM app.diagnose_meldingen WHERE user_id=$1 ORDER BY aangemaakt_op DESC LIMIT 1', [uid])).rows[0];
    check('verslag in de database: oordeel, beschrijving, browsernaam, 12 uitslagen', rij?.oordeel === 'alles-ok' && rij.beschrijving === 'E2E: пошта не відкривається' && /Chrome/.test(rij.browser) && Array.isArray(rij.uitslagen) && rij.uitslagen.length === 12, JSON.stringify(rij ?? {}).slice(0, 200));
    await venster.locator('[data-diag-knop="kopieren"]').click();
    check('kopiëren geeft de tekst van het verslag', /Висновок|Oordeel/.test(await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')));
    await page.locator('[data-venster-knop="sluit"]').last().click();

    // ---------------------------------------------------------------- 5. technisch profiel → «Звіти користувачів»
    const act = await page.evaluate(async (t) => (await fetch('/api/owner/tech/activeren', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin, minuten: 15, reden: 'E2E diagnose' }) })).status, tab);
    check('technisch profiel aangezet (15 хв)', act === 200, String(act));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-tech-band]').waitFor({ timeout: 20000 });
    await openViaMenu();
    check('in tech: interne codes zichtbaar', await venster.locator('.diag-code').count() > 0);
    await venster.locator('[data-diag-blad="verslagen"]').click();
    const lijst = venster.locator('[data-diag-verslagen]');
    await lijst.waitFor({ timeout: 10000 });
    check('verslag staat in «Звіти користувачів» met e-mail en beschrijving', /пошта не відкривається/.test(await lijst.innerText()) && (await lijst.innerText()).includes(eigenaar));
    await page.screenshot({ path: `${UIT}/diagnose-4-verslagen.png` });
    await lijst.locator('[data-diag-knop^="gelezen:"]').first().click();
    await page.waitForFunction(() => !!document.querySelector('[data-diag-verslagen] li.is-gelezen'), null, { timeout: 10000 }).catch(() => undefined);
    check('«позначити переглянутим» werkt', !!(await sys.query('SELECT gelezen_op FROM app.diagnose_meldingen WHERE user_id=$1 ORDER BY aangemaakt_op DESC LIMIT 1', [uid])).rows[0]?.gelezen_op);
    const acties = (await sys.query(`SELECT action FROM app.audit WHERE owner_id=$1 AND action LIKE 'owner.diagnose.%'`, [uid])).rows.map((x) => x.action);
    check('logboek: gemeld en gelezen', acties.includes('owner.diagnose.gemeld') && acties.includes('owner.diagnose.gelezen'), acties.join(','));
    await page.locator('[data-venster-knop="sluit"]').last().click();

    // ---------------------------------------------------------------- 6. telefoon
    await page.setViewportSize({ width: 390, height: 820 });
    // Op de telefoon zit het accountmenu in de zijbalk (hamburger); hier openen we het venster rechtstreeks via dezelfde gebeurtenis.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('mr-diagnose-venster')));
    await page.locator('[data-diag-oordeel]').waitFor({ timeout: 20000 });
    await page.waitForTimeout(300);
    const tel = await page.evaluate(() => { const v = document.querySelector('[data-diagnose]')!; return { venster: v.scrollWidth <= v.clientWidth + 1, pagina: document.documentElement.scrollWidth <= innerWidth + 1 }; });
    check('telefoon: venster past, geen horizontaal scrollen', tel.venster && tel.pagina, JSON.stringify(tel));
    await page.screenshot({ path: `${UIT}/diagnose-5-telefoon.png` });

    check('geen consolefouten of onverwachte http-fouten', fouten.length === 0, fouten.slice(0, 5).join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    if (uid) {
      await sys.query('DELETE FROM app.diagnose_meldingen WHERE user_id=$1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_activaties WHERE user_id=$1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [uid]).catch(() => undefined);
    }
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
