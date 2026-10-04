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
// - Fase B: CSRF-controle (Origin-allow-list) en rate limiting voor /api/* (zie SECURITY-NOTES.md).
import http from 'node:http';
import { createReadStream, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DASHBOARD_HOST, SERVICE_HOSTS } from '../backend/deployment-identity';
import { handler } from '../backend/index';
import { verouderdeEigenarenIntrekken } from '../backend/eigenaar-opschonen';
import { closePool, getPool } from './platform/pg';
import { ownerEmail, rateLimit } from './platform/beveiliging';
import { auditIpPepperGeldig } from './platform/audit';
import { isCanoniekPad, type LambdaEvent, type RouterResponse } from './platform/router';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8080);
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(here, '..', 'dist'));
const DASHBOARD_DIR = path.resolve(process.env.DASHBOARD_DIR || '/srv/mijn-ruimte/dashboard');
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 12 * 1024 * 1024);

const APP_HOSTS = new Set<string>(Object.values(SERVICE_HOSTS));
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

// CSP voor de app: gelijk aan het productiebeleid in public/canonical-security.js (meta), zonder
// AppDeploy-hosts, plus frame-ancestors (werkt alleen als header). Header en meta worden door de
// browser gecombineerd (doorsnede), dus ze moeten gelijk blijven. 'wasm-unsafe-eval' staat toe
// (besluit eigenaar) zodat sql.js / h5wasm / pdf.js-voorbeelden werken; 'unsafe-eval' blijft verboden.
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

// Nooit publiceren, ook niet als ze per ongeluk in de build belanden: audit-uitvoer, sourcemaps, dotfiles.
const VERBORGEN_PAD = /(^|\/)(l002-diagnostic\.json|[^/]*\.map|\.[^/]*)$/i;

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL, root: string, spa: boolean, csp: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed');
  if (VERBORGEN_PAD.test(url.pathname)) return sendText(res, 404, 'Niet gevonden');
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
// CSRF: Origin-allow-list voor state-wijzigende API-verzoeken
// ---------------------------------------------------------------------------------------------
// Toegestaan zijn alleen de eigen app-origins (https://<dienst>.tarasevych.com). Browsers sturen bij elke
// POST een Origin-header; ontbreekt die, dan is het geen browserverzoek met cookies (webhooks van
// Google Pub/Sub of Microsoft Graph sturen geen cookies) en mag het alleen zonder Cookie-header door.
const ALLOWED_ORIGINS = new Set<string>([...APP_HOSTS].map((h) => `https://${h}`));
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export function csrfAfwijzing(method: string, headers: http.IncomingHttpHeaders): string {
  if (SAFE_METHODS.has(method)) return '';
  const origin = String(headers.origin || '').trim().toLowerCase();
  if (origin) return ALLOWED_ORIGINS.has(origin) ? '' : 'CSRF_ORIGIN_DENIED';
  return headers.cookie ? 'CSRF_ORIGIN_REQUIRED' : '';
}

// ---------------------------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------------------------
// 1) Algemeen, in het geheugen (één proces): API_RATE_LIMIT_PER_MIN verzoeken per IP per minuut.
// 2) Strikt, in Postgres (overleeft herstart): gevoelige paden per IP per minuut.
const API_LIMIT_PER_MIN = Math.max(10, Number(process.env.API_RATE_LIMIT_PER_MIN || 600));
const geheugen = new Map<string, { start: number; hits: number }>();
function geheugenLimiet(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const slot = geheugen.get(key);
  if (!slot || now - slot.start >= windowMs) { geheugen.set(key, { start: now, hits: 1 }); return { ok: true, retryAfter: 0 }; }
  slot.hits += 1;
  return { ok: slot.hits <= limit, retryAfter: Math.max(1, Math.ceil((slot.start + windowMs - now) / 1000)) };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of geheugen) if (now - v.start > 120_000) geheugen.delete(k); }, 60_000).unref();

// [patroon, bucketnaam, max per minuut per IP, faalt dicht bij DB-fout]
// Alle strikte buckets zijn aanmeld-/MFA-paden: bij een databasestoring liever even "probeer later"
// dan onbeperkt wachtwoorden of codes laten raden (zie rateLimit in platform/beveiliging.ts).
const STRIKTE_LIMIETEN: Array<[RegExp, string, number, boolean]> = [
  [/^\/api\/(owner\/)?(access|auth)\/password\/login$/, 'wachtwoord', 10, true],
  // Audit-fix 7: stap-op (TOTP-step-up) zit in dezelfde strikte MFA-bucket als totp/recovery.
  [/^\/api\/owner\/access\/((totp|recovery)\/|stap-op$)/, 'mfa', 10, true],
  [/^\/api\/auth\/google\/start$/, 'google-start', 10, true],
  [/^\/api\/owner\/identity\/transactions\/(create|attach)$/, 'login-start', 20, true],
  [/^\/api\/(auth|owner\/auth|ecosystem\/auth|owner\/identity|service-handoff|ecosystem\/handoff|owner\/session\/handoff|share\/join)(\/|$)/, 'aanmelden', 120, true],
];

async function rateLimitAfwijzing(method: string, pathname: string, ip: string): Promise<number> {
  const algemeen = geheugenLimiet(`api:${ip}`, API_LIMIT_PER_MIN, 60_000);
  if (!algemeen.ok) return algemeen.retryAfter;
  if (SAFE_METHODS.has(method) && !pathname.includes('/callback')) return 0;
  for (const [patroon, naam, max, failClosed] of STRIKTE_LIMIETEN) {
    if (!patroon.test(pathname)) continue;
    const r = await rateLimit(`${naam}:${ip}`, max, 60, { failClosed });
    return r.ok ? 0 : r.retryAfter;
  }
  return 0;
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
    // Audit-fix 3: niet-canonieke API-paden (//, afsluitende /, punt-segmenten) → 404 vóór CSRF/rate limit/routering.
    if (!isCanoniekPad(url.pathname)) return sendJson(res, 404, { error: 'Not found', reasonCode: 'PATH_NOT_CANONICAL' });
    const ip = clientIp(req);
    const method = String(req.method || 'GET').toUpperCase();
    const csrf = csrfAfwijzing(method, req.headers);
    if (csrf) return sendJson(res, 403, { error: csrf, reasonCode: csrf });
    const wacht = await rateLimitAfwijzing(method, url.pathname, ip);
    if (wacht > 0) return send(res, 429, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(wacht) }, JSON.stringify({ error: 'RATE_LIMITED', reasonCode: 'RATE_LIMITED', retryAfter: wacht }));
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

// Vergelijk echte paden: systemd start via de symlink /srv/mijn-ruimte/current/…, terwijl Node
// import.meta.url naar het echte releasepad oplost. Zonder realpath start de server dan stil niet.
const isMain = (() => {
  try { return !!process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]); } catch { return false; }
})();
if (isMain) {
  // Audit-fix 4: de app heeft alleen DATABASE_URL_SYSTEM (+ _APP) nodig; DATABASE_URL (legacy-eigenaar) en
  // DATABASE_URL_MIGRATIE staan na de env-splitsing in /etc/mijn-ruimte/migratie.env, niet in de app-omgeving.
  if (!process.env.DATABASE_URL_SYSTEM && !process.env.DATABASE_URL) { console.error('DATABASE_URL_SYSTEM ontbreekt'); process.exit(1); }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL_SYSTEM) console.warn('[server] DATABASE_URL (legacy-eigenaarsrol) staat in de app-omgeving; verplaats hem naar /etc/mijn-ruimte/migratie.env (deploy/RUNBOOK-AUDIT-FIXES.md)');
  if (process.env.DATABASE_URL_MIGRATIE) console.warn('[server] DATABASE_URL_MIGRATIE staat in de app-omgeving; verplaats hem naar /etc/mijn-ruimte/migratie.env (deploy/RUNBOOK-AUDIT-FIXES.md)');
  // Zonder eigenaar heeft niemand beheerrechten; starten heeft dan geen zin en verbergt een configuratiefout.
  if (!ownerEmail()) { console.error('OWNER_EMAIL ontbreekt (zie ENV-VARS.md)'); process.exit(1); }
  // Audit-fix 10: zonder eigen IP-pepper niet starten (vroeger stil terugvallen op RECOVERY_CODE_PEPPER).
  if (!auditIpPepperGeldig()) { console.error('AUDIT_IP_PEPPER ontbreekt of is korter dan 32 tekens: voer deploy/geheimen-aanvullen.sh uit (zie ENV-VARS.md)'); process.exit(1); }
  const server = createServer();
  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  server.keepAliveTimeout = 65_000;
  server.listen(PORT, HOST, () => console.log(`[server] luistert op http://${HOST}:${PORT} (dist: ${DIST_DIR})`));
  // Fase 3: verouderde eigenaarsrollen (adres ≠ OWNER_EMAIL) intrekken; faalt nooit de start.
  verouderdeEigenarenIntrekken().catch((err) => console.error('[eigenaar] opschonen mislukt:', (err as Error).message));
  const stop = (signal: string) => {
    console.log(`[server] ${signal} ontvangen, stoppen...`);
    server.close(() => { closePool().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}
