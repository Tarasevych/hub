// ORCH-001 етап 3 (31.10.2026) · Маршрути власника для координації агентів: /api/owner/orch/* (mcp.* та admin.*, лише eigenaar).
// Тонкий шар над backend/orch-opslag.ts: сесія → поорт власника → виклик → json/error. Без власної логіки й без бази, крім
// `besluitZoeken` (рядок app.eigenaar_besluiten для «toepassen») — її вводить backend/index.ts (orch-besluit-pg.ts), щоб цей файл і
// тест orch-site-20261031 працювали без pg. Agents komen hier nooit (OWNER_REQUIRED); zij gebruiken de MCP-hulpmiddelen orch_*.
import { error, json } from '../server/platform/antwoord'; // zonder pg (router.ts exporteert dezelfde functies)
import type { RouterMiddleware } from '../server/platform/router';
import { ORCH_LIMIETEN, ORCH_ROUTES } from '../shared/orch-model';
import * as opslag from './orch-opslag';
import { OrchFout, type BesluitVoorToepassen } from './orch-opslag';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Eigenaar = { id: string; email?: string };
export type OrchRouteDeps = {
  requireSession: RequireSession;
  isOwnerEmail: (email: unknown) => boolean;
  /** Het uitgevoerde besluit «orch-regels» van deze eigenaar (staat klaar), of null. */
  besluitZoeken: (e: Eigenaar, besluitId: string) => Promise<BesluitVoorToepassen | null>;
  /** Optioneel: tellen per uur (server/platform/beveiliging rateLimit). Zonder → geen limiet (tests). */
  rateLimit?: (sleutel: string, max: number, seconden: number) => Promise<{ ok: boolean }>;
  /** Optioneel: auditregel (server/platform/audit). */
  audit?: (e: Eigenaar, action: string, result: 'success' | 'denied' | 'failure', details: Record<string, unknown>) => Promise<void>;
};
const lichaam = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
const DIENSTEN = ['mcp', 'admin'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function orchRoutes(deps: OrchRouteDeps): Record<string, RouterMiddleware[]> {
  const audit = (e: Eigenaar, action: string, result: 'success' | 'denied' | 'failure', details: Record<string, unknown>) => (deps.audit ? deps.audit(e, action, result, details).catch(() => undefined) : Promise.resolve());
  const limiet = async (e: Eigenaar, wat: string, max: number) => { if (deps.rateLimit && !(await deps.rateLimit(`orch-${wat}:${e.id}`, max, 3600)).ok) throw new OrchFout('RATE_LIMITED', 429); };
  const eigenaar = (run: (ctx: Ctx, e: Eigenaar) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!(DIENSTEN as readonly string[]).includes(auth.service)) return error('ADMIN_SERVICE_REQUIRED', 403);
    if (!(auth.user.role === 'owner' && deps.isOwnerEmail(auth.user.email))) return error('OWNER_REQUIRED', 403);
    try { return json(await run(ctx, { id: auth.user.id, email: auth.user.email })); }
    catch (err) {
      if (err instanceof OrchFout) return json({ error: err.code, code: err.code, zaken: err.zaken, detail: err.detail }, err.status);
      console.error('[orch]', (err as Error).message);
      return error('ORCH_FOUT', 500);
    }
  }) as RouterMiddleware;
  const door = (e: Eigenaar) => e.email || e.id;
  return {
    [`POST ${ORCH_ROUTES.overzicht}`]: [eigenaar(async () => opslag.overzicht())],
    [`POST ${ORCH_ROUTES.context}`]: [eigenaar(async () => opslag.context())],
    [`POST ${ORCH_ROUTES.taakStart}`]: [eigenaar(async (ctx, e) => { await limiet(e, 'taak', 60); const r = opslag.taakStart(lichaam(ctx.body), door(e)); await audit(e, 'orch_taak_gestart', 'success', { taak: r.taak.id, agent: r.taak.agent }); return r; })],
    [`POST ${ORCH_ROUTES.inleveringBegin}`]: [eigenaar(async (ctx, e) => { await limiet(e, 'upload', ORCH_LIMIETEN.uploadsPerUur); const u = opslag.uploadBegin(lichaam(ctx.body), door(e), 'web_upload'); await audit(e, 'orch_inlevering_begonnen', 'success', { upload: u.id, naam: u.naam, grootte: u.grootte, taak: u.taakId }); return u; })],
    [`POST ${ORCH_ROUTES.inleveringStuk}`]: [eigenaar(async (ctx) => opslag.uploadStuk(lichaam(ctx.body)))],
    [`POST ${ORCH_ROUTES.inleveringKlaar}`]: [eigenaar(async (ctx, e) => { const r = opslag.uploadKlaar(lichaam(ctx.body)); await audit(e, 'orch_inlevering', r.record.uitkomst === 'aanvaard' ? 'success' : 'denied', { upload: r.upload.id, record: r.record.id, taak: r.record.taakId, uitkomst: r.record.uitkomst }); return r; })],
    [`POST ${ORCH_ROUTES.inleveringAnnuleren}`]: [eigenaar(async (ctx) => opslag.uploadAnnuleren(lichaam(ctx.body)))],
    [`POST ${ORCH_ROUTES.regelsOverzicht}`]: [eigenaar(async () => opslag.regelsOverzicht())],
    [`POST ${ORCH_ROUTES.regelsVoorstel}`]: [eigenaar(async (ctx, e) => { await limiet(e, 'voorstel', ORCH_LIMIETEN.voorstellenPerUur); const r = opslag.voorstelMaken(lichaam(ctx.body), door(e)); await audit(e, 'orch_regels_voorstel', 'success', { voorstel: r.voorstel.id, regelsVersie: r.voorstel.regelsVersie, hash: r.voorstel.hash.slice(0, 16), kritiekGewijzigd: r.voorstel.kritiekGewijzigd }); return r; })],
    [`POST ${ORCH_ROUTES.regelsIntrekken}`]: [eigenaar(async (ctx) => opslag.voorstelIntrekken(lichaam(ctx.body).id))],
    [`POST ${ORCH_ROUTES.regelsToepassen}`]: [eigenaar(async (ctx, e) => {
      const b = lichaam(ctx.body);
      const besluitId = String(b.besluit || '');
      if (!UUID.test(besluitId)) throw new OrchFout('GEEN_BESLUIT', 409);
      const besluit = await deps.besluitZoeken(e, besluitId);
      if (!besluit) throw new OrchFout('GEEN_BESLUIT', 409);
      try {
        const r = opslag.voorstelToepassen(b.id, besluit);
        await audit(e, 'orch_regels_toegepast', 'success', { voorstel: r.voorstel.id, regelsVersie: r.voorstel.regelsVersie, tak: r.tak, commit: r.commit, gepusht: r.gepusht, besluit: besluitId, passkey: besluit.passkey });
        return r;
      } catch (err) {
        if (err instanceof OrchFout) await audit(e, 'orch_regels_toepassen_geweigerd', 'denied', { voorstel: String(b.id || ''), code: err.code, besluit: besluitId });
        throw err;
      }
    })],
  };
}
