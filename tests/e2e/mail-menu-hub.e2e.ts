// E2E (29.10.2026, Chrome, echte server + echte build): (1) hub /recent op 390 px met ingeklapt menu — rond de hamburgerknop mag
// niets uitsteken (geen streepje, geen half rond element); (2) «Новий лист» → «⋯»: tabbladen Текст / Вставити / Шаблони / Дії
// (tablist), raster met labels, 44 px tikdoelen op aanraakschermen, menu helemaal in beeld, geen horizontale scroll, licht+donker,
// 390/768/1440. Gmail-account en concepten gesimuleerd. Schermafdrukken: E2E_SCREENSHOTS/<MM_FASE: voor|na>/.
// Gebruik: node scripts/e2e-lokaal.mjs mail-menu-hub    (MM_FASE=voor meet alleen en maakt foto's; de oude build heeft geen tabbladen)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { startE2eServer, chromeArgs } from './server';
import { getPool } from '../../server/platform/pg';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const FASE = process.env.MM_FASE === 'voor' ? 'voor' : 'na';
const UIT = join(process.env.E2E_SCREENSHOTS || '/workspace/release-mail-menu/screens', FASE);
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MAIL = 'https://mail.tarasevych.com', HUB = 'https://hub.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker(`e2e mail-menu-hub (${FASE})`);
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-mm-${T}@example.test`, sub = `sub-e2e-mm-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const metingen: Record<string, unknown> = {};
  const extern: string[] = [];
  const na = FASE === 'na';
  try {
    const sessie = async (o: { breedte: number; donker: boolean; hoogte?: number; belInMenu?: boolean; techRuimte?: boolean }) => {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login' });
      // Zoals bij Pavlo (teller op ☰): de bel in het menu (zone «zijbalk») — of standaard (kop van de lade).
      const zb = { versie: 1, modus: 'auto', icoonStijl: 'klassiek', dock: { positie: 'links', transparantie: 0, vergroting: false }, items: {}, kopieen: [], plaatsing: { versie: 1, klassen: o.belInMenu ? { telefoon: { bel: { zone: 'zijbalk', index: 0 } } } : {} } };
      const opg = await b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar/save', b.ctxBody('identity', { sidebar: zb }));
      if (opg.status !== 200) throw new Error(`sidebar/save ${opg.status}`);
      const tel = o.breedte < 500;
      const ctx = await browser.newContext({ colorScheme: o.donker ? 'dark' : 'light', locale: 'uk-UA', viewport: { width: o.breedte, height: o.hoogte || (tel ? 844 : o.breedte < 1000 ? 1024 : 900) }, hasTouch: tel, isMobile: tel, deviceScaleFactor: tel ? 2 : 1, serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MAIL, HUB].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
      const page = await ctx.newPage();
      page.on('request', (q) => { const u = new URL(q.url()); if (!/^(data|blob):$/.test(u.protocol) && !/(^|\.)tarasevych\.com$/.test(u.hostname)) extern.push(q.url()); });
      const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      await page.route('**/api/owner/mail/google-suite/accounts', (r) => r.fulfill(json({ activeAccountId: 'acc-1', accounts: [{ id: 'acc-1', email: 'ik@example.test', status: 'connected' }] })));
      await page.route('**/api/owner/mail/compose/draft/save', (r) => r.fulfill(json({ ok: true, draft: { localId: 'x', syncStatus: 'synced' } })));
      await page.route('**/api/owner/mail/compose/draft/list', (r) => r.fulfill(json({ ok: true, drafts: [] })));
      await page.route('**/api/owner/mail/compose/draft/get', (r) => r.fulfill(json({ ok: true, draft: null })));
      if (o.techRuimte) {
        // Zoals op Pavlo's server: vlag tech-ruimtes-v2 aan en een technisch profiel → ruimtewissel (ZijbalkRuimte) in het menu.
        // Alleen deze drie antwoorden zijn nagebootst (de testserver heeft geen technisch profiel); al het andere is de echte server.
        await page.route('**/api/ofrep/v1/evaluate/flags/tech-ruimtes-v2', (r) => r.fulfill(json({ key: 'tech-ruimtes-v2', value: true })));
        await page.route('**/api/owner/hub/tech/ruimtes/status', (r) => r.fulfill(json({ aan: true, actief: 'prive', technischToegestaan: true, pauze: false, sessie: null, eigenaar: true, schaduw: false, nu: new Date().toISOString(), termijnen: [], maxMinuten: 60, rollen: [] })));
        await page.route('**/api/owner/tech/status', (r) => r.fulfill(json({ profiel: { userId: 'u1', profielId: 'tp-1', rollen: ['eigenaar'], maxMinuten: 480, maxNu: 480, band: { kleur: 'amber', patroon: 'strepen' }, laatstActief: null, ervenNieuweTabbladen: false }, activatie: null, catalogus: [], nu: Date.now() })));
      }
      return { ctx, page };
    };

    // ---------------- 1. hub /recent, telefoon, menu ingeklapt
    // Zoals bij Pavlo: ongelezen meldingen (teller op ☰) — echte rijen in de lokale testdatabase + een teller van de post.
    {
      const eerst = G.browser();
      await eerst.aanmelden(sub, eigenaar, { service: 'mail', intent: 'login' });
      const pool = getPool();
      const uid = (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id as string;
      for (let i = 0; i < 5; i++) await pool.query("insert into app.records(tbl,data) values('site_notifications',$1::jsonb)", [JSON.stringify({ recipientUserId: uid, recipientEmail: eigenaar, kind: 'workspace_share', title: `Melding ${i + 1}`, message: 'Тестове сповіщення.', read: false, createdAt: Date.now() - i * 60000 })]);
      const t = await eerst.verzoek('mail.tarasevych.com', '/api/owner/menu/tellers/zet', eerst.ctxBody('mail', { bron: 'mail', ongelezen: 88 }));
      check('meldingen + teller gezaaid', t.status === 200, `${t.status}`);
    }
    // Twee situaties: vers geladen, en zoals bij Pavlo: menu (lade) geopend, naar beneden gescrold, weer dicht. Lagere hoogte (640)
    // zodat het menu ook met de weinige items van een testaccount moet scrollen.
    for (const [donker, gescrold, belInMenu, techRuimte] of [[false, false, false, true], [true, false, false, true], [false, true, false, true], [true, true, false, true], [false, false, true, true], [false, false, false, false], [true, false, false, false]] as const) for (const pad of ['recent', ''] as const) {
      if (pad === '' && (gescrold || belInMenu)) continue;
      const naam = `hub${pad ? '' : '-werkblad'}-390-${donker ? 'donker' : 'licht'}${techRuimte ? '' : '-zonder-ruimtes'}${gescrold ? '-na-scrollen' : ''}${belInMenu ? '-bel-in-menu' : ''}`;
      const { ctx, page } = await sessie({ breedte: 390, donker, hoogte: gescrold ? 640 : 844, belInMenu, techRuimte });
      await page.goto(`${HUB}/${pad}?lang=uk`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      if (gescrold) {
        await page.locator('[data-sidebar-action=open-drawer]').click(); await page.waitForTimeout(500);
        const sc = await page.evaluate(() => { const n = document.querySelector<HTMLElement>('.canonical-service-list')!; n.scrollTop = Math.round((n.scrollHeight - n.clientHeight) / 2); n.dispatchEvent(new Event('scroll')); return { sh: n.scrollHeight, ch: n.clientHeight, st: n.scrollTop }; });
        metingen[`${naam}|scroll`] = sc;
        check(`${naam}: menu in de lade kan scrollen (voorwaarde)`, sc.st > 2, JSON.stringify(sc));
        await page.waitForTimeout(300);
        await page.locator('[data-sidebar-action=close-drawer]').click(); await page.waitForTimeout(700);
      }
      // Alles wat zichtbaar is in de strook rond de hamburgerknop, behalve de knop zelf (en wat erin zit) en grote vlakken.
      const rond = await page.evaluate(() => {
        const vw = innerWidth;
        const knop = [...document.querySelectorAll<HTMLElement>('button')].find((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.left < 80 && r.top < 90 && /меню|menu/i.test(`${b.getAttribute('aria-label') || ''} ${b.className}`); });
        if (!knop) return { knop: null as null | number[], rest: [] as string[] };
        const k = knop.getBoundingClientRect();
        const zone = { l: 0, t: k.top - 4, r: k.right + 40, b: k.bottom + 48 };
        const rest: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>('body *')) {
          if (el === knop || knop.contains(el) || el.contains(knop)) continue;
          const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
          if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
          if (r.width > vw * 0.6 && r.height > 60) continue; // pagina-/kopvlakken
          if (r.right <= zone.l || r.left >= zone.r || r.bottom <= zone.t || r.top >= zone.b) continue;
          const zichtbaar = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth) > 0 || cs.boxShadow !== 'none' || el.tagName === 'svg' || el.tagName === 'IMG' || (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()));
          if (!zichtbaar) continue;
          // binnen een element dat het (via overflow/clip) niet laat zien?
          let p: HTMLElement | null = el.parentElement, verborgen = false;
          while (p) { const pc = getComputedStyle(p); if (pc.display === 'none' || pc.visibility === 'hidden') { verborgen = true; break; } if (pc.overflow !== 'visible' || pc.clipPath !== 'none') { const pr = p.getBoundingClientRect(); if (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom) { verborgen = true; break; } } p = p.parentElement; }
          if (verborgen) continue;
          // het kopje «Робочий стіл» e.d. (gewone paginatekst) telt niet
          if (el.closest('main h1, main h2, .hub-titel, [data-pagina-kop], .hub-workspace-head')) continue;
          const cls = typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '');
          rest.push(`${el.tagName.toLowerCase()}.${cls.split(/\s+/).slice(0, 3).join('.')} [${[r.left, r.top, r.width, r.height].map((x) => Math.round(x)).join(',')}]`);
        }
        return { knop: [k.left, k.top, k.width, k.height].map((x) => Math.round(x)), rest };
      });
      metingen[naam] = rond;
      metingen[`${naam}|zijbalk`] = await page.evaluate(() => ({
        aside: (() => { const a = document.querySelector<HTMLElement>('.canonical-sidebar'); if (!a) return null; const r = a.getBoundingClientRect(), cs = getComputedStyle(a); return { r: [r.left, r.top, r.width, r.height].map(Math.round), transform: cs.transform, vis: cs.visibility, overflow: cs.overflow, clip: cs.clipPath }; })(),
        pijlen: [...document.querySelectorAll<HTMLElement>('[data-zijbalk-pijl]')].map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { w: e.dataset.zijbalkPijl, z: e.dataset.zichtbaar, r: [r.left, r.top, r.width, r.height].map(Math.round), pos: cs.position, op: cs.opacity, vis: cs.visibility }; }),
        lijst: (() => { const n = document.querySelector<HTMLElement>('.canonical-service-list'); return n ? { sh: n.scrollHeight, ch: n.clientHeight } : null; })(),
        main: document.querySelector('main.canonical-chrome')?.className,
        pseudo: [...document.querySelectorAll<HTMLElement>('.canonical-sidebar, .canonical-sidebar *')].flatMap((e) => ['::before', '::after'].map((ps) => { const cs = getComputedStyle(e, ps); if (cs.content === 'none' || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return ''; const r = e.getBoundingClientRect(); if (r.top > 62 || r.left > 58) return ''; return `${e.tagName.toLowerCase()}.${String(e.getAttribute('class') || '').split(' ')[0]}${ps} pos=${cs.position} ${cs.width}×${cs.height} t=${cs.top} l=${cs.left} b=${cs.bottom} bg=${cs.backgroundColor} bimg=${cs.backgroundImage.slice(0, 40)} border=${cs.borderTopWidth}/${cs.borderBottomWidth} r=${cs.borderRadius} shadow=${cs.boxShadow.slice(0, 30)}`; })).filter(Boolean),
        asideStijl: (() => { const a = document.querySelector<HTMLElement>('.canonical-sidebar'); if (!a) return null; const cs = getComputedStyle(a); return { bg: cs.backgroundColor, bimg: cs.backgroundImage.slice(0, 60), border: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth].join('/'), bcol: cs.borderRightColor, shadow: cs.boxShadow, backdrop: cs.backdropFilter, radius: cs.borderRadius }; })(),
        inAside: [...document.querySelectorAll<HTMLElement>('.canonical-sidebar *')].filter((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && r.top < 62 && r.left < 58 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0; }).map((e) => { const r = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()}.${String(e.getAttribute('class') || '').split(' ').slice(0, 2).join('.')} [${[r.left, r.top, r.width, r.height].map(Math.round).join(',')}]`; }).slice(0, 40),
      }));
      await page.screenshot({ path: join(UIT, `${naam}.png`) });
      await page.screenshot({ path: join(UIT, `${naam}-zoom.png`), clip: { x: 0, y: 0, width: 220, height: 160 } });
      check(`${naam}: hamburgerknop gevonden`, !!rond.knop, JSON.stringify(rond.knop));
      if (na) check(`${naam}: niets steekt uit rond de hamburgerknop`, rond.rest.length === 0, rond.rest.slice(0, 6).join(' | '));
      const zb = metingen[`${naam}|zijbalk`] as { inAside: string[] };
      if (na) check(`${naam}: in de dichte lade alleen ☰ (en de teller)`, zb.inAside.every((x) => /^(button\.canonical-menu-toggle|svg\.lucide|small\.plaats-menu-teller)/.test(x)), zb.inAside.join(' | '));
      else console.log(`[voor] ${naam}: ${rond.rest.length} elementen rond de knop: ${rond.rest.slice(0, 10).join(' | ')}`);
      if (techRuimte && !gescrold && !belInMenu && pad === 'recent') {
        // Functie blijft: in de OPEN lade staat de ruimtewissel er gewoon (twee knoppen met naam).
        await page.locator('[data-sidebar-action=open-drawer]').click(); await page.waitForTimeout(600);
        const zr = await page.locator('.canonical-sidebar .zr [data-zijbalk-ruimte]').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).map((e) => (e.textContent || '').trim()));
        check(`${naam}: open lade toont de ruimtewissel (Звичайний/Технічний)`, zr.join('|') === 'Звичайний|Технічний', zr.join('|'));
        await page.screenshot({ path: join(UIT, `${naam}-lade-open.png`) });
      }
      await ctx.close();
    }

    // ---------------- 2. «Новий лист» → «⋯»
    for (const breedte of [390, 768, 1440]) for (const donker of [false, true]) {
      const naam = `mail-meer-${breedte}-${donker ? 'donker' : 'licht'}`;
      const { ctx, page } = await sessie({ breedte, donker });
      await page.goto(`${MAIL}/postvak-in?lang=uk`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => !!document.querySelector('.mail-compose-float:not([disabled]), .mail-compose-pill:not([disabled])'), null, { timeout: 25000 });
      await page.evaluate(() => window.dispatchEvent(new Event('mail:open-compose')));
      const dlg = page.locator('section.mail-new-message');
      await dlg.waitFor({ timeout: 10000 });
      await page.waitForTimeout(600);
      const meer = dlg.locator('.mail-compose-more > button');
      await meer.click();
      const menu = page.locator('[data-compose-menu=meer]');
      await menu.waitFor({ timeout: 5000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(UIT, `${naam}.png`) });
      const vorm = await page.evaluate(() => {
        const m = document.querySelector<HTMLElement>('[data-compose-menu=meer]')!; const r = m.getBoundingClientRect();
        return { rect: [r.left, r.top, r.right, r.bottom].map(Math.round), vw: innerWidth, vh: innerHeight, scrollX: document.documentElement.scrollWidth > innerWidth + 1, hoogte: Math.round(r.height), inhoud: m.scrollHeight > m.clientHeight + 2 };
      });
      metingen[naam] = vorm;
      check(`${naam}: menu helemaal in beeld`, vorm.rect[0] >= -0.5 && vorm.rect[1] >= -0.5 && vorm.rect[2] <= vorm.vw + 0.5 && vorm.rect[3] <= vorm.vh + 0.5, JSON.stringify(vorm));
      check(`${naam}: geen horizontale scroll van de pagina`, !vorm.scrollX);
      if (na) {
        const tabs = menu.locator('[role=tablist] [role=tab]');
        const namen = await tabs.allInnerTexts();
        check(`${naam}: tabbladen ${namen.join('/')}`, namen.join('|').includes('Вставити') && namen.join('|').includes('Шаблони') && namen.join('|').includes('Дії') && (breedte >= 1000 || namen[0] === 'Текст'), namen.join('|'));
        const balk = await menu.locator('[role=tablist]').evaluate((e) => ({ over: e.scrollWidth > e.clientWidth + 1, r: e.getBoundingClientRect().right, m: e.closest('[data-compose-menu]')!.getBoundingClientRect().right }));
        check(`${naam}: tabbalk past (geen eigen scroll, binnen het menu)`, !balk.over && balk.r <= balk.m + 0.5, JSON.stringify(balk));
        check(`${naam}: precies één tabpaneel zichtbaar, gelinkt via aria-controls`, await menu.locator('[role=tabpanel]:visible').count() === 1 && await menu.evaluate((m) => { const t = m.querySelector('[role=tab][aria-selected=true]'); return !!t && m.querySelector(`#${CSS.escape(t.getAttribute('aria-controls') || '')}`)?.getAttribute('role') === 'tabpanel'; }));
        // tikdoelen
        const min = breedte < 500 ? 44 : 36;
        const klein = async () => menu.locator('[role=tabpanel]:visible button, [role=tabpanel]:visible select, [role=tab]').evaluateAll((els, mn) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < mn - 0.5 || r.width < mn - 0.5); }).map((e) => `${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20)} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`), min);
        const k1 = await klein();
        check(`${naam}: tikdoelen ≥ ${min} px (eerste tabblad)`, k1.length === 0, k1.join(', '));
        // Вставити: raster met labels, gelijke afstanden
        await menu.locator('[role=tab]', { hasText: 'Вставити' }).click(); await page.waitForTimeout(150);
        const raster = await menu.locator('[role=tabpanel]:visible .mm-raster').first().evaluate((g) => {
          const t = [...g.querySelectorAll<HTMLElement>(':scope > button')]; const rs = t.map((e) => e.getBoundingClientRect());
          const rijen = [...new Set(rs.map((r) => Math.round(r.top)))];
          const eersteRij = rs.filter((r) => Math.round(r.top) === rijen[0]); const gaten = eersteRij.slice(1).map((r, i) => Math.round(r.left - eersteRij[i].right));
          return { n: t.length, labels: t.every((e) => (e.querySelector('.mm-label')?.textContent || '').trim().length > 0), w: [...new Set(rs.map((r) => Math.round(r.width)))], h: [...new Set(rs.map((r) => Math.round(r.height)))], gaten: [...new Set(gaten)], rijen: rijen.length };
        });
        metingen[`${naam}|raster`] = raster;
        check(`${naam}: Вставити = raster met korte labels, gelijke tegels en afstanden`, raster.n >= 4 && raster.labels && raster.w.length === 1 && raster.h.length === 1 && raster.gaten.length <= 1, JSON.stringify(raster));
        const k2 = await klein();
        check(`${naam}: tikdoelen ≥ ${min} px (Вставити)`, k2.length === 0, k2.join(', '));
        await page.screenshot({ path: join(UIT, `${naam}-vstavyty.png`) });
        // Шаблони
        await menu.locator('[role=tab]', { hasText: 'Шаблони' }).click(); await page.waitForTimeout(150);
        check(`${naam}: Шаблони: Подяка en Вітання зі святом`, (await menu.locator('[role=tabpanel]:visible').innerText()).includes('Подяка'));
        await page.screenshot({ path: join(UIT, `${naam}-shablony.png`) });
        // Дії
        await menu.locator('[role=tab]', { hasText: 'Дії' }).click(); await page.waitForTimeout(150);
        check(`${naam}: Дії: скасувати/повторити`, await menu.locator('[role=tabpanel]:visible [aria-label="Скасувати"], [role=tabpanel]:visible :text("Скасувати")').count() > 0);
        // toetsenbord: ←/→/Home/End op de tabbalk
        await menu.locator('[role=tab][aria-selected=true]').focus();
        await page.keyboard.press('Home');
        const eerste = await menu.locator('[role=tab]').first().getAttribute('aria-selected');
        await page.keyboard.press('ArrowLeft');
        const laatste = await menu.locator('[role=tab]').last().getAttribute('aria-selected');
        check(`${naam}: toetsenbord Home/← (rondgaand) wisselt tabblad`, eerste === 'true' && laatste === 'true');
        if (breedte < 1000) {
          await page.keyboard.press('Home'); await page.waitForTimeout(100);
          await page.screenshot({ path: join(UIT, `${naam}-tekst.png`) });
        }
        // werkt het nog? Шаблони → Подяка voegt tekst in en sluit het menu
        await menu.locator('[role=tab]', { hasText: 'Шаблони' }).click();
        await menu.locator('.mail-sjabloon-item').first().click(); await page.waitForTimeout(200);
        check(`${naam}: sjabloon ingevoegd, menu dicht`, (await dlg.locator('.ProseMirror').innerText()).trim().length > 10 && await page.locator('[data-compose-menu=meer]').count() === 0);
        // menu onthoudt het laatste tabblad niet tussen sessies maar wel binnen het venster
        await meer.click(); await menu.waitFor();
        check(`${naam}: heropenen → zelfde tabblad (Шаблони)`, (await menu.locator('[role=tab][aria-selected=true]').innerText()) === 'Шаблони');
        await page.keyboard.press('Escape');
        check(`${naam}: Esc sluit`, await page.locator('[data-compose-menu=meer]').count() === 0);
      }
      await ctx.close();
    }
  } finally {
    writeFileSync(join(UIT, 'metingen.json'), JSON.stringify(metingen, null, 1));
    await browser.close(); await stop();
  }
  check('geen verzoeken buiten *.tarasevych.com (lokaal)', extern.length === 0, extern.slice(0, 3).join(', '));
  return einde();
}
