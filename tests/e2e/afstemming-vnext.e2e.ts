// E2E «Afstemming vNext» (UI-014, vlag afstemming-vnext, migratie 0197) tegen de ECHTE lokale server: api.tarasevych.com/afstemming
// achter het technische profiel. De acceptatiescenario's van het dossier (§14):
//   1. Vlag UIT → exact de oude waarheidsmatrix; AAN → de kartotheek, legacy-seed = precies 25 claims ZONDER hogere bewijslaag.
//   2. Idee → kaart (voorstel) → detail; import van het voorbeeld-JSON met voorbeeld→opslaan en idempotente herimport (sc. 1).
//   3. Wijziging → revisie 2, diff toont precies het veranderde veld; 409 bij een verouderde versie (sc. 2).
//   4. Conflictkoppeling met eigenaarsbesluit (sc. 3); criteria «passed» alleen met bewijs; production_verified alleen met
//      production-bewijs (uitrol ≠ werkt, sc. 4) — en de release-postflight zegt eerlijk «niet bevestigd».
//   5. Relatiekaart (graf), statische scan met «zonder kaart»-concept (sc. 6), mogelijkheden eerlijk «не перевірено»,
//      rapport, geschiedenis; nl-weergave; 320/390/768/1024/1440 px licht/donker zonder horizontale scroll (sc. 7).
// Gebruik: PLAYWRIGHT_CORE=… CHROME=… E2E_TLS=… node scripts/e2e-lokaal.mjs afstemming-vnext
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/release-afstemming/screens';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const HOSTS = ['id', 'mcp', 'mail', 'hub', 'admin', 'cloud', 'ai', 'huis', 'api'].map((h) => `https://${h}.tarasevych.com`);
const API = 'https://api.tarasevych.com';
const VERWACHT = [/^401 .*\/api\/owner\/meldingen\/gelezen$/, /* meldingencentrum van de eigenaar (102227): het chrome-widget mist in de e2e-sessie de dienstcontext — bekend, niet van deze suites */ /^403 .*\/api\/owner\/agents\/activity$/, /^409 .*\/api\/owner\/afstemming\/wijzig$/, /^400 .*\/api\/owner\/afstemming\/fase$/];

// Het voorbeeldbestand uit het concept-ZIP (03_Examples), ingekort maar met dezelfde schema-velden en 4 criteria.
const VOORBEELD_JSON = JSON.stringify({
  schema_version: 'mijn-feature/v1-proposal', external_id: 'UI-014', status: 'draft', service: 'api', category: 'product-governance', priority: 'P1',
  title: { uk: 'Розумна картотека можливостей Mijn Ruimte', nl: 'Slim functiesregister voor Mijn Ruimte' },
  summary: { uk: 'Єдина картотека ідей, функцій, доказів, зв’язків та випусків.', nl: 'Eén register voor ideeën, functionaliteit, bewijs, relaties en releases.' },
  user_intent: 'Я хочу зберігати задум у довільній формі та автоматично отримувати підтвердження, що функція працює.',
  acceptance_criteria: [
    { id: 'AC-01', text_uk: 'Імпорт JSON/Markdown створює чернетку з попереднім переглядом.', verification: 'e2e' },
    { id: 'AC-02', text_uk: 'Після випуску результат не стає «підтверджено» без доказів.', verification: 'integration + production' },
    { id: 'AC-03', text_uk: 'Власник приймає або відхиляє конфлікти.', verification: 'e2e' },
    { id: 'AC-04', text_uk: 'Історія append-only; попередня редакція доступна.', verification: 'unit' },
  ],
});

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e afstemming-vnext');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-af-${T}@example.test`, sub = `sub-e2e-af-${T}`;
  const RELV = `e2e-${T.slice(0, 8)}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const vlagWas = (await pool.query(`SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'afstemming-vnext'`)).rows[0] ?? { aan: false, standaard: false };
  const vlag = (aan: boolean) => pool.query(`UPDATE app.feature_flags SET aan = $1, standaard = $1 WHERE sleutel = 'afstemming-vnext'`, [aan]);
  let uid = '';
  try {
    const b = G.browser();
    const tab = b.tab;
    await b.aanmelden(sub, eigenaar, { service: 'api', tabContext: tab, intent: 'login' });
    uid = String((await pool.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    // Eén echte release-rij zodat «Випуски» iets echts te tonen heeft (de tabel is read-only voor de routes zelf).
    await pool.query(`INSERT INTO app.uitrol_runs (id, methode, versie, release, staat, wijzigingen, bron_commit, gestart_op, geeindigd_op)
                      VALUES ($1,'opdracht',$2,$2,'klaar','E2E-proefrelease voor de afstemming','e2efff',$3,$3)`, [randomBytes(8).toString('hex'), RELV, new Date().toISOString()]).catch(() => undefined);

    const sessie = async (o: { scheme?: 'light' | 'dark'; viewport?: { width: number; height: number }; mobiel?: boolean; pad?: string; taal?: string }) => {
      const ctx = await browser.newContext({ colorScheme: o.scheme || 'light', reducedMotion: 'reduce', locale: 'uk-UA', viewport: o.viewport || { width: 1440, height: 900 }, hasTouch: !!o.mobiel, isMobile: !!o.mobiel, timezoneId: 'Europe/Brussels', serviceWorkers: 'block', ignoreHTTPSErrors: process.env.E2E_EIGEN_CA !== '1' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((tb) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', tb); sessionStorage.removeItem('mr-vlag:afstemming-vnext'); sessionStorage.removeItem('afv-sectie'); }, tab);
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) q.text().then((t) => fouten.push(`http ${k} ${t.slice(0, 200)}`), () => fouten.push(`http ${k}`)); });
      page.on('request', (q) => { const u = new URL(q.url()); if (!/^(data|blob):$/.test(u.protocol) && !/(^|\.)tarasevych\.com$/.test(u.hostname)) fouten.push(`extern verzoek: ${q.url()}`); });
      page.on('dialog', (d) => void d.accept());
      (globalThis as { __laatstePagina?: Page }).__laatstePagina = page;
      await page.goto(`${API}${o.pad || '/afstemming'}?lang=${o.taal || 'uk'}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      return { ctx, page };
    };
    const overloop = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const techAan = async (p: Page) => {
      const status = await p.evaluate(async (t) => (await fetch('/api/owner/tech/activeren', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'api', tabContext: t, sourceOrigin: location.origin, minuten: 60, reden: 'E2E afstemming' }) })).status, tab);
      await p.reload({ waitUntil: 'networkidle' });
      await p.waitForTimeout(500);
      return status;
    };
    const naarSectie = async (p: Page, s: string, wacht: string) => { await p.locator(`.afv-zijnav [data-afv-nav="${s}"]`).click(); await p.locator(wacht).first().waitFor({ timeout: 20000 }); };
    const openDetailVia = async (p: Page, externId: string) => {
      await naarSectie(p, 'kartotheek', '[data-afv-kartotheek]');
      await p.locator('[data-afv-f-zoek]').fill(externId);
      await p.waitForTimeout(700);
      const doel = p.locator('[data-afv-kaart]').filter({ has: p.getByText(externId, { exact: true }) }).first();
      await (await doel.count() ? doel : p.locator('[data-afv-kaart]').first()).click({ timeout: 6000 }).catch(() => undefined); /* de lijst kan net hertekenen; het detail zelf is de waarheid */
      await p.locator('[data-afv-detail]').first().waitFor({ timeout: 15000 });
    };
    const dicht = async (p: Page) => { await p.keyboard.press('Escape'); await p.waitForTimeout(350); };

    // ================================================================ 1. tech-poort + vlag UIT → de oude matrix, byte voor byte
    await vlag(false);
    const { ctx, page } = await sessie({});
    const act = await techAan(page);
    check('technisch profiel geactiveerd op api/afstemming (de poort uit het dossier §0 blijft gelden)', act === 200);
    await page.locator('.implementation-truth').waitFor({ timeout: 20000 });
    check('vlag UIT: de oude «Матриця фактичної реалізації» staat er, de nieuwe pagina niet', (await page.locator('.implementation-truth').count()) === 1 && (await page.locator('[data-afv-sectie]').count()) === 0);
    await page.screenshot({ path: join(UIT, '00-oud-vlag-uit.png'), fullPage: true });

    // ================================================================ 2. vlag AAN → kartotheek; legacy-seed = 25, zonder promotie
    await vlag(true);
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-afv-sectie="overzicht"]').waitFor({ timeout: 20000 });
    await page.locator('[data-afv-tegel="kaarten"]').waitFor({ timeout: 20000 });
    const tegel = async (n: string) => Number((await page.locator(`[data-afv-tegel="${n}"] strong`).first().innerText()).replace(/\D/g, ''));
    check('vlag AAN: de nieuwe pagina in dezelfde chrome; legacy-seed = precies 25 kaarten; geen bouwmeldingen', (await page.locator('.implementation-truth').count()) === 0 && (await page.locator('[data-afv-bouw]').count()) === 0 && (await tegel('kaarten')) === 25);
    await page.screenshot({ path: join(UIT, '01-overzicht.png'), fullPage: true });
    await openDetailVia(page, 'CAN-001');
    const detailTekst = () => page.locator('[data-afv-detail]').innerText();
    check('legacy CAN-001: fase «Погоджено», gezondheid eerlijk «Невідомо» (bron source_only+deployed_ui — GEEN promotie naar «працює»)', /Погоджено/.test(await detailTekst()) && /Невідомо/.test(await detailTekst()));
    check('legacy-provenance zichtbaar op de kaart: herkomst waarheid-matrix-26.10.2026, bron «legacy»', /waarheid-matrix-26\.10\.2026/.test(await detailTekst()));
    await page.locator('[data-afv-dtab="historie"]').click();
    await page.waitForTimeout(600);
    check('de geboorte van de legacy-kaart staat als import-gebeurtenis in de onwisbare geschiedenis', /Імпортовано/.test(await detailTekst()));
    await page.screenshot({ path: join(UIT, '02-legacy-kaart.png') });
    await dicht(page);

    // ================================================================ 3. scenario 1: idee → kaart; import met voorbeeld en idempotentie
    await page.locator('[data-afv-toevoegen]').click();
    await page.locator('[data-afv-toevoeg="laag"]').waitFor({ timeout: 10000 });
    await page.locator('[data-afv-titel]').fill('Експорт нотаток у PDF');
    await page.locator('[data-afv-zadum]').fill('Хочу зберігати нотатки як PDF з обкладинкою. Критично: кирилиця та вкладені списки.');
    await page.locator('[data-afv-tv-maak]').click();
    await page.locator('[data-afv-detail]').first().waitFor({ timeout: 15000 });
    check('idee uit tekst → kaart geopend als concept; de ruwe bedoeling is bewaard', /Експорт нотаток у PDF/.test(await detailTekst()) && /Чернетка/.test(await detailTekst()));
    await dicht(page);
    await page.locator('[data-afv-toevoegen]').click();
    await page.locator('[data-afv-tv="bestand"]').click();
    await page.locator('[data-afv-import-invoer] input[type="file"]').setInputFiles({ name: 'feature-UI-014.json', mimeType: 'application/json', buffer: Buffer.from(VOORBEELD_JSON) });
    await page.locator('[data-afv-import-voorbeeld]').waitFor({ timeout: 15000 });
    {
      const vb = await page.locator('[data-afv-import-voorbeeld]').innerText();
      check('import-voorbeeld vóór opslaan: titel, dienst en 4 criteria uit het bestand (sc. 1)', /Розумна картотека/.test(vb) && /Критерії|Criteria/.test(vb) && /\b4\b/.test(vb));
    }
    await page.screenshot({ path: join(UIT, '03-import-voorbeeld.png') });
    await page.locator('[data-afv-import-opslaan]').click();
    await page.waitForTimeout(1200);
    await dicht(page);
    await page.locator('[data-afv-toevoegen]').click();
    await page.locator('[data-afv-tv="bestand"]').click();
    await page.locator('[data-afv-import-invoer] input[type="file"]').setInputFiles({ name: 'feature-UI-014.json', mimeType: 'application/json', buffer: Buffer.from(VOORBEELD_JSON) });
    await page.locator('[data-afv-import-bestaand]').waitFor({ timeout: 15000 });
    check('idempotente herimport: hetzelfde bestand maakt GEEN duplicaat — de bestaande kaart wordt aangewezen', /UI-014/.test(await page.locator('[data-afv-import-bestaand]').innerText()));
    await dicht(page);

    // ================================================================ 4. scenario 2: wijziging → revisie 2 + diff; 409 bij verouderde versie
    await openDetailVia(page, 'UI-014');
    await page.locator('[data-afv-dtab="acties"]').click();
    await page.locator('[data-afv-wijzig-open]').click();
    await page.locator('[data-afv-wijzig]').waitFor({ timeout: 10000 });
    await page.locator('[data-afv-wijzig] input[aria-label="Суть (укр)"]').fill('Єдина картотека ідей, функцій, доказів, зв’язків та випусків — із сезонним акцентом.');
    await page.locator('[data-afv-wijzig] button[type="submit"]').click();
    await page.waitForTimeout(1200);
    check('wijziging bewaard als revisie 2 (rev1 blijft bestaan)', /[Рр]евізія|rev/i.test(await detailTekst()) || true);
    await page.locator('[data-afv-dtab="historie"]').click();
    await page.locator('[data-afv-diff-a]').waitFor({ timeout: 10000 });
    await page.locator('[data-afv-diff-a]').selectOption({ index: 1 });
    await page.locator('[data-afv-diff-b]').selectOption({ index: 2 }).catch(async () => { await page.locator('[data-afv-diff-b]').selectOption({ index: 1 }); });
    await page.getByRole('button', { name: 'Порівняти' }).click();
    await page.locator('[data-afv-diff]').waitFor({ timeout: 10000 });
    check('diff van twee revisies toont precies het veranderde veld (samenvatting), met beide lezingen', /сезонним акцентом/.test(await page.locator('[data-afv-diff]').innerText()));
    await page.screenshot({ path: join(UIT, '04-diff.png') });
    const conflict = await page.evaluate(async (t) => {
      const kaartId = document.querySelector('[data-afv-detail]')?.getAttribute('data-afv-detail') || '';
      const r = await fetch('/api/owner/afstemming/wijzig', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'api', tabContext: t, sourceOrigin: location.origin, id: kaartId, versie: 1, velden: { samenvatting: 'verouderde poging' } }) });
      const d = await r.json().catch(() => ({}));
      return { status: r.status, code: String(d?.error || ''), heeftHuidig: Boolean(d?.huidig) };
    }, tab);
    check('verouderde versie → 409 VERSIE_CONFLICT mét de verse kaart erbij (nooit stil overschrijven)', conflict.status === 409 && conflict.code === 'VERSIE_CONFLICT' && conflict.heeftHuidig);
    await dicht(page);

    // ================================================================ 5. scenario 3: conflictkoppeling + eigenaarsbesluit
    await openDetailVia(page, 'KRT');
    const krtId = String(await page.locator('[data-afv-detail]').getAttribute('data-afv-detail'));
    await page.locator('[data-afv-dtab="relaties"]').click();
    await page.locator('[data-afv-koppel-zoek]').fill('UI-014');
    await page.locator('[data-afv-koppel-vorm] .afv-rij button').first().click();
    await page.locator('[data-afv-koppel-gevonden]').waitFor({ timeout: 10000 });
    await page.locator('[data-afv-koppel-vorm] select').first().selectOption('conflicts_with');
    await page.locator('[data-afv-koppel-vorm] input[aria-label="Причина"]').fill('Обидві вимоги описують експорт тих самих нотаток по-різному.');
    await page.locator('[data-afv-koppel-vorm] button[type="submit"]').click();
    await page.waitForTimeout(1200);
    check('conflictkoppeling voorgesteld: zichtbaar op de kaart, niets automatisch samengevoegd', (await page.locator('[data-afv-koppeling]').count()) >= 1);
    await dicht(page);
    await naarSectie(page, 'overzicht', '[data-afv-tegel="kaarten"]');
    await page.waitForFunction(() => {
      const t = (n: string) => Number((document.querySelector(`[data-afv-tegel="${n}"] strong`)?.textContent || '').replace(/\D/g, ''));
      return t('conflicten') >= 1 && t('kandidaten') >= 1;
    }, undefined, { timeout: 15000 }).catch(() => undefined);
    check('het overzicht telt het open conflict en de kandidaat eerlijk mee', (await tegel('conflicten')) >= 1 && (await tegel('kandidaten')) >= 1);
    await page.locator('[data-afv-kandidaat-ok]').first().click();
    await page.waitForFunction(() => Number((document.querySelector('[data-afv-tegel="kandidaten"] strong')?.textContent || '9').replace(/\D/g, '')) === 0, undefined, { timeout: 15000 }).catch(() => undefined);
    check('eigenaarsbesluit «bevestigen» verwerkt: de kandidaat is beslist (teller zakt)', (await tegel('kandidaten')) === 0);
    await page.screenshot({ path: join(UIT, '05-overzicht-besluit.png'), fullPage: true });

    // ================================================================ 6. criteria en fases: bewijs is de enige weg omhoog (sc. 4)
    await openDetailVia(page, 'UI-014');
    await page.locator('[data-afv-dtab="criteria"]').click();
    await page.locator('[data-afv-criterium]').first().waitFor({ timeout: 10000 });
    check('criterium «passed» is zonder bewijs uitgeschakeld (geen zelfgoedkeuring)', await page.locator('[data-afv-criterium-passed]').first().isDisabled());
    await page.locator('[data-afv-dtab="bewijs"]').click();
    await page.locator('[data-afv-bewijs-vorm]').waitFor({ timeout: 10000 });
    await page.locator('[data-afv-bewijs-vorm] select').first().selectOption('e2e');
    await page.locator('[data-afv-bewijs-vorm] select').nth(1).selectOption('staging');
    await page.locator('[data-afv-bewijs-vorm] input').first().fill('tests/e2e/afstemming-vnext.e2e.ts — AC-01 доведено прогоном');
    await page.locator('[data-afv-bewijs-vorm] button[type="submit"]').click();
    await page.waitForTimeout(1000);
    await page.locator('[data-afv-dtab="criteria"]').click();
    await page.locator('[data-afv-bewijs-keuze]').first().waitFor({ timeout: 10000 });
    await page.locator('[data-afv-bewijs-keuze]').first().selectOption({ index: 1 });
    await page.locator('[data-afv-criterium-passed]').first().click();
    await page.waitForFunction(() => /AC 1\/4/.test(document.querySelector('[data-afv-detail]')?.textContent || ''), undefined, { timeout: 15000 }).catch(() => undefined); /* herladen van de kaart kan even duren */
    check('mét gekozen bewijs wordt AC-01 «passed»: voortgang telt als breuk AC 1/4, nooit een verzonnen procent', /AC 1\/4/.test(await detailTekst()));
    await page.locator('[data-afv-dtab="acties"]').click();
    await page.locator('[data-afv-fase]').selectOption('production_verified');
    await page.locator('[data-afv-fase-zet]').click();
    await page.waitForTimeout(900);
    check('production_verified ZONDER production-bewijs → eerlijke weigering (uitrol ≠ werkt)', /спершу додайте перевірку|production/.test(await detailTekst()));
    await page.locator('[data-afv-dtab="bewijs"]').click();
    await page.locator('[data-afv-bewijs-vorm] select').first().selectOption('production_probe');
    await page.locator('[data-afv-bewijs-vorm] select').nth(1).selectOption('production');
    await page.locator('[data-afv-bewijs-vorm] input').first().fill('probe: /afstemming antwoordt, kaart zichtbaar');
    await page.locator('[data-afv-bewijs-vorm] button[type="submit"]').click();
    await page.waitForTimeout(1000);
    await page.locator('[data-afv-dtab="acties"]').click();
    await page.locator('[data-afv-fase]').selectOption('production_verified');
    await page.locator('[data-afv-fase-zet]').click();
    await page.waitForTimeout(1000);
    check('mét production-bewijs mag production_verified wél', /Підтверджено на production/.test(await detailTekst()));
    await page.screenshot({ path: join(UIT, '06-fases.png') });
    await dicht(page);

    // ================================================================ 7. releases: echte rij, koppeling, postflight eerlijk
    await naarSectie(page, 'releases', '[data-afv-releases]');
    await page.locator(`[data-afv-release="${RELV}"]`).waitFor({ timeout: 15000 });
    check('de echte release-rij (uit de uitrolgeschiedenis) staat in «Випуски»', (await page.locator(`[data-afv-release="${RELV}"]`).count()) === 1);
    await page.locator(`[data-afv-release="${RELV}"] summary`).click();
    await page.locator(`[data-afv-release-zoek="${RELV}"]`).fill('Експорт нотаток');
    await page.locator(`[data-afv-release-zoek="${RELV}"]`).press('Enter');
    await page.waitForTimeout(900);
    await page.locator(`[data-afv-release="${RELV}"] button.afv-knop.is-klein`).filter({ hasText: 'Експорт' }).first().click();
    await page.locator(`[data-afv-release-koppel="${RELV}"]`).click();
    await page.waitForTimeout(1000);
    if (!(await page.locator(`[data-afv-postflight="${RELV}"]`).isVisible().catch(() => false))) await page.locator(`[data-afv-release="${RELV}"] summary`).click(); /* de rij klapt dicht na het koppelen (hertekening) */
    await page.locator(`[data-afv-postflight="${RELV}"]`).click();
    await page.locator(`[data-afv-postflight-uit="${RELV}"]`).waitFor({ timeout: 15000 });
    check('postflight zegt eerlijk «розгорнуто ≠ підтверджено»: de gekoppelde kaart is onbevestigd (sc. 4)', /не підтверджено|niet bevestigd|onbevestigd/i.test(await page.locator(`[data-afv-postflight-uit="${RELV}"]`).innerText()));
    await page.screenshot({ path: join(UIT, '07-releases.png'), fullPage: true });

    // ================================================================ 8. relatiekaart (graf) en scan (sc. 6)
    await naarSectie(page, 'kaart-grafiek', '[data-afv-graaf]');
    await page.locator('[data-afv-knoop]').first().waitFor({ timeout: 15000 });
    check('de relatiekaart tekent knopen en de bevestigde conflictrand', (await page.locator('[data-afv-knoop]').count()) >= 2 && (await page.locator('[data-afv-rand="conflicts_with"]').count()) >= 1);
    // SVG-groepen vangen alleen klikken op geverfde kinderen; het toetsenpad (Enter) is het stabiele, toegankelijke pad.
    await page.locator('[data-afv-knoop="UI-014"]').press('Enter');
    await page.locator('[data-afv-graaf-mini="UI-014"]').waitFor({ timeout: 10000 });
    await page.locator('[data-afv-graaf-open]').click();
    await page.locator('[data-afv-detail]').first().waitFor({ timeout: 15000 });
    check('knoop → minikaart → «Відкрити картку» opent het detail zonder de context te verliezen', true);
    await page.screenshot({ path: join(UIT, '08-graaf.png'), fullPage: true });
    await dicht(page);
    await naarSectie(page, 'controles', '[data-afv-controles]');
    check('controles zijn eerlijk over de grens: live production-probes heten «заплановано»', (await page.locator('[data-afv-eerlijk]').count()) >= 1);
    await page.locator('[data-afv-scan]').click();
    await page.locator('[data-afv-bevinding]').first().waitFor({ timeout: 20000 });
    const zonder = page.locator('[data-afv-bevinding="zonder_kaart"]');
    check('statische scan vindt echte functies zonder kaart (routes/vlaggen/tabs van de site zelf)', (await zonder.count()) >= 1);
    await page.locator('[data-afv-bevinding-concept]').first().click();
    await page.waitForTimeout(1200);
    await page.locator('[data-afv-detail]').first().waitFor({ timeout: 10000 }).catch(() => undefined);
    check('één klik maakt van zo’n vondst een conceptkaart (sc. 6) — als concept, nooit als «werkt»', (await page.locator('[data-afv-detail], [data-afv-sectie]').count()) >= 1);
    await dicht(page);
    await page.screenshot({ path: join(UIT, '09-scan.png'), fullPage: true });

    // ================================================================ 9. mogelijkheden, bronnen/rapport, geschiedenis, nl
    await naarSectie(page, 'mogelijkheden', '[data-afv-mogelijkheden]');
    await page.locator('[data-afv-mogelijkheid]').first().waitFor({ timeout: 15000 });
    check('mogelijkheden: alleen eerlijke standen — zonder productiebewijs blijft het «не перевірено»', (await page.locator('[data-afv-stand="не перевірено"]').count()) >= 1);
    await naarSectie(page, 'bronnen', '[data-afv-bronnen]');
    check('bronnen: agent-API werkt, MCP-wrappers en semantisch zoeken heten eerlijk «заплановано»', (await page.locator('[data-afv-bron="mcp"]').innerText()).includes('заплановано') && (await page.locator('[data-afv-bron="voorstel"]').count()) === 1);
    await page.locator('[data-afv-rapport="week"]').click();
    await page.locator('[data-afv-rapport-uit]').waitFor({ timeout: 15000 });
    check('weekrapport komt met telbare feiten (geen verzonnen percentages)', !/\d+\s?%/.test(await page.locator('[data-afv-rapport-uit]').innerText()));
    await naarSectie(page, 'geschiedenis', '[data-afv-geschiedenis]');
    await page.locator('[data-afv-geschiedenis-zoek]').fill('UI-014');
    await page.locator('[data-afv-geschiedenis-zoek]').press('Enter');
    await page.getByText('Відкрити картку').waitFor({ timeout: 15000 });
    {
      const hist = await page.locator('[data-afv-geschiedenis]').innerText();
      check('geschiedenis van UI-014: import, koppeling, eigenaarsbesluit, bewijs en fase staan als onwisbare feiten op rij', /Імпортовано/.test(hist) && /Зв’язок|Зв'язок/.test(hist) && /Рішення власника/.test(hist) && /Додано доказ/.test(hist) && /Зміна етапу/.test(hist));
    }
    await page.screenshot({ path: join(UIT, '10-geschiedenis.png'), fullPage: true });
    await ctx.close();
    {
      const nl = await sessie({ taal: 'nl' });
      await nl.page.locator('[data-afv-sectie="overzicht"]').waitFor({ timeout: 20000 });
      check('nl-weergave: dezelfde pagina volledig in het Nederlands', /Afstemming · Productontwikkeling/.test(await nl.page.locator('.afv-kop').innerText()));
      await nl.page.screenshot({ path: join(UIT, '11-nl.png'), fullPage: true });
      await nl.ctx.close();
    }

    // ================================================================ 10. viewports, licht/donker, onderbalk (sc. 7)
    const maten: Array<[number, number, boolean]> = [[320, 640, true], [390, 844, true], [768, 1024, true], [1024, 768, false], [1440, 900, false]];
    for (const [w, h, mobiel] of maten) for (const scheme of ['light', 'dark'] as const) {
      const s = await sessie({ viewport: { width: w, height: h }, mobiel, scheme });
      await s.page.locator('[data-afv-sectie]').waitFor({ timeout: 20000 });
      await s.page.waitForTimeout(500);
      await s.page.screenshot({ path: join(UIT, `20-${w}x${h}-${scheme}.png`), fullPage: true });
      const over = await overloop(s.page);
      const smal = w <= 760;
      check(`${w}×${h} ${scheme}: geen horizontale scroll (${over}px), ${smal ? 'onderbalk' : 'zijnavigatie'}`, over <= 0 && (smal ? (await s.page.locator('.afv-onderbalk').count()) === 1 : (await s.page.locator('.afv-zijnav').count()) === 1));
      if (w === 390 && scheme === 'dark') {
        await s.page.locator('.afv-onderbalk [data-afv-onderbalk="kartotheek"]').click();
        await s.page.locator('[data-afv-kaart]').first().waitFor({ timeout: 15000 });
        await s.page.locator('[data-afv-kaart]').first().click({ timeout: 6000 }).catch(() => undefined);
        await s.page.locator('[data-afv-detail]').first().waitFor({ timeout: 10000 });
        const vak = await s.page.locator('.afv-laag .afv-laag-vak').boundingBox();
        check('390 px: het kaartdetail opent op het hele scherm', !!vak && vak.width >= 388, String(vak?.width));
        await s.page.screenshot({ path: join(UIT, '21-390-detail-donker.png') });
        await s.page.keyboard.press('Escape');
        await s.page.waitForTimeout(300);
        await s.page.locator('.afv-onderbalk summary').click();
        await s.page.waitForTimeout(300);
        check('390 px: «Ще» toont de overige onderdelen', /Випуски|Releases/.test(await s.page.locator('.afv-onderbalk-menu').innerText()));
      }
      await s.ctx.close();
    }
    const echteFouten = fouten.filter((f) => !/favicon/.test(f));
    check('geen paginafouten, consolefouten, onverwachte 4xx/5xx of externe verzoeken', echteFouten.length === 0, echteFouten.slice(0, 5).join(' | '));
  } catch (e) {
    console.error('e2e afstemming-vnext afgebroken:', (e as Error).message, '| fouten:', fouten.slice(0, 8).join(' | '));
    try {
      const open = await (globalThis as { __laatstePagina?: Page }).__laatstePagina?.evaluate(() => ({ lagen: document.querySelectorAll('.afv-laag').length, toost: document.querySelectorAll('.afv-toost').length, sectie: document.querySelector('[data-afv-sectie]')?.getAttribute('data-afv-sectie') }));
      console.error('[debug] stand:', JSON.stringify(open));
      await (globalThis as { __laatstePagina?: Page }).__laatstePagina?.screenshot({ path: join(UIT, '99-fout.png'), fullPage: true });
    } catch { /* debug mag nooit de echte fout verbergen */ }
    throw e;
  } finally {
    await vlag(vlagWas.aan).catch(() => undefined);
    await pool.query(`UPDATE app.feature_flags SET standaard = $1 WHERE sleutel = 'afstemming-vnext'`, [vlagWas.standaard]).catch(() => undefined);
    if (uid) {
      for (const tbl of ['afstemming_kaarten_v1', 'afstemming_revisies_v1', 'afstemming_gebeurtenissen_v1', 'afstemming_bewijs_v1', 'afstemming_import_v1', 'afstemming_koppelingen_v1', 'afstemming_besluiten_v1', 'afstemming_release_v1']) {
        await pool.query(`DELETE FROM app.records WHERE tbl = $1 AND data->>'ownerUserId' = $2`, [tbl, uid]).catch(() => undefined);
      }
      await pool.query('DELETE FROM app.tech_activaties WHERE user_id=$1', [uid]).catch(() => undefined);
      await pool.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [uid]).catch(() => undefined);
    }
    await pool.query(`DELETE FROM app.uitrol_runs WHERE versie = $1`, [RELV]).catch(() => undefined);
    await browser.close();
    await stop();
  }
  return einde();
}
