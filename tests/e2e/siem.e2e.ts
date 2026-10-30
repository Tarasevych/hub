// E2E etap E (14.10.2026) in een echte Chrome: eigenaar → technisch profiel → een beheeractie (vlag) → journaal op mcp.* toont «ТЕХ»
// met het profiel-id → database: ctx_profiel → «Щось не працює? Перевірка» → «Журнал і SIEM»: eerst «вимкнено», daarna (export naar
// een NDJSON-bestand op deze machine) «працює» en de regel staat in het bestand, zonder geheimen. Geen consolefouten.
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { siemConfig, siemRonde } from '../../backend/siem';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e siem');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-siem-${T}@example.test`, sub = `sub-e2e-siem-${T}`;
  const sleutel = `siem-${randomBytes(3).toString('hex')}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const map = mkdtempSync(join(tmpdir(), 'e2e-siem-'));
  const bestand = join(map, 'audit.ndjson');
  const oudBestand = process.env.SIEM_BESTAND;
  const voorExport = (await sys.query('SELECT * FROM app.siem_export')).rows;
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
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { if (q.status() >= 400 && !/\/api\/owner\/agents\/activity$|\/downloads\/extension-version\.json$/.test(q.url())) fouten.push(`http ${q.status()} ${q.url()}`); });
    const post = (pad: string, extra: Record<string, unknown> = {}) => page.evaluate(async ([p, t, e]) => {
      const res = await fetch(p as string, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin, ...(e as object) }) });
      return { status: res.status, data: await res.json().catch(() => null) };
    }, [pad, tab, extra] as const);

    await page.goto(`${MCP}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('.canonical-avatar-trigger').first().waitFor({ timeout: 20000 });
    const act = await post('/api/owner/tech/activeren', { minuten: 30, reden: 'E2E SIEM' });
    check('technisch profiel aan', act.status === 200);
    const profielId = String(act.data?.activatie?.profielId || '');
    // Begin van de export = NU (eerste ronde zet de cursor), daarna de beheeractie.
    process.env.SIEM_BESTAND = bestand;
    await sys.query('DELETE FROM app.siem_export');
    await siemRonde(siemConfig());
    const zet = await post('/api/beheer/flags/zetten', { vlag: { sleutel, omschrijving: 'E2E SIEM', aan: true, percentage: 0, gebruikers: [] } });
    check('beheeractie in het technisch profiel (vlag aangemaakt)', zet.status === 200);
    const rij = (await sys.query(`SELECT ctx_profiel, details->'_ctx'->>'activatie' AS act FROM app.audit WHERE owner_id=$1 AND action='owner.flags.gewijzigd' ORDER BY id DESC LIMIT 1`, [uid])).rows[0];
    check('database: ctx_profiel = het actieve profiel, activatie bewaard', !!profielId && rij?.ctx_profiel === profielId && rij?.act === act.data?.activatie?.id, JSON.stringify(rij));

    // ---------------------------------------------------------------- journaal op mcp.*
    await page.goto(`${MCP}/agents#journaal`, { waitUntil: 'networkidle' });
    await page.locator('[role=tab][data-tab="journaal"]').click();
    const regel = page.locator('[data-tab-inhoud="journaal"] [data-actie="owner.flags.gewijzigd"]').first();
    await regel.waitFor({ timeout: 15000 });
    check('journaal: regel met «ТЕХ»', await regel.locator('[data-journaal-ctx="profiel"]').innerText() === 'ТЕХ');
    await regel.locator('button').first().click();
    await page.waitForTimeout(300);
    check('uitgeklapt: technisch profiel met id', (await regel.innerText()).includes(profielId));
    await page.screenshot({ path: `${UIT}/siem-1-journaal.png` });

    // ---------------------------------------------------------------- «Журнал і SIEM»
    const open = async () => {
      await page.locator('.canonical-avatar-trigger').first().click();
      await page.getByRole('button', { name: /Щось не працює\? Перевірка/ }).click();
      await page.locator('[data-diagnose]').waitFor({ timeout: 10000 });
      await page.locator('[data-diag-blad="siem"]').click();
      await page.locator('[data-diag-siem]').waitFor({ timeout: 10000 });
    };
    delete process.env.SIEM_BESTAND;
    await open();
    check('zonder siem.env: «Експорт вимкнено» met de opdracht om aan te zetten', await page.locator('[data-siem-oordeel]').getAttribute('data-siem-oordeel') === 'uit' && /siem aan --bestand/.test(await page.locator('[data-diag-siem]').innerText()));
    process.env.SIEM_BESTAND = bestand;
    const ronde = await siemRonde(siemConfig());
    await page.locator('[data-siem-knop="vernieuwen"]').click();
    await page.waitForFunction(() => document.querySelector('[data-siem-oordeel]')?.getAttribute('data-siem-oordeel') !== 'uit', null, { timeout: 10000 }).catch(() => undefined);
    check('met export naar een bestand: «Експорт працює», 0 wachtend', await page.locator('[data-siem-oordeel]').getAttribute('data-siem-oordeel') === 'ok' && Number(ronde.bestand) >= 1, JSON.stringify(ronde));
    await page.screenshot({ path: `${UIT}/siem-2-stand.png` });
    const lijnen = existsSync(bestand) ? readFileSync(bestand, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
    const vlag = lijnen.find((l) => l.event?.action === 'owner.flags.gewijzigd' && l.owner === uid);
    check('NDJSON: de beheeractie met profiel-veld, zonder _ctx in details', !!vlag && vlag.profiel === profielId && !('_ctx' in (vlag.details ?? {})), JSON.stringify(vlag ?? lijnen.slice(-1)).slice(0, 300));
    check('geen consolefouten', fouten.length === 0, fouten.slice(0, 5).join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    if (oudBestand === undefined) delete process.env.SIEM_BESTAND; else process.env.SIEM_BESTAND = oudBestand;
    await sys.query('DELETE FROM app.siem_export').catch(() => undefined);
    for (const r of voorExport) await sys.query('INSERT INTO app.siem_export (bestemming, laatste_id, geexporteerd) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [r.bestemming, r.laatste_id, r.geexporteerd]).catch(() => undefined);
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
