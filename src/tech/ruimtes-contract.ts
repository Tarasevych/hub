// Contract (types + pure omzetting, geen DOM) — de client staat in ruimtes-api.ts. Getypeerde client voor de twee ruimtes van één account (vlag `tech-ruimtes-v2`). Contract: docs/ontwerp/TECH-RUIMTES-API.md
// (backend/tech-ruimtes.ts). Alle verzoeken zijn POST met hubAuthBody; de server beslist altijd — deze client toont alleen.

import type { AiTermijn } from '../../shared/ai-delegatie';
export type Ruimte = 'prive' | 'technisch';
export type TermijnModus = 'tijd' | 'tot-technisch-einde' | 'tot-site-uitloggen';
export type Tweetalig = { uk: string; nl: string };
export type RuimteSessie = { id: string; modus: TermijnModus; eindTijd: number | null; gestartOp: number };
export type Termijn = { modus: TermijnModus; minuten?: number; label: Tweetalig; beschikbaar: boolean; reden?: Tweetalig };
export type RuimtesStatus = {
  aan: boolean; actief: Ruimte; technischToegestaan: boolean; pauze: boolean; sessie: RuimteSessie | null;
  termijnen: Termijn[]; maxMinuten: number; rollen: Array<{ naam: string; maxMinuten: number }>;
};
export type ToegangSoort = 'persoon' | 'sessie' | 'ai' | 'extensie' | 'code' | 'vlagtest';
/** Weergavemodel voor «Доступ і терміни» (één rij per ding met toegang). Gemaakt uit het serverantwoord door `naarRegels`. */
export type ToegangRegel = {
  id: string; soort: ToegangSoort; naam: string; detail?: string; ruimtes?: Ruimte[];
  termijn?: { modus: TermijnModus | 'tot-intrekken'; eindTijd: number | null } | null; actief?: boolean; deze?: boolean; tabblad?: 'eigen' | 'invoer' | 'ai' | 'mensen' | 'codes' | 'vlaggen';
  /** AI-TERMIJN-001: sessie — subdomein, apparaat en browser van de aanmelding */ dienst?: string | null; apparaat?: string | null; browser?: string | null;
  /** AI-TERMIJN-001: AI — agent-slug, token geldig tot, en de delegatie met levende stand */ agent?: string | null; tokenTot?: number | null; delegatie?: AiDelegatieWeergave | null;
};
/** AI-TERMIJN-001: wat POST …/toegang per AI-verbinding over de delegatie teruggeeft. */
export type AiDelegatieWeergave = {
  eigen: boolean; sleutel: string; technisch: boolean; termijn: AiTermijn; eindTijd: number | null;
  regels: { bijPauze: 'pauzeren' | 'intrekken' | 'doorwerken'; inactiefMinuten: number | null; bijAfmelden: 'intrekken' | 'blijven' };
  gezetOp: number | null; laatstGebruiktOp: number | null; ingetrokkenOp: number | null;
  stand: 'actief' | 'doorwerken' | 'wacht' | 'ingetrokken' | 'geen'; code: string | null;
};
/** Ruw antwoord van POST …/ruimtes/toegang (docs/ontwerp/TECH-RUIMTES-API.md). */
export type ToegangRuw = {
  magBeheren?: boolean;
  mensen?: Array<{ userId: string; email: string; naam: string; rollen: string[]; maxMinuten: number; eigenaar: boolean; actiefTot: string | null; ingetrokken: boolean }>;
  sessies?: Array<{ id: string; modus: TermijnModus; eindTijd: string | null; grensTijd?: string | null; gestartOp: string; actief: Ruimte | boolean; dezeSessie: boolean; dienst?: string | null; apparaat?: string | null; browser?: string | null }>;
  ai?: Array<{ verbindingId: string; naam: string; agent: string | null; ruimtes: string[]; termijn: string | null; eindTijd: string | null; tokenTot: string | null; bron: string; delegatie?: any }>;
  extensie?: Array<{ id: string; agentId: string; ruimte: string; eindeSoort: string; eindTijd: string | null; overleeftTabUitloggen: boolean }>;
  codes?: Array<{ id: string; naam: string; scopes: string[]; verlooptOp: string | null }>;
  vlagTests?: Array<{ sleutel: string; waarde: boolean; tot: string }>;
  fouten?: string[];
};
export type RuimtesToegang = { regels: ToegangRegel[]; magBeheren: boolean; fouten: string[] };

/** ISO-tekst of getal → ms (null blijft null). */
export const ms = (x: unknown): number | null => (x === null || x === undefined || x === '' ? null : typeof x === 'number' ? x : Number.isFinite(Date.parse(String(x))) ? Date.parse(String(x)) : null);
const ruimtesVan = (r: unknown): Ruimte[] => (Array.isArray(r) ? r : [r]).filter((x): x is Ruimte => x === 'prive' || x === 'technisch');
const modusVan = (m: unknown): TermijnModus | 'tot-intrekken' => (m === 'tijd' || m === 'tot-technisch-einde' || m === 'tot-site-uitloggen' ? m : 'tot-intrekken');

export function normaliseerStatus(raw: any): RuimtesStatus {
  const sessie = raw?.sessie ? { ...raw.sessie, eindTijd: ms(raw.sessie.eindTijd), gestartOp: ms(raw.sessie.gestartOp) ?? 0 } : null;
  return { ...raw, aan: raw?.aan === true, actief: raw?.actief === 'technisch' ? 'technisch' : 'prive', technischToegestaan: raw?.technischToegestaan === true, pauze: raw?.pauze === true, sessie, termijnen: Array.isArray(raw?.termijnen) ? raw.termijnen : [], maxMinuten: Number(raw?.maxMinuten || 0), rollen: Array.isArray(raw?.rollen) ? raw.rollen : [] };
}
/** Serverantwoord → rijen per tabblad. Ook een oud/ander antwoord met `regels` wordt geaccepteerd. */
export function naarRegels(raw: ToegangRuw & { regels?: ToegangRegel[] }): RuimtesToegang {
  const regels: ToegangRegel[] = [...(raw.regels ?? [])];
  for (const s of raw.sessies ?? []) regels.push({ id: `sessie:${s.id}`, soort: 'sessie', tabblad: 'eigen', naam: '', deze: s.dezeSessie === true, termijn: { modus: s.modus, eindTijd: ms(s.eindTijd) }, actief: s.actief === true || s.actief === 'technisch',
    dienst: s.dienst ?? null, apparaat: s.apparaat ?? null, browser: s.browser ?? null });
  for (const p of raw.mensen ?? []) regels.push({ id: `persoon:${p.userId}`, soort: 'persoon', naam: p.naam || p.email, detail: `${p.email} · ${p.rollen.join(', ')}${p.ingetrokken ? ' · ✕' : ''}`, termijn: p.actiefTot ? { modus: 'tijd', eindTijd: ms(p.actiefTot) } : null, actief: !p.ingetrokken });
  for (const a of raw.ai ?? []) regels.push({ id: a.verbindingId, soort: 'ai', naam: a.naam, detail: [a.agent, a.bron].filter(Boolean).join(' · '), ruimtes: ruimtesVan(a.ruimtes), termijn: a.termijn ? { modus: modusVan(a.termijn), eindTijd: ms(a.eindTijd) } : null,
    agent: a.agent ?? null, tokenTot: ms(a.tokenTot), delegatie: a.delegatie ? { ...a.delegatie, eindTijd: ms(a.delegatie.eindTijd), gezetOp: ms(a.delegatie.gezetOp), laatstGebruiktOp: ms(a.delegatie.laatstGebruiktOp), ingetrokkenOp: ms(a.delegatie.ingetrokkenOp) } : null });
  for (const e of raw.extensie ?? []) regels.push({ id: `ext:${e.id}`, soort: 'extensie', naam: e.agentId || 'extensie', ruimtes: ruimtesVan(e.ruimte), termijn: { modus: modusVan(e.eindeSoort), eindTijd: ms(e.eindTijd) } });
  for (const c of raw.codes ?? []) regels.push({ id: `code:${c.id}`, soort: 'code', naam: c.naam, detail: c.scopes.join(', '), termijn: c.verlooptOp ? { modus: 'tijd', eindTijd: ms(c.verlooptOp) } : { modus: 'tot-intrekken', eindTijd: null } });
  for (const v of raw.vlagTests ?? []) regels.push({ id: `vlag:${v.sleutel}`, soort: 'vlagtest', naam: v.sleutel, detail: v.waarde ? 'так / ja' : 'ні / nee', termijn: { modus: 'tijd', eindTijd: ms(v.tot) } });
  return { regels, magBeheren: raw.magBeheren === true, fouten: raw.fouten ?? [] };
}


/** Dienst voor het vlag-verzoek (integratiefix 27.10): techBody() geeft vóór het laden van de zijbalk 'ai' op hub.* (weergavedienst),
 *  de server weigert dat met 401 OWNER_SESSION_CONTEXT_REQUIRED en de vlag bleef stil «uit». Gebruik dan de sessiedienst van de host. */
export const vlagDienst = (bodyDienst: string, hostDienst: string): string => (bodyDienst === 'ai' && hostDienst !== 'ai' ? hostDienst : bodyDienst);
