// Трирежимний взаємосумісний перемикач вигляду шапки переглядача вкладень (CONSOL-001 / Віха M3, рішення власника №3).
// Коли одночасно увімкнені `bijlage-weergave-gedeeld-v1` та `bijlage-viewer-v2`, типовим є новий спільний переглядач (`gedeeld`),
// але користувач у будь-який момент може вільно перемкнути режим між `gedeeld`, `v2` (`BijlageV2Kop`) та `klassiek`
// зі збереженням вибору у `localStorage` та синхронізацією між відкритими вкладками.
// Drie onderling verenigbare weergavestanden voor de bijlageviewer met opslag en synchronisatie tussen tabbladen.

import { useCallback, useEffect, useState } from 'react';

export type BijlageWeergaveModus = 'gedeeld' | 'v2' | 'klassiek';

export type BijlageWeergaveWissel = {
  huidig: BijlageWeergaveModus;
  opties: readonly BijlageWeergaveModus[];
  onKies: (modus: BijlageWeergaveModus) => void;
};

export const BIJLAGE_MODUS_SLEUTEL = 'tsv:bijlage-weergave-modus';
export const BIJLAGE_MODUS_GEBEURTENIS = 'mr:bijlage-weergave-modus';

export const BIJLAGE_MODUS_LABELS: Readonly<Record<BijlageWeergaveModus, readonly [uk: string, nl: string]>> = Object.freeze({
  gedeeld: ['Спільний переглядач', 'Gedeelde weergave'],
  v2: ['Компактна панель v2', 'Compact paneel v2'],
  klassiek: ['Класична', 'Klassiek'],
});

function isGeldigeModus(waarde: unknown): waarde is BijlageWeergaveModus {
  return waarde === 'gedeeld' || waarde === 'v2' || waarde === 'klassiek';
}

function standaardOpslag(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    const g = globalThis as { localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> };
    return g.localStorage ?? null;
  } catch {
    return null;
  }
}

export function leesBijlageWeergaveKeuze(opslag?: Pick<Storage, 'getItem'> | null): BijlageWeergaveModus | null {
  try {
    const doel = opslag === undefined ? standaardOpslag() : opslag;
    const waarde = doel?.getItem(BIJLAGE_MODUS_SLEUTEL) ?? null;
    return isGeldigeModus(waarde) ? waarde : null;
  } catch {
    return null;
  }
}

export function bewaarBijlageWeergaveKeuze(
  modus: BijlageWeergaveModus | null,
  opslag?: Pick<Storage, 'setItem' | 'removeItem'> | null,
): void {
  try {
    const doel = opslag === undefined ? standaardOpslag() : opslag;
    if (doel) {
      if (modus && isGeldigeModus(modus)) doel.setItem(BIJLAGE_MODUS_SLEUTEL, modus);
      else doel.removeItem(BIJLAGE_MODUS_SLEUTEL);
    }
  } catch {
    /* приватний сеанс без запису у сховище переглядача */
  }
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent(BIJLAGE_MODUS_GEBEURTENIS, { detail: modus }));
    }
  } catch {
    /* без середовища вікна у серверному відмальовуванні */
  }
}

export function beschikbareBijlageModi(gedeeldVlag: boolean, v2Vlag: boolean): BijlageWeergaveModus[] {
  const lijst: BijlageWeergaveModus[] = [];
  if (gedeeldVlag) lijst.push('gedeeld');
  if (v2Vlag) lijst.push('v2');
  lijst.push('klassiek');
  return lijst;
}

export function actieveBijlageWeergaveModus(
  gedeeldVlag: boolean,
  v2Vlag: boolean,
  keuze: BijlageWeergaveModus | null,
): BijlageWeergaveModus {
  if (!gedeeldVlag && !v2Vlag) return 'klassiek';
  if (keuze === 'klassiek') return 'klassiek';
  if (keuze === 'v2' && v2Vlag) return 'v2';
  if (keuze === 'gedeeld' && gedeeldVlag) return 'gedeeld';
  if (gedeeldVlag) return 'gedeeld';
  if (v2Vlag) return 'v2';
  return 'klassiek';
}

export function useBijlageWeergaveModus(): readonly [BijlageWeergaveModus | null, (modus: BijlageWeergaveModus) => void] {
  const [keuze, setKeuze] = useState<BijlageWeergaveModus | null>(() => leesBijlageWeergaveKeuze());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const herlaad = () => setKeuze(leesBijlageWeergaveKeuze());
    const opStorage = (ev: StorageEvent) => {
      if (!ev || ev.key === null || ev.key === BIJLAGE_MODUS_SLEUTEL) herlaad();
    };
    window.addEventListener(BIJLAGE_MODUS_GEBEURTENIS, herlaad);
    window.addEventListener('storage', opStorage);
    return () => {
      window.removeEventListener(BIJLAGE_MODUS_GEBEURTENIS, herlaad);
      window.removeEventListener('storage', opStorage);
    };
  }, []);

  const kies = useCallback((volgende: BijlageWeergaveModus) => {
    bewaarBijlageWeergaveKeuze(volgende);
    setKeuze(volgende);
  }, []);

  return [keuze, kies] as const;
}
