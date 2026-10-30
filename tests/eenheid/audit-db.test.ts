// Regressietests audit-fix 4: app.audit alleen via SECURITY DEFINER-functies, seq onder lock en
// conflictbestendig, verwijderen alleen voor accounts in app.audit_beheerders (door de app niet te wijzigen).
// Draait tegen een wegwerp-Postgres met DATABASE_URL_APP/_SYSTEM/_MIGRATIE (zie scripts/eenheidstests.mjs).
import { randomUUID } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import { auditControle, auditIpPepperGeldig, auditLijst, auditToevoegen, auditVerwijderen, ipHash } from '../../server/platform/audit';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const code = async (fn: () => Promise<unknown>) => { try { await fn(); return 'geen-fout'; } catch (e) { return String((e as { code?: string }).code || (e as Error).message); } };

export async function main() {
  if (!process.env.DATABASE_URL_APP || !process.env.DATABASE_URL_MIGRATIE) { console.log('OVERGESLAGEN audit-db: DATABASE_URL_APP/_MIGRATIE ontbreken'); return 0; }
  const app = getPool('app'), sys = getPool('systeem'), mig = getPool('migratie');
  const eigenaar = randomUUID(), beheerder = randomUUID(), geblokkeerd = randomUUID(), ander = randomUUID();
  const ids = [beheerder, geblokkeerd];
  const rij = "INSERT INTO app.audit (owner_id, action, type, result, details, seq, prev_hash, hash) VALUES ($1, 'vervalst', 'beveiliging', 'success', '{}', 999, 'x', 'y')";
  try {
    // 1) Geen directe INSERT/UPDATE/DELETE meer voor app- en systeemrol.
    const appIns = await code(() => app.query(rij, [eigenaar]));
    const sysIns = await code(() => sys.query(rij, [eigenaar]));
    const appLees = await code(() => app.query('SELECT 1 FROM app.audit LIMIT 1'));
    const sysKop = await code(() => sys.query("INSERT INTO app.audit_kop (owner_key, seq, hash) VALUES ($1, 5, 'x')", [eigenaar]));
    check('directe INSERT op app.audit geweigerd voor app- en systeemrol; app leest niet; systeem schrijft audit_kop niet',
      appIns === '42501' && sysIns === '42501' && appLees === '42501' && sysKop === '42501', `${appIns}/${sysIns}/${appLees}/${sysKop}`);
    const appFn = await code(() => app.query("SELECT * FROM app.audit_toevoegen($1, NULL, 'eenheid.app', 'beveiliging', 'success', '{}', NULL, NULL, 'test')", [eigenaar]));
    const appVerw = await code(() => app.query('SELECT app.audit_verwijderen($1, $2, now(), $3)', [beheerder, eigenaar, 'x']));
    check('app-rol mag alleen via app.audit_toevoegen schrijven, niet verwijderen', appFn === 'geen-fout' && appVerw === '42501', `${appFn}/${appVerw}`);

    // 2) Een vervalste rij met hoog seq (bijv. van vóór deze fix) blokkeert de keten niet meer.
    await mig.query(rij, [eigenaar]).catch(async () => {
      // Sommige installaties hebben een append-only-trigger ook voor de eigenaar: dan via de functie hoog seq simuleren.
      await mig.query("INSERT INTO app.audit_kop (owner_key, seq, hash) VALUES ($1, 999, 'y') ON CONFLICT (owner_key) DO UPDATE SET seq = 999, hash = 'y'", [eigenaar]);
    });
    const na = await code(() => auditToevoegen({ ownerId: eigenaar, action: 'eenheid.na-vervalsing', result: 'success' }));
    const laatste = (await auditLijst({ ownerId: eigenaar, limit: 1 })).items[0];
    check('na een vervalste rij met seq 999 gaat toevoegen gewoon door (seq 1000)', na === 'geen-fout' && laatste?.seq === 1000, `${na} seq=${laatste?.seq}`);

    // 3) Gelijktijdig schrijven: unieke, aaneengesloten seq's en een geldige keten.
    await Promise.all(Array.from({ length: 25 }, (_, n) => auditToevoegen({ ownerId: ander, action: `eenheid.parallel${n}`, result: 'success' })));
    const alle = await sys.query('SELECT seq FROM app.audit WHERE owner_id = $1 ORDER BY seq', [ander]);
    const seqs = alle.rows.map(r => Number(r.seq));
    check('25 parallelle toevoegingen: seq 1..25 zonder dubbelen, keten geldig', seqs.length === 25 && seqs.every((s, i) => s === i + 1) && (await auditControle(ander)).geldig, seqs.join(','));

    // 4) Wie mag verwijderen bepaalt alleen postgres/de migrator.
    // security_admin (er mag maar één eigenaar-account bestaan: unieke index records_een_eigenaar).
    const r1 = randomUUID(), r2 = randomUUID(); ids.push(r1, r2);
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2),('users',$3,$4)", [beheerder, { email: `b-${beheerder}@example.test`, role: 'member', status: 'approved' }, geblokkeerd, { email: `x-${geblokkeerd}@example.test`, role: 'member', status: 'blocked' }]);
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('admin_role_assignments_v1',$1,$2),('admin_role_assignments_v1',$3,$4)", [r1, { tenantKey: 'global', userId: beheerder, role: 'security_admin', active: true }, r2, { tenantKey: 'global', userId: geblokkeerd, role: 'security_admin', active: true }]);
    const sysBeh = await code(() => sys.query('INSERT INTO app.audit_beheerders (user_id) VALUES ($1)', [beheerder]));
    const appBeh = await code(() => app.query('INSERT INTO app.audit_beheerders (user_id) VALUES ($1)', [beheerder]));
    check('systeem- en app-rol kunnen zichzelf geen auditbeheerder maken', sysBeh === '42501' && appBeh === '42501', `${sysBeh}/${appBeh}`);
    const zonder = await code(() => auditVerwijderen(beheerder, eigenaar, Date.now() + 1000, 'test'));
    await mig.query("INSERT INTO app.audit_beheerders (user_id, notitie) VALUES ($1, 'eenheidstest'), ($2, 'eenheidstest') ON CONFLICT DO NOTHING", [beheerder, geblokkeerd]);
    const blok = await code(() => auditVerwijderen(geblokkeerd, eigenaar, Date.now() + 1000, 'test'));
    const zonderReden = await code(() => auditVerwijderen(beheerder, eigenaar, Date.now() + 1000, '  '));
    const aantal = await auditVerwijderen(beheerder, eigenaar, Date.now() + 1000, 'eenheidstest');
    const sysKeten = await sys.query("SELECT 1 FROM app.audit WHERE owner_id IS NULL AND action = 'audit.verwijderd' AND details->>'ownerId' = $1", [eigenaar]);
    check('verwijderen: zonder registratie geweigerd, geblokkeerde beheerder geweigerd, reden verplicht; geregistreerde security_admin mag (ook in systeemketen gelogd)',
      zonder === '42501' && blok === '42501' && zonderReden === '22023' && aantal >= 2 && sysKeten.rowCount === 1, `${zonder}/${blok}/${zonderReden}/${aantal}/${sysKeten.rowCount}`);

    // 5) Audit-fix 10: IP-hash alleen met eigen pepper (≥ 32 tekens), geen terugval op RECOVERY_CODE_PEPPER.
    const oudePepper = process.env.AUDIT_IP_PEPPER;
    try {
      process.env.AUDIT_IP_PEPPER = '';
      const zonderPepper = ipHash('198.51.100.7');
      process.env.AUDIT_IP_PEPPER = 'kort';
      const kortePepper = ipHash('198.51.100.7');
      process.env.AUDIT_IP_PEPPER = 'p'.repeat(40);
      const h1 = ipHash('198.51.100.7');
      process.env.AUDIT_IP_PEPPER = 'q'.repeat(40);
      const h2 = ipHash('198.51.100.7');
      check('ipHash: zonder of met te korte AUDIT_IP_PEPPER geen hash (veilig falen); andere pepper → andere hash',
        zonderPepper === null && kortePepper === null && !!h1 && h1 !== h2 && /^[0-9a-f]{32}$/.test(String(h1)) && auditIpPepperGeldig());
    } finally { process.env.AUDIT_IP_PEPPER = oudePepper; }
  } finally {
    await mig.query('DELETE FROM app.audit_beheerders WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query('DELETE FROM app.records WHERE id = ANY($1)', [ids]).catch(() => undefined);
    await closePool();
  }
  const fout = resultaten.filter(r => !r.ok).length;
  console.log(`\naudit-db: ${resultaten.length - fout}/${resultaten.length} geslaagd`);
  return fout ? 1 : 0;
}
