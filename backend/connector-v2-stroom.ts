// Connector v2 — de SSE-stroom van Streamable HTTP (GET /<agent> met Accept: text/event-stream) en de melding
// `notifications/tools/list_changed` (20.10.2026).
//
// Waarom: AI-klanten onthouden de uitkomst van tools/list. Sinds de levende rechten verandert die lijst zonder dat de koppeling
// verandert: zet de eigenaar zijn technische profiel aan, dan komen de _beheer-namen erbij; zet hij het uit (of de dienst «ai»
// in zijn technische gegevensruimte), dan verdwijnen ze. Zonder melding blijft de klant een verouderde lijst tonen tot de mens
// «herverbindt» of een nieuw gesprek begint. MCP heeft daar een eigen bericht voor, maar de server kan het alleen sturen over een
// kanaal dat de klant open houdt: de GET-stroom van Streamable HTTP. Biedt de klant die niet aan (sommige doen dat niet), dan
// verandert er niets aan de rechten — alleen de lijst in dat gesprek is verouderd; de pagina Agenten → Connectors zegt dat eerlijk.
//
// Ontwerp: GEEN haken in tech-profiel.ts of ruimte-scheiding.ts (die zouden elke oorzaak apart moeten kennen: profiel, dienst,
// rol, bevriezing). Elke open stroom kijkt zelf om de paar seconden naar aiPoortNu(userId) — dezelfde ene waarheid die tools/list
// en tools/call gebruiken — en meldt zodra de ruimte van de hulpmiddelen wisselt. Eén kleine query per stroom per interval; het
// aantal stromen is begrensd (per gebruiker en in totaal). Hartslag als commentaarregel, zodat de tunnel (cloudflared) en de
// klant de verbinding niet als dood zien.
import type http from 'node:http';
import { aiPoortNu } from './ai-ruimte-poort';
import { isAgentSlug } from '../shared/connector-v2/agenten';
import { koppelingVan } from './connector-v2';
import { authenticate, unauthorized } from './mcp-connector';
import type { AiRuimte } from '../shared/ai-ruimte';

const pollMs = () => Math.max(200, Number(process.env.MCP_LIJST_POLL_MS) || 10_000);
const HARTSLAG_MS = 25_000;
const MAX_STROMEN = 60;
const MAX_PER_GEBRUIKER = 6;

type Stroom = { userId: string; agent: string; res: http.ServerResponse; ruimte: AiRuimte; geopend: number; sluit: () => void };
const stromen = new Set<Stroom>();

export const LIST_CHANGED = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });

const schrijf = (s: Stroom, tekst: string): boolean => { try { return s.res.write(tekst); } catch { return false; } };

/** Alle open stromen van deze mens nu melden dat de lijst veranderde (ook bruikbaar vanuit een haak; de poller doet het anders zelf). */
export function meldLijstGewijzigd(userId: string, ruimte?: AiRuimte): number {
  let n = 0;
  for (const s of stromen) {
    if (s.userId !== userId) continue;
    if (ruimte !== undefined) s.ruimte = ruimte;
    if (schrijf(s, `event: message\ndata: ${LIST_CHANGED}\n\n`)) n++;
  }
  return n;
}

export const openStromen = (userId?: string) => [...stromen].filter((s) => !userId || s.userId === userId).map((s) => ({ agent: s.agent, geopend: s.geopend, ruimte: s.ruimte }));

/** Open SSE-stromen van één gebruiker (optioneel alleen één agent of 'mcp') netjes sluiten, bv. bij DELETE of intrekken. */
export function sluitStromenVan(userId: string, agent?: string): number {
  let n = 0;
  for (const s of [...stromen]) {
    if (s.userId !== userId || (agent !== undefined && s.agent !== agent)) continue;
    s.sluit();
    n++;
  }
  return n;
}

/** Alle stromen netjes sluiten (bij het stoppen van de server). */
export function sluitAlleStromen(): void { for (const s of [...stromen]) s.sluit(); }

/**
 * Een geauthenticeerde GET /<agent> als SSE-stroom openen. De aanroeper (server/start.ts) heeft het token al gecontroleerd en de
 * rechten gelezen; hier alleen nog de stroom zelf. Keert meteen terug; de verbinding blijft open tot de klant sluit.
 */
export async function openStroom(req: http.IncomingMessage, res: http.ServerResponse, wie: { userId: string; agent: string }): Promise<void> {
  // Begrenzen: de oudste stroom van dezelfde mens (of van allemaal) wijkt.
  const eigen = [...stromen].filter((s) => s.userId === wie.userId).sort((a, b) => a.geopend - b.geopend);
  if (eigen.length >= MAX_PER_GEBRUIKER) eigen[0].sluit();
  if (stromen.size >= MAX_STROMEN) [...stromen].sort((a, b) => a.geopend - b.geopend)[0]?.sluit();

  const start = (await aiPoortNu(wie.userId)).ruimte;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', 'Content-Encoding': 'identity',
  });
  res.flushHeaders?.();
  let timers: NodeJS.Timeout[] = [];
  const s: Stroom = {
    userId: wie.userId, agent: wie.agent, res, ruimte: start, geopend: Date.now(),
    sluit: () => { for (const t of timers) clearInterval(t); timers = []; stromen.delete(s); try { res.end(); } catch { /* al dicht */ } },
  };
  stromen.add(s);
  schrijf(s, `: mijn-ruimte ${wie.agent} stroom open; ruimte=${start}\n\n`);
  // Hartslag en de poller: de ene waarheid (aiPoortNu) elke POLL_MS; wisselt de ruimte van de hulpmiddelen, dan list_changed.
  timers.push(setInterval(() => { if (!schrijf(s, ': hartslag\n\n')) s.sluit(); }, HARTSLAG_MS));
  let bezig = false;
  timers.push(setInterval(async () => {
    if (bezig) return;
    bezig = true;
    try {
      const nu = (await aiPoortNu(wie.userId)).ruimte;
      if (nu !== s.ruimte) { s.ruimte = nu; if (!schrijf(s, `event: message\ndata: ${LIST_CHANGED}\n\n`)) s.sluit(); }
    } catch { /* de volgende ronde probeert opnieuw; nooit de stroom sluiten om een tijdelijke databasefout */ }
    finally { bezig = false; }
  }, pollMs()));
  for (const t of timers) t.unref?.();
  req.on('close', () => s.sluit());
  res.on('error', () => s.sluit());
}

/**
 * GET /<agent> met `Accept: text/event-stream` (server/start.ts): dezelfde toegangspoort als POST (token van deze agent, of een
 * /mcp-token van dezelfde klant), daarna de stroom. Zonder geldig token: dezelfde 401 met WWW-Authenticate als de POST-kant, zodat
 * de klant gewoon (opnieuw) aanmeldt. Een GET zonder event-stream-Accept hoort hier niet (de router antwoordt 405).
 */
export async function stroomVerzoek(req: http.IncomingMessage, res: http.ServerResponse, slug: string): Promise<void> {
  if (!isAgentSlug(slug)) { res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'unknown_agent' })); return; }
  const toegang = await koppelingVan(slug, String(req.headers.authorization || ''));
  if ('statusCode' in toegang) { res.writeHead(toegang.statusCode, toegang.headers); res.end(toegang.body); return; }
  await openStroom(req, res, { userId: toegang.koppeling.userId, agent: slug });
}

/** GET /mcp met `Accept: text/event-stream`: SSE-stroom voor het oude /mcp-eindpunt (list_changed bij herauthenticatie of UI-wijziging). */
export async function stroomVerzoekMcp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const authHeader = String(req.headers.authorization || '');
  const who = await authenticate(authHeader);
  if (!who || who.agent) {
    const weigering = unauthorized(!!authHeader.trim());
    res.writeHead(weigering.statusCode, weigering.headers);
    res.end(weigering.body);
    return;
  }
  await openStroom(req, res, { userId: who.userId, agent: 'mcp' });
}
