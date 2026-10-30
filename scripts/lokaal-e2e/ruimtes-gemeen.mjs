// Gedeelde hulp voor de ruimtes-suites (lekkage, directe URL, visuele mailregressie). ALLEEN LOKAAL — nooit productie.
// Keten: Chrome → https *.tarasevych.com (host-resolver → 127.0.0.1:PROXY_PORT, zelfondertekend) → ruimtes-proxy.mjs → dist-server.
// Elk verzoek naar een andere host wordt afgebroken en geteld (eis 0). Uitslag: console + JSON in $UITSLAG_MAP.
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const eis = createRequire(import.meta.url);
export const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
export const { chromium } = await import(`${PW}/index.mjs`);
export const pg = eis(eis.resolve('pg', { paths: [process.cwd(), '/workspace/e2e-tools'] }));
export const POORT = process.env.PROXY_PORT || '8494';

// ── wacht: alleen lokaal ──
export function alleenLokaal() {
  const u = new URL(process.env.DATABASE_URL || 'postgres://x@onbekend/x');
  if (!['127.0.0.1', 'localhost', '::1'].includes(u.hostname)) throw new Error(`WEIGERING: DATABASE_URL wijst niet naar deze machine (${u.hostname})`);
  if (/^(mijnruimte|productie|prod)$/i.test(u.pathname.slice(1)) && !process.env.RU_TOCH_DEZE_DB) throw new Error('WEIGERING: gebruik een eigen wegwerp-database (bv. ru4), niet de gedeelde');
  if (!/^\d+$/.test(POORT) || POORT === '443') throw new Error('WEIGERING: PROXY_PORT moet een lokale testpoort zijn');
}
export const sha = (v) => createHash('sha256').update(v).digest('hex');

// ── uitslag ──
export function verslag(suite) {
  const uitslag = [];
  const check = (n, ok, info = '', soort = '') => { uitslag.push({ n, ok: !!ok, info: String(info).slice(0, 600), soort }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${n}${info ? ' — ' + String(info).slice(0, 300) : ''}`); return !!ok; };
  const sluit = () => {
    const ok = uitslag.filter((x) => x.ok).length; const map = process.env.UITSLAG_MAP || `/workspace/ru-uitslag`;
    mkdirSync(map, { recursive: true }); writeFileSync(`${map}/${suite}.json`, JSON.stringify({ suite, tijd: new Date().toISOString(), geslaagd: ok, totaal: uitslag.length, uitslag }, null, 2));
    console.log(`\n${ok}/${uitslag.length} geslaagd (${suite})`); return ok === uitslag.length ? 0 : 1;
  };
  return { check, sluit, uitslag };
}

// ── browser ──
export const geblokt = []; export const paginaFouten = [];
export async function startBrowser() {
  return chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: [`--host-resolver-rules=MAP *.tarasevych.com 127.0.0.1:${POORT}, MAP tarasevych.com 127.0.0.1:${POORT}, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`, '--no-sandbox', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
}
export const COOKIE = '__Secure-tsv_ecosystem_migrated-bg2v4h';
export async function context(browser, s, o = {}) {
  const breedte = o.breedte ?? 1280;
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: breedte, height: o.hoogte ?? (breedte < 500 ? 844 : 900) }, hasTouch: breedte < 500, locale: o.nl ? 'nl-BE' : 'uk-UA', timezoneId: 'Europe/Brussels', colorScheme: o.thema || 'dark', reducedMotion: 'reduce' });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); if (/^(data|blob):/.test(u.protocol) || u.hostname === 'tarasevych.com' || u.hostname.endsWith('.tarasevych.com')) return r.continue(); geblokt.push(u.href.slice(0, 120)); return r.abort(); });
  if (s) await ctx.addCookies([{ name: COOKIE, value: s.cookie, domain: '.tarasevych.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage(); page.on('pageerror', (e) => paginaFouten.push(e.message.slice(0, 200)));
  return { ctx, page };
}

// ── gegevens ──
export function gegevens(pool) {
  const sessies = [];
  async function gebruiker({ email, rol = 'owner', naam = 'RU Eigenaar' } = {}) {
    const nu = Date.now(); const bestaand = email ? (await pool.query(`SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1`, [email])).rows[0] : null;
    if (bestaand) return String(bestaand.id);
    const id = randomUUID();
    await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['users', id, { email: email || `ru-${id.slice(0, 6)}@example.test`, sub: `ru-${id.slice(0, 6)}`, name: naam, picture: '', role: rol, status: 'approved', accessLevel: 'full', entitlements: [], createdAt: nu, updatedAt: nu }]);
    return id;
  }
  async function sessieVoor(userId, o = {}) {
    const id = randomUUID(), token = randomBytes(32).toString('base64url'); sessies.push(id); const nu = Date.now();
    await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['owner_service_sessions_v1', id, { tokenHash: sha(token), userId, service: 'hub', sourceOrigin: 'https://hub.tarasevych.com', tabHash: sha('ecosystem'), createdAt: nu, authenticatedAt: nu, lastSeenAt: nu, idleExpiresAt: o.verlopen ? nu - 1000 : nu + 864e5, absoluteExpiresAt: o.verlopen ? nu - 1000 : nu + 7 * 864e5, rotation: 0, version: 1, revocationEpoch: 0, ip: '198.51.100.9', userAgent: 'e2e', authMethod: 'google', scope: 'ecosystem' }]);
    return { id, token, cookie: encodeURIComponent(`${id}.${token}`) };
  }
  const intrekken = (sid) => pool.query(`UPDATE app.records SET data = data || jsonb_build_object('revokedAt', $2::bigint) WHERE tbl='owner_service_sessions_v1' AND id=$1`, [sid, Date.now()]);
  const verlopen = (sid) => pool.query(`UPDATE app.records SET data = data || jsonb_build_object('idleExpiresAt', $2::bigint, 'absoluteExpiresAt', $2::bigint) WHERE tbl='owner_service_sessions_v1' AND id=$1`, [sid, Date.now() - 1000]);
  const vlag = async (sleutel, aan, users = []) => { await pool.query(`UPDATE app.feature_flags SET aan=$1, gebruikers=$2 WHERE sleutel=$3`, [aan, aan ? users : [], sleutel]); await new Promise((r) => setTimeout(r, 3300)); };
  const opruimen = async (uids) => { for (const u of uids) await pool.query(`DELETE FROM app.records WHERE (tbl='owner_service_sessions_v1' AND data->>'userId'=$1) OR (tbl='site_notifications' AND data->>'recipientUserId'=$1)`, [u]).catch(() => undefined); };
  return { gebruiker, sessieVoor, intrekken, verlopen, vlag, opruimen, sessies };
}

// ── TOTP (RFC 6238) en stap-op via het echte venster «Підтвердіть доступ» ──
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function totpHulp() {
  const geheim = Array.from(randomBytes(20), (b) => B32[b & 31]).join('');
  const dec = (s) => { let bits = '', out = []; for (const c of s) bits += B32.indexOf(c).toString(2).padStart(5, '0'); for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
  const code = (stap) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(stap)); const h = createHmac('sha1', dec(geheim)).update(b).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0'); };
  let laatste = Math.floor(Date.now() / 30000); // nooit de stap van een vorige run hergebruiken (server weigert een gebruikte code: 400)
  const codeNu = async () => { let s = Math.floor(Date.now() / 30000); while (s <= laatste) { await new Promise((r) => setTimeout(r, 1000)); s = Math.floor(Date.now() / 30000); } laatste = s; return code(s); };
  async function zaai(pool, uid) { await pool.query(`DELETE FROM app.records WHERE tbl='identity_totp_v1' AND data->>'userId'=$1`, [uid]); await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['identity_totp_v1', randomUUID(), { userId: uid, secret: geheim, confirmed: true, createdAt: Date.now(), updatedAt: Date.now() }]); }
  async function stapOp(page, ms = 4000) {
    const veld = page.locator('#bevestig-toegang-code');
    try { await veld.waitFor({ state: 'visible', timeout: ms }); } catch { return false; }
    await veld.fill(''); await veld.pressSequentially(await codeNu(), { delay: 30 }); await veld.press('Enter', { timeout: 3000 }).catch(() => undefined); // het venster kan zichzelf al na 6 cijfers sluiten
    await veld.waitFor({ state: 'detached', timeout: 8000 }).catch(() => undefined); return true;
  }
  return { zaai, stapOp };
}

// ── UI-hulp: accountmenu, ruimte wisselen ──
export const menu = async (page) => { if (!(await page.locator('.canonical-avatar-trigger').first().isVisible().catch(() => false))) { await page.click('.canonical-menu-toggle').catch(() => undefined); await page.waitForTimeout(500); } if ((await page.getAttribute('.canonical-avatar-trigger', 'aria-expanded').catch(() => null)) !== 'true') await page.click('.canonical-avatar-trigger').catch(() => undefined); await page.waitForTimeout(400); };
export const wachtShell = (page) => page.waitForSelector('.canonical-avatar-trigger, .canonical-menu-toggle', { timeout: 25000, state: 'attached' }).catch(() => undefined);
/** In de pagina een API-verzoek doen zoals de client (tabContext uit sessionStorage). */
export const inPagina = (page, pad, body = {}, dienst = 'hub') => page.evaluate(async ([pad, body, dienst]) => { const tab = sessionStorage.getItem('tsv-tab-context') || Object.values(sessionStorage).find((v) => /^[0-9a-f]{48}$/.test(v)) || ''; const r = await fetch(pad, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: dienst, tabContext: tab, sourceOrigin: location.origin, ...body }) }); const tekst = await r.text(); let d = {}; try { d = JSON.parse(tekst); } catch {} return { status: r.status, data: d, tekst, kop: Object.fromEntries(r.headers.entries()) }; }, [pad, body, dienst]);
