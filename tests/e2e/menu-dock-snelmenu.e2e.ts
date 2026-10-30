// E2E UI-001: submenu van ELKE dienst in het horizontale menu (dock boven/onder) via rechterklik, lang indrukken (aanraken) en
// toetsenbord (Shift+F10 / ContextMenu / pijl omlaag) — zonder navigatie. Linkerklik blijft: niet-actief = navigeren, actief =
// paneel in/uit. Esc/buiten klikken sluit (focus terug). Bewerkmodus: rechterklik/lang indrukken doen NIETS nieuws (slepen werkt).
// ALLEEN de lokale server (chromeArgs). Screenshots snelmenu-*.
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
const ID = 'https://id.tarasevych.com', HUB = 'https://hub.tarasevych.com/?lang=uk';
const VERWACHT = [/^403 .*\/api\/owner\/agents\/activity$/, /^500 https:\/\/mail\.tarasevych\.com\/api\/owner\/mail\/(bootstrap|accounts\/list)$/]; // 500 op mail: bestaand basisdefect (gmailParserPolicySelfTest), niet UI-001

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e menu dock-snelmenu (UI-001)');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-sm-${T}@example.test`, sub = `sub-e2e-sm-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  try {
    const zijbalk = (positie: string) => ({ versie: 1, modus: 'open', icoonStijl: 'kleur', dock: { positie, transparantie: 0, vergroting: false }, items: {}, kopieen: [] });
    const sessie = async (o: { positie: string; scheme?: 'light' | 'dark'; touch?: boolean; viewport?: { width: number; height: number } }) => {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login' });
      const z = zijbalk(o.positie);
      const opgeslagen = await b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar/save', b.ctxBody('identity', { sidebar: z }));
      if (opgeslagen.status !== 200) throw new Error(`sidebar/save ${opgeslagen.status}`);
      const ctx = await browser.newContext({ colorScheme: o.scheme || 'light', locale: 'uk-UA', viewport: o.viewport || { width: 1440, height: 900 }, hasTouch: !!o.touch, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript(([tb, v]) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', tb); if (!sessionStorage.getItem('e2e-gezaaid')) { localStorage.setItem('tsv-zijbalk-v2', v); sessionStorage.setItem('e2e-gezaaid', '1'); } }, [tab, JSON.stringify(z)] as const);
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });
      page.on('request', (q) => { const u = new URL(q.url()); if (!/^(data|blob):$/.test(u.protocol) && !/(^|\.)tarasevych\.com$/.test(u.hostname)) fouten.push(`extern verzoek: ${q.url()}`); });
      await page.goto(HUB, { waitUntil: 'networkidle' });
      await page.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 });
      await page.waitForTimeout(700);
      return { ctx, page };
    };
    const knop = (id: string) => `.canonical-sidebar [data-service-group="${id}"] .canonical-service-button`;
    const paneel = (p: Page, id?: string) => p.locator(id ? `[data-dock-paneel="${id}"]` : '[data-dock-paneel]');
    const host = (p: Page) => new URL(p.url()).hostname;
    const st = (p: Page) => p.evaluate(() => `${location.host} open=${Array.from(document.querySelectorAll<HTMLElement>('[data-dock-paneel]')).map((e) => e.dataset.dockPaneel).join(',')}`);
    const ligging = (p: Page) => p.evaluate(() => { const a = document.querySelector('[data-dock-paneel]')?.getBoundingClientRect(), s = document.querySelector('.canonical-sidebar')!.getBoundingClientRect(); return a ? { boven: a.bottom <= s.top + 1, onder: a.top >= s.bottom - 1, binnen: a.left >= 0 && a.right <= innerWidth && a.top >= 0 && a.bottom <= innerHeight, n: document.querySelectorAll('[data-dock-paneel] .canonical-local-page-button').length } : null; });

    for (const positie of ['boven', 'onder'] as const) {
      for (const scheme of ['light', 'dark'] as const) {
        const S = await sessie({ positie, scheme }); const p = S.page;
        const ok = (t: string, v: boolean, d = '') => check(`${positie}/${scheme}: ${t}`, v, d);
        ok('dock actief en «Пошта» heeft aria-haspopup', (await p.locator('main').getAttribute('data-dock')) === positie && (await p.locator(knop('mail')).getAttribute('aria-haspopup')) === 'true');
        // rechterklik op niet-actieve dienst
        await p.locator(knop('mail')).click({ button: 'right' }); await p.waitForTimeout(250);
        const l = await ligging(p);
        ok('rechterklik op «Пошта» (niet actief): paneel open, geen navigatie', (await paneel(p, 'mail').count()) === 1 && host(p) === 'hub.tarasevych.com' && (await p.locator(knop('mail')).getAttribute('aria-expanded')) === 'true', JSON.stringify(l));
        ok(`paneel ${positie === 'boven' ? 'onder' : 'boven'} het dock, binnen het scherm, met pagina's`, !!l && (positie === 'boven' ? l.onder : l.boven) && l.binnen && l.n >= 2, JSON.stringify(l));
        await p.mouse.move(5, 450);
        await p.screenshot({ path: `${UIT}/snelmenu-${positie}-1440-${scheme}.png` });
        if (scheme === 'dark') { await S.ctx.close(); continue; }
        // nog eens rechterklik = dicht
        await p.locator(knop('mail')).click({ button: 'right' }); await p.waitForTimeout(200);
        ok('tweede rechterklik op dezelfde dienst sluit', (await paneel(p).count()) === 0);
        // ander item: wisselt
        await p.locator(knop('mail')).click({ button: 'right' }); await p.locator(knop('cloud')).click({ button: 'right' }); await p.waitForTimeout(200);
        ok('rechterklik op een andere dienst wisselt het paneel', (await paneel(p, 'cloud').count()) === 1 && (await paneel(p, 'mail').count()) === 0);
        await p.keyboard.press('Escape'); await p.waitForTimeout(200);
        ok('Esc sluit', (await paneel(p).count()) === 0);
        await p.locator(knop('mail')).click({ button: 'right' }); await p.waitForTimeout(150);
        const leeg = await p.evaluate(() => { for (let y = 120; y < innerHeight - 120; y += 37) for (let x = 20; x < innerWidth - 20; x += 41) { const e = document.elementFromPoint(x, y); if (e && !e.closest('a,button,input,textarea,select,[role],[tabindex],[onclick],.dock-paneel,.canonical-sidebar,[draggable]')) return { x, y }; } return { x: 5, y: 300 }; });
        await p.mouse.click(leeg.x, leeg.y); await p.waitForTimeout(250);
        ok('klik buiten sluit, zonder navigatie', (await paneel(p).count()) === 0 && host(p) === 'hub.tarasevych.com', await st(p));
        // native contextmenu alleen op die items onderdrukt
        const elders = await p.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); (document.querySelector('.canonical-workspace, main') as HTMLElement).dispatchEvent(e); return e.defaultPrevented; });
        ok('native contextmenu elders niet onderdrukt', elders === false);
        // linkerklik op actieve dienst: in/uit (zoals voorheen)
        await p.locator(knop('hub')).click(); await p.waitForTimeout(250);
        ok('linkerklik op actieve dienst opent paneel', (await paneel(p, 'hub').count()) === 1, await st(p));
        await p.locator(knop('hub')).click(); await p.waitForTimeout(250);
        ok('nogmaals linkerklik sluit', (await paneel(p).count()) === 0, await st(p));
        // toetsenbord
        for (const toets of ['Shift+F10', 'ContextMenu', 'ArrowDown']) {
          await p.locator(knop('mail')).focus(); await p.keyboard.press(toets); await p.waitForTimeout(300);
          const f = await p.evaluate(() => !!document.activeElement?.closest('[data-dock-paneel="mail"]'));
          ok(`${toets}: paneel open en focus op eerste link`, (await paneel(p, 'mail').count()) === 1 && f);
          await p.keyboard.press('Escape'); await p.waitForTimeout(200);
          ok(`${toets}: Esc sluit en geeft focus terug aan «Пошта»`, (await paneel(p).count()) === 0 && await p.evaluate(() => document.activeElement?.closest('[data-service-group]')?.getAttribute('data-service-group')) === 'mail');
        }
        // bewerkmodus: rechterklik doet niets nieuws, slepen werkt nog
        await p.locator('.zijbalk-werkbalk.dock [data-menu-venster-knop]').evaluate((e) => (e as HTMLElement).click());
        await p.locator('[data-menu-instellingen-venster] [data-menu-bewerken-knop]').click();
        await p.locator('[data-menu-bewerkbalk]').waitFor({ timeout: 4000 });
        const pv = await p.evaluate(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.querySelector('.canonical-sidebar [data-service-group="mail"] .canonical-service-button')!.dispatchEvent(e); return e.defaultPrevented; });
        await p.waitForTimeout(200);
        ok('bewerkmodus: rechterklik opent geen paneel en laat contextmenu met rust', (await paneel(p).count()) === 0 && pv === false && (await p.locator(knop('mail')).getAttribute('aria-haspopup')) === null);
        const volg = () => p.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-menu-lijst="zijbalk|"] > [data-menu-sleutel]')).map((e) => e.dataset.menuSleutel!));
        const voor = await volg();
        const a = (await p.locator(knop(voor[0].replace('svc:', ''))).boundingBox())!, b = (await p.locator(`[data-menu-sleutel="${voor[voor.length - 1]}"]`).boundingBox())!;
        await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down();
        for (let i = 1; i <= 12; i++) { await p.mouse.move(a.x + a.width / 2 + ((b.x + b.width * 0.75 - a.x - a.width / 2) * i) / 12, a.y + a.height / 2); await p.waitForTimeout(16); }
        await p.waitForTimeout(120); await p.mouse.up(); await p.waitForTimeout(500);
        const na = await volg();
        ok('bewerkmodus: slepen met de muis verplaatst nog steeds', na[na.length - 1] === voor[0] || na.indexOf(voor[0]) > 0, `${voor.join(',')} → ${na.join(',')}`);
        await S.ctx.close();
      }
    }

    // ---------------------------------------------------------------- aanraken (tablet 1024, dock onder en boven)
    for (const positie of ['onder', 'boven'] as const) {
      const S = await sessie({ positie, touch: true, viewport: { width: 1024, height: 768 } }); const p = S.page;
      const cdp = await S.ctx.newCDPSession(p);
      const punt = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
      const druk = async (sel: string, ms: number, beweeg = 0) => {
        const r = (await p.locator(sel).boundingBox())!; const x = r.x + r.width / 2, y = r.y + r.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punt(x, y) });
        if (beweeg) { await p.waitForTimeout(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punt(x + beweeg, y) }); }
        await p.waitForTimeout(ms);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await p.waitForTimeout(400);
      };
      const ok = (t: string, v: boolean, d = '') => check(`aanraken ${positie}: ${t}`, v, d);
      await druk(knop('mail'), 700);
      ok('lang indrukken op «Пошта»: paneel open, geen navigatie (klik ingeslikt)', (await paneel(p, 'mail').count()) === 1 && host(p) === 'hub.tarasevych.com');
      ok('geen sleepgeest buiten de bewerkmodus', (await p.locator('.menu-sleep-geest').count()) === 0);
      await p.screenshot({ path: `${UIT}/snelmenu-aanraken-${positie}-1024.png` });
      await druk('main', 80).catch(() => undefined);
      const r = await p.locator('.canonical-sidebar').boundingBox();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punt(500, positie === 'onder' ? 200 : 600) }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(300);
      ok('tik buiten sluit', (await paneel(p).count()) === 0, JSON.stringify(r));
      await druk(knop('mail'), 700, 40);
      ok('lang indrukken met bewegen (> 8 px) opent geen paneel', (await paneel(p).count()) === 0, await st(p));
      if (host(p) !== 'hub.tarasevych.com') { await p.goto(HUB, { waitUntil: 'networkidle' }); await p.waitForTimeout(700); }
      await druk(knop('hub'), 60);
      ok('korte tik op actieve dienst: paneel in/uit zoals voorheen', (await paneel(p, 'hub').count()) === 1, await st(p));
      await druk(knop('hub'), 60);
      if (positie === 'boven') {
        // bewerkmodus: lang indrukken = slepen (geen paneel)
        await p.locator('.zijbalk-werkbalk.dock [data-menu-venster-knop]').evaluate((e) => (e as HTMLElement).click());
        await p.locator('[data-menu-instellingen-venster] [data-menu-bewerken-knop]').click();
        await p.locator('[data-menu-bewerkbalk]').waitFor({ timeout: 4000 });
        const rr = (await p.locator(knop('mail')).boundingBox())!; const x = rr.x + rr.width / 2, y = rr.y + rr.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punt(x, y) }); await p.waitForTimeout(650);
        for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punt(x + i * 15, y) }); await p.waitForTimeout(20); }
        const geest = await p.locator('.menu-sleep-geest').count();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(400);
        ok('bewerkmodus: lang indrukken start slepen, geen paneel', geest === 1 && (await paneel(p).count()) === 0, `geest=${geest}`);
      } else {
        await druk(knop('mail'), 60); await p.waitForTimeout(1500);
        ok('korte tik op niet-actieve dienst navigeert gewoon', host(p) === 'mail.tarasevych.com', p.url());
      }
      await S.ctx.close();
    }
    // linkerklik op niet-actief navigeert (muis)
    { const S = await sessie({ positie: 'boven' }); await S.page.locator(knop('mail')).click(); await S.page.waitForTimeout(1500);
      check('muis: linkerklik op niet-actieve dienst navigeert (ongewijzigd)', host(S.page) === 'mail.tarasevych.com', S.page.url()); await S.ctx.close(); }
    // 390: geen dock (lade) — niets veranderd
    for (const scheme of ['light', 'dark'] as const) {
      const S = await sessie({ positie: 'boven', scheme, touch: true, viewport: { width: 390, height: 844 } });
      check(`390/${scheme}: telefoon gebruikt de lade, geen dock, geen aria-haspopup`, (await S.page.locator('main').getAttribute('data-dock')) !== 'boven' && (await S.page.locator('[aria-haspopup="true"].canonical-service-button').count()) === 0);
      await S.page.screenshot({ path: `${UIT}/snelmenu-390-${scheme}-lade-ongewijzigd.png` });
      await S.ctx.close();
    }
    const relevant = fouten.filter((f) => !/ERR_ABORTED|net::ERR_FAILED/.test(f));
    check('geen consolefouten / onverwachte HTTP-fouten / externe verzoeken', relevant.length === 0, relevant.slice(0, 6).join(' | '));
  } finally {
    await browser.close().catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = $1", [eigenaar]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await stop();
  }
  return einde();
}
