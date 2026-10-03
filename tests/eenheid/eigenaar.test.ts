// Eenheidstests beveiliging fase 2: eigenaarskolommen (migratie 0003) en eigenaarscontrole in storage.
// Draaien: DATABASE_URL=... UPLOADS_DIR=... node scripts/eenheidstests.mjs (na node dist-server/migrate.mjs)
import { createHash, randomUUID } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import { storage, padHoortBijAnder } from '../../server/platform/storage';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

export async function main() {
  process.env.UPLOADS_DIR = process.env.UPLOADS_DIR || '/tmp/mr-uploads';
  const pool = getPool();
  const a = randomUUID(), b = randomUUID();
  const ids: string[] = [];
  const paden: string[] = [];
  try {
    // owner_id (gegenereerd): users → id; anders ownerUserId, userId, recipientUserId; anders NULL.
    const rijen: Array<[string, Record<string, unknown>]> = [['users', { email: 'x@example.test' }], ['cloud_items_v1', { ownerUserId: a, userId: b }], ['owner_service_sessions_v1', { userId: b }], ['site_notifications', { recipientUserId: a, recipientEmail: '' }], ['browser_policies', { naam: 'x' }], ['eenheid_leeg', { ownerUserId: '', userId: '' }]];
    const verwacht = [null, a, b, a, null, null];
    const uit: Array<string | null> = [];
    for (const [i, [tbl, data]] of rijen.entries()) {
      const id = i === 0 ? a : randomUUID(); ids.push(id);
      uit.push((await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3) RETURNING owner_id', [tbl, id, data])).rows[0].owner_id);
    }
    verwacht[0] = a;
    check('owner_id: users→id, ownerUserId vóór userId, recipientUserId, anders NULL (ook bij lege strings)', JSON.stringify(uit) === JSON.stringify(verwacht), JSON.stringify(uit.map(x => x === a ? 'A' : x === b ? 'B' : x)));
    const plan = (await pool.query("EXPLAIN SELECT id FROM app.records WHERE tbl='cloud_items_v1' AND owner_id=$1", [a])).rows.map(r => r['QUERY PLAN']).join(' ');
    check('index (tbl, owner_id) bestaat', (await pool.query("select 1 from pg_indexes where schemaname='app' and indexname='records_tbl_owner_idx'")).rowCount === 1, plan.slice(0, 80));

    // storage: eigenaar per bestand.
    const padA = `cloud/${sha(a).slice(0, 18)}/eenheid-${Date.now()}.txt`; paden.push(padA);
    const [okA] = await storage.write([{ path: padA, content: 'van A', contentType: 'text/plain', ownerId: a }]);
    const kolom = (await pool.query('SELECT owner_id FROM app.storage_objects WHERE path=$1', [padA])).rows[0]?.owner_id;
    const [leesA] = await storage.read([padA], { eigenaar: a });
    const [leesB] = await storage.read([padA], { eigenaar: b });
    const [zonder] = await storage.read([padA]);
    check('storage: write zet owner_id; read met juiste eigenaar ok, andere eigenaar geweigerd, zonder eigenaar (oude aanroepers) ok', okA && kolom === a && leesA.content === 'van A' && leesB.content === null && zonder.content === 'van A');
    const [overschrijfB] = await storage.write([{ path: padA, content: 'van B', contentType: 'text/plain', ownerId: b }]);
    const [naB] = await storage.read([padA], { eigenaar: a });
    check('storage: ander account kan het bestand niet overschrijven', overschrijfB === false && naB.content === 'van A');
    // Padconventie zonder bekende eigenaar (rij zonder owner_id, zoals vóór de migratie).
    await pool.query('UPDATE app.storage_objects SET owner_id = NULL WHERE path=$1', [padA]);
    const [conventieB] = await storage.read([padA], { eigenaar: b });
    check('storage: padconventie cloud/<hash> weigert een ander account ook zonder owner_id', conventieB.content === null && padHoortBijAnder(padA, b) && !padHoortBijAnder(padA, a) && !padHoortBijAnder('overig/x', b));
    // Aanvulling (backfill) zoals migratie 0003 die doet.
    await pool.query(`UPDATE app.storage_objects s SET owner_id = u.id FROM app.records u WHERE s.owner_id IS NULL AND u.tbl='users' AND s.path LIKE 'cloud/' || left(encode(sha256(convert_to(u.id,'UTF8')),'hex'),18) || '/%' AND s.path=$1`, [padA]);
    check('migratie 0003: backfill uit padconventie vindt de eigenaar', (await pool.query('SELECT owner_id FROM app.storage_objects WHERE path=$1', [padA])).rows[0]?.owner_id === a);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await storage.delete(paden).catch(() => undefined);
    if (ids.length) await pool.query('DELETE FROM app.records WHERE id = ANY($1)', [ids]);
  }
  await closePool();
  const mis = resultaten.filter(r => !r.ok).length;
  console.log(`\n${resultaten.length - mis}/${resultaten.length} geslaagd (eigenaar)`);
  return mis ? 1 : 0;
}
