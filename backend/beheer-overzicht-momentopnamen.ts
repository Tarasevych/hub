// Momentopnamen van het beheeroverzicht: elk uur en elke dag een klein document met alleen TELLERS (tabel app.admin_overzicht_momentopnamen,
// migratie 0058). Zo blijft de ontwikkeling zichtbaar ook als het auditlogboek wordt opgeruimd, en kan de beheerder trends zien
// (gebruikers, online, sessies, gebeurtenissen, storingen, diensten, wachtrij). Bewaartermijn 90 dagen.
// Privacy: geen namen, e-mail, IP of inhoud — `maakMomentopname` kopieert uitsluitend getallen (afgerond en begrensd).
import { getPool } from '../server/platform/pg';
import type { Overzicht } from './beheer-overzicht-kern';
import { ROUTEGROEPEN, tellingBereik, tellingUur, type Telling } from './toegangsfout-tellers';

const UUR = 3_600_000; const DAG = 86_400_000;
export const BEWAAR_DAGEN = 90;
export type Soort = 'uur' | 'dag';
export type Momentopname = {
  v: 1;
  gebruikers: number; nieuw24: number; online: number; actieveSessies: number; apparaten: number;
  events1u: number; events24: number; fouten24: number;
  diensten: { ok: number; letop: number; fout: number; onbekend: number };
  wacht: { toegang: number; uitrol: number; gebruikers: number };
  /** Toegangsfouten (29.10.2026): 404 en 401/403 samen. Uur-opname: het VORIGE volle uur; dag-opname: vandaag tot nu. */
  t404: number; t401: number;
  /** Per routegroep [404, 401+403]. */
  tf: Record<string, [number, number]>;
};
export type MomentPunt = { t: number; d: Momentopname };

/** Begrenst een waarde tot een geheel getal ≥ 0 (nooit tekst, nooit NaN). */
export const getalSchoon = (x: unknown, max = 10_000_000): number => { const n = Math.round(Number(x)); return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0; };

/** PUUR: maakt uit het overzicht een document van alleen getallen. */
export function maakMomentopname(o: Pick<Overzicht, 'kpi' | 'diensten' | 'wachtrij'>, t?: Telling): Momentopname {
  const tf: Record<string, [number, number]> = {};
  let t404 = 0, t401 = 0;
  for (const g of ROUTEGROEPEN) {
    const a = getalSchoon(t?.[g]?.n404), b = getalSchoon((t?.[g]?.n401 ?? 0) + (t?.[g]?.n403 ?? 0));
    t404 += a; t401 += b; if (a || b) tf[g] = [a, b];
  }
  return {
    v: 1,
    gebruikers: getalSchoon(o.kpi.gebruikers), nieuw24: getalSchoon(o.kpi.nieuw24), online: getalSchoon(o.kpi.online),
    actieveSessies: getalSchoon(o.kpi.actieveSessies), apparaten: getalSchoon(o.kpi.apparaten),
    events1u: getalSchoon(o.kpi.events1u), events24: getalSchoon(o.kpi.events24), fouten24: getalSchoon(o.kpi.fouten24),
    diensten: { ok: getalSchoon(o.diensten.ok, 1000), letop: getalSchoon(o.diensten.letop, 1000), fout: getalSchoon(o.diensten.fout, 1000), onbekend: getalSchoon(o.diensten.onbekend, 1000) },
    wacht: { toegang: getalSchoon(o.wachtrij.toegang, 100000), uitrol: getalSchoon(o.wachtrij.uitrol, 100000), gebruikers: getalSchoon(o.wachtrij.gebruikers, 100000) },
    t404, t401, tf,
  };
}

/** PUUR: zet een bewaard document (willekeurige JSON uit de database) terug in de vaste vorm. */
export function leesMomentopname(raw: unknown): Momentopname {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sub = (k: string) => (r[k] && typeof r[k] === 'object' ? r[k] as Record<string, unknown> : {});
  const dn = sub('diensten'); const wt = sub('wacht');
  return {
    v: 1,
    gebruikers: getalSchoon(r.gebruikers), nieuw24: getalSchoon(r.nieuw24), online: getalSchoon(r.online), actieveSessies: getalSchoon(r.actieveSessies), apparaten: getalSchoon(r.apparaten),
    events1u: getalSchoon(r.events1u), events24: getalSchoon(r.events24), fouten24: getalSchoon(r.fouten24),
    diensten: { ok: getalSchoon(dn.ok, 1000), letop: getalSchoon(dn.letop, 1000), fout: getalSchoon(dn.fout, 1000), onbekend: getalSchoon(dn.onbekend, 1000) },
    wacht: { toegang: getalSchoon(wt.toegang, 100000), uitrol: getalSchoon(wt.uitrol, 100000), gebruikers: getalSchoon(wt.gebruikers, 100000) },
    t404: getalSchoon(r.t404), t401: getalSchoon(r.t401), tf: leesTf(r.tf),
  };
}
function leesTf(raw: unknown): Record<string, [number, number]> {
  const uit: Record<string, [number, number]> = {};
  if (!raw || typeof raw !== 'object') return uit;
  for (const g of ROUTEGROEPEN) { const w = (raw as Record<string, unknown>)[g]; if (Array.isArray(w)) uit[g] = [getalSchoon(w[0]), getalSchoon(w[1])]; }
  return uit;
}

export const emmerVan = (soort: Soort, nu: number) => Math.floor(nu / (soort === 'uur' ? UUR : DAG));

const sys = () => getPool('systeem');
const laatsteEmmer: Record<Soort, number> = { uur: -1, dag: -1 };

/** Bewaart de momentopname van dit uur (eerste in het uur wint) en van vandaag (laatste van de dag wint); ruimt >90 dagen op. */
export async function bewaarMomentopname(o: Pick<Overzicht, 'kpi' | 'diensten' | 'wachtrij'>, nu = Date.now(), dwing = false): Promise<{ uur: boolean; dag: boolean }> {
  const uit = { uur: false, dag: false };
  const uurEmmer = emmerVan('uur', nu); const dagEmmer = emmerVan('dag', nu);
  // Toegangsfouten: de uur-opname krijgt het vorige volle uur, de dag-opname vandaag tot nu (tellers in het geheugen van de dienst).
  const data = JSON.stringify(maakMomentopname(o, tellingUur(uurEmmer - 1)));
  const dagData = JSON.stringify(maakMomentopname(o, tellingBereik(dagEmmer * 24, uurEmmer)));
  if (dwing || laatsteEmmer.uur !== uurEmmer) {
    const r = await sys().query(
      `INSERT INTO app.admin_overzicht_momentopnamen (soort, emmer, genomen_op, data) VALUES ('uur', $1, to_timestamp($2::double precision / 1000), $3::jsonb)
       ON CONFLICT (soort, emmer) DO NOTHING`, [uurEmmer, nu, data]);
    laatsteEmmer.uur = uurEmmer; uit.uur = (r.rowCount ?? 0) > 0;
  }
  // de dagwaarde wordt elk uur vernieuwd (laatste meting van de dag), niet bij elk pollingverzoek
  if (dwing || laatsteEmmer.dag !== uurEmmer) {
    const r = await sys().query(
      `INSERT INTO app.admin_overzicht_momentopnamen (soort, emmer, genomen_op, data) VALUES ('dag', $1, to_timestamp($2::double precision / 1000), $3::jsonb)
       ON CONFLICT (soort, emmer) DO UPDATE SET data = EXCLUDED.data, genomen_op = EXCLUDED.genomen_op`, [dagEmmer, nu, dagData]);
    laatsteEmmer.dag = uurEmmer; uit.dag = (r.rowCount ?? 0) > 0;
    await sys().query(`DELETE FROM app.admin_overzicht_momentopnamen WHERE genomen_op < to_timestamp($1::double precision / 1000) - make_interval(days => $2)`, [nu, BEWAAR_DAGEN]);
  }
  return uit;
}

/** Opgeslagen reeksen: laatste 48 uur en laatste 90 dagen (oud → nieuw). Geen gaten opvullen: ontbrekende uren blijven ontbreken. */
export async function lijstMomentopnamen(nu = Date.now()): Promise<{ uur: MomentPunt[]; dag: MomentPunt[]; bewaardDagen: number }> {
  const rij = async (soort: Soort, vanaf: number) => (await sys().query(
    `SELECT emmer, data FROM app.admin_overzicht_momentopnamen WHERE soort = $1 AND emmer >= $2 ORDER BY emmer ASC`, [soort, vanaf],
  )).rows.map((r: { emmer: string; data: unknown }): MomentPunt => ({ t: Number(r.emmer) * (soort === 'uur' ? UUR : DAG), d: leesMomentopname(r.data) }));
  const [uur, dag] = await Promise.all([rij('uur', emmerVan('uur', nu) - 47), rij('dag', emmerVan('dag', nu) - (BEWAAR_DAGEN - 1))]);
  return { uur, dag, bewaardDagen: BEWAAR_DAGEN };
}

/** Voor tests: vergeet de onthouden emmers. */
export const vergeetEmmers = () => { laatsteEmmer.uur = -1; laatsteEmmer.dag = -1; };
