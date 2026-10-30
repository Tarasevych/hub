// Routes van het live-overzicht (admin.* → Огляд): aggregaties, gebruikerskaart en de indeling per beheerder.
// De berekening zelf staat in beheer-overzicht-kern.ts (puur, getest); dit bestand haalt de ruwe gegevens op:
//  - app.audit (SQL-aggregaties per uur/dag/actie + de laatste regels),
//  - sessies en gebruikers (zoals de bestaande bootstrap), servercontroles (backend/diagnose.ts), uitrol-runs en wachtende aanvragen.
// Het resultaat wordt 15 s gedeeld tussen beheerders (geen extra belasting bij elk pollingverzoek); gebeurtenislijsten worden pas
// per aanroeper toegevoegd en alleen met de capability audit.read.
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { db } from '../server/platform/db';
import { getPool } from '../server/platform/pg';
import { auditLijst, auditToevoegen } from '../server/platform/audit';
import { serverControlesGecached } from './diagnose';
import { bouwOverzicht, FAIL_RE, gebruikerHistorie, RUIS_BRON, type AuditRegel, type Emmer, type Gebruiker, type Invoer, type RunKort, type Sessie } from './beheer-overzicht-kern';
import { normaliseerIndeling, standaardIndeling } from '../shared/overzicht-widgets';
import { bewaarMomentopname, lijstMomentopnamen } from './beheer-overzicht-momentopnamen';
import { tellerStand } from './toegangsfout-tellers';

type AdminAuth = { user: { id: string; email?: string; name?: string }; capabilities?: string[] };
export type AdminGate = (ctx: { event: Record<string, unknown>; body: unknown }, capability: string) => Promise<AdminAuth | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };

const SESSIE_TABEL = 'owner_service_sessions_v1';
const sys = () => getPool('systeem');
export const CACHE_MS = 15_000;
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

async function probeer<T>(f: () => Promise<T>, terug: T): Promise<T> {
  try { return await f(); } catch (e) { console.error('[admin-overzicht]', (e as Error).message); return terug; }
}

const tel = (n: unknown) => Number(n) || 0;

/** Haalt alle ruwe gegevens op (zonder aanroeper-specifieke delen). */
export async function laadInvoer(nu = Date.now()): Promise<Omit<Invoer, 'magAudit'>> {
  const [gebruikers, sessies, telRij, uren, dagen, acties7, recent, diensten, runs, wachtUitrol, wachtToegang] = await Promise.all([
    probeer(async () => (await db.list<Gebruiker>('users', { limit: 500, nieuwsteEerst: true })).items as Gebruiker[], [] as Gebruiker[]),
    probeer(async () => (await db.list<Sessie & { userId: string }>(SESSIE_TABEL, { limit: 500, nieuwsteEerst: true })).items as unknown as Sessie[], [] as Sessie[]),
    probeer(async () => (await sys().query(
      `SELECT count(*)::int AS totaal,
              count(*) FILTER (WHERE data->>'createdAt' ~ '^[0-9]+$' AND (data->>'createdAt')::numeric >= $1)::int AS nieuw24,
              count(*) FILTER (WHERE data->>'createdAt' ~ '^[0-9]+$' AND (data->>'createdAt')::numeric >= $2)::int AS nieuw7,
              count(*) FILTER (WHERE data->>'status' IN ('pending', 'new'))::int AS wacht
         FROM app.records
        WHERE tbl = 'users' AND COALESCE(data->>'status', '') <> 'deleted' AND COALESCE(data->>'retiredAt', '0') IN ('0', '')`,
      [nu - 86_400_000, nu - 7 * 86_400_000],
    )).rows[0], { totaal: 0, nieuw24: 0, nieuw7: 0, wacht: 0 }),
    probeer(async () => (await sys().query(
      `SELECT floor(extract(epoch FROM created_at) / 3600)::bigint AS b, count(*)::int AS n, count(*) FILTER (WHERE result ~* $2)::int AS f
         FROM app.audit WHERE created_at >= now() - interval '25 hours' AND action ~ '^(owner|account)\\.' AND action !~ $1 GROUP BY 1`,
      [RUIS_BRON, FAIL_RE.source],
    )).rows as Array<{ b: string; n: number; f: number }>, []),
    probeer(async () => (await sys().query(
      `SELECT floor(extract(epoch FROM created_at) / 86400)::bigint AS b, count(*)::int AS n, count(*) FILTER (WHERE result ~* $2)::int AS f
         FROM app.audit WHERE created_at >= now() - interval '15 days' AND action ~ '^(owner|account)\\.' AND action !~ $1 GROUP BY 1`,
      [RUIS_BRON, FAIL_RE.source],
    )).rows as Array<{ b: string; n: number; f: number }>, []),
    probeer(async () => (await sys().query(
      `SELECT action, count(*)::int AS n, count(*) FILTER (WHERE result ~* $2)::int AS f
         FROM app.audit WHERE created_at >= now() - interval '7 days' AND action ~ '^(owner|account)\\.' AND action !~ $1
        GROUP BY action ORDER BY n DESC LIMIT 300`,
      [RUIS_BRON, FAIL_RE.source],
    )).rows as Array<{ action: string; n: number; f: number }>, []),
    probeer(async () => (await auditLijst({ limit: 200 })).items.map((r): AuditRegel => ({
      id: r.id, ownerId: r.ownerId, actorId: r.actorId, action: r.action, result: r.result, createdAt: r.createdAt, service: r.service, device: r.device,
    })), [] as AuditRegel[]),
    probeer(async () => (await serverControlesGecached()).map((u) => ({ id: u.id, stand: u.stand, ms: u.ms })), [] as Invoer['diensten']),
    probeer(async () => (await sys().query(
      `SELECT id, versie, staat, methode, pct, gestart_op, geeindigd_op, wie, voorbereider, wijzigingen FROM app.uitrol_runs ORDER BY gestart_op DESC, id DESC LIMIT 5`,
    )).rows.map((r): RunKort => ({
      id: String(r.id), versie: String(r.versie || ''), staat: String(r.staat), methode: String(r.methode), pct: tel(r.pct),
      gestart: r.gestart_op ? new Date(r.gestart_op).toISOString() : '', geeindigd: r.geeindigd_op ? new Date(r.geeindigd_op).toISOString() : '',
      wie: String(r.wie || r.voorbereider || '').slice(0, 40), samenvatting: String(r.wijzigingen || '').split('\n')[0].slice(0, 140),
    })), [] as RunKort[]),
    probeer(async () => tel((await sys().query(`SELECT count(*)::int AS n FROM app.uitrol_voorstellen WHERE status = 'wacht-op-goedkeuring'`)).rows[0]?.n), 0),
    probeer(async () => (await db.list('access_requests', { filter: { status: 'pending' }, limit: 200 })).items.length, 0),
  ]);
  const emmers = (rows: Array<{ b: string; n: number; f: number }>): Emmer[] => rows.map((r) => ({ b: Number(r.b), n: tel(r.n), f: tel(r.f) }));
  return {
    nu, gebruikers, sessies,
    telling: { totaal: tel(telRij.totaal) || gebruikers.length, nieuw24: tel(telRij.nieuw24), nieuw7: tel(telRij.nieuw7), wachtGoedkeuring: tel(telRij.wacht) },
    uren: emmers(uren), dagen: emmers(dagen), acties7, recent, diensten, runs, wachtUitrol, wachtToegang,
  };
}

let cache: { tot: number; invoer: Promise<Omit<Invoer, 'magAudit'>> } | null = null;
export function invoerGecached(nu = Date.now()) {
  if (!cache || cache.tot < nu) cache = { tot: nu + CACHE_MS, invoer: laadInvoer(nu) };
  return cache.invoer;
}
export const cacheLegen = () => { cache = null; };

export async function overzichtVoor(magAudit: boolean, nu = Date.now()) {
  const inv = await invoerGecached(nu);
  const o = bouwOverzicht({ ...inv, nu, magAudit });
  // momentopname (alleen tellers) opportunistisch: hoogstens één databaseschrijfbeurt per uur per proces; fouten blokkeren het overzicht nooit
  void bewaarMomentopname(o, nu).catch((e) => console.error('[admin-overzicht] momentopname', (e as Error).message));
  return o;
}

/** Cron (elk uur, via opruimCron): neemt de momentopname ook als niemand het overzicht opent. */
export async function momentopnameCron(nu = Date.now()) {
  const inv = await invoerGecached(nu);
  return bewaarMomentopname(bouwOverzicht({ ...inv, nu, magAudit: false }), nu, true);
}

export async function gebruikerKaart(id: string, nu = Date.now()) {
  const inv = await invoerGecached(nu);
  const g = inv.gebruikers.find((u) => u.id === id)
    ?? (await probeer(async () => ((await db.get<Gebruiker>('users', [id]))[0] ?? undefined) as Gebruiker | undefined, undefined));
  const audit = await auditLijst({ ownerId: id, limit: 300 });
  return gebruikerHistorie({
    nu, gebruiker: g ? { ...g, id } : undefined, id, sessies: inv.sessies,
    audit: audit.items.map((r): AuditRegel => ({ id: r.id, ownerId: r.ownerId, actorId: r.actorId, action: r.action, result: r.result, createdAt: r.createdAt, service: r.service, device: r.device })),
  });
}

export async function indelingLezen(userId: string) {
  const r = (await sys().query('SELECT indeling FROM app.admin_overzicht_indeling WHERE user_id = $1', [userId])).rows[0];
  return { indeling: normaliseerIndeling(r?.indeling), aangepast: !!r };
}
export async function indelingOpslaan(userId: string, raw: unknown) {
  const indeling = normaliseerIndeling(raw);
  await sys().query(
    `INSERT INTO app.admin_overzicht_indeling (user_id, indeling) VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET indeling = EXCLUDED.indeling, gewijzigd_op = now()`,
    [userId, JSON.stringify(indeling)],
  );
  return { indeling, aangepast: true };
}
export async function indelingWissen(userId: string) {
  await sys().query('DELETE FROM app.admin_overzicht_indeling WHERE user_id = $1', [userId]);
  return { indeling: standaardIndeling(), aangepast: false };
}

export function adminOverzichtRoutes(gate: AdminGate): Record<string, RouterMiddleware[]> {
  const route = (capability: string, run: (b: Record<string, unknown>, auth: AdminAuth) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await gate(ctx, capability);
    if ('errorCode' in auth) return error(auth.errorCode, 403);
    const b = ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {};
    try { return json(await run(b, auth)); } catch (e) {
      const code = (e as { code?: string }).code;
      if (typeof code === 'string' && /^[A-Z_]{3,40}$/.test(code)) return error(code, 400);
      console.error('[admin-overzicht]', (e as Error).message);
      return error('OVERZICHT_FOUT', 500);
    }
  }) as RouterMiddleware;
  const magAudit = (a: AdminAuth) => Array.isArray(a.capabilities) && a.capabilities.includes('audit.read');
  return {
    'POST /api/owner/admin/overview': [route('admin.read', async (_b, a) => overzichtVoor(magAudit(a)))],
    // Historie van één gebruiker: alleen met audit.read, en het opvragen zelf komt in het logboek (wie keek naar wie).
    'POST /api/owner/admin/overview/user': [route('audit.read', async (b, a) => {
      const id = String(b.userId || '');
      if (!ID_RE.test(id)) { const e = new Error('USER_ONGELDIG') as Error & { code: string }; e.code = 'USER_ONGELDIG'; throw e; }
      const kaart = await gebruikerKaart(id);
      await auditToevoegen({ ownerId: a.user.id, actorId: a.user.id, action: 'owner.admin.user.history.viewed', result: 'success', details: { doel: id.slice(0, 8) } }).catch(() => undefined);
      return kaart;
    })],
    'POST /api/owner/admin/overview/snapshots': [route('admin.read', async () => ({ ...(await lijstMomentopnamen()), toegangLive: tellerStand() }))],
    'POST /api/owner/admin/overview/layout': [route('admin.read', async (_b, a) => indelingLezen(a.user.id))],
    'POST /api/owner/admin/overview/layout/save': [route('admin.read', async (b, a) => indelingOpslaan(a.user.id, b.indeling))],
    'POST /api/owner/admin/overview/layout/reset': [route('admin.read', async (_b, a) => indelingWissen(a.user.id))],
  };
}
