// Local Machine Connector: routes voor de eigenaar-UI (sessie + recht 'api-platform') en het koppelen van een agent.
// Alle routes zijn POST met de gebruikelijke sessie-body ({service:'api', ...}), zoals de overige /api/owner/api-platform/*.
import { error, json, rateLimit } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { heeftApiRecht } from './api-recht';
import { approveCommand, rejectCommand, submitCommand } from './connectors-commands';
import { normalizePairingCode, pairingCode, randomToken, sha256 } from './connectors-crypto';
import { agentOnline, COMMAND_TYPES, disconnectAgent } from './connectors-gateway';
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
};

const MAX_PARAM_BYTES = 6 * 1024 * 1024;
export const AUTO_APPROVABLE_MACHINE = ['fs.read', 'fs.list', 'sys.info', 'sys.metrics', 'docker.ps'] as const;
export const AUTO_APPROVABLE_BROWSER = BROWSER_AUTO_APPROVABLE;
const MAX_NAME = 80;

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
      // Een browserextensie begint voorzichtig: alleen lezen (snapshot) gaat direct; navigeren en handelen wachten op een klik.
      const policy = platform === 'browser' ? { autoApprove: [...BROWSER_DEFAULT_AUTO].sort() } : undefined;
      const agent = await store.createAgent(userId, name, platform, sha256(token), capabilities, policy);
      await auditToevoegen({ ownerId: userId, actorId: null, action: 'owner.agent.paired', result: 'success', details: { agentId: agent.id, platform } });
      return json({ agentId: agent.id, token });
    }],

    // De gebruiker zet een gekoppelde browser aan of uit voor AI-gebruik. Standaard uit na het koppelen.
    'POST /api/owner/agents/:id/browser-enabled': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
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
      const [commands, toolCalls, grants] = await Promise.all([store.listRecentCommands(userId, 60), store.listToolCalls(userId, 40), listUserGrants(userId)]);
      const ms = (v: unknown) => (v ? new Date(v as string).getTime() : null);
      const events = [
        ...commands.map((r: any) => ({ id: `cmd:${r.id}`, source: r.platform === 'browser' ? 'browser' : 'agent', kind: 'command', type: r.type, subject: r.agent_name, status: r.status, createdAt: ms(r.created_at), finishedAt: ms(r.finished_at) })),
        ...toolCalls.map((r: any) => ({ id: `tool:${r.id}`, source: 'claude', kind: 'tool', type: r.tool, subject: 'Claude', status: r.status, createdAt: ms(r.created_at), finishedAt: ms(r.finished_at) })),
        ...grants.map((g: any) => ({ id: `grant:${g.id}`, source: 'claude', kind: 'grant', type: 'grant', subject: g.clientName, status: 'active', createdAt: g.createdAt, finishedAt: null })),
      ].sort((x, y) => Number(y.createdAt) - Number(x.createdAt)).slice(0, 100);
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
    'POST /api/owner/agents/self': [async (ctx: any) => {
      const token = String(deps.body(ctx.body).token ?? '');
      if (token.length < 20 || token.length > 200) return error('TOKEN_INVALID', 401);
      const agent = await store.findAgentByTokenHash(sha256(token));
      if (!agent || agent.platform !== 'browser') return error('TOKEN_INVALID', 401);
      const armed = agent.browser_enabled === true && !!agent.armed_until && new Date(agent.armed_until).getTime() > Date.now();
      return json({ name: agent.name, enabled: agent.browser_enabled === true, active: armed, capabilities: enabledTypes(agent.policy) });
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
      if (type.startsWith('browser.')) {
        const gate = await store.browserGate(agent.id, type);
        if (gate !== 'ok') return deps.fail(gate === 'inactive' ? 'BROWSER_NOT_ACTIVE' : 'BROWSER_CAPABILITY_OFF', 409);
      }
      const { command, auto } = await submitCommand(agent, auth.user.id, type, params);
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
      const command = await approveCommand(auth.user.id, ctx.params.id);
      if (!command) return deps.fail('COMMAND_NOT_PENDING', 409);
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
