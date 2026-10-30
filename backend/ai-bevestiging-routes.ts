// Routes van «Запити ШІ на підтвердження» (backend/ai-bevestiging.ts). Alleen de MENS zelf, in een eigen sessie:
//   • nooit een agent (gedelegeerde sessie van backend/site-aanroep.ts) en nooit een beheerder die «як користувач» meekijkt
//     (impersonatie, 0068) — die krijgen AGENT_NIET_TOEGESTAAN / IMPERSONATIE_NIET_TOEGESTAAN, ook als een andere poort ooit mist;
//   • de RUIMTE komt uit het tabblad (tabContext) en de live berekening van de server (gegevensRuimteVeilig), nooit uit de body;
//   • hoog/kritiek risico: verse sterke step-up (passkey/app-code/herstelcode) van deze sessie, daarna verbruikt. Het venster
//     «Підтвердіть доступ» opent src/platform/client.ts bij 403 STEP_UP_STRONG_REQUIRED en herhaalt het verzoek één keer.
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { huidigeContext } from '../server/platform/context';
import { gegevensRuimteVeilig } from './ruimte-scheiding';
import { gedelegeerdeSessie } from './site-aanroep';
import { sterkeStapOpGeldig, stapOpMethode, stapOpVerbruiken, type StapOpAuth } from './stap-op';
import * as ab from './ai-bevestiging';
import { stapOpNodig, type BevestigRuimte } from '../shared/ai-bevestiging';
import { kritiekeActie } from '../shared/kritieke-acties';

type SessionOk = StapOpAuth & { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
export type AiBevestigingRouteDeps = { requireSession: RequireSession; sterkeStapOp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> };

const lichaam = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {});
type Vooraf = { auth: SessionOk; b: Record<string, unknown>; ruimte: BevestigRuimte; ctx: Ctx };

export function aiBevestigingRoutes(deps: AiBevestigingRouteDeps): Record<string, RouterMiddleware[]> {
  /** Wie, en in welke ruimte. Een Resp = weigering. */
  const vooraf = async (raw: unknown): Promise<Vooraf | Resp> => {
    const ctx = raw as Ctx;
    if (gedelegeerdeSessie(ctx.event)) return error('AGENT_NIET_TOEGESTAAN', 403);
    if (huidigeContext()?.impersonatie) return error('IMPERSONATIE_NIET_TOEGESTAAN', 403);
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status && auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    const b = lichaam(ctx.body);
    const ruimte = await gegevensRuimteVeilig(auth.user.id, { tabContext: typeof b.tabContext === 'string' ? b.tabContext : '' });
    return { auth, b, ruimte, ctx };
  };
  const isResp = (v: Vooraf | Resp): v is Resp => !('auth' in v);
  const metFouten = async (run: () => Promise<unknown>): Promise<Resp> => {
    try { return json(await run() as Record<string, unknown>); }
    catch (e) {
      if (e instanceof ab.BevestigFout) return json({ error: e.code, reasonCode: e.code, uitleg: ab.bevestigFoutTekst(e.code) }, e.status);
      console.error('[ai-bevestiging]', (e as Error).message);
      return error('BEVESTIGING_UITVOEREN_MISLUKT', 500);
    }
  };

  return {
    'POST /api/owner/ai-bevestiging/lijst': [(async (raw) => {
      const v = await vooraf(raw);
      if (isResp(v)) return v;
      return metFouten(async () => ({
        ruimte: v.ruimte,
        items: await ab.lijstVoorMens(v.auth.user.id, v.ruimte, { agent: typeof v.b.agent === 'string' ? v.b.agent : '', ookAfgerond: v.b.ookAfgerond === true }),
        open: await ab.aantalOpen(v.auth.user.id, v.ruimte),
      }));
    }) as RouterMiddleware],
    'POST /api/owner/ai-bevestiging/bevestigen': [(async (raw) => {
      const v = await vooraf(raw);
      if (isResp(v)) return v;
      const id = String(v.b.id || '');
      // Eerst weten of DIT verzoek een sterke bevestiging vraagt (de server rekent het risico straks opnieuw na).
      const item = (await ab.lijstVoorMens(v.auth.user.id, v.ruimte, { ookAfgerond: true }).catch(() => [])).find((x) => x.id === id);
      let stapOp = false, methode = '';
      if (item && item.status === 'wacht' && stapOpNodig(item.risico) && kritiekeActie('ai-hoog')) {
        if (!deps.sterkeStapOp) return error('STEP_UP_STRONG_REQUIRED', 403);
        const su = await deps.sterkeStapOp(v.ctx, v.auth);
        if (su) return su;
        stapOp = await sterkeStapOpGeldig(v.auth);
        methode = stapOp ? await stapOpMethode(v.auth) : '';
      }
      const tabContext = typeof v.b.tabContext === 'string' ? v.b.tabContext : '';
      return metFouten(async () => {
        const uit = await ab.bevestig({ userId: v.auth.user.id, id, ruimte: v.ruimte, hash: String(v.b.hash || ''), stapOp, keuze: lichaam(v.b.keuze), bevestiger: { tabContext, ...(methode ? { stapOpMethode: methode } : {}) } });
        if (stapOp) await stapOpVerbruiken(v.auth);
        return { item: uit };
      });
    }) as RouterMiddleware],
    'POST /api/owner/ai-bevestiging/weigeren': [(async (raw) => {
      const v = await vooraf(raw);
      if (isResp(v)) return v;
      return metFouten(async () => ({ item: await ab.weiger({ userId: v.auth.user.id, id: String(v.b.id || ''), ruimte: v.ruimte }) }));
    }) as RouterMiddleware],
  };
}
