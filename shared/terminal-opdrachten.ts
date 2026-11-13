// Opdracht-terminal (zone G, 22.10.2026): de «Термінал» van het technisch profiel voert ÉÉN programma per regel uit op een eigen
// apparaat (de server zelf als `beheer`, of een Windows-pc met PowerShell) — zonder shell: de regel wordt HIER in woorden gesplitst
// (aanhalingstekens tellen, `| ; && > <` buiten aanhalingstekens zijn een fout), de agent start het programma met spawn(file, argv,
// {shell:false}). Alleen programma's uit de toegestane lijst van het apparaat (agent --allow …). Elke opdracht is «lezend» of
// «wijzigend» (tabel hieronder); wijzigende opdrachten vragen eerst een bevestiging op de site (per apparaat instelbaar: alleen
// wijzigende, of alle). PowerShell: de hele regel gaat als ÉÉN argument -Command naar powershell.exe — binnen PowerShell is de tekst
// willekeurig, dus daar is de bevestiging ALTIJD verplicht. Puur (geen React/DOM/Node): browser én server gebruiken dezelfde regels.
// Dezelfde tabel staat (gespiegeld, zonder import) in deploy/agent/agent.mjs (LEZEND); tests/eenheid/terminal-opdrachten-20261022
// houdt beide gelijk.
import type { HelpLagen } from './tech-rollen';

export type OpdrachtSoort = 'lezend' | 'wijzigend';
export type Bevestiging = 'wijzigend' | 'alles';
export const BEVESTIGINGEN: readonly Bevestiging[] = ['wijzigend', 'alles'];
export const isBevestiging = (v: unknown): v is Bevestiging => v === 'wijzigend' || v === 'alles';

/** Programma's die PowerShell aanduiden (de agent kiest zelf powershell.exe of pwsh). */
export const POWERSHELL_NAMEN: ReadonlySet<string> = new Set(['powershell', 'pwsh']);
/** Pseudo-opdracht die de werkmap wisselt (de agent controleert de map tegen zijn roots). */
export const CD = 'cd';

export const MAX_REGEL = 2000;
export const MAX_UITVOER = 256 * 1024;

/**
 * Standaardlijst voor de server als apparaat (deploy/apparaat-inrichten.sh --allow). Geen shells, geen sudo, geen editors
 * (interactief), geen curl/wget (netwerk vanaf de server; via fs.read is lezen genoeg). `mijn-ruimte-installeer` staat erop voor
 * `lijst` — de rest van dat programma eist root en faalt als beheer (NoNewPrivileges).
 */
export const STANDAARD_ALLOW_SERVER: readonly string[] = Object.freeze([
  'systemctl', 'journalctl', 'git', 'node', 'npm', 'ls', 'cat', 'tail', 'head', 'df', 'free', 'uptime', 'hostname', 'whoami', 'id',
  'date', 'stat', 'wc', 'du', 'ps', 'uname', 'pwd', 'grep', 'find', 'nproc', 'ip', 'ss', 'tar', 'sha256sum', 'podman', 'mijn-ruimte-installeer',
]);

/**
 * Lezende programma's en, per programma, wanneer ze lezend zijn. Een programma dat hier niet staat, of een werkwoord/vlag die niet past,
 * is «wijzigend» (= bevestiging): liever één klik te veel dan een stille wijziging. Lezende opdrachten lopen ZONDER bevestiging, dus wat
 * via een vlag code start of bestanden schrijft (find -exec/-delete, sort -o/--compress-program, tar -I/--checkpoint-action, sed, uniq
 * met uitvoerbestand) is hier nooit lezend.
 *   true                 → altijd lezend
 *   { nietMet: [...] }   → lezend zolang GEEN van deze argumenten voorkomt (ook `--x=…`, en een korte vlag aangeplakt/gebundeld: -ofile, -tK)
 *   { sub: [...] }       → lezend als het EERSTE niet-vlag-woord in de lijst staat (git status, systemctl is-active); zonder woord: lezend,
 *                          tenzij zonderSub:false (node zonder argumenten = REPL/script)
 *   { alleenMet: [...] } → lezend alleen met een van deze argumenten (tar -t…)
 *   { nietExact: [...] } → zoals nietMet, maar ALLEEN het exacte argument (of `x=…`), nooit gebundeld: voor programma's met lange
 *                          opties achter één streepje (`ip -batch` is schrijvend, `ip -brief` niet)
 * nietMet geldt ook naast sub/alleenMet (git … --output=bestand, tar -t … -I programma).
 * SEC-002 server-uitrol-09 (12.11.2026): vlaggen die een bestand schrijven, instellingen wijzigen of naar een ANDERE machine
 * verbinden zijn nooit lezend — tar --index-file/--one-top-level/-O, journalctl --cursor-file/-M, ss -D, systemctl -H/-M,
 * ip -batch, en bij `git branch` alles behalve een vaste lijst kijk-vlaggen (BRANCH_KIJK hieronder).
 * Spiegel: deploy/agent/agent.mjs LEZEND + opdrachtSoort (tests/eenheid/terminal-opdrachten-20261022 houdt ze gelijk).
 */
export type LezendRegel = true | { readonly sub?: readonly string[]; readonly zonderSub?: boolean; readonly nietMet?: readonly string[]; readonly nietExact?: readonly string[]; readonly alleenMet?: readonly string[] };
export const LEZEND: Readonly<Record<string, LezendRegel>> = Object.freeze({
  ls: true, cat: true, tail: true, head: true, df: true, free: true, uptime: true, whoami: true, id: true,
  stat: true, wc: true, du: true, ps: true, uname: true, pwd: true, grep: true, nproc: true, lscpu: true, lsblk: true,
  diff: true, cut: true, which: true, echo: true, 'sha256sum': true, 'md5sum': true, 'apt-cache': true,
  dir: true, type: true, where: true, tasklist: true, systeminfo: true, ver: true,
  hostname: { sub: [] },
  date: { nietMet: ['-s', '--set'] },
  find: { nietMet: ['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprint0', '-fprintf', '-fls'] },
  sort: { nietMet: ['-o', '--output', '--compress-program'] },
  tree: { nietMet: ['-o'] },
  file: { nietMet: ['-C', '--compile'] },
  dmesg: { nietMet: ['-C', '--clear', '-c', '--read-clear', '-D', '--console-off', '-E', '--console-on', '-n', '--console-level'] },
  ss: { nietMet: ['-K', '--kill', '-D', '--diag'] },
  ip: { nietMet: ['set', 'add', 'del', 'delete', 'change', 'replace', 'flush', 'append', 'prepend', 'restore', 'save', 'exec'], nietExact: ['-b', '-ba', '-bat', '-batc', '-batch', '--batch'] },
  ipconfig: { nietMet: ['/release', '/renew', '/flushdns', '/registerdns', '/release6', '/renew6', '/setclassid', '/setclassid6'] },
  git: { sub: ['status', 'log', 'diff', 'show', 'branch', 'remote', 'ls-files', 'rev-parse', 'describe', 'tag', 'blame', 'shortlog', 'ls-remote', 'reflog', 'worktree'], nietMet: ['--output', '--exec', '--upload-pack', '--receive-pack'] },
  systemctl: { sub: ['status', 'is-active', 'is-enabled', 'is-failed', 'is-system-running', 'list-units', 'list-timers', 'list-unit-files', 'list-dependencies', 'list-sockets', 'show', 'cat'], nietMet: ['-H', '--host', '-M', '--machine'] },
  journalctl: { nietMet: ['--vacuum-size', '--vacuum-time', '--vacuum-files', '--rotate', '--flush', '--sync', '--relinquish-var', '--smart-relinquish-var', '--setup-keys', '--update-catalog', '--cursor-file', '-M', '--machine', '--root', '--image'] },
  npm: { sub: ['ls', 'list', 'view', 'info', 'show', 'outdated', 'explain', 'why', 'ping', 'root', 'prefix', 'bin', '-v', '--version', 'version'] },
  node: { sub: ['-v', '--version', '-h', '--help'], zonderSub: false },
  podman: { sub: ['ps', 'images', 'logs', 'inspect', 'stats', 'top', 'version', 'info', 'port', 'diff', 'history', 'events', 'volume', 'network', 'pod', 'system'] },
  docker: { sub: ['ps', 'images', 'logs', 'inspect', 'stats', 'top', 'version', 'info', 'port', 'diff', 'history', 'events'] },
  'mijn-ruimte-installeer': { sub: ['lijst', 'apps-status'] },
  apt: { sub: ['list', 'search', 'show', 'policy'] }, 'apt-get': { sub: [] },
  tar: { alleenMet: ['-t', '--list', '-tf', '-tzf', '-tvf', '-tzvf', '-tjf', '-tJf'], nietMet: ['-I', '-F', '--use-compress-program', '--to-command', '--checkpoint-action', '--info-script', '--new-volume-script', '--rsh-command', '--rmt-command', '--index-file', '--one-top-level', '-O', '--to-stdout', '--record-file', '-g', '--listed-incremental', '--volno-file', '--remove-files'] },
});

const VOOR_SUB_VLAGGEN: readonly string[] = ['--no-pager', '--no-legend', '--plain', '--full', '-q', '--quiet'];
/** `git branch`: alleen deze vlaggen kijken. Al het andere (-u/--set-upstream-to, --unset-upstream, --edit-description, -c/-m/-d/-f, een naam) wijzigt. */
const BRANCH_KIJK: readonly string[] = ['--all', '--remotes', '--verbose', '--list', '--show-current', '--no-color', '--no-column', '--no-abbrev', '--color', '--column', '--abbrev'];
/** Vlaggen waarvan het VOLGENDE woord de waarde is (git neemt het dan nooit als taknaam): `--contains HEAD`, `--sort -committerdate`. */
const BRANCH_KIJK_MET_WAARDE: readonly string[] = ['--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--sort', '--format'];
const branchLezend = (rest: readonly string[]): boolean => {
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (BRANCH_KIJK.includes(a) || /^-[arvl]+$/.test(a)) continue;
    if ([...BRANCH_KIJK_MET_WAARDE, '--color', '--column', '--abbrev'].some((v) => a.startsWith(`${v}=`))) continue;
    if (BRANCH_KIJK_MET_WAARDE.includes(a)) { if (i + 1 < rest.length && (a === '--sort' || !rest[i + 1].startsWith('-'))) i++; continue; }
    return false;
  }
  return true;
};
/**
 * Een argument uit een «niet met»-lijst: exact, met `=waarde`, bij een korte vlag `-x` aangeplakt of gebundeld (`-ofile`, `-tK`), of —
 * SEC-002 server-uitrol-09 (toets g10a-1) — een AFKORTING van een lange vlag: GNU getopt_long (tar, journalctl, systemctl, ss, sort,
 * dmesg, date, file) en git nemen elk ondubbelzinnig voorvoegsel aan, dus `--index-fil=x`, `--checkpoint-ac=exec=…`, `--cursor-fi=x` en
 * `--hos=u@h` doen hetzelfde als de volle naam. Een lang argument telt daarom als treffer zodra een naam uit de lijst ermee BEGINT.
 * `vrij` = lange vlaggen die exact zo bestaan en lezend zijn (`tar --list` is geen afkorting van `--listed-incremental`).
 */
const raakt = (args: readonly string[], lijst?: readonly string[], vrij: readonly string[] = []): boolean => !!lijst && args.some((a) => {
  const kop = a.startsWith('--') ? a.split('=')[0] : '';
  return lijst.some((v) => a === v || a.startsWith(`${v}=`)
    || (/^-[A-Za-z]$/.test(v) && /^-[A-Za-z]/.test(a) && !a.startsWith('--') && a.slice(1).includes(v[1]))
    || (kop.length > 2 && v.startsWith('--') && v.startsWith(kop) && !vrij.includes(kop)));
});
/** Lezend of wijzigend. PowerShell en onbekende programma's zijn altijd wijzigend. */
export function opdrachtSoort(programma: string, args: readonly string[]): OpdrachtSoort {
  const naam = String(programma || '').replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|bat)$/i, '');
  if (POWERSHELL_NAMEN.has(naam.toLowerCase())) return 'wijzigend';
  const regel = LEZEND[naam];
  if (!regel) return 'wijzigend';
  if (regel === true) return 'lezend';
  if (raakt(args, regel.nietMet, regel.alleenMet)) return 'wijzigend';
  if (regel.nietExact) { const exact = regel.nietExact; if (args.some((a) => exact.some((v) => a === v || a.startsWith(`${v}=`)))) return 'wijzigend'; }
  if (regel.alleenMet) { const alleen = regel.alleenMet; return args.some((a) => alleen.includes(a)) ? 'lezend' : 'wijzigend'; }
  const sub = regel.sub;
  if (!sub) return 'lezend';
  // {sub}: het eerste niet-vlag-woord moet lezend zijn; onbekende globale vlaggen vóór het subcommando tellen als wijzigend
  // (voorkomt flag-value subcommand smuggling zoals `docker --log-level info rm x` of `git -C /pad push`).
  const eerste = args.find((a) => !a.startsWith('-')) ?? '';
  if (!eerste) return regel.zonderSub === false ? (args.length > 0 && args.every((a) => sub.includes(a)) ? 'lezend' : 'wijzigend') : 'lezend';
  if (!sub.includes(eerste)) return 'wijzigend';
  if (args.slice(0, args.indexOf(eerste)).some((a) => !VOOR_SUB_VLAGGEN.includes(a))) return 'wijzigend';
  if (naam === 'git' && eerste === 'branch') return branchLezend(args.slice(args.indexOf(eerste) + 1)) ? 'lezend' : 'wijzigend';
  if (['volume', 'network', 'pod', 'system', 'worktree', 'remote', 'branch', 'tag', 'stash', 'reflog', 'version'].includes(eerste)) {
    const tweede = args.slice(args.indexOf(eerste) + 1).find((a) => !a.startsWith('-')) ?? '';
    const lezendeTweede = ['ls', 'list', 'inspect', 'df', 'info', 'show', 'get-url', '-v', ''];
    const schrijvendeVlag = ['-d', '-D', '-m', '-M', '--delete', '--add', '--set-url', 'add', 'rm', 'remove', 'rename', 'prune', 'create', 'move', 'lock', 'unlock', 'repair', 'drop', 'pop', 'apply', 'push', 'clear', 'reset', 'migrate', 'expire'].some((v) => args.includes(v));
    return lezendeTweede.includes(tweede) && !schrijvendeVlag ? 'lezend' : 'wijzigend';
  }
  return 'lezend';
}

/** `git`, `git.exe`, `C:\x\git.exe` → `git` (de agent eist sowieso een kale programmanaam). */
export const programmaNaam = (p: string): string => String(p || '').replace(/^.*[\\/]/, '').replace(/\.(exe|cmd|bat)$/i, '');

export class OpdrachtFout extends Error { constructor(public code: string, public detail = '') { super(code); } }

/**
 * Eén regel → programma + argumenten, zonder shell. Dubbele en enkele aanhalingstekens groeperen; `\` ontsnapt buiten enkele
 * aanhalingstekens. Metatekens van een shell (| ; & > < $( ` ) buiten aanhalingstekens → OPDRACHT_SHELL_TEKEN: er is geen shell,
 * dus zouden ze letterlijk als argument gaan (en «git log | head» zou `|` en `head` aan git geven). Liever eerlijk weigeren.
 */
export function regelSplitsen(regel: string): string[] {
  const r = String(regel ?? '');
  if (r.length > MAX_REGEL) throw new OpdrachtFout('OPDRACHT_TE_LANG');
  if (/[\0\r\n]/.test(r)) throw new OpdrachtFout('OPDRACHT_ONGELDIG');
  const uit: string[] = [];
  let huidig = ''; let in1 = false; let in2 = false; let open = false;
  for (let i = 0; i < r.length; i++) {
    const c = r[i];
    if (in1) { if (c === "'") in1 = false; else huidig += c; continue; }
    if (in2) { if (c === '"') in2 = false; else if (c === '\\' && i + 1 < r.length && /["\\$`]/.test(r[i + 1])) huidig += r[++i]; else huidig += c; continue; }
    if (c === "'") { in1 = true; open = true; continue; }
    if (c === '"') { in2 = true; open = true; continue; }
    if (c === '\\' && i + 1 < r.length) { huidig += r[++i]; open = true; continue; }
    if (/\s/.test(c)) { if (huidig || open) { uit.push(huidig); huidig = ''; open = false; } continue; }
    if ('|;&<>`$(){}'.includes(c)) throw new OpdrachtFout('OPDRACHT_SHELL_TEKEN', c);
    huidig += c; open = true;
  }
  if (in1 || in2) throw new OpdrachtFout('OPDRACHT_AANHALINGSTEKEN');
  if (huidig || open) uit.push(huidig);
  return uit;
}

export type Ontleed = { programma: string; args: string[]; soort: OpdrachtSoort; powershell: boolean; cd: string | null };
/**
 * Regel ontleden voor een apparaat: `allow` = toegestane programma's van het apparaat, `powershell` = PowerShell aan op het apparaat.
 * Een PowerShell-apparaat zonder gewone allow-lijst neemt ELKE regel als PowerShell-tekst; met allow-lijst alleen als het eerste woord
 * powershell/pwsh is (dan is de rest de tekst). `cd <map>` is de pseudo-opdracht voor de werkmap.
 */
export function ontleed(regel: string, apparaat: { allow: readonly string[]; powershell: boolean }): Ontleed {
  const tekst = String(regel ?? '').trim();
  if (!tekst) throw new OpdrachtFout('OPDRACHT_LEEG');
  if (tekst.length > MAX_REGEL) throw new OpdrachtFout('OPDRACHT_TE_LANG');
  const eersteWoord = programmaNaam(tekst.split(/\s+/)[0]);
  if (eersteWoord === CD) {
    const w = regelSplitsen(tekst);
    if (w.length !== 2) throw new OpdrachtFout('OPDRACHT_CD', 'cd <map>');
    return { programma: CD, args: [w[1]], soort: 'lezend', powershell: false, cd: w[1] };
  }
  if (apparaat.powershell && (POWERSHELL_NAMEN.has(eersteWoord.toLowerCase()) || !apparaat.allow.length)) {
    const ps = POWERSHELL_NAMEN.has(eersteWoord.toLowerCase());
    const body = ps ? tekst.replace(/^\S+\s*/, '').trim() : tekst;
    if (!body) throw new OpdrachtFout('OPDRACHT_LEEG');
    return { programma: 'powershell', args: [body], soort: 'wijzigend', powershell: true, cd: null };
  }
  const w = regelSplitsen(tekst);
  const programma = programmaNaam(w[0]);
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(programma)) throw new OpdrachtFout('OPDRACHT_PROGRAMMA_ONGELDIG');
  if (w[0] !== programma && !/^[A-Za-z0-9._+-]+\.(exe|cmd|bat)$/i.test(w[0])) throw new OpdrachtFout('OPDRACHT_PAD', w[0]);
  if (POWERSHELL_NAMEN.has(programma.toLowerCase())) throw new OpdrachtFout('OPDRACHT_POWERSHELL_UIT');
  if (!apparaat.allow.includes(programma)) throw new OpdrachtFout('OPDRACHT_NIET_TOEGESTAAN', programma);
  const args = w.slice(1);
  return { programma, args, soort: opdrachtSoort(programma, args), powershell: false, cd: null };
}

/** Moet de site vóór het uitvoeren een bevestiging vragen? */
export const bevestigingNodig = (o: { soort: OpdrachtSoort; powershell: boolean; cd: string | null }, stand: Bevestiging): boolean =>
  !o.cd && (o.powershell || stand === 'alles' || o.soort === 'wijzigend');

/** Autodoploen: toegestane programma's en, voor een programma, zijn lezende werkwoorden. */
export function aanvullingen(regel: string, allow: readonly string[]): string[] {
  const t = String(regel ?? '');
  if (/\s/.test(t.trim()) === false) {
    const p = t.trim().toLowerCase();
    return [CD, ...allow].filter((a) => a.toLowerCase().startsWith(p) && a !== p).slice(0, 12);
  }
  const [prog, ...rest] = t.trim().split(/\s+/);
  const regelP = LEZEND[programmaNaam(prog)];
  if (!regelP || regelP === true || !regelP.sub || rest.length > 1) return [];
  const deel = (rest[0] ?? '').toLowerCase();
  return regelP.sub.filter((s) => s.startsWith(deel) && s !== deel && !s.startsWith('-')).map((s) => `${prog} ${s}`).slice(0, 12);
}

export const FOUT_TEKST: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  OPDRACHT_LEEG: ['Введіть команду.', 'Typ een opdracht.'],
  OPDRACHT_TE_LANG: ['Команда задовга (до 2000 символів).', 'Opdracht te lang (max. 2000 tekens).'],
  OPDRACHT_ONGELDIG: ['Команда містить недопустимі символи.', 'De opdracht bevat ongeldige tekens.'],
  OPDRACHT_SHELL_TEKEN: ['Без оболонки: символи | ; && > < $( ` не працюють. Одна програма за раз; візьміть аргумент у лапки, якщо символ потрібен буквально.', 'Geen shell: | ; && > < $( ` werken niet. Eén programma per regel; zet een argument tussen aanhalingstekens als het teken letterlijk moet.'],
  OPDRACHT_AANHALINGSTEKEN: ['Незакриті лапки.', 'Aanhalingsteken niet gesloten.'],
  OPDRACHT_CD: ['Використання: cd <тека>.', 'Gebruik: cd <map>.'],
  OPDRACHT_PROGRAMMA_ONGELDIG: ['Назва програми недопустима.', 'Ongeldige programmanaam.'],
  OPDRACHT_PAD: ['Лише назва програми, без шляху (наприклад git, а не /usr/bin/git).', 'Alleen de programmanaam, zonder pad (git, niet /usr/bin/git).'],
  OPDRACHT_POWERSHELL_UIT: ['PowerShell на цьому пристрої вимкнено (на пристрої: node agent.mjs terminal-config on --powershell).', 'PowerShell staat uit op dit apparaat (op het apparaat: node agent.mjs terminal-config on --powershell).'],
  OPDRACHT_NIET_TOEGESTAAN: ['Програми немає в дозволеному списку пристрою. Список задає власник пристрою в агенті (--allow).', 'Dit programma staat niet op de toegestane lijst van het apparaat (agent --allow).'],
  BEVESTIGING_VEREIST: ['Ця команда змінює систему — підтвердьте.', 'Deze opdracht wijzigt het systeem — bevestig.'],
  APPARAAT_NIET_GEVONDEN: ['Пристрій не знайдено.', 'Apparaat niet gevonden.'],
  APPARAAT_OFFLINE: ['Пристрій не на зв’язку.', 'Apparaat niet verbonden.'],
  TERMINAL_OPDRACHTEN_UIT: ['На пристрої не ввімкнено командний термінал: node agent.mjs terminal-config on --opdrachten (сервер: sudo mijn-ruimte-installeer terminal-inrichten).', 'Opdracht-terminal staat uit op het apparaat: node agent.mjs terminal-config on --opdrachten (server: sudo mijn-ruimte-installeer terminal-inrichten).'],
  TECH_TERMINAL_VEREIST: ['Потрібен активний технічний профіль із правом термінала.', 'Een actief technisch profiel met terminalrecht is nodig.'],
  TERMINAL_ALLEEN_TESTMACHINE: ['Ваша роль відкриває лише тестові машини.', 'Uw rol opent alleen testmachines.'],
  OPDRACHT_BEZIG: ['Попередня команда ще виконується.', 'De vorige opdracht loopt nog.'],
  OPDRACHT_TIJD: ['Час вийшов (60 с) — програму зупинено.', 'Tijd verstreken (60 s) — programma gestopt.'],
  OPDRACHT_NIET_GEVONDEN: ['Команду не знайдено.', 'Opdracht niet gevonden.'],
});

export const HELP_TERMINAL_OPDRACHT: HelpLagen = {
  wat: ['Командний термінал: одна програма на рядок виконується на вашому пристрої (сервер як beheer або ПК з PowerShell) — без оболонки, лише з дозволеного списку.', 'Opdracht-terminal: één programma per regel draait op uw apparaat (server als beheer of pc met PowerShell) — zonder shell, alleen uit de toegestane lijst.'],
  gevolg: ['Команди читання виконуються одразу; команди, що змінюють, спершу просять підтвердження. Вивід записується й доступний у «Історії».', 'Lezende opdrachten lopen meteen; wijzigende vragen eerst bevestiging. Uitvoer wordt opgenomen en staat in «Geschiedenis».'],
  risico: ['Агент працює без sudo (NoNewPrivileges) — межа безпеки = права користувача на пристрої. У PowerShell текст команди довільний: кожна команда підтверджується.', 'De agent draait zonder sudo (NoNewPrivileges) — de grens is wat die gebruiker op het apparaat mag. In PowerShell is de tekst willekeurig: elke opdracht wordt bevestigd.'],
  dev: ['Розбір рядка на сервері (shared/terminal-opdrachten.ts, без оболонки), підписана команда term.exec агенту (deploy/agent/agent.mjs: allow-list, прапорці інтерпретаторів, cwd у roots, PowerShell лише як -NoProfile -NonInteractive -Command <текст>), результат → app.terminal_opdrachten (0113). Не через чергу ШІ: людина — не грант. Альтернативи: інтерактивна оболонка на хості (відкинуто — обходить усі обмеження), контейнер (є як окремий режим).', 'Ontleding op de server (shared/terminal-opdrachten.ts, geen shell), ondertekend term.exec naar de agent (allow-lijst, interpreter-vlaggen, cwd in roots, PowerShell alleen als -NoProfile -NonInteractive -Command <tekst>), resultaat → app.terminal_opdrachten (0113). Niet via de AI-wachtrij. Alternatieven: shell op de host (afgewezen), container (eigen modus).'],
};
