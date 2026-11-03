// «Geen lekken tussen ruimtes» — E2E tegen de ECHTE lokale backend + PostgreSQL. ALLEEN LOKAAL (zie ruimtes-gemeen.mjs).
// Zaait onderscheidbare PERSOONLIJKE en TECHNISCHE gegevens (meldingen, concepten, zoekgeschiedenis, werkblad) met merktekens
// en controleert in de echte browser en via de API dat niets van de ene ruimte in de andere verschijnt: lijsten, leesvenster na
// het wisselen, teller van de bel (99+), zoekresultaten, browseropslag, HTTP-cachekoppen; 20× heen en terug; twee tabbladen;
// herladen; telefoonbreedte 390 px.
// POST: lokaal bestaat geen Gmail/IMAP. Lijst en leesvenster van de post worden daarom in de BROWSER nagebootst (nepmail per ruimte,
// gekozen door de suite die zelf wisselt). Dat test de klant-kant (het bekende lek: persoonlijke brief blijft open in het
// leesvenster van de technische ruimte). De serverkant van de post dekken de API-proeven op concepten/meldingen/zoeken.
// Gebruik: eval "$(scripts/lokaal-e2e/ruimtes-start.sh | tail -1)"; node scripts/lokaal-e2e/ruimtes-lekkage.mjs
import { alleenLokaal, verslag, startBrowser, context, gegevens, totpHulp, menu, wachtShell, inPagina, pg, geblokt, paginaFouten } from './ruimtes-gemeen.mjs';
import { randomUUID } from 'node:crypto'; import { mkdirSync } from 'node:fs';
alleenLokaal();
const SHOTS = process.env.SHOTS || '/workspace/ru-uitslag/lekkage'; mkdirSync(SHOTS, { recursive: true });
const { check, sluit } = verslag('ruimtes-lekkage');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const G = gegevens(pool); const T = totpHulp();
const P = 'ОСОБИСТЕ-МІТКА', K = 'ТЕХНІЧНЕ-МІТКА';           // merktekens: persoonlijk / technisch
const EMAIL = process.env.OWNER_EMAIL || 'ru-eigenaar@example.test';
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` }).catch(() => undefined);

// ── nepmail per ruimte (zie kop) ──
let ruimteNu = 'prive';
const acc = { id: 'acc-prive-1', principalId: 'p1', email: 'osobyste@example.test', displayName: 'Особиста пошта', picture: '', accountRole: 'primary', status: 'connected' };
const berichten = Array.from({ length: 6 }, (_, i) => ({ id: `prive${1000 + i}`, threadId: `tprive${1000 + i}`, from: `Друг ${i} <drug${i}@example.test>`, to: acc.email, subject: `${P} лист ${i}`, snippet: `${P} уривок ${i}`, receivedAt: Date.now() - i * 36e5, labelIds: ['INBOX'], unread: i < 3, starred: false }));
const detail = (m) => ({ ...m, internetMessageId: `<${m.id}@example.test>`, cc: '', replyTo: '', plainText: `${P} тіло ${m.id}`, renderBody: { kind: 'html', html: `<div style="background:#fff;color:#000"><h2>${P} тіло ${m.id}</h2><p>Приватний зміст.</p></div>`, text: `${P} тіло`, inlineResources: [] }, sizeBytes: 2048, attachments: [], parseWarnings: [] });
const leeg = { provider: 'google_gmail', connectEnabled: true, activeAccountId: '', account: null, accounts: [] };
async function nepmail(ctx) {
  await ctx.route(/\/api\/owner\/mail\/(google-suite|accounts)\//, async (r) => {
    const pad = new URL(r.request().url()).pathname; const prive = ruimteNu === 'prive';
    const j = (b) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(b) });
    if (pad.endsWith('/google-suite/accounts')) return j(prive ? { provider: 'google_gmail', connectEnabled: true, activeAccountId: acc.id, account: acc, accounts: [acc] } : leeg);
    if (pad.endsWith('/accounts/list')) return j({ accounts: prive ? [{ id: acc.id, provider: 'google', email: acc.email, status: 'connected' }] : [] });
    if (pad.endsWith('/google-suite/messages')) return j({ source: 'live', persisted: false, account: prive ? acc : null, messages: prive ? berichten : [], nextPageToken: '', resultSizeEstimate: prive ? berichten.length : 0, observedAt: Date.now() });
    if (pad.endsWith('/google-suite/message')) { const id = JSON.parse(r.request().postData() || '{}').messageId; const m = berichten.find((x) => x.id === id); return prive && m ? j({ source: 'live_on_demand', persisted: false, account: acc, message: detail(m) }) : r.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED"}' }); }
    if (pad.endsWith('/google-suite/thread')) { const id = JSON.parse(r.request().postData() || '{}').threadId; const m = berichten.find((x) => x.threadId === id); return prive && m ? j({ source: 'live_thread', persisted: false, accountId: acc.id, threadId: id, messages: [detail(m)] }) : r.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"GOOGLE_MAIL_ACCOUNT_NOT_CONNECTED"}' }); }
    if (pad.endsWith('/period-bounds')) return j({ ready: false, accounts: [], minDate: 0, maxDate: 0 });
    if (pad.endsWith('/labels')) return j({ labels: [] });
    return r.continue();
  });
}

// ── wat de pagina toont / bewaart ──
const zichtbaar = (page) => page.evaluate(() => document.body.innerText);
const inBeeld = async (page, merk) => (await zichtbaar(page)).split(merk).length - 1;
const opslag = (page) => page.evaluate(async () => {
  const uit = { lokaal: JSON.stringify(Object.entries(localStorage)), sessie: JSON.stringify(Object.entries(sessionStorage)), idb: '', caches: '', sw: 0 };
  try { for (const d of await indexedDB.databases()) { uit.idb += `|db:${d.name}`; const db = await new Promise((ok, nee) => { const q = indexedDB.open(d.name); q.onsuccess = () => ok(q.result); q.onerror = () => nee(q.error); });
    for (const s of db.objectStoreNames) { const rijen = await new Promise((ok) => { try { const q = db.transaction(s).objectStore(s).getAll(undefined, 400); q.onsuccess = () => ok(q.result); q.onerror = () => ok([]); } catch { ok([]); } }); try { uit.idb += JSON.stringify(rijen).slice(0, 200000); } catch {} } db.close(); } } catch (e) { uit.idb += String(e); }
  try { for (const k of await caches.keys()) { uit.caches += `|${k}`; const c = await caches.open(k); for (const q of await c.keys()) uit.caches += ` ${q.url}`; } } catch {}
  try { uit.sw = (await navigator.serviceWorker.getRegistrations()).length; } catch {}
  return uit; });
const isTechnisch = async (page) => (await page.locator('.tech-band').count()) > 0;
const bel = (page) => page.evaluate(() => [...document.querySelectorAll('[class*="badge"], [class*="teller"], [data-teller], .canonical-notification-count, [aria-label*="сповіщ" i]')].map((x) => (x.textContent || '').trim()).filter((t) => /^\d+\+?$/.test(t)));

async function naarTechnisch(page, eerste = false) {
  ruimteNu = 'technisch';
  if (await isTechnisch(page)) return true;
  await menu(page); await page.click('[data-ruimtes-menu] .rw [data-naar="technisch"]').catch(() => undefined);
  const venster = await page.waitForSelector('[data-tech-venster="ruimte-start"]', { timeout: eerste ? 15000 : 2500, state: 'attached' }).then(() => true, () => false);
  if (venster) { await page.click('.rs-chip[data-minuten="60"]').catch(() => page.click('.rs-chip').catch(() => undefined)); if (await page.locator('[data-rs-reden]').count()) await page.fill('[data-rs-reden]', 'E2E lekkage ruimtes'); await page.click('[data-tech-knop="ruimte-start"]'); }
  await T.stapOp(page, venster ? 5000 : 1500);
  await page.waitForSelector('.tech-band', { timeout: 8000 }).catch(() => undefined); await page.keyboard.press('Escape').catch(() => undefined);
  await page.waitForTimeout(900); return isTechnisch(page);
}
async function naarPrive(page) {
  ruimteNu = 'prive'; if (!(await isTechnisch(page))) return true;
  await menu(page); await page.click('[data-ruimtes-menu] .rw [data-naar="prive"]').catch(() => undefined);
  await page.waitForFunction(() => !document.querySelector('.tech-band'), undefined, { timeout: 6000 }).catch(() => undefined);
  await page.keyboard.press('Escape').catch(() => undefined); await page.waitForTimeout(900); return !(await isTechnisch(page));
}
// hub-routes (werkblad) in een tweede tabblad op hub.* van dezelfde aanmelding
async function hubProef(page, pad, body) { const h = await page.context().newPage(); await h.goto('https://hub.tarasevych.com/', { waitUntil: 'domcontentloaded' }); await wachtShell(h); await h.waitForTimeout(1200); const r = await inPagina(h, pad, body, 'hub'); await h.close(); return r; }
const ALLEEN = process.env.RU_ALLEEN || '';
const API = [
  ['/api/bootstrap', {}], ['/api/owner/mail/compose/draft/list', {}], ['/api/owner/zoek/geschiedenis/lijst', { limiet: 50 }], ['/api/owner/hub/werkblad/v3/laden', {}],
];
async function apiProef(page, eigen, vreemd, label) {
  for (const [pad, body] of API) {
    const r = pad.includes('/hub/') ? await hubProef(page, pad, body) : await inPagina(page, pad, body, new URL(page.url()).hostname.split('.')[0]);
    check(`${label}: API ${pad} bevat niets van de andere ruimte`, !r.tekst.includes(vreemd), `status=${r.status} vreemd=${r.tekst.split(vreemd).length - 1} eigen=${r.tekst.split(eigen).length - 1}`);
    const cc = String(r.kop['cache-control'] || '');
    check(`${label}: API ${pad} niet cachebaar (Cache-Control: no-store of private)`, /no-store|private/.test(cc), `cache-control=«${cc}» vary=«${r.kop.vary || ''}»`);
  }
}

let uid;
try {
  // ── zaaien ──
  uid = await G.gebruiker({ email: EMAIL }); await T.zaai(pool, uid); await G.vlag('tech-ruimtes-v2', true, [uid]); await G.vlag('ruimtes-scheiding', process.env.RU_SCHEIDING === '1', [uid]);
  await pool.query(`DELETE FROM app.records WHERE tbl='site_notifications' AND data->>'recipientUserId'=$1`, [uid]);
  for (let i = 0; i < 120; i++) await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['site_notifications', randomUUID(), { recipientUserId: uid, recipientEmail: EMAIL, kind: 'workspace_share', title: `${P} сповіщення ${i}`, message: `${P} особисте ${i}`, read: false, createdAt: Date.now() - i * 1000, ruimte: 'prive', sfeer: 'prive' }]);
  for (let i = 0; i < 7; i++) await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['site_notifications', randomUUID(), { recipientUserId: uid, recipientEmail: EMAIL, kind: 'uitrol.mislukt', title: `${K} сповіщення ${i}`, message: `${K} технічне ${i}`, read: false, createdAt: Date.now() - i * 1000, ruimte: 'technisch', sfeer: 'technisch' }]);
  await pool.query(`DELETE FROM app.mail_drafts WHERE user_id=$1`, [uid]);
  for (const [ruimte, m] of [['prive', P], ['technisch', K]]) await pool.query(`INSERT INTO app.mail_drafts (id,user_id,local_id,account_id,thread_id,to_addrs,cc_addrs,bcc_addrs,subject,html,plain_text,gmail_draft_id,sync_status,sync_error,version,created_at,updated_at,ruimte) VALUES ($1,$2,$3,'','','a@example.test','','',$4,$5,$4,'','local','',1,now(),now(),$6)`, [randomUUID(), uid, `ru-${ruimte}`, `${m} чернетка`, `<p>${m} чернетка</p>`, ruimte]).catch((e) => check('zaaien: concepten', false, e.message));
  await pool.query(`INSERT INTO app.werkblad_v3_lade (user_id, ruimte, achtergrond) VALUES ($1,'prive','zee'),($1,'technisch','avond') ON CONFLICT (user_id, ruimte) DO UPDATE SET achtergrond=EXCLUDED.achtergrond`, [uid]).catch((e) => check('zaaien: werkblad', false, e.message));

  const browser = await startBrowser();
  if (!ALLEEN) {
  // ── 1. persoonlijk: post open, leesvenster met persoonlijke brief ──
  const s = await G.sessieVoor(uid); const { ctx, page } = await context(browser, s); await nepmail(ctx);
  await page.goto('https://mail.tarasevych.com/', { waitUntil: 'domcontentloaded' }); await wachtShell(page); await page.waitForTimeout(2500);
  await naarPrive(page);
  const zoekGesch = await inPagina(page, '/api/owner/zoek/geschiedenis/bewaren', { vraag: `${P} пошук`, treffers: 1, totaal: 1 }, 'mail');
  check('persoonlijk: zoekgeschiedenis bewaren (zaaien via API)', zoekGesch.status < 400, `${zoekGesch.status} ${zoekGesch.tekst.slice(0, 120)}`);
  check('persoonlijk: lijst toont persoonlijke brieven', await inBeeld(page, `${P} лист`) >= 1, `aantal=${await inBeeld(page, `${P} лист`)}`);
  await page.getByText(`${P} лист 0`).first().click().catch(() => undefined); await page.waitForTimeout(1500);
  const pane = await inBeeld(page, `${P} тіло`) + await page.evaluate((m) => [...document.querySelectorAll('iframe')].reduce((n, f) => { try { return n + (f.contentDocument?.body?.innerText.includes(m) ? 1 : 0); } catch { return n; } }, 0), `${P} тіло`);
  check('persoonlijk: leesvenster toont de persoonlijke brief (voorwaarde voor de lektest)', pane >= 1, `pane=${pane}`);
  check('persoonlijk: geen technische merktekens in beeld', await inBeeld(page, K) === 0, `${await inBeeld(page, K)}`);
  const belP = await bel(page); check('persoonlijk: bel telt persoonlijke meldingen (99+)', belP.some((t) => t === '99+'), JSON.stringify(belP));
  await shot(page, '01-prive-leesvenster');
  await apiProef(page, P, K, 'persoonlijk');

  // ── 2. wissel naar technisch: lijst, leesvenster, bel, opslag ──
  const t1 = await naarTechnisch(page, true);
  check('wissel naar technisch gelukt (echte TOTP-stap-op)', t1);
  const lekP = await inBeeld(page, P); const lekFrames = await page.evaluate((m) => [...document.querySelectorAll('iframe')].filter((f) => { try { return f.contentDocument?.body?.innerText.includes(m); } catch { return false; } }).length, P);
  check('technisch: GEEN persoonlijke brief in lijst of leesvenster (bekend lek)', lekP === 0 && lekFrames === 0, `tekst=${lekP} iframes=${lekFrames} fragment=${(await zichtbaar(page)).split('\n').filter((l) => l.includes(P)).slice(0, 3).join(' / ')}`);
  const belT = await bel(page); check('technisch: bel toont NIET de persoonlijke 99+', !belT.includes('99+'), JSON.stringify(belT));
  await shot(page, '02-technisch-na-wissel');
  await apiProef(page, K, P, 'technisch');
  const st = await opslag(page);
  check('technisch: localStorage zonder persoonlijke merktekens', !st.lokaal.includes(P), `treffers=${st.lokaal.split(P).length - 1}`, 'streng');
  check('technisch: sessionStorage zonder persoonlijke merktekens', !st.sessie.includes(P), `treffers=${st.sessie.split(P).length - 1}`, 'streng');
  check('technisch: IndexedDB zonder persoonlijke merktekens', !st.idb.includes(P), `treffers=${st.idb.split(P).length - 1} dbs=${(st.idb.match(/\|db:[^|"\[]*/g) || []).join('')}`, 'streng');
  check('technisch: Cache Storage zonder persoonlijke brieven/API-antwoorden', !/\/api\/owner\/|acc-prive-1|\/message\/prive/.test(st.caches), st.caches.slice(0, 240), 'streng');

  // ── 3. herladen in technisch ──
  await page.reload({ waitUntil: 'domcontentloaded' }); await wachtShell(page); await page.waitForTimeout(2500);
  check('herladen in technisch: blijft technisch en toont niets persoonlijks', await isTechnisch(page) && await inBeeld(page, P) === 0, `tech=${await isTechnisch(page)} lek=${await inBeeld(page, P)}`);
  await shot(page, '03-technisch-herladen');

  // ── 4. twee tabbladen ──
  const B = await ctx.newPage(); B.on('pageerror', (e) => paginaFouten.push(e.message.slice(0, 200)));
  await B.goto('https://mail.tarasevych.com/', { waitUntil: 'domcontentloaded' }); await wachtShell(B); await B.waitForTimeout(2500);
  const bTech = await isTechnisch(B);
  check('tweede tabblad: toont alleen gegevens van de ruimte die het zelf aangeeft', bTech ? await inBeeld(B, P) === 0 : await inBeeld(B, K) === 0, `B-technisch=${bTech} P=${await inBeeld(B, P)} K=${await inBeeld(B, K)}`);
  await shot(B, '04-tweede-tabblad'); await B.close(); await page.bringToFront();

  // ── 5. 20× heen en terug ──
  const fouten = [];
  for (let i = 0; i < 20; i++) {
    const naarT = i % 2 === 1; const ok = naarT ? await naarTechnisch(page) : await naarPrive(page);
    if (!ok) { fouten.push(`${i}:wissel mislukt`); continue; }
    if (!naarT) { await page.getByText(`${P} лист ${i % 6}`).first().click().catch(() => undefined); await page.waitForTimeout(500); }
    const vreemd = naarT ? P : K; const n = await inBeeld(page, vreemd); const b = await bel(page);
    if (n) fouten.push(`${i}:${naarT ? 'T' : 'P'} lek=${n}`); if (naarT && b.includes('99+')) fouten.push(`${i}:bel 99+`);
  }
  check('20× wisselen: nooit gegevens van de andere ruimte in beeld', fouten.length === 0, fouten.slice(0, 8).join(', '));
  await shot(page, '05-na-20-wissels');
  await ctx.close();
  }
  // ── 6. telefoon 390 px ──
  { ruimteNu = 'prive'; const s2 = await G.sessieVoor(uid); const { ctx: c2, page: p2 } = await context(browser, s2, { breedte: 390 }); await nepmail(c2);
    await p2.goto('https://mail.tarasevych.com/', { waitUntil: 'domcontentloaded' }); await wachtShell(p2); await p2.waitForTimeout(2500);
    await naarPrive(p2); await p2.getByText(`${P} лист 1`).first().click().catch(() => undefined); await p2.waitForTimeout(1500);
    const voor = await inBeeld(p2, P); await shot(p2, '06-390-prive');
    await menu(p2); await shot(p2, '06b-390-menu'); await p2.keyboard.press('Escape');
    const ok = await naarTechnisch(p2, true); const na = await inBeeld(p2, P); const b = await bel(p2);
    check('390 px: na wissel naar technisch niets persoonlijks in beeld, geen 99+', ok && voor > 0 && na === 0 && !b.includes('99+'), `wissel=${ok} voor=${voor} na=${na} bel=${JSON.stringify(b)}`);
    await shot(p2, '07-390-technisch'); await c2.close(); }
  await browser.close();
} catch (e) { check('suite liep zonder uitzondering', false, e.stack); }
finally {
  if (uid) { await G.opruimen([uid]); await pool.query(`DELETE FROM app.mail_drafts WHERE user_id=$1`, [uid]).catch(() => undefined); await pool.query(`DELETE FROM app.zoek_geschiedenis WHERE user_id=$1`, [uid]).catch(() => undefined); }
  await pool.query(`UPDATE app.feature_flags SET aan=false, gebruikers='{}' WHERE sleutel IN ('tech-ruimtes-v2','ruimtes-scheiding')`).catch(() => undefined);
  await pool.end();
}
check(`0 verzoeken naar andere hosts (${geblokt.length})`, geblokt.length === 0, geblokt.slice(0, 3).join(' '));
check(`geen JS-fouten op de pagina (${paginaFouten.length})`, paginaFouten.length === 0, paginaFouten.slice(0, 3).join(' | '));
process.exit(sluit());
