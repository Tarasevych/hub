// Єдине спадне меню облікового запису v3 (IDENTITEIT-008, перемикач `accountmenu-v3`).
// До першої відповіді сервера (або при мережевій відмові / анонімному стані) типово УВІМКНЕНО (STANDAARD_ACCOUNTMENU_V3 = true).
// Коли сервер у відповіді `/api/flags` або OFREP явно повертає булеве значення `value` (зокрема `value: false`), читач чесно
// поважає рішення сервера й миттєво оновлюється за подією `mr:vlaggen-vernieuwd`.
import { useEffect, useState } from 'react';

export const ACCOUNTMENU_V3_VLAG = 'accountmenu-v3';
export const STANDAARD_ACCOUNTMENU_V3 = true;
const OPSLAG = `mr-vlag:${ACCOUNTMENU_V3_VLAG}`;

let waarde: boolean = (() => {
  try {
    const v = sessionStorage.getItem(OPSLAG);
    if (v === '0') return false;
    if (v === '1') return true;
    return STANDAARD_ACCOUNTMENU_V3;
  } catch {
    return STANDAARD_ACCOUNTMENU_V3;
  }
})();

let bezig: Promise<boolean> | null = null;
const luisteraars = new Set<(v: boolean) => void>();

export function laadAccountmenuV3Vlag(opnieuw = false): Promise<boolean> {
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
      if (m.has(ACCOUNTMENU_V3_VLAG)) {
        const uitkomst = m.get(ACCOUNTMENU_V3_VLAG);
        return uitkomst?.value === true;
      }
      // Перевірка поодинокого маршруту OFREP (зокрема для ізольованих локальних стендів на 127.0.0.1)
      try {
        const [{ api }, { vlagBody }] = await Promise.all([
          import('../platform/client'),
          import('../tech/ruimtes/ruimtes-vlag'),
        ]);
        const r = await api.post(`/api/ofrep/v1/evaluate/flags/${ACCOUNTMENU_V3_VLAG}`, vlagBody());
        const d = (r.data ?? {}) as { key?: string; value?: boolean; metadata?: { test?: boolean } };
        if (typeof d.value === 'boolean') return d.value;
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

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('mr:vlaggen-vernieuwd', () => {
    try {
      sessionStorage.removeItem(OPSLAG);
    } catch {
      /* сховище сеансу недоступне */
    }
    waarde = STANDAARD_ACCOUNTMENU_V3;
    bezig = null;
    if (luisteraars.size > 0) void laadAccountmenuV3Vlag(true);
  });
}

export function useAccountmenuV3(): boolean {
  const [v, setV] = useState<boolean>(waarde);
  useEffect(() => {
    luisteraars.add(setV);
    void laadAccountmenuV3Vlag();
    return () => {
      luisteraars.delete(setV);
    };
  }, []);
  return v;
}
