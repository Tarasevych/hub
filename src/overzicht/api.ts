import { api } from '../platform/client';
import type { Indeling } from '../../shared/overzicht-widgets';
import type { Context, GebruikerHistorie, MomentPunt, Overzicht } from './types';

export const haalOverzicht = async (ctx: Context) => (await api.post('/api/owner/admin/overview', ctx)).data as Overzicht;
export const haalGebruiker = async (ctx: Context, userId: string) => (await api.post('/api/owner/admin/overview/user', { ...ctx, userId })).data as GebruikerHistorie;
export const haalIndeling = async (ctx: Context) => (await api.post('/api/owner/admin/overview/layout', ctx)).data as { indeling: Indeling; aangepast: boolean };
export const bewaarIndeling = async (ctx: Context, indeling: Indeling) => (await api.post('/api/owner/admin/overview/layout/save', { ...ctx, indeling })).data as { indeling: Indeling; aangepast: boolean };
export const wisIndeling = async (ctx: Context) => (await api.post('/api/owner/admin/overview/layout/reset', ctx)).data as { indeling: Indeling; aangepast: boolean };
export const haalMomenten = async (ctx: Context) => (await api.post('/api/owner/admin/overview/snapshots', ctx)).data as { uur: MomentPunt[]; dag: MomentPunt[]; bewaardDagen: number; toegangLive?: { ditUur: Record<string, { n404: number; n401: number; n403: number }>; laatste24: Record<string, { n404: number; n401: number; n403: number }>; sindsStart: string } };
