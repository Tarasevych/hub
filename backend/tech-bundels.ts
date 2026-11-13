// Toegang tot de technische bundels (/assets/tech/*, zie shared/tech-bundels.ts) — alleen met een actieve technische activering.
//
// Hoe: bij /api/owner/tech/status en /activeren met een actieve activering zet de server een HttpOnly-cookie (Path=/ — de
// tech-routes moeten hem ook zien om hem te herkennen of te wissen —, SameSite=Strict, Secure) met een willekeurige sleutel; in de database staat alleen de SHA-256, gekoppeld aan die activering
// (migratie 0070). De statische server vraagt bij elk bestand onder /assets/tech/ `assetToegestaan(cookie)`: geldig zolang de
// activering loopt (niet beëindigd, niet verlopen). Zonder geldige sleutel: 404 (niet 403 — het bestaan van de bundel blijft verborgen).
//
// Grens (bewust, gedocumenteerd): een cookie geldt per browser, niet per tabblad. Een ander tabblad van DEZELFDE browser en
// DEZELFDE gebruiker kan de bundel dus laden zolang de activering ergens loopt; de beheer-API's blijven per tabblad gecontroleerd
// (backend/tech-profiel.ts → actieveActivatie met tab_hash). Het doel hier is: wie geen technisch profiel heeft (of niet aangemeld is)
// krijgt de beheercode niet.
import { createHash, randomBytes } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { COOKIE_DOMAIN } from './deployment-identiteit';
import { TECH_ASSET_COOKIE } from '../shared/tech-bundels';

const sys = () => getPool('systeem');
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const SLEUTEL_RE = /^[A-Za-z0-9_-]{43}$/;

/** Waarde van de toegangscookie uit een Cookie-header (of ''). */
export function sleutelUitCookie(cookie: string | undefined | null): string {
  for (const deel of String(cookie || '').split(';')) {
    const i = deel.indexOf('=');
    if (i < 0) continue;
    if (deel.slice(0, i).trim() === TECH_ASSET_COOKIE) { const v = deel.slice(i + 1).trim(); return SLEUTEL_RE.test(v) ? v : ''; }
  }
  return '';
}

const cookieKop = (waarde: string, maxAgeSec: number, domein = COOKIE_DOMAIN) =>
  `${TECH_ASSET_COOKIE}=${waarde}; ${domein ? `Domain=${domein}; ` : ''}Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}; HttpOnly; Secure; SameSite=Strict`;
export const wisCookie = () => cookieKop('', 0);

// Korte cache: één beheerpagina laadt tientallen bestanden tegelijk; zonder cache wordt dat tientallen databasevragen.
// Alleen positieve uitslagen, 15 s; een beëindigde activering is dus uiterlijk 15 s later ook voor de bundels dicht.
const cache = new Map<string, { tot: number; geldigTot: number }>();
const CACHE_MS = 15_000;
export const _assetCacheLeeg = () => cache.clear();

/** Mag deze Cookie-header /assets/tech/* laden? */
export async function assetToegestaan(cookie: string | undefined | null, nu = Date.now(), zonderCache = false): Promise<boolean> {
  const sleutel = sleutelUitCookie(cookie);
  if (!sleutel) return false;
  const h = hash(sleutel);
  const c = cache.get(h);
  if (!zonderCache && c && c.tot > nu && c.geldigTot > nu) return true;
  try {
    // Een sleutel hangt aan een activering (oud) of aan een technische ruimtesessie (tech-ruimtes-v2, migratie 0126).
    const r = (await sys().query(
      `SELECT COALESCE(a.eind_op, CASE WHEN v.modus = 'tijd' THEN LEAST(v.eind_op, v.grens_op) ELSE v.grens_op END) AS eind_op
         FROM app.tech_asset_toegang t
         LEFT JOIN app.tech_activaties a ON a.id = t.activatie_id AND a.beeindigd_op IS NULL AND a.eind_op > now()
         LEFT JOIN app.tech_ruimte_sessies v ON v.id = t.ruimte_sessie_id AND v.beeindigd_op IS NULL AND v.grens_op > now() AND (v.modus <> 'tijd' OR v.eind_op > now())
        WHERE t.sleutel_hash = $1 AND t.verloopt_op > now() AND (a.id IS NOT NULL OR v.id IS NOT NULL)`, [h])).rows[0];
    if (!r) { cache.delete(h); return false; }
    cache.set(h, { tot: nu + CACHE_MS, geldigTot: new Date(r.eind_op).getTime() });
    return true;
  } catch (e) { console.error('[tech-assets]', (e as Error).message); return false; }
}

/**
 * SEC-002 (slot x, NAUWK-01): dezelfde herkenning van de eigen browser als de tunnel van het externe bureaublad (slot t), nu ook voor
 * de terminal (backend/terminal.ts). Geldige sleutel (lopende activering of technische ruimtesessie) → user-id, anders null.
 * Розпізнавання браузера власника за tech-cookie — для термінала так само, як для тунелю віддаленого стола.
 */
export async function gebruikerVanSleutel(sleutel: string): Promise<string | null> {
  if (!SLEUTEL_RE.test(sleutel)) return null;
  try {
    const r = (await sys().query(
      `SELECT t.user_id
         FROM app.tech_asset_toegang t
         LEFT JOIN app.tech_activaties a ON a.id = t.activatie_id AND a.beeindigd_op IS NULL AND a.eind_op > now()
         LEFT JOIN app.tech_ruimte_sessies v ON v.id = t.ruimte_sessie_id AND v.beeindigd_op IS NULL AND v.grens_op > now() AND (v.modus <> 'tijd' OR v.eind_op > now())
        WHERE t.sleutel_hash = $1 AND t.verloopt_op > now() AND (a.id IS NOT NULL OR v.id IS NOT NULL)`, [hash(sleutel)])).rows[0];
    return r ? String(r.user_id) : null;
  } catch { return null; }
}

/** De geldige sleutels (SHA-256) van één gebruiker met hun einde — om de eigen browser zonder databasevraag te herkennen. */
export async function geldigeSleutelsVan(userId: string): Promise<Array<{ hash: string; tot: number }>> {
  const rows = (await sys().query(
    `SELECT t.sleutel_hash AS hash,
            LEAST(t.verloopt_op, COALESCE(a.eind_op, CASE WHEN v.modus = 'tijd' THEN LEAST(v.eind_op, v.grens_op) ELSE v.grens_op END)) AS tot
       FROM app.tech_asset_toegang t
       LEFT JOIN app.tech_activaties a ON a.id = t.activatie_id AND a.beeindigd_op IS NULL AND a.eind_op > now()
       LEFT JOIN app.tech_ruimte_sessies v ON v.id = t.ruimte_sessie_id AND v.beeindigd_op IS NULL AND v.grens_op > now() AND (v.modus <> 'tijd' OR v.eind_op > now())
      WHERE t.user_id = $1 AND t.verloopt_op > now() AND (a.id IS NOT NULL OR v.id IS NOT NULL)
      ORDER BY t.verloopt_op DESC LIMIT 32`, [userId])).rows;
  return rows.map((r) => ({ hash: String(r.hash), tot: new Date(r.tot).getTime() }));
}

/**
 * Set-Cookie voor de antwoorden van /api/owner/tech/status|activeren|beeindigen:
 *  - actieve activering en (nog) geen geldige sleutel voor DEZE activering → nieuwe sleutel (rij + cookie tot het einde van de activering);
 *  - actieve activering en de browser heeft al een geldige sleutel ervoor → niets (geen nieuwe rij bij elke status-ophaling);
 *  - geen activering maar wel een sleutel in de browser die niet meer geldt → cookie wissen.
 */
export async function assetCookieVoor(cookie: string | undefined | null, activatie: { id: string; eind: number } | null, userId: string, nu = Date.now()): Promise<string | null> {
  const sleutel = sleutelUitCookie(cookie);
  // Geen activering in DIT tabblad: alleen wissen als de sleutel zelf niet meer geldt (anders zou een gewoon tabblad de bundels
  // van een ander, wél geactiveerd tabblad in dezelfde browser dichtzetten).
  if (!activatie) return sleutel && !(await assetToegestaan(cookie, nu, true)) ? wisCookie() : null;
  if (sleutel) {
    const r = (await sys().query(`SELECT COALESCE(activatie_id::text, ruimte_sessie_id::text) AS bron FROM app.tech_asset_toegang WHERE sleutel_hash = $1 AND verloopt_op > now()`, [hash(sleutel)]).catch(() => ({ rows: [] as any[] }))).rows[0];
    if (r && String(r.bron) === activatie.id) return null;
  }
  const nieuw = randomBytes(32).toString('base64url');
  const eind = new Date(Math.max(nu + 60_000, activatie.eind));
  // tech-ruimtes-v2: de «activering» is dan een rij in tech_ruimte_sessies (alsActivatie in tech-ruimtes-kern.ts). Vroeger ging die id
  // naar activatie_id (verwijzing naar tech_activaties) → INSERT mislukte → geen cookie → «Технічні модулі не завантажено».
  const isRuimte = (await sys().query(`SELECT 1 FROM app.tech_ruimte_sessies WHERE id::text = $1 AND user_id = $2`, [activatie.id, userId]).catch(() => ({ rows: [] as any[] }))).rows.length > 0;
  await sys().query(`INSERT INTO app.tech_asset_toegang (sleutel_hash, user_id, ${isRuimte ? 'ruimte_sessie_id' : 'activatie_id'}, verloopt_op) VALUES ($1, $2, $3, $4)`, [hash(nieuw), userId, activatie.id, eind]);
  // Opruimen van verlopen sleutels (goedkoop, index op verloopt_op).
  await sys().query(`DELETE FROM app.tech_asset_toegang WHERE verloopt_op < now() - interval '1 day'`).catch(() => undefined);
  return cookieKop(nieuw, (eind.getTime() - nu) / 1000);
}

/** Kopregels voor een technisch bestand: nooit in een gedeelde cache, en verschillend per cookie. */
export const TECH_ASSET_KOPPEN: Readonly<Record<string, string>> = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

/** Een sleutel uit de cache halen (diepe gezondheidscontrole ruimt haar proefsleutel op). */
export const vergeetSleutel = (sleutel: string) => { cache.delete(hash(sleutel)); };
