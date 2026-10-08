// Routes voor de MCP-connector van Claude. De publieke eindpunten (metadata, registratie, autorisatie, token, MCP) staan
// onder /api/mcp-connector/*; server/start.ts koppelt de nette URL's aan Claude (/mcp, /oauth2/*, /.well-known/...) daaraan.
// De routes voor toestemming en beheer vragen een sessie (service mcp) en het recht 'api-platform'.
import { heeftApiRecht } from './api-recht';
import * as c from './mcp-connector';
import { approveToolCall, describeTools, KNOWN_TOOL_NAMES, rejectToolCall, RISKY_TOOLS } from './connectors-tools';
import * as agentStore from './connectors-store';

type SessionAuth = { errorCode: string } | { user: { id: string; email: string; role: string; status: string }; service: string };
type Deps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionAuth>;
  respond: (data: unknown, status?: number) => any;
  fail: (message: string, status?: number) => any;
  audit: (userId: string, action: string, result: string, details?: Record<string, unknown>) => Promise<unknown>;
  body: (body: unknown) => Record<string, unknown>;
  /** H4: verse herauthenticatie (step-up) voor toestemming aan Claude, riskante hulpmiddelen op 'altijd' en goedkeuren van riskante aanroepen. */
  stepUp?: (ctx: unknown, auth: any) => Promise<any | null>;
};

const header = (event: any, name: string): string | undefined => {
  for (const [k, v] of Object.entries(event?.headers || {})) if (k.toLowerCase() === name) return String(v);
  return undefined;
};

export function createMcpConnectorRoutes(deps: Deps) {
  const ownerGate = async (event: Record<string, unknown>, body: unknown) => {
    const auth = await deps.requireSession(event, body);
    if ('errorCode' in auth || auth.service !== 'mcp' || auth.user.status !== 'approved') return null;
    if (!heeftApiRecht(auth.user as never)) return null;
    return auth;
  };
  const denied = () => deps.fail('OWNER_API_SESSION_REQUIRED', 403);
  const ridOf = (ctx: any) => String(deps.body(ctx.body).rid ?? '').slice(0, 100);
  // Zonder step-up-functie weigeren (nooit stilletjes doorlaten).
  const stepUp = async (ctx: unknown, auth: any) => (deps.stepUp ? deps.stepUp(ctx, auth) : deps.fail('STEP_UP_REQUIRED', 403));

  return {
    // ---- publiek (zie PUBLIEKE_ROUTES): Claude praat hier rechtstreeks mee, zonder sessie ----
    'GET /api/mcp-connector/prm': [async () => c.protectedResourceMetadata()],
    'GET /api/mcp-connector/asm': [async () => c.authorizationServerMetadata()],
    'POST /api/mcp-connector/register': [async (ctx: any) => c.registerClient(String(ctx.event.body || ''))],
    'GET /api/mcp-connector/authorize': [async (ctx: any) => c.authorize(ctx.query)],
    'POST /api/mcp-connector/token': [async (ctx: any) => c.token(String(ctx.event.body || ''))],
    'POST /api/mcp-connector/revoke': [async (ctx: any) => c.revoke(String(ctx.event.body || ''))],
    'POST /api/mcp-connector/rpc':[async (ctx: any) => c.rpcPost(header(ctx.event, 'authorization'), String(ctx.event.body || ''))],
    'GET /api/mcp-connector/rpc': [async () => c.rpcNotAllowed()],
    'DELETE /api/mcp-connector/rpc': [async () => c.rpcNotAllowed()],

    // ---- toestemming en beheer door de ingelogde gebruiker ----
    'POST /api/owner/mcp-connector/consent/info': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const info = await c.consentInfo(ridOf(ctx));
      return info ? deps.respond(info) : deps.fail('CONSENT_EXPIRED', 404);
    }],

    'POST /api/owner/mcp-connector/consent': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const approve = deps.body(ctx.body).approve === true;
      // H4: toestemming geven (niet weigeren) vraagt een verse aanmelding: tegen consent-phishing met een door een aanvaller gestarte flow.
      if (approve) { const su = await stepUp(ctx, auth); if (su) return su; }
      const out = await c.consentDecide(auth.user.id, ridOf(ctx), approve);
      if ('error' in out) return deps.fail(out.error === 'GRANT_LIMIT' ? 'MCP_GRANT_LIMIT_REACHED' : 'CONSENT_EXPIRED', out.error === 'GRANT_LIMIT' ? 409 : 404);
      await deps.audit(auth.user.id, approve ? 'owner.mcp.grant.approved' : 'owner.mcp.grant.denied', 'success');
      return deps.respond(out);
    }],

    'POST /api/owner/mcp-connector/grants': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      return deps.respond({ grants: await c.listUserGrants(auth.user.id), url: c.RESOURCE });
    }],

    'POST /api/owner/mcp-connector/tools': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      return deps.respond({ tools: await describeTools(auth.user.id) });
    }],

    // De modus van een hulpmiddel zetten: "always" (geen extra vraag), "ask" (elke aanroep wacht op een klik op de site) of "off" (weg uit
    // tools/list en geweigerd bij aanroep). Riskante hulpmiddelen (RISKY_TOOLS) staan standaard uit; de gebruiker mag ze zelf op elke modus zetten.
    // Oude vorm {name, enabled: boolean} blijft werken: aan = standaardmodus, uit = off.
    'POST /api/owner/mcp-connector/tools/set': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const body = deps.body(ctx.body);
      const name = String(body.name ?? '');
      if (!KNOWN_TOOL_NAMES.includes(name)) return deps.fail('TOOL_SETTING_INVALID', 400);
      let mode: 'always' | 'ask' | 'off' | null;
      if (typeof body.mode === 'string') {
        if (!['always', 'ask', 'off', 'default'].includes(body.mode)) return deps.fail('TOOL_SETTING_INVALID', 400);
        mode = body.mode === 'default' ? null : (body.mode as 'always' | 'ask' | 'off');
      } else if (typeof body.enabled === 'boolean') mode = body.enabled ? null : 'off';
      else return deps.fail('TOOL_SETTING_INVALID', 400);
      if (mode === 'always' && RISKY_TOOLS.has(name)) { const su = await stepUp(ctx, auth); if (su) return su; }
      await agentStore.setToolModes(auth.user.id, { [name]: mode });
      await deps.audit(auth.user.id, 'owner.mcp.tool.setting', 'success', { tool: name, mode: mode ?? 'default' });
      return deps.respond({ ok: true, tools: await describeTools(auth.user.id) });
    }],

    // "Set all tools": een modus voor alle hulpmiddelen tegelijk (of een groep). 'default' = terug naar de standaard van elk hulpmiddel.
    'POST /api/owner/mcp-connector/tools/set-all': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const body = deps.body(ctx.body);
      if (typeof body.mode !== 'string' || !['always', 'ask', 'off', 'default'].includes(body.mode)) return deps.fail('TOOL_SETTING_INVALID', 400);
      const group = body.group === undefined ? '' : String(body.group);
      const all = await describeTools(auth.user.id);
      const changes: Record<string, 'always' | 'ask' | 'off' | null> = {};
      for (const t of all) {
        if (group && t.group !== group) continue;
        // Een bulkactie "Altijd"/"Vragen" laat riskante hulpmiddelen ongemoeid: die zet de gebruiker bewust één voor één.
        if (t.risky && (body.mode === 'always' || body.mode === 'ask')) continue;
        changes[t.name] = body.mode === 'default' ? null : (body.mode as 'always' | 'ask' | 'off');
      }
      await agentStore.setToolModes(auth.user.id, changes);
      await deps.audit(auth.user.id, 'owner.mcp.tool.setting_all', 'success', { mode: body.mode, group: group || 'all', tools: Object.keys(changes).length });
      return deps.respond({ ok: true, tools: await describeTools(auth.user.id) });
    }],

    // Aanroepen van site-hulpmiddelen die op goedkeuring wachten (modus "ask"), plus de laatste uitkomsten.
    'POST /api/owner/mcp-connector/approvals': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const rows = await agentStore.listToolCalls(auth.user.id, 20);
      return deps.respond({
        calls: rows.map((r: any) => ({
          id: r.id, tool: r.tool, args: r.args, status: r.status, createdAt: new Date(r.created_at).getTime(),
          preview: r.result?.content?.[0]?.text ? String(r.result.content[0].text).slice(0, 400) : '',
        })),
      });
    }],

    'POST /api/owner/mcp-connector/approvals/:id/approve': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const pending = await agentStore.getToolCall(auth.user.id, String(ctx.params.id));
      if (pending && RISKY_TOOLS.has(String(pending.tool))) { const su = await stepUp(ctx, auth); if (su) return su; }
      const done = await approveToolCall(auth.user.id, ctx.params.id);
      if (!done) return deps.fail('TOOL_CALL_NOT_PENDING', 409);
      await deps.audit(auth.user.id, 'owner.mcp.tool.approved', done.status === 'succeeded' ? 'success' : 'failure', { tool: done.tool, callId: done.id });
      return deps.respond({ ok: true, status: done.status });
    }],

    'POST /api/owner/mcp-connector/approvals/:id/reject': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const row = await rejectToolCall(auth.user.id, ctx.params.id);
      if (!row) return deps.fail('TOOL_CALL_NOT_PENDING', 409);
      await deps.audit(auth.user.id, 'owner.mcp.tool.rejected', 'success', { tool: row.tool, callId: row.id });
      return deps.respond({ ok: true });
    }],

    'POST /api/owner/mcp-connector/grants/:id/revoke': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const ok = await c.revokeUserGrant(auth.user.id, ctx.params.id);
      if (ok) await deps.audit(auth.user.id, 'owner.mcp.grant.revoked', 'success', { grantId: ctx.params.id });
      return deps.respond({ ok });
    }],
  };
}
