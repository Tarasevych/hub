import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { error, fileDownload, json } from "../server/platform";
import type { RouterMiddleware } from "../server/platform/router";

type Task = { id: string; title: string; body: string; status: "backlog" | "doing" | "blocked" | "done"; service: string; author: string; createdAt: string; updatedAt: string };
type Note = { id: string; title: string; body: string; tags: string[]; author: string; createdAt: string; updatedAt: string };
type TokenRow = { id: string; name: string; prefix: string; hash: string; scopes: string[]; createdAt: string; revokedAt: string; calls: number; lastSeenAt: string };
type LogRow = { id: string; at: string; method: string; detail: string; transport: string; agent: string; ok: boolean; ms: number };
type State = { tasks: Task[]; notes: Note[]; tokens: TokenRow[]; log: LogRow[] };

type SessionOk = { user: { id: string; email?: string }; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;

const BLOCK = /(^|\/)(\.env|geheimen\.env|.*\.(age|pem|key)|id_rsa|id_ed25519|credentials.*\.json)$/i;
const STATUSES = new Set(["backlog", "doing", "blocked", "done"]);
const HOSTS = [
  ["hub", "https://hub.tarasevych.com/overview"],
  ["id", "https://id.tarasevych.com/personalization"],
  ["admin", "https://admin.tarasevych.com/access"],
  ["api", "https://api.tarasevych.com/access"],
  ["dashboard", "https://dashboard.tarasevych.com/releases.html"],
  ["ai", "https://ai.tarasevych.com/"],
  ["mail", "https://mail.tarasevych.com/inbox"],
  ["cloud", "https://cloud.tarasevych.com/calendar"],
  ["github", "https://github.tarasevych.com/"],
  ["huis", "https://huis.tarasevych.com/"],
  ["mcp", "https://mcp.tarasevych.com/overview"],
] as const;

const PERMISSIONS = [
  { id: "read", group: "agent", uk: "Читати сайт і код", nl: "Site en code lezen", detailUk: "Агент бачить випуск, здоров'я сайту і список релізів. Без цього двері німі.", detailNl: "De agent ziet de release, de gezondheid en de lijst. Zonder dit zwijgt de deur.", def: true },
  { id: "board", group: "agent", uk: "Писати дошку", nl: "Bord schrijven", detailUk: "Задачі й нотатки на дошці зберігаються на сервері.", detailNl: "Taken en notities op het bord blijven op de server.", def: true },
  { id: "tokens", group: "agent", uk: "Випускати токени агентів", nl: "Agenttokens uitgeven", detailUk: "Можна випустити або відкликати токен агента. Сам токен показується один раз.", detailNl: "Een agenttoken uitgeven of intrekken. Het token zelf verschijnt één keer.", def: true },
  { id: "staging", group: "agent", uk: "Писати в чернетку", nl: "Klad schrijven", detailUk: "Агент може класти файли в чернетку випуску. Живий сайт від цього не змінюється.", detailNl: "De agent mag bestanden in het klad zetten. De live site verandert niet.", def: false },
  { id: "install", group: "release", uk: "Викладати випуск", nl: "Release plaatsen", detailUk: "Агент може зібрати чернетку в новий випуск. Вимкнено — двері відмовляють.", detailNl: "De agent mag het klad tot een release maken. Uit betekent een weigering.", def: false },
  { id: "backup", group: "release", uk: "Запускати резервну копію", nl: "Reservekopie starten", detailUk: "Увімкнено: перед випуском запускається копія. Якщо вона падає, випуск зупиняється. Вимкнено: випуск іде без копії.", detailNl: "Aan: vóór een release start de kopie. Faalt die, dan stopt de release. Uit: de release gaat zonder kopie.", def: false },
] as const;
type PermissionId = (typeof PERMISSIONS)[number]["id"];
const permPath = () => path.join(process.env.UPLOADS_DIR || "/srv/data/uploads", "mcp-permissions.json");
const statePath = () => path.join(process.env.UPLOADS_DIR || "/srv/data/uploads", "mcp-console.json");
function defaultPerms(): Record<PermissionId, boolean> {
  return Object.fromEntries(PERMISSIONS.map((item) => [item.id, item.def])) as Record<PermissionId, boolean>;
}
async function readPerms(): Promise<Record<PermissionId, boolean>> {
  const base = defaultPerms();
  try {
    const data = JSON.parse(await readFile(permPath(), "utf8")) as Record<string, boolean>;
    for (const item of PERMISSIONS) if (typeof data[item.id] === "boolean") base[item.id] = data[item.id];
  } catch { /* defaults */ }
  return base;
}
async function writePerms(next: Record<PermissionId, boolean>) {
  const file = permPath();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(next), { mode: 0o600 });
  await rename(tmp, file);
}
function permFor(name: string): PermissionId {
  if (name === "write_staging") return "staging";
  if (name === "start_backup") return "backup";
  if (name === "install_release" || name === "update_door") return "install";
  if (name === "upsert_task" || name === "upsert_note" || name === "list_tasks" || name === "list_notes") return "board";
  if (name === "issue_agent_token") return "tokens";
  return "read";
}
const empty = (): State => ({ tasks: [], notes: [], tokens: [], log: [] });

async function load(): Promise<State> {
  try {
    const data = JSON.parse(await readFile(statePath(), "utf8")) as State;
    const state = { tasks: data.tasks || [], notes: data.notes || [], tokens: data.tokens || [], log: data.log || [] };
    if (state.tasks.length || state.notes.length) return state;
    return seed(state);
  } catch {
    return seed(empty());
  }
}
function seed(state: State): State {
  const t = now();
  state.tasks = [
    { id: id("task"), title: "Випускати ідентичності агентів з id.tarasevych.com", body: "Кожен агент — окремий principal зі скоупами, а не спільний пароль.", status: "backlog", service: "id", author: "estate", createdAt: t, updatedAt: t },
    { id: id("task"), title: "Підключити живі адаптери api.tarasevych.com", body: "Інструменти MCP мають ходити в реальний API, щойно з’являться токени доступу.", status: "doing", service: "api", author: "estate", createdAt: t, updatedAt: t },
    { id: id("task"), title: "Карта грантів в admin.tarasevych.com", body: "MCP читає політику доступу і відмовляє агенту без скоупу.", status: "backlog", service: "admin", author: "estate", createdAt: t, updatedAt: t },
  ];
  state.notes = [{ id: id("note"), title: "Навіщо цей міст", body: "Сервіси маєтку живі на домашньому вузлі, але за ідентичністю. ШІ не входить у браузер. MCP — машинний контракт.", tags: ["architecture"], author: "estate", createdAt: t, updatedAt: t }];
  void save(state).catch(() => undefined);
  return state;
}
async function save(state: State) {
  const file = statePath();
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state), { mode: 0o600 });
  await rename(tmp, file);
}
function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function same(expect: string, got: string) {
  const a = Buffer.from(expect);
  const b = Buffer.from(got);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
function id(prefix: string) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}
function now() {
  return new Date().toISOString();
}
function log(state: State, row: Omit<LogRow, "id" | "at">) {
  state.log.unshift({ id: id("log"), at: now(), ...row });
  state.log = state.log.slice(0, 200);
}
function bodyOf(body: unknown) {
  return (body || {}) as Record<string, unknown>;
}
function text(data: unknown) {
  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}
function denied(name: string) {
  const n = name.replaceAll("\\", "/");
  return n.split("/").includes("node_modules") || n.split("/").includes(".git") || BLOCK.test(n);
}
async function releaseRoot() {
  return realpath(process.env.MCP_ROOT || "/srv/mijn-ruimte/current");
}
async function inside(rel: string) {
  const root = await releaseRoot();
  const target = await realpath(path.resolve(root, rel || "."));
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("PATH_OUTSIDE");
  if (denied(path.relative(root, target))) throw new Error("PATH_SECRET");
  return { root, target };
}

const DOOR_URL = "http://127.0.0.1:8091/Grok";
const STAGING = "/srv/mijn-ruimte/mcp-staging";
function bridgePath() {
  return path.join(process.env.UPLOADS_DIR || "/srv/data/uploads", "mcp-bridge.token");
}
async function bridgeToken() {
  const file = bridgePath();
  try { return (await readFile(file, "utf8")).trim(); } catch { /* create once */ }
  const raw = randomBytes(32).toString("base64url");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, raw, { mode: 0o600 });
  return raw;
}
async function doorCall(name: string, args: Record<string, unknown>) {
  const token = await bridgeToken();
  const res = await fetch(DOOR_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const data = await res.json() as { result?: { content?: Array<{ text?: string }>; isError?: boolean }; error?: { message?: string } };
  const message = data.result?.content?.[0]?.text || data.error?.message || `DOOR_${res.status}`;
  if (!res.ok || data.result?.isError) throw new Error(message);
  return message;
}
async function stagingInside(rel: string) {
  const clean = rel.replaceAll("\\", "/").replace(/^\/+/, "");
  if (clean.split("/").includes("..") || denied(clean)) throw new Error("PATH_SECRET");
  const root = await realpath(STAGING);
  const target = path.resolve(root, clean || ".");
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("PATH_OUTSIDE");
  return { root, target, rel: clean };
}
async function probeOne(name: string, url: string) {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: ctrl.signal });
    clearTimeout(timer);
    return { id: name, url, ok: res.status > 0 && res.status < 500, status: res.status, ms: Date.now() - started };
  } catch (err) {
    return { id: name, url, ok: false, status: 0, ms: Date.now() - started, error: err instanceof Error ? err.message : "NO_ANSWER" };
  }
}

async function runTool(name: string, args: Record<string, unknown>) {
  const flags = await readPerms();
  const gate = permFor(name);
  if (!flags[gate]) throw new Error(`PERMISSION_OFF:${gate}`);
  if (name === "list_services" || name === "hub_overview") return { services: HOSTS.map(([id, url]) => ({ id, url })) };
  if (name === "health_check") return { probes: await Promise.all(HOSTS.map(([id, url]) => probeOne(id, url))) };
  if (name === "get_architecture") return { layers: ["huis", "id/admin", "api", "mcp", "surfaces"] };
  if (name === "get_roadmap") return { next: ["agent identities on id", "grants on admin", "json on api"] };
  if (name === "agent_handshake") return { door: "https://mcp.tarasevych.com/Grok", next: ["health_check", "list_services", "release_info"] };
  if (name === "get_service") {
    const wanted = String(args.id || "");
    const hit = HOSTS.find(([id]) => id === wanted);
    if (!hit) throw new Error("UNKNOWN_SERVICE");
    return { id: hit[0], url: hit[1] };
  }
  if (name === "list_tasks" || name === "list_notes" || name === "estate_search" || name === "admin_list_access" || name === "dashboard_usage") {
    const state = await load();
    if (name === "list_notes") return { notes: state.notes };
    if (name === "admin_list_access" || name === "dashboard_usage") return { tokens: state.tokens.map(({ hash: _h, ...row }) => row), calls: state.log.length };
    const q = String(args.q || "").toLowerCase();
    const tasks = q ? state.tasks.filter((task) => `${task.title} ${task.body}`.toLowerCase().includes(q)) : state.tasks;
    return { tasks };
  }
  if (name === "upsert_task" || name === "upsert_note") {
    const state = await load();
    const title = String(args.title || (name === "upsert_note" ? "Нотатка" : "Задача")).slice(0, 160);
    const body = String(args.body || "").slice(0, 4000);
    if (name === "upsert_note") {
      const note: Note = { id: id("note"), title, body, tags: [], author: "operator", createdAt: now(), updatedAt: now() };
      state.notes.unshift(note);
      await save(state);
      return { note };
    }
    const status = STATUSES.has(String(args.status || "")) ? String(args.status) as Task["status"] : "backlog";
    const task: Task = { id: id("task"), title, body, status, service: "mcp", author: "operator", createdAt: now(), updatedAt: now() };
    state.tasks.unshift(task);
    await save(state);
    return { task };
  }
  if (name === "list_staging" || name === "read_staging") {
    const { root, target } = await stagingInside(String(args.path || ""));
    if (name === "list_staging") {
      const info = await stat(target);
      if (!info.isDirectory()) throw new Error("NOT_A_DIRECTORY");
      const rows = await readdir(target, { withFileTypes: true });
      return { path: path.relative(root, target) || ".", entries: rows.slice(0, 200).map((row) => ({ name: row.name, kind: row.isDirectory() ? "dir" : "file" })) };
    }
    const info = await stat(target);
    if (!info.isFile()) throw new Error("NOT_A_FILE");
    if (info.size > 120_000) throw new Error("FILE_TOO_LARGE");
    return { path: String(args.path || ""), text: await readFile(target, "utf8") };
  }
  if (name === "write_staging") {
    const rel = String(args.path || args.name || "");
    if (!rel || denied(rel)) throw new Error("PATH_SECRET");
    return { text: await doorCall(name, { path: rel, content: String(args.content ?? args.text ?? "") }) };
  }
  if (name === "install_release" || name === "update_door" || name === "start_backup") {
    return { text: await doorCall(name, {}) };
  }
  if (name === "site_health") {
    const res = await fetch("http://127.0.0.1:8080/__gezondheid");
    return { status: res.status, body: await res.json() };
  }
  if (name === "release_info") {
    const root = await releaseRoot();
    const read = async (file: string) => {
      try { return (await readFile(path.join(root, file), "utf8")).trim(); } catch { return ""; }
    };
    return { root, release: path.basename(root), bron: await read("BRON-COMMIT"), releaseCommit: await read("RELEASE-COMMIT") };
  }
  if (name === "list_dir") {
    const { root, target } = await inside(String(args.path || "."));
    const rows = await readdir(target, { withFileTypes: true });
    return { path: path.relative(root, target) || ".", entries: rows.slice(0, 200).map((row) => ({ name: row.name, kind: row.isDirectory() ? "dir" : "file" })) };
  }
  if (name === "read_file") {
    const rel = String(args.path || "");
    if (!rel || denied(rel)) throw new Error("PATH_SECRET");
    const { target } = await inside(rel);
    const info = await stat(target);
    if (!info.isFile()) throw new Error("NOT_A_FILE");
    if (info.size > 120_000) throw new Error("FILE_TOO_LARGE");
    return { path: rel, text: await readFile(target, "utf8") };
  }
  if (name === "host_status") {
    const site = await probeOne("site", "http://127.0.0.1:8080/__gezondheid");
    const bridge = await probeOne("bridge", "http://127.0.0.1:8091/health");
    return { site, bridge };
  }
  if (name === "list_releases") {
    const dir = "/srv/mijn-ruimte/releases";
    const rows = await readdir(dir);
    return { dir, releases: rows.filter((row) => /^\d{8}-\d{6}$/.test(row)).sort() };
  }
  if (name === "permission_flags") return flags;
  throw new Error("TOOL_NOT_ON_DOOR");
}

async function session(requireSession: RequireSession, ctx: { event: Record<string, unknown>; body: unknown }) {
  const auth = await requireSession(ctx.event, ctx.body);
  if ("errorCode" in auth) return { fail: error(auth.errorCode, auth.errorCode.includes("FORBIDDEN") ? 403 : 401) };
  if (auth.service !== "mcp") return { fail: error("MCP_SERVICE_REQUIRED", 403) };
  return { auth };
}

async function requestKit() {
  const dir = path.join(process.env.UPLOADS_DIR || "/srv/data/uploads", "mcp-archives");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "kit-request"), "go\n", { mode: 0o600 });
}
const kitDir = () => path.join(process.env.UPLOADS_DIR || "/srv/data/uploads", "mcp-archives");
/** Stand van het archief uit kit-status.txt (geschreven door /usr/local/sbin/mijn-ruimte-archief). Herkent een vastgelopen of nooit gestarte bouw. */
export async function readKitStatus(now = Date.now()): Promise<Record<string, string>> {
  const dir = kitDir();
  let lines: Record<string, string> = {};
  let statusAge = Infinity;
  try { const st = await stat(path.join(dir, "kit-status.txt")); statusAge = now - st.mtimeMs; lines = parseKit(await readFile(path.join(dir, "kit-status.txt"), "utf8")); } catch { /* nog geen status */ }
  let requestAge = Infinity;
  try { requestAge = now - (await stat(path.join(dir, "kit-request"))).mtimeMs; } catch { /* geen openstaand verzoek */ }
  // Verzoek ligt er nog (het script haalt het weg zodra het start): zonder start binnen 60 s is de service niet actief.
  if (requestAge < Infinity && requestAge < statusAge) {
    if (requestAge > 60_000) return { ...lines, state: "failed", error: "NOT_STARTED", detail: "служба архіву не стартувала (mijn-ruimte-archief.path)" };
    return { state: "building", stage: "1", pct: "0", phase: "queued", detail: "запит надіслано, очікуємо запуск", started: new Date(now - requestAge).toISOString() };
  }
  if (lines.state === "building" && statusAge > 10 * 60_000) return { ...lines, state: "failed", error: "STALLED", detail: "збір зупинився без відповіді понад 10 хвилин" };
  return lines;
}
function parseKit(text: string) {
  const lines: Record<string, string> = {};
  for (const row of text.split("\n")) {
    const cut = row.indexOf("=");
    if (cut > 0) lines[row.slice(0, cut)] = row.slice(cut + 1).trim();
  }
  return lines;
}

// ---- nachtelijke serverback-ups (alleen lezen): lijst en download van de versleutelde bestanden ----
const BACKUP_STAMP = /^\d{8}-\d{6}$/;
const BACKUP_FILES = ["database.dump.age", "uploads.tar.gz.age", "systeem.tar.gz.age", "database.dump", "uploads.tar.gz", "systeem.tar.gz", "systeem-info.txt", "info.txt", "SHA256SUMS"];
const backupRoot = () => process.env.BACKUP_DIR || "/srv/backups/mijn-ruimte";
export type BackupRow = { stamp: string; at: string; ready: boolean; release: string; encrypted: boolean; migrations: number; files: { name: string; bytes: number }[]; hasSystem: boolean; totalBytes: number };
export async function listBackups(limit = 14): Promise<BackupRow[]> {
  let names: string[] = [];
  try { names = (await readdir(backupRoot())).filter((n) => BACKUP_STAMP.test(n)); } catch { return []; }
  const rows: BackupRow[] = [];
  for (const stamp of names.sort().reverse().slice(0, limit)) {
    const dir = path.join(backupRoot(), stamp);
    const files: { name: string; bytes: number }[] = [];
    for (const name of BACKUP_FILES) { try { const info = await stat(path.join(dir, name)); if (info.isFile()) files.push({ name, bytes: info.size }); } catch { /* ontbreekt */ } }
    let ready = false; let at = "";
    try { at = (await readFile(path.join(dir, "KLAAR"), "utf8")).trim(); ready = true; } catch { /* nog bezig of mislukt */ }
    const info: Record<string, string> = {};
    try { for (const line of (await readFile(path.join(dir, "info.txt"), "utf8")).split("\n")) { const cut = line.indexOf("="); if (cut > 0) info[line.slice(0, cut)] = line.slice(cut + 1).trim(); } } catch { /* geen info */ }
    rows.push({ stamp, at, ready, release: path.basename(info.release || ""), encrypted: info.versleuteling === "age", migrations: info.migraties ? info.migraties.split(",").length : 0, files, hasSystem: files.some((f) => f.name.startsWith("systeem.tar.gz")), totalBytes: files.reduce((a, f) => a + f.bytes, 0) });
  }
  return rows;
}
export function backupFile(stamp: string, name: string) {
  if (!BACKUP_STAMP.test(stamp) || !BACKUP_FILES.includes(name)) return "";
  return path.join(backupRoot(), stamp, name);
}
export function archiveFile(name: string) {
  if (!/^mijn-ruimte-\d{8}-\d{6}(-volledig\.tar|(-kod-baza-fajly-sekrety-instrukcija)?\.tar\.gz)$/.test(name)) return "";
  return path.join(process.env.UPLOADS_DIR || "/srv/data/uploads", "mcp-archives", name);
}
type ArchiveRow = { at: string; name: string; bytes: number; kod: number; baza: number; fajly: number; sekrety: number; kept?: boolean };
async function archiveHistory(): Promise<ArchiveRow[]> {
  const dir = path.join(process.env.UPLOADS_DIR || "/srv/data/uploads", "mcp-archives");
  let saved: ArchiveRow[] = [];
  try {
    const data = JSON.parse(await readFile(path.join(dir, "history.json"), "utf8")) as ArchiveRow[];
    if (Array.isArray(data)) saved = data.filter((row) => row && typeof row.name === "string");
  } catch { /* no history yet */ }
  const onDisk = new Set<string>();
  try {
    for (const name of await readdir(dir)) {
      if (!archiveFile(name)) continue;
      onDisk.add(name);
      if (!saved.some((row) => row.name === name)) {
        const info = await stat(path.join(dir, name));
        saved.push({ at: info.mtime.toISOString(), name, bytes: info.size, kod: 0, baza: 0, fajly: 0, sekrety: 0 });
      }
    }
  } catch { /* directory missing */ }
  return saved
    .map((row) => ({ at: String(row.at || ""), name: row.name, bytes: Number(row.bytes || 0), kod: Number(row.kod || 0), baza: Number(row.baza || 0), fajly: Number(row.fajly || 0), sekrety: Number(row.sekrety || 0), kept: onDisk.has(row.name) }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30);
}
function kitPayload(lines: Record<string, string>, history: ArchiveRow[]) {
  const state = lines.state || "idle";
  const ready = state === "ready";
  return {
    state,
    stage: Number(lines.stage || (ready ? 5 : 0)),
    pct: Number(lines.pct || (ready ? 100 : 0)),
    phase: lines.phase || "",
    name: lines.name || "",
    bytes: Number(lines.bytes || 0),
    detail: lines.detail || "",
    kod: Number(lines.kod || 0),
    baza: Number(lines.baza || 0),
    fajly: Number(lines.fajly || 0),
    sekrety: Number(lines.sekrety || 0),
    systeem: Number(lines.systeem || 0),
    started: lines.started || "",
    finished: lines.finished || "",
    error: lines.error || "",
    history,
  };
}
function bearer(event: Record<string, unknown>) {
  const headers = (event.headers || {}) as Record<string, string>;
  return String(headers.authorization || headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
}

export function mcpConsoleRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  const owner = (run: (ctx: { event: Record<string, unknown>; body: unknown }, auth: SessionOk) => Promise<ReturnType<typeof json>>) =>
    (async (ctx) => {
      const gate = await session(requireSession, ctx as { event: Record<string, unknown>; body: unknown });
      if ("fail" in gate && gate.fail) return gate.fail;
      return run(ctx as { event: Record<string, unknown>; body: unknown }, (gate as { auth: SessionOk }).auth);
    }) as RouterMiddleware;

  return {
    "POST /api/mcp/health": [owner(async (_ctx, auth) => {
      if (!(await readPerms()).read) return error("PERMISSION_OFF:read", 403);
      const started = Date.now();
      const probes = await Promise.all(HOSTS.map(([name, url]) => probeOne(name, url)));
      const state = await load();
      log(state, { method: "probe", detail: String(probes.filter((row) => row.ok).length), transport: "console", agent: auth.user.email || auth.user.id, ok: true, ms: Date.now() - started });
      await save(state);
      return json({ probes });
    })],
    "POST /api/mcp/board": [owner(async (ctx) => {
      if (!(await readPerms()).board) return error("PERMISSION_OFF:board", 403);
      const data = bodyOf(ctx.body);
      const state = await load();
      if (data.kind === "move") {
        const task = state.tasks.find((row) => row.id === String(data.id || ""));
        const status = String(data.status || "");
        if (!task || !STATUSES.has(status)) return error("TASK_NOT_FOUND", 404);
        task.status = status as Task["status"];
        task.updatedAt = now();
        await save(state);
        return json({ task });
      }
      if (data.kind === "note") {
        const note: Note = { id: id("note"), title: String(data.title || "Нотатка").slice(0, 160), body: String(data.body || "").slice(0, 4000), tags: [], author: "operator", createdAt: now(), updatedAt: now() };
        state.notes.unshift(note);
        await save(state);
        return json({ note });
      }
      const task: Task = { id: id("task"), title: String(data.title || "Задача").slice(0, 160), body: String(data.body || "").slice(0, 4000), status: "backlog", service: "mcp", author: "operator", createdAt: now(), updatedAt: now() };
      state.tasks.unshift(task);
      await save(state);
      return json({ task });
    })],
    "POST /api/mcp/board/list": [owner(async () => {
      const state = await load();
      return json({ tasks: state.tasks, notes: state.notes });
    })],
    "POST /api/mcp/tokens/list": [owner(async () => {
      const state = await load();
      return json({ tokens: state.tokens.map(({ hash: _hash, ...row }) => row) });
    })],
    "POST /api/mcp/tokens": [owner(async (ctx, auth) => {
      if (!(await readPerms()).tokens) return error("PERMISSION_OFF:tokens", 403);
      const data = bodyOf(ctx.body);
      const raw = `tvh_${randomBytes(24).toString("base64url")}`;
      const row: TokenRow = { id: id("tok"), name: String(data.name || "Agent").slice(0, 80), prefix: raw.slice(0, 12), hash: sha(raw), scopes: ["mcp:tools"], createdAt: now(), revokedAt: "", calls: 0, lastSeenAt: "" };
      const state = await load();
      state.tokens.unshift(row);
      log(state, { method: "token.issue", detail: row.name, transport: "console", agent: auth.user.email || auth.user.id, ok: true, ms: 0 });
      await save(state);
      const { hash: _hash, ...pub } = row;
      return json({ token: { ...pub, token: raw } });
    })],
    "POST /api/mcp/tokens/revoke": [owner(async (ctx) => {
      if (!(await readPerms()).tokens) return error("PERMISSION_OFF:tokens", 403);
      const state = await load();
      const row = state.tokens.find((item) => item.id === String(bodyOf(ctx.body).id || ""));
      if (!row) return error("TOKEN_NOT_FOUND", 404);
      row.revokedAt = now();
      await save(state);
      return json({ ok: true });
    })],
    "POST /api/mcp/call": [owner(async (ctx, auth) => {
      const data = bodyOf(ctx.body);
      const name = String(data.name || "");
      const args = (data.arguments && typeof data.arguments === "object" ? data.arguments : {}) as Record<string, unknown>;
      const started = Date.now();
      const state = await load();
      try {
        const result = await runTool(name, args);
        log(state, { method: "tools/call", detail: name, transport: "console", agent: auth.user.email || auth.user.id, ok: true, ms: Date.now() - started });
        await save(state);
        return json({ ok: true, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "TOOL_FAILED";
        log(state, { method: "tools/call", detail: `${name} ${message}`, transport: "console", agent: auth.user.email || auth.user.id, ok: false, ms: Date.now() - started });
        await save(state);
        return json({ ok: false, error: message }, 400);
      }
    })],
    "POST /api/mcp/permissions": [owner(async (ctx) => {
      const data = bodyOf(ctx.body);
      if (!data.id) return json({ permissions: await readPerms(), catalog: PERMISSIONS });
      const known = PERMISSIONS.find((item) => item.id === String(data.id));
      if (!known) return error("UNKNOWN_PERMISSION", 400);
      const next = await readPerms();
      next[known.id] = Boolean(data.enabled);
      await writePerms(next);
      return json({ permissions: next, catalog: PERMISSIONS });
    })],
    "POST /api/mcp/traffic": [owner(async () => {
      const state = await load();
      return json({ log: state.log });
    })],
    "POST /api/mcp/archive": [owner(async () => {
      if (!(await readPerms()).read) return error("PERMISSION_OFF:read", 403);
      try {
        const current = await readKitStatus();
        if (current.state !== "building") await requestKit();
        const lines = current.state === "building" ? current : await readKitStatus();
        return json(kitPayload(lines.state === "ready" || lines.state === "failed" ? { state: "building", stage: "1", pct: "0", phase: "queued", detail: "запит надіслано, очікуємо запуск", started: new Date().toISOString() } : lines, await archiveHistory()));
      } catch (err) {
        return error(err instanceof Error ? err.message : "ARCHIVE_FAILED", 500);
      }
    })],
    "POST /api/mcp/archive/status": [owner(async () => {
      if (!(await readPerms()).read) return error("PERMISSION_OFF:read", 403);
      try { return json(kitPayload(await readKitStatus(), await archiveHistory())); }
      catch (err) { return error(err instanceof Error ? err.message : "ARCHIVE_FAILED", 500); }
    })],
    "POST /api/mcp/backups": [owner(async () => {
      if (!(await readPerms()).read) return error("PERMISSION_OFF:read", 403);
      return json({ backups: await listBackups() });
    })],
    "POST /api/mcp/backups/file": [owner(async (ctx) => {
      if (!(await readPerms()).read) return error("PERMISSION_OFF:read", 403);
      const data = bodyOf(ctx.body);
      const file = backupFile(String(data.stamp || ""), String(data.name || ""));
      if (!file) return error("BACKUP_NAME", 400);
      try { if (!(await stat(file)).isFile()) return error("BACKUP_MISSING", 404); } catch { return error("BACKUP_MISSING", 404); }
      return fileDownload(file, `${String(data.stamp)}-${path.basename(file)}`, "application/octet-stream");
    })],
    "POST /api/mcp/archive/file": [owner(async (ctx) => {
      if (!(await readPerms()).read) return error("PERMISSION_OFF:read", 403);
      const file = archiveFile(String(bodyOf(ctx.body).name || ""));
      if (!file) return error("ARCHIVE_NAME", 400);
      try {
        const info = await stat(file);
        if (!info.isFile()) return error("ARCHIVE_MISSING", 404);
      } catch { return error("ARCHIVE_MISSING", 404); }
      return fileDownload(file, path.basename(file), file.endsWith(".tar") ? "application/x-tar" : "application/gzip");
    })],
    "POST /api/mcp/agent": [async (ctx) => {
      if (!(await readPerms()).tokens) return error("PERMISSION_OFF:tokens", 403);
      const got = bearer(ctx.event as unknown as Record<string, unknown>);
      const state = await load();
      const row = state.tokens.find((item) => !item.revokedAt && same(item.hash, sha(got)));
      if (!row) return error("TOKEN_INVALID", 401);
      const data = bodyOf(ctx.body);
      const name = String(data.name || "");
      const args = (data.arguments && typeof data.arguments === "object" ? data.arguments : {}) as Record<string, unknown>;
      const started = Date.now();
      row.calls += 1;
      row.lastSeenAt = now();
      try {
        const result = await runTool(name, args);
        log(state, { method: "tools/call", detail: name, transport: "agent", agent: row.name, ok: true, ms: Date.now() - started });
        await save(state);
        return json({ ok: true, result: text(result) });
      } catch (err) {
        const message = err instanceof Error ? err.message : "TOOL_FAILED";
        log(state, { method: "tools/call", detail: `${name} ${message}`, transport: "agent", agent: row.name, ok: false, ms: Date.now() - started });
        await save(state);
        return json({ ok: false, error: message }, 400);
      }
    }],
  };
}
