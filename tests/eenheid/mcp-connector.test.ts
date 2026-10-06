// Regressietests MCP-connector voor Claude (backend/mcp-connector.ts, migrations/0010): OAuth met PKCE, dynamische
// registratie, eenmalige codes, roterende refresh-tokens met hergebruikdetectie, intrekken, isolatie tussen gebruikers
// en het MCP-eindpunt (401-handshake, initialize, tools/list, tools/call). Tegen een wegwerp-PG, zonder netwerk.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import * as c from '../../backend/mcp-connector';
import * as st from '../../backend/mcp-connector-store';
import * as agents from '../../backend/connectors-store';
import { sha256 } from '../../backend/connectors-crypto';
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
    const leeg = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 4, method: 'tools/list' }));
    check('tools/list: zonder apparaat of GitHub-token geen hulpmiddelen', leeg.result.tools.length === 0);
    const agentA = await agents.createAgent(A, 'pc-van-A', 'win32', sha256(randomUUID()), {});
    const agentB = await agents.createAgent(B, 'pc-van-B', 'linux', sha256(randomUUID()), {});
    const lijst = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 5, method: 'tools/list' })).result.tools as any[];
    const per = (n: string) => lijst.find((t) => t.name === n);
    check('tools/list: apparaattools met annotaties (lezen = readOnlyHint, schrijven/uitvoeren = destructiveHint) en titel',
      lijst.length === 6 && per('machine_read_file').annotations.readOnlyHint === true && per('machine_exec').annotations.destructiveHint === true
      && per('machine_write_file').annotations.readOnlyHint === false && !!per('machine_list').title && !!per('machine_list').inputSchema, lijst.map((t) => t.name).join(','));
    const schema = per('machine_exec').inputSchema;
    check('tools/list: duidelijke schema\'s: elke parameter beschreven, verplichte velden benoemd, geen onbekende velden toegestaan',
      schema.additionalProperties === false && schema.required[0] === 'command' && Object.values(schema.properties as Record<string, any>).every((p) => typeof p.description === 'string' && p.description.length > 10)
      && /allow-list/.test(per('machine_exec').description) && /approve/.test(per('machine_write_file').description));
    const call = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'machine_list', arguments: {} } }));
    const namen = JSON.parse(call.result.content[0].text).map((m: any) => m.name);
    check('tools/call: gebruiker A ziet alleen zijn eigen apparaat, nooit dat van B', JSON.stringify(namen) === '["pc-van-A"]' && !JSON.stringify(call).includes(agentB.id));
    const geenApp = body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'machine_info', arguments: { machine: 'pc-van-B' } } }));
    check('tools/call: een apparaat van een andere gebruiker aanwijzen mislukt (isError), de modelinvoer bepaalt de gebruiker niet',
      geenApp.result.isError === true && !JSON.stringify(geenApp).includes('linux'));
    check('tools/call: onbekend hulpmiddel geeft een foutresultaat, geen crash', body(await rpc(t1.j.access_token, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'rm_rf' } })).result.isError === true);
    const batch = body(await c.rpcPost(`Bearer ${t1.j.access_token}`, JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }])));
    check('MCP: een batch beantwoordt alleen de verzoeken met id', Array.isArray(batch) && batch.length === 1 && batch[0].id === 1);

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
    check('te veel openstaande goedkeuringen (20): schrijven/uitvoeren wordt direct geweigerd en het model krijgt de opdracht niet opnieuw te proberen',
      teVeelWachtend.result.isError === true && /Too many actions/.test(teVeelWachtend.result.content[0].text) && /do not retry/.test(teVeelWachtend.result.content[0].text));

    // ---- limiet per gebruiker ----
    await sys.query('UPDATE app.mcp_oauth_tokens SET revoked_at = now() WHERE user_id = $1', [B]);
    for (let i = 0; i < st.LIMITS.maxActiveGrantsPerUser; i++) await tokens(cid, B);
    const teVeel = await code(cid, B);
    check('limiet: maximaal 10 actieve toegangen per gebruiker; de 11e toestemming wordt geweigerd', 'error' in teVeel.decision && teVeel.decision.error === 'GRANT_LIMIT');
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    if (clients.length) await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)', [clients]);
    await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1)', [[A, B]]);
  }
  await closePool();
  return einde();
}
