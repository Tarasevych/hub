// E2E menu v2, fase 2: indeling en dock. Bewerkmodus (✎) met slepen (muis; lang indrukken op aanraken), toetsenbord (Alt+pijltjes,
// actiemenu), verplaatsen tussen plaatsen/secties, dupliceren (kopie houdt de kleur van het herkomst-onderdeel), per item terugzetten
// (override + alle kopieën weg), alles terugzetten, melding met «Скасувати» (ongedaan maken). Positie links/rechts/boven/onder via
// Налаштування → Меню, dock met transparantie en vergroting (niet bij «minder beweging»), mobiel blijft lade. Alles wordt op de
// server bewaard. ALLEEN de lokale server: Chrome via chromeArgs() (alles behalve *.tarasevych.com → ~NOTFOUND), geen Node-verzoeken
// naar buiten (scripts/e2e-lokaal.mjs blokkeert dat). Screenshots menu-40…
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { ACCENT_KLEUREN, DIENST_ACCENT } from '../../shared/menu-model';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const HOSTS = ['id', 'mcp', 'mail', 'hub', 'admin', 'cloud', 'ai'].map((h) => `https://${h}.tarasevych.com`);
const ID = 'https://id.tarasevych.com', HUB = 'https://hub.tarasevych.com/?lang=uk';
const SESSIES = `${ID}/sessions?lang=uk`, MENU = `${ID}/menu?lang=uk#menu-indeling`;
const VERWACHT = [/^403 .*\/api\/owner\/agents\/activity$/];
const hex2rgb = (h: string) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
type Dock = { positie: 'links' | 'rechts' | 'boven' | 'onder'; transparantie: number; vergroting: boolean };

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e menu-v2 indeling');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-mi-${T}@example.test`, sub = `sub-e2e-mi-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  let uid = '';
  try {
    const leeg = (dock: Partial<Dock> = {}, extra: Record<string, unknown> = {}) => ({ versie: 1, modus: 'open', icoonStijl: 'kleur', dock: { positie: 'links', transparantie: 0, vergroting: false, ...dock }, items: {}, kopieen: [], ...extra });
    const sessie = async (o: { url: string; zijbalk?: Record<string, unknown>; scheme?: 'light' | 'dark'; minderBeweging?: boolean; mobiel?: boolean; viewport?: { width: number; height: number } }) => {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login' });
      // De servervoorkeur wint: per situatie op de (lokale) server zetten — via de backend in dit proces, niet via het netwerk.
      const z = o.zijbalk || leeg();
      const opgeslagen = await b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar/save', b.ctxBody('identity', { sidebar: z }));
      if (opgeslagen.status !== 200) throw new Error(`sidebar/save ${opgeslagen.status}`);
      const ctx = await browser.newContext({ colorScheme: o.scheme || 'light', reducedMotion: o.minderBeweging ? 'reduce' : 'no-preference', locale: 'uk-UA', viewport: o.viewport || (o.mobiel ? { width: 390, height: 844 } : { width: 1280, height: 800 }), hasTouch: !!o.mobiel, isMobile: !!o.mobiel, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript(([tb, v]) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', tb); if (!sessionStorage.getItem('e2e-gezaaid')) { localStorage.setItem('tsv-zijbalk-v2', v); sessionStorage.setItem('e2e-gezaaid', '1'); } }, [tab, JSON.stringify(z)] as const);
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });
      // Extra zekerheid: elk verzoek van de pagina moet naar *.tarasevych.com (= lokale server via chromeArgs) of data:/blob: gaan.
      page.on('request', (q) => { const u = new URL(q.url()); if (!/^(data|blob):$/.test(u.protocol) && !/(^|\.)tarasevych\.com$/.test(u.hostname)) fouten.push(`extern verzoek: ${q.url()}`); });
      await page.goto(o.url, { waitUntil: 'networkidle' });
      await page.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 });
      await page.waitForTimeout(700);
      return { ctx, page };
    };
    const knop = (sl: string) => `.canonical-sidebar :is(button[data-menu-sleutel="${sl}"], [data-menu-sleutel="${sl}"] > .canonical-service-main-row > .canonical-service-button)`;
    const lijst = (page: Page, l: string) => page.evaluate((l2) => Array.from(document.querySelector(`[data-menu-lijst="${l2}"]`)?.querySelectorAll<HTMLElement>(':scope > [data-menu-sleutel]') || []).map((e) => e.dataset.menuSleutel!), l);
    const server = async () => (await pool.query("select data->'sidebar' as s from app.records where tbl='owner_ui_preferences_v1' and data->>'userId'=$1 order by (data->>'updatedAt')::bigint desc limit 1", [uid])).rows[0]?.s as { items: Record<string, { plaats?: string; ouder?: string; volgorde?: number }>; kopieen: Array<{ id: string; item: string; plaats: string; ouder?: string }>; dock: Dock } | undefined;
    const wachtServer = async (ok: (s: NonNullable<Awaited<ReturnType<typeof server>>>) => boolean) => { for (let i = 0; i < 30; i++) { const s = await server(); if (s && ok(s)) return s; await new Promise((r) => setTimeout(r, 200)); } return server(); };
    const sleepMuis = async (page: Page, van: string, naar: string, o: { kopie?: boolean; deel?: number; foto?: string } = {}) => {
      await page.locator(van).first().scrollIntoViewIfNeeded();
      const a = (await page.locator(van).first().boundingBox())!, b = (await page.locator(naar).first().boundingBox())!;
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      if (process.env.E2E_DEBUG) console.log('[debug] start', van, JSON.stringify(a), await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return `${e?.tagName}.${e?.className} ${e?.closest('[data-menu-sleutel]')?.getAttribute('data-menu-sleutel')}`; }, [a.x + a.width / 2, a.y + a.height / 2]));
      await page.mouse.down();
      if (o.kopie) await page.keyboard.down('Control');
      const tx = b.x + b.width / 2, ty = b.y + b.height * (o.deel ?? 0.25);
      for (let i = 1; i <= 12; i++) { await page.mouse.move(a.x + a.width / 2 + ((tx - a.x - a.width / 2) * i) / 12, a.y + a.height / 2 + ((ty - a.y - a.height / 2) * i) / 12); await page.waitForTimeout(16); }
      await page.waitForTimeout(120);
      if (o.foto) await page.screenshot({ path: `${UIT}/${o.foto}` });
      const tijdens = await page.evaluate(() => ({ geest: !!document.querySelector('.menu-sleep-geest'), kopie: document.querySelector<HTMLElement>('.menu-sleep-geest')?.dataset.kopie, lijn: document.querySelector<HTMLElement>('.menu-sleep-lijn')?.dataset.zichtbaar }));
      await page.mouse.up();
      if (o.kopie) await page.keyboard.up('Control');
      await page.waitForTimeout(250);
      return tijdens;
    };
    const ongedaanToast = (page: Page) => page.locator('.canonical-notification-action-icon').first();

    // ---- eigenaar aanmelden
    await G.browser().aanmelden(sub, eigenaar, { service: 'identity', intent: 'login' });
    uid = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id as string;
    check('eigenaar bestaat', !!uid);

    // ================================================================ 1. bewerkmodus (links, breed), slepen met de muis
    const A = await sessie({ url: SESSIES, viewport: { width: 1280, height: 1100 } });
    const standaard = await lijst(A.page, 'zijbalk|');
    check('standaard: hoofdmenu met diensten, geen snelbalk buiten de bewerkmodus', standaard.length >= 4 && standaard.every((s) => s.startsWith('svc:')) && (await A.page.locator('.menu-snelbalk').count()) === 0, standaard.join(','));
    await A.page.locator('.zijbalk-werkbalk [data-menu-venster-knop]').click();
    await A.page.locator('[data-menu-instellingen-venster] [data-menu-bewerken-knop]').click();
    await A.page.locator('[data-menu-bewerkbalk]').waitFor({ timeout: 5000 });
    check('✎: bewerkmodus aan (balk met uitleg, ongedaan, alles terug, klaar; lege snelbalk als doel)', (await A.page.locator('main[data-menu-bewerken="ja"]').count()) === 1 && await A.page.locator('[data-menu-bewerkbalk] [data-menu-ongedaan]').isVisible() && await A.page.locator('[data-menu-bewerkbalk] [data-menu-alles-terug]').isVisible() && await A.page.locator('[data-menu-bewerken-klaar]').isVisible() && await A.page.locator('.menu-snelbalk .menu-leeg').isVisible());
    await A.page.screenshot({ path: `${UIT}/menu-40-bewerkmodus-links.png` });
    const [eerste, tweede, derde] = standaard;
    const t1 = await sleepMuis(A.page, knop(derde), knop(eerste), { foto: 'menu-41-slepen-muis.png' });
    check('slepen: geest + invoeglijn tijdens het slepen', t1.geest && t1.lijn === 'ja', JSON.stringify(t1));
    const naSlepen = await lijst(A.page, 'zijbalk|');
    check(`slepen: ${derde} staat nu bovenaan`, naSlepen[0] === derde && naSlepen[1] === eerste && naSlepen[2] === tweede, naSlepen.join(','));
    const s1 = await wachtServer((s) => Object.keys(s.items).length > 0);
    check('slepen: volgorde op de server bewaard', !!s1 && (s1.items[derde]?.volgorde ?? 99) < (s1.items[eerste]?.volgorde ?? -1), JSON.stringify(s1?.items));
    check('melding met «Скасувати» (ongedaan maken) verschijnt', await ongedaanToast(A.page).isVisible().catch(() => false));
    await A.page.screenshot({ path: `${UIT}/menu-42-melding-ongedaan.png` });
    await ongedaanToast(A.page).click();
    await A.page.waitForTimeout(400);
    check('«Скасувати»: oude volgorde terug', (await lijst(A.page, 'zijbalk|')).join() === standaard.join(), (await lijst(A.page, 'zijbalk|')).join());
    // klik in de bewerkmodus = actiemenu (geen navigatie)
    const urlVoor = A.page.url();
    await A.page.locator(knop(tweede)).click();
    await A.page.locator('.menu-acties[data-menu-acties="acties"]').waitFor({ timeout: 3000 });
    check('klik in bewerkmodus opent het actiemenu, geen navigatie', A.page.url() === urlVoor && await A.page.locator('.menu-acties [data-menu-actie="verplaats"]').isVisible());
    await A.page.screenshot({ path: `${UIT}/menu-43-actiemenu.png` });
    await A.page.keyboard.press('Escape');
    await A.page.waitForTimeout(200);
    check('Esc sluit het actiemenu (bewerkmodus blijft aan), focus terug op het item', (await A.page.locator('.menu-acties').count()) === 0 && (await A.page.locator('main').getAttribute('data-menu-bewerken')) === 'ja' && await A.page.evaluate((sl) => !!document.activeElement?.closest(`[data-menu-sleutel="${sl}"]`), tweede));

    // ---- Ctrl+slepen = kopie: pagina «Акаунт» (Налаштування) naar Швидкий доступ, houdt de identity-kleur
    const acc = 'pg:identity/account';
    const heeftAcc = await A.page.locator(knop(acc)).count();
    check('sectie Налаштування toont «Акаунт» als sleepbaar item', heeftAcc > 0 && await A.page.locator(knop(acc)).first().isVisible(), String(heeftAcc));
    const t2 = await sleepMuis(A.page, knop(acc), '.menu-snelbalk', { kopie: true, deel: 0.6 });
    check('Ctrl tijdens slepen: geest toont «+» (kopie)', t2.kopie === 'ja', JSON.stringify(t2));
    const snel = await lijst(A.page, 'snelbalk|');
    const kopieSl = snel.find((s) => s.endsWith(`:${acc}`) && s !== acc) || '';
    check('kopie staat in Швидкий доступ, origineel blijft in de sectie', !!kopieSl && (await A.page.locator(`[data-menu-lijst="zijbalk|svc:identity"] [data-menu-sleutel="${acc}"]`).count()) === 1, snel.join(','));
    const kopieKleur = await A.page.locator(`[data-menu-sleutel="${kopieSl}"]`).evaluate((el) => ({ acc: (el as HTMLElement).dataset.accent, kleur: getComputedStyle(el.querySelector('svg')!).color }));
    const idAccent = DIENST_ACCENT.identity;
    check('kopie houdt de kleur van het herkomst-onderdeel (Налаштування)', kopieKleur.acc === idAccent && kopieKleur.kleur === hex2rgb(ACCENT_KLEUREN[idAccent].licht.hoofd), JSON.stringify(kopieKleur));
    check('kopie: herkomst-label «Налаштування» zichtbaar', /Налаштування/.test(await A.page.locator(`[data-menu-sleutel="${kopieSl}"] .menu-herkomst`).innerText().catch(() => '')));
    const s2 = await wachtServer((s) => s.kopieen.length === 1);
    check('kopie op de server bewaard (plaats snelbalk)', s2?.kopieen.length === 1 && s2.kopieen[0].item === acc && s2.kopieen[0].plaats === 'snelbalk', JSON.stringify(s2?.kopieen));
    await A.page.screenshot({ path: `${UIT}/menu-44-kopie-snelbalk.png` });

    // ---- toetsenbord: Alt+↓ en actiemenu «Перемістити до…»
    await A.page.locator(knop(eerste)).focus();
    await A.page.keyboard.press('Alt+ArrowDown');
    await A.page.waitForTimeout(300);
    const naAlt = await lijst(A.page, 'zijbalk|');
    check('Alt+↓ verplaatst het item één plek omlaag, focus blijft erop', naAlt[1] === eerste && await A.page.evaluate((sl) => !!document.activeElement?.closest(`[data-menu-sleutel="${sl}"]`), eerste), naAlt.join(','));
    const status = await A.page.locator('[data-menu-status]').innerText();
    check('schermlezer-status meldt de nieuwe positie', /позиція 2/.test(status), status);
    await A.page.keyboard.press('Control+z'); await A.page.waitForTimeout(300);
    check('Ctrl+Z: ongedaan', (await lijst(A.page, 'zijbalk|'))[0] === eerste);
    // dienst via actiemenu naar Швидкий доступ
    await A.page.locator(knop(tweede)).focus();
    await A.page.keyboard.press('Enter');
    await A.page.locator('.menu-acties').waitFor({ timeout: 3000 });
    await A.page.locator('[data-menu-actie="verplaats"]').focus(); await A.page.keyboard.press('Enter');
    await A.page.locator('.menu-acties[data-menu-acties="verplaats"]').waitFor({ timeout: 3000 });
    const doelen = await A.page.locator('.menu-acties [data-menu-actie]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.menuActie));
    check('dienst: doelen alleen bovenste niveau (geen sectie)', doelen.includes('snelbalk|') && !doelen.some((d) => /\|svc:/.test(d || '')), doelen.join(','));
    await A.page.locator('[data-menu-actie="snelbalk|"]').focus(); await A.page.keyboard.press('Enter');
    await A.page.waitForTimeout(300);
    check('actiemenu: dienst verplaatst naar Швидкий доступ', (await lijst(A.page, 'snelbalk|')).includes(tweede) && !(await lijst(A.page, 'zijbalk|')).includes(tweede));
    // pagina via actiemenu naar een andere sectie (verplaatsen)
    const pgSessies = 'pg:identity/sessions';
    if (await A.page.locator(knop(pgSessies)).count()) {
      await A.page.locator(knop(pgSessies)).click();
      await A.page.locator('[data-menu-actie="verplaats"]').click();
      const sectieDoel = A.page.locator('.menu-acties [data-menu-actie^="zijbalk|svc:"]:not([data-menu-actie="zijbalk|svc:identity"])').first();
      const doelNaam = await sectieDoel.getAttribute('data-menu-actie');
      await sectieDoel.click(); await A.page.waitForTimeout(400);
      const s3 = await wachtServer((s) => !!s.items[pgSessies]?.ouder);
      check(`pagina naar andere sectie (${doelNaam}): bewaard met plaats/ouder`, s3?.items[pgSessies]?.ouder === doelNaam?.split('|')[1], JSON.stringify(s3?.items[pgSessies]));
    } else check('pagina «Сесії» in de sectie', false);
    await A.page.screenshot({ path: `${UIT}/menu-45-na-verplaatsen.png` });
    // klaar
    await A.page.locator('[data-menu-bewerken-klaar]').click();
    await A.page.waitForTimeout(300);
    check('«Готово»: bewerkmodus uit, snelbalk blijft zichtbaar met inhoud', (await A.page.locator('main[data-menu-bewerken="nee"]').count()) === 1 && (await A.page.locator('.menu-snelbalk').isVisible()));
    await A.page.screenshot({ path: `${UIT}/menu-46-snelbalk-normaal.png` });
    await A.ctx.close();

    // ================================================================ 2. Налаштування → Меню: per item terugzetten, alles terugzetten, positie
    const M = await sessie({ url: MENU, zijbalk: (await server()) as unknown as Record<string, unknown> });
    await M.page.locator('[data-menu-indeling-instellingen]').waitFor({ timeout: 10000 });
    await M.page.locator('[data-menu-indeling-instellingen]').scrollIntoViewIfNeeded();
    const aangepast = await M.page.locator('[data-menu-item-terug]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.menuItemTerug));
    check('instellingen: lijst met aangepaste items (incl. «Акаунт» met kopie)', aangepast.includes(acc) && aangepast.includes(tweede), aangepast.join(','));
    await M.page.screenshot({ path: `${UIT}/menu-47-instellingen-menu.png`, fullPage: false });
    await M.page.locator(`[data-menu-item-terug="${acc}"]`).click();
    const s4 = await wachtServer((s) => s.kopieen.length === 0);
    check('per item terugzetten: override + alle kopieën weg', s4?.kopieen.length === 0 && !s4?.items[acc], JSON.stringify(s4));
    check('per item terugzetten: melding met «Скасувати»', await ongedaanToast(M.page).isVisible().catch(() => false));
    await M.page.locator('.menu-indeling-acties [data-menu-alles-terug], [data-menu-indeling-instellingen] [data-menu-alles-terug]').first().click();
    const s5 = await wachtServer((s) => Object.keys(s.items).length === 0 && s.kopieen.length === 0);
    check('alles terugzetten: geen overrides of kopieën meer', !!s5 && Object.keys(s5.items).length === 0 && s5.kopieen.length === 0, JSON.stringify(s5));
    await ongedaanToast(M.page).click(); 
    const s6 = await wachtServer((s) => Object.keys(s.items).length > 0);
    check('alles terugzetten → «Скасувати»: indeling terug', !!s6 && Object.keys(s6.items).length > 0, JSON.stringify(s6?.items));
    await M.page.locator('[data-menu-indeling-instellingen] [data-menu-alles-terug]').first().click();
    await wachtServer((s) => Object.keys(s.items).length === 0);
    // positie rechts
    check('transparantie-schuif uit bij een verticaal menu', await M.page.locator('[data-dock-transparantie]').isDisabled());
    await M.page.locator('[data-dock-positie="rechts"]').click();
    await M.page.waitForTimeout(500);
    const rechts = await M.page.evaluate(() => { const s = document.querySelector('.canonical-sidebar')!.getBoundingClientRect(); return { dock: document.querySelector('main')!.dataset.dock, rechts: Math.round(s.right), links: Math.round(s.left), vw: innerWidth }; });
    check('rechts: menu tegen de rechterrand', rechts.dock === 'rechts' && rechts.rechts === rechts.vw && rechts.links > rechts.vw / 2, JSON.stringify(rechts));
    await M.page.screenshot({ path: `${UIT}/menu-48-positie-rechts.png` });
    // onder + transparantie + vergroting
    await M.page.locator('[data-dock-positie="onder"]').click();
    await M.page.waitForTimeout(500);
    const schuif = M.page.locator('[data-dock-transparantie]');
    check('transparantie-schuif actief bij een dock', !(await schuif.isDisabled()));
    await schuif.focus(); for (let i = 0; i < 12; i++) await M.page.keyboard.press('ArrowRight');
    await M.page.waitForTimeout(300);
    const vergrSchakel = M.page.locator('[data-meld-schakel="vergroting"] input');
    if (!(await vergrSchakel.isChecked())) await M.page.locator('[data-meld-schakel="vergroting"]').click();
    const s7 = await wachtServer((s) => s.dock.positie === 'onder' && s.dock.transparantie === 60 && s.dock.vergroting);
    check('dock onder, transparantie 60 (max), vergroting aan: op de server', s7?.dock.positie === 'onder' && s7.dock.transparantie === 60 && s7.dock.vergroting === true, JSON.stringify(s7?.dock));
    const dock = await M.page.evaluate(() => { const s = document.querySelector<HTMLElement>('.canonical-sidebar')!, r = s.getBoundingClientRect(), m = document.querySelector('main')!; return { dock: m.dataset.dock, dekking: m.style.getPropertyValue('--dock-dekking'), bg: getComputedStyle(s).backgroundColor, onder: Math.round(innerHeight - r.bottom), midden: Math.round(r.left + r.width / 2 - innerWidth / 2), h: Math.round(r.height) }; });
    check('onder: zwevend dock gecentreerd onderaan, 40 % dekkend', dock.dock === 'onder' && dock.dekking === '40%' && dock.onder >= 0 && dock.onder < 30 && Math.abs(dock.midden) <= 2 && dock.h < 90 && /rgba?\(.*0\.4\)|oklab|color\(/.test(dock.bg), JSON.stringify(dock));
    await M.page.screenshot({ path: `${UIT}/menu-49-dock-onder-transparant.png` });
    await M.ctx.close();

    // ================================================================ 3. dock onder op de hub: vergroting, sectiepaneel, startpagina
    const D = await sessie({ url: HUB, zijbalk: leeg({ positie: 'onder', transparantie: 30, vergroting: true }) });
    const hubKnop = knop('svc:identity');
    const kb = (await D.page.locator(hubKnop).boundingBox())!;
    await D.page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2); await D.page.waitForTimeout(350);
    const schaal = await D.page.locator(hubKnop).evaluate((el) => ({ s: getComputedStyle(el).getPropertyValue('--dock-schaal'), t: getComputedStyle(el).transform }));
    check('vergroting: icoon onder de muis groter', parseFloat(schaal.s) > 1.3 && schaal.t !== 'none', JSON.stringify(schaal));
    await D.page.screenshot({ path: `${UIT}/menu-50-dock-vergroting.png` });
    await D.page.mouse.move(640, 300); await D.page.waitForTimeout(300);
    check('vergroting: weg als de muis het dock verlaat', await D.page.locator(hubKnop).evaluate((el) => getComputedStyle(el).transform === 'none' || getComputedStyle(el).transform === 'matrix(1, 0, 0, 1, 0, 0)'));
    await D.page.locator(knop('svc:hub')).click();
    await D.page.locator('[data-dock-paneel="hub"]').waitFor({ timeout: 4000 });
    const paneel = await D.page.evaluate(() => { const p = document.querySelector('[data-dock-paneel]')!.getBoundingClientRect(), s = document.querySelector('.canonical-sidebar')!.getBoundingClientRect(); return { boven: p.bottom <= s.top, n: document.querySelectorAll('[data-dock-paneel] .canonical-local-page-button').length, labels: Array.from(document.querySelectorAll<HTMLElement>('[data-dock-paneel] .canonical-local-label')).every((l) => l.offsetWidth > 0 && getComputedStyle(l).visibility === 'visible' && getComputedStyle(l).opacity === '1'), dbg: (() => { const l = document.querySelector<HTMLElement>('[data-dock-paneel] .canonical-local-label'); if (!l) return 'geen'; const c = getComputedStyle(l); return `${l.textContent}|${c.display}|${c.visibility}|${c.opacity}|${l.offsetWidth}|${l.parentElement?.className}`; })() }; });
    check('dock: klik op het actieve onderdeel (Мій простір) opent het paneel met pagina\'s boven het dock (met labels)', paneel.boven && paneel.n >= 3 && paneel.labels, JSON.stringify(paneel));
    await D.page.screenshot({ path: `${UIT}/menu-51-dock-paneel.png` });
    await D.page.keyboard.press('Escape'); await D.page.waitForTimeout(200);
    check('Esc sluit het dockpaneel', (await D.page.locator('[data-dock-paneel]').count()) === 0);
    // startpagina: dupliceren via het actiemenu (ook in het dock)
    await D.page.locator('.zijbalk-werkbalk.dock [data-menu-venster-knop]').click();
    await D.page.locator('[data-menu-instellingen-venster] [data-menu-bewerken-knop]').click();
    await D.page.locator('[data-menu-bewerkbalk]').waitFor({ timeout: 4000 });
    check('dock onder: bewerkbalk zwevend bovenaan (vrij van dock en meldingen)', await D.page.evaluate(() => { const b = document.querySelector('[data-menu-bewerkbalk]')!.getBoundingClientRect(), s = document.querySelector('.canonical-sidebar')!.getBoundingClientRect(); return b.top < 40 && b.bottom < s.top; }));
    await D.page.locator(knop('svc:mail')).click();
    await D.page.locator('[data-menu-actie="kopie"]').click();
    await D.page.locator('[data-menu-actie="start|"]').click();
    await D.page.waitForTimeout(400);
    const tegels = await D.page.locator('.menu-start .menu-start-tegel').count();
    check('dupliceren naar startpagina: tegel «Пошта» op Огляд', tegels === 1 && /Пошта/.test(await D.page.locator('.menu-start').innerText()));
    // horizontaal slepen in het dock: mail-kopie? → verplaats hub naar het eind
    const dockVoor = await lijst(D.page, 'zijbalk|');
    await sleepMuis(D.page, knop(dockVoor[0]), knop(dockVoor[dockVoor.length - 1]), { deel: 0.5 });
    // in horizontale lijsten telt x: neerzetten rechts van het midden = erna
    const dockNa = await lijst(D.page, 'zijbalk|');
    check('dock: horizontaal slepen verandert de volgorde', dockNa.join() !== dockVoor.join() && dockNa.indexOf(dockVoor[0]) > 0, `${dockVoor.join(',')} → ${dockNa.join(',')}`);
    await D.page.screenshot({ path: `${UIT}/menu-52-dock-bewerken-start.png` });
    await D.page.locator('[data-menu-bewerkbalk] [data-menu-alles-terug]').click();
    await wachtServer((s) => Object.keys(s.items).length === 0 && s.kopieen.length === 0);
    await D.page.waitForTimeout(300);
    check('alles terug (dock): tegels weg, standaardvolgorde, dock links', (await D.page.locator('.menu-start-tegel').count()) === 0 && (await D.page.locator('main').getAttribute('data-dock')) === 'links');
    await D.ctx.close();

    // ---- dock op Пошта: eigen navigatie van mail in het paneel, met labels
    const DM = await sessie({ url: 'https://mail.tarasevych.com/?lang=uk', zijbalk: leeg({ positie: 'onder', transparantie: 0, vergroting: false }) });
    await DM.page.locator(knop('svc:mail')).click();
    const mailPaneel = await DM.page.locator('[data-dock-paneel="mail"]').waitFor({ timeout: 4000 }).then(() => true, () => false);
    check('dock op Пошта: klik opent de mailnavigatie in het paneel', mailPaneel);
    await DM.page.waitForTimeout(250);
    await DM.page.screenshot({ path: `${UIT}/menu-56-dock-onder-mail.png` });
    await DM.ctx.close();

    // ================================================================ 4. boven, donker; «minder beweging» = geen vergroting
    const B = await sessie({ url: SESSIES, scheme: 'dark', minderBeweging: true, zijbalk: leeg({ positie: 'boven', transparantie: 20, vergroting: true }) });
    const bovenInfo = await B.page.evaluate(() => { const s = document.querySelector('.canonical-sidebar')!.getBoundingClientRect(), w = document.querySelector('.canonical-workspace')!; return { top: Math.round(s.top), h: Math.round(s.height), pad: parseFloat(getComputedStyle(w).paddingTop) }; });
    check('boven: dock bovenaan, werkgebied schuift eronder', bovenInfo.top < 20 && bovenInfo.h < 90 && bovenInfo.pad >= bovenInfo.h, JSON.stringify(bovenInfo));
    const kb2 = (await B.page.locator(knop('svc:mail')).boundingBox())!;
    await B.page.mouse.move(kb2.x + kb2.width / 2, kb2.y + kb2.height / 2); await B.page.waitForTimeout(350);
    check('minder beweging: geen vergroting', await B.page.locator(knop('svc:mail')).evaluate((el) => getComputedStyle(el).transform === 'none' || getComputedStyle(el).transform === 'matrix(1, 0, 0, 1, 0, 0)'));
    await B.page.screenshot({ path: `${UIT}/menu-53-dock-boven-donker.png` });
    await B.ctx.close();

    // ================================================================ 5. mobiel (aanraken): lade blijft, lang indrukken = slepen
    const P = await sessie({ url: SESSIES, mobiel: true, zijbalk: leeg({ positie: 'onder', transparantie: 40, vergroting: true }) });
    check('mobiel: geen dock, maar de lade (positie onder wordt genegeerd)', (await P.page.locator('main').getAttribute('data-dock')) === 'links' && (await P.page.locator('[data-sidebar-action="open-drawer"]').count()) === 1);
    await P.page.locator('[data-sidebar-action="open-drawer"]').tap();
    await P.page.locator('.menu-lade-bewerken').waitFor({ timeout: 4000 });
    await P.page.locator('.menu-lade-bewerken').tap();
    await P.page.locator('[data-menu-bewerkbalk]').waitFor({ timeout: 4000 });
    const mVoor = await lijst(P.page, 'zijbalk|');
    const cdp = await P.ctx.newCDPSession(P.page);
    const a = (await P.page.locator(knop(mVoor[2])).boundingBox())!, b = (await P.page.locator(knop(mVoor[0])).boundingBox())!;
    const punt = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punt(a.x + 30, a.y + a.height / 2) });
    await P.page.waitForTimeout(150);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punt(a.x + 31, a.y + a.height / 2) });
    await P.page.waitForTimeout(100);
    const voorTijd = await P.page.evaluate(() => !!document.querySelector('.menu-sleep-geest'));
    await P.page.waitForTimeout(350);
    const naTijd = await P.page.evaluate(() => !!document.querySelector('.menu-sleep-geest'));
    await P.page.waitForTimeout(150);
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punt(a.x + 30, a.y + a.height / 2 + ((b.y + b.height * 0.2 - a.y - a.height / 2) * i) / 10) }); await P.page.waitForTimeout(20); }
    await P.page.waitForTimeout(100);
    const tijdensT = await P.page.evaluate(() => !!document.querySelector('.menu-sleep-geest'));
    await P.page.screenshot({ path: `${UIT}/menu-54-mobiel-lang-indrukken.png` });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await P.page.waitForTimeout(400);
    const mNa = await lijst(P.page, 'zijbalk|');
    check('aanraken: pas na lang indrukken (450 ms) begint het slepen', !voorTijd && naTijd && tijdensT, `${voorTijd} ${naTijd} ${tijdensT}`);
    check('aanraken: lang indrukken + slepen verplaatst het item', mNa[0] === mVoor[2], `${mVoor.join(',')} → ${mNa.join(',')}`);
    await P.page.screenshot({ path: `${UIT}/menu-55-mobiel-na-slepen.png` });
    await P.page.locator('.canonical-drawer-close').tap(); await P.page.waitForTimeout(400);
    check('lade dicht = bewerkmodus uit', (await P.page.locator('main').getAttribute('data-menu-bewerken')) === 'nee');
    await P.ctx.close();

    const relevant = fouten.filter((f) => !/ERR_ABORTED|net::ERR_FAILED/.test(f));
    check('geen consolefouten / onverwachte HTTP-fouten / externe verzoeken', relevant.length === 0, relevant.slice(0, 6).join(' | '));
  } finally {
    await browser.close().catch(() => undefined);
    // Opruimen op EXACT e-mailadres van deze run (nooit op patroon).
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = $1", [eigenaar]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await stop();
  }
  return einde();
}
