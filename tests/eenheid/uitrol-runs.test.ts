// Blijvende uitrolgeschiedenis (migratie 0047, backend/uitrol-runs.ts): stappen en logregels van root in de database, filters, live stand,
// diagnose en het overnemen van de uitkomst door de voorstellen.
import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

const hex = (n: number) => randomBytes(n).toString('hex');
const iso = (ms: number) => new Date(ms).toISOString();

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-runs');
  const basis = mkdtempSync(join(tmpdir(), 'uitrol-runs-'));
  const statusDir = join(basis, 'status'); mkdirSync(join(statusDir, 'runs'), { recursive: true });
  const oud = { a: process.env.UITROL_VOORSTEL_DIR, b: process.env.OPDRACHT_STATUS_DIR };
  Object.assign(process.env, { UITROL_VOORSTEL_DIR: join(basis, 'voorstellen'), OPDRACHT_STATUS_DIR: statusDir });
  const sys = getPool('systeem');
  const schrijfStappen = (regels: object[]) => writeFileSync(join(statusDir, 'stappen.jsonl'), regels.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const schrijfEvents = (regels: object[]) => writeFileSync(join(statusDir, 'gebeurtenissen.jsonl'), regels.map((r) => JSON.stringify(r)).join('\n') + '\n');
  try {
    const r = await import('../../backend/uitrol-runs');
    const m = await import('../../backend/uitrol-goedkeuring');
    await sys.query("DELETE FROM app.uitrol_runs WHERE id LIKE '2027%' OR id LIKE 'ssh-2027%' OR id LIKE 'ev-2027%' OR id = '20261016T100000Z-abcdef12'");
    await sys.query("DELETE FROM app.uitrol_voorstellen WHERE versie LIKE '2027%'");

    const t0 = Date.parse('2027-03-01T10:00:00Z');
    const st = (run: string, versie: string, stap: string, staat: string, pct: number, ms: number, methode = 'passkey') =>
      ({ run, tijd: iso(ms), versie, methode, stap, staat, pct, uk: `uk ${stap} ${staat}`, nl: `nl ${stap} ${staat}` });
    const ev = (n: number, ms: number, code: string, niveau: string, tag: string, herkomst: string, extra: object = {}) => ({
      id: `20270301T${String(n).padStart(12, '0')}Z-${hex(4)}`, tijd: iso(ms), bron: 'uitrol', code, niveau, uk: `uk ${code}`, nl: `nl ${code}`, tag, herkomst, ...extra });

    // ---- 1. geslaagde run (passkey) ----
    const RUN1 = '20270301T100000Z-aaaaaaaa';
    schrijfStappen([
      st(RUN1, '20270301-095900', 'ontvangen', 'ok', 5, t0), st(RUN1, '20270301-095900', 'kopie', 'bezig', 8, t0 + 1000), st(RUN1, '20270301-095900', 'kopie', 'ok', 12, t0 + 2000),
      st(RUN1, '20270301-095900', 'echtheid', 'bezig', 15, t0 + 2100), st(RUN1, '20270301-095900', 'echtheid', 'ok', 25, t0 + 3000),
      st(RUN1, '20270301-095900', 'inhoud', 'bezig', 28, t0 + 3100), st(RUN1, '20270301-095900', 'inhoud', 'ok', 40, t0 + 4000),
      st(RUN1, '20270301-095900', 'installeren', 'bezig', 42, t0 + 4100), st(RUN1, '20270301-095900', 'installeren', 'ok', 98, t0 + 90_000), st(RUN1, '20270301-095900', 'klaar', 'ok', 100, t0 + 90_500),
    ]);
    schrijfEvents([ev(1, t0 + 90_400, 'OK', 'info', '20270301-095900', 'passkey')]);
    const logPad = join(statusDir, 'runs', `${RUN1}.log`);
    writeFileSync(logPad, ['[uitrol] run gestart', '[uitrol] passkey-goedkeuring geldig voor mijn-ruimte-20270301-095900.tar.gz', '[installeer] bron kopiëren naar /srv/x…', '[installeer] bouwen (npm ci, audit, vite, server-bundel)…',
      'npm warn deprecated iets', '[installeer] back-up vóór migratie…', '[installeer] migraties uitvoeren…', '[installeer] actief: /srv/x', '[installeer] klaar: release 20270301-100100'].join('\n') + '\n');
    await r.runsSynchroniseren(true);
    const rij1 = (await sys.query('SELECT * FROM app.uitrol_runs WHERE id = $1', [RUN1])).rows[0];
    check('run: geslaagde run staat in de database als klaar met 100 %', rij1?.staat === 'klaar' && rij1.pct === 100 && rij1.methode === 'passkey' && rij1.versie === '20270301-095900', JSON.stringify(rij1));
    check('run: zes stappen met hun laatste stand bewaard', Array.isArray(rij1?.stappen) && rij1.stappen.length === 6 && rij1.stappen[5].stap === 'klaar');
    check('run: uitkomstcode OK komt uit de gebeurtenis van root', rij1?.code === 'OK');
    const regels1 = await r.runRegels(RUN1, -1);
    check('run: alle 9 logregels opgenomen in volgorde', regels1.length === 9 && regels1[0].nr === 0 && regels1[8].nr === 8);
    check('run: warn-regel krijgt niveau warn, actief/klaar niveau ok', regels1[4].niveau === 'warn' && regels1[7].niveau === 'ok' && regels1[8].niveau === 'ok', JSON.stringify(regels1.map((x) => x.niveau)));
    check('run: onderdeel van de installatie herkend (actief)', rij1?.sub === 'actief');

    // ---- 2. lopende run groeit met het log; geen dubbele regels ----
    const RUN2 = '20270301T110000Z-bbbbbbbb';
    const nu = Date.now();
    schrijfStappen([st(RUN2, '20270301-105900', 'ontvangen', 'ok', 5, nu - 60_000), st(RUN2, '20270301-105900', 'kopie', 'ok', 12, nu - 59_000), st(RUN2, '20270301-105900', 'echtheid', 'ok', 25, nu - 58_000),
      st(RUN2, '20270301-105900', 'inhoud', 'ok', 40, nu - 57_000), st(RUN2, '20270301-105900', 'installeren', 'bezig', 42, nu - 56_000)]);
    schrijfEvents([]);
    const log2 = join(statusDir, 'runs', `${RUN2}.log`);
    writeFileSync(log2, '[uitrol] start\n[installeer] bron kopiëren naar /srv/y…\n');
    await r.runsSynchroniseren(true);
    let rij2 = (await sys.query('SELECT * FROM app.uitrol_runs WHERE id = $1', [RUN2])).rows[0];
    check('live: lopende run is bezig in stap installeren, onderdeel bron', rij2.staat === 'bezig' && rij2.stap === 'installeren' && rij2.sub === 'bron' && rij2.pct >= 42 && rij2.pct < 60, JSON.stringify(rij2));
    appendFileSync(log2, '[installeer] bouwen (npm ci, audit, vite, server-bundel)…\nvite v7 building…\n');
    await new Promise((x) => setTimeout(x, 20));
    await r.runsSynchroniseren(true);
    await r.runsSynchroniseren(true);
    rij2 = (await sys.query('SELECT * FROM app.uitrol_runs WHERE id = $1', [RUN2])).rows[0];
    const n2 = Number((await sys.query('SELECT count(*)::int AS n FROM app.uitrol_run_regels WHERE run_id = $1', [RUN2])).rows[0].n);
    check('live: nieuwe regels erbij, nooit dubbel (4 regels)', n2 === 4 && rij2.log_regels === 4, `${n2}`);
    check('live: onderdeel bouwen en het percentage groeit mee', rij2.sub === 'bouwen' && rij2.pct > 46 && rij2.pct < 97, `${rij2.sub} ${rij2.pct}`);
    const live = await r.liveStand('', 1);
    check('live: zonder run-id kiest de lopende run en geeft alleen regels na de cursor', live.run?.id === RUN2 && live.regels.length === 2 && live.regels[0].nr === 2, JSON.stringify(live.regels.map((x) => x.nr)));

    // ---- 2b. eigen logboek van de run onleesbaar/afwezig → vangnet installeer.log (alleen als het bewijst bij deze run te horen) ----
    const RUN6 = '20270301T115000Z-ffffffff', RUN7 = '20270301T116000Z-abababab';
    const installeerLog = join(statusDir, 'installeer.log');
    schrijfStappen([st(RUN2, '20270301-105900', 'ontvangen', 'ok', 5, nu - 60_000), st(RUN2, '20270301-105900', 'installeren', 'bezig', 42, nu - 56_000),
      st(RUN6, '20270301-115900', 'ontvangen', 'ok', 5, nu - 30_000), st(RUN6, '20270301-115900', 'installeren', 'bezig', 42, nu - 29_000)]);
    writeFileSync(installeerLog, [`[uitrol] run ${RUN7}: pakket van een andere run ontvangen (passkey)`, '[installeer] bron kopiëren naar /srv/z…'].join('\n') + '\n');
    await r.runsSynchroniseren(true);
    const zonderBewijs = Number((await sys.query('SELECT count(*)::int AS n FROM app.uitrol_run_regels WHERE run_id = $1', [RUN6])).rows[0].n);
    check('vangnet: installeer.log van een ANDERE run wordt nooit aan deze run gehangen', zonderBewijs === 0, `${zonderBewijs}`);
    writeFileSync(installeerLog, [`[uitrol] run ${RUN6}: pakket mijn-ruimte-20270301-115900.tar.gz ontvangen (passkey)`, '[installeer] bron kopiëren naar /srv/z…', '[installeer] bouwen (npm ci, audit, vite, server-bundel)…'].join('\n') + '\n');
    await new Promise((x) => setTimeout(x, 20));
    await r.runsSynchroniseren(true);
    const rij6 = (await sys.query('SELECT * FROM app.uitrol_runs WHERE id = $1', [RUN6])).rows[0];
    const regels6 = await r.runRegels(RUN6, -1);
    check('vangnet: zonder leesbaar runs/<run>.log komen de regels uit installeer.log (3 regels, onderdeel bouwen)', regels6.length === 3 && rij6.sub === 'bouwen' && rij6.log_regels === 3, JSON.stringify({ n: regels6.length, sub: rij6.sub }));
    check('vangnet: het percentage groeit ook zonder eigen runs-logboek', rij6.pct > 46 && rij6.pct < 97, `${rij6.pct}`);
    rmSync(installeerLog, { force: true });
    await sys.query('DELETE FROM app.uitrol_runs WHERE id = $1', [RUN6]);

    // ---- 3. geweigerd, mislukt, vastgelopen ----
    const RUN3 = '20270301T120000Z-cccccccc', RUN4 = '20270301T130000Z-dddddddd', RUN5 = '20270301T140000Z-eeeeeeee';
    schrijfStappen([
      st(RUN3, '20270301-115900', 'ontvangen', 'ok', 5, t0 + 7_200_000), st(RUN3, '20270301-115900', 'echtheid', 'bezig', 15, t0 + 7_201_000), st(RUN3, '20270301-115900', 'echtheid', 'fout', 0, t0 + 7_202_000),
      st(RUN4, '20270301-125900', 'ontvangen', 'ok', 5, t0 + 10_800_000), st(RUN4, '20270301-125900', 'installeren', 'bezig', 42, t0 + 10_801_000), st(RUN4, '20270301-125900', 'installeren', 'fout', 0, t0 + 10_900_000),
      st(RUN5, '20270301-135900', 'ontvangen', 'ok', 5, nu - 5 * 3_600_000), st(RUN5, '20270301-135900', 'installeren', 'bezig', 42, nu - 5 * 3_600_000 + 1000),
      st(RUN2, '20270301-105900', 'ontvangen', 'ok', 5, nu - 60_000), st(RUN2, '20270301-105900', 'installeren', 'bezig', 42, nu - 56_000),
    ]);
    schrijfEvents([ev(2, t0 + 7_202_500, 'GOEDKEURING_ONGELDIG', 'waarschuwing', '20270301-115900', 'passkey'), ev(3, t0 + 10_900_500, 'INSTALLATIE_MISLUKT', 'fout', '20270301-125900', 'passkey')]);
    await r.runsSynchroniseren(true);
    const get = async (id: string) => (await sys.query('SELECT * FROM app.uitrol_runs WHERE id = $1', [id])).rows[0];
    const r3 = await get(RUN3), r4 = await get(RUN4), r5 = await get(RUN5);
    check('fout: een weigering vóór de installatie is «geweigerd» met de code van root', r3.staat === 'geweigerd' && r3.code === 'GOEDKEURING_ONGELDIG' && r3.stap === 'echtheid', JSON.stringify(r3));
    check('fout: een fout tijdens de installatie is «mislukt»', r4.staat === 'mislukt' && r4.code === 'INSTALLATIE_MISLUKT' && r4.stap === 'installeren');
    check('fout: een run zonder activiteit en zonder «bezig» van root wordt «afgebroken» (RUN_STIL)', r5.staat === 'afgebroken' && r5.code === 'RUN_STIL');
    check('fout: de lopende run blijft bezig', (await get(RUN2)).staat === 'bezig');

    // ---- 4. SSH en oudere uitkomsten (zonder stappen) ----
    const sshEv = ev(10, t0 + 20_000_000, 'SSH_OK', 'info', '20270301-170000', 'ssh', { wie: 'beheer', pakket: '20270301-160000', release: '20270301-170000', commit: 'abcdef1234567', adres: '10.0.0.7' });
    const oudEv = ev(11, t0 + 21_000_000, 'OK', 'info', '20270301-180000', 'handtekening');
    const dubbelEv = ev(12, t0 + 90_300, 'OK', 'info', '20270301-095900', 'passkey'); // hoort bij RUN1 (heeft stappen)
    schrijfEvents([ev(1, t0 + 90_400, 'OK', 'info', '20270301-095900', 'passkey'), ev(2, t0 + 7_202_500, 'GOEDKEURING_ONGELDIG', 'waarschuwing', '20270301-115900', 'passkey'),
      ev(3, t0 + 10_900_500, 'INSTALLATIE_MISLUKT', 'fout', '20270301-125900', 'passkey'), sshEv, oudEv, dubbelEv]);
    await r.runsSynchroniseren(true); await r.runsSynchroniseren(true);
    const ssh = (await sys.query("SELECT * FROM app.uitrol_runs WHERE methode = 'ssh' AND release = '20270301-170000'")).rows;
    check('ssh: een SSH-installatie wordt één run (ook na herhaald synchroniseren) met wie, adres en commit', ssh.length === 1 && ssh[0].wie === 'beheer' && ssh[0].adres === '10.0.0.7' && ssh[0].bron_commit === 'abcdef1234567' && ssh[0].staat === 'klaar', JSON.stringify(ssh));
    const oudRun = (await sys.query("SELECT * FROM app.uitrol_runs WHERE id LIKE 'ev-2027%' AND versie = '20270301-180000'")).rows;
    check('oud: een uitkomst van vóór de stappen komt als run in de geschiedenis (klaar, handtekening)', oudRun.length === 1 && oudRun[0].staat === 'klaar' && oudRun[0].methode === 'handtekening');
    check('oud: een uitkomst die bij een run met stappen hoort wordt niet nog eens als run opgenomen', Number((await sys.query("SELECT count(*)::int AS n FROM app.uitrol_runs WHERE versie = '20270301-095900'")).rows[0].n) === 1);

    // ---- 5. lijst, filters, detail ----
    const alle = await r.runsLijst({ q: '20270301', perPagina: 50 });
    check('lijst: vindt alle testruns op versienummer (6 met versie 20270301, incl. ssh via release)', alle.totaal >= 6, `${alle.totaal}`);
    const klaarLijst = await r.runsLijst({ q: '20270301', staat: ['klaar'], perPagina: 50 });
    check('lijst: filter op staat «klaar»', klaarLijst.runs.length >= 3 && klaarLijst.runs.every((x) => x.staat === 'klaar'));
    check('lijst: tellers per staat negeren het staatfilter', (klaarLijst.tellers.mislukt ?? 0) >= 1 && (klaarLijst.tellers.geweigerd ?? 0) >= 1 && (klaarLijst.tellers.bezig ?? 0) >= 1, JSON.stringify(klaarLijst.tellers));
    const sshLijst = await r.runsLijst({ q: '20270301', methode: 'ssh', perPagina: 50 });
    check('lijst: filter op methode ssh', sshLijst.runs.length >= 1 && sshLijst.runs.every((x) => x.methode === 'ssh'));
    const zoek = await r.runsLijst({ q: 'beheer', perPagina: 50 });
    check('lijst: vrije zoekopdracht vindt «beheer» (wie)', zoek.runs.some((x) => x.wie === 'beheer'));
    const datum = await r.runsLijst({ van: '2027-03-01', tot: '2027-03-01', q: '20270301', perPagina: 50 });
    check('lijst: datumfilter (van/tot) houdt alleen die dag over', datum.totaal >= 4 && datum.runs.every((x) => x.gestart.startsWith('2027-03-01')));
    const p1 = await r.runsLijst({ q: '20270301', perPagina: 5, pagina: 1 }), p2 = await r.runsLijst({ q: '20270301', perPagina: 5, pagina: 2 });
    check('lijst: paginering geeft verschillende runs, nieuwste eerst', p1.runs.length === 5 && p2.runs.length >= 1 && p1.runs[0].gestart >= p1.runs[4].gestart && !p2.runs.some((x) => p1.runs.some((y) => y.id === x.id)));
    const injectie = await r.runsLijst({ q: "x'; DROP TABLE app.uitrol_runs; --", perPagina: 5 });
    check('lijst: zoektekst met SQL-tekens is veilig (geen treffers, tabel bestaat nog)', injectie.totaal === 0 && Number((await sys.query('SELECT count(*)::int AS n FROM app.uitrol_runs')).rows[0].n) > 0);
    const det = await r.runDetail(RUN1);
    check('detail: run met stappen en bijbehorende gebeurtenissen van root', det?.run.id === RUN1 && det.run.stappen.length === 6 && det.gebeurtenissen.some((g) => g.code === 'OK'));
    check('detail: onbekende of ongeldige id geeft null', (await r.runDetail('bestaat-niet')) === null && (await r.runDetail("a'; --")) === null);

    // ---- 6. voorstel koppelen en de uitkomst overnemen ----
    const USER = `ur-${randomUUID()}`;
    await sys.query("INSERT INTO app.records (tbl,id,data) VALUES ('users',$1,$2)", [USER, { email: `${USER}@example.test`, role: 'member', status: 'approved' }]);
    const gr = (await sys.query("INSERT INTO app.uitrol_voorbereiders (soort, onderwerp, account_id, label, gegeven_door, verloopt_op) VALUES ('account',$1,$1,'Claude','test', now() + interval '1 day') RETURNING id", [USER])).rows[0].id;
    const maakVoorstel = async (versie: string, beslist: number) => (await sys.query(`INSERT INTO app.uitrol_voorstellen (versie, status, bytes, sha256, voorbereider_id, voorbereider_label, account_id, bron_commit, wijzigingen, beslist_op, beslist_door)
      VALUES ($1, 'goedgekeurd', 100, $2, $3, 'Claude', $4, 'abc1234', 'Wat er veranderde', $5, 'eigenaar@test.invalid') RETURNING id`, [versie, 'b'.repeat(64), gr, USER, iso(beslist)])).rows[0].id;
    const v1 = await maakVoorstel('20270301-095900', t0 - 20_000);
    const v3 = await maakVoorstel('20270301-115900', t0 + 7_200_000 - 20_000);
    const v4 = await maakVoorstel('20270301-125900', t0 + 10_800_000 - 20_000);
    await r.runsSynchroniseren(true);
    const gekoppeld = await get(RUN1);
    check('koppelen: pakketgegevens van het voorstel staan bij de run (sha256, voorbereider, wijzigingen, goedgekeurd door)', gekoppeld.sha256 === 'b'.repeat(64) && gekoppeld.voorbereider === 'Claude' && gekoppeld.wijzigingen === 'Wat er veranderde' && gekoppeld.goedgekeurd_door === 'eigenaar@test.invalid' && gekoppeld.voorstel_id === v1);
    await m.synchroniseer();
    const vs = async (id: string) => (await sys.query('SELECT status, uitkomst_code FROM app.uitrol_voorstellen WHERE id = $1', [id])).rows[0];
    const a = await vs(v1), b = await vs(v3), c = await vs(v4);
    check('voorstel: goedgekeurd + run klaar → geïnstalleerd (OK)', a.status === 'geinstalleerd' && a.uitkomst_code === 'OK', JSON.stringify(a));
    check('voorstel: goedgekeurd + run geweigerd → geweigerd met de code van root', b.status === 'geweigerd' && b.uitkomst_code === 'GOEDKEURING_ONGELDIG', JSON.stringify(b));
    check('voorstel: goedgekeurd + run mislukt → mislukt', c.status === 'mislukt' && c.uitkomst_code === 'INSTALLATIE_MISLUKT', JSON.stringify(c));
    const v2 = await maakVoorstel('20270301-105900', nu - 59_500);
    await m.synchroniseer();
    check('voorstel: een lopende run (bezig) laat het voorstel op «goedgekeurd» staan, ook na lange tijd', (await vs(v2)).status === 'goedgekeurd');

    // ---- 7. diagnose ----
    check('diagnose: zonder diagnose.json is root null en de wachtende goedkeuring staat in de app-kant', await (async () => { const d = await r.diagnose(); return d.root === null && d.app.wachtOpRoot.some((x) => x.id === v2); })());
    writeFileSync(join(statusDir, 'diagnose.json'), JSON.stringify({ tijd: iso(Date.now() - 30_000), gezond: false, problemen: [{ code: 'PATH_NIET_ACTIEF', uk: 'uk', nl: 'nl' }], eenheden: {} }));
    const d2 = await r.diagnose();
    check('diagnose: diagnose.json van root wordt gelezen met leeftijd in seconden en problemen', !!d2.root && d2.root.gezond === false && d2.root.problemen[0].code === 'PATH_NIET_ACTIEF' && d2.root.leeftijdSec >= 29 && d2.root.leeftijdSec < 120);
    check('diagnose: ontbrekende statusmap is geen crash', await (async () => { process.env.OPDRACHT_STATUS_DIR = join(basis, 'bestaat-niet'); try { const d = await r.diagnose(); return d.app.statusMapLeesbaar === false; } finally { process.env.OPDRACHT_STATUS_DIR = statusDir; } })());

    // ---- 8. kapotte invoer ----
    writeFileSync(join(statusDir, 'stappen.jsonl'), 'geen json\n{"run":"../../etc","stap":"x"}\n' + JSON.stringify(st(RUN1, '20270301-095900', 'klaar', 'ok', 100, t0 + 90_500)) + '\n{"run":"20270301T100000Z-aaaaaaaa","stap":"hack","staat":"ok","methode":"passkey","tijd":"x"}\n');
    await r.runsSynchroniseren(true);
    check('robuust: kapotte of onbekende regels worden overgeslagen zonder fout', (await get(RUN1)).staat === 'klaar');

    // ---- 9. regeltijden: een run die pas laat in beeld komt krijgt verdeelde tijden, geen identieke ----
    const tp = Date.parse('2026-10-16T10:00:00Z');
    const RUN9 = '20261016T100000Z-abcdef12';
    writeFileSync(join(statusDir, 'stappen.jsonl'), [st(RUN9, '20261016-100000', 'ontvangen', 'ok', 5, tp), st(RUN9, '20261016-100000', 'klaar', 'ok', 100, tp + 60_000)].map((x) => JSON.stringify(x)).join('\n') + '\n');
    const log9 = join(statusDir, 'runs', `${RUN9}.log`);
    writeFileSync(log9, Array.from({ length: 10 }, (_, i) => `[installeer] regel ${i}`).join('\n') + '\n');
    utimesSync(log9, new Date(tp + 60_000), new Date(tp + 60_000));
    await r.runsSynchroniseren(true);
    const r9 = await r.runRegels(RUN9, -1);
    const tijden9 = r9.map((x) => Date.parse(x.tijd));
    check('regeltijden: 10 regels, oplopend en verdeeld over de looptijd (niet allemaal gelijk)', r9.length === 10 && tijden9.every((t, i) => i === 0 || t > tijden9[i - 1]) && tijden9[9] - tijden9[0] > 30_000, JSON.stringify(tijden9.map((t) => (t - tp) / 1000)));
    check('regeltijden: laatste regel ≈ laatste schrijfmoment van root (binnen de run)', Math.abs(tijden9[9] - (tp + 60_000)) < 2000 && tijden9[0] > tp);

    // ---- 10. audit 18.10.2026 (punten 2 en 6): echte oorzaak bij de run, onderbreking = «afgebroken», voortgangsregels van de installer ----
    const tq = Date.parse('2027-03-02T10:00:00Z');
    const RUNA = '20270302T100000Z-0000000a', RUNB = '20270302T110000Z-0000000b';
    schrijfStappen([
      st(RUNA, '20270302-095900', 'ontvangen', 'ok', 5, tq), st(RUNA, '20270302-095900', 'installeren', 'bezig', 70, tq + 1000), st(RUNA, '20270302-095900', 'installeren', 'fout', 0, tq + 60_000),
      st(RUNB, '20270302-105900', 'ontvangen', 'ok', 5, tq + 3_600_000), st(RUNB, '20270302-105900', 'installeren', 'bezig', 55, tq + 3_601_000), st(RUNB, '20270302-105900', 'installeren', 'fout', 0, tq + 3_660_000),
    ]);
    const ctxA = ['> tsc --noEmit -p . && vite build', "src/UitrolMeester.tsx(9,99): error TS6133: 'PackageOpen' is declared but its value is never read.", "src/Andere.tsx(3,1): error TS2304: Cannot find name 'x'."];
    schrijfEvents([
      ev(10, tq + 60_100, 'INSTALLATIE_MISLUKT', 'fout', '20270302-095900', 'passkey', { reden: "src/UitrolMeester.tsx(9,99): error TS6133: 'PackageOpen' is declared but its value is never read.", context: ctxA }),
      ev(11, tq + 3_660_100, 'ONDERBROKEN', 'fout', '20270302-105900', 'passkey'),
    ]);
    await r.runsSynchroniseren(true);
    const ra = await r.runDetail(RUNA) as { run: Record<string, any> } | null;
    const runA = (ra as any)?.run ?? ra;
    check('oorzaak: reden (echte foutregel) bij de run bewaard en via de API leesbaar', /error TS6133/.test(runA?.reden || ''), JSON.stringify(runA));
    check('oorzaak: context (regels eromheen) bij de run bewaard', Array.isArray(runA?.context) && runA.context.length === 3 && /TS2304/.test(runA.context[2]), JSON.stringify(runA?.context));
    check('oorzaak: staat mislukt, code INSTALLATIE_MISLUKT', runA?.staat === 'mislukt' && runA?.code === 'INSTALLATIE_MISLUKT');
    const rb = (await sys.query('SELECT staat, code, reden FROM app.uitrol_runs WHERE id = $1', [RUNB])).rows[0];
    check('onderbroken (SIGTERM/timeout): staat «afgebroken» met code ONDERBROKEN (niet «geweigerd»)', rb?.staat === 'afgebroken' && rb?.code === 'ONDERBROKEN', JSON.stringify(rb));
    check('voortgangsregels van de installer → onderdeel: kopie→bron, npm/bouwen→bouwen, backup, migraties, activeren/gezondheid/nabewaken→actief',
      r.subVanRegel('[installeer] stap: kopie (45%) x') === 'bron' && r.subVanRegel('[installeer] stap: npm (55%) npm ci') === 'bouwen' && r.subVanRegel('[installeer] stap: bouwen (70%) x') === 'bouwen'
      && r.subVanRegel('[installeer] stap: backup (75%) x') === 'backup' && r.subVanRegel('[installeer] stap: migraties (80%) x') === 'migraties' && r.subVanRegel('[installeer] stap: activeren (90%) x') === 'actief'
      && r.subVanRegel('[installeer] stap: gezondheid (95%) x') === 'actief' && r.subVanRegel('[installeer] stap: nabewaken (98%) x') === 'actief' && r.subVanRegel('[installeer] Volgende stap: x') === '');
  } catch (err) {
    check('onverwachte fout', false, String((err as Error)?.stack || err));
  } finally {
    await sys.query("DELETE FROM app.uitrol_runs WHERE id LIKE '2027%' OR id LIKE 'ssh-2027%' OR id LIKE 'ev-2027%' OR id = '20261016T100000Z-abcdef12'").catch(() => undefined);
    Object.assign(process.env, { UITROL_VOORSTEL_DIR: oud.a ?? '', OPDRACHT_STATUS_DIR: oud.b ?? '' });
    rmSync(basis, { recursive: true, force: true });
    await closePool().catch(() => undefined);
  }
  return einde();
}
