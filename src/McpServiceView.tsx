import { useEffect, useState } from "react";
import { api } from "./platform/client";
import { ecosystemTabContext } from "./tab-context";
import { DOOR_TOOLS, ESTATE, LAYERS, TOOL_HELP } from "./mcp-catalog";
import { ExpertMelding, RichtingBand } from "./weergave/Weergave";
import { useWeergave } from "./weergave/weergave-store";
import { isExpertTab } from "../shared/weergave";
import { isBeheerPagina } from "../shared/beheer-paginas";
import McpAgentsHub from "./McpAgentsHub";
import McpAppsView from "./McpAppsView";
import { foutTekst } from "./agenten/fouten";
import McpConsentModal from "./McpConsentModal";
import McpBackupsCard from "./McpBackupsCard";
import McpServerBeheerCard from "./McpServerBeheerCard";
import DeurSchakelaars from "./agenten/DeurSchakelaars";
import "./mcp-estate.css";

type Lang = "uk" | "nl";
type Props = { lang: Lang; tab: string };
type Probe = { id: string; url: string; ok: boolean; status: number; ms: number; error?: string };
type Task = { id: string; title: string; body: string; status: string };
type Note = { id: string; title: string; body: string; author: string; updatedAt: string };
type LogRow = { id: string; at: string; method: string; detail: string; transport: string; agent: string; ok: boolean; ms: number };

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
/** Nooit een kale code (RATE_LIMITED, …) tonen: vriendelijke UA/NL-tekst met de code klein erachter (RUNBOOK §13.9). */
const fault = (err: unknown, t: (uk: string, nl: string) => string) => foutTekst(err, t);

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
  const section = ["overview", "dashboard", "services", "tools", "board", "agents", "apps", "playground", "traffic", "connect", "roadmap", "download"].includes(tab) ? tab : "overview";
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [probes, setProbes] = useState<Probe[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"task" | "note">("task");
  const [fresh] = useState("");
  const [tool, setTool] = useState(initialTool);
  const [args, setArgs] = useState(() => argsFor(initialTool()));
  const [copied, setCopied] = useState("");
  const [out, setOut] = useState("");
  const [rows, setRows] = useState<LogRow[]>([]);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [permsReady, setPermsReady] = useState(false);
  const [archive, setArchive] = useState<ArchiveState>(emptyArchive);
  const [tick, setTick] = useState(0);
  const weergave = useWeergave();

  async function run(label: string, job: () => Promise<void>) {
    setBusy(label);
    setError("");
    try { await job(); } catch (err) { setError(fault(err, t)); } finally { setBusy(""); }
  }
  async function loadBoard() {
    const res = await api.post("/api/mcp/board/list", ctx());
    setTasks(res.data.tasks || []);
    setNotes(res.data.notes || []);
  }
  async function loadTokens() {
    const perms = await api.post("/api/mcp/permissions", ctx());
    setFlags(perms.data.permissions || {});
    setPermsReady(true);
  }
  async function loadTraffic() {
    const res = await api.post("/api/mcp/traffic", ctx());
    setRows(res.data.log || []);
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
  async function saveBlob() {
    setDownloaded(0);
    // Stap 1 (na step-up, die client.ts zelf vraagt): eenmalige downloadId, 5 minuten geldig. Stap 2: het bestand zelf.
    const dl = (await api.post("/api/mcp/archive/link", ctx())).data as { downloadId: string; name: string; bytes: number };
    const name = String(dl.name || "archief-laatste.tar.age");
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
      body: JSON.stringify({ ...ctx(), downloadId: dl.downloadId }),
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
    // De agentenpagina laadt haar eigen gegevens (tokens via useDeurTokens); hier niet nog eens.
    if (section === "playground") void run(section, loadTokens);
    if (section === "traffic") void run("traffic", loadTraffic);
    if (section === "services" || section === "dashboard") void run("probe", loadProbes);
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

  // Etap 3: «простий/розширений» (alleen weergave). Een onderdeel uit «розширений» via een link: uitleg + één klik, geen inhoud.
  // Beheerpagina's (technische ruimte) volgen de modus простий/розширений niet: die modus is van de accountruimte.
  const verborgen = weergave.modus === "eenvoudig" && isExpertTab("mcp", section) && !isBeheerPagina("mcp", section);
  return (
    <div className="mcp-estate" data-mcp-tab={section} data-weergave-modus={weergave.modus ?? "onbekend"}>
      <McpConsentModal tr={t} />
      {section === "overview" || verborgen ? <RichtingBand richting="mcp" uk={lang === "uk"} metModus /> : null}
      {verborgen ? <ExpertMelding uk={lang === "uk"} /> : <>
      {error && section !== "agents" && section !== "apps" ? <p className="mcp-lead mcp-error" role="alert">{error}</p> : null}
      {busy && busy !== "archive" && section !== "agents" && section !== "apps" ? <p className="mcp-kicker">{busy}</p> : null}

      {section === "overview" && (
        <>
          <header>
            <p className="mcp-kicker">Tarasevych MCP · {t("міст ШІ → сайт", "brug AI → site")}</p>
            <h1>{t("Будь-який агент заходить сюди. Не в браузер.", "Elke agent komt hier binnen. Niet via de browser.")}</h1>
            <p className="mcp-lead">{t("Маєток tarasevych.com уже живий на домашньому вузлі, але за брамою ідентичності. ШІ не може увійти як людина. Цей MCP-міст — машинний контракт: інструменти, ресурси, спільна дошка.", "Het domein leeft al op de thuisknoop, achter de identiteitspoort. Een agent kan niet als mens inloggen. Deze brug is het machinecontract.")}</p>
          </header>
          <section className="mcp-grid2">
            <article className="mcp-card"><h2>11</h2><p>{t("хостів маєтку", "hosts van het domein")}</p></article>
            <article className="mcp-card"><h2>{DOOR_TOOLS.length}</h2><p>{t("інструментів дверей", "hulpmiddelen van de deur")}</p></article>
            <article className="mcp-card"><h2>HTTP</h2><p>{t("JSON-RPC, без SSE", "JSON-RPC, geen SSE")}</p></article>
          </section>
          <section className="mcp-card">
            <h2>{t("Шар мосту", "Laag van de brug")}</h2>
            {LAYERS.map(([title, uk, nl]) => <p key={title}><strong>{title}.</strong> {t(uk, nl)}</p>)}
          </section>
          <section className="mcp-card">
            <h2>{t("Чому агенти не бачать сайт", "Waarom agenten de site niet zien")}</h2>
            <p>{t("Кожен публічний хост відповідає, але id тримає браму. Браузерний логін — для людей. Агенту потрібен контракт: JSON-RPC, скоупи, аудит.", "Elke host antwoordt, maar id houdt de poort. Browserlogin is voor mensen. Een agent heeft een contract nodig.")}</p>
          </section>
          <article className="mcp-card"><h2>{t("Публічне ім’я", "Publieke naam")}</h2><p className="mcp-url">https://mcp.tarasevych.com/Grok</p></article>
          <section className="mcp-grid2">
            {ESTATE.map((row) => (
              <article key={row.id} className="mcp-card">
                <div className="mcp-row"><h2>{t(row.uk, row.nl)}</h2><span className={row.id === "mcp" ? "mcp-badge" : "mcp-badge wait"}>{t(row.statusUk, row.statusNl)}</span></div>
                <p className="mcp-url">{row.url.replace("https://", "")}</p>
                <p>{t(row.roleUk, row.roleNl)}</p>
              </article>
            ))}
          </section>
          <form className="mcp-form" onSubmit={(event) => { event.preventDefault(); void run("probe", loadProbes); }}>
            <button type="submit" disabled={Boolean(busy)}>{t("Перевірити хости", "Hosts controleren")}</button>
          </form>
          {probes.map((row) => <article key={row.id} className="mcp-card"><div className="mcp-row"><h2>{row.id}</h2><span className={row.ok ? "mcp-badge" : "mcp-badge wait"}>HTTP {row.status || "—"}</span></div><p className="mcp-url">{row.url}</p></article>)}
        </>
      )}

      {section === "dashboard" && (
        <>
          <header>
            <h1>{t("Панель розгортання", "Deploy-dashboard")}</h1>
            <p className="mcp-lead">{t("Стан сервера, історія випусків і відкат однією кнопкою. Дії, що щось змінюють, вимагають підтвердження passkey. Сервер встановлює лише випуски, підписані вашим ключем.", "Serverstatus, releasegeschiedenis en terugdraaien met één knop. Acties die iets wijzigen vragen een passkey-bevestiging. De server installeert alleen releases die met uw sleutel zijn ondertekend.")}</p>
            <form className="mcp-form" onSubmit={(event) => { event.preventDefault(); void run("probe", loadProbes); }}>
              <button type="submit" disabled={Boolean(busy)}>{t("Перевірити хости", "Hosts controleren")}</button>
            </form>
          </header>
          <McpServerBeheerCard tr={t} />
          <DeurSchakelaars tr={t} />
          <article className="mcp-card">
            <div className="mcp-row"><h2>{t("Здоров’я сервісів", "Gezondheid van de diensten")}</h2><span className="mcp-kicker">{probes.length ? `${probes.filter((p) => p.ok).length}/${probes.length}` : t("перевіряю…", "controleren…")}</span></div>
            <ul className="mbk-files">
              {ESTATE.map((row) => { const probe = probes.find((item) => item.id === row.id); return (
                <li key={row.id}><span className={probe?.ok ? "mcp-badge" : "mcp-badge wait"}>{probe ? `HTTP ${probe.status || "—"}` : "—"}</span><span><b>{t(row.uk, row.nl)}</b><small><a href={row.url} target="_blank" rel="noreferrer">{row.url}</a></small></span></li>
              ); })}
            </ul>
          </article>
        </>
      )}

      {section === "services" && (
        <>
          <header>
            <h1>{t("Сервіси", "Diensten")}</h1>
            <p className="mcp-lead">{t("Статус береться з живої перевірки, не з зашитого значка. Посилання відкриває хост.", "De status komt uit een echte controle, niet uit een vaste badge. De link opent de host.")}</p>
            <form className="mcp-form" onSubmit={(event) => { event.preventDefault(); void run("probe", loadProbes); }}>
              <button type="submit" disabled={Boolean(busy)}>{t("Перевірити хости", "Hosts controleren")}</button>
            </form>
          </header>
          {ESTATE.map((row) => {
            const probe = probes.find((item) => item.id === row.id);
            return (
              <article key={row.id} className="mcp-card">
                <div className="mcp-row">
                  <h2>{t(row.uk, row.nl)}</h2>
                  <span className={probe?.ok ? "mcp-badge" : "mcp-badge wait"}>{probe ? `HTTP ${probe.status || "—"}` : t("ще не перевірено", "nog niet gecontroleerd")}</span>
                </div>
                <p className="mcp-url"><a href={row.url} target="_blank" rel="noreferrer">{row.url}</a></p>
                <p>{t(row.roleUk, row.roleNl)}</p>
              </article>
            );
          })}
        </>
      )}

      {section === "tools" && (
        <>
          <header><h1>{t("Інструменти", "Hulpmiddelen")}</h1><p className="mcp-lead">{t("Тут лише те, що двері справді виконують. «Викликати» відкриває пісочницю саме з цим інструментом.", "Alleen wat de deur echt uitvoert. Aanroepen opent de zandbak met dat hulpmiddel.")}</p></header>
          {DOOR_TOOLS.map((item) => (
            <article key={item.name} className="mcp-card">
              <div className="mcp-row"><h2>{item.name}</h2><a href={`/playground?tool=${item.name}`}>{t("Викликати", "Aanroepen")}</a></div>
              <p>{t(item.uk, item.nl)}</p>
            </article>
          ))}
          <article className="mcp-card">
            <h2>{t("Ще не на дверях", "Nog niet op de deur")}</h2>
            <p>{TOOL_HELP.filter(([name]) => !DOOR_TOOLS.some((item) => item.name === name)).map(([name]) => name).join(", ")}</p>
          </article>
        </>
      )}

      {section === "board" && (
        <>
          <header><h1>{t("Дошка", "Bord")}</h1><p className="mcp-lead">{permsReady && !flags.board ? t("Перемикач «Писати дошку» вимкнено. Нові записи й переміщення відмовляються.", "De schakelaar Bord schrijven staat uit. Nieuwe regels en verplaatsingen worden geweigerd.") : t("Ваші власні задачі й нотатки. Вони зберігаються в базі даних і видні лише вам.", "Uw eigen taken en notities. Ze staan in de database en alleen u ziet ze.")}</p></header>
          <form className="mcp-form" onSubmit={(event) => { event.preventDefault(); if (permsReady && !flags.board) return; void run("save", async () => { await api.post("/api/mcp/board", { ...ctx(), kind, title, body }); setTitle(""); setBody(""); await loadBoard(); }); }}>
            <button type="button" className={kind === "task" ? "on" : ""} onClick={() => setKind("task")}>{t("Задача", "Taak")}</button>
            <button type="button" className={kind === "note" ? "on" : ""} onClick={() => setKind("note")}>{t("Нотатка", "Notitie")}</button>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Назва", "Naam")} disabled={permsReady && !flags.board} />
            <textarea data-concept="mcp-bord" value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("Текст", "Tekst")} disabled={permsReady && !flags.board} />
            <button type="submit" disabled={permsReady && !flags.board}>{t("Записати", "Opslaan")}</button>
          </form>
          <section className="mcp-board">
            {statuses.map((status) => (
              <article key={status} className="mcp-card">
                <h2>{status}</h2>
                {tasks.filter((task) => task.status === status).map((task) => (
                  <div key={task.id}>
                    <p>{task.title}</p>
                    {statuses.filter((next) => next !== status).map((next) => (
                      <button key={next} type="button" disabled={permsReady && !flags.board} onClick={() => void run("move", async () => { await api.post("/api/mcp/board", { ...ctx(), kind: "move", id: task.id, status: next }); await loadBoard(); })}>{next}</button>
                    ))}
                  </div>
                ))}
              </article>
            ))}
          </section>
          {notes.map((note) => <article key={note.id} className="mcp-card"><h2>{note.title}</h2><p>{note.body}</p><p className="mcp-url">{note.author} · {note.updatedAt}</p></article>)}
        </>
      )}

      {section === "agents" && (
        <McpAgentsHub tr={t} />
      )}

      {section === "apps" && <McpAppsView lang={lang} />}

      {section === "playground" && (
        <>
          <header><h1>{t("Пісочниця", "Zandbak")}</h1><p className="mcp-lead">{t("Список збігається з дверима. Аргументи підставляються самі. Вимкнений перемикач дає відмову, а не порожню кнопку.", "De lijst is dezelfde als op de deur. Argumenten worden ingevuld. Een uitgeschakelde schakelaar weigert, in plaats van een lege knop.")}</p></header>
          <div className="mcp-split-tools">
            <div className="mcp-card mcp-toolnav">
              {DOOR_TOOLS.map((item) => (
                <button key={item.name} type="button" className={item.name === tool ? "on" : ""} onClick={() => chooseTool(item.name)}>
                  {item.name}
                  <small>{t(item.uk, item.nl)}</small>
                </button>
              ))}
            </div>
            <form className="mcp-card" onSubmit={(event) => { event.preventDefault(); void run(tool, async () => { const gate = toolGate(tool); if (permsReady && !flags[gate]) throw new Error(`PERMISSION_OFF:${gate}`); const parsed = args.trim() ? JSON.parse(args) : {}; const res = await api.post("/api/mcp/call", { ...ctx(), name: tool, arguments: parsed }); setOut(JSON.stringify(res.data, null, 2)); }); }}>
              <p className="mcp-url">{tool}</p>
              <textarea value={args} onChange={(event) => setArgs(event.target.value)} />
              <button type="submit" disabled={Boolean(busy) || (permsReady && !flags[toolGate(tool)])}>{t("Викликати", "Aanroepen")}</button>
              {out ? <pre className="mcp-out">{out}</pre> : null}
            </form>
          </div>
        </>
      )}

      {section === "traffic" && (
        <>
          <header><h1>{t("Трафік", "Verkeer")}</h1><button type="button" onClick={() => void run("traffic", loadTraffic)}>{t("Оновити", "Verversen")}</button></header>
          {rows.map((row) => <article key={row.id} className="mcp-card"><div className="mcp-row"><h2>{row.method} {row.detail}</h2><span className={row.ok ? "mcp-badge" : "mcp-badge wait"}>{row.transport} · {row.ms}ms</span></div><p className="mcp-url">{row.at} · {row.agent}</p></article>)}
        </>
      )}

      {section === "connect" && (
        <>
          <header><h1>{t("Підключити", "Verbinden")}</h1><p className="mcp-lead">{t("Grok входить через OAuth на /Grok і токен моста не потрібен. Токен зі сторінки Агенти теж приймається як Bearer, поки перемикач токенів увімкнено.", "Grok komt via OAuth op /Grok binnen en heeft geen brugtoken nodig. Een token van Agenten werkt ook als Bearer, zolang de tokenschakelaar aan staat.")}</p></header>
          <article className="mcp-card">
            <h2>https://mcp.tarasevych.com/Grok</h2>
            <form className="mcp-form"><button type="button" onClick={() => void copyText("url", "https://mcp.tarasevych.com/Grok")}>{copied === "url" ? t("Скопійовано", "Gekopieerd") : t("Копіювати адресу", "Adres kopiëren")}</button></form>
          </article>
          <article className="mcp-card">
            <h2>{t("Клієнт MCP", "MCP-client")}</h2>
            <pre className="mcp-out">{connectSample}</pre>
            <form className="mcp-form"><button type="button" onClick={() => void copyText("json", connectSample)}>{copied === "json" ? t("Скопійовано", "Gekopieerd") : t("Копіювати приклад", "Voorbeeld kopiëren")}</button></form>
          </article>
          <article className="mcp-card">
            <h2>{t("Bearer для агента", "Bearer voor een agent")}</h2>
            <p>{t("Це ключ зі сторінки Агенти, не пароль сайту. Якщо токен щойно випущено в цьому браузері, він уже підставлений.", "Dit is de sleutel van Agenten, niet het wachtwoord van de site. Als u die net in deze browser hebt uitgegeven, staat hij hier al.")}</p>
            <pre className="mcp-out">{bearerSample}</pre>
            <form className="mcp-form"><button type="button" onClick={() => void copyText("bearer", bearerSample)}>{copied === "bearer" ? t("Скопійовано", "Gekopieerd") : t("Копіювати заголовок", "Koptekst kopiëren")}</button></form>
          </article>
        </>
      )}

      {section === "roadmap" && (
        <>
          <header><h1>{t("Що далі", "Wat hierna")}</h1><p className="mcp-lead">{t("Проєкт живий. Цей міст — шар, через який агент працює з маєтком, а не через браузер людини.", "Het project leeft. Deze brug is de laag waarmee een agent het domein bedient.")}</p></header>
          <article className="mcp-card"><h2>{t("Уже є", "Er is al")}</h2><p>{t("Каталог хостів, дошка, токени, журнал, пісочниця, двері /Grok.", "Catalogus, bord, tokens, logboek, zandbak, deur /Grok.")}</p></article>
          <article className="mcp-card"><h2>{t("Щоб агент дістався живого маєтку", "Om het levende domein te bereiken")}</h2><p>{t("Ідентичності з id, гранти з admin, JSON на api, аудит на dashboard. Без пароля людини.", "Identiteiten uit id, toekenningen uit admin, JSON op api, audit op het dashboard. Zonder wachtwoord van een mens.")}</p></article>
          <article className="mcp-card"><h2>{t("Чого не треба", "Niet doen")}</h2><p>{t("Не давати агенту логін хаба чи пошти. Не парсити HTML за брамою. Не один пароль на всі моделі.", "Geen login van hub of post aan een agent. Geen HTML achter de poort. Geen enkel wachtwoord voor alle modellen.")}</p></article>
        </>
      )}

      {section === "download" && (
        <>
          <header>
            <h1>{t("Архів на ПК", "Archief op de pc")}</h1>
            <p className="mcp-lead">{t("Один файл із усім, на чому працює сайт: код і міст MCP, повна база даних із ролями, усі файли користувачів, служби системи, конфіг тунелю та секрети. Увесь файл цілком шифрується вашим наявним age-ключем (нового ключа не створюється): без вашого herstelsleutel його не відкрити, навіть якщо він потрапить до чужих. Після розшифрування всередині лежить скрипт vidnovyty.sh, щоб розгорнути сайт на новій машині однією командою. Завантаження — лише власнику, після повторного підтвердження входу, через одноразове посилання на 5 хвилин.", "Eén bestand met alles waarop de site draait: code en MCP-brug, de volledige database met rollen, alle bestanden van gebruikers, systeemdiensten, tunnelconfiguratie en geheimen. Het hele bestand is versleuteld met uw bestaande age-sleutel (er komt geen nieuwe sleutel bij): zonder uw herstelsleutel is het niet te openen, ook niet als het in verkeerde handen valt. Na ontsleutelen zit het script vidnovyty.sh erin om de site op een nieuwe machine met één opdracht terug te zetten. Downloaden kan alleen de eigenaar, na een nieuwe bevestiging van de aanmelding, via een eenmalige link van 5 minuten.")}</p>
          </header>
          <form className="mcp-form">
            <button type="button" disabled={Boolean(busy)} onClick={() => void run("archive", downloadArchive)}>{t("Зібрати повний архів", "Volledig archief maken")}</button>
          </form>
          <article className="mcp-card mcp-archive">
            <div className="mcp-archive-top">
              <h2>{archive.state === "ready" ? t("Архів готовий", "Archief klaar") : archive.state === "failed" ? t("Збір зупинився", "Maken gestopt") : archive.state === "building" ? t("Збираю повний архів", "Volledig archief maken") : t("Ще не запускали", "Nog niet gestart")}</h2>
              <p className="mcp-kicker">{archive.state === "building" && archive.started ? `${t("Минуло", "Verstreken")} ${clock(Date.now() - new Date(archive.started).getTime() + (tick >= 0 ? 0 : 0))}${remain(archive.started, archive.pct) ? ` · ${t("ще", "nog")} ~${remain(archive.started, archive.pct)}` : ""}` : archive.bytes ? sizeText(archive.bytes) : ""}</p>
            </div>
            <div className="mcp-bar-row"><span>{t("Загальний хід", "Totale voortgang")}</span><b>{archive.state === "ready" ? 100 : Math.max(archive.state === "building" ? 4 : 0, archive.pct || 0)}%</b></div>
            <div className="mcp-bar" aria-hidden="true"><i style={{ width: `${archive.state === "ready" ? 100 : Math.max(archive.state === "building" ? 4 : 0, archive.pct)}%` }} /></div>
            <ol className="mcp-steps">
              {ARCHIVE_STEPS.map((step) => {
                const done = archive.state === "ready" || archive.stage > step.n;
                const active = archive.state === "building" && archive.stage === step.n;
                const pct = archive.state === "ready" ? 100 : stepPct(archive.stage, archive.pct, step.n);
                const line = active ? t(step.ukd, step.nld) : done ? t("Готово", "Klaar") : t("Чекає", "Wacht");
                return (
                  <li key={step.n} className={`mcp-step${done ? " done" : ""}${active ? " on" : ""}`}>
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
            {archive.state === "ready" && archive.bytes ? <p>{t("Усередині", "Inhoud")}: {t("код", "code")} {sizeText(archive.kod)}, {t("база (шифр.)", "database (versl.)")} {sizeText(archive.baza)}, {t("файли (шифр.)", "bestanden (versl.)")} {sizeText(archive.fajly)}, {t("секрети (шифр.)", "geheimen (versl.)")} {sizeText(archive.sekrety)}, {t("система", "systeem")} {sizeText(archive.systeem)}. {t("Разом файл", "Totaal")} {sizeText(archive.bytes)}.</p> : null}
            {archive.name ? <p className="mcp-url">{archive.name}</p> : null}
            {archive.name && (archive.state === "ready" || archive.history.some((row) => row.name === archive.name && row.kept)) ? (
              <form className="mcp-form">
                <button type="button" className="mcp-ghost" disabled={Boolean(busy)} onClick={() => void run("archive", () => saveBlob())}>{archive.state === "ready" ? t("Завантажити архів (оберіть диск і папку)", "Archief downloaden (kies schijf en map)") : t("Завантажити ще раз", "Opnieuw downloaden")}</button>
                {downloaded > 0 ? <small className="mcp-live"> {t("записано", "geschreven")} {sizeText(downloaded)}</small> : null}
              </form>
            ) : null}
          </article>
          <McpBackupsCard tr={t} />
          <McpServerBeheerCard tr={t} />
          <article className="mcp-card">
            <h2>{t("Історія", "Geschiedenis")}</h2>
            <p>{t("Кожен рядок — окремий збір. На сервері лишається лише останній файл, щоб старі копії з секретами не накопичувались. Старі рядки лишаються як запис: коли і якого розміру.", "Elke rij is één keer maken. Op de server blijft alleen het laatste bestand, zodat oude kopieën met geheimen niet blijven liggen. Oudere rijen blijven als notitie: wanneer en hoe groot.")}</p>
            {archive.history.length ? (
              <ul className="mcp-history">
                {archive.history.map((row) => (
                  <li key={`${row.at}-${row.name}`}>
                    <span><b>{whenText(row.at)}</b><small>{sizeText(row.bytes)}{row.kod ? ` · ${t("код", "code")} ${sizeText(row.kod)} · ${t("база", "database")} ${sizeText(row.baza)} · ${t("файли", "bestanden")} ${sizeText(row.fajly)}` : ""}</small></span>
                    {row.kept ? <button type="button" className="mcp-ghost" disabled={Boolean(busy)} onClick={() => void run("archive", () => saveBlob())}>{t("Завантажити", "Downloaden")}</button> : <small>{t("файл уже замінено", "bestand vervangen")}</small>}
                  </li>
                ))}
              </ul>
            ) : <p>{t("Ще немає жодного зібраного архіву в цьому журналі.", "Nog geen archief in dit logboek.")}</p>}
          </article>
        </>
      )}
      </>}
    </div>
  );
}
