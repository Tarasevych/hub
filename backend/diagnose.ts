// Diagnose «для всіх чи лише для мене» (zie shared/diagnose.ts). Servercontroles voor iedere aangemelde gebruiker, verslagen versturen,
// en lezen van verslagen voor wie in een ACTIEF technisch profiel 'diagnose.lezen' heeft.
// De servercontroles geven alleen: id, stand, duur, korte code. Geen paden, versienummers van software, e-mail of inhoud.
import { readdir, readFile, statfs } from 'node:fs/promises';
import path from 'node:path';
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { CONTROLES, GRENS, oordeel, type ControleId, type Stand, type Uitslag } from '../shared/diagnose';
import { heeftTechMogelijkheid, isEigenaar, TAB_RE } from './tech-profiel';
import { schaduwStand } from './beleid';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };

const sys = () => getPool('systeem');
const metTijd = async (id: ControleId, f: () => Promise<{ stand: Stand; code?: string }>): Promise<Uitslag> => {
  const t0 = Date.now();
  try { const r = await Promise.race([f(), new Promise<{ stand: Stand; code: string }>((res) => setTimeout(() => res({ stand: 'fout', code: 'TIJD_OM' }), 3000))]); return { id, ...r, ms: Date.now() - t0 }; }
  catch { return { id, stand: 'fout', code: 'FOUT', ms: Date.now() - t0 }; }
};

/** Naam van de hoofdbundel die de server NU uitlevert (assets/index-XXXX.js uit dist/index.html), of '' als onbekend. */
export async function huidigeBundel(): Promise<string> {
  try {
    const html = await readFile(path.join(process.env.DIST_DIR || path.resolve('dist'), 'index.html'), 'utf8');
    return /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)?.[1] ?? '';
  } catch { return ''; }
}

const migratieMap = () => process.env.MIGRATIONS_DIR || path.resolve('migrations');

export async function serverControles(): Promise<Uitslag[]> {
  return Promise.all([
    metTijd('database', async () => { await sys().query('SELECT 1'); return { stand: 'ok' }; }),
    metTijd('schema', async () => {
      let bestanden: string[];
      try { bestanden = (await readdir(migratieMap())).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).map((f) => f.replace(/\.sql$/, '')); } catch { return { stand: 'onbekend', code: 'GEEN_MAP' }; }
      let gedaan: Set<string>;
      try { gedaan = new Set((await sys().query('SELECT version FROM app.schema_migrations')).rows.map((r) => String(r.version))); } catch { return { stand: 'onbekend', code: 'GEEN_TOEGANG' }; }
      const open = bestanden.filter((b) => !gedaan.has(b)).length;
      return open ? { stand: 'fout', code: `OPEN_${open}` } : { stand: 'ok' };
    }),
    metTijd('mcp-deur', async () => {
      const url = process.env.MCP_DEUR_URL;
      if (!url) return { stand: 'onbekend', code: 'NIET_INGESTELD' };
      const r = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(2500) });
      return r.ok ? { stand: 'ok' } : { stand: 'fout', code: `HTTP_${r.status}` };
    }),
    metTijd('mail-onderhoud', async () => {
      const r = (await sys().query(`SELECT data FROM app.records WHERE tbl = 'cron_status_mail_maintenance_v1' ORDER BY COALESCE((data->>'updatedAt')::numeric, (data->>'lastRunAt')::numeric, 0) DESC LIMIT 1`)).rows[0]?.data;
      if (!r) return { stand: 'onbekend', code: 'NOG_NIET_GEDRAAID' };
      const uren = (Date.now() - Number(r.lastRunAt || 0)) / 3_600_000;
      if (!r.ok) return { stand: 'fout', code: 'LAATSTE_RUN_MISLUKT' };
      return uren > GRENS.mailOnderhoudUren ? { stand: 'let-op', code: 'TE_LANG_GELEDEN' } : { stand: 'ok' };
    }),
    metTijd('schijf', async () => {
      const s = await statfs(process.env.UPLOADS_DIR || process.env.DIST_DIR || process.cwd());
      const vrij = (Number(s.bavail) / Math.max(1, Number(s.blocks))) * 100;
      return vrij < GRENS.schijfFoutProcent ? { stand: 'fout', code: 'BIJNA_VOL' } : vrij < GRENS.schijfLetOpProcent ? { stand: 'let-op', code: 'WEINIG_VRIJ' } : { stand: 'ok' };
    }),
    metTijd('servertijd', async () => {
      const db = new Date((await sys().query('SELECT now() AS nu')).rows[0].nu).getTime();
      return Math.abs(db - Date.now()) > GRENS.klokLetOpMs ? { stand: 'let-op', code: 'DB_KLOK_WIJKT_AF' } : { stand: 'ok' };
    }),
  ]);
}

// 30 s cache: de knop mag de server niet belasten (ook niet als veel mensen tegelijk drukken bij een storing).
let cache: { tot: number; uitslagen: Promise<Uitslag[]> } | null = null;
export function serverControlesGecached(nu = Date.now()): Promise<Uitslag[]> {
  if (!cache || cache.tot < nu) cache = { tot: nu + 30_000, uitslagen: serverControles() };
  return cache.uitslagen;
}
export const cacheLegen = () => { cache = null; };

/** Wat de browser instuurt: alleen bekende ids, standen en getallen; de rest valt weg. */
export function schoonUitslagen(raw: unknown): Uitslag[] {
  if (!Array.isArray(raw)) return [];
  const uit: Uitslag[] = [];
  for (const r of raw.slice(0, 20)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string' || !(o.id in CONTROLES)) continue;
    if (!['ok', 'let-op', 'fout', 'onbekend'].includes(String(o.stand))) continue;
    if (uit.some((u) => u.id === o.id)) continue;
    const ms = Number(o.ms);
    const code = typeof o.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(o.code) ? o.code : undefined;
    uit.push({ id: o.id as ControleId, stand: o.stand as Stand, ...(Number.isFinite(ms) && ms >= 0 ? { ms: Math.min(Math.round(ms), 600_000) } : {}), ...(code ? { code } : {}) });
  }
  return uit;
}
const schoonBrowser = (s: unknown) => String(s ?? '').replace(/[^\w .,;:()/+-]/g, '').slice(0, 120);

export function diagnoseRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  const gate = (run: (ctx: Ctx, auth: SessionOk, b: Record<string, unknown>) => Promise<ReturnType<typeof json>>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, 401);
    if (auth.user.status !== 'approved' && !isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    return run(ctx, auth, ctx.body && typeof ctx.body === 'object' ? ctx.body as Record<string, unknown> : {});
  }) as RouterMiddleware;

  return {
    // Servercontroles + de bundel en tijd voor de browsercontroles «versie» en «klok». Een geslaagde aanroep = sessie in orde.
    'POST /api/diagnose/server': [gate(async () => json({ uitslagen: await serverControlesGecached(), bundel: await huidigeBundel(), nu: Date.now() }))],
    'POST /api/diagnose/melden': [gate(async (_ctx, auth, b) => {
      const browser = schoonUitslagen(b.uitslagen).filter((u) => CONTROLES[u.id].bereik === 'browser');
      const server = await serverControlesGecached();
      const alle = [...server, ...browser];
      const o = oordeel(alle).oordeel;
      const beschrijving = String(b.beschrijving ?? '').trim().slice(0, 500);
      const dienst = /^[a-z]{2,12}$/.test(auth.service) ? auth.service : 'onbekend';
      await sys().query(`DELETE FROM app.diagnose_meldingen WHERE aangemaakt_op < now() - interval '90 days'`);
      const r = (await sys().query(`INSERT INTO app.diagnose_meldingen (user_id, dienst, oordeel, uitslagen, beschrijving, browser) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, aangemaakt_op`,
        [auth.user.id, dienst, o, JSON.stringify(alle), beschrijving, schoonBrowser(b.browser)])).rows[0];
      await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: 'owner.diagnose.gemeld', type: 'beveiliging', result: 'success', details: { id: r.id, oordeel: o, dienst } }).catch(() => undefined);
      return json({ id: r.id, oordeel: o, uitslagen: alle });
    })],
    // Alleen in een actief technisch profiel met 'diagnose.lezen' (Підтримка, Розробник, Тестувальник, Адміністратор, Власник).
    'POST /api/diagnose/meldingen': [gate(async (_ctx, auth, b) => {
      const tab = String(b.tabContext || '');
      if (!TAB_RE.test(tab) || !(await heeftTechMogelijkheid(auth.user.id, tab, 'diagnose.lezen'))) return error('TECH_DIAGNOSE_VEREIST', 403);
      const rows = (await sys().query(`SELECT m.id, m.dienst, m.oordeel, m.uitslagen, m.beschrijving, m.browser, m.aangemaakt_op, m.gelezen_op,
          COALESCE(u.data->>'email', '') AS email FROM app.diagnose_meldingen m LEFT JOIN app.records u ON u.tbl = 'users' AND u.id = m.user_id
          ORDER BY m.aangemaakt_op DESC LIMIT 100`)).rows;
      await auditToevoegen({ ownerId: auth.user.id, actorId: auth.user.id, action: 'owner.diagnose.gelezen', type: 'beveiliging', result: 'success', details: { aantal: rows.length } }).catch(() => undefined);
      return json({ meldingen: rows.map((r) => ({ id: r.id, dienst: r.dienst, oordeel: r.oordeel, uitslagen: r.uitslagen, beschrijving: r.beschrijving, browser: r.browser, email: r.email, op: new Date(r.aangemaakt_op).getTime(), gelezen: !!r.gelezen_op })) });
    })],
    // Etap 5: ізоляція даних (RLS) per groep — ALLEEN LEZEN. Schakelen kan alleen root met db-rollen-instellen.sh (de site heeft
    // daar bewust geen schrijfrecht voor: rechten.sql ontneemt de systeemrol INSERT/UPDATE op app.rls_groepen).
    'POST /api/beheer/rls/groepen': [gate(async (_ctx, auth, b) => {
      const tab = String(b.tabContext || '');
      if (!TAB_RE.test(tab) || !(await heeftTechMogelijkheid(auth.user.id, tab, 'diensten.beheren'))) return error('TECH_BEHEER_VEREIST', 403);
      const globaal = String((await sys().query("SELECT waarde FROM app.rls_instellingen WHERE sleutel = 'afdwingen'")).rows[0]?.waarde || 'uit');
      const groepen = (await sys().query(`SELECT g.groep, g.volgorde, g.tabellen, g.afdwingen, g.toelichting, g.bijgewerkt,
          COALESCE((SELECT sum(a.aantal) FROM app.rls_audit a WHERE a.tbl = ANY (g.tabellen)), 0)::bigint AS overtredingen,
          (SELECT max(a.laatst) FROM app.rls_audit a WHERE a.tbl = ANY (g.tabellen)) AS laatst,
          COALESCE((SELECT jsonb_agg(x ORDER BY x.aantal DESC) FROM (SELECT a.route, a.tbl, a.actie, a.aantal FROM app.rls_audit a WHERE a.tbl = ANY (g.tabellen) ORDER BY a.aantal DESC LIMIT 5) x), '[]'::jsonb) AS routes
        FROM app.rls_groepen g ORDER BY g.volgorde`)).rows;
      const auditSinds = (await sys().query('SELECT min(eerst) AS sinds FROM app.rls_audit')).rows[0]?.sinds;
      return json({
        globaal, auditSinds: auditSinds ? new Date(auditSinds).getTime() : null,
        script: '/srv/mijn-ruimte/current/deploy/db-rollen-instellen.sh',
        groepen: groepen.map((g) => ({ groep: g.groep, volgorde: g.volgorde, tabellen: g.tabellen, afdwingen: g.afdwingen, toelichting: g.toelichting, bijgewerkt: new Date(g.bijgewerkt).getTime(),
          overtredingen: Number(g.overtredingen), laatst: g.laatst ? new Date(g.laatst).getTime() : null, routes: g.routes, gereed: globaal === 'aan' || Number(g.overtredingen) === 0 })),
      });
    })],
    // Etap 6: beleidsdienst OPA in schaduw — ALLEEN LEZEN: is OPA bereikbaar, en per actie: gelijk / verschil / doel-weigert.
    'POST /api/beheer/beleid/stand': [gate(async (_ctx, auth, b) => {
      const tab = String(b.tabContext || '');
      if (!TAB_RE.test(tab) || !(await heeftTechMogelijkheid(auth.user.id, tab, 'diensten.beheren'))) return error('TECH_BEHEER_VEREIST', 403);
      return json(await schaduwStand());
    })],
    'POST /api/diagnose/gelezen': [gate(async (_ctx, auth, b) => {
      const tab = String(b.tabContext || '');
      if (!TAB_RE.test(tab) || !(await heeftTechMogelijkheid(auth.user.id, tab, 'diagnose.lezen'))) return error('TECH_DIAGNOSE_VEREIST', 403);
      const id = String(b.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return error('ID_ONGELDIG', 400);
      await sys().query('UPDATE app.diagnose_meldingen SET gelezen_op = now(), gelezen_door = $2 WHERE id = $1 AND gelezen_op IS NULL', [id, auth.user.id]);
      return json({ ok: true });
    })],
  };
}
