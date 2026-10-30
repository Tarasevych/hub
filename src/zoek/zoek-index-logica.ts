// @tech-asset — zone D (22.10.2026): beheercode van het technisch profiel, alleen via /assets/tech/ (shared/tech-bundels.ts).
// /zoek — zuivere kern van de HANDMATIGE INDEXATIE (zone D, 22.10.2026): types, tolerante lezers en helpers zonder DOM/React,
// gedeeld door src/zoek/zoek-index-api.ts (verzoeken), ZoekIndexVenster.tsx en tests/eenheid/zoek-index-beheer-20261022.test.ts.
import { isZoekBron, type ZoekBron, type ZoekBronStand } from '../../shared/zoek-model';

export type RunModus = 'volledig' | 'gedeeltelijk';
export type RunStatus = 'loopt' | 'aangesloten' | 'klaar' | 'gestopt' | 'tijd' | 'limiet' | 'fout';
export type Ruimte = 'prive' | 'technisch';
export type RunStap = { bron: ZoekBron; ruimte: Ruimte; actie: string; id: string; sinds: number };
export type RunTelling = { bron: ZoekBron; ruimte: Ruimte; stappen: number; items: number; toegevoegd: number; bijgewerkt: number; overgeslagen: number; verwijderd: number; ocr: number; fouten: number; opnieuw: number; uitgesteld: number };
export type RunFout = { bron: ZoekBron; ruimte: Ruimte; id: string; code: string; op: number; definitief: boolean };
export type RunLade = { ruimte: Ruimte; bronnen: ZoekBron[] };
export type Run = { id: string; modus: RunModus; bronnen: ZoekBron[]; laden: RunLade[]; sinds: number; begin: number; eind: number; status: RunStatus; stap: RunStap | null; gepland: number; verwerkt: number; klaar: number; tellingen: RunTelling[]; fouten: RunFout[]; fout: string; budgetMs: number; limiet: number; duurMs: number; wachtend: number; bezig: number };
export type BronStandVol = ZoekBronStand & { ruimte: Ruimte };
export type CronRij = { id: number; naam: string; begin: number; eind: number; status: string; detail: string; velden: Record<string, string> };
export type IndexStand = { run: Run | null; bronnen: BronStandVol[]; wachtrij: Record<string, { wachtend: number; bezig: number }>; laden: RunLade[]; cron: { loopt: boolean; laatste: CronRij | null }; limieten: { runMs: number; items: number }; nu: number };

/** Bronnen die handmatig te kiezen zijn (dezelfde als backend/zoek/bronnen.ts INDEX_BRONNEN). */
export const INDEX_BRONNEN: readonly ZoekBron[] = ['ui', 'mail', 'bijlage', 'cloud', 'drive', 'agenda', 'bord', 'github'];
export const ACTIEF: readonly RunStatus[] = ['loopt', 'aangesloten'];
export const isActief = (r: Pick<Run, 'status'> | null | undefined): boolean => !!r && ACTIEF.includes(r.status);

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const lijst = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const ruimte = (v: unknown): Ruimte => (v === 'technisch' ? 'technisch' : 'prive');
const STATUSSEN: readonly RunStatus[] = ['loopt', 'aangesloten', 'klaar', 'gestopt', 'tijd', 'limiet', 'fout'];

/** Eén bronstand (zelfde velden als zoek-api.ts → leesStand, zonder DOM-afhankelijkheden). */
export function leesBronStand(v: unknown): ZoekBronStand | null {
  const b = obj(v); if (!isZoekBron(b.bron)) return null;
  return { bron: b.bron, stand: (['niet_gekoppeld', 'indexeert', 'gedeeltelijk', 'fout', 'klaar'] as const).find((s) => s === b.stand) || 'niet_gekoppeld', voortgang: Math.max(0, Math.min(100, Math.round(num(b.voortgang)))), aantal: Math.max(0, Math.floor(num(b.aantal))), laatsteOk: num(b.laatsteOk), laatstePoging: num(b.laatstePoging), fout: str(b.fout, 300), versie: str(b.versie, 80), bijgewerktOp: num(b.bijgewerktOp) };
}
export function leesLade(v: unknown): RunLade { const o = obj(v); return { ruimte: ruimte(o.ruimte), bronnen: lijst(o.bronnen).map(String).filter(isZoekBron) }; }
export function leesRun(v: unknown): Run | null {
  const r = obj(v); const id = str(r.id, 60); if (!id) return null;
  const stap = r.stap ? obj(r.stap) : null;
  return {
    id, modus: r.modus === 'gedeeltelijk' ? 'gedeeltelijk' : 'volledig', bronnen: lijst(r.bronnen).map(String).filter(isZoekBron), laden: lijst(r.laden).map(leesLade), sinds: num(r.sinds),
    begin: num(r.begin), eind: num(r.eind), status: STATUSSEN.find((s) => s === r.status) || 'fout',
    stap: stap && isZoekBron(stap.bron) ? { bron: stap.bron, ruimte: ruimte(stap.ruimte), actie: str(stap.actie, 20), id: str(stap.id, 60), sinds: num(stap.sinds) } : null,
    gepland: num(r.gepland), verwerkt: num(r.verwerkt), klaar: num(r.klaar),
    tellingen: lijst(r.tellingen).map(obj).filter((t) => isZoekBron(t.bron)).map((t) => ({ bron: t.bron as ZoekBron, ruimte: ruimte(t.ruimte), stappen: num(t.stappen), items: num(t.items), toegevoegd: num(t.toegevoegd), bijgewerkt: num(t.bijgewerkt), overgeslagen: num(t.overgeslagen), verwijderd: num(t.verwijderd), ocr: num(t.ocr), fouten: num(t.fouten), opnieuw: num(t.opnieuw), uitgesteld: num(t.uitgesteld) })),
    fouten: lijst(r.fouten).map(obj).filter((f) => isZoekBron(f.bron)).map((f) => ({ bron: f.bron as ZoekBron, ruimte: ruimte(f.ruimte), id: str(f.id, 60), code: str(f.code, 120), op: num(f.op), definitief: f.definitief === true })).slice(0, 50),
    fout: str(r.fout, 200), budgetMs: num(r.budgetMs), limiet: num(r.limiet), duurMs: num(r.duurMs), wachtend: num(r.wachtend), bezig: num(r.bezig),
  };
}
export function leesCronRij(v: unknown): CronRij | null {
  const r = obj(v); const id = num(r.id); if (!id) return null;
  const velden: Record<string, string> = {}; for (const [k, x] of Object.entries(obj(r.velden))) if (/^[a-z]+$/.test(k)) velden[k] = str(x, 120);
  return { id, naam: str(r.naam, 60), begin: num(r.begin), eind: num(r.eind), status: str(r.status, 20), detail: str(r.detail, 300), velden };
}
export function leesIndexStand(v: unknown): IndexStand {
  const o = obj(v); const cron = obj(o.cron); const lim = obj(o.limieten);
  const wachtrij: Record<string, { wachtend: number; bezig: number }> = {};
  for (const [k, x] of Object.entries(obj(o.wachtrij))) { const w = obj(x); wachtrij[str(k, 40)] = { wachtend: num(w.wachtend), bezig: num(w.bezig) }; }
  const bronnen: BronStandVol[] = lijst(o.bronnen).map((b) => { const s = leesBronStand(b); return s ? { ...s, ruimte: ruimte(obj(b).ruimte) } : null; }).filter((x): x is BronStandVol => !!x);
  return { run: leesRun(o.run), bronnen, wachtrij, laden: lijst(o.laden).map(leesLade), cron: { loopt: cron.loopt === true, laatste: leesCronRij(cron.laatste) }, limieten: { runMs: num(lim.runMs), items: num(lim.items) }, nu: num(o.nu) || Date.now() };
}

// ---------------------------------------------------------------- zuivere helpers
/** Voortgang 0–100 van een run: verwerkt t.o.v. verwerkt + wat nog open staat (wachtend + bezig). Klaar = 100; niets te doen = 0. */
export function runVoortgang(r: Pick<Run, 'status' | 'verwerkt' | 'wachtend' | 'bezig'> | null): number {
  if (!r) return 0;
  if (!isActief(r)) return r.status === 'klaar' ? 100 : r.verwerkt + r.wachtend + r.bezig ? Math.round((100 * r.verwerkt) / (r.verwerkt + r.wachtend + r.bezig)) : 0;
  const totaal = r.verwerkt + r.wachtend + r.bezig;
  return totaal ? Math.min(99, Math.round((100 * r.verwerkt) / totaal)) : 0;
}
/** Som van de tellers over alle bronnen van de run. */
export function runSom(r: Pick<Run, 'tellingen'>): Omit<RunTelling, 'bron' | 'ruimte'> {
  const uit = { stappen: 0, items: 0, toegevoegd: 0, bijgewerkt: 0, overgeslagen: 0, verwijderd: 0, ocr: 0, fouten: 0, opnieuw: 0, uitgesteld: 0 };
  for (const t of r.tellingen) for (const k of Object.keys(uit) as Array<keyof typeof uit>) uit[k] += Number(t[k] || 0);
  return uit;
}
/** «1 хв 12 с» / «1 min 12 s». */
export function fmtDuur(ms: number, lang: 'uk' | 'nl'): string {
  const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60), h = Math.floor(m / 60);
  const [H, M, S] = lang === 'uk' ? ['год', 'хв', 'с'] : ['u', 'min', 's'];
  // 23.10 (integratie): geen «10 хв 0 с» / «1 год 0 хв» — een nuldeel valt weg.
  if (h) return m % 60 ? `${h} ${H} ${m % 60} ${M}` : `${h} ${H}`;
  if (m) return s % 60 ? `${m} ${M} ${s % 60} ${S}` : `${m} ${M}`;
  return `${s} ${S}`;
}
/** Datum (YYYY-MM-DD, lokale dag) → ms van het begin van die dag; ongeldig → 0. */
export function sindsVanDatum(v: string): number { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 0; const [j, m, d] = v.split('-').map(Number); const t = new Date(j, m - 1, d).getTime(); return Number.isFinite(t) ? t : 0; }
