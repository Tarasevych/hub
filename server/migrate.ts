// Kleine migratierunner: voert migrations/NNNN_*.sql in volgorde uit, elk in een eigen
// transactie, en registreert ze in app.schema_migrations. Idempotent (al uitgevoerde
// migraties worden overgeslagen). Gebruik: node dist-server/migrate.mjs [--status]
import { readdir, readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, getPool } from './platform/pg';
import { pgVersie, pgVersieMelding } from './pg-versie';

const migrationsDir = () =>
  process.env.MIGRATIONS_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate({ statusOnly = false } = {}): Promise<string[]> {
  const pool = getPool('migratie');
  // Vóór alles: een te oude PostgreSQL eerlijk weigeren in plaats van halverwege met een syntaxfout te stoppen.
  const teOud = pgVersieMelding(await pgVersie(pool));
  if (teOud && !statusOnly) throw new Error(teOud);
  await pool.query('CREATE SCHEMA IF NOT EXISTS app');
  await pool.query('CREATE TABLE IF NOT EXISTS app.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const done = new Set((await pool.query('SELECT version FROM app.schema_migrations')).rows.map((r) => r.version as string));
  const files = (await readdir(migrationsDir())).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const applied: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (done.has(version)) continue;
    if (statusOnly) { applied.push(version); continue; }
    const sql = await readFile(path.join(migrationsDir(), file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['mijn-ruimte-migraties']);
      await client.query(sql);
      await client.query('INSERT INTO app.schema_migrations (version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      applied.push(version);
      console.log(`[migratie] uitgevoerd: ${version}`);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(`MIGRATIE_MISLUKT:${version}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  if (!statusOnly) {
    // Rechten van de rollen (fase 2) na elke run bijwerken: nieuwe tabellen krijgen zo meteen de juiste rechten.
    const rechten = path.join(migrationsDir(), 'rechten.sql');
    try {
      const sql = await readFile(rechten, 'utf8');
      await pool.query(sql);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`RECHTEN_MISLUKT: ${(err as Error).message}`);
    }
  }
  return applied;
}

// Vergelijk echte paden: systemd start via de symlink /srv/mijn-ruimte/current/…, terwijl Node
// import.meta.url naar het echte releasepad oplost. Zonder realpath start de server dan stil niet.
const isMain = (() => {
  try { return !!process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); } catch { return false; }
})();
if (isMain && process.argv.includes('--pg-controle')) {
  // Alleen de versie controleren (deploy/installeer-app.sh, vóór back-up en migraties); verandert niets.
  pgVersie(getPool('migratie'))
    .then((v) => {
      const melding = pgVersieMelding(v);
      if (melding) { console.error(melding); process.exitCode = 3; } else console.log(`[migratie] PostgreSQL ${v.tekst}: ondersteund`);
    })
    .catch((err) => { console.error(`PG_ONBEREIKBAAR: ${String(err?.message || err)}`); process.exitCode = 1; })
    .finally(() => closePool());
} else if (isMain) {
  const statusOnly = process.argv.includes('--status');
  migrate({ statusOnly })
    .then((list) => {
      if (statusOnly) console.log(list.length ? `[migratie] nog uit te voeren: ${list.join(', ')}` : '[migratie] alles is bijgewerkt');
      else if (!list.length) console.log('[migratie] niets te doen, schema is actueel');
    })
    .catch((err) => { console.error(String(err?.message || err)); process.exitCode = 1; })
    .finally(() => closePool());
}
