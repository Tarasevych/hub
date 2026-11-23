// Віха M2 (UI-015A, №167): прапорець `aanmeldmethoden-kaart-v2` та взаємосумісний перемикач режиму подання
// («Огляд» vNext / «Карткова сітка» UI-015A). Типово активний поточний вигляд «Огляд» ('vnext').
import { useCallback, useEffect, useState } from 'react';
import { useVlag } from '../functievlag-lezen';

export const AANMELDMETHODEN_KAART_V2_VLAG = 'aanmeldmethoden-kaart-v2';
export type AanmeldmethodenWeergave = 'vnext' | 'kaart-v2';

const WEERGAVE_SLEUTEL = 'mr-aanmeldmethoden-weergave';
const WEERGAVE_EVENT = 'mr:aanmeldmethoden-weergave';

export function leesAanmeldmethodenWeergave(): AanmeldmethodenWeergave {
  try {
    const v = localStorage.getItem(WEERGAVE_SLEUTEL);
    return v === 'kaart-v2' ? 'kaart-v2' : 'vnext';
  } catch {
    return 'vnext';
  }
}

export function zetAanmeldmethodenWeergave(weergave: AanmeldmethodenWeergave): void {
  const veilig: AanmeldmethodenWeergave = weergave === 'kaart-v2' ? 'kaart-v2' : 'vnext';
  try {
    localStorage.setItem(WEERGAVE_SLEUTEL, veilig);
  } catch {
    /* сховище недоступне */
  }
  try {
    window.dispatchEvent(new CustomEvent(WEERGAVE_EVENT, { detail: veilig }));
  } catch {
    /* поза оглядачем */
  }
}

export function useAanmeldmethodenKaartV2Vlag(): boolean {
  return useVlag(AANMELDMETHODEN_KAART_V2_VLAG, false);
}

export function useAanmeldmethodenWeergave(): {
  kaartV2Beschikbaar: boolean;
  gekozenWeergave: AanmeldmethodenWeergave;
  actieveWeergave: AanmeldmethodenWeergave;
  zetWeergave: (w: AanmeldmethodenWeergave) => void;
} {
  const kaartV2Beschikbaar = useAanmeldmethodenKaartV2Vlag();
  const [gekozenWeergave, setGekozenWeergave] = useState<AanmeldmethodenWeergave>(leesAanmeldmethodenWeergave);

  useEffect(() => {
    const bijWijziging = () => setGekozenWeergave(leesAanmeldmethodenWeergave());
    window.addEventListener(WEERGAVE_EVENT, bijWijziging);
    window.addEventListener('storage', bijWijziging);
    return () => {
      window.removeEventListener(WEERGAVE_EVENT, bijWijziging);
      window.removeEventListener('storage', bijWijziging);
    };
  }, []);

  const zetWeergave = useCallback((w: AanmeldmethodenWeergave) => {
    zetAanmeldmethodenWeergave(w);
    setGekozenWeergave(w === 'kaart-v2' ? 'kaart-v2' : 'vnext');
  }, []);

  return {
    kaartV2Beschikbaar,
    gekozenWeergave,
    actieveWeergave: kaartV2Beschikbaar && gekozenWeergave === 'kaart-v2' ? 'kaart-v2' : 'vnext',
    zetWeergave,
  };
}
