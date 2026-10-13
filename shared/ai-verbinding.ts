// AI-verbindingen (MCP): welke AI-klant het is, hoe lang zijn toegang geldt en welke OAuth-terugkeeradressen veilig zijn.
//
// Gedeeld door de MCP-connector (/mcp, backend/mcp-connector.ts), de toestemmingsroutes en de UI. De MCP-deur
// (deploy/mcp/server.mjs) is een los bestand zonder imports en heeft een eigen kopie van redirectSoort(); de eenheidstest
// tests/eenheid/mcp-een-klik.test.ts houdt beide gelijk met dezelfde voorbeelden.

// ---------------------------------------------------------------- duur van een verbinding
export type DuurId = '1u' | '8u' | '1d' | '7d' | '30d' | 'altijd';
export type Duur = { id: DuurId; accessSec: number; refreshDagen: number; uk: string; nl: string; lang: boolean };
/** accessSec/refreshDagen 0 = geen vervaldatum (tot intrekken). «lang» = vraagt bij het kiezen een verse aanmelding. */
export const DUREN: readonly Duur[] = Object.freeze([
  { id: '1u', accessSec: 3600, refreshDagen: 14, uk: '1 година, поновлюється до 14 днів (рекомендовано)', nl: '1 uur, vernieuwd tot 14 dagen (aanbevolen)', lang: false },
  { id: '8u', accessSec: 8 * 3600, refreshDagen: 30, uk: '8 годин, поновлюється до 30 днів', nl: '8 uur, vernieuwd tot 30 dagen', lang: false },
  { id: '1d', accessSec: 86400, refreshDagen: 30, uk: '1 доба, поновлюється до 30 днів', nl: '1 dag, vernieuwd tot 30 dagen', lang: false },
  { id: '7d', accessSec: 7 * 86400, refreshDagen: 90, uk: '7 днів, поновлюється до 90 днів', nl: '7 dagen, vernieuwd tot 90 dagen', lang: true },
  { id: '30d', accessSec: 30 * 86400, refreshDagen: 180, uk: '30 днів, поновлюється до 180 днів', nl: '30 dagen, vernieuwd tot 180 dagen', lang: true },
  { id: 'altijd', accessSec: 0, refreshDagen: 0, uk: 'Безстроково — до відкликання', nl: 'Onbeperkt — tot intrekken', lang: true },
]);
export const STANDAARD_DUUR: DuurId = '1u';
export const isDuurId = (v: unknown): v is DuurId => typeof v === 'string' && DUREN.some((d) => d.id === v);
export const duur = (id: unknown): Duur => DUREN.find((d) => d.id === id) ?? DUREN[0];
/** «Nooit» als concrete grens (100 jaar): databasevelden en JSON blijven gewone tijdstempels. */
export const NOOIT_SEC = 100 * 365 * 86400;
export const accessSeconden = (d: Duur) => (d.accessSec > 0 ? d.accessSec : NOOIT_SEC);
export const refreshSeconden = (d: Duur) => (d.refreshDagen > 0 ? d.refreshDagen * 86400 : NOOIT_SEC);

// ---------------------------------------------------------------- welke AI-klant
export type KlantId = 'grok' | 'claude' | 'chatgpt' | 'gemini' | 'copilot' | 'cursor' | 'overig';
export type Klant = { id: KlantId; naam: string; deur: string | null };
/** deur = pad van de MCP-deur op mcp.* (zoals in de tunnelregel); null = alleen via de connector /mcp. */
export const KLANTEN: readonly Klant[] = Object.freeze([
  { id: 'grok', naam: 'Grok', deur: 'Grok' },
  { id: 'claude', naam: 'Claude', deur: 'claude' },
  { id: 'chatgpt', naam: 'ChatGPT', deur: 'chatgpt' },
  { id: 'gemini', naam: 'Gemini', deur: 'gemini' },
  { id: 'copilot', naam: 'Copilot', deur: 'copilot' },
  { id: 'cursor', naam: 'Cursor', deur: null },
  { id: 'overig', naam: 'Інший клієнт', deur: null },
]);
const normaal = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g, ' ').trim();
/** «Grok», «grok-web», «Claude Code», «Cursor (via site)» → klant-id; onbekend → 'overig'. */
export function klantVan(naam: string | null | undefined): KlantId {
  const n = normaal(String(naam || ''));
  if (!n) return 'overig';
  for (const k of KLANTEN) if (k.id !== 'overig' && (n === k.id || n.split(' ').includes(k.id))) return k.id;
  if (/\b(openai|gpt)\b/.test(n)) return 'chatgpt';
  if (/\b(xai|x ai)\b/.test(n)) return 'grok';
  if (/\b(anthropic)\b/.test(n)) return 'claude';
  if (/\b(vscode|vs code|visual studio|github)\b/.test(n)) return 'copilot';
  return 'overig';
}
export const klant = (id: unknown): Klant => KLANTEN.find((k) => k.id === id) ?? KLANTEN[KLANTEN.length - 1];
/** Instellingen per klant (jsonb in app.user_ai_settings.verbinding_duur) → geldige DuurId, standaard 1 uur. */
export function duurVoorKlant(instellingen: unknown, id: KlantId): DuurId {
  const m = instellingen && typeof instellingen === 'object' ? instellingen as Record<string, unknown> : {};
  return isDuurId(m[id]) ? m[id] as DuurId : isDuurId(m['*']) ? m['*'] as DuurId : STANDAARD_DUUR;
}

// ---------------------------------------------------------------- OAuth-terugkeeradressen (RFC 8252)
export type RedirectSoort = 'web' | 'loopback' | 'app';
/** https-hosts van bekende AI-klanten (exact of subdomein). */
export const WEB_HOSTS: readonly string[] = Object.freeze(['claude.ai', 'grok.com', 'x.ai', 'chatgpt.com', 'openai.com', 'vscode.dev']);
/** Eigen schema's van desktopapps (RFC 8252 §7.1): alleen deze, met een host (cursor://anysphere.cursor-mcp/oauth/callback). */
export const APP_SCHEMAS: readonly string[] = Object.freeze(['cursor', 'vscode', 'vscode-insiders', 'windsurf']);
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const parse = (v: string): URL | null => { try { return new URL(v); } catch { return null; } };

/**
 * Soort terugkeeradres, of null als het niet mag. Extra adressen (exacte URI of voorvoegsel dat op «/» eindigt) komen uit
 * het root-bestand /etc/mijn-ruimte/mcp-rechten.json («oauthRedirects») of zijn het eigen terugkeeradres van de site.
 * Nooit: gebruikersnaam/wachtwoord in de URL, een fragment, http buiten loopback, javascript:/data:/file:.
 */
export function redirectSoort(uri: string, extra: readonly string[] = []): RedirectSoort | null {
  if (typeof uri !== 'string' || uri.length > 2000 || /[\s<>"]/.test(uri)) return null;
  const u = parse(uri);
  if (!u || u.username || u.password || u.hash || uri.includes('#')) return null;
  const schema = u.protocol.replace(/:$/, '');
  for (const e of extra) {
    if (!e || typeof e !== 'string') continue;
    if (uri === e || (e.endsWith('/') && uri.startsWith(e))) return schema === 'https' ? 'web' : schema === 'http' ? (LOOPBACK.has(u.hostname) ? 'loopback' : null) : APP_SCHEMAS.includes(schema) ? 'app' : null;
  }
  if (schema === 'https') {
    const host = u.hostname.toLowerCase();
    return WEB_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ? 'web' : null;
  }
  if (schema === 'http') return LOOPBACK.has(u.hostname) ? 'loopback' : null;
  if (APP_SCHEMAS.includes(schema)) return u.host ? 'app' : null;
  return null;
}

/** Exacte overeenkomst, behalve bij loopback: daar telt de (steeds wisselende) poort niet mee (RFC 8252 §7.3). */
export function redirectPast(geregistreerd: readonly string[], gevraagd: string): boolean {
  if (geregistreerd.includes(gevraagd)) return true;
  const r = parse(gevraagd);
  if (!r || r.protocol !== 'http:' || !LOOPBACK.has(r.hostname)) return false;
  return geregistreerd.some((x) => { const g = parse(x); return !!g && g.protocol === 'http:' && LOOPBACK.has(g.hostname) && g.hostname === r.hostname && g.pathname === r.pathname && g.search === r.search; });
}

/** Eigen terugkeeradres van de site voor «Підключити автоматично» in de browser (PKCE in de pagina zelf). */
export const SITE_TERUG_PAD = '/oauth-terug';
