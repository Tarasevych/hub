// Bouwcontrole van de zwevende knoppen (25.10.2026, «захист росту»): zones en gniezda (shared/plaatsing.ts) blijven kloppen terwijl
// de site groeit. Eigenaar: «інші кнопки на інших сторінках можуть конфліктувати», «кожен простір не буде розтягуватися безмірно».
//
// Fout (exit 1, de build stopt):
//   1. catalogus: elke knop heeft zones, een standaardplaats per apparaatklasse die bestaat en hem toelaat, een naam in uk en nl;
//      met de standaard staat op elke soort pagina elke knop op zijn standaardplek en is geen zone voller dan haar gniezda.
//   2. maten: de getallen van de actiestapel in src/plaatsing/plaatsing.css zijn dezelfde als in het model (gniezdo, gat, rand,
//      iframe-inzet) — het vensterdok en de tests rekenen ermee.
//   3. componenten: elke knop uit de catalogus wordt precies één keer getekend via <Plek knop='…'>, en <Plek> kent geen knop buiten
//      de catalogus.
//   4. nieuwe vaste elementen: een CSS-regel met position:fixed die er op 25.10.2026 nog niet was (lijst: scripts/plaatsing-vaste-
//      elementen.json). Een zwevende KNOP hoort in een zone (catalogus + <Plek>); een venster, paneel of balk mag erbij in
//      «toegestaan», met de reden.
//   5. koppen van vensters (2.5, 25.10.2026 — «дзвоник перекриває кнопки вікна»): geen VASTE reserve voor de bovenbalk in de kop van
//      een venster (leesvenster, bijlage, «Новий лист», venster van het platform), zoals vroeger padding-right:4.75rem — die dekte alleen
//      de foto, niet de bel, de volgorde, zoom of menu rechts. Een rechterruimte (padding/margin-right, -inline-end, right) groter dan
//      24 px zonder de gemeten ruimte (var(--plaats-boven-…), src/plaatsing/plaatsing-staat.ts) is een fout; een oude regel van een ander
//      team mag tijdelijk in «kopReserves» van de lijst, met de reden.
// Gebruik: node scripts/plaatsing-controle.mjs [--stil] [--lijst]      ·      import { controleer } from './plaatsing-controle.mjs'
//   --lijst: schrijft de huidige vaste regels als «bestaand» (alleen bij het invoeren van deze controle gebruikt).
import { build } from 'esbuild';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LIJST = 'scripts/plaatsing-vaste-elementen.json';
const LAAG = 'src/plaatsing/plaatsing.css';

function* bestanden(wortel, map, filter) {
  let namen = [];
  try { namen = readdirSync(join(wortel, map)).sort(); } catch { return; }
  for (const n of namen) {
    if (n === 'node_modules' || n === 'dist' || n === 'dist-server') continue;
    const rel = map + '/' + n;
    const st = statSync(join(wortel, rel));
    if (st.isDirectory()) yield* bestanden(wortel, rel, filter);
    else if (filter.test(n)) yield rel;
  }
}

/** Alle stijlregels uit CSS (ook in @media/@supports): [{ selector, context, blok }] — blok = de declaraties. Commentaar telt niet. */
export function cssRegels(css) {
  const s = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const uit = [], ctx = [];
  let i = 0, kop = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '{') {
      const k = kop.trim().replace(/\s+/g, ' ');
      kop = '';
      if (k.startsWith('@') && !/^@(font-face|keyframes|-webkit-keyframes|page|property)\b/.test(k)) { ctx.push(k); i++; continue; }
      // blok met declaraties (of @keyframes/@font-face): lees tot de bijbehorende }
      let diepte = 1, j = i + 1;
      while (j < s.length && diepte) { if (s[j] === '{') diepte++; else if (s[j] === '}') diepte--; j++; }
      if (!k.startsWith('@')) uit.push({ selector: k, context: ctx.join(' '), blok: s.slice(i + 1, j - 1) });
      i = j; continue;
    }
    if (c === '}') { ctx.pop(); kop = ''; i++; continue; }
    if (c === ';' && kop.trim().startsWith('@')) { kop = ''; i++; continue; } // @import …;
    kop += c; i++;
  }
  return uit;
}
/** Regels met position:fixed uit CSS (ook in @media/@supports): [{ selector, context }]. Commentaar telt niet. */
export function vasteRegels(css) {
  return cssRegels(css).filter((r) => /(^|[;{\s])position\s*:\s*fixed\b/.test(r.blok)).map(({ selector, context }) => ({ selector, context }));
}
const sleutelVan = (bestand, r) => `${bestand} :: ${r.context ? r.context + ' ' : ''}${r.selector}`;

// ---- 5. koppen van vensters
/** Koppen van vensters die onder (of naast) de zones van de zwevende knoppen kunnen liggen — en alles erin (kind of afstammeling:
 *  «.google-mail-reader>header» én «.google-mail-reader header»; niet de kop van een brief diep in het gesprek). */
export const VENSTER_KOPPEN = /(\.google-mail-reader|\.google-mail-attachment-preview(\[[^\]]*\])*|\.mail-new-message)\s*(>\s*)?header(?![\w-])|\.venster-kop(?![\w-])/;
/** Vanaf hoeveel px een rechterruimte een reserve is (gewone binnenruimte van een kop is 8–16 px). */
export const RESERVE_GRENS = 24;
/** Delen van een waarde op het hoogste niveau (spaties buiten haakjes): «calc(a + b) 12px» → ['calc(a + b)', '12px']. */
const delen = (v) => { const uit = []; let d = 0, cur = ''; for (const ch of v.trim()) { if (ch === '(') d++; if (ch === ')') d--; if (/\s/.test(ch) && !d) { if (cur) uit.push(cur); cur = ''; } else cur += ch; } if (cur) uit.push(cur); return uit; };
/** De grootste vaste lengte in een waarde, in px (rem/em × 16); 0 als er geen is. */
const grootsteLengte = (v) => Math.max(0, ...[...v.matchAll(/(-?\d*\.?\d+)(px|rem|em)\b/g)].map((m) => Number(m[1]) * (m[2] === 'px' ? 1 : 16)));
/** Vaste reserves rechts in de koppen van vensters: [{ sleutel, eigenschap, waarde, px }]. Zuiver (getest). */
export function kopReserves(bestand, css) {
  const uit = [];
  for (const r of cssRegels(css)) {
    if (!VENSTER_KOPPEN.test(r.selector)) continue;
    for (const m of r.blok.matchAll(/(?:^|;)\s*(padding|padding-right|padding-inline|padding-inline-end|margin|margin-right|margin-inline|margin-inline-end|right|inset-inline-end)\s*:\s*([^;]+)/g)) {
      const eigenschap = m[1], waarde = m[2].replace(/!important\s*$/, '').trim();
      if (/--plaats-boven-/.test(waarde)) continue; // gemeten ruimte van de laag
      const d = delen(waarde);
      const rechts = /^(padding|margin)$/.test(eigenschap) ? (d[1] ?? d[0] ?? '') : /-inline$/.test(eigenschap) ? (d[1] ?? d[0] ?? '') : waarde;
      const px = grootsteLengte(rechts);
      if (px > RESERVE_GRENS) uit.push({ sleutel: `${sleutelVan(bestand, r)} :: ${eigenschap}`, eigenschap, waarde, px });
    }
  }
  return uit;
}

async function laadModel(wortel) {
  const r = await build({ entryPoints: [join(wortel, 'shared/plaatsing.ts')], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
}

/**
 * @param {string} wortel repo-wortel
 * @param {{ extra?: Record<string, string> }} [opties] extra: { pad: inhoud } — alleen voor de test (nep-CSS, nep-component)
 */
export async function controleer(wortel = process.cwd(), opties = {}) {
  const fouten = [], m = await laadModel(wortel);
  const lees = (rel) => (opties.extra && rel in opties.extra ? opties.extra[rel] : readFileSync(join(wortel, rel), 'utf8'));
  // ---- 1. catalogus
  const paginas = (k) => [{ klasse: k, dienst: 'mail', zoekInMenu: true }, { klasse: k, dienst: 'hub', zoekInMenu: false }, ...Object.keys(m.DIENST_BOVEN).filter((d) => d !== 'mail').map((d) => ({ klasse: k, dienst: d, zoekInMenu: false }))];
  for (const knop of m.KNOPPEN) {
    if (!m.KNOP_ZONES[knop]?.length) fouten.push(`catalogus: knop «${knop}» heeft geen zones (KNOP_ZONES)`);
    if (!m.KNOP_NAAM[knop]?.uk || !m.KNOP_NAAM[knop]?.nl) fouten.push(`catalogus: knop «${knop}» heeft geen naam in uk en nl (KNOP_NAAM)`);
    for (const k of m.KLASSEN) {
      const std = m.STANDAARD[k]?.[knop];
      if (!std) { fouten.push(`catalogus: knop «${knop}» heeft geen standaardplaats op ${k}`); continue; }
      if (!m.KNOP_ZONES[knop].includes(std.zone)) fouten.push(`catalogus: standaardzone «${std.zone}» van «${knop}» (${k}) laat de knop niet toe`);
      if (!m.PLAATSEN[std.zone]?.[k]) fouten.push(`catalogus: standaardzone «${std.zone}» van «${knop}» bestaat niet op ${k}`);
    }
  }
  for (const z of m.ZONES) if (!m.ZONE_NAAM[z]?.uk || !m.ZONE_NAAM[z]?.nl) fouten.push(`catalogus: zone «${z}» heeft geen naam in uk en nl`);
  for (const k of m.KLASSEN) for (const ctx of paginas(k)) {
    const ind = m.indeling(m.standaardPlaatsing(), ctx);
    for (const z of m.ZONES) {
      const n = m.bezet(ind.zones[z]), max = m.PLAATSEN[z][k];
      if (n > max) fouten.push(`ruimte: ${z} op ${k} (${ctx.dienst}) heeft ${n} van ${max} gniezda bezet met de standaard — zone te vol`);
    }
    for (const knop of m.KNOPPEN.filter((x) => m.knopAanwezig(x, ctx))) {
      if (ind.plek[knop] !== m.STANDAARD[k][knop].zone) fouten.push(`ruimte: «${knop}» staat op ${k} (${ctx.dienst}) niet op zijn standaardplek ${m.STANDAARD[k][knop].zone} maar in ${ind.plek[knop] || '(nergens)'} — een zone is vol`);
    }
  }
  // ---- 2. maten van de stapel: CSS = model
  const laag = lees(LAAG).replace(/\/\*[\s\S]*?\*\//g, '');
  const varVan = (sel, naam) => { const r = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}').exec(laag); const v = r && new RegExp(`${naam}:(\\d+)px`).exec(r[1]); return v ? Number(v[1]) : NaN; };
  const basis = '.plaats-actiestapel', tel = ".plaats-actiestapel[data-plaats-klasse='telefoon']", tab = ".plaats-actiestapel[data-plaats-klasse='tablet']";
  const verwacht = [
    ['gniezdo computer', varVan(basis, '--plaats-gniezdo'), m.STAPEL_GNIEZDO.computer], ['gniezdo tablet (= computer)', varVan(basis, '--plaats-gniezdo'), m.STAPEL_GNIEZDO.tablet],
    ['gniezdo telefoon', varVan(tel, '--plaats-gniezdo'), m.STAPEL_GNIEZDO.telefoon], ['rand computer', varVan(basis, '--plaats-rand'), m.STAPEL_RAND.computer],
    ['rand tablet', varVan(tab, '--plaats-rand'), m.STAPEL_RAND.tablet], ['rand telefoon', varVan(tel, '--plaats-rand'), m.STAPEL_RAND.telefoon],
    ['gat', varVan(basis, '--plaats-gat'), m.STAPEL_GAT], ['iframe-inzet', varVan(".canonical-chrome[data-plaats-iframe='ja'] .plaats-actiestapel", '--plaats-inzet'), m.IFRAME_INZET],
  ];
  for (const [wat, css, model] of verwacht) if (css !== model) fouten.push(`maten: ${wat} — CSS ${Number.isNaN(css) ? '(niet gevonden)' : css + ' px'} ≠ model ${model} px (${LAAG} ↔ shared/plaatsing.ts)`);
  // ---- 3. componenten: <Plek knop='…'>
  const bronnen = [...bestanden(wortel, 'src', /\.tsx$/), ...Object.keys(opties.extra || {}).filter((p) => p.endsWith('.tsx') && p.startsWith('src/'))];
  const gebruik = new Map();
  for (const rel of new Set(bronnen)) {
    let s; try { s = lees(rel); } catch { continue; }
    for (const x of s.matchAll(/<Plek knop=['"]([a-z-]+)['"]/g)) gebruik.set(x[1], [...(gebruik.get(x[1]) || []), rel]);
  }
  for (const [knop, waar] of gebruik) if (!m.KNOPPEN.includes(knop)) fouten.push(`componenten: <Plek knop='${knop}'> in ${waar.join(', ')} — die knop staat niet in de catalogus (shared/plaatsing.ts: KNOPPEN, KNOP_ZONES, STANDAARD)`);
  for (const knop of m.KNOPPEN) {
    const waar = gebruik.get(knop) || [];
    if (waar.length !== 1) fouten.push(`componenten: knop «${knop}» wordt ${waar.length}× getekend via <Plek> (${waar.join(', ') || 'nergens'}) — precies één keer`);
  }
  // ---- 4. nieuwe vaste elementen
  const lijst = JSON.parse(lees(LIJST));
  const bekend = new Set([...(lijst.bestaand || []), ...(lijst.toegestaan || []).map((t) => t.sleutel)]);
  const nu = [];
  const cssBestanden = [...bestanden(wortel, 'src', /\.css$/), ...Object.keys(opties.extra || {}).filter((p) => p.endsWith('.css') && p.startsWith('src/'))];
  for (const rel of new Set(cssBestanden)) {
    let s; try { s = lees(rel); } catch { continue; }
    for (const r of vasteRegels(s)) nu.push(sleutelVan(rel, r));
  }
  for (const k of nu) if (!bekend.has(k) && !k.startsWith(`${LAAG} :: `)) {
    fouten.push(`vast element: ${k}\n      → nieuwe position:fixed-regel. Een zwevende KNOP hoort in een zone: zet hem in de catalogus (shared/plaatsing.ts) en teken hem via <Plek knop='…'>. Een venster, paneel of balk (geen knop): zet de sleutel in «toegestaan» van ${LIJST}, met de reden.`);
  }
  // ---- 5. koppen van vensters: geen vaste reserve voor de bovenbalk
  const oudeReserves = new Set((lijst.kopReserves || []).map((t) => t.sleutel));
  const reserves = [];
  for (const rel of new Set(cssBestanden)) {
    let s; try { s = lees(rel); } catch { continue; }
    reserves.push(...kopReserves(rel, s));
  }
  for (const r of reserves) if (!oudeReserves.has(r.sleutel)) {
    fouten.push(`kopreserve: ${r.sleutel}: ${r.waarde}\n      → vaste ruimte (${r.px} px) rechts in de kop van een venster. De bovenbalk is geen vaste maat (foto, bel, «Написати», zoeken, volgorde, zoom, menu rechts): gebruik de GEMETEN ruimte van de laag — padding-right:calc(var(--plaats-boven-reserve) + 14px) voor een kop bovenaan, top:max(…, var(--plaats-boven-onder)) voor een venster onder de balk (src/plaatsing/plaatsing-staat.ts meet de zone). Een oude regel van een ander team: tijdelijk in «kopReserves» van ${LIJST}, met de reden.`);
  }
  return { fouten, aantalVast: nu.length, knoppen: m.KNOPPEN.length, nu, reserves };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].split(sep).join(sep)) {
  const stil = process.argv.includes('--stil');
  if (process.argv.includes('--lijst')) {
    const { nu } = await controleer(process.cwd(), { extra: { [LIJST]: '{"bestaand":[],"toegestaan":[]}' } });
    const oud = (() => { try { return JSON.parse(readFileSync(LIJST, 'utf8')); } catch { return {}; } })();
    const uitleg = 'CSS-regels met position:fixed die er op 25.10.2026 al waren (vóór de laag src/plaatsing/plaatsing.css). Een nieuwe regel laat de build stoppen (scripts/plaatsing-controle.mjs): een knop hoort in een zone; een venster/paneel/balk komt in «toegestaan» met de reden.';
    writeFileSync(LIJST, JSON.stringify({ versie: 1, datum: '2026-10-25', uitleg, bestaand: [...new Set(nu.filter((k) => !k.startsWith(`${LAAG} :: `)))].sort(), toegestaan: oud.toegestaan || [], ...(oud.kopReserves ? { kopReserves: oud.kopReserves } : {}) }, null, 1) + '\n');
    console.log(`[plaatsing] ${LIJST}: ${nu.length} vaste regels vastgelegd`);
    process.exit(0);
  }
  const { fouten, aantalVast, knoppen } = await controleer();
  if (fouten.length) {
    for (const f of fouten.slice(0, 40)) console.error(`[plaatsing] FOUT ${f}`);
    console.error(`[plaatsing] ${fouten.length} fout(en) — zones en gniezda: shared/plaatsing.ts, ${LAAG}`);
    process.exit(1);
  }
  if (!stil) console.log(`[plaatsing] ${knoppen} knoppen in de catalogus in orde; ${aantalVast} vaste CSS-regels bekend`);
}
