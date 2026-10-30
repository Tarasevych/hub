// Regressietests Local Machine Connector (migrations/0009_agents.sql, backend/connectors-*.ts):
// koppelcodes (eenmalig, verloopt, limiet per gebruiker), isolatie tussen gebruikers onder RLS,
// atomaire statusovergangen van opdrachten en het intrekken van agents.
// Draait tegen een wegwerp-PG met de drie rollen (DATABASE_URL_APP/_SYSTEM/_MIGRATIE).
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COMMAND_TYPES } from '../../backend/connectors-gateway';
import { metVerzoek, zetGebruiker } from '../../server/platform/context';
import { appRolActief, closePool, getPool } from '../../server/platform/pg';
import * as store from '../../backend/connectors-opslag';
import { normalizePairingCode, pairingCode, randomToken, sha256 } from '../../backend/connectors-crypto';
import { checker } from './hulp/nep-google';

const ROUTE = 'POST /api/eenheid/agents';
const als = <T>(userId: string, fn: () => Promise<T>) => metVerzoek(ROUTE, async () => { zetGebruiker(userId, 'eenheid'); return fn(); });

export async function main(): Promise<number> {
  const { check, einde } = checker('agenten');
  if (!appRolActief() || !process.env.DATABASE_URL_MIGRATIE) { console.log('OVERGESLAGEN agents: rollen niet ingesteld'); await closePool(); return 0; }
  const sys = getPool('systeem'), mig = getPool('migratie');
  const vorigeStand = (await mig.query("SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'")).rows[0]?.waarde === 'aan' ? 'aan' : 'uit';
  const stand = (w: 'aan' | 'uit') => mig.query("UPDATE app.rls_instellingen SET waarde = $1 WHERE sleutel = 'afdwingen'", [w]);
  const A = `agents-a-${randomUUID()}`, B = `agents-b-${randomUUID()}`;

  // Rechtstreekse query als mijnruimte_app in de context van een gebruiker (RLS), om de policy zelf te toetsen.
  const alsApp = async (userId: string, sql: string, params: unknown[] = []) => {
    const c = await getPool('app').connect();
    try {
      await c.query('BEGIN');
      await c.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      const r = await c.query(sql, params);
      await c.query('COMMIT');
      return r;
    } catch (err) { await c.query('ROLLBACK').catch(() => undefined); throw err; } finally { c.release(); }
  };

  try {
    // ---- hulpfuncties voor koppelcodes ----
    const code = pairingCode();
    check('koppelcode: 8 tekens uit het alfabet zonder O/0/I/1', /^[A-HJ-NP-Z2-9]{8}$/.test(code), code);
    check('koppelcode normaliseren (streepjes, spaties, kleine letters)', normalizePairingCode('ab-cd 23x9') === 'ABCD23X9');
    check('sha256 is deterministisch en 64 hex lang', sha256('x') === sha256('x') && /^[a-f0-9]{64}$/.test(sha256('x')));
    check('tokens zijn uniek en lang genoeg', randomToken() !== randomToken() && randomToken().length >= 43);

    await stand('aan');

    // ---- koppelcodes: eenmalig, verlopen, limiet per gebruiker ----
    const hashA = sha256(`A-${randomUUID()}`);
    const verloopt = await als(A, () => store.createPairingCode(A, hashA));
    const eerste = await store.consumePairingCode(hashA);
    const tweede = await store.consumePairingCode(hashA);
    check('koppelcode: eerste inwisseling geeft de eigenaar, tweede (hergebruik) niets', !!verloopt && (eerste as { userId?: string } | null)?.userId === A && tweede === null, JSON.stringify({ eerste, tweede }));

    const oud = sha256(`oud-${randomUUID()}`);
    await sys.query("INSERT INTO app.agent_pairing_codes (code_hash, user_id, expires_at) VALUES ($1, $2, now() - interval '1 minute')", [oud, A]);
    check('verlopen koppelcode wordt niet geaccepteerd', (await store.consumePairingCode(oud)) === null);
    check('onbekende koppelcode wordt niet geaccepteerd', (await store.consumePairingCode(sha256('bestaat-niet'))) === null);

    await sys.query('DELETE FROM app.agent_pairing_codes WHERE user_id = ANY($1)', [[A, B]]);
    const uitslagA: Array<Date | null> = [];
    for (let i = 0; i < store.AGENT_LIMITS.pairingCodesPer10Min + 1; i++) uitslagA.push(await als(A, () => store.createPairingCode(A, sha256(`lim-${A}-${i}`))));
    const voorB = await als(B, () => store.createPairingCode(B, sha256(`lim-${B}-0`)));
    check('limiet koppelcodes geldt per gebruiker: A krijgt er 5, de 6e niet; B is niet geraakt',
      uitslagA.slice(0, 5).every(Boolean) && uitslagA[5] === null && !!voorB, JSON.stringify(uitslagA.map(Boolean)));

    // ---- agents: token-opzoeking, isolatie, intrekken ----
    const tokenA = randomToken(), tokenB = randomToken();
    const agentA = await store.createAgent(A, 'pc van A', 'win32-x64', sha256(tokenA), { roots: ['D:\\a'] });
    const agentB = await store.createAgent(B, 'pc van B', 'linux-x64', sha256(tokenB), {});
    const gevonden = await store.findAgentByTokenHash(sha256(tokenA));
    check('token-opzoeking op hash geeft de juiste agent en gebruiker; onbekend token niets',
      gevonden?.id === agentA.id && gevonden.user_id === A && (await store.findAgentByTokenHash(sha256('fout'))) === null);

    const lijstA = await als(A, () => store.listAgents(A));
    const vreemd = await als(A, () => store.getAgent(A, agentB.id));
    const opB = await als(A, () => store.listAgents(B));
    check('gebruiker A ziet alleen zijn eigen agent; die van B niet (via id, noch via lijst met B\'s id)',
      lijstA.length === 1 && lijstA[0].id === agentA.id && vreemd === null && opB.length === 0, JSON.stringify({ lijstA: lijstA.length, vreemd, opB: opB.length }));

    const rijenZichtbaar = (await alsApp(A, 'SELECT user_id FROM app.agents WHERE user_id = ANY($1)', [[A, B]])).rows.map((r) => r.user_id);
    check('RLS (afdwingen aan): zelfs een query zonder user_id-filter toont alleen eigen rijen', rijenZichtbaar.length === 1 && rijenZichtbaar[0] === A, JSON.stringify(rijenZichtbaar));
    let insertAlsAnder = 'geen fout';
    try { await alsApp(A, "INSERT INTO app.agents (user_id, name, token_hash) VALUES ($1, 'nep', $2)", [B, sha256(randomUUID())]); } catch (e) { insertAlsAnder = String((e as Error).message); }
    check('RLS: een agent aanmaken namens een andere gebruiker wordt geweigerd', /row-level security/i.test(insertAlsAnder), insertAlsAnder);
    const wijzigAnder = await alsApp(A, "UPDATE app.agents SET name = 'gekaapt' WHERE id = $1", [agentB.id]);
    check('RLS: een agent van een ander wijzigen raakt 0 rijen', wijzigAnder.rowCount === 0);

    check('countAgents telt per gebruiker', (await als(A, () => store.countAgents(A))) === 1 && (await als(B, () => store.countAgents(B))) === 1);
    check('intrekken van andermans agent mislukt, van eigen lukt',
      (await als(A, () => store.revokeAgent(A, agentB.id))) === false && (await als(A, () => store.revokeAgent(A, agentA.id))) === true);
    check('ingetrokken agent: token werkt niet meer en staat niet meer in de lijst',
      (await store.findAgentByTokenHash(sha256(tokenA))) === null && (await als(A, () => store.listAgents(A))).length === 0);

    // ---- opdrachten: atomaire overgangen, isolatie ----
    const cmd = await als(B, () => store.createCommand(agentB.id, B, 'fs.write', { path: 'x.txt', content: 'hoi' }, 'pending_approval'));
    check('opdracht start als pending_approval', cmd.status === 'pending_approval');
    check('opdracht van B is niet leesbaar voor A', (await als(A, () => store.getCommand(A, cmd.id))) === null && !!(await als(B, () => store.getCommand(B, cmd.id))));
    check('goedkeuren namens een andere gebruiker mislukt', (await store.transitionCommand(cmd.id, ['pending_approval'], 'approved', undefined, A)) === null);
    const goed = await store.transitionCommand(cmd.id, ['pending_approval'], 'approved', undefined, B);
    const dubbel = await store.transitionCommand(cmd.id, ['pending_approval'], 'approved', undefined, B);
    check('goedkeuren werkt één keer; dubbel goedkeuren geeft null', goed?.status === 'approved' && dubbel === null);
    check('weigeren na goedkeuring kan niet', (await store.transitionCommand(cmd.id, ['pending_approval'], 'rejected', undefined, B)) === null);
    await store.transitionCommand(cmd.id, ['approved'], 'sent');
    check('resultaat van een andere gebruiker wordt genegeerd', (await store.transitionCommand(cmd.id, ['sent'], 'succeeded', { data: 1 }, A)) === null);
    const klaar = await store.transitionCommand(cmd.id, ['sent'], 'succeeded', { data: { ok: 1 } }, B);
    check('resultaat van de eigen agent sluit de opdracht af', klaar?.status === 'succeeded' && klaar.result?.data?.ok === 1 && !!klaar.finished_at);

    const trage = await als(B, () => store.createCommand(agentB.id, B, 'exec', { command: 'git' }, 'approved'));
    await store.transitionCommand(trage.id, ['approved'], 'sent');
    await store.transitionCommand(trage.id, ['sent'], 'timeout', { error: 'agent did not respond in time' });
    check('een laat resultaat na een time-out verandert de stand niet meer', (await store.transitionCommand(trage.id, ['sent'], 'succeeded', { data: 1 }, B)) === null);

    const wachtend = await als(B, () => store.listPendingCommands(B));
    await als(B, () => store.createCommand(agentB.id, B, 'fs.write', { path: 'y' }, 'pending_approval'));
    check('lijst wachtende opdrachten per gebruiker', wachtend.length === 0 && (await als(B, () => store.listPendingCommands(B))).length === 1 && (await als(A, () => store.listPendingCommands(A))).length === 0);

    const laatsteB = await als(B, () => store.lastCommandPerAgent(B));
    const laatsteA = await als(A, () => store.lastCommandPerAgent(A));
    check('laatste opdracht per agent: één rij per agent (de nieuwste), alleen van de eigen gebruiker',
      laatsteB.length === 1 && laatsteB[0].agent_id === agentB.id && laatsteB[0].status === 'pending_approval' && laatsteA.length === 0,
      JSON.stringify(laatsteB.map((c: any) => [c.type, c.status])));

    const recentB = await als(B, () => store.listRecentCommands(B, 60));
    const recentA = await als(A, () => store.listRecentCommands(A, 60));
    check('recente opdrachten (activiteitenoverzicht): alleen de eigen gebruiker, nieuwste eerst, met naam en platform van het apparaat',
      recentB.length >= 1 && recentB.every((r: any) => r.agent_name === agentB.name) && recentA.every((r: any) => r.agent_id !== agentB.id)
      && recentB.every((r: any, i: number) => i === 0 || new Date(recentB[i - 1].created_at).getTime() >= new Date(r.created_at).getTime()), JSON.stringify(recentB.map((r: any) => [r.type, r.status, r.platform])));

    check('opdracht met onbekend type wordt door de database geweigerd',
      await sys.query("INSERT INTO app.agent_commands (agent_id, user_id, type) VALUES ($1, $2, 'rm -rf')", [agentB.id, B]).then(() => false, () => true));

    // ---- status ----
    await store.setAgentStatus(agentB.id, 'connected', { roots: ['/b'] });
    const verbonden = (await sys.query('SELECT status, capabilities FROM app.agents WHERE id = $1', [agentB.id])).rows[0];
    await store.markAllAgentsDisconnected();
    const na = (await sys.query('SELECT status FROM app.agents WHERE id = $1', [agentB.id])).rows[0];
    check('status Connected met capabilities, na herstart weer Disconnected', verbonden.status === 'connected' && verbonden.capabilities.roots[0] === '/b' && na.status === 'disconnected');

    // ---- 0011: nieuwe opdrachttypes (docker, metrics) en beleid ----
    const def = (await sys.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid = 'app.agent_commands'::regclass AND conname = 'agent_commands_type_check'`)).rows[0]?.d ?? '';
    const inDb = [...def.matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    check('CHECK op agent_commands.type komt exact overeen met COMMAND_TYPES in de code (geen drift)', JSON.stringify(inDb) === JSON.stringify([...COMMAND_TYPES].sort()), def.slice(0, 200));
    const geaccepteerd: boolean[] = [];
    for (const t of ['docker.ps', 'docker.manage', 'sys.metrics']) {
      geaccepteerd.push(await sys.query('INSERT INTO app.agent_commands (agent_id, user_id, type) VALUES ($1, $2, $3)', [agentB.id, B, t]).then(() => true, () => false));
    }
    check('de database accepteert docker.ps, docker.manage en sys.metrics', geaccepteerd.every(Boolean));

    const nieuw = await store.createAgent(B, 'nieuw-beleid', null, sha256(randomUUID()), {});
    const standaard: string[] = (await sys.query('SELECT policy FROM app.agents WHERE id = $1', [nieuw.id])).rows[0].policy.autoApprove;
    check('standaardbeleid van een nieuwe agent: alle leestypes automatisch (ook sys.metrics, docker.ps); schrijven, uitvoeren en docker.manage nooit',
      ['fs.read', 'fs.list', 'sys.info', 'sys.metrics', 'docker.ps'].every((t) => standaard.includes(t)) && !standaard.some((t) => ['fs.write', 'exec', 'docker.manage'].includes(t)), standaard.join(','));

    // De migratie opnieuw draaien op oude beleidsrijen (zoals bij een bestaande agent) en controleren dat ze netjes wordt aangevuld.
    const oudA = await store.createAgent(B, 'oud-beleid', null, sha256(randomUUID()), {});
    const kapot = await store.createAgent(B, 'kapot-beleid', null, sha256(randomUUID()), {});
    await sys.query(`UPDATE app.agents SET policy = '{"autoApprove": ["fs.read", "fs.list", "sys.info"]}' WHERE id = $1`, [oudA.id]);
    await sys.query(`UPDATE app.agents SET policy = '{}' WHERE id = $1`, [kapot.id]);
    const migratie = readFileSync(join(process.cwd(), 'migrations', '0011_agents_docker_metrics.sql'), 'utf8');
    await mig.query(migratie);
    const pol = async (id: string): Promise<string[]> => (await sys.query('SELECT policy FROM app.agents WHERE id = $1', [id])).rows[0].policy.autoApprove;
    const na1 = await pol(oudA.id), na1k = await pol(kapot.id);
    await mig.query(migratie); // idempotent
    const na2 = await pol(oudA.id);
    // 0011 zet de CHECK terug op 8 typen; herstel de nieuwste stand (0012) zodat latere testgroepen niet een oude database zien.
    // alle latere migraties (0012, 0013, ...) opnieuw: ze zijn idempotent en herstellen samen de nieuwste stand
    for (const f of readdirSync(join(process.cwd(), 'migrations')).filter((n) => /^00(1[2-9]|[2-9]\d)_.*\.sql$/.test(n)).sort()) await mig.query(readFileSync(join(process.cwd(), 'migrations', f), 'utf8'));
    check('na het herhalen van 0011 herstellen de latere migraties de volledige typelijst (zelfde als COMMAND_TYPES)',
      JSON.stringify(((await sys.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid = 'app.agent_commands'::regclass AND conname = 'agent_commands_type_check'`)).rows[0].d.match(/'([a-z_.]+)'::text/g) ?? []).map((m: string) => m.slice(1, m.indexOf("'", 1))).sort())
      === JSON.stringify([...COMMAND_TYPES].sort()));
    check('migratie 0011 vult bestaande beleidsrijen aan met de twee leestypes, behoudt de oude, voegt docker.manage nooit toe en repareert een lege lijst',
      ['fs.read', 'fs.list', 'sys.info', 'sys.metrics', 'docker.ps'].every((t) => na1.includes(t)) && !na1.includes('docker.manage') && na1.length === 5
      && na1k.includes('sys.metrics') && na1k.includes('docker.ps') && !na1k.includes('docker.manage'), JSON.stringify([na1, na1k]));
    check('migratie 0011 is idempotent: een tweede keer draaien verandert niets en maakt geen dubbelen', JSON.stringify(na2) === JSON.stringify(na1) && new Set(na2).size === na2.length);

    // ---- verwijderen van een agent verwijdert zijn opdrachten ----
    await sys.query('DELETE FROM app.agents WHERE id = $1', [agentB.id]);
    check('opdrachten verdwijnen mee met de agent (ON DELETE CASCADE)', (await sys.query('SELECT count(*)::int AS n FROM app.agent_commands WHERE agent_id = $1', [agentB.id])).rows[0].n === 0);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    {
      const o1 = await store.createAgent(A, 'Chrome (Win32)', 'browser', sha256(randomUUID()), {});
      const o2 = await store.createAgent(A, 'Chrome (Win32)', 'browser', sha256(randomUUID()), {});
      const o3 = await store.createAgent(A, 'Edge (Win32)', 'browser', sha256(randomUUID()), {});
      const weg = await store.revokeOlderBrowserAgents(A, 'Chrome (Win32)', o2.id);
      const rest = (await store.listAgents(A)).map((x) => x.id);
      check('opnieuw koppelen van dezelfde browser vervangt de oude koppeling (één agent per browsernaam), andere browsers en gebruikers blijven', weg.length === 1 && weg[0] === o1.id && rest.includes(o2.id) && rest.includes(o3.id) && !rest.includes(o1.id));
    }
    {
      const { createAgentRoutes } = await import('../../backend/connectors-routes');
      const routes: any = createAgentRoutes({ requireSession: async () => ({ errorCode: 'X' }), respond: (d: unknown, st = 200) => ({ statusCode: st, body: JSON.stringify(d) }), fail: (m: string, st = 400) => ({ statusCode: st, body: JSON.stringify({ error: m }) }), audit: async () => undefined, body: (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {}) });
      const tok = randomToken();
      await store.createAgent(A, 'self-test', 'browser', sha256(tok), {});
      const viaGet: any = await routes['GET /api/owner/agents/self'][0]({ event: { headers: { Authorization: `Bearer ${tok}` } }, body: null });
      const viaPost: any = await routes['POST /api/owner/agents/self'][0]({ event: { headers: {} }, body: { token: tok } });
      const fout: any = await routes['GET /api/owner/agents/self'][0]({ event: { headers: { authorization: 'Bearer ' + 'x'.repeat(40) } }, body: null });
      const leeg: any = await routes['GET /api/owner/agents/self'][0]({ event: { headers: {} }, body: null });
      check('extensiestatus via GET met Authorization-header (zonder CSRF-uitzondering) en via POST (oude extensies): zelfde antwoord; onbekend of ontbrekend token = 401',
        viaGet.statusCode === 200 && JSON.parse(viaGet.body).enabled === false && viaPost.statusCode === 200 && viaPost.body === viaGet.body && fout.statusCode === 401 && leeg.statusCode === 401, JSON.stringify([viaGet, fout, leeg]));
    }
    {
      // ---- audit fase 2: POST /api/owner/agents/opruimen (knop «Прибрати відключені (N)» in #apparaten) ----
      const { createAgentRoutes } = await import('../../backend/connectors-routes');
      const audits: Array<{ action: string; details?: Record<string, unknown> }> = [];
      const sessieA = { user: { id: A, email: 'a@test.invalid', role: 'user', status: 'approved', entitlements: ['api-platform'] }, service: 'mcp' };
      const routes: any = createAgentRoutes({ requireSession: async () => sessieA as never, respond: (d: unknown, st = 200) => ({ statusCode: st, body: JSON.stringify(d) }), fail: (m: string, st = 400) => ({ statusCode: st, body: JSON.stringify({ error: m }) }), audit: async (_u, action, _r, details) => { audits.push({ action, details }); }, body: (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {}) });
      await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1)', [[A, B]]);
      const weg1 = await store.createAgent(A, 'oud-browser', 'browser', sha256(randomUUID()), {});
      const weg2 = await store.createAgent(A, 'oude-pc', 'machine', sha256(randomUUID()), {});
      const blijft = await store.createAgent(A, 'blijft-verbonden', 'machine', sha256(randomUUID()), {});
      const recent = await store.createAgent(A, 'recent-offline', 'machine', sha256(randomUUID()), {});
      const vanB = await store.createAgent(B, 'van-B-oud', 'browser', sha256(randomUUID()), {});
      await als(A, () => store.revokeAgent(A, weg1.id));
      await als(B, () => store.revokeAgent(B, vanB.id));
      await sys.query("UPDATE app.agents SET status = 'disconnected', last_seen_at = now() - interval '9 days' WHERE id = $1", [weg2.id]);
      await sys.query("UPDATE app.agents SET status = 'connected', last_seen_at = now() - interval '9 days' WHERE id = $1", [blijft.id]);
      await sys.query("UPDATE app.agents SET status = 'disconnected', last_seen_at = now() - interval '2 days' WHERE id = $1", [recent.id]);
      await als(A, () => store.createCommand(weg1.id, A, 'fs.read', { path: 'x' }, 'pending_approval'));
      const r: any = await als(A, () => routes['POST /api/owner/agents/opruimen'][0]({ event: { headers: {} }, body: { service: 'mcp' } }));
      const uit = JSON.parse(r.body);
      const over = (await sys.query('SELECT id, user_id FROM app.agents WHERE user_id = ANY($1) ORDER BY name', [[A, B]])).rows.map((x) => x.id);
      const cmdWeg = (await sys.query('SELECT count(*)::int AS n FROM app.agent_commands WHERE agent_id = $1', [weg1.id])).rows[0].n;
      check('opruimen: losgekoppelde rij + apparaat > 7 dagen offline weg; verbonden en recent offline blijven; andermans rij blijft; opdrachten mee (cascade)',
        r.statusCode === 200 && uit.ok === true && uit.aantal === 2 && uit.losgekoppeld === 1 && uit.verouderd === 1
        && over.length === 3 && over.includes(blijft.id) && over.includes(recent.id) && over.includes(vanB.id) && !over.includes(weg1.id) && !over.includes(weg2.id) && cmdWeg === 0, JSON.stringify({ uit, over }));
      check('opruimen: één journaalregel owner.agent.opgeruimd met aantal en namen; tweede keer niets te doen en geen regel', audits.length === 1 && audits[0].action === 'owner.agent.opgeruimd' && audits[0].details?.aantal === 2 && JSON.stringify(audits[0].details?.namen).includes('oud-browser')
        && JSON.parse((await als(A, () => routes['POST /api/owner/agents/opruimen'][0]({ event: { headers: {} }, body: {} }))).body).aantal === 0 && audits.length === 1, JSON.stringify(audits));
      const geenSessie: any = createAgentRoutes({ requireSession: async () => ({ errorCode: 'X' }), respond: (d: unknown, st = 200) => ({ statusCode: st, body: JSON.stringify(d) }), fail: (m: string, st = 400) => ({ statusCode: st, body: JSON.stringify({ error: m }) }), audit: async () => undefined, body: () => ({}) });
      check('opruimen: zonder sessie geweigerd', (await geenSessie['POST /api/owner/agents/opruimen'][0]({ event: { headers: {} }, body: {} })).statusCode >= 400);
    }
    await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1)', [[A, B]]);
    await sys.query('DELETE FROM app.agent_pairing_codes WHERE user_id = ANY($1)', [[A, B]]);
    await stand(vorigeStand);
  }
  await closePool();
  return einde();
}
