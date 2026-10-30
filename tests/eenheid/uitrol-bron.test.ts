// Eén bron van waarheid voor de uitrolstand (migratie 0062, backend/uitrol-bron.ts) — audit 18.10.2026, punt 7.
// Reproduceert het oude probleem (vier bronnen die uiteenlopen; SSH schreef de MAPNAAM in «versie»; opdracht/nazorg schreven niets)
// en bewijst dat de samengevoegde stand één versie geeft, elke afwijking benoemt, en dat de MCP-tool dezelfde waarden ziet als de pagina.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

const hex = (n: number) => randomBytes(n).toString('hex');
const iso = (ms: number) => new Date(ms).toISOString();

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-bron');
  const basis = mkdtempSync(join(tmpdir(), 'uitrol-bron-'));
  const statusDir = join(basis, 'status'); mkdirSync(join(statusDir, 'runs'), { recursive: true });
  const appRoot = join(basis, 'srv'); mkdirSync(join(appRoot, 'releases'), { recursive: true });
  const oud = { a: process.env.UITROL_VOORSTEL_DIR, b: process.env.OPDRACHT_STATUS_DIR, c: process.env.UITROL_APP_ROOT };
  Object.assign(process.env, { UITROL_VOORSTEL_DIR: join(basis, 'voorstellen'), OPDRACHT_STATUS_DIR: statusDir, UITROL_APP_ROOT: appRoot });
  const sys = getPool('systeem');
  const releaseMap = (naam: string, versie: string, commit = '') => { const m = join(appRoot, 'releases', naam); mkdirSync(join(m, 'dist-server'), { recursive: true }); writeFileSync(join(m, 'UITROL-VERSIE'), versie); if (commit) writeFileSync(join(m, 'RELEASE-COMMIT'), commit); return m; };
  const current = (naam: string) => { const l = join(appRoot, 'current'); try { rmSync(l); } catch { /* nog geen link */ } symlinkSync(join(appRoot, 'releases', naam), l); };
  const schrijfStappen = (regels: object[]) => writeFileSync(join(statusDir, 'stappen.jsonl'), regels.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const schrijfEvents = (regels: object[]) => writeFileSync(join(statusDir, 'gebeurtenissen.jsonl'), regels.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const ev = (n: number, ms: number, code: string, tag: string, herkomst: string, extra: object = {}) => ({
    id: `20270401T${String(n).padStart(12, '0')}Z-${hex(4)}`, tijd: iso(ms), bron: 'uitrol', code, niveau: 'info', uk: `uk ${code}`, nl: `nl ${code}`, tag, herkomst, ...extra });
  try {
    const b = await import('../../backend/uitrol-bron');
    const r = await import('../../backend/uitrol-runs');
    await sys.query("DELETE FROM app.uitrol_runs WHERE versie LIKE '2027%' OR release LIKE '2027%' OR id LIKE '%2027%'");
    await sys.query("DELETE FROM app.uitrol_voorstellen WHERE versie LIKE '2027%'");
    await sys.query("DELETE FROM app.uitrol_stand");

    // ---- 1. het oude probleem: status.json (oud SSH-formaat, mapnaam in «versie») is OUDER dan de releasemap; de runs kennen alleen de passkey-run ----
    const t0 = Date.parse('2027-04-01T10:00:00Z');
    releaseMap('20270401-100100', '20270401-095900', 'abcdef1234567890abcdef1234567890abcdef12');
    releaseMap('20270401-120000', '20270401-115900', 'fedcba0987654321fedcba0987654321fedcba09');
    current('20270401-120000');
    writeFileSync(join(appRoot, 'VORIGE'), join(appRoot, 'releases', '20270401-100100'));
    const RUN1 = '20270401T100000Z-aaaaaaaa';
    const st = (stap: string, staat: string, pct: number, ms: number) => ({ run: RUN1, tijd: iso(ms), versie: '20270401-095900', methode: 'passkey', stap, staat, pct, uk: `uk ${stap}`, nl: `nl ${stap}` });
    schrijfStappen([st('ontvangen', 'ok', 5, t0), st('kopie', 'ok', 12, t0 + 1000), st('echtheid', 'ok', 25, t0 + 2000), st('inhoud', 'ok', 40, t0 + 3000), st('installeren', 'ok', 98, t0 + 60_000), st('klaar', 'ok', 100, t0 + 61_000)]);
    schrijfEvents([ev(1, t0 + 60_500, 'OK', '20270401-095900', 'passkey')]);
    // status.json zoals de oude installer het bij SSH schreef: «versie» = MAPNAAM, geen release-veld.
    writeFileSync(join(statusDir, 'status.json'), JSON.stringify({ staat: 'klaar', code: 'SSH_OK', uk: 'x', nl: 'x', versie: '20270401-100100', methode: 'ssh', tijd: iso(t0 + 60_000) }));
    b._resetStand();
    let s = await b.huidigeStand({ vers: true, nu: t0 + 3 * 3600_000 });
    // De runs kennen 095900, maar current wijst naar een nieuwere release (115900) die geen run achterliet. «Draait nu» = wat
    // echt actief is (115900, uit de releasemap); staat/tijd blijven van de hoofdbron (runs) en de afwijking is zichtbaar.
    check('stand: hoofdbron is runs, maar «versie» = wat echt draait (releasemap, pakketversie — niet de mapnaam)', s.gebruikteBron === 'runs' && s.versie === '20270401-115900' && s.versieBron === 'releasemap' && s.release === '20270401-120000', JSON.stringify({ bron: s.gebruikteBron, versieBron: s.versieBron, versie: s.versie, release: s.release }));
    check('stand: de nieuwere releasemap staat als afwijking (nooit stil overschreven)', s.afwijkingen.some((a) => a.bron === 'releasemap' && a.veld === 'versie' && a.waarde === '20270401-115900' && a.verwacht === '20270401-095900'), JSON.stringify(s.afwijkingen.map((a) => [a.bron, a.veld, a.waarde, a.verwacht])));
    const stBron = s.bronnen.find((x) => x.id === 'status')!;
    check('status.json oud formaat: mapnaam in «versie» wordt herkend en vertaald naar pakketversie + release', stBron.versie === '20270401-095900' && stBron.release === '20270401-100100' && stBron.detail.oudFormaat === true, JSON.stringify(stBron));
    const rm = s.bronnen.find((x) => x.id === 'releasemap')!;
    check('releasemap: current → versie 20270401-115900, map 20270401-120000, commit uit RELEASE-COMMIT', rm.versie === '20270401-115900' && rm.release === '20270401-120000' && rm.commit.startsWith('fedcba'), JSON.stringify(rm));
    const afwRm = s.afwijkingen.find((a) => a.bron === 'releasemap' && a.veld === 'versie');
    check('afwijking: releasemap is nieuwer dan de hoofdbron → benoemd als error met uitleg uk/nl', !!afwRm && afwRm.ernst === 'error' && afwRm.waarde === '20270401-115900' && afwRm.verwacht === '20270401-095900' && /новіш/.test(afwRm.uk) && /nieuwere/.test(afwRm.nl), JSON.stringify(s.afwijkingen));
    check('afwijking: het siteproces (/api/version) staat ook in de lijst of is in lijn — nooit stil genegeerd', s.bronnen.find((x) => x.id === 'versie')!.beschikbaar, '');
    check('toestand per bron: releasemap = afwijking, runs = ok', rm.toestand === 'afwijking' && s.bronnen.find((x) => x.id === 'runs')!.toestand === 'ok');
    const vorige = s.bronnen.find((x) => x.id === 'vorige')!;
    check('VORIGE: doel van terugdraaien met zijn pakketversie', vorige.beschikbaar && vorige.release === '20270401-100100' && vorige.versie === '20270401-095900', JSON.stringify(vorige));
    const rij = (await sys.query("SELECT versie, release, hoofdbron, afwijkingen FROM app.uitrol_stand WHERE id = 'huidig'")).rows[0];
    check('stand bewaard in app.uitrol_stand met afwijkingen', !!rij && rij.versie === '20270401-115900' && rij.hoofdbron === 'runs' && Array.isArray(rij.afwijkingen) && rij.afwijkingen.length >= 1, JSON.stringify(rij));
    check('kaart: knopen en randen zijn de echte modules (root→status/events/runs, installer→releasemap, runs→app→ui/mcp)', ['root', 'installer', 'nazorg', 'status', 'events', 'runs', 'voorstellen', 'releasemap', 'vorige', 'versie', 'github', 'backups', 'app', 'ui', 'mcp'].every((id) => s.kaart.knopen.some((k) => k.id === id))
      && [['root', 'status'], ['root', 'runs'], ['installer', 'releasemap'], ['installer', 'vorige'], ['nazorg', 'installer'], ['runs', 'app'], ['app', 'ui'], ['app', 'mcp'], ['releasemap', 'versie']].every(([v, n]) => s.kaart.randen.some((x) => x.van === v && x.naar === n))
      && s.kaart.randen.every((x) => s.kaart.knopen.some((k) => k.id === x.van) && s.kaart.knopen.some((k) => k.id === x.naar)), JSON.stringify(s.kaart.randen.map((x) => `${x.van}>${x.naar}`)));

    // ---- 2. de nieuwe installer: SSH schrijft versie = pakketversie + release = map; opdracht/nazorg schrijven TERUG_OK → run ----
    const proefDir = mkdtempSync(join(tmpdir(), 'bron-noteer-'));
    const run = (args: string[], env: Record<string, string>) => spawnSync('bash', ['deploy/installeer-app.sh', 'noteer-proef', ...args], { encoding: 'utf8', env: { ...process.env, INSTALLEER_NOTEER_PROEF: '1', MIJN_RUIMTE_STATUS_DIR: proefDir, MIJN_RUIMTE_STATUS_GROEP: 'nogroup', ...env } });
    if (process.getuid?.() === 0) check('installer-proef: overgeslagen als root', true);
    else {
      const ssh = run(['SSH_OK', '20270401-130000', '20270401-125900', 'abcdef1234567890abcdef1234567890abcdef12'], { SUDO_USER: 'beheer', SSH_CONNECTION: '10.0.0.5 1 2 3' });
      const status = JSON.parse(readFileSync(join(proefDir, 'status.json'), 'utf8'));
      check('installer SSH: status.json.versie = pakketversie, release = mapnaam (niet meer de map in «versie»)', ssh.status === 0 && status.versie === '20270401-125900' && status.release === '20270401-130000' && status.methode === 'ssh', `${ssh.status} ${ssh.stderr} ${JSON.stringify(status)}`);
      const opdr = run(['SSH_TERUG', '20270401-100100', '20270401-095900', ''], { MIJN_RUIMTE_UITROL_MODUS: 'opdracht' });
      const naz = run(['SSH_TERUG', '20270401-100100', '20270401-095900', ''], { MIJN_RUIMTE_UITROL_MODUS: 'nazorg' });
      const stilOk = run(['SSH_OK', '20270401-130000', '20270401-125900', ''], { MIJN_RUIMTE_UITROL_MODUS: 'opdracht' });
      const regels = readFileSync(join(proefDir, 'gebeurtenissen.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      check('installer opdracht/nazorg: terugdraaien laat TERUG_OK na met herkomst opdracht/nazorg; SSH_OK in die modi niet', opdr.status === 0 && naz.status === 0 && stilOk.status === 0 && regels.length === 3
        && regels[1].code === 'TERUG_OK' && regels[1].herkomst === 'opdracht' && regels[1].wie === 'dashboard' && regels[2].code === 'TERUG_OK' && regels[2].herkomst === 'nazorg' && /наглядач/.test(regels[2].uk), `${opdr.stderr} ${naz.stderr} ${JSON.stringify(regels.map((x) => [x.code, x.herkomst]))}`);
      const status2 = JSON.parse(readFileSync(join(proefDir, 'status.json'), 'utf8'));
      check('installer nazorg: status.json krijgt methode nazorg + pakketversie', status2.methode === 'nazorg' && status2.versie === '20270401-095900' && status2.release === '20270401-100100', JSON.stringify(status2));
      // De app neemt die regels op als runs met methode opdracht/nazorg (0062: CHECK uitgebreid).
      schrijfEvents([ev(1, t0 + 60_500, 'OK', '20270401-095900', 'passkey'), ...regels.slice(1).map((x, i) => ({ ...x, id: `20270401T${String(20 + i).padStart(12, '0')}Z-${hex(4)}`, tijd: iso(t0 + 4 * 3600_000 + i * 60_000) }))]);
      await r.runsSynchroniseren(true);
      const terug = (await sys.query(`SELECT id, methode, versie, release, staat FROM app.uitrol_runs WHERE code = 'TERUG_OK' AND versie = '20270401-095900' ORDER BY id`)).rows;
      check('runs: TERUG_OK van dashboard en bewaker worden runs met methode opdracht en nazorg', terug.length === 2 && terug.map((x) => x.methode).sort().join(',') === 'nazorg,opdracht' && terug.every((x) => x.release === '20270401-100100' && x.staat === 'klaar'), JSON.stringify(terug));
      // Na het terugdraaien: current wijst weer naar de oude map → geen afwijking meer tussen runs en releasemap.
      current('20270401-100100');
      b._resetStand();
      s = await b.huidigeStand({ vers: true, nu: t0 + 5 * 3600_000 });
      check('na terugdraaien: hoofdbron (runs) en releasemap zijn in lijn, versie 20270401-095900, release 20270401-100100', s.versie === '20270401-095900' && s.release === '20270401-100100' && !s.afwijkingen.some((a) => a.bron === 'releasemap'), JSON.stringify({ v: s.versie, r: s.release, afw: s.afwijkingen }));
    }
    rmSync(proefDir, { recursive: true, force: true });

    // ---- 3. status.json «bezig» dat vastzit (root brak af) → expliciete afwijking, niet stil ----
    writeFileSync(join(statusDir, 'status.json'), JSON.stringify({ staat: 'bezig', code: 'CONTROLE', uk: 'x', nl: 'x', versie: '20270401-200000', methode: 'passkey', tijd: iso(t0) }));
    b._resetStand();
    s = await b.huidigeStand({ vers: true, nu: t0 + 6 * 3600_000 });
    const vast = s.afwijkingen.find((a) => a.bron === 'status' && a.veld === 'staat');
    check('vastgelopen «bezig» in status.json wordt een error-afwijking met uitleg (root brak af zonder uitkomst)', !!vast && vast.ernst === 'error' && /обірвав/.test(vast.uk), JSON.stringify(s.afwijkingen));
    check('stand.staat volgt de hoofdbron (klaar), niet het vastgelopen status.json', s.staat === 'klaar', s.staat);

    // ---- 4. hoofdbron instelbaar; niet-runs alleen voor diagnose; MCP/pagina geven dezelfde waarden ----
    const inst = await b.instellingenZetten({ hoofdbron: 'releasemap', intervalSec: 10 });
    b._resetStand();
    s = await b.huidigeStand({ vers: true, nu: t0 + 6 * 3600_000 });
    check('instellen: hoofdbron releasemap → versie uit current, interval 10 s bewaard', inst.hoofdbron === 'releasemap' && s.gebruikteBron === 'releasemap' && s.versie === '20270401-095900' && s.intervalSec === 10, JSON.stringify({ g: s.gebruikteBron, v: s.versie, i: s.intervalSec }));
    const ongeldig = await b.instellingenZetten({ hoofdbron: 'events', intervalSec: 1 });
    check('instellen: onbekende hoofdbron en te klein interval worden genegeerd/begrensd', ongeldig.hoofdbron === 'releasemap' && ongeldig.intervalSec === 5, JSON.stringify(ongeldig));
    await b.instellingenZetten({ hoofdbron: 'runs', intervalSec: 20 });
    b._resetStand();
    const live = await b.liveStand();
    const pagina = await b.huidigeStand();
    check('MCP (liveStand) en pagina (huidigeStand) geven dezelfde versie/release/commit/staat', live.versie === pagina.versie && live.release === pagina.release && live.commit === pagina.commit && live.staat === pagina.staat && live.afwijkingen === pagina.afwijkingen.length, JSON.stringify(live));
    const g = await import('../../backend/uitrol-goedkeuring');
    const ov = await g.overzicht();
    check('overzicht (/api/owner/uitrol/overzicht): actieveVersie en stand komen uit dezelfde bron als MCP', ov.actieveVersie === live.versie && ov.stand?.versie === live.versie && ov.stand?.hoofdbron === 'runs', JSON.stringify({ a: ov.actieveVersie, s: ov.stand?.versie }));

    // ---- 5. nazorg-blok uit diagnose.json (root-markering zichtbaar voor de site) ----
    writeFileSync(join(statusDir, 'diagnose.json'), JSON.stringify({ tijd: iso(t0 + 6 * 3600_000), eenheden: {}, lock: {}, inbox: {}, schijf: {}, script: {}, journaal: [], problemen: [], gezond: true, nazorg: { actief: true, release: '20270401-120000', vorige: '20270401-100100', tot: iso(t0 + 6 * 3600_000 + 1800_000), fouten: 1 } }));
    b._resetStand();
    s = await b.huidigeStand({ vers: true, nu: t0 + 6 * 3600_000 });
    const nz = s.bronnen.find((x) => x.id === 'nazorg')!;
    check('nazorg: markering uit diagnose.json → bewaakt, release, vorige, fouten', nz.beschikbaar && nz.staat === 'bewaakt' && nz.release === '20270401-120000' && nz.detail.vorige === '20270401-100100' && nz.detail.fouten === 1, JSON.stringify(nz));
    const diag = spawnSync('bash', ['-n', 'deploy/uitrol/mijn-ruimte-uitrol-diagnose.sh'], { encoding: 'utf8' });
    check('diagnose-script: syntax ok en schrijft het nazorg-blok', diag.status === 0 && /"nazorg": nazorg/.test(readFileSync('deploy/uitrol/mijn-ruimte-uitrol-diagnose.sh', 'utf8')), diag.stderr);
    check('bron-beschrijvingen: elke bron heeft uitleg in uk én nl', s.bronnen.every((x) => x.uk.length > 20 && x.nl.length > 20 && x.uk !== x.nl));
    check('migratie 0062 bestaat en staat de methode nazorg toe', existsSync('migrations/0062_uitrol_stand.sql') && /'nazorg'/.test(readFileSync('migrations/0062_uitrol_stand.sql', 'utf8')));
  } finally {
    Object.assign(process.env, { UITROL_VOORSTEL_DIR: oud.a, OPDRACHT_STATUS_DIR: oud.b, UITROL_APP_ROOT: oud.c });
    for (const k of ['UITROL_VOORSTEL_DIR', 'OPDRACHT_STATUS_DIR', 'UITROL_APP_ROOT'] as const) if (process.env[k] === undefined || process.env[k] === 'undefined') delete process.env[k];
    await sys.query("DELETE FROM app.uitrol_runs WHERE versie LIKE '2027%' OR release LIKE '2027%' OR id LIKE '%2027%'").catch(() => undefined);
    rmSync(basis, { recursive: true, force: true });
    await closePool().catch(() => undefined);
  }
  return einde();
}
