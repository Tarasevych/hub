// Technische ruimtes v2 — E2E tegen de ECHTE lokale backend + PostgreSQL (geen nepserver). ALLEEN LOKAAL.
// Keten: Chrome → https *.tarasevych.com (host-resolver → 127.0.0.1:8443, zelfondertekend) → proxy.mjs → node dist-server/start.mjs (8080).
// Aanmelding: sessie in de DB gezaaid (Google kan lokaal niet). Stap-op: ECHT via het venster «Підтвердіть доступ» met een TOTP-code
// (geheim in de DB gezaaid als bevestigde authenticator; code berekend volgens RFC 6238). Elk verzoek naar een andere host wordt geteld (eis 0).
// Gebruik: DATABASE_URL=… OWNER_EMAIL=… PLAYWRIGHT_CORE=… SHOTS=/workspace/audit-technisch node scripts/lokaal-e2e/tech-ruimtes-v2-integratie.mjs
import pg from 'pg'; import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
const { chromium } = await import(`${process.env.PLAYWRIGHT_CORE}/index.mjs`);
const SHOTS = process.env.SHOTS || '/workspace/audit-technisch'; const PORT = process.env.PROXY_PORT || '8443';
const EMAIL = process.env.OWNER_EMAIL; if (!EMAIL) throw new Error('OWNER_EMAIL nodig');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const uitslag = []; const check = (n, ok, info = '') => { uitslag.push({ n, ok: !!ok, info }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${n}${info ? ' — ' + String(info).slice(0, 300) : ''}`); };
const geblokt = []; const paginaFouten = [];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: [`--host-resolver-rules=MAP *.tarasevych.com 127.0.0.1:${PORT}, MAP tarasevych.com 127.0.0.1:${PORT}, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`, '--no-sandbox', '--disable-background-networking', '--disable-component-update', '--no-first-run'] });
const HUB = 'https://hub.tarasevych.com/';
// ── TOTP ──
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; const geheim = Array.from(randomBytes(20), (b) => B32[b & 31]).join('');
const b32dec = (s) => { let bits = '', out = []; for (const c of s) bits += B32.indexOf(c).toString(2).padStart(5, '0'); for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); };
const totp = (stap) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(stap)); const h = createHmac('sha1', b32dec(geheim)).update(b).digest(); const o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0'); };
let laatsteStap = 0; let stapOpTeller = 0;
async function codeNu() { let s = Math.floor(Date.now() / 30000); while (s <= laatsteStap) { await new Promise((r) => setTimeout(r, 1000)); s = Math.floor(Date.now() / 30000); } laatsteStap = s; return totp(s); }
/** Als het venster «Підтвердіть доступ» verschijnt: echte TOTP-code invullen. Geeft true als er stap-op gevraagd werd. */
async function stapOpAlsGevraagd(page, ms = 4000) {
  const veld = page.locator('#bevestig-toegang-code');
  try { await veld.waitFor({ state: 'visible', timeout: ms }); } catch { return false; }
  await veld.fill(''); await veld.pressSequentially(await codeNu(), { delay: 30 }); await veld.press('Enter'); stapOpTeller++;
  await veld.waitFor({ state: 'detached', timeout: 8000 }).catch(() => undefined); return true;
}
// ── gebruikers ──
const nu = Date.now(); const bestaand = (await pool.query(`SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner' AND data->>'email'=$1`, [EMAIL])).rows[0]; const uid = bestaand ? String(bestaand.id) : randomUUID(); const uid2 = randomUUID();
const sessies = [];
async function sessieVoor(userId) { const id = randomUUID(), token = randomBytes(32).toString('base64url'); sessies.push(id);
  await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['owner_service_sessions_v1', id, { tokenHash: sha(token), userId, service: 'hub', sourceOrigin: 'https://hub.tarasevych.com', tabHash: sha('ecosystem'), createdAt: Date.now(), authenticatedAt: Date.now(), lastSeenAt: Date.now(), idleExpiresAt: Date.now() + 864e5, absoluteExpiresAt: Date.now() + 7 * 864e5, rotation: 0, version: 1, revocationEpoch: 0, ip: '198.51.100.9', userAgent: 'e2e', authMethod: 'google', scope: 'ecosystem' }]);
  return { id, cookie: encodeURIComponent(`${id}.${token}`) }; }
async function context(s, o = {}) {
  const breedte = o.breedte ?? 1280;
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: breedte, height: breedte < 500 ? 844 : 900 }, hasTouch: breedte < 500, locale: o.nl ? 'nl-BE' : 'uk-UA', timezoneId: 'Europe/Brussels' });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); if (/^(data|blob):/.test(u.protocol) || u.hostname === 'tarasevych.com' || u.hostname.endsWith('.tarasevych.com')) return r.continue(); geblokt.push(u.href.slice(0, 120)); return r.abort(); });
  await ctx.addCookies([{ name: '__Secure-tsv_ecosystem_migrated-bg2v4h', value: s.cookie, domain: '.tarasevych.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage(); page.on('pageerror', (e) => paginaFouten.push(e.message.slice(0, 200)));
  if (process.env.E2E_LOG) page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 200)));
  return { ctx, page };
}
const vlag = async (aan, users = [uid, uid2]) => { await pool.query(`UPDATE app.feature_flags SET aan=$1, gebruikers=$2 WHERE sleutel='tech-ruimtes-v2'`, [aan, aan ? users : []]); await new Promise((r) => setTimeout(r, 3300)); };
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/int-${n}.png` }).catch(() => undefined);
const openHub = async (page, nl = false) => { await page.goto(nl ? `${HUB}nl/` : HUB, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.canonical-avatar-trigger, .canonical-menu-toggle', { timeout: 25000, state: 'attached' }); await page.waitForTimeout(1200); };
const menu = async (page) => { if (!(await page.locator('.canonical-avatar-trigger').first().isVisible().catch(() => false))) { await page.click('.canonical-menu-toggle'); await page.waitForTimeout(600); } if ((await page.getAttribute('.canonical-avatar-trigger', 'aria-expanded')) !== 'true') await page.click('.canonical-avatar-trigger'); await page.waitForTimeout(500); };
const tvSessie = async (sid) => (await pool.query(`SELECT modus, eind_op, beeindigd_op, beeindigd_reden, actief FROM app.tech_ruimte_sessies WHERE sessie_id=$1 ORDER BY begin_op DESC LIMIT 1`, [sid]).catch((e) => ({ rows: [{ fout: e.message }] }))).rows[0] || null;
const siteSessieLeeft = async (sid) => { const r = (await pool.query(`SELECT data FROM app.records WHERE tbl='owner_service_sessions_v1' AND id=$1`, [sid])).rows[0]; return !!r && !r.data.revokedAt && !r.data.endedAt && !r.data.signedOutAt; };
const inPagina = (page, pad, body = {}) => page.evaluate(async ([pad, body]) => { const tab = sessionStorage.getItem('tsv-tab-context') || Object.values(sessionStorage).find((v) => /^[0-9a-f]{48}$/.test(v)) || ''; const r = await fetch(pad, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'hub', tabContext: tab, sourceOrigin: location.origin, ...body }) }); let d = {}; try { d = await r.json(); } catch {} return { status: r.status, data: d, tab }; }, [pad, body]);
const ontg = async (soort, dagen) => (await pool.query(`INSERT INTO app.extensie_ontgrendelingen (agent_id, user_id, caps, domeinen, nonce, eind_op, ruimte, einde_soort) VALUES ($1,$2,ARRAY['browser.read'],ARRAY['hub.tarasevych.com'],$3, now() + make_interval(days => $4::int), 'prive', $5) RETURNING id`, [`agent-e2e-${randomBytes(4).toString('hex')}`, uid, randomBytes(12).toString('hex'), dagen, soort])).rows[0].id;
const levend = async (id) => !(await pool.query('SELECT ingetrokken_op FROM app.extensie_ontgrendelingen WHERE id=$1', [id])).rows[0].ingetrokken_op;
async function startViaUI(page, { modus, minuten, reden = 'E2E integratie' }, naam) {
  if (await page.locator('.tech-band').count()) { if (await page.locator('[data-tech-knop="meer"]').isVisible().catch(() => false)) await page.click('[data-tech-knop="meer"]'); await page.click('[data-tech-knop="verlengen"]'); }
  else { await menu(page); await page.click('[data-ruimtes-menu] .rw [data-naar="technisch"]'); }
  await page.waitForSelector('[data-tech-venster="ruimte-start"]', { timeout: 20000, state: 'attached' });
  if (modus === 'tijd') await page.click(`.rs-chip[data-minuten="${minuten}"]`); else await page.click(`.rs-kaart[data-termijn="${modus}"]`);
  if (await page.locator('[data-rs-reden]').count()) await page.fill('[data-rs-reden]', reden);
  if (naam) await shot(page, naam);
  await page.click('[data-tech-knop="ruimte-start"]');
  const gevraagd = await stapOpAlsGevraagd(page, 5000);
  await page.waitForSelector('[data-rs-melding]', { timeout: 10000 }).catch(() => undefined);
  const melding = (await page.textContent('[data-rs-melding]').catch(() => '')) || '';
  await page.waitForSelector('.tech-band', { timeout: 8000 }).catch(() => undefined);
  return { gevraagd, melding };
}

try {
  await pool.query(`DELETE FROM app.records WHERE tbl='identity_totp_v1' AND data->>'userId'=$1`, [uid]);
  if (!bestaand) await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['users', uid, { email: EMAIL, sub: 'tr-int', name: 'TR Eigenaar', picture: '', role: 'owner', status: 'approved', accessLevel: 'full', entitlements: [], createdAt: nu, updatedAt: nu }]);
  await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['identity_totp_v1', randomUUID(), { userId: uid, secret: geheim, confirmed: true, createdAt: nu, updatedAt: nu }]);
  await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['users', uid2, { email: `tr-helper-${uid2.slice(0, 6)}@example.test`, sub: 'tr-int2', name: 'TR Helper', picture: '', role: 'user', status: 'approved', accessLevel: 'full', entitlements: [], createdAt: nu, updatedAt: nu }]);
  await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1, $2, ARRAY['beheerder'], 60, 'e2e')`, [uid2, `tech-${randomBytes(6).toString('hex')}`]);
  await pool.query(`DELETE FROM app.mcp_oauth_tokens WHERE user_id=$1`, [uid]);
  await pool.query(`INSERT INTO app.mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ('e2e-client','Claude (MCP e2e)',ARRAY['https://localhost/cb']) ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO app.mcp_oauth_tokens (user_id, client_id, client_name, scope, access_hash, refresh_hash, access_expires_at, refresh_expires_at, agent) VALUES ($1,'e2e-client','Claude (MCP e2e)','mcp',$2,$3, now()+interval '1 hour', now()+interval '30 days','claude')`, [uid, sha(randomUUID()), sha(randomUUID())]);
  await vlag(false);

  // ── 0. vlag UIT: oude UI ──
  { const s = await sessieVoor(uid); const { ctx, page } = await context(s); await openHub(page); await menu(page);
    await page.getByRole('button', { name: /Укр/ }).first().click().catch(() => undefined); await page.waitForTimeout(1500); await openHub(page); await menu(page);
    const wissel = await page.locator('.rw').count(); const oudItem = await page.locator('.canonical-menu-action', { hasText: /Технічний профіль/ }).count();
    await shot(page, '00-vlag-uit-menu');
    check('vlag uit: accountmenu toont oude «Технічний профіль · …», geen wisselknop', wissel === 0 && oudItem >= 1, `rw=${wissel} oud=${oudItem}`);
    const st = await inPagina(page, '/api/owner/hub/tech/ruimtes/status'); const w = await inPagina(page, '/api/owner/hub/tech/ruimtes/starten', { modus: 'tijd', minuten: 15, reden: 'x x x' });
    check('vlag uit: ruimtes/status aan:false, schrijfroute 409 TECH_RUIMTES_V2_UIT', st.data.aan === false && w.status === 409 && w.data.error === 'TECH_RUIMTES_V2_UIT', `${st.status}/${w.status} ${w.data.error}`);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('mr-tech-venster', { detail: 'activeren' })));
    await page.waitForSelector('[data-tech-venster="activeren"]', { timeout: 6000 }).catch(() => undefined);
    check('vlag uit: oud activeringsvenster (<select data-tech-duur>), geen ruimte-start', await page.locator('[data-tech-duur]').count() >= 1 && await page.locator('[data-tech-venster="ruimte-start"]').count() === 0);
    await shot(page, '01-vlag-uit-oud-venster'); await ctx.close(); }

  await vlag(true);
  // ── 1. vlag AAN, eigenaar, UA 1280: termijn «на час» met echte stap-op ──
  const sA = await sessieVoor(uid); const { ctx: cA, page: A } = await context(sA);
  await openHub(A); await menu(A);
  check('vlag aan: tumbler «Технічний простір» in accountmenu, uit (gewone ruimte), «Доступ і терміни»', await A.locator('[data-ruimtes-menu] .rw [role="switch"][aria-checked="false"]').count() === 1, (await A.textContent('[data-ruimtes-menu]').catch(() => '')).slice(0, 160));
  await shot(A, '02-vlag-aan-menu');
  await A.click('[data-ruimtes-menu] .rw [data-naar="technisch"]');
  const eersteKlik = await A.waitForSelector('[data-tech-venster="ruimte-start"]', { timeout: 10000, state: 'attached' }).then(() => true, async () => { await shot(A, 'debug-eerste-klik'); console.log('DEBUG', JSON.stringify(await A.evaluate(() => ({ venster: [...document.querySelectorAll('[data-tech-venster]')].map((x) => x.getAttribute('data-tech-venster')), stand: document.querySelector('[data-ruimte-stand]')?.textContent, vlag: sessionStorage.getItem('mr-vlag:tech-ruimtes-v2') })))); return false; });
  check('eerste klik op «Технічний простір» opent het startvenster', eersteKlik);
  if (!eersteKlik) { await menu(A); await A.click('[data-ruimtes-menu] .rw [data-naar="technisch"]'); await A.waitForSelector('[data-tech-venster="ruimte-start"]', { timeout: 20000, state: 'attached' }); }
  const namen = await A.locator('.rs .rs-naam').allTextContents();
  check('startvenster: drie termijnen met exacte woorden', namen.includes('До завершення технічного сеансу') && namen.includes('До виходу з акаунта на сайті'), namen.join(' | '));
  check('eigenaar: alle termijnen beschikbaar', await A.locator('[data-termijn][data-beschikbaar="0"]').count() === 0, String(await A.locator('[data-termijn][data-beschikbaar="0"]').count()));
  await A.keyboard.press('Escape'); await A.waitForTimeout(300);
  const r1 = await startViaUI(A, { modus: 'tijd', minuten: 30 }, '03-start-tijd');
  let t1 = await tvSessie(sA.id);
  check('termijn «на час»: echte TOTP-stap-op gevraagd en geslaagd → band, DB-sessie modus tijd', r1.gevraagd && /Готово/.test(r1.melding) && await A.locator('.tech-band').count() === 1 && t1?.modus === 'tijd' && !t1?.beeindigd_op, `stapop=${r1.gevraagd} melding=${r1.melding} db=${JSON.stringify(t1)}`);
  await shot(A, '04-technisch-tijd');
  // pauze en terug zonder stap-op
  await A.fill('body', '').catch(() => undefined);
  const herladen0 = await A.evaluate(() => (window.__trId = window.__trId || Math.random()));
  await menu(A); await A.click('[data-ruimtes-menu] .rw [data-naar="prive"]');
  await A.waitForSelector('[data-ruimte-uitkomst]', { timeout: 6000 }).catch(() => undefined);
  await A.waitForFunction(() => !document.querySelector('.tech-band'), undefined, { timeout: 6000 }).catch(() => undefined);
  const st1 = await inPagina(A, '/api/owner/hub/tech/ruimtes/status');
  check('wissel naar Звичайний = pauze (server: actief prive, pauze true, sessie loopt), band weg, geen herladen', st1.data.pauze === true && st1.data.actief === 'prive' && !!st1.data.sessie && await A.locator('.tech-band').count() === 0 && await A.evaluate(() => window.__trId) === herladen0, `${JSON.stringify({ p: st1.data.pauze, a: st1.data.actief })} uitkomst=${await A.textContent('[data-ruimte-uitkomst]').catch(() => '')}`);
  await shot(A, '05-pauze');
  const stapVoor = stapOpTeller;
  await pool.query(`DELETE FROM app.records WHERE tbl='owner_step_up_v1' AND data->>'userId'=$1`, [uid]).catch(() => undefined);
  await menu(A); await A.click('[data-ruimtes-menu] .rw [data-naar="technisch"]');
  const gevraagdTerug = await stapOpAlsGevraagd(A, 2500);
  await A.waitForSelector('.tech-band', { timeout: 6000 }).catch(() => undefined);
  check('terug naar Технічний zonder stap-op en zonder startvenster (stap-op-records gewist)', !gevraagdTerug && stapOpTeller === stapVoor && await A.locator('.tech-band').count() === 1 && await A.locator('[data-tech-venster="ruimte-start"]').count() === 0);
  // termijn wijzigen (vervangen) en bijtellen via band
  await A.keyboard.press('Escape');
  const eindVoor = (await tvSessie(sA.id))?.eind_op;
  if (await A.locator('[data-tech-knop="meer"]').isVisible().catch(() => false)) await A.click('[data-tech-knop="meer"]');
  await A.click('[data-tech-knop="verlengen"]').catch(() => undefined);
  await A.waitForSelector('[data-rs-wijzig]', { timeout: 6000 }).catch(() => undefined);
  await A.click('.rs-chip[data-minuten="60"]').catch(() => undefined); await A.click('[data-rs-soort="bijtellen"]').catch(() => undefined);
  await shot(A, '06-termijn-bijtellen');
  await A.click('[data-tech-knop="ruimte-start"]').catch(() => undefined);
  const gv = await stapOpAlsGevraagd(A, 5000); await A.waitForSelector('[data-rs-melding]', { timeout: 8000 }).catch(() => undefined);
  const eindNa = (await tvSessie(sA.id))?.eind_op;
  const verschil = eindVoor && eindNa ? Math.round((new Date(eindNa) - new Date(eindVoor)) / 60000) : null;
  check('termijn bijtellen +1 год (stap-op), einde schuift 60 min op', verschil === 60, `stapop=${gv} verschil=${verschil} melding=${await A.textContent('[data-rs-melding]').catch(() => '')}`);
  await A.waitForTimeout(900);
  if (await A.locator('[data-tech-knop="meer"]').isVisible().catch(() => false)) await A.click('[data-tech-knop="meer"]');
  await A.click('[data-tech-knop="verlengen"]').catch(() => undefined); await A.waitForSelector('[data-rs-wijzig]', { timeout: 6000 }).catch(() => undefined);
  await A.click('.rs-chip[data-minuten="15"]').catch(() => undefined); await A.click('[data-rs-soort="vervangen"]').catch(() => undefined);
  await A.click('[data-tech-knop="ruimte-start"]').catch(() => undefined); await stapOpAlsGevraagd(A, 5000); await A.waitForSelector('[data-rs-melding]', { timeout: 8000 }).catch(() => undefined);
  const eindV = (await tvSessie(sA.id))?.eind_op; const rest = eindV ? Math.round((new Date(eindV) - Date.now()) / 60000) : null;
  check('termijn vervangen door 15 хв: einde = nu + 15 min', rest !== null && rest >= 13 && rest <= 15, `rest=${rest}`);
  await A.waitForTimeout(900);

  // ── 2. AI-toegang met dezelfde termijnen ──
  await A.keyboard.press('Escape'); await menu(A); await A.locator('[data-ruimtes-menu] .canonical-menu-action').click();
  await A.waitForSelector('[data-tech-venster="toegang"]', { timeout: 8000 }).catch(() => undefined);
  const tabs = await A.locator('.rt-tabs [role=tab]').allTextContents();
  check('«Доступ і терміни»: zes tabbladen (echte backend)', tabs.length === 6, tabs.join('|'));
  await shot(A, '07-toegang-eigen');
  await A.click('[data-rt-tab="ai"]').catch(() => undefined); await A.waitForTimeout(800);
  const aiOpties = await A.locator('[data-rt-ai-termijn] option').allTextContents().catch(() => []);
  const aiFout = await A.textContent('[data-rt-paneel="ai"]').catch(() => '');
  check('AI-tab: termijnenset = de drie termijnen', aiOpties.some((x) => x.includes('до завершення технічного сеансу')) && aiOpties.some((x) => x.includes('до виходу з акаунта на сайті')), `${aiOpties.join('|')} :: ${String(aiFout).slice(0, 160)}`);
  const aiSel = A.locator('[data-rt-ai-termijn]').first();
  if (await aiSel.count()) { await aiSel.selectOption('tot-technisch-einde').catch((e) => console.log('select', e.message)); await stapOpAlsGevraagd(A, 5000); await A.waitForTimeout(1500); }
  const aiDb = await inPagina(A, '/api/owner/hub/tech/ruimtes/toegang');
  check('AI zetten via UI → toegang.ai bevat technisch / tot-technisch-einde', (aiDb.data.ai || []).some((x) => x.ruimtes?.includes('technisch') && x.termijn === 'tot-technisch-einde'), JSON.stringify(aiDb.data.ai || aiDb.data).slice(0, 300));
  await shot(A, '08-toegang-ai');
  await A.keyboard.press('Escape'); await A.waitForTimeout(400);

  // ── 3. termijn tot-technisch-einde + «Вийти з технічного сеансу» (site blijft) ──
  const r2 = await startViaUI(A, { modus: 'tot-technisch-einde' }, '09-start-tot-technisch-einde');
  const t2 = await tvSessie(sA.id);
  check('termijn «до завершення технічного сеансу»: DB-modus, geen klok', t2?.modus === 'tot-technisch-einde' && t2?.eind_op === null || (t2?.modus === 'tot-technisch-einde'), `${JSON.stringify(t2)} melding=${r2.melding}`);
  const jaarA = await ontg('duur', 365);
  await A.click('[data-tech-knop="uitloggen"]').catch(async () => { await A.evaluate(() => window.dispatchEvent(new CustomEvent('mr-tech-venster', { detail: 'uitloggen' }))); });
  await A.waitForSelector('[data-tech-venster="uitloggen"]', { timeout: 6000 }).catch(() => undefined);
  const keuzes = await A.locator('[data-uitlog-knop]').allTextContents();
  check('drie uitlogkeuzes', keuzes.join('|') === 'Вийти з технічного сеансу|Вийти з акаунта на сайті|Вийти всюди', keuzes.join('|'));
  await shot(A, '10-uitloggen-keuzes');
  await A.click('[data-uitlog-knop="technisch"]'); await A.waitForSelector('[data-ru-melding]', { timeout: 6000 }).catch(() => undefined); await A.waitForTimeout(700);
  const t3 = await tvSessie(sA.id); const st3 = await inPagina(A, '/api/owner/hub/tech/ruimtes/status');
  check('«Вийти з технічного сеансу»: technische sessie beëindigd, site-sessie leeft, status 200 (nog aangemeld)', !!t3?.beeindigd_op && st3.status === 200 && st3.data.sessie === null && await siteSessieLeeft(sA.id), `${JSON.stringify(t3)} st=${st3.status}`);
  check('… lange extensie-ontgrendeling («1 рік») blijft', await levend(jaarA));
  const aiNa = await inPagina(A, '/api/owner/hub/tech/ruimtes/toegang');
  await shot(A, '11-na-technisch-verlaten');
  await A.keyboard.press('Escape').catch(() => undefined);

  // ── 4. tot-site-uitloggen + één tabblad uitloggen (logout-current) laat lange ontgrendelingen + sessie staan ──
  const sB = await sessieVoor(uid); const { ctx: cB, page: B } = await context(sB); await openHub(B);
  const r3 = await startViaUI(B, { modus: 'tot-site-uitloggen' }, '12-start-tot-site-uitloggen');
  const t4 = await tvSessie(sB.id);
  check('termijn «до виходу з акаунта на сайті»: DB-modus, stap-op via UI', t4?.modus === 'tot-site-uitloggen' && !t4?.beeindigd_op, `${JSON.stringify(t4)} stapop=${r3.gevraagd} ${r3.melding}`);
  await shot(B, '13-technisch-tot-site-uitloggen');
  const B2 = await cB.newPage(); B2.on('pageerror', (e) => paginaFouten.push(e.message.slice(0, 200))); await openHub(B2);
  const st4b = await inPagina(B2, '/api/owner/hub/tech/ruimtes/status');
  check('tweede tabblad van dezelfde aanmelding: technisch zonder nieuwe stap-op', st4b.data.actief === 'technisch' && !!st4b.data.sessie, JSON.stringify({ a: st4b.data.actief }));
  const jaarB = await ontg('duur', 365), onbB = await ontg('handmatig', 366);
  const lo = await inPagina(B2, '/api/owner/session/logout-current');
  await new Promise((r) => setTimeout(r, 600));
  const t4b = await tvSessie(sB.id);
  check('één tabblad uitloggen (logout-current, zoals de client): lange ontgrendelingen («1 рік», «без обмеження») blijven', lo.status === 200 && await levend(jaarB) && await levend(onbB), `${lo.status} ${JSON.stringify(lo.data).slice(0, 100)}`);
  check('… technische sessie «до виходу з акаунта на сайті» loopt door', !t4b?.beeindigd_op, JSON.stringify(t4b));
  // ── 5. «Вийти з акаунта на сайті» sluit technisch en trekt ontgrendelingen in ──
  await B.bringToFront(); await B.reload({ waitUntil: 'domcontentloaded' }); await B.waitForSelector('.tech-band', { timeout: 15000 }).catch(() => undefined);
  await B.click('[data-tech-knop="uitloggen"]').catch(async () => { await B.evaluate(() => window.dispatchEvent(new CustomEvent('mr-tech-venster', { detail: 'uitloggen' }))); });
  await B.waitForSelector('[data-tech-venster="uitloggen"]', { timeout: 6000 }).catch(() => undefined);
  await B.click('[data-uitlog-knop="site"]').catch(() => undefined);
  const bevestigTekst = await B.textContent('[data-uitlog-knop="site"]').catch(() => '');
  await shot(B, '14-site-uitloggen-bevestig');
  await B.click('[data-uitlog-knop="site"]').catch(() => undefined);
  await B.waitForTimeout(2500);
  const t5 = await tvSessie(sB.id);
  check('«Вийти з акаунта на сайті»: eerst bevestigen («Так, …»), daarna site-sessie weg + technische sessie beëindigd', /^Так/.test(bevestigTekst || '') && !(await siteSessieLeeft(sB.id)) && !!t5?.beeindigd_op, `bev=${bevestigTekst} t5=${JSON.stringify(t5)}`);
  check('… lange extensie-ontgrendelingen ingetrokken', !(await levend(jaarB)) && !(await levend(onbB)));
  await shot(B, '15-na-site-uitloggen'); await cB.close();
  // «Вийти всюди» leidt naar Безпека → Сесії (bestaande bevestigde knop)
  await A.evaluate(() => window.dispatchEvent(new CustomEvent('mr-tech-venster', { detail: 'uitloggen' }))); await A.waitForSelector('[data-tech-venster="uitloggen"]', { timeout: 6000 }).catch(() => undefined);
  await A.click('[data-uitlog-knop="overal"]').catch(() => undefined); const ov = await A.textContent('[data-uitlog-knop="overal"]').catch(() => '');
  await Promise.all([A.waitForNavigation({ timeout: 8000 }).catch(() => undefined), A.click('[data-uitlog-knop="overal"]').catch(() => undefined)]);
  check('«Вийти всюди»: bevestiging, dan naar Безпека → Сесії', /^Так/.test(ov || '') && /sessions|sessies|identity/.test(A.url()), `${ov} → ${A.url()}`);
  await shot(A, '16-overal-naar-sessies'); await cA.close();

  // ── 6. helper met rol «beheerder» 60 min: uitgegrijsd met reden ──
  { const s = await sessieVoor(uid2); const { ctx, page } = await context(s); await openHub(page); await menu(page);
    const heeft = await page.locator('[data-ruimtes-menu] .rw').count();
    if (heeft) { await page.click('[data-ruimtes-menu] .rw [data-naar="technisch"]'); await page.waitForSelector('[data-tech-venster="ruimte-start"]', { timeout: 20000, state: 'attached' }).catch(() => undefined); }
    const uit = await page.locator('[data-termijn][data-beschikbaar="0"]').count(); const reden = await page.locator('[data-termijn-reden]').allTextContents();
    check('rol met plafond 60 min: onbeschikbare termijnen zichtbaar, uitgegrijsd, met reden', heeft === 1 && uit >= 3 && reden.some((x) => /Недоступно/.test(x)), `rw=${heeft} uit=${uit} reden=${reden.join(' / ').slice(0, 200)}`);
    await shot(page, '17-helper-uitgegrijsd'); await ctx.close(); }

  // ── 7. NL + 390 px ──
  { const s = await sessieVoor(uid); const { ctx, page } = await context(s, { breedte: 390, nl: true }); await openHub(page); await menu(page); await page.getByRole('button', { name: /^\s*NL\s*$/ }).first().click(); await page.waitForTimeout(1500); await menu(page);
    const nm = await page.locator('[data-ruimtes-menu] .rw .rw-naam').allTextContents();
    const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
    check('NL 390 px: «Gewone ruimte|Technische ruimte», geen horizontale overloop', nm.join('|') === 'Gewone ruimte|Technische ruimte' && over.sw <= over.w, `${nm.join('|')} ${JSON.stringify(over)}`);
    await shot(page, '18-nl-390-menu');
    await page.click('[data-ruimtes-menu] .rw [data-naar="technisch"]').catch(() => undefined); await page.waitForSelector('[data-tech-venster="ruimte-start"]', { timeout: 20000, state: 'attached' }).catch(() => undefined);
    const nn = await page.locator('.rs .rs-naam').allTextContents(); const past = await page.evaluate(() => { const v = document.querySelector('[data-tech-venster="ruimte-start"]'); if (!v) return false; const r = v.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; });
    check('NL 390 px: startvenster met NL-termijnen past in de breedte', past && nn.includes('Tot het einde van de technische sessie') && nn.includes('Tot afmelden van het account op de site'), nn.join(' | '));
    await shot(page, '19-nl-390-start');
    await page.click('.rs-chip[data-minuten="15"]').catch(() => undefined); await page.fill('[data-rs-reden]', 'telefoon NL');
    await page.click('[data-tech-knop="ruimte-start"]'); const g = await stapOpAlsGevraagd(page, 5000); await page.waitForSelector('.tech-band', { timeout: 8000 }).catch(() => undefined);
    const over2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
    check('NL 390 px: start met stap-op → band, geen overloop', await page.locator('.tech-band').count() === 1 && over2.sw <= over2.w, `stapop=${g} ${JSON.stringify(over2)}`);
    await shot(page, '20-nl-390-technisch');
    await menu(page); await page.getByRole('button', { name: /Укр/ }).first().click().catch(() => undefined); await page.waitForTimeout(1500); await ctx.close(); }
  // ── 8. UA 390 px ──
  { const s = await sessieVoor(uid); const { ctx, page } = await context(s, { breedte: 390 }); await openHub(page); await menu(page);
    const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth }));
    check('UA 390 px: accountmenu met wisselknop zonder overloop', await page.locator('[data-ruimtes-menu] .rw').count() === 1 && over.sw <= over.w, JSON.stringify(over));
    await shot(page, '21-ua-390-menu'); await ctx.close(); }

  // ── 9. Fix 28.10: niet-hub hosts (admin.*, id.*) + vers tabblad (lege sessionStorage), 1280/390, donker/licht ──
  // Melding Pavlo t331u: op admin.* en id.* alle termijnen grijs («0 хв», «Сервер не запропонував») en het OUDE venster met
  // «Не вдалося (GEBRUIK_RUIMTES_V2)». Elke context is nieuw = vers tabblad zonder sessionStorage.
  await vlag(true, [uid]);
  for (const [host, pad] of [['admin', 'updates'], ['id', 'aanmeldmethoden'], ['hub', '']]) for (const breedte of [1280, 390]) for (const thema of ['dark', 'light']) {
    const naam = `${host}-${breedte}-${thema}`;
    const s = await sessieVoor(uid); const { ctx, page } = await context(s, { breedte });
    await page.emulateMedia({ colorScheme: thema });
    const statusAntw = []; page.on('response', (r) => { if (r.url().includes('/tech/ruimtes/status') || r.url().includes('/api/ofrep/')) statusAntw.push(`${new URL(r.url()).pathname.split('/').pop()}:${r.status()}`); });
    const leeg = await page.evaluate(() => sessionStorage.length).catch(() => 0);
    await page.goto(`https://${host}.tarasevych.com/${pad}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.canonical-avatar-trigger, .canonical-menu-toggle', { timeout: 25000, state: 'attached' }).catch(() => undefined);
    await page.waitForTimeout(1500);
    // Oude ingang (TechPoort/«Увімкнути технічний профіль») als die er is, anders de wisselknop in het accountmenu.
    const poort = page.locator('[data-tech-poort="activeren"]').first();
    let via = 'menu';
    if (await poort.isVisible().catch(() => false)) { via = 'poort'; await poort.click(); }
    else { await menu(page); await page.click('[data-ruimtes-menu] .rw [data-naar="technisch"]').catch(() => undefined); }
    await page.waitForSelector('[data-tech-venster="ruimte-start"], [data-tech-venster="activeren"]', { timeout: 20000, state: 'attached' }).catch(() => undefined);
    await page.waitForTimeout(800);
    const nieuw = await page.locator('[data-tech-venster="ruimte-start"]').count(), oud = await page.locator('[data-tech-venster="activeren"]').count();
    const aan = await page.locator('.rs [data-beschikbaar="1"]').count(), fout = await page.locator('[data-rs-statusfout]').count();
    const knop = await page.locator('[data-tech-knop="ruimte-start"]').textContent().catch(() => '');
    check(`${naam} (vers tabblad, sessionStorage=${leeg}, via ${via}): NIEUW venster, termijnen beschikbaar, geen statusfout`, nieuw === 1 && oud === 0 && aan >= 3 && fout === 0 && !/Оберіть термін/.test(knop || ''), `nieuw=${nieuw} oud=${oud} aan=${aan} fout=${fout} knop=${knop} ${statusAntw.join(',')}`);
    const maat = await page.evaluate(() => { const v = [...document.querySelectorAll('.rs .tech-vraag-knop')].map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      const k = document.querySelector('[data-tech-knop="ruimte-start"]'); k?.scrollIntoView({ block: 'nearest' }); const r = k?.getBoundingClientRect(); return { v, knopZichtbaar: !!r && r.bottom <= innerHeight + 1 && r.top >= 0, sw: document.documentElement.scrollWidth, w: innerWidth }; });
    check(`${naam}: (?) rond, knoppen in beeld, geen overloop`, maat.v.every(([w, h]) => Math.abs(w - h) <= 1 && w <= 26) && maat.knopZichtbaar && maat.sw <= maat.w, JSON.stringify(maat));
    await page.screenshot({ path: `${SHOTS}/fix-${naam}.png` }).catch(() => undefined);
    await ctx.close();
  }
  await vlag(true);
} catch (e) { check('script liep zonder uitzondering', false, e.stack); }
finally {
  await browser.close().catch(() => undefined);
  await pool.query(`DELETE FROM app.extensie_ontgrendelingen WHERE user_id = ANY($1)`, [[uid, uid2]]).catch(() => undefined);
  await pool.query(`UPDATE app.feature_flags SET aan=false, gebruikers='{}' WHERE sleutel='tech-ruimtes-v2'`).catch(() => undefined);
  await pool.end();
}
check(`0 verzoeken naar andere hosts (${geblokt.length})`, geblokt.length === 0, geblokt.slice(0, 3).join(' '));
check(`geen JS-fouten op de pagina (${paginaFouten.length})`, paginaFouten.length === 0, paginaFouten.slice(0, 3).join(' | '));
const ok = uitslag.filter((x) => x.ok).length; console.log(`\n${ok}/${uitslag.length} geslaagd (tech-ruimtes-v2 integratie, echte backend)`);
process.exit(ok === uitslag.length ? 0 : 1);
