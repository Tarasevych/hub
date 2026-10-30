// UI-014 «Afstemming vNext» (vlag afstemming-vnext, migratie 0197) — het GEDEELDE contract van de slimme productkartotheek
// op api.tarasevych.com/afstemming. Eén waarheid voor server (backend/afstemming-kern.ts + backend/afstemming-koppel.ts),
// client (src/afstemming-vnext/*) en tests. De grondregels van het technische dossier (02_Specification):
//   • één kaart draagt een idee door de hele levensloop; NIETS verdwijnt — gebeurtenissen zijn append-only;
//   • twee assen die nooit samenvallen: levensfase (wat besloten/gedaan is) en echte gezondheid (wat bewezen werkt);
//   • «code geschreven», «PR gemerged», «deployment gelukt», «werkt», «eigenaar accepteerde» zijn VIJF verschillende dingen;
//   • de AI/agent mag voorstellen, analyseren en bewijs aandragen — nooit goedkeuren, nooit production-succes verklaren;
//   • voortgang wordt nooit verzonnen: alleen telbare feiten (AC 2/6, tests 3/5, uitgerold: ja, eigenaar: wacht);
//   • de 25 oude claims (backend/waarheid-claims.ts) migreren als legacy met provenance en ZONDER hogere bewijslaag.
import type { Tweetalig } from './cloud-vnext-model';

export const AFSTEMMING_VLAG = 'afstemming-vnext';

export const AFSTEMMING_LIMIETEN = Object.freeze({
  titelMax: 160, samenvattingMax: 400, tekstMax: 20000,
  criteriaMax: 40, criteriumMax: 500,
  koppelingenMax: 120, bewijsMax: 200, bijlagenMax: 24,
  lijstPagina: 100, zoekMin: 2, zoekMax: 80,
  importBytesMax: 512 * 1024,           // .json/.md/.txt in deze golf; PDF/beeld = gepland (aparte parser/quarantaine)
  gebeurtenissenPagina: 200,
  gezondheidVerouderdDagen: 30,         // bewijs ouder dan dit heet in de UI eerlijk «застаріла перевірка»
});

// ---------------------------------------------------------------- de twee assen (§5 van het dossier)
export type Levensfase = 'draft' | 'needs_review' | 'approved' | 'in_progress' | 'code_ready' | 'staging_verified' | 'deployed' | 'production_verified' | 'accepted' | 'superseded' | 'cancelled';
export const LEVENSFASEN: readonly Levensfase[] = Object.freeze(['draft', 'needs_review', 'approved', 'in_progress', 'code_ready', 'staging_verified', 'deployed', 'production_verified', 'accepted', 'superseded', 'cancelled']);
export const LEVENSFASE_LABEL: Record<Levensfase, Tweetalig> = Object.freeze({
  draft: ['Чернетка', 'Concept'], needs_review: ['Потребує розгляду', 'Wacht op beoordeling'], approved: ['Погоджено', 'Goedgekeurd'],
  in_progress: ['У роботі', 'In uitvoering'], code_ready: ['Код готовий', 'Code klaar'], staging_verified: ['Перевірено на staging', 'Op staging gecontroleerd'],
  deployed: ['Розгорнуто', 'Uitgerold'], production_verified: ['Підтверджено на production', 'Op productie bevestigd'],
  accepted: ['Прийнято власником', 'Door de eigenaar aanvaard'], superseded: ['Замінено новішим', 'Vervangen'], cancelled: ['Скасовано', 'Geannuleerd'],
});
export type Gezondheid = 'unknown' | 'not_implemented' | 'partially_working' | 'working' | 'regressed' | 'blocked' | 'obsolete';
export const GEZONDHEID_LABEL: Record<Gezondheid, Tweetalig> = Object.freeze({
  unknown: ['Невідомо', 'Onbekend'], not_implemented: ['Не реалізовано', 'Niet gebouwd'], partially_working: ['Працює частково', 'Werkt deels'],
  working: ['Працює', 'Werkt'], regressed: ['Регресія', 'Regressie'], blocked: ['Заблоковано', 'Geblokkeerd'], obsolete: ['Застаріло', 'Verouderd'],
});
// Welke fase-overgangen een MENS vragen (eigenaarsbesluit); al het andere mag uit feiten volgen.
export const FASE_MENS_VERPLICHT: readonly Levensfase[] = Object.freeze(['approved', 'accepted', 'cancelled', 'superseded']);

// ---------------------------------------------------------------- kaart, revisie, criteria (§4, §12)
export type Criterium = { id: string; tekst: Tweetalig | { uk: string; nl?: string }; verificatie: 'unit' | 'integration' | 'e2e' | 'production' | 'owner'; stand: 'not_tested' | 'passed' | 'failed' | 'stale' };
export type Revisie = {
  id: string; kaartId: string; ouderId: string | null; nummer: number;
  titel: Tweetalig; samenvatting: Tweetalig; bedoeling: string; verwachtGedrag: string;
  criteria: Criterium[]; dienst: string; categorie: string; prioriteit: 'P0' | 'P1' | 'P2' | 'P3';
  gemaaktDoor: Actor; gemaaktOp: string; inhoudHash: string;
};
export type Actor = { soort: 'eigenaar' | 'agent' | 'systeem'; id: string; naam?: string };
export type Kaart = {
  id: string; externId: string;                 // externe stabiele ID (UI-014, CAN-001, …) — uniek
  levensfase: Levensfase; gezondheid: Gezondheid;
  revisieId: string; revisieNummer: number;
  titel: Tweetalig; samenvatting: Tweetalig; dienst: string; categorie: string; prioriteit: 'P0' | 'P1' | 'P2' | 'P3';
  eigenNotitie?: string;                        // notitie van de MENS — een agent wijzigt die nooit (alleen patchvoorstel)
  criteriaTotaal: number; criteriaGeslaagd: number;
  koppelingen: number; bewijs: number; openConflicten: number;
  bronSoort: 'gesprek' | 'import' | 'agent' | 'legacy' | 'scan'; provenance: string;
  legacy?: { claimId: string; bewijslaag: string[]; classificatie: string }; // migratie zonder hogere bewijslaag
  aangemaaktOp: string; bijgewerktOp: string; versie: number;               // optimistic concurrency → 409 met diff
  gearchiveerd?: boolean;
};
export type Gebeurtenis = {
  id: string; kaartId: string; soort: GebeurtenisSoort; actor: Actor; bron: string;
  payload: Record<string, unknown>; op: string; correlatieId?: string;
};
export type GebeurtenisSoort = 'voorgesteld' | 'bijgewerkt' | 'revisie' | 'besluit' | 'koppeling' | 'bewijs' | 'release' | 'fase' | 'gezondheid' | 'import' | 'scan' | 'notitie' | 'geweigerd' | 'gearchiveerd';

// ---------------------------------------------------------------- koppelingen en conflicten (§6)
export type KoppelSoort = 'depends_on' | 'duplicates' | 'overlaps' | 'conflicts_with' | 'blocks' | 'implements' | 'tested_by' | 'introduced_in' | 'regresses' | 'supersedes' | 'relates_to';
export const KOPPEL_SOORTEN: readonly KoppelSoort[] = Object.freeze(['depends_on', 'duplicates', 'overlaps', 'conflicts_with', 'blocks', 'implements', 'tested_by', 'introduced_in', 'regresses', 'supersedes', 'relates_to']);
export const KOPPEL_LABEL: Record<KoppelSoort, Tweetalig> = Object.freeze({
  depends_on: ['Залежить від', 'Hangt af van'], duplicates: ['Дублює', 'Dupliceert'], overlaps: ['Перетинається з', 'Overlapt met'],
  conflicts_with: ['Конфліктує з', 'Conflicteert met'], blocks: ['Блокує', 'Blokkeert'], implements: ['Реалізує', 'Implementeert'],
  tested_by: ['Перевіряється', 'Getest door'], introduced_in: ['З’явилось у', 'Geïntroduceerd in'], regresses: ['Регресує', 'Regresseert'],
  supersedes: ['Замінює', 'Vervangt'], relates_to: ['Пов’язано з', 'Verwant aan'],
});
export type Koppeling = {
  id: string; van: string; naar: string; soort: KoppelSoort;
  reden: string; zekerheid: number;             // 0..1 — door de voorsteller benoemd, nooit verzonnen
  stand: 'voorgesteld' | 'bevestigd' | 'afgewezen';  // kandidaten blijven kandidaten tot de eigenaar beslist (geen auto-merge)
  voorgesteldDoor: Actor; op: string; besluitOp?: string;
};
export type Besluit = { id: string; kaartId: string; conflictMet?: string; keuze: 'a' | 'b' | 'samen' | 'uitstel' | 'bevestig' | 'afwijzen'; reden: string; eigenaar: string; op: string };

// ---------------------------------------------------------------- bewijs en releases (§5, §7)
export type BewijsStuk = {
  id: string; kaartId: string; criteriumId?: string;
  soort: 'unit' | 'integration' | 'e2e' | 'screenshot' | 'owner_review' | 'production_probe' | 'ci' | 'bron';
  omgeving: 'lokaal' | 'ci' | 'staging' | 'production' | 'onbekend';
  verwijzing: string; sha256?: string; resultaat: 'geslaagd' | 'mislukt' | 'onbekend';
  waargenomenOp: string; door: Actor;
};
export type ReleaseKoppeling = {
  id: string; kaartId: string; releaseVersie: string; runId?: string; commit?: string;
  zekerheid: number; stand: 'voorgesteld' | 'bevestigd';
  preflight: 'ok' | 'onbekend' | 'ongeregistreerd'; postflight: 'niet_gecontroleerd' | 'gecontroleerd' | 'regressie';
  op: string;
};
// «Uitgerold» bewijst ALLEEN uitrol; production_verified vraagt bewijs op production; accepted vraagt de eigenaar (§5).

// ---------------------------------------------------------------- import (§3B) en scan (§8)
export type ImportVoorbeeld = {
  invoerHash: string; formaat: 'json' | 'md' | 'txt';
  kaart: { externId?: string; titel: Tweetalig; samenvatting: Tweetalig; dienst: string; categorie: string; prioriteit: 'P0' | 'P1' | 'P2' | 'P3'; bedoeling: string; criteria: Array<{ id: string; tekst: string; verificatie: Criterium['verificatie'] }> };
  onzeker: string[];                            // velden die de parser niet zeker wist — de mens bevestigt
  bestaand?: { kaartId: string; externId: string } | null;  // zelfde invoerHash of externId → idempotent, geen duplicaat
  vergelijkbaar: Array<{ kaartId: string; externId: string; titel: Tweetalig; reden: string }>;
  waarschuwingen: string[];
};
export type ScanBevinding = { soort: 'zonder_kaart' | 'kaart_zonder_spoor' | 'vlag' | 'route' | 'tab'; sleutel: string; detail: string; kaartId?: string };

// ---------------------------------------------------------------- API-contract (alle POST, eigenaar + hub-sessie; fouten {error:CODE})
// backend/afstemming-kern.ts (kern) en backend/afstemming-koppel.ts (koppelingen/releases/scan/rapporten) implementeren dit;
// src/afstemming-vnext/afstemming-client.ts roept aan. Mutaties op een kaart ≥ approved schrijven ALTIJD een audit-gebeurtenis.
//   /api/owner/afstemming/overzicht   {} → { tellers: { kaarten, aandacht, conflicten, zonderBewijs, kandidaten },
//                                          aandacht: Kaart[], recent: Gebeurtenis[], kandidaten: Koppeling[] }
//   /api/owner/afstemming/kaarten     { zoek?, dienst?, categorie?, fase?, gezondheid?, conflict?, sorteer?('bijgewerkt'|'aangemaakt'|'titel'|'prioriteit'), oplopend?, token? }
//                                       → { kaarten: Kaart[], volgende: string|null, totaal: number, diensten: string[], categorieen: string[] }
//   /api/owner/afstemming/kaart       { id } → { kaart, revisie: Revisie, koppelingen: Koppeling[], bewijs: BewijsStuk[],
//                                          releases: ReleaseKoppeling[], besluiten: Besluit[] }
//   /api/owner/afstemming/voorstel    { titel, samenvatting?, bedoeling?, dienst?, categorie?, prioriteit?, criteria?, externId?,
//                                       bron?('gesprek'|'agent'), idempotentie? } → { kaart }  (zelfde idempotentie → zelfde kaart)
//   /api/owner/afstemming/wijzig      { id, versie, velden: { titel?, samenvatting?, bedoeling?, verwachtGedrag?, criteria?,
//                                       dienst?, categorie?, prioriteit?, eigenNotitie? } } → { kaart, revisie }
//                                       versieconflict → 409 { error:'VERSIE_CONFLICT', huidig: Kaart }  (nooit stil overschrijven)
//   /api/owner/afstemming/fase        { id, versie, fase, reden? } → { kaart } — FASE_MENS_VERPLICHT alleen door de eigenaar;
//                                       production_verified alleen met production-bewijs (anders FASE_BEWIJS_ONTBREEKT)
//   /api/owner/afstemming/criterium   { id, versie, criteriumId, stand, bewijsId? } → { kaart } — passed vraagt een bewijsstuk
//   /api/owner/afstemming/import      { actie:'voorbeeld', naam, formaat, inhoud } → ImportVoorbeeld   (niets opgeslagen)
//                                     { actie:'vastleggen', invoerHash, kaart } → { kaart, hergebruikt: boolean }
//   /api/owner/afstemming/geschiedenis{ id, token? } → { gebeurtenissen: Gebeurtenis[], volgende: string|null }
//   /api/owner/afstemming/verschil    { id, revisieA, revisieB } → { velden: Array<{ veld, a, b }> }
//   /api/owner/afstemming/bewijs      { kaartId, criteriumId?, soort, omgeving, verwijzing, sha256?, resultaat } → { stuk }
//                                       (een agent hecht bewijs aan; de STAND van een criterium zet alleen de eigenaar of een
//                                        geautomatiseerde controle met controleerbare verwijzing)
//   — koppel (B-deel) —
//   /api/owner/afstemming/koppel      { actie:'stel-voor'|'bevestig'|'wijs-af'|'lijst'|'verwijder', van?, naar?, soort?, reden?, zekerheid?, id? }
//                                       → { koppeling? , koppelingen? } — bevestig/afwijzen alleen eigenaar, met Besluit-entry
//   /api/owner/afstemming/kandidaten  { kaartId? } → { kandidaten: Koppeling[] }  (lexicaal + graf; semantisch = gepland)
//   /api/owner/afstemming/graaf       { dienst?, soorten?, diepte? } → { knopen: Array<{id, externId, titel, fase, gezondheid, dienst}>,
//                                          randen: Array<{van, naar, soort, stand}> }
//   /api/owner/afstemming/releases    { token? } → { releases: Array<{ versie, op, samenvatting, kaarten: ReleaseKoppeling[],
//                                          ongeregistreerd: string[] }> }   (gelezen uit de BESTAANDE uitrolgeschiedenis, read-only)
//   /api/owner/afstemming/release-koppel { kaartId, releaseVersie, commit?, zekerheid } → { koppeling }
//   /api/owner/afstemming/postflight  { releaseVersie } → { gecontroleerd: number, regressies: string[], onbevestigd: string[] }
//   /api/owner/afstemming/scan        { } → { bevindingen: ScanBevinding[], op: string }   (statisch: routes/vlaggen/tabs van de
//                                          server zelf; read-only, geen productie-aanroepen)
//   /api/owner/afstemming/rapport     { periode?('week'|'maand') } → { nieuw, veranderd, zonderEigenaar, conflicten, verouderd, tekst: Tweetalig }
//   /api/owner/afstemming/mogelijkheden {} → { rubrieken: Array<{ dienst, items: Array<{ externId, titel, uitleg, route, stand: 'перевірено'|'не перевірено' }> }> }
//                                       (ALLEEN kaarten met production-bewijs heten «перевірено»; geen technische geheimen)
// Foutcodes: KAART_ONBEKEND, VERSIE_CONFLICT, FASE_ONGELDIG, FASE_BEWIJS_ONTBREEKT, FASE_EIGENAAR_VEREIST, CRITERIUM_ONBEKEND,
//            BEWIJS_VEREIST, KOPPEL_ONBEKEND, KOPPEL_ZELF, KOPPEL_BESTAAT, CONFLICT_OPEN, IMPORT_ONGELDIG, IMPORT_TE_GROOT,
//            FORMAAT_ONBEKEND, TEKST_TE_LANG, RELEASE_ONBEKEND, IDEMPOTENTIE_BOTSING, AGENT_MAG_NIET (agent probeert te keuren).
export const AFSTEMMING_SECTIES = Object.freeze(['overzicht', 'kartotheek', 'kaart-grafiek', 'controles', 'releases', 'mogelijkheden', 'geschiedenis', 'bronnen'] as const);
export type AfstemmingSectie = (typeof AFSTEMMING_SECTIES)[number];
export const SECTIE_LABEL: Record<AfstemmingSectie, Tweetalig> = Object.freeze({
  overzicht: ['Огляд', 'Overzicht'], kartotheek: ['Картотека', 'Kartotheek'], 'kaart-grafiek': ['Мапа зв’язків', 'Relatiekaart'],
  controles: ['Перевірки', 'Controles'], releases: ['Випуски', 'Releases'], mogelijkheden: ['Можливості', 'Mogelijkheden'],
  geschiedenis: ['Історія', 'Geschiedenis'], bronnen: ['Джерела', 'Bronnen'],
});

// ---------------------------------------------------------------- gedeelde hulpjes
export const afstemmingTekst = (p: Tweetalig | { uk: string; nl?: string } | undefined, lang: 'uk' | 'nl'): string => {
  if (!p) return '';
  if (Array.isArray(p)) return String(lang === 'uk' ? p[0] : p[1] ?? p[0] ?? '');
  const o = p as { uk: string; nl?: string };
  return (lang === 'uk' ? o.uk : o.nl || o.uk) || '';
};
export function schoneTitel(raw: unknown): string {
  return String(raw ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, AFSTEMMING_LIMIETEN.titelMax);
}
/** Telbare voortgang (§5): nooit een verzonnen percentage — alleen de breuk zelf. */
export const voortgangTekst = (geslaagd: number, totaal: number, lang: 'uk' | 'nl'): string =>
  totaal > 0 ? `AC ${geslaagd}/${totaal}` : lang === 'uk' ? 'без критеріїв' : 'zonder criteria';
/** Externe ID netjes: hoofdletters/cijfers/koppelteken, 2..24 tekens; '' = ongeldig. */
export function schoneExternId(raw: unknown): string {
  const v = String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return /^[A-Z][A-Z0-9-]{1,23}$/.test(v) ? v : '';
}
