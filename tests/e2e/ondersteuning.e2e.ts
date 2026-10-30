// E2E etap 7 (13.10.2026): «Підтримка від імені» met toestemming, met twee echte Chrome-contexten.
// Eigenaar (ondersteuner, technisch profiel) vraagt → gebruiker ziet het venster «Запит на підтримку» → «Дозволити» → rode band
// «ПІДТРИМКА …» → ondersteuner «Переглянути» → overzicht «ВІД ІМЕНІ …» → logboek van de gebruiker → gebruiker «Завершити» →
// ondersteuner krijgt geen overzicht meer. Telefoonbreedte voor de rode band. Geen consolefouten.
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
  const { check, einde } = checker('e2e ondersteuning');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-os-${T}@example.test`, klantMail = `e2e-os-klant-${T}@example.test`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const ids: string[] = [];
  try {
    const sessie = async (email: string, sub: string) => {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      const r = await b.aanmelden(sub, email, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
      const ctx = await browser.newContext({ locale: 'uk-UA', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
      const page = await ctx.newPage();
      const fouten: string[] = [];
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { if (q.status() >= 400 && !/\/api\/owner\/agents\/activity$|\/downloads\/extension-version\.json$|\/api\/ondersteuning\/overzicht$/.test(q.url())) fouten.push(`http ${q.status()} ${q.url()}`); });
      return { tab, page, fouten, ok: r.cb.data.sessionCreated === true };
    };
    const E = await sessie(eigenaar, `sub-e2e-os-${T}`);
    const uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || ''); ids.push(uid);
    const K = await sessie(klantMail, `sub-e2e-os-k-${T}`);
    await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and data->>'email'=$1", [klantMail]);
    const kid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [klantMail])).rows[0]?.id || ''); ids.push(kid);
    check('twee sessies (eigenaar en klant)', E.ok && K.ok && !!uid && !!kid);

    // ---------------------------------------------------------------- 1. eigenaar: technisch profiel → «Підтримка» → aanvraag
    await E.page.goto(`${MCP}/`, { waitUntil: 'domcontentloaded' });
    await E.page.locator('.canonical-avatar-trigger').first().waitFor({ timeout: 20000 });
    const act = await E.page.evaluate(async (t) => (await fetch('/api/owner/tech/activeren', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin, minuten: 30, reden: 'E2E ondersteuning' }) })).status, E.tab);
    check('technisch profiel van de eigenaar aan', act === 200, String(act));
    await E.page.reload({ waitUntil: 'domcontentloaded' });
    const band = E.page.locator('[data-tech-band]');
    await band.waitFor({ timeout: 20000 });
    await band.locator('[data-tech-knop="ondersteuning"]').click();
    const ov = E.page.locator('[data-tech-venster="ondersteuning"]');
    await ov.waitFor({ timeout: 10000 });
    await ov.locator('[data-ond-email]').fill(klantMail);
    await ov.locator('[data-ond-reden]').fill('E2E: пошта не синхронізується');
    await ov.locator('[data-ond-minuten]').selectOption('10');
    check('eigenaar ziet de optie «термінова»', await ov.locator('[data-ond-nood]').count() === 1);
    await ov.locator('[data-ond-knop="aanvragen"]').click();
    await ov.locator('[data-ond-status="wacht"]').waitFor({ timeout: 10000 });
    check('verzoek staat op «чекає відповіді»', /чекає відповіді/.test(await ov.locator('[data-ond-lijst]').innerText()));
    await E.page.screenshot({ path: `${UIT}/ondersteuning-1-aanvraag.png` });

    // ---------------------------------------------------------------- 2. klant: venster → toestaan → rode band
    await K.page.goto(`${MCP}/`, { waitUntil: 'domcontentloaded' });
    const vraag = K.page.locator('[data-ond-toestemming]');
    await vraag.waitFor({ timeout: 20000 });
    const vt = await vraag.innerText();
    check('klant ziet wie, hoe lang en waarom (+ wat wel/niet zichtbaar is)', vt.includes(eigenaar) && /10 хв/.test(vt) && /пошта не синхронізується/.test(vt) && /Без вмісту листів/.test(vt));
    await K.page.screenshot({ path: `${UIT}/ondersteuning-2-vraag.png` });
    await vraag.locator('[data-ond-knop="toestaan"]').click();
    const rood = K.page.locator('[data-ond-band]');
    await rood.waitFor({ timeout: 15000 });
    const kleur = await rood.evaluate((el) => getComputedStyle(el).backgroundColor);
    check('rode band «ПІДТРИМКА … лише читання … до»', /ПІДТРИМКА/.test(await rood.innerText()) && (await rood.innerText()).includes(eigenaar) && kleur === 'rgb(180, 35, 24)', kleur);
    const geo = await K.page.evaluate(() => ({ band: document.querySelector('[data-ond-band]')!.getBoundingClientRect().bottom, root: document.getElementById('root')!.getBoundingClientRect().top }));
    check('site schuift onder de rode band', geo.root >= geo.band - 1, JSON.stringify(geo));
    await K.page.screenshot({ path: `${UIT}/ondersteuning-3-rode-band.png` });

    // ---------------------------------------------------------------- 3. eigenaar: bekijken
    await E.page.waitForSelector('[data-ond-status="goedgekeurd"]', { timeout: 30000 }).catch(() => undefined);
    const vid = String(await ov.locator('[data-ond-status="goedgekeurd"]').first().getAttribute('data-ond-verzoek'));
    await ov.locator(`[data-ond-knop="bekijken:${vid}"]`).click();
    const over = E.page.locator('[data-ond-overzicht]');
    await over.locator('[data-ond-kop]').waitFor({ timeout: 10000 });
    const ot = await over.innerText();
    check('overzicht «ВІД ІМЕНІ <klant> · лише читання» met account, apparaten, AI, verslagen, acties', /ВІД ІМЕНІ/.test(ot) && ot.includes(klantMail) && /Пристрої/.test(ot) && /Підключення ШІ/.test(ot) && /Останні дії/.test(ot));
    await E.page.screenshot({ path: `${UIT}/ondersteuning-4-overzicht.png` });
    const log = (await sys.query(`SELECT action, actor_id FROM app.audit WHERE owner_id=$1 AND action LIKE 'owner.ondersteuning.%' ORDER BY id`, [kid])).rows;
    check('logboek van de klant: gevraagd, toegestaan, bekeken (door de eigenaar)', ['owner.ondersteuning.gevraagd', 'owner.ondersteuning.toegestaan', 'owner.ondersteuning.bekeken'].every((a) => log.some((r) => r.action === a)) && log.find((r) => r.action === 'owner.ondersteuning.bekeken')?.actor_id === uid, log.map((r) => r.action).join(','));
    await E.page.locator('[data-venster-knop="sluit"]').last().click();

    // ---------------------------------------------------------------- 4. klant beëindigt
    await rood.locator('[data-ond-knop="beeindigen"]').click();
    await rood.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    check('klant: rode band weg na «Завершити»', await K.page.locator('[data-ond-band]').count() === 0);
    const na = await E.page.evaluate(async ([t, id]) => (await fetch('/api/ondersteuning/overzicht', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin, id }) })).status, [E.tab, vid]);
    check('eigenaar: na beëindigen geen overzicht meer (403)', na === 403, String(na));

    // ---------------------------------------------------------------- 5. telefoon: rode band (nood, direct)
    await E.page.evaluate(async ([t, mail]) => fetch('/api/ondersteuning/aanvragen', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin, email: mail, reden: 'E2E аварія', minuten: 5, nood: true }) }), [E.tab, klantMail]);
    await K.page.setViewportSize({ width: 390, height: 820 });
    await K.page.reload({ waitUntil: 'domcontentloaded' });
    await K.page.locator('[data-ond-band]').waitFor({ timeout: 20000 });
    const tel = await K.page.evaluate(() => ({ pagina: document.documentElement.scrollWidth <= innerWidth + 1, knop: !!document.querySelector('[data-ond-knop="beeindigen"]'), tekst: document.querySelector('[data-ond-band]')!.textContent || '' }));
    check('telefoon: noodtoegang direct zichtbaar als rode band met «Завершити», geen horizontaal scrollen', tel.pagina && tel.knop && /термінова/.test(tel.tekst), JSON.stringify(tel));
    await K.page.screenshot({ path: `${UIT}/ondersteuning-5-telefoon.png` });
    check('geen consolefouten (eigenaar en klant)', E.fouten.length === 0 && K.fouten.length === 0, [...E.fouten, ...K.fouten].slice(0, 5).join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await sys.query('DELETE FROM app.ondersteuning_verzoeken WHERE aanvrager_id = ANY($1) OR doel_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_activaties WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
