// AI-TERMIJN-001 (15.11.2026): database-kant van de AI-sessiedelegatie (app.tech_ruimte_ai, migratie 0285). De beslissing zelf is
// puur en staat in shared/ai-delegatie.ts (beoordeel). Deze module verzamelt de feiten (levende technische sessies + levende
// aanmeldingen van de eigenaar), trekt vervallen toestemmingen in (één keer, met journaal + meldingencentrum) en houdt
// «laatst gebruikt» bij voor de regel «inactief».
//
// База даних делегування ШІ: збирає факти, знімає прострочені дозволи (один раз, із журналом і сповіщенням) і веде «останнє
// використання» для правила неактивності. Самостійного технічного доступу без живого входу власника НЕМАЄ.
import { auditToevoegen } from '../server/platform/audit';
import { getPool } from '../server/platform/pg';
import { beoordeel, gevaren, INTREK_REDEN, type AiInstelling, type DelegatieFeit, type DelegatieUitkomst, type IntrekReden, type SessieFeit } from '../shared/ai-delegatie';
import { SERVICE_HOSTS } from './deployment-identiteit';
import { meld } from './melder';
import { agentSlugUitNaam } from '../shared/markering-agenten';

import { V2_AGENTEN } from '../shared/connector-v2/agenten';

// AGENTSCHEIDING-001: 'agent:gpt' → «ChatGPT» (naam van de agent), niet de kale slug; een token-id → «ШІ-підключення 1a2b3c4d».
const wieTekst = (vid: string) => vid === '*' ? 'Усі підключення ШІ / Alle AI-verbindingen'
  : vid.startsWith('agent:') ? (V2_AGENTEN.find((a) => a.slug === vid.slice(6))?.naam ?? vid.slice(6))
  : `ШІ-підключення / AI-koppeling ${vid.slice(0, 8)}`;
const agentenLink = () => `https://${SERVICE_HOSTS.mcp}/agenten`;

const sys = () => getPool('systeem');
const ms = (v: unknown): number | null => (v === null || v === undefined ? null : Number.isFinite(new Date(v as string).getTime()) ? new Date(v as string).getTime() : null);

const LIVE = `r.beeindigd_op IS NULL AND r.grens_op > now() AND (r.modus <> 'tijd' OR r.eind_op > now())`;
const AANMELDING_LEEFT = `COALESCE((s.data->>'revokedAt')::numeric, 0) = 0 AND (s.data->>'absoluteExpiresAt')::numeric > extract(epoch FROM now()) * 1000
  AND (s.data->>'idleExpiresAt')::numeric > extract(epoch FROM now()) * 1000 AND COALESCE(s.data->>'authMethod', '') <> 'agent-token'`;

export type DelegatieFeiten = { sessies: SessieFeit[]; aanmeldingen: string[] };

/** Levende technische sessies van de eigenaar (ook gepauzeerde) waarvan de aanmelding nog leeft, en alle levende aanmeldingen.
 *  Aanmeldingen «namens» een agent (authMethod agent-token) tellen NOOIT als aanmelding van de eigenaar. */
export async function feiten(userId: string): Promise<DelegatieFeiten> {
  const [rijen, aanm] = await Promise.all([
    sys().query(`SELECT r.id::text AS id, r.sessie_id, r.actief FROM app.tech_ruimte_sessies r
       JOIN app.records s ON s.tbl = 'owner_service_sessions_v1' AND s.id = r.sessie_id
      WHERE r.user_id = $1 AND ${LIVE} AND ${AANMELDING_LEEFT} ORDER BY r.begin_op DESC LIMIT 40`, [userId]),
    sys().query(`SELECT s.id FROM app.records s WHERE s.tbl = 'owner_service_sessions_v1' AND s.data->>'userId' = $1 AND ${AANMELDING_LEEFT} LIMIT 200`, [userId]),
  ]);
  return {
    sessies: rijen.rows.map((r: any) => ({ id: String(r.id), siteSessieId: String(r.sessie_id), actief: r.actief === 'technisch' ? 'technisch' : 'prive' })),
    aanmeldingen: aanm.rows.map((r: any) => String(r.id)),
  };
}

export const KOLOMMEN = `verbinding_id, ruimtes, termijn, eind_op, ruimte_sessie_id::text AS ruimte_sessie_id, site_sessie_id, gezet_op, bij_pauze, inactief_minuten,
  bij_afmelden, laatst_gebruikt_op, ingetrokken_op, ingetrokken_reden, gevaren`;

export function feitVanRij(r: any): DelegatieFeit {
  return {
    verbindingId: String(r.verbinding_id),
    technisch: Array.isArray(r.ruimtes) && r.ruimtes.includes('technisch'),
    termijn: r.termijn,
    eindOp: ms(r.eind_op),
    ruimteSessieId: r.ruimte_sessie_id ? String(r.ruimte_sessie_id) : null,
    siteSessieId: r.site_sessie_id ? String(r.site_sessie_id) : null,
    regels: { bijPauze: r.bij_pauze ?? 'pauzeren', inactiefMinuten: r.inactief_minuten === null || r.inactief_minuten === undefined ? null : Number(r.inactief_minuten), bijAfmelden: r.bij_afmelden ?? 'intrekken' },
    gezetOp: ms(r.gezet_op) ?? 0,
    laatstGebruiktOp: ms(r.laatst_gebruikt_op),
    ingetrokkenOp: ms(r.ingetrokken_op),
  };
}

/** Alle delegaties van de eigenaar (ook ingetrokken, voor de UI). */
export async function alle(userId: string): Promise<DelegatieFeit[]> {
  const r = await sys().query(`SELECT ${KOLOMMEN} FROM app.tech_ruimte_ai WHERE user_id = $1`, [userId]);
  return r.rows.map(feitVanRij);
}

/** De delegatie die voor deze verbinding geldt, in deze volgorde: eigen rij van het token → rij van de AGENT ('agent:claude', geldt ook
 *  voor een latere herverbinding van dezelfde AI — anders verliest «Підключити знову» stil de toestemming) → rij «alle verbindingen» ('*').
 *  Een specifiekere rij gaat ALTIJD voor, ook als ze ingetrokken of alleen-privé is (de eigenaar koos dan bewust iets anders). */
export function voorVerbinding(lijst: readonly DelegatieFeit[], verbindingId: string | null | undefined, agent?: string | null): DelegatieFeit | null {
  const eigen = verbindingId ? lijst.find((d) => d.verbindingId === verbindingId) : undefined;
  if (eigen) return eigen;
  const perAgent = agent ? lijst.find((d) => d.verbindingId === `agent:${agent}`) : undefined;
  return perAgent ?? lijst.find((d) => d.verbindingId === '*') ?? null;
}
/** Agent-slug van een AI-verbinding (token) van DEZE eigenaar; null als onbekend. Verbindingen van anderen bestaan hier niet. */
export async function agentVanVerbinding(userId: string, verbindingId: string | null | undefined): Promise<string | null> {
  if (!verbindingId || verbindingId === '*' || verbindingId.startsWith('agent:')) return verbindingId?.startsWith('agent:') ? verbindingId.slice(6) : null;
  const r = (await sys().query('SELECT agent, client_name FROM app.mcp_oauth_tokens WHERE id::text = $1 AND user_id = $2', [verbindingId, userId]).catch(() => ({ rows: [] as any[] }))).rows[0];
  return r ? (r.agent ? String(r.agent) : agentSlugUitNaam(r.client_name)) : null;
}

/** Eenmalig intrekken (alleen als nog niet ingetrokken) + journaal + meldingencentrum. Geeft true als DEZE oproep introk. */
export async function intrekken(userId: string, verbindingId: string, reden: IntrekReden | 'eigenaar', naam?: string): Promise<boolean> {
  const r = await sys().query(`UPDATE app.tech_ruimte_ai SET ingetrokken_op = now(), ingetrokken_reden = $3
     WHERE user_id = $1 AND verbinding_id = $2 AND ingetrokken_op IS NULL AND 'technisch' = ANY(ruimtes) RETURNING verbinding_id`, [userId, verbindingId, reden]);
  if (!r.rows.length) return false;
  await auditToevoegen({ ownerId: userId, actorId: reden === 'eigenaar' ? userId : 'systeem', action: 'owner.tech.ruimte.ai.ingetrokken', result: 'success',
    details: { verbinding: verbindingId, reden } }).catch(() => undefined);
  const wie = naam || wieTekst(verbindingId);
  const tekst = INTREK_REDEN[reden];
  await meld(userId, 'security', `Доступ ШІ до технічного простору знято: ${wie} / AI-toegang tot technische ruimte ingetrokken: ${wie}`,
    `Причина: ${tekst.uk}. Звичайний простір лишається. / Reden: ${tekst.nl}. De gewone ruimte blijft.`, agentenLink());
  meldMcpLijst(userId);
  return true;
}

const meldMcpLijst = (userId: string) => { void import('./connector-v2-stroom').then((m) => m.meldLijstGewijzigd(userId)).catch(() => undefined); };

/** Beoordeel één delegatie en trek ze in als de uitkomst dat zegt. */
export async function beoordeelEnRuim(userId: string, d: DelegatieFeit | null, f: DelegatieFeiten, nu = Date.now()): Promise<DelegatieUitkomst> {
  const u = beoordeel(d, f.sessies, f.aanmeldingen, nu);
  if (u.soort === 'intrekken' && d) await intrekken(userId, d.verbindingId, u.reden);
  return u;
}

/** Alle delegaties van één eigenaar nalopen (na pauze, einde sessie, afmelden, en periodiek). */
export async function veeg(userId: string): Promise<number> {
  try {
    const lijst = (await alle(userId)).filter((d) => d.technisch && d.ingetrokkenOp === null);
    if (!lijst.length) return 0;
    const f = await feiten(userId);
    let n = 0;
    for (const d of lijst) if ((await beoordeelEnRuim(userId, d, f)).soort === 'intrekken') n++;
    return n;
  } catch (err) { console.error('[ai-delegatie] vegen faalde:', (err as Error).message); return 0; }
}

// «Laatst gebruikt» hoogstens één keer per minuut per (eigenaar, verbinding) schrijven.
const gebruiktGeheugen = new Map<string, number>();
export async function gebruikt(userId: string, verbindingId: string): Promise<void> {
  const k = `${userId}\u0000${verbindingId}`, nu = Date.now();
  if ((gebruiktGeheugen.get(k) ?? 0) > nu) return;
  gebruiktGeheugen.set(k, nu + 60_000);
  // Precies de rij die voorVerbinding() kiest (token → agent → '*').
  try {
    const d = voorVerbinding(await alle(userId), verbindingId, await agentVanVerbinding(userId, verbindingId));
    if (d) await sys().query('UPDATE app.tech_ruimte_ai SET laatst_gebruikt_op = now() WHERE user_id = $1 AND verbinding_id = $2 AND ingetrokken_op IS NULL', [userId, d.verbindingId]);
  } catch { /* gebruik bijhouden mag een aanroep nooit breken */ }
}
export const _gebruiktLeeg = () => gebruiktGeheugen.clear();

// Periodiek: elke 2 minuten alle eigenaars met een open technische delegatie (verlopen en inactief komen zo ook zonder verzoek in het
// meldingencentrum). Start bij de eerste aanroep; unref → houdt het proces niet open (tests).
let veger: ReturnType<typeof setInterval> | null = null;
export function planVeger(): void {
  if (veger || process.env.NODE_ENV === 'test' || process.env.AI_DELEGATIE_VEGER === '0') return;
  veger = setInterval(() => {
    void (async () => {
      const r = await sys().query(`SELECT DISTINCT user_id FROM app.tech_ruimte_ai WHERE ingetrokken_op IS NULL AND 'technisch' = ANY(ruimtes) LIMIT 500`).catch(() => ({ rows: [] as any[] }));
      for (const x of r.rows) await veeg(String(x.user_id));
    })();
  }, 120_000);
  veger.unref?.();
}

/** Opslaan (nieuw of wijzigen) — met journaal en melding. `vorige` = de rij vóór de wijziging (voor «gewijzigd» vs «gegeven»). */
export async function opslaan(userId: string, o: { verbindingId: string; naam?: string; technisch: boolean; instelling: AiInstelling; ruimteSessieId: string; siteSessieId: string; nu?: number }): Promise<void> {
  const nu = o.nu ?? Date.now();
  const i = o.instelling;
  const gev = o.technisch ? gevaren(i, nu) : [];
  const vorige = (await sys().query(`SELECT ${KOLOMMEN} FROM app.tech_ruimte_ai WHERE user_id = $1 AND verbinding_id = $2`, [userId, o.verbindingId])).rows[0];
  await sys().query(`INSERT INTO app.tech_ruimte_ai (user_id, verbinding_id, ruimtes, termijn, eind_op, ruimte_sessie_id, site_sessie_id, bij_pauze, inactief_minuten, bij_afmelden, gevaren, gezet_op, laatst_gebruikt_op, ingetrokken_op, ingetrokken_reden)
      VALUES ($1, $2, $3, $4, to_timestamp($5::double precision / 1000), $6::uuid, $7, $8, $9, $10, $11, now(), NULL, NULL, NULL)
    ON CONFLICT (user_id, verbinding_id) DO UPDATE SET ruimtes = EXCLUDED.ruimtes, termijn = EXCLUDED.termijn, eind_op = EXCLUDED.eind_op,
      ruimte_sessie_id = EXCLUDED.ruimte_sessie_id, site_sessie_id = EXCLUDED.site_sessie_id, bij_pauze = EXCLUDED.bij_pauze,
      inactief_minuten = EXCLUDED.inactief_minuten, bij_afmelden = EXCLUDED.bij_afmelden, gevaren = EXCLUDED.gevaren, gezet_op = now(),
      laatst_gebruikt_op = NULL, ingetrokken_op = NULL, ingetrokken_reden = NULL`,
    [userId, o.verbindingId, o.technisch ? ['prive', 'technisch'] : ['prive'], i.termijn, i.eindOp, o.ruimteSessieId, o.siteSessieId,
      i.regels.bijPauze, i.regels.inactiefMinuten, i.regels.bijAfmelden, gev]);
  const was = vorige && Array.isArray(vorige.ruimtes) && vorige.ruimtes.includes('technisch') && !vorige.ingetrokken_op;
  const soort = !o.technisch ? (was ? 'ingetrokken' : 'prive') : was ? 'gewijzigd' : 'gegeven';
  await auditToevoegen({ ownerId: userId, actorId: userId, action: 'owner.tech.ruimte.ai', result: 'success',
    details: { verbinding: o.verbindingId, soort, technisch: o.technisch, termijn: i.termijn, eind: i.eindOp ? new Date(i.eindOp).toISOString() : null,
      bijPauze: i.regels.bijPauze, inactiefMinuten: i.regels.inactiefMinuten, bijAfmelden: i.regels.bijAfmelden, gevaren: gev, ruimteSessie: o.ruimteSessieId } }).catch(() => undefined);
  if (soort === 'prive') return;
  const wie = o.naam || wieTekst(o.verbindingId);
  const titel = soort === 'ingetrokken'
    ? `Доступ ШІ до технічного простору знято: ${wie} / AI-toegang tot technische ruimte ingetrokken: ${wie}`
    : soort === 'gewijzigd'
      ? `Змінено доступ ШІ до технічного простору: ${wie} / AI-toegang tot technische ruimte gewijzigd: ${wie}`
      : `Надано доступ ШІ до технічного простору: ${wie} / AI-toegang tot technische ruimte gegeven: ${wie}`;
  const tot = i.eindOp ? new Date(i.eindOp).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '';
  const waarsch = gev.length ? ` ⚠ ${gev.length} ризикованих вибори / riskante keuzes: ${gev.join(', ')}.` : '';
  await meld(userId, 'security', titel,
    soort === 'ingetrokken' ? 'Ви зняли дозвіл. Звичайний простір лишається. / U trok de toestemming in. De gewone ruimte blijft.'
      : `Термін: ${i.termijn}${tot ? ` до ${tot}` : ''}; пауза: ${i.regels.bijPauze}; неактивність: ${i.regels.inactiefMinuten ?? '∞'} хв.${waarsch} / Termijn: ${i.termijn}${tot ? ` tot ${tot}` : ''}; pauze: ${i.regels.bijPauze}; inactief: ${i.regels.inactiefMinuten ?? '∞'} min.`,
    agentenLink());
}

/** Expliciete «alleen gewone ruimte» voor een verbinding of agent (gaat vóór een algemenere regel). Laat een bestaande rij staan. */
export async function alleenPrive(userId: string, verbindingId: string): Promise<void> {
  await sys().query(`INSERT INTO app.tech_ruimte_ai (user_id, verbinding_id, ruimtes, termijn, ingetrokken_op, ingetrokken_reden)
      VALUES ($1, $2, ARRAY['prive'], 'onbepaald', now(), 'eigenaar') ON CONFLICT (user_id, verbinding_id) DO NOTHING`, [userId, verbindingId]);
}
