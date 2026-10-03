// Gedeelde Postgres-verbindingspool (node-postgres). Wordt pas aangemaakt bij het eerste
// gebruik, zodat importeren zonder DATABASE_URL (bijv. in tests of build-stappen) niet faalt.
import pg from 'pg';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_ONTBREEKT');
  pool = new pg.Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'mijn-ruimte',
  });
  pool.on('error', (err) => console.error('[pg] fout in idle-verbinding:', err.message));
  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
