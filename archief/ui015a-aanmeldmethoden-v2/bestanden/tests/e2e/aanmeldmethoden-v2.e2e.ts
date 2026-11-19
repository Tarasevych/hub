// E2E UI-015 — de ECHTE pagina «Способи входу» (src/ToegangslaagWeergave.tsx → vlag aanmeldmethoden-v2 → src/aanmeldmethoden-v2/*)
// in echte Chrome, met nep-API voor de staten: actief, niet-geconfigureerd, fout (500), 403, laden, leeg (veld aanbieders ontbreekt).
// Controleert: oude weergave bij vlag UIT, eerlijke statussen (nooit «Підключено» zonder server), filters/zoeken, paneel (dialog,
// focus-val, Esc, focus terug), TOTP-instellen via de echte routes, deep-links, één snapshot-call, één «?» per blok, tapdoelen,
// geen horizontale overloop 320–1920, logo's geladen, geen geheimen in localStorage. Schermafbeeldingen voor/na, licht/donker, uk/nl.
// Alleen lokaal; elk ander adres wordt afgebroken.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { checker } from '../eenheid/hulp/nep-google';
import { chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/wp-ui015a/uitvoer/screens';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
type Page = import('playwright-core').Page;
type Scen = 'actief' | 'nietgeconf' | 'fout' | '403' | 'laden' | 'leeg';

const basis = (o: { totp?: boolean; aanbieders?: unknown; googleOk?: boolean } = {}) => ({
  architecture: 'access-plane-v1',
  contour: { clientId: 'x', redirectUri: 'https://id.tarasevych.com/', credentialsConfigured: o.googleOk !== false, source: 'env', hasVaultOverride: false, hasPlatformSecret: true, missing: [], lockProtected: true, updatedAt: 1 },
  policy: { enabled: { google: true, password: true }, mfa: 'optional' },
  methods: [
    o.googleOk === false ? { id: 'google', kind: 'login', enabled: true, configured: false, bound: false, status: 'not_configured' } : { id: 'google', kind: 'login', enabled: true, configured: true, bound: true, status: 'active' },
    { id: 'password', kind: 'login', enabled: true, configured: false, bound: false, status: 'not_configured' },
    { id: 'microsoft', kind: 'login', enabled: false, configured: false, bound: false, status: 'disabled', honest: 'needs_provider_contour' },
  ],
  factors: [
    { id: 'totp', enabled: true, enrolled: !!o.totp, status: o.totp ? 'active' : 'not_enrolled' },
    { id: 'recovery', enabled: true, enrolled: true, status: 'active', remaining: 8, createdAt: 1, bekekenOp: 1 },
    { id: 'passkey', enabled: true, enrolled: true, status: 'active', count: 2 },
  ],
  bindings: o.googleOk === false ? [] : [{ id: 'b1', method: 'google', email: 'pavlo.tarasevych@gmail.com', status: 'active' }],
  usableCount: 1, lockout: { protected: true, reason: 'LAST_LOGIN_METHOD_PROTECTED' },
  password: { configured: false, mustChange: false }, totp: { enrolled: !!o.totp }, admin: false,
  ...(o.aanbieders !== undefined ? { aanbieders: o.aanbieders } : {}),
});
const AANBIEDERS_ACTIEF = [
  { id: 'microsoft', status: 'gereed-om-te-koppelen', actieKoppelUrl: '/api/owner/access/aanbieder/microsoft/start', kanLosmaken: true },
  { id: 'apple', status: 'niet-geconfigureerd', kanLosmaken: true },
  { id: 'discord', status: 'niet-geconfigureerd', kanLosmaken: true },
  { id: 'telegram', status: 'uitgeschakeld', reden: { uk: 'Вимкнено правилами сайту', nl: 'Uitgeschakeld door het sitebeleid' }, kanLosmaken: true },
];
const AANBIEDERS_NC = AANBIEDERS_ACTIEF.map((a) => ({ id: a.id, status: 'niet-geconfigureerd', kanLosmaken: true }));

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e aanmeldmethoden-v2');
  const map = mkdtempSync(join(tmpdir(), 'amv2-'));
  await build({ entryPoints: ['tests/e2e/hulp/aanmeldmethoden-stand/stand.tsx'], outdir: map, entryNames: 'stand', bundle: true, format: 'esm', splitting: true, target: 'es2022', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' }, logLevel: 'error' });
  const css = `:root{--veilig-boven:0px;--veilig-onder:0px;--veilig-links:0px;--veilig-rechts:0px}body{margin:0}`;
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stand ui015</title><style>${css}</style><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body><script type="module" src="/stand.js"></script></body></html>`;
  const server = createServer((req, res) => {
    const p = (req.url || '/').split('?')[0];
    if (p === '/canonical-service.js') { res.writeHead(200, { 'content-type': 'text/javascript' }).end(existsSync('public/canonical-service.js') ? readFileSync('public/canonical-service.js') : ''); return; }
    if (p.startsWith('/aanmeldmethoden/') && p.endsWith('.svg')) { const f = normalize(join('public', p)); if (f.startsWith('public/') && existsSync(f)) { res.writeHead(200, { 'content-type': 'image/svg+xml' }).end(readFileSync(f)); return; } }
    const f = join(map, p.replace(/^\/+/, ''));
    if (p !== '/' && existsSync(f) && !p.endsWith('/')) { res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(f)); return; }
    res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const poort = (server.address() as { port: number }).port;
  mkdirSync(UIT, { recursive: true });
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(1) });
  const geweigerd: string[] = [], fouten: string[] = [];
  const open = async (o: { v2?: boolean; scen?: Scen; breedte?: number; donker?: boolean; nl?: boolean; tab?: string; hash?: string; reducedMotion?: boolean }) => {
    const breedte = o.breedte ?? 1440;
    const c = await browser.newContext({ viewport: { width: breedte, height: breedte < 600 ? 844 : breedte <= 1024 ? 1024 : 900 }, colorScheme: o.donker ? 'dark' : 'light', hasTouch: breedte < 600, isMobile: breedte < 600, locale: o.nl ? 'nl-BE' : 'uk-UA', timezoneId: 'Europe/Brussels', reducedMotion: o.reducedMotion ? 'reduce' : 'no-preference' });
    const page = await c.newPage();
    const st = { scen: o.scen ?? 'actief', snapshots: 0, totp: false, otpGestart: false, aanroepen: [] as string[] };
    await page.route('**/*', async (r) => {
      const u = new URL(r.request().url());
      if (u.hostname !== '127.0.0.1' || u.port !== String(poort)) { geweigerd.push(u.href); return r.abort(); }
      if (!u.pathname.startsWith('/api/')) return r.continue();
      st.aanroepen.push(u.pathname);
      let body: any = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch { /* leeg */ }
      const ok = (a: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(a) });
      if (u.pathname.endsWith('/flags/aanmeldmethoden-v2')) return ok({ key: 'aanmeldmethoden-v2', value: !!o.v2 });
      if (u.pathname.includes('/ofrep/')) return ok({ value: false });
      if (u.pathname === '/api/owner/access/snapshot') {
        st.snapshots++;
        if (st.scen === 'laden') return; // nooit antwoorden
        if (st.scen === 'fout') return ok({ error: 'INTERNAL' }, 500);
        if (st.scen === '403') return ok({ error: 'FORBIDDEN' }, 403);
        if (st.scen === 'leeg') return ok(basis({ googleOk: false, totp: st.totp }));
        return ok(basis({ totp: st.totp, aanbieders: st.scen === 'nietgeconf' ? AANBIEDERS_NC : AANBIEDERS_ACTIEF }));
      }
      if (u.pathname === '/api/owner/access/totp/start') { st.otpGestart = true; return ok({ ok: true, otpauth: 'otpauth://totp/MijnRuimte:test?secret=TESTGEHEIM234', secret: 'TESTGEHEIM234' }); }
      if (u.pathname === '/api/owner/access/totp/confirm') { if (body.code === '123456') { st.totp = true; return ok({ ok: true }); } return ok({ error: 'TOTP_CODE_INVALID' }, 400); }
      if (u.pathname === '/api/owner/access/passkeys/lijst') return ok({ rpId: '127.0.0.1', limiet: 10, passkeys: [{ id: 'p1', naam: 'Pixel 9', aanbieder: 'Google Password Manager', soort: 'wachtwoordbeheerder', synchroniseerbaar: true, gesynchroniseerd: true, aangemaaktOp: '2026-10-01T10:00:00Z', laatstGebruiktOp: '2026-10-29T10:00:00Z', vingerafdrukKort: 'ab12' }] });
      if (u.pathname === '/api/owner/access/recovery/overzicht') return ok({ ok: true, totaal: 10, remaining: 8, codes: [] });
      return ok({ ok: true });
    });
    page.on('pageerror', (e) => fouten.push(String(e)));
    await page.goto(`http://127.0.0.1:${poort}/?v2=${o.v2 ? 1 : 0}&taal=${o.nl ? 'nl' : 'uk'}&thema=${o.donker ? 'donker' : 'licht'}&tab=${o.tab || 'methods'}${o.hash ? '#' + o.hash : ''}`);
    await page.waitForSelector(o.v2 ? '.amv2, .access-plane' : '.access-plane', { timeout: 15000 }).catch(async (e) => { console.log('FOUTEN', fouten, (await page.content()).slice(0, 600)); throw e; });
    await page.waitForTimeout(o.scen === 'laden' ? 400 : 700);
    return { c, page, st };
  };
  const shot = (p: Page, naam: string, vol = true) => p.screenshot({ path: join(UIT, `${naam}.png`), fullPage: vol, animations: 'disabled' }).catch(() => undefined);
  const overloop = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const tekst = (p: Page, sel: string) => p.locator(sel).first().innerText().catch(() => '');

  if (process.env.DEBUG) { const { page } = await open({ v2: process.env.DEBUG === '2' }); console.log((await page.content()).slice(0, 3000)); console.log(fouten); await browser.close(); server.close(); return 0; }
  // 1) Vlag UIT: oude weergave, ongewijzigd
  { const { c, page } = await open({ v2: false });
    check('vlag UIT: oude pagina (secties), geen v2', await page.locator('#aanmeldmethoden-google').count() === 1 && await page.locator('.amv2').count() === 0);
    for (const b of [390, 768, 1440]) for (const d of [false, true]) { await page.setViewportSize({ width: b, height: b < 600 ? 844 : 1024 }); await page.evaluate((dk) => { const h = document.documentElement; h.classList.toggle('theme-dark', dk); h.classList.toggle('theme-light', !dk); }, d); await page.waitForTimeout(150); await shot(page, `voor-${b}-${d ? 'donker' : 'licht'}-uk`); }
    await c.close(); }

  // 2) Actief (uk, licht, 1440)
  { const { c, page, st } = await open({ v2: true });
    check('v2: hero + titel', (await tekst(page, '.amv2-hero h2')) === 'Способи входу');
    check('v2: 5 filterchips', await page.locator('.amv2-chip').count() === 5);
    check('v2: één snapshot-call', st.snapshots === 1);
    check('Google: Підключено + e-mail', (await tekst(page, '[data-kaart="google"]')).includes('Підключено') && (await tekst(page, '[data-kaart="google"]')).includes('pavlo.tarasevych@gmail.com'));
    check('Microsoft gereed: knop Підключити met echt pad', await page.locator('[data-kaart="aanbieder:microsoft"] a.amv2-actie[href="/api/owner/access/aanbieder/microsoft/start"]').count() === 1);
    check('Apple niet-geconfigureerd: «Потрібні ключі провайдера», geen knop', (await tekst(page, '[data-kaart="aanbieder:apple"]')).includes('Потрібні ключі провайдера') && await page.locator('[data-kaart="aanbieder:apple"] .amv2-actie').count() === 0);
    check('Telegram uitgeschakeld met reden van server', (await tekst(page, '[data-kaart="aanbieder:telegram"]')).includes('Вимкнено правилами сайту'));
    check('geen aanbieder als «Підключено»', !(await page.locator('[data-kaart^="aanbieder:"]').allInnerTexts()).some((t) => t.includes('Підключено')));
    check('passkey: 2 ключі, herstel: 8', (await tekst(page, '[data-kaart="passkey"]')).includes('Ключів: 2') && (await tekst(page, '[data-kaart="recovery"]')).includes('Залишилося кодів: 8'));
    check('logo’s geladen (5 aanbieders)', await page.evaluate(() => Array.from(document.querySelectorAll<HTMLImageElement>('.amv2-icoon.logo img')).filter((i) => i.complete && i.naturalWidth > 0).length) >= 5);
    check('één «?» per blok (max 1 per groep)', await page.evaluate(() => Array.from(document.querySelectorAll('.amv2-groep, .amv2-hero, .amv2-filter')).every((g) => g.querySelectorAll('.hulp-knop, [aria-describedby], button[aria-expanded][class*="info"], .info-tip-knop').length <= 1)));
    check('tapdoelen ≥44 px (acties, chips, inklap)', await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.amv2-actie, .amv2-chip, .amv2-inklap, .amv2-hero-knop')).every((e) => { const r = e.getBoundingClientRect(); return r.height >= 44 && r.width >= 44; })));
    // filter + zoeken
    await page.click('.amv2-chip:has-text("Passkey")'); await page.waitForTimeout(150);
    check('filter Passkey → alleen passkey', (await page.locator('[data-kaart]').evaluateAll((l) => l.map((e) => e.getAttribute('data-kaart')))).join() === 'passkey');
    await page.click('.amv2-chip:has-text("Усі")');
    await page.fill('.amv2-zoek input', 'відновлення'); await page.waitForTimeout(80);
    const voorDebounce = await page.locator('[data-kaart]').count();
    await page.waitForTimeout(350);
    check('zoeken met debounce', voorDebounce > 1 && (await page.locator('[data-kaart]').evaluateAll((l) => l.map((e) => e.getAttribute('data-kaart')))).join() === 'recovery');
    await page.fill('.amv2-zoek input', 'zzzz'); await page.waitForTimeout(350);
    check('zoeken: leeg-staat met uitleg', (await tekst(page, '.amv2-leeg')).includes('Нічого не знайдено'));
    await page.fill('.amv2-zoek input', ''); await page.waitForTimeout(350);
    // inklappen
    await page.click('.groep-extra .amv2-inklap'); await page.waitForTimeout(100);
    check('groep inklappen (alleen UI-voorkeur)', await page.locator('.groep-extra [data-kaart]').count() === 0 && (await page.evaluate(() => localStorage.getItem('amv2-ingeklapt'))) === '["extra"]');
    await page.click('.groep-extra .amv2-inklap');
    // paneel: Google
    await page.locator('[data-kaart="google"] .amv2-actie').click(); await page.waitForSelector('[role="dialog"][data-paneel="google"]');
    check('paneel: dialog + aria-modal + focus op Закрити', await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return d?.getAttribute('aria-modal') === 'true' && document.activeElement?.classList.contains('amv2-paneel-sluit'); }));
    check('paneel Google: enige methode + link naar Google', (await tekst(page, '[role="dialog"]')).includes('єдиний спосіб входу') && await page.locator('[role="dialog"] a[href="https://myaccount.google.com/security"]').count() === 1);
    await shot(page, 'na-paneel-google-1440-licht-uk', false);
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    check('focus-val: focus blijft in paneel', await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
    await page.click('[role="dialog"] .amv2-knop:has-text("Ваші пристрої")');
    check('«Ваші пристрої» → sessiepagina (onNavigate)', await page.evaluate(() => (window as any).__sessies === 1) && await page.locator('[role="dialog"]').count() === 0);
    await page.locator('[data-kaart="passkey"] .amv2-actie').click(); await page.waitForSelector('[role="dialog"] #aanmeldmethoden-passkeys');
    check('paneel Passkey: bestaande PasskeysSection met lijst', (await tekst(page, '[role="dialog"]')).includes('Pixel 9'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    check('Esc sluit, focus terug op de kaart', await page.locator('[role="dialog"]').count() === 0 && await page.evaluate(() => !!document.activeElement?.closest('[data-kaart="passkey"]')));
    // TOTP instellen via echte routes
    await page.locator('[data-kaart="totp"] .amv2-actie').click(); await page.waitForSelector('[data-paneel="totp"]');
    await page.click('[data-paneel="totp"] .amv2-knop.hoofd'); await page.waitForSelector('[data-paneel="totp"] .amv2-code');
    check('TOTP: start → sleutel alleen in paneel', st.otpGestart && (await tekst(page, '[data-paneel="totp"] .access-plane-secret')) === 'TESTGEHEIM234' && await page.locator('.amv2 > :not(.amv2-laag) :text("TESTGEHEIM234")').count() === 0);
    await page.fill('[data-paneel="totp"] .amv2-code', '123456'); await page.click('[data-paneel="totp"] .amv2-knop.hoofd'); await page.waitForTimeout(500);
    check('TOTP: bevestigd → kaart «Увімкнено» (na nieuwe snapshot)', (await tekst(page, '[data-kaart="totp"]')).includes('Увімкнено') && st.snapshots >= 2);
    await page.keyboard.press('Escape');
    check('geen geheimen in localStorage/sessionStorage', await page.evaluate(() => !/TESTGEHEIM|otpauth|secret/i.test(JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))));
    await c.close(); }

  // 3) Staten
  { const { c, page } = await open({ v2: true, scen: 'laden', breedte: 390 });
    check('laden: skelet (aria-busy), geen «Підключено»', await page.locator('.amv2-kaart.laden[aria-busy="true"]').count() >= 5 && !(await page.locator('.amv2').innerText()).includes('Підключено'));
    await shot(page, 'staat-laden-390-licht-uk'); await c.close(); }
  { const { c, page, st } = await open({ v2: true, scen: 'fout', breedte: 390 });
    check('fout: «Стан не вдалося перевірити» + Повторити', (await tekst(page, '.amv2-banner.fout')).includes('Стан не вдалося перевірити') && await page.locator('.amv2-banner .amv2-knop:has-text("Повторити")').count() === 1);
    check('fout: nergens «Підключено»/«Увімкнено»', !/Підключено|Увімкнено/.test(await page.locator('.amv2').innerText()));
    await shot(page, 'staat-fout-390-licht-uk');
    st.scen = 'actief'; await page.click('.amv2-banner .amv2-knop'); await page.waitForTimeout(500);
    check('Повторити → echte staat geladen', (await tekst(page, '[data-kaart="google"]')).includes('Підключено') && await page.locator('.amv2-banner.fout').count() === 0);
    await c.close(); }
  { const { c, page } = await open({ v2: true, scen: '403', breedte: 390 });
    check('403: «Немає доступу», geen kaarten', (await tekst(page, '.amv2-banner.fout')).includes('Немає доступу') && await page.locator('[data-kaart]').count() === 0);
    await shot(page, 'staat-403-390-licht-uk'); await c.close(); }
  { const { c, page } = await open({ v2: true, scen: 'leeg', breedte: 390 });
    check('leeg: Google zonder sleutels → niet «Підключено»', !(await tekst(page, '[data-kaart="google"]')).includes('Підключено'));
    check('leeg: aanbieders «Сервер ще не підтримує»', (await tekst(page, '[data-kaart="aanbieder:apple"]')).includes('ще не підтримує') || (await page.locator('[data-kaart="aanbieder:apple"]').getAttribute('data-staat')) === 'unavailable');
    await shot(page, 'staat-leeg-390-licht-uk'); await c.close(); }
  { const { c, page } = await open({ v2: true, scen: 'nietgeconf', breedte: 1440 });
    check('niet-geconfigureerd: 4 aanbieders zonder knop', await page.locator('[data-kaart^="aanbieder:"][data-staat="not-configured"]').count() === 4 && await page.locator('[data-kaart^="aanbieder:"] .amv2-actie').count() === 0);
    await shot(page, 'staat-niet-geconfigureerd-1440-licht-uk'); await c.close(); }
  // 4) Deep-links
  { const { c, page } = await open({ v2: true, tab: 'recovery', breedte: 390 });
    check('tab recovery → kaart herstelcodes opgelicht', await page.locator('[data-kaart="recovery"][data-access-actief]').count() === 1); await c.close(); }
  { const { c, page } = await open({ v2: true, hash: 'aanmeldmethoden-passkeys', breedte: 390 });
    check('#aanmeldmethoden-passkeys → paneel passkey open', await page.locator('[data-paneel="passkey"]').count() === 1);
    await shot(page, 'na-paneel-passkey-390-licht-uk', false); await c.close(); }
  // 5) Reduced motion
  { const { c, page } = await open({ v2: true, reducedMotion: true });
    check('reduced-motion: geen animatie op kaarten', await page.evaluate(() => getComputedStyle(document.querySelector('.amv2-kaart')!).transitionDuration.split(',').every((x) => parseFloat(x) === 0))); await c.close(); }
  // 6) Breedtes × thema × taal: overloop + schermafbeeldingen
  const ovl: string[] = [];
  for (const b of [320, 390, 768, 820, 1024, 1440, 1920]) for (const d of [false, true]) for (const nl of [false, true]) {
    const { c, page } = await open({ v2: true, breedte: b, donker: d, nl });
    const o = await overloop(page); if (o > 0) ovl.push(`${b}${d ? 'd' : 'l'}${nl ? 'nl' : 'uk'}:${o}`);
    const afgeknipt = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.amv2-kaart-titel')).filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    if (afgeknipt) ovl.push(`${b}${d ? 'd' : 'l'}${nl ? 'nl' : 'uk'}:titels-afgeknipt=${afgeknipt}`);
    await shot(page, `na-${b}-${d ? 'donker' : 'licht'}-${nl ? 'nl' : 'uk'}`);
    if (b === 390 || b === 1440) { await page.locator('[data-kaart="recovery"] .amv2-actie').click(); await page.waitForTimeout(350); const r = await page.evaluate(() => { const p = document.querySelector('.amv2-paneel')!.getBoundingClientRect(); return p.left >= 0 && p.right <= innerWidth + 0.5 && p.top >= 0; }); if (!r) ovl.push(`${b}:paneel-buiten-beeld`); await shot(page, `na-paneel-herstel-${b}-${d ? 'donker' : 'licht'}-${nl ? 'nl' : 'uk'}`, false); }
    if (nl && b === 1440 && !d) check('nl: alles Nederlands (hero, chips, groepen)', (await tekst(page, '.amv2-hero h2')) === 'Aanmeldmethoden' && (await tekst(page, '.amv2-chip')) === 'Alle' && !(await page.locator('.amv2').innerText()).match(/[а-яіїєґ]{4,}/i));
    await c.close();
  }
  check(`geen horizontale overloop/afgeknipte titels/paneel buiten beeld (28 combinaties)${ovl.length ? ' — ' + ovl.join(' ') : ''}`, ovl.length === 0);
  check('geen JS-fouten', fouten.length === 0); if (fouten.length) console.log(fouten.slice(0, 5));
  check('geen verzoeken buiten de stand', geweigerd.length === 0); if (geweigerd.length) console.log(geweigerd.slice(0, 5));
  await browser.close(); server.close();
  return einde();
}
