// HTTP-server voor de zelf-gehoste app (vervangt het AppDeploy-platform).
//
// - Luistert alleen op HOST (standaard 127.0.0.1) : PORT (standaard 8080); publiek verkeer komt
//   uitsluitend via de Cloudflare Tunnel (cloudflared, uitgaand).
// - Accepteert alleen bekende hostnamen (Host-header); x-forwarded-host wordt genegeerd.
// - Client-IP komt alleen uit cf-connecting-ip (door Cloudflare gezet); x-forwarded-for e.d. van
//   de client worden overschreven, zodat app-code ze niet kan vertrouwen.
// - /api/* op de app-hosts → bestaande router (Lambda-achtig event); overige paden → dist/ (SPA).
// - dashboard.<domein> → statische map DASHBOARD_DIR (404 als die ontbreekt), geen API.
// - Beveiligingsheaders (CSP als HTTP-header, HSTS, nosniff, ...) op alle antwoorden.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DASHBOARD_HOST, SERVICE_HOSTS } from '../backend/deployment-identity';
import { handler } from '../backend/index';
import { closePool, getPool } from './platform/pg';
import type { LambdaEvent, RouterResponse } from './platform/router';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8080);
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(here, '..', 'dist'));
const DASHBOARD_DIR = path.resolve(process.env.DASHBOARD_DIR || '/srv/mijn-ruimte/dashboard');
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 12 * 1024 * 1024);

const APP_HOSTS = new Set<string>(Object.values(SERVICE_HOSTS));
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// CSP voor de app (zelfde productiebeleid als public/canonical-security.js, zonder AppDeploy-hosts).
// 'wasm-unsafe-eval' is nodig voor sql.js / h5wasm / pdf.js in de documentvoorbeelden.
const APP_CSP = [
  "default-src 'self'", "base-uri 'none'", "object-src 'none'", 'frame-src blob:', "form-action 'self'",
  "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self'", "style-src-elem 'self'", "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com", "font-src 'self' data:", "connect-src 'self'",
  "worker-src 'self' blob:", "manifest-src 'self'", "media-src 'self' blob: data:", "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');
// Voorlopig beleid voor het losse dashboard (wordt bij integratie aangescherpt).
const DASHBOARD_CSP = [
  "default-src 'self'", "base-uri 'none'", "object-src 'none'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:", "connect-src 'self'", "frame-ancestors 'none'", "form-action 'self'",
].join('; ');

const BASE_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml', '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

// ---------------------------------------------------------------------------------------------
// Hulpfuncties
// ---------------------------------------------------------------------------------------------
const hostOf = (req: http.IncomingMessage) => String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');

/** Client-IP: alleen cf-connecting-ip (Cloudflare); anders het socket-adres (lokaal verkeer). */
function clientIp(req: http.IncomingMessage): string {
  const cf = String(req.headers['cf-connecting-ip'] || '').trim();
  if (cf && /^[0-9a-fA-F:.]{2,45}$/.test(cf)) return cf;
  return String(req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

/** Splits een samengevoegde Set-Cookie-waarde (meerdere cookies) veilig op. */
const splitSetCookie = (value: string) => value.split(/,\s*(?=[!#$%&'*+\-.^_`|~0-9A-Za-z]+=)/).filter(Boolean);

function send(res: http.ServerResponse, status: number, headers: Record<string, string | string[]>, body?: string | Buffer) {
  if (res.headersSent) return;
  res.writeHead(status, { ...BASE_HEADERS, ...headers });
  res.end(body);
}
const sendText = (res: http.ServerResponse, status: number, text: string) =>
  send(res, status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, text);
const sendJson = (res: http.ServerResponse, status: number, data: unknown) =>
  send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(data));

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Bouw het Lambda-achtige event dat de bestaande backend verwacht. */
function buildEvent(req: http.IncomingMessage, url: URL, body: string, ip: string): LambdaEvent {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  // Niet-vertrouwde proxyheaders van de client verwijderen/overschrijven.
  delete headers['x-forwarded-host'];
  delete headers['forwarded'];
  delete headers['x-real-ip'];
  headers['x-forwarded-for'] = ip;
  headers['x-forwarded-proto'] = 'https';
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams) query[key] = value;
  return {
    headers,
    body,
    isBase64Encoded: false,
    rawPath: url.pathname,
    rawQueryString: url.search.replace(/^\?/, ''),
    queryStringParameters: query,
    requestContext: { http: { method: String(req.method || 'GET').toUpperCase(), path: url.pathname, sourceIp: ip, userAgent: headers['user-agent'] || '' } },
  };
}

function writeRouterResponse(res: http.ServerResponse, response: RouterResponse) {
  const headers: Record<string, string | string[]> = { 'Cache-Control': 'no-store' };
  for (const [key, value] of Object.entries(response.headers || {})) {
    if (key.toLowerCase() === 'set-cookie') headers['Set-Cookie'] = splitSetCookie(String(value));
    else headers[key] = String(value);
  }
  send(res, response.statusCode || 200, headers, response.body ?? '');
}

/** Pad binnen een root oplossen; null bij traversal of ongeldige codering. */
function safeJoin(root: string, urlPath: string): string | null {
  let decoded: string;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0')) return null;
  const full = path.resolve(root, '.' + path.posix.normalize('/' + decoded));
  return full === root || full.startsWith(root + path.sep) ? full : null;
}

async function fileStat(p: string) {
  try { const s = await stat(p); return s.isFile() ? s : null; } catch { return null; }
}

async function serveFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, csp: string, immutable: boolean) {
  const s = await fileStat(file);
  if (!s) return false;
  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${s.size.toString(16)}-${Math.floor(s.mtimeMs).toString(16)}"`;
  const headers: Record<string, string> = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ETag: etag,
  };
  if (ext === '.html') headers['Content-Security-Policy'] = csp;
  if (path.basename(file) === 'service-worker.js') headers['Service-Worker-Allowed'] = '/';
  if (req.headers['if-none-match'] === etag) { send(res, 304, headers); return true; }
  headers['Content-Length'] = String(s.size);
  if (req.method === 'HEAD') { send(res, 200, headers); return true; }
  res.writeHead(200, { ...BASE_HEADERS, ...headers });
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL, root: string, spa: boolean, csp: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed');
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) return sendText(res, 404, 'Niet gevonden');
  const file = safeJoin(root, url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
  if (!file) return sendText(res, 400, 'Ongeldig pad');
  const immutable = spa && url.pathname.startsWith('/assets/');
  if (await serveFile(req, res, file, csp, immutable)) return;
  // SPA-fallback: alleen voor "pagina"-paden zonder extensie (tabpaden zoals /inbox).
  if (spa && !path.posix.extname(url.pathname)) {
    if (await serveFile(req, res, path.join(root, 'index.html'), csp, false)) return;
  }
  return sendText(res, 404, 'Niet gevonden');
}

// ---------------------------------------------------------------------------------------------
// Request-afhandeling
// ---------------------------------------------------------------------------------------------
async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const host = hostOf(req);
  const url = new URL(req.url || '/', 'http://intern.invalid');

  // Gezondheidscontrole voor systemd/monitoring, los van de Host-allow-list.
  if (url.pathname === '/__gezondheid') {
    try { await getPool().query('SELECT 1'); return sendJson(res, 200, { ok: true, db: true }); }
    catch { return sendJson(res, 503, { ok: false, db: false }); }
  }

  if (host === DASHBOARD_HOST) {
    if (url.pathname.startsWith('/api/')) return sendText(res, 404, 'Niet gevonden');
    return serveStatic(req, res, url, DASHBOARD_DIR, false, DASHBOARD_CSP);
  }
  if (!APP_HOSTS.has(host)) {
    return sendText(res, LOCAL_HOSTS.has(host) ? 404 : 421, 'Onbekende host');
  }

  if (url.pathname.startsWith('/api/')) {
    const ip = clientIp(req);
    let body = '';
    try { body = req.method === 'GET' || req.method === 'HEAD' ? '' : await readBody(req); }
    catch (err) { return sendJson(res, (err as { status?: number }).status || 400, { error: 'BODY_TOO_LARGE' }); }
    const response = await handler(buildEvent(req, url, body, ip) as never);
    return writeRouterResponse(res, response as RouterResponse);
  }
  return serveStatic(req, res, url, DIST_DIR, true, APP_CSP);
}

export function createServer() {
  return http.createServer((req, res) => {
    const started = Date.now();
    res.on('finish', () => {
      // Geen querystrings loggen (kunnen codes/tokens bevatten).
      const pathOnly = String(req.url || '').split('?')[0].slice(0, 200);
      console.log(`${req.method} ${hostOf(req)} ${pathOnly} ${res.statusCode} ${Date.now() - started}ms`);
    });
    handle(req, res).catch((err) => {
      console.error('[server] onverwachte fout:', err);
      sendJson(res, 500, { error: 'Internal server error' });
    });
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL ontbreekt'); process.exit(1); }
  const server = createServer();
  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  server.keepAliveTimeout = 65_000;
  server.listen(PORT, HOST, () => console.log(`[server] luistert op http://${HOST}:${PORT} (dist: ${DIST_DIR})`));
  const stop = (signal: string) => {
    console.log(`[server] ${signal} ontvangen, stoppen...`);
    server.close(() => { closePool().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}
