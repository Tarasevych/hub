// Compatibiliteitslaag voor de vroegere AppDeploy-router (`router`, `json`, `error`).
// De backend definieert routes als { 'POST /api/x/:id': [middleware, ...] } en ontvangt een
// Lambda-achtig event. server/start.ts bouwt dat event uit een node:http-request.
export interface RouterResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  filePath?: string;
}
// Type-alias i.p.v. interface: de backend geeft events door als Record<string, unknown>.
export type LambdaEvent = {
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: false;
  rawPath: string;
  rawQueryString: string;
  queryStringParameters: Record<string, string>;
  requestContext: { http: { method: string; path: string; sourceIp: string; userAgent: string } };
};
export interface RouterContext {
  body: unknown;
  query: Record<string, string>;
  params: Record<string, string>;
  event: LambdaEvent;
  user?: { userId: string; email?: string; name?: string; scope: string };
}
export type RouterMiddleware = (ctx: RouterContext) => Promise<RouterResponse | void> | RouterResponse | void;
export type RouterRoutes = Record<string, RouterMiddleware[]>;

import { isSessieGeverifieerd, metVerzoek } from './context';
import { poortNaVerzoek } from './auth-poort';
import { telAntwoord, telFout } from './antwoord-teller';

// `json`/`error` staan in ./antwoord.ts (zonder pg) en worden hier opnieuw geëxporteerd — niets verandert voor de backend.
import { error, json } from './antwoord';
export { error, json };

export function fileDownload(filePath: string, filename: string, contentType = "application/gzip"): RouterResponse {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename.replace(/["\r\n]/g, "")}"`,
    },
    body: "",
    filePath,
  };
}

type CompiledRoute = { method: string; segments: string[]; literalCount: number; order: number; chain: RouterMiddleware[]; pattern: string };

const splitPath = (p: string) => p.split('/').filter((s) => s.length > 0);
/**
 * Audit-fix 3: alleen canonieke paden routeren. splitPath() negeert lege segmenten, dus '/api/x/' en '/api//x'
 * raakten dezelfde route als '/api/x' terwijl padgebonden controles (strikte rate limits in start.ts) ze niet
 * herkenden. Nu: dubbele of afsluitende slash en punt-segmenten → 404. Zelfde regel in start.ts (vóór de rate limit).
 * Gecodeerde tekens in :param-segmenten blijven werken (letterlijke segmenten worden nooit gedecodeerd).
 */
export const isCanoniekPad = (p: string): boolean => p === '/' || (p.startsWith('/') && !p.includes('//') && !p.endsWith('/') && !/(^|\/)\.{1,2}(\/|$)/.test(p));

function compile(routes: RouterRoutes): CompiledRoute[] {
  return Object.entries(routes).map(([key, chain], order) => {
    const match = /^([A-Z]+)\s+(\/\S*)$/.exec(key.trim());
    if (!match) throw new Error(`ROUTER_PATROON_ONGELDIG:${key}`);
    const segments = splitPath(match[2]);
    return { method: match[1], segments, literalCount: segments.filter((s) => !s.startsWith(':')).length, order, chain, pattern: key };
  });
}

function matchRoute(route: CompiledRoute, parts: string[]): Record<string, string> | null {
  if (route.segments.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i += 1) {
    const seg = route.segments[i];
    if (seg.startsWith(':')) {
      try {
        params[seg.slice(1)] = decodeURIComponent(parts[i]);
      } catch {
        return null;
      }
    } else if (seg !== parts[i]) return null;
  }
  return params;
}

function parseBody(raw: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * SEC-002 (aanv-ronde1-01 p.3, afwerking A): een verzoek dat STAAT WIJZIGT (geen GET/HEAD/OPTIONS), een cookie meedraagt en een body
 * heeft, moet JSON zijn (application/json of …+json). Een HTML-formulier kan alleen application/x-www-form-urlencoded, multipart/form-data
 * of text/plain sturen — ook vanaf een eigen origin (bv. een HTML-bijlage die toch ergens op de site wordt getoond), waar de Origin-controle
 * van server/start.ts niet helpt. Zo'n verzoek krijgt 415 JSON_VEREIST. Zonder cookie (webhooks, agenttokens) of zonder body: geen eis.
 * Запит зі зміною стану, cookie й тілом приймається лише як JSON (форма не може надіслати JSON).
 */
export function alleenJsonAfwijzing(method: string, headers: Record<string, string> | undefined, body: string | undefined): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  if (!body) return false;
  const h = headers || {};
  let cookie = '', type = '';
  for (const [k, v] of Object.entries(h)) { const n = k.toLowerCase(); if (n === 'cookie') cookie = String(v ?? ''); else if (n === 'content-type') type = String(v ?? ''); }
  if (!cookie.trim()) return false;
  const media = type.split(';')[0].trim().toLowerCase();
  return !(media === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/.test(media));
}

/**
 * SEC-002 (slot s, eind-interface 3): een 415 JSON_VEREIST stopt juist het verdachte geval (een formulier met cookie van een andere
 * pagina). Het spoor (journaal met beperkte frequentie + melding aan het account) legt backend/json-weigering.ts vast; los geregistreerd,
 * zodat de router geen database nodig heeft. Faalt nooit: melden mag het antwoord niet veranderen.
 * Відмова 415 лишає слід: запис аудиту (з обмеженням частоти) і сповіщення — реєструється окремо, роутер бази не потребує.
 */
export type JsonWeigering = { patroon: string; headers: Record<string, string> | undefined; ip: string };
let jsonWeigeringMelder: ((w: JsonWeigering) => void) | null = null;
export function registreerJsonWeigeringMelder(fn: ((w: JsonWeigering) => void) | null): void { jsonWeigeringMelder = fn; }

/**
 * SEC-002 (slot s, eind-omzeiling 7): een NUL-teken (U+0000) in de invoer (lijf, query, padparameter) kan Postgres niet bewaren
 * (text/jsonb) en gaf op ±21 routes een vaste 500 — die de zekering van de beschermingen voedt en het journaal vult. Nu één keer aan de
 * rand, afhankelijk van WAAR het teken staat:
 *   - in een WAARDE van het JSON-lijf (tekst van een notitie, titel, inhoud): het teken wordt weggehaald — het is onzichtbaar, Postgres
 *     kan het niet bewaren, en een legitieme tekst (bv. geplakt uit een binair bestand) mag daardoor niet mislukken
 *     (tests/eenheid/toegang-context: «stuurtekens weg»);
 *   - in een SLEUTEL van het lijf, in de query of in een padparameter (namen, id's, paden): 400 INVOER_NUL — daar is het nooit
 *     legitiem en weghalen zou een ander id of pad opleveren.
 * Begrensd doorlopen (diepte 32, 200 000 knopen). Webhooks en MCP-eindpunten (eigen protocol, ondertekende lijven) beslissen zelf.
 * NUL у ЗНАЧЕННЯХ тіла — прибирається; у ключах, query й параметрах шляху (назви, ідентифікатори, шляхи) — 400 INVOER_NUL.
 */
const NUL = String.fromCharCode(0);
const NUL_VRIJ = /\/(webhook|rpc)(\/|$)|\/webhook\/|pubsub\/push/;
/** Haalt NUL uit alle tekstwaarden (in place); geeft false als een SLEUTEL een NUL bevat (dan: weigeren). */
export function nulUitWaarden(waarde: unknown): boolean {
  let knopen = 0;
  const loop = (v: unknown, diepte: number): boolean => {
    if (++knopen > 200_000 || diepte > 32 || !v || typeof v !== 'object') return true;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) { const x = v[i]; if (typeof x === 'string') { if (x.includes(NUL)) v[i] = x.split(NUL).join(''); } else if (!loop(x, diepte + 1)) return false; }
      return true;
    }
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (k.includes(NUL)) return false;
      const x = o[k];
      if (typeof x === 'string') { if (x.includes(NUL)) o[k] = x.split(NUL).join(''); } else if (!loop(x, diepte + 1)) return false;
    }
    return true;
  };
  return loop(waarde, 0);
}
export function bevatNul(waarde: unknown): boolean {
  let knopen = 0;
  const loop = (v: unknown, diepte: number): boolean => {
    if (++knopen > 200_000 || diepte > 32) return false;
    if (typeof v === 'string') return v.includes(NUL);
    if (!v || typeof v !== 'object') return false;
    if (Array.isArray(v)) { for (const x of v) if (loop(x, diepte + 1)) return true; return false; }
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (k.includes(NUL) || loop(x, diepte + 1)) return true;
    return false;
  };
  return loop(waarde, 0);
}

/** Ruimtes-scheiding (0123): één nabewerking van elk antwoord (koppen), geregistreerd door backend/ruimte-sessie.ts. */
type Nabewerking = (pad: string, antwoord: RouterResponse) => Promise<RouterResponse>;
let nabewerking: Nabewerking | null = null;
export function registreerAntwoordNabewerking(fn: Nabewerking | null): void { nabewerking = fn; }
const nabewerken = async (pad: string, antwoord: RouterResponse): Promise<RouterResponse> => {
  if (!nabewerking) return antwoord;
  try { return await nabewerking(pad, antwoord); } catch { return antwoord; }
};

/** Maak een handler die requests via de middleware-ketens routeert. */
export type RouterHandler = ((event: LambdaEvent) => Promise<RouterResponse>) & { patronen: string[] };
export function router(routes: RouterRoutes): RouterHandler {
  const compiled = compile(routes);
  const handler = async (event: LambdaEvent) => {
    const method = String(event.requestContext?.http?.method || 'GET').toUpperCase();
    if (!isCanoniekPad(event.rawPath || '/')) return error('Not found', 404);
    const parts = splitPath(event.rawPath || '/');
    let best: { route: CompiledRoute; params: Record<string, string> } | null = null;
    let pathMatched = false;
    for (const route of compiled) {
      const params = matchRoute(route, parts);
      if (!params) continue;
      pathMatched = true;
      if (route.method !== method && !(method === 'HEAD' && route.method === 'GET')) continue;
      // Meest specifieke route wint (meeste letterlijke segmenten), daarna definitievolgorde.
      if (!best || route.literalCount > best.route.literalCount) best = { route, params };
    }
    if (!best) return pathMatched ? error('Method not allowed', 405) : error('Not found', 404);
    if (alleenJsonAfwijzing(method, event.headers, event.body)) {
      telAntwoord(415);
      try { jsonWeigeringMelder?.({ patroon: best.route.pattern, headers: event.headers, ip: String(event.requestContext?.http?.sourceIp || '') }); } catch { /* nooit het antwoord raken */ }
      return error('JSON_VEREIST', 415);
    }
    const ctx: RouterContext = { body: parseBody(event.body), query: event.queryStringParameters || {}, params: best.params, event };
    // Webhooks en MCP-eindpunten (eigen protocol, ondertekende lijven van buiten) beslissen zelf; een ruw (niet-JSON) lijf ook.
    if (!NUL_VRIJ.test(best.route.pattern) && ((ctx.body && typeof ctx.body === 'object' && !nulUitWaarden(ctx.body)) || bevatNul(ctx.query) || bevatNul(ctx.params))) { telAntwoord(400); return error('INVOER_NUL', 400); }
    const gekozen = best;
    // Eigen verzoekcontext per route: sessiecontroles zetten daarin het account (RLS, zie context.ts).
    return metVerzoek(gekozen.route.pattern, async () => {
      try {
        for (const middleware of gekozen.route.chain) {
          const result = await middleware(ctx);
          if (result) {
            const uit = await nabewerken(event.rawPath || '/', poortNaVerzoek(gekozen.route.pattern, event, result));
            telAntwoord(uit.statusCode, undefined, { geverifieerd: isSessieGeverifieerd() });
            return uit;
          }
        }
        telAntwoord(500);
        return error('No response', 500);
      } catch (err) {
        console.error(`[router] onverwachte fout in ${gekozen.route.pattern}:`, err);
        telFout(err); telAntwoord(500); // zekering van de beschermingen (antwoord-teller.ts)
        return error('Internal server error', 500);
      }
    }, { ip: event.requestContext?.http?.sourceIp, ua: event.requestContext?.http?.userAgent });
  };
  return Object.assign(handler, { patronen: compiled.map((r) => r.pattern) });
}
