// SEC-002 (autorisatie-02, autorisatie-06) — accountrecords alleen nog VELDGEWIJS schrijven.
//
// autorisatie-02: veel paden schreven het HELE record in `users` terug vanuit een momentopname die aan het begin van het verzoek
// gelezen was ({...auth.user, picture} → db.update). Blokkeerde de beheerder intussen het account (status 'blocked'), verlaagde hij
// de rol of trok hij een recht (entitlements) in, dan zette dat ene oude verzoek alles terug: status weer 'approved', rechten weer
// aanwezig. Een gebruiker die zijn blokkade zag aankomen, hoefde alleen /api/owner/profile/photo in een lus te sturen.
// Nu zet elk pad ALLEEN de velden die het zelf bedoelt (db.patch: `data || velden`, atomisch); wat een ander tegelijk schrijft blijft.
//
// autorisatie-06: een niet-goedgekeurd account kon met /api/(owner/)access/request onbeperkt meldingen bij de eigenaar en rijen in
// notification_jobs maken (elke aanroep: 1 melding + 2 taken). Nu meldt alleen de EERSTE overgang new → pending (atomisch, één
// winnaar ook bij gelijktijdige verzoeken), met daarnaast een limiet per account en per IP.
import { db } from '../server/platform/db';
import { getPool } from '../server/platform/pg';
import { rateLimit } from '../server/platform/beveiliging';
import { limietSleutel } from '../shared/ip-limiet';

type Velden = Record<string, unknown>;

/**
 * Zet alleen deze velden van één accountrecord (atomisch). false = onbekend id, geweigerd of ongeldig.
 * `alsStatus` (g10c-toets-5): alleen schrijven als de status in de database NU nog die waarde heeft (systeemrol, voorwaardelijke
 * UPDATE) — voor overgangen als «herstellen na verwijderen», die een gelijktijdige blokkade anders zouden overschrijven.
 * Een veld met waarde `null` wordt als null opgeslagen (wissen kan via patch niet; lezers behandelen null als «niet gezet»).
 */
export async function gebruikerVeldenZetten(userId: string, velden: Velden, opties: { alsStatus?: string } = {}): Promise<boolean> {
  const schoon: Velden = {};
  for (const [k, v] of Object.entries(velden || {})) if (v !== undefined && k !== 'id') schoon[k] = v;
  if (!Object.keys(schoon).length) return true;
  if (opties.alsStatus === undefined) return db.patch('users', String(userId || ''), schoon);
  const r = await getPool('systeem').query(
    `UPDATE app.records SET data = data || $3::jsonb, updated_at = now()
      WHERE tbl = 'users' AND id = $1 AND COALESCE(data->>'status', 'new') = $2 RETURNING id`,
    [String(userId || ''), String(opties.alsStatus), JSON.stringify(schoon)]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * g10c-toets-5: account «verwijderd (herstelbaar)» zetten. De vorige status komt uit de DATABASE op het moment van schrijven
 * (niet uit de momentopname van het verzoek): wie zichzelf verwijdert op het moment dat de beheerder hem blokkeert, krijgt
 * statusVoorVerwijdering 'blocked' — zo kan zelfherstel nooit naar 'approved' terug. Overige velden blijven staan.
 */
export async function accountVerwijderdZetten(userId: string, velden: Velden): Promise<boolean> {
  const schoon: Velden = {};
  for (const [k, v] of Object.entries(velden || {})) if (v !== undefined && !['id', 'status', 'statusVoorVerwijdering'].includes(k)) schoon[k] = v;
  const r = await getPool('systeem').query(
    `UPDATE app.records SET data = data || $2::jsonb || jsonb_build_object('status', 'deleted', 'statusVoorVerwijdering',
        CASE WHEN data->>'status' = 'deleted' THEN COALESCE(data->>'statusVoorVerwijdering', 'new') ELSE COALESCE(data->>'status', 'new') END),
        updated_at = now()
      WHERE tbl = 'users' AND id = $1 RETURNING id`,
    [String(userId || ''), JSON.stringify(schoon)]);
  return (r.rowCount ?? 0) > 0;
}

/**
 * Toegangsverzoek: status alleen van 'new' naar 'pending' (voorwaardelijke UPDATE, systeemrol — net als de oude alsSysteem-stap).
 * Geeft `overgang: true` als DIT verzoek de overgang maakte; alleen dan wordt de eigenaar gemeld. Een status die intussen door de
 * beheerder is gezet (approved, blocked, deleted) wordt nooit overschreven.
 */
export async function toegangAanvraagStatus(userId: string, nu = Date.now()): Promise<{ overgang: boolean }> {
  const r = await getPool('systeem').query(
    `UPDATE app.records SET data = data || jsonb_build_object('status', 'pending', 'updatedAt', $2::bigint), updated_at = now()
      WHERE tbl = 'users' AND id = $1 AND COALESCE(data->>'status', 'new') = 'new' RETURNING id`,
    [String(userId || ''), Math.floor(nu)]);
  return { overgang: (r.rowCount ?? 0) > 0 };
}

const ipVan = (event: Record<string, unknown> | undefined): string => {
  // Alleen het door de server bepaalde adres (router.ts), nooit een kopregel van de client.
  const rc = (event?.requestContext || {}) as { http?: { sourceIp?: unknown } };
  return String(rc.http?.sourceIp || '').slice(0, 80);
};

/**
 * Limiet voor toegangsverzoeken: 5 per uur per account en 30 per uur per IP. Bij een databasefout geweigerd (failClosed),
 * want deze route is bereikbaar voor elk Google-account zonder goedkeuring. true = toegestaan.
 */
export async function toegangAanvraagToegestaan(userId: string, event?: Record<string, unknown>): Promise<boolean> {
  const perAccount = await rateLimit(`access-request:${String(userId || '')}`, 5, 3600, { failClosed: true });
  if (!perAccount.ok) return false;
  const ip = ipVan(event);
  if (!ip) return true;
  // SEC-002 (http-rand-05 / g10h-toets-1): bij IPv6 telt het /64-net, niet het losse adres (shared/ip-limiet.ts). IPv4: ongewijzigd.
  return (await rateLimit(`access-request-ip:${limietSleutel(ip)}`, 30, 3600, { failClosed: true })).ok;
}
