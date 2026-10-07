// Local Machine Connector: WebSocket-kanaal waarmee een agent (agent/agent.mjs op een pc of VM van de
// gebruiker) verbinding maakt. De agent belt zelf naar buiten (WSS via de Cloudflare Tunnel); er gaat geen
// inkomende poort open. Het kanaal heeft geen sessie: de agent authenticeert met zijn eigen token.
//
// Protocol (JSON, één object per bericht):
//   agent  -> server: {t:'auth', token, version, capabilities}   eerste bericht, binnen 5 s
//                     {t:'result', id, ok, data?, error?}
//                     {t:'pong'}
//   server -> agent:  {t:'ready', agentId}
//                     {t:'cmd', id, type, params}
//                     {t:'ping'}
// Het token staat bewust in het eerste bericht en niet in de URL: URL's komen in logs van proxies terecht.
//
// Let op: de verbindingen leven in het geheugen van dit proces. Meerdere app-processen naast elkaar
// zouden een koppeling van Postgres (LISTEN/NOTIFY) nodig hebben; vandaag draait er één.
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { sha256 } from './connectors-crypto';
import * as store from './connectors-store';

export const COMMAND_TYPES = ['fs.read', 'fs.list', 'fs.write', 'exec', 'sys.info', 'docker.ps', 'docker.manage', 'sys.metrics',
  'browser.snapshot', 'browser.navigate', 'browser.invoke', 'browser.click', 'browser.type', 'browser.diagnostics',
  'browser.screenshot', 'browser.tabs', 'browser.history', 'browser.scroll', 'browser.wait', 'browser.select', 'browser.key', 'browser.deep_diagnostics'] as const;
export type CommandType = typeof COMMAND_TYPES[number];

const WS_PATH = '/agent/ws';
const HEARTBEAT_MS = 20_000;
const AUTH_TIMEOUT_MS = 5_000;
const COMMAND_TIMEOUT_MS = 90_000;
const MAX_PAYLOAD = 8 * 1024 * 1024;

type Live = { ws: WebSocket; userId: string; alive: boolean };
const live = new Map<string, Live>();
let started = false;

export const agentOnline = (agentId: string): boolean => live.has(agentId);
export const onlineAgentIds = (): string[] => [...live.keys()];

/** Bij het stoppen van de server: alle agentverbindingen netjes sluiten (WebSocket-sockets vallen buiten server.closeAllConnections en hielden het stoppen 10 s op). Agenten verbinden zelf opnieuw. */
export function closeAllAgents(): void {
  for (const entry of live.values()) { try { entry.ws.close(1001, 'server stopping'); } catch { /* al dicht */ } }
  setTimeout(() => { for (const entry of live.values()) { try { entry.ws.terminate(); } catch { /* al dicht */ } } }, 1500).unref();
}

/** Sluit de verbinding van een ingetrokken agent meteen. */
export function disconnectAgent(agentId: string): void {
  live.get(agentId)?.ws.close(4403, 'revoked');
}

/** Stuur een goedgekeurde opdracht naar de agent. false = agent niet verbonden of opdracht niet meer 'approved'. */
export async function dispatchCommand(cmd: { id: string; agent_id: string; type: string; params: unknown }): Promise<boolean> {
  const entry = live.get(cmd.agent_id);
  if (!entry) return false;
  // Laatste slot: een browseropdracht gaat alleen weg als de gebruiker de browser heeft aangezet én een ingelogde sessie
  // dat recent heeft bevestigd (zie 0013). Ook een al goedgekeurde opdracht wordt anders niet verstuurd.
  if (cmd.type.startsWith('browser.')) {
    const gate = await store.browserGate(cmd.agent_id, cmd.type);
    if (gate !== 'ok') {
      await store.transitionCommand(cmd.id, ['approved'], 'failed', { error: gate === 'inactive' ? 'browser is not activated or the user is not signed in on the site' : 'this capability is switched off for this browser' });
      return false;
    }
  }
  const sent = await store.transitionCommand(cmd.id, ['approved'], 'sent');
  if (!sent) return false;
  entry.ws.send(JSON.stringify({ t: 'cmd', id: cmd.id, type: cmd.type, params: cmd.params }));
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
    const pathname = new URL(req.url || '/', 'http://intern.invalid').pathname;
    if (pathname !== WS_PATH || !allowedHosts.has(host)) {
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
  }, HEARTBEAT_MS).unref();

  // Na een herstart (systemd) is nog geen agent opnieuw verbonden.
  store.markAllAgentsDisconnected().catch((err) => console.error('[agents] status resetten mislukt:', (err as Error).message));
}

function onConnection(ws: WebSocket): void {
  let agentId: string | null = null;
  const authTimer = setTimeout(() => { if (!agentId) ws.close(4401, 'auth timeout'); }, AUTH_TIMEOUT_MS);

  ws.on('message', async (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { ws.close(4400, 'bad json'); return; }

    if (!agentId) {
      if (msg?.t !== 'auth' || typeof msg.token !== 'string' || msg.token.length > 200) { ws.close(4401, 'auth required'); return; }
      const agent = await store.findAgentByTokenHash(sha256(msg.token));
      if (!agent) { ws.close(4403, 'invalid token'); return; }
      clearTimeout(authTimer);
      agentId = agent.id;
      live.get(agentId)?.ws.close(4409, 'replaced by new connection');
      live.set(agentId, { ws, userId: agent.user_id, alive: true });
      const caps = msg.capabilities && typeof msg.capabilities === 'object' ? msg.capabilities : undefined;
      await store.setAgentStatus(agentId, 'connected', caps);
      ws.send(JSON.stringify({ t: 'ready', agentId }));
      return;
    }

    const entry = live.get(agentId);
    if (!entry || entry.ws !== ws) return;
    entry.alive = true;
    if (msg?.t === 'result' && typeof msg.id === 'string') {
      // Alleen een opdracht van DEZE gebruiker en in stand 'sent' wordt afgesloten.
      await store.transitionCommand(
        msg.id, ['sent'], msg.ok ? 'succeeded' : 'failed',
        msg.ok ? { data: msg.data } : { error: String(msg.error ?? 'unknown error').slice(0, 500) },
        entry.userId,
      );
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (agentId && live.get(agentId)?.ws === ws) {
      live.delete(agentId);
      store.setAgentStatus(agentId, 'disconnected').catch(() => undefined);
    }
  });
  ws.on('error', () => undefined);
}
