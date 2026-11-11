// Спадне меню облікового запису v3 (прапорець `accountmenu-v3`, типово ВИМКНЕНО).
// Без увімкненого прапорця працює попереднє меню (accountmenu-v2 або v6) без жодних змін.
import { useEffect, useState } from 'react';

export const ACCOUNTMENU_V3_VLAG = 'accountmenu-v3';
const OPSLAG = `mr-vlag:${ACCOUNTMENU_V3_VLAG}`;
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

export function laadAccountmenuV3Vlag(opnieuw = false): Promise<boolean> {
  if (bezig && !opnieuw) return bezig;
  bezig = import('../functievlag-lezen')
    .then(({ laadVlaggen }) => laadVlaggen(opnieuw))
    .then((m) => {
      if (m.has(ACCOUNTMENU_V3_VLAG)) return m.get(ACCOUNTMENU_V3_VLAG)?.value === true;
      return Promise.all([import('../platform/client'), import('../tech/ruimtes/ruimtes-vlag')])
        .then(([{ api }, { vlagBody }]) => api.post(`/api/ofrep/v1/evaluate/flags/${ACCOUNTMENU_V3_VLAG}`, vlagBody()))
        .then((r) => r.data?.value === true, () => false);
    }, () => false)
    .then((v) => {
      try {
        sessionStorage.setItem(OPSLAG, v ? '1' : '0');
      } catch {
        /* сховище сеансу недоступне */
      }
      waarde = v;
      bezig = null;
      luisteraars.forEach((f) => f(v));
      return v;
    });
  return bezig;
}

export function useAccountmenuV3(): boolean {
  const [v, setV] = useState(waarde === true);
  useEffect(() => {
    luisteraars.add(setV);
    void laadAccountmenuV3Vlag();
    const bijVernieuwing = () => {
      void laadAccountmenuV3Vlag(true);
    };
    window.addEventListener('mr:vlaggen-vernieuwd', bijVernieuwing);
    return () => {
      luisteraars.delete(setV);
      window.removeEventListener('mr:vlaggen-vernieuwd', bijVernieuwing);
    };
  }, []);
  return v;
}
