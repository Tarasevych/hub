// CONSOL-001 (Блок Б, З-5): клієнтський помічник для дій керування у Центрі підключень (VerbindingenCentrum).
// Звертається до /api/owner/verbindingen/* із контекстом сеансу та вкладки без змін у спільних файлах хмари.
import { sessieDienst } from '../canoniek-navigatie';
import { api, ApiError } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';

export type VerbindingSoort = 'google' | 'm4';

export type ControleerUit = {
  ok: boolean;
  soort: VerbindingSoort;
  accountId: string;
  ruimte: 'prive' | 'technisch';
  stand: 'ok' | 'aandacht';
  status: string;
  code?: string;
  actief?: boolean;
  gecontroleerdOp: number;
};

export type LoskoppelUit = {
  ok: boolean;
  soort: VerbindingSoort;
  accountId: string;
  ruimte: 'prive' | 'technisch';
  localDisabled?: boolean;
  remote?: 'revoked' | 'unsupported' | 'pending';
};

export class VerbindingenBeheerFout extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = 'VerbindingenBeheerFout';
  }
}

const maakLichaam = (extra: Record<string, unknown>) => ({
  service: sessieDienst(),
  tabContext: ecosystemTabContext(),
  sourceOrigin: location.origin,
  ...extra,
});

async function roep<T>(pad: string, data: Record<string, unknown>): Promise<T> {
  try {
    const r = await api.post(`/api/owner/verbindingen/${pad}`, maakLichaam(data));
    return r.data as T;
  } catch (e) {
    if (e instanceof ApiError) {
      const errCode = String((e.response?.data as { error?: string } | undefined)?.error || e.message || `HTTP_${e.status}`);
      throw new VerbindingenBeheerFout(errCode, e.status);
    }
    throw new VerbindingenBeheerFout(String((e as Error)?.message || 'NETWERK'), 0);
  }
}

export const verbindingenClient = {
  controleer: (soort: VerbindingSoort, accountId: string) =>
    roep<ControleerUit>('controleer', { soort, accountId }),
  selecteer: (accountId: string) =>
    roep<{ ok: boolean; ruimte: 'prive' | 'technisch' }>('selecteer', { accountId }),
  loskoppelen: (soort: VerbindingSoort, accountId: string) =>
    roep<LoskoppelUit>('loskoppelen', { soort, accountId, bevestig: true }),
};
