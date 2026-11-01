// MCP-deur op poort 8091 (deploy/mcp/server.mjs + mijn-ruimte-mcp.service) in uitrolpakket en installer (31.10.2026):
//  1) deploy/mcp/server.mjs en deploy/mcp/mijn-ruimte-mcp.service zitten in het standaard uitrolpakket (git archive / maak-uitrolpakket);
//  2) bij installeren (veilige_uitrol_inrichten -> mcp_deur_bijwerken) gaat server.mjs naar /srv/mijn-ruimte/mcp/server.mjs (0644),
//     wordt mijn-ruimte-mcp.service (MCP_PORT=8091) bijgewerkt met daemon-reload en krijgt de dienst try-restart (met melding of waarschuwing);
//  3) bij terugdraaien wordt /srv/mijn-ruimte/mcp/server.mjs eveneens teruggezet naar de gekozen release en mijn-ruimte-mcp.service herstart,
//     zodat poort 8091 nooit op een teruggedraaide release blijft hangen.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { parseRootGebeurtenissen } from '../../backend/server-beheer';
import { UITROL_CODES } from '../../shared/uitrol-codes';

const W = process.cwd();

function pythonCmd(): string {
  for (const cmd of ['python3', 'python']) {
    const r = spawnSync(cmd, ['-c', 'import sys; sys.exit(0)'], { encoding: 'utf8' });
    if (r.status === 0) return cmd;
  }
  return 'python3';
}

function zoekBash(): string {
  if (process.platform === 'win32') {
    for (const p of ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe']) {
      if (existsSync(p)) return p;
    }
  }
  return 'bash';
}

function naarBashPad(bashBin: string, p: string): string {
  if (process.platform !== 'win32') return p;
  const r = spawnSync(bashBin, ['-c', 'cygpath -u "$1"', '_', p], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : p.replace(/\\/g, '/');
}

export async function main(): Promise<number> {
  const { check, einde } = checker('mcp-deur-uitrol-20261031');
  const bashBin = zoekBash();
  const instPad = join(W, 'deploy/installeer-app.sh');
  const inst = readFileSync(instPad, 'utf8');
  const deurBron = readFileSync(join(W, 'deploy/mcp/server.mjs'), 'utf8');
  const unitBron = readFileSync(join(W, 'deploy/mcp/mijn-ruimte-mcp.service'), 'utf8');

  const fn = (naam: string) => {
    const m = new RegExp(`^${naam}\\(\\) \\{[\\s\\S]*?^\\}`, 'm').exec(inst);
    if (!m) throw new Error(`functie ${naam} niet gevonden in deploy/installeer-app.sh`);
    return m[0];
  };
  const oneliner = (naam: string) => {
    const m = new RegExp(`^${naam}\\(\\) \\{.*\\}$`, 'm').exec(inst);
    if (!m) throw new Error(`oneliner ${naam} niet gevonden in deploy/installeer-app.sh`);
    return m[0];
  };

  // 1. Statische en syntactische controles
  const syntax = spawnSync(bashBin, ['-n', naarBashPad(bashBin, instPad)], { encoding: 'utf8' });
  check('deploy/installeer-app.sh: bash -n slaagt en geen CRLF-regels', syntax.status === 0 && !inst.includes('\r\n'), syntax.stderr);
  check('mijn-ruimte-mcp.service: MCP_PORT=8091 en ExecStart=/usr/bin/node /srv/mijn-ruimte/mcp/server.mjs',
    /^Environment=MCP_PORT=8091$/m.test(unitBron) && /^ExecStart=\/usr\/bin\/node \/srv\/mijn-ruimte\/mcp\/server\.mjs$/m.test(unitBron));
  check('installeer-app.sh: zowel veilige_uitrol_inrichten als terugdraaien roepen mcp_deur_bijwerken "$doel" aan',
    /veilige_uitrol_inrichten\(\) \{[\s\S]*?mcp_deur_bijwerken "\$doel"[\s\S]*?^\}/m.test(inst)
      && /terugdraaien\(\) \{[\s\S]*?mcp_deur_bijwerken "\$doel"[\s\S]*?^\}/m.test(inst));
  check('mcp_deur_bijwerken: negeert MCP_UNIT_DOEL wanneer als root (id -u == 0) gedraaid',
    /\[ "\$\(id -u\)" -eq 0 \] && unit_doel="\/etc\/systemd\/system\/mijn-ruimte-mcp\.service"/.test(inst));

  const T = mkdtempSync(join(tmpdir(), 'mr-mcp-deur-'));
  try {
    // 2. Standaard uitrolpakket (git archive zoals maak-uitrolpakket.{sh,ps1} en maak-voorstelpakket.sh) bevat deploy/mcp/server.mjs
    const versie = '20261031-204500';
    const archief = join(T, `mijn-ruimte-${versie}.tar.gz`);
    const ga = spawnSync('git', ['archive', '--format=tar.gz', `--prefix=mijn-ruimte-${versie}/`, '-o', archief, 'HEAD'], { cwd: W, encoding: 'utf8' });
    check('git archive (standaard uitrolpakket) slaagt', ga.status === 0 && existsSync(archief), ga.stderr);
    const archiefBash = naarBashPad(bashBin, archief);
    const lijst = spawnSync(bashBin, ['-c', 'tar -tzf "$1"', '_', archiefBash], { encoding: 'utf8' }).stdout.split(/\r?\n/);
    check('uitrolpakket bevat deploy/mcp/server.mjs en deploy/mcp/mijn-ruimte-mcp.service',
      lijst.includes(`mijn-ruimte-${versie}/deploy/mcp/server.mjs`) && lijst.includes(`mijn-ruimte-${versie}/deploy/mcp/mijn-ruimte-mcp.service`));
    const uitPakket = spawnSync(bashBin, ['-c', 'tar -xOzf "$1" "$2"', '_', archiefBash, `mijn-ruimte-${versie}/deploy/mcp/server.mjs`], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    check('deploy/mcp/server.mjs in uitrolpakket is byte-voor-byte gelijk aan HEAD', uitPakket.status === 0 && uitPakket.stdout === deurBron);

    // 3. Gedragstest van mcp_deur_bijwerken en terugdraaien in bash met nagebootste install/systemctl
    const bin = join(T, 'bin'); mkdirSync(bin);
    const log = join(T, 'aanroepen.log');
    const logBash = naarBashPad(bashBin, log);
    const stub = (naam: string, body: string) => {
      writeFileSync(join(bin, naam), `#!/bin/bash\n${body}\n`, 'utf8');
      chmodSync(join(bin, naam), 0o755);
    };
    stub('systemctl', [
      `echo "systemctl $*" >> "${logBash}"`,
      'if [ "$1" = "try-restart" ] && [ "${MCP_HERSTART_FAALT:-0}" = "1" ]; then exit 1; fi',
      'if [ "$1" = "daemon-reload" ] && [ "${MCP_RELOAD_FAALT:-0}" = "1" ]; then echo "Failed to reload daemon: Connection timed out" >&2; exit 1; fi',
      'if [ "$1" = "is-active" ]; then [ "${MCP_IS_ACTIEF:-1}" = "1" ] && exit 0 || exit 3; fi',
      'exit 0',
    ].join('\n'));
    stub('install', [
      'd=0; m=""; args=()',
      'while [ $# -gt 0 ]; do case "$1" in -d) d=1;; -m) m="$2"; shift;; -o|-g) shift;; *) args+=("$1");; esac; shift; done',
      'if [ "$d" = 1 ]; then mkdir -p "${args[@]}"; else mkdir -p "$(dirname "${args[1]}")" && cp -f "${args[0]}" "${args[1]}"; fi',
      '[ -n "$m" ] && chmod "$m" "${args[@]: -1}" 2>/dev/null || true',
      'exit 0',
    ].join('\n'));
    // Onder root negeert mcp_deur_bijwerken MCP_UNIT_DOEL (zie de controle hierboven) en zou de install-stub de ECHTE
    // /etc/systemd/system/mijn-ruimte-mcp.service overschrijven (CI-container, server). `id -u` daarom altijd als gewone gebruiker.
    // Під root тест інакше перезаписав би справжній unit хоста; id -u підмінено.
    stub('id', [
      'if [ "${1:-}" = "-u" ]; then echo 1000; exit 0; fi',
      'if [ "${1:-}" = "-gn" ]; then /usr/bin/id -gn 2>/dev/null || echo mijnruimte; exit 0; fi',
      'exec /usr/bin/id "$@"',
    ].join('\n'));
    stub('curl', 'echo \'{"ok":true}\'; exit 0');
    stub('flock', 'exit 0');
    if (pythonCmd() !== 'python3') stub('python3', `exec ${pythonCmd()} "$@"`);
    if (process.platform === 'win32') {
      // Op Windows zonder Developer Mode maakt MSYS2 `ln -s` een mapkopie i.p.v. een link; gebruik NTFS-junctions via Node zodat `omzetten` atomair blijft.
      const nodeB = naarBashPad(bashBin, process.execPath);
      stub('ln', [
        'while [ $# -gt 2 ]; do shift; done',
        `"${nodeB}" -e "const fs=require('node:fs'),cp=require('node:child_process');const [t,l]=process.argv.slice(1);try{fs.unlinkSync(l)}catch{try{cp.execFileSync('cmd',['/c','rmdir',l],{stdio:'ignore'})}catch{}}fs.symlinkSync(t,l,'junction');" "$(cygpath -w "$1")" "$(cygpath -w "$2")"`,
      ].join('\n'));
      stub('mv', [
        'while [ $# -gt 2 ]; do shift; done',
        `"${nodeB}" -e "const fs=require('node:fs'),cp=require('node:child_process');const [s,d]=process.argv.slice(1);const st=fs.lstatSync(s);if(st.isSymbolicLink()){const t=fs.readlinkSync(s);try{cp.execFileSync('cmd',['/c','rmdir',s],{stdio:'ignore'})}catch{}try{cp.execFileSync('cmd',['/c','rmdir',d],{stdio:'ignore'})}catch{}fs.symlinkSync(t,d,'junction');}else{try{fs.rmSync(d,{force:true})}catch{}fs.renameSync(s,d);}" "$(cygpath -w "$1")" "$(cygpath -w "$2")"`,
      ].join('\n'));
      stub('readlink', [
        'shift $(( $# - 1 ))',
        `w="$(cygpath -w "$1")"; "${nodeB}" -e "const fs=require('node:fs');try{process.stdout.write(fs.realpathSync(process.argv[1]))}catch{process.exit(1)}" "$w" | cygpath -u -f -`,
      ].join('\n'));
    }

    const app = join(T, 'srv-mijn-ruimte');
    const rel = join(app, 'releases');
    const unitPad = join(T, 'systemd', 'mijn-ruimte-mcp.service');
    mkdirSync(join(T, 'systemd'), { recursive: true });

    const maakRelease = (naam: string, deurInhoud: string, unitInhoud = unitBron) => {
      const d = join(rel, naam);
      mkdirSync(join(d, 'deploy/mcp'), { recursive: true });
      mkdirSync(join(d, 'dist-server'), { recursive: true });
      writeFileSync(join(d, 'deploy/mcp/server.mjs'), deurInhoud, 'utf8');
      writeFileSync(join(d, 'deploy/mcp/mijn-ruimte-mcp.service'), unitInhoud, 'utf8');
      writeFileSync(join(d, 'dist-server/start.mjs'), '// start\n', 'utf8');
      writeFileSync(join(d, 'UITROL-VERSIE'), `${naam}\n`, 'utf8');
      writeFileSync(join(d, 'RELEASE-COMMIT'), 'b279ccabe31a27139b337822162653ccc13b6a5a\n', 'utf8');
      return d;
    };

    const relA = maakRelease('20261031-093842', '// server.mjs versie A (oud)\n');
    const relB = maakRelease('20261031-204500', '// server.mjs versie B (nieuw met /.well-known doorsturen)\n');

    const appB = naarBashPad(bashBin, app);
    const relAB = naarBashPad(bashBin, relA);
    const relBB = naarBashPad(bashBin, relB);
    const unitB = naarBashPad(bashBin, unitPad);
    const binB = naarBashPad(bashBin, bin);
    const statusMap = join(T, 'status');
    const gebeurtenissenPad = join(statusMap, 'gebeurtenissen.jsonl');

    const kop = [
      'set -euo pipefail',
      'melding() { echo "[installeer] $*"; }',
      'waarschuwing() { echo "[installeer] LET OP: $*" >&2; }',
      'fout() { echo "[installeer] FOUT: $*" >&2; exit 1; }',
      'vereis_root() { :; }',
      'vergrendel() { :; }',
      'noteer_ssh() { echo "noteer_ssh $*" >> "' + logBash + '"; return 0; }',
      `APP_ROOT="${appB}"; RELEASES="${appB}/releases"; HUIDIG="${appB}/current"; VORIGE_BESTAND="${appB}/VORIGE"`,
      `DIENST=mijn-ruimte.service; GEBRUIKER=mijnruimte; GEZONDHEID_URL="http://127.0.0.1:8080/__gezondheid"; MCP_UNIT_DOEL="${unitB}"`,
      oneliner('actieve_release'),
      fn('pakket_versie'),
      fn('commit_van'),
      fn('gezond'),
      fn('omzetten'),
      `STATUS_GEBEURTENISSEN="${naarBashPad(bashBin, statusMap)}"; STATUS_GROEP="$(id -gn)"`,
      fn('mcp_deur_bijwerken'),
      fn('noteer_mcp_deur'),
      fn('terugdraaien'),
    ].join('\n');

    const draai = (script: string, extraEnv: Record<string, string> = {}) => {
      rmSync(log, { force: true });
      const r = spawnSync(bashBin, ['-c', `export PATH="${binB}:$PATH"\n${kop}\n${script}\n`], {
        encoding: 'utf8',
        env: { ...process.env, ...extraEnv },
      });
      const regels = existsSync(log) ? readFileSync(log, 'utf8').trim().split(/\r?\n/).filter(Boolean) : [];
      return { r, regels, uit: `${r.stdout || ''}${r.stderr || ''}` };
    };

    // 3a. Installatie van release B (dienst actief op poort 8091): server.mjs geplaatst, unit geplaatst + daemon-reload, try-restart uitgevoerd
    let x = draai(`mcp_deur_bijwerken "${relBB}"`, { MCP_IS_ACTIEF: '1' });
    check('installeren -> mcp_deur_bijwerken: plaatst /srv/mijn-ruimte/mcp/server.mjs uit de nieuwe release',
      x.r.status === 0 && readFileSync(join(app, 'mcp/server.mjs'), 'utf8').includes('versie B'), x.uit);
    check('installeren -> mcp_deur_bijwerken: installeert mijn-ruimte-mcp.service, doet daemon-reload en try-restart + melding poort 8091',
      existsSync(unitPad)
        && x.regels.includes('systemctl daemon-reload')
        && x.regels.includes('systemctl try-restart mijn-ruimte-mcp.service')
        && /MCP-deur bijgewerkt en herstart \(mijn-ruimte-mcp\.service, poort 8091\)/.test(x.uit),
      `${x.regels.join(' | ')} // ${x.uit}`);

    // 3b. Tweede run met ongewijzigde unit en uitgeschakelde dienst: geen onnodige daemon-reload, blijft uit zonder fout
    x = draai(`mcp_deur_bijwerken "${relBB}"`, { MCP_IS_ACTIEF: '0' });
    check('ongewijzigde unit + dienst uit: geen daemon-reload, wel try-restart (start gestopte dienst niet), geen fout',
      x.r.status === 0
        && !x.regels.includes('systemctl daemon-reload')
        && x.regels.includes('systemctl try-restart mijn-ruimte-mcp.service')
        && !/herstart \(mijn-ruimte-mcp\.service/.test(x.uit)
        && !/LET OP/.test(x.uit),
      `${x.regels.join(' | ')} // ${x.uit}`);

    // 3c. Mislukte herstart wordt niet meer stil ingeslikt (geeft waarschuwing met poort 8091)
    x = draai(`mcp_deur_bijwerken "${relBB}"`, { MCP_HERSTART_FAALT: '1' });
    check('mislukte try-restart geeft een duidelijke waarschuwing i.p.v. stil "|| true"',
      x.r.status === 0 && /LET OP: mijn-ruimte-mcp\.service \(poort 8091\) kon niet worden herstart/.test(x.uit), x.uit);

    // 3d. Terugdraaien van actieve release B naar vorige release A zet OOK /srv/mijn-ruimte/mcp/server.mjs terug en herstart poort 8091
    symlinkSync(relB, join(app, 'current'), process.platform === 'win32' ? 'junction' : 'dir');
    writeFileSync(join(app, 'VORIGE'), `${relAB}\n`, 'utf8');
    x = draai('terugdraaien', { MCP_IS_ACTIEF: '1' });
    check('terugdraaien: zet zowel hoofdapp als /srv/mijn-ruimte/mcp/server.mjs terug naar release A en herstart mijn-ruimte-mcp.service',
      x.r.status === 0
        && readFileSync(join(app, 'mcp/server.mjs'), 'utf8').includes('versie A')
        && readFileSync(join(app, 'current/UITROL-VERSIE'), 'utf8').trim() === '20261031-093842'
        && x.regels.includes('systemctl restart mijn-ruimte.service')
        && x.regels.includes('systemctl try-restart mijn-ruimte-mcp.service')
        && /teruggedraaid naar 20261031-093842/.test(x.uit),
      `${x.regels.join(' | ')} // ${x.uit}`);
    check('terugdraaien met werkende deur: geen gebeurtenis MCP_DEUR_NIET_TERUGGEZET (niets in gebeurtenissen.jsonl)',
      !existsSync(gebeurtenissenPad), existsSync(gebeurtenissenPad) ? readFileSync(gebeurtenissenPad, 'utf8') : '');

    // 3e. Terugdraaien waarbij de deur niet bij te werken is (daemon-reload faalt na een gewijzigde unit): de hoofdapp is al terug en
    // gezond → rc 0, «teruggedraaid» + auditregel SSH_TERUG, alleen een waarschuwing voor de deur (geen abort via set -e, anders meldt
    // nazorg/opdracht/besluit MISLUKT en zet een herhaling zonder argument via VORIGE de net teruggedraaide release terug).
    const relC = maakRelease('20261030-120000', '// server.mjs versie C (ouder)\n', `${unitBron}# variant C\n`);
    rmSync(join(app, 'current'), { force: true });
    symlinkSync(relB, join(app, 'current'), process.platform === 'win32' ? 'junction' : 'dir');
    writeFileSync(join(app, 'VORIGE'), `${naarBashPad(bashBin, relC)}\n`, 'utf8');
    x = draai('terugdraaien', { MCP_IS_ACTIEF: '1', MCP_RELOAD_FAALT: '1' });
    check('terugdraaien met falende daemon-reload van de deur: rc 0, hoofdapp op C, «teruggedraaid» + audit SSH_TERUG, waarschuwing «niet teruggezet» zonder herhaaladvies',
      x.r.status === 0
        && readFileSync(join(app, 'current/UITROL-VERSIE'), 'utf8').trim() === '20261030-120000'
        && /teruggedraaid naar 20261030-120000/.test(x.uit)
        && x.regels.some((r) => r.startsWith('noteer_ssh SSH_TERUG 20261030-120000'))
        && x.regels.includes('systemctl daemon-reload')
        && !x.regels.includes('systemctl try-restart mijn-ruimte-mcp.service')
        && /MCP-deur \(poort 8091\) niet teruggezet naar 20261030-120000/.test(x.uit)
        && /NIET opnieuw terugdraaien/.test(x.uit),
      `${x.regels.join(' | ')} // ${x.uit}`);
    // Zonder gebeurtenis zag de eigenaar op de site alleen «teruggedraaid» (SSH_TERUG/TERUG_OK); nu ook de waarschuwing voor de deur.
    const ruw = existsSync(gebeurtenissenPad) ? readFileSync(gebeurtenissenPad, 'utf8') : '';
    const ev = parseRootGebeurtenissen(ruw);
    const deur = ev.find((g) => g.code === 'MCP_DEUR_NIET_TERUGGEZET');
    check('falende deur bij terugdraaien → gebeurtenis MCP_DEUR_NIET_TERUGGEZET (warn, bron uitrol, release C) die de app inleest',
      ev.length === 1 && !!deur && deur.niveau === 'warn' && deur.bron === 'uitrol' && deur.release === '20261030-120000'
        && /8091/.test(deur.uk) && /8091/.test(deur.nl) && /НЕ повторюйте/.test(deur.uk) && /NIET opnieuw terugdraaien/.test(deur.nl)
        && deur.uk.includes('20261030-120000') && !x.uit.includes('niet geschreven'),
      `${ruw} // ${x.uit}`);
    // Geen herkomst en geen versie-tag: uitrol-runs.ts (eindEvent / oudeUitkomstenOpnemen) mag er geen einde of weigering van een run van maken.
    const regelRuw = JSON.parse(ruw.trim().split('\n').pop() || '{}') as Record<string, unknown>;
    check('gebeurtenis zonder herkomst, tag «mcp-deur», teksten ≤ 300 tekens (niet afgekapt), code vertaald in shared/uitrol-codes.ts',
      !!deur && !deur.herkomst && regelRuw.herkomst === undefined && deur.tag === 'mcp-deur' && !/^\d{8}-\d{6}$/.test(String(deur.tag))
        && String(regelRuw.uk).length <= 300 && String(regelRuw.nl).length <= 300
        && String(regelRuw.uk).endsWith('try-restart mijn-ruimte-mcp.') && String(regelRuw.nl).endsWith('try-restart mijn-ruimte-mcp.')
        && !!UITROL_CODES.MCP_DEUR_NIET_TERUGGEZET?.doenUk && !!UITROL_CODES.MCP_DEUR_NIET_TERUGGEZET?.doenNl,
      JSON.stringify(regelRuw));
    // noteer_mcp_deur zelf: onbekende code of niveau → niets geschreven (rc ≠ 0).
    // Ontbreekt het bestand (regressie hierboven), dan een FOUT in deze check en geen crash van de hele suite.
    const leesGeb = () => (existsSync(gebeurtenissenPad) ? readFileSync(gebeurtenissenPad, 'utf8') : '');
    const voor = leesGeb();
    const fout1 = draai(`noteer_mcp_deur IETS_ANDERS warn "${relAB}"`);
    const fout2 = draai(`noteer_mcp_deur MCP_DEUR_NIET_TERUGGEZET info "${relAB}"`);
    check('noteer_mcp_deur weigert een andere code of niveau info (rc ≠ 0, gebeurtenissen.jsonl ongewijzigd)',
      fout1.r.status !== 0 && fout2.r.status !== 0 && leesGeb() === voor, `${fout1.r.status} ${fout2.r.status}`);
    check('volgorde in terugdraaien: auditregel SSH_TERUG vóór mcp_deur_bijwerken, dat niet-fataal is; bij installeren blijft een fout fataal',
      /noteer_ssh SSH_TERUG[^\n]*\n[\s\S]*?mcp_deur_bijwerken "\$doel" \|\| \{\n\s*waarschuwing [^\n]*\n\s*noteer_mcp_deur MCP_DEUR_NIET_TERUGGEZET warn "\$doel"/.test(fn('terugdraaien'))
        && /mcp_deur_bijwerken "\$doel" \|\| fout /.test(fn('veilige_uitrol_inrichten')));
  } finally {
    rmSync(T, { recursive: true, force: true });
  }
  return einde();
}
