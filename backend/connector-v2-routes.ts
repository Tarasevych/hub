// Connector v2 — routes van de beheerpagina (mcp.*/agents → «Конектори»). Sessie op mcp.*, goedgekeurd account met API-recht
// (dezelfde poort als de rest van de connector). Technische kant ('beheer') kiezen of houden: alleen de eigenaar met actief technisch
// profiel in dit tabblad (backend/ai-ruimte-poort.ts). Inperken mag altijd; uitbreiden wordt onthouden en vraagt herverbinden.
import { isAgentSlug, type AgentSlug } from '../shared/connector-v2/agenten';
import * as v2 from './connector-v2';
import { leesInstellingen, zetInstellingen } from './connector-v2-store';
import { technischeRuimte } from './ai-ruimte-poort';
import { sterkeMethoden } from './toegang-context';

type Auth = { user: { id: string; email: string; role: string; status: string }; service: string };
type Deps = {
  respond: (data: unknown, status?: number) => any;
  fail: (message: string, status?: number) => any;
  audit: (userId: string, action: string, result: string, details?: Record<string, unknown>) => Promise<unknown>;
  body: (body: unknown) => Record<string, unknown>;
  gate: (event: Record<string, unknown>, body: unknown) => Promise<Auth | null>;
  stepUp: (ctx: unknown, auth: any) => Promise<any | null>;
};

export function v2Routes(deps: Deps) {
  const metAgent = async (ctx: any): Promise<{ auth: Auth; slug: AgentSlug; body: Record<string, unknown> } | { fout: any }> => {
    const auth = await deps.gate(ctx.event, ctx.body);
    if (!auth) return { fout: deps.fail('OWNER_API_SESSION_REQUIRED', 403) };
    const body = deps.body(ctx.body);
    const slug = String(body.agent ?? '');
    if (!isAgentSlug(slug)) return { fout: deps.fail('AGENT_ONBEKEND', 400) };
    return { auth, slug, body };
  };

  return {
    'POST /api/owner/connector-v2/overzicht': [async (ctx: any) => {
      const auth = await deps.gate(ctx.event, ctx.body);
      if (!auth) return deps.fail('OWNER_API_SESSION_REQUIRED', 403);
      const methoden = await sterkeMethoden(auth.user.id).catch(() => ({ passkey: false, totp: false, herstelcode: false }));
      return deps.respond({ ...(await v2.overzicht(auth.user.id)), account: { email: auth.user.email, eigenaar: auth.user.role === 'owner' }, methoden });
    }],

    'POST /api/owner/connector-v2/wijzig': [async (ctx: any) => {
      const r = await metAgent(ctx);
      if ('fout' in r) return r.fout;
      const keuze = v2.keuzeUitVenster(r.body);
      if (keuze.kanten.includes('beheer')) {
        const poort = await technischeRuimte(r.auth.user, r.body);
        if ('fout' in poort) return deps.fail(poort.fout, poort.status);
      }
      const uit = await v2.wijzig(r.auth.user.id, r.slug, keuze);
      await deps.audit(r.auth.user.id, 'owner.connector.v2.gewijzigd', 'success', { agent: r.slug, kanten: keuze.kanten, rechten: keuze.sleutels.length, ingeperkt: uit.ingeperkt, herverbinden: uit.herverbinden });
      return deps.respond({ ok: true, ...uit });
    }],

    // Herverbinden: huidige koppelingen van deze agent intrekken; de keuze blijft bewaard en verschijnt in het nieuwe venster.
    'POST /api/owner/connector-v2/herverbind': [async (ctx: any) => {
      const r = await metAgent(ctx);
      if ('fout' in r) return r.fout;
      const ids = await v2.herverbind(r.auth.user.id, r.slug);
      await deps.audit(r.auth.user.id, 'owner.connector.v2.herverbinden', 'success', { agent: r.slug, ingetrokken: ids.length });
      return deps.respond({ ok: true, ingetrokken: ids.length });
    }],

    'POST /api/owner/connector-v2/intrekken': [async (ctx: any) => {
      const r = await metAgent(ctx);
      if ('fout' in r) return r.fout;
      const id = typeof r.body.id === 'string' && /^[0-9a-f-]{36}$/i.test(r.body.id) ? r.body.id : undefined;
      const ids = await v2.intrekken(r.auth.user.id, r.slug, id);
      for (const g of ids) await deps.audit(r.auth.user.id, 'owner.mcp.grant.revoked', 'success', { grantId: g, agent: r.slug, reason: 'user' });
      return deps.respond({ ok: true, ingetrokken: ids.length });
    }],

    'POST /api/owner/connector-v2/instellingen': [async (ctx: any) => {
      const auth = await deps.gate(ctx.event, ctx.body);
      if (!auth) return deps.fail('OWNER_API_SESSION_REQUIRED', 403);
      const body = deps.body(ctx.body);
      if (typeof body.extraBevestigen === 'boolean') {
        // Uitzetten van een beveiliging vraagt een verse bevestiging; aanzetten niet (veilige richting).
        if (!body.extraBevestigen) { const su = await deps.stepUp(ctx, auth); if (su) return su; }
        await zetInstellingen(auth.user.id, body.extraBevestigen);
        await deps.audit(auth.user.id, 'owner.connector.v2.instellingen', 'success', { extraBevestigen: body.extraBevestigen });
      }
      return deps.respond({ ok: true, instellingen: await leesInstellingen(auth.user.id) });
    }],
  };
}
