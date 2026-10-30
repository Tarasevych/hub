// Audit 18.10.2026, bevinding K1: een AI mag nooit een sessie van de eigenaar krijgen.
//   - Reproductie van het oude probleem (PoC /tmp/poc-agentsessie.test.ts): een rij in owner_service_sessions_v1 met authMethod 'agent-token'
//     gaf — na een «reparatie» van één veld — op /api/owner/session/bootstrap een volle eigenaarssessie. Nu: nooit (ook niet als id klopt,
//     ook niet als 0059 de rij niet markeerde); een gewone sessie met dezelfde opbouw werkt wél (controle dat de test echt test).
//   - De drie instrumenten bestaan nergens meer in een lijst en geven TOOL_VERWIJDERD (+ journaal).
//   - Namens-sessie: alleen eigenaar + passkey (eenmalig verbruikt), 15 min … 8 u, omvang; callSite laat alleen dan beheerroutes toe,
//     zet «від імені» + actorType agent in het journaal, weigert verboden routes (twee hekken), intrekken werkt meteen.
//   - Migratie 0059 markeert spooksessies; opruimen alleen met passkey.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { closePool, getPool } from '../../server/platform/pg';
import { metVerzoek, zetNamens } from '../../server/platform/context';
import { auditToevoegen } from '../../server/platform/audit';
import { STATISCHE_TOOLNAMEN } from '../../backend/connectors-hulpmiddelen';
import { SITE_TOOLS, ADMIN_VIEW_ROUTES } from '../../backend/site-hulpmiddelen';
import { V2_OPTIES } from '../../shared/connector-v2/catalogus';
import { scopeVoorTool } from '../../shared/ai-toegang';
import { TOOL_CAPABILITY } from '../../shared/ai-beleid/catalogus';
import { DOOR_TOOLS } from '../../src/mcp-catalogus';
import { toolInRuimte } from '../../shared/ai-ruimte';
import { TOEGESTANE_ROUTES, callSite, echteAanroepZonderHekVoorTest, zetSiteAanroeper } from '../../backend/site-aanroep';
import { metNamens } from '../../backend/mcp-namens';
import { VERWIJDERDE_SESSIE_TOOLS, mcpConsoleRoutes } from '../../backend/mcp-console';
import * as an from '../../backend/agent-namens';
import { passkeyStapOpVastleggen, totpStapOpVastleggen } from '../../backend/stap-op';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const DRIE = ['issue_session_token', 'exchange_session', 'auto_session'];

export async function main(): Promise<number> {
  const { check, einde } = checker('agent-namens');

  // ------------------------------------------------------------ puur: de drie instrumenten zijn overal weg
  const lijsten: Array<[string, string[]]> = [
    ['connector (statisch)', STATISCHE_TOOLNAMEN()], ['site-tools', SITE_TOOLS.map((t) => t.tool.name)],
    ['connector v2', V2_OPTIES.map((o) => String(o.intern || o.id))], ['console-catalogus (site)', DOOR_TOOLS.map((t) => t.name)],
    ['AI-beleid', Object.keys(TOOL_CAPABILITY)],
  ];
  for (const [naam, l] of lijsten) check(`${naam}: geen issue_session_token / exchange_session / auto_session`, !DRIE.some((n) => l.includes(n)), DRIE.filter((n) => l.includes(n)).join(','));
  check('ai-toegang: de drie hebben geen scope meer (een agenttoken kan ze nergens krijgen)', DRIE.every((n) => scopeVoorTool(n) === undefined));
  check('ai-ruimte: de drie zijn geen technische hulpmiddelen meer', DRIE.every((n) => toolInRuimte(n, 'prive')) && DRIE.every((n) => !toolInRuimte(n, 'technisch')));
  check('VERWIJDERDE_SESSIE_TOOLS = precies de drie', DRIE.every((n) => VERWIJDERDE_SESSIE_TOOLS.has(n)) && VERWIJDERDE_SESSIE_TOOLS.size === 3);
  check('get_admin_view: technisch, alleen lezen, routes = precies de namens-routes', !toolInRuimte('get_admin_view', 'prive') && toolInRuimte('get_admin_view', 'technisch')
    && Object.values(ADMIN_VIEW_ROUTES).every((v) => an.NAMENS_ROUTES.has(v.route)) && SITE_TOOLS.find((t) => t.tool.name === 'get_admin_view')?.tool.annotations?.readOnlyHint === true);

  // ------------------------------------------------------------ puur: verboden routes
  const verboden = ['POST /api/owner/identity/account/delete', 'POST /api/owner/identity/security/revoke-all', 'POST /api/owner/access/passkeys/registreren',
    'POST /api/owner/access/policy/role', 'POST /api/owner/identity/admin/roles', 'POST /api/owner/agent-namens/aanmaken', 'POST /api/owner/uitrol/voorbereiders/geven',
    'POST /api/owner/ai-beleid/ondertekenen', 'POST /api/owner/geheimen/lijst', 'POST /api/owner/api-platform/vault/reveal', 'POST /api/owner/mcp-connector/grants/x/revoke',
    'POST /api/owner/connector-v2/wijzig', 'POST /api/owner/tech/activeren', 'POST /api/mcp/console/token', 'POST /api/mcp/server/terugdraaien'];
  check('AGENT_VERBODEN: account, rollen, toegang, passkeys, namens/grants, AI-beleid, geheimen, techprofiel, tokens, serveropdrachten', verboden.every(an.agentRouteVerboden), verboden.filter((r) => !an.agentRouteVerboden(r)).join(','));
  check('AGENT_VERBODEN raakt geen gewone toegestane route en geen namens-route', ![...TOEGESTANE_ROUTES, ...an.NAMENS_ROUTES].some(an.agentRouteVerboden));
  check('namens-routes zijn allemaal alleen-lezen weergaven (geen schrijf-/wis-woorden)', [...an.NAMENS_ROUTES].every((r) => !/(delete|verwijder|revoke|intrek|opslaan|save|uitvoeren|wijzig|geven)/.test(r)));

  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.log('OVERGESLAGEN agent-namens (integratie): geen database'); return einde(); }
  const sys = getPool('systeem');
  let E = (await sys.query("SELECT id, data FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' AND lower(data->>'email') = lower($1) LIMIT 1", [String(process.env.OWNER_EMAIL || '')])).rows[0] as { id: string; data: Record<string, unknown> } | undefined;
  // Gedeelde test-db: een eerdere test kan de eigenaar hebben gedegradeerd. Dan een tijdelijke eigenaar aanmaken en na afloop wissen
  // (net als tech-profiel), in plaats van de hele integratietest over te slaan.
  let tijdelijkeEigenaar = '';
  if (!E) {
    tijdelijkeEigenaar = randomUUID();
    const data = { email: String(process.env.OWNER_EMAIL || `eigenaar-namens-${tijdelijkeEigenaar}@test.invalid`).toLowerCase(), role: 'owner', status: 'approved', name: 'Tijdelijke eigenaar' };
    await sys.query("INSERT INTO app.records (tbl, id, data) VALUES ('users', $1, $2)", [tijdelijkeEigenaar, data]);
    E = { id: tijdelijkeEigenaar, data };
  }
  check('testdatabase heeft een eigenaar (bestaand of tijdelijk)', !!E);
  const eigenaarEmail = String(E.data.email || '');
  const U = randomUUID();
  await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [U, { email: `${U}@test.invalid`, role: 'member', status: 'approved', name: 'Lid' }]);
  const sessieRijen: string[] = [];
  try {
    // ---------------------------------------------------------- reproductie K1 (bootstrap met een sessie zoals exchangeAgentToken die maakte)
    const { handler } = await import('../../backend/index');
    const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identity');
    const maakSessie = async (authMethod: string | undefined, extra: Record<string, unknown> = {}) => {
      const token = randomBytes(32).toString('base64url'); const now = Date.now();
      const id = randomUUID();
      const record = { tokenHash: sha(token), userId: E.id, service: 'admin', sourceOrigin: 'https://admin.tarasevych.com', tabHash: sha('agent'), createdAt: now, authenticatedAt: now, lastSeenAt: now,
        idleExpiresAt: now + 30 * 864e5, absoluteExpiresAt: now + 90 * 864e5, rotation: 0, version: 1, revocationEpoch: 999999, scope: 'ecosystem', ...(authMethod ? { authMethod } : {}), userAgent: 'poc', ...extra };
      // MET correcte records.id: precies de «één regel reparatie» uit de PoC, waarmee het vroeger een volle eigenaarssessie was.
      await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('owner_service_sessions_v1',$1,$2)", [id, { ...record, id }]);
      sessieRijen.push(id);
      return `${id}.${token}`;
    };
    const bootstrap = async (waarde: string) => {
      const evt = { headers: { host: 'admin.tarasevych.com', origin: 'https://admin.tarasevych.com', 'content-type': 'application/json', cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(waarde)}`, 'user-agent': 'poc' },
        body: JSON.stringify({ service: 'admin', tabContext: 'x', sourceOrigin: 'https://admin.tarasevych.com' }), isBase64Encoded: false, rawPath: '/api/owner/session/bootstrap', rawQueryString: '', queryStringParameters: {},
        requestContext: { http: { method: 'POST', path: '/api/owner/session/bootstrap', sourceIp: '203.0.113.9', userAgent: 'poc' } } };
      const r = await handler(evt as never) as { statusCode: number; body: string };
      return JSON.parse(String(r.body || '{}')) as { user?: { id: string } };
    };
    // epoch: een bestaande «overal afmelden» van de testeigenaar mag de controle niet vertekenen.
    const epoch = Number((await sys.query("SELECT COALESCE(MAX((data->>'epoch')::bigint),0) AS e FROM app.records WHERE tbl IN ('owner_revocations_v1', 'owner_revocation_state_v1') AND data->>'userId' = $1", [E.id]).catch(() => ({ rows: [{ e: 0 }] }))).rows[0]?.e || 0);
    const gewoon = await maakSessie(undefined, { revocationEpoch: epoch + 1 });
    const bGewoon = await bootstrap(gewoon);
    check('controle: een gewone sessie met dezelfde opbouw geeft WEL de eigenaar (de test test echt)', bGewoon.user?.id === E.id, JSON.stringify(bGewoon).slice(0, 120));
    const agentSessie = await maakSessie('agent-token', { revocationEpoch: epoch + 1 });
    check('K1: sessie met authMethod agent-token (ook met correcte id) → GEEN eigenaar op bootstrap', !(await bootstrap(agentSessie)).user);
    const gemarkeerd = await maakSessie(undefined, { revocationEpoch: epoch + 1, verwijderdOp: Date.now(), verwijderdReden: 'AUDIT_K1' });
    check('K1: sessie gemarkeerd als verwijderd (0059) → GEEN eigenaar', !(await bootstrap(gemarkeerd)).user);

    // ---------------------------------------------------------- migratie 0059 markeert spooksessies (opnieuw draaien is veilig)
    const spookId = randomUUID();
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('owner_service_sessions_v1',$1,$2)", [spookId, { id: spookId, userId: E.id, authMethod: 'agent-token', tokenHash: sha('x'), createdAt: Date.now(), absoluteExpiresAt: Date.now() + 864e5, service: 'admin' }]);
    sessieRijen.push(spookId);
    const sql = readFileSync('migrations/0059_agent_namens_sessies.sql', 'utf8');
    await sys.query(sql); await sys.query(sql);
    const na = (await sys.query("SELECT data FROM app.records WHERE id = $1", [spookId])).rows[0]?.data;
    check('0059: spooksessie gemarkeerd (verwijderdOp, AUDIT_K1), niet gewist; twee keer draaien kan', !!na?.verwijderdOp && na?.verwijderdReden === 'AUDIT_K1');
    const spoken = await an.spookSessies(E.id);
    check('spooksessies zichtbaar voor de eigenaar (lijst)', spoken.some((s) => s.id === spookId && s.verwijderdOp));

    // ---------------------------------------------------------- console: de drie geven TOOL_VERWIJDERD en staan in het journaal
    const users: Record<string, any> = { [E.id]: { id: E.id, role: 'owner', status: 'approved', email: eigenaarEmail } };
    const console = mcpConsoleRoutes(async (event: any) => ({ user: users[event.who], service: 'mcp' }) as any, {});
    const roep = async (name: string) => {
      const r = await (console['POST /api/mcp/call'][0] as any)({ event: { who: E.id, headers: {} }, body: { name, arguments: { token: 'tvh_x' } } });
      return JSON.parse(r.body || '{}');
    };
    const res = await Promise.all(DRIE.map(roep));
    check('console /api/mcp/call: alle drie → TOOL_VERWIJDERD, geen cookie of token in het antwoord', res.every((r) => r.ok === false && String(r.error).startsWith('TOOL_VERWIJDERD') && r.cookie === undefined && r.result === undefined && !/tsv_owner=|__Secure-tsv|tvh_[A-Za-z0-9_-]{20}/.test(JSON.stringify(r))), JSON.stringify(res[2]).slice(0, 160));
    const jr = (await sys.query("SELECT count(*)::int AS n FROM app.audit WHERE owner_id::text = $1 AND action = 'agent.sessie_tool.geweigerd' AND created_at > now() - interval '1 minute'", [E.id])).rows[0].n;
    check('poging staat in het journaal (agent.sessie_tool.geweigerd)', jr >= 3, String(jr));
    const nieuwe = Number((await sys.query("SELECT count(*)::int AS n FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND data->>'authMethod' = 'agent-token' AND data->>'userId' = $1 AND NOT (id::text = ANY($2::text[]))", [E.id, sessieRijen])).rows[0].n);
    check('geen nieuwe agent-token-sessie aangemaakt door de aanroepen (alleen de testrijen bestaan)', nieuwe === 0, String(nieuwe));

    // ---------------------------------------------------------- namens-sessie: routes (eigenaar + passkey)
    const sessie = { id: `ns-test-${randomUUID()}`, createdAt: Date.now() };
    const auth = { user: { id: E.id, email: eigenaarEmail, role: 'owner', status: 'approved' }, service: 'admin', session: sessie, tabSession: null };
    const lid = { user: { id: U, email: `${U}@test.invalid`, role: 'member', status: 'approved' }, service: 'admin', session: { id: `ns-lid-${randomUUID()}`, createdAt: Date.now() }, tabSession: null };
    let wie: any = auth;
    const routes = an.agentNamensRoutes({ requireSession: async () => wie });
    const post = async (route: string, b: Record<string, unknown>) => { const r = await (routes[route][0] as any)({ event: {}, body: b }); return { status: r.statusCode, data: JSON.parse(r.body || '{}') }; };
    const zonder = await post('POST /api/owner/agent-namens/aanmaken', { agent: 'claude', ruimte: 'technisch', minuten: 60, omvang: ['uitrol'] });
    check('aanmaken zonder passkey-step-up → 403 STEP_UP_REQUIRED (methods: passkey)', zonder.status === 403 && zonder.data.error === 'STEP_UP_REQUIRED' && zonder.data.methods?.[0] === 'passkey');
    await totpStapOpVastleggen(auth as never);
    const totp = await post('POST /api/owner/agent-namens/aanmaken', { agent: 'claude', ruimte: 'technisch', minuten: 60, omvang: ['uitrol'] });
    check('TOTP telt hier niet (alleen passkey) → 403', totp.status === 403);
    wie = lid;
    await passkeyStapOpVastleggen(lid as never);
    const alsLid = await post('POST /api/owner/agent-namens/aanmaken', { agent: 'claude', ruimte: 'technisch', minuten: 60, omvang: ['uitrol'] });
    check('niet-eigenaar → 403 OWNER_REQUIRED, ook met passkey', alsLid.status === 403 && alsLid.data.error === 'OWNER_REQUIRED');
    wie = auth;
    await passkeyStapOpVastleggen(auth as never);
    const ok = await post('POST /api/owner/agent-namens/aanmaken', { agent: 'claude', ruimte: 'technisch', minuten: 999, omvang: ['uitrol', 'bestaat-niet'] });
    const ns = ok.data.sessie as an.NamensSessie;
    check('met passkey → aangemaakt; duur begrensd tot 8 u; onbekende omvang valt weg', ok.status === 200 && !!ns?.id && ns.verlooptOp - ns.aangemaaktOp <= 8 * 3600_000 + 60_000 && ns.omvang.join() === 'uitrol', JSON.stringify(ok.data).slice(0, 160));
    check('antwoord bevat geen cookie of token', !/cookie|token|tvh_/i.test(JSON.stringify(ok.data)));
    const tweede = await post('POST /api/owner/agent-namens/aanmaken', { agent: 'claude', ruimte: 'technisch', minuten: 15, omvang: ['uitrol'] });
    check('de passkey-bevestiging is na één aanmaak verbruikt → volgende vraagt opnieuw (403)', tweede.status === 403);
    const lijst = await post('POST /api/owner/agent-namens/lijst', {});
    check('lijst: actieve namens-sessie + spooksessies zichtbaar voor de eigenaar', lijst.status === 200 && lijst.data.actief.some((s: any) => s.id === ns.id) && lijst.data.spoken.length >= 1);
    const logAan = (await sys.query("SELECT count(*)::int AS n FROM app.audit WHERE action = 'agent.namens.aangemaakt' AND details->'details'->>'namensId' = $1 OR (action = 'agent.namens.aangemaakt' AND details::text LIKE $2)", [ns.id, `%${ns.id}%`])).rows[0].n;
    check('aanmaken staat in het journaal (agent.namens.aangemaakt)', logAan >= 1, String(logAan));
    let teLang = false;
    try { await sys.query("INSERT INTO app.agent_namens_sessies (user_id, agent, ruimte, omvang, verloopt_op) VALUES ($1, 'claude', 'technisch', '{uitrol}', now() + interval '9 hours')", [E.id]); } catch { teLang = true; }
    check('database weigert een namens-sessie langer dan 8 uur (CHECK)', teLang);

    // ---------------------------------------------------------- callSite: alleen met actieve toestemming, alleen omvang, nooit verboden routes
    const gezien: Array<{ route: string; namens?: { namensId: string; agent: string } }> = [];
    zetSiteAanroeper(async (_u, _s, route, _b, namens) => { gezien.push({ route, namens }); return { status: 200, data: { ok: true } }; });
    const via = (agent: string, ruimte: 'prive' | 'technisch', route: string) => metNamens({ client: agent, agent, ruimte }, () => callSite(E.id, 'admin', route, {})).then(() => 'ok', (e) => (e as Error).message);
    check('claude (technisch) + omvang uitrol → uitrol/runs mag, met namens-id meegegeven', (await via('claude', 'technisch', 'POST /api/owner/uitrol/runs')) === 'ok' && gezien.at(-1)?.namens?.namensId === ns.id);
    check('buiten de omvang (admin/overview) → NAMENS_SESSIE_VEREIST', (await via('claude', 'technisch', 'POST /api/owner/admin/overview')) === 'NAMENS_SESSIE_VEREIST');
    check('andere agent (grok) → NAMENS_SESSIE_VEREIST', (await via('grok', 'technisch', 'POST /api/owner/uitrol/runs')) === 'NAMENS_SESSIE_VEREIST');
    check('zelfde agent maar privéruimte → NAMENS_SESSIE_VEREIST', (await via('claude', 'prive', 'POST /api/owner/uitrol/runs')) === 'NAMENS_SESSIE_VEREIST');
    check('zonder agent (oude /mcp-koppeling) → NAMENS_SESSIE_VEREIST', (await metNamens({ client: 'x' }, () => callSite(E.id, 'admin', 'POST /api/owner/uitrol/runs', {})).then(() => 'ok', (e) => (e as Error).message)) === 'NAMENS_SESSIE_VEREIST');
    const verb = await Promise.all(['POST /api/owner/geheimen/lijst', 'POST /api/owner/access/passkeys/registreren', 'POST /api/owner/identity/account/delete', 'POST /api/owner/agent-namens/aanmaken'].map((r) => via('claude', 'technisch', r)));
    check('hek 1: verboden routes → AGENT_NIET_TOEGESTAAN, ook met actieve namens-sessie', verb.every((x) => x === 'AGENT_NIET_TOEGESTAAN'), verb.join(','));
    const acties = Number((await sys.query('SELECT acties FROM app.agent_namens_sessies WHERE id = $1', [ns.id])).rows[0]?.acties || 0);
    check('elk gebruik geteld (acties)', acties === 1, String(acties));
    zetSiteAanroeper(null);

    // hek 2: ownerRequireSession weigert een gedelegeerd verzoek naar een verboden route, ook als hek 1 ooit gemist wordt
    const h2 = await echteAanroepZonderHekVoorTest(E.id, 'admin', 'POST /api/owner/geheimen/lijst', {}, { namensId: ns.id, agent: 'claude' });
    check('hek 2: gedelegeerd verzoek naar «Секрети й ключі» → AGENT_NIET_TOEGESTAAN (ownerRequireSession)', h2.data?.error === 'AGENT_NIET_TOEGESTAAN' && h2.status >= 400, `${h2.status} ${JSON.stringify(h2.data).slice(0, 80)}`);
    // echt door de site: uitrol/runs met de namens-sessie werkt
    const echt = await metNamens({ client: 'claude', agent: 'claude', ruimte: 'technisch' }, () => callSite(E.id, 'admin', 'POST /api/owner/uitrol/runs', { pagina: 1, perPagina: 5 }));
    check('echte site-route uitrol/runs met namens-sessie → 200', echt.status === 200, `${echt.status} ${JSON.stringify(echt.data).slice(0, 80)}`);

    // ---------------------------------------------------------- journaal: elke regel in zo'n verzoek = agent, «від імені»
    const merk = `test-${randomUUID()}`;
    await metVerzoek('POST /api/owner/uitrol/runs', async () => { zetNamens(ns.id, 'claude'); await auditToevoegen({ ownerId: E.id, actorId: E.id, action: 'test.agent_namens', details: { merk } }); });
    const r = (await sys.query("SELECT details, ctx_namens FROM app.audit WHERE action = 'test.agent_namens' AND details->>'merk' = $1", [merk])).rows[0];
    check('journaal: actorType=agent, agent=claude en «від імені» (ctx_namens) = namens-sessie', r?.details?.actorType === 'agent' && r?.details?.agent === 'claude' && String(r?.ctx_namens || r?.details?._ctx?.namens) === ns.id, JSON.stringify(r).slice(0, 200));

    // ---------------------------------------------------------- intrekken en verlopen
    const ik = await post('POST /api/owner/agent-namens/intrekken', { id: ns.id, reden: 'test' });
    check('intrekken door de eigenaar → ok', ik.status === 200 && !!ik.data.sessie?.ingetrokkenOp);
    zetSiteAanroeper(async () => ({ status: 200, data: {} }));
    check('na intrekken: de volgende aanroep van de agent wordt meteen geweigerd', (await via('claude', 'technisch', 'POST /api/owner/uitrol/runs')) === 'NAMENS_SESSIE_VEREIST');
    await sys.query("INSERT INTO app.agent_namens_sessies (user_id, agent, ruimte, omvang, aangemaakt_op, verloopt_op) VALUES ($1, 'claude', 'technisch', '{uitrol}', now() - interval '2 hours', now() - interval '1 hour')", [E.id]);
    check('verlopen namens-sessie geldt niet', (await via('claude', 'technisch', 'POST /api/owner/uitrol/runs')) === 'NAMENS_SESSIE_VEREIST');
    zetSiteAanroeper(null);

    // ---------------------------------------------------------- spooksessies definitief opruimen: alleen met passkey
    const geenPk = await post('POST /api/owner/agent-namens/spoken/opruimen', {});
    check('spooksessies opruimen zonder passkey → 403', geenPk.status === 403);
    await passkeyStapOpVastleggen(auth as never);
    const weg = await post('POST /api/owner/agent-namens/spoken/opruimen', {});
    const over = (await sys.query("SELECT count(*)::int AS n FROM app.records WHERE tbl='owner_service_sessions_v1' AND data->>'authMethod'='agent-token' AND data->>'userId'=$1", [E.id])).rows[0].n;
    check('met passkey → definitief gewist en gelogd', weg.status === 200 && weg.data.verwijderd >= 1 && over === 0, `${weg.status} ${over}`);
  } finally {
    zetSiteAanroeper(null);
    await sys.query("DELETE FROM app.records WHERE tbl='owner_service_sessions_v1' AND id = ANY($1::text[])", [sessieRijen]).catch(() => undefined);
    await sys.query('DELETE FROM app.agent_namens_sessies WHERE user_id = $1', [E.id]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl='users' AND id = $1", [U]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl='owner_step_up_v1' AND data->>'userId' = ANY($1::text[])", [[E.id, U]]).catch(() => undefined);
    if (tijdelijkeEigenaar) await sys.query("DELETE FROM app.records WHERE tbl='users' AND id = $1", [tijdelijkeEigenaar]).catch(() => undefined);
  }
  await closePool();
  return einde();
}
