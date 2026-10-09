// Audit C2: MCP-console per gebruiker (bord, tokens, log in de database met RLS), goedgekeurd account + eigenaar voor serverzaken,
// step-up voor tokens en downloads, rechten alleen-lezen uit /etc, eenmalige downloadId voor het age-archief, overname oud JSON.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mcpConsoleRoutes } from '../../backend/mcp-console';
import { metNamens } from '../../backend/mcp-namens';
import { closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mcp-console-c2');
  const sys = getPool('systeem');
  const dir = path.join(process.cwd(), 'rapporten', `c2-${Date.now()}`);
  const uploads = path.join(dir, 'uploads'); const uit = path.join(dir, 'uitgifte');
  await mkdir(uploads, { recursive: true }); await mkdir(uit, { recursive: true });
  const oud = { UPLOADS_DIR: process.env.UPLOADS_DIR, ARCHIEF_UIT: process.env.ARCHIEF_UIT, MCP_RECHTEN_PAD: process.env.MCP_RECHTEN_PAD };
  process.env.UPLOADS_DIR = uploads; process.env.ARCHIEF_UIT = uit; process.env.MCP_RECHTEN_PAD = path.join(dir, 'mcp-rechten.json');
  await writeFile(process.env.MCP_RECHTEN_PAD, JSON.stringify({ read: true, uitrol: false }));
  const legacyHash = 'a'.repeat(64);
  await writeFile(path.join(uploads, 'mcp-console.json'), JSON.stringify({ tasks: [{ title: 'Oude taak', status: 'doing' }], notes: [{ title: 'Oude notitie' }], tokens: [{ name: 'oud', prefix: 'tvh_x', hash: legacyHash }], log: [] }));

  const OWNER = `c2-owner-${randomUUID()}`; const USER = `c2-user-${randomUUID()}`; const PENDING = `c2-pending-${randomUUID()}`;
  const users: Record<string, any> = {
    [OWNER]: { id: OWNER, role: 'owner', status: 'approved', email: 'o@x' }, [USER]: { id: USER, role: 'user', status: 'approved', email: 'u@x' },
    [PENDING]: { id: PENDING, role: 'user', status: 'pending', email: 'p@x' },
  };
  let steppedUp = false;
  const routes = mcpConsoleRoutes(async (event: any) => ({ user: users[event.who], service: event.service ?? 'mcp' }),
    { stepUp: async () => (steppedUp ? null : { statusCode: 403, headers: {}, body: JSON.stringify({ error: 'STEP_UP_REQUIRED' }) } as any) });
  const call = async (route: string, who: string, body: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => {
    const res: any = await routes[route][0]({ event: { who, headers: {}, ...extra }, body } as any);
    let data: any = null; try { data = JSON.parse(res.body); } catch { data = null; }
    return { status: res.statusCode, data, filePath: res.filePath as string | undefined };
  };

  try {
    check('niet goedgekeurd account: geweigerd', (await call('POST /api/mcp/board/list', PENDING)).status === 403);
    check('andere dienst dan mcp: geweigerd', (await call('POST /api/mcp/board/list', USER, {}, { service: 'mail' })).status === 403);
    const ownerBoard = await call('POST /api/mcp/board/list', OWNER);
    check('eigenaar: het oude gedeelde bestand is eenmalig overgenomen (taak, notitie) en hernoemd',
      ownerBoard.data.tasks.some((t: any) => t.title === 'Oude taak' && t.status === 'doing') && ownerBoard.data.notes.some((n: any) => n.title === 'Oude notitie')
      && (await readdir(uploads)).some((n) => n.startsWith('mcp-console.json.geimporteerd-')) && !(await readdir(uploads)).includes('mcp-console.json'));
    const oudToken = (await sys.query('SELECT user_id, expires_at FROM app.mcp_console_tokens WHERE token_hash = $1', [legacyHash])).rows[0];
    check('oude tokens: alleen de hash, toegewezen aan de eigenaar, met vervaldatum (~30 dagen)', oudToken?.user_id === OWNER && Math.abs((new Date(oudToken.expires_at).getTime() - Date.now()) / 86400000 - 30) < 0.1);

    await call('POST /api/mcp/board', USER, { kind: 'task', title: 'Taak van U' });
    const uBoard = await call('POST /api/mcp/board/list', USER);
    const oBoard = await call('POST /api/mcp/board/list', OWNER);
    check('bord per gebruiker: U ziet alleen zijn eigen taak, de eigenaar ziet die niet', uBoard.data.tasks.length === 1 && uBoard.data.tasks[0].title === 'Taak van U' && !oBoard.data.tasks.some((t: any) => t.title === 'Taak van U'));
    const verplaats = await call('POST /api/mcp/board', OWNER, { kind: 'move', id: uBoard.data.tasks[0].id, status: 'done' });
    check('de eigenaar kan een taak van U niet verplaatsen', verplaats.status === 404);

    const zonder = await call('POST /api/mcp/tokens', USER, { name: 'robot' });
    steppedUp = true;
    const met = await call('POST /api/mcp/tokens', USER, { name: 'robot' });
    steppedUp = false;
    const raw = met.data?.token?.token as string;
    const opgeslagen = (await sys.query('SELECT token_hash, expires_at FROM app.mcp_console_tokens WHERE user_id = $1', [USER])).rows;
    check('token uitgeven: zonder step-up geweigerd; met step-up één keer zichtbaar, alleen als hash bewaard, 30 dagen geldig',
      zonder.status === 403 && /^tvh_/.test(raw) && opgeslagen.length === 1 && opgeslagen[0].token_hash !== raw && !JSON.stringify(opgeslagen).includes(raw)
      && Math.abs((new Date(opgeslagen[0].expires_at).getTime() - Date.now()) / 86400000 - 30) < 0.1);
    check('tokenlijst per gebruiker', (await call('POST /api/mcp/tokens/list', OWNER)).data.tokens.every((t: any) => t.name !== 'robot') && (await call('POST /api/mcp/tokens/list', USER)).data.tokens.length === 1);
    const agentBord = await call('POST /api/mcp/agent', '', { name: 'list_tasks', arguments: {} }, { headers: { authorization: `Bearer ${raw}` } });
    const agentServer = await call('POST /api/mcp/agent', '', { name: 'release_info', arguments: {} }, { headers: { authorization: `Bearer ${raw}` } });
    const agentDeur = await call('POST /api/mcp/agent', '', { name: 'install_release', arguments: {} }, { headers: { authorization: `Bearer ${raw}` } });
    check('agenttoken van U: eigen bord ja, serverhulpmiddelen nee (OWNER_ONLY), deur-hulpmiddelen bestaan niet meer',
      agentBord.status === 200 && /Taak van U/.test(agentBord.data.result) && agentServer.status === 400 && agentServer.data.error === 'OWNER_ONLY' && /TOOL_REMOVED/.test(agentDeur.data.error));
    const agentGoedkeur = await call('POST /api/mcp/agent', '', { name: 'uitrol_voorstel_goedkeuren', arguments: { id: randomUUID() } }, { headers: { authorization: `Bearer ${raw}` } });
    const agentUitrol = await call('POST /api/mcp/agent', '', { name: 'uitrol_voorstel_status', arguments: {} }, { headers: { authorization: `Bearer ${raw}` } });
    check('agenttoken: updates goedkeuren kan nooit (ALLEEN_EIGENAAR_MET_PASSKEY); voorbereiden alleen met grant',
      agentGoedkeur.status === 400 && /ALLEEN_EIGENAAR_MET_PASSKEY/.test(agentGoedkeur.data.error) && agentUitrol.status === 400 && agentUitrol.data.error === 'GEEN_VOORBEREIDER_GRANT', JSON.stringify([agentGoedkeur.data, agentUitrol.data]));
    await sys.query("UPDATE app.mcp_console_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1", [USER]);
    check('verlopen token: 401', (await call('POST /api/mcp/agent', '', { name: 'list_tasks' }, { headers: { authorization: `Bearer ${raw}` } })).status === 401);

    const lees = await call('POST /api/mcp/permissions', OWNER);
    const schrijf = await call('POST /api/mcp/permissions', OWNER, { id: 'uitrol', enabled: true });
    check('rechten: alleen lezen uit het bestand in /etc; wijzigen via de site = 409 PERMISSIONS_READONLY en verandert niets',
      lees.data.readonly === true && lees.data.permissions.uitrol === false && schrijf.status === 409 && schrijf.data.reasonCode === 'PERMISSIONS_READONLY' && (await call('POST /api/mcp/permissions', OWNER)).data.permissions.uitrol === false);

    check('serverzaken alleen voor de eigenaar: gezondheid, archief, back-ups', (await call('POST /api/mcp/archive/status', USER)).status === 403 && (await call('POST /api/mcp/backups', USER)).status === 403 && (await call('POST /api/mcp/health', USER)).status === 403);
    await writeFile(path.join(uit, 'archief-laatste.tar.age'), 'age-encryption.org/v1\n...');
    await writeFile(path.join(uit, 'archief-laatste.json'), JSON.stringify({ naam: 'mijn-ruimte-20261008-120000.tar.age', bytes: 25 }));
    const linkZonder = await call('POST /api/mcp/archive/link', OWNER);
    steppedUp = true;
    const link = await call('POST /api/mcp/archive/link', OWNER);
    steppedUp = false;
    const vreemd = await call('POST /api/mcp/archive/file', USER, { downloadId: link.data.downloadId });
    check('archief downloaden: link vraagt step-up; een andere gebruiker kan de id niet gebruiken', linkZonder.status === 403 && typeof link.data.downloadId === 'string' && vreemd.status === 403);
    steppedUp = true;
    const link2 = await call('POST /api/mcp/archive/link', OWNER);
    steppedUp = false;
    const eerst = await call('POST /api/mcp/archive/file', OWNER, { downloadId: link2.data.downloadId });
    const nogmaals = await call('POST /api/mcp/archive/file', OWNER, { downloadId: link2.data.downloadId });
    const zonderId = await call('POST /api/mcp/archive/file', OWNER, { name: 'archief-laatste.tar.age' });
    check('downloadId: werkt één keer, levert alleen het vaste age-bestand; zonder id geen download',
      eerst.status === 200 && eerst.filePath === path.join(uit, 'archief-laatste.tar.age') && nogmaals.status === 403 && zonderId.status === 403);
    // Wie staat er in het verkeerslog? Via MCP: de AI-verbinding vóór het account (transport mcp); rechtstreeks: de console.
    steppedUp = true;
    await metNamens({ client: 'Claude', grantId: '1234567890abcdef' }, () => call('POST /api/mcp/tokens', USER, { name: 'via-mcp' }));
    await call('POST /api/mcp/tokens', USER, { name: 'rechtstreeks' });
    steppedUp = false;
    const log = ((await call('POST /api/mcp/traffic', USER)).data?.log ?? []) as Array<{ method: string; detail: string; transport: string; agent: string }>;
    const viaMcp = log.find((r) => r.method === 'token.issue' && r.detail === 'via-mcp'), direct = log.find((r) => r.method === 'token.issue' && r.detail === 'rechtstreeks');
    check('verkeerslog: actie via MCP staat op naam van de AI («Claude #12345678 → u@x», transport mcp); rechtstreeks op de console',
      viaMcp?.transport === 'mcp' && viaMcp.agent === 'Claude #12345678 → u@x' && direct?.transport === 'console' && direct.agent === 'u@x', JSON.stringify([viaMcp, direct]));
    const gedelegeerd = await call('POST /api/mcp/tokens', USER, { name: 'zonder-namens' });
    check('(controle) zonder step-up blijft de route geweigerd, ook binnen dezelfde test', gedelegeerd.status === 403);
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err).slice(0, 400));
  } finally {
    for (const u of [OWNER, USER, PENDING]) for (const t of ['mcp_console_items', 'mcp_console_tokens', 'mcp_console_log']) await sys.query(`DELETE FROM app.${t} WHERE user_id = $1`, [u]).catch(() => undefined);
    for (const [k, v] of Object.entries(oud)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await closePool();
  }
  return einde();
}
