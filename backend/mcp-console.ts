// MCP-console van mcp.tarasevych.com (bord, agenttokens, verkeer, gezondheid, archief, back-ups).
// Audit C2 (veilig-agenten-0.4):
//  - elke route vraagt een goedgekeurd account (status 'approved'); serverbrede zaken (gezondheid, release, archief, back-ups,
//    serverbestanden lezen) alleen de eigenaar (rol 'owner');
//  - bord, notities, agenttokens en verkeerslog per gebruiker in de database (0019, strikte RLS) in plaats van één gedeeld bestand;
//  - tokens alleen als sha256, met vervaldatum (30 dagen); uitgeven vraagt step-up;
//  - rechten (vlaggen) zijn alleen-lezen: ze staan in /etc/mijn-ruimte/mcp-rechten.json (root), de site kan ze niet wijzigen;
//  - geen deur-aanroepen, geen bridge-token, geen klad (staging), geen install/backup-hulpmiddelen meer: uitrollen gaat alleen
//    via een ondertekend pakket (deploy/RUNBOOK-VEILIGE-UITROL.md);
//  - het archief is één age-versleuteld bestand in een root-map; downloaden alleen door de eigenaar na step-up via een eenmalige
//    willekeurige downloadId (5 minuten).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { error, fileDownload, json } from "../server/platform";
import { rateLimit } from "../server/platform/beveiliging";
import { auditToevoegen } from "../server/platform/audit";
import { getPool } from "../server/platform/pg";
import type { RouterMiddleware } from "../server/platform/router";
import { alsGebruiker } from "./ai-grants";
import { huidigeNamens, metNamens } from "./mcp-namens";
import { ruimteUitVerzoek } from "./ai-ruimte-poort";
import { leesStaat } from "./ai-site-schakelaars";
import { connectGeweigerd, klantUit } from "../shared/ai-agent-bord";
import { geefStandaard, isOntbrekendeTabel, magTool, verwijderToegang } from "./ai-toegang";
import { RUIMTE_GESCHEIDEN, ruimteOf, toolInRuimte, type AiRuimte } from "../shared/ai-ruimte";
import { scopeVoorTool } from "../shared/ai-toegang";
import { beslissing, weigerTekst } from "./ai-beleid";
import { gedelegeerdeSessie } from "./site-dispatch";
import { OPDRACHT_STANDAARD, OPDRACHT_WERKWOORDEN, isWerkwoord, leesOpdrachtResultaat, voerOpdrachtUit, type Werkwoord } from "./server-beheer";
import { UITROL_TOOL_NAMEN, UitrolFout, isGoedkeurPoging, voerUitrolToolUit, type Onderwerp } from "./uitrol-goedkeuring";

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type SessionFail = { errorCode: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | SessionFail>;
type Ctx = { event: Record<string, unknown>; body: unknown };
type Resp = ReturnType<typeof json>;
export type McpConsoleDeps = { stepUp?: (ctx: unknown, auth: SessionOk) => Promise<Resp | null> };

const BLOCK = /(^|\/)(\.env|geheimen\.env|.*\.(age|pem|key)|id_rsa|id_ed25519|credentials.*\.json|.*\.token|.*\.secret)$/i;
const STATUSES = new Set(["backlog", "doing", "blocked", "done"]);
const HOSTS = [
  ["hub", "https://hub.tarasevych.com/overview"],
  ["id", "https://id.tarasevych.com/personalization"],
  ["admin", "https://admin.tarasevych.com/access"],
  ["api", "https://api.tarasevych.com/access"],
  ["dashboard", "https://dashboard.tarasevych.com/"],
  ["ai", "https://ai.tarasevych.com/"],
  ["mail", "https://mail.tarasevych.com/inbox"],
  ["cloud", "https://cloud.tarasevych.com/calendar"],
  ["github", "https://github.tarasevych.com/"],
  ["huis", "https://huis.tarasevych.com/"],
  ["mcp", "https://mcp.tarasevych.com/overview"],
] as const;
const SERVICE_ROLE: Record<string, string> = {
  hub: "Home of the personal space.",
  id: "Who may sign in.",
  admin: "Access and the signed AI policy. The owner changes those on the website, not through this connector.",
  api: "Machine API of the estate.",
  dashboard: "Usage and traffic.",
  ai: "AI workspace.",
  mail: "Mailbox.",
  cloud: "Calendar and files.",
  github: "GitHub view of the estate.",
  huis: "The house itself.",
  mcp: "This connector and its console.",
};

export const MCP_CONSOLE_LIMITS = Object.freeze({ tokenDays: 30, downloadIdMinutes: 5, logPerUser: 200, tokensPerUser: 20 });

// ---------------------------------------------------------------- rechten: alleen lezen uit /etc
const PERMISSIONS = [
  { id: "read", group: "agent", uk: "Читати сайт і код", nl: "Site en code lezen", detailUk: "Агент бачить випуск, здоров'я сайту і список релізів. Змінюється лише у файлі на сервері.", detailNl: "De agent ziet de release, de gezondheid en de lijst. Alleen te wijzigen in het bestand op de server.", def: true },
  { id: "board", group: "agent", uk: "Писати дошку", nl: "Bord schrijven", detailUk: "Ваші задачі й нотатки (кожен користувач має свою дошку).", detailNl: "Uw taken en notities (elke gebruiker heeft een eigen bord).", def: true },
  { id: "tokens", group: "agent", uk: "Випускати токени агентів", nl: "Agenttokens uitgeven", detailUk: "Токен показується один раз і діє 30 днів. Потрібне повторне підтвердження входу.", detailNl: "Het token verschijnt één keer en geldt 30 dagen. Vraagt een nieuwe bevestiging van de aanmelding.", def: true },
  { id: "uitrol", group: "release", uk: "Викладати підписаний випуск", nl: "Ondertekende release plaatsen", detailUk: "Лише підписаний пакет через двері; ввімкнення — тільки у файлі /etc/mijn-ruimte/mcp-rechten.json на сервері.", detailNl: "Alleen een ondertekend pakket via de deur; aanzetten alleen in /etc/mijn-ruimte/mcp-rechten.json op de server.", def: false },
  { id: "gitops", group: "release", uk: "GitOps: підписані теги з GitHub", nl: "GitOps: ondertekende tags uit GitHub", detailUk: "Сервер сам забирає теги uitrol-… і встановлює лише підписані вашим ключем.", detailNl: "De server haalt zelf uitrol-…-tags op en installeert alleen tags met uw handtekening.", def: false },
  { id: "opdracht.status", group: "server", uk: "Стан сервера", nl: "Serverstatus", detailUk: "Лише читання.", detailNl: "Alleen lezen.", def: OPDRACHT_STANDAARD.status },
  { id: "opdracht.releases", group: "server", uk: "Список випусків", nl: "Lijst van releases", detailUk: "Лише читання.", detailNl: "Alleen lezen.", def: OPDRACHT_STANDAARD.releases },
  { id: "opdracht.backup", group: "server", uk: "Резервна копія на запит", nl: "Back-up op verzoek", detailUk: "Запускає звичайну резервну копію.", detailNl: "Start de gewone back-up.", def: OPDRACHT_STANDAARD.backup },
  { id: "opdracht.uitrol-nu", group: "server", uk: "Перевірити випуски зараз", nl: "Nu op releases controleren", detailUk: "Запускає GitOps і перевірку пакета; встановлюється лише підписане. Потрібне підтвердження входу.", detailNl: "Start GitOps en de pakketcontrole; alleen ondertekende code wordt geïnstalleerd. Vraagt een bevestiging van de aanmelding.", def: OPDRACHT_STANDAARD["uitrol-nu"] },
  { id: "opdracht.terugdraaien", group: "server", uk: "Відкат до попереднього випуску", nl: "Terug naar de vorige release", detailUk: "Не частіше ніж раз на 10 хв, з підтвердженням входу.", detailNl: "Hooguit één keer per 10 minuten, met bevestiging van de aanmelding.", def: OPDRACHT_STANDAARD.terugdraaien },
] as const;
type PermissionId = (typeof PERMISSIONS)[number]["id"];
const permPath = () => process.env.MCP_RECHTEN_PAD || "/etc/mijn-ruimte/mcp-rechten.json";
async function readPerms(): Promise<Record<PermissionId, boolean>> {
  const base = Object.fromEntries(PERMISSIONS.map((p) => [p.id, p.def])) as Record<PermissionId, boolean>;
  try {
    const data = JSON.parse(await readFile(permPath(), "utf8")) as Record<string, unknown>;
    if (typeof data.read === "boolean") base.read = data.read;
    if (typeof data.uitrol === "boolean") base.uitrol = data.uitrol;
    if (typeof data.gitops === "boolean") base.gitops = data.gitops;
    const op = data.opdracht && typeof data.opdracht === "object" ? (data.opdracht as Record<string, unknown>) : {};
    for (const w of OPDRACHT_WERKWOORDEN) if (typeof op[w] === "boolean") base[`opdracht.${w}`] = op[w] as boolean;
  } catch { /* standaard */ }
  return base;
}

// ---------------------------------------------------------------- hulp
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const bodyOf = (body: unknown) => (body || {}) as Record<string, unknown>;
const text = (data: unknown) => (typeof data === "string" ? data : JSON.stringify(data, null, 2));
function denied(name: string) {
  const n = name.replaceAll("\\", "/");
  return n.split("/").includes("node_modules") || n.split("/").includes(".git") || BLOCK.test(n);
}
const releaseRoot = () => realpath(process.env.MCP_ROOT || "/srv/mijn-ruimte/current");
async function inside(rel: string) {
  const root = await releaseRoot();
  const target = await realpath(path.resolve(root, rel || "."));
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("PATH_OUTSIDE");
  if (denied(path.relative(root, target))) throw new Error("PATH_SECRET");
  return { root, target };
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
const isOwner = (u: SessionOk["user"]) => u.role === "owner";

// ---------------------------------------------------------------- bord, tokens, log per gebruiker (0019)
async function logCall(userId: string, row: { method: string; detail: string; transport: string; agent: string; ok: boolean; ms: number }) {
  await alsGebruiker(userId, async (q) => {
    await q("INSERT INTO app.mcp_console_log (user_id, method, detail, transport, agent, ok, ms) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [userId, row.method.slice(0, 60), row.detail.slice(0, 300), row.transport, row.agent.slice(0, 120), row.ok, Math.max(0, Math.round(row.ms))]);
    await q(`DELETE FROM app.mcp_console_log WHERE user_id = $1 AND id NOT IN (SELECT id FROM app.mcp_console_log WHERE user_id = $1 ORDER BY at DESC LIMIT ${MCP_CONSOLE_LIMITS.logPerUser})`, [userId]);
  }).catch(() => undefined);
}
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : "");
const taskOut = (r: any) => ({ id: r.id, title: r.title, body: r.body, status: r.status, tags: r.tags || [], service: "mcp", author: r.author, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });
const noteOut = (r: any) => ({ id: r.id, title: r.title, body: r.body, tags: r.tags || [], author: r.author, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });
const tokenOut = (r: any) => ({ id: r.id, name: r.name, prefix: r.prefix, scopes: r.scopes, createdAt: iso(r.created_at), expiresAt: iso(r.expires_at), revokedAt: iso(r.revoked_at), calls: Number(r.calls || 0), lastSeenAt: iso(r.last_seen_at), ruimte: ruimteOf(r.ruimte) });

/** Приватний токен з дошки ШІ. Завжди ruimte=prive. Секрет повертається один раз; списки його не містять. */
export async function issuePriveToken(userId: string, name: string) {
  const raw = `tvh_${randomBytes(24).toString("base64url")}`;
  const row = await alsGebruiker(userId, async (q) => {
    const active = Number((await q("SELECT count(*)::int AS n FROM app.mcp_console_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()", [userId])).rows[0].n);
    if (active >= MCP_CONSOLE_LIMITS.tokensPerUser) return null;
    return (await q(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, expires_at, ruimte) VALUES ($1, $2, $3, $4, now() + interval '${MCP_CONSOLE_LIMITS.tokenDays} days', 'prive') RETURNING *`,
      [userId, name.slice(0, 80), raw.slice(0, 12), sha(raw)])).rows[0];
  });
  if (!row) throw new Error("TOKEN_LIMIT_REACHED");
  await geefStandaard(userId, { soort: "agenttoken", id: String(row.id) }, "prive").catch(() => undefined);
  return { ...tokenOut(row), token: raw };
}

/** Agenttoken van deze gebruiker (voor de toegangs-tab «Доступ ШІ»): id + naam, nooit het geheim. */
export async function agentTokenVanGebruiker(userId: string, id: string): Promise<{ id: string; name: string } | null> {
  const { rows } = await getPool("systeem").query(
    `SELECT id::text AS id, name FROM app.mcp_console_tokens
      WHERE id::text = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`, [id, userId]);
  return rows[0] ?? null;
}

async function board(userId: string) {
  return alsGebruiker(userId, async (q) => {
    const { rows } = await q("SELECT * FROM app.mcp_console_items WHERE user_id = $1 ORDER BY created_at DESC LIMIT 400", [userId]);
    return { tasks: rows.filter((r) => r.kind === "task").map(taskOut), notes: rows.filter((r) => r.kind === "note").map(noteOut) };
  });
}
const TAG = /^[A-Za-z0-9:_-]{1,32}$/;
function schoneTags(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 8) return null;
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string" || !TAG.test(t)) return null;
    const laag = t.toLowerCase();
    if (!out.includes(laag)) out.push(laag);
  }
  return out;
}
async function addItem(userId: string, kind: "task" | "note", title: string, body: string, status: string | null, author: string, tags: string[] = []) {
  return alsGebruiker(userId, async (q) => {
    const { rows } = await q("INSERT INTO app.mcp_console_items (user_id, kind, title, body, status, author, tags) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [userId, kind, title.slice(0, 160), body.slice(0, 4000), kind === "task" ? (status && STATUSES.has(status) ? status : "backlog") : null, author.slice(0, 80), tags]);
    return kind === "task" ? { task: taskOut(rows[0]) } : { note: noteOut(rows[0]) };
  });
}
async function editItem(userId: string, id: string, patch: { title?: string; body?: string; tags?: string[] }) {
  return alsGebruiker(userId, async (q) => {
    const cur = (await q("SELECT * FROM app.mcp_console_items WHERE id::text = $2 AND user_id = $1", [userId, id])).rows[0];
    if (!cur) return null;
    const title = patch.title !== undefined ? String(patch.title).slice(0, 160) : cur.title;
    const body = patch.body !== undefined ? String(patch.body).slice(0, 4000) : cur.body;
    const tags = patch.tags !== undefined ? patch.tags : (cur.tags || []);
    const { rows } = await q("UPDATE app.mcp_console_items SET title = $3, body = $4, tags = $5, updated_at = now() WHERE id::text = $2 AND user_id = $1 RETURNING *", [userId, id, title, body, tags]);
    return rows[0] ? (rows[0].kind === "task" ? { task: taskOut(rows[0]) } : { note: noteOut(rows[0]) }) : null;
  });
}
async function deleteItem(userId: string, id: string) {
  return alsGebruiker(userId, async (q) => {
    const row = (await q("DELETE FROM app.mcp_console_items WHERE id::text = $2 AND user_id = $1 RETURNING id, kind", [userId, id])).rows[0];
    return row ? { deleted: true, id: String(row.id), kind: row.kind } : null;
  });
}
async function searchBoard(userId: string, query: string, tag: string, kind: string) {
  const b = await board(userId);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const past = (title: string, body: string, tags: string[]) => {
    if (tag && !(tags || []).some((t) => String(t).toLowerCase() === tag.toLowerCase())) return false;
    if (!words.length) return true;
    const blob = `${title}\n${body}\n${(tags || []).join(" ")}`.toLowerCase();
    return words.every((w) => blob.includes(w));
  };
  return {
    tasks: kind === "note" ? [] : b.tasks.filter((t) => past(t.title, t.body, t.tags || [])).slice(0, 40),
    notes: kind === "task" ? [] : b.notes.filter((n) => past(n.title, n.body, n.tags || [])).slice(0, 40),
  };
}

/** Eenmalig: het oude gedeelde bestand mcp-console.json overnemen voor de eigenaar (tokens als hash, +30 dagen), daarna hernoemen. */
const legacyPath = () => path.join(process.env.UPLOADS_DIR || "/srv/data/uploads", "mcp-console.json");
export async function importLegacyConsole(ownerId: string): Promise<{ tasks: number; notes: number; tokens: number } | null> {
  let data: any;
  try { data = JSON.parse(await readFile(legacyPath(), "utf8")); } catch { return null; }
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const notes = Array.isArray(data?.notes) ? data.notes : [];
  const tokens = Array.isArray(data?.tokens) ? data.tokens : [];
  await alsGebruiker(ownerId, async (q) => {
    for (const t of tasks) await q("INSERT INTO app.mcp_console_items (user_id, kind, title, body, status, author, created_at, updated_at) VALUES ($1, 'task', $2, $3, $4, $5, COALESCE($6::timestamptz, now()), COALESCE($7::timestamptz, now()))",
      [ownerId, String(t.title || "").slice(0, 160) || "—", String(t.body || "").slice(0, 4000), STATUSES.has(t.status) ? t.status : "backlog", String(t.author || "operator").slice(0, 80), t.createdAt || null, t.updatedAt || null]);
    for (const n of notes) await q("INSERT INTO app.mcp_console_items (user_id, kind, title, body, author, created_at, updated_at) VALUES ($1, 'note', $2, $3, $4, COALESCE($5::timestamptz, now()), COALESCE($6::timestamptz, now()))",
      [ownerId, String(n.title || "").slice(0, 160) || "—", String(n.body || "").slice(0, 4000), String(n.author || "operator").slice(0, 80), n.createdAt || null, n.updatedAt || null]);
    for (const k of tokens) {
      if (typeof k.hash !== "string" || !/^[0-9a-f]{64}$/.test(k.hash)) continue;
      await q(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, created_at, expires_at, revoked_at, calls)
               VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()), now() + interval '${MCP_CONSOLE_LIMITS.tokenDays} days', $6::timestamptz, $7) ON CONFLICT (token_hash) DO NOTHING`,
        [ownerId, String(k.name || "Agent").slice(0, 80), String(k.prefix || "").slice(0, 16), k.hash, k.createdAt || null, k.revokedAt || null, Number(k.calls || 0)]);
    }
  });
  await rename(legacyPath(), `${legacyPath()}.geimporteerd-${Date.now()}`);
  await auditToevoegen({ ownerId, actorId: ownerId, action: "mcp_console_legacy_imported", type: "ai", result: "ok", details: { tasks: tasks.length, notes: notes.length, tokens: tokens.length } }).catch(() => undefined);
  return { tasks: tasks.length, notes: notes.length, tokens: tokens.length };
}

// ---------------------------------------------------------------- hulpmiddelen (console en agenttokens)
const OWNER_TOOLS = new Set(["list_services", "hub_overview", "health_check", "get_service", "site_health", "release_info", "list_dir", "read_file", "host_status", "list_releases", "permission_flags", "get_architecture", "get_roadmap", "agent_handshake", "admin_list_access", "dashboard_usage", "server_status", "server_releases"]);
/** Schrijvende serveropdrachten: alleen via de site (eigenaar + step-up), nooit via een agenttoken of de console-aanroep. */
const SITE_ONLY_TOOLS = new Set(["server_backup", "server_uitrol_nu", "server_terugdraaien"]);
const BOARD_TOOLS = new Set(["list_tasks", "list_notes", "estate_search", "upsert_task", "upsert_note"]);
const REMOVED_TOOLS = new Set(["write_staging", "list_staging", "read_staging", "install_release", "update_door", "start_backup"]);

async function runTool(userId: string, owner: boolean, name: string, args: Record<string, unknown>, author: string, agentTokenId?: string, ruimte: AiRuimte = 'prive') {
  // Gedetailleerde toegang per agenttoken (0043, shared/ai-toegang.ts): default-deny per scope, vóór uitvoering.
  // Zonder tokenId belt de mens zelf via de console — dan geldt dit niet (wel het AI-beleid en de vlaggen).
  // Alleen instrumenten uit de catalogus vallen onder scopes; de rest houdt zijn eigen poorten
  // (ruimte, eigenaar, step-up) met hun eigen foutcodes (bv. SPACE_SEPARATED, OWNER_ONLY).
  if (agentTokenId && scopeVoorTool(name) !== undefined) {
    try {
      const toegang = await magTool({ soort: 'agenttoken', id: agentTokenId }, name, ruimteOf(ruimte));
      if (!toegang.ok) throw new Error(`TOEGANG_GESCHEIDEN:${toegang.scope ?? 'onbekend'}`);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('TOEGANG_GESCHEIDEN')) throw err;
      // Tabel 0043 ontbreekt (migratie nog niet gedraaid): oud gedrag; elke andere DB-fout = weigeren.
      if (!isOntbrekendeTabel(err)) throw new Error(`TOEGANG_GESCHEIDEN:${scopeVoorTool(name) ?? 'onbekend'}`);
    }
  }
  // Updates voorbereiden (passkey-goedkeuring, RUNBOOK-VEILIGE-UITROL.md §13): alleen met een grant uit "Кому дозволено"; goedkeuren
  // kan een agent of de console nooit (alleen de eigenaar op de site met zijn passkey).
  if (isGoedkeurPoging(name)) throw new Error("ALLEEN_EIGENAAR_MET_PASSKEY: goedkeuren kan alleen de eigenaar op de site met zijn passkey");
  if (UITROL_TOOL_NAMEN.has(name)) {
    const onderwerpen: Onderwerp[] = [...(agentTokenId ? [{ soort: "agenttoken" as const, id: agentTokenId, accountId: userId }] : []), { soort: "account", id: userId, accountId: userId }];
    try { return await voerUitrolToolUit(onderwerpen, name, args); }
    catch (err) { throw new Error(err instanceof UitrolFout ? err.code : "UITROL_FOUT"); }
  }
  if (REMOVED_TOOLS.has(name)) throw new Error("TOOL_REMOVED: uitrollen alleen met een ondertekend pakket (RUNBOOK-VEILIGE-UITROL.md)");
  if (SITE_ONLY_TOOLS.has(name)) throw new Error("STEP_UP_REQUIRED: alleen op de site (eigenaar + bevestiging van de aanmelding)");
  const flags = await readPerms();
  if (BOARD_TOOLS.has(name)) {
    if (name === "upsert_task" || name === "upsert_note") {
      const kind = name === "upsert_note" ? "note" : "task";
      return addItem(userId, kind, String(args.title || (kind === "note" ? "Нотатка" : "Задача")), String(args.body || ""), String(args.status || ""), author);
    }
    const b = await board(userId);
    if (name === "list_notes") return { notes: b.notes };
    const q = String(args.q || "").toLowerCase();
    return { tasks: q ? b.tasks.filter((t) => `${t.title} ${t.body}`.toLowerCase().includes(q)) : b.tasks };
  }
  if (!OWNER_TOOLS.has(name)) throw new Error("TOOL_NOT_ON_DOOR");
  if (!owner) throw new Error("OWNER_ONLY");
  if (!flags.read) throw new Error("PERMISSION_OFF:read");
  if (name === "list_services" || name === "hub_overview") return { services: HOSTS.map(([id, url]) => ({ id, url })) };
  if (name === "health_check") return { probes: await Promise.all(HOSTS.map(([id, url]) => probeOne(id, url))) };
  if (name === "get_architecture") return { layers: ["huis", "id/admin", "api", "mcp", "surfaces"] };
  if (name === "get_roadmap") return { next: ["agent identities on id", "grants on admin", "json on api"] };
  if (name === "agent_handshake") return { door: "https://mcp.tarasevych.com/Grok", next: ["health_check", "list_services", "release_info"] };
  if (name === "get_service") {
    const hit = HOSTS.find(([id]) => id === String(args.id || ""));
    if (!hit) throw new Error("UNKNOWN_SERVICE");
    return { id: hit[0], url: hit[1] };
  }
  if (name === "admin_list_access" || name === "dashboard_usage") {
    return alsGebruiker(userId, async (q) => ({ tokens: (await q("SELECT * FROM app.mcp_console_tokens WHERE user_id = $1 ORDER BY created_at DESC", [userId])).rows.map(tokenOut),
      calls: Number((await q("SELECT count(*)::int AS n FROM app.mcp_console_log WHERE user_id = $1", [userId])).rows[0].n) }));
  }
  if (name === "site_health") { const res = await fetch("http://127.0.0.1:8080/__gezondheid"); return { status: res.status, body: await res.json() }; }
  if (name === "release_info") {
    const root = await releaseRoot();
    const read = async (file: string) => { try { return (await readFile(path.join(root, file), "utf8")).trim(); } catch { return ""; } };
    return { root, release: path.basename(root), bron: await read("BRON-COMMIT"), releaseCommit: await read("RELEASE-COMMIT"), versie: await read("UITROL-VERSIE") };
  }
  if (name === "list_dir") {
    const { root, target } = await inside(String(args.path || "."));
    const rows = await readdir(target, { withFileTypes: true });
    return { path: path.relative(root, target) || ".", entries: rows.filter((r) => !denied(r.name)).slice(0, 200).map((row) => ({ name: row.name, kind: row.isDirectory() ? "dir" : "file" })) };
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
  if (name === "host_status") return { site: await probeOne("site", "http://127.0.0.1:8080/__gezondheid"), deur: await probeOne("deur", "http://127.0.0.1:8091/health") };
  if (name === "list_releases") {
    const dir = "/srv/mijn-ruimte/releases";
    return { dir, releases: (await readdir(dir)).filter((row) => /^\d{8}-\d{6}$/.test(row)).sort() };
  }
  if (name === "permission_flags") return flags;
  if (name === "server_status" || name === "server_releases") {
    const w: Werkwoord = name === "server_status" ? "status" : "releases";
    if (!flags[`opdracht.${w}`]) throw new Error(`PERMISSION_OFF:opdracht.${w}`);
    const r = await voerOpdrachtUit(w);
    if (!r.ok) throw new Error(r.code);
    return r.resultaat?.gegevens ?? {};
  }
  throw new Error("TOOL_NOT_ON_DOOR");
}

// ---------------------------------------------------------------- archief (age, root-map, eenmalige downloadId)
const archiefUit = () => process.env.ARCHIEF_UIT || "/var/lib/mijn-ruimte-archief/uitgifte";
const verzoekDir = () => path.join(process.env.UPLOADS_DIR || "/srv/data/uploads", "mcp-archives");
export const ARCHIEF_BESTAND = "archief-laatste.tar.age";
async function requestKit() {
  await mkdir(verzoekDir(), { recursive: true });
  await writeFile(path.join(verzoekDir(), "kit-request"), "go\n", { mode: 0o600 });
}
/** Stand van het archief uit kit-status.txt (geschreven door /usr/local/sbin/mijn-ruimte-archief in de uitgiftemap). */
export async function readKitStatus(now = Date.now()): Promise<Record<string, string>> {
  let lines: Record<string, string> = {};
  let statusAge = Infinity;
  try { const st = await stat(path.join(archiefUit(), "kit-status.txt")); statusAge = now - st.mtimeMs; lines = parseKit(await readFile(path.join(archiefUit(), "kit-status.txt"), "utf8")); } catch { /* nog geen status */ }
  let requestAge = Infinity;
  try { requestAge = now - (await stat(path.join(verzoekDir(), "kit-request"))).mtimeMs; } catch { /* geen openstaand verzoek */ }
  if (requestAge < Infinity && requestAge < statusAge) {
    if (requestAge > 60_000) return { ...lines, state: "failed", error: "NOT_STARTED", detail: "служба архіву не стартувала (mijn-ruimte-archief.path)" };
    return { state: "building", stage: "1", pct: "0", phase: "queued", detail: "запит надіслано, очікуємо запуск", started: new Date(now - requestAge).toISOString() };
  }
  if (lines.state === "building" && statusAge > 10 * 60_000) return { ...lines, state: "failed", error: "STALLED", detail: "збір зупинився без відповіді понад 10 хвилин" };
  return lines;
}
function parseKit(raw: string) {
  const lines: Record<string, string> = {};
  for (const row of raw.split("\n")) { const cut = row.indexOf("="); if (cut > 0) lines[row.slice(0, cut)] = row.slice(cut + 1).trim(); }
  return lines;
}
/** Het enige downloadbare archief (vaste naam in de root-map). */
export function archiveFile(name: string = ARCHIEF_BESTAND) {
  return name === ARCHIEF_BESTAND ? path.join(archiefUit(), ARCHIEF_BESTAND) : "";
}
type ArchiveRow = { at: string; name: string; bytes: number; kod: number; baza: number; fajly: number; sekrety: number; kept?: boolean };
async function archiveHistory(): Promise<ArchiveRow[]> {
  let saved: ArchiveRow[] = [];
  try { const data = JSON.parse(await readFile(path.join(archiefUit(), "history.json"), "utf8")); if (Array.isArray(data)) saved = data.filter((r) => r && typeof r.name === "string"); } catch { /* nog geen geschiedenis */ }
  let current = "";
  try { current = JSON.parse(await readFile(path.join(archiefUit(), "archief-laatste.json"), "utf8")).naam || ""; } catch { /* geen archief */ }
  return saved.map((r) => ({ at: String(r.at || ""), name: r.name, bytes: Number(r.bytes || 0), kod: Number(r.kod || 0), baza: Number(r.baza || 0), fajly: Number(r.fajly || 0), sekrety: Number(r.sekrety || 0), kept: r.name === current }))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
}
function kitPayload(lines: Record<string, string>, history: ArchiveRow[]) {
  const state = lines.state || "idle";
  const ready = state === "ready";
  return {
    state, stage: Number(lines.stage || (ready ? 5 : 0)), pct: Number(lines.pct || (ready ? 100 : 0)), phase: lines.phase || "", name: lines.name || "",
    bytes: Number(lines.bytes || 0), detail: lines.detail || "", kod: Number(lines.kod || 0), baza: Number(lines.baza || 0), fajly: Number(lines.fajly || 0),
    sekrety: Number(lines.sekrety || 0), systeem: Number(lines.systeem || 0), started: lines.started || "", finished: lines.finished || "", error: lines.error || "",
    encrypted: "age", history,
  };
}
const downloads = new Map<string, { userId: string; kind: "archive" | "backup"; file: string; filename: string; exp: number }>();
function issueDownload(userId: string, kind: "archive" | "backup", file: string, filename: string) {
  for (const [k, v] of downloads) if (v.exp < Date.now()) downloads.delete(k);
  const id = randomBytes(32).toString("base64url");
  const exp = Date.now() + MCP_CONSOLE_LIMITS.downloadIdMinutes * 60_000;
  downloads.set(sha(id), { userId, kind, file, filename, exp });
  return { downloadId: id, expiresAt: exp };
}
function redeemDownload(id: string, userId: string, kind: "archive" | "backup") {
  if (typeof id !== "string" || id.length < 20 || id.length > 100) return null;
  const key = sha(id);
  const row = downloads.get(key);
  downloads.delete(key); // eenmalig, ook bij een verkeerde gebruiker
  if (!row || row.exp < Date.now() || row.kind !== kind) return null;
  const a = Buffer.from(row.userId); const b = Buffer.from(userId);
  return a.length === b.length && timingSafeEqual(a, b) ? row : null;
}

// ---------------------------------------------------------------- nachtelijke back-ups (alleen versleutelde bestanden)
const BACKUP_STAMP = /^\d{8}-\d{6}$/;
const BACKUP_FILES = ["database.dump.age", "uploads.tar.gz.age", "systeem.tar.gz.age", "systeem-info.txt", "info.txt", "SHA256SUMS"];
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

function bearer(event: Record<string, unknown>) {
  const headers = (event.headers || {}) as Record<string, string>;
  return String(headers.authorization || headers.Authorization || "").replace(/^Bearer\s+/i, "").trim();
}

// ---------------------------------------------------------------- routes
export function mcpConsoleRoutes(requireSession: RequireSession, deps: McpConsoleDeps = {}): Record<string, RouterMiddleware[]> {
  const imported = new Set<string>();
  /** level: 'member' (goedgekeurd account) | 'owner' (eigenaar); stepUp: recente herbevestiging van de aanmelding. */
  const gate = (level: "member" | "owner", opts: { stepUp?: boolean }, run: (ctx: Ctx, auth: SessionOk) => Promise<Resp>) =>
    (async (raw) => {
      const ctx = raw as unknown as Ctx;
      const auth = await requireSession(ctx.event, ctx.body);
      if ("errorCode" in auth) return error(auth.errorCode, auth.errorCode.includes("FORBIDDEN") ? 403 : 401);
      if (auth.service !== "mcp") return error("MCP_SERVICE_REQUIRED", 403);
      if (auth.user.status !== "approved" && !isOwner(auth.user)) return error("ACCOUNT_NOT_APPROVED", 403);
      if (level === "owner" && !isOwner(auth.user)) return error("OWNER_REQUIRED", 403);
      if (opts.stepUp) {
        if (!deps.stepUp) return error("STEP_UP_REQUIRED", 403);
        const su = await deps.stepUp(ctx, auth);
        if (su) return su;
      }
      if (isOwner(auth.user) && !imported.has(auth.user.id)) { imported.add(auth.user.id); await importLegacyConsole(auth.user.id).catch(() => null); }
      return run(ctx, auth);
    }) as RouterMiddleware;
  /**
   * Wie deed het? Via MCP (Claude, Grok, …) staat de AI-verbinding voorop, de eigenaar erachter; anders de console zelf.
   * «Kan niet bepalen wie» bestaat niet meer: een gedelegeerde aanroep zonder namens heet expliciet «mcp · onbekende klant».
   */
  const wie = (ctx: Ctx | null, auth: SessionOk): { transport: string; agent: string } => {
    const email = auth.user.email || auth.user.id;
    const n = huidigeNamens();
    if (n) return { transport: "mcp", agent: `${n.client}${n.grantId ? ` #${n.grantId.slice(0, 8)}` : ""} → ${email}` };
    if (ctx && gedelegeerdeSessie(ctx.event)) return { transport: "mcp", agent: `onbekende MCP-klant → ${email}` };
    return { transport: "console", agent: email };
  };
  const opdrachtAntwoord = async (auth: SessionOk, w: Werkwoord) => {
    if (!(await readPerms())[`opdracht.${w}`]) return error(`PERMISSION_OFF:opdracht.${w}`, 403);
    const started = Date.now();
    const r = await voerOpdrachtUit(w);
    await logCall(auth.user.id, { method: "server.opdracht", detail: `${w} ${r.code}`, ...wie(null, auth), ok: r.ok, ms: Date.now() - started });
    if (w !== "status" && w !== "releases") {
      await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: `mcp_server_opdracht_${w.replace("-", "_")}`, type: "beveiliging", result: r.ok ? "ok" : "failure", details: { werkwoord: w, code: r.code } }).catch(() => undefined);
    }
    return json({ ok: r.ok, code: r.code, gestart: !!r.gestart, resultaat: r.resultaat ?? null }, r.ok ? 200 : r.code === "UIT" ? 403 : 502);
  };

  const bordSchrijven = [gate("member", {}, async (ctx, auth) => {
    const data = bodyOf(ctx.body);
    if (data.kind === "move") {
      const status = String(data.status || "");
      if (!STATUSES.has(status)) return error("TASK_STATUS", 400);
      const row = await alsGebruiker(auth.user.id, async (q) => (await q("UPDATE app.mcp_console_items SET status = $3, updated_at = now() WHERE id::text = $2 AND user_id = $1 AND kind = 'task' RETURNING *", [auth.user.id, String(data.id || ""), status])).rows[0]);
      return row ? json({ task: taskOut(row) }) : error("TASK_NOT_FOUND", 404);
    }
    if (data.kind === "edit") {
      const patch: { title?: string; body?: string; tags?: string[] } = {};
      if (data.title !== undefined) {
        const title = String(data.title);
        if (!title.trim() || title.length > 160) return error("TITLE_INVALID", 400);
        patch.title = title;
      }
      if (data.body !== undefined) {
        const body = String(data.body);
        if (body.length > 4000) return error("BODY_INVALID", 400);
        patch.body = body;
      }
      if (data.tags !== undefined) {
        const tags = schoneTags(data.tags);
        if (!tags) return error("TAG_INVALID", 400);
        patch.tags = tags;
      }
      if (!patch.title && patch.body === undefined && !patch.tags) return error("PATCH_EMPTY", 400);
      const row = await editItem(auth.user.id, String(data.id || ""), patch);
      return row ? json(row) : error("ITEM_NOT_FOUND", 404);
    }
    if (data.kind === "delete") {
      const row = await deleteItem(auth.user.id, String(data.id || ""));
      return row ? json(row) : error("ITEM_NOT_FOUND", 404);
    }
    const kind = data.kind === "note" ? "note" : "task";
    const tags = schoneTags(data.tags);
    if (!tags) return error("TAG_INVALID", 400);
    return json(await addItem(auth.user.id, kind, String(data.title || (kind === "note" ? "Нотатка" : "Задача")), String(data.body || ""), null, "operator", tags));
  })] as RouterMiddleware[];

  const leesBestand = async (rel: string) => {
    if (!rel || rel.length > 400 || rel.includes("\0")) return { ok: false as const, error: "PATH_INVALID" };
    try {
      if (denied(rel)) return { ok: false as const, error: "PATH_SECRET" };
      const { target } = await inside(rel);
      const info = await stat(target);
      if (!info.isFile()) return { ok: false as const, error: "NOT_A_FILE" };
      if (info.size > 120_000) return { ok: false as const, error: "FILE_TOO_LARGE" };
      return { ok: true as const, data: { path: rel.replaceAll("\\", "/"), bytes: info.size, text: await readFile(target, "utf8") } };
    } catch (err) {
      const code = err instanceof Error ? err.message : "SPIEGEL_FOUT";
      return { ok: false as const, error: /^(PATH_|NOT_A_FILE|FILE_TOO_LARGE)/.test(code) ? code : "SPIEGEL_FOUT" };
    }
  };
  const liveRelease = async () => {
    try {
      const root = await releaseRoot();
      const read = async (file: string) => { try { return (await readFile(path.join(root, file), "utf8")).trim(); } catch { return ""; } };
      return { release: path.basename(root), bron: await read("BRON-COMMIT"), releaseCommit: await read("RELEASE-COMMIT"), versie: await read("UITROL-VERSIE") };
    } catch {
      return { release: "", bron: "", releaseCommit: "", versie: "", error: "RELEASE_ONLEESBAAR" };
    }
  };
  const serviceRij = (id: string, url: string) => ({ id, url, host: (() => { try { return new URL(url).host; } catch { return ""; } })(), role: SERVICE_ROLE[id] || "" });
  const spiegelEigenaar = (run: (data: Record<string, unknown>) => Promise<Resp>): RouterMiddleware[] => [gate("owner", {}, async (ctx) => {
    if (!(await readPerms()).read) return error("PERMISSION_OFF:read", 403);
    return run(bodyOf(ctx.body));
  })];

  return {
    "POST /api/mcp/health": [gate("owner", {}, async (ctx, auth) => {
      if (!(await readPerms()).read) return error("PERMISSION_OFF:read", 403);
      const started = Date.now();
      const probes = await Promise.all(HOSTS.map(([name, url]) => probeOne(name, url)));
      await logCall(auth.user.id, { method: "probe", detail: String(probes.filter((r) => r.ok).length), ...wie(ctx, auth), ok: true, ms: Date.now() - started });
      return json({ probes });
    })],
    "POST /api/mcp/board": bordSchrijven,
    "PATCH /api/mcp/board": bordSchrijven,
    "PUT /api/mcp/board": bordSchrijven,
    "POST /api/mcp/board/list": [gate("member", {}, async (_ctx, auth) => json(await board(auth.user.id)))],
    "POST /api/mcp/board/search": [gate("member", {}, async (ctx, auth) => {
      const data = bodyOf(ctx.body);
      const query = String(data.query || data.q || "").slice(0, 200);
      const tag = String(data.tag || "");
      const kind = String(data.kind || "");
      if (tag && !TAG.test(tag)) return error("TAG_INVALID", 400);
      if (kind && kind !== "task" && kind !== "note") return error("KIND_INVALID", 400);
      return json(await searchBoard(auth.user.id, query, tag, kind));
    })],
    // Weerspiegeling van de deur: alleen lezen. Geen installatie, rollback, back-up, archiefdownload of geheime waarden.
    "POST /api/mcp/spiegel/release/live": spiegelEigenaar(async () => json(await liveRelease())),
    "POST /api/mcp/spiegel/release/list": spiegelEigenaar(async () => {
      const live = await liveRelease();
      let releases: string[] = [];
      const dir = process.env.MCP_RELEASES_DIR || "/srv/mijn-ruimte/releases";
      try { releases = (await readdir(dir)).filter((row) => /^\d{8}-\d{6}$/.test(row)).sort(); } catch { releases = []; }
      let catalog: { name: string; kind: string }[] = [];
      let catalogError = "";
      try {
        const { root, target } = await inside(".");
        const rows = await readdir(target, { withFileTypes: true });
        catalog = rows.filter((r) => !denied(r.name)).slice(0, 200).map((row) => ({ name: row.name, kind: row.isDirectory() ? "dir" : "file" }));
        void root;
      } catch (err) {
        const code = err instanceof Error ? err.message : "SPIEGEL_FOUT";
        catalogError = /^(PATH_|NOT_A_FILE|FILE_TOO_LARGE)/.test(code) ? code : "SPIEGEL_FOUT";
      }
      return json({ releases, live, catalog, ...(catalogError ? { catalogError } : {}) });
    }),
    "POST /api/mcp/spiegel/release/file": spiegelEigenaar(async (data) => {
      const uit = await leesBestand(String(data.path || ""));
      return uit.ok ? json(uit.data) : error(uit.error, 400);
    }),
    "POST /api/mcp/spiegel/health": spiegelEigenaar(async () => {
      const flags = await readPerms();
      const [site, deur] = await Promise.all([
        probeOne("site", "http://127.0.0.1:8080/__gezondheid"),
        probeOne("deur", "http://127.0.0.1:8091/health"),
      ]);
      let armored: Record<string, unknown> = { available: false, reason: "PERMISSION_OFF:opdracht.status" };
      if (flags["opdracht.status"]) {
        try {
          const r = await voerOpdrachtUit("status");
          armored = r.ok ? { available: true, code: r.code, data: r.resultaat?.gegevens ?? {} } : { available: false, reason: r.code };
        } catch { armored = { available: false, reason: "OPDRACHT_FOUT" }; }
      }
      return json({
        site, deur, switches: flags, armored,
        note: "Read only. After the owner approves a package with a passkey, compare versie from get_live_release with this health. Installing, rolling back and backups stay on the website.",
      });
    }),
    "POST /api/mcp/spiegel/services": spiegelEigenaar(async () => json({
      services: HOSTS.map(([id, url]) => serviceRij(id, url)),
      next: "Use these URLs. Call list_services before opening mail, admin, hub or any other web component.",
    })),
    "POST /api/mcp/spiegel/service": spiegelEigenaar(async (data) => {
      const id = String(data.id || "");
      const hit = HOSTS.find(([name]) => name === id);
      if (!hit) return error("UNKNOWN_SERVICE", 404);
      return json({ ...serviceRij(hit[0], hit[1]), probe: await probeOne(hit[0], hit[1]) });
    }),
    "POST /api/mcp/spiegel/hub": spiegelEigenaar(async () => json({
      hub: serviceRij("hub", "https://hub.tarasevych.com/overview"),
      layers: ["huis", "id/admin", "api", "mcp", "surfaces"],
      services: HOSTS.map(([id, url]) => serviceRij(id, url)),
      instruction: "Call list_services before interacting with another web component. URLs here are the ones the estate actually serves.",
    })),
    "POST /api/mcp/spiegel/stats": [gate("member", {}, async (_ctx, auth) => {
      const tokens = await alsGebruiker(auth.user.id, async (q) => (await q("SELECT id, name, prefix, scopes, created_at, expires_at, revoked_at, calls, last_seen_at FROM app.mcp_console_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100", [auth.user.id])).rows.map(tokenOut));
      const calls = await alsGebruiker(auth.user.id, async (q) => Number((await q("SELECT count(*)::int AS n FROM app.mcp_console_log WHERE user_id = $1", [auth.user.id])).rows[0].n));
      return json({ tokens, calls, note: "Prefixes and call counts only. Token secrets and vault values are never included." });
    })],
    "POST /api/mcp/tokens/list": [gate("member", {}, async (_ctx, auth) =>
      json({ tokens: await alsGebruiker(auth.user.id, async (q) => (await q("SELECT * FROM app.mcp_console_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100", [auth.user.id])).rows.map(tokenOut)) }))],
    "POST /api/mcp/tokens": [gate("member", { stepUp: true }, async (ctx, auth) => {
      const name = String(bodyOf(ctx.body).name || "Agent").slice(0, 80);
      // Ruimte van het token (0042): 'prive' (eigen ruimte) of 'technisch' (alleen eigenaar met actief technisch profiel). De AI kiest dit nooit zelf.
      const poort = await ruimteUitVerzoek(auth.user, bodyOf(ctx.body));
      if ("fout" in poort) return error(poort.fout, poort.status);
      // Приватний токен: стеля сайту й каталог способів. Технічний токен тут не ріжеться.
      if (poort.ruimte === "prive") {
        const w = connectGeweigerd(await leesStaat(), { ruimte: "prive", klant: klantUit(bodyOf(ctx.body).klant, name), methode: "token" });
        if (w) return error(w.code, 403);
      }
      const raw = `tvh_${randomBytes(24).toString("base64url")}`;
      const row = await alsGebruiker(auth.user.id, async (q) => {
        const active = Number((await q("SELECT count(*)::int AS n FROM app.mcp_console_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()", [auth.user.id])).rows[0].n);
        if (active >= MCP_CONSOLE_LIMITS.tokensPerUser) return null;
        return (await q(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, expires_at, ruimte) VALUES ($1, $2, $3, $4, now() + interval '${MCP_CONSOLE_LIMITS.tokenDays} days', $5) RETURNING *`,
          [auth.user.id, name, raw.slice(0, 12), sha(raw), poort.ruimte])).rows[0];
      });
      if (!row) return error("TOKEN_LIMIT_REACHED", 409);
      // Gedetailleerde toegang (0043): een nieuw token krijgt de niet-gevoelige standaardscopes.
      await geefStandaard(auth.user.id, { soort: 'agenttoken', id: String(row.id) }, poort.ruimte).catch(() => undefined);
      await logCall(auth.user.id, { method: "token.issue", detail: name, ...wie(ctx, auth), ok: true, ms: 0 });
      await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: "mcp_console_token_issued", type: "ai", result: "ok", details: { tokenId: row.id, name, ruimte: poort.ruimte } }).catch(() => undefined);
      return json({ token: { ...tokenOut(row), token: raw } });
    })],
    "POST /api/mcp/tokens/revoke": [gate("member", {}, async (ctx, auth) => {
      const weg = await alsGebruiker(auth.user.id, async (q) => (await q("UPDATE app.mcp_console_tokens SET revoked_at = now() WHERE id::text = $2 AND user_id = $1 AND revoked_at IS NULL RETURNING name, prefix", [auth.user.id, String(bodyOf(ctx.body).id || "")])).rows[0]);
      if (!weg) return error("TOKEN_NOT_FOUND", 404);
      await verwijderToegang({ soort: 'agenttoken', id: String(bodyOf(ctx.body).id || "") }).catch(() => undefined);
      await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: "mcp_console_token_revoked", type: "ai", result: "ok", details: { tokenId: String(bodyOf(ctx.body).id || ""), name: String(weg.name || ""), prefix: String(weg.prefix || "") } }).catch(() => undefined);
      return json({ ok: true });
    })],
    "POST /api/mcp/call": [gate("member", {}, async (ctx, auth) => {
      const data = bodyOf(ctx.body);
      const name = String(data.name || "");
      const args = (data.arguments && typeof data.arguments === "object" ? data.arguments : {}) as Record<string, unknown>;
      const started = Date.now();
      try {
        const result = await runTool(auth.user.id, isOwner(auth.user), name, args, "operator");
        await logCall(auth.user.id, { method: "tools/call", detail: name, ...wie(ctx, auth), ok: true, ms: Date.now() - started });
        return json({ ok: true, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : "TOOL_FAILED";
        await logCall(auth.user.id, { method: "tools/call", detail: `${name} ${message}`, ...wie(ctx, auth), ok: false, ms: Date.now() - started });
        return json({ ok: false, error: message }, 400);
      }
    })],
    "POST /api/mcp/permissions": [gate("member", {}, async (ctx) => {
      // Alleen lezen: de vlaggen staan in een root-bestand op de server; de site (en dus een gestolen sessie) kan ze niet wijzigen.
      if (bodyOf(ctx.body).id) return json({ error: "PERMISSIONS_READONLY", reasonCode: "PERMISSIONS_READONLY", file: permPath(), permissions: await readPerms(), catalog: PERMISSIONS, readonly: true }, 409);
      return json({ permissions: await readPerms(), catalog: PERMISSIONS, readonly: true, file: permPath() });
    })],
    "POST /api/mcp/traffic": [gate("member", {}, async (_ctx, auth) => json({
      log: await alsGebruiker(auth.user.id, async (q) => (await q("SELECT * FROM app.mcp_console_log WHERE user_id = $1 ORDER BY at DESC LIMIT 200", [auth.user.id])).rows
        .map((r) => ({ id: String(r.id), at: iso(r.at), method: r.method, detail: r.detail, transport: r.transport, agent: r.agent, ok: r.ok, ms: r.ms }))),
    }))],
    "POST /api/mcp/archive": [gate("owner", {}, async (_ctx, auth) => {
      if (!(await readPerms()).read) return error("PERMISSION_OFF:read", 403);
      try {
        const current = await readKitStatus();
        if (current.state !== "building") await requestKit();
        const lines = current.state === "building" ? current : await readKitStatus();
        await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: "mcp_archive_requested", type: "beveiliging", result: "ok", details: {} }).catch(() => undefined);
        return json(kitPayload(lines.state === "ready" || lines.state === "failed" ? { state: "building", stage: "1", pct: "0", phase: "queued", detail: "запит надіслано, очікуємо запуск", started: new Date().toISOString() } : lines, await archiveHistory()));
      } catch (err) { return error(err instanceof Error ? err.message : "ARCHIVE_FAILED", 500); }
    })],
    "POST /api/mcp/archive/status": [gate("owner", {}, async () => {
      if (!(await readPerms()).read) return error("PERMISSION_OFF:read", 403);
      try { return json(kitPayload(await readKitStatus(), await archiveHistory())); }
      catch (err) { return error(err instanceof Error ? err.message : "ARCHIVE_FAILED", 500); }
    })],
    // Stap 1: na step-up een eenmalige downloadId (5 minuten). Stap 2: /api/mcp/archive/file met die id.
    "POST /api/mcp/archive/link": [gate("owner", { stepUp: true }, async (_ctx, auth) => {
      const file = archiveFile();
      let meta: { naam?: string; bytes?: number } = {};
      try { if (!(await stat(file)).isFile()) return error("ARCHIVE_MISSING", 404); meta = JSON.parse(await readFile(path.join(archiefUit(), "archief-laatste.json"), "utf8")); } catch { return error("ARCHIVE_MISSING", 404); }
      const filename = /^[A-Za-z0-9._-]{1,120}$/.test(String(meta.naam || "")) ? String(meta.naam) : ARCHIEF_BESTAND;
      await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: "mcp_archive_download_link", type: "beveiliging", result: "ok", details: { name: filename } }).catch(() => undefined);
      return json({ ...issueDownload(auth.user.id, "archive", file, filename), name: filename, bytes: Number(meta.bytes || 0) });
    })],
    "POST /api/mcp/archive/file": [gate("owner", {}, async (ctx, auth) => {
      const row = redeemDownload(String(bodyOf(ctx.body).downloadId || ""), auth.user.id, "archive");
      if (!row) return error("DOWNLOAD_ID_INVALID", 403);
      try { if (!(await stat(row.file)).isFile()) return error("ARCHIVE_MISSING", 404); } catch { return error("ARCHIVE_MISSING", 404); }
      return fileDownload(row.file, row.filename, "application/octet-stream");
    })],
    "POST /api/mcp/backups": [gate("owner", {}, async () => {
      if (!(await readPerms()).read) return error("PERMISSION_OFF:read", 403);
      return json({ backups: await listBackups() });
    })],
    "POST /api/mcp/backups/link": [gate("owner", { stepUp: true }, async (ctx, auth) => {
      const data = bodyOf(ctx.body);
      const file = backupFile(String(data.stamp || ""), String(data.name || ""));
      if (!file) return error("BACKUP_NAME", 400);
      try { if (!(await stat(file)).isFile()) return error("BACKUP_MISSING", 404); } catch { return error("BACKUP_MISSING", 404); }
      await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: "mcp_backup_download_link", type: "beveiliging", result: "ok", details: { stamp: String(data.stamp), name: path.basename(file) } }).catch(() => undefined);
      return json(issueDownload(auth.user.id, "backup", file, `${String(data.stamp)}-${path.basename(file)}`));
    })],
    "POST /api/mcp/backups/file": [gate("owner", {}, async (ctx, auth) => {
      const row = redeemDownload(String(bodyOf(ctx.body).downloadId || ""), auth.user.id, "backup");
      if (!row) return error("DOWNLOAD_ID_INVALID", 403);
      try { if (!(await stat(row.file)).isFile()) return error("BACKUP_MISSING", 404); } catch { return error("BACKUP_MISSING", 404); }
      return fileDownload(row.file, row.filename, "application/octet-stream");
    })],
    // Methode 3 (gepantserde opdracht): vaste werkwoorden, root controleert alles opnieuw. Zie backend/server-beheer.ts.
    "POST /api/mcp/server/lezen": [gate("owner", {}, async (ctx, auth) => {
      const w = String(bodyOf(ctx.body).werkwoord || "");
      if (w !== "status" && w !== "releases") return error("OPDRACHT_ONBEKEND", 400);
      return opdrachtAntwoord(auth, w);
    })],
    "POST /api/mcp/server/backup": [gate("owner", {}, async (_ctx, auth) => opdrachtAntwoord(auth, "backup"))],
    "POST /api/mcp/server/uitrol-nu": [gate("owner", { stepUp: true }, async (_ctx, auth) => opdrachtAntwoord(auth, "uitrol-nu"))],
    "POST /api/mcp/server/terugdraaien": [gate("owner", { stepUp: true }, async (ctx, auth) => {
      if (bodyOf(ctx.body).bevestig !== "TERUGDRAAIEN") return error("BEVESTIGING_VEREIST", 400);
      const limit = await rateLimit("mcp-opdracht:terugdraaien", 1, 600);
      if (!limit.ok) return error("RATE_LIMITED", 429);
      return opdrachtAntwoord(auth, "terugdraaien");
    })],
    "POST /api/mcp/server/resultaat": [gate("owner", {}, async (ctx) => {
      const w = String(bodyOf(ctx.body).werkwoord || "");
      if (!isWerkwoord(w)) return error("OPDRACHT_ONBEKEND", 400);
      return json({ resultaat: await leesOpdrachtResultaat(w) });
    })],
    // Agenttoken (tvh_…): per gebruiker, met vervaldatum; serverbrede hulpmiddelen alleen als de eigenaar van het token de eigenaar is.
    "POST /api/mcp/agent": [async (raw) => {
      const ctx = raw as unknown as Ctx;
      const got = bearer(ctx.event);
      if (!/^tvh_[A-Za-z0-9_-]{20,64}$/.test(got)) return error("TOKEN_INVALID", 401);
      const sys = getPool("systeem");
      const { rows } = await sys.query(
        `SELECT t.id, t.user_id, t.name, t.ruimte, r.data->>'role' AS role FROM app.mcp_console_tokens t
           LEFT JOIN app.records r ON r.tbl = 'users' AND r.id = t.user_id
          WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()
            AND COALESCE(r.data->>'status', '') NOT IN ('blocked', 'rejected', 'deleted') AND COALESCE((r.data->>'retiredAt')::numeric, 0) = 0
            AND NOT EXISTS (SELECT 1 FROM app.user_ai_settings s WHERE s.user_id = t.user_id AND s.blocked_at IS NOT NULL)`, [sha(got)]);
      const tok = rows[0];
      if (!tok) return error("TOKEN_INVALID", 401);
      const limit = await rateLimit(`mcp-agent:${tok.id}`, 60, 60);
      if (!limit.ok) return error("RATE_LIMITED", 429);
      await sys.query("UPDATE app.mcp_console_tokens SET calls = calls + 1, last_seen_at = now() WHERE id = $1", [tok.id]);
      const data = bodyOf(ctx.body);
      const name = String(data.name || "");
      const args = (data.arguments && typeof data.arguments === "object" ? data.arguments : {}) as Record<string, unknown>;
      const started = Date.now();
      // Ruimte van het token (0042) vóór alles: een privétoken raakt nooit de server, een technisch token nooit de privé-inhoud.
      const ruimte = ruimteOf(tok.ruimte);
      if (!toolInRuimte(name, ruimte) && !isGoedkeurPoging(name)) {
        await logCall(tok.user_id, { method: "tools/call", detail: `${name} SPACE_SEPARATED:${ruimte}`, transport: "agent", agent: tok.name, ok: false, ms: Date.now() - started });
        return json({ ok: false, error: "SPACE_SEPARATED", message: RUIMTE_GESCHEIDEN(ruimte, name.slice(0, 80)) }, 403);
      }
      // Ondertekend AI-beleid van de eigenaar (§13.12): deze deur heeft geen goedkeurstap, dus alleen «дозволено» gaat door.
      const beleid = await beslissing({ client: String(tok.name) }, name);
      if (beleid.mode !== "always") {
        await logCall(tok.user_id, { method: "tools/call", detail: `${name} AI_BELEID:${beleid.code}`, transport: "agent", agent: tok.name, ok: false, ms: Date.now() - started });
        return json({ ok: false, error: `AI_BELEID:${beleid.code}`, message: weigerTekst(beleid) }, 403);
      }
      try {
        const result = await metNamens({ client: String(tok.name), grantId: `token:${tok.id}`, ruimte }, () => runTool(tok.user_id, tok.role === "owner", name, args, `agent:${tok.name}`, String(tok.id), ruimte));
        await logCall(tok.user_id, { method: "tools/call", detail: name, transport: "agent", agent: tok.name, ok: true, ms: Date.now() - started });
        return json({ ok: true, result: text(result) });
      } catch (err) {
        const message = err instanceof Error ? err.message : "TOOL_FAILED";
        await logCall(tok.user_id, { method: "tools/call", detail: `${name} ${message}`, transport: "agent", agent: tok.name, ok: false, ms: Date.now() - started });
        return json({ ok: false, error: message }, 400);
      }
    }],
  };
}
