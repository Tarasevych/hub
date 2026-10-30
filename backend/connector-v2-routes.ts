// Connector v2 — routes van de beheerpagina (mcp.*/agents → «Конектори»). Sessie op mcp.*, goedgekeurd account met API-recht
// (dezelfde poort als de rest van de connector).
//
// Technische kant ('beheer') kiezen of houden: alleen de EIGENAAR. Sinds 20.10.2026 (levende rechten) hoort daar géén actief
// technisch profiel meer bij, net als in het toestemmingsvenster: wat hier wordt gekozen zijn MOGELIJKHEDEN («mag technische
// hulpmiddelen tonen zolang mijn technische profiel actief is»), geen toegang. De toegang zelf wordt bij elke tools/list en
// tools/call opnieuw berekend (backend/ai-ruimte-poort.ts → effectieveRuimte). Inperken mag altijd; uitbreiden wordt onthouden
// en vraagt herverbinden.
import { isAgentSlug, V2_AGENTEN, type AgentSlug } from '../shared/connector-v2/agenten';
import { V2_GROEPEN, type GroepId } from '../shared/connector-v2/catalogus';
import { isKant, isModus } from '../shared/connector-v2/rechten';
import { vraagtSterkeBevestiging } from '../shared/connector-v2/massa';
import * as v2 from './connector-v2';
import { leesInstellingen, zetInstellingen } from './connector-v2-opslag';
import { isEigenaar } from './tech-profiel';
import { sterkeMethoden } from './toegang-context';
import { weigerCode, type RechtWeigering } from './api-recht';

type Auth = { user: { id: string; email: string; role: string; status: string }; service: string };
type Deps = {
  respond: (data: unknown, status?: number) => any;
  fail: (message: string, status?: number) => any;
  audit: (userId: string, action: string, result: string, details?: Record<string, unknown>) => Promise<unknown>;
  body: (body: unknown) => Record<string, unknown>;
  gate: (event: Record<string, unknown>, body: unknown) => Promise<Auth | RechtWeigering | null>;
  stepUp: (ctx: unknown, auth: any) => Promise<any | null>;
};

export function v2Routes(deps: Deps) {
  const metAgent = async (ctx: any): Promise<{ auth: Auth; slug: AgentSlug; body: Record<string, unknown> } | { fout: any }> => {
    const auth = await deps.gate(ctx.event, ctx.body);
    if (!auth || 'errorCode' in auth) return { fout: deps.fail(weigerCode(auth), 403) };
    const body = deps.body(ctx.body);
    const slug = String(body.agent ?? '');
    if (!isAgentSlug(slug)) return { fout: deps.fail('AGENT_ONBEKEND', 400) };
    return { auth, slug, body };
  };

  return {
    'POST /api/owner/connector-v2/overzicht': [async (ctx: any) => {
      const auth = await deps.gate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return deps.fail(weigerCode(auth), 403);
      const methoden = await sterkeMethoden(auth.user.id).catch(() => ({ passkey: false, totp: false, herstelcode: false }));
      return deps.respond({ ...(await v2.overzicht(auth.user.id)), account: { email: auth.user.email, eigenaar: auth.user.role === 'owner' }, methoden });
    }],

    'POST /api/owner/connector-v2/wijzig': [async (ctx: any) => {
      const r = await metAgent(ctx);
      if ('fout' in r) return r.fout;
      const keuze = v2.keuzeUitVenster(r.body);
      if (keuze.kanten.includes('beheer') && !isEigenaar(r.auth.user)) return deps.fail('OWNER_REQUIRED', 403);
      const uit = await v2.wijzig(r.auth.user.id, r.slug, keuze);
      await deps.audit(r.auth.user.id, 'owner.connector.v2.gewijzigd', 'success', { agent: r.slug, kanten: keuze.kanten, rechten: keuze.sleutels.length, ingeperkt: uit.ingeperkt, herverbinden: uit.herverbinden });
      return deps.respond({ ok: true, ...uit });
    }],

    // Massale wijziging («Пришвидшене керування»): dezelfde modus op meerdere agents tegelijk. `voorbeeld: true` rekent alleen uit
    // (de samenvatting in het venster); zonder voorbeeld wordt opgeslagen. Uitbreiden of «alle acties» vraagt een verse bevestiging
    // (passkey, STEP_UP_REQUIRED → de browser vraagt hem en herhaalt dit verzoek); inperken (lezen/geen) niet. De technische kant
    // alleen voor de eigenaar, net als bij één agent (levende rechten: het profiel beslist bij de aanroep, niet hier).
    'POST /api/owner/connector-v2/massa': [async (ctx: any) => {
      const auth = await deps.gate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return deps.fail(weigerCode(auth), 403);
      const body = deps.body(ctx.body);
      const alle = V2_AGENTEN.map((a) => a.slug);
      const slugs: AgentSlug[] = body.agenten === 'alle' ? alle : Array.isArray(body.agenten) ? [...new Set(body.agenten.filter(isAgentSlug))] : [];
      if (!slugs.length) return deps.fail('AGENT_ONBEKEND', 400);
      if (!isModus(body.modus)) return deps.fail('MODUS_ONGELDIG', 400);
      const kanten = Array.isArray(body.kanten) ? [...new Set(body.kanten.filter(isKant))] : [];
      const groep = typeof body.groep === 'string' && V2_GROEPEN.some((g) => g.id === body.groep) ? body.groep as GroepId : undefined;
      const inv = { modus: body.modus, kanten: kanten.length ? kanten : ['gebruiker' as const], ...(groep ? { groep } : {}) };
      if (inv.kanten.includes('beheer') && inv.modus !== 'geen' && !isEigenaar(auth.user)) return deps.fail('OWNER_REQUIRED', 403);
      const voorbeeld = await v2.massaVoorbeeld(auth.user.id, slugs, inv);
      const samenvatting = voorbeeld.map(({ sleutels: _s, ...rest }) => rest);
      if (body.voorbeeld === true) return deps.respond({ ok: true, voorbeeld: true, agenten: samenvatting });
      if (vraagtSterkeBevestiging(inv, voorbeeld)) { const su = await deps.stepUp(ctx, auth); if (su) return su; }
      const gedaan = await v2.massaToepassen(auth.user.id, voorbeeld);
      await deps.audit(auth.user.id, 'owner.connector.v2.massa', 'success', { agenten: slugs, modus: inv.modus, kanten: inv.kanten, groep: groep ?? null, gewijzigd: gedaan.filter((g) => g.gewijzigd).length });
      return deps.respond({ ok: true, agenten: samenvatting, resultaat: gedaan });
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
      if (!auth || 'errorCode' in auth) return deps.fail(weigerCode(auth), 403);
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
