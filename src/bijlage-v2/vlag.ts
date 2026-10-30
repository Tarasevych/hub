// Bijlageviewer v2 (vlag `bijlage-viewer-v2`, standaard UIT). Zonder vlag: precies de oude werkbank en de oude PDF-balk.
// De vlag wordt één keer gelezen in de mailwerkruimte en via deze context doorgegeven aan de PDF-weergave (MailPdfVoorbeeld),
// zodat andere plaatsen die MailPdfVoorbeeld gebruiken (Drive, miniaturen) ongewijzigd blijven.
import { createContext, useContext, useEffect, useState } from 'react';

export const BIJLAGE_V2_VLAG = 'bijlage-viewer-v2';
export const BijlageV2Context = createContext(false);
export const useBijlageV2 = () => useContext(BijlageV2Context);

/** Voorkeuren (alleen weergave, geen gegevens): per apparaat in localStorage. */
export type PdfVoorkeur = { fit: 'width' | 'page' | 'actual'; zoom: number; balkIngeklapt: boolean };
const SLEUTEL = 'mr-bijlage-v2-weergave';
export const leesVoorkeur = (): PdfVoorkeur => {
  try {
    const v = JSON.parse(localStorage.getItem(SLEUTEL) || '{}');
    const fit = v.fit === 'page' || v.fit === 'actual' ? v.fit : 'width';
    const zoom = Number.isFinite(v.zoom) && v.zoom >= 0.25 && v.zoom <= 4 ? v.zoom : 1;
    return { fit, zoom, balkIngeklapt: v.balkIngeklapt === true };
  } catch { return { fit: 'width', zoom: 1, balkIngeklapt: false }; }
};
export const schrijfVoorkeur = (deel: Partial<PdfVoorkeur>) => {
  try { localStorage.setItem(SLEUTEL, JSON.stringify({ ...leesVoorkeur(), ...deel })); } catch { /* privé-modus: niet bewaren */ }
};

// Uitkomst van de vlag: zoals agenda-v3 één OFREP-verzoek per pagina (src/vlaggen/ is technische code en mag niet in de openbare
// mailbundel), resultaat in sessionStorage. Fout of geen antwoord = UIT = de oude viewer.
const OPSLAG = `mr-vlag:${BIJLAGE_V2_VLAG}`;
let waarde: boolean | null = (() => { try { const v = sessionStorage.getItem(OPSLAG); return v === '1' ? true : v === '0' ? false : null; } catch { return null; } })();
let bezig: Promise<boolean> | null = null;
const luisteraars = new Set<(v: boolean) => void>();
export function laadBijlageV2Vlag(): Promise<boolean> {
  if (bezig) return bezig;
  bezig = Promise.all([import('../platform/client'), import('../tech/ruimtes/ruimtes-vlag')])
    .then(([{ api }, { vlagBody }]) => api.post(`/api/ofrep/v1/evaluate/flags/${BIJLAGE_V2_VLAG}`, vlagBody()))
    .then((r) => r.data?.value === true, () => null).then((x) => {
      const v = x === true;
      if (x === null) bezig = null; else { try { sessionStorage.setItem(OPSLAG, v ? '1' : '0'); } catch { /* geen opslag */ } }
      waarde = v; luisteraars.forEach((f) => f(v)); return v;
    });
  return bezig;
}
export function useBijlageV2Vlag(): boolean {
  const [v, setV] = useState(waarde === true);
  useEffect(() => { luisteraars.add(setV); void laadBijlageV2Vlag(); return () => { luisteraars.delete(setV); }; }, []);
  return v;
}
