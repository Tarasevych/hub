// Terminals in de browser (architectuur 13.10.2026). De browser praat via WSS /terminal/ws met DEZE server; de server praat via het
// bestaande agentkanaal met de agent op een EIGEN apparaat; de agent draait een wegwerpcontainer (agent.mjs termArgs: geen netwerk,
// geen capabilities, alleen-lezen systeem, root op /werk standaard alleen-lezen, geheime plekken afgedekt).
// Regels (hier, op de server): actief technisch profiel met terminal.test of terminal.servers; ALLEEN eigen apparaten; verse
// bevestiging van de aanmelding; reden; duur ≤ min(60, plafond van het apparaat, rest van het technisch profiel); eenmalig
// browserticket (30 s); uitvoer opgenomen (asciicast v2, invoer NIET: wachtwoorden). Een AI kan geen terminal openen (geen MCP-tool,
// geen grant): 'term.open' gaat niet via de opdrachtenwachtrij van AI's.
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { getPool } from '../server/platform/pg';
import { auditToevoegen } from '../server/platform/audit';
import { randomToken, sha256 } from './connectors-crypto';
import * as store from './connectors-store';
import { agentOnline, registreerTerminal, stuurNaarAgent, stuurTerminalOpen } from './connectors-gateway';
import { actieveActivatie, TAB_RE, TechFout, type Gebruiker } from './tech-profiel';

const sys = () => getPool('systeem');
const fout = (code: string, status = 400): never => { throw new TechFout(code, status); };
export const MAX_MINUTEN = 60;
const TICKET_MS = 30_000;
const MAX_OPNAME = 4 * 1024 * 1024;

type Sessie = {
  sid: string; userId: string; agentId: string; ticketHash: string; ticketExp: number; begin: number; eind: number;
  browser: WebSocket | null; gestart: boolean; open: boolean; opname: string[]; opnameBytes: number; bytes: number; timer: NodeJS.Timeout; wachtrij: string[];
};
const sessies = new Map<string, Sessie>();
export const _sessies = sessies;

const audit = (ownerId: string, action: string, details: Record<string, unknown>) =>
  auditToevoegen({ ownerId, actorId: ownerId, action, type: 'beveiliging', result: 'success', details }).catch(() => undefined);

async function vereisTech(u: Gebruiker, tab: string) {
  if (!TAB_RE.test(tab)) fout('TAB_ONGELDIG');
  const a = await actieveActivatie(u.id, tab);
  if (!a || !(a.mogelijkheden.includes('terminal.test') || a.mogelijkheden.includes('terminal.servers'))) fout('TECH_TERMINAL_VEREIST', 403);
  return a!;
}

type Caps = { roots?: string[]; readonlyRoots?: string[]; terminal?: { enabled?: boolean; image?: string; maxMinuten?: number } };
/** Eigen apparaten met terminal aan (alleen niet-ingetrokken, met hun roots). */
export async function apparaten(u: Gebruiker, tab: string) {
  await vereisTech(u, tab);
  const lijst = await store.listAgents(u.id);
  return lijst.filter((a) => !a.revoked_at).map((a) => {
    const c = (a.capabilities ?? {}) as Caps;
    return { id: a.id, naam: a.name, platform: a.platform ?? '', online: agentOnline(a.id), terminal: !!c.terminal?.enabled, image: c.terminal?.image ?? '', maxMinuten: Number(c.terminal?.maxMinuten ?? 60),
      roots: (c.roots ?? []).map((r) => ({ pad: r, alleenLezen: (c.readonlyRoots ?? []).includes(r) })) };
  });
}

function afsluiten(s: Sessie, reden: string, code: number | null = null) {
  if (!s.open) return;
  s.open = false;
  clearTimeout(s.timer);
  sessies.delete(s.sid);
  stuurNaarAgent(s.agentId, { t: 'term.close', sid: s.sid });
  try { s.browser?.send(JSON.stringify({ t: 'exit', code, reden })); s.browser?.close(1000, reden.slice(0, 60)); } catch { /* al dicht */ }
  const kop = JSON.stringify({ version: 2, width: 100, height: 30, timestamp: Math.floor(s.begin / 1000), env: { TERM: 'xterm-256color' } });
  const opname = gzipSync(Buffer.from([kop, ...s.opname].join('\n') + '\n'));
  void sys().query(`UPDATE app.terminal_sessies SET einde_op = now(), einde_reden = $2, bytes_uit = $3, opname = $4 WHERE id = $1`, [s.sid, reden.slice(0, 40), s.bytes, opname]).catch(() => undefined);
  void audit(s.userId, 'owner.terminal.gesloten', { sessie: s.sid, reden, bytes: s.bytes, seconden: Math.round((Date.now() - s.begin) / 1000) });
}

export async function openen(u: Gebruiker, tab: string, input: { agentId: unknown; root: unknown; schrijven: unknown; minuten: unknown; reden: unknown; cols?: unknown; rows?: unknown }) {
  const act = await vereisTech(u, tab);
  const agentId = String(input.agentId || '');
  const agent = /^[0-9a-f-]{36}$/.test(agentId) ? await store.getAgent(u.id, agentId) : null;
  if (!agent || agent.revoked_at) fout('APPARAAT_NIET_GEVONDEN', 404); // alleen EIGEN apparaten (getAgent filtert op user_id)
  if (!agentOnline(agentId)) fout('APPARAAT_OFFLINE', 409);
  const c = (agent!.capabilities ?? {}) as Caps;
  if (!c.terminal?.enabled) fout('TERMINAL_UIT_OP_APPARAAT', 409);
  const root = String(input.root || '');
  if (!(c.roots ?? []).includes(root)) fout('ROOT_ONGELDIG');
  const schrijven = input.schrijven === true;
  if (schrijven && (c.readonlyRoots ?? []).includes(root)) fout('ROOT_ALLEEN_LEZEN', 403);
  const reden = String(input.reden ?? '').trim().replace(/\s+/g, ' ');
  if (reden.length < 3 || reden.length > 300) fout('REDEN_ONGELDIG');
  const restTech = Math.floor((act.eind - Date.now()) / 60_000);
  const max = Math.min(MAX_MINUTEN, Number(c.terminal?.maxMinuten ?? 60), restTech);
  const minuten = Math.round(Number(input.minuten));
  if (!Number.isFinite(minuten) || minuten < 1 || minuten > max) fout('DUUR_ONGELDIG');
  if ([...sessies.values()].filter((s) => s.userId === u.id).length >= 3) fout('TE_VEEL_TERMINALS', 429);
  const sid = randomUUID();
  const ticket = randomToken(32);
  const begin = Date.now(), eind = begin + minuten * 60_000;
  await sys().query(`INSERT INTO app.terminal_sessies (id, user_id, agent_id, agent_naam, root, schrijven, reden, minuten, begin_op, eind_gepland) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9 / 1000.0),to_timestamp($10 / 1000.0))`,
    [sid, u.id, agentId, agent!.name, root, schrijven, reden, minuten, begin, eind]);
  const s: Sessie = { sid, userId: u.id, agentId, ticketHash: sha256(ticket), ticketExp: begin + TICKET_MS, begin, eind, browser: null, gestart: false, open: true, opname: [], opnameBytes: 0, bytes: 0, wachtrij: [],
    timer: setTimeout(() => { const x = sessies.get(sid); if (x) afsluiten(x, 'tijd'); }, minuten * 60_000) };
  s.timer.unref?.();
  sessies.set(sid, s);
  // Zonder browser binnen 30 s: sluiten (een ticket dat niemand gebruikt, laat geen container draaien).
  setTimeout(() => { const x = sessies.get(sid); if (x && !x.browser) afsluiten(x, 'geen-browser'); }, TICKET_MS + 2_000).unref?.();
  const ok = await stuurTerminalOpen(agentId, u.id, sid, { sid, root, schrijven, minuten, cols: Number(input.cols) || 100, rows: Number(input.rows) || 30 });
  if (!ok) { afsluiten(s, 'agent-niet-bereikbaar'); fout('APPARAAT_OFFLINE', 409); }
  await audit(u.id, 'owner.terminal.geopend', { sessie: sid, apparaat: agent!.name, root, schrijven, minuten, reden, viaActivatie: act.id });
  return { sid, ticket, eind, minuten, apparaat: agent!.name, root, schrijven };
}

/** Berichten van de agent voor een sessie. true = verwerkt (hoort bij een terminal). */
function vanAgent(agentId: string, msg: any): boolean {
  const sid = String(msg?.sid ?? (msg?.t === 'result' ? msg.id : '') ?? '');
  const s = sessies.get(sid);
  if (!s) return msg?.t === 'term.out' || msg?.t === 'term.exit'; // verlopen sessie: stil weggooien
  if (s.agentId !== agentId) return true; // een andere agent mag niet in deze sessie schrijven
  if (msg.t === 'result') {
    if (!msg.ok) { const reden = String(msg.error || 'fout').slice(0, 200); stuurBrowser(s, { t: 'fout', reden }); afsluiten(s, 'agent-weigert'); }
    else { s.gestart = true; stuurBrowser(s, { t: 'gestart', alleenLezen: msg.data?.alleenLezen !== false, image: String(msg.data?.image || '') }); }
    return true;
  }
  if (msg.t === 'term.out' && typeof msg.d === 'string') {
    const tekst = Buffer.from(msg.d, 'base64');
    s.bytes += tekst.length;
    if (s.opnameBytes < MAX_OPNAME) {
      const regel = JSON.stringify([Math.round((Date.now() - s.begin)) / 1000, 'o', tekst.toString('utf8')]);
      s.opname.push(regel); s.opnameBytes += regel.length;
    }
    stuurBrowser(s, { t: 'out', d: msg.d });
    return true;
  }
  if (msg.t === 'term.exit') { afsluiten(s, String(msg.reden || 'einde'), typeof msg.code === 'number' ? msg.code : null); return true; }
  return true;
}
function stuurBrowser(s: Sessie, obj: Record<string, unknown>) {
  const tekst = JSON.stringify(obj);
  if (s.browser) { try { s.browser.send(tekst); } catch { /* dicht */ } } else if (s.wachtrij.length < 500) s.wachtrij.push(tekst);
}

// ---- browserkant: WSS /terminal/ws, eerste bericht {t:'auth', ticket} binnen 5 s ----
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
function browserVerbinding(ws: WebSocket) {
  let s: Sessie | null = null;
  const t = setTimeout(() => { if (!s) ws.close(4401, 'auth timeout'); }, 5_000);
  ws.on('message', (raw) => {
    let msg: any; try { msg = JSON.parse(raw.toString()); } catch { ws.close(4400, 'bad json'); return; }
    if (!s) {
      if (msg?.t !== 'auth' || typeof msg.ticket !== 'string' || msg.ticket.length > 200) { ws.close(4401, 'auth required'); return; }
      const h = sha256(msg.ticket);
      const x = [...sessies.values()].find((y) => y.ticketHash === h);
      if (!x || x.browser || x.ticketExp < Date.now()) { ws.close(4403, 'invalid ticket'); return; }
      clearTimeout(t);
      x.ticketHash = ''; // eenmalig
      x.browser = ws; s = x;
      ws.send(JSON.stringify({ t: 'verbonden', sid: x.sid, eind: x.eind }));
      for (const w of x.wachtrij.splice(0)) ws.send(w);
      return;
    }
    if (msg?.t === 'in' && typeof msg.d === 'string' && msg.d.length <= 64 * 1024) stuurNaarAgent(s.agentId, { t: 'term.in', sid: s.sid, d: msg.d });
    else if (msg?.t === 'close') afsluiten(s, 'gesloten');
  });
  ws.on('close', () => { clearTimeout(t); if (s && s.open) afsluiten(s, 'browser-weg'); });
  ws.on('error', () => undefined);
}
registreerTerminal({ vanAgent, upgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => wss.handleUpgrade(req, socket, head, browserVerbinding) });

/** Eigen sessies (zonder opname); met 'opnames.bekijken' in een actief technisch profiel: alle sessies. */
export async function sessiesLijst(u: Gebruiker, tab: string) {
  const a = TAB_RE.test(tab) ? await actieveActivatie(u.id, tab) : null;
  const alle = !!a?.mogelijkheden.includes('opnames.bekijken');
  const rows = (await sys().query(`SELECT s.id, s.agent_naam, s.root, s.schrijven, s.reden, s.minuten, s.begin_op, s.eind_gepland, s.einde_op, s.einde_reden, s.bytes_uit, s.opname IS NOT NULL AS heeft_opname,
      COALESCE(u.data->>'email', '') AS email FROM app.terminal_sessies s LEFT JOIN app.records u ON u.tbl='users' AND u.id = s.user_id
     WHERE ($1 OR s.user_id = $2) ORDER BY s.begin_op DESC LIMIT 50`, [alle, u.id])).rows;
  return { magOpnames: alle, sessies: rows.map((r) => ({ id: r.id, apparaat: r.agent_naam, root: r.root, schrijven: r.schrijven, reden: r.reden, minuten: r.minuten, begin: new Date(r.begin_op).getTime(), eind: new Date(r.eind_gepland).getTime(), einde: r.einde_op ? new Date(r.einde_op).getTime() : null, eindeReden: r.einde_reden, bytes: Number(r.bytes_uit), opname: r.heeft_opname && alle, email: r.email, open: sessies.has(r.id) })) };
}

/** Opname (asciicast v2) — alleen 'opnames.bekijken' (Аудитор, Власник) in een actief technisch profiel; elk bekijken gelogd. */
export async function opname(u: Gebruiker, tab: string, id: string) {
  const a = TAB_RE.test(tab) ? await actieveActivatie(u.id, tab) : null;
  if (!a?.mogelijkheden.includes('opnames.bekijken')) fout('TECH_OPNAMES_VEREIST', 403);
  if (!/^[0-9a-f-]{36}$/.test(id)) fout('ID_ONGELDIG');
  const r = (await sys().query('SELECT user_id, opname FROM app.terminal_sessies WHERE id = $1', [id])).rows[0];
  if (!r?.opname) fout('GEEN_OPNAME', 404);
  await auditToevoegen({ ownerId: r.user_id, actorId: u.id, action: 'owner.terminal.opname.bekeken', type: 'beveiliging', result: 'success', details: { sessie: id } }).catch(() => undefined);
  return { cast: gunzipSync(r.opname).toString('utf8') };
}

export function sluitEigen(u: Gebruiker, sid: string) {
  const s = sessies.get(sid);
  if (!s || s.userId !== u.id) fout('SESSIE_NIET_GEVONDEN', 404);
  afsluiten(s!, 'gesloten');
  return { ok: true };
}
