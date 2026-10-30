// E2E UI-014 — het ECHTE meldingencentrum (src/CanoniekMeldingencentrum.tsx) in de stand stand-ui014.tsx MET de globale site-css
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
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/wp-ui014/uitvoer/screens';
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
  const { check, einde } = checker(`e2e meldingen-ui014${VOOR ? ' (voor)' : ''}`);
  const map = mkdtempSync(join(tmpdir(), 'mui014-'));
  await build({ entryPoints: ['tests/e2e/hulp/meldingen-stand/stand-ui014.tsx'], outdir: map, entryNames: 'stand', bundle: true, format: 'esm', splitting: true, target: 'es2022', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' }, logLevel: 'error' });
  const css = `:root{--veilig-boven:0px;--veilig-onder:0px;--veilig-links:0px;--veilig-rechts:0px}`;
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stand ui014</title><style>${css}</style><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body><script type="module" src="/stand.js"></script></body></html>`;
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
  let serverRegels: unknown = null; const gelezenServer = new Set<string>(); const aanroepen: string[] = [];
  const open = async (o: { v3: boolean; breedte?: number; donker?: boolean; nl?: boolean }) => {
    const breedte = o.breedte ?? 1440;
    const c = await browser.newContext({ viewport: { width: breedte, height: breedte <= 768 ? (breedte < 500 ? 844 : 1024) : 900 }, colorScheme: o.donker ? 'dark' : 'light', hasTouch: breedte < 500, isMobile: breedte < 500, locale: o.nl ? 'nl-BE' : 'uk-UA', timezoneId: 'Europe/Brussels' });
    const page = await c.newPage();
    await page.clock.setFixedTime(NU);
    await page.route('**/*', async (r) => {
      const u = new URL(r.request().url());
      if (u.hostname !== '127.0.0.1' || u.port !== String(poort)) { geweigerd.push(u.href); return r.abort(); }
      if (u.pathname.startsWith('/api/')) {
        aanroepen.push(u.pathname);
        let body: any = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch { /* leeg */ }
        let a: unknown = {};
        if (u.pathname.endsWith('/flags/meldingen-v2')) a = { key: 'meldingen-v2', value: true };
        else if (u.pathname.endsWith('/flags/meldingen-uitleg-v3')) a = { key: 'meldingen-uitleg-v3', value: o.v3 };
        else if (u.pathname === '/api/owner/meldingen/regels') a = { ok: true, regels: serverRegels ?? { versie: 1, regels: [], nietStoren: null, bijgewerkt: 0 } };
        else if (u.pathname === '/api/owner/meldingen/regels/opslaan') { serverRegels = body.regels; a = { ok: true, regels: body.regels }; }
        else if (u.pathname === '/api/owner/agents/activity') a = { events: EVENTS, now: NU, sfeer: 'prive' };
        else if (u.pathname === '/api/owner/meldingen/gelezen') a = { ok: true, ids: [...gelezenServer] };
        else if (u.pathname === '/api/owner/meldingen/gelezen/toevoegen') { for (const id of body.ids || []) gelezenServer.add(id); a = { ok: true, aantal: gelezenServer.size }; }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(a) });
      }
      return r.continue();
    });
    page.on('pageerror', (e) => fouten.push(String(e)));
    await page.goto(`http://127.0.0.1:${poort}/${o.nl ? 'nl/' : ''}?v2=1&v3=${o.v3 ? 1 : 0}&nu=${NU}&thema=${o.donker ? 'donker' : 'licht'}`);
    await page.waitForSelector('[data-qa-id="canonical-notification-bell"]', { timeout: 15000 });
    await page.waitForTimeout(500);
    return { c, page };
  };
  const shot = (p: Page, naam: string) => p.screenshot({ path: join(UIT, `${naam}.png`), animations: 'disabled' }).catch(() => undefined);
  const openPaneel = async (p: Page) => { await p.click('[data-qa-id="canonical-notification-bell"]'); await p.waitForSelector('.mv2'); await p.waitForTimeout(300); };
  const voet = (p: Page) => p.evaluate(() => {
    const f = document.querySelector<HTMLElement>('.mv2-voet'); const pnl = document.querySelector<HTMLElement>('[data-qa-id="canonical-notification-panel"]');
    if (!f || !pnl) return null;
    const kn = [...f.querySelectorAll<HTMLElement>('button')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect());
    return { hoogte: f.getBoundingClientRect().height, paneel: pnl.getBoundingClientRect().height, tops: kn.map((r) => Math.round(r.top)), min: Math.min(...kn.map((r) => Math.min(r.width, r.height))), richting: getComputedStyle(f).flexDirection };
  });
  try {
    for (const breedte of [390, 768, 1440]) for (const donker of [false, true]) {
      const thema = donker ? 'donker' : 'licht';
      const { c, page } = await open({ v3: !VOOR, breedte, donker });
      await openPaneel(page);
      await page.click('.mv2-segment button:nth-child(2)').catch(() => undefined); // «Усі»
      await page.waitForTimeout(200);
      await shot(page, `${VOOR ? 'voor' : 'na'}-${breedte}-${thema}`);
      const v = await voet(page);
      if (!VOOR) {
        check(`${breedte} ${thema}: voet in één regel (flex-direction row, alle knoppen op dezelfde hoogte)`, !!v && v.richting === 'row' && Math.max(...v.tops) - Math.min(...v.tops) <= 2, JSON.stringify(v));
        check(`${breedte} ${thema}: voet ≤ 60 px (geen derde van het paneel)`, !!v && v.hoogte <= 60, JSON.stringify(v));
        if (breedte === 390) check(`390 ${thema}: tikdoelen in de voet ≥ 44 px`, !!v && v.min >= 43.5, JSON.stringify(v));
        const pb = await page.locator('[data-qa-id="canonical-notification-panel"]').boundingBox();
        check(`${breedte} ${thema}: paneel binnen het scherm, geen horizontale overloop`, !!pb && pb.x >= -1 && pb.x + pb.width <= breedte + 1 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (breedte === 1440 && !donker) check('1440: standaardpaneel met v3 ≥ 440 px breed', !!pb && pb.width >= 440, String(pb?.width));
      } else check(`voor ${breedte} ${thema}: schermafbeelding (voet: ${v?.richting}, ${Math.round(v?.hoogte || 0)} px van ${Math.round(v?.paneel || 0)} px)`, true);
      // Uitleg (alleen na): kaart «Право … відкликано» openen
      if (!VOOR && breedte !== 768) {
        const kaart = page.locator('.mv2-rij', { hasText: 'Право готувати оновлення відкликано' }).first();
        await kaart.locator('.mv2-hoofd').click(); await page.waitForTimeout(250);
        const u = page.locator('.mv2u').first();
        if (breedte === 1440 && !donker) {
          check('uitleg: zichtbaar met WIE (e-mail), WAT («Власник — з пристрою»), WAAROM (reden)', (await u.textContent() || '').includes('tarasevych.pavlo@gmail.com') && (await u.textContent() || '').includes('Власник — з пристрою') && (await u.textContent() || '').includes('розширені до 30 днів'));
          check('uitleg: tekst alleen Oekraïens (geen «ingetrokken»)', !((await kaart.textContent()) || '').includes('ingetrokken'));
          check('uitleg: snelle actie «Переглянути зміну» → exacte wijziging', (await u.locator('a.mv2u-actie', { hasText: 'Переглянути зміну' }).getAttribute('href')) === 'https://id.tarasevych.com/methods?wijziging=w-1');
          const gevaar = u.locator('button.mv2u-actie.is-gevaar').first();
          await gevaar.click(); await page.waitForTimeout(150);
          check('gevaarlijke actie: eerst bevestigen, geen navigatie', page.url().startsWith('http://127.0.0.1') && await u.locator('a.mv2u-actie.is-bevestigd').count() === 1 && await u.locator('.mv2u-let').count() === 1);
        }
        await page.locator('.mv2u').first().evaluate((el) => el.scrollIntoView({ block: 'end' })).catch(() => undefined); await page.waitForTimeout(150);
        await shot(page, `na-${breedte}-${thema}-uitleg`);
      }
      await c.close();
    }
    if (!VOOR) {
      // Gelezen: activiteiten (groep ×3) en server
      { const { c, page } = await open({ v3: true, breedte: 1440 }); await openPaneel(page);
        const tel = async () => Number((await page.locator('.mv2-segment button:nth-child(3)').textContent() || '').replace(/\D/g, '')) || 0;
        const voor = await tel();
        await page.click('.mv2-segment button:nth-child(2)'); await page.waitForTimeout(150);
        const schrijf = page.locator('.mv2-rij', { hasText: 'Запис файлу' }).first();
        check('kaart «Запис файлу» ×3 aanwezig', await schrijf.count() === 1 && ((await schrijf.textContent()) || '').includes('×3'));
        await schrijf.locator('.mv2-hoofd').click(); await page.waitForTimeout(700);
        check('Запис файлу: WIE = apparaat, WAT = bestandspad', ((await page.locator('.mv2u').first().textContent()) || '').includes('Pavlo-PC') && ((await page.locator('.mv2u').first().textContent()) || '').includes('bestand-'));
        const na = await tel();
        check('gelezen: groep ×3 telt na openen niet meer als ongelezen', na === voor - 1, `${voor} → ${na}`);
        check('gelezen: alle drie onderliggende regels naar de server', ['cmd:w1', 'cmd:w2', 'cmd:w3'].every((x) => gelezenServer.has(x)), [...gelezenServer].join());
        const ext = page.locator('.mv2-rij', { hasText: 'розширення' }).first();
        check('extensie-kaart: Oekraïense titel, geen «vernieuwing-geblokkeerd»', await ext.count() === 1 && !((await page.locator('.mv2').textContent()) || '').includes('vernieuwing-geblokkeerd'));
        await page.click('.mv2-voet button[aria-label="Позначити все прочитаним"]'); await page.waitForTimeout(700);
        check('«все прочитане»: Непрочитані = 0', await tel() === 0);
        await c.close(); }
      // Tweede «apparaat»: gelezen komt van de server
      { const { c, page } = await open({ v3: true, breedte: 390 }); await openPaneel(page); await page.waitForTimeout(600);
        const n = Number((await page.locator('.mv2-segment button:nth-child(3)').textContent() || '').replace(/\D/g, '')) || 0;
        const s = page.locator('.mv2-rij', { hasText: 'Запис файлу' }).first();
        check('tweede apparaat: «Запис файлу» al gelezen (server)', await s.count() === 0 || !(await s.getAttribute('class') || '').includes('is-nieuw'), `${n}`);
        await c.close(); }
      // Grootte
      { const { c, page } = await open({ v3: true, breedte: 1440 }); await openPaneel(page);
        const b0 = (await page.locator('[data-qa-id="canonical-notification-panel"]').boundingBox())?.width || 0;
        await page.click('.mv2-voet button[aria-label="Правила сповіщень"]'); await page.waitForSelector('[data-mv2-grootte]');
        await shot(page, 'na-1440-licht-grootte-instelling');
        await page.click('[data-mv2-grootte] .mv2-segment:first-of-type button:nth-child(4)'); await page.waitForTimeout(400);
        const b1 = (await page.locator('[data-qa-id="canonical-notification-panel"]').boundingBox())?.width || 0;
        check('grootte XL: paneel breder dan M (schaalt mee)', b1 > b0 + 60, `${b0} → ${b1}`);
        check('grootte XL: bewaard op de server (per account)', JSON.stringify(serverRegels || {}).includes('"tekst":"XL"'));
        await page.click('.mv2-kop button[aria-label="Назад"]'); await page.waitForTimeout(200);
        await shot(page, 'na-1440-licht-XL');
        await c.close(); }
      { const { c, page } = await open({ v3: true, breedte: 390, donker: true }); await openPaneel(page); await page.waitForTimeout(300);
        await shot(page, 'na-390-donker-XL');
        check('390 XL: geen horizontale overloop', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        serverRegels = { versie: 1, regels: [], nietStoren: null, bijgewerkt: 0, weergave: { tekst: 'S', dichtheid: 'compact' } };
        await c.close(); }
      { const { c, page } = await open({ v3: true, breedte: 768, nl: true }); await openPaneel(page);
        await page.click('.mv2-segment button:nth-child(2)'); await page.waitForTimeout(150);
        await page.locator('.mv2-rij', { hasText: /ingetrokken/i }).first().locator('.mv2-hoofd').click(); await page.waitForTimeout(250);
        const t = (await page.locator('.mv2u').first().textContent()) || '';
        check('nl: uitleg in het Nederlands (Wie/Wat/Wanneer)', t.includes('Wie') && t.includes('Wanneer') && !/Хто|Коли/.test(t));
        await shot(page, 'na-768-licht-nl-uitleg-S-compact'); await c.close(); }
      // Vlag uit: geen uitleg, voet wél hersteld
      { const { c, page } = await open({ v3: false, breedte: 390 }); await openPaneel(page);
        const v = await voet(page);
        check('vlag v3 UIT: geen grootte-attribuut, voet toch in één regel (bugfix zonder vlag)', await page.locator('[data-mv2-tekst]').count() === 0 && !!v && v.richting === 'row');
        await shot(page, 'na-390-licht-vlag-uit'); await c.close(); }
    }
    check('geen verzoek buiten de lokale stand', geweigerd.length === 0, geweigerd.slice(0, 3).join(' '));
    check('geen JavaScript-fouten', fouten.length === 0, fouten.slice(0, 3).join(' | '));
  } finally {
    await browser.close().catch(() => undefined);
    server.close();
  }
  return einde();
}
