// Routes van «Підтримка від імені» (backend/ondersteuning.ts). Ondersteuner: alleen in een actief technisch profiel; gebruiker:
// eigen sessie, toestaan met verse bevestiging van de aanmelding (stap-op).
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import * as o from './ondersteuning';
import { isEigenaar, TechFout } from './tech-profiel';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;

export function ondersteuningRoutes(requireSession: RequireSession, deps: { stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null>; meld: o.Melder }): Record<string, RouterMiddleware[]> {
  const gate = (opts: { stepUp?: boolean }, run: (b: Record<string, unknown>, auth: SessionOk) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved' && !isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    if (opts.stepUp) { if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403); const su = await deps.stepUp(ctx, auth); if (su) return su; }
    const b = ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {};
    try { return json(await run(b, auth)); } catch (e) { if (e instanceof TechFout) return error(e.code, e.status); throw e; }
  }) as RouterMiddleware;
  const tab = (b: Record<string, unknown>) => String(b.tabContext || '');
  return {
    // ondersteuner
    'POST /api/ondersteuning/aanvragen': [gate({ stepUp: true }, (b, a) => o.aanvragen(a.user, tab(b), { email: b.email, reden: b.reden, minuten: b.minuten, nood: b.nood }, deps.meld))],
    'POST /api/ondersteuning/mijn-aanvragen': [gate({}, async (b, a) => ({ aanvragen: await o.mijnAanvragen(a.user, tab(b)) }))],
    'POST /api/ondersteuning/overzicht': [gate({}, (b, a) => o.overzicht(a.user, tab(b), String(b.id || '')))],
    // gebruiker
    'POST /api/ondersteuning/voor-mij': [gate({}, async (_b, a) => ({ verzoeken: await o.voorMij(a.user) }))],
    'POST /api/ondersteuning/toestaan': [gate({ stepUp: true }, (b, a) => o.beslissen(a.user, String(b.id || ''), true))],
    'POST /api/ondersteuning/weigeren': [gate({}, (b, a) => o.beslissen(a.user, String(b.id || ''), false))],
    // beide
    'POST /api/ondersteuning/beeindigen': [gate({}, (b, a) => o.beeindigen(a.user, String(b.id || '')))],
  };
}
