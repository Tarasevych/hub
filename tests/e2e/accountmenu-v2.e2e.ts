// E2E «Accountmenu v2» (UI-008, vlag accountmenu-v2) in ISOLATIE: het echte CanonicalAccountMenu in een stand, eigen http-server op
// 127.0.0.1, alle /api-verzoeken nagebootst (page.route), elk verzoek naar een andere host afgebroken. Geen productie.
// Gebruik: node scripts/e2e-lokaal.mjs accountmenu-v2     Schermafdrukken: E2E_SCREENSHOTS (standaard /workspace/wp-ui008/uitvoer/screens).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { checker } from '../eenheid/hulp/nep-google';
import { chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/wp-ui008/uitvoer/screens';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
type Page = import('playwright-core').Page;

function nep(o: { v2: boolean; tech: boolean }) {
  const ruimtes = () => ({ aan: o.tech, actief: 'prive', technischToegestaan: true, pauze: false, sessie: null, eigenaar: true, schaduw: false, nu: new Date().toISOString(), termijnen: [], maxMinuten: 60, rollen: [] });
  return (pad: string): unknown => {
    if (pad.startsWith('/api/ofrep/v1/evaluate/flags/accountmenu-v2')) return { key: 'accountmenu-v2', value: o.v2 };
    if (pad.startsWith('/api/ofrep/v1/evaluate/flags/tech-ruimtes-v2')) return { key: 'tech-ruimtes-v2', value: o.tech };
    if (pad.startsWith('/api/ofrep')) return { value: false };
    if (pad === '/api/owner/tech/status') return { nu: Date.now(), profiel: o.tech ? { userId: 'u1', profielId: 'tp-1', rollen: ['eigenaar'], maxMinuten: 60, maxNu: 60, band: { kleur: 'amber', patroon: 'strepen' }, laatstActief: null, ervenNieuweTabbladen: false } : null, activatie: null, catalogus: { rollen: [], kleuren: {}, patronen: {}, duren: [15, 30, 60] } };
    if (pad === '/api/owner/hub/tech/ruimtes/status') return ruimtes();
    return {};
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e accountmenu-v2');
  const map = mkdtempSync(join(tmpdir(), 'am2-'));
  await build({ entryPoints: ['tests/e2e/hulp/accountmenu-stand/stand.tsx'], outdir: map, bundle: true, format: 'esm', splitting: true, target: 'es2022', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' }, logLevel: 'error' });
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stand accountmenu</title><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script><style>html,body,#root{overflow:auto!important}</style></head><body style="margin:0"><script type="module" src="/stand.js"></script></body></html>`;
  const server = createServer((req, res) => {
    const p = (req.url || '/').split('?')[0];
    if (p === '/canonical-service.js') { res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync('public/canonical-service.js')); return; }
    const f = join(map, p.replace(/^\/+/, ''));
    if (p !== '/' && existsSync(f)) { res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(f)); return; }
    res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const poort = (server.address() as { port: number }).port;
  mkdirSync(UIT, { recursive: true });
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(1) });
  const geweigerd: string[] = [], fouten: string[] = [];
  const open = async (o: { v2: boolean; tech?: boolean; breedte?: number; donker?: boolean; nl?: boolean; accounts?: number }) => {
    const antwoord = nep({ v2: o.v2, tech: !!o.tech });
    const b = o.breedte ?? 1440;
    const c = await browser.newContext({ viewport: { width: b, height: b < 500 ? 844 : 900 }, colorScheme: o.donker ? 'dark' : 'light', hasTouch: b < 500, isMobile: b < 500, deviceScaleFactor: b < 500 ? 2 : 1, locale: 'uk-UA' });
    const page = await c.newPage();
    await page.route('**/*', async (r) => {
      const u = new URL(r.request().url());
      if (u.hostname !== '127.0.0.1' || u.port !== String(poort)) { geweigerd.push(u.href); return r.abort(); }
      if (u.pathname.startsWith('/api/')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(antwoord(u.pathname)) });
      return r.continue();
    });
    page.on('pageerror', (e) => fouten.push(String(e)));
    await page.goto(`http://127.0.0.1:${poort}/?thema=${o.donker ? 'donker' : 'licht'}&lang=${o.nl ? 'nl' : 'uk'}&accounts=${o.accounts ?? 3}`);
    await page.waitForSelector('.canonical-avatar-trigger', { timeout: 8000 }).catch(() => { throw new Error('stand niet geladen: ' + fouten.join(' | ')); });
    await page.waitForTimeout(500);
    return { c, page };
  };
  const openMenu = async (p: Page) => { if (await p.locator('.canonical-account-panel').count()) return; await p.click('.canonical-avatar-trigger'); await p.waitForSelector('.canonical-account-panel'); await p.waitForTimeout(400); };
  const shotPaneel = async (p: Page, naam: string) => {
    const b = await p.locator('.canonical-account-panel').boundingBox();
    const vp = p.viewportSize()!;
    const clip = b ? { x: Math.max(0, b.x - 8), y: 0, width: Math.min(vp.width, b.width + 16), height: Math.min(vp.height, b.y + b.height + 8) } : undefined;
    await p.screenshot({ path: join(UIT, `${naam}.png`), clip }).catch(() => undefined);
  };
  try {
    // 1. Schermafdrukken voor/na: 390/768/1440 × licht/donker, met en zonder technische ruimte.
    for (const v2 of [false, true]) for (const breedte of [390, 768, 1440]) for (const donker of [false, true]) {
      const { c, page } = await open({ v2, breedte, donker, tech: true });
      await openMenu(page);
      const r = await page.evaluate(() => { const e = document.querySelector('.canonical-account-panel')!.getBoundingClientRect(); return { l: e.left, r: e.right, w: innerWidth }; });
      check(`${v2 ? 'na' : 'voor'} ${breedte} ${donker ? 'donker' : 'licht'}: paneel binnen het scherm`, r.l >= 0 && r.r <= r.w + 0.5, JSON.stringify(r));
      if (v2) check(`na ${breedte}: vlag v2 actief in DOM`, await page.locator('[data-account-menu-v2=aan]').count() === 1);
      await shotPaneel(page, `${v2 ? 'na' : 'voor'}-${breedte}-${donker ? 'donker' : 'licht'}`);
      await c.close();
    }
    // 2. Vlag uit = oud menu: geen v2-elementen.
    {
      const { c, page } = await open({ v2: false });
      await openMenu(page);
      check('vlag uit: geen v2-markup', await page.locator('[data-account-menu-v2], .am2-blok, .am2-vlag').count() === 0);
      check('vlag uit: oude CSS-vlaggen nog aanwezig', await page.locator('.compact-flag.flag-uk').count() === 1);
      check('vlag uit: geen tooltip-title op avatar', (await page.locator('.canonical-avatar-trigger').getAttribute('title')) === null);
      await c.close();
    }
    // 3. v2: elke actie bereikbaar en werkt.
    for (const breedte of [390, 1440]) {
      const { c, page } = await open({ v2: true, breedte, tech: true });
      const acties = () => page.evaluate(() => window.__acties.slice());
      const klik = async (sel: string, verwacht: string, heropen = true) => {
        if (heropen && !(await page.locator('.canonical-account-panel').count())) await openMenu(page);
        const n = await page.locator(sel).count();
        if (!n) { check(`${breedte}: «${verwacht}» bereikbaar (${sel})`, false, 'niet gevonden'); return; }
        await page.locator(sel).first().click(); await page.waitForTimeout(250);
        check(`${breedte}: «${verwacht}» bereikbaar en werkt`, (await acties()).includes(verwacht), (await acties()).join(','));
      };
      await openMenu(page);
      await klik('.canonical-current-account+.canonical-menu-action.primary', 'beheer');
      await klik('.am2-acties .canonical-menu-action:has(.lucide-settings)', 'instellingen');
      await klik('.am2-sessie .session-add-account', 'toevoegen');
      await klik('.am2-sessie .logout-current', 'uitloggen');
      await klik('.am2-sessie .logout-all', 'alles-uit');
      await klik('[data-thema-kleuren]', 'kleuren');
      for (const t of ['dark', 'device', 'auto', 'light']) await klik(`[data-am2-thema=${t}]`, `thema:${t}`);
      await openMenu(page);
      await page.click('[data-am2-thema=auto]'); await page.waitForTimeout(200);
      check(`${breedte}: pauze-knop zichtbaar bij Авто`, await page.locator('.am2-weergave [data-thema-pauze]').count() === 1);
      await page.click('[data-am2-thema=light]');
      await klik('.language-switch button[lang=nl]', 'taal:nl');
      await klik('.language-switch button[lang=uk]', 'taal:uk');
      check(`${breedte}: diagnose-knop aanwezig`, await page.locator('.am2-acties .canonical-menu-action:has(.lucide-life-buoy)').count() === 1);
      check(`${breedte}: «Доступ і терміни» aanwezig`, await page.locator('.am2-acties .canonical-menu-action:has(.lucide-key-round)').count() === 1);
      check(`${breedte}: fotoknop aanwezig`, await page.locator('.canonical-profile-camera').count() === 1);
      await page.waitForSelector('.am2-ruimte .rw-seg', { timeout: 5000 }).catch(() => undefined);
      const volgorde = await page.evaluate(() => [...document.querySelector('.canonical-account-panel')!.children].map((e) => (e as HTMLElement).dataset.am2Blok || e.className.split(' ')[0]));
      check(`${breedte}: ruimtewissel onderaan (vlak boven de juridische links)`, volgorde.at(-2) === 'ruimte' && volgorde.at(-1) === 'canonical-account-legal', volgorde.join(' > '));
      check(`${breedte}: ruimtewissel heeft twee tabs`, await page.locator('.am2-ruimte .rw-knop').count() === 2);
      // andere accounts
      await page.click('.canonical-other-toggle-main'); await page.waitForTimeout(300);
      check(`${breedte}: andere accounts zichtbaar`, await page.locator('.canonical-account-row').count() === 2);
      check(`${breedte}: «vergeten» bereikbaar`, await page.locator('.canonical-account-forget').count() === 2);
      await klik('.canonical-account-select >> nth=0', 'kies:g2', false);
      // ⓘ: één per blok
      const perBlok = await page.evaluate(() => [...document.querySelectorAll('[data-am2-blok]')].map((b) => `${(b as HTMLElement).dataset.am2Blok}:${b.querySelectorAll('.hulp-knop, [aria-expanded][aria-controls]').length}`));
      check(`${breedte}: hoogstens één ⓘ per blok`, perBlok.every((x) => Number(x.split(':')[1]) <= 1), perBlok.join(' '));
      // tikdoelen
      const klein = await page.evaluate(() => [...document.querySelectorAll('.canonical-account-panel button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44) && !b.closest('.canonical-account-legal') && !b.classList.contains('canonical-profile-camera') && !b.closest('[aria-controls]') && !(b as HTMLElement).getAttribute('aria-controls'); }).map((b) => `${b.className}:${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`));
      check(`${breedte}: alle knoppen ≥44px (behalve fotoknop en ⓘ)`, klein.length === 0, klein.join(' | '));
      // Esc
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      check(`${breedte}: Esc sluit en focus terug op avatar`, (await page.locator('.canonical-account-panel').count()) === 0 && await page.evaluate(() => document.activeElement?.classList.contains('canonical-avatar-trigger')));
      await c.close();
    }
    // 4. Vlaggen: echte emoji, niet door thema gekleurd.
    for (const donker of [false, true]) {
      const { c, page } = await open({ v2: true, donker });
      await openMenu(page);
      const v = await page.evaluate(() => [...document.querySelectorAll('.am2-vlag')].map((e) => {
        let filt = ''; for (let n: Element | null = e; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.filter !== 'none' || s.mixBlendMode !== 'normal') filt += `${n.className}:${s.filter}/${s.mixBlendMode};`; }
        const s = getComputedStyle(e); return { tekst: e.textContent, filt, kleurEigen: s.webkitTextFillColor, opacity: s.opacity };
      }));
      check(`vlaggen ${donker ? 'donker' : 'licht'}: 🇺🇦 en 🇳🇱 als emoji`, v.map((x) => x.tekst).join('') === '🇺🇦🇳🇱', JSON.stringify(v));
      check(`vlaggen ${donker ? 'donker' : 'licht'}: geen filter/mengmodus op vlag of ouders`, v.every((x) => !x.filt && x.opacity === '1'), JSON.stringify(v));
      await page.locator('.language-switch').screenshot({ path: join(UIT, `vlaggen-${donker ? 'donker' : 'licht'}.png`) });
      await c.close();
    }
    // 5. Tooltip kleine avatar.
    for (const accounts of [1, 3]) {
      const { c, page } = await open({ v2: true, accounts });
      await page.hover('.canonical-avatar-trigger'); await page.waitForTimeout(500);
      const tip = await page.locator('.canonical-avatar-trigger').getAttribute('title');
      check(`tooltip (${accounts} account): naam en e-mail`, !!tip && tip.includes('Eigenaar Test') && tip.includes('pavlo@example.org'), String(tip));
      check(`tooltip (${accounts} account): aantal andere accounts ${accounts > 1 ? 'genoemd' : 'niet genoemd'}`, accounts > 1 ? !!tip?.includes('Ще акаунтів: 2') : !tip?.includes('Ще акаунтів'), String(tip));
      const al = await page.locator('.canonical-avatar-trigger').getAttribute('aria-label');
      check(`aria-label (${accounts}) noemt account`, !!al?.includes('Eigenaar Test'), String(al));
      await c.close();
    }
    // 6. nl-teksten
    {
      const { c, page } = await open({ v2: true, nl: true, breedte: 390 });
      await openMenu(page);
      check('nl: «Afmelden» en «Account toevoegen»', (await page.locator('.am2-sessie').innerText()).includes('Afmelden') && (await page.locator('.am2-sessie').innerText()).includes('Account toevoegen'));
      await shotPaneel(page, 'na-390-licht-nl');
      await c.close();
    }
    check('geen paginafouten', fouten.length === 0, fouten.join(' | '));
    check('geen verzoeken buiten 127.0.0.1', geweigerd.length === 0, geweigerd.join(' '));
  } finally { await browser.close(); server.close(); }
  return einde();
}
