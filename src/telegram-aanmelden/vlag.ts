// Прапорці `telegram-aanmelden-v1` (міграція 0201) та `telegram-aanmeld-maket-v1` (міграція 0321, макет №169).
// Реактивно оновлюються за подією mr:vlaggen-vernieuwd та зберігають вибраний стиль вікна входу ('compact' | 'maket').
import { useCallback, useEffect, useState } from 'react';
import { TELEGRAM_VLAG } from '../../shared/telegram-aanmelden/model';
import { useVlag } from '../functievlag-lezen';
import { api } from '../platform/client';
import { vlagBody } from '../tech/ruimtes/ruimtes-vlag';

export const TELEGRAM_MAKET_VLAG = 'telegram-aanmeld-maket-v1';
export type TelegramInlogStijl = 'compact' | 'maket';

const SLEUTEL = `mr-vlag:${TELEGRAM_VLAG}`;
const STIJL_SLEUTEL = 'mr-tg-inlog-stijl';
const STIJL_EVENT = 'mr:tg-inlog-stijl';
const MAKET_PUB_SLEUTEL = `mr-vlag-pub:${TELEGRAM_MAKET_VLAG}`;

export async function laadTelegramVlag(opnieuw = false): Promise<boolean> {
  if (!opnieuw) {
    try {
      const c = sessionStorage.getItem(SLEUTEL);
      if (c === '1') return true;
      if (c === '0') return false;
    } catch {
      /* без сховища сеансу */
    }
  }
  try {
    const { laadVlaggen } = await import('../functievlag-lezen');
    const m = await laadVlaggen(opnieuw);
    if (m.has(TELEGRAM_VLAG)) {
      const aan = m.get(TELEGRAM_VLAG)?.value === true;
      try {
        sessionStorage.setItem(SLEUTEL, aan ? '1' : '0');
      } catch {
        /* без сховища сеансу */
      }
      return aan;
    }
  } catch {
    /* резервний шлях OFREP */
  }
  return api
    .post(`/api/ofrep/v1/evaluate/flags/${TELEGRAM_VLAG}`, vlagBody())
    .then((r) => {
      const aan = (r.data as { value?: boolean })?.value === true;
      try {
        sessionStorage.setItem(SLEUTEL, aan ? '1' : '0');
      } catch {
        /* без сховища сеансу */
      }
      return aan;
    })
    .catch(() => false);
}

export function useTelegramVlag(): boolean {
  const [aan, setAan] = useState(() => {
    try {
      return sessionStorage.getItem(SLEUTEL) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let actief = true;
    const herlaad = (opnieuw: boolean) => {
      if (opnieuw) {
        try {
          sessionStorage.removeItem(SLEUTEL);
        } catch {
          /* без сховища сеансу */
        }
      }
      void laadTelegramVlag(opnieuw).then((v) => {
        if (actief) setAan(v);
      });
    };
    herlaad(false);
    const bijVernieuwing = () => herlaad(true);
    window.addEventListener('mr:vlaggen-vernieuwd', bijVernieuwing);
    return () => {
      actief = false;
      window.removeEventListener('mr:vlaggen-vernieuwd', bijVernieuwing);
    };
  }, []);
  return aan;
}

export function leesTelegramInlogStijl(): TelegramInlogStijl {
  try {
    return localStorage.getItem(STIJL_SLEUTEL) === 'maket' ? 'maket' : 'compact';
  } catch {
    return 'compact';
  }
}

export function zetTelegramInlogStijl(stijl: TelegramInlogStijl): void {
  const veilig: TelegramInlogStijl = stijl === 'maket' ? 'maket' : 'compact';
  try {
    localStorage.setItem(STIJL_SLEUTEL, veilig);
  } catch {
    /* сховище недоступне */
  }
  try {
    window.dispatchEvent(new CustomEvent(STIJL_EVENT, { detail: veilig }));
  } catch {
    /* поза оглядачем */
  }
}

export function useTelegramMaketVlag(): boolean {
  const aan = useVlag(TELEGRAM_MAKET_VLAG, false);
  useEffect(() => {
    try {
      localStorage.setItem(MAKET_PUB_SLEUTEL, aan ? '1' : '0');
    } catch {
      /* сховище недоступне */
    }
  }, [aan]);
  return aan;
}

export function useTelegramInlogStijl(): [TelegramInlogStijl, (stijl: TelegramInlogStijl) => void] {
  const [stijl, setStijl] = useState<TelegramInlogStijl>(leesTelegramInlogStijl);
  useEffect(() => {
    const bijWijziging = () => setStijl(leesTelegramInlogStijl());
    window.addEventListener(STIJL_EVENT, bijWijziging);
    window.addEventListener('storage', bijWijziging);
    return () => {
      window.removeEventListener(STIJL_EVENT, bijWijziging);
      window.removeEventListener('storage', bijWijziging);
    };
  }, []);
  const kies = useCallback((s: TelegramInlogStijl) => {
    zetTelegramInlogStijl(s);
    setStijl(s === 'maket' ? 'maket' : 'compact');
  }, []);
  return [stijl, kies];
}
