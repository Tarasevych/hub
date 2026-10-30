// Opdracht-terminal (zone G, 22.10.2026): «Термінал» van het technisch profiel op de server zelf (agent als beheer) of een Windows-pc
// (PowerShell). Eén regel = één programma; de regel wordt HIER ontleed (shared/terminal-opdrachten.ts, geen shell), gecontroleerd tegen
// de toegestane lijst van het apparaat, bij een wijzigende opdracht eerst bevestigd (BEVESTIGING_VEREIST → de pagina vraagt; de tweede
// aanroep draagt bevestigd:true), dan als ONDERTEKENDE 'term.exec' naar de agent (connectors-gateway stuurTerminalOpdracht — niet via de
// AI-wachtrij: een mens is geen grant). De agent controleert alles opnieuw (allow-lijst, interpreter-vlaggen, werkmap in roots, geheime
// plekken, PowerShell alleen als vaste -Command-start). Het resultaat komt terug als {t:'result', id} en wordt in app.terminal_opdrachten
// (0113) bewaard: de uitvoer wordt opgenomen, zoals bij de containersessies.
// Regels: actief technisch profiel met terminal.servers (of terminal.test voor een testmachine); ALLEEN eigen apparaten; één lopende
// opdracht per apparaat; 60 s per programma (agent) + 70 s hier; uitvoer ≤ 256 KB in de rij.
import { randomUUID } from 'node:crypto';
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import * as store from './connectors-opslag';
import { agentOnline, stuurTerminalOpdracht } from './connectors-gateway';
import { actieveActivatie, TAB_RE, TechFout, type Gebruiker } from './tech-profiel';
import { magApparaat } from '../shared/terminal';
import { bevestigingNodig, isBevestiging, MAX_UITVOER, ontleed, OpdrachtFout, type Bevestiging } from '../shared/terminal-opdrachten';

const sys = () => getPool('systeem');
const fout = (code: string, status = 400): never => { throw new TechFout(code, status); };
const WACHT_MS = 70_000;
const INLINE_MS = 20_000;

export type TerminalCaps = {
  roots?: string[]; readonlyRoots?: string[]; allowCommands?: string[]; gebruiker?: string; host?: string;
  terminal?: { enabled?: boolean; container?: boolean; opdrachten?: boolean; powershell?: boolean; image?: string; maxMinuten?: number; test?: boolean };
};
export const bevestigingVan = (policy: unknown): Bevestiging => { const v = (policy as { terminalBevestiging?: unknown } | null)?.terminalBevestiging; return isBevestiging(v) ? v : 'wijzigend'; };

type Lopend = { id: string; userId: string; agentId: string; begin: number; klaar: Promise<Uitkomst>; afronden: (u: Uitkomst) => void; timer: NodeJS.Timeout };
type Uitkomst = { staat: 'klaar' | 'mislukt' | 'tijd'; code: number | null; uitvoer: string; afgekapt: boolean; fout: string; cwd: string; bytes: number };
const lopend = new Map<string, Lopend>();
export const _lopend = lopend;

const audit = (ownerId: string, action: string, details: Record<string, unknown>) =>
  auditToevoegen({ ownerId, actorId: ownerId, action, type: 'beveiliging', result: 'success', details }).catch(() => undefined);

async function vereisTech(u: Gebruiker, tab: string) {
  if (!TAB_RE.test(tab)) fout('TAB_ONGELDIG');
  const a = await actieveActivatie(u.id, tab);
  if (!a || !(a.mogelijkheden.includes('terminal.test') || a.mogelijkheden.includes('terminal.servers'))) fout('TECH_TERMINAL_VEREIST', 403);
  return a!;
}

async function eigenApparaat(u: Gebruiker, agentId: string) {
  const agent = /^[0-9a-f-]{36}$/.test(agentId) ? await store.getAgent(u.id, agentId) : null; // getAgent filtert op user_id: nooit andermans apparaat
  if (!agent || agent.revoked_at) fout('APPARAAT_NIET_GEVONDEN', 404);
  return agent!;
}

/** Resultaat van de agent voor een lopende opdracht. true = verwerkt. */
export function vanAgent(agentId: string, msg: any): boolean {
  const id = String(msg?.id ?? '');
  const l = lopend.get(id);
  if (!l || msg?.t !== 'result') return false;
  if (l.agentId !== agentId) return true; // een andere agent mag dit resultaat niet leveren
  const d = msg.ok ? (msg.data ?? {}) : null;
  if (!msg.ok) { l.afronden({ staat: 'mislukt', code: null, uitvoer: '', afgekapt: false, fout: String(msg.error || 'fout').slice(0, 1000), cwd: '', bytes: 0 }); return true; }
  if (typeof d.cwd === 'string' && d.code === undefined && d.stdout === undefined) { l.afronden({ staat: 'klaar', code: 0, uitvoer: '', afgekapt: false, fout: '', cwd: d.cwd, bytes: 0 }); return true; }
  const uit = `${String(d.stdout ?? '')}${d.stderr ? (d.stdout ? '\n' : '') + String(d.stderr) : ''}`;
  const bytes = Buffer.byteLength(uit);
  l.afronden({ staat: d.timeout ? 'tijd' : 'klaar', code: typeof d.code === 'number' ? d.code : null, uitvoer: uit.length > MAX_UITVOER ? uit.slice(0, MAX_UITVOER) : uit, afgekapt: !!d.truncated || uit.length > MAX_UITVOER, fout: '', cwd: typeof d.cwd === 'string' ? d.cwd : '', bytes });
  return true;
}

function nieuwLopend(id: string, userId: string, agentId: string): Lopend {
  let afronden!: (u: Uitkomst) => void;
  const klaar = new Promise<Uitkomst>((r) => { afronden = (u) => { const l = lopend.get(id); if (!l) return; clearTimeout(l.timer); lopend.delete(id); r(u); }; });
  const timer = setTimeout(() => afronden({ staat: 'tijd', code: null, uitvoer: '', afgekapt: false, fout: 'OPDRACHT_TIJD', cwd: '', bytes: 0 }), WACHT_MS);
  timer.unref?.();
  const l: Lopend = { id, userId, agentId, begin: Date.now(), klaar, afronden, timer };
  lopend.set(id, l);
  return l;
}

async function opslaan(id: string, u: Uitkomst) {
  // cwd: de agent geeft de echte (realpath) werkmap terug; na `cd` is dat de nieuwe map voor de pagina.
  await sys().query(`UPDATE app.terminal_opdrachten SET staat = $2, code = $3, uitvoer = $4, afgekapt = $5, fout = $6, bytes_uit = $7, cwd = CASE WHEN $8 <> '' THEN left($8, 500) ELSE cwd END, einde_op = now() WHERE id = $1`,
    [id, u.staat, u.code, u.uitvoer, u.afgekapt, u.fout.slice(0, 1000), u.bytes, u.cwd]).catch(() => undefined);
}

const rij = (r: any) => ({ id: r.id, apparaat: r.agent_naam, agentId: r.agent_id, regel: r.regel, programma: r.programma, soort: r.soort, powershell: r.powershell, bevestigd: r.bevestigd, cwd: r.cwd, staat: r.staat, code: r.code, uitvoer: r.uitvoer, afgekapt: r.afgekapt, fout: r.fout, bytes: Number(r.bytes_uit), begin: new Date(r.begin_op).getTime(), einde: r.einde_op ? new Date(r.einde_op).getTime() : null, email: r.email ?? undefined });

/**
 * Eén regel uitvoeren. Antwoord: {bevestiging:true, …} als de pagina eerst moet bevestigen; anders de rij (klaar binnen 20 s) of
 * {klaar:false, id} (daarna /api/terminal/opdracht-stand).
 */
export async function opdracht(u: Gebruiker, tab: string, input: { agentId: unknown; regel: unknown; cwd: unknown; bevestigd: unknown }) {
  const act = await vereisTech(u, tab);
  const agent = await eigenApparaat(u, String(input.agentId || ''));
  const c = (agent.capabilities ?? {}) as TerminalCaps;
  const t = c.terminal ?? {};
  if (!t.enabled || !(t.opdrachten || t.powershell)) fout('TERMINAL_OPDRACHTEN_UIT', 409);
  if (!magApparaat(act.mogelijkheden, c)) fout('TERMINAL_ALLEEN_TESTMACHINE', 403);
  if (!agentOnline(agent.id)) fout('APPARAAT_OFFLINE', 409);
  let o;
  try { o = ontleed(String(input.regel ?? ''), { allow: t.opdrachten ? (c.allowCommands ?? []) : [], powershell: t.powershell === true }); }
  catch (e) { if (e instanceof OpdrachtFout) fout(e.code, 400); throw e; }
  const stand = bevestigingVan(agent.policy);
  const bevestigd = input.bevestigd === true;
  if (bevestigingNodig(o, stand) && !bevestigd) return { bevestiging: true, programma: o.programma, soort: o.soort, powershell: o.powershell, regel: String(input.regel).trim() };
  if ([...lopend.values()].some((l) => l.agentId === agent.id)) fout('OPDRACHT_BEZIG', 409);
  const cwd = String(input.cwd ?? '').slice(0, 500);
  const id = randomUUID();
  const regel = String(input.regel).trim();
  await sys().query(`INSERT INTO app.terminal_opdrachten (id, user_id, agent_id, agent_naam, regel, programma, args, soort, powershell, bevestigd, cwd, via_activatie) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, u.id, agent.id, agent.name, regel, o.programma, JSON.stringify(o.args), o.soort, o.powershell, bevestigd, cwd, String(act.id)]);
  const l = nieuwLopend(id, u.id, agent.id);
  const ok = await stuurTerminalOpdracht(agent.id, u.id, id, { command: o.programma, args: o.args, cwd });
  if (!ok) { l.afronden({ staat: 'mislukt', code: null, uitvoer: '', afgekapt: false, fout: 'APPARAAT_OFFLINE', cwd: '', bytes: 0 }); }
  await audit(u.id, 'owner.terminal.opdracht', { opdracht: id, apparaat: agent.name, programma: o.programma, regel: regel.slice(0, 200), soort: o.soort, powershell: o.powershell, bevestigd, viaActivatie: act.id });
  const uitkomst = await Promise.race([l.klaar.then((x) => x), new Promise<null>((r) => setTimeout(() => r(null), INLINE_MS).unref?.())]);
  if (uitkomst) await opslaan(id, uitkomst); else void l.klaar.then((x) => opslaan(id, x));
  if (!uitkomst) return { klaar: false, id };
  if (!ok) fout('APPARAAT_OFFLINE', 409);
  return { klaar: true, ...(await stand1(u, id)) };
}

async function stand1(u: Gebruiker, id: string) {
  const r = (await sys().query(`SELECT * FROM app.terminal_opdrachten WHERE id = $1 AND user_id = $2`, [id, u.id])).rows[0];
  if (!r) fout('OPDRACHT_NIET_GEVONDEN', 404);
  return rij(r);
}

/** Stand van een eigen opdracht (polling na {klaar:false}). */
export async function opdrachtStand(u: Gebruiker, id: unknown) {
  const i = String(id || '');
  if (!/^[0-9a-f-]{36}$/.test(i)) fout('ID_ONGELDIG');
  const r = await stand1(u, i);
  return { klaar: r.staat !== 'bezig', ...r };
}

/** Geschiedenis: eigen opdrachten (ook die van andere tabbladen); met 'opnames.bekijken' alle. Uitvoer alleen van eigen rijen of met dat recht. */
export async function opdrachtenLijst(u: Gebruiker, tab: string, agentId?: unknown) {
  const a = TAB_RE.test(tab) ? await actieveActivatie(u.id, tab) : null;
  const alle = !!a?.mogelijkheden.includes('opnames.bekijken');
  const ag = typeof agentId === 'string' && /^[0-9a-f-]{36}$/.test(agentId) ? agentId : null;
  const rows = (await sys().query(`SELECT o.*, COALESCE(usr.data->>'email', '') AS email FROM app.terminal_opdrachten o LEFT JOIN app.records usr ON usr.tbl = 'users' AND usr.id = o.user_id
     WHERE ($1 OR o.user_id = $2) AND ($3::uuid IS NULL OR o.agent_id = $3::uuid) ORDER BY o.begin_op DESC LIMIT 100`, [alle, u.id, ag])).rows;
  if (alle && rows.some((r) => r.user_id !== u.id)) void audit(u.id, 'owner.terminal.opdrachten.bekeken', { aantal: rows.length });
  return { magAlle: alle, opdrachten: rows.map(rij) };
}

/** Instelling per apparaat: bevestigen bij wijzigende opdrachten (standaard) of bij alle. Alleen eigen apparaten; in app.agents.policy. */
export async function instellingZetten(u: Gebruiker, tab: string, input: { agentId: unknown; bevestiging: unknown }) {
  await vereisTech(u, tab);
  const agent = await eigenApparaat(u, String(input.agentId || ''));
  if (!isBevestiging(input.bevestiging)) fout('BEVESTIGING_ONGELDIG');
  await sys().query(`UPDATE app.agents SET policy = COALESCE(policy, '{}'::jsonb) || jsonb_build_object('terminalBevestiging', $3::text) WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`, [agent.id, u.id, input.bevestiging]);
  await audit(u.id, 'owner.terminal.instelling', { apparaat: agent.name, bevestiging: input.bevestiging });
  return { ok: true, bevestiging: input.bevestiging };
}
