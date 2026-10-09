// E2E «Способи входу» → «Додати passkey» met een echte Chrome (Playwright, CDP virtual authenticator) tegen de lokale build.
// Gebruik: node scripts/e2e-lokaal.mjs  (zie dat bestand voor de vereisten: dist/, Postgres, test-CA in NSS, playwright-core).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';

// Verwachte 4xx: STEP_UP_REQUIRED (403) op registreren/opties bij een oude aanmelding — daarop opent het venster;
// /api/owner/agents/activity geeft 403 voor gewone gebruikers (bestaand gedrag, los van deze pagina).
const VERWACHT = [/^403 https:\/\/id\.tarasevych\.com\/api\/owner\/access\/passkeys\/registreren\/opties$/, /^403 https:\/\/id\.tarasevych\.com\/api\/owner\/agents\/activity$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e bevestig-toegang');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-eig-${T}@example.test`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [`--host-resolver-rules=MAP *.tarasevych.com:443 127.0.0.1:${POORT}, MAP tarasevych.com:443 127.0.0.1:${POORT}`] });
  const fouten: string[] = [];
  try {
    const sessie = async (email: string, sub: string, vers = false) => {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      const r = await b.aanmelden(sub, email, { service: 'identity', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) - (vers ? 5 : 3600) });
      const ctx = await browser.newContext({ colorScheme: 'dark', locale: 'uk-UA', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].map(([name, value]) => ({ name, value, url: 'https://id.tarasevych.com/', secure: true, httpOnly: true, sameSite: 'Lax' as const })));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
      return { ctx, b, r, tab };
    };
    const authenticator = async (page: import('playwright-core').Page, transport: 'internal' | 'usb' | 'cable', automatisch = true) => {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport, hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: automatisch } });
      return { cdp, authenticatorId };
    };
    const volg = (page: import('playwright-core').Page, lijst: string[]) => {
      // «Failed to load resource» volgt al uit de response-controle hieronder (met URL); verwachte 4xx staan in VERWACHT.
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) lijst.push(`console: ${m.text()}`); });
      page.on('response', (q) => { if (q.status() >= 400 && !VERWACHT.some((v) => v.test(`${q.status()} ${q.url()}`))) lijst.push(`http ${q.status()} ${q.url()}`); });
      page.on('pageerror', (e) => lijst.push(`pageerror: ${e.message}`));
      page.on('requestfailed', (q) => { if (!/accounts\.google\.com/.test(q.url())) lijst.push(`requestfailed: ${q.url()} ${q.failure()?.errorText}`); });
    };
    const sectie = (page: import('playwright-core').Page) => page.locator('[data-access-section="passkeys"]');

    // ---------------------------------------------------------------- 1. eigenaar, oude aanmelding → venster → Google → hervat
    const sub = `sub-e2e-${T}`;
    const { ctx, r } = await sessie(eigenaar, sub);
    check('aanmelden (nep-Google, redirect-flow) gaf een sessie', r.cb.status === 200 && r.cb.data.sessionCreated === true, r.cb.body.slice(0, 160));
    const page = await ctx.newPage();
    volg(page, fouten);
    await authenticator(page, 'internal');
    // Google stub: accounts.google.com stuurt meteen terug naar redirect_uri met een geldige code (nonce uit de authUrl).
    let googleBezocht = 0;
    await ctx.route('https://accounts.google.com/**', async (route) => {
      const u = new URL(route.request().url());
      googleBezocht++;
      const code = G.codeVoor(sub, eigenaar, u.searchParams.get('nonce') || '');
      const terug = new URL(u.searchParams.get('redirect_uri') || 'https://id.tarasevych.com/');
      terug.searchParams.set('state', u.searchParams.get('state') || ''); terug.searchParams.set('code', code);
      await route.fulfill({ status: 302, headers: { location: terug.href } });
    });

    await page.goto('https://id.tarasevych.com/methods?lang=uk', { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-access-section="passkeys"]', { timeout: 20000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${UIT}/e2e-01-pagina.png`, fullPage: true });
    check('pagina «Способи входу» geladen zonder consolefouten', fouten.length === 0, fouten.join(' | '));
    check('één Passkeys-sectie; geen Passkeys-rij onder 2FA; één regel dat passkeys ook tellen',
      await page.locator('#aanmeldmethoden-passkeys').count() === 1 && await page.locator('[data-access-factor="passkey"]').count() === 0 && await page.locator('[data-passkeys-tellen]').count() === 1);
    check('geen dubbele paginakop in het paneel (.access-plane-header weg)', await page.locator('.access-plane .access-plane-header').count() === 0);
    check('geen native title-uitleg: (?) zijn knoppen met aria-describedby', await page.locator('.info-tip-knop[title]').count() === 0 && await page.locator('.info-tip-knop[aria-describedby]').count() >= 4);
    // (?) bij Passkeys: hover toont een tooltip met de QR-hint, gekoppeld via aria-describedby; Esc sluit.
    const vraag = sectie(page).getByRole('button', { name: 'Що таке passkey?' });
    await vraag.hover();
    const tipId = await vraag.getAttribute('aria-describedby');
    const tip = page.locator(`[id="${tipId}"]`);
    await tip.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined);
    check('(?) Passkeys: hover toont tooltip (role=tooltip) met de QR-hint', await tip.isVisible() && await tip.getAttribute('role') === 'tooltip' && /відскануйте QR-код/.test(await tip.innerText()));
    await page.screenshot({ path: `${UIT}/e2e-02-tooltip.png` });
    await page.mouse.move(5, 5);
    check('(?) sluit weer na hover weg', !(await tip.isVisible()));
    await vraag.focus();
    check('(?) toetsenbord: focus opent de tooltip', await tip.isVisible());
    await page.keyboard.press('Escape');
    check('(?) Esc sluit de tooltip', !(await tip.isVisible()));
    await vraag.click(); await page.mouse.move(5, 5);
    check('(?) tikken (klik) houdt de tooltip open', await tip.isVisible());
    await page.mouse.click(5, 5);
    check('(?) tik ernaast sluit', !(await tip.isVisible()));

    await sectie(page).getByRole('button', { name: 'Додати passkey' }).click();
    const verder = sectie(page).getByRole('button', { name: 'Продовжити' });
    const kleur = await verder.evaluate((el) => { const c = getComputedStyle(el); return `${c.color}|${c.backgroundColor}|${c.opacity}`; });
    check('«Продовжити» in donker thema: donkere tekst op lichte accentkleur, niet uitgeschakeld', /^rgb\(16, 32, 31\)/.test(kleur) && !(await verder.isDisabled()), kleur);
    await sectie(page).locator('#passkey-naam').fill('E2E laptop');
    await verder.click();
    const venster = page.getByRole('dialog');
    await venster.waitFor({ timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${UIT}/e2e-03-venster.png` });
    check('klik «Продовжити» (oude aanmelding) opent «Підтвердіть доступ»', await venster.isVisible() && /Підтвердіть доступ/.test(await venster.innerText()), fouten.join(' | '));
    check('achter het venster staat een zichtbare wachtregel (niet stil)', await sectie(page).locator('[data-passkey-wacht]').isVisible());
    await venster.getByRole('button', { name: 'Підтвердити повторним входом через Google' }).click();
    await page.waitForURL(/id\.tarasevych\.com\/methods/, { timeout: 20000 }).catch(() => undefined);
    await sectie(page).locator('[data-passkey]').first().waitFor({ timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${UIT}/e2e-04-na-toevoegen.png`, fullPage: true });
    const na = await sectie(page).innerText().catch(() => '');
    check('Google (gestubd) bezocht en terug op /methods', googleBezocht === 1 && /\/methods/.test(page.url()), `${googleBezocht} ${page.url()}`);
    check('na terugkeer hervat: passkey «E2E laptop» staat in de lijst (navigator.credentials.create gebeurde)', await sectie(page).locator('[data-passkey]').count() === 1 && /E2E laptop/.test(na), na.slice(0, 400));
    check('eigenaar: per passkey «Може схвалювати оновлення сервера»', /Може схвалювати оновлення сервера/.test(na));
    check('geen consolefouten in de hele eigenaar-flow', fouten.length === 0, fouten.join(' | '));

    // ---------------------------------------------------------------- 2/3. verse aanmelding met usb- en hybrid-authenticator
    for (const [transport, letter] of [['usb', 'b'], ['cable', 'c']] as const) {
      const email = `e2e-${letter}-${T}@example.test`;
      const s2 = await sessie(email, `sub-e2e-${letter}-${T}`, true);
      await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and data->>'email'=$1", [email]);
      const p2 = await s2.ctx.newPage();
      const f2: string[] = [];
      volg(p2, f2);
      const a = await authenticator(p2, transport);
      await p2.goto('https://id.tarasevych.com/methods?lang=uk', { waitUntil: 'networkidle' });
      await p2.waitForSelector('[data-access-section="passkeys"]', { timeout: 20000 });
      await sectie(p2).getByRole('button', { name: 'Додати passkey' }).click();
      await sectie(p2).getByRole('button', { name: 'Продовжити' }).click();
      await sectie(p2).locator('[data-passkey]').first().waitFor({ timeout: 15000 }).catch(() => undefined);
      const tekst = await sectie(p2).innerText();
      const naam = transport === 'usb' ? 'Ключ безпеки' : 'Телефон або планшет';
      check(`verse aanmelding, ${transport === 'cable' ? 'hybrid (cable)' : transport}: passkey toegevoegd zonder venster, type «${naam}»`, /Passkey додано/.test(tekst) && tekst.includes(naam) && await p2.getByRole('dialog').count() === 0, `${tekst.slice(0, 400)} | ${f2.join(' | ')}`);
      if (transport === 'usb') {
        // Hangend passkey-venster (geen aanraking): zichtbare wachtregel + «Скасувати» breekt af met een melding.
        await a.cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId: a.authenticatorId });
        await a.cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: false } });
        await sectie(p2).getByRole('button', { name: 'Додати passkey' }).click();
        await sectie(p2).getByRole('button', { name: 'Продовжити' }).click();
        const wacht = sectie(p2).locator('[data-passkey-wacht="venster"]');
        await wacht.waitFor({ timeout: 10000 }).catch(() => undefined);
        await p2.screenshot({ path: `${UIT}/e2e-05-wacht-op-venster.png` });
        check('hangend venster: wachtregel «Відкрито вікно passkey…» zichtbaar', await wacht.isVisible());
        await sectie(p2).getByRole('button', { name: 'Скасувати' }).click();
        await sectie(p2).getByText('Додавання passkey скасовано.').waitFor({ timeout: 5000 }).catch(() => undefined);
        check('«Скасувати» breekt af en toont «Додавання passkey скасовано.»', await sectie(p2).getByText('Додавання passkey скасовано.').isVisible());
        check('usb: geen consolefouten (annulering is console.info)', f2.length === 0, f2.join(' | '));
      } else check('hybrid: geen consolefouten', f2.length === 0, f2.join(' | '));
      await s2.ctx.close();
    }
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await browser.close().catch(() => undefined);
    // Opruimen: de unieke index records_een_eigenaar staat maar één eigenaar toe; een achtergebleven e2e-eigenaar laat de
    // eenheidstest «aanmelden» anders mislukken.
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`e2e-%-${T}@example.test`]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await stop();
  }
  return einde();
}
