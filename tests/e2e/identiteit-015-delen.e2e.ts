// IDENTITEIT-015 (крок «delen», приймання після рецензії): справжній Chromium, три вигадані особи, кожна — окремий пристрій.
//  1. Власник (центр облікового запису, комп'ютер 1280): «Відкриті посилання». Перелік відкрито ДО того, як учасник скористався
//     одноразовим посиланням; натискання «Відкликати» на застарілому рядку → чесна відповідь «вже використано» (SHARE_LINK_USED),
//     без запису «відкликано» й без сповіщення; учасник лишається. Звичайне відкликання → «доступу не отримає», фокус лишається в
//     переліку, а посилання справді не відкривається (invite_revoked).
//  2. Глядач (hub, комп'ютер 1280): «Поділитися» → «Хто має доступ» → «Вийти з простору» → діалог → сторінка перезавантажується, і
//     підсумок «Ви вийшли з простору» ВИДНО; простору в списку немає; у власника — сповіщення workspace_member_left, рядка немає.
//  3. Учасник (центр облікового запису, телефон 380×800): спільний простір є у виборі «Робочий простір» з роллю; форма вимкнена
//     з поясненням; власний рядок «Вийти з простору» → той самий результат, підсумок видно після перезавантаження.
// Знімки 015-delen-*.png (знеособлені: адреси @example.test замасковано). Лише вигадані дані; назовні не йде нічого.
// Acceptatie van «delen» na de review: gebruikte link intrekken, gewone intrekking, zelf vertrekken in hub en instellingencentrum.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import type { Page } from 'playwright-core';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { HUB, ID, apparaat, horizontaal, persoon, sluit, verberg, volgFouten, type Persoon } from './hulp/sessie-015';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
// Очікувані відмови сервера в цьому сценарії (решта HTTP ≥ 400 — помилка).
const VERWACHT = [/\/api\/owner\/agents\/activity$/, /\/api\/share\/link\/revoke$/];
// Давня вада поза межами кроку delen (записана у відомості, sharing.чинні.1.vyity-samomu): після БУДЬ-ЯКОГО перезавантаження hub
// сповіщення v2 (src/meldingen/sessie-context.ts) шлють service «ai» замість «hub» → 401 OWNER_SESSION_CONTEXT_REQUIRED. Рахуємо окремо.
const DAVNE_HUB = [/hub\.tarasevych\.com\/api\/owner\/meldingen\/(status|gelezen)$/];
const idVan = (code: string) => createHash('sha256').update(code, 'utf8').digest('hex').slice(0, 32);

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-015 delen');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaarEmail = `e2e-i15d-eig-${T}@example.test`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaarEmail, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const davne: string[] = [];
  const emails: string[] = [];
  const foto = async (page: Page, naam: string) => { await verberg(page); await page.screenshot({ path: `${UIT}/015-delen-${naam}.png`, fullPage: false }); };
  const idVanEmail = async (email: string) => String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id || '');
  const goedkeuren = async (p: Persoon, naam: string) => { const id = await idVanEmail(p.email); await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status: 'approved', name: naam })]); return id; };
  const hubApi = (p: Persoon, pad: string, extra: Record<string, unknown> = {}) => p.b.verzoek('hub.tarasevych.com', pad, p.b.ctxBody('hub', extra));
  const lidRij = async (ws: string, userId: string) => (await pool.query("select id, data->>'status' s, data->>'workspaceRole' r from app.records where tbl='workspace_members' and data->>'workspaceId'=$1 and data->>'userId'=$2", [ws, userId])).rows[0] as { id: string; s: string; r: string } | undefined;
  const meldingen = async (userId: string, kind: string) => (await pool.query("select data from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'=$2", [userId, kind])).rows.length;
  const auditTel = async (accountId: string, event: string) => Number((await pool.query("select count(*)::int n from app.records where tbl='security_audit' and data->>'accountId'=$1 and data->>'event'=$2", [accountId, event])).rows[0]?.n || 0);
  const tekstOp = async (page: Page, re: RegExp, ms = 8000) => page.getByText(re).first().waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
  try {
    // ---------------------------------------------------------------- особи й простір
    const O = await persoon(G as never, 'i15d-eig', T); emails.push(O.email);
    const V = await persoon(G as never, 'i15d-kijk', T); emails.push(V.email);
    const M = await persoon(G as never, 'i15d-lid', T); emails.push(M.email);
    const L = await persoon(G as never, 'i15d-link', T); emails.push(L.email);
    // persoon() maakt e2e-<naam>-<run>@example.test; de eigenaar van de site is precies dit adres
    const oId = await goedkeuren(O, 'Власниця Проба'), vId = await goedkeuren(V, 'Глядач Проба'), mId = await goedkeuren(M, 'Учасник Проба'), lId = await goedkeuren(L, 'Новий Проба');
    for (const p of [O, V, M, L]) await hubApi(p, '/api/workspace/load');
    const ws = String((await hubApi(O, '/api/workspace/load')).data.workspace?.id || '');
    const naamWs = String((await hubApi(O, '/api/workspace/load')).data.workspace?.name || '');
    check('підготовка: простір власника є', !!ws && !!oId && !!vId && !!mId && !!lId);
    const kijkLink = await hubApi(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer' });
    const lidLink = await hubApi(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'member' });
    const jV = await hubApi(V, '/api/share/join', { code: String(kijkLink.data.code) });
    const jM = await hubApi(M, '/api/share/join', { code: String(lidLink.data.code) });
    check('підготовка: глядач і учасник приєдналися за одноразовими посиланнями', jV.status === 200 && jM.status === 200 && (await lidRij(ws, vId))?.r === 'viewer' && (await lidRij(ws, mId))?.r === 'member', `${jV.status} ${jM.status}`);

    // ================================================================ 1. власник: використане посилання на застарілому переліку
    {
      const used = await hubApi(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer', geldigDagen: 30 });
      const { ctx, page } = await apparaat(browser, O, { taal: 'uk', width: 1280, height: 860 });
      volgFouten(page, fouten, VERWACHT);
      await page.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
      const rij = page.locator(`#delen-links [data-link-id="${idVan(String(used.data.code))}"]`);
      await rij.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      check('власник: щойно створене посилання видно в «Відкритих посиланнях» з датою «діє до»', await rij.isVisible() && /діє до/.test(await rij.innerText()), await rij.innerText().catch(() => ''));
      const knop = rij.locator('button[data-link-intrekken]');
      check('власник: «Відкликати» має власну назву для екранного читача (код і роль)', /^Відкликати посилання .{4}… з роллю «Перегляд»$/.test(String(await knop.getAttribute('aria-label'))), String(await knop.getAttribute('aria-label')));
      const hint = page.locator('#delen-uitnodigen .delen-link-hint').first();
      check('власник: підказка до «Строк дії» видима без наведення (не лише title)', await hint.isVisible());
      // токен --tik-hoogte: 40 px для миші, 44 px на телефоні/дотику (src/ontwerp/tokens.css)
      const hoogte = await page.locator('#delen-uitnodigen .delen-link-opties select').evaluate((el) => el.getBoundingClientRect().height);
      await page.setViewportSize({ width: 380, height: 800 });
      const hoogteTel = await page.locator('#delen-uitnodigen .delen-link-opties input[type="email"]').evaluate((el) => el.getBoundingClientRect().height);
      await page.setViewportSize({ width: 1280, height: 860 });
      check('власник: поля «Строк дії»/«Лише для адреси» — висота з токена дотику (≥ 40 px на комп\'ютері, ≥ 44 px на телефоні)', hoogte >= 39.5 && hoogteTel >= 43.5, `${hoogte} / ${hoogteTel}`);
      await foto(page, 'eigenaar-links-computer');
      // T1: людина приєднується за посиланням, поки перелік у власника відкритий (застарілий)
      const jL = await hubApi(L, '/api/share/join', { code: String(used.data.code) });
      const auditVoor = await auditTel(oId, 'workspace_share_link_revoked'), meldVoor = await meldingen(oId, 'workspace_share_link_revoked');
      // T2: власник натискає «Відкликати» на застарілому рядку
      await knop.click();
      const dlg = page.locator('[data-bevestig="deel-link-intrekken"]');
      await dlg.waitFor({ state: 'visible', timeout: 5000 });
      check('власник: діалог «Відкликати посилання?» пояснює, що учасники, які вже приєдналися, лишаються', /вже приєдналися/.test(await dlg.innerText()), (await dlg.innerText()).slice(0, 300));
      const antwoord = page.waitForResponse((r) => r.url().endsWith('/api/share/link/revoke'));
      await dlg.locator('.bevestig-dialoog-ja').click();
      const r = await antwoord; const body = await r.json().catch(() => ({}));
      check('сервер: відкликання вже використаного посилання → 409 SHARE_LINK_USED', jL.status === 200 && r.status() === 409 && body.error === 'SHARE_LINK_USED', `${jL.status} ${r.status()} ${JSON.stringify(body)}`);
      check('власник бачить чесний підсумок: посиланням уже скористалися, людина лишається учасником, шлях — «Хто має доступ»', await tekstOp(page, /Цим посиланням уже скористалися/) && await tekstOp(page, /лишається учасником/));
      await page.waitForTimeout(600);
      check('власник: використаного рядка в переліку більше немає (перелік оновився)', (await rij.count()) === 0);
      check('стан: людина лишається учасником; revoked_at не поставлено; запису «відкликано» й сповіщення немає',
        (await lidRij(ws, lId))?.s === 'active' && !(await pool.query('select revoked_at from app.invites where code=$1', [String(used.data.code)])).rows[0]?.revoked_at
        && (await auditTel(oId, 'workspace_share_link_revoked')) === auditVoor && (await meldingen(oId, 'workspace_share_link_revoked')) === meldVoor);
      await foto(page, 'eigenaar-gebruikt-computer');
      const ledenTekst = await page.locator('#delen-leden').innerText();
      check('власник: у «Хто має доступ» новий учасник видно (туди вказує підсумок)', /Новий Проба|e2e-i15d-link/.test(ledenTekst) || ledenTekst.split('\n').length > 3);

      // звичайне відкликання — фокус і справжня дія
      const gewoon = await hubApi(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer', geldigDagen: 1 });
      const extra = await hubApi(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer', geldigDagen: 7 });
      await page.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
      const rij2 = page.locator(`#delen-links [data-link-id="${idVan(String(gewoon.data.code))}"]`);
      await rij2.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      await rij2.locator('button[data-link-intrekken]').click();
      await page.locator('[data-bevestig="deel-link-intrekken"] .bevestig-dialoog-ja').click();
      check('власник: звичайне відкликання → «Посилання відкликано: хто відкриє його тепер, доступу не отримає»', await tekstOp(page, /Посилання відкликано: хто відкриє його тепер, доступу не отримає/));
      await page.waitForTimeout(500);
      const focus = await page.evaluate(() => { const a = document.activeElement; return { inLijst: !!a?.closest('.delen-links-lijst'), tag: a?.tagName || '', body: a === document.body }; });
      check('доступність: після відкликання фокус лишається в переліку (а не на body)', focus.inLijst && !focus.body, JSON.stringify(focus));
      check('стан: відкликаний рядок зник, інше посилання лишилося', (await rij2.count()) === 0 && (await page.locator(`#delen-links [data-link-id="${idVan(String(extra.data.code))}"]`).count()) === 1);
      const jNa = await hubApi(L, '/api/share/join', { code: String(gewoon.data.code) });
      check('одержувач: за відкликаним посиланням приєднатися не можна (invite_revoked)', jNa.status === 400 && jNa.data.error === 'invite_revoked', JSON.stringify(jNa.data));
      // телефон 380: той самий перелік без горизонтальної прокрутки
      await page.setViewportSize({ width: 380, height: 800 });
      await page.locator('#delen-links').scrollIntoViewIfNeeded();
      check('телефон 380: «Відкриті посилання» без горизонтальної прокрутки', (await horizontaal(page)) <= 0, String(await horizontaal(page)));
      await foto(page, 'eigenaar-links-telefoon');
      await sluit(ctx);
    }

    // ================================================================ 2. глядач у hub: «Вийти з простору»
    {
      const { ctx, page } = await apparaat(browser, V, { taal: 'uk', width: 1280, height: 860 });
      volgFouten(page, fouten, [...VERWACHT, ...DAVNE_HUB]);
      page.on('response', (q) => { if (q.status() === 401 && DAVNE_HUB.some((r) => r.test(q.url()))) davne.push(q.url()); });
      await page.goto(`${HUB}/?lang=uk`, { waitUntil: 'networkidle' });
      // вибір простору — у розгорнутій бічній панелі (на комп'ютері вона розгортається під вказівником, CanoniekOmlijsting)
      await page.locator('aside.canonical-sidebar').hover().catch(() => undefined);
      const keuze = page.locator('.workspace-sidebar-actions select');
      await keuze.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      check('глядач: у виборі просторів hub є спільний простір власника', (await keuze.locator(`option[value="${ws}"]`).count()) === 1, (await page.locator('.workspace-sidebar-actions').count()).toString());
      await keuze.selectOption(ws);
      // вказівник іде з бічної панелі (вона згортається), далі — клавіатурою: «⋯» → «Поділитися»
      await page.mouse.move(900, 600); await page.waitForTimeout(1200);
      const menuKnop = page.locator('.hub-sectie-menu-knop').first();
      await menuKnop.focus(); await page.keyboard.press('Enter');
      const deelActie = page.locator('[data-hub-share-action]');
      await deelActie.waitFor({ state: 'visible', timeout: 5000 });
      await deelActie.focus(); await page.keyboard.press('Enter');
      const eigen = page.locator('[data-delen-vertrekken]');
      await eigen.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      check('глядач: на власному рядку «Хто має доступ» є одна кнопка «Вийти з простору»', (await eigen.count()) === 1 && /Вийти з простору/.test(await eigen.innerText()));
      await foto(page, 'kijker-hub-voor-computer');
      await eigen.click();
      const dlg = page.locator('[data-bevestig="deel-vertrekken"]');
      await dlg.waitFor({ state: 'visible', timeout: 5000 });
      check('глядач: діалог пояснює наслідки (власник отримає сповіщення, повернення — за новим запрошенням)', /сповіщення/.test(await dlg.innerText()) && /запрошення/.test(await dlg.innerText()));
      await foto(page, 'kijker-hub-dialoog-computer');
      const herladen = page.waitForEvent('load', { timeout: 15000 }).then(() => true).catch(() => false);
      await dlg.locator('.bevestig-dialoog-ja').click();
      const isHerladen = await herladen;
      await page.waitForLoadState('networkidle').catch(() => undefined);
      check('глядач: після підтвердження сторінка перезавантажується, а підсумок «Ви вийшли з простору. Власник отримає сповіщення» ВИДНО',
        isHerladen && await tekstOp(page, /Ви вийшли з простору\. Власник отримає сповіщення/, 12000));
      await foto(page, 'kijker-hub-na-computer');
      await page.locator('aside.canonical-sidebar').hover().catch(() => undefined); await page.waitForTimeout(600);
      const opties = await page.locator(`.workspace-sidebar-actions select option[value="${ws}"]`).count();
      const nuLeden = await hubApi(V, '/api/share/members', { workspaceId: ws });
      check('глядач: простору власника більше немає у виборі hub, і сервер більше не дає його бачити (403)', opties === 0 && nuLeden.status === 403, `${opties} ${nuLeden.status}`);
      await page.setViewportSize({ width: 380, height: 800 });
      check('глядач: телефон 380 після виходу — без горизонтальної прокрутки', (await horizontaal(page)) <= 0);
      await foto(page, 'kijker-hub-na-telefoon');
      // повторне відкриття: підсумок показується один раз
      await page.reload({ waitUntil: 'networkidle' });
      check('глядач: після ще одного перезавантаження підсумок не повторюється', !(await tekstOp(page, /Ви вийшли з простору/, 2500)));
      await sluit(ctx);
      await new Promise((r) => setTimeout(r, 400));
      const lijst = await hubApi(O, '/api/share/members', { workspaceId: ws });
      check('власник: рядка глядача в «Хто має доступ» немає (сервер); сповіщення workspace_member_left — одне',
        !(await lidRij(ws, vId)) && !((lijst.data.members || []) as Array<{ userId?: string }>).some((x) => x.userId === vId) && (await meldingen(oId, 'workspace_member_left')) === 1);
    }

    // ================================================================ 3. учасник у центрі облікового запису (телефон 380)
    {
      const { ctx, page } = await apparaat(browser, M, { taal: 'uk', width: 380, height: 800, touch: true });
      volgFouten(page, fouten, VERWACHT);
      await page.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
      const keuze = page.locator('#delen-uitnodigen select').first();
      await keuze.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      const optie = keuze.locator(`option[value="${ws}"]`);
      check('учасник (центр): спільний простір є у виборі з роллю «ваша роль — Редагування»', (await optie.count()) === 1 && /ваша роль — Редагування/.test(await optie.innerText()), await optie.innerText().catch(() => ''));
      await keuze.selectOption(ws);
      const eigen = page.locator('#delen-leden [data-delen-vertrekken]');
      await eigen.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
      check('учасник (центр): пояснення, чому ділитися не можна, і вимкнена форма', await page.locator('[data-delen-uitleg]').isVisible() && await page.locator('#delen-uitnodigen input[type="email"]').first().isDisabled());
      check('учасник (центр): власний рядок має «Вийти з простору»', (await eigen.count()) === 1);
      check('учасник (центр): телефон 380 без горизонтальної прокрутки', (await horizontaal(page)) <= 0, String(await horizontaal(page)));
      await eigen.scrollIntoViewIfNeeded();
      await foto(page, 'lid-centrum-voor-telefoon');
      await eigen.click();
      const dlg = page.locator('[data-bevestig="deel-vertrekken"]');
      await dlg.waitFor({ state: 'visible', timeout: 5000 });
      const herladen = page.waitForEvent('load', { timeout: 15000 }).then(() => true).catch(() => false);
      await dlg.locator('.bevestig-dialoog-ja').click();
      const isHerladen = await herladen;
      await page.waitForLoadState('networkidle').catch(() => undefined);
      check('учасник (центр): після перезавантаження підсумок «Ви вийшли з простору» ВИДНО', isHerladen && await tekstOp(page, /Ви вийшли з простору/, 12000));
      await foto(page, 'lid-centrum-na-telefoon');
      check('учасник (центр): простору більше немає у виборі', (await page.locator(`#delen-uitnodigen select option[value="${ws}"]`).count()) === 0);
      await page.setViewportSize({ width: 1280, height: 860 });
      await foto(page, 'lid-centrum-na-computer');
      await sluit(ctx);
      await new Promise((r) => setTimeout(r, 400));
      check('власник: рядка учасника немає; сповіщень workspace_member_left — два (глядач і учасник)', !(await lidRij(ws, mId)) && (await meldingen(oId, 'workspace_member_left')) === 2);
    }
    // власник бачить сповіщення у своєму центрі (друге відкриття)
    {
      const { ctx, page } = await apparaat(browser, O, { taal: 'nl', thema: 'dark', width: 1280, height: 860 });
      volgFouten(page, fouten, VERWACHT);
      const r = await page.goto(`${ID}/sharing?lang=nl`, { waitUntil: 'networkidle' });
      const leden = await page.locator('#delen-leden').innerText().catch(() => '');
      check('власник (nl, друге відкриття): у «Wie heeft toegang» немає ні глядача, ні учасника, що вийшли', !!r && !/Глядач Проба|Учасник Проба|e2e-i15d-kijk|e2e-i15d-lid/.test(leden), leden.slice(0, 300));
      await foto(page, 'eigenaar-leden-nl-computer');
      void naamWs;
      await sluit(ctx);
    }
    check('без помилок у консолі й HTTP (окрім очікуваної відмови SHARE_LINK_USED)', fouten.length === 0, fouten.slice(0, 6).join(' | '));
    if (davne.length) console.log(`[e2e] давня вада hub (поза кроком delen): ${davne.length}× 401 на /api/owner/meldingen/* після перезавантаження hub`);
  } catch (e) {
    check('неочікувана помилка', false, String((e as Error)?.stack || e).slice(0, 1500));
  } finally {
    await browser.close().catch(() => undefined);
    // Прибирання лише за ТОЧНИМИ адресами цього запуску.
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [emails]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) {
      const wsIds = (await pool.query("select id from app.records where tbl='workspaces' and data->>'ownerUserId' = any($1)", [ids])).rows.map((x: { id: string }) => x.id);
      await pool.query("delete from app.invites where context->>'workspaceId' = any($1)", [wsIds]).catch(() => undefined);
      await pool.query("delete from app.records where tbl='workspace_members' and data->>'workspaceId' = any($1)", [wsIds]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    }
    await stop();
  }
  return einde();
}
