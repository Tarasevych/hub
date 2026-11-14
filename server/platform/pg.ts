// Gedeelde Postgres-verbindingspools (node-postgres). Worden pas aangemaakt bij het eerste gebruik,
// zodat importeren zonder DATABASE_URL (bijv. in tests of build-stappen) niet faalt.
//
// Drie soorten (beveiliging fase 2, zie deploy/db-rollen-instellen.sh):
//   systeem  → DATABASE_URL_SYSTEM  (rol mijnruimte_system, BYPASSRLS: cron, aanmelden, beheer)
//   app      → DATABASE_URL_APP     (rol mijnruimte_app, alleen DML, onder RLS: verzoeken van gebruikers)
//   migratie → DATABASE_URL_MIGRATIE (rol mijnruimte_migrator, eigenaar van het schema: alleen migrate.mjs)
// Ontbreekt een van deze, dan valt die soort terug op DATABASE_URL: zonder de nieuwe variabelen werkt
// alles precies zoals vroeger (één pool, één rol).
import pg from 'pg';

export type PoolSoort = 'systeem' | 'app' | 'migratie';
const pools = new Map<string, pg.Pool>();

export function poolUrl(soort: PoolSoort = 'systeem'): string {
  const eigen = soort === 'app' ? process.env.DATABASE_URL_APP : soort === 'migratie' ? process.env.DATABASE_URL_MIGRATIE : process.env.DATABASE_URL_SYSTEM;
  // Audit-fix 4: na env-splitsen ontbreekt DATABASE_URL in de app-omgeving; app/systeem vallen dan op elkaar terug
  // (nooit op een migratie-URL). De migratiestap krijgt DATABASE_URL(_MIGRATIE) uit /etc/mijn-ruimte/migratie.env.
  if (soort === 'migratie') return String(eigen || process.env.DATABASE_URL || '');
  return String(eigen || process.env.DATABASE_URL || process.env.DATABASE_URL_SYSTEM || '');
}

/** true als verzoeken van gebruikers via een eigen (RLS-)rol lopen. */
export const appRolActief = (): boolean => Boolean(process.env.DATABASE_URL_APP) && poolUrl('app') !== poolUrl('systeem');

let appRolWaarschuwingGemeld = false;

export function getPool(soort: PoolSoort = 'systeem'): pg.Pool {
  if (soort === 'app' && !appRolActief()) {
    if (process.env.REQUIRE_SEPARATE_APP_DB_ROLE === '1') throw new Error('DATABASE_URL_APP_VEREIST');
    if (process.env.NODE_ENV === 'production' && !appRolWaarschuwingGemeld) {
      appRolWaarschuwingGemeld = true;
      console.warn('[pg] WAARSCHUWING: DATABASE_URL_APP ontbreekt of is gelijk aan DATABASE_URL_SYSTEM — PostgreSQL RLS is niet afgedwongen op de app-pool (zie deploy/db-rollen-instellen.sh)');
    }
  }
  const connectionString = poolUrl(soort);
  if (!connectionString) throw new Error('DATABASE_URL_ONTBREEKT');
  // De migratiepool staat altijd los (eigen sleutel): zij krijgt nooit de tijdslimieten hieronder, ook niet als de URL gelijk is.
  const sleutel = soort === 'migratie' ? `migratie:${connectionString}` : connectionString;
  const bestaand = pools.get(sleutel);
  if (bestaand) return bestaand;
  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: `mijn-ruimte-${soort}`,
    ...(soort === 'migratie' ? {} : pgTijdslimieten()),
  });
  pool.on('error', (err) => console.error('[pg] fout in idle-verbinding:', err.message));
  pools.set(sleutel, pool);
  return pool;
}

/**
 * SEC-002 (keten-config-05): tijdslimieten voor de pools app en systeem. Vroeger geen enkele: één hangende query of een transactie die
 * openbleef (fout tussen BEGIN en COMMIT, trage klant) hield een van de tien verbindingen vast — onder een vloed van verzoeken was de
 * pool dan leeg voor iedereen (aanmelden, sessies, achtergrondwerk). Nu: een opdracht duurt hoogstens 120 s en een transactie mag
 * hoogstens 60 s stil openstaan. In te stellen (ms; 0 = uit): PG_STATEMENT_TIMEOUT_MS, PG_IDLE_IN_TRANSACTION_TIMEOUT_MS.
 * De migratiepool (migrate.mjs, migratieproef) krijgt ze niet: een migratie mag lang duren.
 */
export function pgTijdslimieten(): { statement_timeout?: number; idle_in_transaction_session_timeout?: number } {
  const ms = (naam: string, standaard: number) => { const v = process.env[naam]; const n = v === undefined || v === '' ? standaard : Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : standaard; };
  const opdracht = ms('PG_STATEMENT_TIMEOUT_MS', 120_000);
  const stil = ms('PG_IDLE_IN_TRANSACTION_TIMEOUT_MS', 60_000);
  return { ...(opdracht > 0 ? { statement_timeout: opdracht } : {}), ...(stil > 0 ? { idle_in_transaction_session_timeout: stil } : {}) };
}

export async function closePool(): Promise<void> {
  const alle = [...pools.values()];
  pools.clear();
  await Promise.all(alle.map((p) => p.end().catch(() => undefined)));
}
