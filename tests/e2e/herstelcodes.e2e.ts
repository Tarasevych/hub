// E2E «Коди відновлення» + Google-step-up met een echte Chrome (zie bevestig-toegang.e2e.ts voor de opzet).
// 1. Oude Google-aanmelding (auth_time 1 u) → «Створити коди» → «Підтвердіть доступ» (alleen Google) → Google (gestubd) geeft
//    een id_token met OUDE auth_time maar vers iat + juiste nonce → terug op /methods → codes worden automatisch gemaakt.
// 2. Paneel: Завантажити (.txt), Копіювати, Друкувати, «Я зберіг коди» → gemaskeerde lijst «Залишилося 10 з 10».
// 3. Een tweede sessie gebruikt een code in het venster (passkey toevoegen) → in de lijst doorgestreept, «Залишилося 9 з 10».
// 4. «Відкликати всі» → alles «Відкликано», een code werkt niet meer.
// 5. Ander Google-account bij de step-up → terug op /methods, venster toont «Ви вибрали інший акаунт», sessie ongewijzigd.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com';
// Verwachte 4xx: STEP_UP_REQUIRED (403) waarop het venster opent; agents/activity (403, niet-eigenaar); de bewuste poging
// met een ingetrokken code (400).
const VERWACHT = [/^403 .*\/api\/owner\/access\/(recovery\/rotate|passkeys\/registreren\/opties)$/, /^403 .*\/api\/owner\/agents\/activity$/, /^400 .*\/api\/owner\/access\/stap-op$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e herstelcodes');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-eig-${T}@example.test`, sub = `sub-e2e-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [`--host-resolver-rules=MAP *.tarasevych.com:443 127.0.0.1:${POORT}, MAP tarasevych.com:443 127.0.0.1:${POORT}`] });
  const oud = Math.floor(Date.now() / 1000) - 3600;
  try {
    // Google-stub: wat «Google» teruggeeft per scenario.
    let stub: { sub: string; email: string; authTime: number | null; iat?: number } = { sub, email: eigenaar, authTime: oud };
    let googleBezocht = 0;
    const sessie = async (email: string, s: string) => {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      const r = await b.aanmelden(s, email, { service: 'identity', tabContext: tab, intent: 'login', authTime: oud });
      const ctx = await browser.newContext({ colorScheme: 'dark', locale: 'uk-UA', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
      await ctx.addCookies([...b.jar].map(([name, value]) => ({ name, value, url: `${ID}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const })));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
      await ctx.route('https://accounts.google.com/**', async (route) => {
        const u = new URL(route.request().url());
        googleBezocht++;
        const code = G.codeVoor(stub.sub, stub.email, u.searchParams.get('nonce') || '', stub.authTime, stub.iat);
        const terug = new URL(u.searchParams.get('redirect_uri') || `${ID}/`);
        terug.searchParams.set('state', u.searchParams.get('state') || ''); terug.searchParams.set('code', code);
        await route.fulfill({ status: 302, headers: { location: terug.href } });
      });
      return { ctx, r, tab };
    };
    const volg = (page: Page, lijst: string[]) => {
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) lijst.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => lijst.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { if (q.status() >= 400 && !VERWACHT.some((v) => v.test(`${q.status()} ${q.url()}`))) lijst.push(`http ${q.status()} ${q.url()}`); });
    };
    const sectie = (page: Page) => page.locator('[data-access-section="recovery"]');
    const open = async (page: Page) => { await page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' }); await sectie(page).waitFor({ timeout: 20000 }); await page.waitForTimeout(300); };

    // ---------------------------------------------------------------- 1. step-up met oude auth_time, vers iat → codes
    const fouten: string[] = [];
    const A = await sessie(eigenaar, sub);
    check('aanmelden gaf een sessie', A.r.cb.data.sessionCreated === true);
    await A.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ID });
    const page = await A.ctx.newPage();
    volg(page, fouten);
    await open(page);
    await sectie(page).getByRole('button', { name: 'Створити коди' }).click();
    const venster = page.getByRole('dialog');
    await venster.waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${UIT}/codes-01-venster.png` });
    check('«Створити коди» met oude aanmelding opent «Підтвердіть доступ» met Google', /Підтвердити повторним входом через Google/.test(await venster.innerText()));
    await venster.getByRole('button', { name: 'Підтвердити повторним входом через Google' }).click();
    const paneel = page.locator('[data-herstel-nieuw]');
    await paneel.waitFor({ timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    const codes = (await paneel.locator('li').allInnerTexts().catch(() => [] as string[])).map((x) => x.trim());
    await paneel.scrollIntoViewIfNeeded().catch(() => undefined);
    await page.screenshot({ path: `${UIT}/codes-02-paneel.png`, fullPage: true });
    check('Google met OUDE auth_time maar vers iat + nonce → step-up telt, actie hervat: 10 nieuwe codes (XXXX-XXXX-XXXX)', googleBezocht === 1 && codes.length === 10 && codes.every((c) => /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(c)) && await page.getByRole('dialog').count() === 0, `${googleBezocht} ${codes.join(',')} ${page.url()}`);

    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), paneel.getByRole('button', { name: 'Завантажити' }).click()]);
    const inhoud = readFileSync(await download.path(), 'utf8');
    check('Завантажити: .txt met alle 10 codes', download.suggestedFilename() === 'mijn-ruimte-herstelcodes.txt' && codes.every((c) => inhoud.includes(c)), download.suggestedFilename());
    await paneel.getByRole('button', { name: 'Копіювати' }).click();
    const klembord = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    check('Копіювати: klembord bevat alle codes', codes.every((c) => klembord.includes(c)), klembord.slice(0, 60));
    await page.evaluate(() => { (window as unknown as { __print: number }).__print = 0; window.print = () => { (window as unknown as { __print: number }).__print++; }; });
    await paneel.getByRole('button', { name: 'Друкувати' }).click();
    check('Друкувати roept window.print aan', await page.evaluate(() => (window as unknown as { __print: number }).__print) === 1);
    const gereed = paneel.getByRole('button', { name: 'Готово' });
    check('«Готово» pas na «Я зберіг коди»', await gereed.isDisabled());
    await paneel.getByLabel('Я зберіг коди').check();
    await gereed.click();
    const lijst = page.locator('[data-herstel-lijst]');
    await lijst.waitFor({ timeout: 10000 }).catch(() => undefined);
    const teller = async () => (await sectie(page).locator('[data-herstel-teller]').innerText()).trim();
    check('daarna alleen een gemaskeerde lijst (10 regels, ••••-••••-••xx), «Залишилося 10 з 10», geen klare codes meer op de pagina',
      await lijst.locator('li').count() === 10 && await teller() === 'Залишилося 10 з 10' && !(await page.content()).includes(codes[0]) && /••••-••••-••[0-9a-f]{2}/.test(await lijst.innerText()), await teller());
    await sectie(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${UIT}/codes-03-lijst.png`, fullPage: true });

    // ---------------------------------------------------------------- 2. een code gebruiken in het venster (andere sessie)
    const B = await sessie(eigenaar, sub);
    const p2 = await B.ctx.newPage();
    const f2: string[] = [];
    volg(p2, f2);
    const cdp = await B.ctx.newCDPSession(p2);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await open(p2);
    await p2.locator('[data-access-section="passkeys"]').getByRole('button', { name: 'Додати passkey' }).click();
    await p2.locator('[data-access-section="passkeys"]').getByRole('button', { name: 'Продовжити' }).click();
    const v2 = p2.getByRole('dialog');
    await v2.waitFor({ timeout: 10000 });
    await v2.getByRole('button', { name: 'Використати код відновлення' }).click();
    await v2.locator('#bevestig-toegang-code').fill(codes[3].toLowerCase());
    await v2.getByRole('button', { name: 'Підтвердити' }).click();
    await p2.locator('[data-access-section="passkeys"] [data-passkey]').first().waitFor({ timeout: 15000 }).catch(() => undefined);
    check('code in het venster («Використати код відновлення», kleine letters + streepjes) → bevestigd, passkey toegevoegd', await p2.locator('[data-access-section="passkeys"] [data-passkey]').count() === 1 && f2.length === 0, f2.join(' | '));
    await open(page);
    const r4 = lijst.locator('li').nth(3);
    await r4.waitFor({ timeout: 15000 }).catch(() => undefined);
    const doorgestreept = await r4.locator('.herstel-code').evaluate((el) => getComputedStyle(el).textDecorationLine);
    check('lijst: gebruikte code (nr 4) doorgestreept met «Використано <datum>», teller «Залишилося 9 з 10»', await r4.getAttribute('data-status') === 'gebruikt' && doorgestreept.includes('line-through') && /Використано \d/.test(await r4.innerText()) && await teller() === 'Залишилося 9 з 10', `${doorgestreept} ${await r4.innerText()} ${await teller()}`);
    await sectie(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${UIT}/codes-04-gebruikt.png`, fullPage: true });

    // ---------------------------------------------------------------- 3. «Відкликати всі»
    await sectie(page).getByRole('button', { name: 'Відкликати всі' }).click();
    await sectie(page).getByRole('button', { name: 'Відкликати', exact: true }).click();
    await sectie(page).getByText('Усі коди відкликано').waitFor({ timeout: 10000 }).catch(() => undefined);
    await lijst.locator('li[data-status="ingetrokken"]').first().waitFor({ timeout: 10000 }).catch(() => undefined);
    const statussen = await lijst.locator('li').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
    check('«Відкликати всі» (step-up nog geldig): 9 «ingetrokken», 1 «gebruikt», teller «Залишилося 0 з 10», badge «Відкликано»', statussen.filter((x) => x === 'ingetrokken').length === 9 && statussen.filter((x) => x === 'gebruikt').length === 1 && await teller() === 'Залишилося 0 з 10' && /Відкликано/.test(await sectie(page).innerText()), statussen.join(','));
    await sectie(page).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${UIT}/codes-05-ingetrokken.png`, fullPage: true });
    const naIntrek = await p2.evaluate(async ([tab, code]) => { const r = await fetch('/api/owner/access/stap-op', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'identity', tabContext: tab, methode: 'herstelcode', code }) }); return { s: r.status, b: await r.text() }; }, [B.tab, codes[5]] as const);
    check('na intrekken werkt een eerder geldige code niet meer', naIntrek.s === 400 && /STEP_UP_RECOVERY_NOT_ENROLLED|ACCESS_RECOVERY_INVALID/.test(naIntrek.b), `${naIntrek.s} ${naIntrek.b}`);
    check('eigenaar-flow zonder consolefouten', fouten.length === 0, fouten.join(' | '));

    // ---------------------------------------------------------------- 4. ander Google-account / geen verse bevestiging
    const cMail = `e2e-c-${T}@example.test`, cSub = `sub-e2e-c-${T}`;
    const C = await sessie(cMail, cSub);
    await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and data->>'email'=$1", [cMail]);
    const p3 = await C.ctx.newPage();
    const f3: string[] = [];
    volg(p3, f3);
    await open(p3);
    stub = { sub: `sub-e2e-vreemd-${T}`, email: `e2e-vreemd-${T}@example.test`, authTime: Math.floor(Date.now() / 1000) };
    await sectie(p3).getByRole('button', { name: 'Створити коди' }).click();
    await p3.getByRole('dialog').getByRole('button', { name: 'Підтвердити повторним входом через Google' }).click();
    await p3.waitForURL(/\/methods/, { timeout: 20000 }).catch(() => undefined);
    const v3 = p3.getByRole('dialog');
    await v3.getByText('Ви вибрали інший акаунт Google').waitFor({ timeout: 15000 }).catch(() => undefined);
    await p3.waitForTimeout(300);
    await p3.screenshot({ path: `${UIT}/codes-06-ander-account.png` });
    const wie = await v3.innerText().catch(() => '');
    const vreemdeRij = await pool.query("select count(*)::int n from app.records where tbl='users' and data->>'sub'=$1", [stub.sub]);
    check('ander Google-account: terug op /methods, venster toont «Ви вибрали інший акаунт», nog steeds aangemeld als dezelfde gebruiker, geen nieuw account',
      /\/methods/.test(p3.url()) && /Ви вибрали інший акаунт Google/.test(wie) && wie.includes(cMail) && vreemdeRij.rows[0].n === 0 && await p3.locator('[data-herstel-nieuw]').count() === 0, `${p3.url()} | ${wie.slice(0, 300)}`);
    stub = { sub: cSub, email: cMail, authTime: oud, iat: Math.floor(Date.now() / 1000) - 600 };
    await v3.getByRole('button', { name: 'Підтвердити повторним входом через Google' }).click();
    await p3.waitForURL(/\/methods/, { timeout: 20000 }).catch(() => undefined);
    await p3.getByRole('dialog').getByText('Google не підтвердив новий вхід').waitFor({ timeout: 15000 }).catch(() => undefined);
    check('oud id_token (iat 10 min) én oude auth_time: venster meldt «Google не підтвердив новий вхід» (geen stille lus)', await p3.getByRole('dialog').getByText('Google не підтвердив новий вхід').isVisible().catch(() => false));
    check('scenario ander account: geen consolefouten', f3.length === 0, f3.join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await browser.close().catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`e2e-%-${T}@example.test`]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await stop();
  }
  return einde();
}
