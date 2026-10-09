// Toegangscodes voor anderen (id.tarasevych.com/methods «Коди доступу для інших», RUNBOOK §13.11).
//
// De eigenaar maakt een code met een naam («Для Олени»), een scope uit de VASTE allowlist hieronder (alleen lezen), een verloop
// (безстроково / 1 u / 1 d / 7 d / 30 d / eigen datum) en eenmalig of herbruikbaar (optioneel maximum). De code wordt één keer
// getoond; we bewaren alleen de SHA-256. Wie de code op id.tarasevych.com/toegang invult, krijgt een APARTE gastsessie (eigen
// cookie, alleen /api/gast/*), nooit de identiteit van de eigenaar. Elke gastaanvraag controleert sessie + code opnieuw en mag
// alleen wat de scope toestaat (standaard: weigeren). Alles wordt gelogd met de code-id; de eigenaar ziet het per code.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { apparaat, auditLijst, auditToevoegen, ipHash } from '../server/platform/audit';
import { huidigeContext } from '../server/platform/context';
import { getPool } from '../server/platform/pg';
import { alsGebruiker } from './ai-grants';
import { JOURNAAL_ACTIES } from './connectors-routes';
import { meld } from './melder';
import { ToegangFout, notitieTekst, redenVan } from './toegang-context';

const fout = (code: string, status = 400): never => { throw new ToegangFout(code, status); };
const sys = () => getPool('systeem');

// ------------------------------------------------------------------------------------------------ scopes (allowlist)
/**
 * Wat een gast mag zien. ALLES is alleen lezen en gaat over de eigenaar van de code. Nieuwe scope = hier toevoegen + een lezer in
 * GAST_LEZERS + tekst in src/Toegangscodes.tsx. Nooit toegestaan (zie NOOIT): aanmeldmethoden, passkeys, rechten om updates goed te
 * keuren, beheer, tokens, root-/uitrolacties, account verwijderen of exporteren, sessies, toegangscodes zelf, notities, e-mail, bestanden.
 */
export const GAST_SCOPES = Object.freeze({
  'profiel.lezen': ['Ваше ім’я та фото профілю', 'Uw naam en profielfoto'],
  'apparaten.lezen': ['Пристрої та агенти — лише перегляд (назва, тип, остання активність; без токенів і керування)', 'Apparaten en agents — alleen bekijken (naam, soort, laatste activiteit; zonder tokens of beheer)'],
  'journaal.lezen': ['Журнал агентів — лише перегляд (без подій про права, ключі й токени)', 'Journaal van agents — alleen bekijken (zonder gebeurtenissen over rechten, sleutels en tokens)'],
} as const satisfies Record<string, readonly [string, string]>);
export type GastScope = keyof typeof GAST_SCOPES;
export const NOOIT = Object.freeze([
  ['Способи входу, passkeys і коди відновлення', 'Aanmeldmethoden, passkeys en herstelcodes'],
  ['Право схвалювати чи готувати оновлення', 'Recht om updates goed te keuren of voor te bereiden'],
  ['Адміністрування, root і оновлення сервера', 'Beheer, root en serverupdates'],
  ['Токени, ключі та підключення ШІ', 'Tokens, sleutels en AI-koppelingen'],
  ['Сесії, коди доступу, нотатки', 'Sessies, toegangscodes, notities'],
  ['Пошта, файли, експорт і видалення акаунта', 'E-mail, bestanden, export en account verwijderen'],
] as const);
/** Woorden die nooit in een scope mogen voorkomen (eenheidstest + controle bij het opstarten van deze module). */
export const VERBODEN_SCOPE = /(method|passkey|herstel|goedkeur|voorbereid|admin|beheer|token|root|uitrol|update|verwijder|export|sessie|code|notitie|mail|bestand|schrijf|write|exec)/i;
for (const s of Object.keys(GAST_SCOPES)) if (VERBODEN_SCOPE.test(s) || !s.endsWith('.lezen')) throw new Error(`gast-scope niet toegestaan: ${s}`);
export const isGastScope = (v: unknown): v is GastScope => typeof v === 'string' && Object.prototype.hasOwnProperty.call(GAST_SCOPES, v);
export function scopesVan(v: unknown): GastScope[] {
  if (!Array.isArray(v) || !v.length) fout('SCOPE_VEREIST');
  const uit = [...new Set((v as unknown[]).map(String))];
  if (uit.length > 10 || uit.some((s) => !isGastScope(s))) fout('SCOPE_NIET_TOEGESTAAN');
  return uit as GastScope[];
}

// ------------------------------------------------------------------------------------------------ code
const ALFABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: geen I, L, O, U
/** 16 tekens (80 bits), als XXXX-XXXX-XXXX-XXXX. */
export function nieuweCode(): string {
  const b = randomBytes(10);
  let bits = 0, waarde = 0, uit = '';
  for (const byte of b) { waarde = (waarde << 8) | byte; bits += 8; while (bits >= 5) { uit += ALFABET[(waarde >>> (bits - 5)) & 31]; bits -= 5; } }
  return uit.match(/.{4}/g)!.join('-');
}
/** Invoer opschonen: hoofdletters, zonder spaties/streepjes; O→0, I/L→1 (Crockford). Ongeldig → ''. */
export function codeNormaal(v: unknown): string {
  const s = String(v ?? '').toUpperCase().replace(/[\s-]+/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(s) ? s : '';
}
export const codeHash = (normaal: string) => createHash('sha256').update(`mijn-ruimte-toegangscode\u0000${normaal}`).digest('hex');
const tokenHash = (t: string) => createHash('sha256').update(`mijn-ruimte-gastsessie\u0000${t}`).digest('hex');

// ------------------------------------------------------------------------------------------------ verloop
export const PRESETS = Object.freeze({ '1u': 3_600_000, '1d': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 });
export const MAX_DATUM_MS = 366 * 86_400_000;
/** {soort:'nooit'} → null; {soort:'preset', preset:'1u'|'1d'|'7d'|'30d'}; {soort:'datum', tot: ISO} (≥ 5 min, ≤ 366 d vooruit). */
export function verloopVan(v: unknown, nu = Date.now()): Date | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  if (o.soort === 'nooit') return null;
  if (o.soort === 'preset' && typeof o.preset === 'string' && Object.prototype.hasOwnProperty.call(PRESETS, o.preset)) return new Date(nu + PRESETS[o.preset as keyof typeof PRESETS]);
  if (o.soort === 'datum') {
    const t = Date.parse(String(o.tot || ''));
    if (!Number.isFinite(t) || t < nu + 5 * 60_000) fout('VERLOOP_TE_KORT');
    if (t > nu + MAX_DATUM_MS) fout('VERLOOP_TE_LANG');
    return new Date(t);
  }
  return fout('VERLOOP_ONGELDIG');
}
/** Gastsessie: tot het verloop van de code, maar nooit langer dan 24 uur achter elkaar. */
export const GAST_SESSIE_MAX_MS = 24 * 3_600_000;

// ------------------------------------------------------------------------------------------------ status
export type CodeRij = {
  id: string; naam: string; codeHint: string; scopes: GastScope[]; eenmalig: boolean; maxGebruik: number | null; gebruikt: number;
  verlooptOp: string | null; aangemaaktOp: string; eersteGebruikOp: string | null; laatstGebruiktOp: string | null; laatstApparaat: string | null; laatstIpKort: string | null;
  ingetrokkenOp: string | null; ingetrokkenReden: string | null; ingetrokkenDoor: string | null; status: 'actief' | 'gebruikt' | 'verlopen' | 'ingetrokken';
};
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const limiet = (r: { eenmalig: boolean; max_gebruik: number | null }) => (r.eenmalig ? 1 : r.max_gebruik ?? null);
export function statusVan(r: { ingetrokken_op?: unknown; verloopt_op?: unknown; eenmalig: boolean; max_gebruik: number | null; gebruikt: number }, nu = Date.now()): CodeRij['status'] {
  if (r.ingetrokken_op) return 'ingetrokken';
  if (r.verloopt_op && new Date(r.verloopt_op as string).getTime() <= nu) return 'verlopen';
  const l = limiet(r);
  if (l !== null && r.gebruikt >= l) return 'gebruikt';
  return 'actief';
}
function codeRij(r: any): CodeRij {
  return {
    id: String(r.id), naam: r.naam, codeHint: r.code_hint, scopes: (r.scopes || []).filter(isGastScope), eenmalig: !!r.eenmalig, maxGebruik: r.max_gebruik ?? null, gebruikt: Number(r.gebruikt || 0),
    verlooptOp: iso(r.verloopt_op), aangemaaktOp: iso(r.aangemaakt_op)!, eersteGebruikOp: iso(r.eerste_gebruik_op), laatstGebruiktOp: iso(r.laatst_gebruikt_op),
    laatstApparaat: r.laatst_apparaat ?? null, laatstIpKort: r.laatst_ip_hash ? String(r.laatst_ip_hash).slice(0, 12) : null,
    ingetrokkenOp: iso(r.ingetrokken_op), ingetrokkenReden: r.ingetrokken_reden ?? null, ingetrokkenDoor: r.ingetrokken_door ?? null, status: statusVan(r),
  };
}

// ------------------------------------------------------------------------------------------------ log
export type LogSoort = 'aangemaakt' | 'ingewisseld' | 'actie' | 'geweigerd' | 'gewijzigd' | 'ingetrokken' | 'sessie-ingetrokken' | 'uitgelogd';
async function log(codeId: string, userId: string, soort: LogSoort, detail: Record<string, unknown> = {}, sessieId: string | null = null) {
  const c = huidigeContext();
  try {
    await sys().query('INSERT INTO app.toegangscode_log (code_id, user_id, sessie_id, soort, detail, apparaat, ip_hash) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)',
      [codeId, userId, sessieId, soort, JSON.stringify(detail), apparaat(c?.ua), ipHash(c?.ip)]);
  } catch (err) { console.error('[toegangscodes] log mislukt:', (err as Error).message); }
}
const auditStil = (g: Parameters<typeof auditToevoegen>[0]) => auditToevoegen(g).catch((err) => console.error('[toegangscodes] audit mislukt:', (err as Error).message));

// ------------------------------------------------------------------------------------------------ eigenaar
export const NAAM_MAX = 80;
export type MaakInvoer = { naam?: unknown; notitie?: unknown; scopes?: unknown; verloop?: unknown; eenmalig?: unknown; maxGebruik?: unknown };
export const MAX_CODES = 50;
export async function codeMaken(eigenaar: { id: string; email?: string }, input: MaakInvoer, opts: { sessieId?: string; dienst?: string } = {}) {
  const naam = notitieTekst(input.naam).replace(/\s+/g, ' ');
  if (!naam) fout('NAAM_VEREIST');
  if ([...naam].length > NAAM_MAX) fout('NAAM_TE_LANG');
  const scopes = scopesVan(input.scopes);
  const verloop = verloopVan(input.verloop);
  const eenmalig = input.eenmalig === true;
  let maxGebruik: number | null = null;
  if (!eenmalig && input.maxGebruik !== undefined && input.maxGebruik !== null && input.maxGebruik !== '') {
    const n = Number(input.maxGebruik);
    if (!Number.isInteger(n) || n < 1 || n > 1000) fout('MAX_GEBRUIK_ONGELDIG');
    maxGebruik = n;
  }
  const notitie = input.notitie === undefined ? '' : notitieTekst(input.notitie);
  if ([...notitie].length > 500) fout('NOTITIE_TE_LANG');
  const open = await sys().query(`SELECT count(*)::int AS n FROM app.toegangscodes WHERE user_id = $1 AND ingetrokken_op IS NULL AND (verloopt_op IS NULL OR verloopt_op > now())`, [eigenaar.id]);
  if (Number(open.rows[0]?.n || 0) >= MAX_CODES) fout('TE_VEEL_CODES', 409);
  const code = nieuweCode();
  const normaal = codeNormaal(code);
  const { rows } = await sys().query(`INSERT INTO app.toegangscodes (user_id, naam, code_hash, code_hint, scopes, eenmalig, max_gebruik, verloopt_op, aangemaakt_sessie)
    VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8, $9) RETURNING *`, [eigenaar.id, naam, codeHash(normaal), normaal.slice(-4), scopes, eenmalig, maxGebruik, verloop, String(opts.sessieId || '').slice(0, 120)]);
  const r = rows[0];
  if (notitie) await alsGebruiker(eigenaar.id, (q) => q(`INSERT INTO app.toegang_notities (user_id, soort, sleutel, tekst) VALUES ($1, 'toegangscode', $2, $3)
    ON CONFLICT (user_id, soort, sleutel) DO UPDATE SET tekst = EXCLUDED.tekst, bijgewerkt_op = now()`, [eigenaar.id, String(r.id), notitie]));
  await log(r.id, eigenaar.id, 'aangemaakt', { scopes, verloopt: iso(verloop), eenmalig, maxGebruik, door: eigenaar.email || eigenaar.id });
  await auditStil({ ownerId: eigenaar.id, actorId: eigenaar.id, action: 'toegangscode_aangemaakt', type: 'beveiliging', result: 'success', service: opts.dienst,
    details: { code: String(r.id), naam, scopes, verloopt: iso(verloop), eenmalig, maxGebruik } });
  return { code, link: `https://id.tarasevych.com/toegang#code=${code}`, item: codeRij(r) };
}

export type LogRegel = { soort: LogSoort; op: string; detail: Record<string, unknown>; apparaat: string | null; ipKort: string | null; sessie: string | null };
export type GastSessie = { id: string; codeId: string; codeNaam: string; gestartOp: string; laatstActiefOp: string; verlooptOp: string; apparaat: string | null; ipKort: string | null; ingetrokkenOp: string | null; ingetrokkenReden: string | null; actief: boolean };
function sessieRij(r: any): GastSessie {
  const nu = Date.now();
  return { id: String(r.id), codeId: String(r.code_id), codeNaam: r.code_naam ?? '', gestartOp: iso(r.gestart_op)!, laatstActiefOp: iso(r.laatst_actief_op)!, verlooptOp: iso(r.verloopt_op)!,
    apparaat: r.apparaat ?? null, ipKort: r.ip_hash ? String(r.ip_hash).slice(0, 12) : null, ingetrokkenOp: iso(r.ingetrokken_op), ingetrokkenReden: r.ingetrokken_reden ?? null,
    actief: !r.ingetrokken_op && new Date(r.verloopt_op).getTime() > nu && !r.code_ingetrokken && (!r.code_verloopt || new Date(r.code_verloopt).getTime() > nu) };
}
/** Codes van de eigenaar (RLS: eigen rijen) met de laatste 100 logregels en de gastsessies per code. */
export async function codesLijst(userId: string) {
  return alsGebruiker(userId, async (q) => {
    const codes = (await q('SELECT * FROM app.toegangscodes WHERE user_id = $1 ORDER BY aangemaakt_op DESC LIMIT 200', [userId])).rows;
    const ids = codes.map((c: any) => String(c.id));
    const logs = ids.length ? (await q(`SELECT * FROM (SELECT l.*, row_number() OVER (PARTITION BY code_id ORDER BY op DESC, id DESC) AS nr FROM app.toegangscode_log l WHERE user_id = $1 AND code_id = ANY($2::uuid[])) x WHERE nr <= 100 ORDER BY op DESC, id DESC`, [userId, ids])).rows : [];
    const sessies = ids.length ? (await q(`SELECT s.*, c.naam AS code_naam, c.ingetrokken_op AS code_ingetrokken, c.verloopt_op AS code_verloopt FROM app.gast_sessies s JOIN app.toegangscodes c ON c.id = s.code_id
      WHERE s.user_id = $1 AND s.code_id = ANY($2::uuid[]) ORDER BY s.gestart_op DESC LIMIT 500`, [userId, ids])).rows : [];
    return codes.map((c: any) => ({
      ...codeRij(c),
      geschiedenis: logs.filter((l: any) => String(l.code_id) === String(c.id)).map((l: any): LogRegel => ({ soort: l.soort, op: iso(l.op)!, detail: l.detail || {}, apparaat: l.apparaat ?? null, ipKort: l.ip_hash ? String(l.ip_hash).slice(0, 12) : null, sessie: l.sessie_id ? String(l.sessie_id).slice(0, 8) : null })),
      sessies: sessies.filter((s: any) => String(s.code_id) === String(c.id)).map(sessieRij),
    }));
  });
}
export async function gastSessiesVan(userId: string): Promise<GastSessie[]> {
  return alsGebruiker(userId, async (q) => (await q(`SELECT s.*, c.naam AS code_naam, c.ingetrokken_op AS code_ingetrokken, c.verloopt_op AS code_verloopt FROM app.gast_sessies s JOIN app.toegangscodes c ON c.id = s.code_id
    WHERE s.user_id = $1 AND s.ingetrokken_op IS NULL AND s.verloopt_op > now() ORDER BY s.laatst_actief_op DESC LIMIT 200`, [userId])).rows.map(sessieRij).filter((s) => s.actief));
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function eigenCode(userId: string, id: unknown) {
  if (!UUID.test(String(id || ''))) fout('NIET_GEVONDEN', 404);
  const { rows } = await sys().query('SELECT * FROM app.toegangscodes WHERE id = $1 AND user_id = $2', [String(id), userId]);
  return rows[0] || fout('NIET_GEVONDEN', 404);
}
/** Intrekken met reden: code ongeldig en ALLE gastsessies ervan meteen beëindigd. */
export async function codeIntrekken(eigenaar: { id: string; email?: string }, input: { id?: unknown; reden?: unknown }, opts: { dienst?: string } = {}) {
  const reden = redenVan(input.reden);
  const r = await eigenCode(eigenaar.id, input.id);
  if (r.ingetrokken_op) fout('AL_INGETROKKEN', 409);
  await sys().query('UPDATE app.toegangscodes SET ingetrokken_op = now(), ingetrokken_reden = $3, ingetrokken_door = $4 WHERE id = $1 AND user_id = $2 AND ingetrokken_op IS NULL', [r.id, eigenaar.id, reden, String(eigenaar.email || eigenaar.id).slice(0, 200)]);
  const s = await sys().query(`UPDATE app.gast_sessies SET ingetrokken_op = now(), ingetrokken_reden = 'code-ingetrokken' WHERE code_id = $1 AND ingetrokken_op IS NULL RETURNING id`, [r.id]);
  await log(r.id, eigenaar.id, 'ingetrokken', { reden, sessies: s.rowCount || 0, door: eigenaar.email || eigenaar.id });
  await auditStil({ ownerId: eigenaar.id, actorId: eigenaar.id, action: 'toegangscode_ingetrokken', type: 'beveiliging', result: 'success', service: opts.dienst, details: { code: String(r.id), naam: r.naam, reden, sessies: s.rowCount || 0 } });
  return { item: codeRij((await sys().query('SELECT * FROM app.toegangscodes WHERE id = $1', [r.id])).rows[0]), sessiesBeeindigd: s.rowCount || 0 };
}
/** Is dit nieuwe verloop LATER dan het huidige (dan is een sterke bevestiging nodig)? */
export function isVerlenging(huidig: Date | null, nieuw: Date | null) {
  if (huidig === null) return false; // безстроково kan alleen korter worden
  return nieuw === null || nieuw.getTime() > huidig.getTime();
}
export async function verloopVoorWijziging(userId: string, input: { id?: unknown; verloop?: unknown }) {
  const r = await eigenCode(userId, input.id);
  if (r.ingetrokken_op) fout('AL_INGETROKKEN', 409);
  const nieuw = verloopVan(input.verloop);
  const huidig = r.verloopt_op ? new Date(r.verloopt_op) : null;
  return { r, nieuw, huidig, verlenging: isVerlenging(huidig, nieuw) };
}
export async function verloopWijzigen(eigenaar: { id: string; email?: string }, input: { id?: unknown; verloop?: unknown }, opts: { dienst?: string } = {}) {
  const { r, nieuw, huidig, verlenging } = await verloopVoorWijziging(eigenaar.id, input);
  await sys().query('UPDATE app.toegangscodes SET verloopt_op = $3 WHERE id = $1 AND user_id = $2', [r.id, eigenaar.id, nieuw]);
  // Korter: lopende gastsessies eindigen uiterlijk dan.
  if (nieuw) await sys().query('UPDATE app.gast_sessies SET verloopt_op = least(verloopt_op, $2) WHERE code_id = $1 AND ingetrokken_op IS NULL', [r.id, nieuw]);
  await log(r.id, eigenaar.id, 'gewijzigd', { van: iso(huidig), naar: iso(nieuw), verlenging, door: eigenaar.email || eigenaar.id });
  await auditStil({ ownerId: eigenaar.id, actorId: eigenaar.id, action: 'toegangscode_gewijzigd', type: 'beveiliging', result: 'success', service: opts.dienst, details: { code: String(r.id), naam: r.naam, van: iso(huidig), naar: iso(nieuw), verlenging } });
  return { item: codeRij((await sys().query('SELECT * FROM app.toegangscodes WHERE id = $1', [r.id])).rows[0]), verlenging };
}
/** Eén gastsessie (of alle) van deze eigenaar beëindigen. */
/** Eén gastsessie, of 'alle' nog LEVENDE gastsessies (al verlopen/ingetrokken codes tellen niet mee in het aantal). */
export async function gastSessieIntrekken(eigenaar: { id: string; email?: string }, id: unknown | 'alle', opts: { dienst?: string } = {}) {
  if (id !== 'alle' && !UUID.test(String(id || ''))) fout('NIET_GEVONDEN', 404);
  const { rows } = await sys().query(`UPDATE app.gast_sessies SET ingetrokken_op = now(), ingetrokken_reden = 'door-eigenaar'
    WHERE user_id = $1 AND ingetrokken_op IS NULL ${id === 'alle' ? `AND verloopt_op > now() AND code_id IN (SELECT c.id FROM app.toegangscodes c WHERE c.user_id = $1 AND c.ingetrokken_op IS NULL AND (c.verloopt_op IS NULL OR c.verloopt_op > now()))` : 'AND id = $2'} RETURNING id, code_id`, id === 'alle' ? [eigenaar.id] : [eigenaar.id, String(id)]);
  if (id !== 'alle' && !rows.length) fout('NIET_GEVONDEN', 404);
  for (const s of rows) await log(s.code_id, eigenaar.id, 'sessie-ingetrokken', { door: eigenaar.email || eigenaar.id }, s.id);
  if (rows.length) await auditStil({ ownerId: eigenaar.id, actorId: eigenaar.id, action: 'gast_sessie_ingetrokken', type: 'sessie', result: 'success', service: opts.dienst, details: { sessies: rows.map((s: any) => String(s.id).slice(0, 8)), aantal: rows.length } });
  return { beeindigd: rows.length };
}

// ------------------------------------------------------------------------------------------------ gast
export const GAST_COOKIE = 'tsv_gast';
export type Gast = { sessieId: string; codeId: string; eigenaarId: string; codeNaam: string; scopes: GastScope[]; verlooptOp: number; gestartOp: number };
/** Inwisselen: atomisch één gebruik tellen (eenmalig/maximum/verloop/ingetrokken in dezelfde UPDATE). Altijd dezelfde fout naar buiten. */
export async function inwisselen(input: { code?: unknown }): Promise<{ token: string; gast: Gast; eerste: boolean }> {
  const normaal = codeNormaal(input.code);
  if (!normaal) fout('CODE_ONGELDIG');
  const c = huidigeContext();
  const app = apparaat(c?.ua), ip = ipHash(c?.ip);
  const { rows } = await sys().query(`UPDATE app.toegangscodes SET gebruikt = gebruikt + 1, eerste_gebruik_op = coalesce(eerste_gebruik_op, now()), laatst_gebruikt_op = now(), laatst_apparaat = $2, laatst_ip_hash = $3
    WHERE code_hash = $1 AND ingetrokken_op IS NULL AND (verloopt_op IS NULL OR verloopt_op > now())
      AND (CASE WHEN eenmalig THEN gebruikt < 1 WHEN max_gebruik IS NOT NULL THEN gebruikt < max_gebruik ELSE true END)
    RETURNING *`, [codeHash(normaal), app, ip]);
  const r = rows[0];
  if (!r) {
    const bestaand = (await sys().query('SELECT * FROM app.toegangscodes WHERE code_hash = $1', [codeHash(normaal)])).rows[0];
    if (bestaand) await log(bestaand.id, bestaand.user_id, 'geweigerd', { reden: statusVan(bestaand), bij: 'inwisselen' });
    return fout('CODE_ONGELDIG');
  }
  const eig = (await sys().query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [r.user_id])).rows[0]?.data || null;
  if (!eig || eig.status === 'blocked' || Number(eig.retiredAt || 0) > 0) { await log(r.id, r.user_id, 'geweigerd', { reden: 'eigenaar-geblokkeerd', bij: 'inwisselen' }); fout('CODE_ONGELDIG'); }
  const nu = Date.now();
  const eind = Math.min(r.verloopt_op ? new Date(r.verloopt_op).getTime() : Infinity, nu + GAST_SESSIE_MAX_MS);
  const token = randomBytes(32).toString('base64url');
  const s = (await sys().query(`INSERT INTO app.gast_sessies (code_id, user_id, token_hash, verloopt_op, apparaat, ip_hash) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, gestart_op`,
    [r.id, r.user_id, tokenHash(token), new Date(eind), app, ip])).rows[0];
  const eerste = Number(r.gebruikt) === 1;
  await log(r.id, r.user_id, 'ingewisseld', { gebruik: Number(r.gebruikt), eerste }, s.id);
  await auditStil({ ownerId: r.user_id, actorId: `gast:${r.id}`, action: 'toegangscode_ingewisseld', type: 'sessie', result: 'success', service: 'identity', details: { code: String(r.id), naam: r.naam, sessie: String(s.id).slice(0, 8), gebruik: Number(r.gebruikt) } });
  if (eerste) await meld(r.user_id, 'security', `Код доступу «${r.naam}» використано вперше / Toegangscode «${r.naam}» voor het eerst gebruikt`,
    `Хтось увійшов як гість із кодом «${r.naam}» (${app || 'невідомий пристрій'}). Якщо це не та людина — відкличте код. / Iemand is als gast binnengekomen met code «${r.naam}» (${app || 'onbekend apparaat'}). Was dit niet de bedoelde persoon, trek de code dan in.`,
    `https://id.tarasevych.com/methods?code=${r.id}#toegangscodes`);
  return { token: `${s.id}.${token}`, eerste, gast: { sessieId: String(s.id), codeId: String(r.id), eigenaarId: r.user_id, codeNaam: r.naam, scopes: (r.scopes || []).filter(isGastScope), verlooptOp: eind, gestartOp: new Date(s.gestart_op).getTime() } };
}
/** Cookie → geldige gastsessie (sessie, code en eigenaar opnieuw gecontroleerd), of null. */
export async function gastVanCookie(waarde: string): Promise<Gast | null> {
  const i = waarde.indexOf('.');
  const id = i > 0 ? waarde.slice(0, i) : '', token = i > 0 ? waarde.slice(i + 1) : '';
  if (!UUID.test(id) || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) return null;
  const r = (await sys().query(`SELECT s.*, c.naam, c.scopes, c.ingetrokken_op AS code_ingetrokken, c.verloopt_op AS code_verloopt FROM app.gast_sessies s JOIN app.toegangscodes c ON c.id = s.code_id WHERE s.id = $1`, [id])).rows[0];
  if (!r) return null;
  const a = Buffer.from(String(r.token_hash), 'hex'), b = Buffer.from(tokenHash(token), 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const nu = Date.now();
  if (r.ingetrokken_op || new Date(r.verloopt_op).getTime() <= nu || r.code_ingetrokken || (r.code_verloopt && new Date(r.code_verloopt).getTime() <= nu)) return null;
  const eig = (await sys().query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [r.user_id])).rows[0]?.data || null;
  if (!eig || eig.status === 'blocked' || Number(eig.retiredAt || 0) > 0) return null;
  if (nu - new Date(r.laatst_actief_op).getTime() > 60_000) await sys().query('UPDATE app.gast_sessies SET laatst_actief_op = now() WHERE id = $1', [id]).catch(() => undefined);
  return { sessieId: id, codeId: String(r.code_id), eigenaarId: r.user_id, codeNaam: r.naam, scopes: (r.scopes || []).filter(isGastScope), verlooptOp: new Date(r.verloopt_op).getTime(), gestartOp: new Date(r.gestart_op).getTime() };
}
export async function gastUitloggen(g: Gast) {
  await sys().query(`UPDATE app.gast_sessies SET ingetrokken_op = now(), ingetrokken_reden = 'uitgelogd' WHERE id = $1 AND ingetrokken_op IS NULL`, [g.sessieId]);
  await log(g.codeId, g.eigenaarId, 'uitgelogd', {}, g.sessieId);
}
export async function gastEigenaarNaam(g: Gast): Promise<string> {
  const d = (await sys().query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [g.eigenaarId])).rows[0]?.data || {};
  return veiligeNaam(d.name || d.displayName) || 'Mijn Ruimte';
}
/** Weergavenaam zonder e-mailadres (Google zet soms het adres als naam): dan leeg. */
export const veiligeNaam = (v: unknown) => { const n = String(v || '').replace(/\s+/g, ' ').trim().slice(0, 80); return n.includes('@') ? '' : n; };
/** Weigering vastleggen (scope buiten de code, of een niet-gastroute). */
export async function gastGeweigerd(g: Gast, wat: string) {
  await log(g.codeId, g.eigenaarId, 'geweigerd', { wat: String(wat).slice(0, 60) }, g.sessieId);
  await auditStil({ ownerId: g.eigenaarId, actorId: `gast:${g.codeId}`, action: 'gast_geweigerd', type: 'sessie', result: 'denied', service: 'identity', details: { code: g.codeId, naam: g.codeNaam, sessie: g.sessieId.slice(0, 8), wat: String(wat).slice(0, 60) } });
}

// ------------------------------------------------------------------------------------------------ lezers per scope
const JOURNAAL_GAST = Object.entries(JOURNAAL_ACTIES).filter(([, s]) => s !== 'toegang' && s !== 'token').map(([a]) => a);
export const GAST_LEZERS: Readonly<Record<GastScope, (eigenaarId: string) => Promise<unknown>>> = Object.freeze({
  'profiel.lezen': async (eigenaarId: string) => {
    const d = (await sys().query("SELECT data FROM app.records WHERE tbl = 'users' AND id = $1", [eigenaarId])).rows[0]?.data || {};
    const foto = String(d.picture || '');
    return { naam: veiligeNaam(d.name), foto: /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//.test(foto) ? foto.slice(0, 500) : null };
  },
  'apparaten.lezen': async (eigenaarId: string) => {
    const { rows } = await sys().query('SELECT name, platform, last_seen_at, created_at FROM app.agents WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at LIMIT 50', [eigenaarId]);
    const nu = Date.now();
    return { apparaten: rows.map((a: any) => ({ naam: String(a.name || '').slice(0, 80), platform: String(a.platform || ''), laatstGezien: iso(a.last_seen_at), actief: !!a.last_seen_at && nu - new Date(a.last_seen_at).getTime() < 5 * 60_000, sinds: iso(a.created_at) })) };
  },
  'journaal.lezen': async (eigenaarId: string) => {
    const a = await auditLijst({ ownerId: eigenaarId, acties: JOURNAAL_GAST, limit: 50 });
    return { items: a.items.map((r) => ({ op: new Date(r.createdAt).toISOString(), actie: r.action, soort: JOURNAAL_ACTIES[r.action], resultaat: r.result, naam: typeof r.details?.name === 'string' ? String(r.details.name).slice(0, 80) : typeof r.details?.clientName === 'string' ? String(r.details.clientName).slice(0, 80) : '' })) };
  },
});
/** Eén gastactie: alleen scopes van de code (standaard weigeren), altijd gelogd met de code-id. */
export async function gastBekijken(g: Gast, scope: unknown) {
  if (!isGastScope(scope) || !g.scopes.includes(scope)) { await gastGeweigerd(g, `scope:${String(scope).slice(0, 40)}`); fout('GAST_GEEN_TOEGANG', 403); }
  const data = await GAST_LEZERS[scope as GastScope](g.eigenaarId);
  await log(g.codeId, g.eigenaarId, 'actie', { scope }, g.sessieId);
  await auditStil({ ownerId: g.eigenaarId, actorId: `gast:${g.codeId}`, action: 'gast_actie', type: 'sessie', result: 'success', service: 'identity', details: { code: g.codeId, naam: g.codeNaam, sessie: g.sessieId.slice(0, 8), scope } });
  return data;
}
