#!/usr/bin/env node
// Hub Agent: універсальний Local Machine Connector. Без залежностей, Node >= 22 (вбудований WebSocket).
//
//   node agent.mjs pair --server https://mcp.tarasevych.com --code ABCD2345 --name "My PC" \
//                       --root C:\projects --root D:\notes --allow git,node,python
//   node agent.mjs run
//
// Агент сам підключається до сайту (вихідне з'єднання) — відкривати порти не потрібно.
// Обмеження (root-и, allow-list команд) перевіряються ТУТ, незалежно від того, що дозволив сервер.

import { spawn } from 'node:child_process';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { promises as fs, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VERSION = '0.3.1';
const CONFIG_PATH = process.env.HUB_AGENT_CONFIG ?? path.join(os.homedir(), '.hub-agent', 'config.json');
const MAX_READ = 2 * 1024 * 1024;
const MAX_WRITE = 5 * 1024 * 1024;
const MAX_OUTPUT = 1024 * 1024;
const EXEC_TIMEOUT_MS = 60_000;

// ---------- config ----------
const loadConfig = () => JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
function saveConfig(cfg) {
  mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function parseArgs(argv) {
  const out = { _: [], root: [], 'readonly-root': [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const val = argv[++i];
    if (key === 'root' || key === 'readonly-root') out[key].push(val); else out[key] = val;
  }
  return out;
}

// ---------- pair ----------
async function pair(args) {
  if (!args.server || !args.code) die('usage: pair --server <url> --code <CODE> [--name N] [--root DIR]... [--allow cmd1,cmd2]');
  // --readonly-root: ook een root, maar alleen lezen/tonen (bv. de back-ups op R:\ — een agent mag ze nooit wijzigen).
  const readonlyRoots = args['readonly-root'].map((r) => path.resolve(r));
  const roots = [...args.root.map((r) => path.resolve(r)), ...readonlyRoots];
  if (!roots.length) die('вкажіть хоча б одну дозволену папку: --root <DIR> (або --readonly-root <DIR>)');
  const allow = (args.allow ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const name = args.name ?? os.hostname();
  const server = args.server.replace(/\/$/, '');

  const refused = allow.filter((c) => SHELLS.has(c.toLowerCase().replace(/\.exe$/, '')));
  if (refused.length) die(`ці програми не можна дозволити (оболонки обходять усі обмеження): ${refused.join(', ')}`);
  // Одна й та сама установка зберігає pairingId: повторне підключення відкликає попередній токен на сервері.
  let pairingId = null;
  try { pairingId = loadConfig().pairingId ?? null; } catch { /* перше підключення */ }
  pairingId = pairingId || `pc-${randomUUID()}`;
  const res = await fetch(`${server}/api/owner/agents/pair`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: args.code, name, platform: `${os.platform()}-${os.arch()}`, pairingId, version: VERSION, capabilities: capabilities(roots, allow, readonlyRoots) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) die(`pairing failed: ${body.error ?? res.status}`);
  if (!body.commandKey) die('сервер не надав ключ підпису команд; оновіть сервер (потрібна версія з підписаними командами)');
  saveConfig({ server, agentId: body.agentId, token: body.token, commandKey: body.commandKey, tokenExpiresAt: body.tokenExpiresAt ?? null, pairingId, roots, readonlyRoots, allow });
  console.log(`Paired. Конфіг: ${CONFIG_PATH}\nТепер запустіть: node agent.mjs run`);
}

// De lijst komt uit de handlers zelf, zodat hij nooit achterloopt op wat de agent kan.
const capabilities = (roots, allow, readonlyRoots = []) => ({ version: VERSION, roots, readonlyRoots, allowCommands: allow, commands: Object.keys(handlers) });

// ---------- opdrachten: alleen ondertekend, geen code-als-argument (audit H3) ----------
/** Programma's die nooit op de allow-list mogen: een shell voert alles uit wat in een argument staat. */
const SHELLS = new Set(['cmd', 'powershell', 'pwsh', 'bash', 'sh', 'zsh', 'fish', 'dash', 'ksh', 'wsl', 'env', 'xargs', 'nohup', 'sudo', 'runas', 'osascript', 'wscript', 'cscript', 'mshta', 'rundll32', 'regsvr32']);
/** Interpreters en de vlaggen waarmee je code als tekst meegeeft (of een willekeurige module laadt). */
const CODE_FLAGS = {
  node: ['-e', '--eval', '-p', '--print', '-r', '--require', '--import', '--loader', '--experimental-loader', '-i', '--interactive'],
  deno: ['eval', '-e', '--eval'], bun: ['-e', '--eval', '-p', '--print'],
  python: ['-c', '-m', '-i'], python3: ['-c', '-m', '-i'], py: ['-c', '-m', '-i'], pythonw: ['-c', '-m', '-i'],
  ruby: ['-e', '-r', '-I'], perl: ['-e', '-E', '-M', '-m', '-I'], php: ['-r', '-B', '-R', '-E', '-a'],
  lua: ['-e', '-l'], Rscript: ['-e', '--expr'], R: ['-e'], java: ['-jar'], jshell: ['-'], tclsh: ['-c'],
  git: ['-c', '--config-env', '--exec-path', '--upload-pack', '-u', '--receive-pack'],
  npx: ['-c', '--call'], npm: ['exec', 'x', 'explore', '--call', '-c'],
};
function checkInterpreterArgs(name, args) {
  const key = Object.keys(CODE_FLAGS).find((k) => k.toLowerCase() === name.toLowerCase());
  if (SHELLS.has(name.toLowerCase())) throw new Error(`"${name}" is a shell and can never be run by the agent`);
  if (!key) return;
  const flags = CODE_FLAGS[key];
  for (const a of args) {
    const head = a.split('=')[0];
    // Ook samengevoegde korte vlaggen: node -pe, python -Sc, perl -we.
    const short = /^-[A-Za-z]{2,}$/.test(head) ? [...head.slice(1)].map((c) => `-${c}`) : [head];
    if (short.some((f) => flags.includes(f)) || flags.includes(head)) throw new Error(`argument "${head}" of ${name} runs code from text and is refused`);
    if (key === 'git' && /^(core\.|alias\.|credential\.|protocol\.)/i.test(a)) throw new Error('git configuration overrides are refused');
  }
}

/** HMAC-handtekening van de server controleren (zelfde tekst als backend/connectors-crypto.ts commandSigText). */
function verifySignature(cfg, msg, now = Date.now()) {
  if (!cfg.commandKey) return process.env.HUB_AGENT_ALLOW_UNSIGNED === '1';
  if (typeof msg.sig !== 'string' || typeof msg.exp !== 'number' || msg.exp < now || msg.exp > now + 10 * 60_000) return false;
  const text = `v1\n${msg.id}\n${msg.type}\n${createHash('sha256').update(JSON.stringify(msg.params ?? {})).digest('hex')}\n${msg.exp}`;
  const want = createHmac('sha256', Buffer.from(cfg.commandKey, 'base64url')).update(text).digest();
  const got = Buffer.from(/^[0-9a-f]{64}$/.test(msg.sig) ? msg.sig : '', 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
const seenIds = new Set();

// ---------- sandbox ----------
const isWin = process.platform === 'win32';
const norm = (p) => (isWin ? p.toLowerCase() : p);
/** Eén afsluitend scheidingsteken. Een schijfwortel als `T:\` of `/` heeft er al één: `T:\` + `\` = `T:\\`,
 *  waarop geen enkel pad begint. Dat was de oorzaak van «path outside allowed roots» voor elke submap van T:\. */
const metSep = (p) => (p.endsWith(path.sep) ? p : p + path.sep);
const binnen = (pad, root) => norm(metSep(pad)) === norm(metSep(root)) || norm(pad).startsWith(norm(metSep(root)));

/**
 * Plekken met sleutels en geheimen: nooit lezen, schrijven, tonen als inhoud of als werkmap, ook niet binnen een
 * toegestane root (bv. T:\mijn-ruimte\geheim met de uitrolsleutel). Mappen gelden met alles eronder.
 */
const GEHEIME_MAPPEN = new Set(['geheim', 'geheimen', 'secrets', '.ssh', '.gnupg', '.hub-agent', '.aws', '.azure', '.kube', '.docker']);
const GEHEIME_BESTANDEN = [
  /\.(pem|key|p12|pfx|ppk|kdbx|jks|keystore|asc|gpg)$/i,
  /^\.env(\..+)?$/i, /^geheimen\.env$/i, /^migratie\.env$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i, /^known_hosts$/i, /^authorized_keys$/i,
  /^uitrol-sleutel/i, /^recovery\.key/i, /^access-seal\.key$/i,
  /^credentials(\.json)?$/i, /^config\.json$/i,
];
/** `config.json` alleen in `.hub-agent` geheim (daar staat het agenttoken); elders gewone projectbestanden. */
function isGeheim(real) {
  const delen = real.split(/[\\/]+/).filter(Boolean);
  const naam = delen[delen.length - 1] || '';
  const mappen = delen.slice(0, -1).map((d) => d.toLowerCase());
  if (delen.some((d) => GEHEIME_MAPPEN.has(d.toLowerCase()))) return true;
  return GEHEIME_BESTANDEN.some((re) => re.test(naam) && (re.source !== '^config\\.json$' || mappen.includes('.hub-agent')));
}

/**
 * Шлях має лежати всередині root; symlink/`..` не дозволяють вийти назовні (перевіряється realpath).
 * `schrijven`: alleen in roots die niet als alleen-lezen zijn gekoppeld (`--readonly-root`, bv. de back-ups op R:\).
 */
async function safePath(cfg, p, { schrijven = false } = {}) {
  if (typeof p !== 'string' || !p) throw new Error('path required');
  const abs = path.resolve(cfg.roots[0], p);
  let existing = abs;
  const tail = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    tail.unshift(path.basename(existing));
    existing = parent;
  }
  const real = path.join(await fs.realpath(existing), ...tail);
  if (isGeheim(real)) throw new Error('path is a protected secret location (keys, .env, geheim) and is never available to agents');
  for (const root of cfg.roots) {
    const rr = await fs.realpath(root).catch(() => root);
    if (!binnen(real, rr)) continue;
    if (schrijven && (cfg.readonlyRoots ?? []).some((ro) => norm(metSep(ro)) === norm(metSep(root)))) {
      throw new Error('path is in a read-only root (the owner allowed reading only)');
    }
    return real;
  }
  throw new Error('path outside allowed roots');
}

// ---------- vaste programma's (docker, powershell): altijd shell:false, vaste argumenten ----------
/** Start `file` met een vaste argumentenlijst, met tijdslimiet en uitvoerlimiet. Nooit via een shell. */
function runFixed(file, argv, { timeout = 30_000, max = MAX_OUTPUT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, argv, { shell: false, windowsHide: true });
    let stdout = ''; let stderr = ''; let truncated = false;
    const add = (buf, which) => {
      if (stdout.length + stderr.length > max) { truncated = true; return; }
      which === 'o' ? (stdout += buf.toString()) : (stderr += buf.toString());
    };
    child.stdout.on('data', (d) => add(d, 'o'));
    child.stderr.on('data', (d) => add(d, 'e'));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr, truncated }); });
  });
}

const CONTAINER_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;   // geen spaties, geen leidend "-" (geen optie-injectie)
const DOCKER_ACTIONS = new Set(['start', 'stop', 'restart']);
const requireDocker = (cfg) => {
  if (!cfg.allow.includes('docker')) throw new Error('docker is not in the agent allow-list (start the agent with --allow docker)');
};

// Vast PowerShell-script (geen invoer van buiten): CPU-belasting, geheugen en vaste schijven als JSON.
const WIN_METRICS_PS = [
  "$ErrorActionPreference='Stop'",
  "$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average",
  "$os = Get-CimInstance Win32_OperatingSystem",
  "$disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { [pscustomobject]@{ name=$_.DeviceID; totalBytes=[int64]$_.Size; freeBytes=[int64]$_.FreeSpace } })",
  "[pscustomobject]@{ cpuPercent=$cpu; totalKB=[int64]$os.TotalVisibleMemorySize; freeKB=[int64]$os.FreePhysicalMemory; disks=$disks } | ConvertTo-Json -Compress -Depth 4",
].join('; ');

const round1 = (n) => Math.round(n * 10) / 10;
const gb = (bytes) => round1(bytes / 1024 ** 3);

/** CPU-gebruik in procenten uit twee metingen van os.cpus() (os.loadavg() is 0 op Windows). */
async function sampleCpuPercent(ms = 500) {
  const take = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { idle: a.idle + c.times.idle, total: a.total + t }; }, { idle: 0, total: 0 });
  const a = take(); await new Promise((r) => setTimeout(r, ms)); const b = take();
  const total = b.total - a.total;
  return total > 0 ? round1(100 * (1 - (b.idle - a.idle) / total)) : null;
}

// ---------- command handlers ----------
const handlers = {
  async 'sys.info'(cfg) {
    return { hostname: os.hostname(), platform: os.platform(), arch: os.arch(), uptime: os.uptime(), roots: cfg.roots, readonlyRoots: cfg.readonlyRoots ?? [], allowCommands: cfg.allow };
  },
  async 'fs.list'(cfg, { path: p = '.' }) {
    const dir = await safePath(cfg, p);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    // Geheime plekken blijven zichtbaar als naam (zodat de eigenaar ziet dat ze er zijn), maar met protected: true.
    return entries.slice(0, 2000).map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file', ...(isGeheim(path.join(dir, e.name)) ? { protected: true } : {}) }));
  },
  async 'fs.read'(cfg, { path: p }) {
    const file = await safePath(cfg, p);
    const st = await fs.stat(file);
    if (st.size > MAX_READ) throw new Error(`file too large (${st.size} > ${MAX_READ})`);
    return { path: file, content: await fs.readFile(file, 'utf8') };
  },
  async 'fs.write'(cfg, { path: p, content }) {
    if (typeof content !== 'string') throw new Error('content must be a string');
    if (Buffer.byteLength(content) > MAX_WRITE) throw new Error('content too large');
    const file = await safePath(cfg, p, { schrijven: true });
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
    return { path: file, bytes: Buffer.byteLength(content) };
  },
  // Docker (alleen met "docker" in --allow). Vaste argumenten; de containernaam is streng gevalideerd.
  async 'docker.ps'(cfg, { include_stopped } = {}) {
    requireDocker(cfg);
    const argv = ['ps', ...(include_stopped === false ? [] : ['-a']), '--no-trunc', '--format', '{{json .}}'];
    const r = await runFixed('docker', argv, { timeout: 30_000 });
    if (r.code !== 0) throw new Error(`docker ps failed: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
    const containers = r.stdout.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 500).map((line) => {
      try { const c = JSON.parse(line); return { id: String(c.ID ?? '').slice(0, 12), name: c.Names, image: c.Image, state: c.State, status: c.Status, ports: c.Ports || '' }; }
      catch { return null; }
    }).filter(Boolean);
    return { count: containers.length, containers, truncated: r.truncated };
  },
  async 'docker.manage'(cfg, { container, action } = {}) {
    requireDocker(cfg);
    if (typeof container !== 'string' || !CONTAINER_RE.test(container)) throw new Error('invalid container name');
    if (typeof action !== 'string' || !DOCKER_ACTIONS.has(action)) throw new Error('invalid action (start, stop or restart)');
    const r = await runFixed('docker', [action, container], { timeout: 90_000 });
    if (r.code !== 0) throw new Error(`docker ${action} failed: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
    return { container, action, ok: true, output: r.stdout.trim().slice(0, 200) };
  },
  // CPU / geheugen / schijf. Windows: vast PowerShell-script; elders (of als PowerShell faalt) de tellers van het besturingssysteem.
  async 'sys.metrics'(cfg) {
    const out = { platform: os.platform(), hostname: os.hostname(), uptimeSeconds: Math.round(os.uptime()), cpu: { cores: os.cpus().length, percent: null }, memory: null, disks: [], source: 'node' };
    let fromPs = null;
    if (isWin) {
      try {
        const r = await runFixed('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WIN_METRICS_PS], { timeout: 20_000 });
        if (r.code === 0) fromPs = JSON.parse(r.stdout.trim());
        else out.note = `powershell failed: ${r.stderr.trim().slice(0, 200)}`;
      } catch (e) { out.note = `powershell unavailable: ${e.message}`; }
    }
    if (fromPs) {
      out.source = 'powershell';
      out.cpu.percent = fromPs.cpuPercent == null ? null : round1(Number(fromPs.cpuPercent));
      const total = Number(fromPs.totalKB) * 1024, free = Number(fromPs.freeKB) * 1024;
      out.memory = { totalMB: Math.round(total / 1048576), usedMB: Math.round((total - free) / 1048576), percent: round1(100 * (total - free) / total) };
      const list = Array.isArray(fromPs.disks) ? fromPs.disks : fromPs.disks ? [fromPs.disks] : [];
      out.disks = list.filter((d) => Number(d.totalBytes) > 0).map((d) => ({ name: d.name, totalGB: gb(d.totalBytes), freeGB: gb(d.freeBytes), usedPercent: round1(100 * (1 - d.freeBytes / d.totalBytes)) }));
    } else {
      out.cpu.percent = await sampleCpuPercent();
      const total = os.totalmem(), free = os.freemem();
      out.memory = { totalMB: Math.round(total / 1048576), usedMB: Math.round((total - free) / 1048576), percent: round1(100 * (total - free) / total) };
      for (const dir of [...new Set(['/', ...cfg.roots])]) {
        try { const s = await fs.statfs(dir); const totalB = s.bsize * s.blocks, freeB = s.bsize * s.bavail; if (totalB > 0) out.disks.push({ name: dir, totalGB: gb(totalB), freeGB: gb(freeB), usedPercent: round1(100 * (1 - freeB / totalB)) }); } catch { /* map niet leesbaar */ }
      }
    }
    return out;
  },
  // Без shell: команда + масив аргументів, тому ін'єкції через `;` `&&` `|` неможливі.
  async exec(cfg, { command, args = [], cwd = '.' }) {
    if (typeof command !== 'string' || !Array.isArray(args) || args.some((a) => typeof a !== 'string')) throw new Error('bad exec params');
    const name = path.basename(command).replace(/\.(exe|cmd|bat)$/i, '');
    if (command !== path.basename(command) || !cfg.allow.includes(name)) throw new Error(`command "${command}" is not in the agent allow-list`);
    checkInterpreterArgs(name, args);
    const dir = await safePath(cfg, cwd, { schrijven: true });
    // Argumenten die naar een geheime plek wijzen (bv. `git -C T:\mijn-ruimte\geheim …`, `node x.js ..\.env`) weigeren.
    for (const a of args) {
      const waarde = a.includes('=') && a.startsWith('-') ? a.slice(a.indexOf('=') + 1) : a;
      if (/[\\/]|^\.|\.[a-z0-9]{2,8}$/i.test(waarde) && isGeheim(path.resolve(dir, waarde))) throw new Error(`argument "${a}" points to a protected secret location`);
    }
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd: dir, shell: false, windowsHide: true });
      let out = ''; let err = ''; let truncated = false;
      const add = (buf, which) => {
        const s = buf.toString();
        if (out.length + err.length > MAX_OUTPUT) { truncated = true; return; }
        which === 'o' ? (out += s) : (err += s);
      };
      child.stdout.on('data', (d) => add(d, 'o'));
      child.stderr.on('data', (d) => add(d, 'e'));
      const timer = setTimeout(() => child.kill('SIGKILL'), EXEC_TIMEOUT_MS);
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout: out, stderr: err, truncated }); });
    });
  },
};

// ---------- selftest ----------
// node agent.mjs selftest --root <map>   Controleert de beveiligingsregels van de agent lokaal, zonder server:
// uitbreken uit de map (.., absoluut pad, naastgelegen map met dezelfde prefix, symlink/junction), allow-list van
// commando's, grootte-limieten. Werkt alleen in <map>\_selftest* en ruimt zichzelf op. Exitcode 1 bij een FOUT.
async function selftest(args) {
  if (!args.root.length) die('usage: selftest --root <DIR>');
  const base = path.resolve(args.root[0]);
  const work = path.join(base, '_selftest');
  const evil = `${work}-evil`;       // zelfde prefix als de toegestane map
  const buiten = path.join(base, '_selftest-buiten');
  for (const d of [work, evil, buiten]) { await fs.rm(d, { recursive: true, force: true }); await fs.mkdir(d, { recursive: true }); }
  await fs.writeFile(path.join(evil, 'x.txt'), 'geheim');
  await fs.writeFile(path.join(buiten, 'secret.txt'), 'geheim');
  await fs.writeFile(path.join(base, '_selftest-outside.txt'), 'geheim');
  const cfg = { roots: [work], allow: ['node'] };
  let fouten = 0;
  const check = (naam, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); if (!ok) fouten++; };
  const geweigerd = async (fn, patroon) => { try { await fn(); return 'geen fout'; } catch (e) { return patroon.test(e.message) ? true : e.message; } };
  const BUITEN = /outside allowed roots/;
  try {
    await handlers['fs.write'](cfg, { path: 'a/b.txt', content: 'hoi' });
    check('schrijven en lezen binnen de map', (await handlers['fs.read'](cfg, { path: 'a/b.txt' })).content === 'hoi');
    check('map tonen', (await handlers['fs.list'](cfg, { path: 'a' })).some((e) => e.name === 'b.txt'));
    check('relatief pad met .. buiten de map geweigerd', (await geweigerd(() => handlers['fs.read'](cfg, { path: '../_selftest-outside.txt' }), BUITEN)) === true);
    check('absoluut pad buiten de map geweigerd', (await geweigerd(() => handlers['fs.read'](cfg, { path: path.join(base, '_selftest-outside.txt') }), BUITEN)) === true);
    check('naastgelegen map met dezelfde prefix geweigerd', (await geweigerd(() => handlers['fs.read'](cfg, { path: '../_selftest-evil/x.txt' }), BUITEN)) === true);
    check('schrijven buiten de map geweigerd', (await geweigerd(() => handlers['fs.write'](cfg, { path: '../_selftest-nieuw.txt', content: 'x' }), BUITEN)) === true);
    try {
      await fs.symlink(buiten, path.join(work, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
      check('lezen via symlink/junction naar buiten geweigerd', (await geweigerd(() => handlers['fs.read'](cfg, { path: 'link/secret.txt' }), BUITEN)) === true);
      check('schrijven via symlink/junction naar buiten geweigerd', (await geweigerd(() => handlers['fs.write'](cfg, { path: 'link/nieuw.txt', content: 'x' }), BUITEN)) === true);
    } catch (e) { check('symlink-test', false, `kon geen link maken: ${e.code || e.message}`); }
    check('fs.write met niet-tekst geweigerd', (await geweigerd(() => handlers['fs.write'](cfg, { path: 'n.bin', content: 42 }), /string/)) === true);
    check('fs.write boven de limiet geweigerd', (await geweigerd(() => handlers['fs.write'](cfg, { path: 'groot.txt', content: 'x'.repeat(MAX_WRITE + 1) }), /too large/)) === true);
    await fs.writeFile(path.join(work, 'leesgroot.txt'), 'x'.repeat(MAX_READ + 1));
    check('fs.read boven de limiet geweigerd', (await geweigerd(() => handlers['fs.read'](cfg, { path: 'leesgroot.txt' }), /too large/)) === true);
    check('commando buiten de allow-list geweigerd', (await geweigerd(() => handlers.exec(cfg, { command: 'git', args: ['--version'] }), /allow-list/)) === true);
    check('commando met pad geweigerd (alleen programmanaam)', (await geweigerd(() => handlers.exec(cfg, { command: path.join(base, 'node.exe'), args: [] }), /allow-list/)) === true);
    check('cwd buiten de map geweigerd', (await geweigerd(() => handlers.exec(cfg, { command: 'node', args: ['-v'], cwd: '..' }), BUITEN)) === true);
    await fs.writeFile(path.join(work, 'som.js'), 'console.log(41+1)');
    await fs.writeFile(path.join(work, 'meta.js'), 'console.log(process.argv[2])');
    const ok = await handlers.exec(cfg, { command: 'node', args: ['som.js'] });
    check('toegestaan commando draait (zonder shell)', ok.code === 0 && ok.stdout.trim() === '42', JSON.stringify([ok.code, ok.stdout.trim()]));
    const meta = await handlers.exec(cfg, { command: 'node', args: ['meta.js', 'a;b && c | d'] });
    const evals = [['-e', 'x'], ['--eval=x'], ['-pe', 'x'], ['-p', 'x'], ['--require', 'x'], ['--import', 'x']];
    const evalWeg = [];
    for (const a of evals) evalWeg.push((await geweigerd(() => handlers.exec(cfg, { command: 'node', args: a }), /runs code from text/)) === true);
    check('node -e / --eval / -p / --require / --import geweigerd (audit H3)', evalWeg.every(Boolean), JSON.stringify(evals.filter((_, i) => !evalWeg[i])));
    const pcfg = { roots: [work], allow: ['python', 'cmd', 'powershell'] };
    check('python -c en -m geweigerd', (await geweigerd(() => handlers.exec(pcfg, { command: 'python', args: ['-c', 'print(1)'] }), /runs code/)) === true
      && (await geweigerd(() => handlers.exec(pcfg, { command: 'python', args: ['-m', 'http.server'] }), /runs code/)) === true);
    check('shells (cmd, powershell) nooit, ook niet op de allow-list', (await geweigerd(() => handlers.exec(pcfg, { command: 'cmd', args: ['/c', 'dir'] }), /shell/)) === true
      && (await geweigerd(() => handlers.exec(pcfg, { command: 'powershell', args: ['-Command', 'x'] }), /shell/)) === true);
    const key = Buffer.alloc(32, 7).toString('base64url');
    const scfg = { commandKey: key };
    const exp = Date.now() + 60_000;
    const sig = createHmac('sha256', Buffer.from(key, 'base64url')).update(`v1\nid1\nfs.read\n${createHash('sha256').update(JSON.stringify({ path: 'a' })).digest('hex')}\n${exp}`).digest('hex');
    check('handtekening: geldig aanvaard; andere parameters, verlopen of zonder handtekening geweigerd',
      verifySignature(scfg, { id: 'id1', type: 'fs.read', params: { path: 'a' }, exp, sig }) === true
      && verifySignature(scfg, { id: 'id1', type: 'fs.read', params: { path: 'b' }, exp, sig }) === false
      && verifySignature(scfg, { id: 'id1', type: 'fs.read', params: { path: 'a' }, exp: Date.now() - 1, sig }) === false
      && verifySignature(scfg, { id: 'id1', type: 'fs.read', params: { path: 'a' } }) === false
      && verifySignature({}, { id: 'id1', type: 'fs.read', params: {} }) === (process.env.HUB_AGENT_ALLOW_UNSIGNED === '1'));
    check('shell-tekens in argumenten worden letterlijk doorgegeven', meta.stdout.trim() === 'a;b && c | d');

    // ---- docker en metrics: geen docker nodig, alleen de afwijzingen en de vorm van het resultaat ----
    check('docker.ps zonder "docker" in de allow-list geweigerd', (await geweigerd(() => handlers['docker.ps'](cfg, {}), /allow-list/)) === true);
    check('docker.manage zonder "docker" in de allow-list geweigerd', (await geweigerd(() => handlers['docker.manage'](cfg, { container: 'web', action: 'restart' }), /allow-list/)) === true);
    const dcfg = { roots: [work], allow: ['docker'] };
    const slecht = ['a;b', '-rf', '--all', '../x', 'a b', '', 'x'.repeat(200), 'a$(id)', 'a`id`', 'a&&b', 'naam\nregel'];
    const afgewezen = [];
    for (const naam of slecht) afgewezen.push((await geweigerd(() => handlers['docker.manage'](dcfg, { container: naam, action: 'start' }), /invalid container/)) === true);
    check('docker.manage: gevaarlijke of ongeldige containernamen geweigerd vóór er iets start', afgewezen.every(Boolean), JSON.stringify(slecht.filter((_, i) => !afgewezen[i])));
    check('docker.manage: onbekende actie geweigerd',
      (await geweigerd(() => handlers['docker.manage'](dcfg, { container: 'web', action: 'rm' }), /invalid action/)) === true
      && (await geweigerd(() => handlers['docker.manage'](dcfg, { container: 'web', action: 'kill -9' }), /invalid action/)) === true);
    const m = await handlers['sys.metrics'](cfg);
    check('sys.metrics: CPU, geheugen en schijven met de verwachte vorm',
      m.cpu.cores > 0 && (m.cpu.percent === null || (m.cpu.percent >= 0 && m.cpu.percent <= 100)) && m.memory.totalMB > 0 && m.memory.usedMB <= m.memory.totalMB
      && Array.isArray(m.disks) && m.disks.length > 0 && m.disks.every((d) => d.totalGB > 0 && d.usedPercent >= 0 && d.usedPercent <= 100),
      JSON.stringify([m.source, m.cpu, m.memory, m.disks.length]));
    check('capabilities noemt alle handlers (ook de nieuwe)', ['docker.ps', 'docker.manage', 'sys.metrics'].every((t) => capabilities([work], []).commands.includes(t)));

    // ---- 0.3.1: schijfwortel als root (T:\ of /) en geheime plekken ----
    const schijf = path.parse(work).root;   // 'T:\' op Windows, '/' elders: eindigt al op een scheidingsteken
    const wcfg = { roots: [schijf], allow: [] };
    check('root = schijfwortel: submap lezen en tonen werkt (was «path outside allowed roots»)',
      (await handlers['fs.read'](wcfg, { path: path.join(work, 'a', 'b.txt') })).content === 'hoi'
      && (await handlers['fs.list'](wcfg, { path: path.join(work, 'a') })).some((e) => e.name === 'b.txt'));
    await fs.mkdir(path.join(work, 'geheim'), { recursive: true });
    await fs.writeFile(path.join(work, 'geheim', 'uitrol-sleutel.txt'), 'x');
    await fs.writeFile(path.join(work, 'sleutel.pem'), 'x');
    await fs.writeFile(path.join(work, '.env'), 'X=1');
    await fs.writeFile(path.join(work, 'recovery.key.pem'), 'x');
    const GEHEIM = /protected secret/;
    const weg = [];
    for (const p of ['geheim/uitrol-sleutel.txt', 'geheim', 'sleutel.pem', '.env', 'recovery.key.pem', path.join(work, 'GEHEIM', 'uitrol-sleutel.txt')]) {
      weg.push((await geweigerd(() => (p === 'geheim' ? handlers['fs.list'](cfg, { path: p }) : handlers['fs.read'](cfg, { path: p })), GEHEIM)) === true);
    }
    check('geheime plekken (map geheim, *.pem, .env, recovery.key*) nooit lezen of tonen, ook niet via de schijfwortel', weg.every(Boolean)
      && (await geweigerd(() => handlers['fs.read'](wcfg, { path: path.join(work, 'sleutel.pem') }), GEHEIM)) === true, JSON.stringify(weg));
    check('schrijven in een geheime plek geweigerd', (await geweigerd(() => handlers['fs.write'](cfg, { path: 'geheim/nieuw.txt', content: 'x' }), GEHEIM)) === true
      && (await geweigerd(() => handlers['fs.write'](cfg, { path: '.env.local', content: 'x' }), GEHEIM)) === true);
    const lijst = await handlers['fs.list'](cfg, { path: '.' });
    check('fs.list: geheime namen gemarkeerd als protected, gewone niet',
      lijst.find((e) => e.name === 'geheim')?.protected === true && lijst.find((e) => e.name === 'sleutel.pem')?.protected === true && !lijst.find((e) => e.name === 'som.js')?.protected);
    check('exec: werkmap in geheim en argument naar een sleutel geweigerd',
      (await geweigerd(() => handlers.exec(cfg, { command: 'node', args: ['som.js'], cwd: 'geheim' }), GEHEIM)) === true
      && (await geweigerd(() => handlers.exec(cfg, { command: 'node', args: ['meta.js', './sleutel.pem'] }), /protected secret/)) === true
      && (await geweigerd(() => handlers.exec(cfg, { command: 'node', args: ['meta.js', '--in=.env'] }), /protected secret/)) === true);
    check('exec: gewone argumenten blijven werken', (await handlers.exec(cfg, { command: 'node', args: ['meta.js', 'notities.txt'] })).stdout.trim() === 'notities.txt');

    // ---- 0.3.1: alleen-lezen root (--readonly-root) ----
    const ro = buiten;
    const rcfg = { roots: [work, ro], readonlyRoots: [ro], allow: ['node'] };
    const RO = /read-only root/;
    check('alleen-lezen root: lezen en tonen werkt', (await handlers['fs.read'](rcfg, { path: path.join(ro, 'secret.txt') })).content === 'geheim'
      && (await handlers['fs.list'](rcfg, { path: ro })).some((e) => e.name === 'secret.txt'));
    check('alleen-lezen root: schrijven en exec met die werkmap geweigerd',
      (await geweigerd(() => handlers['fs.write'](rcfg, { path: path.join(ro, 'secret.txt'), content: 'weg' }), RO)) === true
      && (await geweigerd(() => handlers.exec(rcfg, { command: 'node', args: ['-v'], cwd: ro }), RO)) === true
      && (await fs.readFile(path.join(ro, 'secret.txt'), 'utf8')) === 'geheim');
    check('alleen-lezen root: schrijven in de gewone root blijft werken', (await handlers['fs.write'](rcfg, { path: 'c.txt', content: 'ok' })).bytes === 2);
  } catch (e) {
    check('onverwachte fout', false, e.message);
  } finally {
    for (const d of [work, evil, buiten]) await fs.rm(d, { recursive: true, force: true }).catch(() => {});
    await fs.rm(path.join(base, '_selftest-outside.txt'), { force: true }).catch(() => {});
  }
  console.log(fouten ? `\n${fouten} FOUT(EN)` : '\nalles OK');
  process.exit(fouten ? 1 : 0);
}

// ---------- run ----------
function run() {
  let cfg;
  try { cfg = loadConfig(); } catch { die(`немає конфігу ${CONFIG_PATH}. Спершу: node agent.mjs pair ...`); }
  const wsUrl = cfg.server.replace(/^http/, 'ws') + '/agent/ws';
  let delay = 1000;

  // Eerst een eenmalig ticket (60 s) met het token in de Authorization-header; het token gaat nooit over het WebSocket-kanaal of in een URL.
  const ticket = async () => {
    const res = await fetch(`${cfg.server}/api/owner/agents/ws-ticket`, { headers: { Authorization: `Bearer ${cfg.token}` }, cache: 'no-store' });
    if (res.status === 401) die('токен відкликано, недійсний або прострочений. Виконайте pair заново.');
    if (res.status === 404) return null; // oude server zonder tickets
    if (!res.ok) throw new Error(`ticket ${res.status}`);
    return (await res.json()).ticket;
  };
  if (cfg.tokenExpiresAt && Number(cfg.tokenExpiresAt) < Date.now()) die('термін дії токена минув. Виконайте pair заново.');
  if (!cfg.commandKey && process.env.HUB_AGENT_ALLOW_UNSIGNED !== '1') console.warn('[agent] увага: немає ключа підпису (старе підключення). Команди буде відхилено; виконайте pair заново.');

  const connect = async () => {
    let t = null;
    try { t = await ticket(); } catch (e) { console.log(`[agent] ${e.message}, retry in ${delay / 1000}s`); setTimeout(connect, delay); delay = Math.min(delay * 2, 30_000); return; }
    const ws = new WebSocket(wsUrl);
    let pinger = null;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'auth', ...(t ? { ticket: t } : { token: cfg.token }), version: VERSION, capabilities: capabilities(cfg.roots, cfg.allow, cfg.readonlyRoots) }));
      pinger = setInterval(() => { try { ws.send(JSON.stringify({ t: 'pong', version: VERSION, capabilities: capabilities(cfg.roots, cfg.allow, cfg.readonlyRoots) })); } catch { /* dicht */ } }, 20_000);
    };
    ws.onmessage = async (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'ready') { delay = 1000; console.log(`[agent] connected as ${msg.agentId}`); }
      else if (msg.t === 'ping') ws.send(JSON.stringify({ t: 'pong', version: VERSION, capabilities: capabilities(cfg.roots, cfg.allow, cfg.readonlyRoots) }));
      else if (msg.t === 'stop') console.log('[agent] Стоп: усі дозволи відкликано на сайті');
      else if (msg.t === 'cmd') {
        console.log(`[agent] ${msg.type}`, JSON.stringify(msg.params).slice(0, 200));
        try {
          if (!verifySignature(cfg, msg)) throw new Error('refused: invalid, missing or expired command signature');
          if (seenIds.has(msg.id)) throw new Error('refused: command already executed');
          seenIds.add(msg.id); if (seenIds.size > 5000) seenIds.clear();
          const h = handlers[msg.type];
          if (!h) throw new Error(`unsupported command: ${msg.type}`);
          ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: true, data: await h(cfg, msg.params ?? {}) }));
        } catch (e) {
          ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: false, error: e.message }));
        }
      }
    };
    ws.onclose = (ev) => {
      clearInterval(pinger);
      if (ev.code === 4403) die('токен відкликано або недійсний. Виконайте pair заново.');
      console.log(`[agent] disconnected (${ev.code}), retry in ${delay / 1000}s`);
      setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30_000);
    };
    ws.onerror = () => {};
  };
  connect();
}

function die(msg) { console.error(msg); process.exit(1); }

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (cmd === 'pair') await pair(args);
else if (cmd === 'run') run();
else if (cmd === 'selftest') await selftest(args);
else die('usage: node agent.mjs <pair|run|selftest>');
