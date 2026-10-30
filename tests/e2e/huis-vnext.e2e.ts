// E2E «Huis vNext» (vlag huis-vnext, migratie 0128) tegen de ECHTE lokale server (server/start.ts + Postgres + nep-Google) en een
// NAGEBOOTSTE Home Assistant op een niet-loopback-adres (tests/eenheid/hulp/nep-home-assistant.ts): huis.tarasevych.com.
//   1. Vlag UIT → precies de oude informatieve pagina; vlag AAN → eerlijke start (woning aanmaken), lege toestand zonder gateway.
//   2. Home Assistant koppelen via de wizard (token wordt nooit teruggegeven), apparaten zoeken → importeren → echte toestanden.
//   3. Opdrachten pas na «Opdrachten toestaan»: een lamp aanzetten → levensloop tot «voltooid» (ACK door waarneming); een slot
//      vraagt een uitdrukkelijke bevestiging (kritiek) en staat niet in de scènebewerker.
//   4. Kamers + plattegrond, scène maken en uitvoeren (per stap ACK), regel + droogloop (zonder I/O), beveiliging eerlijk,
//      AI-voorstel → goedkeuring door een mens → opdracht, journaal.
//   5. 320/390/768/1024/1440 px, licht en donker: geen horizontale scroll, geen paginafout, geen extern verzoek.
// Gebruik: PLAYWRIGHT_CORE=… CHROME=… E2E_TLS=… node scripts/e2e-lokaal.mjs huis-vnext
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from '../eenheid/hulp/nep-google';
import { ENTITEITEN, nepHomeAssistant } from '../eenheid/hulp/nep-home-assistant';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/release-huis-vnext/screens';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const HOSTS = ['id', 'mcp', 'mail', 'hub', 'admin', 'cloud', 'ai', 'huis'].map((h) => `https://${h}.tarasevych.com`);
const HUIS = 'https://huis.tarasevych.com';
const VERWACHT = [/^401 .*\/api\/owner\/meldingen\/gelezen$/, /* meldingencentrum van de eigenaar (102227): het chrome-widget mist in de e2e-sessie de dienstcontext — bekend, niet van deze suites */ /^403 .*\/api\/owner\/agents\/activity$/, /^403 .*\/api\/huis\/opdrachten\/nieuw$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e huis-vnext');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-hv-${T}@example.test`, sub = `sub-e2e-hv-${T}`;
  const TOKEN = `e2e-token-${T}`;
  const echteFetch = globalThis.fetch;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  const ha = await nepHomeAssistant({ token: TOKEN, entiteiten: ENTITEITEN });
  // nep-Google onderschept ALLE fetch (599 voor onbekende adressen); alleen de nagebootste Home Assistant op het eigen adres van
  // deze machine gaat naar de echte fetch. Niets anders verlaat het proces (scripts/e2e-lokaal.mjs bewaakt de sockets).
  const nepFetch = globalThis.fetch;
  globalThis.fetch = ((input: unknown, init?: RequestInit) => (String(input instanceof URL ? input.href : input).startsWith(ha.url) ? echteFetch(input as never, init) : nepFetch(input as never, init))) as typeof fetch;
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const vlagWas = (await pool.query(`SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'huis-vnext'`)).rows[0] ?? { aan: false, standaard: false };
  const vlag = (aan: boolean) => pool.query(`UPDATE app.feature_flags SET aan = $1, standaard = $1 WHERE sleutel = 'huis-vnext'`, [aan]);
  let uid = '';
  try {
    const b = G.browser();
    const tab = b.tab;
    await b.aanmelden(sub, eigenaar, { service: 'huis', tabContext: tab, intent: 'login' });
    uid = String((await pool.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1", [eigenaar])).rows[0]?.id || '');

    const sessie = async (o: { scheme?: 'light' | 'dark'; viewport?: { width: number; height: number }; mobiel?: boolean; pad?: string }) => {
      const ctx = await browser.newContext({ colorScheme: o.scheme || 'light', reducedMotion: 'reduce', locale: 'uk-UA', viewport: o.viewport || { width: 1440, height: 900 }, hasTouch: !!o.mobiel, isMobile: !!o.mobiel, timezoneId: 'Europe/Brussels', serviceWorkers: 'block', ignoreHTTPSErrors: process.env.E2E_EIGEN_CA !== '1' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((tb) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', tb); sessionStorage.removeItem('mr-vlag:huis-vnext'); }, tab);
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) q.text().then((t) => fouten.push(`http ${k} ${t.slice(0, 200)}`), () => fouten.push(`http ${k}`)); });
      page.on('request', (q) => { const u = new URL(q.url()); if (!/^(data|blob):$/.test(u.protocol) && !/(^|\.)tarasevych\.com$/.test(u.hostname)) fouten.push(`extern verzoek: ${q.url()}`); });
      page.on('dialog', (d) => void d.accept());
      await page.goto(`${HUIS}${o.pad || '/'}?lang=uk`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      return { ctx, page };
    };
    const overloop = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const naar = async (p: Page, slug: string, wacht: string) => { await p.goto(`${HUIS}/${slug}?lang=uk`, { waitUntil: 'networkidle' }); await p.locator(wacht).first().waitFor({ timeout: 20000 }); };

    // ================================================================ 1. vlag uit → oude pagina
    await vlag(false);
    {
      const { ctx, page } = await sessie({});
      await page.locator('[data-smart-home]').waitFor({ timeout: 20000 });
      check('vlag UIT: de oude informatieve pagina (data-smart-home) staat er, de nieuwe niet', (await page.locator('[data-smart-home]').count()) === 1 && (await page.locator('[data-hv-pagina]').count()) === 0);
      await page.screenshot({ path: join(UIT, '00-oud-vlag-uit.png'), fullPage: true });
      await ctx.close();
    }

    // ================================================================ 2. vlag aan → eerlijke start, woning, lege toestand
    await vlag(true);
    const { ctx, page } = await sessie({});
    await page.locator('[data-hv-pagina]').waitFor({ timeout: 20000 });
    await page.locator('[data-hv-start]').waitFor({ timeout: 20000 });
    check('vlag AAN: de nieuwe pagina binnen dezelfde chrome, zonder woning een eerlijke start (geen apparaten, geen verzonnen waarden)', (await page.locator('[data-hv-pagina="overview"]').count()) === 1 && (await page.locator('[data-smart-home]').count()) === 0 && (await page.locator('.canonical-chrome').count()) === 1 && (await page.locator('[data-hv-tegel]').count()) === 0);
    await page.screenshot({ path: join(UIT, '01-start.png'), fullPage: true });
    await page.locator('[data-hv-woning-naam]').fill('Дім e2e');
    await page.locator('[data-hv-woning-maak]').click();
    await page.locator('[data-hv-leeg="geen-integratie"]').waitFor({ timeout: 20000 });
    check('woning aangemaakt → overzicht met de lege toestand «geen gateway» en één CTA; tegels tonen «—», geen verzonnen temperatuur', (await page.locator('[data-hv-tegel="temperatuur"] strong').innerText()).trim() === '—' && (await page.locator('[data-hv-kanaal="geen"]').count()) === 1);
    await page.screenshot({ path: join(UIT, '02-leeg-geen-gateway.png'), fullPage: true });

    // ================================================================ 3. Home Assistant koppelen, ontdekken, importeren
    await page.locator('[data-hv-cta="integraties"]').click();
    await page.locator('[data-hv-pagina="integrations"]').waitFor({ timeout: 20000 });
    await page.locator('[data-hv-catalogus]').first().waitFor({ timeout: 20000 });
    check('CTA opent Integraties; de catalogus zegt eerlijk: alleen Home Assistant beschikbaar, Ajax/Apple Home niet ondersteund', (await page.locator('[data-hv-catalogus="home-assistant"][data-hv-catalogus-stand="beschikbaar"]').count()) === 1 && (await page.locator('[data-hv-catalogus="ajax"][data-hv-catalogus-stand="niet_ondersteund"]').count()) === 1 && (await page.locator('[data-hv-catalogus-stand="beschikbaar"]').count()) === 1);
    await page.locator('[data-hv-ha-start]').click();
    await page.locator('[data-hv-ha-wizard]').waitFor({ timeout: 10000 });
    await page.locator('[data-hv-ha-adres]').fill(ha.url);
    await page.locator('[data-hv-ha-token]').fill(TOKEN);
    await page.screenshot({ path: join(UIT, '03-ha-wizard.png') });
    await page.locator('[data-hv-ha-opslaan]').click();
    await page.locator('[data-hv-integratie-stand="verbonden"]').waitFor({ timeout: 20000 });
    const kaartTekst = await page.locator('[data-hv-integratie]').innerText();
    check('gekoppeld: integratie «verbonden» met versie/locatie uit /api/config; het token staat nergens op de pagina', /2026\.10\.1/.test(kaartTekst) && /Proefhuis/.test(kaartTekst) && !(await page.content()).includes(TOKEN) && (await page.locator('[data-hv-kanaal="lokaal"]').count()) === 1);
    const opgeslagen = (await pool.query(`SELECT geheim FROM app.huis_integraties WHERE woning_id IN (SELECT id FROM app.huis_woningen WHERE user_id = $1)`, [uid])).rows[0];
    check('het token is op de server versleuteld opgeslagen (envelope), niet in klare tekst', !!opgeslagen && !String(opgeslagen.geheim).includes(TOKEN));
    const intId = await page.locator('[data-hv-integratie]').getAttribute('data-hv-integratie');
    await page.locator(`[data-hv-ontdekken="${intId}"]`).click();
    await page.locator('[data-hv-ontdekt]').waitFor({ timeout: 20000 });
    const gevonden = Number(await page.locator('[data-hv-ontdekt]').getAttribute('data-hv-ontdekt'));
    check('apparaten zoeken: 13 bruikbare entiteiten (automation/sun overgeslagen), slot en alarm als kritiek gemarkeerd', gevonden === 13 && /Slot voordeur[\s\S]*критично/.test(await page.locator('[data-hv-ontdekt-lijst]').innerText()), String(gevonden));
    await page.screenshot({ path: join(UIT, '04-ontdekt.png') });
    await page.locator('[data-hv-importeren]').click();
    await page.locator('[data-hv-ontdekt]').waitFor({ state: 'detached', timeout: 20000 });
    await page.waitForTimeout(800);
    check('importeren: 13 apparaten op de site', /13/.test(await page.locator('[data-hv-integratie] table').innerText()));

    // ================================================================ 4. apparaten: echte toestanden, geen opdracht zonder toestemming
    await naar(page, 'apparaten', '[data-hv-apparaat-kaart]');
    const kaarten = await page.locator('[data-hv-apparaat-kaart]').count();
    const lampKaart = page.locator('[data-hv-apparaat-kaart]').filter({ hasText: 'Lamp woonkamer' });
    const versheden = { vers: await page.locator('[data-hv-versheid="vers"]').count(), onbekend: await page.locator('[data-hv-versheid="onbekend"]').count(), onbeschikbaar: await page.locator('[data-hv-versheid="onbeschikbaar"]').count() };
    check('Apparaten: 13 kaarten; 11 «actueel», de rookmelder (unknown) eerlijk «onbekend», de vermogensmeter (unavailable) «onbeschikbaar»; de lamp staat uit zoals de bron zegt', kaarten === 13 && versheden.vers === 11 && versheden.onbekend === 1 && versheden.onbeschikbaar === 1 && /вимкнено/.test(await lampKaart.innerText()), JSON.stringify(versheden));
    await page.screenshot({ path: join(UIT, '05-apparaten-1440.png'), fullPage: true });
    await page.locator('[data-hv-zoek]').fill('keuken');
    await page.waitForTimeout(300);
    check('zoeken filtert op naam en bron-id', (await page.locator('[data-hv-apparaat-kaart]').count()) === 2);
    await page.locator('[data-hv-zoek]').fill('');
    await lampKaart.click();
    await page.locator('[data-hv-inspector]').waitFor({ timeout: 10000 });
    const lampId = await page.locator('[data-hv-inspector]').getAttribute('data-hv-inspector');
    check('inspector als paneel rechts: schakelaar aanwezig maar uitgeschakeld (integratie alleen lezen), met de reden', (await page.locator('.hv-laag.is-paneel [data-hv-inspector]').count()) === 1 && (await page.locator('[data-hv-schakel="aan_uit"]').isDisabled()) && /читання|запис/.test(await page.locator('[data-hv-inspector]').innerText()));
    await page.screenshot({ path: join(UIT, '06-inspector-alleen-lezen.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('Esc sluit de inspector', (await page.locator('.hv-laag').count()) === 0);

    // ================================================================ 5. opdrachten toestaan → lamp aan met ACK; slot vraagt bevestiging
    await naar(page, 'integraties', '[data-hv-integratie]');
    await page.locator(`[data-hv-schrijven="${intId}"]`).click();
    await page.waitForTimeout(1200);
    check('«Opdrachten toestaan» (step-up op een verse sessie) → integratie met schrijftoestemming', /команди дозволено/.test(await page.locator('[data-hv-integratie]').innerText()));
    await naar(page, 'apparaten', '[data-hv-apparaat-kaart]');
    await lampKaart.click();
    await page.locator('[data-hv-inspector]').waitFor({ timeout: 10000 });
    await page.locator('[data-hv-schakel="aan_uit"]').click();
    await page.locator('[data-hv-opdracht-stand="voltooid"]').waitFor({ timeout: 20000 });
    const schakelaar = page.locator('[data-hv-schakel="aan_uit"]');
    check('lamp aan: de opdracht eindigt op «voltooid» (bron gaf «on» terug), de schakelaar toont de WAARGENOMEN stand', (await schakelaar.getAttribute('aria-checked')) === 'true' && ha.s.aanroepen.some((a) => a.pad === '/api/services/light/turn_on'));
    const opdracht = (await pool.query(`SELECT stand, via, idempotentie FROM app.huis_opdrachten WHERE apparaat_id::text = $1 ORDER BY created_at DESC LIMIT 1`, [lampId])).rows[0];
    check('in de databank: stand voltooid, via site, met idempotentiesleutel', opdracht?.stand === 'voltooid' && opdracht?.via === 'site' && String(opdracht?.idempotentie).startsWith('site-'), JSON.stringify(opdracht));
    await page.screenshot({ path: join(UIT, '07-lamp-voltooid.png') });
    await page.keyboard.press('Escape');
    const slotKaart = page.locator('[data-hv-apparaat-kaart]').filter({ hasText: 'Slot voordeur' });
    await slotKaart.click();
    await page.locator('[data-hv-inspector]').waitFor({ timeout: 10000 });
    await page.locator('[data-hv-schakel="vergrendeld"]').click();
    await page.locator('[data-hv-bevestig]').waitFor({ timeout: 5000 });
    check('slot (kritiek): eerst een uitdrukkelijke bevestiging, niets verzonden', (await page.locator('[data-hv-bevestig]').count()) === 1 && !ha.s.aanroepen.some((a) => a.pad.startsWith('/api/services/lock/')));
    await page.screenshot({ path: join(UIT, '08-slot-bevestiging.png') });
    await page.locator('[data-hv-bevestig-ja]').click();
    await page.locator('[data-hv-opdracht-stand="voltooid"], [data-hv-opdracht-stand="geweigerd"]').first().waitFor({ timeout: 20000 });
    const slotStand = await page.locator('[data-hv-opdracht-stand]').getAttribute('data-hv-opdracht-stand');
    check('slot na bevestiging: de server beslist (step-up ok op een verse sessie → voltooid met ACK van de bron)', slotStand === 'voltooid' && ha.s.aanroepen.some((a) => a.pad.startsWith('/api/services/lock/')), String(slotStand));
    await page.keyboard.press('Escape');

    // ================================================================ 6. kamers + plattegrond
    await naar(page, 'kamers', '[data-hv-pagina="rooms"]');
    await page.locator('[data-hv-kamer-naam]').fill('Вітальня');
    await page.locator('[data-hv-kamer-maak]').click();
    await page.locator('[data-hv-plan-kamer]').waitFor({ timeout: 10000 });
    await page.locator('[data-hv-kamer-naam]').fill('Кухня');
    await page.locator('[data-hv-kamer-maak]').click();
    await page.waitForTimeout(800);
    check('twee kamers op de schematische plattegrond (SVG, toetsenbordbereikbaar) én in de lijst', (await page.locator('[data-hv-plan-kamer]').count()) === 2 && (await page.locator('[data-hv-kamer]').count()) === 2 && (await page.locator('[data-hv-plan-kamer][tabindex="0"]').count()) === 2);
    await page.locator('[data-hv-plan-kamer]').first().click();
    await page.locator('[data-hv-kamer-paneel]').waitFor({ timeout: 10000 });
    await page.locator(`[data-hv-verplaats="${lampId}"]`).click();
    await page.waitForTimeout(900);
    check('kamerpaneel: de lamp naar de kamer verplaatst → bediening in de kamer en «1 apparaten» in de lijst', (await page.locator(`[data-hv-kamer-paneel] [data-hv-apparaat="${lampId}"]`).count()) === 1);
    await page.screenshot({ path: join(UIT, '09-kamers.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('plattegrond: de kamer met de brandende lamp is gemarkeerd (heeft-licht) — alleen omdat de bron «on» zegt', (await page.locator('[data-hv-plan-kamer].heeft-licht').count()) === 1);

    // ================================================================ 7. scène: maken (slot niet kiesbaar) en uitvoeren met ACK per stap
    await naar(page, 'scenes', '[data-hv-pagina="scenes"]');
    await page.locator('[data-hv-scene-nieuw]').click();
    await page.locator('[data-hv-scene-bewerker]').waitFor({ timeout: 10000 });
    await page.locator('[data-hv-scene-naam]').fill('Вечір e2e');
    const opties = await page.locator('[data-hv-stap="0"] select').first().locator('option').allInnerTexts();
    check('scènebewerker: alleen bedienbare, niet-kritieke apparaten kiesbaar (geen slot, geen alarm, geen sensoren)', opties.some((o) => /Lamp woonkamer/.test(o)) && !opties.some((o) => /Slot|Alarm|Temperatuur/.test(o)), opties.join(','));
    await page.locator('[data-hv-stap="0"] select').first().selectOption({ label: 'Lamp woonkamer' });
    await page.locator('[data-hv-stap="0"] select').nth(2).selectOption('uit');
    await page.locator('[data-hv-stap-toevoegen]').click();
    await page.locator('[data-hv-stap="1"] select').first().selectOption({ label: 'Boiler' });
    await page.screenshot({ path: join(UIT, '10-scene-bewerker.png') });
    await page.locator('[data-hv-scene-bewaar]').click();
    await page.locator('[data-hv-scene-kaart]').waitFor({ timeout: 10000 });
    const sceneId = await page.locator('[data-hv-scene-kaart]').getAttribute('data-hv-scene-kaart');
    await page.locator(`[data-hv-scene-run="${sceneId}"]`).click();
    await page.locator('[data-hv-scene-uitkomst]').waitFor({ timeout: 30000 });
    const uitkomst = await page.locator('[data-hv-scene-uitkomst]').getAttribute('data-hv-scene-uitkomst');
    check('scène uitvoeren: uitkomst «voltooid», elke stap met eigen ACK-stand, correlatie getoond', uitkomst === 'voltooid' && (await page.locator('[data-hv-stap-stand="voltooid"]').count()) === 2 && /Кореляція/.test(await page.locator('[data-hv-scene-uitkomst]').innerText()), String(uitkomst));
    await page.screenshot({ path: join(UIT, '11-scene-uitkomst.png') });
    await page.keyboard.press('Escape');

    // ================================================================ 8. automatisering: regel + droogloop zonder I/O, alleen simulatie
    const aanroepenVoor = ha.s.aanroepen.length;
    await naar(page, 'automatiseringen', '[data-hv-pagina="automations"]');
    check('Automatiseringen zegt eerlijk dat de site regels in deze release niet uitvoert', /не виконує|simulatie|симуляц/i.test(await page.locator('[data-hv-pagina="automations"]').innerText()));
    await page.locator('[data-hv-auto-nieuw]').click();
    await page.locator('[data-hv-auto-bewerker]').waitFor({ timeout: 10000 });
    await page.locator('[data-hv-auto-naam]').fill('Ранок e2e');
    await page.locator('[data-hv-regelblok="wanneer"] input[type=time]').fill('07:00');
    const standOpties = await page.locator('[data-hv-auto-stand] option').allInnerTexts();
    check('stand kiesbaar: alleen concept en simulatie (geen «aan»)', standOpties.length === 2 && !standOpties.some((o) => /увімк|^aan$/i.test(o)), standOpties.join(','));
    await page.locator('[data-hv-auto-bewerker] input[type=time]').last().fill('07:00');
    await page.locator('[data-hv-droogloop]').click();
    await page.locator('[data-hv-droogloop-uitkomst]').waitFor({ timeout: 10000 });
    check('droogloop om 07:00 → «zou afgaan», elke voorwaarde uitgelegd, GEEN aanroep naar de bron', (await page.locator('[data-hv-droogloop-uitkomst]').getAttribute('data-hv-droogloop-uitkomst')) === 'ja' && ha.s.aanroepen.length === aanroepenVoor);
    await page.locator('[data-hv-auto-bewerker] input[type=time]').last().fill('09:00');
    await page.locator('[data-hv-droogloop]').click();
    await page.waitForTimeout(800);
    check('droogloop om 09:00 → «zou niet afgaan»', (await page.locator('[data-hv-droogloop-uitkomst]').getAttribute('data-hv-droogloop-uitkomst')) === 'nee');
    await page.screenshot({ path: join(UIT, '12-automatisering-droogloop.png') });
    await page.locator('[data-hv-auto-stand]').selectOption('simulatie');
    await page.locator('[data-hv-auto-bewaar]').click();
    await page.locator('[data-hv-auto]').waitFor({ timeout: 10000 });
    check('regel bewaard als simulatie', /симуляція/.test(await page.locator('[data-hv-auto]').innerText()));

    // ================================================================ 9. beveiliging, energie, AI-voorstel, journaal
    await naar(page, 'beveiliging', '[data-hv-gecertificeerd]');
    check('Beveiliging: «gecertificeerd: false» uitdrukkelijk, groepen uit echte sensoren, slot als kritiek met bediening', (await page.locator('[data-hv-gecertificeerd="false"]').count()) === 1 && (await page.locator('[data-hv-bev-groep="alarm"]').count()) === 1 && (await page.locator('[data-hv-bev-groep="gevaar"] [data-hv-bev-kaart]').count()) === 2);
    await page.screenshot({ path: join(UIT, '13-beveiliging.png'), fullPage: true });
    await naar(page, 'energie', '[data-hv-tegel="meters"]');
    check('Energie: alleen de 2 meters uit de bron; vermogen gemeten; geen tarief', /2/.test(await page.locator('[data-hv-tegel="meters"] strong').innerText()) && (await page.locator('[data-hv-meter]').count()) === 2 && !/€|EUR/.test(await page.locator('[data-hv-pagina="energy"]').innerText()));
    await naar(page, 'assistent', '[data-hv-pagina="assistant"]');
    await page.locator('[data-hv-voorstel-nieuw]').click();
    await page.locator('[data-hv-voorstel-tekst]').fill('Нікого немає, вимкнути бойлер');
    await page.locator('[data-hv-pagina="assistant"] form select').first().selectOption({ label: 'Boiler' });
    await page.locator('[data-hv-pagina="assistant"] form select').nth(2).selectOption('uit');
    await page.locator('[data-hv-voorstel-maak]').click();
    await page.locator('[data-hv-voorstel-stand="wacht"]').waitFor({ timeout: 10000 });
    const boilerVoor = ha.s.aanroepen.filter((a) => a.pad.startsWith('/api/services/switch/')).length;
    check('AI-voorstel gemaakt → wacht; er is NIETS verzonden', (await page.locator('[data-hv-voorstel-stand="wacht"]').count()) === 1);
    const vsId = await page.locator('[data-hv-voorstel-stand="wacht"]').getAttribute('data-hv-voorstel');
    await page.locator(`[data-hv-goedkeuren="${vsId}"]`).click();
    await page.locator(`[data-hv-voorstel="${vsId}"][data-hv-voorstel-stand="goedgekeurd"]`).waitFor({ timeout: 20000 });
    check('goedkeuring door een mens → opdracht via «ai-voorstel» naar de bron, voltooid', ha.s.aanroepen.filter((a) => a.pad.startsWith('/api/services/switch/')).length === boilerVoor + 1 && /виконано/.test(await page.locator(`[data-hv-voorstel="${vsId}"]`).innerText()));
    await page.screenshot({ path: join(UIT, '14-assistent.png'), fullPage: true });
    await naar(page, 'activiteit', '[data-hv-gebeurtenis]');
    const journaal = await page.locator('[data-hv-pagina="activity"]').innerText();
    check('journaal: integratie, import, opdrachten, scène en voorstel staan erin; het token niet', (await page.locator('[data-hv-gebeurtenis]').count()) >= 8 && !journaal.includes(TOKEN));
    await page.locator('[data-hv-soort="opdracht"]').click();
    await page.waitForTimeout(700);
    check('filter op soort «opdrachten»', (await page.locator('[data-hv-gebeurtenis]').count()) >= 3);
    await page.screenshot({ path: join(UIT, '15-journaal.png'), fullPage: true });
    await naar(page, 'showroom', '[data-hv-demo]');
    await page.locator('[data-hv-volgende]').click();
    check('showroom: duidelijk gelabeld als demo, stappenspeler werkt, geen API-aanroep en geen opdracht', (await page.locator('[data-hv-stap="0"]').count()) === 1 && (await page.locator('[data-hv-demo]').count()) === 1);
    await page.screenshot({ path: join(UIT, '16-showroom.png'), fullPage: true });
    await naar(page, 'planner', '[data-hv-planner-totaal]');
    check('planner: structuur zonder bedragen', Number(await page.locator('[data-hv-planner-totaal]').getAttribute('data-hv-planner-totaal')) > 0 && !/€|EUR/.test(await page.locator('[data-hv-pagina="planner"]').innerText()));
    await ctx.close();

    // ================================================================ 10. viewports, licht/donker
    const maten: Array<[number, number, boolean]> = [[320, 640, true], [390, 844, true], [768, 1024, true], [1024, 768, false], [1440, 900, false]];
    for (const [w, h, mobiel] of maten) for (const scheme of ['light', 'dark'] as const) {
      const s = await sessie({ viewport: { width: w, height: h }, mobiel, scheme });
      await s.page.locator('[data-hv-tegel]').first().waitFor({ timeout: 20000 });
      await s.page.screenshot({ path: join(UIT, `20-${w}x${h}-${scheme}.png`), fullPage: true });
      const over = await overloop(s.page);
      const smal = w <= 760;
      const onderbalk = await s.page.locator('.hv-onderbalk').count();
      check(`${w}×${h} ${scheme}: geen horizontale scroll (${over}px), ${smal ? 'onderbalk' : 'geen onderbalk'}`, over <= 0 && (smal ? onderbalk === 1 : onderbalk === 0));
      if (w === 390 && scheme === 'dark') {
        await s.page.locator('.hv-onderbalk [data-hv-onderbalk="devices"]').click();
        await s.page.locator('[data-hv-apparaat-kaart]').first().waitFor({ timeout: 20000 });
        await s.page.locator('[data-hv-apparaat-kaart]').first().click();
        await s.page.locator('.hv-laag.is-scherm [data-hv-inspector]').waitFor({ timeout: 10000 });
        const vak = await s.page.locator('.hv-laag.is-scherm .hv-laag-vak').boundingBox();
        check('390 px: de inspector opent op het hele scherm', !!vak && vak.width >= 388);
        await s.page.screenshot({ path: join(UIT, '21-390-inspector-donker.png') });
        const knop = await s.page.locator('[data-hv-schakel="aan_uit"], .hv-knop').first().boundingBox();
        check('390 px: tik-doel minstens 30 px hoog (schakelaar) en knoppen 44 px', !!knop && knop.height >= 30, String(knop?.height));
        await s.page.keyboard.press('Escape');
        await s.page.locator('.hv-onderbalk summary').click();
        await s.page.waitForTimeout(300);
        check('390 px: «Ще» toont de overige onderdelen', /Безпека/.test(await s.page.locator('.hv-onderbalk-menu').innerText()) && /Інтеграції/.test(await s.page.locator('.hv-onderbalk-menu').innerText()));
        await s.page.screenshot({ path: join(UIT, '22-390-meer-menu.png') });
      }
      await s.ctx.close();
    }
    const echteFouten = fouten.filter((f) => !/favicon/.test(f));
    check('geen paginafouten, consolefouten, onverwachte 4xx/5xx of externe verzoeken', echteFouten.length === 0, echteFouten.slice(0, 5).join(' | '));
  } catch (e) {
    console.error('e2e huis-vnext afgebroken:', (e as Error).message, '| fouten:', fouten.slice(0, 8).join(' | '));
    throw e;
  } finally {
    await vlag(vlagWas.aan).catch(() => undefined);
    await pool.query(`UPDATE app.feature_flags SET standaard = $1 WHERE sleutel = 'huis-vnext'`, [vlagWas.standaard]).catch(() => undefined);
    if (uid) await pool.query(`DELETE FROM app.huis_woningen WHERE user_id = $1`, [uid]).catch(() => undefined);
    globalThis.fetch = echteFetch;
    await browser.close();
    await ha.stop();
    await stop();
  }
  return einde();
}
