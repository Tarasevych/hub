// E2E «Додатки» (BYOS-PaaS) met een ECHTE agent (deploy/agent/agent.mjs als apart proces, via WSS) en een echte Chrome:
// koppelen met een koppelcode → apps-config (nep-podman als runtime) → app_deploy (bestanden via een eenmalig ticket, nooit in de
// bewaarde opdracht) → app_secret_request (link) → de eigenaar typt de waarde op mcp.*/apps → de waarde staat alleen op het
// apparaat (0600), niet in de database → lijst, logboek (gemaskeerd), herstarten en terugdraaien vanuit de pagina.
import { createRequire } from 'node:module';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import * as grants from '../../backend/ai-grants';
import * as store from '../../backend/connectors-store';
import { callTool } from '../../backend/connectors-tools';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e apps-byos');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-apps-${T}@example.test`, sub = `sub-e2e-apps-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS, agentGateway: true });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const werk = mkdtempSync(join(tmpdir(), 'e2e-apps-'));
  const bin = join(werk, 'bin'); mkdirSync(bin);
  symlinkSync(resolve('tests/eenheid/hulp/nep-podman.mjs'), join(bin, 'podman'));
  const agentEnv = {
    ...process.env, PATH: `${bin}:${process.env.PATH}`, HUB_AGENT_CONFIG: join(werk, 'config.json'), NEP_PODMAN_DIR: werk,
    NODE_EXTRA_CA_CERTS: join(TLS, 'ca.crt'), HTTPS_PROXY: '', https_proxy: '', HTTP_PROXY: '', http_proxy: '', NODE_USE_ENV_PROXY: '',
  };
  // Async (niet spawnSync): de testserver draait in DIT proces en moet kunnen antwoorden terwijl de agent wacht.
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
    check('aanmelden op mcp gaf een sessie', r.cb.data.sessionCreated === true, JSON.stringify(r.cb.data).slice(0, 200));
    uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'uk-UA' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    const fouten: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    // Verwacht: één 403 (NO_GRANT) bij het bewust starten zonder toestemming (stap «ontbrekende toestemming»).
    let verwacht403 = 0;
    page.on('response', (q) => { if (q.status() === 403 && /\/api\/owner\/agents\/[0-9a-f-]+\/command$/.test(q.url()) && verwacht403++ === 0) return; if (q.status() >= 400) fouten.push(`http ${q.status()} ${q.url()}`); });

    // ---------------------------------------------------------------- 1. koppelen (echte agent) en apps aanzetten
    await page.goto(`${MCP}/apps`, { waitUntil: 'networkidle' });
    await page.locator('[data-apps-pagina]').waitFor({ timeout: 20000 });
    check('pagina mcp.*/apps: kop en uitleg; zonder apparaat met apps: instructies open', /Додатки на вашому залізі/.test(await page.locator('h1').innerText())
      && await page.locator('[data-apps-leeg]').isVisible() && await page.locator('[data-server-koppelen]').isVisible() && /apps-config/.test(await page.locator('details').first().innerText()));
    // (randen van kaarten volgen het oppervlaktemodel van de site — «flat-content» maakt ze bewust vlak)
    check('stijlen van de pagina geladen (raster met tussenruimte tussen de kaarten)', await page.evaluate(() => { const m = getComputedStyle(document.querySelector('[data-apps-pagina]')!); return m.display === 'grid' && m.rowGap === '18px'; }));
    await page.screenshot({ path: `${UIT}/apps-01-leeg.png`, fullPage: true });
    const code = await page.evaluate(async (t) => {
      const res = await fetch('/api/owner/agents/pairing-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin }) });
      return (await res.json()).code as string;
    }, tab);
    check('koppelcode opgehaald', /^[A-Z0-9]{8}$/.test(code || ''), String(code));
    const pair = await draai(agentArgs('pair', '--server', `${MCP}:${POORT}`, '--code', code, '--name', 'apps-test', '--root', werk));
    check('agent.mjs pair (eigen proces, TLS met test-CA)', pair.status === 0 && /Paired/.test(pair.stdout), `${pair.stdout} ${pair.stderr}`.slice(0, 300));
    const cfgRun = await draai(agentArgs('apps-config', '--apps-root', join(werk, 'apps'), '--runtime', 'podman', '--memory', '256m'));
    check('agent.mjs apps-config: apps aan met podman', cfgRun.status === 0 && /Додатки увімкнено/.test(cfgRun.stdout), `${cfgRun.stdout} ${cfgRun.stderr}`.slice(0, 300));
    agentProc = spawn(process.execPath, agentArgs('run'), { env: agentEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let agentLog = ''; agentProc.stdout?.on('data', (d) => { agentLog += d; }); agentProc.stderr?.on('data', (d) => { agentLog += d; });
    let agent: store.AgentRow | undefined;
    for (let i = 0; i < 40; i++) { agent = (await store.listAgents(uid)).find((a) => a.name === 'apps-test'); if (agent && (agent.capabilities as any)?.apps === true && agent.status === 'connected') break; await wacht(500); }
    check('agent verbonden via WSS en meldt apps aan', !!agent && (agent.capabilities as any)?.apps === true, `${JSON.stringify(agent?.capabilities ?? null).slice(0, 200)} | ${agentLog.slice(-300)}`);
    if (!agent) throw new Error('agent niet verbonden; verdere stappen hebben geen zin');
    // De eigenaar geeft toestemming (zoals op «Агенти»): containerbeheer met «altijd» (step-up), en zet app_deploy aan.
    await grants.setCapabilityCeiling(uid, uid, { 'machine.docker': true } as never).catch(() => undefined);
    await grants.addGrants(uid, uid, [{ agentId: agent!.id, capability: 'machine.docker', always: true, minutes: 60 } as never], { steppedUp: true });
    await store.setToolModes(uid, { app_deploy: 'always', app_control: 'always', app_rollback: 'always' });

    // ---------------------------------------------------------------- 2. uitrollen (bestanden via ticket)
    const files = [{ path: 'index.html', content: '<h1>Mijn demo</h1>' }, { path: 'css/s.css', content: 'body{color:#123}' }];
    const dep = await callTool(uid, 'app_deploy', { name: 'demo', files, env: { MODE: 'productie' } }, { eigenaarZelf: true });
    const depData = dep.isError ? null : JSON.parse(dep.content[0].text).data;
    check('app_deploy: klaar, lokale URL, logregels', depData?.state === 'done' && /^http:\/\/127\.0\.0\.1:20\d{3}$/.test(depData.url), dep.content[0].text.slice(0, 400));
    const rij = (await sys.query("SELECT params FROM app.agent_commands WHERE user_id = $1 AND type = 'apps.deploy' ORDER BY created_at DESC LIMIT 1", [uid])).rows[0]?.params;
    check('bewaarde opdracht bevat alleen ticket + samenvatting, geen bestandsinhoud of env-waarden',
      !!rij && typeof rij.bundle === 'string' && !('files' in rij) && !('env' in rij) && !JSON.stringify(rij).includes('Mijn demo') && !JSON.stringify(rij).includes('productie')
      && rij.summary?.files === 2 && JSON.stringify(rij.summary.envKeys) === '["MODE"]', JSON.stringify(rij).slice(0, 300));
    await wacht(1100);
    const dep2 = await callTool(uid, 'app_deploy', { name: 'demo', files: [{ path: 'index.html', content: '<h1>v2</h1>' }] }, { eigenaarZelf: true });
    check('tweede uitrol: nieuwe versie', !dep2.isError && JSON.parse(dep2.content[0].text).data.state === 'done', dep2.content[0].text.slice(0, 200));

    // ---------------------------------------------------------------- 3. geheim: link → eigenaar typt → alleen op het apparaat
    const link = await callTool(uid, 'app_secret_request', { name: 'demo', key: 'API_TOKEN', reason: 'Sleutel voor de demo-API' }, { eigenaarZelf: true });
    const lj = link.isError ? null : JSON.parse(link.content[0].text);
    check('app_secret_request geeft een eenmalige link naar mcp.*/apps?geheim=…', !!lj && /^https:\/\/mcp\.tarasevych\.com\/apps\?geheim=/.test(lj.link), link.content[0].text.slice(0, 200));
    let melding: any = null;
    for (let i = 0; i < 20 && !melding; i++) { melding = (await sys.query("SELECT data FROM app.records WHERE tbl = 'site_notifications' AND data->>'recipientUserId' = $1 AND data->>'kind' = 'mcp_app_secret' ORDER BY created_at DESC LIMIT 1", [uid]).catch(() => ({ rows: [] as any[] }))).rows[0]?.data; if (!melding) await wacht(200); }
    check('melding op de site (bel + badge «Додатки») met de link, zonder waarde', !!melding && melding.link === lj.link && /API_TOKEN/.test(melding.title), JSON.stringify(melding ?? null).slice(0, 200));
    await page.goto(`${lj.link.replace(MCP, `${MCP}`)}`, { waitUntil: 'networkidle' });
    const kaart = page.locator('[data-geheim]');
    await kaart.waitFor({ timeout: 15000 });
    const kaartTekst = await kaart.innerText();
    check('geheimkaart: app, variabele, apparaat en uitleg van de AI zichtbaar; veld is een wachtwoordveld', /demo/.test(kaartTekst) && /API_TOKEN/.test(kaartTekst) && /apps-test/.test(kaartTekst) && /Sleutel voor de demo-API/.test(kaartTekst)
      && await page.locator('[data-geheim-waarde]').getAttribute('type') === 'password', kaartTekst.slice(0, 300));
    await page.screenshot({ path: `${UIT}/apps-02-geheim.png`, fullPage: true });
    const GEHEIM = `zeer-geheim-${randomBytes(6).toString('hex')}`;
    await page.locator('[data-geheim-waarde]').fill(GEHEIM);
    await page.locator('[data-geheim-opslaan]').click();
    await page.locator('[data-melding="ok"]').waitFor({ timeout: 30000 }).catch(() => undefined);
    const ok = await page.locator('[data-melding]').innerText().catch(() => '');
    check('opslaan: melding «Збережено на пристрої … ШІ значення не бачить», veld leeg', /Збережено на пристрої/.test(ok) && await page.locator('[data-geheim-waarde]').count() === 0, ok);
    await page.screenshot({ path: `${UIT}/apps-03-geheim-opgeslagen.png`, fullPage: true });
    const envBestand = join(werk, 'apps', 'secrets', 'demo.env');
    check('waarde staat op het apparaat (0600)', existsSync(envBestand) && readFileSync(envBestand, 'utf8').includes(GEHEIM) && (statSync(envBestand).mode & 0o777) === 0o600);
    const inDb = (await sys.query("SELECT count(*)::int AS n FROM app.agent_commands WHERE user_id = $1 AND (params::text LIKE $2 OR coalesce(result::text,'') LIKE $2)", [uid, `%${GEHEIM}%`])).rows[0].n;
    const inAudit = (await sys.query("SELECT count(*)::int AS n FROM app.audit WHERE details::text LIKE $1", [`%${GEHEIM}%`]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
    check('waarde staat NIET in opdrachten of audit van de site', inDb === 0 && inAudit === 0, `${inDb}/${inAudit}`);
    const namen = await callTool(uid, 'app_secret_list', { name: 'demo' }, { eigenaarZelf: true });
    check('app_secret_list: alleen de naam', !namen.isError && JSON.parse(namen.content[0].text).data.keys.join() === 'API_TOKEN' && !namen.content[0].text.includes(GEHEIM));
    await page.reload({ waitUntil: 'networkidle' });
    check('dezelfde link opnieuw: «Вже збережено», geen formulier', /Вже збережено/.test(await page.locator('[data-geheim]').innerText().catch(() => '')) && await page.locator('[data-geheim-waarde]').count() === 0);

    // ---------------------------------------------------------------- 4. overzicht en acties op de pagina
    await page.goto(`${MCP}/apps`, { waitUntil: 'networkidle' });
    const appRij = page.locator('[data-app="demo"]');
    await appRij.waitFor({ timeout: 30000 });
    const rijTekst = await appRij.innerText();
    check('panel: demo draait, versie, poort 127.0.0.1:20xxx → 8080, bewaking «відповідає», auto-verversen', await appRij.locator('[data-app-status]').getAttribute('data-app-status') === 'running' && /\d{14}/.test(rijTekst)
      && /127\.0\.0\.1:20\d{3} → 8080/.test(await appRij.locator('[data-app-poort]').innerText()) && await appRij.locator('[data-gezond]').getAttribute('data-gezond') === 'true'
      && /автоматично кожні 20 с/.test(await page.locator('[data-bijgewerkt]').innerText()), rijTekst);
    await appRij.getByRole('button', { name: 'Журнал' }).click();
    await appRij.locator('[data-app-log]').waitFor({ timeout: 30000 });
    const logTekst = await appRij.locator('[data-app-log]').innerText();
    check('logboek: geheime waarde gemaskeerd (***)', /\*\*\*/.test(logTekst) && !logTekst.includes(GEHEIM), logTekst.slice(0, 300));
    await page.screenshot({ path: `${UIT}/apps-04-lijst-log.png`, fullPage: true });
    await appRij.getByRole('button', { name: 'Відкотити' }).click();
    await page.locator('[data-melding="ok"]').waitFor({ timeout: 40000 }).catch(() => undefined);
    check('terugdraaien vanaf de pagina: melding klaar', /Відкат до попередньої версії: готово/.test(await page.locator('[data-melding]').innerText().catch(() => '')), await page.locator('[data-melding]').innerText().catch(() => ''));
    await page.locator('[data-app="demo"]').getByRole('button', { name: 'Зупинити', exact: true }).click();
    await page.locator('[data-melding="ok"]').waitFor({ timeout: 40000 }).catch(() => undefined);
    await page.locator('[data-app="demo"] [data-app-status="stopped"]').waitFor({ timeout: 20000 }).catch(() => undefined);
    check('stoppen vanaf de pagina: status «зупинено»', await page.locator('[data-app="demo"] [data-app-status]').getAttribute('data-app-status') === 'stopped');
    // ontbrekende toestemming: knop staat erbij, één klik geeft hem (zonder console of config)
    await grants.revokeGrants(uid, uid, { agentId: agent!.id, capability: 'machine.docker' } as never);
    await page.locator('[data-app="demo"]').getByRole('button', { name: 'Запустити', exact: true }).click();
    const knop = page.locator('[data-melding="fout"] [data-toestemming="machine.docker"]');
    await knop.waitFor({ timeout: 20000 }).catch(() => undefined);
    check('zonder toestemming: duidelijke melding met knop «Дозволити керувати контейнерами»', await knop.isVisible().catch(() => false), await page.locator('[data-melding]').innerText().catch(() => ''));
    await knop.click();
    await page.locator('[data-melding="ok"]').waitFor({ timeout: 20000 }).catch(() => undefined);
    check('knop geeft de toestemming (30 dagen) en meldt dat', /Дозволено керувати контейнерами/.test(await page.locator('[data-melding]').innerText().catch(() => '')));
    await page.locator('[data-app="demo"]').getByRole('button', { name: 'Запустити', exact: true }).click();
    await page.locator('[data-app="demo"] [data-app-status="running"]').waitFor({ timeout: 40000 }).catch(() => undefined);
    check('daarna starten vanaf de pagina (verse goedkeuring met deze klik)', await page.locator('[data-app="demo"] [data-app-status]').getAttribute('data-app-status') === 'running', await page.locator('[data-melding]').innerText().catch(() => ''));
    // «Підключити цей сервер»: code + één commando (beheer zonder sudo + apps), kopieerknop
    await page.locator('[data-maak-codes]').click();
    await page.locator('[data-commando] pre').waitFor({ timeout: 15000 });
    const cmd = await page.locator('[data-commando] pre').innerText();
    check('server koppelen: één commando met beheer-koppelen + apps-inrichten + apps-koppelen, codes ingevuld, alleen mijn-ruimte-installeer',
      /sudo \/usr\/local\/sbin\/mijn-ruimte-installeer beheer-koppelen [A-Z0-9]{8} --gebruiker beheer --root '\/home\/beheer' --readonly-root \/srv\/mijn-ruimte\/current --allow git/.test(cmd)
      && /apps-inrichten \/srv\/mijn-ruimte\/current --caddy tunnel/.test(cmd) && /apps-koppelen [A-Z0-9]{8} --domein '\{app\}-app\.tarasevych\.com'/.test(cmd) && !/\/root|bash /.test(cmd), cmd);
    await page.locator('[data-programma="node"]').click();
    check('node kiezen: waarschuwing en --allow git,node', await page.locator('.mapps-waarschuwing').isVisible() && /--allow git,node/.test(await page.locator('[data-commando] pre').innerText()));
    await page.screenshot({ path: `${UIT}/apps-07-server-koppelen.png`, fullPage: true });
    // Hulpmiddelen: nieuwe groep «Додатки» verschijnt vanzelf — zonder ondertekend beleid als tabblad met schakelaars,
    // met een ondertekend beleid (zoals bij de eigenaar) als groep in «Доступ ШІ за підписом», met de hulpmiddelen erbij.
    await page.goto(`${MCP}/agents#ai`, { waitUntil: 'networkidle' });
    await page.locator('#ag-ai-hulpmiddelen, [data-hub-section="ag-ai-hulpmiddelen"]').first().waitFor({ timeout: 20000 }).catch(() => undefined);
    const beleidActief = await page.locator('[data-beleid-actief="1"]').count() > 0;
    if (!beleidActief) {
      const kop = page.locator('[data-hub-section="ag-ai-hulpmiddelen"] .hub-section-toggle');
      if (await kop.getAttribute('aria-expanded').catch(() => 'true') === 'false') await kop.click();
      const groep = page.locator('[data-tool-group="apps"]');
      await groep.waitFor({ timeout: 20000 }).catch(() => undefined);
      await page.screenshot({ path: `${UIT}/apps-08-hulpmiddelen.png`, fullPage: true });
      check('hulpmiddelen: tabblad «Додатки» met alle 11 app_*-hulpmiddelen', await groep.isVisible().catch(() => false) && /Додатки/.test(await groep.innerText()) && /\/11/.test(await groep.innerText()), `${await page.locator('[data-tool-group]').evaluateAll((e) => e.map((x) => x.getAttribute('data-tool-group') + ':' + (x as HTMLElement).innerText).join(' | ')).catch(() => '')} ${page.url()} ${await page.locator('[data-mcp-tools]').getAttribute('data-mcp-tools').catch(() => '?')}`);
      await groep.click();
      await page.getByRole('button', { name: 'Увімкнути групу: питати щоразу' }).click();
      await page.locator('[data-tool="app_deploy"][data-mode="ask"]').waitFor({ timeout: 15000 }).catch(() => undefined);
      check('«Увімкнути групу: питати щоразу» zet ook de riskante app_* op «Питати»', await page.locator('[data-tool="app_deploy"]').getAttribute('data-mode') === 'ask' && await page.locator('[data-tool="app_rollback"]').getAttribute('data-mode') === 'ask');
    } else {
      await page.goto(`${MCP}/agents#beleid`, { waitUntil: 'networkidle' });
      const tools = page.locator('[data-tools="apps.deploy"]').first();
      await tools.waitFor({ timeout: 20000 }).catch(() => undefined);
      check('beleid: groep «Додатки» met de hulpmiddelen per mogelijkheid (levend van de server)', /Розгорнути додаток/.test(await tools.innerText().catch(() => '')) && /Додатки/.test(await page.locator('.aib-groep h3').allInnerTexts().then((x) => x.join(' ')).catch(() => '')), await tools.innerText().catch(() => ''));
    }
    await page.screenshot({ path: `${UIT}/apps-08-hulpmiddelen.png`, fullPage: true });
    await page.goto(`${MCP}/apps`, { waitUntil: 'networkidle' });
    await page.locator('[data-app="demo"]').waitFor({ timeout: 30000 });
    // donker thema + smal scherm: geen horizontale scroll, knoppen bereikbaar
    await page.setViewportSize({ width: 390, height: 844 });
    const breed = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('telefoonbreedte: geen horizontale scroll', breed <= 1, String(breed));
    await page.screenshot({ path: `${UIT}/apps-05-telefoon.png`, fullPage: true });
    // axe (als beschikbaar): geen ernstige problemen op de pagina
    const axePad = process.env.AXE_CORE || join(dirname(PW), 'axe-core', 'axe.min.js');
    if (existsSync(axePad)) {
      await page.setViewportSize({ width: 1280, height: 900 });
      // Via DevTools (zoals de console), niet als <script>: de CSP van de site (script-src 'self') blijft ongewijzigd.
      const axeRun = async () => { await page.evaluate(readFileSync(axePad, 'utf8')); return page.evaluate(async () => (await (window as any).axe.run({ include: [['[data-apps-pagina]']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })).violations.map((x: any) => `${x.id}: ${x.nodes.slice(0, 3).map((n: any) => n.target.join(' ')).join(' | ')}`)); };
      const vLicht = await axeRun();
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.evaluate(() => { document.documentElement.classList.remove('theme-light'); document.documentElement.classList.add('theme-dark'); document.documentElement.style.colorScheme = 'dark'; });
      const vDonker = await axeRun();
      await page.screenshot({ path: `${UIT}/apps-06-donker.png`, fullPage: true });
      check('axe (WCAG 2.2 A/AA) op mcp.*/apps: licht en donker zonder problemen', vLicht.length === 0 && vDonker.length === 0, [...vLicht, ...vDonker].join(' ;; '));
    }
    check('geen consolefouten of mislukte verzoeken', fouten.length === 0, fouten.slice(0, 5).join(' | '));
  } finally {
    agentProc?.kill();
    try { const st = JSON.parse(readFileSync(join(werk, 'staat.json'), 'utf8')); for (const c of Object.values<any>(st.containers)) if (c.pid) { try { process.kill(c.pid); } catch { /* weg */ } } } catch { /* geen staat */ }
    await browser.close();
    await stop();
    if (uid) await sys.query('DELETE FROM app.agents WHERE user_id = $1', [uid]).catch(() => undefined);
    rmSync(werk, { recursive: true, force: true });
  }
  return einde();
}
