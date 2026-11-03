// Directe URL naar technische pagina's en API's moet geblokkeerd zijn (401/403, geen gegevens in het antwoord). ALLEEN LOKAAL.
// Gevallen: geen sessie · verlopen hoofdsessie · ingetrokken hoofdsessie · technische sessie waarvan de hoofdsessie eindigde ·
// andere gebruiker (zonder technisch profiel) · vlag uit (eigenaar zonder lopende technische sessie).
// Gebruik: eval "$(scripts/lokaal-e2e/ruimtes-start.sh | tail -1)"; node scripts/lokaal-e2e/ruimtes-directe-url.mjs
import https from 'node:https'; import { randomUUID } from 'node:crypto';
import { alleenLokaal, verslag, startBrowser, context, gegevens, totpHulp, menu, wachtShell, inPagina, pg, POORT, COOKIE, geblokt } from './ruimtes-gemeen.mjs';
alleenLokaal();
const { check, sluit } = verslag('ruimtes-directe-url');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); const G = gegevens(pool); const T = totpHulp();
const K = 'ТЕХНІЧНЕ-МІТКА'; const EMAIL = process.env.OWNER_EMAIL || 'ru-eigenaar@example.test';
const PAGINAS = [['admin', '/'], ['admin', '/updates'], ['admin', '/gebruikers'], ['api', '/']];
const APIS = [['admin', '/api/owner/admin/overview', 'admin'], ['admin', '/api/owner/uitrol/overzicht', 'admin'], ['admin', '/api/owner/admin/diagnostiek/overzicht', 'admin'], ['hub', '/api/owner/hub/tech/ruimtes/toegang', 'hub'], ['hub', '/api/owner/hub/werkblad/tech', 'hub']];
/** Rechtstreeks verzoek naar de lokale proxy (zoals een browser met een getypte URL), met optionele sessiecookie. */
function verzoek(host, pad, { cookie, methode = 'GET', body } = {}) {
  return new Promise((ok) => { const data = body ? JSON.stringify(body) : undefined;
    const q = https.request({ host: '127.0.0.1', port: Number(POORT), servername: `${host}.tarasevych.com`, rejectUnauthorized: false, path: pad, method: methode, headers: { host: `${host}.tarasevych.com`, origin: `https://${host}.tarasevych.com`, ...(cookie ? { cookie: `${COOKIE}=${cookie}` } : {}), ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) } }, (r) => { let t = ''; r.on('data', (c) => (t += c)); r.on('end', () => ok({ status: r.statusCode, tekst: t, kop: r.headers })); });
    q.on('error', (e) => ok({ status: 0, tekst: String(e), kop: {} })); if (data) q.write(data); q.end(); });
}
const geenGegevens = (r) => !r.tekst.includes(K) && !/"items"\s*:\s*\[\s*\{|"rows"\s*:\s*\[\s*\{|"users"\s*:\s*\[\s*\{/.test(r.tekst);
async function geval(naam, cookie) {
  for (const [host, pad, dienst] of APIS) {
    const r = await verzoek(host, pad, { cookie, methode: 'POST', body: { service: dienst, tabContext: 'a'.repeat(48), sourceOrigin: `https://${host}.tarasevych.com` } });
    check(`${naam}: API ${host}${pad} → 401/403 zonder gegevens`, (r.status === 401 || r.status === 403) && geenGegevens(r), `status=${r.status} lengte=${r.tekst.length} begin=${r.tekst.slice(0, 120)}`);
  }
  for (const [host, pad] of PAGINAS) {
    const r = await verzoek(host, pad, { cookie });
    check(`${naam}: pagina ${host}${pad} → 401/403 (geen technische HTML)`, r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400 && !/admin\./.test(String(r.kop.location || ''))), `status=${r.status} location=${r.kop.location || ''}`, 'pagina');
    check(`${naam}: pagina ${host}${pad} bevat geen technische gegevens`, geenGegevens(r), `lengte=${r.tekst.length}`);
  }
}
let uid, uid2;
try {
  uid = await G.gebruiker({ email: EMAIL }); uid2 = await G.gebruiker({ rol: 'user', naam: 'RU Vreemd' }); await T.zaai(pool, uid);
  await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['site_notifications', randomUUID(), { recipientUserId: uid, recipientEmail: EMAIL, kind: 'uitrol.mislukt', title: `${K} directe-url`, message: K, read: false, createdAt: Date.now(), ruimte: 'technisch', sfeer: 'technisch' }]);
  await G.vlag('tech-ruimtes-v2', true, [uid]); await G.vlag('ruimtes-scheiding', process.env.RU_SCHEIDING === '1', [uid]);
  // 1–3: geen sessie, verlopen, ingetrokken
  await geval('geen sessie', undefined);
  const sv = await G.sessieVoor(uid, { verlopen: true }); await geval('verlopen hoofdsessie', sv.cookie);
  const si = await G.sessieVoor(uid); await G.intrekken(si.id); await geval('ingetrokken hoofdsessie', si.cookie);
  // 5: andere gebruiker zonder technisch profiel
  const sa = await G.sessieVoor(uid2); await geval('andere gebruiker', sa.cookie);
  // 6: vlag uit, eigenaar zonder technische sessie
  await G.vlag('tech-ruimtes-v2', false); const sf = await G.sessieVoor(uid); await geval('vlag uit, geen technische sessie', sf.cookie);
  await G.vlag('tech-ruimtes-v2', true, [uid]); const sg = await G.sessieVoor(uid); await geval('vlag aan, eigenaar zonder technische sessie', sg.cookie);
  // 4: technische sessie echt gestart (TOTP), daarna hoofdsessie beëindigd → zelfde tabblad, zelfde cookie
  const browser = await startBrowser(); const s = await G.sessieVoor(uid); const { ctx, page } = await context(browser, s);
  await page.goto('https://hub.tarasevych.com/', { waitUntil: 'domcontentloaded' }); await wachtShell(page); await page.waitForTimeout(1500);
  await menu(page); await page.click('[data-ruimtes-menu] .rw [data-naar="technisch"]').catch(() => undefined);
  await page.waitForSelector('[data-tech-venster="ruimte-start"]', { timeout: 15000, state: 'attached' }).catch(() => undefined);
  await page.click('.rs-chip[data-minuten="60"]').catch(() => undefined); if (await page.locator('[data-rs-reden]').count()) await page.fill('[data-rs-reden]', 'E2E directe URL');
  await page.click('[data-tech-knop="ruimte-start"]').catch(() => undefined); await T.stapOp(page, 5000); await page.waitForSelector('.tech-band', { timeout: 8000 }).catch(() => undefined);
  const voor = await inPagina(page, '/api/owner/hub/tech/ruimtes/toegang', {}, 'hub');
  check('voorwaarde: met lopende technische sessie is de technische API bereikbaar (200)', voor.status === 200, `status=${voor.status}`);
  for (const [soort, doe] of [['ingetrokken', () => G.intrekken(s.id)], ['verlopen', () => G.verlopen(s.id)]]) {
    await doe(); await page.waitForTimeout(500);
    const na = await inPagina(page, '/api/owner/hub/tech/ruimtes/toegang', {}, 'hub');
    check(`technische sessie, hoofdsessie ${soort}: technische API → 401/403 zonder gegevens`, (na.status === 401 || na.status === 403) && !na.tekst.includes(K), `status=${na.status} ${na.tekst.slice(0, 100)}`);
    const r = await verzoek('admin', '/api/owner/admin/overview', { cookie: s.cookie, methode: 'POST', body: { service: 'admin', tabContext: 'a'.repeat(48), sourceOrigin: 'https://admin.tarasevych.com' } });
    check(`technische sessie, hoofdsessie ${soort}: admin-API rechtstreeks → 401/403`, r.status === 401 || r.status === 403, `status=${r.status}`);
    await pool.query(`UPDATE app.records SET data = data - 'revokedAt' || jsonb_build_object('idleExpiresAt', $2::bigint, 'absoluteExpiresAt', $2::bigint) WHERE tbl='owner_service_sessions_v1' AND id=$1`, [s.id, Date.now() + 864e5]);
  }
  await ctx.close(); await browser.close();
} catch (e) { check('suite liep zonder uitzondering', false, e.stack); }
finally {
  if (uid) await G.opruimen([uid, uid2]); if (uid2) await pool.query(`DELETE FROM app.records WHERE tbl='users' AND id=$1`, [uid2]).catch(() => undefined);
  await pool.query(`UPDATE app.feature_flags SET aan=false, gebruikers='{}' WHERE sleutel IN ('tech-ruimtes-v2','ruimtes-scheiding')`).catch(() => undefined); await pool.end();
}
check(`0 verzoeken naar andere hosts (${geblokt.length})`, geblokt.length === 0);
process.exit(sluit());
