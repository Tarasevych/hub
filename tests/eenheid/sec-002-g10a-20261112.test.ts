// SEC-002 · groep g10a (12.11.2026): regressietests voor
//   ai-mcp-02        PowerShell-regel omzeild met `powershell.cmd` / `pwsh.bat` (site en agent normaliseerden de naam verschillend)
//   server-uitrol-09 opdracht-terminal: schrijvende vlaggen (tar --index-file, journalctl --cursor-file, ss -D, git branch --set-upstream-to, systemctl -H) telden als «lezend»
//   http-rand-03     één «result»-bericht van een agent liet de server vallen (onafgehandelde afwijzing in de async WebSocket-luisteraar)
//   ai-mcp-12        «Стоп» liet wachtende AI-verzoeken (connector_tool_calls, ai_bevestiging) staan; goedkeuren kon nog na de termijn
//   geheimen-05      omslagen van de gegevenssleutel bleven staan na intrekken/verlopen van een AI-verbinding of het verwijderen van een passkey
//   interface-01/02  «Дозволити» zonder (volledige) inhoud en zonder te zeggen WELKE AI vraagt
//   extensie-02/03/04/09, interface-07: zie de blokken verderop.
// Alle «geheimen» hieronder zijn verzonnen proefwaarden.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';
import { extensieBlok } from './hulp/sec-002-g10a-extensie';
import { uiBlok } from './hulp/sec-002-g10a-ui';
import { LEZEND, ontleed, opdrachtSoort, regelSplitsen, STANDAARD_ALLOW_SERVER } from '../../shared/terminal-opdrachten';
import { actieVoorPad } from '../../shared/stap-op-acties';
import { onthoudMagVoorPad } from '../../backend/stap-op';

const lees = (p: string) => readFileSync(resolve(p), 'utf8');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const weigert = async (f: () => Promise<unknown>, re: RegExp) => { try { await f(); return false; } catch (e) { return re.test((e as Error).message); } };
const wacht = async (f: () => boolean | Promise<boolean>, ms = 5000) => { const tot = Date.now() + ms; while (Date.now() < tot) { if (await f()) return true; await new Promise((r) => setTimeout(r, 25)); } return !!(await f()); };

export async function main(): Promise<number> {
  const { check, einde } = checker('sec-002-g10a-20261112');
  const werk = mkdtempSync(join(tmpdir(), 'sec002-g10a-'));
  const agent = await import(pathToFileURL(resolve('deploy/agent/agent.mjs')).href);
  const cmds = await import('../../backend/connectors-opdrachten');

  // ================================================================ ai-mcp-02: één normalisatie van de PowerShell-naam op site en agent
  {
    const VERMOMD = ['powershell.cmd', 'PWSH.BAT', 'pwsh.cmd', 'PowerShell.Bat', 'powershell.exe.cmd', 'pwsh.exe.exe', ' powershell ', 'powershell.', 'pwsh .', 'C:\\x\\pwsh.CMD', '/usr/bin/pwsh.bat', 'powershell.ps1', 'powershell.com', '"powershell"', 'powershell\u0000.cmd'];
    const misSite = VERMOMD.filter((c) => !cmds.isPowershellOpdracht({ command: c }));
    check(`ai-mcp-02: de site herkent alle ${VERMOMD.length} vermomde namen (powershell.cmd, PWSH.BAT, pad, spaties, punten, dubbele achtervoegsels) als PowerShell`, misSite.length === 0, misSite.map((c) => JSON.stringify(c)).join(' '));
    check('ai-mcp-02: gewone programma’s blijven gewoon (git, node, powershell-x, pwshx, leeg)', ['git', 'node', 'powershell-x', 'pwshx', 'mypowershell', '', 'cmd'].every((c) => !cmds.isPowershellOpdracht({ command: c })) && !cmds.isPowershellOpdracht(null) && !cmds.isPowershellOpdracht({}));
    // De kern van de vondst: ALLES wat de agent als PowerShell start, moet de site ook als PowerShell zien.
    const kandidaten = [...VERMOMD, 'powershell', 'pwsh', 'powershell.exe', 'PWSH.EXE', 'Pwsh', 'git', 'node.exe'];
    const soort = typeof agent.powershellSoort === 'function' ? agent.powershellSoort : null;
    check('ai-mcp-02: de agent exporteert powershellSoort (ja | vermomd | nee)', !!soort);
    const gat = soort ? kandidaten.filter((c) => soort(c) !== 'nee' && !cmds.isPowershellOpdracht({ command: c })) : ['geen export'];
    check('ai-mcp-02: geen enkele naam die de agent als PowerShell ziet, is voor de site een gewoon programma', gat.length === 0, gat.join(' | '));
    check('ai-mcp-02: de agent start PowerShell alleen onder de exacte namen powershell, pwsh, powershell.exe, pwsh.exe', !!soort
      && ['powershell', 'pwsh', 'powershell.exe', 'PWSH.EXE', 'Pwsh'].every((c) => soort(c) === 'ja')
      && ['powershell.cmd', 'PWSH.BAT', 'pwsh.cmd', 'PowerShell.Bat'].every((c) => soort(c) === 'vermomd')
      && ['git', 'node.exe', 'powershell-x', ''].every((c) => soort(c) === 'nee'));
    // Echte agent-handlers met een nep-pwsh in PATH: de vermomde naam wordt geweigerd vóór er iets start.
    const bin = join(werk, 'bin'); mkdirSync(bin);
    const merk = join(werk, 'pwsh-gestart.txt');
    writeFileSync(join(bin, 'pwsh'), `#!/bin/sh\necho gestart >> "${merk}"\nprintf "n=%s\\n" "$#"\n`); chmodSync(join(bin, 'pwsh'), 0o755);
    process.env.PATH = `${bin}:${process.env.PATH}`;
    const rw = join(werk, 'thuis'); mkdirSync(rw);
    const pcfg = { roots: [rw], allow: ['powershell', 'pwsh'] as string[], terminal: { enabled: true, powershell: true, opdrachten: true, container: false } };
    const gestart = () => { try { return readFileSync(merk, 'utf8').split('\n').filter(Boolean).length; } catch { return 0; } };
    const w1 = await weigert(() => agent.handlers.exec(pcfg, { command: 'powershell.cmd', args: ['Remove-Item', 'x'], cwd: '.' }), /exact|PowerShell/i);
    const w2 = await weigert(() => agent.handlers.exec(pcfg, { command: 'PWSH.BAT', args: ['Get-Date'], cwd: '.' }), /exact|PowerShell/i);
    const w3 = await weigert(() => agent.handlers['term.exec'](pcfg, { command: 'pwsh.cmd', args: ['Get-Date'], cwd: rw }), /exact|PowerShell/i);
    check('ai-mcp-02: agent exec/term.exec weigert powershell.cmd, PWSH.BAT en pwsh.cmd en start NIETS', w1 && w2 && w3 && gestart() === 0, `${w1}/${w2}/${w3}/gestart=${gestart()}`);
    const goed = await agent.handlers.exec(pcfg, { command: 'pwsh', args: ['Get-Date'], cwd: '.' });
    check('ai-mcp-02: de exacte naam pwsh werkt nog (vaste start -NoProfile -NonInteractive -Command <tekst>)', goed.code === 0 && /^n=4$/m.test(goed.stdout) && gestart() === 1, JSON.stringify(goed).slice(0, 200));
  }

  // ================================================================ server-uitrol-09: schrijvende vlaggen zijn nooit «lezend»
  {
    const allow = [...STANDAARD_ALLOW_SERVER, 'docker'];
    const L = (r: string) => ontleed(r, { allow, powershell: false }).soort;
    const WIJZ = [
      'tar -tf a.tar --index-file=/srv/x', 'tar -tf a.tar --index-file /srv/x', 'tar -tf a.tar --one-top-level=x', 'tar -tf a.tar --to-stdout', 'tar -tOf a.tar', 'tar --list -f a.tar --record-file=x',
      'journalctl --cursor-file=/srv/c', 'journalctl -u x --cursor-file /srv/c', 'journalctl -M host -u x', 'journalctl --root=/x',
      'ss -D /srv/dump', 'ss --diag=/srv/dump', 'ss -tD/srv/dump', 'ip -batch /srv/opdrachten', 'ip -b /srv/opdrachten', 'ip -force -bat x',
      'git branch --color nieuw', 'git branch --column nieuw', 'git branch -a nieuw', 'git branch --list -d x',
      'git branch --set-upstream-to=origin/x', 'git branch -u origin/x', 'git branch --edit-description', 'git branch --unset-upstream', 'git branch -c a b', 'git branch -C a b', 'git branch --copy a b', 'git branch -f a b', 'git branch --force a', 'git branch nieuw', 'git branch --track x y',
      'systemctl status -H gebruiker@host', 'systemctl -H gebruiker@host status', 'systemctl status --host=x', 'systemctl status -M x', 'systemctl status --machine=x', 'systemctl show -Hx',
    ];
    const LEZ = ['tar -tf a.tar', 'tar -tzf a.tgz', 'tar --list -f a.tar', 'journalctl -u mijn-ruimte -n 50', 'journalctl -o json -u x', 'journalctl -D /var/log/journal -n 5', 'ss -tlnp', 'ss -s', 'ip -br a', 'ip -brief link', 'ip a',
      'git branch', 'git branch -a', 'git branch -r', 'git branch -v', 'git branch -vv', 'git branch -avv', 'git branch --list', 'git branch --show-current', 'git branch --contains HEAD', 'git branch --merged', 'git branch --no-merged main', 'git branch -a -v', 'git branch --sort=-committerdate', 'git branch --sort -committerdate', 'git branch --color=always -a',
      'systemctl status mijn-ruimte', 'systemctl is-active caddy', 'systemctl list-timers', 'systemctl show mijn-ruimte', 'git status', 'git log --oneline -5', 'git remote -v', 'git tag', 'git reflog'];
    const misW = WIJZ.filter((r) => L(r) !== 'wijzigend'), misL = LEZ.filter((r) => L(r) !== 'lezend');
    check(`server-uitrol-09: ${WIJZ.length} regels met een schrijvende/omleidende vlag zijn «wijzigend» (tar --index-file, journalctl --cursor-file, ss -D, git branch -u/--edit-description, systemctl -H/-M)`, misW.length === 0, misW.join(' | '));
    check(`server-uitrol-09: ${LEZ.length} echte leesopdrachten blijven «lezend» (geen onnodige bevestiging)`, misL.length === 0, misL.join(' | '));
    check('server-uitrol-09: agent — LEZEND-tabel blijft een exacte spiegel van de site', JSON.stringify(agent.LEZEND) === JSON.stringify(LEZEND));
    const spiegelMis = [...WIJZ, ...LEZ].filter((r) => { const w = regelSplitsen(r); return agent.opdrachtSoort(w[0], w.slice(1)) !== opdrachtSoort(w[0], w.slice(1)); });
    check('server-uitrol-09: agent en site geven voor al deze regels dezelfde uitkomst', spiegelMis.length === 0, spiegelMis.join(' | '));
    // De agent laat zo'n regel niet meer in een ALLEEN-LEZEN root lopen.
    const rw = join(werk, 'rw'), ro = join(werk, 'ro'); mkdirSync(rw); mkdirSync(ro);
    writeFileSync(join(ro, 'a.tar'), '');
    const cfg = { roots: [rw, ro], readonlyRoots: [ro], allow: ['tar', 'git', 'ls'], terminal: { enabled: true, opdrachten: true, container: false } };
    const geweigerd = await weigert(() => agent.handlers['term.exec'](cfg, { command: 'tar', args: ['-tf', 'a.tar', '--index-file=uit.txt'], cwd: ro }), /read-only root/);
    check('server-uitrol-09: agent term.exec weigert `tar -tf … --index-file=…` in een alleen-lezen root', geweigerd);
    const ext1 = await weigert(() => agent.handlers['term.exec'](cfg, { command: 'git', args: ['ls-remote', 'ext::sh -c id'], cwd: rw }), /ext::/);
    const ext2 = await weigert(() => agent.handlers.exec(cfg, { command: 'git', args: ['fetch', '--quiet', 'ext::sh -c "touch x"'], cwd: '.' }), /ext::/);
    // Na de toets (g10a-1): GNU getopt_long en git parse-options nemen elk ONDUBBELZINNIG voorvoegsel van een lange vlag aan.
    const KORT = ['tar -tf a.tar --index-fil=uit.txt', 'tar -tf a.tar --index=x', 'tar -tf a.tar --index-fil uit.txt', 'tar -tf a.tar --checkpoint=1 --checkpoint-ac=exec=id', 'tar -tf a.tar --to-comm=id', 'tar -tf a.tar --use-compress-prog=id', 'tar -tf a.tar --info-scr=x',
      'tar -tf a.tar --one-top=x', 'journalctl --cursor-fi=x', 'journalctl --vacuum-t=1s', 'journalctl --rot', 'journalctl --flu', 'journalctl --mach=x', 'ss --dia=x', 'ss --kil dst 1.2.3.4', 'systemctl status --hos=u@h', 'systemctl status --mach=x',
      'sort --outp=x y', 'sort --compress-prog=id y', 'dmesg --cle', 'dmesg --read-cl', 'date --se=2020-01-01', 'git log --outp=x', 'file --comp x'];
    const KORT_LEZ = ['journalctl -u x -n 5', 'tar -tzf a.tgz', 'tar --list -f a.tar', 'ss -tlnp', 'sort -n x', 'dmesg -T', 'date', 'git log --oneline -5', 'systemctl status mijn-ruimte --no-pager', 'git branch --show-current'];
    const allowK = [...allow, 'sort', 'dmesg', 'file'];
    const LK = (r: string) => ontleed(r, { allow: allowK, powershell: false }).soort;
    const misK = KORT.filter((r) => LK(r) !== 'wijzigend'), misKL = KORT_LEZ.filter((r) => LK(r) !== 'lezend');
    check(`server-uitrol-09 (g10a-1): ${KORT.length} regels met een AFGEKORTE lange vlag (--index-fil=, --checkpoint-ac=, --cursor-fi=, --hos=, --outp=, --cle) zijn «wijzigend»`, misK.length === 0, misK.join(' | '));
    check('server-uitrol-09 (g10a-1): gewone leesopdrachten blijven «lezend» (tar --list is geen afkorting van --listed-incremental)', misKL.length === 0, misKL.join(' | '));
    const spiegelK = [...KORT, ...KORT_LEZ].filter((r) => { const w = regelSplitsen(r); return agent.opdrachtSoort(w[0], w.slice(1)) !== opdrachtSoort(w[0], w.slice(1)); });
    check('server-uitrol-09 (g10a-1): agent en site zijn het ook over de afgekorte vormen eens', spiegelK.length === 0, spiegelK.join(' | '));
    const kortRo = await weigert(() => agent.handlers['term.exec'](cfg, { command: 'tar', args: ['-tf', 'a.tar', '--index-fil=uit1.txt'], cwd: ro }), /read-only root/);
    check('server-uitrol-09 (g10a-1): agent term.exec weigert `tar -tf … --index-fil=…` in een alleen-lezen root', kortRo);
    const up1 = await weigert(() => agent.handlers.exec(cfg, { command: 'git', args: ['ls-remote', '--upload-pa=touch up1.txt;', 'repo'], cwd: '.' }), /runs code from text/);
    const up2 = await weigert(() => agent.handlers.exec(cfg, { command: 'git', args: ['ls-remote', '--exec=touch up2.txt;', 'repo'], cwd: '.' }), /runs code from text/);
    const up3 = await weigert(() => agent.handlers['term.exec'](cfg, { command: 'git', args: ['ls-remote', '--upload-p', 'touch up3.txt;', 'repo'], cwd: rw }), /runs code from text/);
    const nodeKort = await weigert(() => agent.handlers.exec({ ...cfg, allow: ['node'] }, { command: 'node', args: ['--ev=1'], cwd: '.' }), /runs code from text/);
    check('server-uitrol-09 (g10a-1): de agent weigert afgekorte code-vlaggen (git --upload-pa=, --exec=, --upload-p; node --ev)', up1 && up2 && up3 && nodeKort, `${up1}/${up2}/${up3}/${nodeKort}`);
    check('server-uitrol-09 (naastgelegen): git met een `ext::`-adres (start een willekeurig programma) wordt door de agent geweigerd, ook via exec', ext1 && ext2, `${ext1}/${ext2}`);
  }

  // ================================================================ extensie-02 (server): goedkeuren/toestemmen wordt nooit «onthouden»
  {
    const id = randomUUID();
    const nooit = [`/api/owner/agents/commands/${id}/approve`, `/api/owner/mcp-connector/approvals/${id}/approve`,
      `/api/owner/agents/${id}/browser-enabled`, `/api/owner/agents/${id}/policy`, '/api/owner/agents/pairing-code', '/api/owner/mcp-connector/tools/set', '/api/owner/mcp-connector/tools/set-all'];
    const mis = nooit.filter((p) => onthoudMagVoorPad(p) || actieVoorPad(p) !== 'onbekend');
    check('extensie-02: een onthouden browser (12 uur) is NOOIT genoeg voor goedkeuren, browser aanzetten, beleid «zonder klik», koppelcode en hulpmiddelmodus', mis.length === 0, mis.join(' | '));
    check('extensie-02: gewone agentenpaden houden hun label (geen bredere wijziging dan nodig)', actieVoorPad('/api/owner/agents/list') === 'agenten' && actieVoorPad('/api/owner/mcp-connector/approvals') === 'agenten'
      && actieVoorPad(`/api/owner/agents/commands/${id}/reject`) === 'agenten' && actieVoorPad('/api/owner/tech/activeren') === 'bevestigen');
  }

  // ================================================================ extensie-03 / extensie-04: echte background.js met nagebootste chrome-API
  await extensieBlok(check);

  // ================================================================ interface-01/02/07, extensie-02/09 (scherm, brug, koppelcode), extensie-04 (site)
  await uiBlok(check);

  // ================================================================ databasedeel
  if (!process.env.DATABASE_URL) { console.log('OVERGESLAGEN databasedeel (geen DATABASE_URL)'); rmSync(werk, { recursive: true, force: true }); return einde(); }
  process.env.SLEUTELKLUIS_SLEUTEL_V1 ||= randomBytes(32).toString('base64');
  const { getPool } = await import('../../server/platform/pg');
  const sys = getPool('systeem');
  const store = await import('../../backend/connectors-opslag');
  const gw = await import('../../backend/connectors-gateway');
  const grants = await import('../../backend/ai-toestemmingen');
  const { metNamens } = await import('../../backend/mcp-namens');
  const sfx = randomBytes(4).toString('hex');
  const mk = async (email: string, role = 'user') => { const id = randomUUID(); await sys.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', id, { email, role, status: 'approved', name: 'Тест' }]); return { id, email, role }; };
  const gebruikers: string[] = [], agentIds: string[] = [];
  const oudLegacy = process.env.AGENT_WS_TOKEN_AUTH_LEGACY; delete process.env.AGENT_WS_TOKEN_AUTH_LEGACY;
  class NepWs extends EventEmitter { sent: any[] = []; readyState = 1; gesloten: number | null = null; send(t: string) { this.sent.push(JSON.parse(t)); } close(c?: number) { if (this.gesloten === null) this.gesloten = c ?? 1000; this.emit('close'); } terminate() { this.emit('close'); } }
  const onafgehandeld: unknown[] = [];
  const vang = (e: unknown) => { onafgehandeld.push(e); };
  process.on('unhandledRejection', vang);
  try {
    // ---------------------------------------------------------------- ai-mcp-02 (DB): «altijd»-toestemming + vermomde naam → wacht op een klik
    const u1 = await mk(`ps-${sfx}@eenheid.test`); gebruikers.push(u1.id);
    const pc = await store.createAgent(u1.id, 'PC-ps', 'win32-x64', sha(randomBytes(24).toString('base64url')), { version: '0.8.0' }, undefined, { ruimte: 'prive', version: '0.8.0' });
    agentIds.push(pc.id);
    await grants.addGrants(u1.id, u1.id, [{ agentId: pc.id, capability: 'machine.exec', always: true, minutes: 60 }], { steppedUp: true });
    const rijPc = (await store.getAgent(u1.id, pc.id))!;
    const uitslagen: Array<[string, boolean, string]> = [];
    for (const c of ['powershell.cmd', 'PWSH.BAT', 'pwsh.exe.cmd']) { const r = await cmds.submitCommand(rijPc, u1.id, 'exec', { command: c, args: ['Remove-Item', '-Recurse', 'x'], cwd: '.' }); uitslagen.push([c, r.auto, r.command.status]); }
    const git = await cmds.submitCommand(rijPc, u1.id, 'exec', { command: 'git', args: ['status'], cwd: '.' });
    check('ai-mcp-02 (DB): met een «altijd»-toestemming wachten powershell.cmd / PWSH.BAT / pwsh.exe.cmd op een verse klik; git gaat automatisch',
      uitslagen.every(([, auto, status]) => auto === false && status === 'pending_approval') && git.auto === true, JSON.stringify(uitslagen));

    // ---------------------------------------------------------------- interface-02 (DB): de aanvrager wordt bewaard en teruggegeven
    const kolommen = (await sys.query(`SELECT table_name || '.' || column_name AS k FROM information_schema.columns WHERE table_schema = 'app' AND table_name IN ('agent_commands', 'connector_tool_calls') AND column_name LIKE 'aanvrager_%' ORDER BY 1`)).rows.map((r: { k: string }) => r.k);
    check('interface-02: migratie — aanvrager_client/_grant/_agent op app.agent_commands en app.connector_tool_calls', kolommen.length === 6, kolommen.join(','));
    if (kolommen.length === 6) {
      const wie = { client: 'Tweede klant (DCR)', grantId: 'grant-123', agent: 'chatgpt' };
      const tc = await metNamens(wie, () => store.createToolCall(u1.id, 'github_comment_issue', { body: 'x', repo: 'a/b', number: 1 }));
      const lijst = await store.listToolCalls(u1.id, 20);
      const terug = lijst.find((r: any) => r.id === tc.id);
      check('interface-02: createToolCall bewaart WIE vroeg (klant, verbinding, agent) en listToolCalls geeft het terug', terug?.aanvrager_client === wie.client && terug?.aanvrager_grant === wie.grantId && terug?.aanvrager_agent === wie.agent, JSON.stringify({ c: terug?.aanvrager_client, g: terug?.aanvrager_grant, a: terug?.aanvrager_agent }));
      const zonder = await store.createToolCall(u1.id, 'calendar_create_event', { title: 'x' });
      check('interface-02: zonder AI-context blijft de aanvrager leeg (de UI zegt dan eerlijk «невідомий клієнт»)', zonder.aanvrager_client === '' && zonder.aanvrager_agent === '');
      await grants.addGrants(u1.id, u1.id, [{ agentId: pc.id, capability: 'machine.write', minutes: 60 }], { steppedUp: true });
      const c2 = await metNamens(wie, () => cmds.submitCommand(rijPc, u1.id, 'fs.write', { path: 'a.txt', content: 'x' }));
      const wachtend = (await store.listPendingCommands(u1.id)).find((r: any) => r.id === c2.command.id);
      check('interface-02: submitCommand bewaart de aanvrager op de opdracht; listPendingCommands geeft hem terug', wachtend?.aanvrager_client === wie.client && wachtend?.aanvrager_agent === wie.agent && wachtend?.aanvrager_grant === wie.grantId, JSON.stringify(wachtend ? { c: wachtend.aanvrager_client, a: wachtend.aanvrager_agent } : null));
      // Na de toets (g10a-4): een AI-klant die zich via DCR «site:eigenaar» (of «site:…») noemt, is NOOIT «de mens zelf vanaf de
      // site»; een AI-context zonder naam ('?') is eerlijk onbekend.
      const vals = await metNamens({ client: 'site:eigenaar', grantId: 'g-x', agent: '' }, () => store.createToolCall(u1.id, 'mail_send', { to: 'x@example.invalid' }));
      const vals2 = await metNamens({ client: ' SITE:Eigenaar ', grantId: 'g-y', agent: '' }, () => store.createToolCall(u1.id, 'mail_send', { to: 'y@example.invalid' }));
      const zonderNaam = await metNamens({ client: '?', grantId: 'g-z', agent: '' }, () => store.createToolCall(u1.id, 'mail_send', { to: 'z@example.invalid' }));
      const s1 = store.aanvragerVoorScherm(vals), s2 = store.aanvragerVoorScherm(vals2);
      check('interface-02 (g10a-4): een AI-klant met de naam «site:eigenaar» (ook met spaties/hoofdletters) is nooit «Ви (з сайту)»; naam «?» = onbekend',
        !s1.site && !s2.site && s1.client !== store.AANVRAGER_SITE && /site:eigenaar/i.test(s1.client) && zonderNaam.aanvrager_client === '', JSON.stringify([s1, s2, zonderNaam.aanvrager_client]));
      await sys.query('DELETE FROM app.connector_tool_calls WHERE user_id = $1', [u1.id]);
    }

    // ---------------------------------------------------------------- http-rand-03: een «result» met een onzin-id of U+0000 mag de server niet laten vallen
    const u2 = await mk(`ws-${sfx}@eenheid.test`); gebruikers.push(u2.id);
    const tok = randomBytes(24).toString('base64url');
    const ag = await store.createAgent(u2.id, 'PC-ws', 'linux-x64', sha(tok), { version: '0.8.0' }, undefined, { ruimte: 'prive', version: '0.8.0' });
    agentIds.push(ag.id);
    const ws = new NepWs();
    gw.onConnection(ws as any);
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'auth', token: tok, version: '0.8.0', capabilities: {} })));
    const verbonden = await wacht(() => ws.sent.some((m) => m.t === 'ready'));
    check('http-rand-03: testagent verbonden met de echte gateway', verbonden && gw.agentOnline(ag.id));
    onafgehandeld.length = 0;
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: 'x', ok: true })));
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: `${randomUUID()}' OR 1=1 --`, ok: false, error: 'x' })));
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: { $ne: null }, ok: true })));
    await new Promise((r) => setTimeout(r, 400));
    check('http-rand-03: {t:"result", id:"x"} (geen uuid) geeft GEEN onafgehandelde afwijzing meer (was: 22P02 → proces stopt)', onafgehandeld.length === 0, onafgehandeld.map((e) => String((e as Error)?.message || e).slice(0, 80)).join(' | '));
    check('http-rand-03: de verbinding van de agent blijft na zo’n bericht gewoon open', gw.agentOnline(ag.id) && ws.gesloten === null);
    // Geldige opdracht, resultaat met U+0000 (jsonb weigert \u0000): geen crash, opdracht netjes afgesloten.
    const c1 = await store.createCommand(ag.id, u2.id, 'fs.read', { path: 'a.txt' }, 'approved');
    await store.transitionCommand(c1.id, ['approved'], 'sent', undefined, u2.id, ag.id);
    onafgehandeld.length = 0;
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: c1.id, ok: true, data: { content: 'voor\u0000na', diep: [{ 'sleu\u0000tel': 'w\u0000' }] } })));
    const klaar = await wacht(async () => (await store.getCommand(u2.id, c1.id))?.status === 'succeeded', 3000);
    const rij1 = await store.getCommand(u2.id, c1.id);
    check('http-rand-03: resultaat met U+0000 → geen onafgehandelde afwijzing en de opdracht is afgesloten (teken vervangen)', onafgehandeld.length === 0 && klaar && !JSON.stringify(rij1?.result ?? '').includes('\\u0000') && /voor.?na/.test(String(rij1?.result?.data?.content)),
      `${onafgehandeld.length} / ${rij1?.status} / ${JSON.stringify(rij1?.result ?? null).slice(0, 80)}`);
    const c3 = await store.createCommand(ag.id, u2.id, 'fs.read', { path: 'b.txt' }, 'approved');
    await store.transitionCommand(c3.id, ['approved'], 'sent', undefined, u2.id, ag.id);
    ws.emit('message', Buffer.from(JSON.stringify({ t: 'result', id: c3.id, ok: false, error: 'mis\u0000lukt' })));
    const klaar3 = await wacht(async () => (await store.getCommand(u2.id, c3.id))?.status === 'failed', 3000);
    check('http-rand-03: foutresultaat met U+0000 → opdracht «failed», geen crash', klaar3 && onafgehandeld.length === 0);
    const bronGw = lees('backend/connectors-gateway.ts');
    check('http-rand-03 (bron): het hele berichtenpad van de gateway staat in try/catch en controleert het id als uuid', /ws\.on\('message', \(raw\) => \{\s*bijBericht\(raw\)\.catch\(/.test(bronGw) && !/ws\.on\('message', async/.test(bronGw) && /isOpdrachtId\(msg\.id\)/.test(bronGw));
    check('http-rand-03: jsonbTekst vervangt U+0000 in waarden en sleutels, laat de rest ongemoeid en gooit nooit', store.jsonbTekst({ 'a\u0000': 'b\u0000', c: ['\\u0000 letterlijk'] }) === JSON.stringify({ 'a�': 'b�', c: ['\\u0000 letterlijk'] })
      && (() => { const kring: Record<string, unknown> = {}; kring.zelf = kring; return /could not be stored/.test(store.jsonbTekst(kring)); })() && store.jsonbTekst(undefined) === 'null'
      && store.isOpdrachtId(randomUUID()) && !store.isOpdrachtId('x') && !store.isOpdrachtId(null) && !store.isOpdrachtId({}));
    ws.close();

    // ---------------------------------------------------------------- ai-mcp-12: «Стоп» sluit ook de wachtrij «Питати» en de bevestigingen
    const u3 = await mk(`stop-${sfx}@eenheid.test`); gebruikers.push(u3.id);
    await import('../../backend/ai-bevestiging'); // meldt zich aan bij de noodstop
    const t1 = await store.createToolCall(u3.id, 'mail_send', { to: 'x@example.invalid', subject: 's' });
    const bevId = randomUUID();
    await sys.query(`INSERT INTO app.ai_bevestiging (id, user_id, ruimte, soort, tool, risico, parameters, hash, verloopt_op) VALUES ($1, $2, 'prive', 'mail.verzenden', 'mail_send', 'hoog', 'v1.proef', $3, now() + interval '20 minutes')`, [bevId, u3.id, sha('proef')]);
    await grants.stopAll(u3.id, u3.id);
    await wacht(async () => (await sys.query('SELECT status FROM app.ai_bevestiging WHERE id = $1', [bevId])).rows[0]?.status !== 'wacht', 3000);
    const naTool = (await store.getToolCall(u3.id, t1.id))?.status;
    const naBev = (await sys.query('SELECT status FROM app.ai_bevestiging WHERE id = $1', [bevId])).rows[0]?.status;
    check('ai-mcp-12: na «Стоп» is de wachtende aanroep (modus «Питати») afgewezen — goedkeuren kan niet meer', naTool === 'rejected' && (await store.transitionToolCall(t1.id, u3.id, ['pending_approval'], 'approved')) === null, String(naTool));
    check('ai-mcp-12: na «Стоп» is het open verzoek in «Підтвердження на сайті» ingetrokken', naBev === 'ingetrokken', String(naBev));
    // blockUser: dezelfde regel.
    const t2 = await store.createToolCall(u3.id, 'mail_send', { to: 'y@example.invalid' });
    const bev2 = randomUUID();
    await sys.query(`INSERT INTO app.ai_bevestiging (id, user_id, ruimte, soort, tool, risico, parameters, hash, verloopt_op) VALUES ($1, $2, 'prive', 'mail.verzenden', 'mail_send', 'hoog', 'v1.proef', $3, now() + interval '20 minutes')`, [bev2, u3.id, sha('proef2')]);
    await grants.blockUser(u3.id, u3.id, 'test');
    await wacht(async () => (await sys.query('SELECT status FROM app.ai_bevestiging WHERE id = $1', [bev2])).rows[0]?.status !== 'wacht', 3000);
    check('ai-mcp-12: blokkeren van de gebruiker wijst wachtende aanroepen af en trekt open bevestigingen in', (await store.getToolCall(u3.id, t2.id))?.status === 'rejected'
      && (await sys.query('SELECT status FROM app.ai_bevestiging WHERE id = $1', [bev2])).rows[0]?.status === 'ingetrokken');
    await grants.unblockUser(u3.id, u3.id);
    // Verse goedkeuring: een aanroep ouder dan de termijn kan niet meer worden goedgekeurd, ook als de lijst nooit is opgevraagd.
    const t3 = await store.createToolCall(u3.id, 'calendar_create_event', { title: 'oud' });
    await sys.query(`UPDATE app.connector_tool_calls SET created_at = now() - make_interval(mins => $2) WHERE id = $1`, [t3.id, store.TOOL_CALL_TTL_MIN + 1]);
    const oudGoed = await store.transitionToolCall(t3.id, u3.id, ['pending_approval'], 'approved');
    const t4 = await store.createToolCall(u3.id, 'calendar_create_event', { title: 'vers' });
    const versGoed = await store.transitionToolCall(t4.id, u3.id, ['pending_approval'], 'approved');
    const oudWeiger = await store.createToolCall(u3.id, 'calendar_create_event', { title: 'oud2' });
    await sys.query(`UPDATE app.connector_tool_calls SET created_at = now() - make_interval(mins => $2) WHERE id = $1`, [oudWeiger.id, store.TOOL_CALL_TTL_MIN + 1]);
    check('ai-mcp-12: een verlopen aanroep (ouder dan TOOL_CALL_TTL_MIN) kan niet meer worden goedgekeurd; een verse wel; weigeren mag altijd',
      oudGoed === null && versGoed?.status === 'approved' && (await store.transitionToolCall(oudWeiger.id, u3.id, ['pending_approval'], 'rejected'))?.status === 'rejected');

    // ---------------------------------------------------------------- geheimen-05: omslagen weg bij intrekken / verlopen / passkey verwijderd
    const sk = await import('../../backend/sleutelkluis');
    const mst = await import('../../backend/mcp-connector-opslag');
    const opr = await import('../../backend/sleutelkluis-opruimen');
    sk.zetHouderControle(async () => true);
    const u4 = await mk(`kluis-${sfx}@eenheid.test`); gebruikers.push(u4.id);
    const lade = { userId: u4.id, ruimte: 'prive' as const };
    await sk.inschakelen(lade, { soort: 'sessie', id: `s-${sfx}` });
    const clientId = `sec002-${randomBytes(6).toString('hex')}`;
    await mst.insertClient(clientId, 'proef-klant', ['https://example.invalid/cb']);
    const nieuweGrant = async () => {
      const toegang = `mcpa_${randomBytes(32).toString('base64url')}`, vernieuw = `mcpr_${randomBytes(32).toString('base64url')}`;
      const id = await mst.insertToken({ userId: u4.id, clientId, clientName: 'proef-klant', scope: 'mcp', accessHash: sha(toegang), refreshHash: sha(vernieuw) } as never);
      const ok = await sk.grantVerzegelen(String(id), { toegang, vernieuw });
      return { id: String(id), ok };
    };
    const tel = async (soort: string, houder: string) => Number((await sys.query('SELECT count(*)::int AS n FROM app.sleutelkluis_omslag WHERE soort = $1 AND houder = $2', [soort, houder])).rows[0].n);
    const g1 = await nieuweGrant();
    check('geheimen-05: opzet — een AI-verbinding heeft twee omslagen (toegang, vernieuw)', g1.ok && (await tel('grant', g1.id)) === 2);
    await grants.stopAll(u4.id, u4.id);
    check('geheimen-05: na «Стоп» zijn de omslagen van de ingetrokken verbinding WEG en is zij geen houder van de open sleutel meer',
      (await tel('grant', g1.id)) === 0 && !sk.houdersVan(lade).some((h) => h.soort === 'grant'), `omslagen=${await tel('grant', g1.id)} houders=${sk.houdersVan(lade).map((h) => h.soort).join(',')}`);
    const g2 = await nieuweGrant();
    await grants.blockUser(u4.id, u4.id, 'test');
    check('geheimen-05: na blokkeren van de gebruiker zijn de omslagen weg', g2.ok && (await tel('grant', g2.id)) === 0);
    await grants.unblockUser(u4.id, u4.id);
    // Vanzelf verlopen verbinding + passkey zonder rij: de periodieke opruimer haalt ze weg; een levende verbinding blijft.
    const g3 = await nieuweGrant(), g4 = await nieuweGrant();
    await sys.query(`UPDATE app.mcp_oauth_tokens SET refresh_expires_at = now() - interval '1 minute' WHERE id::text = $1`, [g3.id]);
    const weesPasskey = randomUUID();
    await sys.query(`INSERT INTO app.sleutelkluis_omslag (user_id, ruimte, soort, houder, deel, parameters, envelop) VALUES ($1, 'prive', 'passkey', $2, '', '{"salt":"proefproefproefproef","prf":true}'::jsonb, 'omslag1.aaaa.bbbb.cccc')`, [u4.id, weesPasskey]);
    const weg = await opr.omslagenOpruimen();
    check('geheimen-05: omslagenOpruimen() verwijdert omslagen van verlopen verbindingen en van verwijderde passkeys, niet die van een levende verbinding',
      (await tel('grant', g3.id)) === 0 && (await tel('passkey', weesPasskey)) === 0 && (await tel('grant', g4.id)) === 2 && weg.grant >= 2 && weg.passkey >= 1, JSON.stringify(weg));
    check('geheimen-05: de herstelcode-omslag (de enige weg terug voor de mens) blijft altijd staan', Number((await sys.query(`SELECT count(*)::int AS n FROM app.sleutelkluis_omslag WHERE user_id = $1 AND soort = 'herstelcode'`, [u4.id])).rows[0].n) === 1);
    // Technische ruimte bevroren: alleen de technische verbindingen (en hun omslagen) weg.
    await sys.query(`UPDATE app.mcp_oauth_tokens SET ruimte = 'technisch' WHERE id::text = $1`, [g4.id]).catch(() => undefined);
    const rs = await import('../../backend/ruimte-scheiding');
    await rs.technischeVerbindingenIntrekken(u4.id, u4.id, 'test');
    check('geheimen-05: bevriezen van de technische ruimte haalt de omslagen van de technische verbinding weg', (await tel('grant', g4.id)) === 0);
    const bronTs = lees('backend/toegangssleutels.ts'), bronLade = lees('backend/ai-ruimte-lade.ts'), bronStart = lees('server/start.ts');
    check('geheimen-05 (bron): passkey verwijderen ruimt de passkey-omslagen van beide ruimtes op; de la-uitvoerder en de periodieke ronde roepen de opruimer aan',
      /passkeyOmslagenWeg\(auth\.user\.id, String\(rij\.id\)\)/.test(bronTs) && (bronLade.match(/grantsSluitenVoorGebruiker\(/g) || []).length >= 2 && /omslagenOpruimen\(\)/.test(bronStart));
    await sys.query('DELETE FROM app.mcp_oauth_tokens WHERE user_id = $1', [u4.id]).catch(() => undefined);
    await sys.query('DELETE FROM app.mcp_oauth_clients WHERE client_id = $1', [clientId]).catch(() => undefined);
    await sys.query('DELETE FROM app.sleutelkluis_omslag WHERE user_id = $1', [u4.id]).catch(() => undefined);
    await sys.query('DELETE FROM app.sleutelkluis WHERE user_id = $1', [u4.id]).catch(() => undefined);
    sk.geheugenLeeg();
  } finally {
    process.off('unhandledRejection', vang);
    if (oudLegacy !== undefined) process.env.AGENT_WS_TOKEN_AUTH_LEGACY = oudLegacy;
    await sys.query('DELETE FROM app.ai_bevestiging WHERE user_id = ANY($1)', [gebruikers]).catch(() => undefined);
    await sys.query('DELETE FROM app.connector_tool_calls WHERE user_id = ANY($1)', [gebruikers]).catch(() => undefined);
    await sys.query('DELETE FROM app.agents WHERE id = ANY($1::uuid[])', [agentIds]).catch(() => undefined);
    await sys.query('DELETE FROM app.ai_grants WHERE user_id = ANY($1)', [gebruikers]).catch(() => undefined);
    await sys.query('DELETE FROM app.user_ai_settings WHERE user_id = ANY($1)', [gebruikers]).catch(() => undefined);
    await sys.query(`DELETE FROM app.records WHERE tbl = 'users' AND id = ANY($1)`, [gebruikers]).catch(() => undefined);
    rmSync(werk, { recursive: true, force: true });
  }
  return einde();
}
