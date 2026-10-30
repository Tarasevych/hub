// UI-002 e2e: fotodienst + menuverhuizing. Lokaal, nooit tegen productie.
// Env: DATABASE_URL, E2E_PROXY_PORT (standaard 8443), E2E_UIT (map voor screenshots), PLAYWRIGHT_CORE (pad naar playwright-core).
import pg from 'pg'; import { createHash, randomBytes, randomUUID } from 'node:crypto'; import { mkdirSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const POORT = process.env.E2E_PROXY_PORT || '8443'; const UIT = process.env.E2E_UIT || '/tmp/pw-foto'; mkdirSync(UIT, { recursive: true });
const FIX = new URL('../../tests/fixtures/foto/', import.meta.url).pathname;
const sha = v => createHash('sha256').update(v).digest('hex');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const res = []; const check = (n, ok, i = '') => { res.push(ok); console.log(`${ok ? 'OK  ' : 'FOUT'} ${n}${i ? ' — ' + i : ''}`); };
const vlaggen = async aan => pool.query("update app.feature_flags set aan=$1, standaard=$1 where sleutel in ('foto-dienst','menu-kalender-foto-eigen')", [aan]);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: [`--host-resolver-rules=MAP *.tarasevych.com 127.0.0.1:${POORT}, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1`, '--no-sandbox'] });
const nu = Date.now(); const uid = randomUUID(); const sid = randomUUID(); const token = randomBytes(32).toString('base64url');
await pool.query("delete from app.records where tbl='users' and data->>'email'='e2e-eigenaar@example.test'");
await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['users', uid, { email: 'e2e-eigenaar@example.test', sub: 'e2e', name: 'E2E Eigenaar', picture: '', role: 'owner', status: 'approved', accessLevel: 'full', entitlements: [], createdAt: nu, updatedAt: nu }]);
await pool.query('insert into app.records (tbl,id,data) values ($1,$2,$3)', ['owner_service_sessions_v1', sid, { tokenHash: sha(token), userId: uid, service: 'hub', sourceOrigin: 'https://hub.tarasevych.com', tabHash: sha('ecosystem'), createdAt: nu, authenticatedAt: nu, lastSeenAt: nu, idleExpiresAt: nu + 864e5, absoluteExpiresAt: nu + 7 * 864e5, rotation: 0, version: 1, revocationEpoch: 0, ip: '198.51.100.9', userAgent: 'e2e', authMethod: 'google', scope: 'ecosystem' }]);
const errors = [];
async function context(w, h, schema) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: w, height: h }, colorScheme: schema, locale: 'uk-UA' });
  await ctx.addCookies([{ name: '__Secure-tsv_ecosystem_migrated-bg2v4h', value: encodeURIComponent(`${sid}.${token}`), domain: '.tarasevych.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|401|404|SSL certificate error/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  return { ctx, p };
}
const ga = async (p, url) => { await p.goto(url, { waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(1800); };
const apiPost = (p, pad) => p.evaluate(async pad => { const r = await fetch('/api/owner/foto/' + pad, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'hub', tabContext: 'ecosystem', sourceOrigin: location.origin }) }); return { status: r.status, data: await r.json().catch(() => null) }; }, pad);
const tekst = async p => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
try {
  // 1. Vlaggen UIT: geen «Фото» in Мій простір, cloud houdt Календар/Фото.
  await vlaggen(false);
  let { ctx, p } = await context(1440, 900, 'light');
  await ga(p, 'https://hub.tarasevych.com/photos'); await p.screenshot({ path: `${UIT}/voor-hub-1440-licht.png` });
  check('vlag UIT: hub/photos valt terug (geen fotodienst)', p.url().indexOf('/photos') < 0 || !(await tekst(p)).includes('Стрічка'), p.url());
  await ga(p, 'https://cloud.tarasevych.com/calendar'); await p.screenshot({ path: `${UIT}/voor-cloud-1440-licht.png` });
  check('vlag UIT: cloud/calendar blijft op cloud', p.url().startsWith('https://cloud.'), p.url());
  await ga(p, 'https://hub.tarasevych.com/'); const api = (await apiPost(p, 'bronnen')).status;
  check('vlag UIT: API antwoordt 404', api === 404, String(api));
  await ctx.close();
  // 2. Vlaggen AAN.
  await vlaggen(true);
  ({ ctx, p } = await context(1440, 900, 'light'));
  await p.addInitScript(() => { for (const k of Object.keys(sessionStorage)) if (k.startsWith('mr-vlag:')) sessionStorage.removeItem(k); });
  await ga(p, 'https://cloud.tarasevych.com/calendar');
  check('vlag AAN: cloud/calendar → hub/calendar', /hub\.tarasevych\.com\/(calendar|agenda)/.test(p.url()), p.url());
  await ga(p, 'https://cloud.tarasevych.com/photos');
  check('vlag AAN: cloud/photos → hub/photos', /hub\.tarasevych\.com\/(photos|fotos)/.test(p.url()), p.url());
  await ga(p, 'https://cloud.tarasevych.com/photos?kiezer=1');
  check('cloud/photos?kiezer=1 blijft op cloud (Google-kiezer)', p.url().startsWith('https://cloud.'), p.url());
  await ga(p, 'https://hub.tarasevych.com/photos'); await p.screenshot({ path: `${UIT}/leeg-hub-1440-licht.png` });
  const t0 = await tekst(p); check('hub/photos toont fotodienst', t0.includes('Стрічка') && t0.includes('Альбоми'), t0.slice(0, 160));
  // Import van archieven via de echte UI-invoer.
  await p.getByRole('button', { name: /Джерела/ }).first().click().catch(() => {}); await p.waitForTimeout(800);
  await p.screenshot({ path: `${UIT}/bronnen-1440-licht.png`, fullPage: true });
  for (const f of ['takeout.zip', 'instagram.zip', 'facebook.zip', 'telegram.zip', 'flickr.zip']) {
    await p.locator("input[type=file][accept^='.zip']").setInputFiles(FIX + f); await p.waitForTimeout(500);
    await p.waitForFunction(() => !document.body.innerText.match(/Імпорт триває|Імпортую/), null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(1500);
  }
  await p.locator("input[type=file][accept^='image']").setInputFiles([FIX + 'los-exif.jpg']); await p.waitForTimeout(4000);
  const bibR = await apiPost(p, 'bibliotheek'); const bib = bibR.data || { status: bibR.status };
  const n = bib.totaal ?? bib.stats?.totaal ?? (bib.items || []).length;
  check('import via UI: items in bibliotheek', n >= 6, JSON.stringify({ n, bronnen: bib.facetten?.bronnen || bib.facets?.bronnen }).slice(0, 300));
  await p.screenshot({ path: `${UIT}/na-import-bronnen-1440-licht.png`, fullPage: true });
  await p.getByRole('button', { name: /Стрічка/ }).first().click().catch(() => {}); await p.waitForTimeout(3000);
  // Kijker openen.
  const tegel = p.locator('.foto-tegel, .foto-grid button, [class*=foto-tegel]').first();
  if (await tegel.count()) { await tegel.click(); await p.waitForTimeout(1500); }
  const kijker = await p.locator('.foto-viewer').count(); check('kijker opent', kijker > 0);
  await p.screenshot({ path: `${UIT}/kijker-1440-licht.png` });
  if (kijker) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await p.waitForTimeout(500); check('kijker sluit met Escape', (await p.locator('.foto-viewer').count()) === 0); }
  await ctx.close();
  // 3. Screenshots 390/768/1440 × licht/donker.
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]]) for (const s of ['light', 'dark']) {
    ({ ctx, p } = await context(w, h, s));
    await ga(p, 'https://hub.tarasevych.com/photos'); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${UIT}/stream-${w}-${s === 'light' ? 'licht' : 'donker'}.png` });
    const klein = await p.evaluate(() => [...document.querySelectorAll('.foto-pagina button, .foto-pagina select, .foto-pagina input:not([type=file]):not([type=checkbox])')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44) && getComputedStyle(e).display !== 'none'; }).map(e => `${e.className}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`));
    check(`tikdoelen ≥44px @${w} ${s}`, klein.length === 0, klein.slice(0, 5).join(', '));
    const overloop = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); check(`geen horizontale overloop @${w} ${s}`, !overloop);
    await p.getByRole('button', { name: /Альбоми/ }).first().click().catch(() => {}); await p.waitForTimeout(800);
    await p.screenshot({ path: `${UIT}/albums-${w}-${s === 'light' ? 'licht' : 'donker'}.png` });
    await p.getByRole('button', { name: /Упорядкувати/ }).first().click().catch(() => {}); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${UIT}/ordenen-${w}-${s === 'light' ? 'licht' : 'donker'}.png` });
    await ga(p, 'https://cloud.tarasevych.com/files'); await p.screenshot({ path: `${UIT}/na-cloud-${w}-${s === 'light' ? 'licht' : 'donker'}.png` });
    if (w === 1440 && s === 'light') { const tc = await tekst(p); check('cloudmenu zonder Календар/Фото (vlag AAN)', !/\bКалендар\b/.test(tc) || !/\bФото\b/.test(tc), ''); }
    await ctx.close();
  }
  check('geen paginafouten', errors.length === 0, errors.slice(0, 5).join(' | '));
} finally { await browser.close(); await pool.end(); }
console.log(`${res.filter(Boolean).length}/${res.length} geslaagd (foto-dienst-ui e2e)`); process.exit(res.every(Boolean) ? 0 : 1);
