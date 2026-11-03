import { useEffect, useState, type ReactNode } from "react";
import { Activity, Archive, Check, Compass, Copy, Globe, History, KeyRound, Layers, LayoutDashboard, Link2, ListChecks, Plug, Plus, RefreshCw, Rocket, Server, ShieldCheck, StickyNote, Terminal, Wrench, X } from "lucide-react";
import { api, ApiError } from "./platform/client";
import { ecosystemTabContext } from "./tab-context";
import { DOOR_TOOLS, ESTATE, LAYERS, TOOL_HELP } from "./mcp-catalog";
import McpAgentsHub from "./McpAgentsHub";
import McpConsentModal from "./McpConsentModal";
import McpBackupsCard from "./McpBackupsCard";
import "./mcp-estate.css";

type Lang = "uk" | "nl";
type Props = { lang: Lang; tab: string };
type Probe = { id: string; url: string; ok: boolean; status: number; ms: number; error?: string };
type Task = { id: string; title: string; body: string; status: string };
type Note = { id: string; title: string; body: string; author: string; updatedAt: string };
type Token = { id: string; name: string; prefix: string; revokedAt: string; calls: number; token?: string };
type LogRow = { id: string; at: string; method: string; detail: string; transport: string; agent: string; ok: boolean; ms: number };
type Perm = { id: string; uk: string; nl: string; detailUk?: string; detailNl?: string; group?: string };

const effect = (onUk: string, offUk: string, onNl: string, offNl: string) => ({
  detailUk: `Увімкнено: ${onUk}\nВимкнено: ${offUk}`,
  detailNl: `Aan: ${onNl}\nUit: ${offNl}`,
});
const SWITCHES: Perm[] = [
  { id: "read", group: "agent", uk: "Читати сайт і код", nl: "Site en code lezen", ...effect("агент бачить випуск, здоров’я сайту і файли.", "двері відмовляють читати. Список і здоров’я недоступні.", "de agent ziet de release, de gezondheid en de bestanden.", "de deur weigert lezen. Lijst en gezondheid zijn dicht.") },
  { id: "board", group: "agent", uk: "Писати дошку", nl: "Bord schrijven", ...effect("задачі й нотатки записуються на сервер і лишаються.", "нові записи й переміщення відмовляються. Старе на дошці не зникає.", "taken en notities worden op de server bewaard.", "nieuwe regels en verplaatsingen worden geweigerd. Het oude bord blijft.") },
  { id: "tokens", group: "agent", uk: "Випускати токени агентів", nl: "Agenttokens uitgeven", ...effect("можна створити або відкликати ключ агента. Сам ключ видно один раз.", "випуск і відкликання ключа з дверей відмовляються.", "een agentsleutel maken of intrekken. De sleutel zelf verschijnt één keer.", "uitgeven en intrekken via de deur worden geweigerd.") },
  { id: "staging", group: "agent", uk: "Писати в чернетку", nl: "Klad schrijven", ...effect("агент кладе файли в чернетку. Живий сайт не змінюється.", "запис у чернетку відмовляється. Уже покладені файли лишаються.", "de agent zet bestanden in het klad. De live site verandert niet.", "schrijven naar het klad wordt geweigerd. Wat er al staat, blijft.") },
  { id: "install", group: "release", uk: "Викладати випуск", nl: "Release plaatsen", ...effect("агент може зібрати чернетку в новий живий випуск.", "двері відмовляють викладати. Поточний сайт лишається як є.", "de agent mag het klad tot een live release maken.", "de deur weigert plaatsen. De huidige site blijft.") },
  { id: "backup", group: "release", uk: "Запускати резервну копію", nl: "Reservekopie starten", ...effect("перед випуском запускається копія. Якщо вона падає, випуск зупиняється.", "випуск іде без копії.", "vóór een release start de kopie. Faalt die, dan stopt de release.", "de release gaat zonder kopie.") },
];

const statuses = ["backlog", "doing", "blocked", "done"] as const;
function initialTool() {
  if (typeof window === "undefined") return DOOR_TOOLS[0].name;
  const query = new URLSearchParams(location.search).get("tool") || "";
  if (DOOR_TOOLS.some((item) => item.name === query)) return query;
  const saved = sessionStorage.getItem("mcp-tool") || "";
  if (DOOR_TOOLS.some((item) => item.name === saved)) return saved;
  return DOOR_TOOLS[0].name;
}
function argsFor(name: string) {
  return JSON.stringify(DOOR_TOOLS.find((item) => item.name === name)?.args || {}, null, 2);
}
function toolGate(name: string) {
  if (name === "write_staging") return "staging";
  if (name === "start_backup") return "backup";
  if (name === "install_release" || name === "update_door") return "install";
  return "read";
}

function ctx() {
  return { service: "mcp" as const, tabContext: ecosystemTabContext(), sourceOrigin: location.origin };
}
function Tip({ text }: { text: string }) {
  if (!text) return null;
  return (
    <span className="mcp-q" tabIndex={0} aria-label={text}>
      ?
      <span className="mcp-tip" role="tooltip">{text}</span>
    </span>
  );
}
type Tone = "ok" | "wait" | "bad" | "off";
/** Statuslabel: een puntje en een kort, gewoon woord. */
function Badge({ tone = "ok", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`mcp-badge ${tone}`}><i aria-hidden="true" />{children}</span>;
}
/** Paginakop: icoon, titel, één zin over wat dit is en wat u hier doet, en eventueel knoppen. */
function PageHead({ icon, title, lead, actions, kicker }: { icon: ReactNode; title: string; lead?: string; actions?: ReactNode; kicker?: string }) {
  return (
    <header className="mcp-page-head">
      <span className="mcp-page-icon" aria-hidden="true">{icon}</span>
      <div className="mcp-page-text">
        {kicker ? <p className="mcp-kicker">{kicker}</p> : null}
        <h1>{title}</h1>
        {lead ? <p className="mcp-lead">{lead}</p> : null}
      </div>
      {actions ? <div className="mcp-page-actions">{actions}</div> : null}
    </header>
  );
}
/** Blok met eigen kop (icoon, titel, uitleg, acties) en de inhoud eronder. */
function Block({ icon, title, hint, actions, tone, children }: { icon?: ReactNode; title: string; hint?: string; actions?: ReactNode; tone?: "ok" | "warn" | "bad"; children: ReactNode }) {
  return (
    <section className={`mcp-block${tone ? ` tone-${tone}` : ""}`}>
      <header className="mcp-block-head">
        {icon ? <span className="mcp-block-icon" aria-hidden="true">{icon}</span> : null}
        <div className="mcp-block-title">
          <h2>{title}</h2>
          {hint ? <p>{hint}</p> : null}
        </div>
        {actions ? <div className="mcp-block-actions">{actions}</div> : null}
      </header>
      <div className="mcp-block-body">{children}</div>
    </section>
  );
}
/** Lege staat: zegt wat er nog niet is, zodat de pagina niet leeg lijkt. */
function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="mcp-empty">{icon}<p>{children}</p></div>;
}
function fault(err: unknown) {
  if (err instanceof ApiError) return String(err.response.data?.error || err.message);
  return err instanceof Error ? err.message : "ERROR";
}

type ArchiveRow = { at: string; name: string; bytes: number; kod: number; baza: number; fajly: number; sekrety: number; kept: boolean };
type ArchiveState = {
  state: string; stage: number; pct: number; phase: string; name: string; bytes: number;
  kod: number; baza: number; fajly: number; sekrety: number; systeem: number; detail: string; started: string; finished: string; error: string;
  history: ArchiveRow[];
};
const emptyArchive = (): ArchiveState => ({
  state: "idle", stage: 0, pct: 0, phase: "", name: "", bytes: 0,
  kod: 0, baza: 0, fajly: 0, sekrety: 0, systeem: 0, detail: "", started: "", finished: "", error: "", history: [],
});
const ARCHIVE_STEPS = [
  { n: 1, phase: "check", uk: "Код і перевірка", nl: "Code en controle", ukd: "Перевіряю місце на диску, пакую код сайту, міст MCP та історію git.", nld: "Schijfruimte controleren, code, MCP-brug en git-geschiedenis inpakken." },
  { n: 2, phase: "database", uk: "База даних", nl: "Database", ukd: "Знімаю повну базу PostgreSQL з ролями й шифрую її.", nld: "Volledige PostgreSQL-database met rollen dumpen en versleutelen." },
  { n: 3, phase: "files", uk: "Файли користувачів", nl: "Bestanden van gebruikers", ukd: "Потоково пакую й шифрую всі завантажені файли.", nld: "Alle geüploade bestanden streamend inpakken en versleutelen." },
  { n: 4, phase: "secrets", uk: "Система та секрети", nl: "Systeem en geheimen", ukd: "Збираю служби, конфіг тунелю, версії програм; секрети шифрую.", nld: "Diensten, tunnelconfiguratie en versies verzamelen; geheimen versleutelen." },
  { n: 5, phase: "pack", uk: "Пакунок і суми", nl: "Pakket en sommen", ukd: "Додаю інструкцію й скрипт відновлення, рахую SHA-256, збираю один файл.", nld: "Handleiding en herstelscript toevoegen, SHA-256 berekenen, één bestand maken." },
] as const;
const STEP_BANDS = [0, 24, 50, 72, 88, 100];
function stepPct(stage: number, overall: number, n: number) {
  if (stage > n) return 100;
  if (stage < n) return 0;
  const lo = STEP_BANDS[n - 1];
  const hi = STEP_BANDS[n];
  const value = Math.max(lo, Math.min(hi, overall || lo));
  return Math.round(((value - lo) / (hi - lo)) * 100);
}
function sizeText(n: number) {
  if (!n) return "—";
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}
function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function remain(started: string, pct: number) {
  const from = new Date(started).getTime();
  if (!started || Number.isNaN(from) || pct < 12 || pct >= 100) return "";
  return clock(((Date.now() - from) * (100 - pct)) / pct);
}
function whenText(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function Ring({ pct, done, n }: { pct: number; done: boolean; n: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const shown = done ? 100 : pct;
  return (
    <span className={`mcp-ring${done ? " done" : ""}${shown > 0 && !done ? " on" : ""}`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={r} />
        <circle cx="22" cy="22" r={r} strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - shown / 100)} />
      </svg>
      <b>{done ? "✓" : shown > 0 ? String(Math.round(shown)) : String(n)}</b>
    </span>
  );
}

export default function McpServiceView({ lang, tab }: Props) {
  const t = (uk: string, nl: string) => (lang === "uk" ? uk : nl);
  const section = ["overview", "services", "tools", "board", "agents", "playground", "traffic", "connect", "roadmap", "download"].includes(tab) ? tab : "overview";
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [probes, setProbes] = useState<Probe[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"task" | "note">("task");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [agentName, setAgentName] = useState("grok");
  const [fresh, setFresh] = useState("");
  const [tool, setTool] = useState(initialTool);
  const [args, setArgs] = useState(() => argsFor(initialTool()));
  const [copied, setCopied] = useState("");
  const [out, setOut] = useState("");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [catalog, setCatalog] = useState<Perm[]>([]);
  const [permsReady, setPermsReady] = useState(false);
  const [archive, setArchive] = useState<ArchiveState>(emptyArchive);
  const [tick, setTick] = useState(0);

  async function run(label: string, job: () => Promise<void>) {
    setBusy(label);
    setError("");
    try { await job(); } catch (err) { setError(fault(err)); } finally { setBusy(""); }
  }
  async function loadBoard() {
    const res = await api.post("/api/mcp/board/list", ctx());
    setTasks(res.data.tasks || []);
    setNotes(res.data.notes || []);
  }
  async function loadTokens() {
    const perms = await api.post("/api/mcp/permissions", ctx());
    setFlags(perms.data.permissions || {});
    setCatalog(perms.data.catalog || []);
    setPermsReady(true);
    const res = await api.post("/api/mcp/tokens/list", ctx());
    setTokens(res.data.tokens || []);
  }
  async function loadTraffic() {
    const res = await api.post("/api/mcp/traffic", ctx());
    setRows(res.data.log || []);
  }
  function permRows() {
    const remote = new Map(catalog.map((item) => [item.id, item]));
    const order = [...SWITCHES.map((item) => item.id), ...catalog.map((item) => item.id).filter((id) => !SWITCHES.some((item) => item.id === id))];
    return order.map((id) => {
      const local = SWITCHES.find((item) => item.id === id);
      const got = remote.get(id);
      return {
        id,
        uk: got?.uk || local?.uk || id,
        nl: got?.nl || local?.nl || id,
        detailUk: local?.detailUk || got?.detailUk || "",
        detailNl: local?.detailNl || got?.detailNl || "",
        group: got?.group || local?.group || "agent",
      };
    });
  }
  function confirmOn(id: string) {
    if (id === "install") return window.confirm(t("Увімкнути викладання? Агент зможе зібрати чернетку в живий випуск.", "Plaatsen aanzetten? De agent kan een klad tot een live release maken."));
    if (id === "backup") return window.confirm(t("Увімкнути резервну копію? Перед випуском запуститься копія. Якщо вона не вдасться, випуск зупиниться.", "Reservekopie aanzetten? Vóór de release start de kopie. Lukt die niet, dan stopt de release."));
    return true;
  }
  function chooseTool(name: string) {
    if (!DOOR_TOOLS.some((item) => item.name === name)) return;
    setTool(name);
    setArgs(argsFor(name));
    setOut("");
    try { sessionStorage.setItem("mcp-tool", name); } catch { /* private mode */ }
    const url = new URL(location.href);
    url.searchParams.set("tool", name);
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
  async function loadProbes() {
    const res = await api.post("/api/mcp/health", ctx());
    setProbes(res.data.probes || []);
  }
  async function copyText(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(""), 1500);
  }
  const [downloaded, setDownloaded] = useState(0);
  /** Стрімить файл на диск, який ви самі обираєте у вікні системи (File System Access); у браузерах без цього — звичайне завантаження. */
  async function saveBlob(name: string) {
    setDownloaded(0);
    const w = window as unknown as { showSaveFilePicker?: (o: object) => Promise<{ createWritable: () => Promise<{ write: (d: Uint8Array) => Promise<void>; close: () => Promise<void> }> }> };
    let writable: { write: (d: Uint8Array) => Promise<void>; close: () => Promise<void> } | null = null;
    if (typeof w.showSaveFilePicker === "function") {
      try { writable = await (await w.showSaveFilePicker({ suggestedName: name })).createWritable(); }
      catch (err) { if ((err as { name?: string })?.name === "AbortError") return; writable = null; }
    }
    const response = await fetch("/api/mcp/archive/file", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ctx(), name }),
    });
    if (!response.ok || !response.body) { if (writable) await writable.close().catch(() => undefined); throw new Error("ARCHIVE_FAILED"); }
    if (writable) {
      const reader = response.body.getReader();
      let total = 0;
      try {
        for (;;) { const { done, value } = await reader.read(); if (done) break; await writable.write(value); total += value.length; setDownloaded(total); }
      } finally { await writable.close(); }
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }
  function takeArchive(data: Partial<ArchiveState>) {
    setArchive({ ...emptyArchive(), ...data, history: Array.isArray(data.history) ? data.history : [] });
  }
  async function downloadArchive() {
    const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    let data = (await api.post("/api/mcp/archive", ctx())).data as ArchiveState;
    takeArchive(data);
    for (let i = 0; i < 4800 && data.state !== "ready"; i += 1) {
      if (data.state === "failed" || data.error) throw new Error(String(data.error || "ARCHIVE_FAILED"));
      await sleep(1500);
      data = (await api.post("/api/mcp/archive/status", ctx())).data as ArchiveState;
      takeArchive(data);
    }
    const name = String(data.name || "");
    if (data.state !== "ready" || !name) throw new Error(String(data.error || "ARCHIVE_FAILED"));
  }
  const rememberedToken = (() => { try { return sessionStorage.getItem("mcp-fresh-token") || fresh; } catch { return fresh; } })();
  const connectSample = `{
  "mcpServers": {
    "tarasevych": {
      "url": "https://mcp.tarasevych.com/Grok"
    }
  }
}`;
  const bearerSample = `Authorization: Bearer ${rememberedToken || "<токен з сторінки Агенти>"}`;

  useEffect(() => {
    if (section === "board") void run("board", async () => { await loadTokens(); await loadBoard(); });
    if (section === "agents" || section === "playground") void run(section, loadTokens);
    if (section === "traffic") void run("traffic", loadTraffic);
    if (section === "services") void run("probe", loadProbes);
    if (section === "download") {
      void api.post("/api/mcp/archive/status", ctx()).then((res) => takeArchive(res.data as ArchiveState)).catch(() => undefined);
    }
  }, [section]);
  useEffect(() => {
    if (archive.state !== "building") return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    // Ook na het herladen van de pagina de voortgang blijven volgen (het bouwen draait op de server door).
    const poll = window.setInterval(() => { void api.post("/api/mcp/archive/status", ctx()).then((res) => takeArchive(res.data as ArchiveState)).catch(() => undefined); }, 2000);
    return () => { window.clearInterval(id); window.clearInterval(poll); };
  }, [archive.state]);

  const currentTool = DOOR_TOOLS.find((item) => item.name === tool);
  const wordOf = (status: string) => (({ backlog: t("Заплановано", "Gepland"), doing: t("У роботі", "Mee bezig"), blocked: t("Заблоковано", "Geblokkeerd"), done: t("Готово", "Klaar") }) as Record<string, string>)[status] ?? status;
  const probed = probes.length;
  const reachable = probes.filter((item) => item.ok).length;
  const archiveTitle = archive.state === "ready" ? t("Архів готовий", "Archief klaar") : archive.state === "failed" ? t("Збір зупинився", "Maken gestopt") : archive.state === "building" ? t("Збираю повний архів", "Volledig archief maken") : t("Ще не запускали", "Nog niet gestart");
  const archiveHint = archive.state === "building" && archive.started ? `${t("Минуло", "Verstreken")} ${clock(Date.now() - new Date(archive.started).getTime() + (tick >= 0 ? 0 : 0))}${remain(archive.started, archive.pct) ? ` · ${t("ще", "nog")} ~${remain(archive.started, archive.pct)}` : ""}` : archive.bytes ? sizeText(archive.bytes) : "";
  const archiveBar = archive.state === "ready" ? 100 : Math.max(archive.state === "building" ? 4 : 0, archive.pct || 0);

  return (
    <div className="mcp-estate" data-mcp-tab={section}>
      <McpConsentModal tr={t} />
      {error && error !== "Internal server error" ? <p className="mcp-note bad" role="alert">{error}</p> : null}
      {busy && busy !== "archive" ? <p className="mcp-meta" role="status">{t("Виконується…", "Bezig…")}</p> : null}

      {section === "overview" && (
        <>
          <PageHead
            kicker={`Tarasevych MCP · ${t("міст до ШІ", "brug naar AI")}`}
            icon={<LayoutDashboard />}
            title={t("Будь-який агент заходить сюди. Не в браузер.", "Elke agent komt hier binnen. Niet via de browser.")}
            lead={t("Машинний вхід до сайту: агенти працюють через цей міст, а не через браузерний логін.", "De machine-ingang van de site: agenten werken via deze brug, niet via een browserlogin.")}
          />
          <div className="mcp-stats">
            <div className="mcp-stat"><strong>11</strong><span>{t("хостів маєтку", "hosts van het domein")}</span></div>
            <div className="mcp-stat"><strong>{DOOR_TOOLS.length}</strong><span>{t("інструментів дверей", "hulpmiddelen van de deur")}</span></div>
            <div className="mcp-stat"><strong>HTTP</strong><span>{t("JSON-RPC, без SSE", "JSON-RPC, geen SSE")}</span></div>
          </div>
          <Block icon={<Layers />} title={t("Шар мосту", "Laag van de brug")}>
            <ol className="mcp-list">
              {LAYERS.map(([title, uk, nl]) => (
                <li key={title} className="mcp-item">
                  <span className="mcp-item-icon" aria-hidden="true"><Layers /></span>
                  <div className="mcp-item-main"><b>{title}</b><span>{t(uk, nl)}</span></div>
                </li>
              ))}
            </ol>
          </Block>
          <div className="mcp-cols two">
            <Block icon={<ShieldCheck />} title={t("Чому агенти не бачать сайт", "Waarom agenten de site niet zien")}>
              <p>{t("Кожен публічний хост відповідає, але id тримає браму. Браузерний логін — для людей. Агенту потрібен контракт: JSON-RPC, скоупи, аудит.", "Elke host antwoordt, maar id houdt de poort. Browserlogin is voor mensen. Een agent heeft een contract nodig.")}</p>
            </Block>
            <Block icon={<Link2 />} title={t("Публічне ім’я", "Publieke naam")} actions={<button type="button" className="mcp-btn ghost small" onClick={() => void copyText("public", "https://mcp.tarasevych.com/Grok")}><Copy />{copied === "public" ? t("Скопійовано", "Gekopieerd") : t("Копіювати", "Kopiëren")}</button>}>
              <p className="mcp-url">https://mcp.tarasevych.com/Grok</p>
            </Block>
          </div>
          <Block
            icon={<Server />}
            title={t("Стан хостів", "Status van de hosts")}
            actions={<button type="button" className="mcp-btn ghost small" disabled={Boolean(busy)} onClick={() => void run("probe", loadProbes)}><RefreshCw />{t("Перевірити хости", "Hosts controleren")}</button>}
          >
            <div className="mcp-form">
              {probed ? (
                <Badge tone={reachable === ESTATE.length ? "ok" : reachable ? "wait" : "bad"}>{t(`${reachable} з ${ESTATE.length} відповідають`, `${reachable} van ${ESTATE.length} antwoorden`)}</Badge>
              ) : (
                <Badge tone="off">{t("Ще не перевірено", "Nog niet gecontroleerd")}</Badge>
              )}
            </div>
            <p className="mcp-meta">{t("Деталі по кожному хосту — на вкладці Сервіси.", "Details per host staan op het tabblad Diensten.")}</p>
          </Block>
        </>
      )}

      {section === "services" && (
        <>
          <PageHead
            icon={<Server />}
            title={t("Сервіси", "Diensten")}
            lead={t("Статус береться з живої перевірки. Посилання відкриває хост.", "De status komt uit een live controle. De link opent de host.")}
            actions={<button type="button" className="mcp-btn" disabled={Boolean(busy)} onClick={() => void run("probe", loadProbes)}><RefreshCw />{t("Перевірити хости", "Hosts controleren")}</button>}
          />
          <Block icon={<Globe />} title={t("Хости домену", "Hosts van het domein")}>
            <ul className="mcp-list">
              {ESTATE.map((row) => {
                const probe = probes.find((item) => item.id === row.id);
                return (
                  <li key={row.id} className="mcp-item">
                    <span className={`mcp-item-icon${probe ? (probe.ok ? " ok" : " bad") : ""}`} aria-hidden="true"><Globe /></span>
                    <div className="mcp-item-main">
                      <b>{t(row.uk, row.nl)}</b>
                      <span>{t(row.roleUk, row.roleNl)}</span>
                      <a className="mcp-url" href={row.url} target="_blank" rel="noreferrer">{row.url.replace("https://", "")}</a>
                    </div>
                    <div className="mcp-item-aside">
                      {probe ? (
                        <>
                          <Badge tone={probe.ok ? "ok" : "bad"}>{probe.ok ? t("Відповідає", "Antwoordt") : t("Не відповідає", "Antwoordt niet")}</Badge>
                          <span className="mcp-meta">HTTP {probe.status || "—"} · {probe.ms} ms</span>
                        </>
                      ) : (
                        <Badge tone="off">{t("Ще не перевірено", "Nog niet gecontroleerd")}</Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Block>
        </>
      )}

      {section === "tools" && (
        <>
          <PageHead icon={<Wrench />} title={t("Інструменти", "Hulpmiddelen")} lead={t("Тут лише те, що двері справді виконують. «Викликати» відкриває пісочницю з цим інструментом.", "Alleen wat de deur echt uitvoert. Aanroepen opent de zandbak met dat hulpmiddel.")} />
          <Block icon={<Wrench />} title={t("Працює зараз", "Werkt nu")}>
            <ul className="mcp-list">
              {DOOR_TOOLS.map((item) => (
                <li key={item.name} className="mcp-item">
                  <span className="mcp-item-icon" aria-hidden="true"><Terminal /></span>
                  <div className="mcp-item-main"><b>{item.name}</b><span>{t(item.uk, item.nl)}</span></div>
                  <div className="mcp-item-aside"><a className="mcp-btn ghost small" href={`/playground?tool=${item.name}`}>{t("Викликати", "Aanroepen")}</a></div>
                </li>
              ))}
            </ul>
          </Block>
          <Block icon={<Wrench />} title={t("Ще не на дверях", "Nog niet op de deur")} hint={t("Є в каталозі, але ще не доступні через двері.", "Staan al in de catalogus, maar zijn nog niet via de deur bereikbaar.")}>
            <div className="mcp-chips">
              {TOOL_HELP.filter(([name]) => !DOOR_TOOLS.some((item) => item.name === name)).map(([name]) => <span key={name}>{name}</span>)}
            </div>
          </Block>
        </>
      )}

      {section === "board" && (
        <>
          <PageHead
            icon={<ListChecks />}
            title={t("Дошка", "Bord")}
            lead={permsReady && !flags.board ? t("Перемикач «Писати дошку» вимкнено. Нові записи й переміщення відмовляються.", "De schakelaar Bord schrijven staat uit. Nieuwe regels en verplaatsingen worden geweigerd.") : t("Задачі й нотатки зберігаються на сервері й лишаються після оновлення сторінки.", "Taken en notities blijven op de server staan, ook na verversen.")}
          />
          <Block icon={<Plus />} title={t("Нове", "Nieuw")}>
            <form className="mcp-compose" onSubmit={(event) => { event.preventDefault(); if (permsReady && !flags.board) return; void run("save", async () => { await api.post("/api/mcp/board", { ...ctx(), kind, title, body }); setTitle(""); setBody(""); await loadBoard(); }); }}>
              <div className="mcp-compose-row">
                <div className="mcp-choice" role="group" aria-label={t("Тип", "Soort")}>
                  <button type="button" aria-pressed={kind === "task"} onClick={() => setKind("task")}>{t("Задача", "Taak")}</button>
                  <button type="button" aria-pressed={kind === "note"} onClick={() => setKind("note")}>{t("Нотатка", "Notitie")}</button>
                </div>
              </div>
              <input className="mcp-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Назва", "Naam")} aria-label={t("Назва", "Naam")} disabled={permsReady && !flags.board} />
              <textarea className="mcp-input" value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("Текст", "Tekst")} aria-label={t("Текст", "Tekst")} disabled={permsReady && !flags.board} />
              <div className="mcp-compose-row">
                <button type="submit" className="mcp-btn" disabled={permsReady && !flags.board}>{t("Записати", "Opslaan")}</button>
              </div>
            </form>
          </Block>
          <Block icon={<ListChecks />} title={t("Задачі за статусом", "Taken per status")}>
            <div className="mcp-board">
              {statuses.map((status) => {
                const list = tasks.filter((task) => task.status === status);
                return (
                  <div key={status} className="mcp-col">
                    <div className="mcp-col-head"><h3>{wordOf(status)}</h3><span className="mcp-col-count">{list.length}</span></div>
                    {list.length ? list.map((task) => (
                      <div key={task.id} className="mcp-task">
                        <p>{task.title}</p>
                        <div className="mcp-moves">
                          {statuses.filter((next) => next !== status).map((next) => (
                            <button key={next} type="button" className="mcp-move" disabled={permsReady && !flags.board} onClick={() => void run("move", async () => { await api.post("/api/mcp/board", { ...ctx(), kind: "move", id: task.id, status: next }); await loadBoard(); })}>→ {wordOf(next)}</button>
                          ))}
                        </div>
                      </div>
                    )) : <p className="mcp-meta">{t("Порожньо", "Leeg")}</p>}
                  </div>
                );
              })}
            </div>
          </Block>
          <Block icon={<StickyNote />} title={t("Нотатки", "Notities")}>
            {notes.length ? (
              <ul className="mcp-list">
                {notes.map((note) => (
                  <li key={note.id} className="mcp-item">
                    <span className="mcp-item-icon" aria-hidden="true"><StickyNote /></span>
                    <div className="mcp-item-main"><b>{note.title}</b><span>{note.body}</span><small>{note.author} · {note.updatedAt}</small></div>
                  </li>
                ))}
              </ul>
            ) : <Empty icon={<StickyNote />}>{t("Ще немає нотаток. Напишіть одну вище.", "Nog geen notities. Schrijf er hierboven één.")}</Empty>}
          </Block>
        </>
      )}

      {section === "agents" && (
        <McpAgentsHub tr={t} doors={
        <>
          <p className="mcp-lead">{t("Перемикач одразу пише дозвіл на сервер. Під ним написано, що зміниться, якщо його ввімкнути і якщо вимкнути.", "De schakelaar schrijft de toestemming meteen op de server. Eronder staat wat aan- en uitzetten verandert.")}</p>
          {(["agent", "release"] as const).map((group) => {
            const items = permRows().filter((item) => item.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="mcp-group">
                <div className="mcp-group-head"><h3>{group === "agent" ? t("Агенту можна", "De agent mag") : t("Випуск", "Release")}</h3></div>
                <div className="mcp-perms">
                  {items.map((item) => {
                    const on = Boolean(flags[item.id]);
                    return (
                      <div key={item.id} className="mcp-perm">
                        <div className="mcp-perm-text">
                          <h3>
                            {t(item.uk, item.nl)}
                            <Tip text={t(item.detailUk, item.detailNl)} />
                          </h3>
                          <p>{t(item.detailUk, item.detailNl)}</p>
                        </div>
                        <button
                          type="button"
                          className="mcp-toggle"
                          role="switch"
                          aria-checked={on}
                          aria-label={t(item.uk, item.nl)}
                          disabled={Boolean(busy) || !permsReady}
                          onClick={() => void run(item.id, async () => {
                            const enabled = !on;
                            if (enabled && !confirmOn(item.id)) return;
                            const res = await api.post("/api/mcp/permissions", { ...ctx(), id: item.id, enabled });
                            setFlags(res.data.permissions || {});
                            setCatalog(res.data.catalog || []);
                          })}
                        >
                          <i />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {permsReady ? (
            <p className="mcp-now">
              <b>{t("Зараз увімкнено", "Nu aan")}</b>
              <Tip text={t("Це не кнопка і не окремий дозвіл. Рядок лише перелічує те, що зараз увімкнене. Змінюється перемикачами вище.", "Dit is geen knop en geen aparte toestemming. De regel somt alleen op wat nu aan staat. De schakelaars erboven wijzigen dat.")} />
              {permRows().filter((item) => flags[item.id]).map((item) => (
                <span key={item.id} className="mcp-now-item">
                  {t(item.uk, item.nl)}
                  <Tip text={t(item.detailUk, item.detailNl)} />
                </span>
              ))}
              {!permRows().some((item) => flags[item.id]) ? <span>{t("нічого", "niets")}</span> : null}
            </p>
          ) : null}
          <div className="mcp-group">
            <div className="mcp-group-head">
              <h3>{t("Токен агента", "Agenttoken")}</h3>
              <Tip text={t("Окремо від перемикачів. Створює ключ для агента з іменем у полі. Ключ показується один раз і не викладає сайт.", "Los van de schakelaars. Maakt een sleutel voor de agent in het veld. De sleutel verschijnt één keer en plaatst de site niet.")} />
            </div>
            <p className="mcp-lead">{t("Це не викладання сайту. Кнопка створює ключ, яким агент стукає в двері. Сам ключ видно лише одразу після випуску.", "Dit plaatst de site niet. De knop maakt de sleutel waarmee een agent aan de deur klopt. De sleutel zelf is alleen meteen daarna zichtbaar.")}</p>
            <form className="mcp-form" onSubmit={(event) => { event.preventDefault(); void run("issue", async () => { const res = await api.post("/api/mcp/tokens", { ...ctx(), name: agentName }); const issued = String(res.data.token.token || ""); setFresh(issued); try { sessionStorage.setItem("mcp-fresh-token", issued); } catch { /* private mode */ } await loadTokens(); }); }}>
              <input className="mcp-input" value={agentName} onChange={(event) => setAgentName(event.target.value)} placeholder={t("Ім’я агента", "Naam van de agent")} aria-label={t("Ім’я агента", "Naam van de agent")} disabled={permsReady && !flags.tokens} />
              <button type="submit" className="mcp-btn" disabled={permsReady && !flags.tokens}>{t("Випустити токен", "Token uitgeven")}</button>
            </form>
            {fresh ? <pre className="mcp-out" aria-label={t("Новий токен", "Nieuw token")}>{fresh}</pre> : null}
            {tokens.length ? (
              <ul className="mcp-list">
                {tokens.map((row) => (
                  <li key={row.id} className="mcp-item">
                    <span className={`mcp-item-icon${row.revokedAt ? "" : " ok"}`} aria-hidden="true"><KeyRound /></span>
                    <div className="mcp-item-main"><b>{row.name}</b><span className="mcp-url">{row.prefix}…</span></div>
                    <div className="mcp-item-aside">
                      <span className="mcp-meta">{row.calls} {t("викликів", "aanroepen")}</span>
                      <Badge tone={row.revokedAt ? "off" : "ok"}>{row.revokedAt ? t("Відкликано", "Ingetrokken") : t("Чинний", "Geldig")}</Badge>
                      {!row.revokedAt ? <button type="button" className="mcp-btn ghost small" disabled={permsReady && !flags.tokens} onClick={() => void run("revoke", async () => { await api.post("/api/mcp/tokens/revoke", { ...ctx(), id: row.id }); await loadTokens(); })}>{t("Відкликати", "Intrekken")}</button> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty icon={<KeyRound />}>{t("Ще немає токенів. Випустіть токен, щоб агент міг стукати в двері.", "Nog geen tokens. Geef een agent een token om aan de deur te kunnen kloppen.")}</Empty>}
          </div>
        </>
        } />
      )}

      {section === "playground" && (
        <>
          <PageHead icon={<Terminal />} title={t("Пісочниця", "Zandbak")} lead={t("Той самий список, що й на дверях. Вимкнений перемикач дає відмову, а не порожню кнопку.", "Dezelfde lijst als op de deur. Een uitgeschakelde schakelaar weigert, in plaats van een lege knop.")} />
          <div className="mcp-play">
            <nav className="mcp-block mcp-toolnav" aria-label={t("Інструменти", "Hulpmiddelen")}>
              {DOOR_TOOLS.map((item) => (
                <button key={item.name} type="button" className={item.name === tool ? "on" : ""} aria-current={item.name === tool} onClick={() => chooseTool(item.name)}>
                  <b>{item.name}</b>
                  <small>{t(item.uk, item.nl)}</small>
                </button>
              ))}
            </nav>
            <form className="mcp-block" onSubmit={(event) => { event.preventDefault(); void run(tool, async () => { const gate = toolGate(tool); if (permsReady && !flags[gate]) throw new Error(`PERMISSION_OFF:${gate}`); const parsed = args.trim() ? JSON.parse(args) : {}; const res = await api.post("/api/mcp/call", { ...ctx(), name: tool, arguments: parsed }); setOut(JSON.stringify(res.data, null, 2)); }); }}>
              <div className="mcp-block-head">
                <span className="mcp-block-icon" aria-hidden="true"><Terminal /></span>
                <div className="mcp-block-title">
                  <h2>{tool}</h2>
                  {currentTool ? <p>{t(currentTool.uk, currentTool.nl)}</p> : null}
                </div>
              </div>
              <div className="mcp-block-body">
                <label className="mcp-meta" htmlFor="mcp-args">{t("Аргументи (JSON)", "Argumenten (JSON)")}</label>
                <textarea id="mcp-args" className="mcp-input" value={args} onChange={(event) => setArgs(event.target.value)} />
                <div className="mcp-form">
                  <button type="submit" className="mcp-btn" disabled={Boolean(busy) || (permsReady && !flags[toolGate(tool)])}>{t("Викликати", "Aanroepen")}</button>
                </div>
                {out ? <pre className="mcp-out">{out}</pre> : null}
              </div>
            </form>
          </div>
        </>
      )}

      {section === "traffic" && (
        <>
          <PageHead
            icon={<Activity />}
            title={t("Трафік", "Verkeer")}
            lead={t("Кожен виклик агента, найновіший зверху.", "Elke aanroep van een agent, nieuwste boven.")}
            actions={<button type="button" className="mcp-btn ghost" disabled={Boolean(busy)} onClick={() => void run("traffic", loadTraffic)}><RefreshCw />{t("Оновити", "Verversen")}</button>}
          />
          <Block icon={<Activity />} title={t("Журнал", "Logboek")} hint={rows.length ? t(`${rows.length} рядків`, `${rows.length} regels`) : undefined}>
            {rows.length ? (
              <ul className="mcp-list">
                {rows.map((row) => (
                  <li key={row.id} className="mcp-item">
                    <span className={`mcp-item-icon ${row.ok ? "ok" : "bad"}`} aria-hidden="true">{row.ok ? <Check /> : <X />}</span>
                    <div className="mcp-item-main"><b>{row.method}{row.detail ? ` · ${row.detail}` : ""}</b><span>{row.at} · {row.agent}</span></div>
                    <div className="mcp-item-aside">
                      <Badge tone={row.ok ? "ok" : "bad"}>{row.ok ? t("Успішно", "Gelukt") : t("Помилка", "Mislukt")}</Badge>
                      <span className="mcp-meta">{row.transport} · {row.ms} ms</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty icon={<Activity />}>{t("Ще немає трафіку. Щойно агент скористається мостом, це з’явиться тут.", "Nog geen verkeer. Zodra een agent de brug gebruikt, verschijnt het hier.")}</Empty>}
          </Block>
        </>
      )}

      {section === "connect" && (
        <>
          <PageHead icon={<Plug />} title={t("Підключити", "Verbinden")} lead={t("Grok входить через OAuth, токен не потрібен. Токен зі сторінки Агенти працює як Bearer, поки його перемикач увімкнено.", "Grok logt in via OAuth, geen token nodig. Een token van Agenten werkt als Bearer zolang de tokenschakelaar aan staat.")} />
          <Block
            icon={<Link2 />}
            title={t("Адреса", "Adres")}
            actions={<button type="button" className="mcp-btn ghost small" onClick={() => void copyText("url", "https://mcp.tarasevych.com/Grok")}><Copy />{copied === "url" ? t("Скопійовано", "Gekopieerd") : t("Копіювати адресу", "Adres kopiëren")}</button>}
          >
            <pre className="mcp-out">https://mcp.tarasevych.com/Grok</pre>
          </Block>
          <Block
            icon={<Terminal />}
            title={t("MCP-client", "MCP-client")}
            actions={<button type="button" className="mcp-btn ghost small" onClick={() => void copyText("json", connectSample)}><Copy />{copied === "json" ? t("Скопійовано", "Gekopieerd") : t("Копіювати приклад", "Voorbeeld kopiëren")}</button>}
          >
            <pre className="mcp-out">{connectSample}</pre>
          </Block>
          <Block
            icon={<KeyRound />}
            title={t("Bearer voor een agent", "Bearer voor een agent")}
            hint={t("Це ключ зі сторінки Агенти, не пароль сайту. Якщо токен щойно випущено в цьому браузері, він уже підставлений.", "Dit is de sleutel van Agenten, niet het wachtwoord van de site. Als u die net in deze browser hebt uitgegeven, staat hij hier al.")}
            actions={<button type="button" className="mcp-btn ghost small" onClick={() => void copyText("bearer", bearerSample)}><Copy />{copied === "bearer" ? t("Скопійовано", "Gekopieerd") : t("Копіювати заголовок", "Koptekst kopiëren")}</button>}
          >
            <pre className="mcp-out">{bearerSample}</pre>
          </Block>
        </>
      )}

      {section === "roadmap" && (
        <>
          <PageHead icon={<Compass />} title={t("Що далі", "Wat hierna")} lead={t("Проєкт живий. Цей міст — шар, через який агент працює з маєтком, а не через браузер людини.", "Het project leeft. Deze brug is de laag waarmee een agent het domein bedient.")} />
          <div className="mcp-cols">
            <Block tone="ok" icon={<Check />} title={t("Уже є", "Er is al")}>
              <p>{t("Каталог хостів, дошка, токени, журнал, пісочниця, двері /Grok.", "Catalogus, bord, tokens, logboek, zandbak, deur /Grok.")}</p>
            </Block>
            <Block icon={<Rocket />} title={t("Щоб агент дістався живого маєтку", "Om het levende domein te bereiken")}>
              <p>{t("Ідентичності з id, гранти з admin, JSON на api, аудит на dashboard. Без пароля людини.", "Identiteiten uit id, toekenningen uit admin, JSON op api, audit op het dashboard. Zonder wachtwoord van een mens.")}</p>
            </Block>
            <Block tone="bad" icon={<X />} title={t("Чого не треба", "Niet doen")}>
              <p>{t("Не давати агенту логін хаба чи пошти. Не парсити HTML за брамою. Не один пароль на всі моделі.", "Geen login van hub of post aan een agent. Geen HTML achter de poort. Geen enkel wachtwoord voor alle modellen.")}</p>
            </Block>
          </div>
        </>
      )}

      {section === "download" && (
        <>
          <PageHead
            icon={<Archive />}
            title={t("Архів на ПК", "Archief op de pc")}
            lead={t("Один файл з усім сайтом, зашифрований вашим наявним age-ключем.", "Eén bestand met de hele site, versleuteld met uw bestaande age-sleutel.")}
            actions={<button type="button" className="mcp-btn" disabled={Boolean(busy)} onClick={() => void run("archive", downloadArchive)}><Archive />{t("Зібрати повний архів", "Volledig archief maken")}</button>}
          />
          <Block icon={<Archive />} title={archiveTitle} hint={archiveHint || undefined}>
            <p className="mcp-note">{t("Є код і міст MCP, повна база даних із ролями, усі файли користувачів, служби системи, конфіг тунелю та секрети. База, файли й секрети шифруються вашим наявним age-ключем (нового ключа не створюється), тож без вашого herstelsleutel їх не відкрити — навіть якщо файл потрапить до чужих. У файлі лежить скрипт vidnovyty.sh: розгорнути сайт на новій машині (віртуальній чи справжній, x86-64 чи ARM) однією командою. Збір іде потоково: обсяг і різноманітність даних не мають значення, місце на диску перевіряється заздалегідь.", "Inhoud: code en MCP-brug, de volledige database met rollen, alle bestanden van gebruikers, systeemdiensten, tunnelconfiguratie en geheimen. Database, bestanden en geheimen zijn versleuteld met uw bestaande age-sleutel (er komt geen nieuwe sleutel bij), dus zonder uw herstelsleutel niet te openen. In het bestand zit het script vidnovyty.sh: de site op een nieuwe machine (virtueel of fysiek, x86-64 of ARM) terugzetten met één opdracht. Het maken verloopt streamend: omvang en soort data maken niet uit, de schijfruimte wordt vooraf gecontroleerd.")}</p>
            <div className="mcp-bar-row"><span>{t("Загальний хід", "Totale voortgang")}</span><b>{archiveBar}%</b></div>
            <div className="mcp-bar" aria-hidden="true"><i style={{ width: `${archiveBar}%` }} /></div>
            <ol className="mcp-track">
              {ARCHIVE_STEPS.map((step) => {
                const done = archive.state === "ready" || archive.stage > step.n;
                const active = archive.state === "building" && archive.stage === step.n;
                const pct = archive.state === "ready" ? 100 : stepPct(archive.stage, archive.pct, step.n);
                const line = active ? t(step.ukd, step.nld) : done ? t("Готово", "Klaar") : t("Чекає", "Wacht");
                return (
                  <li key={step.n} className={`mcp-track-step${done ? " done" : ""}${active ? " on" : ""}`}>
                    <span className="mcp-rail" />
                    <Ring pct={pct} done={done} n={step.n} />
                    <div>
                      <h3>{step.n}. {t(step.uk, step.nl)}</h3>
                      <p>{line}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {archive.state === "building" && archive.detail ? <p className="mcp-live" role="status" aria-live="polite">▸ {archive.detail}</p> : null}
            {archive.state === "failed" ? <p className="mcp-error" role="alert">{t("Збір зупинився", "Maken gestopt")}: {archive.error}{archive.detail ? ` — ${archive.detail}` : ""}. {t("Нічого на сайті не змінено. Спробуйте ще раз; якщо повторюється — перегляньте journalctl -u mijn-ruimte-archief на сервері.", "Er is niets op de site gewijzigd. Probeer opnieuw; blijft het gebeuren, kijk dan naar journalctl -u mijn-ruimte-archief op de server.")}</p> : null}
            {archive.state === "ready" && archive.bytes ? <p className="mcp-meta">{t("Усередині", "Inhoud")}: {t("код", "code")} {sizeText(archive.kod)}, {t("база (шифр.)", "database (versl.)")} {sizeText(archive.baza)}, {t("файли (шифр.)", "bestanden (versl.)")} {sizeText(archive.fajly)}, {t("секрети (шифр.)", "geheimen (versl.)")} {sizeText(archive.sekrety)}, {t("система", "systeem")} {sizeText(archive.systeem)}. {t("Разом файл", "Totaal")} {sizeText(archive.bytes)}.</p> : null}
            {archive.name ? <p className="mcp-url">{archive.name}</p> : null}
            {archive.name && (archive.state === "ready" || archive.history.some((row) => row.name === archive.name && row.kept)) ? (
              <div className="mcp-form">
                <button type="button" className="mcp-btn ghost" disabled={Boolean(busy)} onClick={() => void run("archive", () => saveBlob(archive.name))}>{archive.state === "ready" ? t("Завантажити архів (оберіть диск і папку)", "Archief downloaden (kies schijf en map)") : t("Завантажити ще раз", "Opnieuw downloaden")}</button>
                {downloaded > 0 ? <span className="mcp-live">{t("записано", "geschreven")} {sizeText(downloaded)}</span> : null}
              </div>
            ) : null}
          </Block>
          <McpBackupsCard tr={t} />
          <Block icon={<History />} title={t("Історія", "Geschiedenis")} hint={t("Кожен рядок — окремий збір. На сервері лишається лише останній файл, щоб старі копії з секретами не накопичувались.", "Elke rij is één keer maken. Op de server blijft alleen het laatste bestand, zodat oude kopieën met geheimen niet blijven liggen.")}>
            {archive.history.length ? (
              <ul className="mcp-list">
                {archive.history.map((row) => (
                  <li key={`${row.at}-${row.name}`} className="mcp-item">
                    <span className={`mcp-item-icon${row.kept ? " ok" : ""}`} aria-hidden="true"><Archive /></span>
                    <div className="mcp-item-main">
                      <b>{whenText(row.at)}</b>
                      <span>{sizeText(row.bytes)}{row.kod ? ` · ${t("код", "code")} ${sizeText(row.kod)} · ${t("база", "database")} ${sizeText(row.baza)} · ${t("файли", "bestanden")} ${sizeText(row.fajly)}` : ""}</span>
                    </div>
                    <div className="mcp-item-aside">
                      {row.kept ? <button type="button" className="mcp-btn ghost small" disabled={Boolean(busy)} onClick={() => void run("archive", () => saveBlob(row.name))}>{t("Завантажити", "Downloaden")}</button> : <Badge tone="off">{t("Файл замінено", "Bestand vervangen")}</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty icon={<History />}>{t("Ще немає жодного архіву. Зберіть перший вище.", "Nog geen archief. Maak hierboven het eerste.")}</Empty>}
          </Block>
        </>
      )}
    </div>
  );
}
