// E2E terminal (13.10.2026) met een ECHTE agent (eigen proces, WSS) en een echte Chrome met xterm.js: koppelen → terminal-config on →
// technisch profiel → «Термінал» → openen (reden, alleen-lezen) → typen «echo …» → uitvoer in xterm → container-argumenten veilig →
// sluiten → opname in de database → «Відтворити запис» toont dezelfde uitvoer → logboek. Geen CSP- of consolefouten (xterm-stijlen).
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import * as store from '../../backend/connectors-store';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e terminal');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-term-${T}@example.test`, sub = `sub-e2e-term-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS, agentGateway: true });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const werk = mkdtempSync(join(tmpdir(), 'e2e-term-'));
  const bin = join(werk, 'bin'); mkdirSync(bin);
  chmodSync(resolve('tests/eenheid/hulp/nep-term-runtime.mjs'), 0o755);
  symlinkSync(resolve('tests/eenheid/hulp/nep-term-runtime.mjs'), join(bin, 'podman'));
  const project = join(werk, 'project'); mkdirSync(project);
  const agentEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HUB_AGENT_CONFIG: join(werk, 'config.json'), NEP_TERM_DIR: werk,
    NODE_EXTRA_CA_CERTS: join(TLS, 'ca.crt'), HTTPS_PROXY: '', https_proxy: '', HTTP_PROXY: '', http_proxy: '', NODE_USE_ENV_PROXY: '' };
  const draai = (args: string[]) => new Promise<{ status: number | null; stdout: string; stderr: string }>((res) => {
    const p = spawn(process.execPath, args, { env: agentEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; }); p.stderr.on('data', (d) => { stderr += d; });
    const t = setTimeout(() => p.kill(), 30000);
    p.on('close', (status) => { clearTimeout(t); res({ status, stdout, stderr }); });
  });
  const agentArgs = (...a: string[]) => ['--import', resolve('tests/e2e/hulp/agent-lokaal.mjs'), resolve('deploy/agent/agent.mjs'), ...a];
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  let agentProc: ChildProcess | null = null;
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

    await page.goto(`${MCP}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('.canonical-avatar-trigger').first().waitFor({ timeout: 20000 });
    // ---------------------------------------------------------------- 1. echte agent koppelen + terminal aan
    const code = await page.evaluate(async (t) => (await (await fetch('/api/owner/agents/pairing-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin }) })).json()).code as string, tab);
    const pair = await draai(agentArgs('pair', '--server', `${MCP}:${POORT}`, '--code', code, '--name', 'term-test', '--root', project));
    check('agent gekoppeld', pair.status === 0 && /Paired/.test(pair.stdout), `${pair.stdout} ${pair.stderr}`.slice(0, 200));
    const tc = await draai(agentArgs('terminal-config', 'on', '--runtime', 'podman'));
    check('terminal-config on (alleen op het apparaat zelf)', tc.status === 0 && /Термінал увімкнено/.test(tc.stdout), `${tc.stdout} ${tc.stderr}`.slice(0, 200));
    agentProc = spawn(process.execPath, agentArgs('run'), { env: agentEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let agentLog = ''; agentProc.stdout?.on('data', (d) => { agentLog += d; }); agentProc.stderr?.on('data', (d) => { agentLog += d; });
    let agent: store.AgentRow | undefined;
    for (let i = 0; i < 40; i++) { agent = (await store.listAgents(uid)).find((a) => a.name === 'term-test'); if (agent && (agent.capabilities as any)?.terminal?.enabled && agent.status === 'connected') break; await wacht(500); }
    check('agent verbonden en meldt terminal aan', !!(agent?.capabilities as any)?.terminal?.enabled, `${JSON.stringify(agent?.capabilities ?? null).slice(0, 200)} ${agentLog.slice(-200)}`);

    // ---------------------------------------------------------------- 2. technisch profiel → Термінал → openen
    const act = await page.evaluate(async (t) => (await fetch('/api/owner/tech/activeren', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin, minuten: 60, reden: 'E2E terminal' }) })).status, tab);
    check('technisch profiel aan', act === 200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-tech-band] [data-tech-knop="terminal"]').click({ timeout: 20000 });
    const ov = page.locator('[data-term-venster="openen"]');
    await ov.waitFor({ timeout: 10000 });
    await ov.locator('[data-term-apparaat]').waitFor({ timeout: 10000 });
    check('venster: apparaat en map gekozen, standaard alleen lezen', (await ov.locator('[data-term-apparaat] option:checked').innerText()).includes('term-test') && (await ov.locator('[data-term-root]').inputValue()) === project && !(await ov.locator('[data-term-schrijven]').isChecked()));
    await ov.locator('[data-term-reden]').fill('E2E: перевірка термінала');
    await page.screenshot({ path: `${UIT}/terminal-1-openen.png` });
    await ov.locator('[data-term-knop="openen"]').click();
    const sessie = page.locator('[data-term-sessie]');
    await sessie.waitFor({ timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('[data-term-sessie]')?.getAttribute('data-term-stand') === 'actief', null, { timeout: 15000 }).catch(() => undefined);
    check('terminal actief (container gestart via ondertekende term.open)', await sessie.getAttribute('data-term-stand') === 'actief');
    await page.waitForFunction(() => /werk\$/.test(document.querySelector('[data-term-doos] .xterm-rows')?.textContent || ''), null, { timeout: 10000 }).catch(() => undefined);
    await page.locator('[data-term-doos] .xterm-helper-textarea').focus();
    await page.keyboard.type('echo hoi-uit-e2e');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => (document.querySelector('[data-term-doos] .xterm-rows')?.textContent || '').split('hoi-uit-e2e').length > 1, null, { timeout: 10000 }).catch(() => undefined);
    const tekst = await page.locator('[data-term-doos] .xterm-rows').innerText();
    check('typen in xterm → container → uitvoer in de browser', /hoi-uit-e2e/.test(tekst), tekst.slice(0, 200));
    const kleur = await page.evaluate(() => getComputedStyle(document.querySelector('[data-term-doos] .xterm-rows')!).color);
    check('xterm-stijlen toegepast ondanks strikte CSP (thema-kleur)', kleur === 'rgb(230, 237, 243)', kleur);
    await page.screenshot({ path: `${UIT}/terminal-2-sessie.png` });
    const runArgs = JSON.parse(readFileSync(join(werk, 'run.json'), 'utf8')) as string[];
    check('container: --network none, --cap-drop ALL, --read-only, map alleen-lezen', runArgs.includes('none') && runArgs.includes('ALL') && runArgs.includes('--read-only') && runArgs.includes(`${project}:/werk:ro`));

    // ---------------------------------------------------------------- 3. sluiten → opname → afspelen
    const sid = String(await sessie.getAttribute('data-term-sessie'));
    await sessie.locator('[data-term-knop="sluiten"]').click();
    for (let i = 0; i < 30; i++) { const r2 = (await sys.query('SELECT einde_op, opname IS NOT NULL AS o, bytes_uit FROM app.terminal_sessies WHERE id=$1', [sid])).rows[0]; if (r2?.einde_op && r2.o) break; await wacht(300); }
    const rij = (await sys.query('SELECT einde_op, einde_reden, opname IS NOT NULL AS o, bytes_uit FROM app.terminal_sessies WHERE id=$1', [sid])).rows[0];
    check('sessie gesloten en opname bewaard', !!rij?.einde_op && rij.o === true && Number(rij.bytes_uit) > 0, JSON.stringify(rij));
    await page.locator('[data-tech-band] [data-tech-knop="terminal"]').click();
    await page.locator('[data-term-knop="opnames"]').click();
    const lijst = page.locator('[data-term-venster="opnames"]');
    await lijst.locator(`[data-term-knop="opname:${sid}"]`).click({ timeout: 10000 });
    await page.waitForFunction(() => /hoi-uit-e2e/.test(document.querySelector('[data-term-afspelen] .xterm-rows')?.textContent || ''), null, { timeout: 10000 }).catch(() => undefined);
    check('«Відтворити запис» toont dezelfde uitvoer', /hoi-uit-e2e/.test(await lijst.locator('[data-term-afspelen] .xterm-rows').innerText().catch(() => '')));
    await page.screenshot({ path: `${UIT}/terminal-3-opname.png` });
    const acties = (await sys.query(`SELECT action FROM app.audit WHERE owner_id=$1 AND action LIKE 'owner.terminal.%'`, [uid])).rows.map((x) => x.action);
    check('logboek: geopend, gesloten, opname bekeken', ['owner.terminal.geopend', 'owner.terminal.gesloten', 'owner.terminal.opname.bekeken'].every((a) => acties.includes(a)), acties.join(','));
    check('geen consolefouten (ook geen CSP-meldingen van xterm)', fouten.length === 0, fouten.slice(0, 5).join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    agentProc?.kill('SIGTERM');
    if (uid) {
      await sys.query('DELETE FROM app.terminal_sessies WHERE user_id=$1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_activaties WHERE user_id=$1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [uid]).catch(() => undefined);
    }
    await browser.close().catch(() => undefined);
    await stop();
    void existsSync;
  }
  return einde();
}
