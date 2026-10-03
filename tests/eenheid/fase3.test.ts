// Eenheidstests beveiliging fase 3: append-only audit (app.audit, hashketen), step-up, TOTP-replay (zetAlsHoger).
import { randomUUID } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import { db } from '../../server/platform/db';
import { metVerzoek, zetGebruiker } from '../../server/platform/context';
import { auditControle, auditLijst, auditToevoegen, auditVerwijderen, auditVoorWeergave } from '../../server/platform/audit';
import { googleAanmeldingVastleggen, stapOpGeldig, totpStapOpVastleggen, STAP_OP_TABEL } from '../../backend/stap-op';

const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
const code = async (fn: () => Promise<unknown>) => { try { await fn(); return 'geen-fout'; } catch (e) { return String((e as { code?: string }).code || (e as Error).message); } };

export async function main() {
  const sys = getPool('systeem');
  const a = randomUUID(), beheerder = randomUUID(), gewoon = randomUUID();
  const recordIds: string[] = [];
  try {
    // ---- audit ----
    await metVerzoek('POST /api/eenheid/audit', async () => {
      zetGebruiker(a, 'eenheid');
      for (const n of [1, 2, 3]) await auditToevoegen({ ownerId: a, action: `eenheid.stap${n}`, result: 'success', details: { n } });
    }, { ip: '198.51.100.7', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36' });
    const lijst = await auditLijst({ ownerId: a });
    check('audit: nieuwste eerst, seq 3..1, keten (prev_hash) klopt, ip alleen gehasht, apparaat grof',
      lijst.items.map((i) => i.seq).join(',') === '3,2,1' && lijst.items[0].prevHash === lijst.items[1].hash && lijst.items[2].prevHash === 'GENESIS'
      && !!lijst.items[0].ipHash && !String(lijst.items[0].ipHash).includes('198.51') && lijst.items[0].device === 'Chrome/Windows' && lijst.items[0].actorId === a,
      `${lijst.items.map((i) => i.seq).join(',')} ${lijst.items[0]?.device}`);
    const filter = await auditLijst({ ownerId: a, action: 'eenheid.stap2' });
    const pagina = await auditLijst({ ownerId: a, limit: 2 });
    const pagina2 = await auditLijst({ ownerId: a, limit: 2, voor: pagina.nextCursor });
    check('audit: filter op actie en paging met cursor', filter.items.length === 1 && pagina.items.length === 2 && !!pagina.nextCursor && pagina2.items.length === 1 && pagina2.items[0].seq === 1);
    check('audit: ketencontrole geldig', (await auditControle(a)).geldig);
    const upd = await code(() => sys.query("UPDATE app.audit SET action = 'vervalst' WHERE owner_id = $1", [a]));
    const del = await code(() => sys.query('DELETE FROM app.audit WHERE owner_id = $1', [a]));
    check('audit: UPDATE en DELETE rechtstreeks geweigerd (append-only)', upd === '42501' && del === '42501', `${upd}/${del}`);
    // Beheerder (security_admin) mag verwijderen via de functie; gewone gebruiker niet.
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2),('users',$3,$4)", [beheerder, { email: `b-${beheerder}@example.test`, role: 'member', status: 'approved' }, gewoon, { email: `g-${gewoon}@example.test`, role: 'member', status: 'approved' }]);
    recordIds.push(beheerder, gewoon);
    const rolId = randomUUID(); recordIds.push(rolId);
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('admin_role_assignments_v1',$1,$2)", [rolId, { tenantKey: 'global', userId: beheerder, role: 'security_admin', active: true }]);
    const geweigerd = await code(() => auditVerwijderen(gewoon, a, Date.now() + 1000, 'test'));
    const aantal = await auditVerwijderen(beheerder, a, Date.now() + 1000, 'eenheidstest');
    const na = await auditLijst({ ownerId: a });
    const controle = await auditControle(a);
    check('audit: verwijderen alleen voor super/security_admin, logt zichzelf, keten blijft verklaarbaar geldig',
      (geweigerd === '42501' || geweigerd.includes('AUDIT_VERWIJDEREN_GEWEIGERD')) && aantal === 3 && na.items.length === 1 && na.items[0].action === 'audit.verwijderd' && na.items[0].actorId === beheerder && controle.geldig,
      `${geweigerd} ${aantal} ${JSON.stringify(controle)}`);
    await auditToevoegen({ ownerId: a, action: 'eenheid.na', result: 'success' });
    check('audit: na verwijderen loopt de keten door (seq 5, geldig)', (await auditLijst({ ownerId: a, limit: 1 })).items[0].seq === 5 && (await auditControle(a)).geldig);
    const weergave = await auditVoorWeergave({ ownerId: a, limit: 10 });
    check('audit-weergave: nieuwe rijen in OwnerAudit-vorm (userId, eventHash, createdAt)', weergave.items.length >= 2 && (weergave.items[0] as any).eventHash && (weergave.items[0] as any).userId === a);

    // ---- step-up ----
    const nu = Date.now();
    const verse = { user: { id: a }, session: { id: `s-${a}`, createdAt: nu } };
    const oude = { user: { id: a }, session: { id: `o-${a}`, createdAt: nu - 3600_000 } };
    const zonder = await stapOpGeldig(verse);
    await googleAanmeldingVastleggen(a, nu);
    const viaGoogle = await stapOpGeldig(verse), oudViaGoogle = await stapOpGeldig(oude);
    const later = await stapOpGeldig(verse, nu + 6 * 60_000);
    await totpStapOpVastleggen(oude);
    const oudViaTotp = await stapOpGeldig(oude), andereSessie = await stapOpGeldig({ user: { id: a }, session: { id: 'ander', createdAt: nu - 3600_000 } });
    process.env.STAP_OP_UIT = '1'; const nood = await stapOpGeldig({ user: { id: 'x' }, session: null }); delete process.env.STAP_OP_UIT;
    check('step-up: zonder bewijs nee; verse Google-aanmelding + nieuwe sessie ja; oude sessie nee; na 5 min nee; TOTP geldt alleen voor die sessie; STAP_OP_UIT=1 noodschakelaar',
      !zonder && viaGoogle && !oudViaGoogle && !later && oudViaTotp && !andereSessie && nood, JSON.stringify([zonder, viaGoogle, oudViaGoogle, later, oudViaTotp, andereSessie, nood]));

    // ---- TOTP-replay (zetAlsHoger) ----
    const [tid] = await db.add('eenheid_totp_v1', [{ userId: a, lastStep: 100 }]);
    if (tid) recordIds.push(tid);
    const r = [await db.zetAlsHoger('eenheid_totp_v1', String(tid), 'lastStep', 100), await db.zetAlsHoger('eenheid_totp_v1', String(tid), 'lastStep', 101), await db.zetAlsHoger('eenheid_totp_v1', String(tid), 'lastStep', 101), await db.zetAlsHoger('eenheid_totp_v1', String(tid), 'lastStep', 99)];
    const gelijk = await Promise.all([102, 102, 102].map((v) => db.zetAlsHoger('eenheid_totp_v1', String(tid), 'lastStep', v)));
    check('TOTP-tijdvak eenmalig: gelijk/lager geweigerd, hoger één keer, gelijktijdig precies één winnaar', JSON.stringify(r) === '[false,true,false,false]' && gelijk.filter(Boolean).length === 1, JSON.stringify([r, gelijk]));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await sys.query('DELETE FROM app.records WHERE id = ANY($1)', [recordIds]).catch(() => undefined);
    await sys.query('DELETE FROM app.records WHERE tbl = $1 AND data->>\'userId\' = $2', [STAP_OP_TABEL, a]).catch(() => undefined);
  }
  const ok = resultaten.filter((x) => x.ok).length;
  console.log(`\n${ok}/${resultaten.length} geslaagd (fase3)`);
  await closePool();
  return ok === resultaten.length ? 0 : 1;
}
