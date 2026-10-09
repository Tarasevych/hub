// E2E menu v2, fase A (opmerkingen van Pavlo bij de smalle rail): in de smalle stand is ELK item een cirkel zonder tekst, ook
// het actieve en de e-mailknop «Написати лист» (animatie envelop → pen blijft); subitems tonen hun icoon, gecentreerd in de rail;
// elk onderdeel heeft een eigen, duidelijk verschillende kleur (Класичний: bij aanwijzen + actief; Кольоровий: altijd),
// subitems in een zachtere tint van dezelfde kleur. Screenshots menu-12…menu-18 (licht/donker, smal/breed).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { deltaE2000 } from '../eenheid/hulp/kleur';
import { ACCENT_KLEUREN, DIENST_ACCENT, type DienstId, type IcoonStijl, type ZijbalkModus } from '../../shared/menu-model';
import { startE2eServer } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const HOSTS = ['id', 'mcp', 'mail', 'hub', 'admin', 'cloud', 'ai'].map((h) => `https://${h}.tarasevych.com`);
const MAIL = 'https://mail.tarasevych.com/inbox?lang=uk', SESSIES = 'https://id.tarasevych.com/sessions?lang=uk', MENU = 'https://id.tarasevych.com/menu?lang=uk';
const VERWACHT = [/^403 .*\/api\/owner\/agents\/activity$/];
const hex2rgb = (h: string) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
const kleurVan = (d: string, thema: 'licht' | 'donker', soort: 'hoofd' | 'sub') => hex2rgb(ACCENT_KLEUREN[DIENST_ACCENT[d as DienstId]][thema][soort]);

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e menu-v2 kleuren + cirkels');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-mk-${T}@example.test`, sub = `sub-e2e-mk-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [`--host-resolver-rules=MAP *.tarasevych.com:443 127.0.0.1:${POORT}, MAP tarasevych.com:443 127.0.0.1:${POORT}`] });
  const fouten: string[] = [];
  try {
    // Elke situatie: eigen browsercontext met de voorkeur alleen lokaal (niets naar de server), zodat ze elkaar niet beïnvloeden.
    const sessie = async (scheme: 'dark' | 'light', modus: ZijbalkModus, icoonStijl: IcoonStijl, url: string) => {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login' });
      const ctx = await browser.newContext({ colorScheme: scheme, locale: 'uk-UA', viewport: { width: 1280, height: 760 }, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript(([t, v]) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); localStorage.setItem('tsv-zijbalk-v2', v); }, [tab, JSON.stringify({ versie: 1, modus, icoonStijl, dock: { positie: 'links', transparantie: 0, vergroting: false }, items: {}, kopieen: [] })] as const);
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 });
      await page.waitForTimeout(700);
      return { ctx, page };
    };
    // Smal: elke zichtbare knop in het menu een cirkel ≤ 44 px, volledig binnen de rail, met een zichtbaar en gecentreerd icoon, zonder tekst.
    const smalMeting = (page: Page) => page.evaluate(() => {
      const side = document.querySelector('.canonical-sidebar')!.getBoundingClientRect(), lijst = document.querySelector('.canonical-service-list') as HTMLElement, lr = lijst.getBoundingClientRect();
      const uit: Array<Record<string, unknown>> = [];
      for (const b of Array.from(lijst.querySelectorAll<HTMLElement>('button'))) {
        const r = b.getBoundingClientRect(), c = getComputedStyle(b);
        if (r.width === 0 || c.display === 'none' || c.visibility === 'hidden') continue;
        if (r.bottom < lr.top || r.top > lr.bottom) continue; // buiten beeld (scrollt) — positie telt dan niet mee
        const svgs = Array.from(b.querySelectorAll('svg')).filter((s) => { const q = s.getBoundingClientRect(), sc = getComputedStyle(s); return q.width > 0 && q.height > 0 && sc.opacity !== '0' && sc.display !== 'none'; });
        const svg = svgs[0]?.getBoundingClientRect();
        // zichtbare tekst: een tekstknoop met een niet-lege rechthoek en lettergrootte > 0
        let tekst = '';
        const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) { const t = (n.textContent || '').trim(); if (!t) continue; const p = n.parentElement!; if (parseFloat(getComputedStyle(p).fontSize) === 0) continue; const rg = document.createRange(); rg.selectNodeContents(n); const rr = rg.getBoundingClientRect(); if (rr.width > 0 && rr.height > 0 && getComputedStyle(p).visibility !== 'hidden') tekst += t; }
        uit.push({
          naam: (b.getAttribute('aria-label') || b.dataset.tooltip || b.textContent || '').trim().slice(0, 24), actief: b.getAttribute('aria-current') === 'page' || b.classList.contains('active'),
          sub: !!b.closest('.canonical-local-pages'), compose: b.classList.contains('mail-compose-pill'),
          w: Math.round(r.width), h: Math.round(r.height), rad: c.borderRadius, links: Math.round(r.left - side.left), rechts: Math.round(side.right - r.right),
          svgW: svg ? Math.round(svg.width) : 0, svgMidden: svg ? Math.round(Math.abs((svg.left + svg.width / 2) - (r.left + r.width / 2))) : 99,
          svgBinnen: svg ? svg.left >= side.left && svg.right <= side.right : false, tekst,
        });
      }
      return { rail: Math.round(side.width), knoppen: uit };
    });
    const isCirkel = (k: Record<string, unknown>) => (k.w as number) <= 44 && Math.abs((k.w as number) - (k.h as number)) <= 1 && (k.rad === '50%' || parseFloat(String(k.rad)) >= (k.w as number) / 2);
    const controleerSmal = async (page: Page, wat: string) => {
      const m = await smalMeting(page);
      const geenCirkel = m.knoppen.filter((k) => !isCirkel(k)).map((k) => `${k.naam} ${k.w}×${k.h} r=${k.rad}`);
      const buiten = m.knoppen.filter((k) => (k.links as number) < 0 || (k.rechts as number) < 0).map((k) => `${k.naam} l=${k.links} r=${k.rechts}`);
      const geenIcoon = m.knoppen.filter((k) => !(k.svgW as number) || !k.svgBinnen || (k.svgMidden as number) > 3).map((k) => `${k.naam} svg=${k.svgW} midden=${k.svgMidden}`);
      const metTekst = m.knoppen.filter((k) => k.tekst).map((k) => `${k.naam}: «${k.tekst}»`);
      const subs = m.knoppen.filter((k) => k.sub), actief = m.knoppen.filter((k) => k.actief);
      check(`${wat}: rail 60 px; elk zichtbaar item (${m.knoppen.length}) is een cirkel ≤ 44 px — ook actief (${actief.length})`, m.rail === 60 && m.knoppen.length > 12 && actief.length >= 2 && geenCirkel.length === 0, geenCirkel.join(' | '));
      check(`${wat}: alles volledig binnen de rail (niets steekt uit)`, buiten.length === 0, buiten.join(' | '));
      check(`${wat}: elk item toont zijn icoon, gecentreerd (± 3 px) en binnen de rail — ook alle ${subs.length} subitems`, subs.length >= 6 && geenIcoon.length === 0, geenIcoon.join(' | '));
      check(`${wat}: geen zichtbare tekst in de smalle stand (alleen tooltip)`, metTekst.length === 0, metTekst.join(' | '));
      check(`${wat}: subitems kleiner dan hoofditems`, subs.every((k) => (k.w as number) < 44) && m.knoppen.filter((k) => !k.sub).every((k) => (k.w as number) >= 34), subs.map((k) => k.w).join(','));
      return m;
    };
    const iconKleur = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => getComputedStyle(e.querySelector('svg')!).color);
    const hoofdKleuren = (page: Page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll<HTMLElement>('.canonical-service-group')].map((g) => [g.dataset.serviceGroup, getComputedStyle(g.querySelector('.canonical-service-button svg')!).color])));

    // ---------------------------------------------------------------- 1. licht · smal · klassiek · e-mail (de situatie van Pavlo's screenshot)
    const A = await sessie('light', 'dicht', 'klassiek', MAIL);
    const ma = await controleerSmal(A.page, 'licht/smal/e-mail');
    const comp = ma.knoppen.find((k) => k.compose);
    check('«Написати лист» smal: cirkel met icoon, zonder tekst', !!comp && isCirkel(comp) && !comp.tekst && (comp.svgW as number) > 0, JSON.stringify(comp));
    const kA = await hoofdKleuren(A.page);
    const rustig = ['hub', 'ai', 'cloud', 'github', 'huis'].map((d) => kA[d]);
    check('klassiek: niet-actieve hoofditems rustig en monochroom (één kleur)', new Set(rustig).size === 1, rustig.join(' '));
    check('klassiek: actief hoofditem (Пошта) in de kleur van E-mail', kA.mail === kleurVan('mail', 'licht', 'hoofd'), `${kA.mail} (verwacht ${kleurVan('mail', 'licht', 'hoofd')})`);
    const actSub = await iconKleur(A.page, '.mail-sidebar-nav-button.active');
    check('klassiek: actief subitem (Вхідні) in de lichtere tint van E-mail', actSub === kleurVan('mail', 'licht', 'sub'), `${actSub}`);
    await A.page.locator('[data-service-group="cloud"] .canonical-service-button').hover();
    await A.page.waitForTimeout(350);
    const hov = await iconKleur(A.page, '[data-service-group="cloud"] .canonical-service-button');
    check('klassiek: aanwijzen laat de kleur van het onderdeel zien (Хмара → hemelsblauw)', hov === kleurVan('cloud', 'licht', 'hoofd'), hov);
    const pen = A.page.locator('.mail-compose-pill');
    const penVoor = await pen.evaluate((e) => getComputedStyle(e.querySelector('.pen') || e.querySelectorAll('svg')[1]).opacity);
    await A.page.mouse.move(400, 400); await A.page.waitForTimeout(200);
    await A.page.screenshot({ path: `${UIT}/menu-12-smal-licht-mail-klassiek.png` });
    if (!(await pen.isDisabled())) { await pen.hover(); await A.page.waitForTimeout(450); }
    else { await pen.evaluate((e) => e.removeAttribute('disabled')); await pen.hover(); await A.page.waitForTimeout(450); }
    const penNa = await pen.evaluate((e) => getComputedStyle(e.querySelector('.pen') || e.querySelectorAll('svg')[1]).opacity);
    check('«Написати лист» smal: animatie blijft (envelop → pen bij aanwijzen)', penVoor === '0' && penNa === '1', `${penVoor}→${penNa}`);
    await A.ctx.close();

    // ---------------------------------------------------------------- 2. licht · smal · kleurrijk · e-mail
    const B = await sessie('light', 'dicht', 'kleur', MAIL);
    await controleerSmal(B.page, 'licht/smal/kleurrijk');
    const kB = await hoofdKleuren(B.page);
    const verkeerd = Object.entries(kB).filter(([d, k]) => k !== kleurVan(d, 'licht', 'hoofd')).map(([d, k]) => `${d}=${k}`);
    check('kleurrijk: elk hoofditem in de kleur van zijn onderdeel (uit menu-model)', verkeerd.length === 0 && Object.keys(kB).length >= 9, verkeerd.join(' '));
    const ds = Object.keys(kB); let minDE = 999, paar = '';
    for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) { const d = deltaE2000(kB[ds[i]], kB[ds[j]]); if (d < minDE) { minDE = d; paar = `${ds[i]}/${ds[j]}`; } }
    check(`kleurrijk: zichtbare onderdelen duidelijk verschillend (min. CIEDE2000 ≥ 12; ${ds.length} onderdelen)`, minDE >= 12, `${minDE.toFixed(1)} ${paar}`);
    const subK = await B.page.evaluate(() => [...document.querySelectorAll('.mail-sidebar-nav-button:not(.active) .mail-sidebar-icon-state svg')].map((s) => getComputedStyle(s).color));
    check('kleurrijk: subitems van E-mail in de lichtere tint van E-mail', subK.length >= 5 && subK.every((k) => k === kleurVan('mail', 'licht', 'sub')), [...new Set(subK)].join(' '));
    await B.page.screenshot({ path: `${UIT}/menu-13-smal-licht-mail-kleur.png` });
    await B.ctx.close();

    // ---------------------------------------------------------------- 3. donker · smal · kleurrijk · Налаштування → Сесії
    const C = await sessie('dark', 'dicht', 'kleur', SESSIES);
    await C.page.locator('.canonical-local-page-button.active').scrollIntoViewIfNeeded();
    await C.page.waitForTimeout(300);
    await controleerSmal(C.page, 'donker/smal/instellingen');
    const kC = await hoofdKleuren(C.page);
    const verkeerdD = Object.entries(kC).filter(([d, k]) => k !== kleurVan(d, 'donker', 'hoofd')).map(([d, k]) => `${d}=${k}`);
    check('donker + kleurrijk: hoofditems in het donkere palet van hun onderdeel', verkeerdD.length === 0, verkeerdD.join(' '));
    const subD = await C.page.evaluate(() => [...document.querySelectorAll('[data-service-group="identity"] .canonical-local-page-button svg')].map((s) => getComputedStyle(s).color));
    check('donker + kleurrijk: subitems van Налаштування in de zachtere grijstint', subD.length === 12 && subD.every((k) => k === kleurVan('identity', 'donker', 'sub')), [...new Set(subD)].join(' '));
    await C.page.screenshot({ path: `${UIT}/menu-14-smal-donker-instellingen-kleur.png` });
    await C.ctx.close();

    // ---------------------------------------------------------------- 4. donker · smal · klassiek · e-mail
    const D = await sessie('dark', 'dicht', 'klassiek', MAIL);
    await controleerSmal(D.page, 'donker/smal/e-mail');
    const kD = await hoofdKleuren(D.page);
    check('donker + klassiek: actief Пошта in het donkere E-mailblauw, rest monochroom', kD.mail === kleurVan('mail', 'donker', 'hoofd') && new Set(['hub', 'ai', 'cloud', 'github'].map((d) => kD[d])).size === 1, JSON.stringify(kD));
    await D.page.screenshot({ path: `${UIT}/menu-15-smal-donker-mail-klassiek.png` });
    await D.ctx.close();

    // ---------------------------------------------------------------- 5. breed: pil met tekst; verbindingslijn in de tint van het onderdeel
    const E = await sessie('light', 'open', 'kleur', MAIL);
    const breedComp = await E.page.locator('.mail-compose-pill').evaluate((e) => ({ w: e.getBoundingClientRect().width, tekst: (e.textContent || '').trim(), bg: getComputedStyle(e).backgroundColor }));
    check('breed: «Написати лист» weer een knop met tekst, in de kleur van E-mail', breedComp.w > 100 && /Написати/.test(breedComp.tekst) && breedComp.bg === kleurVan('mail', 'licht', 'hoofd'), JSON.stringify(breedComp));
    const mailLijn = await E.page.locator('.canonical-local-navigation-slot').evaluate((e) => getComputedStyle(e).borderLeftWidth);
    check('breed: ook het submenu van E-mail heeft de verbindingslijn', mailLijn === '2px', mailLijn);
    await E.page.screenshot({ path: `${UIT}/menu-16-breed-licht-mail-kleur.png` });
    await E.ctx.close();
    const F = await sessie('dark', 'open', 'klassiek', SESSIES);
    const lijn = await F.page.locator('[data-service-group="identity"] .canonical-local-pages').evaluate((e) => ({ breedte: getComputedStyle(e).borderLeftWidth, kleur: getComputedStyle(e).borderLeftColor }));
    check('breed: verticale verbindingslijn van het submenu blijft (2 px, getint)', lijn.breedte === '2px' && lijn.kleur !== 'rgba(0, 0, 0, 0)', JSON.stringify(lijn));
    await F.page.locator('.canonical-local-page-button.active').scrollIntoViewIfNeeded();
    await F.page.screenshot({ path: `${UIT}/menu-17-breed-donker-instellingen-klassiek.png` });
    await F.ctx.close();
    const H = await sessie('light', 'open', 'kleur', MENU);
    await H.page.locator('[data-icoon-stijl-keuze]').waitFor({ timeout: 15000 });
    check('Instellingen → Меню: uitleg noemt de kleuren per onderdeel', /пошта — синя/.test(await H.page.locator('[data-icoon-stijl-keuze]').innerText()));
    await H.page.screenshot({ path: `${UIT}/menu-18-breed-licht-menu-instellingen.png` });
    await H.ctx.close();

    check('geen consolefouten / onverwachte HTTP-fouten', fouten.length === 0, fouten.slice(0, 6).join(' | '));
  } finally {
    await browser.close().catch(() => undefined);
    // Opruimen op EXACT e-mailadres van deze run (nooit op patroon): gebruiker + alles wat aan zijn id hangt.
    const pool = getPool();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = $1", [eigenaar]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await stop();
  }
  return einde();
}
