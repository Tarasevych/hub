// Local Machine Connector: routes voor de eigenaar-UI (sessie + recht 'api-platform') en het koppelen van een agent.
// Alle routes zijn POST met de gebruikelijke sessie-body ({service:'api', ...}), zoals de overige /api/owner/api-platform/*.
import { error, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import { heeftApiRecht } from './api-recht';
import { approveCommand, rejectCommand, submitCommand } from './connectors-commands';
import { normalizePairingCode, pairingCode, randomToken, sha256 } from './connectors-crypto';
import { agentOnline, COMMAND_TYPES, disconnectAgent } from './connectors-gateway';
import * as store from './connectors-store';
import { callTool, listTools } from './connectors-tools';

type SessionAuth = { errorCode: string } | { user: { id: string; email: string; role: string; status: string }; service: string };
type Deps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionAuth>;
  respond: (data: unknown, status?: number) => unknown;
  fail: (message: string, status?: number) => unknown;
  audit: (userId: string, action: string, result: string, details?: Record<string, unknown>) => Promise<unknown>;
  body: (body: unknown) => Record<string, unknown>;
};

const MAX_PARAM_BYTES = 6 * 1024 * 1024;
const MAX_NAME = 80;

export function createAgentRoutes(deps: Deps) {
  const ownerGate = async (event: Record<string, unknown>, body: unknown) => {
    const auth = await deps.requireSession(event, body);
    if ('errorCode' in auth || auth.service !== 'api' || auth.user.status !== 'approved') return null;
    if (!heeftApiRecht(auth.user as never)) return null;
    return auth;
  };
  const denied = () => deps.fail('OWNER_API_SESSION_REQUIRED', 403);

  const publicAgent = (a: store.AgentRow) => ({
    id: a.id, name: a.name, platform: a.platform, policy: a.policy, capabilities: a.capabilities,
    // De waarheid over "online" is het levende kanaal, niet alleen de kolom in de database.
    status: agentOnline(a.id) ? 'connected' : 'disconnected',
    lastSeenAt: a.last_seen_at ? new Date(a.last_seen_at).getTime() : null,
    createdAt: new Date(a.created_at).getTime(),
  });

  return {
    // Overzicht: apparaten + opdrachten die op goedkeuring wachten.
    'POST /api/owner/agents/list': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const [agents, pending] = await Promise.all([store.listAgents(auth.user.id), store.listPendingCommands(auth.user.id)]);
      return deps.respond({
        agents: agents.map(publicAgent),
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
      const agent = await store.createAgent(userId, name, platform, sha256(token), capabilities);
      await auditToevoegen({ ownerId: userId, actorId: null, action: 'owner.agent.paired', result: 'success', details: { agentId: agent.id, platform } });
      return json({ agentId: agent.id, token });
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
