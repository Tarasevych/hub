// Append-only beveiligingslog app.audit (migratie 0006). Hashketen per account in de database
// (app.audit_toevoegen); hier: toevoegen met verzoekgegevens uit de context, lezen (nieuwste eerst, filters,
// cursor), ketencontrole en verwijderen via de beheerfunctie. Alles via de systeemrol: de app-rol mag alleen
// toevoegen, niet lezen.
import { createHmac } from 'node:crypto';
import { getPool } from './pg';
import { huidigeContext, type VerzoekContext } from './context';

export type AuditGebeurtenis = {
  ownerId: string | null;
  actorId?: string | null;
  action: string;
  type?: string;
  result?: string;
  details?: Record<string, unknown>;
  service?: string;
};
export type AuditRij = {
  id: string; ownerId: string | null; actorId: string | null; action: string; type: string; result: string;
  details: Record<string, unknown>; ipHash: string | null; device: string | null; service: string | null;
  seq: number; prevHash: string; hash: string; createdAt: number;
  /** Etap E: «профіль» (technisch profiel), «активація», «від імені» (ondersteuningsverzoek), «простір» (werkruimte). */
  context: AuditContextVelden;
};

// ---- Etap E: context in elke regel ----------------------------------------------------------------------------
// Opgeslagen in details._ctx, dus BINNEN de hashketen (wijzigen breekt de keten, net als de rest van details); migratie 0039 maakt
// er afgeleide kolommen van om op te filteren. Waarom niet als echte nieuwe kolommen in de hash: dan verandert app.audit_hash en
// moet elke bestaande keten opnieuw worden uitgelegd; zo blijft oud en nieuw met dezelfde functie controleerbaar.
export type AuditContextVelden = { profiel?: string; activatie?: string; namens?: string; ruimte?: string };
const CTX_VELD: Record<keyof AuditContextVelden, RegExp> = {
  profiel: /^tech-[a-z0-9]{6,40}$/, activatie: /^[0-9a-f-]{36}$/i, namens: /^[0-9a-f-]{36}$/i, ruimte: /^[A-Za-z0-9_.:-]{1,80}$/,
};
const ctxSchoon = (v: unknown): AuditContextVelden => {
  const uit: AuditContextVelden = {};
  if (!v || typeof v !== 'object') return uit;
  for (const k of Object.keys(CTX_VELD) as Array<keyof AuditContextVelden>) {
    const w = (v as Record<string, unknown>)[k];
    if (typeof w === 'string' && CTX_VELD[k].test(w)) uit[k] = w;
  }
  return uit;
};
type ContextBron = (c: VerzoekContext & { tab: string; actor: string }) => Promise<AuditContextVelden>;
let contextBron: ContextBron | null = null;
/** De backend levert het actieve technisch profiel van (actor, tabblad); platform kent backend/tech-profiel niet. */
export function zetAuditContextBron(f: ContextBron | null): void { contextBron = f; }
async function contextVoor(c: VerzoekContext | undefined, actor: string | null): Promise<AuditContextVelden> {
  if (!c) return {};
  const vast: AuditContextVelden = c.namens ? { namens: c.namens } : {};
  if (!contextBron || !c.tab || !actor || actor !== c.actor) return vast;
  // Één opzoeking per verzoek; een fout in de bron mag een auditregel nooit tegenhouden.
  c.auditCtx ??= contextBron({ ...c, tab: c.tab, actor }).then((x) => ctxSchoon(x) as Record<string, string>, () => ({}));
  return { ...ctxSchoon(await c.auditCtx), ...vast };
}

/**
 * Audit-fix 10: eigen, verplichte pepper voor IP-hashes (AUDIT_IP_PEPPER, ≥ 32 tekens). Geen terugval meer op
 * RECOVERY_CODE_PEPPER (die mag nooit voor iets anders dienen) en zonder pepper geen hash (veilig falen: dan wordt
 * het IP gewoon niet opgeslagen). start.ts weigert te starten zonder geldige pepper.
 */
export const auditIpPepperGeldig = (): boolean => String(process.env.AUDIT_IP_PEPPER || '').length >= 32;
let pepperGemeld = false;
/** IP nooit leesbaar opslaan: HMAC-SHA256 met AUDIT_IP_PEPPER. */
export function ipHash(ip: string | undefined | null): string | null {
  const v = String(ip || '').trim();
  if (!v) return null;
  if (!auditIpPepperGeldig()) {
    if (!pepperGemeld) { pepperGemeld = true; console.error('[audit] AUDIT_IP_PEPPER ontbreekt of is te kort: IP-adressen worden niet gelogd (deploy/geheimen-aanvullen.sh)'); }
    return null;
  }
  return createHmac('sha256', String(process.env.AUDIT_IP_PEPPER)).update(`audit-ip\u0000${v}`).digest('hex').slice(0, 32);
}

/** Grof apparaatlabel uit de user-agent (browser + systeem), zonder versies of unieke kenmerken. */
export function apparaat(ua: string | undefined | null): string | null {
  const v = String(ua || '');
  if (!v) return null;
  const browser = /Edg\//.test(v) ? 'Edge' : /OPR\//.test(v) ? 'Opera' : /Firefox\//.test(v) ? 'Firefox' : /Chrome\//.test(v) ? 'Chrome' : /Safari\//.test(v) ? 'Safari' : /curl|wget|node|python|go-http/i.test(v) ? 'script' : 'overig';
  const os = /Windows/.test(v) ? 'Windows' : /Android/.test(v) ? 'Android' : /iPhone|iPad|iOS/.test(v) ? 'iOS' : /Mac OS X|Macintosh/.test(v) ? 'macOS' : /Linux/.test(v) ? 'Linux' : 'overig';
  return `${browser}/${os}`;
}

const tekst = (v: unknown, max: number) => String(v ?? '').slice(0, max);

/** Voeg een gebeurtenis toe. Faalt de database, dan gooit dit (beveiligingsacties horen niet stil te verdwijnen). */
export async function auditToevoegen(g: AuditGebeurtenis): Promise<{ id: string; seq: number; hash: string }> {
  const c = huidigeContext();
  // «Подивитися як користувач» (0068): de mens achter de aanroep is de beheerder, nooit de gebruiker zelf.
  const actor = c?.impersonatie ? c.impersonatie.door : (g.actorId ?? c?.actor ?? c?.userId ?? g.ownerId ?? null);
  const details: Record<string, unknown> = { ...(g.details || {}) };
  if (c?.impersonatie) { details.actorType = 'impersonatie'; details.namensId = g.ownerId ?? c.userId ?? null; if (c.impersonatie.doorEmail && typeof details.door !== 'string') details.door = c.impersonatie.doorEmail; }
  // Audit 18.10.2026 (K1): een AI die namens de eigenaar werkt, staat zo in ELKE regel (nooit als de eigenaar zelf).
  if (c?.agent) { details.actorType = 'agent'; if (typeof details.agent !== 'string') details.agent = c.agent; }
  const ruimte = typeof details.workspaceId === 'string' ? details.workspaceId : typeof details.ruimte === 'string' ? details.ruimte : undefined;
  const ctx = { ...(ruimte ? ctxSchoon({ ruimte }) : {}), ...(await contextVoor(c, actor)), ...ctxSchoon(details._ctx) };
  if (Object.keys(ctx).length) details._ctx = ctx; else delete details._ctx;
  const r = await getPool('systeem').query(
    'SELECT id, seq, hash FROM app.audit_toevoegen($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)',
    [g.ownerId || null, actor, tekst(g.action, 120), tekst(g.type || 'beveiliging', 40), tekst(g.result ?? '', 40),
      JSON.stringify(details), ipHash(c?.ip), apparaat(c?.ua), tekst(g.service ?? c?.service ?? '', 40) || null],
  );
  const rij = r.rows[0];
  return { id: String(rij.id), seq: Number(rij.seq), hash: String(rij.hash) };
}

export type AuditFilter = {
  ownerId?: string; actorId?: string; type?: string; action?: string; ipHash?: string; device?: string; service?: string;
  /** Etap E: alleen regels uit een technisch profiel / namens iemand / in een werkruimte (exacte waarde, of '*' = «heeft er een»). */
  profiel?: string; namens?: string; ruimte?: string;
  /** exacte acties (één van) */ acties?: string[];
  van?: number; tot?: number; /** cursor: id van de laatst getoonde rij (ouder ophalen) */ voor?: string; limit?: number;
  /** 23.10.2026: acties UITSLUITEN (POSIX-regex; bv. de ruis van backend/site-activiteit.ts). */
  nietActie?: string;
  /** 23.10.2026: SQL-voorfilter op meldingssfeer (shared/meldingen-soorten.ts): `actieRe` = TECHNISCHE_ACTIE.source. Technisch = actie past,
   *  of technische context (ctx_profiel), of details.ruimte/lade 'technisch', of een v2-hulpmiddel «…_beheer»; persoonlijk = het
   *  omgekeerde. De JS-indeling (sfeerVanActiviteit) blijft de beslissing — dit zorgt alleen dat het venster genoeg kandidaten heeft. */
  sfeer?: { technisch: boolean; actieRe: string };
};

/** Nieuwste eerst, met filters en cursor. Geeft ook nextCursor als er meer is. */
export async function auditLijst(f: AuditFilter = {}): Promise<{ items: AuditRij[]; nextCursor?: string }> {
  const waar: string[] = [];
  const p: unknown[] = [];
  const voeg = (sql: string, v: unknown) => { p.push(v); waar.push(sql.replace('?', `$${p.length}`)); };
  if (f.ownerId) voeg('owner_id = ?', f.ownerId);
  if (f.actorId) voeg('actor_id = ?', f.actorId);
  if (f.type) voeg('type = ?', f.type);
  if (f.action) { if (f.action.endsWith('*')) voeg('action LIKE ?', `${f.action.slice(0, -1).replace(/[%_\\]/g, '\\$&')}%`); else voeg('action = ?', f.action); }
  if (f.acties?.length) voeg('action = ANY(?::text[])', f.acties.map((a) => tekst(a, 120)));
  if (f.ipHash) voeg('ip_hash = ?', f.ipHash);
  if (f.device) voeg('device = ?', f.device);
  if (f.service) voeg('service = ?', f.service);
  for (const [veld, kol] of [['profiel', 'ctx_profiel'], ['namens', 'ctx_namens'], ['ruimte', 'ctx_ruimte']] as const) {
    const w = f[veld];
    if (w === '*') waar.push(`${kol} IS NOT NULL`); else if (w && CTX_VELD[veld].test(w)) voeg(`${kol} = ?`, w);
  }
  if (f.van) voeg("created_at >= to_timestamp(?::double precision / 1000)", f.van);
  if (f.tot) voeg("created_at < to_timestamp(?::double precision / 1000)", f.tot);
  if (f.voor && /^\d{1,19}$/.test(f.voor)) voeg('id < ?::bigint', f.voor);
  if (f.nietActie) voeg('action !~ ?', f.nietActie);
  if (f.sfeer?.actieRe) {
    p.push(f.sfeer.actieRe);
    // COALESCE overal: één NULL in een OR maakt het geheel NULL en «NOT NULL» is ook NULL — dan viel elke persoonlijke regel zonder
    // details.ruimte stil weg (driewaardige logica).
    const tech = `(COALESCE(action, '') ~ $${p.length} OR ctx_profiel IS NOT NULL OR COALESCE(details->>'ruimte', '') = 'technisch' OR COALESCE(details->>'lade', '') = 'technisch' OR COALESCE(details->>'v2', '') ~ '_beheer$')`;
    waar.push(f.sfeer.technisch ? tech : `NOT ${tech}`);
  }
  const limit = Math.max(1, Math.min(500, Math.floor(Number(f.limit) || 100)));
  p.push(limit + 1);
  const rows = (await getPool('systeem').query(
    `SELECT id, owner_id, actor_id, action, type, result, details, ip_hash, device, service, seq, prev_hash, hash,
            (extract(epoch FROM created_at) * 1000)::bigint AS ms
       FROM app.audit ${waar.length ? `WHERE ${waar.join(' AND ')}` : ''} ORDER BY id DESC LIMIT $${p.length}`,
    p,
  )).rows;
  const items: AuditRij[] = rows.slice(0, limit).map((r) => ({
    id: String(r.id), ownerId: r.owner_id, actorId: r.actor_id, action: r.action, type: r.type, result: r.result, details: r.details || {},
    ipHash: r.ip_hash, device: r.device, service: r.service, seq: Number(r.seq), prevHash: r.prev_hash, hash: r.hash, createdAt: Number(r.ms),
    context: ctxSchoon((r.details || {})._ctx),
  }));
  return rows.length > limit ? { items, nextCursor: items[items.length - 1].id } : { items };
}

/** Ketencontrole voor één account (null = systeemketen). */
export async function auditControle(ownerId: string | null): Promise<{ totaal: number; hashFout: number; schakelFout: number; onverklaardeGaten: number; geldig: boolean }> {
  const r = (await getPool('systeem').query('SELECT * FROM app.audit_controleer($1)', [ownerId])).rows[0] || {};
  const uit = { totaal: Number(r.totaal || 0), hashFout: Number(r.hash_fout || 0), schakelFout: Number(r.schakel_fout || 0), onverklaardeGaten: Number(r.onverklaarde_gaten || 0) };
  return { ...uit, geldig: uit.hashFout === 0 && uit.schakelFout === 0 && uit.onverklaardeGaten === 0 };
}

/** Verwijderen via app.audit_verwijderen (controleert zelf super_admin/security_admin en logt). */
export async function auditVerwijderen(actorId: string, ownerId: string | null, voor: number, reden: string): Promise<number> {
  const r = await getPool('systeem').query('SELECT app.audit_verwijderen($1, $2, to_timestamp($3::double precision / 1000), $4) AS n', [actorId, ownerId, voor, reden]);
  return Number(r.rows[0]?.n || 0);
}

// ---- Weergave (beveiligingspagina en beheeroverzicht) ----
/** Oude log (records-tabel owner_security_audit_v2, vóór fase 3): alleen lezen, nieuwste eerst. */
export const OUDE_AUDIT_TABEL = 'owner_security_audit_v2';
export type OudeAudit = { id: string; userId: string; action: string; result: string; details: Record<string, unknown>; createdAt: number; previousHash: string; eventHash: string };
export async function oudeAudit(ownerId: string | null, limit = 500): Promise<OudeAudit[]> {
  const n = Math.max(1, Math.min(5000, Math.floor(limit)));
  const rows = ownerId
    ? (await getPool('systeem').query('SELECT id, data FROM app.records WHERE tbl = $1 AND data @> $2::jsonb ORDER BY seq DESC LIMIT $3', [OUDE_AUDIT_TABEL, JSON.stringify({ userId: ownerId }), n])).rows
    : (await getPool('systeem').query('SELECT id, data FROM app.records WHERE tbl = $1 ORDER BY seq DESC LIMIT $2', [OUDE_AUDIT_TABEL, n])).rows;
  return rows.map((r) => ({ ...(r.data as Omit<OudeAudit, 'id'>), id: String(r.id) }));
}
/** Nieuwe rij in de vorm die de frontend al kent (OwnerAudit) + de nieuwe velden. */
export const alsOwnerAudit = (r: AuditRij) => ({
  id: `audit:${r.id}`, userId: r.ownerId || '', actorId: r.actorId || '', action: r.action, result: r.result, details: r.details,
  createdAt: r.createdAt, previousHash: r.prevHash, eventHash: r.hash, type: r.type, device: r.device, ipHash: r.ipHash, service: r.service, seq: r.seq,
  context: r.context,
});
/** Nieuwste eerst: eerst app.audit, aangevuld met de oude log tot `limit`. */
export async function auditVoorWeergave(f: AuditFilter & { limit?: number }): Promise<{ items: Array<ReturnType<typeof alsOwnerAudit> | OudeAudit>; nextCursor?: string; oud: OudeAudit[] }> {
  const limit = Math.max(1, Math.min(500, Math.floor(Number(f.limit) || 100)));
  const nieuw = await auditLijst({ ...f, limit });
  const items: Array<ReturnType<typeof alsOwnerAudit> | OudeAudit> = nieuw.items.map(alsOwnerAudit);
  // Oude log alleen zonder nieuwe-veldfilters (type/ip/apparaat/actor bestonden daar niet) en op de eerste pagina.
  const oudPast = !f.voor && !f.type && !f.ipHash && !f.device && !f.actorId && !f.service && !f.profiel && !f.namens && !f.ruimte;
  let oud: OudeAudit[] = [];
  if (oudPast) {
    oud = await oudeAudit(f.ownerId || null, 5000);
    const passend = oud.filter((o) => (!f.action || (f.action.endsWith('*') ? o.action.startsWith(f.action.slice(0, -1)) : o.action === f.action))
      && (!f.van || o.createdAt >= f.van) && (!f.tot || o.createdAt < f.tot));
    if (items.length < limit) items.push(...passend.slice(0, limit - items.length));
  }
  return { items, nextCursor: nieuw.nextCursor, oud };
}
