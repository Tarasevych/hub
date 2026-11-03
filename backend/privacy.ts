// Fase 3 — privacy (AVG/GDPR):
//  * analytics: toestemming staat standaard UIT; zonder toestemming wordt niets geteld. Met toestemming
//    alleen anonieme dagtellers per gebeurtenisnaam (geen user-id, IP of apparaat in de teller).
//  * export: alle rijen van het account (app.records.owner_id = account) + bestandsmetadata, als JSON,
//    met geheimen/hashes weggelaten.
//  * verwijderen: zelf wissen én beheer zijn meteen (accountMeteenWissen, recoverableUntil 0, retiredAt).
//    deleteRecoverably blijft alleen voor een oud zacht pad dat nieuwe routes niet meer aanroepen.
//    De opruimjob rondt verlopen zachte verwijderingen af. Onomkeerbaar, daarom alleen
//    met ACCOUNT_DEFINITIEF_WISSEN=1; zonder die vlag rapporteert de job alleen (droog).
import { getPool } from '../server/platform/pg';
import { storage } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';

export const PRIVACY_TABEL = 'privacy_voorkeuren_v1';
export const ANALYTICS_TABEL = 'analytics_tellers_v1';
// Audit-fix 10: ruimer (liever een veld te veel weglaten dan een geheim exporteren): ook sleutels, API-keys,
// credentials, refresh/access, sessies, OTP/TOTP/herstel, handtekeningen, JWT en versleutelde velden (…Enc).
const GEHEIM_SLEUTEL = /(token|secret|hash|cookie|proof|nonce|pkce|pass(word|wd|phrase)?$|password|wachtwoord|cipher|encrypt|sealed|salt|verifier|codes?$|seed|private|key$|keys$|api[-_]?key|credential|authoriz|bearer|jwt|signature|otp|totp|recovery|herstel|session|refresh|grant|^iv$|^tag$|enc$|kid$|geheim|sleutel)/i;
const GEBEURTENIS = /^[a-z0-9][a-z0-9_.-]{0,59}$/;
/** Kolommen waarmee een rij bij een account hoort: het account is dan het onderwerp van de rij (zelfde reikwijdte als het wissen). */
const ACCOUNT_KOLOMMEN = ['user_id', 'owner_id', 'account_id', 'eigenaar_id'];
/** Een versleutelde envelop (v1.iv.ct.tag of dek1.…) is een geheim en hoort niet in de kopie. */
const VERSLEUTELD = /^(v1\.[^.\s]+\.[^.\s]+\.[^.\s]+|dek1\.)/;

export async function privacyVoorkeur(userId: string): Promise<{ analyticsConsent: boolean; updatedAt: number }> {
  const r = await getPool().query("SELECT data FROM app.records WHERE tbl = $1 AND data->>'userId' = $2 ORDER BY seq DESC LIMIT 1", [PRIVACY_TABEL, userId]);
  const d = (r.rows[0]?.data || {}) as { analyticsConsent?: unknown; updatedAt?: unknown };
  return { analyticsConsent: d.analyticsConsent === true, updatedAt: Number(d.updatedAt || 0) };
}

export async function zetAnalyticsToestemming(userId: string, waarde: boolean): Promise<{ analyticsConsent: boolean; updatedAt: number }> {
  const nu = Date.now();
  const data = { userId, analyticsConsent: waarde === true, updatedAt: nu };
  await getPool().query(
    `INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (tbl, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [PRIVACY_TABEL, `privacy:${userId}`, JSON.stringify(data)],
  );
  return { analyticsConsent: data.analyticsConsent, updatedAt: nu };
}

/** Telt één anonieme gebeurtenis, alleen met toestemming. De teller bevat geen verwijzing naar het account. */
export async function analyticsTellen(userId: string, naam: unknown): Promise<'geteld' | 'geen-toestemming' | 'ongeldig'> {
  const n = String(naam || '').trim().toLowerCase();
  if (!GEBEURTENIS.test(n)) return 'ongeldig';
  if (!(await privacyVoorkeur(userId)).analyticsConsent) return 'geen-toestemming';
  const dag = new Date().toISOString().slice(0, 10);
  await getPool().query(
    `INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, jsonb_build_object('dag', $3::text, 'naam', $4::text, 'aantal', 1))
     ON CONFLICT (tbl, id) DO UPDATE SET data = jsonb_set(app.records.data, '{aantal}', to_jsonb(COALESCE((app.records.data->>'aantal')::bigint, 0) + 1)), updated_at = now()`,
    [ANALYTICS_TABEL, `a:${dag}:${n}`, dag, n],
  );
  return 'geteld';
}

export function zonderGeheimen(waarde: unknown, diepte = 0): unknown {
  if (diepte > 12) return '[diep]';
  if (waarde instanceof Date) return waarde;
  if (Buffer.isBuffer(waarde)) return `[binair, ${waarde.length} bytes]`;
  if (typeof waarde === 'string' && VERSLEUTELD.test(waarde)) return '[versleuteld, niet opgenomen]';
  if (Array.isArray(waarde)) return waarde.map((v) => zonderGeheimen(v, diepte + 1));
  if (waarde && typeof waarde === 'object') {
    return Object.fromEntries(Object.entries(waarde as Record<string, unknown>).filter(([k]) => !GEHEIM_SLEUTEL.test(k)).map(([k, v]) => [k, zonderGeheimen(v, diepte + 1)]));
  }
  return waarde;
}

/**
 * Export van alle gegevens die bij dit account horen. Dezelfde reikwijdte als het wissen (wisRecordsVanAccount), plus
 * elke andere tabel met een accountkolom: een nieuwe tabel komt zo vanzelf mee. Geen afkapping en geen stille fouten:
 * als een deel niet te lezen is, stopt de export i.p.v. dat er stilzwijgend iets ontbreekt.
 */
export async function persoonsgegevensExport(userId: string) {
  const pool = getPool();
  const account = await pool.query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [userId]);
  const email = String((account.rows[0]?.data as { email?: unknown } | undefined)?.email || '').toLowerCase();
  const rijen = await pool.query(
    `SELECT tbl, id, data, created_at, updated_at FROM app.records
      WHERE (tbl = 'users' AND id = $1)
         OR owner_id = $1
         OR (tbl <> 'users' AND (data->>'accountId' = $1 OR data->>'userId' = $1 OR data->>'recipientUserId' = $1))
         OR ($2 <> '' AND tbl IN ('workspace_members', 'site_notifications') AND COALESCE(data->>'userId', '') = ''
             AND COALESCE(data->>'recipientUserId', '') = '' AND lower(COALESCE(data->>'email', data->>'recipientEmail', '')) = $2)
      ORDER BY tbl, seq`,
    [userId, email],
  );
  const gegevens: Record<string, unknown[]> = {};
  for (const r of rijen.rows) (gegevens[r.tbl] ||= []).push({ id: r.id, aangemaakt: r.created_at, bijgewerkt: r.updated_at, gegevens: zonderGeheimen(r.data) });
  // Alle andere tabellen met een accountkolom. records en storage_objects hierboven of hieronder apart.
  const tabellen = await pool.query(
    `SELECT table_name::text AS tabel, array_agg(column_name::text ORDER BY column_name) AS kolommen
       FROM information_schema.columns
      WHERE table_schema = 'app' AND table_name NOT IN ('records', 'storage_objects') AND column_name = ANY($1::text[])
      GROUP BY table_name ORDER BY table_name`,
    [ACCOUNT_KOLOMMEN],
  );
  const beveiligingslog: unknown[] = [];
  for (const t of tabellen.rows as Array<{ tabel: string; kolommen: string[] }>) {
    const voorwaarde = t.kolommen.map((k) => `"${k}"::text = $1`).join(' OR ');
    const uit = await pool.query(`SELECT * FROM app."${t.tabel}" WHERE ${voorwaarde}`, [userId]);
    if (t.tabel === 'audit') beveiligingslog.push(...uit.rows.map((r) => zonderGeheimen(r)));
    else if (uit.rows.length) gegevens[`app.${t.tabel}`] = uit.rows.map((r) => zonderGeheimen(r));
  }
  const bestanden = await pool.query('SELECT path, content_type, size_bytes, created_at FROM app.storage_objects WHERE owner_id = $1 ORDER BY created_at', [userId]);
  return {
    formaat: 'mijn-ruimte-export-v1',
    gemaaktOp: new Date().toISOString(),
    accountId: userId,
    toelichting: 'Geheimen, tokens, sleutels en versleutelde velden zijn niet opgenomen. Bestanden: alleen metadata; de inhoud zelf is via de cloud-app te downloaden.',
    gegevens,
    bestanden: bestanden.rows,
    beveiligingslog,
  };
}

/** Стерти записи й файли одного акаунта і лишити надгробок без персональних даних. Власника сервера не чіпає. */
export async function wisRecordsVanAccount(userId: string, email: string, nu = Date.now()): Promise<{ rijen: number; bestanden: number }> {
  const pool = getPool();
  const rol = await pool.query("SELECT COALESCE(data->>'role', '') AS role FROM app.records WHERE tbl = 'users' AND id = $1", [userId]);
  if (String(rol.rows[0]?.role || '') === 'owner') throw new Error('OWNER_NIET_WISSEN');
  const adres = String(email || '').toLowerCase();
  const paden = (await pool.query('SELECT path FROM app.storage_objects WHERE owner_id = $1', [userId])).rows.map((r) => String(r.path));
  for (let i = 0; i < paden.length; i += 100) await storage.delete(paden.slice(i, i + 100));
  const weg = await pool.query(
    `DELETE FROM app.records WHERE (owner_id = $1 AND tbl <> 'users')
        OR (tbl <> 'users' AND (data->>'accountId' = $1 OR data->>'userId' = $1 OR data->>'recipientUserId' = $1))
        OR ($2 <> '' AND tbl IN ('workspace_members', 'site_notifications')
            AND COALESCE(data->>'userId', '') = '' AND COALESCE(data->>'recipientUserId', '') = ''
            AND lower(COALESCE(data->>'email', data->>'recipientEmail', '')) = $2
            AND NOT EXISTS (SELECT 1 FROM app.records u WHERE u.tbl = 'users' AND u.id <> $1 AND lower(u.data->>'email') = $2))`,
    [userId, adres],
  );
  const bestaand = await pool.query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [userId]);
  const oud = (bestaand.rows[0]?.data || {}) as { deletedAt?: number; recoverableUntil?: number };
  const tombe = { status: 'deleted', role: 'member', email: `gewist-${userId}@invalid`, name: '', picture: '', sub: '', entitlements: [], deletedAt: oud.deletedAt || nu, recoverableUntil: nu, retiredAt: nu, gewistAt: nu, updatedAt: nu };
  await pool.query("UPDATE app.records SET data = $2::jsonb, updated_at = now() WHERE tbl = 'users' AND id = $1", [userId, JSON.stringify(tombe)]);
  await auditToevoegen({ ownerId: userId, actorId: 'systeem', action: 'account.definitief_gewist', result: 'success', details: { rijen: weg.rowCount || 0, bestanden: paden.length } }).catch(() => undefined);
  return { rijen: weg.rowCount || 0, bestanden: paden.length };
}

/** Afronden van verwijderingen waarvan de herstelperiode voorbij is (30 dagen). INTEG-001: standaard aan; uitzetten met ACCOUNT_DEFINITIEF_WISSEN=0. */
export async function verlopenVerwijderingenAfronden(nu = Date.now(), uitvoeren = process.env.ACCOUNT_DEFINITIEF_WISSEN !== '0') {
  const pool = getPool();
  const kandidaten = await pool.query(
    `SELECT id, data FROM app.records WHERE tbl = 'users' AND data->>'status' = 'deleted'
       AND jsonb_typeof(data->'recoverableUntil') = 'number' AND (data->>'recoverableUntil')::numeric > 0 AND (data->>'recoverableUntil')::numeric < $1
       AND COALESCE(data->>'gewistAt', '') = '' AND COALESCE(data->>'role', '') <> 'owner' LIMIT 50`,
    [nu],
  );
  const verslag: Array<{ id: string; rijen: number; bestanden: number }> = [];
  for (const k of kandidaten.rows as Array<{ id: string; data: Record<string, unknown> }>) {
    const email = String(k.data.email || '').toLowerCase();
    if (!uitvoeren) {
      const n = await pool.query('SELECT count(*)::int n FROM app.records WHERE owner_id = $1 AND tbl <> $2', [k.id, 'users']);
      verslag.push({ id: k.id, rijen: n.rows[0].n, bestanden: 0 });
      continue;
    }
    const gewist = await wisRecordsVanAccount(k.id, email, nu);
    verslag.push({ id: k.id, rijen: gewist.rijen, bestanden: gewist.bestanden });
  }
  return { uitgevoerd: uitvoeren, accounts: verslag };
}
