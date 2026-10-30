// E2E (echte Chrome, lokale build): technische bundels alleen voor een sessie met actief technisch profiel.
//  1) aangemeld, ZONDER technisch profiel: mail en hub vragen geen enkel bestand onder /assets/tech/; zelf ophalen → 404;
//  2) technisch profiel aan → admin laadt de beheerbundel uit /assets/tech/ (200, Cache-Control: private, no-store, Vary: Cookie);
//  3) uitzetten → de cookie is weg en /assets/tech/ is weer 404;
//  4) Налаштування → Акаунт: «Стан моїх служб» zichtbaar, op 390 px zonder horizontaal scrollen.
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { startE2eServer, chromeArgs } from './server';
import { techAan } from './hulp/tech';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MAIL = 'https://mail.tarasevych.com', HUB = 'https://hub.tarasevych.com', ADMIN = 'https://admin.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e tech-assets');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-ta-${T}@example.test`, sub = `sub-e2e-ta-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const dist = resolve(process.env.E2E_DIST || 'dist');
  const techBestand = readdirSync(join(dist, 'assets', 'tech')).find((f) => f.endsWith('.js')) || '';
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [...chromeArgs(POORT), '--ignore-certificate-errors'] });
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    const r = await b.aanmelden(sub, eigenaar, { service: 'mail', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    check('aanmelden gaf een sessie', r.cb.data.sessionCreated === true, JSON.stringify(r.cb.data).slice(0, 160));
    const ctx = await browser.newContext({ locale: 'uk-UA', viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', ignoreHTTPSErrors: true });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MAIL, HUB, ADMIN].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const page = await ctx.newPage();
    const tech: Array<{ url: string; status: number; cc: string; vary: string }> = [];
    page.on('response', (q) => { if (new URL(q.url()).pathname.startsWith('/assets/tech/') && q.request().resourceType() !== 'fetch') tech.push({ url: q.url(), status: q.status(), cc: q.headers()['cache-control'] || '', vary: q.headers().vary || '' }); });
    const fouten: string[] = [];
    page.on('pageerror', (e) => fouten.push(e.message));

    // 1) mail en hub zonder technisch profiel
    await page.goto(`${MAIL}/inbox`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.goto(`${HUB}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    check('mail + hub zonder tech: GEEN verzoek naar /assets/tech/', tech.length === 0, tech.map((x) => x.url).join(' '));
    const zelf = await page.evaluate(async (f) => (await fetch(`/assets/tech/${f}`, { credentials: 'include' })).status, techBestand);
    check(`zelf ophalen van /assets/tech/${techBestand} zonder tech: 404`, zelf === 404, String(zelf));
    await page.goto(`${ADMIN}/`, { waitUntil: 'networkidle' });
    check('admin zonder tech: poort, geen beheerbundel geladen', tech.length === 0 && (await page.locator('[data-tech-poort="1"]').count()) > 0, `${tech.length}`);

    // 2) technisch profiel aan
    check('technisch profiel aangezet', (await techAan(page, { url: ADMIN, tab, service: 'admin', reden: 'E2E tech-assets' })) === 200);
    await page.goto(`${ADMIN}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const geladen = tech.filter((x) => x.status === 200);
    check('met tech: beheerbundel uit /assets/tech/ geladen (200)', geladen.length > 0 && tech.every((x) => x.status === 200), tech.map((x) => `${x.status} ${x.url.split('/').pop()}`).join(' '));
    check('met tech: Cache-Control private, no-store + Vary: Cookie op elk technisch bestand', geladen.every((x) => x.cc === 'private, no-store' && x.vary === 'Cookie'), geladen.map((x) => `${x.cc}|${x.vary}`).join(' '));
    check('met tech: geen witte pagina (geen melding «Технічні модулі не завантажено»)', (await page.locator('[data-tech-bundel="fout"]').count()) === 0);

    // 3) uitzetten
    const uit = await page.evaluate(async (t) => (await fetch('/api/owner/tech/beeindigen', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'admin', tabContext: t, sourceOrigin: location.origin }) })).status, tab);
    const na = await page.evaluate(async (f) => (await fetch(`/assets/tech/${f}?na=1`, { credentials: 'include' })).status, techBestand);
    check('na uitzetten: /assets/tech/ weer 404', uit === 200 && na === 404, `${uit} ${na}`);

    // 4) «Стан моїх служб» op 390 px
    const tel = await browser.newContext({ locale: 'uk-UA', viewport: { width: 390, height: 844 }, serviceWorkers: 'block', ignoreHTTPSErrors: true });
    await tel.addCookies([...b.jar].map(([name, value]) => ({ name, value, url: `${ID}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const })));
    await tel.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    const p2 = await tel.newPage();
    await p2.goto(`${ID}/account`, { waitUntil: 'networkidle' });
    const sectie = p2.locator('[data-mijn-diensten="1"]');
    const zichtbaar = await sectie.waitFor({ timeout: 15000 }).then(() => true, () => false);
    check('Налаштування → Акаунт: «Стан моїх служб» zichtbaar', zichtbaar, (await p2.locator('body').innerText().catch(() => '')).slice(0, 160));
    if (zichtbaar) {
      await p2.locator('[data-mijn-diensten-knop="1"]').click();
      await p2.waitForResponse((q) => q.url().endsWith('/api/owner/diagnostiek/mijn-diensten') && q.request().postData()?.includes('"uitvoeren":true') === true, { timeout: 20000 }).catch(() => null);
      await p2.waitForTimeout(500);
      const rijen = await p2.locator('[data-mdt-dienst]').count();
      check('«Перевірити зараз»: 7 diensten, kolom «Мій акаунт», geen serverkolom', rijen === 7 && ((await sectie.textContent()) || '').includes('Мій акаунт') && !((await sectie.textContent()) || '').includes('Сервер (для всіх)'), String(rijen));
      const breed = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check('390 px: geen horizontaal scrollen', breed <= 1, String(breed));
      await sectie.screenshot({ path: `${UIT}/mijn-diensten-390.png` }).catch(() => undefined);
    }
    check('geen paginafouten', fouten.length === 0, fouten.join(' | ').slice(0, 300));
  } finally {
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
