// Vlag `telegram-aanmelden-v1` (standaard UIT, migratie 0201): zelfde patroon als src/aanmeld-vnext/aanmeld-vlag.ts.
// Fout of geen antwoord = UIT = de site precies zoals 20261109-105221.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { vlagBody } from '../tech/ruimtes/ruimtes-vlag';
import { TELEGRAM_VLAG } from '../../shared/telegram-aanmelden/model';

const SLEUTEL = `mr-vlag:${TELEGRAM_VLAG}`;
export function laadTelegramVlag(): Promise<boolean> {
  try { const c = sessionStorage.getItem(SLEUTEL); if (c === '1') return Promise.resolve(true); if (c === '0') return Promise.resolve(false); } catch { /* geen opslag */ }
  return api.post(`/api/ofrep/v1/evaluate/flags/${TELEGRAM_VLAG}`, vlagBody())
    .then((r) => { const aan = (r.data as { value?: boolean })?.value === true; try { sessionStorage.setItem(SLEUTEL, aan ? '1' : '0'); } catch { /* geen opslag */ } return aan; })
    .catch(() => false);
}
export function useTelegramVlag(): boolean {
  const [aan, setAan] = useState(() => { try { return sessionStorage.getItem(SLEUTEL) === '1'; } catch { return false; } });
  useEffect(() => { let actief = true; void laadTelegramVlag().then((v) => { if (actief) setAan(v); }); return () => { actief = false; }; }, []);
  return aan;
}
