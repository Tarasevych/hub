// Opdracht-terminal (zone G, 22.10.2026): shared/terminal-opdrachten.ts (ontleden zonder shell, lezend/wijzigend, bevestiging),
// deploy/agent/agent.mjs term.exec (allow-lijst, interpreter-vlaggen, cwd in roots, alleen-lezen root alleen voor lezen, cd, PowerShell als
// vaste -Command-start zonder shell, ook via exec voor de AI) en backend/terminal-opdrachten.ts met de ECHTE database en een nagebootste
// agentverbinding door de echte gateway (onConnection): eigen apparaat, tech-profiel vereist, bevestiging, uitvoer opgenomen, een andere
// gebruiker ziet het apparaat noch de rijen (RLS), instelling per apparaat.
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { checker } from './hulp/nep-google';
import { aanvullingen, bevestigingNodig, LEZEND, ontleed, opdrachtSoort, regelSplitsen, STANDAARD_ALLOW_SERVER } from '../../shared/terminal-opdrachten';

const tab = () => randomBytes(24).toString('hex');
const weigert = async (f: () => Promise<unknown>, re: RegExp) => { try { await f(); return false; } catch (e) { return re.test((e as Error).message); } };
const code = async (p: Promise<unknown>) => { try { await p; return 'OK'; } catch (e) { const x = e as Error & { code?: string; status?: number }; return x.code ? `${x.code}/${x.status}` : `ANDERS:${x.message}`; } };

export async function main(): Promise<number> {
  const { check, einde } = checker('terminal-opdrachten-20261022');

  // ================================================================ 1. ontleden zonder shell
  check('splitsen: aanhalingstekens groeperen, \\ ontsnapt, lege quote blijft een argument', JSON.stringify(regelSplitsen(`git commit -m "een bericht" 'x y' a\\ b ""`)) === JSON.stringify(['git', 'commit', '-m', 'een bericht', 'x y', 'a b', '']));
  const shellTekens = ['git log | head', 'ls; rm -rf x', 'a && b', 'cat > x', 'echo $(id)', 'echo `id`', 'x || y', 'a < b'];
  check('shell-metatekens buiten aanhalingstekens → OPDRACHT_SHELL_TEKEN (geen shell: liever eerlijk weigeren)', shellTekens.every((r) => { try { regelSplitsen(r); return false; } catch (e) { return (e as Error).message === 'OPDRACHT_SHELL_TEKEN'; } }));
  check('…maar tussen aanhalingstekens zijn ze letterlijk (gaan als argument, zonder shell)', JSON.stringify(regelSplitsen(`grep "a|b;c" x`)) === JSON.stringify(['grep', 'a|b;c', 'x']));
  check('onafgesloten aanhalingsteken → OPDRACHT_AANHALINGSTEKEN', (() => { try { regelSplitsen('git log "x'); return false; } catch (e) { return (e as Error).message === 'OPDRACHT_AANHALINGSTEKEN'; } })());
  const server = { allow: [...STANDAARD_ALLOW_SERVER], powershell: false };
  const o1 = ontleed('systemctl status mijn-ruimte', server);
  check('ontleed: programma + args + soort', o1.programma === 'systemctl' && o1.args.join(' ') === 'status mijn-ruimte' && o1.soort === 'lezend' && !o1.powershell && o1.cd === null);
  check('buiten de toegestane lijst → OPDRACHT_NIET_TOEGESTAAN; met pad → OPDRACHT_PAD; bash/sudo → niet toegestaan',
    (() => { try { ontleed('curl https://x', server); return false; } catch (e) { return (e as Error).message === 'OPDRACHT_NIET_TOEGESTAAN'; } })()
    && (() => { try { ontleed('/usr/bin/git status', server); return false; } catch (e) { return (e as Error).message === 'OPDRACHT_PAD'; } })()
    && (() => { try { ontleed('sudo ls', server); return false; } catch (e) { return (e as Error).message === 'OPDRACHT_NIET_TOEGESTAAN'; } })()
    && (() => { try { ontleed('bash -c ls', server); return false; } catch (e) { return (e as Error).message === 'OPDRACHT_NIET_TOEGESTAAN'; } })());
  check('powershell op een server zonder PowerShell → OPDRACHT_POWERSHELL_UIT', (() => { try { ontleed('powershell Get-Service', server); return false; } catch (e) { return (e as Error).message === 'OPDRACHT_POWERSHELL_UIT'; } })());
  check('cd <map> is een pseudo-opdracht (lezend, zonder bevestiging)', (() => { const c = ontleed('cd /srv/mijn-ruimte', server); return c.cd === '/srv/mijn-ruimte' && c.programma === 'cd' && !bevestigingNodig(c, 'alles'); })());
  const pc = { allow: [] as string[], powershell: true };
  const ps = ontleed('Get-Service wuauserv | Select Status; Restart-Service x', pc);
  check('PowerShell-apparaat: de HELE regel is één -Command-tekst (met | en ; erin), altijd wijzigend, altijd bevestigen', ps.powershell && ps.programma === 'powershell' && ps.args.length === 1 && ps.args[0] === 'Get-Service wuauserv | Select Status; Restart-Service x' && ps.soort === 'wijzigend' && bevestigingNodig(ps, 'wijzigend'));
  check('PowerShell naast een allow-lijst: alleen als het eerste woord powershell/pwsh is; de rest is de tekst', (() => { const x = ontleed('pwsh Get-Date', { allow: ['git'], powershell: true }); const y = ontleed('git status', { allow: ['git'], powershell: true }); return x.powershell && x.args[0] === 'Get-Date' && !y.powershell && y.programma === 'git'; })());

  // ================================================================ 2. lezend / wijzigend
  const L = (r: string) => { const o = ontleed(r, { allow: [...STANDAARD_ALLOW_SERVER, 'sed', 'docker', 'apt', 'sort', 'dmesg', 'file', 'tree', 'uniq'], powershell: false }); return o.soort; };
  const LEZ = ['ls -la', 'cat x', 'df -h', 'journalctl -u mijn-ruimte -n 50', 'journalctl -o json -u x', 'git status', 'git log --oneline -5', 'git diff', 'git remote -v', 'git branch -a', 'git reflog', 'systemctl status mijn-ruimte', 'systemctl is-active caddy', 'systemctl list-timers', 'npm ls', 'npm version', 'node -v', 'podman ps -a', 'podman volume ls', 'tar -tzf x.tgz', 'mijn-ruimte-installeer lijst', 'apt list --upgradable',
    "find . -name '*.log'", 'sort -n x', 'ss -tlnp', 'ip a', 'ip route get 1.1.1.1', 'date', 'hostname', 'hostname -I', 'dmesg -T', 'tree -L 2', 'file x'];
  const WIJZ = ['git pull', 'git push', 'git checkout x', 'systemctl restart mijn-ruimte', 'systemctl stop x', 'systemctl enable x', 'npm install', 'npm run build', 'npm version patch', 'node script.js', 'podman rm x', 'tar -xzf x.tgz', 'sed -i s/a/b/ x', 'sed -n 1p x', 'journalctl --vacuum-time=1d', 'journalctl --setup-keys', 'mijn-ruimte-installeer installeren /x', 'apt install y', 'git remote add o u', 'git branch -d x', 'git reflog expire --all', 'git diff --output=x', 'podman volume rm v',
    'find . -delete', "find . -exec rm -f '{}' +", 'sort -o uit x', 'sort -nouit x', 'sort --compress-program=gzip x', 'uniq a b', 'tar -tzf x.tgz -I prog', 'tar -tzf x.tgz --checkpoint-action=exec=id', 'ss -K dst 1.2.3.4', 'ip link set eth0 down', 'ip netns exec x id', 'date -s 2020-01-01', 'hostname nieuw', 'dmesg -C', 'file -C -m x', 'tree -o x'];
  const misLez = LEZ.filter((r) => L(r) !== 'lezend'), misWijz = WIJZ.filter((r) => L(r) !== 'wijzigend');
  check(`lezend (${LEZ.length}): ls, cat, df, journalctl -u/-o, git status/log/diff/reflog, systemctl status, npm ls/version, node -v, podman ps, tar -tzf, find zonder -exec, sort zonder -o, ss, ip a, date, hostname, dmesg -T, tree, file`, misLez.length === 0, misLez.join(' | '));
  check(`wijzigend (${WIJZ.length}): git pull/push, systemctl restart, npm install/version patch, node script.js, tar -x, sed (altijd: e/w-commando’s), find -exec/-delete, sort -o/--compress-program, uniq a b, tar -I/--checkpoint-action, ss -K, ip link set / netns exec, date -s, hostname NAAM, dmesg -C, file -C, tree -o, git reflog expire, git diff --output`, misWijz.length === 0, misWijz.join(' | '));
  // SEC-002 server-uitrol-09 (12.11.2026): vlaggen die een bestand schrijven, instellingen wijzigen of naar een andere machine gaan.
  const SEC002_WIJZ = ['tar -tf a.tar --index-file=x', 'tar -tf a.tar --one-top-level=x', 'journalctl --cursor-file=x', 'ss -D x', 'git branch --set-upstream-to=origin/x', 'git branch --edit-description', 'git branch --unset-upstream', 'systemctl status -H u@h', 'systemctl status --machine=x', 'ip -batch x'];
  const SEC002_LEZ = ['git branch --show-current', 'git branch --contains HEAD', 'git branch -vv', 'ip -br a', 'tar -tvf a.tar'];
  check('SEC-002 server-uitrol-09: tar --index-file, journalctl --cursor-file, ss -D, git branch --set-upstream-to/--edit-description, systemctl -H, ip -batch → wijzigend; kijk-vlaggen blijven lezend',
    SEC002_WIJZ.every((r) => L(r) === 'wijzigend') && SEC002_LEZ.every((r) => L(r) === 'lezend'), [...SEC002_WIJZ.filter((r) => L(r) !== 'wijzigend'), ...SEC002_LEZ.filter((r) => L(r) !== 'lezend')].join(' | '));
  check('onbekend programma op de allow-lijst (niet in de tabel) → wijzigend (liever één klik te veel)', opdrachtSoort('mijnscript', []) === 'wijzigend' && opdrachtSoort('powershell', ['Get-Date']) === 'wijzigend');
  check('bevestigingNodig: wijzigend altijd; lezend alleen bij stand «alles»', bevestigingNodig(ontleed('git pull', server), 'wijzigend') && !bevestigingNodig(ontleed('git status', server), 'wijzigend') && bevestigingNodig(ontleed('git status', server), 'alles'));
  check('autodoploen: programma’s en lezende werkwoorden', aanvullingen('sys', server.allow).includes('systemctl') && aanvullingen('git st', server.allow).includes('git status') && aanvullingen('git pu', server.allow).length === 0);

  // ================================================================ 3. de agent (echte agent.mjs, lokaal)
  const werk = mkdtempSync(join(tmpdir(), 'term-opdr-'));
  const bin = join(werk, 'bin'); mkdirSync(bin);
  // Nep-pwsh: toont zijn argumenten één per regel, zodat we zien dat er GEEN shell tussen zit en de tekst één argument is.
  writeFileSync(join(bin, 'pwsh'), '#!/bin/sh\nprintf "n=%s\\n" "$#"\nfor a in "$@"; do printf "[%s]\\n" "$a"; done\npwd\n'); chmodSync(join(bin, 'pwsh'), 0o755);
  process.env.PATH = `${bin}:${process.env.PATH}`;
  const rw = join(werk, 'thuis'), ro = join(werk, 'srv');
  mkdirSync(join(rw, 'sub'), { recursive: true }); mkdirSync(join(ro, 'current'), { recursive: true });
  writeFileSync(join(rw, 'meta.js'), 'console.log(process.argv.slice(2).join("|"))');
  writeFileSync(join(ro, 'current', 'leesmij.txt'), 'hoi');
  writeFileSync(join(rw, '.env'), 'GEHEIM=1');
  const agent = await import(pathToFileURL(resolve('deploy/agent/agent.mjs')).href);
  const { handlers } = agent;
  check('agent: LEZEND-tabel is een exacte spiegel van shared/terminal-opdrachten.ts', JSON.stringify(agent.LEZEND) === JSON.stringify(LEZEND));
  const spiegelMis = [...LEZ, ...WIJZ, 'C:\\x\\git.exe status', 'powershell Get-Date'].filter((r) => { const w = regelSplitsen(r); return agent.opdrachtSoort(w[0], w.slice(1)) !== opdrachtSoort(w[0], w.slice(1)); });
  check(`agent: opdrachtSoort geeft voor alle ${LEZ.length + WIJZ.length + 2} voorbeelden dezelfde uitkomst als de site`, spiegelMis.length === 0, spiegelMis.join(' | '));
  const uit = { roots: [rw, ro], readonlyRoots: [ro], allow: ['node', 'ls', 'cat'], terminal: { enabled: true, opdrachten: false, container: false } };
  const cfg = { roots: [rw, ro], readonlyRoots: [ro], allow: ['node', 'ls', 'cat'], terminal: { enabled: true, opdrachten: true, container: false } };
  check('term.exec: uit op het apparaat → geweigerd', await weigert(() => handlers['term.exec'](uit, { command: 'ls', args: [], cwd: rw }), /switched off/));
  const r1 = await handlers['term.exec'](cfg, { command: 'ls', args: ['current'], cwd: ro });
  check('term.exec: lezende opdracht in een ALLEEN-LEZEN root werkt (ls in /srv)', r1.code === 0 && /leesmij\.txt/.test(r1.stdout) && r1.soort === 'lezend' && r1.cwd === ro, JSON.stringify(r1).slice(0, 200));
  check('term.exec: wijzigende opdracht in een alleen-lezen root geweigerd (node script.js in /srv)', await weigert(() => handlers['term.exec'](cfg, { command: 'node', args: ['../thuis/meta.js'], cwd: ro }), /read-only root/));
  const r2 = await handlers['term.exec'](cfg, { command: 'node', args: ['meta.js', 'a;b && c | d', '$(id)'], cwd: rw });
  check('term.exec: shell-tekens in argumenten gaan letterlijk (geen shell)', r2.code === 0 && r2.stdout.trim() === 'a;b && c | d|$(id)', r2.stdout);
  check('term.exec: buiten de allow-lijst, met pad, node -e, cwd buiten de roots, argument naar .env → geweigerd',
    await weigert(() => handlers['term.exec'](cfg, { command: 'git', args: ['status'], cwd: rw }), /allow-list/)
    && await weigert(() => handlers['term.exec'](cfg, { command: '/bin/ls', args: [], cwd: rw }), /bare program name/)
    && await weigert(() => handlers['term.exec'](cfg, { command: 'node', args: ['-e', '1'], cwd: rw }), /runs code from text/)
    && await weigert(() => handlers['term.exec'](cfg, { command: 'ls', args: [], cwd: werk }), /outside allowed roots/)
    && await weigert(() => handlers['term.exec'](cfg, { command: 'cat', args: ['.env'], cwd: rw }), /protected secret/));
  const cd1 = await handlers['term.exec'](cfg, { command: 'cd', args: ['sub'], cwd: rw });
  check('term.exec: cd naar een submap binnen de roots → nieuwe cwd; cd buiten de roots of naar een bestand → geweigerd', cd1.cwd === join(rw, 'sub')
    && await weigert(() => handlers['term.exec'](cfg, { command: 'cd', args: ['..'], cwd: rw }), /outside allowed roots/)
    && await weigert(() => handlers['term.exec'](cfg, { command: 'cd', args: ['meta.js'], cwd: rw }), /not a directory/));
  check('term.exec: shells blijven onmogelijk, ook op de allow-lijst (bash, sh)', await weigert(() => handlers['term.exec']({ ...cfg, allow: ['bash'] }, { command: 'bash', args: ['-c', 'id'], cwd: rw }), /shell/));
  check('term.exec: PowerShell uit → geweigerd (ook als exec-pad)', await weigert(() => handlers['term.exec'](cfg, { command: 'powershell', args: ['Get-Date'], cwd: rw }), /PowerShell is switched off/)
    && await weigert(() => handlers.exec(cfg, { command: 'powershell', args: ['Get-Date'], cwd: '.' }), /shell/));
  const pcfg = { roots: [rw], allow: [] as string[], terminal: { enabled: true, powershell: true, container: false } };
  const p1 = await handlers['term.exec'](pcfg, { command: 'powershell', args: ['Get-Service x | Where Status -eq Running; Restart-Service y'], cwd: rw });
  check('term.exec PowerShell: pwsh -NoProfile -NonInteractive -Command <tekst als ÉÉN argument>, cwd = root, zonder shell', p1.code === 0 && /^n=4$/m.test(p1.stdout) && /\[-NoProfile\]\n\[-NonInteractive\]\n\[-Command\]\n\[Get-Service x \| Where Status -eq Running; Restart-Service y\]/.test(p1.stdout) && p1.stdout.trim().endsWith(rw), p1.stdout);
  const p2 = await handlers.exec(pcfg, { command: 'pwsh', args: ['Get-Date', '-Format', 'o'], cwd: '.' });
  check('exec (AI, uitvoeren_opdracht) met PowerShell aan: dezelfde vaste start, argumenten samengevoegd tot één tekst', p2.code === 0 && /\[Get-Date -Format o\]/.test(p2.stdout) && /^n=4$/m.test(p2.stdout), p2.stdout);
  check('exec PowerShell: cwd buiten de roots geweigerd', await weigert(() => handlers.exec(pcfg, { command: 'powershell', args: ['x'], cwd: werk }), /outside allowed roots/));
  // CLI: terminal-config met de nieuwe vlaggen
  const { execFileSync } = await import('node:child_process');
  const cfgPad = join(werk, 'agent-config.json');
  writeFileSync(cfgPad, JSON.stringify({ server: 'https://x.invalid', roots: [rw], allow: ['git'] }));
  const cli = (...a: string[]) => execFileSync(process.execPath, [resolve('deploy/agent/agent.mjs'), ...a], { env: { ...process.env, HUB_AGENT_CONFIG: cfgPad }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const u1 = cli('terminal-config', 'on', '--opdrachten', '--geen-container');
  const c1 = JSON.parse(readFileSync(cfgPad, 'utf8')).terminal;
  check('CLI terminal-config on --opdrachten --geen-container: enabled, opdrachten, geen container, geen powershell; melding noemt de allow-lijst', c1.enabled && c1.opdrachten && c1.container === false && !c1.powershell && /git/.test(u1) && /Командний термінал/.test(u1), JSON.stringify(c1));
  cli('terminal-config', 'on', '--powershell', '--geen-container');
  check('CLI --powershell: powershell aan', JSON.parse(readFileSync(cfgPad, 'utf8')).terminal.powershell === true);
  writeFileSync(cfgPad, JSON.stringify({ server: 'https://x.invalid', roots: [rw], allow: [] }));
  check('CLI --opdrachten zonder allow-lijst → weigering', (() => { try { cli('terminal-config', 'on', '--opdrachten', '--geen-container'); return false; } catch (e) { return /allow/.test(String((e as { stderr?: string }).stderr)); } })());
  check('agent-capabilities: term.exec alleen met opdrachten/powershell; gebruiker@host erbij', (() => { const b = readFileSync(resolve('deploy/agent/agent.mjs'), 'utf8'); return /k !== 'term\.exec' \|\| \(t\.enabled && \(t\.opdrachten \|\| t\.powershell\)\)/.test(b) && /gebruiker: \(\(\) => \{ try \{ return os\.userInfo\(\)\.username/.test(b) && /host: os\.hostname\(\)/.test(b); })());
  check('COMMAND_TYPES (AI-wachtrij) kent term.exec niet', !/'term\.exec'/.test(/export const COMMAND_TYPES = \[([\s\S]*?)\] as const;/.exec(readFileSync(resolve('backend/connectors-gateway.ts'), 'utf8'))?.[1] ?? 'term.exec'));

  // ================================================================ 4. de server: echte database, echte gateway, echte agent-handler
  const { getPool, appRolActief } = await import('../../server/platform/pg');
  const sys = getPool('systeem');
  const tp = await import('../../backend/tech-profiel');
  const store = await import('../../backend/connectors-opslag');
  const gw = await import('../../backend/connectors-gateway');
  await import('../../backend/terminal'); // registreert de terminalhooks (vanAgent)
  const opdr = await import('../../backend/terminal-opdrachten');
  const term = await import('../../backend/terminal');
  const { sha256 } = await import('../../backend/connectors-crypto');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string, role = 'user', status = 'approved') => { const id = randomUUID(); await sys.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status, name: `Тест ${email.split('@')[0]}` }]); return { id, email, role, status }; };
  const bestaand = (await sys.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const eig = bestaand ? { id: String(bestaand.id), email: String(bestaand.email), role: 'owner', status: 'approved' } : await mk(String(process.env.OWNER_EMAIL || 'eigenaar@eenheid.test'), 'owner');
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  const beh = await mk(`beh-${sfx}@eenheid.test`), ander = await mk(`ander-${sfx}@eenheid.test`);
  const ids = [beh.id, ander.id];
  const agentIds: string[] = [];
  const oudLegacy = process.env.AGENT_WS_TOKEN_AUTH_LEGACY; delete process.env.AGENT_WS_TOKEN_AUTH_LEGACY;
  class NepWs extends EventEmitter { sent: any[] = []; readyState = 1; send(t: string) { this.sent.push(JSON.parse(t)); } close() { this.emit('close'); } terminate() { this.emit('close'); } }
  const wacht = async (f: () => boolean, ms = 5000) => { const tot = Date.now() + ms; while (!f() && Date.now() < tot) await new Promise((r) => setTimeout(r, 25)); return f(); };
  try {
    const tE = tab(), tB = tab();
    await tp.activeren(eig, tE, 60, 'terminal test');
    // Apparaat van de eigenaar: server (technisch, opdrachten) — capabilities zoals agent 0.8.0 ze stuurt.
    const token = randomBytes(24).toString('base64url');
    const capsServer = { version: '0.8.0', roots: [rw, ro], readonlyRoots: [ro], allowCommands: ['node', 'ls', 'cat'], gebruiker: 'beheer', host: 'vm', terminal: { enabled: true, container: false, opdrachten: true, powershell: false, maxMinuten: 60, test: false } };
    const srv = await store.createAgent(eig.id, 'vm · сервер (beheer)', 'linux-x64', sha256(token), capsServer, undefined, { ruimte: 'technisch', version: '0.8.0' });
    agentIds.push(srv.id);
    const lijstVoor = await term.apparaten(eig, tE);
    const rijS = lijstVoor.find((a) => a.id === srv.id);
    check('apparaten: server-apparaat met opdrachten, gebruiker@host, allow-lijst, ruimte technisch, offline tot de agent verbindt', !!rijS && rijS.opdrachten && !rijS.powershell && !rijS.terminal && rijS.gebruiker === 'beheer' && rijS.host === 'vm' && rijS.allow.join() === 'node,ls,cat' && rijS.ruimte === 'technisch' && rijS.online === false && rijS.bevestiging === 'wijzigend', JSON.stringify(rijS));
    check('opdracht op een apparaat dat niet verbonden is → APPARAAT_OFFLINE/409', (await code(opdr.opdracht(eig, tE, { agentId: srv.id, regel: 'ls', cwd: '', bevestigd: false }))) === 'APPARAAT_OFFLINE/409');
    // Echte gateway: nagebootste WebSocket met de ECHTE agent-handler erachter.
    const ws = new NepWs();
    gw.onConnection(ws as any);
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'auth', token, version: '0.8.0', capabilities: capsServer })));
    check('gateway: agent verbonden (ready)', await wacht(() => ws.sent.some((m) => m.t === 'ready' && m.agentId === srv.id)) && gw.agentOnline(srv.id));
    const ontvangen: any[] = [];
    const agentLus = async (m: any) => {
      if (m.t !== 'cmd') return;
      ontvangen.push(m);
      try { const data = await handlers[m.type](cfg, m.params ?? {}); ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: m.id, ok: true, data }))); }
      catch (e) { ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: m.id, ok: false, error: (e as Error).message }))); }
    };
    const origSend = ws.send.bind(ws);
    ws.send = (t: string) => { origSend(t); void agentLus(JSON.parse(t)); };

    const r = await opdr.opdracht(eig, tE, { agentId: srv.id, regel: 'ls current', cwd: ro, bevestigd: false }) as any;
    check('lezende opdracht: meteen uitgevoerd (geen bevestiging), uitvoer terug, opgenomen in app.terminal_opdrachten', r.klaar === true && r.staat === 'klaar' && r.code === 0 && /leesmij\.txt/.test(r.uitvoer) && r.soort === 'lezend' && r.bevestigd === false, JSON.stringify(r).slice(0, 300));
    const db1 = (await sys.query('SELECT staat, uitvoer, programma, args, soort, cwd FROM app.terminal_opdrachten WHERE id = $1', [r.id])).rows[0];
    check('rij: staat klaar, uitvoer bewaard, programma/args zoals ontleed, cwd = werkmap van de agent', db1?.staat === 'klaar' && /leesmij/.test(db1.uitvoer) && db1.programma === 'ls' && JSON.stringify(db1.args) === '["current"]' && db1.cwd === ro, JSON.stringify(db1));
    check('de agent kreeg een ONDERTEKEND-formaat cmd term.exec (id = rij-id, scope terminal), niet via de AI-wachtrij (geen rij in agent_commands)', ontvangen.some((m) => m.type === 'term.exec' && m.id === r.id && m.scope?.capability === 'terminal') && Number((await sys.query('SELECT count(*)::int AS n FROM app.agent_commands WHERE agent_id = $1', [srv.id])).rows[0].n) === 0);
    const w = await opdr.opdracht(eig, tE, { agentId: srv.id, regel: 'node meta.js x', cwd: rw, bevestigd: false }) as any;
    check('wijzigende opdracht zonder bevestiging → {bevestiging:true} en NIETS uitgevoerd', w.bevestiging === true && w.soort === 'wijzigend' && w.programma === 'node' && !ontvangen.some((m) => m.params?.command === 'node'));
    const w2 = await opdr.opdracht(eig, tE, { agentId: srv.id, regel: 'node meta.js "a;b" c', cwd: rw, bevestigd: true }) as any;
    check('met bevestigd:true: uitgevoerd, bevestigd in de rij, argumenten letterlijk (geen shell)', w2.klaar && w2.staat === 'klaar' && w2.bevestigd === true && w2.uitvoer.trim() === 'a;b|c', JSON.stringify(w2).slice(0, 200));
    const cdr = await opdr.opdracht(eig, tE, { agentId: srv.id, regel: 'cd sub', cwd: rw, bevestigd: false }) as any;
    check('cd: nieuwe werkmap terug (rij.cwd) zonder bevestiging', cdr.klaar && cdr.programma === 'cd' && cdr.cwd === join(rw, 'sub'), JSON.stringify(cdr).slice(0, 200));
    const fouten = await Promise.all([
      code(opdr.opdracht(eig, tE, { agentId: srv.id, regel: 'git status', cwd: rw, bevestigd: false })),
      code(opdr.opdracht(eig, tE, { agentId: srv.id, regel: 'ls | cat', cwd: rw, bevestigd: false })),
      code(opdr.opdracht(eig, tE, { agentId: srv.id, regel: 'powershell Get-Date', cwd: rw, bevestigd: true })),
      code(opdr.opdracht(eig, tE, { agentId: srv.id, regel: '', cwd: rw, bevestigd: false })),
    ]);
    check('server weigert vóór de agent: niet toegestaan, shell-teken, PowerShell uit, leeg', JSON.stringify(fouten) === JSON.stringify(['OPDRACHT_NIET_TOEGESTAAN/400', 'OPDRACHT_SHELL_TEKEN/400', 'OPDRACHT_POWERSHELL_UIT/400', 'OPDRACHT_LEEG/400']), JSON.stringify(fouten));
    const mis = await opdr.opdracht(eig, tE, { agentId: srv.id, regel: 'cat .env', cwd: rw, bevestigd: false }) as any;
    check('weigering van de agent (geheime plek) → rij mislukt met de reden, niets uitgevoerd', mis.klaar && mis.staat === 'mislukt' && /protected secret/.test(mis.fout));
    // instelling «alles»
    await opdr.instellingZetten(eig, tE, { agentId: srv.id, bevestiging: 'alles' });
    const alles = await opdr.opdracht(eig, tE, { agentId: srv.id, regel: 'ls', cwd: rw, bevestigd: false }) as any;
    check('instelling «alles»: ook een lezende opdracht vraagt eerst bevestiging; apparaten toont de stand', alles.bevestiging === true && (await term.apparaten(eig, tE)).find((a) => a.id === srv.id)?.bevestiging === 'alles');
    check('ongeldige instelling geweigerd', (await code(opdr.instellingZetten(eig, tE, { agentId: srv.id, bevestiging: 'nooit' }))).startsWith('BEVESTIGING_ONGELDIG'));
    const gesch = await opdr.opdrachtenLijst(eig, tE, srv.id);
    check('geschiedenis: eigen opdrachten met uitvoer, nieuwste eerst', gesch.opdrachten.length >= 4 && gesch.opdrachten[0].begin >= gesch.opdrachten[1].begin && gesch.opdrachten.some((o) => /leesmij/.test(o.uitvoer)));

    // ---- een ander: beheerder met technisch profiel (terminal.servers) — ziet het apparaat van de eigenaar NIET
    await tp.toekennen(eig, tE, { email: beh.email, rollen: ['beheerder'], maxMinuten: 60 });
    await tp.activeren(beh, tB, 30, 'support');
    check('andere gebruiker (beheerder, tech-profiel actief): apparaat van de eigenaar niet in de lijst', !(await term.apparaten(beh, tB)).some((a) => a.id === srv.id));
    check('andere gebruiker: opdracht op het apparaat van de eigenaar → APPARAAT_NIET_GEVONDEN/404; instelling idem; stand van zijn rij → niet gevonden',
      (await code(opdr.opdracht(beh, tB, { agentId: srv.id, regel: 'ls', cwd: rw, bevestigd: true }))) === 'APPARAAT_NIET_GEVONDEN/404'
      && (await code(opdr.instellingZetten(beh, tB, { agentId: srv.id, bevestiging: 'alles' }))) === 'APPARAAT_NIET_GEVONDEN/404'
      && (await code(opdr.opdrachtStand(beh, r.id))) === 'OPDRACHT_NIET_GEVONDEN/404');
    check('andere gebruiker: geschiedenis leeg (geen opnames-recht), rijen van de eigenaar onzichtbaar', (await opdr.opdrachtenLijst(beh, tB)).opdrachten.length === 0);
    check('zonder technisch profiel → TECH_TERMINAL_VEREIST/403 (ook de eigenaar van het apparaat in een ander tabblad)', (await code(opdr.opdracht(ander, tab(), { agentId: srv.id, regel: 'ls', cwd: rw, bevestigd: true }))) === 'TECH_TERMINAL_VEREIST/403' && (await code(opdr.opdracht(eig, tab(), { agentId: srv.id, regel: 'ls', cwd: rw, bevestigd: true }))) === 'TECH_TERMINAL_VEREIST/403');
    if (appRolActief()) {
      const alsApp = async (userId: string, sql: string, params: unknown[] = []) => { const c = await getPool('app').connect(); try { await c.query('BEGIN'); await c.query("SELECT set_config('app.user_id', $1, true)", [userId]); const x = await c.query(sql, params); await c.query('COMMIT'); return x; } catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; } finally { c.release(); } };
      const mig = getPool('migratie');
      const vorige = (await mig.query("SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'")).rows[0]?.waarde;
      await mig.query("UPDATE app.rls_instellingen SET waarde = 'aan' WHERE sleutel = 'afdwingen'");
      try {
        const eigenN = Number((await alsApp(eig.id, 'SELECT count(*)::int AS n FROM app.terminal_opdrachten WHERE agent_id = $1', [srv.id])).rows[0].n);
        const anderN = Number((await alsApp(beh.id, 'SELECT count(*)::int AS n FROM app.terminal_opdrachten WHERE agent_id = $1', [srv.id])).rows[0].n);
        check('RLS: de app-rol ziet alleen eigen rijen van app.terminal_opdrachten (eigenaar > 0, ander = 0)', eigenN > 0 && anderN === 0, `${eigenN}/${anderN}`);
        check('RLS: de app-rol kan niet schrijven in app.terminal_opdrachten', await weigert(() => alsApp(eig.id, "INSERT INTO app.terminal_opdrachten (id, user_id, agent_id, regel, programma) VALUES ($1, $2, $3, 'x', 'x')", [randomUUID(), eig.id, srv.id]), /permission denied|policy/i));
      } finally { if (vorige) await mig.query("UPDATE app.rls_instellingen SET waarde = $1 WHERE sleutel = 'afdwingen'", [vorige]); }
    }
    // ---- PowerShell-apparaat (pc) van de eigenaar via dezelfde weg
    const token2 = randomBytes(24).toString('base64url');
    const capsPc = { version: '0.8.0', roots: [rw], readonlyRoots: [], allowCommands: [], gebruiker: 'pavlo', host: 'PC', terminal: { enabled: true, container: false, opdrachten: false, powershell: true, maxMinuten: 60, test: false } };
    const pcAg = await store.createAgent(eig.id, 'PC', 'win32-x64', sha256(token2), capsPc, undefined, { ruimte: 'technisch', version: '0.8.0' });
    agentIds.push(pcAg.id);
    const ws2 = new NepWs();
    gw.onConnection(ws2 as any);
    ws2.emit('message', Buffer.from(JSON.stringify({ t: 'auth', token: token2, version: '0.8.0', capabilities: capsPc })));
    await wacht(() => ws2.sent.some((m) => m.t === 'ready'));
    const origSend2 = ws2.send.bind(ws2);
    ws2.send = (t: string) => { origSend2(t); const m = JSON.parse(t); if (m.t === 'cmd') void handlers[m.type](pcfg, m.params ?? {}).then((data: unknown) => ws2.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: m.id, ok: true, data }))), (e: Error) => ws2.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: m.id, ok: false, error: e.message })))); };
    const ps1 = await opdr.opdracht(eig, tE, { agentId: pcAg.id, regel: 'Get-Service x; Restart-Service y', cwd: rw, bevestigd: false }) as any;
    const ps2 = await opdr.opdracht(eig, tE, { agentId: pcAg.id, regel: 'Get-Service x; Restart-Service y', cwd: rw, bevestigd: true }) as any;
    check('PowerShell-apparaat: elke regel vraagt bevestiging; met bevestiging gaat de hele regel als één -Command-argument', ps1.bevestiging === true && ps1.powershell === true && ps2.klaar && ps2.staat === 'klaar' && ps2.powershell === true && /\[Get-Service x; Restart-Service y\]/.test(ps2.uitvoer) && /^n=4$/m.test(ps2.uitvoer), JSON.stringify(ps2).slice(0, 300));
    const lijstNa = await term.apparaten(eig, tE);
    check('apparaten: beide apparaten, technische eerst, PowerShell-apparaat gemarkeerd', lijstNa.filter((a) => agentIds.includes(a.id)).length === 2 && lijstNa.find((a) => a.id === pcAg.id)?.powershell === true && lijstNa.findIndex((a) => a.ruimte === 'technisch') === 0);
    ws.close(); ws2.close();

    // ---- AI-weg (uitvoeren_opdracht → machine_exec → submitCommand): PowerShell ALTIJD een verse bevestiging, ook met een «altijd»-grant
    const cmds = await import('../../backend/connectors-opdrachten');
    const grants = await import('../../backend/ai-toestemmingen');
    const aiU = await mk(`ai-${sfx}@eenheid.test`); ids.push(aiU.id);
    const pcAi = await store.createAgent(aiU.id, 'PC-ai', 'win32-x64', sha256(randomBytes(24).toString('base64url')), capsPc, undefined, { ruimte: 'prive', version: '0.8.0' });
    agentIds.push(pcAi.id);
    await grants.addGrants(aiU.id, aiU.id, [{ agentId: pcAi.id, capability: 'machine.exec', always: true, minutes: 60 }], { steppedUp: true });
    const rijAi = (await store.getAgent(aiU.id, pcAi.id))!;
    const psAi = await cmds.submitCommand(rijAi, aiU.id, 'exec', { command: 'powershell', args: ['Remove-Item', 'x'], cwd: '.' });
    const psAi2 = await cmds.submitCommand(rijAi, aiU.id, 'exec', { command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\PowerShell.EXE', args: ['Get-Date'], cwd: '.' });
    const gitAi = await cmds.submitCommand(rijAi, aiU.id, 'exec', { command: 'git', args: ['status'], cwd: '.' });
    check('AI-weg: met een «altijd»-grant voor machine.exec gaat `git` automatisch, maar `powershell` (ook PowerShell.EXE met pad) wacht op bevestiging op de site',
      psAi.auto === false && psAi.command.status === 'pending_approval' && psAi2.auto === false && psAi2.command.status === 'pending_approval' && gitAi.auto === true,
      JSON.stringify({ ps: [psAi.auto, psAi.command.status], ps2: [psAi2.auto, psAi2.command.status], git: gitAi.auto }));
    // SEC-002 ai-mcp-02 (12.11.2026): site en agent normaliseren de naam gelijk — wat de agent als PowerShell ziet, ziet de site ook zo.
    const psNamen = ['powershell', 'pwsh', 'powershell.exe', 'PWSH.EXE', 'powershell.cmd', 'PWSH.BAT', 'pwsh.cmd', 'PowerShell.Bat', 'powershell.exe.cmd', 'powershell.', ' pwsh ', 'C:\\x\\pwsh.CMD'];
    const psAi3 = await cmds.submitCommand(rijAi, aiU.id, 'exec', { command: 'powershell.cmd', args: ['Remove-Item', 'x'], cwd: '.' });
    check('SEC-002 ai-mcp-02: powershell.cmd / PWSH.BAT (cmd/bat/hoofdletters) tellen op de site als PowerShell en wachten ook met een «altijd»-grant op een klik; de agent start alleen de exacte naam',
      psNamen.every((c) => cmds.isPowershellOpdracht({ command: c })) && psNamen.every((c) => agent.powershellSoort(c) === 'nee' || cmds.isPowershellOpdracht({ command: c }))
      && agent.powershellSoort('powershell.cmd') === 'vermomd' && agent.powershellSoort('PWSH.BAT') === 'vermomd' && agent.powershellSoort('pwsh') === 'ja'
      && psAi3.auto === false && psAi3.command.status === 'pending_approval'
      && await weigert(() => handlers.exec(pcfg, { command: 'powershell.cmd', args: ['Get-Date'], cwd: '.' }), /exact name/));
    check('isPowershellOpdracht: powershell, pwsh, .exe, pad, hoofdletters ja; git, powershell-x, leeg nee', cmds.isPowershellOpdracht({ command: 'pwsh' }) && cmds.isPowershellOpdracht({ command: 'POWERSHELL.exe' }) && cmds.isPowershellOpdracht({ command: '/usr/bin/pwsh' }) && !cmds.isPowershellOpdracht({ command: 'git' }) && !cmds.isPowershellOpdracht({ command: 'powershell-x' }) && !cmds.isPowershellOpdracht({}) && !cmds.isPowershellOpdracht(null));
  } finally {
    if (oudLegacy !== undefined) process.env.AGENT_WS_TOKEN_AUTH_LEGACY = oudLegacy;
    await sys.query('DELETE FROM app.terminal_opdrachten WHERE agent_id = ANY($1::uuid[])', [agentIds]).catch(() => undefined);
    await sys.query('DELETE FROM app.agents WHERE id = ANY($1::uuid[])', [agentIds]).catch(() => undefined);
    await sys.query('DELETE FROM app.tech_profielen WHERE user_id = ANY($1)', [ids]).catch(() => undefined);
    await sys.query(`DELETE FROM app.records WHERE tbl='users' AND id = ANY($1)`, [ids]).catch(() => undefined);
    rmSync(werk, { recursive: true, force: true });
  }

  // ================================================================ 5. UI, routes, installer, unit (bron)
  const lees = (p: string) => readFileSync(resolve(p), 'utf8');
  const ui = lees('src/terminal/Terminal.tsx');
  check('UI: opent meteen op het technische server-apparaat; statusregel «підключено як» + map + toegestaan + opname; wizard zonder apparaat met de exacte opdracht', /a\.ruimte === 'technisch'\)/.test(ui) && /підключено як/.test(ui) && /data-term-wie/.test(ui) && /sudo mijn-ruimte-installeer terminal-inrichten/.test(ui) && /data-term-wizard='1'/.test(ui) && /data-term-knop='controleer'/.test(ui));
  check('UI: bevestiging in het venster (alertdialog) alleen als de server dat vraagt; geschiedenis ↑/↓, Tab-aanvulling, kopiëren, instelling met data-hulp', /role='alertdialog'/.test(ui) && /d\.bevestiging\) \{ setBevestig/.test(ui) && /ArrowUp/.test(ui) && /e\.key === 'Tab'/.test(ui) && /data-term-knop='kopieer'/.test(ui) && /data-hulp='terminal\.bevestiging'/.test(ui) && /<HulpVraag k='terminal\.bevestiging'/.test(ui));
  check('UI: zolang de bevestiging open is, vervangt zij de invoerregel (focus op «Виконати», Esc annuleert, tekst blijft)', /\{!bevestig \? <form className='term-invoer'/.test(ui) && /ref=\{bevestigRef\}/.test(ui) && /e\.key === 'Escape'\) \{ e\.stopPropagation\(\); setBevestig\(null\)/.test(ui));
  check('UI: PowerShell-apparaat herkenbaar («PowerShell на <ПК>», PS-prompt) en apparaatkeuze server/pc naar platform (сервер Linux / ПК Windows)', /PowerShell \$\{uk \? 'на' : 'op'\} \$\{wie\}/.test(ui) && /PS \$\{cwd\}>/.test(ui) && /data-term-apparaat='1'/.test(ui) && /\^win32\/\.test\(a\.platform\) \? \(uk \? 'ПК Windows'/.test(ui) && /'сервер Linux'/.test(ui));
  const routes = lees('backend/terminal-routes.ts');
  check('routes: opdracht, opdracht-stand, opdrachten, instelling (instelling met stap-op)', /'POST \/api\/terminal\/opdracht':/.test(routes) && /'POST \/api\/terminal\/opdracht-stand':/.test(routes) && /'POST \/api\/terminal\/opdrachten':/.test(routes) && /'POST \/api\/terminal\/instelling': \[gate\(\{ stepUp: true \}/.test(routes));
  const inst = lees('deploy/installeer-app.sh'), app = lees('deploy/apparaat-inrichten.sh'), unit = lees('deploy/mijn-ruimte-apparaat.service');
  check('installer: terminal-inrichten als subopdracht (root), hulpscript geïnstalleerd, stil meegenomen in installeren (nooit fataal)', /terminal-inrichten\) vereis_root; vereis_node; exec bash "\$\(hulpscript apparaat-inrichten mijn-ruimte-apparaat\)"/.test(inst) && /apparaat-inrichten:mijn-ruimte-apparaat/.test(inst) && /apparaat-inrichten\.sh" --bij-installeren "\$doel" \|\| waarschuwing/.test(inst));
  check('apparaat-inrichten: koppelcode als dienstgebruiker (systemd-run, geheimen), via stdin naar pair --code - (nooit als argument), agent als gewone gebruiker, geen shells/sudo op de allow-lijst, oude beheer-koppelen-unit uit',
    /systemd-run[\s\S]{0,600}-p User="\$DIENST_GEBRUIKER"[\s\S]{0,600}apparaat-koppelcode\.mjs/.test(app) && /printf '%s\\n' "\$code" \| runuser -u "\$gebruiker"[\s\S]{0,300}pair --server "\$server" --code -/.test(app) && /\[ "\$uid" -ge 1000 \]/.test(app) && /bash,\*\|\*,sh,\*\|[^\n]*sudo/.test(app) && /terminal-config on --opdrachten --geen-container/.test(app) && /mijn-ruimte-agent-\$gebruiker\.service/.test(app));
  check('unit-sjabloon: User=@GEBRUIKER@, NoNewPrivileges, ProtectSystem=strict, ReadWritePaths uit het sjabloon, geen root', /^User=@GEBRUIKER@$/m.test(unit) && /^NoNewPrivileges=yes$/m.test(unit) && /^ProtectSystem=strict$/m.test(unit) && /^ReadWritePaths=@SCHRIJF@$/m.test(unit) && !/User=root/.test(unit));
  const kc = lees('server/apparaat-koppelcode.ts');
  check('koppelcode-script: eigenaar = OWNER_EMAIL + rol owner + approved; ruimte technisch; alleen de hash in de database; audit', /data->>'role' = 'owner' AND data->>'status' = 'approved'/.test(kc) && /createPairingCode\(userId, sha256\(code\), ruimte\)/.test(kc) && /bron: 'installer'/.test(kc) && /'apparaat-koppelcode': 'server\/apparaat-koppelcode\.ts'/.test(lees('scripts/build-server.mjs')));
  check('agent pair --code - leest de code van stdin', /args\.code === '-'/.test(lees('deploy/agent/agent.mjs')));
  check('migratie 0113 + rechten: tabel met RLS, app-rol alleen SELECT', /CREATE TABLE IF NOT EXISTS app\.terminal_opdrachten/.test(lees('migrations/0113_terminal_opdrachten.sql')) && /ENABLE ROW LEVEL SECURITY/.test(lees('migrations/0113_terminal_opdrachten.sql')) && /GRANT SELECT ON app\.terminal_opdrachten TO mijnruimte_app/.test(lees('migrations/rechten.sql')));
  // docs/ staat niet in elke testkopie (synctest kopieert alleen de codemappen): dan alleen de agent-documenten.
  const docs = existsSync(resolve('docs/terminal/ТЕРМІНАЛ.md')) ? lees('docs/terminal/ТЕРМІНАЛ.md') : null, win = lees('deploy/agent/ОБОЛОНКА-ВІНДОВС-ПОВЕРШЕЛ.md'), lm = lees('deploy/agent/ОГЛЯД-АГЕНТА.md');
  check('docs: ТЕРМІНАЛ.md (uk+nl), ОБОЛОНКА-ВІНДОВС-ПОВЕРШЕЛ.md (uk+nl, sc.exe/taakplanner, -NoProfile -NonInteractive -Command, elke opdracht bevestigd), ОГЛЯД-АГЕНТА noemt 0.8.0 en term.exec',
    (docs === null || (/Nederlands/.test(docs) && /terminal-inrichten/.test(docs) && /\| ; &&/.test(docs))) && /-NoProfile -NonInteractive -Command/.test(win) && /sc\.exe|schtasks/.test(win) && /terminal-config on --powershell/.test(win) && /Nederlands/.test(win) && /0\.8\.0/.test(lm) && /term\.exec/.test(lm), docs === null ? 'docs/ niet in de testkopie' : '');
  return einde();
}
