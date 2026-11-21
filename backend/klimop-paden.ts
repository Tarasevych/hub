// KLIMOP-014 / KLIMOP-015 / KLIMOP-016 / KLIMOP-017 (21.11.2026, Етапи 13–16 впровадження «Плюща» у платформу «Мій простір»):
// Захищені маршрути власника /api/owner/klimop/* (лише служби mcp.* та admin.*, роль owner + OWNER_EMAIL).
// Тонкий шлюз над backend/klimop-platform-brug.ts та backend/klimop-overdracht-opslag.ts без прямої залежності від бази даних.

import { error, json } from '../server/platform/antwoord';
import type { RouterMiddleware } from '../server/platform/router';
import { KLIMOP_PADEN } from '../shared/klimop-overzicht-model';
import type { KlimopDienstId } from '../shared/klimop/diensten';
import {
  KlimopFout,
  klimopArchitectuurToets,
  klimopOverzichtA,
  klimopSpiegelControle,
} from './klimop-platform-brug';
import {
  leesKlimopDubbelSchrijvenLogboek,
  leesKlimopQuorumAttestLogboek,
  leesKlimopSpiegelLogboek,
  schakelKlimopDienstOverdracht,
  voerGecontroleerdeDubbelSchrijfProefUit,
  voerPassieveSpiegelLeesProefUit,
  voerStap4QuorumAttestProefUit,
} from './klimop-overdracht-opslag';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Eigenaar = { id: string; email?: string };

export type KlimopPadenDeps = {
  requireSession: RequireSession;
  isOwnerEmail: (email: unknown) => boolean;
  rateLimit?: (sleutel: string, max: number, seconden: number) => Promise<{ ok: boolean }>;
  audit?: (
    e: Eigenaar,
    action: string,
    result: 'success' | 'denied' | 'failure',
    details: Record<string, unknown>,
  ) => Promise<void>;
  staatMap?: string;
};

const DIENSTEN = ['mcp', 'admin'] as const;
const LEZEN_PER_MINUUT = 120;
const CONTROLES_PER_MINUUT = 60;
const SCHAKEL_PER_MINUUT = 30;

export function klimopPaden(deps: KlimopPadenDeps): Record<string, RouterMiddleware[]> {
  const audit = (
    e: Eigenaar,
    action: string,
    result: 'success' | 'denied' | 'failure',
    details: Record<string, unknown>,
  ) => (deps.audit ? deps.audit(e, action, result, details).catch(() => undefined) : Promise.resolve());

  const limiet = async (e: Eigenaar, wat: string, max: number) => {
    if (deps.rateLimit && !(await deps.rateLimit(`klimop-${wat}:${e.id}`, max, 60)).ok) {
      throw new KlimopFout('RATE_LIMITED', 429);
    }
  };

  const eigenaar = (run: (ctx: Ctx, e: Eigenaar) => Promise<unknown>) =>
    (async (raw) => {
      const ctx = raw as unknown as Ctx;
      const auth = await deps.requireSession(ctx.event, ctx.body);
      if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
      if (!(DIENSTEN as readonly string[]).includes(auth.service)) return error('ADMIN_SERVICE_REQUIRED', 403);
      if (!(auth.user.role === 'owner' && deps.isOwnerEmail(auth.user.email))) return error('OWNER_REQUIRED', 403);
      try {
        return json(await run(ctx, { id: auth.user.id, email: auth.user.email }));
      } catch (err) {
        if (err instanceof KlimopFout) {
          return json({ error: err.code, code: err.code, detail: err.detail }, err.status);
        }
        console.error('[klimop]', (err as Error).message);
        return error('KLIMOP_FOUT', 500);
      }
    }) as RouterMiddleware;

  return {
    [`POST ${KLIMOP_PADEN.overzicht}`]: [
      eigenaar(async (_ctx, e) => {
        await limiet(e, 'lezen', LEZEN_PER_MINUUT);
        return klimopOverzichtA(undefined, deps.staatMap);
      }),
    ],
    [`POST ${KLIMOP_PADEN.architectuurToets}`]: [
      eigenaar(async (ctx, e) => {
        await limiet(e, 'toets', CONTROLES_PER_MINUUT);
        const r = klimopArchitectuurToets(ctx.body);
        await audit(e, 'klimop_architectuur_toets', r.goedgekeurd ? 'success' : 'denied', {
          naam: r.naam,
          fase: r.fase,
          goedgekeurd: r.goedgekeurd,
          foutenAantal: r.fouten.length,
        });
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.spiegelControle}`]: [
      eigenaar(async (ctx, e) => {
        await limiet(e, 'spiegel', CONTROLES_PER_MINUUT);
        const r = klimopSpiegelControle(ctx.body);
        await audit(e, 'klimop_spiegel_controle', r.ok ? 'success' : 'failure', {
          dienstId: r.dienstId,
          ok: r.ok,
          afwijkingen: r.pariteit.afwijkingen,
        });
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.passieveSpiegel}`]: [
      eigenaar(async (ctx, e) => {
        await limiet(e, 'passief', CONTROLES_PER_MINUUT);
        const r = voerPassieveSpiegelLeesProefUit(ctx.body, { staatMap: deps.staatMap });
        await audit(e, 'klimop_passieve_spiegel', r.ok ? 'success' : 'failure', {
          dienstId: r.dienstId,
          ok: r.ok,
          steekproefGrootte: r.steekproefGrootte,
          afwijkingen: r.pariteit.afwijkingen,
          automatischTeruggezet: r.automatischTeruggezetNaarErfenis,
        });
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.spiegelLogboek}`]: [
      eigenaar(async (ctx, e) => {
        await limiet(e, 'lezen', LEZEN_PER_MINUUT);
        const b = ctx.body && typeof ctx.body === 'object' && !Array.isArray(ctx.body)
          ? (ctx.body as Record<string, unknown>)
          : {};
        return leesKlimopSpiegelLogboek({
          staatMap: deps.staatMap,
          limiet: typeof b.limiet === 'number' ? b.limiet : undefined,
          dienstId: typeof b.dienstId === 'string' && b.dienstId ? (b.dienstId as KlimopDienstId) : undefined,
        });
      }),
    ],
    [`POST ${KLIMOP_PADEN.dubbelSchrijven}`]: [
      eigenaar(async (ctx, e) => {
        await limiet(e, 'dubbel', CONTROLES_PER_MINUUT);
        const r = voerGecontroleerdeDubbelSchrijfProefUit(ctx.body, { staatMap: deps.staatMap });
        await audit(e, 'klimop_dubbel_schrijven', r.ok ? 'success' : 'failure', {
          dienstId: r.dienstId,
          ok: r.ok,
          operatiesAantal: r.operaties.totaal,
          afwijkingen: r.pariteit.afwijkingen,
          automatischTeruggezet: r.automatischTeruggezetNaarErfenis,
        });
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.dubbelLogboek}`]: [
      eigenaar(async (ctx, e) => {
        await limiet(e, 'lezen', LEZEN_PER_MINUUT);
        const b = ctx.body && typeof ctx.body === 'object' && !Array.isArray(ctx.body)
          ? (ctx.body as Record<string, unknown>)
          : {};
        return leesKlimopDubbelSchrijvenLogboek({
          staatMap: deps.staatMap,
          limiet: typeof b.limiet === 'number' ? b.limiet : undefined,
          dienstId: typeof b.dienstId === 'string' && b.dienstId ? (b.dienstId as KlimopDienstId) : undefined,
        });
      }),
    ],
    [`POST ${KLIMOP_PADEN.quorumAttest}`]: [
      eigenaar(async (ctx, e) => {
        await limiet(e, 'attest', CONTROLES_PER_MINUUT);
        const r = voerStap4QuorumAttestProefUit(ctx.body, { staatMap: deps.staatMap });
        await audit(e, 'klimop_quorum_attest', r.ok ? 'success' : 'failure', {
          dienstId: r.dienstId,
          ok: r.ok,
          frostOk: r.drempelZegel.frostVerificatieOk,
          hybrideOk: r.drempelZegel.hybrideVerificatieOk,
          automatischTeruggezet: r.automatischTeruggezetNaarErfenis,
        });
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.quorumLogboek}`]: [
      eigenaar(async (ctx, e) => {
        await limiet(e, 'lezen', LEZEN_PER_MINUUT);
        const b = ctx.body && typeof ctx.body === 'object' && !Array.isArray(ctx.body)
          ? (ctx.body as Record<string, unknown>)
          : {};
        return leesKlimopQuorumAttestLogboek({
          staatMap: deps.staatMap,
          limiet: typeof b.limiet === 'number' ? b.limiet : undefined,
          dienstId: typeof b.dienstId === 'string' && b.dienstId ? (b.dienstId as KlimopDienstId) : undefined,
        });
      }),
    ],
    [`POST ${KLIMOP_PADEN.overdrachtSchakelaar}`]: [
      eigenaar(async (ctx, e) => {
        await limiet(e, 'schakel', SCHAKEL_PER_MINUUT);
        const r = schakelKlimopDienstOverdracht(ctx.body, { staatMap: deps.staatMap });
        await audit(e, 'klimop_overdracht_schakelaar', 'success', {
          actie: r.actie,
          dienstId: r.dienstId,
          omgeschakeldeDienstenAantal: r.omgeschakeldeDienstenAantal,
          actievePassiefLezenDiensten: r.actievePassiefLezenDiensten,
          actieveDubbelSchrijvenDiensten: r.actieveDubbelSchrijvenDiensten,
          actieveQuorumGereedDiensten: r.actieveQuorumGereedDiensten,
        });
        return r;
      }),
    ],
  };
}
