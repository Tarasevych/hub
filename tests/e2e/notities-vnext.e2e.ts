// E2E «Notities vNext» (vlag notities-vnext, migratie 0127) tegen de ECHTE lokale server (server/start.ts + Postgres + nep-Google):
// hub.tarasevych.com/notities. Geen productie, geen Google: alles via chromeArgs() naar 127.0.0.1.
//   1. Vlag UIT → precies de oude pagina; vlag AAN → de nieuwe, met dezelfde notitie (zelfde id) die via het OUDE bord was gemaakt.
//   2. Aanmaken, zoeken, vinkje, archiveren/terug, prullenbak/herstel, import met voorbeeld, bronnen zonder nepknoppen.
//   3. Toetsen: Ctrl+K, Ctrl+N, Esc. Versieconflict via een tweede wijziging buiten de bewerker om → melding, geen stil overschrijven.
//   4. 320/390/768/1024/1440 px, licht en donker: geen horizontale scroll, geen paginafout; schermafdrukken in E2E_SCREENSHOTS.
// Gebruik: PLAYWRIGHT_CORE=… CHROME=… E2E_TLS=… node scripts/e2e-lokaal.mjs notities-vnext
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/release-notities-vnext/screens';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const HOSTS = ['id', 'mcp', 'mail', 'hub', 'admin', 'cloud', 'ai'].map((h) => `https://${h}.tarasevych.com`);
const HUB = 'https://hub.tarasevych.com';
const VERWACHT = [/^401 .*\/api\/owner\/meldingen\/gelezen$/, /* meldingencentrum van de eigenaar (102227): het chrome-widget mist in de e2e-sessie de dienstcontext — bekend, niet van deze suites */ /^403 .*\/api\/owner\/agents\/activity$/, /^409 .*\/api\/notities\/wijzig$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e notities-vnext');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-vn-${T}@example.test`, sub = `sub-e2e-vn-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const vlagWas = (await pool.query(`SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'notities-vnext'`)).rows[0] ?? { aan: false, standaard: false };
  const vlag = (aan: boolean) => pool.query(`UPDATE app.feature_flags SET aan = $1, standaard = $1 WHERE sleutel = 'notities-vnext'`, [aan]);
  let uid = '';
  try {
    const b = G.browser();
    const tab = b.tab; // hetzelfde tabblad als b.ctxBody(), zodat bord-aanroepen en de pagina dezelfde lade zien
    await b.aanmelden(sub, eigenaar, { service: 'hub', tabContext: tab, intent: 'login' });
    uid = String((await pool.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    // Een notitie via de OUDE weg (het bord, zoals manage_hub_notes doet) — die moet straks in de nieuwe pagina staan, zelfde id.
    const oud = await b.verzoek('hub.tarasevych.com', '/api/mcp/board', b.ctxBody('hub', { kind: 'note', title: 'Стара нотатка з дошки', body: '- [ ] молоко\n- [x] хліб', tags: ['hub', 'soort:lijst', 'kleur:geel', 'huis'] }));
    const oudId = String((oud.data as any)?.note?.id || '');
    check('voorbereiding: notitie via het oude bord aangemaakt (zelfde route als manage_hub_notes)', oud.status === 200 && oudId.length > 10, `${oud.status} ${oudId}`);

    const sessie = async (o: { scheme?: 'light' | 'dark'; viewport?: { width: number; height: number }; mobiel?: boolean; url?: string }) => {
      const ctx = await browser.newContext({ colorScheme: o.scheme || 'light', reducedMotion: 'reduce', locale: 'uk-UA', viewport: o.viewport || { width: 1440, height: 900 }, hasTouch: !!o.mobiel, isMobile: !!o.mobiel, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block', ignoreHTTPSErrors: process.env.E2E_EIGEN_CA !== '1' /* zonder NSS-CA: het testcertificaat van E2E_TLS vertrouwen; alleen lokaal */ });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((tb) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', tb); sessionStorage.removeItem('mr-vlag:notities-vnext'); }, tab);
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });
      page.on('request', (q) => { const u = new URL(q.url()); if (!/^(data|blob):$/.test(u.protocol) && !/(^|\.)tarasevych\.com$/.test(u.hostname)) fouten.push(`extern verzoek: ${q.url()}`); });
      await page.goto(o.url || `${HUB}/notities?lang=uk`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      return { ctx, page };
    };
    const overloop = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    // ================================================================ 1. vlag uit → oude pagina
    await vlag(false);
    {
      const { ctx, page } = await sessie({});
      await page.locator('[data-hub-notes]').waitFor({ timeout: 20000 });
      check('vlag UIT: de oude pagina «Нотатки» (data-hub-notes) staat er, geen nieuwe', (await page.locator('[data-hub-notes]').count()) === 1 && (await page.locator('[data-vn-pagina]').count()) === 0);
      await page.locator(`[data-hub-note="${oudId}"]`).waitFor({ timeout: 10000 }).catch(() => undefined);
      check('vlag UIT: de via het bord gemaakte notitie staat in de oude lijst (spiegel)', (await page.locator(`[data-hub-note="${oudId}"]`).count()) === 1);
      await page.screenshot({ path: join(UIT, '00-oud-vlag-uit.png'), fullPage: true });
      await ctx.close();
    }

    // ================================================================ 2. vlag aan → nieuwe pagina, zelfde notitie
    await vlag(true);
    const { ctx, page } = await sessie({});
    await page.locator('[data-vn-pagina]').waitFor({ timeout: 20000 });
    await page.locator('[data-vn-raster]').waitFor({ timeout: 20000 });
    check('vlag AAN: de nieuwe pagina (data-vn-pagina=alle) binnen dezelfde chrome, oude pagina weg', (await page.locator('[data-vn-pagina="alle"]').count()) === 1 && (await page.locator('[data-hub-notes]').count()) === 0 && (await page.locator('.canonical-service-list').count()) >= 1);
    const oudeKaart = page.locator(`[data-vn-notitie="${oudId}"]`);
    check('de oude notitie staat er met DEZELFDE id, als checklist (geel), met etiket #huis en 1/2 voortgang', (await oudeKaart.count()) === 1 && (await oudeKaart.getAttribute('data-vn-soort')) === 'lijst' && /huis/.test(await oudeKaart.innerText()) && /1\/2/.test(await oudeKaart.innerText()));
    await page.screenshot({ path: join(UIT, '01-nieuw-1440-licht.png'), fullPage: true });

    // vinkje op de kaart → opslaan (en de spiegel volgt)
    await oudeKaart.locator('input[data-regel="0"]').click();
    await page.waitForTimeout(900);
    check('een vinkje op de kaart slaat meteen op: 2/2', /2\/2/.test(await oudeKaart.innerText()));
    const spiegel = (await pool.query(`SELECT body FROM app.mcp_console_items WHERE id = $1`, [oudId])).rows[0];
    check('… en het oude bord (de spiegel voor manage_hub_notes) toont dezelfde afgevinkte regel', spiegel?.body === '- [x] молоко\n- [x] хліб');

    // ================================================================ 3. aanmaken met toetsen
    await page.keyboard.press('Control+n');
    await page.locator('[data-vn-bewerker="nieuw"]').waitFor({ timeout: 10000 });
    check('Ctrl+N opent de bewerker als paneel rechts (geen volledig scherm op 1440 px)', (await page.locator('.vn-laag.is-paneel [data-vn-bewerker="nieuw"]').count()) === 1);
    await page.locator('[data-vn-bewerker="nieuw"] input[data-vn-eerste]').fill('Нова нотатка з e2e');
    await page.locator('[data-vn-bewerker="nieuw"] textarea').fill('# Заголовок\n\nТекст з **жирним** і <script>alert(1)</script>\n\n- [ ] пункт один\n- [ ] пункт два');
    await page.locator('[data-vn-bewerker="nieuw"] [data-vn-voorbeeld]').click();
    const vb = page.locator('[data-vn-voorbeeldvak]');
    const vbInfo = { strong: await vb.locator('strong').count(), script: await vb.locator('script').count(), vinkjes: await vb.locator('input[type=checkbox]').count(), tekst: (await vb.innerText()).slice(0, 120) };
    check('voorbeeld in de bewerker: vet gerenderd, <script> als tekst (geen uitvoering), checklist met vinkjes', vbInfo.strong === 1 && /<script>/.test(vbInfo.tekst) && vbInfo.script === 0 && vbInfo.vinkjes === 2, JSON.stringify(vbInfo));
    await page.screenshot({ path: join(UIT, '02-bewerker-voorbeeld.png') });
    await page.locator('[data-vn-bewerker="nieuw"] [data-vn-voorbeeld]').click();
    await page.locator('[data-vn-bewerker="nieuw"] textarea').focus();
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(1200);
    const nieuwe = page.locator('[data-vn-notitie]').filter({ hasText: 'Нова нотатка з e2e' });
    check('Ctrl+S bewaart: de nieuwe notitie staat in de lijst en de bewerker blijft open op die notitie (bewerken)', (await nieuwe.count()) === 1 && (await page.locator('.vn-laag [data-vn-bewerker]').count()) === 1 && (await page.locator('[data-vn-bewerker="nieuw"]').count()) === 0);
    const nieuwId = await nieuwe.getAttribute('data-vn-notitie');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('Esc sluit de bewerker', (await page.locator('.vn-laag').count()) === 0);

    // ================================================================ 4. versieconflict (geen stil overschrijven)
    await nieuwe.locator('[data-vn-actie="bewerk"]').click();
    await page.locator(`[data-vn-bewerker="${nieuwId}"]`).waitFor({ timeout: 10000 });
    // Intussen wijzigt «iemand anders» (de oude weg / een AI via het bord) dezelfde notitie.
    const elders = await b.verzoek('hub.tarasevych.com', '/api/mcp/board', b.ctxBody('hub', { kind: 'edit', id: nieuwId, title: 'Змінено ззовні', tags: ['hub'] }), { methode: 'PATCH' });
    check('voorbereiding conflict: wijziging via het oude bord geslaagd', elders.status === 200, String(elders.status));
    await page.locator(`[data-vn-bewerker="${nieuwId}"] input[data-vn-eerste]`).fill('Моя версія');
    await page.keyboard.press('Control+s');
    await page.locator('[data-vn-conflict]').waitFor({ timeout: 10000 });
    await page.locator('[data-vn-conflict] summary').click();
    check('verouderde versie → melding met de andere versie; niets stil overschreven', (await page.locator('[data-vn-conflict]').count()) === 1 && /Змінено ззовні/.test(await page.locator('[data-vn-conflict]').innerText()) && (await page.locator('[data-vn-bewerker]').count()) === 1);
    await page.screenshot({ path: join(UIT, '03-versieconflict.png') });
    await page.locator('[data-vn-conflict] .vn-knop.is-stil').click(); // «Взяти ту версію»
    await page.waitForTimeout(300);
    check('«die versie overnemen» zet de titel van buiten in de bewerker', (await page.locator(`[data-vn-bewerker="${nieuwId}"] input[data-vn-eerste]`).inputValue()) === 'Змінено ззовні');
    await page.keyboard.press('Escape');

    // ================================================================ 5. zoeken, archief, prullenbak
    await page.keyboard.press('/');
    const focusInfo = await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className} zoek=${document.activeElement?.getAttribute('data-vn-zoek')} palet=${document.querySelector('[data-zoek-palet]')?.getAttribute('data-zoek-palet')}`);
    check('«/» zet de focus in het zoekveld van de pagina (Ctrl+K blijft van het zoekpalet van de chrome)', await page.evaluate(() => document.activeElement?.getAttribute('data-vn-zoek') === '1') && (await page.locator('[data-zoek-palet="open"]').count()) === 0, focusInfo);
    await page.keyboard.type('хліб');
    await page.waitForTimeout(900);
    check('zoeken op een Oekraïens woord uit de tekst vindt alleen die notitie', (await page.locator('[data-vn-notitie]').count()) === 1 && (await page.locator(`[data-vn-notitie="${oudId}"]`).count()) === 1);
    await page.locator('[data-vn-zoek]').fill('');
    await page.waitForTimeout(700);
    await page.locator(`[data-vn-notitie="${oudId}"] [data-vn-actie="archief"]`).click();
    await page.waitForTimeout(900);
    check('archiveren haalt de notitie uit «Усі»', (await page.locator(`[data-vn-notitie="${oudId}"]`).count()) === 0);
    await page.locator('[data-vn-weergave="archief"]').click();
    await page.locator('[data-vn-pagina="archief"]').waitFor();
    await page.waitForTimeout(700);
    check('«Архів» toont haar, met de knop «uit archief»', (await page.locator(`[data-vn-notitie="${oudId}"] [data-vn-actie="uit-archief"]`).count()) === 1);
    await page.locator(`[data-vn-notitie="${oudId}"] [data-vn-actie="uit-archief"]`).click();
    await page.waitForTimeout(700);
    await page.locator('[data-vn-weergave="alle"]').click();
    await page.waitForTimeout(700);
    await page.locator(`[data-vn-notitie="${oudId}"] [data-vn-actie="prullenbak"]`).click();
    await page.waitForTimeout(900);
    const spiegelWeg = (await pool.query(`SELECT 1 FROM app.mcp_console_items WHERE id = $1`, [oudId])).rows.length;
    check('prullenbak: uit «Усі», en de spiegelrij op het bord is weg (manage_hub_notes ziet haar niet meer)', (await page.locator(`[data-vn-notitie="${oudId}"]`).count()) === 0 && spiegelWeg === 0);
    await page.locator('[data-vn-weergave="prullenbak"]').click();
    await page.locator('[data-vn-pagina="prullenbak"]').waitFor();
    await page.waitForTimeout(700);
    check('«Кошик» toont haar met uitleg over 30 dagen en knop «herstellen»', (await page.locator('[data-vn-prullenbak-uitleg]').count()) === 1 && (await page.locator(`[data-vn-notitie="${oudId}"] [data-vn-actie="herstel"]`).count()) === 1);
    await page.screenshot({ path: join(UIT, '04-prullenbak.png'), fullPage: true });
    await page.locator(`[data-vn-notitie="${oudId}"] [data-vn-actie="herstel"]`).click();
    await page.waitForTimeout(900);
    const spiegelTerug = (await pool.query(`SELECT 1 FROM app.mcp_console_items WHERE id = $1`, [oudId])).rows.length;
    check('herstel: weg uit de prullenbak, spiegelrij terug met dezelfde id', (await page.locator(`[data-vn-notitie="${oudId}"]`).count()) === 0 && spiegelTerug === 1);

    // ================================================================ 6. import met voorbeeld
    await page.locator('[data-vn-weergave="alle"]').click();
    await page.waitForTimeout(500);
    await page.locator('[data-vn-knop="import"]').click();
    await page.locator('[data-vn-import]').waitFor({ timeout: 10000 });
    const md = join(UIT, 'import-proef.md'); writeFileSync(md, '---\ntitle: Імпортована з Obsidian\ntags: [план, obsidian]\n---\n# Імпортована\n\n- [ ] перше\n- [ ] друге\n');
    const txt = join(UIT, 'import-proef.txt'); writeFileSync(txt, 'Просто текст із телефону HONOR.\nДругий рядок.');
    const png = join(UIT, 'plaat.png'); writeFileSync(png, 'x');
    await page.locator('[data-vn-import] input[type=file]').setInputFiles([md, txt, png]);
    await page.locator('[data-vn-import-voorbeeld]').waitFor({ timeout: 10000 });
    const vbTekst = await page.locator('[data-vn-import-voorbeeld]').innerText();
    check('import-voorbeeld: 2 items (md als checklist met etiketten, txt), 1 fout voor .png — nog niets aangemaakt', (await page.locator('[data-vn-import-voorbeeld]').getAttribute('data-vn-import-voorbeeld')) === '2' && /Імпортована з Obsidian/.test(vbTekst) && /#план/.test(vbTekst) && /невідомий формат/.test(vbTekst) && (await page.locator('[data-vn-notitie]').filter({ hasText: 'Імпортована' }).count()) === 0);
    await page.screenshot({ path: join(UIT, '05-import-voorbeeld.png') });
    await page.locator('[data-vn-import-uitvoeren]').click();
    await page.waitForTimeout(1500);
    check('import uitgevoerd: beide notities staan in de lijst, venster dicht', (await page.locator('.vn-laag').count()) === 0 && (await page.locator('[data-vn-notitie]').filter({ hasText: 'Імпортована з Obsidian' }).count()) === 1 && (await page.locator('[data-vn-notitie]').filter({ hasText: 'import proef' }).count()) === 1);

    // ================================================================ 7. bronnen: eerlijk, geen nepknoppen
    await page.locator('[data-vn-weergave="bronnen"]').click();
    await page.locator('[data-vn-bronnen]').waitFor({ timeout: 10000 });
    const bronnen = page.locator('[data-vn-bron]');
    const n = await bronnen.count();
    let koppelKnoppen = 0; let gepland = 0;
    for (let i = 0; i < n; i++) { const t = await bronnen.nth(i).innerText(); const knoppen = await bronnen.nth(i).locator('button').allInnerTexts(); if (knoppen.some((k) => /Підключити|Koppelen|Синхронізувати/.test(k))) koppelKnoppen++; if (/заплановано/.test(t)) gepland++; }
    check(`bronnen: ${n} kaarten, nergens een knop «Підключити», ${gepland}× «заплановано» met uitleg wat ontbreekt`, n >= 10 && koppelKnoppen === 0 && gepland >= 4 && (await page.locator('[data-vn-bron-import="bestanden"]').count()) === 1);
    await page.screenshot({ path: join(UIT, '06-bronnen.png'), fullPage: true });
    check('1440 px: geen horizontale scroll', (await overloop(page)) <= 0);
    await ctx.close();

    // ================================================================ 8. viewports, licht en donker
    const maten: Array<[number, number, boolean]> = [[320, 700, true], [390, 844, true], [768, 1024, true], [1024, 768, false], [1440, 900, false]];
    for (const [w, h, mobiel] of maten) for (const scheme of ['light', 'dark'] as const) {
      const s = await sessie({ viewport: { width: w, height: h }, mobiel, scheme });
      await s.page.locator('[data-vn-raster]').waitFor({ timeout: 20000 });
      await s.page.screenshot({ path: join(UIT, `10-${w}x${h}-${scheme}.png`), fullPage: true });
      const over = await overloop(s.page);
      const smal = w <= 760;
      const onderbalk = await s.page.locator('.vn-onderbalk').count();
      const rail = await s.page.locator('.vn-rail').count();
      check(`${w}×${h} ${scheme}: geen horizontale scroll (${over}px), ${smal ? 'onderbalk met «+» en geen rail' : 'rail en geen onderbalk'}`, over <= 0 && (smal ? onderbalk === 1 && rail === 0 && (await s.page.locator('.vn-onderbalk [data-vn-knop="nieuw"]').count()) === 1 : onderbalk === 0 && rail === 1));
      if (w === 390 && scheme === 'dark') {
        await s.page.locator('.vn-onderbalk [data-vn-knop="nieuw"]').click();
        await s.page.locator('[data-vn-bewerker="nieuw"]').waitFor({ timeout: 10000 });
        const vak = await s.page.locator('.vn-laag.is-scherm .vn-laag-vak').boundingBox();
        check('390 px: de bewerker opent op het hele scherm, met de opslagknop in beeld', (await s.page.locator('.vn-laag.is-scherm').count()) === 1 && !!vak && vak.width >= 388 && (await s.page.locator('[data-vn-bewaar]').isVisible()), String(vak?.width));
        await s.page.screenshot({ path: join(UIT, '11-390-bewerker-donker.png') });
        const knop = await s.page.locator('[data-vn-bewaar]').boundingBox();
        check('390 px: tik-doel van «Створити» is minstens 44 px hoog', !!knop && knop.height >= 44, String(knop?.height));
        await s.page.keyboard.press('Escape');
        await s.page.locator('.vn-onderbalk summary').click();
        await s.page.waitForTimeout(300);
        check('390 px: «Ще» toont archief, prullenbak en import', /Архів/.test(await s.page.locator('.vn-onderbalk-menu').innerText()) && /Кошик/.test(await s.page.locator('.vn-onderbalk-menu').innerText()));
        await s.page.screenshot({ path: join(UIT, '12-390-meer-menu.png') });
      }
      await s.ctx.close();
    }
    const echteFouten = fouten.filter((f) => !/favicon/.test(f));
    check('geen paginafouten, consolefouten, onverwachte 4xx/5xx of externe verzoeken', echteFouten.length === 0, echteFouten.slice(0, 5).join(' | '));
  } finally {
    await vlag(vlagWas.aan).catch(() => undefined);
    await pool.query(`UPDATE app.feature_flags SET standaard = $1 WHERE sleutel = 'notities-vnext'`, [vlagWas.standaard]).catch(() => undefined);
    if (uid) {
      await pool.query(`DELETE FROM app.notities WHERE user_id = $1`, [uid]).catch(() => undefined);
      await pool.query(`DELETE FROM app.notities_mappen WHERE user_id = $1`, [uid]).catch(() => undefined);
      await pool.query(`DELETE FROM app.mcp_console_items WHERE user_id = $1`, [uid]).catch(() => undefined);
    }
    await browser.close();
    await stop();
  }
  return einde();
}
