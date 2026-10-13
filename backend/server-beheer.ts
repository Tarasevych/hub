// Beheer op afstand vanuit de app, ZONDER root-pad (zie deploy/RUNBOOK-VEILIGE-UITROL.md):
//  - methode 3: `systemctl start mijn-ruimte-opdracht@<werkwoord>.service` voor vijf vaste werkwoorden. De polkit-regel op de VM staat
//    de gebruiker mijnruimte precies die vijf units toe; het root-script controleert alles nogmaals en leest niets wat de app schrijft.
//    De app geeft nooit vrije tekst door: het werkwoord komt uit een vaste lijst, de unitnaam wordt hier samengesteld.
//  - auditkanaal: root-scripts (GitOps, opdracht) schrijven gebeurtenissen naar /var/lib/mijn-ruimte-uitrol-status/gebeurtenissen.jsonl
//    (root:mijnruimte 0640); de app leest dat bestand alleen en neemt nieuwe regels op in app.audit.
import { execFile } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { db, isOwnerEmail } from "../server/platform";
import { auditToevoegen } from "../server/platform/audit";

export const OPDRACHT_WERKWOORDEN = ["status", "releases", "backup", "uitrol-nu", "terugdraaien"] as const;
export type Werkwoord = (typeof OPDRACHT_WERKWOORDEN)[number];
/** Alleen lezen: wachten op het resultaat. */
export const OPDRACHT_LEZEN: ReadonlySet<Werkwoord> = new Set(["status", "releases"]);
/** Vraagt eigenaar + recente herbevestiging van de aanmelding (step-up). */
export const OPDRACHT_STAPOP: ReadonlySet<Werkwoord> = new Set(["uitrol-nu", "terugdraaien"]);
/** Standaardschakelaars (gelijk aan het root-script); de waarheid staat in /etc/mijn-ruimte/mcp-rechten.json. */
export const OPDRACHT_STANDAARD: Readonly<Record<Werkwoord, boolean>> = Object.freeze({ status: true, releases: true, backup: true, "uitrol-nu": true, terugdraaien: false });

export const isWerkwoord = (v: unknown): v is Werkwoord => typeof v === "string" && (OPDRACHT_WERKWOORDEN as readonly string[]).includes(v);
export const opdrachtUnit = (w: Werkwoord) => `mijn-ruimte-opdracht@${w}.service`;
const statusDir = () => process.env.OPDRACHT_STATUS_DIR || "/var/lib/mijn-ruimte-uitrol-status";

type Runner = (args: string[], timeoutMs: number) => Promise<{ code: number; stderr: string }>;
const standaardRunner: Runner = (args, timeoutMs) => new Promise((resolve) => {
  execFile("/usr/bin/systemctl", args, { timeout: timeoutMs, env: { PATH: "/usr/bin:/bin", LC_ALL: "C" }, maxBuffer: 64 * 1024 }, (err, _out, stderr) => {
    const code = err ? (typeof (err as { code?: unknown }).code === "number" ? Number((err as { code: number }).code) : 1) : 0;
    resolve({ code, stderr: String(stderr || "").slice(0, 400) });
  });
});
let runner: Runner = standaardRunner;
/** Alleen voor tests. */
export function zetOpdrachtRunner(r: Runner | null) { runner = r || standaardRunner; }

export type OpdrachtResultaat = { werkwoord: Werkwoord; uitkomst: string; code: string; uk: string; nl: string; tijd: string; gegevens?: unknown };
export async function leesOpdrachtResultaat(w: Werkwoord): Promise<OpdrachtResultaat | null> {
  if (!isWerkwoord(w)) return null;
  try {
    const d = JSON.parse(await readFile(path.join(statusDir(), `opdracht-${w}.json`), "utf8")) as OpdrachtResultaat;
    return d && d.werkwoord === w ? d : null;
  } catch { return null; }
}

/** Start de opdracht. Lezen (status/releases): wacht en geeft het resultaat; de rest: start zonder wachten (resultaat later ophalen). */
export async function voerOpdrachtUit(w: Werkwoord): Promise<{ ok: boolean; code: string; gestart?: boolean; resultaat?: OpdrachtResultaat | null; detail?: string }> {
  if (!isWerkwoord(w)) return { ok: false, code: "OPDRACHT_ONBEKEND" };
  const wacht = OPDRACHT_LEZEN.has(w);
  const begin = Date.now();
  const r = await runner(["start", "--no-ask-password", ...(wacht ? [] : ["--no-block"]), opdrachtUnit(w)], wacht ? 60_000 : 15_000);
  if (!wacht) return r.code === 0 ? { ok: true, code: "GESTART", gestart: true } : { ok: false, code: "OPDRACHT_START_MISLUKT", detail: r.stderr };
  const res = await leesOpdrachtResultaat(w);
  const vers = !!res && Date.parse(res.tijd) >= begin - 5_000;
  if (!vers) return { ok: false, code: r.code === 0 ? "OPDRACHT_GEEN_RESULTAAT" : "OPDRACHT_START_MISLUKT", detail: r.stderr };
  return { ok: res!.uitkomst === "ok", code: res!.code, resultaat: res };
}

// ---------------------------------------------------------------- root-gebeurtenissen → audit
export type RootGebeurtenis = {
  id: string; tijd: string; bron: string; code: string; niveau: string; uk: string; nl: string; tag?: string;
  herkomst?: string; wie?: string; pakket?: string; release?: string; commit?: string; adres?: string;
};
const ID = /^\d{8}T\d{12}Z-[0-9a-f]{8}$/;
const HERKOMST = /^(?:ssh|passkey|handtekening|gitops|opdracht)$/;
const WIE = /^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/;
const RELEASE = /^\d{8}-\d{6}$/;
const COMMIT = /^[0-9a-f]{7,40}$/;
const ADRES = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const tekst = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const veld = (v: unknown, re: RegExp, n: number) => { const s = tekst(v, n); return re.test(s) ? s : undefined; };
const cursorPad = () => path.join(process.env.UPLOADS_DIR || "/srv/data/uploads", ".root-gebeurtenissen.cursor");

export function parseRootGebeurtenissen(raw: string): RootGebeurtenis[] {
  const uit: RootGebeurtenis[] = [];
  for (const regel of raw.split("\n")) {
    if (!regel.trim()) continue;
    try {
      const d = JSON.parse(regel) as Record<string, unknown>;
      if (!ID.test(String(d.id)) || !["gitops", "opdracht", "uitrol", "goedkeuring"].includes(String(d.bron))) continue;
      const g: RootGebeurtenis = { id: String(d.id), tijd: tekst(d.tijd, 40), bron: String(d.bron), code: tekst(d.code, 40).replace(/[^A-Z0-9_]/g, ""), niveau: tekst(d.niveau, 20), uk: tekst(d.uk, 300), nl: tekst(d.nl, 300), tag: tekst(d.tag, 40) };
      const herkomst = veld(d.herkomst, HERKOMST, 20), wie = veld(d.wie, WIE, 32), pakket = veld(d.pakket, RELEASE, 15), release = veld(d.release, RELEASE, 15), commit = veld(d.commit, COMMIT, 40), adres = veld(d.adres, ADRES, 15);
      if (herkomst) g.herkomst = herkomst;
      if (wie) g.wie = wie;
      if (pakket) g.pakket = pakket;
      if (release) g.release = release;
      if (commit) g.commit = commit;
      if (adres) g.adres = adres;
      uit.push(g);
    } catch { /* kapotte regel overslaan */ }
  }
  return uit.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Wat de geschiedenis op «Оновлення» extra toont, naast de voorstellen.
 * SSH altijd (ook als er een onafgemaakte upload met hetzelfde pakketnummer ligt).
 * Een geslaagde of mislukte installatie met de uitrolsleutel alleen als dat versienummer nog niet als «geïnstalleerd» voorstel staat.
 * Passkey- en GitOps-regels blijven bij hun eigen kanaal: het voorstel, respectievelijk de audit.
 */
export function toonbareInstallaties(events: RootGebeurtenis[], alGeinstalleerd: readonly string[]): RootGebeurtenis[] {
  const gezien = new Set(alGeinstalleerd);
  return events.filter((g) => {
    if (g.bron !== "uitrol") return false;
    if (g.code === "SSH_OK" || g.code === "SSH_TERUG") return true;
    if (g.herkomst === "handtekening" && (g.code === "OK" || g.code === "INSTALLATIE_MISLUKT")) return !gezien.has(g.pakket || g.tag || "");
    return false;
  });
}

let eigenaarCache: { id: string | null; t: number } | null = null;
async function eigenaarId(): Promise<string | null> {
  if (eigenaarCache && Date.now() - eigenaarCache.t < 3600_000) return eigenaarCache.id;
  let id: string | null = null;
  try {
    const rows = await db.list<{ email?: string }>("users", { filter: { role: "owner" }, limit: 20 });
    id = (rows.items as Array<{ id: string; email?: string }>).find((r) => isOwnerEmail(r.email))?.id || null;
  } catch { id = null; }
  eigenaarCache = { id, t: Date.now() };
  return id;
}

/** Nieuwe root-gebeurtenissen opnemen in de audit (eigenaar). Geeft het aantal opgenomen regels. */
export async function neemRootGebeurtenissenOp(opties: { ownerId?: string | null } = {}): Promise<number> {
  let raw = "";
  try { raw = await readFile(path.join(statusDir(), "gebeurtenissen.jsonl"), "utf8"); } catch { return 0; }
  let cursor = "";
  try { cursor = (await readFile(cursorPad(), "utf8")).trim(); } catch { cursor = ""; }
  const nieuw = parseRootGebeurtenissen(raw).filter((g) => g.id > cursor);
  if (!nieuw.length) return 0;
  const ownerId = opties.ownerId !== undefined ? opties.ownerId : await eigenaarId();
  let n = 0;
  for (const g of nieuw) {
    await auditToevoegen({
      ownerId, actorId: null, action: `server.${g.bron}.${g.code.toLowerCase() || "melding"}`, type: "beveiliging",
      result: g.niveau === "info" ? "success" : g.niveau === "fout" ? "failure" : "denied",
      details: {
        bron: g.bron, code: g.code, tag: g.tag, uk: g.uk, nl: g.nl, tijd: g.tijd, id: g.id,
        ...(g.herkomst ? { herkomst: g.herkomst } : {}), ...(g.wie ? { wie: g.wie } : {}), ...(g.pakket ? { pakket: g.pakket } : {}),
        ...(g.release ? { release: g.release } : {}), ...(g.commit ? { commit: g.commit } : {}), ...(g.adres ? { adres: g.adres } : {}),
      }, service: "systeem",
    });
    cursor = g.id; n++;
  }
  const tmp = `${cursorPad()}.${process.pid}`;
  await writeFile(tmp, cursor + "\n", { mode: 0o600 });
  await rename(tmp, cursorPad());
  return n;
}
