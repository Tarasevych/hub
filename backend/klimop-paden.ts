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
    service?: string,
  ) => Promise<void>;
  staatMap?: string;
};

const DIENSTEN = ['mcp', 'admin'] as const;
const LEZEN_PER_MINUUT = 120;
const CONTROLES_PER_MINUUT = 60;
const SCHAKEL_PER_MINUUT = 30;

export function klimopPaden(deps: KlimopPadenDeps): Record<string, RouterMiddleware[]> {
  const audit = async (
    e: Eigenaar,
    action: string,
    result: 'success' | 'denied' | 'failure',
    details: Record<string, unknown>,
    service?: string,
  ): Promise<void> => {
    if (!deps.audit) return;
    const dienstNaam = service === 'admin' || service === 'mcp' ? service : 'mcp';
    try {
      await deps.audit(e, action, result, { service: dienstNaam, ...details }, dienstNaam);
    } catch (err) {
      console.error('[klimop-audit]', (err as Error)?.message ?? 'AUDIT_SCHRIJFFOUT');
    }
  };

  const limiet = async (e: Eigenaar, wat: string, max: number, routeActie: string, service: string) => {
    if (deps.rateLimit && !(await deps.rateLimit(`klimop-${wat}:${e.id}`, max, 60)).ok) {
      await audit(e, routeActie, 'denied', { reden: 'RATE_LIMITED', limietGroep: wat }, service);
      throw new KlimopFout('RATE_LIMITED', 429);
    }
  };

  const eigenaar = (routeActie: string, run: (ctx: Ctx, e: Eigenaar, service: string) => Promise<unknown>) =>
    (async (raw) => {
      const ctx = raw as unknown as Ctx;
      const auth = await deps.requireSession(ctx.event, ctx.body);
      if ('errorCode' in auth) {
        const status = auth.errorCode.includes('FORBIDDEN') ? 403 : 401;
        await audit({ id: 'onbekend' }, routeActie, 'denied', { reden: auth.errorCode, status }, 'mcp');
        return error(auth.errorCode, status);
      }
      if (!(DIENSTEN as readonly string[]).includes(auth.service)) {
        await audit(
          { id: auth.user.id, email: auth.user.email },
          routeActie,
          'denied',
          { reden: 'ADMIN_SERVICE_REQUIRED', aangevraagdeDienst: auth.service },
          'mcp',
        );
        return error('ADMIN_SERVICE_REQUIRED', 403);
      }
      if (!(auth.user.role === 'owner' && deps.isOwnerEmail(auth.user.email))) {
        await audit(
          { id: auth.user.id, email: auth.user.email },
          routeActie,
          'denied',
          { reden: 'OWNER_REQUIRED', rol: auth.user.role ?? 'onbekend' },
          auth.service,
        );
        return error('OWNER_REQUIRED', 403);
      }
      const eigenaarGegevens: Eigenaar = { id: auth.user.id, email: auth.user.email };
      try {
        return json(await run(ctx, eigenaarGegevens, auth.service));
      } catch (err) {
        if (err instanceof KlimopFout) {
          if (err.code !== 'RATE_LIMITED') {
            await audit(
              eigenaarGegevens,
              routeActie,
              err.status === 403 || err.status === 409 ? 'denied' : 'failure',
              { reden: err.code, status: err.status },
              auth.service,
            );
          }
          return json({ error: err.code, code: err.code, detail: err.detail }, err.status);
        }
        await audit(eigenaarGegevens, routeActie, 'failure', { reden: 'KLIMOP_FOUT' }, auth.service);
        console.error('[klimop]', (err as Error).message);
        return error('KLIMOP_FOUT', 500);
      }
    }) as RouterMiddleware;

  return {
    [`POST ${KLIMOP_PADEN.overzicht}`]: [
      eigenaar('klimop_overzicht', async (_ctx, e, service) => {
        await limiet(e, 'lezen', LEZEN_PER_MINUUT, 'klimop_overzicht', service);
        const r = await klimopOverzichtA(undefined, deps.staatMap);
        await audit(e, 'klimop_overzicht', 'success', { aanwezig: r.bron.aanwezig }, service);
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.architectuurToets}`]: [
      eigenaar('klimop_architectuur_toets', async (ctx, e, service) => {
        await limiet(e, 'toets', CONTROLES_PER_MINUUT, 'klimop_architectuur_toets', service);
        const r = klimopArchitectuurToets(ctx.body);
        await audit(
          e,
          'klimop_architectuur_toets',
          r.goedgekeurd ? 'success' : 'denied',
          {
            naam: r.naam,
            fase: r.fase,
            goedgekeurd: r.goedgekeurd,
            foutenAantal: r.fouten.length,
          },
          service,
        );
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.spiegelControle}`]: [
      eigenaar('klimop_spiegel_controle', async (ctx, e, service) => {
        await limiet(e, 'spiegel', CONTROLES_PER_MINUUT, 'klimop_spiegel_controle', service);
        const r = klimopSpiegelControle(ctx.body);
        await audit(
          e,
          'klimop_spiegel_controle',
          r.ok ? 'success' : 'failure',
          {
            dienstId: r.dienstId,
            ok: r.ok,
            afwijkingen: r.pariteit.afwijkingen,
          },
          service,
        );
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.passieveSpiegel}`]: [
      eigenaar('klimop_passieve_spiegel', async (ctx, e, service) => {
        await limiet(e, 'passief', CONTROLES_PER_MINUUT, 'klimop_passieve_spiegel', service);
        const r = voerPassieveSpiegelLeesProefUit(ctx.body, { staatMap: deps.staatMap });
        await audit(
          e,
          'klimop_passieve_spiegel',
          r.ok ? 'success' : 'failure',
          {
            dienstId: r.dienstId,
            ok: r.ok,
            operatieId: r.logboekRegel.regelId,
            steekproefGrootte: r.steekproefGrootte,
            afwijkingen: r.pariteit.afwijkingen,
            automatischTeruggezet: r.automatischTeruggezetNaarErfenis,
          },
          service,
        );
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.spiegelLogboek}`]: [
      eigenaar('klimop_spiegel_logboek', async (ctx, e, service) => {
        await limiet(e, 'lezen', LEZEN_PER_MINUUT, 'klimop_spiegel_logboek', service);
        const b = ctx.body && typeof ctx.body === 'object' && !Array.isArray(ctx.body)
          ? (ctx.body as Record<string, unknown>)
          : {};
        const dienstId = typeof b.dienstId === 'string' && b.dienstId ? (b.dienstId as KlimopDienstId) : undefined;
        const r = leesKlimopSpiegelLogboek({
          staatMap: deps.staatMap,
          limiet: typeof b.limiet === 'number' ? b.limiet : undefined,
          dienstId,
        });
        await audit(e, 'klimop_spiegel_logboek', 'success', { dienstId: dienstId ?? 'alle', ketenOk: r.ketenIntegriteit.ok }, service);
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.dubbelSchrijven}`]: [
      eigenaar('klimop_dubbel_schrijven', async (ctx, e, service) => {
        await limiet(e, 'dubbel', CONTROLES_PER_MINUUT, 'klimop_dubbel_schrijven', service);
        const r = voerGecontroleerdeDubbelSchrijfProefUit(ctx.body, { staatMap: deps.staatMap });
        await audit(
          e,
          'klimop_dubbel_schrijven',
          r.ok ? 'success' : 'failure',
          {
            dienstId: r.dienstId,
            ok: r.ok,
            operatieId: r.kwitantieRegel.kwitantieId,
            operatiesAantal: r.operaties.totaal,
            afwijkingen: r.pariteit.afwijkingen,
            automatischTeruggezet: r.automatischTeruggezetNaarErfenis,
          },
          service,
        );
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.dubbelLogboek}`]: [
      eigenaar('klimop_dubbel_logboek', async (ctx, e, service) => {
        await limiet(e, 'lezen', LEZEN_PER_MINUUT, 'klimop_dubbel_logboek', service);
        const b = ctx.body && typeof ctx.body === 'object' && !Array.isArray(ctx.body)
          ? (ctx.body as Record<string, unknown>)
          : {};
        const dienstId = typeof b.dienstId === 'string' && b.dienstId ? (b.dienstId as KlimopDienstId) : undefined;
        const r = leesKlimopDubbelSchrijvenLogboek({
          staatMap: deps.staatMap,
          limiet: typeof b.limiet === 'number' ? b.limiet : undefined,
          dienstId,
        });
        await audit(e, 'klimop_dubbel_logboek', 'success', { dienstId: dienstId ?? 'alle', ketenOk: r.ketenIntegriteit.ok }, service);
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.quorumAttest}`]: [
      eigenaar('klimop_quorum_attest', async (ctx, e, service) => {
        await limiet(e, 'attest', CONTROLES_PER_MINUUT, 'klimop_quorum_attest', service);
        const r = voerStap4QuorumAttestProefUit(ctx.body, { staatMap: deps.staatMap });
        await audit(
          e,
          'klimop_quorum_attest',
          r.ok ? 'success' : 'failure',
          {
            dienstId: r.dienstId,
            ok: r.ok,
            operatieId: r.attestRegel.attestId,
            frostOk: r.drempelZegel.frostVerificatieOk,
            hybrideOk: r.drempelZegel.hybrideVerificatieOk,
            automatischTeruggezet: r.automatischTeruggezetNaarErfenis,
          },
          service,
        );
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.quorumLogboek}`]: [
      eigenaar('klimop_quorum_logboek', async (ctx, e, service) => {
        await limiet(e, 'lezen', LEZEN_PER_MINUUT, 'klimop_quorum_logboek', service);
        const b = ctx.body && typeof ctx.body === 'object' && !Array.isArray(ctx.body)
          ? (ctx.body as Record<string, unknown>)
          : {};
        const dienstId = typeof b.dienstId === 'string' && b.dienstId ? (b.dienstId as KlimopDienstId) : undefined;
        const r = leesKlimopQuorumAttestLogboek({
          staatMap: deps.staatMap,
          limiet: typeof b.limiet === 'number' ? b.limiet : undefined,
          dienstId,
        });
        await audit(e, 'klimop_quorum_logboek', 'success', { dienstId: dienstId ?? 'alle', ketenOk: r.ketenIntegriteit.ok }, service);
        return r;
      }),
    ],
    [`POST ${KLIMOP_PADEN.overdrachtSchakelaar}`]: [
      eigenaar('klimop_overdracht_schakelaar', async (ctx, e, service) => {
        await limiet(e, 'schakel', SCHAKEL_PER_MINUUT, 'klimop_overdracht_schakelaar', service);
        const r = schakelKlimopDienstOverdracht(ctx.body, { staatMap: deps.staatMap });
        await audit(
          e,
          'klimop_overdracht_schakelaar',
          'success',
          {
            actie: r.actie,
            dienstId: r.dienstId,
            operatieId: r.logboekRegel.regelId,
            omgeschakeldeDienstenAantal: r.omgeschakeldeDienstenAantal,
            actievePassiefLezenDiensten: r.actievePassiefLezenDiensten,
            actieveDubbelSchrijvenDiensten: r.actieveDubbelSchrijvenDiensten,
            actieveQuorumGereedDiensten: r.actieveQuorumGereedDiensten,
          },
          service,
        );
        return r;
      }),
    ],
  };
}
