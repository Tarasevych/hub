// Прапорець `cloud-vnext` (міграція 0130): читання через OFREP із збереженням у sessionStorage
// та реактивним оновленням за подією mr:vlaggen-vernieuwd.
// Vlag `cloud-vnext` met sessionStorage en directe vernieuwing bij `mr:vlaggen-vernieuwd`.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { vlagBody } from '../tech/ruimtes/ruimtes-vlag';
import { CLOUD_VNEXT_VLAG } from '../../shared/cloud-vnext-model';

const SLEUTEL = `mr-vlag:${CLOUD_VNEXT_VLAG}`;

export function laadCloudVlag(opnieuw = false): Promise<boolean> {
  if (!opnieuw) {
    try {
      const c = sessionStorage.getItem(SLEUTEL);
      if (c === '1') return Promise.resolve(true);
      if (c === '0') return Promise.resolve(false);
    } catch { /* проміжне сховище недоступне */ }
  }
  return api.post(`/api/ofrep/v1/evaluate/flags/${CLOUD_VNEXT_VLAG}`, vlagBody())
    .then((r) => {
      const aan = (r.data as { value?: boolean })?.value === true;
      try { sessionStorage.setItem(SLEUTEL, aan ? '1' : '0'); } catch { /* проміжне сховище недоступне */ }
      return aan;
    })
    .catch(() => false);
}

/** true коли прапорець увімкнений; миттєво реагує на подію mr:vlaggen-vernieuwd. */
export function useCloudVnext(): boolean {
  const [aan, setAan] = useState(() => {
    try { return sessionStorage.getItem(SLEUTEL) === '1'; } catch { return false; }
  });
  useEffect(() => {
    let actief = true;
    const herlaad = (opnieuw: boolean) => {
      if (opnieuw) {
        try { sessionStorage.removeItem(SLEUTEL); } catch { /* проміжне сховище недоступне */ }
      }
      void laadCloudVlag(opnieuw).then((v) => { if (actief) setAan(v); });
    };
    herlaad(false);
    const opVernieuwd = () => herlaad(true);
    window.addEventListener('mr:vlaggen-vernieuwd', opVernieuwd);
    return () => {
      actief = false;
      window.removeEventListener('mr:vlaggen-vernieuwd', opVernieuwd);
    };
  }, []);
  return aan;
}
