// Terminals in de browser (etap C). Een sessie is een wegwerpcontainer op een EIGEN apparaat (agent 0.6, terminal-config on),
// geopend vanuit een actief technisch profiel met terminal.test (alleen machines die zich als test melden) of terminal.servers.
// De uitvoer wordt opgenomen (asciicast v2, gzip, ≤ 4 MB); invoer niet (wachtwoorden). Opnames lezen alleen 'opnames.bekijken'.
import { gzipSync } from 'node:zlib';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { randomToken, sha256 } from './connectors-crypto';
import { registreerTerminal, stuurNaarAgent, stuurTerminalOpen } from './connectors-gateway';
import * as store from './connectors-store';
import { auditToevoegen } from '../server/platform/audit';
import { getPool } from '../server/platform/pg';
import { heeftTechMogelijkheid, isEigenaar, TAB_RE, TechFout, type Gebruiker } from './tech-profiel';

export const MAX_MINUTEN = 60;
const MAX_OPNAME = 4 * 1024 * 1024;
const TICKET_TTL = 30_000;
const sys = () => getPool('systeem');
const fout = (code: string, status = 400): never => { throw new TechFout(code, status); };
const audit = (ownerId: string, action: string, details: Record<string, unknown>) =>
  auditToevoegen({ ownerId, actorId: ownerId, action, type: 'beveiliging', result: 'success', details }).catch(() => undefined);

type Live = { id: string; userId: string; agentId: string; eind: number; browser: WebSocket | null; bytes: number; regels: string[]; start: number; gesloten: boolean };
const live = new Map<string, Live>();
const tickets = new Map<string, { sid: string; exp: number }>();

const magOpenen = async (u: Gebruiker, tab: string) => {
  if (!TAB_RE.test(tab)) fout('TAB_ONGELDIG');
  const servers = await heeftTechMogelijkheid(u.id, tab, 'terminal.servers');
  const test = await heeftTechMogelijkheid(u.id, tab, 'terminal.test');
  if (!servers && !test && !isEigenaar(u)) fout('TECH_TERMINAL_VEREIST', 403);
  return { servers: servers || isEigenaar(u), test: test || isEigenaar(u) };
};

type Apparaat = { id: string; naam: string; online: boolean; roots: string[]; alleenLezen: string[]; maxMinuten: number; test: boolean };
export async function apparaten(u: Gebruiker, tab: string): Promise<Apparaat[]> {
  const mag = await magOpenen(u, tab);
  const rows = await store.listAgents(u.id);
  return rows.filter((a) => !a.revoked_at).map((a) => {
    const c = (a.capabilities || {}) as { roots?: unknown; readonlyRoots?: unknown; terminal?: { enabled?: boolean; maxMinuten?: number; test?: boolean } };
    const aan = c.terminal?.enabled === true;
    const test = c.terminal?.test === true;
    if (!aan) return null;
    if (test ? !mag.test : !mag.servers) return null;
    return {
      id: a.id, naam: a.name, online: a.status === 'connected', test,
      roots: Array.isArray(c.roots) ? c.roots.map(String).slice(0, 20) : [],
      alleenLezen: Array.isArray(c.readonlyRoots) ? c.readonlyRoots.map(String) : [],
      maxMinuten: Math.min(MAX_MINUTEN, Number(c.terminal?.maxMinuten ?? 60) || 60),
    };
  }).filter((x): x is Apparaat => !!x);
}

function ticketUit(sid: string) {
  const nu = Date.now();
  for (const [k, v] of tickets) if (v.exp <= nu) tickets.delete(k);
  const ticket = randomToken(24);
  tickets.set(sha256(ticket), { sid, exp: nu + TICKET_TTL });
  return ticket;
}

export async function openen(u: Gebruiker, tab: string, input: { agentId?: unknown; root?: unknown; schrijven?: unknown; minuten?: unknown; reden?: unknown; cols?: unknown; rows?: unknown }) {
  const mag = await magOpenen(u, tab);
  const agentId = String(input.agentId || '');
  const root = String(input.root || '').trim();
  const reden = String(input.reden || '').trim().replace(/\s+/g, ' ');
  const minuten = Math.round(Number(input.minuten));
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) fout('APPARAAT_ONGELDIG');
  if (root.length < 1 || root.length > 500) fout('MAP_ONGELDIG');
  if (reden.length < 3 || reden.length > 300) fout('REDEN_ONGELDIG');
  if (!Number.isFinite(minuten) || minuten < 1 || minuten > MAX_MINUTEN) fout('DUUR_ONGELDIG');
  const lijst = await apparaten(u, tab);
  const app = lijst.find((a) => a.id === agentId);
  if (!app) fout('APPARAAT_NIET_BESCHIKBAAR', 403);
  if (!app.online) fout('APPARAAT_OFFLINE', 409);
  if (!app.roots.includes(root)) fout('MAP_NIET_TOEGESTAAN', 403);
  if (app.test ? !mag.test : !mag.servers) fout('TECH_TERMINAL_VEREIST', 403);
  const schrijven = input.schrijven === true && !app.alleenLezen.some((ro) => root === ro || root.startsWith(ro.endsWith('/') ? ro : `${ro}/`));
  const open = [...live.values()].filter((s) => s.userId === u.id && !s.gesloten).length;
  if (open >= 2) fout('TE_VEEL_SESSIES', 429);
  const id = crypto.randomUUID();
  const eindMin = Math.min(minuten, app.maxMinuten);
  const row = (await sys().query(
    `INSERT INTO app.terminal_sessies (id, user_id, agent_id, agent_naam, root, schrijven, reden, minuten, eind_gepland)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(mins => $8)) RETURNING eind_gepland`,
    [id, u.id, agentId, app.naam.slice(0, 200), root, schrijven, reden, eindMin],
  )).rows[0];
  const eind = new Date(row.eind_gepland).getTime();
  const cols = Math.min(240, Math.max(20, Number(input.cols) || 80));
  const rows = Math.min(80, Math.max(5, Number(input.rows) || 24));
  const sessie: Live = { id, userId: u.id, agentId, eind, browser: null, bytes: 0, regels: [], start: Date.now(), gesloten: false };
  const header = JSON.stringify({ version: 2, width: cols, height: rows, timestamp: Math.floor(sessie.start / 1000), env: { TERM: 'xterm-256color', SHELL: '/bin/bash' } });
  sessie.regels.push(header);
  live.set(id, sessie);
  const ok = await stuurTerminalOpen(agentId, u.id, id, { sid: id, root, schrijven, cols, rows });
  if (!ok) { live.delete(id); await sys().query(`UPDATE app.terminal_sessies SET einde_op = now(), einde_reden = 'niet_verbonden' WHERE id = $1`, [id]); fout('APPARAAT_OFFLINE', 409); }
  setTimeout(() => { void sluiten(id, 'tijd'); }, Math.max(1000, eind - Date.now())).unref?.();
  await audit(u.id, 'owner.terminal.geopend', { sessie: id, agent: app.naam, root, schrijven, minuten: eindMin, reden });
  return { id, ticket: ticketUit(id), eind, schrijven };
}

function noteer(s: Live, data: string) {
  if (s.bytes >= MAX_OPNAME) return;
  const stuk = data.slice(0, 32_000);
  const t = Math.max(0, (Date.now() - s.start) / 1000);
  const regel = JSON.stringify([Number(t.toFixed(3)), 'o', stuk]);
  if (s.bytes + regel.length > MAX_OPNAME) return;
  s.regels.push(regel);
  s.bytes += Buffer.byteLength(stuk);
}

async function bewaar(s: Live, reden: string) {
  let opname: Buffer | null = null;
  try { opname = gzipSync(Buffer.from(`${s.regels.join('\n')}\n`)); if (opname.length > MAX_OPNAME) opname = opname.subarray(0, MAX_OPNAME); } catch { opname = null; }
  await sys().query(`UPDATE app.terminal_sessies SET einde_op = now(), einde_reden = $2, bytes_uit = $3, opname = $4 WHERE id = $1 AND einde_op IS NULL`, [s.id, reden.slice(0, 40), s.bytes, opname]);
  await audit(s.userId, 'owner.terminal.gesloten', { sessie: s.id, reden, bytes: s.bytes });
}

export async function sluiten(id: string, reden: string) {
  const s = live.get(id);
  if (!s || s.gesloten) return;
  s.gesloten = true;
  live.delete(id);
  stuurNaarAgent(s.agentId, { t: 'term.close', sid: id });
  try { s.browser?.close(1000, reden); } catch { /* dicht */ }
  await bewaar(s, reden);
}

export async function sluitEigen(u: Gebruiker, tab: string, id: unknown) {
  await magOpenen(u, tab);
  const sid = String(id || '');
  const s = live.get(sid);
  if (!s || s.userId !== u.id) fout('SESSIE_NIET_GEVONDEN', 404);
  await sluiten(sid, 'gesloten');
  return { ok: true };
}

function vanAgent(agentId: string, msg: any) {
  const s = live.get(String(msg?.sid || msg?.id || ''));
  if (!s || s.agentId !== agentId) return;
  if (msg.t === 'term.out' && typeof msg.data === 'string') {
    noteer(s, msg.data);
    try { s.browser?.send(JSON.stringify({ t: 'out', data: msg.data })); } catch { /* dicht */ }
  }
  if (msg.t === 'term.exit' || (msg.t === 'result' && msg.ok === false)) void sluiten(s.id, msg.ok === false ? 'geweigerd' : 'exit');
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
function opBrowser(ws: WebSocket) {
  let s: Live | null = null;
  const timer = setTimeout(() => { if (!s) ws.close(4401, 'auth timeout'); }, 5000);
  ws.on('message', (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { ws.close(4400, 'bad json'); return; }
    if (!s) {
      const row = typeof msg.ticket === 'string' ? tickets.get(sha256(msg.ticket)) : undefined;
      if (msg.ticket) tickets.delete(sha256(String(msg.ticket)));
      const gevonden = row && row.exp > Date.now() ? live.get(row.sid) : undefined;
      if (!gevonden || gevonden.gesloten) { ws.close(4403, 'invalid ticket'); return; }
      clearTimeout(timer);
      s = gevonden;
      s.browser = ws;
      ws.send(JSON.stringify({ t: 'ready', sid: s.id }));
      return;
    }
    if (msg.t === 'in' && typeof msg.data === 'string') stuurNaarAgent(s.agentId, { t: 'term.in', sid: s.id, data: msg.data.slice(0, 8192) });
    if (msg.t === 'close') void sluiten(s.id, 'gesloten');
  });
  ws.on('close', () => { if (s?.browser === ws) void sluiten(s.id, 'browser'); });
}

export function koppelTerminal(): void {
  registreerTerminal({
    vanAgent(agentId, msg) {
      const t = String(msg?.t || '');
      if (t === 'term.out' || t === 'term.exit') { vanAgent(agentId, msg); return true; }
      if (t === 'result' && live.has(String(msg.id || ''))) { vanAgent(agentId, { ...msg, sid: msg.id }); return true; }
      return false;
    },
    upgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
      wss.handleUpgrade(req, socket, head, (ws) => opBrowser(ws));
    },
  });
}

export async function opname(u: Gebruiker, tab: string, id: unknown) {
  if (!TAB_RE.test(tab)) fout('TAB_ONGELDIG');
  const sid = String(id || '');
  if (!/^[0-9a-f-]{36}$/i.test(sid)) fout('SESSIE_NIET_GEVONDEN', 404);
  const mag = await heeftTechMogelijkheid(u.id, tab, 'opnames.bekijken') || isEigenaar(u);
  const r = (await sys().query(`SELECT user_id, opname IS NOT NULL AS heeft, opname FROM app.terminal_sessies WHERE id = $1`, [sid])).rows[0];
  if (!r || (!mag && r.user_id !== u.id)) fout('SESSIE_NIET_GEVONDEN', 404);
  if (!mag && r.user_id === u.id) fout('OPNAME_ALLEEN_AUDITOR', 403);
  await audit(r.user_id, 'owner.terminal.opname.bekeken', { sessie: sid, door: u.id });
  if (u.id !== r.user_id) await audit(u.id, 'owner.terminal.opname.bekeken', { sessie: sid, van: r.user_id });
  return { id: sid, asciicast: r.opname ? Buffer.from(r.opname).toString('base64') : null, gzip: true };
}

export async function opnames(u: Gebruiker, tab: string) {
  if (!TAB_RE.test(tab)) fout('TAB_ONGELDIG');
  if (!(await heeftTechMogelijkheid(u.id, tab, 'opnames.bekijken')) && !isEigenaar(u)) fout('OPNAME_ALLEEN_AUDITOR', 403);
  const rows = (await sys().query(`SELECT id, user_id, agent_naam, root, schrijven, reden, begin_op, einde_op, einde_reden, bytes_uit, opname IS NOT NULL AS heeft
    FROM app.terminal_sessies ORDER BY begin_op DESC LIMIT 50`)).rows;
  return rows.map((r) => ({ id: r.id, userId: r.user_id, agent: r.agent_naam, root: r.root, schrijven: r.schrijven, reden: r.reden, begin: new Date(r.begin_op).getTime(), einde: r.einde_op ? new Date(r.einde_op).getTime() : null, redenEinde: r.einde_reden, bytes: Number(r.bytes_uit), heeft: r.heeft }));
}
