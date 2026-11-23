// WERKBLAD («Робочий стіл») — de indeling op de server, per LADE (zone F, 22.10.2026; migratie 0112 app.werkblad_indeling).
//
// WAT HIER STAAT
//   • de lade (userId + ruimte) van een verzoek: dezelfde live berekening als elke dienstpoort (backend/ruimte-scheiding.ts →
//     gegevensRuimteVeilig: rol, status, profiel en lopende activering uit de database; het tabblad kan haar alleen VERKLEINEN).
//     De ruimte komt dus nooit uit het verzoek en nooit uit de client — een persoonlijk tabblad krijgt altijd het persoonlijke werkblad;
//   • elke query draait onder alsGebruiker() (RLS 0112: user_id = app.huidige_gebruiker()) ÉN draagt zelf `user_id = $1 AND ruimte = $2`;
//   • de server vertrouwt de browser niet: wat binnenkomt gaat door normaliseerWerkblad (shared/werkblad-indeling.ts) met de context van
//     DEZE lade — technische widgets kunnen nooit in het persoonlijke werkblad worden bewaard, «binnenkort»-widgets nooit;
//   • versie: de client stuurt de versie mee die hij laadde; is de rij op de server intussen nieuwer (ander tabblad/apparaat), dan
//     wint de server en krijgt de client die versie terug (409 WERKBLAD_VEROUDERD + de actuele rij) in plaats van stil te overschrijven;
//   • de technische samenvatting (POST …/tech) voor de drie technische widgets: alleen met een actief technisch profiel in dit tabblad
//     (of de eigenaar), gelezen uit bestaande bronnen (admin-diagnostiek.overzicht, uitrol-runs.runsLijst, release-info) — geen nieuwe
//     metingen, geen paden van de server, geen gegevens van andere mensen.
import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { error, json } from '../server/platform';
import { getPool } from '../server/platform/pg';
import { auditLijst } from '../server/platform/audit';
import { alsGebruiker } from './ai-toestemmingen';
import { agentOnline } from './connectors-gateway';
import { eenklikAppLezen, isKoppelingKluisGesloten, koppelingenVanLade } from './github-koppeling-opslag';
import { gegevensRuimteVeilig } from './ruimte-scheiding';
import { sqlLadeWaar, type Lade } from '../shared/ruimte-scheiding';
import { TAB_RE, heeftTechMogelijkheid, isEigenaar } from './tech-profiel';
import { releaseInfo } from './uitgave-info';
import { EIGEN_ACHTERGROND_MAX, normaliseerWerkblad, type TechSamenvatting, type WerkbladContext, type WerkbladIndeling, type WerkbladRuimte } from '../shared/werkblad-indeling';

export type WerkbladRij = { indeling: WerkbladIndeling; achtergrondEigen: string; herkomst: string; versie: number; bijgewerktOp: number };
export type Herkomst = 'bureau' | 'blokken' | 'standaard' | 'eigen';
const HERKOMSTEN: readonly Herkomst[] = ['bureau', 'blokken', 'standaard', 'eigen'];
/** Grens op de ruwe invoer vóór het ontleden (24 widgets met instellingen zijn enkele kB; de eigen achtergrond gaat apart). */
const MAX_BYTES = 48_000;

/** De lade van dit verzoek (zelfde regel als backend/zoek-geschiedenis.ts geschiedenisLade). Elke fout → prive (minste rechten). */
export async function werkbladLade(userId: string, body: unknown): Promise<Lade> {
  const tab = body && typeof body === 'object' ? String((body as Record<string, unknown>).tabContext || '') : '';
  try { return { userId, ruimte: await gegevensRuimteVeilig(userId, { tabContext: tab }) }; } catch { return { userId, ruimte: 'prive' }; }
}

const ctxVan = (lade: Lade, eigenaar: boolean): WerkbladContext => ({ ruimte: lade.ruimte as WerkbladRuimte, eigenaar });
const rij = (r: Record<string, unknown>, ctx: WerkbladContext): WerkbladRij => ({
  indeling: normaliseerWerkblad(r.indeling, ctx), achtergrondEigen: String(r.achtergrond_eigen || ''), herkomst: String(r.herkomst || 'standaard'),
  versie: Number(r.versie || 1), bijgewerktOp: Number(r.bijgewerkt || 0),
});
const KOLOMMEN = `indeling, achtergrond_eigen, herkomst, versie, (extract(epoch FROM bijgewerkt_op) * 1000)::bigint AS bijgewerkt`;

export async function werkbladLezen(lade: Lade, ctx: WerkbladContext): Promise<WerkbladRij | null> {
  return alsGebruiker(lade.userId, async (q) => {
    const r = (await q(`SELECT ${KOLOMMEN} FROM app.werkblad_indeling WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte])).rows[0];
    return r ? rij(r, ctx) : null;
  });
}

/** Eigen achtergrond: alleen een data-URL van een afbeelding, begrensd; alles anders wordt leeg (geen externe adressen, geen SVG). */
export function achtergrondSchonen(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return '';
  if (s.length > EIGEN_ACHTERGROND_MAX) return '';
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s) ? s : '';
}

export type BewaarUitkomst = { ok: true; rij: WerkbladRij } | { ok: false; code: 'WERKBLAD_VEROUDERD'; rij: WerkbladRij };

/**
 * Upsert op (lade). `versie` is de versie die de client laadde (0 = weet het niet / eerste keer): is de rij op de server nieuwer,
 * dan bewaren we NIET en geven we de actuele rij terug. De indeling gaat altijd door de normalisatie van DEZE lade.
 */
export async function werkbladBewaren(lade: Lade, ctx: WerkbladContext, invoer: { indeling: unknown; achtergrondEigen?: unknown; herkomst?: unknown; versie?: unknown }): Promise<BewaarUitkomst> {
  const indeling = normaliseerWerkblad(invoer.indeling, ctx);
  const herkomst: Herkomst = (HERKOMSTEN as readonly string[]).includes(String(invoer.herkomst)) ? invoer.herkomst as Herkomst : 'eigen';
  const versieClient = Math.max(0, Math.trunc(Number(invoer.versie) || 0));
  const eigen = indeling.achtergrond === 'eigen' ? achtergrondSchonen(invoer.achtergrondEigen) : '';
  return alsGebruiker(lade.userId, async (q) => {
    const huidig = (await q(`SELECT ${KOLOMMEN} FROM app.werkblad_indeling WHERE user_id = $1 AND ruimte = $2 FOR UPDATE`, [lade.userId, lade.ruimte])).rows[0];
    if (huidig && versieClient > 0 && Number(huidig.versie) > versieClient) return { ok: false as const, code: 'WERKBLAD_VEROUDERD' as const, rij: rij(huidig, ctx) };
    // Een eigen achtergrond die de client niet opnieuw meestuurt (alleen de indeling wijzigde) blijft staan.
    const achtergrondEigen = indeling.achtergrond === 'eigen' ? (eigen || String(huidig?.achtergrond_eigen || '')) : '';
    if (indeling.achtergrond === 'eigen' && !achtergrondEigen) indeling.achtergrond = 'nacht';
    const r = (await q(
      `INSERT INTO app.werkblad_indeling (user_id, ruimte, indeling, achtergrond_eigen, herkomst, versie)
       VALUES ($1, $2, $3::jsonb, $4, $5, 1)
       ON CONFLICT (user_id, ruimte) DO UPDATE SET indeling = EXCLUDED.indeling, achtergrond_eigen = EXCLUDED.achtergrond_eigen,
         herkomst = CASE WHEN app.werkblad_indeling.herkomst = 'eigen' THEN 'eigen' ELSE EXCLUDED.herkomst END,
         versie = app.werkblad_indeling.versie + 1, bijgewerkt_op = now()
       WHERE app.werkblad_indeling.user_id = $1 AND app.werkblad_indeling.ruimte = $2
       RETURNING ${KOLOMMEN}`,
      [lade.userId, lade.ruimte, JSON.stringify(indeling), achtergrondEigen, herkomst],
    )).rows[0];
    return { ok: true as const, rij: rij(r, ctx) };
  });
}

export async function werkbladWissen(lade: Lade): Promise<boolean> {
  return alsGebruiker(lade.userId, async (q) => ((await q(`DELETE FROM app.werkblad_indeling WHERE user_id = $1 AND ruimte = $2`, [lade.userId, lade.ruimte])).rowCount || 0) > 0);
}

// ---------------------------------------------------------------- technische samenvatting (drie widgets van de technische lade)
export async function techSamenvatting(): Promise<TechSamenvatting> {
  const t0 = Date.now();
  let db = false;
  try { await getPool('systeem').query('SELECT 1'); db = true; } catch { db = false; }
  const dbMs = Date.now() - t0;
  const totaal = totalmem(), vrij = freemem();
  const r = releaseInfo();
  let uitrol: TechSamenvatting['uitrol'] = [];
  try {
    const { runsLijst } = await import('./uitrol-runs');
    const l = await runsLijst({ perPagina: 5 });
    uitrol = l.runs.map((x) => ({ id: x.id, versie: x.versie, staat: x.staat, stap: x.stap, pct: x.pct, gestart: x.gestart, geeindigd: x.geeindigd, uk: x.uk, nl: x.nl }));
  } catch { uitrol = []; }
  let diagnostiek: TechSamenvatting['diagnostiek'] = null;
  try {
    const { overzicht } = await import('./beheer-diagnostiek');
    const { CONTROLES, codeUitleg } = await import('../shared/beheer-diagnostiek');
    const o = await overzicht();
    const toestanden = Object.values(o.toestanden).filter((t): t is typeof t & { laatste: NonNullable<typeof t.laatste> } => Boolean(t.laatste));
    const tel = (s: string) => toestanden.filter((t) => t.laatste.stand === s).length;
    diagnostiek = {
      ok: tel('ok'), letOp: tel('let-op'), fout: tel('fout'),
      slecht: toestanden.filter((t) => t.laatste.stand === 'fout' || t.laatste.stand === 'let-op').sort((a, b) => (a.laatste.stand === 'fout' ? -1 : 1) - (b.laatste.stand === 'fout' ? -1 : 1)).slice(0, 8)
        .map((t) => {
          const code = String(t.laatste.code || ''), def = CONTROLES.find((c) => c.id === t.laatste.id), uitleg = codeUitleg(code);
          return { id: t.laatste.id, stand: t.laatste.stand, code, op: t.laatste.op, ...(def ? { naam: def.naam } : {}), ...(uitleg?.reden ? { reden: uitleg.reden } : {}) };
        }),
      laatsteOp: Math.max(0, ...toestanden.map((t) => t.laatste.op)),
    };
  } catch { diagnostiek = null; }
  return {
    nu: Date.now(),
    server: { node: process.version, uptimeS: Math.round(process.uptime()), load1: Math.round((loadavg()[0] || 0) * 100) / 100, kernen: Math.max(1, cpus().length), geheugenPct: totaal ? Math.round(((totaal - vrij) / totaal) * 100) : 0, geheugenTotaalMb: Math.round(totaal / 1048576), db, dbMs },
    release: { versie: r.versie, commit: r.commit ? r.commit.slice(0, 12) : null, commitStatus: r.commitStatus, samenvatting: r.samenvatting ? r.samenvatting.slice(0, 400) : null },
    uitrol, diagnostiek,
  };
}

// ---------------------------------------------------------------- routes
type User = { id: string; status: string; role?: string; email?: string };
type AuthSuccess = { service: string; user: User };
type AuthFailure = { errorCode: string };
type Authorize = (event: Record<string, unknown>, body: unknown) => Promise<AuthSuccess | AuthFailure>;
type Context = { event: Record<string, unknown>; body: unknown; params: Record<string, string> };
const bodyOf = (b: unknown) => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});

/** Zelfde vorm als createHubBureauRoutes: alleen de dienst hub, alleen een goedgekeurd account. */
export const createWerkbladRoutes = (authorize: Authorize) => {
  const met = (fn: (lade: Lade, ctx: WerkbladContext, body: Record<string, unknown>, user: User) => Promise<ReturnType<typeof json>>) => [async (c: Context) => {
    const auth = await authorize(c.event, c.body);
    if ('errorCode' in auth || auth.service !== 'hub' || auth.user.status !== 'approved') return error('OWNER_HUB_WERKBLAD_REQUIRED', 403);
    const lade = await werkbladLade(auth.user.id, c.body);
    const ctx = ctxVan(lade, isEigenaar(auth.user));
    try { return await fn(lade, ctx, bodyOf(c.body), auth.user); }
    catch (err) { console.error('[werkblad]', String((err as Error)?.message || err).slice(0, 200)); return error('WERKBLAD_MISLUKT', 500); }
  }];
  return {
    'POST /api/owner/hub/werkblad/laden': met(async (lade, ctx) => {
      const r = await werkbladLezen(lade, ctx);
      return json({ source: 'server_werkblad_0112', ruimte: lade.ruimte, bestaat: Boolean(r), ...(r ?? { indeling: null, achtergrondEigen: '', herkomst: '', versie: 0, bijgewerktOp: 0 }) });
    }),
    'POST /api/owner/hub/werkblad/bewaren': met(async (lade, ctx, b) => {
      if (JSON.stringify(b.indeling ?? null).length > MAX_BYTES) return error('WERKBLAD_TE_GROOT', 413);
      if (typeof b.achtergrondEigen === 'string' && b.achtergrondEigen.length > EIGEN_ACHTERGROND_MAX) return error('WERKBLAD_ACHTERGROND_TE_GROOT', 413);
      const u = await werkbladBewaren(lade, ctx, { indeling: b.indeling, achtergrondEigen: b.achtergrondEigen, herkomst: b.herkomst, versie: b.versie });
      if (!u.ok) return json({ ok: false, code: u.code, ruimte: lade.ruimte, bestaat: true, ...u.rij }, 409);
      return json({ ok: true, source: 'server_werkblad_0112', ruimte: lade.ruimte, bestaat: true, ...u.rij });
    }),
    'POST /api/owner/hub/werkblad/terugzetten': met(async (lade) => json({ ok: true, ruimte: lade.ruimte, gewist: await werkbladWissen(lade) })),
    /** Technische samenvatting: alleen in de technische lade, met een actief technisch profiel in DIT tabblad (of de eigenaar). */
    'POST /api/owner/hub/werkblad/tech': met(async (lade, _ctx, b, user) => {
      if (lade.ruimte !== 'technisch') return error('WERKBLAD_TECH_RUIMTE_VEREIST', 403);
      if (!isEigenaar(user)) {
        const tab = String(b.tabContext || '');
        if (!TAB_RE.test(tab) || !(await heeftTechMogelijkheid(user.id, tab, 'diagnose.lezen'))) return error('TECH_DIAGNOSE_VEREIST', 403);
      }
      return json({ ruimte: lade.ruimte, ...(await techSamenvatting()) });
    }),
    /** Veilige GitHub-samenvatting voor het werkblad en bureau in de hub-sessie, strikt binnen deze lade zonder geheimen. */
    'POST /api/owner/hub/werkblad/github': met(async (lade) => json(await werkbladGithubSamenvatting(lade))),
    /** Veilige samenvatting van actieve AI-toestemmingen, apparaten en koppelingen in deze lade zonder tokens of hashes. */
    'POST /api/owner/hub/werkblad/ai-toegang': met(async (lade) => json(await werkbladAiToegangSamenvatting(lade))),
  };
};

export type WerkbladGithubOverzicht = {
  ruimte: string;
  gekoppeld: boolean;
  kluisGesloten: boolean;
  eenklikIngesteld: boolean;
  accounts: Array<{ pad: 'oauth' | 'app'; login: string; repoAantal: number; bijgewerktOp: number }>;
  opslagplaatsen: string[];
  recenteActies: Array<{ id: string; actie: string; resultaat: string; op: number }>;
};

export async function werkbladGithubSamenvatting(lade: Lade): Promise<WerkbladGithubOverzicht> {
  await alsGebruiker(lade.userId, async (q) => {
    await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
  });
  const kluisGesloten = await isKoppelingKluisGesloten(lade.userId, lade.ruimte);
  if (kluisGesloten) {
    return {
      ruimte: lade.ruimte,
      gekoppeld: false,
      kluisGesloten: true,
      eenklikIngesteld: false,
      accounts: [],
      opslagplaatsen: [],
      recenteActies: [],
    };
  }
  const [wegen, eenklik, audit] = await Promise.all([
    koppelingenVanLade(lade.userId, lade.ruimte).catch(() => []),
    eenklikAppLezen(lade.userId, lade.ruimte).catch(() => null),
    auditLijst({ ownerId: lade.userId, limit: 30 }).catch(() => ({ items: [] })),
  ]);
  const accounts = wegen.map((r) => ({
    pad: r.pad,
    login: String(r.login || '').slice(0, 80),
    repoAantal: Array.isArray(r.repos) ? r.repos.length : 0,
    bijgewerktOp: Number(r.bijgewerktOp || 0),
  }));
  const repoSet = new Set<string>();
  for (const r of wegen) {
    for (const naam of Array.isArray(r.repos) ? r.repos : []) {
      const schoon = String(naam || '').trim().slice(0, 140);
      if (schoon && repoSet.size < 20) repoSet.add(schoon);
    }
  }
  const recenteActies = audit.items
    .filter((a) => a.action.startsWith('owner.github.') && (a.context.ruimte ?? (typeof a.details?.ruimte === 'string' ? a.details.ruimte : 'prive')) === lade.ruimte)
    .slice(0, 6)
    .map((a) => ({ id: a.id, actie: a.action, resultaat: a.result, op: a.createdAt }));
  return {
    ruimte: lade.ruimte,
    gekoppeld: accounts.length > 0,
    kluisGesloten: false,
    eenklikIngesteld: Boolean(eenklik?.appId || eenklik?.clientId),
    accounts,
    opslagplaatsen: [...repoSet],
    recenteActies,
  };
}

export type WerkbladAiToegangOverzicht = {
  ruimte: string;
  samenvatting: {
    verbindingen: number;
    toestemmingen: number;
    apparaten: number;
    apparatenVerbonden: number;
    browsersActief: number;
  };
  verbindingen: Array<{ id: string; naam: string; scope: string; laatstGebruiktOp: number }>;
  toestemmingen: Array<{ id: string; agentId: string; mogelijkheid: string; altijd: boolean; verlooptOp: number }>;
  apparaten: Array<{ id: string; naam: string; platform: string; online: boolean; laatstGezienOp: number }>;
  browser: { totaal: number; actief: number };
};

export async function werkbladAiToegangSamenvatting(lade: Lade): Promise<WerkbladAiToegangOverzicht> {
  const agentWaar = sqlLadeWaar('ruimte', lade, 1);
  const { agentRijen, grantRijen } = await alsGebruiker(lade.userId, async (q) => {
    await q("SELECT set_config('app.ruimte', $1, true)", [lade.ruimte]);
    const aRijen = (await q(
      `SELECT id, name, platform, status, browser_enabled, armed_until, last_seen_at
         FROM app.agents
        WHERE ${agentWaar} AND revoked_at IS NULL
        ORDER BY created_at DESC
        LIMIT 25`,
      [lade.userId],
    )).rows;
    const ids = aRijen.map((r) => String(r.id));
    const gRijen = ids.length
      ? (await q(
          `SELECT id, agent_id, capability, always, expires_at
             FROM app.ai_grants
            WHERE user_id = $1 AND agent_id = ANY($2::uuid[]) AND revoked_at IS NULL AND expires_at > now()
            ORDER BY granted_at DESC
            LIMIT 30`,
          [lade.userId, ids],
        )).rows
      : [];
    return { agentRijen: aRijen, grantRijen: gRijen };
  });

  // Tabellen waar mijnruimte_app geen rechtstreekse SELECT op heeft (omdat hashes van serverzijdig beheerde tokens erin staan):
  // alleen niet-geheime metavelden via systeemrol met strikte geparametriseerde filter op (user_id, ruimte).
  const sysPool = getPool('systeem');
  const [oauthUit, consoleUit, extUit] = await Promise.all([
    sysPool.query(
      `SELECT id, client_name, scope, last_used_at, created_at
         FROM app.mcp_oauth_tokens
        WHERE ${agentWaar} AND revoked_at IS NULL AND refresh_expires_at > now()
        ORDER BY created_at DESC
        LIMIT 20`,
      [lade.userId],
    ).catch(() => ({ rows: [] })),
    sysPool.query(
      `SELECT count(*)::int AS n FROM app.mcp_console_tokens WHERE ${agentWaar} AND revoked_at IS NULL`,
      [lade.userId],
    ).catch(() => ({ rows: [{ n: 0 }] })),
    sysPool.query(
      `SELECT count(*)::int AS n FROM app.externe_mcp_verbinding WHERE ${agentWaar} AND actief = true`,
      [lade.userId],
    ).catch(() => ({ rows: [{ n: 0 }] })),
  ]);

  const oauthRijen = oauthUit.rows;
  const consoleAantal = Number(consoleUit.rows[0]?.n || 0);
  const extAantal = Number(extUit.rows[0]?.n || 0);

  const nu = Date.now();
  const browsers = agentRijen.filter((a) => String(a.platform || '') === 'browser');
  const machines = agentRijen.filter((a) => String(a.platform || '') !== 'browser');
  const browsersActief = browsers.filter((b) => b.browser_enabled === true && b.armed_until && new Date(String(b.armed_until)).getTime() > nu).length;
  const apparaten = machines.map((m) => ({
    id: String(m.id),
    naam: String(m.name || '').slice(0, 80),
    platform: String(m.platform || 'machine').slice(0, 32),
    online: agentOnline(String(m.id)) || String(m.status || '') === 'connected',
    laatstGezienOp: m.last_seen_at ? new Date(String(m.last_seen_at)).getTime() : 0,
  }));
  const verbindingen = oauthRijen.map((o) => ({
    id: String(o.id),
    naam: String(o.client_name || 'MCP').slice(0, 80),
    scope: String(o.scope || '').slice(0, 120),
    laatstGebruiktOp: o.last_used_at ? new Date(String(o.last_used_at)).getTime() : (o.created_at ? new Date(String(o.created_at)).getTime() : 0),
  }));
  const toestemmingen = grantRijen.map((g) => ({
    id: String(g.id),
    agentId: String(g.agent_id),
    mogelijkheid: String(g.capability || '').slice(0, 48),
    altijd: g.always === true,
    verlooptOp: g.expires_at ? new Date(String(g.expires_at)).getTime() : 0,
  }));

  return {
    ruimte: lade.ruimte,
    samenvatting: {
      verbindingen: verbindingen.length + consoleAantal + extAantal,
      toestemmingen: toestemmingen.length,
      apparaten: apparaten.length,
      apparatenVerbonden: apparaten.filter((a) => a.online).length,
      browsersActief,
    },
    verbindingen: verbindingen.slice(0, 6),
    toestemmingen: toestemmingen.slice(0, 6),
    apparaten: apparaten.slice(0, 6),
    browser: { totaal: browsers.length, actief: browsersActief },
  };
}
