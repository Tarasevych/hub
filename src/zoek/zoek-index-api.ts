// @tech-asset — zone D (22.10.2026): beheercode van het technisch profiel, alleen via /assets/tech/ (shared/tech-bundels.ts).
// /zoek — clientkant van de HANDMATIGE INDEXATIE (zone D, 22.10.2026; server: backend/zoek/beheer.ts).
//   POST /api/owner/zoek/index/starten      {modus, bronnen?, sinds?} → { ok, run, bestond } | { ok:false, code }
//   POST /api/owner/zoek/index/stand        {} → IndexStand (run + stand van de bronnen + wachtrij + cron + limieten)
//   POST /api/owner/zoek/index/stoppen      {} → { ok, run, geannuleerd }
//   POST /api/owner/zoek/index/geschiedenis {limiet?} → { eigen: Run[], runs: CronRij[] }
// Alleen met een lopende technische activering in dit tabblad (403 ZOEK_INDEX_TECH_PROFIEL_VEREIST anders). Elke lezer is
// tolerant: ontbrekende velden worden leeg of 0, nooit verzonnen. Zuivere helpers (voortgang, duur) staan onderaan — getest in
// tests/eenheid/zoek-index-beheer-20261022.test.ts.
import { api } from '../platform/client';
import { ecosystemTabContext } from '../tab-context';
import { sessieDienst } from '../canoniek-navigatie';
import type { ZoekBron } from '../../shared/zoek-model';

export * from './zoek-index-logica';
import { leesCronRij, leesIndexStand, leesRun, type CronRij, type IndexStand, type Run, type RunModus } from './zoek-index-logica';

const sessie = () => ({ service: sessieDienst(), tabContext: ecosystemTabContext(), sourceOrigin: location.origin });
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const lijst = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// ---------------------------------------------------------------- verzoeken
const P = '/api/owner/zoek/index';
export type Opties = { signal?: AbortSignal };
export async function indexStarten(invoer: { modus: RunModus; bronnen?: readonly ZoekBron[]; sinds?: number }, o: Opties = {}): Promise<{ ok: true; run: Run; bestond: boolean } | { ok: false; code: string }> {
  const r = await api.post(`${P}/starten`, { ...sessie(), modus: invoer.modus, ...(invoer.bronnen?.length ? { bronnen: [...invoer.bronnen] } : {}), ...(invoer.sinds ? { sinds: invoer.sinds } : {}) }, { signal: o.signal });
  const d = obj(r.data); const run = leesRun(d.run);
  return d.ok === true && run ? { ok: true, run, bestond: d.bestond === true } : { ok: false, code: str(d.code || d.error, 80) || 'ZOEK_INDEX_MISLUKT' };
}
export async function indexStand(o: Opties = {}): Promise<IndexStand> { return leesIndexStand((await api.post(`${P}/stand`, { ...sessie() }, { signal: o.signal })).data); }
export async function indexStoppen(o: Opties = {}): Promise<{ run: Run | null; geannuleerd: number }> { const d = obj((await api.post(`${P}/stoppen`, { ...sessie() }, { signal: o.signal })).data); return { run: leesRun(d.run), geannuleerd: num(d.geannuleerd) }; }
export async function indexGeschiedenis(limiet = 25, o: Opties = {}): Promise<{ eigen: Run[]; runs: CronRij[] }> {
  const d = obj((await api.post(`${P}/geschiedenis`, { ...sessie(), limiet }, { signal: o.signal })).data);
  return { eigen: lijst(d.eigen).map(leesRun).filter((x): x is Run => !!x), runs: lijst(d.runs).map(leesCronRij).filter((x): x is CronRij => !!x) };
}

