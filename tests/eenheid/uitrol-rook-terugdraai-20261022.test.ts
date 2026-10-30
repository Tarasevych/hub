// AUTOMATISCH TERUGDRAAIEN NA DE RENDERCONTROLE (zone A, 22.10.2026) — de bash-logica van deploy/installeer-app.sh (activeren +
// rook_controleren + noteer_rook + rook_opdracht) met nagebootste commando's, zoals sprong-backup.test.ts dat voor migreren() doet.
// Release 20261021-221718: activeren → gezond → nabewaken waren groen terwijl elke admin-pagina wit was; de beloofde autoterugdraai bleef uit.
// Hier: (1) rook «kapot» (code 1) → terug naar de vorige release, gebeurtenis ROOK_TERUGGEDRAAID met de reden, status-JSON bewaard,
// de vorige release één keer LIVE nagekeken en nooit nog eens teruggedraaid (geen lus), exit 1 met de reden in de FOUT-regel;
// (2) code 2 (niet uitgevoerd: geen browser) → release blijft actief, waarschuwing, exit 0; (3) code 0 → actief;
// (4) ROOK_UIT=1 → overgeslagen; (5) zonder vorige release → ROOK_MISLUKT; (6) rook_opdracht (handmatig) draait nooit terug;
// (7) de wegwerpdatabase wordt aangemaakt (mijnruimte_rook_*) en weer verwijderd; de stand draait als de dienstgebruiker.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';

const W = process.cwd();
const inst = readFileSync(join(W, 'deploy/installeer-app.sh'), 'utf8');
const fn = (naam: string) => { const m = new RegExp(`^${naam}\\(\\) \\{[\\s\\S]*?^\\}`, 'm').exec(inst); if (!m) throw new Error(`functie ${naam} niet gevonden`); return m[0]; };
const oneliner = (naam: string) => { const m = new RegExp(`^${naam}\\(\\) \\{.*\\}$`, 'm').exec(inst); if (!m) throw new Error(`oneliner ${naam} niet gevonden`); return m[0]; };

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-rook-terugdraai-20261022');
  const T = mkdtempSync(join(tmpdir(), 'mr-rook-'));
  try {
    const bin = join(T, 'bin'); mkdirSync(bin);
    const stub = (naam: string, body: string) => { writeFileSync(join(bin, naam), `#!/bin/bash\n${body}\n`); chmodSync(join(bin, naam), 0o755); };
    const log = join(T, 'aanroepen.log');
    // systemd-run: het enige commando dat de rook-controle «uitvoert». Schrijft het JSON dat ROOK_PROEF voorschrijft naar --uit en geeft de code terug.
    stub('systemd-run', `echo "systemd-run $*" >> "${log}"
uit=""; modus=""; dist=""; prev=""
for a in "$@"; do case "$prev" in --uit) uit="$a";; --dist) dist="$a";; esac; case "$a" in --stand|--live|--alleen-modules) modus="$a";; esac; prev="$a"; done
echo "rook-modus $modus dist=$dist" >> "${log}"
proef="\${ROOK_PROEF:-ok}"; [ "$modus" = --live ] && proef="\${ROOK_PROEF_LIVE:-ok}"
case "$proef" in
  kapot) printf '%s' '{"tijd":"2026-10-22T20:00:00.000Z","modus":"stand","chromium":"/x/chrome","uitgevoerd":true,"kapot":true,"paginas":[{"naam":"admin-updates","url":"https://admin.x/updates","stand":"kapot","fouten":["pageerror: Error: Buffer is not defined","#root leeg"],"http":200,"ms":1600}],"bundels":{"aantal":10,"ok":9,"kapot":["/assets/tech/AdminConsoleView-x.js: Buffer is not defined"],"waarschuwingen":[]},"fouten":[],"samenvatting":{"uk":"Зламано (стенд): 1 з 1 сторінок. Перше: сторінка admin-updates не рендериться (pageerror: Error: Buffer is not defined).","nl":"Kapot (stand): 1 van 1 pagina’s. Eerste: pagina admin-updates rendert niet (pageerror: Error: Buffer is not defined)."},"ms":30000,"code":1}' > "$uit"; exit 1 ;;
  niet) printf '%s' '{"tijd":"2026-10-22T20:00:00.000Z","modus":"geen","chromium":"","uitgevoerd":false,"kapot":false,"paginas":[],"bundels":{"aantal":0,"ok":0,"kapot":[]},"fouten":["Chromium stopte"],"samenvatting":{"uk":"Перевірку не вдалося виконати: Chromium стопте — це НЕ підстава для відкату.","nl":"Controle kon niet worden uitgevoerd."},"ms":5,"code":2}' > "$uit"; exit 2 ;;
  leeg) exit 2 ;;
  *) printf '%s' '{"tijd":"2026-10-22T20:00:00.000Z","modus":"stand","chromium":"/x/chrome","uitgevoerd":true,"kapot":false,"paginas":[{"naam":"admin-updates","url":"u","stand":"ok","fouten":[],"http":200,"ms":900}],"bundels":{"aantal":10,"ok":10,"kapot":[],"waarschuwingen":[]},"fouten":[],"samenvatting":{"uk":"Гаразд (стенд): 1 сторінок рендеряться.","nl":"In orde (stand): 1 pagina’s renderen."},"ms":20000,"code":0}' > "$uit"; exit 0 ;;
esac`);
    stub('systemctl', `echo "systemctl $*" >> "${log}"; exit 0`);
    stub('curl', `echo '{"ok":true}'; exit 0`);
    stub('runuser', `echo "runuser $*" >> "${log}"; for a in "$@"; do case "$a" in *"SELECT datname"*) exit 0;; esac; done; exit 0`);
    stub('psql', 'exit 0');
    stub('id', 'exit 0');
    stub('chown', 'exit 0'); stub('chgrp', 'exit 0');
    stub('install', `# install [-d] [-m M] [-o O] [-g G] bron doel  → zonder eigenaar (test draait niet als root)
d=0; m=""; args=(); while [ $# -gt 0 ]; do case "$1" in -d) d=1;; -m) m="$2"; shift;; -o|-g) shift;; *) args+=("$1");; esac; shift; done
if [ "$d" = 1 ]; then mkdir -p "\${args[@]}"; else cp -f "\${args[0]}" "\${args[1]}"; fi; [ -n "$m" ] && chmod "$m" "\${args[@]: -1}" 2>/dev/null; exit 0`);
    stub('sleep', 'exit 0');
    const app = join(T, 'app'); const rel = join(app, 'releases');
    const maakRelease = (naam: string, versie: string) => {
      const d = join(rel, naam);
      mkdirSync(join(d, 'scripts'), { recursive: true }); mkdirSync(join(d, 'dist')); mkdirSync(join(d, 'dist-server'));
      writeFileSync(join(d, 'scripts', 'rook-controle.mjs'), '// stub'); writeFileSync(join(d, 'dist', 'index.html'), '<html>'); writeFileSync(join(d, 'dist-server', 'rook.mjs'), '// stub');
      writeFileSync(join(d, 'dist-server', 'start.mjs'), '// stub'); writeFileSync(join(d, 'UITROL-VERSIE'), `${versie}\n`);
      return d;
    };
    const A = maakRelease('20261022-100000', '20261022-100000'), B = maakRelease('20261022-120000', '20261022-120000');
    const status = join(T, 'status'); mkdirSync(status);
    writeFileSync(join(T, 'geheimen.env'), 'DATABASE_URL_SYSTEM=postgres://mijnruimte_system:geheim@127.0.0.1:5432/mijnruimte\n');
    writeFileSync(join(T, 'migratie.env'), 'DATABASE_URL_MIGRATIE=postgres://mijnruimte_migrator:geheim@127.0.0.1:5432/mijnruimte\n');

    const kop = [
      'set -euo pipefail', 'melding() { echo "[installeer] $*"; }', 'waarschuwing() { echo "[installeer] LET OP: $*" >&2; }', 'fout() { echo "[installeer] FOUT: $*" >&2; exit 1; }',
      'voortgang() { echo "[installeer] stap: $1 ($2%) ${3:-}"; }', 'vereis_root() { :; }', 'vereis_node() { :; }',
      `APP_ROOT="${app}"; RELEASES="${rel}"; HUIDIG="${app}/current"; VORIGE_BESTAND="${app}/VORIGE"; GEHEIMEN="${T}/geheimen.env"; MIGRATIE_ENV="${T}/migratie.env"`,
      `DIENST=mijn-ruimte.service; GEBRUIKER=mijnruimte; STATUS_GEBEURTENISSEN="${status}"; STATUS_GROEP="$(id -gn 2>/dev/null || echo users)"; NODE=/usr/bin/node; PORT=8080; GEZONDHEID_URL="http://127.0.0.1:8080/__gezondheid"; NABEWAKING_SEC=0; ROOK_REDEN=""; ROOK_STATUS="rook-controle.json"`,
      oneliner('actieve_release'), fn('pakket_versie'), fn('gezond'), fn('omzetten'), fn('nabewaken'),
      oneliner('rook_chromium'), fn('rook_db_rol'), oneliner('rook_psql'), oneliner('rook_db_maken'), oneliner('rook_db_opruimen'), oneliner('rook_dbs_opruimen'), oneliner('rook_samenvatting'),
      fn('rook_controleren'), fn('noteer_rook'), fn('rook_opdracht'), fn('activeren'),
    ].join('\n');
    const draai = (cmd: string, env: Record<string, string> = {}) => {
      // Vers startpunt: A actief, B nieuw.
      rmSync(join(app, 'current'), { force: true }); symlinkSync(A, join(app, 'current')); rmSync(join(app, 'VORIGE'), { force: true }); rmSync(log, { force: true });
      const r = spawnSync('bash', ['-c', `${kop}\n${cmd}\n`], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, ROOK_CHROMIUM: join(bin, 'systemctl') /* bestaat en is uitvoerbaar: «browser aanwezig» */, MIJN_RUIMTE_UITROL_MODUS: 'ssh', ...env } });
      const regels = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
      const events = existsSync(join(status, 'gebeurtenissen.jsonl')) ? readFileSync(join(status, 'gebeurtenissen.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
      return { r, regels, events, actief: (() => { try { return readlinkSync(join(app, 'current')); } catch { return ''; } })(), uit: r.stdout + r.stderr };
    };
    const schoon = () => { rmSync(join(status, 'gebeurtenissen.jsonl'), { force: true }); rmSync(join(status, 'rook-controle.json'), { force: true }); };

    // ------------------------------------------------------------------ 1. kapot → terugdraaien
    schoon();
    let x = draai(`activeren "${B}"`, { ROOK_PROEF: 'kapot' });
    check('kapot: activeren eindigt met exit 1 en de FOUT-regel noemt de rendercontrole + de pagina + «Buffer is not defined»', x.r.status === 1 && /FOUT: installatie van .* mislukt: rendercontrole — .*admin-updates.*Buffer is not defined/.test(x.uit), x.uit.slice(-500));
    check('kapot: current wijst weer naar de vorige release (A), niet naar B', x.actief === A, x.actief);
    check('kapot: volgorde = omzetten B → herstart → gezond → rook (stand) → terug naar A → herstart', (() => { const s = x.regels.filter((l) => /^systemctl restart|^rook-modus/.test(l)).join(' | '); return /systemctl restart .* \| rook-modus --stand .*20261022-120000\/dist \| systemctl restart/.test(s); })(), x.regels.join('\n'));
    check('kapot: de vorige release wordt daarna één keer LIVE nagekeken (dist van A, script van B) en NIET nog eens teruggedraaid', x.regels.filter((l) => /^rook-modus --live/.test(l)).length === 1 && /rook-modus --live dist=.*20261022-100000\/dist/.test(x.regels.join('\n')) && x.regels.filter((l) => /^systemctl restart/.test(l)).length === 2);
    check('kapot: precies één gebeurtenis ROOK_TERUGGEDRAAID (warn) met «Відкочено автоматично», release, vorige en de reden in uk+nl', x.events.length === 1 && x.events[0].code === 'ROOK_TERUGGEDRAAID' && x.events[0].niveau === 'warn' && /Відкочено автоматично з 20261022-120000 на 20261022-100000: .*admin-updates.*Buffer is not defined/.test(x.events[0].uk) && /Automatisch teruggedraaid van 20261022-120000 naar 20261022-100000/.test(x.events[0].nl) && x.events[0].herkomst === 'ssh' && x.events[0].tag === '20261022-120000', JSON.stringify(x.events));
    check('kapot: rook-controle-kapot.json bewaart de kapotte uitslag; rook-controle.json is de laatste controle (de vorige release, live) voor «Діагностика»', existsSync(join(status, 'rook-controle-kapot.json')) && JSON.parse(readFileSync(join(status, 'rook-controle-kapot.json'), 'utf8')).kapot === true && JSON.parse(readFileSync(join(status, 'rook-controle.json'), 'utf8')).kapot === false);
    check('kapot: wegwerpdatabase mijnruimte_rook_* aangemaakt met de migratierol als eigenaar en daarna verwijderd; nooit de productiedatabase', (() => { const r = x.regels.filter((l) => l.startsWith('runuser')); return r.some((l) => /CREATE DATABASE "mijnruimte_rook_\d{14}" OWNER "mijnruimte_migrator"/.test(l)) && r.some((l) => /DROP DATABASE IF EXISTS "mijnruimte_rook_\d{14}"/.test(l)) && !r.some((l) => /DROP DATABASE[^\n]*"mijnruimte"/.test(l)); })(), x.regels.filter((l) => l.startsWith('runuser')).join('\n'));
    check('kapot: de stand draait als de dienstgebruiker met ROOK_DB, NoNewPrivileges en ProtectSystem=strict (nooit root)', x.regels.some((l) => /^systemd-run .*-p User=mijnruimte .*NoNewPrivileges=yes -p ProtectSystem=strict.*ROOK_DB=mijnruimte_rook_\d+/.test(l)));
    check('kapot: stapregel «rook (97%)» voor de voortgangsbalk op de site', /\[installeer\] stap: rook \(97%\)/.test(x.uit));

    // ------------------------------------------------------------------ 2. code 2 (niet uitgevoerd) → actief, waarschuwing, geen terugdraai
    schoon();
    x = draai(`activeren "${B}"`, { ROOK_PROEF: 'niet' });
    check('niet uitgevoerd: exit 0, B blijft actief, waarschuwing «NIET gecontroleerd», geen terugdraai, geen gebeurtenis', x.r.status === 0 && x.actief === B && /rendering van .* is NIET gecontroleerd/.test(x.uit) && x.regels.filter((l) => /^systemctl restart/.test(l)).length === 1 && x.events.length === 0, x.uit.slice(-300));
    schoon();
    x = draai(`activeren "${B}"`, { ROOK_PROEF: 'leeg' });
    check('geen JSON (stand crashte): ook code 2 → actief met waarschuwing, nooit terugdraaien', x.r.status === 0 && x.actief === B && /geen resultaat/.test(x.uit));

    // ------------------------------------------------------------------ 3. in orde
    schoon();
    x = draai(`activeren "${B}"`, { ROOK_PROEF: 'ok' });
    check('in orde: exit 0, «actief», B actief, samenvatting in het logboek, JSON bewaard, geen gebeurtenis', x.r.status === 0 && x.actief === B && /rendercontrole: Гаразд/.test(x.uit) && /\[installeer\] actief:/.test(x.uit) && existsSync(join(status, 'rook-controle.json')) && x.events.length === 0, x.uit.slice(-300));

    // ------------------------------------------------------------------ 4. uitgezet / geen browser
    schoon();
    x = draai(`activeren "${B}"`, { ROOK_PROEF: 'kapot', ROOK_UIT: '1' });
    check('ROOK_UIT=1: overgeslagen, B actief, geen systemd-run', x.r.status === 0 && x.actief === B && !x.regels.some((l) => l.startsWith('systemd-run')) && /overgeslagen/.test(x.uit));
    schoon();
    x = draai(`activeren "${B}"`, { ROOK_PROEF: 'ok', ROOK_CHROMIUM: '/bestaat/niet' });
    check('zonder browser: --alleen-modules (geen wegwerpdatabase), voortgangsregel noemt «geen browser» en browser-controle', x.regels.some((l) => /^rook-modus --alleen-modules/.test(l)) && !x.regels.some((l) => /CREATE DATABASE/.test(l)) && /geen browser: sudo mijn-ruimte-installeer browser-controle/.test(x.uit), x.uit.slice(-400));

    // ------------------------------------------------------------------ 5. zonder vorige release
    schoon();
    x = draai(`rm -f "${app}/current"; activeren "${B}"`, { ROOK_PROEF: 'kapot' });
    check('kapot zonder vorige release: exit 1, gebeurtenis ROOK_MISLUKT (error) met SSH-aanwijzing, B blijft staan (niets om naar terug te gaan)', x.r.status === 1 && x.events.length === 1 && x.events[0].code === 'ROOK_MISLUKT' && x.events[0].niveau === 'error' && /terugdraaien/.test(x.events[0].uk), JSON.stringify(x.events));

    // ------------------------------------------------------------------ 6. handmatig (rook_opdracht) draait nooit terug
    schoon();
    x = draai(`rook_opdracht`, { ROOK_PROEF: 'kapot' });
    check('rook_opdracht (handmatig/nazorg-verzoek): kapot → exit 1, gebeurtenis ROOK_KAPOT, GEEN omzetten/herstart', x.r.status === 1 && x.events.length === 1 && x.events[0].code === 'ROOK_KAPOT' && x.actief === A && !x.regels.some((l) => /^systemctl restart/.test(l)), JSON.stringify(x.events) + x.uit.slice(-200));
    schoon();
    x = draai(`rook_opdracht --live`, { ROOK_PROEF_LIVE: 'ok' });
    check('rook_opdracht --live: live-modus tegen de draaiende dienst, exit 0, geen database', x.r.status === 0 && x.regels.some((l) => /^rook-modus --live/.test(l)) && !x.regels.some((l) => /CREATE DATABASE/.test(l)));

    // ------------------------------------------------------------------ 7. de installer schrijft het JSON nooit als root-only onleesbaar: 0640 + statusgroep
    check('rook-controle.json krijgt 0640 (root:mijnruimte) zoals status.json', /install -m 0640 -o root -g "\$STATUS_GROEP" "\$uit" "\$STATUS_GEBEURTENISSEN\/\$ROOK_STATUS"/.test(inst));
    check('migraties worden nooit teruggedraaid: terugdraaien() waarschuwt, en de rook-stand gebruikt een eigen database (ROOK_DB)', /migraties worden NIET teruggedraaid/.test(inst) && /ROOK_DB=\$db/.test(inst));
  } finally { rmSync(T, { recursive: true, force: true }); }
  return einde();
}
