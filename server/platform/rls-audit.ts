// RLS in audit-modus: wat zou de policy van app.records (migrations/0007_rls_per_tabel.sql) weigeren?
// db.ts roept `controleerRijen` aan voor elke query in gebruikerscontext met de rijen die de query
// raakte (owner_id + data.workspaceId; bij wijzigen ook de oude rij). Dezelfde regels als de SQL-policy
// (rijToegestaan): lezen als owner_id = gebruiker, gedeelde tabel, of ruimte van de gebruiker; schrijven per
// tabel: workspace_members alleen eigenaar/beheerder van de ruimte (eigen lidmaatschap verwijderen mag),
// ruimte-inhoud niet als kijker, users/workspaces nooit via de ruimte-regel. Serverbeheerde users-velden
// telt de database zelf (trigger users_servervelden, actie 'serverveld').
// Overtredingen worden per (route, tabel, actie) geteld in app.rls_audit (geen id's of inhoud) en de
// eerste keer per combinatie gelogd met [rls-audit]. Zo is vóór het afdwingen te zien welke routes
// nog een bewuste systeemstap (alsSysteem) nodig hebben.
import { getPool } from './pg';
import { huidigeContext } from './context';
import { registreerPoortMelder } from './auth-poort';

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

/** Ruimtes van een account met de rol daarin (zelfde definitie als app.mijn_werkruimtes(rollen), 0007). */
export async function werkruimtesVan(userId: string): Promise<Map<string, string>> {
  const rows = (await getPool('systeem').query(
    `SELECT r.id AS w, 'owner' AS rol FROM app.records r WHERE r.tbl = 'workspaces' AND r.owner_id = $1
     UNION ALL
     SELECT m.data->>'workspaceId',
            CASE WHEN m.data->>'permission' = 'owner' THEN 'owner'
                 WHEN m.data->>'workspaceRole' IN ('admin', 'member', 'viewer') THEN m.data->>'workspaceRole'
                 WHEN m.data->>'permission' = 'editor' THEN 'member' ELSE 'viewer' END
       FROM app.records m WHERE m.tbl = 'workspace_members' AND m.owner_id = $1 AND m.data->>'status' = 'active'`,
    [userId],
  )).rows as Array<{ w: string | null; rol: string }>;
  const rang: Record<string, number> = { owner: 3, admin: 2, member: 1, viewer: 0 };
  const uit = new Map<string, string>();
  for (const r of rows) if (r.w && (!uit.has(r.w) || rang[r.rol] > rang[uit.get(r.w)!])) uit.set(r.w, r.rol);
  return uit;
}

export type GeraakteRij = { owner_id: string | null; ws?: string | null; id?: string };
type Actie = 'lezen' | 'toevoegen' | 'wijzigen' | 'verwijderen';
const BEHEER = new Set(['owner', 'admin']);
const SCHRIJVERS = new Set(['owner', 'admin', 'member']);

/**
 * Zou RLS (afdwingen aan) deze rij toestaan? Exact de policy's van migrations/0007_rls_per_tabel.sql.
 * Puur (los te testen); `ruimtes` = werkruimtesVan(userId).
 */
export function rijToegestaan(tbl: string, actie: Actie, rij: GeraakteRij, userId: string, ruimtes: Map<string, string>, gedeeldLezen: Set<string>, gedeeldSchrijven: Set<string>): boolean {
  const ws = rij.ws || null;
  const eigen = !!rij.owner_id && rij.owner_id === userId;
  if (actie === 'lezen') {
    if (eigen) return true;
    if (!rij.owner_id && gedeeldLezen.has(tbl)) return true;
    if (ws && ruimtes.has(ws)) return true;
    return tbl === 'workspaces' && !!rij.id && ruimtes.has(rij.id);
  }
  const rolIn = (w: string | null, set: Set<string>) => !!w && set.has(ruimtes.get(w) || '');
  if (tbl === 'workspace_members') return rolIn(ws, BEHEER) || (actie === 'verwijderen' && eigen);
  if (eigen && !(tbl === 'workspace_blocks' && ws && !rolIn(ws, SCHRIJVERS))) return true;
  if (!rij.owner_id && gedeeldSchrijven.has(tbl)) return true;
  return tbl !== 'users' && tbl !== 'workspaces' && rolIn(ws, SCHRIJVERS);
}

/** Zou RLS (afdwingen aan) deze rijen weigeren? Telt overtredingen; blokkeert zelf niets. */
export async function controleerRijen(tbl: string, actie: Actie, rijen: GeraakteRij[]): Promise<number> {
  const c = huidigeContext();
  if (!c || c.systeem || !c.userId || !rijen.length) return 0;
  const userId = c.userId;
  const tabellen = await gedeeldeTabellen();
  const nodigRuimtes = rijen.some((r) => r.ws || tbl === 'workspaces' || tbl === 'workspace_members');
  if (nodigRuimtes) c.werkruimtes = c.werkruimtes || werkruimtesVan(userId).catch(() => new Map<string, string>());
  const ruimtes = nodigRuimtes ? await c.werkruimtes! : new Map<string, string>();
  let mis = 0;
  for (const rij of rijen) if (!rijToegestaan(tbl, actie, rij, userId, ruimtes, tabellen.lezen, tabellen.schrijven)) mis += 1;
  if (mis) noteer(c.route, tbl, actie, mis);
  return mis;
}

/** Vangnet van de toegangspoort (auth-poort.ts): anoniem verzoek kreeg 2xx op een niet-publieke route. */
export function meldAnoniem(patroon: string): void { noteer(patroon, '-', 'anoniem-2xx', 1, true); }
registreerPoortMelder(meldAnoniem);

function noteer(route: string, tbl: string, actie: string, aantal: number, stil = false) {
  const sleutel = `${route}\u0000${tbl}\u0000${actie}`;
  teller.set(sleutel, (teller.get(sleutel) || 0) + aantal);
  if (!stil && !gemeld.has(sleutel)) {
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
