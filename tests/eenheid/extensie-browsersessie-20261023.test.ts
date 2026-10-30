// «До закриття браузера» en de herstartregel van de termijnen (zone E, 23.10.2026; migratie 0111, backend/extensie-ontgrendeling.ts
// browserSessieAfstemmen/sessieVoorRij/naUitloggen, extension/background.js browserSessie()). Echte gateway + WebSocket, zoals
// extensie-ontgrendeling.test.ts: een nagebootste extensie meldt bij 'auth' haar browsersessie-id.
//  - korte termijnen (15 хв … 4 год, tot het einde van de activering) en «до закриття браузера» hangen aan de browsersessie: dezelfde
//    sessie (service worker sliep, netwerk weg) → de ontgrendeling komt terug; een ANDERE sessie (browser herstart) → ingetrokken
//    (reden 'browser-gesloten', 'vergrendel' naar de extensie, audit), niets meer opnieuw gestuurd;
//  - lange termijnen (1 тиждень …, «до виходу», «до відкликання») overleven een herstart (browser_sessie NULL);
//  - geopend terwijl de extensie offline was → '?' → de eerste verbinding bindt;
//  - extensie < 0.7.0: «до закриття браузера» → TERMIJN_VEREIST_UPDATE; korte termijnen niet gebonden (oud gedrag);
//  - aanval: de verbinding van account B (ook met A's sessie-id of rommel) raakt de rijen van A nooit; rommel = geen sessie;
//  - «Вихід з акаунта завжди скидає»: naUitloggen trekt ELKE soort in (ook 1 тиждень), alleen van dat account.
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { newCommandKey, randomToken, sealCommandKey, sha256 } from '../../backend/connectors-crypto';
import { attachAgentGateway } from '../../backend/connectors-gateway';
import * as store from '../../backend/connectors-opslag';
import * as matrix from '../../backend/extensie-matrix';
import * as eo from '../../backend/extensie-ontgrendeling';
import { totpStapOpVastleggen } from '../../backend/stap-op';
import { closePool, getPool } from '../../server/platform/pg';
import { aanBrowserGebonden, termijnVan } from '../../shared/extensie-matrix';
import { checker } from './hulp/nep-google';
import { aiDienstAan, aiDienstOpruimen } from './hulp/ruimte-ai';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function tot(fn: () => Promise<boolean> | boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await sleep(40); }
  return false;
}
const code = async (p: Promise<unknown>): Promise<string> => p.then(() => 'OK', (e) => (e instanceof eo.Weigering ? e.code : `ANDERS:${(e as Error).message}`));
const S = () => randomBytes(16).toString('hex'); // 32 tekens [0-9a-f], zoals crypto.randomUUID() zonder streepjes in de extensie

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-browsersessie-20261023');
  const sys = getPool('systeem');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const A = `ebs-a-${T}`, B = `ebs-b-${T}`;
  const server = createServer();
  attachAgentGateway(server, new Set(['127.0.0.1']));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  const verplaatst = (await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner-tijdelijk\"') WHERE tbl = 'users' AND data->>'role' = 'owner' RETURNING id")).rows.map((r: { id: string }) => r.id);

  /** Nagebootste extensie: verbindt met haar token (en, vanaf 0.7.0, de browsersessie) en bewaart elk bericht. */
  const verbind = (token: string, o: { versie?: string; sessie?: unknown } = {}) => new Promise<{ ws: WebSocket; berichten: Array<Record<string, unknown>> }>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/agent/ws`); sockets.push(ws);
    const berichten: Array<Record<string, unknown>> = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'auth', token, version: o.versie ?? '0.7.0', capabilities: { kind: 'browser' }, ...(o.sessie === undefined ? {} : { sessie: o.sessie }) })));
    ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); berichten.push(m); if (m.t === 'ready') resolve({ ws, berichten }); });
    ws.on('error', reject);
  });
  const dicht = async (x: { ws: WebSocket }) => { x.ws.close(); await tot(() => x.ws.readyState === WebSocket.CLOSED, 3000); await sleep(150); };
  /** Na 'ready' wacht de server op naReady: of er een 'ontgrendeling' of een 'vergrendel' kwam. */
  const naReady = async (x: { berichten: Array<Record<string, unknown>> }) => {
    await tot(() => x.berichten.some((m) => m.t === 'ontgrendeling' || m.t === 'vergrendel'), 4000);
    await sleep(150);
    return { ontgrendeling: x.berichten.find((m) => m.t === 'ontgrendeling') as { grant?: { gid?: string } } | undefined, vergrendel: x.berichten.filter((m) => m.t === 'vergrendel') };
  };
  const rij = async (gid: string) => (await sys.query('SELECT browser_sessie, einde_soort, ingetrokken_op, reden_einde, ingetrokken_door FROM app.extensie_ontgrendelingen WHERE id = $1', [gid])).rows[0] as
    { browser_sessie: string | null; einde_soort: string; ingetrokken_op: Date | null; reden_einde: string | null; ingetrokken_door: string | null };
  const reset = () => sys.query("DELETE FROM app.rate_limits WHERE bucket LIKE 'ext-ontgrendel%' AND (bucket LIKE $1 OR bucket LIKE $2)", [`%${A}`, `%${B}`]).catch(() => undefined);

  try {
    // ---------------------------------------------------------------- 0. regel (shared)
    check('aanBrowserGebonden: browser, tech-einde en duur ≤ 4 u gebonden; 7 d, uitloggen en handmatig niet',
      aanBrowserGebonden('browser', 366 * 86_400_000) && aanBrowserGebonden('tech-einde', 3_600_000) && aanBrowserGebonden('duur', 15 * 60_000) && aanBrowserGebonden('duur', 4 * 3_600_000)
      && !aanBrowserGebonden('duur', 7 * 86_400_000) && !aanBrowserGebonden('uitloggen', 60_000) && !aanBrowserGebonden('handmatig', 60_000) && termijnVan('browser')?.ms === null);

    // ---------------------------------------------------------------- fixtures
    for (const id of [A, B]) await sys.query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3)', ['users', id, { email: `${id}@example.test`, role: 'user', status: 'approved', name: id }]);
    for (const id of [A, B]) await aiDienstAan(id);
    const g = (id: string) => ({ id, email: `${id}@example.test`, role: 'user', status: 'approved' });
    const aanroep = (id: string) => ({ user: g(id), service: 'mcp', tabContext: randomBytes(24).toString('hex'), session: { id: randomUUID(), createdAt: Date.now() - 1000 }, tabSession: null }) as eo.Aanroep;
    const aA = aanroep(A), aB = aanroep(B);
    const browser = async (uid: string, versie = '0.7.0') => {
      const tok = randomToken(32);
      const agent = await store.createAgent(uid, `Chrome ${uid} ${versie}`, 'browser', sha256(tok), {}, undefined, { pairingId: `p${uid}${versie}`.replace(/[^A-Za-z0-9]/g, ''), commandKeyEnc: sealCommandKey(newCommandKey(), uid, sha256(tok)), version: versie, ruimte: 'prive' });
      return { agent, tok };
    };
    const AP = await browser(A), AO = await browser(A, '0.6.2'), BP = await browser(B);
    for (const [uid, aan] of [[A, aA], [B, aB]] as const) {
      await matrix.schrijfMatrix(uid, matrix.valideerInvoer({ ruimte: 'prive', rijen: [{ agent: '*', caps: ['browser.read'] }] }), 'test');
      await totpStapOpVastleggen({ user: { id: uid }, session: aan.session, tabSession: null });
    }
    const open = async (a: eo.Aanroep, agentId: string, termijn: string) => { await reset(); return eo.priveOntgrendelen(a, { agentId, termijn }); };

    // ---------------------------------------------------------------- 1. kort (1 год) — dezelfde sessie terug, andere sessie dicht
    const s1 = S();
    let x = await verbind(AP.tok, { sessie: s1 });
    await naReady(x);
    const kort = await open(aA, AP.agent.id, '1u');
    const r1 = await rij(kort.ontgrendeling.gid);
    check('1 год, extensie 0.7.0 verbonden: rij aan de gemelde browsersessie gebonden (browser_sessie = sessie, einde_soort duur)', r1.browser_sessie === s1 && r1.einde_soort === 'duur' && !r1.ingetrokken_op, JSON.stringify(r1));
    await dicht(x);
    x = await verbind(AP.tok, { sessie: s1 });
    const terug = await naReady(x);
    check('zelfde browsersessie (service worker sliep, netwerk weg) → ontgrendeling opnieuw gestuurd, rij loopt', terug.ontgrendeling?.grant?.gid === kort.ontgrendeling.gid && !terug.vergrendel.length && !(await rij(kort.ontgrendeling.gid)).ingetrokken_op);
    await dicht(x);
    const s2 = S();
    x = await verbind(AP.tok, { sessie: s2 });
    const herstart = await naReady(x);
    const r1b = await rij(kort.ontgrendeling.gid);
    check('andere browsersessie (browser herstart) → ingetrokken: reden browser-gesloten, door systeem; «vergrendel» met gid naar de extensie, geen ontgrendeling',
      !!r1b.ingetrokken_op && r1b.reden_einde === 'browser-gesloten' && r1b.ingetrokken_door === 'systeem' && !herstart.ontgrendeling
      && herstart.vergrendel.some((m) => m.gid === kort.ontgrendeling.gid && m.reden === 'browser-gesloten'), JSON.stringify({ r1b, herstart }));
    const au = (await sys.query("SELECT details FROM app.audit WHERE owner_id = $1 AND action = 'owner.extensie.ingetrokken' AND details->>'gid' = $2", [A, kort.ontgrendeling.gid])).rows[0];
    check('app.audit: owner.extensie.ingetrokken met reden browser-gesloten', au?.details?.reden === 'browser-gesloten');

    // ---------------------------------------------------------------- 2. lang (1 тиждень) overleeft een herstart
    const lang = await open(aA, AP.agent.id, '7d');
    check('1 тиждень: niet gebonden (browser_sessie NULL)', (await rij(lang.ontgrendeling.gid)).browser_sessie === null);
    await dicht(x);
    x = await verbind(AP.tok, { sessie: S() });
    const langTerug = await naReady(x);
    check('1 тиждень na een herstart (nieuwe sessie): rij loopt en wordt opnieuw gestuurd', langTerug.ontgrendeling?.grant?.gid === lang.ontgrendeling.gid && !(await rij(lang.ontgrendeling.gid)).ingetrokken_op);

    // ---------------------------------------------------------------- 3. «до закриття браузера»
    check('«до закриття браузера» met extensie 0.6.2 → TERMIJN_VEREIST_UPDATE (geen rij)', (await code((async () => { await reset(); return eo.priveOntgrendelen(aA, { agentId: AO.agent.id, termijn: 'browser' }); })())) === 'TERMIJN_VEREIST_UPDATE');
    const s3 = S();
    await dicht(x);
    x = await verbind(AP.tok, { sessie: s3 });
    await naReady(x);
    const br = await open(aA, AP.agent.id, 'browser');
    const r3 = await rij(br.ontgrendeling.gid);
    check('«до закриття браузера»: einde_soort browser, gebonden aan de sessie, achtervang ≤ 366 d; UI-weergave eindeSoort browser',
      r3.einde_soort === 'browser' && r3.browser_sessie === s3 && br.ontgrendeling.eindeSoort === 'browser' && br.ontgrendeling.eind - Date.now() <= 366 * 86_400_000 + 5000, JSON.stringify(r3));
    await tot(() => x.berichten.some((m) => m.t === 'ontgrendeling' && (m.grant as { gid?: string } | undefined)?.gid === br.ontgrendeling.gid));
    const brBericht = x.berichten.find((m) => m.t === 'ontgrendeling' && (m.grant as { gid?: string } | undefined)?.gid === br.ontgrendeling.gid);
    check('bericht naar de extensie: einde «browser» naast de ondertekende grant (alleen weergave, niet in de handtekening)', brBericht?.einde === 'browser' && typeof brBericht?.sig === 'string' && !('einde' in (brBericht?.grant as object)));
    // aanval: B verbindt met A's sessie-id en met rommel — de rijen van A blijven ongemoeid
    const xb = await verbind(BP.tok, { sessie: s3 });
    await naReady(xb);
    await dicht(xb);
    const xb2 = await verbind(BP.tok, { sessie: "x'; UPDATE app.extensie_ontgrendelingen SET ingetrokken_op = now(); --" });
    await naReady(xb2);
    check('aanval: verbindingen van account B (met A’s sessie-id of rommel) raken A’s rij nooit', !(await rij(br.ontgrendeling.gid)).ingetrokken_op);
    eo.bijVerbonden(BP.agent.id, B, 'browser', '0.7.0', 'te-kort');
    const bKort = await open(aB, BP.agent.id, '15m');
    check('ongeldige sessie-id (formaat) telt als «niet gemeld»: B’s korte rij wacht op binding (\'?\')', (await rij(bKort.ontgrendeling.gid)).browser_sessie === '?');
    await dicht(xb2);
    await dicht(x);
    x = await verbind(AP.tok, { sessie: S() });
    const brDicht = await naReady(x);
    check('«до закриття браузера» na een herstart → ingetrokken (browser-gesloten), niet opnieuw gestuurd', (await rij(br.ontgrendeling.gid)).reden_einde === 'browser-gesloten' && !brDicht.ontgrendeling);

    // ---------------------------------------------------------------- 4. geopend terwijl de extensie offline was → '?' → eerste verbinding bindt
    await dicht(x);
    const offline = await open(aA, AP.agent.id, '4u');
    check('4 год terwijl de extensie offline is (laatst bekende versie 0.7.0) → browser_sessie \'?\'', (await rij(offline.ontgrendeling.gid)).browser_sessie === '?');
    const s5 = S();
    x = await verbind(AP.tok, { sessie: s5 });
    const eerst = await naReady(x);
    check('eerste verbinding bindt \'?\' aan haar sessie en stuurt de ontgrendeling', (await rij(offline.ontgrendeling.gid)).browser_sessie === s5 && eerst.ontgrendeling?.grant?.gid === offline.ontgrendeling.gid);
    await dicht(x);
    x = await verbind(AP.tok, { sessie: S() });
    await naReady(x);
    check('…en na de volgende herstart is ze dicht', (await rij(offline.ontgrendeling.gid)).reden_einde === 'browser-gesloten');
    // een extensie die (onterecht) geen sessie meldt, beëindigt gebonden rijen (veilige kant)
    const s6 = S();
    await dicht(x);
    x = await verbind(AP.tok, { sessie: s6 });
    await naReady(x);
    const zonder = await open(aA, AP.agent.id, '15m');
    await dicht(x);
    x = await verbind(AP.tok, {});
    await naReady(x);
    check('verbinding zonder sessie-id → gebonden rij dicht (fail-closed)', (await rij(zonder.ontgrendeling.gid)).reden_einde === 'browser-gesloten');
    await dicht(x);

    // ---------------------------------------------------------------- 5. extensie < 0.7.0: korte termijn niet gebonden (oud gedrag)
    let xo = await verbind(AO.tok, { versie: '0.6.2' });
    await naReady(xo);
    const oud = await open(aA, AO.agent.id, '1u');
    check('extensie 0.6.2: 1 год niet gebonden (browser_sessie NULL) — zij meldt geen sessie', (await rij(oud.ontgrendeling.gid)).browser_sessie === null);
    await dicht(xo);
    xo = await verbind(AO.tok, { versie: '0.6.2' });
    const oudTerug = await naReady(xo);
    check('extensie 0.6.2 na herverbinding: rij loopt en komt terug (zoals vóór 0111)', oudTerug.ontgrendeling?.grant?.gid === oud.ontgrendeling.gid && !(await rij(oud.ontgrendeling.gid)).ingetrokken_op);
    await dicht(xo);

    // ---------------------------------------------------------------- 6. «Вихід з акаунта завжди скидає»
    const week = await open(aA, AP.agent.id, '7d');
    const bLang = await open(aB, BP.agent.id, '30d');
    const n = await eo.naUitloggen(A);
    const rw = await rij(week.ontgrendeling.gid);
    check('naUitloggen: ook 1 тиждень (duur) van A ingetrokken (reden uitgelogd); de rij van B loopt door', n >= 1 && rw.reden_einde === 'uitgelogd' && !(await rij(bLang.ontgrendeling.gid)).ingetrokken_op, JSON.stringify({ n, rw }));
  } finally {
    for (const ws of sockets) { try { ws.close(); } catch { /* al dicht */ } }
    await new Promise<void>((r) => server.close(() => r()));
    await sys.query('DELETE FROM app.extensie_matrix WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query('DELETE FROM app.extensie_ontgrendelingen WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query('DELETE FROM app.ai_grants WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query('DELETE FROM app.agents WHERE user_id = ANY($1)', [[A, B]]).catch(() => undefined);
    await sys.query("DELETE FROM app.rate_limits WHERE bucket LIKE 'ext-ontgrendel%' AND (bucket LIKE $1 OR bucket LIKE $2)", [`%${A}`, `%${B}`]).catch(() => undefined);
    await aiDienstOpruimen([A, B]).catch(() => undefined);
    await sys.query("DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)", [[A, B]]).catch(() => undefined);
    for (const id of verplaatst) await sys.query("UPDATE app.records SET data = jsonb_set(data, '{role}', '\"owner\"') WHERE tbl = 'users' AND id = $1", [id]).catch(() => undefined);
    eo._testReset();
    await closePool();
  }
  return einde();
}
