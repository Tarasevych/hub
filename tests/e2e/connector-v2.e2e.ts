// E2E connector v2 (15.10.2026) in een echte Chrome: Claude meldt zich aan op https://mcp.tarasevych.com/ai/claude → venster in
// stappen op /agents (bevestigen → account → ruimte → rechten met zoeken, groepsmodus, uitklappen met adres) → «Дозволити» →
// terug naar claude.ai met een code → token → /ai/claude via de echte padsplitsing van server/start.ts: 401 zonder token, tools/list
// met v2-namen, token weigert op /ai/grok. Daarna het tabblad «Конектори»: inperken geldt meteen, herverbinden trekt in.
// Telefoon 390 px zonder horizontaal scrollen; geen consolefouten. Schermafdrukken in E2E_SCREENSHOTS.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import https from 'node:https';
import { createHash, randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import * as c from '../../backend/mcp-connector';
import { startE2eServer, chromeArgs } from './server';
import { techAan } from './hulp/tech';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

/** HTTPS naar de lokale testserver met Host mcp.tarasevych.com (zoals de tunnel), om de padsplitsing echt te raken. */
function viaFront(pad: string, token: string | null, msg: unknown): Promise<{ status: number; body: any; www: string }> {
  return new Promise((ok, nee) => {
    const data = JSON.stringify(msg);
    const r = https.request({ host: '127.0.0.1', port: POORT, path: pad, method: 'POST', servername: 'mcp.tarasevych.com', rejectUnauthorized: false,
      headers: { host: 'mcp.tarasevych.com', 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), ...(token ? { authorization: `Bearer ${token}` } : {}) } }, (res) => {
      let b = ''; res.on('data', (x) => { b += x; }); res.on('end', () => { let j: any = null; try { j = JSON.parse(b); } catch { j = b; } ok({ status: res.statusCode || 0, body: j, www: String(res.headers['www-authenticate'] || '') }); });
    });
    r.on('error', nee); r.end(data);
  });
}

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e connector-v2');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-v2-${T}@example.test`, sub = `sub-e2e-v2-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const clients: string[] = [];
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
    // claude.ai bestaat niet in de test: de terugkeer naar Claude vangen we op en lezen de code.
    let terug = '';
    await ctx.route('https://claude.ai/**', (route) => { terug = route.request().url(); return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Claude</title><p>terug bij Claude</p>' }); });
    const page = await ctx.newPage();
    const fouten: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { if (q.status() >= 400 && !/\/api\/owner\/agents\/activity$|\/downloads\/extension-version\.json$/.test(q.url())) fouten.push(`http ${q.status()} ${q.url()}`); });

    // ---------------------------------------------------------------- 1. Claude begint de koppeling op /ai/claude
    const zonder = await viaFront('/ai/claude', null, { jsonrpc: '2.0', id: 1, method: 'initialize' });
    check('/ai/claude zonder token: 401 met resource_metadata van /ai/claude (padsplitsing van de app)', zonder.status === 401 && zonder.www.includes('/ai/claude/.well-known/oauth-protected-resource'), `${zonder.status} ${zonder.www}`);
    const reg = JSON.parse((await c.registerClient(JSON.stringify({ client_name: 'Claude', redirect_uris: [CALLBACK] }))).body);
    clients.push(reg.client_id);
    const verifier = randomBytes(32).toString('base64url');
    const a = await c.authorize({ response_type: 'code', client_id: reg.client_id, redirect_uri: CALLBACK, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'e2e', resource: `${MCP}/ai/claude` });
    const consentUrl = String(Object.entries(a.headers).find(([k]) => k.toLowerCase() === 'location')?.[1] || '');
    check('autorisatie stuurt naar het venster op /agents', consentUrl.startsWith(`${MCP}/agents?consent=`), consentUrl);

    // technisch profiel aan, zodat de eigenaar ook technische toegang kan kiezen
    check('technisch profiel aan', (await techAan(page, { url: MCP, tab, service: 'mcp', reden: 'E2E connector v2' })) === 200);
    await page.goto(consentUrl, { waitUntil: 'domcontentloaded' });
    const w = page.locator('[data-v2-wizard="claude"]');
    await w.waitFor({ timeout: 20000 });
    check('stap 1: bevestigen, met agent en connectoradres', (await w.getAttribute('data-v2-stap')) === 'bevestigen' && (await w.innerText()).includes(`${MCP}/ai/claude`));
    await page.screenshot({ path: `${UIT}/v2-1-bevestigen.png` });
    await w.getByRole('button', { name: 'Далі' }).click();
    check('stap 2: account (eigen e-mail)', (await w.getAttribute('data-v2-stap')) === 'account' && (await w.innerText()).includes(eigenaar));
    await page.screenshot({ path: `${UIT}/v2-2-account.png` });
    await w.getByRole('button', { name: 'Далі' }).click();
    check('stap 3: ruimte (alleen de eigenaar)', (await w.getAttribute('data-v2-stap')) === 'ruimte');
    await w.locator('.v2-ruimte-kaart.kant-beheer input').check();
    await page.screenshot({ path: `${UIT}/v2-3-ruimte.png` });
    await w.getByRole('button', { name: 'Далі' }).click();
    check('stap 4: rechten met twee kanten', (await w.getAttribute('data-v2-stap')) === 'rechten' && await w.locator('[data-v2-kant="beheer"]').count() === 1 && await w.locator('[data-v2-kant="gebruiker"]').count() === 1);
    const aanVoor = await w.locator('[data-v2-kant="gebruiker"] .v2-optie.is-aan').count();
    check('standaard: alleen veilige lezende rechten aan, geen mail', aanVoor > 3 && await w.locator('[data-v2-optie="mail_read_message:gebruiker"].is-aan').count() === 0);
    // groep Bord: lezen + schrijven
    await w.locator('[data-v2-kant="gebruiker"] [data-v2-groep="bord"] .v2-modus-knop.modus-lezen-schrijven').click();
    check('groepsmodus: bord lezen+schrijven zet «taak maken» aan, «verwijderen» niet',
      await w.locator('[data-v2-optie="create_task:gebruiker"].is-aan').count() === 1 && await w.locator('[data-v2-optie="delete_board_item:gebruiker"].is-aan').count() === 0);
    // beheer: live release aan
    await w.locator('[data-v2-optie="get_live_release:beheer"] [role="switch"]').click();
    // zoeken + uitklappen toont het adres van het hulpmiddel
    await w.locator('input[type="search"]').fill('лист повністю');
    await w.locator('[data-v2-optie="mail_read_message:gebruiker"] .v2-optie-naam').click();
    const adres = await w.locator('[data-v2-optie="mail_read_message:gebruiker"] .v2-adres').innerText();
    check('uitklappen: adres van het hulpmiddel en echte uitleg (wat, gevolg, let op) en schets',
      adres.includes('lezen_bericht_claude_mail_gmail_tarasevych_com_gebruiker') && await w.locator('[data-v2-optie="mail_read_message:gebruiker"] .v2-uitleg-let').count() === 1
      && await w.locator('[data-v2-optie="mail_read_message:gebruiker"] svg.v2-schets').count() === 1, adres);
    await page.screenshot({ path: `${UIT}/v2-4-rechten-zoeken.png` });
    await w.locator('input[type="search"]').fill('');
    check('«в розробці» zichtbaar en niet aan te zetten', await w.locator('[data-v2-optie="dev.icloud_events:gebruiker"] [role="switch"][disabled]').count() === 1);
    await page.screenshot({ path: `${UIT}/v2-5-rechten.png`, fullPage: false });
    await w.locator('[data-v2-toestaan]').click();
    for (let i = 0; i < 100 && !terug; i++) await page.waitForTimeout(100);
    const code = terug ? new URL(terug).searchParams.get('code') || '' : '';
    check('«Дозволити» → terug naar claude.ai met een code en de state', !!code && new URL(terug).searchParams.get('state') === 'e2e', terug);

    // ---------------------------------------------------------------- 2. token en de echte paden
    const tok = JSON.parse((await c.token(new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: reg.client_id, redirect_uri: CALLBACK }).toString())).body);
    const lijst = await viaFront('/ai/claude', tok.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const namen: string[] = (lijst.body?.result?.tools ?? []).map((t: { name: string }) => t.name);
    check('tools/list via /ai/claude: v2-namen, met bord schrijven en live release (beheer), zonder mail',
      lijst.status === 200 && namen.includes('creeren_nieuwe_taak_claude_hub_tarasevych_com_gebruiker') && namen.includes('tonen_live_release_claude_admin_tarasevych_com_beheer')
      && !namen.some((n) => n.startsWith('lezen_bericht_')) && namen.every((n) => /_claude_.*_tarasevych_com_(gebruiker|beheer)$/.test(n)), namen.join(','));
    check('zelfde token op /ai/grok → 401', (await viaFront('/ai/grok', tok.access_token, { jsonrpc: '2.0', id: 3, method: 'tools/list' })).status === 401);
    const rechten = (await sys.query('SELECT kanten, sleutels FROM app.connector_v2_rechten WHERE user_id = $1', [uid])).rows[0];
    check('rechten opgeslagen bij de koppeling (beide kanten)', rechten?.kanten?.join() === 'beheer,gebruiker' && rechten.sleutels.includes('create_task:gebruiker'), JSON.stringify(rechten));

    // ---------------------------------------------------------------- 3. tabblad «Конектори»: inperken en herverbinden
    await page.goto(`${MCP}/agents#connectors`, { waitUntil: 'domcontentloaded' });
    const kaart = page.locator('[data-v2-agent="claude"]');
    await kaart.waitFor({ timeout: 20000 }).catch(async (e) => { await page.screenshot({ path: `${UIT}/v2-debug.png` }); console.log('URL', page.url(), (await page.locator('body').innerText()).slice(0, 800)); throw e; });
    check('kaart van Claude: adres en «підключено: 1»', (await kaart.innerText()).includes(`${MCP}/ai/claude`) && /підключено: 1/.test(await kaart.innerText()));
    await kaart.getByRole('button', { name: 'Дозволи' }).click();
    await kaart.locator('[data-v2-optie="create_task:gebruiker"] [role="switch"]').click();
    await kaart.locator(`[data-v2-bewaar="claude"]`).click();
    await kaart.locator('.v2-melding').waitFor({ timeout: 10000 });
    const naInperken = await viaFront('/ai/claude', tok.access_token, { jsonrpc: '2.0', id: 4, method: 'tools/list' });
    check('inperken op de beheerpagina geldt meteen (taak maken weg)', !(naInperken.body?.result?.tools ?? []).some((t: { name: string }) => t.name.startsWith('creeren_nieuwe_taak')));
    await page.screenshot({ path: `${UIT}/v2-6-connectors.png`, fullPage: true });
    await kaart.getByRole('button', { name: 'Перепідключити' }).click();
    await page.waitForTimeout(800);
    check('herverbinden trekt de koppeling in (401)', (await viaFront('/ai/claude', tok.access_token, { jsonrpc: '2.0', id: 5, method: 'tools/list' })).status === 401);

    // ---------------------------------------------------------------- 4. telefoon
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${MCP}/agents#connectors`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-v2-agent="claude"]').waitFor({ timeout: 20000 });
    await page.locator('[data-v2-agent="claude"]').getByRole('button', { name: 'Дозволи' }).click();
    const breed = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('telefoon 390 px: geen horizontaal scrollen', breed <= 1, String(breed));
    const rechts = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.v2-tab *')].map((e) => e.getBoundingClientRect().right)) - window.innerWidth);
    check('telefoon 390 px: kaarten, kanten en groepen binnen het scherm (niets afgesneden)', rechts <= 1, String(rechts));
    await page.screenshot({ path: `${UIT}/v2-7-telefoon.png`, fullPage: false });
    check('geen consolefouten of onverwachte HTTP-fouten', fouten.length === 0, fouten.join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await browser.close().catch(() => undefined);
    if (clients.length) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [clients]).catch(() => undefined);
    if (uid) await sys.query('DELETE FROM app.connector_v2_voorkeur WHERE user_id = $1', [uid]).catch(() => undefined);
    await stop();
  }
  return einde();
}
