// ORCH-001 етап 3 (31.10.2026) · Координація агентів через сайт — шар файлів/git поверх ТИХ САМИХ чистих функцій, що й CLI
// (scripts/orch/kern.mjs) і ТОГО САМОГО конвеєра приймання (scripts/orch/inleveren.mjs). Жодного другого механізму: сайт, MCP і
// HTTP API лише доставляють пакет або пропозицію правил у робочу копію репозиторію координації на сервері (ORCH_WORTEL) і викликають
// inleveren()/beoordeelVoorstel()/vergrendel(). Без робочої копії — чесно ORCH_GEEN_REPO (RUNBOOK §18), нічого не імітується.
//
// Три речі, які тут живуть:
//   1. огляд/контекст      — читання beleid.json, lock, taken, wachtrij, inleveringen, geinstalleerd + `node scripts/orch.mjs controleer`;
//   2. завантаження пакета — фрагменти ≤ 512 КіБ у ORCH_INBOX/uploads/<id>/, SHA-256, потім inleveren() + registreerInlevering() + staat-commit;
//   3. правила             — чернетка (beoordeelVoorstel) → рішення власника «orch-regels» з passkey (root записує підтвердження в
//                            <status>/orch-regels-bevestigd.json) → застосування: git-гілка regels/<versie>-<tijd>, новий lock з
//                            eigenaar.soort = 'passkey', CONTEXT-COMPACT.md, controleer, commit, push, посилання на PR.
// Omgevingsvariabelen: ORCH_WORTEL (werkkopie, standaard /srv/mijn-ruimte/orch-repo), ORCH_INBOX (/srv/mijn-ruimte/orch-inbox),
// OPDRACHT_STATUS_DIR (root-statusmap, zelfde als eigenaar-besluit.ts). Tests: tests/eenheid/orch-site-20261031.test.ts.
import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as bk from '../deploy/goedkeuring/besluit-kern.mjs';
import {
  CONTEXT_PAD, SHA40, TAAK_ID, VOORSTEL_ID, beoordeelVoorstel, bevestigMetPasskey, compacteContext, eigenaarStatus, statusAfleiden, valideerBeleid, valideerTaak, vergrendel,
} from '../scripts/orch/kern.mjs';
import { inleveren, inleverenA, registreerInlevering } from '../scripts/orch/inleveren.mjs';
import { ORCH_LIMIETEN, ORCH_TOOL_NAMEN, type OrchBevestiging, type OrchInlevering, type OrchOverzicht, type OrchRegelsOverzicht, type OrchTaak, type OrchUpload, type OrchVoorstel, type OrchZaak } from '../shared/orch-model';

// ---------------------------------------------------------------- paden en fouten
const wortel = () => resolve(process.env.ORCH_WORTEL || '/srv/mijn-ruimte/orch-repo');
const inbox = () => resolve(process.env.ORCH_INBOX || '/srv/mijn-ruimte/orch-inbox');
const statusDir = () => process.env.OPDRACHT_STATUS_DIR || '/var/lib/mijn-ruimte-uitrol-status';
const rechtenPad = () => process.env.MCP_RECHTEN_PAD || '/etc/mijn-ruimte/mcp-rechten.json';
const LOCK = 'orchestratie/regels.lock.json';
const nu = () => new Date().toISOString();
const tekst = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n);
const stempel = () => nu().replace(/[-:TZ.]/g, '').replace(/^(\d{8})(\d{6}).*$/, '$1-$2');

/** Fout met code (shared/orch-model.ts ORCH_CODES) en http-status; `zaken` = de uk/nl-regels van kern/inleveren. */
export class OrchFout extends Error {
  constructor(public code: string, public status = 400, public zaken: OrchZaak[] = [], public detail = '') { super(code); }
}
// Functiedeclaratie (geen const): zo versmalt TypeScript na `if (!x) fout(…)` het type van x (never-analyse werkt alleen op declaraties).
function fout(code: string, status = 400, zaken: OrchZaak[] = [], detail = ''): never { throw new OrchFout(code, status, zaken, detail); }

type Beleid = Record<string, any> & { regelsVersie: string; regelBestanden: string[]; basis: { versie: string; bronCommit: string; verificatie: string }; integratie: { tak: string; basisTak: string; wachtrij: string }; compactContext: { bestand: string }; agenten: Array<{ id: string; naam?: string; kanalen: string[]; adapter?: string }>; inlevering: { kanalen: string[] } };
type Lock = { schema: number; regelsVersie: string; hash: string; kritiekHash: string; bestanden: Record<string, string>; eigenaar: Record<string, any> | null };

function git(...a: string[]): string | null {
  try { return execFileSync('git', a, { cwd: wortel(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 }).trim(); } catch { return null; }
}

// ---------------------------------------------------------------- SEC-002 (ai-mcp-09): niet-blokkerende uitvoering
// De server is ÉÉN proces: elke execFileSync/spawnSync houdt de gebeurtenislus vast — alle verzoeken, hartslagen van agenten en
// terminals wachten dan mee. Het LEESPAD (overzicht, context, regels-overzicht — voor een agent zonder bevestiging aan te roepen, dus
// ook in een lus) loopt daarom over asynchrone processen met een tijdslimiet en een rij «één tegelijk»; `controleer` wordt bovendien
// gedeeld (gelijktijdige vragers krijgen dezelfde uitslag) en kort onthouden per stand van de werkkopie. De synchrone git() hierboven
// blijft alleen voor de SCHRIJFPADEN (taak registreren, upload afronden, regels toepassen): die zijn per uur begrensd en doen enkele
// korte lokale git-aanroepen. Wat lang kan duren in «regels toepassen» (controleer, push) is ook asynchroon gemaakt.
// Сервер — один процес: синхронні виклики зупиняли весь сайт; шлях читання тепер асинхронний, з чергою і коротким кешем.
function eenTegelijkRij(): <T>(werk: () => Promise<T>) => Promise<T> {
  let staart: Promise<unknown> = Promise.resolve();
  return <T,>(werk: () => Promise<T>): Promise<T> => {
    const p = staart.then(werk, werk);
    staart = p.then(() => undefined, () => undefined);
    return p;
  };
}
const gitRij = eenTegelijkRij();       // asynchrone git van het leespad: nooit meer dan één proces tegelijk
const controleRij = eenTegelijkRij();  // `orch controleer` van het overzicht: één tegelijk
const toepasRij = eenTegelijkRij();    // «regels toepassen»: sinds het asynchroon is, mogen twee aanvragen elkaar niet kruisen
// SEC-002 (g05-toets-1): het asynchrone leespad loopt nu TEGELIJK met de synchrone schrijfpaden (taakStart/staatCommit, uploadKlaar →
// inleveren) in dezelfde werkkopie. `git status` neemt standaard een NIET-VERPLICHT .git/index.lock om de index te verversen; een
// synchrone `git add` op dat moment faalt («index.lock: File exists») en staatCommit() gaf dan stil null (taak niet vastgelegd,
// werkkopie vuil). Met GIT_OPTIONAL_LOCKS=0 neemt git op het leespad zulke sloten niet (git ≥ 2.15) — ook in `orch controleer`,
// dat zelf git aanroept. Шлях читання не бере необов'язкового index.lock, щоб не заважати синхронним комітам задач і передач.
const LEES_GIT_ENV = (): NodeJS.ProcessEnv => ({ ...process.env, GIT_OPTIONAL_LOCKS: '0' });

/** Asynchrone tegenhanger van git(): uitvoer (getrimd) of null bij een fout/tijdslimiet. Blokkeert de gebeurtenislus niet. */
function gitA(...a: string[]): Promise<string | null> {
  return gitRij(() => new Promise<string | null>((klaar) => {
    try {
      execFile('git', a, { cwd: wortel(), encoding: 'utf8', timeout: 60_000, env: LEES_GIT_ENV() }, (err, stdout) => klaar(err ? null : String(stdout).trim()));
    } catch { klaar(null); }
  }));
}
type ProcesUitslag = { status: number | null; stdout: string; stderr: string };
const UITVOER_MAX = 1024 * 1024;
/**
 * Asynchrone tegenhanger van spawnSync(cmd, args, { timeout }): status null bij tijdslimiet of startfout (zoals spawnSync). Na de
 * tijdslimiet krijgt het proces SIGTERM (zoals spawnSync) en 5 s later SIGKILL; houdt een kleinkind de uitvoer nog open, dan
 * wachten we daar niet eindeloos op — de belofte komt ALTIJD terug, anders zou de rij «één tegelijk» voorgoed vastlopen.
 */
function draaiA(cmd: string, args: string[], opties: { cwd: string; timeoutMs: number; env?: NodeJS.ProcessEnv }): Promise<ProcesUitslag> {
  return new Promise<ProcesUitslag>((klaar) => {
    let stdout = '', stderr = '', af = false;
    const klokken: Array<ReturnType<typeof setTimeout>> = [];
    const einde = (status: number | null) => { if (af) return; af = true; for (const k of klokken) clearTimeout(k); klaar({ status, stdout, stderr }); };
    try {
      const kind = spawn(cmd, args, { cwd: opties.cwd, stdio: ['ignore', 'pipe', 'pipe'], env: opties.env ?? process.env });
      kind.stdout.setEncoding('utf8'); kind.stderr.setEncoding('utf8');
      kind.stdout.on('data', (d: string) => { if (stdout.length < UITVOER_MAX) stdout += d; });
      kind.stderr.on('data', (d: string) => { if (stderr.length < UITVOER_MAX) stderr += d; });
      kind.on('error', () => einde(null));
      kind.on('close', (code) => einde(code));
      kind.on('exit', (code) => { klokken.push(setTimeout(() => { kind.stdout.destroy(); kind.stderr.destroy(); einde(code); }, 500)); });
      klokken.push(setTimeout(() => { try { kind.kill('SIGTERM'); } catch { /* al weg */ } }, opties.timeoutMs));
      klokken.push(setTimeout(() => { try { kind.kill('SIGKILL'); } catch { /* al weg */ } kind.stdout.destroy(); kind.stderr.destroy(); einde(null); }, opties.timeoutMs + 5_000));
    } catch { einde(null); }
  });
}
const leesJson = <T,>(pad: string): T => JSON.parse(readFileSync(pad, 'utf8')) as T;
const schrijfJson = (pad: string, w: unknown) => { mkdirSync(join(pad, '..'), { recursive: true }); writeFileSync(pad, `${JSON.stringify(w, null, 2)}\n`); };
/** Origin zonder gebruikersnaam/wachtwoord of token (nooit een geheim naar de pagina). */
const veiligeOrigin = (url: string) => url.replace(/\/\/[^/@]+@/, '//');

// ---------------------------------------------------------------- repository
export function repoStand(): OrchOverzicht['repo'] {
  const w = wortel();
  const leeg = { aanwezig: false, wortel: w, tak: '', hoofd: '', schoon: false, origin: '', code: 'ORCH_GEEN_REPO' };
  if (!existsSync(join(w, 'orchestratie', 'beleid.json')) || !existsSync(join(w, 'scripts', 'orch.mjs'))) return leeg;
  if (git('rev-parse', '--is-inside-work-tree') !== 'true') return leeg;
  return { aanwezig: true, wortel: w, tak: git('rev-parse', '--abbrev-ref', 'HEAD') || '', hoofd: git('rev-parse', 'HEAD') || '', schoon: (git('status', '--porcelain') ?? 'x') === '', origin: veiligeOrigin(git('remote', 'get-url', 'origin') || ''), code: '' };
}

/** Niet-blokkerende repoStand() (SEC-002 ai-mcp-09) + de ruwe `git status --porcelain` (sleutel voor het onthouden van controleer). */
async function repoStandA(): Promise<{ repo: OrchOverzicht['repo']; status: string | null }> {
  const w = wortel();
  const leeg = { aanwezig: false, wortel: w, tak: '', hoofd: '', schoon: false, origin: '', code: 'ORCH_GEEN_REPO' };
  if (!existsSync(join(w, 'orchestratie', 'beleid.json')) || !existsSync(join(w, 'scripts', 'orch.mjs'))) return { repo: leeg, status: null };
  if ((await gitA('rev-parse', '--is-inside-work-tree')) !== 'true') return { repo: leeg, status: null };
  const tak = (await gitA('rev-parse', '--abbrev-ref', 'HEAD')) || '';
  const hoofd = (await gitA('rev-parse', 'HEAD')) || '';
  const status = await gitA('status', '--porcelain');
  const origin = veiligeOrigin((await gitA('remote', 'get-url', 'origin')) || '');
  return { repo: { aanwezig: true, wortel: w, tak, hoofd, schoon: (status ?? 'x') === '', origin, code: '' }, status };
}

/** beleid.json + lock + regelbestanden uit de werkkopie; zonder werkkopie → ORCH_GEEN_REPO (503). */
export function laadOrch(): { beleid: Beleid; lock: Lock | null; bestanden: Record<string, string>; repo: OrchOverzicht['repo'] } {
  return laadUit(repoStand());
}
/** Niet-blokkerende laadOrch() voor het leespad. */
async function laadOrchA(): Promise<ReturnType<typeof laadOrch> & { status: string | null }> {
  const { repo, status } = await repoStandA();
  return { ...laadUit(repo), status };
}
function laadUit(repo: OrchOverzicht['repo']): { beleid: Beleid; lock: Lock | null; bestanden: Record<string, string>; repo: OrchOverzicht['repo'] } {
  if (!repo.aanwezig) fout('ORCH_GEEN_REPO', 503);
  const beleid = leesJson<Beleid>(join(wortel(), 'orchestratie/beleid.json'));
  const vb = valideerBeleid(beleid) as OrchZaak[];
  if (vb.length) fout('BELEID_ONGELDIG', 500, vb);
  const lock = existsSync(join(wortel(), LOCK)) ? leesJson<Lock>(join(wortel(), LOCK)) : null;
  const bestanden = Object.fromEntries(beleid.regelBestanden.map((p) => [p, existsSync(join(wortel(), p)) ? readFileSync(join(wortel(), p), 'utf8') : '']));
  return { beleid, lock, bestanden, repo };
}

function orchRechtenOpen(): boolean {
  try { return bk.besluitKanaalOpen('orch-regels', JSON.parse(readFileSync(rechtenPad(), 'utf8'))); } catch (e) { return (e as { code?: string }).code === 'ENOENT'; }
}
/** Підтвердження, які root записав (mijn-ruimte-besluit.sh orch_regels → <status>/orch-regels-bevestigd.json). */
export function rootBevestigingen(): OrchBevestiging[] {
  try {
    const d = leesJson<{ bevestigingen?: unknown[] }>(join(statusDir(), 'orch-regels-bevestigd.json'));
    return (Array.isArray(d.bevestigingen) ? d.bevestigingen : []).filter((b): b is OrchBevestiging => !!b && typeof b === 'object').slice(-50).map((b) => ({
      regelsVersie: tekst(b.regelsVersie, 20), hash: tekst(b.hash, 64), kritiekHash: tekst(b.kritiekHash, 64), voorstel: tekst(b.voorstel, 32), passkey: tekst(b.passkey, 16), label: tekst(b.label, 60), door: tekst(b.door, 120), besluit: tekst(b.besluit, 40), tijd: tekst(b.tijd, 40),
    }));
  } catch { return []; }
}

/**
 * `node scripts/orch.mjs controleer` in de werkkopie — de echte controle, niet een nabootsing.
 * LET OP: synchroon (houdt het hele proces vast, tot 120 s) — alleen voor tests en diagnose. Routes en MCP gebruiken controleerA().
 */
export function controleer(): { code: number; regels: string[] } {
  const r = spawnSync(process.execPath, [join(wortel(), 'scripts/orch.mjs'), 'controleer'], { cwd: wortel(), encoding: 'utf8', timeout: 120_000 });
  return { code: r.status ?? -1, regels: controleUitvoerRegels(`${r.stdout}${r.stderr}`) };
}
const controleUitvoerRegels = (uitvoer: string): string[] => uitvoer.trim().split('\n').filter(Boolean).slice(-40).map((l) => tekst(l, 400));

// SEC-002 (ai-mcp-09): controleer voor het overzicht — asynchroon, één tegelijk, gedeeld en kort onthouden.
// De sleutel is de stand van de werkkopie: HEAD + `git status --porcelain` + (bij niet-vastgelegde wijzigingen) tijdstip en grootte van
// elk gewijzigd bestand. Verandert er iets (commit, bewerkt bestand), dan is de sleutel anders en draait de controle opnieuw; anders
// komt hooguit CONTROLE_ONTHOUD_MS oud nieuws terug. Beslissingen (inleveren, regels toepassen) draaien ALTIJD hun eigen, verse controle.
type ControleUitslag = { code: number; regels: string[] };
const controleInstelling = { timeoutMs: 120_000, onthoudMs: 30_000 };
let controleOnthouden: { sleutel: string; op: number; uitslag: ControleUitslag } | null = null;
const controleLopend = new Map<string, Promise<ControleUitslag>>();
/** Alleen voor tests: tijdslimiet/onthoudtijd instellen en het onthouden resultaat wissen. */
export const _controleInstellen = (o: { timeoutMs?: number; onthoudMs?: number } = {}): void => {
  if (o.timeoutMs !== undefined) controleInstelling.timeoutMs = o.timeoutMs;
  if (o.onthoudMs !== undefined) controleInstelling.onthoudMs = o.onthoudMs;
  controleOnthouden = null;
};
/** Sleutel van de werkkopie-stand, of null wanneer die niet betrouwbaar te bepalen is (dan wordt niets onthouden). */
function controleSleutel(repo: OrchOverzicht['repo'], status: string | null): string | null {
  if (status === null || !repo.hoofd) return null;
  const h = createHash('sha256').update(`${repo.wortel}\n${repo.hoofd}\n${status}\n`);
  const regels = status.split('\n').filter(Boolean);
  if (regels.length > 200) return null;
  for (const r of regels) {
    const m = /^\s*\S{1,2}\s+(.+)$/.exec(r);
    const pad = m ? m[1].split(' -> ').pop()! : '';
    try { const s = statSync(join(repo.wortel, pad)); h.update(`${pad}:${s.mtimeMs}:${s.size}\n`); } catch { h.update(`${pad}:weg\n`); }
  }
  return h.digest('hex');
}
/** Niet-blokkerende controleer(): één proces tegelijk, met tijdslimiet. Zonder sleutel: altijd een verse run (wel in de rij). */
export function controleerA(sleutel: string | null = null): Promise<ControleUitslag> {
  if (sleutel && controleOnthouden && controleOnthouden.sleutel === sleutel && Date.now() - controleOnthouden.op < controleInstelling.onthoudMs) return Promise.resolve(controleOnthouden.uitslag);
  const bezig = sleutel ? controleLopend.get(sleutel) : undefined;
  if (bezig) return bezig;
  const w = wortel();
  const p = controleRij(async () => {
    const r = await draaiA(process.execPath, [join(w, 'scripts/orch.mjs'), 'controleer'], { cwd: w, timeoutMs: controleInstelling.timeoutMs, env: LEES_GIT_ENV() });
    const uitslag: ControleUitslag = { code: r.status ?? -1, regels: controleUitvoerRegels(`${r.stdout}${r.stderr}`) };
    // Een afgebroken run (tijdslimiet, startfout) wordt niet onthouden: de volgende vraag probeert het opnieuw.
    if (sleutel && r.status !== null) controleOnthouden = { sleutel, op: Date.now(), uitslag };
    return uitslag;
  });
  if (sleutel) { controleLopend.set(sleutel, p); void p.then(() => controleLopend.delete(sleutel), () => controleLopend.delete(sleutel)); }
  return p;
}

// ---------------------------------------------------------------- 1. overzicht en context
/** Leest een taakbestand alleen voor de vraag «welke voorouder-controles heeft statusAfleiden nodig» (leespad, asynchroon). */
async function voorouderTabel(): Promise<(a: string, b: string) => boolean> {
  const map = join(wortel(), 'orchestratie/taken');
  const gi = leesGeinstalleerd();
  const tabel = new Map<string, boolean>();
  if (existsSync(map) && gi?.bronCommit) {
    for (const f of readdirSync(map).filter((n) => n.endsWith('.json')).sort()) {
      let a = '';
      try { a = String(leesJson<Record<string, any>>(join(map, f)).integratieCommit || ''); } catch { continue; }
      const sleutel = `${a}\n${gi.bronCommit}`;
      if (!a || tabel.has(sleutel)) continue;
      // Een waarde uit een bestand mag nooit als optie bij git aankomen.
      tabel.set(sleutel, a.startsWith('-') || gi.bronCommit.startsWith('-') ? false : (await gitA('merge-base', '--is-ancestor', a, gi.bronCommit)) !== null);
    }
  }
  return (a, b) => tabel.get(`${a}\n${b}`) ?? false;
}
function leesTaken(beleid: Beleid, lock: Lock | null, isVoorouder: (a: string, b: string) => boolean = (a, b) => git('merge-base', '--is-ancestor', a, b) !== null): OrchTaak[] {
  const map = join(wortel(), 'orchestratie/taken');
  if (!existsSync(map)) return [];
  const gi = leesGeinstalleerd();
  const uit: OrchTaak[] = [];
  for (const f of readdirSync(map).filter((n) => n.endsWith('.json')).sort()) {
    try {
      const t = leesJson<Record<string, any>>(join(map, f));
      const s = statusAfleiden(t, gi, isVoorouder);
      uit.push({ id: String(t.id), agent: String(t.agent || ''), tak: String(t.tak || ''), basisCommit: String(t.basisCommit || ''), basisVersie: String(t.basisVersie || ''), regelsVersie: String(t.regelsVersie || ''), regelsHash: t.regelsHash ? String(t.regelsHash) : null,
        staat: String(t.staat || ''), gestart: String(t.gestart || ''), bijgewerkt: String(t.bijgewerkt || ''), omschrijving: tekst(t.omschrijving, 300), kanaal: String(t.kanaal || ''), overdrachten: Array.isArray(t.overdrachten) ? t.overdrachten.map(String) : [],
        status: s.status, regelsActueel: t.regelsVersie === beleid.regelsVersie && (!lock || !t.regelsHash || t.regelsHash === lock.hash) });
    } catch { /* kapot taakbestand: controleer meldt het */ }
  }
  return uit;
}
function leesGeinstalleerd(): { versie: string; bronCommit: string; op?: string } | null {
  try { const g = leesJson<Record<string, any>>(join(wortel(), 'orchestratie/geinstalleerd.json')); return { versie: String(g.versie || ''), bronCommit: String(g.bronCommit || ''), op: g.op ? String(g.op) : undefined }; } catch { return null; }
}
function leesInleveringen(): OrchInlevering[] {
  const map = join(wortel(), 'orchestratie/inleveringen');
  if (!existsSync(map)) return [];
  const uit: OrchInlevering[] = [];
  for (const f of readdirSync(map).filter((n) => n.endsWith('.json'))) {
    try {
      const r = leesJson<Record<string, any>>(join(map, f));
      uit.push({ id: String(r.id), taakId: r.taakId ?? null, agent: r.agent ?? null, kanaal: r.kanaal ?? null, tak: r.tak ?? null, commit: r.commit ?? null, uitkomst: r.uitkomst === 'aanvaard' ? 'aanvaard' : 'geweigerd', aangemaakt: String(r.aangemaakt || ''), bestanden: Array.isArray(r.bestanden) ? r.bestanden.length : 0,
        zaken: (Array.isArray(r.zaken) ? r.zaken : []).slice(0, 20).map((z: OrchZaak) => ({ code: tekst(z.code, 60), ernst: z.ernst === 'fout' ? 'fout' : 'waarschuwing', uk: tekst(z.uk, 400), nl: tekst(z.nl, 400) })),
        tests: r.tests ? { overgeslagen: !!r.tests.overgeslagen, geslaagd: Number(r.tests.geslaagd || 0), mislukt: Number(r.tests.mislukt || 0), reden: r.tests.reden ? tekst(r.tests.reden, 200) : undefined } : null });
    } catch { /* kapot record */ }
  }
  return uit.sort((a, b) => (a.aangemaakt < b.aangemaakt ? 1 : -1)).slice(0, 20);
}
function leesWachtrij(beleid: Beleid): OrchOverzicht['wachtrij'] {
  try {
    const w = leesJson<Record<string, any>>(join(wortel(), beleid.integratie.wachtrij));
    return { integratieTak: String(w.integratieTak || beleid.integratie.tak), integratieHoofd: w.integratieHoofd ?? null, bezig: w.bezig ?? null, wachtrij: (Array.isArray(w.wachtrij) ? w.wachtrij : []).map((r: Record<string, any>) => ({ taakId: String(r.taakId), agent: String(r.agent || ''), tak: String(r.tak || ''), staat: String(r.staat || ''), ingediend: String(r.ingediend || ''), kanaal: String(r.kanaal || ''), inleveringId: String(r.inleveringId || '') })) };
  } catch { return null; }
}

function leegOverzicht(repo: OrchOverzicht['repo']): OrchOverzicht {
  return { repo, regels: null, basis: null, integratie: null, geinstalleerd: null, agenten: [], taken: [], wachtrij: null, inleveringen: [], uploads: uploadsLijst(), voorstellen: voorstellenLijst(), bevestigingen: rootBevestigingen(), controleer: null, kanalen: [], tools: ORCH_TOOL_NAMEN, limieten: ORCH_LIMIETEN, schakelaar: { orchRegelsPasskey: orchRechtenOpen() } };
}
function volOverzicht(leeg: OrchOverzicht, beleid: Beleid, lock: Lock | null, taken: OrchTaak[], controle: OrchOverzicht['controleer']): OrchOverzicht {
  return {
    ...leeg,
    regels: { regelsVersie: beleid.regelsVersie, hash: lock?.hash ?? '', kritiekHash: lock?.kritiekHash ?? '', eigenaar: (lock?.eigenaar as OrchOverzicht['regels'] extends infer R ? R extends { eigenaar: infer E } ? E : never : never) ?? null, eigenaarStatus: lock ? (eigenaarStatus(lock, null) as OrchZaak | null) : null, regelBestanden: beleid.regelBestanden, bijgewerkt: String(beleid.bijgewerkt || '') },
    basis: beleid.basis, integratie: { tak: beleid.integratie.tak, basisTak: beleid.integratie.basisTak }, geinstalleerd: leesGeinstalleerd(),
    agenten: beleid.agenten.map((a) => ({ id: a.id, naam: a.naam, kanalen: a.kanalen, adapter: a.adapter, taken: taken.filter((t) => t.agent === a.id).length })),
    taken, wachtrij: leesWachtrij(beleid), inleveringen: leesInleveringen(), controleer: controle, kanalen: beleid.inlevering.kanalen,
  };
}
/**
 * LET OP: synchroon — houdt het hele proces vast zolang git en `controleer` lopen (tot 120 s). Alleen voor tests en diagnose;
 * de routes van de eigenaar en het MCP-hulpmiddel orch_overzicht gebruiken overzichtA() (SEC-002 ai-mcp-09).
 */
export function overzicht(): OrchOverzicht {
  const repo = repoStand();
  const leeg = leegOverzicht(repo);
  if (!repo.aanwezig) return leeg;
  const { beleid, lock } = laadOrch();
  return volOverzicht(leeg, beleid, lock, leesTaken(beleid, lock), controleer());
}
/**
 * Het overzicht zonder de gebeurtenislus vast te houden: git asynchroon (één tegelijk), `controleer` asynchroon, gedeeld tussen
 * gelijktijdige vragers en kort onthouden per stand van de werkkopie. Zelfde inhoud als overzicht().
 * Огляд без блокування всього сайту: git і controleer — асинхронно, по одному, з коротким кешем за станом робочої копії.
 */
export async function overzichtA(): Promise<OrchOverzicht> {
  const { repo, status } = await repoStandA();
  const leeg = leegOverzicht(repo);
  if (!repo.aanwezig) return leeg;
  const { beleid, lock } = laadUit(repo);
  const taken = leesTaken(beleid, lock, await voorouderTabel());
  return volOverzicht(leeg, beleid, lock, taken, await controleerA(controleSleutel(repo, status)));
}

/** De compacte context voor agents zonder GitHub/MCP (orchestratie/CONTEXT-COMPACT.md), zoals hij in de werkkopie staat. */
export function context(): { bestand: string; tekst: string; regelsVersie: string; hash: string } { return contextUit(laadOrch()); }
/** Niet-blokkerende context() voor de route en orch_context (SEC-002 ai-mcp-09). */
export async function contextA(): Promise<ReturnType<typeof context>> { return contextUit(await laadOrchA()); }
function contextUit({ beleid, lock }: { beleid: Beleid; lock: Lock | null }): { bestand: string; tekst: string; regelsVersie: string; hash: string } {
  // Захист у глибину: valideerBeleid уже вимагає orchestratie/<назва>.md, але integratie могли змінити повз сайт.
  if (!CONTEXT_PAD.test(String(beleid.compactContext?.bestand || ''))) fout('BELEID_ONGELDIG', 500, [], 'compactContext.bestand');
  const pad = join(wortel(), beleid.compactContext.bestand);
  return { bestand: beleid.compactContext.bestand, tekst: existsSync(pad) ? readFileSync(pad, 'utf8') : '', regelsVersie: beleid.regelsVersie, hash: lock?.hash ?? '' };
}

// ---------------------------------------------------------------- 1b. taak registreren (zelfde vorm als orch.mjs taak-start)
export function taakStart(input: Record<string, unknown>, door: string): { taak: OrchTaak; zaken: OrchZaak[] } {
  const { beleid, lock } = laadOrch();
  const id = tekst(input.id, 20).toUpperCase();
  const t = { schema: 1, id, agent: tekst(input.agent, 32), tak: tekst(input.tak, 120), basisCommit: tekst(input.basisCommit, 40).toLowerCase(), basisVersie: beleid.basis.versie, regelsVersie: beleid.regelsVersie, regelsHash: lock?.hash ?? null, staat: 'in_progress', gestart: nu(), bijgewerkt: nu(), omschrijving: tekst(input.omschrijving, 300), kanaal: beleid.inlevering.kanalen.includes(String(input.kanaal)) ? String(input.kanaal) : 'mcp', overdrachten: [] as string[], geregistreerdDoor: tekst(door, 120), geregistreerdVia: 'site' };
  const z = valideerTaak(t, beleid) as OrchZaak[];
  if (z.some((x) => x.ernst === 'fout')) fout('TAAK_ONGELDIG', 400, z);
  if (!TAAK_ID.test(id)) fout('TAAK_ONGELDIG', 400, z);
  const pad = join(wortel(), 'orchestratie/taken', `${id}.json`);
  if (existsSync(pad)) fout('TAAK_BESTAAT', 409);
  if (SHA40.test(t.basisCommit) && git('cat-file', '-e', `${t.basisCommit}^{commit}`) === null) z.push({ code: 'BASIS_ONBEKEND', ernst: 'waarschuwing', uk: `базовий commit ${t.basisCommit.slice(0, 12)} невідомий у робочій копії (git fetch?)`, nl: `basiscommit ${t.basisCommit.slice(0, 12)} onbekend in de werkkopie (git fetch?)` });
  schrijfJson(pad, t);
  staatCommit(`orch: taak ${id} geregistreerd via site (${t.agent})`);
  const [taak] = leesTaken(beleid, lock).filter((x) => x.id === id);
  return { taak, zaken: z };
}

/** Alleen de staatbestanden committen (zelfde paden als orch.mjs staat-commit); code van agents raakt dit nooit. */
function staatCommit(bericht: string): string | null {
  const paden = ['orchestratie/taken', 'orchestratie/inleveringen', 'orchestratie/wachtrij.json', 'orchestratie/geinstalleerd.json'].filter((p) => existsSync(join(wortel(), p)));
  if (git('add', '--', ...paden) === null) return null;
  if (!(git('diff', '--cached', '--name-only', '--', ...paden) || '')) return null;
  return git('-c', 'user.name=orch-site', '-c', 'user.email=orch@mijn-ruimte.invalid', 'commit', '-q', '-m', bericht, '--', ...paden) === null ? null : git('rev-parse', 'HEAD');
}

// ---------------------------------------------------------------- 2. inleveren via upload (site / MCP / HTTP API)
const UPLOAD_ID = /^[0-9a-f]{16}$/;
const UPLOAD_NAAM = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(zip|tar\.gz|patch)$/;
const uploadsMap = () => join(inbox(), 'uploads');
const uploadMap = (id: string) => join(uploadsMap(), id);
function leesUpload(id: unknown): OrchUpload {
  const s = String(id || '');
  if (!UPLOAD_ID.test(s) || !existsSync(join(uploadMap(s), 'meta.json'))) fout('UPLOAD_ONBEKEND', 404);
  return leesJson<OrchUpload>(join(uploadMap(s), 'meta.json'));
}
const schrijfUpload = (u: OrchUpload) => schrijfJson(join(uploadMap(u.id), 'meta.json'), u);
export function uploadsLijst(): OrchUpload[] {
  if (!existsSync(uploadsMap())) return [];
  const grens = Date.now() - ORCH_LIMIETEN.uploadVerloopMinuten * 60_000;
  const uit: OrchUpload[] = [];
  for (const id of readdirSync(uploadsMap()).filter((n) => UPLOAD_ID.test(n))) {
    try {
      const u = leesJson<OrchUpload>(join(uploadMap(id), 'meta.json'));
      if (u.staat === 'bezig' && Date.parse(u.begonnen) < grens) { rmSync(uploadMap(id), { recursive: true, force: true }); continue; }
      uit.push(u);
    } catch { rmSync(uploadMap(id), { recursive: true, force: true }); }
  }
  return uit.sort((a, b) => (a.begonnen < b.begonnen ? 1 : -1)).slice(0, 20);
}
export function uploadBegin(input: Record<string, unknown>, door: string, kanaalVoorkeur: 'web_upload' | 'mcp' | 'http_api' = 'web_upload', agent: string | null = null): OrchUpload {
  const { beleid } = laadOrch();
  const naam = tekst(input.naam, 140);
  if (!UPLOAD_NAAM.test(naam)) fout('UPLOAD_NAAM');
  const grootte = Number(input.grootte);
  if (!Number.isInteger(grootte) || grootte <= 0) fout('INHOUD_ONGELDIG');
  if (grootte > ORCH_LIMIETEN.uploadMaxBytes) fout('UPLOAD_TE_GROOT', 413);
  const sha = tekst(input.sha256, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) fout('INHOUD_ONGELDIG');
  const taakId = input.taakId ? tekst(input.taakId, 20).toUpperCase() : null;
  if (taakId && !TAAK_ID.test(taakId)) fout('INHOUD_ONGELDIG');
  const kanaal = ['mcp', 'http_api', 'web_upload'].includes(String(input.kanaal)) ? String(input.kanaal) : kanaalVoorkeur;
  if (!beleid.inlevering.kanalen.includes(kanaal)) fout('INHOUD_ONGELDIG');
  const id = randomBytes(8).toString('hex');
  mkdirSync(uploadMap(id), { recursive: true });
  const u: OrchUpload = { id, naam, grootte, ontvangen: 0, sha256: sha, taakId, kanaal, door: tekst(door, 120), begonnen: nu(), staat: 'bezig', agent: agent ? tekst(agent, 32) : null };
  schrijfUpload(u);
  return u;
}
/** Завантаження належить тому, хто його почав: знання id (16 hex) — не повноваження. Інший актор (інший агент, інша сесія) бачить 404, як для ненаявного. */
function eisEigenUpload(u: OrchUpload, actor: string): void {
  if (!actor || u.door !== tekst(actor, 120)) fout('UPLOAD_ONBEKEND', 404);
}
export function uploadStuk(input: Record<string, unknown>, actor: string): OrchUpload {
  const u = leesUpload(input.id);
  eisEigenUpload(u, actor);
  if (u.staat !== 'bezig') fout('UPLOAD_ONBEKEND', 409);
  const offset = input.offset === undefined ? u.ontvangen : Number(input.offset);
  if (offset !== u.ontvangen) fout('UPLOAD_OFFSET', 409);
  const data = Buffer.from(String(input.data || ''), 'base64');
  if (!data.length) fout('INHOUD_ONGELDIG');
  if (data.length > ORCH_LIMIETEN.stukMaxBytes) fout('UPLOAD_STUK_TE_GROOT', 413);
  if (u.ontvangen + data.length > u.grootte) fout('UPLOAD_TE_GROOT', 413);
  appendFileSync(join(uploadMap(u.id), u.naam), data);
  u.ontvangen += data.length;
  schrijfUpload(u);
  return u;
}
export function uploadAnnuleren(input: Record<string, unknown>, actor: string): { id: string; geannuleerd: true } {
  const u = leesUpload(input.id);
  eisEigenUpload(u, actor);
  rmSync(uploadMap(u.id), { recursive: true, force: true });
  return { id: u.id, geannuleerd: true };
}
/**
 * Завершити завантаження → ТОЙ САМИЙ конвеєр, що й `node scripts/orch.mjs inleveren`: цілісність (SHA-256), гілка від бази, правила,
 * конфлікти, тести, запис у orchestratie/inleveringen, задача ter_integratie, черга; стан закомічено. Відхилена передача → uitkomst
 * 'geweigerd' із zaken (не HTTP-помилка: це результат, який власник має побачити).
 */
type UploadKlaarUit = { upload: OrchUpload; record: Record<string, unknown>; registratie: Record<string, unknown> | null; staatCommit: string | null };
export function uploadKlaar(input: Record<string, unknown>, actor: string): UploadKlaarUit {
  const v = uploadKlaarVoorbereiden(input, actor);
  return uploadKlaarAfronden(v, inleveren(v.opties));
}
/**
 * SEC-002 (ai-mcp-09, afwerking A): dezelfde afronding, maar de pijplijn (unzip/tar, git, controle — tot minuten) draait in een eigen
 * Node-proces (inleverenA) en hier wordt alleen gewacht: de event-loop van de site blijft vrij. Eén afronding tegelijk.
 * Асинхронне завершення: конвеєр в окремому процесі, сайт не зупиняється; по одному.
 */
const klaarRij = eenTegelijkRij();
export function uploadKlaarA(input: Record<string, unknown>, actor: string): Promise<UploadKlaarUit> {
  return klaarRij(async () => {
    const v = uploadKlaarVoorbereiden(input, actor);
    return uploadKlaarAfronden(v, await inleverenA(v.opties));
  });
}
function uploadKlaarVoorbereiden(input: Record<string, unknown>, actor: string) {
  const { beleid, lock } = laadOrch();
  const u = leesUpload(input.id);
  eisEigenUpload(u, actor);
  if (u.staat !== 'bezig') fout('UPLOAD_ONBEKEND', 409);
  if (u.ontvangen !== u.grootte) fout('UPLOAD_ONVOLLEDIG', 409);
  const pad = join(uploadMap(u.id), u.naam);
  const sha = createHash('sha256').update(readFileSync(pad)).digest('hex');
  if (sha !== u.sha256) { u.staat = 'mislukt'; schrijfUpload(u); fout('UPLOAD_SHA_VERSCHILT', 409); }
  // Безпека: через HTTP/MCP ніколи не виконуються довільні shell-команди і ніколи не запускається код із завантаженого пакета.
  if (input.tests !== undefined) {
    if (!Array.isArray(input.tests) || (input.tests as unknown[]).some((t) => typeof t !== 'string' || t.trim() !== 'node scripts/orch.mjs controleer')) {
      fout('TESTS_NIET_TOEGESTAAN', 400);
    }
  }
  // verwachteAgent: завантаження MCP-агента приймається лише з ORCH-OVERDRACHT.json від імені того самого агента (AGENT_VERSCHILT);
  // door — хто фактично доставив (власник або MCP-підключення з grant-id) — лишається в записі передачі.
  const opties = { wortel: wortel(), beleid, lock, bron: pad, kanaal: u.kanaal, taakId: u.taakId ?? null, alleenVeiligeControle: true, zonderTests: input.zonderTests ? tekst(input.zonderTests, 300) : null, verwachteAgent: u.agent ?? null, door: u.door };
  return { u, pad, opties };
}
function uploadKlaarAfronden(v: ReturnType<typeof uploadKlaarVoorbereiden>, record: ReturnType<typeof inleveren>): UploadKlaarUit {
  const { u, pad } = v;
  const registratie = registreerInlevering(wortel(), record) as Record<string, unknown>;
  const commit = staatCommit(`orch: inlevering ${record.id} (${record.uitkomst}) via ${u.kanaal}`);
  u.staat = record.uitkomst === 'aanvaard' ? 'klaar' : 'mislukt';
  schrijfUpload(u);
  // Het pakket zelf hoeft niet te blijven: de tak in git is de bron; het record bewaart de sha256 (bronSha256).
  rmSync(pad, { force: true });
  return { upload: u, record, registratie, staatCommit: commit };
}

// ---------------------------------------------------------------- 3. regels: voorstel → besluit (passkey, root) → toepassen
const voorstellenMap = () => join(inbox(), 'voorstellen');
type VoorstelVol = OrchVoorstel & { bestanden: Record<string, string>; lock: Lock };
function leesVoorstel(id: unknown): VoorstelVol {
  const s = String(id || '').toLowerCase();
  if (!VOORSTEL_ID.test(s) || !existsSync(join(voorstellenMap(), `${s}.json`))) fout('GEEN_VOORSTEL', 404);
  return leesJson<VoorstelVol>(join(voorstellenMap(), `${s}.json`));
}
const schrijfVoorstel = (v: VoorstelVol) => schrijfJson(join(voorstellenMap(), `${v.id}.json`), v);
const zonderInhoud = ({ bestanden: _b, lock: _l, ...rest }: VoorstelVol): OrchVoorstel => rest;
export function voorstellenLijst(): OrchVoorstel[] {
  if (!existsSync(voorstellenMap())) return [];
  const grens = Date.now() - ORCH_LIMIETEN.voorstelVerloopUur * 3_600_000;
  const uit: OrchVoorstel[] = [];
  for (const f of readdirSync(voorstellenMap()).filter((n) => n.endsWith('.json'))) {
    try {
      const v = leesJson<VoorstelVol>(join(voorstellenMap(), f));
      if (v.staat === 'ontwerp' && Date.parse(v.aangemaakt) < grens) { rmSync(join(voorstellenMap(), f), { force: true }); continue; }
      uit.push(zonderInhoud(v));
    } catch { rmSync(join(voorstellenMap(), f), { force: true }); }
  }
  return uit.sort((a, b) => (a.aangemaakt < b.aangemaakt ? 1 : -1)).slice(0, 20);
}
export function regelsOverzicht(): OrchRegelsOverzicht { return regelsOverzichtUit(laadOrch()); }
/** Niet-blokkerende regelsOverzicht() voor de route (SEC-002 ai-mcp-09). */
export async function regelsOverzichtA(): Promise<OrchRegelsOverzicht> { return regelsOverzichtUit(await laadOrchA()); }
function regelsOverzichtUit({ beleid, lock, bestanden, repo }: ReturnType<typeof laadOrch>): OrchRegelsOverzicht {
  return { regelsVersie: beleid.regelsVersie, hash: lock?.hash ?? '', kritiekHash: lock?.kritiekHash ?? '', eigenaar: (lock?.eigenaar ?? null) as OrchRegelsOverzicht['eigenaar'], eigenaarStatus: lock ? (eigenaarStatus(lock, null) as OrchZaak | null) : null, bestanden, voorstellen: voorstellenLijst(), bevestigingen: rootBevestigingen(), schakelaar: { orchRegelsPasskey: orchRechtenOpen() }, repo };
}
/** Чернетка: власник надсилає нові тексти файлів правил; оцінка — чиста функція kern.beoordeelVoorstel. Повертає пропозицію з verschil. */
export function voorstelMaken(input: Record<string, unknown>, door: string): { voorstel: OrchVoorstel; zaken: OrchZaak[] } {
  const huidig = laadOrch();
  const ruw = input.bestanden && typeof input.bestanden === 'object' && !Array.isArray(input.bestanden) ? input.bestanden as Record<string, unknown> : null;
  if (!ruw) fout('INHOUD_ONGELDIG');
  const bestanden: Record<string, string> = {};
  for (const [p, t] of Object.entries(ruw!)) {
    if (typeof t !== 'string') fout('INHOUD_ONGELDIG');
    if (Buffer.byteLength(t as string) > ORCH_LIMIETEN.regelBestandMaxBytes) fout('INHOUD_ONGELDIG', 413);
    bestanden[tekst(p, 200)] = t as string;
  }
  const r = beoordeelVoorstel({ beleid: huidig.beleid, bestanden: huidig.bestanden, lock: huidig.lock }, { bestanden }) as { zaken: OrchZaak[]; regelsVersie?: string; hash?: string; kritiekHash?: string; kritiekGewijzigd?: boolean; verschil?: OrchVoorstel['verschil']; bestanden?: Record<string, string>; lock?: Lock };
  if (r.zaken.some((z) => z.ernst === 'fout') || !r.lock) fout('VOORSTEL_ONGELDIG', 400, r.zaken);
  const v: VoorstelVol = { id: randomBytes(12).toString('hex'), aangemaakt: nu(), door: tekst(door, 120), staat: 'ontwerp', regelsVersie: r.regelsVersie!, hash: r.hash!, kritiekHash: r.kritiekHash!, kritiekGewijzigd: !!r.kritiekGewijzigd, basisHash: huidig.lock?.hash ?? null, basisVersie: huidig.beleid.regelsVersie, verschil: r.verschil!, bestanden, lock: r.lock };
  schrijfVoorstel(v);
  return { voorstel: zonderInhoud(v), zaken: r.zaken };
}
export function voorstelLezen(id: unknown): VoorstelVol { return leesVoorstel(id); }
export function voorstelIntrekken(id: unknown): OrchVoorstel {
  const v = leesVoorstel(id);
  if (v.staat === 'ontwerp') { v.staat = 'ingetrokken'; schrijfVoorstel(v); }
  return zonderInhoud(v);
}
/** Vóór het besluit (eigenaar-besluit.ts starten): bestaat het ontwerp nog en hoort het bij de HUIDIGE regels? */
export function voorstelVoorBesluit(id: unknown): { regelsVersie: string; hash: string; kritiekHash: string; voorstel: string } {
  const v = leesVoorstel(id);
  if (v.staat !== 'ontwerp') fout('GEEN_VOORSTEL', 409);
  const { lock } = laadOrch();
  if ((lock?.hash ?? null) !== v.basisHash) fout('VOORSTEL_VEROUDERD', 409);
  return { regelsVersie: v.regelsVersie, hash: v.hash, kritiekHash: v.kritiekHash, voorstel: v.id };
}

export type BesluitVoorToepassen = { id: string; passkey: string; inhoud: { regelsVersie: string; hash: string; kritiekHash: string; voorstel: string } };
/**
 * Застосувати підтверджену пропозицію: лише коли (а) рішення власника «orch-regels» виконане й стосується саме цієї пропозиції,
 * (б) root записав підтвердження у власний файл, (в) чинні правила не змінилися. Тоді: гілка regels/<versie>-<tijd>, файли, lock з
 * eigenaar.soort='passkey' (kern.bevestigMetPasskey), CONTEXT-COMPACT.md, `orch controleer` (при помилці все відкидається), commit, push.
 */
type ToepasUitslag = { voorstel: OrchVoorstel; tak: string; commit: string; gepusht: boolean; prUrl: string | null; controleer: string[]; pushDetail: string };
/**
 * SEC-002 (ai-mcp-09): de twee stappen die lang kunnen duren — `orch controleer` (tot 120 s) en `git push` (netwerk, tot 90 s) —
 * lopen asynchroon, zodat de site intussen blijft antwoorden. Daardoor kunnen andere verzoeken tussendoor komen: twee aanvragen
 * «toepassen» gaan daarom één voor één (toepasRij), en ná de controle wordt opnieuw gekeken of het ontwerp nog «ontwerp» is en
 * de geldende regels dezelfde zijn (intrekken of een regelwijziging tijdens het wachten → niets vastleggen).
 */
export function voorstelToepassen(id: unknown, besluit: BesluitVoorToepassen): Promise<ToepasUitslag> {
  return toepasRij(() => voorstelToepassenBinnen(id, besluit));
}
async function voorstelToepassenBinnen(id: unknown, besluit: BesluitVoorToepassen): Promise<ToepasUitslag> {
  const v = leesVoorstel(id);
  if (v.staat !== 'ontwerp') fout('GEEN_VOORSTEL', 409);
  const i = besluit?.inhoud;
  if (!i || i.voorstel !== v.id || i.hash !== v.hash || i.kritiekHash !== v.kritiekHash || i.regelsVersie !== v.regelsVersie) fout('BESLUIT_PAST_NIET', 409);
  const besluitKort = String(besluit?.id || '').replace(/-/g, '').toLowerCase();
  const bevestigd = rootBevestigingen().find((b) => String(b.besluit || '').replace(/-/g, '').toLowerCase() === besluitKort
    && b.voorstel === v.id && b.hash === v.hash && b.kritiekHash === v.kritiekHash && b.regelsVersie === v.regelsVersie);
  if (!bevestigd) fout('NIET_BEVESTIGD_DOOR_ROOT', 409);
  const huidig = laadOrch();
  if ((huidig.lock?.hash ?? null) !== v.basisHash) fout('VOORSTEL_VEROUDERD', 409);
  if (!huidig.repo.schoon) fout('ORCH_REPO_VUIL', 409);
  // Opnieuw beoordelen tegen de HUIDIGE staat: het ontwerp mag niets anders opleveren dan waarover getekend is.
  const r = beoordeelVoorstel({ beleid: huidig.beleid, bestanden: huidig.bestanden, lock: huidig.lock }, { bestanden: v.bestanden }) as { zaken: OrchZaak[]; hash?: string; kritiekHash?: string; beleid?: Beleid; bestanden?: Record<string, string>; lock?: Lock };
  if (r.zaken.some((z) => z.ernst === 'fout') || r.hash !== v.hash || r.kritiekHash !== v.kritiekHash || !r.lock) fout('VOORSTEL_VEROUDERD', 409, r.zaken);
  const b = bevestigMetPasskey(r.lock, { regelsVersie: v.regelsVersie, hash: v.hash, kritiekHash: v.kritiekHash, voorstel: v.id, passkey: bevestigd.passkey, besluit: besluit.id, op: bevestigd.tijd || nu() }) as { lock?: Lock; fout?: OrchZaak };
  if (!b.lock) fout('BESLUIT_PAST_NIET', 409, b.fout ? [b.fout] : []);

  // Ізольований тимчасовий git worktree: ORCH_WORTEL ніколи не перемикає HEAD, тому паралельні читання/задачі не стикаються.
  // База — SHA, перевірений щойно (huidig.repo.hoofd), а не назва гілки: між перевіркою і worktree add гілку могли пересунути (TOCTOU).
  const basisRef = /^[0-9a-f]{40}$/.test(String(huidig.repo.hoofd || '')) ? huidig.repo.hoofd : (huidig.repo.tak && huidig.repo.tak !== 'HEAD' ? huidig.repo.tak : huidig.repo.hoofd);
  const tak = `regels/${v.regelsVersie}-${stempel()}`;
  const werk = mkdtempSync(join(tmpdir(), 'orch-regels-'));
  const boom = join(werk, 'boom');
  let commit = '';
  let controleRegels: string[] = [];
  const gw = (...a: string[]): string | null => {
    try { return execFileSync('git', a, { cwd: boom, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }).trim(); } catch { return null; }
  };
  const verwijderTak = () => { spawnSync('git', ['worktree', 'remove', '--force', boom], { cwd: wortel() }); spawnSync('git', ['worktree', 'prune'], { cwd: wortel() }); git('branch', '-D', tak); };
  // Спершу гілку створюємо самі (git branch відмовить, якщо така вже є — тоді нічого чужого не видаляємо), потім worktree без -b.
  // worktree add може повернути помилку, лишивши і дерево, і гілку (напр. post-checkout hook з кодом 1) — тоді прибираємо обидва.
  // Eerst zelf de tak maken (faalt als hij bestaat → niets van een ander verwijderen); mislukt worktree add, dan boom én tak opruimen.
  if (git('branch', tak, basisRef) === null) { rmSync(werk, { recursive: true, force: true }); fout('GIT_FOUT', 500, [], `git branch ${tak}`); }
  if (git('worktree', 'add', '-q', boom, tak) === null) { verwijderTak(); rmSync(werk, { recursive: true, force: true }); fout('GIT_FOUT', 500, [], `git worktree add ${tak}`); }
  try {
    for (const [p, t] of Object.entries(v.bestanden)) { mkdirSync(join(boom, p, '..'), { recursive: true }); writeFileSync(join(boom, p), t); }
    schrijfJson(join(boom, LOCK), b.lock);
    const beleidNieuw = r.beleid!;
    if (!CONTEXT_PAD.test(String(beleidNieuw.compactContext?.bestand || ''))) { verwijderTak(); fout('BELEID_ONGELDIG', 409, [], 'compactContext.bestand'); }
    writeFileSync(join(boom, beleidNieuw.compactContext.bestand), compacteContext(r.bestanden!['AGENTS.md'] ?? readFileSync(join(boom, 'AGENTS.md'), 'utf8'), beleidNieuw, b.lock));
    const cr = await draaiA(process.execPath, [join(wortel(), 'scripts/orch.mjs'), 'controleer', '--wortel', boom], { cwd: boom, timeoutMs: controleInstelling.timeoutMs, env: LEES_GIT_ENV() });
    const cRegels = `${cr.stdout ?? ''}${cr.stderr ?? ''}`.trim().split('\n').filter(Boolean);
    if ((cr.status ?? 1) !== 0) { verwijderTak(); fout('CONTROLE_MISLUKT', 409, [], cRegels.slice(-30).join('\n')); }
    // Tijdens het wachten op de controle kon er iets veranderen (zie de toelichting bij voorstelToepassen): opnieuw kijken vóór de commit.
    let nogOntwerp = false, zelfdeRegels = false;
    try { nogOntwerp = leesVoorstel(v.id).staat === 'ontwerp'; } catch { nogOntwerp = false; }
    if (!nogOntwerp) { verwijderTak(); fout('GEEN_VOORSTEL', 409); }
    try { zelfdeRegels = (laadOrch().lock?.hash ?? null) === v.basisHash; } catch { zelfdeRegels = false; }
    if (!zelfdeRegels) { verwijderTak(); fout('VOORSTEL_VEROUDERD', 409); }
    if (gw('add', '-A', '--', ...huidig.beleid.regelBestanden, LOCK, beleidNieuw.compactContext.bestand) === null) { verwijderTak(); fout('GIT_FOUT', 500, [], 'git add'); }
    const bericht = `ORCH regels ${v.regelsVersie}: bevestigd door eigenaar (passkey ${bevestigd.passkey}, besluit ${besluit.id})\n\nVoorstel ${v.id} via mcp.* /agenten → Координація. kritiekHash ${v.kritiekHash}${v.kritiekGewijzigd ? ' (kritiek gewijzigd)' : ''}.`;
    if (gw('-c', 'user.name=orch-site', '-c', 'user.email=orch@mijn-ruimte.invalid', 'commit', '-q', '-m', bericht) === null) { verwijderTak(); fout('GIT_FOUT', 500, [], 'git commit'); }
    commit = gw('rev-parse', 'HEAD') || '';
    controleRegels = [`commit ${commit.slice(0, 12)}`, ...cRegels.slice(-6)];
  } catch (e) {
    if (!(e instanceof OrchFout)) { verwijderTak(); fout('GIT_FOUT', 500, [], tekst((e as Error).message, 300)); }
    throw e;
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', boom], { cwd: wortel() });
    spawnSync('git', ['worktree', 'prune'], { cwd: wortel() });
    rmSync(werk, { recursive: true, force: true });
  }
  const heeftOrigin = !!git('remote', 'get-url', 'origin');
  const push = heeftOrigin ? await draaiA('git', ['push', '-q', '-u', 'origin', tak], { cwd: wortel(), timeoutMs: 90_000 }) : null;
  const gepusht = !!push && push.status === 0;
  const m = /github\.com[:/]([^/]+\/[^/.]+)/.exec(git('remote', 'get-url', 'origin') || '');
  const prUrl = m && gepusht ? `https://github.com/${m[1]}/compare/${encodeURIComponent(huidig.beleid.integratie.tak)}...${encodeURIComponent(tak)}?expand=1` : null;
  v.staat = 'toegepast'; v.toegepast = { tak, commit, gepusht, op: nu(), besluit: besluit.id };
  schrijfVoorstel(v);
  return { voorstel: zonderInhoud(v), tak, commit, gepusht, prUrl, controleer: controleRegels, pushDetail: push ? tekst(veiligeOrigin(`${push.stderr || ''}`).trim().split('\n').slice(-2).join(' | '), 300) : 'geen origin' };
}

/** Voor tests en diagnose: de kern van «vergrendel» op de werkkopie (zonder eigenaar), zoals orch.mjs vergrendel. */
export function lockVoorbeeld(): Lock | { fout: OrchZaak } {
  const { beleid, bestanden, lock } = laadOrch();
  const r = vergrendel(beleid, bestanden, lock) as { lock?: Lock; fout?: OrchZaak };
  return r.lock ?? { fout: r.fout! };
}
