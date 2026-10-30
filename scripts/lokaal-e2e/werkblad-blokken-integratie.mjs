// Werkblad «Blokken» — E2E tegen de ECHTE lokale backend + PostgreSQL (geen nepserver). ALLEEN LOKAAL.
// Keten: Chrome → https *.tarasevych.com (host-resolver → 127.0.0.1:$PROXY_PORT, zelfondertekend) → proxy → node dist-server/start.mjs.
// Elk verzoek naar een andere host wordt afgebroken en geteld (eis 0). Sessie in de DB gezaaid, na afloop opgeruimd.
// Pariteit vlag uit: zelfde «Швидкий доступ» als de basisversie (BASIS_PORT = server van de vorige versie op dezelfde DB), pixelvergelijking.
// Gebruik: DATABASE_URL=… PLAYWRIGHT_CORE=… PNG_MAP=… PROXY_PORT=8473 BASIS_PORT=8474 SHOTS=/workspace/audit-blokken node scripts/lokaal-e2e/werkblad-blokken-integratie.mjs
import pg from 'pg'; import { createHash, randomBytes, randomUUID } from 'node:crypto';
const { chromium } = await import(`${process.env.PLAYWRIGHT_CORE}/index.mjs`);
const SHOTS = process.env.SHOTS || '/workspace/audit-blokken'; const PORT = process.env.PROXY_PORT || '8473'; const BASIS = process.env.BASIS_PORT || '';
const EMAIL = process.env.E2E_EMAIL || 'bl-int-eigenaar@example.test';
const sha = (v) => createHash('sha256').update(v).digest('hex');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const uitslag = []; const check = (n, ok, info = '') => { uitslag.push({ n, ok: !!ok, info }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${n}${info ? ' — ' + String(info).slice(0, 400) : ''}`); };
const geblokt = []; const paginaFouten = [];
const start = (poort) => chromium.launch({ executablePath: '/usr/bin/google-chrome', args: [`--host-resolver-rules=MAP *.tarasevych.com 127.0.0.1:${poort}, MAP tarasevych.com 127.0.0.1:${poort}, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`, '--no-sandbox', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--font-render-hinting=none'] });
const browser = await start(PORT);
const nu = Date.now(); const bestaand = (await pool.query(`SELECT id FROM app.records WHERE tbl='users' AND data->>'role'='owner'`)).rows[0]; const uid = bestaand ? String(bestaand.id) : randomUUID(); const sessies = [];
async function sessie() { const id = randomUUID(), token = randomBytes(32).toString('base64url'); sessies.push(id);
  await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['owner_service_sessions_v1', id, { tokenHash: sha(token), userId: uid, service: 'hub', sourceOrigin: 'https://hub.tarasevych.com', tabHash: sha('ecosystem'), createdAt: Date.now(), authenticatedAt: Date.now(), lastSeenAt: Date.now(), idleExpiresAt: Date.now() + 864e5, absoluteExpiresAt: Date.now() + 7 * 864e5, rotation: 0, version: 1, revocationEpoch: 0, ip: '198.51.100.9', userAgent: 'e2e', authMethod: 'google', scope: 'ecosystem' }]);
  return encodeURIComponent(`${id}.${token}`); }
async function context(o = {}, b = browser) {
  const breedte = o.breedte ?? 1280;
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: breedte, height: o.hoogte || (breedte < 500 ? 844 : 900) }, hasTouch: breedte < 500, locale: 'uk-UA', timezoneId: 'Europe/Brussels', colorScheme: o.thema || 'dark' });
  await ctx.route('**/*', (r) => { const u = new URL(r.request().url()); if (/^(data|blob):/.test(u.protocol) || u.hostname === 'tarasevych.com' || u.hostname.endsWith('.tarasevych.com')) return r.continue(); geblokt.push(u.href.slice(0, 120)); return r.abort(); });
  await ctx.addCookies([{ name: '__Secure-tsv_ecosystem_migrated-bg2v4h', value: o.cookie || await sessie(), domain: '.tarasevych.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage(); page.on('pageerror', (e) => paginaFouten.push(e.message.slice(0, 200)));
  if (process.env.E2E_LOG) page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 200)));
  const t = { blok: [], v3: [] };
  page.on('response', (r) => { const u = r.url(); if (u.includes('/werkblad/v3/blokken/')) t.blok.push({ pad: u.split('/').pop(), status: r.status() }); else if (u.includes('/werkblad/v3/bewaren')) t.v3.push(r.status()); });
  return { ctx, page, t };
}
const vlag = async (sleutel, aan) => { await pool.query(`UPDATE app.feature_flags SET aan=$2, gebruikers=$3 WHERE sleutel=$1`, [sleutel, aan, aan ? [uid] : []]); await new Promise((r) => setTimeout(r, 3300)); };
const shot = (p, n, el) => (el ? p.locator(el).first().screenshot({ path: `${SHOTS}/int-${n}.png` }) : p.screenshot({ path: `${SHOTS}/int-${n}.png` })).catch(() => undefined);
const HUB = 'https://hub.tarasevych.com/';
const WIDGET = '[data-wb3-widget="snel-toegang"]';
async function open(page, host = 'hub') { await page.goto(host === 'hub' ? HUB : `https://${host}.tarasevych.com/`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-werkblad-versie="3"] .wbc, .canonical-avatar-trigger', { timeout: 25000, state: 'attached' }).catch(() => undefined); await page.waitForTimeout(2200); }
const bewerkAan = async (page) => { if (await page.locator('[data-wb3="instellen"]').count()) await page.click('[data-wb3="instellen"]'); await page.waitForTimeout(400); };
const blokRij = async () => (await pool.query(`SELECT i.instance_id, i.apparaat, i.blok FROM app.werkblad_items i WHERE i.user_id=$1 AND i.ruimte='prive' AND i.item_id='wdg:snel-toegang' ORDER BY apparaat`, [uid])).rows;
const blokVan = async (a = 'computer') => (await blokRij()).find((r) => r.apparaat === a)?.blok || null;
const items = async (a = 'computer') => (await pool.query(`SELECT instance_id, item_id, kind, x, y, w, h, parent, config FROM app.werkblad_items WHERE user_id=$1 AND ruimte='prive' AND apparaat=$2`, [uid, a])).rows;
const wachtOp = async (f, ms = 8000) => { const eind = Date.now() + ms; while (Date.now() < eind) { const v = await f(); if (v) return v; await new Promise((r) => setTimeout(r, 200)); } return null; };
async function sleep(page, van, naar, stappen = 14) { await page.mouse.move(van.x, van.y); await page.mouse.down(); for (let i = 1; i <= stappen; i++) { await page.mouse.move(van.x + (naar.x - van.x) * i / stappen, van.y + (naar.y - van.y) * i / stappen); await page.waitForTimeout(16); } await page.waitForTimeout(120); await page.mouse.up(); await page.waitForTimeout(300); }
const midden = async (page, sel) => { const l = page.locator(sel).first(); const b = await l.boundingBox(); return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2, b } : null; };
const tegel = (n) => `${WIDGET} .blk-tegel >> nth=${n}`;
/** Pixelvergelijking zonder extra pakket: identieke PNG-bytes = identieke pixels (zelfde encoder); anders telt python3/PIL de pixels. */
import { execFileSync } from 'node:child_process';
function pixelVerschil(a, b) {
  if (Buffer.compare(a, b) === 0) return { anders: 0, px: 0 };
  try { const fa = `/tmp/bl-pv-a.png`, fb = `/tmp/bl-pv-b.png`; require_fs().writeFileSync(fa, a); require_fs().writeFileSync(fb, b);
    const uit = execFileSync('python3', ['-c', "import sys;from PIL import Image,ImageChops;a=Image.open(sys.argv[1]).convert('RGB');b=Image.open(sys.argv[2]).convert('RGB');print('maat' if a.size!=b.size else sum(1 for p in ImageChops.difference(a,b).getdata() if sum(p)>30), a.size, b.size)", fa, fb]).toString().trim();
    return { anders: uit.startsWith('0 ') ? 0 : 1, info: uit }; } catch (e) { return { anders: 1, info: String(e).slice(0, 100) }; }
}
import * as fsMod from 'node:fs'; const require_fs = () => fsMod;

try {
  // schone lei voor deze eigenaar (alleen de lokale test-DB)
  for (const t of ['werkblad_items', 'werkblad_layout', 'werkblad_plekken', 'werkblad_v3_lade', 'werkblad_indeling']) await pool.query(`DELETE FROM app.${t} WHERE user_id=$1`, [uid]);
  if (!bestaand) await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['users', uid, { email: EMAIL, sub: 'blint', name: 'BL Eigenaar', picture: '', role: 'owner', status: 'approved', accessLevel: 'full', entitlements: [], createdAt: nu, updatedAt: nu }]);
  await vlag('werkblad-v3', false); await vlag('werkblad-blokken', false);
  { const { ctx, page } = await context(); await open(page); await page.waitForSelector('[data-werkblad="klaar"]', { timeout: 20000 }).catch(() => undefined); await page.waitForTimeout(1500); await ctx.close(); } // v2-standaardindeling
  await vlag('werkblad-v3', true);

  // ── 1. vlag uit: pixelpariteit met de vorige versie (zelfde DB, zelfde gebruiker), 1280/390, donker/licht ──
  {
    const { ctx, page } = await context(); await open(page); await ctx.close(); // overzetting v2→v3 één keer
    const basis = BASIS ? await start(BASIS) : null;
    for (const breedte of [1280, 390]) for (const thema of ['dark', 'light']) {
      const naam = `${breedte}-${thema}`;
      const nieuw = await context({ breedte, thema }); await open(nieuw.page);
      // de klok in de begroeting mag niet meetellen: alleen het widget «Швидкий доступ»
      const nBlk = await nieuw.page.locator(`${WIDGET} [data-blk-inst]`).count();
      await nieuw.page.waitForSelector(WIDGET, { timeout: 15000 }).catch(() => undefined); await nieuw.page.waitForTimeout(800);
      const pngN = await nieuw.page.locator(WIDGET).first().screenshot({ path: `${SHOTS}/int-01-vlag-uit-${naam}.png`, animations: 'disabled' }).catch(() => null);
      const blokVerzoek = nieuw.t.blok.map((x) => `${x.pad}:${x.status}`).join(',');
      await nieuw.ctx.close();
      if (basis) {
        const oud = await context({ breedte, thema }, basis); await open(oud.page);
        await oud.page.waitForSelector(WIDGET, { timeout: 15000 }).catch(() => undefined); await oud.page.waitForTimeout(800);
        const pngO = await oud.page.locator(WIDGET).first().screenshot({ path: `${SHOTS}/int-01-basis-${naam}.png`, animations: 'disabled' }).catch(() => null);
        await oud.ctx.close();
        const d = pngN && pngO ? pixelVerschil(pngN, pngO) : null;
        check(`vlag uit ${naam}: «Швидкий доступ» pixelgelijk aan de vorige versie, geen BlokWeergave`, nBlk === 0 && !!d && d.anders === 0, `blk=${nBlk} verschil=${JSON.stringify(d)} verzoeken=${blokVerzoek}`);
      } else check(`vlag uit ${naam}: geen BlokWeergave`, nBlk === 0, 'geen basisserver');
    }
    await basis?.close();
  }

  // ── 2. vlag aan: zelfde tegels als standaardblok, kiezen → paneel → maat/kleur/naam → bewaard na F5 ──
  await vlag('werkblad-blokken', true);
  const A = await context({ hoogte: 2200, breedte: 1600 }); const P = A.page;
  await open(P); await P.waitForSelector(`${WIDGET} .blk-tegel`, { timeout: 15000 }).catch(() => undefined);
  const nTegels = await P.locator(`${WIDGET} .blk-tegel`).count();
  await shot(P, '02-vlag-aan-standaard', WIDGET);
  check('vlag aan: «Швидкий доступ» via BlokWeergave met de tegels uit de widget (standaardblok)', nTegels >= 8 && (await blokVan()) === null, `tegels=${nTegels}`);
  await bewerkAan(P);
  await P.click(tegel(0)); await P.waitForTimeout(300);
  const paneel = await P.locator('[data-blk-paneel] .eig-paneel').count();
  await shot(P, '03-paneel-open');
  check('bewerkmodus: klik op een tegel opent het eigenschappenpaneel', paneel === 1);
  const kn = (b) => { const uit = []; const loop = (k, d = 0) => { uit.push({ ...k, d }); (k.kinderen || []).forEach((c) => loop(c, d + 1)); }; if (b) loop(b.wortel); return uit; };
  const blkTel = () => A.t.blok.filter((x) => x.pad === 'bewaren').length;
  const wachtBlok = async (n0) => wachtOp(async () => (A.t.blok.filter((x) => x.pad === 'bewaren').length > n0 ? A.t.blok.filter((x) => x.pad === 'bewaren').slice(-1)[0] : null), 8000);
  const tab = async (naam) => { await P.click(`.eig-paneel [role="tab"]:has-text("${naam}")`).catch(() => undefined); await P.waitForTimeout(150); };

  // ── 3. maat, kleur en naam van één tegel → bewaard (400 ms vertraagd) → na F5 nog zo ──
  let n0 = blkTel();
  await tab('Розмір');
  await P.click('.eig-paneel .eig-keuze[aria-label="Розмір значка"] [role="radio"]:has-text("Пікселі")');
  await P.locator('.eig-paneel input[type="range"][aria-label="Розмір значка"]').fill('64');
  await tab('Вигляд');
  const kleurGroep = P.locator('.eig-paneel .eig-kleur').first();
  await kleurGroep.locator('[role="radio"]').nth(1).click();
  await kleurGroep.locator('.eig-hex').fill('#7c3aed');
  for (const t of ['Розмір', 'Вигляд', 'Розташування', 'Пристрої']) { if (await P.locator('#eig-labeltekst').count()) break; await tab(t); }
  await P.fill('#eig-labeltekst', 'Моя пошта');
  const r3 = await wachtBlok(n0); await P.waitForTimeout(900);
  await shot(P, '04-tegel-aangepast');
  await P.reload({ waitUntil: 'domcontentloaded' }); await P.waitForSelector(`${WIDGET} .blk-tegel`, { timeout: 15000 }); await P.waitForTimeout(800);
  let b0 = await blokVan(); const mail = kn(b0).find((k) => k.itemId === 'svc:mail');
  const domMail = await P.locator(`${WIDGET} .blk-tegel[aria-label="Моя пошта"]`).evaluate((el) => ({ px: el.style.getPropertyValue('--blk-icoon-px'), bg: el.style.getPropertyValue('--blk-achtergrond') })).catch(() => null);
  check('tegel: icoongrootte 64 px, eigen achtergrond en eigen naam bewaard (200) en na F5 zichtbaar', r3?.status === 200 && mail?.icoon?.grootte?.waarde === 64 && mail?.uiterlijk?.achtergrond === '#7c3aed' && mail?.label?.tekst === 'Моя пошта' && domMail?.px === '64px', `status=${r3?.status} db=${JSON.stringify({ i: mail?.icoon, u: mail?.uiterlijk, l: mail?.label })} dom=${JSON.stringify(domMail)} aantalBewaren=${blkTel() - n0}`);
  check('vertraagd bewaren: snelle reeks wijzigingen → weinig verzoeken (≤ 4)', blkTel() - n0 <= 4, `verzoeken=${blkTel() - n0}`);

  // ── 4. blok in blok: twee tegels → rij; rij + tegel → kolom (rij in kolom) ──
  await bewerkAan(P);
  await P.click(tegel(1)); await P.click(tegel(2), { modifiers: ['Shift'] });
  n0 = blkTel();
  await P.click('[data-blk-actie="groepeer-rij"]'); await P.waitForTimeout(300);
  const rijId = await wachtOp(async () => kn(await blokVan()).find((k) => k.soort === 'blok' && k.d === 1 && k.indeling.modus === 'rij')?.id, 6000);
  await P.click(`${WIDGET} .blk-tegel >> nth=4`, { modifiers: ['Shift'] });
  await P.click('[data-blk-actie="groepeer-kolom"]'); await wachtBlok(blkTel()); await P.waitForTimeout(900);
  b0 = await blokVan(); const kol = kn(b0).find((k) => k.soort === 'blok' && k.indeling?.modus === 'kolom');
  const rijInKol = kol?.kinderen?.some((c) => c.soort === 'blok' && c.indeling.modus === 'rij');
  await shot(P, '05-rij-in-kolom', WIDGET);
  check('blok in blok: «Згрупувати в ряд», daarna rij + tegel «Згрупувати в колонку» → rij in kolom, bewaard, beide met rastercellen', !!rijId && !!kol && rijInKol && !!kol.rasterSpan && kol.rasterSpan.kolommen >= 2, `rij=${rijId} kolom=${kol?.id} span=${JSON.stringify(kol?.rasterSpan)} kinderen=${kol?.kinderen?.map((c) => c.soort + ':' + (c.indeling?.modus || c.itemId)).join(',')}`);

  // ── 5. tegel uit het blok naar het werkblad slepen (stijl blijft) en terug ──
  await P.click('.blk-zijpaneel .eig-sluit').catch(() => undefined); await P.waitForTimeout(200);
  await P.evaluate(() => scrollTo(0, 0)); await P.waitForTimeout(200);
  const leeg = await P.evaluate(() => { const w = document.querySelector('.wbc'); const r = w.getBoundingClientRect(); for (let y = r.bottom - 40; y > r.top + 40; y -= 30) for (let x = r.right - 60; x > r.left + 60; x -= 30) { const el = document.elementFromPoint(x, y); if (el === w && y < innerHeight - 30) return { x, y }; } return null; });
  let v = await midden(P, `${WIDGET} .blk-tegel[aria-label="Моя пошта"]`);
  const leeg2 = await P.evaluate(() => { const w = document.querySelector('.wbc'); const r = w.getBoundingClientRect(); for (let y = Math.min(innerHeight - 40, r.bottom - 40); y > r.top + 40; y -= 24) for (let x = r.right - 60; x > r.left + 60; x -= 24) { if (document.elementFromPoint(x, y) === w && x < innerWidth - 20) return { x, y }; } return null; });
  v = await midden(P, `${WIDGET} .blk-tegel[aria-label="Моя пошта"]`);
  const v3n = A.t.v3.length; n0 = blkTel();
  if (v && (leeg2 || leeg)) await sleep(P, v, leeg2 || leeg);
  await wachtOp(async () => A.t.v3.length > v3n, 8000); await P.waitForTimeout(1500);
  let it = await items(); const los = it.find((e) => e.kind === 'shortcut' && e.item_id === 'svc:mail' && !e.parent);
  b0 = await blokVan();
  const stijl = los?.config?.blokStijl ? JSON.parse(los.config.blokStijl) : null;
  await shot(P, '06-naar-werkblad');
  check('slepen blok → werkblad: losse snelkoppeling, kleur/icoongrootte in config.blokStijl, titel in titleOverride, weg uit het blok', !!los && stijl?.uiterlijk?.achtergrond === '#7c3aed' && stijl?.icoon?.grootte?.waarde === 64 && !kn(b0).some((k) => k.itemId === 'svc:mail') && (await P.locator(`[data-blk-los="${los?.instance_id}"] .blk-tegel`).count()) === 1, `leeg=${JSON.stringify(leeg2 || leeg)} los=${JSON.stringify(los)} v3=${A.t.v3.slice(v3n)}`);
  if (los) {
    const van = await midden(P, `[data-wbc-id="${los.instance_id}"]`); const naar = await midden(P, `${WIDGET} .blk-wortel`);
    const v3m = A.t.v3.length;
    await sleep(P, van, { x: naar.b.x + naar.b.width / 2, y: naar.b.y + Math.min(40, naar.b.height / 2) }, 18);
    await wachtOp(async () => A.t.v3.length > v3m, 8000); await P.waitForTimeout(1500);
    it = await items(); b0 = await blokVan(); const terug = kn(b0).find((k) => k.itemId === 'svc:mail');
    await shot(P, '07-terug-in-blok', WIDGET);
    check('slepen werkblad → blok: snelkoppeling weer een onderdeel, kleur/icoongrootte/naam terug (heen en terug)', !it.some((e) => e.instance_id === los.instance_id) && terug?.uiterlijk?.achtergrond === '#7c3aed' && terug?.icoon?.grootte?.waarde === 64 && terug?.label?.tekst === 'Моя пошта', JSON.stringify(terug));
  }

  // ── 6. naar het menu ──
  {
    const cloud = await midden(P, `${WIDGET} .blk-tegel[aria-label="Хмарне сховище"]`);
    const lijst = await midden(P, '[data-menu-lijst="zijbalk|"]');
    if (cloud && lijst) {
      await P.mouse.move(cloud.x, cloud.y); await P.mouse.down(); for (let i = 1; i <= 14; i++) { await P.mouse.move(cloud.x + (lijst.x - cloud.x) * i / 14, cloud.y + (lijst.y - cloud.y) * i / 14); await P.waitForTimeout(16); }
      const doel = await P.evaluate(() => document.querySelector('[data-menu-lijst="zijbalk|"]')?.getAttribute('data-wb-doel'));
      await shot(P, '08-naar-menu-slepen'); await P.mouse.up(); await P.waitForTimeout(500);
      const m = await P.locator('[data-wb3-zichtbaar-melding]').textContent().catch(() => '');
      check('slepen blok → menu: neerzetten op het menu loopt via de menuregels (melding toegevoegd of al aanwezig)', /меню/.test(m || ''), `doel=${doel} melding=${m}`);
      // de muis staat nog op het menu (menu blijft uitgeklapt): wegbewegen zoals een gebruiker
      await P.mouse.move(1500, 1200, { steps: 4 }); await P.waitForTimeout(600);
    } else check('slepen blok → menu', false, `cloud=${!!cloud} lijst=${!!lijst}`);
  }

  // ── 7. «Перемістити в…» alleen met het toetsenbord + ongedaan/opnieuw ──
  {
    await P.locator(`${WIDGET} .blk-tegel[aria-label="GitHub"]`).focus(); await P.keyboard.press('Enter'); await P.waitForTimeout(150);
    await P.keyboard.press('m'); await P.waitForTimeout(400);
    const open1 = await P.locator('.wb-plekkiezer').count();
    await shot(P, '09-kiezer');
    // eerste geldige blok-plek die niet de huidige ouder is: kies de kolom (als die er is) — anders aan het eind van de wortel
    const opties = await P.locator('.wb-plekkiezer-lijst li').allTextContents();
    const doelI = Math.max(1, opties.findIndex((t) => /›/.test(t)));
    for (let i = 0; i < doelI; i++) await P.keyboard.press('ArrowDown');
    await P.keyboard.press('Enter'); await P.waitForTimeout(200); await P.keyboard.press('Enter'); await P.waitForTimeout(1500);
    b0 = await blokVan(); const gh = (() => { let ouder = null; const loop = (k, o) => { if (k.itemId === 'svc:github') ouder = o; (k.kinderen || []).forEach((c) => loop(c, k)); }; loop(b0.wortel, null); return ouder; })();
    check('«Перемістити в…» met toetsenbord (Enter = kiezen, M = openen, ↓/Enter): tegel in een genest blok', open1 === 1 && gh && gh.id !== b0.wortel.id, `opties=${JSON.stringify(opties)} doelI=${doelI} ouder=${gh?.id}`);
    const voorUndo = JSON.stringify(b0.wortel);
    await P.locator(`${WIDGET} .blk-tegel >> nth=0`).focus();
    await P.keyboard.press('Control+z'); await P.waitForTimeout(1600);
    const naUndo = await blokVan(); const ghTerug = JSON.stringify(naUndo.wortel) !== voorUndo;
    await P.keyboard.press('Control+Shift+z'); await P.waitForTimeout(1600);
    const naRedo = await blokVan();
    check('Ctrl+Z zet de verplaatsing terug, Ctrl+Shift+Z doet ze opnieuw (ook in de DB)', ghTerug && JSON.stringify(naRedo.wortel) === voorUndo, `undo=${ghTerug} redo=${JSON.stringify(naRedo.wortel) === voorUndo}`);
  }

  // ── 8. versieconflict tussen twee tabbladen ──
  {
    const B = await context({ breedte: 1600 }); await open(B.page); await bewerkAan(B.page);
    await P.click(`${WIDGET} .blk-tegel[aria-label="Моя пошта"]`); await tab('Вигляд');
    for (const t of ['Розмір', 'Вигляд', 'Розташування', 'Пристрої']) { if (await P.locator('#eig-labeltekst').count()) break; await tab(t); }
    n0 = blkTel(); await P.fill('#eig-labeltekst', 'Перша вкладка'); await wachtBlok(n0); await P.waitForTimeout(600);
    await B.page.click(`${WIDGET} .blk-tegel[aria-label="Моя пошта"]`);
    for (const t of ['Розмір', 'Вигляд', 'Розташування', 'Пристрої']) { if (await B.page.locator('#eig-labeltekst').count()) break; await B.page.click(`.eig-paneel [role="tab"]:has-text("${t}")`); }
    await B.page.fill('#eig-labeltekst', 'Друга вкладка');
    await wachtOp(async () => B.t.blok.some((x) => x.pad === 'bewaren' && x.status === 409), 8000); await B.page.waitForTimeout(1500);
    const m = await B.page.locator('[data-wb3-zichtbaar-melding]').textContent().catch(() => '');
    const db = kn(await blokVan()).map((k) => k.label?.tekst).filter(Boolean);
    await shot(B.page, '10-conflict');
    check('versieconflict: tweede tabblad krijgt 409, melding + nieuwere versie getoond, eerste wijziging blijft', B.t.blok.some((x) => x.status === 409) && /іншій вкладці/.test(m || '') && db.includes('Перша вкладка') && !db.includes('Друга вкладка') && (await B.page.locator(`${WIDGET} .blk-tegel[aria-label="Перша вкладка"]`).count()) === 1, `melding=${m} db=${db}`);
    await B.ctx.close();
  }

  // ── 9. technisch item in de privéruimte: geweigerd (keuzelijst én server) ──
  {
    await P.click(`${WIDGET} .blk-tegel[aria-label="Перша вкладка"]`); await P.click('[data-blk-actie="plus-icoon"]'); await P.waitForTimeout(200);
    const lijst = await P.locator('[data-blk-keuze="icoon"] [data-blk-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-blk-item')));
    await shot(P, '11-toevoegen-lijst');
    const r = await P.evaluate(async () => {
      const tab = sessionStorage.getItem('tsv-tab-context') || Object.values(sessionStorage).find((v) => /^[0-9a-f]{48}$/.test(v)) || '';
      const basis = { service: 'hub', tabContext: tab, sourceOrigin: location.origin };
      const l = await (await fetch('/api/owner/hub/werkblad/v3/blokken/laden', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...basis, apparaat: 'computer' }) })).json();
      const [inst, b] = Object.entries(l.lagen.computer.blokken)[0];
      const kopie = JSON.parse(JSON.stringify(b)); kopie.wortel.kinderen.push({ soort: 'onderdeel', id: 'tech-1', itemId: 'svc:admin', afmeting: { breedte: { soort: 'auto' }, hoogte: { soort: 'auto' } }, volgorde: 99 });
      const a = await fetch('/api/owner/hub/werkblad/v3/blokken/bewaren', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...basis, apparaat: 'computer', instanceId: inst, blok: kopie, versie: l.lagen.computer.versie }) });
      return { status: a.status, d: await a.json().catch(() => ({})) };
    });
    check('technisch item (svc:admin) in privéruimte: niet in «+ Додати значок», server weigert (400, item-niet-toegestaan)', !lijst.includes('svc:admin') && lijst.length > 3 && r.status === 400 && JSON.stringify(r.d).includes('niet-toegestaan'), `lijst=${lijst.length} admin=${lijst.includes('svc:admin')} server=${r.status} ${JSON.stringify(r.d).slice(0, 160)}`);
    await P.click('[data-blk-actie="plus-icoon"]');
  }

  // ── 10. v3-bewaring (widget verplaatsen) laat blokken staan ──
  {
    const voor = JSON.stringify((await blokVan()).wortel);
    await P.keyboard.press('Escape').catch(() => undefined); await P.click('.blk-zijpaneel .eig-sluit').catch(() => undefined);
    const w = (await items()).find((e) => e.item_id === 'wdg:post') || (await items()).find((e) => e.kind === 'widget' && e.item_id !== 'wdg:snel-toegang');
    const kop = await midden(P, `[data-wbc-id="${w.instance_id}"] .wb-tegel-kop`) || await midden(P, `[data-wbc-id="${w.instance_id}"]`);
    const v3n2 = A.t.v3.length; await sleep(P, kop, { x: kop.x + 40, y: kop.y + 24 });
    await wachtOp(async () => A.t.v3.length > v3n2, 8000); await P.waitForTimeout(800);
    const na = await blokVan();
    check('canvas bewaren (widget verplaatst, v3 /bewaren 200) houdt het blok ongewijzigd', A.t.v3.slice(v3n2).includes(200) && JSON.stringify(na?.wortel) === voor, `v3=${A.t.v3.slice(v3n2)}`);
  }

  // ── 11. terugdraaisimulatie: oude versie bewaart de laag (wist `blok`) → «Відновити блоки» ──
  if (BASIS) {
    const voor = JSON.stringify((await blokVan()).wortel);
    const basis = await start(BASIS); const O = await context({}, basis); await open(O.page);
    const r = await O.page.evaluate(async () => {
      const tab = sessionStorage.getItem('tsv-tab-context') || Object.values(sessionStorage).find((v) => /^[0-9a-f]{48}$/.test(v)) || '';
      const basis = { service: 'hub', tabContext: tab, sourceOrigin: location.origin };
      const l = await (await fetch('/api/owner/hub/werkblad/v3/laden', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...basis, apparaat: 'computer' }) })).json();
      const laag = l.layouts?.computer || l.lagen?.computer; const layout = laag.layout; layout.items[0].x += 8;
      const a = await fetch('/api/owner/hub/werkblad/v3/bewaren', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...basis, apparaat: 'computer', layout, versie: laag.versie }) });
      return a.status;
    });
    await O.ctx.close(); await basis.close();
    const gewist = (await blokVan()) === null;
    await P.reload({ waitUntil: 'domcontentloaded' }); await P.waitForSelector(`${WIDGET} .blk-tegel`, { timeout: 15000 }); await P.waitForTimeout(800);
    const standaard = await P.locator(`${WIDGET} .blk-tegel[aria-label="Перша вкладка"]`).count();
    await bewerkAan(P); await P.click('[data-wb3="instellingen"]'); await P.waitForTimeout(200);
    await shot(P, '12-herstellen-knop');
    await P.click('[data-wb3="blokken-herstellen"]'); await P.waitForTimeout(2500);
    const terug = await blokVan();
    const m = await P.locator('[data-wb3-zichtbaar-melding]').textContent().catch(() => '');
    check('terugdraaisimulatie: oude versie wist het blok (bewaren 200) → standaardweergave → «Відновити блоки» zet alles terug', r === 200 && gewist && standaard === 0 && JSON.stringify(terug?.wortel) === voor && (await P.locator(`${WIDGET} .blk-tegel[aria-label="Перша вкладка"]`).count()) === 1, `oud=${r} gewist=${gewist} melding=${m}`);
  }

  // ── 12. weergave 1280/390 × donker/licht, bewerkmodus + paneel (onderblad op de telefoon) ──
  await A.ctx.close();
  for (const breedte of [1280, 390]) for (const thema of ['dark', 'light']) {
    const C = await context({ breedte, thema }); await open(C.page); await C.page.waitForSelector(`${WIDGET} .blk-tegel`, { timeout: 15000 }).catch(() => undefined);
    await shot(C.page, `13-${breedte}-${thema}-weergave`);
    await bewerkAan(C.page); await C.page.locator(`${WIDGET} .blk-tegel`).first().click().catch(() => undefined); await C.page.waitForTimeout(500);
    const m = await C.page.evaluate(() => { const p = document.querySelector('.blk-zijpaneel'); const r = p?.getBoundingClientRect(); return { p: !!p, inBeeld: !!r && r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1, sw: document.documentElement.scrollWidth, w: innerWidth, onder: !!r && r.bottom >= innerHeight - 2 }; });
    await shot(C.page, `13-${breedte}-${thema}-paneel`);
    check(`${breedte} ${thema}: paneel ${breedte < 500 ? 'als onderblad' : 'aan de zijkant'} in beeld, geen horizontale overloop`, m.p && m.inBeeld && m.sw <= m.w + 1 && (breedte >= 500 || m.onder), JSON.stringify(m));
    await C.ctx.close();
  }

  // ── 13. andere hosts: admin.* en id.* (werkblad staat alleen op hub; niets mag breken) ──
  for (const host of ['admin', 'id']) {
    const C = await context(); const f0 = paginaFouten.length; await open(C.page, host);
    const wb = await C.page.locator('[data-werkblad]').count(); const blk = await C.page.locator('[data-blk-inst]').count();
    await shot(C.page, `14-${host}`);
    check(`${host}.*: pagina laadt zonder JS-fouten (werkblad op deze host: ${wb ? 'ja' : 'nee'}, blokken: ${blk})`, paginaFouten.length === f0, `fouten=${paginaFouten.slice(f0).join('|')}`);
    await C.ctx.close();
  }
} catch (e) { check('script liep zonder uitzondering', false, e.stack); }
finally {
  await browser.close().catch(() => undefined);
  await pool.query(`UPDATE app.feature_flags SET aan=false, gebruikers='{}' WHERE sleutel IN ('werkblad-v3','werkblad-blokken')`).catch(() => undefined);
  await pool.query(`DELETE FROM app.records WHERE tbl='owner_service_sessions_v1' AND id = ANY($1)`, [sessies]).catch(() => undefined);
  await pool.end();
}
check(`0 verzoeken naar andere hosts (${geblokt.length})`, geblokt.length === 0, geblokt.slice(0, 3).join(' '));
check(`geen JS-fouten op de pagina (${paginaFouten.length})`, paginaFouten.length === 0, paginaFouten.slice(0, 3).join(' | '));
const ok = uitslag.filter((x) => x.ok).length; console.log(`\n${ok}/${uitslag.length} geslaagd (werkblad-blokken integratie, echte backend)`);
process.exit(ok === uitslag.length ? 0 : 1);
