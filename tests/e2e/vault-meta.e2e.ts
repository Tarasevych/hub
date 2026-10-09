// E2E kluis: sleutel met termijn, eigenaar en verantwoordelijke (api.*/vault en admin.*/contour) met een echte Chrome.
// Toevoegen met «Рік» → «Діє до … · залишилось …»; «Деталі» → einde over 3 dagen → «Скоро закінчиться»; de waarde verschijnt
// nergens in de pagina; licht/donker leesbaar (axe), 360 px zonder horizontaal scrollen, geen consolefouten.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { startE2eServer, chromeArgs } from './server';
import { vandaag } from '../../shared/vault-meta';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const AXE = process.env.AXE_CORE || join(dirname(PW), 'axe-core', 'axe.min.js');
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', API = 'https://api.tarasevych.com', ADMIN = 'https://admin.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const VERWACHT = [/^403 .*\/api\/owner\/agents\/activity$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e vault-meta');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-vm-${T}@example.test`, sub = `sub-e2e-vm-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const GEHEIM = `ha-${randomBytes(12).toString('hex')}`;
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    const context = async (scheme: 'dark' | 'light', breedte = 1280) => {
      const ctx = await browser.newContext({ colorScheme: scheme, locale: 'uk-UA', viewport: { width: breedte, height: 900 }, timezoneId: 'Europe/Brussels', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, API, ADMIN, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
      return { ctx, page: await ctx.newPage() };
    };
    const fouten: string[] = [];
    const volg = (page: Page) => {
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });
    };
    const axe = async (page: Page, sel: string) => {
      if (!existsSync(AXE)) return ['axe-core ontbreekt'];
      await page.evaluate(readFileSync(AXE, 'utf8'));
      return page.evaluate(async (s) => {
        const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } };
        const r = await w.axe.run({ include: [[s]] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
        return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      }, sel);
    };

    // ---------------------------------------------------------------- api.*/vault: toevoegen met metadata
    const A = await context('dark');
    volg(A.page);
    await A.page.goto(`${API}/vault?lang=uk`, { waitUntil: 'networkidle' });
    const paneel = A.page.locator('[data-api-vault-panel]');
    await paneel.waitFor({ timeout: 20000 });
    await paneel.locator('input[name="vault-name"]').fill('HA_TOKEN');
    await paneel.locator('input[name="vault-value"]').fill(GEHEIM);
    const velden = paneel.locator('.vault-meta-velden');
    await velden.getByLabel('Належить').selectOption('service');
    await velden.getByLabel(/^Назва/).fill('Home Assistant');
    await velden.getByLabel('Відповідальний').fill('Павло');
    await velden.getByRole('button', { name: 'Рік' }).click();
    await paneel.getByRole('button', { name: 'Зберегти зашифровано' }).click();
    const rij = paneel.locator('[data-api-vault-name="HA_TOKEN"]');
    await rij.waitFor({ timeout: 10000 });
    const regel = await rij.locator('.vault-meta').innerText();
    check('api/vault: na toevoegen «Діє до … · залишилось», «Належить: Сервіс · Home Assistant», «Відповідальний: Павло»',
      /Діє до \d{4}-\d{2}-\d{2} · залишилось 36[56] днів/.test(regel) && /Належить: Сервіс · Home Assistant/.test(regel) && /Відповідальний: Павло/.test(regel), regel);
    check('de waarde staat nergens in de pagina', !(await A.page.content()).includes(GEHEIM));
    await rij.getByRole('button', { name: 'Деталі: строк і власник' }).click();
    const bewerk = rij.locator('.vault-meta-bewerker form');
    const over3 = new Date(Date.parse(`${vandaag()}T12:00:00Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
    await bewerk.getByLabel('Діє до (включно)').fill(over3);
    await bewerk.getByRole('button', { name: 'Зберегти деталі' }).click();
    await rij.locator('.vault-meta-termijn.is-bijna').waitFor({ timeout: 10000 }).catch(() => undefined);
    check('«Деталі» → einde over 3 dagen: «Скоро закінчиться: залишилось 3 дні» (oranje), waarde onaangeroerd',
      /Скоро закінчиться: залишилось 3 дні/.test(await rij.locator('.vault-meta').innerText()) && await rij.locator('.vault-meta-termijn.is-bijna').count() === 1);
    await A.page.screenshot({ path: `${UIT}/vault-1-api-donker.png`, fullPage: true });
    const axeD = await axe(A.page, '[data-api-vault-panel]');
    check('axe (donker): kluispaneel zonder schendingen', axeD.length === 0, axeD.join('\n'));

    // ---------------------------------------------------------------- melding in het meldingencentrum
    const meld = await A.page.evaluate(async () => { const r = await fetch('/api/owner/session/bootstrap', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service: 'api', tabContext: sessionStorage.getItem('tsv-canonical-tab-v1'), sourceOrigin: location.origin }) }); return r.json(); });
    const items = JSON.stringify(meld).match(/Ключ «HA_TOKEN» скоро закінчиться/g) || [];
    check('meldingencentrum: «Ключ «HA_TOKEN» скоро закінчиться» precies één keer', items.length === 1, JSON.stringify(meld).slice(0, 300));

    // ---------------------------------------------------------------- admin.*/contour + licht + 360 px
    const L = await context('light', 360);
    volg(L.page);
    await L.page.goto(`${ADMIN}/contour?lang=uk`, { waitUntil: 'networkidle' });
    const kaart = L.page.locator('[data-admin-key-name="HA_TOKEN"]');
    await kaart.waitFor({ timeout: 20000 }).catch(() => undefined);
    check('admin/contour: dezelfde metadata op de kaart', /Скоро закінчиться/.test(await kaart.innerText().catch(() => '')) && /Home Assistant/.test(await kaart.innerText().catch(() => '')));
    const breed = await L.page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
    check('360 px: geen horizontaal scrollen', breed.s <= breed.w + 1, JSON.stringify(breed));
    await L.page.screenshot({ path: `${UIT}/vault-2-admin-360-licht.png`, fullPage: true });
    const axeL = await axe(L.page, '[data-admin-key-name="HA_TOKEN"]');
    check('axe (licht): sleutelkaart zonder schendingen', axeL.length === 0, axeL.join('\n'));

    check('geen consolefouten of onverwachte HTTP-fouten', fouten.length === 0, fouten.slice(0, 8).join('\n'));
    await A.ctx.close(); await L.ctx.close();
  } catch (e) {
    check('e2e liep zonder uitzondering', false, String((e as Error)?.stack || e).slice(0, 800));
  } finally {
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
