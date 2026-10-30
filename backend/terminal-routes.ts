// Routes van de terminals (backend/terminal.ts). Openen met verse bevestiging van de aanmelding (stap-op).
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import * as term from './terminal';
import * as opdr from './terminal-opdrachten';
import { isEigenaar, TechFout } from './tech-profiel';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;

export function terminalRoutes(requireSession: RequireSession, deps: { stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> }): Record<string, RouterMiddleware[]> {
  const gate = (opts: { stepUp?: boolean }, run: (b: Record<string, unknown>, auth: SessionOk) => Promise<unknown> | unknown) => (async (raw) => {
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
    'POST /api/terminal/apparaten': [gate({}, async (b, a) => ({ apparaten: await term.apparaten(a.user, tab(b)), maxMinuten: term.MAX_MINUTEN }))],
    'POST /api/terminal/openen': [gate({ stepUp: true }, (b, a) => term.openen(a.user, tab(b), { agentId: b.agentId, root: b.root, schrijven: b.schrijven, minuten: b.minuten, reden: b.reden, cols: b.cols, rows: b.rows }))],
    'POST /api/terminal/sluiten': [gate({}, (b, a) => term.sluitEigen(a.user, String(b.sid || '')))],
    'POST /api/terminal/sessies': [gate({}, (b, a) => term.sessiesLijst(a.user, tab(b)))],
    'POST /api/terminal/opname': [gate({}, (b, a) => term.opname(a.user, tab(b), String(b.id || '')))],
    // Opdracht-terminal (zone G 22.10.2026): één programma per regel op de server (beheer) of een Windows-pc (PowerShell), zonder shell.
    // Geen stap-op per regel: de wijzigende opdrachten vragen een bevestiging in de pagina (bevestigd:true) en de activering zelf had stap-op.
    'POST /api/terminal/opdracht': [gate({}, (b, a) => opdr.opdracht(a.user, tab(b), { agentId: b.agentId, regel: b.regel, cwd: b.cwd, bevestigd: b.bevestigd }))],
    'POST /api/terminal/opdracht-stand': [gate({}, (b, a) => opdr.opdrachtStand(a.user, b.id))],
    'POST /api/terminal/opdrachten': [gate({}, (b, a) => opdr.opdrachtenLijst(a.user, tab(b), b.agentId))],
    'POST /api/terminal/instelling': [gate({ stepUp: true }, (b, a) => opdr.instellingZetten(a.user, tab(b), { agentId: b.agentId, bevestiging: b.bevestiging }))],
  };
}
