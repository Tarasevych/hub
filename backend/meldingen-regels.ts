// Meldingen v2 (vlag `meldingen-v2`, standaard UIT; migraties 0142–0143) — LEVERINGSREGELS per gebruiker, OP DE SERVER,
// zodat ze op alle apparaten gelden (niet alleen in één browser). Regels: per dienst, account en categorie, vier modi, plus een
// tijdelijk «Не турбувати». De logica zelf staat in shared/meldingen-v2/beleid.ts (dezelfde code als in de browser).
//
// Opslag: app.records, tbl `melding_regels_v1`, één rij per gebruiker (userId). RLS-groep «voorkeuren» (migratie 0143).
// Beschermde gebeurtenissen (beveiliging, bevestigingen, verplicht) kunnen met deze regels NIET onder «normaal» zakken: dat
// beslist `levering()` bij het tonen, ongeacht wat hier staat.
import { db, error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { legeRegels, normaliseerRegels, type LeverRegels } from '../shared/meldingen-v2/beleid';

export const MELDING_REGELS_TABEL = 'melding_regels_v1';
export const MELDINGEN_V2_VLAG = 'meldingen-v2';

type Auth = { errorCode: string } | { user: { id: string; status?: string } };
type RequireSession = (event: unknown, body: unknown) => Promise<Auth>;
type Ctx = { event: unknown; body: unknown };

async function vlagAan(userId: string): Promise<boolean> {
  try { const { berekenen } = await import('./vlaggen'); return (await berekenen({ id: userId } as never, [MELDINGEN_V2_VLAG]))[0]?.value === true; } catch { return false; }
}

export async function leesRegels(userId: string): Promise<{ id: string | null; regels: LeverRegels }> {
  const { items } = await db.list<{ userId: string; regels: unknown }>(MELDING_REGELS_TABEL, { filter: { userId }, limit: 5, nieuwsteEerst: true });
  const rij = items[0];
  return rij ? { id: rij.id, regels: normaliseerRegels(rij.regels) } : { id: null, regels: legeRegels() };
}

export async function bewaarRegels(userId: string, invoer: unknown, nu = Date.now()): Promise<LeverRegels> {
  const regels = { ...normaliseerRegels(invoer, nu), bijgewerkt: nu };
  const { id } = await leesRegels(userId);
  const record = { userId, regels, updatedAt: nu };
  if (id) await db.update(MELDING_REGELS_TABEL, [{ id, record }]);
  else await db.add(MELDING_REGELS_TABEL, [record]);
  return regels;
}

export function meldingRegelsRoutes(deps: { requireSession: RequireSession }): Record<string, RouterMiddleware[]> {
  const route = (run: (body: Record<string, unknown>, userId: string) => Promise<object>) => (async (raw: unknown) => {
    const ctx = raw as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved') return error('OWNER_SESSION_REQUIRED', 401);
    if (!(await vlagAan(auth.user.id))) return error('MELDINGEN_V2_UIT', 404);
    const body = (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>;
    try { return json({ ok: true, ...(await run(body, auth.user.id)) }); }
    catch (e) { console.error('[meldingen-regels] mislukt:', (e as Error).message); return error('MELDING_REGELS_MISLUKT', 500); }
  }) as unknown as RouterMiddleware;
  return {
    'POST /api/owner/meldingen/regels': [route(async (_b, userId) => ({ regels: (await leesRegels(userId)).regels }))],
    'POST /api/owner/meldingen/regels/opslaan': [route(async (b, userId) => {
      const raw = JSON.stringify(b.regels ?? null);
      if (raw.length > 64_000) throw new Error('TE_GROOT');
      return { regels: await bewaarRegels(userId, b.regels) };
    })],
  };
}
