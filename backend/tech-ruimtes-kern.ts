// Technische ruimtes v2 — kern (database, vlag, schaduw). Routes: backend/tech-ruimtes.ts. Beslissing: shared/ruimte-toegang.ts.
// Vlag tech-ruimtes-v2 UIT → niemand roept de v2-paden aan (tech-profiel.ts kijkt eerst naar v2Aan) = exact het oude gedrag.
// Schaduw (vlag tech-ruimtes-v2-schaduw of env TECH_RUIMTES_V2_SCHADUW=1, vlag v2 UIT): oude antwoord blijft, verschil met de strenge
// regel gaat naar het logboek (owner.tech.schaduw.verschil), hoogstens één regel per (gebruiker, punt, reden) per 10 minuten.
import { createHash } from 'node:crypto';
import { isOwnerEmail } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { getPool } from '../server/platform/pg';
import { isEigenaarDefinitie, isRuimteModus, maxMinutenBeste, rollenVoorTermijn, ruimteToegang, termijnOpties, RUIMTE_MAX_MINUTEN, type Ruimte, type RuimteBesluit, type RuimteBron, type RuimteCtx, type RuimteModus, type RuimteSessieFeit } from '../shared/ruimte-toegang';
import { mogelijkhedenVan, rolInfo, isTechRol } from '../shared/tech-rollen';
import * as tp from './tech-profiel';
import { huidigeContext } from '../server/platform/context';
import { bindingKlopt, bindingWaarde, scheidingAan } from './ruimte-sessie';

const sys = () => getPool('systeem');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export const VLAG = 'tech-ruimtes-v2';
export const VLAG_SCHADUW = 'tech-ruimtes-v2-schaduw';
const fout = (code: string, status = 400): never => { throw new tp.TechFout(code, status); };
const audit = (userId: string, action: string, details: Record<string, unknown>, result = 'success') =>
  auditToevoegen({ ownerId: userId, actorId: userId, action, type: 'beveiliging', result, details }).catch((e) => { console.error(`[tech-ruimtes] AUDIT MISLUKT (${action}):`, (e as Error).message); });

// ---------------------------------------------------------------- vlaggen (3 s in het geheugen per gebruiker)
const vlagCache = new Map<string, { tot: number; aan: boolean }>();
async function vlag(userId: string, sleutel: string): Promise<boolean> {
  if (!userId) return false;
  const k = `${userId}\u0000${sleutel}`, nu = Date.now(), c = vlagCache.get(k);
  if (c && c.tot > nu) return c.aan;
  let aan = false;
  try { const { berekenen } = await import('./vlaggen'); aan = (await berekenen({ id: userId } as never, [sleutel]))[0]?.value === true; } catch { aan = false; }
  vlagCache.set(k, { tot: nu + 3000, aan });
  return aan;
}
export const _vlagCacheLeeg = () => vlagCache.clear();
export const v2Aan = (userId: string) => vlag(userId, VLAG);
export async function schaduwAan(userId: string): Promise<boolean> {
  if (process.env.TECH_RUIMTES_V2_SCHADUW === '1') return true;
  return vlag(userId, VLAG_SCHADUW);
}

// ---------------------------------------------------------------- feiten
type Rij = { id: string; user_id: string; profiel_id: string; sessie_id: string; rollen: string[]; modus: RuimteModus; reden: string; begin_op: Date; eind_op: Date | null; grens_op: Date; actief: Ruimte; beeindigd_op: Date | null; binding_hmac?: string | null; binding_generatie?: number };
const LIVE = `r.beeindigd_op IS NULL AND r.grens_op > now() AND (r.modus <> 'tijd' OR r.eind_op > now())`;
/** Ankersessie van de site leeft (niet ingetrokken, niet verlopen). Geeft ook de absolute grens. */
const SITE_LEEFT = (kol: string) => `EXISTS (SELECT 1 FROM app.records s WHERE s.tbl = 'owner_service_sessions_v1' AND s.id = ${kol}
  AND COALESCE((s.data->>'revokedAt')::numeric, 0) = 0 AND (s.data->>'absoluteExpiresAt')::numeric > extract(epoch FROM now()) * 1000
  AND (s.data->>'idleExpiresAt')::numeric > extract(epoch FROM now()) * 1000)`;

export async function siteSessie(sessieId: string): Promise<{ leeft: boolean; grens: number }> {
  const r = (await sys().query(`SELECT data FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND id = $1`, [sessieId])).rows[0];
  if (!r) return { leeft: false, grens: 0 };
  const d = r.data || {}, nu = Date.now();
  return { leeft: !Number(d.revokedAt || 0) && Number(d.absoluteExpiresAt) > nu && Number(d.idleExpiresAt) > nu, grens: Number(d.absoluteExpiresAt) || 0 };
}

async function account(userId: string): Promise<{ rol: string | null; eigenaar: boolean; actief: boolean; email: string }> {
  const r = (await sys().query(`SELECT data->>'role' AS role, data->>'email' AS email, data->>'status' AS status, COALESCE((data->>'deletedAt')::numeric,0) AS del FROM app.records WHERE tbl = 'users' AND id = $1`, [userId])).rows[0];
  if (!r) return { rol: null, eigenaar: false, actief: false, email: '' };
  const eigenaar = isEigenaarDefinitie(r.role, isOwnerEmail(r.email));
  return { rol: r.role, eigenaar, actief: Number(r.del) === 0 && (r.status === 'approved' || eigenaar), email: String(r.email || '') };
}
async function profielFeit(userId: string, eigenaar: boolean, email: string, rol: string | null) {
  // Eigenaar: profielVan maakt/herstelt het profiel — de eigenaar kan het nooit kwijt (root/eigenaar nooit buitengesloten).
  const p = eigenaar ? await tp.profielVan({ id: userId, email, role: rol ?? undefined }) : (() => null)();
  if (p) return { rollen: p.rollen, ingetrokken: !!p.ingetrokkenOp, max: p.maxMinuten, profielId: p.profielId };
  const r = (await sys().query('SELECT rollen, ingetrokken_op, max_minuten, profiel_id FROM app.tech_profielen WHERE user_id = $1', [userId])).rows[0];
  return r ? { rollen: (r.rollen as string[]).filter(isTechRol), ingetrokken: !!r.ingetrokken_op, max: Number(r.max_minuten), profielId: String(r.profiel_id) } : null;
}

export async function aiToegestaan(userId: string, rij: Rij, verbindingId?: string | null): Promise<boolean> {
  const doelen = verbindingId ? ['*', verbindingId] : ['*'];
  const r = (await sys().query(`SELECT a.ruimtes FROM app.tech_ruimte_ai a WHERE a.user_id = $1 AND a.verbinding_id = ANY($4::text[]) AND (
      (a.termijn = 'tijd' AND a.eind_op > now() AND a.ruimte_sessie_id = $2)
   OR (a.termijn = 'tot-technisch-einde' AND a.ruimte_sessie_id = $2)
   OR (a.termijn = 'tot-site-uitloggen' AND EXISTS (SELECT 1 FROM app.tech_ruimte_sessies x WHERE x.id = a.ruimte_sessie_id AND x.sessie_id = $3)))
    ORDER BY CASE WHEN a.verbinding_id = '*' THEN 1 ELSE 0 END, a.gezet_op DESC LIMIT 1`, [userId, rij.id, rij.sessie_id, doelen])).rows[0];
  return Array.isArray(r?.ruimtes) && (r.ruimtes as string[]).includes('technisch');
}

/**
 * Ruimtes-scheiding (0123): klopt de HMAC-binding van deze rij met de site-sessie van het verzoek? `verzoekSessie` = de
 * ankersessie die het verzoek droeg (site) of de eigen sessie_id van de rij (MCP: alleen integriteit). Een rij zonder binding
 * wordt alleen gebonden als het verzoek ZELF die ankersessie draagt (de rij is via die sessie gevonden) — anders: ongeldig.
 */
async function bindingVan(rij: Rij, verzoekSessie: string | null, magBinden: boolean): Promise<boolean> {
  if (!verzoekSessie || verzoekSessie !== rij.sessie_id) return false;
  const gen = Number(rij.binding_generatie) || 0;
  if (!rij.binding_hmac) {
    if (!magBinden) return false;
    const w = bindingWaarde(rij.sessie_id, String(rij.id), gen);
    if (!w) return false;
    await sys().query('UPDATE app.tech_ruimte_sessies SET binding_hmac = $2 WHERE id = $1 AND binding_hmac IS NULL', [rij.id, w]);
    rij.binding_hmac = w;
  }
  return bindingKlopt(rij.binding_hmac, verzoekSessie, String(rij.id), gen);
}
async function feitVan(rij: Rij | null, gebonden: boolean, binding?: { verzoekSessie: string | null; magBinden: boolean }): Promise<RuimteSessieFeit | null> {
  if (!rij) return null;
  const s = await siteSessie(rij.sessie_id);
  const feit: RuimteSessieFeit = { id: String(rij.id), rollen: rij.rollen, modus: rij.modus, actief: rij.actief, eind: rij.eind_op ? new Date(rij.eind_op).getTime() : null,
    grens: new Date(rij.grens_op).getTime(), beeindigd: !!rij.beeindigd_op, siteSessieLeeft: s.leeft, gebonden };
  if (binding) feit.bindingGeldig = await bindingVan(rij, binding.verzoekSessie, binding.magBinden);
  return feit;
}
/** Nieuwe binding (start, of rotatie bij stap-op/verlengen): generatie +1, nieuwe HMAC. */
async function bindingVernieuwen(rijId: string, sessieId: string): Promise<void> {
  const r = (await sys().query('UPDATE app.tech_ruimte_sessies SET binding_generatie = binding_generatie + 1 WHERE id = $1 RETURNING binding_generatie', [rijId])).rows[0];
  if (!r) return;
  const w = bindingWaarde(sessieId, rijId, Number(r.binding_generatie));
  await sys().query('UPDATE app.tech_ruimte_sessies SET binding_hmac = $2 WHERE id = $1', [rijId, w]);
}
const SITE_WEG_REDENEN = ['uitgelogd', 'revoke', 'revoke-all', 'revoke-others', 'emergency', 'site-sessie-weg'];
/** Ruimtes-scheiding: was de laatste technische sessie gesloten OMDAT de site-sessie wegging? Dan SITE_SESSIE_WEG i.p.v. GEEN_TECH_SESSIE. */
async function siteWegReden(userId: string, sessieId: string | null): Promise<boolean> {
  const r = (await sys().query(`SELECT sessie_id, beeindigd_reden FROM app.tech_ruimte_sessies WHERE user_id = $1 AND beeindigd_op > now() - interval '1 day'
    ${sessieId ? 'AND sessie_id = $2' : ''} ORDER BY beeindigd_op DESC LIMIT 1`, sessieId ? [userId, sessieId] : [userId])).rows[0];
  if (!r) return false;
  return SITE_WEG_REDENEN.includes(String(r.beeindigd_reden)) || !(await siteSessie(String(r.sessie_id))).leeft;
}

export type Herkomst = { bron: RuimteBron; tab?: string | null; sessieId?: string | null; verbindingId?: string | null };
/** Lopende v2-rij voor dit verzoek: via sessie-id (site), via geregistreerd tabblad (oude controles zonder sessie) of — MCP — elke levende. */
async function rijVoor(userId: string, h: Herkomst): Promise<{ rij: Rij | null; gebonden: boolean; alle?: Rij[] }> {
  if (h.sessieId) {
    const rij = (await sys().query(`SELECT r.* FROM app.tech_ruimte_sessies r WHERE r.user_id = $1 AND r.sessie_id = $2 AND ${LIVE} ORDER BY r.begin_op DESC LIMIT 1`, [userId, h.sessieId])).rows[0] ?? null;
    return { rij, gebonden: !!rij };
  }
  if (h.tab && tp.TAB_RE.test(h.tab)) {
    const rij = (await sys().query(`SELECT r.* FROM app.tech_ruimte_sessies r JOIN app.tech_ruimte_tabs t ON t.ruimte_sessie_id = r.id AND t.tab_hash = $2
      WHERE r.user_id = $1 AND ${LIVE} ORDER BY r.begin_op DESC LIMIT 1`, [userId, sha(`tech-ruimte-tab:${h.tab}`)])).rows[0] ?? null;
    return { rij, gebonden: !!rij };
  }
  const alle = (await sys().query(`SELECT r.* FROM app.tech_ruimte_sessies r WHERE r.user_id = $1 AND ${LIVE} AND ${SITE_LEEFT('r.sessie_id')} ORDER BY r.begin_op DESC LIMIT 20`, [userId])).rows;
  return { rij: alle[0] ?? null, gebonden: false, alle };
}

/** DE beslissing voor een verzoek (site, AI/MCP, extensie). Elke fout = privé (veilige richting). */
export async function besluit(userId: string, h: Herkomst, ruimte: Ruimte = 'technisch'): Promise<RuimteBesluit & { rij: Rij | null }> {
  const leeg = { toegestaan: false, ruimte: 'prive' as Ruimte, mogelijkheden: [], rollen: [], eind: null, code: 'FOUT', sessieId: null, rij: null };
  try {
    const acc = await account(userId);
    const profiel = await profielFeit(userId, acc.eigenaar, acc.email, acc.rol);
    const basis: Omit<RuimteCtx, 'sessie'> = { bron: h.bron, nu: Date.now(), eigenaar: acc.eigenaar, accountActief: acc.actief, profiel: profiel ? { rollen: profiel.rollen, ingetrokken: profiel.ingetrokken } : null };
    // Ruimtes-scheiding (0123): een site-verzoek telt ALLEEN via de ankersessie die het zelf droeg (verzoekcontext), nooit via
    // alleen een tabbladcode; en elke rij moet een geldige HMAC-binding aan die sessie hebben.
    const streng = await scheidingAan(userId);
    if (streng && h.bron !== 'mcp' && !h.sessieId) {
      const ctxSessie = huidigeContext()?.sessieId;
      h = ctxSessie ? { ...h, sessieId: ctxSessie } : { ...h, tab: null };
    }
    const { rij, gebonden, alle } = await rijVoor(userId, h);
    const metCode = (b: RuimteBesluit, r: Rij | null) => ({ ...b, rij: r });
    const naGeen = async (b: RuimteBesluit, r: Rij | null) => (streng && b.code === 'GEEN_TECH_SESSIE' && await siteWegReden(userId, h.bron === 'mcp' ? null : (h.sessieId ?? null))) ? metCode({ ...b, code: 'SITE_SESSIE_WEG' }, r) : metCode(b, r);
    if (h.bron === 'mcp') {
      for (const r of alle ?? []) {
        const b = ruimteToegang({ ...basis, sessie: await feitVan(r, false, streng ? { verzoekSessie: r.sessie_id, magBinden: false } : undefined), aiToegestaan: await aiToegestaan(userId, r, h.verbindingId) }, ruimte);
        if (b.toegestaan && b.ruimte === 'technisch') return { ...b, rij: r };
      }
      return naGeen(ruimteToegang({ ...basis, sessie: await feitVan(rij, false, streng && rij ? { verzoekSessie: rij.sessie_id, magBinden: false } : undefined), aiToegestaan: rij ? await aiToegestaan(userId, rij, h.verbindingId) : false }, ruimte), rij);
    }
    if (streng && !h.sessieId) return metCode(ruimteToegang({ ...basis, sessie: null }, ruimte), null);
    return naGeen(ruimteToegang({ ...basis, sessie: await feitVan(rij, gebonden, streng ? { verzoekSessie: h.sessieId ?? null, magBinden: true } : undefined) }, ruimte), rij);
  } catch (err) { console.error('[tech-ruimtes] besluit faalde, privé:', (err as Error).message); return leeg; }
}

/** Het besluit in de vorm die de oude controles verwachten (tech-profiel.Activatie). */
export function alsActivatie(b: Awaited<ReturnType<typeof besluit>>): tp.Activatie | null {
  if (!b.toegestaan || b.ruimte !== 'technisch' || !b.rij) return null;
  const r = b.rij;
  return { id: String(r.id), profielId: r.profiel_id, rollen: b.rollen, mogelijkheden: mogelijkhedenVan(b.rollen), reden: r.reden, begin: new Date(r.begin_op).getTime(),
    eind: b.eind ?? new Date(r.grens_op).getTime(), modus: r.modus === 'tijd' ? 'tijd' : r.modus === 'tot-site-uitloggen' ? 'tot-uitloggen' : 'tot-verlaten',
    sessieId: r.sessie_id, tabSessieId: null, herkomst: 'eigen' };
}

/** Tabblad bij de sessie van deze aanmelding registreren (alleen als dat tabblad met DIE sessie aanmeldt). */
export async function registreerTab(userId: string, sessieId: string, tab: string): Promise<void> {
  if (!tp.TAB_RE.test(tab)) return;
  await sys().query(`INSERT INTO app.tech_ruimte_tabs (ruimte_sessie_id, user_id, tab_hash)
    SELECT r.id, r.user_id, $3 FROM app.tech_ruimte_sessies r WHERE r.user_id = $1 AND r.sessie_id = $2 AND r.beeindigd_op IS NULL
    ON CONFLICT (ruimte_sessie_id, tab_hash) DO UPDATE SET gezien_op = now()`, [userId, sessieId, sha(`tech-ruimte-tab:${tab}`)]);
}

// ---------------------------------------------------------------- acties
export type SiteSessie = { id: string; createdAt: number } | null;
const vereisSessie = (s: SiteSessie): string => s?.id ? String(s.id) : fout('SESSIE_VEREIST', 403);

const meldMcpLijst = (userId: string) => { void import('./connector-v2-stroom').then((m) => m.meldLijstGewijzigd(userId)).catch(() => undefined); };

async function beeindigRijen(userId: string, where: string, params: unknown[], reden: string): Promise<number> {
  const rows = (await sys().query(`UPDATE app.tech_ruimte_sessies r SET beeindigd_op = now(), beeindigd_reden = $2 WHERE r.user_id = $1 AND r.beeindigd_op IS NULL ${where} RETURNING id, modus, sessie_id`, [userId, reden, ...params])).rows;
  for (const r of rows) await audit(userId, 'owner.tech.ruimte.beeindigd', { ruimteSessie: r.id, modus: r.modus, reden, sessie: r.sessie_id });
  if (rows.length) { tp.meldTechEindeExtern(userId); meldMcpLijst(userId); }
  return rows.length;
}

export async function starten(u: tp.Gebruiker, s: SiteSessie, tab: string, modusIn: unknown, minutenIn: unknown, redenIn: unknown) {
  const sid = vereisSessie(s);
  if (!isRuimteModus(modusIn)) fout('MODUS_ONGELDIG');
  const modus = modusIn as RuimteModus;
  const acc = await account(u.id);
  const p = await profielFeit(u.id, acc.eigenaar, acc.email, acc.rol);
  if (!p || p.ingetrokken || !p.rollen.length) fout('GEEN_TECH_PROFIEL', 403);
  const profiel = p!;
  const minuten = modus === 'tijd' ? Math.round(Number(minutenIn)) : undefined;
  const rollen = rollenVoorTermijn(profiel.rollen, profiel.max, modus, minuten);
  if (!rollen.length) fout('DUUR_ONGELDIG');
  const reden = String(redenIn ?? '').trim().replace(/\s+/g, ' ');
  if (reden.length < 3 || reden.length > 300) fout('REDEN_ONGELDIG');
  const site = await siteSessie(sid);
  if (!site.leeft) fout('SESSIE_VEREIST', 403);
  await beeindigRijen(u.id, 'AND r.sessie_id = $3', [sid], 'vervangen');
  const row = (await sys().query(`INSERT INTO app.tech_ruimte_sessies (user_id, profiel_id, sessie_id, rollen, modus, reden, eind_op, grens_op)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $5 = 'tijd' THEN now() + make_interval(mins => $7::int) END, to_timestamp($8::double precision / 1000)) RETURNING *`,
    [u.id, profiel.profielId, sid, rollen, modus, reden, minuten ?? 0, site.grens])).rows[0];
  await bindingVernieuwen(String(row.id), sid);
  await registreerTab(u.id, sid, tab);
  await sys().query('UPDATE app.tech_profielen SET laatst_actief = now() WHERE user_id = $1', [u.id]);
  await audit(u.id, 'owner.tech.ruimte.gestart', { ruimteSessie: row.id, modus, minuten: minuten ?? null, rollen, reden, sessie: sid });
  meldMcpLijst(u.id);
  return row;
}

export async function wisselen(u: tp.Gebruiker, s: SiteSessie, tab: string, naar: unknown) {
  const sid = vereisSessie(s);
  if (naar !== 'prive' && naar !== 'technisch') fout('NAAR_ONGELDIG');
  const { rij } = await rijVoor(u.id, { bron: 'site', sessieId: sid });
  if (!rij) { if (naar === 'prive') return; fout('GEEN_TECH_SESSIE', 409); }
  // Geen stap-op: de sessie is al met stap-op gestart en hangt aan DEZE aanmelding.
  await sys().query(`UPDATE app.tech_ruimte_sessies SET actief = $2, pauze_op = CASE WHEN $2 = 'prive' THEN now() ELSE NULL END WHERE id = $1`, [rij!.id, naar]);
  await registreerTab(u.id, sid, tab);
  await audit(u.id, naar === 'prive' ? 'owner.tech.ruimte.pauze' : 'owner.tech.ruimte.hervat', { ruimteSessie: rij!.id, sessie: sid });
  if (naar === 'prive') tp.meldTechEindeExtern(u.id);
  meldMcpLijst(u.id);
}

export async function verlengen(u: tp.Gebruiker, s: SiteSessie, minutenIn: unknown, soort: unknown) {
  const sid = vereisSessie(s);
  if (soort !== 'bijtellen' && soort !== 'vervangen') fout('SOORT_ONGELDIG');
  const { rij } = await rijVoor(u.id, { bron: 'site', sessieId: sid });
  if (!rij) fout('GEEN_TECH_SESSIE', 409);
  if (rij!.modus !== 'tijd') fout('NIET_OP_TIJD', 409);
  const m = Math.round(Number(minutenIn));
  if (!Number.isFinite(m) || m < 5 || m > RUIMTE_MAX_MINUTEN) fout('DUUR_ONGELDIG');
  const nu = Date.now(), huidig = new Date(rij!.eind_op as Date).getTime();
  const nieuw = soort === 'bijtellen' ? huidig + m * 60_000 : nu + m * 60_000;
  const plafond = Math.max(0, ...rij!.rollen.map((r) => rolInfo(r)?.plafondMinuten ?? 0));
  if (nieuw - nu > Math.min(plafond, RUIMTE_MAX_MINUTEN) * 60_000 + 1000) fout('DUUR_ONGELDIG');
  await sys().query(`UPDATE app.tech_ruimte_sessies SET eind_op = to_timestamp($2::double precision / 1000), verlengd_op = now() WHERE id = $1`, [rij!.id, nieuw]);
  await bindingVernieuwen(String(rij!.id), sid); // stap-op gedaan → binding roteert
  await audit(u.id, 'owner.tech.ruimte.verlengd', { ruimteSessie: rij!.id, soort, minuten: m, eind: new Date(nieuw).toISOString() });
}

export const beeindigen = (u: tp.Gebruiker, s: SiteSessie) => s?.id ? beeindigRijen(u.id, 'AND r.sessie_id = $3', [String(s.id)], 'zelf') : Promise.resolve(0);

/** Uitloggen (tech-profiel.beeindigenBijUitloggen). Met tab = één tabblad: 'tijd' en 'tot-technisch-einde' eindigen, 'tot-site-uitloggen' verliest alleen dat tabblad. */
export async function bijUitloggen(userId: string, tab?: string): Promise<number> {
  try {
    if (tab && tp.TAB_RE.test(tab)) {
      const h = sha(`tech-ruimte-tab:${tab}`);
      const n = await beeindigRijen(userId, `AND r.modus <> 'tot-site-uitloggen' AND EXISTS (SELECT 1 FROM app.tech_ruimte_tabs t WHERE t.ruimte_sessie_id = r.id AND t.tab_hash = $3)`, [h], 'uitgelogd');
      await sys().query('DELETE FROM app.tech_ruimte_tabs WHERE user_id = $1 AND tab_hash = $2', [userId, h]);
      return n;
    }
    return await beeindigRijen(userId, '', [], 'uitgelogd');
  } catch (err) { console.error('[tech-ruimtes] uitloggen:', (err as Error).message); return 0; }
}
/** Sessies ingetrokken (tech-profiel.beeindigenBijIntrekken). */
export async function bijIntrekken(userId: string, reden: string, doel: { sessieId?: string | null; behalveSessieId?: string | null } = {}): Promise<number> {
  try {
    if (doel.sessieId) return await beeindigRijen(userId, 'AND r.sessie_id = $3', [String(doel.sessieId)], reden);
    if (doel.behalveSessieId) return await beeindigRijen(userId, 'AND r.sessie_id <> $3', [String(doel.behalveSessieId)], reden);
    return await beeindigRijen(userId, '', [], reden);
  } catch (err) { console.error('[tech-ruimtes] intrekken:', (err as Error).message); return 0; }
}
export async function profielWeg(userId: string): Promise<number> { return bijIntrekken(userId, 'ingetrokken'); }

// ---------------------------------------------------------------- status
const iso = (d: Date | number | null | undefined) => d ? new Date(d).toISOString() : null;
export async function status(u: tp.Gebruiker, s: SiteSessie, tab: string) {
  const aan = await v2Aan(u.id);
  const acc = await account(u.id);
  const p = await profielFeit(u.id, acc.eigenaar, acc.email, acc.rol);
  const rollen = p && !p.ingetrokken ? p.rollen : [];
  const max = p ? p.max : 0;
  let sessie = null as null | Record<string, unknown>, actief: Ruimte = 'prive', pauze = false;
  if (aan && s?.id) {
    await registreerTab(u.id, String(s.id), tab);
    const b = await besluit(u.id, { bron: 'site', sessieId: String(s.id) });
    const r = b.rij;
    if (r) {
      sessie = { id: String(r.id), modus: r.modus, eindTijd: iso(r.eind_op), gestartOp: iso(r.begin_op), grensTijd: iso(r.grens_op), rollen: b.toegestaan ? b.rollen : r.rollen, mogelijkheden: b.mogelijkheden, reden: r.reden };
      actief = b.toegestaan ? 'technisch' : 'prive';
      pauze = r.actief === 'prive';
    }
  }
  return {
    aan, actief, pauze, sessie, eigenaar: acc.eigenaar, schaduw: !aan && (await schaduwAan(u.id)),
    technischToegestaan: acc.eigenaar || rollen.length > 0,
    termijnen: termijnOpties(rollen, max), maxMinuten: maxMinutenBeste(rollen, max),
    rollen: rollen.map((r) => ({ naam: r, maxMinuten: rolInfo(r)?.plafondMinuten ?? 0 })), nu: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- toegang (één overzicht)
export async function toegang(u: tp.Gebruiker, s: SiteSessie, tab: string) {
  const b = await besluit(u.id, s?.id ? { bron: 'site', sessieId: String(s.id) } : { bron: 'site', tab });
  const magBeheren = b.toegestaan && (b.mogelijkheden.includes('users.manage') || b.mogelijkheden.includes('roles.delegate'));
  const fouten: string[] = [];
  const deel = async <T>(naam: string, f: () => Promise<T[]>): Promise<T[]> => { try { return await f(); } catch (e) { fouten.push(naam); console.error(`[tech-ruimtes] toegang ${naam}:`, (e as Error).message); return []; } };
  const mensen = magBeheren ? await deel('mensen', async () => (await sys().query(`SELECT p.user_id, p.rollen, p.max_minuten, p.ingetrokken_op, r.data->>'email' AS email, COALESCE(r.data->>'name','') AS naam, r.data->>'role' AS role,
      GREATEST((SELECT max(COALESCE(x.eind_op, x.grens_op)) FROM app.tech_ruimte_sessies x WHERE x.user_id = p.user_id AND x.beeindigd_op IS NULL),
               (SELECT max(a.eind_op) FROM app.tech_activaties a WHERE a.user_id = p.user_id AND a.beeindigd_op IS NULL AND a.eind_op > now())) AS actief_tot
    FROM app.tech_profielen p LEFT JOIN app.records r ON r.tbl = 'users' AND r.id = p.user_id ORDER BY p.ingetrokken_op NULLS FIRST, p.toegekend_op DESC LIMIT 200`)).rows.map((r: any) => ({
      userId: String(r.user_id), email: String(r.email || ''), naam: String(r.naam || ''), rollen: r.rollen, maxMinuten: Number(r.max_minuten),
      eigenaar: isEigenaarDefinitie(r.role, isOwnerEmail(r.email)), actiefTot: iso(r.actief_tot), ingetrokken: !!r.ingetrokken_op }))) : [];
  const sessies = await deel('sessies', async () => (await sys().query(`SELECT * FROM app.tech_ruimte_sessies r WHERE r.user_id = $1 AND ${LIVE} ORDER BY begin_op DESC`, [u.id])).rows.map((r: any) => ({
    id: String(r.id), modus: r.modus, eindTijd: iso(r.eind_op), grensTijd: iso(r.grens_op), gestartOp: iso(r.begin_op), actief: r.actief, dezeSessie: !!s?.id && r.sessie_id === String(s.id) })));
  const instellingen = await deel('ai-instellingen', async () => (await sys().query('SELECT * FROM app.tech_ruimte_ai WHERE user_id = $1', [u.id])).rows);
  const perId = new Map(instellingen.map((r: any) => [String(r.verbinding_id), r]));
  const ai = await deel('ai', async () => (await sys().query(`SELECT id, client_name, agent, refresh_expires_at FROM app.mcp_oauth_tokens WHERE user_id = $1 AND revoked_at IS NULL AND refresh_expires_at > now() ORDER BY created_at DESC LIMIT 100`, [u.id])).rows.map((r: any) => {
    const i: any = perId.get(String(r.id)) ?? perId.get('*');
    return { verbindingId: String(r.id), naam: String(r.client_name || ''), agent: r.agent ?? null, ruimtes: i ? i.ruimtes : [], termijn: i ? i.termijn : null, eindTijd: i ? iso(i.eind_op) : null, tokenTot: iso(r.refresh_expires_at), bron: 'mcp-oauth' as const };
  }));
  if (perId.has('*')) { const i: any = perId.get('*'); ai.push({ verbindingId: '*', naam: '*', agent: null, ruimtes: i.ruimtes, termijn: i.termijn, eindTijd: iso(i.eind_op), tokenTot: null, bron: 'instelling' as never }); }
  const extensie = await deel('extensie', async () => (await sys().query(`SELECT id, agent_id, ruimte, einde_soort, eind_op FROM app.extensie_ontgrendelingen WHERE user_id = $1 AND ingetrokken_op IS NULL AND eind_op > now() ORDER BY eind_op DESC LIMIT 100`, [u.id])).rows.map((r: any) => ({
    id: String(r.id), agentId: String(r.agent_id || ''), ruimte: r.ruimte, eindeSoort: r.einde_soort, eindTijd: iso(r.eind_op), overleeftTabUitloggen: true })));
  const codes = await deel('codes', async () => (await sys().query(`SELECT id, naam, scopes, verloopt_op FROM app.toegangscodes WHERE user_id = $1 AND ingetrokken_op IS NULL AND (verloopt_op IS NULL OR verloopt_op > now()) ORDER BY aangemaakt_op DESC LIMIT 100`, [u.id])).rows.map((r: any) => ({ id: String(r.id), naam: r.naam, scopes: r.scopes, verlooptOp: iso(r.verloopt_op) })));
  const vlagTests = await deel('vlagTests', async () => (await sys().query('SELECT sleutel, waarde, tot FROM app.feature_flag_tests WHERE user_id = $1 AND tot > now() ORDER BY sleutel', [u.id])).rows.map((r: any) => ({ sleutel: r.sleutel, waarde: r.waarde, tot: iso(r.tot) })));
  return { magBeheren, mensen, sessies, ai, extensie, codes, vlagTests, fouten };
}

export async function zorgVoorActieveTechSessie(
  u: tp.Gebruiker,
  s: SiteSessie,
  tab: string,
  opties: { magNieuwStarten?: boolean; reden?: string } = {},
) {
  const sid = vereisSessie(s);
  let b = await besluit(u.id, { bron: 'site', sessieId: sid });
  if (b.toegestaan && b.rij) return b;

  // Controleer of dezelfde gebruiker al een levende actieve technische sessie op een ander subdomein heeft (bv. admin.* → mcp.*).
  const { alle } = await rijVoor(u.id, { bron: 'mcp' });
  let actieveElders: Rij | null = null;
  for (const kand of alle ?? []) {
    if (kand.sessie_id === sid || kand.actief !== 'technisch') continue;
    const elders = await besluit(u.id, { bron: 'site', sessieId: kand.sessie_id });
    if (elders.toegestaan && elders.rij) { actieveElders = elders.rij; break; }
  }

  if (b.rij && b.rij.actief === 'prive' && (opties.magNieuwStarten || actieveElders !== null)) {
    await wisselen(u, s, tab, 'technisch');
    return besluit(u.id, { bron: 'site', sessieId: sid });
  }

  if (!b.rij && actieveElders !== null) {
    const modus: RuimteModus = actieveElders.modus;
    const restMin = modus === 'tijd' && actieveElders.eind_op
      ? Math.max(5, Math.min(RUIMTE_MAX_MINUTEN, Math.ceil((new Date(actieveElders.eind_op).getTime() - Date.now()) / 60_000)))
      : undefined;
    await starten(u, s, tab, modus, restMin, String(actieveElders.reden || opties.reden || 'AI-sessie overgenomen'));
    return besluit(u.id, { bron: 'site', sessieId: sid });
  }

  if (!b.rij && opties.magNieuwStarten) {
    const acc = await account(u.id);
    const p = await profielFeit(u.id, acc.eigenaar, acc.email, acc.rol);
    if (!p || p.ingetrokken || !p.rollen.length) fout('GEEN_TECH_PROFIEL', 403);
    const magUitlog = rollenVoorTermijn(p!.rollen, p!.max, 'tot-site-uitloggen', undefined).length > 0;
    const modus: RuimteModus = magUitlog ? 'tot-site-uitloggen' : 'tijd';
    const min = magUitlog ? undefined : Math.max(15, Math.min(60, maxMinutenBeste(p!.rollen, p!.max) || 60));
    await starten(u, s, tab, modus, min, opties.reden || 'AI-toegang op pagina van agent');
    return besluit(u.id, { bron: 'site', sessieId: sid });
  }

  return b;
}

export async function aiZetten(u: tp.Gebruiker, s: SiteSessie, input: Record<string, unknown>) {
  vereisSessie(s);
  const wilTech = Array.isArray(input.ruimtes) && input.ruimtes.includes('technisch');
  const b = await zorgVoorActieveTechSessie(u, s, String(input.tabContext || ''), {
    magNieuwStarten: wilTech && input.activeerSessie === true,
    reden: 'AI-sessiedelegatie',
  });
  if (!b.toegestaan || !b.rij) fout('TECH_RUIMTE_VEREIST', 403);
  const vid = String(input.verbindingId ?? '');
  if (!/^(\*|[A-Za-z0-9._:-]{1,100})$/.test(vid)) fout('VERBINDING_ONGELDIG');
  const ruimtes = Array.isArray(input.ruimtes) ? [...new Set(input.ruimtes)] : null;
  if (!ruimtes || !ruimtes.every((r) => r === 'prive' || r === 'technisch')) fout('RUIMTES_ONGELDIG');
  if (!isRuimteModus(input.termijn)) fout('TERMIJN_ONGELDIG');
  const termijn = input.termijn as RuimteModus;
  let minuten = 0;
  if (termijn === 'tijd') { minuten = Math.round(Number(input.minuten)); if (!Number.isFinite(minuten) || minuten < 15 || minuten > RUIMTE_MAX_MINUTEN) fout('DUUR_ONGELDIG'); }
  await sys().query(`INSERT INTO app.tech_ruimte_ai (user_id, verbinding_id, ruimtes, termijn, eind_op, ruimte_sessie_id) VALUES ($1, $2, $3, $4, CASE WHEN $4 = 'tijd' THEN now() + make_interval(mins => $5::int) END, $6)
    ON CONFLICT (user_id, verbinding_id) DO UPDATE SET ruimtes = EXCLUDED.ruimtes, termijn = EXCLUDED.termijn, eind_op = EXCLUDED.eind_op, ruimte_sessie_id = EXCLUDED.ruimte_sessie_id, gezet_op = now()`,
    [u.id, vid, ruimtes, termijn, minuten, b.rij!.id]);
  await audit(u.id, 'owner.tech.ruimte.ai', { verbinding: vid, ruimtes, termijn, minuten: termijn === 'tijd' ? minuten : null, ruimteSessie: b.rij!.id });
  meldMcpLijst(u.id);
}

// ---------------------------------------------------------------- schaduw (stap 0)
const gelogd = new Map<string, number>();
export function schaduwVerschil(userId: string, punt: string, oud: boolean, nieuw: boolean, reden: string): void {
  if (oud === nieuw) return;
  void (async () => {
    if (!(await schaduwAan(userId))) return;
    const k = `${userId}\u0000${punt}\u0000${reden}`, nu = Date.now();
    if ((gelogd.get(k) ?? 0) > nu) return;
    gelogd.set(k, nu + 10 * 60_000);
    console.warn(`[tech-ruimtes] SCHADUW verschil ${punt}: oud=${oud} nieuw=${nieuw} reden=${reden}`);
    await audit(userId, 'owner.tech.schaduw.verschil', { punt, oud, nieuw, reden }, 'denied');
  })().catch(() => undefined);
}
export const _schaduwLeeg = () => gelogd.clear();
/** Strenge regel op OUDE gegevens: telt een activering alleen als haar ankersessie nog leeft (S7/S4). */
export async function strengOpOudeRij(sessieId: string | null): Promise<{ ok: boolean; reden: string }> {
  if (!sessieId) return { ok: false, reden: 'zonder-sessie' };
  return (await siteSessie(sessieId)).leeft ? { ok: true, reden: 'ok' } : { ok: false, reden: 'site-sessie-weg' };
}
