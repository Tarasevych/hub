// Getypeerde client voor de twee ruimtes (vlag `tech-ruimtes-v2`). Contract: docs/ontwerp/TECH-RUIMTES-API.md; types en pure
// omzetting in ruimtes-contract.ts (eenheidstests zonder DOM).
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { sessieDienst } from '../canoniek-navigatie';
import { naarRegels, normaliseerStatus, type Ruimte, type TermijnModus, type ToegangRuw } from './ruimtes-contract';
export * from './ruimtes-contract';
import type { AiRegels, AiTermijn } from '../../shared/ai-delegatie';

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
  /** RUIMTE-WEERGAVE-001: bewuste pauze (true) of doorgaan (false) van de hele technische sessie. Wisselen pauzeert niet meer. */
  pauzeren: (aan: boolean) => post<unknown>('pauzeren', { aan }).then(normaliseerStatus),
  verlengen: (minuten: number, soort: 'bijtellen' | 'vervangen') => post<unknown>('verlengen', { minuten, soort }).then(normaliseerStatus),
  beeindigen: () => post<unknown>('beeindigen').then(normaliseerStatus),
  /** Werker 1 (28.10): 200 {ruimte, eindTijd} | 401 | 403 {error, uitleg:{uk,nl}} — mag de technische ruimte nu gebruikt worden? */
  controle: () => post<{ ruimte: Ruimte; eindTijd: string | null }>('controle'),
  toegang: () => post<ToegangRuw>('toegang').then(naarRegels),
  /** AI-TERMIJN-001: termijn + regels per AI-verbinding (stap-op met passkey op de server). '*' vraagt alleVerbindingen: true. */
  aiZetten: (verbindingId: string, ruimtes: Ruimte[], termijn: AiTermijn | TermijnModus, minuten?: number, opties?: { activeerSessie?: boolean; eindOp?: number | null; regels?: Partial<AiRegels>; naam?: string; alleVerbindingen?: boolean }) =>
    post<ToegangRuw>('ai-zetten', {
      verbindingId,
      ruimtes,
      termijn,
      ...(termijn === 'tijd' && opties?.eindOp ? { eindOp: opties.eindOp } : termijn === 'tijd' ? { minuten } : {}),
      ...(opties?.regels ? { regels: opties.regels } : {}),
      ...(opties?.naam ? { naam: opties.naam } : {}),
      ...(opties?.alleVerbindingen ? { alleVerbindingen: true } : {}),
      ...(opties?.activeerSessie ? { activeerSessie: true } : {}),
    }).then(naarRegels),
  aiIntrekken: (verbindingId: string, naam?: string) => post<ToegangRuw>('ai-intrekken', { verbindingId, ...(naam ? { naam } : {}) }).then(naarRegels),
};
