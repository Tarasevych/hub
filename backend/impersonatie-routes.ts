// Routes van «Подивитися як користувач» (backend/impersonatie.ts). Beheerder: alleen in een actief technisch profiel met
// 'impersonatie.aanvragen'; gebruiker: eigen sessie, «Дозволити» met een verse sterke bevestiging (passkey/TOTP/herstelcode).
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import * as im from './impersonatie';
import { isEigenaar, TechFout } from './tech-profiel';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string; session?: { id: string; createdAt: number } | null; tabSession?: { id: string; createdAt: number } | null };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;

export function impersonatieRoutes(requireSession: RequireSession, deps: { stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null>; meld: im.Melder }): Record<string, RouterMiddleware[]> {
  const gate = (opts: { stepUp?: boolean; ruw?: boolean }, run: (b: Record<string, unknown>, auth: SessionOk) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, /^(IMPERSONATIE_|AGENT_NIET)/.test(auth.errorCode) ? 403 : 401);
    if (auth.user.status !== 'approved' && !isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    if (opts.stepUp) { if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403); const su = await deps.stepUp(ctx, auth); if (su) return su; }
    const b = ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {};
    try {
      const uitkomst = await run(b, auth);
      if (opts.ruw) { const r = uitkomst as { status: number; data: unknown }; return json(r.data, r.status); }
      return json(uitkomst);
    } catch (e) { if (e instanceof TechFout) return error(e.code, e.status); throw e; }
  }) as RouterMiddleware;
  const tab = (b: Record<string, unknown>) => String(b.tabContext || '');
  const id = (b: Record<string, unknown>) => String(b.id || '');
  return {
    // beheerder (technisch profiel)
    'POST /api/impersonatie/aanvragen': [gate({ stepUp: true }, (b, a) => im.aanvragen(a.user, tab(b), { email: b.email, reden: b.reden, minuten: b.minuten }, deps.meld))],
    'POST /api/impersonatie/mijn-aanvragen': [gate({}, async (b, a) => ({ aanvragen: await im.mijnAanvragen(a.user, tab(b)) }))],
    'POST /api/impersonatie/band': [gate({}, (b, a) => im.band(a.user, tab(b), id(b)))],
    'POST /api/impersonatie/aanroep': [gate({ ruw: true }, (b, a) => im.aanroep(a.user, tab(b), { id: b.id, route: b.route, body: b.body, service: b.service }))],
    // gebruiker
    'POST /api/impersonatie/voor-mij': [gate({}, (_b, a) => im.voorMij(a.user))],
    'POST /api/impersonatie/toestaan': [gate({}, (b, a) => im.toestaan(a as never, id(b), b.metActies === true, deps.meld))],
    'POST /api/impersonatie/weigeren': [gate({}, (b, a) => im.weigeren(a.user, id(b), deps.meld))],
    // beide
    'POST /api/impersonatie/beeindigen': [gate({}, (b, a) => im.beeindigen(a.user, id(b), deps.meld))],
    'POST /api/impersonatie/journaal': [gate({}, (b, a) => im.sessieJournaal(a.user, id(b)))],
  };
}
