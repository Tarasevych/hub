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

  async revoke(input: { code: string; actor: Actor }): Promise<{ ok: true }> {
    const row = await load(input.code);
    if (row.auth_mode !== 'required' || !input.actor?.userId || row.created_by !== input.actor.userId) throw new InviteError('invite_not_revocable');
    await getPool().query('UPDATE app.invites SET revoked_at = now() WHERE code = $1 AND revoked_at IS NULL', [row.code]);
    return { ok: true };
  },
};
