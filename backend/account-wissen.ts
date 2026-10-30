// Остаточне стирання акаунта одразу (рішення власника 25.10: без вікна відновлення).
import { getPool } from '../server/platform/pg';
import { EXTRA_WIS, STANDAARD_KOLOM, wisOpdrachten, type WisTabel } from '../shared/account-wissen';
import { wisRecordsVanAccount } from './privacy';

const extraSql = EXTRA_WIS.flatMap((t) => t.kolommen.map((k) => `(table_schema = '${t.schema}' AND table_name = '${t.tabel}' AND column_name = '${k}')`)).join(' OR ');

export async function accountMeteenWissen(userId: string, email: string): Promise<{ opdrachten: number; rijen: number }> {
  const pool = getPool();
  const kolommen = await pool.query(
    `SELECT table_schema, table_name, column_name FROM information_schema.columns
      WHERE table_schema IN ('app', 'public')
        AND (column_name = ANY($1::text[])${extraSql ? ` OR ${extraSql}` : ''})`,
    [STANDAARD_KOLOM],
  );
  const perTabel = new Map<string, WisTabel>();
  for (const r of kolommen.rows as Array<{ table_schema: string; table_name: string; column_name: string }>) {
    const sleutel = `${r.table_schema}.${r.table_name}`;
    const t = perTabel.get(sleutel) || { schema: r.table_schema, tabel: r.table_name, kolommen: [] };
    t.kolommen.push(r.column_name);
    perTabel.set(sleutel, t);
  }
  const opdrachten = wisOpdrachten([...perTabel.values()], userId);
  const client = await pool.connect();
  let rijen = 0;
  try {
    await client.query('BEGIN');
    for (const o of opdrachten) {
      const weg = await client.query(o.sql, o.params);
      rijen += weg.rowCount || 0;
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  const records = await wisRecordsVanAccount(userId, email);
  return { opdrachten: opdrachten.length, rijen: rijen + records.rijen };
}
