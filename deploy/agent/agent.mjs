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
import { promises as fs, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VERSION = '0.1.0';
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
  const out = { _: [], root: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const val = argv[++i];
    if (key === 'root') out.root.push(val); else out[key] = val;
  }
  return out;
}

// ---------- pair ----------
async function pair(args) {
  if (!args.server || !args.code) die('usage: pair --server <url> --code <CODE> [--name N] [--root DIR]... [--allow cmd1,cmd2]');
  const roots = args.root.map((r) => path.resolve(r));
  if (!roots.length) die('вкажіть хоча б одну дозволену папку: --root <DIR>');
  const allow = (args.allow ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const name = args.name ?? os.hostname();
  const server = args.server.replace(/\/$/, '');

  const res = await fetch(`${server}/api/owner/agents/pair`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: args.code, name, platform: `${os.platform()}-${os.arch()}`, capabilities: capabilities(roots, allow) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) die(`pairing failed: ${body.error ?? res.status}`);
  saveConfig({ server, agentId: body.agentId, token: body.token, roots, allow });
  console.log(`Paired. Конфіг: ${CONFIG_PATH}\nТепер запустіть: node agent.mjs run`);
}

const capabilities = (roots, allow) => ({ version: VERSION, roots, allowCommands: allow, commands: ['fs.read', 'fs.list', 'fs.write', 'exec', 'sys.info'] });

// ---------- sandbox ----------
const isWin = process.platform === 'win32';
const norm = (p) => (isWin ? p.toLowerCase() : p);

/** Шлях має лежати всередині root; symlink/`..` не дозволяють вийти назовні (перевіряється realpath). */
async function safePath(cfg, p) {
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
  for (const root of cfg.roots) {
    const rr = await fs.realpath(root).catch(() => root);
    if (norm(real) === norm(rr) || norm(real).startsWith(norm(rr) + path.sep)) return real;
  }
  throw new Error('path outside allowed roots');
}

// ---------- command handlers ----------
const handlers = {
  async 'sys.info'(cfg) {
    return { hostname: os.hostname(), platform: os.platform(), arch: os.arch(), uptime: os.uptime(), roots: cfg.roots, allowCommands: cfg.allow };
  },
  async 'fs.list'(cfg, { path: p = '.' }) {
    const dir = await safePath(cfg, p);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.slice(0, 2000).map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' }));
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
    const file = await safePath(cfg, p);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
    return { path: file, bytes: Buffer.byteLength(content) };
  },
  // Без shell: команда + масив аргументів, тому ін'єкції через `;` `&&` `|` неможливі.
  async exec(cfg, { command, args = [], cwd = '.' }) {
    if (typeof command !== 'string' || !Array.isArray(args) || args.some((a) => typeof a !== 'string')) throw new Error('bad exec params');
    const name = path.basename(command).replace(/\.exe$/i, '');
    if (command !== path.basename(command) || !cfg.allow.includes(name)) throw new Error(`command "${command}" is not in the agent allow-list`);
    const dir = await safePath(cfg, cwd);
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
    const ok = await handlers.exec(cfg, { command: 'node', args: ['-e', 'console.log(41+1)'] });
    check('toegestaan commando draait (zonder shell)', ok.code === 0 && ok.stdout.trim() === '42', JSON.stringify([ok.code, ok.stdout.trim()]));
    const meta = await handlers.exec(cfg, { command: 'node', args: ['-e', 'console.log("a;b && c | d")'] });
    check('shell-tekens in argumenten worden letterlijk doorgegeven', meta.stdout.trim() === 'a;b && c | d');
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

  const connect = () => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'auth', token: cfg.token, version: VERSION, capabilities: capabilities(cfg.roots, cfg.allow) }));
    ws.onmessage = async (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'ready') { delay = 1000; console.log(`[agent] connected as ${msg.agentId}`); }
      else if (msg.t === 'ping') ws.send(JSON.stringify({ t: 'pong' }));
      else if (msg.t === 'cmd') {
        console.log(`[agent] ${msg.type}`, JSON.stringify(msg.params).slice(0, 200));
        try {
          const h = handlers[msg.type];
          if (!h) throw new Error(`unsupported command: ${msg.type}`);
          ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: true, data: await h(cfg, msg.params ?? {}) }));
        } catch (e) {
          ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: false, error: e.message }));
        }
      }
    };
    ws.onclose = (ev) => {
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
