// E2E menu v2 (stage 1) met een echte Chrome: scrollpijlen (klik + ingedrukt houden), smalle rail zonder overlap door de
// scrollbalk, cirkelmarkering, tooltips op ELK item in de smalle stand (muis + toetsenbord), werkbalk met «altijd ingeklapt»
// (blijft na herladen én in een nieuwe browser via de server), kleurstijl in Instellingen → Меню, unieke iconen.
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
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const VERWACHT = [/^403 .*\/api\/owner\/agents\/activity$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e menu-v2');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-mn-${T}@example.test`, sub = `sub-e2e-mn-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  try {
    const sessie = async (scheme: 'dark' | 'light', viewport = { width: 1280, height: 640 }) => {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login' });
      const ctx = await browser.newContext({ colorScheme: scheme, locale: 'uk-UA', viewport, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });
      return { ctx, page };
    };
    const open = async (page: Page, pad = '/sessions') => { await page.goto(`${ID}${pad}?lang=uk`, { waitUntil: 'networkidle' }); await page.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 }); await page.waitForTimeout(500); };
    const nav = (page: Page) => page.locator('.canonical-service-list');
    const modus = (page: Page) => page.locator('main.canonical-chrome').getAttribute('data-zijbalk-modus');
    const scrollTop = (page: Page) => nav(page).evaluate((el) => el.scrollTop);
    const pijl = (page: Page, r: 'boven' | 'onder') => page.locator(`[data-zijbalk-pijl="${r}"]`);
    const zichtbaar = async (page: Page, r: 'boven' | 'onder') => (await pijl(page, r).getAttribute('data-zichtbaar')) === 'true';
    const naarTop = async (page: Page) => { await nav(page).evaluate((el) => { el.scrollTop = 0; }); await page.waitForTimeout(250); };

    // ---------------------------------------------------------------- 1. werkbalk: «altijd ingeklapt»
    const A = await sessie('dark');
    const page = A.page;
    await open(page);
    check('geen grote knop «Зафіксувати бічну панель» meer; compacte werkbalk (smal: 1 knop)', await page.locator('.canonical-menu-toggle:visible').count() === 0 && await page.locator('.zijbalk-werkbalk.smal .zijbalk-modus-huidig').count() === 1 && await modus(page) === 'auto');
    await page.locator('.zijbalk-modus-huidig').focus();
    await page.waitForTimeout(150);
    const tipWerk = await page.locator('#canonical-viewport-tooltip').innerText().catch(() => '');
    check('werkbalkknop: tooltip (toetsenbordfocus) «Режим бічної панелі: Автоматично…»', /Режим бічної панелі: Автоматично/.test(tipWerk), tipWerk);
    await page.keyboard.press('Enter');
    const paneel = page.locator('[data-zijbalk-paneel]');
    await paneel.waitFor({ timeout: 3000 });
    const knoppen = await paneel.locator('button[data-zijbalk-modus]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-zijbalk-modus')}:${e.getAttribute('aria-pressed')}:${!!e.getAttribute('data-tooltip')}`));
    check('paneel: drie modi met aria-pressed en tooltip (open, dicht, auto)', JSON.stringify(knoppen) === JSON.stringify(['open:false:true', 'dicht:false:true', 'auto:true:true']), JSON.stringify(knoppen));
    await page.keyboard.press('ArrowLeft');
    check('werkbalk: pijltjestoetsen verplaatsen de focus', await page.evaluate(() => document.activeElement?.getAttribute('data-zijbalk-modus')) === 'dicht');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    check('modus «dicht» gekozen', await modus(page) === 'dicht' && await page.locator('main.canonical-chrome').getAttribute('data-sidebar-state') === 'collapsed');
    await page.mouse.move(30, 300); await page.waitForTimeout(700);
    check('«dicht»: aanwijzen klapt NIET open', await page.locator('main.canonical-chrome').getAttribute('data-sidebar-state') === 'collapsed');

    // ---------------------------------------------------------------- 2. geen overlap, cirkel
    const maat = await page.evaluate(() => {
      const n = document.querySelector('.canonical-service-list') as HTMLElement, side = document.querySelector('.canonical-sidebar') as HTMLElement;
      const nr = n.getBoundingClientRect(), sr = side.getBoundingClientRect();
      const inhoudRechts = nr.left + n.clientWidth;
      const iconen = [...n.querySelectorAll('.menu-lucide-glyph, .menu-brand-glyph')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
      const knoppen = [...n.querySelectorAll<HTMLElement>('.canonical-service-button')].map((b) => ({ w: b.offsetWidth, h: b.offsetHeight, r: getComputedStyle(b).borderRadius }));
      return { breedte: sr.width, scrollbalk: n.offsetWidth - n.clientWidth, overflow: n.scrollHeight > n.clientHeight, slechtsteMarge: Math.min(...iconen.map((r) => inhoudRechts - r.right)), linksMarge: Math.min(...iconen.map((r) => r.left - nr.left)), iconen: iconen.length, knoppen };
    });
    check('smalle rail 60px, menu loopt over (scrollen nodig), GEEN scrollbalk die iconen raakt', maat.breedte === 60 && maat.overflow && maat.scrollbalk === 0 && maat.slechtsteMarge >= 6 && maat.linksMarge >= 6 && maat.iconen > 10, JSON.stringify({ ...maat, knoppen: undefined }));
    check('smal: markering is een cirkel (44×44, border-radius 50%)', maat.knoppen.every((k) => k.w === 44 && k.h === 44 && k.r === '50%'), JSON.stringify(maat.knoppen.slice(0, 3)));

    // ---------------------------------------------------------------- 3. scrollpijlen (smal)
    await naarTop(page);
    check('bovenaan: alleen de pijl omlaag', !(await zichtbaar(page, 'boven')) && await zichtbaar(page, 'onder'));
    await page.screenshot({ path: `${UIT}/menu-01-smal-pijlen.png` });
    const t0 = await scrollTop(page);
    await pijl(page, 'onder').locator('button').click();
    await page.waitForTimeout(700);
    const t1 = await scrollTop(page);
    check('klik op ▼: vloeiend een stuk omlaag, daarna ook ▲ zichtbaar', t1 > t0 + 60 && await zichtbaar(page, 'boven'), `${t0}→${t1}`);
    await page.screenshot({ path: `${UIT}/menu-02-smal-beide-pijlen.png` });
    const bb = await pijl(page, 'onder').locator('button').boundingBox();
    if (bb) { await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(1800); await page.mouse.up(); }
    await page.waitForTimeout(300);
    const t2 = await scrollTop(page), max = await nav(page).evaluate((el) => el.scrollHeight - el.clientHeight);
    check('▼ ingedrukt houden: blijft scrollen tot onderaan; dan verdwijnt ▼', t2 >= max - 3 && !(await zichtbaar(page, 'onder')) && await zichtbaar(page, 'boven'), `${t2}/${max}`);
    await pijl(page, 'boven').locator('button').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    check('▲ met het toetsenbord (Enter): omhoog', (await scrollTop(page)) < t2 - 60);

    // ---------------------------------------------------------------- 4. tooltips op ELK item (smal)
    await naarTop(page);
    const items = nav(page).locator('button');
    const n = await items.count();
    const zonder: string[] = [];
    let rechts = 0, getest = 0;
    for (let i = 0; i < n; i++) {
      const b = items.nth(i);
      if (!(await b.isVisible())) continue;
      getest++;
      await b.focus();
      await page.waitForTimeout(60);
      const verwacht = (await b.getAttribute('data-tooltip')) || '';
      const tip = page.locator('#canonical-viewport-tooltip');
      const tekst = await tip.innerText().catch(() => '');
      const tb = await tip.boundingBox().catch(() => null), kb = await b.boundingBox();
      if (!verwacht || tekst.trim() !== verwacht.trim()) zonder.push(`${await b.getAttribute('aria-label')}=>${tekst}`);
      else if (tb && kb && tb.x >= kb.x + kb.width) rechts++;
    }
    check(`smal: elk zichtbaar item (${getest}) heeft een site-tooltip bij toetsenbordfocus`, getest > 15 && zonder.length === 0, zonder.slice(0, 5).join(' | '));
    check('smal: tooltips staan rechts naast het item', rechts === getest, `${rechts}/${getest}`);
    const subKnop = page.locator('.canonical-local-page-button[data-local-tab="sessions"]');
    await subKnop.scrollIntoViewIfNeeded();
    await subKnop.hover();
    await page.waitForTimeout(250);
    const hoverTip = await page.locator('#canonical-viewport-tooltip').innerText().catch(() => '');
    check('aanwijzen (muis) op een subitem: tooltip «Сесії»', hoverTip.trim() === 'Сесії', hoverTip);
    await page.screenshot({ path: `${UIT}/menu-03-smal-tooltip.png` });
    check('geen native title-tooltips op menu-items', await nav(page).locator('.canonical-service-button[title], .canonical-local-page-button[title]').count() === 0);

    // ---------------------------------------------------------------- 5. «dicht» blijft: herladen + nieuwe browser (server)
    await page.waitForTimeout(800); // opslaan naar de server is gebundeld (350 ms)
    await open(page);
    check('na herladen: nog steeds «altijd ingeklapt»', await modus(page) === 'dicht' && await page.locator('main.canonical-chrome').getAttribute('data-sidebar-state') === 'collapsed');
    const B = await sessie('light');
    await open(B.page);
    check('nieuwe browser (lege localStorage), zelfde account: «dicht» van de server', await modus(B.page) === 'dicht', String(await modus(B.page)));
    const opgeslagen = (await pool.query("select data->'sidebar' as s from app.records r where r.tbl='owner_ui_preferences_v1' and data->>'userId' = (select id::text from app.records where tbl='users' and data->>'email' = $1 limit 1)", [eigenaar]).catch(() => ({ rows: [] as Array<{ s: unknown }> }))).rows[0]?.s as Record<string, unknown> | undefined;
    check('server: voorkeur genormaliseerd opgeslagen (modus dicht, versie 1)', !!opgeslagen && opgeslagen.modus === 'dicht' && opgeslagen.versie === 1, JSON.stringify(opgeslagen));

    // ---------------------------------------------------------------- 6. breed: pil, hiërarchie, werkbalk; screenshots licht/donker
    await page.locator('.zijbalk-modus-huidig').click();
    await page.locator('[data-zijbalk-paneel] [data-zijbalk-modus="open"]').click();
    await page.waitForTimeout(500);
    check('«altijd uitgeklapt»: vastgezet en breed; werkbalk breed met 3 knoppen', await page.locator('main.canonical-chrome').getAttribute('data-sidebar-state') === 'pinned' && await page.locator('.zijbalk-werkbalk.breed button[data-zijbalk-modus]').count() === 3);
    const pil = await page.evaluate(() => {
      const n = document.querySelector('.canonical-service-list') as HTMLElement;
      const hoofd = document.querySelector<HTMLElement>('.canonical-service-group.active .canonical-service-button')!, sub = document.querySelector<HTMLElement>('.canonical-local-page-button')!;
      const kleur = (e: Element | null) => e ? getComputedStyle(e).color : '';
      return { lijst: n.clientWidth, hoofd: hoofd.offsetWidth, radius: getComputedStyle(hoofd).borderRadius, hoofdKleur: kleur(document.querySelector('.canonical-service-group:not(.active) .canonical-service-label')), subKleur: kleur(document.querySelector('.canonical-local-page-button:not(.active) .canonical-local-label')), hoofdMaat: getComputedStyle(document.querySelector('.canonical-service-label')!).fontSize, subMaat: getComputedStyle(sub.querySelector('.canonical-local-label')!).fontSize };
    });
    check('breed: pil om icoon + tekst (niet de volle breedte), afgerond', pil.hoofd < pil.lijst - 20 && parseFloat(pil.radius) >= 20, JSON.stringify(pil));
    check('hiërarchie: subitems in een andere (gedemptere) kleur én kleiner dan hoofditems', pil.hoofdKleur !== pil.subKleur && parseFloat(pil.subMaat) < parseFloat(pil.hoofdMaat), JSON.stringify(pil));
    await naarTop(page);
    await page.screenshot({ path: `${UIT}/menu-04-breed-donker.png` });
    await B.page.locator('.zijbalk-modus-huidig').click();
    await B.page.locator('[data-zijbalk-paneel] [data-zijbalk-modus="open"]').click();
    await B.page.waitForTimeout(500);
    await naarTop(B.page);
    await B.page.screenshot({ path: `${UIT}/menu-05-breed-licht.png` });
    // unieke iconen: hoofditems onderling, en de pagina's van «Налаштування» onderling en t.o.v. de hoofditems
    const iconen = await page.evaluate(() => {
      const naam = (b: Element) => [...(b.querySelector('svg')?.classList || [])].find((c) => c.startsWith('lucide-') && c !== 'lucide-icon') || b.querySelector('.menu-brand-glyph')?.className || '?';
      return { hoofd: [...document.querySelectorAll('.canonical-service-button')].map(naam), sub: [...document.querySelectorAll('[data-service-group="identity"] .canonical-local-page-button')].map(naam) };
    });
    const uniek = (l: string[]) => new Set(l).size === l.length;
    check('iconen: geen twee hoofditems met hetzelfde icoon', uniek(iconen.hoofd), iconen.hoofd.join(','));
    check('iconen: «Налаштування»-pagina\'s allemaal verschillend en anders dan de hoofditems', iconen.sub.length === 12 && uniek(iconen.sub) && !iconen.sub.some((x) => iconen.hoofd.includes(x)), iconen.sub.join(','));

    // ---------------------------------------------------------------- 7. Instellingen → Меню: «Стиль іконок»
    await open(page, '/menu');
    await page.evaluate(() => { const d = document.getElementById('menu-stijl') as HTMLDetailsElement | null; if (d) d.open = true; }); // punt 4: /menu is een accordeon
    const keuze = page.locator('[data-icoon-stijl-keuze]');
    await keuze.waitFor({ timeout: 15000 });
    check('Instellingen → Меню: «Стиль іконок» met Класичний (gekozen) en Кольоровий', /Стиль іконок/.test(await keuze.innerText()) && await keuze.locator('input[value="klassiek"]').isChecked());
    const kleurVan = () => page.evaluate(() => ['mail', 'cloud', 'github'].map((id) => { const g = document.querySelector(`[data-service-group="${id}"] .canonical-service-button svg`); return g ? getComputedStyle(g).color : ''; }));
    const klassiek = await kleurVan();
    await keuze.getByText('Кольоровий').click();
    await page.waitForTimeout(400);
    const kleur = await kleurVan();
    check('Кольоровий: data-icoon-stijl=kleur en elk onderdeel een eigen tint (was monochroom)', await page.locator('main.canonical-chrome').getAttribute('data-icoon-stijl') === 'kleur' && new Set(kleur).size === 3 && new Set(klassiek).size === 1, `${klassiek.join(' ')} → ${kleur.join(' ')}`);
    await naarTop(page);
    await page.screenshot({ path: `${UIT}/menu-06-kleurrijk-donker.png` });
    await page.waitForTimeout(800);
    await open(B.page, '/menu');
    check('kleurstijl ook in de andere browser (server)', await B.page.locator('main.canonical-chrome').getAttribute('data-icoon-stijl') === 'kleur');
    await naarTop(B.page);
    await B.page.screenshot({ path: `${UIT}/menu-07-kleurrijk-licht.png` });
    // kleurrijk + smal
    await page.locator('.zijbalk-werkbalk.breed [data-zijbalk-modus="dicht"]').click();
    await page.waitForTimeout(500);
    const actief = page.locator('.canonical-local-page-button.active').first();
    await actief.scrollIntoViewIfNeeded();
    await actief.hover(); await page.waitForTimeout(250);
    await page.screenshot({ path: `${UIT}/menu-08-kleurrijk-smal-tooltip.png` });
    check('kleurrijk + smal: actief subitem gemarkeerd als cirkel', await actief.evaluate((e) => getComputedStyle(e).borderRadius) === '50%');

    // ---------------------------------------------------------------- 8. mobiel: lade + pijlen
    const M = await sessie('light', { width: 390, height: 640 });
    await open(M.page);
    await M.page.locator('.canonical-menu-toggle').first().click();
    await M.page.locator('main.sidebar-drawer').waitFor({ timeout: 5000 });
    await M.page.waitForTimeout(400);
    check('mobiel: lade open, menu scrollbaar met pijl ▼', await zichtbaar(M.page, 'onder'));
    await M.page.screenshot({ path: `${UIT}/menu-09-mobiel-lade.png` });
    await page.locator('.zijbalk-modus-huidig').click();
    await page.locator('[data-zijbalk-paneel] [data-zijbalk-modus="auto"]').click();
    await page.waitForTimeout(800);
    check('terug naar «auto»: aanwijzen klapt weer open', await (async () => { await page.mouse.move(400, 300); await page.waitForTimeout(200); await page.mouse.move(28, 300); await page.waitForTimeout(700); return await page.locator('main.canonical-chrome').getAttribute('data-sidebar-state') === 'hover-expanded'; })());

    // ---------------------------------------------------------------- 9. «Сесії» en «Налаштувати меню»: knoppen en kop in de sitestijl
    await open(page, '/sessions');
    const ov = page.locator('[data-sessies-overzicht]');
    await ov.waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    const stijl = await page.evaluate(() => {
      const css = (e: Element | null) => e ? getComputedStyle(e) : null;
      // inline-flex binnen een flexcontainer wordt «flex» (blockificatie); het gaat om flex-rij met icoon naast de tekst.
      const rij = (b: HTMLElement | null) => { if (!b) return null; const s = b.querySelector('svg')!.getBoundingClientRect(), r = b.getBoundingClientRect(), c = css(b)!; return { display: c.display, richting: c.flexDirection, radius: c.borderRadius, hoogte: r.height, svgNaastTekst: s.top >= r.top && s.bottom <= r.bottom && r.height < 52 }; };
      const sum = document.querySelector('.sessies-overzicht .security-session-summary')!;
      const st = sum.querySelector('strong')!.getBoundingClientRect(), sm = sum.querySelector('small')!.getBoundingClientRect();
      return { gevaar: rij(document.querySelector<HTMLElement>('[data-sessies-alle-andere]')), vernieuw: rij(sum.querySelector<HTMLElement>(':scope>button')), titelOnder: sm.top >= st.bottom - 1, h1: css(document.querySelector('.settings-center>header h1'))!.fontFamily, sub: document.querySelector('[data-settings-subtitle]')?.textContent || '', titel: document.querySelector('.settings-center>header h1')?.textContent || '' };
    });
    check('«Завершити всі інші»: echte knop (flex-rij, icoon naast tekst, afgerond)', /flex$/.test(stijl.gevaar?.display || '') && stijl.gevaar.richting === 'row' && stijl.gevaar.svgNaastTekst && stijl.gevaar.radius === '12px', JSON.stringify(stijl.gevaar));
    check('«Оновити»: secundaire knop (flex-rij, icoon naast tekst, rand)', /flex$/.test(stijl.vernieuw?.display || '') && stijl.vernieuw.richting === 'row' && stijl.vernieuw.svgNaastTekst && stijl.vernieuw.radius === '12px', JSON.stringify(stijl.vernieuw));
    check('«Керування входами й пристроями»: uitleg op een eigen regel eronder', stijl.titelOnder);
    check('kop «Сесії та пристрої»: schreefloos en paginaspecifieke ondertitel', stijl.titel === 'Сесії та пристрої' && !/Georgia|Times/.test(stijl.h1) && /Де й коли виконано вхід/.test(stijl.sub) && !/Налаштування поточного облікового запису/.test(stijl.sub), `${stijl.h1} | ${stijl.sub}`);
    await page.mouse.move(640, 400);
    await page.screenshot({ path: `${UIT}/menu-10-sessies-knoppen.png` });
    await open(page, '/menu');
    await page.evaluate(() => { const d = document.getElementById('menu-stijl') as HTMLDetailsElement | null; if (d) d.open = true; }); // punt 4: /menu is een accordeon
    await page.locator('[data-icoon-stijl-keuze]').waitFor({ timeout: 15000 });
    await page.mouse.move(640, 400); await page.waitForTimeout(400);
    const menuKop = await page.evaluate(() => ({ h1: getComputedStyle(document.querySelector('.settings-center>header h1')!).fontFamily, titel: document.querySelector('.settings-center>header h1')?.textContent || '', sub: document.querySelector('[data-settings-subtitle]')?.textContent || '' }));
    check('kop «Налаштувати меню»: schreefloos en paginaspecifieke ondertitel', menuKop.titel === 'Налаштувати меню' && !/Georgia|Times/.test(menuKop.h1) && /Вигляд і поведінка бічної панелі/.test(menuKop.sub), JSON.stringify(menuKop));
    await page.screenshot({ path: `${UIT}/menu-11-menu-instellingen.png` });
    check('geen consolefouten', fouten.length === 0, fouten.slice(0, 6).join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await browser.close().catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = $1", [eigenaar]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await stop();
  }
  return einde();
}
