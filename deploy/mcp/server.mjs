#!/usr/bin/env node
// Read-only MCP bridge. Loopback only. Bearer file token, plus OAuth for Grok.
import { createServer } from "node:http";
import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { readFile, readdir, realpath, stat, mkdir, writeFile } from "node:fs/promises";
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { request as httpRequest } from "node:http";
import path from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(process.env.MCP_PORT || 8091);
const ROOT_LINK = process.env.MCP_ROOT || "/srv/mijn-ruimte/current";
const TOKEN_FILE = process.env.MCP_TOKEN_FILE || "/etc/mijn-ruimte/mcp.token";
const OAUTH_SECRET_FILE = process.env.MCP_OAUTH_SECRET_FILE || "/etc/mijn-ruimte/mcp-oauth.secret";
const CLIENT_ID = process.env.MCP_OAUTH_CLIENT_ID || "grok";
const ISSUER = "https://mcp.tarasevych.com";
const HELPER = process.env.MCP_HELPER || "/usr/local/sbin/mijn-ruimte-mcp-doen";
const STAGING = process.env.MCP_STAGING || "/srv/mijn-ruimte/mcp-staging";
const STATE_FILE = process.env.MCP_STATE_FILE || "/srv/mijn-ruimte/mcp-state/sessions.json";
const HEALTH_URL = process.env.MCP_HEALTH_URL || "http://127.0.0.1:8080/__gezondheid";
const MAX_BODY = 1024 * 1024;
const MAX_READ = 120_000;
const MAX_ENTRIES = 200;
const CODE_TTL = 5 * 60 * 1000;
const ACCESS_TTL = 7 * 24 * 60 * 60 * 1000;
const REFRESH_TTL = 30 * 24 * 60 * 60 * 1000;

const BLOCK = /(^|\/)(\.env|geheimen\.env|.*\.(age|pem|key)|id_rsa|id_ed25519|credentials.*\.json)$/i;
const codes = new Map();
const accessTokens = new Map();
const refreshTokens = new Map();

function saveSessions() {
  try {
    mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify({ access: [...accessTokens], refresh: [...refreshTokens] }), { mode: 0o600 });
    renameSync(tmp, STATE_FILE);
  } catch (err) {
    process.stderr.write(`session-save ${err instanceof Error ? err.message : "error"}\n`);
  }
}
function loadSessions() {
  try {
    const now = Date.now();
    const data = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    for (const [token, exp] of data.access || []) if (exp > now) accessTokens.set(token, exp);
    for (const [token, row] of data.refresh || []) if (row?.exp > now) refreshTokens.set(token, row);
  } catch { /* no sessions yet */ }
}

function deny(name) {
  const n = name.replaceAll("\\", "/");
  if (n.split("/").includes("node_modules") || n.split("/").includes(".git")) return true;
  return BLOCK.test(n);
}
async function rootDir() { return realpath(ROOT_LINK); }
async function inside(rel) {
  const root = await rootDir();
  const target = await realpath(path.resolve(root, rel || "."));
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("PATH_OUTSIDE");
  return { root, target };
}
function sameText(expect, got) {
  const a = Buffer.from(expect);
  const b = Buffer.from(got);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
async function fileTokenOk(got) {
  try {
    const expect = (await readFile(TOKEN_FILE, "utf8")).trim();
    return sameText(expect, got);
  } catch { return false; }
}
async function oauthSecret() {
  try { return (await readFile(OAUTH_SECRET_FILE, "utf8")).trim(); }
  catch { return ""; }
}
function bearer(header) { return String(header || "").replace(/^Bearer\s+/i, "").trim(); }
async function tokenOk(header) {
  const got = bearer(header);
  if (!got) return false;
  const exp = accessTokens.get(got);
  if (exp && exp > Date.now()) return true;
  return fileTokenOk(got);
}
function rpcResult(id, result) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }
function b64url(buf) { return Buffer.from(buf).toString("base64url"); }
function s256(verifier) { return createHash("sha256").update(verifier).digest("base64url"); }
function redirectOk(uri) {
  let u;
  try { u = new URL(uri); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname;
  return host === "grok.com" || host === "x.ai" || host.endsWith(".grok.com") || host.endsWith(".x.ai");
}
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "\u0026amp;")
    .replaceAll("<", "\u0026lt;")
    .replaceAll(">", "\u0026gt;")
    .replaceAll("\"", "\u0026quot;")
    .replaceAll("'", "\u0026#39;");
}
function formBody(raw) { return Object.fromEntries(new URLSearchParams(raw)); }
function basicClient(header) {
  const m = /^Basic\s+([A-Za-z0-9+/=_-]+)$/i.exec(String(header || ""));
  if (!m) return null;
  const text = Buffer.from(m[1], "base64").toString("utf8");
  const i = text.indexOf(":");
  if (i < 0) return null;
  return { id: text.slice(0, i), secret: text.slice(i + 1) };
}

const TOOLS = [
  { name: "site_health", description: "GET the local site health URL. No secrets.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "release_info", description: "Active release path and commit files.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "list_dir", description: "List one directory inside the active release.", inputSchema: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false } },
  { name: "read_file", description: "Read one text file inside the active release. Refuses secrets.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } },
  { name: "host_status", description: "Status of the site, tunnel and MCP service, plus local health. No secrets.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "start_backup", description: "Start the existing encrypted backup service. Does not return dump contents.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "list_releases", description: "List release directory names and the current symlink.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "write_staging", description: "Write a text file under /srv/mijn-ruimte/mcp-staging only. Cannot touch the live release or secrets.", inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false } },
];
function textResult(text, isError = false) { return { content: [{ type: "text", text }], isError }; }
function runHelper(verb) {
  return new Promise((resolve) => {
    const child = spawn("sudo", ["-n", HELPER, verb], { timeout: 120000 });
    let out = "";
    const take = (buf) => { if (out.length < 8000) out += buf.toString("utf8"); };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (err) => resolve(textResult(err.message, true)));
    child.on("close", (code) => resolve(textResult((out || `exit ${code}`).slice(0, 8000), code !== 0)));
  });
}
function localGet(url) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: "GET", timeout: 4000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8").slice(0, 4000) }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("TIMEOUT")));
    req.end();
  });
}
async function callTool(name, args) {
  if (name === "site_health") {
    const res = await localGet(HEALTH_URL);
    return textResult(`${res.status} ${res.body}`);
  }
  if (name === "release_info") {
    const root = await rootDir();
    const readTrim = async (file) => { try { return (await readFile(path.join(root, file), "utf8")).trim(); } catch { return ""; } };
    return textResult(`root=${root}\nBRON-COMMIT=${(await readTrim("BRON-COMMIT")) || "missing"}\nRELEASE-COMMIT=${(await readTrim("RELEASE-COMMIT")) || "missing"}`);
  }
  if (name === "list_dir") {
    const rel = String(args?.path || ".").replaceAll("\\", "/");
    if (deny(rel)) return textResult("REFUSED", true);
    const { root, target } = await inside(rel);
    const info = await stat(target);
    if (!info.isDirectory()) return textResult("NOT_A_DIRECTORY", true);
    const items = await readdir(target, { withFileTypes: true });
    const lines = items.filter((d) => d.name !== "node_modules" && d.name !== ".git").slice(0, MAX_ENTRIES).map((d) => `${d.isDirectory() ? "d" : "f"} ${path.relative(root, path.join(target, d.name)) || d.name}`);
    return textResult(lines.join("\n") || "(empty)");
  }
  if (name === "read_file") {
    const rel = String(args?.path || "").replaceAll("\\", "/");
    if (!rel || deny(rel)) return textResult("REFUSED", true);
    const { target } = await inside(rel);
    const info = await stat(target);
    if (!info.isFile()) return textResult("NOT_A_FILE", true);
    if (info.size > MAX_READ * 4) return textResult("TOO_LARGE", true);
    const data = await readFile(target, "utf8");
    if (data.length > MAX_READ) return textResult(data.slice(0, MAX_READ) + "\n…TRUNCATED");
    return textResult(data);
  }
  if (name === "host_status" || name === "start_backup" || name === "list_releases") {
    const verb = name === "host_status" ? "status" : name === "start_backup" ? "backup" : "releases";
    return runHelper(verb);
  }
  if (name === "write_staging") {
    const rel = String(args?.path || "").replaceAll("\\", "/").replace(/^\/+/, "");
    if (!rel || rel.includes("..") || deny(rel)) return textResult("REFUSED", true);
    const content = String(args?.content ?? "");
    if (content.length > MAX_READ) return textResult("TOO_LARGE", true);
    await mkdir(STAGING, { recursive: true });
    const target = path.resolve(STAGING, rel);
    const root = await realpath(STAGING);
    if (target !== root && !target.startsWith(root + path.sep)) return textResult("PATH_OUTSIDE", true);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, { mode: 0o644 });
    return textResult(`wrote ${target} (${content.length})`);
  }
  return textResult("UNKNOWN_TOOL", true);
}
async function handleRpc(msg) {
  const id = msg.id ?? null;
  const method = String(msg.method || "");
  if (id === null) return null;
  if (method === "initialize") {
    const offered = msg.params?.protocolVersion;
    return rpcResult(id, { protocolVersion: offered === "2024-11-05" ? offered : "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "mijn-ruimte", version: "1" } });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: TOOLS });
  if (method === "tools/call") {
    try { return rpcResult(id, await callTool(String(msg.params?.name || ""), msg.params?.arguments || {})); }
    catch (err) { return rpcResult(id, textResult(err instanceof Error ? err.message : "ERROR", true)); }
  }
  return rpcError(id, -32601, "METHOD_NOT_FOUND");
}

function metadata() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint: `${ISSUER}/oauth/token`,
    registration_endpoint: `${ISSUER}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["read"],
  };
}
function authorizePage(q, error) {
  const fields = ["response_type", "client_id", "redirect_uri", "state", "scope", "code_challenge", "code_challenge_method"].map((name) =>
    `<input type="hidden" name="${name}" value="${esc(q.get(name) || "")}">`).join("");
  return `<!doctype html><html lang="uk"><meta charset="utf-8"><title>Доступ для Grok</title>
<body style="font-family:sans-serif;max-width:36rem;margin:3rem auto">
<h1>Дозволити Grok читати код</h1>
<p>Grok отримає лише читання поточного випуску і стан сайту. База і секрети сервера йому не віддаються.</p>
${error ? `<p style="color:#8a1f1f">${esc(error)}</p>` : ""}
<form method="post" action="/oauth/authorize">
${fields}
<label>Токен моста<br><input name="bridge_token" type="password" autocomplete="current-password" required style="width:100%"></label>
<p><button type="submit">Дозволити</button></p>
</form></body></html>`;
}
function issuePair(clientId) {
  const access = b64url(randomBytes(32));
  const refresh = b64url(randomBytes(32));
  accessTokens.set(access, Date.now() + ACCESS_TTL);
  refreshTokens.set(refresh, { exp: Date.now() + REFRESH_TTL, clientId });
  saveSessions();
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL / 1000, refresh_token: refresh, scope: "read" };
}
async function clientOk(id, secret) {
  if (id !== CLIENT_ID) return false;
  if (!secret) return true;
  const expect = await oauthSecret();
  return Boolean(expect) && sameText(expect, secret);
}

function send(res, status, body, extra = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const type = typeof body === "string" && body.startsWith("<!") ? "text/html; charset=utf-8" : "application/json; charset=utf-8";
  res.writeHead(status, { "content-type": extra["content-type"] || type, "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra });
  res.end(raw);
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const sessions = new Set();
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const pathName = url.pathname;
  try {
    if (req.method === "GET" && (pathName === "/.well-known/oauth-authorization-server" || pathName === "/.well-known/openid-configuration")) {
      send(res, 200, metadata());
      return;
    }
    if (req.method === "GET" && pathName === "/.well-known/oauth-protected-resource") {
      send(res, 200, { resource: `${ISSUER}/Grok`, authorization_servers: [ISSUER], scopes_supported: ["read"], bearer_methods_supported: ["header"] });
      return;
    }
    if (pathName === "/oauth/register" && req.method === "POST") {
      const raw = await readBody(req);
      const body = raw.trim().startsWith("{") ? JSON.parse(raw || "{}") : formBody(raw);
      const redirects = [].concat(body.redirect_uris || []).filter(redirectOk);
      send(res, 201, { client_id: CLIENT_ID, client_id_issued_at: Math.floor(Date.now() / 1000), redirect_uris: redirects, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "read" });
      return;
    }
    if (pathName === "/oauth/authorize" && req.method === "GET") {
      const q = url.searchParams;
      if (q.get("client_id") !== CLIENT_ID || q.get("response_type") !== "code" || !redirectOk(q.get("redirect_uri") || "") || q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) {
        send(res, 400, "<!doctype html><title>Помилка</title><p>Неповний або чужий запит входу.</p>");
        return;
      }
      send(res, 200, authorizePage(q, ""));
      return;
    }
    if (pathName === "/oauth/authorize" && req.method === "POST") {
      const q = new URLSearchParams(await readBody(req));
      const back = q.get("redirect_uri") || "";
      if (q.get("client_id") !== CLIENT_ID || !redirectOk(back) || q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) {
        send(res, 400, { error: "invalid_request" });
        return;
      }
      if (!(await fileTokenOk(q.get("bridge_token") || ""))) {
        send(res, 401, authorizePage(q, "Токен моста не підійшов."));
        return;
      }
      const code = b64url(randomBytes(32));
      codes.set(code, { challenge: q.get("code_challenge"), redirect: back, exp: Date.now() + CODE_TTL, clientId: CLIENT_ID });
      const dest = new URL(back);
      dest.searchParams.set("code", code);
      if (q.get("state")) dest.searchParams.set("state", q.get("state"));
      res.writeHead(302, { location: dest.toString(), "cache-control": "no-store" });
      res.end();
      return;
    }
    if (pathName === "/oauth/token" && req.method === "POST") {
      const raw = await readBody(req);
      const body = formBody(raw);
      const basic = basicClient(req.headers.authorization);
      const id = body.client_id || basic?.id || "";
      const secret = body.client_secret || basic?.secret || "";
      if (!(await clientOk(id, secret))) { send(res, 401, { error: "invalid_client" }); return; }
      if (body.grant_type === "refresh_token") {
        const row = refreshTokens.get(body.refresh_token || "");
        if (!row || row.exp <= Date.now() || row.clientId !== id) { send(res, 400, { error: "invalid_grant" }); return; }
        refreshTokens.delete(body.refresh_token);
        send(res, 200, issuePair(id));
        return;
      }
      if (body.grant_type !== "authorization_code") { send(res, 400, { error: "unsupported_grant_type" }); return; }
      const row = codes.get(body.code || "");
      codes.delete(body.code || "");
      if (!row || row.exp <= Date.now() || row.redirect !== body.redirect_uri || row.clientId !== id || !body.code_verifier || s256(body.code_verifier) !== row.challenge) {
        send(res, 400, { error: "invalid_grant" });
        return;
      }
      send(res, 200, issuePair(id));
      return;
    }
    if (req.method === "GET" && pathName === "/health") { send(res, 200, { ok: true, service: "mijn-ruimte-mcp" }); return; }
    const door = pathName.toLowerCase();
    const doors = new Set(["/grok", "/claude", "/chatgpt", "/gemini", "/copilot"]);
    if (!doors.has(door)) { send(res, 404, { error: "NOT_FOUND" }); return; }
    if (!(await tokenOk(req.headers.authorization))) {
      send(res, 401, { error: "UNAUTHORIZED" }, { "www-authenticate": `Bearer realm="mijn-ruimte", resource_metadata="${ISSUER}/.well-known/oauth-protected-resource"` });
      return;
    }
    if (req.method === "DELETE") { res.writeHead(204); res.end(); return; }
    if (req.method !== "POST") { send(res, 405, { error: "POST_ONLY" }); return; }
    let msg;
    try { msg = JSON.parse(await readBody(req) || "{}"); }
    catch (err) {
      if (err instanceof Error && err.message === "TOO_LARGE") { send(res, 413, { error: "TOO_LARGE" }); return; }
      send(res, 400, rpcError(null, -32700, "PARSE_ERROR"));
      return;
    }
    if (msg && msg.method && msg.id === undefined) { res.writeHead(202); res.end(); return; }
    const sid = String(req.headers["mcp-session-id"] || "");
    const extra = {};
    if (msg.method === "initialize") { const id = randomBytes(16).toString("hex"); sessions.add(id); extra["mcp-session-id"] = id; }
    else if (sid && !sessions.has(sid)) { send(res, 404, rpcError(msg.id ?? null, -32001, "SESSION_NOT_FOUND")); return; }
    send(res, 200, await handleRpc(msg), extra);
  } catch (err) {
    if (!res.headersSent) send(res, err instanceof Error && err.message === "TOO_LARGE" ? 413 : 500, { error: "SERVER_ERROR" });
  }
});
loadSessions();
server.listen(PORT, HOST, () => { process.stdout.write(`mijn-ruimte-mcp ${HOST}:${PORT}\n`); });
