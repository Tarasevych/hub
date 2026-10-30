// E2E «Bijlageviewer v2» (vlag bijlage-viewer-v2) + BUG-003 (scrollen met twee vingers) in ISOLATIE: de stand
// tests/e2e/hulp/bijlage-stand (echte MailAttachmentPreviewBody + PDF-engine), eigen http-server op 127.0.0.1, geen Google, geen productie.
// Gebruik: node scripts/e2e-lokaal.mjs bijlage-viewer-v2     Schermafdrukken: E2E_SCREENSHOTS (standaard /workspace/wp-ui006/uitvoer/screens).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { checker } from '../eenheid/hulp/nep-google';
import { chromeArgs } from './server';
// @ts-expect-error -- plain ESM-hulp zonder typedeclaraties
import { startStand } from './hulp/bijlage-stand/bouw.mjs';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/wp-ui006/uitvoer/screens';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
type Page = import('playwright-core').Page;
type Ctx = import('playwright-core').BrowserContext;
const LIJST = [
  { naam: 'factuur-oktober-2026-definitief.pdf', type: 'application/pdf', url: '/f/factuur.pdf' },
  { naam: 'foto.png', type: 'image/png', url: '/f/foto.png' },
  { naam: 'notitie.txt', type: 'text/plain', url: '/f/notitie.txt' },
];

export async function main(): Promise<number> {
  const { check, einde } = checker('bijlage-viewer-v2');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  mkdirSync(UIT, { recursive: true });
  const stand = await startStand();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(1) });
  const fouten: string[] = [];
  const url = (q: Record<string, string | number>) => `${stand.url}/?${new URLSearchParams({ bestanden: JSON.stringify(LIJST), ...Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v)])) })}`;
  const ctxVoor = (w: number, thema = 'licht', extra: Record<string, unknown> = {}) => browser.newContext({
    viewport: { width: w, height: w <= 400 ? 844 : w <= 800 ? 1024 : 900 }, colorScheme: thema === 'donker' ? 'dark' : 'light',
    ...(w <= 400 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}), ...extra });
  const open = async (ctx: Ctx, q: Record<string, string | number>, wacht = '.mail-pdf-page.ready') => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') fouten.push(`console: ${m.text().slice(0, 200)}`); });
    await p.goto(url(q)); await p.waitForSelector(wacht, { timeout: 20000 }); await p.waitForTimeout(400); return p;
  };
  const top = (p: Page) => p.evaluate(() => (document.querySelector('.mail-viewer-preview-cache') as HTMLElement).scrollTop);
  const wiel = async (p: Page) => { const b = (await p.locator('.mail-viewer-preview-cache').boundingBox())!; const v = await top(p); await p.mouse.move(b.x + b.width / 2, b.y + b.height * 0.6); await p.mouse.wheel(0, 500); await p.waitForTimeout(450); return (await top(p)) - v; };
  const veeg = async (p: Page, vingers: number) => {
    const b = (await p.locator('.mail-viewer-preview-cache').boundingBox())!; const cdp = await p.context().newCDPSession(p); const v = await top(p);
    const x = b.x + b.width / 2 - 30, y = b.y + b.height * 0.7, pt = (dy: number) => Array.from({ length: vingers }, (_, i) => ({ x: x + i * 60, y: y + dy, id: i }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(0) });
    for (let k = 1; k <= 12; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(-k * 22) }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(650);
    return (await top(p)) - v;
  };
  const tik = async (p: Page, sel: string, ms = 40) => {
    const b = (await p.locator(sel).first().boundingBox())!; const cdp = await p.context().newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
    await p.waitForTimeout(ms); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(150);
  };
  try {
    // ── 1. BUG-003: oorzaak bevestigen (zonder fix) en oplossing (met fix) — oude kop, dus geldt ook zonder vlag ──
    for (const w of [1440, 390]) {
      const ctx = await ctxVoor(w);
      const p0 = await open(ctx, { modus: 'oud', zonderfix: 1 });
      const diag = await p0.evaluate(() => { const c = document.querySelector('.mail-viewer-preview-cache')!; const r = c.getBoundingClientRect(); let el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as Element | null; while (el && el !== c) { const s = getComputedStyle(el); if (/(auto|scroll)/.test(s.overflowY)) return `${el.className.split(' ')[0]} overflow=${s.overflowY} overscroll=${s.overscrollBehaviorY} scrollruimte=${(el as HTMLElement).scrollHeight - (el as HTMLElement).clientHeight}`; el = el.parentElement; } return 'geen tussenscroller'; });
      check(`BUG-003 voor (${w}): tussenscroller zonder scrollruimte gevonden`, /mail-pdf-preview overflow=auto overscroll=contain scrollruimte=0/.test(diag), diag);
      check(`BUG-003 voor (${w}): muiswiel/touchpad scrolt het document NIET`, (await wiel(p0)) === 0);
      if (w === 390) check('BUG-003 voor (390): twee vingers scrollen NIET', (await veeg(p0, 2)) === 0);
      await p0.close();
      for (const modus of ['oud', 'nieuw']) {
        const p = await open(ctx, { modus });
        check(`BUG-003 na (${modus}, ${w}): muiswiel/touchpad scrolt`, (await wiel(p)) > 200);
        if (w === 390) {
          check(`BUG-003 na (${modus}, 390): één vinger scrolt`, (await veeg(p, 1)) > 100);
          check(`BUG-003 na (${modus}, 390): twee vingers scrollen`, (await veeg(p, 2)) > 100);
        }
        check(`BUG-003 na (${modus}, ${w}): PDF-balk blijft zichtbaar bovenaan`, await p.evaluate(() => { const b = document.querySelector('.bv2-pdfbalk, .mail-pdf-controls')!.getBoundingClientRect(), c = document.querySelector('.mail-viewer-preview-cache')!.getBoundingClientRect(); return b.top >= c.top - 1 && b.top < c.top + 20; }));
        await p.close();
      }
      await ctx.close();
    }
    // ── 2. Indeling per breedte: één regel, geen horizontaal scrollen, doelen ≥ 44 px, namen ──
    for (const w of [390, 768, 1440]) for (const thema of ['licht', 'donker']) for (const [index, soort, taal] of [[0, 'pdf', 'uk'], [1, 'beeld', 'uk'], [0, 'pdf', 'nl']] as const) {
      if (taal === 'nl' && thema === 'donker') continue;
      const ctx = await ctxVoor(w, thema);
      const p = await open(ctx, { modus: 'nieuw', thema: thema === 'donker' ? 'donker' : 'licht', index, lang: taal }, soort === 'pdf' ? '.mail-pdf-page.ready' : '.mail-viewer-scaled-content img');
      const thema_ = thema; { const thema = `${thema_} ${soort} ${taal}`;
      const m = await p.evaluate(() => {
        const kop = document.querySelector('header.bv2-kop')!.getBoundingClientRect();
        const knoppen = [...document.querySelectorAll('header.bv2-kop .bv2-knop, .bv2-pdfbalk .bv2-knop, .bv2-segment, .bv2-zoom-waarde, .bv2-pagina input')].filter((e) => (e as HTMLElement).offsetParent);
        const r = knoppen.map((e) => ({ n: e.getAttribute('aria-label') || '', b: e.getBoundingClientRect(), seg: e.classList.contains('bv2-segment') || e.tagName === 'INPUT' || e.classList.contains('bv2-zoom-waarde') }));
        const kopKnoppen = r.filter((x) => x.b.top < kop.bottom);
        return { kopH: kop.height, rijen: new Set(kopKnoppen.map((x) => Math.round((x.b.top + x.b.height / 2) / 8))).size, zonderNaam: r.filter((x) => !x.n && !x.seg).length,
          klein: r.filter((x) => !x.seg && (x.b.width < 43.5 && x.b.width < 30 || x.b.height < 43.5)).map((x) => `${x.n} ${Math.round(x.b.width)}×${Math.round(x.b.height)}`),
          hs: document.documentElement.scrollWidth - innerWidth, buiten: r.filter((x) => x.b.right > innerWidth + 1 || x.b.left < -1).map((x) => x.n),
          docDeel: (document.querySelector('.mail-viewer-preview-cache')!.getBoundingClientRect().height) / innerHeight };
      });
      check(`indeling ${w} ${thema}: kop één regel en ≤ 56 px`, m.rijen === 1 && m.kopH <= 56, `rijen=${m.rijen} h=${m.kopH}`);
      check(`indeling ${w} ${thema}: alle knoppen hebben een naam`, m.zonderNaam === 0);
      check(`indeling ${w} ${thema}: raakvlakken ≥ 44 px hoog`, m.klein.length === 0, m.klein.join(', '));
      check(`indeling ${w} ${thema}: niets buiten beeld, geen horizontaal scrollen`, m.hs <= 1 && m.buiten.length === 0, m.buiten.join(', '));
      check(`indeling ${w} ${thema}: document ≥ 80% van de hoogte`, m.docDeel >= 0.8, m.docDeel.toFixed(2));
      await p.close(); await ctx.close(); }
    }
    // ── 3. Gereedschap op de computer ──
    {
      const ctx = await ctxVoor(1440); const p = await open(ctx, { modus: 'nieuw' });
      // tooltip bij hover en bij toetsenbordfocus
      await p.hover("[data-bv2='print']"); await p.waitForTimeout(600);
      check('tooltip: verschijnt bij aanwijzen', await p.evaluate(() => getComputedStyle(document.querySelector("[data-bv2='print'] .bv2-tip")!).opacity === '1'));
      await p.mouse.move(5, 500); await p.focus("[data-bv2='sluit']"); await p.keyboard.press('Shift+Tab'); await p.keyboard.press('Tab'); await p.waitForTimeout(600);
      check('tooltip: verschijnt bij toetsenbordfocus', await p.evaluate(() => getComputedStyle(document.querySelector("[data-bv2='sluit'] .bv2-tip")!).opacity === '1'));
      check('tooltip: gekoppeld via aria-describedby', await p.evaluate(() => { const k = document.querySelector("[data-bv2='sluit']")!; return document.getElementById(k.getAttribute('aria-describedby')!)?.textContent?.includes('Esc') ?? false; }));
      // segmenten
      await p.click(".bv2-segment[data-waarde='page']"); await p.waitForTimeout(300);
      check('modus: «Вся сторінка» actief', await p.getAttribute('.mail-pdf-preview', 'data-pdf-fit') === 'page' && await p.getAttribute(".bv2-segment[data-waarde='page']", 'aria-checked') === 'true');
      await p.focus(".bv2-segment[data-waarde='page']"); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250);
      check('modus: pijltjestoets → «100%»', await p.getAttribute('.mail-pdf-preview', 'data-pdf-fit') === 'actual' && await p.evaluate(() => document.activeElement?.getAttribute('data-waarde') === 'actual'));
      check('zoom: 1:1 toont 100%', (await p.textContent("[data-bv2='zoom-waarde']"))?.trim() === '100%');
      await p.click(".bv2-segment[data-waarde='width']"); await p.waitForTimeout(250);
      const breedteProcent = Number((await p.textContent("[data-bv2='zoom-waarde']"))!.replace('%', ''));
      await p.click(".bv2-pdfbalk [data-bv2='zoom-plus']"); await p.waitForTimeout(250);
      const naPlus = Number((await p.textContent("[data-bv2='zoom-waarde']"))!.replace('%', ''));
      check('zoom: + verhoogt het werkelijke percentage en verlaat «passend»', naPlus > breedteProcent && await p.evaluate(() => !document.querySelector('.bv2-segment[aria-checked=true]')), `${breedteProcent} → ${naPlus}`);
      await p.click("[data-bv2='zoom-waarde']"); await p.fill("[data-bv2='zoom-invoer']", '150'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
      check('zoom: precieze waarde 150%', (await p.textContent("[data-bv2='zoom-waarde']"))?.trim() === '150%' && await p.getAttribute('.mail-pdf-preview', 'data-pdf-zoom') === '1.50');
      await p.click("[data-bv2='zoom-waarde']"); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      check('zoom: Esc sluit het venster', await p.locator('.bv2-zoom-venster').count() === 0);
      await p.click(".bv2-segment[data-waarde='width']"); await p.waitForTimeout(300);
      // pagina’s
      await p.fill("[data-bv2='pdf-pagina']", '4'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
      check('pagina: invoer 4 + Enter springt naar pagina 4', await p.inputValue("[data-bv2='pdf-pagina']") === '4');
      await p.click("[data-bv2='pdf-volgende']"); await p.waitForTimeout(1200);
      check('pagina: ↓ naar pagina 5', await p.inputValue("[data-bv2='pdf-pagina']") === '5');
      await p.click("[data-bv2='pdf-begin']"); await p.waitForTimeout(2000);
      { const v = await p.inputValue("[data-bv2='pdf-pagina']"), tp = await top(p); check('pagina: naar het begin', v === '1' && tp === 0, `pagina=${v} scrollTop=${tp}`); }
      // voorkeur bewaren
      await p.click(".bv2-segment[data-waarde='page']"); await p.click("[data-bv2='pdf-inklappen']"); await p.waitForTimeout(200);
      check('groep inklappen: PDF-balk ingeklapt', await p.locator('.bv2-pdfbalk.is-ingeklapt').count() === 1);
      await p.reload(); await p.waitForSelector('.mail-pdf-page.ready'); await p.waitForTimeout(300);
      check('voorkeur: modus en ingeklapte balk blijven na herladen', await p.getAttribute('.mail-pdf-preview', 'data-pdf-fit') === 'page' && await p.locator('.bv2-pdfbalk.is-ingeklapt').count() === 1);
      await p.click("[data-bv2='pdf-uitklappen']"); await p.click(".bv2-segment[data-waarde='width']");
      // split-knop downloaden
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click("header [data-bv2='download']")]);
      check('downloaden: één klik geeft het bestand', dl?.suggestedFilename() === LIJST[0].naam);
      check('downloaden: succes-staat zichtbaar', await p.getAttribute("header [data-bv2='download']", 'data-staat') === 'gelukt');
      await p.click("[data-bv2='download-meer']");
      check('downloaden ▾: menu met varianten', await p.locator('.bv2-menu [role=menuitem]').count() >= 2 && await p.getAttribute("[data-bv2='download-meer']", 'aria-expanded') === 'true');
      await p.click("[data-bv2='m-opslaan']"); await p.waitForTimeout(100);
      check('downloaden ▾: «Зберегти в сховище» roept dezelfde functie aan', (await p.evaluate(() => (window as any).__standLog || [])).includes('opslaan'));
      await p.click("[data-bv2='download-meer']"); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
      check('menu: Esc sluit het menu (venster blijft open)', await p.locator('.bv2-menu').count() === 0 && await p.locator('header.bv2-kop').count() === 1);
      await p.click("[data-bv2='download-meer']"); await p.mouse.click(700, 600); await p.waitForTimeout(100);
      check('menu: klik buiten sluit het menu', await p.locator('.bv2-menu').count() === 0);
      await p.click("header [data-bv2='print']"); await p.waitForTimeout(100);
      check('print: roept de bestaande functie aan', (await p.evaluate(() => (window as any).__standLog || [])).includes('print'));
      await p.click("header [data-bv2='bewerk']");
      check('bewerken: roept de bestaande functie aan', (await p.evaluate(() => (window as any).__standLog || [])).includes('bewerk'));
      // panelen
      check('ШІ-balk: standaard verborgen (document eerst)', await p.evaluate(() => getComputedStyle(document.querySelector('.ai-vertaling-balk')!).display === 'none'));
      await p.click("header [data-bv2='ai']"); await p.waitForTimeout(300);
      const ai = await p.evaluate(() => { const b = document.querySelector('.ai-vertaling-balk')!.getBoundingClientRect(), z = document.querySelector('.bv2-paneel')!.getBoundingClientRect(); return { zicht: b.width > 100 && b.height > 20, binnen: b.left >= z.left - 1 && b.right <= z.right + 1 && b.top >= z.top }; });
      check('ШІ: opent op verzoek in het zijpaneel', ai.zicht && ai.binnen, JSON.stringify(ai));
      await p.screenshot({ path: `${UIT}/na-pdf-1440-licht-ai-paneel.png` });
      await p.keyboard.press('Escape'); await p.waitForTimeout(150);
      check('ШІ: Esc sluit het paneel', await p.locator('.bv2-paneel').count() === 0);
      await p.click("header [data-bv2='details']"); await p.waitForTimeout(200);
      check('ⓘ: details (type, grootte) in het paneel', /application\/pdf/.test(await p.textContent('.bv2-details') || ''));
      await p.click("[data-bv2='paneel-sluit']");
      // bijlagen wisselen
      await p.click("header [data-bv2='volgende']"); await p.waitForSelector('.mail-viewer-scaled-content img');
      check('bijlagen: volgende → afbeelding, teller 2/3', /2\/3/.test(await p.textContent('header .bv2-teller') || ''));
      await p.click("[data-bv2='beeld-zoom'] [data-bv2='zoom-plus']"); await p.waitForTimeout(150);
      check('afbeelding: zoom + → 110%', (await p.textContent("[data-bv2='beeld-zoom'] .bv2-zoom-waarde"))?.trim() === '110%' && /zoom: 1\.1/.test(await p.getAttribute('.mail-viewer-scaled-content', 'style') || ''));
      check('afbeelding: «Поділитися» in het menu ▾ (geen dubbele knop)', await (async () => { await p.click("[data-bv2='download-meer']"); const n = await p.locator("[data-bv2='m-delen']").count(); await p.keyboard.press('Escape'); return n === 1 && await p.locator("header > .bv2-werkbalk [data-bv2='delen']").count() === 0; })());
      await p.screenshot({ path: `${UIT}/na-beeld-1440-licht-zoom110.png` });
      await p.click("header [data-bv2='volgende']"); await p.waitForTimeout(800);
      check('tekstbestand: viewer werkt, geen PDF-balk', await p.locator('.bv2-pdfbalk').count() === 0 && await p.locator('header.bv2-kop').count() === 1);
      await p.click("header [data-bv2='minimaliseer']");
      check('minimaliseren: roept de bestaande functie aan', await p.locator('[data-stand-weg=min]').count() === 1);
      await p.close();
      const p2 = await open(ctx, { modus: 'nieuw' }); await p2.click("header [data-bv2='sluit']");
      check('sluiten: roept de bestaande functie aan', await p2.locator('[data-stand-weg=dicht]').count() === 1);
      await p2.close(); await ctx.close();
    }
    // ── 4. Telefoon: menu •••, lang indrukken = uitleg (geen actie), onderblad ──
    {
      const ctx = await ctxVoor(390); const p = await open(ctx, { modus: 'nieuw' });
      check('telefoon: secundaire knoppen in «•••»', await p.locator("header [data-bv2='print']").count() === 0 && await p.locator("header [data-bv2='meer']").count() === 1);
      await tik(p, "header [data-bv2='minimaliseer']", 700);
      check('telefoon: lang indrukken toont uitleg en voert NIET uit', await p.locator('[data-stand-weg]').count() === 0 && await p.locator("header [data-bv2='minimaliseer'] .bv2-tip[data-open]").count() === 1);
      await tik(p, "header [data-bv2='meer']");
      check('telefoon: «•••» opent', await p.locator('.bv2-menu').count() === 1);
      await tik(p, "[data-bv2='m-ai']"); await p.waitForTimeout(350);
      const blad = await p.evaluate(() => { const z = document.querySelector('.bv2-paneel')!.getBoundingClientRect(); return { onder: Math.abs(z.bottom - innerHeight) < 2, breed: z.width >= innerWidth - 2 }; });
      check('telefoon: ШІ opent als onderblad', blad.onder && blad.breed, JSON.stringify(blad));
      await p.screenshot({ path: `${UIT}/na-pdf-390-licht-ai-blad.png` });
      await tik(p, "[data-bv2='paneel-sluit']");
      await tik(p, "header [data-bv2='volgende']"); await p.waitForSelector('.mail-viewer-scaled-content img');
      await tik(p, "header [data-bv2='zoom-waarde']"); await tik(p, ".bv2-zoom-venster [data-bv2='zoom-plus']");
      check('telefoon: afbeelding-zoom compact (− en + in het venster)', (await p.textContent("header [data-bv2='zoom-waarde']"))?.trim() === '110%');
      await p.screenshot({ path: `${UIT}/na-beeld-390-licht-zoomvenster.png` });
      await p.keyboard.press('Escape'); await tik(p, "header [data-bv2='vorige']"); await p.waitForSelector('.mail-pdf-page.ready');
      check('telefoon: twee vingers scrollen met v2', (await veeg(p, 2)) > 100);
      await p.close(); await ctx.close();
    }
    // ── 5. Minder beweging ──
    {
      const ctx = await ctxVoor(1440, 'licht', { reducedMotion: 'reduce' }); const p = await open(ctx, { modus: 'nieuw' });
      check('prefers-reduced-motion: geen overgangen', await p.evaluate(() => getComputedStyle(document.querySelector('.bv2-segment-glijder')!).transitionDuration.split(',').every((d) => parseFloat(d) === 0)));
      await p.close(); await ctx.close();
    }
    // ── 6. Schermafdrukken voor/na (390/768/1440, licht/donker, PDF en afbeelding) ──
    for (const w of [390, 768, 1440]) for (const thema of ['licht', 'donker']) for (const [i, soort] of [[0, 'pdf'], [1, 'beeld']] as const) for (const modus of ['oud', 'nieuw']) {
      const ctx = await ctxVoor(w, thema);
      const p = await open(ctx, { modus, thema: thema === 'donker' ? 'donker' : 'licht', index: i, ...(modus === 'oud' ? { zonderfix: 1 } : {}) }, soort === 'pdf' ? '.mail-pdf-page.ready' : '.mail-viewer-scaled-content img');
      await p.screenshot({ path: `${UIT}/${modus === 'oud' ? 'voor' : 'na'}-${soort}-${w}-${thema}.png` });
      await p.close(); await ctx.close();
    }
    check('geen fouten in de console', fouten.length === 0, fouten.slice(0, 5).join(' | '));
  } finally {
    await browser.close(); stand.stop();
  }
  return einde();
}
