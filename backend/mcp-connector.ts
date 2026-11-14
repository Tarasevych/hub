// MCP-connector voor Claude (claude.ai > Customize > Connectors > Add custom connector):
//   URL voor Claude:  https://mcp.tarasevych.com/mcp   (Streamable HTTP, JSON-antwoorden)
//   Inloggen:         OAuth 2.x met PKCE (S256) en dynamische clientregistratie; de gebruiker keurt Claude goed op de site
//   Hulpmiddelen:     machine_* (eigen apparaten) en github_get uit connectors-hulpmiddelen.ts, altijd van de ingelogde gebruiker
//
// Eisen van Claude (zie deploy/MCP-CONNECTOR.md): 401 + WWW-Authenticate met resource_metadata, `resource` gelijk aan
// de MCP-URL, S256 PKCE, redirect van een bekende AI-klant / loopback / app-schema (shared/ai-verbinding.ts; loopback zonder poort),
// token-eindpunt met application/x-www-form-urlencoded, refresh-tokens roteren, discovery/registratie/token < 10 s.
import { createHash, timingSafeEqual } from 'node:crypto';
import { grantOpenen, grantRoteren, grantSluiten, grantVerzegelen } from './sleutelkluis';
import { getPool } from '../server/platform/pg';
import { sessieGeverifieerd, zetGebruiker } from '../server/platform/context';
import { gereserveerdeKlantNaam, isDuurId, klantVan, redirectPast, redirectSoort, SITE_TERUG_PAD, type DuurId } from '../shared/ai-verbinding';
import { connectGeweigerd, toolGeweigerd, verbindingGeweigerd, type WeigerCode } from '../shared/ai-agent-bord';
import { leesGebruikerCaps, leesStaat } from './ai-site-schakelaars';
import { extraRedirects, leesDuren } from './ai-verbinding-instellingen';
import { rateLimit, type RouterResponse } from '../server/platform';
import { limietSleutel } from '../shared/ip-limiet';
import { bindingKlopt, nieuweBinding } from './mcp-oauth-binding';
import { auditToevoegen } from '../server/platform/audit';
import { actieDoel, actieSoort, foutCodeUit } from '../shared/mcp-acties';
import { metNamens } from './mcp-namens';
import { uitrolWeigering } from './ai-beleid';
import { randomToken, sha256 } from './connectors-crypto';
import { geefVoorNieuweKoppeling } from './ai-toegang';
import { meldLijstGewijzigd, sluitStromenVan } from './connector-v2-stroom';
import { callTool, listTools, resolveAlias, taalVanGebruiker, V2_ALLEEN, vertaal, type ToolDef } from './connectors-hulpmiddelen';
import type { ToolTaal } from '../shared/hulpmiddel-teksten';
import { SERVICE_HOSTS } from './deployment-identiteit';
import * as st from './mcp-connector-opslag';
import { CimdFoutmelding, cimdAan, cimdKlant, isCimdClientId, type Ophaler } from './mcp-cimd';
import { eenKeerPer } from './beheer-journaal';
import { UITROL_TOOLS, UITROL_TOOL_NAMEN, UitrolFout, heeftVoorbereiderGrant, isGoedkeurPoging, voerUitrolToolUit, type Onderwerp } from './uitrol-goedkeuring';
import { BEHEER_ALLEEN_V2, BEHEER_TOOL_NAMEN, voerBeheerToolUit } from './ai-beheer-hulpmiddelen';
import { DEV_MG_ALLEEN_V2, isDevMgTool } from '../shared/dev-media-github';
import { isBrowserToolNaam, RUIMTE_GESCHEIDEN, RUIMTE_INSTRUCTIES, TECH_NU_UIT_INSTRUCTIE, TECH_PROFIEL_UIT, ruimteOf, toolInRuimte, type AiRuimte } from '../shared/ai-ruimte';
import { aiDienstStand, aiPoortNu } from './ai-ruimte-poort';
import { listAgents } from './connectors-opslag';
import { redirectPastBijAgent, slugUitResource, V2_AGENTEN, type AgentSlug } from '../shared/connector-v2/agenten';
import { naUitgifte, type V2Keuze } from './connector-v2-opslag';
import { pakketToegestaan, pakketUitvoeren } from './mcp-pakket'; // SEC-002 (ai-mcp-08)
import { MCP_MODERNE_VERSIE, bouwRegistryServerJson, bouwServerCard, controleerModerneMeta, omhulModernResultaat } from '../shared/mcp-protocol-2026-model';
import { behandelMcpProtocolMethode, bouwCapabilitiesBlock } from './mcp-protocol-2026';

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
  headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), 'Cache-Control': 'no-store', ...headers },
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
  // MCP-001 R1 · RFC 9207: elke terugkeer naar de klant (code én fout) draagt `iss`; de klant MOET het vergelijken (mix-up-aanvallen).
  authorization_response_iss_parameter_supported: true,
  // MCP-001 R1 · CIMD (SEP-991): client_id mag een https-adres van een metadatadocument zijn (zie backend/mcp-cimd.ts).
  ...(cimdAan() ? { client_id_metadata_document_supported: true } : {}),
});

export const serverCardMetadata = () => respond(200, bouwServerCard(BASE));
export const registryServerMetadata = () => respond(200, bouwRegistryServerJson(BASE));

// ---------------- dynamische clientregistratie (RFC 7591) ----------------

const eigenaarVanUri = (rawUri: string) => {
  const u = parseUrl(rawUri);
  if (!u) return undefined;
  const schema = u.protocol.replace(/:$/, '');
  const host = u.hostname.toLowerCase();
  return V2_AGENTEN.find((a) => (schema === 'https' && a.webHosts.some((w) => host === w || host.endsWith(`.${w}`))) || a.appSchemas.includes(schema));
};

// SEC-002 (slot m): gereserveerde namen (g10a-4) — één plek in shared/ai-verbinding.ts voor DCR, CIMD en aanvragerNu.
export { GERESERVEERDE_NAAM, gereserveerdeKlantNaam } from '../shared/ai-verbinding';

/**
 * SEC-001-10: als een redirect_uri bij een specifieke AI-aanbieder hoort (bv. grok.com of cursor://), mag client_name geen andere
 * aanbieder claimen. Gedeeld door DCR (registerClient) en CIMD (MCP-001 R1). null = goed.
 */
export function klantNaamFout(name: string, uris: string[]): string | null {
  // SEC-002 (slot m, MR-2/MRG-01): de gereserveerde namen (g10a-4) gelden ook voor CIMD — valideerCimd gebruikt deze functie als naamFout.
  if (gereserveerdeKlantNaam(name)) return 'client_name is gereserveerd';
  const beweerdeKlant = klantVan(name);
  if (beweerdeKlant === 'overig') return null;
  for (const rawUri of uris) {
    const eigenaar = eigenaarVanUri(rawUri);
    if (eigenaar && eigenaar.klant !== beweerdeKlant) return 'client_name past niet bij redirect_uris';
  }
  return null;
}

// SEC-002 (slot m, MR-4): hoogstens zoveel CIMD-ophalingen tegelijk per IP (/64); het procesbrede plafond staat in mcp-cimd.ts.
const CIMD_PER_IP_TEGELIJK = 2;
const cimdPerIp = new Map<string, number>();

/**
 * Klant bij een client_id: een mcpc_…-id uit DCR (database) of — MCP-001 R1 — een CIMD-adres (https://…): document ophalen,
 * controleren (backend/mcp-cimd.ts) en in dezelfde tabel bewaren, zodat token, verversen, intrekken en de lijst van verbindingen
 * precies zo werken als bij DCR. Een fout geeft { fout } (nooit een omleiding: de redirect_uri is dan niet gecontroleerd).
 */
export async function klantVoorId(clientId: string, ip = '', ophaler?: Ophaler): Promise<{ client_id: string; client_name: string; redirect_uris: string[] } | { fout: string } | null> {
  if (!clientId) return null;
  if (!isCimdClientId(clientId)) return st.getClient(clientId);
  const ipSleutel = ip ? limietSleutel(ip) : '';
  let geteld = false;
  try {
    // SEC-002 (slot m, MR-3/MRG-02/NET-3): een NIEUW documentadres is een nieuwe rij in app.mcp_oauth_clients — dezelfde grenzen als
    // DCR (registerClient): plafond per IP (/64) per etmaal en het totale plafond maxClients (eerst verdringen, dan pas weigeren).
    // Dit gebeurt VÓÓR het ophalen, zodat ook het uitgaande verkeer begrensd is. Een bestaande rij (al eens goedgekeurd) telt niet.
    const bestaand = await st.getClient(clientId);
    // SEC-002 (slot m2, MR-4): controle én ophogen van de teller per IP in één synchrone stap (geen await ertussen), vóór de
    // eerste await van de grenscontroles (daglimiet, maxClients) en vóór het ophalen. Anders komen
    // gelijktijdige authorize-verzoeken van één IP allemaal langs de controle voordat er één de teller verhoogt (wedloop).
    // De finally hieronder verlaagt de teller weer, ook bij een weigering door de daglimiet of maxClients.
    if (ipSleutel) {
      if (!bestaand && (cimdPerIp.get(ipSleutel) ?? 0) >= CIMD_PER_IP_TEGELIJK) throw new CimdFoutmelding('CIMD_LIMIET', 'te veel gelijktijdige ophalingen vanaf dit adres');
      cimdPerIp.set(ipSleutel, (cimdPerIp.get(ipSleutel) ?? 0) + 1); geteld = true;
    }
    if (!bestaand) {
      if (ipSleutel) {
        const dag = await rateLimit(`mcp-register-dag:${ipSleutel}`, st.LIMITS.maxRegistratiesPerIpPerDag, 86400, { failClosed: true });
        if (!dag.ok) throw new CimdFoutmelding('CIMD_LIMIET', 'te veel registraties vanaf dit adres');
      }
      if ((await st.countClients()) >= st.LIMITS.maxClients) {
        await st.purgeStale({ vol: true });
        if ((await st.countClients()) >= st.LIMITS.maxClients) throw new CimdFoutmelding('CIMD_VOL');
      }
    }
    // SEC-002 (slot m2): een bekende klant (rij in de tabel) valt bij een vol procesplafond terug op een verlopen cachewaarde
    // (zie CimdRegels.verouderdBijDrukte); een nieuwe klant krijgt dan CIMD_BEZET. Gebruik van zo'n waarde gaat naar het logboek.
    let verouderd = false;
    const k = await cimdKlant(clientId, { redirectToegestaan: redirectUriAllowed, naamFout: klantNaamFout, verouderdBijDrukte: !!bestaand, bijVerouderd: () => { verouderd = true; } }, ophaler);
    if (verouderd && eenKeerPer(`mcp.cimd:verouderd:${clientId.slice(0, 200)}`)) {
      await auditToevoegen({ ownerId: null, actorId: null, action: 'owner.mcp.cimd.verouderd', type: 'ai', result: 'success', service: 'mcp', details: { client: clientId.slice(0, 200), reden: 'plafond vol: verlopen cachewaarde van een bekende klant gebruikt' } }).catch(() => undefined);
    }
    // Alleen schrijven als er iets veranderd is (niet bij elke authorize een UPDATE).
    const zelfde = bestaand && bestaand.client_name === k.client_name && JSON.stringify(bestaand.redirect_uris ?? []) === JSON.stringify(k.redirect_uris);
    if (!zelfde) await st.upsertClient(k.client_id, k.client_name, k.redirect_uris);
    return k;
  } catch (e) {
    const code = e instanceof CimdFoutmelding ? e.code : 'CIMD_NETWERK';
    // Gedempt per adres: een aanvaller die steeds hetzelfde slechte document aanbiedt, vult het logboek niet.
    // Grensweigeringen gedempt per IP (/64) — anders schrijft elk nieuw adres van een aanvaller een eigen regel.
    const dempSleutel = code === 'CIMD_LIMIET' || code === 'CIMD_BEZET' || code === 'CIMD_VOL' ?`mcp.cimd:${code}:${ipSleutel || '-'}` : `mcp.cimd:${clientId.slice(0, 200)}:${code}`;
    if (eenKeerPer(dempSleutel)) await auditToevoegen({ ownerId: null, actorId: null, action: 'owner.mcp.cimd.denied', type: 'ai', result: 'denied', service: 'mcp', details: { client: clientId.slice(0, 200), code, reden: String((e as Error).message).slice(0, 200) } }).catch(() => undefined);
    return { fout: code };
  } finally {
    if (geteld) { const n = (cimdPerIp.get(ipSleutel) ?? 1) - 1; if (n <= 0) cimdPerIp.delete(ipSleutel); else cimdPerIp.set(ipSleutel, n); }
  }
}

export async function registerClient(rawBody: string, ip = ''): Promise<RouterResponse> {
  let body: any;
  try { body = JSON.parse(rawBody || '{}'); } catch { return respond(400, { error: 'invalid_client_metadata', error_description: 'JSON verwacht' }); }
  const uris: unknown = body?.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 5 || !uris.every((u) => typeof u === 'string' && redirectUriAllowed(u))) {
    return respond(400, { error: 'invalid_redirect_uri', error_description: 'Alleen bekende AI-klanten (claude.ai, grok.com, chatgpt.com, …), loopback (localhost) en app-schema\'s (cursor://, vscode://); meer via oauthRedirects in mcp-rechten.json' });
  }
  const method = body?.token_endpoint_auth_method;
  if (method !== undefined && method !== 'none') return respond(400, { error: 'invalid_client_metadata', error_description: 'Alleen token_endpoint_auth_method "none"' });
  const eersteEigenaar = (uris as string[]).map(eigenaarVanUri).find(Boolean);
  const opgegevenNaam = typeof body?.client_name === 'string' && body.client_name.trim() ? body.client_name.trim() : '';
  // SEC-002 (g10a-4, afwerking A): gereserveerde namen — «site:…» (zo heet de site zelf als aanvrager), «?» (onbekende klant) en
  // namen die zich als de site of de gebruiker voordoen — al bij de registratie weigeren (aanvragerNu neutraliseert ze ook nog).
  if (opgegevenNaam && gereserveerdeKlantNaam(opgegevenNaam)) {
    return respond(400, { error: 'invalid_client_metadata', error_description: 'client_name is gereserveerd' });
  }
  const name = (opgegevenNaam || eersteEigenaar?.naam || 'Claude').slice(0, 80);
  if (opgegevenNaam) {
    const nf = klantNaamFout(name, uris as string[]);
    if (nf) return respond(400, { error: 'invalid_client_metadata', error_description: nf });
  }

  // SEC-002 (ai-mcp-10): naast 20/min ook een plafond per IP (/64) per etmaal, en bij een vol plafond verdringen we de oudste
  // registraties zonder verbinding en zonder lopend verzoek (st.purgeStale({ vol: true })) in plaats van iedereen 503 te geven.
  if (ip) {
    const dag = await rateLimit(`mcp-register-dag:${limietSleutel(ip)}`, st.LIMITS.maxRegistratiesPerIpPerDag, 86400, { failClosed: true });
    if (!dag.ok) return respond(429, { error: 'temporarily_unavailable', error_description: 'Te veel registraties vanaf dit adres' }, { 'Retry-After': String(dag.retryAfter) });
  }
  if ((await st.countClients()) >= st.LIMITS.maxClients) {
    await st.purgeStale({ vol: true });
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

export async function authorize(query: Record<string, string>, ip = ''): Promise<RouterResponse> {
  const gevonden = await klantVoorId(query.client_id || '', ip);
  const redirectUri = query.redirect_uri || '';
  // Bij een onbekende client of ongeldige redirect nooit redirecten: dat zou een open redirect zijn.
  // SEC-002 (slot m): grensweigeringen eerlijk benoemen (tweetalig, met wat te doen), net als DCR (429/503).
  if (gevonden && 'fout' in gevonden && gevonden.fout === 'CIMD_LIMIET') return plain(429, 'Забагато нових підключень ШІ з цієї адреси. Спробуйте пізніше. · Te veel nieuwe AI-koppelingen vanaf dit adres. Probeer het later opnieuw. (CIMD_LIMIET)');
  // SEC-002 (slot m2): het procesbrede plafond is geen grens van «dit adres» — de server zelf is bezet.
  if (gevonden && 'fout' in gevonden && gevonden.fout === 'CIMD_BEZET') return plain(503, 'Сервер зараз зайнятий: забагато одночасних перевірок підключень ШІ. Спробуйте ще раз за хвилину. · De server is nu bezet: te veel AI-koppelingen tegelijk in controle. Probeer het over een minuut opnieuw. (CIMD_BEZET)');
  if (gevonden && 'fout' in gevonden && gevonden.fout === 'CIMD_VOL') return plain(503, 'Зараз забагато зареєстрованих клієнтів ШІ. Спробуйте за кілька хвилин. · Er zijn nu te veel geregistreerde AI-klanten. Probeer het over een paar minuten opnieuw. (CIMD_VOL)');
  if (gevonden && 'fout' in gevonden) return plain(400, `Unknown client (${gevonden.fout})`);
  const client = gevonden;
  if (!client) return plain(400, 'Unknown client');
  if (!redirectUri || !redirectMatches(client.redirect_uris, redirectUri)) return plain(400, 'Invalid redirect_uri');

  const fail = (error: string, description: string) => redirect(withRedirect(redirectUri, { error, error_description: description, state: query.state, iss: ISSUER }));
  if (query.response_type !== 'code') return fail('unsupported_response_type', 'response_type=code verwacht');
  if (!query.code_challenge || query.code_challenge_method !== 'S256' || !/^[A-Za-z0-9\-_]{43}$/.test(query.code_challenge)) {
    return fail('invalid_request', 'PKCE met S256 is verplicht');
  }
  // RFC 8707: de resource moet onze MCP-URL zijn (een slash aan het eind negeren we) of het eigen adres van een agent (connector v2,
  // shared/connector-v2/agenten.ts); andere hosts weigeren we. Bij v2 moet het terugkeeradres bij díe agent horen: claude.ai kan zich
  // niet op /grok aanmelden (het eigen terugkeeradres van de site en de extra adressen van de eigenaar mogen altijd).
  const agent: AgentSlug | null = slugUitResource(query.resource);
  if (query.resource && !agent && query.resource.replace(/\/+$/, '') !== RESOURCE) return fail('invalid_target', 'Onbekende resource');
  if (agent && !redirectPastBijAgent(agent, redirectUri, [`${BASE}${SITE_TERUG_PAD}`, ...extraRedirects()])) {
    return fail('invalid_target', `Dit adres is alleen voor ${agent}; gebruik het connectoradres van uw eigen AI`);
  }

  const id = randomToken(24);
  // SEC-002 (ai-mcp-14): het verzoek hoort bij DEZE browser (cookie; backend/mcp-oauth-binding.ts). Zie consentBindingKlopt.
  const binding = nieuweBinding(id);
  await st.insertAuthRequest({
    id, clientId: client.client_id, redirectUri, codeChallenge: query.code_challenge,
    state: query.state ? query.state.slice(0, 512) : null, scope: SCOPE, resource: query.resource || null, agent, bindingHash: binding.hash,
  });
  if (Math.random() < 0.05) st.purgeStale().catch(() => undefined);
  // De toestemming gebeurt in de site (bestaande aanmelding): één adres, de hub «Підключення ШІ» op mcp.*/agents.
  // 20.10.2026: GEEN tweede scherm meer voor `ruimte=technisch`. Dat stuurde naar /verbindingen, en dat adres is sinds de hub geen
  // pagina meer (het is de tab «Технічне»); daardoor liep het toestemmingsvenster rond. Het venster zelf kent de technische
  // ruimte nu uit de LEVENDE staat van het technische profiel (src/McpToestemmingVenster.tsx), en de consent-route controleert ze
  // opnieuw op de server (eigenaar + actieve activering). Een hint in de query van de AI-klant is daar niet meer voor nodig.
  const naar = redirect(`${BASE}/agents?consent=${encodeURIComponent(id)}`);
  return { ...naar, headers: { ...naar.headers, 'Set-Cookie': binding.setCookie } };
}

// ---------------- toestemming (door de ingelogde gebruiker, via de UI) ----------------

/**
 * SEC-002 (ai-mcp-14): komt «Дозволити» uit de browser die de autorisatie begon? Onbekend/verlopen verzoek → true (de gewone
 * routes geven daar zelf CONSENT_EXPIRED); verzoek zonder binding (van vóór migratie 0262) → true.
 */
export async function consentBindingKlopt(rid: string, cookieKop: unknown): Promise<boolean> {
  const a = await st.getPendingAuth(rid);
  return !a || bindingKlopt(rid, a.binding_hash ?? null, cookieKop);
}

export async function consentInfo(rid: string, userId?: string) {
  const a = await st.getPendingAuth(rid);
  if (!a) return null;
  const u = parseUrl(a.redirect_uri);
  const klant = klantVan(a.client_name);
  return {
    // SEC-002 (ai-mcp-14): ook het VOLLEDIGE terugkeeradres, zodat het venster meer kan tonen dan alleen de host.
    clientName: a.client_name ?? 'Claude', redirectHost: u ? (u.host || u.protocol) : '', redirectAdres: String(a.redirect_uri || '').slice(0, 300), loopback: !!u && isLoopback(u),
    redirectSoort: redirectSoort(a.redirect_uri, [`${BASE}${SITE_TERUG_PAD}`, ...extraRedirects()]),
    scope: a.scope, expiresAt: new Date(a.expires_at).getTime(), soort: 'connector' as const, klant, agent: (a.agent ?? null) as AgentSlug | null,
    duur: userId ? (await leesDuren(userId))[klant] : '1u',
  };
}

export type ConsentResult = { redirect: string } | { error: 'EXPIRED' | 'GRANT_LIMIT' | WeigerCode };

/**
 * `ruimte` (shared/ai-ruimte.ts): in welke webruimte de mens «Дозволити» drukte. 'technisch' mag de route alleen doorgeven voor de
 * eigenaar met actief technisch profiel; de AI-klant zelf kan de ruimte nooit kiezen (zij staat niet in het OAuth-verzoek).
 */
export async function consentDecide(userId: string, rid: string, approve: boolean, duur: DuurId | null = null, ruimte: AiRuimte = 'prive', v2: V2Keuze | null = null): Promise<ConsentResult> {
  const a = await st.getPendingAuth(rid);
  if (!a) return { error: 'EXPIRED' };
  // Connector v2: zonder keuze van de mens geen goedkeuring (de route berekent en controleert die keuze).
  if (approve && a.agent && !v2) return { error: 'EXPIRED' };
  if (!approve) {
    const done = await st.decideAuth(rid, userId, false, null);
    return done ? { redirect: withRedirect(a.redirect_uri, { error: 'access_denied', state: a.state, iss: ISSUER }) } : { error: 'EXPIRED' };
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
  const done = await st.decideAuth(rid, userId, true, sha256(code), gekozen, ruimteOf(ruimte), a.agent ? v2 : null);
  return done ? { redirect: withRedirect(a.redirect_uri, { code, state: a.state, iss: ISSUER }) } : { error: 'EXPIRED' };
}

// ---------------- token-eindpunt (RFC 6749) ----------------

const tokenError = (status: number, error: string, description: string) => respond(status, { error, error_description: description }, { Pragma: 'no-cache' });

async function issue(userId: string, clientId: string, clientName: string, scope: string, duur: string | null | undefined, ruimte: unknown, agent: AgentSlug | null = null, v2Keuze: unknown = null) {
  const access = `mcpa_${randomToken(32)}`;
  const refresh = `mcpr_${randomToken(32)}`;
  const d = isDuurId(duur) ? duur : null;
  const r = ruimteOf(ruimte);
  const grantId = await st.insertToken({ userId, clientId, clientName, scope, accessHash: sha256(access), refreshHash: sha256(refresh), duur: d, ruimte: r, agent });
  // Sleutelkluis (0092): staat de gegevenssleutel van de mens open (hij geeft nu toestemming in zijn sessie), dan krijgt deze
  // verbinding haar eigen omslag onder haar tokens — de agent werkt daarna zonder mens, zolang de verbinding geldig is.
  let sleutelOmslag = false;
  try { sleutelOmslag = await grantVerzegelen(grantId, { toegang: access, vernieuw: refresh }); } catch (err) { console.error('[sleutelkluis] grant-omslag mislukt:', (err as Error).message); }
  let v2: V2Keuze | null = null;
  if (agent) {
    // Connector v2: precies wat de mens per hulpmiddel koos (en de scopelaag daaraan gelijk). Lukt dat niet, dan geen token:
    // een v2-koppeling zonder rechtenrij zou niets mogen, maar dat willen we niet stil laten gebeuren.
    try { v2 = await naUitgifte(userId, grantId, agent, v2Keuze); }
    catch (err) { await st.revokeGrant(userId, grantId).catch(() => undefined); console.error('[connector-v2] rechten vastleggen mislukt:', (err as Error).message); return tokenError(500, 'server_error', 'Rechten konden niet worden opgeslagen'); }
  } else {
    // Gedetailleerde toegang (0043, shared/ai-toegang.ts): een PRIVÉ verbinding erft de keuze van «Доступ ШІ» (bord:<klant>), als
    // die er is; een TECHNISCHE krijgt altijd de technische standaard (gescheiden ruimtes, besluit eigenaar 1.11.2026).
    await geefVoorNieuweKoppeling(userId, grantId, klantVan(clientName), r).catch(() => undefined);
  }
  meldLijstGewijzigd(userId);
  // Journaal op /agents: «ШІ підключено» met clientnaam, scope, duur en ruimte (de toestemming zelf staat al als owner.mcp.grant.approved).
  await auditToevoegen({ ownerId: userId, actorId: userId, action: 'owner.mcp.grant.connected', type: 'ai', result: 'success', details: { grantId, clientId, clientName, scope, duur: d ?? 'standaard', ruimte: r, sleutelOmslag, ...(agent && v2 ? { agent, kanten: v2.kanten, rechten: v2.sleutels.length } : {}) } }).catch(() => undefined);
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
    return issue(row.user_id, client.client_id, client.client_name, row.scope, row.duur, row.ruimte, (row.agent ?? null) as AgentSlug | null, row.v2_keuze ?? null);
  }

  if (grant === 'refresh_token') {
    const refresh = p.get('refresh_token') || '';
    if (!refresh) return tokenError(400, 'invalid_request', 'refresh_token ontbreekt');
    const access = `mcpa_${randomToken(32)}`, newRefresh = `mcpr_${randomToken(32)}`;
    const rotated = await st.rotateRefresh(client.client_id, sha256(refresh), sha256(newRefresh), sha256(access));
    if (rotated) { try { await grantRoteren(String(rotated.id), refresh, { toegang: access, vernieuw: newRefresh }); } catch (err) { console.error('[sleutelkluis] grant-omslag roteren mislukt:', (err as Error).message); } }
    if (!rotated) {
      // Hergebruik van een geroteerd token: grant intrekken (en in het journaal, met reden).
      for (const r of await st.revokeIfReused(client.client_id, sha256(refresh))) {
        await grantSluiten(String(r.id)).catch(() => undefined);
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
      await grantSluiten(String(r.id)).catch(() => undefined);
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
  // Sleutelkluis (0092): het token zelf opent de omslag van deze verbinding (alleen in het geheugen, tot de verbinding verloopt).
  try { await grantOpenen(String(row.id), 'toegang', m[1]); } catch { /* geen omslag = de agent ziet dek1-rijen als «ключ закритий» */ }
  return { userId: row.user_id, tokenId: row.id, clientName: row.client_name, ruimte: ruimteOf(row.ruimte), limietSleutel: row.id, agent: (row.agent ?? null) as AgentSlug | null };
}

/** Agenttoken tvh_… (app.mcp_console_tokens, alleen hash): niet ingetrokken, niet verlopen; noteert het gebruik. */
export async function agentToken(token: string): Promise<{ id: string; user_id: string; name: string; role: string; ruimte: string } | null> {
  if (!/^tvh_[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { rows } = await getPool('systeem').query(
    `UPDATE app.mcp_console_tokens t SET calls = calls + 1, last_seen_at = now()
       FROM app.records r
      WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now() AND r.tbl = 'users' AND r.id = t.user_id
        AND r.data->>'status' = 'approved' AND COALESCE((r.data->>'retiredAt')::numeric, 0) = 0
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
const rpcError = (id: unknown, code: number, message: string, data?: Record<string, unknown>) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } });

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
export type Wie = {
  userId: string; clientName: string; tokenId?: string; agentTokenId?: string; grantId?: string; ruimte: AiRuimte; agent?: AgentSlug | null;
  /**
   * De GEGEVENSLADE van deze aanroep (shared/ruimte-scheiding.ts). Ontbreekt zij, dan bepaalt `lijstTools`/`roepTool` haar zelf
   * met backend/ai-ruimte-poort.ts → aiPoortNu; meegeven is alleen een optimalisatie binnen één verzoek, nooit een manier om
   * haar te vergroten (de poort wordt in roepTool altijd opnieuw geraadpleegd voor de RUIMTE zelf).
   */
  lade?: AiRuimte;
};
const grantVan = (who: Wie) => who.grantId ?? who.tokenId;
/**
 * SEC-002 (ai-mcp-05): de sitebrede schakelaars «agent uit» / «manier uit» gelden ook voor een BESTAANDE privéverbinding, bij elke
 * tools/list en tools/call (shared/ai-agent-bord.ts → verbindingGeweigerd). Manier: agenttoken tvh_ = 'token', OAuth-grant = 'mcp'.
 */
const verbindingStop = (staat: Awaited<ReturnType<typeof leesStaat>>, who: Wie) => verbindingGeweigerd(staat, {
  ruimte: who.ruimte, klant: klantVan(who.clientName), methode: who.agentTokenId ? 'token' : 'mcp',
  agentKlant: who.agent ? V2_AGENTEN.find((a) => a.slug === who.agent)?.klant ?? null : null,
});
/**
 * SEC-002 (slot m, MR-1/MRG-06): mag deze verbinding NU de bronnen met accountgegevens lezen (mr://identiteit/profiel)? Alleen als geen
 * sitebrede schakelaar («agent uit», «manier uit») de verbinding stopt. Onleesbare stand = nee (zoals ai-mcp-13). Het recht zelf
 * (v2_whoami) controleert de aanroeper: connector v2 kent het per verbinding.
 */
export async function profielNietGestopt(who: Wie): Promise<boolean> {
  try { return verbindingStop(await leesStaat(), who) === null; } catch { return false; }
}
/** Weigering van een bron met accountgegevens in het logboek, zoals een geweigerde tools/call (owner.mcp.tool, reden recht-uit). */
export async function meldBronGeweigerd(who: Wie, uri: string, agent?: AgentSlug): Promise<void> {
  await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: 'denied', details: { tool: 'resources/read', bron: uri.slice(0, 80), client: who.clientName.slice(0, 80), grantId: grantVan(who) ?? null, ...(agent ? { agent } : {}), reden: 'recht-uit' } }).catch(() => undefined);
}
const namensVan = (who: Wie, viaV2 = false) => ({ client: who.clientName, grantId: grantVan(who), ruimte: who.ruimte, lade: who.lade ?? who.ruimte, ...(who.agent ? { agent: who.agent } : {}), ...(viaV2 ? { v2: true } : {}) });
/** Connector v2: de naam die de AI gebruikte (…_grok_mail_gmail_tarasevych_com_gebruiker) en de agent, naast de interne naam. */
export type V2Context = { naam: string; agent: AgentSlug };
export const werkDetails = (who: Wie, name: string, args: Record<string, unknown>, v2?: V2Context) => {
  const doel = actieDoel(name, args);
  const grantId = grantVan(who);
  // SEC-002 (ai-mcp-01): bij een devtools-alias (list_pages, click …) ook de INTERNE naam in het journaal — de alias mag de echte daad niet verbergen.
  const intern = resolveAlias(name, args).name;
  return { tool: name.slice(0, 80), ...(typeof intern === 'string' && intern !== name ? { intern: intern.slice(0, 80) } : {}), client: String(who.clientName || '').slice(0, 80), ...(grantId ? { grantId: String(grantId) } : {}), ruimte: who.ruimte, soort: actieSoort(name), ...(doel ? { doel } : {}), ...(v2 ? { v2: v2.naam.slice(0, 80), agent: v2.agent } : {}) };
};

/** Onderwerpen voor de grant "updates voorbereiden": eerst deze MCP-koppeling, dan het account. */
const uitrolOnderwerpen = (who: Wie): Onderwerp[] => [
  ...(who.tokenId ? [{ soort: 'mcp-koppeling' as const, id: String(who.tokenId), accountId: who.userId }] : []),
  ...(who.agentTokenId ? [{ soort: 'agenttoken' as const, id: String(who.agentTokenId), accountId: who.userId }] : []),
  // Grant per agent (blijft gelden na opnieuw verbinden) — alleen voor een koppeling in de TECHNISCHE ruimte.
  ...(who.agent && who.ruimte === 'technisch' ? [{ soort: 'agent' as const, id: String(who.agent), accountId: who.userId }] : []),
  { soort: 'account', id: who.userId, accountId: who.userId },
];

/**
 * LEVENDE RECHTEN (20.10.2026). Tot nu toe stond de ruimte in de grant (mcp_oauth_tokens.ruimte) en bleef ze daar staan; wie zijn
 * technische profiel verliet, hield zijn technische hulpmiddelen tot de koppeling verliep. Nu beslist de huidige staat van de
 * mens (backend/ai-ruimte-poort.ts → effectieveRuimte: nog eigenaar + lopende activering van het technische profiel).
 *
 * Een privéverbinding merkt hier niets van. Een TECHNISCHE verbinding bestaat alleen zolang die twee dingen waar zijn; is dat
 * niet zo, dan is het antwoord `false` en wordt er niets uitgevoerd. Bewust GEEN stille terugval naar 'prive': een technische
 * naam die in de privéruimte zou landen, zou op de eigen pc of de eigen tabbladen van de gebruiker werken.
 */
export async function technischNuGeldig(who: Wie): Promise<boolean> {
  if (who.ruimte !== 'technisch') return true;
  return (await aiPoortNu(who.userId, { verbindingId: grantVan(who) ?? null })).ruimte === 'technisch';
}

/**
 * Uit welke lade leest DEZE verbinding? Privéverbindingen altijd de persoonlijke; een technische verbinding volgt de stand
 * van de dienst «ai»: 'eigen' → de technische lade, 'gedeeld' → de persoonlijke (de bewuste samenvoeging). Staat de dienst
 * uit of is zij bevroren, dan is er geen lade en geeft dit `null`: er mag dan niets technisch gebeuren.
 *
 * Bewust ALLEEN de stand: wie technische toegang heeft (eigenaarsrol, lopende activering) blijft `technischNuGeldig`
 * beantwoorden, één keer per aanroep, precies waar dat al stond. Zo is er één extra voorwaarde en geen dubbele waarheid.
 */
async function ladeVan(who: Wie): Promise<AiRuimte | null> {
  if (who.ruimte !== 'technisch') return 'prive';
  const d = await aiDienstStand(who.userId);
  return d.aan ? d.lade : null;
}

/**
 * Hulpmiddelen die deze verbinding in haar ruimte ziet (intern formaat). Gedeeld door het oude /mcp en connector v2
 * (backend/connector-v2.ts), die per kant een eigen `who.ruimte` meegeeft en de namen omzet.
 */
export async function lijstTools(who: Wie, opts: { aliassen?: boolean; taal?: ToolTaal; v2?: boolean } = {}): Promise<ToolDef[]> {
  // Taal van de mens achter de grant (shared/hulpmiddel-teksten.ts): één keer bepaald, dan aan listTools en de uitroltools gegeven.
  const taal = opts.taal ?? await taalVanGebruiker(who.userId);
  // 20.10.2026: de technische kant bestaat alleen zolang de stand van de dienst «ai» haar toestaat ('eigen' of 'gedeeld').
  // Staat zij op 'uit' of 'bevroren', dan is er GEEN technisch hulpmiddel en GEEN technisch apparaat — ook niet als de
  // koppeling ze ooit kreeg. De lade bepaalt daarnaast wélke apparaten en externe MCP-servers hierbij horen.
  if (who.ruimte === 'technisch' && who.lade === undefined) {
    const lade = await ladeVan(who);
    if (!lade) return [];
    who = { ...who, lade };
  }
  // Alleen de hulpmiddelen van de eigen ruimte (shared/ai-ruimte.ts); apparaattools filteren verder op de ruimte van het apparaat.
  // Приватне підключення додатково втрачає те, що адміністратор або сам користувач вимкнув (shared/ai-agent-bord.ts).
  // `aliassen: false` = de interne browser_*-namen houden (connector v2 zoekt daarop; het oude /mcp wil de devtools-namen).
  let listed = (await metNamens(namensVan(who), () => listTools(who.userId, { alwaysMachine: true, taal, ...(opts.aliassen === false ? { aliassen: false } : {}), ...(opts.v2 ? { v2: true } : {}) }))).filter((t) => toolInRuimte(t.name, who.ruimte));
  if (who.ruimte === 'prive') {
    // SEC-002 (ai-mcp-13): onleesbare stand = geen hulpmiddelen tonen (niet «alles aan»).
    const caps = await Promise.all([leesStaat(), leesGebruikerCaps(who.userId)]).catch(() => null);
    if (!caps) { await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tools.list', result: 'denied', details: { reden: 'CAP_ONBEKEND', klant: who.clientName } }).catch(() => undefined); return []; } // g10c-toets-3
    const [staat, alleCaps] = caps;
    const klant = klantVan(who.clientName);
    const gebruiker = klant === 'overig' ? undefined : alleCaps[klant];
    listed = verbindingStop(staat, who) ? [] : listed.filter((t) => !toolGeweigerd(staat, { ruimte: 'prive', tool: t.name, klant, gebruiker }));
  }
  // Extensie 0.6: browserhulpmiddelen volgen de ruimte van het apparaat (shared/ai-ruimte.ts). Een technische verbinding ziet ze alleen
  // als dit account een browser in het TECHNISCHE slot gekoppeld heeft; de agentkeuze (connectors-tools apparatenInRuimte) kiest nooit kruislings.
  if (who.ruimte === 'technisch' && listed.some((t) => isBrowserToolNaam(t.name))) {
    const techBrowser = (await listAgents(who.userId).catch(() => [])).some((a) => a.platform === 'browser' && ruimteOf(a.ruimte) === 'technisch');
    if (!techBrowser) listed = listed.filter((t) => !isBrowserToolNaam(t.name));
  }
  const tools: ToolDef[] = [...listed];
  // Updates voorbereiden: alleen in de technische ruimte én met een grant van de eigenaar; goedkeuren bestaat hier niet.
  if (who.ruimte === 'technisch' && (await heeftVoorbereiderGrant(uitrolOnderwerpen(who)))) tools.push(...await metNamens(namensVan(who), async () => vertaal(UITROL_TOOLS as unknown as ToolDef[], taal)));
  return tools;
}

type ToolUit = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
/** Bij een mislukking: alleen de korte foutcode (bv. SPIEGEL_FOUT) in het journaal, zodat de melding de OORZAAK kan noemen — nooit de tekst zelf. */
const foutDetail = (uit: { content?: Array<{ text?: string }>; isError?: boolean }): { fout?: string } => {
  if (!uit.isError) return {};
  const code = foutCodeUit(uit.content?.[0]?.text);
  return code ? { fout: code } : {};
};
/** Eén hulpmiddel uitvoeren met alle poorten (ruimte, sitebrede schakelaars, AI-beleid, uitrol, scopes) en het journaal. */
export async function roepTool(who: Wie, name: string, args: Record<string, unknown>, v2?: V2Context): Promise<ToolUit> {
  // Levende rechten: de technische ruimte opnieuw controleren OP HET MOMENT VAN DE AANROEP, ook als tools/list het hulpmiddel
  // net nog toonde. Verliet de mens zijn technische profiel (of de eigenaarsrol) tussen die twee momenten: weigeren, niet
  // uitvoeren, en in het journaal met reden 'tech-profiel'.
  // Levende rechten: de technische ruimte opnieuw controleren OP HET MOMENT VAN DE AANROEP, ook als tools/list het
  // hulpmiddel net nog toonde. `technischNuGeldig` loopt sinds 20.10.2026 via aiPoortNu en dekt dus drie dingen in één:
  // nog eigenaar, technisch profiel actief, en de dienst «ai» aan in de technische gegevensruimte.
  if (!(await technischNuGeldig(who))) {
    const ruimteCode = await ruimteFoutVoorMcp(who.userId, name, grantVan(who) ?? null).catch(() => null);
    const uit = { content: [{ type: 'text' as const, text: ruimteCode ?? TECH_PROFIEL_UIT(name.slice(0, 80)) }], isError: true };
    try { await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: 'denied', details: { ...werkDetails(who, name, args, v2), reden: 'tech-profiel' } }); } catch { /* audit mag niet breken */ }
    return uit;
  }
  // En uit welke lade deze aanroep leest (apparaten, externe MCP-servers): 'eigen' → technisch, 'gedeeld' → persoonlijk.
  if (who.ruimte === 'technisch' && who.lade === undefined) {
    const lade = await ladeVan(who);
    if (!lade) {
      const uit = { content: [{ type: 'text' as const, text: TECH_PROFIEL_UIT(name.slice(0, 80)) }], isError: true };
      try { await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: 'denied', details: { ...werkDetails(who, name, args, v2), reden: 'ruimte-dienst' } }); } catch { /* audit mag niet breken */ }
      return uit;
    }
    who = { ...who, lade };
  }
  // Buiten de eigen ruimte: nooit uitvoeren, wel in het journaal (de AI probeerde iets wat de mens niet voor haar bedoelde).
  // Goedkeurpogingen vallen eronder: die krijgen hun eigen, eerlijke weigering hieronder (ALLEEN_EIGENAAR_MET_PASSKEY).
  // SEC-002 (ai-mcp-01): de poorten hieronder beoordelen de ruwe naam ÉN het interne hulpmiddel waar een devtools-alias naar wijst
  // (list_pages → browser_list_tabs); de strengste wint. Zo kan een alias nooit iets bereiken wat de directe naam niet mag.
  const intern = resolveAlias(name, args).name;
  if ((!toolInRuimte(name, who.ruimte) || !toolInRuimte(intern, who.ruimte)) && !isGoedkeurPoging(name)) {
    const uit = { content: [{ type: 'text' as const, text: RUIMTE_GESCHEIDEN(who.ruimte, name.slice(0, 80)) }], isError: true };
    try { await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: 'denied', details: { ...werkDetails(who, name, args, v2), reden: 'ruimte' } }); } catch { /* audit mag niet breken */ }
    return uit;
  }
  if (who.ruimte === 'prive') {
    // SEC-002 (ai-mcp-13): onleesbare stand (anders dan «tabel ontbreekt») = weigeren, niet «alles aan».
    const caps = await Promise.all([leesStaat(), leesGebruikerCaps(who.userId)]).catch(() => null);
    if (!caps) {
      // g10c-toets-3: ook deze weigering in de auditlog, zoals de andere weigeringen hierboven en hieronder.
      try { await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: 'denied', details: { ...werkDetails(who, name, args, v2), reden: 'CAP_ONBEKEND' } }); } catch { /* audit mag niet breken */ }
      return { content: [{ type: 'text' as const, text: `SITE_CAP: CAP_ONBEKEND. The availability switches for "${name.slice(0, 80)}" could not be read right now, so the call is refused. Try again later.` }], isError: true };
    }
    const [staat, alleCaps] = caps;
    const klant = klantVan(who.clientName);
    const gebruiker = klant === 'overig' ? undefined : alleCaps[klant];
    const w = verbindingStop(staat, who) ?? toolGeweigerd(staat, { ruimte: 'prive', tool: name, klant, gebruiker }) ?? (intern !== name ? toolGeweigerd(staat, { ruimte: 'prive', tool: intern, klant, gebruiker }) : null);
    if (w) {
      const tekst = `SITE_CAP: ${w.code}. This private connection cannot use "${name.slice(0, 80)}". An administrator switch or this user's own setting blocks it. Do not try another way.`;
      try { await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: 'denied', details: { ...werkDetails(who, name, args, v2), reden: w.code } }); } catch { /* audit mag niet breken */ }
      return { content: [{ type: 'text' as const, text: tekst }], isError: true };
    }
  }
  // 21.10.2026 — technische beheerhulpmiddelen (backend/ai-beheer-hulpmiddelen.ts): journaal lezen, SIEM-stand, gebruikers en functievlaggen.
  // ALLEEN via connector v2 (`v2` gezet: het recht staat per hulpmiddel in connector_v2_rechten) en alleen in de technische ruimte;
  // het oude /mcp kent ze niet (geen tools/list, en een aanroep met de interne naam wordt hier geweigerd).
  // 21.10.2026 (shared/dev-media-github.ts): zeven hulpmiddelen (PR, CI-logboeken, eigen domein, beeld, schema, ontwerpcontext, Stripe)
  // bestaan ALLEEN via connector v2 — het recht staat per hulpmiddel in connector_v2_rechten. Het oude /mcp weigert de interne naam.
  // Zone E: browser_script (ook onder de devtools-naam evaluate_script) bestaat eveneens alleen via connector v2.
  // SEC-002 (ai-mcp-01): de hele lijst V2_ALLEEN (ook ecosysteem- en GitHub-werkruimtehulpmiddelen), op de interne naam.
  if ((isDevMgTool(name) || V2_ALLEEN.has(name) || V2_ALLEEN.has(intern)) && !v2) {
    const uit: ToolUit = { content: [{ type: 'text', text: DEV_MG_ALLEEN_V2(name.slice(0, 80)) }], isError: true };
    try { await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: 'denied', details: { ...werkDetails(who, name, args, v2), reden: 'alleen-v2' } }); } catch { /* audit mag niet breken */ }
    return uit;
  }
  if (BEHEER_TOOL_NAMEN.has(name)) {
    const uit: ToolUit = !v2 || who.ruimte !== 'technisch'
      ? { content: [{ type: 'text', text: BEHEER_ALLEEN_V2(name.slice(0, 80)) }], isError: true }
      : await metNamens(namensVan(who), () => voerBeheerToolUit(who, name, args));
    try { await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: uit.isError ? (v2 ? 'failure' : 'denied') : 'success', details: { ...werkDetails(who, name, args, v2), ...foutDetail(uit), ...(v2 ? {} : { reden: 'alleen-v2' }) } }); } catch { /* audit mag niet breken */ }
    return uit;
  }
  if (UITROL_TOOL_NAMEN.has(name) || isGoedkeurPoging(name)) {
    let uit: { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
    // Ondertekend AI-beleid: «Розгортати сайт» uit voor deze AI → niets voorbereiden (goedkeuren kan hier nooit).
    const weigering = UITROL_TOOL_NAMEN.has(name) ? await uitrolWeigering({ client: who.clientName, grantId: grantVan(who), ...(who.agent ? { agent: who.agent } : {}) }, name) : null;
    if (weigering) uit = { content: [{ type: 'text', text: weigering }], isError: true };
    else try { uit = { content: [{ type: 'text', text: JSON.stringify(await metNamens(namensVan(who), async () => voerUitrolToolUit(uitrolOnderwerpen(who), name, args))) }] }; }
    catch (err) { uit = { content: [{ type: 'text', text: err instanceof UitrolFout ? err.code : 'UITROL_FOUT' }], isError: true }; }
    try { await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: uit.isError ? 'failure' : 'success', details: { ...werkDetails(who, name, args, v2), ...foutDetail(uit) } }); } catch { /* audit mag niet breken */ }
    return uit;
  }
  const result = await metNamens(namensVan(who, !!v2), () => callTool(who.userId, name, args));
  try {
    await auditToevoegen({ ownerId: who.userId, actorId: who.userId, action: 'owner.mcp.tool', result: result.isError ? 'failure' : 'success', details: { ...werkDetails(who, name, args, v2), ...foutDetail(result as ToolUit) } });
  } catch { /* auditfout mag het hulpmiddel niet breken */ }
  return result as ToolUit;
}

/**
 * Ruimtes-scheiding (docs/ontwerp/RUIMTES-COMPATIBILITEIT.md §4.3–4.4): met de vlaggen ruimtes-scheiding én tech-ruimtes-v2 aan krijgt
 * een geweigerde technische aanroep de vaste foutcode + uitleg {uk, nl} (backend/ruimtes-compatibiliteit.ts). Vlag uit: null = oude tekst.
 */
async function ruimteFoutVoorMcp(userId: string, name: string, verbindingId?: string | null): Promise<string | null> {
  const { scheidingAan } = await import('./ruimte-sessie');
  const kern = await import('./tech-ruimtes-kern');
  if (!(await scheidingAan(userId)) || !(await kern.v2Aan(userId))) return null;
  const { antwoordVoorCode, hulpmiddelScope } = await import('./ruimtes-compatibiliteit');
  const b = await kern.besluit(userId, { bron: 'mcp', ...(verbindingId ? { verbindingId } : {}) });
  const a = antwoordVoorCode(b.toegestaan ? 'GEEN_TECH_SESSIE' : b.code);
  return JSON.stringify({ error: a.code, status: a.status, uitleg: a.uitleg, hulpmiddel: name.slice(0, 80), scope: hulpmiddelScope(name, BEHEER_TOOL_NAMEN) });
}

async function handleMessage(who: Wie, msg: any, protocolKop?: string): Promise<unknown | null> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid Request');
  const id = msg.id;
  if (id === undefined) return null; // notificatie (bijv. notifications/initialized): geen antwoord
  const metaCheck = controleerModerneMeta(msg as Record<string, unknown>, protocolKop);
  if (!metaCheck.ok) return rpcError(id, metaCheck.code, metaCheck.message, metaCheck.data);

  // Levende rechten: een technische koppeling waarvan het profiel nu uit staat toont NIETS en voert NIETS uit (roepTool weigert ook zelf).
  const techNuUit = !(await technischNuGeldig(who));
  const effRuimte: AiRuimte = techNuUit ? 'prive' : who.ruimte;
  const instr = techNuUit ? `${instructies(who.ruimte)} ${TECH_NU_UIT_INSTRUCTIE}` : instructies(who.ruimte);

  switch (msg.method) {
    case 'initialize': {
      const wanted = String(msg.params?.protocolVersion ?? '');
      const gekozen = wanted === MCP_MODERNE_VERSIE
        ? MCP_MODERNE_VERSIE
        : (PROTOCOL_VERSIONS.includes(wanted) ? wanted : PROTOCOL_VERSIONS[0]);
      return rpcResult(id, {
        protocolVersion: gekozen,
        capabilities: bouwCapabilitiesBlock(),
        serverInfo: { name: 'mijn-ruimte', title: 'Mijn Ruimte', version: '1.0.0' },
        instructions: instr,
      });
    }
    case 'ping': return rpcResult(id, omhulModernResultaat({}, metaCheck.modern));
    case 'tools/list': {
      const tools = techNuUit ? [] : (await lijstTools(who)).map(toMcpTool);
      return rpcResult(id, omhulModernResultaat({ tools }, metaCheck.modern, { metCache: true, ttlMs: 60_000 }));
    }
    case 'tools/call': {
      const name = msg.params?.name;
      if (typeof name !== 'string' || !name) return rpcError(id, -32602, 'name ontbreekt');
      const args: Record<string, unknown> = msg.params?.arguments && typeof msg.params.arguments === 'object' ? msg.params.arguments : {};
      const uit = await roepTool(who, name, args);
      return rpcResult(id, omhulModernResultaat(uit as Record<string, unknown>, metaCheck.modern));
    }
    default: {
      // SEC-002 (slot m, MRG-06): technische koppeling met profiel uit toont NIETS — ook geen bronnen of prompts (zoals tools/list).
      if (techNuUit && (msg.method === 'resources/list' || msg.method === 'resources/templates/list' || msg.method === 'prompts/list')) {
        const sleutel = msg.method === 'resources/list' ? 'resources' : msg.method === 'prompts/list' ? 'prompts' : 'resourceTemplates';
        return rpcResult(id, omhulModernResultaat({ [sleutel]: [] }, metaCheck.modern));
      }
      // Het oude /mcp kent geen recht per hulpmiddel; accountgegevens alleen als de koppeling nu leeft en geen schakelaar haar stopt.
      const magProfiel = !techNuUit && await profielNietGestopt(who);
      const extra = await behandelMcpProtocolMethode({
        userId: who.userId,
        clientName: who.clientName,
        ruimte: effRuimte,
        magProfiel,
        meldWeigering: (uri) => meldBronGeweigerd(who, uri),
        instructions: instr,
        modern: metaCheck.modern,
      }, msg.method, msg.params);
      if (extra?.soort === 'result') return rpcResult(id, extra.result);
      if (extra?.soort === 'error') return rpcError(id, extra.code, extra.message, extra.data);
      return rpcError(id, -32601, 'Method not found');
    }
  }
}

/**
 * MCP-001 R1: JSON-RPC-batches bestaan alleen in protocol 2025-03-26; sinds 2025-06-18 zijn ze uit de specificatie. Een klant die
 * met de kop MCP-Protocol-Version een nieuwere versie aankondigt en tóch een batch stuurt, krijgt -32600. Zonder kop (oude klanten)
 * blijft het zoals het was — zo breekt niets dat nu werkt.
 */
export const batchToegestaan = (protocolKop: string | undefined): boolean => {
  const v = String(protocolKop || '').trim();
  return !v || v === '2025-03-26' || v === '2024-11-05';
};
export const BATCH_FOUT = (versie: string) => rpcError(null, -32600, `JSON-RPC batch is not part of MCP ${String(versie).slice(0, 20)} — send one message per request`);

export async function rpcPost(authorization: string | undefined, rawBody: string, protocolKop?: string): Promise<RouterResponse> {
  const who = await authenticate(authorization);
  // Een v2-token (gebonden aan /<agent>) werkt niet op het oude /mcp: daar zouden de rechten per hulpmiddel niet gelden.
  if (!who || who.agent) return unauthorized(!!String(authorization || '').trim());
  zetGebruiker(who.userId, 'mcp', undefined, String(grantVan(who) || ''));
  sessieGeverifieerd();
  const limit = await rateLimit(`mcp-rpc:${who.limietSleutel}`, RPC_PER_MINUTE, 60);
  if (!limit.ok) return respond(429, rpcError(null, -32000, 'Te veel verzoeken'), { 'Retry-After': String(limit.retryAfter) });
  if (Buffer.byteLength(rawBody) > MAX_RPC_BYTES) return respond(413, rpcError(null, -32600, 'Request too large'));

  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return respond(400, rpcError(null, -32700, 'Parse error')); }

  if (Array.isArray(parsed)) { // JSON-RPC batch (specificatie 2025-03-26)
    if (!batchToegestaan(protocolKop)) return respond(400, BATCH_FOUT(String(protocolKop)));
    // SEC-002 (ai-mcp-08): pakket begrensd, elk bericht telt in de limiet, kleine parallelliteit (zie backend/mcp-pakket.ts).
    const besluit = await pakketToegestaan(`mcp-rpc:${who.limietSleutel}`, parsed.length, RPC_PER_MINUTE);
    if (!besluit.ok) return respond(besluit.status, rpcError(null, besluit.code, besluit.bericht), besluit.retryAfter ? { 'Retry-After': String(besluit.retryAfter) } : undefined);
    const out = (await pakketUitvoeren(parsed, (m) => handleMessage(who, m, protocolKop))).filter((r) => r !== null);
    return out.length ? respond(200, out) : respond(202, undefined);
  }
  const out = await handleMessage(who, parsed, protocolKop);
  return out === null ? respond(202, undefined) : respond(200, out);
}

/** Streamable HTTP: een gewone GET zonder event-stream-Accept is niet toegestaan (405). */
export const rpcNotAllowed = (): RouterResponse => respond(405, { error: 'method_not_allowed' }, { Allow: 'POST' });

/** Streamable HTTP: DELETE beëindigt de huidige sessie/SSE-stroom zodat een client bij herauthenticatie zijn tools/list vers ophaalt. */
export async function rpcDelete(authorization: string | undefined): Promise<RouterResponse> {
  const who = await authenticate(authorization);
  if (!who || who.agent) return unauthorized(!!String(authorization || '').trim());
  zetGebruiker(who.userId, 'mcp', undefined, String(grantVan(who) || ''));
  sessieGeverifieerd();
  sluitStromenVan(who.userId, 'mcp');
  return respond(204, undefined);
}

/** Streamable HTTP: CORS/preflight voor webgebaseerde MCP-clients (bv. cursor.com, claude.ai). */
export const rpcOptions = (): RouterResponse => respond(204, undefined, {
  Allow: 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Mcp-Method, Mcp-Name',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version',
});

// ---------------- beheer door de gebruiker ----------------

export async function listUserGrants(userId: string) {
  return (await st.listGrants(userId)).map((g) => ({
    id: g.id, clientName: g.client_name, scope: g.scope, createdAt: new Date(g.created_at).getTime(), duur: g.duur ?? null, ruimte: ruimteOf(g.ruimte),
    lastUsedAt: g.last_used_at ? new Date(g.last_used_at).getTime() : null, expiresAt: new Date(g.refresh_expires_at).getTime(),
    // Connector v2 (0045): de agent van de koppeling; null = oude /mcp. «Доступ ШІ» (bord) raakt alleen oude privégrants.
    agent: g.agent ?? null,
  }));
}
export const revokeUserGrant = async (userId: string, id: string) => { const ok = await st.revokeGrant(userId, id); if (ok) { await grantSluiten(id).catch(() => undefined); sluitStromenVan(userId); } return ok; };

/** Geschiedenis (90 dagen): ook ingetrokken en verlopen verbindingen, met stand. Nooit tokens of hashes. */
export async function listUserGrantHistory(userId: string) {
  const now = Date.now();
  return (await st.listGrantHistory(userId)).map((g) => {
    const revokedAt = g.revoked_at ? new Date(g.revoked_at).getTime() : null;
    const expiresAt = new Date(g.refresh_expires_at).getTime();
    return {
      id: g.id, clientId: g.client_id, clientName: g.client_name, scope: g.scope, createdAt: new Date(g.created_at).getTime(), duur: g.duur ?? null, ruimte: ruimteOf(g.ruimte), agent: g.agent ?? null,
      lastUsedAt: g.last_used_at ? new Date(g.last_used_at).getTime() : null, expiresAt, accessExpiresAt: new Date(g.access_expires_at).getTime(), revokedAt,
      status: revokedAt ? 'revoked' as const : expiresAt <= now ? 'expired' as const : 'active' as const,
    };
  });
}
