// Interne aanroep van routes van de site zelf namens een gebruiker (voor de MCP-hulpmiddelen van mail, agenda, schijf, zoeken, ...).
//
// Waarom niet de logica opnieuw schrijven: de routes van de site (backend/index.ts) kennen de accounts, tokens, limieten en foutafhandeling.
// De MCP-laag roept ze daarom in hetzelfde proces aan via dezelfde router, met een evenement dat ALLEEN hier wordt gemaakt en in een
// WeakMap als "gedelegeerd" is gemarkeerd. `ownerRequireSession` (backend/index.ts) geeft voor zo'n evenement de sessie van PRECIES die
// gebruiker terug (uit het OAuth-token van Claude, nooit uit invoer van het model). Een HTTP-verzoek kan nooit in de WeakMap komen: de
// evenementen van de server worden elders gebouwd (server/start.ts) en dit bestand exporteert geen manier om een bestaand object te markeren.
//
// Alleen routes uit TOEGESTANE_ROUTES zijn bereikbaar; een hulpmiddel kan dus niet "elke route van de site" aanroepen.
type Gedelegeerd = { userId: string; service: string; /** namens-sessie (backend/agent-namens.ts) als de agent met verhoogde rechten werkt */ namensId?: string; agent?: string;
  /** «Подивитися як користувач» (backend/impersonatie.ts): beheerder bekijkt met toestemming de site van userId. */
  impersonatie?: { id: string; beheerderId: string; beheerderEmail?: string; metActies: boolean } };
const gedelegeerd = new WeakMap<object, Gedelegeerd>();

/** Voor ownerRequireSession: is dit evenement door callSite gemaakt, en namens wie? */
export const gedelegeerdeSessie = (event: unknown): Gedelegeerd | undefined =>
  event && typeof event === 'object' ? gedelegeerd.get(event as object) : undefined;

export type SiteAntwoord = { status: number; data: any };
type Aanroeper = (userId: string, service: string, route: string, body: Record<string, unknown>, namens?: { namensId: string; agent: string }) => Promise<SiteAntwoord>;

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
  // 20.10.2026 — de tweerichtingsagenda. Schrijvend, dus `write: true` in backend/site-hulpmiddelen.ts: de eigenaar
  // bevestigt elke aanroep op de site. De routes zelf eisen bovendien de scope calendar.events, een
  // idempotentiesleutel en If-Match met de bekende etag.
  'POST /api/owner/agenda/overzicht',
  'POST /api/owner/agenda/gebeurtenis',
  'POST /api/owner/agenda/gebeurtenis/aanmaken',
  'POST /api/owner/agenda/gebeurtenis/wijzigen',
  'POST /api/owner/agenda/gebeurtenis/verplaatsen',
  'POST /api/owner/agenda/gebeurtenis/verwijderen',
  'POST /api/owner/agenda/gebeurtenis/deelnemers',
  'POST /api/owner/agenda/gebeurtenis/antwoord',
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
  // 21.10.2026 (shared/dev-media-github.ts): «Журнали CI», «Створювати pull request» (maakt alleen een verzoek in de bevestigingsrij),
  // beeld en schema in de eigen hmara, de ontwerpcontext, Stripe alleen lezen en het voorstel voor een eigen domein van een app.
  'POST /api/owner/github/actions/logs',
  'POST /api/owner/github/pr/voorstel',
  'POST /api/owner/media/afbeelding',
  'POST /api/owner/media/diagram',
  'POST /api/owner/media/ontwerp-context',
  'POST /api/owner/betalingen/stripe',
  'POST /api/owner/apps/eigen-domein',
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
  'POST /api/owner/ai/ecosysteem/context/lijst',
  'POST /api/owner/ai/ecosysteem/context/opslaan',
  'POST /api/owner/ai/ecosysteem/overdracht/aanmaken',
  'POST /api/owner/ai/ecosysteem/uitbreiding/opslaan',
  'POST /api/owner/github/branches',
  'POST /api/owner/github/tree',
  'POST /api/owner/github/file',
  'POST /api/owner/github/compare',
  'POST /api/owner/github/releases',
  'POST /api/owner/github/file/save',
  'POST /api/owner/github/spiegel/sync',
]);

const echt: Aanroeper = async (userId, service, route, body, namens) => {
  if (!TOEGESTANE_ROUTES.has(route) && !namens) throw new Error('SITE_ROUTE_NOT_ALLOWED');
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
  gedelegeerd.set(event, { userId, service, ...(namens ? { namensId: namens.namensId, agent: namens.agent } : {}) });
  const res = await handler(event as never) as { statusCode?: number; body?: string };
  let data: any = null;
  try { data = res.body ? JSON.parse(res.body) : null; } catch { data = { raw: String(res.body || '').slice(0, 500) }; }
  return { status: Number(res.statusCode || 0), data };
};

let aanroeper: Aanroeper = echt;
/** Alleen voor tests: de echte aanroep ZONDER hek 1 (callSite), om hek 2 in ownerRequireSession (backend/index.ts) apart te bewijzen. */
export const echteAanroepZonderHekVoorTest: Aanroeper = (...a) => echt(...a);
/** Alleen voor tests: een nagebootste site. */
export const zetSiteAanroeper = (fn: Aanroeper | null) => { aanroeper = fn ?? echt; };

export async function callSite(userId: string, service: string, route: string, body: Record<string, unknown> = {}): Promise<SiteAntwoord> {
  // Pas hier laden (agent-namens → journaal → … mag geen kringverwijzing met index.ts geven).
  const an = await import('./agent-namens');
  // Hek 1 (audit 18.10.2026, K1): wat een agent nooit mag — ook niet met een namens-sessie (eigenaar, rechten, toegang, geheimen).
  if (an.agentRouteVerboden(route)) throw new Error('AGENT_NIET_TOEGESTAAN');
  if (TOEGESTANE_ROUTES.has(route)) return aanroeper(userId, service, route, body);
  // Alleen-lezen beheerroutes: alleen met een actieve namens-sessie die de eigenaar zelf met passkey gaf, voor DEZE agent en ruimte.
  if (!an.NAMENS_ROUTES.has(route)) throw new Error('SITE_ROUTE_NOT_ALLOWED');
  const { huidigeNamens, huidigeRuimte } = await import('./mcp-namens');
  const wie = huidigeNamens();
  if (!wie?.agent) throw new Error('NAMENS_SESSIE_VEREIST');
  const sessie = await an.actieveNamensSessie(userId, wie.agent, huidigeRuimte());
  if (!sessie || !an.routeInOmvang(sessie, route)) throw new Error('NAMENS_SESSIE_VEREIST');
  await an.namensGebruikt(sessie.id);
  return aanroeper(userId, service, route, body, { namensId: sessie.id, agent: sessie.agent });
}

/**
 * «Подивитися як користувач» (0068): één aanroep van de site als doelId, voor een beheerder met toestemming. Alleen backend/impersonatie.ts
 * roept dit aan, NA de controle van de rij en van routeOordeel (hek 1). Het evenement draagt geen cookie of token: de sessie komt uit
 * ownerRequireSession (hek 2) via deze markering. Set-Cookie-koppen van het antwoord worden nooit doorgegeven (alleen status en body).
 */
export async function roepAlsImpersonatie(doelId: string, service: string, route: string, body: Record<string, unknown>, imp: { id: string; beheerderId: string; beheerderEmail?: string; metActies: boolean }): Promise<SiteAntwoord & { geblokkeerd: boolean }> {
  const [method, path] = route.split(' ');
  const { handler } = await import('./index');
  const { metImpersonatie } = await import('../server/platform/context');
  const event = {
    headers: { 'content-type': 'application/json', host: 'hub.tarasevych.com', 'user-agent': 'mijn-ruimte-impersonatie' },
    body: JSON.stringify(body),
    isBase64Encoded: false,
    rawPath: path,
    rawQueryString: '',
    queryStringParameters: {},
    requestContext: { http: { method, path, sourceIp: '127.0.0.1', userAgent: 'mijn-ruimte-impersonatie' } },
  };
  gedelegeerd.set(event, { userId: doelId, service, impersonatie: { ...imp } });
  const { waarde: res, geblokkeerd } = await metImpersonatie({ id: imp.id, door: imp.beheerderId, doorEmail: imp.beheerderEmail }, !imp.metActies,
    async () => await handler(event as never) as { statusCode?: number; body?: string });
  let data: any = null;
  try { data = res.body ? JSON.parse(res.body) : null; } catch { data = { raw: String(res.body || '').slice(0, 500) }; }
  return { status: Number(res.statusCode || 0), data, geblokkeerd };
}
