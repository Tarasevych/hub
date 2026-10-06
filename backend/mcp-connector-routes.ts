// Routes voor de MCP-connector van Claude. De publieke eindpunten (metadata, registratie, autorisatie, token, MCP) staan
// onder /api/mcp-connector/*; server/start.ts koppelt de nette URL's aan Claude (/mcp, /oauth2/*, /.well-known/...) daaraan.
// De routes voor toestemming en beheer vragen een sessie (service mcp) en het recht 'api-platform'.
import { heeftApiRecht } from './api-recht';
import * as c from './mcp-connector';

type SessionAuth = { errorCode: string } | { user: { id: string; email: string; role: string; status: string }; service: string };
type Deps = {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionAuth>;
  respond: (data: unknown, status?: number) => unknown;
  fail: (message: string, status?: number) => unknown;
  audit: (userId: string, action: string, result: string, details?: Record<string, unknown>) => Promise<unknown>;
  body: (body: unknown) => Record<string, unknown>;
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

    'POST /api/owner/mcp-connector/grants/:id/revoke': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const ok = await c.revokeUserGrant(auth.user.id, ctx.params.id);
      if (ok) await deps.audit(auth.user.id, 'owner.mcp.grant.revoked', 'success', { grantId: ctx.params.id });
      return deps.respond({ ok });
    }],
  };
}
