// Visuele regressie van complexe HTML-brieven in het ECHTE leesvenster van mail.* (donker thema) op 390, 768 en 1440 px.
// ALLEEN LOKAAL. Corpus: tests/hulp/mails/ (agent 3) als die er is, anders tests/hulp/mails-qa/ (10 eigen synthetische brieven);
// RU_CORPUS=<map> kiest zelf. Lijst en bericht komen uit nepmail in de browser (lokaal geen Gmail); de weergave is de echte.
// Per brief × breedte: (a) schermafdruk van het leesvenster vs basislijn (pixelverschil > RU_DREMPEL %, standaard 0,5) ·
// (b) geen groot wit vlak (> RU_WIT_MAX %, standaard 15) · (c) tekstcontrast ≥ 4,5:1 (groot ≥ 3:1) uit berekende stijlen ·
// (d) vakken gelijk tussen «Оригінал» en de donkere weergave (als de wissel bestaat).
// Gebruik: node scripts/lokaal-e2e/ruimtes-visueel-mail.mjs [--bijwerken] [--filter 05] [--breedtes 390,768,1440]
// Agent 3 heeft daarnaast scripts/visueel-mail.mjs (zuivere omzetting buiten de site); deze suite test de site zelf.
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { alleenLokaal, verslag, startBrowser, context, gegevens, wachtShell, pg, geblokt, paginaFouten } from './ruimtes-gemeen.mjs';
alleenLokaal();
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const BIJWERKEN = process.argv.includes('--bijwerken');
const REPO = new URL('../..', import.meta.url).pathname;
const CORPUS = process.env.RU_CORPUS || (existsSync(`${REPO}tests/hulp/mails`) ? `${REPO}tests/hulp/mails` : `${REPO}tests/hulp/mails-qa`);
const UIT = process.env.SHOTS || '/workspace/ru-uitslag/visueel'; const BASIS = arg('basislijn', `${UIT}/basislijn`); mkdirSync(BASIS, { recursive: true });
const DREMPEL = Number(process.env.RU_DREMPEL || 0.5), WIT_MAX = Number(process.env.RU_WIT_MAX || 15);
const BREEDTES = arg('breedtes', '390,768,1440').split(',').map(Number); const FILTER = arg('filter', '');
const brieven = readdirSync(CORPUS).filter((f) => f.endsWith('.html') && f.includes(FILTER)).sort();
const { check, sluit } = verslag('ruimtes-visueel-mail');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); const G = gegevens(pool);
const EMAIL = process.env.OWNER_EMAIL || 'ru-eigenaar@example.test';
const acc = { id: 'acc-visueel-1', principalId: 'v1', email: 'visueel@example.test', displayName: 'Візуальна перевірка', picture: '', accountRole: 'primary', status: 'connected' };
const berichten = brieven.map((f, i) => ({ id: `vis${1000 + i}`, threadId: `tvis${1000 + i}`, from: `Відправник <v${i}@example.test>`, to: acc.email, subject: `ВІЗУАЛ ${f.replace('.html', '')}`, snippet: f, receivedAt: Date.UTC(2026, 9, 28, 10, 0) - i * 6e4, labelIds: ['INBOX'], unread: false, starred: false, bestand: f }));
const detail = (m) => ({ ...m, internetMessageId: `<${m.id}@example.test>`, cc: '', replyTo: '', plainText: m.bestand, renderBody: { kind: 'html', html: readFileSync(`${CORPUS}/${m.bestand}`, 'utf8'), text: m.bestand, inlineResources: [] }, sizeBytes: 4096, attachments: [], parseWarnings: [] });
async function nepmail(ctx) {
  await ctx.route(/\/api\/owner\/mail\/(google-suite|accounts)\//, async (r) => {
    const pad = new URL(r.request().url()).pathname; const j = (b) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) }); const b = JSON.parse(r.request().postData() || '{}');
    if (pad.endsWith('/google-suite/accounts')) return j({ provider: 'google_gmail', connectEnabled: true, activeAccountId: acc.id, account: acc, accounts: [acc] });
    if (pad.endsWith('/accounts/list')) return j({ accounts: [{ id: acc.id, provider: 'google', email: acc.email, status: 'connected' }] });
    if (pad.endsWith('/google-suite/messages')) return j({ source: 'live', persisted: false, account: acc, messages: berichten.map(({ bestand, ...m }) => m), nextPageToken: '', resultSizeEstimate: berichten.length, observedAt: Date.now() });
    if (pad.endsWith('/google-suite/message')) { const m = berichten.find((x) => x.id === b.messageId); return m ? j({ source: 'live_on_demand', persisted: false, account: acc, message: detail(m) }) : r.fulfill({ status: 404, body: '{}' }); }
    if (pad.endsWith('/google-suite/thread')) { const m = berichten.find((x) => x.threadId === b.threadId); return m ? j({ source: 'live_thread', persisted: false, accountId: acc.id, threadId: b.threadId, messages: [detail(m)] }) : r.fulfill({ status: 404, body: '{}' }); }
    if (pad.endsWith('/period-bounds')) return j({ ready: false, accounts: [], minDate: 0, maxDate: 0 });
    return r.continue();
  });
}
const RUST = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';
// meting in het iframe van de brief: contrast per tekstelement en vakken
const meetIframe = (frame) => frame.evaluate(() => {
  const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return { L: 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b), a }; };
  const achter = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const l = lum(c); if (l && l.a > 0.5) return l.L; } const h = getComputedStyle(document.documentElement).backgroundColor; const l = lum(h); return l && l.a > 0.5 ? l.L : 1; };
  const slecht = []; let n = 0;
  for (const el of document.body.querySelectorAll('*')) {
    if (![...el.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())) continue; const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (s.visibility === 'hidden' || s.display === 'none' || r.width < 1 || r.height < 1 || Number(s.opacity) < 0.1) continue;
    const v = lum(s.color); if (!v) continue; const a = achter(el); const ratio = (Math.max(v.L, a) + 0.05) / (Math.min(v.L, a) + 0.05);
    const px = parseFloat(s.fontSize), vet = Number(s.fontWeight) >= 700; const doel = px >= 24 || (vet && px >= 18.66) ? 3 : 4.5; n++;
    if (ratio < doel) slecht.push(`${el.tagName.toLowerCase()} ${ratio.toFixed(2)}<${doel} «${el.textContent.trim().slice(0, 30)}»`);
  }
  const vakken = [...document.body.querySelectorAll('*')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(','); });
  return { n, slecht, vakken };
});
// pixels: witfractie en verschil met basislijn, berekend in een lege pagina (canvas), geen extra pakketten
async function pixels(hulp, png, basis) {
  return hulp.evaluate(async ([a, b]) => {
    const laad = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = `data:image/png;base64,${s}`; });
    const data = (img, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const A = await laad(a); const w = A.width, h = A.height, d = data(A, w, h); let wit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) wit++;
    let verschil = null, maatAnders = false;
    if (b) { const B = await laad(b); if (!B || B.width !== w || B.height !== h) maatAnders = true; else { const e = data(B, w, h); let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - e[i]) + Math.abs(d[i + 1] - e[i + 1]) + Math.abs(d[i + 2] - e[i + 2]) > 48) n++; verschil = (100 * n) / (w * h); } }
    return { wit: (100 * wit) / (w * h), verschil, maatAnders, w, h };
  }, [png.toString('base64'), basis ? basis.toString('base64') : null]);
}
let uid;
try {
  uid = await G.gebruiker({ email: EMAIL }); const browser = await startBrowser();
  const hulpCtx = await browser.newContext(); const hulp = await hulpCtx.newPage();
  console.log(`corpus: ${CORPUS} (${brieven.length} brieven) × ${BREEDTES.join('/')} px`);
  for (const breedte of BREEDTES) {
    const s = await G.sessieVoor(uid); const { ctx, page } = await context(browser, s, { breedte, thema: 'dark', hoogte: 900 }); await nepmail(ctx);
    await page.goto('https://mail.tarasevych.com/', { waitUntil: 'domcontentloaded' }); await wachtShell(page); await page.addStyleTag({ content: RUST }).catch(() => undefined); await page.waitForTimeout(2500); const lijstUrl = page.url();
    for (const m of berichten) {
      const naam = `${m.bestand.replace('.html', '')}-${breedte}`;
      if (m !== berichten[0]) { const b0 = berichten[0]; const doel = lijstUrl.split(b0.threadId).join(m.threadId).split(b0.id).join(m.id); /* de app opent de eerste brief zelf: adres van die brief ombuigen */ await page.goto(doel, { waitUntil: 'domcontentloaded' }); await wachtShell(page); await page.addStyleTag({ content: RUST }).catch(() => undefined); await page.waitForTimeout(1500); }
      const rij = page.getByText(m.subject).first(); await rij.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => undefined); await rij.click({ timeout: 6000 }).catch(() => undefined);
      // wacht op het iframe met DEZE brief (kenmerk = eerste tekst uit het bestand), niet op een oud iframe
      const kenmerk = readFileSync(`${CORPUS}/${m.bestand}`, 'utf8').replace(/<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).sort((a, b) => b.length - a.length)[0] || '';
      let iframeEl = null, frame = null;
      for (let t = 0; t < 30 && !frame; t++) { for (const el of await page.$$('iframe')) { const f = await el.contentFrame(); const tekst = f ? await f.evaluate(() => document.body?.innerText || '').catch(() => '') : ''; if (tekst.replace(/\s+/g, ' ').includes(kenmerk)) { iframeEl = el; frame = f; break; } } if (!frame) await page.waitForTimeout(300); }
      if (!frame) { await page.screenshot({ path: `${UIT}/fout-${naam}.png` }).catch(() => undefined); check(`${naam}: leesvenster met deze brief geopend`, false, `kenmerk «${kenmerk}» niet gevonden`); continue; }
      await page.waitForTimeout(600);
      await frame.addStyleTag({ content: RUST }).catch(() => undefined);
      const donker = await meetIframe(frame).catch((e) => ({ n: 0, slecht: [String(e)], vakken: [] }));
      const png = await iframeEl.screenshot({ animations: 'disabled' }).catch(() => null); if (!png) { check(`${naam}: schermafdruk`, false); continue; }
      writeFileSync(`${UIT}/${naam}.png`, png); const bPad = `${BASIS}/${naam}.png`; const basis = !BIJWERKEN && existsSync(bPad) ? readFileSync(bPad) : null;
      const px = await pixels(hulp, png, basis);
      check(`${naam}: geen groot wit vlak in donker thema (≤ ${WIT_MAX} %)`, px.wit <= WIT_MAX, `wit=${px.wit.toFixed(1)} % (${px.w}×${px.h})`);
      check(`${naam}: tekstcontrast ≥ 4,5:1 (groot ≥ 3:1)`, donker.slecht.length === 0, `${donker.slecht.length}/${donker.n} te laag: ${donker.slecht.slice(0, 3).join(' | ')}`);
      // «Оригінал» ↔ donker: vakken gelijk (alleen als de wissel bestaat — komt met agent 3)
      // let op: «Оригінал | Переклад» van de vertaling is een andere wissel; alleen de groep met «Темний вигляд» telt
      const groep = page.locator('*:has(> button:has-text("Темний вигляд"))').last(); const wissel = groep.locator('button:has-text("Оригінал")').first();
      if (await groep.count() && await wissel.isVisible().catch(() => false)) {
        await wissel.click(); await page.waitForTimeout(800); const f2 = await (await page.$('iframe'))?.contentFrame(); const orig = f2 ? await meetIframe(f2) : { vakken: [] };
        const anders = orig.vakken.filter((v, i) => v !== donker.vakken[i]).length;
        check(`${naam}: vakken gelijk tussen «Оригінал» en donker`, orig.vakken.length === donker.vakken.length && anders === 0, `elementen ${orig.vakken.length}/${donker.vakken.length}, anders=${anders}`);
        await page.getByRole('button', { name: /Темний/ }).first().click().catch(() => undefined); await page.waitForTimeout(500);
      } else check(`${naam}: wissel «Оригінал / Темний вигляд» aanwezig`, false, 'niet gevonden (komt met agent 3)', 'wissel');
      if (BIJWERKEN || !basis) { writeFileSync(bPad, png); if (!BIJWERKEN) console.log(`     basislijn nieuw: ${naam}`); }
      else check(`${naam}: pixelverschil met basislijn ≤ ${DREMPEL} %`, !px.maatAnders && px.verschil <= DREMPEL, px.maatAnders ? 'andere maat' : `${px.verschil.toFixed(2)} %`);
    }
    await ctx.close();
  }
  await hulpCtx.close(); await browser.close();
} catch (e) { check('suite liep zonder uitzondering', false, e.stack); }
finally { if (uid) await G.opruimen([uid]); await pool.end(); }
check(`0 verzoeken naar andere hosts (${geblokt.length})`, geblokt.length === 0, geblokt.slice(0, 3).join(' '));
check(`geen JS-fouten op de pagina (${paginaFouten.length})`, paginaFouten.length === 0, paginaFouten.slice(0, 3).join(' | '));
process.exit(sluit());
