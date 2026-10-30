// Uitgifte van een SSH-certificaat (backend/ssh-ca.ts). Verse bevestiging van de aanmelding (stap-op).
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { uitgevenVoor } from './ssh-ca';
import { activatieVoor, beheer, intrekken, lijst, stand, standaardBeheerIo, standaardPasskey, uitdaging } from './ssh-ca-beheer';
import { isEigenaar, TechFout } from './tech-profiel';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;

export function sshCaRoutes(requireSession: RequireSession, deps: { stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> }): Record<string, RouterMiddleware[]> {
  const gate = (opts: { stepUp?: boolean }, run: (b: Record<string, unknown>, auth: SessionOk) => Promise<unknown> | unknown) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    // Agent (AGENT_NIET_TOEGESTAAN) of verboden: 403, anders niet aangemeld: 401.
    if ('errorCode' in auth) return error(auth.errorCode, /NIET_TOEGESTAAN|FORBIDDEN|IMPERSONATIE/.test(auth.errorCode) ? 403 : 401);
    if (auth.user.status !== 'approved' && !isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    if (opts.stepUp) { if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403); const su = await deps.stepUp(ctx, auth); if (su) return su; }
    const b = ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {};
    try { return json(await run(b, auth)); } catch (e) { if (e instanceof TechFout) return error(e.code, e.status); throw e; }
  }) as RouterMiddleware;
  return {
    'POST /api/ssh-ca/uitgifte': [gate({ stepUp: true }, (b, a) => uitgevenVoor(a.user, String(b.tabContext || ''), b.publiek, b.minuten))],
    // Beheer (18.10.2026): elke route eigenaar + ssh.host in dit tabblad (backend/ssh-ca-beheer.ts poort) + stap-op.
    'POST /api/ssh-ca/stand': [gate({ stepUp: false }, async (b, a) => stand(a.user, await activatieVoor(a.user, String(b.tabContext || '')), standaardBeheerIo(), b.vernieuwen === true))],
    'POST /api/ssh-ca/lijst': [gate({ stepUp: false }, async (b, a) => lijst(a.user, await activatieVoor(a.user, String(b.tabContext || ''))))],
    'POST /api/ssh-ca/beheer/uitdaging': [gate({ stepUp: true }, async (b, a) => uitdaging(a.user, await activatieVoor(a.user, String(b.tabContext || '')), b.actie, await standaardPasskey()))],
    'POST /api/ssh-ca/beheer': [gate({ stepUp: true }, async (b, a) => beheer(a.user, await activatieVoor(a.user, String(b.tabContext || '')), b, standaardBeheerIo(), await standaardPasskey()))],
    'POST /api/ssh-ca/intrekken': [gate({ stepUp: true }, async (b, a) => intrekken(a.user, await activatieVoor(a.user, String(b.tabContext || '')), b, standaardBeheerIo()))],
  };
}
