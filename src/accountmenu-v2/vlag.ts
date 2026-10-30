// Accountmenu v2 (vlag `accountmenu-v2`, standaard UIT). Zonder vlag: precies het oude accountmenu (v6).
// Zoals bijlage-viewer-v2: één OFREP-verzoek per pagina, uitkomst in sessionStorage. Fout of geen antwoord = UIT.
// ?accountmenu=v2 in de adresbalk wordt NIET gelezen: alleen de server beslist.
import { useEffect, useState } from 'react';

export const ACCOUNTMENU_V2_VLAG = 'accountmenu-v2';
const OPSLAG = `mr-vlag:${ACCOUNTMENU_V2_VLAG}`;
let waarde: boolean | null = (() => { try { const v = sessionStorage.getItem(OPSLAG); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } })();
let bezig: Promise<boolean> | null = null;
const luisteraars = new Set<(v: boolean) => void>();
export function laadAccountmenuV2Vlag(): Promise<boolean> {
  if (bezig) return bezig;
  bezig = Promise.all([import('../platform/client'), import('../tech/ruimtes/ruimtes-vlag')])
    .then(([{ api }, { vlagBody }]) => api.post(`/api/ofrep/v1/evaluate/flags/${ACCOUNTMENU_V2_VLAG}`, vlagBody()))
    .then((r) => r.data?.value === true, () => null).then((x) => {
      const v = x === true;
      if (x === null) bezig = null; else { try { sessionStorage.setItem(OPSLAG, v ? '1' : '0'); } catch { /* geen opslag */ } }
      waarde = v; luisteraars.forEach((f) => f(v)); return v;
    });
  return bezig;
}
export function useAccountmenuV2(): boolean {
  const [v, setV] = useState(waarde === true);
  useEffect(() => { luisteraars.add(setV); void laadAccountmenuV2Vlag(); return () => { luisteraars.delete(setV); }; }, []);
  return v;
}

/** Tekst voor de tooltip van de kleine avatar: naam, e-mail en (bij meerdere accounts) hoeveel andere er klaarstaan. */
export function avatarTip(lang: 'uk' | 'nl', naam: string, email: string, anderen: number): string {
  const regels = [naam && naam !== email ? naam : '', email].filter(Boolean);
  if (anderen > 0) regels.push(lang === 'uk' ? `Ще акаунтів: ${anderen} — натисніть, щоб перемкнутися` : `Nog ${anderen} account(s) — klik om te wisselen`);
  return regels.join('\n');
}
