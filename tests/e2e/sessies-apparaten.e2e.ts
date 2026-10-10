// E2E «Сесії та пристрої» per fysiek apparaat (Chrome): pc met IPv4 + IPv6 samen, iPhone apart, pc met zelfde browser in een ander land
// apart; accordeon, vlag, bejdzjes aanmeldmethode, IP verborgen tot «Показати», «Завершити всі сесії на цьому пристрої» laat de
// huidige sessie staan. Donker + licht, axe zonder schendingen, geen console-/HTTP-fouten.
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
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const BE = { 'cf-ipcountry': 'BE', 'cf-ipcity': 'Antwerpen' };

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e sessies-apparaten');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-sa-${T}@example.test`, sub = `sub-e2e-sa-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  try {
    // andere «toestellen» eerst (eigen cookiejar elk); de Chrome-sessie als laatste, zodat die «dit apparaat» is
    await G.browser().aanmelden(sub, eigenaar, { service: 'mail', intent: 'login', ip: '2a02:1810:a:b:1111:2222:3333:4444', ua: WIN, kop: BE });
    await G.browser().aanmelden(sub, eigenaar, { service: 'mcp', intent: 'login', ip: '81.82.1.10', ua: WIN, kop: BE });
    await G.browser().aanmelden(sub, eigenaar, { service: 'mail', intent: 'login', ip: '2a02:a000::1', ua: IOS, kop: { 'cf-ipcountry': 'BE', 'cf-ipcity': 'Gent' } });
    await G.browser().aanmelden(sub, eigenaar, { service: 'identity', intent: 'login', ip: '203.0.113.7', ua: WIN, kop: { 'cf-ipcountry': 'UA', 'cf-ipcity': 'Kyiv' } });
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login', ip: '81.82.1.10', ua: WIN, kop: BE });

    const sessie = async (scheme: 'dark' | 'light') => {
      const ctx = await browser.newContext({ colorScheme: scheme, locale: 'uk-UA', viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Brussels', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });
      await page.goto(`${ID}/sessions?lang=uk`, { waitUntil: 'networkidle' });
      await page.locator('[data-sessie-apparaat]').first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(600);
      return { ctx, page };
    };

    const A = await sessie('dark');
    const page = A.page;
    const kaarten = page.locator('[data-sessie-apparaat]');
    const n = await kaarten.count();
    const koppen = await kaarten.locator('.sessie-kop').allInnerTexts();
    check('apparaten gegroepeerd: pc (België) met IPv4+IPv6, iPhone, pc in Oekraïne apart (≥3 kaarten)', n >= 3, koppen.map((k) => k.replace(/\s+/g, ' ')).join(' ‖ '));
    // De echte Chrome van de test is «dit apparaat» (Chromium op Linux, 127.0.0.1): de server werkt UA/IP bij met elk verzoek.
    const eerste = kaarten.first();
    check('dit apparaat bovenaan, uitgeklapt, badge «Цей пристрій»', /Цей пристрій/.test(koppen[0]) && (await eerste.locator('.sessie-kop').getAttribute('aria-expanded')) === 'true');
    const pc = kaarten.filter({ hasText: 'Antwerpen' }).first();
    const pcKop = await pc.locator('.sessie-kop').innerText();
    check('pc in België: Chrome 141 · Windows, «Antwerpen, Бельгія», vlag <img alt="Бельгія">, ingeklapt', /Chrome 141/.test(pcKop) && /Windows/.test(pcKop) && /Antwerpen, Бельгія/.test(pcKop) && await pc.locator('img.sessie-vlag[alt="Бельгія"]').count() === 1 && (await pc.locator('.sessie-kop').getAttribute('aria-expanded')) === 'false', pcKop);
    check('bejdzj aanmeldmethode «Google SSO»', await pc.locator('[data-sessie-methode="google"]').count() >= 1);
    await pc.locator('.sessie-kop').click();
    const v4 = pc.locator('.sessie-ip').filter({ hasText: 'IPv4' }), v6 = pc.locator('.sessie-ip').filter({ hasText: 'IPv6' });
    check('accordeon open: IPv4 én IPv6 bij hetzelfde apparaat (dual-stack samengevoegd), eerst verborgen', /81\.82\.•••\.•••/.test(await v4.innerText()) && /2a02:1810:••••/.test(await v6.innerText()), `${await v4.innerText()} | ${await v6.innerText()}`);
    await v6.getByRole('button', { name: 'Показати' }).click();
    check('«Показати» toont het volledige IPv6-adres', /2a02:1810:a:b:1111:2222:3333:4444/.test(await v6.innerText()));
    const diensten = await pc.locator('[data-sessie-rij]').count();
    check('diensten van de pc in de lijst (mail via IPv6 + mcp via IPv4)', diensten >= 2 && /Пошта/.test(await pc.innerText()) && /MCP/.test(await pc.innerText()), String(diensten));
    const iphone = kaarten.filter({ hasText: 'iOS' }).first();
    check('iPhone: ingeklapt, «Телефон», Gent', (await iphone.locator('.sessie-kop').getAttribute('aria-expanded')) === 'false' && /Телефон/.test(await iphone.innerText()) && /Gent/.test(await iphone.innerText()));
    await iphone.locator('.sessie-kop').click();
    check('accordeon: klik klapt de iPhone open (IPv4 «не спостерігалась»)', /не спостерігалась/.test(await iphone.locator('.sessie-ip').filter({ hasText: 'IPv4' }).innerText()));
    const vreemd = kaarten.filter({ hasText: 'Україна' }).first();
    check('pc in Kyiv (zelfde browser) staat apart van de pc in België', await vreemd.count() === 1 && !/Antwerpen/.test(await vreemd.innerText()));
    await page.screenshot({ path: `${UIT}/sessies-apparaten-donker.png`, fullPage: true });
    const axeD = await axe(page, '.security-sessions');
    check('axe (donker): geen schendingen', axeD.length === 0, axeD.join('\n'));

    // «Завершити всі сесії на цьому пристрої» op de pc in België: die kaart verdwijnt, de rest blijft, ik blijf aangemeld
    await pc.locator('[data-sessie-alle-op-apparaat]').click();
    await pc.getByRole('button', { name: 'Так, завершити' }).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('[data-sessie-apparaat]')].some((k) => /Antwerpen/.test(k.textContent || '')), null, { timeout: 15000 }).catch(() => undefined);
    check('na «Завершити всі на цьому пристрої»: pc in België weg', await kaarten.filter({ hasText: 'Antwerpen' }).count() === 0);
    check('andere apparaten ongemoeid en ik ben nog aangemeld', await kaarten.filter({ hasText: 'iOS' }).count() === 1 && await kaarten.filter({ hasText: 'Україна' }).count() === 1 && /Цей пристрій/.test(await kaarten.first().locator('.sessie-kop').innerText()));
    // op dit apparaat: de knop belooft dat de huidige sessie blijft
    const hier = kaarten.first();
    if (await hier.locator('[data-sessie-alle-op-apparaat]').count()) { await hier.locator('[data-sessie-alle-op-apparaat]').click(); check('op dit apparaat: bevestiging zegt dat de huidige aanmelding blijft', /залишиться/.test(await hier.innerText())); await hier.getByRole('button', { name: 'Скасувати' }).click(); }
    await A.ctx.close();

    const L = await sessie('light');
    await L.page.screenshot({ path: `${UIT}/sessies-apparaten-licht.png`, fullPage: true });
    const axeL = await axe(L.page, '.security-sessions');
    check('axe (licht): geen schendingen', axeL.length === 0, axeL.join('\n'));
    await L.ctx.close();
    check('geen onverwachte console-/HTTP-fouten', fouten.length === 0, fouten.slice(0, 6).join('\n'));
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
