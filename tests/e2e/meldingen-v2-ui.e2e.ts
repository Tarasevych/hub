// E2E «Meldingen v2» (vlag meldingen-v2, UI-007) in ISOLATIE: het echte meldingencentrum (stand hulp/meldingen-stand) met ~200
// meldingen, /api beantwoord door een nepserver in het geheugen (vlag, regels opslaan/lezen). Schermafbeeldingen vóór (vlag uit)
// en ná (vlag aan) op 390/768/1440, licht en donker. Alleen lokaal; andere hosts worden afgebroken.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { checker } from '../eenheid/hulp/nep-google';
import { chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/wp-ui007/screens';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const NU = new Date('2026-10-29T15:00:00+01:00').getTime();
type Page = import('playwright-core').Page;

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e meldingen-v2-ui');
  const map = mkdtempSync(join(tmpdir(), 'mv2-'));
  await build({ entryPoints: ['tests/e2e/hulp/meldingen-stand/stand.tsx'], outdir: map, bundle: true, format: 'esm', splitting: true, target: 'es2022', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' }, logLevel: 'error' });
  const css = `:root{--veilig-boven:0px;--veilig-onder:0px;--veilig-links:0px;--veilig-rechts:0px}body{margin:0;font:15px system-ui,sans-serif}`;
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stand meldingen</title><style>${css}</style><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body><script type="module" src="/stand.js"></script></body></html>`;
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
  const geweigerd: string[] = [], fouten: string[] = [];
  // Nepserver: één regelopslag voor ALLE contexten = «tweede apparaat» ziet dezelfde regels.
  let serverRegels: unknown = null; const aanroepen: string[] = [];
  const open = async (o: { v2: boolean; breedte?: number; donker?: boolean; nl?: boolean }) => {
    const breedte = o.breedte ?? 1440;
    const c = await browser.newContext({ viewport: { width: breedte, height: breedte <= 768 ? (breedte < 500 ? 820 : 1024) : 900 }, colorScheme: o.donker ? 'dark' : 'light', hasTouch: breedte < 500, locale: o.nl ? 'nl-BE' : 'uk-UA', timezoneId: 'Europe/Brussels' });
    const page = await c.newPage();
    await page.clock.setFixedTime(NU);
    await page.route('**/*', async (r) => {
      const u = new URL(r.request().url());
      if (u.hostname !== '127.0.0.1' || u.port !== String(poort)) { geweigerd.push(u.href); return r.abort(); }
      if (u.pathname.startsWith('/api/')) {
        aanroepen.push(u.pathname);
        let body: any = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch { /* leeg */ }
        let a: unknown = {};
        if (u.pathname.endsWith('/flags/meldingen-v2')) a = { key: 'meldingen-v2', value: o.v2 };
        else if (u.pathname === '/api/owner/meldingen/regels') a = { ok: true, regels: serverRegels ?? { versie: 1, regels: [], nietStoren: null, bijgewerkt: 0 } };
        else if (u.pathname === '/api/owner/meldingen/regels/opslaan') { serverRegels = body.regels; a = { ok: true, regels: body.regels }; }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(a) });
      }
      return r.continue();
    });
    page.on('pageerror', (e) => fouten.push(String(e)));
    await page.goto(`http://127.0.0.1:${poort}/${o.nl ? 'nl/' : ''}?v2=${o.v2 ? 1 : 0}&nu=${NU}&thema=${o.donker ? 'donker' : 'licht'}`);
    await page.waitForSelector('[data-qa-id="canonical-notification-bell"]', { timeout: 15000 }).catch(async (e) => { console.log('DEBUG', breedte, fouten.join(' | '), (await page.content()).slice(0, 2500)); throw e; });
    await page.waitForTimeout(300);
    return { c, page };
  };
  const shot = (p: Page, naam: string) => p.screenshot({ path: join(UIT, `${naam}.png`), animations: 'disabled' }).catch(() => undefined);
  const openPaneel = async (p: Page) => { await p.click('[data-qa-id="canonical-notification-bell"]'); await p.waitForSelector('[data-qa-id="canonical-notification-panel"]'); await p.waitForTimeout(250); };
  const belTeller = (p: Page) => p.locator('[data-qa-id="canonical-notification-bell"] small').textContent().catch(() => null);
  let oudeTeller = 0;
  try {
    for (const breedte of [390, 768, 1440]) for (const donker of [false, true]) {
      const thema = donker ? 'donker' : 'licht';
      { const { c, page } = await open({ v2: false, breedte, donker }); if (breedte === 1440 && !donker) oudeTeller = Number(String(await belTeller(page)).replace('+', '')) || 0; await openPaneel(page); if (breedte === 1440 && !donker) check('vlag uit: oud paneel (geen .mv2)', await page.locator('.mv2').count() === 0 && await page.locator('.cnc-list').count() === 1); await shot(page, `voor-${breedte}-${thema}`); await c.close(); }
      { const { c, page } = await open({ v2: true, breedte, donker }); await openPaneel(page); await shot(page, `na-${breedte}-${thema}`);
        const overloop = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        const paneel = await page.locator('[data-qa-id="canonical-notification-panel"]').boundingBox();
        check(`v2 ${breedte} ${thema}: geen horizontale overloop, paneel binnen scherm`, overloop && !!paneel && paneel.x >= -1 && paneel.x + paneel.width <= breedte + 1);
        if (breedte === 390) { const klein = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.mv2 button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width && r.height && r.height < 36; }).length); check(`v2 390 ${thema}: knoppen ≥ 36 px (pictogrammen 44 px)`, klein === 0, `${klein} kleiner`); }
        await c.close(); }
    }
    // Functioneel (1440 licht)
    const { c, page } = await open({ v2: true });
    const teller = await belTeller(page);
    check('v2: belteller klein (items die tellen) en veel lager dan oud', Number(teller || 0) > 0 && Number(teller || 0) <= 10 && Number(teller) < oudeTeller, `oud ${oudeTeller} → nieuw ${teller}`);
    await openPaneel(page);
    const rijen = await page.locator('.mv2-rij').count();
    check('v2: «Важливі» toont alleen aandacht-items', rijen >= 1 && rijen <= 6, `${rijen} rijen`);
    check('v2: geen technische ruis (extensie/herhaalpoging) in de lijst', await page.locator('.mv2-rij', { hasText: /Розширення|Повторна спроба/ }).count() === 0);
    await page.click('.mv2-segment [role=tab]:nth-child(2)');
    const alle = await page.locator('.mv2-rij').count();
    check('v2: «Усі» — 120 adrescontrole-regels = 1 rij met ×120', await page.locator('.mv2-rij', { hasText: 'Перевірку всіх адрес' }).count() === 1 && /×120/.test((await page.locator('.mv2-rij', { hasText: 'Перевірку всіх адрес' }).textContent()) || ''), `${alle} rijen totaal`);
    check('v2: accountlabel «Робочий» en gemaskeerd adres bij twee Google-accounts', await page.locator('.mv2-account', { hasText: 'Робочий' }).count() >= 1 && await page.locator('.mv2-account', { hasText: 'p…@gmail.com' }).count() >= 1);
    check('v2: aanbieder alleen waar opgegeven (geen Google bij agenda)', await page.locator('.mv2-rij', { hasText: 'бухгалтером' }).locator('.mv2-aanbieder').count() === 0);
    await shot(page, 'na-1440-licht-alle');
    // OneDrive: fout + later succes → opgelost, geen aandacht
    check('v2: OneDrive-fout opgelost door latere synchronisatie (1 rij, geen rood)', await page.locator('.mv2-rij.e-fout', { hasText: 'OneDrive' }).count() === 0 && await page.locator('.mv2-rij', { hasText: 'OneDrive' }).count() === 1);
    // Zoeken
    await page.click('.mv2-kop [aria-label="Пошук"]');
    await page.keyboard.type('OneDrive');
    check('v2: zoeken filtert live', await page.locator('.mv2-rij').count() === 1);
    await shot(page, 'na-1440-licht-zoeken');
    await page.keyboard.press('Escape');
    check('v2: Esc wist en sluit zoeken', await page.locator('.mv2-zoek').count() === 0 && await page.locator('.mv2-rij').count() > 1);
    // Filters
    await page.click('.mv2-kop [aria-label="Фільтри й порядок"]');
    await shot(page, 'na-1440-licht-filters');
    check('v2: één contextpaneel met bron/status/periode/volgorde', await page.locator('.mv2-context .mv2-label').count() >= 4);
    await page.click('.mv2-context-voet .is-hoofd');
    // Contextmenu + regel «тихі» → server
    const rij = page.locator('.mv2-rij', { hasText: 'Анна поділилася' });
    await rij.locator('[aria-haspopup=menu]').click();
    await shot(page, 'na-1440-licht-menu');
    check('v2: contextmenu met 5 gevraagde acties', await page.locator('.mv2-menu [role=menuitem]').count() >= 4 && await page.locator('.mv2-menu', { hasText: 'Зробити тихими події цього типу' }).count() === 1 && await page.locator('.mv2-menu', { hasText: 'Налаштувати джерело' }).count() === 1);
    await page.locator('.mv2-menu [role=menuitem]', { hasText: 'Зробити тихими' }).click();
    await page.waitForTimeout(300);
    check('v2: regel server-side opgeslagen', aanroepen.includes('/api/owner/meldingen/regels/opslaan') && JSON.stringify(serverRegels).includes('"stil"'));
    // Beschermd: geen dempen aangeboden
    await page.locator('.mv2-rij', { hasText: 'Новий вхід' }).locator('[aria-haspopup=menu]').click();
    check('v2: beveiligingsmelding — dempen niet aangeboden', await page.locator('.mv2-menu', { hasText: 'приглушити не можна' }).count() === 1 && await page.locator('.mv2-menu', { hasText: 'Зробити тихими' }).count() === 0);
    await page.keyboard.press('Escape');
    // Niet storen
    await page.click('.mv2-kop [aria-label="Не турбувати"]');
    await page.locator('.mv2-context .mv2-chips button').nth(1).click();
    await page.waitForTimeout(300);
    check('v2: «Не турбувати» indicator zichtbaar en bewaard op server', await page.locator('.mv2-dnd').count() === 1 && !!(serverRegels as any)?.nietStoren);
    await shot(page, 'na-1440-licht-niet-storen');
    // Regels-scherm
    await page.click('.mv2-voet [aria-label="Правила сповіщень"]');
    await shot(page, 'na-1440-licht-regels');
    check('v2: regels-scherm met vier modi', await page.locator('.mv2-regel').count() >= 2 && await page.locator('.mv2-regel').first().locator('[role=radio]').count() === 4);
    await page.click('.mv2-kop [aria-label="Назад"]');
    // Volledige geschiedenis
    await page.click('.mv2-voet .mv2-tekstknop');
    await page.waitForTimeout(200);
    check('v2: volledige geschiedenis als apart scherm', await page.locator('.canonical-notification-panel.is-v2-volledig').count() === 1);
    await shot(page, 'na-1440-licht-geschiedenis');
    await c.close();
    // Tweede «apparaat»: regels uit de server
    { const { c: c2, page: p2 } = await open({ v2: true, breedte: 390 }); await openPaneel(p2); await p2.waitForTimeout(400);
      check('tweede apparaat: Не турбувати uit de server zichtbaar', await p2.locator('.mv2-dnd').count() === 1); await shot(p2, 'na-390-licht-tweede-apparaat'); await c2.close(); }
    // Nederlands
    { const { c: c3, page: p3 } = await open({ v2: true, nl: true, breedte: 768, donker: true }); await openPaneel(p3);
      check('nl: titel «Meldingen» en segment Belangrijk/Alle/Ongelezen', (await p3.locator('.mv2-kop-titel').textContent())?.startsWith('Meldingen') === true && await p3.locator('.mv2-segment', { hasText: 'Belangrijk' }).count() === 1);
      await shot(p3, 'na-768-donker-nl'); await c3.close(); }
    check('geen enkel verzoek buiten de lokale stand', geweigerd.length === 0, geweigerd.slice(0, 3).join(' '));
    check('geen JavaScript-fouten in de pagina', fouten.length === 0, fouten.slice(0, 3).join(' | '));
  } finally {
    await browser.close().catch(() => undefined);
    server.close();
  }
  return einde();
}
