// deploy/apparaat-inrichten.sh (zone G, 22.10.2026): de server als apparaat van de eigenaar zonder code overtypen. Het echte bash-script
// draait hier met nagebootste systemd-run / runuser / systemctl / id / getent / install in PATH (geen root, geen database, geen
// netwerk): koppelcode als dienstgebruiker, code via stdin (nooit als argument), pair + terminal-config als de gewone gebruiker, unit
// uit het sjabloon zonder open @…@, idempotent, --status/--uit, --bij-installeren nooit fataal, weigeringen (shell in --allow, map buiten).
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('apparaat-inrichten-20261022');
  // INTEG-001: het echte bash-script draait hier met nagebootste systemd-run/runuser/systemctl in PATH (':'-gescheiden, /usr/bin/install).
  // Dat bestaat alleen op Linux; op Windows is «bash» het WSL-startprogramma zonder distributie. Dus niet stil groen, maar expliciet overgeslagen.
  if (process.platform !== 'linux') { console.log('OVERGESLAGEN apparaat-inrichten: vereist Linux met systemd (voer uit op de VM)'); return einde(); }
  const T = mkdtempSync(join(tmpdir(), 'apparaat-'));
  const bin = join(T, 'bin'), srv = join(T, 'srv'), cur = join(srv, 'current'), home = join(T, 'home', 'beheer'), sysd = join(T, 'systemd'), agentDir = join(T, 'agentdir'), log = join(T, 'log');
  for (const d of [bin, join(cur, 'deploy', 'agent'), join(cur, 'dist-server'), join(cur, 'backend'), home, sysd, log]) mkdirSync(d, { recursive: true });
  writeFileSync(join(cur, 'deploy', 'agent', 'agent.mjs'), readFileSync(resolve('deploy/agent/agent.mjs')));
  writeFileSync(join(cur, 'deploy', 'mijn-ruimte-apparaat.service'), readFileSync(resolve('deploy/mijn-ruimte-apparaat.service')));
  writeFileSync(join(cur, 'dist-server', 'apparaat-koppelcode.mjs'), '// nep\n');
  writeFileSync(join(cur, 'backend', 'deployment-identiteit.ts'), "export const PUBLIC_DOMAIN = 'example.test';\n");
  const stub = (naam: string, inhoud: string) => { writeFileSync(join(bin, naam), `#!/bin/bash\n${inhoud}\n`); chmodSync(join(bin, naam), 0o755); };
  // systemd-run: schrijft zijn argumenten weg en geeft de koppelcode (of een fout, gestuurd via CODE_MODUS).
  stub('systemd-run', `printf '%s\\n' "$@" > "${log}/systemd-run.txt"\ncase "\${CODE_MODUS:-ok}" in ok) echo "[apparaat-koppelcode] ok" >&2; echo ABCD2345 ;; geen) echo "[apparaat-koppelcode] EIGENAAR_NIET_AANGEMELD: nog niet aangemeld" >&2; exit 3 ;; geen0) echo "[apparaat-koppelcode] EIGENAAR_NIET_AANGEMELD: nog niet aangemeld" >&2; exit 0 ;; fout) echo "[apparaat-koppelcode] PAIRING_CODE_RATE_LIMITED: te veel" >&2; exit 1 ;; *) exit 1 ;; esac`);
  // runuser: logt de aanroep (één regel per aanroep, argumenten gescheiden door |), bewaart stdin en maakt bij 'pair' het config.json.
  stub('runuser', `{ printf '%s|' "$@"; echo; } >> "${log}/runuser.txt"\ncat > "${log}/stdin-$$.txt"\nfor a in "$@"; do case "$a" in HUB_AGENT_CONFIG=*) c="\${a#HUB_AGENT_CONFIG=}";; esac; done\nfor a in "$@"; do [ "$a" = pair ] && { mkdir -p "$(dirname "$c")"; echo '{"server":"https://mcp.example.test","agentId":"a1","roots":["${home}"],"allow":["git"]}' > "$c"; }; done\nexit 0`);
  stub('systemctl', `{ printf '%s ' "$@"; echo; } >> "${log}/systemctl.txt"\ncase "$1" in list-unit-files) exit 0 ;; esac\nexit 0`);
  stub('id', `case "$*" in "-u") echo 0 ;; "-u beheer") echo 1000 ;; "-gn beheer") echo beheer ;; "beheer") echo "uid=1000(beheer)" ;; "-u mijnruimte"|"mijnruimte") echo 999 ;; *) echo "id: '$2': no such user" >&2; exit 1 ;; esac`);
  stub('getent', `[ "$2" = beheer ] && echo "beheer:x:1000:1000::${home}:/bin/bash" || exit 2`);
  stub('hostname', 'echo vm');
  stub('install', `args=(); skip=0; for a in "$@"; do if [ $skip = 1 ]; then skip=0; continue; fi; case "$a" in -o|-g) skip=1 ;; *) args+=("$a") ;; esac; done; exec /usr/bin/install "\${args[@]}"`);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, MIJN_RUIMTE_APPARAAT_TEST: '1', MIJN_RUIMTE_APP_ROOT: srv, MIJN_RUIMTE_SYSTEMD_DIR: sysd, MIJN_RUIMTE_AGENT_DIR: agentDir, NODE: process.execPath, MIJN_RUIMTE_GEHEIMEN: join(T, 'geheimen.env'), MIJN_RUIMTE_MIGRATIE_ENV: join(T, 'migratie.env') };
  writeFileSync(join(T, 'geheimen.env'), 'X=1\n');
  const run = (args: string[], extra: Record<string, string> = {}) => spawnSync('bash', [resolve('deploy/apparaat-inrichten.sh'), ...args], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 60_000 });
  const lees = (f: string) => { try { return readFileSync(join(log, f), 'utf8'); } catch { return ''; } };
  const leeg = () => { for (const f of ['systemd-run.txt', 'runuser.txt', 'systemctl.txt']) rmSync(join(log, f), { force: true }); };
  try {
    // ---- weigeringen vóór er iets gebeurt
    const w1 = run(['--allow', 'git,bash']);
    check('--allow met een shell → FOUT, niets gestart', w1.status === 1 && /shells, sudo/.test(w1.stderr) && !lees('systemd-run.txt'));
    const w2 = run(['--root', '/etc']);
    check('--root /etc → FOUT (map niet toegestaan)', w2.status === 1 && /niet toegestaan als agent-root/.test(w2.stderr));
    const w3 = run(['--gebruiker', 'mijnruimte']);
    check('de dienstgebruiker mag geen apparaat-agent zijn', w3.status === 1 && /dienstgebruiker/.test(w3.stderr), w3.stderr);
    mkdirSync(join(T, 'map met spatie'), { recursive: true }); mkdirSync(join(T, 'a&b'), { recursive: true });
    const w5 = run(['--root', join(T, 'map met spatie')]), w6 = run(['--root', join(T, 'a&b')]);
    check('map met spatie of & (zou de unit/sed breken) → FOUT, niets gestart', w5.status === 1 && w6.status === 1 && /ongeldige tekens/.test(w5.stderr + w6.stderr) && !lees('systemd-run.txt'), w5.stderr + w6.stderr);
    const w4 = run(['--gebruiker', 'bestaat-niet']);
    check('onbekende gebruiker → FOUT met hint', w4.status === 1 && /bestaat niet/.test(w4.stderr));

    // ---- de normale weg
    const r = run([]);
    check('inrichten: exit 0, melding «gekoppeld … als beheer, zonder sudo»', r.status === 0 && /gekoppeld als apparaat van de eigenaar/.test(r.stdout) && /zonder sudo/.test(r.stdout), r.stdout + r.stderr);
    const sr = lees('systemd-run.txt');
    check('koppelcode: via systemd-run als de DIENSTgebruiker met de geheimen, apparaat-koppelcode.mjs --ruimte technisch, NoNewPrivileges', /User=mijnruimte/.test(sr) && /EnvironmentFile=/.test(sr) && /apparaat-koppelcode\.mjs/.test(sr) && /--ruimte\ntechnisch/.test(sr) && /NoNewPrivileges=yes/.test(sr), sr);
    const ru = lees('runuser.txt').split('\n').filter(Boolean);
    check('pair als beheer met --code - (code NIET als argument), roots thuismap rw + /srv en /var/log ro, standaard allow-lijst, naam met hostnaam', ru.length === 2 && /^-u\|beheer\|--\|env\|HOME=/.test(ru[0]) && /\|pair\|--server\|https:\/\/mcp\.example\.test\|--code\|-\|--name\|vm · сервер \(beheer\)\|--root\|/.test(ru[0]) && !/ABCD2345/.test(ru[0]) && ru[0].includes(`--readonly-root|${srv}|`) && ru[0].includes('--readonly-root|/var/log|') && /--allow\|systemctl,journalctl,git,node,npm,ls,/.test(ru[0]) && !/[,|]bash[,|]/.test(ru[0]), ru[0]);
    const stdins = readdirSync(log).filter((f) => f.startsWith('stdin-')).map((f) => readFileSync(join(log, f), 'utf8'));
    check('de koppelcode ging via stdin naar pair', stdins.some((s) => s.trim() === 'ABCD2345'));
    check('daarna terminal-config on --opdrachten --geen-container als beheer', /\|terminal-config\|on\|--opdrachten\|--geen-container\|$/.test(ru[1]), ru[1]);
    const unitPad = join(sysd, 'mijn-ruimte-apparaat.service');
    const unit = existsSync(unitPad) ? readFileSync(unitPad, 'utf8') : '';
    check('unit geschreven uit het sjabloon: User=beheer, HOME, ExecStart node agent.mjs run, ReadWritePaths ~/.hub-agent + thuismap, NoNewPrivileges, strict, geen open @…@',
      /^User=beheer$/m.test(unit) && unit.includes(`Environment=HOME=${home}`) && unit.includes(`ExecStart=${process.execPath} ${agentDir}/agent.mjs run`) && unit.includes(`ReadWritePaths=${home}/.hub-agent ${home}`) && /^NoNewPrivileges=yes$/m.test(unit) && /^ProtectSystem=strict$/m.test(unit) && !/@[A-Z_]+@/.test(unit) && !/ReadWritePaths=[^\n]*\/srv/.test(unit), unit.slice(0, 600));
    const sc = lees('systemctl.txt');
    check('systemctl: daemon-reload, enable --now, restart van mijn-ruimte-apparaat.service; agent gekopieerd naar de agentmap', /daemon-reload/.test(sc) && /enable --now mijn-ruimte-apparaat\.service/.test(sc) && /restart mijn-ruimte-apparaat\.service/.test(sc) && existsSync(join(agentDir, 'agent.mjs')), sc);
    // ---- idempotent
    leeg();
    const r2 = run([]);
    check('tweede keer: «al ingericht», geen nieuwe koppelcode, alleen try-restart', r2.status === 0 && /al ingericht/.test(r2.stdout) && !lees('systemd-run.txt') && /try-restart/.test(lees('systemctl.txt')));
    leeg();
    const r3 = run(['--opnieuw']);
    check('--opnieuw: opnieuw koppelen (nieuwe code, pair)', r3.status === 0 && /apparaat-koppelcode/.test(lees('systemd-run.txt')) && /\|pair\|/.test(lees('runuser.txt')));
    // ---- status / uit / bij-installeren
    const st = run(['--status']);
    check('--status: unit, koppeling, mappen en toegestane lijst', st.status === 0 && /gekoppeld aan https:\/\/mcp\.example\.test/.test(st.stdout) && /toegestaan: git/.test(st.stdout), st.stdout + st.stderr);
    leeg();
    const u = run(['--uit']);
    check('--uit: disable --now, koppeling blijft', u.status === 0 && /disable --now mijn-ruimte-apparaat\.service/.test(lees('systemctl.txt')) && existsSync(join(home, '.hub-agent', 'config.json')));
    leeg();
    const bi = run(['--bij-installeren', cur]);
    check('--bij-installeren met bestaande unit: alleen try-restart, exit 0', bi.status === 0 && /try-restart mijn-ruimte-apparaat/.test(lees('systemctl.txt')) && !lees('systemd-run.txt'));
    // ---- eigenaar nog niet aangemeld: duidelijke fout; bij installeren nooit fataal
    rmSync(unitPad, { force: true }); rmSync(join(home, '.hub-agent'), { recursive: true, force: true }); leeg();
    const g = run([], { CODE_MODUS: 'geen' });
    check('eigenaar nog niet aangemeld → FOUT met de uitleg (meld u één keer aan), geen pair', g.status === 1 && /nog nooit aangemeld/.test(g.stderr) && !lees('runuser.txt'), g.stderr);
    const g0 = run([], { CODE_MODUS: 'geen0' });
    check('…ook als systemd-run de exitcode niet doorgeeft (exit 0 + vast woord EIGENAAR_NIET_AANGEMELD)', g0.status === 1 && /nog nooit aangemeld/.test(g0.stderr), g0.stderr);
    const gf = run([], { CODE_MODUS: 'fout' });
    check('andere fout van de koppelcode → FOUT met de reden (rate limit), geen pair', gf.status === 1 && /koppelcode mislukt: .*PAIRING_CODE_RATE_LIMITED/.test(gf.stderr) && !lees('runuser.txt'), gf.stderr);
    const tmpRest = readdirSync(tmpdir()).filter((f) => f.startsWith('.apparaat-code-fout'));
    check('geen voorspelbaar /tmp-bestand van root (mktemp)', !readFileSync(resolve('deploy/apparaat-inrichten.sh'), 'utf8').includes('/tmp/.apparaat-code-fout') && tmpRest.length === 0, tmpRest.join(','));
    const gb = run(['--bij-installeren', cur], { CODE_MODUS: 'geen' });
    check('…en bij installeren: exit 0 met waarschuwing (installatie gaat door)', gb.status === 0 && /LET OP: server als apparaat niet ingericht/.test(gb.stderr), gb.stderr);
    const gb2 = run(['--bij-installeren', cur, '--gebruiker', 'bestaat-niet']);
    check('bij installeren zonder gebruiker beheer: overgeslagen met hint, exit 0', gb2.status === 0 && /overgeslagen/.test(gb2.stdout));
    // ---- installer-koppeling (bron)
    const inst = readFileSync(resolve('deploy/installeer-app.sh'), 'utf8');
    check('installeer-app.sh: terminal-inrichten (root + node) via hulpscript; hulpscript geïnstalleerd als mijn-ruimte-apparaat; stil in installeren', /terminal-inrichten\) vereis_root; vereis_node; exec bash "\$\(hulpscript apparaat-inrichten mijn-ruimte-apparaat\)" "\$@"/.test(inst) && /apparaat-inrichten:mijn-ruimte-apparaat/.test(inst) && /--bij-installeren "\$doel" \|\| waarschuwing/.test(inst) && /terminal-inrichten \[--gebruiker beheer\]/.test(inst));
    check('bash -n van beide scripts', spawnSync('bash', ['-n', resolve('deploy/installeer-app.sh')]).status === 0 && spawnSync('bash', ['-n', resolve('deploy/apparaat-inrichten.sh')]).status === 0);
  } finally { rmSync(T, { recursive: true, force: true }); }
  return einde();
}
