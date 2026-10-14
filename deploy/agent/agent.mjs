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
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const VERSION = '0.7.1';
const CONFIG_PATH = process.env.HUB_AGENT_CONFIG ?? path.join(os.homedir(), '.hub-agent', 'config.json');
const RECHTEN_PATH = path.join(path.dirname(CONFIG_PATH), 'rechten.json');
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

/** Vlaggen zonder waarde. Vóór 0.7.1 nam elke vlag het volgende woord als waarde: `apps-config --disable` zette niets uit
 *  (waarde undefined) en `--test --runtime podman` zou `--runtime` als waarde opeten. */
const AAN_UIT_VLAGGEN = new Set(['disable', 'test']);
function parseArgs(argv) {
  const out = { _: [], root: [], 'readonly-root': [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    if (AAN_UIT_VLAGGEN.has(key)) { out[key] = true; continue; }
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
const capabilities = (roots, allow, readonlyRoots = [], apps = null, terminal = null) => ({ version: VERSION, roots, readonlyRoots, allowCommands: allow, apps: Boolean(apps?.enabled), terminal: terminal?.enabled ? { enabled: true, image: terminal.image, maxMinuten: terminal.maxMinuten, test: terminal.test === true } : { enabled: false }, commands: Object.keys(handlers).filter((k) => (!k.startsWith('apps.') || apps?.enabled) && (k !== 'term.open' || terminal?.enabled) && rechtAan(k)) });

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

// ---------- rechten per opdracht (0.7.0) ----------
/** Alle opdrachten die je met rechten.json per stuk aan of uit kunt zetten. Een ontbrekende sleutel = aan (zoals vóór 0.7.0).
 *  Nooit aanzetbaar, ook niet met rechten.json: shells, sudo en het wijzigen van de dienst zelf (zie SHELLS en de agent-regels). */
const RECHT_SLEUTELS = ['sys.info', 'sys.metrics', 'fs.list', 'fs.stat', 'fs.search', 'fs.read', 'fs.write', 'exec', 'docker.ps', 'docker.manage'];
let REC = {};
/** Leest rechten.json naast de config. Geen bestand of kapot bestand = alles zoals voorheen; een ongeldige sleutel wordt genegeerd. */
function laadRechten() {
  try {
    const raw = JSON.parse(readFileSync(RECHTEN_PATH, 'utf8'));
    REC = Object.fromEntries(Object.entries(raw ?? {}).filter(([k, v]) => RECHT_SLEUTELS.includes(k) && typeof v === 'boolean'));
  } catch { REC = {}; }
  return REC;
}
const rechtAan = (type) => REC[type] !== false;

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

// ---------- Додатки (PaaS на власному залізі, BYOS) ----------
// Вмикається лише явно: `node agent.mjs apps-config --apps-root DIR [--runtime podman|docker] [--domain "{app}.apps.example.com"]
// [--caddy-admin unix:/run/caddy/admin.sock | http://127.0.0.1:2019] [--caddy-server mijn-ruimte-apps] [--memory 512m]`.
// Кожен додаток — контейнер (rootless Podman за замовчуванням; Docker — якщо так налаштовано), без capabilities, no-new-privileges,
// з лімітами пам'яті/процесів, порт лише на 127.0.0.1; назовні — через Caddy (маршрут за доменом). Код ШІ ніколи не виконується
// на хості: лише всередині контейнера. Перед кожним розгортанням — знімок (tar.gz) і окремий образ; 5 останніх версій для відкату.
// Секрети: <apps-root>/secrets/<app>.env (0600), значення ніколи не повертаються; у журналах вони замінюються на «***».

export const APP_NAME_RE = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
const SECRET_KEY_RE = /^[A-Z_][A-Z0-9_]{0,63}$/;
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const FILE_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._@+\- /]{1,240}$/;
const APP_MAX_FILES = 800;
const APP_MAX_BYTES = 8 * 1024 * 1024;
const APP_KEEP_VERSIONS = 5;
const APP_PORT_MIN = 20000, APP_PORT_MAX = 20999;

const appsDefaults = (a = {}) => ({
  enabled: Boolean(a.enabled), root: a.root ?? '', runtime: a.runtime === 'docker' ? 'docker' : (a.runtime || 'podman'),
  domain: a.domain ?? '', caddyAdmin: a.caddyAdmin ?? '', caddyServer: a.caddyServer || 'mijn-ruimte-apps', memory: a.memory || '512m',
});
export const requireApps = (cfg) => {
  const a = appsDefaults(cfg.apps);
  if (!a.enabled || !a.root) throw new Error('apps are not enabled on this device (owner: node agent.mjs apps-config --apps-root <DIR>)');
  return a;
};
const appName = (name) => { if (typeof name !== 'string' || !APP_NAME_RE.test(name)) throw new Error('invalid app name (3-32 chars: a-z, 0-9, "-", starts with a letter)'); return name; };
const ctr = (name) => `mr-app-${name}`;
const img = (name, ver) => `localhost/mr-app-${name}:${ver}`;
const verNu = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

// één tegelijk per app (en het register) — eenvoudige promise-keten
const ketens = new Map();
const opRij = (key, fn) => { const vorige = ketens.get(key) ?? Promise.resolve(); const p = vorige.catch(() => {}).then(fn); const staart2 = p.finally(() => { if (ketens.get(key) === staart2) ketens.delete(key); }).catch(() => {}); ketens.set(key, staart2); return p; };

async function leesRegister(a) {
  try { return JSON.parse(await fs.readFile(path.join(a.root, 'registry.json'), 'utf8')); } catch { return { apps: {} }; }
}
async function schrijfRegister(a, reg) {
  await fs.mkdir(a.root, { recursive: true });
  const tmp = path.join(a.root, `.registry.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(reg, null, 2), { mode: 0o600 });
  await fs.rename(tmp, path.join(a.root, 'registry.json'));
}
const secretsPad = (a, name) => path.join(a.root, 'secrets', `${name}.env`);
async function leesSecrets(a, name) {
  try { const t = await fs.readFile(secretsPad(a, name), 'utf8'); return Object.fromEntries(t.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])); } catch { return {}; }
}
async function schrijfSecrets(a, name, obj) {
  await fs.mkdir(path.join(a.root, 'secrets'), { recursive: true, mode: 0o700 });
  await fs.writeFile(secretsPad(a, name), Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('\n') + (Object.keys(obj).length ? '\n' : ''), { mode: 0o600 });
}
const verberg = (tekst, secrets) => { let t = String(tekst ?? ''); for (const v of Object.values(secrets)) if (v && v.length >= 4) t = t.split(v).join('***'); return t; };
const staart = (t, n = 40) => String(t ?? '').split('\n').slice(-n).join('\n').slice(-6000);

async function rt(a, argv, opts) {
  const r = await runFixed(a.runtime, argv, opts);
  return r;
}
const vrijePoort = (gebruikt) => new Promise((resolve, reject) => {
  const probeer = (p) => {
    if (p > APP_PORT_MAX) return reject(new Error('no free port in 20000-20999'));
    if (gebruikt.has(p)) return probeer(p + 1);
    const s = net.createServer(); s.unref();
    s.once('error', () => probeer(p + 1));
    s.listen(p, '127.0.0.1', () => s.close(() => resolve(p)));
  };
  probeer(APP_PORT_MIN);
});
const wachtOpPoort = (port, ms) => new Promise((resolve) => {
  const tot = Date.now() + ms;
  const een = () => { const s = net.connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); resolve(true); }); s.once('error', () => { s.destroy(); if (Date.now() > tot) resolve(false); else setTimeout(een, 500); }); };
  een();
});

/** Dockerfile en poort bepalen als de code er zelf geen heeft. */
export function autoDockerfile(files, port) {
  const has = (p) => files.some((f) => f.path === p);
  const pkg = files.find((f) => f.path === 'package.json');
  if (pkg) {
    let start = true;
    try { const j = JSON.parse(pkg.encoding === 'base64' ? Buffer.from(pkg.content, 'base64').toString('utf8') : pkg.content); start = Boolean(j?.scripts?.start); } catch { start = false; }
    const main = has('server.js') ? 'server.js' : has('index.js') ? 'index.js' : has('app.js') ? 'app.js' : '';
    if (!start && !main) throw new Error('package.json has no "start" script and there is no server.js/index.js/app.js — add one or a Dockerfile');
    const p = port || 3000;
    return { port: p, dockerfile: ['FROM docker.io/library/node:22-alpine', 'WORKDIR /app', 'COPY package*.json ./', 'RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund', 'COPY . .', `ENV PORT=${p} NODE_ENV=production`, 'USER node', `EXPOSE ${p}`, start ? 'CMD ["npm","start"]' : `CMD ["node","${main}"]`].join('\n') + '\n' };
  }
  if (has('requirements.txt')) {
    const main = has('main.py') ? 'main.py' : has('app.py') ? 'app.py' : '';
    if (!main) throw new Error('requirements.txt found but no main.py/app.py — add one or a Dockerfile');
    const p = port || 8000;
    return { port: p, dockerfile: ['FROM docker.io/library/python:3.12-slim', 'WORKDIR /app', 'COPY requirements.txt .', 'RUN pip install --no-cache-dir -r requirements.txt', 'COPY . .', `ENV PORT=${p} PYTHONUNBUFFERED=1`, 'RUN useradd -r -u 10001 app && chown -R app /app', 'USER app', `EXPOSE ${p}`, `CMD ["python","${main}"]`].join('\n') + '\n' };
  }
  if (has('index.html')) {
    return { port: 8080, dockerfile: ['FROM docker.io/nginxinc/nginx-unprivileged:alpine', 'COPY . /usr/share/nginx/html', 'EXPOSE 8080'].join('\n') + '\n' };
  }
  throw new Error('cannot detect the app type: add a Dockerfile, a package.json, a requirements.txt or an index.html');
}

function caddyRequest(a, method, pad, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    const opts = { method, path: pad, headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': data.length } : {}) }, timeout: 10_000 };
    if (a.caddyAdmin.startsWith('unix:')) opts.socketPath = a.caddyAdmin.slice(5);
    else { const u = new URL(a.caddyAdmin); if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return reject(new Error('caddy admin must be local')); opts.host = u.hostname; opts.port = u.port || 2019; }
    opts.headers.Host = 'localhost';
    const req = http.request(opts, (res) => { let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => resolve({ status: res.statusCode, body: t })); });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('caddy timeout')));
    if (data) req.write(data); req.end();
  });
}
const domeinVoor = (a, name, eigen) => (eigen || (a.domain ? a.domain.replace('{app}', name) : ''));
async function routeZetten(a, name, host, hostPort) {
  if (!a.caddyAdmin || !host) return { routed: false };
  const id = `mr-app-${name}`;
  await caddyRequest(a, 'DELETE', `/id/${id}`).catch(() => {});
  const route = { '@id': id, match: [{ host: [host] }], handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: `127.0.0.1:${hostPort}` }] }], terminal: true };
  // Vooraan invoegen (PUT op index 0): zo gaat de route vóór een eventuele vangnet-route uit de Caddyfile.
  let r = await caddyRequest(a, 'PUT', `/config/apps/http/servers/${encodeURIComponent(a.caddyServer)}/routes/0`, route);
  if (r.status >= 300) r = await caddyRequest(a, 'POST', `/config/apps/http/servers/${encodeURIComponent(a.caddyServer)}/routes`, route);
  if (r.status >= 300) throw new Error(`caddy route failed (${r.status}): ${r.body.slice(0, 200)}`);
  return { routed: true };
}
async function routeWeg(a, name) { if (a.caddyAdmin) await caddyRequest(a, 'DELETE', `/id/mr-app-${name}`).catch(() => {}); }

/** Caddy vergeet routes die via de admin-API kwamen zodra hij met zijn Caddyfile herstart: daarom zet de agent ze bij het starten
 *  en daarna elke 5 minuten terug (alleen wat ontbreekt). Fouten blijven stil: de apps zelf draaien gewoon door. */
export async function routesHerstellen(cfg) {
  const a = appsDefaults(cfg.apps);
  if (!a.enabled || !a.root || !a.caddyAdmin) return 0;
  let n = 0;
  for (const app of Object.values((await leesRegister(a)).apps)) {
    const host = domeinVoor(a, app.name, app.domain);
    if (!host || !app.current || !app.hostPort) continue;
    const bestaat = await caddyRequest(a, 'GET', `/id/mr-app-${app.name}`).then((r) => r.status < 300).catch(() => false);
    if (!bestaat) { await opRij(`app:${app.name}`, () => routeZetten(a, app.name, host, app.hostPort)).then(() => { n += 1; }, () => {}); }
  }
  return n;
}

async function containerStarten(a, name, app, versie) {
  const secrets = await leesSecrets(a, name);
  await rt(a, ['rm', '-f', ctr(name)], { timeout: 60_000 });
  const env = Object.entries(app.env || {}).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const argv = ['run', '-d', '--name', ctr(name), '--label', `mijn-ruimte.app=${name}`, '--label', `mijn-ruimte.version=${versie}`,
    '--restart', 'unless-stopped', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--memory', a.memory, '--pids-limit', '256',
    '-p', `127.0.0.1:${app.hostPort}:${app.port}`, ...(Object.keys(secrets).length ? ['--env-file', secretsPad(a, name)] : []), ...env, img(name, versie)];
  const r = await rt(a, argv, { timeout: 120_000 });
  if (r.code !== 0) throw new Error(`run failed: ${verberg((r.stderr || r.stdout).trim(), secrets).slice(0, 500)}`);
  return secrets;
}

const jobs = new Map(); // name -> {state, version, error, log, startedAt, finishedAt, url}

async function deployUitvoeren(cfg, a, input) {
  const name = input.name;
  const job = jobs.get(name);
  const reg = await leesRegister(a);
  const oud = reg.apps[name];
  const versie = verNu();
  const bouwDir = path.join(a.root, 'builds', name, versie);
  await fs.mkdir(bouwDir, { recursive: true });
  for (const f of input.files) {
    const doel = path.join(bouwDir, f.path);
    if (!doel.startsWith(bouwDir + path.sep)) throw new Error(`invalid file path ${f.path}`);
    await fs.mkdir(path.dirname(doel), { recursive: true });
    await fs.writeFile(doel, f.encoding === 'base64' ? Buffer.from(f.content, 'base64') : f.content);
  }
  let port = input.port || oud?.port || 0;
  if (!input.files.some((f) => f.path === 'Dockerfile')) {
    const auto = autoDockerfile(input.files, input.port || 0);
    port = auto.port;
    await fs.writeFile(path.join(bouwDir, 'Dockerfile'), auto.dockerfile);
    job.log += `[mijn-ruimte] Dockerfile generated (port ${port})\n`;
  }
  if (!port) throw new Error('set "port": the port your app listens on inside the container');
  // знімок (вихідний код цієї версії) — для відкату й перегляду
  await fs.mkdir(path.join(a.root, 'snapshots', name), { recursive: true });
  const snap = path.join(a.root, 'snapshots', name, `${versie}.tar.gz`);
  const t = await runFixed('tar', ['-czf', snap, '-C', bouwDir, '.'], { timeout: 120_000 });
  if (t.code !== 0) job.log += `[mijn-ruimte] snapshot warning: ${(t.stderr || '').slice(0, 200)}\n`;
  job.state = 'building';
  const b = await rt(a, ['build', '--pull=missing', '-t', img(name, versie), bouwDir], { timeout: 15 * 60_000 });
  const secrets = await leesSecrets(a, name);
  job.log += verberg(staart(b.stdout + b.stderr, 60), secrets);
  if (b.code !== 0) throw new Error('build failed (see log)');
  const gebruikt = new Set(Object.values(reg.apps).filter((x) => x !== oud).map((x) => x.hostPort));
  const hostPort = oud?.hostPort || await vrijePoort(gebruikt);
  const app = { ...(oud || {}), name, port, hostPort, env: input.env || oud?.env || {}, domain: oud?.domain || '', createdAt: oud?.createdAt || Date.now(), versions: [...(oud?.versions || [])] };
  job.state = 'starting';
  await containerStarten(a, name, app, versie);
  const ok = await wachtOpPoort(hostPort, 30_000);
  if (!ok) {
    const l = await rt(a, ['logs', '--tail', '60', ctr(name)], { timeout: 20_000 });
    job.log += '\n--- container log ---\n' + verberg(staart(l.stdout + l.stderr, 60), secrets);
    // автоматичний відкат на попередню робочу версію
    if (oud?.current) { try { await containerStarten(a, name, oud, oud.current); job.log += `\n[mijn-ruimte] rolled back to ${oud.current}\n`; } catch { /* лишається зупиненим */ } }
    else await rt(a, ['rm', '-f', ctr(name)], { timeout: 60_000 });
    throw new Error(`app did not start listening on port ${port} within 30 s (see log)${oud?.current ? `; previous version ${oud.current} restored` : ''}`);
  }
  app.versions.push({ version: versie, at: Date.now(), snapshot: path.basename(snap) });
  app.current = versie;
  // старі версії прибрати (образи й знімки), 5 останніх лишаються
  while (app.versions.length > APP_KEEP_VERSIONS) {
    const weg = app.versions.shift();
    await rt(a, ['rmi', '-f', img(name, weg.version)], { timeout: 60_000 }).catch(() => {});
    await fs.rm(path.join(a.root, 'snapshots', name, `${weg.version}.tar.gz`), { force: true }).catch(() => {});
  }
  await fs.rm(path.join(a.root, 'builds', name), { recursive: true, force: true }).catch(() => {});
  const host = domeinVoor(a, name, app.domain);
  let routed = false;
  try { routed = (await routeZetten(a, name, host, hostPort)).routed; } catch (e) { job.log += `\n[mijn-ruimte] route warning: ${e.message}\n`; }
  const reg2 = await leesRegister(a); reg2.apps[name] = app; await schrijfRegister(a, reg2);
  job.url = routed ? `https://${host}` : `http://127.0.0.1:${hostPort}`;
  return { version: versie, url: job.url, localUrl: `http://127.0.0.1:${hostPort}`, routed };
}

// Grote of geheime inhoud (bestanden van een uitrol, de waarde van een geheim) staat nooit in de opdracht zelf (die bewaart de server):
// alleen een eenmalig ticket. De agent haalt de inhoud één keer op met zijn eigen token; de server geeft het alleen aan deze agent.
const TICKET_RE = /^[A-Za-z0-9_-]{40,64}$/;
async function overdrachtHalen(cfg, ticket, soort) {
  if (typeof ticket !== 'string' || !TICKET_RE.test(ticket)) throw new Error('invalid ticket');
  if (!cfg.server || !cfg.token) throw new Error('agent is not paired');
  const res = await fetch(`${cfg.server}/api/owner/agents/overdracht`, {
    method: 'POST', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }), cache: 'no-store',
  });
  if (!res.ok) throw new Error(`ticket could not be fetched (${res.status}); it is valid once and for 10 minutes`);
  const body = await res.json();
  if (body?.soort !== soort || !body.payload || typeof body.payload !== 'object') throw new Error('unexpected ticket content');
  return body.payload;
}

export const appHandlers = {
  async 'apps.deploy'(cfg, input = {}) {
    const a = requireApps(cfg);
    const name = appName(input.name);
    const bezig = () => jobs.get(name)?.state && !['done', 'failed'].includes(jobs.get(name).state);
    if (bezig()) throw new Error('a deployment of this app is already running — check apps.status');
    if (input.bundle !== undefined) {
      const p = await overdrachtHalen(cfg, input.bundle, 'bundel');
      input = { ...input, files: p.files, env: p.env ?? {} };
    }
    const files = Array.isArray(input.files) ? input.files : [];
    if (!files.length || files.length > APP_MAX_FILES) throw new Error(`files: 1-${APP_MAX_FILES} items of {path, content, encoding?}`);
    let total = 0;
    for (const f of files) {
      if (!f || typeof f.path !== 'string' || !FILE_RE.test(f.path) || typeof f.content !== 'string') throw new Error(`invalid file entry ${String(f?.path).slice(0, 60)}`);
      if (f.encoding && !['utf8', 'base64'].includes(f.encoding)) throw new Error('encoding must be utf8 or base64');
      total += f.encoding === 'base64' ? Math.floor(f.content.length * 3 / 4) : Buffer.byteLength(f.content);
    }
    if (total > APP_MAX_BYTES) throw new Error('files too large (8 MB max)');
    const env = input.env ?? {};
    if (typeof env !== 'object' || Array.isArray(env) || Object.keys(env).length > 50) throw new Error('env: object with at most 50 variables');
    for (const [k, v] of Object.entries(env)) if (!SECRET_KEY_RE.test(k) || typeof v !== 'string' || v.length > 4096 || /[\r\n]/.test(v)) throw new Error(`invalid env variable ${k}`);
    if (input.port !== undefined && !(Number.isInteger(input.port) && input.port > 0 && input.port < 65536)) throw new Error('invalid port');
    if (bezig()) throw new Error('a deployment of this app is already running — check apps.status');
    const job = { state: 'queued', version: '', error: '', log: '', startedAt: Date.now(), finishedAt: 0, url: '' };
    jobs.set(name, job);
    const klaar = opRij(`app:${name}`, () => deployUitvoeren(cfg, a, { ...input, name, files, env }))
      .then((r) => { Object.assign(job, { state: 'done', version: r.version, url: r.url, finishedAt: Date.now() }); return r; })
      .catch((e) => { Object.assign(job, { state: 'failed', error: e.message, finishedAt: Date.now() }); throw e; });
    klaar.catch(() => {}); // de uitkomst wordt in job bewaard; geen onafgehandelde weigering als niemand meer wacht
    const wacht = Number.isInteger(input.wait_seconds) ? Math.min(75, Math.max(0, input.wait_seconds)) : 70;
    const uitkomst = await Promise.race([klaar.then((r) => ({ klaar: true, r }), (e) => ({ klaar: true, e })), new Promise((r) => setTimeout(() => r({ klaar: false }), wacht * 1000))]);
    if (!uitkomst.klaar) return { name, state: job.state, note: 'still running — call apps.status (app_deploy_status) in a moment', logTail: staart(job.log, 15) };
    if (uitkomst.e) return { name, state: 'failed', error: uitkomst.e.message, logTail: staart(job.log, 40) };
    return { name, state: 'done', ...uitkomst.r, logTail: staart(job.log, 15) };
  },
  async 'apps.status'(cfg, { name } = {}) {
    requireApps(cfg); appName(name);
    const j = jobs.get(name);
    return j ? { name, state: j.state, version: j.version, url: j.url, error: j.error, startedAt: j.startedAt, finishedAt: j.finishedAt, logTail: staart(j.log, 40) } : { name, state: 'none' };
  },
  async 'apps.list'(cfg) {
    const a = requireApps(cfg);
    const reg = await leesRegister(a);
    const ps = await rt(a, ['ps', '-a', '--filter', 'label=mijn-ruimte.app', '--format', '{{json .}}'], { timeout: 30_000 });
    const st = await rt(a, ['stats', '--no-stream', '--format', '{{json .}}'], { timeout: 30_000 }).catch(() => ({ stdout: '' }));
    const regels = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).flatMap((l) => { try { const v = JSON.parse(l); return Array.isArray(v) ? v : [v]; } catch { return []; } });
    const containers = regels(ps.stdout), stats = regels(st.stdout);
    const naamVan = (c) => String(Array.isArray(c.Names) ? c.Names[0] : c.Names ?? c.Name ?? '').replace(/^\//, '');
    // Bewaking: luistert de app echt op haar poort (zelfde controle als na een uitrol, maar één poging van max. 1,5 s)?
    const luistert = (port) => new Promise((resolve) => { if (!port) return resolve(false); const k = net.connect(port, '127.0.0.1'); const t = setTimeout(() => { k.destroy(); resolve(false); }, 1500); k.once('connect', () => { clearTimeout(t); k.destroy(); resolve(true); }); k.once('error', () => { clearTimeout(t); k.destroy(); resolve(false); }); });
    return { apps: await Promise.all(Object.values(reg.apps).map(async (app) => {
      const c = containers.find((x) => naamVan(x) === ctr(app.name));
      const s = stats.find((x) => String(x.Name ?? x.name ?? '').replace(/^\//, '') === ctr(app.name));
      const loopt = c && /running|^up/i.test(String(c.State ?? c.Status ?? ''));
      const domein = domeinVoor(a, app.name, app.domain);
      return { name: app.name, status: c ? (loopt ? 'running' : 'stopped') : 'missing', version: app.current, versions: app.versions.length,
        url: domein && a.caddyAdmin ? `https://${domein}` : `http://127.0.0.1:${app.hostPort}`, localUrl: `http://127.0.0.1:${app.hostPort}`,
        domain: domein && a.caddyAdmin ? domein : '', hostPort: app.hostPort, port: app.port, listening: loopt ? await luistert(app.hostPort) : false,
        uptime: c ? String(c.Status ?? c.status ?? '').slice(0, 60) : '', image: c ? String(c.Image ?? '').slice(0, 120) : '',
        memory: s ? String(s.MemUsage ?? s.mem_usage ?? '') : '', cpu: s ? String(s.CPUPerc ?? s.cpu_percent ?? '') : '', deploy: jobs.get(app.name)?.state || '' };
    })) };
  },
  async 'apps.logs'(cfg, { name, lines } = {}) {
    const a = requireApps(cfg); appName(name);
    const n = Number.isInteger(lines) ? Math.min(500, Math.max(1, lines)) : 100;
    const r = await rt(a, ['logs', '--tail', String(n), ctr(name)], { timeout: 30_000 });
    if (r.code !== 0) throw new Error(`logs failed: ${(r.stderr || '').trim().slice(0, 200)}`);
    const secrets = await leesSecrets(a, name);
    return { name, lines: n, log: verberg(staart(r.stdout + (r.stderr ? `\n${r.stderr}` : ''), n), secrets) };
  },
  async 'apps.versions'(cfg, { name } = {}) {
    const a = requireApps(cfg); appName(name);
    const app = (await leesRegister(a)).apps[name];
    if (!app) throw new Error('unknown app');
    return { name, current: app.current, versions: app.versions.map((v) => ({ version: v.version, at: v.at, current: v.version === app.current })) };
  },
  async 'apps.rollback'(cfg, { name, version } = {}) {
    const a = requireApps(cfg); appName(name);
    return opRij(`app:${name}`, async () => {
      const reg = await leesRegister(a); const app = reg.apps[name];
      if (!app) throw new Error('unknown app');
      const idx = app.versions.findIndex((v) => v.version === app.current);
      const doel = version ? app.versions.find((v) => v.version === version) : app.versions[idx - 1];
      if (!doel) throw new Error(version ? 'unknown version' : 'there is no earlier version');
      await containerStarten(a, name, app, doel.version);
      const ok = await wachtOpPoort(app.hostPort, 30_000);
      app.current = doel.version; reg.apps[name] = app; await schrijfRegister(a, reg);
      return { name, current: doel.version, listening: ok };
    });
  },
  async 'apps.control'(cfg, { name, action } = {}) {
    const a = requireApps(cfg); appName(name);
    if (!['start', 'stop', 'restart', 'remove'].includes(action)) throw new Error('action: start, stop, restart or remove');
    return opRij(`app:${name}`, async () => {
      const reg = await leesRegister(a); const app = reg.apps[name];
      if (!app) throw new Error('unknown app');
      if (action === 'remove') {
        await rt(a, ['rm', '-f', ctr(name)], { timeout: 60_000 });
        for (const v of app.versions) await rt(a, ['rmi', '-f', img(name, v.version)], { timeout: 60_000 }).catch(() => {});
        await routeWeg(a, name);
        // знімки лишаються (можна відновити вручну); реєстр і секрети — геть
        delete reg.apps[name]; await schrijfRegister(a, reg);
        await fs.rm(secretsPad(a, name), { force: true });
        return { name, removed: true, snapshotsKept: path.join(a.root, 'snapshots', name) };
      }
      const r = await rt(a, [action, ctr(name)], { timeout: 90_000 });
      if (r.code !== 0) throw new Error(`${action} failed: ${(r.stderr || r.stdout).trim().slice(0, 200)}`);
      return { name, action, ok: true };
    });
  },
  async 'apps.route'(cfg, { name, domain } = {}) {
    const a = requireApps(cfg); appName(name);
    if (domain !== '' && (typeof domain !== 'string' || !HOST_RE.test(domain))) throw new Error('invalid domain');
    return opRij(`app:${name}`, async () => {
      const reg = await leesRegister(a); const app = reg.apps[name];
      if (!app) throw new Error('unknown app');
      app.domain = domain; reg.apps[name] = app; await schrijfRegister(a, reg);
      await routeWeg(a, name);
      const host = domeinVoor(a, name, domain);
      const r = await routeZetten(a, name, host, app.hostPort);
      return { name, domain: host, routed: r.routed, url: r.routed ? `https://${host}` : `http://127.0.0.1:${app.hostPort}`, note: r.routed ? 'point the DNS record (or tunnel hostname) of this domain to this server' : 'no Caddy configured on this device: app is local only' };
    });
  },
  async 'apps.secret.list'(cfg, { name } = {}) {
    const a = requireApps(cfg); appName(name);
    return { name, keys: Object.keys(await leesSecrets(a, name)).sort() };
  },
  async 'apps.secret.set'(cfg, { name, key, value, ticket, restart } = {}) {
    const a = requireApps(cfg); appName(name);
    if (typeof key !== 'string' || !SECRET_KEY_RE.test(key)) throw new Error('invalid key (A-Z, 0-9, "_")');
    if (ticket !== undefined) {
      const p = await overdrachtHalen(cfg, ticket, 'geheim');
      if (p.key !== key) throw new Error('ticket is for another key');
      value = p.value;
    }
    if (typeof value !== 'string' || !value || value.length > 8192 || /[\r\n\0]/.test(value)) throw new Error('invalid value (1-8192 chars, one line)');
    return opRij(`app:${name}`, async () => {
      const s = await leesSecrets(a, name); s[key] = value; await schrijfSecrets(a, name, s);
      const app = (await leesRegister(a)).apps[name];
      if (restart !== false && app?.current) await containerStarten(a, name, app, app.current);
      return { name, key, stored: true, restarted: Boolean(restart !== false && app?.current) };
    });
  },
  async 'apps.secret.delete'(cfg, { name, key } = {}) {
    const a = requireApps(cfg); appName(name);
    if (typeof key !== 'string' || !SECRET_KEY_RE.test(key)) throw new Error('invalid key');
    return opRij(`app:${name}`, async () => {
      const s = await leesSecrets(a, name); const had = key in s; delete s[key]; await schrijfSecrets(a, name, s);
      const app = (await leesRegister(a)).apps[name];
      if (had && app?.current) await containerStarten(a, name, app, app.current);
      return { name, key, deleted: had };
    });
  },
};

async function appsConfig(args) {
  let cfg; try { cfg = loadConfig(); } catch { die('спершу pair'); }
  if (args.off === 'true' || args.disable === true) { cfg.apps = { ...appsDefaults(cfg.apps), enabled: false }; saveConfig(cfg); console.log('Додатки вимкнено.'); return; }
  if (!args['apps-root']) die('usage: apps-config --apps-root <DIR> [--runtime podman|docker] [--domain "{app}.apps.example.com"] [--caddy-admin unix:/run/caddy/admin.sock] [--caddy-server NAME] [--memory 512m] | apps-config --disable');
  const root = path.resolve(args['apps-root']);
  if (args.domain && !/^[a-z0-9-]{0,20}\{app\}[a-z0-9-]{0,20}(\.[a-z0-9-]{1,63})+$/i.test(args.domain)) die('--domain має бути шаблоном на кшталт "{app}.apps.example.com", "{app}-app.example.com" або "{app}.203.0.113.10.nip.io"');
  if (args.runtime && !['podman', 'docker'].includes(args.runtime)) die('--runtime: podman або docker');
  if (args.memory && !/^\d{2,5}[mg]$/.test(args.memory)) die('--memory: напр. 512m або 2g');
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  cfg.apps = appsDefaults({ enabled: true, root, runtime: args.runtime, domain: args.domain, caddyAdmin: args['caddy-admin'], caddyServer: args['caddy-server'], memory: args.memory });
  const versie = await runFixed(cfg.apps.runtime, ['--version'], { timeout: 15_000 }).catch(() => null);
  saveConfig(cfg);
  console.log(`Додатки увімкнено: ${root}\nСередовище: ${cfg.apps.runtime} ${versie?.code === 0 ? versie.stdout.trim() : '(НЕ ЗНАЙДЕНО — встановіть його)'}${cfg.apps.runtime === 'docker' ? '\nУВАГА: група docker = фактично root на цьому комп\'ютері. Безпечніше — rootless podman.' : ''}\nДомен: ${cfg.apps.domain || '(немає — додатки лише локально 127.0.0.1)'}\nCaddy: ${cfg.apps.caddyAdmin || '(немає)'}\nПерезапустіть агента (node agent.mjs run).`);
}


// ---------- terminal (etap «термінали», 13.10.2026) ----------
// Een interactieve shell draait NOOIT op dit apparaat zelf (shells blijven verboden, zie SHELLS), alleen in een wegwerpcontainer:
// rootless podman (of docker), geen netwerk, geen capabilities, no-new-privileges, alleen-lezen systeem, limieten voor geheugen/processen,
// één toegestane root gekoppeld op /werk (standaard alleen-lezen), geheime plekken binnen die root afgedekt (tmpfs / /dev/null).
// Aan te zetten alleen HIER: node agent.mjs terminal-config on [--image …] [--runtime podman|docker] [--max-minuten 60] [--test] (uit: off). --test = testmachine: alleen terminal.test (Розробник) of terminal.servers opent haar.
// Openen kan alleen via een ONDERTEKENDE opdracht 'term.open' van de site; daarna stroomt in- en uitvoer over hetzelfde WSS-kanaal.
const TERM_IMAGE = 'docker.io/library/debian:12-slim';
const terminalDefaults = (t = {}) => ({ enabled: !!t.enabled, runtime: ['podman', 'docker'].includes(t.runtime) ? t.runtime : 'podman', image: typeof t.image === 'string' && /^[a-z0-9][a-z0-9./_:@-]{2,200}$/i.test(t.image) ? t.image : TERM_IMAGE, maxMinuten: Math.min(240, Math.max(5, Number(t.maxMinuten) || 60)), test: t.test === true });
const termSessies = new Map(); // sid -> { child, naam, timer }
let termKanaal = null; // huidige WebSocket (gezet in run)
const termStuur = (obj) => { try { termKanaal?.send(JSON.stringify(obj)); } catch { /* kanaal dicht: sessie sluit vanzelf */ } };

/** Geheime plekken binnen een root (begrensd: diepte 4, 5000 items), relatief pad + soort, om af te dekken in de container. */
async function geheimeAfdekking(root) {
  const uit = []; let teller = 0;
  async function loop(dir, diepte) {
    if (diepte > 4 || teller > 5000) return;
    let items; try { items = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (++teller > 5000) return;
      const vol = path.join(dir, it.name);
      if (it.isSymbolicLink()) continue;
      if (isGeheim(vol)) { uit.push({ rel: path.relative(root, vol).split(path.sep).join('/'), map: it.isDirectory() }); continue; }
      if (it.isDirectory()) await loop(vol, diepte + 1);
    }
  }
  await loop(root, 1);
  return uit;
}

/** Argumenten voor de container (los te testen). */
export async function termArgs(cfg, { sid, root, schrijven, cols, rows }) {
  const t = terminalDefaults(cfg.terminal);
  const roots = (cfg.roots ?? []).map((r) => path.resolve(r));
  const ro = (cfg.readonlyRoots ?? []).map((r) => path.resolve(r));
  const gevraagd = path.resolve(String(root || ''));
  if (!roots.some((r) => norm(r) === norm(gevraagd))) throw new Error('refused: root is not one of the allowed roots');
  if (isGeheim(gevraagd)) throw new Error('refused: protected secret location');
  if (schrijven && ro.some((r) => norm(r) === norm(gevraagd))) throw new Error('refused: this root is read-only');
  const c = Math.min(300, Math.max(20, Number(cols) || 100)), r = Math.min(120, Math.max(5, Number(rows) || 30));
  const naam = `mr-term-${String(sid).replace(/[^a-f0-9]/gi, '').slice(0, 12)}`;
  const args = ['run', '--rm', '-i', '--name', naam, '--network', 'none', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--pids-limit', '128', '--memory', '512m', '--cpus', '1', '--read-only', '--tmpfs', '/tmp:rw,size=64m', '--tmpfs', '/home/werk:rw,size=16m',
    '-e', 'HOME=/home/werk', '-e', 'TERM=xterm-256color', '-e', `COLUMNS=${c}`, '-e', `LINES=${r}`,
    '-v', `${gevraagd}:/werk:${schrijven ? 'rw' : 'ro'}`];
  for (const g of await geheimeAfdekking(gevraagd)) {
    if (g.map) args.push('--tmpfs', `/werk/${g.rel}:ro,size=1k`); else args.push('-v', `/dev/null:/werk/${g.rel}:ro`);
  }
  args.push('-w', '/werk', t.image, 'script', '-qfec', `stty cols ${c} rows ${r} 2>/dev/null; exec bash -l 2>/dev/null || exec sh -l`, '/dev/null');
  return { runtime: t.runtime, args, naam };
}

async function termOpen(cfg, p) {
  const t = terminalDefaults(cfg.terminal);
  if (!t.enabled) throw new Error('refused: terminal is switched off on this device (node agent.mjs terminal-config on)');
  const sid = String(p.sid || '');
  if (!/^[0-9a-f-]{36}$/.test(sid)) throw new Error('invalid session id');
  if (termSessies.has(sid)) throw new Error('session already open');
  if (termSessies.size >= 3) throw new Error('refused: too many open terminals on this device (max 3)');
  const minuten = Math.min(t.maxMinuten, Math.max(1, Number(p.minuten) || 30));
  const { runtime, args, naam } = await termArgs(cfg, { sid, root: p.root, schrijven: p.schrijven === true, cols: p.cols, rows: p.rows });
  const child = spawn(runtime, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const sluit = (code, reden) => {
    const s = termSessies.get(sid); if (!s) return;
    termSessies.delete(sid); clearTimeout(s.timer);
    try { child.kill('SIGKILL'); } catch { /* al weg */ }
    runFixed(runtime, ['rm', '-f', naam], { timeout: 15_000 }).catch(() => {});
    termStuur({ t: 'term.exit', sid, code, reden });
  };
  const timer = setTimeout(() => sluit(null, 'tijd'), minuten * 60_000); timer.unref?.();
  termSessies.set(sid, { child, naam, timer, runtime, sluit });
  const uit = (d) => termStuur({ t: 'term.out', sid, d: Buffer.from(d).toString('base64') });
  child.stdout.on('data', uit); child.stderr.on('data', uit);
  child.on('error', (e) => { termStuur({ t: 'term.out', sid, d: Buffer.from(`\r\n[agent] ${e.message}\r\n`).toString('base64') }); sluit(null, 'fout'); });
  child.on('close', (code) => sluit(code, 'einde'));
  return { sid, naam, minuten, runtime, image: t.image, alleenLezen: p.schrijven !== true };
}
function termBericht(msg) {
  const s = termSessies.get(String(msg.sid || ''));
  if (!s) return;
  if (msg.t === 'term.in' && typeof msg.d === 'string' && msg.d.length <= 64 * 1024) { try { s.child.stdin.write(Buffer.from(msg.d, 'base64')); } catch { /* dicht */ } }
  else if (msg.t === 'term.close') s.sluit(null, 'gesloten');
}
function termAllesSluiten(reden) { for (const s of [...termSessies.values()]) s.sluit(null, reden); }

async function terminalConfig(args) {
  let cfg; try { cfg = loadConfig(); } catch { die('спершу pair'); }
  const stand = args._[1];
  if (stand === 'off') { cfg.terminal = { ...terminalDefaults(cfg.terminal), enabled: false }; saveConfig(cfg); console.log('Термінал вимкнено.'); return; }
  if (stand !== 'on') die('usage: terminal-config on [--runtime podman|docker] [--image debian:12-slim] [--max-minuten 60] [--test] | terminal-config off');
  if (args.runtime && !['podman', 'docker'].includes(args.runtime)) die('--runtime: podman або docker');
  cfg.terminal = terminalDefaults({ enabled: true, runtime: args.runtime ?? cfg.apps?.runtime, image: args.image, maxMinuten: args['max-minuten'], test: args.test === true });
  const versie = await runFixed(cfg.terminal.runtime, ['--version'], { timeout: 15_000 }).catch(() => null);
  saveConfig(cfg);
  console.log(`Термінал увімкнено: контейнер ${cfg.terminal.image} (${cfg.terminal.runtime} ${versie?.code === 0 ? versie.stdout.trim() : '— НЕ ЗНАЙДЕНО, встановіть його'}), без мережі, до ${cfg.terminal.maxMinuten} хв.${cfg.terminal.test ? '\nЦе ТЕСТОВА машина: її відкриває роль з terminal.test (Розробник).' : '\nЦе сервер: його відкриває лише роль з terminal.servers (Адміністратор, Власник). Тестова машина: додайте --test.'}${cfg.terminal.runtime === 'docker' ? '\nУВАГА: група docker = фактично root. Безпечніше — rootless podman.' : ''}\nПерезапустіть агента (node agent.mjs run).`);
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
  // 0.7.0: alleen lezen. Grootte, datum en type van één pad (zelfde padcontrole als fs.read).
  async 'fs.stat'(cfg, { path: p }) {
    const file = await safePath(cfg, p);
    const st = await fs.stat(file);
    return { path: file, type: st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other', size: st.size, modified: st.mtime.toISOString() };
  },
  // 0.7.0: zoeken op naam (en optioneel in tekstinhoud) binnen een toegestane map. Begrensd: diepte 8, 5000 items,
  // 200 treffers, tekstbestanden tot 256 KB. Symlinks worden niet gevolgd; geheime plekken worden overgeslagen.
  async 'fs.search'(cfg, { path: p = '.', query, in_content: inhoud = false } = {}) {
    if (typeof query !== 'string' || query.length < 2 || query.length > 200) throw new Error('query must be 2-200 characters');
    const start = await safePath(cfg, p);
    const q = query.toLowerCase();
    const treffers = [];
    let bezocht = 0;
    const MAX_TREFFERS = 200, MAX_BEZOCHT = 5000, MAX_DIEPTE = 8, MAX_INHOUD = 256 * 1024;
    const vol = () => treffers.length >= MAX_TREFFERS || bezocht >= MAX_BEZOCHT;
    async function loop(dir, diepte, rel) {
      if (diepte > MAX_DIEPTE || vol()) return;
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (vol()) return;
        bezocht++;
        if (e.isSymbolicLink()) continue;
        const full = path.join(dir, e.name);
        if (isGeheim(full)) continue;
        const relPad = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (e.name.toLowerCase().includes(q)) treffers.push({ path: relPad, type: 'dir' });
          await loop(full, diepte + 1, relPad);
        } else if (e.isFile()) {
          if (e.name.toLowerCase().includes(q)) { treffers.push({ path: relPad, type: 'file' }); continue; }
          if (!inhoud) continue;
          const st = await fs.stat(full).catch(() => null);
          if (!st || st.size > MAX_INHOUD) continue;
          const tekst = await fs.readFile(full, 'utf8').catch(() => '');
          if (!tekst.includes('\0') && tekst.toLowerCase().includes(q)) treffers.push({ path: relPad, type: 'file', match: 'inhoud' });
        }
      }
    }
    await loop(start, 0, '');
    return { query, results: treffers, scanned: bezocht, truncated: vol() };
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
Object.assign(handlers, appHandlers);
handlers['term.open'] = termOpen;
export { handlers, autoDockerfile as _autoDockerfile, termBericht as _termBericht, termSessies as _termSessies };
export const _termKanaal = (ws) => { termKanaal = ws; };

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
    // ---- 0.7.0: fs.stat, fs.search, rechten.json ----
    const st = await handlers['fs.stat'](cfg, { path: 'a/b.txt' });
    check('fs.stat: type, grootte en datum van een bestand', st.type === 'file' && st.size === 3 && !Number.isNaN(Date.parse(st.modified)));
    check('fs.stat buiten de map geweigerd', (await geweigerd(() => handlers['fs.stat'](cfg, { path: '../_selftest-outside.txt' }), BUITEN)) === true);
    await fs.mkdir(path.join(work, 'geheim'), { recursive: true });
    await fs.writeFile(path.join(work, 'geheim', 'notities.txt'), 'zoekwoord-verborgen');
    await fs.writeFile(path.join(work, 'a', 'zoekwoord-naam.md'), 'niets bijzonders');
    await fs.writeFile(path.join(work, 'a', 'gewoon.txt'), 'hier staat ZOEKWOORD-inhoud');
    const zoek = await handlers['fs.search'](cfg, { path: '.', query: 'zoekwoord', in_content: true });
    const namen = zoek.results.map((r) => r.path);
    check('fs.search: vindt naam en inhoud (hoofdletterongevoelig)', namen.includes('a/zoekwoord-naam.md') && namen.includes('a/gewoon.txt'), JSON.stringify(namen));
    check('fs.search: geheime map wordt overgeslagen', !namen.some((n) => n.includes('geheim')), JSON.stringify(namen));
    check('fs.search: zonder in_content alleen namen', !(await handlers['fs.search'](cfg, { path: '.', query: 'ZOEKWOORD' })).results.some((r) => r.path === 'a/gewoon.txt'));
    check('fs.search: te korte zoekterm geweigerd', (await geweigerd(() => handlers['fs.search'](cfg, { path: '.', query: 'a' }), /2-200/)) === true);
    REC = {}; // zonder rechten.json (ontbrekende sleutel = aan), los van het bestand op deze machine
    check('rechten: ontbrekende sleutel staat aan', rechtAan('exec') && rechtAan('fs.search'));
    REC = { exec: false, 'fs.search': false };
    check('rechten: uitgezette opdracht is uit, andere blijven aan', !rechtAan('exec') && !rechtAan('fs.search') && rechtAan('fs.read'));
    check('rechten: uitgezette opdracht komt niet in capabilities', !capabilities([work], []).commands.includes('exec') && capabilities([work], []).commands.includes('fs.stat'));
    REC = {};
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
  if (cfg.apps?.enabled && cfg.apps?.caddyAdmin) {
    const herstel = () => routesHerstellen(cfg).then((n) => { if (n) console.log(`[apps] ${n} Caddy-route(s) hersteld`); }, () => {});
    setTimeout(herstel, 5_000).unref?.(); setInterval(herstel, 5 * 60_000).unref?.();
  }
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
    laadRechten();
    let t = null;
    try { t = await ticket(); } catch (e) { console.log(`[agent] ${e.message}, retry in ${delay / 1000}s`); setTimeout(connect, delay); delay = Math.min(delay * 2, 30_000); return; }
    const ws = new WebSocket(wsUrl);
    termKanaal = ws;
    let pinger = null;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'auth', ...(t ? { ticket: t } : { token: cfg.token }), version: VERSION, capabilities: capabilities(cfg.roots, cfg.allow, cfg.readonlyRoots, cfg.apps, cfg.terminal) }));
      pinger = setInterval(() => { try { ws.send(JSON.stringify({ t: 'pong', version: VERSION, capabilities: capabilities(cfg.roots, cfg.allow, cfg.readonlyRoots, cfg.apps, cfg.terminal) })); } catch { /* dicht */ } }, 20_000);
    };
    ws.onmessage = async (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'ready') { delay = 1000; console.log(`[agent] connected as ${msg.agentId}`); }
      else if (msg.t === 'ping') ws.send(JSON.stringify({ t: 'pong', version: VERSION, capabilities: capabilities(cfg.roots, cfg.allow, cfg.readonlyRoots, cfg.apps, cfg.terminal) }));
      else if (msg.t === 'stop') { console.log('[agent] Стоп: усі дозволи відкликано на сайті'); termAllesSluiten('noodstop'); }
      else if (msg.t === 'term.in' || msg.t === 'term.close') termBericht(msg);
      else if (msg.t === 'cmd') {
        console.log(`[agent] ${msg.type}`, JSON.stringify(msg.params).slice(0, 200));
        try {
          if (!verifySignature(cfg, msg)) throw new Error('refused: invalid, missing or expired command signature');
          if (seenIds.has(msg.id)) throw new Error('refused: command already executed');
          seenIds.add(msg.id); if (seenIds.size > 5000) seenIds.clear();
          const h = handlers[msg.type];
          if (!h) throw new Error(`unsupported command: ${msg.type}`);
          if (!rechtAan(msg.type)) throw new Error(`refused: "${msg.type}" is switched off on this device (rechten.json)`);
          ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: true, data: await h(cfg, msg.params ?? {}) }));
        } catch (e) {
          ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: false, error: e.message }));
        }
      }
    };
    ws.onclose = (ev) => {
      clearInterval(pinger);
      termAllesSluiten('verbinding');
      if (ev.code === 4403) die('токен відкликано або недійсний. Виконайте pair заново.');
      console.log(`[agent] disconnected (${ev.code}), retry in ${delay / 1000}s`);
      setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30_000);
    };
    ws.onerror = () => {};
  };
  connect();
}

/** node agent.mjs rechten            → toont per opdracht aan/uit
 *  node agent.mjs rechten set <opdracht> on|off  → schrijft rechten.json (0600); de agent leest het bij het volgende verbinden. */
function rechtenCmd(args) {
  laadRechten();
  const [, sub, sleutel, stand] = args._;
  if (!sub) {
    console.log(`Bestand: ${RECHTEN_PATH}${existsSync(RECHTEN_PATH) ? '' : ' (bestaat nog niet: alles aan)'}`);
    for (const s of RECHT_SLEUTELS) console.log(`${rechtAan(s) ? 'aan ' : 'uit '} ${s}`);
    console.log('\nAanzetten/uitzetten: node agent.mjs rechten set <opdracht> on|off');
    return;
  }
  if (sub !== 'set' || !RECHT_SLEUTELS.includes(sleutel) || !['on', 'off'].includes(stand)) {
    die(`usage: rechten | rechten set <opdracht> on|off\nopdrachten: ${RECHT_SLEUTELS.join(', ')}`);
  }
  const huidig = existsSync(RECHTEN_PATH) ? JSON.parse(readFileSync(RECHTEN_PATH, 'utf8')) : {};
  huidig[sleutel] = stand === 'on';
  mkdirSync(path.dirname(RECHTEN_PATH), { recursive: true });
  writeFileSync(RECHTEN_PATH, JSON.stringify(huidig, null, 2) + '\n', { mode: 0o600 });
  console.log(`${sleutel}: ${stand === 'on' ? 'aan' : 'uit'}. Herstart de agent (node agent.mjs run) om het door te voeren.`);
}

function die(msg) { console.error(msg); process.exit(1); }

// Alleen als programma starten (niet bij import in tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (cmd === 'pair') await pair(args);
  else if (cmd === 'run') run();
  else if (cmd === 'selftest') await selftest(args);
  else if (cmd === 'apps-config') await appsConfig(args);
  else if (cmd === 'terminal-config') await terminalConfig(args);
  else if (cmd === 'rechten') rechtenCmd(args);
  else die('usage: node agent.mjs <pair|run|selftest|apps-config|terminal-config|rechten>');
}
