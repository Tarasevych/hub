// Прапорці служби «Фото» (`foto-dienst`, `menu-kalender-foto-eigen`, `foto-google-drive-v1`):
// читання через OFREP із збереженням у sessionStorage та реактивним оновленням за подією `mr:vlaggen-vernieuwd`.
// Vlaggen van de fotodienst met sessionStorage en directe vernieuwing bij `mr:vlaggen-vernieuwd`.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { vlagBody } from '../tech/ruimtes/ruimtes-vlag';

export const FOTO_VLAG = 'foto-dienst';
export const MENU_VLAG = 'menu-kalender-foto-eigen';
export const FOTO_DRIVE_VLAG = 'foto-google-drive-v1';
export const FOTO_VLAG_EVENT = 'mr:foto-vlaggen';
const sleutel = (v: string) => `mr-vlag:${v}`;

export function vlagGecachet(v: string): boolean { try { return sessionStorage.getItem(sleutel(v)) === '1'; } catch { return false; } }

const lopend = new Map<string, Promise<boolean>>();
export function laadVlag(v: string, opnieuw = false): Promise<boolean> {
  if (opnieuw) {
    lopend.delete(v);
    try { sessionStorage.removeItem(sleutel(v)); } catch { /* проміжне сховище недоступне */ }
  } else {
    try { const c = sessionStorage.getItem(sleutel(v)); if (c === '1') return Promise.resolve(true); if (c === '0') return Promise.resolve(false); } catch { /* проміжне сховище недоступне */ }
    const al = lopend.get(v); if (al) return al;
  }
  const p = api.post(`/api/ofrep/v1/evaluate/flags/${v}`, vlagBody())
    .then((r) => { const aan = (r.data as { value?: boolean })?.value === true; try { sessionStorage.setItem(sleutel(v), aan ? '1' : '0'); } catch { /* проміжне сховище недоступне */ } if (aan) window.dispatchEvent(new CustomEvent(FOTO_VLAG_EVENT)); return aan; })
    .catch(() => false);
  lopend.set(v, p);
  return p;
}

/** Synchroon (voor het menu): moet deze pagina verborgen worden? Alleen de drie pagina's van UI-002 worden hier geraakt. */
export function paginaVerborgen(dienst: string, pagina: string): boolean {
  if (dienst === 'hub' && pagina === 'photos') return !(vlagGecachet(FOTO_VLAG) || vlagGecachet(MENU_VLAG));
  if (dienst === 'cloud' && (pagina === 'calendar' || pagina === 'photos')) return vlagGecachet(MENU_VLAG);
  return false;
}

/** Waar moet een oud adres heen? null = blijven. cloud/calendar → hub/calendar, cloud/photos → hub/photos (alleen met de menuvlag). */
export function doorverwijzing(dienst: string, pagina: string, menuAan: boolean): { dienst: 'hub'; pagina: 'calendar' | 'photos' } | null {
  if (!menuAan || dienst !== 'cloud') return null;
  try { if (new URLSearchParams(location.search).get('kiezer') === '1') return null; } catch { /* geen location (server/test) */ }
  if (pagina === 'calendar') return { dienst: 'hub', pagina: 'calendar' };
  if (pagina === 'photos') return { dienst: 'hub', pagina: 'photos' };
  return null;
}

export function useFotoVlaggen(): { foto: boolean; menu: boolean } {
  const [st, setSt] = useState(() => ({ foto: vlagGecachet(FOTO_VLAG), menu: vlagGecachet(MENU_VLAG) }));
  useEffect(() => {
    let actief = true;
    const ververs = (opnieuw: boolean) => {
      void Promise.all([laadVlag(FOTO_VLAG, opnieuw), laadVlag(MENU_VLAG, opnieuw)]).then(([foto, menu]) => {
        if (actief) setSt({ foto, menu });
      });
    };
    ververs(false);
    const uitCache = () => setSt({ foto: vlagGecachet(FOTO_VLAG), menu: vlagGecachet(MENU_VLAG) });
    const opGlobaalVernieuwd = () => ververs(true);
    window.addEventListener(FOTO_VLAG_EVENT, uitCache);
    window.addEventListener('mr:vlaggen-vernieuwd', opGlobaalVernieuwd);
    return () => {
      actief = false;
      window.removeEventListener(FOTO_VLAG_EVENT, uitCache);
      window.removeEventListener('mr:vlaggen-vernieuwd', opGlobaalVernieuwd);
    };
  }, []);
  return st;
}
