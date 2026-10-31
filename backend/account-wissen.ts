// Остаточне стирання акаунта одразу (рішення власника 25.10: без вікна відновлення).
import { isOwnerEmail, storage } from '../server/platform';
import { getPool } from '../server/platform/pg';
import { EXTRA_WIS, STANDAARD_KOLOM, wisOpdrachten, type WisTabel } from '../shared/account-wissen';
import { wisRecordsVanAccount } from './privacy';

const extraSql = EXTRA_WIS.flatMap((t) => t.kolommen.map((k) => `(table_schema = '${t.schema}' AND table_name = '${t.tabel}' AND column_name = '${k}')`)).join(' OR ');

export async function accountMeteenWissen(userId: string, email: string): Promise<{ opdrachten: number; rijen: number }> {
  const pool = getPool();
  // SEC-001-13: eigenaarscontrole en bestandspaden ophalen VÓÓR de DELETE-transactie (die ook app.storage_objects leegt).
  const rol = await pool.query("SELECT COALESCE(data->>'role', '') AS role, COALESCE(data->>'email', '') AS email FROM app.records WHERE tbl = 'users' AND id = $1", [userId]);
  if (String(rol.rows[0]?.role || '') === 'owner' || isOwnerEmail(email) || isOwnerEmail(String(rol.rows[0]?.email || ''))) {
    throw new Error('OWNER_NIET_WISSEN');
  }
  const paden = (await pool.query('SELECT path FROM app.storage_objects WHERE owner_id = $1', [userId]).catch(() => ({ rows: [] as Array<{ path: string }> }))).rows.map((r) => String(r.path));
  const kolommen = await pool.query(
    `SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema IN ('app', 'public')
        AND (column_name = ANY($1::text[])${extraSql ? ` OR ${extraSql}` : ''})`,
    [STANDAARD_KOLOM],
  );
  const perTabel = new Map<string, WisTabel>();
  for (const r of kolommen.rows as Array<{ table_schema: string; table_name: string; column_name: string; data_type: string }>) {
    const sleutel = `${r.table_schema}.${r.table_name}`;
    const t = perTabel.get(sleutel) || { schema: r.table_schema, tabel: r.table_name, kolommen: [], uuidKolommen: [] };
    t.kolommen.push(r.column_name);
    if (r.data_type === 'uuid') t.uuidKolommen!.push(r.column_name);
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
  for (let i = 0; i < paden.length; i += 100) await storage.delete(paden.slice(i, i + 100), { eigenaar: userId });
  return { opdrachten: opdrachten.length, rijen: rijen + records.rijen };
}
