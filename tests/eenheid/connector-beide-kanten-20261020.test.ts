// Eén connector per agent draagt BEIDE kanten; de levende staat beslist per aanroep (20.10.2026, avond — na release 20261020-173704).
//
// Wat er op de echte site gebeurde: de eigenaar koppelde Claude aan https://mcp.tarasevych.com/claude en kreeg het venster van de
// SERVERDEUR («Технічний простір … Жодної пошти, Drive чи особистих пристроїв», blokken «Читання» en «Підписаний випуск») en daarna
// een connector met precies elf technische hulpmiddelen. Die elf zijn de TOOLS van deploy/mcp/server.mjs: het verzoek was bij de
// deur (poort 8091) beland, niet bij connector v2 — de tunnelregel op de server was nog de oude. Connector v2 zelf kende de fout
// niet: zijn venster biedt beide kanten, zijn grant bewaart ze, en v2Lijst/v2Roep filteren live.
//
// Wat hier vastligt:
//  1. BEWIJS: de deur heeft elf hulpmiddelen; het deurvenster is de enige plek met «Підписаний випуск»; de route zet soort 'deur' +
//     ruimte 'technisch'; het v2-venster kent géén ruimte-uit-de-pagina en biedt beide kanten aan;
//  2. DE DEUR GEEFT AGENTADRESSEN DOOR aan de app (zelfde Host, koppen, body, status) en geeft er geen toestemming/token meer voor;
//     alleen MCP_AGENTPADEN=deur laat het oude gedrag zien (de regressie);
//  3. ÉÉN GRANT met beide kanten: in de privéstaat de volledige privélijst (geen _beheer), in de technische staat beide; het recht
//     verandert niet mee — alleen wat er nu bestaat;
//  4. ERFENIS: een token van het oude /mcp van dezelfde AI-klant werkt op /<agent> met de kanten die de mens die AI ooit gaf, zonder
//     nieuwe toestemming; een /mcp-token van een ANDERE klant krijgt 401; het v2-venster start met de erfenis aangevinkt;
//  5. LIST_CHANGED: GET /<agent> met Accept: text/event-stream opent een stroom en meldt notifications/tools/list_changed zodra de
//     technische kant aan of uit gaat; initialize zegt listChanged: true.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { closePool, getPool } from '../../server/platform/pg';
import { agentUrl } from '../../shared/connector-v2/agenten';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import * as c from '../../backend/mcp-connector';
import * as v2 from '../../backend/connector-v2';
import * as v2st from '../../backend/connector-v2-opslag';
import { erfenisUit, sleutelsUitScopes } from '../../backend/connector-v2-erfenis';
import * as tp from '../../backend/tech-profiel';
import { sha256 } from '../../backend/connectors-crypto';

process.env.MCP_LIJST_POLL_MS = '250'; // vóór de dynamische import van server/start (backend/connector-v2-stroom.ts leest dit bij laden)

const json = (r: { body: string }) => (r.body ? JSON.parse(r.body) : null);
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };
const kopVan = (r: { headers: Record<string, string> }, n: string) => Object.entries(r.headers).find(([k]) => k.toLowerCase() === n)?.[1] ?? '';
const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Antw = { status: number; body: string; kop: (n: string) => string };
function verzoek(poort: number, methode: string, pad: string, body = '', headers: Record<string, string> = {}): Promise<Antw> {
  return new Promise((ok, fout) => {
    const r = http.request({ host: '127.0.0.1', port: poort, method: methode, path: pad, headers: { host: 'mcp.tarasevych.com', 'content-type': 'application/json', 'cf-connecting-ip': `198.19.${Math.floor(Math.random() * 200)}.9`, 'content-length': Buffer.byteLength(body), ...headers } }, (res) => {
      let data = ''; res.on('data', (ch) => { data += ch; }); res.on('end', () => ok({ status: res.statusCode || 0, body: data, kop: (n: string) => String(res.headers[n.toLowerCase()] ?? '') }));
    });
    r.on('error', fout); r.end(body);
  });
}

/** De deur (deploy/mcp/server.mjs) als apart proces, met een NEP-APP die elk doorgestuurd verzoek vastlegt. */
async function metDeur(agentpaden: 'app' | 'deur', run: (deur: number, gezien: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders; body: string }>) => Promise<void>) {
  const d = await mkdtemp(join(tmpdir(), 'mr-bk-deur-'));
  const site = join(d, 'site'); await mkdir(site, { recursive: true }); await writeFile(join(site, 'UITROL-VERSIE'), '20261020-000000\n');
  writeFileSync(join(d, 'rechten.json'), JSON.stringify({ read: true, uitrol: false }));
  writeFileSync(join(d, 'mcp.token'), `${'a'.repeat(40)}\n`);
  const gezien: Array<{ method: string; url: string; headers: http.IncomingHttpHeaders; body: string }> = [];
  const app = http.createServer((req, res) => {
    let body = ''; req.on('data', (b) => { body += b; });
    req.on('end', () => {
      gezien.push({ method: String(req.method), url: String(req.url), headers: req.headers, body });
      res.writeHead(418, { 'content-type': 'application/json', 'x-nep-app': 'ja', 'www-authenticate': 'Bearer realm="mcp-claude"' });
      res.end(JSON.stringify({ nep: true, pad: req.url }));
    });
  });
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', () => r()));
  const appPoort = (app.address() as { port: number }).port;
  const poort = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ['deploy/mcp/server.mjs'], {
    env: { ...process.env, MCP_PORT: String(poort), MCP_ROOT: site, MCP_TOKEN_FILE: join(d, 'mcp.token'), MCP_RECHTEN_FILE: join(d, 'rechten.json'), MCP_INTREKKEN_FILE: join(d, 'intrekken'),
      MCP_STATE_FILE: join(d, 'state', 'sessions.json'), MCP_UITROL_INBOX: join(d, 'inbox'), MCP_UITROL_STATUS: join(d, 'status.json'), MCP_RELEASES_DIR: d, MCP_HEALTH_URL: 'http://127.0.0.1:1/x',
      MCP_ISSUER: 'https://mcp.tarasevych.com', MCP_APP_URL: `http://127.0.0.1:${appPoort}`, MCP_AGENTPADEN: agentpaden },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; proc.stdout.on('data', (b) => { log += b; }); proc.stderr.on('data', (b) => { log += b; });
  try {
    for (let i = 0; i < 60 && !log.includes('mijn-ruimte-mcp'); i++) await slaap(100);
    await run(poort, gezien);
  } finally {
    proc.kill('SIGTERM');
    await new Promise((r) => app.close(() => r(undefined)));
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('connector-beide-kanten-20261020');

  // ============================================================== 1. bewijs op de bron
  const deurBron = readFileSync('deploy/mcp/server.mjs', 'utf8');
  const toolsBlok = deurBron.slice(deurBron.indexOf('const TOOLS = ['), deurBron.indexOf('];', deurBron.indexOf('const TOOLS = [')));
  const deurNamen = [...toolsBlok.matchAll(/\{ name: "([a-z_]+)"/g)].map((m) => m[1]);
  check('de serverdeur heeft precies ELF hulpmiddelen — de elf die de eigenaar na 20261020-173704 in Claude zag (site_health … rollout_upload_finish)',
    deurNamen.length === 11 && deurNamen.includes('site_health') && deurNamen.includes('rollout_upload_finish') && deurNamen.includes('permission_flags'), deurNamen.join(','));
  const modal = readFileSync('src/McpToestemmingVenster.tsx', 'utf8');
  const routes = readFileSync('backend/mcp-connector-routes.ts', 'utf8');
  check('«Підписаний випуск» bestaat alleen in deurGroups van McpConsentModal, en deurGroups wordt alleen bij isDeur getoond: het geziene venster was het DEURvenster',
    (modal.match(/Підписаний випуск/g) || []).length === 1 && /const deurGroups/.test(modal) && /isDeur \? deurGroups : technisch \? technischGroups/.test(modal));
  check('consent/info zet voor een deurverzoek (rid mrd_…) soort «deur» + ruimte «technisch» (mcp-connector-routes.ts): de kop «Жодної пошти…» is RUIMTE_UITLEG.technisch van shared/ai-ruimte.ts, niet een grant',
    /soort: 'deur', ruimte: 'technisch'/.test(routes) && /Жодної пошти, Drive чи особистих пристроїв/.test(readFileSync('shared/ai-ruimte.ts', 'utf8')));
  const wizard = readFileSync('src/connector-v2/KoppelWizard.tsx', 'utf8');
  check('het v2-venster (KoppelWizard) biedt de eigenaar BEIDE kanten aan en zegt dat de technische kant alleen bestaat zolang het profiel actief is',
    /\(\['gebruiker', 'beheer'\] as Kant\[\]\)\.map/.test(wizard) && /зникнуть самі/.test(wizard) && /інструменти з’являться самі, коли ви ввімкнете технічний профіль/.test(wizard));
  check('het v2-venster start met de erfenis van /mcp als er geen v2-koppeling of onthouden keuze is', /v\.voorkeur \?\? v\.vorige \?\? v\.erfenis/.test(wizard) && /data-v2-erfenis/.test(wizard));
  check('het deurvenster zegt sinds vandaag eerlijk dat het de oude weg is en wat te doen (data-consent-deur-uitleg)', /data-consent-deur-uitleg/.test(modal) && /Через двері ніколи не приходять пошта/.test(modal));
  check('de deur stuurt agentpaden standaard door naar de app (MCP_AGENTPADEN ≠ deur) en weigert er toestemming voor (invalid_target)',
    /const AGENTPADEN_NAAR_APP = \(process\.env\.MCP_AGENTPADEN \|\| "app"\) !== "deur"/.test(deurBron) && /AGENTPADEN_NAAR_APP && AGENT_SLUGS\.test\(delen\[0\]\)\) return null/.test(deurBron));
  const start = readFileSync('server/start.ts', 'utf8');
  check('server/start.ts: GET /<agent> met text/event-stream opent de stroom, en alle RFC 8414-ontdekkingsvormen van de app-issuer horen bij de app',
    // SEC-002 (http-rand-07): de stroom krijgt nu ook het IP voor de emmer per IP — alleen de eerste drie argumenten zijn hier wezenlijk.
    // SEC-002: потік тепер отримує ще й IP (ліміт на IP) — суттєві лише перші три аргументи.
    /stroomVerzoek\(req, res, m\[1\][,)]/.test(start) && /'\/\.well-known\/openid-configuration\/oauth2': '\/api\/mcp-connector\/asm'/.test(start) && /'\/\.well-known\/oauth-authorization-server': '\/api\/mcp-connector\/asm'/.test(start));
  check('tunnelsjabloon stuurt /claude niet meer naar de deur (de regel die op de server nog stond, is de oorzaak)',
    !/\(\?i:grok\|claude\|chatgpt\|gemini\|copilot\)/.test(readFileSync('deploy/cloudflared-config.yml', 'utf8')));

  // ============================================================== 1b. puur: erfenis
  const e1 = erfenisUit([{ id: 'a', ruimte: 'prive', scopes: ['devices.read', 'board.read'] }]);
  const e2 = erfenisUit([{ id: 'a', ruimte: 'prive', scopes: ['devices.read'] }, { id: 'b', ruimte: 'technisch', scopes: ['site.read'] }]);
  const e0 = erfenisUit([]);
  check('erfenisUit: prive → gebruiker; prive + technisch → beide kanten; niets → gebruiker zonder sleutels',
    e1.kanten.join() === 'gebruiker' && e2.kanten.join() === 'beheer,gebruiker' && e0.kanten.join() === 'gebruiker' && e0.sleutels.length === 0 && e0.grants.length === 0, JSON.stringify([e1.kanten, e2.kanten]));
  check('erfenis-sleutels: een hulpmiddel met scope alleen als de scope verleend is; zonder scope (v2_whoami, get_live_release) altijd binnen zijn kant',
    e1.sleutels.includes('v2_whoami:gebruiker') && e1.sleutels.includes('machine_list:gebruiker') && !e1.sleutels.includes('mail_search_messages:gebruiker')
    && e1.sleutels.every((k) => k.endsWith(':gebruiker')) && e2.sleutels.includes('get_live_release:beheer') && e2.sleutels.includes('machine_list:gebruiker')
    && sleutelsUitScopes(['gebruiker'], ['mail.read']).includes('mail_search_messages:gebruiker'), e1.sleutels.slice(0, 12).join(','));
  // Gescheiden ruimtes (besluit eigenaar 1.11.2026): de sleutels van een kant komen alleen uit de scopes van grants van die ruimte.
  const e3 = erfenisUit([{ id: 'a', ruimte: 'prive', scopes: ['board.read'] }, { id: 'b', ruimte: 'technisch', scopes: ['devices.read'] }]);
  check('erfenis per ruimte: devices.read alleen PRIVÉ → machine_list:gebruiker, nooit machine_list:beheer (privéscope geeft geen beheersleutel)',
    !e2.sleutels.includes('machine_list:beheer') && e2.sleutels.includes('machine_list:gebruiker'), e2.sleutels.filter((k) => k.startsWith('machine_')).join(','));
  check('erfenis per ruimte: devices.read alleen TECHNISCH → machine_list:beheer, niet machine_list:gebruiker; board.read blijft privé',
    e3.sleutels.includes('machine_list:beheer') && !e3.sleutels.includes('machine_list:gebruiker') && e3.sleutels.includes('search_board:gebruiker')
    && e3.kanten.join() === 'beheer,gebruiker', e3.sleutels.filter((k) => k.startsWith('machine_')).join(','));
  check('erfenis-sleutels zijn altijd geldige, actieve catalogussleutels', e2.sleutels.every((k) => V2_OPTIES.some((o) => o.key === k && o.status === 'actief')));

  // ============================================================== 2. de deur als proces: doorsturen én de regressie
  try {
    await metDeur('app', async (poort, gezien) => {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      const r = await verzoek(poort, 'POST', '/claude', body, { authorization: 'Bearer mcpa_test', 'mcp-protocol-version': '2025-06-18' });
      const g = gezien.at(-1);
      check('POST /claude bij de deur komt één-op-één bij de app: zelfde pad, Host van de site, Authorization, MCP-koppen en body; status en koppen van de app komen terug',
        r.status === 418 && r.kop('x-nep-app') === 'ja' && json(r)?.pad === '/claude' && g?.method === 'POST' && g.url === '/claude' && g.headers.host === 'mcp.tarasevych.com'
        && g.headers.authorization === 'Bearer mcpa_test' && g.headers['mcp-protocol-version'] === '2025-06-18' && g.body === body && g.headers['x-mijn-ruimte-deur'] === 'doorgestuurd',
        `${r.status} ${r.body.slice(0, 80)} | ${JSON.stringify(g && { url: g.url, host: g.headers.host })}`);
      const hoofd = await verzoek(poort, 'POST', '/Claude?x=1', '{}');
      check('de hoofdletter uit de oude tunnelregel ((?i:claude)) wordt klein geschreven en de query blijft', hoofd.status === 418 && gezien.at(-1)?.url === '/claude?x=1', String(gezien.at(-1)?.url));
      const prm = await verzoek(poort, 'GET', '/.well-known/oauth-protected-resource/claude');
      const prmEigen = await verzoek(poort, 'GET', '/claude/.well-known/oauth-protected-resource');
      const asm = await verzoek(poort, 'GET', '/.well-known/oauth-authorization-server/oauth2');
      const asmWortel = await verzoek(poort, 'GET', '/.well-known/oauth-authorization-server');
      const oauth2 = await verzoek(poort, 'POST', '/oauth2/token', 'grant_type=x', { 'content-type': 'application/x-www-form-urlencoded' });
      const oudMcp = await verzoek(poort, 'POST', '/mcp', '{}');
      check('ook de metadata (beide vormen), de autorisatieserver van de app (issuer-vorm én wortel), /oauth2/* en /mcp gaan naar de app — de klant komt nooit meer bij de OAuth van de deur',
        [prm, prmEigen, asm, asmWortel, oauth2, oudMcp].every((x) => x.status === 418), [prm, prmEigen, asm, asmWortel, oauth2, oudMcp].map((x) => x.status).join(','));
      const gezondheid = await verzoek(poort, 'GET', '/health');
      const chatgpt = await verzoek(poort, 'POST', '/chatgpt', '{}');
      check('de deur blijft haar eigen dingen doen: /health en de resterende deur /chatgpt (geen agentadres)',
        gezondheid.status === 200 && json(gezondheid)?.service === 'mijn-ruimte-mcp' && chatgpt.status === 401 && chatgpt.kop('www-authenticate').includes('realm="mijn-ruimte"'),
        `${gezondheid.status} ${chatgpt.status} ${chatgpt.kop('www-authenticate').slice(0, 60)}`);
      const reg = json(await verzoek(poort, 'POST', '/oauth/register', JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], client_name: 'Claude' })));
      const p = pkce();
      const au = await verzoek(poort, 'GET', `/oauth/authorize?${form({ response_type: 'code', client_id: reg.client_id, redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: p.challenge, code_challenge_method: 'S256', state: 's', resource: 'https://mcp.tarasevych.com/claude' })}`);
      check('een klant die de OAuth van de deur nog onthield en resource=…/claude vraagt, krijgt invalid_target (geen deurtoken, geen deurvenster meer)',
        au.status === 302 && /error=invalid_target/.test(au.kop('location')) && !/consent=mrd_/.test(au.kop('location')), `${au.status} ${au.kop('location').slice(0, 100)}`);
    });
    await metDeur('deur', async (poort, gezien) => {
      const r = await verzoek(poort, 'POST', '/claude', '{}');
      check('REGRESSIE (MCP_AGENTPADEN=deur = het gedrag van vóór deze release): de deur bedient /claude ZELF — 401 met haar eigen realm en metadata, niets bij de app; precies de weg naar het deurvenster met elf hulpmiddelen',
        r.status === 401 && r.kop('www-authenticate').includes('realm="mijn-ruimte"') && r.kop('www-authenticate').includes('/.well-known/oauth-protected-resource/claude') && gezien.length === 0,
        `${r.status} ${r.kop('www-authenticate').slice(0, 90)} app=${gezien.length}`);
    });
  } catch (e) { check('deur als proces', false, String((e as Error)?.stack || e)); }

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN beide kanten (integratie): geen database'); return einde(); }

  // ============================================================== 3–5. op de echte app met database
  const sys = getPool('systeem');
  const dist = await mkdtemp(join(tmpdir(), 'mr-bk-dist-'));
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>spa</title>');
  const vorigeDist = process.env.DIST_DIR; process.env.DIST_DIR = dist;
  let server: http.Server | null = null;
  const clients: string[] = [];
  let eigenaarId = '';
  let eigenaarWasRol: string | null = null;
  let vorigeEigenaar: string | undefined;

  const rpc = (slug: string, token: string | undefined, msg: unknown) => v2.rpc(slug, token ? `Bearer ${token}` : undefined, JSON.stringify(msg));
  const lijst = async (slug: string, token: string) => (json(await rpc(slug, token, { jsonrpc: '2.0', id: 1, method: 'tools/list' }))?.result?.tools ?? []) as Array<{ name: string }>;
  const roep = async (slug: string, token: string, naam: string, args: Record<string, unknown> = {}) =>
    json(await rpc(slug, token, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: naam, arguments: args } }))?.result as { isError?: boolean; content: Array<{ text: string }> };

  /** OAuth-koppeling: v2 (resource = agentadres, keuze uit het venster) of het OUDE /mcp (resource = …/mcp, ruimte van de grant). */
  async function koppel(userId: string, naam: 'Claude' | 'ChatGPT', doel: { agent: 'claude' | 'gpt'; keuze: v2st.V2Keuze } | { oud: 'prive' | 'technisch' }) {
    const redirect = naam === 'Claude' ? 'https://claude.ai/api/mcp/auth_callback' : 'https://chatgpt.com/connector_platform_oauth_redirect';
    const reg = json(await c.registerClient(JSON.stringify({ client_name: naam, redirect_uris: [redirect] })));
    clients.push(reg.client_id);
    const p = pkce();
    const resource = 'agent' in doel ? agentUrl(doel.agent) : c.RESOURCE;
    const a = await c.authorize({ response_type: 'code', client_id: reg.client_id, redirect_uri: redirect, code_challenge: p.challenge, code_challenge_method: 'S256', state: 's', resource });
    const rid = new URL(kopVan(a as never, 'location')).searchParams.get('consent') || '';
    const d = 'agent' in doel ? await c.consentDecide(userId, rid, true, null, 'prive', doel.keuze) : await c.consentDecide(userId, rid, true, null, doel.oud, null);
    const code = 'redirect' in d ? new URL(d.redirect).searchParams.get('code') || '' : '';
    const t = json(await c.token(form({ grant_type: 'authorization_code', code, code_verifier: p.verifier, client_id: reg.client_id, redirect_uri: redirect })));
    const token = String(t.access_token || '');
    const grantId = token ? String((await sys.query('SELECT id::text AS id FROM app.mcp_oauth_tokens WHERE access_hash = $1', [sha256(token)])).rows[0]?.id ?? '') : '';
    return { token, grantId };
  }

  try {
    vorigeEigenaar = (await sys.query("SELECT id FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1")).rows[0]?.id as string | undefined;
    eigenaarId = vorigeEigenaar ?? `bk-eig-${randomUUID()}`;
    if (!vorigeEigenaar) {
      await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [eigenaarId, { email: `${eigenaarId}@test.invalid`, role: 'owner', status: 'approved', entitlements: ['api-platform'] }]);
    } else {
      eigenaarWasRol = (await sys.query("SELECT data->>'entitlements' AS e FROM app.records WHERE tbl='users' AND id=$1", [eigenaarId])).rows[0]?.e ?? null;
      await sys.query(`UPDATE app.records SET data = jsonb_set(data, '{entitlements}', '["api-platform"]') WHERE tbl = 'users' AND id = $1`, [eigenaarId]);
    }
    const eigenaar = { id: eigenaarId, email: `${eigenaarId}@test.invalid`, role: 'owner', status: 'approved' };
    await sys.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['eigenaar'], 480, 'test') ON CONFLICT (user_id) DO NOTHING`, [eigenaarId, `tech-${randomBytes(6).toString('hex')}`]);
    await sys.query(`INSERT INTO app.ruimte_keuze (user_id, gekozen, gekozen_door) VALUES ($1,'per_dienst',$1) ON CONFLICT (user_id) DO NOTHING`, [eigenaarId]);
    await sys.query(`INSERT INTO app.ruimte_dienst_stand (user_id, dienst, stand, vorige_stand, bevestigd_door) VALUES ($1,'ai','eigen','uit','test')
      ON CONFLICT (user_id, dienst) DO UPDATE SET stand = 'eigen', bevroren_op = NULL, bevroren_oorzaak = ''`, [eigenaarId]);
    // Schone lei: geen lopende activering, geen oude koppelingen van Claude/ChatGPT van deze eigenaar (de erfenis moet van DEZE test zijn).
    await tp.beeindigenBijIntrekken(eigenaarId, 'handmatig').catch(() => undefined);
    await sys.query("UPDATE app.mcp_oauth_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [eigenaarId]);
    await sys.query('DELETE FROM app.connector_v2_voorkeur WHERE user_id = $1', [eigenaarId]);

    // ---------------------------------------------------------------- 3. één grant, beide kanten, de staat beslist
    const alleGebruiker = V2_OPTIES.filter((o) => o.status === 'actief' && o.kant === 'gebruiker').map((o) => o.key);
    const keuze: v2st.V2Keuze = { kanten: ['beheer', 'gebruiker'], sleutels: [...alleGebruiker, 'machine_list:beheer', 'get_live_release:beheer', 'list_releases:beheer'] };
    const k = await koppel(eigenaarId, 'Claude', { agent: 'claude', keuze });
    check('toestemming met beide kanten gaf een token (profiel uit op dat moment: de grant bewaart de mogelijkheid toch)', !!k.token && !!k.grantId);
    const bewaard = await v2st.leesRechten(k.grantId);
    check('de grant bewaart BEIDE kanten en alle sleutels; «geen mail/Drive» is nooit een eigenschap van de grant',
      bewaard?.kanten.join() === 'beheer,gebruiker' && !!bewaard && bewaard.sleutels.includes('mail_search_messages:gebruiker') && bewaard.sleutels.includes('get_live_release:beheer'), JSON.stringify(bewaard?.kanten));
    const priveStaat = (await lijst('claude', k.token)).map((t) => t.name);
    check('privéstaat (profiel uit): de VOLLEDIGE privélijst — account, apparaten, mail, bord — en geen enkele _beheer-naam',
      priveStaat.includes('tonen_mijn_account_claude_ai_tarasevych_com_gebruiker') && priveStaat.includes('tonen_apparaten_claude_mcp_tarasevych_com_gebruiker')
      && priveStaat.some((n) => /_mail_/.test(n)) && !priveStaat.some((n) => n.endsWith('_beheer')) && priveStaat.length > 20, `${priveStaat.length}: ${priveStaat.slice(0, 6).join(',')}`);
    const geweigerd = await roep('claude', k.token, 'tonen_live_release_claude_admin_tarasevych_com_beheer');
    check('privéstaat: een _beheer-aanroep wordt geweigerd met TECH_PROFILE_OFF (het recht bestaat, de staat niet)', geweigerd.isError === true && /^TECH_PROFILE_OFF/.test(geweigerd.content[0].text));
    await tp.activeren(eigenaar, randomBytes(24).toString('hex'), 60, 'test: beide kanten');
    const techStaat = (await lijst('claude', k.token)).map((t) => t.name);
    check('technische staat (profiel aan): dezelfde grant toont beide sets — de privékant blijft volledig, de _beheer-namen komen erbij — zonder nieuwe toestemming',
      techStaat.includes('tonen_live_release_claude_admin_tarasevych_com_beheer') && techStaat.includes('tonen_apparaten_claude_mcp_tarasevych_com_beheer')
      && techStaat.filter((n) => n.endsWith('_gebruiker')).length === priveStaat.length, `${techStaat.length} vs ${priveStaat.length}`);
    const ik = JSON.parse((await roep('claude', k.token, 'tonen_mijn_account_claude_ai_tarasevych_com_gebruiker')).content[0].text);
    check('tonen_mijn_account: granted = beide kanten (de grant), activeNow = beide (de staat), grantedVia = deze connector',
      ik.connection.granted.join() === 'beheer,gebruiker' && ik.connection.activeNow.join() === 'gebruiker,beheer' && ik.connection.grantedVia === 'this connector', JSON.stringify(ik.connection));
    await tp.beeindigenBijIntrekken(eigenaarId, 'handmatig');
    const terug = (await lijst('claude', k.token)).map((t) => t.name);
    check('profiel weer uit: terug naar de volledige privélijst, het recht blijft in de grant (leesRechten onveranderd)',
      terug.length === priveStaat.length && !terug.some((n) => n.endsWith('_beheer')) && (await v2st.leesRechten(k.grantId))?.kanten.join() === 'beheer,gebruiker');
    const init = json(await rpc('claude', k.token, { jsonrpc: '2.0', id: 3, method: 'initialize', params: { protocolVersion: '2025-06-18' } }))?.result;
    check('initialize: tools.listChanged = true (de server meldt veranderingen over de stroom)', init?.capabilities?.tools?.listChanged === true, JSON.stringify(init?.capabilities));

    // ---------------------------------------------------------------- 4. erfenis van het oude /mcp
    await sys.query("UPDATE app.mcp_oauth_tokens SET revoked_at = now() WHERE id = $1::uuid", [k.grantId]);
    const oudPrive = await koppel(eigenaarId, 'Claude', { oud: 'prive' });
    check('oude /mcp-koppeling (ruimte prive) gelegd en werkt op /mcp zelf', !!oudPrive.token && (await c.rpcPost(`Bearer ${oudPrive.token}`, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }))).statusCode === 200);
    const viaOud = await rpc('claude', oudPrive.token, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const oudLijst = (json(viaOud)?.result?.tools ?? []).map((t: { name: string }) => t.name) as string[];
    check('het /mcp-token van Claude werkt op /claude ZONDER nieuwe toestemming: 200 en de privélijst met v2-namen (…_claude_…_gebruiker)',
      viaOud.statusCode === 200 && oudLijst.includes('tonen_mijn_account_claude_ai_tarasevych_com_gebruiker') && oudLijst.includes('tonen_apparaten_claude_mcp_tarasevych_com_gebruiker') && oudLijst.every((n) => n.endsWith('_gebruiker')),
      `${viaOud.statusCode} ${oudLijst.slice(0, 5).join(',')}`);
    check('erfenis belooft geen gevoelige scope die de oude grant niet had (mail.read staat niet in de standaard): geen mailnamen', !oudLijst.some((n) => /_mail_/.test(n)), oudLijst.filter((n) => /_mail_/.test(n)).join(','));
    const ikOud = JSON.parse((await roep('claude', oudPrive.token, 'tonen_mijn_account_claude_ai_tarasevych_com_gebruiker')).content[0].text);
    check('tonen_mijn_account via het oude token: grantedVia = legacy /mcp grant, granted = gebruiker', ikOud.connection.grantedVia === 'legacy /mcp grant (inherited)' && ikOud.connection.granted.join() === 'gebruiker', JSON.stringify(ikOud.connection));
    const apparaten = await roep('claude', oudPrive.token, 'tonen_apparaten_claude_mcp_tarasevych_com_gebruiker');
    check('tools/call via het oude token loopt door dezelfde poorten (scopes van die grant): tonen_apparaten wordt uitgevoerd, niet geweigerd', apparaten.isError !== true && !/TOEGANG_GESCHEIDEN|PERMISSION_OFF/.test(apparaten.content[0].text), apparaten.content[0].text.slice(0, 80));
    const consent = await v2.consentV2(eigenaarId, 'claude');
    check('consentV2 levert de erfenis (1 koppeling, kant gebruiker) zodat het venster ermee start', consent.erfenis?.grants === 1 && consent.erfenis.kanten.join() === 'gebruiker' && consent.erfenis.sleutels.includes('machine_list:gebruiker') && consent.vorige === null, JSON.stringify(consent.erfenis));
    // Tweede oude grant, technisch — via `koppel` een ANDERE registratie (eigen client_id). Beveiligingsreview 21.10.2026
    // (tests/eenheid/beveiliging-beoordeling-20261021.test.ts): een token erft alleen van grants van DEZELFDE registratie, want client_name
    // («Claude») kiest de klant zelf. Dit technische token heeft dus alleen de beheerkant — net als op het oude /mcp zelf.
    const oudTech = await koppel(eigenaarId, 'Claude', { oud: 'technisch' });
    const uitLijst = (await lijst('claude', oudTech.token)).map((t) => t.name);
    check('technische oude grant (andere registratie), profiel UIT: via /claude NIETS — zoals op het oude /mcp; de privékant van een andere registratie wordt niet geërfd',
      uitLijst.length === 0, `${uitLijst.length}`);
    await tp.activeren(eigenaar, randomBytes(24).toString('hex'), 60, 'test: erfenis technisch');
    const aanLijst = (await lijst('claude', oudTech.token)).map((t) => t.name);
    const aanLijstPrive = (await lijst('claude', oudPrive.token)).map((t) => t.name);
    // Beveiligingsreview 21.10.2026 (tests/eenheid/beveiliging-beoordeling-20261021.test.ts): `koppel` registreert elke keer een NIEUWE
    // client (eigen client_id). De vereniging over de NAAM («Claude») gaf het privé-token van die ANDERE registratie de beheerkant
    // van de technische — een app die zichzelf «Claude» noemt, kreeg zo technische hulpmiddelen zonder technische toestemming.
    // Nu erft een token alleen van grants van DEZELFDE registratie: het technische token ziet beide kanten, het privé-token alleen zijn eigen.
    check('profiel AAN: het technische oude token ziet op /claude zijn beheerkant; het privé-token van een ANDERE registratie erft de beheerkant NIET (en omgekeerd)',
      aanLijst.includes('tonen_live_release_claude_admin_tarasevych_com_beheer') && aanLijst.includes('tonen_apparaten_claude_mcp_tarasevych_com_beheer') && aanLijst.every((n) => n.endsWith('_beheer'))
      && !aanLijstPrive.some((n) => n.endsWith('_beheer')) && aanLijstPrive.includes('tonen_apparaten_claude_mcp_tarasevych_com_gebruiker'), `${aanLijst.filter((n) => n.endsWith('_beheer')).length}/${aanLijst.length} beheer / privé ${aanLijstPrive.filter((n) => n.endsWith('_beheer')).length}`);
    check('consentV2: de erfenis telt nu 2 koppelingen en beide kanten', (await v2.consentV2(eigenaarId, 'claude')).erfenis?.kanten.join() === 'beheer,gebruiker');
    const gpt = await koppel(eigenaarId, 'ChatGPT', { oud: 'prive' });
    const vreemd = await rpc('claude', gpt.token, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check('een /mcp-token van ChatGPT werkt NIET op /claude (401 invalid_token): de erfenis geldt alleen voor dezelfde AI-klant', vreemd.statusCode === 401 && /invalid_token/.test(String(vreemd.headers['WWW-Authenticate'])), String(vreemd.statusCode));
    check('… maar wel op /gpt, met zijn eigen erfenis', (await rpc('gpt', gpt.token, { jsonrpc: '2.0', id: 1, method: 'ping' })).statusCode === 200);
    await tp.beeindigenBijIntrekken(eigenaarId, 'handmatig');

    // ---------------------------------------------------------------- 5. list_changed over de SSE-stroom
    server = (await import('../../server/start')).createServer();
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    const poort = (server.address() as { port: number }).port;
    const zonder = await verzoek(poort, 'GET', '/claude', '', { accept: 'text/event-stream' });
    check('GET /claude (event-stream) zonder token: 401 met dezelfde metadata-pointer als POST', zonder.status === 401 && zonder.kop('www-authenticate').includes('realm="mcp-claude"'), `${zonder.status}`);
    const gewoon = await verzoek(poort, 'GET', '/claude', '', { authorization: `Bearer ${oudPrive.token}` });
    check('GET /claude zonder event-stream-Accept blijft 405 (geen sessies, geen andere GET)', gewoon.status === 405, String(gewoon.status));
    const ontvangen: string[] = [];
    let stroomStatus = 0, stroomType = '';
    const stroom = await new Promise<http.IncomingMessage>((ok, fout) => {
      const r = http.request({ host: '127.0.0.1', port: poort, method: 'GET', path: '/claude', headers: { host: 'mcp.tarasevych.com', accept: 'text/event-stream', authorization: `Bearer ${oudPrive.token}`, 'cf-connecting-ip': '198.19.7.7' } }, (res) => {
        stroomStatus = res.statusCode || 0; stroomType = String(res.headers['content-type'] || '');
        res.setEncoding('utf8'); res.on('data', (ch: string) => ontvangen.push(ch)); ok(res);
      });
      r.on('error', fout); r.end();
    });
    await slaap(300);
    check('GET /claude met token en event-stream: 200 text/event-stream, eerste commentaarregel met de ruimte van nu', stroomStatus === 200 && /text\/event-stream/.test(stroomType) && /stroom open; ruimte=prive/.test(ontvangen.join('')), `${stroomStatus} ${stroomType} ${ontvangen.join('').slice(0, 60)}`);
    await tp.activeren(eigenaar, randomBytes(24).toString('hex'), 60, 'test: list_changed aan');
    for (let i = 0; i < 40 && !ontvangen.join('').includes('list_changed'); i++) await slaap(100);
    const eerste = ontvangen.join('');
    check('technisch profiel AAN → notifications/tools/list_changed komt over de stroom (zonder dat de klant iets hoefde te doen)',
      /event: message\ndata: \{"jsonrpc":"2\.0","method":"notifications\/tools\/list_changed"\}\n\n/.test(eerste), eerste.slice(-120));
    await tp.beeindigenBijIntrekken(eigenaarId, 'handmatig');
    for (let i = 0; i < 40 && (ontvangen.join('').match(/list_changed/g) || []).length < 2; i++) await slaap(100);
    check('technisch profiel UIT → opnieuw list_changed (de lijst krimpt; de klant haalt hem opnieuw)', (ontvangen.join('').match(/list_changed/g) || []).length === 2, String((ontvangen.join('').match(/list_changed/g) || []).length));
    stroom.destroy();
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    if (server) await new Promise((r) => server!.close(() => r(undefined)));
    if (vorigeDist === undefined) delete process.env.DIST_DIR; else process.env.DIST_DIR = vorigeDist;
    await rm(dist, { recursive: true, force: true }).catch(() => undefined);
    if (clients.length) {
      await sys.query("DELETE FROM app.ai_toegang WHERE soort = 'mcp-koppeling' AND onderwerp_id IN (SELECT id::text FROM app.mcp_oauth_tokens WHERE client_id = ANY($1))", [clients]).catch(() => undefined);
      await sys.query('DELETE FROM app.connector_v2_rechten WHERE grant_id IN (SELECT id FROM app.mcp_oauth_tokens WHERE client_id = ANY($1))', [clients]).catch(() => undefined);
      await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [clients]).catch(() => undefined);
    }
    if (eigenaarId) {
      await sys.query('DELETE FROM app.ruimte_dienst_stand WHERE user_id = $1', [eigenaarId]).catch(() => undefined);
      await sys.query('DELETE FROM app.ruimte_keuze WHERE user_id = $1', [eigenaarId]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_activaties WHERE user_id = $1', [eigenaarId]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_profielen WHERE user_id = $1', [eigenaarId]).catch(() => undefined);
      await sys.query('DELETE FROM app.connector_v2_voorkeur WHERE user_id = $1', [eigenaarId]).catch(() => undefined);
      await sys.query('DELETE FROM app.audit WHERE owner_id = $1', [eigenaarId]).catch(() => undefined);
      if (eigenaarWasRol !== null) await sys.query(`UPDATE app.records SET data = jsonb_set(data, '{entitlements}', $2::jsonb) WHERE tbl = 'users' AND id = $1`, [eigenaarId, eigenaarWasRol]).catch(() => undefined);
      if (!vorigeEigenaar) await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = $1", [eigenaarId]).catch(() => undefined);
    }
  }
  await closePool();
  return einde();
}
