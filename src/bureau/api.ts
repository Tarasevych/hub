// Bureaublad: laden en bewaren van de indeling van DEZE gebruiker op de server (backend/hub-bureau.ts).
// Zonder server (uitgelogd, oude versie) blijft het bureaublad leeg maar werkend: niets wordt verzonnen.
import { api, ApiError } from '../platform/client';
import { hubAuthBody } from '../useCanoniekHubAuth';
import { leegBureau, normaliseerBureau, type BureauIndeling } from '../../shared/bureau-indeling';
import { ruimteFeitenUit, ruimteGeslotenUit, type RuimteFeiten, type RuimteGesloten } from '../../shared/ruimte-weergave';

/**
 * 0086: het bureaublad hoort bij de dienst «bord» en staat dus in een GEGEVENSLADE. Elk antwoord zegt in welke
 * (`ruimte`), en een weigering van de poort komt hier als `gesloten` terug in plaats van als gewone fout — het scherm toont
 * dan de reden en niet een leeg bureaublad.
 */
export type BureauAntwoord = { indeling: BureauIndeling; bestaat: boolean; updatedAt: number; ruimte: RuimteFeiten | null; gesloten: RuimteGesloten | null };

const uit = (data: unknown): BureauAntwoord => {
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  return { indeling: normaliseerBureau(o.indeling), bestaat: o.bestaat === true, updatedAt: Number(o.updatedAt || 0), ruimte: ruimteFeitenUit(o), gesloten: null };
};
/** Een 403 van de ruimtepoort is geen storing: hij levert een leeg maar VERKLAARD bureaublad. Al het andere gooit door. */
const ofGesloten = async (werk: () => Promise<BureauAntwoord>): Promise<BureauAntwoord> => {
  try { return await werk(); }
  catch (e) {
    const dicht = ruimteGeslotenUit(e instanceof ApiError ? e.response?.data : null);
    if (!dicht) throw e;
    return { ...leegAntwoord(), gesloten: dicht };
  }
};

export const haalBureau = async (): Promise<BureauAntwoord> =>
  ofGesloten(async () => uit((await api.post('/api/owner/hub/bureau/load', hubAuthBody())).data));
export const bewaarBureau = async (indeling: BureauIndeling): Promise<BureauAntwoord> =>
  ofGesloten(async () => uit((await api.post('/api/owner/hub/bureau/save', hubAuthBody({ indeling }))).data));
export function leegAntwoord(): BureauAntwoord { return { indeling: leegBureau(), bestaat: false, updatedAt: 0, ruimte: null, gesloten: null }; }
