// E2E technisch profiel (13.10.2026) met een echte Chrome: accountmenu → «Технічний профіль» → увімкнути (reden, duur) → band
// bovenaan met [ТЕХ] in de titel, de app schuift eronder (niets bedekt), «?» toont de laag «Для розробників», kleur van de band,
// profiel toekennen aan een ander account en intrekken (bevestiging op de pagina), ander tabblad blijft gewoon, uitzetten,
// telefoonbreedte zonder horizontaal scrollen, geen consolefouten.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
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
  const { check, einde } = checker('e2e tech-profiel');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-tech-${T}@example.test`, sub = `sub-e2e-tech-${T}`;
  const ander = `e2e-tech-ander-${T}@example.test`, anderId = randomUUID();
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  let uid = '';
  try {
    await sys.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', anderId, { email: ander, role: 'user', status: 'approved', name: 'Тест Користувач' }]);
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    const r = await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    check('aanmelden op mcp gaf een sessie', r.cb.data.sessionCreated === true, JSON.stringify(r.cb.data).slice(0, 200));
    uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');

    const ctx = await browser.newContext({ locale: 'uk-UA', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    const fouten: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { if (q.status() >= 400 && !/\/api\/owner\/agents\/activity$|\/downloads\/extension-version\.json$/.test(q.url())) fouten.push(`http ${q.status()} ${q.url()}`); });

    await page.goto(`${MCP}/agents`, { waitUntil: 'domcontentloaded' });
    await page.locator('.canonical-avatar-trigger').first().waitFor({ timeout: 20000 });
    const stR = await page.waitForResponse((q) => q.url().endsWith('/api/owner/tech/status'), { timeout: 20000 }).catch(() => null);
    console.log('TECH-STATUS', stR?.status(), (await stR?.text().catch(() => ''))?.slice(0, 300));
    check('zonder activering: geen band, geen [ТЕХ]', await page.locator('[data-tech-band]').count() === 0 && !(await page.title()).startsWith('[ТЕХ]'));

    // ---------------------------------------------------------------- 1. accountmenu → увімкнути
    await page.locator('.canonical-avatar-trigger').first().click();
    const item = page.getByRole('button', { name: /Технічний профіль/ });
    await item.waitFor({ timeout: 10000 }).catch(async () => { await page.screenshot({ path: `${UIT}/tech-0-menu.png` }); console.log('MENU', (await page.locator('.canonical-account-panel').innerText().catch(() => '?')).slice(0, 400)); });
    check('accountmenu toont «Технічний профіль · вимкнено»', /вимкнено/.test(await item.innerText()));
    await item.click();
    const venster = page.locator('[data-tech-venster="activeren"]');
    await venster.waitFor({ timeout: 10000 });
    const duren = await venster.locator('[data-tech-duur] option').evaluateAll((o) => o.map((x) => Number((x as HTMLOptionElement).value)));
    check('duur: alleen tot het plafond van «eigenaar» (120 хв)', duren.length > 0 && Math.max(...duren) === 120, duren.join(','));
    check('knop pas actief met reden', await venster.locator('[data-tech-knop="activeren"]').isDisabled());
    await venster.locator('[data-tech-reden]').fill('E2E: перевірка технічного профілю');
    await page.screenshot({ path: `${UIT}/tech-1-activeren.png` });
    await venster.locator('[data-tech-knop="activeren"]').click();
    const band = page.locator('[data-tech-band]');
    await band.waitFor({ timeout: 15000 });
    check('band zichtbaar met «ТЕХНІЧНИЙ», rol en reden', /ТЕХНІЧНИЙ/.test(await band.innerText()) && /Власник сервера/.test(await band.innerText()) && /перевірка/.test(await band.innerText()));
    await page.waitForFunction(() => document.title.startsWith('[ТЕХ] '), null, { timeout: 5000 }).catch(() => undefined);
    check('titel van het tabblad begint met [ТЕХ]', (await page.title()).startsWith('[ТЕХ] '), await page.title());
    const rest = Number(await band.locator('[data-tech-rest]').getAttribute('data-tech-rest'));
    check('resterende tijd ~60 хв', rest >= 59 && rest <= 60, String(rest));
    await page.waitForTimeout(400); // inschuifanimatie van de band
    const geo = await page.evaluate(() => {
      const bb = document.querySelector('[data-tech-band]')!.getBoundingClientRect();
      const root = document.getElementById('root')!.getBoundingClientRect();
      const kop = [...document.querySelectorAll('#root .canonical-sidebar, #root .canonical-workspace, #root .canonical-account-anchor')].map((e) => e.getBoundingClientRect().top);
      return { bandBodem: bb.bottom, rootTop: root.top, minTop: Math.min(...kop), hoogte: bb.height };
    });
    check('app schuift onder de band (niets bedekt)', geo.rootTop >= geo.bandBodem - 1 && geo.minTop >= geo.bandBodem - 1, JSON.stringify(geo));
    await page.screenshot({ path: `${UIT}/tech-2-band.png` });

    // ---------------------------------------------------------------- 2. «?» met laag voor ontwikkelaars
    await band.locator('[data-tech-knop="verlengen"]').click();
    const v2 = page.locator('[data-tech-venster="activeren"]');
    await v2.waitFor({ timeout: 10000 });
    const vraag = v2.locator('.tech-vraag-knop').first();
    await vraag.hover();
    const uitleg = page.locator('[data-tech-vraag]').first();
    await uitleg.waitFor({ timeout: 5000 });
    check('«?» opent bij aanwijzen met «Що це» en «Для розробників» (tech actief)', /Що це/i.test(await uitleg.innerText()) && await page.locator('[data-tech-vraag-dev]').count() > 0);
    const zicht = await uitleg.evaluate((el) => { const r = el.getBoundingClientRect(); const mid = document.elementFromPoint(r.left + r.width / 2, r.top + 12); return { binnen: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, bovenaan: !!mid && el.contains(mid), bg: getComputedStyle(el).backgroundColor }; });
    check('uitleg volledig zichtbaar, bovenop het venster, ondoorzichtig', zicht.binnen && zicht.bovenaan && zicht.bg === 'rgb(255, 255, 255)', JSON.stringify(zicht));
    check('«?» heeft aria-expanded=true', await vraag.getAttribute('aria-expanded') === 'true');
    await page.screenshot({ path: `${UIT}/tech-3-vraag.png` });
    await page.keyboard.press('Escape'); // sluit eerst ALLEEN de uitleg
    check('Esc sluit de uitleg, niet het venster', await page.locator('[data-tech-vraag]').count() === 0 && await v2.count() === 1);
    await page.locator('[data-venster-knop="sluit"]').last().click();
    await v2.waitFor({ state: 'detached', timeout: 5000 });

    // ---------------------------------------------------------------- 3. kleur van de band
    await band.locator('[data-tech-knop="band"]').click();
    const kv = page.locator('[data-tech-venster="band"]');
    await kv.waitFor({ timeout: 10000 });
    await kv.locator('[data-tech-kleur="paars"]').click();
    await kv.locator('button[data-tech-patroon="stippen"]').click();
    await kv.locator('[data-tech-knop="band-opslaan"]').click();
    await kv.waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForFunction(() => document.documentElement.dataset.techPatroon === 'stippen', null, { timeout: 10000 }).catch(() => undefined);
    const stijl = await page.evaluate(() => ({ bg: getComputedStyle(document.querySelector('[data-tech-band]')!).backgroundColor, patroon: document.documentElement.dataset.techPatroon }));
    check('kleur en patroon bewaard en toegepast', stijl.patroon === 'stippen' && stijl.bg !== 'rgb(245, 180, 0)', JSON.stringify(stijl));
    check('band in database bewaard', (await sys.query('SELECT band FROM app.tech_profielen WHERE user_id=$1', [uid])).rows[0]?.band?.kleur === 'paars');
    await page.screenshot({ path: `${UIT}/tech-4-kleur.png` });

    // ---------------------------------------------------------------- 4. profiel toekennen en intrekken
    await band.locator('[data-tech-knop="profielen"]').click();
    const pv = page.locator('[data-tech-venster="profielen"]');
    await pv.waitFor({ timeout: 10000 });
    check('«eigenaar» kan rol «Власник» niet geven', await pv.locator('[data-tech-rol="eigenaar"]').count() === 0 && await pv.locator('[data-tech-rol="tester"]').count() === 1);
    await pv.locator('[data-tech-email]').fill(ander);
    check('standaard voorgeselecteerd: alleen de zwakste rol «Підтримка»', await pv.locator('[data-tech-rol]:checked').count() === 1 && await pv.locator('[data-tech-rol="ondersteuning"]').isChecked());
    await pv.locator('[data-tech-rol="ondersteuning"]').uncheck();
    await pv.locator('[data-tech-rol="tester"]').check();
    await pv.locator('[data-tech-knop="geven"]').click();
    const rij = pv.locator(`[data-tech-profiel="${ander}"]`);
    await rij.waitFor({ timeout: 10000 });
    check('toegekend profiel staat in de lijst', /Тестувальник/.test(await rij.innerText()));
    const dbRij = (await sys.query('SELECT rollen, ingetrokken_op FROM app.tech_profielen WHERE user_id=$1', [anderId])).rows[0];
    check('database: profiel «tester» voor het andere account', String(dbRij?.rollen) === 'tester' && !dbRij?.ingetrokken_op, JSON.stringify(dbRij));
    await page.screenshot({ path: `${UIT}/tech-5-profielen.png` });
    await rij.locator(`[data-tech-knop="intrekken:${ander}"]`).click();
    await rij.locator(`[data-tech-knop="intrekken-ja:${ander}"]`).click();
    await page.waitForFunction((e) => document.querySelector(`[data-tech-profiel="${e}"]`)?.className.includes('is-weg'), ander, { timeout: 10000 }).catch(() => undefined);
    check('intrekken (met bevestiging op de pagina) werkt', !!(await sys.query('SELECT ingetrokken_op FROM app.tech_profielen WHERE user_id=$1', [anderId])).rows[0]?.ingetrokken_op);
    await page.locator('[data-venster-knop="sluit"]').last().click();
    await pv.waitFor({ state: 'detached', timeout: 5000 });

    // ---------------------------------------------------------------- 5. ander tabblad: geen tech
    const anderTab = randomBytes(24).toString('hex');
    const st = await page.evaluate(async (t) => {
      const r = await fetch('/api/owner/tech/status', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin }) });
      const j = await r.json().catch(() => ({}));
      return { status: r.status, actief: !!(j?.data?.activatie ?? j?.activatie) };
    }, anderTab);
    check('ander tabblad (andere tabcontext) is niet technisch', !st.actief, JSON.stringify(st));

    // ---------------------------------------------------------------- 6. telefoonbreedte
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(400);
    const tel = await page.evaluate(() => { const b = document.querySelector('[data-tech-band]')!; return { band: b.scrollWidth <= b.clientWidth + 1, pagina: document.documentElement.scrollWidth <= window.innerWidth + 1, uit: !!document.querySelector('[data-tech-knop="uit"]') }; });
    check('telefoon: band past, geen horizontaal scrollen, «вийти» bereikbaar', tel.band && tel.pagina && tel.uit, JSON.stringify(tel));
    await page.screenshot({ path: `${UIT}/tech-6-telefoon.png` });
    await band.locator('[data-tech-knop="meer"]').click();
    const extra = await page.evaluate(() => ({ open: getComputedStyle(document.querySelector('#tech-band-extra')!).display === 'flex', verlengen: !!(document.querySelector('[data-tech-knop="verlengen"]') as HTMLElement)?.offsetParent, binnen: document.querySelector('#tech-band-extra')!.getBoundingClientRect().right <= innerWidth }));
    check('telefoon: «⋯» opent de overige knoppen (Подовжити, Профілі, колір) binnen het scherm', extra.open && extra.verlengen && extra.binnen, JSON.stringify(extra));
    await page.screenshot({ path: `${UIT}/tech-6b-telefoon-meer.png` });
    await band.locator('[data-tech-knop="meer"]').click();
    await page.setViewportSize({ width: 1280, height: 900 });

    // ---------------------------------------------------------------- 7. uitzetten
    await band.locator('[data-tech-knop="uit"]').click();
    await band.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    check('uitzetten: band weg, titel zonder [ТЕХ], app weer bovenaan', await page.locator('[data-tech-band]').count() === 0 && !(await page.title()).startsWith('[ТЕХ]') && await page.evaluate(() => document.getElementById('root')!.getBoundingClientRect().top) === 0);
    const acties = (await sys.query(`SELECT action FROM app.audit WHERE owner_id=$1 AND action LIKE 'owner.tech.%'`, [uid])).rows.map((x) => x.action);
    check('logboek: geactiveerd, band, toegekend, ingetrokken, beeindigd', ['owner.tech.geactiveerd', 'owner.tech.band', 'owner.tech.toegekend', 'owner.tech.ingetrokken', 'owner.tech.beeindigd'].every((a) => acties.includes(a)), [...new Set(acties)].join(','));
    check('geen consolefouten of onverwachte http-fouten', fouten.length === 0, fouten.slice(0, 5).join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [[uid, anderId]]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [[uid, anderId]]).catch(() => undefined);
    await sys.query(`DELETE FROM app.records WHERE tbl='users' AND id=$1`, [anderId]).catch(() => undefined);
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
