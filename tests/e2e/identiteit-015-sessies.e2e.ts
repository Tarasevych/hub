// IDENTITEIT-015 (приймання групи «sessies»): справжній Chromium, одна вигадана власниця сайту й кілька її «пристроїв» — окремі
// браузерні контексти зі своїм User-Agent, IP (cf-connecting-ip через локальний тунель) і регіоном. Кожен пристрій входить сам:
// сторінка входу → «Увійти через Google» (підроблений Google відповідає на тій самій адресі) → назад на сайт. Ніяких cookie з тесту.
//  A. Перший вхід із нового пристрою (прапорці meldingen-v2 і meldingen-uitleg-v3 увімкнено в ТЕСТОВІЙ базі лише для цієї особи —
//     передумова власника): сповіщення «Новий вхід на новому пристрої» і запис у журналі безпеки; повторний вхід із того самого
//     пристрою — без сповіщення.
//  B. «Зберегти обліковий запис» увімкнено: що лишається після виходу (cookie, localStorage, картка на екрані входу) і що вхід знову
//     потребує Google.
//  C. Два пристрої: «Оновити» показує обидва; «Завершити всі інші» з першого — другий втрачає вхід, перший працює; завершення
//     окремого пристрою; без свіжого підтвердження сервер відмовляє «Вийти всюди»; «Вийти всюди» — обидва без входу.
//  D. «Зберегти обліковий запис» вимкнено й знову ввімкнено («діятиме з наступного входу»).
//  E. Вибір «Вимкнено» (діалог) → вхід із нового пристрою без сповіщення, але з записом у журналі; відомі пристрої, «Це був я»,
//     «Забути пристрій», знову «Завжди» → забутий пристрій знову дає сповіщення.
//  F. Гостьові входи: перелік, права (лише дозволений розділ, лише читання), завершення однієї сесії, закінчення строку (SQL-зсув),
//     інший обліковий запис бачить пояснення.
// Знімки 015-sessies-*.png (380×800 і 1280), знеособлені. Лише вигадані дані (@example.test); назовні не йде нічого.
// Acceptatie van «sessies»: onthouden, twee apparaten, alle andere / overal uitloggen, nieuw apparaat (Altijd/Uit), gastsessies.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { codeMaken } from '../../backend/toegangscodes';
import { startE2eServer, chromeArgs } from './server';
import { ID, api, horizontaal, openBlok, persoon, sluit, verberg, volgFouten, type Persoon } from './hulp/sessie-015';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const VERWACHT = [/\/api\/owner\/agents\/activity$/, /mail\.tarasevych\.com\/api\/owner\/mail\/(bootstrap|accounts\/list)$/];
// Давня вада поза кроком (записана у відомості, account.видалення.1.pidtverdyty): вкладка без входу далі опитує ці маршрути → 401/403.
const DAVNE_ZONDER_SESSIE = [/id\.tarasevych\.com\/api\/owner\/(tech\/status|menu\/tellers|meldingen\/(status|gelezen))$/, /id\.tarasevych\.com\/api\/flags$/, /id\.tarasevych\.com\/api\/ofrep\/v1\/evaluate\/flags\//];
// Пристрій, чий вхід завершили з іншого пристрою: перший запит після цього — 401 (так і має бути), далі сторінка входу.
const NA_INTREKKING = [/id\.tarasevych\.com\/api\/owner\/[a-z/-]+$/];
// Давня вада поза кроком (записана у відомості, sharing.чинні.1.vyity-samomu): сповіщення v2 у hub шлють чужий service → 401.
const DAVNE_HUB = [/hub\.tarasevych\.com\/api\/owner\/meldingen\/(status|gelezen|regels)$/];
const GAST_VERWACHT = [/\/api\/gast\//, /\/api\/owner\//, /\/api\/flags$/, /\/api\/ofrep\//];
const VLAGGEN = ['meldingen-v2', 'meldingen-uitleg-v3'];
const UA = {
  ff: 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
};
const ONTHOUD = 'tsv-aanmelden-onthouden-v1';
const ONTHOUDEN_SOORT = ['remembered', 'grant'];
const NIEUW_TITEL = 'Новий вхід на новому пристрої%';

type Toestel = { naam: string; ctx: BrowserContext; page: Page; google: number; verzoeken: number[]; wie?: Persoon; landing?: string };

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-015 sessies');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaarEmail = `e2e-i15s-eig-${T}@example.test`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaarEmail, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser: Browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const davne: string[] = [];
  const emails: string[] = [];
  const contexten: BrowserContext[] = [];
  const toestellen: Toestel[] = [];
  const perMinuut = (t: Toestel) => t.verzoeken.filter((x) => Date.now() - x < 60_000).length;
  const piek = (t: Toestel) => { let best = 0; for (let i = 0, j = 0; j < t.verzoeken.length; j++) { while (t.verzoeken[j] - t.verzoeken[i] > 60_000) i++; best = Math.max(best, j - i + 1); } return best; };
  /** Людина між справами робить паузу; тест — лише коли цей пристрій за останню хвилину вже зробив понад 350 запитів API. */
  const rust = async (t?: Toestel) => { for (const x of t ? [t] : toestellen) while (perMinuut(x) > 350) await new Promise((r) => setTimeout(r, 2000)); };
  let vlagVoor: Array<{ sleutel: string; aan: boolean; gebruikers: string[] }> = [];
  let oId = '';
  const foto = async (page: Page, naam: string) => { await verberg(page); await page.screenshot({ path: `${UIT}/015-sessies-${naam}.png`, fullPage: false }); };
  const idVanEmail = async (email: string) => String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id || '');
  const goedkeuren = async (p: Persoon, naam: string) => { const id = await idVanEmail(p.email); await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', name: naam })]); return id; };
  const tekstOp = async (page: Page, re: RegExp, ms = 8000) => page.getByText(re).first().waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
  const nieuwMeldingen = async () => Number((await pool.query("select count(*)::int n from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'title' like $2", [oId, NIEUW_TITEL])).rows[0]?.n || 0);
  const meldingenTitel = async (re: string) => Number((await pool.query("select count(*)::int n from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'title' ~ $2", [oId, re])).rows[0]?.n || 0);
  const auditNieuw = async (melding: string) => Number((await pool.query("select count(*)::int n from app.audit where owner_id=$1 and action='owner.apparaat.nieuw' and details->>'melding'=$2", [oId, melding])).rows[0]?.n || 0);
  const auditTel = async (action: string) => Number((await pool.query('select count(*)::int n from app.audit where owner_id=$1 and action=$2', [oId, action])).rows[0]?.n || 0);
  const bekendeRijen = async () => (await pool.query('select id, apparaat, bevestigd_op from app.bekende_apparaten where user_id=$1 order by eerst_gezien', [oId])).rows as Array<{ id: string; apparaat: string; bevestigd_op: Date | null }>;
  const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // ---------------------------------------------------------------- пристрої (окремі браузери) і справжній вхід через сторінку входу
  let O: Persoon;
  const toestel = async (naam: string, o: { ua: string; ip: string; land: string; stad: string; width: number; height: number; touch?: boolean; taal?: 'uk' | 'nl' }): Promise<Toestel> => {
    const ctx = await browser.newContext({
      userAgent: o.ua, locale: o.taal === 'nl' ? 'nl-NL' : 'uk-UA', viewport: { width: o.width, height: o.height }, hasTouch: !!o.touch, isMobile: !!o.touch && o.width < 500,
      timezoneId: 'Europe/Brussels', serviceWorkers: 'block', extraHTTPHeaders: { 'cf-connecting-ip': o.ip, 'cf-ipcountry': o.land, 'cf-ipcity': o.stad },
    });
    contexten.push(ctx);
    const t: Toestel = { naam, ctx, page: await ctx.newPage(), google: 0, verzoeken: [] };
    ctx.on('request', (q) => { if (new URL(q.url()).pathname.startsWith('/api/')) t.verzoeken.push(Date.now()); });
    toestellen.push(t);
    // Підроблений Google: відповідає на справжній адресі (accounts.google.com) кодом для цієї ж особи, з тим самим nonce.
    await ctx.route('https://accounts.google.com/**', async (route) => {
      const u = new URL(route.request().url()); t.google++;
      const wie = t.wie || O;
      const code = (G as unknown as { codeVoor: (s: string, e: string, n: string) => string }).codeVoor(wie.sub, wie.email, u.searchParams.get('nonce') || '');
      const terug = new URL(u.searchParams.get('redirect_uri') || `${ID}/`);
      terug.searchParams.set('state', u.searchParams.get('state') || ''); terug.searchParams.set('code', code);
      await route.fulfill({ status: 302, headers: { location: terug.href } });
    });
    volgFouten(t.page, fouten, [...VERWACHT, ...DAVNE_ZONDER_SESSIE, ...NA_INTREKKING, ...DAVNE_HUB]);
    t.page.on('response', (q) => { if (q.status() >= 400 && [...DAVNE_ZONDER_SESSIE, ...DAVNE_HUB].some((x) => x.test(q.url()))) davne.push(`${t.naam} ${q.status()} ${q.url().replace(/^https:\/\/([a-z]+)\.tarasevych\.com/, '$1')}`); });
    return t;
  };
  const aanmeldKnop = (p: Page) => p.locator('.mr-sign-in-main-button');
  const ingelogd = (p: Page) => p.locator('.canonical-avatar-trigger').first();
  /** Після входу сервер веде на робочий стіл hub (за задумом); людина повертається на сторінку центру облікового запису. */
  const terugNaarId = async (t: Toestel, pad = '/sessions') => {
    const p = t.page;
    await p.waitForURL((u) => u.hostname === 'hub.tarasevych.com', { timeout: 30000 }).catch(() => undefined);
    await p.waitForLoadState('networkidle').catch(() => undefined);
    t.landing = p.url();
    await wacht(800); // naAanmelding (сповіщення про новий пристрій) не блокує вхід
    if (!p.url().startsWith(`${ID}/`)) await p.goto(`${ID}${pad}?lang=uk`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => !document.querySelector('.mr-sign-in-main-button') && !!document.querySelector('.canonical-avatar-trigger, [data-sessies-overzicht], .canonical-topbar'), null, { timeout: 20000 });
  };
  /** Справжній вхід цього пристрою: сторінка входу → (прапорець «Зберегти…») → «Увійти через Google». Повертає, скільки разів відкрито Google. */
  const inloggen = async (t: Toestel, o: { onthoud?: boolean; pad?: string } = {}) => {
    const p = t.page;
    await rust(t);
    if (!(await aanmeldKnop(p).isVisible().catch(() => false))) await p.goto(`${ID}${o.pad || '/sessions'}?lang=uk`, { waitUntil: 'networkidle' });
    await aanmeldKnop(p).waitFor({ state: 'visible', timeout: 20000 });
    if (o.onthoud !== undefined) { const cb = p.locator('.mr-sign-in-remember input'); if ((await cb.isChecked()) !== o.onthoud) await cb.click(); }
    const voor = t.google;
    await aanmeldKnop(p).click();
    await terugNaarId(t, o.pad);
    return t.google - voor;
  };
  const uitloggen = async (p: Page) => {
    await ingelogd(p).click();
    const knop = p.locator('button.logout-current').first();
    await knop.waitFor({ state: 'visible', timeout: 10000 });
    await knop.click();
    await aanmeldKnop(p).waitFor({ state: 'visible', timeout: 20000 });
    await p.waitForLoadState('networkidle').catch(() => undefined);
  };
  const sessiesOpen = async (p: Page) => {
    await rust(toestellen.find((t) => t.page === p));
    if (!/\/sessions/.test(p.url()) || await aanmeldKnop(p).isVisible().catch(() => false)) await p.goto(`${ID}/sessions?lang=uk`, { waitUntil: 'networkidle' });
    const ov = await openBlok(p, '[data-sessies-overzicht]');
    await p.locator('[data-sessie-apparaat]').first().waitFor({ state: 'attached', timeout: 20000 }).catch(() => undefined);
    await p.waitForTimeout(400);
    return ov;
  };
  const vernieuwen = async (p: Page) => {
    await rust(toestellen.find((t) => t.page === p));
    const knop = p.locator('.security-session-summary button').first();
    const antw = p.waitForResponse((r) => r.url().endsWith('/api/owner/identity/security/overview'), { timeout: 15000 }).catch(() => null);
    await knop.click();
    await antw; await p.waitForTimeout(500);
  };
  /** Що сервер каже про цей браузер (bootstrap через сторінку, cookie браузера). */
  let laatsteStand = '';
  const stand = async (p: Page) => { const r = await api(p, '/api/owner/session/bootstrap'); const d = r.data as { user?: { id?: string } | null; state?: string; error?: string }; laatsteStand = `${r.status} ${JSON.stringify(d).slice(0, 160)}`; return d?.user ? 'signed_in' : String(d?.state || d?.error || 'onbekend'); };
  const overzicht = async (p: Page) => ({ sessions: (await api(p, '/api/owner/identity/security/overview')).data?.items }) as { sessions?: Array<{ kind: string; current?: boolean; id: string; deviceLabel?: string; ip?: string }> };
  const kaartTekst = async (p: Page) => (await p.locator('[data-sessie-apparaat] .sessie-kop').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
  const cookies = async (t: Toestel) => (await t.ctx.cookies(`${ID}/`)).map((c) => ({ naam: c.name, blijvend: c.expires > Date.now() / 1000 + 86400 }));
  const ls = (p: Page) => p.evaluate((k) => localStorage.getItem(k), ONTHOUD);

  try {
    // ================================================================ підготовка: власниця, прапорці в тестовій базі, друга особа
    O = await persoon(G as never, 'i15s-eig', T); emails.push(O.email);
    oId = await goedkeuren(O, 'Власниця Проба');
    const N = await persoon(G as never, 'i15s-lid', T); emails.push(N.email);
    const nId = await goedkeuren(N, 'Учасниця Проба');
    // Передумова власника (у відомості): «Новий центр сповіщень» і «Зрозумілі сповіщення…» — увімкнено лише для цієї особи.
    vlagVoor = (await pool.query('select sleutel, aan, gebruikers from app.feature_flags where sleutel = any($1)', [VLAGGEN])).rows;
    for (const s of VLAGGEN) if (!vlagVoor.some((v) => v.sleutel === s)) await pool.query("insert into app.feature_flags (sleutel, omschrijving, aan) values ($1, 'e2e', false) on conflict do nothing", [s]);
    await pool.query('update app.feature_flags set aan = true, gebruikers = array_append(array_remove(gebruikers, $1), $1) where sleutel = any($2)', [oId, VLAGGEN]);
    const basis = await bekendeRijen();
    check('підготовка: власниця й друга особа схвалені; прапорці увімкнено для власниці; перший (технічний) вхід — тиха база відомих пристроїв', !!oId && !!nId && basis.length === 1 && (await nieuwMeldingen()) === 0, `${basis.length}`);

    // ================================================================ A. новий пристрій (вибір «Завжди», типово)
    const D1 = await toestel('pc', { ua: UA.win, ip: '198.51.100.10', land: 'NL', stad: 'Utrecht', width: 1280, height: 860 });
    {
      const m0 = await nieuwMeldingen(), a0 = await auditNieuw('gemeld');
      const g = await inloggen(D1);
      const st = await stand(D1.page);
      check('A: перший вхід із комп\'ютера (Windows) — через сторінку входу й Google; після входу — робочий стіл hub (за задумом), звідти назад у «Сесії»', g === 1 && st === 'signed_in' && /^https:\/\/hub\.tarasevych\.com\//.test(String(D1.landing)), `google ${g} ${D1.landing} ${st === 'signed_in' ? '' : laatsteStand}`);
      check('A: новий пристрій → сповіщення «Новий вхід на новому пристрої» і запис у журналі безпеки (melding=gemeld)', (await nieuwMeldingen()) === m0 + 1 && (await auditNieuw('gemeld')) === a0 + 1, `${await nieuwMeldingen()} ${await auditNieuw('gemeld')}`);
      const tekst = String((await pool.query("select data->>'message' m from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'title' like $2 order by seq desc limit 1", [oId, NIEUW_TITEL])).rows[0]?.m || '');
      check('A: у сповіщенні — пристрій, регіон за IP, час (Брюссель) і спосіб входу; без IP-адреси', /Windows/.test(tekst) && /Utrecht/.test(tekst) && /Брюссель/.test(tekst) && /спосіб: Google/.test(tekst) && !tekst.includes('198.51.100.10'), tekst.slice(0, 240));
      // людина бачить його в дзвіночку
      await D1.page.locator('[data-qa-id="canonical-notification-bell"]').first().click();
      const paneel = D1.page.locator('[data-qa-id="canonical-notification-panel"]');
      await paneel.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
      check('A: у центрі сповіщень (дзвіночок) видно «Новий вхід на новому пристрої»', await tekstOp(D1.page, /Новий вхід на новому пристрої/, 10000));
      await foto(D1.page, 'nieuw-apparaat-melding-computer');
      await D1.page.keyboard.press('Escape').catch(() => undefined);
    }

    // ================================================================ B. «Зберегти обліковий запис» увімкнено: що лишається після виходу
    {
      const p = D1.page;
      await sessiesOpen(p);
      const schakel = p.locator('[data-sessies-onthoud-schakel] input[role="switch"]');
      const ov = await overzicht(p);
      check('B: перемикач «Зберегти цей акаунт…» увімкнено; у переліку входів є «Запам’ятований браузер» цього пристрою', await schakel.isChecked() && !!ov.sessions?.some((s) => ONTHOUDEN_SOORT.includes(s.kind) && s.current), JSON.stringify(ov.sessions?.map((s) => [s.kind, s.current])));
      const c1 = await cookies(D1);
      check('B: після входу браузер має cookie сеансу, «запам’ятованого браузера» (на 30+ днів) і власну позначку пристрою',
        c1.some((c) => c.naam.startsWith('__Secure-tsv_ecosystem_')) && c1.some((c) => c.naam.startsWith('tsv_ot_grant_') && c.blijvend) && c1.some((c) => c.naam === '__Secure-tsv_apparaat' && c.blijvend), JSON.stringify(c1.map((c) => c.naam.replace(/_[0-9a-zA-Z-]{8,}$/, '_…'))));
      await foto(p, 'onthouden-aan-computer');
      const m0 = await nieuwMeldingen();
      await uitloggen(p);
      const c2 = await cookies(D1);
      check('B: після «Вийти» cookie сеансу немає; cookie «запам’ятованого браузера» і позначка пристрою лишилися; localStorage «tsv-aanmelden-onthouden-v1» ≠ 0',
        !c2.some((c) => c.naam.startsWith('__Secure-tsv_ecosystem_')) && c2.some((c) => c.naam.startsWith('tsv_ot_grant_')) && c2.some((c) => c.naam === '__Secure-tsv_apparaat') && (await ls(p)) !== '0', `${JSON.stringify(c2.map((c) => c.naam.slice(0, 22)))} ls=${await ls(p)}`);
      check('B: сервер: цей браузер без входу', (await stand(p)) === 'signed_out');
      const kaart = p.locator('.mr-sign-in-account').first();
      await kaart.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
      const kaartT = await kaart.innerText().catch(() => '');
      check('B: на екрані входу — збережений обліковий запис («Підтвердити через Google · збережений на пристрої»), прапорець «Зберегти…» увімкнено',
        kaartT.includes(O.email) && /Підтвердити через Google/.test(kaartT) && await p.locator('.mr-sign-in-remember input').isChecked(), kaartT.replace(/\s+/g, ' '));
      await foto(p, 'onthouden-aan-na-uitloggen-computer');
      await p.setViewportSize({ width: 380, height: 800 });
      check('B: телефонна ширина 380 — екран входу без горизонтальної прокрутки', (await horizontaal(p)) <= 0);
      await foto(p, 'onthouden-aan-na-uitloggen-telefoon');
      await p.setViewportSize({ width: 1280, height: 860 });
      // знову увійти: натискання на збережений запис усе одно веде через Google (підтвердження особи)
      const voor = D1.google;
      await kaart.click();
      await terugNaarId(D1);
      check('B: вхід зі збереженого запису після виходу знову потребує Google (підтвердження особи), потім — у обліковому записі', D1.google === voor + 1 && (await stand(p)) === 'signed_in', `google ${D1.google - voor}`);
      check('A: повторний вхід із того самого пристрою — без нового сповіщення', (await nieuwMeldingen()) === m0);
    }

    // ================================================================ C. два пристрої
    const D2 = await toestel('iphone', { ua: UA.ios, ip: '203.0.113.20', land: 'BE', stad: 'Gent', width: 380, height: 800, touch: true });
    {
      const m0 = await nieuwMeldingen();
      await inloggen(D2, { onthoud: false });
      check('C: телефон (iPhone, інший IP) увійшов окремо; це новий пристрій — ще одне сповіщення', (await stand(D2.page)) === 'signed_in' && (await nieuwMeldingen()) === m0 + 1);
      const p = D1.page;
      await sessiesOpen(p);
      const voor = (await kaartTekst(p)).join(' ‖ ');
      await vernieuwen(p);
      const na = await kaartTekst(p);
      const ov = await overzicht(p);
      check('C: «Оновити» на комп\'ютері показує обидва пристрої (Windows · Utrecht і iOS · Gent), поточний — «Цей пристрій»',
        na.some((k) => /Цей пристрій/.test(k) && /Windows/.test(k)) && na.some((k) => /iOS/.test(k)) && (ov.sessions || []).filter((s) => !ONTHOUDEN_SOORT.includes(s.kind)).length >= 2, `${voor} → ${na.join(' ‖ ')}`);
      await foto(p, 'twee-apparaten-computer');
      await sessiesOpen(D2.page);
      const naTel = await kaartTekst(D2.page);
      check('C: телефон бачить той самий перелік, «Цей пристрій» — iOS; без горизонтальної прокрутки', naTel.some((k) => /Цей пристрій/.test(k) && /iOS/.test(k)) && (await horizontaal(D2.page)) <= 0, naTel.join(' ‖ '));
      const tel = D2.page.locator('[data-sessie-apparaat]').first();
      await tel.locator('.sessie-kop').scrollIntoViewIfNeeded();
      check('C: телефон 380 — позначка «Цей пристрій» видима на картці поточного пристрою (раніше на телефоні її ховали)', await tel.locator('.sessie-huidig-mobiel').isVisible() && !(await tel.locator('.sessie-kop > .security-current-badge').isVisible()));
      await foto(D2.page, 'twee-apparaten-telefoon');

      // «Завершити всі інші» з комп'ютера
      const ov1 = p.locator('[data-sessies-overzicht]');
      await ov1.locator('[data-sessies-alle-andere]').click();
      const bev = ov1.locator('[data-bevestig="alle-andere"]');
      await bev.waitFor({ state: 'visible', timeout: 5000 });
      check('C: «Завершити всі інші» спершу питає й пояснює, що цей вхід залишиться', /Цей вхід залишиться/.test(await bev.innerText()));
      await foto(p, 'alle-andere-bevestigen-computer');
      await bev.getByRole('button', { name: 'Так, завершити' }).click();
      await ov1.locator('.sessies-melding').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      const melding = await ov1.locator('.sessies-melding').innerText().catch(() => '');
      check('C: підсумок із кількістю завершених входів і «Цей вхід залишився»', /Завершено інших входів: [1-9]/.test(melding) && /Цей вхід залишився/.test(melding), melding);
      await p.waitForTimeout(800);
      await foto(p, 'alle-andere-klaar-computer');
      await D2.page.reload({ waitUntil: 'networkidle' });
      const d2Uit = await aanmeldKnop(D2.page).waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
      check('C: телефон після оновлення сторінки — екран входу; сервер: без входу', d2Uit && (await stand(D2.page)) === 'signed_out');
      await foto(D2.page, 'na-alle-andere-telefoon');
      await p.reload({ waitUntil: 'networkidle' });
      await sessiesOpen(p);
      const kaarten1 = await kaartTekst(p);
      check('C: комп\'ютер працює далі (сторінка «Сесії» після оновлення, сервер: у вході); телефона в переліку немає',
        (await stand(p)) === 'signed_in' && !(await aanmeldKnop(p).isVisible()) && !kaarten1.some((k) => /iOS/.test(k)), kaarten1.join(' ‖ '));

      // знову увійти на телефоні; завершити саме цей пристрій з комп'ютера
      const m1 = await nieuwMeldingen();
      await inloggen(D2, { onthoud: false });
      check('C: повторний вхід на телефоні (той самий пристрій) — без сповіщення', (await stand(D2.page)) === 'signed_in' && (await nieuwMeldingen()) === m1);
      await vernieuwen(p);
      const iphone = p.locator('[data-sessie-apparaat]').filter({ hasText: 'iOS' }).first();
      await iphone.locator('.sessie-kop').click();
      await iphone.locator('[data-sessie-alle-op-apparaat]').click();
      await iphone.getByRole('button', { name: 'Так, завершити' }).click();
      await p.waitForFunction(() => ![...document.querySelectorAll('[data-sessie-apparaat]')].some((k) => /iOS/.test(k.textContent || '')), null, { timeout: 15000 }).catch(() => undefined);
      check('C: «Завершити всі сесії на цьому пристрої» для телефона — картка зникла, комп\'ютер у вході', (await p.locator('[data-sessie-apparaat]').filter({ hasText: 'iOS' }).count()) === 0 && (await stand(p)) === 'signed_in');
      check('C: телефон після цього без входу (сервер)', (await stand(D2.page)) === 'signed_out');

      // без свіжого підтвердження особи сервер «Вийти всюди» не виконує
      await inloggen(D2, { onthoud: false });
      const oud = G.browser();
      await oud.aanmelden(O.sub, O.email, { service: 'identity', intent: 'login', authTime: Math.floor(Date.now() / 1000) - 3600, ip: '192.0.2.50', ua: UA.ff });
      const weiger = await oud.verzoek('id.tarasevych.com', '/api/owner/identity/security/revoke-all', oud.ctxBody('identity'), { ip: '192.0.2.50', ua: UA.ff });
      check('C: «Вийти всюди» з входу годину тому без підтвердження — 403 STEP_UP_REQUIRED, ніхто не втратив вхід',
        weiger.status === 403 && /STEP_UP/.test(String(weiger.data.error)) && (await stand(p)) === 'signed_in' && (await stand(D2.page)) === 'signed_in', `${weiger.status} ${weiger.data.error}`);

      // «Вийти всюди» з комп'ютера
      await sessiesOpen(p);
      await vernieuwen(p);
      await p.locator('[data-sessies-overal]').click();
      const ob = p.locator('[data-bevestig="overal"]');
      await ob.waitFor({ state: 'visible', timeout: 5000 });
      check('C: «Вийти всюди» спершу питає (кількість входів і технічних профілів)', /Завершити всі входи \(\d+\)/.test(await ob.innerText()), await ob.innerText());
      await foto(p, 'overal-bevestigen-computer');
      await ob.getByRole('button', { name: 'Так, вийти всюди' }).click();
      const d1Uit = await aanmeldKnop(p).waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
      check('C: після «Вийти всюди» комп\'ютер — екран входу, сервер: без входу', d1Uit && (await stand(p)) === 'signed_out');
      await foto(p, 'overal-klaar-computer');
      await D2.page.reload({ waitUntil: 'networkidle' });
      const d2Uit2 = await aanmeldKnop(D2.page).waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
      check('C: телефон після оновлення теж без входу; технічний вхід годину тому — теж завершено', d2Uit2 && (await stand(D2.page)) === 'signed_out' && (await oud.verzoek('id.tarasevych.com', '/api/owner/session/bootstrap', oud.ctxBody('identity'))).data.state === 'signed_out');
      await foto(D2.page, 'na-overal-telefoon');
    }

    // ================================================================ D. «Зберегти обліковий запис» вимкнено й знову ввімкнено
    {
      const p = D1.page;
      await inloggen(D1, { onthoud: true });
      await sessiesOpen(p);
      const schakel = p.locator('[data-sessies-onthoud-schakel] input[role="switch"]');
      check('D: після входу зі «Зберегти…» перемикач увімкнено', await schakel.isChecked() && !!(await overzicht(p)).sessions?.some((s) => ONTHOUDEN_SOORT.includes(s.kind) && s.current));
      await p.locator('[data-sessies-onthoud-schakel]').click();
      const ov = p.locator('[data-sessies-overzicht]');
      check('D: вимкнення → «Цей браузер забуто: наступного разу потрібно буде увійти знову»', await tekstOp(p, /Цей браузер забуто/, 10000));
      await p.waitForTimeout(800);
      check('D: сервер забув цей браузер (у переліку немає поточного «Запам’ятованого браузера»), localStorage = 0',
        !(await overzicht(p)).sessions?.some((s) => ONTHOUDEN_SOORT.includes(s.kind) && s.current) && (await ls(p)) === '0');
      await ov.locator('.sessies-onthouden').scrollIntoViewIfNeeded();
      await foto(p, 'onthouden-uit-computer');
      await p.reload({ waitUntil: 'networkidle' });
      await sessiesOpen(p);
      check('D: після перезавантаження перемикач лишається вимкненим', !(await schakel.isChecked()));
      await uitloggen(p);
      const kaarten = await p.locator('.mr-sign-in-account').count();
      const grants = (await pool.query("select id, data->>'revokedAt' r, data->>'hintOnlyAt' h, data->>'menuHiddenAt' m from app.records where tbl='owner_browser_grants_v1' and data->>'userId'=$1", [oId])).rows;
      if (kaarten) console.log('[e2e] D: картка після вимкнення (діагностика):', (await p.locator('.mr-sign-in-account').first().innerText()).replace(/\s+/g, ' '), JSON.stringify(grants), JSON.stringify((await D1.ctx.cookies(`${ID}/`)).map((x) => x.name).filter((x) => x.startsWith('tsv_ot_grant_'))));
      check('D: після виходу на екрані входу немає збереженого запису, прапорець «Зберегти…» вимкнено, localStorage = 0',
        kaarten === 0 && !(await p.locator('.mr-sign-in-remember input').isChecked()) && (await ls(p)) === '0', `${kaarten}`);
      const c = await cookies(D1);
      check('D: сервер: без входу; cookie сеансу немає (позначка пристрою лишається — вона не дає входу)', (await stand(p)) === 'signed_out' && !c.some((x) => x.naam.startsWith('__Secure-tsv_ecosystem_')) && c.some((x) => x.naam === '__Secure-tsv_apparaat'));
      await foto(p, 'onthouden-uit-na-uitloggen-computer');
      // знову ввімкнути посеред входу без запам'ятовування
      const g = await inloggen(D1);
      await sessiesOpen(p);
      check('D: новий вхід — знову через Google; перемикач вимкнено (вхід без запам’ятовування)', g === 1 && !(await schakel.isChecked()));
      await p.locator('[data-sessies-onthoud-schakel]').click();
      const noot = p.locator('[data-sessies-onthoud-volgende]');
      check('D: увімкнення посеред такого входу — чесно «Діятиме з наступного входу», сервер грант не видав',
        await noot.isVisible().catch(() => false) && await schakel.isChecked() && (await ls(p)) === 'volgende' && !(await overzicht(p)).sessions?.some((s) => ONTHOUDEN_SOORT.includes(s.kind) && s.current));
      await foto(p, 'onthouden-volgende-computer');
      await p.reload({ waitUntil: 'networkidle' });
      await sessiesOpen(p);
      check('D: після перезавантаження вибір не скинуто (увімкнено, пояснення видно)', await schakel.isChecked() && await noot.isVisible().catch(() => false));
      await uitloggen(p);
      check('D: на екрані входу прапорець «Зберегти…» уже увімкнено', await p.locator('.mr-sign-in-remember input').isChecked());
      await inloggen(D1);
      await sessiesOpen(p);
      check('D: наступний вхід запам’ятовано: перемикач увімкнено без пояснення, у переліку — поточний «Запам’ятований браузер», localStorage = 1',
        await schakel.isChecked() && !(await noot.isVisible().catch(() => false)) && !!(await overzicht(p)).sessions?.some((s) => ONTHOUDEN_SOORT.includes(s.kind) && s.current) && (await ls(p)) === '1', `ls=${await ls(p)}`);
    }

    // ================================================================ E. «Вимкнено», відомі пристрої, «Це був я», «Забути пристрій»
    {
      const p = D1.page;
      await sessiesOpen(p);
      const blok = p.locator('#sessies-nieuw-apparaat');
      await blok.scrollIntoViewIfNeeded();
      await blok.locator('[data-bekende-apparaten]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      check('E: «Попереджати про новий пристрій» — «Завжди» (типово), без примітки про прапорець (прапорець увімкнено)', await blok.locator('input[value="altijd"]').isChecked() && (await blok.locator('[data-nieuw-apparaat-voorwaarde="vlag"]').count()) === 0);
      const melding0 = await meldingenTitel('^Попередження про новий пристрій вимкнено'), aKeuze0 = await auditTel('owner.apparaat.melding');
      await blok.locator('label[data-keuze="uit"]').click();
      const dlg = p.locator('[data-bevestig="nieuw-apparaat-uit"], [role="dialog"]').filter({ hasText: 'Вимкнути попередження' }).first();
      await dlg.waitFor({ state: 'visible', timeout: 5000 });
      const dlgT = await dlg.innerText();
      check('E: «Вимкнено» спершу відкриває діалог із наслідками (журнал безпеки лишається, прийде сповіщення)', /журналі безпеки/.test(dlgT) && /сповіщення безпеки/.test(dlgT), dlgT.slice(0, 300));
      await foto(p, 'nieuw-apparaat-uit-dialoog-computer');
      await dlg.getByRole('button', { name: 'Скасувати' }).click();
      await p.waitForTimeout(300);
      check('E: «Скасувати» лишає «Завжди»', await blok.locator('input[value="altijd"]').isChecked() && (await auditTel('owner.apparaat.melding')) === aKeuze0);
      await blok.locator('label[data-keuze="uit"]').click();
      await dlg.waitFor({ state: 'visible', timeout: 5000 });
      await dlg.getByRole('button', { name: 'Так, вимкнути' }).click();
      await p.waitForTimeout(1000);
      await blok.locator('[data-nieuw-apparaat-voorwaarde="uit"]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      const keuzeDb = String((await pool.query("select data->>'nieuwApparaatMelding' k from app.records where tbl='users' and id=$1", [oId])).rows[0]?.k || '');
      check('E: після підтвердження — «Вимкнено» з поясненням; у обліковому записі nieuwApparaatMelding=uit; аудит і сповіщення безпеки про вимкнення',
        await blok.locator('input[value="uit"]').isChecked() && keuzeDb === 'uit' && (await auditTel('owner.apparaat.melding')) === aKeuze0 + 1 && (await meldingenTitel('^Попередження про новий пристрій вимкнено')) === melding0 + 1, keuzeDb);
      await foto(p, 'nieuw-apparaat-uit-computer');

      // новий пристрій (Mac) при «Вимкнено»
      const D3 = await toestel('mac', { ua: UA.mac, ip: '192.0.2.77', land: 'DE', stad: 'Köln', width: 1280, height: 860 });
      const m0 = await nieuwMeldingen(), aUit0 = await auditNieuw('uit-door-keuze');
      await inloggen(D3);
      check('E: вхід із нового пристрою (Mac) при «Вимкнено» — без сповіщення, але з записом у журналі безпеки (melding=uit-door-keuze)',
        (await stand(D3.page)) === 'signed_in' && (await nieuwMeldingen()) === m0 && (await auditNieuw('uit-door-keuze')) === aUit0 + 1, `${await nieuwMeldingen() - m0} ${await auditNieuw('uit-door-keuze') - aUit0}`);
      await sluit(D3.ctx);

      // перелік відомих пристроїв
      await p.reload({ waitUntil: 'networkidle' });
      await sessiesOpen(p);
      await blok.scrollIntoViewIfNeeded();
      await blok.locator('[data-bekende-apparaten]').waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      const rijen = await bekendeRijen();
      const lijst = blok.locator('[data-bekend-apparaat]');
      const teksten = (await lijst.allInnerTexts()).map((x) => x.replace(/\s+/g, ' '));
      check('E: «Відомі пристрої» — усі пристрої облікового запису з бази (технічний, Windows, iPhone, Firefox/Linux годину тому, Mac), поточний позначено «Цей пристрій»',
        (await lijst.count()) === rijen.length && rijen.length === 5 && (await blok.locator('[data-dit-apparaat="1"]').count()) === 1 && /Windows/.test(await blok.locator('[data-dit-apparaat="1"]').innerText()), teksten.join(' ‖ '));
      await foto(p, 'bekende-apparaten-computer');
      // «Це був я» для Mac
      const mac = rijen.find((r) => /Mac/i.test(r.apparaat));
      const aBev0 = await auditTel('owner.apparaat.bevestigd');
      if (mac) {
        await blok.locator(`[data-apparaat-bevestigen="${mac.id}"]`).click();
        await blok.locator(`[data-bekend-apparaat="${mac.id}"] [data-bevestigd="1"]`).waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
      }
      check('E: «Це був я» для Mac — «Підтверджено вами …», у базі bevestigd_op, один запис аудиту',
        !!mac && /Підтверджено вами/.test(await blok.locator(`[data-bekend-apparaat="${mac?.id}"]`).innerText().catch(() => '')) && !!(await bekendeRijen()).find((r) => r.id === mac?.id)?.bevestigd_op && (await auditTel('owner.apparaat.bevestigd')) === aBev0 + 1);
      // «Забути пристрій» для iPhone
      const ios = rijen.find((r) => /iOS|iPhone/i.test(r.apparaat));
      const aVerg0 = await auditTel('owner.apparaat.vergeten');
      if (ios) await blok.locator(`[data-apparaat-vergeten="${ios.id}"]`).click();
      const vdlg = p.locator('[role="dialog"]').filter({ hasText: 'Забути цей пристрій?' }).first();
      await vdlg.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
      check('E: «Забути пристрій» — діалог: наступний вхід із нього знову дасть попередження; сеанси на ньому не завершуються', /знову дасть попередження/.test(await vdlg.innerText().catch(() => '')) && /не завершуються/.test(await vdlg.innerText().catch(() => '')));
      await foto(p, 'apparaat-vergeten-dialoog-computer');
      await vdlg.getByRole('button', { name: 'Так, забути' }).click().catch(() => undefined);
      await blok.locator(`[data-bekend-apparaat="${ios?.id}"]`).waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
      check('E: після підтвердження iPhone зник із переліку й з бази; запис аудиту owner.apparaat.vergeten',
        !!ios && (await blok.locator(`[data-bekend-apparaat="${ios.id}"]`).count()) === 0 && !(await bekendeRijen()).some((r) => r.id === ios.id) && (await auditTel('owner.apparaat.vergeten')) === aVerg0 + 1);
      // знову «Завжди» (без діалогу) → забутий iPhone знову дає сповіщення
      await blok.locator('label[data-keuze="altijd"]').click();
      await blok.locator('[data-nieuw-apparaat-voorwaarde="uit"]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
      check('E: «Завжди» вмикається без діалогу; у обліковому записі nieuwApparaatMelding=altijd', await blok.locator('input[value="altijd"]').isChecked() && String((await pool.query("select data->>'nieuwApparaatMelding' k from app.records where tbl='users' and id=$1", [oId])).rows[0]?.k) === 'altijd');
      const m1 = await nieuwMeldingen();
      await inloggen(D2, { onthoud: false });
      check('E: забутий iPhone при «Завжди» знову дає сповіщення «Новий вхід на новому пристрої»', (await stand(D2.page)) === 'signed_in' && (await nieuwMeldingen()) === m1 + 1);
      await sessiesOpen(D2.page);
      await openBlok(D2.page, '#sessies-nieuw-apparaat');
      check('E: телефон 380 — блок «Попереджати про новий пристрій» без горизонтальної прокрутки', (await horizontaal(D2.page)) <= 0);
      await foto(D2.page, 'bekende-apparaten-telefoon');
    }

    // ================================================================ F. гостьові входи
    {
      const p = D1.page;
      // підготовка коду — так само, як «Створити код доступу» (форму перевірено в gast-toegang.e2e.ts)
      const c = await codeMaken({ id: oId, email: O.email }, { naam: 'Для Олени', scopes: ['profiel.lezen'], verloop: { soort: 'preset', preset: '1d' } }) as { code: string; id?: string };
      const codeId = String((await pool.query('select id from app.toegangscodes where user_id=$1 and naam=$2 order by aangemaakt_op desc limit 1', [oId, 'Для Олени'])).rows[0]?.id || '');
      check('F: підготовка: код доступу «Для Олени» (лише «Профіль», 1 день)', /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/.test(String(c.code)) && !!codeId);
      const gast = async (naam: string, ip: string, ua: string, width: number) => {
        const ctx = await browser.newContext({ userAgent: ua, locale: 'uk-UA', viewport: { width, height: 800 }, timezoneId: 'Europe/Brussels', serviceWorkers: 'block', extraHTTPHeaders: { 'cf-connecting-ip': ip } });
        contexten.push(ctx);
        const page = await ctx.newPage();
        volgFouten(page, fouten, GAST_VERWACHT);
        await page.goto(`${ID}/toegang#code=${c.code}`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Увійти як гість' }).click();
        await page.locator('[data-gast-banner]').waitFor({ state: 'visible', timeout: 15000 });
        return { ctx, page, naam };
      };
      const gastPost = (page: Page, pad: string, body: unknown = {}) => page.evaluate(async ([u, b]) => { const r = await fetch(u as string, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { status: r.status, data: await r.json().catch(() => ({})) as Record<string, unknown> }; }, [pad, body] as const);
      const weg = async (page: Page) => { await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.locator('[data-gast-inwisselen] .gast-melding').waitFor({ timeout: 10000 }).catch(() => undefined); return /Гостьову сесію завершено/.test(await page.locator('[data-gast-inwisselen]').innerText().catch(() => '')); };
      const G1 = await gast('g1', '198.51.100.31', UA.ios, 380);
      const banner = await G1.page.locator('[data-gast-banner]').innerText();
      const tabs = await G1.page.locator('[data-gast-tab]').evaluateAll((els) => els.map((e) => e.getAttribute('data-gast-tab')));
      check('F: гість (телефон) — банер «Гостьовий доступ від … до …», лише перегляд, без адреси власниці; вкладка лише «Профіль»',
        /Гостьовий доступ від .+ до .+/.test(banner) && /лише перегляд/.test(banner) && !banner.includes(O.email) && JSON.stringify(tabs) === '["profiel.lezen"]', `${banner.replace(/\s+/g, ' ')} ${JSON.stringify(tabs)}`);
      await foto(G1.page, 'gast-banner-telefoon');
      const j = await gastPost(G1.page, '/api/gast/bekijk', { scope: 'journaal.lezen' });
      const a = await gastPost(G1.page, '/api/gast/bekijk', { scope: 'apparaten.lezen' });
      const own = await gastPost(G1.page, '/api/owner/identity/security/overview', { service: 'identity' });
      check('F: права гостя: журнал і пристрої (не в коді) → 403 GAST_GEEN_TOEGANG; «Сесії» власниці → 401, жодних даних',
        j.status === 403 && j.data.error === 'GAST_GEEN_TOEGANG' && a.status === 403 && (own.status === 401 || own.status === 403) && !('sessions' in own.data), `${j.status} ${a.status} ${own.status}`);
      await G1.page.reload({ waitUntil: 'networkidle' });
      check('F: гостьовий вхід лишається після перезавантаження', await G1.page.locator('[data-gast-banner]').isVisible().catch(() => false));
      const G2 = await gast('g2', '198.51.100.32', UA.win, 1280);
      // власниця: перелік гостьових входів
      await sessiesOpen(p);
      await vernieuwen(p);
      const ov = p.locator('[data-sessies-overzicht]');
      await ov.locator('[data-gast-sessie]').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      const gt = await ov.locator('[data-gast-sessies]').innerText().catch(() => '');
      check('F: «Гостьові сесії»: дві сесії «Вхід за кодом доступу «Для Олени»» з пристроєм, строком «Діє до» і хешем IP',
        (await ov.locator('[data-gast-sessie]').count()) === 2 && /Вхід за кодом доступу «Для Олени»/.test(gt) && /Діє до/.test(gt) && /IP \(хеш\)/.test(gt) && !/198\.51\.100\.3/.test(gt), gt.replace(/\s+/g, ' ').slice(0, 300));
      await ov.locator('[data-gast-sessies]').scrollIntoViewIfNeeded();
      await foto(p, 'gast-sessies-computer');
      // завершити одну гостьову сесію (Windows-гість)
      const s2 = String((await G2.ctx.cookies(`${ID}/api/gast/sessie`)).find((x) => x.name === 'tsv_gast')?.value || '').split('.')[0];
      await ov.locator(`[data-gast-sessie="${s2}"]`).getByRole('button', { name: 'Завершити гостьову сесію' }).click();
      await ov.locator(`[data-gast-sessie="${s2}"]`).waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
      check('F: «Завершити гостьову сесію» — «Гостьову сесію завершено.», у переліку лишилась одна', await tekstOp(p, /Гостьову сесію завершено\./) && (await ov.locator('[data-gast-sessie]').count()) === 1);
      check('F: гість на комп\'ютері одразу без доступу; гість на телефоні працює', await weg(G2.page) && (await gastPost(G1.page, '/api/gast/sessie')).status === 200);
      // закінчення строку (зсув у базі)
      await pool.query("update app.toegangscodes set verloopt_op = now() - interval '1 second' where id = $1", [codeId]);
      check('F: строк коду минув → гість на телефоні одразу без доступу', await weg(G1.page));
      await foto(G1.page, 'gast-verlopen-telefoon');
      await G1.page.locator('#gast-code').fill(String(c.code));
      await G1.page.getByRole('button', { name: 'Увійти як гість' }).click();
      await G1.page.locator('.gast-fout').waitFor({ timeout: 10000 }).catch(() => undefined);
      check('F: прострочений код більше не приймається («Код недійсний»)', /Код недійсний/.test(await G1.page.locator('.gast-fout').innerText().catch(() => '')));
      await vernieuwen(p);
      await p.waitForTimeout(500);
      check('F: власниця після «Оновити» — «Активних гостьових сесій немає.»', (await ov.locator('[data-gast-sessie]').count()) === 0 && /Активних гостьових сесій немає/.test(await ov.locator('[data-gast-sessies]').innerText().catch(() => '')));
      const codes = await api(p, '/api/owner/access/toegangscodes/lijst');
      const cod = ((codes.data.codes || []) as Array<{ id: string; status?: string }>).find((x) => x.id === codeId);
      check('F: у переліку кодів «Для Олени» — стан «Закінчився» (verlopen)', cod?.status === 'verlopen', JSON.stringify(cod).slice(0, 200));
      // інший обліковий запис (не власник сайту): пояснення замість порожнечі
      const NN = await toestel('lid', { ua: UA.win, ip: '198.51.100.60', land: 'NL', stad: 'Leiden', width: 380, height: 800, touch: true });
      const np = NN.page;
      NN.wie = N; // друга особа входить своїм Google (підроблений Google з її адресою)
      await inloggen(NN);
      await openBlok(np, '[data-sessies-overzicht]');
      const uit = np.locator('[data-gast-sessies-uit]');
      await uit.waitFor({ state: 'attached', timeout: 15000 }).catch(() => undefined);
      await uit.scrollIntoViewIfNeeded().catch(() => undefined);
      check('F: інший обліковий запис бачить «Гостьові сесії» з поясненням (коди вмикає власник сайту) і переходом до «Доступу до простору»',
        await uit.isVisible().catch(() => false) && /вмикає власник сайту/.test(await uit.innerText().catch(() => '')) && (await uit.locator('a[href="/sharing"]').count()) === 1 && (await np.locator('[data-gast-sessie]').count()) === 0);
      check('F: телефон 380 — «Сесії» іншого облікового запису без горизонтальної прокрутки', (await horizontaal(np)) <= 0);
      await foto(np, 'gast-uitleg-ander-account-telefoon');
    }
    check('без помилок у консолі й HTTP (окрім очікуваних відмов)', fouten.length === 0, fouten.slice(0, 8).join(' | '));
    console.log(`[e2e] пік запитів API за хвилину на пристрій: ${toestellen.map((t) => `${t.naam} ${piek(t)}`).join(', ')}`);
    if (davne.length) console.log(`[e2e] давня вада (поза кроком): ${davne.length}× 401/403 без входу: ${[...new Set(davne.map((x) => x.replace(/^\S+ /, '')))].join(', ')}`);
  } catch (e) {
    check('неочікувана помилка', false, String((e as Error)?.stack || e).slice(0, 1500));
  } finally {
    await sluit(...contexten);
    await browser.close().catch(() => undefined);
    // прапорці — як були до тесту
    for (const v of vlagVoor) await pool.query('update app.feature_flags set aan = $2, gebruikers = $3 where sleutel = $1', [v.sleutel, v.aan, v.gebruikers]).catch(() => undefined);
    if (oId) await pool.query('update app.feature_flags set gebruikers = array_remove(gebruikers, $1) where sleutel = any($2)', [oId, VLAGGEN]).catch(() => undefined);
    // Прибирання лише за ТОЧНИМИ адресами цього запуску.
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [emails]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) {
      for (const t of ['toegangscodes', 'bekende_apparaten']) await pool.query(`delete from app.${t} where user_id = any($1)`, [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    }
    await pool.query("delete from app.login_lockouts where subject like 'gast-inwisselen:%'").catch(() => undefined);
    await stop();
  }
  return einde();
}
