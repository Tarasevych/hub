#!/usr/bin/env node
// MCP-deur van Mijn Ruimte (alleen loopback, via de tunnel op mcp.tarasevych.com/<grok|claude|…>).
//
// Veilig ontwerp (vervangt de oude deur met sudo-hulp, schrijfbare klad en "update_door"):
//   - GEEN pad naar root: deze dienst start geen processen (geen child_process, geen sudo) en heeft geen sudo-regel meer.
//   - Lezen: de actieve release (binnen de map, zonder geheimen), gezondheid, releaselijst, uitrolstand.
//   - Uitrollen: alleen een releasepakket + losse handtekening in de inbox leggen. De root-dienst mijn-ruimte-uitrol controleert de
//     handtekening met de publieke sleutel van de eigenaar (privésleutel alleen op zijn pc) en installeert pas daarna.
//   - Schakelaars (read / uitrol) staan in /etc/mijn-ruimte/mcp-rechten.json: root-eigendom, voor deze dienst alleen leesbaar.
//   - OAuth 2.1: echte dynamische registratie (eigen client_id per registratie), PKCE S256 (tijdconstant vergeleken), refresh met
//     rotatie en hergebruikdetectie (hele familie ingetrokken). Tokens staan alleen als sha256-hash op schijf. Intrekken:
//     /oauth/revoke, «Агенти → Токени й двері» op de site, of alles tegelijk via het root-bestand /etc/mijn-ruimte/mcp-intrekken
//     (tijdstempel in ms: alles wat daarvóór is uitgegeven, vervalt).
//   - Terugkeeradressen (RFC 8252): https van bekende AI-klanten (grok.com, x.ai, claude.ai, chatgpt.com, openai.com, vscode.dev),
//     loopback (http://127.0.0.1|localhost|[::1], elke poort), eigen app-schema's (cursor://, vscode://, windsurf://) en wat de
//     eigenaar zelf toevoegt in mcp-rechten.json («oauthRedirects»). Zelfde regels als shared/ai-verbinding.ts.
//   - Toestemming «in één klik»: GET /oauth/authorize stuurt de browser naar het venster «Дозволити» van de site (bestaande
//     aanmelding van de eigenaar, verse bevestiging). De site praat met deze deur via /intern/* (alleen loopback, niet in de
//     tunnelregel, plus een willekeurige sleutel die deze dienst bij elke start in mcp-state/intern.sleutel zet). De oude weg met het
//     deurtoken (formulier) blijft: /oauth/authorize?…&methode=token.
//   - Duur per AI (keuze van de eigenaar): 1 uur … onbeperkt; het toegangstoken is aan de deur gebonden (/Grok ≠ /claude).
//   - Agenttokens van de site (tvh_…, «Підключити вручну») werken ook als Bearer: de site bevestigt ze (alleen van de eigenaar).
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
const ISSUER_HOST = new URL(ISSUER).host;
const APP_URL = process.env.MCP_APP_URL || "http://127.0.0.1:8080";
const INTERN_FILE = process.env.MCP_INTERN_SLEUTEL || path.join(path.dirname(STATE_FILE), "intern.sleutel");
/** Deuren (pad zonder hoofdlettergevoeligheid → naam zoals in de tunnelregel). */
const DEUREN = new Map([["grok", "Grok"], ["claude", "claude"], ["chatgpt", "chatgpt"], ["gemini", "gemini"], ["copilot", "copilot"]]);
/**
 * AGENTPADEN HOREN BIJ DE APP (20.10.2026, deploy/CONNECTOR-EEN-PAD.md). /claude, /gpt, /grok, /gemini, /copilot en /cursor zijn
 * sinds vandaag het ENE connectoradres per agent, bediend door de hoofdapp (backend/connector-v2.ts): privé én technisch in één
 * koppeling, levend gefilterd. Zolang de tunnelregel op de server nog `(?i:grok|claude|…)` naar deze deur stuurt (die regel staat
 * in /etc/cloudflared/config.yml en zit NIET in het uitrolpakket), zou POST /claude hier belanden en kreeg de mens het oude
 * deurvenster («Читання» + «Підписаний випуск», elf technische hulpmiddelen, geen mail/Drive/apparaten). Dat is precies wat op
 * 20.10.2026 na release 20261020-173704 gebeurde. Daarom stuurt de deur die paden nu zelf door naar de app (loopback, zelfde
 * Host, zelfde koppen en body) — en ook de OAuth-ontdekking die erbij hoort, zodat een AI-klant nooit meer bij de OAuth van de
 * deur uitkomt voor een agentadres. Alleen MCP_AGENTPADEN=deur (tests, noodgeval) laat de deur ze zelf bedienen.
 */
const AGENTPADEN_NAAR_APP = (process.env.MCP_AGENTPADEN || "app") !== "deur";
const AGENT_SLUGS = /^(claude|gpt|grok|gemini|copilot|cursor)$/i;
/** Het pad dat de app moet krijgen (agentslug in kleine letters), of null als dit pad van de deur zelf is. */
function appPad(pathName) {
  if (!AGENTPADEN_NAAR_APP) return null;
  const delen = pathName.replace(/\/+$/, "").split("/").filter(Boolean);
  // Beveiligingsreview 21.10.2026: NOOIT het ruwe pad teruggeven. `new URL("/x/..//oauth2/token").pathname` is «//oauth2/token», en
  // `new URL("//oauth2/token", APP_URL)` is http://oauth2/token — een ANDERE host (SSRF naar elke naam «oauth2»/«mcp» in het netwerk
  // van de server, bv. een container). Het doorgestuurde pad wordt dus altijd opnieuw opgebouwd uit de delen: één schuine streep vooraan.
  const schoon = `/${delen.join("/")}${pathName.length > 1 && pathName.endsWith("/") ? "/" : ""}`;
  // /<agent>, /<agent>/.well-known/oauth-protected-resource en de oude vorm /ai/<agent>[/.well-known/…]
  const oud = delen[0] === "ai" ? 1 : 0;
  if (delen.length >= 1 + oud && AGENT_SLUGS.test(delen[oud] || "")) {
    const rest = delen.slice(oud + 1);
    if (rest.length === 0 || (rest.length === 2 && rest[0] === ".well-known" && rest[1] === "oauth-protected-resource")) {
      return `/${oud ? "ai/" : ""}${delen[oud].toLowerCase()}${rest.length ? "/.well-known/oauth-protected-resource" : ""}`;
    }
    return null;
  }
  // /.well-known/oauth-protected-resource/<agent>  (RFC 9728-vorm), …/mcp én de wortel /.well-known/oauth-protected-resource van de app
  if (delen[0] === ".well-known" && delen[1] === "oauth-protected-resource" && delen.length === 2) {
    return "/.well-known/oauth-protected-resource";
  }
  if (delen[0] === ".well-known" && delen[1] === "oauth-protected-resource" && delen.length === 3 && (AGENT_SLUGS.test(delen[2]) || delen[2] === "mcp")) {
    return `/.well-known/oauth-protected-resource/${delen[2].toLowerCase()}`;
  }
  if (delen[0] === ".well-known" && delen[1] === "oauth-protected-resource" && delen.length === 4 && delen[2] === "ai" && AGENT_SLUGS.test(delen[3])) {
    return `/.well-known/oauth-protected-resource/ai/${delen[3].toLowerCase()}`;
  }
  // De autorisatieserver van de app (issuer https://mcp.…/oauth2): alle ontdekkingsvormen van RFC 8414 / OpenID, en de eindpunten zelf.
  if (delen[0] === ".well-known" && (delen[1] === "oauth-authorization-server" || delen[1] === "openid-configuration") && (delen.length === 1 + 1 || (delen.length === 3 && delen[2] === "oauth2"))) return schoon;
  if (delen[0] === "oauth2") return schoon;
  if (delen[0] === "mcp" && delen.length === 1) return schoon;
  return null;
}
/** Hop-by-hop-koppen (RFC 9110 §7.6.1) en wat de deur zelf zet: die komen nooit van de klant door naar de app. */
const HOP_KOPPEN = ["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "proxy-authorization", "proxy-authenticate", "te", "trailer", "x-mijn-ruimte-intern"];
/** Eén verzoek één-op-één doorgeven aan de app (koppen, body, status, koppen van het antwoord). Nooit buffering van het antwoord. */
function naarApp(req, res, pad) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const doel = new URL(pad + url.search, APP_URL);
  // Tweede muur: wat er ook in `pad` stond, het doel is ALTIJD de app zelf (zelfde schema, host en poort als MCP_APP_URL).
  if (doel.origin !== new URL(APP_URL).origin) { send(res, 400, { error: "ONGELDIG_PAD" }); return; }
  const koppen = { ...req.headers };
  // Bewust ALLEEN de vaste lijst, niet ook de namen die de klant in «Connection» opsomt: anders kon hij zo `cf-connecting-ip`
  // laten weghalen, en dan zag de app het loopbackadres van de deur als herkomst.
  for (const naam of HOP_KOPPEN) delete koppen[naam];
  koppen.host = ISSUER_HOST;
  koppen["x-mijn-ruimte-deur"] = "doorgestuurd";
  const uit = httpRequest(doel, { method: req.method, headers: koppen, timeout: 290_000 }, (antw) => {
    res.writeHead(antw.statusCode || 502, antw.headers);
    antw.pipe(res);
  });
  uit.on("error", () => { if (!res.headersSent) send(res, 502, { error: "APP_ONBEREIKBAAR", uitleg: "De hoofdapp (poort 8080) antwoordt niet; het agentadres wordt door de app bediend, niet door deze deur." }); else res.destroy(); });
  uit.on("timeout", () => uit.destroy(new Error("TIMEOUT")));
  req.pipe(uit);
}
/** Duur per verbinding [toegang s, refresh dagen]; 0 = tot intrekken. Zelfde ids als shared/ai-verbinding.ts. */
const DUREN = Object.freeze({ "1u": [3600, 14], "8u": [8 * 3600, 30], "1d": [86400, 30], "7d": [7 * 86400, 90], "30d": [30 * 86400, 180], altijd: [0, 0] });
const NOOIT_MS = 100 * 365 * 86_400_000;
const duurMs = (id) => { const [a, r] = DUREN[id] || DUREN["1u"]; return { access: a ? a * 1000 : NOOIT_MS, refresh: r ? r * 86_400_000 : NOOIT_MS }; };

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
/** Openstaande autorisatieverzoeken (rid = mrd_…), 10 minuten: wachten op «Дозволити» op de site of op het deurtoken. */
const verzoeken = new Map();
const VERZOEK_TTL = 10 * 60 * 1000;
// grants: per familie (één toestemming) klant, deur, duur, wie toestond en laatst gebruikt — nooit tokens.
let state = { clients: {}, access: {}, refresh: {}, families: {}, grants: {} };
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
    state = { clients: { "legacy-grok": { redirects: [], createdAt: now, legacy: true } }, access: {}, refresh, families: {}, grants: {} };
    saveState();
    return;
  }
  state = { clients: data.clients || {}, access: data.access || {}, refresh: data.refresh || {}, families: data.families || {}, grants: data.grants || {} };
}
function revokedBefore() {
  try { const n = Number(readFileSync(INTREKKEN_FILE, "utf8").trim()); return Number.isFinite(n) ? n : 0; } catch { return 0; }
}
function prune() {
  const now = Date.now();
  for (const bag of [state.access, state.refresh]) for (const [k, v] of Object.entries(bag)) if (!(v.exp > now)) delete bag[k];
  for (const [k, v] of codes) if (!(v.exp > now)) codes.delete(k);
  for (const [k, v] of verzoeken) if (!(v.exp > now)) verzoeken.delete(k);
  // grantgegevens zonder enig levend token zijn klaar
  const levend = new Set([...Object.values(state.access), ...Object.values(state.refresh)].map((t) => t.fam));
  for (const fam of Object.keys(state.grants)) if (!levend.has(fam)) delete state.grants[fam];
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
/** Extra terugkeeradressen die de eigenaar zelf toestaat («oauthRedirects» in het root-bestand; exacte URI of voorvoegsel op «/»). */
function extraRedirects() {
  let lijst = [];
  try { const data = JSON.parse(readFileSync(RECHTEN_FILE, "utf8")); if (Array.isArray(data.oauthRedirects)) lijst = data.oauthRedirects.filter((x) => typeof x === "string" && x.length <= 300).slice(0, 20); } catch { /* geen bestand */ }
  return [...lijst, `${ISSUER}/oauth-terug`];
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
let laatsteBewaring = 0;
/** Toegang voor deze deur: een OAuth-token van deze deur (of van vóór de deurbinding), of een agenttoken tvh_ van de eigenaar. */
async function resolveAuth(header, deur) {
  const got = bearer(header);
  if (!got || got.length > 200) return null;
  if (got.startsWith("tvh_")) return paneelToken(got, deur);
  const row = state.access[sha(got)];
  if (!tokenValid(row)) return null;
  if (row.door && row.door !== deur) return null;
  const g = state.grants[row.fam];
  if (g) { g.lastUsedAt = Date.now(); if (Date.now() - laatsteBewaring > 60_000) { laatsteBewaring = Date.now(); saveState(); } }
  return { clientId: row.clientId, naam: g?.clientName || state.clients[row.clientId]?.name || row.clientId };
}

// Agenttokens van de site (tvh_…): de site controleert ze (hash, vervaldatum, eigenaar, AI niet geblokkeerd). 60 s in het geheugen.
const paneelCache = new Map();
async function paneelToken(token, deur) {
  const key = sha(token); const now = Date.now();
  const hit = paneelCache.get(key);
  if (hit && hit.exp > now) return hit.ok ? { clientId: `tvh:${hit.id}`, naam: hit.naam } : null;
  let ok = false, id = "", naam = "";
  try {
    const res = await appPost("/api/mcp/deur/token-check", { token, deur });
    if (res.status === 200) { const d = JSON.parse(res.body); ok = d.ok === true; id = String(d.id || "").slice(0, 60); naam = String(d.naam || "agent").slice(0, 80); }
  } catch { ok = false; }
  if (paneelCache.size > 500) paneelCache.clear();
  paneelCache.set(key, { ok, id, naam, exp: now + (ok ? 60_000 : 15_000) });
  return ok ? { clientId: `tvh:${id}`, naam } : null;
}

// ---------------------------------------------------------------------------------------------- terugkeeradressen (RFC 8252)
const WEB_HOSTS = ["claude.ai", "claude.com", "grok.com", "x.ai", "chatgpt.com", "openai.com", "vscode.dev", "cursor.com"];
const APP_SCHEMAS = ["cursor", "vscode", "vscode-insiders", "windsurf"];
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
/** 'web' | 'loopback' | 'app' | null — gelijk aan redirectSoort() in shared/ai-verbinding.ts (zelfde test). */
export function redirectSoort(uri, extra = []) {
  if (typeof uri !== "string" || uri.length > 2000 || /[\s<>"]/.test(uri)) return null;
  let u; try { u = new URL(uri); } catch { return null; }
  if (u.username || u.password || u.hash || uri.includes("#")) return null;
  const schema = u.protocol.replace(/:$/, "");
  for (const e of extra) {
    if (!e || typeof e !== "string") continue;
    if (uri === e || (e.endsWith("/") && uri.startsWith(e))) return schema === "https" ? "web" : schema === "http" ? (LOOPBACK.has(u.hostname) ? "loopback" : null) : APP_SCHEMAS.includes(schema) ? "app" : null;
  }
  if (schema === "https") { const host = u.hostname.toLowerCase(); return WEB_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? "web" : null; }
  if (schema === "http") return LOOPBACK.has(u.hostname) ? "loopback" : null;
  if (APP_SCHEMAS.includes(schema)) return u.host ? "app" : null;
  return null;
}
const redirectOk = (uri) => redirectSoort(uri, extraRedirects()) !== null;
/** Exact, behalve loopback: daar telt de poort niet mee (RFC 8252 §7.3). */
function redirectPast(geregistreerd, gevraagd) {
  if (geregistreerd.includes(gevraagd)) return true;
  let r; try { r = new URL(gevraagd); } catch { return false; }
  if (r.protocol !== "http:" || !LOOPBACK.has(r.hostname)) return false;
  return geregistreerd.some((x) => { try { const g = new URL(x); return g.protocol === "http:" && LOOPBACK.has(g.hostname) && g.hostname === r.hostname && g.pathname === r.pathname && g.search === r.search; } catch { return false; } });
}

// ---------------------------------------------------------------------------------------------- site (hoofdapp) via loopback
let internSleutel = "";
function internSleutelMaken() {
  internSleutel = b64url(randomBytes(32));
  try {
    mkdirSync(path.dirname(INTERN_FILE), { recursive: true, mode: 0o700 });
    const tmp = `${INTERN_FILE}.${process.pid}.tmp`;
    writeFileSync(tmp, `${internSleutel}\n`, { mode: 0o640 });
    renameSync(tmp, INTERN_FILE);
  } catch (err) { internSleutel = ""; process.stderr.write(`intern-sleutel ${err instanceof Error ? err.message : "error"} (toestemming via de site staat uit)\n`); }
}
function appPost(pad, data) {
  return new Promise((resolve, reject) => {
    if (!internSleutel) { reject(new Error("GEEN_SLEUTEL")); return; }
    const body = JSON.stringify(data);
    const req = httpRequest(new URL(pad, APP_URL), { method: "POST", timeout: 4000, headers: { host: ISSUER_HOST, "content-type": "application/json", "content-length": Buffer.byteLength(body), "x-mijn-ruimte-intern": internSleutel } }, (res) => {
      const chunks = []; res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8").slice(0, 8000) }));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("TIMEOUT")));
    req.end(body);
  });
}
/** /intern/* alleen van de site zelf: geen verkeer via de tunnel (cf-koppen) en de juiste sleutel. */
function internOk(req) {
  if (!internSleutel) return false;
  if (req.headers["cf-connecting-ip"] || req.headers["cf-ray"] || req.headers["x-forwarded-for"]) return false;
  const addr = String(req.socket.remoteAddress || "");
  if (addr !== "127.0.0.1" && addr !== "::1" && addr !== "::ffff:127.0.0.1") return false;
  return sameText(internSleutel, String(req.headers["x-mijn-ruimte-intern"] || ""));
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

// Teksten van de elf deurhulpmiddelen: Oekraïens en Nederlands, nooit Engels (eigenaar, 20.10.2026). De deur kent geen
// gebruikersprofiel (zij staat los van de database), dus de taal komt uit MCP_TAAL ('uk' | 'nl'; anders Oekraïens).
// Het patroon `{ name: "…"` per regel in TOOLS is een contract: tests tellen de elf namen in de bron.
const TAAL = process.env.MCP_TAAL === "nl" ? "nl" : "uk";
const TEKST = {
  site_health: { uk: ["Стан сайту", "Запит до локальної адреси здоров’я сайту. Без секретів."], nl: ["Gezondheid van de site", "Vraagt het lokale gezondheidsadres van de site op. Zonder geheimen."] },
  release_info: { uk: ["Активний випуск", "Шлях активного випуску та файли з версією й комітом."], nl: ["Actieve release", "Pad van de actieve release en de bestanden met versie en commit."] },
  list_releases: { uk: ["Список випусків", "Назви тек випусків на сервері."], nl: ["Lijst van releases", "Namen van de releasemappen op de server."] },
  list_dir: { uk: ["Переглядати теку випуску", "Вміст однієї теки всередині активного випуску."], nl: ["Map van de release bekijken", "Inhoud van één map binnen de actieve release."] },
  read_file: { uk: ["Читати файл випуску", "Один текстовий файл з активного випуску. Секрети двері відмовляють."], nl: ["Bestand van de release lezen", "Eén tekstbestand uit de actieve release. Geheimen weigert de deur."] },
  host_status: { uk: ["Стан сервера й дверей", "Здоров’я сайту й цих дверей, а також стан останнього підписаного розгортання. Без секретів."], nl: ["Status van server en deur", "Gezondheid van de site en van deze deur, plus de staat van de laatste ondertekende uitrol. Zonder geheimen."] },
  permission_flags: { uk: ["Увімкнені перемикачі", "Які перемикачі ввімкнув власник сервера (файл, що належить root). Лише так/ні."], nl: ["Ingeschakelde schakelaars", "Welke schakelaars de eigenaar van de server aanzette (bestand van root). Alleen ja/nee."] },
  rollout_status: { uk: ["Стан останнього розгортання", "Що сталося з останнім підписаним випуском: перевірено, встановлено чи відхилено, і чому."], nl: ["Staat van de laatste uitrol", "Wat er met de laatste ondertekende release gebeurde: gecontroleerd, geïnstalleerd of geweigerd, en waarom."] },
  rollout_upload_begin: { uk: ["Починати завантаження підписаного пакета", "Починає завантаження ПІДПИСАНОГО пакета випуску (зібраного й підписаного на ПК власника). Працює лише коли власник увімкнув перемикач розгортання. Непідписані чи змінені пакети сервер відхиляє."], nl: ["Upload van een ondertekend pakket starten", "Start het uploaden van een ONDERTEKEND releasepakket (gemaakt en ondertekend op de pc van de eigenaar). Werkt alleen als de eigenaar de uitrolschakelaar aanzette. Niet-ondertekende of gewijzigde pakketten weigert de server."] },
  rollout_upload_chunk: { uk: ["Завантажувати частину пакета", "Додає одну частину (base64, до 512 КіБ) до пакета, завантаження якого вже почато."], nl: ["Deel van het pakket uploaden", "Voegt één deel (base64, hoogstens 512 KiB) toe aan het pakket waarvan de upload al begon."] },
  rollout_upload_finish: { uk: ["Завершувати завантаження пакета", "Перевіряє розмір і SHA-256, зберігає підпис (.sig) і просить службу розгортання перевірити й встановити пакет."], nl: ["Upload van het pakket afronden", "Controleert grootte en SHA-256, bewaart de handtekening (.sig) en vraagt de uitroldienst het pakket te controleren en te installeren."] },
};
const metTekst = (t) => ({ name: t.name, title: TEKST[t.name][TAAL][0], description: TEKST[t.name][TAAL][1], inputSchema: t.inputSchema, annotations: t.annotations });
export const TOOLS = [
  { name: "site_health", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "release_info", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "list_releases", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "list_dir", inputSchema: { type: "object", properties: { path: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "read_file", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "host_status", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "permission_flags", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "rollout_status", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "rollout_upload_begin", inputSchema: { type: "object", properties: { version: { type: "string", description: "YYYYMMDD-HHMMSS, must match UITROL-VERSIE inside the package." }, bytes: { type: "number" }, sha256: { type: "string" } }, required: ["version", "bytes", "sha256"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "rollout_upload_chunk", inputSchema: { type: "object", properties: { version: { type: "string" }, data: { type: "string" } }, required: ["version", "data"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false } },
  { name: "rollout_upload_finish", inputSchema: { type: "object", properties: { version: { type: "string" }, signature: { type: "string", description: "Content of the .sig file made with ssh-keygen -Y sign -n mijn-ruimte-uitrol." } }, required: ["version", "signature"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false } },
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
    const offered = String(msg.params?.protocolVersion || "");
    const versies = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
    return rpcResult(id, { protocolVersion: versies.includes(offered) ? offered : "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "mijn-ruimte", version: "3" } });
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: TOOLS.map(metTekst) });
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
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["read"],
  };
}
/** Deurnaam uit een padsegment (hoofdletters vrij), of null. */
const deurVan = (segment) => (DEUREN.has(String(segment || "").toLowerCase()) ? String(segment).toLowerCase() : null);
/** RFC 9728: `resource` is precies de URL die de klant gebruikt (zelfde hoofdletters als in het pad). */
const resourceVoor = (segment) => `${ISSUER}/${segment}`;
const prmVoor = (segment) => ({ resource: resourceVoor(segment), authorization_servers: [ISSUER], scopes_supported: ["read"], bearer_methods_supported: ["header"], resource_name: `Mijn Ruimte — ${DEUREN.get(segment.toLowerCase()) || segment}` });
/** RFC 8707: alleen een resource van deze host met een bekende deur; geeft de deur terug, "" zonder resource, null bij fout. */
function deurUitResource(resource) {
  if (!resource) return "";
  let u; try { u = new URL(resource); } catch { return null; }
  if (`${u.protocol}//${u.host}` !== ISSUER || u.search || u.hash) return null;
  const delen = u.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  // Een agentadres is van de app: daar geeft deze deur geen toestemming en geen token meer voor (anders zou een AI-klant die de
  // OAuth van de deur nog onthield, een deurtoken krijgen dat de app op /claude toch weigert — en het oude venster zien).
  if (delen.length === 1 && AGENTPADEN_NAAR_APP && AGENT_SLUGS.test(delen[0])) return null;
  return delen.length === 1 ? deurVan(delen[0]) : null;
}
const PKCE = /^[A-Za-z0-9_-]{43,128}$/;
const SOORT_TEKST = { web: ["вебсайт", "website"], loopback: ["програма на цьому комп'ютері (localhost)", "programma op deze computer (localhost)"], app: ["застосунок на комп'ютері", "app op de computer"] };

function handmatigePagina(v, rid, error) {
  let host = ""; try { const u = new URL(v.redirect); host = u.host || u.protocol; } catch { host = "?"; }
  const soort = SOORT_TEKST[v.soort] || ["?", "?"];
  const deur = v.door ? (DEUREN.get(v.door) || v.door) : "усі двері / alle deuren";
  return `<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Доступ до Mijn Ruimte / Toegang tot Mijn Ruimte</title>
<body style="font-family:system-ui,sans-serif;max-width:38rem;margin:2rem auto;padding:0 1rem;line-height:1.5">
<h1 style="font-size:1.4rem">Дозволити доступ «${esc(v.clientName)}» до дверей ${esc(deur)}?</h1>
<p>Після дозволу ви повернетеся на <b>${esc(host)}</b> (${esc(soort[0])}). Клієнт отримає лише читання поточного випуску і стан сайту (а якщо ви ввімкнули це на сервері — завантаження підписаного пакета). База даних і секрети сервера йому не віддаються. Доступ діє 1 годину й поновлюється до 14 днів; відкликати можна будь-коли.</p>
<p lang="nl">Na toestemming gaat u terug naar <b>${esc(host)}</b> (${esc(soort[1])}). De client krijgt alleen leestoegang tot de actieve release en de stand van de site. Toegang geldt 1 uur en wordt tot 14 dagen vernieuwd; intrekken kan altijd.</p>
<p><a href="${esc(`${ISSUER}/agents?consent=${rid}`)}" style="display:inline-block;padding:.6rem 1rem;border-radius:.5rem;background:#1f5fbf;color:#fff;text-decoration:none">Підтвердити на сайті в один клік / Op de site bevestigen</a></p>
${error ? `<p role="alert" style="color:#8a1f1f">${esc(error)}</p>` : ""}
<form method="post" action="/oauth/authorize">
<input type="hidden" name="verzoek" value="${esc(rid)}">
<label>Або токен дверей вручну / Of het deurtoken handmatig<br><input name="bridge_token" type="password" autocomplete="off" required style="width:100%;padding:.4rem"></label>
<p><button type="submit">Дозволити / Toestaan</button></p>
</form></body></html>`;
}
/** CSP voor de handmatige pagina: form-action moet ook het terugkeeradres toelaten (Chrome controleert de redirect na POST). */
function cspVoor(redirect) {
  let doel = "";
  try { const u = new URL(redirect); doel = u.protocol === "http:" || u.protocol === "https:" ? `${u.protocol}//${u.host}` : u.protocol; } catch { doel = ""; }
  return `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${doel}; frame-ancestors 'none'; base-uri 'none'`;
}

function issuePair(clientId, fam, duurId, door) {
  const access = b64url(randomBytes(32));
  const refresh = b64url(randomBytes(32));
  const now = Date.now();
  const family = fam || b64url(randomBytes(9));
  const d = duurMs(duurId);
  state.access[sha(access)] = { exp: now + d.access, clientId, fam: family, iat: now, ...(door ? { door } : {}) };
  state.refresh[sha(refresh)] = { exp: now + d.refresh, clientId, fam: family, iat: now, ...(door ? { door } : {}) };
  prune(); saveState();
  return { access_token: access, token_type: "Bearer", expires_in: Math.floor(d.access / 1000), refresh_token: refresh, scope: "read" };
}
function revokeFamily(fam) {
  if (!fam) return;
  state.families[fam] = Date.now();
  for (const bag of [state.access, state.refresh]) for (const [k, v] of Object.entries(bag)) if (v.fam === fam) delete bag[k];
  delete state.grants[fam];
  // familielijst begrenzen (oud genoeg = alle tokens ervan zijn toch verlopen; onbeperkte families staan hier niet meer in)
  for (const [k, at] of Object.entries(state.families)) if (Date.now() - at > 400 * 86_400_000) delete state.families[k];
  saveState();
}
/** Nieuwe eenmalige code voor een verzoek (na «Дозволити» op de site of na het deurtoken). */
function codeVoor(v, duurId, wie) {
  const code = b64url(randomBytes(32));
  codes.set(sha(code), { challenge: v.challenge, redirect: v.redirect, exp: Date.now() + LIMIETEN.CODE_TTL, clientId: v.clientId, door: v.door || "", duur: DUREN[duurId] ? duurId : "1u", wie: wie || null });
  const dest = new URL(v.redirect);
  dest.searchParams.set("code", code);
  if (v.state) dest.searchParams.set("state", v.state);
  dest.searchParams.set("iss", ISSUER); // RFC 9207
  return dest.toString();
}
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS", "access-control-expose-headers": "mcp-session-id, www-authenticate", "access-control-max-age": "600" };
function send(res, status, body, extra = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const type = typeof body === "string" && body.startsWith("<!") ? "text/html; charset=utf-8" : "application/json; charset=utf-8";
  const html = type.startsWith("text/html") ? { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", "x-frame-options": "DENY" } : CORS;
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
  if (!row || now - row.start > windowMs) { hits.set(k, { start: now, n: 1, windowMs }); return false; }
  row.n += 1; return row.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.start > v.windowMs) hits.delete(k); prune(); }, 60_000).unref();

/** Grants (één per toestemming) voor de site: klant, deur, duur, wie, data — nooit tokens. */
function verbindingen() {
  prune();
  const per = new Map();
  for (const bag of [state.access, state.refresh]) for (const t of Object.values(bag)) {
    if (!tokenValid(t)) continue;
    const r = per.get(t.fam) || { accessTot: 0, refreshTot: 0, clientId: t.clientId, door: t.door || "" };
    if (bag === state.access) r.accessTot = Math.max(r.accessTot, t.exp); else if (!t.used) r.refreshTot = Math.max(r.refreshTot, t.exp);
    per.set(t.fam, r);
  }
  return [...per.entries()].map(([fam, r]) => {
    const g = state.grants[fam] || {};
    return { id: fam, klant: g.clientName || state.clients[r.clientId]?.name || "MCP-client", deur: r.door ? (DEUREN.get(r.door) || r.door) : "", duur: g.duur || "1u", aangemaakt: g.createdAt || 0, laatst: g.lastUsedAt || 0, accessTot: r.accessTot, refreshTot: r.refreshTot, wie: g.wie || null, via: g.via || "token" };
  }).sort((a, b) => b.aangemaakt - a.aangemaakt).slice(0, 200);
}

const sessions = new Set();
export const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const pathName = url.pathname;
  try {
    // ---- intern: alleen de site zelf (loopback + sleutel), nooit via de tunnel
    if (pathName.startsWith("/intern/")) {
      if (!internOk(req)) { send(res, 404, { error: "NOT_FOUND" }); return; }
      if (pathName === "/intern/verzoek" && req.method === "GET") {
        const v = verzoeken.get(url.searchParams.get("rid") || "");
        if (!v || v.exp <= Date.now()) { send(res, 404, { error: "VERZOEK_VERLOPEN" }); return; }
        let host = ""; try { const u = new URL(v.redirect); host = u.host || u.protocol; } catch { host = ""; }
        send(res, 200, { clientName: v.clientName, redirectHost: host, redirectSoort: v.soort, deur: v.door ? (DEUREN.get(v.door) || v.door) : "", resource: v.door ? resourceVoor(DEUREN.get(v.door) || v.door) : "", expiresAt: v.exp, scope: "read" }); return;
      }
      if (pathName === "/intern/besluit" && req.method === "POST") {
        const d = JSON.parse(await readBody(req) || "{}");
        const rid = String(d.rid || "");
        const v = verzoeken.get(rid);
        if (!v || v.exp <= Date.now()) { send(res, 404, { error: "VERZOEK_VERLOPEN" }); return; }
        verzoeken.delete(rid);
        const wie = d.wie && typeof d.wie === "object" ? { id: String(d.wie.id || "").slice(0, 80), email: String(d.wie.email || "").slice(0, 200) } : null;
        if (d.approve !== true) {
          const dest = new URL(v.redirect); dest.searchParams.set("error", "access_denied"); if (v.state) dest.searchParams.set("state", v.state);
          process.stdout.write(`oauth geweigerd op de site client=${v.clientId} deur=${v.door || "-"}\n`);
          send(res, 200, { redirect: dest.toString() }); return;
        }
        const duurId = DUREN[d.duur] ? String(d.duur) : "1u";
        process.stdout.write(`oauth toegestaan op de site client=${v.clientId} deur=${v.door || "-"} duur=${duurId}\n`);
        send(res, 200, { redirect: codeVoor({ ...v, via: "site" }, duurId, wie ? { ...wie, via: "site" } : { via: "site" }) }); return;
      }
      if (pathName === "/intern/verbindingen" && req.method === "GET") { send(res, 200, { verbindingen: verbindingen() }); return; }
      if (pathName === "/intern/intrekken" && req.method === "POST") {
        const d = JSON.parse(await readBody(req) || "{}");
        const fam = String(d.id || "");
        const bestond = verbindingen().some((x) => x.id === fam);
        if (bestond) revokeFamily(fam);
        send(res, bestond ? 200 : 404, { ok: bestond }); return;
      }
      send(res, 404, { error: "NOT_FOUND" }); return;
    }

    // ---- agentadressen (/claude, /gpt, …) en de OAuth-ontdekking van de app: niet van deze deur, doorgeven aan de hoofdapp
    const pad = appPad(pathName);
    if (pad) { naarApp(req, res, pad); return; }

    if (req.method === "OPTIONS") { res.writeHead(204, { ...CORS, "cache-control": "no-store" }); res.end(); return; }

    // ---- metadata (RFC 8414 / RFC 9728), ook met de deur in het pad (beide varianten die klanten proberen)
    if (req.method === "GET" && (pathName === "/.well-known/oauth-authorization-server" || pathName === "/.well-known/openid-configuration")) { send(res, 200, metadata()); return; }
    let m = /^\/\.well-known\/(oauth-authorization-server|openid-configuration)\/([^/]+)\/?$/.exec(pathName) || /^\/([^/]+)\/\.well-known\/(oauth-authorization-server|openid-configuration)\/?$/.exec(pathName);
    if (req.method === "GET" && m) { send(res, deurVan(m[2]) || deurVan(m[1]) ? 200 : 404, deurVan(m[2]) || deurVan(m[1]) ? metadata() : { error: "NOT_FOUND" }); return; }
    if (req.method === "GET" && pathName === "/.well-known/oauth-protected-resource") { send(res, 200, prmVoor("Grok")); return; }
    m = /^\/\.well-known\/oauth-protected-resource\/([^/]+)\/?$/.exec(pathName) || /^\/([^/]+)\/\.well-known\/oauth-protected-resource\/?$/.exec(pathName);
    if (req.method === "GET" && m) { if (!deurVan(m[1])) { send(res, 404, { error: "NOT_FOUND" }); return; } send(res, 200, prmVoor(m[1])); return; }

    if (pathName === "/oauth/register" && req.method === "POST") {
      if (limited(req, "register", 10, 3600_000)) { send(res, 429, { error: "slow_down" }); return; }
      const raw = await readBody(req);
      let body; try { body = raw.trim().startsWith("{") ? JSON.parse(raw || "{}") : formBody(raw); } catch { send(res, 400, { error: "invalid_client_metadata" }); return; }
      const asked = [].concat(body.redirect_uris || []);
      const redirects = asked.filter(redirectOk).slice(0, 5);
      if (!redirects.length || redirects.length !== asked.length) { send(res, 400, { error: "invalid_redirect_uri", error_description: "Alleen bekende AI-klanten, loopback (localhost) en app-schema's (cursor://, vscode://); meer via oauthRedirects in mcp-rechten.json" }); return; }
      if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== "none") { send(res, 400, { error: "invalid_client_metadata", error_description: "token_endpoint_auth_method none" }); return; }
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
      const name = String(body.client_name || "MCP-client").replace(/[^\p{L}\p{N} ()._-]/gu, "").slice(0, 60) || "MCP-client";
      state.clients[clientId] = { redirects, createdAt: Date.now(), name };
      saveState();
      send(res, 201, { client_id: clientId, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: name, redirect_uris: redirects, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "read" });
      return;
    }
    const clientRedirectOk = (clientId, redirect) => { const c = state.clients[clientId]; return Boolean(c && !c.legacy && redirectPast(c.redirects, redirect) && redirectOk(redirect)); };
    if (pathName === "/oauth/authorize" && req.method === "GET") {
      const q = url.searchParams;
      // terug naar een bestaand verzoek (bv. «токен дверей вручну» vanaf de site)
      const bestaand = verzoeken.get(q.get("verzoek") || "");
      if (bestaand && bestaand.exp > Date.now()) { send(res, 200, handmatigePagina(bestaand, q.get("verzoek"), ""), { "content-security-policy": cspVoor(bestaand.redirect) }); return; }
      if (q.get("verzoek")) { send(res, 400, "<!doctype html><title>Помилка / Fout</title><p>Запит застарів. Почніть підключення в клієнті ШІ знову. / Verzoek verlopen; begin opnieuw in de AI-client.</p>"); return; }
      const clientId = q.get("client_id") || ""; const redirect = q.get("redirect_uri") || "";
      // Bij een onbekende client of ongeldige redirect nooit redirecten (geen open redirect).
      if (!clientRedirectOk(clientId, redirect)) { send(res, 400, "<!doctype html><title>Помилка / Fout</title><p>Неповний або чужий запит входу. / Onvolledig of onbekend aanmeldverzoek.</p>"); return; }
      const terug = (error) => { const d = new URL(redirect); d.searchParams.set("error", error); if (q.get("state")) d.searchParams.set("state", q.get("state")); res.writeHead(302, { location: d.toString(), "cache-control": "no-store" }); res.end(); };
      if (q.get("response_type") !== "code") { terug("unsupported_response_type"); return; }
      if (q.get("code_challenge_method") !== "S256" || !PKCE.test(q.get("code_challenge") || "")) { terug("invalid_request"); return; }
      const door = deurUitResource(q.get("resource") || "");
      if (door === null) { terug("invalid_target"); return; }
      if (verzoeken.size >= 50) { prune(); if (verzoeken.size >= 50) { send(res, 429, "<!doctype html><p>Забагато відкритих запитів. / Te veel openstaande verzoeken.</p>"); return; } }
      const rid = `mrd_${b64url(randomBytes(24))}`;
      const c = state.clients[clientId];
      const v = { clientId, clientName: c.name || "MCP-client", redirect, soort: redirectSoort(redirect, extraRedirects()), challenge: q.get("code_challenge"), state: (q.get("state") || "").slice(0, 512), door, exp: Date.now() + VERZOEK_TTL };
      verzoeken.set(rid, v);
      if (q.get("methode") === "token") { send(res, 200, handmatigePagina(v, rid, ""), { "content-security-policy": cspVoor(redirect) }); return; }
      // Eén klik: het venster «Дозволити» van de site (bestaande aanmelding van de eigenaar). De deur is de TECHNISCHE ruimte:
      // de pagina «Технічні підключення» (technisch profiel), nooit de accountpagina Agenten (shared/ai-ruimte.ts).
      res.writeHead(302, { location: `${ISSUER}/agents?consent=${rid}`, "cache-control": "no-store" }); res.end(); return;
    }
    if (pathName === "/oauth/authorize" && req.method === "POST") {
      if (limited(req, "authorize", 10, 15 * 60_000)) { send(res, 429, "<!doctype html><p>Забагато спроб. / Te veel pogingen.</p>"); return; }
      const q = new URLSearchParams(await readBody(req));
      const rid = q.get("verzoek") || "";
      let v = rid ? verzoeken.get(rid) : null;
      if (rid && (!v || v.exp <= Date.now())) { send(res, 400, "<!doctype html><p>Запит застарів. / Verzoek verlopen.</p>"); return; }
      if (!v) {
        // oude vorm: alle parameters in het formulier
        const clientId = q.get("client_id") || ""; const back = q.get("redirect_uri") || "";
        if (!clientRedirectOk(clientId, back) || q.get("code_challenge_method") !== "S256" || !PKCE.test(q.get("code_challenge") || "")) { send(res, 400, { error: "invalid_request" }); return; }
        const door = deurUitResource(q.get("resource") || "");
        if (door === null) { send(res, 400, { error: "invalid_target" }); return; }
        v = { clientId, clientName: state.clients[clientId].name || "MCP-client", redirect: back, soort: redirectSoort(back, extraRedirects()), challenge: q.get("code_challenge"), state: q.get("state") || "", door, exp: Date.now() + VERZOEK_TTL };
      }
      if (!(await fileTokenOk(q.get("bridge_token") || ""))) {
        const nieuw = rid || `mrd_${b64url(randomBytes(24))}`;
        if (!rid) verzoeken.set(nieuw, v);
        send(res, 401, handmatigePagina(v, nieuw, "Токен не підійшов. / Token klopt niet."), { "content-security-policy": cspVoor(v.redirect) }); return;
      }
      if (rid) verzoeken.delete(rid);
      process.stdout.write(`oauth toegestaan met deurtoken client=${v.clientId} deur=${v.door || "-"}\n`);
      res.writeHead(302, { location: codeVoor(v, "1u", { via: "deurtoken" }), "cache-control": "no-store" }); res.end(); return;
    }
    if (pathName === "/oauth/token" && req.method === "POST") {
      if (limited(req, "token", 60, 15 * 60_000)) { send(res, 429, { error: "slow_down" }); return; }
      const raw = await readBody(req);
      let body; try { body = raw.trim().startsWith("{") ? Object.fromEntries(Object.entries(JSON.parse(raw)).map(([k, v]) => [k, String(v)])) : formBody(raw); } catch { send(res, 400, { error: "invalid_request" }); return; }
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
        send(res, 200, issuePair(id, row.fam, state.grants[row.fam]?.duur || "1u", row.door || "")); return;
      }
      if (body.grant_type !== "authorization_code") { send(res, 400, { error: "unsupported_grant_type" }); return; }
      const ckey = sha(body.code || "");
      const row = codes.get(ckey);
      codes.delete(ckey);
      if (!row || row.exp <= Date.now() || row.redirect !== body.redirect_uri || row.clientId !== id || !body.code_verifier || !sameText(s256(String(body.code_verifier)), row.challenge)) {
        send(res, 400, { error: "invalid_grant" }); return;
      }
      const fam = b64url(randomBytes(9));
      state.grants[fam] = { clientId: id, clientName: state.clients[id]?.name || "MCP-client", door: row.door || "", duur: row.duur, createdAt: Date.now(), lastUsedAt: 0, wie: row.wie && (row.wie.id || row.wie.email) ? { id: row.wie.id || "", email: row.wie.email || "" } : null, via: row.wie?.via || "deurtoken" };
      send(res, 200, issuePair(id, fam, row.duur, row.door || "")); return;
    }
    if (pathName === "/oauth/revoke" && req.method === "POST") {
      const body = formBody(await readBody(req));
      const key = sha(body.token || "");
      const row = state.access[key] || state.refresh[key];
      if (row) revokeFamily(row.fam);
      send(res, 200, {}); return;
    }
    if (req.method === "GET" && pathName === "/health") { send(res, 200, { ok: true, service: "mijn-ruimte-mcp", version: 3, siteToestemming: Boolean(internSleutel) }); return; }

    // ---- de deuren zelf (Streamable HTTP, JSON-antwoorden)
    const segment = pathName.replace(/^\/+|\/+$/g, "");
    const door = segment.includes("/") ? null : deurVan(segment);
    if (!door) { send(res, 404, { error: "NOT_FOUND" }); return; }
    const auth = await resolveAuth(req.headers.authorization, door);
    if (!auth) {
      const metToken = Boolean(bearer(req.headers.authorization));
      send(res, 401, { error: metToken ? "invalid_token" : "UNAUTHORIZED" }, { "www-authenticate": `Bearer realm="mijn-ruimte"${metToken ? ", error=\"invalid_token\"" : ""}, resource_metadata="${ISSUER}/.well-known/oauth-protected-resource/${segment}", scope="read"` }); return;
    }
    if (req.method === "DELETE") { res.writeHead(204, CORS); res.end(); return; }
    if (req.method !== "POST") { send(res, 405, { error: "POST_ONLY" }, { allow: "POST, DELETE" }); return; }
    let msg;
    try { msg = JSON.parse(await readBody(req) || "{}"); }
    catch (err) {
      if (err instanceof Error && err.message === "TOO_LARGE") { send(res, 413, { error: "TOO_LARGE" }); return; }
      send(res, 400, rpcError(null, -32700, "PARSE_ERROR")); return;
    }
    const extra = {};
    // Sessies dragen hier geen toestand: een onbekende sessie-id (bv. na een herstart) gewoon opnieuw opnemen in plaats van 404,
    // zodat klanten die parallel initialiseren of na een herstart doorgaan niet afbreken.
    const sid = String(req.headers["mcp-session-id"] || "");
    const berichten = Array.isArray(msg) ? msg.slice(0, 50) : [msg];
    if (berichten.some((b) => b && b.method === "initialize")) { const sidNew = randomBytes(16).toString("hex"); sessions.add(sidNew); extra["mcp-session-id"] = sidNew; }
    else if (/^[a-f0-9]{32}$/.test(sid)) sessions.add(sid);
    while (sessions.size > 1000) sessions.delete(sessions.values().next().value);
    const uit = [];
    for (const b of berichten) {
      if (!b || typeof b !== "object") { uit.push(rpcError(null, -32600, "INVALID_REQUEST")); continue; }
      const r = await handleRpc(b);
      if (b.method === "tools/call") process.stdout.write(`tools/call ${String(b.params?.name || "").slice(0, 60)} deur=${door} client=${auth.clientId} ${r?.result?.isError ? "fout" : "ok"}\n`);
      if (r) uit.push(r);
    }
    if (!uit.length) { res.writeHead(202, { ...CORS, ...extra }); res.end(); return; }
    send(res, 200, Array.isArray(msg) ? uit : uit[0], extra);
  } catch (err) {
    if (!res.headersSent) send(res, err instanceof Error && err.message === "TOO_LARGE" ? 413 : 500, { error: "SERVER_ERROR" });
  }
});
// 502 via de tunnel voorkomen: cloudflared houdt verbindingen 90 s open (originRequest.keepAliveTimeout). Sluit Node een rustige
// verbinding eerder (standaard 5 s), dan stuurt cloudflared soms een verzoek over een net gesloten verbinding → 502. Dus langer.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;
server.requestTimeout = 300_000;
server.on("clientError", (err, socket) => { if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nconnection: close\r\n\r\n"); else socket.destroy(); });
loadState();
internSleutelMaken();
server.listen(PORT, HOST, () => { process.stdout.write(`mijn-ruimte-mcp ${HOST}:${PORT}\n`); });
