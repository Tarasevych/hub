// «Агент від імені власника» (audit 18.10.2026, bevinding K1).
//
// Wat hier wél en níet bestaat:
//   - Er is GEEN instrument dat een AI een sessie, cookie of token van de eigenaar geeft. issue_session_token / exchange_session /
//     auto_session zijn verwijderd (backend/mcp-console.ts weigert ze met TOOL_VERWIJDERD).
//   - Wil de eigenaar dat een agent tijdelijk met verhoogde (alleen-lezen beheer)rechten werkt, dan maakt hij op de site een
//     «namens-sessie»: agent (slug), ruimte, duur (15 min … 8 u, standaard 1 u), omvang. Alleen na een passkey-step-up; de
//     bevestiging wordt na één aanmaak verbruikt. De agent merkt er niets van in zijn koppeling: hij krijgt geen nieuw geheim.
//     De site herkent per aanroep (backend/site-aanroep.ts) dat er een actieve toestemming is, laat dan de routes uit
//     NAMENS_ROUTES toe, en zet in elke journaalregel «від імені» = id van deze rij + de agent (ctx_namens, details.agent).
//   - Harde grenzen (AGENT_VERBODEN): wat een agent NOOIT mag, ook niet met een namens-sessie: de eigenaar of zijn rollen
//     wijzigen, grants/namens-sessies maken of intrekken, aanmeldmethoden of passkeys, het AI-beleid, geheimen lezen, het
//     technisch profiel activeren. Zowel vóór de aanroep (site-dispatch) als in ownerRequireSession (backend/index.ts) — twee hekken.
//   - Spooksessies (de rijen die de verwijderde instrumenten achterlieten) zijn door migratie 0059 gemarkeerd; de eigenaar ziet ze
//     en ruimt ze met zijn passkey definitief op.
import { error, json } from '../server/platform';
import { getPool } from '../server/platform/pg';
import type { RouterMiddleware } from '../server/platform/router';
import { isOwnerEmail } from '../server/platform';
import { isAgentSlug, V2_AGENTEN } from '../shared/connector-v2/agenten';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';
import { passkeyStapOpGeldig, stapOpVerbruiken, type StapOpAuth } from './stap-op';
import { schrijfBeheerAudit } from './audit-gebeurtenis';

export const NAMENS_MIN_MINUTEN = 15;
export const NAMENS_MAX_MINUTEN = 8 * 60;
export const NAMENS_STANDAARD_MINUTEN = 60;

/** Omvang: groepen van ALLEEN-LEZEN beheerroutes die een agent met een namens-sessie via callSite mag aanroepen. */
export const NAMENS_OMVANG: Readonly<Record<string, { uk: string; nl: string; routes: readonly string[] }>> = Object.freeze({
  overzicht: { uk: 'Огляд адміністрування (лічильники, стан)', nl: 'Beheeroverzicht (tellers, stand)', routes: ['POST /api/owner/admin/overview'] },
  uitrol: { uk: 'Історія розгортань (лише читання)', nl: 'Uitrolgeschiedenis (alleen lezen)', routes: ['POST /api/owner/uitrol/overzicht', 'POST /api/owner/uitrol/runs'] },
  diagnostiek: { uk: 'Діагностика сервісів (лише читання)', nl: 'Diagnostiek van diensten (alleen lezen)', routes: ['POST /api/owner/admin/diagnostiek/overzicht'] },
  journaal: { uk: 'Журнал аудиту (лише читання)', nl: 'Auditlogboek (alleen lezen)', routes: ['POST /api/owner/audit/beheer/lijst'] },
});
export const NAMENS_ROUTES: ReadonlySet<string> = new Set(Object.values(NAMENS_OMVANG).flatMap((o) => [...o.routes]));
export const isOmvang = (v: unknown): v is string => typeof v === 'string' && Object.prototype.hasOwnProperty.call(NAMENS_OMVANG, v);

/**
 * Wat een agent NOOIT mag (ook niet namens de eigenaar). Routes die de eigenaar zelf, zijn rechten of de rechten van agenten raken.
 * Getest in tests/eenheid/agent-namens.test.ts; elke nieuwe route in deze categorieën hoort hier bij.
 */
export const AGENT_VERBODEN: readonly RegExp[] = Object.freeze([
  /^[A-Z]+ \/api\/owner\/identity\/account\//,          // account verwijderen/wijzigen
  /^[A-Z]+ \/api\/owner\/identity\/security\//,         // sessies intrekken, «het was ik niet»
  /^[A-Z]+ \/api\/owner\/identity\/admin\//,            // rollen van anderen
  /^[A-Z]+ \/api\/owner\/access\//,                     // aanmeldmethoden, passkeys, TOTP, herstelcodes, rollen, beleid
  /^[A-Z]+ \/api\/owner\/admin\/(users|roles|access)(\/|$)/,
  /^[A-Z]+ \/api\/owner\/agent-namens\//,               // namens-sessies zelf
  /^[A-Z]+ \/api\/owner\/uitrol\/voorbereiders(\/|$)/,  // wie updates mag voorbereiden (grants)
  /^[A-Z]+ \/api\/owner\/uitrol\/(goedkeuren|goedkeuring)(\/|$)/,
  /^[A-Z]+ \/api\/owner\/ai-beleid(\/|$)/,              // AI-beleid (ondertekend door de eigenaar)
  /^[A-Z]+ \/api\/owner\/geheimen(\/|$)/,               // «Секрети й ключі»
  /^[A-Z]+ \/api\/owner\/api-platform\/vault(\/|$)/,
  /^[A-Z]+ \/api\/owner\/google-contour(\/|$)/,
  /^[A-Z]+ \/api\/owner\/mcp-connector\/(grants|approvals|consent)(\/|$)/,
  /^[A-Z]+ \/api\/owner\/mcp\/consent(\/|$)/,
  /^[A-Z]+ \/api\/owner\/connector-v2\//,
  /^[A-Z]+ \/api\/owner\/agents\/[^/]+\/(policy|revoke)(\/|$)/,
  /^[A-Z]+ \/api\/owner\/agents\/(ontgrendeling|extensie-status|extensie-beheer)(\/|$)/, // browserextensie ontgrendelen/intrekken/status (0.5) en beheer/beleid (0.6): alleen een mens
  /^[A-Z]+ \/api\/owner\/tech\//,                       // technisch profiel activeren/verlengen
  /^[A-Z]+ \/api\/ssh-ca(\/|$)/,                        // SSH-certificaten: uitgeven, voorbereiden, aan/uit, intrekken (toegang tot de host)
  /^[A-Z]+ \/api\/owner\/remote(\/|$)/,                 // extern bureaublad (RDP/VNC/SSH via guacd): alleen een mens met passkey
  /^[A-Z]+ \/api\/mcp\/console\/tokens?(\/|$)/,         // agenttokens uitgeven/intrekken
  /^[A-Z]+ \/api\/mcp\/server\/(terugdraaien|uitrol-nu|backup)(\/|$)/,
  /^[A-Z]+ \/api\/owner\/beveiliging\//,              // «Захист»: auth-poort, OPA, RLS aan/uit (alleen de eigenaar zelf)
  /^[A-Z]+ \/api\/impersonatie\//,                     // «Подивитися як користувач»: alleen mensen vragen, geven en gebruiken toegang (0068)
  /^[A-Z]+ \/api\/ondersteuning\//,                    // «Підтримка від імені»: idem
]);
export const agentRouteVerboden = (route: string): boolean => AGENT_VERBODEN.some((r) => r.test(route));
export const AGENT_NIET_TOEGESTAAN_TEKST = Object.freeze({
  uk: 'Агент не може виконувати цю дію від імені власника: зміни акаунта, прав, доступу та секретів — лише сам власник із passkey.',
  nl: 'Een agent mag dit niet namens de eigenaar doen: wijzigingen aan account, rechten, toegang en geheimen doet alleen de eigenaar zelf met zijn passkey.',
});

export type NamensSessie = {
  id: string; userId: string; agent: string; ruimte: AiRuimte; omvang: string[];
  aangemaaktOp: number; verlooptOp: number; ingetrokkenOp: number | null; ingetrokkenReden: string;
  stapOpMethode: string; acties: number; laatstActief: number | null;
};
const ms = (v: unknown): number | null => { const t = v instanceof Date ? v.getTime() : Date.parse(String(v ?? '')); return Number.isFinite(t) ? t : null; };
const rij = (r: Record<string, unknown>): NamensSessie => ({
  id: String(r.id), userId: String(r.user_id), agent: String(r.agent), ruimte: ruimteOf(r.ruimte), omvang: Array.isArray(r.omvang) ? (r.omvang as string[]) : [],
  aangemaaktOp: ms(r.aangemaakt_op) || 0, verlooptOp: ms(r.verloopt_op) || 0, ingetrokkenOp: ms(r.ingetrokken_op), ingetrokkenReden: String(r.ingetrokken_reden || ''),
  stapOpMethode: String(r.stap_op_methode || ''), acties: Number(r.acties || 0), laatstActief: ms(r.laatst_actief),
});
const sys = () => getPool('systeem');

/** De actieve toestemming voor (eigenaar, agent, ruimte), of null. Alleen de systeemrol; een AI-aanroep kan dit niet zelf opvragen. */
export async function actieveNamensSessie(userId: string, agent: string, ruimte: AiRuimte): Promise<NamensSessie | null> {
  if (!isAgentSlug(agent) || !/^[0-9a-f-]{36}$/i.test(String(userId || ''))) return null;
  const r = await sys().query(
    `SELECT * FROM app.agent_namens_sessies WHERE user_id = $1 AND agent = $2 AND ruimte = $3 AND ingetrokken_op IS NULL AND verloopt_op > now()
     ORDER BY verloopt_op DESC LIMIT 1`, [userId, agent, ruimte]);
  return r.rows[0] ? rij(r.rows[0]) : null;
}
/** Mag deze route via deze toestemming? (omvang → routes) */
export const routeInOmvang = (s: NamensSessie, route: string): boolean => s.omvang.some((o) => NAMENS_OMVANG[o]?.routes.includes(route));
/** Eén gebruik registreren (teller + laatst actief). Faalt stil: tellen mag een aanroep nooit tegenhouden. */
export async function namensGebruikt(id: string): Promise<void> {
  await sys().query('UPDATE app.agent_namens_sessies SET acties = acties + 1, laatst_actief = now() WHERE id = $1', [id]).catch(() => undefined);
}

export async function namensLijst(userId: string): Promise<{ actief: NamensSessie[]; voorbij: NamensSessie[] }> {
  const r = await sys().query('SELECT * FROM app.agent_namens_sessies WHERE user_id = $1 ORDER BY aangemaakt_op DESC LIMIT 200', [userId]);
  const alle = r.rows.map(rij); const nu = Date.now();
  return { actief: alle.filter((s) => !s.ingetrokkenOp && s.verlooptOp > nu), voorbij: alle.filter((s) => s.ingetrokkenOp || s.verlooptOp <= nu).slice(0, 50) };
}

export async function namensAanmaken(i: { userId: string; email?: string; agent: string; ruimte: AiRuimte; minuten: number; omvang: string[]; methode: string }): Promise<NamensSessie> {
  const minuten = Math.min(NAMENS_MAX_MINUTEN, Math.max(NAMENS_MIN_MINUTEN, Math.round(Number(i.minuten) || NAMENS_STANDAARD_MINUTEN)));
  const omvang = [...new Set(i.omvang.filter(isOmvang))];
  if (!omvang.length) throw new Error('NAMENS_OMVANG_LEEG');
  const r = await sys().query(
    `INSERT INTO app.agent_namens_sessies (user_id, agent, ruimte, omvang, verloopt_op, stap_op_methode)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval, $6) RETURNING *`,
    [i.userId, i.agent, i.ruimte, omvang, String(minuten), i.methode || 'passkey']);
  const s = rij(r.rows[0]);
  await schrijfBeheerAudit({ actor: { id: i.userId, email: i.email }, doel: { soort: 'agent', id: s.agent, naam: V2_AGENTEN.find((a) => a.slug === s.agent)?.naam || s.agent },
    actie: 'agent.namens.aangemaakt', agent: s.agent, resultaat: 'success', na: { ruimte: s.ruimte, minuten, omvang }, details: { namensId: s.id, verlooptOp: s.verlooptOp, stapOp: i.methode || 'passkey' } });
  return s;
}

export async function namensIntrekken(userId: string, id: string, reden: string, email?: string): Promise<NamensSessie | null> {
  const r = await sys().query(
    `UPDATE app.agent_namens_sessies SET ingetrokken_op = now(), ingetrokken_reden = $3 WHERE id = $1 AND user_id = $2 AND ingetrokken_op IS NULL RETURNING *`,
    [id, userId, String(reden || '').slice(0, 200)]);
  if (!r.rows[0]) return null;
  const s = rij(r.rows[0]);
  await schrijfBeheerAudit({ actor: { id: userId, email }, doel: { soort: 'agent', id: s.agent }, actie: 'agent.namens.ingetrokken', agent: s.agent, resultaat: 'success', reden: reden || 'op verzoek van de eigenaar', details: { namensId: s.id, acties: s.acties } });
  return s;
}

// ------------------------------------------------------------------------------------------------ spooksessies (K1)
export type SpookSessie = { id: string; createdAt: number; absoluteExpiresAt: number; service: string; verwijderdOp: number | null; verwijderdReden: string };
/** Rijen die de verwijderde instrumenten achterlieten (authMethod 'agent-token'): gemarkeerd door 0059, nooit meer geldig. */
export async function spookSessies(userId: string): Promise<SpookSessie[]> {
  const r = await sys().query(
    `SELECT id, data FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND data->>'authMethod' = 'agent-token' AND data->>'userId' = $1 ORDER BY (data->>'createdAt')::bigint DESC LIMIT 200`, [userId]);
  return r.rows.map((x) => { const d = (x.data || {}) as Record<string, unknown>; return { id: String(x.id), createdAt: Number(d.createdAt || 0), absoluteExpiresAt: Number(d.absoluteExpiresAt || 0), service: String(d.service || ''), verwijderdOp: d.verwijderdOp ? Number(d.verwijderdOp) : null, verwijderdReden: String(d.verwijderdReden || '') }; });
}
/** Definitief wissen (alleen na passkey-step-up van de eigenaar). */
export async function spookSessiesOpruimen(userId: string, email?: string): Promise<number> {
  const r = await sys().query(`DELETE FROM app.records WHERE tbl = 'owner_service_sessions_v1' AND data->>'authMethod' = 'agent-token' AND data->>'userId' = $1`, [userId]);
  const n = Number(r.rowCount || 0);
  await schrijfBeheerAudit({ actor: { id: userId, email }, doel: { soort: 'sessie', naam: 'spooksessies' }, actie: 'agent.namens.spoken_opgeruimd', resultaat: 'success', na: { verwijderd: n } });
  return n;
}

// ------------------------------------------------------------------------------------------------ routes (alleen de eigenaar op admin.*)
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string; session?: { id: string; createdAt: number } | null; tabSession?: { id: string; createdAt: number } | null };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
const body = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;

export function agentNamensRoutes(deps: { requireSession: RequireSession }): Record<string, RouterMiddleware[]> {
  const eigenaar = (opts: { passkey?: boolean }, run: (ctx: Ctx, auth: SessionOk) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (auth.service !== 'admin') return error('ADMIN_SERVICE_REQUIRED', 403);
    if (auth.user.role !== 'owner' || !isOwnerEmail(auth.user.email)) {
      await schrijfBeheerAudit({ actor: { id: auth.user.id, email: auth.user.email }, doel: { soort: 'agent', naam: 'namens-sessie' }, actie: 'agent.namens.geweigerd', resultaat: 'denied', reden: 'OWNER_REQUIRED' });
      return error('OWNER_REQUIRED', 403);
    }
    if (opts.passkey) {
      // Alleen een passkey telt (geen Google, geen TOTP): dit geeft een AI tijdelijk verhoogde rechten.
      if (!(await passkeyStapOpGeldig(auth as StapOpAuth))) {
        await schrijfBeheerAudit({ actor: { id: auth.user.id, email: auth.user.email }, doel: { soort: 'agent', naam: 'namens-sessie' }, actie: 'agent.namens.geweigerd', resultaat: 'denied', reden: 'STEP_UP_REQUIRED' });
        return json({ error: 'STEP_UP_REQUIRED', reasonCode: 'STEP_UP_REQUIRED', methods: ['passkey'], maxAgeSeconds: 300 }, 403);
      }
    }
    try {
      const uit = await run(ctx, auth);
      if (opts.passkey) await stapOpVerbruiken(auth as StapOpAuth); // één bevestiging = één aanmaak/opruiming
      return json(uit);
    } catch (e) {
      const code = (e as Error).message || 'NAMENS_FOUT';
      if (/^[A-Z][A-Z0-9_]{2,60}$/.test(code)) return error(code, 400);
      console.error('[agent-namens]', code); return error('NAMENS_FOUT', 500);
    }
  }) as RouterMiddleware;
  return {
    'POST /api/owner/agent-namens/lijst': [eigenaar({}, async (_c, auth) => ({ ok: true, ...(await namensLijst(auth.user.id)), spoken: await spookSessies(auth.user.id),
      agents: V2_AGENTEN.map((a) => ({ slug: a.slug, naam: a.naam })), omvang: Object.entries(NAMENS_OMVANG).map(([id, o]) => ({ id, uk: o.uk, nl: o.nl })), grenzen: { min: NAMENS_MIN_MINUTEN, max: NAMENS_MAX_MINUTEN, standaard: NAMENS_STANDAARD_MINUTEN } }))],
    'POST /api/owner/agent-namens/aanmaken': [eigenaar({ passkey: true }, async (ctx, auth) => {
      const b = body(ctx.body);
      if (!isAgentSlug(b.agent)) throw new Error('NAMENS_AGENT_ONGELDIG');
      const ruimte = ruimteOf(b.ruimte);
      const omvang = Array.isArray(b.omvang) ? b.omvang.filter(isOmvang) : [];
      const s = await namensAanmaken({ userId: auth.user.id, email: auth.user.email, agent: b.agent, ruimte, minuten: Number(b.minuten) || NAMENS_STANDAARD_MINUTEN, omvang, methode: 'passkey' });
      return { ok: true, sessie: s };
    })],
    'POST /api/owner/agent-namens/intrekken': [eigenaar({}, async (ctx, auth) => {
      const b = body(ctx.body);
      if (!/^[0-9a-f-]{36}$/i.test(String(b.id || ''))) throw new Error('NAMENS_ID_ONGELDIG');
      const s = await namensIntrekken(auth.user.id, String(b.id), String(b.reden || ''), auth.user.email);
      if (!s) throw new Error('NAMENS_NIET_GEVONDEN');
      return { ok: true, sessie: s };
    })],
    'POST /api/owner/agent-namens/spoken/opruimen': [eigenaar({ passkey: true }, async (_c, auth) => ({ ok: true, verwijderd: await spookSessiesOpruimen(auth.user.id, auth.user.email) }))],
  };
}
