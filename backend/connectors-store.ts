// Local Machine Connector: databasetoegang voor app.agents, app.agent_pairing_codes en app.agent_commands (0009).
//
// Twee soorten queries (zelfde regel als server/platform/db.ts):
//   - gebruiker: na een sessiecontrole als rol mijnruimte_app met SET LOCAL app.user_id (RLS geldt);
//     zonder gebruikerscontext of zonder DATABASE_URL_APP valt dit terug op de systeempool.
//   - systeem: altijd mijnruimte_system. Voor wat geen sessie heeft: het WebSocket-kanaal van de agent
//     (token-hash), het inwisselen van een koppelcode en het resetten van statussen bij het opstarten.
// Elke query filtert daarnaast zelf op user_id; RLS is de tweede laag, niet de enige.
import { appRolActief, getPool } from '../server/platform/pg';
import { enabledTypes } from './browser-capabilities';
import { gebruikerVanContext, huidigeContext } from '../server/platform/context';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';

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
  policy: { autoApprove: string[]; enabled?: string[] };
  created_at: Date;
  revoked_at: Date | null;
  browser_enabled: boolean;
  armed_until: Date | null;
  token_expires_at?: Date | null;
  pairing_id?: string | null;
  agent_version?: string | null;
  /** Ruimte van het apparaat: 'prive' (eigen apparaten) of 'technisch' (server/beheer) — gezet bij het koppelen, nooit door de AI. */
  ruimte?: AiRuimte;
}

export const AGENT_LIMITS = {
  agentsPerUser: 10,
  pairingCodesPer10Min: 5,
  /** Eenmalige koppelcode (ook het PAIR-bericht van de site naar de extensie): 5 minuten. */
  pairingCodeTtlMin: 5,
  /** Agenttokens vervallen na 30 dagen (0018); daarna opnieuw koppelen. */
  tokenTtlDays: 30,
};

const AGENT_COLS = 'id, user_id, name, platform, status, last_seen_at, capabilities, policy, created_at, revoked_at, browser_enabled, armed_until, token_expires_at, pairing_id, agent_version, ruimte';

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

export async function createPairingCode(userId: string, codeHash: string, ruimte: AiRuimte = 'prive'): Promise<Date | null> {
  const count = await gebruiker(
    `SELECT count(*)::int AS n FROM app.agent_pairing_codes
      WHERE user_id = $1 AND created_at > now() - interval '10 minutes'`, [userId]);
  if (count.rows[0].n >= AGENT_LIMITS.pairingCodesPer10Min) return null;
  const { rows } = await gebruiker(
    `INSERT INTO app.agent_pairing_codes (code_hash, user_id, expires_at, ruimte)
     VALUES ($1, $2, now() + make_interval(mins => $3), $4) RETURNING expires_at`,
    [codeHash, userId, AGENT_LIMITS.pairingCodeTtlMin, ruimteOf(ruimte)]);
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

/** Een opnieuw gekoppelde browser (zelfde naam) vervangt de oude koppeling: zo blijft er één agent per browser en wijzen site en extensie naar dezelfde. */
export async function revokeOlderBrowserAgents(userId: string, name: string, keepId: string): Promise<string[]> {
  const { rows } = await gebruiker(
    `UPDATE app.agents SET revoked_at = now(), status = 'disconnected'
      WHERE user_id = $1 AND platform = 'browser' AND name = $2 AND id <> $3 AND revoked_at IS NULL RETURNING id`, [userId, name, keepId]);
  return rows.map((r: { id: string }) => r.id);
}

export async function getAgent(userId: string, id: string): Promise<AgentRow | null> {
  const { rows } = await gebruiker(
    `SELECT ${AGENT_COLS} FROM app.agents WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, [id, userId]);
  return (rows[0] as AgentRow | undefined) ?? null;
}

export async function revokeAgent(userId: string, id: string): Promise<boolean> {
  const r = await gebruiker(
    `UPDATE app.agents SET revoked_at = now(), status = 'disconnected', revoke_reason = COALESCE(revoke_reason, 'user')
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, [id, userId]);
  return (r.rowCount ?? 0) > 0;
}

/** Ingetrokken/losgekoppelde apparaten en browsers van de laatste `dagen` (geschiedenis op /agents; nooit het token). */
export type RevokedAgentRow = { id: string; name: string; platform: string | null; agent_version: string | null; created_at: Date; revoked_at: Date; last_seen_at: Date | null; revoke_reason: string | null; pairing_id: string | null };
export async function listRevokedAgents(userId: string, dagen = 90): Promise<RevokedAgentRow[]> {
  const { rows } = await gebruiker(
    `SELECT id, name, platform, agent_version, created_at, revoked_at, last_seen_at, revoke_reason, pairing_id FROM app.agents
      WHERE user_id = $1 AND revoked_at IS NOT NULL AND revoked_at > now() - make_interval(days => $2)
      ORDER BY revoked_at DESC LIMIT 50`, [userId, dagen]);
  return rows as RevokedAgentRow[];
}

/** Namen voor het journaal: alle apparaten (ook ingetrokken), agenttokens (deuren) en OAuth-verbindingen van één gebruiker. */
export async function journaalNamen(userId: string): Promise<{ agents: Map<string, { name: string; platform: string | null }>; tokens: Map<string, string>; oauth: Map<string, string> }> {
  const [a, t, o] = await Promise.all([
    systeem('SELECT id, name, platform FROM app.agents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500', [userId]),
    systeem('SELECT id::text AS id, name FROM app.mcp_console_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500', [userId]).catch(() => ({ rows: [] as any[], rowCount: 0 })),
    systeem('SELECT id::text AS id, client_name FROM app.mcp_oauth_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500', [userId]).catch(() => ({ rows: [] as any[], rowCount: 0 })),
  ]);
  return {
    agents: new Map(a.rows.map((r: any) => [String(r.id), { name: String(r.name), platform: r.platform ?? null }])),
    tokens: new Map(t.rows.map((r: any) => [String(r.id), String(r.name)])),
    oauth: new Map(o.rows.map((r: any) => [String(r.id), String(r.client_name)])),
  };
}


export async function createCommand(
  agentId: string, userId: string, type: string, params: object, status: CommandStatus, grantId: string | null = null,
) {
  const { rows } = await gebruiker(
    `INSERT INTO app.agent_commands (agent_id, user_id, type, params, status, decided_at, grant_id)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'approved' THEN now() END, $6) RETURNING *`,
    [agentId, userId, type, JSON.stringify(params), status, grantId]);
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

/** Recente opdrachten van alle apparaten en browsers (laatste 7 dagen) voor het activiteitenoverzicht en de meldingen. */
export async function listRecentCommands(userId: string, limit = 60) {
  const { rows } = await gebruiker(
    `SELECT c.id, c.agent_id, a.name AS agent_name, a.platform, c.type, c.status, c.created_at, c.finished_at
       FROM app.agent_commands c JOIN app.agents a ON a.id = c.agent_id
      WHERE c.user_id = $1 AND c.created_at > now() - interval '7 days' ORDER BY c.created_at DESC LIMIT $2`, [userId, limit]);
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

/** Atomair: een koppelcode kan maar één keer worden ingewisseld. Geeft de eigenaar én de ruimte van de code terug. */
export async function consumePairingCode(codeHash: string): Promise<{ userId: string; ruimte: AiRuimte } | null> {
  const { rows } = await systeem(
    `UPDATE app.agent_pairing_codes SET used_at = now()
      WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id, ruimte`, [codeHash]);
  return rows[0] ? { userId: rows[0].user_id as string, ruimte: ruimteOf(rows[0].ruimte) } : null;
}

export async function purgeOldPairingCodes(): Promise<void> {
  await systeem(`DELETE FROM app.agent_pairing_codes WHERE expires_at < now() - interval '1 hour'`);
}

export async function createAgent(
  userId: string, name: string, platform: string | null, tokenHash: string, capabilities: object,
  policy?: { autoApprove: string[] }, extra: { pairingId?: string | null; commandKeyEnc?: string | null; version?: string | null; ruimte?: AiRuimte } = {},
): Promise<AgentRow> {
  const { rows } = await systeem(
    `INSERT INTO app.agents (user_id, name, platform, token_hash, capabilities, policy, pairing_id, command_key_enc, agent_version, token_expires_at, ruimte)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::jsonb, '{"autoApprove": ["fs.read", "fs.list", "sys.info", "sys.metrics", "docker.ps"]}'::jsonb), $7, $8, $9, now() + make_interval(days => $10), $11) RETURNING ${AGENT_COLS}`,
    [userId, name, platform, tokenHash, JSON.stringify(capabilities), policy ? JSON.stringify(policy) : null,
     extra.pairingId ?? null, extra.commandKeyEnc ?? null, extra.version ?? null, AGENT_LIMITS.tokenTtlDays, ruimteOf(extra.ruimte)]);
  return rows[0] as AgentRow;
}

/**
 * Opnieuw koppelen: het vorige token van DEZELFDE installatie (pairing_id) wordt ingetrokken. Zonder pairing_id (oude extensies)
 * valt dit terug op dezelfde naam bij een browser (vroegere regel). Geeft de ingetrokken agent-id's terug.
 */
export async function revokePreviousPairing(userId: string, keepId: string, pairingId: string | null, name: string, platform: string | null): Promise<string[]> {
  const { rows } = await gebruiker(
    `UPDATE app.agents SET revoked_at = now(), status = 'disconnected', revoke_reason = 'repaired'
      WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL
        AND (($3::text IS NOT NULL AND pairing_id = $3) OR ($3::text IS NULL AND $5 = 'browser' AND platform = 'browser' AND name = $4))
      RETURNING id`, [userId, keepId, pairingId, name, platform ?? '']);
  return rows.map((r: { id: string }) => r.id);
}

/** Verzegelde opdrachtsleutel van een agent (0018) of null (oude agent zonder sleutel). */
export async function getCommandKeyEnc(agentId: string): Promise<{ sealed: string; userId: string; tokenHash: string } | null> {
  const { rows } = await systeem('SELECT command_key_enc, user_id, token_hash FROM app.agents WHERE id = $1 AND revoked_at IS NULL', [agentId]);
  const r = rows[0];
  return r?.command_key_enc ? { sealed: r.command_key_enc, userId: r.user_id, tokenHash: r.token_hash } : null;
}

/** Beleid van een eigen agent aanpassen (welke opdrachttypes direct mogen). false = agent niet van deze gebruiker. */
export async function setAgentPolicy(userId: string, id: string, autoApprove: string[], enabled?: string[]): Promise<boolean> {
  // `enabled` weglaten = de keuze van de gebruiker ongemoeid laten (alleen voor browseragents van belang).
  const { rowCount } = await systeem(
    `UPDATE app.agents SET policy = COALESCE(policy, '{}'::jsonb) || jsonb_build_object('autoApprove', $3::jsonb) || CASE WHEN $4::jsonb IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('enabled', $4::jsonb) END
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [id, userId, JSON.stringify(autoApprove), enabled ? JSON.stringify(enabled) : null]);
  return (rowCount ?? 0) > 0;
}

/**
 * Browseragent aan- of uitzetten door de eigen gebruiker. Uitzetten legt hem meteen stil; aanzetten geldt pas zodra een
 * ingelogde sessie hem bevestigt (armBrowserAgent), hier alvast voor ARM_MINUTES omdat de gebruiker nu op de site is.
 */
export const ARM_MINUTES = 10;
/** Duur van «AI mag deze browser gebruiken», gekozen door de eigenaar: null = tot hij zelf uitzet; minuten = vaste termijn; 'sessie' = alleen
 *  zolang een ingelogde pagina van de site open is (elke 2 min bevestigd, vervalt 10 min na de laatste). */
export type BrowserDuur = null | number | 'sessie';
export const BROWSER_MAX_MINUTEN = 366 * 24 * 60;
/** «Tot u uitzet» wordt opgeslagen als een datum ver in de toekomst (geen 'infinity': die kent JavaScript niet). */
export const TOT_UITZETTEN_JAAR = 2999;
export const isTotUitzetten = (ms: number | null | undefined) => !!ms && new Date(ms).getUTCFullYear() >= TOT_UITZETTEN_JAAR;
export async function setBrowserEnabled(userId: string, id: string, enabled: boolean, duur: BrowserDuur = null): Promise<boolean> {
  const minuten = duur === 'sessie' ? ARM_MINUTES : typeof duur === 'number' ? duur : null;
  const { rowCount } = await systeem(
    `UPDATE app.agents SET browser_enabled = $3,
        armed_until = CASE WHEN NOT $3 THEN NULL
                           WHEN $4::int IS NULL THEN make_timestamptz(${TOT_UITZETTEN_JAAR}, 1, 1, 0, 0, 0, 'UTC')
                           ELSE now() + make_interval(mins => $4::int) END,
        policy = jsonb_set(coalesce(policy, '{}'::jsonb), '{activatie}', to_jsonb($5::text))
      WHERE id = $1 AND user_id = $2 AND platform = 'browser' AND revoked_at IS NULL`,
    [id, userId, enabled, minuten, duur === 'sessie' ? 'sessie' : 'vast']);
  return (rowCount ?? 0) > 0;
}

/** Een ingelogde sessie bevestigt dat de browser actief mag blijven — ALLEEN in de stand 'sessie' (of oude agents zonder stand).
 *  Een vaste termijn of «tot ik uitzet» raakt de hartslag nooit: niet verkorten en na afloop ook niet stilletjes verlengen. */
export async function armBrowserAgent(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await systeem(
    `UPDATE app.agents SET armed_until = now() + make_interval(mins => $3)
      WHERE id = $1 AND user_id = $2 AND platform = 'browser' AND browser_enabled AND revoked_at IS NULL
        AND coalesce(policy->>'activatie', 'sessie') = 'sessie'`,
    [id, userId, ARM_MINUTES]);
  return (rowCount ?? 0) > 0;
}

/** Waarom een browser niet actief is (voor een duidelijke melding aan de AI en de gebruiker). */
export async function browserStand(agentId: string): Promise<{ enabled: boolean; armedUntil: number | null; lastSeen: number | null; version: string | null } | null> {
  const { rows } = await systeem('SELECT browser_enabled, armed_until, last_seen_at, agent_version FROM app.agents WHERE id = $1 AND revoked_at IS NULL', [agentId]);
  const r = rows[0]; if (!r) return null;
  const t = (v: unknown) => (v ? new Date(v as string).getTime() : null);
  return { enabled: r.browser_enabled === true, armedUntil: t(r.armed_until), lastSeen: t(r.last_seen_at), version: r.agent_version ?? null };
}

/** Mag deze browser nu opdrachten krijgen? Aangezet door de gebruiker EN recent bevestigd door een ingelogde sessie. */
export async function browserActive(agentId: string): Promise<boolean> {
  const { rows } = await systeem(
    `SELECT (browser_enabled AND armed_until IS NOT NULL AND armed_until > now() AND revoked_at IS NULL) AS actief
       FROM app.agents WHERE id = $1`, [agentId]);
  return rows[0]?.actief === true;
}

/**
 * Mag deze browser dit opdrachttype nu krijgen? 'inactive' = niet aangezet of niet recent bevestigd door een ingelogde sessie;
 * 'disabled' = de gebruiker heeft deze mogelijkheid voor deze browser uitgezet.
 */
export async function browserGate(agentId: string, type: string): Promise<'ok' | 'inactive' | 'disabled'> {
  const { rows } = await systeem(
    `SELECT (browser_enabled AND armed_until IS NOT NULL AND armed_until > now() AND revoked_at IS NULL) AS actief, policy
       FROM app.agents WHERE id = $1`, [agentId]);
  if (rows[0]?.actief !== true) return 'inactive';
  return enabledTypes(rows[0].policy).includes(type) ? 'ok' : 'disabled';
}

export type ToolMode = 'always' | 'ask' | 'off';
const MODES = new Set(['always', 'ask', 'off']);

/** De door de gebruiker gekozen modus per MCP-hulpmiddel (alleen wat is ingesteld). De oude lijst "uitgezet" (0012) telt als "off". */
export async function getToolModes(userId: string): Promise<Record<string, ToolMode>> {
  const { rows } = await systeem('SELECT modes, disabled FROM app.connector_tool_settings WHERE user_id = $1', [userId]);
  const out: Record<string, ToolMode> = {};
  for (const t of (rows[0]?.disabled as string[] | undefined) ?? []) out[t] = 'off';
  const modes = (rows[0]?.modes ?? {}) as Record<string, unknown>;
  for (const [tool, mode] of Object.entries(modes)) if (MODES.has(String(mode))) out[tool] = mode as ToolMode;
  return out;
}

/** Een of meer modi zetten. Een modus van de gebruiker vervangt een eerdere; "disabled" blijft bewust ongemoeid maar wordt genegeerd zodra er een modus is. */
export async function setToolModes(userId: string, changes: Record<string, ToolMode | null>): Promise<void> {
  const current = await getToolModes(userId);
  for (const [tool, mode] of Object.entries(changes)) { if (mode === null) delete current[tool]; else current[tool] = mode; }
  await systeem(
    `INSERT INTO app.connector_tool_settings (user_id, disabled, modes, updated_at) VALUES ($1, '{}', $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET disabled = '{}', modes = EXCLUDED.modes, updated_at = now()`,
    [userId, JSON.stringify(current)]);
}

/** Uitgezette MCP-hulpmiddelen van een gebruiker (namen). */
export async function getDisabledTools(userId: string): Promise<string[]> {
  return Object.entries(await getToolModes(userId)).filter(([, m]) => m === 'off').map(([t]) => t).sort();
}

export async function setDisabledTools(userId: string, disabled: string[]): Promise<void> {
  const current = await getToolModes(userId);
  const changes: Record<string, ToolMode | null> = {};
  for (const [tool, mode] of Object.entries(current)) if (mode === 'off' && !disabled.includes(tool)) changes[tool] = null;
  for (const tool of disabled) changes[tool] = 'off';
  await setToolModes(userId, changes);
}

// ---- aanroepen van site-hulpmiddelen die op goedkeuring wachten (0015) ----
export type ToolCallStatus = 'pending_approval' | 'approved' | 'rejected' | 'succeeded' | 'failed' | 'timeout';
export const TOOL_CALL_TTL_MIN = 10;

export async function createToolCall(userId: string, tool: string, args: object) {
  const { rows } = await systeem(
    'INSERT INTO app.connector_tool_calls (user_id, tool, args) VALUES ($1, $2, $3::jsonb) RETURNING *', [userId, tool, JSON.stringify(args)]);
  return rows[0];
}
/** Wachtende aanroepen die te lang liggen vervallen (niemand wacht er nog op). */
export async function expireToolCalls(userId: string): Promise<void> {
  await systeem(
    `UPDATE app.connector_tool_calls SET status = 'timeout', finished_at = now()
      WHERE user_id = $1 AND status = 'pending_approval' AND created_at < now() - make_interval(mins => $2)`, [userId, TOOL_CALL_TTL_MIN]);
}
export async function getToolCall(userId: string, id: string) {
  const { rows } = await systeem('SELECT * FROM app.connector_tool_calls WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] ?? null;
}
export async function listToolCalls(userId: string, limit = 20) {
  await expireToolCalls(userId);
  const { rows } = await systeem(
    `SELECT id, tool, args, status, result, created_at, decided_at, finished_at FROM app.connector_tool_calls
      WHERE user_id = $1 ORDER BY (status = 'pending_approval') DESC, created_at DESC LIMIT $2`, [userId, limit]);
  return rows;
}
export async function countPendingToolCalls(userId: string): Promise<number> {
  const { rows } = await systeem("SELECT count(*)::int AS n FROM app.connector_tool_calls WHERE user_id = $1 AND status = 'pending_approval'", [userId]);
  return rows[0]?.n ?? 0;
}
/** Statusovergang alleen vanuit een verwachte stand en alleen voor de eigen gebruiker (beschermt tegen dubbel goedkeuren). */
export async function transitionToolCall(id: string, userId: string, from: ToolCallStatus[], to: ToolCallStatus, result?: unknown) {
  const { rows } = await systeem(
    `UPDATE app.connector_tool_calls SET status = $4, result = COALESCE($5::jsonb, result),
        decided_at = CASE WHEN $4 IN ('approved', 'rejected') THEN now() ELSE decided_at END,
        finished_at = CASE WHEN $4 IN ('succeeded', 'failed', 'timeout', 'rejected') THEN now() ELSE finished_at END
      WHERE id = $1 AND user_id = $2 AND status = ANY($3) RETURNING *`,
    [id, userId, from, to, result === undefined ? null : JSON.stringify(result)]);
  return rows[0] ?? null;
}

/**
 * Agent bij token-hash (WebSocket, /self, ws-ticket). Alleen een geldig token: niet ingetrokken, niet verlopen (0018), de gebruiker
 * niet geblokkeerd voor AI (0017) en het account zelf niet geblokkeerd of opgeheven (audit M4).
 */
export async function findAgentByTokenHash(tokenHash: string): Promise<AgentRow | null> {
  const { rows } = await systeem(
    `SELECT ${AGENT_COLS.split(', ').map((c) => `a.${c}`).join(', ')} FROM app.agents a
      WHERE a.token_hash = $1 AND a.revoked_at IS NULL AND a.token_expires_at > now()
        AND NOT EXISTS (SELECT 1 FROM app.user_ai_settings s WHERE s.user_id = a.user_id AND s.blocked_at IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM app.records r WHERE r.tbl = 'users' AND r.id = a.user_id
                          AND (r.data->>'status' IN ('blocked', 'rejected', 'deleted') OR COALESCE((r.data->>'retiredAt')::numeric, 0) > 0))`, [tokenHash]);
  return (rows[0] as AgentRow | undefined) ?? null;
}

/** Agent bij id met dezelfde geldigheidsregels als findAgentByTokenHash (voor een ingewisseld WebSocket-ticket). */
export async function findAgentById(id: string): Promise<AgentRow | null> {
  const { rows } = await systeem('SELECT token_hash FROM app.agents WHERE id = $1 AND revoked_at IS NULL', [id]);
  return rows[0] ? findAgentByTokenHash(rows[0].token_hash) : null;
}

export async function setAgentStatus(id: string, status: 'connected' | 'disconnected', capabilities?: object, version?: string) {
  await systeem(
    `UPDATE app.agents SET status = $2, last_seen_at = now(), capabilities = COALESCE($3::jsonb, capabilities), agent_version = COALESCE($4, agent_version)
      WHERE id = $1`, [id, status, capabilities ? JSON.stringify(capabilities) : null, version ? version.slice(0, 40) : null]);
}

export async function touchAgent(id: string, capabilities?: object, version?: string) {
  await systeem(
    `UPDATE app.agents SET last_seen_at = now(), capabilities = COALESCE($2::jsonb, capabilities), agent_version = COALESCE($3, agent_version)
      WHERE id = $1`, [id, capabilities ? JSON.stringify(capabilities) : null, version ? version.slice(0, 40) : null]);
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
  id: string, from: CommandStatus[], to: CommandStatus, result?: unknown, userId?: string, agentId?: string,
) {
  // agentId (audit M3): een resultaat via de WebSocket sluit alleen een opdracht af die naar DEZE agent ging.
  const { rows } = await systeem(
    `UPDATE app.agent_commands SET status = $3, result = COALESCE($4::jsonb, result),
        decided_at = CASE WHEN $3 IN ('approved', 'rejected') THEN now() ELSE decided_at END,
        finished_at = CASE WHEN $3 IN ('succeeded', 'failed', 'timeout') THEN now() ELSE finished_at END
      WHERE id = $1 AND status = ANY($2) AND ($5::text IS NULL OR user_id = $5) AND ($6::uuid IS NULL OR agent_id = $6) RETURNING *`,
    [id, from, to, result === undefined ? null : JSON.stringify(result), userId ?? null, agentId ?? null]);
  return rows[0] ?? null;
}

/** Een wachtende opdracht die ouder is dan `minutes` kan niet meer worden goedgekeurd (verse goedkeuring). */
export async function expireStalePending(userId: string, minutes: number): Promise<number> {
  const r = await systeem(
    `UPDATE app.agent_commands SET status = 'timeout', finished_at = now(), result = '{"error":"approval expired"}'::jsonb
      WHERE user_id = $1 AND status = 'pending_approval' AND created_at < now() - make_interval(mins => $2)`, [userId, minutes]);
  return r.rowCount ?? 0;
}
