// IDENTITEIT-015 (крок «delen», приймання після рецензії): справжній Chromium, три вигадані особи, кожна — окремий пристрій.
//  1. Власник (центр облікового запису, комп'ютер 1280): «Відкриті посилання». Перелік відкрито ДО того, як учасник скористався
//     одноразовим посиланням; натискання «Відкликати» на застарілому рядку → чесна відповідь «вже використано» (SHARE_LINK_USED),
//     без запису «відкликано» й без сповіщення; учасник лишається. Звичайне відкликання → «доступу не отримає», фокус лишається в
//     переліку, а посилання справді не відкривається (invite_revoked).
//  2. Глядач (hub, комп'ютер 1280): «Поділитися» → «Хто має доступ» → «Вийти з простору» → діалог → сторінка перезавантажується, і
//     підсумок «Ви вийшли з простору» ВИДНО; простору в списку немає; у власника — сповіщення workspace_member_left, рядка немає.
//  3. Учасник (центр облікового запису, телефон 380×800): спільний простір є у виборі «Робочий простір» з роллю; форма вимкнена
//     з поясненням; власний рядок «Вийти з простору» → той самий результат, підсумок видно після перезавантаження.
// Розділ A (приймання групи «delen»): власник простору і ДРУГИЙ пробний обліковий запис, кожен у своєму контексті браузера:
//  A1–A2 запрошення за адресою з правом «Редагування» → перший вхід і схвалення → обидва бачать (Активний / простір у переліку),
//        учасник додає блок через форму центру; A3 приватні посилання «Перегляд» на 1 день: до спливу, після спливу (зсув SQL),
//        дострокове відкликання; A4 «Редагування» → «Перегляд»: інтерфейс без дій редагування, прямі запити 403, перегляд працює;
//  A5 відкликання доступу; A6 «Вийти з простору»; сповіщення в центрі сповіщень обох. E2E_DEEL=a|b — лише один розділ (налагодження).
// Знімки 015-delen-*.png (знеособлені: адреси @example.test замасковано). Лише вигадані дані; назовні не йде нічого.
// Acceptatie van «delen» na de review: gebruikte link intrekken, gewone intrekking, zelf vertrekken in hub en instellingencentrum.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import type { Page } from 'playwright-core';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { HUB, ID, apparaat, horizontaal, openBlok, persoon, sluit, verberg, volgFouten, type Persoon } from './hulp/sessie-015';

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
  // ================================================================ A. Приймання групи «delen»: власник простору і ДРУГИЙ пробний
  // обліковий запис — кожен у своєму контексті браузера (окремий пристрій), обидва — справжні сторінки центру й hub.
  // Acceptatie «delen»: eigenaar en tweede proefaccount in eigen browsercontexten (uitnodigen, privélinks, rol, intrekken, vertrekken).
  const DEEL = process.env.E2E_DEEL || ''; // 'a' — лише цей розділ, 'b' — лише попередні сценарії (для налагодження); порожньо — усе
  /** Відкриває центр сповіщень і читає розділи «Нові» та «Прочитані»; для знімка лишає відкритим розділ, де є шуканий заголовок. */
  const bel = async (page: Page, zoek?: RegExp) => {
    const knop = page.locator('[data-qa-id="canonical-notification-bell"]').first();
    await knop.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    await knop.click().catch(() => undefined);
    const paneel = page.locator('[data-qa-id="canonical-notification-panel"]');
    await paneel.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
    await page.waitForTimeout(900);
    // панель має розділи «Нові» і «Прочитані» (src/MeldingenpaneelInhoud.tsx, у v2 — MeldingenV2.tsx) — людина переглядає обидва
    let tekst = '', metTreffer = '';
    const chip = (s: string) => paneel.locator(`button.cnc-chip[data-cnc-deel="${s}"], button.mv2-sectie[data-sectie="${s}"]`).first();
    for (const s of ['nieuw', 'gelezen']) {
      if (await chip(s).count()) { await chip(s).click().catch(() => undefined); await page.waitForTimeout(500); }
      const deel = await paneel.innerText().catch(() => '');
      if (zoek && !metTreffer && zoek.test(deel)) metTreffer = s;
      tekst += ` ${deel}`;
    }
    if (metTreffer && metTreffer !== 'gelezen') { await chip(metTreffer).click().catch(() => undefined); await page.waitForTimeout(400); }
    return tekst.replace(/\s+/g, ' ');
  };
  /** Текст останнього сповіщення цього типу на сервері (повний, «uk / nl») — для перевірки змісту поруч із заголовком у панелі. */
  const meldingTekst = async (userId: string, kind: string) => String((await pool.query("select data->>'message' m from app.records where tbl='site_notifications' and data->>'recipientUserId'=$1 and data->>'kind'=$2 order by seq desc limit 1", [userId, kind])).rows[0]?.m || '');
  const sluitBel = async (page: Page) => { await page.keyboard.press('Escape').catch(() => undefined); await page.waitForTimeout(300); };
  const rijVan = (page: Page, email: string) => page.locator('#delen-leden .delen-lid').filter({ hasText: email });
  const blokToevoegen = (p: Persoon, ws: string, title: string) => hubApi(p, '/api/blocks/add', { workspaceId: ws, sourceType: 'internal', target: 'hub:notes', title, description: 'Проба приймання delen', url: '', size: 'medium', presentation: 'summary', itemLimit: 5 });
  const hubOpen = (page: Page, ws: string, blok: string) => page.goto(`${HUB}/?werkruimte=${encodeURIComponent(ws)}&blok=${encodeURIComponent(blok)}&lang=uk`, { waitUntil: 'networkidle' });
  /** Пункти меню «⋯» розділу hub (відкрити клавіатурою, прочитати, закрити). */
  const sectieMenu = async (page: Page) => {
    const k = page.locator('.hub-sectie-menu-knop').first();
    if (!(await k.count())) return '';
    await k.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    const t = await page.locator('.hub-sectie-menu-lijst').innerText().catch(() => '');
    await k.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    return t;
  };
  const codeVan = (link: string) => { try { const h = new URL(link).hash; return new URLSearchParams(h.split('?')[1] || '').get('invite') || ''; } catch { return ''; } };
  const linkMaken = async (page: Page, dagen: '1' | '7' | '30') => {
    const form = page.locator('#delen-uitnodigen');
    await form.locator('form.settings-form select').nth(1).selectOption('viewer');
    await form.locator('.delen-link-opties select').selectOption(dagen);
    const vorige = await form.locator('.settings-link-box input[readonly]').inputValue().catch(() => '');
    await form.getByRole('button', { name: 'Створити', exact: true }).click();
    const dlg = page.locator('[data-bevestig="deel-link-maken"]');
    await dlg.waitFor({ state: 'visible', timeout: 5000 });
    const uitleg = await dlg.innerText();
    await dlg.locator('.bevestig-dialoog-ja').click();
    const veld = form.locator('.settings-link-box input[readonly]');
    await page.waitForFunction(([v]) => { const el = document.querySelector<HTMLInputElement>('#delen-uitnodigen .settings-link-box input[readonly]'); return !!el && !!el.value && el.value !== v; }, [vorige] as const, { timeout: 10000 }).catch(() => undefined);
    const link = await veld.inputValue().catch(() => '');
    const vervalt = await form.locator('[data-link-vervalt]').getAttribute('data-link-vervalt').catch(() => '');
    return { link, code: codeVan(link), uitleg, vervalt: String(vervalt || '') };
  };
  const ledenVanHub = async (page: Page) => {
    await page.locator('aside.canonical-sidebar').hover().catch(() => undefined); await page.waitForTimeout(500);
    const opties = await page.locator('.workspace-sidebar-actions select option').evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value)).catch(() => [] as string[]);
    await page.mouse.move(900, 600).catch(() => undefined); await page.waitForTimeout(600);
    return opties;
  };

  async function acceptatie() {
    const A = await persoon(G as never, 'i15a-eig', T); emails.push(A.email);
    const K = await persoon(G as never, 'i15a-link', T); emails.push(K.email);
    const K2 = await persoon(G as never, 'i15a-pizno', T); emails.push(K2.email);
    const aId = await goedkeuren(A, 'Власник Спільного'), kId = await goedkeuren(K, 'Глядачка Посилання'), k2Id = await goedkeuren(K2, 'Запізнілий Проба');
    for (const p of [A, K, K2]) await hubApi(p, '/api/workspace/load');
    const wsLaad = await hubApi(A, '/api/workspace/load');
    const wsA = String(wsLaad.data.workspace?.id || ''), naamA = String(wsLaad.data.workspace?.name || '');
    const blokA = await blokToevoegen(A, wsA, 'Спільні нотатки проби'); const blokAId = String(blokA.data.block?.id || '');
    check('A0 підготовка: власний простір і блок власника (тип «Нотатки»)', !!wsA && !!aId && !!kId && !!k2Id && blokA.status === 200 && !!blokAId, `${blokA.status}`);
    // Адреса другого облікового запису: його ще НЕМАЄ (людина ще ні разу не входила).
    const rEmail = `e2e-i15a-ont-${T}@example.test`; emails.push(rEmail);

    // ---------------------------------------------------------------- A1. запрошення конкретної особи з правом «Редагування»
    const { ctx: aCtx, page: aP } = await apparaat(browser, A, { taal: 'uk', width: 1280, height: 860 });
    volgFouten(aP, fouten, VERWACHT);
    await aP.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
    const form = aP.locator('#delen-uitnodigen form.settings-form');
    await form.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    check('A1 власник: у формі «Запросити людину» вибрано власний простір', (await form.locator('select').first().inputValue().catch(() => '')) === wsA);
    await form.locator('input[type="email"]').fill(rEmail);
    await form.locator('select').nth(1).selectOption('editor');
    await form.getByRole('button', { name: 'Надати доступ' }).click();
    const dlgG = aP.locator('[data-bevestig="deel-toegang-geven"]');
    await dlgG.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    const dlgGTekst = await dlgG.innerText().catch(() => '');
    check('A1 власник: вікно підтвердження називає адресу, простір і роль «Редагування»', dlgGTekst.includes(rEmail) && /Редагування/.test(dlgGTekst) && dlgGTekst.includes(naamA), dlgGTekst.replace(/\s+/g, ' ').slice(0, 300));
    await foto(aP, 'a-uitnodigen-dialoog-computer');
    const antwG = aP.waitForResponse((r) => r.url().endsWith('/api/share/email'));
    await dlgG.locator('.bevestig-dialoog-ja').click();
    const rG = await antwG;
    const rijR = rijVan(aP, rEmail);
    await rijR.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
    check('A1 власник: сервер прийняв запрошення (200), у «Хто має доступ» — «Запрошено — ще не прийнято · Редагування»',
      rG.status() === 200 && (await rijR.getAttribute('data-lid-staat').catch(() => '')) === 'uitgenodigd' && /Запрошено — ще не прийнято/.test(await rijR.innerText().catch(() => '')) && /Редагування/.test(await rijR.innerText().catch(() => '')),
      `${rG.status()} ${await rijR.innerText().catch(() => '')}`);
    await foto(aP, 'a-uitgenodigd-computer');

    // ---------------------------------------------------------------- A2. одержувач входить уперше; адміністратор сайту схвалює
    const R = await persoon(G as never, 'i15a-ont', T);
    check('A2 одержувач: адреса облікового запису та сама, що в запрошенні', R.email === rEmail);
    const rIdVoor = await idVanEmail(rEmail);
    check('A2 до схвалення запрошення ще не діє (рядок «запрошено», userId порожній)', !(await lidRij(wsA, rIdVoor)));
    // Схвалення адміністратором сайту: той самий шлях, що updateManagedUser/decideAccessRequest (status approved → activateInvites).
    const rId = await goedkeuren(R, 'Отримувачка Проба');
    const { emailZichtbaarheidVoorTests } = await import('../../backend/index');
    { const [rij] = (await pool.query("select id, data from app.records where tbl='users' and id=$1", [rId])).rows; await emailZichtbaarheidVoorTests.activateInvites({ ...rij.data, id: rij.id } as never); }
    check('A2 сервер: після схвалення запрошення прийнято — учасник active з роллю member (Редагування)', (await lidRij(wsA, rId))?.s === 'active' && (await lidRij(wsA, rId))?.r === 'member', JSON.stringify(await lidRij(wsA, rId)));
    const { ctx: rCtx, page: rP } = await apparaat(browser, R, { taal: 'uk', width: 380, height: 800, touch: true });
    const rVerwacht = [...VERWACHT, ...DAVNE_HUB];
    volgFouten(rP, fouten, rVerwacht);
    rP.on('response', (q) => { if (q.status() === 401 && DAVNE_HUB.some((r) => r.test(q.url()))) davne.push(q.url()); });
    await hubOpen(rP, wsA, blokAId);
    const blokBijR = rP.locator(`[data-blok-id="${blokAId}"]`);
    await blokBijR.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
    const laadR = await hubApi(R, '/api/workspace/load', { workspaceId: wsA });
    check('A2 одержувач (hub, телефон 380): спільний простір відкривається, блок власника видно; сервер — permission editor',
      await blokBijR.isVisible().catch(() => false) && laadR.status === 200 && laadR.data.permission === 'editor', `${laadR.status} ${laadR.data.permission}`);
    check('A2 одержувач (hub, телефон 380): без горизонтальної прокрутки', (await horizontaal(rP)) <= 0, String(await horizontaal(rP)));
    await foto(rP, 'a-ontvanger-hub-telefoon');
    // Право «Редагування» в hub: дії поверхні — лише власникові (ownerMode); блок учасник додає через форму блоку в центрі (нижче).
    check('A2 одержувач (Редагування) у hub: дій власника («Налаштувати поверхню», «Скинути блоки») немає', !/Налаштувати поверхню|Скинути блоки/.test(await sectieMenu(rP)));
    // центр облікового запису одержувача (комп'ютер): форма блоку — спільний простір із роллю; додаємо блок як людина
    await rP.setViewportSize({ width: 1280, height: 860 });
    await rP.goto(`${ID}/widgets?lang=uk`, { waitUntil: 'networkidle' });
    await openBlok(rP, '[data-widget-annuleren]').catch(() => undefined);
    const wForm = rP.locator('form.settings-form').filter({ has: rP.locator('[data-widget-annuleren]') });
    const wKeuze = wForm.locator('select').first();
    const wOptie = wKeuze.locator(`option[value="${wsA}"]`);
    check('A2 одержувач (центр, «Віджети»): у виборі «Робочий простір» є спільний простір з «ваша роль — Редагування»', (await wOptie.count()) === 1 && /ваша роль — Редагування/.test(await wOptie.innerText().catch(() => '')), await wKeuze.innerText().catch(() => ''));
    await wKeuze.selectOption(wsA).catch(() => undefined);
    await wForm.locator('select').nth(2).selectOption('hub:notes').catch(() => undefined);
    await wForm.locator('label').filter({ hasText: /^Назва/ }).locator('input').fill('Блок отримувачки');
    const okR = rP.waitForResponse((r) => r.url().endsWith('/api/blocks/add'), { timeout: 15000 }).catch(() => null);
    await wForm.locator('button.settings-primary').click();
    const rAdd = await okR; const bAdd = rAdd ? await rAdd.json().catch(() => ({})) : {};
    const blokRId = String(bAdd.block?.id || '');
    const openR = wForm.locator('[data-widget-openen]');
    await openR.waitFor({ state: 'visible', timeout: 8000 }).catch(() => undefined);
    check('A2 одержувач (Редагування): блок додано в спільний простір через форму (200), «Відкрити в просторі» веде в цей простір',
      rAdd?.status() === 200 && !!blokRId && bAdd.block?.workspaceId === wsA && String(await openR.getAttribute('href').catch(() => '')).includes(`werkruimte=${encodeURIComponent(wsA)}`), `${rAdd?.status()} ${JSON.stringify(bAdd).slice(0, 200)}`);
    await foto(rP, 'a-ontvanger-blok-toegevoegd-computer');
    const ladenDoorA = await hubApi(A, '/api/workspace/load', { workspaceId: wsA });
    check('A2 власник бачить блок одержувача у своєму просторі (сервер)', ((ladenDoorA.data.blocks || []) as Array<{ id: string }>).some((b) => b.id === blokRId));
    await rP.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
    const optieR = rP.locator(`#delen-uitnodigen select option[value="${wsA}"]`);
    await optieR.waitFor({ state: 'attached', timeout: 15000 }).catch(() => undefined);
    check('A2 одержувач (центр, «Спільний доступ»): спільний простір у переліку з «ваша роль — Редагування»', /ваша роль — Редагування/.test(await optieR.innerText().catch(() => '')), await optieR.innerText().catch(() => ''));
    const belR1 = await bel(rP, /Новий спільний простір/), mR1 = await meldingTekst(rId, 'workspace_share');
    check('A2 одержувач: у центрі сповіщень — «Новий спільний простір»; зміст: хто, який простір, роль «Редагування»',
      /Новий спільний простір/.test(belR1) && mR1.includes(`Власник Спільного надав вам доступ до простору «${naamA}» з роллю «Редагування»`), `${belR1.slice(0, 300)} || ${mR1.slice(0, 200)}`);
    await foto(rP, 'a-ontvanger-melding-computer');
    await sluitBel(rP);

    // власник бачить «Активний» і сповіщення
    await aP.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
    await rijR.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
    check('A2 власник: після повторного відкриття — «Активний · Редагування»', (await rijR.getAttribute('data-lid-staat').catch(() => '')) === 'actief' && /Активний/.test(await rijR.innerText().catch(() => '')) && /Редагування/.test(await rijR.innerText().catch(() => '')), await rijR.innerText().catch(() => ''));
    const belA1 = await bel(aP, /Запрошення до простору прийнято/), mA1 = await meldingTekst(aId, 'workspace_invite_accepted');
    check('A2 власник: у центрі сповіщень — «Запрошення до простору прийнято»; зміст: «Отримувачка Проба тепер має доступ … «Редагування»»',
      /Запрошення до простору прийнято/.test(belA1) && mA1.includes(`Отримувачка Проба тепер має доступ до простору «${naamA}» з роллю «Редагування»`), `${belA1.slice(0, 300)} || ${mA1.slice(0, 200)}`);
    await foto(aP, 'a-eigenaar-melding-aanvaard-computer');
    await sluitBel(aP);

    // ---------------------------------------------------------------- A3. приватні посилання: «Перегляд», строк 1 день
    await aP.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
    const lA = await linkMaken(aP, '1');
    const tot = Date.parse(lA.vervalt) || Number(lA.vervalt);
    check('A3 власник: посилання «Перегляд» на 1 день створено; «Діє до» ≈ через добу', !!lA.code && /Перегляд/.test(lA.uitleg) && Math.abs(tot - (Date.now() + 86400000)) < 10 * 60000, `${lA.vervalt} ${lA.uitleg.replace(/\s+/g, ' ').slice(0, 200)}`);
    await foto(aP, 'a-link-gemaakt-computer');
    const lB = await linkMaken(aP, '1');
    const lC = await linkMaken(aP, '7');
    check('A3 власник: три різні посилання', !!lB.code && !!lC.code && new Set([lA.code, lB.code, lC.code]).size === 3);
    // до спливу: друга людина відкриває посилання й входить
    const { ctx: kCtx, page: kP } = await apparaat(browser, K, { taal: 'uk', width: 1280, height: 860 });
    volgFouten(kP, fouten, [...VERWACHT, ...DAVNE_HUB]);
    kP.on('response', (q) => { if (q.status() === 401 && DAVNE_HUB.some((r) => r.test(q.url()))) davne.push(q.url()); });
    await kP.goto(lA.link, { waitUntil: 'networkidle' });
    await kP.waitForTimeout(1200);
    const kLid = await lidRij(wsA, kId);
    const kOpties = await ledenVanHub(kP);
    check('A3 одержувач (до спливу): вступ за посиланням працює — учасник «Перегляд», простір у виборі hub', kLid?.s === 'active' && kLid?.r === 'viewer' && kOpties.includes(wsA), `${JSON.stringify(kLid)} ${kOpties.length}`);
    await foto(kP, 'a-link-binnen-computer');
    // після спливу (зсув строку в тестовій базі)
    await pool.query("update app.invites set expires_at = now() - interval '1 second' where code = $1", [lB.code]);
    const { ctx: k2Ctx, page: k2P } = await apparaat(browser, K2, { taal: 'uk', width: 380, height: 800, touch: true });
    volgFouten(k2P, fouten, [...VERWACHT, ...DAVNE_HUB, /\/api\/share\/join$/]);
    k2P.on('response', (q) => { if (q.status() === 401 && DAVNE_HUB.some((r) => r.test(q.url()))) davne.push(q.url()); });
    const joinB = k2P.waitForResponse((r) => r.url().endsWith('/api/share/join'), { timeout: 20000 }).catch(() => null);
    await k2P.goto(lB.link, { waitUntil: 'networkidle' });
    const rB = await joinB; const bodyB = rB ? await rB.json().catch(() => ({})) : {};
    check('A3 після спливу: сервер відмовляє (invite_expired), людина бачить пояснення «Запрошення прострочене… Попросіть … нове»',
      rB?.status() === 400 && bodyB.error === 'invite_expired' && await tekstOp(k2P, /Запрошення прострочене: його строк дії минув/), `${rB?.status()} ${JSON.stringify(bodyB)}`);
    check('A3 після спливу: учасником людина не стала', !(await lidRij(wsA, k2Id)));
    await foto(k2P, 'a-link-verlopen-telefoon');
    await aP.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
    const rijB = aP.locator(`#delen-links [data-link-id="${idVan(lB.code)}"]`), rijC = aP.locator(`#delen-links [data-link-id="${idVan(lC.code)}"]`);
    await rijC.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    check('A3 власник: прострочене й використане посилання зникли з «Відкритих посилань», третє — є', (await rijB.count()) === 0 && (await aP.locator(`#delen-links [data-link-id="${idVan(lA.code)}"]`).count()) === 0 && (await rijC.count()) === 1);
    // дострокове відкликання третього з переліку
    await rijC.locator('button[data-link-intrekken]').click();
    await aP.locator('[data-bevestig="deel-link-intrekken"] .bevestig-dialoog-ja').click();
    check('A3 власник: «Посилання відкликано: хто відкриє його тепер, доступу не отримає»', await tekstOp(aP, /Посилання відкликано: хто відкриє його тепер, доступу не отримає/));
    await aP.waitForTimeout(400);
    check('A3 власник: відкликаного рядка в переліку немає', (await rijC.count()) === 0);
    // друге посилання людина відкриває в НОВІЙ вкладці (як із листа чи месенджера); у тій самій вкладці змінився б лише #хеш
    const k2Tab = await k2Ctx.newPage();
    volgFouten(k2Tab, fouten, [...VERWACHT, ...DAVNE_HUB, /\/api\/share\/join$/]);
    const joinC = k2Tab.waitForResponse((r) => r.url().endsWith('/api/share/join'), { timeout: 20000 }).catch(() => null);
    await k2Tab.goto(lC.link, { waitUntil: 'networkidle' });
    const rC = await joinC; const bodyC = rC ? await rC.json().catch(() => ({})) : {};
    check('A3 відкликане посилання: сервер відмовляє (invite_revoked), людина бачить «Запрошення відкликали — доступу за ним немає»',
      rC?.status() === 400 && bodyC.error === 'invite_revoked' && await tekstOp(k2Tab, /Запрошення відкликали — доступу за ним немає/), `${rC?.status()} ${JSON.stringify(bodyC)}`);
    check('A3 відкликане посилання: учасником людина не стала, сервер не дає відкрити простір (403)', !(await lidRij(wsA, k2Id)) && (await hubApi(K2, '/api/workspace/load', { workspaceId: wsA })).status === 403);
    await foto(k2Tab, 'a-link-ingetrokken-telefoon');
    await sluit(k2Ctx);

    // ---------------------------------------------------------------- A4. «Хто має доступ»: «Редагування» → «Перегляд»
    await aP.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
    await rijR.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
    await rijR.locator('select').selectOption('viewer');
    const dlgRol = aP.locator('[data-bevestig="deel-rol-wijzigen"]');
    await dlgRol.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    const dlgRolTekst = (await dlgRol.innerText().catch(() => '')).replace(/\s+/g, ' ');
    check('A4 власник: вікно зміни ролі пояснює наслідки «Редагування» → «Перегляд»', /Перегляд/.test(dlgRolTekst) && /Редагування/.test(dlgRolTekst), dlgRolTekst.slice(0, 300));
    await foto(aP, 'a-rol-dialoog-computer');
    await aP.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' }); // знімок замаскував адреси — відкриваємо заново
    await rijR.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
    await rijR.locator('select').selectOption('viewer');
    await dlgRol.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    const antwRol = aP.waitForResponse((r) => r.url().endsWith('/api/share/role'));
    await dlgRol.locator('.bevestig-dialoog-ja').click();
    const rRol = await antwRol;
    await aP.waitForTimeout(500);
    check('A4 власник: роль змінено (200), рядок — «Активний · Перегляд»; на сервері viewer', rRol.status() === 200 && /Перегляд/.test(await rijR.innerText().catch(() => '')) && (await lidRij(wsA, rId))?.r === 'viewer', `${rRol.status()} ${await rijR.innerText().catch(() => '')}`);
    // одержувач: оновлення сторінки hub
    await rP.setViewportSize({ width: 380, height: 800 });
    await hubOpen(rP, wsA, blokAId);
    await blokBijR.waitFor({ state: 'visible', timeout: 20000 }).catch(() => undefined);
    const laadV = await hubApi(R, '/api/workspace/load', { workspaceId: wsA });
    check('A4 одержувач після оновлення: перегляд працює — блок власника видно; сервер — 200, permission viewer', await blokBijR.isVisible().catch(() => false) && laadV.status === 200 && laadV.data.permission === 'viewer', `${laadV.status} ${laadV.data.permission}`);
    const menuKijker = await sectieMenu(rP);
    check('A4 одержувач (Перегляд): в інтерфейсі немає дій редагування (ні «Налаштувати поверхню», ні «Додати», ні кнопок блоку)',
      !/Налаштувати поверхню|Скинути блоки/.test(menuKijker) && (await rP.getByRole('button', { name: /Додати/ }).count()) === 0 && (await rP.locator('.block-head-actions, .block-inline-editor').count()) === 0, menuKijker.replace(/\n/g, ' | '));
    const addV = await blokToevoegen(R, wsA, 'Спроба глядача');
    const updV = await hubApi(R, `/api/blocks/${encodeURIComponent(blokRId)}/update`, { title: 'Змінено глядачем' });
    const updA = await hubApi(R, `/api/blocks/${encodeURIComponent(blokAId)}/update`, { title: 'Змінено глядачем' });
    check('A4 одержувач (Перегляд): прямі запити до сервера відмовлено — додати 403, змінити свій колишній блок 403, блок власника 403',
      addV.status === 403 && updV.status === 403 && updA.status === 403, `${addV.status} ${updV.status} ${updA.status}`);
    const blokRNa = (await pool.query("select data->>'ownerUserId' o, data->>'title' t from app.records where tbl='workspace_blocks' and id=$1", [blokRId])).rows[0] as { o: string; t: string } | undefined;
    check('A4 стан: блок, доданий одержувачем, перейшов власнику простору й не змінився', blokRNa?.o === aId && blokRNa?.t === 'Блок отримувачки', JSON.stringify(blokRNa));
    await foto(rP, 'a-ontvanger-kijker-telefoon');
    await rP.setViewportSize({ width: 1280, height: 860 });
    await rP.goto(`${ID}/widgets?lang=uk`, { waitUntil: 'networkidle' });
    await openBlok(rP, '[data-widget-annuleren]').catch(() => undefined);
    const wKeuzeV = rP.locator('form.settings-form').filter({ has: rP.locator('[data-widget-annuleren]') }).locator('select').first();
    check('A4 одержувач (Перегляд, центр «Віджети»): спільного простору у виборі для нового блоку більше немає, вибрано власний',
      (await wKeuzeV.locator(`option[value="${wsA}"]`).count()) === 0 && (await wKeuzeV.inputValue().catch(() => '')) !== wsA && !!(await wKeuzeV.inputValue().catch(() => '')), await wKeuzeV.innerText().catch(() => ''));
    await rP.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
    const belR2 = await bel(rP, /Вашу роль у спільному просторі змінено/), mR2 = await meldingTekst(rId, 'workspace_role_changed');
    check('A4 одержувач: у центрі сповіщень — «Вашу роль у спільному просторі змінено»; зміст: «Редагування» → «Перегляд», редагування вимкнено',
      /Вашу роль у спільному просторі змінено/.test(belR2) && /«Редагування» → «Перегляд»/.test(mR2) && /лише переглядати простір; редагування вимкнено/.test(mR2), `${belR2.slice(0, 300)} || ${mR2.slice(0, 200)}`);
    await foto(rP, 'a-ontvanger-melding-rol-computer');
    await sluitBel(rP);

    // ---------------------------------------------------------------- A5. відкликання доступу
    await aP.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
    await rijR.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
    await rijR.getByRole('button', { name: 'Відкликати', exact: true }).click();
    const dlgWeg = aP.locator('[data-bevestig="deel-intrekken"]');
    await dlgWeg.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    check('A5 власник: вікно «Відкликати доступ?» з наслідками (блоки переходять власнику)', /Відкликати доступ\?/.test(await dlgWeg.innerText().catch(() => '')) && /переходять власнику/.test(await dlgWeg.innerText().catch(() => '')));
    const antwWeg = aP.waitForResponse((r) => r.url().endsWith('/api/share/revoke'));
    await dlgWeg.locator('.bevestig-dialoog-ja').click();
    const rWeg = await antwWeg;
    await aP.waitForTimeout(600);
    check('A5 власник: відкликано (200), рядка одержувача в «Хто має доступ» немає; на сервері запису немає', rWeg.status() === 200 && (await rijR.count()) === 0 && !(await lidRij(wsA, rId)), String(rWeg.status()));
    await foto(aP, 'a-ingetrokken-computer');
    // Після відкликання hub ще раз пробує запам'ятований простір (останній відкритий) — сервер чесно відмовляє 403, hub переходить
    // до власного простору. Це очікувана відмова (а не вада); людина бачить пояснення нижче.
    rVerwacht.push(/\/api\/workspace\/load$/);
    let laad403 = 0; rP.on('response', (q) => { if (q.url().endsWith('/api/workspace/load') && q.status() === 403) laad403++; });
    await hubOpen(rP, wsA, blokAId);
    await rP.waitForTimeout(1500);
    const uitlegWeg = await tekstOp(rP, /Цей простір вам недоступний: доступ до нього відкликали або ви з нього вийшли/);
    check('A5 одержувач відкриває давнє посилання «Відкрити в просторі»: пояснення «Цей простір вам недоступний…» (раніше — мовчки власний простір)', uitlegWeg, `403 на завантаження: ${laad403}`);
    const rOpties = await ledenVanHub(rP);
    const laadW = await hubApi(R, '/api/workspace/load', { workspaceId: wsA });
    check('A5 одержувач після оновлення: простору немає, блоку власника не видно, прямий запит — 403',
      !rOpties.includes(wsA) && (await blokBijR.count()) === 0 && laadW.status === 403, `${rOpties.length} ${await blokBijR.count()} ${laadW.status}`);
    await foto(rP, 'a-ontvanger-ingetrokken-computer');
    await rP.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
    check('A5 одержувач (центр): простору більше немає у виборі', (await rP.locator(`#delen-uitnodigen select option[value="${wsA}"]`).count()) === 0);
    const belR3 = await bel(rP, /Ваш доступ до спільного простору відкликано/), mR3 = await meldingTekst(rId, 'workspace_access_revoked');
    check('A5 одержувач: у центрі сповіщень — «Ваш доступ до спільного простору відкликано»; зміст: хто й який простір',
      /Ваш доступ до спільного простору відкликано/.test(belR3) && mR3.includes(`відкликає ваш доступ до простору «${naamA}»`), `${belR3.slice(0, 300)} || ${mR3.slice(0, 200)}`);
    await foto(rP, 'a-ontvanger-melding-ingetrokken-computer');
    await sluit(rCtx);

    // ---------------------------------------------------------------- A6. «Вийти з простору» одержувачем за посиланням
    await hubOpen(kP, wsA, blokAId);
    await kP.mouse.move(900, 600); await kP.waitForTimeout(800);
    const kMenu = kP.locator('.hub-sectie-menu-knop').first();
    await kMenu.focus(); await kP.keyboard.press('Enter');
    await kP.locator('[data-hub-share-action]').waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    await kP.locator('[data-hub-share-action]').focus(); await kP.keyboard.press('Enter');
    const eigenK = kP.locator('[data-delen-vertrekken]');
    await eigenK.waitFor({ state: 'visible', timeout: 15000 }).catch(() => undefined);
    await eigenK.click();
    const dlgK = kP.locator('[data-bevestig="deel-vertrekken"]');
    await dlgK.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    const herladenK = kP.waitForEvent('load', { timeout: 15000 }).then(() => true).catch(() => false);
    await dlgK.locator('.bevestig-dialoog-ja').click();
    const isHerladenK = await herladenK;
    // підсумок — спливне повідомлення, яке саме зникає через кілька секунд; чекаємо його одразу після перезавантаження, а не після
    // networkidle (повільне завантаження hub інколи тривало довше за показ — так перевірка «плавала»)
    const zichtK = await tekstOp(kP, /Ви вийшли з простору/, 15000);
    await kP.waitForLoadState('networkidle').catch(() => undefined);
    check('A6 одержувач за посиланням: «Вийти з простору» → сторінка перезавантажується, підсумок «Ви вийшли з простору» видно', isHerladenK && zichtK, `herladen=${isHerladenK} zichtbaar=${zichtK} url=${kP.url()}`);
    const kOptiesNa = await ledenVanHub(kP);
    check('A6 одержувач: простору у виборі немає; сервер — 403', !kOptiesNa.includes(wsA) && (await hubApi(K, '/api/workspace/load', { workspaceId: wsA })).status === 403 && !(await lidRij(wsA, kId)));
    await foto(kP, 'a-vertrokken-computer');
    await sluit(kCtx);
    await new Promise((r) => setTimeout(r, 400));
    await aP.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
    const ledenA = await aP.locator('#delen-leden').innerText().catch(() => '');
    check('A6 власник: у «Хто має доступ» нікого з двох одержувачів', !ledenA.includes(rEmail) && !ledenA.includes(K.email), ledenA.slice(0, 300));
    const belA2 = await bel(aP, /Учасник вийшов зі спільного простору/), mA2 = await meldingTekst(aId, 'workspace_member_left'), mA3 = await meldingTekst(aId, 'workspace_share_link_revoked');
    check('A6 власник: у центрі сповіщень — «Учасник вийшов зі спільного простору» і «Посилання-запрошення відкликано»; зміст: хто вийшов, що відкликали ви',
      /Учасник вийшов зі спільного простору/.test(belA2) && /Посилання-запрошення відкликано/.test(belA2) && mA2.includes(`Глядачка Посилання виходить із простору «${naamA}»`) && /^Ви відкликали посилання-запрошення/.test(mA3),
      `${belA2.slice(0, 400)} || ${mA2.slice(0, 120)} || ${mA3.slice(0, 80)}`);
    await foto(aP, 'a-eigenaar-meldingen-computer');
    await sluitBel(aP);
    await aP.setViewportSize({ width: 380, height: 800 });
    await aP.goto(`${ID}/sharing?lang=uk`, { waitUntil: 'networkidle' });
    check('A6 власник (телефон 380): сторінка «Спільний доступ» без горизонтальної прокрутки', (await horizontaal(aP)) <= 0, String(await horizontaal(aP)));
    await foto(aP, 'a-eigenaar-telefoon');
    await sluit(aCtx);
  }

  try {
    if (DEEL !== 'b') await acceptatie();
    if (DEEL !== 'a') {
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
    }
    check('без помилок у консолі й HTTP (окрім очікуваних відмов: SHARE_LINK_USED, прострочене й відкликане посилання)', fouten.length === 0, fouten.slice(0, 6).join(' | '));
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
