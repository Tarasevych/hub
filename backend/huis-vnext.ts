// Huis vNext (28.10.2026, migratie 0128): opslag en routes van huis.tarasevych.com — Huis Core.
//
// DE POORT. Elke route: goedgekeurd account, dienst huis/hub, en daarna de WONING: alleen wie lid is (app.huis_leden) ziet haar;
// RLS (alsGebruiker) bewaakt hetzelfde nog eens in de database. Rollen: eigenaar/lid mogen opdrachten geven, gast/ondersteuning
// alleen lezen, installateur tot `geldig_tot`.
// DE WAARHEID. Toestanden komen alleen uit een integratie (nu: Home Assistant). Geen integratie = geen apparaten = eerlijke lege
// pagina. Elke toestand draagt waargenomen_op/ontvangen_op/kwaliteit; versheid rekent de browser uit (shared/huis-model.ts).
// DE OPDRACHT. verzocht → aanvaard → verzonden → bevestigd → waargenomen → voltooid, of geweigerd/mislukt/verlopen/offline. Alleen
// de WAARNEMING van de gewenste toestand (komtOvereen) maakt haar voltooid. Idempotentiesleutel per woning. Kritieke mogelijkheden
// (slot, alarm, rook/gas, sirene): nooit via scène/automatisering/AI; een mens alleen met step-up (deps.stepUp) én schrijftoestemming.
// HET GEHEIM. Het HA-token staat als AES-256-GCM-envelop in de rij (server/platform/beveiliging.ts), AAD = woning + integratie;
// het verlaat de server nooit en komt nooit in een antwoord, log of gebeurtenis.
// HET NETWERK (SEC-002, 12.11.2026). De bron is een server van de GEBRUIKER: traag, kapot of kwaadwillig is mogelijk. Daarom:
//   • geen enkele aanroep naar de bron gebeurt binnen een databanktransactie (kort lezen → netwerk → kort schrijven); vroeger
//     hield elke aanroep tot 33 s een verbinding uit de pool van tien vast en legde één account zo de site plat;
//   • een opdracht staat als 'aanvaard' VAST (COMMIT) vóór ze verstuurd wordt: de idempotentiesleutel overleeft elke fout daarna;
//   • hoogstens twee gelijktijdige aanroepen per woning en drie per gebruiker (haBeurt), en een tempolimiet per gebruiker op de
//     routes die de bron aanroepen (HUIS_TEMPO).
// DE LEDEN (SEC-002, migratie 0212). Lid wordt men alleen door zelf een uitnodiging te aanvaarden; «toevoegen» antwoordt voor
// elk adres hetzelfde.
import { randomUUID } from 'node:crypto';
import { db, error, isOwnerEmail, json, rateLimit } from '../server/platform';
import { alsSysteem, isAlleenLezen } from '../server/platform/context';
import { envSleutelBeschikbaar, openWithEnvKey, sealWithEnvKey } from '../server/platform/beveiliging';
import { auditToevoegen } from '../server/platform/audit';
import { jsonbTekst, knipTekst, tekstVeilig } from '../server/platform/json-veilig';
import { isEmailAdres } from '../shared/adres-controle';
import type { RouterMiddleware } from '../server/platform/router';
import { alsGebruiker } from './ai-toestemmingen';
import { denyMutation } from './rbac';
import { meld } from './melder';
import { haDienstVoor, haGeschiedenis, haLezen, haOntdekken, haStuur, haVerbinden, komtOvereen, parseVertrouwdToestel, veiligAdres, vertrouwdeToestellenUitEnv, zetVertrouwdeToestellenBron, type OntdektApparaat } from './huis-adapter-thuis-assistent';
import {
  HUIS_ROLLEN_UITNODIGBAAR, HUIS_ROL_LABEL, HUIS_UITLEG, HUIS_UITNODIGING,
  KRITIEKE_SOORTEN, MAX_RUIMTES, MAX_WONINGEN, OPDRACHT_DEADLINE_MS, OPDRACHT_EIND, droogloop, geldigeTijdzone, magOvergang, schoneOpdrachtWaarde, schoneRegel, schoneScene,
  type Apparaat, type Automatisering, type Gebeurtenis, type Integratie, type Lid, type Mogelijkheid, type MogelijkheidSoort, type Opdracht, type OpdrachtStand, type Ruimte, type Scene, type Toestand, type Uitnodiging, type UitnodigingVoorMij, type Voorstel, type Waarnemingen, type Woning,
} from '../shared/huis-model';

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string; accessLevel?: string }; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
export type HuisDeps = { stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> };

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');
const isoOfNull = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const bodyOf = (b: unknown) => (b || {}) as Record<string, unknown>;
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const tabelOntbreekt = (err: unknown) => Boolean(err && typeof err === 'object' && (err as { code?: string }).code === '42P01');
/* SEC-002 (g10b #2, afwerking A): eigen sleutel in ELKE versie (_V1…_V9), niet alleen _V1 — anders viel een installatie met alleen _V2 stil terug op de TOTP-sleutel. */const SLEUTEL = () => (envSleutelBeschikbaar('HUIS_ADAPTER_SLEUTEL_V1') ? 'HUIS_ADAPTER_SLEUTEL_V1' : 'TOTP_ENCRYPTION_KEY_V1');
const aad = (woningId: string, integratieId: string) => `huis-integratie\0${woningId}\0${integratieId}`;
export const HUIS_LIMIETEN = Object.freeze({ gebeurtenissen: 200, apparaten: 2000, geschiedenisUren: 168 });

// ---------------------------------------------------------------- grenzen op het verkeer naar de bron (SEC-002, integraties-05)
/** Gelijktijdigheid naar de bron en het aantal bronnen per woning. `wachtMs`: zo lang wacht een aanroep op een beurt. */
export const HUIS_HA_GRENZEN = Object.freeze({ perWoning: 2, perGebruiker: 3, wachtMs: 3000, integratiesPerWoning: 5, geschiedenisEntiteiten: 200 });
/**
 * Tempo per gebruiker: [aantal, venster in seconden, dicht bij een databankstoring]. Alleen routes die de bron aanroepen (of
 * uitnodigen); gewoon lezen uit de eigen databank heeft geen extra grens. Ruim genoeg voor gewoon gebruik: de pagina poolt een
 * lopende opdracht om de 1,5 s (ha-lezen) en een schuifregelaar stuurt hoogstens twee opdrachten per seconde (ha-opdracht).
 */
export const HUIS_TEMPO = Object.freeze({
  'ha-lezen': [600, 600, false],      // opdracht nalezen (de ACK)
  'ha-energie': [30, 600, false],     // geschiedenis: tot 6 MB per bron
  'ha-beheer': [30, 600, true],       // instellen, ontdekken, importeren, synchroniseren
  'ha-opdracht': [240, 600, true],    // opdracht geven, voorstel goedkeuren
  'ha-scene': [20, 600, true],        // een scène = tot 40 opdrachten
  uitnodigen: [HUIS_UITNODIGING.perUur, 3600, true],
} as const);
let haWachtMs: number = HUIS_HA_GRENZEN.wachtMs;
/** Alleen voor eenheidstests: de wachttijd op een beurt (null = standaard). */
export function _zetHaWachtMs(ms: number | null): void { haWachtMs = ms ?? HUIS_HA_GRENZEN.wachtMs; }
const haLopend = new Map<string, number>();
const BEZET = Object.freeze({ ok: false as const, fout: 'HUIS_BEZET' as const });
/**
 * Eén aanroep naar de bron van een woning, NOOIT binnen een transactie. Hoogstens twee tegelijk per woning en drie per gebruiker
 * (het opzoeken van een naam bezet een draad van de gedeelde draadpool van Node — één account mag die nooit alleen vullen);
 * wie binnen `wachtMs` geen beurt krijgt, krijgt BEZET terug en er gaat niets naar de bron. De grens treft alleen de woning (en de
 * gebruiker) zelf: een trage bron vertraagt zo nooit het verkeer van andere woningen.
 */
async function haBeurt<T>(userId: string, woningId: string, fn: () => Promise<T>): Promise<T | typeof BEZET> {
  const grenzen: Array<[string, number]> = [[`w:${woningId}`, HUIS_HA_GRENZEN.perWoning], [`u:${userId}`, HUIS_HA_GRENZEN.perGebruiker]];
  const vol = () => grenzen.some(([k, max]) => (haLopend.get(k) ?? 0) >= max);
  const tot = Date.now() + haWachtMs;
  while (vol()) { if (Date.now() >= tot) return BEZET; await new Promise((r) => setTimeout(r, 25)); }
  for (const [k] of grenzen) haLopend.set(k, (haLopend.get(k) ?? 0) + 1);
  try { return await fn(); }
  finally { for (const [k] of grenzen) { const n = (haLopend.get(k) ?? 1) - 1; if (n <= 0) haLopend.delete(k); else haLopend.set(k, n); } }
}

// ---------------------------------------------------------------- vormen
const woningUit = (r: any, userId: string): Woning => ({ id: String(r.id), naam: r.naam, tijdzone: r.tijdzone, taal: r.taal, verdiepingen: Array.isArray(r.verdiepingen) ? r.verdiepingen : [], eigenaar: r.user_id === userId, rol: r.rol || (r.user_id === userId ? 'eigenaar' : 'lid'), aangemaaktOp: iso(r.created_at) });
const ruimteUit = (r: any): Ruimte => ({ id: String(r.id), woningId: String(r.woning_id), verdieping: r.verdieping, naam: r.naam, soort: r.soort, geometrie: { x: Number(r.geometrie?.x ?? 0), y: Number(r.geometrie?.y ?? 0), w: Number(r.geometrie?.w ?? 4), h: Number(r.geometrie?.h ?? 3) }, volgorde: Number(r.volgorde) });
const integratieUit = (r: any): Integratie => ({ id: String(r.id), woningId: String(r.woning_id), soort: r.soort, naam: r.naam, adres: r.adres, stand: r.stand, schrijven: Boolean(r.schrijven), laatsteSync: isoOfNull(r.laatste_sync), hartslag: isoOfNull(r.hartslag), fout: r.fout || '', info: r.info && typeof r.info === 'object' ? r.info : {} });
const toestandUit = (r: any): Toestand => ({ kenmerk: r.kenmerk, waarde: r.waarde, eenheid: r.eenheid || '', waargenomenOp: isoOfNull(r.waargenomen_op), ontvangenOp: iso(r.ontvangen_op), kwaliteit: r.kwaliteit });
const apparaatUit = (r: any, toestanden: Toestand[] = []): Apparaat => ({ id: String(r.id), woningId: String(r.woning_id), integratieId: r.integratie_id ? String(r.integratie_id) : null, bronId: r.bron_id, naam: r.naam, soort: r.soort, fabrikant: r.fabrikant || '', model: r.model || '', firmware: r.firmware || '', ruimteId: r.ruimte_id ? String(r.ruimte_id) : null, mogelijkheden: Array.isArray(r.mogelijkheden) ? r.mogelijkheden : [], kritiek: Boolean(r.kritiek), online: r.online === null || r.online === undefined ? null : Boolean(r.online), laatstGezien: isoOfNull(r.laatst_gezien), verborgen: Boolean(r.verborgen), toestanden });
const opdrachtUit = (r: any): Opdracht => ({ id: String(r.id), woningId: String(r.woning_id), via: r.via, apparaatId: r.apparaat_id ? String(r.apparaat_id) : null, mogelijkheid: r.mogelijkheid, verzocht: r.verzocht || {}, idempotentie: r.idempotentie, correlatie: r.correlatie || '', stand: r.stand, beleid: r.beleid || {}, fout: r.fout || '', uitkomst: r.uitkomst || {}, deadline: isoOfNull(r.deadline), aangemaaktOp: iso(r.created_at), bijgewerktOp: iso(r.updated_at) });
const sceneUit = (r: any): Scene => ({ id: String(r.id), woningId: String(r.woning_id), naam: r.naam, icoon: r.icoon, favoriet: Boolean(r.favoriet), stappen: Array.isArray(r.stappen) ? r.stappen : [], laatsteRun: r.laatste_run || {}, aangemaaktOp: iso(r.created_at) });
const automatiseringUit = (r: any): Automatisering => ({ id: String(r.id), woningId: String(r.woning_id), naam: r.naam, regel: r.regel, stand: r.stand, versie: Number(r.versie), laatsteRun: r.laatste_run || {}, aangemaaktOp: iso(r.created_at), bijgewerktOp: iso(r.updated_at) });
const gebeurtenisUit = (r: any): Gebeurtenis => ({ id: String(r.id), bron: r.bron, soort: r.soort, ernst: r.ernst, apparaatId: r.apparaat_id ? String(r.apparaat_id) : null, opdrachtId: r.opdracht_id ? String(r.opdracht_id) : null, bericht: r.bericht, gegevens: r.gegevens || {}, bronTijd: isoOfNull(r.bron_tijd), ontvangenOp: iso(r.ontvangen_op), correlatie: r.correlatie || '' });
const voorstelUit = (r: any): Voorstel => ({ id: String(r.id), door: r.door, samenvatting: r.samenvatting, opdracht: r.opdracht || {}, stand: r.stand, verlooptOp: iso(r.verloopt_op), besluitOp: isoOfNull(r.besluit_op), opdrachtId: r.opdracht_id ? String(r.opdracht_id) : null, aangemaaktOp: iso(r.created_at) });

// ---------------------------------------------------------------- woning en lidmaatschap
export type { Lid };
async function lidVan(q: Q, userId: string, woningId: string): Promise<Lid | null> {
  const { rows } = await q(`SELECT w.user_id AS eigenaar_id, l.rol, l.geldig_tot FROM app.huis_woningen w JOIN app.huis_leden l ON l.woning_id = w.id AND l.user_id = $1 WHERE w.id::text = $2`, [userId, woningId]);
  const r = rows[0]; if (!r) return null;
  if (r.geldig_tot && new Date(r.geldig_tot).getTime() < Date.now()) return null;
  const eigenaar = r.eigenaar_id === userId;
  return { woningId, userId, rol: eigenaar ? 'eigenaar' : r.rol, eigenaar, magSchrijven: eigenaar || r.rol === 'lid' || r.rol === 'installateur' };
}
async function gebeurtenis(q: Q, woningId: string, g: { bron?: string; soort: string; ernst?: 'info' | 'belangrijk' | 'kritiek'; apparaatId?: string | null; opdrachtId?: string | null; bericht: string; gegevens?: Record<string, unknown>; bronTijd?: string | null; correlatie?: string }) {
  await q(`INSERT INTO app.huis_gebeurtenissen (woning_id, bron, soort, ernst, apparaat_id, opdracht_id, bericht, gegevens, bron_tijd, correlatie) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
    [woningId, g.bron || 'site', g.soort, g.ernst || 'info', g.apparaatId ?? null, g.opdrachtId ?? null, knipTekst(g.bericht, 500), jsonbTekst(g.gegevens ?? {}), g.bronTijd ?? null, (g.correlatie || '').slice(0, 80)]);
  await q(`DELETE FROM app.huis_gebeurtenissen WHERE woning_id = $1 AND id < (SELECT id FROM app.huis_gebeurtenissen WHERE woning_id = $1 ORDER BY id DESC OFFSET 5000 LIMIT 1)`, [woningId]).catch(() => undefined);
}

export async function woningenLijst(userId: string): Promise<Woning[]> {
  return alsGebruiker(userId, async (q) => (await q(`SELECT w.*, l.rol FROM app.huis_woningen w JOIN app.huis_leden l ON l.woning_id = w.id AND l.user_id = $1 WHERE l.geldig_tot IS NULL OR l.geldig_tot > now() ORDER BY w.created_at`, [userId])).rows.map((r) => woningUit(r, userId)));
}
export async function woningMaken(userId: string, naam: string, tijdzone = 'Europe/Brussels', taal: 'uk' | 'nl' = 'uk'): Promise<Woning | { fout: string }> {
  const schoon = naam.replace(/\s+/g, ' ').trim(); if (!schoon || schoon.length > 80) return { fout: 'NAAM_ONGELDIG' };
  if (!geldigeTijdzone(tijdzone)) return { fout: 'TIJDZONE_ONGELDIG' };
  return alsGebruiker(userId, async (q) => {
    const n = Number((await q(`SELECT count(*)::int AS n FROM app.huis_woningen WHERE user_id = $1`, [userId])).rows[0].n);
    if (n >= MAX_WONINGEN) return { fout: 'TE_VEEL_WONINGEN' };
    const { rows } = await q(`INSERT INTO app.huis_woningen (user_id, naam, tijdzone, taal) VALUES ($1,$2,$3,$4) RETURNING *`, [userId, schoon, tijdzone, taal]);
    await q(`INSERT INTO app.huis_leden (woning_id, user_id, rol) VALUES ($1,$2,'eigenaar')`, [rows[0].id, userId]);
    await gebeurtenis(q, String(rows[0].id), { soort: 'woning', bericht: `Woning «${schoon}» aangemaakt` });
    return woningUit({ ...rows[0], rol: 'eigenaar' }, userId);
  });
}

// ---------------------------------------------------------------- lezen: overzicht, ruimtes, apparaten
async function apparatenMetToestand(q: Q, woningId: string, waar = '', params: unknown[] = []): Promise<Apparaat[]> {
  const rijen = (await q(`SELECT * FROM app.huis_apparaten WHERE woning_id = $1 AND verborgen = false ${waar} ORDER BY naam LIMIT ${HUIS_LIMIETEN.apparaten}`, [woningId, ...params])).rows;
  if (!rijen.length) return [];
  const ids = rijen.map((r) => r.id);
  const toest = (await q(`SELECT * FROM app.huis_toestanden WHERE apparaat_id = ANY($1::uuid[])`, [ids])).rows;
  const per = new Map<string, Toestand[]>();
  for (const t of toest) { const k = String(t.apparaat_id); if (!per.has(k)) per.set(k, []); per.get(k)!.push(toestandUit(t)); }
  return rijen.map((r) => apparaatUit(r, per.get(String(r.id)) ?? []));
}
export async function overzicht(userId: string, woningId: string) {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid) return null;
    const woning = woningUit({ ...(await q(`SELECT * FROM app.huis_woningen WHERE id::text = $1`, [woningId])).rows[0], rol: lid.rol }, userId);
    const ruimtes = (await q(`SELECT * FROM app.huis_ruimtes WHERE woning_id = $1 ORDER BY verdieping, volgorde, naam`, [woningId])).rows.map(ruimteUit);
    const integraties = (await q(`SELECT * FROM app.huis_integraties WHERE woning_id = $1 ORDER BY created_at`, [woningId])).rows.map(integratieUit);
    const apparaten = await apparatenMetToestand(q, woningId);
    const scenes = (await q(`SELECT * FROM app.huis_scenes WHERE woning_id = $1 ORDER BY favoriet DESC, naam LIMIT 12`, [woningId])).rows.map(sceneUit);
    const gebeurtenissen = (await q(`SELECT * FROM app.huis_gebeurtenissen WHERE woning_id = $1 ORDER BY id DESC LIMIT 5`, [woningId])).rows.map(gebeurtenisUit);
    const openOpdrachten = (await q(`SELECT * FROM app.huis_opdrachten WHERE woning_id = $1 AND stand NOT IN ('voltooid','geweigerd','verlopen','mislukt','gedeeltelijk','offline') ORDER BY created_at DESC LIMIT 20`, [woningId])).rows.map(opdrachtUit);
    const voorstellen = Number((await q(`SELECT count(*)::int AS n FROM app.huis_voorstellen WHERE woning_id = $1 AND stand = 'wacht' AND verloopt_op > now()`, [woningId])).rows[0].n);
    return { woning, lid, ruimtes, integraties, apparaten, scenes, gebeurtenissen, openOpdrachten, voorstellenWacht: voorstellen };
  });
}
export async function ruimteMaken(userId: string, woningId: string, v: { naam: string; verdieping?: string; soort?: string; geometrie?: unknown }) {
  const naam = String(v.naam ?? '').replace(/\s+/g, ' ').trim(); if (!naam || naam.length > 60) return { fout: 'NAAM_ONGELDIG' as const };
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.magSchrijven) return { fout: 'GEEN_TOEGANG' as const };
    const n = Number((await q(`SELECT count(*)::int AS n FROM app.huis_ruimtes WHERE woning_id = $1`, [woningId])).rows[0].n); if (n >= MAX_RUIMTES) return { fout: 'TE_VEEL_RUIMTES' as const };
    const { rows } = await q(`INSERT INTO app.huis_ruimtes (woning_id, verdieping, naam, soort, geometrie, volgorde) VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`, [woningId, String(v.verdieping || '0').slice(0, 20), naam, String(v.soort || 'kamer').slice(0, 30), JSON.stringify(schoneGeometrie(v.geometrie, n)), n]);
    return ruimteUit(rows[0]);
  });
}
function schoneGeometrie(raw: unknown, volgorde = 0) {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown, d: number, min: number, max: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : d; };
  return { x: n(r.x, (volgorde % 4) * 5, 0, 60), y: n(r.y, Math.floor(volgorde / 4) * 4, 0, 60), w: n(r.w, 4, 1, 20), h: n(r.h, 3, 1, 20) };
}
export async function ruimteWijzigen(userId: string, woningId: string, id: string, v: { naam?: string; verdieping?: string; soort?: string; geometrie?: unknown }) {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.magSchrijven) return { fout: 'GEEN_TOEGANG' as const };
    const cur = (await q(`SELECT * FROM app.huis_ruimtes WHERE id::text = $2 AND woning_id = $1`, [woningId, id])).rows[0]; if (!cur) return { fout: 'NIET_GEVONDEN' as const };
    const naam = v.naam === undefined ? cur.naam : String(v.naam).replace(/\s+/g, ' ').trim(); if (!naam || naam.length > 60) return { fout: 'NAAM_ONGELDIG' as const };
    const { rows } = await q(`UPDATE app.huis_ruimtes SET naam = $3, verdieping = $4, soort = $5, geometrie = $6::jsonb, updated_at = now() WHERE id::text = $2 AND woning_id = $1 RETURNING *`,
      [woningId, id, naam, String(v.verdieping ?? cur.verdieping).slice(0, 20), String(v.soort ?? cur.soort).slice(0, 30), JSON.stringify(v.geometrie === undefined ? cur.geometrie : schoneGeometrie(v.geometrie))]);
    return ruimteUit(rows[0]);
  });
}
export async function ruimteVerwijderen(userId: string, woningId: string, id: string) {
  return alsGebruiker(userId, async (q) => { const lid = await lidVan(q, userId, woningId); if (!lid || !lid.magSchrijven) return false; return (await q(`DELETE FROM app.huis_ruimtes WHERE id::text = $2 AND woning_id = $1 RETURNING id`, [woningId, id])).rows.length > 0; });
}
export async function apparaatWijzigen(userId: string, woningId: string, id: string, v: { naam?: string; ruimteId?: string | null; verborgen?: boolean }) {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.magSchrijven) return { fout: 'GEEN_TOEGANG' as const };
    const cur = (await q(`SELECT * FROM app.huis_apparaten WHERE id::text = $2 AND woning_id = $1`, [woningId, id])).rows[0]; if (!cur) return { fout: 'NIET_GEVONDEN' as const };
    if (v.ruimteId && !(await q(`SELECT 1 FROM app.huis_ruimtes WHERE id::text = $2 AND woning_id = $1`, [woningId, v.ruimteId])).rows.length) return { fout: 'RUIMTE_ONBEKEND' as const };
    const naam = v.naam === undefined ? cur.naam : String(v.naam).replace(/\s+/g, ' ').trim().slice(0, 120) || cur.naam;
    const { rows } = await q(`UPDATE app.huis_apparaten SET naam = $3, ruimte_id = $4, verborgen = $5, updated_at = now() WHERE id::text = $2 AND woning_id = $1 RETURNING *`, [woningId, id, naam, v.ruimteId === undefined ? cur.ruimte_id : v.ruimteId, v.verborgen ?? cur.verborgen]);
    return apparaatUit(rows[0], (await q(`SELECT * FROM app.huis_toestanden WHERE apparaat_id = $1`, [id])).rows.map(toestandUit));
  });
}

// ---------------------------------------------------------------- integratie Home Assistant
async function integratieMetGeheim(q: Q, woningId: string, integratieId: string): Promise<{ rij: any; token: string } | null> {
  const rij = (await q(`SELECT * FROM app.huis_integraties WHERE id::text = $2 AND woning_id = $1`, [woningId, integratieId])).rows[0];
  if (!rij) return null;
  try { return { rij, token: rij.geheim ? openWithEnvKey(SLEUTEL(), rij.geheim, aad(woningId, String(rij.id))) : '' }; } catch { return { rij, token: '' }; }
}
async function toestandenOpslaan(q: Q, woningId: string, apparaatId: string, toestanden: OntdektApparaat['toestanden']) {
  for (const t of toestanden) {
    await q(`INSERT INTO app.huis_toestanden (apparaat_id, woning_id, kenmerk, waarde, eenheid, waargenomen_op, ontvangen_op, kwaliteit, versie) VALUES ($1,$2,$3,$4::jsonb,$5,$6,now(),$7,1)
             ON CONFLICT (apparaat_id, kenmerk) DO UPDATE SET waarde = EXCLUDED.waarde, eenheid = EXCLUDED.eenheid, waargenomen_op = EXCLUDED.waargenomen_op, ontvangen_op = now(), kwaliteit = EXCLUDED.kwaliteit, versie = app.huis_toestanden.versie + 1`,
      [apparaatId, woningId, t.kenmerk, jsonbTekst(t.waarde ?? null), t.eenheid, t.waargenomenOp, t.kwaliteit]); // jsonbTekst: tweede vangnet na tekst() in de adapter
  }
}
/**
 * Fase 1 van elke aanroep naar de bron — één korte transactie: mag deze gebruiker dit, bestaat de integratie, en het ontsleutelde
 * token. Daarna is de databankverbinding weer vrij; het netwerk komt pas daarna (SEC-002).
 */
async function integratieVoorAanroep(userId: string, woningId: string, integratieId: string, eis: 'eigenaar' | 'lid'): Promise<{ fout: 'ALLEEN_EIGENAAR' | 'GEEN_TOEGANG' | 'NIET_GEVONDEN' } | { adres: string; token: string; bekend: Set<string> }> {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId);
    if (eis === 'eigenaar' ? !lid?.eigenaar : !lid) return { fout: eis === 'eigenaar' ? 'ALLEEN_EIGENAAR' as const : 'GEEN_TOEGANG' as const };
    const i = await integratieMetGeheim(q, woningId, integratieId); if (!i) return { fout: 'NIET_GEVONDEN' as const };
    // SEC-002 (na de toetsing): de bron-id's die de woning al heeft — die vallen nooit onder de grens van haOntdekken.
    const bekend = new Set((await q(`SELECT bron_id FROM app.huis_apparaten WHERE woning_id = $1 AND integratie_id = $2`, [woningId, integratieId])).rows.map((x) => String(x.bron_id)));
    return { adres: String(i.rij.adres), token: i.token, bekend };
  });
}
/** Fase 3 begint met dezelfde vragen opnieuw: tijdens het netwerk kan het lidmaatschap ingetrokken of de integratie losgekoppeld zijn. */
async function nogGeldig(q: Q, userId: string, woningId: string, integratieId: string, eis: 'eigenaar' | 'lid'): Promise<'ALLEEN_EIGENAAR' | 'GEEN_TOEGANG' | 'NIET_GEVONDEN' | null> {
  const lid = await lidVan(q, userId, woningId);
  if (eis === 'eigenaar' ? !lid?.eigenaar : !lid) return eis === 'eigenaar' ? 'ALLEEN_EIGENAAR' : 'GEEN_TOEGANG';
  return (await q(`SELECT 1 FROM app.huis_integraties WHERE id::text = $2 AND woning_id = $1`, [woningId, integratieId])).rows.length ? null : 'NIET_GEVONDEN';
}
/** Stap 1 van de wizard: adres + token controleren en de integratie opslaan (token versleuteld). Nog geen apparaten. */
export async function integratieInstellen(userId: string, woningId: string, v: { adres: string; token: string; naam?: string }) {
  const adres = veiligAdres(v.adres); if (!adres.ok) return { fout: adres.fout };
  const token = String(v.token ?? '').trim(); if (token.length < 20 || token.length > 4000 || /\s/.test(token)) return { fout: 'TOKEN_ONGELDIG' as const };
  const magInstellen = async (q: Q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar) return 'ALLEEN_EIGENAAR' as const;
    const n = Number((await q(`SELECT count(*)::int AS n FROM app.huis_integraties WHERE woning_id = $1`, [woningId])).rows[0].n);
    return n >= HUIS_HA_GRENZEN.integratiesPerWoning ? 'TE_VEEL_INTEGRATIES' as const : null;
  };
  const vooraf = await alsGebruiker(userId, magInstellen);
  if (vooraf) return { fout: vooraf };
  const proef = await haBeurt(userId, woningId, () => haVerbinden(adres.adres, token)); // netwerk: geen databankverbinding in gebruik
  return alsGebruiker(userId, async (q) => {
    const weiger = await magInstellen(q); if (weiger) return { fout: weiger };
    if (!proef.ok) { if (proef.fout !== 'HUIS_BEZET') await gebeurtenis(q, woningId, { soort: 'integratie', ernst: 'belangrijk', bericht: `Home Assistant: verbinding mislukt (${proef.fout})`, gegevens: { adres: adres.adres } }); return { fout: proef.fout }; }
    const id = randomUUID();
    let envelop: string; try { envelop = sealWithEnvKey(SLEUTEL(), token, aad(woningId, id)); } catch { return { fout: 'SLEUTEL_ONTBREEKT' as const }; }
    const { rows } = await q(`INSERT INTO app.huis_integraties (id, woning_id, soort, naam, adres, geheim, stand, hartslag, info) VALUES ($1,$2,'home-assistant',$3,$4,$5,'verbonden',now(),$6::jsonb) RETURNING *`,
      [id, woningId, String(v.naam || 'Home Assistant').slice(0, 80), adres.adres, envelop, jsonbTekst({ versie: proef.versie, locatie: proef.locatie, entiteiten: proef.entiteiten })]);
    await gebeurtenis(q, woningId, { soort: 'integratie', bericht: `Home Assistant ${proef.versie} verbonden (${proef.entiteiten} entiteiten gezien, nog niets geïmporteerd)`, gegevens: { integratieId: id } });
    return integratieUit(rows[0]);
  });
}
/** Stap 2: alleen-lezen ontdekking — wat zou er binnenkomen. Schrijft niets. */
export async function integratieOntdekken(userId: string, woningId: string, integratieId: string) {
  const i = await integratieVoorAanroep(userId, woningId, integratieId, 'eigenaar'); if ('fout' in i) return i;
  const r = await haBeurt(userId, woningId, () => haOntdekken(i.adres, i.token, { altijd: i.bekend }));
  if (!r.ok) return { fout: r.fout };
  return alsGebruiker(userId, async (q) => {
    const weiger = await nogGeldig(q, userId, woningId, integratieId, 'eigenaar'); if (weiger) return { fout: weiger };
    const bestaand = new Set((await q(`SELECT bron_id FROM app.huis_apparaten WHERE woning_id = $1 AND integratie_id = $2`, [woningId, integratieId])).rows.map((x) => String(x.bron_id)));
    // `afgekapt`: zoveel apparaten liet de grens van 2000 weg (eerlijk melden: «getoond: de eerste 2000 in alfabetische volgorde»).
    return { apparaten: r.apparaten.map((a) => ({ ...a, bestaat: bestaand.has(a.bronId) })), overgeslagen: r.overgeslagen, afgekapt: r.afgekapt };
  });
}
/** Stap 3: importeren (upsert op bron_id — nooit dubbelen) van gekozen bron-id's, of alles. */
export async function integratieImporteren(userId: string, woningId: string, integratieId: string, bronIds: string[] | null) {
  const i = await integratieVoorAanroep(userId, woningId, integratieId, 'eigenaar'); if ('fout' in i) return i;
  const keuze = bronIds ? new Set(bronIds) : null;
  // SEC-002 (na de toetsing): wat de woning al heeft en wat uitdrukkelijk gekozen is, valt nooit onder de grens van haOntdekken.
  const r = await haBeurt(userId, woningId, () => haOntdekken(i.adres, i.token, { altijd: keuze ? new Set([...i.bekend, ...keuze]) : i.bekend }));
  if (!r.ok && r.fout === 'HUIS_BEZET') return { fout: r.fout }; // niets gevraagd aan de bron: de integratie is daardoor niet «verzwakt»
  return alsGebruiker(userId, async (q) => {
    const weiger = await nogGeldig(q, userId, woningId, integratieId, 'eigenaar'); if (weiger) return { fout: weiger };
    if (!r.ok) { await q(`UPDATE app.huis_integraties SET stand = 'verzwakt', fout = $3, updated_at = now() WHERE id::text = $2 AND woning_id = $1`, [woningId, integratieId, r.fout]); return { fout: r.fout }; }
    // De grens van HUIS_LIMIETEN.apparaten geldt voor de WONING (alle bronnen samen): bestaande apparaten worden altijd bijgewerkt,
    // nieuwe alleen zolang er plaats is; de rest telt eerlijk als overgeslagen.
    const hier = new Set((await q(`SELECT bron_id FROM app.huis_apparaten WHERE woning_id = $1 AND integratie_id = $2`, [woningId, integratieId])).rows.map((x) => String(x.bron_id)));
    let totaal = Number((await q(`SELECT count(*)::int AS n FROM app.huis_apparaten WHERE woning_id = $1`, [woningId])).rows[0].n);
    let nieuw = 0, bijgewerkt = 0, overgeslagen = r.overgeslagen;
    // Vaste volgorde (bron-id), dezelfde als bij synchroniseren: twee gelijktijdige verzoeken wachten dan op elkaar in plaats van elkaar te blokkeren.
    for (const a of [...r.apparaten].sort((x, y) => (x.bronId < y.bronId ? -1 : x.bronId > y.bronId ? 1 : 0))) {
      if (keuze && !keuze.has(a.bronId)) continue;
      if (!hier.has(a.bronId) && totaal >= HUIS_LIMIETEN.apparaten) { overgeslagen++; continue; }
      const { rows } = await q(`INSERT INTO app.huis_apparaten (woning_id, integratie_id, bron_id, naam, soort, fabrikant, model, mogelijkheden, kritiek, online, laatst_gezien)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
        ON CONFLICT (woning_id, integratie_id, bron_id) DO UPDATE SET soort = EXCLUDED.soort, mogelijkheden = EXCLUDED.mogelijkheden, kritiek = EXCLUDED.kritiek, online = EXCLUDED.online, laatst_gezien = EXCLUDED.laatst_gezien, updated_at = now()
        RETURNING id, (xmax = 0) AS ingevoegd`, [woningId, integratieId, a.bronId, a.naam, a.soort, a.fabrikant, a.model, jsonbTekst(a.mogelijkheden), a.kritiek, a.online, a.laatstGezien]);
      if (rows[0].ingevoegd) { nieuw++; totaal++; } else bijgewerkt++;
      await toestandenOpslaan(q, woningId, String(rows[0].id), a.toestanden);
    }
    await q(`UPDATE app.huis_integraties SET stand = 'verbonden', fout = '', laatste_sync = now(), hartslag = now(), updated_at = now() WHERE id::text = $2 AND woning_id = $1`, [woningId, integratieId]);
    await gebeurtenis(q, woningId, { bron: 'home-assistant', soort: 'integratie', bericht: `Import: ${nieuw} nieuw, ${bijgewerkt} bijgewerkt, ${overgeslagen} overgeslagen (geen apparaat of boven de grens van ${HUIS_LIMIETEN.apparaten})`, gegevens: { integratieId } });
    return { nieuw, bijgewerkt, overgeslagen };
  });
}
/** Toestanden verversen voor alle geïmporteerde apparaten van de integratie (polling; geen WS in deze release). */
export async function integratieSynchroniseren(userId: string, woningId: string, integratieId: string) {
  const i = await integratieVoorAanroep(userId, woningId, integratieId, 'lid'); if ('fout' in i) return i;
  // SEC-002 (na de toetsing): precies de apparaten die de woning heeft worden vertaald, waar ze ook in het antwoord staan.
  const r = await haBeurt(userId, woningId, () => haOntdekken(i.adres, i.token, { altijd: i.bekend }));
  if (!r.ok && r.fout === 'HUIS_BEZET') return { fout: r.fout };
  return alsGebruiker(userId, async (q) => {
    const weiger = await nogGeldig(q, userId, woningId, integratieId, 'lid'); if (weiger) return { fout: weiger };
    if (!r.ok) { await q(`UPDATE app.huis_integraties SET stand = CASE WHEN $3 = 'TOKEN_GEWEIGERD' THEN 'geweigerd' ELSE 'verzwakt' END, fout = $3, updated_at = now() WHERE id::text = $2 AND woning_id = $1`, [woningId, integratieId, r.fout]); await gebeurtenis(q, woningId, { bron: 'home-assistant', soort: 'integratie', ernst: 'belangrijk', bericht: `Synchronisatie mislukt (${r.fout})` }); return { fout: r.fout }; }
    const per = new Map(r.apparaten.map((a) => [a.bronId, a]));
    const rijen = (await q(`SELECT id, bron_id FROM app.huis_apparaten WHERE woning_id = $1 AND integratie_id = $2 ORDER BY bron_id COLLATE "C"`, [woningId, integratieId])).rows;
    const bekend = new Set(rijen.map((x) => String(x.bron_id)));
    let bijgewerkt = 0, weg = 0;
    for (const rij of rijen) {
      const a = per.get(String(rij.bron_id));
      // Intussen (tussen fase 1 en 3) geïmporteerd en alleen door de grens niet vertaald: de bron noemt het wél — niet «weg».
      if (!a && r.gezien.has(String(rij.bron_id)) && !i.bekend.has(String(rij.bron_id))) continue;
      if (!a) { weg++; await q(`UPDATE app.huis_apparaten SET online = false, updated_at = now() WHERE id = $1`, [rij.id]); await q(`UPDATE app.huis_toestanden SET kwaliteit = 'onbeschikbaar', ontvangen_op = now() WHERE apparaat_id = $1`, [rij.id]); continue; }
      bijgewerkt++;
      await q(`UPDATE app.huis_apparaten SET mogelijkheden = $2::jsonb, kritiek = $3, online = $4, laatst_gezien = $5, updated_at = now() WHERE id = $1`, [rij.id, jsonbTekst(a.mogelijkheden), a.kritiek, a.online, a.laatstGezien]);
      await toestandenOpslaan(q, woningId, String(rij.id), a.toestanden);
    }
    await q(`UPDATE app.huis_integraties SET stand = 'verbonden', fout = '', laatste_sync = now(), hartslag = now(), updated_at = now() WHERE id::text = $2 AND woning_id = $1`, [woningId, integratieId]);
    return { bijgewerkt, weg, nieuwBeschikbaar: r.apparaten.filter((a) => !bekend.has(a.bronId)).length };
  });
}
export async function integratieSchrijven(userId: string, woningId: string, integratieId: string, aan: boolean) {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar) return { fout: 'ALLEEN_EIGENAAR' as const };
    const { rows } = await q(`UPDATE app.huis_integraties SET schrijven = $3, updated_at = now() WHERE id::text = $2 AND woning_id = $1 RETURNING *`, [woningId, integratieId, aan]);
    if (!rows[0]) return { fout: 'NIET_GEVONDEN' as const };
    await gebeurtenis(q, woningId, { soort: 'integratie', ernst: 'belangrijk', bericht: aan ? 'Schrijftoestemming voor Home Assistant AANGEZET' : 'Schrijftoestemming voor Home Assistant uitgezet', gegevens: { integratieId } });
    return integratieUit(rows[0]);
  });
}
export async function integratieVerwijderen(userId: string, woningId: string, integratieId: string) {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar) return { fout: 'ALLEEN_EIGENAAR' as const };
    const r = (await q(`DELETE FROM app.huis_integraties WHERE id::text = $2 AND woning_id = $1 RETURNING id`, [woningId, integratieId])).rows[0];
    if (!r) return { fout: 'NIET_GEVONDEN' as const };
    await gebeurtenis(q, woningId, { soort: 'integratie', ernst: 'belangrijk', bericht: 'Home Assistant losgekoppeld; apparaten en toestanden verwijderd, token gewist' });
    return { verwijderd: true };
  });
}

// ---------------------------------------------------------------- opdrachten
async function standZetten(q: Q, id: string, van: OpdrachtStand, naar: OpdrachtStand, extra: { fout?: string; uitkomst?: Record<string, unknown> } = {}) {
  if (!magOvergang(van, naar)) throw new Error(`OVERGANG_ONGELDIG:${van}→${naar}`);
  const { rows } = await q(`UPDATE app.huis_opdrachten SET stand = $2, fout = COALESCE($3, fout), uitkomst = COALESCE($4::jsonb, uitkomst), updated_at = now() WHERE id = $1 AND stand = $5 RETURNING *`, [id, naar, extra.fout ?? null, extra.uitkomst ? JSON.stringify(extra.uitkomst) : null, van]);
  return rows[0] ? opdrachtUit(rows[0]) : null;
}
export type OpdrachtVraag = { apparaatId: string; mogelijkheid: MogelijkheidSoort; waarde: unknown; idempotentie: string; via?: 'site' | 'scene' | 'automatisering' | 'ai-voorstel'; correlatie?: string; stepUpOk?: boolean };
type OpdrachtUitkomst = { ok: true; opdracht: Opdracht } | { ok: false; fout: string; opdracht?: Opdracht };
/** Wat fase 1 van een opdracht meegeeft aan het versturen: alleen wat het netwerk en de boekhouding daarna nodig hebben. */
type TeVersturen = { o: Opdracht; app: { id: string; naam: string; bron_id: string }; integratieId: string; adres: string; token: string; dienst: { domein: string; dienst: string; data: Record<string, unknown> }; waarde: Record<string, unknown>; correlatie: string; kritiek: boolean };
/**
 * Eén opdracht van begin tot (bijna) einde: beleid → aanvaard → verzonden → korte wachttijd op de waarneming. Geeft de opdracht
 * terug in haar actuele stand; wie 'verzonden'/'bevestigd' terugkrijgt, vraagt later opnieuw (opdrachtLezen poolt de ACK na).
 *
 * SEC-002: drie fasen. (1) Eén korte transactie beslist en legt de opdracht als 'aanvaard' VAST — de idempotentiesleutel bestaat
 * dus vóór er iets naar de bron gaat. (2) Het versturen gebeurt zonder databankverbinding. (3) De uitkomst en elke waarneming
 * krijgen hun eigen korte transactie. Wat er na (1) ook misgaat (trage bron, kapot antwoord, herstart): dezelfde sleutel geeft
 * dezelfde opdracht terug en stuurt nooit een tweede keer (slot, poort, verwarming).
 */
/** Sleutels «voorstel-…» maakt alleen voorstelBesluiten; het id van een voorstel ziet elk lid, dus niemand anders mag ze gebruiken. */
const VOORSTEL_SLEUTEL = /^voorstel-/i;
export async function opdrachtGeven(userId: string, woningId: string, v: OpdrachtVraag): Promise<OpdrachtUitkomst> {
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(v.idempotentie)) return { ok: false, fout: 'IDEMPOTENTIE_ONGELDIG' };
  // SEC-002 (na de toetsing, opm. 8): een gast kon de voorspelbare sleutel van een voorstel vooraf bezetten met een geweigerde opdracht.
  if (VOORSTEL_SLEUTEL.test(v.idempotentie) && v.via !== 'ai-voorstel') return { ok: false, fout: 'IDEMPOTENTIE_ONGELDIG' };
  // SEC-002 (na de toetsing, opm. 10): bestaat er al een opdracht met deze sleutel, dan komt die terug — zonder beurt, dus ook
  // als de bron net bezet is (anders kreeg een herhaling van een al uitgevoerde opdracht «niet verstuurd», 429).
  const alGegeven = await alsGebruiker(userId, async (q) => ((await lidVan(q, userId, woningId)) ? (await q(`SELECT * FROM app.huis_opdrachten WHERE woning_id = $1 AND idempotentie = $2`, [woningId, v.idempotentie])).rows[0] ?? null : null));
  if (alGegeven) return { ok: true, opdracht: opdrachtUit(alGegeven) };
  // SEC-002 (na de toetsing, opm. 7): EERST een beurt bij de bron, dan pas vastleggen. Zonder beurt (HUIS_BEZET, tijdelijk) wordt
  // niets vastgelegd: de sleutel blijft vrij, een voorstel blijft «wacht», en dezelfde sleutel later verstuurt gewoon.
  const beurt = await haBeurt(userId, woningId, async () => {
    const fase1 = await opdrachtVastleggen(userId, woningId, v);
    if (!('sturen' in fase1)) return { fase1, stuur: null };
    const s = fase1.sturen;
    await auditToevoegen({ ownerId: userId, actorId: userId, action: 'huis.opdracht', type: 'huis', result: 'ok', details: { woningId, opdrachtId: s.o.id, apparaat: s.app.bron_id, mogelijkheid: v.mogelijkheid, kritiek: s.kritiek, via: v.via || 'site' } }).catch(() => undefined);
    // Fase 2 — het netwerk, zonder databankverbinding. De opdracht staat al vast als 'aanvaard'.
    return { fase1, stuur: await haStuur(s.adres, s.token, s.dienst) };
  });
  if ('fout' in beurt) return { ok: false, fout: 'HUIS_BEZET' }; // alleen BEZET heeft bovenaan een `fout`
  const { fase1, stuur } = beurt;
  if (!('sturen' in fase1) || !stuur) return fase1 as OpdrachtUitkomst;
  const s: TeVersturen = (fase1 as { sturen: TeVersturen }).sturen;
  // Fase 3 — de uitkomst van het versturen vastleggen.
  let o = await alsGebruiker(userId, async (q) => {
    // Geen rij terug = de stand is intussen door een ander veranderd (bv. afgesloten na de deadline): dan geldt wat er nu staat.
    const actueel = async (na: Opdracht | null) => { if (na) return na; const rij = (await q(`SELECT * FROM app.huis_opdrachten WHERE id = $1 AND woning_id = $2`, [s.o.id, woningId])).rows[0]; return rij ? opdrachtUit(rij) : s.o; };
    if (!stuur.ok) {
      const na = await standZetten(q, s.o.id, 'aanvaard', stuur.fout === 'GEEN_ANTWOORD' ? 'offline' : 'mislukt', { fout: stuur.fout });
      await q(`UPDATE app.huis_integraties SET stand = 'verzwakt', fout = $2, updated_at = now() WHERE id::text = $1 AND woning_id = $3`, [s.integratieId, stuur.fout, woningId]);
      await gebeurtenis(q, woningId, { bron: 'home-assistant', soort: 'opdracht', ernst: 'belangrijk', apparaatId: s.app.id, opdrachtId: s.o.id, bericht: `Opdracht niet verzonden (${stuur.fout})`, correlatie: s.correlatie });
      return actueel(na);
    }
    const na = await standZetten(q, s.o.id, 'aanvaard', 'verzonden');
    await gebeurtenis(q, woningId, { soort: 'opdracht', apparaatId: s.app.id, opdrachtId: s.o.id, bericht: `${s.app.naam}: ${v.mogelijkheid} ${JSON.stringify(s.waarde)} verzonden`, correlatie: s.correlatie });
    return actueel(na);
  });
  if (!stuur.ok) return { ok: false, fout: stuur.fout, opdracht: o };
  // Korte wachttijd op de waarneming (de ACK): hoogstens drie keer lezen; daarna poolt opdrachtLezen verder tot de deadline.
  // Een fout hier (databank even weg) verandert niets aan het feit dat de opdracht verzonden IS: de stand van dat moment gaat terug.
  for (let i = 0; i < 3 && !OPDRACHT_EIND.includes(o.stand); i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { const na = await ackControleren(userId, woningId, o, s.adres, s.token, s.app); if (na) o = na; }
    catch (err) { console.error('[huis] waarneming na opdracht mislukt:', (err as Error).message); break; }
  }
  return { ok: true, opdracht: o };
}
/** Fase 1 van een opdracht: beleid en vastleggen als 'aanvaard' (één korte transactie), of een weigering/bestaande opdracht. */
async function opdrachtVastleggen(userId: string, woningId: string, v: OpdrachtVraag): Promise<OpdrachtUitkomst | { sturen: TeVersturen }> {
  let fase1: OpdrachtUitkomst | { sturen: TeVersturen };
  try {
    fase1 = await alsGebruiker(userId, async (q): Promise<OpdrachtUitkomst | { sturen: TeVersturen }> => {
      const lid = await lidVan(q, userId, woningId); if (!lid) return { ok: false as const, fout: 'GEEN_TOEGANG' };
      const bestaand = (await q(`SELECT * FROM app.huis_opdrachten WHERE woning_id = $1 AND idempotentie = $2`, [woningId, v.idempotentie])).rows[0];
      if (bestaand) return { ok: true as const, opdracht: opdrachtUit(bestaand) };
      const app = (await q(`SELECT * FROM app.huis_apparaten WHERE id::text = $2 AND woning_id = $1`, [woningId, v.apparaatId])).rows[0];
      if (!app) return { ok: false as const, fout: 'APPARAAT_ONBEKEND' };
      const mog = (Array.isArray(app.mogelijkheden) ? app.mogelijkheden : []).find((m: Mogelijkheid) => m.soort === v.mogelijkheid) as Mogelijkheid | undefined;
      const kritiek = Boolean(app.kritiek && (mog?.kritiek || KRITIEKE_SOORTEN.includes(v.mogelijkheid)));
      const w = mog?.schrijven ? schoneOpdrachtWaarde(v.mogelijkheid, v.waarde, mog) : { ok: false as const, fout: 'MOGELIJKHEID_NIET_SCHRIJFBAAR' };
      const correlatie = (v.correlatie || randomUUID()).slice(0, 80);
      const beleid: Record<string, unknown> = { kritiek, rol: lid.rol, via: v.via || 'site', stepUp: Boolean(v.stepUpOk) };
      const nieuw = async (stand: OpdrachtStand, fout = '', sleutel = v.idempotentie) => opdrachtUit((await q(`INSERT INTO app.huis_opdrachten (woning_id, user_id, via, apparaat_id, mogelijkheid, verzocht, idempotentie, correlatie, stand, beleid, fout, deadline) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11, now() + ($12 || ' milliseconds')::interval) RETURNING *`,
        [woningId, userId, v.via || 'site', app.id, v.mogelijkheid, jsonbTekst(w.ok ? w.waarde : {}), sleutel, correlatie, stand, jsonbTekst(beleid), fout, String(OPDRACHT_DEADLINE_MS)])).rows[0]);
      // SEC-002 (na de toetsing, opm. 8): wie niet mag schrijven (gast, ondersteuning), krijgt zijn weigering vastgelegd onder een
      // EIGEN willekeurige sleutel — anders bezette de weigering de sleutel van de woning en kreeg een bewoner later die weigering terug.
      const weigerSleutel = lid.magSchrijven ? v.idempotentie : `weigering-${randomUUID()}`;
      const weiger = async (reden: string) => { const o = await nieuw('geweigerd', reden, weigerSleutel); await gebeurtenis(q, woningId, { soort: 'opdracht', ernst: 'belangrijk', apparaatId: String(app.id), opdrachtId: o.id, bericht: `Opdracht geweigerd: ${reden}`, correlatie }); return { ok: false as const, fout: reden, opdracht: o }; };
      if (!w.ok) return weiger(w.fout);
      if (!lid.magSchrijven) return weiger('ROL_ALLEEN_LEZEN');
      if (kritiek && (v.via && v.via !== 'site')) return weiger('KRITIEK_ALLEEN_MENS');
      if (kritiek && !v.stepUpOk) return weiger('STEP_UP_VEREIST');
      const integ = app.integratie_id ? await integratieMetGeheim(q, woningId, String(app.integratie_id)) : null;
      if (!integ) return weiger('GEEN_INTEGRATIE');
      if (!integ.rij.schrijven) return weiger('SCHRIJVEN_NIET_TOEGESTAAN');
      const dienst = haDienstVoor(String(app.bron_id), v.mogelijkheid, w.waarde);
      if (!dienst) return weiger('DIENST_ONBEKEND');
      const verzocht = await nieuw('verzocht');
      const o = (await standZetten(q, verzocht.id, 'verzocht', 'aanvaard'))!;
      return { sturen: { o, app: { id: String(app.id), naam: String(app.naam), bron_id: String(app.bron_id) }, integratieId: String(integ.rij.id), adres: String(integ.rij.adres), token: integ.token, dienst, waarde: w.waarde, correlatie, kritiek } };
    });
  } catch (err) {
    // Twee gelijktijdige verzoeken met dezelfde sleutel: het tweede botst op UNIQUE (woning_id, idempotentie) en krijgt de opdracht
    // van het eerste terug — nooit een tweede verzending, en geen 500.
    if ((err as { code?: string })?.code !== '23505') throw err;
    const rij = await alsGebruiker(userId, async (q) => ((await lidVan(q, userId, woningId)) ? (await q(`SELECT * FROM app.huis_opdrachten WHERE woning_id = $1 AND idempotentie = $2`, [woningId, v.idempotentie])).rows[0] : null));
    if (!rij) throw err;
    return { ok: true, opdracht: opdrachtUit(rij) };
  }
  return fase1;
}
/**
 * De waarneming na een opdracht: lees de entiteit (netwerk, ZONDER databankverbinding), en leg daarna in één korte transactie de
 * toestand vast en zet de opdracht op bevestigd/waargenomen/voltooid of verlopen. De rij wordt daarbij vergrendeld en opnieuw
 * gelezen: twee lezers tegelijk (de pagina poolt elke 1,5 s) boeken zo niet dubbel.
 */
async function ackControleren(userId: string, woningId: string, o: Opdracht, adres: string, token: string, app: { id: string; naam: string; bron_id: string }): Promise<Opdracht | null> {
  if (o.stand !== 'verzonden' && o.stand !== 'bevestigd' && o.stand !== 'waargenomen') return null;
  const beurt = await haBeurt(userId, woningId, () => haLezen(adres, token, app.bron_id));
  const gelezen0 = beurt === BEZET ? 'fout' as const : beurt as Awaited<ReturnType<typeof haLezen>>;
  return alsGebruiker(userId, async (q) => {
    const rij = (await q(`SELECT * FROM app.huis_opdrachten WHERE id = $1 AND woning_id = $2 FOR UPDATE`, [o.id, woningId])).rows[0];
    if (!rij) return null;
    let cur = opdrachtUit(rij);
    if (cur.stand !== 'verzonden' && cur.stand !== 'bevestigd' && cur.stand !== 'waargenomen') return cur;
    let gelezen = gelezen0 === 'fout' ? null : gelezen0;
    if (gelezen) {
      // SEC-002 (na de toetsing, opm. 5): het vastleggen van de waarneming staat in een SAVEPOINT. Mislukt het (wat de bron ook
      // stuurt), dan telt deze lezing als «geen waarneming» — de deadline hieronder sluit de opdracht dan toch eerlijk af, in
      // plaats van een uitzondering bij elke poll en een opdracht die eeuwig «verzonden» blijft.
      await q('SAVEPOINT huis_waarneming');
      try {
        // Zelfde volgorde van vergrendelen als importeren/synchroniseren (eerst het apparaat, dan zijn toestanden): geen kruislingse wachtrij.
        await q(`UPDATE app.huis_apparaten SET online = $2, laatst_gezien = $3, updated_at = now() WHERE id::text = $1 AND woning_id = $4`, [app.id, gelezen.online, gelezen.laatstGezien, woningId]);
        await toestandenOpslaan(q, woningId, app.id, gelezen.toestanden);
        await q('RELEASE SAVEPOINT huis_waarneming');
      } catch (err) {
        await q('ROLLBACK TO SAVEPOINT huis_waarneming');
        console.error('[huis] waarneming niet vast te leggen, telt als geen waarneming:', (err as { code?: string }).code ?? '', (err as Error).message.slice(0, 120));
        gelezen = null;
      }
    }
    if (!gelezen) { if (cur.deadline && Date.parse(cur.deadline) < Date.now()) return standZetten(q, cur.id, cur.stand, cur.stand === 'waargenomen' ? 'gedeeltelijk' : 'verlopen', { fout: 'GEEN_WAARNEMING' }); return null; }
    if (cur.stand === 'verzonden') cur = (await standZetten(q, cur.id, 'verzonden', 'bevestigd')) ?? cur;
    if (komtOvereen(cur.mogelijkheid, cur.verzocht, gelezen.toestanden)) {
      if (cur.stand === 'bevestigd') cur = (await standZetten(q, cur.id, 'bevestigd', 'waargenomen')) ?? cur;
      if (cur.stand === 'waargenomen') cur = (await standZetten(q, cur.id, 'waargenomen', 'voltooid', { uitkomst: Object.fromEntries(gelezen.toestanden.map((t) => [t.kenmerk, t.waarde])) })) ?? cur;
      await gebeurtenis(q, woningId, { bron: 'home-assistant', soort: 'opdracht', apparaatId: app.id, opdrachtId: cur.id, bericht: `${app.naam}: bevestigd en waargenomen`, correlatie: cur.correlatie });
      return cur;
    }
    if (cur.deadline && Date.parse(cur.deadline) < Date.now()) {
      cur = (await standZetten(q, cur.id, cur.stand as 'bevestigd', cur.stand === 'bevestigd' ? 'verlopen' : 'gedeeltelijk', { fout: 'GEEN_ACK', uitkomst: Object.fromEntries(gelezen.toestanden.map((t) => [t.kenmerk, t.waarde])) })) ?? cur;
      await gebeurtenis(q, woningId, { bron: 'home-assistant', soort: 'opdracht', ernst: 'belangrijk', apparaatId: app.id, opdrachtId: cur.id, bericht: `${app.naam}: geen bevestiging binnen de tijd`, correlatie: cur.correlatie });
    }
    return cur;
  });
}
export async function opdrachtLezen(userId: string, woningId: string, id: string): Promise<Opdracht | null> {
  const v = await alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid) return null;
    const r = (await q(`SELECT * FROM app.huis_opdrachten WHERE id::text = $2 AND woning_id = $1`, [woningId, id])).rows[0]; if (!r) return null;
    const o = opdrachtUit(r);
    if (OPDRACHT_EIND.includes(o.stand) || !o.apparaatId) return { o };
    // SEC-002: nog 'aanvaard' na de deadline = vastgelegd maar het versturen is nooit afgeboekt (herstart of storing ertussen).
    // Of de bron de opdracht kreeg is onbekend; ze wordt NOOIT opnieuw verstuurd, alleen eerlijk afgesloten.
    if (o.stand === 'aanvaard') {
      if (!o.deadline || Date.parse(o.deadline) >= Date.now()) return { o };
      const na = await standZetten(q, o.id, 'aanvaard', 'mislukt', { fout: 'VERZENDING_ONDERBROKEN' });
      if (na) await gebeurtenis(q, woningId, { soort: 'opdracht', ernst: 'belangrijk', apparaatId: o.apparaatId, opdrachtId: o.id, bericht: 'Команду закрито: надсилання перервалося, результат невідомий / Opdracht afgesloten: het versturen werd onderbroken, uitkomst onbekend', correlatie: o.correlatie });
      return { o: na ?? o, systeemAfgesloten: na ? String(r.user_id || userId) : '' };
    }
    const app = (await q(`SELECT id, naam, bron_id, integratie_id FROM app.huis_apparaten WHERE id::text = $1 AND woning_id = $2`, [o.apparaatId, woningId])).rows[0];
    const integ = app?.integratie_id ? await integratieMetGeheim(q, woningId, String(app.integratie_id)) : null;
    if (!app || !integ) return { o };
    return { o, app: { id: String(app.id), naam: String(app.naam), bron_id: String(app.bron_id) }, adres: String(integ.rij.adres), token: integ.token };
  });
  if (!v) return null;
  // SEC-002 (na de toetsing, opm. 6): het systeem sloot een onderbroken opdracht af — een vaste regel bij wie haar gaf.
  if ('systeemAfgesloten' in v && v.systeemAfgesloten) await huisAudit(v.systeemAfgesloten, null, 'huis.opdracht.afgesloten', 'mislukt', { woningId, opdrachtId: v.o.id, fout: 'VERZENDING_ONDERBROKEN', door: 'systeem', gelezenDoor: userId });
  if (!('app' in v) || !v.app) return v.o;
  return (await ackControleren(userId, woningId, v.o, v.adres, v.token, v.app)) ?? v.o;
}
/** Auditregel van de huismodule (type 'huis'). Nooit binnen een transactie aanroepen (eigen verbinding); een fout breekt de actie niet. */
async function huisAudit(ownerId: string, actorId: string | null, action: string, result: string, details: Record<string, unknown>): Promise<void> {
  await auditToevoegen({ ownerId, actorId, action, type: 'huis', result, details }).catch((err) => { console.error('[huis] auditregel mislukt:', action, (err as Error).message); });
}
export async function opdrachtenLijst(userId: string, woningId: string, limiet = 50): Promise<Opdracht[] | null> {
  return alsGebruiker(userId, async (q) => { const lid = await lidVan(q, userId, woningId); if (!lid) return null; return (await q(`SELECT * FROM app.huis_opdrachten WHERE woning_id = $1 ORDER BY created_at DESC LIMIT ${Math.min(200, limiet)}`, [woningId])).rows.map(opdrachtUit); });
}

// ---------------------------------------------------------------- scènes
export async function scenesLijst(userId: string, woningId: string) { return alsGebruiker(userId, async (q) => { if (!(await lidVan(q, userId, woningId))) return null; return (await q(`SELECT * FROM app.huis_scenes WHERE woning_id = $1 ORDER BY favoriet DESC, naam`, [woningId])).rows.map(sceneUit); }); }
export async function sceneBewaren(userId: string, woningId: string, id: string | null, raw: unknown) {
  const s = schoneScene(raw); if (!s.ok) return { fout: s.fout };
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.magSchrijven) return { fout: 'GEEN_TOEGANG' as const };
    for (const st of s.stappen) if (!(await q(`SELECT 1 FROM app.huis_apparaten WHERE id::text = $2 AND woning_id = $1`, [woningId, st.apparaatId])).rows.length) return { fout: 'STAP_APPARAAT_ONBEKEND' as const };
    const n = Number((await q(`SELECT count(*)::int AS n FROM app.huis_scenes WHERE woning_id = $1`, [woningId])).rows[0].n); if (!id && n >= 200) return { fout: 'TE_VEEL_SCENES' as const };
    const { rows } = id
      ? await q(`UPDATE app.huis_scenes SET naam = $3, icoon = $4, favoriet = $5, stappen = $6::jsonb, updated_at = now() WHERE id::text = $2 AND woning_id = $1 RETURNING *`, [woningId, id, s.naam, s.icoon, s.favoriet, JSON.stringify(s.stappen)])
      : await q(`INSERT INTO app.huis_scenes (woning_id, naam, icoon, favoriet, stappen) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`, [woningId, s.naam, s.icoon, s.favoriet, JSON.stringify(s.stappen)]);
    return rows[0] ? sceneUit(rows[0]) : { fout: 'NIET_GEVONDEN' as const };
  });
}
export async function sceneVerwijderen(userId: string, woningId: string, id: string) { return alsGebruiker(userId, async (q) => { const lid = await lidVan(q, userId, woningId); if (!lid || !lid.magSchrijven) return false; return (await q(`DELETE FROM app.huis_scenes WHERE id::text = $2 AND woning_id = $1 RETURNING id`, [woningId, id])).rows.length > 0; }); }
/** Een scène = één opdracht per stap, elk met eigen ACK; het resultaat per stap wordt bij de scène bewaard (ok/mislukt/geweigerd). */
export async function sceneUitvoeren(userId: string, woningId: string, id: string, idempotentie: string, via: 'site' | 'automatisering' = 'site') {
  const scene = await alsGebruiker(userId, async (q) => { if (!(await lidVan(q, userId, woningId))) return null; const r = (await q(`SELECT * FROM app.huis_scenes WHERE id::text = $2 AND woning_id = $1`, [woningId, id])).rows[0]; return r ? sceneUit(r) : null; });
  if (!scene) return { fout: 'NIET_GEVONDEN' as const };
  const correlatie = `scene-${id.slice(0, 8)}-${Date.now().toString(36)}`;
  const stappen: Array<{ apparaatId: string; mogelijkheid: string; stand: OpdrachtStand; fout: string; opdrachtId: string | null }> = [];
  for (const [i, st] of scene.stappen.entries()) {
    const r = await opdrachtGeven(userId, woningId, { apparaatId: st.apparaatId, mogelijkheid: st.mogelijkheid, waarde: st.waarde, idempotentie: `${idempotentie}-${i}`, via: via === 'site' ? 'scene' : 'automatisering', correlatie });
    stappen.push({ apparaatId: st.apparaatId, mogelijkheid: st.mogelijkheid, stand: r.opdracht?.stand ?? 'geweigerd', fout: r.ok ? '' : r.fout, opdrachtId: r.opdracht?.id ?? null });
  }
  const samenvatting = stappen.every((s) => s.stand === 'voltooid') ? 'voltooid' : stappen.some((s) => s.stand === 'voltooid' || s.stand === 'verzonden' || s.stand === 'bevestigd') ? 'gedeeltelijk' : 'mislukt';
  await alsGebruiker(userId, async (q) => {
    await q(`UPDATE app.huis_scenes SET laatste_run = $3::jsonb, updated_at = now() WHERE id::text = $2 AND woning_id = $1`, [woningId, id, JSON.stringify({ op: new Date().toISOString(), uitkomst: samenvatting, stappen, correlatie })]);
    await gebeurtenis(q, woningId, { soort: 'scene', ernst: samenvatting === 'voltooid' ? 'info' : 'belangrijk', bericht: `Scène «${scene.naam}»: ${samenvatting} (${stappen.filter((s) => s.stand === 'voltooid').length}/${stappen.length})`, correlatie });
  });
  return { uitkomst: samenvatting, stappen, correlatie };
}

// ---------------------------------------------------------------- automatiseringen (concept + droogloop; de site voert ze niet uit)
export async function automatiseringenLijst(userId: string, woningId: string) { return alsGebruiker(userId, async (q) => { if (!(await lidVan(q, userId, woningId))) return null; return (await q(`SELECT * FROM app.huis_automatiseringen WHERE woning_id = $1 ORDER BY naam`, [woningId])).rows.map(automatiseringUit); }); }
export async function automatiseringBewaren(userId: string, woningId: string, id: string | null, v: { naam: string; regel: unknown; stand?: string }) {
  const naam = String(v.naam ?? '').replace(/\s+/g, ' ').trim(); if (!naam || naam.length > 80) return { fout: 'NAAM_ONGELDIG' as const };
  const r = schoneRegel(v.regel); if (!r.ok) return { fout: r.fout };
  const stand = v.stand === 'simulatie' ? 'simulatie' : v.stand === 'gepauzeerd' ? 'gepauzeerd' : 'concept';
  if (v.stand === 'aan') return { fout: 'NOG_NIET_UITVOERBAAR' as const }; // P4: de site voert regels nog niet uit — eerlijk weigeren
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.magSchrijven) return { fout: 'GEEN_TOEGANG' as const };
    const { rows } = id
      ? await q(`UPDATE app.huis_automatiseringen SET naam = $3, regel = $4::jsonb, stand = $5, versie = versie + 1, updated_at = now() WHERE id::text = $2 AND woning_id = $1 RETURNING *`, [woningId, id, naam, JSON.stringify(r.regel), stand])
      : await q(`INSERT INTO app.huis_automatiseringen (woning_id, naam, regel, stand) VALUES ($1,$2,$3::jsonb,$4) RETURNING *`, [woningId, naam, JSON.stringify(r.regel), stand]);
    return rows[0] ? automatiseringUit(rows[0]) : { fout: 'NIET_GEVONDEN' as const };
  });
}
export async function automatiseringVerwijderen(userId: string, woningId: string, id: string) { return alsGebruiker(userId, async (q) => { const lid = await lidVan(q, userId, woningId); if (!lid || !lid.magSchrijven) return false; return (await q(`DELETE FROM app.huis_automatiseringen WHERE id::text = $2 AND woning_id = $1 RETURNING id`, [woningId, id])).rows.length > 0; }); }
/** Droogloop tegen de ECHTE waargenomen toestanden van nu — zonder enige I/O naar een apparaat. */
export async function automatiseringDroogloop(userId: string, woningId: string, raw: unknown, tijd?: string) {
  const r = schoneRegel(raw); if (!r.ok) return { fout: r.fout };
  return alsGebruiker(userId, async (q) => {
    if (!(await lidVan(q, userId, woningId))) return { fout: 'GEEN_TOEGANG' as const };
    const apparaten = await apparatenMetToestand(q, woningId);
    const w: Waarnemingen = {};
    for (const a of apparaten) w[a.id] = Object.fromEntries(a.toestanden.map((t) => [t.kenmerk, t.waarde]));
    const namen = new Map(apparaten.map((a) => [a.id, a.naam]));
    for (const s of (await q(`SELECT id, naam FROM app.huis_scenes WHERE woning_id = $1`, [woningId])).rows) namen.set(String(s.id), s.naam);
    const nu = tijd && /^\d{2}:\d{2}$/.test(tijd) ? new Date(`2026-01-05T${tijd}:00`) : new Date();
    return { droogloop: droogloop(r.regel, w, nu, (id) => namen.get(id) ?? id), geenIo: true };
  });
}

// ---------------------------------------------------------------- gebeurtenissen, energie, beveiliging, voorstellen, leden
export async function gebeurtenissenLijst(userId: string, woningId: string, v: { voor?: string; soort?: string; limiet?: number }) {
  return alsGebruiker(userId, async (q) => {
    if (!(await lidVan(q, userId, woningId))) return null;
    const params: unknown[] = [woningId]; const waar: string[] = ['woning_id = $1'];
    if (v.voor && /^\d+$/.test(v.voor)) { params.push(v.voor); waar.push(`id < $${params.length}`); }
    if (v.soort && /^[a-z]+$/.test(v.soort)) { params.push(v.soort); waar.push(`soort = $${params.length}`); }
    const rows = (await q(`SELECT * FROM app.huis_gebeurtenissen WHERE ${waar.join(' AND ')} ORDER BY id DESC LIMIT ${Math.min(HUIS_LIMIETEN.gebeurtenissen, Math.max(1, v.limiet || 50))}`, params)).rows.map(gebeurtenisUit);
    return { gebeurtenissen: rows, volgende: rows.length ? rows[rows.length - 1].id : null };
  });
}
export async function energieOverzicht(userId: string, woningId: string, uren = 24) {
  // SEC-002: eerst kort lezen (meters + per bron adres en token), daarna pas het netwerk — zonder databankverbinding.
  const basis = await alsGebruiker(userId, async (q) => {
    if (!(await lidVan(q, userId, woningId))) return null;
    const apparaten = (await apparatenMetToestand(q, woningId)).filter((a) => a.mogelijkheden.some((m) => m.soort === 'energie' || m.soort === 'vermogen'));
    const perIntegratie = new Map<string, Apparaat[]>();
    for (const a of apparaten) if (a.integratieId) { if (!perIntegratie.has(a.integratieId)) perIntegratie.set(a.integratieId, []); perIntegratie.get(a.integratieId)!.push(a); }
    const bronnen: Array<{ adres: string; token: string; lijst: Apparaat[] }> = [];
    for (const [integratieId, lijst] of [...perIntegratie].slice(0, HUIS_HA_GRENZEN.integratiesPerWoning)) {
      const i = await integratieMetGeheim(q, woningId, integratieId); if (!i) continue;
      bronnen.push({ adres: String(i.rij.adres), token: i.token, lijst: lijst.slice(0, HUIS_HA_GRENZEN.geschiedenisEntiteiten) });
    }
    return { apparaten, bronnen };
  });
  if (!basis) return null;
  const reeksen: Record<string, Array<{ op: string; waarde: number }>> = {}; let fout = '';
  const van = new Date(Date.now() - Math.min(HUIS_LIMIETEN.geschiedenisUren, Math.max(1, uren)) * 3600_000).toISOString();
  for (const b of basis.bronnen) {
    const g = await haBeurt(userId, woningId, () => haGeschiedenis(b.adres, b.token, b.lijst.map((a) => a.bronId), van));
    if (!g.ok) { fout = g.fout; continue; }
    for (const a of b.lijst) if (g.reeksen[a.bronId]) reeksen[a.id] = g.reeksen[a.bronId];
  }
  return { apparaten: basis.apparaten, reeksen, van, fout, meters: basis.apparaten.length };
}
export async function beveiligingOverzicht(userId: string, woningId: string) {
  return alsGebruiker(userId, async (q) => {
    if (!(await lidVan(q, userId, woningId))) return null;
    const soorten: MogelijkheidSoort[] = ['contact', 'beweging', 'water', 'rook', 'gas', 'vergrendeld', 'alarm', 'aanwezigheid'];
    const apparaten = (await apparatenMetToestand(q, woningId)).filter((a) => a.mogelijkheden.some((m) => soorten.includes(m.soort)));
    const integraties = (await q(`SELECT * FROM app.huis_integraties WHERE woning_id = $1`, [woningId])).rows.map(integratieUit);
    return { apparaten, integraties, gecertificeerd: false };
  });
}
export async function voorstellenLijst(userId: string, woningId: string) { return alsGebruiker(userId, async (q) => { if (!(await lidVan(q, userId, woningId))) return null; await q(`UPDATE app.huis_voorstellen SET stand = 'verlopen' WHERE woning_id = $1 AND stand = 'wacht' AND verloopt_op < now()`, [woningId]); return (await q(`SELECT * FROM app.huis_voorstellen WHERE woning_id = $1 ORDER BY created_at DESC LIMIT 100`, [woningId])).rows.map(voorstelUit); }); }
/** Een voorstel (van een AI of de assistent-pagina): NOOIT een uitvoering. Kritiek wordt al bij het voorstel geweigerd. */
export async function voorstelMaken(userId: string, woningId: string, v: { door: string; samenvatting: string; apparaatId: string; mogelijkheid: MogelijkheidSoort; waarde: unknown }) {
  if (KRITIEKE_SOORTEN.includes(v.mogelijkheid)) return { fout: 'KRITIEK_ALLEEN_MENS' as const };
  const w = schoneOpdrachtWaarde(v.mogelijkheid, v.waarde); if (!w.ok) return { fout: w.fout };
  const samenvatting = String(v.samenvatting ?? '').trim().slice(0, 500); if (!samenvatting) return { fout: 'SAMENVATTING_VEREIST' as const };
  return alsGebruiker(userId, async (q) => {
    if (!(await lidVan(q, userId, woningId))) return { fout: 'GEEN_TOEGANG' as const };
    const app = (await q(`SELECT id, naam, kritiek FROM app.huis_apparaten WHERE id::text = $2 AND woning_id = $1`, [woningId, v.apparaatId])).rows[0]; if (!app) return { fout: 'APPARAAT_ONBEKEND' as const };
    if (app.kritiek) return { fout: 'KRITIEK_ALLEEN_MENS' as const };
    const { rows } = await q(`INSERT INTO app.huis_voorstellen (woning_id, door, user_id, samenvatting, opdracht) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`, [woningId, String(v.door || 'ai').slice(0, 60), userId, samenvatting, JSON.stringify({ apparaatId: v.apparaatId, mogelijkheid: v.mogelijkheid, waarde: w.waarde })]);
    await gebeurtenis(q, woningId, { bron: 'ai', soort: 'voorstel', bericht: `Voorstel: ${samenvatting}`, gegevens: { voorstelId: rows[0].id } });
    return voorstelUit(rows[0]);
  });
}
export async function voorstelBesluiten(userId: string, woningId: string, id: string, goedkeuren: boolean) {
  const v = await alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.magSchrijven) return { fout: 'GEEN_TOEGANG' as const };
    const r = (await q(`SELECT * FROM app.huis_voorstellen WHERE id::text = $2 AND woning_id = $1 AND stand = 'wacht'`, [woningId, id])).rows[0]; if (!r) return { fout: 'NIET_GEVONDEN' as const };
    if (new Date(r.verloopt_op).getTime() < Date.now()) { await q(`UPDATE app.huis_voorstellen SET stand = 'verlopen' WHERE id = $1`, [r.id]); return { fout: 'VERLOPEN' as const }; }
    if (!goedkeuren) { await q(`UPDATE app.huis_voorstellen SET stand = 'afgewezen', besluit_op = now() WHERE id = $1`, [r.id]); return { voorstel: voorstelUit({ ...r, stand: 'afgewezen' }) }; }
    return { voorstel: voorstelUit(r) };
  });
  if ('fout' in v || !goedkeuren) return v;
  const o = await opdrachtGeven(userId, woningId, { apparaatId: v.voorstel.opdracht.apparaatId, mogelijkheid: v.voorstel.opdracht.mogelijkheid, waarde: v.voorstel.opdracht.waarde, idempotentie: `voorstel-${id.replace(/-/g, '').slice(0, 24)}`, via: 'ai-voorstel', correlatie: `voorstel-${id.slice(0, 8)}` });
  // SEC-002 (na de toetsing, opm. 7): bron bezet = er is niets vastgelegd of verstuurd. Het voorstel blijft «wacht» en is later
  // opnieuw goed te keuren (dezelfde sleutel is nog vrij).
  if (!o.ok && o.fout === 'HUIS_BEZET' && !o.opdracht) return { fout: 'HUIS_BEZET' as const };
  await alsGebruiker(userId, async (q) => { await q(`UPDATE app.huis_voorstellen SET stand = 'goedgekeurd', besluit_op = now(), opdracht_id = $2 WHERE id::text = $1`, [id, o.opdracht?.id ?? null]); });
  return { voorstel: { ...v.voorstel, stand: 'goedgekeurd' as const, opdrachtId: o.opdracht?.id ?? null }, opdracht: o.opdracht ?? null, fout: o.ok ? undefined : o.fout };
}
// ---------------------------------------------------------------- leden en uitnodigingen (SEC-002, integraties-09, migratie 0212)
/** De leden van een woning: per definitie mensen die zelf lid werden (aanvaard) — alleen van hen tonen we naam en adres. */
export async function ledenLijst(userId: string, woningId: string) { return alsGebruiker(userId, async (q) => { if (!(await lidVan(q, userId, woningId))) return null; return (await q(`SELECT l.user_id, l.rol, l.geldig_tot, r.data->>'email' AS email, r.data->>'name' AS naam FROM app.huis_leden l LEFT JOIN app.records r ON r.tbl = 'users' AND r.id = l.user_id WHERE l.woning_id = $1 ORDER BY l.created_at`, [woningId])).rows.map((x) => ({ userId: String(x.user_id), rol: x.rol, geldigTot: isoOfNull(x.geldig_tot), email: x.email || '', naam: x.naam || '' })); }); }
// SEC-002 (na de toetsing, opm. 9): geen stuurtekens (NUL gaf 22021 → 500) en geen eenzame surrogaten in een adres.
const schoonEmail = (v: unknown): string => { const e = String(v ?? '').trim().toLowerCase(); return isEmailAdres(e, 254) && !/[\u0000-\u001f\u007f-\u009f]/.test(e) && tekstVeilig(e) === e ? e : ''; };
/** Rol als «укр / nl» voor gebeurtenissen (de pagina «Події» toont de tekst zoals hij is). */
const rolPaar = (rol: string) => { const p = HUIS_ROL_LABEL[rol] ?? [rol, rol]; return { uk: p[0], nl: p[1] }; };
const lidRol = (v: unknown): string => (HUIS_ROLLEN_UITNODIGBAAR.includes(String(v)) ? String(v) : 'gast');
const lidTermijn = (rol: string, dagen: unknown): Date | null => (rol === 'installateur' || rol === 'ondersteuning' ? new Date(Date.now() + Math.min(90, Math.max(1, Number(dagen) || 7)) * 864e5) : null);
async function lidSchrijven(q: Q, woningId: string, lidUserId: string, rol: string, geldigTot: Date | null) {
  await q(`INSERT INTO app.huis_leden (woning_id, user_id, rol, geldig_tot) VALUES ($1,$2,$3,$4) ON CONFLICT (woning_id, user_id) DO UPDATE SET rol = EXCLUDED.rol, geldig_tot = EXCLUDED.geldig_tot`, [woningId, lidUserId, rol, geldigTot]);
}
/**
 * RECHTSTREEKS toevoegen, zonder toestemming van de toegevoegde. Sinds SEC-002 roept GEEN route dit nog aan (de route gebruikt
 * lidUitnodigen): het verraadde of een adres een account heeft en zette een vreemde woning ongevraagd in iemands lijst. De functie
 * blijft alleen voor beheer vanaf de server zelf en voor de bestaande eenheidstest; nooit aan een verzoek van een gebruiker hangen
 * (tests/eenheid/sec-002-g02-20261112.test.ts bewaakt dat).
 */
export async function lidToevoegen(userId: string, woningId: string, v: { email: string; rol: string; dagen?: number }) {
  const rol = lidRol(v.rol);
  if (isAlleenLezen()) throw new Error('IMPERSONATIE_ALLEEN_LEZEN'); // {systeem:true} hieronder kent de alleen-lezen-inzage niet
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar) return { fout: 'ALLEEN_EIGENAAR' as const };
    const u = (await q(`SELECT id FROM app.records WHERE tbl = 'users' AND lower(data->>'email') = lower($1) AND data->>'status' = 'approved'`, [String(v.email || '').trim()])).rows[0];
    if (!u) return { fout: 'GEBRUIKER_ONBEKEND' as const };
    await lidSchrijven(q, woningId, String(u.id), rol, lidTermijn(rol, v.dagen));
    await gebeurtenis(q, woningId, { soort: 'leden', ernst: 'belangrijk', bericht: `Lid toegevoegd (${rol})`, gegevens: { userId: u.id } });
    return { ok: true as const };
  }, { systeem: true });
}
/** De tab «Налаштування / Instellingen» van huis.tarasevych.com (paden van tabs: shared/werkblad-register.ts). */
const HUIS_INSTELLINGEN_URL = 'https://huis.tarasevych.com/settings';
let koppeling: Promise<void> = Promise.resolve();
/** Alleen voor eenheidstests: wacht tot het koppelen van de laatste uitnodiging(en) aan een account klaar is. */
export const _uitnodigingKoppelingKlaar = (): Promise<void> => koppeling;
/**
 * Iemand uitnodigen voor een woning (alleen de eigenaar). Het antwoord is voor ELK geldig adres hetzelfde — of er een account
 * achter zit, blijkt nergens uit: niet uit de status, niet uit de inhoud en niet uit de duur (het opzoeken van het account en de
 * melding gebeuren na het antwoord, los van dit verzoek). Lid wordt de genodigde pas door zelf te aanvaarden.
 */
export async function lidUitnodigen(userId: string, woningId: string, v: { email: string; rol: string; dagen?: number }) {
  const rol = lidRol(v.rol);
  const email = schoonEmail(v.email); if (!email) return { fout: 'EMAIL_ONGELDIG' as const };
  const stap = await alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar) return { fout: 'ALLEEN_EIGENAAR' as const };
    // Verlopen uitnodigingen (met het adres erin) blijven niet liggen; een afwijzing blijft tot het einde van haar 14 dagen.
    await q(`DELETE FROM app.huis_uitnodigingen WHERE woning_id = $1 AND verloopt_op < now() AND (afgewezen_op IS NULL OR afgewezen_op < now() - ($2 || ' days')::interval)`, [woningId, String(HUIS_UITNODIGING.geldigDagen)]);
    const open = Number((await q(`SELECT count(*)::int AS n FROM app.huis_uitnodigingen WHERE woning_id = $1 AND email <> $2 AND stand <> 'ingetrokken' AND verloopt_op > now()`, [woningId, email])).rows[0].n);
    if (open >= HUIS_UITNODIGING.openPerWoning) return { fout: 'TE_VEEL_UITNODIGINGEN' as const };
    // Wat de uitnodiger kan zien (rol, einddatum) wordt voor ELKE rij op dezelfde manier ververst. Een afwijzing van de laatste
    // 14 dagen blijft in afgewezen_op staan: opnieuw uitnodigen heft haar niet op en geeft de genodigde geen nieuwe melding.
    const { rows } = await q(`INSERT INTO app.huis_uitnodigingen AS u (woning_id, email, door_user_id, rol, lid_geldig_tot, verloopt_op)
      VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' days')::interval)
      ON CONFLICT (woning_id, email) DO UPDATE SET rol = EXCLUDED.rol, lid_geldig_tot = EXCLUDED.lid_geldig_tot, door_user_id = EXCLUDED.door_user_id, updated_at = now(),
        stand = 'uitgenodigd', verloopt_op = EXCLUDED.verloopt_op,
        afgewezen_op = CASE WHEN u.afgewezen_op > now() - ($6 || ' days')::interval THEN u.afgewezen_op ELSE NULL END
      RETURNING id`, [woningId, email, userId, rol, lidTermijn(rol, v.dagen), String(HUIS_UITNODIGING.geldigDagen)]);
    await gebeurtenis(q, woningId, { soort: 'leden', ernst: 'belangrijk', bericht: `Запрошення записано (${rolPaar(rol).uk}); учасником людина стане лише після власної згоди / Uitnodiging vastgelegd (${rolPaar(rol).nl}); lid wordt de genodigde pas na eigen aanvaarding`, gegevens: { uitnodigingId: rows[0].id } });
    return { id: String(rows[0].id) };
  });
  if ('fout' in stap) return stap;
  // Geen adres in de auditregel: de uitnodiging zelf (id) is genoeg om haar terug te vinden.
  await huisAudit(userId, userId, 'huis.uitnodiging.vastgelegd', 'ok', { woningId, uitnodigingId: stap.id, rol });
  // Na het antwoord: bestaat er een goedgekeurd account met dit adres? Dan koppelen en één melding. Een fout hier verandert niets
  // aan het antwoord (de uitnodiging blijft dan onzichtbaar voor de genodigde en verloopt gewoon).
  koppeling = koppeling.then(() => uitnodigingKoppelen(userId, woningId, stap.id)).catch((err) => { console.error('[huis] uitnodiging koppelen mislukt:', (err as Error).message); });
  return { ok: true as const, stand: 'uitgenodigd' as const };
}
/** Systeemstap na lidUitnodigen: het account bij het adres zoeken, de uitnodiging eraan koppelen en de genodigde melden. */
async function uitnodigingKoppelen(doorUserId: string, woningId: string, uitnodigingId: string): Promise<void> {
  const m = await alsGebruiker(doorUserId, async (q) => {
    // Opruimen over alle woningen heen (dit is de systeemstap): verlopen uitnodigingen dragen e-mailadressen en horen weg.
    await q(`DELETE FROM app.huis_uitnodigingen WHERE verloopt_op < now() AND (afgewezen_op IS NULL OR afgewezen_op < now() - ($1 || ' days')::interval)`, [String(HUIS_UITNODIGING.geldigDagen)]);
    const u = (await q(`SELECT u.*, w.naam AS woning_naam, w.user_id AS eigenaar_id FROM app.huis_uitnodigingen u JOIN app.huis_woningen w ON w.id = u.woning_id WHERE u.id::text = $1 AND u.woning_id::text = $2 FOR UPDATE OF u`, [uitnodigingId, woningId])).rows[0];
    if (!u || u.stand !== 'uitgenodigd' || u.afgewezen_op || String(u.eigenaar_id) !== doorUserId) return null; // afgewezen (blijft staan), ingetrokken of geen eigenaar meer
    // Precies één goedgekeurd account met dit adres; bij twee (zou niet mogen) koppelen we niet.
    const accounts = (await q(`SELECT id FROM app.records WHERE tbl = 'users' AND lower(data->>'email') = $1 AND data->>'status' = 'approved' ORDER BY id LIMIT 2`, [u.email])).rows;
    if (accounts.length !== 1) { if (u.user_id) await q(`UPDATE app.huis_uitnodigingen SET user_id = NULL WHERE id = $1`, [u.id]); return null; }
    const lidId = String(accounts[0].id);
    if (lidId === doorUserId) { await q(`DELETE FROM app.huis_uitnodigingen WHERE id = $1`, [u.id]); return null; } // het eigen adres: niets te doen
    // Wie al (geldig) lid is, gaf zijn toestemming al: de eigenaar past dan alleen rol en termijn aan, zoals voorheen.
    if ((await q(`SELECT 1 FROM app.huis_leden WHERE woning_id = $1 AND user_id = $2 AND (geldig_tot IS NULL OR geldig_tot > now())`, [u.woning_id, lidId])).rows.length) {
      await lidSchrijven(q, String(u.woning_id), lidId, u.rol, u.lid_geldig_tot);
      await q(`DELETE FROM app.huis_uitnodigingen WHERE id = $1`, [u.id]);
      await gebeurtenis(q, woningId, { soort: 'leden', ernst: 'belangrijk', bericht: `Роль учасника змінено (${rolPaar(u.rol).uk}) / Rol van een lid gewijzigd (${rolPaar(u.rol).nl})`, gegevens: { userId: lidId } });
      return { rolGewijzigd: true as const, lidId, rol: String(u.rol) };
    }
    // Hoogstens één melding per etmaal per woning aan dezelfde genodigde, ook na intrekken en opnieuw uitnodigen.
    const melden = String(u.user_id || '') !== lidId || !u.gemeld_op || Date.now() - new Date(u.gemeld_op).getTime() > HUIS_UITNODIGING.herhaalMeldingUren * 3600_000;
    await q(`UPDATE app.huis_uitnodigingen SET user_id = $2, gemeld_op = CASE WHEN $3::boolean THEN now() ELSE gemeld_op END WHERE id = $1`, [u.id, lidId, melden]);
    if (!melden) return null;
    const door = (await q(`SELECT data->>'email' AS email FROM app.records WHERE tbl = 'users' AND id = $1`, [doorUserId])).rows[0];
    return { lidId, woningNaam: String(u.woning_naam), rol: String(u.rol), doorEmail: String(door?.email || '') };
  }, { systeem: true });
  if (!m) return;
  if ('rolGewijzigd' in m) { await huisAudit(doorUserId, doorUserId, 'huis.lid.rol-gewijzigd', 'ok', { woningId, lidId: m.lidId, rol: m.rol }); return; }
  const rol = HUIS_ROL_LABEL[m.rol] ?? [m.rol, m.rol];
  await meld(m.lidId, 'workspace_share', `${HUIS_UITLEG.UITNODIGING_MELDING_TITEL[0]} / ${HUIS_UITLEG.UITNODIGING_MELDING_TITEL[1]}`,
    // SEC-002 (na de toetsing, opm. 12): zeggen WAAR men aanvaardt, en de link gaat rechtstreeks naar die tab.
    `${m.doorEmail} запрошує вас до оселі «${m.woningNaam}» (роль: ${rol[0]}). Прийняти чи відхилити: «Налаштування» → «Запрошення для вас». ${HUIS_UITLEG.UITNODIGING_AANVAARDEN[0]} / ${m.doorEmail} nodigt u uit voor de woning «${m.woningNaam}» (rol: ${rol[1]}). Aanvaarden of afwijzen: «Instellingen» → «Uitnodigingen voor u». ${HUIS_UITLEG.UITNODIGING_AANVAARDEN[1]}`,
    HUIS_INSTELLINGEN_URL);
}
/** Openstaande uitnodigingen van een woning, voor de EIGENAAR. Een afwijzing is hier niet te zien (afgewezen_op wordt niet gelezen); geen account-id, geen naam. */
export async function uitnodigingenVanWoning(userId: string, woningId: string): Promise<Uitnodiging[] | null> {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid) return null;
    if (!lid.eigenaar) return [];
    return (await q(`SELECT id, email, rol, lid_geldig_tot, verloopt_op, created_at FROM app.huis_uitnodigingen WHERE woning_id = $1 AND stand <> 'ingetrokken' AND verloopt_op > now() ORDER BY created_at DESC LIMIT 100`, [woningId])).rows
      .map((r) => ({ id: String(r.id), woningId, email: String(r.email), rol: String(r.rol), lidGeldigTot: isoOfNull(r.lid_geldig_tot), stand: 'uitgenodigd' as const, verlooptOp: iso(r.verloopt_op), aangemaaktOp: iso(r.created_at) }));
  });
}
/** De eigenaar trekt een uitnodiging in. De rij blijft (onzichtbaar) staan, zodat opnieuw uitnodigen geen reeks meldingen geeft. */
export async function uitnodigingIntrekken(userId: string, woningId: string, uitnodigingId: string) {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar) return { fout: 'ALLEEN_EIGENAAR' as const };
    const { rows } = await q(`UPDATE app.huis_uitnodigingen SET stand = 'ingetrokken', updated_at = now() WHERE id::text = $2 AND woning_id = $1 AND stand <> 'ingetrokken' RETURNING id`, [woningId, uitnodigingId]);
    return rows[0] ? { ingetrokken: true as const } : { fout: 'NIET_GEVONDEN' as const };
  }).then(async (r) => { if ('ingetrokken' in r) await huisAudit(userId, userId, 'huis.uitnodiging.ingetrokken', 'ok', { woningId, uitnodigingId }); return r; });
}
/** Uitnodigingen aan MIJ (nog geen lid, dus via de systeemrol met een uitdrukkelijke controle op mijn eigen id). */
export async function uitnodigingenVoorMij(userId: string): Promise<UitnodigingVoorMij[]> {
  return alsGebruiker(userId, async (q) => (await q(`SELECT u.id, u.rol, u.lid_geldig_tot, u.verloopt_op, u.created_at, w.naam AS woning_naam, r.data->>'email' AS door_email, r.data->>'name' AS door_naam
      FROM app.huis_uitnodigingen u JOIN app.huis_woningen w ON w.id = u.woning_id AND w.user_id = u.door_user_id LEFT JOIN app.records r ON r.tbl = 'users' AND r.id = u.door_user_id
      WHERE u.user_id = $1 AND u.stand = 'uitgenodigd' AND u.afgewezen_op IS NULL AND u.verloopt_op > now() ORDER BY u.created_at DESC LIMIT 50`, [userId])).rows
    .map((r) => ({ id: String(r.id), woningNaam: String(r.woning_naam), rol: String(r.rol), lidGeldigTot: isoOfNull(r.lid_geldig_tot), doorEmail: String(r.door_email || ''), doorNaam: String(r.door_naam || ''), verlooptOp: iso(r.verloopt_op), aangemaaktOp: iso(r.created_at) })), { systeem: true });
}
/** De genodigde beslist zelf. Aanvaarden maakt hem lid; afwijzen blijft voor de uitnodiger onzichtbaar tot de uitnodiging verloopt. */
export async function uitnodigingBesluiten(userId: string, uitnodigingId: string, aanvaarden: boolean) {
  if (isAlleenLezen()) throw new Error('IMPERSONATIE_ALLEEN_LEZEN'); // {systeem:true} hieronder kent de alleen-lezen-inzage niet
  type Besluit = { fout: 'NIET_GEVONDEN' } | { afgewezen: true; woningId: string } | { aanvaard: true; woningId: string; rol: string; eigenaarId: string; woningNaam: string; email: string };
  const uit = await alsGebruiker(userId, async (q): Promise<Besluit> => {
    // Alleen MIJN uitnodiging, nog open, niet verlopen, en de uitnodiger is nog altijd eigenaar van die woning.
    const u = (await q(`SELECT u.*, w.naam AS woning_naam FROM app.huis_uitnodigingen u JOIN app.huis_woningen w ON w.id = u.woning_id AND w.user_id = u.door_user_id
      WHERE u.id::text = $1 AND u.user_id = $2 AND u.stand = 'uitgenodigd' AND u.afgewezen_op IS NULL AND u.verloopt_op > now() FOR UPDATE OF u`, [uitnodigingId, userId])).rows[0];
    if (!u) return { fout: 'NIET_GEVONDEN' as const };
    if (!aanvaarden) { await q(`UPDATE app.huis_uitnodigingen SET afgewezen_op = now(), updated_at = now() WHERE id = $1`, [u.id]); return { afgewezen: true as const, woningId: String(u.woning_id) }; }
    if (u.lid_geldig_tot && new Date(u.lid_geldig_tot).getTime() < Date.now()) { await q(`DELETE FROM app.huis_uitnodigingen WHERE id = $1`, [u.id]); return { fout: 'NIET_GEVONDEN' as const }; }
    await lidSchrijven(q, String(u.woning_id), userId, u.rol, u.lid_geldig_tot);
    await q(`DELETE FROM app.huis_uitnodigingen WHERE id = $1`, [u.id]);
    await gebeurtenis(q, String(u.woning_id), { soort: 'leden', ernst: 'belangrijk', bericht: `Запрошення прийнято: новий учасник (${rolPaar(u.rol).uk}) / Uitnodiging aanvaard: nieuw lid (${rolPaar(u.rol).nl})`, gegevens: { userId } });
    const ik = (await q(`SELECT data->>'email' AS email FROM app.records WHERE tbl = 'users' AND id = $1`, [userId])).rows[0];
    return { aanvaard: true as const, woningId: String(u.woning_id), rol: String(u.rol), eigenaarId: String(u.door_user_id), woningNaam: String(u.woning_naam), email: String(ik?.email || '') };
  }, { systeem: true });
  // SEC-002 (na de toetsing, opm. 6): een afwijzing staat alleen in het logboek van de genodigde (de uitnodiger ziet haar nergens);
  // een aanvaarding — nieuw lidmaatschap, dus toegang tot apparaten en gebeurtenissen — bij de eigenaar van de woning.
  if ('afgewezen' in uit) { await huisAudit(userId, userId, 'huis.uitnodiging.afgewezen', 'ok', { uitnodigingId }); return { afgewezen: true as const }; }
  if ('aanvaard' in uit) {
    await huisAudit(uit.eigenaarId, userId, 'huis.uitnodiging.aanvaard', 'ok', { woningId: uit.woningId, uitnodigingId, lidId: userId, rol: uit.rol });
    const rol = HUIS_ROL_LABEL[uit.rol] ?? [uit.rol, uit.rol];
    await meld(uit.eigenaarId, 'workspace_share', `${HUIS_UITLEG.UITNODIGING_AANVAARD_TITEL[0]} / ${HUIS_UITLEG.UITNODIGING_AANVAARD_TITEL[1]}`,
      `${uit.email} прийняв(ла) запрошення до оселі «${uit.woningNaam}» (роль: ${rol[0]}) і тепер бачить її пристрої та події. Прибрати учасника можна в «Налаштування → Учасники». / ${uit.email} heeft de uitnodiging voor de woning «${uit.woningNaam}» aanvaard (rol: ${rol[1]}) en ziet nu haar apparaten en gebeurtenissen. Een lid weghalen kan onder «Instellingen → Leden».`,
      HUIS_INSTELLINGEN_URL);
    return { aanvaard: true as const, woningId: uit.woningId, rol: uit.rol };
  }
  return uit;
}
export async function lidVerwijderen(userId: string, woningId: string, lidUserId: string) {
  const weg = await alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar || lidUserId === userId) return false;
    const rij = (await q(`DELETE FROM app.huis_leden WHERE woning_id = $1 AND user_id::text = $2 RETURNING rol`, [woningId, lidUserId])).rows[0];
    if (rij) await gebeurtenis(q, woningId, { soort: 'leden', ernst: 'belangrijk', bericht: `Учасника прибрано (${rolPaar(String(rij.rol)).uk}) / Lid weggehaald (${rolPaar(String(rij.rol)).nl})`, gegevens: { userId: lidUserId } });
    return Boolean(rij);
  });
  // SEC-002 (na de toetsing, opm. 6): het einde van een lidmaatschap laat een vaste regel na, zoals het begin.
  if (weg) await huisAudit(userId, userId, 'huis.lid.verwijderd', 'ok', { woningId, lidId: lidUserId });
  return weg;
}
/**
 * SEC-002 (na de toetsing, opm. 11): wie lid werd (met toestemming, of vóór de patch zonder), kan die toestemming altijd intrekken
 * door zelf te vertrekken. Alleen het EIGEN lidmaatschap; de eigenaar kan zijn woning niet verlaten (hij verwijdert haar).
 */
export async function lidVerlaten(userId: string, woningId: string) {
  const uit = await alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid) return { fout: 'NIET_GEVONDEN' as const };
    if (lid.eigenaar) return { fout: 'EIGENAAR_KAN_NIET_VERTREKKEN' as const };
    const w = (await q(`SELECT user_id FROM app.huis_woningen WHERE id::text = $1`, [woningId])).rows[0];
    // De gebeurtenis eerst: na het vertrek laat RLS geen schrijven in deze woning meer toe.
    await gebeurtenis(q, woningId, { soort: 'leden', ernst: 'belangrijk', bericht: `Учасник сам вийшов з оселі (${rolPaar(lid.rol).uk}) / Een lid heeft de woning zelf verlaten (${rolPaar(lid.rol).nl})`, gegevens: { userId } });
    await q(`DELETE FROM app.huis_leden WHERE woning_id = $1 AND user_id::text = $2`, [woningId, userId]);
    return { vertrokken: true as const, eigenaarId: String(w?.user_id ?? '') };
  });
  if ('fout' in uit) return uit;
  if (uit.eigenaarId) await huisAudit(uit.eigenaarId, userId, 'huis.lid.vertrokken', 'ok', { woningId, lidId: userId });
  return { vertrokken: true as const };
}
export async function woningWijzigen(userId: string, woningId: string, v: { naam?: string; tijdzone?: string; taal?: string; verdiepingen?: unknown }) {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar) return { fout: 'ALLEEN_EIGENAAR' as const };
    const cur = (await q(`SELECT * FROM app.huis_woningen WHERE id::text = $1`, [woningId])).rows[0];
    const naam = v.naam === undefined ? cur.naam : String(v.naam).replace(/\s+/g, ' ').trim(); if (!naam || naam.length > 80) return { fout: 'NAAM_ONGELDIG' as const };
    const tijdzone = v.tijdzone === undefined ? cur.tijdzone : String(v.tijdzone); if (!geldigeTijdzone(tijdzone)) return { fout: 'TIJDZONE_ONGELDIG' as const };
    const verd = Array.isArray(v.verdiepingen) ? v.verdiepingen.slice(0, 12).map((x: any, i: number) => ({ id: String(x?.id ?? i).slice(0, 10), naam: String(x?.naam ?? '').slice(0, 40) || `${i}` })) : cur.verdiepingen;
    const { rows } = await q(`UPDATE app.huis_woningen SET naam = $2, tijdzone = $3, taal = $4, verdiepingen = $5::jsonb, updated_at = now() WHERE id::text = $1 RETURNING *`, [woningId, naam, tijdzone, v.taal === 'nl' ? 'nl' : v.taal === 'uk' ? 'uk' : cur.taal, JSON.stringify(verd)]);
    return woningUit({ ...rows[0], rol: 'eigenaar' }, userId);
  });
}

// ---------------------------------------------------------------- gecontroleerde lijst van vertrouwde toestellen (alleen systeemeigenaar)
const VERTROUWDE_TOESTELLEN_TBL = 'huis_vertrouwde_toestellen_v1';
type VertrouwdToestelRij = { patroon: string; label: string; doorUserId: string; aangemaaktOp: string };
const isSysteemEigenaar = (u: { id?: string; email?: string; role?: string } | null | undefined): boolean =>
  Boolean(u && u.role === 'owner' && isOwnerEmail(u.email));

zetVertrouwdeToestellenBron(async () => {
  const { items } = await alsSysteem(() => db.list<VertrouwdToestelRij>(VERTROUWDE_TOESTELLEN_TBL, { limit: 100 }));
  return items.map((x) => String(x.patroon || '')).filter(Boolean);
});

export async function vertrouwdeToestellenLijst(user: SessionOk['user']) {
  if (!isSysteemEigenaar(user)) return { fout: 'ALLEEN_SYSTEEMEIGENAAR' as const };
  const { items } = await alsSysteem(() => db.list<VertrouwdToestelRij>(VERTROUWDE_TOESTELLEN_TBL, { limit: 100 }));
  return {
    toestellen: (items as Array<{ id: string } & VertrouwdToestelRij>).map((x) => ({ id: x.id, patroon: x.patroon, label: x.label, aangemaaktOp: x.aangemaaktOp })),
    uitOmgeving: vertrouwdeToestellenUitEnv().map((x) => x.patroon),
  };
}
export async function vertrouwdToestelToevoegen(user: SessionOk['user'], v: { adres: string; label?: string }) {
  if (!isSysteemEigenaar(user)) return { fout: 'ALLEEN_SYSTEEMEIGENAAR' as const };
  const regel = parseVertrouwdToestel(v.adres);
  if (!regel) return { fout: 'ADRES_GEWEIGERD' as const };
  const label = String(v.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || regel.patroon;
  const { items } = await alsSysteem(() => db.list<VertrouwdToestelRij>(VERTROUWDE_TOESTELLEN_TBL, { filter: { patroon: regel.patroon }, limit: 2 }));
  if (items.length) return { fout: 'TOESTEL_BESTAAT' as const };
  const record: VertrouwdToestelRij = { patroon: regel.patroon, label, doorUserId: user.id, aangemaaktOp: new Date().toISOString() };
  const [id] = await alsSysteem(() => db.add(VERTROUWDE_TOESTELLEN_TBL, [record as unknown as Record<string, unknown>]));
  await auditToevoegen({ ownerId: user.id, actorId: user.id, action: 'huis.vertrouwd-toestel.toegevoegd', type: 'huis', result: 'ok', details: { id, patroon: regel.patroon, label } }).catch(() => undefined);
  return { toestel: { id: String(id || ''), patroon: regel.patroon, label, aangemaaktOp: record.aangemaaktOp } };
}
export async function vertrouwdToestelVerwijderen(user: SessionOk['user'], id: string) {
  if (!isSysteemEigenaar(user)) return { fout: 'ALLEEN_SYSTEEMEIGENAAR' as const };
  if (!id || id.length > 120) return { fout: 'ID_ONGELDIG' as const };
  const [rij] = await alsSysteem(() => db.get<VertrouwdToestelRij>(VERTROUWDE_TOESTELLEN_TBL, [id]));
  if (!rij) return { fout: 'NIET_GEVONDEN' as const };
  await alsSysteem(() => db.delete(VERTROUWDE_TOESTELLEN_TBL, [id]));
  await auditToevoegen({ ownerId: user.id, actorId: user.id, action: 'huis.vertrouwd-toestel.verwijderd', type: 'huis', result: 'ok', details: { id, patroon: rij.patroon } }).catch(() => undefined);
  return { verwijderd: true as const };
}

// ---------------------------------------------------------------- routes
const DIENSTEN = ['huis', 'hub'] as const;
export function huisRoutes(requireSession: RequireSession, deps: HuisDeps = {}): Record<string, RouterMiddleware[]> {
  type Run = (ctx: Ctx, auth: SessionOk, d: Record<string, unknown>) => Promise<Resp>;
  const route = (run: Run): RouterMiddleware[] => [(async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!(DIENSTEN as readonly string[]).includes(auth.service)) return error('HUIS_SERVICE_REQUIRED', 403);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    try { return await run(ctx, auth, bodyOf(ctx.body)); }
    catch (err) {
      if (tabelOntbreekt(err)) return error('HUIS_MIGRATIE_ONTBREEKT', 503);
      // UI-005: 42P17 = RLS-kringloop (0128 zonder 0131). Duidelijk in het serverlog, rustige code naar de browser.
      if (err && typeof err === 'object' && (err as { code?: string }).code === '42P17') { console.error('[huis] RLS-kringloop in app.huis_* (migratie 0131 ontbreekt?)'); return error('HUIS_SERVER_FOUT', 500); }
      if (err instanceof Error && /^[A-Z_]{4,40}(:|$)/.test(err.message)) return error(err.message.split(':')[0], 400);
      throw err;
    }
  }) as RouterMiddleware];
  const w = (d: Record<string, unknown>) => (isUuid(d.woningId) ? d.woningId : '');
  const schrijfGeweigerd = (a: SessionOk) => denyMutation(a.user, 'workspace.write') || null;
  // SEC-002: tempolimiet per gebruiker voor wat de bron aanroept of uitnodigt (HUIS_TEMPO). Geteld ná de vormcontrole van de
  // invoer en vóór elk werk; schrijvende soorten weigeren ook wanneer de teller zelf (de databank) niet te bereiken is.
  const tempo = async (a: SessionOk, soort: keyof typeof HUIS_TEMPO): Promise<Resp | null> => {
    const [max, venster, dicht] = HUIS_TEMPO[soort];
    const t = await rateLimit(`huis-${soort}:${a.user.id}`, max, venster, { failClosed: dicht });
    if (t.ok) return null;
    // SEC-002 (na de toetsing, opm. 6): de EERSTE weigering in een venster laat een auditregel na (zonder adressen of inhoud); bij
    // het uitnodigen krijgt de eigenaar van het account ook één melding — tien uitnodigingen per uur bereikt men niet per ongeluk.
    if (t.hits === max + 1) {
      await huisAudit(a.user.id, a.user.id, 'huis.tempo.geweigerd', 'denied', { soort, limiet: max, vensterS: venster });
      if (soort === 'uitnodigen') await meld(a.user.id, 'security_warning', 'Ліміт запрошень до оселі вичерпано / Limiet voor uitnodigingen voor een woning bereikt',
        `За останню годину з вашого облікового запису надіслано ${max} запрошень до оселі; наступні тимчасово відхиляються. Якщо це були не ви — змініть вхід і перевірте учасників і запрошення в «Налаштування → Учасники». / In het afgelopen uur zijn vanuit uw account ${max} uitnodigingen voor een woning verstuurd; volgende worden tijdelijk geweigerd. Was u dit niet, beveilig dan uw aanmelding en controleer leden en uitnodigingen onder «Instellingen → Leden».`,
        HUIS_INSTELLINGEN_URL);
    }
    return error('RATE_LIMITED', 429);
  };
  const foutResp = (f: string) => error(f, f === 'NIET_GEVONDEN' || f === 'APPARAAT_ONBEKEND' ? 404 : f === 'GEEN_TOEGANG' || f === 'ALLEEN_EIGENAAR' || f === 'ALLEEN_SYSTEEMEIGENAAR' || f === 'TOESTEL_NIET_VERTROUWD' ? 403 : f === 'TOESTEL_BESTAAT' ? 409 : f === 'HUIS_BEZET' || f === 'RATE_LIMITED' ? 429 : f === 'HUIS_MIGRATIE_ONTBREEKT' ? 503 : 400);
  const uit = (r: unknown, sleutel?: string) => (r === null ? error('NIET_GEVONDEN', 404) : r && typeof r === 'object' && 'fout' in (r as object) && (r as { fout?: string }).fout ? foutResp(String((r as { fout: string }).fout)) : json(sleutel ? { [sleutel]: r } : (r as object)));

  return {
    'POST /api/huis/vertrouwde-toestellen': route(async (ctx, a, d) => {
      if (!isSysteemEigenaar(a.user)) return error('ALLEEN_SYSTEEMEIGENAAR', 403);
      const actie = String(d.actie || 'lijst');
      if (actie === 'lijst') return uit(await vertrouwdeToestellenLijst(a.user));
      if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403);
      const su = await deps.stepUp(ctx, a);
      if (su) return su;
      if (actie === 'toevoegen') return uit(await vertrouwdToestelToevoegen(a.user, { adres: String(d.adres ?? ''), label: typeof d.label === 'string' ? d.label : undefined }));
      if (actie === 'verwijder') return uit(await vertrouwdToestelVerwijderen(a.user, String(d.id ?? '')));
      return error('ACTIE_ONGELDIG', 400);
    }),
    'POST /api/huis/woningen': route(async (_c, a) => json({ woningen: await woningenLijst(a.user.id) })),
    'POST /api/huis/woningen/nieuw': route(async (_c, a, d) => schrijfGeweigerd(a) || uit(await woningMaken(a.user.id, String(d.naam ?? ''), typeof d.tijdzone === 'string' ? d.tijdzone : undefined, d.taal === 'nl' ? 'nl' : 'uk'), 'woning')),
    'POST /api/huis/woningen/wijzig': route(async (_c, a, d) => schrijfGeweigerd(a) || (w(d) ? uit(await woningWijzigen(a.user.id, w(d), d as any), 'woning') : error('WONING_ONGELDIG', 400))),
    'POST /api/huis/overzicht': route(async (_c, a, d) => w(d) ? uit(await overzicht(a.user.id, w(d))) : error('WONING_ONGELDIG', 400)),
    'POST /api/huis/ruimtes': route(async (_c, a, d) => {
      const weiger = schrijfGeweigerd(a); if (weiger) return weiger;
      if (!w(d)) return error('WONING_ONGELDIG', 400);
      const actie = String(d.actie || '');
      if (actie === 'nieuw') return uit(await ruimteMaken(a.user.id, w(d), d as any), 'ruimte');
      if (!isUuid(d.id)) return error('ID_ONGELDIG', 400);
      if (actie === 'wijzig') return uit(await ruimteWijzigen(a.user.id, w(d), d.id, d as any), 'ruimte');
      if (actie === 'verwijder') return (await ruimteVerwijderen(a.user.id, w(d), d.id)) ? json({ verwijderd: true }) : error('NIET_GEVONDEN', 404);
      return error('ACTIE_ONGELDIG', 400);
    }),
    'POST /api/huis/apparaten/wijzig': route(async (_c, a, d) => schrijfGeweigerd(a) || (w(d) && isUuid(d.id) ? uit(await apparaatWijzigen(a.user.id, w(d), d.id, { naam: typeof d.naam === 'string' ? d.naam : undefined, ruimteId: d.ruimteId === null ? null : isUuid(d.ruimteId) ? d.ruimteId : undefined, verborgen: typeof d.verborgen === 'boolean' ? d.verborgen : undefined }), 'apparaat') : error('ID_ONGELDIG', 400))),
    'POST /api/huis/integraties/instellen': route(async (_c, a, d) => schrijfGeweigerd(a) || (w(d) ? (await tempo(a, 'ha-beheer')) || uit(await integratieInstellen(a.user.id, w(d), { adres: String(d.adres ?? ''), token: String(d.token ?? ''), naam: typeof d.naam === 'string' ? d.naam : undefined }), 'integratie') : error('WONING_ONGELDIG', 400))),
    'POST /api/huis/integraties/ontdekken': route(async (_c, a, d) => w(d) && isUuid(d.integratieId) ? (await tempo(a, 'ha-beheer')) || uit(await integratieOntdekken(a.user.id, w(d), d.integratieId)) : error('ID_ONGELDIG', 400)),
    'POST /api/huis/integraties/importeren': route(async (_c, a, d) => schrijfGeweigerd(a) || (w(d) && isUuid(d.integratieId) ? (await tempo(a, 'ha-beheer')) || uit(await integratieImporteren(a.user.id, w(d), d.integratieId, Array.isArray(d.bronIds) ? d.bronIds.map(String).slice(0, 2000) : null)) : error('ID_ONGELDIG', 400))),
    'POST /api/huis/integraties/synchroniseren': route(async (_c, a, d) => w(d) && isUuid(d.integratieId) ? (await tempo(a, 'ha-beheer')) || uit(await integratieSynchroniseren(a.user.id, w(d), d.integratieId)) : error('ID_ONGELDIG', 400)),
    // Schrijftoestemming aanzetten is een beveiligingskeuze: step-up van de eigenaar (dezelfde poort als de andere kritieke acties).
    'POST /api/huis/integraties/schrijven': route(async (ctx, a, d) => {
      const weiger = schrijfGeweigerd(a); if (weiger) return weiger;
      if (!w(d) || !isUuid(d.integratieId)) return error('ID_ONGELDIG', 400);
      if (d.aan === true) { if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403); const su = await deps.stepUp(ctx, a); if (su) return su; }
      return uit(await integratieSchrijven(a.user.id, w(d), d.integratieId, d.aan === true), 'integratie');
    }),
    'POST /api/huis/integraties/verwijderen': route(async (_c, a, d) => schrijfGeweigerd(a) || (w(d) && isUuid(d.integratieId) ? uit(await integratieVerwijderen(a.user.id, w(d), d.integratieId)) : error('ID_ONGELDIG', 400))),
    'POST /api/huis/opdrachten/nieuw': route(async (ctx, a, d) => {
      const weiger = schrijfGeweigerd(a); if (weiger) return weiger;
      if (!w(d) || !isUuid(d.apparaatId)) return error('ID_ONGELDIG', 400);
      const teVeel = await tempo(a, 'ha-opdracht'); if (teVeel) return teVeel;
      let stepUpOk = false;
      if (d.kritiekBevestigd === true) { if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403); const su = await deps.stepUp(ctx, a); if (su) return su; stepUpOk = true; }
      const r = await opdrachtGeven(a.user.id, w(d), { apparaatId: d.apparaatId, mogelijkheid: String(d.mogelijkheid ?? '') as MogelijkheidSoort, waarde: d.waarde, idempotentie: String(d.idempotentie ?? ''), via: 'site', stepUpOk });
      return r.ok ? json({ opdracht: r.opdracht }) : json({ error: r.fout, opdracht: r.opdracht ?? null }, r.fout === 'STEP_UP_VEREIST' ? 403 : r.fout === 'GEEN_TOEGANG' ? 403 : r.fout === 'HUIS_BEZET' ? 429 : r.fout === 'IDEMPOTENTIE_ONGELDIG' ? 400 : 409);
    }),
    // Niet via uit(): een afgesloten opdracht draagt zelf een veld `fout` (GEEN_ACK, GEEN_WAARNEMING, VERZENDING_ONDERBROKEN) en
    // werd daardoor als 400 teruggegeven — de pagina zag dan nooit de eindstand (SEC-002, na de toetsing).
    'POST /api/huis/opdrachten/een': route(async (_c, a, d) => { if (!w(d) || !isUuid(d.id)) return error('ID_ONGELDIG', 400); const teVeel = await tempo(a, 'ha-lezen'); if (teVeel) return teVeel; const o = await opdrachtLezen(a.user.id, w(d), d.id); return o ? json({ opdracht: o }) : error('NIET_GEVONDEN', 404); }),
    'POST /api/huis/opdrachten': route(async (_c, a, d) => w(d) ? uit(await opdrachtenLijst(a.user.id, w(d), Number(d.limiet) || 50), 'opdrachten') : error('WONING_ONGELDIG', 400)),
    'POST /api/huis/scenes': route(async (_c, a, d) => {
      if (!w(d)) return error('WONING_ONGELDIG', 400);
      const actie = String(d.actie || 'lijst');
      if (actie === 'lijst') return uit(await scenesLijst(a.user.id, w(d)), 'scenes');
      const weiger = schrijfGeweigerd(a); if (weiger) return weiger;
      if (actie === 'bewaar') return uit(await sceneBewaren(a.user.id, w(d), isUuid(d.id) ? d.id : null, d), 'scene');
      if (!isUuid(d.id)) return error('ID_ONGELDIG', 400);
      if (actie === 'verwijder') return (await sceneVerwijderen(a.user.id, w(d), d.id)) ? json({ verwijderd: true }) : error('NIET_GEVONDEN', 404);
      if (actie === 'uitvoeren') { if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(d.idempotentie ?? '')) || VOORSTEL_SLEUTEL.test(String(d.idempotentie))) return error('IDEMPOTENTIE_ONGELDIG', 400); return (await tempo(a, 'ha-scene')) || uit(await sceneUitvoeren(a.user.id, w(d), d.id, String(d.idempotentie))); }
      return error('ACTIE_ONGELDIG', 400);
    }),
    'POST /api/huis/automatiseringen': route(async (_c, a, d) => {
      if (!w(d)) return error('WONING_ONGELDIG', 400);
      const actie = String(d.actie || 'lijst');
      if (actie === 'lijst') return uit(await automatiseringenLijst(a.user.id, w(d)), 'automatiseringen');
      if (actie === 'droogloop') return uit(await automatiseringDroogloop(a.user.id, w(d), d.regel, typeof d.tijd === 'string' ? d.tijd : undefined));
      const weiger = schrijfGeweigerd(a); if (weiger) return weiger;
      if (actie === 'bewaar') return uit(await automatiseringBewaren(a.user.id, w(d), isUuid(d.id) ? d.id : null, { naam: String(d.naam ?? ''), regel: d.regel, stand: typeof d.stand === 'string' ? d.stand : undefined }), 'automatisering');
      if (actie === 'verwijder' && isUuid(d.id)) return (await automatiseringVerwijderen(a.user.id, w(d), d.id)) ? json({ verwijderd: true }) : error('NIET_GEVONDEN', 404);
      return error('ACTIE_ONGELDIG', 400);
    }),
    'POST /api/huis/gebeurtenissen': route(async (_c, a, d) => w(d) ? uit(await gebeurtenissenLijst(a.user.id, w(d), { voor: typeof d.voor === 'string' ? d.voor : undefined, soort: typeof d.soort === 'string' ? d.soort : undefined, limiet: Number(d.limiet) || 50 })) : error('WONING_ONGELDIG', 400)),
    'POST /api/huis/energie': route(async (_c, a, d) => w(d) ? (await tempo(a, 'ha-energie')) || uit(await energieOverzicht(a.user.id, w(d), Number(d.uren) || 24)) : error('WONING_ONGELDIG', 400)),
    'POST /api/huis/beveiliging': route(async (_c, a, d) => w(d) ? uit(await beveiligingOverzicht(a.user.id, w(d))) : error('WONING_ONGELDIG', 400)),
    'POST /api/huis/voorstellen': route(async (_c, a, d) => {
      if (!w(d)) return error('WONING_ONGELDIG', 400);
      const actie = String(d.actie || 'lijst');
      if (actie === 'lijst') return uit(await voorstellenLijst(a.user.id, w(d)), 'voorstellen');
      const weiger = schrijfGeweigerd(a); if (weiger) return weiger;
      if (actie === 'nieuw') return uit(await voorstelMaken(a.user.id, w(d), { door: String(d.door || 'assistent'), samenvatting: String(d.samenvatting ?? ''), apparaatId: String(d.apparaatId ?? ''), mogelijkheid: String(d.mogelijkheid ?? '') as MogelijkheidSoort, waarde: d.waarde }), 'voorstel');
      if ((actie === 'goedkeuren' || actie === 'afwijzen') && isUuid(d.id)) return (actie === 'goedkeuren' ? await tempo(a, 'ha-opdracht') : null) || uit(await voorstelBesluiten(a.user.id, w(d), d.id, actie === 'goedkeuren'));
      return error('ACTIE_ONGELDIG', 400);
    }),
    // SEC-002 (integraties-09): «toevoegen» legt een UITNODIGING vast (zelfde antwoord voor elk adres, tien per uur); lid wordt
    // de genodigde pas met «aanvaarden» uit zijn eigen sessie. De genodigde is nog geen lid: zijn drie acties vragen geen woningId.
    'POST /api/huis/leden': route(async (_c, a, d) => {
      const actie = String(d.actie || 'lijst');
      if (actie === 'uitnodigingen') return json({ uitnodigingen: await uitnodigingenVoorMij(a.user.id) });
      if (actie === 'aanvaarden' || actie === 'afwijzen') {
        const geweigerd = schrijfGeweigerd(a); if (geweigerd) return geweigerd;
        return isUuid(d.uitnodigingId) ? uit(await uitnodigingBesluiten(a.user.id, d.uitnodigingId, actie === 'aanvaarden')) : error('ID_ONGELDIG', 400);
      }
      if (!w(d)) return error('WONING_ONGELDIG', 400);
      if (actie === 'lijst') {
        const leden = await ledenLijst(a.user.id, w(d)); if (leden === null) return error('NIET_GEVONDEN', 404);
        // Zonder migratie 0212 blijft de ledenlijst gewoon werken (dan zijn er nog geen uitnodigingen).
        const uitnodigingen = await uitnodigingenVanWoning(a.user.id, w(d)).catch((err) => { if (tabelOntbreekt(err)) return []; throw err; });
        return json({ leden, uitnodigingen: uitnodigingen ?? [] });
      }
      const weiger = schrijfGeweigerd(a); if (weiger) return weiger;
      // Eerst de vorm van het adres (goedkoop, verraadt niets), dan pas de tempolimiet: een kapot adres telt niet mee.
      if (actie === 'toevoegen' && !schoonEmail(d.email)) return error('EMAIL_ONGELDIG', 400);
      if (actie === 'toevoegen') return (await tempo(a, 'uitnodigen')) || uit(await lidUitnodigen(a.user.id, w(d), { email: String(d.email ?? ''), rol: String(d.rol ?? 'gast'), dagen: Number(d.dagen) || undefined }));
      if (actie === 'verlaten') return uit(await lidVerlaten(a.user.id, w(d)));
      if (actie === 'intrekken') return isUuid(d.uitnodigingId) ? uit(await uitnodigingIntrekken(a.user.id, w(d), d.uitnodigingId)) : error('ID_ONGELDIG', 400);
      if (actie === 'verwijder') return (await lidVerwijderen(a.user.id, w(d), String(d.userId ?? ''))) ? json({ verwijderd: true }) : error('NIET_GEVONDEN', 404);
      return error('ACTIE_ONGELDIG', 400);
    }),
  };
}
