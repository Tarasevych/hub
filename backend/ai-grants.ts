// Toestemmingen (grants) voor agents per gebruiker (veilig-agenten-0.4, migratie 0017).
//
// Regels (ook vastgelegd in tests/eenheid/ai-grants-contract.test.ts):
//   1. Geen geldige grant (niet ingetrokken, niet verlopen) voor de mogelijkheid van een opdracht = opdracht geweigerd.
//      Dat wordt gecontroleerd op het moment van aanmaken ÉN vlak vóór het versturen (dispatchCommand), zodat intrekken meteen werkt.
//   2. Browseropdrachten met een URL moeten binnen de domeinen van de grant vallen (en altijd binnen *.tarasevych.com, https).
//   3. Destructieve mogelijkheden (handelen op de pagina, screenshot, diepe diagnose, schrijven/uitvoeren/docker op een pc) vragen
//      per opdracht een verse goedkeuring (requireFreshApproval), tenzij de gebruiker een 'altijd'-grant voor die mogelijkheid aanzette.
//   4. 'altijd' kan alleen met step-up (route), heeft altijd een vervaldatum (standaard 30 dagen, hoogstens 90), geldt alleen voor
//      agents van de gebruiker zelf (samengestelde sleutel in de DB), staat in app.audit en is in de UI met een stopknop te zien.
//   5. Elke wijziging verhoogt de epoch van de gebruiker en duwt {type:'settings',epoch,caps} naar zijn verbonden agents.
//   6. Blokkeren = één transactie (tokens + grants ingetrokken, epoch + 1, blocked_at), daarna de WebSocket-verbindingen sluiten.
// Alle queries lopen via de app-rol (mijnruimte_app, strikte RLS) met app.user_id = de betrokken gebruiker.
import { appRolActief, getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { rateLimit } from '../server/platform/beveiliging';

export const CAPABILITIES = [
  'browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.debug',
  'machine.read', 'machine.write', 'machine.exec', 'machine.docker',
] as const;
export type Capability = typeof CAPABILITIES[number];
export const isCapability = (v: unknown): v is Capability => typeof v === 'string' && (CAPABILITIES as readonly string[]).includes(v);

/** Mogelijkheden die iets veranderen of veel prijsgeven: verse goedkeuring per opdracht, behalve met een geldige 'altijd'-grant. */
export const DESTRUCTIVE: ReadonlySet<Capability> = new Set<Capability>(['browser.interact', 'browser.screenshot', 'browser.debug', 'machine.write', 'machine.exec', 'machine.docker']);

/** Opdrachttype → mogelijkheid. Een type dat hier ontbreekt, kan nooit worden verstuurd. */
export const TYPE_CAPABILITY: Readonly<Record<string, Capability>> = Object.freeze({
  'browser.snapshot': 'browser.read', 'browser.diagnostics': 'browser.read', 'browser.tabs': 'browser.read', 'browser.scroll': 'browser.read',
  'browser.wait': 'browser.read', 'browser.console': 'browser.read', 'browser.network': 'browser.read', 'browser.self_test': 'browser.read',
  'browser.navigate': 'browser.navigate', 'browser.history': 'browser.navigate', 'browser.pages': 'browser.navigate',
  'browser.invoke': 'browser.interact', 'browser.click': 'browser.interact', 'browser.type': 'browser.interact', 'browser.select': 'browser.interact',
  'browser.key': 'browser.interact', 'browser.hover': 'browser.interact', 'browser.fill_form': 'browser.interact',
  'browser.screenshot': 'browser.screenshot', 'browser.deep_diagnostics': 'browser.debug',
  'fs.read': 'machine.read', 'fs.list': 'machine.read', 'fs.stat': 'machine.read', 'fs.search': 'machine.read', 'sys.info': 'machine.read', 'sys.metrics': 'machine.read', 'docker.ps': 'machine.read',
  'fs.write': 'machine.write', 'exec': 'machine.exec', 'docker.manage': 'machine.docker',
  // «Додатки»: bekijken = lezen; uitrollen, terugdraaien, stoppen, route en geheimen = containerbeheer (destructief, verse goedkeuring).
  'apps.list': 'machine.read', 'apps.status': 'machine.read', 'apps.logs': 'machine.read', 'apps.versions': 'machine.read', 'apps.secret.list': 'machine.read',
  'apps.deploy': 'machine.docker', 'apps.rollback': 'machine.docker', 'apps.control': 'machine.docker', 'apps.route': 'machine.docker',
  'apps.secret.set': 'machine.docker', 'apps.secret.delete': 'machine.docker',
});
export const capabilityFor = (type: string): Capability | null => TYPE_CAPABILITY[type] ?? null;

/** Plafondconstanten. Tests falen als een van deze ruimer wordt. */
export const GRANT_LIMITS = Object.freeze({
  maxDays: 90,
  alwaysDefaultDays: 30,
  freshApprovalMinutes: 5,
  commandsPerAgentPerMinute: 60,
  destructivePerUserPerHour: 30,
  maxDomains: 20,
});

export type PresetId = 'spostericach' | 'pomichnyk' | 'razovo';
export const PRESETS: Readonly<Record<PresetId, { uk: string; nl: string; minutes: number; browser: Capability[]; machine: Capability[] }>> = Object.freeze({
  spostericach: { uk: 'Спостерігач', nl: 'Waarnemer', minutes: 30 * 24 * 60, browser: ['browser.read'], machine: ['machine.read'] },
  pomichnyk: { uk: 'Помічник', nl: 'Helper', minutes: 7 * 24 * 60, browser: ['browser.read', 'browser.navigate', 'browser.interact'], machine: ['machine.read', 'machine.write'] },
  razovo: { uk: 'Разово', nl: 'Eenmalig', minutes: 60, browser: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot'], machine: ['machine.read', 'machine.write', 'machine.exec'] },
});

export interface GrantRow {
  id: string; user_id: string; agent_id: string; capability: Capability; scope: { domains: string[] }; always: boolean;
  preset: string | null; granted_by: string | null; granted_at: Date; expires_at: Date; revoked_at: Date | null;
}
export interface Settings { capabilities: Partial<Record<Capability, boolean>>; epoch: number; blocked_at: Date | null; blocked_reason: string | null }

type Q = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

/** Eén transactie als mijnruimte_app met app.user_id = userId (strikte RLS). Zonder aparte app-rol (lokale ontwikkeling): de enige pool. */
export async function alsGebruiker<T>(userId: string, fn: (q: Q) => Promise<T>, opts: { systeem?: boolean } = {}): Promise<T> {
  if (!userId) throw new Error('GEEN_GEBRUIKER');
  // systeem: alleen voor beheerstappen die ook systeemtabellen raken (blokkeren trekt ook MCP-OAuth-tokens in).
  const client = await getPool(appRolActief() && !opts.systeem ? 'app' : 'systeem').connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.service', 'ai-grants', true)", [userId]);
    const out = await fn((sql, params = []) => client.query(sql, params) as Promise<{ rows: any[]; rowCount: number | null }>);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------- push naar verbonden agents (gateway registreert zich)
type Pusher = { push: (userId: string, agentId: string | null, msg: object) => number; close: (userId: string, agentId: string | null, code: number, reason: string) => number };
let pusher: Pusher = { push: () => 0, close: () => 0 };
export function registerAgentPusher(p: Pusher): void { pusher = p; }

// ---------------------------------------------------------------- domeinen
const EIGEN = 'tarasevych.com';
const hostOk = (h: string) => h === EIGEN || h.endsWith(`.${EIGEN}`);
/** Normaliseer een domeinlijst. Alleen eigen domeinen (tarasevych.com en subdomeinen); anders een fout. */
export function normalizeDomains(input: unknown): string[] {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new Error('DOMAINS_INVALID');
  const out = new Set<string>();
  for (const raw of input) {
    const d = String(raw || '').trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    if (!/^[a-z0-9.-]{3,253}$/.test(d) || !hostOk(d)) throw new Error('DOMAIN_NOT_ALLOWED');
    out.add(d);
  }
  if (out.size > GRANT_LIMITS.maxDomains) throw new Error('TOO_MANY_DOMAINS');
  return [...out].sort();
}
/** Valt de URL binnen de domeinen? Lege lijst = alle eigen sites. Altijd https en *.tarasevych.com. */
export function urlInScope(url: string, domains: string[]): boolean {
  let host = '';
  try { const u = new URL(url); if (u.protocol !== 'https:' || u.username || u.password) return false; host = u.hostname.toLowerCase(); } catch { return false; }
  if (!hostOk(host)) return false;
  return !domains.length || domains.some((d) => host === d || host.endsWith(`.${d}`));
}
/** URL's in de parameters van een opdracht (navigate, pages{url}, enz.). */
export function commandUrls(params: unknown): string[] {
  const p = (params && typeof params === 'object' ? params : {}) as Record<string, unknown>;
  return ['url', 'href', 'target'].map((k) => p[k]).filter((v): v is string => typeof v === 'string' && v.length > 0);
}

// ---------------------------------------------------------------- lezen
export async function getSettings(userId: string, q?: Q): Promise<Settings> {
  const run = async (qq: Q) => {
    const { rows } = await qq('SELECT capabilities, epoch, blocked_at, blocked_reason FROM app.user_ai_settings WHERE user_id = $1', [userId]);
    const r = rows[0];
    return r ? { capabilities: r.capabilities || {}, epoch: Number(r.epoch), blocked_at: r.blocked_at, blocked_reason: r.blocked_reason } : { capabilities: {}, epoch: 0, blocked_at: null, blocked_reason: null };
  };
  return q ? run(q) : alsGebruiker(userId, run);
}

export async function listGrants(userId: string, opts: { agentId?: string; includeInactive?: boolean } = {}): Promise<GrantRow[]> {
  return alsGebruiker(userId, async (q) => {
    const { rows } = await q(
      `SELECT * FROM app.ai_grants WHERE user_id = $1 AND ($2::uuid IS NULL OR agent_id = $2)
          AND ($3 OR (revoked_at IS NULL AND expires_at > now())) ORDER BY granted_at DESC LIMIT 500`,
      [userId, opts.agentId ?? null, !!opts.includeInactive]);
    return rows as GrantRow[];
  });
}

/** Wat een agent mag (voor de push naar de agent en de UI): per mogelijkheid de ruimste geldige grant. */
export async function effectiveCaps(userId: string, agentId: string, q?: Q) {
  const run = async (qq: Q) => {
    const settings = await getSettings(userId, qq);
    if (settings.blocked_at) return { epoch: settings.epoch, blocked: true, caps: [] as { capability: Capability; domains: string[]; always: boolean; expiresAt: string }[] };
    const { rows } = await qq(
      `SELECT capability, scope, always, expires_at FROM app.ai_grants
        WHERE user_id = $1 AND agent_id = $2 AND revoked_at IS NULL AND expires_at > now() ORDER BY always DESC, expires_at DESC`, [userId, agentId]);
    const seen = new Map<string, { capability: Capability; domains: string[]; always: boolean; expiresAt: string }>();
    for (const r of rows) {
      if (settings.capabilities[r.capability as Capability] === false) continue;
      const cur = seen.get(r.capability);
      const domains = (r.scope?.domains ?? []) as string[];
      if (!cur) seen.set(r.capability, { capability: r.capability, domains, always: !!r.always, expiresAt: new Date(r.expires_at).toISOString() });
      else if (!domains.length || cur.domains.length) cur.domains = domains.length && cur.domains.length ? [...new Set([...cur.domains, ...domains])].sort() : [];
    }
    return { epoch: settings.epoch, blocked: false, caps: [...seen.values()] };
  };
  return q ? run(q) : alsGebruiker(userId, run);
}

// ---------------------------------------------------------------- controle per opdracht
export type GrantCheck =
  | { ok: true; capability: Capability; grantId: string; needsFreshApproval: boolean; domains: string[] }
  | { ok: false; code: 'UNKNOWN_TYPE' | 'USER_BLOCKED' | 'CAPABILITY_OFF' | 'NO_GRANT' | 'DOMAIN_OUT_OF_SCOPE' | 'RATE_LIMITED' };

/**
 * Mag deze opdracht naar deze agent? `stage` = 'create' (bij aanmaken; telt mee voor de snelheidsgrens) of 'dispatch'
 * (laatste controle vlak voor versturen; telt niet nogmaals).
 */
export async function checkCommand(agent: { id: string; user_id: string }, type: string, params: unknown, stage: 'create' | 'dispatch' = 'create'): Promise<GrantCheck> {
  const capability = capabilityFor(type);
  if (!capability) return { ok: false, code: 'UNKNOWN_TYPE' };
  const res = await alsGebruiker(agent.user_id, async (q): Promise<GrantCheck> => {
    const settings = await getSettings(agent.user_id, q);
    if (settings.blocked_at) return { ok: false, code: 'USER_BLOCKED' };
    if (settings.capabilities[capability] === false) return { ok: false, code: 'CAPABILITY_OFF' };
    const { rows } = await q(
      `SELECT id, scope, always FROM app.ai_grants
        WHERE user_id = $1 AND agent_id = $2 AND capability = $3 AND revoked_at IS NULL AND expires_at > now()
        ORDER BY always DESC, expires_at DESC`, [agent.user_id, agent.id, capability]);
    if (!rows.length) return { ok: false, code: 'NO_GRANT' };
    const urls = commandUrls(params);
    const fits = rows.filter((r) => urls.every((u) => urlInScope(u, (r.scope?.domains ?? []) as string[])));
    if (!fits.length) return { ok: false, code: 'DOMAIN_OUT_OF_SCOPE' };
    const best = fits[0];
    return { ok: true, capability, grantId: best.id, needsFreshApproval: DESTRUCTIVE.has(capability) && !best.always, domains: (best.scope?.domains ?? []) as string[] };
  });
  if (!res.ok || stage === 'dispatch') return res;
  const perAgent = await rateLimit(`agent-cmd:${agent.id}`, GRANT_LIMITS.commandsPerAgentPerMinute, 60);
  if (!perAgent.ok) return { ok: false, code: 'RATE_LIMITED' };
  if (DESTRUCTIVE.has(res.capability)) {
    const perUser = await rateLimit(`agent-destructief:${agent.user_id}`, GRANT_LIMITS.destructivePerUserPerHour, 3600);
    if (!perUser.ok) return { ok: false, code: 'RATE_LIMITED' };
  }
  return res;
}

// ---------------------------------------------------------------- wijzigen
async function bumpEpoch(q: Q, userId: string): Promise<number> {
  const { rows } = await q(
    `INSERT INTO app.user_ai_settings (user_id, epoch, updated_at) VALUES ($1, 1, now())
     ON CONFLICT (user_id) DO UPDATE SET epoch = app.user_ai_settings.epoch + 1, updated_at = now() RETURNING epoch`, [userId]);
  return Number(rows[0].epoch);
}

/** Duw de actuele toestemmingen naar de verbonden agents van de gebruiker (na elke wijziging). */
export async function pushSettings(userId: string, agentIds?: string[]): Promise<void> {
  const ids = agentIds ?? (await alsGebruiker(userId, async (q) => (await q('SELECT id FROM app.agents WHERE user_id = $1 AND revoked_at IS NULL', [userId])).rows.map((r) => r.id as string)));
  for (const id of ids) {
    const eff = await effectiveCaps(userId, id);
    pusher.push(userId, id, { t: 'settings', type: 'settings', epoch: eff.epoch, caps: eff.caps, blocked: eff.blocked });
  }
}

export interface NewGrant { agentId: string; capability: Capability; domains?: unknown; always?: boolean; minutes?: number; preset?: PresetId | 'handmatig' }

function durationMinutes(g: NewGrant): number {
  const def = g.always ? GRANT_LIMITS.alwaysDefaultDays * 24 * 60 : 30 * 24 * 60;
  const m = g.minutes == null ? def : Math.floor(Number(g.minutes));
  if (!Number.isFinite(m) || m < 5 || m > GRANT_LIMITS.maxDays * 24 * 60) throw new Error('DURATION_INVALID');
  return m;
}

/**
 * Grants toevoegen (één transactie, epoch + 1). `always` mag alleen als de route step-up heeft gecontroleerd (`steppedUp`);
 * zonder step-up wordt de aanroep geweigerd (en niet stilletjes zonder 'altijd' opgeslagen).
 */
export async function addGrants(userId: string, actorId: string, grants: NewGrant[], opts: { steppedUp: boolean }): Promise<{ epoch: number; grants: GrantRow[] }> {
  if (!grants.length) throw new Error('NO_GRANTS');
  for (const g of grants) {
    if (!isCapability(g.capability)) throw new Error('CAPABILITY_INVALID');
    if (g.always && !opts.steppedUp) throw new Error('STEP_UP_REQUIRED');
  }
  const out = await alsGebruiker(userId, async (q) => {
    const settings = await getSettings(userId, q);
    if (settings.blocked_at) throw new Error('USER_BLOCKED');
    const saved: GrantRow[] = [];
    for (const g of grants) {
      const { rows: agent } = await q('SELECT id, platform FROM app.agents WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [g.agentId, userId]);
      if (!agent.length) throw new Error('AGENT_NOT_FOUND');
      const isBrowser = agent[0].platform === 'browser';
      if (isBrowser !== g.capability.startsWith('browser.')) throw new Error('CAPABILITY_WRONG_AGENT');
      const domains = isBrowser ? normalizeDomains(g.domains) : [];
      const { rows } = await q(
        `INSERT INTO app.ai_grants (user_id, agent_id, capability, scope, always, preset, granted_by, expires_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, now() + make_interval(mins => $8)) RETURNING *`,
        [userId, g.agentId, g.capability, JSON.stringify({ domains }), !!g.always, g.preset ?? 'handmatig', actorId, durationMinutes(g)]);
      saved.push(rows[0] as GrantRow);
    }
    const epoch = await bumpEpoch(q, userId);
    return { epoch, grants: saved };
  });
  for (const g of out.grants) {
    await auditToevoegen({ ownerId: userId, actorId, action: g.always ? 'ai_grant_always_enabled' : 'ai_grant_added', type: 'ai', result: 'ok',
      details: { grantId: g.id, agentId: g.agent_id, capability: g.capability, always: g.always, expiresAt: new Date(g.expires_at).toISOString(), domains: g.scope.domains, preset: g.preset } }).catch(() => undefined);
  }
  await pushSettings(userId, [...new Set(out.grants.map((g) => g.agent_id))]);
  return out;
}

/** Een preset (Спостерігач / Помічник / Разово) voor één agent; de duur is aanpasbaar. Nooit 'altijd'. */
export async function applyPreset(userId: string, actorId: string, agentId: string, preset: PresetId, opts: { minutes?: number; domains?: unknown; replace?: boolean } = {}) {
  const p = PRESETS[preset];
  if (!p) throw new Error('PRESET_INVALID');
  const platform = await alsGebruiker(userId, async (q) => (await q('SELECT platform FROM app.agents WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [agentId, userId])).rows[0]?.platform as string | undefined);
  if (platform === undefined) throw new Error('AGENT_NOT_FOUND');
  if (opts.replace) await revokeGrants(userId, actorId, { agentId, reason: `preset:${preset}` }, { push: false });
  const caps = platform === 'browser' ? p.browser : p.machine;
  return addGrants(userId, actorId, caps.map((capability) => ({ agentId, capability, domains: opts.domains, minutes: opts.minutes ?? p.minutes, preset })), { steppedUp: false });
}

/** Grants intrekken (één, per agent, per mogelijkheid of alles). Epoch + 1 en push. */
export async function revokeGrants(userId: string, actorId: string, which: { grantId?: string; agentId?: string; capability?: Capability; reason?: string }, opts: { push?: boolean } = {}) {
  const out = await alsGebruiker(userId, async (q) => {
    const { rows } = await q(
      `UPDATE app.ai_grants SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id = $2) AND ($3::uuid IS NULL OR agent_id = $3) AND ($4::text IS NULL OR capability = $4)
        RETURNING id, agent_id, capability, always`, [userId, which.grantId ?? null, which.agentId ?? null, which.capability ?? null]);
    const epoch = await bumpEpoch(q, userId);
    return { epoch, revoked: rows as { id: string; agent_id: string; capability: string; always: boolean }[] };
  });
  if (out.revoked.length) {
    await auditToevoegen({ ownerId: userId, actorId, action: 'ai_grants_revoked', type: 'ai', result: 'ok',
      details: { count: out.revoked.length, always: out.revoked.filter((r) => r.always).length, reason: which.reason ?? '', agentId: which.agentId ?? '' } }).catch(() => undefined);
  }
  if (opts.push !== false) await pushSettings(userId);
  return out;
}

/** Plafond per mogelijkheid zetten (bijv. "pc-uitvoeren nooit"). Epoch + 1 en push. */
export async function setCapabilityCeiling(userId: string, actorId: string, changes: Partial<Record<Capability, boolean | null>>) {
  for (const k of Object.keys(changes)) if (!isCapability(k)) throw new Error('CAPABILITY_INVALID');
  const epoch = await alsGebruiker(userId, async (q) => {
    const cur = (await getSettings(userId, q)).capabilities;
    for (const [k, v] of Object.entries(changes)) { if (v == null) delete cur[k as Capability]; else cur[k as Capability] = !!v; }
    await q(`INSERT INTO app.user_ai_settings (user_id, capabilities) VALUES ($1, $2::jsonb)
             ON CONFLICT (user_id) DO UPDATE SET capabilities = EXCLUDED.capabilities`, [userId, JSON.stringify(cur)]);
    return bumpEpoch(q, userId);
  });
  await auditToevoegen({ ownerId: userId, actorId, action: 'ai_capabilities_changed', type: 'ai', result: 'ok', details: { changes } }).catch(() => undefined);
  await pushSettings(userId);
  return { epoch };
}

/**
 * Gebruiker blokkeren: in ÉÉN transactie alle agenttokens en grants intrekken, epoch + 1, blocked_at; wachtende opdrachten
 * afwijzen. Pas daarna de verbindingen sluiten (een agent die tussendoor nog iets stuurt, heeft dan al geen token/grant meer).
 */
export async function blockUser(userId: string, actorId: string, reason: string) {
  const out = await alsGebruiker(userId, async (q) => {
    const agents = await q(`UPDATE app.agents SET revoked_at = now(), status = 'disconnected', revoke_reason = 'blocked'
                             WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`, [userId]);
    const grants = await q('UPDATE app.ai_grants SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    await q(`UPDATE app.agent_commands SET status = 'rejected', decided_at = now(), finished_at = now(), result = '{"error":"user blocked"}'::jsonb
              WHERE user_id = $1 AND status IN ('pending_approval', 'approved')`, [userId]);
    await q(`INSERT INTO app.user_ai_settings (user_id, blocked_at, blocked_reason) VALUES ($1, now(), $2)
             ON CONFLICT (user_id) DO UPDATE SET blocked_at = now(), blocked_reason = EXCLUDED.blocked_reason`, [userId, reason.slice(0, 200)]);
    // M4: ook de OAuth-tokens van de MCP-connector (Claude) en de tvh_-tokens van de MCP-console intrekken.
    const oauth = await q('UPDATE app.mcp_oauth_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    const tvh = await q('UPDATE app.mcp_console_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    const epoch = await bumpEpoch(q, userId);
    return { epoch, agents: agents.rows.map((r) => r.id as string), grants: grants.rowCount ?? 0, mcpTokens: (oauth.rowCount ?? 0) + (tvh.rowCount ?? 0) };
  }, { systeem: true });
  pusher.close(userId, null, 4403, 'blocked');
  await auditToevoegen({ ownerId: userId, actorId, action: 'ai_user_blocked', type: 'ai', result: 'ok', details: { reason, agents: out.agents.length, grants: out.grants, mcpTokens: out.mcpTokens } }).catch(() => undefined);
  return out;
}

export async function unblockUser(userId: string, actorId: string) {
  const epoch = await alsGebruiker(userId, async (q) => {
    await q('UPDATE app.user_ai_settings SET blocked_at = NULL, blocked_reason = NULL WHERE user_id = $1', [userId]);
    return bumpEpoch(q, userId);
  });
  await auditToevoegen({ ownerId: userId, actorId, action: 'ai_user_unblocked', type: 'ai', result: 'ok', details: {} }).catch(() => undefined);
  return { epoch };
}

/**
 * Noodstop 'Стоп': alle grants van de gebruiker intrekken, wachtende opdrachten afwijzen, alle browsers uitzetten, de agents
 * een stop-bericht sturen (debugger loskoppelen, buffers leeg) en de verbindingen sluiten. De koppeling (tokens) blijft, zodat
 * de gebruiker daarna bewust opnieuw toestemming kan geven zonder opnieuw te koppelen.
 */
export async function stopAll(userId: string, actorId: string) {
  const out = await alsGebruiker(userId, async (q) => {
    const grants = await q('UPDATE app.ai_grants SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    const cmds = await q(`UPDATE app.agent_commands SET status = 'rejected', decided_at = now(), finished_at = now(), result = '{"error":"stopped by user"}'::jsonb
                           WHERE user_id = $1 AND status IN ('pending_approval', 'approved') RETURNING id`, [userId]);
    await q(`UPDATE app.agents SET browser_enabled = false, armed_until = NULL WHERE user_id = $1 AND platform = 'browser' AND revoked_at IS NULL`, [userId]);
    const epoch = await bumpEpoch(q, userId);
    return { epoch, grants: grants.rowCount ?? 0, commands: cmds.rowCount ?? 0 };
  });
  pusher.push(userId, null, { t: 'stop', type: 'stop', epoch: out.epoch, detach: true });
  pusher.close(userId, null, 4410, 'stopped by user');
  await auditToevoegen({ ownerId: userId, actorId, action: 'ai_stop_all', type: 'ai', result: 'ok', details: out }).catch(() => undefined);
  return out;
}

/** Voor de UI: actieve 'altijd'-grants (met stopknop). */
export async function listAlwaysGrants(userId: string): Promise<GrantRow[]> {
  return (await listGrants(userId)).filter((g) => g.always);
}
