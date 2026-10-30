// E2E punt 4 (Chrome): «Завжди розгорнута» is naadloos (zelfde achtergrond als de pagina, geen rand/schaduw, geen zichtbare
// schuifbalk of ▲▼); één knop «Налаштувати меню» met tabbladen (pijltjestoetsen); /menu is een accordeon: standaard dicht,
// #anker opent dat blok en sluit de rest, de keuze blijft na F5. axe op het venster en op /menu.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const AXE = process.env.AXE_CORE || join(dirname(PW), 'axe-core', 'axe.min.js');
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const VERWACHT = [/^403 .*\/api\/owner\/agents\/activity$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e menu-ux');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-mu-${T}@example.test`, sub = `sub-e2e-mu-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login' });
    const ctx = await browser.newContext({ colorScheme: 'light', locale: 'uk-UA', viewport: { width: 1280, height: 640 }, serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });
    const open = async (url: string) => { await page.goto(url, { waitUntil: 'networkidle' }); await page.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 }); await page.waitForTimeout(500); };

    // ---- naadloos «Завжди розгорнута»
    await open(`${ID}/sessions?lang=uk`);
    await page.locator('.zijbalk-modus-huidig').click();
    await page.locator('[data-zijbalk-paneel] [data-zijbalk-modus="open"]').click();
    await page.mouse.move(900, 400); await page.waitForTimeout(600);
    const naad = await page.evaluate(() => {
      const zb = document.querySelector('.canonical-sidebar')!, cs = getComputedStyle(zb), main = document.querySelector('main.canonical-chrome')!, lijst = document.querySelector('.canonical-service-list')!;
      const pijlen = [...document.querySelectorAll('[data-zijbalk-pijl]')].filter((p) => getComputedStyle(p).display !== 'none').length;
      return { zb: cs.backgroundColor, pagina: getComputedStyle(main).backgroundColor, rand: cs.borderRightColor, schaduw: cs.boxShadow, balk: getComputedStyle(lijst).scrollbarWidth, pijlen, pinned: main.classList.contains('sidebar-pinned') };
    });
    check('«Завжди розгорнута»: zelfde achtergrond als de pagina, geen rand/schaduw (naadloos, zoals Google)', naad.pinned && naad.zb === naad.pagina && /rgba\(0, 0, 0, 0\)|transparent/.test(naad.rand) && naad.schaduw === 'none', JSON.stringify(naad));
    check('geen zichtbare schuifbalk en geen ▲▼-pijlen (scrollen met wieltje/vegen)', naad.balk === 'none' && naad.pijlen === 0, JSON.stringify(naad));
    await page.screenshot({ path: `${UIT}/menu-ux-1-naadloos.png` });

    // ---- één venster met tabbladen
    await page.locator('.zijbalk-werkbalk [data-menu-venster-knop]').click();
    const venster = page.locator('[data-menu-instellingen-venster]');
    await venster.waitFor({ timeout: 5000 });
    check('venster: 3 tabbladen, «Редагування» actief', (await venster.locator('[role="tab"][aria-selected="true"]').innerText()) === 'Редагування' && await venster.locator('[role="tab"]').count() === 3);
    await venster.locator('[role="tab"][aria-selected="true"]').focus();
    await page.keyboard.press('ArrowRight');
    check('pijltoets → tabblad «Вигляд» met keuzekaarten voor de zijbalk', (await venster.locator('[role="tab"][aria-selected="true"]').innerText()) === 'Вигляд' && await venster.locator('[data-miv-modus] label').count() === 3);
    const axeV = await axe(page, '[data-menu-instellingen-venster]');
    check('axe venster: geen schendingen', axeV.length === 0, axeV.join('\n'));
    await page.screenshot({ path: `${UIT}/menu-ux-2-venster.png` });
    await venster.locator('[data-miv-modus-keuze="auto"]').check({ force: true });
    await page.waitForTimeout(300);
    check('keuze «Автоматично» in het venster werkt meteen', (await page.locator('main.canonical-chrome').getAttribute('data-zijbalk-modus')) === 'auto');
    await page.keyboard.press('Escape');

    // ---- /menu: accordeon
    await open(`${ID}/menu?lang=uk`);
    const blokken = page.locator('[data-zijbalk-blok]');
    const standen = async () => blokken.evaluateAll((els) => els.map((e) => `${e.id}:${(e as HTMLDetailsElement).open ? 1 : 0}`).join(','));
    check('/menu: 6 blokken (incl. «Видимість та іконки»), standaard alle dicht', await blokken.count() === 6 && !/:1/.test(await standen()), await standen());
    await page.goto(`${ID}/menu?lang=uk#menu-snelheid`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    check('#menu-snelheid: dat blok open, de rest dicht', (await standen()) === 'menu-stijl:0,menu-modus:0,menu-indeling:0,menu-meldingen:0,menu-snelheid:1,menu-zichtbaarheid:0', await standen());
    await page.locator('[data-zijbalk-blok="menu-modus"] > summary').click(); await page.waitForTimeout(300);
    check('accordeon: «Бічна панель» openen sluit «Швидкість»', (await standen()) === 'menu-stijl:0,menu-modus:1,menu-indeling:0,menu-meldingen:0,menu-snelheid:0,menu-zichtbaarheid:0', await standen());
    check('Бічна панель: compacte segmenten met icoon (3, één actief)', await page.locator('.zijbalk-modus-segmenten > label').count() === 3 && await page.locator('.zijbalk-modus-segmenten > label.actief').count() === 1);
    await page.goto(`${ID}/menu?lang=uk`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700);
    check('na F5 (zonder anker): het laatst geopende blok is weer open', (await standen()) === 'menu-stijl:0,menu-modus:1,menu-indeling:0,menu-meldingen:0,menu-snelheid:0,menu-zichtbaarheid:0', await standen());
    await page.locator('[data-zijbalk-blok="menu-zichtbaarheid"] > summary').click(); await page.waitForTimeout(300);
    check('«Видимість та іконки»: geen ▲▼-pijlknoppen meer (volgorde = slepen in de bewerkmodus)', await page.locator('.settings-menu-editor article').count() > 3 && await page.locator('.settings-menu-editor article button svg.lucide-arrow-up, .settings-menu-editor article button svg.lucide-arrow-down').count() === 0);
    const axeM = await axe(page, '[data-zijbalk-instellingen]');
    check('axe /menu: geen schendingen', axeM.length === 0, axeM.join('\n'));
    await page.screenshot({ path: `${UIT}/menu-ux-3-accordeon.png`, fullPage: true });
    check('geen onverwachte console-/HTTP-fouten', fouten.length === 0, fouten.slice(0, 6).join('\n'));
    await ctx.close();
  } catch (e) {
    check('e2e liep zonder uitzondering', false, String((e as Error)?.stack || e).slice(0, 800));
  } finally {
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();

  async function axe(page: Page, sel: string) {
    if (!existsSync(AXE)) return ['axe-core ontbreekt'];
    await page.evaluate(readFileSync(AXE, 'utf8'));
    return page.evaluate(async (s) => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } };
      const r = await w.axe.run({ include: [[s]] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
      return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    }, sel);
  }
}
