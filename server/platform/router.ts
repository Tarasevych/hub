// Compatibiliteitslaag voor de vroegere AppDeploy-router (`router`, `json`, `error`).
// De backend definieert routes als { 'POST /api/x/:id': [middleware, ...] } en ontvangt een
// Lambda-achtig event. server/start.ts bouwt dat event uit een node:http-request.
export interface RouterResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
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

import { metVerzoek } from './context';
import { poortNaVerzoek } from './auth-poort';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

/** JSON-succesantwoord (zoals AppDeploy `json`). */
export function json(data: unknown, status = 200): RouterResponse {
  return { statusCode: status, headers: { ...JSON_HEADERS }, body: JSON.stringify(data ?? null) };
}

/** JSON-foutantwoord `{ error: message }` (zoals AppDeploy `error`). */
export function error(message: string, status = 400): RouterResponse {
  return { statusCode: status, headers: { ...JSON_HEADERS }, body: JSON.stringify({ error: message }) };
}

type CompiledRoute = { method: string; segments: string[]; literalCount: number; order: number; chain: RouterMiddleware[]; pattern: string };

const splitPath = (p: string) => p.split('/').filter((s) => s.length > 0);

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

/** Maak een handler die requests via de middleware-ketens routeert. */
export type RouterHandler = ((event: LambdaEvent) => Promise<RouterResponse>) & { patronen: string[] };
export function router(routes: RouterRoutes): RouterHandler {
  const compiled = compile(routes);
  const handler = async (event: LambdaEvent) => {
    const method = String(event.requestContext?.http?.method || 'GET').toUpperCase();
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
    const ctx: RouterContext = { body: parseBody(event.body), query: event.queryStringParameters || {}, params: best.params, event };
    const gekozen = best;
    // Eigen verzoekcontext per route: sessiecontroles zetten daarin het account (RLS, zie context.ts).
    return metVerzoek(gekozen.route.pattern, async () => {
      try {
        for (const middleware of gekozen.route.chain) {
          const result = await middleware(ctx);
          if (result) return poortNaVerzoek(gekozen.route.pattern, event, result);
        }
        return error('No response', 500);
      } catch (err) {
        console.error(`[router] onverwachte fout in ${gekozen.route.pattern}:`, err);
        return error('Internal server error', 500);
      }
    });
  };
  return Object.assign(handler, { patronen: compiled.map((r) => r.pattern) });
}
