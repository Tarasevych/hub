// MCP «в один клік» (13.10.2026): de deur (deploy/mcp/server.mjs) stuurt naar het venster «Дозволити» van de site, geeft tokens
// met de gekozen duur, bindt ze aan de deur, toont per deur de juiste metadata (RFC 9728) en accepteert agenttokens van de eigenaar
// via de site. Plus de gedeelde regels (shared/ai-verbinding.ts) en de keep-alive tegen 502 via de tunnel.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DUREN, accessSeconden, duur, duurVoorKlant, klantVan, redirectPast, redirectSoort } from '../../shared/ai-verbinding';
import { checker } from './hulp/nep-google';

const ISS = 'https://mcp.example.test';
const VECTOREN: Array<[string, 'web' | 'loopback' | 'app' | null]> = [
  ['https://grok.com/oauth/callback', 'web'], ['https://accounts.x.ai/cb', 'web'], ['https://claude.ai/api/mcp/auth_callback', 'web'], ['https://claude.com/api/mcp/auth_callback', 'web'], ['https://chatgpt.com/connector_platform_oauth_redirect', 'web'],
  ['https://vscode.dev/redirect', 'web'], ['https://cursor.com/api/auth/callback', 'web'], ['http://127.0.0.1:33418/', 'loopback'], ['http://localhost:8787/callback', 'loopback'], ['http://[::1]:9000/cb', 'loopback'],
  ['cursor://anysphere.cursor-mcp/oauth/callback', 'app'], ['vscode://vscode.github-authentication/did-authenticate', 'app'],
  ['https://evil.example/cb', null], ['https://grok.com.evil.example/cb', null], ['https://evilgrok.com/cb', null], ['http://grok.com/cb', null], ['https://localhost/cb', null],
  ['https://grok.com/cb#x', null], ['https://user:pw@grok.com/cb', null], ['javascript:alert(1)', null], ['data:text/html,hi', null], ['file:///etc/passwd', null],
  ['myapp://cb', null], ['cursor:', null], ['', null], ['https://grok.com/a b', null],
];

export async function main(): Promise<number> {
  const { check, einde } = checker('mcp-een-klik');

  // ---------------------------------------------------------------- gedeelde regels
  const mis = VECTOREN.filter(([u, s]) => redirectSoort(u) !== s);
  check('redirectSoort: alle voorbeelden juist', mis.length === 0, JSON.stringify(mis.map(([u]) => [u, redirectSoort(u)])));
  check('redirectSoort: extra adres van de eigenaar (exact en voorvoegsel /)', redirectSoort('https://ai.example.org/cb', ['https://ai.example.org/cb']) === 'web' && redirectSoort('https://ai.example.org/x/y', ['https://ai.example.org/x/']) === 'web' && redirectSoort('https://ai.example.org/z', ['https://ai.example.org/x/']) === null && redirectSoort('http://ai.example.org/cb', ['http://ai.example.org/cb']) === null);
  check('redirectPast: loopback zonder poort, verder exact', redirectPast(['http://127.0.0.1/cb'], 'http://127.0.0.1:5555/cb') && !redirectPast(['http://127.0.0.1/cb'], 'http://localhost:5555/cb') && !redirectPast(['https://grok.com/cb'], 'https://grok.com/cb2'));
  check('klantVan: namen van klanten', klantVan('Grok') === 'grok' && klantVan('Claude Code') === 'claude' && klantVan('Cursor (через сайт)') === 'cursor' && klantVan('OpenAI ChatGPT') === 'chatgpt' && klantVan('Visual Studio Code') === 'copilot' && klantVan('iets') === 'overig' && klantVan('') === 'overig');
  check('duur: standaard 1 uur; onbekend → standaard; «altijd» = 100 jaar', duurVoorKlant({}, 'grok') === '1u' && duurVoorKlant({ grok: '7d' }, 'grok') === '7d' && duurVoorKlant({ grok: 'nooit' }, 'grok') === '1u' && duurVoorKlant({ '*': '8u' }, 'cursor') === '8u' && accessSeconden(duur('altijd')) > 99 * 365 * 86400 && accessSeconden(duur('1u')) === 3600);
  check('duur: lange keuzes vragen een verse aanmelding', DUREN.filter((d) => d.lang).map((d) => d.id).join(',') === '7d,30d,altijd');

  // ---------------------------------------------------------------- keep-alive tegen 502 via cloudflared (90 s)
  const start = readFileSync('server/start.ts', 'utf8');
  const deurBron = readFileSync('deploy/mcp/server.mjs', 'utf8');
  const ka = Number((/server\.keepAliveTimeout = ([0-9_]+)/.exec(start)?.[1] || '0').replace(/_/g, ''));
  check('502: keep-alive van de app langer dan die van cloudflared (90 s)', ka > 90_000, String(ka));
  check('502: keep-alive van de deur langer dan die van cloudflared', /server\.keepAliveTimeout = 120_000/.test(deurBron) && /server\.headersTimeout = 125_000/.test(deurBron));
  check('deur: gelijke lijsten als shared/ai-verbinding.ts', ['claude.ai', 'claude.com', 'grok.com', 'x.ai', 'chatgpt.com', 'openai.com', 'vscode.dev', 'cursor.com'].every((h) => deurBron.includes(`"${h}"`)) && ['cursor', 'vscode', 'vscode-insiders', 'windsurf'].every((h) => deurBron.includes(`"${h}"`)));
  check('deur: geen child_process of sudo (plafond blijft)', !/child_process|\bspawn\(|\bsudo\b/.test(deurBron.replace(/^\s*\/\/.*$/gm, '')));

  // ---------------------------------------------------------------- de deur zelf
  const d = mkdtempSync(join(tmpdir(), 'mcp-een-klik-'));
  const site = join(d, 'site'); mkdirSync(site); writeFileSync(join(site, 'leesmij.txt'), 'hallo');
  const rechten = join(d, 'rechten.json'); writeFileSync(rechten, JSON.stringify({ read: true, uitrol: false, oauthRedirects: ['https://ai.example.org/cb'] }));
  const tokenFile = join(d, 'mcp.token'); const deurToken = randomBytes(24).toString('hex'); writeFileSync(tokenFile, deurToken);
  const stateDir = join(d, 'state'); mkdirSync(stateDir);
  const stateFile = join(stateDir, 'state.json');
  const sleutelFile = join(stateDir, 'intern.sleutel');

  // nep-app: beantwoordt /api/mcp/deur/token-check zoals de site (alleen met de sleutel van de deur)
  const GOED = `tvh_${'g'.repeat(32)}`, ANDER = `tvh_${'a'.repeat(32)}`;
  let appAanroepen = 0, appSleutelOk = true;
  const app = createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      appAanroepen += 1;
      const sleutel = readFileSync(sleutelFile, 'utf8').trim();
      if (req.headers['x-mijn-ruimte-intern'] !== sleutel || req.headers.host !== 'mcp.example.test') { appSleutelOk = false; res.writeHead(404); res.end('{}'); return; }
      const j = JSON.parse(b || '{}');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(j.token === GOED ? { ok: true, id: 'tok-1', naam: 'grok' } : { ok: false }));
    });
  });
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', () => r()));
  const appPort = (app.address() as { port: number }).port;

  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ['deploy/mcp/server.mjs'], {
    env: { ...process.env, MCP_PORT: String(port), MCP_ROOT: site, MCP_TOKEN_FILE: tokenFile, MCP_RECHTEN_FILE: rechten, MCP_INTREKKEN_FILE: join(d, 'intrekken'),
      MCP_STATE_FILE: stateFile, MCP_UITROL_INBOX: join(d, 'inbox'), MCP_UITROL_STATUS: join(d, 'status.json'), MCP_RELEASES_DIR: d, MCP_HEALTH_URL: 'http://127.0.0.1:1/x', MCP_ISSUER: ISS,
      // 20.10.2026: de deur geeft agentpaden (/claude, /Grok …) standaard door aan de app; deze test gaat over de EIGEN OAuth van de deur.
      MCP_APP_URL: `http://127.0.0.1:${appPort}`, MCP_AGENTPADEN: 'deur' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; proc.stdout.on('data', (b) => { log += b; }); proc.stderr.on('data', (b) => { log += b; });
  try {
    for (let i = 0; i < 50 && !log.includes('mijn-ruimte-mcp'); i++) await new Promise((r) => setTimeout(r, 100));
    const B = `http://127.0.0.1:${port}`;
    const sleutel = readFileSync(sleutelFile, 'utf8').trim();
    check('deur: maakt bij de start een interne sleutel (0640, 43 tekens)', /^[A-Za-z0-9_-]{43}$/.test(sleutel));
    const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
    const post = (p: string, body: string, headers: Record<string, string> = {}) => fetch(B + p, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, redirect: 'manual' });
    const intern = (p: string, body?: unknown, extra: Record<string, string> = {}) => fetch(B + p, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-mijn-ruimte-intern': sleutel, 'content-type': 'application/json', ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = async (r: Response) => { try { return await r.json() as any; } catch { return null; } };

    // ---- metadata per deur
    let r = await fetch(`${B}/.well-known/oauth-protected-resource/Grok`);
    let j = await json(r);
    check('PRM /Grok: resource precies https://…/Grok', r.status === 200 && j.resource === `${ISS}/Grok` && j.authorization_servers?.[0] === ISS, JSON.stringify(j));
    j = await json(await fetch(`${B}/.well-known/oauth-protected-resource/claude`));
    check('PRM /claude: resource https://…/claude (niet meer altijd /Grok)', j?.resource === `${ISS}/claude`, JSON.stringify(j));
    j = await json(await fetch(`${B}/Grok/.well-known/oauth-protected-resource`));
    check('PRM ook als /Grok/.well-known/oauth-protected-resource', j?.resource === `${ISS}/Grok`);
    check('PRM: onbekende deur → 404', (await fetch(`${B}/.well-known/oauth-protected-resource/evil`)).status === 404);
    j = await json(await fetch(`${B}/.well-known/oauth-authorization-server/Grok`));
    check('ASM ook met de deur in het pad', j?.issuer === ISS && j?.code_challenge_methods_supported?.includes('S256'));
    r = await fetch(`${B}/claude`, { method: 'POST', body: '{}' });
    const www = r.headers.get('www-authenticate') || '';
    check('401 /claude: WWW-Authenticate met resource_metadata van /claude', r.status === 401 && www.includes(`resource_metadata="${ISS}/.well-known/oauth-protected-resource/claude"`) && !www.includes('invalid_token'), www);
    r = await fetch(`${B}/Grok`, { method: 'POST', body: '{}', headers: { authorization: 'Bearer onzin' } });
    check('401 met ongeldig token: error="invalid_token"', r.status === 401 && (r.headers.get('www-authenticate') || '').includes('error="invalid_token"'));
    r = await fetch(`${B}/oauth/token`, { method: 'OPTIONS' });
    check('CORS-preflight op /oauth/token', r.status === 204 && r.headers.get('access-control-allow-origin') === '*');

    // ---- registratie: zelfde regels als shared/ai-verbinding.ts
    const regMis: string[] = [];
    let ipTeller = 0; // registratie is per IP begrensd (10/uur): elke registratie hier een eigen (tunnel-)IP
    const reg = (body: unknown) => post('/oauth/register', JSON.stringify(body), { 'content-type': 'application/json', 'cf-connecting-ip': `10.0.0.${++ipTeller}` });
    for (const [u, s] of VECTOREN) {
      if (!u) continue;
      const rr = await reg({ redirect_uris: [u], client_name: 'T' });
      if ((rr.status === 201) !== (s !== null)) regMis.push(`${u}:${rr.status}`);
    }
    check('deur-registratie = redirectSoort() (zelfde voorbeelden)', regMis.length === 0, regMis.join(' '));
    r = await reg({ redirect_uris: ['https://ai.example.org/cb'] });
    check('deur: extra adres uit mcp-rechten.json («oauthRedirects») toegestaan', r.status === 201);
    r = await reg({ redirect_uris: ['cursor://anysphere.cursor-mcp/oauth/callback'], client_name: 'Cursor' });
    const cursor = await json(r);
    r = await reg({ redirect_uris: ['https://grok.com/oauth/callback'], client_name: 'Grok' });
    check('registratie: per IP begrensd (11e van hetzelfde IP → 429)', await (async () => { let st = 0; for (let i = 0; i < 11; i++) st = (await post('/oauth/register', JSON.stringify({ redirect_uris: ['https://grok.com/x'] }), { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.9.9' })).status; return st === 429; })());
    const grok = await json(r);

    // ---- één klik: authorize → venster van de site
    const pk = () => { const v = randomBytes(32).toString('base64url'); return { v, c: createHash('sha256').update(v).digest('base64url') }; };
    const p1 = pk();
    const q = (cid: string, red: string, p: { c: string }, extra: Record<string, string> = {}) => new URLSearchParams({ response_type: 'code', client_id: cid, redirect_uri: red, code_challenge: p.c, code_challenge_method: 'S256', state: 'st-9', ...extra }).toString();
    r = await fetch(`${B}/oauth/authorize?${q(grok.client_id, 'https://grok.com/oauth/callback', p1, { resource: `${ISS}/claude` })}`, { redirect: 'manual' });
    const naar = new URL(r.headers.get('location') || 'https://x/');
    const rid = naar.searchParams.get('consent') || '';
    // 20.10.2026: /verbindingen is geen pagina meer (hub «Підключення ШІ» → tab «Технічне»), dus de deur stuurt naar /agents.
    // Het toestemmingsvenster kent de technische ruimte uit de LEVENDE staat van het technische profiel, niet uit het adres
    // (zie tests/eenheid/toestemming-ruimte-cyclus-20261020.test.ts): een adres per ruimte gaf een cyclus.
    check('authorize → 302 naar het venster «Дозволити» van de site (/agents?consent=mrd_…)', r.status === 302 && naar.origin === ISS && naar.pathname === '/agents' && /^mrd_[A-Za-z0-9_-]{30,}$/.test(rid), naar.toString());
    r = await fetch(`${B}/oauth/authorize?${q(grok.client_id, 'https://grok.com/oauth/callback', p1, { resource: 'https://evil.example/claude' })}`, { redirect: 'manual' });
    check('authorize: vreemde resource → terug met error=invalid_target', r.status === 302 && new URL(r.headers.get('location') || 'https://x/').searchParams.get('error') === 'invalid_target');
    r = await fetch(`${B}/oauth/authorize?${q(grok.client_id, 'https://evil.example/cb', p1)}`, { redirect: 'manual' });
    check('authorize: vreemde redirect → 400 en NOOIT een redirect', r.status === 400 && !r.headers.get('location'));

    // ---- /intern: alleen met sleutel, nooit via de tunnel
    check('intern: zonder sleutel 404', (await fetch(`${B}/intern/verzoek?rid=${rid}`)).status === 404);
    check('intern: met tunnelkop (cf-connecting-ip) 404, ook met sleutel', (await intern(`/intern/verzoek?rid=${rid}`, undefined, { 'cf-connecting-ip': '1.2.3.4' })).status === 404);
    check('intern: verkeerde sleutel 404', (await fetch(`${B}/intern/verzoek?rid=${rid}`, { headers: { 'x-mijn-ruimte-intern': sleutel.replace(/.$/, sleutel.endsWith('a') ? 'b' : 'a') } })).status === 404);
    j = await json(await intern(`/intern/verzoek?rid=${rid}`));
    check('intern: verzoek toont klant, terugkeerhost, soort en deur', j?.clientName === 'Grok' && j.redirectHost === 'grok.com' && j.redirectSoort === 'web' && j.deur === 'claude' && j.resource === `${ISS}/claude`, JSON.stringify(j));

    j = await json(await intern('/intern/besluit', { rid, approve: true, duur: '7d', wie: { id: 'u1', email: 'eigenaar@example.test' } }));
    const terug = new URL(j?.redirect || 'https://x/');
    const code = terug.searchParams.get('code') || '';
    check('besluit «Дозволити» → terug naar grok.com met code, state en iss', terug.origin === 'https://grok.com' && code.length > 30 && terug.searchParams.get('state') === 'st-9' && terug.searchParams.get('iss') === ISS);
    check('besluit: hetzelfde verzoek kan maar één keer', (await intern('/intern/besluit', { rid, approve: true })).status === 404);
    r = await post('/oauth/token', form({ grant_type: 'authorization_code', client_id: grok.client_id, code, redirect_uri: 'https://grok.com/oauth/callback', code_verifier: p1.v }));
    const t1 = await json(r);
    check('token: gekozen duur 7 dagen', r.status === 200 && t1.expires_in === 7 * 86400 && t1.token_type === 'Bearer', JSON.stringify(t1).slice(0, 120));
    const rpc = async (pad: string, token: string, body: unknown, headers: Record<string, string> = {}) => {
      const x = await fetch(`${B}${pad}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
      return { status: x.status, sid: x.headers.get('mcp-session-id'), body: x.status === 200 ? await json(x) : null };
    };
    let o = await rpc('/claude', t1.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check('token werkt op zijn eigen deur (/claude)', o.status === 200 && Array.isArray(o.body?.result?.tools));
    o = await rpc('/CLAUDE', t1.access_token, { jsonrpc: '2.0', id: 1, method: 'ping' });
    check('deurnaam zonder hoofdlettergevoeligheid', o.status === 200);
    o = await rpc('/Grok', t1.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check('token is aan de deur gebonden: /Grok weigert een token voor /claude', o.status === 401);
    r = await post('/oauth/token', form({ grant_type: 'refresh_token', client_id: grok.client_id, refresh_token: t1.refresh_token }));
    const t2 = await json(r);
    check('refresh houdt dezelfde duur aan (7 dagen) en dezelfde deur', r.status === 200 && t2.expires_in === 7 * 86400 && (await rpc('/claude', t2.access_token, { jsonrpc: '2.0', id: 2, method: 'ping' })).status === 200);

    // batch, notificatie, sessies
    o = await rpc('/claude', t2.access_token, [{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, { jsonrpc: '2.0', id: 2, method: 'ping' }]);
    check('JSON-RPC-batch → array met twee antwoorden en een sessie-id', o.status === 200 && Array.isArray(o.body) && o.body.length === 2 && o.body[0].result?.protocolVersion === '2025-06-18' && /^[a-f0-9]{32}$/.test(o.sid || ''));
    o = await rpc('/claude', t2.access_token, { jsonrpc: '2.0', method: 'notifications/initialized' });
    check('notificatie → 202', o.status === 202);
    o = await rpc('/claude', t2.access_token, { jsonrpc: '2.0', id: 3, method: 'ping' }, { 'mcp-session-id': 'f'.repeat(32) });
    check('onbekende sessie-id (bv. na herstart) breekt niet af', o.status === 200);
    const par = await Promise.all(Array.from({ length: 12 }, (_, i) => rpc('/claude', t2.access_token, { jsonrpc: '2.0', id: i, method: 'initialize', params: {} })));
    check('12 parallelle initialize-verzoeken: allemaal 200', par.every((x) => x.status === 200), par.map((x) => x.status).join(','));

    // verbindingen + intrekken via de site
    j = await json(await intern('/intern/verbindingen'));
    const v = (j?.verbindingen || []).find((x: any) => x.deur === 'claude');
    check('verbindingen: klant, deur, duur en wie (geen tokens)', v && v.klant === 'Grok' && v.duur === '7d' && v.wie?.email === 'eigenaar@example.test' && v.via === 'site' && !JSON.stringify(j).includes(t2.access_token), JSON.stringify(j).slice(0, 300));
    check('intrekken via de site', (await intern('/intern/intrekken', { id: v?.id })).status === 200 && (await rpc('/claude', t2.access_token, { jsonrpc: '2.0', id: 4, method: 'ping' })).status === 401);

    // weigeren + onbeperkt + app-schema
    const p2 = pk();
    r = await fetch(`${B}/oauth/authorize?${q(cursor.client_id, 'cursor://anysphere.cursor-mcp/oauth/callback', p2)}`, { redirect: 'manual' });
    const rid2 = new URL(r.headers.get('location') || 'https://x/').searchParams.get('consent') || '';
    j = await json(await intern(`/intern/verzoek?rid=${rid2}`));
    check('app-schema: soort «app», terugkeer naar cursor://', j?.redirectSoort === 'app' && j.redirectHost === 'anysphere.cursor-mcp' && j.deur === '', JSON.stringify(j));
    j = await json(await intern('/intern/besluit', { rid: rid2, approve: false }));
    check('weigeren → terug met error=access_denied, zonder code', /^cursor:\/\//.test(j?.redirect || '') && new URL(j.redirect).searchParams.get('error') === 'access_denied' && !new URL(j.redirect).searchParams.get('code'));
    r = await fetch(`${B}/oauth/authorize?${q(cursor.client_id, 'cursor://anysphere.cursor-mcp/oauth/callback', p2)}`, { redirect: 'manual' });
    const rid3 = new URL(r.headers.get('location') || 'https://x/').searchParams.get('consent') || '';
    j = await json(await intern('/intern/besluit', { rid: rid3, approve: true, duur: 'altijd', wie: { id: 'u1' } }));
    const code3 = new URL(j.redirect).searchParams.get('code') || '';
    const t3 = await json(await post('/oauth/token', form({ grant_type: 'authorization_code', client_id: cursor.client_id, code: code3, redirect_uri: 'cursor://anysphere.cursor-mcp/oauth/callback', code_verifier: p2.v })));
    check('«безстроково»: toegangstoken van ~100 jaar, werkt op elke deur (geen resource gevraagd)', t3?.expires_in > 99 * 365 * 86400 && (await rpc('/Grok', t3.access_token, { jsonrpc: '2.0', id: 1, method: 'ping' })).status === 200);

    // ---- handmatig met het deurtoken (de oude weg blijft)
    const p4 = pk();
    r = await fetch(`${B}/oauth/authorize?${q(grok.client_id, 'https://grok.com/oauth/callback', p4, { methode: 'token' })}`, { redirect: 'manual' });
    const html = await r.text();
    const csp = r.headers.get('content-security-policy') || '';
    const rid4 = /name="verzoek" value="([^"]+)"/.exec(html)?.[1] || '';
    check('handmatig: formulier met deurtoken + knop «Підтвердити на сайті»', r.status === 200 && html.includes('bridge_token') && html.includes(`${ISS}/agents?consent=${rid4}`) && !!rid4);
    check('handmatig: CSP form-action laat de terugkeer naar grok.com toe (Chrome controleert de redirect na POST)', /form-action 'self' https:\/\/grok\.com/.test(csp), csp);
    r = await post('/oauth/authorize', form({ verzoek: rid4, bridge_token: 'fout' }));
    check('handmatig: verkeerd deurtoken → 401 met formulier', r.status === 401);
    r = await post('/oauth/authorize', form({ verzoek: rid4, bridge_token: deurToken }));
    const loc4 = new URL(r.headers.get('location') || 'https://x/');
    check('handmatig: juist deurtoken → code (1 uur)', r.status === 302 && !!loc4.searchParams.get('code'));
    const t4 = await json(await post('/oauth/token', form({ grant_type: 'authorization_code', client_id: grok.client_id, code: loc4.searchParams.get('code') || '', redirect_uri: 'https://grok.com/oauth/callback', code_verifier: p4.v })));
    check('handmatig: standaard 1 uur', t4?.expires_in === 3600);
    r = await post('/oauth/authorize', form({ response_type: 'code', client_id: grok.client_id, redirect_uri: 'https://grok.com/oauth/callback', code_challenge: p4.c, code_challenge_method: 'S256', state: 'x', bridge_token: deurToken }));
    check('oude vorm (alle velden in het formulier) werkt nog', r.status === 302 && !!new URL(r.headers.get('location') || 'https://x/').searchParams.get('code'));

    // ---- agenttoken van de site (tvh_) als Bearer
    o = await rpc('/Grok', GOED, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check('tvh_-token van de eigenaar (bevestigd door de site) werkt als Bearer', o.status === 200 && Array.isArray(o.body?.result?.tools));
    o = await rpc('/Grok', ANDER, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check('ander tvh_-token → 401', o.status === 401);
    const voor = appAanroepen;
    await rpc('/Grok', GOED, { jsonrpc: '2.0', id: 2, method: 'ping' });
    check('tvh_: uitkomst 60 s in het geheugen (geen vraag per aanroep)', appAanroepen === voor);
    check('tvh_: de deur stuurt de sleutel en de juiste Host mee', appSleutelOk);

    const opslag = readFileSync(stateFile, 'utf8');
    check('toestand: geen klare tokens, wel grants zonder geheimen', !opslag.includes(t3.access_token) && !opslag.includes(t3.refresh_token) && opslag.includes('"grants"'));
    check('health meldt toestemming via de site', (await json(await fetch(`${B}/health`)))?.siteToestemming === true);
  } finally {
    proc.kill('SIGTERM');
    app.close();
    rmSync(d, { recursive: true, force: true });
  }

  // ---------------------------------------------------------------- connector /mcp (database): duur, rotatie, tvh_ als Bearer
  if (process.env.DATABASE_URL_SYSTEM || process.env.DATABASE_URL) await connectorDeel(check);
  else console.log('OVERGESLAGEN connector-deel: geen database');
  return einde();
}

async function connectorDeel(check: (n: string, ok: boolean, i?: string) => void) {
  const { closePool, getPool } = await import('../../server/platform/pg');
  const c = await import('../../backend/mcp-connector');
  const inst = await import('../../backend/ai-verbinding-instellingen');
  const sys = getPool('systeem');
  const U = `een-klik-${randomBytes(6).toString('hex')}`;
  const clients: string[] = [];
  const kop = (r: { headers: Record<string, string> }, n: string) => Object.entries(r.headers).find(([k]) => k.toLowerCase() === n)?.[1] ?? '';
  const body = (r: { body: string }) => (r.body ? JSON.parse(r.body) : null);
  await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [U, { email: `${U}@test.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] }]);
  try {
    check('instellingen: standaard 1 uur voor elke klant', (await inst.leesDuren(U)).grok === '1u');
    await inst.zetDuur(U, 'cursor', '7d');
    await inst.zetDuur(U, 'grok', '8u');
    const duren = await inst.leesDuren(U);
    check('instellingen: per klant opgeslagen (cursor 7d, grok 8u, claude standaard)', duren.cursor === '7d' && duren.grok === '8u' && duren.claude === '1u', JSON.stringify(duren));
    let fout = ''; try { await inst.zetDuur(U, 'cursor', 'nooit' as never); } catch (e) { fout = (e as Error).message; }
    check('instellingen: onbekende duur geweigerd', fout === 'DUUR_ONGELDIG');

    const red = 'cursor://anysphere.cursor-mcp/oauth/callback';
    const reg = body(await c.registerClient(JSON.stringify({ client_name: 'Cursor', redirect_uris: [red] })));
    clients.push(reg.client_id);
    check('connector: Cursor (cursor://) kan zich registreren', /^mcpc_/.test(reg?.client_id || ''), JSON.stringify(reg));
    const v = randomBytes(32).toString('base64url'); const ch = createHash('sha256').update(v).digest('base64url');
    const a = await c.authorize({ response_type: 'code', client_id: reg.client_id, redirect_uri: red, code_challenge: ch, code_challenge_method: 'S256', state: 's', resource: c.RESOURCE });
    const rid = new URL(kop(a, 'location')).searchParams.get('consent') || '';
    const info = await c.consentInfo(rid, U);
    check('connector: venster kent klant en standaardduur (cursor → 7d) en soort app', info?.klant === 'cursor' && info.duur === '7d' && info.redirectSoort === 'app' && info.redirectHost === 'anysphere.cursor-mcp', JSON.stringify(info));
    const dec = await c.consentDecide(U, rid, true, null);
    const code = 'redirect' in dec ? new URL(dec.redirect).searchParams.get('code') || '' : '';
    let t = await c.token(new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: v, client_id: reg.client_id, redirect_uri: red }).toString());
    const t1 = body(t);
    check('connector: zonder keuze in het venster geldt de instelling (7 dagen)', t.statusCode === 200 && t1.expires_in === 7 * 86400, JSON.stringify(t1).slice(0, 100));
    t = await c.token(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: reg.client_id }).toString());
    const t2 = body(t);
    const rij = (await sys.query('SELECT duur, refresh_expires_at FROM app.mcp_oauth_tokens WHERE user_id = $1', [U])).rows[0];
    check('connector: rotatie houdt 7 dagen en de grant bewaart de duur', t2.expires_in === 7 * 86400 && rij?.duur === '7d' && new Date(rij.refresh_expires_at).getTime() > Date.now() + 80 * 86400_000, JSON.stringify(rij));
    check('connector: lijst van grants toont de duur', (await c.listUserGrants(U))[0]?.duur === '7d');

    // keuze in het venster wint van de instelling
    const a2 = await c.authorize({ response_type: 'code', client_id: reg.client_id, redirect_uri: red, code_challenge: ch, code_challenge_method: 'S256', state: 's' });
    const rid2 = new URL(kop(a2, 'location')).searchParams.get('consent') || '';
    const dec2 = await c.consentDecide(U, rid2, true, 'altijd');
    const code2 = 'redirect' in dec2 ? new URL(dec2.redirect).searchParams.get('code') || '' : '';
    const t3 = body(await c.token(new URLSearchParams({ grant_type: 'authorization_code', code: code2, code_verifier: v, client_id: reg.client_id, redirect_uri: red }).toString()));
    check('connector: «безстроково» in het venster → ~100 jaar', t3.expires_in > 99 * 365 * 86400);
    const r = await c.rpcPost(`Bearer ${t3.access_token}`, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
    check('connector: dat token werkt', r.statusCode === 200);

    // «Підключити вручну»: agenttoken tvh_ als Bearer op /mcp
    const raw = `tvh_${randomBytes(24).toString('base64url')}`;
    await sys.query(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, expires_at) VALUES ($1, 'cursor', $2, $3, now() + interval '30 days')`, [U, raw.slice(0, 12), createHash('sha256').update(raw).digest('hex')]);
    let m = await c.rpcPost(`Bearer ${raw}`, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    check('connector: tvh_-token werkt als vaste Bearer (tools/list)', m.statusCode === 200 && Array.isArray(body(m)?.result?.tools), m.body.slice(0, 200));
    const tel = (await sys.query('SELECT calls FROM app.mcp_console_tokens WHERE user_id = $1', [U])).rows[0]?.calls;
    check('connector: gebruik van het tvh_-token wordt geteld', Number(tel) === 1, String(tel));
    await sys.query('UPDATE app.mcp_console_tokens SET revoked_at = now() WHERE user_id = $1', [U]);
    m = await c.rpcPost(`Bearer ${raw}`, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
    check('connector: ingetrokken tvh_-token → 401 invalid_token', m.statusCode === 401 && /invalid_token/.test(kop(m, 'www-authenticate')));
    const own = (await c.agentToken(raw));
    check('agentToken: ingetrokken = null', own === null);
  } finally {
    if (clients.length) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [clients]).catch(() => undefined);
    await sys.query('DELETE FROM app.mcp_console_tokens WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query('DELETE FROM app.user_ai_settings WHERE user_id = $1', [U]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [U]).catch(() => undefined);
    await closePool();
  }
}
