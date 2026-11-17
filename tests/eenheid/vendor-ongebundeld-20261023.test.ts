// VENDOR ONGEBUNDELD (23.10.2026): officeparser/slim en h5wasm gaan ongewijzigd naar dist/assets/vendor/ in plaats van door Rollup.
// Achtergrond: `vite build` faalde af en toe met «JavaScript heap out of memory» bij de heaplimiet van de installer (BOUW_HEAP_MB=2560);
// zonder deze twee voorgebundelde bestanden (samen ~9,7 MB code) in de syntaxisboom slaagt de build met 2048 MB.
// Deze test bewaakt de VOORWAARDEN waaronder dat veilig is — anders zou een update van een pakket stil een kapotte import geven:
//   1. de bestanden bestaan en zijn zelfstandige ES-modules (geen kale import van een ander pakket, geen require);
//   2. de plugin maakt precies die specificaties extern (sinds UPD-003 ook mermaid), met een URL vanaf de wortel onder /assets/vendor/<naam>-<hash>/;
//   3. de app importeert ze alleen dynamisch (een statische import zou het vendorbestand in elke pagina trekken);
//   4. vite.config.ts gebruikt de plugin, zonder Rollup-cache;
//   5. als er een dist/ ligt: de vendorbestanden staan erin en de chunks verwijzen ernaar met dezelfde URL.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { checker } from './hulp/nep-google';
// @ts-expect-error -- plain ESM-script zonder typedeclaraties
import { herschrijfMjs, VENDOR_ONGEBUNDELD, vendorOngebundeldPlugin } from '../../scripts/vendor-ongebundeld.mjs';

type Lib = { spec: string; map: string; hoofd: string; herschrijf?: boolean; bestanden: Array<[string, string]> };
const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');

function bestandenOnder(map: string, uit: string[] = []): string[] {
  if (!existsSync(map)) return uit;
  for (const n of readdirSync(map)) { const p = join(map, n); if (statSync(p).isDirectory()) bestandenOnder(p, uit); else uit.push(p); }
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('vendor-ongebundeld-20261023');
  const libs = VENDOR_ONGEBUNDELD as readonly Lib[];
  // UPD-003 (17.11.2026): mermaid erbij — zijn eigen ESM-bundel (≈105 bestanden) i.p.v. honderden modules door Rollup; de build past zo weer
  // ruim in BOUW_HEAP_MB=2560 (gemeten: slaagt met 2048). · Mermaid — готовий ESM-пакет, збірка знову вкладається в ліміт пам'яті.
  check('drie pakketten: officeparser/slim, h5wasm en mermaid', libs.map((l) => l.spec).join(',') === 'officeparser/slim,h5wasm,mermaid');
  const mm = libs.find((l) => l.spec === 'mermaid');
  check('mermaid: hoofdbestand + ≥ 50 chunks, allemaal .js', !!mm && mm.bestanden.length > 50 && mm.bestanden.every(([, n]) => n.endsWith('.js')), String(mm?.bestanden.length));
  check('herschrijfMjs: alleen relatieve paden .mjs → .js', herschrijfMjs('import{a}from"./c/x.mjs";import("../y.mjs");const z="z.mjs"') === 'import{a}from"./c/x.js";import("../y.js");const z="z.mjs"');

  // 1. zelfstandige ES-modules
  for (const lib of libs) {
    for (const [bron, naam] of lib.bestanden) {
      const pad = join(W, bron);
      const ok = existsSync(pad);
      check(`${lib.spec}: ${bron} bestaat`, ok);
      if (!ok) continue;
      const ruw = readFileSync(pad, 'utf8');
      const code = lib.herschrijf ? herschrijfMjs(ruw) : ruw;
      // Specificaties zonder spaties/;: tekst als «from";var…» in strings telt niet. Ook geminificeerd («;import{…}from"./x"», «import("./y")»): elke import-specificatie, statisch of dynamisch.
      const statisch = [...code.matchAll(/^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]);
      const alle = lib.herschrijf ? [...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"'\s;,(){}]+)["']/g)].map((m) => m[1]) : statisch;
      const kaal = alle.filter((s) => !s.startsWith('./') && !s.startsWith('../'));
      check(`${lib.spec}: ${naam} heeft alleen relatieve imports`, kaal.length === 0, kaal.join(','));
      const namen = lib.bestanden.map(([, n]) => n);
      const relatief = alle.filter((s) => s.startsWith('./') || s.startsWith('../')).map((s) => posix.normalize(posix.join(posix.dirname(naam), s)));
      check(`${lib.spec}: elke relatieve import van ${naam} zit zelf in de vendormap`, relatief.every((r) => namen.includes(r)), relatief.filter((r) => !namen.includes(r)).join(','));
      // Geminificeerd staat er «;export{… as OfficeParser,…}» zonder spatie: zowel «export {» als «export const|var|…» tellen.
      const isEsm = /\bexport\s*\{|\bexport\s*\*|\bexport\s+(default|const|var|let|function|class|async)\b/.test(code) && !/\bmodule\.exports\s*=/.test(code.slice(0, 2000));
      check(`${lib.spec}: ${naam} is een ES-module (export, geen module.exports)`, isEsm || naam !== lib.hoofd, '');
      if (lib.spec === 'officeparser/slim' && naam === lib.hoofd) check('officeparser/slim: exporteert OfficeParser (zoals src/ die gebruikt)', /\bas OfficeParser\b|export\s+(const|class|function)\s+OfficeParser\b/.test(code));
      if (lib.spec === 'mermaid' && naam === lib.hoofd) check('mermaid: exporteert default (zoals src/media/MermaidSchema.tsx die gebruikt)', /export\s*\{[^}]*\bas default\b[^}]*\}/.test(code));
      if (lib.spec === 'h5wasm' && naam === lib.hoofd) check('h5wasm: exporteert ready, File en FS (zoals src/ die gebruikt)', /export\s*\{\s*ready\s*\}|export const ready/.test(code) && /export var FS\b/.test(code) && /export class File\b|export \{[^}]*\bFile\b/.test(code));
    }
  }

  // 2. de plugin
  const p = vendorOngebundeldPlugin() as { configResolved: (c: { root: string; build: { outDir: string } }) => void; resolveId: (s: string) => { id: string; external: boolean } | null; apply: string; enforce: string };
  p.configResolved({ root: W, build: { outDir: 'dist' } });
  const r1 = p.resolveId('officeparser/slim'), r2 = p.resolveId('h5wasm'), r3 = p.resolveId('mermaid');
  check('plugin: alleen bij build, vóór de gewone resolver', p.apply === 'build' && p.enforce === 'pre');
  check('plugin: officeparser/slim → extern /assets/vendor/officeparser-<hash>/officeparser.browser.slim.js',
    !!r1 && r1.external === true && /^\/assets\/vendor\/officeparser-[0-9a-f]{10}\/officeparser\.browser\.slim\.js$/.test(r1.id), r1?.id || '');
  check('plugin: h5wasm → extern /assets/vendor/h5wasm-<hash>/hdf5_hl.js', !!r2 && r2.external === true && /^\/assets\/vendor\/h5wasm-[0-9a-f]{10}\/hdf5_hl\.js$/.test(r2.id), r2?.id || '');
  check('plugin: mermaid → extern /assets/vendor/mermaid-<hash>/mermaid.esm.min.js', !!r3 && r3.external === true && /^\/assets\/vendor\/mermaid-[0-9a-f]{10}\/mermaid\.esm\.min\.js$/.test(r3.id), r3?.id || '');
  check('plugin: andere pakketten ongemoeid (officeparser zonder /slim, react)', p.resolveId('officeparser') === null && p.resolveId('react') === null);

  // 3. alleen dynamisch geïmporteerd in src/
  const src = bestandenOnder(join(W, 'src')).filter((f) => /\.(tsx?|mjs|js)$/.test(f));
  const statischGebruik = src.filter((f) => /^\s*import\s[^;]*from\s+['"](officeparser\/slim|h5wasm|mermaid)['"]/m.test(readFileSync(f, 'utf8')));
  const dynamischGebruik = src.filter((f) => /import\(\s*['"](officeparser\/slim|h5wasm)['"]\s*\)/.test(readFileSync(f, 'utf8')));
  check('src/: geen statische import van officeparser/slim, h5wasm of mermaid', statischGebruik.length === 0, statischGebruik.join(','));
  check('src/: beide worden dynamisch geladen (bijlage-voorbeeld)', dynamischGebruik.length >= 2, dynamischGebruik.map((f) => f.slice(W.length + 1)).join(','));
  check('src/: mermaid alleen dynamisch (MermaidSchema)', src.some((f) => /import\(\s*['"]mermaid['"]\s*\)/.test(readFileSync(f, 'utf8'))));

  // 4. vite.config.ts
  const vc = lees('vite.config.ts');
  check('vite.config.ts: vendorOngebundeldPlugin() staat in de plugins', /plugins:\s*\[\s*vendorOngebundeldPlugin\(\)/.test(vc));
  check('vite.config.ts: Rollup-cache uit (alleen nuttig in watch-modus, kost heap)', /cache:\s*false/.test(vc));

  // 5. een aanwezige build
  const dist = join(W, 'dist');
  if (existsSync(join(dist, 'index.html'))) {
    const vendor = bestandenOnder(join(dist, 'assets', 'vendor')).map((f) => f.slice(dist.length));
    check('dist/: vendorbestanden aanwezig', [r1!.id, r2!.id, r2!.id.replace('hdf5_hl.js', 'hdf5_util.js'), r3!.id].every((u) => vendor.includes(u)), vendor.slice(0, 6).join(','));
    const mmMap = r3!.id.slice(0, r3!.id.lastIndexOf('/'));
    check('dist/: alle mermaid-bestanden staan in zijn vendormap', mm!.bestanden.every(([, n]) => vendor.includes(`${mmMap}/${n}`)));
    const mmZonderMjs = vendor.filter((v) => v.startsWith(mmMap)).every((v) => !/(["'])\.\.?\/[^"']+\.mjs\1/.test(readFileSync(join(dist, v), 'utf8')));
    check('dist/: geen relatieve .mjs-import meer in de mermaid-vendormap', mmZonderMjs);
    const chunks = bestandenOnder(join(dist, 'assets')).filter((f) => f.endsWith('.js') && !f.includes(`${join('assets', 'vendor')}`));
    const verwijzingen = new Set<string>();
    for (const f of chunks) for (const m of readFileSync(f, 'utf8').matchAll(/import\("(\/assets\/vendor\/[^"]+)"\)/g)) verwijzingen.add(m[1]);
    check('dist/: chunks importeren precies deze URL’s', [...verwijzingen].every((u) => u === r1!.id || u === r2!.id || u === r3!.id) && verwijzingen.has(r1!.id) && verwijzingen.has(r2!.id) && verwijzingen.has(r3!.id), [...verwijzingen].join(','));
    const geenKopie = chunks.filter((f) => /officeparser browser bundle/.test(readFileSync(f, 'utf8').slice(0, 400)));
    check('dist/: officeparser zit niet meer gebundeld in een chunk', geenKopie.length === 0, geenKopie.join(','));
  } else {
    console.log('(dist/ ontbreekt: controle 5 overgeslagen)');
  }
  return einde();
}
