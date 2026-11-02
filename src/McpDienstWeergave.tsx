import { useEffect, useState, type ReactNode } from "react";
import { Activity, Archive, Check, Compass, Copy, FileArchive, Globe, History, Layers, LayoutDashboard, Link2, ListChecks, Plug, Plus, Server, ShieldCheck, StickyNote, Terminal, Wrench, X } from "lucide-react";
import { api, ApiError } from "./platform/client";
import { RuimteGeslotenVlak, RuimteStrook } from "./RuimteStrook";
import { ruimteFeitenUit, ruimteGeslotenUit, type RuimteFeiten, type RuimteGesloten } from "../shared/ruimte-weergave";
import { canonicalNavigationUrl } from "./canoniek-navigatie";
import { techActief, useTech } from "./tech/tech-opslag";
import { mcpIngang } from "../shared/ai-agent-bord";
import { MCP_BASIS, OUD_GEDEELD_URL, V2_AGENTEN, agentUrl } from "../shared/connector-v2/agenten";
import { ecosystemTabContext } from "./tab-context";
import { DOOR_TOOLS, ESTATE, LAYERS, TOOL_HELP } from "./mcp-catalogus";
import { ExpertMelding, RichtingBand } from "./weergave/Weergave";
import { useWeergave } from "./weergave/weergave-opslag";
import { isExpertTab } from "../shared/weergave";
import { isBeheerPagina } from "../shared/beheer-paginas";
import McpAgentsHub from "./McpAgentenHub";
import McpAppsView from "./McpAppsWeergave";
import { foutTekst } from "./agenten/fouten";
import McpConsentModal from "./McpToestemmingVenster";
import McpBackupsCard from "./McpBackupsKaart";
import McpServerBeheerCard from "./McpServerBeheerKaart";
import DeurSchakelaars from "./agenten/DeurSchakelaars";
import AgentLogo from "./agenten/AgentLogo";
import "./mcp-domein.css";

type Lang = "uk" | "nl";
type Props = { lang: Lang; tab: string };
type Probe = { id: string; url: string; ok: boolean; status: number; ms: number; error?: string };
type Task = { id: string; title: string; body: string; status: string };
type Note = { id: string; title: string; body: string; author: string; updatedAt: string };
type LogRow = { id: string; at: string; method: string; detail: string; transport: string; agent: string; ok: boolean; ms: number };
type Tone = "ok" | "wait" | "bad" | "off";

const statuses = ["backlog", "doing", "blocked", "done"] as const;
/** MCP-02: kolomnamen en knoppen «→ …» van het bord in gewone taal (uk/nl), niet de rauwe sleutels aan elkaar. */
const STATUS_TEKST: Record<typeof statuses[number], [string, string]> = { backlog: ["Черга", "Wachtrij"], doing: ["У роботі", "Bezig"], blocked: ["Заблоковано", "Geblokkeerd"], done: ["Готово", "Klaar"] };
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
/** Lege staat: zegt wat er nog niet is en wat de volgende stap is, zodat de pagina niet leeg lijkt. */
function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="mcp-empty">{icon}<p>{children}</p></div>;
}
/** Eén getal met een korte uitleg eronder. */
function Stat({ value, label }: { value: ReactNode; label: string }) {
  return <div className="mcp-stat"><strong>{value}</strong><span>{label}</span></div>;
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

/**
 * Adres van een vaste doorverwijzing van mcp.* (mcpIngang), MET behoud van `?consent=<id>`.
 *
 * Waarom apart en puur: de serverdeur en /oauth/authorize sturen de mens naar een adres met `?consent=…`; canonicalNavigationUrl
 * bouwt een schoon adres zonder querystring. Ging die parameter verloren, dan was het verzoek alleen nog uit localStorage te
 * halen (mcp-consent-store) en waren terug/vooruit en een tweede verzoek in dezelfde sessie stuk. Andere queryparameters nemen we
 * NIET mee: die horen bij de oude pagina.
 */
export function ingangAdres(basis: string, hash: string, search: string): string {
  const url = new URL(basis.replace(/#.*$/, ""));
  let rid = "";
  try { rid = new URLSearchParams(search).get("consent") || ""; } catch { rid = ""; }
  if (rid) url.searchParams.set("consent", rid);
  return hash ? `${url.toString()}#${hash}` : url.toString();
}

export default function McpServiceView({ lang, tab }: Props) {
  const t = (uk: string, nl: string) => (lang === "uk" ? uk : nl);
  const section = ["overview", "dashboard", "services", "tools", "board", "agents", "apps", "playground", "traffic", "connect", "roadmap", "download", "verbindingen"].includes(tab) ? tab : "overview";
  const tech = useTech();
  const consent = typeof location !== "undefined" && new URLSearchParams(location.search).has("consent");
  // Hub «Підключення ШІ» (19.10.2026): mcp.*/agents is voor iedereen de ene plek (ook #extension, ?extension=welcome); de extensie
  // staat daar op het eigen tabblad, voor gewone gebruikers zonder technisch profiel. mcp.*/verbindingen → #technisch van de hub.
  // Wacht niet op de techstatus voor de vaste doorverwijzingen (verbindingen, overzicht); alleen «andere tabbladen» hangen ervan af.
  const vast = section === "verbindingen" || section === "overview" || section === "connect";
  const ingang = tech.geladen || vast ? mcpIngang(section, techActief(tech), consent) : null;
  const ingangSleutel = ingang ? `${ingang.service}/${ingang.tab}#${ingang.hash}` : "";
  useEffect(() => {
    if (!ingangSleutel) return;
    const [pad, hash] = ingangSleutel.split("#");
    const [doel, doelTab] = pad.split("/") as ["mcp", string];
    // `?consent=<id>` moet de omleiding overleven (zie ingangAdres): mcp.*/verbindingen?consent=… bestaat alleen nog als tab
    // «Технічне» van de hub, en het toestemmingsvenster moet daar hetzelfde verzoek blijven zien.
    location.replace(ingangAdres(canonicalNavigationUrl(doel, doelTab, lang === "nl" ? "nl" : "uk"), hash, location.search));
  }, [ingangSleutel, lang]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [probes, setProbes] = useState<Probe[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  /** In welke gegevenslade staat het bord nu, en waarom is het eventueel dicht (0086). */
  const [ruimte, setRuimte] = useState<RuimteFeiten | null>(null);
  const [bordDicht, setBordDicht] = useState<RuimteGesloten | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"task" | "note">("task");
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
  /**
   * Het bord leest uit ÉÉN gegevenslade (0086). Weigert de poort (dienst uit, nog niets gekozen, bevroren), dan komt er geen
   * leeg bord maar de uitleg van de poort in beeld — in beide talen, zoals de eigenaar vroeg.
   */
  async function loadBoard() {
    try {
      const res = await api.post("/api/mcp/board/list", ctx());
      setTasks(res.data.tasks || []);
      setNotes(res.data.notes || []);
      setRuimte(ruimteFeitenUit(res.data));
      setBordDicht(null);
    } catch (err) {
      const dicht = ruimteGeslotenUit(err instanceof ApiError ? err.response?.data : null);
      if (!dicht) throw err;
      setTasks([]); setNotes([]); setRuimte(null); setBordDicht(dicht);
    }
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
  // EEN ШІ — ОДНА АДРЕСА: het voorbeeld toont het adres van één agent, niet het oude gedeelde adres. 20.10.2026: de kaart «Bearer
  // voor een agent» (token met de hand plakken) is weg — waar OAuth bestaat is dat de oude weg; wie echt een token nodig heeft, vindt
  // die op de plek van zijn AI in de hub (#agent/<slug> → «Прямий токен»).
  const connectSample = `{
  "mcpServers": {
    "mijn-ruimte": {
      "url": "${agentUrl('claude')}"
    }
  }
}`;

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
  if (ingang) return <p className="mcp-lead">{t("Переходимо до підключень ШІ…", "Door naar de AI-koppelingen…")}</p>;

  /**
   * Lijst met de hosts van het domein. `zonderProbe` bepaalt de badge zolang er nog niet gecontroleerd is; zodra er een
   * controle is, toont de badge gewoon «bereikbaar» of «niet bereikbaar» met de HTTP-code erbij.
   */
  const hostRijen = (zonderProbe: (row: (typeof ESTATE)[number]) => { tone: Tone; label: string }, metAdres: boolean) => (
    <ul className="mcp-list">
      {ESTATE.map((row) => {
        const probe = probes.find((item) => item.id === row.id);
        const leeg = zonderProbe(row);
        return (
          <li key={row.id} className="mcp-item" data-host={row.id}>
            <span className={`mcp-item-icon${probe ? (probe.ok ? " ok" : " bad") : ""}`} aria-hidden="true">{probe ? (probe.ok ? <Check /> : <X />) : <Globe />}</span>
            <div className="mcp-item-main">
              <b>{t(row.uk, row.nl)}</b>
              <span>{t(row.roleUk, row.roleNl)}</span>
              {metAdres ? <a className="mcp-url" href={row.url} target="_blank" rel="noreferrer">{row.url.replace("https://", "")}</a> : null}
            </div>
            <div className="mcp-item-aside">
              {probe
                ? <Badge tone={probe.ok ? "ok" : "bad"}>{probe.ok ? t("доступно", "bereikbaar") : t("недоступно", "niet bereikbaar")} · HTTP {probe.status || "—"}</Badge>
                : <Badge tone={leeg.tone}>{leeg.label}</Badge>}
            </div>
          </li>
        );
      })}
    </ul>
  );
  const bevestigd = probes.filter((p) => p.ok).length;

  return (
    <div className="mcp-estate" data-mcp-tab={section} data-weergave-modus={weergave.modus ?? "onbekend"}>
      {/* De ruimte van het toestemmingsvenster komt NIET van de pagina maar van de levende staat van het technisch profiel
          (src/McpToestemmingVenster.tsx). Een pagina-afhankelijke ruimte liet het venster rondlopen zodra «Технічні підключення»
          een tab van de hub werd in plaats van een eigen adres. */}
      <McpConsentModal tr={t} />
      {section === "overview" || verborgen ? <RichtingBand richting="mcp" uk={lang === "uk"} metModus /> : null}
      {verborgen ? <ExpertMelding uk={lang === "uk"} /> : <>
      {error && section !== "agents" && section !== "apps" ? <p className="mcp-error" role="alert">{error}</p> : null}
      {busy && busy !== "archive" && section !== "agents" && section !== "apps" ? <p className="mcp-meta" role="status">{busy}</p> : null}

      {section === "overview" && (
        <>
          <PageHead
            icon={<LayoutDashboard />}
            kicker={`Tarasevych MCP · ${t("міст ШІ → сайт", "brug AI → site")}`}
            title={t("Будь-який агент заходить сюди. Не в браузер.", "Elke agent komt hier binnen. Niet via de browser.")}
            lead={t("Маєток tarasevych.com уже живий на домашньому вузлі, але за брамою ідентичності. ШІ не може увійти як людина. Цей MCP-міст — машинний контракт: інструменти, ресурси, спільна дошка.", "Het domein leeft al op de thuisknoop, achter de identiteitspoort. Een agent kan niet als mens inloggen. Deze brug is het machinecontract.")}
          />
          <div className="mcp-stats">
            <Stat value="11" label={t("хостів маєтку", "hosts van het domein")} />
            <Stat value={DOOR_TOOLS.length} label={t("інструментів дверей", "hulpmiddelen van de deur")} />
            <Stat value="HTTP" label={t("JSON-RPC, без SSE", "JSON-RPC, geen SSE")} />
          </div>
          <Block icon={<Layers />} title={t("Шар мосту", "Laag van de brug")} hint={t("Із чого складається brug, van binnen naar buiten.", "Waaruit de brug bestaat, van binnen naar buiten.")}>
            <ul className="mcp-list">
              {LAYERS.map(([name, uk, nl]) => (
                <li key={name} className="mcp-item">
                  <span className="mcp-item-icon" aria-hidden="true"><Layers /></span>
                  <div className="mcp-item-main"><b>{name}</b><span>{t(uk, nl)}</span></div>
                </li>
              ))}
            </ul>
          </Block>
          <Block icon={<ShieldCheck />} title={t("Чому агенти не бачать сайт", "Waarom agenten de site niet zien")}>
            <p>{t("Кожен публічний хост відповідає, але id тримає браму. Браузерний логін — для людей. Агенту потрібен контракт: JSON-RPC, скоупи, аудит.", "Elke host antwoordt, maar id houdt de poort. Browserlogin is voor mensen. Een agent heeft een contract nodig.")}</p>
          </Block>
          <Block icon={<Link2 />} title={t("Публічне ім’я", "Publieke naam")} hint={t("Адреса конектора: кожен ШІ має власну.", "Elke AI heeft een eigen connectoradres.")}>
            <p className="mcp-url">{MCP_BASIS}</p>
            <p>{t(`Адреса конектора — у кожного ШІ своя: ${V2_AGENTEN.map((a) => `/${a.slug}`).join(", ")}.`, `Het connectoradres is per AI: ${V2_AGENTEN.map((a) => `/${a.slug}`).join(", ")}.`)}</p>
          </Block>
          <Block
            icon={<Server />}
            title={t("Хости маєтку", "Hosts van het domein")}
            hint={probes.length ? `${bevestigd}/${probes.length} ${t("доступно", "bereikbaar")}` : t("Ще не перевірено. Натисніть кнопку, щоб перевірити хости.", "Nog niet gecontroleerd. Druk op de knop om de hosts te testen.")}
            actions={<button type="button" className="mcp-btn ghost small" disabled={Boolean(busy)} onClick={() => void run("probe", loadProbes)}>{t("Перевірити хости", "Hosts controleren")}</button>}
          >
            {hostRijen((row) => ({ tone: row.id === "mcp" ? "ok" : "wait", label: t(row.statusUk, row.statusNl) }), false)}
          </Block>
        </>
      )}

      {section === "dashboard" && (
        <>
          <PageHead
            icon={<Server />}
            title={t("Панель розгортання", "Deploy-dashboard")}
            lead={t("Стан сервера, історія випусків і відкат однією кнопкою. Дії, що щось змінюють, вимагають підтвердження passkey. Сервер встановлює лише випуски, підписані вашим ключем.", "Serverstatus, releasegeschiedenis en terugdraaien met één knop. Acties die iets wijzigen vragen een passkey-bevestiging. De server installeert alleen releases die met uw sleutel zijn ondertekend.")}
          />
          <McpServerBeheerCard tr={t} />
          <DeurSchakelaars tr={t} />
          <Block
            icon={<ShieldCheck />}
            title={t("Здоров’я сервісів", "Gezondheid van de diensten")}
            hint={probes.length ? `${bevestigd}/${probes.length} ${t("доступно", "bereikbaar")}` : t("Nog niet gecontroleerd.", "Nog niet gecontroleerd.")}
            actions={<button type="button" className="mcp-btn ghost small" disabled={Boolean(busy)} onClick={() => void run("probe", loadProbes)}>{t("Перевірити хости", "Hosts controleren")}</button>}
          >
            {hostRijen((row) => ({ tone: row.id === "mcp" ? "ok" : "wait", label: t("ще не перевірено", "nog niet gecontroleerd") }), false)}
          </Block>
        </>
      )}

      {section === "services" && (
        <>
          <PageHead
            icon={<Globe />}
            title={t("Сервіси", "Diensten")}
            lead={t("Статус береться з живої перевірки, не з зашитого значка. Посилання відкриває хост.", "De status komt uit een echte controle, niet uit een vaste badge. De link opent de host.")}
            actions={<button type="button" className="mcp-btn small" disabled={Boolean(busy)} onClick={() => void run("probe", loadProbes)}>{t("Перевірити хости", "Hosts controleren")}</button>}
          />
          <Block icon={<Globe />} title={t("Усі хости", "Alle hosts")} hint={probes.length ? `${bevestigd}/${probes.length} ${t("доступно", "bereikbaar")}` : undefined}>
            {hostRijen(() => ({ tone: "off", label: t("ще не перевірено", "nog niet gecontroleerd") }), true)}
          </Block>
        </>
      )}

      {section === "tools" && (
        <>
          <PageHead
            icon={<Wrench />}
            title={t("Інструменти", "Hulpmiddelen")}
            lead={t("Тут лише те, що двері справді виконують. «Викликати» відкриває пісочницю саме з цим інструментом.", "Alleen wat de deur echt uitvoert. Aanroepen opent de zandbak met dat hulpmiddel.")}
          />
          <Block icon={<Terminal />} title={t("На дверях", "Op de deur")} hint={t(`Зараз доступно інструментів: ${DOOR_TOOLS.length}.`, `${DOOR_TOOLS.length} hulpmiddelen zijn nu beschikbaar.`)}>
            <ul className="mcp-list">
              {DOOR_TOOLS.map((item) => (
                <li key={item.name} className="mcp-item">
                  <span className="mcp-item-icon" aria-hidden="true"><Terminal /></span>
                  <div className="mcp-item-main"><b className="mcp-code">{item.name}</b><span>{t(item.uk, item.nl)}</span></div>
                  <div className="mcp-item-aside"><a className="mcp-btn small ghost" href={`/playground?tool=${item.name}`}>{t("Викликати", "Aanroepen")}</a></div>
                </li>
              ))}
            </ul>
          </Block>
          <Block icon={<Plus />} title={t("Ще не на дверях", "Nog niet op de deur")} hint={t("Ці інструменти ще не на дверях, тож викликати їх тут не можна.", "Deze hulpmiddelen staan nog niet op de deur en kunnen hier dus niet worden aangeroepen.")}>
            <p className="mcp-code">{TOOL_HELP.filter(([name]) => !DOOR_TOOLS.some((item) => item.name === name)).map(([name]) => name).join(", ")}</p>
          </Block>
        </>
      )}

      {section === "board" && (
        <>
          <PageHead
            icon={<ListChecks />}
            title={t("Дошка", "Bord")}
            lead={permsReady && !flags.board ? t("Перемикач «Писати дошку» вимкнено. Нові записи й переміщення відмовляються.", "De schakelaar Bord schrijven staat uit. Nieuwe regels en verplaatsingen worden geweigerd.") : t("Ваші власні задачі й нотатки. Вони зберігаються в базі даних і видні лише вам.", "Uw eigen taken en notities. Ze staan in de database en alleen u ziet ze.")}
          />
          <RuimteStrook feiten={ruimte} lang={lang} />
          {bordDicht ? <RuimteGeslotenVlak gesloten={bordDicht} lang={lang} /> : null}
          <Block icon={<Plus />} title={t("Нова задача або нотатка", "Nieuwe taak of notitie")} hint={t("Спершу оберіть тип, введіть назву і збережіть.", "Kies eerst wat het wordt, vul de naam in en sla op.")}>
            <form className="mcp-compose" onSubmit={(event) => { event.preventDefault(); if (permsReady && !flags.board) return; void run("save", async () => { await api.post("/api/mcp/board", { ...ctx(), kind, title, body }); setTitle(""); setBody(""); await loadBoard(); }); }}>
              <div className="mcp-compose-row">
                <div className="mcp-choice" role="group" aria-label={t("Soort", "Soort")}>
                  <button type="button" aria-pressed={kind === "task"} onClick={() => setKind("task")}>{t("Задача", "Taak")}</button>
                  <button type="button" aria-pressed={kind === "note"} onClick={() => setKind("note")}>{t("Нотатка", "Notitie")}</button>
                </div>
              </div>
              <input className="mcp-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Назва", "Naam")} disabled={permsReady && !flags.board} />
              <textarea className="mcp-input" data-concept="mcp-bord" value={body} onChange={(event) => setBody(event.target.value)} placeholder={t("Текст", "Tekst")} disabled={permsReady && !flags.board} />
              <div className="mcp-compose-row">
                <button type="submit" className="mcp-btn" disabled={(permsReady && !flags.board) || Boolean(busy)}>{t("Записати", "Opslaan")}</button>
              </div>
            </form>
          </Block>
          <section className="mcp-board" aria-label={t("Kolommen van het bord", "Kolommen van het bord")}>
            {statuses.map((status) => {
              const items = tasks.filter((task) => task.status === status);
              return (
                <section key={status} className="mcp-col" data-board-kolom={status}>
                  <div className="mcp-col-head">
                    <h2>{t(...STATUS_TEKST[status])}</h2>
                    <span className="mcp-col-count">{items.length}</span>
                  </div>
                  {items.length === 0 ? <p className="mcp-meta">{t("У цій колонці немає задач.", "Geen taken in deze kolom.")}</p> : null}
                  {items.map((task) => (
                    <div key={task.id} className="mcp-task" data-board-item={task.id}>
                      <p>{task.title}</p>
                      <div className="mcp-moves" role="group" aria-label={t("Перемістити до", "Verplaatsen naar")}>
                        {statuses.filter((next) => next !== status).map((next) => (
                          <button key={next} type="button" className="mcp-move" disabled={permsReady && !flags.board} onClick={() => void run("move", async () => { await api.post("/api/mcp/board", { ...ctx(), kind: "move", id: task.id, status: next }); await loadBoard(); })}>→ {t(...STATUS_TEKST[next])}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}
          </section>
          <Block icon={<StickyNote />} title={t("Нотатки", "Notities")} hint={t("Вільний текст, що належить до дошки.", "Vrije tekst die bij het bord hoort.")}>
            {notes.length === 0
              ? <Empty icon={<StickyNote />}>{t("Ще немає нотаток. Оберіть «Нотатка», напишіть щось і збережіть.", "Nog geen notities. Kies hierboven «Notitie», schrijf iets op en sla op.")}</Empty>
              : <ul className="mcp-list">{notes.map((note) => (
                <li key={note.id} className="mcp-item">
                  <span className="mcp-item-icon" aria-hidden="true"><StickyNote /></span>
                  <div className="mcp-item-main"><b>{note.title}</b><span>{note.body}</span><small>{note.author} · {note.updatedAt}</small></div>
                </li>
              ))}</ul>}
          </Block>
        </>
      )}

      {section === "agents" && (
        <McpAgentsHub tr={t} />
      )}

      {section === "apps" && <McpAppsView lang={lang} />}

      {/* mcp-verbindingen → hub #technisch (zie mcpIngang); tot de omleiding een korte verwijzing in plaats van een lege pagina. */}
      {section === "verbindingen" && <p className="mcp-lead"><a href={`${canonicalNavigationUrl("mcp", "agents", lang === "nl" ? "nl" : "uk").replace(/#.*$/, "")}${consent ? location.search : ""}#technisch`}>{t("Технічні підключення тепер у «Підключення ШІ» → «Технічне»", "Technische verbindingen staan nu in «AI-koppelingen» → «Technisch»")}</a></p>}

      {section === "playground" && (
        <>
          <PageHead
            icon={<Terminal />}
            title={t("Пісочниця", "Zandbak")}
            lead={t("Список збігається з дверима. Аргументи підставляються самі. Вимкнений перемикач дає відмову, а не порожню кнопку.", "De lijst is dezelfde als op de deur. Argumenten worden ingevuld. Een uitgeschakelde schakelaar weigert, in plaats van een lege knop.")}
          />
          <div className="mcp-play">
            <Block icon={<Terminal />} title={t("Оберіть інструмент", "Hulpmiddel kiezen")}>
              <div className="mcp-toolnav">
                {DOOR_TOOLS.map((item) => (
                  <button key={item.name} type="button" className={item.name === tool ? "on" : ""} aria-pressed={item.name === tool} onClick={() => chooseTool(item.name)}>
                    <b>{item.name}</b>
                    <small>{t(item.uk, item.nl)}</small>
                  </button>
                ))}
              </div>
            </Block>
            <Block icon={<Activity />} title={tool} hint={t("Змініть аргументи як JSON і викличте інструмент.", "Pas de argumenten aan als JSON en roep het hulpmiddel aan.")}>
              <form className="mcp-compose" onSubmit={(event) => { event.preventDefault(); void run(tool, async () => { const gate = toolGate(tool); if (permsReady && !flags[gate]) throw new Error(`PERMISSION_OFF:${gate}`); const parsed = args.trim() ? JSON.parse(args) : {}; const res = await api.post("/api/mcp/call", { ...ctx(), name: tool, arguments: parsed }); setOut(JSON.stringify(res.data, null, 2)); }); }}>
                <textarea className="mcp-input" value={args} onChange={(event) => setArgs(event.target.value)} aria-label={t("Argumenten (JSON)", "Argumenten (JSON)")} />
                <div className="mcp-compose-row">
                  <button type="submit" className="mcp-btn" disabled={Boolean(busy) || (permsReady && !flags[toolGate(tool)])}>{t("Викликати", "Aanroepen")}</button>
                </div>
                {out ? <pre className="mcp-out">{out}</pre> : null}
              </form>
            </Block>
          </div>
        </>
      )}

      {section === "traffic" && (
        <>
          <PageHead
            icon={<Activity />}
            title={t("Трафік", "Verkeer")}
            lead={t("Кожен запит до мосту з результатом і часом, який він зайняв.","Elk verzoek dat de brug heeft gekregen, met het resultaat en de tijd die het kostte.")}
            actions={<button type="button" className="mcp-btn ghost small" disabled={Boolean(busy)} onClick={() => void run("traffic", loadTraffic)}>{t("Оновити", "Verversen")}</button>}
          />
          <Block icon={<Activity />} title={t("Запити", "Verzoeken")} hint={rows.length ? `${rows.length} ${t("рядків", "regels")}` : undefined}>
            {rows.length === 0
              ? <Empty icon={<Activity />}>{t("Ще немає запитів у цьому журналі. Щойно агент скористається мостом, вони з’являться тут.","Nog geen verzoeken in dit logboek. Zodra een agent de brug gebruikt, verschijnen ze hier.")}</Empty>
              : <ul className="mcp-list">{rows.map((row) => (
                <li key={row.id} className="mcp-item">
                  <span className={`mcp-item-icon${row.ok ? " ok" : " bad"}`} aria-hidden="true">{row.ok ? <Check /> : <X />}</span>
                  <div className="mcp-item-main"><b className="mcp-code">{row.method} {row.detail}</b><span>{row.at} · {row.agent}</span></div>
                  <div className="mcp-item-aside"><Badge tone={row.ok ? "ok" : "bad"}>{row.ok ? t("успішно", "gelukt") : t("помилка", "mislukt")} · {row.transport} · {row.ms} ms</Badge></div>
                </li>
              ))}</ul>}
          </Block>
        </>
      )}

      {section === "connect" && (
        <>
          <PageHead
            icon={<Plug />}
            title={t("Підключити", "Verbinden")}
            lead={t("Кожен ШІ має власну адресу конектора (напр. /claude, /grok). Клієнт входить на неї через OAuth — токен моста не потрібен. Повне підключення (кнопка в один клік, кроки для саме цього клієнта, стан) — на сторінці того ШІ в хабі «Підключення ШІ».", "Elke AI heeft zijn eigen connectoradres (bv. /claude, /grok). De client komt daar via OAuth binnen — een brugtoken is niet nodig. Het volledige koppelen (knop in één klik, stappen voor juist die client, stand) staat op de plek van die AI in de hub «AI-koppelingen».")}
          />
          {V2_AGENTEN.map((a) => (
            <div key={a.slug} data-agent-adres={a.slug}>
              <Block
                icon={<AgentLogo agent={a.slug} naam={a.naam} size={26} />}
                title={a.naam}
                actions={<>
                  <button type="button" className="mcp-btn ghost small" onClick={() => void copyText(`url-${a.slug}`, agentUrl(a.slug))}>{copied === `url-${a.slug}` ? t("Скопійовано", "Gekopieerd") : t("Копіювати адресу", "Adres kopiëren")}</button>
                  <a className="mcp-btn small" href={`${canonicalNavigationUrl("mcp", "agents", lang === "nl" ? "nl" : "uk").replace(/#.*$/, '')}#agent/${a.slug}`} data-agent-ingang={a.slug}>{t(`Підключити ${a.naam}`, `${a.naam} koppelen`)}</a>
                </>}
              >
                <p className="mcp-url">{agentUrl(a.slug)}</p>
              </Block>
            </div>
          ))}
          <div data-oud-adres="1">
            <Block icon={<History />} title={t("Стара спільна адреса", "Het oude gedeelde adres")}>
              <p className="mcp-url">{OUD_GEDEELD_URL}</p>
              <p className="mcp-meta">{t("Вона ще відповідає для вже підключених клієнтів і перенаправляє (308) на адресу агента. Для нового підключення беріть адресу свого ШІ вище.", "Dit adres antwoordt nog voor al gekoppelde clients en leidt door (308) naar het adres van de agent. Gebruik voor een nieuwe koppeling het adres van uw AI hierboven.")}</p>
            </Block>
          </div>
          <Block
            icon={<Copy />}
            title={t("MCP-client", "MCP-client")}
            hint={t("Приклад налаштування для MCP-клієнта.", "Voorbeeld van de configuratie voor een MCP-client.")}
            actions={<button type="button" className="mcp-btn ghost small" onClick={() => void copyText("json", connectSample)}>{copied === "json" ? t("Скопійовано", "Gekopieerd") : t("Копіювати приклад", "Voorbeeld kopiëren")}</button>}
          >
            <pre className="mcp-out">{connectSample}</pre>
          </Block>
        </>
      )}

      {section === "roadmap" && (
        <>
          <PageHead
            icon={<Compass />}
            title={t("Що далі", "Wat hierna")}
            lead={t("Проєкт живий. Цей міст — шар, через який агент працює з маєтком, а не через браузер людини.", "Het project leeft. Deze brug is de laag waarmee een agent het domein bedient.")}
          />
          <Block icon={<Check />} tone="ok" title={t("Уже є", "Er is al")}>
            <p>{t("Каталог хостів, дошка, токени, журнал, пісочниця, двері /Grok.", "Catalogus, bord, tokens, logboek, zandbak, deur /Grok.")}</p>
          </Block>
          <Block icon={<Compass />} title={t("Щоб агент дістався живого маєтку", "Om het levende domein te bereiken")}>
            <p>{t("Ідентичності з id, гранти з admin, JSON на api, аудит на dashboard. Без пароля людини.", "Identiteiten uit id, toekenningen uit admin, JSON op api, audit op het dashboard. Zonder wachtwoord van een mens.")}</p>
          </Block>
          <Block icon={<X />} tone="bad" title={t("Чого не треба", "Niet doen")}>
            <p>{t("Не давати агенту логін хаба чи пошти. Не парсити HTML за брамою. Не один пароль на всі моделі.", "Geen login van hub of post aan een agent. Geen HTML achter de poort. Geen enkel wachtwoord voor alle modellen.")}</p>
          </Block>
        </>
      )}

      {section === "download" && (
        <>
          <PageHead
            icon={<Archive />}
            title={t("Архів на ПК", "Archief op de pc")}
            lead={t("Один зашифрований файл з усім, на чому працює сайт, щоб відновити його на новій машині.","Eén versleuteld bestand met alles waarop de site draait, om hem op een nieuwe machine terug te zetten.")}
          />
          <Block
            icon={<Archive />}
            title={archive.state === "ready" ? t("Архів готовий", "Archief klaar") : archive.state === "failed" ? t("Збір зупинився", "Maken gestopt") : archive.state === "building" ? t("Збираю повний архів", "Volledig archief maken") : t("Ще не запускали", "Nog niet gestart")}
            hint={archive.state === "building" && archive.started ? `${t("Минуло", "Verstreken")} ${clock(Date.now() - new Date(archive.started).getTime() + (tick >= 0 ? 0 : 0))}${remain(archive.started, archive.pct) ? ` · ${t("ще", "nog")} ~${remain(archive.started, archive.pct)}` : ""}` : archive.bytes ? sizeText(archive.bytes) : undefined}
            tone={archive.state === "failed" ? "bad" : archive.state === "ready" ? "ok" : undefined}
            actions={<>
              <Badge tone={archive.state === "ready" ? "ok" : archive.state === "failed" ? "bad" : archive.state === "building" ? "wait" : "off"}>
                {archive.state === "ready" ? t("готово", "klaar") : archive.state === "failed" ? t("зупинено", "gestopt") : archive.state === "building" ? t("триває", "bezig") : t("ще не запускали", "nog niet gestart")}
              </Badge>
              <button type="button" className="mcp-btn" disabled={Boolean(busy)} onClick={() => void run("archive", downloadArchive)}>{t("Зібрати повний архів", "Volledig archief maken")}</button>
            </>}
          >
            <div className="mcp-bar-row"><span>{t("Загальний хід", "Totale voortgang")}</span><b>{archive.state === "ready" ? 100 : Math.max(archive.state === "building" ? 4 : 0, archive.pct || 0)}%</b></div>
            <div className="mcp-bar" aria-hidden="true"><i style={{ width: `${archive.state === "ready" ? 100 : Math.max(archive.state === "building" ? 4 : 0, archive.pct)}%` }} /></div>
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
                <button type="button" className="mcp-btn ghost" disabled={Boolean(busy)} onClick={() => void run("archive", () => saveBlob())}>{archive.state === "ready" ? t("Завантажити архів (оберіть диск і папку)", "Archief downloaden (kies schijf en map)") : t("Завантажити ще раз", "Opnieuw downloaden")}</button>
                {downloaded > 0 ? <small className="mcp-live"> {t("записано", "geschreven")} {sizeText(downloaded)}</small> : null}
              </div>
            ) : null}
            <p className="mcp-note">{t("Увесь файл цілком шифрується вашим наявним age-ключем (нового ключа не створюється): без вашого herstelsleutel його не відкрити. Після розшифрування лежить скрипт vidnovyty.sh. Завантаження — лише власнику, після повторного підтвердження входу, через одноразове посилання на 5 хвилин.", "Het hele bestand is versleuteld met uw bestaande age-sleutel (er komt geen nieuwe sleutel bij): zonder uw herstelsleutel is het niet te openen. Na ontsleutelen zit het script vidnovyty.sh erin. Downloaden kan alleen de eigenaar, na een nieuwe bevestiging van de aanmelding, via een eenmalige link van 5 minuten.")}</p>
          </Block>
          <McpBackupsCard tr={t} />
          <McpServerBeheerCard tr={t} />
          <Block icon={<History />} title={t("Історія", "Geschiedenis")} hint={t("Кожен рядок — окремий збір. Старші рядки лишаються як запис: коли і якого розміру.","Elke rij is één keer maken. Oudere rijen blijven als notitie: wanneer en hoe groot.")}>
            {archive.history.length ? (
              <ul className="mcp-list">
                {archive.history.map((row) => (
                  <li key={`${row.at}-${row.name}`} className="mcp-item">
                    <span className="mcp-item-icon" aria-hidden="true"><FileArchive /></span>
                    <div className="mcp-item-main"><b>{whenText(row.at)}</b><span>{sizeText(row.bytes)}{row.kod ? ` · ${t("код", "code")} ${sizeText(row.kod)} · ${t("база", "database")} ${sizeText(row.baza)} · ${t("файли", "bestanden")} ${sizeText(row.fajly)}` : ""}</span></div>
                    <div className="mcp-item-aside">
                      {row.kept ? <button type="button" className="mcp-btn ghost small" disabled={Boolean(busy)} onClick={() => void run("archive", () => saveBlob())}>{t("Завантажити", "Downloaden")}</button> : <Badge tone="off">{t("bestand vervangen", "bestand vervangen")}</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty icon={<History />}>{t("Ще немає жодного зібраного архіву в цьому журналі. Зберіть один кнопкою вгорі.","Nog geen archief in dit logboek. Maak er één met de knop bovenaan.")}</Empty>}
          </Block>
        </>
      )}
      </>}
    </div>
  );
}
