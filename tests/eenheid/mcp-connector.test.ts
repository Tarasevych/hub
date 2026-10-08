// Regressietests MCP-connector voor Claude (backend/mcp-connector.ts, migrations/0010): OAuth met PKCE, dynamische
// registratie, eenmalige codes, roterende refresh-tokens met hergebruikdetectie, intrekken, isolatie tussen gebruikers
// en het MCP-eindpunt (401-handshake, initialize, tools/list, tools/call). Tegen een wegwerp-PG, zonder netwerk.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import * as c from '../../backend/mcp-connector';
import * as st from '../../backend/mcp-connector-store';
import * as agents from '../../backend/connectors-store';
import { sha256 } from '../../backend/connectors-crypto';
import { describeTools, isOwnSiteUrl, listTools, RISKY_TOOLS } from '../../backend/connectors-tools';
import { checker } from './hulp/nep-google';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };
const body = (r: { body: string }) => (r.body ? JSON.parse(r.body) : null);
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const kop = (r: { headers: Record<string, string> }, n: string) => Object.entries(r.headers).find(([k]) => k.toLowerCase() === n)?.[1] ?? '';
const rpc = (token: string | undefined, msg: unknown) => c.rpcPost(token ? `Bearer ${token}` : undefined, JSON.stringify(msg));

export async function main(): Promise<number> {
  const { check, einde } = checker('mcp-connector');
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN mcp-connector: geen database'); return 0; }
  const sys = getPool('systeem');
  const A = `mcpc-a-${randomUUID()}`, B = `mcpc-b-${randomUUID()}`;
  const clients: string[] = [];

  async function registreer(uris: string[] = [CALLBACK]) {
    const r = await c.registerClient(JSON.stringify({ client_name: 'Claude', redirect_uris: uris, token_endpoint_auth_method: 'none' }));
    const j = body(r); if (j?.client_id) clients.push(j.client_id);
    return { r, j };
  }
  /** Volledige route: autorisatie -> toestemming -> code. */
  async function code(clientId: string, userId: string, p = pkce(), redirectUri = CALLBACK) {
    const a = await c.authorize({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, code_challenge: p.challenge, code_challenge_method: 'S256', state: 'st-1', resource: c.RESOURCE });
    const rid = new URL(kop(a, 'location')).searchParams.get('consent') || '';
    const d = await c.consentDecide(userId, rid, true);
    const url = 'redirect' in d ? new URL(d.redirect) : null;
    return { rid, p, code: url?.searchParams.get('code') || '', state: url?.searchParams.get('state'), decision: d };
  }
  async function tokens(clientId: string, userId: string) {
    const x = await code(clientId, userId);
    const r = await c.token(form({ grant_type: 'authorization_code', code: x.code, code_verifier: x.p.verifier, client_id: clientId, redirect_uri: CALLBACK }));
    return { r, j: body(r) };
  }

  // M4: de connector controleert bij elke aanroep de gebruiker (goedgekeurd + recht 'api-platform'); testgebruikers bestaan dus echt.
  for (const u of [A, B]) await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [u, { email: `${u}@test.invalid`, role: 'member', status: 'approved', entitlements: ['api-platform'] }]);

  try {
    // ---- metadata ----
    const prm = body(c.protectedResourceMetadata()), asm = body(c.authorizationServerMetadata());
    check('protected resource metadata: resource = de MCP-URL, eerste authorization server = onze issuer, scope machines',
      prm.resource === 'https://mcp.tarasevych.com/mcp' && prm.authorization_servers[0] === c.ISSUER && prm.scopes_supported[0] === 'machines', JSON.stringify(prm));
    check('authorization server metadata: S256, publieke client (none), registratie, code + refresh',
      JSON.stringify(asm.code_challenge_methods_supported) === '["S256"]' && asm.token_endpoint_auth_methods_supported[0] === 'none'
      && asm.registration_endpoint === `${c.ISSUER}/register` && asm.grant_types_supported.includes('refresh_token') && asm.issuer === c.ISSUER
      && asm.revocation_endpoint === `${c.ISSUER}/revoke`);

    // ---- redirect-regels ----
    const ok = [CALLBACK, 'http://localhost:3118/callback', 'http://127.0.0.1:8080/callback', 'http://localhost/callback'];
    const nee = ['https://evil.example/cb', 'https://claude.ai/api/mcp/auth_callback?x=1', 'https://claude.ai.evil.com/api/mcp/auth_callback', 'http://localhost/other', 'http://evil.com:80/callback', 'https://localhost/callback', 'javascript:alert(1)', ''];
    check('redirect-URI: alleen de callback van Claude en loopback /callback', ok.every(c.redirectUriAllowed) && nee.every((u) => !c.redirectUriAllowed(u)),
      JSON.stringify([ok.filter((u) => !c.redirectUriAllowed(u)), nee.filter(c.redirectUriAllowed)]));
    check('loopback: poort telt niet mee (Claude Code), host en pad wel',
      c.redirectMatches(['http://localhost/callback'], 'http://localhost:51234/callback') && !c.redirectMatches(['http://localhost/callback'], 'http://127.0.0.1:51234/callback')
      && !c.redirectMatches([CALLBACK], 'https://claude.ai/api/mcp/auth_callback/x'));
    check('PKCE-controle klopt met het voorbeeld uit RFC 7636',
      c.pkceMatches('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
      && !c.pkceMatches('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', 'x'.repeat(43)) && !c.pkceMatches('te-kort', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'));

    // ---- registratie ----
    const reg = await registreer();
    check('registratie: 201, client_id, public client', reg.r.statusCode === 201 && /^mcpc_/.test(reg.j.client_id) && reg.j.token_endpoint_auth_method === 'none');
    check('registratie: vreemde redirect, te veel URI\'s en client_secret-methode worden geweigerd',
      body(await c.registerClient(JSON.stringify({ redirect_uris: ['https://evil.example/cb'] }))).error === 'invalid_redirect_uri'
      && body(await c.registerClient(JSON.stringify({ redirect_uris: Array(6).fill(CALLBACK) }))).error === 'invalid_redirect_uri'
      && body(await c.registerClient(JSON.stringify({ redirect_uris: [CALLBACK], token_endpoint_auth_method: 'client_secret_post' }))).error === 'invalid_client_metadata'
      && (await c.registerClient('geen json')).statusCode === 400);
    const cid = reg.j.client_id as string;

    // ---- autorisatie ----
    const p0 = pkce();
    const basis = { response_type: 'code', client_id: cid, redirect_uri: CALLBACK, code_challenge: p0.challenge, code_challenge_method: 'S256', state: 'abc' };
    const onbekend = await c.authorize({ ...basis, client_id: 'mcpc_bestaat_niet' });
    const evilUri = await c.authorize({ ...basis, redirect_uri: 'https://evil.example/cb' });
    check('autorisatie: onbekende client of vreemde redirect geeft 400 en redirect NOOIT (geen open redirect)',
      onbekend.statusCode === 400 && !kop(onbekend, 'location') && evilUri.statusCode === 400 && !kop(evilUri, 'location'));
    const zonderPkce = await c.authorize({ ...basis, code_challenge: '' });
    const plainPkce = await c.authorize({ ...basis, code_challenge_method: 'plain' });
    const fouteResource = await c.authorize({ ...basis, resource: 'https://andere.example/mcp' });
    const fout = (r: any) => new URL(kop(r, 'location')).searchParams;
    check('autorisatie: zonder PKCE, met plain of een vreemde resource komt er een fout terug naar Claude (met state)',
      fout(zonderPkce).get('error') === 'invalid_request' && fout(plainPkce).get('error') === 'invalid_request'
      && fout(fouteResource).get('error') === 'invalid_target' && fout(zonderPkce).get('state') === 'abc');
    const goed = await c.authorize({ ...basis, resource: c.RESOURCE });
    const rid = new URL(kop(goed, 'location')).searchParams.get('consent') || '';
    check('autorisatie: geldig verzoek leidt naar het toestemmingsscherm op mcp.* (scherm Agenten)',
      goed.statusCode === 302 && kop(goed, 'location').startsWith('https://mcp.tarasevych.com/agents?consent=') && rid.length >= 30);
    const metSlash = await c.authorize({ ...basis, resource: `${c.RESOURCE}/` });
    check('autorisatie: een slash aan het eind van de resource wordt getolereerd (geen onnodige invalid_target)',
      metSlash.statusCode === 302 && kop(metSlash, 'location').includes('/agents?consent='));

    // ---- toestemming ----
    const info = await c.consentInfo(rid);
    check('toestemming: toont clientnaam en waar de gebruiker naartoe terugkeert', info?.clientName === 'Claude' && info.redirectHost === 'claude.ai' && info.loopback === false);
    const d1 = await c.consentDecide(A, rid, true);
    const d1b = await c.consentDecide(A, rid, true);
    check('toestemming: eenmalig; een tweede keer op hetzelfde verzoek geeft EXPIRED',
      'redirect' in d1 && new URL(d1.redirect).searchParams.get('state') === 'abc' && new URL(d1.redirect).searchParams.get('code')!.length > 30 && 'error' in d1b && d1b.error === 'EXPIRED');
    const rid2 = new URL(kop(await c.authorize({ ...basis, state: 'weiger' }), 'location')).searchParams.get('consent') || '';
    const dn = await c.consentDecide(A, rid2, false);
    check('toestemming: weigeren stuurt error=access_denied terug en geeft nooit een code',
      'redirect' in dn && new URL(dn.redirect).searchParams.get('error') === 'access_denied' && !new URL(dn.redirect).searchParams.get('code'));

    // ---- tokenuitgifte ----
    const x = await code(cid, A);
    const verkeerd = await c.token(form({ grant_type: 'authorization_code', code: x.code, code_verifier: pkce().verifier, client_id: cid, redirect_uri: CALLBACK }));
    const daarna = await c.token(form({ grant_type: 'authorization_code', code: x.code, code_verifier: x.p.verifier, client_id: cid, redirect_uri: CALLBACK }));
    check('token: verkeerde PKCE-verifier = invalid_grant en de code is daarna verbrand (ook met de juiste verifier)',
      body(verkeerd).error === 'invalid_grant' && verkeerd.statusCode === 400 && body(daarna).error === 'invalid_grant');
    const y = await code(cid, A);
    const verkeerdeUri = await c.token(form({ grant_type: 'authorization_code', code: y.code, code_verifier: y.p.verifier, client_id: cid, redirect_uri: 'https://claude.ai/api/mcp/andere' }));
    const andereClient = (await registreer()).j.client_id as string;
    const z = await code(cid, A);
    const vreemdeClient = await c.token(form({ grant_type: 'authorization_code', code: z.code, code_verifier: z.p.verifier, client_id: andereClient, redirect_uri: CALLBACK }));
    check('token: andere redirect_uri of andere client kan de code niet inwisselen; onbekende client = 401 invalid_client',
      body(verkeerdeUri).error === 'invalid_grant' && body(vreemdeClient).error === 'invalid_grant'
      && (await c.token(form({ grant_type: 'authorization_code', client_id: 'mcpc_nee', code: 'x', code_verifier: 'y' }))).statusCode === 401
      && body(await c.token(form({ grant_type: 'password', client_id: cid }))).error === 'unsupported_grant_type');

    const t1 = await tokens(cid, A);
    check('token: juiste code + verifier geeft Bearer-token, refresh-token en expires_in',
      t1.r.statusCode === 200 && t1.j.token_type === 'Bearer' && /^mcpa_/.test(t1.j.access_token) && /^mcpr_/.test(t1.j.refresh_token) && t1.j.expires_in === 3600 && t1.j.scope === 'machines'
      && kop(t1.r, 'cache-control') === 'no-store');
    const rowText = JSON.stringify((await sys.query('SELECT access_hash, refresh_hash FROM app.mcp_oauth_tokens WHERE user_id = $1', [A])).rows);
    check('tokens staan alleen als hash in de database', !rowText.includes(t1.j.access_token) && !rowText.includes(t1.j.refresh_token) && rowText.includes(sha256(t1.j.access_token)));

    // ---- MCP-eindpunt: handshake ----
    const zonder = await rpc(undefined, { jsonrpc: '2.0', id: 1, method: 'initialize' });
    check('MCP: zonder token 401 met WWW-Authenticate die naar de metadata wijst (Claude start hiermee het inloggen)',
      zonder.statusCode === 401 && kop(zonder, 'www-authenticate').includes(`resource_metadata="${c.PRM_URL}"`) && kop(zonder, 'www-authenticate').startsWith('Bearer realm="mcp"')
      && !kop(zonder, 'www-authenticate').includes('invalid_token'));
    const verzonnen = await rpc('mcpa_verzonnen', { jsonrpc: '2.0', id: 1, method: 'ping' });
    check('MCP: een verzonnen of verlopen token = 401 met error="invalid_token" (en nog steeds de metadata-pointer)',
      verzonnen.statusCode === 401 && kop(verzonnen, 'www-authenticate').includes('error="invalid_token"') && kop(verzonnen, 'www-authenticate').includes('resource_metadata='));
    const init = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-ai' } } }));
    const initOud = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }));
    check('MCP initialize: onderhandelt de versie (echo van een ondersteunde, anders de nieuwste) en meldt tools-capability',
      init.result.protocolVersion === '2025-06-18' && initOud.result.protocolVersion === '2025-11-25' && !!init.result.capabilities.tools && init.result.serverInfo.name === 'mijn-ruimte');
    const notif = await rpc(t1.j.access_token, { jsonrpc: '2.0', method: 'notifications/initialized' });
    check('MCP: een notificatie krijgt 202 zonder body; GET en DELETE zijn 405',
      notif.statusCode === 202 && notif.body === '' && c.rpcNotAllowed().statusCode === 405 && kop(c.rpcNotAllowed(), 'allow') === 'POST');
    check('MCP: ongeldige JSON = parse error -32700; onbekende methode = -32601',
      body(await rpc(t1.j.access_token, 'x')).result === undefined && (await c.rpcPost(`Bearer ${t1.j.access_token}`, '{kapot')).statusCode === 400
      && body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 3, method: 'bestaat/niet' })).error.code === -32601);

    // ---- hulpmiddelen en isolatie ----
    // Standaard staan riskante hulpmiddelen uit (B heeft niets ingesteld); gebruiker A zet ze zelf op "ask" zodat de rest van deze test ze ziet.
    const standaardLijst = await listTools(B, { alwaysMachine: true });
    check('standaard: riskante hulpmiddelen staan uit en ontbreken in de lijst (45 van 57, ook hun devtools-namen), de gebruiker kan ze zelf aanzetten',
      standaardLijst.length === 45 && RISKY_TOOLS.size === 12 && !standaardLijst.some((t) => ['click', 'fill', 'take_screenshot', 'machine_exec'].includes(t.name)), String(standaardLijst.length));
    await agents.setToolModes(A, Object.fromEntries([...RISKY_TOOLS].map((n) => [n, 'ask' as const])));
    const leeg = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 4, method: 'tools/list' }));
    check('tools/list: zonder apparaat staan alle 57 tools (9 apparaat + 6 browser_* + 15 namen naar chrome-devtools-mcp + 27 site) er toch; geen GitHub-tool zonder token',
      leeg.result.tools.length === 57 && leeg.result.tools.some((t: any) => t.name === 'take_snapshot') && !leeg.result.tools.some((t: any) => t.name === 'browser_snapshot') && !leeg.result.tools.some((t: any) => t.name === 'github_get'), leeg.result.tools.map((t: any) => t.name).join(','));
    const zonderPc = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 41, method: 'tools/call', params: { name: 'machine_read_file', arguments: { path: '.' } } }));
    check('tools/call zonder apparaat: duidelijke foutmelding (isError), geen crash', zonderPc.result?.isError === true && /No suitable device/.test(zonderPc.result.content[0].text), JSON.stringify(zonderPc.result).slice(0, 120));
    // Updates voorbereiden (passkey-goedkeuring): alleen zichtbaar met een grant voor déze koppeling; goedkeuren kan nooit.
    const koppeling = await st.findByAccessHash(sha256(t1.j.access_token));
    check('uitrol: zonder grant geen uitrol_voorstel_*-hulpmiddelen', !leeg.result.tools.some((t: any) => String(t.name).startsWith('uitrol_')));
    const grantRij = (await sys.query(`INSERT INTO app.uitrol_voorbereiders (soort, onderwerp, account_id, label, gegeven_door, verloopt_op) VALUES ('mcp-koppeling', $1, $2, 'test', 'test', now() + interval '1 day') RETURNING id`, [String(koppeling!.id), A])).rows[0].id;
    const metGrant = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 42, method: 'tools/list' })).result.tools as any[];
    const uitrolNamen = metGrant.filter((t) => String(t.name).startsWith('uitrol_')).map((t) => t.name).sort();
    check('uitrol: met grant 5 hulpmiddelen (voorbereiden + status), geen goedkeuren', uitrolNamen.join(',') === 'uitrol_voorstel_annuleren,uitrol_voorstel_begin,uitrol_voorstel_klaar,uitrol_voorstel_status,uitrol_voorstel_stuk', uitrolNamen.join(','));
    const uitrolStatus = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 43, method: 'tools/call', params: { name: 'uitrol_voorstel_status', arguments: {} } }));
    check('uitrol: status via MCP met grant', uitrolStatus.result?.isError !== true && Array.isArray(JSON.parse(uitrolStatus.result.content[0].text).voorstellen), JSON.stringify(uitrolStatus).slice(0, 200));
    const goedkeur = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 44, method: 'tools/call', params: { name: 'uitrol_voorstel_goedkeuren', arguments: { id: randomUUID() } } }));
    check('uitrol: goedkeuren via MCP altijd geweigerd (ALLEEN_EIGENAAR_MET_PASSKEY)', goedkeur.result?.isError === true && goedkeur.result.content[0].text === 'ALLEEN_EIGENAAR_MET_PASSKEY');
    await sys.query('DELETE FROM app.uitrol_voorbereiders WHERE id = $1', [grantRij]);
    const overzicht = await describeTools(A);
    const kindOf = (n: string) => overzicht.find((t) => t.name === n);
    check('beheeroverzicht: soort en goedkeuring per hulpmiddel (lezen direct; schrijven en uitvoeren na goedkeuring)',
      overzicht.length === 55 && kindOf('machine_read_file')?.kind === 'read' && kindOf('machine_read_file')?.needsApproval === false
      && kindOf('machine_write_file')?.kind === 'write' && kindOf('machine_write_file')?.needsApproval === true
      && kindOf('docker_manage_container')?.kind === 'execute' && kindOf('docker_manage_container')?.needsApproval === true
      && kindOf('system_metrics')?.readOnly === true, overzicht.map((t) => `${t.name}:${t.kind}`).join(','));
    const agentA = await agents.createAgent(A, 'pc-van-A', 'win32', sha256(randomUUID()), {});
    const agentB = await agents.createAgent(B, 'pc-van-B', 'linux', sha256(randomUUID()), {});
    const lijst = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 5, method: 'tools/list' })).result.tools as any[];
    const per = (n: string) => lijst.find((t) => t.name === n);
    check('tools/list: apparaattools met annotaties (lezen = readOnlyHint, schrijven/uitvoeren = destructiveHint) en titel',
      lijst.length === 57 && per('take_snapshot').annotations.readOnlyHint === true && per('click').annotations.destructiveHint === true && per('machine_read_file').annotations.readOnlyHint === true && per('machine_exec').annotations.destructiveHint === true
      && per('machine_write_file').annotations.readOnlyHint === false && !!per('machine_list').title && !!per('machine_list').inputSchema, lijst.map((t) => t.name).join(','));
    check('tools/list: Docker en metrics: lezen = readOnlyHint, containers beheren = destructiveHint (niet readOnly, niet idempotent)',
      per('docker_list_containers').annotations.readOnlyHint === true && per('system_metrics').annotations.readOnlyHint === true
      && per('docker_manage_container').annotations.destructiveHint === true && per('docker_manage_container').annotations.readOnlyHint === false
      && per('docker_manage_container').annotations.idempotentHint === false && per('docker_manage_container').annotations.openWorldHint === false);
    const dockerSchema = per('docker_manage_container').inputSchema;
    check('tools/list: docker_manage_container: verplichte velden, actie als enum, elke parameter beschreven, geen onbekende velden',
      dockerSchema.additionalProperties === false && JSON.stringify(dockerSchema.required) === '["container","action"]' && JSON.stringify(dockerSchema.properties.action.enum) === '["start","stop","restart"]'
      && [per('docker_manage_container'), per('docker_list_containers'), per('system_metrics')].every((t) => Object.values(t.inputSchema.properties as Record<string, any>).every((p) => typeof p.description === 'string' && p.description.length > 10)));
    const schema = per('machine_exec').inputSchema;
    check('tools/list: duidelijke schema\'s: elke parameter beschreven, verplichte velden benoemd, geen onbekende velden toegestaan',
      schema.additionalProperties === false && schema.required[0] === 'command' && Object.values(schema.properties as Record<string, any>).every((p) => typeof p.description === 'string' && p.description.length > 10)
      && /allow-list/.test(per('machine_exec').description) && /approve/.test(per('machine_write_file').description));
    const call = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'machine_list', arguments: {} } }));
    // machine_list komt sinds 0.4 ook in de untrusted()-verpakking terug: {notice, data}.
    const namen = JSON.parse(call.result.content[0].text).data.map((m: any) => m.name);
    check('tools/call: gebruiker A ziet alleen zijn eigen apparaat, nooit dat van B', JSON.stringify(namen) === '["pc-van-A"]' && !JSON.stringify(call).includes(agentB.id));
    const geenApp = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'machine_info', arguments: { machine: 'pc-van-B' } } }));
    check('tools/call: een apparaat van een andere gebruiker aanwijzen mislukt (isError), de modelinvoer bepaalt de gebruiker niet',
      geenApp.result.isError === true && !JSON.stringify(geenApp).includes('linux'));
    const slechteNaam = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'docker_manage_container', arguments: { container: 'a;b', action: 'restart' } } }));
    const optieNaam = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'docker_manage_container', arguments: { container: '-rf', action: 'stop' } } }));
    const slechteActie = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 22, method: 'tools/call', params: { name: 'docker_manage_container', arguments: { container: 'web', action: 'rm' } } }));
    const slechteVlag = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 23, method: 'tools/call', params: { name: 'docker_list_containers', arguments: { include_stopped: 'ja' } } }));
    check('docker: een ongeldige containernaam, een optie ("-rf"), een onbekende actie of een slechte vlag wordt op de server geweigerd, vóór een apparaat of goedkeuring aan te pas komt',
      slechteNaam.result.isError === true && /Invalid "container"/.test(slechteNaam.result.content[0].text) && optieNaam.result.isError === true && /Invalid "container"/.test(optieNaam.result.content[0].text)
      && slechteActie.result.isError === true && /Invalid "action"/.test(slechteActie.result.content[0].text)
      && slechteVlag.result.isError === true && /include_stopped/.test(slechteVlag.result.content[0].text));
    check('tools/call: onbekend hulpmiddel geeft een foutresultaat, geen crash', body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'rm_rf' } })).result.isError === true);
    const batch = body(await c.rpcPost(`Bearer ${t1.j.access_token}`, JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }])));
    check('MCP: een batch beantwoordt alleen de verzoeken met id', Array.isArray(batch) && batch.length === 1 && batch[0].id === 1);

    // ---- browserextensie: eigen agent met platform "browser", eigen tools, alleen eigen adressen ----
    const browserA = await agents.createAgent(A, 'browser-van-A', 'browser', sha256(randomUUID()), {}, { autoApprove: ['browser.snapshot'] });
    const browserB = await agents.createAgent(B, 'browser-van-B', 'browser', sha256(randomUUID()), {}, { autoApprove: ['browser.snapshot'] });
    check('browseragent: begint voorzichtig (alleen snapshot direct), de database accepteert de browseropdrachten',
      JSON.stringify((await agents.getAgent(A, browserA.id))?.policy.autoApprove) === '["browser.snapshot"]'
      && (await sys.query(`INSERT INTO app.agent_commands (agent_id, user_id, type) VALUES ($1, $2, 'browser.click') RETURNING id`, [browserA.id, A])).rowCount === 1);
    check('isOwnSiteUrl: alleen https op tarasevych.com en subdomeinen; geen http, geen vreemde host, geen lookalike, geen inloggegevens, geen onzin',
      isOwnSiteUrl('https://mail.tarasevych.com/') && isOwnSiteUrl('https://tarasevych.com/x?y=1') && isOwnSiteUrl('https://mcp.tarasevych.com/agents')
      && !isOwnSiteUrl('http://mail.tarasevych.com/') && !isOwnSiteUrl('https://evil.com/') && !isOwnSiteUrl('https://tarasevych.com.evil.com/')
      && !isOwnSiteUrl('https://eviltarasevych.com/') && !isOwnSiteUrl('https://user:pw@mail.tarasevych.com/') && !isOwnSiteUrl('javascript:alert(1)')
      && !isOwnSiteUrl('') && !isOwnSiteUrl(undefined) && !isOwnSiteUrl('https://mail.tarasevych.com/' + 'a'.repeat(600)));
    const bt = async (name: string, args: object, id = 60) => body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }));
    const vreemd = await bt('browser_open', { url: 'https://evil.com/' });
    const lookalike = await bt('browser_open', { url: 'https://tarasevych.com.evil.com/' });
    const slechteActieId = await bt('browser_invoke_action', { action: 'Open-Service' });
    const zonderNaam = await bt('browser_click', { name: '  ' });
    const teLang = await bt('browser_type', { name: 'Zoeken', text: 'x'.repeat(2001) });
    check('browsertools: een vreemd of nagebootst adres, een ongeldige actie-id, een lege naam of een te lange tekst worden op de server geweigerd',
      [vreemd, lookalike].every((r) => r.result.isError === true && /Invalid "url"/.test(r.result.content[0].text))
      && slechteActieId.result.isError === true && /Invalid "action"/.test(slechteActieId.result.content[0].text)
      && zonderNaam.result.isError === true && /Invalid "name"/.test(zonderNaam.result.content[0].text)
      && teLang.result.isError === true && /Invalid "text"/.test(teLang.result.content[0].text));
    const geenBrowser = await bt('browser_snapshot', {});
    check('browsertools: zonder verbonden extensie een duidelijke melding (en nooit een pc als doel)',
      geenBrowser.result.isError === true && /extension is connected/.test(geenBrowser.result.content[0].text));
    const pcAlsBrowser = await bt('machine_info', { machine: 'browser-van-A' });
    const browserVanB = await bt('browser_snapshot', { browser: 'browser-van-B' });
    check('scheiding: een pc-tool kiest nooit een browser, en een browser van een andere gebruiker is niet te bereiken',
      pcAlsBrowser.result.isError === true && /No suitable device/.test(pcAlsBrowser.result.content[0].text)
      && browserVanB.result.isError === true && !JSON.stringify(browserVanB).includes(browserB.id));
    const nieuw = [
      await bt('browser_scroll', { direction: 'sideways' }), await bt('browser_scroll', { direction: 'down', pages: 99 }),
      await bt('browser_wait_for_text', { text: '' }), await bt('browser_wait_for_text', { text: 'ok', timeout_seconds: 60 }),
      await bt('browser_history', { action: 'sideways' }), await bt('browser_select_option', { name: 'Taal' }),
      await bt('browser_press_key', { key: 'a' }), await bt('browser_press_key', { key: 'Control+C' }),
      await bt('browser_get_deep_diagnostics', { seconds: 60 }), await bt('browser_get_deep_diagnostics', { reload: 'ja' }),
    ];
    check('nieuwe browsertools: een ongeldige richting, pagina-aantal, wachttijd, actie, optie, toets of waarneemtijd wordt op de server geweigerd (alleen navigatietoetsen zijn toegestaan)',
      nieuw.every((r) => r.result.isError === true && /Invalid/.test(r.result.content[0].text)), nieuw.map((r) => r.result.content[0].text.slice(0, 40)).join(' | '));
    const bAnn = Object.fromEntries((body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 61, method: 'tools/list' })).result.tools as any[]).map((t) => [t.name, t.annotations]));
    check('browsertools (namen naar chrome-devtools-mcp): take_snapshot = readOnlyHint; navigate_page niet destructief; klikken, typen en acties destructiveHint',
      bAnn.take_snapshot.readOnlyHint === true && bAnn.navigate_page.readOnlyHint === false && bAnn.navigate_page.destructiveHint === false
      && bAnn.click.destructiveHint === true && bAnn.fill.destructiveHint === true && bAnn.hover.destructiveHint === true && bAnn.fill_form.destructiveHint === true && bAnn.browser_invoke_action.destructiveHint === true
      && bAnn.list_console_messages.readOnlyHint === true && bAnn.list_network_requests.readOnlyHint === true
      && bAnn.take_screenshot.readOnlyHint === true && bAnn.browser_get_deep_diagnostics.readOnlyHint === true && bAnn.press_key.destructiveHint === true && bAnn.browser_select_option.destructiveHint === true && bAnn.browser_scroll.destructiveHint === false);

    // ---- per gebruiker in- en uitzetten van hulpmiddelen (server-side) ----
    await agents.setDisabledTools(A, ['machine_exec', 'browser_click']);
    const naUit = (body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 62, method: 'tools/list' })).result.tools as any[]).map((t) => t.name);
    const geweigerd = await bt('machine_exec', { command: 'git' }, 63);
    const infoUit = (await describeTools(A)).filter((t) => !t.enabled).map((t) => t.name).sort().join(',');
    check('hulpmiddelen uitzetten: weg uit tools/list, aanroep geweigerd met uitleg, het beheeroverzicht toont het als uit; een andere gebruiker merkt er niets van',
      naUit.length === 55 && !naUit.includes('machine_exec') && !naUit.includes('click')
      && geweigerd.result.isError === true && /turned off by the user/.test(geweigerd.result.content[0].text)
      && infoUit === 'browser_click,machine_exec' && (await agents.getDisabledTools(B)).length === 0);
    await agents.setDisabledTools(A, []);
    await agents.setToolModes(A, Object.fromEntries([...RISKY_TOOLS].map((n) => [n, 'ask' as const]))); // terug naar de standaard maakt riskante hulpmiddelen weer uit; de test wil ze zien
    check('hulpmiddelen weer aanzetten: alles terug in de lijst', (body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 64, method: 'tools/list' })).result.tools as any[]).length === 57);
    await agents.setAgentPolicy(A, browserA.id, ['browser.snapshot', 'browser.navigate']);
    check('beleid van een browseragent: alleen van de eigen gebruiker aan te passen',
      JSON.stringify((await agents.getAgent(A, browserA.id))?.policy.autoApprove) === '["browser.navigate","browser.snapshot"]' || JSON.stringify((await agents.getAgent(A, browserA.id))?.policy.autoApprove) === '["browser.snapshot","browser.navigate"]');
    check('beleid: een andere gebruiker kan het beleid van A niet wijzigen', (await agents.setAgentPolicy(B, browserA.id, [])) === false);

    // ---- refresh met rotatie ----
    const r1 = await c.token(form({ grant_type: 'refresh_token', refresh_token: t1.j.refresh_token, client_id: cid }));
    const j1 = body(r1);
    check('refresh: geeft nieuw access- én refresh-token (rotatie); het oude access-token werkt niet meer',
      r1.statusCode === 200 && j1.refresh_token !== t1.j.refresh_token && j1.access_token !== t1.j.access_token
      && (await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 1, method: 'ping' })).statusCode === 401
      && (await rpc(j1.access_token, { jsonrpc: '2.0', id: 1, method: 'ping' })).statusCode === 200);
    const hergebruik = await c.token(form({ grant_type: 'refresh_token', refresh_token: t1.j.refresh_token, client_id: cid }));
    check('refresh: hergebruik van een al geroteerd refresh-token = invalid_grant en de hele grant wordt ingetrokken (diefstaldetectie)',
      body(hergebruik).error === 'invalid_grant' && (await rpc(j1.access_token, { jsonrpc: '2.0', id: 1, method: 'ping' })).statusCode === 401
      && body(await c.token(form({ grant_type: 'refresh_token', refresh_token: j1.refresh_token, client_id: cid }))).error === 'invalid_grant');
    check('refresh: een andere client kan een refresh-token niet gebruiken', body(await c.token(form({ grant_type: 'refresh_token', refresh_token: 'mcpr_x', client_id: andereClient }))).error === 'invalid_grant');

    // ---- verlopen en intrekken ----
    const t2 = await tokens(cid, A);
    await sys.query(`UPDATE app.mcp_oauth_tokens SET access_expires_at = now() - interval '1 minute' WHERE access_hash = $1`, [sha256(t2.j.access_token)]);
    const verlopen = await rpc(t2.j.access_token, { jsonrpc: '2.0', id: 1, method: 'ping' });
    const herstel = body(await c.token(form({ grant_type: 'refresh_token', refresh_token: t2.j.refresh_token, client_id: cid })));
    check('verlopen access-token = 401; met het refresh-token komt er een nieuw (zonder opnieuw inloggen)',
      verlopen.statusCode === 401 && (await rpc(herstel.access_token, { jsonrpc: '2.0', id: 1, method: 'ping' })).statusCode === 200);

    const grants = await c.listUserGrants(A);
    check('beheer: de gebruiker ziet zijn actieve toegang; een andere gebruiker ziet die van A niet', grants.length >= 1 && (await c.listUserGrants(B)).length === 0);
    check('beheer: intrekken van andermans toegang mislukt, van eigen toegang lukt en werkt direct',
      (await c.revokeUserGrant(B, grants[0].id)) === false && (await c.revokeUserGrant(A, grants[0].id)) === true
      && (await c.listUserGrants(A)).every((g) => g.id !== grants[0].id));
    // grants[0] is de nieuwste toegang van A: de rij van t2, waarvan `herstel` het huidige access-token is.
    check('beheer: het access-token van de ingetrokken toegang geeft direct 401', (await rpc(herstel.access_token, { jsonrpc: '2.0', id: 1, method: 'ping' })).statusCode === 401);

    // ---- intrekken (RFC 7009) en prompt-injection-grenzen ----
    const t3 = await tokens(cid, A);
    const onbekendToken = await c.revoke(form({ client_id: cid, token: 'mcpa_onbekend' }));
    const onbekendeClient = await c.revoke(form({ client_id: 'mcpc_nee', token: t3.j.access_token }));
    const vreemdeClientRevoke = await c.revoke(form({ client_id: andereClient, token: t3.j.access_token }));
    const nogGeldig = (await rpc(t3.j.access_token, { jsonrpc: '2.0', id: 1, method: 'ping' })).statusCode === 200;
    const echt = await c.revoke(form({ client_id: cid, token: t3.j.refresh_token }));
    check('intrekken (RFC 7009): onbekend token = 200, onbekende client = 401, een andere client kan het niet intrekken, het echte token wel',
      onbekendToken.statusCode === 200 && onbekendeClient.statusCode === 401 && vreemdeClientRevoke.statusCode === 200 && nogGeldig
      && echt.statusCode === 200 && (await rpc(t3.j.access_token, { jsonrpc: '2.0', id: 1, method: 'ping' })).statusCode === 401);

    const t4 = await tokens(cid, A);
    for (let i = 0; i < 20; i++) await agents.createCommand(agentA.id, A, 'fs.write', { path: `x${i}` }, 'pending_approval');
    const teVeelWachtend = body(await rpc(t4.j.access_token, { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'machine_write_file', arguments: { path: 'a', content: 'b' } } }));
    const teVeelDocker = body(await rpc(t4.j.access_token, { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'docker_manage_container', arguments: { container: 'web', action: 'restart' } } }));
    check('te veel openstaande goedkeuringen (20): schrijven, uitvoeren én containers beheren worden direct geweigerd en het model krijgt de opdracht niet opnieuw te proberen',
      teVeelWachtend.result.isError === true && /Too many actions/.test(teVeelWachtend.result.content[0].text) && /do not retry/.test(teVeelWachtend.result.content[0].text)
      && teVeelDocker.result.isError === true && /Too many actions/.test(teVeelDocker.result.content[0].text));

    // ---- limiet per gebruiker ----
    await sys.query('UPDATE app.mcp_oauth_tokens SET revoked_at = now() WHERE user_id = $1', [B]);
    for (let i = 0; i < st.LIMITS.maxActiveGrantsPerUser; i++) await tokens(cid, B);
    const teVeel = await code(cid, B);
    check('limiet: maximaal 10 actieve toegangen per gebruiker; de 11e toestemming wordt geweigerd', 'error' in teVeel.decision && teVeel.decision.error === 'GRANT_LIMIT');

    // ---- M4: status, recht en AI-blokkade bij elke aanroep; blokkeren trekt de tokens in ----
    await sys.query('UPDATE app.mcp_oauth_tokens SET revoked_at = now() WHERE user_id = $1', [A]);
    const m4 = (await tokens(cid, A)).j.access_token as string;
    const m4Msg = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
    const ok1 = (await rpc(m4, m4Msg)).statusCode;
    await sys.query("UPDATE app.records SET data = data || '{\"status\":\"blocked\"}'::jsonb WHERE tbl = 'users' AND id = $1", [A]);
    const geblokkeerd = (await rpc(m4, m4Msg)).statusCode;
    await sys.query("UPDATE app.records SET data = (data || '{\"status\":\"approved\"}'::jsonb) - 'entitlements' WHERE tbl = 'users' AND id = $1", [A]);
    const zonderRecht = (await rpc(m4, m4Msg)).statusCode;
    await sys.query("UPDATE app.records SET data = data || '{\"entitlements\":[\"api-platform\"]}'::jsonb WHERE tbl = 'users' AND id = $1", [A]);
    const terug = (await rpc(m4, m4Msg)).statusCode;
    const { blockUser, unblockUser } = await import('../../backend/ai-grants');
    const blok = await blockUser(A, 'test', 'test');
    const naBlok = (await rpc(m4, m4Msg)).statusCode;
    const ingetrokken = (await sys.query('SELECT count(*)::int AS n FROM app.mcp_oauth_tokens WHERE user_id = $1 AND revoked_at IS NULL', [A])).rows[0].n;
    await unblockUser(A, 'test');
    check('M4: geblokkeerd account of zonder recht api-platform = 401; AI-blokkade trekt de OAuth-tokens in (ook na deblokkeren blijven ze ongeldig)',
      ok1 === 200 && geblokkeerd === 401 && zonderRecht === 401 && terug === 200 && blok.mcpTokens >= 1 && naBlok === 401 && ingetrokken === 0 && (await rpc(m4, m4Msg)).statusCode === 401);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    if (clients.length) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [clients]);
    await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1)', [[A, B]]);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [[A, B]]);
    await sys.query('DELETE FROM app.user_ai_settings WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
  }
  await closePool();
  return einde();
}
