// E2E feature flags (etap F, 14.10.2026) in een echte Chrome: eigenaar → technisch profiel → «Прапорці» → nieuwe vlag (uit voor iedereen
// behalve de lijst) → eigen waarde «uit» → «Тест: так» → eigen waarde «aan» (ook via OFREP) → wijzigen naar 100 % → test weghalen →
// nog steeds «aan» via de uitrol → verwijderen in twee stappen → onbekend = uit (OFREP 404). Telefoon 390 px: knop in het «⋯»-menu,
// venster zonder horizontaal scrollen. Logboek en geen consolefouten.
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
  const { check, einde } = checker('e2e flags');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-vlag-${T}@example.test`, sub = `sub-e2e-vlag-${T}`;
  const sleutel = `e2e-${randomBytes(3).toString('hex')}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  let uid = '';
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    const r = await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    check('aanmelden', r.cb.data.sessionCreated === true);
    uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'uk-UA', serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    const fouten: string[] = [];
    let verwacht403 = 0; // precies één bewuste weigering (zonder technisch profiel)
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { if (q.status() === 403 && verwacht403 > 0 && /\/api\/beheer\/flags$/.test(q.url())) { verwacht403--; return; } if (q.status() >= 400 && !/\/api\/owner\/agents\/activity$|\/downloads\/extension-version\.json$|\/api\/ofrep\//.test(q.url())) fouten.push(`http ${q.status()} ${q.url()}`); });
    const post = (pad: string, extra: Record<string, unknown> = {}) => page.evaluate(async ([p, t, e]) => {
      const res = await fetch(p as string, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin, ...(e as object) }) });
      return { status: res.status, data: await res.json().catch(() => null) };
    }, [pad, tab, extra] as const);

    await page.goto(`${MCP}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('.canonical-avatar-trigger').first().waitFor({ timeout: 20000 });
    verwacht403 = 1;
    check('zonder technisch profiel: beheerlijst geweigerd', (await post('/api/beheer/flags')).status === 403);
    check('technisch profiel aan', (await post('/api/owner/tech/activeren', { minuten: 30, reden: 'E2E vlaggen' })).status === 200);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // ---------------------------------------------------------------- 1. nieuwe vlag
    await page.locator('[data-tech-band] [data-tech-knop="vlaggen"]').click({ timeout: 20000 });
    const v = page.locator('[data-vlaggen-venster]');
    await v.waitFor({ timeout: 10000 });
    await v.locator('[data-vlag-knop="nieuw"]').click();
    await v.locator('[data-vlag-veld="sleutel"]').fill(sleutel);
    await v.locator('[data-vlag-veld="omschrijving"]').fill('E2E: нова функція');
    await v.locator('[data-vlag-veld="aan"]').check();
    await v.locator('[data-vlag-knop="opslaan"]').click();
    const rij = v.locator(`[data-vlag="${sleutel}"]`);
    await rij.waitFor({ timeout: 10000 });
    check('vlag in de lijst; voor de eigenaar «ні» (niet in de lijst, standaard uit)', await rij.locator('[data-vlag-voor-mij]').getAttribute('data-vlag-voor-mij') === 'uit');
    const eigen = async () => ((await post('/api/flags', { sleutels: [sleutel] })).data?.vlaggen?.[0] ?? {}) as { value?: boolean; reason?: string; metadata?: { test?: boolean } };
    check('/api/flags: uit, STATIC', (await eigen()).value === false && (await eigen()).reason === 'STATIC');
    await page.screenshot({ path: `${UIT}/flags-1-lijst.png` });

    // ---------------------------------------------------------------- 2. test voor zichzelf
    await rij.locator('[data-vlag-test="aan"]').click();
    await page.waitForFunction((s) => document.querySelector(`[data-vlag="${s}"] [data-vlag-voor-mij]`)?.getAttribute('data-vlag-voor-mij') === 'aan', sleutel, { timeout: 10000 }).catch(() => undefined);
    check('«Тест: так» → voor mij aan (test)', (await eigen()).value === true && (await eigen()).metadata?.test === true);
    const of = await post(`/api/ofrep/v1/evaluate/flags/${sleutel}`);
    check('OFREP één vlag: 200, value true, variant aan', of.status === 200 && of.data?.value === true && of.data?.variant === 'aan' && of.data?.key === sleutel, JSON.stringify(of));
    const alle = await post('/api/ofrep/v1/evaluate/flags');
    check('OFREP lijst: bevat de vlag', alle.status === 200 && Array.isArray(alle.data?.flags) && alle.data.flags.some((x: { key: string }) => x.key === sleutel));

    // ---------------------------------------------------------------- 3. wijzigen naar 100 %, test weghalen
    await rij.locator('[data-vlag-knop="wijzigen"]').click();
    await v.locator('[data-vlag-veld="percentage"]').fill('100');
    await v.locator('[data-vlag-knop="opslaan"]').click();
    await page.waitForFunction((s) => /100%/.test(document.querySelector(`[data-vlag="${s}"]`)?.textContent || ''), sleutel, { timeout: 10000 }).catch(() => undefined);
    await rij.locator('[data-vlag-test="weg"]').click();
    await page.waitForFunction((s) => !document.querySelector(`[data-vlag="${s}"] [data-vlag-test="weg"]`), sleutel, { timeout: 10000 }).catch(() => undefined);
    check('na 100 % en zonder test: aan via de uitrol (SPLIT)', (await eigen()).value === true && (await eigen()).reason === 'SPLIT');
    await page.screenshot({ path: `${UIT}/flags-2-uitrol.png` });

    // ---------------------------------------------------------------- 4. telefoon: knop in «⋯», venster past
    // Zelfde tabblad (de activering hoort bij DIT tabblad; een nieuw tabblad krijgt een eigen context zonder technisch profiel).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-tech-band] [data-tech-knop="meer"]').click({ timeout: 20000 });
    await page.locator('[data-tech-band] [data-tech-knop="vlaggen"]').click();
    await page.locator('[data-vlaggen-venster]').waitFor({ timeout: 10000 });
    const breed = await page.evaluate(() => { const el = document.querySelector('[data-vlaggen-venster]') as HTMLElement; return el.scrollWidth <= el.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1; });
    check('telefoon 390 px: via «⋯», geen horizontaal scrollen', breed);
    await page.screenshot({ path: `${UIT}/flags-3-telefoon.png` });
    await page.setViewportSize({ width: 1280, height: 900 });

    // ---------------------------------------------------------------- 5. verwijderen in twee stappen
    await rij.locator('[data-vlag-knop="verwijderen"]').click();
    check('verwijderen vraagt een tweede klik', await rij.locator('[data-vlag-knop="zeker"]').isVisible());
    await rij.locator('[data-vlag-knop="zeker"]').click();
    await rij.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    const weg = await post(`/api/ofrep/v1/evaluate/flags/${sleutel}`);
    check('na verwijderen: OFREP 404 FLAG_NOT_FOUND, value false', weg.status === 404 && weg.data?.errorCode === 'FLAG_NOT_FOUND' && weg.data?.value === false, JSON.stringify(weg));
    const acties = (await sys.query(`SELECT DISTINCT action FROM app.audit WHERE owner_id=$1 AND action LIKE 'owner.flags.%'`, [uid])).rows.map((x) => x.action).sort();
    check('logboek: gewijzigd, getest, verwijderd', ['owner.flags.getest', 'owner.flags.gewijzigd', 'owner.flags.verwijderd'].every((a) => acties.includes(a)), acties.join(','));
    check('geen consolefouten', fouten.length === 0, fouten.slice(0, 5).join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await sys.query('DELETE FROM app.feature_flags WHERE sleutel=$1', [sleutel]).catch(() => undefined);
    if (uid) {
      await sys.query('DELETE FROM app.tech_activaties WHERE user_id=$1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [uid]).catch(() => undefined);
    }
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
