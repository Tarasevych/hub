// UI-014 fase 2B (vlag meldingen-uitleg-v3, standaard UIT): blijvende status per melding per account, OP DE SERVER
// (прочитане / вирішено / архів / відкладено + wie/wanneer/hoe) en de bewaartermijn voor automatisch archiveren.
// Opslag: app.records, tbl `melding_status_v1`, één rij per gebruiker, RLS-groep «voorkeuren» (migratie 0196).
// Pure regels: shared/meldingen-v2/status.ts. Opschonen gebeurt bij elk lezen (geen aparte taak nodig) en wist nooit iets.
import { db, error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { MELDING_STATUSSEN, normaliseerBewaarDagen, normaliseerStatus, opschonen, zetStatus, type MeldingStatus, type StatusStand } from '../shared/meldingen-v2/status';

export const MELDING_STATUS_TABEL = 'melding_status_v1';
type Auth = { errorCode: string } | { user: { id: string; status?: string } };
type RequireSession = (event: unknown, body: unknown) => Promise<Auth>;

async function lees(userId: string, nu: number): Promise<{ id: string | null; stand: StatusStand }> {
  const { items } = await db.list<{ userId: string; stand: unknown }>(MELDING_STATUS_TABEL, { filter: { userId }, limit: 3, nieuwsteEerst: true });
  return items[0] ? { id: items[0].id, stand: normaliseerStatus(items[0].stand, nu) } : { id: null, stand: normaliseerStatus(null, nu) };
}
async function schrijf(userId: string, id: string | null, stand: StatusStand) {
  const record = { userId, stand, updatedAt: stand.bijgewerkt };
  if (id) await db.update(MELDING_STATUS_TABEL, [{ id, record }]); else await db.add(MELDING_STATUS_TABEL, [record]);
}
export async function leesStatus(userId: string, nu = Date.now()): Promise<StatusStand> {
  const { id, stand } = await lees(userId, nu);
  const o = opschonen(stand, nu);
  if (o.gearchiveerd || o.opgeruimd) { await schrijf(userId, id, o.stand); console.info(`[meldingen-status] automatisch: ${o.gearchiveerd} gearchiveerd, ${o.opgeruimd} opgeruimd`); }
  return o.stand;
}
export async function wijzigStatus(userId: string, body: Record<string, unknown>, nu = Date.now()): Promise<StatusStand> {
  const { id, stand } = await lees(userId, nu);
  let volgende = stand;
  if (body.bewaarDagen !== undefined) volgende = { ...volgende, bewaarDagen: normaliseerBewaarDagen(body.bewaarDagen), bijgewerkt: nu };
  const s = body.status;
  if (Array.isArray(body.ids) && (s === 'nieuw' || MELDING_STATUSSEN.includes(s as MeldingStatus))) {
    volgende = zetStatus(volgende, { ids: body.ids as string[], status: s as MeldingStatus | 'nieuw', hoe: body.hoe === 'bulk' ? 'bulk' : 'kaart', tot: Number(body.tot) || undefined, beveiliging: Array.isArray(body.beveiliging) ? (body.beveiliging as string[]) : [] }, 'eigenaar', nu);
  }
  if (volgende !== stand) await schrijf(userId, id, volgende);
  return volgende;
}
export function meldingStatusRoutes(deps: { requireSession: RequireSession }): Record<string, RouterMiddleware[]> {
  const route = (run: (body: Record<string, unknown>, userId: string) => Promise<StatusStand>) => (async (raw: unknown) => {
    const ctx = raw as { event: unknown; body: unknown };
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved') return error('OWNER_SESSION_REQUIRED', 401);
    const body = (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>;
    try { return json({ ok: true, stand: await run(body, auth.user.id) }); }
    catch (e) { console.error('[meldingen-status] mislukt:', (e as Error).message); return error('MELDING_STATUS_MISLUKT', 500); }
  }) as unknown as RouterMiddleware;
  return {
    'POST /api/owner/meldingen/status': [route((_b, u) => leesStatus(u))],
    'POST /api/owner/meldingen/status/zetten': [route((b, u) => wijzigStatus(u, b))],
  };
}
