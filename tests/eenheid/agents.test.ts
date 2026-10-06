// Regressietests Local Machine Connector (migrations/0009_agents.sql, backend/connectors-*.ts):
// koppelcodes (eenmalig, verloopt, limiet per gebruiker), isolatie tussen gebruikers onder RLS,
// atomaire statusovergangen van opdrachten en het intrekken van agents.
// Draait tegen een wegwerp-PG met de drie rollen (DATABASE_URL_APP/_SYSTEM/_MIGRATIE).
import { randomUUID } from 'node:crypto';
import { metVerzoek, zetGebruiker } from '../../server/platform/context';
import { appRolActief, closePool, getPool } from '../../server/platform/pg';
import * as store from '../../backend/connectors-store';
import { normalizePairingCode, pairingCode, randomToken, sha256 } from '../../backend/connectors-crypto';
import { checker } from './hulp/nep-google';

const ROUTE = 'POST /api/eenheid/agents';
const als = <T>(userId: string, fn: () => Promise<T>) => metVerzoek(ROUTE, async () => { zetGebruiker(userId, 'eenheid'); return fn(); });

export async function main(): Promise<number> {
  const { check, einde } = checker('agents');
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
    check('koppelcode: eerste inwisseling geeft de eigenaar, tweede (hergebruik) niets', !!verloopt && eerste === A && tweede === null, JSON.stringify({ eerste, tweede }));

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

    check('opdracht met onbekend type wordt door de database geweigerd',
      await sys.query("INSERT INTO app.agent_commands (agent_id, user_id, type) VALUES ($1, $2, 'rm -rf')", [agentB.id, B]).then(() => false, () => true));

    // ---- status ----
    await store.setAgentStatus(agentB.id, 'connected', { roots: ['/b'] });
    const verbonden = (await sys.query('SELECT status, capabilities FROM app.agents WHERE id = $1', [agentB.id])).rows[0];
    await store.markAllAgentsDisconnected();
    const na = (await sys.query('SELECT status FROM app.agents WHERE id = $1', [agentB.id])).rows[0];
    check('status Connected met capabilities, na herstart weer Disconnected', verbonden.status === 'connected' && verbonden.capabilities.roots[0] === '/b' && na.status === 'disconnected');

    // ---- verwijderen van een agent verwijdert zijn opdrachten ----
    await sys.query('DELETE FROM app.agents WHERE id = $1', [agentB.id]);
    check('opdrachten verdwijnen mee met de agent (ON DELETE CASCADE)', (await sys.query('SELECT count(*)::int AS n FROM app.agent_commands WHERE agent_id = $1', [agentB.id])).rows[0].n === 0);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1)', [[A, B]]);
    await sys.query('DELETE FROM app.agent_pairing_codes WHERE user_id = ANY($1)', [[A, B]]);
    await stand(vorigeStand);
  }
  await closePool();
  return einde();
}
