// Vite-plugin (23.10.2026): twee kant-en-klare browserbundels van derden ONGEWIJZIGD naast de build zetten in plaats van ze door Rollup
// te laten ontleden en opnieuw te minificeren.
//
// Waarom: `vite build` liep op 22–23.10 tegen de heaplimiet van de installer (BOUW_HEAP_MB=2560; FATAL «JavaScript heap out of memory»
// in 2 van 6 builds, ook direct na «✓ built»). Het grootste deel van die heap gaat naar het syntaxisboom van twee VOORAF GEBUNDELDE
// bestanden: officeparser.browser.slim.mjs (5,5 MB, één ESM-bestand) en h5wasm (hdf5_hl.js + hdf5_util.js, 4,2 MB, Emscripten met
// ingebakken WASM). Beide zijn al zelfstandige ES-modules met alleen relatieve imports; hun interne `import(…)` staan al op
// /* @vite-ignore */ (werker-URL's, worden ook nu tijdens het draaien opgelost). Rollup voegt er dus niets aan toe — het kost alleen geheugen.
//
// Hoe: `resolveId` maakt `officeparser/slim` en `h5wasm` extern met een URL vanaf de wortel van de host (`/assets/vendor/…`): de server
// bedient dist/ op de wortel van elk subdomein (server/start.ts serveStatic) en `/assets/` krijgt daar «immutable»-cache, dus het
// inhoudshash in de mapnaam is de cache-sleutel. (Een bestandspad met `external: 'relative'` bleef bij dynamische imports absoluut
// in de uitvoer staan — gemeten 23.10 — vandaar een URL.) `generateBundle` zet de
// originele bestanden in `assets/vendor/<naam>-<inhoudshash>/` (cache-busting per versie van het pakket, vaste interne bestandsnamen
// zodat `import "./hdf5_util.js"` blijft kloppen). Altijd `.js`: onze server kent `.mjs` wel, maar niet elke proxy ervoor.
// Alleen bij `vite build`; de ontwikkelserver blijft gewoon bundelen.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/** Wortel van de repository (deze map is scripts/), los van de werkmap. */
const WORTEL = fileURLToPath(new URL('..', import.meta.url));

/** Welke pakketten, welke bestanden (bron → naam in de vendor-map) en welk bestand de module is die de app importeert. */
export const VENDOR_ONGEBUNDELD = Object.freeze([
  { spec: 'officeparser/slim', map: 'officeparser', hoofd: 'officeparser.browser.slim.js',
    bestanden: [['node_modules/officeparser/dist/officeparser.browser.slim.mjs', 'officeparser.browser.slim.js']] },
  { spec: 'h5wasm', map: 'h5wasm', hoofd: 'hdf5_hl.js',
    bestanden: [['node_modules/h5wasm/dist/esm/hdf5_hl.js', 'hdf5_hl.js'], ['node_modules/h5wasm/dist/esm/hdf5_util.js', 'hdf5_util.js']] },
  // UPD-003 (17.11.2026): mermaid. `import('mermaid')` trok mermaid.core + d3, cytoscape, elk, katex… (honderden modules) door Rollup;
  // daarmee haalde `vite build` de heaplimiet van de installer (BOUW_HEAP_MB=2560) niet meer — «heap out of memory» bij installatie
  // van UPD-003. mermaid levert zelf een kant-en-klare ESM-bundel (mermaid.esm.min.mjs + chunks/mermaid.esm.min/*.mjs, alleen
  // relatieve imports). Die gaat nu ongewijzigd mee; alleen de extensie .mjs → .js (ook in de relatieve importpaden, herschrijf).
  // Mermaid: готовий ESM-пакет без перескладання — збірка вкладається в ліміт пам'яті інсталятора.
  { spec: 'mermaid', map: 'mermaid', hoofd: 'mermaid.esm.min.js', herschrijf: true,
    bestanden: [['node_modules/mermaid/dist/mermaid.esm.min.mjs', 'mermaid.esm.min.js'], ...mapBestanden('node_modules/mermaid/dist/chunks/mermaid.esm.min', 'chunks/mermaid.esm.min')] },
]);

/** Alle .mjs-bestanden van een map (zonder .map) als [bron, naam-met-.js]; gesorteerd, zodat de hash vast is. */
function mapBestanden(bronMap, doelMap) {
  let namen = [];
  // Eerst t.o.v. dit script, dan t.o.v. de werkmap (gebundelde tests draaien vanuit rapporten/).
  for (const basis of [WORTEL, process.cwd()]) {
    try { namen = readdirSync(resolve(basis, bronMap)).filter((n) => n.endsWith('.mjs')).sort(); break; } catch { /* volgende basis; ontbreekt het pakket, dan meldt de test het */ }
  }
  return namen.map((n) => [`${bronMap}/${n}`, `${doelMap}/${n.replace(/\.mjs$/, '.js')}`]);
}

/** Relatieve importpaden «./x.mjs» / «../x.mjs» → «.js» (alleen tekenreeksen die met ./ of ../ beginnen). */
export function herschrijfMjs(code) {
  return code.replace(/(["'])(\.\.?\/[^"'\n]+?)\.mjs\1/g, '$1$2.js$1');
}

export function vendorOngebundeldPlugin() {
  let root = process.cwd();
  /** spec → { url (vanaf de wortel van de host), map (relatief binnen dist), bestanden } — pas na configResolved bekend. */
  const tabel = new Map();
  const bereken = () => {
    tabel.clear();
    for (const lib of VENDOR_ONGEBUNDELD) {
      const inhoud = lib.bestanden.map(([bron, naam]) => {
        const data = readFileSync(resolve(root, bron));
        return { naam, data: lib.herschrijf ? Buffer.from(herschrijfMjs(data.toString('utf8')), 'utf8') : data };
      });
      const h = createHash('sha256');
      for (const b of inhoud) h.update(b.naam).update(b.data);
      const map = `assets/vendor/${lib.map}-${h.digest('hex').slice(0, 10)}`;
      tabel.set(lib.spec, { map, url: `/${map}/${lib.hoofd}`, inhoud });
    }
  };
  return {
    name: 'mr-vendor-ongebundeld',
    apply: 'build',
    enforce: 'pre',
    configResolved(c) { root = c.root; bereken(); },
    resolveId(source) {
      const t = tabel.get(source);
      return t ? { id: t.url, external: true } : null;
    },
    generateBundle() {
      for (const t of tabel.values()) for (const b of t.inhoud) this.emitFile({ type: 'asset', fileName: `${t.map}/${b.naam}`, source: b.data });
    },
  };
}
