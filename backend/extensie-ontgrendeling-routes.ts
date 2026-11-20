// Routes voor het ontgrendelen van de browserextensie (0.5 → 0.6, backend/extensie-ontgrendeling.ts + extensie-beheer.ts, contract 0.6 §2–§3).
// Sessie (cookie) + tabcontext zoals backend/tech-routes.ts: body {service, tabContext, sourceOrigin, ...}; bij GET dezelfde velden als
// query (?service=mcp&tabContext=…). Alleen op mcp.* en admin.*. De HTTP-terugval van de extensie (intrekken-extensie) heeft geen sessie
// maar het agenttoken (Authorization: Bearer); die staat in PUBLIEKE_ROUTES (server/platform/auth-poort.ts).
import { error, json } from '../server/platform';
import type { RouterMiddleware } from '../server/platform/router';
import * as beheer from './extensie-beheer';
import * as eo from './extensie-ontgrendeling';
import * as matrix from './extensie-matrix';
import { STAP_OP_MS, stapOpGeldig, stapOpGeldigTot, stapOpUit, stapOpVerbruiken, sterkeStapOpGeldig, type StapOpAuth } from './stap-op';
import { sterkeMethoden } from './toegang-context';
import { capsUnie, extensieFoutUitleg, ONTGRENDEL_TERMIJNEN, SNEL_SETS, wordtRuimer, type MatrixStand, type MatrixWeigering } from '../shared/extensie-matrix';
import type { AiRuimte } from '../shared/ai-ruimte';
import { isAiRuimte } from '../shared/ai-ruimte';
import { ACCENTEN } from '../shared/menu-model';
import * as kleuren from './agent-kleuren';
import { isEigenaar, TechFout } from './tech-profiel';
import { KijkerWeigering } from './kijker-alleen-lezen';

type SessionOk = { user: { id: string; email?: string; role?: string; status?: string; name?: string }; service: string; session?: { id: string; createdAt: number } | null; tabSession?: { id: string; createdAt?: number } | null };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown; query?: Record<string, string> };

/** Diensten waarop ONTGRENDELEN en beheer mogen (contract: host mcp.* en admin.*). De status LEZEN (GET/POST extensie-status) mag op
 * elke eigen dienst: het is onschadelijk en de band/het menu op hub/id/mail tonen hem (G3: anders 403-ruis in het journaal). */
export const EXTENSIE_DIENSTEN = new Set(['mcp', 'admin']);
const bodyOf = (b: unknown) => (b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {});
const kop = (ctx: Ctx, naam: string) => {
  const h = (ctx.event?.headers || {}) as Record<string, string | undefined>;
  return String(Object.entries(h).find(([k]) => k.toLowerCase() === naam)?.[1] ?? '');
};
const weigering = (err: InstanceType<typeof eo.Weigering>) => json(eo.weigerAntwoord(err.code, err.ruimte), err.status);

export function extensieOntgrendelingRoutes(requireSession: RequireSession): Record<string, RouterMiddleware[]> {
  const route = (run: (a: eo.Aanroep, b: Record<string, unknown>) => Promise<unknown>, opts: { get?: boolean; alleDiensten?: boolean } = {}) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    // GET heeft geen body: dezelfde sessievelden uit de query (alleen deze drie).
    const q = ctx.query || {};
    const body = opts.get ? { service: q.service, tabContext: q.tabContext, sourceOrigin: q.sourceOrigin } : ctx.body;
    const auth = await requireSession(ctx.event, body);
    if ('errorCode' in auth) return json(eo.weigerAntwoord('NIET_INGELOGD'), 401);
    if (auth.user.status !== 'approved' && !isEigenaar(auth.user)) return error('ACCOUNT_NOT_APPROVED', 403);
    if (!opts.alleDiensten && !EXTENSIE_DIENSTEN.has(auth.service)) return error('SERVICE_NOT_ALLOWED', 403);
    const b = bodyOf(body);
    const a: eo.Aanroep = { user: auth.user, service: auth.service, tabContext: String(b.tabContext || ''), session: auth.session ?? null, tabSession: auth.tabSession ?? null };
    try { return json(await run(a, b)); }
    catch (err) {
      if (err instanceof eo.Weigering) return weigering(err);
      if (err instanceof TechFout) return error(err.code, err.status);
      if (err instanceof KijkerWeigering) throw err; // SEC-002 (slot v): kijkerWacht antwoordt 403 RBAC_FORBIDDEN met audit en melding
      console.error('[extensie-ontgrendeling]', (err as Error).message);
      return error('EXTENSIE_ONTGRENDELING_FOUT', 500);
    }
  }) as RouterMiddleware;

  // ---------------------------------------------------------------- SEC-002 (extensie-05): bevestiging voor «Усі користувачі»
  // Verlengen en ruimer beleid vragen een verse bevestiging van DEZE sessie (venster «Підтвердіть доступ»; src/platform/client.ts
  // opent het bij 403 STEP_UP_REQUIRED / STEP_UP_STRONG_REQUIRED en herhaalt het verzoek één keer). Een onthouden browser telt niet
  // (stapOpGeldigTot kijkt alleen naar de bevestiging van de sessie zelf), een bevestiging van vóór `sinds` ook niet, en na één
  // verruiming is ze verbruikt. Zo blijft de termijn die een mens met passkey/step-up bevestigde de grens, ook als een AI of een
  // voorbijganger in dit tabblad op «Продовжити» klikt.
  const stapOpAuthVan = (a: eo.Aanroep): StapOpAuth => ({
    user: { id: a.user.id }, session: a.session?.id ? { id: String(a.session.id), createdAt: Number(a.session.createdAt) || 0 } : null,
    tabSession: a.tabSession?.id ? { id: String(a.tabSession.id), createdAt: Number(a.tabSession.createdAt) || 0 } : null,
  });
  const bevestiging: beheer.Bevestiging = {
    eis: async (a, { sterk, sinds }) => {
      if (stapOpUit()) return '';
      const auth = stapOpAuthVan(a);
      // Technisch slot: de sterke regel van het platform (passkey/app-code/herstelcode voor wie er een heeft, anders gewoon).
      // De STERKE bevestiging zelf moet van ná `sinds` zijn (g06-1): sterk vóór het openen + gewoon erna is samen niet genoeg.
      // sterkeStapOpGeldig(auth, sinds + STAP_OP_MS) ⇔ het tijdstip van de sterke bevestiging ligt ná `sinds`.
      const m = sterk ? await sterkeMethoden(a.user.id) : null;
      if (m && (m.passkey || m.totp || m.herstelcode)) {
        return (await sterkeStapOpGeldig(auth)) && (await sterkeStapOpGeldig(auth, sinds + STAP_OP_MS)) ? '' : 'STEP_UP_STRONG_REQUIRED';
      }
      const tot = await stapOpGeldigTot(auth).catch(() => 0);
      return tot > 0 && tot - STAP_OP_MS > sinds ? '' : 'STEP_UP_REQUIRED';
    },
    verbruik: (a) => stapOpVerbruiken(stapOpAuthVan(a)),
  };

  const status = (a: eo.Aanroep) => eo.extensieStatus(a.user, a.tabContext, a.session?.id ? { id: String(a.session.id), createdAt: Number(a.session.createdAt) || 0, tabSessieId: a.tabSession?.id ? String(a.tabSession.id) : null } : null);
  const P = '/api/owner/agents/ontgrendeling';

  // ---------------------------------------------------------------- 0110 (zone E): matrix «Браузер і агенти»
  /** Laatste EXTENSIE_*-weigeringen van de connector voor deze gebruiker (app.audit, details.fout), met uitleg uk/nl. */
  const weigeringen = async (userId: string): Promise<MatrixWeigering[]> => {
    try {
      const { rows } = await (await import('../server/platform/pg')).getPool('systeem').query(
        `SELECT created_at, details FROM app.audit WHERE owner_id = $1 AND action = 'owner.mcp.tool' AND details->>'fout' LIKE 'EXTENSIE\\_%' ORDER BY created_at DESC LIMIT 10`, [userId]);
      return rows.flatMap((r: { created_at: Date; details: Record<string, unknown> }) => {
        const u = extensieFoutUitleg(String(r.details?.fout ?? ''));
        if (!u) return [];
        return [{ at: new Date(r.created_at).getTime(), agent: String(r.details?.agent ?? r.details?.client ?? '?').slice(0, 40), tool: String(r.details?.v2 ?? r.details?.tool ?? '').slice(0, 80), ...u }];
      });
    } catch { return []; }
  };
  const stand = async (a: eo.Aanroep): Promise<MatrixStand> => {
    const m = await matrix.leesMatrix(a.user.id);
    const [erfP, erfT, ag, w, keten] = await Promise.all([
      matrix.erfenisCaps(a.user.id, 'prive').catch(() => []), matrix.erfenisCaps(a.user.id, 'technisch').catch(() => []),
      import('./connector-v2').then((cv) => cv.agentStanden(a.user.id)).catch(() => null), weigeringen(a.user.id),
      matrix.ketenVoor(a.user.id).catch((err) => { console.error('[extensie-matrix] keten:', (err as Error).message); return []; }),
    ]);
    return {
      matrix: m, ingesteld: { prive: matrix.ingesteld(m, 'prive'), technisch: matrix.ingesteld(m, 'technisch') }, erfenis: { prive: erfP, technisch: erfT },
      termijnen: [...ONTGRENDEL_TERMIJNEN],
      agenten: (ag?.agenten ?? []).map((x) => ({ slug: x.slug, naam: x.naam, verbonden: x.v2 + x.erfenis + (x.deur ?? 0) > 0, kanten: [...x.kanten], levend: [...x.levend], laatst: x.laatst })),
      weigeringen: w, keten, nu: Date.now(),
    };
  };
  /** Opslaan; ruimer = step-up van DEZE sessie (zoals 'altijd'-toestemmingen). Daarna lopende ontgrendelingen van die ruimte herzien. */
  const zet = async (a: eo.Aanroep, inv: ReturnType<typeof matrix.valideerInvoer>) => {
    const voor = await matrix.leesMatrix(a.user.id);
    const na = { ...voor, rijen: [...voor.rijen.filter((r) => r.ruimte !== inv.ruimte), ...inv.rijen.map((r) => ({ ruimte: inv.ruimte, agent: r.agent, caps: r.caps, gewijzigdOp: null, gewijzigdDoor: null }))],
      instellingen: { ...voor.instellingen, [inv.ruimte]: { ...voor.instellingen[inv.ruimte], ...(inv.instellingen ?? {}) } } };
    if (wordtRuimer(voor, na, inv.ruimte)) {
      const ok = await stapOpGeldig({ user: { id: a.user.id }, session: a.session?.id ? { id: String(a.session.id), createdAt: Number(a.session.createdAt) || 0 } : null, tabSession: a.tabSession?.id ? { id: String(a.tabSession.id), createdAt: Number(a.tabSession.createdAt) || 0 } : null }, Date.now(), { onthoud: false }).catch(() => false);
      if (!ok) throw new eo.Weigering('STEP_UP_REQUIRED', 'matrix', inv.ruimte);
    }
    const uit = await matrix.schrijfMatrix(a.user.id, inv, a.user.email || a.user.id);
    const herzien = await eo.capsHerzien(a.user.id, inv.ruimte, capsUnie(uit.na, inv.ruimte) ?? []).catch(() => 0);
    // De schakelaars van de site per browserhulpmiddel volgen de matrix (zonder geldig ondertekend beleid): één plek.
    const modi = await matrix.modiVolgenMatrix(a.user.id, uit.na).catch((err) => { console.error('[extensie-matrix] modi:', (err as Error).message); return 0; });
    return { ok: true, herzien, modi, ...(await stand(a)) };
  };
  return {
    // ExtensieStatusAntwoord (shared/extensie-ontgrendeling.ts). POST met dezelfde body voor clients die geen query willen.
    'GET /api/owner/agents/extensie-status': [route((a) => status(a), { get: true, alleDiensten: true })],
    'POST /api/owner/agents/extensie-status': [route((a) => status(a), { alleDiensten: true })],
    // {agentId, minuten, domeinen?, lokaal?} → {uitdagingId, verloopt, publicKey, voorstel:{caps, domeinen, eind, rollen}} | {error, uitleg, actie?}
    [`POST ${P}/uitdaging`]: [route((a, b) => eo.uitdaging(a, b))],
    // {agentId, uitdagingId, assertie:{credentialId, clientDataJSON, authenticatorData, signature}} → {ontgrendeling, verzonden}
    [`POST ${P}`]: [route((a, b) => eo.ontgrendelen(a, b))],
    // Privé-slot (0.6): {agentId, dagen?: 1|7|30, domeinen?: PRIVE_HOSTS[], lokaal?} → {ontgrendeling, verzonden} | 403 {error:'STEP_UP_REQUIRED', reasonCode, methods,
    // maxAgeSeconds, uitleg} (site toont «Підтвердіть доступ» en probeert opnieuw) | {error, uitleg, actie?}.
    [`POST ${P}/prive`]: [route((a, b) => eo.priveOntgrendelen(a, b))],
    // {agentId?, gid?, ruimte?, alles?} → {ok:true, ingetrokken}. Altijd direct, zonder bevestiging en zonder technisch profiel (intrekken = veilige richting).
    [`POST ${P}/intrekken`]: [route(async (a, b) => {
      const wie = { agentId: typeof b.agentId === 'string' ? b.agentId : null, gid: typeof b.gid === 'string' ? b.gid : null, ruimte: isAiRuimte(b.ruimte) ? b.ruimte : null, alles: b.alles === true };
      if (!wie.alles && !wie.agentId && !wie.gid && !wie.ruimte) throw new TechFout('ONGELDIG', 400);
      return { ok: true, ingetrokken: await eo.intrekken(a.user.id, wie, 'site', 'site') };
    })],
    // 0.6.2 (opdracht eigenaar 20.10.2026): kleur per AI-agent. De markering in het tabblad, de badge op het pictogram en de
    // agentenlijst op de site gebruiken dezelfde kleur, dus staat ze bij de GEBRUIKER (migratie 0088). Lezen mag op elke eigen
    // dienst (de agentenlijst staat ook op hub.*); zetten alleen op mcp.*/admin.*, zoals al het andere beheer hier.
    // GET → {kleuren:[{agent, accent, standaard}], accenten:[…]}
    'GET /api/owner/agents/kleuren': [route(async (a) => ({ kleuren: await kleuren.lijst(a.user.id), accenten: [...ACCENTEN] }), { get: true, alleDiensten: true })],
    'POST /api/owner/agents/kleuren': [route(async (a) => ({ kleuren: await kleuren.lijst(a.user.id), accenten: [...ACCENTEN] }), { alleDiensten: true })],
    // {agent, accent|null} → {ok, kleuren, geduwd}. accent null = terug naar de standaard uit het palet.
    'POST /api/owner/agents/kleuren/zet': [route(async (a, b) => {
      let lijst;
      try { lijst = await kleuren.zet(a.user.id, b.agent, b.accent ?? null); }
      catch (err) { throw new TechFout((err as Error).message === 'AGENT_ONBEKEND' ? 'AGENT_ONBEKEND' : 'ACCENT_ONBEKEND', 400); }
      // Meteen naar de verbonden extensies: de rand in een open tabblad krijgt de nieuwe kleur zonder herladen.
      const geduwd = await eo.pushKleuren(a.user.id).catch(() => 0);
      return { ok: true, kleuren: lijst, accenten: [...ACCENTEN], geduwd };
    })],
    // «Усі користувачі» (eigenaar of lopende activering met users.manage; ExtensieBeheerAntwoord). GET met de sessievelden als query.
    'GET /api/owner/agents/extensie-beheer': [route((a) => beheer.lijst(a), { get: true })],
    'POST /api/owner/agents/extensie-beheer': [route((a) => beheer.lijst(a))],
    // {userId, priveAan?, technischAan?, priveCaps?, technischCaps?, priveMaxDagen?, technischMaxMinuten?, lokaalAan?, notitie?} → {ok, beleid, ingetrokken}
    // | 403 STEP_UP_REQUIRED / STEP_UP_STRONG_REQUIRED als het beleid ruimer wordt (strenger en de notitie vragen niets)
    'POST /api/owner/agents/extensie-beheer/beleid': [route((a, b) => beheer.beleidZetten(a, b, bevestiging))],
    // {userId, agentId?, ruimte?} → {ok, ingetrokken}; de gebruiker krijgt een melding
    'POST /api/owner/agents/extensie-beheer/intrekken': [route((a, b) => beheer.intrekkenVoor(a, b))],
    // {gid, minuten | dagen} → {ok, ontgrendeling, verzonden, gekapt}; alleen binnen beleid, technisch nooit voorbij de activering
    // | 403 STEP_UP_REQUIRED (privé) / STEP_UP_STRONG_REQUIRED (technisch): altijd een verse bevestiging, één per verlenging
    'POST /api/owner/agents/extensie-beheer/verlengen': [route((a, b) => beheer.verlengen(a, b, bevestiging))],
    // 0110: matrix «Браузер і агенти» (MatrixStand). Lezen op elke eigen dienst; zetten alleen op mcp.*/admin.*.
    'GET /api/owner/agents/extensie-matrix': [route((a) => stand(a), { get: true, alleDiensten: true })],
    'POST /api/owner/agents/extensie-matrix': [route((a) => stand(a), { alleDiensten: true })],
    // {ruimte, rijen:[{agent, caps}], instellingen?:{zonderBevestiging?, devtoolsNamen?}} → {ok, herzien, …MatrixStand} | 403 STEP_UP_REQUIRED (ruimer) | 400 MATRIX_ONGELDIG:<veld>
    'POST /api/owner/agents/extensie-matrix/zet': [route(async (a, b) => {
      let inv;
      try { inv = matrix.valideerInvoer(b); } catch (err) { throw new TechFout((err as Error).message.slice(0, 60), 400); }
      return zet(a, inv);
    })],
    // {ruimte, set:'alles'|'lezen'|'niets'} → zelfde antwoord; 'alles' en 'lezen' zijn ruimer → step-up.
    'POST /api/owner/agents/extensie-matrix/snel': [route(async (a, b) => {
      const ruimte = b.ruimte === 'prive' || b.ruimte === 'technisch' ? b.ruimte as AiRuimte : null;
      const set = typeof b.set === 'string' && Object.prototype.hasOwnProperty.call(SNEL_SETS, b.set) ? b.set as keyof typeof SNEL_SETS : null;
      if (!ruimte || !set) throw new TechFout('MATRIX_ONGELDIG:set', 400);
      return zet(a, matrix.snelleInvoer(ruimte, set, await matrix.leesMatrix(a.user.id)));
    })],
    // HTTP-terugval van de extensie als de WebSocket dicht is: Authorization: Bearer <agenttoken>, body {gid, reden}. Geen sessie.
    [`POST ${P}/intrekken-extensie`]: [async (raw) => {
      const ctx = raw as unknown as Ctx;
      const token = kop(ctx, 'authorization').replace(/^Bearer\s+/i, '').trim();
      const b = bodyOf(ctx.body);
      const uit = await eo.intrekkenMetAgentToken(token, { gid: b.gid, reden: b.reden });
      return uit ? json(uit) : error('TOKEN_INVALID', 401);
    }],
  };
}
