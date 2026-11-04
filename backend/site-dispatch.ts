// Interne aanroep van routes van de site zelf namens een gebruiker (voor de MCP-hulpmiddelen van mail, agenda, schijf, zoeken, ...).
//
// Waarom niet de logica opnieuw schrijven: de routes van de site (backend/index.ts) kennen de accounts, tokens, limieten en foutafhandeling.
// De MCP-laag roept ze daarom in hetzelfde proces aan via dezelfde router, met een evenement dat ALLEEN hier wordt gemaakt en in een
// WeakMap als "gedelegeerd" is gemarkeerd. `ownerRequireSession` (backend/index.ts) geeft voor zo'n evenement de sessie van PRECIES die
// gebruiker terug (uit het OAuth-token van Claude, nooit uit invoer van het model). Een HTTP-verzoek kan nooit in de WeakMap komen: de
// evenementen van de server worden elders gebouwd (server/start.ts) en dit bestand exporteert geen manier om een bestaand object te markeren.
//
// Alleen routes uit TOEGESTANE_ROUTES zijn bereikbaar; een hulpmiddel kan dus niet "elke route van de site" aanroepen.
type Gedelegeerd = { userId: string; service: string };
const gedelegeerd = new WeakMap<object, Gedelegeerd>();

/** Voor ownerRequireSession: is dit evenement door callSite gemaakt, en namens wie? */
export const gedelegeerdeSessie = (event: unknown): Gedelegeerd | undefined =>
  event && typeof event === 'object' ? gedelegeerd.get(event as object) : undefined;

export type SiteAntwoord = { status: number; data: any };
type Aanroeper = (userId: string, service: string, route: string, body: Record<string, unknown>) => Promise<SiteAntwoord>;

// Routes die de MCP-hulpmiddelen mogen aanroepen (methode + pad). Alles anders wordt geweigerd.
export const TOEGESTANE_ROUTES = new Set<string>([
  'POST /api/owner/global-search',
  'POST /api/owner/mail/google-suite/accounts',
  'POST /api/owner/mail/google-suite/labels',
  'POST /api/owner/mail/google-suite/messages',
  'POST /api/owner/mail/google-suite/message',
  'POST /api/owner/mail/google-suite/message/modify',
  'POST /api/owner/cloud/google-suite/calendar/calendars',
  'POST /api/owner/cloud/google-suite/calendar/events',
  'POST /api/owner/cloud/google-suite/drive/browse',
  'POST /api/owner/cloud/google-suite/drive/file',
  'POST /api/owner/github/status',
  'POST /api/owner/github/repos',
  'POST /api/owner/github/repo',
  'POST /api/owner/github/issues',
  'POST /api/owner/github/commits',
  'POST /api/owner/github/actions',
  'POST /api/owner/github/readme',
  'POST /api/owner/github/search',
  'POST /api/owner/github/projects',
  'POST /api/owner/github/activity',
  'POST /api/owner/github/issue/create',
  'POST /api/owner/github/issue/comment',
  'POST /api/mcp/board/list',
  'POST /api/mcp/board/search',
  'POST /api/mcp/board',
  'PATCH /api/mcp/board',
  'PUT /api/mcp/board',
  'POST /api/mcp/spiegel/release/live',
  'POST /api/mcp/spiegel/release/list',
  'POST /api/mcp/spiegel/release/file',
  'POST /api/mcp/spiegel/health',
  'POST /api/mcp/spiegel/services',
  'POST /api/mcp/spiegel/service',
  'POST /api/mcp/spiegel/hub',
  'POST /api/mcp/spiegel/stats',
  'POST /api/owner/mail/compose/draft/save',
  'POST /api/mcp/traffic',
  'POST /api/mcp/health',
  'POST /api/mcp/archive/status',
  'POST /api/mcp/backups',
]);

const echt: Aanroeper = async (userId, service, route, body) => {
  if (!TOEGESTANE_ROUTES.has(route)) throw new Error('SITE_ROUTE_NOT_ALLOWED');
  const [method, path] = route.split(' ');
  const { handler } = await import('./index'); // pas hier laden: index.ts importeert (indirect) dit bestand
  const event = {
    headers: { 'content-type': 'application/json', host: 'mcp.tarasevych.com', 'user-agent': 'mijn-ruimte-mcp-intern' },
    body: JSON.stringify(body),
    isBase64Encoded: false,
    rawPath: path,
    rawQueryString: '',
    queryStringParameters: {},
    requestContext: { http: { method, path, sourceIp: '127.0.0.1', userAgent: 'mijn-ruimte-mcp-intern' } },
  };
  gedelegeerd.set(event, { userId, service });
  const res = await handler(event as never) as { statusCode?: number; body?: string };
  let data: any = null;
  try { data = res.body ? JSON.parse(res.body) : null; } catch { data = { raw: String(res.body || '').slice(0, 500) }; }
  return { status: Number(res.statusCode || 0), data };
};

let aanroeper: Aanroeper = echt;
/** Alleen voor tests: een nagebootste site. */
export const zetSiteAanroeper = (fn: Aanroeper | null) => { aanroeper = fn ?? echt; };

export async function callSite(userId: string, service: string, route: string, body: Record<string, unknown> = {}): Promise<SiteAntwoord> {
  if (!TOEGESTANE_ROUTES.has(route)) throw new Error('SITE_ROUTE_NOT_ALLOWED');
  return aanroeper(userId, service, route, body);
}
