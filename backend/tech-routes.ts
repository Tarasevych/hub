// Routes van het technisch profiel (zie backend/tech-profiel.ts). Elke route vraagt een sessie; activeren en toekennen ook een verse
// bevestiging van de aanmelding (stap-op). De tabcontext komt uit de body (zelfde als elke sessieroute) en bindt de activering aan dat tabblad.
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { BAND_KLEUREN, BAND_PATRONEN, DUUR_KEUZES, TECH_ROLLEN, maxMinutenVoor } from '../shared/tech-rollen';
import * as tp from './tech-profiel';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
export type TechRouteDeps = { stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> };

const bodyOf = (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {});

export function techRoutes(requireSession: RequireSession, deps: TechRouteDeps = {}): Record<string, RouterMiddleware[]> {
  const gate = (opts: { stepUp?: boolean }, run: (ctx: Ctx, auth: SessionOk, tab: string) => Promise<Resp>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved' && !tp.isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    const tab = String(bodyOf(ctx.body).tabContext || '');
    if (!tp.TAB_RE.test(tab)) return error('TAB_ONGELDIG', 400);
    if (opts.stepUp) {
      if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403);
      const su = await deps.stepUp(ctx, auth);
      if (su) return su;
    }
    try { return await run(ctx, auth, tab); }
    catch (err) { if (err instanceof tp.TechFout) return error(err.code, err.status); throw err; }
  }) as RouterMiddleware;

  const status = async (auth: SessionOk, tab: string) => {
    const profiel = await tp.profielVan(auth.user);
    const actief = profiel && !profiel.ingetrokkenOp ? await tp.actieveActivatie(auth.user.id, tab) : null;
    return {
      profiel: profiel && !profiel.ingetrokkenOp ? { ...profiel, maxNu: maxMinutenVoor(profiel.rollen, profiel.maxMinuten) } : null,
      activatie: actief, nu: Date.now(),
      catalogus: { rollen: TECH_ROLLEN.map((r) => ({ id: r.id, naam: r.naam, kort: r.kort, plafondMinuten: r.plafondMinuten })), kleuren: BAND_KLEUREN, patronen: BAND_PATRONEN, duren: DUUR_KEUZES },
    };
  };

  return {
    'POST /api/owner/tech/status': [gate({}, async (_ctx, auth, tab) => json(await status(auth, tab)))],
    'POST /api/owner/tech/activeren': [gate({ stepUp: true }, async (ctx, auth, tab) => {
      const b = bodyOf(ctx.body);
      await tp.activeren(auth.user, tab, Number(b.minuten), String(b.reden ?? ''));
      return json(await status(auth, tab));
    })],
    'POST /api/owner/tech/beeindigen': [gate({}, async (_ctx, auth, tab) => { await tp.beeindigen(auth.user, tab); return json(await status(auth, tab)); })],
    'POST /api/owner/tech/band': [gate({}, async (ctx, auth, tab) => {
      const b = bodyOf(ctx.body);
      await tp.bandZetten(auth.user, b.kleur, b.patroon);
      return json(await status(auth, tab));
    })],
    'POST /api/owner/tech/profielen': [gate({}, async (_ctx, auth, tab) => json({ profielen: await tp.profielenLijst(auth.user, tab) }))],
    'POST /api/owner/tech/toekennen': [gate({ stepUp: true }, async (ctx, auth, tab) => {
      const b = bodyOf(ctx.body);
      const p = await tp.toekennen(auth.user, tab, { email: String(b.email ?? ''), rollen: b.rollen, maxMinuten: b.maxMinuten, notitie: b.notitie });
      return json({ profiel: p, profielen: await tp.profielenLijst(auth.user, tab) });
    })],
    'POST /api/owner/tech/intrekken': [gate({}, async (ctx, auth, tab) => {
      const b = bodyOf(ctx.body);
      await tp.intrekken(auth.user, tab, String(b.userId ?? ''), b.reden);
      return json({ ok: true, profielen: await tp.profielenLijst(auth.user, tab) });
    })],
  };
}
