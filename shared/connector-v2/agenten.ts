// Connector v2 (15.10.2026): elke AI-agent heeft een EIGEN connectoradres. Een token dat voor /ai/grok is uitgegeven werkt
// nergens anders (niet op /ai/gpt, niet op het oude /mcp); de agentnaam zit ook in elke hulpmiddelnaam
// (…_grok_mail_gmail_tarasevych_com_gebruiker), zodat een AI nooit «per ongeluk» de koppeling van een andere AI gebruikt.
//
// Pad: https://mcp.tarasevych.com/ai/<agent>. De korte paden /grok, /claude, /chatgpt, /gemini, /copilot zijn (nog) van de
// serverdeur (deploy/mcp/server.mjs op poort 8091, tunnelregel in cloudflared-config.yml). Zodra de deur verhuist, volstaat het
// om AGENT_PAD_PREFIX op '' te zetten — alle code bouwt adressen via agentPad()/agentUrl().
// Puur (geen React/DOM/Node): browser en server gebruiken dezelfde lijst.
import type { KlantId } from '../ai-verbinding';

export const AGENT_PAD_PREFIX = '/ai';
export const MCP_BASIS = 'https://mcp.tarasevych.com';

export type AgentSlug = 'claude' | 'gpt' | 'grok' | 'gemini' | 'copilot' | 'cursor';
export interface V2Agent {
  slug: AgentSlug;
  naam: string;
  /** Klant-id van shared/ai-verbinding.ts (journaal, duurinstellingen, sitebrede schakelaars). */
  klant: Exclude<KlantId, 'overig'>;
  /** https-terugkeeradressen die bij deze agent horen (exact of subdomein). */
  webHosts: readonly string[];
  /** Eigen app-schema's (cursor://, vscode://). */
  appSchemas: readonly string[];
  /** Lokale klanten (CLI/IDE) gebruiken loopback (RFC 8252). */
  loopback: boolean;
  uk: string;
  nl: string;
}

export const V2_AGENTEN: readonly V2Agent[] = Object.freeze([
  { slug: 'claude', naam: 'Claude', klant: 'claude', webHosts: ['claude.ai', 'claude.com'], appSchemas: [], loopback: true,
    uk: 'claude.ai → Customize → Connectors → Add custom connector; Claude Code — через локальну адресу.',
    nl: 'claude.ai → Customize → Connectors → Add custom connector; Claude Code via een lokaal adres.' },
  { slug: 'gpt', naam: 'ChatGPT', klant: 'chatgpt', webHosts: ['chatgpt.com', 'openai.com'], appSchemas: [], loopback: true,
    uk: 'ChatGPT → Settings → Connectors (режим розробника) → додати MCP-сервер.',
    nl: 'ChatGPT → Settings → Connectors (ontwikkelaarsmodus) → MCP-server toevoegen.' },
  { slug: 'grok', naam: 'Grok', klant: 'grok', webHosts: ['grok.com', 'x.ai'], appSchemas: [], loopback: true,
    uk: 'Grok → віддалений MCP-сервер → вставте адресу.',
    nl: 'Grok → externe MCP-server → adres plakken.' },
  { slug: 'gemini', naam: 'Gemini', klant: 'gemini', webHosts: [], appSchemas: [], loopback: true,
    uk: 'Gemini CLI: settings.json → mcpServers → httpUrl (вхід через локальну адресу).',
    nl: 'Gemini CLI: settings.json → mcpServers → httpUrl (aanmelden via een lokaal adres).' },
  { slug: 'copilot', naam: 'Copilot', klant: 'copilot', webHosts: ['vscode.dev'], appSchemas: ['vscode', 'vscode-insiders'], loopback: true,
    uk: 'VS Code → MCP: Add Server → HTTP → вставте адресу.',
    nl: 'VS Code → MCP: Add Server → HTTP → adres plakken.' },
  { slug: 'cursor', naam: 'Cursor', klant: 'cursor', webHosts: [], appSchemas: ['cursor'], loopback: true,
    uk: 'Cursor → Settings → MCP → Add new MCP server → url.',
    nl: 'Cursor → Settings → MCP → Add new MCP server → url.' },
]);

const PER_SLUG = new Map(V2_AGENTEN.map((a) => [a.slug, a]));
export const isAgentSlug = (v: unknown): v is AgentSlug => typeof v === 'string' && PER_SLUG.has(v as AgentSlug);
export const v2Agent = (slug: AgentSlug): V2Agent => PER_SLUG.get(slug) as V2Agent;
export const agentVoorKlant = (klant: KlantId): V2Agent | undefined => V2_AGENTEN.find((a) => a.klant === klant);

export const agentPad = (slug: AgentSlug) => `${AGENT_PAD_PREFIX}/${slug}`;
export const agentUrl = (slug: AgentSlug) => `${MCP_BASIS}${agentPad(slug)}`;
/** Metadata (RFC 9728) van deze agent: onder het eigen pad, zodat de tunnelregel voor /.well-known (serverdeur) niet geraakt wordt. */
export const agentPrmUrl = (slug: AgentSlug) => `${agentUrl(slug)}/.well-known/oauth-protected-resource`;

/** '/ai/grok' of '/ai/grok/' → 'grok'; alles anders → null. */
export function slugUitPad(pad: string): AgentSlug | null {
  const m = new RegExp(`^${AGENT_PAD_PREFIX.replace(/\//g, '\\/')}\\/([a-z]+)\\/?$`).exec(String(pad || ''));
  return m && isAgentSlug(m[1]) ? m[1] : null;
}
/** RFC 8707 resource → agent (slash aan het eind telt niet). */
export function slugUitResource(resource: string | null | undefined): AgentSlug | null {
  const r = String(resource || '').replace(/\/+$/, '');
  if (!r.startsWith(`${MCP_BASIS}${AGENT_PAD_PREFIX}/`)) return null;
  return slugUitPad(r.slice(MCP_BASIS.length));
}

/**
 * Hoort dit terugkeeradres bij deze agent? Zo kan claude.ai zich niet op /ai/grok aanmelden. Altijd toegestaan: het eigen
 * terugkeeradres van de site en de extra adressen van de eigenaar (mcp-rechten.json → oauthRedirects).
 */
export function redirectPastBijAgent(slug: AgentSlug, uri: string, altijd: readonly string[] = []): boolean {
  let u: URL;
  try { u = new URL(uri); } catch { return false; }
  if (altijd.some((e) => e && (uri === e || (e.endsWith('/') && uri.startsWith(e))))) return true;
  const a = v2Agent(slug);
  const schema = u.protocol.replace(/:$/, '');
  if (schema === 'https') { const h = u.hostname.toLowerCase(); return a.webHosts.some((w) => h === w || h.endsWith(`.${w}`)); }
  if (schema === 'http') return a.loopback && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  return a.appSchemas.includes(schema);
}
