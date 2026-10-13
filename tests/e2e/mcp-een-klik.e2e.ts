// E2E «Підключити ШІ» op mcp.*/agents#tokens met een echte Chrome, de echte MCP-deur (deploy/mcp/server.mjs als apart proces)
// en een padsplitsing zoals de tunnel (cloudflared-config.yml): /grok|/claude|…|/oauth|/health|/.well-known → deur, de rest → app.
// Toetst: de twee wegen, «в один клік» naar de deur (popup → venster «Дозволити» van de site → token in de pagina, met de gekozen
// duur en aan de deur gebonden), de lijst «Доступи через двері» + intrekken, «вручну» (tvh_ werkt op de deur), de connector /mcp
// met dezelfde knop (Cursor), telefoonbreedte zonder horizontaal scrollen en geen consolefouten.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { checker, nepGoogle } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const DEUR_PAD = /^\/((?:grok|claude|chatgpt|gemini|copilot)|oauth|health|\.well-known)(\/|$)/i;
const APP_WELLKNOWN = /^\/\.well-known\/(oauth-protected-resource\/mcp|oauth-authorization-server\/oauth2)$/;

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e mcp-een-klik');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-1k-${T}@example.test`, sub = `sub-e2e-1k-${T}`;
  mkdirSync(UIT, { recursive: true });

  // ---- de deur (eigen proces) met een eigen toestand
  const d = mkdtempSync(join(tmpdir(), 'e2e-deur-'));
  const site = join(d, 'site'); mkdirSync(site); writeFileSync(join(site, 'leesmij.txt'), 'hallo');
  mkdirSync(join(d, 'state'));
  const sleutel = join(d, 'state', 'intern.sleutel');
  writeFileSync(join(d, 'rechten.json'), '{"read": true, "uitrol": false, "tokens": true}');
  writeFileSync(join(d, 'mcp.token'), randomBytes(24).toString('hex'));
  const deurPoort = 21000 + Math.floor(Math.random() * 9000);

  // ---- de app (zoals startE2eServer) + een http-poort voor de deur (token-check), en de padsplitsing van de tunnel
  process.env.DIST_DIR = resolve(process.env.E2E_DIST || 'dist');
  process.env.E2E_LOKALE_LIMIETEN = '1';
  process.env.MCP_INTERN_SLEUTEL = sleutel;
  process.env.MCP_DEUR_URL = `http://127.0.0.1:${deurPoort}`;
  process.env.MCP_RECHTEN_PAD = join(d, 'rechten.json');
  const echteFetch = globalThis.fetch;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  // nepGoogle blokkeert elke fetch buiten Google (599); loopback (app ↔ deur, zoals op de server) mag wel.
  const nepFetch = globalThis.fetch;
  globalThis.fetch = ((input: unknown, init?: RequestInit) => (String(input instanceof URL ? input.href : input).startsWith('http://127.0.0.1:') ? echteFetch(input as never, init) : nepFetch(input as never, init))) as typeof fetch;
  const { createServer } = await import('../../server/start');
  const app = createServer();
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', () => r()));
  const appPoort = (app.address() as { port: number }).port;
  const front = https.createServer({ key: readFileSync(`${TLS}/srv.key`), cert: readFileSync(`${TLS}/srv.crt`) }, (req, res) => {
    const pad = (req.url || '/').split('?')[0];
    const host = String(req.headers.host || '').split(':')[0];
    if (host === 'mcp.tarasevych.com' && DEUR_PAD.test(pad) && !APP_WELLKNOWN.test(pad)) {
      // zoals cloudflared: cf-connecting-ip en x-forwarded-for erbij (de deur weigert /intern/* dan altijd)
      const p = http.request({ host: '127.0.0.1', port: deurPoort, path: req.url, method: req.method, headers: { ...req.headers, 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '203.0.113.7' } }, (r2) => { res.writeHead(r2.statusCode || 502, r2.headers); r2.pipe(res); });
      p.on('error', () => { res.writeHead(502); res.end('deur weg'); });
      req.pipe(p);
      return;
    }
    app.emit('request', req, res);
  });
  await new Promise<void>((r) => front.listen(POORT, '127.0.0.1', () => r()));
  const deur = spawn(process.execPath, ['deploy/mcp/server.mjs'], {
    env: { ...process.env, MCP_PORT: String(deurPoort), MCP_ROOT: site, MCP_TOKEN_FILE: join(d, 'mcp.token'), MCP_RECHTEN_FILE: join(d, 'rechten.json'), MCP_INTREKKEN_FILE: join(d, 'intrekken'),
      MCP_STATE_FILE: join(d, 'state', 'sessions.json'), MCP_INTERN_SLEUTEL: sleutel, MCP_UITROL_INBOX: join(d, 'inbox'), MCP_UITROL_STATUS: join(d, 'status.json'), MCP_RELEASES_DIR: d,
      MCP_HEALTH_URL: 'http://127.0.0.1:1/x', MCP_ISSUER: MCP, MCP_APP_URL: `http://127.0.0.1:${appPoort}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let deurLog = ''; deur.stdout.on('data', (b) => { deurLog += b; }); deur.stderr.on('data', (b) => { deurLog += b; });
  for (let i = 0; i < 50 && !deurLog.includes('mijn-ruimte-mcp'); i++) await new Promise((r) => setTimeout(r, 100));
  if (process.env.E2E_DEUR_LOG) { const k = readFileSync(sleutel, 'utf8').trim(); const t = await fetch(`http://127.0.0.1:${deurPoort}/intern/verbindingen`, { headers: { 'x-mijn-ruimte-intern': k } }).then(async (x) => `${x.status} ${await x.text()}`).catch((e) => String(e)); console.log('DEURTEST:', t); }

  const pool = getPool(), sys = getPool('systeem');
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  let uid = '';
  const rpcDeur = async (pad: string, token: string, method = 'tools/list') => {
    const r = await fetch(`http://127.0.0.1:${deurPoort}${pad}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }) });
    return r.status;
  };
  try {
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
    const volg = (p: import('playwright-core').Page, wie: string) => {
      p.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`${wie} console: ${m.text()}`); });
      p.on('pageerror', (e) => fouten.push(`${wie} pageerror: ${e.message}`));
      p.on('response', (q) => { if (q.status() >= 400 && !/\/api\/owner\/agents\/activity$|\/downloads\/extension-version\.json$/.test(q.url())) fouten.push(`${wie} http ${q.status()} ${q.url()}`); });
    };
    volg(page, 'pagina');

    // ---------------------------------------------------------------- 1. de twee wegen
    await page.goto(`${MCP}/agents#tokens`, { waitUntil: 'networkidle' });
    const paneel = page.locator('[data-ai-verbinden]');
    await paneel.waitFor({ timeout: 20000 });
    await page.locator('[data-segment="deur"]').waitFor({ timeout: 10000 }).catch(() => undefined);
    const knoppen = await page.locator('[data-methode]').allInnerTexts();
    check('twee knoppen: «Підключити автоматично (в один клік)» en «Підключити вручну (прямий токен)»', /автоматично \(в один клік\)/.test(knoppen[0] || '') && /вручну \(прямий токен\)/.test(knoppen[1] || ''), knoppen.join(' | '));
    check('Grok (eigenaar) begint bij de deur /Grok', await page.locator('[data-segment="deur"]').getAttribute('aria-checked') === 'true');
    await page.locator('[data-duur-keuze="grok"]').selectOption('8u');
    await page.locator('[data-ag-melding="ok"]').first().waitFor({ timeout: 8000 }).catch(() => undefined);
    const duur = (await sys.query('SELECT verbinding_duur FROM app.user_ai_settings WHERE user_id = $1', [uid])).rows[0]?.verbinding_duur;
    check('termijn per AI opgeslagen (grok → 8u)', duur?.grok === '8u', JSON.stringify(duur));
    await page.locator('[data-methode="auto"]').click();
    const adres = await page.locator('[data-adres]').innerText();
    check('automatisch: adres voor Grok is https://mcp.tarasevych.com/Grok', adres.trim() === `${MCP}/Grok`, adres);
    await page.screenshot({ path: `${UIT}/een-klik-01-auto.png`, fullPage: true });

    // ---------------------------------------------------------------- 2. één klik naar de deur: popup → «Дозволити» → token
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('[data-knop="een-klik"]').click()]);
    volg(popup, 'popup');
    const modal = popup.locator('[data-mcp-consent-modal]');
    await modal.waitFor({ timeout: 20000 });
    await popup.locator('[data-consent-duur]').waitFor({ timeout: 10000 }).catch(async () => { console.log('VENSTER:', await modal.innerText().catch(() => '?')); await popup.screenshot({ path: `${UIT}/een-klik-fout-venster.png` }); });
    const titel = await popup.locator('#mcp-consent-title').innerText();
    check('venster «Дозволити» van de site voor de deur /Grok', /дверей сервера \/Grok/.test(titel) && /Grok/.test(titel), titel);
    check('venster toont de standaardtermijn van Grok (8u)', await popup.locator('[data-consent-duur]').inputValue() === '8u');
    check('venster biedt de weg met het deurtoken', await popup.locator('[data-consent-handmatig]').count() === 1);
    await popup.screenshot({ path: `${UIT}/een-klik-02-venster.png` });
    await popup.locator('.mcp-consent-primary').click();
    const vers = page.locator('[data-vers-token]');
    await vers.waitFor({ timeout: 30000 }).catch(() => undefined);
    const token = (await page.locator('[data-vers-token] [data-token]').innerText().catch(() => '')).trim();
    check('token verschijnt in de pagina na «Дозволити» (popup gesloten)', token.length > 30 && popup.isClosed(), `${token.slice(0, 8)} gesloten=${popup.isClosed()}`);
    check('token werkt op /Grok', await rpcDeur('/Grok', token) === 200);
    check('token is aan /Grok gebonden (niet op /claude)', await rpcDeur('/claude', token) === 401);
    const geldig = await page.locator('[data-vers-token] .hub-meta').first().innerText();
    check('pagina toont tot wanneer het geldt (8 uur)', /Діє до/.test(geldig), geldig);
    await page.screenshot({ path: `${UIT}/een-klik-03-token.png`, fullPage: true });

    // ---------------------------------------------------------------- 3. lijst «Доступи через двері» en intrekken
    await page.getByRole('button', { name: 'Я зберіг токен' }).click();
    const rij = page.locator('[data-lijst="deur-verbindingen"] [data-deurverbinding]').first();
    await rij.waitFor({ timeout: 10000 }).catch(() => undefined);
    const rijTekst = await rij.innerText().catch(() => '');
    check('lijst «Доступи через двері»: Grok, /Grok, 8 годин', /Grok/.test(rijTekst) && /\/Grok/.test(rijTekst) && /8 годин/.test(rijTekst), rijTekst);
    await rij.locator('.ag-rij-toggle').click();
    const tech = await rij.locator('.ag-rij-details').innerText().catch(() => '');
    check('details: wie toestond (e-mail van de eigenaar)', tech.includes(eigenaar), tech.slice(0, 300));
    const famId = await rij.getAttribute('data-deurverbinding');
    await page.locator(`[data-knop="deur:${famId}"]`).click();
    await page.locator(`[data-knop="deur:${famId}:ja"]`).click();
    await page.locator('[data-ag-melding="ok"]', { hasText: 'відкликано' }).waitFor({ timeout: 10000 }).catch(() => undefined);
    check('intrekken op de site → token werkt niet meer', await rpcDeur('/Grok', token) === 401);
    const journaal = (await sys.query("SELECT action, details FROM app.audit WHERE owner_id = $1 AND action LIKE 'owner.mcp.deur.%' ORDER BY created_at", [uid]).catch(() => ({ rows: [] as any[] }))).rows;
    check('journaal: toegestaan (met deur, klant, duur) en ingetrokken', journaal.some((j: any) => j.action === 'owner.mcp.deur.approved' && j.details?.duur === '8u' && j.details?.deur === 'Grok') && journaal.some((j: any) => j.action === 'owner.mcp.deur.revoked'), JSON.stringify(journaal).slice(0, 300));

    // ---------------------------------------------------------------- 4. vручну: tvh_ op de deur
    await page.locator('[data-methode="handmatig"]').click();
    await page.locator('[data-paneel="handmatig"] [data-knop="token-nieuw"]').click();
    await page.locator('[data-vers-token]').waitFor({ timeout: 20000 }).catch(() => undefined);
    const tvh = (await page.locator('[data-vers-token] [data-token]').innerText().catch(() => '')).trim();
    check('вручну: tvh_-token van 30 dagen in de pagina', /^tvh_/.test(tvh), tvh.slice(0, 6));
    check('вручну: tvh_ van de eigenaar werkt als Bearer op /Grok (bevestigd door de site)', await rpcDeur('/Grok', tvh) === 200);
    const conf = (await page.locator('.ag-verbind-snippet pre').first().textContent().catch(() => '')) || '';
    check('вручну: kant-en-klare configuratie met Authorization: Bearer', conf.includes('"Authorization": "Bearer tvh_') && conf.includes(`${MCP}/Grok`));
    await page.locator('.ag-verbind-snippet summary').first().click();
    await page.screenshot({ path: `${UIT}/een-klik-04-handmatig.png`, fullPage: true });

    // ---------------------------------------------------------------- 5. Cursor via de connector /mcp met dezelfde knop
    await page.locator('[data-klant="cursor"]').click();
    await page.locator('[data-methode="auto"]').click();
    check('Cursor → connector https://mcp.tarasevych.com/mcp', (await page.locator('[data-adres]').innerText()).trim() === `${MCP}/mcp`);
    const [popup2] = await Promise.all([page.waitForEvent('popup'), page.locator('[data-knop="een-klik"]').click()]);
    volg(popup2, 'popup2');
    await popup2.locator('[data-mcp-consent-modal] [data-consent-duur]').waitFor({ timeout: 20000 });
    const titel2 = await popup2.locator('#mcp-consent-title').innerText();
    check('connector-venster: «просить доступ до ваших пристроїв»', /пристроїв/.test(titel2), titel2);
    await popup2.locator('[data-consent-duur]').selectOption('1d');
    await popup2.locator('.mcp-consent-primary').click();
    await page.locator('[data-vers-token] [data-token]', { hasText: 'mcpa_' }).waitFor({ timeout: 30000 }).catch(() => undefined);
    const mcpa = (await page.locator('[data-vers-token] [data-token]').innerText().catch(() => '')).trim();
    if (!mcpa.startsWith('mcpa_')) { console.log('PANEEL:', (await page.locator('[data-ai-verbinden]').innerText().catch(() => '?')).slice(-600)); await page.screenshot({ path: `${UIT}/een-klik-fout-connector.png`, fullPage: true }); }
    const { rpcPost } = await import('../../backend/mcp-connector');
    const res = await rpcPost(`Bearer ${mcpa}`, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
    const rijDb = (await sys.query("SELECT duur, client_name FROM app.mcp_oauth_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [uid])).rows[0];
    check('connector: mcpa-token werkt, duur 1d en klant Cursor', /^mcpa_/.test(mcpa) && res.statusCode === 200 && rijDb?.duur === '1d' && /Cursor/.test(rijDb?.client_name || ''), `${mcpa.slice(0, 6)} ${res.statusCode} ${JSON.stringify(rijDb)}`);

    // ---------------------------------------------------------------- 6. telefoonbreedte
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-klant="grok"]').click();
    await page.locator('[data-methode="auto"]').click();
    const breed = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('telefoon (390 px): geen horizontaal scrollen', breed <= 1, String(breed));
    await page.screenshot({ path: `${UIT}/een-klik-05-telefoon.png`, fullPage: true });

    check('geen consolefouten of onverwachte HTTP-fouten', fouten.length === 0, fouten.slice(0, 6).join(' | '));
    await ctx.close();
  } finally {
    await browser.close().catch(() => undefined);
    if (process.env.E2E_DEUR_LOG) console.log('DEURLOG:', deurLog.slice(-1500));
    deur.kill('SIGTERM');
    await new Promise<void>((r) => { front.closeAllConnections?.(); front.close(() => r()); });
    await new Promise<void>((r) => { app.closeAllConnections?.(); app.close(() => r()); });
    if (uid) {
      await sys.query('DELETE FROM app.mcp_console_tokens WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.mcp_oauth_tokens WHERE user_id = $1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.user_ai_settings WHERE user_id = $1', [uid]).catch(() => undefined);
    }
    rmSync(d, { recursive: true, force: true });
  }
  return einde();
}
