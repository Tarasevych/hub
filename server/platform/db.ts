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
import { appRolActief, getPool } from './pg';
import { gebruikerVanContext } from './context';
import { controleerRijen, type GeraakteRij } from './rls-audit';

/**
 * Eén query op app.records. In gebruikerscontext (na een sessiecontrole, zie context.ts) en met
 * DATABASE_URL_APP: als rol mijnruimte_app in een korte transactie met SET LOCAL app.user_id/app.service,
 * zodat de RLS-policy's gelden. Anders: systeempool (zoals vroeger).
 */
/**
 * Sessie-infrastructuur: altijd via de systeemrol. Deze tabellen worden door de sessiecontrole zelf gelezen
 * (vóór er een gebruiker bekend is) en bijgewerkt voor sessies van een ander account in dezelfde browser
 * (rootsessie bij een tab-overlay). Routes raken ze niet rechtstreeks.
 */
export const SYSTEEM_TABELLEN: ReadonlySet<string> = new Set([
  'owner_service_sessions_v1',
  'owner_tab_sessions_v1',
  'owner_auth_transactions_v1',
  'owner_revocation_state_v1',
]);

/**
 * Gids: LEZEN via de systeemrol, schrijven onder RLS. Accountrecords worden overal over accounts heen opgezocht
 * (deelnemer op e-mail, eigenaar voor meldingen, sessie → account, ruimteleden). Wijzigen kan alleen het eigen
 * record (of via een systeemroute).
 */
export const GIDS_TABELLEN: ReadonlySet<string> = new Set(['users']);

async function q(table: string, sql: string, params: unknown[], lezen = false): Promise<{ rows: any[]; rowCount: number | null }> {
  const gebruiker = SYSTEEM_TABELLEN.has(table) || (lezen && GIDS_TABELLEN.has(table)) ? null : gebruikerVanContext();
  if (!gebruiker || !appRolActief()) return getPool('systeem').query(sql, params);
  const client = await getPool('app').connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.service', $2, true)", [gebruiker.userId, gebruiker.service]);
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
const geraakt = (rows: any[]): GeraakteRij[] => rows.map((r) => ({ id: r.id, owner_id: r.owner_id ?? null, ws: r.ws ?? (r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>).workspaceId as string : null) ?? null }));
/** Audit-modus: tellen wat RLS zou weigeren (zie rls-audit.ts); faalt nooit de query zelf. */
const audit = (tbl: string, actie: 'lezen' | 'toevoegen' | 'wijzigen' | 'verwijderen', rows: any[]) => {
  if (!gebruikerVanContext() || !rows.length || SYSTEEM_TABELLEN.has(tbl) || (actie === 'lezen' && GIDS_TABELLEN.has(tbl))) return;
  void controleerRijen(tbl, actie, geraakt(rows)).catch(() => undefined);
};

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
        const result = await q(table, 
          `INSERT INTO app.records (tbl, id, data)
           SELECT $1, x.id, x.data FROM jsonb_to_recordset($2::jsonb) AS x(id text, data jsonb)
           RETURNING owner_id, data->>'workspaceId' AS ws`,
          [table, JSON.stringify(valid.map((r) => ({ id: r.id, data: JSON.parse(r.data) })))],
        );
        audit(table, 'toevoegen', result.rows);
      } catch (err) {
        // Val terug op per-record invoegen, zodat één fout record de rest niet blokkeert.
        console.error('[db.add] batch mislukt, per record opnieuw:', (err as Error).message);
        for (const row of valid) {
          try {
            const result = await q(table, "INSERT INTO app.records (tbl, id, data) VALUES ($1, $2, $3::jsonb) RETURNING owner_id, data->>'workspaceId' AS ws", [table, row.id, row.data]);
            audit(table, 'toevoegen', result.rows);
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
      const result = await q(table, 'SELECT id, data, owner_id FROM app.records WHERE tbl = $1 AND id = ANY($2::text[])', [table, wanted], true);
      audit(table, 'lezen', result.rows);
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
    const result = await q(table, `SELECT id, seq, data, owner_id FROM app.records WHERE ${where} ORDER BY seq LIMIT $3`, params, true);
    const rows = result.rows.slice(0, limit);
    audit(table, 'lezen', rows);
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
      let result: { rows: any[] };
      try {
        result = await q(table,
          `UPDATE app.records r SET data = u.data, updated_at = now()
           FROM jsonb_to_recordset($2::jsonb) AS u(id text, data jsonb)
           WHERE r.tbl = $1 AND r.id = u.id RETURNING r.id, r.owner_id, r.data->>'workspaceId' AS ws`,
          [table, JSON.stringify(valid.map((p) => ({ id: p.id, data: JSON.parse(p.data) })))],
        );
      } catch (err) {
        // RLS (afdwingen): nieuwe inhoud hoort bij een ander account (WITH CHECK) → niets bijgewerkt.
        if ((err as { code?: string }).code !== '42501') throw err;
        console.warn(`[db.update] door RLS geweigerd: ${table}`);
        result = { rows: [] };
      }
      audit(table, 'wijzigen', result.rows);
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
      const result = await q(table, "DELETE FROM app.records WHERE tbl = $1 AND id = ANY($2::text[]) RETURNING id, owner_id, data->>'workspaceId' AS ws", [table, wanted]);
      audit(table, 'verwijderen', result.rows);
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
    const result = await q(table, 
      `DELETE FROM app.records WHERE (tbl, id) = (
         SELECT tbl, id FROM app.records WHERE tbl = $1 AND data @> $2::jsonb ORDER BY seq LIMIT 1 FOR UPDATE SKIP LOCKED
       ) RETURNING id, data, owner_id`,
      [table, serialize(filter)],
    );
    audit(table, 'verwijderen', result.rows);
    const row = result.rows[0];
    return row ? ({ ...(row.data as object), id: row.id } as T & { id: string }) : null;
  },

  /**
   * NIEUW (niet in AppDeploy): verwijder atomisch één tekenreeks `value` uit de array `field` van
   * record `id`, alleen als die er nog in staat. Eén UPDATE: een gelijktijdige tweede aanroep wacht op
   * de rijvergrendeling, ziet daarna de nieuwe versie (waarin `value` ontbreekt) en wijzigt niets.
   * Optioneel wordt `countField` bijgewerkt naar de nieuwe lengte. Geeft true als déze aanroep de
   * waarde heeft verwijderd (bijv. eenmalige herstelcodes).
   */
  async takeArrayValue(table: string, id: string, field: string, value: string, countField?: string): Promise<boolean> {
    checkTable(table);
    const veld = /^[A-Za-z_][A-Za-z0-9_]{0,60}$/;
    if (!validId(id) || !veld.test(field) || (countField !== undefined && !veld.test(countField)) || typeof value !== 'string' || !value) return false;
    const result = await q(table, 
      `UPDATE app.records SET updated_at = now(), data = (
         SELECT CASE WHEN $5::text IS NULL THEN d ELSE jsonb_set(d, ARRAY[$5::text], to_jsonb(jsonb_array_length(d -> $3::text))) END
         FROM (SELECT jsonb_set(data, ARRAY[$3::text], COALESCE(
                 (SELECT jsonb_agg(e) FROM jsonb_array_elements(data -> $3::text) AS e WHERE e <> to_jsonb($4::text)),
                 '[]'::jsonb)) AS d) AS x)
       WHERE tbl = $1 AND id = $2 AND jsonb_typeof(data -> $3::text) = 'array' AND (data -> $3::text) @> jsonb_build_array($4::text)
       RETURNING id, owner_id, data->>'workspaceId' AS ws`,
      [table, id, field, value, countField ?? null],
    );
    audit(table, 'wijzigen', result.rows);
    return (result.rowCount ?? 0) === 1;
  },
};
