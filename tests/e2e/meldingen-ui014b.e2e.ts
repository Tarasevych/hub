// E2E UI-014 fase 2B (vlag meldingen-uitleg-v3): blijvende status (вирішено/архів/відкладено) in de kaart en in bulk, vijf tabs
// waarvan de tellers gelijk zijn aan de lijstlengtes, «N прихованих правилами» met tonen, «Уся історія» met filters en export
// zonder geheimen, bewaartermijn. Basis = de stand van UI-014 fase 1. Oorspronkelijke kop:
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
import { legeStatus, normaliseerBewaarDagen, zetStatus, type StatusStand } from '../../shared/meldingen-v2/status';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/wp-ui014b/uitvoer/screens';
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
  const { check, einde } = checker('e2e meldingen-ui014b');
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
  let serverRegels: unknown = { versie: 1, regels: [{ dienst: 'site', modus: 'stil', bijgewerkt: NU - 1000 }], nietStoren: null, bijgewerkt: NU - 1000 };
  let stand: StatusStand = legeStatus(); const statusVerzoeken: any[] = []; const gelezenServer = new Set<string>(); const aanroepen: string[] = [];
  const open = async (o: { v3: boolean; breedte?: number; donker?: boolean; nl?: boolean }) => {
    const breedte = o.breedte ?? 1440;
    const c = await browser.newContext({ viewport: { width: breedte, height: breedte <= 768 ? (breedte < 500 ? 844 : 1024) : 900 }, colorScheme: o.donker ? 'dark' : 'light', hasTouch: breedte < 500, isMobile: breedte < 500, locale: o.nl ? 'nl-BE' : 'uk-UA', timezoneId: 'Europe/Brussels', acceptDownloads: true });
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
        else if (u.pathname === '/api/owner/meldingen/status') a = { ok: true, stand };
        else if (u.pathname === '/api/owner/meldingen/status/zetten') { statusVerzoeken.push(body); if (body.bewaarDagen !== undefined) stand = { ...stand, bewaarDagen: normaliseerBewaarDagen(body.bewaarDagen) }; if (Array.isArray(body.ids)) stand = zetStatus(stand, body, 'eigenaar', NU); a = { ok: true, stand }; }
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

  // INTEG-001 (03.11.2026, eigenaar: розділи «Нові», «Прочитані», «Архів»): de vijf tabs Важливі/Усі/Непрочитані/Вирішені/Архів zijn
  // drie delen geworden (shared/meldingen-v2/secties.ts). «Усі» bestaat niet meer: een kaart staat in precies één deel — zoekKaart zoekt
  // het deel, kiesTabMet kiest het eerste deel met genoeg kaarten. Stille meldingen (regel «Тихе», geslaagd achtergrondwerk) zijn niet
  // meer verborgen maar staan met uitleg in «Прочитані»; «Вирішено» gaat naar «Архів».
  const tabs = (p: Page) => p.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-mv2-secties] [role="tab"]')].map((b) => ({ tab: b.dataset.sectie, n: Number(b.querySelector<HTMLElement>('.mv2-n')?.dataset.n), sel: b.getAttribute('aria-selected') === 'true' })));
  const lijstN = (p: Page) => p.locator('.mv2-lijst > li.mv2-rij').count();
  const kiesTab = async (p: Page, tab: string) => { await p.click(`[data-mv2-secties] [data-sectie="${tab}"]`); await p.waitForTimeout(200); };
  const kiesTabMet = async (p: Page, min: number, zonder: string[] = ['archief']) => { for (const x of await tabs(p)) if (x.n >= min && !zonder.includes(x.tab!)) { await kiesTab(p, x.tab!); return x.tab!; } return null; };
  const zoekKaart = async (p: Page, tekst: string) => { for (const x of await tabs(p)) { await kiesTab(p, x.tab!); if (await p.locator('.mv2-rij', { hasText: tekst }).count()) return x.tab!; } return null; };
  const tellersKloppen = async (p: Page, label: string) => {
    const uit: string[] = []; let ok = true;
    for (const x of await tabs(p)) { await kiesTab(p, x.tab!); const n = await lijstN(p); uit.push(`${x.tab}:${x.n}/${n}`); if (n !== x.n) ok = false; }
    check(`${label}: teller van elke tab = lijstlengte`, ok, uit.join(' '));
  };
  try {
    // 1) Schermafbeeldingen 390/1440 licht/donker
    for (const breedte of [390, 768, 1440]) for (const donker of [false, true]) {
      const thema = donker ? 'donker' : 'licht';
      const { c, page } = await open({ v3: true, breedte, donker });
      await openPaneel(page); await kiesTabMet(page, 2);
      const t = await tabs(page);
      check(`${breedte} ${thema}: drie delen Нові/Прочитані/Архів`, t.map((x) => x.tab).join() === 'nieuw,gelezen,archief');
      check(`${breedte} ${thema}: regelbalk met «Вибрати» zichtbaar`, await page.locator('.mv2-regelbalk button:has-text("Вибрати")').count() === 1);
      const pb = await page.locator('[data-qa-id="canonical-notification-panel"]').boundingBox();
      check(`${breedte} ${thema}: geen horizontale overloop`, !!pb && pb.x + pb.width <= breedte + 1 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await shot(page, `b-${breedte}-${thema}-tabs`);
      await page.click('.mv2-regelbalk button[aria-pressed]:has-text("Вибрати")'); await page.waitForTimeout(150);
      if (breedte === 390) {
        const min = await page.evaluate(() => Math.min(...[...document.querySelectorAll<HTMLElement>('.mv2-kies, .mv2-bulk .mv2-ikoon, .mv2-regelbalk .mv2-tekstknop')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); })));
        check(`390 ${thema}: tikdoelen keuze/bulk ≥ 44 px`, min >= 43.5, String(min));
      }
      await page.locator('.mv2-lijst .mv2-kies input').nth(0).check(); await page.locator('.mv2-lijst .mv2-kies input').nth(1).check();
      await shot(page, `b-${breedte}-${thema}-bulk`);
      await c.close();
    }
    // 2) Functioneel (1440 licht)
    { const { c, page } = await open({ v3: true, breedte: 1440 }); await openPaneel(page);
      await tellersKloppen(page, 'begin');
      await zoekKaart(page, 'Запис файлу');
      const schrijf = page.locator('.mv2-rij', { hasText: 'Запис файлу' }).first();
      await schrijf.locator('.mv2-menu-houder button').click(); await page.waitForTimeout(150);
      await page.click('.mv2-menu [role="menuitem"]:has-text("Позначити вирішеним")'); await page.waitForTimeout(500);
      const laatste = statusVerzoeken.at(-1);
      check('kaart: «Вирішено» stuurt ALLE drie ids van de groep ×3 naar de server', laatste?.status === 'opgelost' && ['cmd:w1', 'cmd:w2', 'cmd:w3'].every((x) => (laatste.ids || []).some((i: string) => i.endsWith(x))), JSON.stringify(laatste?.ids));
      check('server: alle drie records dezelfde status', Object.entries(stand.items).filter(([k]) => /cmd:w\d/.test(k)).every(([, v]) => v.s === 'opgelost') && Object.keys(stand.items).filter((k) => /cmd:w\d/.test(k)).length === 3);
      await kiesTab(page, 'archief');
      check('«Вирішено» → «Архів»: kaart staat erin', await page.locator('.mv2-rij', { hasText: 'Запис файлу' }).count() === 1);
      await page.locator('.mv2-rij', { hasText: 'Запис файлу' }).first().locator('.mv2-hoofd').click(); await page.waitForTimeout(200);
      check('kaart toont wie/wanneer/hoe van «Вирішено»', ((await page.locator('[data-mv2-statusinfo]').first().textContent()) || '').includes('у картці'));
      await shot(page, 'b-1440-licht-opgelost');
      await tellersKloppen(page, 'na вирішено');
      // Bulk: twee → архів
      await kiesTabMet(page, 2);
      const archiefVoor = (await tabs(page)).find((x) => x.tab === 'archief')?.n || 0;
      await page.click('.mv2-regelbalk button:has-text("Вибрати")'); await page.waitForTimeout(150);
      const titels = await page.locator('.mv2-lijst > li.mv2-rij .mv2-titel').evaluateAll((els) => els.slice(0, 2).map((e) => e.textContent || ''));
      await page.locator('.mv2-lijst .mv2-kies input').nth(0).check(); await page.locator('.mv2-lijst .mv2-kies input').nth(1).check();
      check('bulk: «Вибрано: 2»', ((await page.locator('.mv2-bulk').textContent()) || '').includes('Вибрано: 2'));
      await page.click('.mv2-bulk [data-bulk="archief"]'); await page.waitForTimeout(500);
      check('bulk: één verzoek, hoe=bulk', statusVerzoeken.at(-1)?.hoe === 'bulk' && statusVerzoeken.at(-1)?.status === 'archief');
      await kiesTab(page, 'archief');
      check('bulk: beide in «Архів»', await lijstN(page) >= archiefVoor + 2, titels.join(' | '));
      await tellersKloppen(page, 'na bulk архів');
      // Uitstellen
      await kiesTabMet(page, 1); await page.click('.mv2-regelbalk button:has-text("Готово")').catch(() => undefined);
      const voor = await lijstN(page);
      await page.locator('.mv2-lijst > li.mv2-rij').first().locator('.mv2-menu-houder button').click(); await page.waitForTimeout(150);
      await page.click('.mv2-menu [role="menuitem"]:has-text("Відкласти на годину")'); await page.waitForTimeout(500);
      check('uitstellen: kaart weg uit het deel, «відкладено: 1» zichtbaar', await lijstN(page) === voor - 1 && ((await page.locator('.mv2-regelbalk').textContent()) || '').includes('відкладено: 1'), `${voor} → ${await lijstN(page)}`);
      check('uitstellen: tot = nu + 1 u', statusVerzoeken.at(-1)?.status === 'uitgesteld' && statusVerzoeken.at(-1)?.tot === NU + 3600_000);
      await tellersKloppen(page, 'na uitstellen');
      // Stil (regel «Тихе» voor «Сайт» en geslaagd achtergrondwerk): niet meer verborgen, maar in «Прочитані» met de reden erbij.
      await kiesTab(page, 'gelezen');
      const stil = await page.locator('.mv2-rij[data-verborgen]').count();
      check('stil: in «Прочитані» zichtbaar, elk met reden-label (geen teller, geen pop-up)', stil > 0 && await page.locator('.mv2-rij[data-verborgen] .mv2-toestand.t-verborgen').count() === stil, `${stil}`);
      const met = (await tabs(page)).reduce((s, x) => s + x.n, 0);
      await page.locator('.mv2-rij[data-verborgen]').first().locator('.mv2-hoofd').click(); await page.waitForTimeout(200);
      check('stil: uitleg + knop «Відкрити правило» in de kaart', await page.locator('.mv2-rij[data-verborgen] .mv2-statusinfo button:has-text("Відкрити правило")').count() >= 1);
      await shot(page, 'b-1440-licht-verborgen');
      await tellersKloppen(page, 'met stille meldingen');
      await kiesTab(page, 'gelezen'); if (!await page.locator('.mv2-rij[data-verborgen].is-open').count()) { await page.locator('.mv2-rij[data-verborgen]').first().locator('.mv2-hoofd').click(); await page.waitForTimeout(200); }
      await page.click('.mv2-rij[data-verborgen] .mv2-statusinfo button:has-text("Відкрити правило")'); await page.waitForTimeout(250);
      check('«Відкрити правило» opent «Правила сповіщень»', await page.locator('[data-mv2="regels"]').count() === 1);
      await page.click('[data-mv2-bewaar] [role="radio"]:has-text("90 дн")'); await page.waitForTimeout(400);
      check('bewaartermijn 90 d naar de server, standaard was 30', statusVerzoeken.at(-1)?.bewaarDagen === 90 && stand.bewaarDagen === 90);
      await shot(page, 'b-1440-licht-bewaartermijn');
      await page.click('.mv2-kop button[aria-label="Назад"]'); await page.waitForTimeout(200);
      // Geschiedenis + export
      await page.click('.mv2-voet [data-mv2-historie-knop]'); await page.waitForSelector('[data-mv2-historie]');
      const alles = Number(await page.locator('[data-mv2-historie]').getAttribute('data-mv2-historie'));
      check('«Уся історія»: ook uitgestelde, gearchiveerde en verborgen records', alles > met, `${alles}`);
      await page.fill('.mv2-historie input[type="search"]', 'Запис'); await page.waitForTimeout(200);
      check('geschiedenis: zoeken «Запис» = 3 records', Number(await page.locator('[data-mv2-historie]').getAttribute('data-mv2-historie')) === 3);
      await page.fill('.mv2-historie input[type="search"]', ''); await page.click('.mv2-historie-filters summary');
      await page.click('.mv2-historie-filters .mv2-chips button:has-text("Помилка")'); await page.waitForTimeout(200);
      const fouten2 = Number(await page.locator('[data-mv2-historie]').getAttribute('data-mv2-historie'));
      check('geschiedenis: filter ernst «Помилка»', fouten2 > 0 && fouten2 < alles && await page.locator('.mv2-hrij:not(.e-fout)').count() === 0, `${fouten2}`);
      await page.click('.mv2-historie-filters .mv2-chips button:has-text("Тиждень")'); await page.waitForTimeout(200);
      await shot(page, 'b-1440-licht-historie');
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="csv"]')]);
      const csv = readFileSync(await dl.path(), 'utf8');
      const nCsv = csv.trim().split('\n').length - 1;
      check('export CSV = precies de getoonde lijst', nCsv === Number(await page.locator('[data-mv2-historie]').getAttribute('data-mv2-historie')), `${nCsv}`);
      check('export CSV: geen technische tekst/links/geheimen', !/PAD_NIET_TOEGESTAAN|https?:\/\/|token|EXT_UNLOCK/.test(csv));
      const [dj] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="json"]')]);
      const js = JSON.parse(readFileSync(await dj.path(), 'utf8'));
      check('export JSON: aantal = lijst, statussen erin', js.aantal === nCsv && js.meldingen.some((x: { status: string }) => x.status === 'opgelost'));
      await c.close(); }
    // 3) Telefoon donker: geschiedenis
    { const { c, page } = await open({ v3: true, breedte: 390, donker: true }); await openPaneel(page);
      await page.click('.mv2-voet [data-mv2-historie-knop]'); await page.waitForSelector('[data-mv2-historie]');
      await shot(page, 'b-390-donker-historie');
      check('390 donker geschiedenis: geen horizontale overloop', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await c.close(); }
    // 4) NL
    { const { c, page } = await open({ v3: true, breedte: 1440, nl: true }); await openPaneel(page);
      const t = ((await page.locator('[data-mv2-secties]').textContent()) || '') + ((await page.locator('.mv2-regelbalk').textContent()) || '');
      check('nl: delen en regelbalk Nederlands', await page.locator('[data-mv2-secties] [data-tip="Nieuw"]').count() === 1 && await page.locator('[data-mv2-secties] [data-tip="Archief"]').count() === 1 && t.includes('Kiezen') && !/[\u0400-\u04FF]/.test(t), t);
      await shot(page, 'b-1440-licht-nl'); await c.close(); }
    // 5) Vlag UIT: oud gedrag (drie tabs, geen status-verzoeken)
    { const n0 = statusVerzoeken.length; const { c, page } = await open({ v3: false, breedte: 390 }); await openPaneel(page);
      check('vlag UIT: dezelfde drie delen, maar geen «Вибрати» (bulk) en geen uitleg-kaart', await page.locator('[data-mv2-secties] [role="tab"]').count() === 3 && await page.locator('.mv2-regelbalk button:has-text("Вибрати")').count() === 0 && await page.locator('.mv2u').count() === 0);
      check('vlag UIT: geen statusverzoeken', statusVerzoeken.length === n0 && !aanroepen.includes('/api/owner/meldingen/status'.replace('status', 'status-x')));
      await shot(page, 'b-390-licht-vlag-uit'); await c.close(); }
    check('geen verzoek buiten de lokale stand', geweigerd.length === 0, geweigerd.slice(0, 3).join(' '));
    check('geen JavaScript-fouten', fouten.length === 0, fouten.slice(0, 3).join(' | '));
  } finally {
    await browser.close().catch(() => undefined);
    server.close();
  }
  return einde();
}
