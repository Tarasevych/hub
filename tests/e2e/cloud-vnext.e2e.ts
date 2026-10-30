// E2E «Cloud vNext» (vlag cloud-vnext, migratie 0130) tegen de ECHTE lokale server (server/start.ts + Postgres + nep-Google):
// cloud.tarasevych.com. Alles loopt over de echte routes /api/owner/cloud/vnext/* — geen stubs voor de eigen opslag.
//   1. Vlag UIT → exact de oude pagina; vlag AAN → de nieuwe pagina in dezelfde chrome, ZONDER bouwmeldingen (de serverkant is echt).
//   2. «Mijn bestanden»: map maken, upload (zelfde naam = vervangen → versie), favoriet, labels, verplaatsen via de kiezer,
//      upload in 2 stukken (5 MiB), downloaden, multiselect → prullenbak → herstellen → definitief wissen (met bevestiging).
//   3. Werkruimtes (maken + filter naar bestanden), Snel opslaan (notitie), Overzicht met echte tellers.
//   4. Zoeken: eerlijke lege toestanden (start / niets gevonden) tegen de echte zoekroute.
//   5. Integratiecentrum: 12 aanbieders met eerlijke standen; niets heet «gekoppeld» zonder levende controle; sleutel-checklist
//      toont dat de omgevingssleutels ONTBREKEN; Google-bron eerlijk «niet gekoppeld»; geen merkafbeeldingen.
//   6. 320/390/768/1024/1440 px, licht en donker: geen horizontale scroll, onderbalk alleen smal, detail als volledig scherm.
// Gebruik: PLAYWRIGHT_CORE=… CHROME=… E2E_TLS=… node scripts/e2e-lokaal.mjs cloud-vnext
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/release-cloud-vnext/screens';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const HOSTS = ['id', 'mcp', 'mail', 'hub', 'admin', 'cloud', 'ai', 'huis'].map((h) => `https://${h}.tarasevych.com`);
const CLOUD = 'https://cloud.tarasevych.com';
const VERWACHT = [/^401 .*\/api\/owner\/meldingen\/gelezen$/, /* meldingencentrum van de eigenaar (102227): het chrome-widget mist in de e2e-sessie de dienstcontext — bekend, niet van deze suites */ /^403 .*\/api\/owner\/agents\/activity$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e cloud-vnext');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-cv-${T}@example.test`, sub = `sub-e2e-cv-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const vlagWas = (await pool.query(`SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'cloud-vnext'`)).rows[0] ?? { aan: false, standaard: false };
  const vlag = (aan: boolean) => pool.query(`UPDATE app.feature_flags SET aan = $1, standaard = $1 WHERE sleutel = 'cloud-vnext'`, [aan]);
  try {
    const b = G.browser();
    const tab = b.tab;
    await b.aanmelden(sub, eigenaar, { service: 'cloud', tabContext: tab, intent: 'login' });

    const sessie = async (o: { scheme?: 'light' | 'dark'; viewport?: { width: number; height: number }; mobiel?: boolean; pad?: string }) => {
      const ctx = await browser.newContext({ colorScheme: o.scheme || 'light', reducedMotion: 'reduce', locale: 'uk-UA', viewport: o.viewport || { width: 1440, height: 900 }, hasTouch: !!o.mobiel, isMobile: !!o.mobiel, timezoneId: 'Europe/Brussels', serviceWorkers: 'block', ignoreHTTPSErrors: process.env.E2E_EIGEN_CA !== '1' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((tb) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', tb); sessionStorage.removeItem('mr-vlag:cloud-vnext'); }, tab);
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) q.text().then((t) => fouten.push(`http ${k} ${t.slice(0, 200)}`), () => fouten.push(`http ${k}`)); });
      page.on('request', (q) => { const u = new URL(q.url()); if (!/^(data|blob):$/.test(u.protocol) && !/(^|\.)tarasevych\.com$/.test(u.hostname)) fouten.push(`extern verzoek: ${q.url()}`); });
      page.on('dialog', (d) => void d.accept());
      await page.goto(`${CLOUD}${o.pad || '/'}?lang=uk`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      return { ctx, page };
    };
    const overloop = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const naar = async (p: Page, slug: string, wacht: string) => { await p.goto(`${CLOUD}/${slug}?lang=uk`, { waitUntil: 'networkidle' }); await p.locator(wacht).first().waitFor({ timeout: 20000 }); };
    const ctxMenu = async (p: Page, kaartId: string, item: RegExp) => { await p.locator(`[data-cvn-meer="${kaartId}"]`).click(); await p.locator('[data-cvn-ctx]').waitFor({ timeout: 5000 }); await p.locator('[data-cvn-ctx] [role="menuitem"]').filter({ hasText: item }).first().click(); };

    // ================================================================ 1. vlag uit → exact de oude pagina
    await vlag(false);
    {
      const { ctx, page } = await sessie({});
      await page.locator('[data-cloud-architecture]').waitFor({ timeout: 20000 });
      check('vlag UIT: de oude cloudpagina (data-cloud-architecture) staat er, de nieuwe (data-cvn-pagina) niet', (await page.locator('[data-cloud-architecture]').count()) === 1 && (await page.locator('[data-cvn-pagina]').count()) === 0);
      await page.screenshot({ path: join(UIT, '00-oud-vlag-uit.png'), fullPage: true });
      await ctx.close();
    }

    // ================================================================ 2. vlag aan → nieuwe pagina, echte serverkant, eerlijk leeg
    await vlag(true);
    const { ctx, page } = await sessie({});
    let uploadRoepen = 0;
    page.on('response', (q) => { if (q.url().endsWith('/api/owner/cloud/vnext/upload') && q.status() === 200) uploadRoepen += 1; });
    await page.locator('[data-cvn-pagina="overview"]').waitFor({ timeout: 20000 });
    check('vlag AAN: de nieuwe pagina binnen dezelfde chrome; GEEN bouwmelding (serverkant echt); eerlijk lege start', (await page.locator('[data-cloud-architecture]').count()) === 0 && (await page.locator('.canonical-chrome').count()) === 1 && (await page.locator('[data-cvn-bouw]').count()) === 0 && (await page.locator('[data-cvn-leeg="overzicht"]').count()) === 1);
    await page.screenshot({ path: join(UIT, '01-overzicht-leeg.png'), fullPage: true });

    // ================================================================ 3. Mijn bestanden: map, upload → versie, favoriet, labels
    await naar(page, 'bestanden', '[data-cvn-pagina="files"]');
    check('Bestanden: eerlijk leeg, geen bouwmelding, werkbalk aanwezig', (await page.locator('[data-cvn-leeg]').count()) === 1 && (await page.locator('[data-cvn-bouw]').count()) === 0 && (await page.locator('[data-cvn-upload="knop"]').count()) === 1);
    await page.locator('[data-cvn-nieuwe-map=""]').click();
    await page.locator('[data-cvn-nieuwe-map="laag"] [data-cvn-eerste]').fill('Проєкт e2e');
    await page.locator('[data-cvn-nieuwe-map="laag"] button[type="submit"]').click();
    await page.locator('[data-cvn-map]').waitFor({ timeout: 10000 });
    check('nieuwe map via een eigen venster (geen window.prompt): de map staat in het raster', (await page.locator('[data-cvn-map]').count()) === 1);
    const invoer = page.locator('input.cvn-verborgen[multiple]'); /* de werkbalk-invoer; het hervat-veld in het overdrachtenpaneel is enkelvoudig */
    await invoer.setInputFiles({ name: 'nota-e2e.txt', mimeType: 'text/plain', buffer: Buffer.from('versie-1: eerste inhoud') });
    await page.locator('[data-cvn-kaart]').waitFor({ timeout: 15000 });
    check('upload van een klein bestand: één kaart', (await page.locator('[data-cvn-kaart]').count()) === 1);
    await invoer.setInputFiles({ name: 'nota-e2e.txt', mimeType: 'text/plain', buffer: Buffer.from('versie-2: nieuwe inhoud, iets langer dan v1') });
    await page.waitForTimeout(1200);
    const notaId = String(await page.locator('[data-cvn-kaart]').first().getAttribute('data-cvn-kaart'));
    check('zelfde naam in dezelfde map = vervangen, geen duplicaat', (await page.locator('[data-cvn-kaart]').count()) === 1);
    await ctxMenu(page, notaId, /Версії/);
    await page.locator(`[data-cvn-versies="${notaId}"].cvn-laag, .cvn-laag [data-cvn-versies]`).first().waitFor({ timeout: 10000 }).catch(() => undefined);
    await page.locator('.cvn-versie-rijen li').first().waitFor({ timeout: 10000 });
    check('versies: de vorige inhoud staat als 1 versie klaar, met «Відновити» en «Завантажити»', (await page.locator('.cvn-versie-rijen li').count()) === 1 && /Відновити/.test(await page.locator('.cvn-versie-rijen').innerText()));
    await page.screenshot({ path: join(UIT, '02-versies.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.locator(`[data-cvn-favoriet="${notaId}"]`).first().click();
    await page.waitForTimeout(600);
    await page.locator('[data-cvn-favoriet="filter"]').click();
    await page.waitForTimeout(600);
    check('favoriet: ster op de kaart → filter «Обрані» toont precies dit bestand', (await page.locator('[data-cvn-kaart]').count()) === 1);
    await page.locator('[data-cvn-favoriet="filter"]').click();
    await ctxMenu(page, notaId, /Теґи/);
    await page.locator('.cvn-laag [data-cvn-eerste]').fill('e2e-tag');
    await page.locator('.cvn-laag [data-cvn-eerste]').press('Enter');
    await page.locator('.cvn-laag [data-cvn-tag="e2e-tag"]').waitFor({ timeout: 5000 });
    await page.locator('.cvn-laag .cvn-laag-knoppen button.is-hoofd').click();
    await page.waitForTimeout(800);
    await page.locator('[data-cvn-tag="filter"]').fill('e2e-tag');
    await page.locator('[data-cvn-tag="filter"]').press('Enter');
    await page.waitForTimeout(600);
    check('label toegevoegd en het labelfilter vindt het bestand', (await page.locator('[data-cvn-kaart]').count()) === 1 && (await page.locator('[data-cvn-tag="e2e-tag"]').count()) >= 1);
    await page.locator('[data-cvn-tag="e2e-tag"]').first().click();
    await page.waitForTimeout(400);

    // ================================================================ 4. 5 MiB in 2 stukken, downloaden, verplaatsen, prullenbak
    const voorUpload = uploadRoepen;
    await invoer.setInputFiles({ name: 'groot-e2e.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(5 * 1024 * 1024 + 7, 7) });
    await page.locator('[data-cvn-upload="wachtrij"]').waitFor({ timeout: 5000 }).catch(() => undefined);
    await page.waitForFunction(() => document.querySelectorAll('[data-cvn-kaart]').length === 2, undefined, { timeout: 30000 });
    check('5 MiB: upload in stukken (begin + 2 stukken + klaar = 4 aanroepen), kaart verschijnt', uploadRoepen - voorUpload >= 4, `aanroepen=${uploadRoepen - voorUpload}`);
    const grootId = String(await page.locator('[data-cvn-kaart]').filter({ hasText: 'groot-e2e' }).first().getAttribute('data-cvn-kaart'));
    const downloadKlaar = page.waitForResponse((q) => q.url().endsWith('/api/owner/cloud/vnext/download') && q.status() === 200, { timeout: 20000 });
    await ctxMenu(page, grootId, /Завантажити на ПК/);
    await downloadKlaar;
    check('downloaden: de downloadroute antwoordt 200 met de inhoud', true);
    await page.screenshot({ path: join(UIT, '03-bestanden-raster.png'), fullPage: true });
    await ctxMenu(page, notaId, /Перемістити/);
    await page.locator('.cvn-laag [data-cvn-mapkiezer]').waitFor({ timeout: 10000 });
    await page.locator('.cvn-laag [data-cvn-mapkiezer] [role="option"]').filter({ hasText: 'Проєкт e2e' }).first().click();
    await page.locator('.cvn-laag button.cvn-knop.is-hoofd').last().click();
    await page.waitForTimeout(1000);
    check('verplaatsen via de mapkiezer: in de wortel blijft 1 kaart over', (await page.locator('[data-cvn-kaart]').count()) === 1);
    await page.locator('[data-cvn-map]').first().click();
    await page.waitForTimeout(800);
    check('de map in: het verplaatste bestand staat er, het kruimelpad toont de map', (await page.locator('[data-cvn-kaart]').count()) === 1 && (await page.locator('[data-cvn-crumb]').count()) === 2);
    await page.locator('[data-cvn-weergave]').click();
    await page.waitForTimeout(400);
    check('weergavewissel: lijst (tabel) met dezelfde rij', (await page.locator('table [data-cvn-kaart]').count()) === 1);
    await page.locator('[data-cvn-weergave]').click();
    await page.locator('[data-cvn-crumb="wortel"]').click();
    await page.waitForTimeout(600);
    await page.locator(`[data-cvn-selectie="${grootId}"]`).click();
    await page.locator('[data-cvn-selectie="balk"]').waitFor({ timeout: 5000 });
    await page.locator('[data-cvn-prullenbak="keuze"]').click();
    await page.waitForTimeout(1000);
    check('multiselect → prullenbak: de kaart is weg uit de wortel', (await page.locator('[data-cvn-kaart]').count()) === 0);
    await page.locator('[data-cvn-prullenbak="schakel"]').click();
    await page.waitForTimeout(800);
    check('prullenbak aan: het bestand staat er (30 dagen bewaard)', (await page.locator('[data-cvn-kaart]').count()) === 1);
    await page.locator(`[data-cvn-selectie="${grootId}"]`).click();
    await page.locator('[data-cvn-herstel="keuze"]').click();
    await page.waitForTimeout(1000);
    check('herstellen uit de prullenbak', (await page.locator('[data-cvn-kaart]').count()) === 0);
    await page.locator('[data-cvn-prullenbak="schakel"]').click();
    await page.waitForTimeout(800);
    check('terug in de wortel na herstel', (await page.locator('[data-cvn-kaart]').count()) === 1);
    await ctxMenu(page, grootId, /У кошик/);
    await page.waitForTimeout(800);
    await page.locator('[data-cvn-prullenbak="schakel"]').click();
    await page.waitForTimeout(800);
    await page.locator(`[data-cvn-selectie="${grootId}"]`).click();
    await page.locator('[data-cvn-definitief="keuze"]').click();
    await page.locator('[data-cvn-definitief="laag"]').waitFor({ timeout: 5000 });
    await page.screenshot({ path: join(UIT, '04-definitief-bevestiging.png') });
    await page.locator('[data-cvn-definitief="laag"] [data-cvn-eerste]').click();
    await page.waitForTimeout(1000);
    check('definitief wissen pas na een uitdrukkelijke bevestiging in een eigen venster', (await page.locator('[data-cvn-kaart]').count()) === 0);
    await page.locator('[data-cvn-prullenbak="schakel"]').click();
    await page.waitForTimeout(600);

    // ================================================================ 5. detailpaneel, werkruimtes, snel opslaan, overzicht
    await page.locator('[data-cvn-map]').first().click();
    await page.locator('[data-cvn-kaart]').first().waitFor({ timeout: 10000 });
    await page.locator('[data-cvn-kaart]').first().click();
    await page.locator('.cvn-laag [data-cvn-detail]').first().waitFor({ timeout: 10000 });
    check('kaart openen → detailpaneel rechts met voorvertoning en acties', (await page.locator('.cvn-laag.is-paneel section[data-cvn-detail]').count()) === 1 && (await page.locator('[data-cvn-acties="detail"]').count()) === 1);
    await page.screenshot({ path: join(UIT, '05-detailpaneel.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await naar(page, 'werkruimtes', '[data-cvn-werkruimtes]');
    await page.locator('[data-cvn-ws-nieuw=""]').click();
    await page.locator('[data-cvn-ws-nieuw="laag"] [data-cvn-eerste]').fill('Ремонт e2e');
    await page.locator('[data-cvn-ws-nieuw="laag"] button[type="submit"]').click();
    await page.locator('[data-cvn-ws]').waitFor({ timeout: 15000 });
    const wsId = String(await page.locator('[data-cvn-ws]').first().getAttribute('data-cvn-ws'));
    check('werkruimte aangemaakt via de bestaande, beproefde route', (await page.locator('[data-cvn-ws]').count()) === 1);
    await page.locator(`[data-cvn-ws-filter="${wsId}"]`).click();
    await page.locator('[data-cvn-pagina="files"]').waitFor({ timeout: 10000 });
    check('«Openen in Mijn bestanden» zet het werkruimtefilter (badge zichtbaar, lijst leeg want niets erin)', (await page.locator(`[data-cvn-ws-filter="${wsId}"]`).count()) === 1 && (await page.locator('[data-cvn-kaart]').count()) === 0);
    await page.locator(`[data-cvn-ws-filter="${wsId}"]`).click();
    await naar(page, 'vastleggen', '[data-cvn-vastleggen]');
    await page.locator('[data-cvn-vastleggen] [data-cvn-eerste]').fill('Нотатка e2e: швидке збереження працює');
    await page.locator('[data-cvn-vastleggen] button[type="submit"]').click();
    await page.waitForTimeout(1500);
    check('Snel opslaan: notitie bewaard zonder fout', (await page.locator('[data-cvn-vastleggen] .cvn-melding.is-fout').count()) === 0);
    await naar(page, 'overzicht', '[data-cvn-overzicht]');
    await page.locator('[data-cvn-tegels]').waitFor({ timeout: 15000 });
    const tegel = async (n: string) => Number((await page.locator(`[data-cvn-tegel="${n}"] strong`).first().innerText()).replace(/\D/g, ''));
    check('Overzicht: echte tellers — 2 items (nota + notitie), 1 favoriet, prullenbak leeg; soortverdeling en recent gevuld', (await tegel('bestanden')) === 2 && (await tegel('favorieten')) === 1 && (await tegel('prullenbak')) === 0 && (await page.locator('[data-cvn-soort="balken"]').count()) === 1 && (await page.locator('[data-cvn-recent] li').count()) >= 1);
    await page.screenshot({ path: join(UIT, '06-overzicht-gevuld.png'), fullPage: true });

    // ================================================================ 6. zoeken: eerlijke lege toestanden tegen de echte route
    await naar(page, 'zoeken', '[data-cvn-zoek-balk]');
    check('Zoeken: eerlijke starttoestand + bronkeuze (eigen bestanden en Drive — de cloudbronnen van de zoekindex)', (await page.locator('[data-cvn-zoek-leeg="start"]').count()) === 1 && (await page.locator('[data-cvn-zoek-bron]').count()) === 2);
    await page.locator('[data-cvn-zoek-veld]').fill('qqzz-niets-e2e-404');
    await page.locator('[data-cvn-zoek-veld]').press('Enter');
    await page.locator('[data-cvn-zoek-leeg="geen"]').waitFor({ timeout: 20000 });
    check('niets gevonden → eerlijke lege toestand (geen verzonnen resultaten), geen fout', (await page.locator('[data-cvn-zoek-fout]').count()) === 0);
    await page.screenshot({ path: join(UIT, '07-zoeken.png'), fullPage: true });

    // ================================================================ 7. integratiecentrum: eerlijk, levend, zonder merkbeelden
    await naar(page, 'accounts', '[data-cvi-centrum]');
    const standen = { nm: await page.locator('[data-cvi-standbadge="niet-mogelijk"]').count(), sl: await page.locator('[data-cvi-standbadge="sleutels-nodig"]').count(), gp: await page.locator('[data-cvi-standbadge="gepland"]').count() };
    check('12 aanbieders met eerlijke standen: 2 «niet mogelijk» (iCloud/Proton), 3 «sleutels nodig», 4 «gepland»', (await page.locator('[data-cvi-aanbieder]').count()) === 12 && standen.nm === 2 && standen.sl === 3 && standen.gp === 4, JSON.stringify(standen));
    check('Google Drive zonder account: eerlijk «koppelen», niets heet gekoppeld zonder levende controle', (await page.locator('[data-cvi-aanbieder="google-drive"] [data-cvi-actie="koppelen"]').count()) === 1 && (await page.locator('[data-cvi-account]').count()) === 0);
    check('sleutel-checklist OneDrive: elke omgevingssleutel eerlijk «ontbreekt» (niets aanwezig op deze server)', (await page.locator('[data-cvi-checklist="onedrive"] [data-cvi-env]').count()) >= 2 && (await page.locator('[data-cvi-checklist="onedrive"] [data-cvi-stand="aanwezig"]').count()) === 0);
    check('levende status: synchronisatieblok aanwezig; geen merkafbeeldingen (monogrammen, geen <img>)', (await page.locator('[data-cvi-sync]').count()) >= 4 && (await page.locator('[data-cvi-centrum] img').count()) === 0);
    await page.screenshot({ path: join(UIT, '08-integraties.png'), fullPage: true });
    await naar(page, 'google', '[data-cvi-bron="google-drive"]');
    check('bronverkenner Google Drive zonder koppeling: eerlijke uitleg + koppelknop, geen verzonnen lijsten', (await page.locator('[data-cvi-actie="koppelen"]').count()) >= 1 && (await page.locator('[data-cvi-bestand]').count()) === 0);
    await naar(page, 'agenda', '[data-cvn-pagina="calendar"]');
    check('Agenda-tab hergebruikt de echte Google-weergave: zonder koppeling een eerlijke uitleg', /Google/.test(await page.locator('[data-cvn-pagina="calendar"]').innerText()));
    check('integratiecentrum toont de grens van Google Drive mét de bron van die grens', (await page.goto(`${CLOUD}/accounts?lang=uk`, { waitUntil: 'networkidle' }).then(() => page.locator("[data-cvi-grens='google-drive']").count())) >= 1);

    // ================================================================ 7b. overdrachten: netwerkbreuk → herhalen, herladen → hervatten
    await naar(page, 'bestanden', '[data-cvn-pagina="files"]');
    // Routefase: stuk offset 0 valt ALTIJD weg (tot we het uitzetten); het eerste stuk op offset 4 MiB valt éénmaal weg
    // (bewijst de automatische herhaling); al het andere gaat door. De teller telt stukken die de server echt bereiken.
    let faalOffset0 = true, eenmaligGefaald = false, stukDoor = 0, stukNaHerlaad = 0, naHerlaad = false;
    await page.route('**/api/owner/cloud/vnext/upload', (route) => {
      const body = route.request().postData() || '';
      if (body.includes('"actie":"stuk"')) {
        if (faalOffset0 && /"offset":\s*0[,}]/.test(body)) return route.abort('internetdisconnected');
        if (faalOffset0 && !eenmaligGefaald && body.includes(`"offset":${4 * 1024 * 1024}`)) { eenmaligGefaald = true; return route.abort('internetdisconnected'); }
        stukDoor += 1; if (naHerlaad) stukNaHerlaad += 1;
      }
      return route.continue();
    });
    const hervatInhoud = Buffer.alloc(8 * 1024 * 1024 + 512 * 1024, 42); // 3 stukken van 4 MiB
    await invoer.setInputFiles({ name: 'hervat-e2e.bin', mimeType: 'application/octet-stream', buffer: hervatInhoud });
    await page.locator('[data-cvn-ov-rij]').first().waitFor({ timeout: 15000 });
    const tStuk = Date.now();
    while (stukDoor < 2 && Date.now() - tStuk < 30000) await page.waitForTimeout(250);
    check('netwerkbreuk midden in de upload: stuk 2 faalde en werd automatisch herhaald, stukken 2 en 3 staan op de server, stuk 1 blijft wegvallen', stukDoor === 2 && eenmaligGefaald, `door=${stukDoor}`);
    await page.screenshot({ path: join(UIT, '09-overdracht-breuk.png') });
    // Herladen midden in de upload (zoals een gesloten en heropend tabblad binnen dezelfde sessie): de overdracht is
    // hervattbaar; na het opnieuw aanwijzen van HETZELFDE bestand gaat ALLEEN het ontbrekende stuk nog over de lijn.
    naHerlaad = true; faalOffset0 = false;
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-cvn-ov-rij="hervatbaar"]').waitFor({ timeout: 20000 });
    await page.screenshot({ path: join(UIT, '10-overdracht-hervatbaar.png') });
    await page.locator('[data-cvn-ov-hervat]').first().click();
    await page.locator('input.cvn-verborgen:not([multiple])').setInputFiles({ name: 'hervat-e2e.bin', mimeType: 'application/octet-stream', buffer: hervatInhoud });
    await page.locator('[data-cvn-ov-rij="klaar"]').waitFor({ timeout: 30000 });
    await page.locator('[data-cvn-kaart]').filter({ hasText: 'hervat-e2e' }).first().waitFor({ timeout: 15000 });
    check('hervatten na herladen: alleen het ontbrekende stuk ging nog over de lijn (1 van 3), het bestand staat compleet', stukNaHerlaad === 1, `na-herlaad=${stukNaHerlaad}`);
    await page.screenshot({ path: join(UIT, '11-overdracht-klaar.png') });
    await page.unroute('**/api/owner/cloud/vnext/upload');
    // Preflight naar Google Drive: 8,5 MiB > de 5-MB-grens van onze verpakking — het venster zegt eerlijk WIE de grens stelt
    // en wat de mens kan doen; er bestaat geen knop die het toch probeert.
    const hervatId = String(await page.locator('[data-cvn-kaart]').filter({ hasText: 'hervat-e2e' }).first().getAttribute('data-cvn-kaart'));
    await page.locator(`[data-cvn-meer="${hervatId}"]`).click();
    await page.locator('[data-cvn-ctx]').waitFor({ timeout: 5000 });
    await page.locator(`[data-cvn-ov-drive="${hervatId}"]`).click();
    await page.locator('[data-cvn-ov-preflight="geblokkeerd"]').waitFor({ timeout: 10000 });
    const preflightTekst = await page.locator('[data-cvn-ov-preflight="geblokkeerd"]').innerText();
    check('preflight eigen→Drive: eerlijk geblokkeerd met de BRON van de grens (onze verpakking, 5 МБ) en een suggestie', /5 МБ|5 MB/.test(preflightTekst) && /упаковк|verpakking/i.test(preflightTekst) && (await page.locator('[data-cvn-ov-preflight="geblokkeerd"] [data-cvn-ov-fout="DOEL_LIMIET"]').count()) >= 1);
    await page.screenshot({ path: join(UIT, '12-preflight-grens.png') });
    await page.keyboard.press('Escape');
    await ctx.close();

    // ================================================================ 8. viewports, licht/donker, onderbalk, mobiel detail
    const maten: Array<[number, number, boolean]> = [[320, 640, true], [390, 844, true], [768, 1024, true], [1024, 768, false], [1440, 900, false]];
    for (const [w, h, mobiel] of maten) for (const scheme of ['light', 'dark'] as const) {
      const s = await sessie({ viewport: { width: w, height: h }, mobiel, scheme, pad: '/bestanden' });
      await s.page.locator('[data-cvn-pagina="files"]').waitFor({ timeout: 20000 });
      await s.page.waitForTimeout(500);
      await s.page.screenshot({ path: join(UIT, `20-${w}x${h}-${scheme}.png`), fullPage: true });
      const over = await overloop(s.page);
      const smal = w <= 760;
      const onderbalk = await s.page.locator('.cvn-onderbalk').count();
      check(`${w}×${h} ${scheme}: geen horizontale scroll (${over}px), ${smal ? 'onderbalk' : 'geen onderbalk'}`, over <= 0 && (smal ? onderbalk === 1 : onderbalk === 0));
      if (w === 390 && scheme === 'dark') {
        await s.page.locator('[data-cvn-kaart], [data-cvn-map]').first().waitFor({ timeout: 15000 });
        await s.page.locator('[data-cvn-map]').first().click();
        await s.page.locator('[data-cvn-kaart]').first().waitFor({ timeout: 10000 });
        await s.page.locator('[data-cvn-kaart]').first().click();
        await s.page.locator('.cvn-laag [data-cvn-detail]').first().waitFor({ timeout: 10000 });
        const vak = await s.page.locator('.cvn-laag .cvn-laag-vak').boundingBox();
        check('390 px: het detail opent als volledig scherm', !!vak && vak.width >= 388, String(vak?.width));
        await s.page.screenshot({ path: join(UIT, '21-390-detail-donker.png') });
        await s.page.keyboard.press('Escape');
        await s.page.waitForTimeout(400);
        await s.page.locator('.cvn-onderbalk [data-cvn-onderbalk="search"]').click();
        await s.page.locator('[data-cvn-zoek-balk]').waitFor({ timeout: 10000 });
        await s.page.locator('.cvn-onderbalk [data-cvn-onderbalk="capture"]').click();
        await s.page.locator('[data-cvn-vastleggen]').waitFor({ timeout: 10000 });
        check('390 px: onderbalk navigeert (zoeken, plus → snel opslaan)', true);
        await s.page.locator('.cvn-onderbalk summary').click();
        await s.page.waitForTimeout(300);
        check('390 px: «Ще» toont de overige onderdelen', /Робочі простори/.test(await s.page.locator('.cvn-onderbalk-menu').innerText()) && /Календар/.test(await s.page.locator('.cvn-onderbalk-menu').innerText()));
        await s.page.screenshot({ path: join(UIT, '22-390-meer-menu.png') });
      }
      await s.ctx.close();
    }
    const echteFouten = fouten.filter((f) => !/favicon/.test(f));
    check('geen paginafouten, consolefouten, onverwachte 4xx/5xx of externe verzoeken', echteFouten.length === 0, echteFouten.slice(0, 5).join(' | '));
  } catch (e) {
    console.error('e2e cloud-vnext afgebroken:', (e as Error).message, '| fouten:', fouten.slice(0, 8).join(' | '));
    throw e;
  } finally {
    await vlag(vlagWas.aan).catch(() => undefined);
    await pool.query(`UPDATE app.feature_flags SET standaard = $1 WHERE sleutel = 'cloud-vnext'`, [vlagWas.standaard]).catch(() => undefined);
    await browser.close();
    await stop();
  }
  return einde();
}
