// MCP-connector voor Claude (claude.ai > Customize > Connectors > Add custom connector):
//   URL voor Claude:  https://mcp.tarasevych.com/mcp   (Streamable HTTP, JSON-antwoorden)
//   Inloggen:         OAuth 2.x met PKCE (S256) en dynamische clientregistratie; de gebruiker keurt Claude goed op de site
//   Hulpmiddelen:     machine_* (eigen apparaten) en github_get uit connectors-tools.ts, altijd van de ingelogde gebruiker
//
// Eisen van Claude (zie deploy/MCP-CONNECTOR.md): 401 + WWW-Authenticate met resource_metadata, `resource` gelijk aan
// de MCP-URL, S256 PKCE, redirect van een bekende AI-klant / loopback / app-schema (shared/ai-verbinding.ts; loopback zonder poort),
// token-eindpunt met application/x-www-form-urlencoded, refresh-tokens roteren, discovery/registratie/token < 10 s.
import { createHash, timingSafeEqual } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { isDuurId, klantVan, redirectPast, redirectSoort, SITE_TERUG_PAD, type DuurId } from '../shared/ai-verbinding';
import { connectGeweigerd, toolGeweigerd, type WeigerCode } from '../shared/ai-agent-bord';
import { leesGebruikerCaps, leesStaat } from './ai-site-schakelaars';
import { extraRedirects, leesDuren } from './ai-verbinding-instellingen';
import { rateLimit, type RouterResponse } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { actieDoel, actieSoort } from '../shared/mcp-acties';
import { metNamens } from './mcp-namens';
import { uitrolWeigering } from './ai-beleid';
import { randomToken, sha256 } from './connectors-crypto';
import { geefStandaard } from './ai-toegang';
import { callTool, listTools, type ToolDef } from './connectors-tools';
import { SERVICE_HOSTS } from './deployment-identity';
import * as st from './mcp-connector-store';
import { UITROL_TOOLS, UITROL_TOOL_NAMEN, UitrolFout, heeftVoorbereiderGrant, isGoedkeurPoging, voerUitrolToolUit, type Onderwerp } from './uitrol-goedkeuring';
import { RUIMTE_GESCHEIDEN, RUIMTE_INSTRUCTIES, ruimteOf, toolInRuimte, type AiRuimte } from '../shared/ai-ruimte';

export const BASE = `https://${SERVICE_HOSTS.mcp}`;
export const RESOURCE = `${BASE}/mcp`;
export const ISSUER = `${BASE}/oauth2`;
export const PRM_URL = `${BASE}/.well-known/oauth-protected-resource/mcp`;
export const SCOPE = 'machines';
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const RPC_PER_MINUTE = 120;
const MAX_RPC_BYTES = 6 * 1024 * 1024;

// ---------------- hulpfuncties ----------------

const respond = (status: number, data: unknown, headers: Record<string, string> = {}): RouterResponse => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  body: data === undefined ? '' : JSON.stringify(data),
});
const redirect = (location: string): RouterResponse => ({ statusCode: 302, headers: { Location: location, 'Cache-Control': 'no-store' }, body: '' });
const plain = (status: number, text: string): RouterResponse => ({
  statusCode: status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: text,
});
const parseUrl = (value: string): URL | null => { try { return new URL(value); } catch { return null; } };
const isLoopback = (u: URL) => u.protocol === 'http:' && LOOPBACK.has(u.hostname);

/**
 * Veilige terugkeeradressen (RFC 8252, shared/ai-verbinding.ts): https van bekende AI-klanten (claude.ai, grok.com, chatgpt.com, …),
 * loopback (Claude Code, Cursor, VS Code: http://127.0.0.1|localhost:<poort>/…), app-schema's (cursor://, vscode://, windsurf://),
 * het eigen terugkeeradres van de site (in-browser PKCE op /agents) en wat de eigenaar toevoegt in mcp-rechten.json.
 */
export const redirectUriAllowed = (uri: string): boolean => redirectSoort(uri, [`${BASE}${SITE_TERUG_PAD}`, ...extraRedirects()]) !== null;

/** Exacte overeenkomst, behalve bij loopback: daar telt de (steeds wisselende) poort niet mee (RFC 8252 §7.3). */
export const redirectMatches = (registered: string[], requested: string): boolean => redirectPast(registered, requested) && redirectUriAllowed(requested);

export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

const withRedirect = (uri: string, params: Record<string, string | null | undefined>): string => {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return u.toString();
};

// ---------------- metadata (RFC 9728 en RFC 8414) ----------------

export const protectedResourceMetadata = () => respond(200, {
  resource: RESOURCE, authorization_servers: [ISSUER], scopes_supported: [SCOPE],
  bearer_methods_supported: ['header'], resource_name: 'Mijn Ruimte',
});

export const authorizationServerMetadata = () => respond(200, {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  registration_endpoint: `${ISSUER}/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'], // Claude is een publieke client
  revocation_endpoint: `${ISSUER}/revoke`,
  revocation_endpoint_auth_methods_supported: ['none'],
  scopes_supported: [SCOPE],
});

// ---------------- dynamische clientregistratie (RFC 7591) ----------------

export async function registerClient(rawBody: string): Promise<RouterResponse> {
  let body: any;
  try { body = JSON.parse(rawBody || '{}'); } catch { return respond(400, { error: 'invalid_client_metadata', error_description: 'JSON verwacht' }); }
  const uris: unknown = body?.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 5 || !uris.every((u) => typeof u === 'string' && redirectUriAllowed(u))) {
    return respond(400, { error: 'invalid_redirect_uri', error_description: 'Alleen bekende AI-klanten (claude.ai, grok.com, chatgpt.com, …), loopback (localhost) en app-schema\'s (cursor://, vscode://); meer via oauthRedirects in mcp-rechten.json' });
  }
  const method = body?.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none') return respond(400, { error: 'invalid_client_metadata', error_description: 'Alleen token_endpoint_auth_method "none"' });
  const name = (typeof body?.client_name === 'string' && body.client_name.trim() ? body.client_name.trim() : 'Claude').slice(0, 80);

  if ((await st.countClients()) >= st.LIMITS.maxClients) {
    await st.purgeStale();
    if ((await st.countClients()) >= st.LIMITS.maxClients) return respond(503, { error: 'temporarily_unavailable' });
  }
  const clientId = `mcpc_${randomToken(18)}`;
  await st.insertClient(clientId, name, uris as string[]);
  return respond(201, {
    client_id: clientId, client_name: name, redirect_uris: uris, grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'], token_endpoint_auth_method: 'none', client_id_issued_at: Math.floor(Date.now() / 1000),
  });
}

// ---------------- autorisatie: Claude stuurt de gebruiker hierheen ----------------

export async function authorize(query: Record<string, string>): Promise<RouterResponse> {
  const client = query.client_id ? await st.getClient(query.client_id) : null;
  const redirectUri = query.redirect_uri || '';
  // Bij een onbekende client of ongeldige redirect nooit redirecten: dat zou een open redirect zijn.
  if (!client) return plain(400, 'Unknown client');
  if (!redirectUri || !redirectMatches(client.redirect_uris, redirectUri)) return plain(400, 'Invalid redirect_uri');

  const fail = (error: string, description: string) => redirect(withRedirect(redirectUri, { error, error_description: description, state: query.state }));
  if (query.response_type !== 'code') return fail('unsupported_response_type', 'response_type=code verwacht');
  if (!query.code_challenge || query.code_challenge_method !== 'S256' || !/^[A-Za-z0-9\-_]{43}$/.test(query.code_challenge)) {
    return fail('invalid_request', 'PKCE met S256 is verplicht');
  }
  // RFC 8707: de resource moet onze MCP-URL zijn (een slash aan het eind negeren we); andere hosts weigeren we.
  if (query.resource && query.resource.replace(/\/+$/, '') !== RESOURCE) return fail('invalid_target', 'Onbekende resource');

  const id = randomToken(24);
  await st.insertAuthRequest({
    id, clientId: client.client_id, redirectUri, codeChallenge: query.code_challenge,
    state: query.state ? query.state.slice(0, 512) : null, scope: SCOPE, resource: query.resource || null,
  });
  if (Math.random() < 0.05) st.purgeStale().catch(() => undefined);
  // De toestemming gebeurt in de site (bestaande aanmelding): scherm Agenten op mcp.* (privéruimte). Begon de eigenaar de koppeling
  // zelf op «Технічні підключення» (ruimte=technisch in de query, alleen een routeringshint), dan opent het venster dáár; welke
  // ruimte de verbinding echt krijgt, beslist de consent-route op de server (eigenaar + actief technisch profiel), nooit deze query.
  const scherm = query.ruimte === 'technisch' ? 'verbindingen' : 'agents';
  return redirect(`${BASE}/${scherm}?consent=${encodeURIComponent(id)}`);
}

// ---------------- toestemming (door de ingelogde gebruiker, via de UI) ----------------

export async function consentInfo(rid: string, userId?: string) {
  const a = await st.getPendingAuth(rid);
  if (!a) return null;
  const u = parseUrl(a.redirect_uri);
  const klant = klantVan(a.client_name);
  return {
    clientName: a.client_name ?? 'Claude', redirectHost: u ? (u.host || u.protocol) : '', loopback: !!u && isLoopback(u),
    redirectSoort: redirectSoort(a.redirect_uri, [`${BASE}${SITE_TERUG_PAD}`, ...extraRedirects()]),
    scope: a.scope, expiresAt: new Date(a.expires_at).getTime(), soort: 'connector' as const, klant,
    duur: userId ? (await leesDuren(userId))[klant] : '1u',
  };
}

export type ConsentResult = { redirect: string } | { error: 'EXPIRED' | 'GRANT_LIMIT' | WeigerCode };

/**
 * `ruimte` (shared/ai-ruimte.ts): in welke webruimte de mens «Дозволити» drukte. 'technisch' mag de route alleen doorgeven voor de
 * eigenaar met actief technisch profiel; de AI-klant zelf kan de ruimte nooit kiezen (zij staat niet in het OAuth-verzoek).
 */
export async function consentDecide(userId: string, rid: string, approve: boolean, duur: DuurId | null = null, ruimte: AiRuimte = 'prive'): Promise<ConsentResult> {
  const a = await st.getPendingAuth(rid);
  if (!a) return { error: 'EXPIRED' };
  if (!approve) {
    const done = await st.decideAuth(rid, userId, false, null);
    return done ? { redirect: withRedirect(a.redirect_uri, { error: 'access_denied', state: a.state }) } : { error: 'EXPIRED' };
  }
  // Стеля сайту (0043): вимкнений агент або спосіб MCP не отримує приватний дозвіл. Технічний простір цим не ріжеться.
  if (ruimteOf(ruimte) === 'prive') {
    const w = connectGeweigerd(await leesStaat(), { ruimte: 'prive', klant: klantVan(a.client_name), methode: 'mcp' });
    if (w) return { error: w.code };
  }
  if ((await st.countActiveGrants(userId)) >= st.LIMITS.maxActiveGrantsPerUser) return { error: 'GRANT_LIMIT' };
  const code = randomToken(32);
  // Duur: de keuze in het venster, anders de instelling van de gebruiker voor deze AI-klant (standaard 1 uur).
  const gekozen = isDuurId(duur) ? duur : (await leesDuren(userId))[klantVan(a.client_name)];
  const done = await st.decideAuth(rid, userId, true, sha256(code), gekozen, ruimteOf(ruimte));
  return done ? { redirect: withRedirect(a.redirect_uri, { code, state: a.state }) } : { error: 'EXPIRED' };
}

// ---------------- token-eindpunt (RFC 6749) ----------------

const tokenError = (status: number, error: string, description: string) => respond(status, { error, error_description: description }, { Pragma: 'no-cache' });

async function issue(userId: string, clientId: string, clientName: string, scope: string, duur: string | null | undefined, ruimte: unknown) {
  const access = `mcpa_${randomToken(32)}`;
  const refresh = `mcpr_${randomToken(32)}`;
  const d = isDuurId(duur) ? duur : null;
  const r = ruimteOf(ruimte);
  const grantId = await st.insertToken({ userId, clientId, clientName, scope, accessHash: sha256(access), refreshHash: sha256(refresh), duur: d, ruimte: r });
  // Gedetailleerde toegang (0043, shared/ai-toegang.ts): een nieuwe verbinding krijgt de niet-gevoelige
  // standaardscopes; gevoelig (mail, foto's) zet de mens zelf aan op de site (tabblad «Доступ ШІ»).
  await geefStandaard(userId, { soort: 'mcp-koppeling', id: grantId }, r).catch(() => undefined);
  // Journaal op /agents: «ШІ підключено» met clientnaam, scope, duur en ruimte (de toestemming zelf staat al als owner.mcp.grant.approved).
  await auditToevoegen({ ownerId: userId, actorId: userId, action: 'owner.mcp.grant.connected', type: 'ai', result: 'success', details: { grantId, clientId, clientName, scope, duur: d ?? 'standaard', ruimte: r } }).catch(() => undefined);
  return tokenResponse(access, refresh, scope, d);
}

const tokenResponse = (access: string, refresh: string, scope: string, duur: string | null | undefined) => respond(200, {
  access_token: access, token_type: 'Bearer', expires_in: st.levensduur(duur).accessSec, refresh_token: refresh, scope,
}, { Pragma: 'no-cache' });

export async function token(rawBody: string): Promise<RouterResponse> {
  // Claude stuurt application/x-www-form-urlencoded; JSON accepteren we ook (sommige clients doen dat).
  let p: URLSearchParams;
  try { p = rawBody.trim().startsWith('{') ? new URLSearchParams(Object.entries(JSON.parse(rawBody) as Record<string, unknown>).map(([k, v]): [string, string] => [k, String(v)])) : new URLSearchParams(rawBody); }
  catch { return tokenError(400, 'invalid_request', 'Ongeldige body'); }

  const clientId = p.get('client_id') || '';
  const client = clientId ? await st.getClient(clientId) : null;
  if (!client) return tokenError(401, 'invalid_client', 'Onbekende client');
  const grant = p.get('grant_type');

  if (grant === 'authorization_code') {
    const code = p.get('code') || '', verifier = p.get('code_verifier') || '', redirectUri = p.get('redirect_uri') || '';
    if (!code || !verifier) return tokenError(400, 'invalid_request', 'code en code_verifier zijn verplicht');
    // Eerst atomair verbruiken: een geraden of herhaalde code werkt nooit twee keer, ook niet met de juiste verifier.
    const row = await st.consumeCode(sha256(code));
    if (!row || row.user_id === null || row.client_id !== client.client_id || row.redirect_uri !== redirectUri || !pkceMatches(verifier, row.code_challenge)) {
      return tokenError(400, 'invalid_grant', 'Code ongeldig, verlopen of al gebruikt');
    }
    return issue(row.user_id, client.client_id, client.client_name, row.scope, row.duur, row.ruimte);
  }

  if (grant === 'refresh_token') {
    const refresh = p.get('refresh_token') || '';
    if (!refresh) return tokenError(400, 'invalid_request', 'refresh_token ontbreekt');
    const access = `mcpa_${randomToken(32)}`, newRefresh = `mcpr_${randomToken(32)}`;
    const rotated = await st.rotateRefresh(client.client_id, sha256(refresh), sha256(newRefresh), sha256(access));
    if (!rotated) {
      // Hergebruik van een geroteerd token: grant intrekken (en in het journaal, met reden).
      for (const r of await st.revokeIfReused(client.client_id, sha256(refresh))) {
        await auditToevoegen({ ownerId: r.user_id, actorId: null, action: 'owner.mcp.grant.revoked', type: 'ai', result: 'success', details: { grantId: r.id, clientName: r.client_name, reason: 'refresh_reuse' } }).catch(() => undefined);
      }
      return tokenError(400, 'invalid_grant', 'Refresh-token ongeldig of ingetrokken');
    }
    return tokenResponse(access, newRefresh, rotated.scope, rotated.duur);
  }

  return tokenError(400, 'unsupported_grant_type', 'authorization_code of refresh_token verwacht');
}

// ---------------- intrekken (RFC 7009) ----------------

/** Altijd 200 voor een bekende client, ook als het token onbekend is (RFC 7009 §2.2): zo valt niets te raden. */
export async function revoke(rawBody: string): Promise<RouterResponse> {
  const p = new URLSearchParams(rawBody);
  const client = p.get('client_id') ? await st.getClient(p.get('client_id') as string) : null;
  if (!client) return tokenError(401, 'invalid_client', 'Onbekende client');
  const value = p.get('token') || '';
  if (value && value.length <= 200) {
    for (const r of await st.revokeByToken(client.client_id, sha256(value))) {
      await auditToevoegen({ ownerId: r.user_id, actorId: null, action: 'owner.mcp.grant.revoked', type: 'ai', result: 'success', details: { grantId: r.id, clientName: r.client_name, reason: 'client' } }).catch(() => undefined);
    }
  }
  return respond(200, {});
}

// ---------------- toegangscontrole voor /mcp ----------------

export async function authenticate(authorization: string | undefined): Promise<Wie & { limietSleutel: string } | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(String(authorization || '').trim());
  if (!m || m[1].length > 200) return null;
  // «Підключити вручну»: agenttoken van de site (tvh_…, 30 dagen) als vaste Bearer voor klanten zonder OAuth in de browser.
  if (m[1].startsWith('tvh_')) {
    const tok = await agentToken(m[1]);
    if (!tok || !(await st.userMayUseConnector(tok.user_id))) return null;
    return { userId: tok.user_id, clientName: tok.name, grantId: `token:${tok.id}`, agentTokenId: tok.id, ruimte: ruimteOf(tok.ruimte), limietSleutel: `tvh:${tok.id}` };
  }
  const row = await st.findByAccessHash(sha256(m[1]));
  if (!row) return null;
  // M4: bij elke aanroep de gebruiker opnieuw controleren: goedgekeurd, niet verwijderd/met pensioen, AI niet geblokkeerd, recht 'api-platform'.
  if (!(await st.userMayUseConnector(row.user_id))) return null;
  return { userId: row.user_id, tokenId: row.id, clientName: row.client_name, ruimte: ruimteOf(row.ruimte), limietSleutel: row.id };
}

/** Agenttoken tvh_… (app.mcp_console_tokens, alleen hash): niet ingetrokken, niet verlopen; noteert het gebruik. */
export async function agentToken(token: string): Promise<{ id: string; user_id: string; name: string; role: string; ruimte: string } | null> {
  if (!/^tvh_[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { rows } = await getPool('systeem').query(
    `UPDATE app.mcp_console_tokens t SET calls = calls + 1, last_seen_at = now()
       FROM app.records r
      WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now() AND r.tbl = 'users' AND r.id = t.user_id
        AND COALESCE(r.data->>'status', '') NOT IN ('blocked', 'rejected', 'deleted') AND COALESCE((r.data->>'retiredAt')::numeric, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM app.user_ai_settings s WHERE s.user_id = t.user_id AND s.blocked_at IS NOT NULL)
      RETURNING t.id::text AS id, t.user_id, t.name, COALESCE(r.data->>'role', '') AS role, t.ruimte`, [sha256(token)]);
  return rows[0] ?? null;
}

/**
 * 401 die Claude laat inloggen. Zonder token: alleen de pointer naar de metadata. Met een ongeldig of verlopen token
 * komt er `error="invalid_token"` bij (RFC 6750); Claude ververst dan het token of start het inloggen opnieuw.
 */
export const unauthorized = (invalidToken = false): RouterResponse => respond(401, { error: invalidToken ? 'invalid_token' : 'unauthorized', error_description: 'Aanmelden via OAuth is nodig' }, {
  'WWW-Authenticate': `Bearer realm="mcp"${invalidToken ? ', error="invalid_token", error_description="The access token is invalid, expired or revoked"' : ''}, resource_metadata="${PRM_URL}", scope="${SCOPE}"`,
});

// ---------------- MCP (JSON-RPC over Streamable HTTP) ----------------

const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

// Instructies per ruimte: shared/ai-ruimte.ts (RUIMTE_INSTRUCTIES). Eén tekst voor beide zou de AI hulpmiddelen beloven die zij niet ziet.
const instructies = (ruimte: AiRuimte) => RUIMTE_INSTRUCTIES[ruimte];

const toMcpTool = (t: ToolDef) => ({
  name: t.name, ...(t.title ? { title: t.title } : {}), description: t.description, inputSchema: t.inputSchema,
  ...(t.annotations ? { annotations: t.annotations } : {}),
});

/**
 * Auditdetails van één MCP-actie: welke AI-verbinding (client + grantId = app.mcp_oauth_tokens.id), welk hulpmiddel, soort en een
 * veilige aanduiding van het doel (shared/mcp-acties.ts: pad, host+pad, repo, commando zonder geheimen — nooit inhoud).
 * Zonder deze velden zou het journaal alleen «eigenaar deed iets» kunnen tonen; nu «Claude → eigenaar: Прочитав файл …».
 */
/** Wie roept /mcp aan: een OAuth-grant (tokenId) of een agenttoken van de site (agentTokenId, grantId = token:<id>), en in welke ruimte. */
type Wie = { userId: string; clientName: string; tokenId?: string; agentTokenId?: string; grantId?: string; ruimte: AiRuimte };
const grantVan = (who: Wie) => who.grantId ?? who.tokenId;
const namensVan = (who: Wie) => ({ client: who.clientName, grantId: grantVan(who), ruimte: who.ruimte });
const werkDetails = (who: Wie, name: string, args: Record<string, unknown>) => {
  const doel = actieDoel(name, args);
  const grantId = grantVan(who);
  return { tool: name.slice(0, 80), client: String(who.clientName || '').slice(0, 80), ...(grantId ? { grantId: String(grantId) } : {}), ruimte: who.ruimte, soort: actieSoort(name), ...(doel ? { doel } : {}) };
};

/** Onderwerpen voor de grant "updates voorbereiden": eerst deze MCP-koppeling, dan het account. */
const uitrolOnderwerpen = (who: Wie): Onderwerp[] => [
  ...(who.tokenId ? [{ soort: 'mcp-koppeling' as const, id: String(who.tokenId), accountId: who.userId }] : []),
  ...(who.agentTokenId ? [{ soort: 'agenttoken' as const, id: String(who.agentTokenId), accountId: who.userId }] : []),
  { soort: 'account', id: who.userId, accountId: who.userId },
];

async function handleMessage(who: Wie, msg: any): Promise<unknown | null> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid Request');
  const id = msg.id;
  if (id === undefined) return null; // notificatie (bijv. notifications/initialized): geen antwoord

  switch (msg.method) {
    case 'initialize': {
      const wanted = String(msg.params?.protocolVersion ?? '');
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(wanted) ? wanted : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mijn-ruimte', title: 'Mijn Ruimte', version: '1.0.0' },
        instructions: instructies(who.ruimte),
      });
    }
    case 'ping': return rpcResult(id, {});
    case 'tools/list': {
      // Alleen de hulpmiddelen van de eigen ruimte (shared/ai-ruimte.ts); apparaattools filteren verder op de ruimte van het apparaat.
      // Приватне підключення додатково втрачає те, що адміністратор або сам користувач вимкнув (shared/ai-agent-bord.ts).
      let listed = (await metNamens(namensVan(who), () => listTools(who.userId, { alwaysMachine: true }))).filter((t) => toolInRuimte(t.name, who.ruimte));
      if (who.ruimte === 'prive') {
        const staat = await leesStaat();
        const klant = klantVan(who.clientName);
        const gebruiker = klant === 'overig' ? undefined : (await leesGebruikerCaps(who.userId))[klant];
        listed = listed.filter((t) => !toolGeweigerd(staat, { ruimte: 'prive', tool: t.name, klant, gebruiker }));
      }
      const tools = listed.map(toMcpTool);
      // Updates voorbereiden: alleen in de technische ruimte én met een grant van de eigenaar; goedkeuren bestaat hier niet.
      if (who.ruimte === 'technisch' && (await heeftVoorbereiderGrant(uitrolOnderwerpen(who)))) tools.push(...UITROL_TOOLS.map((t) => toMcpTool(t as unknown as ToolDef)));
      return rpcResult(id, { tools });
    }
    case 'tools/call': {
      const name = msg.params?.name;
      if (typeof name !== 'string' || !name) return rpcError(id, -32602, 'name ontbreekt');
      const args: Record<string, unknown> = msg.params?.arguments && typeof msg.params.arguments === 'object' ? msg.params.arguments : {};
      // Buiten de eigen ruimte: nooit uitvoeren, wel in het journaal (de AI probeerde iets wat de mens niet voor haar bedoelde).
      // Goedkeurpogingen vallen eronder: die krijgen hun eigen, eerlijke weigering hieronder (ALLEEN_EIGENAAR_MET_PASSKEY).
      if (!toolInRuimte(name, who.ruimte) && !isGoedkeurPoging(name)) {
        const uit = { content: [{ type: 'text' as const, text: RUIMTE_GESCHEIDEN(who.ruimte, name.slice(0, 80)) }], isError: true };
        try { await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: 'denied', details: { ...werkDetails(who, name, args), reden: 'ruimte' } }); } catch { /* audit mag niet breken */ }
        return rpcResult(id, uit);
      }
      if (who.ruimte === 'prive') {
        const staat = await leesStaat();
        const klant = klantVan(who.clientName);
        const gebruiker = klant === 'overig' ? undefined : (await leesGebruikerCaps(who.userId))[klant];
        const w = toolGeweigerd(staat, { ruimte: 'prive', tool: name, klant, gebruiker });
        if (w) {
          const tekst = `SITE_CAP: ${w.code}. This private connection cannot use "${name.slice(0, 80)}". An administrator switch or this user's own setting blocks it. Do not try another way.`;
          try { await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: 'denied', details: { ...werkDetails(who, name, args), reden: w.code } }); } catch { /* audit mag niet breken */ }
          return rpcResult(id, { content: [{ type: 'text' as const, text: tekst }], isError: true });
        }
      }
      if (UITROL_TOOL_NAMEN.has(name) || isGoedkeurPoging(name)) {
        let uit: { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
        // Ondertekend AI-beleid: «Розгортати сайт» uit voor deze AI → niets voorbereiden (goedkeuren kan hier nooit).
        const weigering = UITROL_TOOL_NAMEN.has(name) ? await uitrolWeigering({ client: who.clientName, grantId: grantVan(who) }, name) : null;
        if (weigering) uit = { content: [{ type: 'text', text: weigering }], isError: true };
        else try { uit = { content: [{ type: 'text', text: JSON.stringify(await metNamens(namensVan(who), async () => voerUitrolToolUit(uitrolOnderwerpen(who), name, args))) }] }; }
        catch (err) { uit = { content: [{ type: 'text', text: err instanceof UitrolFout ? err.code : 'UITROL_FOUT' }], isError: true }; }
        try { await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: uit.isError ? 'failure' : 'success', details: werkDetails(who, name, args) }); } catch { /* audit mag niet breken */ }
        return rpcResult(id, uit);
      }
      const result = await metNamens(namensVan(who), () => callTool(who.userId, name, args));
      try {
        await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: result.isError ? 'failure' : 'success', details: werkDetails(who, name, args) });
      } catch { /* auditfout mag het hulpmiddel niet breken */ }
      return rpcResult(id, result);
    }
    default: return rpcError(id, -32601, 'Method not found');
  }
}

export async function rpcPost(authorization: string | undefined, rawBody: string): Promise<RouterResponse> {
  const who = await authenticate(authorization);
  if (!who) return unauthorized(!!String(authorization || '').trim());
  const limit = await rateLimit(`mcp-rpc:${who.limietSleutel}`, RPC_PER_MINUTE, 60);
  if (!limit.ok) return respond(429, rpcError(null, -32000, 'Te veel verzoeken'), { 'Retry-After': String(limit.retryAfter) });
  if (Buffer.byteLength(rawBody) > MAX_RPC_BYTES) return respond(413, rpcError(null, -32600, 'Request too large'));

  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return respond(400, rpcError(null, -32700, 'Parse error')); }

  if (Array.isArray(parsed)) { // JSON-RPC batch (specificatie 2025-03-26)
    const out = (await Promise.all(parsed.map((m) => handleMessage(who, m)))).filter((r) => r !== null);
    return out.length ? respond(200, out) : respond(202, undefined);
  }
  const out = await handleMessage(who, parsed);
  return out === null ? respond(202, undefined) : respond(200, out);
}

/** Streamable HTTP: wij bieden geen SSE-stroom en geen sessies, dus GET en DELETE zijn niet toegestaan. */
export const rpcNotAllowed = (): RouterResponse => respond(405, { error: 'method_not_allowed' }, { Allow: 'POST' });

// ---------------- beheer door de gebruiker ----------------

export async function listUserGrants(userId: string) {
  return (await st.listGrants(userId)).map((g) => ({
    id: g.id, clientName: g.client_name, scope: g.scope, createdAt: new Date(g.created_at).getTime(), duur: g.duur ?? null, ruimte: ruimteOf(g.ruimte),
    lastUsedAt: g.last_used_at ? new Date(g.last_used_at).getTime() : null, expiresAt: new Date(g.refresh_expires_at).getTime(),
  }));
}
export const revokeUserGrant = (userId: string, id: string) => st.revokeGrant(userId, id);

/** Geschiedenis (90 dagen): ook ingetrokken en verlopen verbindingen, met stand. Nooit tokens of hashes. */
export async function listUserGrantHistory(userId: string) {
  const now = Date.now();
  return (await st.listGrantHistory(userId)).map((g) => {
    const revokedAt = g.revoked_at ? new Date(g.revoked_at).getTime() : null;
    const expiresAt = new Date(g.refresh_expires_at).getTime();
    return {
      id: g.id, clientId: g.client_id, clientName: g.client_name, scope: g.scope, createdAt: new Date(g.created_at).getTime(), duur: g.duur ?? null, ruimte: ruimteOf(g.ruimte),
      lastUsedAt: g.last_used_at ? new Date(g.last_used_at).getTime() : null, expiresAt, accessExpiresAt: new Date(g.access_expires_at).getTime(), revokedAt,
      status: revokedAt ? 'revoked' as const : expiresAt <= now ? 'expired' as const : 'active' as const,
    };
  });
}
