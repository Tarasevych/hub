// Lokale rooktest voor de zelf-gehoste server (fase A).
// Gebruik: DATABASE_URL=... UPLOADS_DIR=... BASE=http://127.0.0.1:8080 node scripts/rooktest-lokaal.mjs
// Zaait een testgebruiker + sessie rechtstreeks in app.records (Google-login is nog niet geconfigureerd)
// en controleert daarna sessie, cookies, multi-account, DB-roundtrip en upload/download via de echte API.
// ALLEEN voor een lege lokale testdatabase; ruimt zijn eigen rijen op aan het eind.
import pg from 'pg';
import { createHash, randomBytes, randomUUID, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';

const BASE = process.env.BASE || 'http://127.0.0.1:8080';
const UPLOADS = process.env.UPLOADS_DIR || '/srv/data/uploads';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const sha = v => createHash('sha256').update(v).digest('hex');
const COOKIE = '__Secure-tsv_ecosystem_migrated-bg2v4h';
const resultaten = [];
const check = (naam, ok, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };

async function cookieNaam() {
  // Leest de echte cookienaam uit de gebouwde bundel (APP_ID kan wijzigen).
  const { readFileSync, readdirSync } = await import('node:fs');
  for (const f of readdirSync('dist-server/chunks')) {
    const m = readFileSync(join('dist-server/chunks', f), 'utf8').match(/APP_ID\s*=\s*"([^"]+)"/);
    if (m) return `__Secure-tsv_ecosystem_${m[1]}`;
  }
  return COOKIE;
}

async function voeg(tbl, data) {
  const id = randomUUID();
  await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', [tbl, id, data]);
  return id;
}

// node:http i.p.v. fetch: fetch (undici) laat geen eigen Host-header toe.
function verzoek(method, host, path, body, extraHeaders = {}) {
  const url = new URL(BASE + path);
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, method,
      headers: { host, origin: `https://${host}`, 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '1.2.3.4', ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}), ...extraHeaders } }, res => {
      const delen = []; res.on('data', d => delen.push(d)); res.on('end', () => {
        const text = Buffer.concat(delen).toString('utf8'); let data; try { data = JSON.parse(text); } catch { data = text; }
        const sc = res.headers['set-cookie']; resolve({ status: res.statusCode, data, setCookie: Array.isArray(sc) ? sc : sc ? [sc] : [] });
      });
    });
    req.on('error', reject); if (payload) req.write(payload); req.end();
  });
}
const api = (host, path, body, cookie) => verzoek('POST', host, path, body, cookie ? { cookie } : {});

const nu = Date.now();
const tab = () => randomBytes(24).toString('hex');
const zaai = [];

async function zaaiGebruiker(email, rol) {
  const id = await voeg('users', { email, sub: `lokaal-${randomUUID()}`, name: email.split('@')[0], picture: '', role: rol, status: 'approved', accessLevel: 'full', entitlements: [], createdAt: nu, updatedAt: nu });
  zaai.push(id);
  return id;
}
async function zaaiSessie(userId) {
  const token = randomBytes(32).toString('base64url');
  const id = await voeg('owner_service_sessions_v1', { tokenHash: sha(token), userId, service: 'hub', sourceOrigin: 'https://hub.tarasevych.com', tabHash: sha('ecosystem'), createdAt: nu, authenticatedAt: nu, lastSeenAt: nu, idleExpiresAt: nu + 864e5, absoluteExpiresAt: nu + 7 * 864e5, rotation: 0, version: 1, revocationEpoch: 0, ip: '0.0.0.0', userAgent: 'rooktest', authMethod: 'google', scope: 'ecosystem' });
  return `${id}.${token}`;
}

try {
  const naam = await cookieNaam();
  const eigenaar = await zaaiGebruiker('rooktest-eigenaar@example.test', 'owner');
  const lid = await zaaiGebruiker('rooktest-lid@example.test', 'member');
  const c1 = `${naam}=${encodeURIComponent(await zaaiSessie(eigenaar))}`;

  // 0. Statische bestanden: geen audit-uitvoer of sourcemaps; CSP met 'wasm-unsafe-eval' maar zonder 'unsafe-eval'.
  let s0 = await verzoek('GET', 'hub.tarasevych.com', '/l002-diagnostic.json');
  check('l002-diagnostic.json niet gepubliceerd (404)', s0.status === 404, `status ${s0.status}`);
  s0 = await verzoek('GET', 'hub.tarasevych.com', '/assets/index.js.map');
  check('sourcemaps niet gepubliceerd (404)', s0.status === 404, `status ${s0.status}`);
  const kop = await new Promise((resolve, reject) => { const u = new URL(BASE); http.get({ hostname: u.hostname, port: u.port, path: '/', headers: { host: 'hub.tarasevych.com' } }, r => { r.resume(); resolve(r.headers['content-security-policy'] || ''); }).on('error', reject); });
  check("CSP: script-src 'self' 'wasm-unsafe-eval', geen 'unsafe-eval'/'unsafe-inline' voor scripts", /script-src 'self' 'wasm-unsafe-eval';/.test(kop) && !/script-src[^;]*'unsafe-(eval|inline)'/.test(kop), kop.match(/script-src[^;]*/)?.[0]);

  // 1. Zonder cookie: netjes afgemeld.
  let r = await api('hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: tab() });
  check('bootstrap zonder sessie → signed_out', r.status === 200 && r.data?.state === 'signed_out', `status ${r.status}`);
  const wis = r.setCookie.join(' | ');
  check('wis-cookie heeft Domain=.tarasevych.com en SameSite=Lax, geen Partitioned', /Domain=\.tarasevych\.com/.test(wis) && /SameSite=Lax/.test(wis) && !/Partitioned|SameSite=None/.test(wis), wis.slice(0, 160));

  // 2. Met cookie op hub, daarna dezelfde cookie op cloud en mail (één aanmelding).
  for (const svc of ['hub', 'cloud', 'mail', 'id']) {
    const service = svc === 'id' ? 'identity' : svc;
    r = await api(`${svc}.tarasevych.com`, '/api/owner/session/bootstrap', { service, tabContext: tab() }, c1);
    const email = r.data?.user?.email || r.data?.currentUser?.email || JSON.stringify(r.data).match(/rooktest-eigenaar@example\.test/)?.[0];
    check(`sessie geldig op ${svc}.tarasevych.com`, r.status === 200 && email === 'rooktest-eigenaar@example.test', `status ${r.status} ${typeof r.data === 'object' ? (r.data.state || r.data.error || '') : ''}`);
  }
  // Client-IP komt uit cf-connecting-ip, niet uit (vervalsbare) x-forwarded-for / x-real-ip.
  const ipRij = await pool.query("select data->>'ip' ip from app.records where tbl='owner_service_sessions_v1' and data->>'userId'=$1", [eigenaar]);
  check('sessie-IP = cf-connecting-ip (x-forwarded-for genegeerd)', ipRij.rows[0]?.ip === '203.0.113.7', `ip=${ipRij.rows[0]?.ip}`);
  // Verkeerde service voor de host wordt geweigerd (host bepaalt de service).
  r = await api('cloud.tarasevych.com', '/api/owner/session/bootstrap', { service: 'mail', tabContext: tab() }, c1);
  check('service ≠ host wordt geweigerd', (r.status >= 400 && r.status !== 404) || r.data?.state === 'signed_out', `status ${r.status}`);

  // 3. Multi-account: accountlijst van de browser.
  r = await api('hub.tarasevych.com', '/api/owner/session/accounts', { service: 'hub', tabContext: tab() }, c1);
  check('accountlijst (multi-account) antwoordt', r.status === 200, `status ${r.status} ${JSON.stringify(r.data).slice(0, 140)}`);

  // 4. DB-roundtrip via de API: werkruimte maken en terugzien in Postgres.
  const t = tab();
  r = await api('cloud.tarasevych.com', '/api/owner/cloud/bootstrap', { service: 'cloud', tabContext: t }, c1);
  check('cloud bootstrap', r.status === 200, `status ${r.status} ${typeof r.data === 'string' ? r.data.slice(0, 100) : r.data?.error || ''}`);
  r = await api('cloud.tarasevych.com', '/api/owner/cloud/workspaces/create', { service: 'cloud', tabContext: t, title: 'Rooktest werkruimte' }, c1);
  check('werkruimte aanmaken', r.status === 200, `status ${r.status} ${r.data?.error || ''}`);
  const ws = await pool.query("select count(*)::int n from app.records where data->>'ownerUserId'=$1 and data::text like '%Rooktest werkruimte%'", [eigenaar]);
  check('werkruimte staat in app.records (jsonb)', ws.rows[0].n >= 1, `${ws.rows[0].n} rij(en)`);

  // 5. Upload + download van een bestand.
  const inhoud = Buffer.from(`Hallo vanaf de rooktest ${randomUUID()}\n`);
  r = await api('cloud.tarasevych.com', '/api/owner/cloud/capture', { service: 'cloud', tabContext: t, kind: 'file', fileName: 'rooktest.txt', mimeType: 'text/plain', fileData: inhoud.toString('base64') }, c1);
  const item = r.data?.item;
  check('bestand uploaden (capture)', r.status === 200 && !!item?.id, `status ${r.status} ai=${r.data?.ai?.state || ''}/${r.data?.ai?.reasonCode || ''} ${r.data?.error || ''}`);
  if (item?.id) {
    const so = await pool.query('select path, size_bytes, encoding from app.storage_objects order by created_at desc limit 1');
    const pad = so.rows[0]?.path;
    check('storage_objects-rij + bestand op schijf', !!pad && existsSync(join(UPLOADS, pad)), `${pad} (${so.rows[0]?.size_bytes} B, ${so.rows[0]?.encoding})`);
    r = await api('cloud.tarasevych.com', `/api/owner/cloud/items/${item.id}/open`, { service: 'cloud', tabContext: t }, c1);
    check('bestand downloaden (open) geeft dezelfde bytes', r.status === 200 && Buffer.from(r.data?.data || '', 'base64').equals(inhoud), `status ${r.status}`);
    r = await api('cloud.tarasevych.com', '/api/owner/cloud/search', { service: 'cloud', tabContext: t, query: 'rooktest' }, c1);
    check('zoeken vindt het item', r.status === 200 && (r.data?.results || []).length >= 1, `${(r.data?.results || []).length} resultaat`);
  }

  // 6. Tweede gebruiker (multi-user): eigen sessie ziet de data van de eigenaar niet.
  const c2 = `${naam}=${encodeURIComponent(await zaaiSessie(lid))}`;
  r = await api('cloud.tarasevych.com', '/api/owner/cloud/search', { service: 'cloud', tabContext: tab(), query: 'rooktest' }, c2);
  check('tweede gebruiker ziet geen items van eigenaar', r.status !== 404 && (r.status !== 200 || (r.data?.results || []).length === 0), `status ${r.status}`);

  // 7. Wachtwoord-verificatie (geeft bewust nog geen sessie uit, zoals in de huidige code).
  const salt = randomBytes(16);
  const hash = await promisify(scrypt)('rooktest-wachtwoord-123', salt, 32, { N: 16384, r: 8, p: 1 });
  await voeg('identity_passwords_v1', { userId: eigenaar, algorithm: 'scrypt', n: 16384, r: 8, p: 1, salt: salt.toString('base64url'), hash: hash.toString('base64url'), mustChange: false, createdAt: nu, updatedAt: nu });
  r = await api('id.tarasevych.com', '/api/owner/auth/password/login', { email: 'rooktest-eigenaar@example.test', password: 'rooktest-wachtwoord-123' });
  check('wachtwoord-login: juist wachtwoord geverifieerd', r.status === 200 && r.data?.ok === true, `status ${r.status} ${r.data?.reasonCode || r.data?.error || ''}`);
  r = await api('id.tarasevych.com', '/api/owner/auth/password/login', { email: 'rooktest-eigenaar@example.test', password: 'fout' });
  check('wachtwoord-login: fout wachtwoord geweigerd', r.status === 401, `status ${r.status}`);

  // 8. Google/Microsoft zonder env: uitgeschakeld, geen crash.
  r = await api('id.tarasevych.com', '/api/owner/access/catalog', {});
  const google = (r.data?.methods || []).find(m => m.id === 'google');
  check('loginmethoden zonder Google-env: google niet geconfigureerd', r.status === 200 && google && google.configured === false, `status ${r.status} ${JSON.stringify(google)}`);
  const m = await verzoek('GET', 'id.tarasevych.com', '/api/auth/methods');
  check('GET /api/auth/methods zonder Google/Microsoft-env crasht niet', m.status !== 404 && m.status < 500, `status ${m.status} ${JSON.stringify(m.data).slice(0, 200)}`);
  r = await api('id.tarasevych.com', '/api/auth/google/start', { service: 'identity', tabContext: tab() });
  check('Google-start zonder client-ID faalt netjes (geen 500)', r.status !== 404 && (r.status < 500 || r.status === 503), `status ${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
} catch (e) {
  check('onverwachte fout', false, String(e?.stack || e));
} finally {
  // Opruimen: alle rijen die naar de testgebruikers verwijzen.
  if (zaai.length) {
    const paden = await pool.query("select data->>'storagePath' p from app.records where data->>'ownerUserId' = any($1) and coalesce(data->>'storagePath','') <> ''", [zaai]);
    const { rm } = await import('node:fs/promises');
    for (const { p } of paden.rows) { await rm(join(UPLOADS, p), { force: true }); await pool.query('delete from app.storage_objects where path=$1', [p]); }
    await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [zaai]);
  }
  await pool.end();
  const fout = resultaten.filter(r => !r.ok).length;
  console.log(`\n${resultaten.length - fout}/${resultaten.length} geslaagd`);
  process.exit(fout ? 1 : 0);
}
