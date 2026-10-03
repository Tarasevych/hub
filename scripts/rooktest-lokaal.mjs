// Lokale rooktest voor de zelf-gehoste server (fase A + beveiliging fase B).
// Gebruik: DATABASE_URL=... UPLOADS_DIR=... BASE=http://127.0.0.1:8080 node scripts/rooktest-lokaal.mjs
// Zaait een testgebruiker + sessie rechtstreeks in app.records (Google-login is nog niet geconfigureerd)
// en controleert daarna sessie, cookies, multi-account, DB-roundtrip en upload/download via de echte API.
// ALLEEN voor een lege lokale testdatabase; ruimt zijn eigen rijen op aan het eind.
import pg from 'pg';
import { createHash, createHmac, randomBytes, randomUUID, scrypt } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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


// TOTP (RFC 6238) om inschrijving en MFA-login echt te testen.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const vanBase32 = v => { let bits = 0, acc = 0; const out = []; for (const ch of v.replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(ch); if (i < 0) continue; acc = (acc << 5) | i; bits += 5; if (bits >= 8) { out.push((acc >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); };
function totp(secret, stap = Math.floor(Date.now() / 30000)) {
  const buf = Buffer.alloc(8); buf.writeUInt32BE(Math.floor(stap / 0x100000000), 0); buf.writeUInt32BE(stap >>> 0, 4);
  const h = createHmac('sha1', vanBase32(secret)).update(buf).digest(); const o = h[h.length - 1] & 0xf;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
const vanIp = (ip, extra = {}) => ({ 'cf-connecting-ip': ip, ...extra });

const nu = Date.now();
const tab = () => randomBytes(24).toString('hex');
const zaai = [];
const zaaiIds = [];

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
  r = await api('hub.tarasevych.com', '/api/owner/identity/transactions/create', { service: 'hub', tabContext: tab(), flowMode: 'redirect', returnTo: 'https://hub.tarasevych.com/', locale: 'nl' });
  check('Google-redirectstart zonder client-secret faalt netjes (OWNER_GOOGLE_SECRET_UNAVAILABLE, geen bindingscookie)', r.data?.reasonCode === 'OWNER_GOOGLE_SECRET_UNAVAILABLE' && !r.setCookie.some(c => c.startsWith('__Secure-tsv_aanmeld_binding=')), `status ${r.status} ${r.data?.reasonCode || ''}`);

  // ===== Fase B: beveiliging =====
  // B1. CSRF: vreemde Origin en ontbrekende Origin met cookie worden geweigerd; zonder cookie (webhook) niet.
  r = await verzoek('POST', 'hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: tab() }, { cookie: c1, origin: 'https://evil.example' });
  check('CSRF: vreemde Origin → 403 CSRF_ORIGIN_DENIED', r.status === 403 && r.data?.error === 'CSRF_ORIGIN_DENIED', `status ${r.status} ${r.data?.error || ''}`);
  r = await verzoek('POST', 'hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: tab() }, { cookie: c1, origin: '' });
  check('CSRF: cookie zonder Origin → 403 CSRF_ORIGIN_REQUIRED', r.status === 403 && r.data?.error === 'CSRF_ORIGIN_REQUIRED', `status ${r.status} ${r.data?.error || ''}`);
  r = await verzoek('POST', 'id.tarasevych.com', '/api/owner/access/catalog', {}, { origin: '' });
  check('CSRF: zonder cookie en zonder Origin (webhook-achtig) toegestaan', r.status === 200, `status ${r.status}`);
  r = await verzoek('POST', 'hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: tab() }, { cookie: c1, origin: 'https://cloud.tarasevych.com' });
  check('CSRF: andere eigen dienst-origin toegestaan', r.status === 200, `status ${r.status}`);

  // B2. Verouderde aanmeld-/sessieroutes (auth fase 1) antwoorden 410 Gone; rate limit (MFA-bucket, 10/min/IP).
  const weg = [];
  for (const [host, pad] of [['id.tarasevych.com', '/api/auth/google'], ['id.tarasevych.com', '/api/auth/google/code'], ['id.tarasevych.com', '/api/auth/google/start'], ['id.tarasevych.com', '/api/auth/broker/request/create'], ['cloud.tarasevych.com', '/api/service-handoff/consume'], ['mail.tarasevych.com', '/api/ecosystem/handoff/exchange'], ['mail.tarasevych.com', '/api/ecosystem/bootstrap'], ['id.tarasevych.com', '/api/identity/admin/overview'], ['id.tarasevych.com', '/api/service/admin/overview'], ['hub.tarasevych.com', '/api/auth/logout']]) {
    const x = await verzoek('POST', host, pad, {}, vanIp('203.0.113.22'));
    weg.push(`${pad}=${x.status}${x.data?.reasonCode === 'LEGACY_ROUTE_GONE' ? '' : '!'}`);
  }
  check('verouderde routes → 410 LEGACY_ROUTE_GONE', weg.every(x => x.endsWith('=410')), weg.join(' '));
  const gs = [];
  for (let i = 0; i < 11; i++) gs.push(await verzoek('POST', 'id.tarasevych.com', '/api/owner/access/totp/start', { service: 'identity', tabContext: tab() }, vanIp('203.0.113.21')));
  check('rate limit: 11e MFA-verzoek binnen een minuut → 429 met Retry-After', gs.slice(0, 10).every(x => x.status !== 429) && gs[10].status === 429 && gs[10].data?.error === 'RATE_LIMITED', `statussen ${gs.map(x => x.status).join(',')}`);

  // B3. Lockout: na 5 foute wachtwoorden is het account tijdelijk geblokkeerd, ook voor het juiste wachtwoord.
  await pool.query("delete from app.login_lockouts where subject = 'wachtwoord:rooktest-eigenaar@example.test'");
  const lockIp = vanIp('203.0.113.31');
  const fouten = [];
  for (let i = 0; i < 5; i++) fouten.push((await verzoek('POST', 'id.tarasevych.com', '/api/owner/auth/password/login', { email: 'rooktest-eigenaar@example.test', password: `fout-${i}` }, lockIp)).status);
  r = await verzoek('POST', 'id.tarasevych.com', '/api/owner/auth/password/login', { email: 'rooktest-eigenaar@example.test', password: 'rooktest-wachtwoord-123' }, vanIp('203.0.113.32'));
  check('lockout na 5 fouten (429 ACCESS_LOCKED_TEMPORARILY, ook met juist wachtwoord)', fouten.slice(0, 4).every(x => x === 401) && fouten[4] === 429 && r.status === 429 && r.data?.error === 'ACCESS_LOCKED_TEMPORARILY', `fouten ${fouten.join(',')} daarna ${r.status} ${r.data?.error || ''}`);
  await pool.query("delete from app.login_lockouts where subject = 'wachtwoord:rooktest-eigenaar@example.test'");

  // B4. TOTP: geheim versleuteld opgeslagen, herstelcodes gepepperd; MFA-login met code en herstelcode (eenmalig).
  const idBody = () => ({ service: 'identity', tabContext: tab() });
  r = await api('id.tarasevych.com', '/api/owner/access/totp/start', idBody(), c1);
  const geheim = r.data?.secret;
  const totpRij = (await pool.query("select data from app.records where tbl='identity_totp_v1' and data->>'userId'=$1", [eigenaar])).rows[0]?.data || {};
  check('TOTP-geheim versleuteld opgeslagen (secretEnc, geen leesbaar secret)', r.status === 200 && !!geheim && !!totpRij.secretEnc && !('secret' in totpRij) && !String(totpRij.secretEnc).includes(geheim), `status ${r.status} ${r.data?.error || ''} velden=${Object.keys(totpRij).join(',')}`);
  let herstel = [];
  if (geheim) {
    r = await api('id.tarasevych.com', '/api/owner/access/totp/confirm', { ...idBody(), code: totp(geheim) }, c1);
    herstel = r.data?.recoveryCodes || [];
    const rec = (await pool.query("select data from app.records where tbl='identity_recovery_codes_v1' and data->>'userId'=$1", [eigenaar])).rows[0]?.data || {};
    const legacy = herstel[0] ? createHmac('sha256', 'mij-prostir-access-v1').update(herstel[0]).digest('hex') : 'x';
    check('herstelcodes met pepper gehasht (hashVersion 2, niet de oude vaste sleutel)', r.status === 200 && herstel.length === 10 && rec.hashVersion === 2 && !rec.hashes?.includes(legacy), `status ${r.status} ${r.data?.error || ''}`);
    const pw = { email: 'rooktest-eigenaar@example.test', password: 'rooktest-wachtwoord-123' };
    // Fase 3: replaybescherming. De code van de inschrijving (zelfde tijdvak) werkt niet nog eens; die van het
    // volgende tijdvak (binnen de speling) wel, maar ook maar één keer.
    r = await verzoek('POST', 'id.tarasevych.com', '/api/owner/auth/password/login', { ...pw, totp: totp(geheim) }, vanIp('203.0.113.33'));
    const volgende = totp(geheim, Math.floor(Date.now() / 30000) + 1);
    const rOk = await verzoek('POST', 'id.tarasevych.com', '/api/owner/auth/password/login', { ...pw, totp: volgende }, vanIp('203.0.113.33'));
    const rNogEens = await verzoek('POST', 'id.tarasevych.com', '/api/owner/auth/password/login', { ...pw, totp: volgende }, vanIp('203.0.113.33'));
    check('MFA-login met TOTP-code; dezelfde code nog eens (replay) geweigerd', r.status === 401 && rOk.status === 200 && rOk.data?.ok === true && rNogEens.status === 401, `inschrijfcode ${r.status}, nieuw ${rOk.status} ${rOk.data?.error || ''}, opnieuw ${rNogEens.status}`);
    r = rOk;
    r = await verzoek('POST', 'id.tarasevych.com', '/api/owner/auth/password/login', { ...pw, totp: herstel[0] }, vanIp('203.0.113.33'));
    const r2 = await verzoek('POST', 'id.tarasevych.com', '/api/owner/auth/password/login', { ...pw, totp: herstel[0] }, vanIp('203.0.113.33'));
    check('herstelcode werkt precies één keer', r.status === 200 && r2.status === 401, `eerste ${r.status}, tweede ${r2.status}`);
    // Gelijktijdig: dezelfde (nog ongebruikte) herstelcode 4× tegelijk → precies één succes (atomische UPDATE).
    const tegelijk = await Promise.all([41, 42, 43, 44].map(n => verzoek('POST', 'id.tarasevych.com', '/api/owner/auth/password/login', { ...pw, totp: herstel[1] }, vanIp(`203.0.113.${n}`))));
    const recNa = (await pool.query("select data from app.records where tbl='identity_recovery_codes_v1' and data->>'userId'=$1", [eigenaar])).rows[0]?.data || {};
    check('herstelcode gelijktijdig: van 4 pogingen slaagt er precies één, teller klopt', tegelijk.filter(x => x.status === 200).length === 1 && tegelijk.filter(x => x.status === 401).length === 3 && recNa.remaining === 8 && recNa.hashes?.length === 8, `statussen ${tegelijk.map(x => x.status).join(',')}, over ${recNa.remaining}/${recNa.hashes?.length}`);
    await pool.query("delete from app.login_lockouts where subject = 'wachtwoord:rooktest-eigenaar@example.test'");
  }

  // B4b. Fase 3: step-up, telefoon 'pending', ontkoppelen = 7 dagen terug te zetten, TOTP uitzetten vereist code.
  {
    let t = await api('id.tarasevych.com', '/api/owner/access/phone/save', { ...idBody(), phone: '+31612345678' }, c1);
    check('step-up: telefoon opslaan zonder verse aanmelding → 403 STEP_UP_REQUIRED', t.status === 403 && t.data?.error === 'STEP_UP_REQUIRED', `${t.status} ${t.data?.error || ''}`);
    const stapFout = await api('id.tarasevych.com', '/api/owner/access/stap-op', { ...idBody(), code: '000000' }, c1);
    // Verse Google-aanmelding nabootsen (de zaaisessie is net gemaakt).
    await pool.query("insert into app.records (tbl,id,data) values ('owner_step_up_v1', gen_random_uuid()::text, $1)", [{ userId: eigenaar, googleAt: Date.now(), sessies: {}, updatedAt: Date.now() }]);
    t = await api('id.tarasevych.com', '/api/owner/access/phone/save', { ...idBody(), phone: '+31612345678' }, c1);
    const telMethode = (t.data?.methods || []).find(m => m.id === 'phone');
    check('telefoon na step-up opgeslagen maar "pending" (telt niet als aanmeldmethode); stap-op met foute code 400', t.status === 200 && t.data?.phone?.pending === true && telMethode?.bound === false && (telMethode?.status === 'pending' || telMethode?.enabled === false) && stapFout.status === 400, `${t.status} ${t.data?.error || ''} ${JSON.stringify(telMethode)} stap-op ${stapFout.status}`);
    const usableVoor = t.data?.usableCount;
    t = await api('id.tarasevych.com', '/api/owner/access/method/unbind', { ...idBody(), method: 'phone' }, c1);
    const herstel = t.data?.herstelbaar || [];
    const telRij = (await pool.query("select data from app.records where tbl='identity_phones_v1' and data->>'userId'=$1", [eigenaar])).rows[0]?.data || {};
    const melding = (await pool.query("select 1 from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'='access_method_unlinked'", [eigenaar])).rowCount;
    check('ontkoppelen: niet verwijderd maar uitgeschakeld (herstelTot ~7 dagen), melding aan het account', t.status === 200 && herstel.some(h => h.method === 'phone') && !!telRij.ontkoppeldAt && telRij.herstelTot - telRij.ontkoppeldAt === 7 * 24 * 3600 * 1000 && t.data?.phone?.configured === false && melding >= 1 && t.data?.usableCount === usableVoor, `${t.status} ${t.data?.error || ''} herstel=${herstel.length} melding=${melding}`);
    t = await api('id.tarasevych.com', '/api/owner/access/method/herstel', { ...idBody() }, c1);
    check('terugzetten binnen 7 dagen: telefoon weer aanwezig (nog steeds pending), niets meer herstelbaar', t.status === 200 && t.data?.phone?.configured === true && t.data?.phone?.pending === true && (t.data?.herstelbaar || []).length === 0, `${t.status} ${t.data?.error || ''}`);
    t = await api('id.tarasevych.com', '/api/owner/access/totp/disable', { ...idBody() }, c1);
    const t2 = await api('id.tarasevych.com', '/api/owner/access/recovery/rotate', { ...idBody(), code: '123456' }, c1);
    check('TOTP uitzetten zonder code en herstelcodes vernieuwen met foute code geweigerd', t.status === 400 && t.data?.error === 'ACCESS_TOTP_CODE_REQUIRED' && t2.status === 400, `${t.status} ${t.data?.error || ''} / ${t2.status} ${t2.data?.error || ''}`);
    await pool.query("delete from app.records where tbl='owner_step_up_v1' and data->>'userId'=$1", [eigenaar]);
  }

  // B5. Eigenaar uit OWNER_EMAIL: eigenaar mag admin, lid niet.
  r = await api('admin.tarasevych.com', '/api/owner/admin/bootstrap', { service: 'admin', tabContext: tab() }, c1);
  const rLid = await api('admin.tarasevych.com', '/api/owner/admin/bootstrap', { service: 'admin', tabContext: tab() }, `${naam}=${encodeURIComponent(await zaaiSessie(lid))}`);
  check('eigenaar komt uit OWNER_EMAIL (admin 200 voor eigenaar, 403 voor lid)', r.status === 200 && rLid.status === 403, `eigenaar ${r.status} ${r.data?.error || ''}, lid ${rLid.status}`);

  // B6. Vault: onthullen alleen op admin./api.; geen uitzondering voor andere hosts.
  r = await api('hub.tarasevych.com', '/api/owner/api-platform/vault/onbekend/reveal', { service: 'hub', tabContext: tab() }, c1);
  const rApi = await api('api.tarasevych.com', '/api/owner/api-platform/vault/onbekend/reveal', { service: 'api', tabContext: tab() }, c1);
  check('vault-onthulling geweigerd buiten admin./api. (403), niet op api.', r.status === 403 && rApi.data?.error !== 'OWNER_VAULT_REVEAL_HOST_FORBIDDEN', `hub ${r.status} ${r.data?.error || ''}, api ${rApi.status} ${rApi.data?.error || ''}`);

  // B7. Passkeys uitgeschakeld tot echte WebAuthn-verificatie.
  r = await api('id.tarasevych.com', '/api/owner/access/webauthn/options', idBody(), c1);
  const rReg = await api('id.tarasevych.com', '/api/owner/access/webauthn/register', { ...idBody(), credentialId: 'x'.repeat(40) }, c1);
  const snap = await api('id.tarasevych.com', '/api/owner/access/snapshot', idBody(), c1);
  const wa = (snap.data?.factors || []).find(f => f.id === 'webauthn');
  check('passkeys uit: options/register → 503 ACCESS_WEBAUTHN_DISABLED, factor niet actief', r.status === 503 && r.data?.error === 'ACCESS_WEBAUTHN_DISABLED' && rReg.status === 503 && wa && wa.enabled === false, `options ${r.status}, register ${rReg.status}, factor ${JSON.stringify(wa)}`);

  // B8. Sessie-handoff is atomisch eenmalig: drie gelijktijdige inwisselingen → precies één succes.
  const bindingUit = res => (res.setCookie.map(c => c.split(';')[0]).find(c => c.startsWith('tsv_handoff_binding=')) || '');
  r = await api('hub.tarasevych.com', '/api/owner/session/handoff/create', { service: 'hub', tabContext: tab(), target: 'cloud' }, c1);
  const code = r.data?.url ? new URL(r.data.url).searchParams.get('handoff') : '';
  const binding1 = bindingUit(r);
  const bindingAttr = r.setCookie.find(c => c.startsWith('tsv_handoff_binding=')) || '';
  check('handoff-aanmaak zet bindingscookie (HttpOnly, Secure, SameSite=Strict, Domain=.tarasevych.com)', /HttpOnly/.test(bindingAttr) && /Secure/.test(bindingAttr) && /SameSite=Strict/.test(bindingAttr) && /Domain=\.tarasevych\.com/.test(bindingAttr), bindingAttr.replace(/=[^;]+/, '=…'));
  const pogingen = await Promise.all([1, 2, 3].map(() => verzoek('POST', 'cloud.tarasevych.com', '/api/owner/session/handoff/redeem', { code, service: 'cloud', tabContext: tab() }, { cookie: binding1 })));
  check('handoff-code: van 3 gelijktijdige inwisselingen slaagt er precies één', !!code && !!binding1 && pogingen.filter(x => x.status === 200).length === 1, `create ${r.status}, statussen ${pogingen.map(x => x.status).join(',')}`);
  // Hergebruik: een tweede aanmaak in dezelfde browser houdt dezelfde binding (meerdere tabbladen blijven werken).
  r = await api('hub.tarasevych.com', '/api/owner/session/handoff/create', { service: 'hub', tabContext: tab(), target: 'mail' }, `${c1}; ${binding1}`);
  check('bindingscookie wordt hergebruikt bij een volgende handoff in dezelfde browser', bindingUit(r) === binding1, `${r.status}`);

  // B8b. Login-CSRF: een code van de aanvaller werkt niet in een andere (afgemelde) browser en wordt daar ook niet verbruikt.
  const cLid = `${naam}=${encodeURIComponent(await zaaiSessie(lid))}`;
  r = await api('hub.tarasevych.com', '/api/owner/session/handoff/create', { service: 'hub', tabContext: tab(), target: 'cloud' }, cLid);
  const codeAanvaller = r.data?.url ? new URL(r.data.url).searchParams.get('handoff') : '';
  const bindingAanvaller = bindingUit(r);
  const zonder = await verzoek('POST', 'cloud.tarasevych.com', '/api/owner/session/handoff/redeem', { code: codeAanvaller, service: 'cloud', tabContext: tab() });
  const anders = await verzoek('POST', 'cloud.tarasevych.com', '/api/owner/session/handoff/redeem', { code: codeAanvaller, service: 'cloud', tabContext: tab() }, { cookie: `tsv_handoff_binding=${randomBytes(32).toString('base64url')}` });
  const eigen = await verzoek('POST', 'cloud.tarasevych.com', '/api/owner/session/handoff/redeem', { code: codeAanvaller, service: 'cloud', tabContext: tab() }, { cookie: bindingAanvaller });
  check('login-CSRF: ondergeschoven handoff geweigerd zonder (401) of met andere bindingscookie (401), zonder de code te verbruiken', !!codeAanvaller && zonder.status === 401 && zonder.data?.error === 'OWNER_HANDOFF_BINDING_MISSING' && anders.status === 401 && eigen.status === 200 && !zonder.setCookie.length && !anders.setCookie.length, `zonder ${zonder.status} ${zonder.data?.error || ''}, ander ${anders.status}, eigen browser ${eigen.status}`);
  // B8c. Login-CSRF bij de Google-callback: een ondergeschoven state/code (van een aanmelding die in een
  // andere browser startte) wordt geweigerd; dezelfde browser (bindingscookie) komt voorbij de controle.
  // Sinds de per-transactie-binding: cookie `__Secure-tsv_aanmeld_binding_<16 hex transactiehash>`,
  // hash = sha256("tsv-aanmeld-binding-v2|transactiehash|tabhash|waarde").
  const zaaiAanmelding = async (waarde, { metHash = true, v1 = false } = {}) => {
    const txId = randomUUID(), stateId = randomUUID(), txHash = sha(randomBytes(8).toString('hex')), tabHash = sha('t');
    const state = `v2.uk.${Buffer.from(txId).toString('base64url')}.${randomBytes(24).toString('base64url')}`;
    const bindingHash = v1 ? sha(waarde) : sha(`tsv-aanmeld-binding-v2|${txHash}|${tabHash}|${waarde}`);
    await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['owner_auth_transactions_v1', txId, { transactionHash: txHash, attachHash: 'x', redeemHash: 'x', ...(metHash ? { bindingHash } : {}), sourceOrigin: 'https://hub.tarasevych.com', targetService: 'hub', tabHash, tabContext: 't', intent: 'login', flowMode: 'redirect', returnTo: 'https://hub.tarasevych.com/', status: 'attached', createdAt: Date.now(), expiresAt: Date.now() + 6e5, attachedAt: Date.now(), oauthStateId: stateId, rooktest: true }]);
    await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['google_oauth_states', stateId, { stateHash: sha(state), nonceHash: 'x', proofHash: 'x', status: 'pending', ownerTransactionRecordId: txId, ownerRedirect: true, remember: false, ownerLocale: 'uk', createdAt: Date.now(), expiresAt: Date.now() + 6e5, rooktest: true }]);
    zaaiIds.push(txId, stateId);
    return { state, cookie: `__Secure-tsv_aanmeld_binding_${txHash.slice(0, 16)}=${waarde}` };
  };
  const cbVerzoek = (st, cookie) => verzoek('POST', 'id.tarasevych.com', '/api/owner/auth/google/callback', { state: st, code: 'rooktest-code' }, cookie ? { cookie } : {});
  const w = () => randomBytes(32).toString('base64url');
  const tA = await zaaiAanmelding(w());
  const cbZonder = await cbVerzoek(tA.state);
  const tB = await zaaiAanmelding(w());
  const cbAnder = await cbVerzoek(tB.state, tB.cookie.replace(/=.*$/, `=${w()}`));
  const tC = await zaaiAanmelding(w(), { metHash: false });
  const cbOud = await cbVerzoek(tC.state, tC.cookie);
  const vw = w(), tV = await zaaiAanmelding(vw, { v1: true });
  const cbV1 = await cbVerzoek(tV.state, `__Secure-tsv_aanmeld_binding=${vw}; ${tV.cookie}`);
  const tD = await zaaiAanmelding(w());
  const cbEigen = await cbVerzoek(tD.state, tD.cookie);
  const mis = (x) => x.data?.reasonCode === 'LOGIN_BINDING_MISMATCH';
  const voorbij = (x) => x.data?.ok === false && !!x.data?.reasonCode && !mis(x);
  check('login-CSRF: Google-callback zonder/met andere bindingscookie, zonder hash of met oude v1-binding → LOGIN_BINDING_MISMATCH; eigen browser komt voorbij de controle', mis(cbZonder) && mis(cbAnder) && mis(cbOud) && mis(cbV1) && voorbij(cbEigen), `zonder ${cbZonder.data?.reasonCode}, ander ${cbAnder.data?.reasonCode}, oud ${cbOud.data?.reasonCode}, v1 ${cbV1.data?.reasonCode}, eigen ${cbEigen.data?.reasonCode}`);
  // B8c-2. Twee parallelle aanmeldingen (twee tabbladen) in één cookiejar: beide komen voorbij de binding,
  // en het antwoord wist alleen de eigen bindingscookie.
  const p1 = await zaaiAanmelding(w()), p2 = await zaaiAanmelding(w());
  const jarP = `${p1.cookie}; ${p2.cookie}`;
  const cbP1 = await cbVerzoek(p1.state, jarP), cbP2 = await cbVerzoek(p2.state, jarP);
  check('login-CSRF: twee parallelle transacties in één cookiejar komen allebei voorbij de bindingscontrole', voorbij(cbP1) && voorbij(cbP2), `1 ${cbP1.data?.reasonCode}, 2 ${cbP2.data?.reasonCode}`);

  // B8d. "Overal afmelden" dekt alles: >100 sessies (alle pagina's), onthouden browsers, openstaande
  // handoff-codes, afgeronde-maar-niet-ingewisselde aanmeldtransacties en verouderde sessierijen.
  const intrekker = await zaaiGebruiker('rooktest-intrekken@example.test', 'member');
  const cI = `${naam}=${encodeURIComponent(await zaaiSessie(intrekker))}`;
  await pool.query("insert into app.records (tbl, id, data) select 'owner_service_sessions_v1', gen_random_uuid()::text, jsonb_build_object('tokenHash', md5(random()::text), 'userId', $1::text, 'service', 'hub', 'idleExpiresAt', $2::bigint, 'absoluteExpiresAt', $2::bigint, 'revocationEpoch', 0, 'scope', 'ecosystem') from generate_series(1, 120)", [intrekker, nu + 864e5]);
  await voeg('owner_browser_grants_v1', { tokenHash: 'rooktest-grant', userId: intrekker, createdAt: nu, lastUsedAt: nu, expiresAt: nu + 864e5 });
  await voeg('service_handoffs', { codeHash: 'rooktest-handoff', userId: intrekker, service: 'cloud', expiresAt: nu + 6e4, bindingHash: 'x' });
  const txI = await voeg('owner_auth_transactions_v1', { transactionHash: 'rooktest-tx', userId: intrekker, status: 'complete', flowMode: 'redirect', redirectTokenHash: 'rooktest-redirect', expiresAt: nu + 6e5 });
  await voeg('service_sessions', { tokenHash: 'rooktest-oud', userId: intrekker, service: 'mail', expiresAt: nu + 864e5 });
  r = await api('hub.tarasevych.com', '/api/owner/session/logout-account-everywhere', { service: 'hub', tabContext: tab() }, cI);
  const telI = async (sql) => (await pool.query(sql, [intrekker])).rows[0].n;
  const openSessies = await telI("select count(*)::int n from app.records where tbl='owner_service_sessions_v1' and data->>'userId'=$1 and coalesce((data->>'revokedAt')::bigint,0)=0");
  const openGrants = await telI("select count(*)::int n from app.records where tbl='owner_browser_grants_v1' and data->>'userId'=$1 and coalesce((data->>'revokedAt')::bigint,0)=0");
  const handoffsI = await telI("select count(*)::int n from app.records where tbl='service_handoffs' and data->>'userId'=$1");
  const oudI = await telI("select count(*)::int n from app.records where tbl='service_sessions' and data->>'userId'=$1");
  const txStatus = (await pool.query("select data->>'status' s, data->>'redirectTokenHash' h from app.records where id=$1", [txI])).rows[0];
  r = await api('hub.tarasevych.com', '/api/owner/session/bootstrap', { service: 'hub', tabContext: tab() }, cI);
  check('overal afmelden: alle 121 sessies + grant ingetrokken, handoff weg, transactie geannuleerd, oude sessierij weg, cookie ongeldig', openSessies === 0 && openGrants === 0 && handoffsI === 0 && oudI === 0 && txStatus?.s === 'cancelled' && !txStatus?.h && r.data?.state === 'signed_out', `open sessies ${openSessies}, grants ${openGrants}, handoffs ${handoffsI}, oud ${oudI}, tx ${txStatus?.s}, bootstrap ${r.data?.state}`);

  // B9. CSP op de server-gegenereerde callbackpagina: hashes, geen 'unsafe-inline'.
  const cb = await new Promise((resolve, reject) => { const u = new URL(BASE); http.get({ hostname: u.hostname, port: u.port, path: '/api/owner/auth/google/callback?state=x&code=y', headers: { host: 'id.tarasevych.com' } }, rs => { rs.resume(); resolve({ status: rs.statusCode, csp: rs.headers['content-security-policy'] || '', type: rs.headers['content-type'] || '' }); }).on('error', reject); });
  check("callbackpagina heeft strikte CSP (sha256, geen 'unsafe-inline')", !/unsafe-inline/.test(cb.csp) && /default-src 'none'/.test(cb.csp) && (!/text\/html/.test(cb.type) || /script-src ('sha256-|'none')/.test(cb.csp)), `status ${cb.status} ${cb.type} csp=${cb.csp.slice(0, 120)}`);

  // B10. Opruimjob (cron-taak "opruimen"): verlopen states/sessies weg, geldige blijven.
  const oud = nu - 3 * 864e5;
  const vOud = await voeg('google_oauth_states', { stateHash: 'rooktest-oud', status: 'pending', createdAt: oud, expiresAt: oud });
  const vNieuw = await voeg('google_oauth_states', { stateHash: 'rooktest-nieuw', status: 'pending', createdAt: nu, expiresAt: nu + 6e5 });
  const sOud = await voeg('owner_service_sessions_v1', { tokenHash: 'rooktest-oud', userId: eigenaar, idleExpiresAt: oud, absoluteExpiresAt: oud + 1 });
  await pool.query("insert into app.rate_limits (bucket, window_start, hits) values ('rooktest:oud', now() - interval '3 days', 1) on conflict do nothing");
  let cronUit = '';
  try { cronUit = execFileSync(process.execPath, ['dist-server/cron.mjs', 'opruimen'], { env: process.env, encoding: 'utf8', timeout: 60000 }); } catch (e) { cronUit = String(e.stdout || e.message); }
  const over = (await pool.query('select id from app.records where id = any($1)', [[vOud, vNieuw, sOud]])).rows.map(x => x.id);
  const rlOver = (await pool.query("select count(*)::int n from app.rate_limits where bucket='rooktest:oud'")).rows[0].n;
  check('opruimjob verwijdert verlopen state/sessie/rate-limit, houdt geldige state', !over.includes(vOud) && !over.includes(sOud) && over.includes(vNieuw) && rlOver === 0, `${cronUit.trim().split('\n').pop()}`);
  await pool.query('delete from app.records where id = $1', [vNieuw]);
} catch (e) {
  check('onverwachte fout', false, String(e?.stack || e));
} finally {
  // Opruimen: alle rijen die naar de testgebruikers verwijzen.
  if (zaai.length) {
    const paden = await pool.query("select data->>'storagePath' p from app.records where data->>'ownerUserId' = any($1) and coalesce(data->>'storagePath','') <> ''", [zaai]);
    const { rm } = await import('node:fs/promises');
    for (const { p } of paden.rows) { await rm(join(UPLOADS, p), { force: true }); await pool.query('delete from app.storage_objects where path=$1', [p]); }
    await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1) or data->>'recipientUserId' = any($1)", [zaai]);
  }
  if (zaaiIds.length) await pool.query('delete from app.records where id = any($1)', [zaaiIds]).catch(() => {});
  await pool.query("delete from app.login_lockouts where subject like 'wachtwoord:rooktest-%'").catch(() => {});
  await pool.end();
  const fout = resultaten.filter(r => !r.ok).length;
  console.log(`\n${resultaten.length - fout}/${resultaten.length} geslaagd`);
  process.exit(fout ? 1 : 0);
}
