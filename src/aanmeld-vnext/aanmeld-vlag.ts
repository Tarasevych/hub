// Прапорець `aanmeldmethoden-vnext` (міграція 0198) та взаємосумісний `aanmeldmethoden-kaart-v2` (міграція 0321).
// Підтримує як спільний реактивний читач functievlag-lezen (з миттєвим оновленням за подією mr:vlaggen-vernieuwd),
// так і сумісність із sessionStorage / OFREP для ізольованих випробувань.
import { useEffect, useState } from 'react';
import { AANMELD_VLAG } from '../../shared/aanmeld-vnext-model';
import { AANMELDMETHODEN_KAART_V2_VLAG } from '../aanmeldmethoden-v2/vlag';
import { api } from '../platform/client';
import { vlagBody } from '../tech/ruimtes/ruimtes-vlag';

const SLEUTEL = `mr-vlag:${AANMELD_VLAG}`;

export async function laadAanmeldVlag(opnieuw = false): Promise<boolean> {
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
    if (m.has(AANMELD_VLAG) || m.has(AANMELDMETHODEN_KAART_V2_VLAG)) {
      const aan = m.get(AANMELD_VLAG)?.value === true || m.get(AANMELDMETHODEN_KAART_V2_VLAG)?.value === true;
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
    .post(`/api/ofrep/v1/evaluate/flags/${AANMELD_VLAG}`, vlagBody())
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

/** true, щойно прапорець увімкнено; реактивно оновлюється за подією mr:vlaggen-vernieuwd. */
export function useAanmeldVnext(): boolean {
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
      void laadAanmeldVlag(opnieuw).then((v) => {
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
