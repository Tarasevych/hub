// Herstel van de uitrol-/updateflow (20261017): versienummer opnieuw te gebruiken, verlaten uploads opruimen, uitkomst van root
// betrouwbaar overnemen (ook als status.json al door een latere uitrol is overschreven), en de duur van het technisch profiel.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

const hex = (n: number) => randomBytes(n).toString('hex');
const SHA = 'a'.repeat(64);

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-herstel');
  const basis = mkdtempSync(join(tmpdir(), 'uitrol-herstel-'));
  const statusDir = join(basis, 'status'); mkdirSync(statusDir, { recursive: true });
  const oud = { a: process.env.UITROL_VOORSTEL_DIR, b: process.env.OPDRACHT_STATUS_DIR };
  Object.assign(process.env, { UITROL_VOORSTEL_DIR: join(basis, 'voorstellen'), OPDRACHT_STATUS_DIR: statusDir });
  const sys = getPool('systeem');
  try {
    const m = await import('../../backend/uitrol-goedkeuring');
    await sys.query("DELETE FROM app.uitrol_voorstellen WHERE versie LIKE '2027%'"); // eerdere testrun opruimen (vaste versienummers)
    const USER = `uh-${randomUUID()}`;
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [USER, { email: `${USER}@example.test`, role: 'member', status: 'approved' }]);
    await sys.query("INSERT INTO app.uitrol_voorbereiders (soort, onderwerp, account_id, label, gegeven_door, verloopt_op) VALUES ('account',$1,$1,'test','test', now() + interval '1 day')", [USER]);
    const o = [{ soort: 'account' as const, id: USER, accountId: USER }];
    const begin = (v: string) => m.voorstelBegin(o, { version: v, bytes: 100, sha256: SHA }).then((r) => ({ ok: true as const, r }), (e: { code?: string }) => ({ ok: false as const, code: e.code || String(e) }));
    const rij = async (id: string) => (await sys.query('SELECT status, uitkomst_code, uitkomst FROM app.uitrol_voorstellen WHERE id = $1', [id])).rows[0];

    // ---- 1. versienummer opnieuw te gebruiken ----
    const a = await begin('20270101-000001');
    check('versie: eerste voorstel start', a.ok);
    const dubbel = await begin('20270101-000001');
    check('versie: dezelfde versie terwijl het voorstel leeft → VERSIE_BESTAAT_AL', dubbel.ok === false && (dubbel as { code: string }).code === 'VERSIE_BESTAAT_AL');
    if (a.ok) await m.voorstelAnnuleren(o, { id: a.r.id });
    const a2 = await begin('20270101-000001');
    check('versie: na annuleren mag dezelfde versie opnieuw (geen blijvende blokkade)', a2.ok);
    if (a2.ok) {
      await sys.query("UPDATE app.uitrol_voorstellen SET status = 'afgewezen' WHERE id = $1", [a2.r.id]);
      check('versie: na afwijzen mag dezelfde versie opnieuw', (await begin('20270101-000001')).ok);
    }
    await sys.query("UPDATE app.uitrol_voorstellen SET status = 'geinstalleerd' WHERE versie = '20270101-000001' AND status = 'uploaden'");
    check('versie: een geïnstalleerde versie blijft geblokkeerd', ((await begin('20270101-000001')) as { code?: string }).code === 'VERSIE_BESTAAT_AL');

    // ---- 2. verlaten uploads houden geen plek vast ----
    await sys.query("DELETE FROM app.rate_limits WHERE bucket LIKE 'uitrol-voorstel:%'"); // de test begint hier opnieuw met de uurlimiet (10 per uur)
    await sys.query("UPDATE app.uitrol_voorstellen SET status = 'afgebroken' WHERE voorbereider_id IN (SELECT id FROM app.uitrol_voorbereiders WHERE account_id = $1) AND status IN ('uploaden','wacht-op-goedkeuring')", [USER]);
    const r1 = await begin('20270102-000001'), r2 = await begin('20270102-000002'), r3 = await begin('20270102-000003');
    check('opruimen: drie open voorstellen mogen', r1.ok && r2.ok && r3.ok);
    check('opruimen: een vierde terwijl alles nog loopt → TE_VEEL_OPEN', ((await begin('20270102-000004')) as { code?: string }).code === 'TE_VEEL_OPEN');
    await sys.query("UPDATE app.uitrol_voorstellen SET bijgewerkt_op = now() - interval '2 hours' WHERE id = ANY($1::uuid[])", [[r1, r2, r3].map((x) => (x.ok ? x.r.id : randomUUID()))]);
    const r4 = await begin('20270102-000004');
    check('opruimen: na 30 min zonder voortgang zijn de oude uploads afgebroken en past een nieuwe', r4.ok, JSON.stringify(r4));
    if (r1.ok) { const x = await rij(r1.r.id); check('opruimen: afgebroken met code UPLOAD_STIL', x.status === 'afgebroken' && x.uitkomst_code === 'UPLOAD_STIL'); }

    // ---- 3. uitkomst van root overnemen ----
    const nu = Date.now();
    const ev = (n: number, ms: number, code: string, niveau: string, tag: string, herkomst = 'passkey') => ({
      id: `20270103T${String(n).padStart(12, '0')}Z-${hex(4)}`, tijd: new Date(ms).toISOString(), bron: 'uitrol', code, niveau, uk: `uk ${code}`, nl: `nl ${code}`, tag, herkomst });
    const maak = async (versie: string, beslistMsGeleden: number) => {
      const id = randomUUID();
      await sys.query(`INSERT INTO app.uitrol_voorstellen (id, versie, status, bytes, sha256, ontvangen, voorbereider_id, voorbereider_label, account_id, beslist_op)
        SELECT $1, $2, 'goedgekeurd', 100, $3, 100, g.id, 'test', $4, now() - ($5 || ' milliseconds')::interval FROM app.uitrol_voorbereiders g WHERE g.account_id = $4 LIMIT 1`, [id, versie, SHA, USER, String(beslistMsGeleden)]);
      return id;
    };
    const vOk = await maak('20270103-000001', 60_000);
    const vMis = await maak('20270103-000002', 60_000);
    const vOudFout = await maak('20270103-000003', 60_000);     // een oude mislukking vóór de goedkeuring mag niet meetellen
    const vLeeg = await maak('20270103-000004', 3_600_000);     // 1 uur geleden goedgekeurd, root zweeg
    const vBezig = await maak('20270103-000005', 3_600_000);    // idem, maar root is er nu mee bezig
    const vRecent = await maak('20270103-000006', 30_000);      // net goedgekeurd, nog geen uitkomst
    const vWeiger = await maak('20270103-000007', 60_000);      // root weigerde
    const vSsh = await maak('20270103-000008', 3_600_000);      // alleen een SSH-installatie met hetzelfde pakket: geen vals «geïnstalleerd»
    writeFileSync(join(statusDir, 'gebeurtenissen.jsonl'), [
      ev(1, nu - 30_000, 'GOEDGEKEURD', 'info', '20270103-000001'),
      ev(2, nu - 20_000, 'OK', 'info', '20270103-000001'),
      ev(3, nu - 20_000, 'INSTALLATIE_MISLUKT', 'fout', '20270103-000002'),
      ev(4, nu - 7_200_000, 'INSTALLATIE_MISLUKT', 'fout', '20270103-000003'),
      ev(5, nu - 10_000, 'SLEUTEL_ONBEKEND', 'waarschuwing', '20270103-000007'),
      { ...ev(6, nu - 3_000_000, 'SSH_OK', 'info', '20270103-000099', 'ssh'), pakket: '20270103-000008', release: '20270103-120000', wie: 'beheer' },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n');
    writeFileSync(join(statusDir, 'status.json'), JSON.stringify({ staat: 'bezig', code: 'INSTALLEREN', versie: '20270103-000005', methode: 'passkey', uk: 'x', nl: 'x', tijd: new Date().toISOString() }));
    await m.synchroniseer();
    const s = async (id: string) => (await rij(id)).status as string;
    check('uitkomst: OK-gebeurtenis na de goedkeuring → geinstalleerd', await s(vOk) === 'geinstalleerd');
    check('uitkomst: INSTALLATIE_MISLUKT → mislukt (met tekst van root)', await s(vMis) === 'mislukt' && (await rij(vMis)).uitkomst?.uk === 'uk INSTALLATIE_MISLUKT');
    check('uitkomst: een mislukking van VÓÓR de goedkeuring telt niet mee', await s(vOudFout) === 'goedgekeurd');
    check('uitkomst: geweigerd door root → geweigerd met de code van root', await s(vWeiger) === 'geweigerd' && (await rij(vWeiger)).uitkomst_code === 'SLEUTEL_ONBEKEND');
    check('uitkomst: 1 uur goedgekeurd zonder uitkomst → verlopen / GEEN_UITKOMST', await s(vLeeg) === 'verlopen' && (await rij(vLeeg)).uitkomst_code === 'GEEN_UITKOMST');
    check('uitkomst: root is er nu mee bezig → niet afgesloten', await s(vBezig) === 'goedgekeurd');
    check('uitkomst: net goedgekeurd → nog afwachten', await s(vRecent) === 'goedgekeurd');
    check('uitkomst: een SSH-installatie zet het voorstel niet op «geïnstalleerd» (maar het voorstel hangt ook niet eeuwig)', await s(vSsh) === 'verlopen');

    // ---- 4. technisch profiel: duur ----
    const tp = await import('../../backend/tech-profiel');
    const eig = { id: `th-${randomUUID()}`, email: process.env.OWNER_EMAIL, role: 'owner', status: 'approved' };
    const tab = hex(24);
    const duur = async (min: number) => { const a = await tp.activeren(eig, tab, min, 'testreden'); return Math.round((a.eind - a.begin) / 60000); };
    check('tech: 60 minuten blijft 60', (await duur(60)) === 60);
    check('tech: 8 uur (480) is een geldige vaste termijn voor de eigenaar', (await duur(480)) === 480);
    const a0 = await tp.activeren(eig, tab, 0, 'testreden'), u0 = Math.round((a0.eind - a0.begin) / 60000);
    check('tech: «tot uitloggen» (0) heeft GEEN tijdsgrens van 2 of 8 uur en modus tot-uitloggen', u0 > 480 && a0.modus === 'tot-uitloggen', String(u0));
    check('tech: «tot uitloggen» is nog actief als actieve activering', (await tp.actieveActivatie(eig.id, tab))?.id === a0.id);
    const a1 = await tp.activeren(eig, tab, -1, 'testreden'), u1 = Math.round((a1.eind - a1.begin) / 60000);
    check('tech: «tot verlaten» (-1) heeft GEEN tijdsgrens en modus tot-verlaten', u1 > 480 && a1.modus === 'tot-verlaten', String(u1));
    check('tech: uitloggen beëindigt de lopende activering (reden uitgelogd)', (await tp.beeindigenBijUitloggen(eig.id, tab)) === 1 && (await tp.actieveActivatie(eig.id, tab)) === null
      && (await sys.query("SELECT 1 FROM app.tech_activaties WHERE id = $1 AND beeindigd_reden = 'uitgelogd'", [a1.id])).rows.length === 1);
    const a3 = await tp.activeren(eig, tab, 0, 'testreden');
    check('tech: uitloggen in een ander tabblad raakt deze activering niet', (await tp.beeindigenBijUitloggen(eig.id, hex(24))) === 0 && (await tp.actieveActivatie(eig.id, tab))?.id === a3.id);
    check('tech: een vaste termijn blijft hard begrensd op 8 uur in de database', await sys.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op, modus) VALUES ($1,'tech-000000000000',$2,ARRAY['eigenaar'],'abc', now() + interval '9 hours','tijd')`, [eig.id, 'b'.repeat(64)]).then(() => false, () => true));
    check('tech: een beheerder (plafond 1 uur) krijgt geen open einde', !(await import('../../shared/tech-rollen')).openEindeToegestaan(['beheerder']) && (await import('../../shared/tech-rollen')).openEindeToegestaan(['eigenaar']));
    let ong = ''; try { await tp.activeren(eig, tab, 500, 'testreden'); } catch (e) { ong = (e as { code?: string }).code || ''; }
    check('tech: 500 minuten blijft DUUR_ONGELDIG', ong === 'DUUR_ONGELDIG');
    await sys.query("UPDATE app.tech_activaties SET begin_op = now() - interval '3 hours', eind_op = now() - interval '1 hour' WHERE user_id = $1 AND beeindigd_op IS NULL", [eig.id]);
    const na = await tp.actieveActivatie(eig.id, tab);
    check('tech: een verlopen activering is niet meer actief', na === null);
    const logs = (await sys.query("SELECT details FROM app.audit WHERE owner_id = $1 AND action = 'owner.tech.beeindigd' AND details->>'reden' = 'verlopen'", [eig.id])).rows;
    check('tech: het verlopen komt één keer in het logboek (reden verlopen)', logs.length === 1 && logs[0].details?.reden === 'verlopen', JSON.stringify(logs));
    await tp.actieveActivatie(eig.id, tab);
    check('tech: opnieuw opvragen schrijft het verlopen niet nog eens', (await sys.query("SELECT 1 FROM app.audit WHERE owner_id = $1 AND action = 'owner.tech.beeindigd' AND details->>'reden' = 'verlopen'", [eig.id])).rows.length === 1);
    const ge = (await sys.query("SELECT details FROM app.audit WHERE owner_id = $1 AND action = 'owner.tech.geactiveerd' ORDER BY seq", [eig.id])).rows;
    check('tech: «geactiveerd» logt de echte duur, de modus en welke activering vervangen is', ge.length >= 5 && ge.some((r: any) => r.details.modus === 'tot-uitloggen' && r.details.minuten === null) && ge.some((r: any) => Array.isArray(r.details.vervangen)), JSON.stringify(ge.map((r: any) => r.details)));
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err));
  } finally {
    Object.assign(process.env, { UITROL_VOORSTEL_DIR: oud.a ?? '', OPDRACHT_STATUS_DIR: oud.b ?? '' });
    rmSync(basis, { recursive: true, force: true });
    await closePool().catch(() => undefined);
  }
  return einde();
}
