// «Усі користувачі» voor de browserextensie (0.6, contract §3): beleid, intrekken en verlengen voor ANDERE gebruikers.
//
// Wie: de eigenaar, of een lopende technische activering in DIT tabblad met de mogelijkheid 'users.manage' (shared/tech-rollen.ts).
// Harde regels (hier afgedwongen):
//  - het beleid en de ontgrendelingen van de eigenaar wijzigt alleen de eigenaar zelf (EIGENAAR_ONAANTASTBAAR);
//  - wie niet de eigenaar is, verandert zijn EIGEN beleid niet en verlengt zijn eigen toegang niet (NIET_AAN_JEZELF) — intrekken mag altijd;
//  - verlengen blijft binnen het beleid; technisch nooit voorbij de lopende activering of 8 uur, prive nooit voorbij de toestemmingen of 30 dagen;
//  - strenger beleid trekt lopende ontgrendelingen die erbuiten vallen meteen in (push 'vergrendel', reden 'beleid');
//  - alles in app.audit (ook het bekijken en elke weigering); intrekken/beperken door een ander → melding aan de gebruiker (soort 'security').
import { getPool } from '../server/platform/pg';
import { BeleidFout, capsBinnenBeleid, leesBeleid, leesBeleidVoor, maxDuurMs, ruimteAan, schrijfBeleid, valideerBeleidInvoer } from './extensie-beleid';
import * as eo from './extensie-ontgrendeling';
import { meld } from './melder';
import * as tp from './tech-profiel';
import { isAiRuimte, ruimteOf, type AiRuimte } from '../shared/ai-ruimte';
import { MAX_DUUR_MS, STANDAARD_BELEID, type ExtensieBeheerAntwoord, type ExtensieBeheerGebruiker, type ExtensieBeleid, type Weigercode } from '../shared/extensie-ontgrendeling';

const sys = () => getPool('systeem');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : 0);
const weiger = (code: Weigercode, detail = ''): never => { throw new eo.Weigering(code, detail); };
export type Door = 'eigenaar' | 'users.manage';

type Doel = tp.Gebruiker & { naam: string };
async function gebruikerVan(userId: unknown): Promise<Doel> {
  const id = String(userId ?? '');
  if (!id || id.length > 200) weiger('GEBRUIKER_ONBEKEND');
  const r = (await sys().query(`SELECT id, data->>'email' AS email, data->>'role' AS role, data->>'status' AS status, COALESCE(data->>'name', '') AS naam FROM app.records
     WHERE tbl = 'users' AND id = $1 AND COALESCE((data->>'deletedAt')::numeric, 0) = 0`, [id])).rows[0];
  if (!r) weiger('GEBRUIKER_ONBEKEND');
  return { id: String(r.id), email: String(r.email || ''), role: String(r.role || ''), status: String(r.status || ''), naam: String(r.naam || '') };
}

/** Wie beheert hier? Weigert (en legt vast) zonder recht. */
export async function bevoegdheid(a: eo.Aanroep, actie: string): Promise<Door> {
  if (tp.isEigenaar(a.user)) return 'eigenaar';
  const act = tp.TAB_RE.test(String(a.tabContext || '')) ? await tp.actieveActivatie(a.user.id, a.tabContext, eo.sessieVan(a)) : null;
  if (act?.mogelijkheden.includes('users.manage')) return 'users.manage';
  return weiger('GEEN_BEHEERRECHT', actie);
}

/** Mag `actor` (met recht `door`) aan de toegang van `doel` komen? `zelfMag`: intrekken van jezelf is altijd goed. */
async function magAan(a: eo.Aanroep, door: Door, doel: Doel, actie: string, zelfMag: boolean): Promise<void> {
  let code: Weigercode | null = null;
  if (tp.isEigenaar(doel) && doel.id !== a.user.id) code = 'EIGENAAR_ONAANTASTBAAR';
  else if (door !== 'eigenaar' && doel.id === a.user.id && !zelfMag) code = 'NIET_AAN_JEZELF';
  if (code) weiger(code, `${actie}:${doel.id}`);
}

/** Valt een lopende rij buiten dit beleid? */
export function buitenBeleid(r: eo.Rij, b: ExtensieBeleid): boolean {
  const ruimte = ruimteOf(r.ruimte);
  if (!ruimteAan(b, ruimte)) return true;
  if (r.caps.some((c) => !capsBinnenBeleid(b, ruimte, [c]).length)) return true;
  if (ms(r.eind_op) - ms(r.begin_op) > maxDuurMs(b, ruimte) + 1000) return true;
  return !!r.lokaal && !b.lokaalAan;
}

const wieTekst = (a: eo.Aanroep, door: Door) => (door === 'eigenaar' ? 'Власник / De eigenaar' : `Адміністратор ${a.user.email || ''} / Beheerder ${a.user.email || ''}`.trim());

// ---------------------------------------------------------------- GET
export async function lijst(a: eo.Aanroep): Promise<ExtensieBeheerAntwoord> { return metAudit(a, 'lijst', async () => {
  const door = await bevoegdheid(a, 'lijst');
  const users = (await sys().query(`SELECT id, data->>'email' AS email, data->>'role' AS role, data->>'status' AS status, COALESCE(data->>'name', '') AS naam FROM app.records
     WHERE tbl = 'users' AND COALESCE((data->>'deletedAt')::numeric, 0) = 0 AND COALESCE((data->>'retiredAt')::numeric, 0) = 0
     ORDER BY lower(data->>'email') LIMIT 500`)).rows as Array<{ id: string; email: string | null; role: string | null; status: string | null; naam: string }>;
  const ids = users.map((u) => String(u.id));
  const [beleid, profielen, agents, rijen] = await Promise.all([
    leesBeleidVoor(ids),
    sys().query('SELECT user_id FROM app.tech_profielen WHERE user_id = ANY($1) AND ingetrokken_op IS NULL', [ids]),
    sys().query(`SELECT id, user_id, name, ruimte, pairing_id, agent_version FROM app.agents WHERE user_id = ANY($1) AND platform = 'browser' AND revoked_at IS NULL ORDER BY created_at`, [ids]),
    eo.lopendeRijen(ids),
  ]);
  const metProfiel = new Set(profielen.rows.map((r: any) => String(r.user_id)));
  const gebruikers: ExtensieBeheerGebruiker[] = users.map((u) => {
    const g = { id: String(u.id), email: String(u.email || ''), role: String(u.role || '') };
    const eigenaar = tp.isEigenaar(g);
    return {
      userId: g.id, email: g.email, naam: String(u.naam || ''), techProfiel: eigenaar || metProfiel.has(g.id), eigenaar,
      bewerkbaar: eigenaar ? g.id === a.user.id : !(door !== 'eigenaar' && g.id === a.user.id),
      beleid: beleid.get(g.id) ?? leegBeleid(),
      browsers: agents.rows.filter((x: any) => String(x.user_id) === g.id).map((x: any) => {
        const rij = rijen.find((r) => r.agent_id === String(x.id));
        return {
          agentId: String(x.id), naam: String(x.name), ruimte: ruimteOf(x.ruimte), browserId: eo.browserIdVan({ id: String(x.id), pairing_id: x.pairing_id }),
          online: eo.isVerbonden(String(x.id)), versie: eo.liveVersie(String(x.id)) || String(x.agent_version || ''), ontgrendeling: rij ? eo.ontgrendelingVan(rij) : null,
        };
      }),
    };
  });
  await eo.audit(a.user.id, 'owner.extensie.beheer.bekeken', 'success', { door, gebruikers: gebruikers.length, dienst: a.service });
  return { gebruikers, door, nu: Date.now() };
}); }
const leegBeleid = (): ExtensieBeleid => ({ ...STANDAARD_BELEID });

/** Elke weigering van een beheerroute in app.audit (bij wie het vroeg), daarna doorgeven. */
async function metAudit<T>(a: eo.Aanroep, actie: string, fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (err) {
    if (err instanceof eo.Weigering) await eo.audit(a.user.id, 'owner.extensie.beheer.geweigerd', 'denied', { reden: err.code, actie, ...(err.detail ? { detail: err.detail.slice(0, 80) } : {}) });
    throw err;
  }
}

// ---------------------------------------------------------------- beleid
export async function beleidZetten(a: eo.Aanroep, input: Record<string, unknown>): Promise<{ ok: true; beleid: ExtensieBeleid; ingetrokken: number }> { return metAudit(a, 'beleid', async () => {
  const door = await bevoegdheid(a, 'beleid');
  const doel = await gebruikerVan(input.userId);
  await magAan(a, door, doel, 'beleid', false);
  let invoer;
  try { invoer = valideerBeleidInvoer(input); }
  catch (err) { if (err instanceof BeleidFout) weiger('ONGELDIG', err.veld); throw err; }
  const { voor, na } = await schrijfBeleid(doel.id, invoer!, a.user.email || a.user.id);
  const buiten = (await eo.lopendeRijen([doel.id])).filter((r) => buitenBeleid(r, na));
  let ingetrokken = 0;
  for (const r of buiten) ingetrokken += (await eo.intrekkenRijen(doel.id, { gid: String(r.id) }, 'beleid', 'beheer', a.user.id)).length;
  const details = { door, doel: doel.id, doelEmail: doel.email, voor, na: { ...na, gewijzigdOp: undefined }, ingetrokken, dienst: a.service };
  await eo.audit(doel.id, 'owner.extensie.beleid', 'success', details, a.user.id);
  if (doel.id !== a.user.id) {
    await eo.audit(a.user.id, 'owner.extensie.beleid', 'success', details, a.user.id);
    if (ingetrokken || strenger(voor, na)) {
      await meld(doel.id, 'security', 'Доступ розширення браузера обмежено / Toegang van de browserextensie beperkt',
        `${wieTekst(a, door)}: правила доступу ШІ через розширення змінено${ingetrokken ? `, відкликано відкритих доступів: ${ingetrokken}` : ''}. / De regels voor AI-toegang via de extensie zijn gewijzigd${ingetrokken ? `, ingetrokken: ${ingetrokken}` : ''}.`,
        'https://mcp.tarasevych.com/agents#dostupy');
    }
  }
  return { ok: true as const, beleid: na, ingetrokken };
}); }
function strenger(voor: ExtensieBeleid, na: ExtensieBeleid): boolean {
  const minder = (v: string[] | null, n: string[] | null) => (n !== null && (v === null || v.some((c) => !n.includes(c))));
  return (voor.priveAan && !na.priveAan) || (voor.technischAan && !na.technischAan) || (voor.lokaalAan && !na.lokaalAan)
    || minder(voor.priveCaps, na.priveCaps) || minder(voor.technischCaps, na.technischCaps)
    || na.priveMaxDagen < voor.priveMaxDagen || na.technischMaxMinuten < voor.technischMaxMinuten;
}

// ---------------------------------------------------------------- intrekken
export async function intrekkenVoor(a: eo.Aanroep, input: Record<string, unknown>): Promise<{ ok: true; ingetrokken: number }> { return metAudit(a, 'intrekken', async () => {
  const door = await bevoegdheid(a, 'intrekken');
  const doel = await gebruikerVan(input.userId);
  await magAan(a, door, doel, 'intrekken', true);
  const agentId = input.agentId === undefined || input.agentId === null ? null : String(input.agentId);
  if (agentId !== null && !UUID.test(agentId)) weiger('ONGELDIG', 'agentId');
  const ruimte: AiRuimte | null = input.ruimte === undefined || input.ruimte === null ? null : (isAiRuimte(input.ruimte) ? input.ruimte : weiger('ONGELDIG', 'ruimte'));
  const rows = await eo.intrekkenRijen(doel.id, { agentId, ruimte, alles: !agentId && !ruimte }, 'beheer', 'beheer', a.user.id);
  const details = { door, doel: doel.id, doelEmail: doel.email, agentId: agentId ?? '', ruimte: ruimte ?? 'alle', ingetrokken: rows.length, dienst: a.service };
  await eo.audit(doel.id, 'owner.extensie.beheer.ingetrokken', 'success', details, a.user.id);
  if (doel.id !== a.user.id) {
    await eo.audit(a.user.id, 'owner.extensie.beheer.ingetrokken', 'success', details, a.user.id);
    if (rows.length) {
      await meld(doel.id, 'security', 'Доступ розширення браузера відкликано / Toegang van de browserextensie ingetrokken',
        `${wieTekst(a, door)} відкликав(ла) відкритий доступ ШІ через розширення (${rows.length}). Відкрити знову можна на сторінці «Підключення ШІ». / Heeft de open AI-toegang via de extensie ingetrokken (${rows.length}).`,
        'https://mcp.tarasevych.com/agents#extensie');
    }
  }
  return { ok: true as const, ingetrokken: rows.length };
}); }

// ---------------------------------------------------------------- verlengen
export async function verlengen(a: eo.Aanroep, input: Record<string, unknown>): Promise<{ ok: true; ontgrendeling: ReturnType<typeof eo.ontgrendelingVan>; verzonden: boolean; gekapt: boolean }> { return metAudit(a, 'verlengen', async () => {
  const door = await bevoegdheid(a, 'verlengen');
  const gid = String(input.gid ?? '');
  if (!UUID.test(gid)) weiger('ONGELDIG', 'gid');
  const heeftMin = input.minuten !== undefined, heeftDagen = input.dagen !== undefined;
  if (heeftMin === heeftDagen) weiger('ONGELDIG', 'minuten|dagen');
  const n = Number(heeftMin ? input.minuten : input.dagen);
  if (!Number.isInteger(n) || n < 1 || (heeftMin ? n > 480 : n > 30)) weiger('DUUR_ONGELDIG');
  const r = (await sys().query(`SELECT o.* FROM app.extensie_ontgrendelingen o WHERE o.id = $1 AND ${eo.ACTIEF}`, [gid])).rows[0] as eo.Rij | undefined;
  if (!r) weiger('ONTGRENDELING_ONBEKEND');
  const rij = r!;
  const doel = await gebruikerVan(rij.user_id);
  await magAan(a, door, doel, 'verlengen', false);
  const ruimte = ruimteOf(rij.ruimte);
  const beleid = await leesBeleid(doel.id);
  if (!ruimteAan(beleid, ruimte)) weiger('BELEID_UIT');
  if (buitenBeleid(rij, beleid)) weiger('BUITEN_BELEID', 'rij');
  const begin = ms(rij.begin_op), eind = ms(rij.eind_op);
  const gevraagd = eind + n * (heeftMin ? 60_000 : 86_400_000);
  const grenzen = [begin + maxDuurMs(beleid, ruimte), begin + MAX_DUUR_MS[ruimte] - 1000];
  if (ruimte === 'technisch') {
    // Nooit voorbij de lopende activering (geen activering = niets te verlengen).
    const act = rij.activatie_id ? (await sys().query('SELECT eind_op FROM app.tech_activaties WHERE id::text = $1 AND user_id = $2 AND beeindigd_op IS NULL AND eind_op > now()', [rij.activatie_id, doel.id])).rows[0] : null;
    if (!act) weiger('TECH_NIET_ACTIEF');
    grenzen.push(ms(act.eind_op));
  } else {
    const t = await eo.priveToestemming(doel.id, rij.agent_id, beleid);
    if (!t.tot || rij.caps.some((c) => !t.caps.includes(c as never))) weiger('BUITEN_BELEID', 'toestemming');
    grenzen.push(t.tot!);
  }
  const nieuwEind = Math.min(gevraagd, ...grenzen);
  if (nieuwEind <= eind + 1000) weiger('BUITEN_BELEID', 'grens');
  const uit = await eo.eindeZetten(rij, nieuwEind);
  if (!uit) weiger('ONTGRENDELING_ONBEKEND');
  const details = { door, doel: doel.id, gid, ruimte, agentId: rij.agent_id, van: new Date(eind).toISOString(), tot: new Date(ms(uit!.rij.eind_op)).toISOString(), gekapt: nieuwEind < gevraagd, verzonden: uit!.verzonden, dienst: a.service };
  await eo.audit(doel.id, 'owner.extensie.verlengd', 'success', details, a.user.id);
  if (doel.id !== a.user.id) await eo.audit(a.user.id, 'owner.extensie.verlengd', 'success', details, a.user.id);
  return { ok: true as const, ontgrendeling: eo.ontgrendelingVan(uit!.rij), verzonden: uit!.verzonden, gekapt: nieuwEind < gevraagd };
}); }
