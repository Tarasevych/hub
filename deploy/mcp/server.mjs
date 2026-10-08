#!/usr/bin/env node
// MCP-deur van Mijn Ruimte (alleen loopback, via de tunnel op mcp.tarasevych.com/<grok|claude|…>).
//
// Veilig ontwerp (vervangt de oude deur met sudo-hulp, schrijfbare klad en "update_door"):
//   - GEEN pad naar root: deze dienst start geen processen (geen child_process, geen sudo) en heeft geen sudo-regel meer.
//   - Lezen: de actieve release (binnen de map, zonder geheimen), gezondheid, releaselijst, uitrolstand.
//   - Uitrollen: alleen een releasepakket + losse handtekening in de inbox leggen. De root-dienst mijn-ruimte-uitrol controleert de
//     handtekening met de publieke sleutel van de eigenaar (privésleutel alleen op zijn pc) en installeert pas daarna.
//   - Schakelaars (read / uitrol) staan in /etc/mijn-ruimte/mcp-rechten.json: root-eigendom, voor deze dienst alleen leesbaar.
//   - OAuth 2.1: echte dynamische registratie (eigen client_id per registratie, alleen https-redirects op grok.com/x.ai), PKCE S256
//     (tijdconstant vergeleken), toegangstokens 1 uur, verversingstokens 14 dagen met rotatie en hergebruikdetectie (hele familie
//     ingetrokken). Tokens staan alleen als sha256-hash op schijf. Intrekken: /oauth/revoke, of alles tegelijk via het root-bestand
//     /etc/mijn-ruimte/mcp-intrekken (tijdstempel in ms: alles wat daarvóór is uitgegeven, vervalt).
import { createServer, request as httpRequest } from "node:http";
import { createHash, timingSafeEqual, randomBytes } from "node:crypto";
import { readFile, readdir, realpath, stat, open, rename, unlink, mkdir } from "node:fs/promises";
import { readFileSync, writeFileSync, renameSync, mkdirSync, constants as FS } from "node:fs";
import path from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(process.env.MCP_PORT || 8091);
const ROOT_LINK = process.env.MCP_ROOT || "/srv/mijn-ruimte/current";
const TOKEN_FILE = process.env.MCP_TOKEN_FILE || "/etc/mijn-ruimte/mcp.token";
const RECHTEN_FILE = process.env.MCP_RECHTEN_FILE || "/etc/mijn-ruimte/mcp-rechten.json";
const INTREKKEN_FILE = process.env.MCP_INTREKKEN_FILE || "/etc/mijn-ruimte/mcp-intrekken";
const STATE_FILE = process.env.MCP_STATE_FILE || "/srv/mijn-ruimte/mcp-state/sessions.json";
const INBOX = process.env.MCP_UITROL_INBOX || "/srv/mijn-ruimte/uitrol-inbox";
const UITROL_STATUS = process.env.MCP_UITROL_STATUS || "/var/lib/mijn-ruimte-uitrol-status/status.json";
const RELEASES_DIR = process.env.MCP_RELEASES_DIR || "/srv/mijn-ruimte/releases";
const HEALTH_URL = process.env.MCP_HEALTH_URL || "http://127.0.0.1:8080/__gezondheid";
const ISSUER = process.env.MCP_ISSUER || "https://mcp.tarasevych.com";

export const LIMIETEN = Object.freeze({
  MAX_BODY: 1024 * 1024,
  MAX_READ: 120_000,
  MAX_ENTRIES: 200,
  CODE_TTL: 5 * 60 * 1000,
  ACCESS_TTL: 60 * 60 * 1000,
  REFRESH_TTL: 14 * 24 * 60 * 60 * 1000,
  MAX_CLIENTS: 20,
  MAX_PAKKET: 300 * 1024 * 1024,
  MAX_CHUNK: 512 * 1024,
});
const RECHTEN_STANDAARD = Object.freeze({ read: true, uitrol: false });
const VERSIE = /^[0-9]{8}-[0-9]{6}$/;
const BLOCK = /(^|\/)(\.env|geheimen\.env|.*\.(age|pem|key|token|secret)|id_rsa|id_ed25519|credentials.*\.json)$/i;

// ---------------------------------------------------------------------------------------------- toestand (alleen hashes)
const codes = new Map();
let state = { clients: {}, access: {}, refresh: {}, families: {} };
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const s256 = (verifier) => createHash("sha256").update(verifier).digest("base64url");
function sameText(expect, got) {
  const a = Buffer.from(String(expect)); const b = Buffer.from(String(got));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
function saveState() {
  try {
    mkdirSync(path.dirname(STATE_FILE), { recursive: true, mode: 0o700 });
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    renameSync(tmp, STATE_FILE);
  } catch (err) { process.stderr.write(`state-save ${err instanceof Error ? err.message : "error"}\n`); }
}
function loadState() {
  let data;
  try { data = JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return; }
  const now = Date.now();
  const hex64 = /^[a-f0-9]{64}$/;
  const objOud = (bag) => bag && !Array.isArray(bag) && typeof bag === "object" && Object.entries(bag).some(([k, v]) => !hex64.test(k) || !v?.clientId || !v?.fam);
  if (objOud(data.access) || objOud(data.refresh)) {
    // tussenvorm (object met leesbare sleutels): zelfde behandeling als het oude array-formaat
    data = { access: Object.entries(data.access || {}), refresh: Object.entries(data.refresh || {}).filter(([k]) => !hex64.test(k)) };
  }
  if (Array.isArray(data.access) || Array.isArray(data.refresh)) {
    // Oud formaat (leesbare tokens): omzetten naar hashes. Toegangstokens vervallen meteen (opnieuw verversen),
    // verversingstokens blijven hooguit 30 dagen geldig en krijgen elk een eigen familie.
    const refresh = {};
    for (const [token, row] of data.refresh || []) {
      if (!row || !(row.exp > now)) continue;
      const fam = b64url(randomBytes(9));
      refresh[sha(token)] = { exp: Math.min(row.exp, now + 30 * 86_400_000), clientId: "legacy-grok", fam, iat: now };
    }
    state = { clients: { "legacy-grok": { redirects: [], createdAt: now, legacy: true } }, access: {}, refresh, families: {} };
    saveState();
    return;
  }
  state = { clients: data.clients || {}, access: data.access || {}, refresh: data.refresh || {}, families: data.families || {} };
}
function revokedBefore() {
  try { const n = Number(readFileSync(INTREKKEN_FILE, "utf8").trim()); return Number.isFinite(n) ? n : 0; } catch { return 0; }
}
function prune() {
  const now = Date.now();
  for (const bag of [state.access, state.refresh]) for (const [k, v] of Object.entries(bag)) if (!(v.exp > now)) delete bag[k];
  for (const [k, v] of codes) if (!(v.exp > now)) codes.delete(k);
}
function tokenValid(row) {
  if (!row || !(row.exp > Date.now())) return false;
  if (row.iat < revokedBefore()) return false;
  if (state.families[row.fam]) return false;
  return Boolean(state.clients[row.clientId]);
}

// ---------------------------------------------------------------------------------------------- schakelaars (root-bestand)
export function rechten() {
  const out = { ...RECHTEN_STANDAARD };
  try {
    const data = JSON.parse(readFileSync(RECHTEN_FILE, "utf8"));
    for (const key of Object.keys(out)) if (typeof data[key] === "boolean") out[key] = data[key];
  } catch { /* ontbreekt: standaard (lezen aan, uitrol uit) */ }
  return out;
}

// ---------------------------------------------------------------------------------------------- hulpfuncties
function deny(name) {
  const n = String(name).replaceAll("\\", "/");
  if (n.split("/").includes("node_modules") || n.split("/").includes(".git")) return true;
  return BLOCK.test(n);
}
async function rootDir() { return realpath(ROOT_LINK); }
async function inside(rel) {
  const root = await rootDir();
  const target = await realpath(path.resolve(root, rel || "."));
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("PATH_OUTSIDE");
  if (deny(path.relative(root, target))) throw new Error("REFUSED");
  return { root, target };
}
async function fileTokenOk(got) {
  try { return sameText((await readFile(TOKEN_FILE, "utf8")).trim(), got); } catch { return false; }
}
const bearer = (header) => String(header || "").replace(/^Bearer\s+/i, "").trim();
function resolveAuth(header) {
  const got = bearer(header);
  if (!got || got.length > 200) return null;
  const row = state.access[sha(got)];
  return tokenValid(row) ? { clientId: row.clientId } : null;
}
function redirectOk(uri) {
  let u;
  try { u = new URL(uri); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.hash) return false;
  const host = u.hostname;
  return host === "grok.com" || host === "x.ai" || host.endsWith(".grok.com") || host.endsWith(".x.ai");
}
function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
}
const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
const textResult = (text, isError = false) => ({ content: [{ type: "text", text }], isError });
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

// ---------------------------------------------------------------------------------------------- inbox (alleen eigen bestandsnamen, nooit symlinks volgen)
async function inboxRoot() {
  await mkdir(INBOX, { recursive: true, mode: 0o750 });
  const real = await realpath(INBOX);
  const info = await stat(real);
  if (!info.isDirectory()) throw new Error("INBOX_INVALID");
  return real;
}
const NOFOLLOW = FS.O_NOFOLLOW ?? 0;
async function writeNew(file, data) {
  const fh = await open(file, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | NOFOLLOW, 0o640);
  try { await fh.write(data); } finally { await fh.close(); }
}
async function appendTo(file, data) {
  const fh = await open(file, FS.O_WRONLY | FS.O_APPEND | NOFOLLOW);
  try { const info = await fh.stat(); if (!info.isFile()) throw new Error("NOT_A_FILE"); await fh.write(data); return info.size + data.length; } finally { await fh.close(); }
}
async function sizeOf(file) { const fh = await open(file, FS.O_RDONLY | NOFOLLOW); try { return (await fh.stat()).size; } finally { await fh.close(); } }
async function hashOf(file) {
  const fh = await open(file, FS.O_RDONLY | NOFOLLOW);
  try { const h = createHash("sha256"); for await (const chunk of fh.createReadStream()) h.update(chunk); return h.digest("hex"); } finally { await fh.close().catch(() => undefined); }
}

export const TOOLS = [
  { name: "site_health", description: "GET the local site health URL. No secrets.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "release_info", description: "Active release path and commit files.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "list_releases", description: "List release directory names.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "list_dir", description: "List one directory inside the active release.", inputSchema: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "read_file", description: "Read one text file inside the active release. Refuses secrets.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "host_status", description: "Health of the site and of this door, plus the state of the last signed rollout. No secrets.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "permission_flags", description: "Which switches are on (set by the server owner in a root-owned file). Booleans only.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "rollout_status", description: "State of the last signed release rollout (checked, installed or refused, with the reason).", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "rollout_upload_begin", description: "Start uploading a SIGNED release package (made and signed on the owner's PC, see deploy/RUNBOOK-VEILIGE-UITROL.md). Only works when the owner switched on 'uitrol'. Unsigned or tampered packages are refused by the server.", inputSchema: { type: "object", properties: { version: { type: "string", description: "YYYYMMDD-HHMMSS, must match UITROL-VERSIE inside the package." }, bytes: { type: "number" }, sha256: { type: "string" } }, required: ["version", "bytes", "sha256"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "rollout_upload_chunk", description: "Append one base64 chunk (max 512 KiB decoded) of the package started with rollout_upload_begin.", inputSchema: { type: "object", properties: { version: { type: "string" }, data: { type: "string" } }, required: ["version", "data"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "rollout_upload_finish", description: "Finish the upload: checks size and sha256, stores the detached ssh signature (.sig text) and asks the root rollout service to verify and install it.", inputSchema: { type: "object", properties: { version: { type: "string" }, signature: { type: "string", description: "Content of the .sig file made with ssh-keygen -Y sign -n mijn-ruimte-uitrol." } }, required: ["version", "signature"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false } },
];

async function callTool(name, args) {
  const flags = rechten();
  const isUpload = name.startsWith("rollout_upload_");
  if (!isUpload && !flags.read) return textResult("PERMISSION_OFF:read", true);
  if (isUpload && !flags.uitrol) return textResult("PERMISSION_OFF:uitrol (the server owner switches this on in /etc/mijn-ruimte/mcp-rechten.json)", true);
  if (name === "site_health") { const res = await localGet(HEALTH_URL); return textResult(`${res.status} ${res.body}`); }
  if (name === "release_info") {
    const root = await rootDir();
    const readTrim = async (file) => { try { return (await readFile(path.join(root, file), "utf8")).trim(); } catch { return ""; } };
    return textResult(`root=${root}\nBRON-COMMIT=${(await readTrim("BRON-COMMIT")) || "missing"}\nRELEASE-COMMIT=${(await readTrim("RELEASE-COMMIT")) || "missing"}\nUITROL-VERSIE=${(await readTrim("UITROL-VERSIE")) || "missing"}`);
  }
  if (name === "list_releases") {
    let rows = []; try { rows = (await readdir(RELEASES_DIR)).filter((r) => VERSIE.test(r)).sort(); } catch { /* geen map */ }
    let current = ""; try { current = path.basename(await rootDir()); } catch { /* geen release */ }
    return textResult(JSON.stringify({ current, releases: rows }));
  }
  if (name === "list_dir") {
    const rel = String(args?.path || ".").replaceAll("\\", "/");
    if (deny(rel)) return textResult("REFUSED", true);
    const { root, target } = await inside(rel);
    if (!(await stat(target)).isDirectory()) return textResult("NOT_A_DIRECTORY", true);
    const items = await readdir(target, { withFileTypes: true });
    return textResult(items.filter((d) => d.name !== "node_modules" && d.name !== ".git").slice(0, LIMIETEN.MAX_ENTRIES).map((d) => `${d.isDirectory() ? "d" : "f"} ${path.relative(root, path.join(target, d.name)) || d.name}`).join("\n") || "(empty)");
  }
  if (name === "read_file") {
    const rel = String(args?.path || "").replaceAll("\\", "/");
    if (!rel || deny(rel)) return textResult("REFUSED", true);
    const { target } = await inside(rel);
    const info = await stat(target);
    if (!info.isFile()) return textResult("NOT_A_FILE", true);
    if (info.size > LIMIETEN.MAX_READ * 4) return textResult("TOO_LARGE", true);
    const data = await readFile(target, "utf8");
    return textResult(data.length > LIMIETEN.MAX_READ ? data.slice(0, LIMIETEN.MAX_READ) + "\n…TRUNCATED" : data);
  }
  if (name === "permission_flags") return textResult(JSON.stringify(flags));
  if (name === "rollout_status" || name === "host_status") {
    let uitrol = null; try { uitrol = JSON.parse(await readFile(UITROL_STATUS, "utf8")); } catch { /* nog geen uitrol */ }
    if (name === "rollout_status") return textResult(JSON.stringify(uitrol ?? { staat: "geen" }));
    let site; try { site = await localGet(HEALTH_URL); } catch (err) { site = { status: 0, body: err instanceof Error ? err.message : "error" }; }
    return textResult(JSON.stringify({ site: { status: site.status }, door: { ok: true }, uitrol }));
  }
  if (isUpload) {
    const version = String(args?.version || "");
    if (!VERSIE.test(version)) return textResult("INVALID_VERSION (YYYYMMDD-HHMMSS)", true);
    const root = await inboxRoot();
    const part = path.join(root, `upload-${version}.part`);
    const meta = path.join(root, `upload-${version}.json`);
    if (name === "rollout_upload_begin") {
      const bytes = Number(args?.bytes); const digest = String(args?.sha256 || "").toLowerCase();
      if (!Number.isInteger(bytes) || bytes <= 0 || bytes > LIMIETEN.MAX_PAKKET) return textResult("INVALID_SIZE", true);
      if (!/^[a-f0-9]{64}$/.test(digest)) return textResult("INVALID_SHA256", true);
      for (const f of [part, meta]) await unlink(f).catch(() => undefined);
      await writeNew(meta, JSON.stringify({ bytes, sha256: digest }));
      await writeNew(part, Buffer.alloc(0));
      return textResult(`ready for ${bytes} bytes`);
    }
    let info;
    try { info = JSON.parse(await readFile(meta, "utf8")); } catch { return textResult("NO_UPLOAD_STARTED", true); }
    if (name === "rollout_upload_chunk") {
      const data = Buffer.from(String(args?.data || ""), "base64");
      if (!data.length || data.length > LIMIETEN.MAX_CHUNK) return textResult("INVALID_CHUNK", true);
      const now = await appendTo(part, data);
      if (now > info.bytes) { await unlink(part).catch(() => undefined); return textResult("TOO_MANY_BYTES (upload cancelled)", true); }
      return textResult(`${now}/${info.bytes}`);
    }
    // finish
    const signature = String(args?.signature || "");
    if (!signature.includes("BEGIN SSH SIGNATURE") || signature.length > 8192) return textResult("INVALID_SIGNATURE_FORMAT", true);
    if ((await sizeOf(part)) !== info.bytes) return textResult("SIZE_MISMATCH", true);
    if ((await hashOf(part)) !== info.sha256) return textResult("SHA256_MISMATCH", true);
    const finalName = path.join(root, `mijn-ruimte-${version}.tar.gz`);
    for (const f of [finalName, `${finalName}.sig`]) await unlink(f).catch(() => undefined);
    await writeNew(`${finalName}.sig`, signature.endsWith("\n") ? signature : `${signature}\n`);
    await rename(part, finalName);
    await unlink(meta).catch(() => undefined);
    const aanvraag = path.join(root, "aanvraag");
    await unlink(aanvraag).catch(() => undefined);
    await writeNew(aanvraag, `${version}\n`);
    return textResult("uploaded; the root rollout service now verifies the signature and installs it. Check rollout_status in a few minutes.");
  }
  return textResult("UNKNOWN_TOOL", true);
}
async function handleRpc(msg) {
  const id = msg.id ?? null;
  const method = String(msg.method || "");
  if (id === null) return null;
  if (method === "initialize") {
    const offered = msg.params?.protocolVersion;
    return rpcResult(id, { protocolVersion: offered === "2024-11-05" ? offered : "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "mijn-ruimte", version: "2" } });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: TOOLS });
  if (method === "tools/call") {
    try { return rpcResult(id, await callTool(String(msg.params?.name || ""), msg.params?.arguments || {})); }
    catch (err) { return rpcResult(id, textResult(err instanceof Error ? err.message : "ERROR", true)); }
  }
  return rpcError(id, -32601, "METHOD_NOT_FOUND");
}

// ---------------------------------------------------------------------------------------------- OAuth
function metadata() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint: `${ISSUER}/oauth/token`,
    registration_endpoint: `${ISSUER}/oauth/register`,
    revocation_endpoint: `${ISSUER}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["read"],
  };
}
function authorizePage(q, error) {
  const client = state.clients[q.get("client_id") || ""];
  const fields = ["response_type", "client_id", "redirect_uri", "state", "scope", "code_challenge", "code_challenge_method"].map((name) =>
    `<input type="hidden" name="${name}" value="${esc(q.get(name) || "")}">`).join("");
  let host = ""; try { host = new URL(q.get("redirect_uri") || "").hostname; } catch { host = "?"; }
  return `<!doctype html><html lang="uk"><meta charset="utf-8"><title>Доступ до Mijn Ruimte / Toegang tot Mijn Ruimte</title>
<body style="font-family:sans-serif;max-width:36rem;margin:3rem auto">
<h1>Дозволити доступ «${esc(client?.name || "клієнт")}»?</h1>
<p>Після дозволу ви повернетеся на <b>${esc(host)}</b>. Клієнт отримає лише читання поточного випуску і стан сайту (а якщо ви ввімкнули це на сервері — завантаження підписаного пакета). База даних і секрети сервера йому не віддаються. Доступ діє 1 годину й поновлюється до 14 днів; відкликати можна будь-коли.</p>
<p lang="nl">Na toestemming gaat u terug naar <b>${esc(host)}</b>. De client krijgt alleen leestoegang tot de actieve release en de stand van de site (en, als u dat op de server hebt aangezet, het uploaden van een ondertekend pakket). Database en geheimen van de server krijgt hij niet. Toegang geldt 1 uur en wordt tot 14 dagen vernieuwd; intrekken kan altijd.</p>
${error ? `<p style="color:#8a1f1f">${esc(error)}</p>` : ""}
<form method="post" action="/oauth/authorize">
${fields}
<label>Токен дверей / Deurtoken<br><input name="bridge_token" type="password" autocomplete="off" required style="width:100%"></label>
<p><button type="submit">Дозволити / Toestaan</button></p>
</form></body></html>`;
}
function issuePair(clientId, fam) {
  const access = b64url(randomBytes(32));
  const refresh = b64url(randomBytes(32));
  const now = Date.now();
  const family = fam || b64url(randomBytes(9));
  state.access[sha(access)] = { exp: now + LIMIETEN.ACCESS_TTL, clientId, fam: family, iat: now };
  state.refresh[sha(refresh)] = { exp: now + LIMIETEN.REFRESH_TTL, clientId, fam: family, iat: now };
  prune(); saveState();
  return { access_token: access, token_type: "Bearer", expires_in: LIMIETEN.ACCESS_TTL / 1000, refresh_token: refresh, scope: "read" };
}
function revokeFamily(fam) {
  if (!fam) return;
  state.families[fam] = Date.now();
  for (const bag of [state.access, state.refresh]) for (const [k, v] of Object.entries(bag)) if (v.fam === fam) delete bag[k];
  // familielijst begrenzen (oud genoeg = alle tokens ervan zijn toch verlopen)
  for (const [k, at] of Object.entries(state.families)) if (Date.now() - at > LIMIETEN.REFRESH_TTL) delete state.families[k];
  saveState();
}
function send(res, status, body, extra = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const type = typeof body === "string" && body.startsWith("<!") ? "text/html; charset=utf-8" : "application/json; charset=utf-8";
  const html = type.startsWith("text/html") ? { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'", "x-frame-options": "DENY" } : {};
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...html, ...extra });
  res.end(raw);
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > LIMIETEN.MAX_BODY) throw new Error("TOO_LARGE"); chunks.push(chunk); }
  return Buffer.concat(chunks).toString("utf8");
}
const formBody = (raw) => Object.fromEntries(new URLSearchParams(raw));
// Eenvoudige snelheidsgrens per route (in het geheugen; de tunnel geeft cf-connecting-ip mee).
const hits = new Map();
function limited(req, key, max, windowMs) {
  const ip = String(req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "?");
  const k = `${key}:${ip}`; const now = Date.now();
  const row = hits.get(k);
  if (!row || now - row.start > windowMs) { hits.set(k, { start: now, n: 1 }); return false; }
  row.n += 1; return row.n > max;
}

const sessions = new Set();
export const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const pathName = url.pathname;
  try {
    if (req.method === "GET" && (pathName === "/.well-known/oauth-authorization-server" || pathName === "/.well-known/openid-configuration")) { send(res, 200, metadata()); return; }
    if (req.method === "GET" && pathName === "/.well-known/oauth-protected-resource") {
      send(res, 200, { resource: `${ISSUER}/Grok`, authorization_servers: [ISSUER], scopes_supported: ["read"], bearer_methods_supported: ["header"] }); return;
    }
    if (pathName === "/oauth/register" && req.method === "POST") {
      if (limited(req, "register", 10, 3600_000)) { send(res, 429, { error: "slow_down" }); return; }
      const raw = await readBody(req);
      const body = raw.trim().startsWith("{") ? JSON.parse(raw || "{}") : formBody(raw);
      const asked = [].concat(body.redirect_uris || []);
      const redirects = asked.filter(redirectOk).slice(0, 5);
      if (!redirects.length || redirects.length !== asked.length) { send(res, 400, { error: "invalid_redirect_uri" }); return; }
      prune();
      const ids = Object.keys(state.clients).filter((k) => !state.clients[k].legacy);
      if (ids.length >= LIMIETEN.MAX_CLIENTS) {
        // de oudste client zonder geldige tokens wijkt; anders weigeren
        const inUse = new Set([...Object.values(state.access), ...Object.values(state.refresh)].map((t) => t.clientId));
        const victim = ids.filter((k) => !inUse.has(k)).sort((a, b) => state.clients[a].createdAt - state.clients[b].createdAt)[0];
        if (!victim) { send(res, 400, { error: "too_many_clients" }); return; }
        delete state.clients[victim];
      }
      const clientId = `mr_${b64url(randomBytes(18))}`;
      const name = String(body.client_name || "MCP-client").replace(/[^\p{L}\p{N} ._-]/gu, "").slice(0, 60) || "MCP-client";
      state.clients[clientId] = { redirects, createdAt: Date.now(), name };
      saveState();
      send(res, 201, { client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: redirects, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "read" });
      return;
    }
    const clientRedirectOk = (clientId, redirect) => { const c = state.clients[clientId]; return Boolean(c && !c.legacy && c.redirects.includes(redirect) && redirectOk(redirect)); };
    if (pathName === "/oauth/authorize" && req.method === "GET") {
      const q = url.searchParams;
      if (q.get("response_type") !== "code" || !clientRedirectOk(q.get("client_id") || "", q.get("redirect_uri") || "") || q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(q.get("code_challenge") || "")) {
        send(res, 400, "<!doctype html><title>Помилка / Fout</title><p>Неповний або чужий запит входу. / Onvolledig of onbekend aanmeldverzoek.</p>"); return;
      }
      send(res, 200, authorizePage(q, "")); return;
    }
    if (pathName === "/oauth/authorize" && req.method === "POST") {
      if (limited(req, "authorize", 10, 15 * 60_000)) { send(res, 429, "<!doctype html><p>Забагато спроб. / Te veel pogingen.</p>"); return; }
      const q = new URLSearchParams(await readBody(req));
      const back = q.get("redirect_uri") || "";
      const clientId = q.get("client_id") || "";
      if (!clientRedirectOk(clientId, back) || q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(q.get("code_challenge") || "")) { send(res, 400, { error: "invalid_request" }); return; }
      if (!(await fileTokenOk(q.get("bridge_token") || ""))) { send(res, 401, authorizePage(q, "Токен не підійшов. / Token klopt niet.")); return; }
      const code = b64url(randomBytes(32));
      codes.set(sha(code), { challenge: q.get("code_challenge"), redirect: back, exp: Date.now() + LIMIETEN.CODE_TTL, clientId });
      const dest = new URL(back);
      dest.searchParams.set("code", code);
      if (q.get("state")) dest.searchParams.set("state", q.get("state"));
      res.writeHead(302, { location: dest.toString(), "cache-control": "no-store" }); res.end(); return;
    }
    if (pathName === "/oauth/token" && req.method === "POST") {
      if (limited(req, "token", 60, 15 * 60_000)) { send(res, 429, { error: "slow_down" }); return; }
      const body = formBody(await readBody(req));
      const id = String(body.client_id || "");
      if (!state.clients[id]) { send(res, 401, { error: "invalid_client" }); return; }
      if (body.grant_type === "refresh_token") {
        const key = sha(body.refresh_token || "");
        const row = state.refresh[key];
        if (!row) {
          // hergebruik van een al geroteerd verversingstoken = mogelijk gestolen: niets uitgeven
          send(res, 400, { error: "invalid_grant" }); return;
        }
        delete state.refresh[key];
        if (!tokenValid(row) || row.clientId !== id) { saveState(); send(res, 400, { error: "invalid_grant" }); return; }
        if (row.used) { revokeFamily(row.fam); send(res, 400, { error: "invalid_grant" }); return; }
        // verbruikte tokens onthouden (als "used") zodat een tweede gebruik de familie intrekt
        state.refresh[key] = { ...row, used: true };
        send(res, 200, issuePair(id, row.fam)); return;
      }
      if (body.grant_type !== "authorization_code") { send(res, 400, { error: "unsupported_grant_type" }); return; }
      const ckey = sha(body.code || "");
      const row = codes.get(ckey);
      codes.delete(ckey);
      if (!row || row.exp <= Date.now() || row.redirect !== body.redirect_uri || row.clientId !== id || !body.code_verifier || !sameText(s256(String(body.code_verifier)), row.challenge)) {
        send(res, 400, { error: "invalid_grant" }); return;
      }
      send(res, 200, issuePair(id)); return;
    }
    if (pathName === "/oauth/revoke" && req.method === "POST") {
      const body = formBody(await readBody(req));
      const key = sha(body.token || "");
      const row = state.access[key] || state.refresh[key];
      if (row) revokeFamily(row.fam);
      send(res, 200, {}); return;
    }
    if (req.method === "GET" && pathName === "/health") { send(res, 200, { ok: true, service: "mijn-ruimte-mcp", version: 2 }); return; }
    const door = pathName.toLowerCase();
    if (!new Set(["/grok", "/claude", "/chatgpt", "/gemini", "/copilot"]).has(door)) { send(res, 404, { error: "NOT_FOUND" }); return; }
    const auth = resolveAuth(req.headers.authorization);
    if (!auth) {
      send(res, 401, { error: "UNAUTHORIZED" }, { "www-authenticate": `Bearer realm="mijn-ruimte", resource_metadata="${ISSUER}/.well-known/oauth-protected-resource"` }); return;
    }
    if (req.method === "DELETE") { res.writeHead(204); res.end(); return; }
    if (req.method !== "POST") { send(res, 405, { error: "POST_ONLY" }); return; }
    let msg;
    try { msg = JSON.parse(await readBody(req) || "{}"); }
    catch (err) {
      if (err instanceof Error && err.message === "TOO_LARGE") { send(res, 413, { error: "TOO_LARGE" }); return; }
      send(res, 400, rpcError(null, -32700, "PARSE_ERROR")); return;
    }
    if (msg && msg.method && msg.id === undefined) { res.writeHead(202); res.end(); return; }
    const sid = String(req.headers["mcp-session-id"] || "");
    const extra = {};
    if (msg.method === "initialize") { const sidNew = randomBytes(16).toString("hex"); sessions.add(sidNew); if (sessions.size > 1000) sessions.delete(sessions.values().next().value); extra["mcp-session-id"] = sidNew; }
    else if (sid && !sessions.has(sid)) { send(res, 404, rpcError(msg.id ?? null, -32001, "SESSION_NOT_FOUND")); return; }
    const result = await handleRpc(msg);
    if (msg.method === "tools/call") process.stdout.write(`tools/call ${String(msg.params?.name || "").slice(0, 60)} client=${auth.clientId} ${result?.result?.isError ? "fout" : "ok"}\n`);
    send(res, 200, result, extra);
  } catch (err) {
    if (!res.headersSent) send(res, err instanceof Error && err.message === "TOO_LARGE" ? 413 : 500, { error: "SERVER_ERROR" });
  }
});
loadState();
server.listen(PORT, HOST, () => { process.stdout.write(`mijn-ruimte-mcp ${HOST}:${PORT}\n`); });
