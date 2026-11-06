// ZOEKDIEP-001 (05.11.2026): diepe links van zoekresultaten die AL in de index staan.
//
// Sinds vandaag schrijven de adapters (backend/zoek/adapters.ts) de parameters die de pagina's lezen, met het id van de aanbieder
// (Gmail-bericht, Drive-bestand, agendagebeurtenis). Een object wordt echter pas opnieuw geschreven als zijn inhoud verandert, dus
// oudere objecten dragen nog `bericht`/`drive`/`afspraak` met het id van het EIGEN record (app.records). Hier vertalen we die bij het
// lezen: de namen zuiver (shared/zoek-diepe-link.ts → diepeRoute) en de ids met één opzoeking per tabel in app.records, ALTIJD met
// `owner_id = <gebruiker>` uit de gecontroleerde sessie (zelfde patroon als backend/zoek/bronnen.ts). Mislukt de opzoeking, dan blijft
// de vertaalde route staan: de pagina opent dan de вкладка en zegt eerlijk dat het item niet gevonden is.
import { getPool } from '../../server/platform/pg';
import { DIEPE_PARAMS, agendaItemId, diepeRoute, oudeRecordRoute } from '../../shared/zoek-diepe-link';
import type { ZoekRoute, ZoekTreffer } from '../../shared/zoek-model';

type Rij = { id: string; data: Record<string, unknown> };
export type RecordLezer = (tabel: string, userId: string, ids: string[]) => Promise<Rij[]>;

const TABEL = { mail: 'mail_items_v1', drive: 'google_suite_drive_projection_v1', agenda: 'google_suite_calendar_events_v1' } as const;
const OUDE_SLEUTEL = { mail: 'bericht', drive: 'drive', agenda: 'afspraak' } as const;
const kort = (v: unknown, max: number) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, max);

const leesRecords: RecordLezer = async (tabel, userId, ids) => {
  const r = await getPool('systeem').query(
    `SELECT id::text AS id, data FROM app.records WHERE tbl = $1 AND owner_id = $2 AND id::text = ANY($3::text[])`, [tabel, userId, ids]);
  return (r.rows as Rij[]).filter(x => !x.data?.ownerUserId || String(x.data.ownerUserId) === userId);
};

/** Nieuwe route voor een oud object uit het record (zuiver). */
export function routeUitRecord(soort: 'mail' | 'drive' | 'agenda', route: ZoekRoute, d: Record<string, unknown>): ZoekRoute {
  const p = { ...(route.params || {}) };
  if (soort === 'mail') {
    const pmid = kort(d.providerMessageId, 300), acc = kort(d.mailAccountId, 120);
    if (pmid) p[DIEPE_PARAMS.bericht] = pmid;
    if (acc) p[DIEPE_PARAMS.mailAccount] = acc;
    return { ...route, params: p };
  }
  if (soort === 'drive') {
    const fid = kort(d.providerFileId, 300), pr = kort(d.principalId, 120);
    if (fid) p[DIEPE_PARAMS.bestand] = fid;
    if (pr) p[DIEPE_PARAMS.drivePrincipal] = pr;
    return { ...route, pad: 'google', params: p };
  }
  const gid = kort(d.providerEventId, 1024);
  if (gid) p[DIEPE_PARAMS.afspraak] = agendaItemId(kort(d.calendarId, 500), gid);
  return { ...route, host: 'hub', pad: 'calendar', params: p };
}

/** Werkt de routes van de treffers bij (in place). Nooit een fout naar de zoeker: de route is een gemak, geen voorwaarde. */
export async function verrijkDiepeRoutes(userId: string, items: ZoekTreffer[], lees: RecordLezer = leesRecords): Promise<void> {
  const oud = new Map<ZoekTreffer, { soort: 'mail' | 'drive' | 'agenda'; recordId: string }>();
  for (const t of items) {
    const soort = oudeRecordRoute(t.route);
    const recordId = soort ? String(t.route?.params?.[OUDE_SLEUTEL[soort]] || '') : '';
    if (soort && recordId) oud.set(t, { soort, recordId });
    t.route = diepeRoute(t.route, t.soort);
  }
  if (!oud.size || !userId) return;
  for (const soort of ['mail', 'drive', 'agenda'] as const) {
    const ids = [...new Set([...oud.values()].filter(x => x.soort === soort).map(x => x.recordId))].slice(0, 200);
    if (!ids.length) continue;
    let rijen: Rij[] = [];
    try { rijen = await lees(TABEL[soort], userId, ids); } catch { continue; }
    const per = new Map(rijen.map(r => [String(r.id), r.data || {}]));
    for (const [t, x] of oud) if (x.soort === soort && t.route && per.has(x.recordId)) t.route = routeUitRecord(soort, t.route, per.get(x.recordId)!);
  }
}
