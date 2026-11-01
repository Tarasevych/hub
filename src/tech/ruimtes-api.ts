// Getypeerde client voor de twee ruimtes (vlag `tech-ruimtes-v2`). Contract: docs/ontwerp/TECH-RUIMTES-API.md; types en pure
// omzetting in ruimtes-contract.ts (eenheidstests zonder DOM).
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { sessieDienst } from '../canoniek-navigatie';
import { naarRegels, normaliseerStatus, type Ruimte, type TermijnModus, type ToegangRuw } from './ruimtes-contract';
export * from './ruimtes-contract';

export const RUIMTES_VLAG = 'tech-ruimtes-v2';
const B = '/api/owner/hub/tech/ruimtes';
const post = <T,>(pad: string, extra: Record<string, unknown> = {}) => api.post(`${B}/${pad}`, ruimtesBody(extra)).then((r) => r.data as T);

// Fix 28.10: was hubAuthBody() = altijd service 'hub'. Op admin.* / id.* / mail.* weigert de server dat (host-dienst ≠ 'hub' →
// OWNER_SESSION_CONTEXT_REQUIRED, 401) → status null → alle termijnen grijs «Сервер не запропонував». Nu de dienst van DEZE host.
export const ruimtesBody = (extra: Record<string, unknown> = {}) => ({ ...extra, service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });

export const ruimtesApi = {
  status: () => post<unknown>('status').then(normaliseerStatus),
  starten: (modus: TermijnModus, reden: string, minuten?: number) => post<unknown>('starten', { modus, reden, ...(modus === 'tijd' ? { minuten } : {}) }).then(normaliseerStatus),
  wisselen: (naar: Ruimte) => post<unknown>('wisselen', { naar }).then(normaliseerStatus),
  verlengen: (minuten: number, soort: 'bijtellen' | 'vervangen') => post<unknown>('verlengen', { minuten, soort }).then(normaliseerStatus),
  beeindigen: () => post<unknown>('beeindigen').then(normaliseerStatus),
  /** Werker 1 (28.10): 200 {ruimte, eindTijd} | 401 | 403 {error, uitleg:{uk,nl}} — mag de technische ruimte nu gebruikt worden? */
  controle: () => post<{ ruimte: Ruimte; eindTijd: string | null }>('controle'),
  toegang: () => post<ToegangRuw>('toegang').then(naarRegels),
  aiZetten: (verbindingId: string, ruimtes: Ruimte[], termijn: TermijnModus, minuten?: number, opties?: { activeerSessie?: boolean }) =>
    post<ToegangRuw>('ai-zetten', {
      verbindingId,
      ruimtes,
      termijn,
      ...(termijn === 'tijd' ? { minuten } : {}),
      ...(opties?.activeerSessie ? { activeerSessie: true } : {}),
    }).then(naarRegels),
};
