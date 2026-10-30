// Vlag `tech-ruimtes-v2` voor de OPENBARE bundel (src/vlaggen/ is technisch en mag hier niet statisch in): één OFREP-verzoek per
// pagina, uitkomst ook in sessionStorage zodat een volgende pagina niet eerst de oude weergave toont (geen knipperen).
// Standaard UIT: zonder antwoord of bij een fout blijft alles precies zoals vóór deze vlag.
import { useEffect, useState } from 'react';
import { api } from '../../platform/client';
import { RUIMTES_VLAG } from '../ruimtes-api';
import { techBody } from '../tech-opslag';
import { sessieDienst } from '../../canoniek-navigatie';
import { vlagDienst } from '../ruimtes-contract';

// Integratiefix 27.10: techBody() valt vóór het laden van de zijbalk terug op serviceFromLocation(), dat op hub.* 'ai' geeft → 401
// OWNER_SESSION_CONTEXT_REQUIRED → vlag stil «uit». Hier altijd de sessiedienst van deze host (zoals hubAuthBody/ruimtes-api).
// Fix 28.10: zijbalkServerDienst() (eerste keus van techBody) kan een ANDERE dienst dan deze host zijn → 401 op admin.*/id.* → vlag «uit»
// → oude venster → server 409 GEBRUIK_RUIMTES_V2. De sessie-body moet altijd de dienst van deze host dragen.
export const vlagBody = () => { const b = techBody(); return { ...b, service: sessieDienst() || vlagDienst(b.service, sessieDienst()) }; };

const OPSLAG = `mr-vlag:${RUIMTES_VLAG}`;
let waarde: boolean | null = (() => { try { const v = sessionStorage.getItem(OPSLAG); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } })();
let bezig: Promise<boolean> | null = null;
const luisteraars = new Set<(v: boolean) => void>();
export const ruimtesV2Nu = () => waarde === true;
export function laadRuimtesVlag(opnieuw = false): Promise<boolean> {
  if (bezig && !opnieuw) return bezig;
  bezig = api.post(`/api/ofrep/v1/evaluate/flags/${RUIMTES_VLAG}`, vlagBody()).then((r) => r.data?.value === true, () => null).then((x) => {
    // Fout (netwerk/401): voor deze weergave «uit», maar niet onthouden en de volgende aanroep vraagt opnieuw.
    const v = x === true;
    if (x === null) bezig = null;
    else { try { sessionStorage.setItem(OPSLAG, v ? '1' : '0'); } catch { /* geen opslag */ } }
    waarde = v;
    luisteraars.forEach((f) => f(v)); return v;
  });
  return bezig;
}
export function useRuimtesV2(): boolean {
  const [v, setV] = useState(waarde === true);
  useEffect(() => { luisteraars.add(setV); void laadRuimtesVlag(); return () => { luisteraars.delete(setV); }; }, []);
  return v;
}
