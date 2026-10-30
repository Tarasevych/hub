// ZOEKEN — WACHTRIJ VOOR INDEXERING IN DE DATABASE (app.zoek_wachtrij, migratie 0096; CHECK op `bron` verruimd in 0100).
// Zelfde patroon als app.mail_queue (0016) + runMailQueue (backend/mail-opstel.ts): melden is idempotent, ophalen met
// FOR UPDATE SKIP LOCKED (twee runs pakken nooit hetzelfde item), een lease zodat een gecrashte run het item na LEASE_MIN
// weer vrijgeeft, en terugvallen met exponentiële wachttijd tot MAX_POGINGEN; daarna 'fout' met last_error.
//
// Drie soorten items (kolom `actie`):
//   volledig    bronId '*'  — één STAP van de (incrementele) scan van een bron in een lade; zet zichzelf opnieuw in de rij
//                             zolang er meer rijen zijn (voortgang in app.zoek_bron_stand);
//   bijwerken   bronId = id — één item opnieuw lezen en indexeren (zwaar werk: bijlage downloaden, bestand lezen, OCR via Z3);
//   verwijderen bronId = id — uit de index halen (wint altijd van bijwerken).
import { isZoekBron, type ZoekBron } from '../../shared/zoek-model';

export type { ZoekBron };
export type WachtActie = 'bijwerken' | 'verwijderen' | 'volledig';
export type WachtMelding = { userId: string; ruimte: 'prive' | 'technisch'; bron: ZoekBron; bronId: string; actie?: WachtActie; payload?: Record<string, unknown>; vertragingMs?: number };
export type WachtItem = { id: string; userId: string; ruimte: 'prive' | 'technisch'; bron: ZoekBron; bronId: string; actie: WachtActie; attempts: number; payload: Record<string, unknown> };
export type Q = (sql: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

export const MAX_POGINGEN = 6;
export const LEASE_MIN = 5;
export const VOLLEDIG_ID = '*';
/** 30 s, 1 min, 2 min, … tot hoogstens 6 uur (zelfde trap als mail-afzenders: scanBackoffMs, maar met een hoger plafond). */
export const wachttijdMs = (poging: number) => Math.min(6 * 3600_000, 30_000 * 2 ** Math.max(0, Math.min(20, poging - 1)));
/** Fouten die niet beter worden door opnieuw te proberen: meteen 'fout' (de bronstand toont het). */
export const isBlijvend = (code: string) => /REAUTH|NOT_CONNECTED|SCOPE_REQUIRED|FORBIDDEN|TOKEN_MISSING|BEVROREN|DIENST_UIT|NIET_GEVONDEN|NOT_FOUND|_INVALID$|LADE_MISMATCH|OCR_NIET_BESCHIKBAAR/.test(code);

const geldig = (m: WachtMelding) => isZoekBron(m.bron) && (m.ruimte === 'prive' || m.ruimte === 'technisch') && !!m.userId && !!m.bronId && m.bronId.length <= 500;

/** Meldt bronitems. Een item dat al wacht krijgt geen tweede rij; wel wordt de actie bijgewerkt (verwijderen wint). */
export async function zoekMelden(q: Q, meldingen: WachtMelding[]): Promise<number> {
  let nieuw = 0;
  for (const m of meldingen.filter(geldig).slice(0, 1000)) {
    const r = await q(`INSERT INTO app.zoek_wachtrij (user_id, ruimte, bron, bron_id, actie, payload, run_after)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb, now() + ($7::int * interval '1 millisecond'))
      ON CONFLICT (user_id, ruimte, bron, bron_id) WHERE status = 'wachtend'
        DO UPDATE SET actie = CASE WHEN EXCLUDED.actie = 'verwijderen' OR app.zoek_wachtrij.actie = 'verwijderen' THEN 'verwijderen' ELSE EXCLUDED.actie END,
                      payload = EXCLUDED.payload, run_after = LEAST(app.zoek_wachtrij.run_after, EXCLUDED.run_after), updated_at = now()
      RETURNING (xmax = 0) AS nieuw`,
      [m.userId, m.ruimte, m.bron, m.bronId, m.actie || 'bijwerken', JSON.stringify(m.payload || {}), Math.max(0, Math.min(86_400_000, m.vertragingMs || 0))]);
    if (r.rows[0]?.nieuw) nieuw += 1;
  }
  return nieuw;
}

/** Pakt tot `limiet` items die aan de beurt zijn (of waarvan de lease verlopen is), oudste eerst.
 *  `alleen` (zone D, 22.10.2026): de handmatige run van één mens pakt UITSLUITEND items van zijn eigen laden — nooit die van een ander. */
export async function zoekOphalen(q: Q, limiet = 20, alleen?: { userId: string; ruimtes: ReadonlyArray<'prive' | 'technisch'> }): Promise<WachtItem[]> {
  const eigen = alleen ? ` AND user_id = $2 AND ruimte = ANY($3::text[])` : '';
  const { rows } = await q(`UPDATE app.zoek_wachtrij SET status = 'bezig', attempts = attempts + 1, leased_until = now() + interval '${LEASE_MIN} minutes', updated_at = now()
      WHERE id IN (SELECT id FROM app.zoek_wachtrij
                    WHERE ((status = 'wachtend' AND run_after <= now()) OR (status = 'bezig' AND leased_until < now()))${eigen}
                    ORDER BY run_after, created_at LIMIT $1 FOR UPDATE SKIP LOCKED)
      RETURNING id, user_id, ruimte, bron, bron_id, actie, attempts, payload`, alleen ? [Math.min(100, Math.max(1, limiet)), alleen.userId, [...alleen.ruimtes]] : [Math.min(100, Math.max(1, limiet))]);
  return rows.map((r) => ({ id: String(r.id), userId: r.user_id, ruimte: r.ruimte, bron: r.bron, bronId: r.bron_id, actie: r.actie, attempts: Number(r.attempts), payload: r.payload || {} }));
}

export async function zoekKlaar(q: Q, id: string) {
  await q(`UPDATE app.zoek_wachtrij SET status = 'klaar', last_error = '', leased_until = NULL, done_at = now(), updated_at = now() WHERE id = $1`, [id]);
}

/** Fout: opnieuw met wachttijd, of definitief 'fout'. Wacht er al een nieuwere melding, dan vervalt deze ('geannuleerd'). */
export async function zoekFout(q: Q, item: WachtItem, code: string): Promise<'opnieuw' | 'fout' | 'vervangen'> {
  const fout = String(code || 'ZOEK_INDEX_MISLUKT').slice(0, 300);
  if (isBlijvend(fout) || item.attempts >= MAX_POGINGEN) {
    await q(`UPDATE app.zoek_wachtrij SET status = 'fout', last_error = $2, leased_until = NULL, done_at = now(), updated_at = now() WHERE id = $1`, [item.id, fout]);
    return 'fout';
  }
  try {
    await q(`UPDATE app.zoek_wachtrij SET status = 'wachtend', last_error = $2, leased_until = NULL, run_after = now() + ($3::int * interval '1 millisecond'), updated_at = now() WHERE id = $1`, [item.id, fout, wachttijdMs(item.attempts)]);
    return 'opnieuw';
  } catch (e: any) {
    if (e?.code !== '23505') throw e;   // unieke index: er wacht al een nieuwere melding voor dit item
    await q(`UPDATE app.zoek_wachtrij SET status = 'geannuleerd', last_error = $2, leased_until = NULL, done_at = now(), updated_at = now() WHERE id = $1`, [item.id, fout]);
    return 'vervangen';
  }
}

/** Uitstel zonder fout (bv. sleutelkluis dicht): het item gaat terug naar 'wachtend' zonder een poging te verbruiken. */
export async function zoekUitstellen(q: Q, item: WachtItem, reden: string, vertragingMs: number): Promise<'uitgesteld' | 'vervangen'> {
  try {
    await q(`UPDATE app.zoek_wachtrij SET status = 'wachtend', attempts = GREATEST(0, attempts - 1), last_error = $2, leased_until = NULL,
        run_after = now() + ($3::int * interval '1 millisecond'), updated_at = now() WHERE id = $1`, [item.id, reden.slice(0, 300), Math.max(1000, Math.min(86_400_000, vertragingMs))]);
    return 'uitgesteld';
  } catch (e: any) {
    if (e?.code !== '23505') throw e;
    await q(`UPDATE app.zoek_wachtrij SET status = 'geannuleerd', last_error = $2, leased_until = NULL, done_at = now(), updated_at = now() WHERE id = $1`, [item.id, reden.slice(0, 300)]);
    return 'vervangen';
  }
}

/** Alle open items van een lade (en optioneel één bron) annuleren: bij ontkoppelen van een integratie of bevriezen van een lade. */
export async function zoekAnnuleren(q: Q, lade: { userId: string; ruimte: string }, bron?: ZoekBron): Promise<number> {
  const r = await q(`UPDATE app.zoek_wachtrij SET status = 'geannuleerd', last_error = 'BRON_VERWIJDERD', leased_until = NULL, done_at = now(), updated_at = now()
      WHERE user_id = $1 AND ruimte = $2 AND status IN ('wachtend','bezig') AND ($3::text IS NULL OR bron = $3)`, [lade.userId, lade.ruimte, bron ?? null]);
  return r.rowCount || 0;
}

/** Zone D (22.10.2026), «Зупинити» in het indexvenster: alleen de GEPLANDE scanstappen (actie 'volledig') van deze lade vervallen;
 *  losse items (bijlage/inhoud) blijven staan — de cron plant stappen toch opnieuw, losse items niet. Nooit 'bezig' (een lopende stap rondt af). */
export async function zoekStappenAnnuleren(q: Q, lade: { userId: string; ruimte: string }, reden = 'HANDMATIG_GESTOPT'): Promise<number> {
  const r = await q(`UPDATE app.zoek_wachtrij SET status = 'geannuleerd', last_error = $3, leased_until = NULL, done_at = now(), updated_at = now()
      WHERE user_id = $1 AND ruimte = $2 AND status = 'wachtend' AND actie = 'volledig'`, [lade.userId, lade.ruimte, reden.slice(0, 300)]);
  return r.rowCount || 0;
}
/** Open items (wachtend + bezig) van één lade, per bron — voor het indexvenster (zone D). Alleen tellers, nooit inhoud. */
export async function zoekOpenPerBron(q: Q, lade: { userId: string; ruimte: string }): Promise<Record<string, { wachtend: number; bezig: number }>> {
  const { rows } = await q(`SELECT bron, count(*) FILTER (WHERE status='wachtend')::int AS wachtend, count(*) FILTER (WHERE status='bezig')::int AS bezig
      FROM app.zoek_wachtrij WHERE user_id = $1 AND ruimte = $2 AND status IN ('wachtend','bezig') GROUP BY bron`, [lade.userId, lade.ruimte]);
  return Object.fromEntries(rows.map((r) => [String(r.bron), { wachtend: Number(r.wachtend) || 0, bezig: Number(r.bezig) || 0 }]));
}

export type WachtTelling = { wachtend: number; bezig: number; fout: number; laatsteWachtFout: string; laatsteWachtFoutOp: number };
export async function zoekTelling(q: Q, lade: { userId: string; ruimte: string }, bron: ZoekBron): Promise<WachtTelling> {
  const w = (await q(`SELECT count(*) FILTER (WHERE status='wachtend')::int AS wachtend, count(*) FILTER (WHERE status='bezig')::int AS bezig, count(*) FILTER (WHERE status='fout')::int AS fout,
      (array_agg(last_error ORDER BY updated_at DESC) FILTER (WHERE status='fout'))[1] AS laatste, extract(epoch from max(updated_at) FILTER (WHERE status='fout'))*1000 AS op
      FROM app.zoek_wachtrij WHERE user_id=$1 AND ruimte=$2 AND bron=$3`, [lade.userId, lade.ruimte, bron])).rows[0] || {};
  return { wachtend: Number(w.wachtend) || 0, bezig: Number(w.bezig) || 0, fout: Number(w.fout) || 0, laatsteWachtFout: w.laatste || '', laatsteWachtFoutOp: Number(w.op) || 0 };
}

/** Opruimen: afgeronde items ouder dan 14 dagen (fouten 30 dagen, zodat de stand ze nog kan tonen). */
export async function zoekOpruimen(q: Q) {
  const r = await q(`DELETE FROM app.zoek_wachtrij WHERE (status IN ('klaar','geannuleerd') AND done_at < now() - interval '14 days') OR (status = 'fout' AND done_at < now() - interval '30 days')`);
  return r.rowCount || 0;
}
