// RLS in audit-modus: wat zou de policy van app.records (migrations/0004_rij_beveiliging.sql) weigeren?
// db.ts roept `controleerRijen` aan voor elke query in gebruikerscontext met de rijen die de query
// raakte (owner_id + data.workspaceId). Dezelfde regels als de SQL-policy:
//   toegestaan als owner_id = gebruiker, of owner_id leeg en de tabel staat in app.rls_gedeelde_tabellen
//   (lezen/schrijven), of data.workspaceId is een ruimte van de gebruiker (eigenaar of actief lid).
// Overtredingen worden per (route, tabel, actie) geteld in app.rls_audit (geen id's of inhoud) en de
// eerste keer per combinatie gelogd met [rls-audit]. Zo is vóór het afdwingen te zien welke routes
// nog een bewuste systeemstap (alsSysteem) nodig hebben.
import { getPool } from './pg';
import { huidigeContext } from './context';

type Gedeeld = { lezen: Set<string>; schrijven: Set<string>; tot: number };
let gedeeld: Gedeeld = { lezen: new Set(), schrijven: new Set(), tot: 0 };
const teller = new Map<string, number>();
const gemeld = new Set<string>();
let timer: NodeJS.Timeout | null = null;

async function gedeeldeTabellen(): Promise<Gedeeld> {
  if (gedeeld.tot > Date.now()) return gedeeld;
  try {
    const rows = (await getPool('systeem').query('SELECT tbl, lezen, schrijven FROM app.rls_gedeelde_tabellen')).rows as Array<{ tbl: string; lezen: boolean; schrijven: boolean }>;
    gedeeld = { lezen: new Set(rows.filter((r) => r.lezen).map((r) => r.tbl)), schrijven: new Set(rows.filter((r) => r.schrijven).map((r) => r.tbl)), tot: Date.now() + 60_000 };
  } catch {
    gedeeld = { ...gedeeld, tot: Date.now() + 60_000 };
  }
  return gedeeld;
}

/** Ruimtes van een account (zelfde definitie als app.mijn_werkruimtes()). */
export async function werkruimtesVan(userId: string): Promise<Set<string>> {
  const rows = (await getPool('systeem').query(
    `SELECT r.id AS w FROM app.records r WHERE r.tbl = 'workspaces' AND r.owner_id = $1
     UNION SELECT r.data->>'workspaceId' FROM app.records r WHERE r.tbl = 'workspace_members' AND r.owner_id = $1 AND r.data->>'status' = 'active'`,
    [userId],
  )).rows as Array<{ w: string | null }>;
  return new Set(rows.map((r) => r.w).filter((w): w is string => !!w));
}

export type GeraakteRij = { owner_id: string | null; ws?: string | null };

/** Zou RLS (afdwingen aan) deze rijen weigeren? Telt overtredingen; blokkeert zelf niets. */
export async function controleerRijen(tbl: string, actie: 'lezen' | 'toevoegen' | 'wijzigen' | 'verwijderen', rijen: GeraakteRij[]): Promise<number> {
  const c = huidigeContext();
  if (!c || c.systeem || !c.userId || !rijen.length) return 0;
  const userId = c.userId;
  const schrijven = actie !== 'lezen';
  let mis = 0;
  let tabellen: Gedeeld | null = null;
  for (const rij of rijen) {
    if (rij.owner_id && rij.owner_id === userId) continue;
    if (!rij.owner_id) {
      tabellen = tabellen || (await gedeeldeTabellen());
      if ((schrijven ? tabellen.schrijven : tabellen.lezen).has(tbl)) continue;
    }
    if (rij.ws) {
      c.werkruimtes = c.werkruimtes || werkruimtesVan(userId).catch(() => new Set<string>());
      if ((await c.werkruimtes).has(rij.ws)) continue;
    }
    mis += 1;
  }
  if (mis) noteer(c.route, tbl, actie, mis);
  return mis;
}

function noteer(route: string, tbl: string, actie: string, aantal: number) {
  const sleutel = `${route}\u0000${tbl}\u0000${actie}`;
  teller.set(sleutel, (teller.get(sleutel) || 0) + aantal);
  if (!gemeld.has(sleutel)) {
    gemeld.add(sleutel);
    console.warn(`[rls-audit] zou geweigerd worden: route="${route}" tabel=${tbl} actie=${actie}`);
  }
  if (!timer) {
    timer = setTimeout(() => { timer = null; void rlsAuditWegschrijven(); }, 10_000);
    timer.unref?.();
  }
}

/** Tellers naar app.rls_audit (optellen). Ook aanroepbaar in tests. */
export async function rlsAuditWegschrijven(): Promise<void> {
  if (!teller.size) return;
  const items = [...teller.entries()].map(([k, aantal]) => { const [route, tbl, actie] = k.split('\u0000'); return { route, tbl, actie, aantal }; });
  teller.clear();
  try {
    await getPool('systeem').query(
      `INSERT INTO app.rls_audit (route, tbl, actie, aantal)
       SELECT x.route, x.tbl, x.actie, x.aantal FROM jsonb_to_recordset($1::jsonb) AS x(route text, tbl text, actie text, aantal bigint)
       ON CONFLICT (route, tbl, actie) DO UPDATE SET aantal = app.rls_audit.aantal + EXCLUDED.aantal, laatst = now()`,
      [JSON.stringify(items)],
    );
  } catch (err) {
    console.error('[rls-audit] wegschrijven mislukt:', (err as Error).message);
  }
}
