// Compatibiliteitslaag voor de vroegere AppDeploy `invites`-API (tabel app.invites).
// Codes zijn 128 bit willekeurig (base64url). Uitnodigingen zijn herbruikbaar tot ze
// verlopen of ingetrokken zijn, zoals bij AppDeploy — behalve met `eenmalig: true` (fase 3):
// dan wint precies één aansluiting (voorwaardelijke UPDATE), daarna 'invite_used'.
import { randomBytes } from 'node:crypto';
import { getPool } from './pg';

export type InviteErrorCode =
  | 'invite_not_found'
  | 'invite_not_allowed'
  | 'auth_required'
  | 'invite_expired'
  | 'invite_revoked'
  | 'invite_used'
  | 'invite_not_revocable';

export class InviteError extends Error {
  override readonly name = 'InviteError' as const;
  constructor(readonly code: InviteErrorCode) {
    super(code);
  }
}

export function isInviteError(err: unknown): err is InviteError {
  return err instanceof InviteError || (!!err && typeof err === 'object' && (err as { name?: unknown }).name === 'InviteError');
}

type Actor = { userId: string; email?: string; name?: string; scope?: string };
type InviteRow = {
  code: string; resource_type: string; auth_mode: 'anonymous' | 'required'; allow_list: string[];
  context: Record<string, unknown>; created_by: string | null; expires_at: Date | null; revoked_at: Date | null;
};

const CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

async function load(code: string): Promise<InviteRow> {
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) throw new InviteError('invite_not_found');
  const result = await getPool().query('SELECT * FROM app.invites WHERE code = $1', [code]);
  const row = result.rows[0] as InviteRow | undefined;
  if (!row) throw new InviteError('invite_not_found');
  return row;
}
const statusOf = (row: InviteRow) => (row.revoked_at ? 'revoked' : row.expires_at && row.expires_at.getTime() <= Date.now() ? 'expired' : 'open');

export const invites = {
  async create(input: { resourceType: string; authMode: 'required' | 'anonymous'; actor?: Actor; allowList?: string[]; expiresInSec?: number; context?: Record<string, unknown>; eenmalig?: boolean }): Promise<{ code: string }> {
    const allowList = (input.allowList || []).map((v) => String(v).trim().toLowerCase()).filter(Boolean);
    if (allowList.length && input.authMode !== 'required') throw new InviteError('invite_not_allowed');
    if (input.authMode === 'required' && !input.actor?.userId) throw new InviteError('auth_required');
    const code = randomBytes(16).toString('base64url');
    const expires = input.expiresInSec && input.expiresInSec > 0 ? new Date(Date.now() + input.expiresInSec * 1000) : null;
    await getPool().query(
      `INSERT INTO app.invites (code, resource_type, auth_mode, allow_list, context, created_by, expires_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
      [code, String(input.resourceType), input.authMode, allowList, JSON.stringify({ ...(input.context || {}), ...(input.eenmalig ? { eenmalig: true } : {}) }), input.actor?.userId || null, expires],
    );
    return { code };
  },

  async resolve(input: { code: string; actor?: Actor }) {
    const row = await load(input.code);
    return { status: statusOf(row), resourceType: row.resource_type, authMode: row.auth_mode, expiresAt: row.expires_at ? row.expires_at.toISOString() : null, context: row.context };
  },

  async join(input: { code: string; actor?: Actor }) {
    const row = await load(input.code);
    const status = statusOf(row);
    if (status === 'revoked') throw new InviteError('invite_revoked');
    if (status === 'expired') throw new InviteError('invite_expired');
    if (row.auth_mode === 'required') {
      if (!input.actor?.userId) throw new InviteError('auth_required');
      if (row.allow_list.length) {
        const ids = [input.actor.userId, input.actor.email].filter(Boolean).map((v) => String(v).toLowerCase());
        if (!ids.some((id) => row.allow_list.includes(id))) throw new InviteError('invite_not_allowed');
      }
    }
    if (row.context && row.context.eenmalig === true) {
      const gewonnen = await getPool().query('UPDATE app.invites SET join_count = join_count + 1 WHERE code = $1 AND join_count = 0 AND revoked_at IS NULL', [row.code]);
      if (gewonnen.rowCount !== 1) throw new InviteError('invite_used');
    } else {
      await getPool().query('UPDATE app.invites SET join_count = join_count + 1 WHERE code = $1', [row.code]);
    }
    return { code: row.code, resourceType: row.resource_type, context: row.context };
  },

  /**
   * Intrekken door de maker, of (beheerdeAan) door wie de route zelf als beheerder van de bron heeft
   * gecontroleerd. Audit-fix 10: ook anonieme links (vroeger alleen auth_mode 'required').
   */
  /**
   * IDENTITEIT-015 (крок «delen»): відкриті посилання одного простору — для переліку «Відкриті посилання».
   * Open links van één werkruimte: niet ingetrokken, niet verlopen en (eenmalig) nog niet gebruikt. De code zelf verlaat de server
   * NIET: alleen een id (eerste 32 hex van sha256(code), om in te trekken) en de eerste 4 tekens om de link te herkennen.
   * Index: invites_werkruimte_idx (migratie 0273).
   */
  async openVoorWerkruimte(resourceType: string, workspaceId: string, limiet = 100): Promise<Array<{ id: string; begin: string; authMode: string; allowList: string[]; context: Record<string, unknown>; createdBy: string | null; expiresAt: string | null; createdAt: string }>> {
    const r = await getPool().query(
      `SELECT left(encode(sha256(convert_to(code, 'UTF8')), 'hex'), 32) AS id, left(code, 4) AS begin, auth_mode, allow_list, context, created_by, expires_at, created_at
         FROM app.invites
        WHERE resource_type = $1 AND context->>'workspaceId' = $2 AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
          AND NOT (coalesce(context->>'eenmalig', '') = 'true' AND join_count > 0)
        ORDER BY created_at DESC LIMIT $3`,
      [String(resourceType), String(workspaceId), Math.max(1, Math.min(200, Math.floor(limiet)))],
    );
    return r.rows.map((x: { id: string; begin: string; auth_mode: string; allow_list: string[]; context: Record<string, unknown>; created_by: string | null; expires_at: Date | null; created_at: Date }) => ({
      id: x.id, begin: x.begin, authMode: x.auth_mode, allowList: x.allow_list || [], context: x.context || {}, createdBy: x.created_by,
      expiresAt: x.expires_at ? x.expires_at.toISOString() : null, createdAt: x.created_at.toISOString(),
    }));
  },

  /** Code bij een id uit openVoorWerkruimte — alleen binnen dezelfde bron en werkruimte (ook al ingetrokken: intrekken is idempotent). */
  async codeVoorId(resourceType: string, workspaceId: string, id: string): Promise<string | null> {
    if (!/^[0-9a-f]{32}$/.test(String(id || ''))) return null;
    const r = await getPool().query(
      `SELECT code FROM app.invites WHERE resource_type = $1 AND context->>'workspaceId' = $2
          AND left(encode(sha256(convert_to(code, 'UTF8')), 'hex'), 32) = $3 LIMIT 1`,
      [String(resourceType), String(workspaceId), String(id)],
    );
    return (r.rows[0]?.code as string | undefined) || null;
  },

  async revoke(input: { code: string; actor: Actor; beheerder?: boolean }): Promise<{ ok: true }> {
    const row = await load(input.code);
    if (!input.actor?.userId || (row.created_by !== input.actor.userId && input.beheerder !== true)) throw new InviteError('invite_not_revocable');
    await getPool().query('UPDATE app.invites SET revoked_at = now() WHERE code = $1 AND revoked_at IS NULL', [row.code]);
    return { ok: true };
  },
};
