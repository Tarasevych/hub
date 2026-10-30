// Bouwcontrole van de bestandskaart (24.10.2026, pakket 1 «Adaptive Mail Canvas»): de bronbestanden kregen Nederlandse namen;
// docs/kaart/bestandskaart.json zegt welk oud pad nu waar staat (voor mensen: docs/kaart/KAART-BESTANDEN.md).
// Wens van de eigenaar: «перейменувати всі файли нідерландською мовою, і щоб система знала де що».
//
// Fout (exit 1, de build stopt):
//   - een nieuw pad uit de kaart bestaat niet, of een oud pad bestaat weer;
//   - code, tests, scripts of de extensie verwijzen nog naar een oud pad ('src/GoogleMailWorkspace.tsx', ook zonder extensie).
//   - een bestand uit «toegevoegd» (bijgekomen na de hernoeming, met wat erin staat) bestaat niet meer — dan klopt de kaart niet.
// Waarschuwing (geen fout): een nieuw bestand met een Engels woord uit het woordenboek in de naam — met een Nederlandse suggestie.
// Bewust een oud pad noemen (zoals de test van deze kaart): zet «kaart:oud-toegestaan» op dezelfde regel.
//
// Gebruik: node scripts/kaart-controle.mjs [--stil]      ·      import { controleer } from './kaart-controle.mjs' (test)
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KAART = 'docs/kaart/bestandskaart.json';
const SCAN = ['src', 'backend', 'shared', 'server', 'tests', 'scripts', 'extension'];
const TEKST = /\.(tsx?|mts|mjs|cjs|js|css|json|sh|html|ps1|cmd)$/;
const GRENS_VOOR = '(?<![A-Za-z0-9_.\\-])';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function* bestanden(wortel, map) {
  let namen = [];
  try { namen = readdirSync(join(wortel, map)).sort(); } catch { return; }
  for (const n of namen) {
    if (n === 'node_modules' || n === 'dist' || n === 'dist-server') continue;
    const rel = map + '/' + n;
    const st = statSync(join(wortel, rel));
    if (st.isDirectory()) yield* bestanden(wortel, rel);
    else yield rel;
  }
}

/** Splitst een bestandsnaam in kleine woorden (kebab-case en PascalCase/camelCase). */
export function woordenVan(naam) {
  const stam = naam.replace(/(\.(test|e2e|spec|generated|d))?\.[a-z0-9]+$/i, '');
  return stam.split(/[-_.]/).flatMap((d) => d.match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+/g) || []).map((w) => w.toLowerCase());
}

/**
 * @param {string} wortel repo-wortel
 * @param {{ extra?: Record<string, string> }} [opties] extra: { pad: inhoud } — alleen voor de test (nep-bestand met een oude verwijzing)
 */
export function controleer(wortel = process.cwd(), opties = {}) {
  const kaart = JSON.parse(readFileSync(join(wortel, KAART), 'utf8'));
  const fouten = [], waarschuwingen = [];
  const hernoemd = kaart.bestanden.filter((x) => x.oud !== x.nieuw);
  for (const { oud, nieuw } of hernoemd) {
    if (!existsSync(join(wortel, nieuw))) fouten.push(`ontbreekt: ${nieuw} (was ${oud})`);
    if (existsSync(join(wortel, oud))) fouten.push(`oud pad bestaat weer: ${oud} (hoort: ${nieuw})`);
  }
  // Bijgekomen na de hernoeming (pakket 1 «Adaptive Mail Canvas» en later): de kaart noemt ze met wat erin staat — ze moeten bestaan.
  for (const t of kaart.toegevoegd || []) if (!t || !t.pad || !existsSync(join(wortel, t.pad))) fouten.push(`toegevoegd maar ontbreekt: ${t?.pad || '(leeg pad)'}`);
  // Per oud pad: volledig pad en (voor modules) zonder extensie; snelle voorfilter op de bestandsnaam.
  const patronen = hernoemd.map(({ oud, nieuw }) => {
    const stam = oud.replace(/\.(tsx|ts|mts|mjs|js)$/, '');
    const naam = oud.split('/').pop().split('.')[0];
    const delen = [esc(oud) + '(?![A-Za-z0-9_\\-])'];
    if (stam !== oud) delen.push(esc(stam) + '(?![A-Za-z0-9_\\-]|\\.[A-Za-z])');
    return { oud, nieuw, naam, re: new RegExp(GRENS_VOOR + '(?:' + delen.join('|') + ')') };
  });
  const teLezen = [];
  for (const m of SCAN) for (const rel of bestanden(wortel, m)) if (TEKST.test(rel)) teLezen.push(rel);
  const inhoud = (rel) => (opties.extra && rel in opties.extra ? opties.extra[rel] : readFileSync(join(wortel, rel), 'utf8'));
  for (const rel of [...teLezen, ...Object.keys(opties.extra || {})]) {
    if (rel === 'scripts/kaart-controle.mjs') continue;
    let s;
    try { s = inhoud(rel); } catch { continue; }
    // Regels met de markering «kaart:oud-toegestaan» noemen een oud pad bewust (bv. de test van deze kaart).
    if (s.includes('kaart:oud-toegestaan')) s = s.split('\n').filter((r) => !r.includes('kaart:oud-toegestaan')).join('\n');
    for (const p of patronen) if (s.includes(p.naam) && p.re.test(s)) fouten.push(`${rel}: verwijst nog naar ${p.oud} (nu: ${p.nieuw})`);
  }
  // Engelse woorden in nieuwe namen (alleen waarschuwing, met suggestie).
  const behouden = new Set((kaart.behouden || []).map((b) => b.pad));
  const woorden = kaart.woorden || {};
  // Alleen echt Engelse woorden: een woord dat zelf ook een Nederlandse vertaling is (bv. «map» = folder) telt niet.
  const nlWoorden = new Set(Object.values(woorden));
  for (const m of ['src', 'backend', 'shared', 'server', 'tests', 'scripts']) {
    for (const rel of bestanden(wortel, m)) {
      if (behouden.has(rel) || rel.startsWith('scripts/installer/')) continue;
      const naam = rel.split('/').pop();
      const eng = woordenVan(naam).filter((w) => woorden[w] && woorden[w] !== w && !nlWoorden.has(w));
      if (eng.length) waarschuwingen.push(`${rel}: Engels in de naam (${eng.map((w) => `${w} → ${woorden[w]}`).join(', ')})`);
    }
  }
  return { fouten, waarschuwingen, aantal: hernoemd.length, gelezen: teLezen.length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].split(sep).join(sep)) {
  const stil = process.argv.includes('--stil');
  const { fouten, waarschuwingen, aantal, gelezen } = controleer();
  for (const w of waarschuwingen) console.warn(`[kaart] waarschuwing: ${w}`);
  if (fouten.length) {
    for (const f of fouten.slice(0, 60)) console.error(`[kaart] FOUT ${f}`);
    console.error(`[kaart] ${fouten.length} fout(en) — zie ${KAART} en docs/kaart/KAART-BESTANDEN.md`);
    process.exit(1);
  }
  if (!stil) console.log(`[kaart] ${aantal} hernoemde bestanden in orde; ${gelezen} bestanden nagekeken${waarschuwingen.length ? `; ${waarschuwingen.length} waarschuwing(en)` : ''}`);
}
