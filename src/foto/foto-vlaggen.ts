// UI-002: twee vlaggen (migratie 0153, standaard UIT), zelfde patroon als src/cloud-vnext/cloud-vlag.ts:
//   • foto-dienst              — de nieuwe fotodienst «Фото» in «Мій простір» (hub/photos);
//   • menu-kalender-foto-eigen — Календар en Фото weg uit het menu «Хмарне сховище», zelfstandig in «Мій простір»;
//                                oude adressen cloud/calendar en cloud/photos sturen door naar hub/calendar en hub/photos.
// Eén OFREP-verzoek per vlag per tabblad; de uitkomst staat in sessionStorage zodat het menu (dat synchroon tekent) haar
// meteen kan lezen. Fout of geen antwoord = UIT = precies het oude gedrag.
import { useEffect, useState } from 'react';
import { api } from '../platform/client';
import { vlagBody } from '../tech/ruimtes/ruimtes-vlag';

export const FOTO_VLAG = 'foto-dienst';
export const MENU_VLAG = 'menu-kalender-foto-eigen';
export const FOTO_VLAG_EVENT = 'mr:foto-vlaggen';
const sleutel = (v: string) => `mr-vlag:${v}`;

export function vlagGecachet(v: string): boolean { try { return sessionStorage.getItem(sleutel(v)) === '1'; } catch { return false; } }

const lopend = new Map<string, Promise<boolean>>();
export function laadVlag(v: string): Promise<boolean> {
  try { const c = sessionStorage.getItem(sleutel(v)); if (c === '1') return Promise.resolve(true); if (c === '0') return Promise.resolve(false); } catch { /* geen opslag */ }
  const al = lopend.get(v); if (al) return al;
  const p = api.post(`/api/ofrep/v1/evaluate/flags/${v}`, vlagBody())
    .then((r) => { const aan = (r.data as { value?: boolean })?.value === true; try { sessionStorage.setItem(sleutel(v), aan ? '1' : '0'); } catch { /* geen opslag */ } if (aan) window.dispatchEvent(new CustomEvent(FOTO_VLAG_EVENT)); return aan; })
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
    void Promise.all([laadVlag(FOTO_VLAG), laadVlag(MENU_VLAG)]).then(([foto, menu]) => { if (actief) setSt({ foto, menu }); });
    const opnieuw = () => setSt({ foto: vlagGecachet(FOTO_VLAG), menu: vlagGecachet(MENU_VLAG) });
    window.addEventListener(FOTO_VLAG_EVENT, opnieuw);
    return () => { actief = false; window.removeEventListener(FOTO_VLAG_EVENT, opnieuw); };
  }, []);
  return st;
}
