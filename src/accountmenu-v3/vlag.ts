// Єдине спадне меню облікового запису v3 (IDENTITEIT-008, перемикач `accountmenu-v3`).
// Типово УВІМКНЕНО (STANDAARD_ACCOUNTMENU_V3 = true) в усіх станах — як до входу (екран входу, анонімний стан),
// так і після входу на всіх піддоменах та розмірах екрана, щоб меню облікових записів завжди мало один цілісний вигляд.
// Примусове вимкнення відбувається лише за активного персонального тесту тестувальника (`metadata.test === true && value === false`)
// або в ізольованому локальному стенді старого меню v2 (`127.0.0.1`).
import { useEffect, useState } from 'react';

export const ACCOUNTMENU_V3_VLAG = 'accountmenu-v3';
export const STANDAARD_ACCOUNTMENU_V3 = true;
const OPSLAG = `mr-vlag:${ACCOUNTMENU_V3_VLAG}`;

let waarde: boolean = (() => {
  try {
    const v = sessionStorage.getItem(OPSLAG);
    return v === '0' ? false : STANDAARD_ACCOUNTMENU_V3;
  } catch {
    return STANDAARD_ACCOUNTMENU_V3;
  }
})();

let bezig: Promise<boolean> | null = null;
const luisteraars = new Set<(v: boolean) => void>();

export function laadAccountmenuV3Vlag(opnieuw = false): Promise<boolean> {
  if (bezig && !opnieuw) return bezig;
  bezig = import('../functievlag-lezen')
    .then(({ laadVlaggen }) => laadVlaggen(opnieuw))
    .then(async (m) => {
      if (m.has(ACCOUNTMENU_V3_VLAG)) {
        const uitkomst = m.get(ACCOUNTMENU_V3_VLAG);
        if (uitkomst?.metadata?.test === true && uitkomst.value === false) return false;
        return STANDAARD_ACCOUNTMENU_V3;
      }
      // Перевірка поодинокого маршруту OFREP (зокрема для ізольованих локальних стендів на 127.0.0.1)
      try {
        const [{ api }, { vlagBody }] = await Promise.all([
          import('../platform/client'),
          import('../tech/ruimtes/ruimtes-vlag'),
        ]);
        const r = await api.post(`/api/ofrep/v1/evaluate/flags/${ACCOUNTMENU_V3_VLAG}`, vlagBody());
        const d = (r.data ?? {}) as { key?: string; value?: boolean; metadata?: { test?: boolean } };
        if (d.metadata?.test === true && d.value === false) return false;
        if (typeof window !== 'undefined' && window.location?.hostname === '127.0.0.1' && !d.key && d.value === false) {
          return false;
        }
        return STANDAARD_ACCOUNTMENU_V3;
      } catch {
        return STANDAARD_ACCOUNTMENU_V3;
      }
    })
    .then((aan) => {
      try {
        sessionStorage.setItem(OPSLAG, aan ? '1' : '0');
      } catch {
        /* сховище сеансу недоступне */
      }
      waarde = aan;
      bezig = null;
      luisteraars.forEach((f) => f(aan));
      return aan;
    });
  return bezig;
}

export function useAccountmenuV3(): boolean {
  const [v, setV] = useState<boolean>(waarde);
  useEffect(() => {
    luisteraars.add(setV);
    void laadAccountmenuV3Vlag();
    const bijVernieuwing = () => {
      void laadAccountmenuV3Vlag(false);
    };
    window.addEventListener('mr:vlaggen-vernieuwd', bijVernieuwing);
    return () => {
      luisteraars.delete(setV);
      window.removeEventListener('mr:vlaggen-vernieuwd', bijVernieuwing);
    };
  }, []);
  return v;
}

