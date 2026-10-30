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
import { randomUUID } from 'node:crypto';
import { error, json } from '../server/platform';
import { openWithEnvKey, sealWithEnvKey } from '../server/platform/beveiliging';
import { auditToevoegen } from '../server/platform/audit';
import type { RouterMiddleware } from '../server/platform/router';
import { alsGebruiker } from './ai-toestemmingen';
import { haDienstVoor, haGeschiedenis, haLezen, haOntdekken, haStuur, haVerbinden, komtOvereen, veiligAdres, type OntdektApparaat } from './huis-adapter-home-assistant';
import {
  KRITIEKE_SOORTEN, MAX_RUIMTES, MAX_WONINGEN, OPDRACHT_DEADLINE_MS, OPDRACHT_EIND, droogloop, magOvergang, schoneOpdrachtWaarde, schoneRegel, schoneScene,
  type Apparaat, type Automatisering, type Gebeurtenis, type Integratie, type Lid, type Mogelijkheid, type MogelijkheidSoort, type Opdracht, type OpdrachtStand, type Ruimte, type Scene, type Toestand, type Voorstel, type Waarnemingen, type Woning,
} from '../shared/huis-model';

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
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
const SLEUTEL = () => (process.env.HUIS_ADAPTER_SLEUTEL_V1 ? 'HUIS_ADAPTER_SLEUTEL_V1' : 'TOTP_ENCRYPTION_KEY_V1');
const aad = (woningId: string, integratieId: string) => `huis-integratie\0${woningId}\0${integratieId}`;
export const HUIS_LIMIETEN = Object.freeze({ gebeurtenissen: 200, apparaten: 2000, geschiedenisUren: 168 });

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
    [woningId, g.bron || 'site', g.soort, g.ernst || 'info', g.apparaatId ?? null, g.opdrachtId ?? null, g.bericht.slice(0, 500), JSON.stringify(g.gegevens ?? {}), g.bronTijd ?? null, (g.correlatie || '').slice(0, 80)]);
  await q(`DELETE FROM app.huis_gebeurtenissen WHERE woning_id = $1 AND id < (SELECT id FROM app.huis_gebeurtenissen WHERE woning_id = $1 ORDER BY id DESC OFFSET 5000 LIMIT 1)`, [woningId]).catch(() => undefined);
}

export async function woningenLijst(userId: string): Promise<Woning[]> {
  return alsGebruiker(userId, async (q) => (await q(`SELECT w.*, l.rol FROM app.huis_woningen w JOIN app.huis_leden l ON l.woning_id = w.id AND l.user_id = $1 WHERE l.geldig_tot IS NULL OR l.geldig_tot > now() ORDER BY w.created_at`, [userId])).rows.map((r) => woningUit(r, userId)));
}
export async function woningMaken(userId: string, naam: string, tijdzone = 'Europe/Brussels', taal: 'uk' | 'nl' = 'uk'): Promise<Woning | { fout: string }> {
  const schoon = naam.replace(/\s+/g, ' ').trim(); if (!schoon || schoon.length > 80) return { fout: 'NAAM_ONGELDIG' };
  if (!/^[A-Za-z_]+\/[A-Za-z_+-]+$/.test(tijdzone)) return { fout: 'TIJDZONE_ONGELDIG' };
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
      [apparaatId, woningId, t.kenmerk, JSON.stringify(t.waarde ?? null), t.eenheid, t.waargenomenOp, t.kwaliteit]);
  }
}
/** Stap 1 van de wizard: adres + token controleren en de integratie opslaan (token versleuteld). Nog geen apparaten. */
export async function integratieInstellen(userId: string, woningId: string, v: { adres: string; token: string; naam?: string }) {
  const adres = veiligAdres(v.adres); if (!adres.ok) return { fout: adres.fout };
  const token = String(v.token ?? '').trim(); if (token.length < 20 || token.length > 4000 || /\s/.test(token)) return { fout: 'TOKEN_ONGELDIG' as const };
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar) return { fout: 'ALLEEN_EIGENAAR' as const };
    const proef = await haVerbinden(adres.adres, token);
    if (!proef.ok) { await gebeurtenis(q, woningId, { soort: 'integratie', ernst: 'belangrijk', bericht: `Home Assistant: verbinding mislukt (${proef.fout})`, gegevens: { adres: adres.adres } }); return { fout: proef.fout }; }
    const id = randomUUID();
    let envelop: string; try { envelop = sealWithEnvKey(SLEUTEL(), token, aad(woningId, id)); } catch { return { fout: 'SLEUTEL_ONTBREEKT' as const }; }
    const { rows } = await q(`INSERT INTO app.huis_integraties (id, woning_id, soort, naam, adres, geheim, stand, hartslag, info) VALUES ($1,$2,'home-assistant',$3,$4,$5,'verbonden',now(),$6::jsonb) RETURNING *`,
      [id, woningId, String(v.naam || 'Home Assistant').slice(0, 80), adres.adres, envelop, JSON.stringify({ versie: proef.versie, locatie: proef.locatie, entiteiten: proef.entiteiten })]);
    await gebeurtenis(q, woningId, { soort: 'integratie', bericht: `Home Assistant ${proef.versie} verbonden (${proef.entiteiten} entiteiten gezien, nog niets geïmporteerd)`, gegevens: { integratieId: id } });
    return integratieUit(rows[0]);
  });
}
/** Stap 2: alleen-lezen ontdekking — wat zou er binnenkomen. Schrijft niets. */
export async function integratieOntdekken(userId: string, woningId: string, integratieId: string) {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar) return { fout: 'ALLEEN_EIGENAAR' as const };
    const i = await integratieMetGeheim(q, woningId, integratieId); if (!i) return { fout: 'NIET_GEVONDEN' as const };
    const r = await haOntdekken(i.rij.adres, i.token);
    if (!r.ok) return { fout: r.fout };
    const bestaand = new Set((await q(`SELECT bron_id FROM app.huis_apparaten WHERE woning_id = $1 AND integratie_id = $2`, [woningId, integratieId])).rows.map((x) => String(x.bron_id)));
    return { apparaten: r.apparaten.map((a) => ({ ...a, bestaat: bestaand.has(a.bronId) })), overgeslagen: r.overgeslagen };
  });
}
/** Stap 3: importeren (upsert op bron_id — nooit dubbelen) van gekozen bron-id's, of alles. */
export async function integratieImporteren(userId: string, woningId: string, integratieId: string, bronIds: string[] | null) {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar) return { fout: 'ALLEEN_EIGENAAR' as const };
    const i = await integratieMetGeheim(q, woningId, integratieId); if (!i) return { fout: 'NIET_GEVONDEN' as const };
    const r = await haOntdekken(i.rij.adres, i.token);
    if (!r.ok) { await q(`UPDATE app.huis_integraties SET stand = 'verzwakt', fout = $3, updated_at = now() WHERE id::text = $2 AND woning_id = $1`, [woningId, integratieId, r.fout]); return { fout: r.fout }; }
    const keuze = bronIds ? new Set(bronIds) : null;
    let nieuw = 0, bijgewerkt = 0;
    for (const a of r.apparaten) {
      if (keuze && !keuze.has(a.bronId)) continue;
      const { rows } = await q(`INSERT INTO app.huis_apparaten (woning_id, integratie_id, bron_id, naam, soort, fabrikant, model, mogelijkheden, kritiek, online, laatst_gezien)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)
        ON CONFLICT (woning_id, integratie_id, bron_id) DO UPDATE SET soort = EXCLUDED.soort, mogelijkheden = EXCLUDED.mogelijkheden, kritiek = EXCLUDED.kritiek, online = EXCLUDED.online, laatst_gezien = EXCLUDED.laatst_gezien, updated_at = now()
        RETURNING id, (xmax = 0) AS ingevoegd`, [woningId, integratieId, a.bronId, a.naam, a.soort, a.fabrikant, a.model, JSON.stringify(a.mogelijkheden), a.kritiek, a.online, a.laatstGezien]);
      if (rows[0].ingevoegd) nieuw++; else bijgewerkt++;
      await toestandenOpslaan(q, woningId, String(rows[0].id), a.toestanden);
    }
    await q(`UPDATE app.huis_integraties SET stand = 'verbonden', fout = '', laatste_sync = now(), hartslag = now(), updated_at = now() WHERE id::text = $2 AND woning_id = $1`, [woningId, integratieId]);
    await gebeurtenis(q, woningId, { bron: 'home-assistant', soort: 'integratie', bericht: `Import: ${nieuw} nieuw, ${bijgewerkt} bijgewerkt, ${r.overgeslagen} overgeslagen (geen apparaat)`, gegevens: { integratieId } });
    return { nieuw, bijgewerkt, overgeslagen: r.overgeslagen };
  });
}
/** Toestanden verversen voor alle geïmporteerde apparaten van de integratie (polling; geen WS in deze release). */
export async function integratieSynchroniseren(userId: string, woningId: string, integratieId: string) {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid) return { fout: 'GEEN_TOEGANG' as const };
    const i = await integratieMetGeheim(q, woningId, integratieId); if (!i) return { fout: 'NIET_GEVONDEN' as const };
    const r = await haOntdekken(i.rij.adres, i.token);
    if (!r.ok) { await q(`UPDATE app.huis_integraties SET stand = CASE WHEN $3 = 'TOKEN_GEWEIGERD' THEN 'geweigerd' ELSE 'verzwakt' END, fout = $3, updated_at = now() WHERE id::text = $2 AND woning_id = $1`, [woningId, integratieId, r.fout]); await gebeurtenis(q, woningId, { bron: 'home-assistant', soort: 'integratie', ernst: 'belangrijk', bericht: `Synchronisatie mislukt (${r.fout})` }); return { fout: r.fout }; }
    const per = new Map(r.apparaten.map((a) => [a.bronId, a]));
    const rijen = (await q(`SELECT id, bron_id FROM app.huis_apparaten WHERE woning_id = $1 AND integratie_id = $2`, [woningId, integratieId])).rows;
    let bijgewerkt = 0, weg = 0;
    for (const rij of rijen) {
      const a = per.get(String(rij.bron_id));
      if (!a) { weg++; await q(`UPDATE app.huis_apparaten SET online = false, updated_at = now() WHERE id = $1`, [rij.id]); await q(`UPDATE app.huis_toestanden SET kwaliteit = 'onbeschikbaar', ontvangen_op = now() WHERE apparaat_id = $1`, [rij.id]); continue; }
      bijgewerkt++;
      await q(`UPDATE app.huis_apparaten SET mogelijkheden = $2::jsonb, kritiek = $3, online = $4, laatst_gezien = $5, updated_at = now() WHERE id = $1`, [rij.id, JSON.stringify(a.mogelijkheden), a.kritiek, a.online, a.laatstGezien]);
      await toestandenOpslaan(q, woningId, String(rij.id), a.toestanden);
    }
    await q(`UPDATE app.huis_integraties SET stand = 'verbonden', fout = '', laatste_sync = now(), hartslag = now(), updated_at = now() WHERE id::text = $2 AND woning_id = $1`, [woningId, integratieId]);
    return { bijgewerkt, weg, nieuwBeschikbaar: r.apparaten.filter((a) => !rijen.some((x) => String(x.bron_id) === a.bronId)).length };
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
/**
 * Eén opdracht van begin tot (bijna) einde: beleid → aanvaard → verzonden → korte wachttijd op de waarneming. Geeft de opdracht
 * terug in haar actuele stand; wie 'verzonden'/'bevestigd' terugkrijgt, vraagt later opnieuw (opdrachtLezen poolt de ACK na).
 */
export async function opdrachtGeven(userId: string, woningId: string, v: OpdrachtVraag): Promise<{ ok: true; opdracht: Opdracht } | { ok: false; fout: string; opdracht?: Opdracht }> {
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(v.idempotentie)) return { ok: false, fout: 'IDEMPOTENTIE_ONGELDIG' };
  return alsGebruiker(userId, async (q) => {
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
    const nieuw = async (stand: OpdrachtStand, fout = '') => opdrachtUit((await q(`INSERT INTO app.huis_opdrachten (woning_id, user_id, via, apparaat_id, mogelijkheid, verzocht, idempotentie, correlatie, stand, beleid, fout, deadline) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11, now() + ($12 || ' milliseconds')::interval) RETURNING *`,
      [woningId, userId, v.via || 'site', app.id, v.mogelijkheid, JSON.stringify(w.ok ? w.waarde : {}), v.idempotentie, correlatie, stand, JSON.stringify(beleid), fout, String(OPDRACHT_DEADLINE_MS)])).rows[0]);
    const weiger = async (reden: string) => { const o = await nieuw('geweigerd', reden); await gebeurtenis(q, woningId, { soort: 'opdracht', ernst: 'belangrijk', apparaatId: String(app.id), opdrachtId: o.id, bericht: `Opdracht geweigerd: ${reden}`, correlatie }); return { ok: false as const, fout: reden, opdracht: o }; };
    if (!w.ok) return weiger(w.fout);
    if (!lid.magSchrijven) return weiger('ROL_ALLEEN_LEZEN');
    if (kritiek && (v.via && v.via !== 'site')) return weiger('KRITIEK_ALLEEN_MENS');
    if (kritiek && !v.stepUpOk) return weiger('STEP_UP_VEREIST');
    const integ = app.integratie_id ? await integratieMetGeheim(q, woningId, String(app.integratie_id)) : null;
    if (!integ) return weiger('GEEN_INTEGRATIE');
    if (!integ.rij.schrijven) return weiger('SCHRIJVEN_NIET_TOEGESTAAN');
    const dienst = haDienstVoor(String(app.bron_id), v.mogelijkheid, w.waarde);
    if (!dienst) return weiger('DIENST_ONBEKEND');
    let o = await nieuw('verzocht');
    await auditToevoegen({ ownerId: userId, actorId: userId, action: 'huis.opdracht', type: 'huis', result: 'ok', details: { woningId, opdrachtId: o.id, apparaat: app.bron_id, mogelijkheid: v.mogelijkheid, kritiek, via: v.via || 'site' } }).catch(() => undefined);
    o = (await standZetten(q, o.id, 'verzocht', 'aanvaard'))!;
    const stuur = await haStuur(integ.rij.adres, integ.token, dienst);
    if (!stuur.ok) {
      o = (await standZetten(q, o.id, 'aanvaard', stuur.fout === 'GEEN_ANTWOORD' ? 'offline' : 'mislukt', { fout: stuur.fout }))!;
      await q(`UPDATE app.huis_integraties SET stand = 'verzwakt', fout = $2, updated_at = now() WHERE id = $1`, [integ.rij.id, stuur.fout]);
      await gebeurtenis(q, woningId, { bron: 'home-assistant', soort: 'opdracht', ernst: 'belangrijk', apparaatId: String(app.id), opdrachtId: o.id, bericht: `Opdracht niet verzonden (${stuur.fout})`, correlatie });
      return { ok: false as const, fout: stuur.fout, opdracht: o };
    }
    o = (await standZetten(q, o.id, 'aanvaard', 'verzonden'))!;
    await gebeurtenis(q, woningId, { soort: 'opdracht', apparaatId: String(app.id), opdrachtId: o.id, bericht: `${app.naam}: ${v.mogelijkheid} ${JSON.stringify(w.waarde)} verzonden`, correlatie });
    // Korte wachttijd op de waarneming (de ACK): hoogstens drie keer lezen; daarna poolt opdrachtLezen verder tot de deadline.
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const na = await ackControleren(q, woningId, o, integ.rij.adres, integ.token, app);
      if (na) { o = na; if (OPDRACHT_EIND.includes(o.stand)) break; }
    }
    return { ok: true as const, opdracht: o };
  });
}
/** De waarneming na een opdracht: lees de entiteit, sla de toestand op, en zet de opdracht op bevestigd/waargenomen/voltooid of verlopen. */
async function ackControleren(q: Q, woningId: string, o: Opdracht, adres: string, token: string, app: any): Promise<Opdracht | null> {
  if (o.stand !== 'verzonden' && o.stand !== 'bevestigd' && o.stand !== 'waargenomen') return null;
  const gelezen = await haLezen(adres, token, String(app.bron_id));
  if (gelezen === 'fout' || gelezen === null) { if (o.deadline && Date.parse(o.deadline) < Date.now()) return standZetten(q, o.id, o.stand === 'waargenomen' ? 'waargenomen' : o.stand, o.stand === 'waargenomen' ? 'gedeeltelijk' : 'verlopen', { fout: 'GEEN_WAARNEMING' }); return null; }
  await toestandenOpslaan(q, woningId, String(app.id), gelezen.toestanden);
  await q(`UPDATE app.huis_apparaten SET online = $2, laatst_gezien = $3, updated_at = now() WHERE id = $1`, [app.id, gelezen.online, gelezen.laatstGezien]);
  let cur = o;
  if (cur.stand === 'verzonden') cur = (await standZetten(q, cur.id, 'verzonden', 'bevestigd')) ?? cur;
  if (komtOvereen(cur.mogelijkheid, cur.verzocht, gelezen.toestanden)) {
    if (cur.stand === 'bevestigd') cur = (await standZetten(q, cur.id, 'bevestigd', 'waargenomen')) ?? cur;
    if (cur.stand === 'waargenomen') cur = (await standZetten(q, cur.id, 'waargenomen', 'voltooid', { uitkomst: Object.fromEntries(gelezen.toestanden.map((t) => [t.kenmerk, t.waarde])) })) ?? cur;
    await gebeurtenis(q, woningId, { bron: 'home-assistant', soort: 'opdracht', apparaatId: String(app.id), opdrachtId: cur.id, bericht: `${app.naam}: bevestigd en waargenomen`, correlatie: cur.correlatie });
    return cur;
  }
  if (cur.deadline && Date.parse(cur.deadline) < Date.now()) {
    cur = (await standZetten(q, cur.id, cur.stand as 'bevestigd', cur.stand === 'bevestigd' ? 'verlopen' : 'gedeeltelijk', { fout: 'GEEN_ACK', uitkomst: Object.fromEntries(gelezen.toestanden.map((t) => [t.kenmerk, t.waarde])) })) ?? cur;
    await gebeurtenis(q, woningId, { bron: 'home-assistant', soort: 'opdracht', ernst: 'belangrijk', apparaatId: String(app.id), opdrachtId: cur.id, bericht: `${app.naam}: geen bevestiging binnen de tijd`, correlatie: cur.correlatie });
  }
  return cur;
}
export async function opdrachtLezen(userId: string, woningId: string, id: string): Promise<Opdracht | null> {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid) return null;
    const r = (await q(`SELECT * FROM app.huis_opdrachten WHERE id::text = $2 AND woning_id = $1`, [woningId, id])).rows[0]; if (!r) return null;
    const o = opdrachtUit(r);
    if (OPDRACHT_EIND.includes(o.stand) || !o.apparaatId) return o;
    const app = (await q(`SELECT * FROM app.huis_apparaten WHERE id::text = $1`, [o.apparaatId])).rows[0];
    const integ = app?.integratie_id ? await integratieMetGeheim(q, woningId, String(app.integratie_id)) : null;
    if (!app || !integ) return o;
    return (await ackControleren(q, woningId, o, integ.rij.adres, integ.token, app)) ?? o;
  });
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
  return alsGebruiker(userId, async (q) => {
    if (!(await lidVan(q, userId, woningId))) return null;
    const apparaten = (await apparatenMetToestand(q, woningId)).filter((a) => a.mogelijkheden.some((m) => m.soort === 'energie' || m.soort === 'vermogen'));
    const perIntegratie = new Map<string, Apparaat[]>();
    for (const a of apparaten) if (a.integratieId) { if (!perIntegratie.has(a.integratieId)) perIntegratie.set(a.integratieId, []); perIntegratie.get(a.integratieId)!.push(a); }
    const reeksen: Record<string, Array<{ op: string; waarde: number }>> = {}; let fout = '';
    const van = new Date(Date.now() - Math.min(HUIS_LIMIETEN.geschiedenisUren, Math.max(1, uren)) * 3600_000).toISOString();
    for (const [integratieId, lijst] of perIntegratie) {
      const i = await integratieMetGeheim(q, woningId, integratieId); if (!i) continue;
      const g = await haGeschiedenis(i.rij.adres, i.token, lijst.map((a) => a.bronId), van);
      if (!g.ok) { fout = g.fout; continue; }
      for (const a of lijst) if (g.reeksen[a.bronId]) reeksen[a.id] = g.reeksen[a.bronId];
    }
    return { apparaten, reeksen, van, fout, meters: apparaten.length };
  });
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
  await alsGebruiker(userId, async (q) => { await q(`UPDATE app.huis_voorstellen SET stand = 'goedgekeurd', besluit_op = now(), opdracht_id = $2 WHERE id::text = $1`, [id, o.opdracht?.id ?? null]); });
  return { voorstel: { ...v.voorstel, stand: 'goedgekeurd' as const, opdrachtId: o.opdracht?.id ?? null }, opdracht: o.opdracht ?? null, fout: o.ok ? undefined : o.fout };
}
export async function ledenLijst(userId: string, woningId: string) { return alsGebruiker(userId, async (q) => { if (!(await lidVan(q, userId, woningId))) return null; return (await q(`SELECT l.user_id, l.rol, l.geldig_tot, r.data->>'email' AS email, r.data->>'name' AS naam FROM app.huis_leden l LEFT JOIN app.records r ON r.tbl = 'users' AND r.id = l.user_id WHERE l.woning_id = $1 ORDER BY l.created_at`, [woningId])).rows.map((x) => ({ userId: String(x.user_id), rol: x.rol, geldigTot: isoOfNull(x.geldig_tot), email: x.email || '', naam: x.naam || '' })); }); }
export async function lidToevoegen(userId: string, woningId: string, v: { email: string; rol: string; dagen?: number }) {
  const rol = ['lid', 'gast', 'installateur', 'ondersteuning'].includes(v.rol) ? v.rol : 'gast';
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar) return { fout: 'ALLEEN_EIGENAAR' as const };
    const u = (await q(`SELECT id FROM app.records WHERE tbl = 'users' AND lower(data->>'email') = lower($1) AND data->>'status' = 'approved'`, [String(v.email || '').trim()])).rows[0];
    if (!u) return { fout: 'GEBRUIKER_ONBEKEND' as const };
    const tot = rol === 'installateur' || rol === 'ondersteuning' ? new Date(Date.now() + Math.min(90, Math.max(1, Number(v.dagen) || 7)) * 864e5) : null;
    await q(`INSERT INTO app.huis_leden (woning_id, user_id, rol, geldig_tot) VALUES ($1,$2,$3,$4) ON CONFLICT (woning_id, user_id) DO UPDATE SET rol = EXCLUDED.rol, geldig_tot = EXCLUDED.geldig_tot`, [woningId, u.id, rol, tot]);
    await gebeurtenis(q, woningId, { soort: 'leden', ernst: 'belangrijk', bericht: `Lid toegevoegd (${rol})`, gegevens: { userId: u.id } });
    return { ok: true as const };
  }, { systeem: true });
}
export async function lidVerwijderen(userId: string, woningId: string, lidUserId: string) {
  return alsGebruiker(userId, async (q) => { const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar || lidUserId === userId) return false; return (await q(`DELETE FROM app.huis_leden WHERE woning_id = $1 AND user_id = $2 RETURNING user_id`, [woningId, lidUserId])).rows.length > 0; });
}
export async function woningWijzigen(userId: string, woningId: string, v: { naam?: string; tijdzone?: string; taal?: string; verdiepingen?: unknown }) {
  return alsGebruiker(userId, async (q) => {
    const lid = await lidVan(q, userId, woningId); if (!lid || !lid.eigenaar) return { fout: 'ALLEEN_EIGENAAR' as const };
    const cur = (await q(`SELECT * FROM app.huis_woningen WHERE id::text = $1`, [woningId])).rows[0];
    const naam = v.naam === undefined ? cur.naam : String(v.naam).replace(/\s+/g, ' ').trim(); if (!naam || naam.length > 80) return { fout: 'NAAM_ONGELDIG' as const };
    const tijdzone = v.tijdzone === undefined ? cur.tijdzone : String(v.tijdzone); if (!/^[A-Za-z_]+\/[A-Za-z_+-]+$/.test(tijdzone)) return { fout: 'TIJDZONE_ONGELDIG' as const };
    const verd = Array.isArray(v.verdiepingen) ? v.verdiepingen.slice(0, 12).map((x: any, i: number) => ({ id: String(x?.id ?? i).slice(0, 10), naam: String(x?.naam ?? '').slice(0, 40) || `${i}` })) : cur.verdiepingen;
    const { rows } = await q(`UPDATE app.huis_woningen SET naam = $2, tijdzone = $3, taal = $4, verdiepingen = $5::jsonb, updated_at = now() WHERE id::text = $1 RETURNING *`, [woningId, naam, tijdzone, v.taal === 'nl' ? 'nl' : v.taal === 'uk' ? 'uk' : cur.taal, JSON.stringify(verd)]);
    return woningUit({ ...rows[0], rol: 'eigenaar' }, userId);
  });
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
  const foutResp = (f: string) => error(f, f === 'NIET_GEVONDEN' || f === 'APPARAAT_ONBEKEND' ? 404 : f === 'GEEN_TOEGANG' || f === 'ALLEEN_EIGENAAR' ? 403 : f === 'HUIS_MIGRATIE_ONTBREEKT' ? 503 : 400);
  const uit = (r: unknown, sleutel?: string) => (r === null ? error('NIET_GEVONDEN', 404) : r && typeof r === 'object' && 'fout' in (r as object) && (r as { fout?: string }).fout ? foutResp(String((r as { fout: string }).fout)) : json(sleutel ? { [sleutel]: r } : (r as object)));

  return {
    'POST /api/huis/woningen': route(async (_c, a) => json({ woningen: await woningenLijst(a.user.id) })),
    'POST /api/huis/woningen/nieuw': route(async (_c, a, d) => uit(await woningMaken(a.user.id, String(d.naam ?? ''), typeof d.tijdzone === 'string' ? d.tijdzone : undefined, d.taal === 'nl' ? 'nl' : 'uk'), 'woning')),
    'POST /api/huis/woningen/wijzig': route(async (_c, a, d) => w(d) ? uit(await woningWijzigen(a.user.id, w(d), d as any), 'woning') : error('WONING_ONGELDIG', 400)),
    'POST /api/huis/overzicht': route(async (_c, a, d) => w(d) ? uit(await overzicht(a.user.id, w(d))) : error('WONING_ONGELDIG', 400)),
    'POST /api/huis/ruimtes': route(async (_c, a, d) => {
      if (!w(d)) return error('WONING_ONGELDIG', 400);
      const actie = String(d.actie || '');
      if (actie === 'nieuw') return uit(await ruimteMaken(a.user.id, w(d), d as any), 'ruimte');
      if (!isUuid(d.id)) return error('ID_ONGELDIG', 400);
      if (actie === 'wijzig') return uit(await ruimteWijzigen(a.user.id, w(d), d.id, d as any), 'ruimte');
      if (actie === 'verwijder') return (await ruimteVerwijderen(a.user.id, w(d), d.id)) ? json({ verwijderd: true }) : error('NIET_GEVONDEN', 404);
      return error('ACTIE_ONGELDIG', 400);
    }),
    'POST /api/huis/apparaten/wijzig': route(async (_c, a, d) => w(d) && isUuid(d.id) ? uit(await apparaatWijzigen(a.user.id, w(d), d.id, { naam: typeof d.naam === 'string' ? d.naam : undefined, ruimteId: d.ruimteId === null ? null : isUuid(d.ruimteId) ? d.ruimteId : undefined, verborgen: typeof d.verborgen === 'boolean' ? d.verborgen : undefined }), 'apparaat') : error('ID_ONGELDIG', 400)),
    'POST /api/huis/integraties/instellen': route(async (_c, a, d) => w(d) ? uit(await integratieInstellen(a.user.id, w(d), { adres: String(d.adres ?? ''), token: String(d.token ?? ''), naam: typeof d.naam === 'string' ? d.naam : undefined }), 'integratie') : error('WONING_ONGELDIG', 400)),
    'POST /api/huis/integraties/ontdekken': route(async (_c, a, d) => w(d) && isUuid(d.integratieId) ? uit(await integratieOntdekken(a.user.id, w(d), d.integratieId)) : error('ID_ONGELDIG', 400)),
    'POST /api/huis/integraties/importeren': route(async (_c, a, d) => w(d) && isUuid(d.integratieId) ? uit(await integratieImporteren(a.user.id, w(d), d.integratieId, Array.isArray(d.bronIds) ? d.bronIds.map(String).slice(0, 2000) : null)) : error('ID_ONGELDIG', 400)),
    'POST /api/huis/integraties/synchroniseren': route(async (_c, a, d) => w(d) && isUuid(d.integratieId) ? uit(await integratieSynchroniseren(a.user.id, w(d), d.integratieId)) : error('ID_ONGELDIG', 400)),
    // Schrijftoestemming aanzetten is een beveiligingskeuze: step-up van de eigenaar (dezelfde poort als de andere kritieke acties).
    'POST /api/huis/integraties/schrijven': route(async (ctx, a, d) => {
      if (!w(d) || !isUuid(d.integratieId)) return error('ID_ONGELDIG', 400);
      if (d.aan === true) { if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403); const su = await deps.stepUp(ctx, a); if (su) return su; }
      return uit(await integratieSchrijven(a.user.id, w(d), d.integratieId, d.aan === true), 'integratie');
    }),
    'POST /api/huis/integraties/verwijderen': route(async (_c, a, d) => w(d) && isUuid(d.integratieId) ? uit(await integratieVerwijderen(a.user.id, w(d), d.integratieId)) : error('ID_ONGELDIG', 400)),
    'POST /api/huis/opdrachten/nieuw': route(async (ctx, a, d) => {
      if (!w(d) || !isUuid(d.apparaatId)) return error('ID_ONGELDIG', 400);
      let stepUpOk = false;
      if (d.kritiekBevestigd === true) { if (!deps.stepUp) return error('STEP_UP_REQUIRED', 403); const su = await deps.stepUp(ctx, a); if (su) return su; stepUpOk = true; }
      const r = await opdrachtGeven(a.user.id, w(d), { apparaatId: d.apparaatId, mogelijkheid: String(d.mogelijkheid ?? '') as MogelijkheidSoort, waarde: d.waarde, idempotentie: String(d.idempotentie ?? ''), via: 'site', stepUpOk });
      return r.ok ? json({ opdracht: r.opdracht }) : json({ error: r.fout, opdracht: r.opdracht ?? null }, r.fout === 'STEP_UP_VEREIST' ? 403 : r.fout === 'GEEN_TOEGANG' ? 403 : 409);
    }),
    'POST /api/huis/opdrachten/een': route(async (_c, a, d) => w(d) && isUuid(d.id) ? uit(await opdrachtLezen(a.user.id, w(d), d.id), 'opdracht') : error('ID_ONGELDIG', 400)),
    'POST /api/huis/opdrachten': route(async (_c, a, d) => w(d) ? uit(await opdrachtenLijst(a.user.id, w(d), Number(d.limiet) || 50), 'opdrachten') : error('WONING_ONGELDIG', 400)),
    'POST /api/huis/scenes': route(async (_c, a, d) => {
      if (!w(d)) return error('WONING_ONGELDIG', 400);
      const actie = String(d.actie || 'lijst');
      if (actie === 'lijst') return uit(await scenesLijst(a.user.id, w(d)), 'scenes');
      if (actie === 'bewaar') return uit(await sceneBewaren(a.user.id, w(d), isUuid(d.id) ? d.id : null, d), 'scene');
      if (!isUuid(d.id)) return error('ID_ONGELDIG', 400);
      if (actie === 'verwijder') return (await sceneVerwijderen(a.user.id, w(d), d.id)) ? json({ verwijderd: true }) : error('NIET_GEVONDEN', 404);
      if (actie === 'uitvoeren') { if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(d.idempotentie ?? ''))) return error('IDEMPOTENTIE_ONGELDIG', 400); return uit(await sceneUitvoeren(a.user.id, w(d), d.id, String(d.idempotentie))); }
      return error('ACTIE_ONGELDIG', 400);
    }),
    'POST /api/huis/automatiseringen': route(async (_c, a, d) => {
      if (!w(d)) return error('WONING_ONGELDIG', 400);
      const actie = String(d.actie || 'lijst');
      if (actie === 'lijst') return uit(await automatiseringenLijst(a.user.id, w(d)), 'automatiseringen');
      if (actie === 'droogloop') return uit(await automatiseringDroogloop(a.user.id, w(d), d.regel, typeof d.tijd === 'string' ? d.tijd : undefined));
      if (actie === 'bewaar') return uit(await automatiseringBewaren(a.user.id, w(d), isUuid(d.id) ? d.id : null, { naam: String(d.naam ?? ''), regel: d.regel, stand: typeof d.stand === 'string' ? d.stand : undefined }), 'automatisering');
      if (actie === 'verwijder' && isUuid(d.id)) return (await automatiseringVerwijderen(a.user.id, w(d), d.id)) ? json({ verwijderd: true }) : error('NIET_GEVONDEN', 404);
      return error('ACTIE_ONGELDIG', 400);
    }),
    'POST /api/huis/gebeurtenissen': route(async (_c, a, d) => w(d) ? uit(await gebeurtenissenLijst(a.user.id, w(d), { voor: typeof d.voor === 'string' ? d.voor : undefined, soort: typeof d.soort === 'string' ? d.soort : undefined, limiet: Number(d.limiet) || 50 })) : error('WONING_ONGELDIG', 400)),
    'POST /api/huis/energie': route(async (_c, a, d) => w(d) ? uit(await energieOverzicht(a.user.id, w(d), Number(d.uren) || 24)) : error('WONING_ONGELDIG', 400)),
    'POST /api/huis/beveiliging': route(async (_c, a, d) => w(d) ? uit(await beveiligingOverzicht(a.user.id, w(d))) : error('WONING_ONGELDIG', 400)),
    'POST /api/huis/voorstellen': route(async (_c, a, d) => {
      if (!w(d)) return error('WONING_ONGELDIG', 400);
      const actie = String(d.actie || 'lijst');
      if (actie === 'lijst') return uit(await voorstellenLijst(a.user.id, w(d)), 'voorstellen');
      if (actie === 'nieuw') return uit(await voorstelMaken(a.user.id, w(d), { door: String(d.door || 'assistent'), samenvatting: String(d.samenvatting ?? ''), apparaatId: String(d.apparaatId ?? ''), mogelijkheid: String(d.mogelijkheid ?? '') as MogelijkheidSoort, waarde: d.waarde }), 'voorstel');
      if ((actie === 'goedkeuren' || actie === 'afwijzen') && isUuid(d.id)) return uit(await voorstelBesluiten(a.user.id, w(d), d.id, actie === 'goedkeuren'));
      return error('ACTIE_ONGELDIG', 400);
    }),
    'POST /api/huis/leden': route(async (_c, a, d) => {
      if (!w(d)) return error('WONING_ONGELDIG', 400);
      const actie = String(d.actie || 'lijst');
      if (actie === 'lijst') return uit(await ledenLijst(a.user.id, w(d)), 'leden');
      if (actie === 'toevoegen') return uit(await lidToevoegen(a.user.id, w(d), { email: String(d.email ?? ''), rol: String(d.rol ?? 'gast'), dagen: Number(d.dagen) || undefined }));
      if (actie === 'verwijder') return (await lidVerwijderen(a.user.id, w(d), String(d.userId ?? ''))) ? json({ verwijderd: true }) : error('NIET_GEVONDEN', 404);
      return error('ACTIE_ONGELDIG', 400);
    }),
  };
}
