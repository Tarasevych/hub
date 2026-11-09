// AANMELD-PLAATSING v1 — één gedeelde lezing van /api/aanmelden/telegram/config voor het aanmeldscherm (Telegram-knop én de
// plaatsing van alle methoden), zodat de pagina één verzoek doet. Mislukt het, dan null → het scherm blijft zoals vóór deze functie.
import { useEffect, useState } from 'react';
import { openbaarGet } from './api';
import type { Plaatsing } from '../../shared/aanmeld-plaatsing/plaatsing';

export type AanmeldConfig = { zichtbaar: boolean; bot: string; botId: string; stand: string; soort: string; status?: { stand: string; soort: string }; plaatsing?: Plaatsing | null };

let lopend: { p: Promise<AanmeldConfig | null>; tot: number } | null = null;
export function laadAanmeldConfig(): Promise<AanmeldConfig | null> {
  if (lopend && lopend.tot > Date.now()) return lopend.p;
  const p = openbaarGet<AanmeldConfig>('/api/aanmelden/telegram/config').catch(() => null);
  lopend = { p, tot: Date.now() + 30_000 };
  return p;
}

/** undefined = nog aan het laden; null = niet beschikbaar (dan het gedrag van vóór deze functie). */
export function useAanmeldConfig(): AanmeldConfig | null | undefined {
  const [cfg, setCfg] = useState<AanmeldConfig | null | undefined>(undefined);
  useEffect(() => { let actief = true; void laadAanmeldConfig().then((c) => { if (actief) setCfg(c); }); return () => { actief = false; }; }, []);
  return cfg;
}
