// E2E §13.10 «Способи входу» in context, met een echte Chrome (opzet zoals herstelcodes.e2e.ts) en een virtuele authenticator.
// 1. Eigenaar voegt een passkey toe (Google-step-up, gestubd), vraagt «Може схвалювати оновлення сервера» aan; root bevestigt
//    met de SSH-opdracht (goedkeur-hulp.mjs, tijdelijke map) → «Може схвалювати оновлення».
// 2. Herstelcodes maken; een tweede sessie gebruikt code 4 in het venster voor «passkey toevoegen» → in de lijst staat bij die
//    code «Додавання passkey · id.tarasevych.com · Chrome · Linux · IP #…».
// 3. Notities: potloodje bij de passkey, de set en code 4; opslaan; blijft na herladen; > 500 tekens kan niet.
// 4. Recht intrekken: reden verplicht (knop pas actief bij ≥ 10 tekens); de server weigert de (nog geldige) Google-step-up
//    (STEP_UP_STRONG_REQUIRED) → venster zonder Google-knop → passkey → intrekverzoek; status «Відкликається сервером…».
// 5. Melding «Це були ви?» in de bel (andere sessie) → link → paneel → «Це був не я — скасувати та захистити акаунт» → passkey →
//    recht behouden (root had nog niet verwerkt), de sessie die de wijziging deed is uitgelogd.
// 6. «Історія» bij de passkey en het journaal op /agents (soort «Права й ключі»).
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const HULP = resolve('deploy/goedkeuring/goedkeur-hulp.mjs');
// Verwacht: 403 step-up (venster), 403 STEP_UP_STRONG_REQUIRED, agents/activity (403) en 401 van de uitgelogde sessie.
const VERWACHT = [/^403 .*\/api\/owner\/access\/(passkeys\/(registreren\/opties|goedkeuring\/aanvragen|goedkeuring\/recht-intrekken)|recovery\/rotate|toegang\/wijziging\/terugdraaien)$/, /^403 .*\/api\/owner\/agents\/activity$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e toegang-context');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-tc-${T}@example.test`, sub = `sub-e2e-tc-${T}`;
  // Root-kant in een tijdelijke map (zoals de eenheidstests).
  const basis = mkdtempSync(join(tmpdir(), 'e2e-toegang-'));
  const inbox = join(basis, 'inbox'), statusDir = join(basis, 'status'); mkdirSync(inbox); mkdirSync(statusDir);
  const sleutels = join(basis, 'goedkeur-passkeys.json'), rechten = join(basis, 'mcp-rechten.json');
  writeFileSync(sleutels, JSON.stringify({ versie: 1, rpId: 'tarasevych.com', origins: ['https://admin.tarasevych.com', 'https://id.tarasevych.com'], sleutels: [] }));
  writeFileSync(rechten, JSON.stringify({ 'passkey-goedkeuring': true }));
  const ENV = ['GOEDKEUR_SLEUTELS', 'GOEDKEUR_INBOX', 'MCP_RECHTEN_PAD', 'OPDRACHT_STATUS_DIR'] as const;
  const vorige = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  Object.assign(process.env, { GOEDKEUR_SLEUTELS: sleutels, GOEDKEUR_INBOX: inbox, MCP_RECHTEN_PAD: rechten, OPDRACHT_STATUS_DIR: statusDir });
  const rootHulp = (...args: string[]) => spawnSync(process.execPath, [HULP, ...args], { env: { ...process.env, GOEDKEUR_SLEUTELS: sleutels, GOEDKEUR_STAAT: join(basis, 'staat'), GOEDKEUR_INBOX: inbox, GOEDKEUR_STATUS_DIR: statusDir, GOEDKEUR_RECHTEN: rechten, GOEDKEUR_GROEP: 'nogroup' }, encoding: 'utf8' });
  const rootN = () => JSON.parse(readFileSync(sleutels, 'utf8')).sleutels.length as number;

  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [`--host-resolver-rules=MAP *.tarasevych.com:443 127.0.0.1:${POORT}, MAP tarasevych.com:443 127.0.0.1:${POORT}`] });
  const oud = Math.floor(Date.now() / 1000) - 3600;
  try {
    const stub = { sub, email: eigenaar, authTime: Math.floor(Date.now() / 1000) as number | null };
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
    const volg = (page: Page, lijst: string[], extra: RegExp[] = []) => {
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) lijst.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => lijst.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && ![...VERWACHT, ...extra].some((v) => v.test(k))) lijst.push(`http ${k}`); });
    };
    const pk = (page: Page) => page.locator('[data-access-section="passkeys"]');
    const herstel = (page: Page) => page.locator('[data-access-section="recovery"]');
    const open = async (page: Page, q = '') => { await page.goto(`${ID}/methods?lang=uk${q}`, { waitUntil: 'networkidle' }); await pk(page).waitFor({ timeout: 20000 }); await page.waitForTimeout(400); };

    // ---------------------------------------------------------------- 1. passkey + recht bij root
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
    check('passkey toegevoegd na Google-step-up (hervat)', await pk(page).locator('[data-passkey]').count() === 1, page.url());
    const rij = pk(page).locator('[data-passkey]').first();
    const pid = String(await rij.getAttribute('data-passkey'));
    await rij.getByLabel('Може схвалювати оновлення сервера').click();
    const ssh = rij.locator('.access-plane-ssh');
    await ssh.waitFor({ timeout: 10000 }).catch(() => undefined);
    const opdracht = (await ssh.innerText().catch(() => '')).trim();
    const sshRes = rootHulp('toevoegen', opdracht.split(' ').pop() || '');
    check('eerste goedkeur-sleutel via de SSH-opdracht uit de UI', /^sudo mijn-ruimte-passkey toevoegen [0-9a-f]{32}$/.test(opdracht) && sshRes.status === 0 && rootN() === 1, `${opdracht} ${sshRes.stderr}`);
    await open(page);
    check('status «Може схвалювати оновлення»', /Може схвалювати оновлення/.test(await rij.innerText()));

    // ---------------------------------------------------------------- 2. herstelcodes + gebruik met actie + apparaat
    await herstel(page).getByRole('button', { name: 'Створити коди' }).click();
    const paneel = page.locator('[data-herstel-nieuw]');
    await paneel.waitFor({ timeout: 20000 });
    const codes = (await paneel.locator('li').allInnerTexts()).map((x) => x.trim());
    await paneel.getByLabel('Я зберіг коди').check();
    await paneel.getByRole('button', { name: 'Готово' }).click();
    await page.locator('[data-herstel-lijst]').waitFor({ timeout: 10000 });
    check('10 herstelcodes gemaakt (step-up nog geldig)', codes.length === 10);
    const B = await sessie('light');
    const p2 = B.page;
    const f2: string[] = [];
    volg(p2, f2);
    await open(p2);
    await pk(p2).getByRole('button', { name: 'Додати passkey' }).click();
    await pk(p2).locator('#passkey-naam').fill('Ноутбук');
    await pk(p2).getByRole('button', { name: 'Продовжити' }).click();
    const v2 = p2.getByRole('dialog');
    await v2.waitFor({ timeout: 10000 });
    await v2.getByRole('button', { name: 'Використати код відновлення' }).click();
    await v2.locator('#bevestig-toegang-code').fill(codes[3]);
    await v2.getByRole('button', { name: 'Підтвердити' }).click();
    await pk(p2).locator('[data-passkey]').nth(1).waitFor({ timeout: 20000 }).catch(() => undefined);
    check('tweede sessie: code 4 in het venster → passkey «Ноутбук» toegevoegd', await pk(p2).locator('[data-passkey]').count() === 2, f2.join(' | '));
    await open(page);
    const c4 = page.locator('[data-herstel-lijst] li[data-herstel-nr="4"]');
    await c4.locator('[data-gebruik]').waitFor({ timeout: 10000 }).catch(() => undefined);
    const c4t = await c4.innerText().catch(() => '');
    check('code 4: «Додавання passkey» · id.tarasevych.com · Chrome · Linux · IP #<12 hex>', /Додавання passkey/.test(c4t) && /id\.tarasevych\.com/.test(c4t) && /Chrome · Linux/.test(c4t) && /IP #[0-9a-f]{12}/.test(c4t), c4t);
    const pkGebruik = await pk(page).locator('[data-passkey] [data-gebruik-actie]').allInnerTexts().catch(() => [] as string[]);
    check('passkey «Телефон» toont nog geen gebruik (alleen aangemaakt) of een geldige actie', pkGebruik.every((x) => x.length > 0));

    // ---------------------------------------------------------------- 3. notities
    const zetNotitie = async (waar: import('playwright-core').Locator, tekst: string) => {
      await waar.locator('.toegang-potlood').first().click();
      await waar.locator('textarea').first().fill(tekst);
      await waar.getByRole('button', { name: 'Зберегти' }).first().click();
      await waar.locator('.toegang-notitie-tekst').first().waitFor({ timeout: 8000 }).catch(() => undefined);
    };
    await zetNotitie(rij.locator('[data-notitie]'), 'Основний телефон, лежить удома в сейфі');
    await zetNotitie(page.locator('[data-herstel-set-notitie]'), 'Роздруківка в папці «Документи», конверт 2');
    await zetNotitie(c4.locator('[data-notitie]'), 'Використано на ноутбуці');
    const teLang = rij.locator('[data-notitie]');
    await teLang.locator('.toegang-potlood').click();
    await teLang.locator('textarea').fill('я'.repeat(520));
    const waarde = await teLang.locator('textarea').inputValue();
    await teLang.getByRole('button', { name: 'Скасувати' }).click();
    check('notitie: invoer begrensd op 500 tekens', [...waarde].length === 500);
    await rij.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${UIT}/notities-01-passkey.png`, fullPage: false });
    await open(page);
    const nt = (await rij.locator('.toegang-notitie-tekst').innerText().catch(() => '')) + '|' + (await page.locator('[data-herstel-set-notitie] .toegang-notitie-tekst').innerText().catch(() => '')) + '|' + (await c4.locator('.toegang-notitie-tekst').innerText().catch(() => ''));
    check('notities blijven na herladen (passkey, set, code 4)', /Основний телефон/.test(nt) && /конверт 2/.test(nt) && /ноутбуці/.test(nt), nt);
    await herstel(page).scrollIntoViewIfNeeded();
    await c4.locator('.toegang-uitklap').click().catch(() => undefined);
    await page.screenshot({ path: `${UIT}/notities-02-herstelcodes.png`, fullPage: true });
    await p2.emulateMedia({ colorScheme: 'light' });
    await open(p2);
    await herstel(p2).scrollIntoViewIfNeeded();
    await p2.screenshot({ path: `${UIT}/notities-03-licht.png`, fullPage: true });
    check('notities: zichtbaar in de tweede sessie (zelfde gebruiker), licht thema', /конверт 2/.test(await herstel(p2).innerText()));

    // ---------------------------------------------------------------- 4. recht intrekken: reden + sterke step-up
    const sterkGeweigerd: string[] = [];
    page.on('response', async (q) => { if (/recht-intrekken$/.test(q.url()) && q.status() === 403) sterkGeweigerd.push(String((await q.json().catch(() => ({}))).error || '')); });
    await rij.getByRole('button', { name: 'Забрати право схвалювати' }).click();
    const form = rij.locator('[data-bevestig="intrekken"]');
    const knop = form.getByRole('button', { name: 'Забрати право' });
    check('intrekken: knop uit zonder reden', await knop.isDisabled());
    await form.locator('textarea').fill('кор');
    check('intrekken: knop uit met te korte reden', await knop.isDisabled() && /Ще \d+ симв/.test(await form.innerText()));
    await form.locator('textarea').fill('Телефон загубив у потязі');
    await rij.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${UIT}/intrekken-01-reden.png` });
    await knop.click();
    const v3 = page.getByRole('dialog');
    await v3.waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${UIT}/intrekken-02-sterk-venster.png` });
    const v3t = await v3.innerText();
    check('Google-step-up (nog geldig) geweigerd: STEP_UP_STRONG_REQUIRED, venster zonder Google-knop + uitleg', sterkGeweigerd.includes('STEP_UP_STRONG_REQUIRED') && await v3.getByRole('button', { name: /Google/ }).count() === 0 && /Повторного входу через Google недостатньо/.test(v3t), `${sterkGeweigerd.join(',')} | ${v3t.slice(0, 300)}`);
    await v3.getByRole('button', { name: 'Використати passkey' }).click();
    await rij.getByText('Відкликається сервером').waitFor({ timeout: 15000 }).catch(() => undefined);
    check('na passkey: intrekverzoek ligt bij root, sleutel nog in root, status «Відкликається сервером…»', readdirSync(inbox).some((f) => f.startsWith('sleutel-intrekken-')) && rootN() === 1 && /Відкликається сервером/.test(await rij.innerText()), await rij.innerText());
    await rij.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${UIT}/intrekken-03-wordt-ingetrokken.png` });

    // ---------------------------------------------------------------- 5. melding + «Це був не я» vanuit sessie B
    const f3: string[] = [];
    volg(p2, f3, [/^401 /]);
    await open(p2);
    await p2.locator('button[aria-label^="Непрочитаних сповіщень"], button[aria-label="Центр сповіщень"]').first().click();
    const link = p2.locator('a.cnc-link', { hasText: 'Переглянути зміну' }).first();
    await link.waitFor({ timeout: 10000 }).catch(() => undefined);
    await p2.waitForTimeout(300);
    await p2.screenshot({ path: `${UIT}/intrekken-04-melding.png` });
    const href = String(await link.getAttribute('href').catch(() => '') || '');
    check('bel: «Це були ви? / Was u dit?» met link «Переглянути зміну»', /^https:\/\/id\.tarasevych\.com\/methods\?wijziging=[0-9a-f-]{36}$/.test(href) && /Це були ви\?/.test(await p2.locator('.cnc-row').first().innerText().catch(() => '')), href);
    await link.click();
    await p2.waitForURL(/wijziging=/, { timeout: 15000 }).catch(() => undefined);
    const wp = p2.locator('[data-toegang-wijziging]');
    await wp.locator('[data-niet-ik]').waitFor({ timeout: 15000 }).catch(() => undefined);
    const wpt = await wp.innerText().catch(() => '');
    check('paneel «Це були ви?»: wat, wie, wanneer, reden, sleutel, apparaat, stand', /Право схвалювати оновлення відкликано/.test(wpt) && wpt.includes(eigenaar) && /Телефон загубив у потязі/.test(wpt) && /«Телефон»/.test(wpt) && /Chrome · Linux/.test(wpt) && /ще не обробив відкликання/.test(wpt), wpt.slice(0, 500));
    await p2.screenshot({ path: `${UIT}/intrekken-05-was-u-dit.png`, fullPage: true });
    await wp.locator('[data-niet-ik]').click();
    // Sessie B bevestigde net nog met een herstelcode (sterk, < 5 min): dan volgt geen nieuw venster. Komt er toch een, dan
    // mag daar geen Google-knop in staan.
    const v4 = p2.getByRole('dialog');
    await Promise.race([v4.waitFor({ timeout: 10000 }), wp.locator('[data-uitkomst]').waitFor({ timeout: 10000 })]).catch(() => undefined);
    if (await v4.isVisible().catch(() => false)) {
      check('«Це був не я»: venster zonder Google-knop', await v4.getByRole('button', { name: /Google/ }).count() === 0);
      await v4.getByRole('button', { name: 'Використати passkey' }).click();
    } else check('«Це був не я»: recente sterke bevestiging (herstelcode) van deze sessie volstaat', true);
    await wp.locator('[data-uitkomst]').waitFor({ timeout: 15000 }).catch(() => undefined);
    const ut = await wp.innerText().catch(() => '');
    check('teruggedraaid: recht behouden, sessie van de wijziging beëindigd, intrekverzoek weg', await wp.locator('[data-uitkomst="behouden"]').count() === 1 && /Сесію, з якої зробили зміну, завершено/.test(ut) && !readdirSync(inbox).some((f) => f.startsWith('sleutel-intrekken-')) && rootN() === 1, ut.slice(0, 400));
    await p2.screenshot({ path: `${UIT}/intrekken-06-teruggedraaid.png`, fullPage: true });
    const aStatus = await page.evaluate(async (t) => (await fetch('/api/owner/access/passkeys/lijst', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'identity', tabContext: t }) })).status, A.tab);
    check('sessie A (die de wijziging deed) is uitgelogd (401)', aStatus === 401, String(aStatus));

    // ---------------------------------------------------------------- 6. geschiedenis + journaal
    await open(p2);
    const rB = pk(p2).locator(`[data-passkey="${pid}"]`);
    check('na terugdraaien: «Телефон» mag weer goedkeuren', /Може схвалювати оновлення/.test(await rB.innerText()));
    await rB.locator('[data-geschiedenis] .toegang-uitklap').click();
    const gt = await rB.locator('[data-geschiedenis]').innerText();
    check('«Історія»: intrekken (reden, wie, apparaat) met «Скасовано», aanvraag en root-bevestiging', /Право схвалювати оновлення відкликано/.test(gt) && /Скасовано/.test(gt) && /Телефон загубив у потязі/.test(gt) && /Сервер прийняв ключ/.test(gt) && /Запит права схвалювати оновлення/.test(gt), gt.slice(0, 600));
    await rB.scrollIntoViewIfNeeded();
    await p2.screenshot({ path: `${UIT}/intrekken-07-geschiedenis.png`, fullPage: true });
    await p2.goto(`${MCP}/agents#journaal`, { waitUntil: 'networkidle' });
    await p2.locator('[role=tab][data-tab="journaal"]').click().catch(() => undefined);
    await p2.locator('[data-filter="soort"]').selectOption('toegang').catch(() => undefined);
    const jl = p2.locator('[data-tab-inhoud="journaal"] .ag-journaal');
    await jl.locator('[data-rij]').first().waitFor({ timeout: 15000 }).catch(() => undefined);
    const jt = await jl.innerText().catch(() => '');
    check('/agents → Журнал «Права й ключі»: intrekken met reden en «Це був не я»', /Відкликано право схвалювати оновлення в ключа «Телефон»/.test(jt) && /причина: Телефон загубив у потязі/.test(jt) && /Це був не я/.test(jt), jt.slice(0, 500));
    await p2.screenshot({ path: `${UIT}/intrekken-08-journaal.png`, fullPage: true });
    const echteA = fouten.filter((x) => !/^http 401 /.test(x)); // 401 na het beëindigen van sessie A is juist de bedoeling
    check('geen consolefouten (A)', echteA.length === 0, echteA.join(' | '));
    check('geen consolefouten (B)', f2.length === 0 && f3.length === 0, [...f2, ...f3].join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await browser.close().catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = $1", [eigenaar]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) {
      for (const t of ['passkeys', 'passkey_uitdagingen', 'toegang_gebruik', 'toegang_notities', 'toegang_wijzigingen']) await pool.query(`delete from app.${t} where user_id = any($1)`, [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    }
    for (const k of ENV) { const v = vorige[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(basis, { recursive: true, force: true });
    await stop();
  }
  return einde();
}
