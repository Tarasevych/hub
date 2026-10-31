// Regressie- en integratiesuite MCP-001 (31.10.2026):
// Externe AI-klanten (bv. Cursor Cloud op cursor.com) die verbinden met /cursor of /mcp
// mogen na OAuth / mcp_auth NOOIT op een lege catalogus (alleen host-side «mcp_auth») blijven hangen,
// moeten GitHub-hulpmiddelen ook bij een GitHub OAuth- of GitHub App-koppeling (0086, zonder oude PAT)
// in tools/list zien, moeten UI-schakelaars erven bij nieuwe en herhaalde sessies, moeten 202/204 zonder
// foutieve application/json Content-Type krijgen, en mogen geen .exe-shims in %TEMP% genereren
// (Windows Smart App Control).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { checker } from './hulp/nep-google';
import { closePool, getPool } from '../../server/platform/pg';
import { klantVan, redirectSoort } from '../../shared/ai-verbinding';
import { agentUrl, redirectPastBijAgent } from '../../shared/connector-v2/agenten';
import { agentVoor } from '../../backend/ai-beleid';
import { bordOnderwerp, leesToegang, onderwerpVanGrantId, zetToegang } from '../../backend/ai-toegang';
import { koppelingBewaren, koppelingWissen, verzegel } from '../../backend/github-koppeling-opslag';
import { sha256 } from '../../backend/connectors-crypto';
import * as c from '../../backend/mcp-connector';
import * as st from '../../backend/mcp-connector-opslag';
import * as v2 from '../../backend/connector-v2';

const json = (r: { body: string }) => (r.body ? JSON.parse(r.body) : null);
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};
const kopVan = (r: { headers: Record<string, string> }, n: string) =>
  Object.entries(r.headers).find(([k]) => k.toLowerCase() === n)?.[1] ?? '';
const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Antw = { status: number; body: string; kop: (n: string) => string };
function verzoek(poort: number, methode: string, pad: string, body = '', headers: Record<string, string> = {}): Promise<Antw> {
  return new Promise((ok, fout) => {
    const r = http.request({
      host: '127.0.0.1',
      port: poort,
      method: methode,
      path: pad,
      headers: {
        host: 'mcp.tarasevych.com',
        'content-type': 'application/json',
        'cf-connecting-ip': `198.19.${Math.floor(Math.random() * 200)}.42`,
        'content-length': Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (ch) => { data += ch; });
      res.on('end', () => ok({
        status: res.statusCode || 0,
        body: data,
        kop: (n: string) => String(res.headers[n.toLowerCase()] ?? ''),
      }));
    });
    r.on('error', fout);
    r.end(body);
  });
}

function openSse(poort: number, pad: string, token: string): Promise<{ status: number; contentType: string; berichten: string[]; sluit: () => void }> {
  return new Promise((ok, fout) => {
    const berichten: string[] = [];
    const req = http.request({
      host: '127.0.0.1',
      port: poort,
      method: 'GET',
      path: pad,
      headers: {
        host: 'mcp.tarasevych.com',
        accept: 'text/event-stream',
        authorization: `Bearer ${token}`,
        'cf-connecting-ip': `198.19.${Math.floor(Math.random() * 200)}.43`,
      },
    }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { berichten.push(chunk); });
      ok({
        status: res.statusCode || 0,
        contentType: String(res.headers['content-type'] ?? ''),
        berichten,
        sluit: () => { try { req.destroy(); } catch { /* al dicht */ } },
      });
    });
    req.on('error', fout);
    req.end();
  });
}

function scanBronBestanden(mappen: string[]): string[] {
  const tekstExt = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.ps1', '.cmd', '.bat', '.sh']);
  const uit: string[] = [];
  const loop = (map: string) => {
    let entries: string[];
    try { entries = readdirSync(map); } catch { return; }
    for (const naam of entries) {
      if (naam === 'node_modules' || naam === '.git' || naam === 'dist' || naam === 'dist-server' || naam === 'rapporten') continue;
      const vol = join(map, naam);
      let s;
      try { s = statSync(vol); } catch { continue; }
      if (s.isDirectory()) loop(vol);
      else if (tekstExt.has(extname(naam).toLowerCase())) uit.push(vol);
    }
  };
  for (const m of mappen) loop(m);
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('mcp-hulpmiddelen-catalogus-20261031');

  // ============================================================== 1. Puur: Cursor Cloud redirect_uris, klantVan & AI-beleid aliassen
  check('cursor.com en claude.com zijn erkende web-OAuth-callbacks (inclusief subdomeinen zoals cloud.cursor.com)',
    redirectSoort('https://cursor.com/api/mcp/oauth/callback') === 'web'
    && redirectSoort('https://cloud.cursor.com/oauth/callback') === 'web'
    && redirectSoort('https://claude.com/api/mcp/auth_callback') === 'web');

  check('redirectPastBijAgent("cursor") accepteert zowel cursor:// als https://cursor.com/... en weigert claude.ai',
    redirectPastBijAgent('cursor', 'cursor://anysphere.cursor-mcp/oauth/callback') === true
    && redirectPastBijAgent('cursor', 'https://cursor.com/api/mcp/oauth/callback') === true
    && redirectPastBijAgent('cursor', 'https://cloud.cursor.com/oauth/callback') === true
    && redirectPastBijAgent('cursor', 'https://claude.ai/api/mcp/auth_callback') === false);

  check('klantVan herkent Cursor, Anysphere en cursor-mcp zonder terugval naar overig/claude',
    klantVan('Cursor') === 'cursor'
    && klantVan('Anysphere Cursor MCP') === 'cursor'
    && klantVan('cursor.com') === 'cursor');

  {
    const nepBeleid = {
      agents: {
        chatgpt: { name: 'ChatGPT' },
        cursor: { name: 'Cursor' },
        claude: { name: 'Claude' },
      },
    } as never;
    check('AI-beleid agentVoor: /gpt matcht "chatgpt", /cursor matcht "cursor", en SEC-001-09 blokkeert spoofing van client="Claude" op /gemini',
      agentVoor(nepBeleid, 'OpenAI', 'gpt') === 'chatgpt'
      && agentVoor(nepBeleid, 'Anysphere', 'cursor') === 'cursor'
      && agentVoor(nepBeleid, 'Claude', 'gemini') === null);
  }

  // ============================================================== 2. Windows Smart App Control statische bewaker (geen .exe-shims in %TEMP%)
  {
    const bronnen = scanBronBestanden(['scripts', 'tests', 'backend', 'server', 'deploy']);
    const overtredingen: string[] = [];
    const addTypeExe = new RegExp('Add-Type[\\s\\S]{0,240}-OutputAssembly[\\s\\S]{0,120}\\.exe', 'i');
    const copyExeTmp = new RegExp('Copy-Item[\\s\\S]{0,160}\\.exe[\\s\\S]{0,160}(TEMP|TMP|tmpdir)', 'i');
    for (const pad of bronnen) {
      if (pad.endsWith('mcp-hulpmiddelen-catalogus-20261031.test.ts')) continue;
      const inhoud = readFileSync(pad, 'utf8');
      if (addTypeExe.test(inhoud) || copyExeTmp.test(inhoud)) overtredingen.push(pad);
    }
    check('Windows Smart App Control guard: geen enkel script of test compileert of kopieert tijdelijke .exe-shims naar TEMP',
      overtredingen.length === 0, overtredingen.join(', '));
  }

  // ============================================================== 3. Deur (deploy/mcp/server.mjs): wortel /.well-known/oauth-protected-resource gaat naar de app
  {
    const d = await mkdtemp(join(tmpdir(), 'mr-mcp001-deur-'));
    const site = join(d, 'site');
    await mkdir(site, { recursive: true });
    await writeFile(join(site, 'UITROL-VERSIE'), '20261031-093842\n');
    writeFileSync(join(d, 'rechten.json'), JSON.stringify({ read: true, uitrol: false }));
    writeFileSync(join(d, 'mcp.token'), `${'a'.repeat(40)}\n`);
    const gezien: string[] = [];
    const nepApp = http.createServer((req, res) => {
      gezien.push(`${req.method} ${req.url}`);
      res.writeHead(418, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ doorgestuurd: true, url: req.url }));
    });
    await new Promise<void>((r) => nepApp.listen(0, '127.0.0.1', () => r()));
    const appPoort = (nepApp.address() as { port: number }).port;
    const deurPoort = 22000 + Math.floor(Math.random() * 15000);
    const proc = spawn(process.execPath, ['deploy/mcp/server.mjs'], {
      env: {
        ...process.env,
        MCP_PORT: String(deurPoort),
        MCP_ROOT: site,
        MCP_TOKEN_FILE: join(d, 'mcp.token'),
        MCP_RECHTEN_FILE: join(d, 'rechten.json'),
        MCP_INTREKKEN_FILE: join(d, 'intrekken'),
        MCP_STATE_FILE: join(d, 'state', 'sessions.json'),
        MCP_UITROL_INBOX: join(d, 'inbox'),
        MCP_UITROL_STATUS: join(d, 'status.json'),
        MCP_RELEASES_DIR: d,
        MCP_HEALTH_URL: 'http://127.0.0.1:1/x',
        MCP_ISSUER: 'https://mcp.tarasevych.com',
        MCP_APP_URL: `http://127.0.0.1:${appPoort}`,
        MCP_AGENTPADEN: 'app',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    proc.stdout.on('data', (b) => { log += b; });
    proc.stderr.on('data', (b) => { log += b; });
    try {
      for (let i = 0; i < 60 && !log.includes('mijn-ruimte-mcp'); i++) await slaap(100);
      const wortelPrm = await verzoek(deurPoort, 'GET', '/.well-known/oauth-protected-resource');
      const cursorPrm = await verzoek(deurPoort, 'GET', '/.well-known/oauth-protected-resource/cursor');
      check('deploy/mcp/server.mjs stuurt zowel wortel /.well-known/oauth-protected-resource als /cursor door naar de app (geen lek van oude Grok-deurmetadata)',
        wortelPrm.status === 418 && cursorPrm.status === 418
        && gezien.includes('GET /.well-known/oauth-protected-resource')
        && gezien.includes('GET /.well-known/oauth-protected-resource/cursor'),
        `${wortelPrm.status}/${cursorPrm.status} ${gezien.join(' | ')}`);
    } finally {
      proc.kill('SIGTERM');
      await new Promise((r) => nepApp.close(() => r(undefined)));
      await rm(d, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) {
    console.log('OVERGESLAGEN mcp-hulpmiddelen-catalogus-20261031 (integratie): geen database');
    return einde();
  }

  // ============================================================== 4. Volledige integratie met DB + echte HTTP-server (/cursor én /mcp)
  const vorigeTotpKey = process.env.TOTP_ENCRYPTION_KEY_V1;
  if (!process.env.TOTP_ENCRYPTION_KEY_V1) {
    process.env.TOTP_ENCRYPTION_KEY_V1 = randomBytes(32).toString('hex');
  }
  const sys = getPool('systeem');
  const dist = await mkdtemp(join(tmpdir(), 'mr-mcp001-dist-'));
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>spa</title>');
  const vorigeDist = process.env.DIST_DIR;
  process.env.DIST_DIR = dist;

  const U = `mcp001-${randomUUID()}`;
  const clients: string[] = [];
  let server: http.Server | null = null;
  const openSluiters: Array<() => void> = [];

  try {
    server = (await import('../../server/start')).createServer();
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    const poort = (server.address() as { port: number }).port;

    await sys.query(
      "INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2)",
      [U, { email: `${U}@test.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] }],
    );

    // Bewaar een GitHub OAuth-koppeling (migratie 0086, ZONDER oude PAT in de API-platformkluis!)
    await koppelingBewaren(U, 'oauth', {
      login: 'tarasevych',
      scopes: ['repo', 'read:user'],
      tokenZegel: verzegel('gho_test_oauth_token_mcp001', U, 'oauth'),
      verlooptOp: Date.now() + 3600_000,
    }, 'prive');

    // ---------------- 4a. Wortel RFC 9728 metadata + OPTIONS + GET zonder SSE op de echte server
    const wortelPrm = await verzoek(poort, 'GET', '/.well-known/oauth-protected-resource');
    check('GET /.well-known/oauth-protected-resource op de app geeft RFC 9728 metadata voor /mcp met authorization_servers = /oauth2',
      wortelPrm.status === 200
      && json(wortelPrm)?.resource === 'https://mcp.tarasevych.com/mcp'
      && Array.isArray(json(wortelPrm)?.authorization_servers)
      && json(wortelPrm).authorization_servers.includes('https://mcp.tarasevych.com/oauth2'),
      wortelPrm.body.slice(0, 140));

    const optCursor = await verzoek(poort, 'OPTIONS', '/cursor');
    const optMcp = await verzoek(poort, 'OPTIONS', '/mcp');
    const getMcpZonderSse = await verzoek(poort, 'GET', '/mcp');
    check('OPTIONS /cursor en OPTIONS /mcp antwoorden 204 zonder JSON Content-Type; gewone GET /mcp blijft 405',
      optCursor.status === 204 && !optCursor.kop('content-type').includes('application/json')
      && optMcp.status === 204 && !optMcp.kop('content-type').includes('application/json')
      && getMcpZonderSse.status === 405,
      `${optCursor.status}/${optMcp.status}/${getMcpZonderSse.status}`);

    // ---------------- 4b. /cursor (Connector v2): Cursor Cloud (cursor.com) DCR zonder client_name → OAuth → tools/list → UI-wijziging → mcp_auth → SSE list_changed → tools/list refresh
    const cursorCb = 'https://cursor.com/api/mcp/oauth/callback';
    const regResp = await verzoek(poort, 'POST', '/oauth2/register', JSON.stringify({ redirect_uris: [cursorCb] }));
    const reg = json(regResp);
    if (reg?.client_id) clients.push(reg.client_id);
    check('DCR POST /oauth2/register met cursor.com callback en zonder client_name krijgt client_name="Cursor" (niet "Claude")',
      regResp.status === 201 && reg?.client_name === 'Cursor', JSON.stringify(reg));

    const basisSleutels = [
      'v2_whoami:gebruiker',
      'list_services:gebruiker',
      'github_get:gebruiker',
      'get_github_projects:gebruiker',
      'github_list_repos:gebruiker',
      'machine_list:gebruiker',
      'machine_read_file:gebruiker',
    ];
    const p1 = pkce();
    const auth1 = await c.authorize({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: cursorCb,
      code_challenge: p1.challenge,
      code_challenge_method: 'S256',
      state: 'st1',
      resource: agentUrl('cursor'),
    });
    const rid1 = new URL(kopVan(auth1 as never, 'location')).searchParams.get('consent') || '';
    const dec1 = await c.consentDecide(U, rid1, true, null, 'prive', { kanten: ['gebruiker'], sleutels: basisSleutels });
    const code1 = 'redirect' in dec1 ? new URL(dec1.redirect).searchParams.get('code') || '' : '';
    const tok1 = json(await verzoek(poort, 'POST', '/oauth2/token', form({
      grant_type: 'authorization_code',
      code: code1,
      code_verifier: p1.verifier,
      client_id: reg.client_id,
      redirect_uri: cursorCb,
    }), { 'content-type': 'application/x-www-form-urlencoded' }));
    const cursorToken1 = String(tok1?.access_token || '');
    check('/cursor OAuth met cursor.com redirect levert geldig access_token op', cursorToken1.startsWith('mcpa_'));

    const initCursor = await verzoek(poort, 'POST', '/cursor', JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'cursor-cloud', version: '1.0' } },
    }), { authorization: `Bearer ${cursorToken1}` });
    check('/cursor initialize meldt serverInfo.name="mijn-ruimte-cursor" en capabilities.tools.listChanged=true',
      initCursor.status === 200
      && json(initCursor)?.result?.serverInfo?.name === 'mijn-ruimte-cursor'
      && json(initCursor)?.result?.capabilities?.tools?.listChanged === true);

    const notifCursor = await verzoek(poort, 'POST', '/cursor', JSON.stringify({
      jsonrpc: '2.0', method: 'notifications/initialized',
    }), { authorization: `Bearer ${cursorToken1}` });
    check('/cursor notifications/initialized antwoordt 202 met lege body EN zonder application/json Content-Type (voorkomt "tool list could not be re-read")',
      notifCursor.status === 202 && notifCursor.body === '' && !notifCursor.kop('content-type').includes('application/json'),
      `${notifCursor.status} ct="${notifCursor.kop('content-type')}" bodyLen=${notifCursor.body.length}`);

    const lijstCursor1 = await verzoek(poort, 'POST', '/cursor', JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/list',
    }), { authorization: `Bearer ${cursorToken1}` });
    const namenCursor1 = ((json(lijstCursor1)?.result?.tools ?? []) as Array<{ name: string }>).map((t) => t.name);
    const verwachteV2Tools = [
      'tonen_mijn_account_cursor_ai_tarasevych_com_gebruiker',
      'tonen_diensten_cursor_hub_tarasevych_com_gebruiker',
      'opvragen_gegevens_cursor_github_tarasevych_com_gebruiker',
      'tonen_projecten_cursor_github_tarasevych_com_gebruiker',
      'tonen_repositories_cursor_github_tarasevych_com_gebruiker',
      'tonen_apparaten_cursor_mcp_tarasevych_com_gebruiker',
      'lezen_bestand_cursor_mcp_tarasevych_com_gebruiker',
    ];
    check('/cursor tools/list levert list_services, GitHub (via OAuth zonder PAT!) en apparaat/bestand-tools (niet leeg / niet alleen mcp_auth)',
      lijstCursor1.status === 200 && verwachteV2Tools.every((n) => namenCursor1.includes(n)),
      namenCursor1.join(', '));

    // Herhaalde tools/list binnen dezelfde sessie
    const lijstCursorHerlees = await verzoek(poort, 'POST', '/cursor', JSON.stringify({
      jsonrpc: '2.0', id: 3, method: 'tools/list',
    }), { authorization: `Bearer ${cursorToken1}` });
    check('/cursor herhaalde tools/list binnen dezelfde sessie slaagt foutloos',
      lijstCursorHerlees.status === 200
      && ((json(lijstCursorHerlees)?.result?.tools ?? []) as unknown[]).length === namenCursor1.length);

    // Open SSE op GET /cursor, breid rechten uit in de UI, voer mcp_auth herauthenticatie uit en verifieer notifications/tools/list_changed + nieuwe tool
    const sseCursor = await openSse(poort, '/cursor', cursorToken1);
    openSluiters.push(sseCursor.sluit);
    await slaap(60);
    check('GET /cursor met Accept: text/event-stream opent 200 SSE-stroom',
      sseCursor.status === 200 && sseCursor.contentType.includes('text/event-stream'));

    const uitgebreideSleutels = [...basisSleutels, 'create_task:gebruiker'];
    const wijzigUit = await v2.wijzig(U, 'cursor', { kanten: ['gebruiker'], sleutels: uitgebreideSleutels });
    const vensterVoorstel = await v2.consentV2(U, 'cursor');
    check('UI-uitbreiding op #agent/cursor zet voorkeur klaar met herverbinden=true voor volgende mcp_auth',
      wijzigUit.herverbinden === true && vensterVoorstel.voorkeur?.sleutels.includes('create_task:gebruiker') === true);

    const p2 = pkce();
    const auth2 = await c.authorize({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: cursorCb,
      code_challenge: p2.challenge,
      code_challenge_method: 'S256',
      state: 'st2',
      resource: agentUrl('cursor'),
    });
    const rid2 = new URL(kopVan(auth2 as never, 'location')).searchParams.get('consent') || '';
    const dec2 = await c.consentDecide(U, rid2, true, null, 'prive', vensterVoorstel.voorkeur!);
    const code2 = 'redirect' in dec2 ? new URL(dec2.redirect).searchParams.get('code') || '' : '';
    const tok2 = json(await verzoek(poort, 'POST', '/oauth2/token', form({
      grant_type: 'authorization_code',
      code: code2,
      code_verifier: p2.verifier,
      client_id: reg.client_id,
      redirect_uri: cursorCb,
    }), { 'content-type': 'application/x-www-form-urlencoded' }));
    const cursorToken2 = String(tok2?.access_token || '');
    await slaap(60);
    check('/cursor mcp_auth herauthenticatie stuurt notifications/tools/list_changed over open SSE-stroom',
      sseCursor.berichten.join('').includes('notifications/tools/list_changed'));

    const lijstCursor2 = await verzoek(poort, 'POST', '/cursor', JSON.stringify({
      jsonrpc: '2.0', id: 4, method: 'tools/list',
    }), { authorization: `Bearer ${cursorToken2}` });
    const namenCursor2 = ((json(lijstCursor2)?.result?.tools ?? []) as Array<{ name: string }>).map((t) => t.name);
    check('na mcp_auth herauthenticatie bevat /cursor tools/list zowel de nieuwe UI-tool als list_services en GitHub',
      namenCursor2.includes('creeren_nieuwe_taak_cursor_hub_tarasevych_com_gebruiker')
      && verwachteV2Tools.every((n) => namenCursor2.includes(n)),
      namenCursor2.join(', '));

    const delCursor = await verzoek(poort, 'DELETE', '/cursor', '', { authorization: `Bearer ${cursorToken1}` });
    sseCursor.sluit();
    check('DELETE /cursor antwoordt 204 zonder body en zonder application/json Content-Type (Streamable HTTP sessie-reset)',
      delCursor.status === 204 && delCursor.body === '' && !delCursor.kop('content-type').includes('application/json'));

    // ---------------- 4c. /mcp: UI bord:cursor overerving bij nieuwe mcp_auth + GitHub OAuth in tools/list + GET /mcp SSE + DELETE /mcp
    const bord = bordOnderwerp(U, 'cursor')!;
    const gekozenScopes = ['devices.read', 'site.read', 'github.read', 'board.read', 'mail.read'];
    await zetToegang(U, bord, gekozenScopes);

    const p3 = pkce();
    const authMcp1 = await c.authorize({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: cursorCb,
      code_challenge: p3.challenge,
      code_challenge_method: 'S256',
      state: 'mcp1',
    });
    const ridMcp1 = new URL(kopVan(authMcp1 as never, 'location')).searchParams.get('consent') || '';
    const decMcp1 = await c.consentDecide(U, ridMcp1, true);
    const codeMcp1 = 'redirect' in decMcp1 ? new URL(decMcp1.redirect).searchParams.get('code') || '' : '';
    const tokMcp1 = json(await verzoek(poort, 'POST', '/oauth2/token', form({
      grant_type: 'authorization_code',
      code: codeMcp1,
      code_verifier: p3.verifier,
      client_id: reg.client_id,
      redirect_uri: cursorCb,
    }), { 'content-type': 'application/x-www-form-urlencoded' }));
    const mcpToken1 = String(tokMcp1?.access_token || '');
    const mcpGrant1 = await st.findByAccessHash(sha256(mcpToken1));
    const geerfdeScopes = mcpGrant1 ? await leesToegang(onderwerpVanGrantId(String(mcpGrant1.id))!) : [];
    check('nieuwe /mcp OAuth-sessie (mcp_auth) erft vooraf in UI (bord:cursor) ingeschakelde scopes inclusief mail.read en github.read',
      gekozenScopes.every((s) => geerfdeScopes.includes(s)),
      geerfdeScopes.join(', '));

    const initMcp = await verzoek(poort, 'POST', '/mcp', JSON.stringify({
      jsonrpc: '2.0', id: 10, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'cursor-cloud', version: '1.0' } },
    }), { authorization: `Bearer ${mcpToken1}` });
    const notifMcp = await verzoek(poort, 'POST', '/mcp', JSON.stringify({
      jsonrpc: '2.0', method: 'notifications/initialized',
    }), { authorization: `Bearer ${mcpToken1}` });
    check('/mcp initialize meldt capabilities.tools.listChanged=true en notifications/initialized geeft 202 zonder application/json Content-Type',
      initMcp.status === 200
      && json(initMcp)?.result?.capabilities?.tools?.listChanged === true
      && notifMcp.status === 202 && notifMcp.body === '' && !notifMcp.kop('content-type').includes('application/json'));

    const lijstMcp1 = await verzoek(poort, 'POST', '/mcp', JSON.stringify({
      jsonrpc: '2.0', id: 11, method: 'tools/list',
    }), { authorization: `Bearer ${mcpToken1}` });
    const namenMcp1 = ((json(lijstMcp1)?.result?.tools ?? []) as Array<{ name: string }>).map((t) => t.name);
    check('/mcp tools/list bevat list_services, github_get, get_github_projects, github_list_repos, machine_list en machine_read_file',
      lijstMcp1.status === 200
      && ['list_services', 'github_get', 'get_github_projects', 'github_list_repos', 'machine_list', 'machine_read_file'].every((n) => namenMcp1.includes(n)),
      `aantal=${namenMcp1.length}`);

    const sseMcp = await openSse(poort, '/mcp', mcpToken1);
    openSluiters.push(sseMcp.sluit);
    await slaap(60);
    check('GET /mcp met Accept: text/event-stream opent 200 SSE-stroom',
      sseMcp.status === 200 && sseMcp.contentType.includes('text/event-stream'));

    // Tweede mcp_auth op /mcp wekt notifications/tools/list_changed op de open GET /mcp SSE-stroom
    const p4 = pkce();
    const authMcp2 = await c.authorize({
      response_type: 'code',
      client_id: reg.client_id,
      redirect_uri: cursorCb,
      code_challenge: p4.challenge,
      code_challenge_method: 'S256',
      state: 'mcp2',
    });
    const ridMcp2 = new URL(kopVan(authMcp2 as never, 'location')).searchParams.get('consent') || '';
    const decMcp2 = await c.consentDecide(U, ridMcp2, true);
    const codeMcp2 = 'redirect' in decMcp2 ? new URL(decMcp2.redirect).searchParams.get('code') || '' : '';
    const tokMcp2 = json(await verzoek(poort, 'POST', '/oauth2/token', form({
      grant_type: 'authorization_code',
      code: codeMcp2,
      code_verifier: p4.verifier,
      client_id: reg.client_id,
      redirect_uri: cursorCb,
    }), { 'content-type': 'application/x-www-form-urlencoded' }));
    const mcpToken2 = String(tokMcp2?.access_token || '');
    await slaap(60);
    check('herhaalde mcp_auth op /mcp stuurt notifications/tools/list_changed over GET /mcp SSE en nieuwe tools/list slaagt',
      mcpToken2.startsWith('mcpa_') && sseMcp.berichten.join('').includes('notifications/tools/list_changed'));

    // Inperken via v2.wijzig werkt nu ook door op erfenis /mcp-grants van dezelfde agent en meldt list_changed
    sseMcp.berichten.length = 0;
    const ingeperktUit = await v2.wijzig(U, 'cursor', { kanten: ['gebruiker'], sleutels: ['v2_whoami:gebruiker', 'list_services:gebruiker'] });
    await slaap(60);
    check('v2.wijzig perkt ook actieve /mcp-erfenisgrants van dezelfde agent in en stuurt notifications/tools/list_changed',
      ingeperktUit.ingeperkt >= 1 && sseMcp.berichten.join('').includes('notifications/tools/list_changed'));

    const delMcp = await verzoek(poort, 'DELETE', '/mcp', '', { authorization: `Bearer ${mcpToken1}` });
    sseMcp.sluit();
    check('DELETE /mcp antwoordt 204 zonder body en zonder application/json Content-Type',
      delMcp.status === 204 && delMcp.body === '' && !delMcp.kop('content-type').includes('application/json'));

    // v2.herverbind trekt zowel v2-grants als oude /mcp-grants van deze agent in
    const ingetrokken = await v2.herverbind(U, 'cursor');
    const naHerverbind = await verzoek(poort, 'POST', '/mcp', JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'tools/list' }), {
      authorization: `Bearer ${mcpToken2}`,
    });
    check('v2.herverbind trekt zowel /cursor als geërfde /mcp-tokens van Cursor in (volgende aanroep → 401)',
      ingetrokken.length >= 2 && naHerverbind.status === 401);
  } finally {
    for (const sluit of openSluiters) { try { sluit(); } catch { /* ignore */ } }
    if (server) await new Promise((r) => server!.close(() => r(undefined)));
    await koppelingWissen(U, 'oauth', 'prive').catch(() => undefined);
    await sys.query('DELETE FROM app.connector_v2_rechten WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.connector_v2_voorkeur WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.connector_v2_instellingen WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.ai_toegang WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.mcp_oauth_tokens WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.mcp_oauth_codes WHERE user_id = $1', [U]).catch(() => undefined);
    if (clients.length) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [clients]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [U]).catch(() => undefined);
    if (vorigeDist === undefined) delete process.env.DIST_DIR; else process.env.DIST_DIR = vorigeDist;
    if (vorigeTotpKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY_V1; else process.env.TOTP_ENCRYPTION_KEY_V1 = vorigeTotpKey;
    await rm(dist, { recursive: true, force: true }).catch(() => undefined);
    await closePool();
  }

  return einde();
}
