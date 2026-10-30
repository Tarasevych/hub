// Beheer op afstand zonder root-pad voor de app (methode 1 GitOps-pull, methode 3 gepantserde opdracht):
//  (a) het GitOps-script weigert niet-ondertekende, verkeerd ondertekende, lichtgewicht en hernoemde tags en installeert alleen
//      een tag met de juiste handtekening (tijdelijke repo + tijdelijk ondertekenaarsbestand);
//  (b) het opdrachtscript weigert onbekende werkwoorden en extra argumenten, volgt de schakelaars en de 10-minutengrens;
//  (c) de polkit-regel (en de niet-geïnstalleerde sudo-noodoplossing) noemt alleen de vijf toegestane werkwoorden;
//  (d) plafond: geen root-script leest uit /srv/data/uploads of /srv/mijn-ruimte/mcp-staging;
//  (e) app: routes eigenaar + step-up, vaste unitnamen, root-gebeurtenissen → audit.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { checker } from './hulp/nep-google';

const GITOPS = 'deploy/gitops/gitops-ophalen.sh';
const OPDRACHT = 'deploy/opdracht/mijn-ruimte-opdracht.sh';
const POLKIT = 'deploy/opdracht/50-mijn-ruimte-opdracht.rules';
const SUDOERS = 'deploy/opdracht/mijn-ruimte-opdracht.sudoers';
const WERKWOORDEN = ['status', 'releases', 'backup', 'uitrol-nu', 'terugdraaien'];
const sh = (cmd: string, cwd?: string, env: Record<string, string> = {}) => spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
const lees = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');

function sleutel(map: string, naam: string) {
  const f = join(map, naam);
  const r = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'uitrol@mijn-ruimte', '-f', f], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ssh-keygen: ${r.stderr}`);
  return f;
}

function gitopsTests(check: (n: string, ok: boolean, i?: string) => void) {
  const T = mkdtempSync(join(tmpdir(), 'gitops-'));
  try {
    const k1 = sleutel(T, 'goed'); const k2 = sleutel(T, 'vreemd');
    writeFileSync(join(T, 'ondertekenaars'), `uitrol@mijn-ruimte namespaces="mijn-ruimte-uitrol,git" ${readFileSync(`${k1}.pub`, 'utf8').split(' ').slice(0, 2).join(' ')}\n`);
    const repo = join(T, 'repo');
    const G = (args: string, key?: string) => sh(`git -c user.name=t -c user.email=t@t.invalid -c gpg.format=ssh ${key ? `-c user.signingkey=${key}` : ''} ${args}`, repo);
    mkdirSync(join(repo, 'deploy'), { recursive: true });
    sh('git init -q', repo);
    writeFileSync(join(repo, 'deploy/installeer-app.sh'), '#!/bin/bash\necho "ECHTE INSTALLER MAG IN DE TEST NIET DRAAIEN"; exit 99\n');
    G('add -A'); G('commit -qm basis');
    G('tag -a uitrol-20990101-0000 -m niet-ondertekend');
    G('tag -s uitrol-20990101-0001 -m vreemd', k2);
    G('tag uitrol-20990101-0002');
    G('tag -s uitrol-20980101-0000 -m oud', k1);
    sh('git update-ref refs/tags/uitrol-20990101-0003 "$(git rev-parse uitrol-20980101-0000)"', repo);
    sh('git tag uitrol-niet-het-patroon', repo);

    writeFileSync(join(T, 'rechten.json'), JSON.stringify({ gitops: true }));
    writeFileSync(join(T, 'gitops.env'), `GITOPS_REPO=${repo}\n`); chmodSync(join(T, 'gitops.env'), 0o600);
    writeFileSync(join(T, 'installeer'), `#!/bin/bash\necho "$@" >> "${T}/installeer.log"; [ -f "$2/deploy/installeer-app.sh" ] && [ -f "$2/BRON-COMMIT" ] || exit 7; [ ! -e "${T}/faal" ]\n`);
    chmodSync(join(T, 'installeer'), 0o755);
    const env = { GITOPS_RECHTEN: join(T, 'rechten.json'), GITOPS_ENV: join(T, 'gitops.env'), GITOPS_ONDERTEKENAARS: join(T, 'ondertekenaars'),
      GITOPS_STAAT: join(T, 'staat'), GITOPS_STATUS_DIR: join(T, 'status'), GITOPS_INSTALLEER: join(T, 'installeer'), GITOPS_LOCK: join(T, 'lock'),
      GITOPS_INSTALLEER_LOCK: join(T, 'installeer.lock'), GITOPS_GROEP: sh('id -gn').stdout.trim() };
    const run = () => sh(`bash ${process.cwd()}/${GITOPS}`, T, env);
    const status = () => { try { return JSON.parse(readFileSync(join(T, 'status/gitops.json'), 'utf8')); } catch { return {}; } };
    const events = () => lees(join(T, 'status/gebeurtenissen.jsonl')).trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const installs = () => lees(join(T, 'installeer.log')).trim().split('\n').filter(Boolean);

    // Stand: er draait al een release van na de 'oude' tag (uitrol-20980101-0000 is geldig, maar ouder).
    mkdirSync(join(T, 'staat'), { recursive: true }); writeFileSync(join(T, 'staat/laatste-tag'), 'uitrol-20980601-0000\n');
    let r = run();
    const ev = events();
    check('gitops(a): niet-ondertekende, vreemde, lichtgewicht en hernoemde tags → niets geïnstalleerd', r.status === 0 && installs().length === 0 && status().code === 'GEEN_NIEUWE', `${r.stderr.slice(-400)}`);
    check('gitops(a): niet-ondertekende geannoteerde tag geweigerd', ev.some((e) => e.tag === 'uitrol-20990101-0000' && e.code === 'HANDTEKENING_ONGELDIG'));
    check('gitops(a): tag met een andere sleutel geweigerd', ev.some((e) => e.tag === 'uitrol-20990101-0001' && e.code === 'HANDTEKENING_ONGELDIG'));
    check('gitops(a): lichtgewicht tag geweigerd', ev.some((e) => e.tag === 'uitrol-20990101-0002' && e.code === 'NIET_ONDERTEKEND'));
    check('gitops(a): oude ondertekende tag onder een nieuwe naam geweigerd (naam in het tag-object telt)', ev.some((e) => e.tag === 'uitrol-20990101-0003' && e.code === 'NAAM_VERSCHILT'));
    check('gitops(a): meldingen tweetalig (uk + nl) via het root-gebeurtenissenbestand', ev.every((e) => e.bron === 'gitops' && e.uk && e.nl && /^\d{8}T\d{12}Z-[0-9a-f]{8}$/.test(e.id)));
    const aantal = ev.length;
    run();
    check('gitops(a): een geweigerde tag wordt maar één keer gemeld', events().length === aantal);

    G('tag -s uitrol-20990101-0004 -m goed', k1);
    r = run();
    const commit = sh('git rev-parse HEAD', repo).stdout.trim();
    check('gitops(a): correct ondertekende tag → installer met de geëxporteerde bron (BRON-COMMIT)', r.status === 0 && installs().length === 1 && status().code === 'OK'
      && lees(join(T, 'staat/laatste-tag')).trim() === 'uitrol-20990101-0004', r.stderr.slice(-400));
    check('gitops(a): BRON-COMMIT is de commit van de tag', r.stderr.includes(commit));
    run();
    check('gitops(a): dezelfde tag niet nog eens', installs().length === 1);

    // symlink in een ondertekende commit
    symlinkSync('/etc/shadow', join(repo, 'deploy/schaduw')); G('add -A'); G('commit -qm link');
    G('tag -s uitrol-20990101-0005 -m link', k1);
    r = run();
    check('gitops(a): ondertekende tag met een symlink in de boom → geweigerd, niet geïnstalleerd', installs().length === 1 && events().some((e) => e.tag === 'uitrol-20990101-0005' && e.code === 'INHOUD_ONVEILIG'), r.stderr.slice(-300));
    sh('git rm -q deploy/schaduw && git -c user.name=t -c user.email=t@t.invalid commit -qm weg', repo);

    // installatie mislukt → huidige release blijft, laatste-tag ongewijzigd, niet eindeloos opnieuw
    writeFileSync(join(T, 'faal'), '1');
    G('tag -s uitrol-20990101-0006 -m faalt', k1);
    r = run();
    check('gitops(a): mislukte installatie → laatste-tag ongewijzigd en melding INSTALLATIE_MISLUKT', r.status === 1 && lees(join(T, 'staat/laatste-tag')).trim() === 'uitrol-20990101-0004'
      && events().some((e) => e.code === 'INSTALLATIE_MISLUKT' && e.tag === 'uitrol-20990101-0006'));
    const n = installs().length; run();
    check('gitops(a): een mislukte tag wordt niet elke 5 minuten opnieuw gebouwd', installs().length === n);
    rmSync(join(T, 'faal'));

    // oudere ondertekende tag dan de geïnstalleerde: nooit
    writeFileSync(join(T, 'staat/laatste-tag'), 'uitrol-20990101-0009\n');
    G('tag -s uitrol-20990101-0007 -m ouder', k1);
    run();
    check('gitops(a): ondertekende tag ouder dan de geïnstalleerde wordt genegeerd', installs().length === n);

    // schakelaar uit → doet niets (ook geen fetch)
    writeFileSync(join(T, 'rechten.json'), JSON.stringify({ gitops: false }));
    G('tag -s uitrol-20990102-0000 -m nieuw', k1);
    r = run();
    check('gitops: schakelaar uit → status UIT, geen installatie', r.status === 0 && status().code === 'UIT' && installs().length === n);
    writeFileSync(join(T, 'rechten.json'), '{}');
    run();
    check('gitops: zonder "gitops": true staat het uit (standaard uit)', status().code === 'UIT' && installs().length === n);

    // alleen github.com (of lokaal in tests) als bron
    writeFileSync(join(T, 'rechten.json'), JSON.stringify({ gitops: true }));
    writeFileSync(join(T, 'gitops.env'), 'GITOPS_REPO=https://evil.example/hub.git\n');
    run();
    check('gitops: repository buiten github.com geweigerd', status().code === 'REPO_ONGELDIG');
    writeFileSync(join(T, 'gitops.env'), `GITOPS_REPO=${repo}\nGITOPS_TOKEN=$(id)\n`);
    run();
    check('gitops: gitops.env wordt niet als shell uitgevoerd (token met $(…) geweigerd)', status().code === 'TOKEN_ONGELDIG');
  } finally { rmSync(T, { recursive: true, force: true }); }
}

function opdrachtTests(check: (n: string, ok: boolean, i?: string) => void) {
  const T = mkdtempSync(join(tmpdir(), 'opdracht-'));
  try {
    mkdirSync(join(T, 'app/releases/20990101-000000/dist-server'), { recursive: true });
    mkdirSync(join(T, 'app/releases/20990102-000000/dist-server'), { recursive: true });
    writeFileSync(join(T, 'app/releases/20990101-000000/dist-server/start.mjs'), '');
    writeFileSync(join(T, 'app/releases/20990102-000000/dist-server/start.mjs'), '');
    writeFileSync(join(T, 'app/releases/20990102-000000/RELEASE-COMMIT'), 'abc123def\n');
    symlinkSync(join(T, 'app/releases/20990102-000000'), join(T, 'app/current'));
    writeFileSync(join(T, 'app/VORIGE'), join(T, 'app/releases/20990101-000000') + '\n');
    writeFileSync(join(T, 'systemctl'), `#!/bin/bash\necho "$@" >> "${T}/systemctl.log"; [ "$1" = is-active ] && echo active; exit 0\n`);
    writeFileSync(join(T, 'installeer'), `#!/bin/bash\necho "$@" >> "${T}/installeer.log"\n`);
    chmodSync(join(T, 'systemctl'), 0o755); chmodSync(join(T, 'installeer'), 0o755);
    const rechten = join(T, 'mcp-rechten.json');
    const env = { OPDRACHT_RECHTEN: rechten, OPDRACHT_STATUS_DIR: join(T, 'status'), OPDRACHT_STAAT: join(T, 'staat'), OPDRACHT_APP_ROOT: join(T, 'app'),
      OPDRACHT_UITROL_STAAT: join(T, 'uitrol'), OPDRACHT_GITOPS_STAAT: join(T, 'gitops'), OPDRACHT_SYSTEMCTL: join(T, 'systemctl'),
      OPDRACHT_INSTALLEER: join(T, 'installeer'), OPDRACHT_GROEP: sh('id -gn').stdout.trim() };
    const run = (...args: string[]) => spawnSync('bash', [`${process.cwd()}/${OPDRACHT}`, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
    const res = (w: string) => { try { return JSON.parse(readFileSync(join(T, `status/opdracht-${w}.json`), 'utf8')); } catch { return null; } };
    const sysLog = () => lees(join(T, 'systemctl.log')).trim().split('\n').filter((l) => l && !l.startsWith('is-active'));

    check('opdracht(b): zonder argument geweigerd (64)', run().status === 64);
    check('opdracht(b): extra argument geweigerd (64)', run('status', 'extra').status === 64 && run('terugdraaien', '20990101-000000').status === 64);
    for (const slecht of ['rm', 'status;id', '../status', 'STATUS', 'status ', '', '--help', 'uitrol_nu', 'terugdraaien\nstatus'])
      check(`opdracht(b): onbekend werkwoord ${JSON.stringify(slecht)} geweigerd (64)`, run(slecht).status === 64);
    check('opdracht(b): geweigerde aanroepen starten niets', sysLog().length === 0 && !existsSync(join(T, 'installeer.log')));

    let r = run('status');
    const st = res('status');
    check('opdracht: status → resultaat met actieve en vorige release', r.status === 0 && st?.uitkomst === 'ok' && st.gegevens.actief === '20990102-000000' && st.gegevens.vorige === '20990101-000000', r.stderr);
    r = run('releases');
    const rel = res('releases');
    check('opdracht: releases → lijst met commit en markeringen', r.status === 0 && rel?.gegevens.releases.length === 2 && rel.gegevens.releases[0].commit === 'abc123def' && rel.gegevens.releases[0].actief === true);
    run('backup');
    check('opdracht: backup start alleen mijn-ruimte-backup.service', JSON.stringify(sysLog()) === JSON.stringify(['start --no-block mijn-ruimte-backup.service']));
    run('uitrol-nu');
    check('opdracht: uitrol-nu start alleen de GitOps-, de pakket- en de goedkeuringsunit', JSON.stringify(sysLog().slice(1)) === JSON.stringify(['start --no-block mijn-ruimte-gitops.service', 'start --no-block mijn-ruimte-uitrol.service', 'start --no-block mijn-ruimte-goedkeuring.service']));

    r = run('terugdraaien');
    check('opdracht: terugdraaien staat standaard UIT (3)', r.status === 3 && res('terugdraaien')?.code === 'UIT' && !existsSync(join(T, 'installeer.log')));
    writeFileSync(rechten, JSON.stringify({ opdracht: { terugdraaien: true, backup: false } }));
    r = run('terugdraaien');
    check('opdracht: terugdraaien (aan) roept de root-installer aan met alleen "terugdraaien"', r.status === 0 && lees(join(T, 'installeer.log')).trim() === 'terugdraaien' && res('terugdraaien')?.uitkomst === 'ok', r.stderr);
    r = run('terugdraaien');
    check('opdracht: tweede terugdraaien binnen 10 minuten geweigerd (4)', r.status === 4 && res('terugdraaien')?.code === 'TE_SNEL' && lees(join(T, 'installeer.log')).trim().split('\n').length === 1);
    r = run('backup');
    check('opdracht: schakelaar backup=false → geweigerd (3)', r.status === 3 && sysLog().length === 4); // backup + uitrol-nu (gitops, uitrol, goedkeuring)
    writeFileSync(rechten, '{kapot');
    check('opdracht: onleesbaar rechtenbestand → alleen lezen (status ja, backup nee)', run('status').status === 0 && run('backup').status === 3);
    const ev = lees(join(T, 'status/gebeurtenissen.jsonl')).trim().split('\n').map((l) => JSON.parse(l));
    check('opdracht: weigeringen en acties staan in het auditkanaal', ev.some((e) => e.code === 'ONBEKEND') && ev.some((e) => e.code === 'TERUGGEDRAAID') && ev.some((e) => e.code === 'TE_SNEL') && ev.every((e) => e.bron === 'opdracht'));

    const src = lees(OPDRACHT);
    check('opdracht(b): als root wordt de hele omgeving gewist (ook test-overrides)', /compgen -e/.test(src) && /unset "\$v"/.test(src) && src.indexOf('compgen -e') < src.indexOf('RECHTEN="${OPDRACHT_RECHTEN'));
    check('opdracht(b): leest geen stdin', /exec <\/dev\/null/.test(src));
    check('opdracht: voert nooit iets uit /srv/mijn-ruimte/…/deploy uit (root-kopie van de installer)', !/current\/deploy|releases\/[^\n]*\/deploy|APP_ROOT[^\n]*deploy/.test(src) && /\/usr\/local\/sbin\/mijn-ruimte-installeer/.test(src));
  } finally { rmSync(T, { recursive: true, force: true }); }
}

function polkitTests(check: (n: string, ok: boolean, i?: string) => void) {
  const regels: Array<(a: unknown, s: unknown) => unknown> = [];
  const Result = { YES: 'yes', NO: 'no', NOT_HANDLED: null };
  vm.runInNewContext(lees(POLKIT), { polkit: { Result, addRule: (f: (a: unknown, s: unknown) => unknown) => regels.push(f) } });
  const besluit = (user: string, id: string, unit: string, verb = 'start') => regels[0]({ id, lookup: (k: string) => (k === 'unit' ? unit : k === 'verb' ? verb : undefined) }, { user });
  const M = 'org.freedesktop.systemd1.manage-units';
  check('polkit(c): precies één regel', regels.length === 1);
  check('polkit(c): mijnruimte mag de vijf opdrachtunits starten', WERKWOORDEN.every((w) => besluit('mijnruimte', M, `mijn-ruimte-opdracht@${w}.service`) === 'yes'));
  check('polkit(c): SSH-CA is één vaste unit (geen sjabloon)', besluit('mijnruimte', M, 'mijn-ruimte-ssh-ca.service') === 'yes' && besluit('mijnruimte', M, 'mijn-ruimte-ssh-ca@.service') === 'no' && besluit('mijnruimte', M, 'mijn-ruimte-ssh-ca@abc.service') === 'no' && besluit('mijnruimte', M, 'mijn-ruimte-ssh-ca.service', 'stop') === 'no');
  check('polkit(c): geen andere werkwoorden of units', ['rm', 'shell', 'status;id', 'install', ''].every((w) => besluit('mijnruimte', M, `mijn-ruimte-opdracht@${w}.service`) === 'no')
    && ['mijn-ruimte.service', 'mijn-ruimte-uitrol.service', 'mijn-ruimte-gitops.service', 'ssh.service', 'mijn-ruimte-opdracht@.service', 'mijn-ruimte-opdracht@status.socket'].every((u) => besluit('mijnruimte', M, u) === 'no'));
  check('polkit(c): alleen "start" (niet stop/restart/reload/enable)', ['stop', 'restart', 'reload', 'try-restart', 'reload-or-restart', 'enable', 'kill'].every((v) => besluit('mijnruimte', M, 'mijn-ruimte-opdracht@status.service', v) === 'no'));
  check('polkit(c): andere systemd-acties voor mijnruimte uitdrukkelijk nee', ['org.freedesktop.systemd1.manage-unit-files', 'org.freedesktop.systemd1.reload-daemon', 'org.freedesktop.systemd1.set-environment'].every((a) => besluit('mijnruimte', a, 'x') === 'no'));
  check('polkit(c): andere gebruikers niet behandeld', besluit('www-data', M, 'mijn-ruimte-opdracht@status.service') === null && besluit('root', M, 'mijn-ruimte-opdracht@terugdraaien.service') === null);
  const units = [...lees(POLKIT).matchAll(/"(mijn-ruimte-opdracht@[^"]*)"/g)].map((m) => m[1]).sort();
  check('polkit(c): bestand noemt alleen de vijf units', JSON.stringify(units) === JSON.stringify(WERKWOORDEN.map((w) => `mijn-ruimte-opdracht@${w}.service`).sort()), units.join(','));

  const sudo = lees(SUDOERS).split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  const cmnds = (sudo.find((l) => l.startsWith('Cmnd_Alias')) || '').replace(/^Cmnd_Alias\s+\w+\s*=\s*/, '').split(',').map((c) => c.trim());
  check('sudo-noodoplossing(c): exact vijf commando’s met elk één vast werkwoord, geen jokertekens', JSON.stringify(cmnds) === JSON.stringify(WERKWOORDEN.map((w) => `/usr/local/sbin/mijn-ruimte-opdracht ${w}`)) && !/[*?\[]/.test(sudo.join('\n')));
  check('sudo-noodoplossing(c): env_reset en secure_path, geen SETENV', sudo.some((l) => /env_reset/.test(l)) && sudo.some((l) => /secure_path=/.test(l)) && !/SETENV/.test(sudo.join('\n')));
  check('sudo-noodoplossing(c): de app-gebruiker krijgt alleen het alias', sudo.filter((l) => /\bmijnruimte\b.*ALL\s*=/.test(l)).length === 1 && /NOPASSWD:\s*MIJN_RUIMTE_OPDRACHT\s*$/.test(sudo.find((l) => /\bmijnruimte\b.*ALL\s*=/.test(l)) || ''));
  const visudo = spawnSync('bash', ['-c', `command -v visudo >/dev/null && visudo -cf ${SUDOERS}`], { encoding: 'utf8' });
  if (visudo.status !== 127 && /visudo/.test(spawnSync('bash', ['-c', 'command -v visudo'], { encoding: 'utf8' }).stdout)) check('sudo-noodoplossing(c): visudo -c', visudo.status === 0, visudo.stderr);
  const inst = lees('deploy/installeer-app.sh');
  check('sudo-noodoplossing: installer installeert het sudo-bestand NIET', !/mijn-ruimte-opdracht\.sudoers/.test(inst));
  const unit = lees('deploy/mijn-ruimte-opdracht@.service');
  check('unit: ExecStart alleen het root-script met %i', (unit.match(/^ExecStart=.*$/gm) || []).join() === 'ExecStart=/usr/local/sbin/mijn-ruimte-opdracht %i' && /StandardInput=null/.test(unit));
}

function plafond(check: (n: string, ok: boolean, i?: string) => void) {
  const zonderCommentaar = (t: string) => t.replace(/^\s*(#|\/\/).*$/gm, '');
  const rootScripts = [GITOPS, OPDRACHT, 'deploy/uitrol/mijn-ruimte-uitrol.sh', POLKIT, 'deploy/mijn-ruimte-gitops.service', 'deploy/mijn-ruimte-gitops.timer', 'deploy/mijn-ruimte-opdracht@.service', 'deploy/mijn-ruimte-uitrol.service', 'deploy/ssh-ca/mijn-ruimte-ssh-ca.sh', 'deploy/mijn-ruimte-ssh-ca.service', 'deploy/mijn-ruimte-ssh-ca.path'];
  for (const f of rootScripts) check(`plafond(d): ${f} leest niet uit /srv/data/uploads of mcp-staging`, existsSync(f) && !/\/srv\/data\/uploads|mcp-staging|UPLOADS_DIR/.test(zonderCommentaar(lees(f))));
  const inst = zonderCommentaar(lees('deploy/installeer-app.sh'));
  check('plafond(d): installer voert niets uit uploads of mcp-staging uit (alleen mappen maken/quarantaine/oude archieven wissen)',
    !/(bash|sh|source|python3|node|\.)\s+"?(\/srv\/data\/uploads|\$APP_ROOT\/mcp-staging)/.test(inst) && !/install[^\n]*(\/srv\/data\/uploads|mcp-staging)[^\n]*\/usr\/local/.test(inst));
  check('plafond: deploy/ wordt na het bouwen uit de bron hersteld vóór units/root-scripts worden geïnstalleerd',
    inst.indexOf('deploy_herstellen "$bron" "$doel"') > inst.indexOf('bouwen "$doel"') && inst.indexOf('deploy_herstellen "$bron" "$doel"') < inst.indexOf('units_installeren "$doel"\n  hulpscripts_installeren "$doel"\n  activeren'));
  // 21.10.2026: hulpscripts_installeren (mijn-ruimte-geheimen, -oauth-client …) staat tussen units en activeren — ook uit de release ($doel).
  check('plafond: root-scripts worden uit de release geïnstalleerd (niet uit current/)', /install -m 0755 -o root -g root "\$doel\/deploy\/opdracht\/mijn-ruimte-opdracht\.sh" \/usr\/local\/sbin\/mijn-ruimte-opdracht/.test(inst)
    && /"\$doel\/deploy\/gitops\/gitops-ophalen\.sh" \/usr\/local\/sbin\/mijn-ruimte-gitops/.test(inst) && /"\$doel\/deploy\/installeer-app\.sh" \/usr\/local\/sbin\/mijn-ruimte-installeer/.test(inst));
  const gitops = zonderCommentaar(lees(GITOPS));
  check('plafond: gitops controleert de handtekening vóór export en installatie', gitops.indexOf('verify-tag') > 0 && gitops.indexOf('verify-tag') < gitops.indexOf('archive --format=tar') && gitops.indexOf('archive --format=tar') < gitops.indexOf('installeren "$BRON"'));
  check('plafond: gitops met hooks uit, fsck aan, alleen https/ssh', /core\.hooksPath=\/dev\/null/.test(gitops) && /transfer\.fsckObjects=true/.test(gitops) && /protocol\.allow=never/.test(gitops));
  check('plafond: gitops pakt uit met filter="data" en alleen bestanden/mappen', /filter="data"/.test(gitops) && /m\.isfile\(\) or m\.isdir\(\)/.test(gitops));
  check('plafond: gitops leest gitops.env niet met source', !/^\s*(source|\.)\s+"?\$ENVBESTAND/m.test(gitops));
  check('plafond: gitops negeert pad-overrides als root', /unset GITOPS_RECHTEN GITOPS_ENV GITOPS_ONDERTEKENAARS/.test(gitops));
  const app = lees('deploy/mijn-ruimte.service');
  check('plafond: app-dienst houdt NoNewPrivileges=yes en heeft AF_UNIX voor D-Bus', /^NoNewPrivileges=yes/m.test(app) && /^RestrictAddressFamilies=.*AF_UNIX/m.test(app) && !/^PrivateUsers=yes/m.test(app));
  const backend = lees('backend/server-beheer.ts');
  check('plafond: app roept alleen systemctl start met een vaste unitnaam aan (execFile, geen shell)', /execFile\("\/usr\/bin\/systemctl"/.test(backend) && !/\bexec\(|execSync|spawn\(|shell:\s*true/.test(backend) && /mijn-ruimte-opdracht@\$\{w\}\.service/.test(backend));
}

async function appTests(check: (n: string, ok: boolean, i?: string) => void) {
  const { mcpConsoleRoutes } = await import('../../backend/mcp-console');
  const beheer = await import('../../backend/server-beheer');
  const { closePool } = await import('../../server/platform/pg');
  const T = mkdtempSync(join(tmpdir(), 'beheer-app-'));
  const oud = { MCP_RECHTEN_PAD: process.env.MCP_RECHTEN_PAD, OPDRACHT_STATUS_DIR: process.env.OPDRACHT_STATUS_DIR, UPLOADS_DIR: process.env.UPLOADS_DIR };
  process.env.MCP_RECHTEN_PAD = join(T, 'rechten.json'); process.env.OPDRACHT_STATUS_DIR = join(T, 'status'); process.env.UPLOADS_DIR = join(T, 'uploads');
  mkdirSync(join(T, 'status')); mkdirSync(join(T, 'uploads'));
  writeFileSync(process.env.MCP_RECHTEN_PAD, JSON.stringify({ read: true, opdracht: { terugdraaien: true } }));
  const aanroepen: string[][] = [];
  beheer.zetOpdrachtRunner(async (args) => {
    aanroepen.push(args);
    const unit = args[args.length - 1]; const w = unit.replace(/^mijn-ruimte-opdracht@/, '').replace(/\.service$/, '');
    writeFileSync(join(T, `status/opdracht-${w}.json`), JSON.stringify({ werkwoord: w, uitkomst: 'ok', code: 'OK', uk: 'u', nl: 'n', tijd: new Date().toISOString(), gegevens: { actief: '20990101-000000' } }));
    return { code: 0, stderr: '' };
  });
  const OWNER = `sb-owner-${randomUUID()}`; const USER = `sb-user-${randomUUID()}`;
  const users: Record<string, any> = { [OWNER]: { id: OWNER, role: 'owner', status: 'approved', email: 'o@x' }, [USER]: { id: USER, role: 'user', status: 'approved', email: 'u@x' } };
  let vers = false;
  const routes = mcpConsoleRoutes(async (event: any) => ({ user: users[event.who], service: 'mcp' }) as any,
    { stepUp: async () => (vers ? null : { statusCode: 403, headers: {}, body: JSON.stringify({ error: 'STEP_UP_REQUIRED' }) } as any) });
  const call = async (route: string, who: string, body: Record<string, unknown> = {}) => {
    const res: any = await routes[route][0]({ event: { who, headers: {} }, body } as any);
    let data: any = null; try { data = JSON.parse(res.body); } catch { data = null; }
    return { status: res.statusCode as number, data };
  };
  try {
    check('app(e): status voor een gewone gebruiker geweigerd', (await call('POST /api/mcp/server/lezen', USER, { werkwoord: 'status' })).status === 403 && aanroepen.length === 0);
    const s = await call('POST /api/mcp/server/lezen', OWNER, { werkwoord: 'status' });
    check('app(e): eigenaar leest status (wacht op het resultaat)', s.status === 200 && s.data.resultaat?.gegevens?.actief === '20990101-000000'
      && JSON.stringify(aanroepen[0]) === JSON.stringify(['start', '--no-ask-password', 'mijn-ruimte-opdracht@status.service']));
    check('app(e): lezen-route accepteert geen schrijvend werkwoord', (await call('POST /api/mcp/server/lezen', OWNER, { werkwoord: 'terugdraaien' })).status === 400
      && (await call('POST /api/mcp/server/lezen', OWNER, { werkwoord: 'status.service; id' })).status === 400);
    const n = aanroepen.length;
    check('app(e): uitrol-nu zonder step-up geweigerd', (await call('POST /api/mcp/server/uitrol-nu', OWNER)).status === 403 && aanroepen.length === n);
    check('app(e): terugdraaien zonder step-up geweigerd', (await call('POST /api/mcp/server/terugdraaien', OWNER, { bevestig: 'TERUGDRAAIEN' })).status === 403 && aanroepen.length === n);
    vers = true;
    check('app(e): terugdraaien zonder bevestigingstekst geweigerd', (await call('POST /api/mcp/server/terugdraaien', OWNER, {})).status === 400 && aanroepen.length === n);
    const u = await call('POST /api/mcp/server/uitrol-nu', OWNER);
    check('app(e): uitrol-nu met step-up start de unit zonder te wachten', u.status === 200 && JSON.stringify(aanroepen[n]) === JSON.stringify(['start', '--no-ask-password', '--no-block', 'mijn-ruimte-opdracht@uitrol-nu.service']));
    check('app(e): gewone gebruiker ook met step-up geweigerd', (await call('POST /api/mcp/server/uitrol-nu', USER)).status === 403);
    writeFileSync(process.env.MCP_RECHTEN_PAD!, JSON.stringify({ read: true, opdracht: { backup: false } }));
    const b = await call('POST /api/mcp/server/backup', OWNER);
    check('app(e): schakelaar uit in /etc → geweigerd zonder systemctl', b.status === 403 && /PERMISSION_OFF:opdracht\.backup/.test(JSON.stringify(b.data)) && aanroepen.length === n + 1);
    const perms = await call('POST /api/mcp/permissions', OWNER);
    check('app(e): rechtenoverzicht toont gitops en opdracht-schakelaars (alleen lezen)', perms.data.permissions['opdracht.backup'] === false && perms.data.permissions.gitops === false && perms.data.permissions['opdracht.terugdraaien'] === false && perms.data.readonly === true);
    vers = false;
    const tool = await call('POST /api/mcp/call', OWNER, { name: 'server_terugdraaien' });
    check('app(e): schrijvende serveropdracht niet als hulpmiddel (alleen op de site met step-up)', tool.status === 400 && /STEP_UP_REQUIRED/.test(tool.data.error));
    const ts = await call('POST /api/mcp/call', OWNER, { name: 'server_status' });
    check('app(e): server_status als alleen-lezen hulpmiddel', ts.status === 200 && ts.data.result?.actief === '20990101-000000');

    // root-gebeurtenissen → audit
    const regel = (id: string, code: string) => JSON.stringify({ id, tijd: new Date().toISOString(), bron: 'gitops', code, niveau: 'waarschuwing', uk: 'у', nl: 'n', tag: 'uitrol-20990101-0000' });
    writeFileSync(join(T, 'status/gebeurtenissen.jsonl'), [regel('20261008T120000000000Z-aaaaaaaa', 'HANDTEKENING_ONGELDIG'), 'kapot', JSON.stringify({ id: 'x', bron: 'gitops' }), regel('20261008T120001000000Z-bbbbbbbb', 'NIET_ONDERTEKEND')].join('\n') + '\n');
    if (process.env.DATABASE_URL_SYSTEM || process.env.DATABASE_URL) {
      const eerst = await beheer.neemRootGebeurtenissenOp({ ownerId: null });
      const tweede = await beheer.neemRootGebeurtenissenOp({ ownerId: null });
      check('app(e): root-gebeurtenissen één keer in de audit (kapotte regels overgeslagen)', eerst === 2 && tweede === 0, `${eerst}/${tweede}`);
    }
    check('app(e): parse weigert onbekende bron en vreemde id', beheer.parseRootGebeurtenissen([regel('20261008T120000000000Z-aaaaaaaa', 'X'), JSON.stringify({ id: '20261008T120000000000Z-cccccccc', bron: 'app' })].join('\n')).length === 1);
  } finally {
    beheer.zetOpdrachtRunner(null);
    for (const [k, v] of Object.entries(oud)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(T, { recursive: true, force: true });
    await closePool().catch(() => undefined);
  }
}

function sshNoteerTests(check: (n: string, ok: boolean, i?: string) => void) {
  const regel = (extra: Record<string, unknown>) => JSON.stringify({ id: '20261013T190100123456Z-bbbb2222', tijd: '2026-10-13T19:01:00.000Z', bron: 'uitrol', code: 'SSH_OK', niveau: 'info', uk: 'у', nl: 'n', tag: '20261013-220754', ...extra });
  return import('../../backend/server-beheer').then((beheer) => {
    const vuil = beheer.parseRootGebeurtenissen([
      regel({ herkomst: 'ssh', wie: 'beheer;id', pakket: '../etc', release: '20261013-220754', commit: 'abcdef1234567890', adres: '203.0.113.5' }),
      JSON.stringify({ id: '20261013T190200123456Z-cccc3333', bron: 'app', code: 'SSH_OK', herkomst: 'ssh' }),
      regel({ herkomst: 'handtekening', code: 'OK', tag: '20261008-150001' }).replace('"code":"SSH_OK"', '"code":"OK"'),
    ].join('\n'));
    const ssh = vuil.find((g) => g.code === 'SSH_OK');
    check('parse: SSH-regel houdt release, commit en adres; vieze wie en pakket vallen weg', !!ssh && ssh.herkomst === 'ssh' && ssh.release === '20261013-220754' && ssh.commit === 'abcdef1234567890' && ssh.adres === '203.0.113.5' && !ssh.wie && !ssh.pakket && vuil.length === 2, JSON.stringify(vuil));
    const tonen = beheer.toonbareInstallaties(vuil, ['20261008-150001']);
    check('geschiedenis: SSH blijft zichtbaar, geïnstalleerde handtekening niet dubbel', tonen.length === 1 && tonen[0].code === 'SSH_OK');
    check('geschiedenis: handtekening zonder voorstel wel', beheer.toonbareInstallaties(vuil, []).some((g) => g.herkomst === 'handtekening'));
    if (process.getuid?.() === 0) { check('noteer-proef: overgeslagen als root', true); return; }
    const dir = mkdtempSync(join(tmpdir(), 'ssh-noteer-'));
    const run = (args: string[], env: Record<string, string>) => spawnSync('bash', ['deploy/installeer-app.sh', 'noteer-proef', ...args], { encoding: 'utf8', env: { ...process.env, INSTALLEER_NOTEER_PROEF: '1', MIJN_RUIMTE_STATUS_DIR: dir, MIJN_RUIMTE_STATUS_GROEP: 'nogroup', ...env } });
    const dicht = spawnSync('bash', ['deploy/installeer-app.sh', 'noteer-proef', 'SSH_OK', '20261013-220754', '', ''], { encoding: 'utf8' });
    check('noteer-proef zonder testvlag geweigerd', dicht.status !== 0);
    const ok = run(['SSH_OK', '20261013-220754', '20261013-173658', '9a76e52123357ce8c1126124338e01cb996c763c'], { SUDO_USER: 'beheer', SSH_CONNECTION: '203.0.113.5 54321 203.0.113.10 22' });
    const regels = existsSync(join(dir, 'gebeurtenissen.jsonl')) ? readFileSync(join(dir, 'gebeurtenissen.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
    const status = existsSync(join(dir, 'status.json')) ? JSON.parse(readFileSync(join(dir, 'status.json'), 'utf8')) : {};
    const gelezen = beheer.parseRootGebeurtenissen(readFileSync(join(dir, 'gebeurtenissen.jsonl'), 'utf8'));
    check('SSH-installatie schrijft audit + status (methode ssh)', ok.status === 0 && regels.length === 1 && regels[0].herkomst === 'ssh' && regels[0].wie === 'beheer' && regels[0].pakket === '20261013-173658' && regels[0].release === '20261013-220754' && regels[0].adres === '203.0.113.5' && status.methode === 'ssh' && status.versie === '20261013-173658' && status.release === '20261013-220754' /* 0062: versie = pakket, release = map */ && /beheer/.test(regels[0].uk) && gelezen.length === 1 && gelezen[0].wie === 'beheer' && gelezen[0].pakket === '20261013-173658', `${ok.status} ${ok.stderr} ${JSON.stringify(regels[0] || {})}`);
    const vuilWie = run(['SSH_TERUG', '20261013-173926', '../etc/passwd', 'niet-een-commit'], { SUDO_USER: 'beheer;id', SSH_CONNECTION: '999.1.1.1 1 2 3' });
    const na = readFileSync(join(dir, 'gebeurtenissen.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    check('SSH-regel zuivert gebruiker, adres en pakket', vuilWie.status === 0 && na.length === 2 && na[1].code === 'SSH_TERUG' && na[1].wie === 'onbekend' && !na[1].adres && !na[1].pakket && !/beheer;id|\.\.\/etc/.test(na[1].uk), JSON.stringify(na[1]));
    const stil = run(['SSH_OK', '20261013-220755', '', ''], { MIJN_RUIMTE_UITROL_MODUS: 'passkey' });
    check('passkey-modus schrijft geen SSH-regel', stil.status === 0 && readFileSync(join(dir, 'gebeurtenissen.jsonl'), 'utf8').trim().split('\n').length === 2);
    rmSync(dir, { recursive: true, force: true });
  });
}

export async function main(): Promise<number> {
  const { check, einde } = checker('server-beheer');
  gitopsTests(check);
  opdrachtTests(check);
  polkitTests(check);
  plafond(check);
  await sshNoteerTests(check);
  await appTests(check);
  return einde();
}
