// Samensteller van de klikbare maquette «Levend huis / Живий дім» (HUIS-001, етап 0).
//
// Leest docs/huis/maquette/stijl/hv-tokens.json (ЄДИНЕ джерело кольорів), plakt stijl/*.css en de scripts uit volgorde.json
// aan elkaar, zet de gebruikte lucide-iconen (ISC) er als SVG-symbolen in en schrijft één zelfstandig HTML-bestand.
//
// Gebruik:
//   node scripts/huis-maquette.mjs                       → docs/huis/maquette/huis-maquette.html (volledig document)
//   node scripts/huis-maquette.mjs --artefact <pad>      → variant «alleen inhoud» (zonder doctype/html/head/body)
//   node scripts/huis-maquette.mjs --controle            → statische controles zonder browser (exit 1 bij fouten)
//
// Geen afhankelijkheden buiten node en de map node_modules/lucide-react (alleen lezen).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const WORTEL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAP = join(WORTEL, 'docs/huis/maquette');
const LUCIDE = join(WORTEL, 'node_modules/lucide-react/dist/esm/icons');
const UIT = join(MAP, 'huis-maquette.html');
const TITEL = 'Макет «Живий дім»';

const lees = (pad) => readFileSync(pad, 'utf8');
const leesJson = (pad) => JSON.parse(lees(pad));

// ───────────────────────────── Tokens → CSS ─────────────────────────────

const blok = (selector, paren, inspringen = '') => {
  const regels = Object.entries(paren).map(([k, v]) => `${inspringen}  ${k}: ${v};`);
  return `${inspringen}${selector} {\n${regels.join('\n')}\n${inspringen}}`;
};

/** svh bestaat binnen het doek niet (het doek is een container, geen venster): cqh geeft dezelfde verhouding. */
const naarDoek = (waarde) => String(waarde).replace(/(\d)svh\b/g, '$1cqh');

export function tokensCss(tokens) {
  const uit = [];
  const { thema, aliassen, maten } = tokens;
  const klasse = { licht: '.theme-light', donker: '.theme-dark', inkt: '.theme-inkt' };

  // Werktokens van de hemel: geregistreerd, zodat de overgang echt interpoleert.
  const eigenschap = maten.hemel.eigenschap;
  for (const naam of maten.hemel.werktokens) {
    uit.push(`@property ${naam} { syntax: '${eigenschap.syntax}'; inherits: ${eigenschap.inherits}; initial-value: ${eigenschap.initialValue[naam]}; }`);
  }

  // Maten voor elk thema, aliassen, schaal.
  const alle = Object.fromEntries(Object.entries(maten.alle).map(([k, v]) => [k, naarDoek(v)]));
  for (const [alias, doel] of Object.entries(aliassen)) alle[alias] = `var(${doel})`;
  uit.push(blok('.hv-doek', alle));

  for (const [naam, sel] of Object.entries(klasse)) {
    uit.push(blok(sel, { ...thema[naam], ...(maten.thema[naam] || {}), 'color-scheme': naam === 'donker' ? 'dark' : 'light' }));
  }
  for (const [naam, paren] of Object.entries(maten.dichtheid)) uit.push(blok(`.hv-dicht-${naam}`, paren));
  for (const profiel of maten.profielen) {
    if (profiel.tokens) uit.push(blok(`.hv-profiel-${profiel.id}`, Object.fromEntries(Object.entries(profiel.tokens).map(([k, v]) => [k, naarDoek(v)]))));
  }

  // Terugval: effen glas (en soms geen hemel). De hemelstand zelf zet hemel.js als klasse; hier alleen de tokens.
  for (const regel of maten.terugval) {
    const als = regel.als;
    if (als.startsWith('@')) uit.push(`${als} {\n${blok('.hv-doek', regel.zet, '  ')}\n}`);
    else if (als === 'profiel tv') uit.push(blok('.hv-doek.hv-profiel-tv', regel.zet));
    else if (/^\.[a-z-]+$/.test(als)) uit.push(blok(`.hv-doek${als}`, regel.zet));
    // paletten «puur», «grifel», «violet» bestaan in de maquette niet: overgeslagen
  }
  // De inkt-maten moeten na de terugval blijven gelden.
  uit.push(blok('.hv-doek.theme-inkt', maten.thema.inkt));
  uit.push(`${maten.rustig.als} {\n${blok('.hv-doek', maten.rustig.zet, '  ')}\n}`);
  return uit.join('\n');
}

/** Kleuren van het bedieningspaneel (buiten het doek): tokens op :root, donker via media én via data-theme. */
export function pultCss(tokens) {
  const kies = (t) => ({
    '--mq-bg': t['--surface'], '--mq-vlak': t['--panel'], '--mq-put': t['--bg'], '--mq-lijn': t['--line'],
    '--mq-tekst': t['--text'], '--mq-zacht': t['--muted'], '--mq-accent': t['--accent'], '--mq-accent-tekst': t['--accentText'],
    '--mq-accent-zacht': t['--accent-soft'], '--mq-focus': t['--focus'], '--mq-gekozen': t['--surface2'],
  });
  const licht = kies(tokens.thema.licht);
  const donker = kies(tokens.thema.donker);
  licht['--mq-schaduw'] = tokens.maten.thema.licht['--schaduw-2'];
  donker['--mq-schaduw'] = tokens.maten.thema.donker['--schaduw-2'];
  return [
    blok(':root', { ...licht, 'color-scheme': 'light' }),
    `@media (prefers-color-scheme: dark) {\n${blok(':root:not([data-theme="light"])', { ...donker, 'color-scheme': 'dark' }, '  ')}\n}`,
    blok(':root[data-theme="dark"]', { ...donker, 'color-scheme': 'dark' }),
  ].join('\n');
}

// ───────────────────────────── Bronnen ─────────────────────────────

export function bronnen() {
  const volgorde = leesJson(join(MAP, 'volgorde.json'));
  // «stijl/schermen/*»: власний CSS-файл кожного екрана; так автори екранів не правлять спільних файлів стилів.
  const stijl = [];
  for (const naam of volgorde.stijl) {
    if (naam.endsWith('/*')) {
      const map = naam.slice(0, -2);
      if (!existsSync(join(MAP, map))) continue;
      for (const f of readdirSync(join(MAP, map)).filter((x) => x.endsWith('.css')).sort()) {
        const rel = `${map}/${f}`;
        if (!volgorde.stijl.includes(rel)) stijl.push({ naam: rel, pad: join(MAP, rel), inhoud: lees(join(MAP, rel)) });
      }
    } else stijl.push({ naam, pad: join(MAP, naam), inhoud: lees(join(MAP, naam)) });
  }
  const script = [];
  const gezien = new Set();
  for (const naam of volgorde.script) {
    if (naam.endsWith('/*')) {
      // «schermen/*»: alle overige bestanden van de map, op naam; zo voegt een nieuw schermbestand zich vanzelf in.
      const map = naam.slice(0, -2);
      for (const f of readdirSync(join(MAP, map)).filter((x) => x.endsWith('.js')).sort()) {
        const rel = `${map}/${f}`;
        if (!gezien.has(rel) && !volgorde.script.includes(rel)) { gezien.add(rel); script.push({ naam: rel, pad: join(MAP, rel), inhoud: lees(join(MAP, rel)) }); }
      }
    } else if (!gezien.has(naam)) {
      gezien.add(naam);
      script.push({ naam, pad: join(MAP, naam), inhoud: lees(join(MAP, naam)) });
    }
  }
  return { volgorde, stijl, script };
}

// ───────────────────────────── Iconen ─────────────────────────────

/** Elke tekenreeks in de scripts die precies een lucide-bestandsnaam is, wordt een symbool. Een icoon toevoegen = de naam gebruiken. */
export function iconenUit(scripts) {
  const namen = new Set();
  const re = /(['"`])([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\1/g;
  for (const s of scripts) {
    let m;
    while ((m = re.exec(s.inhoud))) if (existsSync(join(LUCIDE, `${m[2]}.js`))) namen.add(m[2]);
  }
  return [...namen].sort();
}

function symbool(naam) {
  const bron = lees(join(LUCIDE, `${naam}.js`));
  const begin = bron.indexOf('[', bron.indexOf('createLucideIcon('));
  const eind = bron.lastIndexOf(']);');
  const knopen = vm.runInNewContext(`(${bron.slice(begin, eind + 1)})`);
  const binnen = knopen.map(([tag, attrs]) => {
    const a = Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${a}/>`;
  }).join('');
  return `<symbol id="hv-i-${naam}" viewBox="0 0 24 24">${binnen}</symbol>`;
}

// ───────────────────────────── Samenstellen ─────────────────────────────

export function bouw({ artefact = false } = {}) {
  const tokens = leesJson(join(MAP, 'stijl/hv-tokens.json'));
  const { stijl, script } = bronnen();
  const iconen = iconenUit(script);
  const css = [
    '/* ── gegenereerd uit stijl/hv-tokens.json: enige plek met kleurwaarden ── */',
    pultCss(tokens),
    tokensCss(tokens),
    '/* ── einde gegenereerd blok ── */',
    ...stijl.map((s) => `/* ${s.naam} */\n${s.inhoud}`),
  ].join('\n');
  const profielen = tokens.maten.profielen.map(({ id, beeld, dichtheid, hemel, glas, gevaar, uitleg, thema, logisch, viaAdres, breedte }) => ({ id, beeld, dichtheid, hemel, glas, gevaar, uitleg, thema, logisch, viaAdres, breedte }));
  const vooraf = `window.HV = window.HV || {}; HV.bouw = ${JSON.stringify({ artefact, iconen, profielen, hemel: { klok: tokens.maten.hemel.klok, bewolkingMax: tokens.maten.hemel.bewolkingMax, mist: tokens.maten.hemel.mist, afwezig: tokens.maten.hemel.afwezig, mengselMax: tokens.maten.hemel.mengselMax, nachtstandDonker: tokens.maten.hemel.nachtstandDonker, nachtstandLicht: tokens.maten.hemel.nachtstandLicht }, gedrag: { nuMax: tokens.maten.gedrag.nuMax, toostMax: tokens.maten.gedrag.toostMax, zinKortMax: tokens.maten.gedrag.zinKortMax, wachtPerKlasse: (tokens.maten.gedrag.wachtPerKlasse || {}).bezig || null, tegelBesturingMin: parseInt(tokens.maten.gedrag.tegelBesturingMin, 10) || 224 } })};`;
  const js = [vooraf, ...script.map((s) => `/* ${s.naam} */\n${s.inhoud}`), 'HV.start();'].join('\n').replace(/<\/script/gi, '<\\/script');
  const sprite = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${iconen.map(symbool).join('')}</svg>`;
  const lijf = `${sprite}\n<div id="mq-wortel" class="mq-wortel"></div>\n<script>\n${js}\n</script>`;
  if (artefact) {
    return `<title>${TITEL}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>\n${css}\n</style>\n${lijf}\n`;
  }
  return `<!doctype html>\n<html lang="uk">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>${TITEL}</title>\n<style>\n${css}\n</style>\n</head>\n<body>\n${lijf}\n</body>\n</html>\n`;
}

// ───────────────────────────── Statische controles ─────────────────────────────

/** Taalregels uit tests/eenheid/hulp/taalcontrole.ts (lijst en logica), aangevuld met taal-toegestaan.json. */
function taalregels() {
  const eigen = leesJson(join(MAP, 'taal-toegestaan.json'));
  const toegestaan = new Set(eigen.latijn || []);
  let engels = null;
  const pad = join(WORTEL, 'tests/eenheid/hulp/taalcontrole.ts');
  if (existsSync(pad)) {
    const bron = lees(pad);
    const set = bron.match(/TOEGESTAAN = new Set\(\[([\s\S]*?)\]\);/);
    if (set) for (const m of set[1].matchAll(/'([^']+)'/g)) toegestaan.add(m[1]);
    const re = bron.match(/export const ENGELS = \/(.+)\/i;/);
    if (re) engels = new RegExp(re[1], 'i');
  }
  const schoon = (s) => s
    .replace(/"[^"]*"/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+/g, ' ')
    .replace(/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\/[^\s)]*)?/g, ' ')
    .replace(/[A-Za-z0-9.]+\/[A-Za-z0-9./-]+/g, ' ');
  const latijnseWoorden = (s) => (schoon(s).match(/[A-Za-z][A-Za-z0-9-]{3,}/g) ?? []).filter((w) => !toegestaan.has(w) && !toegestaan.has(w.replace(/-$/, '')));
  const nlUitzondering = new Set((eigen.nederlandsToegestaan || []).map((w) => w.toLowerCase()));
  const engelsIn = (s) => {
    if (!engels) return null;
    const m = schoon(s).match(engels);
    return m && !nlUitzondering.has(m[0].toLowerCase()) ? m[0] : null;
  };
  return { latijnseWoorden, engelsIn, gelijk: new Set(eigen.gelijkToegestaan || []) };
}

/** Tekenreeksliteralen van een t('…','…')-aanroep. Sjabloondelen ${…} verdwijnen vóór de taalcontrole. */
function tParen(bron) {
  const paren = [];
  const str = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|` + '`((?:[^`\\\\]|\\\\.)*)`';
  const re = new RegExp(String.raw`(?<![A-Za-z0-9_$.])(?:HV\.|ctx\.)?t\(\s*(?:${str})\s*,\s*(?:${str})\s*\)`, 'g');
  let m;
  while ((m = re.exec(bron))) {
    const uk = m[1] ?? m[2] ?? m[3];
    const nl = m[4] ?? m[5] ?? m[6];
    paren.push([uk, nl, bron.slice(0, m.index).split('\n').length]);
  }
  return paren;
}

const ontsjabloon = (s) => {
  // ${…} met geneste accolades weghalen
  let uit = '', diepte = 0;
  for (let i = 0; i < s.length; i++) {
    if (diepte === 0 && s[i] === '$' && s[i + 1] === '{') { diepte = 1; i++; uit += ' ◦ '; continue; }
    if (diepte > 0) { if (s[i] === '{') diepte++; else if (s[i] === '}') diepte--; continue; }
    uit += s[i];
  }
  return uit.replace(/\\n/g, ' ').replace(/\\(.)/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
};

/** Laadt gegevens-, kern- en schermmodules in een zandbak zonder DOM: registratie mag geen DOM nodig hebben. */
function laadRegister(script) {
  const niets = () => {};
  const element = () => new Proxy({}, { get: (d, k) => (k in d ? d[k] : (k === 'style' || k === 'dataset' || k === 'classList' ? element() : niets)), set: (d, k, v) => { d[k] = v; return true; } });
  const zandbak = {
    console, setTimeout: niets, clearTimeout: niets, setInterval: niets, clearInterval: niets, requestAnimationFrame: niets, cancelAnimationFrame: niets,
    document: { addEventListener: niets, getElementById: () => null, querySelector: () => null, createElement: element, documentElement: element(), body: element() },
    location: { hash: '' }, navigator: { userAgent: 'controle' }, matchMedia: () => ({ matches: false, addEventListener: niets }),
    addEventListener: niets, localStorage: { getItem: () => null, setItem: niets }, performance: { now: () => 0 }, Intl, Math, Date, JSON,
  };
  zandbak.window = zandbak; zandbak.globalThis = zandbak;
  vm.createContext(zandbak);
  const fouten = [];
  vm.runInContext('window.HV = window.HV || {}; HV.bouw = { artefact: false, iconen: [], profielen: [], hemel: { klok: { nacht: [22, 6], dageraad: [6, 9], dag: [9, 17], schemer: [17, 22], mengMinuten: 30 } }, gedrag: {} };', zandbak);
  for (const s of script) {
    try { vm.runInContext(s.inhoud, zandbak, { filename: s.naam }); } catch (e) { fouten.push(`${s.naam}: laadt niet zonder DOM — ${e.message}`); }
  }
  return { HV: zandbak.HV, fouten };
}

export function controleer() {
  const fouten = [];
  const meld = (f) => fouten.push(f);
  const tokens = leesJson(join(MAP, 'stijl/hv-tokens.json'));
  const { stijl, script, volgorde } = bronnen();
  const regels = taalregels();

  // 1. Geen kleurwaarden in de stijlbestanden: alleen var(--…).
  for (const s of stijl) {
    const zonderCommentaar = s.inhoud.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    zonderCommentaar.split('\n').forEach((regel, i) => {
      const hex = regel.match(/#[0-9a-fA-F]{3,8}\b/);
      if (hex) meld(`${s.naam}:${i + 1}: kleurwaarde ${hex[0]} buiten het tokenblok`);
      const fn = regel.match(/\b(?:rgba?|hsla?|oklch|oklab)\(/);
      if (fn) meld(`${s.naam}:${i + 1}: kleurfunctie ${fn[0]}…) buiten het tokenblok`);
    });
    if (/@media[^{]*\b(?:min|max)-(?:width|height)/.test(zonderCommentaar)) meld(`${s.naam}: @media op breedte of hoogte — gebruik @container`);
    // Typografie (§5): gewichten alleen 400/500/600/700 (of een token); tekst nooit kleiner dan 12 px.
    // Op de hemel alleen --text (§3): --muted en --faint zijn daar verboden.
    const HEMEL = /\.hv-(?:held(?:__[a-z]+)?|doorsnede__(?:label|wissel)|blok__(?:samenvatting|pijl|naam)|pagina__(?:zin|titel)|kamerkop__sub|scene__(?:actief|naam)|terug|strook__datum|tv__datum|gezicht__bijschrift)\b(?![-\w])/;
    for (const m of zonderCommentaar.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim(), lijf = m[2];
      const regel = zonderCommentaar.slice(0, m.index).split('\n').length;
      const gewicht = lijf.match(/font-weight:\s*([^;]+)/);
      if (gewicht && !/^(?:400|500|600|700|normal|bold|inherit|var\(--[\w-]+\))$/.test(gewicht[1].trim())) meld(`${s.naam}:${regel}: font-weight ${gewicht[1].trim()} buiten 400/500/600/700 (§5)`);
      const maat = lijf.match(/font-size:\s*(\d+(?:\.\d+)?)px/);
      if (maat && Number(maat[1]) < 12 && !selector.startsWith('.mq-')) meld(`${s.naam}:${regel}: font-size ${maat[1]}px kleiner dan 12 px (§5)`);
      if (/color:\s*var\(--(?:muted|faint)\)/.test(lijf.replace(/[\w-]*(?:background|border|outline|stroke|fill|decoration)[\w-]*-?color:[^;]+;?/g, '')) && selector.split(',').some((x) => HEMEL.test(x) && !/\.hv-(?:kaart|tegel|chip|laag|som|nu)\b/.test(x))) meld(`${s.naam}:${regel}: --muted op de hemel in «${selector.slice(0, 60)}» — alleen --text (§3)`);
    }
  }

  // 2. Tekstparen: beide talen aanwezig, niet gelijk, taalwet.
  let aantalParen = 0;
  const keurPaar = (waar, ukRuw, nlRuw) => {
    aantalParen++;
    const uk = ontsjabloon(String(ukRuw)).trim();
    const nl = ontsjabloon(String(nlRuw)).trim();
    if (!uk || !nl) { if (uk !== nl) meld(`${waar}: een van de talen is leeg`); return; }
    const heeftLetters = /[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(uk.replace(/◦/g, ''));
    if (uk === nl && heeftLetters && !regels.gelijk.has(uk)) {
      const woorden = uk.match(/[A-Za-zА-Яа-яІіЇїЄєҐґ][A-Za-zА-Яа-яІіЇїЄєҐґ0-9'’-]*/g) || [];
      if (/[А-Яа-яІіЇїЄєҐґ]/.test(uk) || regels.latijnseWoorden(uk).length || woorden.some((w) => w.length > 3 && !regels.gelijk.has(w) && regels.latijnseWoorden(w).length)) meld(`${waar}: beide talen gelijk «${uk}»`);
    }
    if (/[А-Яа-яІіЇїЄєҐґ]/.test(nl)) meld(`${waar} nl: cyrillisch in de Nederlandse tekst «${nl.slice(0, 40)}»`);
    const lat = regels.latijnseWoorden(uk);
    if (lat.length) meld(`${waar} uk: Latijn «${lat.join(', ')}» in «${uk.slice(0, 60)}»`);
    const eng = regels.engelsIn(nl);
    if (eng) meld(`${waar} nl: Engels «${eng}» in «${nl.slice(0, 60)}»`);
  };
  for (const s of script) for (const [uk, nl, regel] of tParen(s.inhoud)) keurPaar(`${s.naam}:${regel}`, uk, nl);

  // 3. Register: schermen, tabbladen, bladen, navigatie, gevaarlijke acties, gegevensparen.
  const { HV, fouten: laadFouten } = laadRegister(script);
  laadFouten.forEach(meld);
  const gezien = new WeakSet();
  const loop = (waar, x, diepte) => {
    if (!x || typeof x !== 'object' || diepte > 9 || gezien.has(x)) return;
    gezien.add(x);
    if (Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'string' && /[А-Яа-яІіЇїЄєҐґ]/.test(x[0])) { keurPaar(waar, x[0], x[1]); return; }
    for (const k of Object.keys(x)) { let v; try { v = x[k]; } catch { continue; } if (typeof v === 'object') loop(`${waar}.${k}`, v, diepte + 1); }
  };
  if (HV) {
    for (const naam of ['paspoort', 'scenarios', 'tarief', 'teksten']) if (HV[naam]) loop(`gegevens ${naam}`, HV[naam], 0);
    if (HV.gevaar) loop('kern gevaar', HV.gevaar, 0);
    if (HV.secties) loop('kern secties', HV.secties, 0);

    const schermen = HV.schermen ? Object.values(HV.schermen) : [];
    if (!schermen.length) meld('geen enkel scherm geregistreerd');
    const idRe = /^[a-z][a-z0-9]*$/;
    const verboden = new Set(['settings', 'sidebar', 'customize', 'upgrade', 'downloads', 'comment', 'blad']);
    const schermIds = new Set();
    let aantalTabs = 0, voorlopig = 0;
    for (const s of schermen) {
      if (schermIds.has(s.id)) meld(`scherm «${s.id}» dubbel`);
      schermIds.add(s.id);
      if (!idRe.test(s.id) || verboden.has(s.id)) meld(`scherm «${s.id}»: id mag alleen kleine letters en cijfers bevatten en geen gereserveerd woord zijn`);
      loop(`scherm ${s.id}`, { titel: s.titel, wat: s.wat }, 0);
      if (!Array.isArray(s.titel) || s.titel.length !== 2) meld(`scherm «${s.id}»: titel moet [uk, nl] zijn`);
      if (typeof s.adres !== 'string' || !s.adres.startsWith('/')) meld(`scherm «${s.id}»: adres ontbreekt`);
      const tabIds = new Set();
      for (const tab of s.tabs || []) {
        aantalTabs++;
        if (tabIds.has(tab.id)) meld(`scherm «${s.id}»: tabblad «${tab.id}» dubbel`);
        tabIds.add(tab.id);
        if (!idRe.test(tab.id) || verboden.has(tab.id)) meld(`scherm «${s.id}»: tabblad-id «${tab.id}» ongeldig`);
        if (typeof tab.render !== 'function') meld(`scherm «${s.id}»: tabblad «${tab.id}» zonder render`);
        if (tab.voorlopig) voorlopig++;
        loop(`scherm ${s.id} tab ${tab.id}`, { titel: tab.titel, wat: tab.wat }, 0);
      }
      if (!(s.tabs && s.tabs.length) && typeof s.render !== 'function') meld(`scherm «${s.id}»: geen render en geen tabbladen`);
    }
    for (const sectie of HV.secties || []) if (!schermIds.has(sectie.scherm)) meld(`navigatiepunt «${sectie.id}» wijst naar onbekend scherm «${sectie.scherm}»`);

    const bladen = HV.bladen || [];
    const bladSoorten = new Set();
    for (const b of bladen) {
      if (bladSoorten.has(b.soort)) meld(`blad «${b.soort}» dubbel`);
      bladSoorten.add(b.soort);
      if (!idRe.test(b.soort)) meld(`blad «${b.soort}»: soort mag alleen kleine letters en cijfers bevatten`);
    }
    // Elk apparaat van het paspoort moet een blad vinden.
    const apparaten = HV.paspoort && HV.paspoort.apparaten ? HV.paspoort.apparaten : [];
    const apparaatIds = new Set();
    for (const a of apparaten) {
      if (apparaatIds.has(a.id)) meld(`apparaat «${a.id}» dubbel`);
      apparaatIds.add(a.id);
      if (!idRe.test(a.id)) meld(`apparaat «${a.id}»: id mag alleen kleine letters en cijfers bevatten`);
      if (HV.bladVoor && !HV.bladVoor(a)) meld(`apparaat «${a.id}» (${a.soort}): geen blad past`);
    }

    // Gevaarlijke en kritieke acties: gevolgtekst verplicht.
    const acties = HV.gevaar && HV.gevaar.acties ? HV.gevaar.acties : [];
    let zwaar = 0;
    for (const a of acties) {
      if (a.niveau === 'gevaarlijk' || a.niveau === 'kritiek') {
        zwaar++;
        if (!Array.isArray(a.gevolg) || !a.gevolg[0] || !a.gevolg[1]) meld(`actie «${a.sleutel}» (${a.niveau}): gevolgtekst ontbreekt`);
        if (!Array.isArray(a.risico) || !a.risico[0] || !a.risico[1]) meld(`actie «${a.sleutel}» (${a.niveau}): uitleg bij «!» ontbreekt`);
      }
      if (!['gewoon', 'gevoelig', 'gevaarlijk', 'kritiek'].includes(a.niveau)) meld(`actie «${a.sleutel}»: onbekend niveau «${a.niveau}»`);
    }
    // Standaardtoestemming is voor elke uitvoerder «uit».
    if (HV.gevaar && HV.gevaar.standaardStand && HV.gevaar.standaardStand() !== 'uit') meld('standaardtoestemming is niet «uit»');

    const scenarios = HV.scenarios && HV.scenarios.lijst ? HV.scenarios.lijst : [];
    if (scenarios.length !== 15) meld(`scenario's: ${scenarios.length} in plaats van 15`);

    controleer.cijfers = { schermen: schermen.length, tabbladen: aantalTabs, voorlopig, bladen: bladen.length, apparaten: apparaten.length, acties: acties.length, zwaar, scenarios: scenarios.length };
  }

  // 4. Iconen: elke HV.icoon('naam') moet bestaan (lucide of eigen teken).
  const eigen = new Set(HV && HV.eigenIconen ? Object.keys(HV.eigenIconen) : []);
  for (const s of script) {
    for (const m of s.inhoud.matchAll(/\b(?:HV\.)?icoon\(\s*'([a-z0-9-]+)'/g)) {
      if (!eigen.has(m[1]) && !existsSync(join(LUCIDE, `${m[1]}.js`))) meld(`${s.naam}: icoon «${m[1]}» bestaat niet in lucide en is geen eigen teken`);
    }
    // Geen blokkerende vensters, geen kale opslag, geen externe adressen.
    const kaal = s.inhoud.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/\b(?:alert|confirm|prompt)\s*\(/.test(kaal.replace(/\.(?:alert|confirm|prompt)\b/g, ''))) meld(`${s.naam}: alert/confirm/prompt is niet toegestaan`);
    if (/https?:\/\/(?!huis\.tarasevych\.com)/.test(kaal.replace(/http:\/\/www\.w3\.org\/[0-9a-z/]+/g, ''))) meld(`${s.naam}: extern adres in de code`);
    if (/\b(?:mailto|tel):/.test(kaal)) meld(`${s.naam}: mailto/tel is niet toegestaan`);
    if (s.naam !== 'kern/opslag.js' && /\blocalStorage\b/.test(kaal)) meld(`${s.naam}: localStorage alleen via HV.opslag (kern/opslag.js, met try/catch)`);
  }

  // 5. Volgorde: elk bestand bestaat, niets dubbel; de artefactvariant voldoet aan de vorm.
  for (const naam of volgorde.stijl) if (!naam.endsWith('/*') && !existsSync(join(MAP, naam))) meld(`volgorde.json: ${naam} ontbreekt`);
  const art = bouw({ artefact: true });
  if (!art.startsWith(`<title>${TITEL}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>`)) meld('artefact: begint niet met title, meta en style');
  if (/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(art)) meld('artefact: bevat doctype/html/head/body');
  if (/https?:\/\/(?!www\.w3\.org|huis\.tarasevych\.com)/.test(art)) meld('artefact: extern adres in het bestand');

  // 6. Tokens: thema's volledig.
  const sleutels = Object.keys(tokens.thema.licht);
  for (const naam of ['donker', 'inkt']) for (const k of sleutels) if (!(k in tokens.thema[naam])) meld(`tokens: ${k} ontbreekt in thema ${naam}`);

  return { fouten, paren: aantalParen, cijfers: controleer.cijfers || {} };
}

// ───────────────────────────── Opdrachtregel ─────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args.includes('--controle')) {
    const { fouten, paren, cijfers } = controleer();
    for (const f of fouten.slice(0, 200)) console.error(`[maquette] FOUT ${f}`);
    const c = cijfers;
    console.log(`[maquette] controle: ${paren} tekstparen · ${c.schermen ?? 0} schermen · ${c.tabbladen ?? 0} tabbladen (${c.voorlopig ?? 0} voorlopig) · ${c.bladen ?? 0} bladen · ${c.apparaten ?? 0} apparaten · ${c.acties ?? 0} acties (${c.zwaar ?? 0} gevaarlijk of kritiek) · ${c.scenarios ?? 0} scenario's · ${fouten.length} fout(en)`);
    process.exit(fouten.length ? 1 : 0);
  }
  const i = args.indexOf('--artefact');
  if (i >= 0) {
    const pad = resolve(args[i + 1] || '');
    if (!args[i + 1]) { console.error('[maquette] --artefact vraagt een pad'); process.exit(1); }
    mkdirSync(dirname(pad), { recursive: true });
    const html = bouw({ artefact: true });
    writeFileSync(pad, html);
    console.log(`[maquette] artefact: ${pad} (${(Buffer.byteLength(html) / 1024).toFixed(0)} kB)`);
  } else {
    // «--naar <pad>»: повний документ в інше місце (паралельна робота кількох авторів екранів без перезапису спільного файлу).
    const j = args.indexOf('--naar');
    if (j >= 0 && !args[j + 1]) { console.error('[maquette] --naar vraagt een pad'); process.exit(1); }
    const doel = j >= 0 ? resolve(args[j + 1]) : UIT;
    mkdirSync(dirname(doel), { recursive: true });
    const html = bouw();
    writeFileSync(doel, html);
    console.log(`[maquette] ${doel} (${(Buffer.byteLength(html) / 1024).toFixed(0)} kB)`);
  }
}
