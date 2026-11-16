// IDENTITEIT-015 (лінія e2): приймання «гостьових кодів» (обмежені коди доступу для інших) — справжній Chromium, вигадані особи
// @example.test, кожна — окремий контекст браузера (окремий набір cookie).
//  1. Власник сайту (центр облікового запису): passkey → код «Усі дозволені» (приватна нотатка, своя дата, не більше 2 разів) і код
//     «Лише вибрані» (лише профіль, 1 година, одноразовий); показ коду й QR (на знімку розмито verberg()); перелік зі станами.
//  2. Гість у НОВОМУ контексті без cookie: вхід кодом, лише дозволені розділи, лише перегляд, прямі запити до заборонених /api — відмова;
//     приватну нотатку гість не бачить; одноразовий і «не більше 2» вичерпуються.
//  3. Строк: скоротити — без додаткового підтвердження; подовжити — лише з посиленим (passkey) на свіжому пристрої власника.
//  4. Історія використань і дій; відкликання з причиною → гість втрачає доступ одразу. 5. Закінчення строку (SQL-зсув) → гість поза.
//  6. Схвалений НЕ-власник сайту: без прапорця gastcodes-iedereen — чесна відмова з поясненням; з прапорцем (передумова власника
//     сайту: увімкнути «Коди доступу для гостей — і для інших облікових записів» для цієї людини) — створює код, а гість бачить ЛИШЕ
//     дані власника коду (не власника сайту).
// Знімки gastcodes-*.png (≤ 6, знеособлені). Назовні не йде нічого (scripts/e2e-lokaal.mjs).
// Acceptatie gastcodes: eigenaar en gast, verloop korter/langer, geschiedenis, intrekken, verlopen, niet-eigenaar met en zonder vlag.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { Browser, BrowserContext, CDPSession, Page } from 'playwright-core';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { ID, verberg } from './hulp/sessie-015';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const VLAG = 'gastcodes-iedereen';
// Очікувані відмови: вікна посиленого підтвердження (403) і журнал агентів; для гостя — 40x на /api/gast/* і 401 на /api/owner/*.
const VERWACHT = [/^403 .*\/api\/owner\/access\/(passkeys\/registreren\/opties|toegangscodes\/(maken|wijzigen))$/, /^403 .*\/api\/owner\/agents\/activity$/];
const GAST_VERWACHT = [/^40[0-3] .*\/api\/gast\//, /^401 .*\/api\/owner\//, /^429 .*\/api\/gast\/inwisselen$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-015 gastcodes');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-i15g-eig-${T}@example.test`, subO = `sub-e2e-i15g-eig-${T}`;
  const ander = `e2e-i15g-ander-${T}@example.test`, subN = `sub-e2e-i15g-ander-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const browser: Browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const oud = Math.floor(Date.now() / 1000) - 3600;
  const vlagVooraf = (await pool.query('SELECT aan, standaard, percentage, gebruikers FROM app.feature_flags WHERE sleutel = $1', [VLAG])).rows[0];
  const NOTITIE = 'Приватно: сусідка Віра, поливає квіти';
  const fouten: string[] = [], gastFouten: string[] = [];
  try {
    type Sessie = { ctx: BrowserContext; page: Page; tab: string; cdp: CDPSession; auth: string };
    const sessie = async (sub: string, email: string, scheme: 'dark' | 'light' = 'light'): Promise<Sessie> => {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      await b.aanmelden(sub, email, { service: 'identity', tabContext: tab, intent: 'login', authTime: oud });
      const ctx = await browser.newContext({ colorScheme: scheme, locale: 'uk-UA', viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, 'https://mcp.tarasevych.com'].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
      await ctx.route('https://accounts.google.com/**', async (route) => {
        const u = new URL(route.request().url());
        const code = G.codeVoor(sub, email, u.searchParams.get('nonce') || '', Math.floor(Date.now() / 1000));
        const terug = new URL(u.searchParams.get('redirect_uri') || `${ID}/`);
        terug.searchParams.set('state', u.searchParams.get('state') || ''); terug.searchParams.set('code', code);
        await route.fulfill({ status: 302, headers: { location: terug.href } });
      });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
      return { ctx, page, tab, cdp, auth: authenticatorId };
    };
    const gastContext = async (scheme: 'dark' | 'light' = 'light') => {
      const ctx = await browser.newContext({ colorScheme: scheme, locale: 'uk-UA', viewport: { width: 1100, height: 820 }, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block' });
      const page = await ctx.newPage();
      volg(page, gastFouten, GAST_VERWACHT);
      return { ctx, page };
    };
    const volg = (page: Page, lijst: string[], extra: RegExp[] = [], wie = '') => {
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) lijst.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => lijst.push(`pageerror: ${e.message}`));
      page.on('response', async (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() < 400 || [...VERWACHT, ...extra].some((v) => v.test(k))) return; const c = await q.json().then((j: { error?: string }) => j?.error || '').catch(() => ''); lijst.push(`${wie}http ${k}${c ? ` (${c})` : ''}`); });
    };
    const tc = (page: Page) => page.locator('[data-access-section="toegangscodes"]');
    const pk = (page: Page) => page.locator('[data-access-section="passkeys"]');
    const open = async (page: Page) => { await page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' }); await tc(page).waitFor({ timeout: 20000 }); await page.waitForTimeout(400); };
    const post = (page: Page, pad: string, body: unknown = {}) => page.evaluate(async ([p, b]) => {
      const r = await fetch(p as string, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      return { status: r.status, data: await r.json().catch(() => ({})) as Record<string, any>, tekst: '' };
    }, [pad, body] as const);
    const eigen = (s: Sessie, pad: string, body: Record<string, unknown> = {}) => post(s.page, pad, { service: 'identity', tabContext: s.tab, ...body });
    const kijkNu = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const weg = async (page: Page) => { await page.locator('[data-gast-inwisselen] .gast-melding').waitFor({ timeout: 10000 }).catch(() => undefined); return /Гостьову сесію завершено/.test(await page.locator('[data-gast-inwisselen]').innerText().catch(() => '')); };
    const venster = async (page: Page) => {
      const v = page.getByRole('dialog');
      if (!await v.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)) return 'geen';
      await page.waitForTimeout(250);
      await v.getByRole('button', { name: 'Використати passkey' }).click();
      return 'passkey';
    };
    const passkeyToevoegen = async (page: Page) => {
      await pk(page).getByRole('button', { name: 'Додати passkey' }).click();
      await pk(page).locator('#passkey-naam').fill('Телефон');
      await pk(page).getByRole('button', { name: 'Продовжити' }).click();
      const v = page.getByRole('dialog');
      await v.waitFor({ timeout: 10000 });
      await v.getByRole('button', { name: 'Підтвердити повторним входом через Google' }).click();
      await pk(page).locator('[data-passkey]').first().waitFor({ timeout: 25000 }).catch(() => undefined);
      return pk(page).locator('[data-passkey]').count();
    };
    type Maak = { naam: string; notitie?: string; modus: 'alle' | 'gekozen'; scopes?: string[]; verloop: 'datum' | '1 година' | 'Безстроково'; eenmalig?: boolean; max?: string };
    const maakCode = async (page: Page, o: Maak, voorFoto?: () => Promise<void>) => {
      await tc(page).getByRole('button', { name: 'Створити код доступу' }).click();
      const f = tc(page).locator('[data-code-form]');
      await f.locator('#toegangscode-naam').fill(o.naam);
      if (o.notitie) await f.locator('#toegangscode-notitie').fill(o.notitie);
      await f.locator(`[data-scope-modus="${o.modus}"]`).check();
      for (const s of o.scopes || []) await f.locator(`[data-scope="${s}"]`).check();
      if (o.verloop === 'datum') {
        await f.getByLabel('Своя дата й час').click();
        const d = new Date(Date.now() + 2 * 86400000); const p = (n: number) => String(n).padStart(2, '0');
        await f.locator('[data-verloop-datum]').fill(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T18:30`);
      } else await f.getByLabel(o.verloop, { exact: true }).click();
      if (o.eenmalig) await f.getByLabel('Одноразовий').click();
      else if (o.max) await f.locator('.toegangscode-max input').fill(o.max);
      if (voorFoto) await voorFoto();
      await f.getByRole('button', { name: 'Створити код' }).click();
      const v = await venster(page);
      const getoond = tc(page).locator('[data-code-getoond]');
      await getoond.waitFor({ timeout: 20000 });
      return { code: (await getoond.locator('[data-code]').innerText()).trim(), venster: v, getoond };
    };
    const rijVan = (page: Page, naam: string) => tc(page).locator('[data-toegangscode]', { has: page.locator('strong', { hasText: naam }) }).first();
    const inwisselen = async (page: Page, code: string) => {
      await page.goto(`${ID}/toegang#code=${code}`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'Увійти як гість' }).click();
      return page.locator('[data-gast-banner]').waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
    };
    const geweigerd = async (page: Page, code: string) => {
      await page.goto(`${ID}/toegang`, { waitUntil: 'networkidle' });
      await page.locator('#gast-code').fill(code);
      await page.getByRole('button', { name: 'Увійти як гість' }).click();
      await page.locator('.gast-fout').waitFor({ timeout: 10000 }).catch(() => undefined);
      return /Код недійсний/.test(await page.locator('.gast-fout').innerText().catch(() => ''));
    };
    const uidVan = async (email: string) => String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id || '');
    const sterk403: string[] = [];
    const luisterSterk = (page: Page) => page.on('response', async (q) => { if (/toegangscodes\/(maken|wijzigen)$/.test(q.url()) && q.status() === 403) sterk403.push(`${q.url().split('/').pop()}:${String((await q.json().catch(() => ({}))).error || '')}`); });

    // ================================================================ 1. власник сайту: passkey і два коди
    const A = await sessie(subO, eigenaar);
    volg(A.page, fouten, [], 'A:'); luisterSterk(A.page);
    await open(A.page);
    check('власник: passkey додано (передумова посиленого підтвердження)', await passkeyToevoegen(A.page) === 1);
    const oId = await uidVan(eigenaar);
    await sys.query("insert into app.agents (user_id, name, platform, token_hash) values ($1, 'Сервер власника', 'linux', $2)", [oId, randomBytes(32).toString('hex')]);
    await tc(A.page).scrollIntoViewIfNeeded();
    // «Усі дозволені» → усі розділи позначено; «Лише вибрані» → ручний вибір (порожній); знову «Усі» — для коду K1.
    const K1 = await maakCode(A.page, { naam: 'Для сусідки', notitie: NOTITIE, modus: 'alle', verloop: 'datum', max: '2' }, async () => {
      const f = tc(A.page).locator('[data-code-form]');
      const alleAan = await f.locator('[data-scope]').evaluateAll((els) => els.every((e) => (e as HTMLInputElement).checked));
      await f.locator('[data-scope-modus="gekozen"]').check();
      const geenAan = await f.locator('[data-scope]').evaluateAll((els) => els.every((e) => !(e as HTMLInputElement).checked));
      const knopUit = await f.getByRole('button', { name: 'Створити код' }).isDisabled();
      await f.locator('[data-scope-modus="alle"]').check();
      check('форма: «Усі дозволені розділи» позначає весь перелік; «Лише вибрані» → ручний вибір, без розділів кнопка вимкнена', alleAan && geenAan && knopUit && await f.locator('[data-scope]:checked').count() === 3);
      check('форма: перелік «Ніколи не доступно гостю» видно (входи, ключі, токени, сесії, нотатки…)', /Способи входу/.test(await f.locator('.toegangscode-nooit').innerText()) && /нотатки/.test(await f.locator('.toegangscode-nooit').innerText()));
    });
    check('K1 («Усі дозволені», ≤2): посилене підтвердження passkey, код XXXX-XXXX-XXXX-XXXX показано один раз + QR', sterk403.includes('maken:STEP_UP_STRONG_REQUIRED') && K1.venster === 'passkey'
      && /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(K1.code) && await K1.getoond.locator('svg.toegangscode-qr path').count() === 1, `${sterk403.join(',')} ${K1.venster}`);
    await K1.getoond.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await verberg(A.page);
    const blur = await K1.getoond.locator('.toegangscode-code').evaluate((e) => getComputedStyle(e).filter);
    check('знімок: код і QR розмито (verberg)', /blur/.test(blur), blur);
    await A.page.screenshot({ path: `${UIT}/gastcodes-01-code-qr.png` });
    await K1.getoond.getByRole('button', { name: 'Готово' }).click();
    const K2 = await maakCode(A.page, { naam: 'Одноразовий для майстра', modus: 'gekozen', scopes: ['profiel.lezen'], verloop: '1 година', eenmalig: true });
    await K2.getoond.getByRole('button', { name: 'Готово' }).click();
    const r1 = rijVan(A.page, 'Для сусідки'), r2 = rijVan(A.page, 'Одноразовий для майстра');
    await r2.waitFor({ timeout: 10000 });
    const r1t = await r1.innerText(), r2t = await r2.innerText();
    check('перелік: K1 «Діє», 3 розділи, «багаторазовий · 0 з 2», код не видно; власник бачить свою приватну нотатку', await r1.getAttribute('data-status') === 'actief'
      && await r1.locator('.toegangscode-scope-pil').count() === 3 && /багаторазовий/.test(r1t) && /0 з 2/.test(r1t) && !r1t.includes(K1.code) && (r1t.includes(NOTITIE) || (await r1.locator('textarea, input').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value))).includes(NOTITIE)), r1t.slice(0, 400));
    check('перелік: K2 «одноразовий · 0 з 1», лише профіль', /одноразовий/.test(r2t) && /0 з 1/.test(r2t) && await r2.locator('.toegangscode-scope-pil').count() === 1);
    const k1Id = String(await r1.getAttribute('data-toegangscode')), k2Id = String(await r2.getAttribute('data-toegangscode'));

    // ================================================================ 2. гість (новий контекст, без cookie)
    const G1 = await gastContext();
    check('гість G1: без cookie власника вхід кодом K2 (одноразовий)', (await G1.ctx.cookies(ID)).length === 0 && await inwisselen(G1.page, K2.code));
    await G1.page.locator('[data-gast-inhoud="profiel.lezen"] .gast-profiel').waitFor({ timeout: 10000 }).catch(() => undefined);
    const tabs = await G1.page.locator('[data-gast-tab]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gast-tab')));
    const g1Tekst = await G1.page.locator('body').innerText();
    check('гість G1: лише дозволений розділ (профіль), без ел. адреси власника і без приватної нотатки', JSON.stringify(tabs) === '["profiel.lezen"]' && !g1Tekst.includes(eigenaar) && !g1Tekst.includes(NOTITIE) && /лише перегляд/.test(g1Tekst), `${JSON.stringify(tabs)} ${g1Tekst.slice(0, 200)}`);
    const velden = await G1.page.locator('[data-gast-inhoud] :is(input, textarea, select, [contenteditable="true"])').count();
    check('гість G1: лише читання — у вмісті немає полів для зміни', velden === 0, String(velden));
    const ap = await post(G1.page, '/api/gast/bekijk', { scope: 'apparaten.lezen' });
    const jr = await post(G1.page, '/api/gast/bekijk', { scope: 'journaal.lezen' });
    const nt = await post(G1.page, '/api/gast/bekijk', { scope: 'notities.lezen' });
    check('гість G1: прямі запити до не дозволених розділів (пристрої, журнал, нотатки) → 403 GAST_GEEN_TOEGANG', [ap, jr].every((x) => x.status === 403 && x.data.error === 'GAST_GEEN_TOEGANG') && nt.status >= 400 && nt.status < 500, `${ap.status} ${jr.status} ${nt.status} ${JSON.stringify(nt.data)}`);
    const own = await Promise.all(['/api/owner/access/toegangscodes/lijst', '/api/owner/access/toegangscodes/maken', '/api/owner/access/toegangscodes/intrekken', '/api/owner/access/notities/lijst', '/api/owner/access/passkeys/lijst']
      .map((p) => post(G1.page, p, { service: 'identity', id: k1Id, reden: 'спроба гостя відкликати' })));
    check('гість G1: маршрути власника (коди, створення, відкликання, нотатки, ключі) → 401/403, жодних даних', own.every((x) => x.status === 401 || x.status === 403) && !own.some((x) => 'codes' in x.data || 'notities' in x.data || 'passkeys' in x.data), own.map((x) => x.status).join(','));
    const sessieInfo = await post(G1.page, '/api/gast/sessie');
    check('гість G1: відповідь сесії без приватної нотатки й без ел. адреси власника', sessieInfo.status === 200 && !JSON.stringify(sessieInfo.data).includes(NOTITIE) && !JSON.stringify(sessieInfo.data).includes(eigenaar), JSON.stringify(sessieInfo.data).slice(0, 200));
    await verberg(G1.page);
    await G1.page.screenshot({ path: `${UIT}/gastcodes-02-gast-alleen-profiel.png` });
    const G2 = await gastContext('dark');
    check('одноразовий K2 вичерпано: другий гість → «Код недійсний»', await geweigerd(G2.page, K2.code));
    // K1: не більше 2 разів
    const G3 = await gastContext(), G4 = await gastContext(), G5 = await gastContext();
    const in3 = await inwisselen(G3.page, K1.code), in4 = await inwisselen(G4.page, K1.code);
    const tabs3 = await G3.page.locator('[data-gast-tab]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gast-tab')));
    check('K1 («Усі дозволені»): гості G3 і G4 увійшли й бачать три розділи (профіль, пристрої, журнал)', in3 && in4 && tabs3.length === 3, JSON.stringify(tabs3));
    await G3.page.locator('[data-gast-tab="apparaten.lezen"]').click();
    const zichtbaar = await G3.page.locator('[data-gast-inhoud="apparaten.lezen"]').getByText('Сервер власника').waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    check('гість G3: пристрої власника коду лише для перегляду («Сервер власника»)', zichtbaar, await G3.page.locator('[data-gast-inhoud="apparaten.lezen"]').innerText().catch(() => ''));
    check('K1 вичерпано після 2 використань: третій гість → «Код недійсний»', await geweigerd(G5.page, K1.code));
    await open(A.page);
    const r1b = rijVan(A.page, 'Для сусідки'), r2b = rijVan(A.page, 'Одноразовий для майстра');
    check('стан: K1 «2 з 2» і «Використано», 2 активні гостьові сесії; K2 «Використано»', /2 з 2/.test(await r1b.innerText()) && await r1b.getAttribute('data-status') === 'gebruikt' && /активних гостьових сесій: 2/.test(await r1b.innerText()) && await r2b.getAttribute('data-status') === 'gebruikt', (await r1b.innerText()).slice(0, 300));

    // ================================================================ 3. строк: скоротити вільно; подовжити — посилено
    // Свіжий пристрій власника (без недавнього посиленого підтвердження); той самий passkey переносимо у віртуальний ключ цього пристрою.
    const B = await sessie(subO, eigenaar, 'dark');
    volg(B.page, fouten, [], 'B:'); luisterSterk(B.page);
    const { credentials } = await A.cdp.send('WebAuthn.getCredentials', { authenticatorId: A.auth });
    for (const c of credentials) await B.cdp.send('WebAuthn.addCredential', { authenticatorId: B.auth, credential: c });
    const K3 = await (async () => { const r = await eigen(A, '/api/owner/access/toegangscodes/maken', { naam: 'Для родича', scopes: ['profiel.lezen'], verloop: { soort: 'preset', preset: '7d' } }); return r; })();
    check('K3 (7 днів) створено з пристрою A (посилене підтвердження ще чинне)', K3.status === 200, `${K3.status} ${JSON.stringify(K3.data).slice(0, 120)}`);
    const k3Id = String(K3.data.item?.id || '');
    const vorig = new Date((await pool.query('select verloopt_op from app.toegangscodes where id=$1', [k3Id])).rows[0].verloopt_op).getTime();
    await open(B.page);
    const r3 = rijVan(B.page, 'Для родича');
    await r3.getByRole('button', { name: 'Змінити строк' }).click();
    const bv = r3.locator('[data-bevestig="code-verloop"]');
    await bv.getByLabel('1 день', { exact: true }).click();
    check('скорочення: підказка «можна без додаткового підтвердження»', /без додаткового підтвердження/.test(await bv.innerText()));
    const voorKort = sterk403.length;
    await bv.getByRole('button', { name: 'Зберегти строк' }).click();
    await bv.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    const kort = new Date((await pool.query('select verloopt_op from app.toegangscodes where id=$1', [k3Id])).rows[0].verloopt_op).getTime();
    check('скорочення 7 днів → 1 день: збережено без вікна підтвердження (жодної відмови 403)', kort < vorig - 5 * 86400000 && sterk403.length === voorKort && await B.page.getByRole('dialog').count() === 0, `${new Date(kort).toISOString()} ${sterk403.slice(voorKort).join(',')}`);
    const direct = await eigen(B, '/api/owner/access/toegangscodes/wijzigen', { id: k3Id, verloop: { soort: 'preset', preset: '30d' } });
    check('подовження прямим запитом без посиленого підтвердження → 403 STEP_UP_STRONG_REQUIRED, строк не змінено', direct.status === 403 && direct.data.error === 'STEP_UP_STRONG_REQUIRED'
      && new Date((await pool.query('select verloopt_op from app.toegangscodes where id=$1', [k3Id])).rows[0].verloopt_op).getTime() === kort, `${direct.status} ${direct.data.error}`);
    await r3.getByRole('button', { name: 'Змінити строк' }).click();
    await bv.getByLabel('30 днів', { exact: true }).click();
    check('подовження: підказка «потрібне підтвердження passkey…»', /Це продовження/.test(await bv.innerText()));
    await bv.getByRole('button', { name: 'Зберегти строк' }).click();
    const dlg = B.page.getByRole('dialog');
    const isDlg = await dlg.waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
    const zonderGoogle = isDlg && await dlg.getByRole('button', { name: /Google/ }).count() === 0;
    await B.page.waitForTimeout(300);
    await verberg(B.page);
    await B.page.screenshot({ path: `${UIT}/gastcodes-03-verlengen-sterk.png` });
    if (isDlg) await dlg.getByRole('button', { name: 'Використати passkey' }).click();
    await bv.waitFor({ state: 'detached', timeout: 15000 }).catch(() => undefined);
    const lang30 = new Date((await pool.query('select verloopt_op from app.toegangscodes where id=$1', [k3Id])).rows[0].verloopt_op).getTime();
    check('подовження в інтерфейсі: вікно посиленого підтвердження без кнопки Google → passkey → збережено (≈30 днів)', isDlg && zonderGoogle && lang30 > Date.now() + 29 * 86400000, `${isDlg} ${zonderGoogle} ${new Date(lang30).toISOString()}`);

    // ================================================================ 4. історія і відкликання з причиною
    await open(A.page);
    const r1c = rijVan(A.page, 'Для сусідки');
    const uk = r1c.locator('[data-code-geschiedenis] .toegang-uitklap');
    for (let i = 0; i < 3 && await uk.getAttribute('aria-expanded') !== 'true'; i++) { await uk.click(); await A.page.waitForTimeout(300); }
    const gt = await r1c.locator('[data-code-geschiedenis]').innerText();
    check('історія K1: створено, 2× гість увійшов, гість переглянув (пристрої), відмова (вичерпано)', /Код створено/.test(gt) && (gt.match(/Гість увійшов із кодом/g) || []).length === 2 && /Гість переглянув\s*:\s*Пристрої/.test(gt) && /Відмовлено/.test(gt), gt.slice(0, 600));
    const r3a = rijVan(A.page, 'Для родича');
    const uk3 = r3a.locator('[data-code-geschiedenis] .toegang-uitklap');
    for (let i = 0; i < 3 && await uk3.getAttribute('aria-expanded') !== 'true'; i++) { await uk3.click(); await A.page.waitForTimeout(300); }
    check('історія K3: дві дії «Строк змінено» (скорочення й подовження)', ((await r3a.locator('[data-code-geschiedenis]').innerText()).match(/Строк змінено/g) || []).length === 2);
    await r1c.getByRole('button', { name: 'Відкликати' }).click();
    const ib = r1c.locator('[data-bevestig="code-intrekken"]');
    const ik = ib.getByRole('button', { name: 'Відкликати код' });
    check('відкликання: кнопка вимкнена без причини', await ik.isDisabled());
    await ib.locator('textarea').fill('Сусідка вже повернула ключі');
    await ik.click();
    await A.page.locator('[data-toegangscode][data-status="ingetrokken"]').first().waitFor({ timeout: 10000 }).catch(() => undefined);
    const r1d = rijVan(A.page, 'Для сусідки');
    check('відкликано: стан «Відкликано» + причина', await r1d.getAttribute('data-status') === 'ingetrokken' && /Сусідка вже повернула ключі/.test(await r1d.innerText()));
    const s3 = await post(G3.page, '/api/gast/sessie'), s4 = await post(G4.page, '/api/gast/bekijk', { scope: 'profiel.lezen' });
    await kijkNu(G3.page);
    check('після відкликання гості K1 втрачають доступ одразу (сесія 401, перегляд 401, у вікні «Гостьову сесію завершено»)', s3.status === 401 && s4.status === 401 && await weg(G3.page), `${s3.status} ${s4.status}`);
    await r1d.scrollIntoViewIfNeeded();
    await verberg(A.page);
    await A.page.screenshot({ path: `${UIT}/gastcodes-04-eigenaar-statussen.png`, fullPage: false });

    // ================================================================ 5. закінчення строку
    const G6 = await gastContext();
    const in6 = await inwisselen(G6.page, String(K3.data.code));
    await pool.query("update app.toegangscodes set verloopt_op = now() - interval '1 second' where id = $1", [k3Id]);
    const s6 = await post(G6.page, '/api/gast/sessie');
    await kijkNu(G6.page);
    check('строк минув (SQL-зсув): гість K3 одразу поза (401, «Гостьову сесію завершено»)', in6 && s6.status === 401 && await weg(G6.page), `${in6} ${s6.status}`);
    await open(A.page);
    const r3b = rijVan(A.page, 'Для родича');
    check('власник: K3 «Закінчився», без кнопок дій', await r3b.getAttribute('data-status') === 'verlopen' && /Закінчився/.test(await r3b.innerText()) && await r3b.getByRole('button', { name: 'Відкликати' }).count() === 0);

    // ================================================================ 6. схвалений не-власник сайту
    const N = await sessie(subN, ander);
    volg(N.page, fouten, [/^404 .*\/api\/owner\/access\/toegangscodes\/intrekken$/], 'N:'); luisterSterk(N.page); // 404: навмисна спроба відкликати чужий код
    const nId = await uidVan(ander);
    const naamN = () => pool.query("update app.records set data = data || $2::jsonb where tbl='users' and id=$1", [nId, JSON.stringify({ status: 'approved', name: 'Сусід Проба' })]);
    await naamN();
    await pool.query('UPDATE app.feature_flags SET aan = true, standaard = false, percentage = 0, gebruikers = $2 WHERE sleutel = $1', [VLAG, [oId]]); // «Тільки я»
    await open(N.page);
    const nb = N.page.locator('[data-toegangscodes-niet-beschikbaar]');
    const nbt = await nb.innerText().catch(() => '');
    const nMaak = await eigen(N, '/api/owner/access/toegangscodes/maken', { naam: 'Спроба', scopes: ['profiel.lezen'], verloop: { soort: 'preset', preset: '1d' } });
    const nLijst = await eigen(N, '/api/owner/access/toegangscodes/lijst');
    check('не-власник без прапорця: чесне пояснення («вмикає власник сайту») і перехід до «Доступу до простору»; без форми створення', await nb.count() === 1 && /вмикає власник сайту/.test(nbt) && await nb.locator('[data-naar-delen]').count() === 1
      && await tc(N.page).getByRole('button', { name: 'Створити код доступу' }).count() === 0, nbt.slice(0, 300));
    check('не-власник без прапорця: сервер — перелік «недоступно» (GASTCODES_ALLEEN_EIGENAAR, без даних), створення → 403 OWNER_REQUIRED', nLijst.data.beschikbaar === false && nLijst.data.reden === 'GASTCODES_ALLEEN_EIGENAAR' && !('codes' in nLijst.data) && nMaak.status === 403 && nMaak.data.error === 'OWNER_REQUIRED', `${nMaak.status} ${JSON.stringify(nLijst.data)}`);
    const marge = await nb.locator('.access-plane-hint-line').first().evaluate((e) => [parseFloat(getComputedStyle(e).paddingLeft), parseFloat(getComputedStyle(e).paddingTop)]);
    check('вигляд: пояснення в коробці має внутрішній відступ (текст не впритул до рамки)', marge[0] >= 10 && marge[1] >= 8, JSON.stringify(marge));
    await nb.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await verberg(N.page);
    await N.page.screenshot({ path: `${UIT}/gastcodes-05-niet-eigenaar-zonder-vlag.png` });
    // Передумова власника сайту: прапорець gastcodes-iedereen для цієї людини («Вибрані»).
    await pool.query('UPDATE app.feature_flags SET gebruikers = $2 WHERE sleutel = $1', [VLAG, [oId, nId]]);
    await sys.query("insert into app.agents (user_id, name, platform, token_hash) values ($1, 'Ноутбук сусіда', 'linux', $2)", [nId, randomBytes(32).toString('hex')]);
    await open(N.page);
    check('не-власник з прапорцем: блок створення доступний', await tc(N.page).getByRole('button', { name: 'Створити код доступу' }).count() === 1);
    check('не-власник: passkey додано', await passkeyToevoegen(N.page) === 1);
    await naamN(); // повторний вхід через Google (для passkey) оновлює ім’я з Google — ставимо пробне ім’я знову
    await tc(N.page).scrollIntoViewIfNeeded();
    const KN = await maakCode(N.page, { naam: 'Від сусіда', modus: 'alle', verloop: '1 година', max: '3' });
    check('не-власник з прапорцем: код створено після посиленого підтвердження', /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(KN.code) && KN.venster === 'passkey', KN.venster);
    await KN.getoond.getByRole('button', { name: 'Готово' }).click();
    const nCodes = (await eigen(N, '/api/owner/access/toegangscodes/lijst')).data.codes as Array<{ id: string; naam: string }>;
    check('не-власник бачить лише свої коди (без кодів власника сайту)', nCodes.length === 1 && nCodes[0].naam === 'Від сусіда', JSON.stringify(nCodes.map((c) => c.naam)));
    const vreemd = await eigen(N, '/api/owner/access/toegangscodes/intrekken', { id: k2Id, reden: 'Спроба відкликати чужий код' });
    check('не-власник не може відкликати код власника сайту (404)', vreemd.status === 404, `${vreemd.status} ${JSON.stringify(vreemd.data)}`);
    const G7 = await gastContext();
    const in7 = await inwisselen(G7.page, KN.code);
    const p7 = await post(G7.page, '/api/gast/bekijk', { scope: 'profiel.lezen' });
    const a7 = await post(G7.page, '/api/gast/bekijk', { scope: 'apparaten.lezen' });
    await G7.page.locator('[data-gast-tab="apparaten.lezen"]').click();
    await G7.page.locator('[data-gast-inhoud="apparaten.lezen"]').getByText('Ноутбук сусіда').waitFor({ timeout: 10000 }).catch(() => undefined);
    const g7t = await G7.page.locator('body').innerText();
    const namen = ((a7.data.data?.apparaten || []) as Array<{ naam: string }>).map((x) => x.naam);
    check('гість за кодом не-власника бачить ЛИШЕ його дані (ім’я «Сусід Проба», «Ноутбук сусіда»), а не власника сайту', in7 && p7.data.data?.naam === 'Сусід Проба' && JSON.stringify(namen) === '["Ноутбук сусіда"]'
      && /Ноутбук сусіда/.test(g7t) && !/Сервер власника/.test(g7t) && !g7t.includes(eigenaar) && !g7t.includes(ander), `${in7} ${JSON.stringify(p7.data).slice(0, 120)} ${JSON.stringify(namen)}`);
    await verberg(G7.page);
    await G7.page.screenshot({ path: `${UIT}/gastcodes-06-gast-van-niet-eigenaar.png` });
    // Прапорець вимкнено → код не-власника гасне одразу.
    await pool.query('UPDATE app.feature_flags SET gebruikers = $2 WHERE sleutel = $1', [VLAG, [oId]]);
    const p7b = await post(G7.page, '/api/gast/bekijk', { scope: 'profiel.lezen' });
    check('прапорець знову вимкнено: гість не-власника більше нічого не бачить (401)', p7b.status === 401, String(p7b.status));

    check('без помилок консолі й HTTP (власник, не-власник)', fouten.length === 0, fouten.slice(0, 8).join(' | '));
    check('без помилок консолі й HTTP (гості)', gastFouten.length === 0, gastFouten.slice(0, 8).join(' | '));
  } catch (e) {
    check('неочікувана помилка', false, String((e as Error)?.stack || e).slice(0, 1500));
  } finally {
    await browser.close().catch(() => undefined);
    if (vlagVooraf) await pool.query('UPDATE app.feature_flags SET aan=$2, standaard=$3, percentage=$4, gebruikers=$5 WHERE sleutel=$1', [VLAG, vlagVooraf.aan, vlagVooraf.standaard, vlagVooraf.percentage, vlagVooraf.gebruikers]).catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [[eigenaar, ander]]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) {
      await sys.query('delete from app.agents where user_id = any($1)', [ids]).catch(() => undefined);
      for (const t of ['toegangscodes', 'passkeys', 'passkey_uitdagingen', 'toegang_gebruik', 'toegang_notities', 'toegang_wijzigingen']) await sys.query(`delete from app.${t} where user_id = any($1)`, [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    }
    await pool.query("delete from app.login_lockouts where subject like 'gast-inwisselen:%'").catch(() => undefined);
    await stop();
  }
  return einde();
}
