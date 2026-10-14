// MCP-connector voor Claude: databasetoegang voor app.mcp_oauth_clients, app.mcp_oauth_auth en app.mcp_oauth_tokens (0010).
// Alles via de systeemrol: de publieke OAuth-eindpunten hebben geen sessie. Elke query die bij een gebruiker hoort
// filtert zelf op user_id; RLS (0010) is de tweede laag.
import { getPool } from '../server/platform/pg';
import { heeftApiRecht } from './api-recht';
import { accessSeconden, duur as duurVan, isDuurId, refreshSeconden, type DuurId } from '../shared/ai-verbinding';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';

const q = (sql: string, params: unknown[] = []) => getPool('systeem').query(sql, params);

export const LIMITS = {
  maxClients: 500,
  maxActiveGrantsPerUser: 10,
  authRequestTtlMin: 10,
  codeTtlSec: 120,
  accessTtlSec: 3600,
  refreshTtlDays: 30,
};

export interface TokenRow {
  id: string; user_id: string; client_id: string; client_name: string; scope: string;
  access_expires_at: Date; refresh_expires_at: Date; created_at: Date; last_used_at: Date | null; revoked_at: Date | null;
  duur?: string | null;
  /** Ruimte van de verbinding (0042, shared/ai-ruimte.ts): 'prive' of 'technisch'; oud = prive. */
  ruimte?: string | null;
}
export interface AuthRow {
  id: string; client_id: string; redirect_uri: string; code_challenge: string; state: string | null; scope: string;
  resource: string | null; status: 'pending' | 'approved' | 'denied' | 'used'; expires_at: Date; user_id: string | null;
  client_name?: string; duur?: string | null; ruimte?: string | null;
}

// ---- clients (DCR) ----

export async function countClients(): Promise<number> {
  return (await q('SELECT count(*)::int AS n FROM app.mcp_oauth_clients')).rows[0].n;
}
export async function insertClient(clientId: string, name: string, redirectUris: string[]): Promise<void> {
  await q('INSERT INTO app.mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ($1, $2, $3)', [clientId, name, redirectUris]);
}
export async function getClient(clientId: string): Promise<{ client_id: string; client_name: string; redirect_uris: string[] } | null> {
  const { rows } = await q('SELECT client_id, client_name, redirect_uris FROM app.mcp_oauth_clients WHERE client_id = $1', [clientId]);
  return rows[0] ?? null;
}
/** Oude clients zonder tokens opruimen: DCR maakt bij elke nieuwe verbinding een client aan. */
export async function purgeStale(): Promise<void> {
  await q(`DELETE FROM app.mcp_oauth_auth WHERE expires_at < now() - interval '1 hour'`);
  await q(`DELETE FROM app.mcp_oauth_clients c
            WHERE c.created_at < now() - interval '1 day'
              AND NOT EXISTS (SELECT 1 FROM app.mcp_oauth_tokens t WHERE t.client_id = c.client_id AND t.revoked_at IS NULL)`);
}

// ---- autorisatieverzoeken en codes ----

export async function insertAuthRequest(a: {
  id: string; clientId: string; redirectUri: string; codeChallenge: string; state: string | null; scope: string; resource: string | null;
}): Promise<void> {
  await q(
    `INSERT INTO app.mcp_oauth_auth (id, client_id, redirect_uri, code_challenge, state, scope, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(mins => $8))`,
    [a.id, a.clientId, a.redirectUri, a.codeChallenge, a.state, a.scope, a.resource, LIMITS.authRequestTtlMin]);
}

export async function getPendingAuth(id: string): Promise<AuthRow | null> {
  const { rows } = await q(
    `SELECT a.*, c.client_name FROM app.mcp_oauth_auth a JOIN app.mcp_oauth_clients c USING (client_id)
      WHERE a.id = $1 AND a.status = 'pending' AND a.expires_at > now()`, [id]);
  return rows[0] ?? null;
}

/** Atomair: een verzoek kan maar één keer worden goedgekeurd of geweigerd. De ruimte is de keuze van de mens op de site (nooit van de klant). */
export async function decideAuth(id: string, userId: string, approve: boolean, codeHash: string | null, duur: DuurId | null = null, ruimte: AiRuimte = 'prive'): Promise<AuthRow | null> {
  const { rows } = await q(
    `UPDATE app.mcp_oauth_auth
        SET status = $3, user_id = $2, decided_at = now(), code_hash = $4,
            code_expires_at = CASE WHEN $4::text IS NULL THEN NULL ELSE now() + make_interval(secs => $5) END, duur = $6, ruimte = $7
      WHERE id = $1 AND status = 'pending' AND expires_at > now() RETURNING *`,
    [id, userId, approve ? 'approved' : 'denied', codeHash, LIMITS.codeTtlSec, duur, ruimteOf(ruimte)]);
  return rows[0] ?? null;
}

/** Atomair: een code wordt hoogstens één keer ingewisseld, en alleen binnen de TTL. */
export async function consumeCode(codeHash: string): Promise<(AuthRow & { client_name: string }) | null> {
  const { rows } = await q(
    `UPDATE app.mcp_oauth_auth a SET status = 'used'
       FROM app.mcp_oauth_clients c
      WHERE a.code_hash = $1 AND a.status = 'approved' AND a.code_expires_at > now() AND c.client_id = a.client_id
      RETURNING a.*, c.client_name`, [codeHash]);
  return rows[0] ?? null;
}

// ---- tokens ----

export async function countActiveGrants(userId: string): Promise<number> {
  return (await q(
    `SELECT count(*)::int AS n FROM app.mcp_oauth_tokens WHERE user_id = $1 AND revoked_at IS NULL AND refresh_expires_at > now()`,
    [userId])).rows[0].n;
}

/** Levensduur in seconden: gekozen duur (shared/ai-verbinding.ts), of de oude vaste waarden voor grants zonder keuze (NULL). */
export function levensduur(duur: string | null | undefined): { accessSec: number; refreshSec: number } {
  if (!isDuurId(duur)) return { accessSec: LIMITS.accessTtlSec, refreshSec: LIMITS.refreshTtlDays * 86400 };
  const d = duurVan(duur);
  return { accessSec: accessSeconden(d), refreshSec: refreshSeconden(d) };
}

export async function insertToken(t: {
  userId: string; clientId: string; clientName: string; scope: string; accessHash: string; refreshHash: string; duur?: DuurId | null; ruimte?: AiRuimte | null;
}): Promise<string> {
  const l = levensduur(t.duur);
  const r = await q(
    `INSERT INTO app.mcp_oauth_tokens
       (user_id, client_id, client_name, scope, access_hash, refresh_hash, access_expires_at, refresh_expires_at, duur, ruimte)
     VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7), now() + make_interval(secs => $8), $9, $10) RETURNING id`,
    [t.userId, t.clientId, t.clientName, t.scope, t.accessHash, t.refreshHash, l.accessSec, l.refreshSec, isDuurId(t.duur) ? t.duur : null, ruimteOf(t.ruimte)]);
  return String(r.rows[0]?.id ?? '');
}

/** Zoekt een actief toegangstoken (niet ingetrokken, niet verlopen) en noteert het gebruik. */
/** M4: mag deze gebruiker de connector nog gebruiken? (status, verwijderd/met pensioen, AI geblokkeerd, recht api-platform) */
export async function userMayUseConnector(userId: string): Promise<boolean> {
  const { rows } = await q(
    `SELECT r.data->>'status' AS status, r.data->>'role' AS role, r.data->>'email' AS email, r.data->'entitlements' AS entitlements,
            COALESCE((r.data->>'retiredAt')::numeric, 0) AS retired, COALESCE((r.data->>'deletedAt')::numeric, 0) AS deleted,
            EXISTS (SELECT 1 FROM app.user_ai_settings s WHERE s.user_id = r.id AND s.blocked_at IS NOT NULL) AS ai_blocked
       FROM app.records r WHERE r.tbl = 'users' AND r.id = $1`, [userId]);
  const u = rows[0];
  if (!u || u.status !== 'approved' || Number(u.retired) > 0 || Number(u.deleted) > 0 || u.ai_blocked) return false;
  return heeftApiRecht({ role: u.role, email: u.email, entitlements: u.entitlements });
}

export async function findByAccessHash(accessHash: string): Promise<TokenRow | null> {
  const { rows } = await q(
    `UPDATE app.mcp_oauth_tokens SET last_used_at = now()
      WHERE access_hash = $1 AND revoked_at IS NULL AND access_expires_at > now() AND refresh_expires_at > now()
      RETURNING id, user_id, client_id, client_name, scope, access_expires_at, refresh_expires_at, created_at, last_used_at, revoked_at, ruimte`,
    [accessHash]);
  return rows[0] ?? null;
}

/**
 * Roteert het refresh-token in dezelfde rij (oud wordt prev_refresh_hash). Geeft null als het token onbekend,
 * verlopen of ingetrokken is.
 */
export async function rotateRefresh(clientId: string, oldHash: string, newRefreshHash: string, newAccessHash: string) {
  // De duur blijft die van de grant (keuze bij «Дозволити»); het UPDATE-criterium blijft de atomaire controle.
  const huidig = (await q('SELECT duur FROM app.mcp_oauth_tokens WHERE refresh_hash = $1 AND client_id = $2', [oldHash, clientId])).rows[0];
  const l = levensduur(huidig?.duur);
  const { rows } = await q(
    `UPDATE app.mcp_oauth_tokens
        SET prev_refresh_hash = refresh_hash, refresh_hash = $3, access_hash = $4,
            access_expires_at = now() + make_interval(secs => $5), refresh_expires_at = now() + make_interval(secs => $6),
            last_used_at = now()
      WHERE refresh_hash = $2 AND client_id = $1 AND revoked_at IS NULL AND refresh_expires_at > now()
      RETURNING id, user_id, scope, duur`,
    [clientId, oldHash, newRefreshHash, newAccessHash, l.accessSec, l.refreshSec]);
  return rows[0] as { id: string; user_id: string; scope: string; duur: string | null } | undefined ?? null;
}

/** Een al geroteerd refresh-token opnieuw gebruiken wijst op diefstal: de hele grant wordt ingetrokken. */
export async function revokeIfReused(clientId: string, presentedHash: string): Promise<Array<{ id: string; user_id: string; client_name: string }>> {
  const r = await q(
    `UPDATE app.mcp_oauth_tokens SET revoked_at = now()
      WHERE prev_refresh_hash = $2 AND client_id = $1 AND revoked_at IS NULL RETURNING id, user_id, client_name`, [clientId, presentedHash]);
  return r.rows;
}

/** RFC 7009: een token (access of refresh) van deze client intrekken. true = er is iets ingetrokken. */
export async function revokeByToken(clientId: string, tokenHash: string): Promise<Array<{ id: string; user_id: string; client_name: string }>> {
  const r = await q(
    `UPDATE app.mcp_oauth_tokens SET revoked_at = now()
      WHERE client_id = $1 AND revoked_at IS NULL AND (access_hash = $2 OR refresh_hash = $2) RETURNING id, user_id, client_name`, [clientId, tokenHash]);
  return r.rows;
}

export async function listGrants(userId: string): Promise<TokenRow[]> {
  const { rows } = await q(
    `SELECT id, user_id, client_id, client_name, scope, access_expires_at, refresh_expires_at, created_at, last_used_at, revoked_at, duur, ruimte
       FROM app.mcp_oauth_tokens WHERE user_id = $1 AND revoked_at IS NULL AND refresh_expires_at > now()
      ORDER BY created_at DESC`, [userId]);
  return rows;
}

/** Alle verbindingen van de laatste `dagen`, ook ingetrokken of verlopen (geschiedenis op /agents). */
export async function listGrantHistory(userId: string, dagen = 90): Promise<TokenRow[]> {
  const { rows } = await q(
    `SELECT id, user_id, client_id, client_name, scope, access_expires_at, refresh_expires_at, created_at, last_used_at, revoked_at, duur, ruimte
       FROM app.mcp_oauth_tokens WHERE user_id = $1 AND (revoked_at IS NULL OR revoked_at > now() - make_interval(days => $2))
        AND (refresh_expires_at > now() - make_interval(days => $2))
      ORDER BY created_at DESC LIMIT 100`, [userId, dagen]);
  return rows;
}

export async function revokeGrant(userId: string, id: string): Promise<boolean> {
  const r = await q(`UPDATE app.mcp_oauth_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, [id, userId]);
  return (r.rowCount ?? 0) > 0;
}
