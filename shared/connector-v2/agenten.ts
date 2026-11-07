// Connector v2 (15.10.2026, herzien 20.10.2026): elke AI-agent heeft een EIGEN connectoradres. Een token dat voor /grok is uitgegeven
// werkt nergens anders (niet op /gpt, niet op het oude /mcp); de agentnaam zit ook in elke hulpmiddelnaam
// (…_grok_mail_gmail_tarasevych_com_gebruiker), zodat een AI nooit «per ongeluk» de koppeling van een andere AI gebruikt.
//
// EEN PAD PER AGENT (20.10.2026): https://mcp.tarasevych.com/<agent> — /claude, /gpt, /grok, /gemini, /copilot, /cursor.
// Geen /ai/ meer, geen apart /mcp, geen eigen «deur» per AI. Het korte pad werd tot nu toe door de serverdeur bediend
// (deploy/mcp/server.mjs op poort 8091); het hoort nu bij de hoofdapp — zie deploy/CONNECTOR-EEN-PAD.md voor de tunnel- en
// systemd-stappen die daarbij horen.
//
// Het OUDE pad /ai/<agent> blijft erkend: `slugUitPad`/`slugUitResource` lezen het nog (een token dat met resource
// https://mcp.tarasevych.com/ai/claude is uitgegeven blijft dus geldig) en server/start.ts antwoordt er 308 Permanent Redirect
// op, zodat POST + body bewaard blijven. Een 301/302 zou van POST een GET maken en elke bestaande koppeling breken.
//
// RECHTEN ZITTEN NIET IN HET PAD: één connector per agent toont zowel de privé- als de technische hulpmiddelen; wat er op dit
// moment zichtbaar en aanroepbaar is, beslist de LEVENDE staat van de gebruiker (backend/ai-ruimte-poort.ts → effectieveRuimte).
// Puur (geen React/DOM/Node): browser en server gebruiken dezelfde lijst.
import type { KlantId } from '../ai-verbinding';

export const AGENT_PAD_PREFIX = '';
/** Het pad van vóór 20.10.2026. Alleen om oude adressen te blijven lezen (en om er 308 op te antwoorden); nooit om er een te bouwen. */
export const OUD_AGENT_PAD_PREFIX = '/ai';
export const MCP_BASIS = 'https://mcp.tarasevych.com';

export type AgentSlug = 'claude' | 'gpt' | 'grok' | 'gemini' | 'copilot' | 'cursor' | 'antigravity' | 'autoclaw';
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
  // uk/nl: één zin «waar zit het in deze client» (oktober 2026). De volledige stappen en de knoppen staan in
  // src/agenten/verbind-recepten.ts; hier nooit een oud pad (/mcp, /ai/<agent>) en nooit «plak een token» waar OAuth bestaat.
  { slug: 'claude', naam: 'Claude', klant: 'claude', webHosts: ['claude.ai', 'claude.com'], appSchemas: [], loopback: true,
    uk: 'claude.ai і Claude Desktop: Settings → Connectors → Add custom connector (адреса, без client id); Claude Code: claude mcp add --transport http.',
    nl: 'claude.ai en Claude Desktop: Settings → Connectors → Add custom connector (adres, geen client-id); Claude Code: claude mcp add --transport http.' },
  // 25.10.2026 (OpenAI, developer mode): «Connectors» heet nu «Apps»; alleen ChatGPT op het web; schrijven is bèta voor Business/Enterprise/Edu.
  { slug: 'gpt', naam: 'ChatGPT', klant: 'chatgpt', webHosts: ['chatgpt.com', 'openai.com'], appSchemas: [], loopback: true,
    uk: 'ChatGPT (лише в браузері): Settings → Apps → Advanced settings → Developer mode, далі «Create app» (адреса, OAuth); на Plus/Pro дії запису можуть не працювати.',
    nl: 'ChatGPT (alleen in de browser): Settings → Apps → Advanced settings → Developer mode, dan «Create app» (adres, OAuth); op Plus/Pro werken schrijfacties mogelijk niet.' },
  { slug: 'grok', naam: 'Grok', klant: 'grok', webHosts: ['grok.com', 'x.ai'], appSchemas: [], loopback: true,
    uk: 'Споживчий Grok власного MCP-сервера не приймає; клієнти на моделях xAI з mcp.json — через адресу нижче.',
    nl: 'Consumenten-Grok neemt geen eigen MCP-server aan; clients op xAI-modellen met mcp.json via het adres hieronder.' },
  { slug: 'gemini', naam: 'Gemini', klant: 'gemini', webHosts: [], appSchemas: [], loopback: true,
    uk: 'Gemini CLI: ~/.gemini/settings.json → mcpServers → httpUrl; споживчий застосунок Gemini власних MCP-серверів не приймає.',
    nl: 'Gemini CLI: ~/.gemini/settings.json → mcpServers → httpUrl; de consumenten-app Gemini neemt geen eigen MCP-servers aan.' },
  { slug: 'copilot', naam: 'Copilot', klant: 'copilot', webHosts: ['vscode.dev'], appSchemas: ['vscode', 'vscode-insiders'], loopback: true,
    uk: 'VS Code (Copilot): кнопка «Install in VS Code» або MCP: Add Server → HTTP → адреса.',
    nl: 'VS Code (Copilot): knop «Install in VS Code» of MCP: Add Server → HTTP → adres.' },
  { slug: 'cursor', naam: 'Cursor', klant: 'cursor', webHosts: ['cursor.com'], appSchemas: ['cursor'], loopback: true,
    uk: 'Cursor: кнопка «Add to Cursor» або Settings → Tools & MCP → New MCP server → url.',
    nl: 'Cursor: knop «Add to Cursor» of Settings → Tools & MCP → New MCP server → url.' },
  { slug: 'antigravity', naam: 'Antigravity', klant: 'antigravity', webHosts: [], appSchemas: [], loopback: true,
    uk: 'Antigravity: плагін mijn-ruimte (CLI + навичка) або ~/.gemini/settings.json → mcpServers → url із цією адресою.',
    nl: 'Antigravity: plug-in mijn-ruimte (CLI + vaardigheid) of ~/.gemini/settings.json → mcpServers → url met dit adres.' },
  { slug: 'autoclaw', naam: 'AutoClaw', klant: 'autoclaw', webHosts: ['autoclaw.z.ai', 'chat.z.ai', 'z.ai'], appSchemas: [], loopback: true,
    uk: 'AutoClaw (Z.ai / GLM-5.3-flashX-Legal): команда мосту mijn-ruimte або mcp.json із власною адресою /autoclaw та правничою перевіркою джерел.',
    nl: 'AutoClaw (Z.ai / GLM-5.3-flashX-Legal): opdracht van de mijn-ruimte-brug of mcp.json met het eigen adres /autoclaw en juridische broncontrole.' },
]);

const PER_SLUG = new Map(V2_AGENTEN.map((a) => [a.slug, a]));
export const isAgentSlug = (v: unknown): v is AgentSlug => typeof v === 'string' && PER_SLUG.has(v as AgentSlug);
export const v2Agent = (slug: AgentSlug): V2Agent => PER_SLUG.get(slug) as V2Agent;
export const agentVoorKlant = (klant: KlantId): V2Agent | undefined => V2_AGENTEN.find((a) => a.klant === klant);

/**
 * Het OUDE, agentloze adres (https://mcp.<domein>/mcp). Het blijft antwoorden voor koppelingen van vóór 20.10.2026, maar het is
 * nooit meer het adres dat we aanbieden: elke agent heeft zijn eigen adres. Alleen voor uitleg («dit oude adres leidt nu door»)
 * en voor de ene klant die géén bekende agent is («Інший клієнт»).
 */
export const OUD_GEDEELD_URL = `${MCP_BASIS}/mcp`;
export const agentPad = (slug: AgentSlug) => `${AGENT_PAD_PREFIX}/${slug}`;
export const agentUrl = (slug: AgentSlug) => `${MCP_BASIS}${agentPad(slug)}`;
/** Oud adres van deze agent (/ai/<agent>): voor de 308-omleiding en voor de uitleg in de UI. */
export const oudAgentPad = (slug: AgentSlug) => `${OUD_AGENT_PAD_PREFIX}/${slug}`;
export const oudAgentUrl = (slug: AgentSlug) => `${MCP_BASIS}${oudAgentPad(slug)}`;
/**
 * De pagina van deze agent in de hub (rechten, koppelingen, intrekken): https://mcp.<domein>/agenten#agent/<slug>. Het openbare
 * pad is /agenten (public/canonical-service.js: agents → 'agenten'). Voor de instructies en weigeringen van de connector, zodat de
 * AI de mens naar precies de juiste plek stuurt in plaats van een omschrijving van het menu.
 */
export const AGENT_PAGINA_PAD = '/agenten';
export const agentPaginaUrl = (slug: AgentSlug) => `${MCP_BASIS}${AGENT_PAGINA_PAD}#agent/${slug}`;
/** Metadata (RFC 9728) van deze agent: onder het eigen pad (/claude/.well-known/oauth-protected-resource), dat altijd bij de app hoort. */
export const agentPrmUrl = (slug: AgentSlug) => `${agentUrl(slug)}/.well-known/oauth-protected-resource`;

/** '/grok' of '/grok/' → 'grok'; het oude '/ai/grok' blijft erkend; alles anders → null. */
const PAD_RE = /^\/([a-z]+)\/?$/;
const OUD_PAD_RE = new RegExp(`^${OUD_AGENT_PAD_PREFIX}\\/([a-z]+)\\/?$`);
export function slugUitPad(pad: string): AgentSlug | null {
  const p = String(pad || '');
  const m = OUD_PAD_RE.exec(p) ?? PAD_RE.exec(p);
  return m && isAgentSlug(m[1]) ? m[1] : null;
}
/** Is dit het oude pad (/ai/<agent>)? server/start.ts antwoordt daarop 308 naar het korte pad. */
export const isOudAgentPad = (pad: string): AgentSlug | null => {
  const m = OUD_PAD_RE.exec(String(pad || ''));
  return m && isAgentSlug(m[1]) ? m[1] : null;
};
/** RFC 8707 resource → agent (slash aan het eind telt niet). Zowel het korte als het oude pad; nooit een andere host. */
export function slugUitResource(resource: string | null | undefined): AgentSlug | null {
  const r = String(resource || '').replace(/\/+$/, '');
  if (!r.startsWith(`${MCP_BASIS}/`)) return null;
  const rest = r.slice(MCP_BASIS.length);
  if (rest === '/mcp') return null;   // het oude, agentloze eindpunt is geen agent
  return slugUitPad(rest);
}

/**
 * Hoort dit terugkeeradres bij deze agent? Zo kan claude.ai zich niet op /grok aanmelden. Altijd toegestaan: het eigen
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
