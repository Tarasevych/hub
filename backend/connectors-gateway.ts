// Local Machine Connector: WebSocket-kanaal waarmee een agent (deploy/agent/agent.mjs op een pc of VM, of de browserextensie)
// verbinding maakt. De agent belt zelf naar buiten (WSS via de Cloudflare Tunnel); er gaat geen inkomende poort open.
//
// Protocol (JSON, één object per bericht):
//   agent  -> server: {t:'auth', ticket, version, capabilities}   eerste bericht, binnen 5 s. ticket = eenmalig (60 s), opgehaald met
//                                                                  GET /api/owner/agents/ws-ticket (Authorization: Bearer <agenttoken>)
//                     {t:'auth', token, ...}                       OUD formaat (token zelf); alleen zolang AGENT_WS_TOKEN_AUTH_LEGACY niet '0' is
//                     {t:'result', id, ok, data?, error?}
//                     {t:'pong', version?, capabilities?, staat?, gid?, exp?, lokaalVerbonden?}   (statusvelden: extensie ≥ 0.5)
//                     {t:'status', staat, gid, exp, lokaal, lokaalVerbonden, version}           extensie ≥ 0.5, bij elke wijziging
//                     {t:'vergrendel-verzoek', gid, reden}                                      gebruiker trok in de extensie in (geen passkey nodig)
//   server -> agent:  {t:'ready', agentId, epoch}
//                     {t:'settings', epoch, caps, blocked}         na verbinden en na elke wijziging van toestemmingen
//                     {t:'cmd', id, type, params, scope, exp, sig}  sig = HMAC (zie connectors-crypto) als de agent een opdrachtsleutel heeft
//                     {t:'stop', detach:true}                      noodstop: alles loslaten, debugger los, buffers leeg
//                     {t:'ping'}
//                     {t:'ontgrendeling', grant, sig}              ondertekende ontgrendeling (backend/extensie-ontgrendeling.ts); ook na 'ready'
//                     {t:'vergrendel', gid?, reden}                ontgrendeling ingetrokken/voorbij (gid leeg = altijd wissen)
//                     {t:'agent-status', verbonden, agenten}       een AI stuurde de laatste AI_ACTIEF_MS browseropdrachten naar deze agent
// Browseropdrachten naar een browseragent (platform 'browser') gaan alleen weg met een lopende ontgrendeling (cap + domein); zie dispatchCommand.
// Het token of ticket staat nooit in de URL (URL's komen in logs van proxies terecht).
//
// Let op: de verbindingen leven in het geheugen van dit proces (één app-proces; zie RUNBOOK).
import { auditToevoegen } from '../server/platform/audit';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { COMMAND_SIG_TTL_MS, openCommandKey, randomToken, sha256, signCommand } from './connectors-crypto';
import * as store from './connectors-opslag';
import { huidigeNamens } from './mcp-namens';
import * as grants from './ai-toestemmingen';
import * as ext from './extensie-ontgrendeling';

export const COMMAND_TYPES = ['fs.read', 'fs.list', 'fs.stat', 'fs.search', 'fs.write', 'exec', 'sys.info', 'docker.ps', 'docker.manage', 'sys.metrics',
  'browser.snapshot', 'browser.navigate', 'browser.invoke', 'browser.click', 'browser.type', 'browser.diagnostics',
  'browser.screenshot', 'browser.tabs', 'browser.history', 'browser.scroll', 'browser.wait', 'browser.select', 'browser.key', 'browser.deep_diagnostics',
  'browser.console', 'browser.network', 'browser.hover', 'browser.fill_form', 'browser.pages', 'browser.self_test', 'browser.audit',
  'browser.script', // 0110 (zone E): evaluate_script via de debugger, alleen technisch slot
  'apps.deploy', 'apps.status', 'apps.list', 'apps.logs', 'apps.versions', 'apps.rollback', 'apps.control',
  'apps.route', 'apps.secret.list', 'apps.secret.set', 'apps.secret.delete'] as const;
export type CommandType = typeof COMMAND_TYPES[number];

const WS_PATH = '/agent/ws';
const HEARTBEAT_MS = 20_000;
const AUTH_TIMEOUT_MS = 5_000;
const COMMAND_TIMEOUT_MS = 90_000;
const MAX_PAYLOAD = 8 * 1024 * 1024;
export const MAX_AGENT_CAPABILITIES_BYTES = 64 * 1024;
function begrensCapabilities(v: unknown): { ok: true; caps: object | undefined } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, caps: undefined };
  if (typeof v !== 'object' || Array.isArray(v)) return { ok: true, caps: undefined };
  try {
    return Buffer.byteLength(JSON.stringify(v), 'utf8') <= MAX_AGENT_CAPABILITIES_BYTES
      ? { ok: true, caps: v as object }
      : { ok: false };
  } catch { return { ok: false }; }
}
export const WS_TICKET_TTL_MS = 60_000;
/** Oude agents sturen hun token zelf in het eerste bericht. Uitzetten met AGENT_WS_TOKEN_AUTH_LEGACY=0 zodra alle agents ≥ 0.4 zijn. */
export const legacyTokenAuthAllowed = (): boolean => process.env.AGENT_WS_TOKEN_AUTH_LEGACY !== '0';

type Live = { ws: WebSocket; userId: string; alive: boolean; platform: string | null };
const live = new Map<string, Live>();
let started = false;

export const agentOnline = (agentId: string): boolean => live.has(agentId);
export const onlineAgentIds = (): string[] => [...live.keys()];

// ---- eenmalige WebSocket-tickets (alleen hashes in het geheugen) ----
const tickets = new Map<string, { agentId: string; exp: number }>();
export function issueWsTicket(agentId: string): { ticket: string; expiresAt: number } {
  const now = Date.now();
  for (const [k, v] of tickets) if (v.exp <= now) tickets.delete(k);
  if (tickets.size > 5000) tickets.clear();
  const ticket = randomToken(32);
  const exp = now + WS_TICKET_TTL_MS;
  tickets.set(sha256(ticket), { agentId, exp });
  return { ticket, expiresAt: exp };
}
function redeemWsTicket(ticket: string): string | null {
  const key = sha256(ticket);
  const row = tickets.get(key);
  tickets.delete(key);
  return row && row.exp > Date.now() ? row.agentId : null;
}

// ---- terminals (backend/terminal.ts): eigen WS-pad voor de browser + doorgeven van term.* berichten van de agent ----
type TerminalHooks = { vanAgent: (agentId: string, msg: any) => boolean; upgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void };
let terminalHooks: TerminalHooks | null = null;
export const TERMINAL_WS_PATH = '/terminal/ws';
export function registreerTerminal(h: TerminalHooks): void { terminalHooks = h; }
// Andere browser-WS-paden van de eigen site (bv. /api/owner/remote/tunnel, backend/remote-bureaublad.ts): zelfde host-controle, nooit ?ticket/?token.
const wsPaden = new Map<string, (req: IncomingMessage, socket: Duplex, head: Buffer) => void>();
export function registreerWsPad(pad: string, f: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): void { wsPaden.set(pad, f); }
/** Bericht naar een verbonden agent (alleen voor term.in / term.close van een sessie die bij die agent hoort). */
export function stuurNaarAgent(agentId: string, obj: Record<string, unknown>): boolean {
  const e = live.get(agentId); if (!e) return false;
  try { e.ws.send(JSON.stringify(obj)); return true; } catch { return false; }
}
/** Ondertekende 'term.open' (zelfde HMAC als elke opdracht; NIET via grants: terminals zijn voor mensen, nooit voor een AI). */
export async function stuurTerminalOpen(agentId: string, userId: string, sid: string, params: Record<string, unknown>): Promise<boolean> {
  const e = live.get(agentId);
  if (!e || e.userId !== userId) return false;
  const signed = await commandSignature(agentId, sid, 'term.open', params);
  e.ws.send(JSON.stringify({ t: 'cmd', id: sid, type: 'term.open', params, scope: { capability: 'terminal' }, ...(signed ?? {}) }));
  return true;
}
/** Zone G (22.10.2026): ondertekende 'term.exec' (opdracht-terminal) of 'cd'; zelfde regel als term.open — van een mens, nooit via grants/AI-wachtrij. */
export async function stuurTerminalOpdracht(agentId: string, userId: string, id: string, params: Record<string, unknown>): Promise<boolean> {
  const e = live.get(agentId);
  if (!e || e.userId !== userId) return false;
  const signed = await commandSignature(agentId, id, 'term.exec', params);
  try { e.ws.send(JSON.stringify({ t: 'cmd', id, type: 'term.exec', params, scope: { capability: 'terminal' }, ...(signed ?? {}) })); return true; } catch { return false; }
}

/** Bij het stoppen van de server: alle agentverbindingen netjes sluiten. Agenten verbinden zelf opnieuw. */
export function closeAllAgents(): void {
  for (const entry of live.values()) { try { entry.ws.close(1001, 'server stopping'); } catch { /* al dicht */ } }
  setTimeout(() => { for (const entry of live.values()) { try { entry.ws.terminate(); } catch { /* al dicht */ } } }, 1500).unref();
}

/** Sluit de verbinding van een ingetrokken agent meteen. */
export function disconnectAgent(agentId: string): void {
  live.get(agentId)?.ws.close(4403, 'revoked');
}

// Toestemmingen kunnen berichten duwen en verbindingen sluiten (per gebruiker, of één agent van die gebruiker).
grants.registerAgentPusher({
  push(userId, agentId, msg) {
    let n = 0;
    for (const [id, e] of live) if (e.userId === userId && (!agentId || id === agentId)) { try { e.ws.send(JSON.stringify(msg)); n++; } catch { /* dicht */ } }
    return n;
  },
  close(userId, agentId, code, reason) {
    let n = 0;
    for (const [id, e] of live) if (e.userId === userId && (!agentId || id === agentId)) { try { e.ws.close(code, reason); n++; } catch { /* dicht */ } }
    return n;
  },
});

async function commandSignature(agentId: string, id: string, type: string, params: unknown) {
  const k = await store.getCommandKeyEnc(agentId);
  if (!k) return null;
  const key = openCommandKey(k.sealed, k.userId, k.tokenHash);
  if (!key) return null;
  const exp = Date.now() + COMMAND_SIG_TTL_MS;
  return { exp, sig: signCommand(key, id, type, params, exp) };
}

/**
 * Stuur een goedgekeurde opdracht naar de agent. false = niet verstuurd (agent niet verbonden, opdracht niet meer 'approved',
 * of de toestemming is intussen ingetrokken/verlopen). De grant wordt hier OPNIEUW gecontroleerd (moment van versturen).
 */
export async function dispatchCommand(cmd: { id: string; agent_id: string; user_id?: string; type: string; params: unknown }): Promise<boolean> {
  const entry = live.get(cmd.agent_id);
  if (!entry) return false;
  // Browser: ook nog aangezet door de gebruiker en recent bevestigd door een ingelogde sessie (0013). Welke mogelijkheden mogen,
  // bepalen sinds 0017 de grants (policy.enabled is alleen nog weergave voor oude UI's).
  if (cmd.type.startsWith('browser.') && !(await store.browserActive(cmd.agent_id))) {
    await store.transitionCommand(cmd.id, ['approved'], 'failed', { error: 'browser AI access is switched off or its period ended (owner: mcp.tarasevych.com → Agents → Devices)' });
    return false;
  }
  const check = await grants.checkCommand({ id: cmd.agent_id, user_id: entry.userId }, cmd.type, cmd.params, 'dispatch');
  if (!check.ok) {
    await store.transitionCommand(cmd.id, ['approved'], 'failed', { error: `not allowed: ${check.code}` });
    return false;
  }
  // Extensie 0.5 (0072): een browseragent is standaard vergrendeld. Alleen met een lopende, door de server ondertekende ontgrendeling
  // (cap erin, URL op een ontgrendelde host). Alleen voor platform 'browser': de pc-agent (deploy/agent) blijft ongemoeid.
  const isBrowserOpdracht = cmd.type.startsWith('browser.') && entry.platform === 'browser';
  if (isBrowserOpdracht) {
    const slot = await ext.controleerBrowserOpdracht(cmd.agent_id, entry.userId, cmd.type, cmd.params);
    if (!slot.ok) {
      await store.transitionCommand(cmd.id, ['approved'], 'failed', { error: slot.fout.slice(0, 500) });
      return false;
    }
  }
  const sent = await store.transitionCommand(cmd.id, ['approved'], 'sent', undefined, entry.userId, cmd.agent_id);
  if (!sent) return false;
  const signed = await commandSignature(cmd.agent_id, cmd.id, cmd.type, cmd.params);
  // 0.6.2 (opdracht eigenaar 20.10.2026): bij een BROWSERopdracht gaat erbij WELKE AI-verbinding hem stuurde. De extensie zet
  // die naam in de markering op de pagina («Claude · читає сторінку»). Puur weergave, dus NIET in de handtekening: kan de
  // server het niet vaststellen, dan gaat het veld niet mee en zegt de extensie eerlijk «ШІ» zonder naam.
  const wie = isBrowserOpdracht ? huidigeNamens() : undefined;
  const ai = wie ? { naam: String(wie.client || '').slice(0, 80), ...(wie.agent ? { slug: wie.agent } : {}) } : null;
  entry.ws.send(JSON.stringify({ t: 'cmd', id: cmd.id, type: cmd.type, params: cmd.params, scope: { capability: check.capability, domains: check.domains }, ...(ai && ai.naam ? { ai } : {}), ...(signed ?? {}) }));
  if (isBrowserOpdracht) ext.aiActiviteit(cmd.agent_id, entry.userId, ai?.naam);
  setTimeout(() => {
    store.transitionCommand(cmd.id, ['sent'], 'timeout', { error: 'agent did not respond in time' }).catch(() => undefined);
  }, COMMAND_TIMEOUT_MS).unref();
  return true;
}

/**
 * Koppel het kanaal aan de HTTP-server. `allowedHosts` = de bekende app-hostnamen (zelfde lijst als de
 * Host-controle in server/start.ts); een upgrade naar een andere host wordt geweigerd.
 */
export function attachAgentGateway(server: Server, allowedHosts: ReadonlySet<string>): void {
  if (started) return;
  started = true;
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
    const url = new URL(req.url || '/', 'http://intern.invalid');
    // Een token of ticket in de URL wordt geweigerd (komt in logs terecht); zo valt een verkeerd gebouwde client meteen op.
    const extra = wsPaden.get(url.pathname);
    if (extra && allowedHosts.has(host) && !url.searchParams.has('ticket') && !url.searchParams.has('token')) { extra(req, socket, head); return; }
    if (url.pathname === TERMINAL_WS_PATH && terminalHooks && allowedHosts.has(host) && !url.searchParams.has('ticket') && !url.searchParams.has('token')) { terminalHooks.upgrade(req, socket, head); return; }
    if (url.pathname !== WS_PATH || !allowedHosts.has(host) || url.searchParams.has('token') || url.searchParams.has('ticket')) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws));
  });

  // Dode verbindingen (uitgezette pc, netwerkbreuk) worden Disconnected.
  setInterval(() => {
    for (const [id, entry] of live) {
      if (!entry.alive) { entry.ws.terminate(); continue; }
      entry.alive = false;
      entry.ws.send(JSON.stringify({ t: 'ping' }));
      store.touchAgent(id).catch(() => undefined);
    }
    // Extensie 0.5: voorbije of losgeraakte ontgrendelingen afsluiten en de extensie 'vergrendel' sturen.
    ext.veeg().catch(() => 0);
  }, HEARTBEAT_MS).unref();

  store.markAllAgentsDisconnected().catch((err) => console.error('[agents] status resetten mislukt:', (err as Error).message));
}

/** Exporteren voor tests (zonder HTTP-server): verwerkt één verbinding. */
export function onConnection(ws: WebSocket): void {
  let agentId: string | null = null;
  let busy = false;
  const authTimer = setTimeout(() => { if (!agentId) ws.close(4401, 'auth timeout'); }, AUTH_TIMEOUT_MS);

  ws.on('message', async (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { ws.close(4400, 'bad json'); return; }

    if (!agentId) {
      if (busy) return;
      busy = true;
      if (msg?.t !== 'auth') { ws.close(4401, 'auth required'); return; }
      let agent: store.AgentRow | null = null;
      if (typeof msg.ticket === 'string' && msg.ticket.length <= 200) {
        const id = redeemWsTicket(msg.ticket);
        agent = id ? await store.findAgentById(id) : null;
      } else if (typeof msg.token === 'string' && msg.token.length <= 200 && legacyTokenAuthAllowed()) {
        agent = await store.findAgentByTokenHash(sha256(msg.token));
      }
      if (!agent) { ws.close(4403, 'invalid token'); return; }
      const capCheck = begrensCapabilities(msg.capabilities);
      if (!capCheck.ok) { ws.close(4400, 'capabilities too large'); return; }
      clearTimeout(authTimer);
      agentId = agent.id;
      live.get(agentId)?.ws.close(4409, 'replaced by new connection');
      live.set(agentId, { ws, userId: agent.user_id, alive: true, platform: agent.platform ?? null });
      const caps = capCheck.caps;
      const nieuweVersie = typeof msg.version === 'string' ? msg.version.slice(0, 40) : '';
      // Journaal op /agents: «оновлено з x до y» wanneer de agent of extensie met een andere versie terugkomt.
      if (nieuweVersie && agent.agent_version && agent.agent_version !== nieuweVersie) {
        auditToevoegen({ ownerId: agent.user_id, actorId: null, action: 'owner.agent.updated', type: 'ai', result: 'success', details: { agentId: agent.id, name: agent.name, platform: agent.platform, from: agent.agent_version, to: nieuweVersie } }).catch(() => undefined);
      }
      await store.setAgentStatus(agentId, 'connected', caps, typeof msg.version === 'string' ? msg.version : undefined);
      const eff = await grants.effectiveCaps(agent.user_id, agent.id).catch(() => ({ epoch: 0, blocked: false, caps: [] }));
      ws.send(JSON.stringify({ t: 'ready', agentId, epoch: eff.epoch }));
      ws.send(JSON.stringify({ t: 'settings', type: 'settings', epoch: eff.epoch, caps: eff.caps, blocked: eff.blocked }));
      // 0111: `sessie` = browsersessie-id van de extensie ≥ 0.7.0 (alleen om korte termijnen na een herstart van de browser te BEËINDIGEN).
      ext.bijVerbonden(agentId, agent.user_id, agent.platform ?? null, nieuweVersie || agent.agent_version || '', msg.sessie);
      // Een lopende ontgrendeling opnieuw duwen (de extensie verliest haar bij een herstart van de browser niet, wel bij een nieuwe verbinding).
      if (agent.platform === 'browser') void ext.naReady(agentId, agent.user_id);
      return;
    }

    const entry = live.get(agentId);
    if (!entry || entry.ws !== ws) return;
    entry.alive = true;
    if (msg?.t === 'pong') {
      const capCheck = begrensCapabilities(msg.capabilities);
      const caps = capCheck.ok ? capCheck.caps : undefined;
      if (caps || typeof msg.version === 'string') store.touchAgent(agentId, caps, typeof msg.version === 'string' ? msg.version : undefined).catch(() => undefined);
      if (entry.platform === 'browser' && typeof msg.staat === 'string') ext.bijStatus(agentId, msg);
      return;
    }
    if (msg?.t === 'status' && entry.platform === 'browser') { ext.bijStatus(agentId, msg); return; }
    if (msg?.t === 'vergrendel-verzoek' && entry.platform === 'browser') {
      const n = await ext.vergrendelVerzoek(agentId, entry.userId, { gid: msg.gid, reden: msg.reden }).catch(() => 0);
      // Bevestiging; de extensie had al lokaal vergrendeld.
      try { ws.send(JSON.stringify({ t: 'vergrendel', ...(typeof msg.gid === 'string' ? { gid: msg.gid.slice(0, 64) } : {}), reden: 'ingetrokken', ingetrokken: n })); } catch { /* dicht */ }
      return;
    }
    if ((msg?.t === 'term.out' || msg?.t === 'term.exit' || msg?.t === 'result') && terminalHooks?.vanAgent(agentId, msg)) return;
    if (msg?.t === 'result' && typeof msg.id === 'string') {
      // Alleen een opdracht van DEZE gebruiker, naar DEZE agent en in stand 'sent' wordt afgesloten (audit M3).
      await store.transitionCommand(
        msg.id, ['sent'], msg.ok ? 'succeeded' : 'failed',
        msg.ok ? { data: msg.data } : { error: String(msg.error ?? 'unknown error').slice(0, 500) },
        entry.userId, agentId,
      );
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (agentId && live.get(agentId)?.ws === ws) {
      live.delete(agentId);
      ext.bijVerbroken(agentId);
      store.setAgentStatus(agentId, 'disconnected').catch(() => undefined);
    }
  });
  ws.on('error', () => undefined);
}
