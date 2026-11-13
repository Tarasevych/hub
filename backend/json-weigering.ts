// SEC-002 (slot s, eind-interface 3): het spoor van een 415 JSON_VEREIST (server/platform/router.ts → alleenJsonAfwijzing).
// Zo'n weigering stopt juist het verdachte geval: een formulier (geen JSON) met de cookie van een account, vaak vanaf een andere pagina.
// Vroeger telde alleen een teller. Nu:
//  - een regel in het auditjournaal (type «beveiliging», zonder lijf en zonder cookie), hoogstens één per 10 min per account (of per
//    IP-hash zonder geldige sessie) en route;
//  - een melding aan het account zelf (soort «security»), hoogstens één per uur (backend/beveiliging-meldingen.ts).
// Het account wordt alleen herkend aan een LEVENDE sessiecookie (niet ingetrokken, binnen de termijnen) — zonder sessie geen melding.
// Слід відмови 415: запис аудиту (не частіше разу на 10 хв) і сповіщення власникові сеансу (не частіше разу на годину).
import { createHash } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { auditToevoegen, ipHash } from '../server/platform/audit';
import { registreerJsonWeigeringMelder, type JsonWeigering } from '../server/platform/router';
import { ECOSYSTEM_COOKIE } from './deployment-identiteit';
import { meldBeveiligingsWijzigingBeperkt } from './beveiliging-meldingen';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const AUDIT_VENSTER_MS = 10 * 60_000;
const gezien = new Map<string, number>();

const kop = (h: Record<string, string> | undefined, naam: string): string => {
  for (const [k, v] of Object.entries(h || {})) if (k.toLowerCase() === naam) return String(v ?? '');
  return '';
};

/** Account achter de sessiecookie van dit verzoek, alleen als die sessie leeft; anders ''. Faalt nooit. */
export async function accountVanCookie(cookieKop: string, nu = Date.now()): Promise<string> {
  try {
    for (const deel of cookieKop.split(';').slice(0, 60)) {
      const i = deel.indexOf('=');
      if (i <= 0 || deel.slice(0, i).trim() !== ECOSYSTEM_COOKIE) continue;
      let waarde = deel.slice(i + 1).trim();
      try { waarde = decodeURIComponent(waarde); } catch { /* ruw laten */ }
      const p = waarde.indexOf('.');
      if (p <= 0 || waarde.length > 1024) return '';
      const r = await getPool('systeem').query(`SELECT data->>'userId' AS uid FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND id = $1
        AND data->>'tokenHash' = $2 AND COALESCE(data->>'revokedAt', '') IN ('', '0', 'false')
        AND (data->>'absoluteExpiresAt')::numeric > $3 AND (data->>'idleExpiresAt')::numeric > $3 LIMIT 1`, [waarde.slice(0, p), sha(waarde.slice(p + 1)), nu]);
      return String(r.rows[0]?.uid || '');
    }
  } catch { /* geen database: geen account */ }
  return '';
}

/** Vastleggen (journaal + melding). Geeft terug wat er gebeurde, voor tests. Faalt nooit. */
export async function jsonWeigeringVastleggen(w: JsonWeigering, nu = Date.now()): Promise<{ audit: boolean; melding: boolean; account: string }> {
  const account = await accountVanCookie(kop(w.headers, 'cookie'), nu);
  const wie = account || `ip:${ipHash(w.ip) || 'onbekend'}`;
  const sleutel = `${wie}|${w.patroon}`;
  const vorige = gezien.get(sleutel);
  let audit = false;
  if (vorige === undefined || nu - vorige >= AUDIT_VENSTER_MS) {
    if (gezien.size > 5000) for (const [k, v] of gezien) if (nu - v >= AUDIT_VENSTER_MS || gezien.size > 4000) gezien.delete(k);
    gezien.set(sleutel, nu);
    const media = kop(w.headers, 'content-type').split(';')[0].trim().toLowerCase().slice(0, 80);
    let herkomst = '';
    try { herkomst = new URL(kop(w.headers, 'origin') || kop(w.headers, 'referer')).host.slice(0, 120); } catch { herkomst = ''; }
    audit = await auditToevoegen({ ownerId: account || null, actorId: account || null, action: 'beveiliging.json-vereist', type: 'beveiliging', result: 'denied',
      details: { route: w.patroon.slice(0, 200), inhoudType: media, herkomst, metSessie: Boolean(account) } }).then(() => true, () => false);
  }
  const melding = account ? await meldBeveiligingsWijzigingBeperkt(account, 'json-vereist', { route: w.patroon }, nu).catch(() => false) : false;
  return { audit, melding, account };
}
export const _jsonWeigeringLeeg = (): void => gezien.clear();

registreerJsonWeigeringMelder((w) => { void jsonWeigeringVastleggen(w).catch(() => undefined); });
