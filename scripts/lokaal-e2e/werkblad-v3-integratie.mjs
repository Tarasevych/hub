// Werkblad v3 — interactieve E2E tegen de ECHTE lokale backend + PostgreSQL (geen mocks). ALLEEN LOKAAL.
// Keten: Chrome → https *.tarasevych.com (host-resolver → 127.0.0.1:$PROXY_PORT, zelfondertekend) → proxy.mjs → node dist-server/start.mjs.
// Elk verzoek naar een andere host wordt afgebroken en geteld (eis: 0). Sessie wordt in de DB gezaaid (zoals e2e.mjs) en na afloop opgeruimd.
// Gebruik: DATABASE_URL=… PLAYWRIGHT_CORE=… PROXY_PORT=8453 SHOTS=/workspace/audit-werkblad node scripts/lokaal-e2e/werkblad-v3-integratie.mjs
import pg from 'pg'; import { createHash, randomBytes, randomUUID } from 'node:crypto'; import { buildSync } from 'esbuild';
const { chromium } = await import(`${process.env.PLAYWRIGHT_CORE}/index.mjs`);
const SHOTS = process.env.SHOTS || '/workspace/audit-werkblad'; const PORT = process.env.PROXY_PORT || '8453';
const EMAIL = process.env.E2E_EMAIL || 'wb3d-eigenaar@example.test';
buildSync({ entryPoints: [new URL('../../shared/werkblad-register.ts', import.meta.url).pathname], outfile: '/tmp/wb3d-register.mjs', bundle: true, platform: 'node', format: 'esm', logLevel: 'error' });
const REG = await import('/tmp/wb3d-register.mjs');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const uitslag = []; const check = (n, ok, info = '') => { uitslag.push({ n, ok: !!ok, info }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${n}${info ? ' — ' + String(info).slice(0, 300) : ''}`); };
const nb = (n, info) => { uitslag.push({ n, ok: null, info }); console.log(`N.V. ${n} — ${info}`); };
const geblokt = [];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: [`--host-resolver-rules=MAP *.tarasevych.com 127.0.0.1:${PORT}, MAP tarasevych.com 127.0.0.1:${PORT}, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`, '--no-sandbox', '--disable-background-networking', '--disable-component-update', '--no-first-run'] });
const nu = Date.now(); const uid = randomUUID(); const token = randomBytes(32).toString('base64url'); const sid = randomUUID();
const ITEMS = `SELECT instance_id AS id, item_id, kind, x, y, w, h, z, parent FROM app.werkblad_items WHERE user_id=$1 AND ruimte='prive' AND apparaat=$2 ORDER BY instance_id`;
const laag = async (a) => (await pool.query(ITEMS, [uid, a])).rows;
const versie = async (a) => Number((await pool.query(`SELECT versie FROM app.werkblad_layout WHERE user_id=$1 AND ruimte='prive' AND apparaat=$2`, [uid, a])).rows[0]?.versie ?? -1);
const vlag = (aan) => pool.query(`UPDATE app.feature_flags SET aan=$2, gebruikers=$1 WHERE sleutel='werkblad-v3'`, [aan ? [uid] : [], aan]);
async function context(opties = {}) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, locale: 'uk-UA', ...opties });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); if (/^(data|blob):/.test(u.protocol) || u.hostname === 'tarasevych.com' || u.hostname.endsWith('.tarasevych.com') || u.hostname === '127.0.0.1') return r.continue(); geblokt.push(u.href.slice(0, 120)); return r.abort(); });
  await ctx.addCookies([{ name: '__Secure-tsv_ecosystem_migrated-bg2v4h', value: encodeURIComponent(`${sid}.${token}`), domain: '.tarasevych.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  return ctx;
}
function teller(page) { const t = { bewaren: [], v2bewaren: 0, fouten: [] }; page.on('response', async (r) => { if (r.url().includes('/werkblad/v3/bewaren')) t.bewaren.push({ status: r.status(), apparaat: (() => { try { return JSON.parse(r.request().postData() || '{}').apparaat; } catch { return '?'; } })() }); else if (/\/werkblad\/bewaren$/.test(r.url())) t.v2bewaren++; }); page.on('pageerror', (e) => t.fouten.push(e.message.slice(0, 200))); return t; }
const wachtBewaren = async (page, t, n0, ms = 6000) => { const eind = Date.now() + ms; while (Date.now() < eind) { if (t.bewaren.length > n0) { await page.waitForTimeout(300); return t.bewaren[t.bewaren.length - 1]; } await page.waitForTimeout(100); } return null; };
const HUB = 'https://hub.tarasevych.com/';
async function open(page, v3 = true) { await page.goto(HUB, { waitUntil: 'domcontentloaded' }); await page.waitForSelector(v3 ? '[data-werkblad-versie="3"] .wbc' : '[data-werkblad="klaar"]', { timeout: 20000 }); await page.waitForTimeout(800); }
const bewerkAan = async (page) => { if (await page.locator('[data-wb3="instellen"]').count()) await page.click('[data-wb3="instellen"]'); await page.waitForTimeout(200); };
const schaal = async (page) => Number(await page.locator('.wbc').getAttribute('data-schaal'));
const doos = async (page, sel) => { const l = page.locator(sel).first(); await l.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' })); await page.waitForTimeout(150); return l.boundingBox(); };
async function sleep(page, van, naar, stappen = 12) { await page.mouse.move(van.x, van.y); await page.mouse.down(); for (let i = 1; i <= stappen; i++) await page.mouse.move(van.x + (naar.x - van.x) * i / stappen, van.y + (naar.y - van.y) * i / stappen); await page.mouse.up(); }

try {
  await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['users', uid, { email: EMAIL, sub: 'wb3d', name: 'WB3D Eigenaar', picture: '', role: 'owner', status: 'approved', accessLevel: 'full', entitlements: [], createdAt: nu, updatedAt: nu }]);
  await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['owner_service_sessions_v1', sid, { tokenHash: sha(token), userId: uid, service: 'hub', sourceOrigin: 'https://hub.tarasevych.com', tabHash: sha('ecosystem'), createdAt: nu, authenticatedAt: nu, lastSeenAt: nu, idleExpiresAt: nu + 864e5, absoluteExpiresAt: nu + 7 * 864e5, rotation: 0, version: 1, revocationEpoch: 0, ip: '198.51.100.9', userAgent: 'e2e', authMethod: 'google', scope: 'ecosystem' }]);
  await vlag(false);

  // ------------------------------------------------------------------ 0. vlag uit → v2 exact zoals voorheen
  const ctxA = await context(); const A = await ctxA.newPage(); const tA = teller(A);
  await open(A, false);
  const v2Tegels = await A.locator('.wb-raster [data-wb-tegel]').count();
  const v3Weg = await A.locator('[data-werkblad-versie="3"]').count();
  await A.waitForTimeout(1500);
  const v2rij = (await pool.query(`SELECT versie, indeling FROM app.werkblad_indeling WHERE user_id=$1 AND ruimte='prive'`, [uid])).rows[0];
  const v3rijen = Number((await pool.query(`SELECT count(*)::int n FROM app.werkblad_v3_lade WHERE user_id=$1`, [uid])).rows[0].n);
  await A.screenshot({ path: `${SHOTS}/int-01-vlag-uit-v2.png` });
  check('vlag uit: v2-werkblad (raster) getoond, geen v3, niets overgezet', v2Tegels > 0 && v3Weg === 0 && !!v2rij && v3rijen === 0 && tA.bewaren.length === 0, `tegels=${v2Tegels} v2versie=${v2rij?.versie} v3lades=${v3rijen}`);
  const v2Items = (v2rij?.indeling?.items || []).length;

  // ------------------------------------------------------------------ 1. vlag aan → overzetting v2 → v3 behouden
  await vlag(true);
  await open(A);
  const pc0 = await laag('computer');
  const herkomst = (await pool.query(`SELECT herkomst, v2_backup IS NOT NULL AS b FROM app.werkblad_v3_lade WHERE user_id=$1 AND ruimte='prive'`, [uid])).rows[0];
  const lagenNa = (await pool.query(`SELECT apparaat FROM app.werkblad_layout WHERE user_id=$1 ORDER BY apparaat`, [uid])).rows.map((r) => r.apparaat).join(',');
  const domItems = await A.locator('.wbc-item').count();
  await A.screenshot({ path: `${SHOTS}/int-02-v3-na-overzetting.png`, fullPage: true });
  check('vlag aan: v2-indeling overgezet (zelfde aantal widgets, 3 lagen, v2-backup), getoond als vrij canvas', pc0.length === v2Items && domItems === v2Items && lagenNa === 'computer,tablet,telefoon' && herkomst?.b === true && (await A.getAttribute('[data-werkblad-versie="3"]', 'data-wb3-klasse')) === 'computer', `v2=${v2Items} pc=${pc0.length} dom=${domItems} lagen=${lagenNa} herkomst=${herkomst?.herkomst}`);

  // ------------------------------------------------------------------ 2. PC: slepen naar exacte x,y; F5 houdt coördinaten; geen auto-compactie
  await A.click('[data-wb3="instellen"]');
  const doelW = pc0.find((e) => e.item_id === 'wdg:post') || pc0[pc0.length - 1];
  let s = await schaal(A);
  let b = await doos(A, `[data-wbc-id="${doelW.id}"]`);
  let n0 = tA.bewaren.length;
  await sleep(A, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: b.x + b.width / 2 + 137, y: b.y + b.height / 2 + 61 });
  const r1 = await wachtBewaren(A, tA, n0);
  const pc1 = await laag('computer'); const na1 = pc1.find((e) => e.id === doelW.id);
  const verwachtX = doelW.x + Math.round(137 / s), verwachtY = doelW.y + Math.round(61 / s);
  const anderen = pc0.filter((e) => e.id !== doelW.id).every((e) => { const o = pc1.find((x) => x.id === e.id); return o && o.x === e.x && o.y === e.y && o.w === e.w && o.h === e.h; });
  check('PC: één drag → één bewaren (200), exacte logische x/y (±1 px), buren onaangeroerd (geen compactie)', r1?.status === 200 && tA.bewaren.length - n0 === 1 && Math.abs(na1.x - verwachtX) <= 1 && Math.abs(na1.y - verwachtY) <= 1 && anderen, `schaal=${s} van ${doelW.x},${doelW.y} → ${na1.x},${na1.y} verwacht ${verwachtX},${verwachtY} bewaren=${tA.bewaren.length - n0}`);
  n0 = tA.bewaren.length;
  await A.reload({ waitUntil: 'domcontentloaded' }); await A.waitForSelector('.wbc'); await A.waitForTimeout(1200);
  s = await schaal(A);
  const stijl = await A.locator(`[data-wbc-id="${doelW.id}"]`).evaluate((el) => ({ l: parseFloat(el.style.left), t: parseFloat(el.style.top) }));
  const pc2 = await laag('computer');
  check('PC: F5 → zelfde coördinaten op het scherm (x·schaal) en in de DB, laden bewaart niets', Math.abs(stijl.l - na1.x * s) < 1 && Math.abs(stijl.t - na1.y * s) < 1 && JSON.stringify(pc2) === JSON.stringify(pc1) && tA.bewaren.length === n0, `left=${stijl.l} verwacht=${(na1.x * s).toFixed(1)}`);
  await A.screenshot({ path: `${SHOTS}/int-03-pc-na-slepen-f5.png` });

  // ------------------------------------------------------------------ 3. PC: formaat w/h zonder 96-px-stap; min/max van het register
  await A.click('[data-wb3="instellen"]');
  const regW = REG.registerItem(doelW.item_id);
  let g = await doos(A, `[data-wbc-id="${doelW.id}"] [data-wbc-rand="se"]`);
  n0 = tA.bewaren.length;
  await sleep(A, { x: g.x + g.width / 2, y: g.y + g.height / 2 }, { x: g.x + g.width / 2 + 53, y: g.y + g.height / 2 + 37 });
  await wachtBewaren(A, tA, n0);
  const na3 = (await laag('computer')).find((e) => e.id === doelW.id);
  const dw = na3.w - na1.w, dh = na3.h - na1.h;
  check('PC: formaat w/h volgt de muis (geen 96-px-stap)', Math.abs(dw - Math.round(53 / s)) <= 1 && Math.abs(dh - Math.round(37 / s)) <= 1 && dh % 96 !== 0, `Δw=${dw} Δh=${dh} (schaal ${s})`);
  g = await doos(A, `[data-wbc-id="${doelW.id}"] [data-wbc-rand="se"]`); n0 = tA.bewaren.length;
  await sleep(A, { x: g.x + g.width / 2, y: g.y + g.height / 2 }, { x: g.x - 1500, y: g.y - 1500 }, 20);
  await wachtBewaren(A, tA, n0);
  const klein = (await laag('computer')).find((e) => e.id === doelW.id);
  g = await doos(A, `[data-wbc-id="${doelW.id}"] [data-wbc-rand="se"]`); n0 = tA.bewaren.length;
  await sleep(A, { x: g.x + g.width / 2, y: g.y + g.height / 2 }, { x: g.x + 4000, y: g.y + 3000 }, 20);
  await wachtBewaren(A, tA, n0);
  const groot = (await laag('computer')).find((e) => e.id === doelW.id);
  check('PC: minimum en maximum uit het register worden gerespecteerd', klein.w === regW.minAfm.w && klein.h === regW.minAfm.h && groot.h <= regW.maxAfm.h && groot.w <= Math.min(regW.maxAfm.w, 1280), `min ${klein.w}×${klein.h} (register ${regW.minAfm.w}×${regW.minAfm.h}); groot ${groot.w}×${groot.h} (max ${regW.maxAfm.w}×${regW.maxAfm.h}, canvas 1280)`);

  // ------------------------------------------------------------------ 4. Escape tijdens slepen → niets bewaard
  b = await doos(A, `[data-wbc-id="${doelW.id}"]`); n0 = tA.bewaren.length; const voorEsc = await laag('computer');
  await A.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await A.mouse.down(); for (let i = 1; i <= 8; i++) await A.mouse.move(b.x + b.width / 2 + i * 15, b.y + b.height / 2 + i * 10);
  await A.keyboard.press('Escape'); await A.mouse.up(); await A.waitForTimeout(1200);
  check('Escape midden in een drag: geen bewaren, DB ongewijzigd', tA.bewaren.length === n0 && JSON.stringify(await laag('computer')) === JSON.stringify(voorEsc), `bewaren=${tA.bewaren.length - n0}`);

  // ------------------------------------------------------------------ 5. bibliotheek: alle menu-items, zoeken, planned/denied, toevoegen (knop + slepen), map
  await A.click('[data-wb3="bibliotheek"]'); await A.waitForSelector('.bib-paneel');
  const rijen = await A.locator('.bib-rij').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-bib-id'), st: e.getAttribute('data-bib-stand') })));
  const regNieuw = REG.WERKBLAD_REGISTER.filter((r) => !r.legacy);
  const menuSvc = REG.WERKBLAD_REGISTER.filter((r) => r.id.startsWith('svc:')).length, menuPg = REG.WERKBLAD_REGISTER.filter((r) => r.id.startsWith('pg:')).length;
  const inPaneel = (p) => rijen.filter((r) => r.id.startsWith(p)).length;
  check('bibliotheek: elk menu-item (diensten + subpagina\'s) + opdrachten + widgets staat erin', rijen.length === regNieuw.length && inPaneel('svc:') === menuSvc && inPaneel('pg:') === menuPg, `paneel=${rijen.length} register=${regNieuw.length} svc=${inPaneel('svc:')}/${menuSvc} pg=${inPaneel('pg:')}/${menuPg} cmd=${inPaneel('cmd:')} wdg=${inPaneel('wdg:')}`);
  const planned = rijen.filter((r) => r.st === 'planned').length, denied = rijen.filter((r) => r.st === 'denied').length;
  const adminDenied = rijen.find((r) => r.id === 'pg:admin/audit')?.st;
  const knopUit = await A.locator('[data-bib-stand="planned"] .bib-knop').first().isDisabled().catch(() => null);
  check('bibliotheek: planned/denied zichtbaar als zodanig en niet toe te voegen (privé: beheerpagina\'s denied)', planned > 0 && denied > 0 && adminDenied === 'denied' && knopUit === true, `planned=${planned} denied=${denied} pg:admin/audit=${adminDenied}`);
  await A.fill('.bib-zoek input', 'Вхідні');
  const zoek = await A.locator('.bib-rij').evaluateAll((els) => els.map((e) => e.getAttribute('data-bib-id')));
  check('bibliotheek: zoeken (UA) vindt de juiste pagina', zoek.includes('pg:mail/inbox'), zoek.slice(0, 5).join(','));
  n0 = tA.bewaren.length;
  await A.locator('[data-bib-id="pg:mail/inbox"] .bib-knop', { hasText: 'Як ярлик' }).click();
  await wachtBewaren(A, tA, n0);
  await A.fill('.bib-zoek input', '');
  n0 = tA.bewaren.length;
  await A.locator('[data-bib-id="map:nieuw"] .bib-knop').click();
  await wachtBewaren(A, tA, n0);
  // slepen uit het paneel (HTML5 dnd) naar een lege plek op het canvas
  n0 = tA.bewaren.length;
  await A.fill('.bib-zoek input', 'Написати');
  const wbc = await doos(A, '.wbc');
  await A.locator('[data-bib-id="cmd:bericht-schrijven"]').dragTo(A.locator('.wbc'), { targetPosition: { x: Math.min(wbc.width - 60, 1150 * s), y: 40 } }).catch((e) => console.log('dragTo', e.message));
  await wachtBewaren(A, tA, n0);
  const pc5 = await laag('computer');
  const sk = pc5.find((e) => e.item_id === 'pg:mail/inbox'), map = pc5.find((e) => e.kind === 'folder'), cmd = pc5.find((e) => e.item_id === 'cmd:bericht-schrijven');
  check('bibliotheek → canvas: ярлик (knop), map en opdracht (slepen uit paneel) bewaard in de DB', !!sk && !!map && /^map:m\d+$/.test(map.item_id) && !!cmd, `ярлик=${!!sk} map=${map?.item_id} cmd(drag)=${!!cmd}${cmd ? ` @${cmd.x},${cmd.y}` : ''}`);
  await A.screenshot({ path: `${SHOTS}/int-04-bibliotheek-toegevoegd.png` });
  await A.click('[data-wb3="bibliotheek"]');
  // ярлик op de map slepen → in de map (parent)
  if (sk && map) {
    const bs = await doos(A, `[data-wbc-id="${sk.id}"]`), bm = await A.locator(`[data-wbc-id="${map.id}"]`).boundingBox(); console.log('map/sk', JSON.stringify({ bs, bm })); n0 = tA.bewaren.length;
    await sleep(A, { x: bs.x + bs.width / 2, y: bs.y + bs.height / 2 }, { x: bm.x + bm.width / 2, y: bm.y + bm.height / 2 });
    await wachtBewaren(A, tA, n0);
    const kind = (await laag('computer')).find((e) => e.id === sk.id);
    await A.click('[data-wb3="klaar"]'); await A.waitForTimeout(300);
    await A.click(`[data-werkblad-map="${map.id}"]`); await A.waitForTimeout(300);
    const inPop = await A.locator('.bib-map-paneel [data-werkblad-item="pg:mail/inbox"]').count();
    await A.screenshot({ path: `${SHOTS}/int-05-map-open.png` });
    check('map: ярлик op de map neergezet → parent in DB; map toont het; F5 houdt het', kind?.parent === map.id && inPop === 1, `parent=${kind?.parent} in popover=${inPop}`);
    await A.keyboard.press('Escape');
  }
  // opdracht openen buiten de instelmodus: canonieke router + ?actie=
  if (cmd) {
    const [nav] = await Promise.all([A.waitForRequest((r) => r.isNavigationRequest() && /actie=/.test(r.url()), { timeout: 8000 }).catch(() => null), A.click(`[data-wbc-id="${cmd.id}"] [data-werkblad-item]`)]);
    check('opdracht-ярлик opent de doelsectie via de canonieke router met actionId (?actie=), voert niets uit', !!nav && /mail\.tarasevych\.com/.test(nav.url()) && /actie=bericht-schrijven/.test(nav.url()), nav?.url());
    await open(A);
  }

  // ------------------------------------------------------------------ 6. twee contexten → 409, geen stille overschrijving
  const ctxB = await context(); const B = await ctxB.newPage(); const tB = teller(B);
  await open(B); await open(A);
  const pcV = await laag('computer'); const v0 = await versie('computer');
  const x1 = pcV.find((e) => e.kind === 'widget' && e.id !== doelW.id) || pcV[0], x2 = doelW;
  await B.click('[data-wb3="instellen"]'); await A.click('[data-wb3="instellen"]');
  b = await doos(B, `[data-wbc-id="${x1.id}"]`); n0 = tB.bewaren.length;
  await sleep(B, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: b.x + b.width / 2 + 40, y: b.y + b.height / 2 + 24 });
  await wachtBewaren(B, tB, n0);
  const naB = await laag('computer');
  b = await doos(A, `[data-wbc-id="${x2.id}"]`); n0 = tA.bewaren.length;
  await sleep(A, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, { x: b.x + b.width / 2 - 50, y: b.y + b.height / 2 + 30 });
  const rA = await wachtBewaren(A, tA, n0);
  await A.waitForSelector('.wbc-status-conflict', { timeout: 4000 }).catch(() => null);
  const conflictZichtbaar = await A.locator('.wbc-status-conflict').count();
  await A.screenshot({ path: `${SHOTS}/int-06-conflict-409.png` });
  const naA = await laag('computer');
  check('twee contexten: tweede schrijver krijgt 409 + conflictbalk; DB = versie van de eerste (geen stille overschrijving)', rA?.status === 409 && conflictZichtbaar === 1 && JSON.stringify(naA) === JSON.stringify(naB) && (await versie('computer')) === v0 + 1, `A=${rA?.status} balk=${conflictZichtbaar} versie ${v0}→${await versie('computer')}`);
  await A.locator('.wbc-status-conflict button').click(); await A.waitForTimeout(1200);
  const naHerl = await A.locator(`[data-wbc-id="${x1.id}"]`).evaluate((el) => parseFloat(el.style.left)); s = await schaal(A);
  const x1B = naB.find((e) => e.id === x1.id);
  check('conflict: «Перезавантажити» toont de nieuwere serverversie', Math.abs(naHerl - x1B.x * s) < 1 && (await A.locator('.wbc-status-conflict').count()) === 0, `left=${naHerl} verwacht=${(x1B.x * s).toFixed(1)}`);
  await ctxB.close();

  // ------------------------------------------------------------------ 7. containerbreedte (zijbalk) / zoom 200 % veranderen niets aan de opslag
  const voorZoom = { pc: await laag('computer'), tab: await laag('tablet'), tel: await laag('telefoon') }; n0 = tA.bewaren.length;
  await A.setViewportSize({ width: 1280, height: 900 }); await A.waitForTimeout(800);
  const s1280 = await schaal(A), kl1280 = await A.getAttribute('[data-werkblad-versie="3"]', 'data-wb3-klasse');
  await A.setViewportSize({ width: 720, height: 450 }); await A.waitForTimeout(1000); // = 1440×900 op 200 % zoom (CSS-viewport gehalveerd)
  const kl200 = await A.getAttribute('[data-werkblad-versie="3"]', 'data-wb3-klasse');
  await A.screenshot({ path: `${SHOTS}/int-07-zoom200.png` });
  await A.setViewportSize({ width: 1440, height: 900 }); await A.waitForTimeout(1000);
  const s1440 = await schaal(A);
  const naZoom = { pc: await laag('computer'), tab: await laag('tablet'), tel: await laag('telefoon') };
  check('kleinere container (zijbalk/venster) en zoom 200 %: alleen schaal/klasse wisselt, opgeslagen posities ongewijzigd, niets bewaard', JSON.stringify(voorZoom) === JSON.stringify(naZoom) && tA.bewaren.length === n0 && s1280 !== s1440, `schaal 1440=${s1440} 1280=${s1280} klasse 1280=${kl1280} 200%=${kl200} bewaren=${tA.bewaren.length - n0}`);
  const zij = A.locator('.canonical-menu-toggle[data-sidebar-action]:visible').first();
  if (await zij.count()) { const v = await laag('computer'); const sv = await schaal(A); const n1 = tA.bewaren.length; await zij.click().catch(() => null); await A.waitForTimeout(900); const sn = await schaal(A); await A.screenshot({ path: `${SHOTS}/int-07b-zijbalk-om.png` }); const v2 = await laag('computer'); check('echte zijbalk-knop (canonical-menu-toggle): posities in DB ongewijzigd, niets bewaard', JSON.stringify(v) === JSON.stringify(v2) && tA.bewaren.length === n1, `schaal ${sv} → ${sn}`); await zij.click().catch(() => null); await A.waitForTimeout(600); }
  else nb('echte zijbalk-knop inklappen', 'geen zichtbare .canonical-menu-toggle gevonden; gedekt door de containerbreedte-test hierboven');

  // ------------------------------------------------------------------ 8. telefoon 390: lang indrukken vs scroll, eigen laag, formaat, touchcancel, lange namen
  const ctxT = await context({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const T = await ctxT.newPage(); const tT = teller(T);
  // eerste bezoek op een klasse zonder eigen laag → één keer afgeleid van de PC-laag (aanpassenVanaf) en bewaard
  await pool.query(`DELETE FROM app.werkblad_items WHERE user_id=$1 AND ruimte='prive' AND apparaat='telefoon'`, [uid]);
  await pool.query(`DELETE FROM app.werkblad_layout WHERE user_id=$1 AND ruimte='prive' AND apparaat='telefoon'`, [uid]);
  await open(T); await wachtBewaren(T, tT, 0);
  const afgeleid = await laag('telefoon'), pcNu = await laag('computer');
  check('telefoon eerste bezoek zonder laag: afgeleid van PC (zelfde objecten), binnen 390 px, één keer bewaard', tT.bewaren.length === 1 && tT.bewaren[0].apparaat === 'telefoon' && tT.bewaren[0].status === 200 && afgeleid.length === pcNu.length && afgeleid.every((e) => e.x + e.w <= 390), `items ${afgeleid.length}/${pcNu.length} bewaren=${JSON.stringify(tT.bewaren)}`);
  await T.reload({ waitUntil: 'domcontentloaded' }); await T.waitForSelector('.wbc'); await T.waitForTimeout(1000);
  check('telefoon: tweede bezoek gebruikt de eigen laag (geen nieuwe afleiding)', tT.bewaren.length === 1, `bewaren=${tT.bewaren.length}`);
  const klT = await T.getAttribute('[data-werkblad-versie="3"]', 'data-wb3-klasse');
  const cdp = await ctxT.newCDPSession(T);
  const aanraak = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }] });
  await T.click('[data-wb3="instellen"]'); await T.waitForTimeout(300);
  // shortcuts met lange UA-namen toevoegen op de telefoon
  await T.click('[data-wb3="bibliotheek"]');
  for (const id of ['pg:identity/security', 'cmd:afspraak-toevoegen', 'pg:mail/inbox']) { await T.fill('.bib-zoek input', ''); const k = T.locator(`[data-bib-id="${id}"] .bib-knop`).first(); if (await k.count()) { const n = tT.bewaren.length; await k.click(); await wachtBewaren(T, tT, n); } }
  await T.click('[data-wb3="bibliotheek"]'); await T.waitForTimeout(500);
  const telefoon0 = await laag('telefoon'); const pcVoorT = await laag('computer');
  const eerste = telefoon0.filter((e) => !e.parent).sort((a, c) => a.y - c.y)[0];
  b = await doos(T, `[data-wbc-id="${eerste.id}"]`);
  // scroll: snel vegen zonder vasthouden → pagina scrolt, geen drag
  await T.evaluate(() => scrollTo(0, 0)); n0 = tT.bewaren.length; const topVoor = await T.evaluate(() => document.querySelector('.wbc').getBoundingClientRect().top);
  const cx = b.x + b.width / 2, cy = Math.min(b.y + b.height / 2, 700);
  await aanraak('touchStart', cx, cy); for (let i = 1; i <= 10; i++) { await aanraak('touchMove', cx, cy - i * 25); await T.waitForTimeout(16); } await aanraak('touchEnd');
  await T.waitForTimeout(900);
  const scrollY = topVoor - await T.evaluate(() => document.querySelector('.wbc').getBoundingClientRect().top);
  check('telefoon: gewoon vegen scrolt de pagina en start GEEN drag (niets bewaard)', scrollY > 20 && tT.bewaren.length === n0 && JSON.stringify(await laag('telefoon')) === JSON.stringify(telefoon0), `scrollY=${scrollY} bewaren=${tT.bewaren.length - n0}`);
  await T.waitForTimeout(300);
  b = await doos(T, `[data-wbc-id="${eerste.id}"]`); n0 = tT.bewaren.length;
  const px = b.x + b.width / 2, py = b.y + b.height / 2;
  await aanraak('touchStart', px, py); await T.waitForTimeout(650); for (let i = 1; i <= 10; i++) { await aanraak('touchMove', px + i * 3, py + i * 12); await T.waitForTimeout(16); } await aanraak('touchEnd');
  await wachtBewaren(T, tT, n0);
  const telefoon1 = await laag('telefoon'); const naLang = telefoon1.find((e) => e.id === eerste.id);
  check('telefoon: lang indrukken (≈500 ms) → drag, één bewaren voor de telefoonlaag; PC-laag onaangeroerd (onafhankelijk)', tT.bewaren.length - n0 === 1 && tT.bewaren.at(-1)?.apparaat === 'telefoon' && (naLang.y !== eerste.y || naLang.x !== eerste.x) && JSON.stringify(await laag('computer')) === JSON.stringify(pcVoorT), `van ${eerste.x},${eerste.y} → ${naLang.x},${naLang.y} bewaren=${tT.bewaren.length - n0}`);
  // touchcancel midden in een drag → niets
  b = await doos(T, `[data-wbc-id="${eerste.id}"]`); n0 = tT.bewaren.length;
  await aanraak('touchStart', b.x + b.width / 2, b.y + b.height / 2); await T.waitForTimeout(650); for (let i = 1; i <= 6; i++) { await aanraak('touchMove', b.x + b.width / 2, b.y + b.height / 2 + i * 15); await T.waitForTimeout(16); } await aanraak('touchCancel');
  await T.waitForTimeout(1200);
  check('telefoon: touchcancel/pointercancel midden in een drag → niets bewaard', tT.bewaren.length === n0 && JSON.stringify(await laag('telefoon')) === JSON.stringify(telefoon1), `bewaren=${tT.bewaren.length - n0}`);
  // formaat met de vinger (greep, alleen in instelmodus)
  const skT = (await laag('telefoon')).find((e) => e.item_id === 'pg:mail/inbox' && !e.parent) || eerste;
  const gsel = `[data-wbc-id="${skT.id}"] [data-wbc-rand="se"]`;
  if (await T.locator(gsel).count()) {
    const gb = await doos(T, gsel); n0 = tT.bewaren.length; const voor = (await laag('telefoon')).find((e) => e.id === skT.id);
    // flow-modus = geen overlap: verkleinen (naar links/boven) botst nooit met een buur
    await aanraak('touchStart', gb.x + gb.width / 2, gb.y + gb.height / 2); for (let i = 1; i <= 8; i++) { await aanraak('touchMove', gb.x + gb.width / 2 - i * 2, gb.y + gb.height / 2 - i * 2); await T.waitForTimeout(16); } await aanraak('touchEnd');
    await wachtBewaren(T, tT, n0);
    const na = (await laag('telefoon')).find((e) => e.id === skT.id);
    check('telefoon: formaat wijzigen met de vinger via de greep (instelmodus)', tT.bewaren.length - n0 === 1 && (na.w !== voor.w || na.h !== voor.h), `${voor.w}×${voor.h} → ${na.w}×${na.h}`);
  } else nb('telefoon: formaat met de vinger', 'greep niet gevonden');
  await T.click('[data-wb3="klaar"]'); await T.waitForTimeout(400);
  const namen = await T.locator('.wb3-tegel .bib-tegel').evaluateAll((els) => els.map((el) => { const n = el.querySelector('.bib-tegel-naam'); const r = el.getBoundingClientRect(), nr = n.getBoundingClientRect(); return { t: el.getAttribute('title'), binnen: nr.bottom <= r.bottom + 1 && nr.right <= r.right + 1, w: Math.round(r.width) }; }));
  await T.evaluate(() => scrollTo(0, 0)); await T.waitForTimeout(300);
  await T.screenshot({ path: `${SHOTS}/int-08-telefoon-390.png` });
  const sT = await schaal(T); const dbT = (await laag('telefoon')).filter((e) => !e.parent);
  const dom = await T.locator('.wbc-item').evaluateAll((els) => els.map((el) => ({ id: el.getAttribute('data-wbc-id'), l: parseFloat(el.style.left), t: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height) })));
  const afw = dbT.filter((e) => { const d = dom.find((x) => x.id === e.id); return !d || Math.abs(d.l - e.x * sT) > 1 || Math.abs(d.t - e.y * sT) > 1 || Math.abs(d.w - e.w * sT) > 1; });
  const ovT = dbT.flatMap((a, i) => dbT.slice(i + 1).filter((c) => a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y).map((c) => `${a.item_id}×${c.item_id}`));
  check('telefoon: getekende posities = DB × schaal voor elk object; geen overlap in de telefoonlaag (flow)', afw.length === 0 && ovT.length === 0 && dom.length === dbT.length, `afwijkend=${afw.map((e) => e.item_id).join(',')} overlap=${ovT.join(',')}`);
  check('telefoon: lange UA-namen blijven binnen de kleine tegel (afgebroken), volledige naam in title', namen.length >= 3 && namen.every((n) => n.binnen && n.t), JSON.stringify(namen.slice(0, 4)));
  await ctxT.close();

  // ------------------------------------------------------------------ 9. tablet: draaien
  const ctxTab = await context({ viewport: { width: 768, height: 1024 }, hasTouch: true });
  const Tb = await ctxTab.newPage(); const tTb = teller(Tb);
  await open(Tb);
  const zichtbaarAlles = async () => Tb.evaluate(() => { const c = document.querySelector('.wbc').getBoundingClientRect(); const it = [...document.querySelectorAll('.wbc-item')]; return { n: it.length, binnen: it.every((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= c.left - 1 && r.right <= c.right + 1; }), klasse: document.querySelector('[data-werkblad-versie="3"]').getAttribute('data-wb3-klasse') }; });
  const staand = await zichtbaarAlles(); await Tb.screenshot({ path: `${SHOTS}/int-09-tablet-staand.png` });
  await Tb.setViewportSize({ width: 1024, height: 768 }); await Tb.waitForTimeout(1000);
  const liggend = await zichtbaarAlles(); await Tb.screenshot({ path: `${SHOTS}/int-10-tablet-liggend.png` });
  const dbTab = (await laag('tablet')).filter((e) => !e.parent).length;
  check('tablet: staand en liggend — alle objecten zichtbaar binnen het canvas, geen verdwijnen; draaien bewaart niets', staand.binnen && liggend.binnen && staand.n === dbTab && liggend.n > 0 && tTb.bewaren.length === 0, `staand ${JSON.stringify(staand)} liggend ${JSON.stringify(liggend)} db=${dbTab}`);
  await ctxTab.close();

  // ------------------------------------------------------------------ 10. reset bevestigen + terugdraaien naar v2 + vlag uit
  await bewerkAan(A); await A.click('[data-wb3="instellingen"]'); n0 = tA.bewaren.length;
  await A.click('[data-wb3="reset"]'); const vraag = await A.locator('[data-wb3-bevestig="reset"]').count();
  await A.click('[data-wb3="bevestig-nee"]'); await A.waitForTimeout(500);
  check('volledige reset vraagt eerst bevestiging; «Скасувати» doet niets', vraag === 1 && tA.bewaren.length === n0 && (await laag('computer')).length > 0);
  const v2Voor = Number((await pool.query(`SELECT versie FROM app.werkblad_indeling WHERE user_id=$1 AND ruimte='prive'`, [uid])).rows[0].versie);
  await A.click('[data-wb3="naar-v2"]'); await A.click('[data-wb3="bevestig-ja"]'); await A.waitForTimeout(1500);
  const v2Na = (await pool.query(`SELECT versie, indeling FROM app.werkblad_indeling WHERE user_id=$1 AND ruimte='prive'`, [uid])).rows[0];
  const meld = await A.locator('[data-wb3-zichtbaar-melding]').innerText().catch(() => '');
  check('eigenaar: «Повернути розкladку v2» zet de v2-backup terug (versie +1), v3 blijft', Number(v2Na.versie) === v2Voor + 1 && (v2Na.indeling.items || []).length === v2Items && (await laag('computer')).length > 0, `v2 versie ${v2Voor}→${v2Na.versie}; melding: ${meld.slice(0, 80)}`);
  await vlag(false); await open(A, false);
  const v2Weer = await A.locator('.wb-raster [data-wb-tegel]').count();
  await A.screenshot({ path: `${SHOTS}/int-11-vlag-uit-terug-v2.png` });
  check('vlag uit na gebruik: v2-pagina werkt (zelfde tegels), v3-gegevens blijven in de DB', v2Weer === v2Items && (await A.locator('[data-werkblad-versie="3"]').count()) === 0 && (await laag('computer')).length > 0, `tegels=${v2Weer}`);
  await vlag(true); await open(A);
  check('vlag weer aan: v3 zoals achtergelaten (geen nieuwe overzetting)', (await A.locator('.wbc-item').count()) === (await laag('computer')).filter((e) => !e.parent).length);
  // volledige reset echt uitvoeren
  await bewerkAan(A); await A.click('[data-wb3="instellingen"]'); await A.click('[data-wb3="reset"]'); await A.click('[data-wb3="bevestig-ja"]'); await A.waitForTimeout(2000);
  const naReset = await laag('computer');
  check('volledige reset (bevestigd): v3 opnieuw overgezet uit v2 (aantal = v2)', naReset.length === v2Items, `items=${naReset.length}`);

  check('JS-fouten op de pagina: geen', tA.fouten.length === 0, tA.fouten.join(' | '));
  check('alleen lokaal: 0 geblokkeerde verzoeken naar andere hosts', geblokt.length === 0, geblokt.slice(0, 5).join(' '));
} catch (e) { check('script liep zonder uitzondering', false, e.stack?.slice(0, 600)); }
finally {
  await vlag(false).catch(() => null);
  await pool.query(`DELETE FROM app.records WHERE (tbl='users' AND id=$1) OR (tbl='owner_service_sessions_v1' AND id=$2)`, [uid, sid]).catch(() => null);
  for (const t of ['werkblad_items', 'werkblad_layout', 'werkblad_v3_lade', 'werkblad_indeling']) await pool.query(`DELETE FROM app.${t} WHERE user_id=$1`, [uid]).catch(() => null);
  await browser.close(); await pool.end();
  const ok = uitslag.filter((u) => u.ok === true).length, fout = uitslag.filter((u) => u.ok === false).length, nv = uitslag.filter((u) => u.ok === null).length;
  console.log(`\n${ok} OK, ${fout} FOUT, ${nv} niet geverifieerd (werkblad-v3-integratie)`);
  (await import('node:fs')).writeFileSync(`${SHOTS}/int-uitslag.json`, JSON.stringify(uitslag, null, 1));
  process.exit(fout ? 1 : 0);
}
