// E2E «Mail zoeken v2» (UI-009, vlag mail-zoeken-v2) in ISOLATIE: stand tests/e2e/hulp/zoeken-stand (echte oude panelen en het
// nieuwe paneel), eigen http-server op 127.0.0.1, geen Google, geen productie.
// Gebruik: node scripts/e2e-lokaal.mjs mail-zoeken-v2     Schermafdrukken: E2E_SCREENSHOTS (standaard /workspace/wp-ui009/uitvoer/screens).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { checker } from '../eenheid/hulp/nep-google';
import { chromeArgs } from './server';
// @ts-expect-error -- plain ESM-hulp zonder typedeclaraties
import { startStand } from './hulp/zoeken-stand/bouw.mjs';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/wp-ui009/uitvoer/screens';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
type Page = import('playwright-core').Page;
const EDITORS = ['home', 'text', 'people', 'subject', 'status', 'date', 'label', 'scope', 'attachment', 'size', 'saved'] as const;

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-zoeken-v2');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  mkdirSync(UIT, { recursive: true });
  const stand = await startStand();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(1) });
  const fouten: string[] = [];
  const hoogte = (w: number) => (w <= 400 ? 844 : w <= 800 ? 1024 : 900);
  const open = async (w: number, q: Record<string, string>, thema = 'licht') => {
    const ctx = await browser.newContext({ viewport: { width: w, height: hoogte(w) }, colorScheme: thema === 'donker' ? 'dark' : 'light', ...(w <= 400 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') fouten.push(`console: ${m.text().slice(0, 200)}`); });
    await p.goto(`${stand.url}/?${new URLSearchParams({ thema, ...q })}`);
    await p.waitForSelector(q.modus?.startsWith('oud') ? '.mail-advanced-search,.mail-search-filter-popover' : '.mzv2');
    await p.waitForTimeout(250);
    return p;
  };
  const logs = (p: Page) => p.evaluate(() => ((window as any).__standLog || []) as string[]);
  const scrollers = (p: Page) => p.evaluate(() => [...document.querySelectorAll('.mzv2 *')].filter((el) => { const s = getComputedStyle(el); return /(auto|scroll)/.test(s.overflowY + s.overflowX) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1); }).map((el) => el.className.toString().split(' ')[0]));
  try {
    // ── 1. Schermafdrukken voor/na voor elke editor, 390/768/1440, licht/donker ──
    for (const w of [390, 768, 1440]) for (const thema of ['licht', 'donker']) {
      for (const v of EDITORS) {
        const p = await open(w, { modus: 'nieuw', weergave: v, voorbeeld: '1', opgeslagen: '1' }, thema);
        await p.screenshot({ path: `${UIT}/na-${v}-${w}-${thema}.png` });
        const r = await p.evaluate(() => { const el = document.querySelector('.mzv2')!.getBoundingClientRect(); const f = document.querySelector('.mzv2-voet')!.getBoundingClientRect(); return { top: el.top, bottom: el.bottom, left: el.left, right: el.right, voet: f.bottom, vw: innerWidth, vh: innerHeight, horiz: document.querySelector('.mzv2-werk')!.scrollWidth > document.querySelector('.mzv2-werk')!.clientWidth + 1 }; });
        check(`${v} ${w} ${thema}: paneel binnen het scherm, voet zichtbaar, geen horizontale scroll`, r.left >= 0 && r.right <= r.vw + 0.5 && r.bottom <= r.vh + 0.5 && r.voet <= r.vh + 0.5 && !r.horiz, JSON.stringify(r));
        const s = await scrollers(p);
        check(`${v} ${w} ${thema}: hooguit één scrollgebied (werkgebied)`, s.every((x) => x === 'mzv2-werk'), s.join(','));
        if (thema === 'licht' && w === 390) {
          const klein = await p.evaluate(() => [...document.querySelectorAll('.mzv2 button:not([disabled]), .mzv2 input:not([type=checkbox]), .mzv2 select')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 35.5 && !el.closest('.mail-search-chip') && !el.closest('.mail-date-calendar,.mail-calendar,[class*=calendar]'); }).map((el) => `${el.tagName}.${el.className}:${Math.round(el.getBoundingClientRect().height)}`));
          check(`${v} 390: tikdoelen ≥ 36px (meeste 44px)`, klein.length === 0, klein.slice(0, 5).join(' | '));
        }
        await p.context().close();
      }
      for (const m of ['oud-filters', 'oud-meer']) { const p = await open(w, { modus: m }, thema); await p.screenshot({ path: `${UIT}/voor-${m}-${w}-${thema}.png` }); await p.context().close(); }
    }
    // Voor-schermafdrukken van oude editors (Ще умови → kaart) op 1440/390 licht
    for (const w of [1440, 390]) {
      const p = await open(w, { modus: 'oud-meer' });
      for (const [i, naam] of ['text', 'people', 'subject', 'status', 'date', 'label', 'attachment', 'size', 'scope', 'saved'].entries()) {
        await p.locator('.mail-condition-row').nth(i).click(); await p.waitForTimeout(200);
        await p.screenshot({ path: `${UIT}/voor-${naam}-${w}-licht.png` });
        await p.locator('.mail-search-back').first().click(); await p.waitForTimeout(150);
      }
      await p.context().close();
    }
    // Oorzaak bevestigen: oude «Ще умови» start een zoekopdracht per klik in een lijst
    {
      const p = await open(1440, { modus: 'oud-meer' });
      await p.locator('.mail-condition-row').nth(1).click();
      for (let i = 0; i < 3; i++) await p.locator('.mail-search-list button').nth(i).click();
      const n = (await logs(p)).filter((x) => x === 'oud-zoeken').length;
      check('voor: oude editor zoekt bij elke klik (3 afzenders = 3 zoekopdrachten)', n === 3, String(n));
      await p.context().close();
    }
    // Oorzaak bevestigen: oude periode blokkeert datumkeuze zonder bevestigde grenzen
    {
      const p = await open(1440, { modus: 'oud-meer', grenzen: 'fout' });
      await p.locator('.mail-condition-row').nth(4).click(); await p.waitForTimeout(200);
      const uit = await p.locator('.mail-modern-date-field').first().isDisabled();
      check('voor: oude periode-velden uitgeschakeld bij grensfout', uit);
      await p.screenshot({ path: `${UIT}/voor-date-grensfout-1440-licht.png` });
      await p.context().close();
    }
    // ── 2. Gedrag nieuw paneel ──
    {
      const p = await open(1440, { modus: 'nieuw', weergave: 'people' });
      for (let i = 0; i < 3; i++) await p.locator('.mzv2-item.persoon').nth(i).click();
      check('concept: 3 afzenders kiezen start géén zoekopdracht', !(await logs(p)).some((x) => x.startsWith('zoeken:')));
      await p.locator('.mzv2-zoek-veld input').fill('nieuw@adres.example'); await p.keyboard.press('Enter');
      check('mensen: handmatig adres met Enter wordt chip', await p.locator('.mzv2-keuze-chips .mail-search-chip', { hasText: 'nieuw@adres.example' }).count() === 1);
      await p.locator('.mzv2-segment button', { hasText: 'Кому' }).click();
      await p.locator('.mzv2-zoek-veld input').fill('aan@x.example'); await p.keyboard.press('Enter');
      await p.locator('.mzv2-kop button').first().click();
      await p.locator('[data-mzv2-rij="status"]').click();
      await p.locator('.mzv2-segment button', { hasText: 'Непрочитані' }).click();
      await p.locator('.mzv2-kop button').first().click();
      const samenvatting = await p.locator('[data-mzv2-rij="people"] small').textContent();
      check('categoriewissel: gekozen waarden blijven bewaard', /нове|nieuw@adres/.test(samenvatting || '') && /aan@x/.test(samenvatting || ''), samenvatting || '');
      await p.locator('.mzv2-knop.primair').click();
      const z = (await logs(p)).filter((x) => x.startsWith('zoeken:'));
      check('zoeken: precies één zoekopdracht met alle voorwaarden', z.length === 1 && /nieuw@adres/.test(z[0]) && /"unread"/.test(z[0]), z.join(' | '));
      await p.context().close();
    }
    {
      const p = await open(1440, { modus: 'nieuw', weergave: 'date', grenzen: 'fout' });
      const uit = await p.locator('.mzv2-datumveld').first().isDisabled();
      check('periode: datumkeuze NIET geblokkeerd bij grensfout', !uit);
      check('periode: grensfout duidelijk uitgelegd met code', /MAIL_PERIOD_BOUNDS_TIMEOUT/.test(await p.locator('.mzv2-grens').textContent() || ''));
      await p.screenshot({ path: `${UIT}/na-date-grensfout-1440-licht.png` });
      await p.locator('.mzv2-segment button', { hasText: '30 днів' }).click();
      check('periode: preset toont gevormde periode', /—/.test(await p.locator('.mzv2-periode-gekozen strong').textContent() || ''));
      await p.locator('.mzv2-uitklap').click();
      check('periode: maand/jaar/kwartaal/seizoen pas na uitklappen', await p.locator('.mzv2-meer').count() === 1);
      await p.locator('.mzv2-meer .mzv2-segment button', { hasText: 'Квартал' }).click();
      await p.locator('.mzv2-raster button').first().click();
      await p.screenshot({ path: `${UIT}/na-date-uitgeklapt-1440-licht.png` });
      await p.locator('.mzv2-knop.primair').click();
      const z = (await logs(p)).filter((x) => x.startsWith('zoeken:'));
      check('periode: kwartaal geeft eigen bereik', z.length === 1 && /"custom"/.test(z[0]), z[0]);
      await p.context().close();
    }
    for (const g of ['laden', 'onbekend']) {
      const p = await open(390, { modus: 'nieuw', weergave: 'date', grenzen: g });
      check(`periode: staat «${g}» blokkeert de kalender niet`, !(await p.locator('.mzv2-datumveld').first().isDisabled()));
      await p.screenshot({ path: `${UIT}/na-date-grenzen-${g}-390-licht.png` });
      await p.context().close();
    }
    {
      const p = await open(1440, { modus: 'nieuw', weergave: 'size' });
      await p.locator('.mzv2-segment button', { hasText: 'Більше' }).click();
      await p.locator('.mzv2-grootte input').fill('-3');
      check('grootte: ongeldige waarde → melding en «Шукати» uit', await p.locator('.mzv2-fout').count() === 1 && await p.locator('.mzv2-knop.primair').isDisabled());
      await p.locator('.mzv2-grootte input').fill('2,5');
      check('grootte: 2,5 geldig', await p.locator('.mzv2-fout').count() === 0 && !(await p.locator('.mzv2-knop.primair').isDisabled()));
      await p.locator('.mzv2-knop.primair').click();
      check('grootte: komma genormaliseerd naar 2.5', (await logs(p)).some((x) => /"larger","2\.5"/.test(x)));
      await p.context().close();
    }
    {
      const p = await open(1440, { modus: 'nieuw', weergave: 'text' });
      const inp = p.locator('.mzv2-zoek-veld input').first();
      await inp.fill('fact'); await p.waitForTimeout(100);
      check('tekst: geschiedenis gefilterd met markering', await p.locator('.mzv2-voorstellen mark.mzv2-hit').count() >= 1);
      await inp.fill('has'); await inp.press('ArrowDown'); await inp.press('Enter');
      check('tekst: operator met toetsenbord aangevuld', (await inp.inputValue()).startsWith('has:attachment'));
      await inp.fill(''); await p.locator('.mzv2-voorstellen .mzv2-link').click();
      check('tekst: geschiedenis wissen', (await logs(p)).includes('wis-recent') && await p.locator('.mzv2-voorstellen').count() === 0);
      await p.locator('.mzv2-uitleg .mzv2-ikoon-knop').first().click();
      check('tekst: syntaxisuitleg pas achter ⓘ', await p.locator('.mzv2-uitleg-tekst').count() === 1);
      await p.context().close();
    }
    {
      const p = await open(1440, { modus: 'nieuw', weergave: 'label' });
      check('labels: geen herhaald «Системна тека»', !(/Системна тека/.test(await p.locator('.mzv2').textContent() || '')));
      check('labels: gegroepeerd (Теки / Мої мітки)', await p.locator('.mzv2-lijst h3', { hasText: 'Теки' }).count() === 1 && await p.locator('.mzv2-lijst h3', { hasText: 'Мої мітки' }).count() === 1);
      await p.context().close();
    }
    {
      const p = await open(1440, { modus: 'nieuw', weergave: 'saved', opgeslagen: '1' });
      await p.locator('button[aria-label^="Перейменувати"]').click(); await p.locator('.mzv2-hernoem input').fill('Мої рахунки'); await p.keyboard.press('Enter');
      check('opgeslagen: hernoemen', (await logs(p)).includes('hernoem:s1:Мої рахунки'));
      await p.locator('.mzv2-opgeslagen .mzv2-item').click();
      check('opgeslagen: starten = zoeken', (await logs(p)).some((x) => x.startsWith('zoeken:["рахунок"')));
      await p.context().close();
      const p2 = await open(390, { modus: 'nieuw', weergave: 'saved' });
      check('opgeslagen: compacte lege staat zonder knoppen', await p2.locator('.mzv2-werk button').count() === 0 && await p2.locator('.mzv2-leeg').count() === 1);
      await p2.context().close();
    }
    {
      const p = await open(1440, { modus: 'nieuw', weergave: 'people' });
      await p.keyboard.press('Escape');
      check('toetsenbord: Esc in editor → terug naar overzicht', await p.locator('[data-mail-zoeken-v2="home"]').count() === 1);
      await p.locator('[data-mzv2-rij="text"]').focus(); await p.keyboard.press('Escape');
      check('toetsenbord: Esc in overzicht → sluiten', (await logs(p)).includes('sluiten'));
      await p.context().close();
    }
    {
      const p = await open(1440, { modus: 'nieuw', lang: 'nl', weergave: 'home' });
      check('nl: titels in het Nederlands', /Zoeken en filters/.test(await p.locator('.mzv2-kop h2').textContent() || '') && /Tekst en deelnemers/.test(await p.locator('.mzv2').textContent() || ''));
      await p.screenshot({ path: `${UIT}/na-home-1440-licht-nl.png` });
      await p.context().close();
    }
    check('geen paginafouten', fouten.length === 0, fouten.slice(0, 3).join(' | '));
  } finally { await browser.close(); stand.stop(); }
  return einde();
}
