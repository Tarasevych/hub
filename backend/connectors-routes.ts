// Local Machine Connector: routes voor de eigenaar-UI (sessie + recht 'api-platform') en het koppelen van een agent.
// Alle routes zijn POST met de gebruikelijke sessie-body ({service:'api', ...}), zoals de overige /api/owner/api-platform/*.
import { error, json, rateLimit } from '../server/platform';
import { auditLijst, auditToevoegen } from '../server/platform/audit';
import { siteEventsFromAudit } from './site-activity';
import { heeftApiRecht } from './api-recht';
import { approveCommand, CommandRefused, rejectCommand, submitCommand } from './connectors-commands';
import { newCommandKey, normalizePairingCode, pairingCode, randomToken, sealCommandKey, sha256 } from './connectors-crypto';
import { agentOnline, COMMAND_TYPES, disconnectAgent, issueWsTicket } from './connectors-gateway';
import * as grants from './ai-grants';
import { archiveDiagnostics } from './browser-diag-archief';
import * as store from './connectors-store';
import { BROWSER_AUTO_APPROVABLE, BROWSER_DEFAULT_AUTO, BROWSER_TYPES, enabledTypes } from './browser-capabilities';
import { defaultChatDeps, runChat, sanitizeHistory } from './connectors-chat';
import { callTool, listTools } from './connectors-tools';
import { listUserGrants } from './mcp-connector';

type SessionAuth = { errorCode: string } | { user: { id: string; email: string; role: string; status: string }; service: string };
type Deps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionAuth>;
  respond: (data: unknown, status?: number) => any;
  fail: (message: string, status?: number) => any;
  audit: (userId: string, action: string, result: string, details?: Record<string, unknown>) => Promise<unknown>;
  body: (body: unknown) => Record<string, unknown>;
  /** Step-up (audit C2/H4): geeft een 403 STEP_UP_REQUIRED-antwoord terug als de sessie niet recent opnieuw bevestigd is, anders null. */
  stepUp?: (ctx: unknown, auth: any) => Promise<any | null>;
};

const MAX_PARAM_BYTES = 6 * 1024 * 1024;
export const AUTO_APPROVABLE_MACHINE = ['fs.read', 'fs.list', 'sys.info', 'sys.metrics', 'docker.ps'] as const;
export const AUTO_APPROVABLE_BROWSER = BROWSER_AUTO_APPROVABLE;
const MAX_NAME = 80;

const bearerOf = (ctx: any) => {
  const h = (ctx.event?.headers || {}) as Record<string, string>;
  return String(Object.entries(h).find(([k]) => k.toLowerCase() === 'authorization')?.[1] ?? '').replace(/^Bearer\s+/i, '').trim();
};
const PAIRING_ID = /^[A-Za-z0-9_-]{8,80}$/;

async function agentSelf(token: string) {
  if (token.length < 20 || token.length > 200) return error('TOKEN_INVALID', 401);
  const agent = await store.findAgentByTokenHash(sha256(token));
  if (!agent || agent.platform !== 'browser') return error('TOKEN_INVALID', 401);
  const armed = agent.browser_enabled === true && !!agent.armed_until && new Date(agent.armed_until).getTime() > Date.now();
  return json({ name: agent.name, enabled: agent.browser_enabled === true, active: armed, capabilities: enabledTypes(agent.policy) });
}

export function createAgentRoutes(deps: Deps) {
  const ownerGate = async (event: Record<string, unknown>, body: unknown) => {
    const auth = await deps.requireSession(event, body);
    // Beheer staat op mcp.* (verbindingen, agenten, tools); de chat op ai.*; 'api' blijft toegestaan voor programmatische clients.
    if ('errorCode' in auth || !['mcp', 'ai', 'api'].includes(auth.service) || auth.user.status !== 'approved') return null;
    if (!heeftApiRecht(auth.user as never)) return null;
    return auth;
  };
  // Voor het bevestigen van een browseragent (heartbeat): een geldige sessie op ELKE dienst van de site (de gebruiker kan op mail.*
  // zitten), met hetzelfde recht als de rest. Zonder geldige sessie geen bevestiging, dus geen actieve browser.
  const sessionGateAny = async (event: Record<string, unknown>, body: unknown) => {
    const auth = await deps.requireSession(event, body);
    if ('errorCode' in auth || auth.user.status !== 'approved' || !heeftApiRecht(auth.user as never)) return null;
    return auth;
  };
  const denied = () => deps.fail('OWNER_API_SESSION_REQUIRED', 403);
  // Zonder step-up-afhankelijkheid (tests, oude aanroepers) weigeren we wat step-up vereist: veilig standaard.
  const stepUp = async (ctx: unknown, auth: any) => (deps.stepUp ? deps.stepUp(ctx, auth) : deps.fail('STEP_UP_REQUIRED', 403));
  const isOwner = (auth: any) => auth?.user?.role === 'owner';
  const refused = (err: unknown) => (err instanceof CommandRefused ? deps.fail(err.code, err.code === 'RATE_LIMITED' ? 429 : 403) : null);

  const publicAgent = (a: store.AgentRow) => ({
    id: a.id, name: a.name, platform: a.platform, policy: a.policy, capabilities: a.capabilities,
    // De waarheid over "online" is het levende kanaal, niet alleen de kolom in de database.
    status: agentOnline(a.id) ? 'connected' : 'disconnected',
    // Alleen voor browseragents: door de gebruiker aangezet, en tot wanneer een ingelogde sessie dat bevestigd heeft.
    enabled: a.browser_enabled === true,
    // De mogelijkheden die de gebruiker voor deze browser heeft aangezet (standaard: alleen lezen/kijken).
    enabledCapabilities: a.platform === 'browser' ? enabledTypes(a.policy) : undefined,
    armedUntil: a.armed_until ? new Date(a.armed_until).getTime() : null,
    lastSeenAt: a.last_seen_at ? new Date(a.last_seen_at).getTime() : null,
    createdAt: new Date(a.created_at).getTime(),
  });

  return {
    // Overzicht: apparaten + opdrachten die op goedkeuring wachten.
    'POST /api/owner/agents/list': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const [agents, pending, last] = await Promise.all([
        store.listAgents(auth.user.id), store.listPendingCommands(auth.user.id), store.lastCommandPerAgent(auth.user.id),
      ]);
      return deps.respond({
        agents: agents.map(publicAgent),
        // Alleen een korte voorvertoning: een resultaat (bijv. fs.read) kan tot 2 MB groot zijn.
        last: last.map((c: any) => ({
          id: c.id, agentId: c.agent_id, type: c.type, status: c.status,
          preview: c.result ? JSON.stringify(c.result).slice(0, 600) : '',
          createdAt: new Date(c.created_at).getTime(),
        })),
        pending: pending.map((c: any) => ({ id: c.id, agentId: c.agent_id, agentName: c.agent_name, type: c.type, params: c.params, createdAt: new Date(c.created_at).getTime() })),
        limits: store.AGENT_LIMITS,
      });
    }],

    // Eenmalige koppelcode (10 min). Maximaal 5 per 10 minuten en 10 apparaten per gebruiker.
    'POST /api/owner/agents/pairing-code': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      if ((await store.countAgents(auth.user.id)) >= store.AGENT_LIMITS.agentsPerUser) return deps.fail('AGENT_LIMIT_REACHED', 409);
      const code = pairingCode();
      const expiresAt = await store.createPairingCode(auth.user.id, sha256(code));
      if (!expiresAt) return deps.fail('PAIRING_CODE_RATE_LIMITED', 429);
      store.purgeOldPairingCodes().catch(() => undefined);
      await deps.audit(auth.user.id, 'owner.agent.pairing_code', 'success');
      return deps.respond({ code, expiresAt: new Date(expiresAt).getTime() });
    }],

    // Publiek (zie PUBLIEKE_ROUTES): de agent wisselt de koppelcode in voor een eigen token.
    // De code hoort bij precies één gebruiker; het nieuwe apparaat is daarmee alleen van die gebruiker.
    'POST /api/owner/agents/pair': [async (ctx: any) => {
      const body = deps.body(ctx.body);
      const code = normalizePairingCode(body.code);
      const userId = code.length === 8 ? await store.consumePairingCode(sha256(code)) : null;
      if (!userId) return error('PAIRING_CODE_INVALID', 400);
      if ((await store.countAgents(userId)) >= store.AGENT_LIMITS.agentsPerUser) return error('AGENT_LIMIT_REACHED', 409);
      const token = randomToken(32);
      const name = String(body.name || 'Mijn apparaat').trim().slice(0, MAX_NAME) || 'Mijn apparaat';
      const platform = body.platform ? String(body.platform).slice(0, 40) : null;
      const capabilities = body.capabilities && typeof body.capabilities === 'object' ? body.capabilities as object : {};
      const pairingId = typeof body.pairingId === 'string' && PAIRING_ID.test(body.pairingId) ? body.pairingId : null;
      const version = typeof body.version === 'string' ? body.version.slice(0, 40) : null;
      // Een browserextensie begint voorzichtig: alleen lezen (snapshot) gaat direct; navigeren en handelen wachten op een klik.
      const policy = platform === 'browser' ? { autoApprove: [...BROWSER_DEFAULT_AUTO].sort() } : undefined;
      // Opdrachtsleutel (audit H3): de agent krijgt hem één keer; de server bewaart hem alleen verzegeld.
      const commandKey = newCommandKey();
      const tokenHash = sha256(token);
      const agent = await store.createAgent(userId, name, platform, tokenHash, capabilities, policy, { pairingId, commandKeyEnc: sealCommandKey(commandKey, userId, tokenHash), version });
      // Opnieuw koppelen trekt het vorige token van dezelfde installatie in (pairing_id; oude extensies: zelfde naam).
      const replaced = await store.revokePreviousPairing(userId, agent.id, pairingId, name, platform);
      for (const old of replaced) disconnectAgent(old);
      // Een nieuwe koppeling start met alleen lezen (30 dagen); meer geeft de gebruiker zelf (presets of per mogelijkheid).
      await grants.applyPreset(userId, 'pairing', agent.id, 'spostericach').catch(() => undefined);
      await auditToevoegen({ ownerId: userId, actorId: null, action: 'owner.agent.paired', result: 'success', details: { agentId: agent.id, platform, replaced: replaced.length, pairingId: pairingId ? 'ja' : 'nee' } });
      // userId: voor de accountclaim (<meta name="mjn-account">): de extensie weigert opdrachten op een pagina van een ander account.
      return json({ agentId: agent.id, userId, token, commandKey, tokenExpiresAt: agent.token_expires_at ? new Date(agent.token_expires_at).getTime() : null });
    }],

    // De gebruiker zet een gekoppelde browser aan of uit voor AI-gebruik. Standaard uit na het koppelen.
    'POST /api/owner/agents/:id/browser-enabled': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      // Aanzetten = AI de browser laten besturen: step-up. Uitzetten kan altijd (veilige richting).
      if (deps.body(ctx.body).enabled === true) { const su = await stepUp(ctx, auth); if (su) return su; }
      const enabled = deps.body(ctx.body).enabled;
      if (typeof enabled !== 'boolean') return deps.fail('BROWSER_ENABLED_INVALID', 400);
      const ok = await store.setBrowserEnabled(auth.user.id, ctx.params.id, enabled);
      if (!ok) return deps.fail('AGENT_NOT_FOUND', 404);
      await deps.audit(auth.user.id, enabled ? 'owner.browser.enabled' : 'owner.browser.disabled', 'success', { agentId: ctx.params.id });
      return deps.respond({ ok: true, enabled });
    }],

    // Elke paar minuten vanuit een ingelogde pagina van de site: houdt een door de gebruiker aangezette browser actief.
    // Zonder geldige sessie komt hier een 403 en verloopt de activering vanzelf (zie 0013).
    'POST /api/owner/agents/:id/heartbeat': [async (ctx: any) => {
      const auth = await sessionGateAny(ctx.event, ctx.body);
      if (!auth) return denied();
      const armed = await store.armBrowserAgent(auth.user.id, ctx.params.id);
      return deps.respond({ ok: true, armed });
    }],

    // Alles wat Claude en uw apparaten of browsers recent deden, als één lijst met stand en duur. Voedt het meldingencentrum op elke pagina (daarom een sessie op elke dienst, net als de heartbeat).
    'POST /api/owner/agents/activity': [async (ctx: any) => {
      const auth = await sessionGateAny(ctx.event, ctx.body);
      if (!auth) return denied();
      const userId = auth.user.id;
      const [commands, toolCalls, grants, audit] = await Promise.all([store.listRecentCommands(userId, 60), store.listToolCalls(userId, 40), listUserGrants(userId), auditLijst({ ownerId: userId, van: Date.now() - 3 * 86_400_000, limit: 120 }).then((r) => r.items).catch(() => [])]);
      const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);
      const events = [
        ...commands.map((r: any) => ({ id: `cmd:${r.id}`, source: r.platform === 'browser' ? 'browser' : 'agent', platform: r.platform || '', kind: 'command', type: r.type, subject: r.agent_name, status: r.status, createdAt: ms(r.created_at), finishedAt: ms(r.finished_at) })),
        ...toolCalls.map((r: any) => ({ id: `tool:${r.id}`, source: 'claude', kind: 'tool', type: r.tool, subject: 'Claude', status: r.status, createdAt: ms(r.created_at), finishedAt: ms(r.finished_at) })),
        ...grants.map((g: any) => ({ id: `grant:${g.id}`, source: 'claude', kind: 'grant', type: 'grant', subject: g.clientName, status: 'active', createdAt: g.createdAt, finishedAt: null })),
        ...siteEventsFromAudit(audit),
      ].sort((x, y) => Number(y.createdAt) - Number(x.createdAt)).slice(0, 140);
      return deps.respond({ events, now: Date.now() });
    }],

    // Welke opdrachttypes direct mogen (zonder klik). Schrijven, uitvoeren, Docker-beheer, klikken en typen kunnen nooit automatisch.
    'POST /api/owner/agents/:id/policy': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const agent = await store.getAgent(auth.user.id, ctx.params.id);
      if (!agent) return deps.fail('AGENT_NOT_FOUND', 404);
      const body = deps.body(ctx.body);
      const asked = body.autoApprove;
      if (!Array.isArray(asked) || asked.length > 30 || asked.some((v) => typeof v !== 'string')) return deps.fail('POLICY_INVALID', 400);
      const browser = agent.platform === 'browser';
      const allowed: readonly string[] = browser ? AUTO_APPROVABLE_BROWSER : AUTO_APPROVABLE_MACHINE;
      if (asked.some((v: string) => !allowed.includes(v))) return deps.fail('POLICY_TYPE_NOT_ALLOWED', 400);
      // Alleen browseragents: welke mogelijkheden AAN staan. Automatisch goedkeuren kan alleen voor wat ook aan staat.
      let enabled: string[] | undefined;
      if (browser && body.enabled !== undefined) {
        if (!Array.isArray(body.enabled) || body.enabled.length > 30 || body.enabled.some((v) => !(BROWSER_TYPES as readonly string[]).includes(String(v)))) return deps.fail('POLICY_CAPABILITY_UNKNOWN', 400);
        enabled = [...new Set(body.enabled as string[])].sort();
      } else if (!browser && body.enabled !== undefined) return deps.fail('POLICY_INVALID', 400);
      const autoApprove = [...new Set(asked as string[])].filter((t) => !browser || (enabled ?? enabledTypes(agent.policy)).includes(t)).sort();
      await store.setAgentPolicy(auth.user.id, agent.id, autoApprove, enabled);
      await deps.audit(auth.user.id, 'owner.agent.policy', 'success', { agentId: agent.id, autoApprove, ...(enabled ? { enabled } : {}) });
      return deps.respond({ ok: true, policy: { autoApprove, ...(browser ? { enabled: enabled ?? enabledTypes(agent.policy) } : {}) } });
    }],

    // Publiek (zie PUBLIEKE_ROUTES): de extensie vraagt met haar eigen token wat de gebruiker heeft aangezet, zodat het popupvenster
    // kan uitleggen wat er nog moet gebeuren (aanzetten, of inloggen op de site). Geeft geen gegevens van de gebruiker terug.
    // GET met het token in de Authorization-header: het is een leesactie, dus de CSRF-controle (alleen voor wijzigende methoden) is hier terecht
    // niet van toepassing, terwijl de service worker van een extensie bij POST altijd een chrome-extension://-Origin meestuurt (zie server/start.ts).
    // De POST-variant (token in de body) blijft bestaan voor oudere extensies.
    'GET /api/owner/agents/self': [async (ctx: any) => {
      const h = (ctx.event?.headers || {}) as Record<string, string>;
      const raw = Object.entries(h).find(([k]) => k.toLowerCase() === 'authorization')?.[1] ?? '';
      return agentSelf(String(raw).replace(/^Bearer\s+/i, '').trim());
    }],
    'POST /api/owner/agents/self': [async (ctx: any) => agentSelf(String(deps.body(ctx.body).token ?? ''))],

    // Publiek (zie PUBLIEKE_ROUTES): eenmalig WebSocket-ticket (60 s) in ruil voor het agenttoken in de Authorization-header.
    // Zo gaat het langlevende token nooit over het WebSocket-kanaal of in een URL; het ticket werkt één keer.
    'GET /api/owner/agents/ws-ticket': [async (ctx: any) => {
      const token = bearerOf(ctx);
      if (token.length < 20 || token.length > 200) return error('TOKEN_INVALID', 401);
      const agent = await store.findAgentByTokenHash(sha256(token));
      if (!agent) return error('TOKEN_INVALID', 401);
      const limit = await rateLimit(`ws-ticket:${agent.id}`, 30, 60);
      if (!limit.ok) return error('RATE_LIMITED', 429);
      return json(issueWsTicket(agent.id));
    }],

    // Publiek: de extensie levert haar diagnosebuffer (≤ 200 items) aan; versleuteld per gebruiker bewaard, 90 dagen.
    'POST /api/owner/agents/diagnostics/archive': [async (ctx: any) => {
      const token = bearerOf(ctx) || String(deps.body(ctx.body).token ?? '');
      const agent = token.length >= 20 && token.length <= 200 ? await store.findAgentByTokenHash(sha256(token)) : null;
      if (!agent || agent.platform !== 'browser') return error('TOKEN_INVALID', 401);
      const limit = await rateLimit(`diag-archief:${agent.id}`, 12, 3600);
      if (!limit.ok) return error('RATE_LIMITED', 429);
      const entries = deps.body(ctx.body).entries;
      if (!Array.isArray(entries) || entries.length > 200) return error('ENTRIES_INVALID', 400);
      try { return json(await archiveDiagnostics(agent.user_id, agent.id, entries)); }
      catch (err) { return error((err as Error).message || 'ARCHIVE_FAILED', 400); }
    }],

    // ---- toestemmingen (grants), presets, 'altijd', noodstop, blokkeren ----
    'POST /api/owner/ai/grants/list': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const userId = auth.user.id;
      const [settings, list, agents] = await Promise.all([grants.getSettings(userId), grants.listGrants(userId, { includeInactive: !!deps.body(ctx.body).history }), store.listAgents(userId)]);
      return deps.respond({
        settings: { capabilities: settings.capabilities, epoch: settings.epoch, blocked: !!settings.blocked_at },
        grants: list.map((g) => ({ id: g.id, agentId: g.agent_id, capability: g.capability, domains: g.scope?.domains ?? [], always: g.always, preset: g.preset,
          grantedAt: new Date(g.granted_at).getTime(), expiresAt: new Date(g.expires_at).getTime(), revokedAt: g.revoked_at ? new Date(g.revoked_at).getTime() : null })),
        agents: agents.map((a) => ({ id: a.id, name: a.name, platform: a.platform, online: agentOnline(a.id), version: a.agent_version ?? null,
          lastSeenAt: a.last_seen_at ? new Date(a.last_seen_at).getTime() : null, tokenExpiresAt: a.token_expires_at ? new Date(a.token_expires_at).getTime() : null })),
        catalog: { capabilities: grants.CAPABILITIES, destructive: [...grants.DESTRUCTIVE], presets: grants.PRESETS, limits: grants.GRANT_LIMITS },
      });
    }],
    'POST /api/owner/ai/grants/add': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const b = deps.body(ctx.body);
      const list = Array.isArray(b.grants) ? b.grants as any[] : [b];
      if (!list.length || list.length > 20) return deps.fail('GRANTS_INVALID', 400);
      const wantsAlways = list.some((g) => g?.always === true);
      // 'altijd' alleen met step-up (en dan nog met vervaldatum; zie ai-grants). Gewone grants: step-up voor destructieve mogelijkheden.
      const needsStepUp = wantsAlways || list.some((g) => grants.DESTRUCTIVE.has(g?.capability));
      if (needsStepUp) { const su = await stepUp(ctx, auth); if (su) return su; }
      try {
        const out = await grants.addGrants(auth.user.id, auth.user.id, list.map((g) => ({ agentId: String(g.agentId || ''), capability: g.capability, domains: g.domains, always: g.always === true, minutes: g.minutes == null ? undefined : Number(g.minutes) })), { steppedUp: needsStepUp });
        return deps.respond({ ok: true, epoch: out.epoch, ids: out.grants.map((g) => g.id) });
      } catch (err) { return deps.fail((err as Error).message, 400); }
    }],
    'POST /api/owner/ai/grants/preset': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const b = deps.body(ctx.body);
      const preset = String(b.preset || '') as grants.PresetId;
      if (!grants.PRESETS[preset]) return deps.fail('PRESET_INVALID', 400);
      // Presets met destructieve mogelijkheden (Помічник, Разово): step-up.
      const p = grants.PRESETS[preset];
      if ([...p.browser, ...p.machine].some((c) => grants.DESTRUCTIVE.has(c))) { const su = await stepUp(ctx, auth); if (su) return su; }
      try {
        const out = await grants.applyPreset(auth.user.id, auth.user.id, String(b.agentId || ''), preset, { minutes: b.minutes == null ? undefined : Number(b.minutes), domains: b.domains, replace: b.replace !== false });
        return deps.respond({ ok: true, epoch: out.epoch });
      } catch (err) { return deps.fail((err as Error).message, 400); }
    }],
    'POST /api/owner/ai/grants/revoke': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const b = deps.body(ctx.body);
      if (!b.grantId && !b.agentId && !b.capability && b.all !== true) return deps.fail('REVOKE_TARGET_REQUIRED', 400);
      const out = await grants.revokeGrants(auth.user.id, auth.user.id, { grantId: b.grantId ? String(b.grantId) : undefined, agentId: b.agentId ? String(b.agentId) : undefined, capability: grants.isCapability(b.capability) ? b.capability : undefined, reason: 'ui' });
      return deps.respond({ ok: true, epoch: out.epoch, revoked: out.revoked.length });
    }],
    'POST /api/owner/ai/settings': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const changes = deps.body(ctx.body).capabilities;
      if (!changes || typeof changes !== 'object') return deps.fail('SETTINGS_INVALID', 400);
      // Iets AANzetten in het plafond = step-up; uitzetten mag altijd.
      if (Object.values(changes as Record<string, unknown>).some((v) => v === true)) { const su = await stepUp(ctx, auth); if (su) return su; }
      try { return deps.respond({ ok: true, ...(await grants.setCapabilityCeiling(auth.user.id, auth.user.id, changes as never)) }); }
      catch (err) { return deps.fail((err as Error).message, 400); }
    }],
    // Noodstop 'Стоп': geen step-up (stoppen moet altijd en meteen kunnen).
    'POST /api/owner/ai/stop': [async (ctx: any) => {
      const auth = await sessionGateAny(ctx.event, ctx.body);
      if (!auth) return denied();
      return deps.respond({ ok: true, ...(await grants.stopAll(auth.user.id, auth.user.id)) });
    }],
    // Eigenaar blokkeert de AI-toegang van een account (alle tokens + grants in één transactie, daarna verbindingen dicht).
    'POST /api/owner/ai/block': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || !isOwner(auth)) return denied();
      const su = await stepUp(ctx, auth); if (su) return su;
      const b = deps.body(ctx.body);
      const target = String(b.userId || '');
      if (!target) return deps.fail('USER_REQUIRED', 400);
      if (b.unblock === true) return deps.respond({ ok: true, ...(await grants.unblockUser(target, auth.user.id)) });
      return deps.respond({ ok: true, ...(await grants.blockUser(target, auth.user.id, String(b.reason || 'owner'))) });
    }],

    'POST /api/owner/agents/:id/revoke': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const ok = await store.revokeAgent(auth.user.id, ctx.params.id);
      if (ok) { disconnectAgent(ctx.params.id); await deps.audit(auth.user.id, 'owner.agent.revoked', 'success', { agentId: ctx.params.id }); }
      return deps.respond({ ok });
    }],

    // Opdracht voor een agent (bijv. vanuit de UI of een ander onderdeel van de app).
    'POST /api/owner/agents/:id/command': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const agent = await store.getAgent(auth.user.id, ctx.params.id);
      if (!agent) return deps.fail('AGENT_NOT_FOUND', 404);
      const body = deps.body(ctx.body);
      const type = String(body.type ?? '');
      if (!(COMMAND_TYPES as readonly string[]).includes(type)) return deps.fail('COMMAND_TYPE_UNKNOWN', 400);
      const params = body.params && typeof body.params === 'object' ? body.params as object : {};
      if (Buffer.byteLength(JSON.stringify(params)) > MAX_PARAM_BYTES) return deps.fail('COMMAND_PARAMS_TOO_LARGE', 413);
      if (!agentOnline(agent.id)) return deps.fail('AGENT_OFFLINE', 409);
      if (type.startsWith('browser.') && !(await store.browserActive(agent.id))) return deps.fail('BROWSER_NOT_ACTIVE', 409);
      let command, auto;
      try { ({ command, auto } = await submitCommand(agent, auth.user.id, type, params)); }
      catch (err) { const r = refused(err); if (r) return r; throw err; }
      await deps.audit(auth.user.id, 'owner.agent.command', 'success', { agentId: agent.id, commandId: command.id, type, auto });
      return deps.respond({ command });
    }],

    'POST /api/owner/agents/:id/commands': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      return deps.respond({ commands: await store.listCommands(auth.user.id, ctx.params.id) });
    }],

    'POST /api/owner/agents/commands/:id/approve': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      // Verse goedkeuring van een (destructieve) opdracht: step-up van ten hoogste 5 minuten oud (audit C2).
      const su = await stepUp(ctx, auth); if (su) return su;
      const command = await approveCommand(auth.user.id, ctx.params.id);
      if (!command) return deps.fail('COMMAND_NOT_PENDING', 409);
      if (command.status === 'failed') return deps.respond({ command, error: 'NOT_DISPATCHED' });
      await deps.audit(auth.user.id, 'owner.agent.command.approved', 'success', { commandId: command.id, type: command.type });
      return deps.respond({ command });
    }],

    'POST /api/owner/agents/commands/:id/reject': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const command = await rejectCommand(auth.user.id, ctx.params.id);
      if (!command) return deps.fail('COMMAND_NOT_PENDING', 409);
      await deps.audit(auth.user.id, 'owner.agent.command.rejected', 'success', { commandId: command.id, type: command.type });
      return deps.respond({ command });
    }],

    // Chat op ai.*: sleutel (BYOK) uit de kluis, hulpmiddelen voor eigen apparaten. De client stuurt alleen platte tekst.
    'POST /api/owner/agents/chat/status': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const [key, tools, agents] = await Promise.all([defaultChatDeps.getApiKey(auth.user.id), listTools(auth.user.id), store.listAgents(auth.user.id)]);
      return deps.respond({
        hasKey: !!key, tools: tools.map((t) => t.name),
        machines: { total: agents.length, online: agents.filter((a) => agentOnline(a.id)).length },
      });
    }],

    'POST /api/owner/agents/chat': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      // Elk verzoek kost de gebruiker tokens op zijn eigen sleutel; begrens per gebruiker.
      const limit = await rateLimit(`chat:${auth.user.id}`, 20, 60);
      if (!limit.ok) return deps.fail('CHAT_RATE_LIMITED', 429);
      const messages = sanitizeHistory(deps.body(ctx.body).messages);
      if (!messages.length || messages[messages.length - 1].role !== 'user') return deps.fail('CHAT_LAST_MESSAGE_MUST_BE_USER', 400);
      const out = await runChat(defaultChatDeps, auth.user.id, messages);
      if ('error' in out) {
        await deps.audit(auth.user.id, 'owner.agent.chat', 'failure', { error: out.error });
        return out.error === 'no_api_key' ? deps.fail('CHAT_NO_API_KEY', 409) : deps.fail(`CHAT_PROVIDER_ERROR_${out.status}`, 502);
      }
      await deps.audit(auth.user.id, 'owner.agent.chat', 'success', { steps: out.steps.map((s) => s.tool) });
      return deps.respond(out);
    }],

    // AI-tools (MCP-formaat) van de ingelogde gebruiker. Voor het AI-werkruimtescherm van de site.
    'POST /api/owner/agents/tools/list': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      return deps.respond({ tools: await listTools(auth.user.id) });
    }],

    'POST /api/owner/agents/tools/call': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const body = deps.body(ctx.body);
      const name = String(body.name ?? '');
      const result = await callTool(auth.user.id, name, body.arguments && typeof body.arguments === 'object' ? body.arguments : {});
      await deps.audit(auth.user.id, 'owner.agent.tool', result.isError ? 'failure' : 'success', { tool: name });
      return deps.respond(result);
    }],
  };
}
