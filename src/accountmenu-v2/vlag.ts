// Меню облікового запису v2 (прапорець `accountmenu-v2`). Делегує до спільної проміжної пам’яті functievlag-lezen
// із резервним зверненням OFREP та миттєво оновлюється за подією `mr:vlaggen-vernieuwd`.
import { useEffect, useState } from 'react';

export const ACCOUNTMENU_V2_VLAG = 'accountmenu-v2';
const OPSLAG = `mr-vlag:${ACCOUNTMENU_V2_VLAG}`;

let waarde: boolean | null = (() => {
  try {
    const v = sessionStorage.getItem(OPSLAG);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
})();

let bezig: Promise<boolean> | null = null;
const luisteraars = new Set<(v: boolean) => void>();

export function laadAccountmenuV2Vlag(opnieuw = false): Promise<boolean> {
  if (opnieuw) {
    bezig = null;
    try {
      sessionStorage.removeItem(OPSLAG);
    } catch {
      /* сховище сеансу недоступне */
    }
  } else if (bezig) {
    return bezig;
  }
  bezig = import('../functievlag-lezen')
    .then(({ laadVlaggen }) => laadVlaggen(opnieuw))
    .then(async (m) => {
      if (m.has(ACCOUNTMENU_V2_VLAG)) {
        return m.get(ACCOUNTMENU_V2_VLAG)?.value === true;
      }
      try {
        const [{ api }, { vlagBody }] = await Promise.all([
          import('../platform/client'),
          import('../tech/ruimtes/ruimtes-vlag'),
        ]);
        const r = await api.post(`/api/ofrep/v1/evaluate/flags/${ACCOUNTMENU_V2_VLAG}`, vlagBody());
        return r.data?.value === true;
      } catch {
        return null;
      }
    })
    .then((x) => {
      const v = x === true;
      if (x !== null) {
        try {
          sessionStorage.setItem(OPSLAG, v ? '1' : '0');
        } catch {
          /* сховище сеансу недоступне */
        }
      }
      waarde = v;
      bezig = null;
      luisteraars.forEach((f) => f(v));
      return v;
    });
  return bezig;
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('mr:vlaggen-vernieuwd', () => {
    try {
      sessionStorage.removeItem(OPSLAG);
    } catch {
      /* сховище сеансу недоступне */
    }
    waarde = null;
    bezig = null;
    if (luisteraars.size > 0) void laadAccountmenuV2Vlag(true);
  });
}

export function useAccountmenuV2(): boolean {
  const [v, setV] = useState(waarde === true);
  useEffect(() => {
    luisteraars.add(setV);
    void laadAccountmenuV2Vlag();
    return () => {
      luisteraars.delete(setV);
    };
  }, []);
  return v;
}

/** Підказка маленького аватара: ім'я, адреса та (за наявності кількох) кількість інших збережених облікових записів. */
export function avatarTip(lang: 'uk' | 'nl', naam: string, email: string, anderen: number): string {
  const regels = [naam && naam !== email ? naam : '', email].filter(Boolean);
  if (anderen > 0) regels.push(lang === 'uk' ? `Ще облікових записів: ${anderen} — натисніть, щоб перемкнутися` : `Nog ${anderen} account(s) — klik om te wisselen`);
  return regels.join('\n');
}
