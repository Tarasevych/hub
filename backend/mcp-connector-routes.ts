// Routes voor de MCP-connector van Claude. De publieke eindpunten (metadata, registratie, autorisatie, token, MCP) staan
// onder /api/mcp-connector/*; server/start.ts koppelt de nette URL's aan Claude (/mcp, /oauth2/*, /.well-known/...) daaraan.
// De routes voor toestemming en beheer vragen een sessie (service mcp) en het recht 'api-platform'.
import { GEEN_RECHT, heeftApiRecht, weigerCode } from './api-recht';
import * as c from './mcp-connector';
import { bindingKlopt } from './mcp-oauth-binding';
import { approveToolCall, describeTools, KNOWN_TOOL_NAMES, rejectToolCall, RISKY_TOOLS } from './connectors-hulpmiddelen';
import * as agentStore from './connectors-opslag';
import { DeurFout, deurBesluit, deurIntrekken, deurVerbindingen, deurVerzoek, internSleutel, isDeurRid, vanDeur } from './mcp-deur-brug';
import { leesDuren, zetDuur } from './ai-verbinding-instellingen';
import { DUREN, KLANTEN, duur as duurVan, isDuurId, klantVan, type KlantId } from '../shared/ai-verbinding';
import { isToegangScope, toegangScope } from '../shared/ai-toegang';
import { agentVoorKlant, isAgentSlug } from '../shared/connector-v2/agenten';
import { bordOnderwerp, geefStandaard, isPriveOudeGrant, leesBeheerUit, leesToegang, zetBeheer, zetToegang } from './ai-toegang';
import { meldLijstGewijzigd } from './connector-v2-stroom';
import { agentTokenVanGebruiker, issuePriveToken } from './mcp-console';
import { sessieGeverifieerd } from '../server/platform/context';
import { meldBeveiligingsWijzigingBeperkt } from './beveiliging-meldingen';
import * as v2 from './connector-v2';
import { v2Routes } from './connector-v2-routes';
import { sterkeMethoden, sterkeStapOpFout } from './toegang-context';
import { leesInstellingen } from './connector-v2-opslag';
import { aiPoortNu, aiVerbindingRuimte, technischeRuimte } from './ai-ruimte-poort';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';
import { isEigenaar } from './tech-profiel';
import { leesStand } from './ai-beleid';
import { bulkAltijdToegestaan } from '../shared/mcp-hulpmiddel-gevaar'; // SEC-002 interface-03
import { leesGebruikerCaps, leesStaat, zetGebruikerCap, zetStaat } from './ai-site-schakelaars';
import {
  BORD_AGENTEN, MCP_URL, PRIVE_CAPS, SITE_REGEL, SITE_UMOVY, agentAan, connectGeweigerd, isBordKlant, isPriveCap, isSiteSleutel, methodeAan, tabsVoor,
} from '../shared/ai-agent-bord';

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

/**
 * Verbinding voor de toegangs-tab, met haar ruimte. agent ≠ null = connector-v2-koppeling: haar rechten staan per hulpmiddel in
 * connector_v2_rechten (de scopelaag volgt die, v2st.zetRechten) en worden alleen op de agentpagina gewijzigd.
 */
type ToegangDoel = { soort: 'mcp-koppeling' | 'agenttoken'; id: string; ruimte: AiRuimte; agent: string | null };

/** Verbinding van deze gebruiker voor de toegangs-tab: 'oauth' = OAuth-grant (of bord:<klant>), 'token' = agenttoken. Anders null. */
async function toegangOnderwerp(userId: string, body: Record<string, unknown>): Promise<ToegangDoel | null> {
  const soort = body.soort === 'token' ? 'agenttoken' : body.soort === 'oauth' ? 'mcp-koppeling' : null;
  const id = String(body.id ?? '');
  if (!soort) return null;
  if (soort === 'mcp-koppeling' && id.startsWith('bord:')) {
    const klant = id.slice(5);
    if (!isBordKlant(klant)) return null;
    // De nieuwste actieve PRIVÉ /mcp-grant van deze klant staat voor het bord; technisch en v2 nooit (eigen rechten).
    try {
      const actief = (await c.listUserGrants(userId)).find((g) => isPriveOudeGrant(g) && klantVan(g.clientName) === klant);
      if (actief) return { soort: 'mcp-koppeling', id: actief.id, ruimte: 'prive', agent: null };
    } catch { /* fallback naar bord-onderwerp */ }
    const bord = bordOnderwerp(userId, klant);
    if (!bord) return null;
    await geefStandaard(userId, bord, 'prive').catch(() => undefined);
    return { soort: 'mcp-koppeling', id: bord.id, ruimte: 'prive', agent: null };
  }
  if (!/^[0-9a-fA-F-]{8,80}$/.test(id)) return null;
  if (soort === 'mcp-koppeling') {
    const alle = [...(await c.listUserGrants(userId)), ...(await c.listUserGrantHistory(userId))];
    const g = alle.find((x) => x.id === id);
    return g ? { soort, id, ruimte: ruimteOf(g.ruimte), agent: g.agent ?? null } : null;
  }
  const token = await agentTokenVanGebruiker(userId, id);
  return token ? { soort, id, ruimte: token.ruimte, agent: null } : null;
}

export function createMcpConnectorRoutes(deps: Deps) {
  const ownerGate = async (event: Record<string, unknown>, body: unknown) => {
    const auth = await deps.requireSession(event, body);
    if ('errorCode' in auth || auth.service !== 'mcp' || auth.user.status !== 'approved') return null;
    if (!heeftApiRecht(auth.user as never)) return GEEN_RECHT;
    return auth;
  };
  // Audit 19.10 (U-03): geldige sessie zonder recht → API_RECHT_VEREIST; anders OWNER_API_SESSION_REQUIRED.
  const denied = (auth?: unknown) => deps.fail(weigerCode(auth), 403);
  // Дошка на ai.* або mcp.*: схвалений обліковий запис. Не послаблює ownerGate серверних інструментів.
  const accountGate = async (event: Record<string, unknown>, body: unknown) => {
    const auth = await deps.requireSession(event, body);
    if ('errorCode' in auth || (auth.service !== 'ai' && auth.service !== 'mcp') || auth.user.status !== 'approved') return null;
    return auth;
  };
  const siteGate = async (event: Record<string, unknown>, body: unknown) => {
    const auth = await ownerGate(event, body);
    if (!auth || 'errorCode' in auth || auth.user.role !== 'owner') return null;
    const poort = await technischeRuimte(auth.user, deps.body(body));
    if ('fout' in poort) return null;
    return auth;
  };
  // De MCP-deur (/Grok, /claude, …) geeft serverbrede hulpmiddelen (release, uitrol): alleen de eigenaar van de server.
  const eigenaarGate = async (event: Record<string, unknown>, body: unknown) => {
    const auth = await ownerGate(event, body);
    return auth && !('errorCode' in auth) && auth.user.role === 'owner' ? auth : null;
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
    'GET /api/mcp-connector/server-card': [async () => c.serverCardMetadata()],
    'GET /api/mcp-connector/registry-server': [async () => c.registryServerMetadata()],
    'POST /api/mcp-connector/register': [async (ctx: any) => c.registerClient(String(ctx.event.body || ''), String(ctx.event?.requestContext?.http?.sourceIp || ''))],
    'GET /api/mcp-connector/authorize': [async (ctx: any) => c.authorize(ctx.query, String(ctx.event?.requestContext?.http?.sourceIp || ''))], // SEC-002 (slot m): IP voor de CIMD-grenzen
    'POST /api/mcp-connector/token': [async (ctx: any) => c.token(String(ctx.event.body || ''))],
    'POST /api/mcp-connector/revoke': [async (ctx: any) => c.revoke(String(ctx.event.body || ''))],
    'POST /api/mcp-connector/rpc':[async (ctx: any) => c.rpcPost(header(ctx.event, 'authorization'), String(ctx.event.body || ''), header(ctx.event, 'mcp-protocol-version'))],
    'GET /api/mcp-connector/rpc': [async () => c.rpcNotAllowed()],
    'DELETE /api/mcp-connector/rpc': [async (ctx: any) => c.rpcDelete(header(ctx.event, 'authorization'))],
    'OPTIONS /api/mcp-connector/rpc': [async () => c.rpcOptions()],
    // Connector v2: eigen adres per agent (server/start.ts zet /<agent> om naar deze routes; het oude /ai/<agent> krijgt 308).
    'POST /api/connector-v2/:agent/rpc': [async (ctx: any) => v2.rpc(String(ctx.params.agent || ''), header(ctx.event, 'authorization'), String(ctx.event.body || ''), header(ctx.event, 'mcp-protocol-version'))],
    'GET /api/connector-v2/:agent/rpc': [async () => c.rpcNotAllowed()],
    'DELETE /api/connector-v2/:agent/rpc': [async (ctx: any) => v2.rpcDelete(String(ctx.params.agent || ''), header(ctx.event, 'authorization'))],
    'OPTIONS /api/connector-v2/:agent/rpc': [async () => c.rpcOptions()],
    'GET /api/connector-v2/:agent/prm': [async (ctx: any) => { const a = String(ctx.params.agent || ''); return isAgentSlug(a) ? v2.prm(a) : deps.fail('AGENT_ONBEKEND', 404); }],

    // ---- toestemming en beheer door de ingelogde gebruiker ----
    'POST /api/owner/mcp-connector/consent/info': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const rid = ridOf(ctx);
      if (isDeurRid(rid)) {
        if (auth.user.role !== 'owner') return deps.fail('OWNER_REQUIRED', 403);
        try {
          const v = await deurVerzoek(rid);
          if (!v) return deps.fail('CONSENT_EXPIRED', 404);
          // SEC-002 (ai-mcp-14, toets g10e-toets-5): ook de deur alleen vanuit de browser die de autorisatie begon.
          if (!bindingKlopt(rid, v.bindingHash, header(ctx.event, 'cookie'))) { await deps.audit(auth.user.id, 'owner.mcp.deur.binding', 'denied', { reden: 'andere-browser' }).catch(() => undefined); await meldBeveiligingsWijzigingBeperkt(auth.user.id, 'consent-andere-browser').catch(() => undefined); return deps.fail('CONSENT_ANDERE_BROWSER', 409); }
          const klant = klantVan(v.clientName);
          // De serverdeur is technisch: het venster toont dat, en «Дозволити» werkt alleen vanuit de technische ruimte (zie consent).
          return deps.respond({ ...v, bindingHash: undefined, soort: 'deur', ruimte: 'technisch', klant, loopback: v.redirectSoort === 'loopback', duur: (await leesDuren(auth.user.id))[klant], handmatigUrl: `${c.BASE}/oauth/authorize?verzoek=${encodeURIComponent(rid)}` });
        } catch (err) { return deurFout(err); }
      }
      // SEC-002 (ai-mcp-14): alleen de browser die de autorisatie begon (bindingscookie van /oauth2/authorize).
      if (!(await c.consentBindingKlopt(rid, header(ctx.event, 'cookie')))) {
        // SEC-002 (slot s, eind-interface 4): ook het OPENEN in een andere browser laat een spoor na (journaal + melding, één per uur).
        await deps.audit(auth.user.id, 'owner.mcp.grant.binding', 'denied', { reden: 'andere-browser', stap: 'openen' }).catch(() => undefined);
        await meldBeveiligingsWijzigingBeperkt(auth.user.id, 'consent-andere-browser').catch(() => undefined);
        return deps.fail('CONSENT_ANDERE_BROWSER', 409);
      }
      const info = await c.consentInfo(rid, auth.user.id);
      if (!info) return deps.fail('CONSENT_EXPIRED', 404);
      // Connector v2: het venster in stappen heeft het account, de keuzes van vorige keer en de sterke aanmeldmanieren nodig.
      if (info.agent) {
        const methoden = await sterkeMethoden(auth.user.id).catch(() => ({ passkey: false, totp: false, herstelcode: false }));
        return deps.respond({ ...info, v2: {
          ...(await v2.consentV2(auth.user.id, info.agent)),
          account: { email: auth.user.email, rol: auth.user.role, eigenaar: auth.user.role === 'owner' },
          methoden,
        } });
      }
      return deps.respond(info);
    }],

    'POST /api/owner/mcp-connector/consent': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const body = deps.body(ctx.body);
      const approve = body.approve === true;
      const gekozen = isDuurId(body.duur) ? body.duur : null;
      const rid = ridOf(ctx);
      if (isDeurRid(rid) && auth.user.role !== 'owner') return deps.fail('OWNER_REQUIRED', 403);
      // Ruimte van de verbinding (shared/ai-ruimte.ts): de keuze van de mens op de site. 'technisch' alleen voor de eigenaar met actief
      // technisch profiel in dit tabblad; de serverdeur is altijd technisch. Weigeren mag altijd (veilige richting).
      //
      // Connector v2 (20.10.2026, levende rechten): de mens geeft deze connector MOGELIJKHEDEN, geen kamer. Toestemming geven vraagt
      // daarom geen actief technisch profiel meer — wie technische hulpmiddelen aanvinkt, geeft ze «voor zolang mijn technische profiel
      // actief is», en de server kijkt bij elke tools/list en tools/call opnieuw (backend/ai-ruimte-poort.ts → effectieveRuimte,
      // backend/connector-v2.ts). De EIGENAARSEIS blijft wél staan op dit moment: niemand anders kan _beheer-rechten geven.
      // SEC-002 (ai-mcp-14): ook toestemming en weigering alleen vanuit de browser die de autorisatie begon.
      if (!isDeurRid(rid) && !(await c.consentBindingKlopt(rid, header(ctx.event, 'cookie')))) {
        await deps.audit(auth.user.id, 'owner.mcp.grant.binding', 'denied', { reden: 'andere-browser', stap: 'besluit' }).catch(() => undefined);
        await meldBeveiligingsWijzigingBeperkt(auth.user.id, 'consent-andere-browser').catch(() => undefined);
        return deps.fail('CONSENT_ANDERE_BROWSER', 409);
      }
      const v2Info = !isDeurRid(rid) ? await c.consentInfo(rid) : null;
      const v2Keuze = v2Info?.agent && approve ? v2.keuzeUitVenster(body) : null;
      const poort = approve
        ? await (isDeurRid(rid) ? technischeRuimte(auth.user, body)
          : v2Keuze ? (v2Keuze.kanten.includes('beheer') && !isEigenaar(auth.user)
            ? { fout: 'OWNER_REQUIRED' as const, status: 403 as const }
            : { ruimte: 'prive' as const })
          // Een technische grant op het oude /mcp is een NIEUWE technische AI-verbinding: ondergeschikt aan de stand van de
          // dienst «ai» in de technische gegevensruimte (backend/ai-ruimte-poort.ts → aiVerbindingRuimte).
          : aiVerbindingRuimte(auth.user, body))
        : { ruimte: 'prive' as const };
      if ('fout' in poort) return deps.fail(poort.fout, poort.status);
      // Kolom `ruimte` op de grant (mcp_oauth_tokens.ruimte): voor connector v2 is dat vanaf 20.10.2026 ALTIJD 'prive'. Niet omdat de
      // connector privé zou zijn, maar omdat de kamer geen eigenschap van de koppeling meer is: `connector_v2_rechten.kanten` zegt wat de
      // mens toestond en `effectieveRuimte` zegt wat er nu geldt. Dat heeft twee voordelen: het oude veld kan de filtering nergens meer
      // beïnvloeden, en de sitebrede schakelaars (connectGeweigerd hieronder, die alleen bij 'prive' meekijken) gelden nu voor ELKE
      // v2-koppeling in plaats van alleen voor die met een privékant. Het oude /mcp houdt zijn eigen keuze: daar is de ruimte nog een
      // eigenschap van de grant, en ze werkt daar alleen beperkend (een technische grant verliest zijn hulpmiddelen zonder actief profiel,
      // een privé-grant krijgt er nooit technische bij).
      const ruimte = v2Keuze ? 'prive' as const : poort.ruimte;
      // H4: toestemming geven (niet weigeren) vraagt een verse aanmelding: tegen consent-phishing met een door een aanvaller gestarte flow.
      // v2 + «extra bevestiging» in de instellingen: passkey of app-code (Google alleen telt dan niet, als de gebruiker die manieren heeft).
      if (approve) {
        if (v2Keuze && (await leesInstellingen(auth.user.id)).extraBevestigen) { const f = await sterkeStapOpFout(auth as never); if (f) return deps.fail(f, 403); }
        const su = await stepUp(ctx, auth); if (su) return su;
      }
      if (isDeurRid(rid)) {
        try {
          const v = await deurVerzoek(rid);
          if (!v) return deps.fail('CONSENT_EXPIRED', 404);
          // SEC-002 (ai-mcp-14, toets g10e-toets-5): ook de deur alleen vanuit de browser die de autorisatie begon.
          if (!bindingKlopt(rid, v.bindingHash, header(ctx.event, 'cookie'))) { await deps.audit(auth.user.id, 'owner.mcp.deur.binding', 'denied', { reden: 'andere-browser' }).catch(() => undefined); await meldBeveiligingsWijzigingBeperkt(auth.user.id, 'consent-andere-browser').catch(() => undefined); return deps.fail('CONSENT_ANDERE_BROWSER', 409); }
          const duur = gekozen ?? (await leesDuren(auth.user.id))[klantVan(v.clientName)];
          const out = await deurBesluit(rid, approve, duur, { id: auth.user.id, email: auth.user.email });
          if (!out) return deps.fail('CONSENT_EXPIRED', 404);
          await deps.audit(auth.user.id, approve ? 'owner.mcp.deur.approved' : 'owner.mcp.deur.denied', 'success', { deur: v.deur || 'alle', klant: v.clientName, redirectHost: v.redirectHost, redirectSoort: v.redirectSoort, ...(approve ? { duur } : {}) });
          return deps.respond(out);
        } catch (err) { return deurFout(err); }
      }
      const out = await c.consentDecide(auth.user.id, rid, approve, gekozen, ruimte, v2Keuze);
      if ('error' in out) {
        if (out.error === 'GRANT_LIMIT') return deps.fail('MCP_GRANT_LIMIT_REACHED', 409);
        if (out.error === 'EXPIRED') return deps.fail('CONSENT_EXPIRED', 404);
        return deps.fail(out.error, 403);
      }
      await deps.audit(auth.user.id, approve ? 'owner.mcp.grant.approved' : 'owner.mcp.grant.denied', 'success', approve ? { ruimte, ...(gekozen ? { duur: gekozen } : {}), ...(v2Keuze && v2Info?.agent ? { agent: v2Info.agent, kanten: v2Keuze.kanten, rechten: v2Keuze.sleutels.length } : {}) } : {});
      return deps.respond(out);
    }],

    // Hoe lang de toegang van elke AI-klant geldt (standaard bij «Дозволити»; in het venster per keer aan te passen).
    'POST /api/owner/mcp-connector/duren': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      // deuren: de eigenaar, en alleen als de deur op deze server draait (zij zet bij elke start haar sleutel neer).
      return deps.respond({ duren: await leesDuren(auth.user.id), opties: DUREN, klanten: KLANTEN, deuren: auth.user.role === 'owner' && !!(await internSleutel()) });
    }],
    'POST /api/owner/mcp-connector/duren/zet': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
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
      if (!auth || 'errorCode' in auth) return denied(auth);
      const poort = await technischeRuimte(auth.user, deps.body(ctx.body));
      if ('fout' in poort) return deps.fail(poort.fout, poort.status);
      // Geen deur op deze server (niet geïnstalleerd of gestopt): geen fout, gewoon «niet beschikbaar» (BYOS: de deur is optioneel).
      try { return deps.respond({ verbindingen: await deurVerbindingen(), beschikbaar: true }); }
      catch (err) { return err instanceof DeurFout && err.code === 'DEUR_ONBEREIKBAAR' ? deps.respond({ verbindingen: [], beschikbaar: false }) : deurFout(err); }
    }],
    'POST /api/owner/mcp-connector/deur/intrekken': [async (ctx: any) => {
      const auth = await eigenaarGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
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
      // SEC-002 (ai-mcp-07): de deur is TECHNISCH (serverbrede hulpmiddelen). Een privétoken (dashboard-token is altijd 'prive') gaat
      // er nooit door, en een technisch token alleen zolang het technische profiel en de dienst «ai» nu leven (aiPoortNu).
      if (ruimteOf(tok.ruimte) !== 'technisch' || (await aiPoortNu(tok.user_id).catch(() => ({ ruimte: 'prive' as const }))).ruimte !== 'technisch') {
        await deps.audit(tok.user_id, 'owner.mcp.deur.token', 'denied', { reden: ruimteOf(tok.ruimte) !== 'technisch' ? 'prive-token' : 'technisch-profiel-uit', token: String(tok.id).slice(0, 60) }).catch(() => undefined);
        return deps.respond({ ok: false });
      }
      return deps.respond({ ok: true, id: tok.id, naam: tok.name });
    }],

    'POST /api/owner/mcp-connector/grants': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      return deps.respond({ grants: await c.listUserGrants(auth.user.id), url: c.RESOURCE });
    }],

    'POST /api/owner/mcp-connector/tools': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      return deps.respond({ tools: await describeTools(auth.user.id) });
    }],

    // De modus van een hulpmiddel zetten: "always" (geen extra vraag), "ask" (elke aanroep wacht op een klik op de site) of "off" (weg uit
    // tools/list en geweigerd bij aanroep). Riskante hulpmiddelen (RISKY_TOOLS) staan standaard uit; de gebruiker mag ze zelf op elke modus zetten.
    // Oude vorm {name, enabled: boolean} blijft werken: aan = standaardmodus, uit = off.
    'POST /api/owner/mcp-connector/tools/set': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
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
      meldLijstGewijzigd(auth.user.id);
      await deps.audit(auth.user.id, 'owner.mcp.tool.setting', 'success', { tool: name, mode: mode ?? 'default' });
      return deps.respond({ ok: true, tools: await describeTools(auth.user.id) });
    }],

    // "Set all tools": een modus voor alle hulpmiddelen tegelijk (of een groep). 'default' = terug naar de standaard van elk hulpmiddel.
    'POST /api/owner/mcp-connector/tools/set-all': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const body = deps.body(ctx.body);
      if (typeof body.mode !== 'string' || !['always', 'ask', 'off', 'default'].includes(body.mode)) return deps.fail('TOOL_SETTING_INVALID', 400);
      const group = body.group === undefined ? '' : String(body.group);
      const all = await describeTools(auth.user.id);
      const changes: Record<string, 'always' | 'ask' | 'off' | null> = {};
      for (const t of all) {
        if (group && t.group !== group) continue;
        // Een bulkactie "Altijd"/"Vragen" laat riskante hulpmiddelen ongemoeid: die zet de gebruiker bewust één voor één.
        // Uitzondering: «Питати щоразу» voor één groep met inclusiefRiskant (bv. «Додатки» aanzetten): elke aanroep wacht dan nog op een klik.
        // SEC-002 (interface-03): «Altijd» in bulk alleen voor hulpmiddelen die lezen of navigeren — niet meer ook voor alles wat
        // schrijft, verwijdert of namens de mens handelt (mail naar prullenbak, GitHub-issues, afspraken …): die één voor één.
        if (body.mode === 'always' && !bulkAltijdToegestaan(t)) continue;
        if (t.risky && body.mode === 'ask' && !(group && body.inclusiefRiskant === true)) continue;
        changes[t.name] = body.mode === 'default' ? null : (body.mode as 'always' | 'ask' | 'off');
      }
      await agentStore.setToolModes(auth.user.id, changes);
      meldLijstGewijzigd(auth.user.id);
      await deps.audit(auth.user.id, 'owner.mcp.tool.setting_all', 'success', { mode: body.mode, group: group || 'all', tools: Object.keys(changes).length });
      return deps.respond({ ok: true, tools: await describeTools(auth.user.id) });
    }],

    // Aanroepen van site-hulpmiddelen die op goedkeuring wachten (modus "ask"), plus de laatste uitkomsten.
    'POST /api/owner/mcp-connector/approvals': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const rows = await agentStore.listToolCalls(auth.user.id, 20);
      return deps.respond({
        calls: rows.map((r: any) => ({
          id: r.id, tool: r.tool, args: r.args, status: r.status, createdAt: new Date(r.created_at).getTime(),
          preview: r.result?.content?.[0]?.text ? String(r.result.content[0].text).slice(0, 400) : '',
          aanvrager: agentStore.aanvragerVoorScherm(r), // SEC-002 interface-02: WIE vroeg dit (geen vaste «Claude» meer op het scherm)
        })),
      });
    }],

    'POST /api/owner/mcp-connector/approvals/:id/approve': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const pending = await agentStore.getToolCall(auth.user.id, String(ctx.params.id));
      if (pending && RISKY_TOOLS.has(String(pending.tool))) { const su = await stepUp(ctx, auth); if (su) return su; }
      const done = await approveToolCall(auth.user.id, ctx.params.id);
      if (!done) return deps.fail('TOOL_CALL_NOT_PENDING', 409);
      await deps.audit(auth.user.id, 'owner.mcp.tool.approved', done.status === 'succeeded' ? 'success' : 'failure', { tool: done.tool, callId: done.id });
      return deps.respond({ ok: true, status: done.status });
    }],

    'POST /api/owner/mcp-connector/approvals/:id/reject': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const row = await rejectToolCall(auth.user.id, ctx.params.id);
      if (!row) return deps.fail('TOOL_CALL_NOT_PENDING', 409);
      await deps.audit(auth.user.id, 'owner.mcp.tool.rejected', 'success', { tool: row.tool, callId: row.id });
      return deps.respond({ ok: true });
    }],

    'POST /api/owner/mcp-connector/grants/:id/revoke': [async (ctx: any) => {
      const auth = await ownerGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const naam = (await c.listUserGrants(auth.user.id)).find((g) => g.id === ctx.params.id)?.clientName ?? '';
      const ok = await c.revokeUserGrant(auth.user.id, ctx.params.id);
      if (ok) await deps.audit(auth.user.id, 'owner.mcp.grant.revoked', 'success', { grantId: ctx.params.id, clientName: naam, reason: 'user' });
      return deps.respond({ ok });
    }],

    // Дошка підключення ШІ на ai.* (і закладка mcp, доки її не переадресовано). Лише приватний каталог.
    'POST /api/owner/ai-bord': [async (ctx: any) => {
      const auth = await accountGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const staat = await leesStaat();
      const beleid = await leesStand().catch(() => ({ staat: 'niet-ingesteld' as const }));
      return deps.respond({
        agenten: BORD_AGENTEN.map((a) => ({ ...a, aan: agentAan(staat, a.id), tabs: tabsVoor(a.id, staat) })),
        caps: PRIVE_CAPS.map((cap) => ({ ...cap, aanSite: staat.cap[cap.id] !== false })),
        gebruiker: await leesGebruikerCaps(auth.user.id),
        methoden: { mcp: methodeAan(staat, 'mcp'), token: methodeAan(staat, 'token') },
        beleidStaat: beleid.staat,
        mcpUrl: MCP_URL,
        umovy: SITE_UMOVY,
        regel: SITE_REGEL.uk,
      });
    }],

    // Приватний токен з дошки. Технічний простір і двері тут не видаються.
    'POST /api/owner/ai-bord/token': [async (ctx: any) => {
      const auth = await accountGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const su = await stepUp(ctx, auth);
      if (su) return su;
      const body = deps.body(ctx.body);
      if (!isBordKlant(body.klant)) return deps.fail('METHODE_NIET', 403);
      const naam = String(body.naam || BORD_AGENTEN.find((a) => a.id === body.klant)?.naam || 'Agent').slice(0, 80);
      const w = connectGeweigerd(await leesStaat(), { ruimte: 'prive', klant: body.klant, methode: 'token' });
      if (w) return deps.fail(w.code, 403);
      try {
        const token = await issuePriveToken(auth.user.id, naam);
        await deps.audit(auth.user.id, 'owner.ai.bord.token', 'success', { klant: body.klant, ruimte: 'prive' });
        return deps.respond({ token });
      } catch (err) {
        const code = err instanceof Error ? err.message : 'TOKEN_MISLUKT';
        return deps.fail(code, code === 'TOKEN_LIMIT_REACHED' ? 409 : 403);
      }
    }],

    // Особисте вимкнення можливості для одного ШІ. Стеля сайту й підписана політика не знімаються.
    'POST /api/owner/ai-bord/modus': [async (ctx: any) => {
      const auth = await accountGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const body = deps.body(ctx.body);
      const cap = String(body.cap || '');
      if (!isBordKlant(body.klant) || !isPriveCap(cap)) return deps.fail('CAP_TECHNISCH', 403);
      const staat = await leesStaat();
      if (staat.cap[cap] === false) return deps.fail('CAP_UIT', 403);
      const beleid = await leesStand().catch(() => ({ staat: 'niet-ingesteld' as const }));
      if (beleid.staat === 'geldig') return deps.fail('BELEID_PLAFOND', 403);
      await zetGebruikerCap(auth.user.id, body.klant, cap, body.aan === true);
      meldLijstGewijzigd(auth.user.id);
      await deps.audit(auth.user.id, 'owner.ai.bord.modus', 'success', { klant: body.klant, cap, aan: body.aan === true });
      return deps.respond({ ok: true, gebruiker: await leesGebruikerCaps(auth.user.id) });
    }],

    'POST /api/owner/ai-site-schakelaars': [async (ctx: any) => {
      const auth = await siteGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const staat = await leesStaat();
      return deps.respond({
        staat, agenten: BORD_AGENTEN.map((a) => ({ id: a.id, naam: a.naam, aan: agentAan(staat, a.id) })),
        methoden: { mcp: methodeAan(staat, 'mcp'), token: methodeAan(staat, 'token') },
        caps: PRIVE_CAPS.map((cap) => ({ ...cap, aan: staat.cap[cap.id] !== false })),
        regel: SITE_REGEL,
      });
    }],

    'POST /api/owner/ai-site-schakelaars/zet': [async (ctx: any) => {
      const auth = await siteGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const body = deps.body(ctx.body);
      const sleutel = String(body.sleutel || '');
      if (!isSiteSleutel(sleutel) || typeof body.aan !== 'boolean') return deps.fail('SLEUTEL_ONGELDIG', 400);
      const staat = await zetStaat(sleutel, body.aan, auth.user.id);
      await deps.audit(auth.user.id, 'owner.ai.site.schakelaar', 'success', { sleutel, aan: body.aan });
      return deps.respond({ ok: true, staat });
    }],

    // Gedetailleerde toegang per verbinding (0044, shared/ai-toegang.ts — de enige catalogus):
    // de mens zet scopes per AI («Доступ ШІ»); default-deny, gevoelig pas na bevestiging.
    'POST /api/owner/ai-toegang/overzicht': [async (ctx: any) => {
      const auth = await accountGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const body = deps.body(ctx.body);
      const onderwerp = await toegangOnderwerp(auth.user.id, body);
      if (!onderwerp) return deps.fail('TOEGANG_ONBEKEND', 404);
      // ruimte: de tab toont bij een technische verbinding alleen wat daar kan werken en legt uit dat zij niets van het bord erft.
      // agent: een connector-v2-koppeling wijzig je op de agentpagina — de tab toont dan alleen de weg erheen.
      // v2Elders: het bord geldt niet voor de v2-koppelingen van deze AI; de tab zegt hoeveel er zijn en waar ze te wijzigen zijn.
      const ruweId = String(body.id ?? '');
      let v2Elders: { agent: string; aantal: number } | null = null;
      if (body.soort === 'oauth' && ruweId.startsWith('bord:')) {
        const slug = agentVoorKlant(ruweId.slice(5) as KlantId)?.slug;
        const aantal = slug ? (await c.listUserGrants(auth.user.id).catch(() => [])).filter((g) => g.agent === slug).length : 0;
        if (slug && aantal) v2Elders = { agent: slug, aantal };
      }
      return deps.respond({ granted: await leesToegang(onderwerp), uit: await leesBeheerUit(), ruimte: onderwerp.ruimte, agent: onderwerp.agent, v2Elders });
    }],

    'POST /api/owner/ai-toegang/zet': [async (ctx: any) => {
      const auth = await accountGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      const body = deps.body(ctx.body);
      const onderwerp = await toegangOnderwerp(auth.user.id, body);
      if (!onderwerp) return deps.fail('TOEGANG_ONBEKEND', 404);
      // Connector v2: de scopelaag volgt connector_v2_rechten (v2st.zetRechten). Hier schrijven zou die twee uit elkaar trekken en
      // stil de rechten per hulpmiddel omzeilen — wijzigen alleen op de agentpagina. Підключення v2 змінюються лише на сторінці ШІ.
      if (onderwerp.agent) return deps.fail('TOEGANG_V2', 409);
      const gevraagd =Array.isArray(body.scopes) ? (body.scopes as unknown[]).filter((s): s is string => typeof s === 'string') : null;
      if (!gevraagd || gevraagd.some((s) => !isToegangScope(s))) return deps.fail('TOEGANG_SCOPE_ONBEKEND', 400);
      // Een technische verbinding krijgt nooit een gevoelige scope (de AiRuimte-poort weigert hem toch): niet bewaren, zodat de tab
      // toont wat werkelijk geldt. Технічне підключення ніколи не отримує чутливих скоупів.
      const scopes = onderwerp.ruimte === 'technisch' ? gevraagd.filter((s) => !toegangScope(s)?.gevoelig) : gevraagd;
      // Gevoelige scopes (mail, foto's) aanzetten vraagt een expliciete bevestiging (de UI doet dit in twee stappen).
      const oud = await leesToegang(onderwerp);
      if (scopes.filter((s) => toegangScope(s)?.gevoelig && !oud.includes(s)).length && body.bevestigd !== true) {
        return deps.fail('TOEGANG_BEVESTIGING_VEREIST', 409);
      }
      // SEC-002 (g10a-2 п.2, afwerking A): rechten van een AI UITBREIDEN (een scope die er nog niet was) vraagt een bevestiging van de
      // mens (step-up); intrekken niet. Розширення прав ШІ — лише з підтвердженням входу людини.
      if (scopes.some((s) => !oud.includes(s))) { const su = await stepUp(ctx, auth); if (su) return su; }
      const bewaard = await zetToegang(auth.user.id, onderwerp, scopes);
      const ruweId = String(body.id ?? '');
      if (body.soort === 'oauth' && ruweId.startsWith('bord:')) {
        // De privékeuze van deze AI: naar de bordrij en naar elke andere actieve PRIVÉ /mcp-grant van deze klant.
        // Technische /mcp-grants en connector-v2-koppelingen hebben eigen rechten en blijven ongemoeid (gescheiden ruimtes).
        const klant = ruweId.slice(5);
        const bord = bordOnderwerp(auth.user.id, klant);
        if (bord && bord.id !== onderwerp.id) await zetToegang(auth.user.id, bord, bewaard).catch(() => undefined);
        const actief = (await c.listUserGrants(auth.user.id).catch(() => [])).filter((g) => isPriveOudeGrant(g) && klantVan(g.clientName) === klant && g.id !== onderwerp.id);
        for (const g of actief) await zetToegang(auth.user.id, { soort: 'mcp-koppeling', id: g.id }, bewaard).catch(() => undefined);
      } else if (onderwerp.soort === 'mcp-koppeling' && !onderwerp.id.startsWith('bord_')) {
        // Eén verbinding: alleen een actieve privé /mcp-grant werkt de privékeuze (bord) bij; een technische of v2-koppeling nooit.
        const g = (await c.listUserGrants(auth.user.id).catch(() => [])).find((x) => x.id === onderwerp.id);
        if (g && isPriveOudeGrant(g)) {
          const klant = klantVan(g.clientName);
          const bord = isBordKlant(klant) ? bordOnderwerp(auth.user.id, klant) : null;
          if (bord) await zetToegang(auth.user.id, bord, bewaard).catch(() => undefined);
        }
      }
      meldLijstGewijzigd(auth.user.id);
      await deps.audit(auth.user.id, 'owner.mcp.toegang.gezet', 'success', { soort: onderwerp.soort, onderwerp: onderwerp.id, scopes: bewaard });
      return deps.respond({ ok: true, granted: bewaard });
    }],

    // Bestuurlijk plafond voor de hele site (alleen de eigenaar): een uitgeschakelde scope weigert de backend
    // ook met een oude grantrij; de tab verbergt of blokkeert hem.
    'POST /api/owner/ai-toegang/beheer': [async (ctx: any) => {
      const auth = await accountGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      return deps.respond({ uit: await leesBeheerUit() });
    }],

    'POST /api/owner/ai-toegang/beheer/zet': [async (ctx: any) => {
      const auth = await accountGate(ctx.event, ctx.body);
      if (!auth || 'errorCode' in auth) return denied(auth);
      if (auth.user.role !== 'owner') return deps.fail('OWNER_REQUIRED', 403);
      const body = deps.body(ctx.body);
      const scope = String(body.scope ?? '');
      if (!isToegangScope(scope)) return deps.fail('TOEGANG_SCOPE_ONBEKEND', 400);
      const uit = body.uit !== false;
      await zetBeheer(scope, uit);
      await deps.audit(auth.user.id, 'owner.mcp.toegang.beheer', 'success', { scope, uit });
      return deps.respond({ ok: true, uit: await leesBeheerUit() });
    }],

    // Connector v2: beheerpagina (rechten per agent, herverbinden, intrekken, instellingen).
    ...v2Routes({ ...deps, gate: ownerGate, stepUp }),
  };
}
