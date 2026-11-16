// AANMELD-PLAATSING v1 — één gedeelde lezing van /api/aanmelden/telegram/config voor het aanmeldscherm (Telegram-knop én de
// plaatsing van alle methoden), zodat de pagina één verzoek doet. Mislukt het, dan null → het scherm blijft zoals vóór deze functie.
import { useEffect, useState } from 'react';
import { openbaarGet } from './api';
import type { Plaatsing } from '../../shared/aanmeld-plaatsing/plaatsing';

/** methoden — IDENTITEIT-015 (aanmelden): нові способи, що ЗАРАЗ видають сеанс (passkey, wachtwoord, microsoft, discord, apple). */
export type AanmeldConfig = { zichtbaar: boolean; bot: string; botId: string; stand: string; soort: string; status?: { stand: string; soort: string }; plaatsing?: Plaatsing | null; methoden?: string[] };

let lopend: { p: Promise<AanmeldConfig | null>; tot: number } | null = null;
export function laadAanmeldConfig(forceer = false): Promise<AanmeldConfig | null> {
  if (!forceer && lopend && lopend.tot > Date.now()) return lopend.p;
  const p = openbaarGet<AanmeldConfig>('/api/aanmelden/telegram/config')
    .then((c) => {
      if (!c) lopend = null;
      return c;
    })
    .catch(() => {
      lopend = null;
      return null;
    });
  lopend = { p, tot: Date.now() + 30_000 };
  return p;
}

/** undefined = nog aan het laden; null = niet beschikbaar (dan het gedrag van vóór deze functie). */
export function useAanmeldConfig(): AanmeldConfig | null | undefined {
  const [cfg, setCfg] = useState<AanmeldConfig | null | undefined>(undefined);
  useEffect(() => {
    let actief = true;
    const haalOp = (forceer = false) => {
      void laadAanmeldConfig(forceer).then((c) => {
        if (!actief) return;
        if (c) setCfg(c);
        else setCfg((huidig) => (huidig === undefined ? null : huidig));
      });
    };
    haalOp(false);
    const herstel = () => haalOp(true);
    window.addEventListener('online', herstel);
    window.addEventListener('pageshow', herstel);
    return () => {
      actief = false;
      window.removeEventListener('online', herstel);
      window.removeEventListener('pageshow', herstel);
    };
  }, []);
  return cfg;
}
