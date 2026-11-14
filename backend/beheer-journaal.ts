// Beheerlogboek: één plek om gebeurtenissen te SCHRIJVEN (typed, zonder geheimen) en te ZOEKEN (filters, facetten, export, ketencontrole).
// De opslag blijft app.audit (migratie 0006, append-only hashketen per account); dit bestand voegt geen tabel toe en wijzigt geen hash.
//
// Waarom het scherm «leeg» leek (onderzoek 17.10.2026):
//  1. Elke paginalading van het beheerpaneel schreef zelf een regel (owner.admin.bootstrap) en elke lijstaanroep nog een (…audit.viewed);
//     het scherm toonde slechts de nieuwste 300 → die venster zat vol ruis en de echte acties (rollen, grants, beleid) vielen eruit.
//  2. De regels hadden bijna allemaal type «beveiliging», dus filteren op type had geen zin; wie/wat/voor wie stond verspreid in
//     details onder wisselende namen (agent, klant, onderwerp, email …) en het scherm toonde alleen e-mail + ruwe JSON.
//  3. Bootstrap leverde geen actor, apparaat, dienst of hash mee; de ketencontrole keek alleen naar de oude log (records-tabel).
//  Aanpak: ruis wordt gedempt (max. 1× per 10 min) en standaard verborgen; categorie/doel/wijziging worden uit de regel AFGELEID
//  (shared/beheer-journaal.ts), dus ook oude regels worden leesbaar; het scherm haalt zijn eigen pagina's met filters op.
import { auditControle, auditToevoegen, oudeAudit, type OudeAudit } from '../server/platform/audit';
import { getPool } from '../server/platform/pg';
import { knipTekst } from '../server/platform/json-veilig';
import {
  ACTIE_LABELS, ALLE_CATEGORIEEN, RUIS_PATROON, actieLabel, agentVan, categorieSql, categorieVan, csvCel, doelVan, isRuis, redenVan,
  resultaatKlasse, resultaatSql, wijzigingTekst, wijzigingVan, type CategorieId, type Doel, type JournaalFilter, type ResultaatKlasse, type Wijziging,
} from '../shared/beheer-journaal';
import { TECHNISCHE_ACTIE } from '../shared/meldingen-soorten';

const GEHEIM_SLEUTEL = /(token|secret|cookie|proof|nonce|pkce|authorization|password|wachtwoord|private|apikey|api_key|bearer)/i;
const MAX_TEKST = 400;
const MAX_JSON = 8000;

/** Verwijder geheimen en kap af. Alles wat «geheim» heet, wordt nooit bewaard, ook niet verkort. */
export function schoonDetails(v: unknown, diepte = 0): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') return v.length > MAX_TEKST ? `${knipTekst(v, MAX_TEKST)}…` : v; // knipTekst: nooit een halve emoji (SEC-002 privacy-logboek-02)
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (diepte > 4) return '…';
  if (Array.isArray(v)) return v.slice(0, 40).map((x) => schoonDetails(x, diepte + 1));
  if (typeof v === 'object') {
    const uit: Record<string, unknown> = {};
    for (const [k, w] of Object.entries(v as Record<string, unknown>).slice(0, 60)) { if (!GEHEIM_SLEUTEL.test(k)) uit[k] = schoonDetails(w, diepte + 1); }
    return uit;
  }
  return knipTekst(String(v), MAX_TEKST);
}

export type JournaalSchrijf = {
  /** stabiele code, zie shared/beheer-journaal.ts (ACTIE_LABELS) */ actie: string;
  actor: string | null; /** account waarop het effect zit; standaard de actor */ eigenaar?: string | null;
  resultaat?: string; doel?: Doel; wijziging?: Wijziging; reden?: string; agent?: string;
  details?: Record<string, unknown>; service?: string;
};

/**
 * Schrijf één gebeurtenis in het beheerlogboek. Gooit NOOIT (een mislukte logregel breekt de actie niet), maar verdwijnt ook niet stil:
 * bij een fout staat ze in het servicelogboek en krijgt de aanroeper `null`. Voor acties die zonder logregel niet mogen doorgaan: gebruik
 * auditToevoegen() rechtstreeks en laat de fout doorvallen.
 */
export async function journaalSchrijf(g: JournaalSchrijf): Promise<{ id: string; seq: number; hash: string } | null> {
  const details: Record<string, unknown> = { ...(schoonDetails(g.details || {}) as Record<string, unknown>) };
  if (g.doel) details.doel = schoonDetails(g.doel);
  if (g.wijziging) details.wijziging = schoonDetails(g.wijziging);
  if (g.reden) details.reden = knipTekst(String(g.reden), 300);
  if (g.agent) details.agent = knipTekst(String(g.agent), 40);
  let tekst = JSON.stringify(details);
  if (tekst.length > MAX_JSON) { for (const k of Object.keys(details)) { if (!['doel', 'wijziging', 'reden', 'agent'].includes(k)) delete details[k]; } details.afgekapt = true; tekst = JSON.stringify(details); }
  try {
    return await auditToevoegen({
      ownerId: g.eigenaar === undefined ? g.actor : g.eigenaar, actorId: g.actor, action: String(g.actie).slice(0, 120),
      type: categorieVan(g.actie), result: g.resultaat ?? 'success', details, service: g.service ?? 'admin',
    });
  } catch (e) {
    console.error(`[beheer-journaal] LOGREGEL MISLUKT (${g.actie}):`, (e as Error).message);
    return null;
  }
}

// ------------------------------------------------------------------------------------------------ demping van ruis
const gezien = new Map<string, number>();
export const DEMPING_MAX = 5000;
export const _dempingGrootte = () => gezien.size;
/** true = nu schrijven; daarna `ms` lang niet meer voor dezelfde sleutel (bijv. «owner.admin.bootstrap:<user>»). */
export function eenKeerPer(sleutel: string, ms = 10 * 60 * 1000, nu = Date.now()): boolean {
  const vorige = gezien.get(sleutel) ?? Number.NEGATIVE_INFINITY;
  if (nu - vorige < ms) return false;
  gezien.delete(sleutel);
  gezien.set(sleutel, nu);
  if (gezien.size > 2000) for (const [k, t] of gezien) if (nu - t > ms) gezien.delete(k);
  // SEC-002 (slot m, NET-4): harde bovengrens. Sleutels die nog vers zijn (< ms) ruimt de regel hierboven niet op; bij een stroom unieke
  // sleutels groeide de kaart zonder einde. De oudste eerst weg (een Map houdt de volgorde van invoegen; set() van een bestaande sleutel
  // verplaatst haar niet, daarom eerst delete).
  if (gezien.size > DEMPING_MAX) for (const k of gezien.keys()) { if (gezien.size <= DEMPING_MAX) break; gezien.delete(k); }
  return true;
}
export const _resetDemping = () => gezien.clear();

// ------------------------------------------------------------------------------------------------ zoeken
export type JournaalRij = {
  id: string; bron: 'nieuw' | 'oud'; ownerId: string | null; actorId: string | null; action: string; type: string; result: string; details: Record<string, unknown>;
  device: string | null; service: string | null; ipHash: string | null; seq: number; hash: string; prevHash: string; createdAt: number;
  categorie: CategorieId; resultaatKlasse: ResultaatKlasse; ruis: boolean; doel: Doel | null; wijziging: Wijziging | null; reden: string; agent: string;
};
export type ZoekOpties = {
  gebruikerIds?: string[]; /** extra: q als agent-/gebruikerszoekterm → ids van accounts */ eigenaarId?: string; /** alleen regels van dit account (owner_id), bv. het contour-journaal van de eigenaar */
  /** SEC-002 (privacy-logboek-05): wie kijkt. Gezet = privéregels van ANDERE accounts worden gemaskeerd en hun details doen niet mee in de zoektekst. */
  kijker?: Kijker;
};

// ------------------------------------------------------------------------------------------------ privésfeer van een ander account
// SEC-002 (privacy-logboek-05). Het beheerlogboek toonde elke rol met audit.read (ook support_viewer en security_admin) de details
// van PRIVÉ-acties van alle gebruikers: welk bestand hun AI op hun eigen pc las, welk commando zij uitvoerde, welke pagina zij opende.
// Voor meldingen zijn «persoonlijk» en «technisch» al gescheiden (shared/meldingen-soorten.ts); hier geldt nu hetzelfde:
//   - een regel uit de privésfeer van een ANDER account houdt actie, uitkomst, tijd, account, apparaat en een korte lijst
//     niet-inhoudelijke velden (welk hulpmiddel, welke AI-verbinding, weigercode); pad, commando, adres en al het overige vervallen;
//   - de eigen regels, alles uit de technische sfeer, beheeracties en aanmeldingen/sessies (nodig voor beveiligingsonderzoek, en
//     zonder inhoud) blijven volledig;
//   - de eigenaar (super_admin) ziet alles zoals voorheen.
export type Kijker = { id: string; rol: string };
/** Alleen de eigenaar (super_admin) ziet de details van privéacties van andere accounts. */
export const zietPriveDetails = (rol: string): boolean => rol === 'super_admin';
/** Categorieën (shared/beheer-journaal.ts) waarin een privéregel INHOUD van de gebruiker kan dragen. `toegang`, `sessie` en `beheer` niet. */
const PRIVE_CATEGORIEEN: ReadonlySet<string> = new Set(['ai', 'mail', 'integraties', 'privacy', 'apparaten', 'overig']);
const lijf = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});
/** Technische sfeer — zelfde regel als het SQL-voorfilter in server/platform/audit.ts (auditLijst, f.sfeer). */
const isTechnischeRegel = (action: string, details: Record<string, unknown>): boolean => {
  const profiel = lijf(details._ctx).profiel;
  return TECHNISCHE_ACTIE.test(action) || (profiel !== undefined && profiel !== null) || details.ruimte === 'technisch' || details.lade === 'technisch'
    || (typeof details.v2 === 'string' && /_beheer$/.test(details.v2));
};
export function isPriveVanAnder(r: { ownerId?: string | null; action: string; details?: unknown }, kijkerId: string): boolean {
  if (!r.ownerId || r.ownerId === kijkerId) return false;
  return !isTechnischeRegel(r.action, lijf(r.details)) && PRIVE_CATEGORIEEN.has(categorieVan(r.action));
}
/** Dezelfde vraag in SQL, voor het zoekfilter. `k` en `re` zijn plaatshouders ($n) voor het account van de kijker en TECHNISCHE_ACTIE.source. */
const priveVanAnderSql = (k: string, re: string) => `(owner_id IS NOT NULL AND owner_id <> ${k}
  AND NOT (action ~ ${re} OR ctx_profiel IS NOT NULL OR COALESCE(details->>'ruimte', '') = 'technisch' OR COALESCE(details->>'lade', '') = 'technisch' OR (jsonb_typeof(details->'v2') = 'string' AND details->>'v2' ~ '_beheer$'))
  AND ${categorieSql('action')} IN (${[...PRIVE_CATEGORIEEN].map((c) => `'${c}'`).join(', ')}))`;
/** Velden die van een privéregel van een ander overblijven: soort, verbinding, code — nooit pad, commando, adres, onderwerp of tekst. */
const PRIVE_VELDEN = ['tool', 'soort', 'ruimte', 'lade', 'v2', 'client', 'clientName', 'agent', 'klant', 'grantId', 'actorType', 'fout', 'reden', 'reason', 'code', 'methode', 'platform', 'status', 'duur', 'cap', 'aan', 'afgekapt'] as const;
/** Korte, niet-inhoudelijke waarde: geen schuine streep of backslash (dus geen pad of adres), hoogstens 80 tekens. */
const PRIVE_WAARDE = /^[\p{L}\p{N} _.:()@+-]{1,80}$/u;
export function maskeerPriveDetails(details: unknown): Record<string, unknown> {
  const d = lijf(details); const uit: Record<string, unknown> = { _priveVerborgen: true };
  for (const k of PRIVE_VELDEN) {
    const v = d[k];
    if (typeof v === 'boolean' || typeof v === 'number' || (typeof v === 'string' && PRIVE_WAARDE.test(v))) uit[k] = v;
  }
  if (d._ctx && typeof d._ctx === 'object') uit._ctx = d._ctx;
  return uit;
}
/** Eén rij zoals DEZE kijker haar mag zien (zie boven). Afgeleide velden (doel, wijziging, reden, agent) volgen de gemaskeerde details. */
export function maskeerVoorKijker(r: JournaalRij, kijker: Kijker | undefined): JournaalRij {
  if (!kijker || zietPriveDetails(kijker.rol) || !isPriveVanAnder(r, kijker.id)) return r;
  const details = maskeerPriveDetails(r.details);
  return { ...r, details, doel: doelVan(details, r.action), wijziging: null, reden: redenVan(details), agent: agentVan(details) };
}
/** Voor lijsten in een andere vorm (auditVoorWeergave: userId i.p.v. ownerId): geeft de details zoals deze kijker ze mag zien. */
export function maskeerDetailsVoorKijker(r: { userId?: unknown; ownerId?: unknown; action?: unknown; details?: unknown }, kijker: Kijker): unknown {
  const ownerId = typeof r.ownerId === 'string' ? r.ownerId : typeof r.userId === 'string' ? r.userId : null;
  if (zietPriveDetails(kijker.rol) || !isPriveVanAnder({ ownerId, action: String(r.action || ''), details: r.details }, kijker.id)) return r.details;
  return maskeerPriveDetails(r.details);
}
/** Alles wat «geheim» heet eruit (zelfde sleutels als schoonDetails), zonder iets af te kappen — voor de export. */
export function zonderGeheimeSleutels(v: unknown, diepte = 0): unknown {
  if (Array.isArray(v)) return diepte > 12 ? [] : v.map((x) => zonderGeheimeSleutels(x, diepte + 1));
  if (v && typeof v === 'object') return diepte > 12 ? {} : Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !GEHEIM_SLEUTEL.test(k)).map(([k, w]) => [k, zonderGeheimeSleutels(w, diepte + 1)]));
  return v;
}

const LIKE = (s: string) => `%${s.replace(/[%_\\]/g, '\\$&')}%`;
const nummer = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const lijstTekst = (v: unknown, max: number, n = 30): string[] => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').slice(0, max)).filter(Boolean).slice(0, n);

/** Labels (uk/nl) die de zoektekst bevatten → actiecodes. Zo vindt «секрет» ook owner.api.vault.revealed. */
export function actiesVoorTekst(q: string): string[] {
  const t = q.trim().toLowerCase();
  if (t.length < 2) return [];
  return Object.entries(ACTIE_LABELS).filter(([code, [uk, nl]]) => code.toLowerCase().includes(t) || uk.toLowerCase().includes(t) || nl.toLowerCase().includes(t)).map(([code]) => code).slice(0, 80);
}

export function bouwWaar(f: JournaalFilter, opties: ZoekOpties = {}, metCursor = true): { waar: string; p: unknown[] } {
  const waar: string[] = []; const p: unknown[] = [];
  const voeg = (sql: string, v: unknown) => { p.push(v); waar.push(sql.replace(/\?/g, `$${p.length}`)); };
  const q = String(f.q || '').trim().slice(0, 120);
  if (q) {
    const ors: string[] = []; p.push(LIKE(q)); const like = `$${p.length}`;
    // SEC-002 (privacy-logboek-05): de details van een privéregel van een ander account doen voor deze kijker niet mee in de zoektekst —
    // anders verraadt het aantal treffers alsnog wat er in de verborgen velden staat.
    let inDetails = `details::text ILIKE ${like}`;
    if (opties.kijker && !zietPriveDetails(opties.kijker.rol)) { p.push(String(opties.kijker.id).slice(0, 200)); const k = `$${p.length}`; p.push(TECHNISCHE_ACTIE.source); inDetails = `(${inDetails} AND NOT ${priveVanAnderSql(k, `$${p.length}`)})`; }
    ors.push(`action ILIKE ${like}`, `result ILIKE ${like}`, inDetails, `COALESCE(actor_id,'') ILIKE ${like}`, `COALESCE(owner_id,'') ILIKE ${like}`);
    const codes = actiesVoorTekst(q);
    if (codes.length) { p.push(codes); ors.push(`action = ANY($${p.length}::text[])`); }
    if (opties.gebruikerIds?.length) { p.push(opties.gebruikerIds.slice(0, 200)); ors.push(`actor_id = ANY($${p.length}::text[])`, `owner_id = ANY($${p.length}::text[])`); }
    waar.push(`(${ors.join(' OR ')})`);
  }
  if (opties.eigenaarId) voeg('owner_id = ?', String(opties.eigenaarId).slice(0, 80));
  const cats = lijstTekst(f.categorieen, 20).filter((c) => ALLE_CATEGORIEEN.some((x) => x.id === c));
  if (cats.length) voeg(`${categorieSql('action')} = ANY(?::text[])`, cats);
  const res = lijstTekst(f.resultaten, 12).filter((r) => ['ok', 'geweigerd', 'fout', 'info'].includes(r));
  if (res.length) voeg(`${resultaatSql('result')} = ANY(?::text[])`, res);
  if (f.actorId) voeg('actor_id = ?', String(f.actorId).slice(0, 80));
  if (f.doelId) {
    const id = String(f.doelId).slice(0, 80);
    p.push(id); const a = `$${p.length}`; p.push(JSON.stringify({ doel: { id } })); const b = `$${p.length}`; p.push(JSON.stringify({ target: { id } })); const c = `$${p.length}`;
    waar.push(`(owner_id = ${a} OR details @> ${b}::jsonb OR details @> ${c}::jsonb OR details->>'agent' = ${a} OR details->>'account' = ${a} OR details->>'userId' = ${a})`);
  }
  if (f.actie) { const a = String(f.actie).slice(0, 120); if (a.endsWith('*')) voeg('action LIKE ?', `${a.slice(0, -1).replace(/[%_\\]/g, '\\$&')}%`); else voeg('action = ?', a); }
  if (f.dienst) voeg('service = ?', String(f.dienst).slice(0, 40));
  const van = nummer(f.van), tot = nummer(f.tot);
  if (van) voeg('created_at >= to_timestamp(?::double precision / 1000)', van);
  if (tot) voeg('created_at < to_timestamp(?::double precision / 1000)', tot);
  if (f.verbergRuis) { p.push(RUIS_PATROON); waar.push(`action !~ $${p.length}`); }
  if (metCursor && f.cursor && /^\d{1,19}$/.test(f.cursor)) voeg(f.volgorde === 'oud' ? 'id > ?::bigint' : 'id < ?::bigint', f.cursor);
  return { waar: waar.length ? `WHERE ${waar.join(' AND ')}` : '', p };
}

const rijVan = (r: Record<string, unknown>, bron: 'nieuw' | 'oud' = 'nieuw'): JournaalRij => {
  const details = (r.details && typeof r.details === 'object' ? r.details : {}) as Record<string, unknown>;
  const action = String(r.action || '');
  const result = String(r.result || '');
  return {
    id: String(r.id), bron, ownerId: (r.owner_id as string) ?? null, actorId: (r.actor_id as string) ?? null, action, type: String(r.type || ''), result, details,
    device: (r.device as string) ?? null, service: (r.service as string) ?? null, ipHash: r.ip_hash ? String(r.ip_hash).slice(0, 10) : null,
    seq: Number(r.seq || 0), hash: String(r.hash || ''), prevHash: String(r.prev_hash || ''), createdAt: Number(r.ms || 0),
    categorie: categorieVan(action), resultaatKlasse: resultaatKlasse(result), ruis: isRuis(action), doel: doelVan(details, action), wijziging: wijzigingVan(details),
    reden: redenVan(details), agent: agentVan(details),
  };
};

export async function journaalZoeken(f: JournaalFilter, opties: ZoekOpties = {}): Promise<{ items: JournaalRij[]; nextCursor?: string }> {
  const limiet = Math.max(1, Math.min(200, Math.floor(Number(f.limiet) || 50)));
  const { waar, p } = bouwWaar(f, opties);
  p.push(limiet + 1);
  const rows = (await getPool('systeem').query(
    `SELECT id, owner_id, actor_id, action, type, result, details, ip_hash, device, service, seq, prev_hash, hash, (extract(epoch FROM created_at) * 1000)::bigint AS ms
       FROM app.audit ${waar} ORDER BY id ${f.volgorde === 'oud' ? 'ASC' : 'DESC'} LIMIT $${p.length}`, p)).rows;
  const items = rows.slice(0, limiet).map((r) => maskeerVoorKijker(rijVan(r), opties.kijker));
  return rows.length > limiet ? { items, nextCursor: items[items.length - 1].id } : { items };
}

/** Oude log (vóór fase 3, records-tabel): alleen lezen. Cursor = offset. Filters die daar niet bestonden (categorie via actie wel) werken in het geheugen. */
export async function journaalOud(f: JournaalFilter, opties: ZoekOpties = {}): Promise<{ items: JournaalRij[]; nextCursor?: string }> {
  const limiet = Math.max(1, Math.min(200, Math.floor(Number(f.limiet) || 50)));
  const alle: OudeAudit[] = await oudeAudit(null, 5000);
  const q = String(f.q || '').trim().toLowerCase();
  const cats = lijstTekst(f.categorieen, 20); const res = lijstTekst(f.resultaten, 12);
  const codes = q ? actiesVoorTekst(q) : [];
  const ids = new Set(opties.gebruikerIds || []);
  // SEC-002 (privacy-logboek-05): zelfde regel als in bouwWaar — verborgen details tellen niet mee in de zoektekst.
  const verborgen = (o: OudeAudit) => !!opties.kijker && !zietPriveDetails(opties.kijker.rol) && isPriveVanAnder({ ownerId: o.userId, action: o.action, details: o.details }, opties.kijker.id);
  let lijst = alle.filter((o) => {
    if (f.van && o.createdAt < f.van) return false;
    if (f.tot && o.createdAt >= f.tot) return false;
    if (f.actorId && o.userId !== f.actorId) return false;
    if (f.doelId && o.userId !== f.doelId && !JSON.stringify(o.details).includes(f.doelId)) return false;
    if (cats.length && !cats.includes(categorieVan(o.action))) return false;
    if (res.length && !res.includes(resultaatKlasse(o.result))) return false;
    if (f.verbergRuis && isRuis(o.action)) return false;
    if (f.actie && !(f.actie.endsWith('*') ? o.action.startsWith(f.actie.slice(0, -1)) : o.action === f.actie)) return false;
    if (q && !(o.action.toLowerCase().includes(q) || o.result.toLowerCase().includes(q) || (!verborgen(o) && JSON.stringify(o.details).toLowerCase().includes(q)) || codes.includes(o.action) || ids.has(o.userId))) return false;
    return true;
  });
  if (f.volgorde === 'oud') lijst = [...lijst].reverse();
  const start = Math.max(0, Number(f.cursor) || 0);
  const stuk = lijst.slice(start, start + limiet);
  const items = stuk.map((o) => rijVan({ id: `oud:${o.id}`, owner_id: o.userId, actor_id: o.userId, action: o.action, type: 'beveiliging', result: o.result, details: o.details, seq: 0, hash: o.eventHash, prev_hash: o.previousHash, ms: o.createdAt }, 'oud')).map((r) => maskeerVoorKijker(r, opties.kijker));
  return start + limiet < lijst.length ? { items, nextCursor: String(start + limiet) } : { items };
}

// ------------------------------------------------------------------------------------------------ facetten en statistiek
export type JournaalStatistiek = {
  totaal: number; perCategorie: Array<{ id: string; n: number }>; perResultaat: Array<{ id: string; n: number }>;
  actoren: Array<{ id: string; n: number }>; acties: Array<{ id: string; n: number }>; perDag: Array<{ dag: string; n: number; geweigerd: number }>;
  /** per dienst (kolom service: admin/mcp/hub/mail/…) — zonder het dienstfilter zelf, zodat de keuzelijst alle diensten blijft tonen */ perDienst: Array<{ id: string; n: number }>;
  eerste: number; laatste: number;
};
export async function journaalStatistiek(f: JournaalFilter, opties: ZoekOpties = {}): Promise<JournaalStatistiek> {
  const { waar, p } = bouwWaar({ ...f, cursor: undefined }, opties, false);
  const zonderDienst = bouwWaar({ ...f, cursor: undefined, dienst: undefined }, opties, false);
  const pool = getPool('systeem');
  const [tot, cat, res, act, ac2, dag, dienst] = await Promise.all([
    pool.query(`SELECT count(*)::bigint AS n, (extract(epoch FROM min(created_at)) * 1000)::bigint AS eerste, (extract(epoch FROM max(created_at)) * 1000)::bigint AS laatste FROM app.audit ${waar}`, p),
    pool.query(`SELECT ${categorieSql('action')} AS id, count(*)::bigint AS n FROM app.audit ${waar} GROUP BY 1 ORDER BY 2 DESC`, p),
    pool.query(`SELECT ${resultaatSql('result')} AS id, count(*)::bigint AS n FROM app.audit ${waar} GROUP BY 1 ORDER BY 2 DESC`, p),
    pool.query(`SELECT actor_id AS id, count(*)::bigint AS n FROM app.audit ${waar ? `${waar} AND` : 'WHERE'} actor_id IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, p),
    pool.query(`SELECT action AS id, count(*)::bigint AS n FROM app.audit ${waar} GROUP BY 1 ORDER BY 2 DESC LIMIT 40`, p),
    pool.query(`SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'Europe/Brussels'), 'YYYY-MM-DD') AS dag, count(*)::bigint AS n,
                       count(*) FILTER (WHERE ${resultaatSql('result')} IN ('geweigerd','fout'))::bigint AS geweigerd
                  FROM app.audit ${waar} GROUP BY 1 ORDER BY 1 DESC LIMIT 31`, p),
    pool.query(`SELECT service AS id, count(*)::bigint AS n FROM app.audit ${zonderDienst.waar ? `${zonderDienst.waar} AND` : 'WHERE'} service IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20`, zonderDienst.p),
  ]);
  const num = (r: Array<Record<string, unknown>>) => r.map((x) => ({ id: String(x.id), n: Number(x.n) }));
  return {
    totaal: Number(tot.rows[0]?.n || 0), eerste: Number(tot.rows[0]?.eerste || 0), laatste: Number(tot.rows[0]?.laatste || 0),
    perCategorie: num(cat.rows), perResultaat: num(res.rows), actoren: num(act.rows), acties: num(ac2.rows), perDienst: num(dienst.rows),
    perDag: dag.rows.map((x) => ({ dag: String(x.dag), n: Number(x.n), geweigerd: Number(x.geweigerd) })).reverse(),
  };
}

// ------------------------------------------------------------------------------------------------ export
export const EXPORT_MAX = 5000;
export type Persoon = { id: string; email: string; naam: string; foto?: string };
export async function journaalExport(f: JournaalFilter, opties: ZoekOpties, personen: (ids: string[]) => Promise<Map<string, Persoon>>, formaat: 'csv' | 'json'): Promise<{ inhoud: string; aantal: number; afgekapt: boolean; bestandsnaam: string }> {
  const rijen: JournaalRij[] = [];
  let cursor: string | undefined; let afgekapt = false;
  while (rijen.length < EXPORT_MAX) {
    const stuk = f.bron === 'oud' ? await journaalOud({ ...f, cursor, limiet: 200 }, opties) : await journaalZoeken({ ...f, cursor, limiet: 200 }, opties);
    rijen.push(...stuk.items);
    if (!stuk.nextCursor) break;
    cursor = stuk.nextCursor;
    if (rijen.length >= EXPORT_MAX) { afgekapt = true; break; }
  }
  const ids = [...new Set(rijen.flatMap((r) => [r.actorId, r.ownerId, r.doel?.id]).filter(Boolean) as string[])].slice(0, 1000);
  const mensen = await personen(ids).catch(() => new Map<string, Persoon>());
  const naam = (id: string | null | undefined) => (id ? (mensen.get(id)?.email || id) : '');
  const stempel = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  if (formaat === 'json') {
    const uit = rijen.map((r) => ({ tijd: new Date(r.createdAt).toISOString(), categorie: r.categorie, actie: r.action, resultaat: r.result, actor: naam(r.actorId), account: naam(r.ownerId), doel: r.doel, wijziging: r.wijziging, reden: r.reden, dienst: r.service, apparaat: r.device, seq: r.seq, hash: r.hash, details: zonderGeheimeSleutels(r.details) })); // SEC-002: zelfde geheimfilter als het scherm (vroeger gingen details hier rauw mee)
    return { inhoud: JSON.stringify({ gemaakt: new Date().toISOString(), aantal: uit.length, afgekapt, items: uit }, null, 2), aantal: uit.length, afgekapt, bestandsnaam: `beheerlogboek-${stempel}.json` };
  }
  const kop = ['tijd', 'categorie', 'actie_code', 'actie', 'resultaat', 'actor', 'account', 'doel', 'wijziging', 'reden', 'dienst', 'apparaat', 'seq', 'hash'];
  const regels = [kop.join(',')];
  for (const r of rijen) {
    regels.push([
      new Date(r.createdAt).toISOString(), r.categorie, r.action, actieLabel(r.action, 'uk'), r.result, naam(r.actorId), naam(r.ownerId),
      r.doel ? `${r.doel.soort}${r.doel.naam || r.doel.id ? `: ${r.doel.naam || r.doel.id}` : ''}` : '', wijzigingTekst(r.wijziging), r.reden, r.service ?? '', r.device ?? '', r.seq, r.hash,
    ].map(csvCel).join(','));
  }
  return { inhoud: `﻿${regels.join('\r\n')}\r\n`, aantal: rijen.length, afgekapt, bestandsnaam: `beheerlogboek-${stempel}.csv` };
}

// ------------------------------------------------------------------------------------------------ volledige ketencontrole
export type KetenUitslag = { ketens: number; gecontroleerd: number; afgekapt: boolean; totaal: number; hashFout: number; schakelFout: number; gaten: number; geldig: boolean; ongeldig: Array<{ eigenaar: string; hashFout: number; schakelFout: number; gaten: number }>; duurMs: number };
export const KETEN_MAX = 500;
/** Controleert ALLE ketens (niet alleen het geladen scherm) met app.audit_controleer; begrensd tot KETEN_MAX ketens per aanroep. */
export async function ketenControleAlles(): Promise<KetenUitslag> {
  const t0 = Date.now();
  const sleutels = (await getPool('systeem').query("SELECT owner_key FROM app.audit_kop ORDER BY owner_key LIMIT $1", [KETEN_MAX + 1])).rows.map((r) => String(r.owner_key));
  const afgekapt = sleutels.length > KETEN_MAX;
  const lijst = sleutels.slice(0, KETEN_MAX);
  const uit: KetenUitslag = { ketens: lijst.length, gecontroleerd: 0, afgekapt, totaal: 0, hashFout: 0, schakelFout: 0, gaten: 0, geldig: true, ongeldig: [], duurMs: 0 };
  let i = 0;
  const werker = async () => {
    while (i < lijst.length) {
      const sleutel = lijst[i++];
      const r = await auditControle(sleutel === '' ? null : sleutel).catch(() => null);
      if (!r) { uit.geldig = false; uit.ongeldig.push({ eigenaar: sleutel || '(systeem)', hashFout: 0, schakelFout: 0, gaten: -1 }); continue; }
      uit.gecontroleerd++; uit.totaal += r.totaal; uit.hashFout += r.hashFout; uit.schakelFout += r.schakelFout; uit.gaten += r.onverklaardeGaten;
      if (!r.geldig) { uit.geldig = false; if (uit.ongeldig.length < 20) uit.ongeldig.push({ eigenaar: sleutel || '(systeem)', hashFout: r.hashFout, schakelFout: r.schakelFout, gaten: r.onverklaardeGaten }); }
    }
  };
  await Promise.all(Array.from({ length: 4 }, werker));
  uit.duurMs = Date.now() - t0;
  return uit;
}
