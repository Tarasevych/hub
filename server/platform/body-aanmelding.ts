// SEC-002 (toets g10e-toets-2): goedkope controle VÓÓR het lezen van een verzoeklichaam of een Cookie of Bearer-token ECHT is.
//
// server/platform/body-budget.ts geeft een verzoek met aanmelding ruimere grenzen (12 MB, 64 lichamen per IP, geen korte termijn).
// Alleen de AANWEZIGHEID van een kop was daarvoor niet genoeg: «Cookie: x=1» van een aanvaller zonder account haalde alle anonieme
// grenzen weg. Hier één opzoeking per verzoek (met een korte cache), op dezelfde hashes als de echte aanmelding:
//   • cookie `__Secure-tsv_ecosystem_<app>` = «<sessie-id>.<token>» → app.records 'owner_service_sessions_v1' (tokenHash of
//     previousTokenHash = SHA-256 van het token; ook een net geroteerde sessie telt — het bewijst een echt account);
//   • cookies `tsv_<dienst>_session_<tab>` → app.records 'service_sessions' (tokenHash);
//   • `Authorization: Bearer …` → actief token van de MCP-connector/connector v2 (mcp_oauth_tokens.access_hash), agenttoken tvh_
//     (mcp_console_tokens) of agent/extensie (agents.token_hash).
// Dit is GEEN aanmelding (de route doet die zelf, volledig); het bepaalt alleen welke grenzen voor het lezen gelden. Bij een
// databasefout: false (dan gelden de anonieme grenzen — de veilige richting).
import type http from 'node:http';
import { createHash } from 'node:crypto';
import { getPool } from './pg';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const ECOSYSTEEM = /^__Secure-tsv_ecosystem_[A-Za-z0-9_-]+$/;
const DIENST = /^tsv_[a-z0-9-]+_session_[A-Za-z0-9_-]+$/;
const BEARER = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,512})$/i;

const cache = new Map<string, { ok: boolean; tot: number }>();
const CACHE_MAX = 5000;

function cookies(kop: unknown): Array<[string, string]> {
  const uit: Array<[string, string]> = [];
  for (const deel of String(kop || '').split(';').slice(0, 60)) {
    const i = deel.indexOf('=');
    if (i <= 0) continue;
    const naam = deel.slice(0, i).trim();
    let waarde = deel.slice(i + 1).trim();
    try { waarde = decodeURIComponent(waarde); } catch { /* ruw laten */ }
    if (waarde.length >= 16 && waarde.length <= 1024) uit.push([naam, waarde]);
  }
  return uit;
}

/** Hoogstens zoveel sessiecookies per verzoek opzoeken: een browser heeft er normaal één tot twee (60 cookies = 60 opzoekingen). */
const MAX_KANDIDATEN = 4;
/** Cache per kandidaat (hash van de cookiewaarde of het token): een nieuwe combinatie van koppen kost zo geen nieuwe opzoekingen. */
const kandidaatCache = new Map<string, { ok: boolean; tot: number }>();
async function kandidaat(sleutel: string, zoek: () => Promise<boolean>, nu: number): Promise<boolean> {
  const hit = kandidaatCache.get(sleutel);
  if (hit && hit.tot > nu) return hit.ok;
  let ok = false;
  try { ok = await zoek(); } catch { ok = false; }
  if (kandidaatCache.size >= CACHE_MAX) for (const [k, v] of kandidaatCache) if (v.tot <= nu || kandidaatCache.size >= CACHE_MAX) kandidaatCache.delete(k);
  kandidaatCache.set(sleutel, { ok, tot: nu + (ok ? 10_000 : 5_000) });
  return ok;
}

async function opzoeken(headers: http.IncomingHttpHeaders): Promise<boolean> {
  const sys = getPool('systeem');
  const nu = Date.now();
  let gezocht = 0;
  for (const [naam, waarde] of cookies(headers.cookie)) {
    if (gezocht >= MAX_KANDIDATEN) break;
    if (ECOSYSTEEM.test(naam)) {
      const p = waarde.indexOf('.');
      const id = p > 0 ? waarde.slice(0, p) : '';
      const token = p > 0 ? waarde.slice(p + 1) : waarde;
      if (!id || !token) continue;
      gezocht += 1;
      // SEC-002 (eind-omzeiling 4): alleen een LEVENDE sessie telt — niet ingetrokken, binnen beide termijnen; het vorige token
      // alleen binnen zijn korte overgangstijd na het roteren. Een oude (ingetrokken of verlopen) cookie geeft de anonieme grenzen.
      // Лише живий сеанс: не відкликаний, у межах строків; попередній токен — лише в короткий перехідний час.
      if (await kandidaat(`e:${sha(waarde)}`, async () => (await sys.query(`SELECT 1 FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND id = $1
        AND COALESCE(data->>'revokedAt', '') IN ('', '0', 'false')
        AND (data->>'absoluteExpiresAt')::numeric > $3 AND (data->>'idleExpiresAt')::numeric > $3
        AND (data->>'tokenHash' = $2 OR (data->>'previousTokenHash' = $2 AND COALESCE((data->>'previousValidUntil')::numeric, 0) > $3)) LIMIT 1`,
      [id, sha(token), nu])).rows.length > 0, nu)) return true;
    } else if (DIENST.test(naam)) {
      gezocht += 1;
      if (await kandidaat(`d:${sha(waarde)}`, async () => (await sys.query(`SELECT 1 FROM app.records WHERE tbl = 'service_sessions' AND data->>'tokenHash' = $1
        AND (data->>'expiresAt')::numeric > $2 LIMIT 1`, [sha(waarde), nu])).rows.length > 0, nu)) return true;
    }
  }
  const b = BEARER.exec(String(headers.authorization || '').trim());
  if (b) {
    const h = sha(b[1]);
    if (await kandidaat(`b:${h}`, async () => (await sys.query(`SELECT 1 WHERE EXISTS (SELECT 1 FROM app.mcp_oauth_tokens WHERE access_hash = $1 AND revoked_at IS NULL AND access_expires_at > now())
      OR EXISTS (SELECT 1 FROM app.mcp_console_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now())
      OR EXISTS (SELECT 1 FROM app.agents WHERE token_hash = $1 AND revoked_at IS NULL)`, [h])).rows.length > 0, nu)) return true;
  }
  return false;
}

/** true = het verzoek draagt een echte (bestaande) sessie of een echt token. Cache: 60 s ja, 10 s nee. */
export const _aanmeldingCacheLeeg = (): void => { cache.clear(); kandidaatCache.clear(); };
export async function aanmeldingEcht(headers: http.IncomingHttpHeaders): Promise<boolean> {
  if (!headers.cookie && !headers.authorization) return false;
  const sleutel = sha(`${String(headers.cookie || '')}\u0000${String(headers.authorization || '')}`);
  const nu = Date.now();
  const hit = cache.get(sleutel);
  if (hit && hit.tot > nu) return hit.ok;
  let ok = false;
  try { ok = await opzoeken(headers); } catch { ok = false; }
  if (cache.size >= CACHE_MAX) for (const [k, v] of cache) if (v.tot <= nu || cache.size >= CACHE_MAX) cache.delete(k);
  cache.set(sleutel, { ok, tot: nu + (ok ? 60_000 : 10_000) });
  return ok;
}
