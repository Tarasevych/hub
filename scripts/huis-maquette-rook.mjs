// Rookproef van de maquette «Levend huis» in een echte browser (playwright).
//
// Bouwt de maquette, opent haar en loopt ALLE routes af in zes profielen (telefoon 390×844, bureau 1440×900, strook 1920×480,
// vierkant 480×480, horloge 240×240, tv 1920×1080), drie thema's (licht, donker, inkt) en twee talen. Per route:
//   - geen fouten in de console;
//   - het doek scrolt niet horizontaal;
//   - elk aanraakdoel is ≥ 44 px;
//   - elke knop met data-actie heeft een afhandeling.
// Daarna een klikproef: de schakelaar van een lamp verandert de toestand, schrijft het Журнал en toont een сповіщення;
// de schuif van het blad, een scène, de huisstand, scenario en tijdsnelheid (hemel verandert), inklappen, meldingencentrum.
//
// Gebruik: node scripts/huis-maquette-rook.mjs --uit <map voor schermafdrukken> [--snel]     (exit 1 bij fouten)
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bouw } from './huis-maquette.mjs';

const WORTEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(WORTEL, 'package.json'));
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const uitIndex = args.indexOf('--uit');
const UIT = uitIndex >= 0 && args[uitIndex + 1] ? resolve(args[uitIndex + 1]) : null;
const SNEL = args.includes('--snel');
if (UIT) mkdirSync(UIT, { recursive: true });

const PROFIELEN = [
  { id: 'telefoon', beeld: 0, b: 390, h: 844 },
  { id: 'bureau', beeld: 0, b: 1440, h: 900 },
  { id: 'strook', beeld: 0, b: 1920, h: 480 },
  { id: 'vierkant', beeld: 0, b: 480, h: 480 },
  { id: 'horloge', beeld: 0, b: 240, h: 240 },
  { id: 'tv', beeld: 0, b: 1920, h: 1080 },
];
const THEMAS = ['licht', 'donker', 'inkt'];
const TALEN = ['uk', 'nl'];

// Dezelfde fout op veel routes telt één keer: «wat» → { eerste plek, aantal }.
const fouten = new Map();
const meld = (waar, wat) => { const f = fouten.get(wat); if (f) f.aantal++; else fouten.set(wat, { waar, aantal: 1 }); };
const tel = { ladingen: 0, routes: 0, doelen: 0, acties: 0, afdrukken: 0, klikproeven: 0 };

// Bouwen en als bestand openen (zelfde inhoud als docs/huis/maquette/huis-maquette.html).
const html = bouw();
const bestand = join(WORTEL, 'docs/huis/maquette/huis-maquette.html');
writeFileSync(bestand, html);
const adres = pathToFileURL(bestand).href;

const browser = await chromium.launch();

async function open(voorkeuren, venster, hash = '') {
  const ctx = await browser.newContext({ viewport: venster, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const console_ = [];
  page.on('console', (m) => { if (m.type() === 'error') console_.push(m.text()); });
  page.on('pageerror', (e) => console_.push('pageerror: ' + e.message));
  await page.addInitScript((v) => { try { if (!sessionStorage.getItem('rook')) { localStorage.setItem('huis-maquette-voorkeuren', v); sessionStorage.setItem('rook', '1'); } } catch (e) { /* zonder opslag */ } }, JSON.stringify(voorkeuren));
  await page.goto(adres + (hash ? '#' + hash : ''));
  await page.waitForFunction(() => window.HV && window.HV.gestart && document.getElementById('hv-pagina') && document.getElementById('hv-pagina').childNodes.length > 0, null, { timeout: 10000 });
  await page.evaluate(() => HV.klok.zet(0)); // huistijd staat stil: afdrukken en metingen zijn herhaalbaar
  tel.ladingen++;
  return { ctx, page, console_ };
}

/** Meet één route in de pagina: overloop, aanraakdoelen, afhandelingen. */
const meetRoute = () => {
  const doek = document.getElementById('hv-doek');
  const inhoud = document.getElementById('hv-inhoud');
  const rd = doek.getBoundingClientRect();
  const schaal = rd.width / doek.offsetWidth || 1;
  const uit = { overloop: [], klein: [], zonder: [], doelen: 0, acties: 0 };
  if (inhoud.scrollWidth > inhoud.clientWidth + 1) uit.overloop.push('hv-inhoud ' + inhoud.scrollWidth + ' > ' + inhoud.clientWidth);
  if (doek.scrollWidth > doek.clientWidth + 1) uit.overloop.push('hv-doek ' + doek.scrollWidth + ' > ' + doek.clientWidth);
  const speciaal = doek.classList.contains('is-speciaal');
  if (speciaal && inhoud.scrollHeight > inhoud.clientHeight + 1) uit.overloop.push('speciaal profiel scrolt verticaal ' + inhoud.scrollHeight + ' > ' + inhoud.clientHeight);
  const zichtbaar = (el) => {
    if (!el.getClientRects().length) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const naam = (el) => (el.getAttribute('data-actie') || el.getAttribute('role') || el.nodeName.toLowerCase()) + '.' + String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).split(' ')[0] + ' «' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28) + '»';
  for (const el of doek.querySelectorAll('button, [role="button"], [role="link"], [role="switch"], [role="tab"], [role="radio"], [role="slider"]')) {
    if (!zichtbaar(el) || el.closest('.hv-spring')) continue;
    uit.doelen++;
    const rects = el.getClientRects();
    const r = getComputedStyle(el).display === 'inline' && rects.length ? rects[0] : el.getBoundingClientRect();
    const b = r.width / schaal, h = r.height / schaal;
    if (b < 43.5 || h < 43.5) uit.klein.push(naam(el) + ' ' + Math.round(b) + '×' + Math.round(h));
  }
  for (const el of doek.querySelectorAll('[data-actie]')) {
    uit.acties++;
    if (!HV.acties[el.getAttribute('data-actie')]) uit.zonder.push(el.getAttribute('data-actie'));
  }
  for (const el of doek.querySelectorAll('[data-schuif], [data-wijzer]')) {
    const a = el.getAttribute('data-schuif') || el.getAttribute('data-wijzer');
    if (!HV.acties[a]) uit.zonder.push(a);
  }
  return uit;
};

/** Alle routes: elk scherm, elk zichtbaar tabblad, een kamerpagina en een paar bladen. */
const routeLijst = () => {
  const lijst = [];
  for (const id of Object.keys(HV.schermen)) {
    const s = HV.schermen[id];
    const tabs = (s.tabs || []).filter((x) => !x.verborgen);
    if (!tabs.length) lijst.push(id);
    for (const tab of tabs) lijst.push(id + '-' + tab.id);
  }
  lijst.push('kamers-kamer-woonkamer', 'kamers-kamer-slaapkamer', 'kamers-kamer-tuin', 'kamers-kamer-zolder');
  lijst.push('overzicht-blad-apparaat-torsher', 'overzicht-blad-apparaat-woongroep', 'overzicht-blad-apparaat-stekkermedia', 'overzicht-blad-apparaat-zolderlicht',
    'overzicht-blad-apparaat-thermostaat', 'overzicht-blad-apparaat-voordeurslot', 'overzicht-blad-apparaat-torsher-geschiedenis', 'overzicht-blad-apparaat-voordeurslot-instellingen',
    'overzicht-blad-meldingen', 'overzicht-blad-huisstand', 'overzicht-blad-meer', 'kamers-nu-blad-kamer-woonkamer', 'bestaatniet');
  return lijst;
};

// ───────────────────────── 1. Alle routes × profielen × thema's × talen ─────────────────────────
for (const profiel of PROFIELEN) {
  for (const thema of THEMAS) {
    for (const taal of TALEN) {
      if (SNEL && !(thema === 'licht' && taal === 'uk') && !(profiel.id === 'telefoon' && thema === 'donker' && taal === 'nl')) continue;
      const waar = `${profiel.id} ${thema} ${taal}`;
      const voorkeuren = { profiel: profiel.id, thema, taal, 'pult-dicht': true, scenario: 'avond', ['beeld-' + profiel.id]: profiel.beeld, snelheid: 60 };
      const { ctx, page, console_ } = await open(voorkeuren, { width: profiel.b + 64, height: profiel.h + 150 });
      await page.waitForTimeout(80);
      const maat = await page.evaluate(() => { const d = document.getElementById('hv-doek'); const r = d.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      if (maat[0] !== profiel.b || maat[1] !== profiel.h) meld(waar, `doek is ${maat[0]}×${maat[1]} in plaats van ${profiel.b}×${profiel.h}`);
      const routes = await page.evaluate(routeLijst);
      for (const route of routes) {
        await page.evaluate((r) => HV.open(r), route);
        await page.waitForTimeout(40);
        await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
        const m = await page.evaluate(meetRoute);
        tel.routes++; tel.doelen += m.doelen; tel.acties += m.acties;
        for (const o of m.overloop) meld(`${waar} #${route}`, 'horizontale overloop: ' + o);
        for (const k of [...new Set(m.klein)].slice(0, 6)) meld(`${waar} #${route}`, 'aanraakdoel < 44 px: ' + k);
        for (const z of [...new Set(m.zonder)]) meld(`${waar} #${route}`, 'data-actie zonder afhandeling: ' + z);
        if (UIT && (route === 'overzicht' || (taal === 'uk' && thema !== 'inkt' && ['kamers-nu', 'kamers-kamer-woonkamer', 'overzicht-blad-apparaat-torsher', 'energie-tarief', 'overzicht-blad-meldingen'].includes(route) && (profiel.id === 'telefoon' || profiel.id === 'bureau')))) {
          await page.locator('#mq-schaal').screenshot({ path: join(UIT, `${profiel.id}-${thema}-${taal}-${route}.png`) });
          tel.afdrukken++;
        }
      }
      for (const c of [...new Set(console_)].slice(0, 8)) meld(waar, 'console: ' + c.slice(0, 300));
      await ctx.close();
    }
  }
}

// ───────────────────────── 2. Klikproef ─────────────────────────
async function klikproef(profiel, taal) {
  const waar = `klikproef ${profiel.id} ${taal}`;
  const { ctx, page, console_ } = await open({ profiel: profiel.id, thema: 'licht', taal, 'pult-dicht': true, scenario: 'avond', snelheid: 60 }, { width: profiel.b + 64, height: profiel.h + 150 });
  const verwacht = async (naam, fn, arg) => { tel.klikproeven++; let ok = false; try { ok = await page.evaluate(fn, arg); } catch (e) { ok = false; meld(waar, naam + ' — ' + e.message.split('\n')[0]); return; } if (!ok) meld(waar, naam); };
  const wacht = (ms) => page.waitForTimeout(ms);

  // lamp op «Thuis»: toestand + journaal + toost
  const voor = await page.evaluate(() => ({ aan: HV.staat.w.apparaten.keukenlicht.st.aan, log: HV.staat.w.logboek.length }));
  await page.locator('[data-k="tegel-keukenlicht"] .hv-schakel').click();
  await wacht(120);
  await verwacht('tegel toont «wacht» direct na de klik', () => !!HV.staat.w.apparaten.keukenlicht.wacht && document.querySelector('[data-k="tegel-keukenlicht"]').classList.contains('is-wacht'));
  await wacht(700);
  await verwacht('lamp is van toestand veranderd', (v) => HV.staat.w.apparaten.keukenlicht.st.aan === !v.aan, voor);
  await verwacht('journaal heeft een nieuwe regel met maker «mens»', (v) => HV.staat.w.logboek.length === v.log + 1 && HV.staat.w.logboek[0].maker.soort === 'mens' && HV.staat.w.logboek[0].doel === 'keukenlicht', voor);
  await verwacht('toost is zichtbaar', () => !!document.querySelector('#hv-toosten .hv-toost'));
  await verwacht('tegel draagt het makerteken', () => !!document.querySelector('[data-k="tegel-keukenlicht"] .hv-tegel__maker'));

  // blad van de lamp en de schuif: geen volledige hertekening tijdens het slepen
  await page.locator('[data-k="tegel-torsher"] .hv-tegel__lijf').click();
  await wacht(250);
  await verwacht('blad van de lamp is open', () => !!document.querySelector('.hv-laag') && HV.route().blad && HV.route().blad.id === 'torsher');
  await verwacht('echt adres volgt de grammatica ?blad=', () => HV.echtAdres() === '/overzicht?blad=apparaat:torsher');
  const baan = page.locator('.hv-laag [data-schuif="licht-schuif"][data-mogelijkheid="helderheid"]');
  await baan.scrollIntoViewIfNeeded();
  const kader = await baan.boundingBox();
  await page.evaluate(() => { window.__merk = document.querySelector('.hv-laag .hv-kaart'); window.__teken = 0; const o = HV.zet; HV.zet = function (el, h) { if (HV.sleept) window.__teken++; return o(el, h); }; });
  await page.mouse.move(kader.x + kader.width * 0.55, kader.y + kader.height / 2);
  await page.mouse.down();
  await page.mouse.move(kader.x + kader.width * 0.7, kader.y + kader.height / 2, { steps: 4 });
  await page.mouse.move(kader.x + kader.width * 0.9, kader.y + kader.height / 2, { steps: 6 });
  await verwacht('schuif werkt de waarde bij tijdens het slepen', () => Number(document.querySelector('.hv-laag [data-schuif][data-mogelijkheid="helderheid"]').getAttribute('aria-valuenow')) > 80 && /\d/.test(document.getElementById('blad-getal').textContent));
  await verwacht('tijdens het slepen is er niet opnieuw getekend', () => window.__teken === 0 && HV.staat.w.apparaten.torsher.st.helderheid === 55);
  await page.mouse.up();
  await wacht(800);
  await verwacht('na loslaten is de helderheid bevestigd', () => HV.staat.w.apparaten.torsher.st.helderheid > 80 && window.__merk === document.querySelector('.hv-laag .hv-kaart'));
  // toetsenbord op de schuif
  await baan.focus();
  await page.keyboard.press('Home');
  await wacht(800);
  await verwacht('schuif luistert naar het toetsenbord (Home)', () => HV.staat.w.apparaten.torsher.st.helderheid === 1);
  await page.keyboard.press('Escape');
  await wacht(200);
  await verwacht('Escape sluit het blad', () => !document.querySelector('.hv-laag'));

  // scène «Avond»
  const logVoor = await page.evaluate(() => HV.staat.w.logboek.length);
  await page.locator('[data-k="scene-avond"]').click();
  await wacht(300);
  await verwacht('scène heeft de lamp boven de tafel aangezet en een regel geschreven', (n) => HV.staat.w.apparaten.keukenlicht.st.aan === true && HV.staat.w.logboek.length > n && HV.staat.w.sceneActief === 'avond', logVoor);
  await verwacht('toost van de scène biedt «Ongedaan maken»', () => !!document.querySelector('.hv-toost [data-actie="toost-terug"]'));

  // huisstand → hemel verandert (nacht)
  const hemelVoor = await page.evaluate(() => document.getElementById('hv-doek').style.getPropertyValue('--hv-hemel-boven'));
  await page.evaluate(() => HV.bladOpen('huisstand'));
  await wacht(200);
  await page.locator('.hv-laag [data-actie="huisstand"][data-waarde="nacht"]').click();
  await wacht(300);
  await verwacht('huisstand is «nacht» en de hemel is veranderd', (v) => HV.staat.w.huisstand === 'nacht' && document.getElementById('hv-doek').style.getPropertyValue('--hv-hemel-boven') !== v && document.getElementById('hv-doek').getAttribute('data-fase') === 'nacht', hemelVoor);
  await page.evaluate(() => HV.bladOpen(null));

  // scenario en tijdsnelheid vanaf het bedieningspaneel
  await page.locator('.mq-pult__wissel').click();
  await wacht(150);
  await page.locator('select[data-pult="scenario"]').selectOption('zonnigemiddag');
  await wacht(300);
  await verwacht('scenario «zonnige middag»: fase dag, zon levert', () => HV.staat.w.scenario === 'zonnigemiddag' && document.getElementById('hv-doek').getAttribute('data-fase') === 'dag' && HV.staat.w.energie.zon > 2);
  await page.locator('button[data-pult="snelheid"][data-waarde="600"]').click();
  await page.evaluate(() => { for (let i = 0; i < 40; i++) HV.klok.tik(1); });
  await wacht(300);
  await verwacht('×600: na 40 tikken is de fase van de hemel anders', () => HV.staat.w.snelheid === 600 && document.getElementById('hv-doek').getAttribute('data-fase') !== 'dag');
  await page.locator('button[data-pult="snelheid"][data-waarde="0"]').click();
  await page.locator('.mq-pult__wissel').click();
  await wacht(150);

  // inklappen en onthouden
  await page.evaluate(() => HV.open('overzicht'));
  await wacht(150);
  await page.locator('[data-actie="blok"][data-blok="scenes"]').click();
  await wacht(150);
  await verwacht('blok «Scènes» is ingeklapt en onthouden', () => document.querySelector('[data-k="blok-scenes"]').classList.contains('is-dicht') && HV.opslag.lees('blokken', {}).scenes === false);
  await page.locator('[data-actie="blok"][data-blok="scenes"]').click();

  // meldingencentrum en regel van het journaal
  await page.evaluate(() => HV.bladOpen('meldingen'));
  await wacht(250);
  await verwacht('meldingencentrum toont regels van het journaal', () => document.querySelectorAll('.hv-laag .hv-bericht').length >= 3);
  await page.locator('.hv-laag .hv-bericht__kop').first().click();
  await wacht(150);
  await verwacht('regel klapt uit met «wie / wat»', () => !!document.querySelector('.hv-laag .hv-bericht.is-open .hv-bericht__details'));
  await page.evaluate(() => HV.bladOpen(null));

  // gevaarlijke actie: dialoog met rail; kritiek vraagt herbevestiging
  await page.evaluate(() => { HV.doe({ doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: false }); });
  await wacht(250);
  await verwacht('kritieke actie opent hv-gevaar met rail en focus op «Annuleren»', () => !!document.querySelector('.hv-gevaar .hv-rail') && document.activeElement && document.activeElement.getAttribute('data-actie') === 'dialoog-annuleer');
  const rail = await page.locator('.hv-gevaar .hv-rail').boundingBox();
  await page.mouse.move(rail.x + 40, rail.y + rail.height / 2);
  await page.mouse.down();
  await wacht(1400);
  await page.mouse.up();
  await wacht(200);
  await verwacht('na het vasthouden volgt de herbevestiging', () => !!document.querySelector('.hv-gevaar .hv-herbevestig'));
  await page.locator('.hv-gevaar [data-actie="dialoog-herbevestig"]').click({ timeout: 3000 });
  await wacht(800);
  await verwacht('deur is ontgrendeld en staat in het journaal', () => HV.staat.w.apparaten.voordeurslot.st.vergrendeld === false && HV.staat.w.logboek.some((r) => r.doel === 'voordeurslot'));

  // toestemming: standaard «uit»; agent zonder toestemming voert niets uit
  await verwacht('toestemming staat standaard op «uit»', () => HV.gevaar.stand('claude', 'slot.ontgrendelen') === 'uit');
  await page.evaluate(() => HV.doe({ doel: 'torsher', mogelijkheid: 'aan', waarde: false, door: { soort: 'agent', id: 'claude', naam: ['Агент Claude', 'Agent Claude'] } }));
  await wacht(700);
  await verwacht('agent met toestemming «uit» verandert niets', () => HV.staat.w.apparaten.torsher.st.aan === true || HV.staat.w.logboek[0].waarom !== null);

  // noodlaag
  await page.evaluate(() => HV.scenarios.start('rook'));
  await wacht(300);
  await verwacht('rook: noodlaag staat erop, hemel is uit', () => !!document.querySelector('.hv-nood') && document.getElementById('hv-doek').classList.contains('hv-hemel--geen'));
  if (UIT) { await page.locator('#mq-schaal').screenshot({ path: join(UIT, `${profiel.id}-nood.png`) }); tel.afdrukken++; }
  await page.locator('.hv-nood [data-actie="nood-zie"]').click();
  await wacht(250);
  await verwacht('na «Gezien» is de noodlaag weg en staat het in «Nu belangrijk»', () => !document.querySelector('.hv-nood') && HV.staat.w.nu.some((n) => n.id === 'nood'));

  // alle vijftien scenario's en de drie gegevenstoestanden: «Thuis» en «Kamers» tekenen zonder fouten
  const scenarios = await page.evaluate(() => HV.scenarios.lijst.map((s) => s.id));
  for (const id of scenarios) {
    await page.evaluate((s) => { HV.scenarios.start(s); HV.open('overzicht'); }, id);
    await wacht(120);
    await verwacht('scenario «' + id + '» tekent «Thuis» met een huiszin', (s) => HV.staat.w.scenario === s && (!!document.querySelector('.hv-held__zin') || !!document.querySelector('.hv-nood')), id);
    if (UIT && profiel.id === 'bureau') { await page.locator('#mq-schaal').screenshot({ path: join(UIT, 'scenario-' + id + '.png') }); tel.afdrukken++; }
  }
  for (const stand of ['verouderd', 'geen', 'live']) {
    await page.evaluate((g) => { HV.scenarios.start('avond'); HV.staat.wijzig((w) => { w.gegevens = g; w.gegevensSinds = w.tijd; }); HV.open('kamers-nu'); }, stand);
    await wacht(150);
    await verwacht('gegevens «' + stand + '»: strook en kamers zichtbaar', (g) => document.querySelectorAll('.hv-kamerkaart').length >= 8 && (g === 'live') === !document.querySelector('.hv-verbinding'), stand);
  }
  await page.evaluate(() => HV.doe({ doel: 'keukenlicht', mogelijkheid: 'aan', waarde: false }));
  await page.evaluate(() => { HV.staat.wijzig((w) => { w.gegevens = 'geen'; }); return HV.doe({ doel: 'torsher', mogelijkheid: 'aan', waarde: false }).then((r) => { window.__geen = r; }); });
  await wacht(200);
  await verwacht('zonder verbinding wordt een actie geweigerd', () => window.__geen && window.__geen.ok === false && window.__geen.reden === 'verbinding');

  for (const c of [...new Set(console_)].slice(0, 8)) meld(waar, 'console: ' + c.slice(0, 300));
  await ctx.close();
}
for (const [p, taal] of [[PROFIELEN[0], 'uk'], [PROFIELEN[1], 'nl']]) {
  try { await klikproef(p, taal); } catch (e) { meld(`klikproef ${p.id} ${taal}`, 'afgebroken — ' + String(e.message).split('\n').slice(0, 3).join(' ')); }
}

// ───────────────────────── 3. Artefactvariant: vorm en geen horizontale scroll op een smal scherm ─────────────────────────
{
  const art = bouw({ artefact: true });
  if (!art.startsWith('<title>')) meld('artefact', 'begint niet met <title>');
  const ctx = await browser.newContext({ viewport: { width: 375, height: 700 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const console_ = [];
  page.on('console', (m) => { if (m.type() === 'error') console_.push(m.text()); });
  page.on('pageerror', (e) => console_.push('pageerror: ' + e.message));
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + art + '</body></html>');
  await page.waitForFunction(() => window.HV && window.HV.gestart, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => ({ breed: document.documentElement.scrollWidth, venster: window.innerWidth, doek: Math.round(document.getElementById('hv-doek').getBoundingClientRect().width), profiel: HV.profiel().id }));
  if (m.breed > m.venster) meld('artefact 375', `pagina scrolt horizontaal: ${m.breed} > ${m.venster}`);
  if (m.doek < m.venster - 34) meld('artefact 375', `doek vult de breedte niet: ${m.doek} van ${m.venster}`);
  for (const c of console_.slice(0, 5)) meld('artefact 375', 'console: ' + c.slice(0, 300));
  if (UIT) { await page.screenshot({ path: join(UIT, 'artefact-375.png') }); tel.afdrukken++; }
  tel.ladingen++;
  await ctx.close();
}

await browser.close();

const uniek = [...fouten.entries()];
for (const [wat, f] of uniek.slice(0, 60)) console.error(`[rook] FOUT ${wat}  (${f.aantal}×, eerst: ${f.waar})`);
if (uniek.length > 60) console.error(`[rook] … en nog ${uniek.length - 60}`);
console.log(`[rook] ${tel.ladingen} ladingen · ${tel.routes} routes · ${tel.doelen} aanraakdoelen · ${tel.acties} data-acties · ${tel.klikproeven} klikproeven · ${tel.afdrukken} schermafdrukken${UIT ? ' in ' + UIT : ''} · ${uniek.length} fout(en)`);
process.exit(uniek.length ? 1 : 0);
