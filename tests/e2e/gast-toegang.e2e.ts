// E2E §13.11 «Коди доступу для інших» + gastpagina /toegang + «Сесії», met een echte Chrome (opzet zoals toegang-context.e2e.ts).
// 1. Eigenaar voegt een passkey toe (Google-step-up, gestubd) en maakt een code «Для Олени» (profiel + apparaten, eigen datum,
//    max. 3×). De Google-step-up volstaat niet (STEP_UP_STRONG_REQUIRED) → venster zonder Google-knop → passkey → code één keer getoond.
// 2. Gast (tweede context, geen cookies van de eigenaar) opent de deellink …/toegang#code=… → banner «Гостьовий доступ від … до …».
// 3. Gast geweigerd buiten de scope: journaal/sleutels (403), eigenaarsroutes (401), /methods toont geen eigenaarsgegevens.
// 4. Eigenaar ziet gebruik (1 з 3, apparaat, IP-hash), de geschiedenis (ingewisseld, bekeken, geweigerd), de bel en het journaal.
// 5. «Сесії»: gastsessies met code-naam; één gastsessie afzonderlijk beëindigen.
// 6. Intrekken met reden → gastsessie meteen weg. 7. Verloop → gast weg, code «Закінчився».
// 8. «Завершити всі інші»: andere eigenaarssessie en gastsessies weg, deze blijft.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
// Eigenaar: 403 step-up-vensters + agents/activity. Gast: 401/403/400 op /api/gast en 401 op eigenaarsroutes zijn de bedoeling.
const VERWACHT = [/^403 .*\/api\/owner\/access\/(passkeys\/registreren\/opties|toegangscodes\/(maken|wijzigen))$/, /^403 .*\/api\/owner\/agents\/activity$/];
const GAST_VERWACHT = [/^40[0-3] .*\/api\/gast\//, /^401 .*\/api\/owner\//, /^429 .*\/api\/gast\/inwisselen$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e gast-toegang');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  type Ctx = import('playwright-core').BrowserContext;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-gt-${T}@example.test`, sub = `sub-e2e-gt-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const oud = Math.floor(Date.now() / 1000) - 3600;
  try {
    const stub = { sub, email: eigenaar };
    const sessie = async (scheme: 'dark' | 'light' = 'dark') => {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      const r = await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login', authTime: oud });
      const ctx = await browser.newContext({ colorScheme: scheme, locale: 'uk-UA', viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
      await ctx.route('https://accounts.google.com/**', async (route) => {
        const u = new URL(route.request().url());
        const code = G.codeVoor(stub.sub, stub.email, u.searchParams.get('nonce') || '', Math.floor(Date.now() / 1000));
        const terug = new URL(u.searchParams.get('redirect_uri') || `${ID}/`);
        terug.searchParams.set('state', u.searchParams.get('state') || ''); terug.searchParams.set('code', code);
        await route.fulfill({ status: 302, headers: { location: terug.href } });
      });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
      return { ctx, r, tab, page };
    };
    const gastContext = async (scheme: 'dark' | 'light' = 'light') => {
      const ctx = await browser.newContext({ colorScheme: scheme, locale: 'uk-UA', viewport: { width: 1100, height: 820 }, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block' });
      return { ctx, page: await ctx.newPage() };
    };
    const volg = (page: Page, lijst: string[], extra: RegExp[] = []) => {
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) lijst.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => lijst.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && ![...VERWACHT, ...extra].some((v) => v.test(k))) lijst.push(`http ${k}`); });
    };
    const pk = (page: Page) => page.locator('[data-access-section="passkeys"]');
    const tc = (page: Page) => page.locator('[data-access-section="toegangscodes"]');
    const open = async (page: Page) => { await page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' }); await tc(page).waitFor({ timeout: 20000 }); await page.waitForTimeout(400); };
    const gastSessieId = async (ctx: Ctx) => String((await ctx.cookies(`${ID}/api/gast/sessie`)).find((c) => c.name === 'tsv_gast')?.value || '').split('.')[0];
    const gastPost = (page: Page, pad: string, body: unknown = {}) => page.evaluate(async ([p, b]) => { const r = await fetch(p as string, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, data: await r.json().catch(() => ({})) as Record<string, unknown> }; }, [pad, body] as const);
    const kijkNu = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const weg = async (page: Page) => { await page.locator('[data-gast-inwisselen] .gast-melding').waitFor({ timeout: 10000 }).catch(() => undefined); return /Гостьову сесію завершено/.test(await page.locator('[data-gast-inwisselen]').innerText().catch(() => '')); };
    const verwerkVenster = async (page: Page, wat: string) => {
      const v = page.getByRole('dialog');
      const komt = await v.waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
      if (!komt) return 'geen';
      await page.waitForTimeout(250);
      const zonderGoogle = await v.getByRole('button', { name: /Google/ }).count() === 0;
      check(`${wat}: sterk venster zonder Google-knop`, zonderGoogle, (await v.innerText()).slice(0, 200));
      await v.getByRole('button', { name: 'Використати passkey' }).click();
      return 'passkey';
    };
    const maakCode = async (page: Page, o: { naam: string; scopes: string[]; verloop: 'datum' | '1 година' | 'Безстроково'; eenmalig?: boolean; max?: string; notitie?: string; foto?: string }) => {
      await tc(page).getByRole('button', { name: 'Створити код доступу' }).click();
      const f = tc(page).locator('[data-code-form]');
      await f.locator('#toegangscode-naam').fill(o.naam);
      if (o.notitie) await f.locator('#toegangscode-notitie').fill(o.notitie);
      for (const s of o.scopes) await f.locator(`[data-scope="${s}"]`).click();
      if (o.verloop === 'datum') {
        await f.getByLabel('Своя дата й час').click();
        const d = new Date(Date.now() + 2 * 86400000); const p = (n: number) => String(n).padStart(2, '0');
        await f.locator('[data-verloop-datum]').fill(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T18:30`);
      } else await f.getByLabel(o.verloop, { exact: true }).click();
      if (o.eenmalig) await f.getByLabel('Одноразовий').click();
      else if (o.max) await f.locator('.toegangscode-max input').fill(o.max);
      if (o.foto) { await f.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${UIT}/${o.foto}` }); }
      await f.getByRole('button', { name: 'Створити код' }).click();
      const venster = await verwerkVenster(page, `code «${o.naam}»`);
      const getoond = tc(page).locator('[data-code-getoond]');
      await getoond.waitFor({ timeout: 20000 });
      const code = (await getoond.locator('[data-code]').innerText()).trim();
      return { code, venster, getoond };
    };
    const rijVan = (page: Page, naam: string) => tc(page).locator('[data-toegangscode]', { has: page.locator('strong', { hasText: naam }) }).first();

    // ---------------------------------------------------------------- 1. passkey + code maken
    const fouten: string[] = [];
    const A = await sessie();
    const page = A.page;
    volg(page, fouten);
    await open(page);
    await pk(page).getByRole('button', { name: 'Додати passkey' }).click();
    await pk(page).locator('#passkey-naam').fill('Телефон');
    await pk(page).getByRole('button', { name: 'Продовжити' }).click();
    const v1 = page.getByRole('dialog');
    await v1.waitFor({ timeout: 10000 });
    await v1.getByRole('button', { name: 'Підтвердити повторним входом через Google' }).click();
    await pk(page).locator('[data-passkey]').first().waitFor({ timeout: 25000 }).catch(() => undefined);
    check('passkey toegevoegd (voorwaarde voor sterke bevestiging)', await pk(page).locator('[data-passkey]').count() === 1, page.url());
    await tc(page).scrollIntoViewIfNeeded();
    const sterk: string[] = [];
    page.on('response', async (q) => { if (/toegangscodes\/maken$/.test(q.url()) && q.status() === 403) sterk.push(String((await q.json().catch(() => ({}))).error || '')); });
    const c1 = await maakCode(page, { naam: 'Для Олени', scopes: ['profiel.lezen', 'apparaten.lezen'], verloop: 'datum', max: '3', notitie: 'Сестра, перевіряє, чи працює комп’ютер удома', foto: 'gast-01-formulier.png' });
    check('maken: Google-step-up geweigerd (STEP_UP_STRONG_REQUIRED) → passkey', sterk.includes('STEP_UP_STRONG_REQUIRED') && c1.venster === 'passkey', `${sterk.join(',')} ${c1.venster}`);
    check('code één keer getoond: XXXX-XXXX-XXXX-XXXX + QR + kopieerknoppen', /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(c1.code) && await c1.getoond.locator('svg.toegangscode-qr path').count() === 1 && await c1.getoond.getByRole('button', { name: 'Копіювати посилання' }).count() === 1, c1.code);
    await c1.getoond.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${UIT}/gast-02-code-een-keer.png` });
    await c1.getoond.getByRole('button', { name: 'Готово' }).click();
    const r1 = rijVan(page, 'Для Олени');
    await r1.waitFor({ timeout: 10000 });
    const r1t = await r1.innerText();
    check('lijst: «Для Олени» · Діє · Профіль + Пристрої · діє до … · 0 з 3, code niet meer zichtbaar', /Діє/.test(r1t) && /Діє до/.test(r1t) && /0 з 3/.test(r1t) && !r1t.includes(c1.code) && await r1.getAttribute('data-status') === 'actief', r1t.slice(0, 300));
    const c1Id = String(await r1.getAttribute('data-toegangscode'));
    const opgeslagen = (await pool.query('select code_hash, code_hint, scopes from app.toegangscodes where id = $1', [c1Id])).rows[0];
    check('database: alleen een hash (64 hex) + 4 tekens hint, nooit de code', /^[0-9a-f]{64}$/.test(opgeslagen?.code_hash) && opgeslagen.code_hint === c1.code.slice(-4) && !JSON.stringify(opgeslagen).includes(c1.code), JSON.stringify(opgeslagen));

    // ---------------------------------------------------------------- 2. gast wisselt in (tweede context)
    const g1f: string[] = [];
    const G1 = await gastContext('light');
    volg(G1.page, g1f, GAST_VERWACHT);
    await G1.page.goto(`${ID}/toegang#code=${c1.code}`, { waitUntil: 'networkidle' });
    await G1.page.locator('#gast-code').waitFor({ timeout: 15000 });
    check('deellink: code ingevuld en #code= meteen uit de adresbalk', (await G1.page.locator('#gast-code').inputValue()) === c1.code && !G1.page.url().includes('#'), G1.page.url());
    await G1.page.screenshot({ path: `${UIT}/gast-03-inwisselen.png` });
    await G1.page.getByRole('button', { name: 'Увійти як гість' }).click();
    const banner = G1.page.locator('[data-gast-banner]');
    await banner.waitFor({ timeout: 15000 });
    const bt = await banner.innerText();
    check('banner «Гостьовий доступ від … до …» met code-naam, alleen bekijken', /Гостьовий доступ від .+ до .+/.test(bt) && /«Для Олени»/.test(bt) && /лише перегляд/.test(bt) && !bt.includes(eigenaar), bt);
    await G1.page.locator('[data-gast-inhoud="profiel.lezen"] .gast-profiel').waitFor({ timeout: 10000 });
    const tabs = await G1.page.locator('[data-gast-tab]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gast-tab')));
    check('gast ziet alleen de tabbladen van de code (profiel, apparaten)', JSON.stringify(tabs) === JSON.stringify(['profiel.lezen', 'apparaten.lezen']), JSON.stringify(tabs));
    await G1.page.screenshot({ path: `${UIT}/gast-04-banner-profiel.png` });
    await G1.page.locator('[data-gast-tab="apparaten.lezen"]').click();
    await G1.page.locator('[data-gast-inhoud="apparaten.lezen"] :is(.gast-lijst, p)').first().waitFor({ timeout: 10000 });
    await G1.page.screenshot({ path: `${UIT}/gast-05-apparaten.png` });
    const ck = (await G1.ctx.cookies(`${ID}/api/gast/sessie`)).find((c) => c.name === 'tsv_gast');
    check('gastcookie: HttpOnly, Secure, SameSite=Strict, Path=/api/gast', !!ck && ck.httpOnly && ck.secure && ck.sameSite === 'Strict' && ck.path === '/api/gast', JSON.stringify(ck));

    // ---------------------------------------------------------------- 3. gast geweigerd buiten de scope
    const j = await gastPost(G1.page, '/api/gast/bekijk', { scope: 'journaal.lezen' });
    const pkG = await gastPost(G1.page, '/api/gast/bekijk', { scope: 'passkeys.beheren' });
    const own1 = await gastPost(G1.page, '/api/owner/access/toegangscodes/lijst', { service: 'identity' });
    const own2 = await gastPost(G1.page, '/api/owner/access/passkeys/lijst', { service: 'identity' });
    const own3 = await gastPost(G1.page, '/api/owner/uitrol/overzicht', { service: 'admin' });
    check('gast: journaal (niet in de code) en sleutels → 403 GAST_GEEN_TOEGANG', j.status === 403 && j.data.error === 'GAST_GEEN_TOEGANG' && pkG.status === 403, `${j.status} ${JSON.stringify(j.data)} ${pkG.status}`);
    check('gast: eigenaarsroutes (codes, passkeys, updates) → 401, nooit gegevens', [own1, own2, own3].every((x) => x.status === 401 || x.status === 403) && ![own1, own2, own3].some((x) => 'codes' in x.data || 'passkeys' in x.data), [own1, own2, own3].map((x) => x.status).join(','));
    await G1.page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' });
    await G1.page.waitForTimeout(800);
    const methodsTekst = await G1.page.locator('body').innerText();
    check('gast op /methods: geen sleutels, codes of e-mail van de eigenaar', await G1.page.locator('[data-access-section="toegangscodes"], [data-access-section="passkeys"]').count() === 0 && !methodsTekst.includes(eigenaar), methodsTekst.slice(0, 200));
    await G1.page.screenshot({ path: `${UIT}/gast-06-methods-geweigerd.png` });
    await G1.page.goto(`${ID}/toegang`, { waitUntil: 'networkidle' });
    await banner.waitFor({ timeout: 10000 });
    check('gastsessie blijft na herladen (zelfde banner)', /Для Олени/.test(await banner.innerText()));

    // ---------------------------------------------------------------- 4. eigenaar ziet gebruik, geschiedenis, bel, journaal
    await open(page);
    const r1b = rijVan(page, 'Для Олени');
    const r1bt = await r1b.innerText();
    check('eigenaar: gebruikt 1 з 3, laatst gebruikt met apparaat + IP-hash, 1 actieve gastsessie', /1 з 3/.test(r1bt) && /Останнє використання:.*Chrome · Linux/s.test(r1bt) && /IP #[0-9a-f]{12}/.test(r1bt) && /активних гостьових сесій: 1/.test(r1bt), r1bt.slice(0, 400));
    const uitklap = r1b.locator('[data-code-geschiedenis] .toegang-uitklap');
    for (let i = 0; i < 3 && await uitklap.getAttribute('aria-expanded') !== 'true'; i++) { await uitklap.click(); await page.waitForTimeout(300); }
    await r1b.locator('.toegang-geschiedenis-lijst li').first().waitFor({ timeout: 5000 }).catch(() => undefined);
    const gt = await r1b.locator('[data-code-geschiedenis]').innerText();
    check('geschiedenis: aangemaakt, ingewisseld, bekeken (Профіль/Пристрої), geweigerd (journaal)', /Код створено/.test(gt) && /Гість увійшов із кодом/.test(gt) && /Гість переглянув\s*:\s*Ваше ім/.test(gt) && /Відмовлено/.test(gt), gt.slice(0, 600));
    await r1b.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${UIT}/gast-07-eigenaar-gebruik.png`, fullPage: true });
    await page.locator('button[aria-label^="Непрочитаних сповіщень"], button[aria-label="Центр сповіщень"]').first().click();
    const melding = page.locator('.cnc-row', { hasText: 'Для Олени' }).first();
    await melding.waitFor({ timeout: 10000 }).catch(() => undefined);
    const mt = await melding.innerText().catch(() => '');
    check('bel: «Код доступу «Для Олени» використано вперше»', /використано вперше/.test(mt), mt);
    await page.screenshot({ path: `${UIT}/gast-08-melding.png` });
    await page.keyboard.press('Escape').catch(() => undefined);
    await page.goto(`${MCP}/agents#journaal`, { waitUntil: 'networkidle' });
    await page.locator('[role=tab][data-tab="journaal"]').click().catch(() => undefined);
    await page.locator('[data-filter="soort"]').selectOption('toegang').catch(() => undefined);
    const jl = page.locator('[data-tab-inhoud="journaal"] .ag-journaal');
    await jl.locator('[data-rij]').first().waitFor({ timeout: 15000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const jt = await jl.innerText().catch(() => '');
    check('/agents → Журнал: code aangemaakt, gebruikt, gast bekeek en gast geweigerd', /Створено код доступу «Для Олени»/.test(jt) && /Код доступу «Для Олени» використано/.test(jt) && /Гість за кодом «Для Олени» переглянув: профіль/.test(jt) && /Гостю за кодом «Для Олени» відмовлено/.test(jt), jt.slice(0, 600));
    await page.screenshot({ path: `${UIT}/gast-09-journaal.png`, fullPage: true });

    // ---------------------------------------------------------------- 5. «Сесії»: gastsessies + één afzonderlijk beëindigen
    const g2f: string[] = [];
    const G2 = await gastContext('dark');
    volg(G2.page, g2f, GAST_VERWACHT);
    await G2.page.goto(`${ID}/toegang`, { waitUntil: 'networkidle' });
    await G2.page.locator('#gast-code').fill(c1.code.toLowerCase().replace(/-/g, ' '));
    await G2.page.getByRole('button', { name: 'Увійти як гість' }).click();
    await G2.page.locator('[data-gast-banner]').waitFor({ timeout: 15000 });
    check('tweede gast met dezelfde (herbruikbare) code, kleine letters/spaties', await G2.page.locator('[data-gast-banner]').count() === 1);
    await G2.page.screenshot({ path: `${UIT}/gast-10-tweede-gast-donker.png` });
    const s2 = await gastSessieId(G2.ctx);
    await page.goto(`${ID}/sessions?lang=uk`, { waitUntil: 'networkidle' });
    const ov = page.locator('[data-sessies-overzicht]');
    await ov.locator('[data-gast-sessie]').first().waitFor({ timeout: 20000 }).catch(() => undefined);
    const ovt = await ov.innerText().catch(() => '');
    check('«Сесії»: eigen sessie (Вхід через Google, тривалість) + 2 gastsessies «Вхід за кодом доступу «Для Олени»»', await ov.locator('[data-gast-sessie]').count() === 2 && /Вхід через Google/.test(ovt) && /Тривалість/.test(ovt) && /Вхід за кодом доступу «Для Олени»/.test(ovt) && /Гостьові сесії/.test(ovt), ovt.slice(0, 500));
    await ov.locator('[data-gast-sessies]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${UIT}/gast-11-sessies.png`, fullPage: true });
    await ov.locator(`[data-gast-sessie="${s2}"]`).getByRole('button', { name: 'Завершити гостьову сесію' }).click();
    await ov.locator(`[data-gast-sessie="${s2}"]`).waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    check('één gastsessie afzonderlijk beëindigd (lijst: 1 over)', await ov.locator('[data-gast-sessie]').count() === 1 && await ov.locator(`[data-gast-sessie="${s2}"]`).count() === 0);
    await kijkNu(G2.page);
    check('gast 2: meteen uitgelogd («Гостьову сесію завершено»)', await weg(G2.page));
    check('gast 1: blijft actief', (await gastPost(G1.page, '/api/gast/sessie')).status === 200);

    // ---------------------------------------------------------------- 6. intrekken met reden → gastsessie weg
    await open(page);
    const r1c = rijVan(page, 'Для Олени');
    await r1c.getByRole('button', { name: 'Відкликати' }).click();
    const ib = r1c.locator('[data-bevestig="code-intrekken"]');
    const ik = ib.getByRole('button', { name: 'Відкликати код' });
    check('intrekken: knop uit zonder reden', await ik.isDisabled());
    await ib.locator('textarea').fill('Олена вже все перевірила');
    await r1c.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${UIT}/gast-12-intrekken-reden.png` });
    await ik.click();
    await page.locator('[data-toegangscode][data-status="ingetrokken"]').first().waitFor({ timeout: 10000 }).catch(() => undefined);
    const r1d = rijVan(page, 'Для Олени');
    const r1dt = await r1d.innerText();
    check('eigenaar: status «Відкликано» + reden + wie', await r1d.getAttribute('data-status') === 'ingetrokken' && /Відкликано/.test(r1dt) && /Олена вже все перевірила/.test(r1dt), r1dt.slice(0, 300));
    await kijkNu(G1.page);
    check('gast 1: na intrekken meteen uitgelogd', await weg(G1.page));
    await G1.page.screenshot({ path: `${UIT}/gast-13-gast-na-intrekken.png` });
    await G1.page.locator('#gast-code').fill(c1.code);
    await G1.page.getByRole('button', { name: 'Увійти як гість' }).click();
    await G1.page.locator('.gast-fout').waitFor({ timeout: 10000 }).catch(() => undefined);
    check('ingetrokken code opnieuw invoeren → algemene foutmelding', /Код недійсний/.test(await G1.page.locator('.gast-fout').innerText().catch(() => '')));

    // ---------------------------------------------------------------- 7. verloop
    await open(page);
    const c2 = await maakCode(page, { naam: 'Майстер на годину', scopes: ['apparaten.lezen'], verloop: '1 година', eenmalig: true });
    await c2.getoond.getByRole('button', { name: 'Готово' }).click();
    const g3f: string[] = [];
    const G3 = await gastContext('light');
    volg(G3.page, g3f, GAST_VERWACHT);
    await G3.page.goto(`${ID}/toegang#code=${c2.code}`, { waitUntil: 'networkidle' });
    await G3.page.getByRole('button', { name: 'Увійти як гість' }).click();
    await G3.page.locator('[data-gast-banner]').waitFor({ timeout: 15000 });
    const tot = await G3.page.locator('[data-gast-banner] strong').innerText();
    check('eenmalige code (1 uur): gast binnen, banner toont het einde', /до .+/.test(tot), tot);
    const r2 = rijVan(page, 'Майстер на годину');
    const c2Id = String(await r2.getAttribute('data-toegangscode'));
    await pool.query("update app.toegangscodes set verloopt_op = now() - interval '1 second' where id = $1", [c2Id]);
    await kijkNu(G3.page);
    check('verloop: gast meteen uitgelogd', await weg(G3.page));
    await G3.page.screenshot({ path: `${UIT}/gast-14-verlopen-gast.png` });
    await open(page);
    const r2b = rijVan(page, 'Майстер на годину');
    check('eigenaar: status «Закінчився»', await r2b.getAttribute('data-status') === 'verlopen' && /Закінчився/.test(await r2b.innerText()), await r2b.innerText());
    await r2b.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${UIT}/gast-15-lijst-statussen.png`, fullPage: true });

    // ---------------------------------------------------------------- 8. «Завершити всі інші»
    const c3 = await maakCode(page, { naam: 'Для всіх пристроїв', scopes: ['profiel.lezen'], verloop: 'Безстроково' });
    await c3.getoond.getByRole('button', { name: 'Готово' }).click();
    const g4f: string[] = [];
    const G4 = await gastContext('light');
    volg(G4.page, g4f, GAST_VERWACHT);
    await G4.page.goto(`${ID}/toegang#code=${c3.code}`, { waitUntil: 'networkidle' });
    await G4.page.getByRole('button', { name: 'Увійти як гість' }).click();
    await G4.page.locator('[data-gast-banner]').waitFor({ timeout: 15000 });
    const B = await sessie('light');
    const bf: string[] = [];
    volg(B.page, bf, [/^401 /]);
    await open(B.page);
    await page.goto(`${ID}/sessions?lang=uk`, { waitUntil: 'networkidle' });
    await ov.locator('[data-gast-sessie]').first().waitFor({ timeout: 20000 }).catch(() => undefined);
    await ov.locator('[data-sessies-alle-andere]').click();
    const ab = ov.locator('[data-bevestig="alle-andere"]');
    await ab.waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${UIT}/gast-16-alle-andere-bevestigen.png` });
    await ab.getByRole('button', { name: 'Так, завершити' }).click();
    await ov.locator('.sessies-melding').waitFor({ timeout: 15000 }).catch(() => undefined);
    const am = await ov.locator('.sessies-melding').innerText().catch(() => '');
    check('«Завершити всі інші»: melding met aantallen, deze aanmelding blijft', /гостьових сесій: 1/.test(am) && /Цей вхід залишився/.test(am), am);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${UIT}/gast-17-alle-andere-klaar.png`, fullPage: true });
    const bStatus = await B.page.evaluate(async (t) => (await fetch('/api/owner/access/passkeys/lijst', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'identity', tabContext: t }) })).status, B.tab);
    const aStatus = await page.evaluate(async (t) => (await fetch('/api/owner/access/passkeys/lijst', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'identity', tabContext: t }) })).status, A.tab);
    check('andere eigenaarssessie B → 401; deze sessie A → 200', bStatus === 401 && aStatus === 200, `${bStatus} ${aStatus}`);
    await kijkNu(G4.page);
    check('gast 4: uitgelogd door «Завершити всі інші»', await weg(G4.page));
    check('«Сесії»: geen gastsessies meer', await ov.locator('[data-gast-sessie]').count() === 0 && /Активних гостьових сесій немає/.test(await ov.innerText()));

    check('geen consolefouten (eigenaar)', fouten.length === 0, fouten.join(' | '));
    check('geen consolefouten (gasten)', [...g1f, ...g2f, ...g3f, ...g4f].length === 0, [...g1f, ...g2f, ...g3f, ...g4f].join(' | '));
    check('geen consolefouten (sessie B)', bf.length === 0, bf.join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await browser.close().catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = $1", [eigenaar]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) {
      for (const t of ['toegangscodes', 'passkeys', 'passkey_uitdagingen', 'toegang_gebruik', 'toegang_notities', 'toegang_wijzigingen']) await pool.query(`delete from app.${t} where user_id = any($1)`, [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    }
    await pool.query("delete from app.login_lockouts where subject like 'gast-inwisselen:%'").catch(() => undefined);
    await stop();
  }
  return einde();
}
