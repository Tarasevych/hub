// AI-beleid met handtekening van de eigenaar (§13.12): wie (welke AI) wat mag, met timers die de SERVER afdwingt.
//
// Vertrouwensmodel (zelfde als het goedkeuren van updates):
//  - Root bewaart de ondertekende keten in /var/lib/mijn-ruimte/ai-beleid/keten.json (root 0644). De app LEEST alleen.
//  - Een nieuwe versie: de eigenaar kiest wijzigingen in Beheer → «Доступ ШІ»; de app maakt een ontwerp (buildDraft) en een
//    eenmalige challenge over de sha256 van PRECIES dat ontwerp; de browser rekent die hash zelf na (wat u ziet = wat u tekent) en
//    tekent met een passkey; de app legt het verzoek in de goedkeur-inbox; root controleert de assertie opnieuw tegen ZIJN sleutels
//    (/etc/mijn-ruimte/goedkeur-passkeys.json), de ketenvolgorde en de tijd, en schrijft pas dan de nieuwe versie.
//  - Een agent, de extensie of zelfs een gecompromitteerde app kan dus niets aan het beleid veranderen zonder de passkey van de eigenaar.
//
// Afdwingen: connectors-tools.callTool vraagt per aanroep beslissing(namens, tool). Het beleid is een PLAFOND bovenop de bestaande
// instellingen (hulpmiddelmodi, grants per apparaat): de strengste van de twee wint. Zonder geïnstalleerd beleid verandert er niets
// (status «niet ingesteld», duidelijk getoond); een beschadigde keten = alles dicht voor AI (fail-closed).
import { randomBytes } from 'node:crypto';
import { readFile, stat, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import * as kern from '../deploy/goedkeuring/webauthn-kern.mjs';
import * as bk from '../deploy/goedkeuring/ai-beleid-kern.mjs';
import { error, isOwnerEmail, json } from '../server/platform';
import { auditToevoegen } from '../server/platform/audit';
import type { RouterMiddleware } from '../server/platform/router';
import { getPool } from '../server/platform/pg';
import { assertPolicy, buildDraft, diffPolicy, evaluate, listGrants, type Decision, type Op, type Policy } from '../shared/ai-beleid/model';
import { CAPABILITIES, capabilityForTool } from '../shared/ai-beleid/catalogus';
import { DEFAULT_TZ } from '../shared/ai-beleid/tijd';
import { CHAT_KLANT, type Namens } from './mcp-namens';
import { agentAudit } from './agent-audit';
import { assertieOpties, assertieUit, leesSleutels, uitdagingMaken, uitdagingVerbruiken, UitrolFout } from './uitrol-goedkeuring';

const beleidDir = () => process.env.AI_BELEID_DIR || '/var/lib/mijn-ruimte/ai-beleid';
const inbox = () => process.env.GOEDKEUR_INBOX || '/srv/mijn-ruimte/goedkeur-inbox';
const statusDir = () => process.env.OPDRACHT_STATUS_DIR || '/var/lib/mijn-ruimte-uitrol-status';
const TZ = () => process.env.AI_BELEID_TZ || DEFAULT_TZ;

export type Stand =
  | { staat: 'niet-ingesteld' }
  | { staat: 'ongeldig'; code: string }
  | { staat: 'geldig'; beleid: Policy; hash: string; versies: Array<{ seq: number; hash: string; op: string; ondertekend: Record<string, unknown> }> };

// ---------------------------------------------------------------- lezen (met cache op mtime/grootte)
let cache: { sleutel: string; stand: Stand } | null = null;
export async function leesStand(): Promise<Stand> {
  const p = path.join(beleidDir(), 'keten.json');
  let st;
  try { st = await stat(p); } catch { cache = null; return { staat: 'niet-ingesteld' }; }
  const sleutel = `${st.mtimeMs}:${st.size}:${st.ino}`;
  if (cache?.sleutel === sleutel) return cache.stand;
  let stand: Stand;
  try {
    if (!st.isFile() || st.size > 16 * 1024 * 1024) throw new Error('KETEN_ONGELDIG');
    const d = JSON.parse(await readFile(p, 'utf8'));
    const k = bk.ketenFout(d?.versies);
    if (!k.ok) stand = { staat: 'ongeldig', code: k.code };
    else {
      assertPolicy(k.laatste); // strenger dan de kern: alleen bekende mogelijkheden
      stand = { staat: 'geldig', beleid: k.laatste as Policy, hash: k.hash, versies: (d.versies as bk.KetenVersie[]).map((v) => ({ seq: v.beleid.seq, hash: String(v.hash || bk.beleidHash(v.beleid)), op: String(v.op || ''), ondertekend: (v.ondertekend ?? {}) as Record<string, unknown> })) };
    }
  } catch (err) {
    stand = { staat: 'ongeldig', code: (err as { code?: string }).code || 'KETEN_ONGELDIG' };
  }
  cache = { sleutel, stand };
  return stand;
}
/** Alleen voor tests: cache leeg (na het schrijven van een keten met dezelfde mtime). */
export const vergeetCache = () => { cache = null; };

// ---------------------------------------------------------------- welke agent in het beleid is deze AI-verbinding?
const normaal = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
/**
 * Op id (bv. «claude») of op de naam in het beleid (bv. «Claude»); hoofdletters en leestekens tellen niet.
 * `slug`: bij connector v2 de agent waaraan het token is gebonden (/<agent>, door de server vastgesteld). Die gaat vóór de naam
 * die de client zelf opgaf (bv. «ChatGPT» voor de agent «gpt»), zodat een eigenaar die de agent onder zijn gewone id heeft toegevoegd
 * niet per ongeluk «agent_unknown» krijgt.
 */
export function agentVoor(beleid: Policy, client: string | undefined, slug?: string): string | null {
  const sl = normaal(String(slug || ''));
  if (sl) for (const [id, a] of Object.entries(beleid.agents)) if (normaal(id) === sl || normaal(a.name) === sl) return id;
  const c = normaal(String(client || ''));
  if (!c) return null;
  for (const [id, a] of Object.entries(beleid.agents)) if (normaal(id) === c || normaal(a.name) === c) return id;
  // «Claude Code», «Claude (desktop)» → «claude», als er precies één agent past op het eerste woord.
  const eerste = c.split('-')[0];
  const treffers = Object.entries(beleid.agents).filter(([id, a]) => normaal(id) === eerste || normaal(a.name) === eerste);
  return treffers.length === 1 ? treffers[0][0] : null;
}

export type Beslissing = { mode: 'always' | 'ask' | 'off'; code: string; agentId: string | null; besluit?: Decision; staat: Stand['staat'] };
/** Beslissing voor één aanroep. Zonder beleid: geen beperking (bestaande regels gelden). Beschadigd: alles dicht. */
export async function beslissing(namens: Namens | undefined, tool: string, nu = Date.now()): Promise<Beslissing> {
  const s = await leesStand();
  if (s.staat === 'niet-ingesteld') return { mode: 'always', code: 'niet_ingesteld', agentId: null, staat: s.staat };
  if (s.staat === 'ongeldig') return { mode: 'off', code: `beleid_ongeldig:${s.code}`, agentId: null, staat: s.staat };
  const agentId = agentVoor(s.beleid, namens?.client, namens?.agent);
  const d = evaluate(s.beleid, agentId ?? '', tool, nu);
  return { mode: d.effect === 'allow' ? 'always' : d.effect === 'ask' ? 'ask' : 'off', code: d.code, agentId, besluit: d, staat: s.staat };
}
const RANG = { always: 0, ask: 1, off: 2 } as const;
/** De strengste van twee modi (beleid als plafond bovenop de instellingen van de site). */
export const strengste = (a: 'always' | 'ask' | 'off', b: 'always' | 'ask' | 'off') => (RANG[a] >= RANG[b] ? a : b);

/** Uitleg voor het model (Engels, zoals de andere weigeringen) bij een weigering door het beleid. */
export function weigerTekst(b: Beslissing): string {
  if (b.staat === 'ongeldig') return 'The owner\'s signed AI policy on this site could not be verified, so all AI actions are blocked until the owner fixes it. Tell the user; do not retry.';
  if (b.code === 'agent_unknown') return 'This AI connection is not listed in the owner\'s signed AI policy. Ask the user to add it (admin.tarasevych.com → AI access); do not try another way around it.';
  const rest = b.besluit?.reason ? ` (${b.besluit.reason})` : '';
  return `The owner's signed AI policy does not allow this right now${rest}. Ask the user to change it at admin.tarasevych.com → AI access; do not try to work around it.`;
}

// ---------------------------------------------------------------- voorstel en ondertekening (eigenaar)
type Eigenaar = { id: string; email?: string };
function fout(code: string, status = 400): never { throw new UitrolFout(code, status); }
const sys = () => getPool('systeem');

/** Bekende AI-verbindingen van de eigenaar (OAuth en agenttokens), met de agent uit het beleid waaraan ze gekoppeld zijn. */
async function verbindingen(userId: string, beleid: Policy | null) {
  const [o, t] = await Promise.all([
    sys().query(`SELECT id::text AS id, client_name, agent, revoked_at, last_used_at FROM app.mcp_oauth_tokens WHERE user_id = $1 ORDER BY last_used_at DESC NULLS LAST LIMIT 100`, [userId]).catch(() => ({ rows: [] as any[] })),
    sys().query(`SELECT id::text AS id, name, revoked_at, last_seen_at FROM app.mcp_console_tokens WHERE user_id = $1 ORDER BY last_seen_at DESC NULLS LAST LIMIT 100`, [userId]).catch(() => ({ rows: [] as any[] })),
  ]);
  const uit = new Map<string, { naam: string; soort: 'oauth' | 'token' | 'chat'; actief: boolean; agentId: string | null; laatst: number | null }>();
  for (const r of o.rows) { const k = `oauth:${String(r.client_name).toLowerCase()}`; if (!uit.has(k)) uit.set(k, { naam: String(r.client_name), soort: 'oauth', actief: !r.revoked_at, agentId: beleid ? agentVoor(beleid, r.client_name, r.agent || undefined) : null, laatst: r.last_used_at ? new Date(r.last_used_at).getTime() : null }); }
  for (const r of t.rows) { const k = `token:${String(r.name).toLowerCase()}`; if (!uit.has(k)) uit.set(k, { naam: String(r.name), soort: 'token', actief: !r.revoked_at, agentId: beleid ? agentVoor(beleid, r.name) : null, laatst: r.last_seen_at ? new Date(r.last_seen_at).getTime() : null }); }
  return [...uit.values(), { naam: CHAT_KLANT, soort: 'chat' as const, actief: true, agentId: beleid ? agentVoor(beleid, CHAT_KLANT) : null, laatst: null }];
}

/**
 * Uitrol-hulpmiddelen via MCP (voorstel voorbereiden, status): een voorstel zet nog niets live — elk voorstel keurt de eigenaar
 * apart goed met de passkey. Daarom telt hier alleen «uit» (de schakelaar «Розгортання для всіх агентів» of per agent).
 * Geeft de weigertekst of null.
 */
export async function uitrolWeigering(namens: Namens | undefined, tool: string, nu = Date.now()): Promise<string | null> {
  const b = await beslissing(namens, tool, nu);
  return b.mode === 'off' ? weigerTekst(b) : null;
}

/**
 * Catalogus voor het scherm, LEVEND opgebouwd uit de hulpmiddelen die deze server echt aanbiedt: per mogelijkheid de
 * hulpmiddelen die eronder vallen, en apart de hulpmiddelen zonder mogelijkheid (die vragen altijd de eigenaar). Zo
 * verschijnt een nieuwe groep (bv. «Додатки») vanzelf, zonder dat de pagina iets hoeft te weten.
 */
export async function catalogus() {
  const { publiekeToolNamen } = await import('./connectors-hulpmiddelen');
  const { UITROL_TOOL_NAMEN } = await import('./uitrol-goedkeuring');
  const namen = [...new Set([...publiekeToolNamen(), ...UITROL_TOOL_NAMEN])].sort();
  const perCap = new Map<string, string[]>();
  const zonderGroep: string[] = [];
  for (const n of namen) { const c = capabilityForTool(n); if (!c) zonderGroep.push(n); else perCap.set(c, [...(perCap.get(c) ?? []), n]); }
  return { mogelijkheden: CAPABILITIES.map((c) => ({ ...c, tools: perCap.get(c.id) ?? [] })), zonderGroep };
}

/**
 * Laatste activiteit per AI (uit het onveranderlijke logboek, acties «owner.mcp.tool» van de laatste 30 dagen): wanneer, hoeveel in
 * 24 uur, hoeveel geweigerd en welk hulpmiddel het laatst. Het scherm sorteert hier de agenten mee («laatst gebruikt eerst»).
 * Alleen lezen; een fout hier mag het overzicht niet breken.
 */
export async function activiteit(userId: string, beleid: Policy | null) {
  try {
    const r = await sys().query(`SELECT details->>'client' AS client, details->>'agent' AS agent, max(created_at) AS laatst,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS n24,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND result <> 'success')::int AS geweigerd24,
        (array_agg(details->>'tool' ORDER BY id DESC))[1] AS tool, (array_agg(result ORDER BY id DESC))[1] AS resultaat
      FROM app.audit WHERE owner_id = $1 AND action = 'owner.mcp.tool' AND created_at > now() - interval '30 days'
      GROUP BY 1, 2 ORDER BY max(created_at) DESC LIMIT 200`, [userId]);
    const perAgent = new Map<string, { laatst: number; n24: number; geweigerd24: number; tool: string; resultaat: string }>();
    for (const x of r.rows) {
      const id = beleid ? agentVoor(beleid, x.client || '', x.agent || undefined) : null;
      if (!id) continue;
      const t = new Date(x.laatst).getTime();
      const o = perAgent.get(id);
      if (!o) perAgent.set(id, { laatst: t, n24: x.n24, geweigerd24: x.geweigerd24, tool: String(x.tool || ''), resultaat: String(x.resultaat || '') });
      else { o.n24 += x.n24; o.geweigerd24 += x.geweigerd24; if (t > o.laatst) { o.laatst = t; o.tool = String(x.tool || ''); o.resultaat = String(x.resultaat || ''); } }
    }
    return Object.fromEntries(perAgent);
  } catch { return {}; }
}

/**
 * De WARE stand per AI-agent (v2-koppelingen, erfenis van het oude /mcp, serverdeur, levende kant, hulpmiddelen nu) — dezelfde bron
 * als de hub (backend/connector-v2.ts → agentStanden). 20.10.2026: admin → Доступ ШІ toonde alleen het beleid en zei «немає
 * підключень» terwijl Claude via de deur werkte («Агенти досі не інтегровано?»). Een fout hier mag het overzicht niet breken.
 */
async function agentStand(userId: string) {
  try { const { agentStanden } = await import('./connector-v2'); return await agentStanden(userId); }
  catch (err) { console.error('[ai-beleid] stand van de agenten onbepaalbaar:', (err as Error).message); return null; }
}

export async function overzicht(eigenaar: Eigenaar) {
  const s = await leesStand();
  const nu = Date.now();
  const b = await leesSleutels();
  const sleutels = b.sleutels.map((k) => ({ label: k.label, vingerafdruk: k.vingerafdruk.slice(0, 16) }));
  const basis = { serverNow: nu, tz: TZ(), ...(await catalogus()), sleutels, rpId: b.rpId, origins: b.origins, agenten: await agentStand(eigenaar.id) };
  if (s.staat !== 'geldig') return { ...basis, staat: s.staat, code: s.staat === 'ongeldig' ? s.code : undefined, verbindingen: await verbindingen(eigenaar.id, null) };
  return { ...basis, staat: s.staat, beleid: s.beleid, hash: s.hash, versies: s.versies.slice(-20).reverse(), rijen: listGrants(s.beleid, nu, TZ()), verbindingen: await verbindingen(eigenaar.id, s.beleid), activiteit: await activiteit(eigenaar.id, s.beleid) };
}

const MAX_OPS = 64;
/** Stap 1: ontwerp + challenge. Niets geldt nog; de eigenaar ziet de wijzigingen (diff) en tekent of laat het. */
export async function voorstel(eigenaar: Eigenaar, ops: unknown) {
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > MAX_OPS) fout('OPS_ONGELDIG');
  const s = await leesStand();
  if (s.staat !== 'geldig') fout(s.staat === 'niet-ingesteld' ? 'BELEID_NIET_GESTART' : 'BELEID_KETEN_ONGELDIG', 409);
  const b = await leesSleutels();
  if (!b.sleutels.length) fout('GEEN_PASSKEY', 409);
  const nu = Date.now();
  let ontwerp: Policy;
  try { ontwerp = buildDraft(s.beleid, s.hash, ops as Op[], nu, TZ()); assertPolicy(ontwerp); }
  catch (err) { fout(`ONTWERP_${String((err as { code?: string }).code || 'ONGELDIG').toUpperCase()}`); }
  const beleidHash = bk.beleidHash(ontwerp!);
  const u = await uitdagingMaken(eigenaar.id, 'ai-beleid', beleidHash, { beleidHash });
  return { uitdagingId: u.id, verloopt: u.verloopt, nonce: u.nonce, beleidHash, ontwerp: ontwerp!, diff: diffPolicy(s.beleid, ontwerp!, nu, TZ()), publicKey: assertieOpties(u.uitdaging, b) };
}

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Stap 2: assertie van de eigenaar → verzoek voor root; wacht kort op het antwoord van root. */
export async function ondertekenen(eigenaar: Eigenaar, input: { uitdagingId?: unknown; ontwerp?: unknown; assertie?: unknown }, opties: { wachtMs?: number } = {}) {
  const assertie = assertieUit(input.assertie);
  const u = await uitdagingVerbruiken(eigenaar.id, input.uitdagingId, 'ai-beleid');
  const ontwerp = input.ontwerp as Policy;
  let hash = '';
  try { assertPolicy(ontwerp); hash = bk.beleidHash(ontwerp); } catch { fout('ONTWERP_ONGELDIG'); }
  // Het ontwerp moet PRECIES zijn wat de app voorstelde (de challenge hangt aan de hash ervan).
  if (hash !== u.onderwerp) fout('ONTWERP_GEWIJZIGD', 409);
  const s = await leesStand();
  if (s.staat !== 'geldig') fout('BELEID_KETEN_ONGELDIG', 409);
  const volg = bk.volgendeFout(s.beleid, ontwerp);
  if (volg) fout(volg === 'VERSIE_VERSCHILT' ? 'VERSIE_VERSCHILT_BELEID' : volg, 409);
  // Vooraf controleren (snelle, duidelijke melding); root controleert straks alles opnieuw met zijn eigen sleutels.
  const b = await leesSleutels();
  const verwacht = kern.uitdagingVoor('ai-beleid', { beleidHash: hash, nonce: u.nonce, verloopt: u.verloopt });
  const r = kern.verifieerAssertie({ assertie, verwachteUitdaging: verwacht, rpId: b.rpId, origins: [...new Set([...b.origins, ...(kern.originHoortBijRp('https://mcp.tarasevych.com', b.rpId) ? ['https://mcp.tarasevych.com'] : [])])], sleutels: b.sleutels });
  if (!r.ok) {
    await auditToevoegen({ ownerId: eigenaar.id, actorId: eigenaar.id, action: 'ai_beleid_geweigerd', type: 'beveiliging', result: 'denied', details: { seq: ontwerp.seq, code: r.code } }).catch(() => undefined);
    fout(`PASSKEY_${r.code}`, 403);
  }
  const id = randomBytes(16).toString('hex');
  await mkdir(inbox(), { recursive: true });
  const tmp = path.join(inbox(), `.ai-beleid-${id}.deel`);
  await writeFile(tmp, JSON.stringify({ doel: 'ai-beleid', ontwerp, nonce: u.nonce, verloopt: u.verloopt, assertie }) + '\n', { mode: 0o640 });
  await rename(tmp, path.join(inbox(), `ai-beleid-${id}.json`));
  await writeFile(path.join(inbox(), 'sleutel-aanvraag'), `${new Date().toISOString()} ai-beleid ${id}\n`, { mode: 0o640 });
  // Antwoord van root afwachten (de path-unit start binnen een seconde); daarna gewoon «in behandeling».
  const einde = Date.now() + (opties.wachtMs ?? 15_000);
  let uitkomst: { uitkomst?: string; code?: string; uk?: string; nl?: string; seq?: number } | null = null;
  while (Date.now() < einde) {
    try { uitkomst = JSON.parse(await readFile(path.join(statusDir(), `ai-beleid-${id}.json`), 'utf8')); break; } catch { await wacht(400); }
  }
  const resultaat = uitkomst ? (uitkomst.uitkomst === 'klaar' ? 'klaar' : 'geweigerd') : 'in-behandeling';
  await auditToevoegen({ ownerId: eigenaar.id, actorId: eigenaar.id, action: resultaat === 'klaar' ? 'ai_beleid_gewijzigd' : resultaat === 'geweigerd' ? 'ai_beleid_geweigerd' : 'ai_beleid_aangeboden', type: 'beveiliging',
    result: resultaat === 'geweigerd' ? 'denied' : 'success', details: { seq: ontwerp.seq, hash: hash.slice(0, 16), passkey: r.vingerafdruk.slice(0, 16), code: uitkomst?.code ?? null } }).catch(() => undefined);
  // Wie veranderde wat aan welke agent: per agent een regel in het journaal (vaste vorm, zie backend/agent-audit.ts), met vóór/na en de passkey.
  // Bij «in behandeling» is het nog een aanbod; pas bij «klaar» gelden de rechten (en volgt de synchronisatie van «Хто готує оновлення»).
  const wijzigingen = diffPolicy(s.beleid, ontwerp, Date.now(), TZ()).slice(0, 40);
  const actie = resultaat === 'klaar' ? 'agent.policy.gewijzigd' : resultaat === 'geweigerd' ? 'agent.policy.geweigerd' : 'agent.policy.aangeboden';
  const actor = { id: eigenaar.id, email: eigenaar.email };
  const reden = resultaat === 'geweigerd' ? String(uitkomst?.code || 'geweigerd') : '';
  const metAgent = wijzigingen.filter((w) => w.agentId);
  for (const w of metAgent.slice(0, 20)) {
    await agentAudit({ ownerId: eigenaar.id, actor, action: actie, result: resultaat === 'geweigerd' ? 'denied' : 'success', target: { type: 'agent', id: String(w.agentId), label: w.capability || w.kind }, agent: String(w.agentId),
      before: w.from, after: w.to, reason: reden, extra: { onderdeel: w.text, capability: w.capability ?? null, beleidSeq: ontwerp.seq, passkey: r.vingerafdruk.slice(0, 16), uitkomst: resultaat } });
  }
  if (!metAgent.length) await agentAudit({ ownerId: eigenaar.id, actor, action: actie, result: resultaat === 'geweigerd' ? 'denied' : 'success', target: { type: 'beleid', id: String(ontwerp.seq), label: 'AI-beleid' }, agent: null,
    before: `versie ${s.beleid.seq}`, after: `versie ${ontwerp.seq}`, reason: reden, extra: { wijzigingen: wijzigingen.map((w) => w.text), passkey: r.vingerafdruk.slice(0, 16), uitkomst: resultaat } });
  if (resultaat === 'klaar') {
    // Het beleid is nu actief: de rechten in «Хто готує оновлення» volgen. Mislukt dit, dan haalt het overzicht het bij het openen alsnog in.
    vergeetCache();
    try { const m = await import('./uitrol-beleid-sync'); await m.synchroniseerGrants(eigenaar, `beleid versie ${ontwerp.seq}`); }
    catch (err) { console.error('[ai-beleid] synchronisatie van rechten mislukt:', (err as Error).message); }
  }
  vergeetCache();
  return { id, resultaat, code: uitkomst?.code ?? null, uk: uitkomst?.uk ?? null, nl: uitkomst?.nl ?? null, seq: ontwerp.seq };
}

// ---------------------------------------------------------------- routes
type SessionOk = { user: { id: string; email?: string; role?: string; status?: string }; service: string };
type RequireSession = (event: Record<string, unknown>, body: unknown) => Promise<SessionOk | { errorCode: string }>;
type Ctx = { event: Record<string, unknown>; body: unknown };
const lichaam = (b: unknown) => (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;

export function aiBeleidRoutes(deps: { requireSession: RequireSession }): Record<string, RouterMiddleware[]> {
  /**
   * Alleen de eigenaar. Beheer op mcp-host /agents (waar de AI-verbindingen staan) en gespiegeld op admin-host /ai; root accepteert
   * voor het AI-beleid (alleen dit doel) ook de origin van mcp-host (goedkeur-hulp.mjs BELEID_EXTRA_ORIGINS).
   */
  const eigenaar = (diensten: readonly string[], run: (ctx: Ctx, e: Eigenaar) => Promise<unknown>) => (async (raw) => {
    const ctx = raw as unknown as Ctx;
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth) return error(auth.errorCode, auth.errorCode.includes('FORBIDDEN') ? 403 : 401);
    if (!diensten.includes(auth.service)) return error('ADMIN_SERVICE_REQUIRED', 403);
    if (!(auth.user.role === 'owner' && isOwnerEmail(auth.user.email))) return error('OWNER_REQUIRED', 403);
    try { return json(await run(ctx, { id: auth.user.id, email: auth.user.email })); }
    catch (err) {
      if (err instanceof UitrolFout) return error(err.code, err.status);
      console.error('[ai-beleid]', (err as Error).message);
      return error('AI_BELEID_FOUT', 500);
    }
  }) as RouterMiddleware;
  return {
    'POST /api/owner/ai-beleid/overzicht': [eigenaar(['admin', 'mcp'], async (_ctx, e) => overzicht(e))],
    'POST /api/owner/ai-beleid/voorstel': [eigenaar(['admin', 'mcp'], async (ctx, e) => voorstel(e, lichaam(ctx.body).ops))],
    'POST /api/owner/ai-beleid/ondertekenen': [eigenaar(['admin', 'mcp'], async (ctx, e) => ondertekenen(e, lichaam(ctx.body)))],
  };
}
