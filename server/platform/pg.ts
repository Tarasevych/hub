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
  return String(eigen || process.env.DATABASE_URL || '');
}

/** true als verzoeken van gebruikers via een eigen (RLS-)rol lopen. */
export const appRolActief = (): boolean => Boolean(process.env.DATABASE_URL_APP) && poolUrl('app') !== poolUrl('systeem');

export function getPool(soort: PoolSoort = 'systeem'): pg.Pool {
  const connectionString = poolUrl(soort);
  if (!connectionString) throw new Error('DATABASE_URL_ONTBREEKT');
  const bestaand = pools.get(connectionString);
  if (bestaand) return bestaand;
  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: `mijn-ruimte-${soort}`,
  });
  pool.on('error', (err) => console.error('[pg] fout in idle-verbinding:', err.message));
  pools.set(connectionString, pool);
  return pool;
}

export async function closePool(): Promise<void> {
  const alle = [...pools.values()];
  pools.clear();
  await Promise.all(alle.map((p) => p.end().catch(() => undefined)));
}
