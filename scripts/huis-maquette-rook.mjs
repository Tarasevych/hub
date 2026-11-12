// Rookproef van de maquette «Levend huis» in een echte browser (playwright).
//
// Bouwt de maquette, opent haar en loopt ALLE routes af in zes profielen (telefoon 390×844, bureau 1440×900, strook 1920×480,
// vierkant 480×480, horloge 240×240, tv 1920×1080), drie thema's (licht, donker, inkt) en twee talen. Per route:
//   - geen fouten in de console;
//   - het doek scrolt niet horizontaal;
//   - elk aanraakdoel is ≥ 44 px;
//   - elke knop met data-actie heeft een afhandeling.
//   - in de Nederlandse stand staat nergens Cyrillisch (behalve binnen lang="uk").
// Taalwissel: alle routes en een paar acties in het Oekraïens, dan omschakelen naar het Nederlands en alle routes opnieuw —
// zo valt tekst op die één keer is uitgerekend (bij het laden, in een cache, in de toestand) en niet meewisselt.
// Daarna een klikproef: de schakelaar van een lamp verandert de toestand, schrijft het Журнал en toont een сповіщення;
// de schuif van het blad, een scène, de huisstand, scenario en tijdsnelheid (hemel verandert), inklappen, meldingencentrum,
// de gevaarlijke actie met rail, toestemmingen (verzoek alleen bij «Vragen», vervalt bij «Uit», wordt uitgevoerd bij
// «Altijd»; een verzoek met eigen tijd wordt pas dán uitgevoerd, verloopt op zijn eigen termijn en vervalt als het zijn
// zin verliest; een gast keurt niets goed en de eigenaar keurt een kritieke actie alleen met de rail goed), een opdracht
// zonder verandering («Is al zo», niet bij een verouderde toestand) en het lege journaal van «Eerste start».
//
// Gebruik: node scripts/huis-maquette-rook.mjs --uit <map voor schermafdrukken> [--snel] [--naar <eigen html>]     (exit 1 bij fouten)
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
const tel = { ladingen: 0, routes: 0, doelen: 0, acties: 0, afdrukken: 0, klikproeven: 0, taalroutes: 0 };

// Bouwen en als bestand openen (zelfde inhoud als docs/huis/maquette/huis-maquette.html).
const html = bouw();
// «--naar <pad>»: власна копія для паралельної роботи кількох авторів (без перезапису спільного файлу).
const naarIndex = args.indexOf('--naar');
const bestand = naarIndex >= 0 && args[naarIndex + 1] ? resolve(args[naarIndex + 1]) : join(WORTEL, 'docs/huis/maquette/huis-maquette.html');
mkdirSync(dirname(bestand), { recursive: true });
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

/**
 * Taalproef: in de Nederlandse stand mag nergens in het document Cyrillisch staan — niet in tekst en niet in
 * aria-label/title/placeholder. Toegestaan is alleen wat bewust Oekraïens is en dat ook zegt: een element met lang="uk"
 * (de naam van de taal in de taalkeuze, het veld «Назва українською»). Zo valt elke tekst op die één keer is uitgerekend
 * (bij het laden van een module, in een cache, in de toestand) en daarna niet meer met de taal meewisselt.
 */
const zoekCyrillisch = () => {
  const CYR = /[А-Яа-яІіЇїЄєҐґ]/;
  const uit = [];
  const mag = (el) => !!(el && el.closest && el.closest('[lang="uk"]'));
  const pad = (el) => { const d = []; for (let e = el; e && e !== document.body && d.length < 3; e = e.parentElement) d.unshift(e.nodeName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : '')); return d.join(' > '); };
  const loper = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = loper.nextNode());) {
    const ouder = n.parentElement;
    if (!ouder || ouder.nodeName === 'SCRIPT' || ouder.nodeName === 'STYLE') continue;
    if (CYR.test(n.nodeValue) && !mag(ouder)) uit.push('tekst «' + n.nodeValue.trim().slice(0, 60) + '» in ' + pad(ouder));
  }
  for (const el of document.body.querySelectorAll('[aria-label], [title], [placeholder], [alt], [aria-valuetext], [aria-description]')) {
    for (const a of ['aria-label', 'title', 'placeholder', 'alt', 'aria-valuetext', 'aria-description']) {
      const v = el.getAttribute(a);
      if (v && CYR.test(v) && !mag(el)) uit.push(a + ' «' + v.slice(0, 60) + '» in ' + pad(el));
    }
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
        if (taal === 'nl') { tel.taalroutes++; for (const c of [...new Set(await page.evaluate(zoekCyrillisch))].slice(0, 8)) meld(`${waar} #${route}`, 'Cyrillisch in de Nederlandse stand: ' + c); }
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

// ───────────────────────── 1b. Taalwissel: eerst alles in het Oekraïens, dan omschakelen ─────────────────────────
// Een verse lading in het Nederlands vangt alleen tekst die bij het laden van een module is uitgerekend. Wat pas bij het
// eerste tekenen of bij een actie wordt bewaard (cache, toestand, journaal), blijft Oekraïens als de taal daarna wisselt.
// Daarom: alle routes en een paar acties in het Oekraïens, dan de taal omzetten zoals het bedieningspaneel dat doet, en
// alle routes opnieuw — zonder één Cyrillisch teken buiten lang="uk".
{
  const waar = 'taalwissel bureau licht uk→nl';
  try {
    const { ctx, page, console_ } = await open({ profiel: 'bureau', thema: 'licht', taal: 'uk', 'pult-dicht': false, scenario: 'avond', 'beeld-bureau': 0, snelheid: 60 }, { width: 1440 + 64 + 320, height: 900 + 150 });
    const routes = await page.evaluate(routeLijst);
    const loop = async (scan) => {
      for (const route of routes) {
        await page.evaluate((r) => HV.open(r), route);
        await page.waitForTimeout(30);
        await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
        if (!scan) continue;
        tel.taalroutes++;
        for (const c of [...new Set(await page.evaluate(zoekCyrillisch))].slice(0, 8)) meld(`${waar} #${route}`, 'Cyrillisch na de taalwissel: ' + c);
      }
    };
    await loop(false);
    // acties van de kern in het Oekraïens: hun journaalregels, verzoek en «Nu belangrijk» moeten daarna Nederlands lezen
    await page.evaluate(async () => {
      const wacht = (ms) => new Promise((k) => setTimeout(k, ms));
      await HV.doe({ doel: 'keukenlicht', mogelijkheid: 'aan', waarde: !HV.staat.w.apparaten.keukenlicht.st.aan });
      await HV.doe({ doel: 'scene:avond', mogelijkheid: 'start', waarde: true });
      await HV.doe({ doel: 'huis', mogelijkheid: 'stand', waarde: 'gasten' });
      await HV.doe({ doel: 'kamer:woonkamer', mogelijkheid: 'licht', waarde: false });
      await HV.doe({ doel: 'torsher', mogelijkheid: 'aan', waarde: true, door: { soort: 'agent', id: 'claude', naam: ['Агент Claude', 'Agent Claude'] } });
      await wacht(200);
    });
    await page.locator('button[data-pult="taal"][data-waarde="nl"]').click();
    await page.waitForFunction(() => HV.taal() === 'nl' && document.getElementById('hv-doek').getAttribute('lang') === 'nl', null, { timeout: 3000 });
    await loop(true);
    for (const c of [...new Set(console_)].slice(0, 8)) meld(waar, 'console: ' + c.slice(0, 300));
    await ctx.close();
  } catch (e) { meld(waar, 'afgebroken — ' + String(e.message).split('\n').slice(0, 3).join(' ')); }
}

// ───────────────────────── 2. Klikproef ─────────────────────────
async function klikproef(profiel, taal) {
  const waar = `klikproef ${profiel.id} ${taal}`;
  const { ctx, page, console_ } = await open({ profiel: profiel.id, thema: 'licht', taal, 'pult-dicht': true, scenario: 'avond', snelheid: 60 }, { width: profiel.b + 64, height: profiel.h + 150 });
  const verwacht = async (naam, fn, arg) => { tel.klikproeven++; let ok = false; try { ok = await page.evaluate(fn, arg); } catch (e) { ok = false; meld(waar, naam + ' — ' + e.message.split('\n')[0]); return; } if (!ok) meld(waar, naam); };
  const wacht = (ms) => page.waitForTimeout(ms);
  // Wachten op een toestand in plaats van op de klok: onder belasting komt een beeld of een bevestiging later dan gepland.
  // De proef daarna blijft streng — «tot» wacht alleen, het keurt niets goed.
  const tot = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 }).catch(() => {});

  // lamp op «Thuis»: toestand + journaal + toost
  const voor = await page.evaluate(() => ({ aan: HV.staat.w.apparaten.keukenlicht.st.aan, log: HV.staat.w.logboek.length }));
  // «wacht» duurt maar even (tot de bevestiging): een waarnemer op de tegel ziet het moment, hoe traag de proef zelf ook is
  await page.evaluate(() => {
    window.__zagWacht = false;
    const tegel = document.querySelector('[data-k="tegel-keukenlicht"]');
    const kijk = () => { if (tegel.classList.contains('is-wacht') && HV.staat.w.apparaten.keukenlicht.wacht) window.__zagWacht = true; };
    new MutationObserver(kijk).observe(tegel, { attributes: true, attributeFilter: ['class'] });
  });
  await page.locator('[data-k="tegel-keukenlicht"] .hv-schakel').click();
  await tot(() => window.__zagWacht === true);
  await verwacht('tegel toont «wacht» direct na de klik', () => window.__zagWacht === true);
  await tot((v) => HV.staat.w.apparaten.keukenlicht.st.aan === !v.aan && !HV.staat.w.apparaten.keukenlicht.wacht && !!document.querySelector('#hv-toosten .hv-toost'), voor);
  await wacht(120);
  await verwacht('lamp is van toestand veranderd', (v) => HV.staat.w.apparaten.keukenlicht.st.aan === !v.aan, voor);
  await verwacht('journaal heeft een nieuwe regel met maker «mens»', (v) => HV.staat.w.logboek.length === v.log + 1 && HV.staat.w.logboek[0].maker.soort === 'mens' && HV.staat.w.logboek[0].doel === 'keukenlicht', voor);
  await verwacht('toost is zichtbaar', () => !!document.querySelector('#hv-toosten .hv-toost'));
  await verwacht('tegel draagt het makerteken', () => !!document.querySelector('[data-k="tegel-keukenlicht"] .hv-tegel__maker'));

  // blad van de lamp en de schuif: geen volledige hertekening tijdens het slepen
  await page.locator('[data-k="tegel-torsher"] .hv-tegel__lijf').click();
  await tot(() => !!document.querySelector('.hv-laag [data-schuif="licht-schuif"]'));
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
  await tot(() => HV.staat.w.apparaten.torsher.st.helderheid > 80 && !HV.staat.w.apparaten.torsher.wacht);
  await wacht(150);
  await verwacht('na loslaten is de helderheid bevestigd', () => HV.staat.w.apparaten.torsher.st.helderheid > 80 && window.__merk === document.querySelector('.hv-laag .hv-kaart'));
  // toetsenbord op de schuif
  await baan.focus();
  await page.keyboard.press('Home');
  await tot(() => HV.staat.w.apparaten.torsher.st.helderheid === 1 && !HV.staat.w.apparaten.torsher.wacht);
  await wacht(150);
  await verwacht('schuif luistert naar het toetsenbord (Home)', () => HV.staat.w.apparaten.torsher.st.helderheid === 1);
  await page.keyboard.press('Escape');
  await tot(() => !document.querySelector('.hv-laag'));
  await verwacht('Escape sluit het blad', () => !document.querySelector('.hv-laag'));

  // scène «Avond»
  const logVoor = await page.evaluate(() => HV.staat.w.logboek.length);
  await page.locator('[data-k="scene-avond"]').click();
  await tot(() => HV.staat.w.sceneActief === 'avond' && !!document.querySelector('.hv-toost [data-actie="toost-terug"]'));
  await wacht(100);
  await verwacht('scène heeft de lamp boven de tafel aangezet en een regel geschreven', (n) => HV.staat.w.apparaten.keukenlicht.st.aan === true && HV.staat.w.logboek.length > n && HV.staat.w.sceneActief === 'avond', logVoor);
  await verwacht('toost van de scène biedt «Ongedaan maken»', () => !!document.querySelector('.hv-toost [data-actie="toost-terug"]'));

  // huisstand → hemel verandert (nacht)
  const hemelVoor = await page.evaluate(() => document.getElementById('hv-doek').style.getPropertyValue('--hv-hemel-boven'));
  await page.evaluate(() => HV.bladOpen('huisstand'));
  await wacht(200);
  await page.locator('.hv-laag [data-actie="huisstand"][data-waarde="nacht"]').click();
  await tot(() => HV.staat.w.huisstand === 'nacht' && document.getElementById('hv-doek').getAttribute('data-fase') === 'nacht');
  await wacht(100);
  await verwacht('huisstand is «nacht» en de hemel is veranderd', (v) => HV.staat.w.huisstand === 'nacht' && document.getElementById('hv-doek').style.getPropertyValue('--hv-hemel-boven') !== v && document.getElementById('hv-doek').getAttribute('data-fase') === 'nacht', hemelVoor);
  await page.evaluate(() => HV.bladOpen(null));

  // scenario en tijdsnelheid vanaf het bedieningspaneel
  await page.locator('.mq-pult__wissel').click();
  await wacht(150);
  await page.locator('select[data-pult="scenario"]').selectOption('zonnigemiddag');
  await tot(() => HV.staat.w.scenario === 'zonnigemiddag' && document.getElementById('hv-doek').getAttribute('data-fase') === 'dag');
  await wacht(100);
  await verwacht('scenario «zonnige middag»: fase dag, zon levert', () => HV.staat.w.scenario === 'zonnigemiddag' && document.getElementById('hv-doek').getAttribute('data-fase') === 'dag' && HV.staat.w.energie.zon > 2);
  await page.locator('button[data-pult="snelheid"][data-waarde="600"]').click();
  await page.evaluate(() => { for (let i = 0; i < 40; i++) HV.klok.tik(1); });
  await tot(() => document.getElementById('hv-doek').getAttribute('data-fase') !== 'dag');
  await wacht(100);
  await verwacht('×600: na 40 tikken is de fase van de hemel anders', () => HV.staat.w.snelheid === 600 && document.getElementById('hv-doek').getAttribute('data-fase') !== 'dag');
  await page.locator('button[data-pult="snelheid"][data-waarde="0"]').click();
  await page.locator('.mq-pult__wissel').click();
  await wacht(150);

  // inklappen en onthouden
  await page.evaluate(() => HV.open('overzicht'));
  await wacht(150);
  await page.locator('[data-actie="blok"][data-blok="scenes"]').click();
  await tot(() => document.querySelector('[data-k="blok-scenes"]').classList.contains('is-dicht'));
  await verwacht('blok «Scènes» is ingeklapt en onthouden', () => document.querySelector('[data-k="blok-scenes"]').classList.contains('is-dicht') && HV.opslag.lees('blokken', {}).scenes === false);
  await page.locator('[data-actie="blok"][data-blok="scenes"]').click();

  // meldingencentrum en regel van het journaal
  await page.evaluate(() => HV.bladOpen('meldingen'));
  await tot(() => document.querySelectorAll('.hv-laag .hv-bericht').length >= 3);
  await wacht(100);
  await verwacht('meldingencentrum toont regels van het journaal', () => document.querySelectorAll('.hv-laag .hv-bericht').length >= 3);
  await page.locator('.hv-laag .hv-bericht__kop').first().click();
  await tot(() => !!document.querySelector('.hv-laag .hv-bericht.is-open .hv-bericht__details'));
  await verwacht('regel klapt uit met «wie / wat»', () => !!document.querySelector('.hv-laag .hv-bericht.is-open .hv-bericht__details'));
  await page.evaluate(() => HV.bladOpen(null));

  // gevaarlijke actie: dialoog met rail; kritiek vraagt herbevestiging
  await page.evaluate(() => { HV.doe({ doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: false }); });
  // Geen vaste wachttijd: het dialoogvenster wordt in het volgende beeld getekend en dat beeld kan onder belasting laat komen.
  // De focus zet de maquette zelf direct na het tekenen (kern/lagen.js), dus zodra het venster er staat, moet ze kloppen.
  await page.waitForSelector('.hv-gevaar .hv-rail', { timeout: 5000 }).catch(() => {});
  await verwacht('kritieke actie opent hv-gevaar met rail en focus op «Annuleren»', () => !!document.querySelector('.hv-gevaar .hv-rail') && document.activeElement && document.activeElement.getAttribute('data-actie') === 'dialoog-annuleer');
  const rail = await page.locator('.hv-gevaar .hv-rail').boundingBox();
  await page.mouse.move(rail.x + 40, rail.y + rail.height / 2);
  await page.mouse.down();
  // vasthouden tot de rail klaar is (1,2 s in de maquette), niet tot een vaste tijd van de proef
  await tot(() => !!document.querySelector('.hv-gevaar .hv-herbevestig'));
  await page.mouse.up();
  await verwacht('na het vasthouden volgt de herbevestiging', () => !!document.querySelector('.hv-gevaar .hv-herbevestig'));
  await page.locator('.hv-gevaar [data-actie="dialoog-herbevestig"]').click({ timeout: 3000 });
  // замок — клас із ходом: після першої відповіді стан «виконується» зі словом напряму, потім підтвердження
  await page.waitForFunction(() => { const a = HV.staat.w.apparaten.voordeurslot; return !!(a.wacht && a.wacht.fase === 'bezig'); }, null, { timeout: 3000 }).catch(() => {});
  await verwacht('замок показує «виконується» з напрямом', () => { const a = HV.staat.w.apparaten.voordeurslot; return !!(a.wacht && a.wacht.fase === 'bezig' && a.wacht.grens === 15); });
  await page.waitForFunction(() => HV.staat.w.apparaten.voordeurslot.st.vergrendeld === false, null, { timeout: 5000 }).catch(() => {});
  await wacht(200);
  await verwacht('deur is ontgrendeld en staat in het journaal', () => HV.staat.w.apparaten.voordeurslot.st.vergrendeld === false && HV.staat.w.logboek.some((r) => r.doel === 'voordeurslot'));

  // toestemming: standaard «uit»; agent zonder toestemming voert niets uit
  await verwacht('toestemming staat standaard op «uit»', () => HV.gevaar.stand('claude', 'slot.ontgrendelen') === 'uit' && HV.gevaar.stand('claude', 'oven.aan') === 'uit');
  await page.evaluate(() => HV.doe({ doel: 'oven', mogelijkheid: 'aan', waarde: true, door: { soort: 'agent', id: 'claude', naam: ['Агент Claude', 'Agent Claude'] } }).then((r) => { window.__uit = r; }));
  await wacht(700);
  await verwacht('agent met toestemming «uit» verandert niets en laat «Niet uitgevoerd» in het journaal achter', () => !!window.__uit && window.__uit.ok === false && window.__uit.reden === 'stand-uit' && !HV.staat.w.apparaten.oven.st.aan && /^Niet uitgevoerd/.test(HV.staat.w.logboek[0].wat[1]) && HV.staat.w.logboek[0].waarom[1] === 'toestemming ‘Uit’');

  // een opdracht die niets verandert: «Is al zo», geen journaalregel, geen dialoog (ook niet voor een kritieke actie)
  await page.evaluate(() => { HV.toosten.slice().forEach((x) => HV.toostWeg(x.id)); window.__log = HV.staat.w.logboek.length; return HV.doe({ doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: false }).then((r) => { window.__alzo = r; }); });
  await wacht(150);
  await verwacht('opdracht zonder verandering: «Is al zo» zonder journaalregel en zonder dialoog', () => !!window.__alzo && window.__alzo.ok === true && window.__alzo.ongewijzigd === true && HV.staat.w.logboek.length === window.__log && !document.querySelector('.hv-gevaar') && HV.toosten.length === 1 && /^(Уже так|Is al zo)$/.test(HV.p(HV.toosten[0].titel)));

  // verzoek bestaat alleen bij «Vragen»: op «Uit» vervalt het vanzelf (journaal, weg uit «Nu belangrijk»), goedkeuren kan niet meer
  const verzoekProef = async (naar) => {
    await page.evaluate(() => { HV.scenarios.start('avond'); HV.open('overzicht'); });
    await wacht(150);
    await verwacht('scenario «avond»: verzoek v1 wacht bij toestemming «Vragen» en de auto laadt nog niet', () => HV.gevaar.stand('claude', 'laadpaal.laden') === 'vragen' && HV.staat.w.verzoeken.some((v) => v.id === 'v1' && v.stand === 'wacht') && !!document.querySelector('[data-k="nu-verzoek-v1"]') && HV.staat.w.apparaten.laadpaal.st.laadt === false);
    if (naar) await page.evaluate((s) => HV.gevaar.zetStand('claude', 'laadpaal.laden', s), naar);
    await wacht(150);
  };
  await verzoekProef('uit');
  await verwacht('toestemming → «Uit»: wachtend verzoek vervalt met een journaalregel en verdwijnt uit «Nu belangrijk»', () => { const v = HV.staat.w.verzoeken.filter((x) => x.id === 'v1')[0]; return v.stand === 'verlopen' && v.vervallen && v.vervallen.reden === 'stand-uit' && !HV.staat.w.nu.some((n) => n.verzoek === 'v1') && !document.querySelector('[data-k="nu-verzoek-v1"]') && HV.staat.w.logboek.some((r) => /^Verzoek vervallen: /.test(r.wat[1]) && /^toestemming uitgezet/.test(r.waarom[1])); });
  await page.evaluate(() => { HV.acties['verzoek-ja'](HV.ctx(), { verzoek: 'v1' }); return HV.verzoek('v1', true).then((r) => { window.__ja = r; }); });
  await wacht(700);
  await verwacht('bij «Uit» is goedkeuren onmogelijk: de auto laadt niet', () => !!window.__ja && window.__ja.ok === false && HV.staat.w.apparaten.laadpaal.st.laadt === false);
  // goedgekeurd is uitgevoerd: het verzoek «De auto om 02:00 laden» noemt zijn eigen tijd — «Altijd» en «Eén keer
  // goedkeuren» om 19:42 starten het laden NIET meteen (dure avonduur); de huisklok voert het om 02:00 uit
  await verzoekProef('altijd');
  await verwacht('toestemming → «Altijd»: verzoek met eigen tijd wordt ingepland, het laden begint niet om 19:42', () => { const v = HV.staat.w.verzoeken.filter((x) => x.id === 'v1')[0]; return v.stand === 'goedgekeurd' && v.viaStand === 'altijd' && !!v.gepland && !v.uitkomst && HV.staat.w.apparaten.laadpaal.st.laadt === false && !HV.staat.w.apparaten.laadpaal.wacht && !HV.staat.w.nu.some((n) => n.verzoek === 'v1') && HV.staat.w.logboek.some((r) => /^Verzoek ingepland: /.test(r.wat[1])); });
  await verzoekProef(null);
  await page.evaluate(() => HV.verzoek('v1', true).then((r) => { window.__plan = r; }));
  await wacht(200);
  await verwacht('«Eén keer goedkeuren» om 19:42: ingepland voor 02:00, besluit in het journaal, de auto laadt nog niet', () => { const v = HV.staat.w.verzoeken.filter((x) => x.id === 'v1')[0]; return !!window.__plan && window.__plan.ok === true && !!window.__plan.gepland && v.stand === 'goedgekeurd' && !v.uitkomst && HV.staat.w.apparaten.laadpaal.st.laadt === false && /02:00/.test(HV.verzoekWoord(v)[1]) && /^Eén keer goedgekeurd: /.test(HV.staat.w.logboek[0].wat[1]); });
  // de huisklok: regel «Goedkoop laden» uit (anders laadt die al om 01:00), dan naar 02:00 — het verzoek voert zichzelf uit
  await page.evaluate(async () => {
    HV.acties['regel-schakel'](HV.ctx(), { regel: 'goedkoopladen' });
    const doel = HV.staat.w.verzoeken.filter((x) => x.id === 'v1')[0].gepland.om;
    for (let i = 0; i < 60 && HV.staat.w.tijd < doel; i++) { HV.klok.stap(600); await new Promise((r) => setTimeout(r, 30)); }
  });
  await tot(() => HV.staat.w.apparaten.laadpaal.st.laadt === true && !HV.staat.w.apparaten.laadpaal.wacht);
  await wacht(150);
  await verwacht('om 02:00 voert de huisklok het goedgekeurde verzoek uit: de agent laadt, «één keer goedgekeurd» in het journaal', () => { const v = HV.staat.w.verzoeken.filter((x) => x.id === 'v1')[0], lp = HV.staat.w.apparaten.laadpaal; return v.uitkomst === 'uitgevoerd' && lp.st.laadt === true && lp.maker.soort === 'agent' && HV.uur(HV.staat.w.tijd) >= 2 && HV.uur(HV.staat.w.tijd) < 2.5 && HV.staat.w.logboek.some((r) => r.doel === 'laadpaal' && r.maker.soort === 'agent' && r.toegestaan && /^één keer goedgekeurd: /.test(r.toegestaan[1])); });
  // onbeantwoord verzoek vervalt op de tijd die het zelf noemt (01:55): geen «tijd verstreken» naast een levende knop
  await verzoekProef(null);
  await page.evaluate(async () => {
    HV.acties['regel-schakel'](HV.ctx(), { regel: 'goedkoopladen' });
    const tot = HV.staat.w.verzoeken.filter((x) => x.id === 'v1')[0].tot;
    for (let i = 0; i < 60 && HV.staat.w.tijd < tot; i++) { HV.klok.stap(600); await new Promise((r) => setTimeout(r, 30)); }
  });
  await tot(() => HV.staat.w.verzoeken.filter((x) => x.id === 'v1')[0].stand === 'verlopen');
  await verwacht('onbeantwoord verzoek verloopt op zijn eigen tijd en verdwijnt uit «Nu belangrijk»', () => { const v = HV.staat.w.verzoeken.filter((x) => x.id === 'v1')[0]; return v.stand === 'verlopen' && v.vervallen.reden === 'tijd' && !HV.staat.w.nu.some((n) => n.verzoek === 'v1') && HV.staat.w.apparaten.laadpaal.st.laadt === false && HV.staat.w.logboek.some((r) => /^Verzoek verlopen: /.test(r.wat[1])); });

  // «Altijd» voert een wachtend verzoek ZONDER eigen tijd meteen uit; de tekst van het verzoek komt uit de waarde
  await page.evaluate(async () => {
    HV.scenarios.start('avond'); HV.open('overzicht');
    const door = { soort: 'optimalisatie', id: 'optimalisatie', naam: ['Оптимізатор енергії', 'Energie-optimalisatie'] };
    await HV.gevaar.zetStand('optimalisatie', 'laadpaal.laden', 'vragen');
    const start = await HV.doe({ doel: 'laadpaal', mogelijkheid: 'laden', waarde: true, door });
    const v = HV.staat.w.verzoeken.filter((x) => x.id === start.verzoek)[0];
    window.__tekst = { start: v.wat.slice(), tot: v.tot, nu: HV.staat.w.nu.filter((n) => n.verzoek === v.id)[0].tekst.slice(), stop: HV.actieZin('laadpaal', 'laden', false) };
    window.__vid = v.id;
    await HV.gevaar.zetStand('optimalisatie', 'laadpaal.laden', 'altijd');
  });
  await tot(() => HV.staat.w.apparaten.laadpaal.st.laadt === true && !HV.staat.w.apparaten.laadpaal.wacht);
  await wacht(150);
  await verwacht('tekst van het verzoek zegt wat er gebeurt: starten en stoppen verschillen; de kern zet zelf geen termijn', () => { const x = window.__tekst; return x.start[1] === 'Het laden van de auto starten' && x.stop[1] === 'Het laden van de auto stoppen' && x.start[0] !== x.stop[0] && / vraagt: het laden van de auto starten$/.test(x.nu[1]) && x.tot === undefined; });
  await verwacht('toestemming → «Altijd»: wachtend verzoek wordt uitgevoerd op de nieuwe toestemming, met een journaalregel', () => { const v = HV.staat.w.verzoeken.filter((x) => x.id === window.__vid)[0]; return v.stand === 'goedgekeurd' && v.viaStand === 'altijd' && v.uitkomst === 'uitgevoerd' && HV.staat.w.apparaten.laadpaal.st.laadt === true && !HV.staat.w.nu.some((n) => n.verzoek === v.id) && HV.staat.w.logboek.some((r) => r.doel === 'laadpaal' && r.maker.soort === 'optimalisatie' && r.toegestaan && r.toegestaan[1] === 'toestemming ‘Altijd’') && /Altijd/.test(HV.verzoekWoord(v)[1]); });
  // het verzoek van de agent («om 02:00 laden») is intussen zinloos: de auto laadt al — het vervalt vanzelf («is al zo»)
  await tot(() => HV.staat.w.verzoeken.filter((x) => x.id === 'v1')[0].stand === 'verlopen');
  await verwacht('verzoek dat zijn zin verloor (de auto laadt al) vervalt vanzelf met een journaalregel', () => { const v = HV.staat.w.verzoeken.filter((x) => x.id === 'v1')[0]; return v.stand === 'verlopen' && v.vervallen.reden === 'alzo' && !HV.staat.w.nu.some((n) => n.verzoek === 'v1') && HV.staat.w.logboek.some((r) => /^Verzoek vervallen: /.test(r.wat[1]) && /^is al zo/.test(r.waarom[1])); });
  // de maker trekt zijn eigen verzoek in
  await page.evaluate(async () => {
    HV.scenarios.start('avond');
    window.__weg = HV.verzoekIntrekken('v1', ['авто вже заряджене', 'de auto is al geladen']);
    window.__weg2 = HV.verzoekIntrekken('v1', ['ще раз', 'nog eens']);
  });
  await wacht(100);
  await verwacht('HV.verzoekIntrekken: de maker trekt zijn verzoek in — «verlopen» met reden, één keer', () => { const v = HV.staat.w.verzoeken.filter((x) => x.id === 'v1')[0]; return window.__weg === true && window.__weg2 === false && v.stand === 'verlopen' && v.vervallen.reden === 'ingetrokken' && /de auto is al geladen/.test(HV.verzoekWoord(v)[1]) && HV.staat.w.logboek[0].wat[1] === 'Verzoek ingetrokken: De auto om 02:00 laden' && HV.staat.w.logboek[0].maker.soort === 'agent'; });

  // wie beslist: de poort staat in HV.verzoek zelf — een gast of kind keurt niets goed, vanaf geen enkele knop;
  // de eigenaar keurt een kritieke actie alleen goed met de rail (en de herbevestiging)
  const kritiekVerzoek = async (rol) => {
    await page.evaluate(async (rol) => {
      HV.opslag.schrijf('rol', 'eigenaar'); HV.scenarios.start('avond'); HV.open('overzicht');
      await HV.gevaar.zetStand('claude', 'slot.ontgrendelen', 'vragen');
      const r = await HV.doe({ doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: false, door: { soort: 'agent', id: 'claude', naam: ['Агент Claude', 'Agent Claude'] } });
      window.__kv = r.verzoek;
      HV.toosten.slice().forEach((x) => HV.toostWeg(x.id));
      HV.opslag.schrijf('rol', rol); HV.teken();
    }, rol);
    await wacht(200);
  };
  for (const rol of ['gast', 'kind']) {
    await kritiekVerzoek(rol);
    await verwacht(`rol «${rol}»: in «Nu belangrijk» staat een slotregel in plaats van knoppen`, () => { const rij = document.querySelector('[data-k="nu-verzoek-' + window.__kv + '"]'); return !!rij && !rij.querySelector('[data-actie="verzoek-ja"]') && !rij.querySelector('[data-actie="verzoek-nee"]') && !!rij.querySelector('.hv-nu__slot'); });
    await page.evaluate(() => { HV.acties['verzoek-ja'](HV.ctx(), { verzoek: window.__kv }); return HV.verzoek(window.__kv, true).then((r) => { window.__gast = r; }); });
    await wacht(900);
    await verwacht(`rol «${rol}»: goedkeuren wordt geweigerd («De eigenaar beslist»), de deur blijft op slot, het verzoek wacht`, () => { const v = HV.staat.w.verzoeken.filter((x) => x.id === window.__kv)[0]; return !!window.__gast && window.__gast.ok === false && window.__gast.reden === 'rol' && v.stand === 'wacht' && HV.staat.w.apparaten.voordeurslot.st.vergrendeld === true && !HV.staat.w.apparaten.voordeurslot.wacht && !document.querySelector('.hv-gevaar') && HV.toosten.some((x) => /^(Вирішує власник|De eigenaar beslist)$/.test(HV.p(x.titel))); });
  }
  await kritiekVerzoek('eigenaar');
  await page.locator('[data-actie="verzoek-ja"][data-verzoek="' + await page.evaluate(() => window.__kv) + '"]').first().click();
  await page.waitForSelector('.hv-gevaar .hv-rail', { timeout: 5000 }).catch(() => {});
  await verwacht('eigenaar: «Eén keer goedkeuren» van een kritieke actie opent de rail; de deur is nog op slot', () => !!document.querySelector('.hv-gevaar .hv-rail') && HV.staat.w.apparaten.voordeurslot.st.vergrendeld === true && !HV.staat.w.apparaten.voordeurslot.wacht && HV.staat.w.verzoeken.filter((x) => x.id === window.__kv)[0].stand === 'wacht');
  await verwacht('kop van het dialoogvenster: «kritieke actie» / «критична дія» (niet «kritiek actie»)', () => /^(kritieke actie|критична дія)$/.test(document.querySelector('.hv-gevaar__kop .hv-risico').textContent.trim()));
  await page.keyboard.press('Escape');
  await tot(() => !document.querySelector('.hv-gevaar'));
  await verwacht('rail geannuleerd: niets uitgevoerd, het verzoek wacht nog', () => HV.staat.w.verzoeken.filter((x) => x.id === window.__kv)[0].stand === 'wacht' && HV.staat.w.apparaten.voordeurslot.st.vergrendeld === true && HV.staat.w.nu.some((n) => n.verzoek === window.__kv));

  // «Is al zo» geldt alleen voor een toestand die het huis zeker weet: bij een verouderde toestand gaat de opdracht wél
  await page.evaluate(async () => {
    HV.scenarios.start('avond');
    HV.staat.wijzig((w) => { w.apparaten.voordeurslot.beschikbaar = 'verouderd'; });
    const r = await HV.doe({ doel: 'voordeurslot', mogelijkheid: 'vergrendeld', waarde: true, zonderRitueel: true });
    const regel = HV.staat.w.logboek[0]; // (de lengte zegt niets: de geschiedenis van het journaal wordt pas bij het tekenen gezaaid)
    window.__oud = { r, regel: regel.doel === 'voordeurslot' && regel.maker.soort === 'mens' && regel.wat[1] === 'Slot voordeur: vergrendeld' };
  });
  await verwacht('slot met verouderde toestand: «vergrendelen» wordt verzonden en staat in het journaal (geen «Is al zo»)', () => !!window.__oud && window.__oud.r.ok === true && !window.__oud.r.ongewijzigd && window.__oud.regel === true);
  // melding zonder dubbele waarde: naam + één chip «was → werd»
  await page.evaluate(() => { HV.toosten.slice().forEach((x) => HV.toostWeg(x.id)); return HV.doe({ doel: 'torsher', mogelijkheid: 'helderheid', waarde: 35 }); });
  await wacht(200);
  await verwacht('melding van een wijziging: naam zonder waarde en één chip «was → werd»', () => { const e = document.querySelector('#hv-toosten .hv-toost__titel'); return !!e && !!e.querySelector('.hv-bericht__delta') && /^(Торшер|Staande lamp)$/.test(e.firstChild.textContent.trim()) && !document.querySelector('#hv-toosten .hv-toost__regel'); });

  // «Eerste start»: het journaal is echt leeg — ook de start van het scenario schrijft niets
  await page.evaluate(() => { HV.scenarios.start('eerstestart'); HV.open('activiteit'); });
  await wacht(200);
  await verwacht('scenario «eerste start»: het journaal is leeg', () => HV.staat.w.logboek.length === 0 && HV.logboek.ongelezen() === 0);
  await page.evaluate(() => { HV.scenarios.start('avond'); HV.open('overzicht'); });
  await wacht(150);

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
console.log(`[rook] ${tel.ladingen} ladingen · ${tel.routes} routes · ${tel.doelen} aanraakdoelen · ${tel.acties} data-acties · ${tel.klikproeven} klikproeven · ${tel.taalroutes} taalroutes · ${tel.afdrukken} schermafdrukken${UIT ? ' in ' + UIT : ''} · ${uniek.length} fout(en)`);
process.exit(uniek.length ? 1 : 0);
