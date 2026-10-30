// E2E UI-014 fase 2A — nieuwe kaarten «Новий вхід на новому пристрої», code vanaf ander apparaat, passkey, herstelcode in het
// ECHTE meldingencentrum (stand-ui014a.tsx). Schermafbeeldingen 390/1440 licht/donker naar E2E_SCREENSHOTS.
// Gebaseerd op: E2E UI-014 — het ECHTE meldingencentrum (src/CanoniekMeldingencentrum.tsx) in de stand stand-ui014.tsx MET de globale site-css
// (src/index.css), zoals op id.tarasevych.com/blokken. Controleert: voet in één regel (bugfix, zonder vlag), gelezen-status
// (server + activiteiten, ook groepen ×N), en met vlag meldingen-uitleg-v3: uitleg in de kaart, snelle acties, gevaarlijke actie
// pas na «Точно?», grootte S…XL met meeschalend paneel, bewaard op de (nep)server. Schermafbeeldingen 390/768/1440 licht/donker.
// Alleen lokaal; elk ander adres wordt afgebroken. MODUS=voor → alleen schermafbeeldingen (voor de oude code, zonder nieuwe checks).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { checker } from '../eenheid/hulp/nep-google';
import { chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/wp-ui014a/uitvoer/screens';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const VOOR = process.env.MODUS === 'voor';
const NU = new Date('2026-10-30T09:00:00+01:00').getTime();
type Page = import('playwright-core').Page;

const EVENTS = [
  { id: 'audit:e1', source: 'site', kind: 'site', type: 'owner.extensie.vernieuwing-geblokkeerd', subject: '', status: 'rejected', createdAt: NU - 38 * 3600_000, finishedAt: NU - 38 * 3600_000, doel: 'prive', code: '30d', eind: '2026-11-20T10:00:00.000Z' },
  { id: 'audit:e2', source: 'site', kind: 'site', type: 'owner.extensie.vernieuwing-geblokkeerd', subject: '', status: 'rejected', createdAt: NU - 57 * 3600_000, finishedAt: NU - 57 * 3600_000, doel: 'prive', code: '1d', eind: '2026-11-20T10:00:00.000Z' },
  ...[1, 2, 3].map((i) => ({ id: `cmd:w${i}`, source: 'agent', platform: 'windows', kind: 'command', type: 'fs.write', subject: 'Pavlo-PC', status: 'failed', createdAt: NU - (3 * 86400_000 + i * 3600_000), finishedAt: NU - 3 * 86400_000, doel: `C:\\miy-prostir\\app\\src\\bestand-${i}.ts`, reden: 'PAD_NIET_TOEGESTAAN' })),
];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e meldingen-ui014a');
  const map = mkdtempSync(join(tmpdir(), 'mui014a-'));
  await build({ entryPoints: ['tests/e2e/hulp/meldingen-stand/stand-ui014a.tsx'], outdir: map, entryNames: 'stand', bundle: true, format: 'esm', splitting: true, target: 'es2022', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' }, logLevel: 'error' });
  const css = `:root{--veilig-boven:0px;--veilig-onder:0px;--veilig-links:0px;--veilig-rechts:0px}`;
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stand ui014a</title><style>${css}</style><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body><script type="module" src="/stand.js"></script></body></html>`;
  const server = createServer((req, res) => {
    const p = (req.url || '/').split('?')[0];
    if (p === '/canonical-service.js') { res.writeHead(200, { 'content-type': 'text/javascript' }).end(existsSync('public/canonical-service.js') ? readFileSync('public/canonical-service.js') : ''); return; }
    const f = join(map, p.replace(/^\/+/, ''));
    if (p !== '/' && existsSync(f) && !p.endsWith('/')) { res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(f)); return; }
    res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const poort = (server.address() as { port: number }).port;
  mkdirSync(UIT, { recursive: true });
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(1) });
  const geweigerd: string[] = [], fouten: string[] = [], bekend: unknown[] = [];
  const open = async (o: { breedte: number; donker?: boolean; nl?: boolean }) => {
    const c = await browser.newContext({ viewport: { width: o.breedte, height: o.breedte < 500 ? 844 : 900 }, colorScheme: o.donker ? 'dark' : 'light', hasTouch: o.breedte < 500, isMobile: o.breedte < 500, locale: o.nl ? 'nl-BE' : 'uk-UA', timezoneId: 'Europe/Brussels' });
    const page = await c.newPage();
    await page.clock.setFixedTime(NU);
    await page.route('**/*', async (r) => {
      const u = new URL(r.request().url());
      if (u.hostname !== '127.0.0.1' || u.port !== String(poort)) { geweigerd.push(u.href); return r.abort(); }
      if (u.pathname.startsWith('/api/')) {
        let body: any = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch { /* leeg */ }
        let a: unknown = {};
        if (u.pathname.endsWith('/flags/meldingen-v2')) a = { key: 'meldingen-v2', value: true };
        else if (u.pathname.endsWith('/flags/meldingen-uitleg-v3')) a = { key: 'meldingen-uitleg-v3', value: true };
        else if (u.pathname === '/api/owner/meldingen/regels') a = { ok: true, regels: { versie: 1, regels: [], nietStoren: null, bijgewerkt: 0 } };
        else if (u.pathname === '/api/owner/agents/activity') a = { events: [], now: NU, sfeer: 'prive' };
        else if (u.pathname === '/api/owner/meldingen/gelezen') a = { ok: true, ids: [] };
        else if (u.pathname === '/api/meldingen/apparaat-bekend') { bekend.push(body); a = { ok: true }; }
        else a = { ok: true };
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(a) });
      }
      return r.continue();
    });
    page.on('pageerror', (e) => fouten.push(String(e)));
    await page.goto(`http://127.0.0.1:${poort}/${o.nl ? 'nl/' : ''}?v2=1&v3=1&nu=${NU}&thema=${o.donker ? 'donker' : 'licht'}`);
    await page.waitForSelector('[data-qa-id="canonical-notification-bell"]', { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.click('[data-qa-id="canonical-notification-bell"]'); await page.waitForSelector('.mv2'); await page.waitForTimeout(250);
    await page.click('.mv2-segment button:nth-child(2)').catch(() => undefined); await page.waitForTimeout(200);
    return { c, page };
  };
  const shot = (p: Page, naam: string) => p.screenshot({ path: join(UIT, `${naam}.png`), animations: 'disabled' }).catch(() => undefined);
  const kaartOpen = async (p: Page, tekst: string | RegExp) => {
    const k = p.locator('.mv2-rij', { hasText: tekst }).first();
    if (!(await k.count())) return null;
    await k.locator('.mv2-hoofd').click(); await p.waitForTimeout(250);
    return { k, u: k.locator('.mv2u').first() };
  };
  try {
    for (const breedte of [390, 768, 1440]) for (const donker of [false, true]) {
      const thema = donker ? 'donker' : 'licht', tag = `${breedte} ${thema}`;
      const { c, page } = await open({ breedte, donker });
      const r = await kaartOpen(page, 'Новий вхід на новому пристрої');
      check(`${tag}: kaart «Новий вхід на новому пристрої» staat in het paneel`, !!r);
      if (r) {
        const t = (await r.u.textContent()) || '';
        check(`${tag}: soort nieuw-apparaat, risico hoog`, (await r.u.getAttribute('data-soort')) === 'nieuw-apparaat' && (await r.u.getAttribute('data-risico')) === 'hoog');
        check(`${tag}: WIE = e-mail van het account`, t.includes('eigenaar@example.test'));
        check(`${tag}: Коли in Брюссель`, /Брюссель/.test(t));
        check(`${tag}: uitleg zonder Nederlands`, !/aanmelding|apparaat «/.test(t));
        const kaartTekst = (await r.k.textContent()) || '';
        check(`${tag}: apparaat, regio en methode zichtbaar in de kaart`, kaartTekst.includes('Safari/iOS') && kaartTekst.includes('Antwerpen') && kaartTekst.includes('Google'));
        const nietIk = r.u.locator('button.mv2u-actie.is-gevaar', { hasText: 'Це не я' });
        check(`${tag}: knoppen «Це був я» en «Це не я — завершити сеанс і змінити доступ»`, await r.u.locator('button.mv2u-actie', { hasText: 'Це був я' }).count() === 1 && await nietIk.count() === 1);
        if (breedte === 1440 && !donker) {
          await nietIk.click(); await page.waitForTimeout(150);
          const a = r.u.locator('a.mv2u-actie.is-bevestigd');
          check('«Це не я»: eerst bevestigen, daarna link naar sessiebeheer (/sessions), niets automatisch', page.url().startsWith('http://127.0.0.1') && await a.count() === 1 && /^https:\/\/id\.tarasevych\.com\/sessions\?apparaat=/.test((await a.getAttribute('href')) || ''));
        }
        await r.u.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => undefined); await page.waitForTimeout(150);
        await shot(page, `ui014a-${breedte}-${thema}-nieuw-apparaat`);
        if (breedte === 390 && !donker) {
          const knop = r.u.locator('button.mv2u-actie', { hasText: 'Це був я' });
          const bb = await knop.boundingBox();
          check('390: «Це був я» tikdoel ≥ 44 px hoog', !!bb && bb.height >= 43.5, String(bb?.height));
          await knop.click(); await page.waitForTimeout(400);
          check('«Це був я» → POST apparaat-bekend met het apparaat-id', bekend.some((b: any) => b?.id === '81a2a8ce-e8ab-4150-9a20-36f7365664e6'), JSON.stringify(bekend));
        }
        check(`${tag}: geen horizontale overloop`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      }
      if (breedte === 1440) {
        const code = await kaartOpen(page, 'з іншого пристрою');
        check(`${tag}: kaart code vanaf ander apparaat → code-ander-apparaat`, !!code && (await code.u.getAttribute('data-soort')) === 'code-ander-apparaat');
        if (code && !donker) await shot(page, `ui014a-1440-licht-code-ander-apparaat`);
        const pk = await kaartOpen(page, 'Новий passkey');
        check(`${tag}: kaart passkey → passkey-gewijzigd`, !!pk && (await pk.u.getAttribute('data-soort')) === 'passkey-gewijzigd');
        const hc = await kaartOpen(page, 'Використано код відновлення');
        check(`${tag}: kaart herstelcode → herstelcode`, !!hc && (await hc.u.getAttribute('data-soort')) === 'herstelcode');
        if (hc && donker) { await hc.u.evaluate((el) => el.scrollIntoView({ block: 'center' })); await shot(page, 'ui014a-1440-donker-herstelcode'); }
      }
      await c.close();
    }
    { const { c, page } = await open({ breedte: 1440, nl: true });
      const r = await kaartOpen(page, 'Nieuwe aanmelding op een nieuw apparaat');
      const t = r ? (await r.u.textContent()) || '' : '';
      check('nl: kaart en uitleg in het Nederlands (Wie/Wanneer, «Dit was ik»)', !!r && t.includes('Wie') && t.includes('Dit was ik') && !/Хто|Коли/.test(t));
      await shot(page, 'ui014a-1440-licht-nl-nieuw-apparaat'); await c.close(); }
    check('geen verzoek buiten de lokale stand', geweigerd.length === 0, geweigerd.slice(0, 3).join(' '));
    check('geen JavaScript-fouten', fouten.length === 0, fouten.slice(0, 3).join(' | '));
  } finally {
    await browser.close().catch(() => undefined);
    server.close();
  }
  return einde();
}
