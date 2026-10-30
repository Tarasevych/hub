// ROOK-STAND (22.10.2026, zone A): een wegwerp-exemplaar van de site voor de rendercontrole van een release, LOS van de productie.
//
// Waarom: release 20261021-221718 deed `Buffer.from(…)` op moduleniveau in de technische bundel; elke admin.*-pagina bleef wit, maar
// /__gezondheid en «HTTP 200» waren groen, de installer, de nazorg en «Діагностика» zagen niets. Een echte browser die de pagina's
// van de NIEUWE release opent — aangemeld als eigenaar, met een actief technisch profiel — ziet het wel (scripts/rook-controle.mjs).
// Op de server van de eigenaar is er geen testaanmelding en mag er niets in de productiedatabase komen. Daarom:
//
//   1. ROOK_DB: de installer maakt een lege database `mijnruimte_rook_<stempel>` (als postgres) en geeft de naam hier door. ELKE
//      DATABASE_URL* in de omgeving wordt naar die database omgebogen; een naam die niet met `mijnruimte_rook_` begint wordt
//      geweigerd — dit proces kan dus nooit op de productiedatabase werken.
//   2. `--migreren`: de migraties van deze release in die lege database (server/migrate.ts, migratierol).
//   3. De site zelf (server/start.ts → createServer) achter een zelfondertekend TLS-certificaat op een vrije loopback-poort
//      (de app-CSP heeft upgrade-insecure-requests; Secure-cookies; dus HTTPS), met DIST_DIR = de dist/ van de nieuwe release.
//   4. Een testeigenaar `rook-<stempel>@rook.invalid` via een nagebootste Google-aanmelding (fetch naar Google wordt in dit proces
//      onderschept; er gaat niets naar buiten), een step-up en een technisch profiel voor één tabcontext. De cookies en de
//      tabcontext worden als JSON op stdout gezet (regel `ROOK_SESSIE {…}`), zodat rook-controle.mjs ze aan Chromium kan geven.
//   5. Na afloop (stdin sluit of SIGTERM) stopt de server; de installer verwijdert de database.
//
// Gebruik (door scripts/rook-controle.mjs, nooit met de hand nodig):
//   ROOK_DB=mijnruimte_rook_x DIST_DIR=/pad/dist node dist-server/rook.mjs [--migreren] [--poort 0] [--tls <map met srv.key/srv.crt>]
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, createSign, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOK_DB_RE = /^mijnruimte_rook_[a-z0-9_]{1,40}$/;
const DB_SLEUTELS = ['DATABASE_URL', 'DATABASE_URL_SYSTEM', 'DATABASE_URL_APP', 'DATABASE_URL_MIGRATIE'] as const;

const zeg = (s: string) => process.stderr.write(`[rook-stand] ${s}\n`);
const arg = (naam: string, standaard = ''): string => { const i = process.argv.indexOf(naam); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : standaard; };
const vlag = (naam: string) => process.argv.includes(naam);

/** Alle databaseverbindingen naar de wegwerpdatabase; weigert elke andere naam. Geëxporteerd voor de eenheidstest. */
export function databaseOmbuigen(env: Record<string, string | undefined>, rookDb: string): string[] {
  if (!ROOK_DB_RE.test(rookDb)) throw new Error(`ROOK_DB_ONGELDIG: «${rookDb}» (verwacht mijnruimte_rook_<stempel>)`);
  const omgebogen: string[] = [];
  for (const k of DB_SLEUTELS) {
    const v = env[k];
    if (!v) continue;
    const u = new URL(v);
    u.pathname = `/${rookDb}`;
    env[k] = u.toString();
    omgebogen.push(k);
  }
  if (!omgebogen.length) throw new Error('GEEN_DATABASE_URL');
  // Laatste slot: na het ombuigen wijst niets meer naar een andere database.
  for (const k of DB_SLEUTELS) { const v = env[k]; if (v && new URL(v).pathname !== `/${rookDb}`) throw new Error(`ROOK_DB_NIET_OMGEBOGEN:${k}`); }
  return omgebogen;
}

/** Zelfondertekend certificaat voor *.<domein> (alleen voor deze run; Chromium start met --ignore-certificate-errors). */
function tlsMaken(domein: string): { map: string; key: string; cert: string } {
  const map = mkdtempSync(join(tmpdir(), 'rook-tls-'));
  const key = join(map, 'srv.key'), cert = join(map, 'srv.crt');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2', '-subj', '/CN=rook-stand',
    '-addext', `subjectAltName=DNS:*.${domein},DNS:${domein}`, '-keyout', key, '-out', cert], { stdio: ['ignore', 'ignore', 'pipe'] });
  return { map, key, cert };
}

/** Nagebootste Google (zoals tests/eenheid/hulp/nep-google.ts, maar zonder vaste hostnamen): fetch naar Google wordt hier beantwoord. */
function nepGoogle(clientId: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = `rook-${randomBytes(4).toString('hex')}`;
  const codes = new Map<string, { sub: string; email: string; nonce: string }>();
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(String(init?.body || ''));
      const c = codes.get(p.get('code') || '');
      if (!c || p.get('client_id') !== clientId) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      const nu = Math.floor(Date.now() / 1000);
      const kop = b64({ alg: 'RS256', kid });
      const inhoud = b64({ iss: 'https://accounts.google.com', aud: clientId, sub: c.sub, email: c.email, email_verified: true, name: 'Rook-stand', iat: nu, exp: nu + 600, nonce: c.nonce, auth_time: nu });
      const handtekening = createSign('RSA-SHA256').update(`${kop}.${inhoud}`).sign(privateKey).toString('base64url');
      return new Response(JSON.stringify({ id_token: `${kop}.${inhoud}.${handtekening}`, access_token: 'rook' }), { status: 200 });
    }
    if (url === 'https://www.googleapis.com/oauth2/v1/certs') return new Response(JSON.stringify({ [kid]: publicKey.export({ type: 'spki', format: 'pem' }) }), { status: 200, headers: { 'cache-control': 'max-age=60' } });
    // Alles anders: de stand mag niets naar buiten doen. Een leeg 599-antwoord, nooit de echte fetch.
    return new Response('{}', { status: 599 });
  }) as typeof fetch;
  return { codes, herstel: () => { globalThis.fetch = echteFetch; } };
}

async function hoofd(): Promise<number> {
  const rookDb = String(process.env.ROOK_DB || '');
  const omgebogen = databaseOmbuigen(process.env as Record<string, string | undefined>, rookDb);
  zeg(`database: ${rookDb} (${omgebogen.join(', ')})`);
  const stempel = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
  const eigenaar = `rook-${stempel}@rook.invalid`;
  // Eigen omgeving voor de stand: eigenaar, nagebootste Google, geen proxy's, geen SIEM, geen dashboard-map.
  process.env.OWNER_EMAIL = eigenaar;
  process.env.GOOGLE_OAUTH_CLIENT_ID = `rook-${stempel}.apps.googleusercontent.com`;
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = `rook-geheim-${stempel}`;
  delete process.env.GOOGLE_SUITE_CLIENT_ID; delete process.env.GOOGLE_SUITE_CLIENT_SECRET;
  for (const k of Object.keys(process.env)) if (/^(https?|no|all)_proxy$/i.test(k) || /^SIEM_/.test(k)) delete process.env[k];
  process.env.E2E_LOKALE_LIMIETEN = '1';   // alle verzoeken komen van 127.0.0.1
  if (!process.env.DIST_DIR) { zeg('DIST_DIR ontbreekt'); return 2; }
  if (!existsSync(join(process.env.DIST_DIR, 'index.html'))) { zeg(`DIST_DIR zonder index.html: ${process.env.DIST_DIR}`); return 2; }

  if (vlag('--migreren')) {
    const { migrate } = await import('./migrate');
    const t0 = Date.now();
    const gedaan = await migrate();
    zeg(`migraties: ${gedaan.length} uitgevoerd in ${Date.now() - t0} ms`);
  }

  const { SERVICE_HOSTS, PUBLIC_DOMAIN } = await import('../backend/deployment-identity');
  const G = nepGoogle(process.env.GOOGLE_OAUTH_CLIENT_ID);
  // Serverlog (één regel per verzoek) niet in het installatielogboek: alleen fouten blijven zichtbaar.
  const echteLog = console.log;
  if (!vlag('--praat')) console.log = () => undefined;
  const { createServer } = await import('./start');
  const { handler } = await import('../backend/index');
  const intern = createServer();
  const tlsMap = arg('--tls');
  const tls = tlsMap ? { map: '', key: join(tlsMap, 'srv.key'), cert: join(tlsMap, 'srv.crt') } : tlsMaken(PUBLIC_DOMAIN);
  const server = https.createServer({ key: readFileSync(tls.key), cert: readFileSync(tls.cert) }, (req, res) => { intern.emit('request', req, res); });
  const poort = await new Promise<number>((res, rej) => { server.on('error', rej); server.listen(Number(arg('--poort', '0')) || 0, '127.0.0.1', () => res((server.address() as { port: number }).port)); });
  zeg(`site luistert op https://127.0.0.1:${poort} (dist ${process.env.DIST_DIR})`);

  // ---- aanmelden als eigenaar (redirect-flow zoals productie), step-up, technisch profiel — alles via de handler, in dit proces.
  const jar = new Map<string, string>();
  const tab = randomBytes(24).toString('hex');
  const verzoek = async (host: string, pad: string, body: Record<string, unknown>) => {
    const headers: Record<string, string> = { host, origin: `https://${host}`, 'content-type': 'application/json', 'user-agent': 'rook-stand', 'x-forwarded-for': '127.0.0.1' };
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const r = await handler({ headers, body: JSON.stringify(body), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '127.0.0.1', userAgent: 'rook-stand' } } } as never) as { statusCode: number; headers: Record<string, string>; body: string };
    const raw = Object.entries(r.headers || {}).filter(([k]) => k.toLowerCase() === 'set-cookie').map(([, v]) => v).join(', ');
    for (const c of raw ? raw.split(/,\s*(?=[^;,\s]+=)/) : []) {
      const [paar] = c.split(';'); const i = paar.indexOf('='); const naam = paar.slice(0, i).trim(), waarde = paar.slice(i + 1).trim();
      if (/Max-Age=0\b/i.test(c) || !waarde) jar.delete(naam); else jar.set(naam, waarde);
    }
    let data: Record<string, unknown> = {}; try { data = JSON.parse(r.body); } catch { /* geen JSON */ }
    return { status: r.statusCode, data };
  };
  const aanmelden = async (intent: 'login' | 'step-up', service: string) => {
    const host = service === 'identity' ? SERVICE_HOSTS.identity : (SERVICE_HOSTS as Record<string, string>)[service];
    const start = await verzoek(host, '/api/owner/identity/transactions/create', { service, tabContext: tab, flowMode: 'redirect', returnTo: `https://${host}/`, locale: 'uk', intent, remember: false });
    const u = new URL(String(start.data.authUrl || 'https://x.invalid/'));
    const code = `code-${randomBytes(6).toString('hex')}`;
    G.codes.set(code, { sub: `sub-rook-${stempel}`, email: eigenaar, nonce: u.searchParams.get('nonce') || '' });
    return verzoek(SERVICE_HOSTS.identity, '/api/owner/auth/google/callback', { state: u.searchParams.get('state'), code });
  };
  const r1 = await aanmelden('login', 'identity');
  if (r1.data.sessionCreated !== true) { zeg(`aanmelden als testeigenaar mislukt: ${JSON.stringify(r1.data).slice(0, 200)}`); server.close(); return 2; }
  const r2 = await aanmelden('step-up', 'mcp');
  if (r2.data.sessionCreated !== true && r2.data.ok !== true) zeg(`step-up gaf ${JSON.stringify(r2.data).slice(0, 160)} (ga door)`);
  const r3 = await verzoek(SERVICE_HOSTS.mcp, '/api/owner/tech/activeren', { service: 'mcp', tabContext: tab, sourceOrigin: `https://${SERVICE_HOSTS.mcp}`, minuten: 60, reden: 'Rook-controle van een release (installer)' });
  if (r3.status !== 200) { zeg(`technisch profiel activeren mislukt: HTTP ${r3.status} ${JSON.stringify(r3.data).slice(0, 200)}`); server.close(); return 2; }
  zeg(`testeigenaar aangemeld, technisch profiel actief (${jar.size} cookies)`);
  // Diepe controle (29.10.2026): proefsessie technische ruimte v2 + proefcookie voor /assets/tech/* in deze stand.
  const { diepeControle } = await import('../backend/diepe-gezondheid');
  const diep = await diepeControle(process.env.DIST_DIR || '').catch((e) => ({ ok: false, stappen: [{ id: 'fout', ok: false, detail: String((e as Error).message) }] }));
  zeg(`diepe gezondheidscontrole: ${diep.ok ? 'in orde' : 'MISLUKT ' + JSON.stringify(diep.stappen.filter((x) => !x.ok))}`);
  // Eén regel op stdout: precies wat rook-controle.mjs nodig heeft. Niets hiervan verlaat deze machine; de database verdwijnt na afloop.
  echteLog(`ROOK_SESSIE ${JSON.stringify({ poort, domein: PUBLIC_DOMAIN, hosts: SERVICE_HOSTS, tab, diep: { ok: diep.ok, stappen: diep.stappen }, cookies: [...jar].map(([name, value]) => ({ name, value })) })}`);

  // Blijven draaien tot de aanroeper stdin sluit (of een signaal stuurt).
  await new Promise<void>((res) => {
    process.stdin.resume(); process.stdin.on('end', () => res()); process.stdin.on('close', () => res());
    process.on('SIGTERM', () => res()); process.on('SIGINT', () => res());
  });
  zeg('stoppen');
  G.herstel();
  await new Promise<void>((res) => { server.closeAllConnections?.(); server.close(() => res()); });
  if (tls.map) rmSync(tls.map, { recursive: true, force: true });
  const { closePool } = await import('./platform/pg');
  await closePool().catch(() => undefined);
  return 0;
}

// Alleen als programma (niet bij import in de eenheidstest).
if (process.argv[1] && /rook\.(mjs|ts)$/.test(process.argv[1])) {
  hoofd().then((code) => process.exit(code)).catch((e) => { zeg(`fout: ${(e as Error).message}`); process.exit(2); });
}
