// Routes voor de MCP-connector van Claude. De publieke eindpunten (metadata, registratie, autorisatie, token, MCP) staan
// onder /api/mcp-connector/*; server/start.ts koppelt de nette URL's aan Claude (/mcp, /oauth2/*, /.well-known/...) daaraan.
// De routes voor toestemming en beheer vragen een sessie (service mcp) en het recht 'api-platform'.
import { heeftApiRecht } from './api-recht';
import * as c from './mcp-connector';
import { approveToolCall, describeTools, KNOWN_TOOL_NAMES, rejectToolCall, RISKY_TOOLS } from './connectors-tools';
import * as agentStore from './connectors-store';
import { DeurFout, deurBesluit, deurIntrekken, deurVerbindingen, deurVerzoek, internSleutel, isDeurRid, vanDeur } from './mcp-deur-brug';
import { leesDuren, zetDuur } from './ai-verbinding-instellingen';
import { DUREN, KLANTEN, duur as duurVan, isDuurId, klantVan, type KlantId } from '../shared/ai-verbinding';
import { isToegangScope, toegangScope } from '../shared/ai-toegang';
import { leesBeheerUit, leesToegang, zetBeheer, zetToegang } from './ai-toegang';
import { agentTokenVanGebruiker } from './mcp-console';
import { sessieGeverifieerd } from '../server/platform/context';
import { ruimteUitVerzoek, technischeRuimte } from './ai-ruimte-poort';

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

/** Verbinding van deze gebruiker voor de toegangs-tab: 'oauth' = OAuth-grant, 'token' = agenttoken. Anders null. */
async function toegangOnderwerp(userId: string, body: Record<string, unknown>): Promise<{ soort: 'mcp-koppeling' | 'agenttoken'; id: string } | null> {
  const soort = body.soort === 'token' ? 'agenttoken' : body.soort === 'oauth' ? 'mcp-koppeling' : null;
  const id = String(body.id ?? '');
  if (!soort || !/^[0-9a-fA-F-]{8,80}$/.test(id)) return null;
  if (soort === 'mcp-koppeling') {
    const alle = [...(await c.listUserGrants(userId)), ...(await c.listUserGrantHistory(userId))];
    if (!alle.some((g) => g.id === id)) return null;
  } else if (!(await agentTokenVanGebruiker(userId, id))) return null;
  return { soort, id };
}

export function createMcpConnectorRoutes(deps: Deps) {
  const ownerGate = async (event: Record<string, unknown>, body: unknown) => {
    const auth = await deps.requireSession(event, body);
    if ('errorCode' in auth || auth.service !== 'mcp' || auth.user.status !== 'approved') return null;
    if (!heeftApiRecht(auth.user as never)) return null;
    return auth;
  };
  const denied = () => deps.fail('OWNER_API_SESSION_REQUIRED', 403);
  // De MCP-deur (/Grok, /claude, …) geeft serverbrede hulpmiddelen (release, uitrol): alleen de eigenaar van de server.
  const eigenaarGate = async (event: Record<string, unknown>, body: unknown) => {
    const auth = await ownerGate(event, body);
    return auth && auth.user.role === 'owner' ? auth : null;
  };
  const deurFout = (err: unknown) => err instanceof DeurFout
    ? deps.fail(err.code, err.status)
    : deps.fail('DEUR_FOUT', 502);
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
      const rid = ridOf(ctx);
      if (isDeurRid(rid)) {
        if (auth.user.role !== 'owner') return deps.fail('OWNER_REQUIRED', 403);
        try {
          const v = await deurVerzoek(rid);
          if (!v) return deps.fail('CONSENT_EXPIRED', 404);
          const klant = klantVan(v.clientName);
          // De serverdeur is technisch: het venster toont dat, en «Дозволити» werkt alleen vanuit de technische ruimte (zie consent).
          return deps.respond({ ...v, soort: 'deur', ruimte: 'technisch', klant, loopback: v.redirectSoort === 'loopback', duur: (await leesDuren(auth.user.id))[klant], handmatigUrl: `${c.BASE}/oauth/authorize?verzoek=${encodeURIComponent(rid)}` });
        } catch (err) { return deurFout(err); }
      }
      const info = await c.consentInfo(rid, auth.user.id);
      return info ? deps.respond(info) : deps.fail('CONSENT_EXPIRED', 404);
    }],

    'POST /api/owner/mcp-connector/consent': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const body = deps.body(ctx.body);
      const approve = body.approve === true;
      const gekozen = isDuurId(body.duur) ? body.duur : null;
      const rid = ridOf(ctx);
      if (isDeurRid(rid) && auth.user.role !== 'owner') return deps.fail('OWNER_REQUIRED', 403);
      // Ruimte van de verbinding (shared/ai-ruimte.ts): de keuze van de mens op de site. 'technisch' alleen voor de eigenaar met actief
      // technisch profiel in dit tabblad; de serverdeur is altijd technisch. Weigeren mag altijd (veilige richting).
      const poort = approve ? await (isDeurRid(rid) ? technischeRuimte(auth.user, body) : ruimteUitVerzoek(auth.user, body)) : { ruimte: 'prive' as const };
      if ('fout' in poort) return deps.fail(poort.fout, poort.status);
      // H4: toestemming geven (niet weigeren) vraagt een verse aanmelding: tegen consent-phishing met een door een aanvaller gestarte flow.
      if (approve) { const su = await stepUp(ctx, auth); if (su) return su; }
      if (isDeurRid(rid)) {
        try {
          const v = await deurVerzoek(rid);
          if (!v) return deps.fail('CONSENT_EXPIRED', 404);
          const duur = gekozen ?? (await leesDuren(auth.user.id))[klantVan(v.clientName)];
          const out = await deurBesluit(rid, approve, duur, { id: auth.user.id, email: auth.user.email });
          if (!out) return deps.fail('CONSENT_EXPIRED', 404);
          await deps.audit(auth.user.id, approve ? 'owner.mcp.deur.approved' : 'owner.mcp.deur.denied', 'success', { deur: v.deur || 'alle', klant: v.clientName, redirectHost: v.redirectHost, redirectSoort: v.redirectSoort, ...(approve ? { duur } : {}) });
          return deps.respond(out);
        } catch (err) { return deurFout(err); }
      }
      const out = await c.consentDecide(auth.user.id, rid, approve, gekozen, poort.ruimte);
      if ('error' in out) return deps.fail(out.error === 'GRANT_LIMIT' ? 'MCP_GRANT_LIMIT_REACHED' : 'CONSENT_EXPIRED', out.error === 'GRANT_LIMIT' ? 409 : 404);
      await deps.audit(auth.user.id, approve ? 'owner.mcp.grant.approved' : 'owner.mcp.grant.denied', 'success', approve ? { ruimte: poort.ruimte, ...(gekozen ? { duur: gekozen } : {}) } : {});
      return deps.respond(out);
    }],

    // Hoe lang de toegang van elke AI-klant geldt (standaard bij «Дозволити»; in het venster per keer aan te passen).
    'POST /api/owner/mcp-connector/duren': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      // deuren: de eigenaar, en alleen als de deur op deze server draait (zij zet bij elke start haar sleutel neer).
      return deps.respond({ duren: await leesDuren(auth.user.id), opties: DUREN, klanten: KLANTEN, deuren: auth.user.role === 'owner' && !!(await internSleutel()) });
    }],
    'POST /api/owner/mcp-connector/duren/zet': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const body = deps.body(ctx.body);
      const klant = String(body.klant ?? '') as KlantId;
      if (!KLANTEN.some((k) => k.id === klant) || !isDuurId(body.duur)) return deps.fail('DUUR_ONGELDIG', 400);
      // Lange of onbeperkte toegang: verse aanmelding (zoals «Altijd» voor riskante hulpmiddelen).
      if (duurVan(body.duur).lang) { const su = await stepUp(ctx, auth); if (su) return su; }
      await zetDuur(auth.user.id, klant, body.duur);
      await deps.audit(auth.user.id, 'owner.mcp.duur.setting', 'success', { klant, duur: body.duur });
      return deps.respond({ ok: true, duren: await leesDuren(auth.user.id) });
    }],

    // Verbindingen via de MCP-deur (OAuth van de deur zelf): lijst en intrekken. Alleen de eigenaar van de server.
    'POST /api/owner/mcp-connector/deur/verbindingen': [async (ctx: any) => {
      const auth = await eigenaarGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const poort = await technischeRuimte(auth.user, deps.body(ctx.body));
      if ('fout' in poort) return deps.fail(poort.fout, poort.status);
      // Geen deur op deze server (niet geïnstalleerd of gestopt): geen fout, gewoon «niet beschikbaar» (BYOS: de deur is optioneel).
      try { return deps.respond({ verbindingen: await deurVerbindingen(), beschikbaar: true }); }
      catch (err) { return err instanceof DeurFout && err.code === 'DEUR_ONBEREIKBAAR' ? deps.respond({ verbindingen: [], beschikbaar: false }) : deurFout(err); }
    }],
    'POST /api/owner/mcp-connector/deur/intrekken': [async (ctx: any) => {
      const auth = await eigenaarGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const poort = await technischeRuimte(auth.user, deps.body(ctx.body));
      if ('fout' in poort) return deps.fail(poort.fout, poort.status);
      const id = String(deps.body(ctx.body).id ?? '').slice(0, 40);
      try {
        const lijst = await deurVerbindingen();
        const v = lijst.find((x) => x.id === id);
        if (!v || !(await deurIntrekken(id))) return deps.fail('VERBINDING_NIET_GEVONDEN', 404);
        await deps.audit(auth.user.id, 'owner.mcp.deur.revoked', 'success', { verbinding: id, deur: v.deur || 'alle', klant: v.klant });
        return deps.respond({ ok: true });
      } catch (err) { return deurFout(err); }
    }],

    // Intern (zie PUBLIEKE_ROUTES): de MCP-deur vraagt of een agenttoken tvh_… geldig is. Alleen loopback met de sleutel van de deur;
    // alleen tokens van de eigenaar (de deur geeft serverbrede hulpmiddelen). Antwoord zonder persoonsgegevens.
    'POST /api/mcp/deur/token-check': [async (ctx: any) => {
      if (!(await vanDeur(ctx.event?.headers || {}))) return deps.fail('NOT_FOUND', 404);
      sessieGeverifieerd();
      const tok = await c.agentToken(String(deps.body(ctx.body).token ?? ''));
      if (!tok || tok.role !== 'owner') return deps.respond({ ok: false });
      return deps.respond({ ok: true, id: tok.id, naam: tok.name });
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
        // Uitzondering: «Питати щоразу» voor één groep met inclusiefRiskant (bv. «Додатки» aanzetten): elke aanroep wacht dan nog op een klik.
        if (t.risky && body.mode === 'always') continue;
        if (t.risky && body.mode === 'ask' && !(group && body.inclusiefRiskant === true)) continue;
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
      const naam = (await c.listUserGrants(auth.user.id)).find((g) => g.id === ctx.params.id)?.clientName ?? '';
      const ok = await c.revokeUserGrant(auth.user.id, ctx.params.id);
      if (ok) await deps.audit(auth.user.id, 'owner.mcp.grant.revoked', 'success', { grantId: ctx.params.id, clientName: naam, reason: 'user' });
      return deps.respond({ ok });
    }],

    // Gedetailleerde toegang per verbinding (0043, shared/ai-toegang.ts — de enige catalogus):
    // de mens zet scopes per AI («Доступ ШІ»); default-deny, gevoelig pas na bevestiging.
    'POST /api/owner/ai-toegang/overzicht': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const onderwerp = await toegangOnderwerp(auth.user.id, deps.body(ctx.body));
      if (!onderwerp) return deps.fail('TOEGANG_ONBEKEND', 404);
      return deps.respond({ granted: await leesToegang(onderwerp), uit: await leesBeheerUit() });
    }],

    'POST /api/owner/ai-toegang/zet': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      const body = deps.body(ctx.body);
      const onderwerp = await toegangOnderwerp(auth.user.id, body);
      if (!onderwerp) return deps.fail('TOEGANG_ONBEKEND', 404);
      const scopes = Array.isArray(body.scopes) ? (body.scopes as unknown[]).filter((s): s is string => typeof s === 'string') : null;
      if (!scopes || scopes.some((s) => !isToegangScope(s))) return deps.fail('TOEGANG_SCOPE_ONBEKEND', 400);
      // Gevoelige scopes (mail, foto's) aanzetten vraagt een expliciete bevestiging (de UI doet dit in twee stappen).
      const oud = await leesToegang(onderwerp);
      if (scopes.filter((s) => toegangScope(s)?.gevoelig && !oud.includes(s)).length && body.bevestigd !== true) {
        return deps.fail('TOEGANG_BEVESTIGING_VEREIST', 409);
      }
      const bewaard = await zetToegang(auth.user.id, onderwerp, scopes);
      await deps.audit(auth.user.id, 'owner.mcp.toegang.gezet', 'success', { soort: onderwerp.soort, onderwerp: onderwerp.id, scopes: bewaard });
      return deps.respond({ ok: true, granted: bewaard });
    }],

    // Bestuurlijk plafond voor de hele site (alleen de eigenaar): een uitgeschakelde scope weigert de backend
    // ook met een oude grantrij; de tab verbergt of blokkeert hem.
    'POST /api/owner/ai-toegang/beheer': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      return deps.respond({ uit: await leesBeheerUit() });
    }],

    'POST /api/owner/ai-toegang/beheer/zet': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth) return denied();
      if (auth.user.role !== 'owner') return deps.fail('OWNER_REQUIRED', 403);
      const body = deps.body(ctx.body);
      const scope = String(body.scope ?? '');
      if (!isToegangScope(scope)) return deps.fail('TOEGANG_SCOPE_ONBEKEND', 400);
      const uit = body.uit !== false;
      await zetBeheer(scope, uit);
      await deps.audit(auth.user.id, 'owner.mcp.toegang.beheer', 'success', { scope, uit });
      return deps.respond({ ok: true, uit: await leesBeheerUit() });
    }],
  };
}
