// Compatibiliteitslaag voor de vroegere AppDeploy `db`-API (add/get/list/update/delete),
// opgeslagen in één generieke Postgres-tabel `app.records` (JSONB). Zie migrations/0001_basis.sql.
//
// Semantiek zoals AppDeploy:
//  - add: geeft per record het nieuwe id (of null bij falen) terug, in dezelfde volgorde.
//  - get: geeft de opgeslagen data in de volgorde van de gevraagde id's, null als die ontbreekt;
//         het id wordt NIET aan het record toegevoegd.
//  - list: één begrensde pagina in invoegvolgorde, elk item met `id`; `nextToken` voor de volgende.
//  - update: vervangt het volledige record (geen merge); boolean per item.
//  - delete: boolean per id.
// Verschil (verbetering): bij `list` met `filter` telt `limit` het aantal GEVONDEN items
// (AppDeploy telde gelezen items en kon matches missen).
import { randomUUID } from 'node:crypto';
import { getPool } from './pg';

const MAX_ITEMS_PER_CALL = 500;
const MAX_CALL_BYTES = 1024 * 1024; // 1 MiB per aanroep
const MAX_RECORD_BYTES = 256 * 1024; // 256 KiB per record
const MAX_LIST_LIMIT = 5000;
const DEFAULT_LIST_LIMIT = 100;

// Postgres-JSONB kan geen U+0000 opslaan; vervang dat teken door U+FFFD.
const noNul = (_key: string, value: unknown) =>
  typeof value === 'string' && value.includes('\u0000') ? value.replaceAll('\u0000', '\uFFFD') : value;

const serialize = (value: unknown) => JSON.stringify(value ?? {}, noNul);

function checkTable(table: string) {
  if (typeof table !== 'string' || !table || table.length > 200) throw new Error('DB_TABLE_INVALID');
}
function checkCount(n: number) {
  if (n > MAX_ITEMS_PER_CALL) throw new Error('DB_TOO_MANY_ITEMS');
}
function checkCallSize(serialized: string) {
  if (Buffer.byteLength(serialized) > MAX_CALL_BYTES) throw new Error('DB_CALL_TOO_LARGE');
}
const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 200;

const encodeToken = (seq: string) => Buffer.from(JSON.stringify({ s: seq })).toString('base64url');
function decodeToken(token: string | undefined): string {
  if (!token) return '0';
  try {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as { s?: unknown };
    const s = String(parsed.s ?? '');
    return /^\d{1,19}$/.test(s) ? s : '0';
  } catch {
    return '0';
  }
}

export const db = {
  /** Voeg records toe. Geeft per record een id (succes) of null (falen) terug. */
  async add(table: string, records: Array<Record<string, unknown>>): Promise<Array<string | null>> {
    checkTable(table);
    if (!Array.isArray(records) || records.length === 0) return [];
    checkCount(records.length);
    const rows = records.map((record) => {
      const data = serialize(record);
      return { id: randomUUID(), data, ok: Buffer.byteLength(data) <= MAX_RECORD_BYTES && !!record && typeof record === 'object' && !Array.isArray(record) };
    });
    checkCallSize(rows.map((r) => r.data).join(','));
    const valid = rows.filter((r) => r.ok);
    if (valid.length) {
      try {
        await getPool().query(
          `INSERT INTO app.records (tbl, id, data)
           SELECT $1, x.id, x.data FROM jsonb_to_recordset($2::jsonb) AS x(id text, data jsonb)`,
          [table, JSON.stringify(valid.map((r) => ({ id: r.id, data: JSON.parse(r.data) })))],
        );
      } catch (err) {
        // Val terug op per-record invoegen, zodat één fout record de rest niet blokkeert.
        console.error('[db.add] batch mislukt, per record opnieuw:', (err as Error).message);
        for (const row of valid) {
          try {
            await getPool().query('INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb)', [table, row.id, row.data]);
          } catch {
            row.ok = false;
          }
        }
      }
    }
    return rows.map((r) => (r.ok ? r.id : null));
  },

  /** Haal records op per id, in aanvraagvolgorde; null voor ontbrekende. */
  async get<T = Record<string, any>>(table: string, ids: string[]): Promise<Array<T | null>> {
    checkTable(table);
    if (!Array.isArray(ids) || ids.length === 0) return [];
    checkCount(ids.length);
    const wanted = ids.filter(validId);
    const found = new Map<string, T>();
    if (wanted.length) {
      const result = await getPool().query('SELECT id, data FROM app.records WHERE tbl = $1 AND id = ANY($2::text[])', [table, wanted]);
      for (const row of result.rows) found.set(row.id, row.data as T);
    }
    return ids.map((id) => (validId(id) && found.has(id) ? (found.get(id) as T) : null));
  },

  /** Eén begrensde pagina (invoegvolgorde), optioneel gefilterd op gelijkheid van velden. */
  async list<T = Record<string, any>>(
    table: string,
    options: { filter?: Record<string, unknown>; nextToken?: string; limit?: number } = {},
  ): Promise<{ items: Array<Omit<T, 'id'> & { id: string }>; nextToken?: string }> {
    checkTable(table);
    const limit = Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(Number(options.limit) || DEFAULT_LIST_LIMIT)));
    const after = decodeToken(options.nextToken);
    const filter = options.filter && typeof options.filter === 'object' ? serialize(options.filter) : null;
    const params: unknown[] = [table, after, limit + 1];
    let where = 'tbl = $1 AND seq > $2::bigint';
    if (filter && filter !== '{}') {
      params.push(filter);
      where += ' AND data @> $4::jsonb';
    }
    const result = await getPool().query(`SELECT id, seq, data FROM app.records WHERE ${where} ORDER BY seq LIMIT $3`, params);
    const rows = result.rows.slice(0, limit);
    const items = rows.map((row) => ({ ...(row.data as object), id: row.id as string })) as Array<Omit<T, 'id'> & { id: string }>;
    const nextToken = result.rows.length > limit ? encodeToken(String(rows[rows.length - 1].seq)) : undefined;
    return nextToken ? { items, nextToken } : { items };
  },

  /** Vervang records volledig. Geeft per item true/false terug. */
  async update(table: string, items: Array<{ id: string; record: Record<string, unknown> }>): Promise<boolean[]> {
    checkTable(table);
    if (!Array.isArray(items) || items.length === 0) return [];
    checkCount(items.length);
    const prepared = items.map((item) => {
      const data = serialize(item?.record);
      return { id: item?.id, data, ok: validId(item?.id) && Buffer.byteLength(data) <= MAX_RECORD_BYTES };
    });
    checkCallSize(prepared.map((p) => p.data).join(','));
    const valid = prepared.filter((p) => p.ok);
    const updated = new Set<string>();
    if (valid.length) {
      const result = await getPool().query(
        `UPDATE app.records r SET data = u.data, updated_at = now()
         FROM jsonb_to_recordset($2::jsonb) AS u(id text, data jsonb)
         WHERE r.tbl = $1 AND r.id = u.id RETURNING r.id`,
        [table, JSON.stringify(valid.map((p) => ({ id: p.id, data: JSON.parse(p.data) })))],
      );
      for (const row of result.rows) updated.add(row.id);
    }
    return prepared.map((p) => p.ok && updated.has(p.id));
  },

  /** Verwijder records per id. Geeft per id true/false terug. */
  async delete(table: string, ids: string[]): Promise<boolean[]> {
    checkTable(table);
    if (!Array.isArray(ids) || ids.length === 0) return [];
    checkCount(ids.length);
    const wanted = ids.filter(validId);
    const deleted = new Set<string>();
    if (wanted.length) {
      const result = await getPool().query('DELETE FROM app.records WHERE tbl = $1 AND id = ANY($2::text[]) RETURNING id', [table, wanted]);
      for (const row of result.rows) deleted.add(row.id);
    }
    return ids.map((id) => validId(id) && deleted.has(id));
  },

  /**
   * NIEUW (niet in AppDeploy): verwijder atomisch het eerste record dat aan `filter` voldoet en
   * geef het terug (met id). Bedoeld voor eenmalige tokens (handoff, OAuth-state) in fase B.
   */
  async takeOne<T = Record<string, any>>(table: string, filter: Record<string, unknown>): Promise<(T & { id: string }) | null> {
    checkTable(table);
    const result = await getPool().query(
      `DELETE FROM app.records WHERE (tbl, id) = (
         SELECT tbl, id FROM app.records WHERE tbl = $1 AND data @> $2::jsonb ORDER BY seq LIMIT 1 FOR UPDATE SKIP LOCKED
       ) RETURNING id, data`,
      [table, serialize(filter)],
    );
    const row = result.rows[0];
    return row ? ({ ...(row.data as object), id: row.id } as T & { id: string }) : null;
  },
};
