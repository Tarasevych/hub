// ZOEKEN — HANDMATIGE INDEXATIE VANUIT HET TECHNISCH PROFIEL (zone D, 22.10.2026). Vraag van de eigenaar: «кнопка для примусового
// запуску повної або часткової індексації; процес і результати у плаваючому вікні». Documentatie: docs/zoek/ZOEK-BEHEER.md §5.
//
// WAT HIER STAAT
//   • POST /api/owner/zoek/index/starten      {modus:'volledig'|'gedeeltelijk', bronnen?, sinds?} → run (één per mens tegelijk)
//   • POST /api/owner/zoek/index/stand        → de lopende/laatste run + de echte stand van de bronnen + de wachtrij van DEZE laden
//   • POST /api/owner/zoek/index/stoppen      → stopsignaal + de geplande scanstappen van deze laden vervallen
//   • POST /api/owner/zoek/index/geschiedenis → de eigen handmatige runs en de cron-runs (app.cron_runs)
//
// REGELS
//   1. Alleen met een LOPENDE technische activering in dit tabblad (backend/tech-profiel.ts → actieveActivatie): voor een gewone
//      gebruiker bestaan deze routes niet (403 ZOEK_INDEX_TECH_PROFIEL_VEREIST). De knop staat ook alleen in het technisch profiel.
//   2. De laden zijn PRECIES die welke dit tabblad doorzoekt (backend/globaal-zoek.ts → ladeGroepen: persoonlijk + technisch
//      volgens rechten en dienststand). Nooit een andere mens: de run pakt uit de wachtrij uitsluitend items van deze laden
//      (zoekOphalen met `alleen`), en de waarnemer telt alleen gebeurtenissen van deze mens.
//   3. Nooit twee indexeerders tegelijk: dezelfde Postgres-advisory-lock als de cron (cron:zoek-index, server/cron.ts en
//      backend/sleutelkluis-achtergrond.ts). Is hij bezet, dan loopt de cron: de run «sluit aan» (status aangesloten) en volgt
//      de wachtrij van deze laden tot ze leeg is — zonder zelf te verwerken.
//   4. Grenzen uit ENV: ZOEK_BEHEER_RUN_MS (standaard 10 min), ZOEK_BEHEER_ITEMS (standaard 2000). Daarna stopt de run netjes
//      (status tijd/limiet); de cron pakt de rest. «Зупинити» stopt na het lopende item en laat de geplande stappen vervallen.
//   5. Elke start en stop staat in het auditjournaal (zoek.index.starten / zoek.index.stoppen) en in app.cron_runs als
//      'zoek-index@handmatig' (detail: tellers, nooit inhoud) — zo ziet admin → Diagnostiek hem naast de cron.
//   6. Volledig = de waterlijn van ELKE bron terug naar 0 (alles opnieuw lezen; de kern slaat ongewijzigde versies over) + de
//      afstemming op verdwenen rijen. Gedeeltelijk = alleen de gekozen bronnen: zonder datum helemaal opnieuw (waterlijn 0), met
//      `sinds` de waterlijn terug tot die datum (nooit vooruit; een bron die nog nooit gescand werd blijft op 0 — anders zouden de
//      rijen van vóór de datum nooit in de index komen). Zie nieuweWaterlijn(). «Вкладення» = de mailscan (bijlage-items volgen
//      uit de mailrijen met bijlagen).
import { randomUUID } from 'node:crypto';
import { error, json } from '../../server/platform';
import { getPool } from '../../server/platform/pg';
import { auditToevoegen } from '../../server/platform/audit';
import type { Lade } from '../../shared/ruimte-scheiding';
import { isZoekBron, type ZoekBron } from '../../shared/zoek-model';
import { actieveActivatie } from '../tech-profiel';
import { ladeGroepen } from '../globaal-zoek';
import { standZetten, standenVanLade, zoekWaarnemen, type ZoekGebeurtenis } from '../zoek-index';
import { INDEX_BRONNEN, UI_BRONNEN, verwerkWachtItem, _intern } from './bronnen';
import type { ZoekBronStand } from '../../shared/zoek-model';
import { VOLLEDIG_ID, zoekMelden, zoekOphalen, zoekOpenPerBron, zoekStappenAnnuleren, type Q, type WachtItem } from './wachtrij';

// ---------------------------------------------------------------- instellingen (ENV-VARS.md)
const env = (k: string, std: number, min: number, max: number) => { const v = Number(process.env[k]); return Number.isFinite(v) && v > 0 ? Math.max(min, Math.min(max, v)) : std; };
export const BEHEER = Object.freeze({
  /** Tijd per handmatige run (ms); daarna stopt hij netjes en pakt de cron de rest. */
  runMs: () => env('ZOEK_BEHEER_RUN_MS', 10 * 60_000, 5_000, 60 * 60_000),
  /** Hoogstens zoveel wachtrij-items per handmatige run. */
  items: () => env('ZOEK_BEHEER_ITEMS', 2000, 1, 20_000),
  /** Polling in de aangesloten modus (cron loopt), ms. */
  volgMs: 1500,
});
export const LOCK_NAAM = 'cron:zoek-index';
export const CRON_NAAM = 'zoek-index@handmatig';
const FOUTEN_MAX = 50;
const RING_MAX = 20;
const sys: Q = (sql, p = []) => getPool('systeem').query(sql, p) as any;

// ---------------------------------------------------------------- de run
export type RunModus = 'volledig' | 'gedeeltelijk';
export type RunStatus = 'loopt' | 'aangesloten' | 'klaar' | 'gestopt' | 'tijd' | 'limiet' | 'fout';
export type RunStap = { bron: ZoekBron; ruimte: Lade['ruimte']; actie: string; id: string; sinds: number };
export type RunTelling = { bron: ZoekBron; ruimte: Lade['ruimte']; stappen: number; items: number; toegevoegd: number; bijgewerkt: number; overgeslagen: number; verwijderd: number; ocr: number; fouten: number; opnieuw: number; uitgesteld: number };
export type RunFout = { bron: ZoekBron; ruimte: Lade['ruimte']; id: string; code: string; op: number; definitief: boolean };
export type RunLade = { ruimte: Lade['ruimte']; bronnen: ZoekBron[] };
export type Run = {
  id: string; userId: string; modus: RunModus; bronnen: ZoekBron[]; laden: RunLade[]; sinds: number;
  begin: number; eind: number; status: RunStatus; stap: RunStap | null; gepland: number; verwerkt: number; klaar: number;
  tellingen: RunTelling[]; fouten: RunFout[]; fout: string; stop: boolean; cronRunId: number | null; budgetMs: number; limiet: number;
};
/** Wat de client ziet (zonder userId en interne velden). */
export type RunWeergave = Omit<Run, 'userId' | 'stop' | 'cronRunId'> & { duurMs: number; wachtend: number; bezig: number };

const lopend = new Map<string, Run>();                 // userId → lopende run
const ring = new Map<string, Run[]>();                 // userId → laatste runs (in het geheugen; app.cron_runs blijft na herstart)
const mapKey = (ruimte: string, bron: string) => `${ruimte}:${bron}`;

export const nieuweRun = (userId: string, modus: RunModus, bronnen: ZoekBron[], laden: RunLade[], sinds: number): Run => ({
  id: randomUUID(), userId, modus, bronnen, laden, sinds, begin: Date.now(), eind: 0, status: 'loopt', stap: null, gepland: 0, verwerkt: 0, klaar: 0,
  tellingen: [], fouten: [], fout: '', stop: false, cronRunId: null, budgetMs: BEHEER.runMs(), limiet: BEHEER.items(),
});
function telling(run: Run, ruimte: Lade['ruimte'], bron: ZoekBron): RunTelling {
  let t = run.tellingen.find((x) => x.ruimte === ruimte && x.bron === bron);
  if (!t) { t = { bron, ruimte, stappen: 0, items: 0, toegevoegd: 0, bijgewerkt: 0, overgeslagen: 0, verwijderd: 0, ocr: 0, fouten: 0, opnieuw: 0, uitgesteld: 0 }; run.tellingen.push(t); }
  return t;
}
/** Zuiver: een gebeurtenis van de kern optellen bij de run (alleen van DEZE mens). */
export function telGebeurtenis(run: Run, g: ZoekGebeurtenis): boolean {
  if (g.lade.userId !== run.userId) return false;
  const t = telling(run, g.lade.ruimte, g.bron);
  t.toegevoegd += g.toegevoegd; t.bijgewerkt += g.bijgewerkt; t.overgeslagen += g.overgeslagen; t.verwijderd += g.verwijderd; t.ocr += g.ocr;
  return true;
}
/** Zuiver: de bronkeuze van het verzoek → bronnen die Z2 kent (ui dekt pagina/instelling/hulp; bijlage → de mailscan). */
export function bronnenKiezen(ruw: unknown, modus: RunModus): ZoekBron[] {
  const lijst = (Array.isArray(ruw) ? ruw.map(String) : []).filter(isZoekBron);
  if (!lijst.length) return modus === 'volledig' ? [...INDEX_BRONNEN] : [];
  const uit = new Set<ZoekBron>();
  for (const b of lijst) { if (UI_BRONNEN.includes(b)) uit.add('ui'); else if (b === 'bijlage') uit.add('bijlage'); else if ((INDEX_BRONNEN as readonly string[]).includes(b)) uit.add(b); }
  return INDEX_BRONNEN.filter((b) => uit.has(b));
}
/**
 * Zuiver: de nieuwe waterlijn (ms) van een bron voor een handmatige run. volledig → 0; gedeeltelijk zonder datum → 0 (de gekozen
 * bronnen helemaal opnieuw); gedeeltelijk met datum → min(huidig, sinds) — nooit vooruit, en een bron die nog nooit gescand werd
 * (huidig 0) blijft 0: een waterlijn op de datum zou de oudere, nooit geïndexeerde rijen voorgoed overslaan.
 */
export function nieuweWaterlijn(huidig: number, modus: RunModus, sinds: number): number {
  if (modus === 'volledig' || !(sinds > 0) || !(huidig > 0)) return 0;
  return Math.min(huidig, sinds);
}
/** Zuiver: welke stappen worden gepland voor deze laden en bronnen (bijlage → de mailscan; `terug` markeert dat). */
export function stappenPlannen(laden: RunLade[], bronnen: readonly ZoekBron[]): Array<{ ruimte: Lade['ruimte']; bron: ZoekBron; terug: boolean }> {
  const uit: Array<{ ruimte: Lade['ruimte']; bron: ZoekBron; terug: boolean }> = [];
  for (const l of laden) {
    const eigen = new Set(l.bronnen.map((b) => (UI_BRONNEN.includes(b) ? 'ui' : b)));
    for (const bron of bronnen) {
      if (bron === 'bijlage') { if (!eigen.has('mail')) continue; const m = uit.find((x) => x.ruimte === l.ruimte && x.bron === 'mail'); if (m) m.terug = true; else uit.push({ ruimte: l.ruimte, bron: 'mail', terug: true }); continue; }
      if (!eigen.has(bron)) continue;
      const al = uit.find((x) => x.ruimte === l.ruimte && x.bron === bron);
      if (al) continue;
      uit.push({ ruimte: l.ruimte, bron, terug: false });
    }
  }
  return uit;
}
export const weergave = (run: Run, open: { wachtend: number; bezig: number } = { wachtend: 0, bezig: 0 }): RunWeergave => {
  const { userId: _u, stop: _s, cronRunId: _c, ...rest } = run;
  return { ...rest, duurMs: (run.eind || Date.now()) - run.begin, wachtend: open.wachtend, bezig: open.bezig };
};

// ---------------------------------------------------------------- plannen
async function plannen(run: Run): Promise<number> {
  let n = 0;
  for (const s of stappenPlannen(run.laden, run.bronnen)) {
    const lade: Lade = { userId: run.userId, ruimte: s.ruimte };
    const z = await _intern.z2Stand(lade, s.bron);
    const w = nieuweWaterlijn(z.waterlijn, run.modus, run.sinds);
    // ICS/CalDAV (agenda) heeft een eigen waterlijn in de cursor; dezelfde regel. Andere bronnen: cursor leeg bij «van voren af aan».
    const cursor = s.bron === 'agenda' ? { ...z.cursor, externWaterlijn: nieuweWaterlijn(Number(z.cursor.externWaterlijn) || 0, run.modus, run.sinds) } : w === 0 ? {} : z.cursor;
    // volledigOp 0: de afstemming op verdwenen rijen (alleen id's) en de volledige GitHub-lezing lopen in deze run.
    await _intern.z2StandZetten(lade, s.bron, { waterlijn: w, waterlijnId: '', volledigOp: 0, cursor });
    if (s.bron === 'ui') await standZetten(lade, 'ui', { versie: '' });   // de catalogus heeft geen datums: altijd opnieuw (goedkoop)
    n += await zoekMelden(sys, [{ userId: run.userId, ruimte: s.ruimte, bron: s.bron, bronId: VOLLEDIG_ID, actie: 'volledig' }]);
  }
  return n;
}
async function openVoor(run: Run): Promise<{ wachtend: number; bezig: number }> {
  let wachtend = 0, bezig = 0;
  for (const l of run.laden) for (const v of Object.values(await zoekOpenPerBron(sys, { userId: run.userId, ruimte: l.ruimte }))) { wachtend += v.wachtend; bezig += v.bezig; }
  return { wachtend, bezig };
}
const slaap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- uitvoeren
async function uitvoeren(run: Run): Promise<void> {
  const client = await getPool('systeem').connect();
  let af: (() => void) | null = null, lock = false;
  try {
    run.cronRunId = Number((await client.query('INSERT INTO app.cron_runs (name, detail) VALUES ($1, $2) RETURNING id', [CRON_NAAM, detailVan(run)])).rows[0]?.id) || null;
    const ruimtes = run.laden.map((l) => l.ruimte);
    while (!run.stop) {
      if (Date.now() - run.begin > run.budgetMs) { run.status = 'tijd'; break; }
      if (!lock) {
        lock = (await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [LOCK_NAAM])).rows[0]?.ok === true;
        if (!lock) {
          // De cron, de achtergrondronde of de run van een andere mens loopt: aansluiten — de wachtrij van DEZE laden volgen, en
          // elke ronde het slot opnieuw proberen (zodra het vrij is, verwerkt deze run zelf verder).
          run.status = 'aangesloten';
          const o = await openVoor(run);
          if (o.wachtend + o.bezig === 0) { run.status = 'klaar'; break; }
          await slaap(BEHEER.volgMs); continue;
        }
        run.status = 'loopt';
        af = zoekWaarnemen((g) => { telGebeurtenis(run, g); });
      }
      if (run.verwerkt >= run.limiet) { run.status = 'limiet'; break; }
      const items: WachtItem[] = await zoekOphalen(sys, Math.min(5, run.limiet - run.verwerkt), { userId: run.userId, ruimtes });
      if (!items.length) {
        // Niets te pakken: nog iets 'bezig' (van een vorige, gecrashte run; lease loopt af) of echt klaar.
        const o = await openVoor(run);
        if (o.bezig > 0) { await slaap(BEHEER.volgMs); continue; }
        run.status = 'klaar'; break;
      }
      for (const it of items) {
        if (it.userId !== run.userId) { run.fouten.push({ bron: it.bron, ruimte: it.ruimte, id: '', code: 'ZOEK_INDEX_VREEMD_ITEM', op: Date.now(), definitief: true }); continue; }  // kan niet (zoekOphalen filtert), maar nooit stil
        run.stap = { bron: it.bron, ruimte: it.ruimte, actie: it.actie, id: it.bronId === VOLLEDIG_ID ? '' : it.bronId.slice(0, 48), sinds: Date.now() };
        const t = telling(run, it.ruimte, it.bron);
        if (it.actie === 'volledig') t.stappen++; else t.items++;
        const uit = await verwerkWachtItem(it);
        run.verwerkt++;
        if (uit === 'klaar') run.klaar++;
        else {
          const code = String((await sys('SELECT last_error FROM app.zoek_wachtrij WHERE id = $1', [it.id])).rows[0]?.last_error || uit).slice(0, 120);
          if (uit === 'fout') t.fouten++; else if (uit === 'uitgesteld') t.uitgesteld++; else t.opnieuw++;
          if (run.fouten.length < FOUTEN_MAX) run.fouten.push({ bron: it.bron, ruimte: it.ruimte, id: it.bronId === VOLLEDIG_ID ? '' : it.bronId.slice(0, 48), code, op: Date.now(), definitief: uit === 'fout' });
        }
        run.stap = null;
        if (run.stop || Date.now() - run.begin > run.budgetMs) break;
      }
    }
    if (run.stop) run.status = 'gestopt';
  } catch (e) {
    run.status = 'fout'; run.fout = (e instanceof Error ? e.message : 'ZOEK_INDEX_RUN_MISLUKT').slice(0, 200);
  } finally {
    af?.();
    run.stap = null; run.eind = Date.now();
    if (run.cronRunId) await client.query('UPDATE app.cron_runs SET finished_at = now(), status = $2, detail = $3 WHERE id = $1', [run.cronRunId, run.status === 'fout' ? 'error' : 'ok', detailVan(run)]).catch(() => undefined);
    if (lock) await client.query('SELECT pg_advisory_unlock_all()').catch(() => undefined);
    client.release();
    lopend.delete(run.userId);
    const r = ring.get(run.userId) || []; r.unshift(run); ring.set(run.userId, r.slice(0, RING_MAX));
  }
}
/** Tellers voor app.cron_runs.detail (≤ 500 tekens): nooit titels, id's of tekst. `gebruiker=` is de sleutel waarop de geschiedenis filtert. */
export function detailVan(run: Run): string {
  const som = (k: keyof RunTelling) => run.tellingen.reduce((a, t) => a + Number(t[k] || 0), 0);
  return `gebruiker=${run.userId} modus=${run.modus} bronnen=${run.bronnen.join(',')} laden=${run.laden.map((l) => l.ruimte).join(',')} sinds=${run.sinds || 0} status=${run.status} verwerkt=${run.verwerkt} klaar=${run.klaar} toegevoegd=${som('toegevoegd')} bijgewerkt=${som('bijgewerkt')} verwijderd=${som('verwijderd')} overgeslagen=${som('overgeslagen')} ocr=${som('ocr')} fouten=${som('fouten')} duur=${(run.eind || Date.now()) - run.begin}`.slice(0, 500);
}
/** Terug: detail → velden (zonder `gebruiker`). */
export function detailLezen(detail: string): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const deel of String(detail || '').split(/\s+/)) { const i = deel.indexOf('='); if (i > 0) { const k = deel.slice(0, i); if (k !== 'gebruiker') uit[k] = deel.slice(i + 1); } }
  return uit;
}

// ---------------------------------------------------------------- API voor de routes (ook voor tests, zonder HTTP)
export type StartInvoer = { modus?: unknown; bronnen?: unknown; sinds?: unknown };
export type StartUitkomst = { ok: true; run: RunWeergave; bestond: boolean } | { ok: false; code: string };
/** Start (of geeft de lopende run terug). `laden` komt van de aanroeper (ladeGroepen → precies wat dit tabblad doorzoekt). */
export async function runStarten(userId: string, laden: RunLade[], invoer: StartInvoer): Promise<StartUitkomst> {
  const bestaand = lopend.get(userId);
  if (bestaand) return { ok: true, run: weergave(bestaand, await openVoor(bestaand)), bestond: true };
  const modus: RunModus = invoer.modus === 'gedeeltelijk' ? 'gedeeltelijk' : 'volledig';
  const bronnen = bronnenKiezen(invoer.bronnen, modus);
  if (!bronnen.length) return { ok: false, code: 'ZOEK_INDEX_GEEN_BRONNEN' };
  if (!laden.length) return { ok: false, code: 'ZOEK_INDEX_GEEN_LADEN' };
  const sinds = modus === 'gedeeltelijk' && Number.isFinite(Number(invoer.sinds)) && Number(invoer.sinds) > 0 ? Math.min(Date.now(), Number(invoer.sinds)) : 0;
  const run = nieuweRun(userId, modus, bronnen, laden, sinds);
  lopend.set(userId, run);
  try { run.gepland = await plannen(run); }
  catch (e) { lopend.delete(userId); return { ok: false, code: (e instanceof Error ? e.message : 'ZOEK_INDEX_PLANNEN_MISLUKT').slice(0, 120) }; }
  void uitvoeren(run).catch((e) => { run.status = 'fout'; run.fout = String((e as Error)?.message || e).slice(0, 200); lopend.delete(userId); });
  return { ok: true, run: weergave(run, { wachtend: run.gepland, bezig: 0 }), bestond: false };
}
export async function runStoppen(userId: string): Promise<{ ok: true; run: RunWeergave | null; geannuleerd: number }> {
  const run = lopend.get(userId);
  let geannuleerd = 0;
  const laden = run ? run.laden : [];
  for (const l of laden) geannuleerd += await zoekStappenAnnuleren(sys, { userId, ruimte: l.ruimte });
  if (run) run.stop = true;
  return { ok: true, run: run ? weergave(run, await openVoor(run)) : null, geannuleerd };
}
export const runLopend = (userId: string): Run | null => lopend.get(userId) || null;
export const runLaatste = (userId: string): Run | null => lopend.get(userId) || ring.get(userId)?.[0] || null;
/** Voor tests: wachten tot de run van deze mens klaar is. */
export async function runWachten(userId: string, maxMs = 60_000): Promise<Run | null> {
  const t0 = Date.now();
  while (lopend.has(userId) && Date.now() - t0 < maxMs) await slaap(50);
  return runLaatste(userId);
}

export type CronRij = { id: number; naam: string; begin: number; eind: number; status: string; detail: string; velden: Record<string, string> };
/** Een rij 'running' die ouder is dan elke mogelijke run (ZOEK_BEHEER_RUN_MS ≤ 60 min, cron TimeoutStartSec 15 min): het proces is
 *  tussendoor herstart. Alleen weergave ('onderbroken'); de rij zelf wordt niet aangepast. */
const ONDERBROKEN_NA_MS = 2 * 3600_000;
const cronStatus = (status: unknown, begin: number) => (String(status) === 'running' && begin > 0 && begin < Date.now() - ONDERBROKEN_NA_MS ? 'onderbroken' : String(status));
export async function geschiedenis(userId: string, limiet = 25): Promise<{ eigen: RunWeergave[]; runs: CronRij[] }> {
  const { rows } = await sys(`SELECT id, name, extract(epoch from started_at)*1000 AS b, extract(epoch from finished_at)*1000 AS e, status, COALESCE(detail,'') AS detail FROM app.cron_runs
      WHERE name IN ('zoek-index','zoek-index@server') OR (name = $2 AND detail LIKE $3) ORDER BY started_at DESC LIMIT $1`, [Math.max(1, Math.min(100, limiet)), CRON_NAAM, `gebruiker=${userId} %`]);
  const runs: CronRij[] = rows.map((r) => ({ id: Number(r.id), naam: String(r.name), begin: Number(r.b) || 0, eind: Number(r.e) || 0, status: cronStatus(r.status, Number(r.b) || 0), detail: r.name === CRON_NAAM ? '' : String(r.detail).replace(/\s*body=\S+/, '').slice(0, 300), velden: r.name === CRON_NAAM ? detailLezen(String(r.detail)) : {} }));
  return { eigen: (ring.get(userId) || []).map((r) => weergave(r)), runs };
}
/** Stand per LADE en bron (kern: standenVanLade) — de bronstand van /zoek/bronnen/stand kijkt per dienst naar de projectie en zou voor `ui` de verkeerde lade tonen. */
export type IndexStand = { run: RunWeergave | null; bronnen: Array<ZoekBronStand & { ruimte: Lade['ruimte'] }>; wachtrij: Record<string, { wachtend: number; bezig: number }>; laden: RunLade[]; cron: { loopt: boolean; laatste: CronRij | null }; limieten: { runMs: number; items: number }; nu: number };
export async function indexStand(userId: string, laden: RunLade[], _body: unknown): Promise<IndexStand> {
  const run = runLaatste(userId);
  const bronnen: IndexStand['bronnen'] = [];
  for (const l of laden) for (const st of await standenVanLade({ userId, ruimte: l.ruimte }, l.bronnen)) bronnen.push({ ...st, ruimte: l.ruimte });
  const wachtrij: Record<string, { wachtend: number; bezig: number }> = {};
  for (const l of laden) for (const [bron, v] of Object.entries(await zoekOpenPerBron(sys, { userId, ruimte: l.ruimte }))) { const k = mapKey(l.ruimte, bron); wachtrij[k] = { wachtend: (wachtrij[k]?.wachtend || 0) + v.wachtend, bezig: (wachtrij[k]?.bezig || 0) + v.bezig }; }
  const open = Object.values(wachtrij).reduce((a, v) => ({ wachtend: a.wachtend + v.wachtend, bezig: a.bezig + v.bezig }), { wachtend: 0, bezig: 0 });
  const c = (await sys(`SELECT id, name, extract(epoch from started_at)*1000 AS b, extract(epoch from finished_at)*1000 AS e, status, COALESCE(detail,'') AS detail FROM app.cron_runs WHERE name IN ('zoek-index','zoek-index@server') ORDER BY started_at DESC LIMIT 1`)).rows[0];
  const laatste: CronRij | null = c ? { id: Number(c.id), naam: String(c.name), begin: Number(c.b) || 0, eind: Number(c.e) || 0, status: cronStatus(c.status, Number(c.b) || 0), detail: String(c.detail).replace(/\s*body=\S+/, '').slice(0, 300), velden: {} } : null;
  const loopt = !!laatste && laatste.status === 'running' && Date.now() - laatste.begin < 15 * 60_000;
  return { run: run ? weergave(run, open) : null, bronnen, wachtrij, laden, cron: { loopt, laatste }, limieten: { runMs: BEHEER.runMs(), items: BEHEER.items() }, nu: Date.now() };
}

// ---------------------------------------------------------------- routes
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<{ service: string; user: { id: string; status: string; role?: string } } | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
const bodyOf = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});
/** De laden van dit tabblad in de vorm van de run (bronnen van de kern → INDEX_BRONNEN). */
export async function runLaden(userId: string, rol: string | null | undefined, body: unknown): Promise<RunLade[]> {
  const { groepen } = await ladeGroepen(userId, rol, body);
  return groepen.map((g) => ({ ruimte: g.lade.ruimte, bronnen: [...new Set(g.bronnen.map((b) => (UI_BRONNEN.includes(b) ? 'ui' : b) as ZoekBron))].filter((b) => (INDEX_BRONNEN as readonly string[]).includes(b)) })).filter((l) => l.bronnen.length);
}
const audit = (userId: string, action: string, details: Record<string, unknown>) =>
  auditToevoegen({ ownerId: userId, actorId: userId, action, type: 'beheer', result: 'success', details }).catch((e) => console.error(`[zoek-beheer] AUDIT MISLUKT (${action}):`, (e as Error).message));

export const createZoekBeheerRoutes = (authorize: Authorize) => {
  const met = (fn: (a: { id: string; role?: string }, body: Record<string, unknown>, laden: RunLade[]) => Promise<unknown>) => [async (ctx: Ctx) => {
    const auth = await authorize(ctx.event, ctx.body);
    if ('errorCode' in auth || auth.user.status !== 'approved') return error('OWNER_ZOEK_REQUIRED', 403);
    const body = bodyOf(ctx.body);
    const act = await actieveActivatie(auth.user.id, String(body.tabContext || ''));
    if (!act) return error('ZOEK_INDEX_TECH_PROFIEL_VEREIST', 403);
    try { return json(await fn(auth.user, body, await runLaden(auth.user.id, auth.user.role, ctx.body))); }
    catch (err) { console.error('[zoek-beheer]', String((err as Error)?.message || err).slice(0, 200)); return error('ZOEK_INDEX_MISLUKT', 500); }
  }];
  return {
    'POST /api/owner/zoek/index/starten': met(async (u, b, laden) => {
      const uit = await runStarten(u.id, laden, { modus: b.modus, bronnen: b.bronnen, sinds: b.sinds });
      if (uit.ok && !uit.bestond) await audit(u.id, 'zoek.index.starten', { modus: uit.run.modus, bronnen: uit.run.bronnen, sinds: uit.run.sinds, laden: laden.map((l) => l.ruimte), run: uit.run.id });
      return uit;
    }),
    'POST /api/owner/zoek/index/stand': met(async (u, _b, laden) => indexStand(u.id, laden, _b)),
    'POST /api/owner/zoek/index/stoppen': met(async (u, _b, laden) => {
      const uit = await runStoppen(u.id);
      await audit(u.id, 'zoek.index.stoppen', { run: uit.run?.id || null, geannuleerd: uit.geannuleerd, laden: laden.map((l) => l.ruimte) });
      return uit;
    }),
    'POST /api/owner/zoek/index/geschiedenis': met(async (u, b) => geschiedenis(u.id, Number(b.limiet) || 25)),
  };
};

/** Voor tests: de interne stappen. */
export const _beheerIntern = { plannen, openVoor };
