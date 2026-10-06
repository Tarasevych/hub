// Brug "connectors → AI-tools" in het formaat van het Model Context Protocol (name / description / inputSchema).
// De lijst wordt per gebruiker opgebouwd: geen agent of geen GitHub-token in de kluis = geen bijbehorend
// hulpmiddel. De gebruiker komt altijd uit de sessie, nooit uit de argumenten van het model.
//
// Beleid: leesopdrachten lopen direct, schrijven en uitvoeren wachten op goedkeuring in de UI (maximaal 60 s;
// Cloudflare breekt HTTP-verzoeken na 100 s af). Bij een time-out krijgt het model de opdracht om niet opnieuw
// te proberen en de gebruiker te melden dat er een goedkeuring openstaat.
import { apiPlatformVaultItems, readOwnerVaultPlaintext } from './api-platform-vault';
import { submitCommand, waitForCommand } from './connectors-commands';
import { agentOnline } from './connectors-gateway';
import * as store from './connectors-store';

export type ToolDef = { name: string; description: string; inputSchema: Record<string, unknown> };
export type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

const APPROVAL_WAIT_MS = 60_000;
const MAX_TEXT = 100_000;
const GITHUB_API = 'https://api.github.com';

const machineProp = { type: 'string', description: 'Naam of id van het apparaat. Weglaten als er maar één online is.' };
const MACHINE_TOOLS: ToolDef[] = [
  { name: 'machine_list', description: 'Apparaten van de gebruiker en hun status (connected/disconnected).', inputSchema: { type: 'object', properties: {} } },
  { name: 'machine_info', description: 'OS, toegestane mappen en toegestane commando\'s van een apparaat.', inputSchema: { type: 'object', properties: { machine: machineProp } } },
  { name: 'machine_list_dir', description: 'Inhoud van een map op het apparaat (alleen binnen de toegestane mappen).', inputSchema: { type: 'object', properties: { machine: machineProp, path: { type: 'string' } }, required: ['path'] } },
  { name: 'machine_read_file', description: 'Tekstbestand lezen op het apparaat (max 2 MB).', inputSchema: { type: 'object', properties: { machine: machineProp, path: { type: 'string' } }, required: ['path'] } },
  { name: 'machine_write_file', description: 'Bestand schrijven op het apparaat. Vereist goedkeuring van de gebruiker.', inputSchema: { type: 'object', properties: { machine: machineProp, path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
  { name: 'machine_exec', description: 'Commando uit de toegestane lijst van de agent uitvoeren, zonder shell. Vereist goedkeuring.', inputSchema: { type: 'object', properties: { machine: machineProp, command: { type: 'string', description: 'Alleen de programmanaam, bv. git' }, args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' } }, required: ['command'] } },
];
const TOOL_TO_COMMAND: Record<string, string> = {
  machine_info: 'sys.info', machine_list_dir: 'fs.list', machine_read_file: 'fs.read',
  machine_write_file: 'fs.write', machine_exec: 'exec',
};

const text = (value: string, isError = false): ToolResult =>
  ({ content: [{ type: 'text', text: value.slice(0, MAX_TEXT) }], ...(isError ? { isError } : {}) });

async function githubTokenName(userId: string): Promise<string | null> {
  const item = (await apiPlatformVaultItems(userId)).find((row) => row.purpose === 'github');
  return item ? item.keyName : null;
}

export async function listTools(userId: string): Promise<ToolDef[]> {
  const tools: ToolDef[] = [];
  if ((await store.listAgents(userId)).length) tools.push(...MACHINE_TOOLS);
  if (await githubTokenName(userId)) {
    tools.push({
      name: 'github_get',
      description: 'Lezen via de GitHub API (alleen GET), met het PAT uit de kluis van de gebruiker. Pad begint met "/", bv. /user/repos.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, query: { type: 'object', additionalProperties: { type: 'string' } } },
        required: ['path'],
      },
    });
  }
  return tools;
}

export async function callTool(userId: string, name: string, args: any = {}): Promise<ToolResult> {
  try {
    if (name === 'machine_list') {
      const agents = await store.listAgents(userId);
      return text(JSON.stringify(agents.map((a) => ({
        id: a.id, name: a.name, platform: a.platform, status: agentOnline(a.id) ? 'connected' : 'disconnected',
      }))));
    }

    if (TOOL_TO_COMMAND[name]) {
      const agents = await store.listAgents(userId); // alleen eigen apparaten van deze gebruiker
      const key = args.machine ? String(args.machine) : null;
      const candidates = key
        ? agents.filter((a) => a.id === key || a.name.toLowerCase() === key.toLowerCase())
        : agents.filter((a) => agentOnline(a.id));
      if (candidates.length !== 1) return text(candidates.length ? 'Meerdere apparaten: geef "machine" op.' : 'Geen geschikt apparaat online.', true);
      const agent = candidates[0];
      if (!agentOnline(agent.id)) return text(`Apparaat "${agent.name}" is offline.`, true);

      const { machine: _machine, ...params } = args;
      const { command } = await submitCommand(agent, userId, TOOL_TO_COMMAND[name], params);
      const done = (await waitForCommand(userId, command.id, APPROVAL_WAIT_MS)) ?? command;
      if (done.status === 'succeeded') return text(JSON.stringify(done.result?.data ?? null));
      if (done.status === 'pending_approval') return text('De actie wacht op goedkeuring van de gebruiker in de UI (Connectors). Meld dit aan de gebruiker en probeer het niet opnieuw.', true);
      if (done.status === 'rejected') return text('De gebruiker heeft deze actie geweigerd.', true);
      return text(`Mislukt (${done.status}): ${done.result?.error ?? 'onbekend'}`, true);
    }

    if (name === 'github_get') {
      const keyName = await githubTokenName(userId);
      if (!keyName) return text('Geen GitHub-token in de kluis.', true);
      const path = String(args.path ?? '');
      if (!path.startsWith('/') || path.includes('..') || path.includes('//')) return text('Ongeldig pad.', true);
      const url = new URL(GITHUB_API + path);
      if (url.origin !== GITHUB_API) return text('Ongeldig pad.', true);
      for (const [k, v] of Object.entries(args.query ?? {})) url.searchParams.set(k, String(v));
      const token = await readOwnerVaultPlaintext(userId, keyName, 'github');
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mijn-ruimte' },
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
      return text(`HTTP ${res.status}\n${await res.text()}`, !res.ok);
    }

    return text(`Onbekend hulpmiddel: ${name}`, true);
  } catch (err) {
    return text(`Fout: ${(err as Error).message}`, true);
  }
}
