// Fase 3 — privacy (AVG/GDPR):
//  * analytics: toestemming staat standaard UIT; zonder toestemming wordt niets geteld. Met toestemming
//    alleen anonieme dagtellers per gebeurtenisnaam (geen user-id, IP of apparaat in de teller).
//  * export: alle rijen van het account (app.records.owner_id = account) + bestandsmetadata, als JSON,
//    met geheimen/hashes weggelaten.
//  * verwijderen: bestaande zachte verwijdering (30 dagen herstelbaar, deleteRecoverably). Daarna rondt de
//    opruimjob af: persoonsgegevens en inhoud van het account worden gewist. Onomkeerbaar, daarom alleen
//    met ACCOUNT_DEFINITIEF_WISSEN=1; zonder die vlag rapporteert de job alleen (droog).
import { getPool } from '../server/platform/pg';
import { storage } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';

export const PRIVACY_TABEL = 'privacy_voorkeuren_v1';
export const ANALYTICS_TABEL = 'analytics_tellers_v1';
const GEHEIM_SLEUTEL = /(token|secret|hash|cookie|proof|nonce|pkce|password|wachtwoord|cipher|encrypted|sealed|salt|verifier|codes?$|seed|privatekey|^iv$|^tag$)/i;
const GEBEURTENIS = /^[a-z0-9][a-z0-9_.-]{0,59}$/;
const EXPORT_MAX = 20000;

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
  if (Array.isArray(waarde)) return waarde.map((v) => zonderGeheimen(v, diepte + 1));
  if (waarde && typeof waarde === 'object') {
    return Object.fromEntries(Object.entries(waarde as Record<string, unknown>).filter(([k]) => !GEHEIM_SLEUTEL.test(k)).map(([k, v]) => [k, zonderGeheimen(v, diepte + 1)]));
  }
  return waarde;
}

/** Export van eigen gegevens. Leest bewust via de systeemrol met een expliciet filter op owner_id. */
export async function persoonsgegevensExport(userId: string) {
  const pool = getPool();
  const rijen = await pool.query('SELECT tbl, id, data, created_at, updated_at FROM app.records WHERE owner_id = $1 ORDER BY tbl, seq LIMIT $2', [userId, EXPORT_MAX + 1]);
  const bestanden = await pool.query('SELECT path, content_type, size_bytes, created_at FROM app.storage_objects WHERE owner_id = $1 ORDER BY created_at LIMIT 5000', [userId]);
  const audit = await pool.query('SELECT created_at, action, type, result, service, device FROM app.audit WHERE owner_id = $1 ORDER BY seq DESC LIMIT 5000', [userId]).catch(() => ({ rows: [] as unknown[] }));
  const perTabel: Record<string, unknown[]> = {};
  for (const r of rijen.rows.slice(0, EXPORT_MAX)) (perTabel[r.tbl] ||= []).push({ id: r.id, aangemaakt: r.created_at, bijgewerkt: r.updated_at, gegevens: zonderGeheimen(r.data) });
  return {
    formaat: 'mijn-ruimte-export-v1',
    gemaaktOp: new Date().toISOString(),
    accountId: userId,
    afgekapt: rijen.rows.length > EXPORT_MAX,
    toelichting: 'Geheimen, tokens en hashes zijn weggelaten. Bestanden: alleen metadata; inhoud via de cloud-app te downloaden.',
    gegevens: perTabel,
    bestanden: bestanden.rows,
    beveiligingslog: audit.rows,
  };
}

/** Afronden van verwijderingen waarvan de herstelperiode (30 dagen) voorbij is. Droog tenzij ACCOUNT_DEFINITIEF_WISSEN=1. */
export async function verlopenVerwijderingenAfronden(nu = Date.now(), uitvoeren = process.env.ACCOUNT_DEFINITIEF_WISSEN === '1') {
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
    const paden = (await pool.query('SELECT path FROM app.storage_objects WHERE owner_id = $1', [k.id])).rows.map((r) => String(r.path));
    for (let i = 0; i < paden.length; i += 100) await storage.delete(paden.slice(i, i + 100));
    const weg = await pool.query(
      `DELETE FROM app.records WHERE (owner_id = $1 AND tbl <> 'users')
          OR (tbl <> 'users' AND data->>'accountId' = $1)
          OR ($2 <> '' AND tbl IN ('workspace_members', 'site_notifications') AND lower(COALESCE(data->>'email', data->>'recipientEmail', '')) = $2)`,
      [k.id, email],
    );
    // Grafsteen: geen persoonsgegevens meer, wel het id (audit-keten en verwijzingen blijven consistent).
    const tombe = { status: 'deleted', role: 'member', email: `gewist-${k.id}@invalid`, name: '', picture: '', sub: '', entitlements: [], deletedAt: k.data.deletedAt || 0, recoverableUntil: k.data.recoverableUntil || 0, retiredAt: nu, gewistAt: nu, updatedAt: nu };
    await pool.query("UPDATE app.records SET data = $2::jsonb, updated_at = now() WHERE tbl = 'users' AND id = $1", [k.id, JSON.stringify(tombe)]);
    await auditToevoegen({ ownerId: k.id, actorId: 'systeem', action: 'account.definitief_gewist', result: 'success', details: { rijen: weg.rowCount || 0, bestanden: paden.length } }).catch(() => undefined);
    verslag.push({ id: k.id, rijen: weg.rowCount || 0, bestanden: paden.length });
  }
  return { uitgevoerd: uitvoeren, accounts: verslag };
}
