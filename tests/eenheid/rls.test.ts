// Eenheidstests beveiliging fase 2: rijbeveiliging (RLS) op app.records.
// Bewijst dat gebruiker A de rijen van B niet kan lezen/wijzigen/verwijderen via de database, ook als een
// route de controle vergeet: zowel via db.* in gebruikerscontext als met ruwe SQL als mijnruimte_app.
// Vereist de rollen (deploy/db-rollen-instellen.sh) en DATABASE_URL_APP/_SYSTEM; anders overgeslagen.
import { randomUUID } from 'node:crypto';
import { db } from '../../server/platform/db';
import { metVerzoek, zetGebruiker } from '../../server/platform/context';
import { appRolActief, closePool, getPool } from '../../server/platform/pg';
import { controleerRijen } from '../../server/platform/rls-audit';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };

const stand = (w: 'aan' | 'uit') => getPool('migratie').query("UPDATE app.rls_instellingen SET waarde = $1, bijgewerkt = now() WHERE sleutel = 'afdwingen'", [w]);
const als = <T>(userId: string, fn: () => Promise<T>) => metVerzoek('POST /api/eenheid/rls', async () => { zetGebruiker(userId, 'eenheid'); return fn(); });

export async function main() {
  if (!appRolActief()) {
    console.log('OVERGESLAGEN rls: DATABASE_URL_APP ontbreekt (rollen niet ingesteld)');
    await closePool();
    return 0;
  }
  const sys = getPool('systeem');
  const a = randomUUID(), b = randomUUID(), ws = `ws-${randomUUID()}`;
  const T = 'eenheid_rls_v1';
  const vorigeStand = ((await getPool('migratie').query("SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'")).rows[0]?.waarde === 'aan' ? 'aan' : 'uit') as 'aan' | 'uit';
  const ids: string[] = [];
  const voeg = async (tbl: string, data: Record<string, unknown>, id = randomUUID()) => { ids.push(id); await sys.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', [tbl, id, data]); return id; };
  try {
    const rijA = await voeg(T, { ownerUserId: a, tekst: 'van A' });
    const rijB = await voeg(T, { ownerUserId: b, tekst: 'van B' });
    const gedeeld = await voeg(T, { tekst: 'zonder eigenaar' });
    // Ruimte van A waarin B actief lid is; een rij van A in die ruimte is voor B zichtbaar.
    await voeg('workspaces', { ownerUserId: a, naam: 'ruimte' }, ws);
    await voeg('workspace_members', { workspaceId: ws, userId: b, status: 'active' });
    const inRuimte = await voeg(T, { ownerUserId: a, workspaceId: ws, tekst: 'gedeeld in ruimte' });

    await stand('aan');
    // 1) Via db.* in gebruikerscontext (zoals een route die de eigenaarscontrole vergeet).
    const [ziet] = await als(a, () => db.get(T, [rijB]));
    const lijst = await als(a, () => db.list(T, { limit: 100 }));
    const lijstIds = new Set(lijst.items.map((i: any) => i.id));
    check('db.get/list als A: rij van B onzichtbaar, eigen rij zichtbaar', ziet === null && lijstIds.has(rijA) && !lijstIds.has(rijB));
    const [upd] = await als(a, () => db.update(T, [{ id: rijB, record: { ownerUserId: b, tekst: 'gekaapt' } }]));
    const [del] = await als(a, () => db.delete(T, [rijB]));
    const naB = (await sys.query('SELECT data->>\'tekst\' AS t FROM app.records WHERE tbl=$1 AND id=$2', [T, rijB])).rows[0]?.t;
    check('db.update/delete als A op rij van B: geweigerd, rij onveranderd', upd === false && del === false && naB === 'van B');
    const [overname] = await als(a, () => db.update(T, [{ id: rijA, record: { ownerUserId: b, tekst: 'geschenk' } }]));
    const [nieuwVoorB] = await als(a, () => db.add(T, [{ ownerUserId: b, tekst: 'namens B' }]));
    if (nieuwVoorB) ids.push(nieuwVoorB);
    check('A kan geen rij aan B toewijzen (update WITH CHECK) of namens B toevoegen', overname === false && nieuwVoorB === null);
    const [zietGedeeld] = await als(a, () => db.get(T, [gedeeld]));
    check('rij zonder eigenaar in niet-gedeelde tabel: onzichtbaar (allowlist app.rls_gedeelde_tabellen leeg)', zietGedeeld === null);
    const [bZietRuimte] = await als(b, () => db.get(T, [inRuimte]));
    const [bZietA] = await als(b, () => db.get(T, [rijA]));
    check('ruimtelid B ziet rij in de ruimte, maar niet de andere rijen van A', !!bZietRuimte && bZietA === null);
    const [bZietRuimteRecord] = await als(b, () => db.get('workspaces', [ws]));
    const [bWijzigtRuimte] = await als(b, () => db.update('workspaces', [{ id: ws, record: { ownerUserId: a, naam: 'gekaapt' } }]));
    check('ruimtelid B leest het ruimterecord (0005), maar kan het niet wijzigen', !!bZietRuimteRecord && bWijzigtRuimte === false);
    // Gids (users): opzoeken over accounts heen mag (systeemrol), wijzigen van een ander account niet.
    await voeg('users', { email: `rls-b-${b}@example.test`, role: 'member', status: 'approved' }, b);
    const [aZietB] = await als(a, () => db.get('users', [b]));
    const [aWijzigtB] = await als(a, () => db.update('users', [{ id: b, record: { email: `rls-b-${b}@example.test`, role: 'owner', status: 'approved' } }]));
    const rolB = (await sys.query("SELECT data->>'role' AS r FROM app.records WHERE tbl='users' AND id=$1", [b])).rows[0]?.r;
    check('gids users: A kan B opzoeken, maar B niet tot eigenaar maken', !!aZietB && aWijzigtB === false && rolB === 'member');

    // 2) Ruwe SQL als mijnruimte_app (zonder db.ts): zonder app.user_id ziet de rol niets.
    const c = await getPool('app').connect();
    try {
      await c.query('BEGIN');
      const zonder = (await c.query('SELECT count(*)::int AS n FROM app.records WHERE id = ANY($1)', [[rijA, rijB]])).rows[0].n;
      await c.query("SELECT set_config('app.user_id', $1, true)", [a]);
      const metA = (await c.query('SELECT id FROM app.records WHERE id = ANY($1)', [[rijA, rijB]])).rows.map((r) => r.id);
      const u = (await c.query("UPDATE app.records SET data = data || '{\"tekst\":\"x\"}' WHERE id = $1", [rijB])).rowCount;
      const d = (await c.query('DELETE FROM app.records WHERE id = $1', [rijB])).rowCount;
      await c.query('COMMIT');
      check('ruwe SQL als mijnruimte_app: zonder app.user_id 0 rijen; als A alleen eigen rij, update/delete op B raakt 0 rijen', zonder === 0 && metA.length === 1 && metA[0] === rijA && u === 0 && d === 0);
      let fout = '';
      try { await c.query('SELECT 1 FROM app.storage_objects LIMIT 1'); } catch (e) { fout = String((e as any).code); }
      let auditFout = '';
      try { await c.query("UPDATE app.rls_instellingen SET waarde = 'uit'"); } catch (e) { auditFout = String((e as any).code); }
      check('mijnruimte_app heeft geen rechten op andere tabellen en kan de RLS-stand niet wijzigen', fout === '42501' && auditFout === '42501');
    } finally {
      await c.query('ROLLBACK').catch(() => undefined);
      c.release();
    }
    let sysFout = '';
    try { await sys.query("UPDATE app.rls_instellingen SET waarde = 'uit' WHERE false"); } catch (e) { sysFout = String((e as any).code); }
    check('mijnruimte_system kan de RLS-stand niet wijzigen (alleen het rollenscript als postgres/migrator)', sysFout === '42501');

    // 3) Audit-modus: policy's laten alles door, de app telt wat geweigerd zou zijn.
    await stand('uit');
    const [auditZiet] = await als(a, () => db.get(T, [rijB]));
    const geteld = await als(a, () => controleerRijen(T, 'lezen', [{ owner_id: b }, { owner_id: a }]));
    check('audit-modus: A leest B (nog) wel, en die rij wordt als overtreding geteld', !!auditZiet && geteld === 1);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await stand(vorigeStand).catch(() => undefined);
    await sys.query('DELETE FROM app.records WHERE id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query("DELETE FROM app.rls_audit WHERE route = 'POST /api/eenheid/rls'").catch(() => undefined);
  }
  const ok = resultaten.filter((r) => r.ok).length;
  console.log(`\n${ok}/${resultaten.length} geslaagd (rls)`);
  await closePool();
  return ok === resultaten.length ? 0 : 1;
}
