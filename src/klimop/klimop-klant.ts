// KLIMOP-014 (21.11.2026, Етап 13 впровадження «Плюща» у платформу «Мій простір»):
// Клієнт маршрутів /api/owner/klimop/* для вебпанелі «Координація» на mcp.*/agenten та admin.* (src/agenten/KlimopPaneel.tsx).

import { api } from '../platform/client';
import { foutCode } from '../platform/webauthn';
import type { KlimopDienstId } from '../../shared/klimop/diensten';
import {
  KLIMOP_PADEN,
  klimopCodeTekst,
  type KlimopArchitectuurToetsInvoer,
  type KlimopArchitectuurToetsUitkomst,
  type KlimopPlatformOverzicht,
  type KlimopSpiegelControleUitkomst,
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

export function klimopFoutTekst(e: unknown, lang: 'uk' | 'nl'): string {
  const code = foutCode(e);
  const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return [klimopCodeTekst(lang, code), detail ?? ''].filter(Boolean).join(' · ');
}
