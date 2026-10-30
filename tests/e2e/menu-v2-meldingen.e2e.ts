// E2E menu v2, fase B2/B3: «levend» menu. Een goedgekeurde eigenaar met echte bel-meldingen (site_notifications) en een
// e-mailteller ziet badges op de juiste menu-items (pagina → ook hoofditem), bij aanwijzen «sms-bellen» met ×; × markeert een
// servermelding als gelezen in de database en de badge verdwijnt. ⚙ in de werkbalk opent Налаштування → Меню → «Сповіщення в
// меню»; een categorie of alles uitzetten verbergt de badges. Een niet-goedgekeurd account ziet niets. Screenshots menu-20…
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
const HOSTS = ['id', 'mcp', 'mail', 'hub', 'admin', 'cloud', 'ai'].map((h) => `https://${h}.tarasevych.com`);
const SESSIES = 'https://id.tarasevych.com/sessions?lang=uk', HUB = 'https://hub.tarasevych.com/?lang=uk';
const VERWACHT = [/^403 .*\/api\/owner\/agents\/activity$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e menu-v2 meldingen');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-mm-${T}@example.test`, sub = `sub-e2e-mm-${T}`, ander = `e2e-mm-ander-${T}@example.test`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  try {
    // ---- eigenaar aanmelden, meldingen + teller zaaien
    const eerst = G.browser();
    await eerst.aanmelden(sub, eigenaar, { service: 'mail', intent: 'login' });
    const uid = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id as string;
    check('eigenaar bestaat', !!uid);
    const nu = Date.now();
    const zaai = async (kind: string, title: string, message: string, op: number, link?: string) => (await pool.query("insert into app.records(tbl,data) values('site_notifications',$1::jsonb) returning id", [JSON.stringify({ recipientUserId: uid, recipientEmail: eigenaar, kind, title, message, read: false, createdAt: op, ...(link ? { link } : {}) })])).rows[0].id as string;
    const idToegang = await zaai('access_request', 'Новий запит на доступ', 'olena@example.test просить доступ до «Пошта».', nu - 60000, 'https://admin.tarasevych.com/access');
    const idConflict = await zaai('account_email_conflict', 'Перевірте адресу акаунта', 'Ця адреса вже використовується іншим входом.', nu - 30000);
    await zaai('workspace_share', 'Вам надали доступ до простору', 'Простір «Сім’я» тепер доступний.', nu - 120000);
    const t = await eerst.verzoek('mail.tarasevych.com', '/api/owner/menu/tellers/zet', eerst.ctxBody('mail', { bron: 'mail', ongelezen: 7 }));
    check('teller zaaien vanaf mail: 200', t.status === 200 && t.data.tellers?.mail?.ongelezen === 7, `${t.status} ${t.body.slice(0, 120)}`);

    const sessie = async (scheme: 'dark' | 'light', modus: 'open' | 'dicht', url: string, meldingen: Record<string, unknown> = {}, wie: { sub: string; email: string } = { sub, email: eigenaar }) => {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      await b.aanmelden(wie.sub, wie.email, { service: 'identity', tabContext: tab, intent: 'login' });
      const ctx = await browser.newContext({ colorScheme: scheme, locale: 'uk-UA', viewport: { width: 1280, height: 760 }, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      // Alleen bij de eerste keer zaaien; daarna wint wat de pagina zelf opslaat.
      await ctx.addInitScript(([tb, v]) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', tb); if (!sessionStorage.getItem('e2e-gezaaid')) { localStorage.setItem('tsv-zijbalk-v2', v); sessionStorage.setItem('e2e-gezaaid', '1'); } }, [tab, JSON.stringify({ versie: 1, modus, icoonStijl: 'kleur', dock: { positie: 'links', transparantie: 0, vergroting: false }, items: {}, kopieen: [], meldingen: { aan: true, stijl: 'getal', knipperen: true, herinneren: 0, bellen: true, ...meldingen } })] as const);
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 });
      await page.waitForTimeout(800);
      return { ctx, page };
    };
    const badges = (page: Page) => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll<HTMLElement>('[data-menu-badge]')).filter((b) => b.getBoundingClientRect().width > 0).map((b) => [b.dataset.menuBadge!, { tekst: (b.textContent || '').trim(), cat: b.dataset.categorie, w: b.offsetWidth, h: b.offsetHeight }])));
    const knopVan = (page: Page, item: string) => page.locator(`button:has(> .canonical-menu-icon-slot > [data-menu-badge="${item}"])`).first();

    // ---------------------------------------------------------------- 1. smal, licht: badges
    const A = await sessie('light', 'dicht', SESSIES);
    await A.page.locator('[data-menu-badge="svc:identity"]').waitFor({ timeout: 15000 });
    const bA = await badges(A.page);
    check('smal: badge op Налаштування (beveiliging, 1) en E-mail (post, 7)', bA['svc:identity']?.tekst === '1' && bA['svc:identity']?.cat === 'beveiliging' && bA['svc:mail']?.tekst === '7' && bA['svc:mail']?.cat === 'post', JSON.stringify(bA));
    check('smal: pagina-melding telt mee bij het hoofditem (Головна: delen)', bA['svc:hub']?.cat === 'delen', JSON.stringify(bA['svc:hub']));
    check('smal: identity-submenu toont de badge ook op «Акаунт»', bA['pg:identity/account']?.tekst === '1', JSON.stringify(Object.keys(bA)));
    const ariaId = await knopVan(A.page, 'svc:identity').getAttribute('aria-label');
    check('aria-label noemt alleen het aantal (geen inhoud)', /1 сповіщення/.test(ariaId || '') && !/адрес/i.test(ariaId || ''), String(ariaId));
    await A.page.screenshot({ path: `${UIT}/menu-20-smal-licht-badges.png` });

    // ---------------------------------------------------------------- 2. aanwijzen → bellen; × markeert gelezen
    await knopVan(A.page, 'svc:identity').hover();
    const bel = A.page.locator('[data-menu-bellen="svc:identity"]');
    await bel.waitFor({ timeout: 5000 });
    check('bellen: inhoud van de melding, als tekst', /Перевірте адресу акаунта/.test(await bel.innerText()));
    const tooltipZichtbaar = await A.page.locator('.canonical-viewport-tooltip').evaluateAll((els) => els.some((e) => (e as HTMLElement).offsetParent !== null && getComputedStyle(e).opacity !== '0' && (e.textContent || '').trim() !== ''));
    check('bellen vervangen de gewone tooltip (geen overlap)', !tooltipZichtbaar);
    await A.page.mouse.move(0, 0); await bel.hover(); // van knop naar bellen: blijft open
    await A.page.screenshot({ path: `${UIT}/menu-21-smal-licht-bellen.png` });
    await bel.locator(`[data-melding-id="${idConflict}"] .menu-bel-weg`).click();
    await A.page.waitForTimeout(900);
    const gelezen = (await pool.query("select data->>'read' as r from app.records where id=$1", [idConflict])).rows[0]?.r;
    check('× op servermelding: gelezen in de database', gelezen === 'true', String(gelezen));
    const naWeg = await badges(A.page);
    check('× : badge van Налаштування weg, rest blijft', !naWeg['svc:identity'] && naWeg['svc:mail']?.tekst === '7', JSON.stringify(naWeg));
    const ongemoeid = (await pool.query("select data->>'read' as r from app.records where id=$1", [idToegang])).rows[0]?.r;
    check('andere meldingen niet aangeraakt', ongemoeid === 'false', String(ongemoeid));
    // e-mailteller wegklikken: lokaal tot er meer is
    await knopVan(A.page, 'svc:mail').hover();
    const belMail = A.page.locator('[data-menu-bellen="svc:mail"]');
    await belMail.waitFor({ timeout: 5000 });
    check('bellen e-mail: «Непрочитані листи: 7»', /Непрочитані листи: 7/.test(await belMail.innerText()));
    await belMail.locator('[data-melding-id="teller:mail"] .menu-bel-weg').click();
    await A.page.waitForTimeout(400);
    check('× op teller: badge E-mail weg', !(await badges(A.page))['svc:mail']);
    await A.page.reload({ waitUntil: 'networkidle' }); await A.page.waitForTimeout(800);
    check('na herladen: weggeklikte teller blijft weg, gelezen melding ook', !(await badges(A.page))['svc:mail'] && !(await badges(A.page))['svc:identity']);
    // toetsenbord: focus + pijl rechts in de bellen, Esc terug
    const hubKnop = knopVan(A.page, 'svc:hub');
    await A.page.mouse.move(0, 0); await A.page.waitForTimeout(400);
    await hubKnop.focus(); await A.page.keyboard.press('Shift+Tab'); await A.page.keyboard.press('Tab');
    const belHub = A.page.locator('[data-menu-bellen="svc:hub"]');
    const viaToets = await belHub.isVisible().catch(() => false);
    check('toetsenbord: focus opent de bellen', viaToets);
    if (viaToets) { await A.page.keyboard.press('ArrowRight'); const inPaneel = await A.page.evaluate(() => !!document.activeElement?.closest('[data-menu-bellen]')); await A.page.keyboard.press('Escape'); const terug = await A.page.evaluate(() => !!document.activeElement?.querySelector('[data-menu-badge="svc:hub"]')); check('toetsenbord: → naar de bellen, Esc terug naar het item', inPaneel && terug && !(await belHub.isVisible().catch(() => false)), `${inPaneel} ${terug}`); }
    await A.ctx.close();

    // ---------------------------------------------------------------- 3. breed, donker, stip-stijl; ⚙ in de werkbalk
    const B = await sessie('dark', 'open', HUB, { stijl: 'punt' });
    await B.page.locator('[data-menu-badge="svc:admin"], [data-menu-badge="svc:hub"]').first().waitFor({ timeout: 15000 });
    const bB = await badges(B.page);
    check('stip-stijl: geen getal, kleine stip', Object.values(bB).length > 0 && Object.values(bB).every((x) => x.tekst === '' && x.w <= 12), JSON.stringify(bB));
    // punt 4: ⚙ en ✎ samen in één knop «Налаштувати меню» → venster met tabbladen; de link staat in het tabblad «Сповіщення й швидкість»
    const vensterKnop = B.page.locator('.zijbalk-werkbalk.breed [data-menu-venster-knop]');
    check('breed: één knop «Налаштувати меню» naast de drie modusknoppen (geen losse ⚙ en ✎ meer)', await vensterKnop.isVisible() && (await B.page.locator('.zijbalk-werkbalk.breed button[data-zijbalk-modus]').count()) === 3 && (await B.page.locator('.zijbalk-werkbalk [data-zijbalk-instellingen-knop], .zijbalk-werkbalk [data-menu-bewerken-knop]').count()) === 0);
    await vensterKnop.click();
    await B.page.locator('[data-menu-instellingen-venster]').waitFor({ timeout: 5000 });
    check('venster «Налаштувати меню»: tabbladen Редагування / Вигляд / Сповіщення й швидкість', (await B.page.locator('[data-menu-instellingen-venster] [role="tab"]').allInnerTexts()).join('|') === 'Редагування|Вигляд|Сповіщення й швидкість');
    await B.page.locator('[data-miv-tab="meer"]').click();
    const tandwiel = B.page.locator('[data-menu-instellingen-venster] [data-zijbalk-instellingen-knop]');
    check('⚙: echte link naar Налаштування → Меню#menu-meldingen', /^https:\/\/id\.tarasevych\.com\/menu.*#menu-meldingen$/.test(String(await tandwiel.getAttribute('href'))), String(await tandwiel.getAttribute('href')));
    await B.page.screenshot({ path: `${UIT}/menu-22-breed-donker-stippen-tandwiel.png` });
    await tandwiel.click();
    await B.page.waitForURL(/id\.tarasevych\.com\/menu/, { timeout: 20000 });
    const sectie = B.page.locator('#menu-meldingen');
    await sectie.waitFor({ timeout: 20000 }); await B.page.waitForTimeout(600);
    check('⚙ → Налаштування → Меню, sectie «Сповіщення в меню» in beeld', await sectie.isVisible() && /Сповіщення в меню/.test(await sectie.innerText()) && await sectie.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }));
    await B.page.screenshot({ path: `${UIT}/menu-23-breed-donker-instellingen-meldingen.png` });
    // categorie toegang uit → badge Адмін weg (als Адмін in het menu staat), beveiliging blijft aan
    const voor = await badges(B.page);
    await sectie.locator('[data-meld-categorie="delen"] input').uncheck();
    await B.page.waitForTimeout(500);
    const naCat = await badges(B.page);
    check('categorie «Спільний доступ» uit → badge Головна weg', !!voor['svc:hub'] && !naCat['svc:hub'], `${JSON.stringify(Object.keys(voor))} → ${JSON.stringify(Object.keys(naCat))}`);
    await sectie.locator('[data-meld-schakel="aan"]').click();
    await B.page.waitForTimeout(500);
    check('hoofdschakelaar uit → geen enkele badge', Object.keys(await badges(B.page)).length === 0);
    const opgeslagen = await eerst.verzoek('id.tarasevych.com', '/api/owner/ui/preferences', eerst.ctxBody('identity'));
    check('voorkeur opgeslagen op de server (aan=false, delen=false)', opgeslagen.data.sidebar?.meldingen?.aan === false && opgeslagen.data.sidebar?.meldingen?.categorieen?.delen === false, JSON.stringify(opgeslagen.data.sidebar?.meldingen));
    await sectie.locator('[data-meld-schakel="aan"]').click();
    await sectie.locator('[data-meld-categorie="delen"] input').check();
    await B.page.waitForTimeout(500);
    check('weer aan → badges terug', Object.keys(await badges(B.page)).length > 0);
    await B.ctx.close();

    // ---------------------------------------------------------------- 4. smal: ⚙ in het werkbalkpaneel; instellingen licht
    const C = await sessie('light', 'dicht', 'https://id.tarasevych.com/menu?lang=uk#menu-meldingen');
    // De servervoorkeur (in stap 3 opgeslagen: breed) wint van de lokale zaaiing: via de werkbalk zelf naar smal.
    const breedDicht = C.page.locator('.zijbalk-werkbalk.breed button[data-zijbalk-modus="dicht"]');
    if (await breedDicht.isVisible().catch(() => false)) { await breedDicht.click(); await C.page.mouse.move(900, 400); await C.page.waitForTimeout(700); }
    await C.page.locator('.zijbalk-modus-huidig').click();
    const tw2 = C.page.locator('.zijbalk-werkbalk-paneel [data-menu-venster-knop]');
    check('smal: knop «Налаштувати меню» ook in het uitgeklapte werkbalkpaneel', await tw2.isVisible());
    await tw2.hover(); await C.page.waitForTimeout(500);
    const tipTekst = await C.page.locator('.canonical-viewport-tooltip').allInnerTexts();
    check('smal: tooltip «Налаштувати меню…»', tipTekst.some((x) => /Налаштувати меню/.test(x)), JSON.stringify(tipTekst));
    await C.page.keyboard.press('Escape');
    await C.page.locator('#menu-meldingen').waitFor({ timeout: 15000 }); await C.page.waitForTimeout(400);
    const vorm = await C.page.locator('#menu-meldingen [data-meld-categorie="post"] input').evaluate((e) => ({ w: (e as HTMLElement).offsetWidth, h: (e as HTMLElement).offsetHeight }));
    const schakelRij = await C.page.locator('#menu-meldingen [data-meld-schakel="bellen"]').evaluate((e) => getComputedStyle(e).display);
    check('instellingen: compacte vinkjes (≤ 18 px) en schakelaars naast hun tekst', vorm.w <= 18 && vorm.h <= 18 && schakelRij === 'flex', `${JSON.stringify(vorm)} ${schakelRij}`);
    await C.page.screenshot({ path: `${UIT}/menu-24-smal-licht-instellingen-tandwiel.png` });
    await C.ctx.close();

    // ---------------------------------------------------------------- 5. niet-goedgekeurd account: niets
    const N = await sessie('light', 'dicht', SESSIES, {}, { sub: `sub-e2e-mm-ander-${T}`, email: ander }).catch(() => null);
    if (N) {
      check('niet-goedgekeurd: geen enkele badge of bel', (await N.page.locator('[data-menu-badge], [data-menu-bellen]').count()) === 0);
      await N.ctx.close();
    } else check('niet-goedgekeurd: geen menu → ook geen badges', true);
    const nb = G.browser(); await nb.aanmelden(`sub-e2e-mm-ander-${T}`, ander, { service: 'identity', intent: 'login' });
    const nr = await nb.verzoek('id.tarasevych.com', '/api/owner/menu/tellers', nb.ctxBody('identity'));
    check('niet-goedgekeurd: tellers-API 403', nr.status === 403, String(nr.status));

    const relevant = fouten.filter((f) => !/ander|OWNER_APPROVED_SESSION_REQUIRED/.test(f));
    check('geen consolefouten / onverwachte HTTP-fouten (eigenaar)', relevant.length === 0, relevant.slice(0, 6).join(' | '));
  } finally {
    await browser.close().catch(() => undefined);
    // Opruimen op EXACT e-mailadres van deze run (nooit op patroon).
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [[eigenaar, ander]]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await pool.query("delete from app.records where tbl='site_notifications' and data->>'recipientEmail' = any($1)", [[eigenaar, ander]]).catch(() => undefined);
    await stop();
  }
  return einde();
}
