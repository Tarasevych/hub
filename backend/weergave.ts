// Weergave per account: «простий» / «розширений» (zie shared/weergave.ts). Alleen weergave — geeft en neemt geen rechten.
// Lezen en schrijven via de systeemrol met een vaste user_id uit de sessie (nooit uit de body). Geen auditregel per klik (zoals de
// rest van de weergave-instellingen: menu, zijbalk): het verandert niets aan toegang.
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { getPool } from '../server/platform/pg';
import { isModus, standaardModus, type Modus } from '../shared/weergave';
import { isEigenaar } from './tech-profiel';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };

export async function modusVan(u: SessionOk['user']): Promise<{ modus: Modus; gekozen: boolean; standaard: Modus }> {
  const standaard = standaardModus(isEigenaar(u));
  const r = (await getPool('systeem').query('SELECT modus FROM app.ui_weergave WHERE user_id = $1', [u.id])).rows[0];
  return isModus(r?.modus) ? { modus: r.modus, gekozen: true, standaard } : { modus: standaard, gekozen: false, standaard };
}

export async function modusZetten(u: SessionOk['user'], modus: unknown) {
  if (!isModus(modus)) return null;
  await getPool('systeem').query(`INSERT INTO app.ui_weergave (user_id, modus) VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET modus = EXCLUDED.modus, gewijzigd_op = now()`, [u.id, modus]);
  return modusVan(u);
}

export function weergaveRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  const gate = (run: (ctx: Ctx, u: SessionOk['user']) => Promise<ReturnType<typeof json>>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved' && !isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    return run(ctx, auth.user);
  }) as RouterMiddleware;
  return {
    'POST /api/owner/weergave': [gate(async (_ctx, u) => json(await modusVan(u)))],
    'POST /api/owner/weergave/zet': [gate(async (ctx, u) => {
      const b = ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {};
      const r = await modusZetten(u, b.modus);
      return r ? json(r) : error('MODUS_ONGELDIG', 400);
    })],
  };
}
