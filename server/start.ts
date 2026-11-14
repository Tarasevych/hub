// HTTP-server voor de zelf-gehoste app (vervangt het AppDeploy-platform).
//
// - Luistert alleen op HOST (standaard 127.0.0.1) : PORT (standaard 8080); publiek verkeer komt
//   uitsluitend via de Cloudflare Tunnel (cloudflared, uitgaand).
// - Accepteert alleen bekende hostnamen (Host-header); x-forwarded-host wordt genegeerd.
// - Client-IP komt alleen uit cf-connecting-ip (door Cloudflare gezet); x-forwarded-for e.d. van
//   de client worden overschreven, zodat app-code ze niet kan vertrouwen.
// - /api/* op de app-hosts → bestaande router (Lambda-achtig event); overige paden → dist/ (SPA).
// - dashboard.<domein> → standaard 302 naar het Deploy-dashboard in MCP (met aanmelding): releasegeschiedenis, serverstatus,
//   terugdraaien met passkey. De oude, open statische Ops-pagina blijft op schijf en komt terug met DASHBOARD_MODE=static.
// - Beveiligingsheaders (CSP als HTTP-header, HSTS, nosniff, ...) op alle antwoorden.
// - Fase B: CSRF-controle (Origin-allow-list) en rate limiting voor /api/* (zie SECURITY-NOTES.md).
import http from 'node:http';
import { createReadStream, realpathSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { COMPRIMEERBAAR, MIN_BYTES, gecomprimeerd, kiesCodering } from './platform/statisch-comprimeren';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DASHBOARD_HOST, SERVICE_HOSTS } from '../backend/deployment-identiteit';
import { handler } from '../backend/index';
import { attachAgentGateway, closeAllAgents } from '../backend/connectors-gateway';
import { verouderdeEigenarenIntrekken } from '../backend/eigenaar-opschonen';
import { purgeExpiredDiagnostics } from '../backend/browser-diag-archief';
import { neemRootGebeurtenissenOp } from '../backend/server-beheer';
import { statusRonde as telegramStatusRonde } from '../backend/telegram-aanmelden/status';
import { siemConfig, siemRonde } from '../backend/siem';
import { TECH_ASSET_KOPPEN, assetToegestaan } from '../backend/tech-bundels';
import { diepAntwoord } from '../backend/diepe-gezondheid';
import { techMeldingVerwerken, telStatus } from '../backend/toegangsfout-tellers';
import { sluitAlleStromen, stroomVerzoek, stroomVerzoekMcp } from '../backend/connector-v2-stroom';
import { sluitAlleStromenApparaat, stroomVerzoekApparaat } from '../backend/apparaat-bevestiging/stroom'; /* APPARAAT-001: snelle stroom naar de tabbladen */
import { opruimen as apparaatOpruimen } from '../backend/apparaat-bevestiging/kern';
import { metVerzoek } from './platform/context';
import { isMcpRpcPad, mcpOriginBesluit, ORIGIN_403 } from '../backend/mcp-origin';
import { eenKeerPer, journaalSchrijf } from '../backend/beheer-journaal';
import { googleSuiteSyncCron, mailMaintenanceCron } from '../backend/index';
import { ACHTERGROND_INTERVAL_MS, sleutelkluisAchtergrondRonde } from '../backend/sleutelkluis-achtergrond';
import { omslagenOpruimen } from '../backend/sleutelkluis-opruimen';
import { stapOpUitBewaken } from '../backend/stap-op-noodschakelaar';
import { zoekIndexCron } from '../backend/zoek/bronnen';
import { TECH_ASSET_PREFIX } from '../shared/tech-bundels';
import { closePool, getPool } from './platform/pg';
import { ownerEmail, rateLimit } from './platform/beveiliging';
import { auditIpPepperGeldig, ipHash } from './platform/audit';
import { isCanoniekPad, type LambdaEvent, type RouterResponse } from './platform/router';
import { schakelaarsVerversen } from './platform/schakelaars';
import { procesVangnetInstellen } from './platform/proces-vangnet';
import { statischDoel } from './platform/statisch-pad'; /* SEC-002 http-rand-04 */
import { limietSleutel } from '../shared/ip-limiet';
import { leesBodyBegrensd, zetAanmeldControle } from './platform/body-budget';
import { aanmeldingEcht } from './platform/body-aanmelding';
// SEC-002 (toets g10e-toets-2): ruimere grenzen voor lichamen alleen bij een ECHTE sessie of een echt token (niet «Cookie: x=1»).
zetAanmeldControle(aanmeldingEcht);

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8080);
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(here, '..', 'dist'));
// Ook voor de diagnose (backend/diagnose.ts: «versie van de pagina» vergelijkt de hoofdbundel met dist/index.html).
process.env.DIST_DIR = DIST_DIR;
const DASHBOARD_DIR = path.resolve(process.env.DASHBOARD_DIR || '/srv/mijn-ruimte/dashboard');
/** 'beheer' (standaard): doorsturen naar admin-host /diagnostics; 'static': de oude losse pagina's tonen. */
const DASHBOARD_MODE = process.env.DASHBOARD_MODE === 'static' ? 'static' : 'beheer';
const DASHBOARD_NAAR = `https://${SERVICE_HOSTS.mcp}/dashboard`;

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

// PERF-001: welk achtergrondwerk loopt (voor de bewaking van de hoofdthread hieronder).
const achtergrondLopend = new Set<string>(), achtergrondGezien = new Set<string>();
function achtergrond<T>(naam: string, doe: () => Promise<T>): Promise<T> {
  achtergrondLopend.add(naam); achtergrondGezien.add(naam);
  let p: Promise<T>;
  try { p = doe(); } catch (e) { achtergrondLopend.delete(naam); return Promise.reject(e); }
  return p.finally(() => achtergrondLopend.delete(naam));
}

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

const LOOPBACK_SOCKET = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', '']);
/** Client-IP: alleen cf-connecting-ip wanneer het verzoek via de lokale tunnel (loopback) binnenkomt; anders het socket-adres. */
export function clientIp(req: http.IncomingMessage): string {
  const rawRemote = String(req.socket?.remoteAddress || '');
  const cf = String(req.headers['cf-connecting-ip'] || '').trim();
  if (cf && LOOPBACK_SOCKET.has(rawRemote) && /^[0-9a-fA-F:.]{2,45}$/.test(cf)) return cf;
  return (rawRemote || 'unknown').replace(/^::ffff:/, '');
}

/** Uitgaand verkeer van Anthropic (Claude-connectors): 160.79.104.0/21 (IPv4). */
const CONNECTOR_LOG_PATH = /^\/(mcp|ai\/|claude|gpt|grok|gemini|copilot|cursor|antigravity|oauth2\/|\.well-known\/oauth-)/;
function isAnthropicIp(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return a === 160 && b === 79 && c >= 104 && c <= 111;
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

// SEC-002 (http-rand-06, keten-config-05): Content-Length vooraf, 256 KB zonder Cookie/Authorization, budget voor alle lichamen
// samen, lichamen per IP en een korte termijn voor anonieme lichamen — server/platform/body-budget.ts. MAX_BODY_BYTES blijft de bovengrens.
async function readBody(req: http.IncomingMessage, pad = '', ip = clientIp(req)): Promise<string> {
  return leesBodyBegrensd(req, pad, ip);
}
/** Antwoord op een geweigerd lichaam: de verbinding sluiten (het ongelezen deel blijft niet in de socket hangen). */
function bodyWeigeren(req: http.IncomingMessage, res: http.ServerResponse, err: unknown) {
  const f = err as { status?: number; code?: string; retryAfter?: number };
  const status = f.status || 400;
  req.resume();
  return send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close', ...(f.retryAfter ? { 'Retry-After': String(f.retryAfter) } : {}) },
    JSON.stringify({ error: status === 413 ? 'BODY_TOO_LARGE' : (f.code || 'BODY_TOO_LARGE'), reasonCode: f.code || 'BODY_TOO_LARGE' }));
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

async function writeRouterResponse(res: http.ServerResponse, response: RouterResponse) {
  if (response.filePath) {
    const file = response.filePath;
    // Alleen het age-archief (vaste naam in de root-uitgiftemap) en de (versleutelde) nachtelijke back-ups; de routes eisen eigenaar + eenmalige downloadId.
    // Plus de blijvende archieven van releases (audit 18.10.2026, punt 4): alleen mijn-ruimte-<versie>.tar.gz direct in de archiefmap.
    const fileNorm = String(file || "").replace(/\\/g, "/");
    const canon = path.posix.normalize(fileNorm);
    const pakketten = (process.env.UITROL_PAKKETTEN_DIR || "/srv/mijn-ruimte/pakketten").replace(/\\/g, "/").replace(/\/+$/, "");
    const backups = (process.env.BACKUP_DIR || "/srv/backups/mijn-ruimte").replace(/\\/g, "/").replace(/\/+$/, "");
    const archiefUit = (process.env.ARCHIEF_UIT || "/var/lib/mijn-ruimte-archief/uitgifte").replace(/\\/g, "/").replace(/\/+$/, "");
    const isPakket = canon.startsWith(pakketten + "/") && /^mijn-ruimte-\d{8}-\d{6}\.tar\.gz$/.test(canon.slice(pakketten.length + 1));
    const isBackup = canon.startsWith(backups + "/") && /^\d{8}-\d{6}\/(database\.dump\.age|uploads\.tar\.gz\.age|systeem\.tar\.gz\.age|systeem-info\.txt|info\.txt|SHA256SUMS)$/.test(canon.slice(backups.length + 1));
    const isArchief = canon === `${archiefUit}/archief-laatste.tar.age`;
    const allowed = !file.includes("\0") && fileNorm === canon && !fileNorm.includes("..") && (isArchief || isBackup || isPakket);
    const s = allowed ? await fileStat(file) : null;
    if (!s) return sendText(res, 404, "NOT_FOUND");
    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "Content-Type": response.headers["Content-Type"] || "application/octet-stream",
      "Content-Disposition": response.headers["Content-Disposition"] || "attachment",
      "Content-Length": String(s.size),
    };
    if (/^[0-9a-f]{64}$/.test(String(response.headers["X-Pakket-Sha256"] || ""))) headers["X-Pakket-Sha256"] = String(response.headers["X-Pakket-Sha256"]);
    res.writeHead(response.statusCode || 200, { ...BASE_HEADERS, ...headers });
    createReadStream(file).on("error", () => res.destroy()).pipe(res);
    return;
  }
  const headers: Record<string, string | string[]> = { "Cache-Control": "no-store" };
  for (const [key, value] of Object.entries(response.headers || {})) {
    if (key.toLowerCase() === "set-cookie") headers["Set-Cookie"] = splitSetCookie(String(value));
    else headers[key] = String(value);
  }
  send(res, response.statusCode || 200, headers, response.body ?? "");
}

// Pad binnen een root oplossen: statischDoel (server/platform/statisch-pad.ts, SEC-002 http-rand-04) — één decodering voor
// de beslissingen én het bestand (de vroegere safeJoin decodeerde los van de poort).

async function fileStat(p: string) {
  try { const s = await stat(p); return s.isFile() ? s : null; } catch { return null; }
}

async function serveFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, csp: string, immutable: boolean, extra?: Readonly<Record<string, string>>) {
  const s = await fileStat(file);
  if (!s) return false;
  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${s.size.toString(16)}-${Math.floor(s.mtimeMs).toString(16)}"`;
  const headers: Record<string, string> = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ETag: etag,
    ...(extra || {}),
  };
  if (ext === '.html') {
    headers['Content-Security-Policy'] = csp;
    // Menu v2 fase B1: vooruitladen tussen de eigen onderdelen. De regels staan in een apart bestand (geen inline script, de CSP
    // blijft script-src 'self'); ze gelden alleen voor <a data-tsv-vooruit> die de app zelf plaatst. `credentialed-prerender`
    // staat toe dat een ander onderdeel van hetzelfde domein deze pagina voorbereidt (alleen bij «prerender» in de instellingen;
    // de app start pas bij activering, zie src/main.tsx).
    headers['Speculation-Rules'] = '"/speculatie.json"';
    headers['Supports-Loading-Mode'] = 'credentialed-prerender';
    // Thema «Авто — коли надворі темно»: alleen op id.* (Налаштування → Теми) mag de pagina na een klik van de gebruiker de
    // browser om de locatie vragen (de browser vraagt zelf toestemming; opgeslagen wordt alleen lat/lon afgerond op 0,1°).
    // Overal elders blijft geolocation=() — geen enkele andere pagina kan de locatie opvragen.
    if (String(req.headers.host || '').split(':')[0].toLowerCase() === SERVICE_HOSTS.identity) headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()';
  }
  if (path.basename(file) === 'speculatie.json') headers['Content-Type'] = 'application/speculationrules+json';
  if (path.basename(file) === 'service-worker.js') headers['Service-Worker-Allowed'] = '/';
  // PERF-001: tekstbestanden gecomprimeerd (brotli/gzip, één keer per bestand in het geheugen; zie server/platform/statisch-comprimeren.ts).
  if (COMPRIMEERBAAR.has(ext) && s.size >= MIN_BYTES) {
    headers.Vary = headers.Vary ? `${headers.Vary}, Accept-Encoding` : 'Accept-Encoding';
    const codering = kiesCodering(req.headers['accept-encoding']);
    const buf = codering ? await gecomprimeerd(file, ext, s.size, `${s.size}-${Math.floor(s.mtimeMs)}`, codering) : null;
    if (codering && buf) {
      const etagGz = `${etag.slice(0, -1)}-${codering === 'br' ? 'br' : 'gz'}"`;
      headers.ETag = etagGz;
      if (req.headers['if-none-match'] === etagGz) { send(res, 304, headers); return true; }
      headers['Content-Encoding'] = codering;
      headers['Content-Length'] = String(buf.length);
      if (req.method === 'HEAD') { send(res, 200, headers); return true; }
      send(res, 200, headers, buf);
      return true;
    }
  }
  if (req.headers['if-none-match'] === etag) { send(res, 304, headers); return true; }
  headers['Content-Length'] = String(s.size);
  if (req.method === 'HEAD') { send(res, 200, headers); return true; }
  res.writeHead(200, { ...BASE_HEADERS, ...headers });
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
  return true;
}

const JURIDISCHE_PADEN = new Set(['/privacy', '/terms']);

// Nooit publiceren, ook niet als ze per ongeluk in de build belanden: audit-uitvoer, sourcemaps, dotfiles — en sinds SEC-002
// (http-rand-04) ook verborgen MAPPEN, op het gedecodeerde pad: VERBORGEN_STATISCH in server/platform/statisch-pad.ts.

async function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, url: URL, root: string, spa: boolean, csp: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Method not allowed');
  // SEC-002 (http-rand-04): ÉÉN keer decoderen en normaliseren (server/platform/statisch-pad.ts); elke beslissing hieronder én het
  // bestand zelf komen uit dat ene resultaat — vroeger besliste de poort op het ruwe pad («/assets/%74ech/…» was geen techbundel).
  const doel = statischDoel(root, url.pathname, TECH_ASSET_PREFIX);
  if (!doel) return sendText(res, 400, 'Ongeldig pad');
  if (doel.verborgen) return sendText(res, 404, 'Niet gevonden');
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) return sendText(res, 404, 'Niet gevonden');
  const file = doel.file;
  const immutable = spa && doel.pad.startsWith('/assets/') && !doel.tech;
  // Technische bundels (shared/tech-bundels.ts, backend/tech-bundels.ts): alleen met een geldige toegangscookie van een actieve
  // technische activering; anders 404 (niet 403: het bestaan blijft verborgen). Nooit in een gedeelde cache, Vary: Cookie.
  if (doel.tech) {
    if (!(await assetToegestaan(req.headers.cookie))) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8', ...TECH_ASSET_KOPPEN }, 'Niet gevonden');
    if (await serveFile(req, res, file, csp, false, TECH_ASSET_KOPPEN)) return;
    return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8', ...TECH_ASSET_KOPPEN }, 'Niet gevonden');
  }
  if (await serveFile(req, res, file, csp, immutable)) return;
  // SPA-fallback: alleen voor "pagina"-paden zonder extensie (tabpaden zoals /inbox).
  if (spa && !path.posix.extname(doel.pad)) {
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
// De service worker van de extensie (0.4) stuurt bij POST altijd Origin chrome-extension://<id>. Alleen voor deze eindpunten,
// die met een eenmalige koppelcode of het agenttoken werken (geen cookie, dus geen CSRF-risico), en alleen ZONDER Cookie-header.
// SEC-002 extensie-08: ook de HTTP-terugval van «Відкликати/Стоп» (agenttoken, kan alleen vergrendelen) — anders kwam een intrekking
// tijdens een verbroken WebSocket nooit aan (403 CSRF_ORIGIN_DENIED) en bleef de toegang op de server geldig.
const EXTENSIE_PADEN = new Set(['/api/owner/agents/pair', '/api/owner/agents/diagnostics/archive', '/api/owner/agents/extensie/chat', '/api/owner/agents/ontgrendeling/intrekken-extensie']);
export function csrfAfwijzing(method: string, headers: http.IncomingHttpHeaders, pad = ''): string {
  if (SAFE_METHODS.has(method)) return '';
  const origin = String(headers.origin || '').trim().toLowerCase();
  if (origin && /^chrome-extension:\/\/[a-p]{32}$/.test(origin) && EXTENSIE_PADEN.has(pad) && !headers.cookie) return '';
  if (origin) return ALLOWED_ORIGINS.has(origin) ? '' : 'CSRF_ORIGIN_DENIED';
  return headers.cookie ? 'CSRF_ORIGIN_REQUIRED' : '';
}

/**
 * MCP-001 R1: Origin-controle op MCP-eindpunten (backend/mcp-origin.ts). true = weigeren (403). Een geweigerde of — bij
 * MCP_ORIGIN_MODUS=melden — alleen gemelde origin komt in het beheerlogboek (centrum voor meldingen), gedempt per IP (/64).
 */
function mcpOriginGeweigerd(req: http.IncomingMessage): boolean {
  const b = mcpOriginBesluit(req.headers.origin, ALLOWED_ORIGINS);
  if (b.soort !== 'geweigerd') return false;
  // SEC-002 (slot m, NET-4/MRG-05/MRG-07): gedempt per IP (/64), niet per vrij gekozen Origin (anders één logregel en één sleutel per
  // verzonnen Origin), en het IP alleen als HMAC (ipHash, zoals server/platform/audit.ts) — nooit leesbaar in details.
  const ip = clientIp(req);
  if (eenKeerPer(`mcp.origin:${limietSleutel(ip)}`, 10 * 60 * 1000)) {
    void journaalSchrijf({ actie: 'owner.mcp.origin.denied', actor: null, eigenaar: null, resultaat: b.blokkeren ? 'denied' : 'warning', service: 'mcp',
      reden: b.blokkeren ? 'Origin niet toegestaan (403)' : 'Origin niet toegestaan (alleen gemeld: MCP_ORIGIN_MODUS=melden)',
      details: { origin: String(b.origin).slice(0, 120), pad: String(req.url || '').split('?')[0].slice(0, 120), ipHash: ipHash(ip) } });
  }
  return b.blokkeren;
}

// ---------------------------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------------------------
// 1) Algemeen, in het geheugen (één proces): API_RATE_LIMIT_PER_MIN verzoeken per IP per minuut.
// 2) Strikt, in Postgres (overleeft herstart): gevoelige paden per IP per minuut.
const API_LIMIT_PER_MIN = Math.max(10, Number(process.env.API_RATE_LIMIT_PER_MIN || 600));
const geheugen = new Map<string, { start: number; hits: number }>();
export const GEHEUGEN_MAX = Math.max(1000, Number(process.env.API_LIMIT_GEHEUGEN_MAX || 100_000));
export const _geheugenGrootte = () => geheugen.size;
export const _geheugenLimiet = (key: string, limit: number, windowMs: number) => geheugenLimiet(key, limit, windowMs);
function geheugenLimiet(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const slot = geheugen.get(key);
  if (!slot || now - slot.start >= windowMs) {
    // SEC-002 (keten-config-05, afwerking A): stelling op de kaart — bij een vloed van verschillende adressen eerst de verlopen sloten
    // weg, daarna de oudste (invoegvolgorde). Zo groeit het geheugen nooit onbegrensd tussen twee opruimrondes.
    if (!slot && geheugen.size >= GEHEUGEN_MAX) {
      for (const [k, v] of geheugen) if (now - v.start > 120_000) geheugen.delete(k);
      for (const k of geheugen.keys()) { if (geheugen.size < GEHEUGEN_MAX) break; geheugen.delete(k); }
    }
    geheugen.set(key, { start: now, hits: 1 }); return { ok: true, retryAfter: 0 };
  }
  slot.hits += 1;
  return { ok: slot.hits <= limit, retryAfter: Math.max(1, Math.ceil((slot.start + windowMs - now) / 1000)) };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of geheugen) if (now - v.start > 120_000) geheugen.delete(k); }, 60_000).unref();
/**
 * SEC-002 (http-rand-07): limiet voor de paden die vóór de /api-tak worden afgehandeld (/__gezondheid, SSE-ingangen). Loopback zonder
 * tunnelkop (systemd, monitoring op de server zelf) telt niet. true = er is al een 429 verstuurd.
 */
function vroegGeweigerd(res: http.ServerResponse, ip: string, emmer = 'api', max = API_LIMIT_PER_MIN): boolean {
  if (LOOPBACK_SOCKET.has(ip)) return false;
  const l = geheugenLimiet(`${emmer}:${limietSleutel(ip)}`, max, 60_000);
  if (l.ok) return false;
  send(res, 429, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(l.retryAfter) }, JSON.stringify({ error: 'RATE_LIMITED', reasonCode: 'RATE_LIMITED', retryAfter: l.retryAfter }));
  return true;
}
/** SEC-002 (http-rand-07): laatste uitkomst van de databasecontrole van /__gezondheid (3 s geldig). */
let gezondheidCache: { tot: number; status: number; inhoud: Record<string, boolean> } | null = null;

// [patroon, bucketnaam, max per minuut per IP, faalt dicht bij DB-fout]
// Alle strikte buckets zijn aanmeld-/MFA-paden: bij een databasestoring liever even "probeer later"
// dan onbeperkt wachtwoorden of codes laten raden (zie rateLimit in platform/beveiliging.ts).
const STRIKTE_LIMIETEN: Array<[RegExp, string, number, boolean]> = [
  [/^\/api\/(owner\/)?(access|auth)\/password\/login$/, 'wachtwoord', 10, true],
  // Audit-fix 7: stap-op (TOTP-step-up) zit in dezelfde strikte MFA-bucket als totp/recovery.
  // Het gemaskeerde overzicht van herstelcodes is geen MFA-poging (alleen lezen); dat telt niet mee.
  [/^\/api\/owner\/access\/((totp|recovery)\/(?!overzicht$)|stap-op$)/, 'mfa', 10, true],
  // SEC-002 (aanmelden-03): codewoord raden (tweede aanmeldstap, step-up, controleren/zetten) viel onder de algemene 600/min:
  // nu een eigen strikte bucket per IP voor alle vier de paden samen, faalt dicht. De teller per account staat in backend/codewoord.ts.
  [/^\/api\/owner\/(session\/codewoord|access\/stap-op\/codewoord|identity\/codewoord\/(controleren|zetten))$/, 'codewoord', 10, true],
  [/^\/api\/auth\/google\/start$/, 'google-start', 10, true],
  // Agent koppelen: onbeveiligde route met een code als geheim. Strikt per IP (cf-connecting-ip), faalt dicht.
  [/^\/api\/owner\/agents\/pair$/, 'agent-koppelen', 10, true],
  // Toegangscode inwisselen (id.tarasevych.com/toegang): publieke route met een code als geheim. Strikt per IP, faalt dicht; daarbovenop
  // een blokkade na 5 mislukte pogingen (backend/toegangscodes-routes.ts).
  [/^\/api\/gast\/inwisselen$/, 'gast-inwisselen', 10, true],
  // MCP-connector: dynamische registratie en tokenuitgifte zijn publiek; begrens per IP (alle Claude-verkeer deelt IP's van Anthropic).
  [/^\/api\/mcp-connector\/register$/, 'mcp-register', 20, true],
  [/^\/api\/mcp-connector\/(token|revoke)$/, 'mcp-token', 120, true],
  [/^\/api\/mcp-connector\/authorize$/, 'mcp-authorize', 60, true],
  [/^\/api\/owner\/agents\/ws-ticket$/, 'ws-ticket', 60, true],
  [/^\/api\/aanmeld\/koppel\/[^/]+\/(start|terug)$/, 'aanmeld-koppel', 30, true],
  // TELEGRAM-AANMELDEN v1: starten, code en inwisselen strikt per IP (de webhook en het pollen vallen onder de algemene limiet).
  [/^\/api\/aanmelden\/telegram\/start$/, 'telegram-start', 20, true],
  [/^\/api\/aanmelden\/telegram\/(code|voltooien|widget-terug)$/, 'telegram-code', 30, true],
  // IDENTITEIT-015 (aanmelden): aanmelden zonder Google — strikt per IP, faalt dicht (daarbovenop lockout per account voor het wachtwoord).
  [/^\/api\/aanmelden\/(passkey\/(opties|voltooien)|extern\/start|wachtwoord\/start)$/, 'aanmelden-zonder-google', 30, true],
  [/^\/api\/aanmelden\/wachtwoord\/voltooien$/, 'wachtwoord', 10, true],
  // SEC-002 (aanmelden-09): de geheime code bij het bevestigen van een actie (met sessie) viel alleen onder de algemene 600/min.
  [/^\/api\/owner\/telegram\/bevestiging\/code$/, 'telegram-bevestig-code', 20, true],
  [/^\/api\/owner\/identity\/transactions\/(create|attach)$/, 'login-start', 20, true],
  [/^\/api\/(auth|owner\/auth|ecosystem\/auth|owner\/identity|service-handoff|ecosystem\/handoff|owner\/session\/handoff|share\/join)(\/|$)/, 'aanmelden', 120, true],
];

// URL's die Claude voor de connector gebruikt (host mcp.*) -> interne API-route. Alles wat hier niet staat, blijft zoals het was
// (de MCP-brug op poort 8091 houdt /Grok, /claude, /oauth/*, /health en de eigen /.well-known/* via de tunnel).
const CONNECTOR_PADEN: Record<string, string> = {
  '/mcp': '/api/mcp-connector/rpc',
  '/.well-known/oauth-protected-resource': '/api/mcp-connector/prm',
  '/.well-known/oauth-protected-resource/mcp': '/api/mcp-connector/prm',
  '/.well-known/oauth-authorization-server/oauth2': '/api/mcp-connector/asm',
  // Alle ontdekkingsvormen van RFC 8414 §3 / OpenID voor issuer https://mcp.…/oauth2, plus de wortel (terugval van sommige klanten):
  // zonder deze paden kreeg een klant de SPA (HTML) of — zolang de oude tunnelregel `.well-known` naar de deur stuurde — de OAuth
  // van de DEUR, en daarmee het oude deurvenster in plaats van connector v2 (20.10.2026).
  '/.well-known/openid-configuration/oauth2': '/api/mcp-connector/asm',
  '/oauth2/.well-known/openid-configuration': '/api/mcp-connector/asm',
  '/oauth2/.well-known/oauth-authorization-server': '/api/mcp-connector/asm',
  '/.well-known/oauth-authorization-server': '/api/mcp-connector/asm',
  '/.well-known/mcp.json': '/api/mcp-connector/server-card',
  '/.well-known/mcp-server-card.json': '/api/mcp-connector/server-card',
  '/server.json': '/api/mcp-connector/registry-server',
  '/oauth2/register': '/api/mcp-connector/register',
  '/oauth2/authorize': '/api/mcp-connector/authorize',
  '/oauth2/token': '/api/mcp-connector/token',
  '/oauth2/revoke': '/api/mcp-connector/revoke',
};
// Connector v2 (backend/connector-v2.ts) — EEN PAD PER AGENT (20.10.2026): /<agent> (/claude, /gpt, /grok, /gemini, /copilot,
// /cursor), de metadata eronder (/<agent>/.well-known/oauth-protected-resource) en de RFC 9728-vorm
// /.well-known/oauth-protected-resource/<agent>.
//
// De korte paden werden tot nu toe door de serverdeur bediend (deploy/mcp/server.mjs, poort 8091). Ze horen nu bij de app: de
// tunnelregel moet mee, zie deploy/CONNECTOR-EEN-PAD.md. Zonder die regel komt /claude nog bij de deur en blijft alleen het oude
// pad werken.
//
// Het OUDE pad /ai/<agent> blijft bereikbaar met 308 Permanent Redirect — niet 301/302: MCP praat over POST, en 301/302 mag een
// client in een GET veranderen (RFC 9110 §15.4), waardoor elke bestaande koppeling zou breken. 308 houdt methode én body.
const V2_KORT = /^\/(claude|gpt|codex|grok|gemini|copilot|cursor|antigravity|autoclaw)(\/\.well-known\/oauth-protected-resource)?\/?$/;
const V2_KORT_PRM = /^\/\.well-known\/oauth-protected-resource\/(claude|gpt|codex|grok|gemini|copilot|cursor|antigravity|autoclaw)\/?$/;
const V2_OUD = /^\/ai\/(claude|gpt|codex|grok|gemini|copilot|cursor|antigravity|autoclaw)(\/\.well-known\/oauth-protected-resource)?\/?$/;
const V2_OUD_PRM = /^\/\.well-known\/oauth-protected-resource\/ai\/(claude|gpt|codex|grok|gemini|copilot|cursor|antigravity|autoclaw)\/?$/;

/** Oud connectoradres → het nieuwe, korte adres (of null). Alleen een pad: query en host blijven van het verzoek. */
export function oudConnectorPad(pathname: string): string | null {
  const oud = V2_OUD.exec(pathname);
  if (oud) return `/${oud[1]}${oud[2] ?? ''}`;
  const oudPrm = V2_OUD_PRM.exec(pathname);
  if (oudPrm) return `/.well-known/oauth-protected-resource/${oudPrm[1]}`;
  // Het agentloze /mcp blijft bestaan zolang er koppelingen van vóór connector v2 (en agenttokens tvh_…) zijn: nooit omleiden.
  return null;
}

function connectorPad(url: URL): URL | null {
  const kort = V2_KORT.exec(url.pathname), kortPrm = V2_KORT_PRM.exec(url.pathname);
  if (kort || kortPrm) {
    const naar = new URL(url.toString());
    naar.pathname = kortPrm ? `/api/connector-v2/${kortPrm[1]}/prm` : `/api/connector-v2/${kort![1]}/${kort![2] ? 'prm' : 'rpc'}`;
    return naar;
  }
  const intern = CONNECTOR_PADEN[url.pathname];
  if (!intern) return null;
  const naar = new URL(url.toString());
  naar.pathname = intern;
  return naar;
}

/**
 * Alleen voor de lokale e2e-tests (tests/e2e/server.ts zet E2E_LOKALE_LIMIETEN=1): alle browsertests komen van 127.0.0.1 en delen dus
 * één IP-bucket. Dan ×20. In productie staat deze variabele nooit (deploy/ zet hem niet) en is de factor 1.
 */
let factorGemeld = false;
function strikteFactor(): number {
  if (process.env.E2E_LOKALE_LIMIETEN !== '1') return 1;
  if (!factorGemeld) { factorGemeld = true; console.warn('[rate-limit] E2E_LOKALE_LIMIETEN=1: strikte limieten ×20 (alleen lokale e2e-tests)'); }
  return 20;
}
const VLAG_LIMIT_PER_MIN = Math.max(30, Number(process.env.VLAG_RATE_LIMIT_PER_MIN || 240));
export type RateLimitAfwijzing = { retryAfter: number; maxAttempts: number; windowSec: number };

export async function rateLimitAfwijzingDetail(method: string, pathname: string, echtIp: string): Promise<RateLimitAfwijzing | null> {
  // SEC-002 (http-rand-05): bij IPv6 telt het /64-net, niet het losse adres (shared/ip-limiet.ts) — anders is elk volgend adres
  // uit het eigen net van de aanvaller een verse emmer. IPv4 blijft per adres.
  const ip = limietSleutel(echtIp);
  if (pathname === '/api/flags' || pathname.startsWith('/api/ofrep/v1/evaluate/flags')) {
    const vlagLimiet = geheugenLimiet(`vlag:${ip}`, VLAG_LIMIT_PER_MIN, 60_000);
    return vlagLimiet.ok ? null : { retryAfter: vlagLimiet.retryAfter, maxAttempts: VLAG_LIMIT_PER_MIN, windowSec: 60 };
  }
  const algemeen = geheugenLimiet(`api:${ip}`, API_LIMIT_PER_MIN, 60_000);
  if (!algemeen.ok) return { retryAfter: algemeen.retryAfter, maxAttempts: API_LIMIT_PER_MIN, windowSec: 60 };
  // (aanmelden/telegram/widget-terug is een GET die een aanmelding afrondt: hij stond al in STRIKTE_LIMIETEN, maar kwam er als GET nooit.)
  if (SAFE_METHODS.has(method) && !pathname.includes('/callback') && !/^\/api\/(mcp-connector\/authorize|auth\/|aanmeld\/koppel\/|owner\/agents\/ws-ticket|aanmelden\/telegram\/widget-terug$)/.test(pathname)) return null;
  for (const [patroon, naam, max, failClosed] of STRIKTE_LIMIETEN) {
    if (!patroon.test(pathname)) continue;
    const limiet = max * strikteFactor();
    const r = await rateLimit(`${naam}:${ip}`, limiet, 60, { failClosed });
    return r.ok ? null : { retryAfter: r.retryAfter, maxAttempts: limiet, windowSec: 60 };
  }
  return null;
}

export async function rateLimitAfwijzing(method: string, pathname: string, ip: string): Promise<number> {
  return (await rateLimitAfwijzingDetail(method, pathname, ip))?.retryAfter ?? 0;
}

// ---------------------------------------------------------------------------------------------
// Request-afhandeling
// ---------------------------------------------------------------------------------------------
async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const host = hostOf(req);
  const url = new URL(req.url || '/', 'http://intern.invalid');

  // Gezondheidscontrole voor systemd/monitoring, los van de Host-allow-list.
  if (url.pathname === '/__gezondheid') {
    // SEC-002 (http-rand-07): van buiten (via de tunnel) een eigen emmer per IP, en de databasecontrole hoogstens eens per 3 s —
    // vroeger kostte elk anoniem verzoek een verbinding uit de systeempool. systemd/monitoring op loopback blijft onbeperkt.
    if (vroegGeweigerd(res, clientIp(req), 'gezondheid', 120)) return;
    if (url.searchParams.get('diep') === '1') { const d = await diepAntwoord(req, DIST_DIR); return sendJson(res, d.status, d.inhoud); }
    if (gezondheidCache && gezondheidCache.tot > Date.now()) return sendJson(res, gezondheidCache.status, gezondheidCache.inhoud);
    let status = 200, inhoud: Record<string, boolean> = { ok: true, db: true };
    try { await getPool().query('SELECT 1'); } catch { status = 503; inhoud = { ok: false, db: false }; }
    gezondheidCache = { tot: Date.now() + 3_000, status, inhoud };
    return sendJson(res, status, inhoud);
  }

  if (host === DASHBOARD_HOST) {
    if (url.pathname.startsWith('/api/')) return sendText(res, 404, 'Niet gevonden');
    // Geen open beheerpagina zonder aanmelding (diagnose Б6/С4): naar Beheer → Діагностика, waar de eigenaar zich aanmeldt.
    if (DASHBOARD_MODE === 'beheer') return send(res, 302, { Location: DASHBOARD_NAAR, 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }, `Verplaatst naar ${DASHBOARD_NAAR}`);
    return serveStatic(req, res, url, DASHBOARD_DIR, false, DASHBOARD_CSP);
  }
  if (!APP_HOSTS.has(host)) {
    return sendText(res, LOCAL_HOSTS.has(host) ? 404 : 421, 'Onbekende host');
  }

  // Publieke juridische pagina's (backend/juridisch.ts): alleen deze exacte paden, zonder aanmelding, met de app-CSP.
  if (JURIDISCHE_PADEN.has(url.pathname)) {
    const method = String(req.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return sendText(res, 405, 'Method not allowed');
    const wacht = await rateLimitAfwijzing(method, url.pathname, clientIp(req));
    if (wacht > 0) return send(res, 429, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': String(wacht) }, 'Too many requests');
    const response = await handler(buildEvent(req, url, '', clientIp(req)) as never) as RouterResponse;
    return writeRouterResponse(res, { ...response, headers: { ...response.headers, 'Content-Security-Policy': APP_CSP }, body: method === 'HEAD' ? '' : response.body });
  }
  // Oud connectoradres (/ai/<agent> en zijn metadata): 308 Permanent Redirect naar het korte adres. 308 houdt de methode en de
  // body, zodat een lopende MCP-koppeling (POST JSON-RPC) niet breekt; een 301/302 zou er een GET van maken.
  if (host === SERVICE_HOSTS.mcp) {
    const naarKort = oudConnectorPad(url.pathname);
    if (naarKort) {
      const naar = `${naarKort}${url.search}`;
      // Het verzoekslichaam eerst leeglezen: anders blijft een POST-body in de socket staan en kan de volgende keep-alive-aanvraag
      // op dezelfde verbinding scheef lopen. We gebruiken de body zelf niet — de client stuurt hem na de 308 opnieuw.
      req.resume();
      return send(res, 308, { Location: naar, 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }, `Verplaatst naar ${naar}`);
    }
  }
  // Connector v2, Streamable HTTP: GET /<agent> met Accept: text/event-stream is de stroom waarover de server
  // notifications/tools/list_changed stuurt zodra de levende staat (technisch profiel, dienst «ai») de lijst verandert. De router
  // kan geen open verbinding vasthouden, dus hier, vóór de routering (backend/connector-v2-stroom.ts).
  if (host === SERVICE_HOSTS.mcp && req.method === 'GET' && /text\/event-stream/i.test(String(req.headers.accept || ''))) {
    // SEC-002 (http-rand-07): ook deze ingangen (elk een tokenopzoeking in de database) tellen in de algemene emmer per IP.
    if ((url.pathname === '/mcp' || url.pathname === '/mcp/' || /^\/(claude|gpt|grok|gemini|copilot|cursor|antigravity|autoclaw)\/?$/.test(url.pathname)) && vroegGeweigerd(res, clientIp(req))) return;
    // MCP-001: Origin-controle (DNS-rebinding) vóór elke stroom.
    if (mcpOriginGeweigerd(req)) return sendJson(res, 403, ORIGIN_403);
    if (url.pathname === '/mcp' || url.pathname === '/mcp/') { await stroomVerzoekMcp(req, res, clientIp(req)); return; }
    const m = /^\/(claude|gpt|grok|gemini|copilot|cursor|antigravity|autoclaw)\/?$/.exec(url.pathname);
    if (m) { await stroomVerzoek(req, res, m[1], clientIp(req)); return; }
  }
  // APPARAAT-001: de snelle stroom van de site zelf (GET /api/owner/stroom, Accept: text/event-stream) — het venster «Це ви?» op het
  // andere apparaat binnen een seconde. Zelfde sessiecontrole als elke route (via backend/apparaat-bevestiging/routes.ts), dezelfde
  // verzoekcontext als de router (metVerzoek), maar buiten de router omdat die geen open verbinding kan vasthouden.
  if (req.method === 'GET' && url.pathname === '/api/owner/stroom' && /text\/event-stream/i.test(String(req.headers.accept || '')) && host !== SERVICE_HOSTS.mcp) {
    const ip = clientIp(req);
    if (vroegGeweigerd(res, ip)) return; // SEC-002 (http-rand-07): sessiecontrole buiten de router telt ook in de emmer per IP
    const ev = buildEvent(req, url, '', ip);
    const body = { service: url.searchParams.get('service') || '', tabContext: url.searchParams.get('tabContext') || '' };
    await metVerzoek('GET /api/owner/stroom', () => stroomVerzoekApparaat(req, res, ev as unknown as Record<string, unknown>, body), { ip, ua: String(req.headers['user-agent'] || '') });
    return;
  }
  // MCP-connector voor Claude: nette URL's op mcp.* worden onder /api/mcp-connector/* gerouteerd (zie connectorPad).
  const connector = host === SERVICE_HOSTS.mcp ? connectorPad(url) : null;
  const apiUrl = connector ?? url;
  if (apiUrl.pathname.startsWith('/api/')) {
    // Audit-fix 3: niet-canonieke API-paden (//, afsluitende /, punt-segmenten) → 404 vóór CSRF/rate limit/routering.
    if (!isCanoniekPad(apiUrl.pathname)) return sendJson(res, 404, { error: 'Not found', reasonCode: 'PATH_NOT_CANONICAL' });
    const ip = clientIp(req);
    const method = String(req.method || 'GET').toUpperCase();
    // De connector-eindpunten gebruiken geen cookies maar OAuth/PKCE of een Bearer-token. Een Origin-controle zou
    // verzoeken van Anthropic (server-naar-server) onterecht weigeren; CSRF is hier niet van toepassing.
    // MCP-001 R1: CSRF geldt hier niet, maar de MCP-specificatie eist wél een Origin-controle (DNS-rebinding): 403 bij een
    // aanwezige, niet-toegestane Origin op het JSON-RPC-eindpunt. Zonder Origin (server-naar-server) verandert niets.
    const csrf = connector ? '' : csrfAfwijzing(method, req.headers, apiUrl.pathname);
    if (csrf) return sendJson(res, 403, { error: csrf, reasonCode: csrf });
    const afwijzing = await rateLimitAfwijzingDetail(method, apiUrl.pathname, ip);
    if (afwijzing) return send(res, 429, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(afwijzing.retryAfter) }, JSON.stringify({ error: 'RATE_LIMITED', reasonCode: 'RATE_LIMITED', retryAfter: afwijzing.retryAfter, maxAttempts: afwijzing.maxAttempts, windowSec: afwijzing.windowSec }));
    // SEC-002 (slot m, NET-4/MRG-05): de Origin-controle NA de limiet per IP — anders telt een geweigerde Origin nergens mee en kan elke
    // verzonnen Origin vrij een logregel schrijven. Het antwoord (403) blijft hetzelfde.
    if (connector && isMcpRpcPad(apiUrl.pathname) && mcpOriginGeweigerd(req)) return sendJson(res, 403, ORIGIN_403);
    if (apiUrl.pathname === '/api/storing/tech-bundel' && method === 'POST') return sendJson(res, 200, techMeldingVerwerken(await readBody(req, apiUrl.pathname, ip).catch(() => ''), host));
    let body = '';
    try { body = req.method === 'GET' || req.method === 'HEAD' ? '' : await readBody(req, apiUrl.pathname, ip); }
    catch (err) { return bodyWeigeren(req, res, err); }
    const t0 = performance.now();
    const response = await handler(buildEvent(req, apiUrl, body, ip) as never) as RouterResponse;
    // PERF-001: hoe lang de server zelf over dit verzoek deed (zichtbaar in DevTools → Network → Timing en voor de paginacontrole
    // van de extensie). Alleen de duur in ms, niets over de inhoud; zo is «traag door de server» te onderscheiden van «traag door
    // de tunnel/het netwerk».
    const duur = Math.max(0, performance.now() - t0).toFixed(1);
    // SEC-002 (http-rand-09): niet bij een weigering (4xx/5xx) en niet op aanmeld-/codepaden (STRIKTE_LIMIETEN): daar was de duur
    // tot op 0,1 ms een orakel («bestaat dit adres met een wachtwoord?» — wel/geen scrypt-ronde), zonder netwerkruis.
    const timingMag = Number(response.statusCode) < 400 && !STRIKTE_LIMIETEN.some(([patroon]) => patroon.test(apiUrl.pathname));
    return writeRouterResponse(res, { ...response, headers: { ...(timingMag ? { 'Server-Timing': `app;dur=${duur}` } : {}), ...(response.headers || {}) } });
  }
  return serveStatic(req, res, url, DIST_DIR, true, APP_CSP);
}

export function createServer() {
  return http.createServer((req, res) => {
    const started = Date.now();
    res.on('finish', () => {
      // Geen querystrings loggen (kunnen codes/tokens bevatten).
      const pathOnly = String(req.url || '').split('?')[0].slice(0, 200);
      // Alleen voor connector-paden: komt het verzoek uit het Anthropic-bereik? (het IP-adres zelf wordt niet gelogd)
      const anthropic = CONNECTOR_LOG_PATH.test(pathOnly) ? ` anthropic=${isAnthropicIp(clientIp(req)) ? 'yes' : 'no'}` : '';
      console.log(`${req.method} ${hostOf(req)} ${pathOnly} ${res.statusCode} ${Date.now() - started}ms${anthropic}`);
      telStatus(pathOnly, res.statusCode);
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
  // SEC-002 (http-rand-01): één onopgevangen fout in één verzoek mag niet het hele proces (en alle open sleutels) meenemen.
  procesVangnetInstellen();
  // SEC-002 (aanv-gat-a-04): staat de noodschakelaar van de step-up aan (STAP_OP_UIT / STAP_OP_UIT_TOT), dan nooit stil:
  // waarschuwing in het logboek, journaalregel en melding aan de eigenaar — elke 24 uur opnieuw (backend/stap-op-noodschakelaar.ts).
  stapOpUitBewaken();
  const server = createServer();
  attachAgentGateway(server, APP_HOSTS); // Local Machine Connector: WSS /agent/ws (agent belt zelf naar buiten)
  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  // > originRequest.keepAliveTimeout van cloudflared (90 s): anders hergebruikt de tunnel soms een net door Node gesloten verbinding → 502.
  server.keepAliveTimeout = 100_000;
  // SEC-001-11: actieve beschermingsschakelaars (auth-poort, opa-afdwingen, rls) vóór het eerste verzoek laden.
  void schakelaarsVerversen()
    .catch((err) => console.error('[schakelaars] laden bij start mislukt:', (err as Error).message))
    .finally(() => {
      server.listen(PORT, HOST, () => console.log(`[server] luistert op http://${HOST}:${PORT} (dist: ${DIST_DIR})`));
    });
  // PERF-001: bewaking van de hoofdthread. Achtergrondwerk (Google-sync, postonderhoud, zoekindex, SIEM) draait elke paar minuten in
  // DIT proces; blokkeert iets de event loop, dan wacht elk verzoek van de site («сайт завмирає»). Elke minuut: is de langste
  // vertraging boven LUS_DREMPEL_MS, dan één logregel met de duur en welk achtergrondwerk op dat moment liep — zo is een periodieke
  // hapering op de server van de eigenaar aan te wijzen in plaats van te raden. Kost vrijwel niets (histogram van Node zelf).
  const lus = monitorEventLoopDelay({ resolution: 20 });
  lus.enable();
  const LUS_DREMPEL_MS = Math.max(50, Number(process.env.LUS_DREMPEL_MS || 250));
  setInterval(() => {
    const max = lus.max / 1e6;
    if (max >= LUS_DREMPEL_MS) console.warn(`[lus] hoofdthread tot ${Math.round(max)} ms geblokkeerd (p99 ${Math.round(lus.percentile(99) / 1e6)} ms; achtergrond in deze minuut: ${[...achtergrondGezien].join(', ') || 'geen'})`);
    lus.reset(); achtergrondGezien.clear(); for (const n of achtergrondLopend) achtergrondGezien.add(n);
  }, 60_000).unref();
  // Fase 3: verouderde eigenaarsrollen (adres ≠ OWNER_EMAIL) intrekken; faalt nooit de start.
  verouderdeEigenarenIntrekken().catch((err) => console.error('[eigenaar] opschonen mislukt:', (err as Error).message));
  // Diagnose-archief: verlopen archieven (90 dagen) bij de start en daarna elke 6 uur verwijderen; faalt nooit de start.
  const diagOpruimen = () => purgeExpiredDiagnostics((sql) => getPool('systeem').query(sql)).catch((err) => console.error('[diagnose] opruimen mislukt:', (err as Error).message));
  diagOpruimen();
  setInterval(diagOpruimen, 6 * 3600_000).unref();
  // Root-gebeurtenissen (GitOps, gepantserde opdracht) uit het root-statusbestand in de audit opnemen; alleen lezen.
  const rootAudit = () => achtergrond('root-audit', () => neemRootGebeurtenissenOp()).catch((err) => console.error('[beheer] audit opnemen mislukt:', (err as Error).message));
  rootAudit();
  setInterval(rootAudit, 5 * 60_000).unref();
  // TELEGRAM-AANMELDEN v1: statusdienst (getMe elke minuut), verlopen wijzigingen, opruimen. Doet niets zolang de vlag uit staat.
  const telegramRonde = () => achtergrond('telegram-aanmelden', () => telegramStatusRonde())
    .catch((err) => console.error('[telegram-aanmelden] ronde mislukt:', (err as Error).message));
  setTimeout(telegramRonde, 30_000).unref();
  setInterval(telegramRonde, 60_000).unref();
  // APPARAAT-001: verlopen verzoeken «Це ви?» sluiten en oude rijen (30 dagen) opruimen. Niets anders.
  const apparaatRonde = () => achtergrond('apparaat-bevestiging', () => apparaatOpruimen())
    .catch((err) => console.error('[apparaat-bevestiging] opruimen mislukt:', (err as Error).message));
  setTimeout(apparaatRonde, 45_000).unref();
  setInterval(apparaatRonde, 10 * 60_000).unref();
  // Sleutelkluis (0092): het achtergrondwerk dat een OPEN gegevenssleutel nodig heeft (Drive/agenda/CalDAV, postonderhoud) loopt hier,
  // in het proces waar de sleutel staat — onder dezelfde advisory lock als de cron, en alleen als er een sleutel open staat.
  const kluisRonde = () => achtergrond('sleutelkluis-ronde', () => sleutelkluisAchtergrondRonde([
    { naam: 'google-suite-bplus-sync', handler: googleSuiteSyncCron as never, payload: { accountLimit: 10 } },
    { naam: 'mail-provider-maintenance', handler: mailMaintenanceCron as never, payload: { batchLimit: 3 } },
    // Z2: de zoekindex leest bijlagen/Drive/GitHub alleen met een open sleutel; hier dus óók, onder dezelfde lock als de cron.
    { naam: 'zoek-index', handler: zoekIndexCron as never, payload: { limiet: 60 } },
  ]).then((u) => { const gedaan = u.filter((x) => x.status === 'ok' || x.status === 'fout'); if (gedaan.length) console.log(`[sleutelkluis] achtergrondronde: ${u.map((x) => `${x.naam}=${x.status}`).join(' ')}`); })
    .catch((err) => console.error('[sleutelkluis] achtergrondronde mislukt:', (err as Error).message)));
  setTimeout(kluisRonde, 90_000).unref();
  setInterval(kluisRonde, ACHTERGROND_INTERVAL_MS).unref();
  // SEC-002 geheimen-05: omslagen van de gegevenssleutel van ingetrokken/verlopen AI-verbindingen en verwijderde passkeys weg —
  // onafhankelijk van welke sleutels open staan (de belofte «intrekken of verlopen = dicht» van backend/sleutelkluis.ts).
  const omslagRonde = () => omslagenOpruimen().then((u) => { if (u.grant || u.passkey) console.log(`[sleutelkluis] omslagen opgeruimd: verbindingen=${u.grant} passkeys=${u.passkey}`); }).catch(() => undefined);
  setTimeout(omslagRonde, 120_000).unref();
  setInterval(omslagRonde, 15 * 60_000).unref();
  // Etap E: journaal naar uw eigen SIEM (bestand en/of Loki op loopback). Uit tenzij /etc/mijn-ruimte/siem.env het aanzet.
  const siem = siemConfig();
  if (siem.lokiGeweigerd) console.error('[siem] SIEM_LOKI_URL geweigerd: alleen http://127.0.0.1, localhost of [::1] (deploy/SIEM.md)');
  if (siem.aan) {
    console.log(`[siem] export aan: ${[siem.bestand && 'bestand', siem.loki && 'loki'].filter(Boolean).join(' + ')}, elke ${siem.intervalS} s`);
    const ronde = () => { void achtergrond('siem', () => siemRonde(siem)); };
    setTimeout(ronde, 5_000).unref();
    setInterval(ronde, siem.intervalS * 1000).unref();
  }
  const stop = (signal: string) => {
    console.log(`[server] ${signal} ontvangen, stoppen...`);
    server.close(() => { closePool().finally(() => process.exit(0)); });
    // Keep-alive-verbindingen (bv. pagina's die elke paar seconden pollen) houden server.close() open: rust eerst, daarna geforceerd, zodat een release-wissel geen "exit-code 1" geeft.
    closeAllAgents();
    sluitAlleStromen();
    sluitAlleStromenApparaat();
    server.closeIdleConnections?.();
    setTimeout(() => server.closeAllConnections?.(), 4_000).unref();
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}
