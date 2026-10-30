// UI-014 (bugfix, zonder vlag): gelezen activiteit-ids per account, OP DE SERVER, zodat «прочитано» op alle subdomeinen, tabbladen
// en apparaten geldt (vroeger alleen localStorage van één subdomein). Opslag: app.records, tbl `melding_gelezen_v1`, één rij per
// gebruiker, RLS-groep «voorkeuren» (migratie 0190). Begrensd: de nieuwste 600 ids.
import { db, error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';

export const MELDING_GELEZEN_TABEL = 'melding_gelezen_v1';
export const GELEZEN_MAX = 600;
type Auth = { errorCode: string } | { user: { id: string; status?: string } };
type RequireSession = (event: unknown, body: unknown) => Promise<Auth>;

export const normaliseerIds = (v: unknown, max = GELEZEN_MAX): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 120 && /^[\w:.@|-]+$/.test(x)))].slice(-max) : [];

export async function leesGelezen(userId: string): Promise<{ id: string | null; ids: string[] }> {
  const { items } = await db.list<{ userId: string; ids: unknown }>(MELDING_GELEZEN_TABEL, { filter: { userId }, limit: 3, nieuwsteEerst: true });
  return items[0] ? { id: items[0].id, ids: normaliseerIds(items[0].ids) } : { id: null, ids: [] };
}
export async function voegGelezenToe(userId: string, nieuw: unknown, nu = Date.now()): Promise<string[]> {
  const extra = normaliseerIds(nieuw, 500);
  const { id, ids } = await leesGelezen(userId);
  const samen = [...new Set([...ids, ...extra])].slice(-GELEZEN_MAX);
  const record = { userId, ids: samen, updatedAt: nu };
  if (id) await db.update(MELDING_GELEZEN_TABEL, [{ id, record }]); else await db.add(MELDING_GELEZEN_TABEL, [record]);
  return samen;
}
export function meldingGelezenRoutes(deps: { requireSession: RequireSession }): Record<string, RouterMiddleware[]> {
  const route = (run: (body: Record<string, unknown>, userId: string) => Promise<object>) => (async (raw: unknown) => {
    const ctx = raw as { event: unknown; body: unknown };
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved') return error('OWNER_SESSION_REQUIRED', 401);
    const body = (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>;
    try { return json({ ok: true, ...(await run(body, auth.user.id)) }); }
    catch (e) { console.error('[meldingen-gelezen] mislukt:', (e as Error).message); return error('MELDING_GELEZEN_MISLUKT', 500); }
  }) as unknown as RouterMiddleware;
  return {
    'POST /api/owner/meldingen/gelezen': [route(async (_b, userId) => ({ ids: (await leesGelezen(userId)).ids }))],
    'POST /api/owner/meldingen/gelezen/toevoegen': [route(async (b, userId) => ({ aantal: (await voegGelezenToe(userId, b.ids)).length }))],
  };
}
