// E2E thema's (Chrome): Налаштування → Теми — palet «Чистий» + Темний = zuiver zwart (QLED); «Кольоровий» volgt de sectie
// (id: grijs, mail: blauw); «Автоматично» met een venster rond NU → donker, «Призупинити до наступного перемикання» → licht;
// keuze blijft na F5 en geldt op een ander subdomein; eerste beeld al juist (opstartscript, geen flits). axe licht + donker.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { startE2eServer, chromeArgs } from './server';
import { kleurWaarden } from '../../src/thema/paletten';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const AXE = process.env.AXE_CORE || join(dirname(PW), 'axe-core', 'axe.min.js');
const ID = 'https://id.tarasevych.com', MAIL = 'https://mail.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const VERWACHT = [/^403 .*\/api\/owner\/agents\/activity$/, /\/api\/owner\/mail\//];
const rgb = (h: string) => { const v = h.replace('#', ''); return `rgb(${parseInt(v.slice(0, 2), 16)}, ${parseInt(v.slice(2, 4), 16)}, ${parseInt(v.slice(4, 6), 16)})`; };

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e thema');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-th-${T}@example.test`, sub = `sub-e2e-th-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login' });
    const ctx = await browser.newContext({ colorScheme: 'light', locale: 'uk-UA', viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Brussels', serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MAIL, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });
    const open = async (url: string) => { await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); };
    const bg = () => page.evaluate(() => getComputedStyle(document.querySelector('.canonical-chrome') || document.body).backgroundColor);
    const accent = () => page.evaluate(() => getComputedStyle(document.querySelector('.canonical-chrome') || document.documentElement).getPropertyValue('--accent').trim());
    const html = () => page.evaluate(() => document.documentElement.className);

    await open(`${ID}/themes?lang=uk`);
    await page.locator('[data-thema-instellingen]').waitFor({ timeout: 20000 });
    check('standaard: «Кольоровий» + «Як на пристрої» (licht apparaat → licht)', (await page.locator('[data-thema-palet="kleur"]').getAttribute('aria-checked')) === 'true' && (await page.locator('[data-thema-modus="device"]').getAttribute('aria-checked')) === 'true' && /theme-light/.test(await html()) && /palet-kleur/.test(await html()));
    check('«Кольоровий» op id.*: accent = sectiekleur van «Налаштування»', (await accent()).toLowerCase() === kleurWaarden('identity').licht.accent, await accent());
    await page.screenshot({ path: `${UIT}/thema-1-instellingen-licht.png`, fullPage: true });
    const axeL = await axe(page, '[data-thema-instellingen]');
    check('axe (licht): geen schendingen', axeL.length === 0, axeL.join('\n'));

    // Чистий + Темний = zuiver zwart
    await page.locator('[data-thema-palet="puur"]').click();
    await page.locator('[data-thema-modus="dark"]').click();
    await page.waitForTimeout(300);
    check('«Чистий» + «Темний» → achtergrond zuiver zwart (QLED)', (await bg()) === 'rgb(0, 0, 0)' && /palet-puur/.test(await html()) && /theme-dark/.test(await html()), await bg());
    const axeD = await axe(page, '[data-thema-instellingen]');
    check('axe (zuiver zwart): geen schendingen', axeD.length === 0, axeD.join('\n'));
    await page.screenshot({ path: `${UIT}/thema-2-puur-zwart.png`, fullPage: true });
    // Чистий + Світлий = zuiver wit
    await page.locator('[data-thema-modus="light"]').click(); await page.waitForTimeout(300);
    check('«Чистий» + «Світлий» → zuiver wit', (await bg()) === 'rgb(255, 255, 255)', await bg());

    // F5: eerste beeld (opstartscript) al juist, vóór React
    await page.locator('[data-thema-modus="dark"]').click(); await page.waitForTimeout(300);
    // klasse op het moment dat <body> ontstaat: dat is vóór elke module/React — het opstartscript heeft dan al beslist
    await ctx.addInitScript(() => { const w = window as unknown as { __vroeg?: string }; new MutationObserver((_, o) => { if (document.body && w.__vroeg === undefined) { w.__vroeg = document.documentElement.className + '|' + getComputedStyle(document.documentElement).getPropertyValue('--boot-bg'); o.disconnect(); } }).observe(document, { childList: true, subtree: true }); });
    await page.goto(`${ID}/themes?lang=uk`, { waitUntil: 'domcontentloaded' });
    const vroeg = await page.evaluate(() => String((window as unknown as { __vroeg?: string }).__vroeg));
    const bootCss = await page.evaluate(async () => (await fetch('/canonical-boot.css')).text());
    check('na F5 zet het opstartscript meteen palet-puur + theme-dark; opstartscherm-CSS kent zuiver zwart (geen witte flits)', /palet-puur/.test(vroeg) && /theme-dark/.test(vroeg) && bootCss.includes('html.palet-puur.theme-dark{--boot-bg:#000000'), vroeg);
    await page.waitForLoadState('networkidle');

    // Ander subdomein: keuze geldt overal; «Кольоровий» op mail.* = blauw
    await page.locator('[data-thema-palet="kleur"]').click(); await page.locator('[data-thema-modus="light"]').click(); await page.waitForTimeout(300);
    await open(`${MAIL}/?lang=uk`);
    check('mail.*: «Кольоровий» → accent van Пошта (blauw)', (await accent()).toLowerCase() === kleurWaarden('mail').licht.accent && /palet-kleur/.test(await html()), await accent());
    await page.screenshot({ path: `${UIT}/thema-3-mail-kleur.png` });

    // Автоматично: venster rond NU → donker; pauze → licht; hervatten → donker
    await open(`${ID}/themes?lang=uk`);
    await page.locator('[data-thema-modus="auto"]').click();
    await page.locator('[data-thema-auto-instellingen]').waitFor();
    await page.locator('.thema-soort input').nth(1).check();
    const nu = new Date(), hh = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    await page.locator('[data-thema-van]').fill(hh(new Date(nu.getTime() - 3600e3)));
    await page.locator('[data-thema-tot]').fill(hh(new Date(nu.getTime() + 3600e3)));
    await page.waitForTimeout(500);
    check('«Автоматично» (venster rond nu) → donker, status «Зараз темна»', /theme-dark/.test(await html()) && /Зараз темна/.test(await page.locator('[data-thema-status]').innerText()), await page.locator('[data-thema-status]').innerText());
    await page.locator('[data-thema-status] [data-thema-pauze]').click(); await page.waitForTimeout(400);
    check('«Призупинити до наступного перемикання» → licht + «призупинено»', /theme-light/.test(await html()) && /призупинено/.test(await page.locator('[data-thema-status]').innerText()));
    await page.reload({ waitUntil: 'networkidle' });
    check('pauze blijft na F5', /theme-light/.test(await html()));
    await page.locator('[data-thema-status] [data-thema-pauze]').click(); await page.waitForTimeout(400);
    check('«Повернути автоперемикання» → weer donker', /theme-dark/.test(await html()));
    await page.screenshot({ path: `${UIT}/thema-4-auto.png`, fullPage: true });
    // zon-modus: tekst met tijden
    await page.locator('.thema-soort input').nth(0).check(); await page.waitForTimeout(300);
    check('«Коли надворі темно»: toont vandaag licht van … tot …', /Сьогодні світла з \d{2}:\d{2} до \d{2}:\d{2}/.test(await page.locator('[data-thema-zon]').innerText()));
    // Permissions-Policy: locatie alleen op id.* (na een klik, de browser vraagt toestemming); elders blijft het verboden
    const ppId = await page.evaluate(async () => (await fetch('/themes', { cache: 'no-store' })).headers.get('permissions-policy') || '');
    await open(`${MAIL}/?lang=uk`);
    const ppMail = await page.evaluate(async () => (await fetch('/', { cache: 'no-store' })).headers.get('permissions-policy') || '');
    check('Permissions-Policy: geolocation=(self) alleen op id.*, op mail.* geolocation=()', /geolocation=\(self\)/.test(ppId) && /geolocation=\(\)/.test(ppMail) && /camera=\(\)/.test(ppId), `${ppId} | ${ppMail}`);
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
