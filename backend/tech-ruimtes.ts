// Routes van de technische ruimtes v2 (contract: docs/ontwerp/TECH-RUIMTES-API.md). Alles POST met hubAuthBody; logica in tech-ruimtes-kern.ts.
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import * as tp from './tech-profiel';
import * as k from './tech-ruimtes-kern';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; session?: { id: string; createdAt: number } | null };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
export type TechRuimtesDeps = { stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> };
const bodyOf = (b: unknown) => (b && typeof b === 'object' ? b as Record<string, unknown> : {});
const P = '/api/owner/hub/tech/ruimtes';

const UITLEG: Record<string, { uk: string; nl: string }> = {
  SITE_SESSIE_WEG: { uk: 'Основний акаунт не активний: увійдіть на сайті знову.', nl: 'Het hoofdaccount is niet actief: meld u opnieuw aan op de site.' },
  ACCOUNT_NIET_ACTIEF: { uk: 'Акаунт не активний.', nl: 'Het account is niet actief.' },
  BINDING_ONGELDIG: { uk: 'Технічний простір не належить цьому входу. Почніть його заново.', nl: 'De technische ruimte hoort niet bij deze aanmelding. Start haar opnieuw.' },
};
const STANDAARD_UITLEG = { uk: 'Технічний простір зараз недоступний.', nl: 'De technische ruimte is nu niet beschikbaar.' };
/** Weigering in het gedeelde formaat { error, uitleg:{uk,nl} }: 401 als het account niet actief is, anders 403. */
export const weigering = (code: string): Resp => {
  const r = json({ error: code, uitleg: UITLEG[code] ?? STANDAARD_UITLEG }, code === 'ACCOUNT_NIET_ACTIEF' ? 401 : 403);
  return r;
};

export function techRuimtesRoutes(requireSession: RequireSession, deps: TechRuimtesDeps = {}): Record<string, RouterMiddleware[]> {
  const gate = (opts: { stepUp?: boolean; schrijven?: boolean }, run: (b: Record<string, unknown>, auth: SessionOk, tab: string) => Promise<Resp>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved' && !tp.isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    const b = bodyOf(ctx.body);
    const tab = String(b.tabContext || '');
    if (!tp.TAB_RE.test(tab)) return error('TAB_ONGELDIG', 400);
    if (opts.schrijven && !(await k.v2Aan(auth.user.id))) return error('TECH_RUIMTES_V2_UIT', 409);
    if (opts.stepUp) {
      if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403);
      const su = await deps.stepUp(ctx, auth);
      if (su) return su;
    }
    try { return await run(b, auth, tab); }
    catch (err) { if (err instanceof tp.TechFout) return error(err.code, err.status); throw err; }
  }) as RouterMiddleware;
  const sessie = (a: SessionOk) => a.session?.id ? { id: String(a.session.id), createdAt: Number(a.session.createdAt) || 0 } : null;
  const st = async (a: SessionOk, tab: string) => json(await k.status(a.user, sessie(a), tab));

  return {
    [`POST ${P}/status`]: [gate({}, async (_b, a, tab) => st(a, tab))],
    [`POST ${P}/starten`]: [gate({ schrijven: true, stepUp: true }, async (b, a, tab) => { await k.starten(a.user, sessie(a), tab, b.modus, b.minuten, b.reden); return st(a, tab); })],
    [`POST ${P}/wisselen`]: [gate({ schrijven: true }, async (b, a, tab) => { await k.wisselen(a.user, sessie(a), tab, b.naar); return st(a, tab); })],
    [`POST ${P}/verlengen`]: [gate({ schrijven: true, stepUp: true }, async (b, a, tab) => { await k.verlengen(a.user, sessie(a), b.minuten, b.soort); return st(a, tab); })],
    [`POST ${P}/beeindigen`]: [gate({ schrijven: true }, async (_b, a, tab) => { await k.beeindigen(a.user, sessie(a)); return st(a, tab); })],
    // Ruimtes-scheiding (0123): directe link/bladwijzer naar een technische pagina of API. 401 zonder sessie (gate),
    // 403 met code + tweetalige uitleg als de technische ruimte voor DEZE aanmelding niet geldt, 200 als ze geldt.
    [`POST ${P}/controle`]: [gate({}, async (_b, a) => {
      const s = sessie(a);
      if (!s) return weigering('SITE_SESSIE_WEG');
      const b = await k.besluit(a.user.id, { bron: 'site', sessieId: s.id });
      return b.toegestaan && b.ruimte === 'technisch' ? json({ ruimte: 'technisch', eindTijd: b.eind ? new Date(b.eind).toISOString() : null }) : weigering(b.code);
    })],
    [`POST ${P}/toegang`]: [gate({}, async (_b, a, tab) => json(await k.toegang(a.user, sessie(a), tab)))],
    [`POST ${P}/ai-zetten`]: [gate({ schrijven: true, stepUp: true }, async (b, a, tab) => { await k.aiZetten(a.user, sessie(a), b); return json(await k.toegang(a.user, sessie(a), tab)); })],
  };
}
