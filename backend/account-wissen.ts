// Остаточне стирання акаунта: усі таблиці з колонкою акаунта + записи + файли.
// INTEG-001 (03.11): маршрути видалення дають 30 днів на відновлення (deleteRecoverably); після цього строку
// це стирання викликає завдання прибирання (backend/privacy.ts → verlopenVerwijderingenAfronden; SEC-002 privacy-logboek-01).
import { isOwnerEmail, storage } from '../server/platform';
import { getPool } from '../server/platform/pg';
import { EXTRA_WIS, ONTKOPPELEN, STANDAARD_KOLOM, wisOpdrachten, type WisTabel } from '../shared/account-wissen';
import { wisRecordsVanAccount } from './privacy';

// SEC-002 (slot-z, продовження): також колонка `veld` з ONTKOPPELEN — так у план потрапляють таблиці без колонки облікового запису
// (app.huis_gebeurtenissen, app.feature_flags), де треба лише відв’язати id. Ook de `veld` van ONTKOPPELEN: tabellen zonder accountkolom.
const VEILIG_SQL_NAAM = /^[a-z_][a-z0-9_]*$/;
const extraSql = [
  ...EXTRA_WIS.flatMap((t) => t.kolommen.map((k) => ({ schema: t.schema, tabel: t.tabel, kolom: k }))),
  ...ONTKOPPELEN.filter((o) => o.veld).map((o) => ({ schema: o.schema, tabel: o.tabel, kolom: o.veld })),
].filter((x) => [x.schema, x.tabel, x.kolom].every((n) => VEILIG_SQL_NAAM.test(n)))
  .map((x) => `(table_schema = '${x.schema}' AND table_name = '${x.tabel}' AND column_name = '${x.kolom}')`).join(' OR ');

/** План стирання реляційних таблиць одного акаунта (ті самі DELETE, що виконує accountMeteenWissen). */
async function wisPlanVoor(userId: string) {
  const pool = getPool();
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
  return metAfhankelijken(wisOpdrachten([...perTabel.values()], userId));
}

type WisOpdracht = ReturnType<typeof wisOpdrachten>[number];
const VEILIGE_NAAM = /^[a-z_][a-z0-9_]*$/;
/**
 * SEC-002 (toets-g10b #4): een vreemde sleutel ZONDER cascade (ON DELETE RESTRICT / NO ACTION, bv. cloud_move_proofs en
 * cloud_m9_upload_checkpoints → cloud_overdracht_jobs) liet de DELETE van de oudertabel — en daarmee de hele transactie — falen:
 * het account werd dan helemaal niet gewist. Nu gaat vóór elke DELETE van een oudertabel eerst een DELETE van de kindrijen die
 * naar precies DIE ouderrijen wijzen (ook kindtabellen zonder accountkolom), recursief tot 4 niveaus. De volgorde in de transactie
 * is daarmee altijd kind → ouder; RESTRICT laat zich niet uitstellen, dus de volgorde is de oplossing.
 */
async function metAfhankelijken(opdrachten: WisOpdracht[]): Promise<WisOpdracht[]> {
  const fks = (await getPool().query(
    `SELECT kn.nspname AS kind_schema, kr.relname AS kind_tabel, pn.nspname AS ouder_schema, pr.relname AS ouder_tabel,
            (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY AS k(n, ord) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n) AS kind_kol,
            (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY AS k(n, ord) JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n) AS ouder_kol
       FROM pg_constraint c
       JOIN pg_class kr ON kr.oid = c.conrelid JOIN pg_namespace kn ON kn.oid = kr.relnamespace
       JOIN pg_class pr ON pr.oid = c.confrelid JOIN pg_namespace pn ON pn.oid = pr.relnamespace
      WHERE c.contype = 'f' AND c.confdeltype IN ('r', 'a') AND pn.nspname IN ('app', 'public') AND kn.nspname IN ('app', 'public')`,
  )).rows as Array<{ kind_schema: string; kind_tabel: string; ouder_schema: string; ouder_tabel: string; kind_kol: string[]; ouder_kol: string[] }>;
  const geldig = fks.filter((f) => [f.kind_schema, f.kind_tabel, f.ouder_schema, f.ouder_tabel, ...f.kind_kol, ...f.ouder_kol].every((n) => VEILIGE_NAAM.test(n))
    && f.kind_kol.length === f.ouder_kol.length && f.kind_kol.length > 0 && !(f.kind_schema === f.ouder_schema && f.kind_tabel === f.ouder_tabel));
  const uit: WisOpdracht[] = [];
  const voeg = (o: WisOpdracht, diepte: number) => {
    const m = /^DELETE FROM ([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*) WHERE ([\s\S]+)$/.exec(o.sql);
    if (m && diepte < 4) {
      for (const f of geldig.filter((x) => x.ouder_schema === m[1] && x.ouder_tabel === m[2])) {
        voeg({ sql: `DELETE FROM ${f.kind_schema}.${f.kind_tabel} WHERE (${f.kind_kol.join(', ')}) IN (SELECT ${f.ouder_kol.join(', ')} FROM ${m[1]}.${m[2]} WHERE ${m[3]})`, params: o.params }, diepte + 1);
      }
    }
    uit.push(o);
  };
  for (const o of opdrachten) voeg(o, 0);
  return uit;
}

/**
 * SEC-002 (privacy-logboek-01): «сухий» підрахунок — скільки реляційних рядків стер би accountMeteenWissen.
 * Нічого не змінює: кожен DELETE плану читається як SELECT count(*) з тією самою умовою.
 */
export async function accountWisTelling(userId: string): Promise<{ opdrachten: number; rijen: number }> {
  const pool = getPool();
  const opdrachten = await wisPlanVoor(userId);
  let rijen = 0;
  for (const o of opdrachten) {
    // SEC-002 (slot-z): UPDATE-відв’язування (ONTKOPPELEN) несе власний SELECT count(*) у `tel`.
    const tel = o.tel || (o.sql.startsWith('DELETE FROM ') ? `SELECT count(*)::int AS n FROM ${o.sql.slice('DELETE FROM '.length)}` : '');
    if (!tel) continue;
    const n = await pool.query(tel, o.params);
    rijen += Number(n.rows[0]?.n || 0);
  }
  return { opdrachten: opdrachten.length, rijen };
}

export async function accountMeteenWissen(userId: string, email: string, nu = Date.now()): Promise<{ opdrachten: number; rijen: number; bestanden: number }> {
  const pool = getPool();
  // SEC-001-13: eigenaarscontrole en bestandspaden ophalen VÓÓR de DELETE-transactie (die ook app.storage_objects leegt).
  const rol = await pool.query("SELECT COALESCE(data->>'role', '') AS role, COALESCE(data->>'email', '') AS email FROM app.records WHERE tbl = 'users' AND id = $1", [userId]);
  if (String(rol.rows[0]?.role || '') === 'owner' || isOwnerEmail(email) || isOwnerEmail(String(rol.rows[0]?.email || ''))) {
    throw new Error('OWNER_NIET_WISSEN');
  }
  const paden = (await pool.query('SELECT path FROM app.storage_objects WHERE owner_id = $1', [userId]).catch(() => ({ rows: [] as Array<{ path: string }> }))).rows.map((r) => String(r.path));
  const opdrachten = await wisPlanVoor(userId);
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
  const records = await wisRecordsVanAccount(userId, email, nu);
  for (let i = 0; i < paden.length; i += 100) await storage.delete(paden.slice(i, i + 100), { eigenaar: userId });
  return { opdrachten: opdrachten.length, rijen: rijen + records.rijen, bestanden: Math.max(paden.length, records.bestanden) };
}
