// Notities vNext (28.10.2026, migratie 0127): de opslag en de routes van hub.tarasevych.com/notities.
//
// ÉÉN BRON, ÉÉN SPIEGEL.
//   • app.notities is de bron: titel tot 300, inhoud (Markdown) tot 200 000 tekens, 24 etiketten, map, vastgezet, archief,
//     prullenbak, versie en een revisie vóór elke inhoudelijke wijziging.
//   • app.mcp_console_items (kind 'note', etiket 'hub') is de SPIEGEL met dezelfde id: titel ≤ 160, tekst ≤ 4000, ≤ 8 etiketten.
//     Elke schrijfweg hier werkt de spiegel in dezelfde transactie bij. Daardoor blijven de oude weg (manage_hub_notes,
//     POST/PATCH /api/mcp/board, de oude pagina zonder vlag) en een oudere release na terugdraaien gewoon werken.
//   • De oude weg schrijft ANDERSOM ook hierheen: backend/mcp-console.ts roept bordNotitieToevoegen / bordNotitieWijzigen /
//     bordNotitieVerwijderen aan voor elk bord-item met etiket 'hub'. Verwijderen via de oude weg = naar de prullenbak (30 dagen),
//     nooit meteen weg. Bestaat de tabel nog niet (migratie niet gedraaid), dan geven die drie `null` en doet het bord wat het deed.
//
// DEZELFDE POORT ALS HET BORD. Elke route gaat door bordLade (backend/ruimte-bord-github.ts): dezelfde ruimte (prive/technisch),
// dezelfde weigering met uitleg, dezelfde RLS (alsGebruiker). Nergens een eigen keuze van de lade; `sqlLadeWaar` filtert elke rij.
import { createHash } from 'node:crypto';
import { error, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import type { RouterMiddleware } from '../server/platform/router';
import { denyMutation } from './rbac';
import { alsGebruiker } from './ai-toestemmingen';
import { bordLade } from './ruimte-bord-github';
import { sqlLadeWaar, type Lade } from '../shared/ruimte-scheiding';
import {
  VN_IMPORT_MAX_BESTANDEN, VN_IMPORT_MAX_BYTES, VN_LIJST_LIMIET, VN_LIJST_MAX, VN_MAX_MAPNAAM, VN_MAX_MAPPEN, VN_PRULLENBAK_DAGEN,
  VN_REVISIES_PER_NOTITIE, KLEUREN, WEERGAVEN, invoerUitBord, markeerDubbelen, parseerImport, platteTekst, schoneInvoer,
  spiegelEtiketten, spiegelTekst, spiegelTitel, vingerafdruk, vnEtiketten, zoekWoorden,
  type ImportFout, type ImportItem, type Notitie, type NotitieInvoer, type NotitieKleur, type NotitieMap, type NotitieRevisie, type NotitieSoort, type Weergave,
} from '../shared/notities-vnext-model';

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;
type Ctx = { event: Record<string, unknown>; body: unknown };

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : '');
const bodyOf = (body: unknown) => (body || {}) as Record<string, unknown>;
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** Tabel 0127 ontbreekt (migratie nog niet gedraaid): de oude weg doet dan wat zij deed. Elke andere fout blijft een fout. */
const tabelOntbreekt = (err: unknown) => Boolean(err && typeof err === 'object' && (err as { code?: string }).code === '42P01');

export function notitieUit(r: any): Notitie {
  return {
    id: String(r.id), titel: r.titel, inhoud: r.inhoud_md, soort: r.soort, kleur: r.kleur, etiketten: r.etiketten || [], mapId: r.map_id ? String(r.map_id) : null,
    vast: Boolean(r.vast_sinds), gearchiveerdOp: r.gearchiveerd_op ? iso(r.gearchiveerd_op) : null, verwijderdOp: r.verwijderd_op ? iso(r.verwijderd_op) : null,
    auteur: r.auteur, herkomst: r.herkomst && typeof r.herkomst === 'object' ? r.herkomst : {}, versie: Number(r.versie), aangemaaktOp: iso(r.created_at), gewijzigdOp: iso(r.updated_at),
  };
}
const mapUit = (r: any): NotitieMap => ({ id: String(r.id), naam: r.naam, kleur: r.kleur, volgorde: Number(r.volgorde), aantal: Number(r.aantal || 0) });
const revisieUit = (r: any): NotitieRevisie => ({ id: String(r.id), versie: Number(r.versie), titel: r.titel, inhoud: r.inhoud_md, soort: r.soort, kleur: r.kleur, etiketten: r.etiketten || [], reden: r.reden, aangemaaktOp: iso(r.created_at) });
/** De oude vorm van een notitie (backend/mcp-console.ts → noteOut) uit de spiegelrij. */
const bordUit = (r: any) => ({ id: String(r.id), title: r.title, body: r.body, tags: r.tags || [], author: r.author, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });

// ---------------------------------------------------------------- spiegel (in dezelfde transactie)
async function spiegelSchrijf(q: Q, lade: Lade, n: Notitie) {
  const tags = spiegelEtiketten(n);
  const { rows } = await q(
    `INSERT INTO app.mcp_console_items (id, user_id, kind, title, body, status, author, tags, ruimte, created_at, updated_at)
     VALUES ($1, $2, 'note', $3, $4, NULL, $5, $6, $7, $8::timestamptz, $9::timestamptz)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, tags = EXCLUDED.tags, updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [n.id, lade.userId, spiegelTitel(n.titel), spiegelTekst(n.inhoud), n.auteur.slice(0, 80), tags, lade.ruimte, n.aangemaaktOp, n.gewijzigdOp]);
  return rows[0];
}
const spiegelWis = (q: Q, lade: Lade, id: string) => q(`DELETE FROM app.mcp_console_items WHERE id::text = $2 AND ${sqlLadeWaar('ruimte', lade, 1)}`, [lade.userId, id]);

// ---------------------------------------------------------------- lezen
const WAAR = (lade: Lade, n = 1) => sqlLadeWaar('ruimte', lade, n);
async function eenRij(q: Q, lade: Lade, id: string, opts: { ookPrullenbak?: boolean } = {}) {
  const { rows } = await q(`SELECT * FROM app.notities WHERE id::text = $2 AND ${WAAR(lade)}${opts.ookPrullenbak ? '' : ' AND verwijderd_op IS NULL'}`, [lade.userId, id]);
  return rows[0] ?? null;
}
export async function notitieLezen(lade: Lade, id: string): Promise<Notitie | null> {
  return alsGebruiker(lade.userId, async (q) => { const r = await eenRij(q, lade, id, { ookPrullenbak: true }); return r ? notitieUit(r) : null; });
}

export type LijstVraag = { weergave?: Weergave; mapId?: string | null; etiket?: string; vraag?: string; soort?: NotitieSoort | ''; kleur?: NotitieKleur | ''; offset?: number; limiet?: number };
export type LijstUit = { notities: Notitie[]; totaal: number; offset: number; limiet: number; volgende: number | null; telling: Record<Weergave, number>; mappen: NotitieMap[]; etiketten: Array<{ etiket: string; aantal: number }> };
/**
 * De lijst van één weergave met filters, gepagineerd (offset/limiet, vastgezette bovenaan, dan nieuwste gewijzigd eerst), plus
 * de tellingen per weergave, de mappen met aantallen en de etiketwolk — alles uit dezelfde lade, in één transactie.
 */
export async function notitiesLijst(lade: Lade, vraag: LijstVraag): Promise<LijstUit> {
  const weergave: Weergave = WEERGAVEN.includes(vraag.weergave as Weergave) ? (vraag.weergave as Weergave) : 'alle';
  const limiet = Math.min(VN_LIJST_MAX, Math.max(1, Number(vraag.limiet) || VN_LIJST_LIMIET));
  const offset = Math.max(0, Math.floor(Number(vraag.offset) || 0));
  return alsGebruiker(lade.userId, async (q) => {
    await prullenbakOpruimen(q, lade);
    const params: unknown[] = [lade.userId];
    const waar: string[] = [WAAR(lade)];
    const staat: Record<Weergave, string> = {
      alle: 'verwijderd_op IS NULL AND gearchiveerd_op IS NULL',
      vandaag: "verwijderd_op IS NULL AND gearchiveerd_op IS NULL AND (updated_at >= date_trunc('day', now()) OR (soort = 'lijst' AND inhoud_md ~ '(^|\\n)\\s*[-*+]\\s*\\[ \\]'))",
      vast: 'verwijderd_op IS NULL AND gearchiveerd_op IS NULL AND vast_sinds IS NOT NULL',
      lijsten: "verwijderd_op IS NULL AND gearchiveerd_op IS NULL AND soort = 'lijst'",
      archief: 'verwijderd_op IS NULL AND gearchiveerd_op IS NOT NULL',
      prullenbak: 'verwijderd_op IS NOT NULL',
    };
    waar.push(staat[weergave]);
    if (vraag.mapId === 'geen') waar.push('map_id IS NULL');
    else if (isUuid(vraag.mapId)) { params.push(vraag.mapId); waar.push(`map_id = $${params.length}`); }
    const etiket = vnEtiketten([vraag.etiket])[0];
    if (etiket) { params.push(etiket); waar.push(`$${params.length} = ANY (etiketten)`); }
    if (vraag.soort && ['tekst', 'lijst', 'code', 'koppeling'].includes(vraag.soort)) { params.push(vraag.soort); waar.push(`soort = $${params.length}`); }
    if (vraag.kleur && (KLEUREN as readonly string[]).includes(vraag.kleur)) { params.push(vraag.kleur); waar.push(`kleur = $${params.length}`); }
    for (const w of zoekWoorden(vraag.vraag)) {
      params.push(`%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      waar.push(`(titel ILIKE $${params.length} OR inhoud_plat ILIKE $${params.length} OR EXISTS (SELECT 1 FROM unnest(etiketten) e WHERE e ILIKE $${params.length}))`);
    }
    const sqlWaar = waar.join(' AND ');
    const totaal = Number((await q(`SELECT count(*)::int AS n FROM app.notities WHERE ${sqlWaar}`, params)).rows[0].n);
    const { rows } = await q(`SELECT * FROM app.notities WHERE ${sqlWaar} ORDER BY (vast_sinds IS NOT NULL) DESC, updated_at DESC, id LIMIT ${limiet} OFFSET ${offset}`, params);
    const t = (await q(
      `SELECT count(*) FILTER (WHERE verwijderd_op IS NULL AND gearchiveerd_op IS NULL)::int AS alle,
              count(*) FILTER (WHERE ${staat.vandaag})::int AS vandaag,
              count(*) FILTER (WHERE ${staat.vast})::int AS vast,
              count(*) FILTER (WHERE ${staat.lijsten})::int AS lijsten,
              count(*) FILTER (WHERE ${staat.archief})::int AS archief,
              count(*) FILTER (WHERE ${staat.prullenbak})::int AS prullenbak
         FROM app.notities WHERE ${WAAR(lade)}`, [lade.userId])).rows[0];
    const mappen = (await q(
      `SELECT m.*, (SELECT count(*)::int FROM app.notities n WHERE n.map_id = m.id AND n.verwijderd_op IS NULL AND n.gearchiveerd_op IS NULL) AS aantal
         FROM app.notities_mappen m WHERE ${WAAR(lade)} ORDER BY volgorde, naam`, [lade.userId])).rows.map(mapUit);
    const etiketten = (await q(
      `SELECT e AS etiket, count(*)::int AS aantal FROM app.notities, unnest(etiketten) e WHERE ${WAAR(lade)} AND verwijderd_op IS NULL AND gearchiveerd_op IS NULL GROUP BY e ORDER BY aantal DESC, e LIMIT 60`, [lade.userId])).rows;
    return {
      notities: rows.map(notitieUit), totaal, offset, limiet, volgende: offset + rows.length < totaal ? offset + rows.length : null,
      telling: { alle: Number(t.alle), vandaag: Number(t.vandaag), vast: Number(t.vast), lijsten: Number(t.lijsten), archief: Number(t.archief), prullenbak: Number(t.prullenbak) },
      mappen, etiketten,
    };
  });
}
/** De prullenbak leegt zichzelf na VN_PRULLENBAK_DAGEN: pas dan verdwijnt een notitie echt (met haar revisies). */
async function prullenbakOpruimen(q: Q, lade: Lade) {
  await q(`DELETE FROM app.notities WHERE ${WAAR(lade)} AND verwijderd_op IS NOT NULL AND verwijderd_op < now() - interval '${VN_PRULLENBAK_DAGEN} days'`, [lade.userId]).catch(() => undefined);
}

// ---------------------------------------------------------------- schrijven
async function revisieBewaren(q: Q, lade: Lade, r: any, reden: string) {
  await q(`INSERT INTO app.notities_revisies (notitie_id, user_id, versie, titel, inhoud_md, soort, kleur, etiketten, map_id, auteur, reden) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [r.id, lade.userId, r.versie, r.titel, r.inhoud_md, r.soort, r.kleur, r.etiketten || [], r.map_id, r.auteur, reden.slice(0, 40)]);
  await q(`DELETE FROM app.notities_revisies WHERE notitie_id = $1 AND id NOT IN (SELECT id FROM app.notities_revisies WHERE notitie_id = $1 ORDER BY versie DESC, id DESC LIMIT ${VN_REVISIES_PER_NOTITIE})`, [r.id]);
}
async function mapBestaat(q: Q, lade: Lade, mapId: string | null) {
  if (!mapId) return true;
  return (await q(`SELECT 1 FROM app.notities_mappen WHERE id::text = $2 AND ${WAAR(lade)}`, [lade.userId, mapId])).rows.length > 0;
}

export async function notitieMaken(lade: Lade, invoer: NotitieInvoer, opts: { auteur?: string; herkomst?: Record<string, unknown>; id?: string; gearchiveerd?: boolean } = {}): Promise<Notitie | { fout: 'MAP_ONBEKEND' }> {
  return alsGebruiker(lade.userId, async (q) => {
    if (!(await mapBestaat(q, lade, invoer.mapId))) return { fout: 'MAP_ONBEKEND' as const };
    const { rows } = await q(
      `INSERT INTO app.notities (id, user_id, ruimte, titel, inhoud_md, inhoud_plat, soort, kleur, etiketten, map_id, vast_sinds, gearchiveerd_op, auteur, herkomst)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $11 THEN now() END, CASE WHEN $12 THEN now() END, $13, $14::jsonb) RETURNING *`,
      [opts.id ?? null, lade.userId, lade.ruimte, invoer.titel, invoer.inhoud, platteTekst(invoer.inhoud), invoer.soort, invoer.kleur, invoer.etiketten, invoer.mapId, invoer.vast, opts.gearchiveerd === true, (opts.auteur || 'operator').slice(0, 80), JSON.stringify(opts.herkomst ?? {})]);
    const n = notitieUit(rows[0]);
    await spiegelSchrijf(q, lade, n);
    return n;
  });
}

export type WijzigUit = { ok: true; notitie: Notitie } | { ok: false; fout: 'NIET_GEVONDEN' | 'VERSIE_VEROUDERD' | 'MAP_ONBEKEND'; huidig?: Notitie };
/**
 * Inhoudelijke wijziging met versiecontrole: `versie` moet de versie zijn die de bewerker las. Een andere versie → 409 met de
 * huidige notitie, zodat de bewerker kan vergelijken in plaats van stil te overschrijven. `versie: null` = zonder controle
 * (de oude weg via het bord kent geen versies; die slaat altijd eerst een revisie op).
 */
export async function notitieWijzigen(lade: Lade, id: string, patch: Partial<NotitieInvoer> & { gearchiveerd?: boolean }, versie: number | null, opts: { auteur?: string; reden?: string } = {}): Promise<WijzigUit> {
  return alsGebruiker(lade.userId, async (q) => {
    const cur = await eenRij(q, lade, id);
    if (!cur) return { ok: false, fout: 'NIET_GEVONDEN' as const };
    if (versie !== null && Number(cur.versie) !== versie) return { ok: false, fout: 'VERSIE_VEROUDERD' as const, huidig: notitieUit(cur) };
    const volgende: NotitieInvoer = {
      titel: patch.titel ?? cur.titel, inhoud: patch.inhoud ?? cur.inhoud_md, soort: patch.soort ?? cur.soort, kleur: patch.kleur ?? cur.kleur,
      etiketten: patch.etiketten ?? cur.etiketten ?? [], mapId: patch.mapId === undefined ? (cur.map_id ? String(cur.map_id) : null) : patch.mapId, vast: patch.vast ?? Boolean(cur.vast_sinds),
    };
    if (!(await mapBestaat(q, lade, volgende.mapId))) return { ok: false, fout: 'MAP_ONBEKEND' as const };
    const inhoudelijk = volgende.titel !== cur.titel || volgende.inhoud !== cur.inhoud_md || volgende.soort !== cur.soort || volgende.kleur !== cur.kleur
      || JSON.stringify(volgende.etiketten) !== JSON.stringify(cur.etiketten || []) || volgende.mapId !== (cur.map_id ? String(cur.map_id) : null);
    if (inhoudelijk) await revisieBewaren(q, lade, cur, opts.reden || 'wijziging');
    const gearchiveerd = patch.gearchiveerd === undefined ? Boolean(cur.gearchiveerd_op) : patch.gearchiveerd;
    const { rows } = await q(
      `UPDATE app.notities SET titel = $3, inhoud_md = $4, inhoud_plat = $5, soort = $6, kleur = $7, etiketten = $8, map_id = $9,
         vast_sinds = CASE WHEN $10 THEN COALESCE(vast_sinds, now()) ELSE NULL END,
         gearchiveerd_op = CASE WHEN $11 THEN COALESCE(gearchiveerd_op, now()) ELSE NULL END,
         versie = versie + CASE WHEN $12 THEN 1 ELSE 0 END, auteur = $13, updated_at = CASE WHEN $12 THEN now() ELSE updated_at END
       WHERE id::text = $2 AND ${WAAR(lade)} AND verwijderd_op IS NULL RETURNING *`,
      [lade.userId, id, volgende.titel, volgende.inhoud, platteTekst(volgende.inhoud), volgende.soort, volgende.kleur, volgende.etiketten, volgende.mapId, volgende.vast, gearchiveerd, inhoudelijk, (opts.auteur || cur.auteur || 'operator').slice(0, 80)]);
    const n = notitieUit(rows[0]);
    await spiegelSchrijf(q, lade, n);
    return { ok: true as const, notitie: n };
  });
}

export type Actie = 'vast' | 'losmaken' | 'archief' | 'uit-archief' | 'prullenbak' | 'herstel' | 'definitief';
export const ACTIES: readonly Actie[] = Object.freeze(['vast', 'losmaken', 'archief', 'uit-archief', 'prullenbak', 'herstel', 'definitief']);
/** Toestandsacties zonder versiecontrole (zij raken de inhoud niet). Prullenbak haalt de spiegel weg; herstel zet haar terug. */
export async function notitieActie(lade: Lade, id: string, actie: Actie, auteur = 'operator'): Promise<Notitie | null> {
  return alsGebruiker(lade.userId, async (q) => {
    const cur = await eenRij(q, lade, id, { ookPrullenbak: true });
    if (!cur) return null;
    if (actie === 'definitief') {
      await q(`DELETE FROM app.notities WHERE id::text = $2 AND ${WAAR(lade)}`, [lade.userId, id]);
      await spiegelWis(q, lade, id);
      return notitieUit(cur);
    }
    if (cur.verwijderd_op && actie !== 'herstel') return null;
    const zet: Record<Exclude<Actie, 'definitief'>, string> = {
      vast: 'vast_sinds = COALESCE(vast_sinds, now())', losmaken: 'vast_sinds = NULL',
      archief: 'gearchiveerd_op = COALESCE(gearchiveerd_op, now()), vast_sinds = NULL', 'uit-archief': 'gearchiveerd_op = NULL',
      prullenbak: 'verwijderd_op = now(), vast_sinds = NULL', herstel: 'verwijderd_op = NULL',
    };
    const { rows } = await q(`UPDATE app.notities SET ${zet[actie]}, auteur = $3 WHERE id::text = $2 AND ${WAAR(lade)} RETURNING *`, [lade.userId, id, auteur.slice(0, 80)]);
    const n = notitieUit(rows[0]);
    if (actie === 'prullenbak') await spiegelWis(q, lade, id); else await spiegelSchrijf(q, lade, n);
    return n;
  });
}

export async function revisiesLezen(lade: Lade, id: string): Promise<NotitieRevisie[] | null> {
  return alsGebruiker(lade.userId, async (q) => {
    if (!(await eenRij(q, lade, id, { ookPrullenbak: true }))) return null;
    return (await q(`SELECT * FROM app.notities_revisies WHERE notitie_id::text = $2 AND user_id = $1 ORDER BY versie DESC, id DESC LIMIT ${VN_REVISIES_PER_NOTITIE}`, [lade.userId, id])).rows.map(revisieUit);
  });
}
/** Een oudere revisie terugzetten = een gewone wijziging (dus met een nieuwe revisie van wat er nu staat). */
export async function revisieHerstellen(lade: Lade, id: string, revisieId: string, auteur = 'operator'): Promise<WijzigUit> {
  const rev = await alsGebruiker(lade.userId, async (q) => (await q(`SELECT * FROM app.notities_revisies WHERE id::text = $2 AND notitie_id::text = $3 AND user_id = $1`, [lade.userId, revisieId, id])).rows[0]);
  if (!rev) return { ok: false, fout: 'NIET_GEVONDEN' };
  return notitieWijzigen(lade, id, { titel: rev.titel, inhoud: rev.inhoud_md, soort: rev.soort, kleur: rev.kleur, etiketten: rev.etiketten || [] }, null, { auteur, reden: `herstel v${rev.versie}` });
}

// ---------------------------------------------------------------- mappen
export async function mappenLijst(lade: Lade): Promise<NotitieMap[]> {
  return alsGebruiker(lade.userId, async (q) => (await q(
    `SELECT m.*, (SELECT count(*)::int FROM app.notities n WHERE n.map_id = m.id AND n.verwijderd_op IS NULL AND n.gearchiveerd_op IS NULL) AS aantal
       FROM app.notities_mappen m WHERE ${WAAR(lade)} ORDER BY volgorde, naam`, [lade.userId])).rows.map(mapUit));
}
export async function mapMaken(lade: Lade, naam: string, kleur: NotitieKleur = 'geen'): Promise<NotitieMap | { fout: 'NAAM_ONGELDIG' | 'TE_VEEL' | 'BESTAAT_AL' }> {
  const schoon = naam.replace(/\s+/g, ' ').trim();
  if (!schoon || schoon.length > VN_MAX_MAPNAAM) return { fout: 'NAAM_ONGELDIG' };
  return alsGebruiker(lade.userId, async (q) => {
    const n = Number((await q(`SELECT count(*)::int AS n FROM app.notities_mappen WHERE ${WAAR(lade)}`, [lade.userId])).rows[0].n);
    if (n >= VN_MAX_MAPPEN) return { fout: 'TE_VEEL' as const };
    if ((await q(`SELECT 1 FROM app.notities_mappen WHERE ${WAAR(lade)} AND lower(naam) = lower($2)`, [lade.userId, schoon])).rows.length) return { fout: 'BESTAAT_AL' as const };
    const { rows } = await q(`INSERT INTO app.notities_mappen (user_id, ruimte, naam, kleur, volgorde) VALUES ($1, $2, $3, $4, $5) RETURNING *, 0 AS aantal`, [lade.userId, lade.ruimte, schoon, (KLEUREN as readonly string[]).includes(kleur) ? kleur : 'geen', n]);
    return mapUit(rows[0]);
  });
}
export async function mapWijzigen(lade: Lade, id: string, patch: { naam?: string; kleur?: NotitieKleur }): Promise<NotitieMap | { fout: 'NIET_GEVONDEN' | 'NAAM_ONGELDIG' | 'BESTAAT_AL' }> {
  return alsGebruiker(lade.userId, async (q) => {
    const cur = (await q(`SELECT * FROM app.notities_mappen WHERE id::text = $2 AND ${WAAR(lade)}`, [lade.userId, id])).rows[0];
    if (!cur) return { fout: 'NIET_GEVONDEN' as const };
    const naam = patch.naam === undefined ? cur.naam : patch.naam.replace(/\s+/g, ' ').trim();
    if (!naam || naam.length > VN_MAX_MAPNAAM) return { fout: 'NAAM_ONGELDIG' as const };
    if ((await q(`SELECT 1 FROM app.notities_mappen WHERE ${WAAR(lade)} AND lower(naam) = lower($2) AND id::text <> $3`, [lade.userId, naam, id])).rows.length) return { fout: 'BESTAAT_AL' as const };
    const kleur = patch.kleur && (KLEUREN as readonly string[]).includes(patch.kleur) ? patch.kleur : cur.kleur;
    const { rows } = await q(`UPDATE app.notities_mappen SET naam = $3, kleur = $4, updated_at = now() WHERE id::text = $2 AND ${WAAR(lade)} RETURNING *, (SELECT count(*)::int FROM app.notities n WHERE n.map_id = app.notities_mappen.id AND n.verwijderd_op IS NULL) AS aantal`, [lade.userId, id, naam, kleur]);
    return mapUit(rows[0]);
  });
}
/** Een map weghalen laat de notities staan (map_id → NULL via ON DELETE SET NULL). Nooit notities mee verwijderen. */
export async function mapVerwijderen(lade: Lade, id: string): Promise<boolean> {
  return alsGebruiker(lade.userId, async (q) => (await q(`DELETE FROM app.notities_mappen WHERE id::text = $2 AND ${WAAR(lade)} RETURNING id`, [lade.userId, id])).rows.length > 0);
}

// ---------------------------------------------------------------- import en export
export type ImportVoorbeeld = { items: Array<ImportItem & { dubbel: 'bestaand' | 'in-import' | '' }>; fouten: ImportFout[]; bestanden: number; nieuw: number; dubbel: number };
function bestandenUit(raw: unknown): { naam: string; tekst: string }[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > VN_IMPORT_MAX_BESTANDEN) return null;
  const uit: { naam: string; tekst: string }[] = []; let bytes = 0;
  for (const b of raw) {
    const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
    const naam = String(o.naam ?? '').slice(0, 200), tekst = typeof o.tekst === 'string' ? o.tekst : '';
    bytes += tekst.length; if (bytes > VN_IMPORT_MAX_BYTES) return null;
    uit.push({ naam, tekst });
  }
  return uit;
}
export async function importVoorbeeld(lade: Lade, bestanden: { naam: string; tekst: string }[]): Promise<ImportVoorbeeld> {
  const items: ImportItem[] = []; const fouten: ImportFout[] = [];
  for (const b of bestanden) { const r = parseerImport(b); items.push(...r.items); fouten.push(...r.fouten); }
  const bestaand = await alsGebruiker(lade.userId, async (q) => new Set<string>((await q(`SELECT titel, inhoud_md FROM app.notities WHERE ${WAAR(lade)} AND verwijderd_op IS NULL`, [lade.userId])).rows.map((r) => vingerafdruk(r.titel, r.inhoud_md))));
  const gemarkeerd = markeerDubbelen(items.slice(0, VN_IMPORT_MAX_BESTANDEN), bestaand);
  return { items: gemarkeerd, fouten, bestanden: bestanden.length, nieuw: gemarkeerd.filter((i) => !i.dubbel).length, dubbel: gemarkeerd.filter((i) => i.dubbel).length };
}
/** Import = het voorbeeld opnieuw berekenen en alleen de niet-dubbele (tenzij `ookDubbelen`) in één transactie aanmaken. */
export async function importUitvoeren(lade: Lade, bestanden: { naam: string; tekst: string }[], opts: { ookDubbelen?: boolean; mapId?: string | null; etiket?: string; auteur?: string }): Promise<{ aangemaakt: Notitie[]; overgeslagen: number; fouten: ImportFout[] }> {
  const vb = await importVoorbeeld(lade, bestanden);
  const partij = createHash('sha256').update(bestanden.map((b) => `${b.naam}\n${b.tekst}`).join('\0')).digest('hex').slice(0, 16);
  const extra = vnEtiketten([opts.etiket]);
  const aangemaakt: Notitie[] = []; let overgeslagen = 0;
  await alsGebruiker(lade.userId, async (q) => {
    if (opts.mapId && !(await mapBestaat(q, lade, opts.mapId))) throw new Error('MAP_ONBEKEND');
    for (const it of vb.items) {
      if (it.dubbel && !opts.ookDubbelen) { overgeslagen++; continue; }
      const { rows } = await q(
        `INSERT INTO app.notities (user_id, ruimte, titel, inhoud_md, inhoud_plat, soort, kleur, etiketten, map_id, auteur, herkomst)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb) RETURNING *`,
        [lade.userId, lade.ruimte, it.titel, it.inhoud, platteTekst(it.inhoud), it.soort, it.kleur, vnEtiketten([...it.etiketten, ...extra]), opts.mapId ?? null, (opts.auteur || 'import').slice(0, 80),
          JSON.stringify({ bron: 'import', bestand: it.bestand, vingerafdruk: it.vingerafdruk, partij, op: new Date().toISOString() })]);
      const n = notitieUit(rows[0]);
      await spiegelSchrijf(q, lade, n);
      aangemaakt.push(n);
    }
  });
  return { aangemaakt, overgeslagen, fouten: vb.fouten };
}
export async function exportAlles(lade: Lade, opts: { ookArchief?: boolean } = {}): Promise<{ notities: Notitie[]; mappen: NotitieMap[] }> {
  return alsGebruiker(lade.userId, async (q) => ({
    notities: (await q(`SELECT * FROM app.notities WHERE ${WAAR(lade)} AND verwijderd_op IS NULL${opts.ookArchief ? '' : ' AND gearchiveerd_op IS NULL'} ORDER BY updated_at DESC LIMIT 5000`, [lade.userId])).rows.map(notitieUit),
    mappen: (await q(`SELECT *, 0 AS aantal FROM app.notities_mappen WHERE ${WAAR(lade)} ORDER BY volgorde, naam`, [lade.userId])).rows.map(mapUit),
  }));
}

// ---------------------------------------------------------------- de oude weg (bord / manage_hub_notes) → vNext
/** POST /api/mcp/board kind 'note' met etiket 'hub': hier aanmaken; de spiegelrij is het antwoord in de oude vorm. `null` = tabel ontbreekt. */
export async function bordNotitieToevoegen(lade: Lade, title: string, body: string, tags: string[], author: string) {
  try {
    const i = invoerUitBord(title, body, tags);
    const n = await notitieMaken(lade, i, { auteur: author, herkomst: { bron: 'bord', via: 'manage_hub_notes' }, gearchiveerd: i.gearchiveerd });
    if ('fout' in n) return null;
    const rij = await alsGebruiker(lade.userId, async (q) => (await q(`SELECT * FROM app.mcp_console_items WHERE id::text = $2 AND ${WAAR(lade)}`, [lade.userId, n.id])).rows[0]);
    return rij ? { note: bordUit(rij) } : null;
  } catch (err) { if (tabelOntbreekt(err)) return null; throw err; }
}
/**
 * PATCH kind 'edit' op een hub-notitie: de velden van het bord → vNext. Komt `body` ongewijzigd terug als de (afgeknotte) spiegel,
 * dan blijft de volledige inhoud staan — zo knot een bewerking via de oude weg nooit stil een lange notitie af.
 * `null` = geen vNext-rij (dan doet het bord wat het deed) of tabel ontbreekt.
 */
export async function bordNotitieWijzigen(lade: Lade, id: string, patch: { title?: string; body?: string; tags?: string[] }, author: string) {
  try {
    const cur = await notitieLezen(lade, id);
    if (!cur || cur.verwijderdOp) return null;
    const p: Partial<NotitieInvoer> & { gearchiveerd?: boolean } = {};
    if (patch.title !== undefined) p.titel = String(patch.title).slice(0, 300);
    if (patch.body !== undefined && String(patch.body) !== spiegelTekst(cur.inhoud)) p.inhoud = String(patch.body);
    if (patch.tags !== undefined) {
      const i = invoerUitBord(cur.titel, '', patch.tags);
      p.soort = i.soort; p.kleur = i.kleur; p.vast = i.vast; p.gearchiveerd = i.gearchiveerd;
      // Etiketten die de oude weg niet kan dragen (Oekraïens, > 32 tekens) blijven staan; de rest volgt het bord.
      p.etiketten = vnEtiketten([...i.etiketten, ...cur.etiketten.filter((e) => !/^[a-z0-9][a-z0-9:_-]{0,31}$/.test(e))]);
    }
    const uit = await notitieWijzigen(lade, id, p, null, { auteur: author, reden: 'bord' });
    if (!uit.ok) return null;
    const rij = await alsGebruiker(lade.userId, async (q) => (await q(`SELECT * FROM app.mcp_console_items WHERE id::text = $2 AND ${WAAR(lade)}`, [lade.userId, id])).rows[0]);
    return rij ? { note: bordUit(rij) } : null;
  } catch (err) { if (tabelOntbreekt(err)) return null; throw err; }
}
/** PATCH kind 'delete' op een hub-notitie = naar de prullenbak (30 dagen herstelbaar). `null` = geen vNext-rij of tabel ontbreekt. */
export async function bordNotitieVerwijderen(lade: Lade, id: string, author: string) {
  try {
    const n = await notitieActie(lade, id, 'prullenbak', author);
    return n ? { deleted: true, id: n.id, kind: 'note' as const, prullenbak: true } : null;
  } catch (err) { if (tabelOntbreekt(err)) return null; throw err; }
}

// ---------------------------------------------------------------- routes
const BORD_DIENSTEN = ['mcp', 'hub'] as const;
export function notitiesRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  type Run = (ctx: Ctx, auth: SessionOk, lade: Lade, kop: unknown, data: Record<string, unknown>) => Promise<ReturnType<typeof json>>;
  /** Dezelfde poort als het bord: goedgekeurd account, dienst hub/mcp, en de lade uit het TABBLAD (nooit uit het verzoek). */
  const route = (run: Run): RouterMiddleware[] => [(async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!(BORD_DIENSTEN as readonly string[]).includes(auth.service)) return error('MCP_SERVICE_REQUIRED', 403);
    if (auth.user.status !== 'approved' && auth.user.role !== 'owner') return error('ACCOUNT_NOT_APPROVED', 403);
    const data = bodyOf(ctx.body);
    const poort = await bordLade({ userId: auth.user.id, rol: auth.user.role ?? null, tabContext: data.tabContext });
    if (!poort.ok) return poort.resp;
    try { return await run(ctx, auth, poort.lade, poort.kop, data); }
    catch (err) {
      if (tabelOntbreekt(err)) return error('NOTITIES_MIGRATIE_ONTBREEKT', 503);
      if (err instanceof Error && /^[A-Z_]{4,40}$/.test(err.message)) return error(err.message, 400);
      throw err;
    }
  }) as RouterMiddleware];
  const wie = (auth: SessionOk) => (auth.user.email || auth.user.id).slice(0, 80);
  const audit = (auth: SessionOk, action: string, details: Record<string, unknown>) => auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action, type: 'bord', result: 'ok', details }).catch(() => undefined);

  return {
    'POST /api/notities/lijst': route(async (_c, _a, lade, kop, d) => json({ ...(await notitiesLijst(lade, {
      weergave: d.weergave as Weergave, mapId: typeof d.mapId === 'string' ? d.mapId : null, etiket: typeof d.etiket === 'string' ? d.etiket : '', vraag: typeof d.vraag === 'string' ? d.vraag : '',
      soort: typeof d.soort === 'string' ? (d.soort as NotitieSoort) : '', kleur: typeof d.kleur === 'string' ? (d.kleur as NotitieKleur) : '', offset: Number(d.offset) || 0, limiet: Number(d.limiet) || VN_LIJST_LIMIET,
    })), ruimte: kop })),
    'POST /api/notities/een': route(async (_c, _a, lade, kop, d) => {
      if (!isUuid(d.id)) return error('ID_ONGELDIG', 400);
      const n = await notitieLezen(lade, d.id);
      return n ? json({ notitie: n, ruimte: kop }) : error('NIET_GEVONDEN', 404);
    }),
    'POST /api/notities/nieuw': route(async (_c, auth, lade, kop, d) => {
      const denied = denyMutation(auth.user, 'workspace.write'); if (denied) return denied;
      const s = schoneInvoer(d);
      if (!s.ok) return error(s.fout, 400);
      const n = await notitieMaken(lade, s.invoer, { auteur: wie(auth), herkomst: { bron: 'site' } });
      if ('fout' in n) return error(n.fout, 400);
      void audit(auth, 'notitie.aangemaakt', { id: n.id, soort: n.soort });
      return json({ notitie: n, ruimte: kop });
    }),
    'POST /api/notities/wijzig': route(async (_c, auth, lade, kop, d) => {
      const denied = denyMutation(auth.user, 'workspace.write'); if (denied) return denied;
      if (!isUuid(d.id)) return error('ID_ONGELDIG', 400);
      const versie = d.versie === undefined || d.versie === null ? null : Number(d.versie);
      if (versie !== null && !Number.isInteger(versie)) return error('VERSIE_ONGELDIG', 400);
      const patch: Partial<NotitieInvoer> = {};
      if (d.titel !== undefined || d.inhoud !== undefined || d.soort !== undefined || d.kleur !== undefined || d.etiketten !== undefined || d.mapId !== undefined) {
        const cur = await notitieLezen(lade, d.id);
        if (!cur || cur.verwijderdOp) return error('NIET_GEVONDEN', 404);
        const s = schoneInvoer({ titel: d.titel ?? cur.titel, inhoud: d.inhoud ?? cur.inhoud, soort: d.soort ?? cur.soort, kleur: d.kleur ?? cur.kleur, etiketten: d.etiketten ?? cur.etiketten, mapId: d.mapId === undefined ? cur.mapId : d.mapId, vast: cur.vast });
        if (!s.ok) return error(s.fout, 400);
        Object.assign(patch, { titel: s.invoer.titel, inhoud: s.invoer.inhoud, soort: s.invoer.soort, kleur: s.invoer.kleur, etiketten: s.invoer.etiketten, mapId: s.invoer.mapId });
      }
      if (typeof d.vast === 'boolean') patch.vast = d.vast;
      const uit = await notitieWijzigen(lade, d.id, patch, versie, { auteur: wie(auth) });
      if (!uit.ok) return uit.fout === 'VERSIE_VEROUDERD' ? json({ error: uit.fout, huidig: uit.huidig, ruimte: kop }, 409) : error(uit.fout, uit.fout === 'NIET_GEVONDEN' ? 404 : 400);
      return json({ notitie: uit.notitie, ruimte: kop });
    }),
    'POST /api/notities/actie': route(async (_c, auth, lade, kop, d) => {
      const denied = denyMutation(auth.user, 'workspace.write'); if (denied) return denied;
      if (!isUuid(d.id)) return error('ID_ONGELDIG', 400);
      if (!ACTIES.includes(d.actie as Actie)) return error('ACTIE_ONGELDIG', 400);
      const n = await notitieActie(lade, d.id, d.actie as Actie, wie(auth));
      if (!n) return error('NIET_GEVONDEN', 404);
      if (d.actie === 'prullenbak' || d.actie === 'definitief') void audit(auth, `notitie.${d.actie}`, { id: n.id });
      return json({ notitie: n, ruimte: kop });
    }),
    'POST /api/notities/revisies': route(async (_c, _a, lade, kop, d) => {
      if (!isUuid(d.id)) return error('ID_ONGELDIG', 400);
      const r = await revisiesLezen(lade, d.id);
      return r ? json({ revisies: r, ruimte: kop }) : error('NIET_GEVONDEN', 404);
    }),
    'POST /api/notities/revisie-herstel': route(async (_c, auth, lade, kop, d) => {
      const denied = denyMutation(auth.user, 'workspace.write'); if (denied) return denied;
      if (!isUuid(d.id) || !/^\d{1,18}$/.test(String(d.revisieId ?? ''))) return error('ID_ONGELDIG', 400);
      const uit = await revisieHerstellen(lade, d.id, String(d.revisieId), wie(auth));
      return uit.ok ? json({ notitie: uit.notitie, ruimte: kop }) : error(uit.fout, 404);
    }),
    'POST /api/notities/mappen': route(async (_c, auth, lade, kop, d) => {
      const actie = String(d.actie || 'lijst');
      if (actie === 'lijst') return json({ mappen: await mappenLijst(lade), ruimte: kop });
      const denied = denyMutation(auth.user, 'workspace.write'); if (denied) return denied;
      if (actie === 'nieuw') { const m = await mapMaken(lade, String(d.naam ?? ''), d.kleur as NotitieKleur); return 'fout' in m ? error(m.fout, 400) : json({ map: m, ruimte: kop }); }
      if (!isUuid(d.id)) return error('ID_ONGELDIG', 400);
      if (actie === 'wijzig') { const m = await mapWijzigen(lade, d.id, { naam: typeof d.naam === 'string' ? d.naam : undefined, kleur: d.kleur as NotitieKleur }); return 'fout' in m ? error(m.fout, m.fout === 'NIET_GEVONDEN' ? 404 : 400) : json({ map: m, ruimte: kop }); }
      if (actie === 'verwijder') return (await mapVerwijderen(lade, d.id)) ? json({ verwijderd: true, ruimte: kop }) : error('NIET_GEVONDEN', 404);
      return error('ACTIE_ONGELDIG', 400);
    }),
    'POST /api/notities/import/voorbeeld': route(async (_c, _a, lade, kop, d) => {
      const b = bestandenUit(d.bestanden);
      if (!b) return error('IMPORT_ONGELDIG', 400);
      return json({ ...(await importVoorbeeld(lade, b)), ruimte: kop });
    }),
    'POST /api/notities/import/uitvoeren': route(async (_c, auth, lade, kop, d) => {
      const denied = denyMutation(auth.user, 'workspace.write'); if (denied) return denied;
      const b = bestandenUit(d.bestanden);
      if (!b) return error('IMPORT_ONGELDIG', 400);
      if (d.mapId !== undefined && d.mapId !== null && !isUuid(d.mapId)) return error('MAP_ONGELDIG', 400);
      const uit = await importUitvoeren(lade, b, { ookDubbelen: d.ookDubbelen === true, mapId: isUuid(d.mapId) ? d.mapId : null, etiket: typeof d.etiket === 'string' ? d.etiket : '', auteur: wie(auth) });
      void audit(auth, 'notitie.import', { aangemaakt: uit.aangemaakt.length, overgeslagen: uit.overgeslagen, fouten: uit.fouten.length });
      return json({ aangemaakt: uit.aangemaakt, overgeslagen: uit.overgeslagen, fouten: uit.fouten, ruimte: kop });
    }),
    'POST /api/notities/export': route(async (_c, _a, lade, kop, d) => json({ ...(await exportAlles(lade, { ookArchief: d.ookArchief === true })), ruimte: kop })),
  };
}
