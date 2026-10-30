// Werkblad «Blokken» — telefoon (390 px) E2E tegen de ECHTE lokale backend + PostgreSQL. ALLEEN LOKAAL.
// Geneste blokken (rij in kolom in raster), onderblad met plakkende knoppen, slepen met lang indrukken (aanraken), «Перемістити в…», tikvlak ≥ 44 px; licht en donker.
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

const A = (k) => ({ hoogte: { soort: 'auto' }, breedte: { soort: 'auto' } });
const ind = (modus) => ({ modus, omloop: modus === 'raster', richting: 'normaal', binnenrand: 0, tussenruimte: 8, uitlijningDwars: 'rek', uitlijningHoofd: 'rek', ...(modus === 'raster' ? { rasterMinCel: 84, rasterKolommen: 'auto', rasterRijHoogte: { soort: 'auto' } } : {}) });
const o = (id, item, v) => ({ id, soort: 'onderdeel', itemId: item, afmeting: A(), volgorde: v });
const b = (id, modus, kinderen, v, span) => ({ id, soort: 'blok', afmeting: A(), indeling: ind(modus), kinderen, volgorde: v, ...(span ? { rasterSpan: span } : {}) });
const BOOM = { bron: 'eigen', schema: 1, wortel: b('w-t', 'raster', [o('t-mail', 'svc:mail', 0),
  b('t-kol', 'kolom', [b('t-rij', 'rij', [o('t-cal', 'svc:calendar', 0), o('t-cloud', 'svc:cloud', 1)], 0, { kolommen: 2, rijen: 1 }), o('t-tasks', 'svc:tasks', 1)], 1, { kolommen: 2, rijen: 2 }),
  o('t-gh', 'svc:github', 2), o('t-notes', 'svc:notes', 3), o('t-ai', 'svc:ai', 4), o('t-huis', 'svc:huis', 5)], 0) };
const telefoonBlok = async () => (await blokRij()).find((r) => r.apparaat === 'telefoon')?.blok || null;
const ouderVan = (w, item) => { let r = null; const l = (k, p) => { if (k.itemId === item) r = p; (k.kinderen || []).forEach((c) => l(c, k)); }; l(w, null); return r; };
const cdp = new Map();
async function raak(page, soort, x, y) { if (!cdp.has(page)) cdp.set(page, await page.context().newCDPSession(page)); await cdp.get(page).send('Input.dispatchTouchEvent', { type: soort, touchPoints: soort === 'touchEnd' ? [] : [{ x, y }] }); }

try {
  await vlag('werkblad-v3', true); await vlag('werkblad-blokken', true);
  for (const thema of ['dark', 'light']) {
    const C = await context({ breedte: 390, thema }); const P = C.page;
    await open(P); await P.waitForSelector(`${WIDGET} .blk-tegel`, { timeout: 20000 }).catch(() => undefined);
    // telefoonlaag bestaat nu; zet een geneste boom in de lokale test-DB (dezelfde vorm als «Згрупувати» maakt)
    const rij = (await pool.query(`SELECT instance_id FROM app.werkblad_items WHERE user_id=$1 AND ruimte='prive' AND apparaat='telefoon' AND item_id='wdg:snel-toegang'`, [uid])).rows[0];
    if (!rij) { check(`390 ${thema}: telefoonlaag met «Швидкий доступ»`, false, 'geen rij'); await C.ctx.close(); continue; }
    await pool.query(`UPDATE app.werkblad_items SET blok=$3 WHERE user_id=$1 AND apparaat='telefoon' AND instance_id=$2`, [uid, rij.instance_id, BOOM]);
    await P.reload({ waitUntil: 'domcontentloaded' }); await P.waitForSelector(`${WIDGET} [data-knoop-id="t-cal"]`, { timeout: 20000 }).catch(() => undefined); await P.waitForTimeout(1000);
    await P.locator(WIDGET).first().scrollIntoViewIfNeeded().catch(() => undefined);
    // 1. weergave: alles binnen de widget, geen overlap, geen horizontale overloop, tikvlak ≥ 44 px
    const m = await P.evaluate((W) => {
      const w = document.querySelector(W); const wr = w.getBoundingClientRect();
      const t = [...w.querySelectorAll('.blk-tegel')].map((e) => ({ id: e.dataset.knoopId, r: e.getBoundingClientRect() }));
      const buiten = t.filter((x) => x.r.left < wr.left - 1 || x.r.right > wr.right + 1 || x.r.top < wr.top - 1 || x.r.bottom > wr.bottom + 1).map((x) => x.id);
      const over = []; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) { const a = t[i].r, c = t[j].r; const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left), oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top); if (ox > 1 && oy > 1) over.push(`${t[i].id}/${t[j].id}`); }
      const klein = t.filter((x) => x.r.width < 44 || x.r.height < 44).map((x) => `${x.id}:${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
      const geknipt = [...w.querySelectorAll('.blk-tegel')].filter((e) => { const l = e.querySelector('.blk-naam'); if (!l || getComputedStyle(l).display === 'none' || getComputedStyle(l).visibility === 'hidden') return false; const lr = l.getBoundingClientRect(), tr = e.getBoundingClientRect(); return lr.bottom > tr.bottom + 1 || lr.top < tr.top - 1 || (l.scrollHeight > l.clientHeight + 2 && getComputedStyle(l).textOverflow !== 'ellipsis' && !getComputedStyle(l).webkitLineClamp?.match(/\d/)); }).map((e) => e.dataset.knoopId);
      return { n: t.length, buiten, over, klein, geknipt, sw: document.documentElement.scrollWidth, iw: innerWidth, genest: w.querySelectorAll('[data-knoop-id="t-rij"],[data-knoop-id="t-kol"]').length };
    }, WIDGET);
    await shot(P, `390-${thema}-genest`, WIDGET);
    check(`390 ${thema}: rij in kolom in raster zonder overloop/overlap/afknippen`, m.n === 8 && m.genest === 2 && !m.buiten.length && !m.over.length && !m.geknipt.length && m.sw <= m.iw, JSON.stringify(m));
    check(`390 ${thema}: elke tegel tikbaar (≥ 44×44 px)`, !m.klein.length, `te klein=${m.klein.join(',') || 'geen'}`);
    // 2. bewerkmodus, tik op tegel → onderblad met plakkende knoppen
    await bewerkAan(P); await P.locator(`${WIDGET} [data-knoop-id="t-gh"]`).tap(); await P.waitForTimeout(600);
    const pn = await P.evaluate(() => { const z = document.querySelector('.blk-zijpaneel'); if (!z) return null; const r = z.getBoundingClientRect(); const v = z.querySelector('.eig-voet'); const vr = v?.getBoundingClientRect();
      return { onder: Math.abs(r.bottom - innerHeight) < 2 && r.left <= 1 && r.right >= innerWidth - 1, voetSticky: v ? getComputedStyle(v).position === 'sticky' : false, voetInBeeld: !!vr && vr.bottom <= innerHeight + 1 && vr.top >= r.top, knoppen: v ? v.querySelectorAll('button').length : 0, sw: document.documentElement.scrollWidth }; });
    // plakt de voet ook na scrollen in het onderblad?
    const naScrol = await P.evaluate(() => { const z = document.querySelector('.blk-zijpaneel'); const v = z?.querySelector('.eig-voet'); if (!z || !v) return null; z.scrollTop = z.scrollHeight; const vr = v.getBoundingClientRect(); return vr.bottom <= innerHeight + 1; });
    await shot(P, `390-${thema}-onderblad`);
    check(`390 ${thema}: paneel als onderblad, knoppen onderaan plakken (ook na scrollen)`, pn?.onder && pn.voetSticky && pn.voetInBeeld && pn.knoppen > 0 && naScrol && pn.sw <= 390, JSON.stringify({ ...pn, naScrol }));
    await P.locator('.blk-zijpaneel .eig-sluit').tap().catch(() => undefined); await P.waitForTimeout(300);
    // 3. slepen met lang indrukken (450 ms): GitHub naar de rij (vóór Хмарне сховище)
    await P.locator(`${WIDGET} [data-knoop-id="t-rij"]`).first().evaluate((e) => e.scrollIntoView({ block: 'center' })).catch(() => undefined); await P.waitForTimeout(400);
    const van = await P.locator(`${WIDGET} [data-knoop-id="t-gh"]`).boundingBox(); const naar = await P.locator(`${WIDGET} [data-knoop-id="t-cloud"]`).boundingBox();
    const n0 = C.t.blok.length;
    if (van && naar) {
      const x0 = van.x + van.width / 2, y0 = van.y + van.height / 2, x1 = naar.x + naar.width * 0.3, y1 = naar.y + naar.height / 2;
      await raak(P, 'touchStart', x0, y0); await P.waitForTimeout(600);
      const sleept = await P.evaluate(() => !!document.querySelector('.wb-sleep-geest') || document.documentElement.classList.contains('wb-sleept') || !!document.querySelector('[data-wb-sleept="ja"]'));
      for (let i = 1; i <= 12; i++) { await raak(P, 'touchMove', x0 + (x1 - x0) * i / 12, y0 + (y1 - y0) * i / 12); await P.waitForTimeout(30); }
      const doelTekst = await P.evaluate(() => { const d = document.querySelector('[data-wb-doel]'); const g = document.querySelector('.wb-sleep-geest'); return `${d ? d.className.slice(0, 40) + ':' + d.dataset.wbDoel : 'geen'} geest=${g?.style.transform} scrollY=${scrollY}`; });
      await shot(P, `390-${thema}-slepen`); await raak(P, 'touchEnd', x1, y1);
      await wachtOp(async () => C.t.blok.slice(n0).some((x) => x.pad === 'bewaren'), 6000); await P.waitForTimeout(800);
      const lade = await P.evaluate(() => !!document.querySelector('.canonical-chrome.sidebar-drawer'));
      const w = (await telefoonBlok()).wortel; const ou = ouderVan(w, 'svc:github');
      check(`390 ${thema}: slepen met lang indrukken (450 ms) zet GitHub in de geneste rij, menu schuift niet open`, sleept && ou?.id === 't-rij' && !lade, `sleept=${sleept} menuOpen=${lade} ouder=${ou?.id} van=${Math.round(x0)},${Math.round(y0)} naar=${Math.round(x1)},${Math.round(y1)} doel=${doelTekst}`);
    } else check(`390 ${thema}: slepen met lang indrukken`, false, 'tegels niet gevonden');
    // 4. «Перемістити в…» met tikken: Нотатки naar de kolom
    await P.locator('.blk-zijpaneel .eig-sluit').tap({ timeout: 3000 }).catch(() => undefined); await P.waitForTimeout(300);
    await P.locator(`${WIDGET} [data-knoop-id="t-notes"]`).scrollIntoViewIfNeeded(); await P.locator(`${WIDGET} [data-knoop-id="t-notes"]`).tap({ timeout: 8000 }); await P.waitForTimeout(400);
    const eerste = await P.locator('[data-blk-actie="verplaats"]').count();
    check(`390 ${thema}: na het slepen opent één tik op een tegel meteen de werkbalk`, eerste === 1, `werkbalk=${eerste}`);
    await P.locator('[data-blk-actie="verplaats"]').tap({ timeout: 8000 }); await P.waitForTimeout(400);
    const opties = await P.locator('.wb-plekkiezer-lijst li').allTextContents();
    const doel = opties.findIndex((t) => /›.*›/.test(t)) >= 0 ? opties.findIndex((t) => /›/.test(t) && !/›.*›/.test(t)) : -1;
    const kiezerOk = await P.evaluate(() => { const k = document.querySelector('.wb-plekkiezer'); if (!k) return false; const r = k.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
    await shot(P, `390-${thema}-kiezer`);
    const n1 = C.t.blok.length;
    if (doel >= 0) { await P.locator('.wb-plekkiezer-lijst li').nth(doel).tap(); await P.waitForTimeout(300); if (await P.locator('.wb-plekkiezer').count()) { await P.locator('.wb-plekkiezer-lijst li').last().tap(); } }
    await wachtOp(async () => C.t.blok.slice(n1).some((x) => x.pad === 'bewaren'), 6000); await P.waitForTimeout(800);
    const w2 = (await telefoonBlok()).wortel; const ou2 = ouderVan(w2, 'svc:notes');
    check(`390 ${thema}: «Перемістити в…» (tikken) zet Нотатки in een genest blok, venster past in beeld`, kiezerOk && ou2 && ou2.id !== w2.id, `opties=${JSON.stringify(opties)} ouder=${ou2?.id}`);
    // 4b. «+ Додати значок», «Змінити значок», «Видалити з блоку» (tikken)
    {
      const tel = (w) => { let n = 0; const l = (k) => { if (k.soort === 'onderdeel') n++; (k.kinderen || []).forEach(l); }; l(w); return n; };
      await P.locator('.wb-plekkiezer').count().then((c) => (c ? P.keyboard.press('Escape') : null));
      const t0 = tel((await telefoonBlok()).wortel);
      await P.locator(`${WIDGET} [data-knoop-id="t-mail"]`).tap(); await P.waitForTimeout(300);
      await P.locator('[data-blk-actie="plus-icoon"]').tap(); await P.waitForTimeout(300);
      const kies = P.locator('[data-blk-keuze="icoon"] [data-blk-item]').first(); const nieuwItem = await kies.getAttribute('data-blk-item');
      let n2 = C.t.blok.length; await kies.tap(); await wachtOp(async () => C.t.blok.slice(n2).some((x) => x.pad === 'bewaren'), 6000); await P.waitForTimeout(700);
      const t1 = tel((await telefoonBlok()).wortel);
      check(`390 ${thema}: «+ Додати значок» voegt een icoon toe (bewaard)`, t1 === t0 + 1, `voor=${t0} na=${t1} item=${nieuwItem}`);
      await P.locator('.blk-zijpaneel .eig-sluit').tap({ timeout: 3000 }).catch(() => undefined); await P.waitForTimeout(300);
      await P.locator(`${WIDGET} [data-knoop-id="t-mail"]`).tap(); await P.waitForTimeout(300);
      await P.locator('[data-blk-actie="vervang"]').tap(); await P.waitForTimeout(300);
      const ik = P.locator('[data-blk-keuze="vervang"] .blk-icoonknop').nth(2); const icoon = await ik.getAttribute('data-blk-icoon');
      n2 = C.t.blok.length; await ik.tap(); await wachtOp(async () => C.t.blok.slice(n2).some((x) => x.pad === 'bewaren'), 6000); await P.waitForTimeout(700);
      const mail = (() => { let r = null; const l = (k) => { if (k.id === 't-mail') r = k; (k.kinderen || []).forEach(l); }; return async () => { l((await telefoonBlok()).wortel); return r; }; })();
      const m1 = await mail();
      check(`390 ${thema}: «Змінити значок» vervangt het icoon (uit de set), bewaard`, m1?.icoon?.vervang === icoon, `icoon=${icoon} db=${JSON.stringify(m1?.icoon)}`);
      await shot(P, `390-${thema}-icoon`);
      await P.locator('.blk-zijpaneel .eig-sluit').tap({ timeout: 3000 }).catch(() => undefined); await P.waitForTimeout(300);
      await P.locator(`${WIDGET} [data-knoop-id="t-huis"]`).tap(); await P.waitForTimeout(300);
      n2 = C.t.blok.length; await P.locator('[data-blk-actie="verwijder"]').tap(); await wachtOp(async () => C.t.blok.slice(n2).some((x) => x.pad === 'bewaren'), 6000); await P.waitForTimeout(700);
      const w3 = (await telefoonBlok()).wortel;
      check(`390 ${thema}: «Видалити з блоку» haalt het icoon weg, bewaard`, !ouderVan(w3, 'svc:huis') && tel(w3) === t1 - 1, `aantal=${tel(w3)}`);
    }
    // 5. na de wijzigingen: nog steeds geen overloop/overlap
    const m2 = await P.evaluate((W) => { const w = document.querySelector(W); const wr = w.getBoundingClientRect(); const t = [...w.querySelectorAll('.blk-tegel')].map((e) => e.getBoundingClientRect()); let over = 0; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) { const a = t[i], c = t[j]; if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1) over++; } return { over, buiten: t.filter((r) => r.left < wr.left - 1 || r.right > wr.right + 1).length, klein: t.filter((r) => r.width < 44 || r.height < 44).length, sw: document.documentElement.scrollWidth }; }, WIDGET);
    await P.locator('.blk-zijpaneel .eig-sluit').tap().catch(() => undefined); await P.waitForTimeout(300); await shot(P, `390-${thema}-na`, WIDGET);
    check(`390 ${thema}: na slepen/verplaatsen nog steeds geen overlap/overloop, tikvlak ≥ 44 px`, !m2.over && !m2.buiten && !m2.klein && m2.sw <= 390, JSON.stringify(m2));
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
const ok = uitslag.filter((x) => x.ok).length; console.log(`\n${ok}/${uitslag.length} geslaagd (werkblad-blokken telefoon 390 px, echte backend)`);
process.exit(ok === uitslag.length ? 0 : 1);
