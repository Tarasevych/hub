// Afstemming vNext (UI-014) — de GEDEELDE opslaglaag voor backend/afstemming-kern.ts en backend/afstemming-koppel.ts.
// Alles leeft in app.records-collecties (zelfde db-laag als cloud/huis), per EIGENAAR gescheiden op ownerUserId; dit is het
// technische dossier van de eigenaar, dus geen lade-logica. Grondregels die deze laag afdwingt:
//   • afstemming_gebeurtenissen_v1 is APPEND-ONLY: hier bestaat alleen schrijfGebeurtenis (db.add) — geen update, geen delete;
//   • lezen gaat ALTIJD met paginering tot het einde (nextToken-lus, plafond 20 000) — nooit de oude 100-records-afkap;
//   • elke kaartmutatie verhoogt `versie` en `bijgewerktOp` (optimistic concurrency; de routes antwoorden 409 met de verse kaart);
//   • de legacy-seed migreert de 25 claims uit backend/waarheid-claims.ts één keer, idempotent, ZONDER hogere bewijslaag.
import { createHash } from 'node:crypto';
import { db } from '../server/platform';
import {
  AFSTEMMING_LIMIETEN as LIMIET, afstemmingTekst, schoneTitel,
  type Actor, type BewijsStuk, type Criterium, type Gebeurtenis, type GebeurtenisSoort, type Gezondheid, type Kaart, type Levensfase, type Revisie,
} from '../shared/afstemming-model';
import { WAARHEID_CLAIMS } from './waarheid-claims';

// ------------------------------------------------------------------------------------------------ collecties (één naamgeving)
export const KAARTEN = 'afstemming_kaarten_v1';
export const REVISIES = 'afstemming_revisies_v1';
export const GEBEURTENISSEN = 'afstemming_gebeurtenissen_v1'; // append-only
export const BEWIJS = 'afstemming_bewijs_v1';
export const IMPORTS = 'afstemming_import_v1';
// Eigendom van afstemming-koppel.ts (B-deel); de namen staan hier zodat kern/overzicht ze READ-ONLY kan tellen.
export const KOPPELINGEN = 'afstemming_koppelingen_v1';
export const BESLUITEN = 'afstemming_besluiten_v1';
export const RELEASES = 'afstemming_releases_v1';

const LEES_PLAFOND = 20_000;
export type Tweetekst = [string, string];
export type MetId<T> = T & { id: string };

export type KaartRecord = Omit<Kaart, 'id'> & { ownerUserId: string; idempotentie?: string };
export type RevisieRecord = Omit<Revisie, 'id'> & { ownerUserId: string };
export type GebeurtenisRecord = Omit<Gebeurtenis, 'id'> & { ownerUserId: string };
export type BewijsRecord = Omit<BewijsStuk, 'id'> & { ownerUserId: string };
export type ImportRecord = { ownerUserId: string; invoerHash: string; kaartId: string; op: string };

// ------------------------------------------------------------------------------------------------ kleine hulpjes (puur)
export const str = (v: unknown): string => (typeof v === 'string' ? v : '');
export const nuIso = (): string => new Date().toISOString();
export const sha256Hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
/** Tweetalig normaliseren: string → [s, s]; {uk,nl} → [uk, nl||uk]; [a,b] → [a, b||a]. Lege titel = ''. */
export function naarTweetekst(raw: unknown, max: number): Tweetekst {
  const knip = (s: unknown) => schoneTitel(s).slice(0, max);
  if (Array.isArray(raw)) { const a = knip(raw[0]); return [a, knip(raw[1]) || a]; }
  if (raw && typeof raw === 'object') { const o = raw as { uk?: unknown; nl?: unknown }; const a = knip(o.uk); return [a, knip(o.nl) || a]; }
  const a = knip(raw); return [a, a];
}
const VERIFICATIES: ReadonlyArray<Criterium['verificatie']> = ['unit', 'integration', 'e2e', 'production', 'owner'];
/** Verificatiesoort uit vrije tekst («integration + production» → 'integration'); onbekend → 'owner' (menselijke controle). */
export function naarVerificatie(raw: unknown): Criterium['verificatie'] {
  const tekst = str(raw).toLowerCase();
  for (const v of VERIFICATIES) if (tekst.includes(v)) return v;
  return 'owner';
}
/** Criteria uit vrije invoer: id (of C-n), tekst (begrensd), verificatie, stand not_tested. */
export function naarCriteria(raw: unknown): Criterium[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, LIMIET.criteriaMax).map((c, i) => {
    const o = (c && typeof c === 'object' ? c : { tekst: c }) as Record<string, unknown>;
    const tekst = schoneTitel(str(o.tekst) || str(o.text) || str(o.text_uk) || str(o.tekst_uk)).slice(0, LIMIET.criteriumMax);
    const stand = str(o.stand) === 'passed' || str(o.state) === 'passed' ? 'not_tested' : 'not_tested'; // invoer kan nooit al «passed» zijn
    return { id: str(o.id).slice(0, 24) || `C-${i + 1}`, tekst: { uk: tekst }, verificatie: naarVerificatie(o.verificatie ?? o.verification), stand } as Criterium;
  }).filter((c) => afstemmingTekst(c.tekst, 'uk').length > 0);
}

// ------------------------------------------------------------------------------------------------ lezen mét paginering
export async function alleRecords<T>(collectie: string, filter: Record<string, unknown>): Promise<Array<MetId<T>>> {
  const uit: Array<MetId<T>> = [];
  let token: string | undefined;
  while (uit.length < LEES_PLAFOND) {
    const blad = await db.list<T>(collectie, { filter, limit: 1000, ...(token ? { nextToken: token } : {}) });
    uit.push(...(blad.items as unknown as Array<MetId<T>>));
    if (!blad.nextToken) break;
    token = blad.nextToken;
  }
  return uit;
}
export const eigenKaarten = async (userId: string): Promise<Array<MetId<KaartRecord>>> => alleRecords<KaartRecord>(KAARTEN, { ownerUserId: userId });
export async function eenKaartRecord(userId: string, id: unknown): Promise<MetId<KaartRecord> | null> {
  const schoon = str(id);
  if (!schoon || schoon.length > 200) return null;
  const [r] = await db.get<KaartRecord>(KAARTEN, [schoon]);
  return r && r.ownerUserId === userId ? { ...r, id: schoon } : null;
}
export async function eenRevisieRecord(userId: string, id: unknown): Promise<MetId<RevisieRecord> | null> {
  const schoon = str(id);
  if (!schoon || schoon.length > 200) return null;
  const [r] = await db.get<RevisieRecord>(REVISIES, [schoon]);
  return r && r.ownerUserId === userId ? { ...r, id: schoon } : null;
}

// ------------------------------------------------------------------------------------------------ naar-buiten-mappers
export const kaartUit = (r: MetId<KaartRecord>): Kaart => { const { ownerUserId: _o, idempotentie: _i, ...rest } = r; return rest as Kaart; };
export const revisieUit = (r: MetId<RevisieRecord>): Revisie => { const { ownerUserId: _o, ...rest } = r; return rest as Revisie; };
export const gebeurtenisUit = (r: MetId<GebeurtenisRecord>): Gebeurtenis => { const { ownerUserId: _o, ...rest } = r; return rest as Gebeurtenis; };
export const bewijsUit = (r: MetId<BewijsRecord>): BewijsStuk => { const { ownerUserId: _o, ...rest } = r; return rest as BewijsStuk; };

// ------------------------------------------------------------------------------------------------ append-only gebeurtenissen
/** De ENIGE schrijfweg naar afstemming_gebeurtenissen_v1 (append-only): db.add, nooit update of delete. */
export async function schrijfGebeurtenis(userId: string, kaartId: string, soort: GebeurtenisSoort, actor: Actor, bron: string, payload: Record<string, unknown>, correlatieId?: string): Promise<void> {
  const rec: GebeurtenisRecord = { ownerUserId: userId, kaartId, soort, actor, bron, payload, op: nuIso(), ...(correlatieId ? { correlatieId } : {}) };
  await db.add(GEBEURTENISSEN, [rec as unknown as Record<string, unknown>]);
}

// ------------------------------------------------------------------------------------------------ kaart bijwerken (versie++)
/** Kaartrecord volledig vervangen MET versieverhoging en bijgewerktOp — de enige nette mutatieweg (ook voor tellerwerk van B). */
export async function kaartBijwerken(userId: string, kaart: MetId<KaartRecord>, patch: Partial<KaartRecord>): Promise<MetId<KaartRecord>> {
  const { id, ...rest } = kaart;
  const record: KaartRecord = { ...rest, ...patch, ownerUserId: userId, versie: (Number(kaart.versie) || 0) + 1, bijgewerktOp: nuIso() };
  const [ok] = await db.update(KAARTEN, [{ id, record: record as unknown as Record<string, unknown> }]);
  if (!ok) throw new Error('AFSTEMMING_OPSLAAN_MISLUKT');
  return { ...record, id };
}

// ------------------------------------------------------------------------------------------------ kaart + eerste revisie maken
export type NieuweKaartInvoer = {
  externId: string; titel: Tweetekst; samenvatting: Tweetekst; bedoeling: string; verwachtGedrag: string;
  criteria: Criterium[]; dienst: string; categorie: string; prioriteit: Kaart['prioriteit'];
  bronSoort: Kaart['bronSoort']; provenance: string; actor: Actor;
  levensfase?: Levensfase; gezondheid?: Gezondheid; legacy?: Kaart['legacy']; idempotentie?: string;
};
export const inhoudHashVan = (v: { titel: Tweetekst; samenvatting: Tweetekst; bedoeling: string; verwachtGedrag: string; criteria: Criterium[]; dienst: string; categorie: string; prioriteit: string }): string =>
  sha256Hex(JSON.stringify([v.titel, v.samenvatting, v.bedoeling, v.verwachtGedrag, v.criteria.map((c) => [c.id, afstemmingTekst(c.tekst, 'uk'), c.verificatie]), v.dienst, v.categorie, v.prioriteit]));

export async function nieuweKaartMetRevisie(userId: string, invoer: NieuweKaartInvoer, gebeurtenis: GebeurtenisSoort = 'voorgesteld'): Promise<{ kaart: MetId<KaartRecord>; revisie: MetId<RevisieRecord> }> {
  const nu = nuIso();
  // Kaart en revisie verwijzen naar elkaar; db.add kiest zelf id's, dus in drie nette stappen (met audit van de db-laag):
  // 1) kaart zonder revisieId, 2) revisie mét kaartId, 3) kaart bijgewerkt met de revisieId. Versie blijft 1 — dit is creatie.
  const kaart: KaartRecord = {
    ownerUserId: userId, externId: invoer.externId,
    levensfase: invoer.levensfase ?? 'draft', gezondheid: invoer.gezondheid ?? 'unknown',
    revisieId: '', revisieNummer: 1,
    titel: invoer.titel, samenvatting: invoer.samenvatting, dienst: invoer.dienst, categorie: invoer.categorie, prioriteit: invoer.prioriteit,
    criteriaTotaal: invoer.criteria.length, criteriaGeslaagd: 0,
    koppelingen: 0, bewijs: 0, openConflicten: 0,
    bronSoort: invoer.bronSoort, provenance: invoer.provenance,
    ...(invoer.legacy ? { legacy: invoer.legacy } : {}), ...(invoer.idempotentie ? { idempotentie: invoer.idempotentie } : {}),
    aangemaaktOp: nu, bijgewerktOp: nu, versie: 1,
  };
  const [kaartId] = await db.add(KAARTEN, [kaart as unknown as Record<string, unknown>]);
  if (!kaartId) throw new Error('AFSTEMMING_OPSLAAN_MISLUKT');
  const revisie: RevisieRecord = {
    ownerUserId: userId, kaartId, ouderId: null, nummer: 1,
    titel: invoer.titel, samenvatting: invoer.samenvatting, bedoeling: invoer.bedoeling, verwachtGedrag: invoer.verwachtGedrag,
    criteria: invoer.criteria, dienst: invoer.dienst, categorie: invoer.categorie, prioriteit: invoer.prioriteit,
    gemaaktDoor: invoer.actor, gemaaktOp: nu, inhoudHash: inhoudHashVan(invoer),
  };
  const [revisieId] = await db.add(REVISIES, [revisie as unknown as Record<string, unknown>]);
  if (!revisieId) throw new Error('AFSTEMMING_OPSLAAN_MISLUKT');
  const metRevisie: KaartRecord = { ...kaart, revisieId };
  const [ok] = await db.update(KAARTEN, [{ id: kaartId, record: metRevisie as unknown as Record<string, unknown> }]);
  if (!ok) throw new Error('AFSTEMMING_OPSLAAN_MISLUKT');
  await schrijfGebeurtenis(userId, kaartId, gebeurtenis, invoer.actor, invoer.bronSoort, { externId: invoer.externId, titel: invoer.titel[0] });
  return { kaart: { ...metRevisie, id: kaartId }, revisie: { ...revisie, id: revisieId } };
}

/** Vrij volgend KRT-nummer (KRT-001, …) — puur op wat er al is; botsingen vangt de unieke externId-controle in de route. */
export function volgendKrtNummer(bestaand: ReadonlyArray<{ externId?: string }>): string {
  let hoogste = 0;
  for (const k of bestaand) { const m = /^KRT-(\d{1,6})$/.exec(str(k.externId)); if (m) hoogste = Math.max(hoogste, Number(m[1])); }
  return `KRT-${String(hoogste + 1).padStart(3, '0')}`;
}

// ------------------------------------------------------------------------------------------------ legacy-seed (25 claims)
const LEGACY_HASH = 'legacy-waarheid-matrix-26-10-2026';
/** Gezondheid uit de oude classificatie — bewust ZONDER verhoging: «confirmed» zonder qa/ogen blijft onbekend. */
export function legacyGezondheid(classificatie: string, bewijslaag: readonly string[]): Gezondheid {
  switch (classificatie) {
    case 'confirmed_in_canonical': return bewijslaag.includes('automated_qa') || bewijslaag.includes('owner_browser_verified') ? 'working' : 'unknown';
    case 'partial': return 'partially_working';
    case 'missing': return 'not_implemented';
    case 'present_only_in_archive': return 'not_implemented';
    case 'regressed': return 'regressed';
    case 'deprecated': return 'obsolete';
    default: return 'unknown';
  }
}
/** Eénmalige, idempotente migratie van de 25 claims naar legacy-kaarten (markering in afstemming_import_v1). */
// Twee gelijktijdige eerste aanroepen (overzicht + kaarten op dezelfde paginalading) mogen de seed niet verdubbelen:
// één belofte per gebruiker in dit proces; de marker in de databank blijft de waarheid tussen processen.
const seedBezig = new Map<string, Promise<void>>();
export function zorgLegacySeed(userId: string): Promise<void> {
  const lopend = seedBezig.get(userId);
  if (lopend) return lopend;
  const p = zorgLegacySeedEcht(userId).finally(() => seedBezig.delete(userId));
  seedBezig.set(userId, p);
  return p;
}
async function zorgLegacySeedEcht(userId: string): Promise<void> {
  const al = await alleRecords<ImportRecord>(IMPORTS, { ownerUserId: userId, invoerHash: LEGACY_HASH });
  if (al.length > 0) return;
  // Markering EERST (idempotentie ook bij een crash halverwege: liever één onvolledige seed die de mens ziet, dan dubbels).
  await db.add(IMPORTS, [{ ownerUserId: userId, invoerHash: LEGACY_HASH, kaartId: '', op: nuIso() } as unknown as Record<string, unknown>]);
  const actor: Actor = { soort: 'systeem', id: 'legacy-import', naam: 'Матриця 26.10.2026' };
  for (const c of WAARHEID_CLAIMS) {
    await nieuweKaartMetRevisie(userId, {
      externId: c.claim_id,
      titel: naarTweetekst([c.claimed_behavior.uk, c.claimed_behavior.nl], LIMIET.titelMax),
      samenvatting: naarTweetekst([c.actual_state_in_canonical.uk, c.actual_state_in_canonical.nl], LIMIET.samenvattingMax),
      bedoeling: `${c.source_document} · ${c.claimed_version_or_slice}`.slice(0, LIMIET.tekstMax),
      verwachtGedrag: c.claimed_behavior.uk.slice(0, LIMIET.tekstMax),
      criteria: [], dienst: c.affected_service, categorie: 'legacy-matrix', prioriteit: 'P2',
      bronSoort: 'legacy', provenance: 'waarheid-matrix-26.10.2026', actor,
      levensfase: 'approved', gezondheid: legacyGezondheid(c.classification, c.evidence_layer),
      legacy: { claimId: c.claim_id, bewijslaag: [...c.evidence_layer], classificatie: c.classification },
    }, 'import');
  }
}
