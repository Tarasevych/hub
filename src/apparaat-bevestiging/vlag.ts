// Прапорець `apparaat-bevestiging-v1` (міграція 0204) з реактивним оновленням за подією mr:vlaggen-vernieuwd.
import { useEffect, useState } from 'react';
import { APPARAAT_VLAG } from '../../shared/apparaat-bevestiging/model';
import { api } from '../platform/client';
import { vlagBody } from '../tech/ruimtes/ruimtes-vlag';

const SLEUTEL = `mr-vlag:${APPARAAT_VLAG}`;

export async function laadApparaatVlag(opnieuw = false): Promise<boolean> {
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
    if (m.has(APPARAAT_VLAG)) {
      const aan = m.get(APPARAAT_VLAG)?.value === true;
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
    .post(`/api/ofrep/v1/evaluate/flags/${APPARAAT_VLAG}`, vlagBody())
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

export function useApparaatVlag(): boolean {
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
      void laadApparaatVlag(opnieuw).then((v) => {
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
