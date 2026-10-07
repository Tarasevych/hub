// Local Machine Connector: databasetoegang voor app.agents, app.agent_pairing_codes en app.agent_commands (0009).
//
// Twee soorten queries (zelfde regel als server/platform/db.ts):
//   - gebruiker: na een sessiecontrole als rol mijnruimte_app met SET LOCAL app.user_id (RLS geldt);
//     zonder gebruikerscontext of zonder DATABASE_URL_APP valt dit terug op de systeempool.
//   - systeem: altijd mijnruimte_system. Voor wat geen sessie heeft: het WebSocket-kanaal van de agent
//     (token-hash), het inwisselen van een koppelcode en het resetten van statussen bij het opstarten.
// Elke query filtert daarnaast zelf op user_id; RLS is de tweede laag, niet de enige.
import { appRolActief, getPool } from '../server/platform/pg';
import { gebruikerVanContext, huidigeContext } from '../server/platform/context';

type QueryResult = { rows: any[]; rowCount: number | null };

export type CommandStatus =
  | 'pending_approval' | 'approved' | 'sent' | 'succeeded' | 'failed' | 'rejected' | 'timeout';

export interface AgentRow {
  id: string;
  user_id: string;
  name: string;
  platform: string | null;
  status: 'connected' | 'disconnected';
  last_seen_at: Date | null;
  capabilities: Record<string, unknown>;
  policy: { autoApprove: string[] };
  created_at: Date;
  revoked_at: Date | null;
}

export const AGENT_LIMITS = {
  agentsPerUser: 10,
  pairingCodesPer10Min: 5,
  pairingCodeTtlMin: 10,
};

const AGENT_COLS = 'id, user_id, name, platform, status, last_seen_at, capabilities, policy, created_at, revoked_at';

const systeem = (sql: string, params: unknown[] = []): Promise<QueryResult> => getPool('systeem').query(sql, params);

async function gebruiker(sql: string, params: unknown[] = []): Promise<QueryResult> {
  const ctx = gebruikerVanContext();
  if (!ctx || !appRolActief()) return systeem(sql, params);
  const client = await getPool('app').connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.service', $2, true), set_config('app.route', $3, true)",
      [ctx.userId, ctx.service, String(huidigeContext()?.route || '').slice(0, 200)],
    );
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---- Eigenaar-UI (gebruikerscontext) ----

export async function createPairingCode(userId: string, codeHash: string): Promise<Date | null> {
  const count = await gebruiker(
    `SELECT count(*)::int AS n FROM app.agent_pairing_codes
      WHERE user_id = $1 AND created_at > now() - interval '10 minutes'`, [userId]);
  if (count.rows[0].n >= AGENT_LIMITS.pairingCodesPer10Min) return null;
  const { rows } = await gebruiker(
    `INSERT INTO app.agent_pairing_codes (code_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3)) RETURNING expires_at`,
    [codeHash, userId, AGENT_LIMITS.pairingCodeTtlMin]);
  return rows[0].expires_at as Date;
}

export async function countAgents(userId: string): Promise<number> {
  const { rows } = await gebruiker(
    'SELECT count(*)::int AS n FROM app.agents WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  return rows[0].n as number;
}

export async function listAgents(userId: string): Promise<AgentRow[]> {
  const { rows } = await gebruiker(
    `SELECT ${AGENT_COLS} FROM app.agents WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at`, [userId]);
  return rows as AgentRow[];
}

export async function getAgent(userId: string, id: string): Promise<AgentRow | null> {
  const { rows } = await gebruiker(
    `SELECT ${AGENT_COLS} FROM app.agents WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, [id, userId]);
  return (rows[0] as AgentRow | undefined) ?? null;
}

export async function revokeAgent(userId: string, id: string): Promise<boolean> {
  const r = await gebruiker(
    `UPDATE app.agents SET revoked_at = now(), status = 'disconnected'
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, [id, userId]);
  return (r.rowCount ?? 0) > 0;
}

export async function createCommand(
  agentId: string, userId: string, type: string, params: object, status: CommandStatus,
) {
  const { rows } = await gebruiker(
    `INSERT INTO app.agent_commands (agent_id, user_id, type, params, status, decided_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'approved' THEN now() END) RETURNING *`,
    [agentId, userId, type, JSON.stringify(params), status]);
  return rows[0];
}

export async function getCommand(userId: string, id: string) {
  const { rows } = await gebruiker('SELECT * FROM app.agent_commands WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] ?? null;
}

export async function listCommands(userId: string, agentId: string, limit = 30) {
  const { rows } = await gebruiker(
    `SELECT * FROM app.agent_commands WHERE user_id = $1 AND agent_id = $2
      ORDER BY created_at DESC LIMIT $3`, [userId, agentId, limit]);
  return rows;
}

/** Laatste opdracht per agent (voor de statusregel in de UI). */
export async function lastCommandPerAgent(userId: string) {
  const { rows } = await gebruiker(
    `SELECT DISTINCT ON (agent_id) id, agent_id, type, status, result, created_at, finished_at
       FROM app.agent_commands WHERE user_id = $1 ORDER BY agent_id, created_at DESC`, [userId]);
  return rows;
}

export async function listPendingCommands(userId: string) {
  const { rows } = await gebruiker(
    `SELECT c.*, a.name AS agent_name FROM app.agent_commands c
       JOIN app.agents a ON a.id = c.agent_id
      WHERE c.user_id = $1 AND c.status = 'pending_approval' ORDER BY c.created_at`, [userId]);
  return rows;
}

// ---- Zonder sessie (systeemrol) ----

/** Atomair: een koppelcode kan maar één keer worden ingewisseld. Geeft de eigenaar van de code terug. */
export async function consumePairingCode(codeHash: string): Promise<string | null> {
  const { rows } = await systeem(
    `UPDATE app.agent_pairing_codes SET used_at = now()
      WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`, [codeHash]);
  return rows[0]?.user_id ?? null;
}

export async function purgeOldPairingCodes(): Promise<void> {
  await systeem(`DELETE FROM app.agent_pairing_codes WHERE expires_at < now() - interval '1 hour'`);
}

export async function createAgent(
  userId: string, name: string, platform: string | null, tokenHash: string, capabilities: object,
  policy?: { autoApprove: string[] },
): Promise<AgentRow> {
  const { rows } = await systeem(
    `INSERT INTO app.agents (user_id, name, platform, token_hash, capabilities, policy)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::jsonb, '{"autoApprove": ["fs.read", "fs.list", "sys.info", "sys.metrics", "docker.ps"]}'::jsonb)) RETURNING ${AGENT_COLS}`,
    [userId, name, platform, tokenHash, JSON.stringify(capabilities), policy ? JSON.stringify(policy) : null]);
  return rows[0] as AgentRow;
}

/** Beleid van een eigen agent aanpassen (welke opdrachttypes direct mogen). false = agent niet van deze gebruiker. */
export async function setAgentPolicy(userId: string, id: string, autoApprove: string[]): Promise<boolean> {
  const { rowCount } = await systeem(
    `UPDATE app.agents SET policy = jsonb_build_object('autoApprove', $3::jsonb) WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [id, userId, JSON.stringify(autoApprove)]);
  return (rowCount ?? 0) > 0;
}

/** Uitgezette MCP-hulpmiddelen van een gebruiker (namen). */
export async function getDisabledTools(userId: string): Promise<string[]> {
  const { rows } = await systeem('SELECT disabled FROM app.connector_tool_settings WHERE user_id = $1', [userId]);
  return (rows[0]?.disabled as string[] | undefined) ?? [];
}

export async function setDisabledTools(userId: string, disabled: string[]): Promise<void> {
  await systeem(
    `INSERT INTO app.connector_tool_settings (user_id, disabled, updated_at) VALUES ($1, $2::text[], now())
     ON CONFLICT (user_id) DO UPDATE SET disabled = EXCLUDED.disabled, updated_at = now()`,
    [userId, disabled]);
}

export async function findAgentByTokenHash(tokenHash: string): Promise<AgentRow | null> {
  const { rows } = await systeem(
    `SELECT ${AGENT_COLS} FROM app.agents WHERE token_hash = $1 AND revoked_at IS NULL`, [tokenHash]);
  return (rows[0] as AgentRow | undefined) ?? null;
}

export async function setAgentStatus(id: string, status: 'connected' | 'disconnected', capabilities?: object) {
  await systeem(
    `UPDATE app.agents SET status = $2, last_seen_at = now(), capabilities = COALESCE($3::jsonb, capabilities)
      WHERE id = $1`, [id, status, capabilities ? JSON.stringify(capabilities) : null]);
}

export async function touchAgent(id: string) {
  await systeem('UPDATE app.agents SET last_seen_at = now() WHERE id = $1', [id]);
}

/** Na een herstart van de server is nog geen agent opnieuw verbonden. */
export async function markAllAgentsDisconnected() {
  await systeem(`UPDATE app.agents SET status = 'disconnected' WHERE status = 'connected'`);
}

/**
 * Statusovergang alleen vanuit een verwachte stand: beschermt tegen dubbel goedkeuren en tegen een
 * resultaat dat na een timeout binnenkomt. `userId` meegeven als de overgang namens een gebruiker gaat.
 */
export async function transitionCommand(
  id: string, from: CommandStatus[], to: CommandStatus, result?: unknown, userId?: string,
) {
  const { rows } = await systeem(
    `UPDATE app.agent_commands SET status = $3, result = COALESCE($4::jsonb, result),
        decided_at = CASE WHEN $3 IN ('approved', 'rejected') THEN now() ELSE decided_at END,
        finished_at = CASE WHEN $3 IN ('succeeded', 'failed', 'timeout') THEN now() ELSE finished_at END
      WHERE id = $1 AND status = ANY($2) AND ($5::text IS NULL OR user_id = $5) RETURNING *`,
    [id, from, to, result === undefined ? null : JSON.stringify(result), userId ?? null]);
  return rows[0] ?? null;
}
