// KLIMOP-014 / KLIMOP-015 / KLIMOP-016 (21.11.2026, Етапи 13–15 впровадження «Плюща» у платформу «Мій простір»):
// Клієнт маршрутів /api/owner/klimop/* для вебпанелі «Координація» на mcp.*/agenten та admin.* (src/agenten/KlimopPaneel.tsx).

import { api } from '../platform/client';
import { foutCode } from '../platform/webauthn';
import type { KlimopDienstId } from '../../shared/klimop/diensten';
import {
  KLIMOP_PADEN,
  klimopCodeTekst,
  type KlimopArchitectuurToetsInvoer,
  type KlimopArchitectuurToetsUitkomst,
  type KlimopDubbelLogboekOverzicht,
  type KlimopDubbelSchrijvenUitkomst,
  type KlimopGesimuleerdeAfwijking,
  type KlimopGesimuleerdeDubbelSchrijfFout,
  type KlimopOverdrachtSchakelaarUitkomst,
  type KlimopPassieveSpiegelUitkomst,
  type KlimopPlatformOverzicht,
  type KlimopSchakelaarActie,
  type KlimopSpiegelControleUitkomst,
  type KlimopSpiegelLogboekOverzicht,
} from '../../shared/klimop-overzicht-model';

export type KlimopSessieContext = Record<string, unknown>;

export const klimopOverzichtOphalen = async (
  ctx: KlimopSessieContext,
): Promise<KlimopPlatformOverzicht> =>
  (await api.post(KLIMOP_PADEN.overzicht, ctx)).data as KlimopPlatformOverzicht;

export const klimopSpiegelControleren = async (
  ctx: KlimopSessieContext,
  dienstId: KlimopDienstId,
): Promise<KlimopSpiegelControleUitkomst> =>
  (await api.post(KLIMOP_PADEN.spiegelControle, { ...ctx, dienstId })).data as KlimopSpiegelControleUitkomst;

export const klimopArchitectuurToetsen = async (
  ctx: KlimopSessieContext,
  invoer: KlimopArchitectuurToetsInvoer,
): Promise<KlimopArchitectuurToetsUitkomst> =>
  (await api.post(KLIMOP_PADEN.architectuurToets, { ...ctx, ...invoer })).data as KlimopArchitectuurToetsUitkomst;

export const klimopPassieveSpiegelUitvoeren = async (
  ctx: KlimopSessieContext,
  invoer: {
    dienstId: KlimopDienstId;
    steekproefGrootte?: number;
    simuleerAfwijking?: KlimopGesimuleerdeAfwijking;
  },
): Promise<KlimopPassieveSpiegelUitkomst> =>
  (await api.post(KLIMOP_PADEN.passieveSpiegel, { ...ctx, ...invoer })).data as KlimopPassieveSpiegelUitkomst;

export const klimopSpiegelLogboekOphalen = async (
  ctx: KlimopSessieContext,
  invoer?: { dienstId?: KlimopDienstId; limiet?: number },
): Promise<KlimopSpiegelLogboekOverzicht> =>
  (await api.post(KLIMOP_PADEN.spiegelLogboek, { ...ctx, ...(invoer ?? {}) })).data as KlimopSpiegelLogboekOverzicht;

export const klimopDubbelSchrijvenUitvoeren = async (
  ctx: KlimopSessieContext,
  invoer: {
    dienstId: KlimopDienstId;
    operatiesAantal?: number;
    simuleerFout?: KlimopGesimuleerdeDubbelSchrijfFout;
  },
): Promise<KlimopDubbelSchrijvenUitkomst> =>
  (await api.post(KLIMOP_PADEN.dubbelSchrijven, { ...ctx, ...invoer })).data as KlimopDubbelSchrijvenUitkomst;

export const klimopDubbelLogboekOphalen = async (
  ctx: KlimopSessieContext,
  invoer?: { dienstId?: KlimopDienstId; limiet?: number },
): Promise<KlimopDubbelLogboekOverzicht> =>
  (await api.post(KLIMOP_PADEN.dubbelLogboek, { ...ctx, ...(invoer ?? {}) })).data as KlimopDubbelLogboekOverzicht;

export const klimopOverdrachtSchakelen = async (
  ctx: KlimopSessieContext,
  invoer: { actie: KlimopSchakelaarActie; dienstId?: KlimopDienstId },
): Promise<KlimopOverdrachtSchakelaarUitkomst> =>
  (await api.post(KLIMOP_PADEN.overdrachtSchakelaar, { ...ctx, ...invoer })).data as KlimopOverdrachtSchakelaarUitkomst;

export function klimopFoutTekst(e: unknown, lang: 'uk' | 'nl'): string {
  const code = foutCode(e);
  const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return [klimopCodeTekst(lang, code), detail ?? ''].filter(Boolean).join(' · ');
}
