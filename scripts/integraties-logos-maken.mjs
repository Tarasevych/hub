// Genereert src/integraties/logos.ts uit simple-icons (CC0-1.0). Gebruik:
//   node scripts/integraties-logos-maken.mjs <map-met-svgo> <icons-v13> <icons-v16>
// Paden gaan door svgo (convertPathData, 2 decimalen (3 voor FIJN)) — geen eigen afrondingstruc: een eerdere zelfgemaakte afronding
// brak booglagen en getallen (bv. «c.1-.002.321» → «c.1-0.32»). De uitvoer wordt daarna met een canvas-vergelijking gecontroleerd.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [, , svgoMap, v13, v16, uit = 'src/integraties/logos.ts'] = process.argv;
const require = createRequire(svgoMap + '/');
const { optimize } = require('svgo');
// Merken waarvan 2 decimalen zichtbaar afwijkt (>1% pixels bij 96 px, gemeten met een canvas-vergelijking): 3 decimalen.
const FIJN = new Set(['amazonwebservices', 'argo', 'caldotcom', 'figma', 'googlephotos', 'mysql', 'philipshue', 'postgresql', 'woocommerce', 'youtubemusic', 'zoom']);
const bron = readFileSync(uit, 'utf8');
const huidig = [...bron.matchAll(/^\s*"([^"]+)": \["([^"]+)", "([0-9A-Fa-f]{6})"\]/gm)].map((m) => ({ slug: m[1], hex: m[3] }));
const regels = [];
for (const { slug, hex } of huidig) {
  const f = [`${v13}/${slug}.svg`, `${v16}/${slug}.svg`].find(existsSync);
  if (!f) { console.error('ontbreekt', slug); continue; }
  const svg = readFileSync(f, 'utf8');
  const o = optimize(svg, { plugins: [{ name: 'convertPathData', params: { floatPrecision: FIJN.has(slug) ? 3 : 2, noSpaceAfterFlags: false } }, 'mergePaths'] }).data;
  const d = o.match(/ d="([^"]+)"/)?.[1];
  if (!d) { console.error('geen pad', slug); continue; }
  regels.push(`  ${JSON.stringify(slug)}: [${JSON.stringify(d)}, ${JSON.stringify(hex)}],`);
}
const kop = bron.split('\n').filter((l) => l.startsWith('//')).join('\n');
writeFileSync(uit, `${kop}\nexport const LOGOS: Readonly<Record<string, readonly [path: string, hex: string]>> = {\n${regels.join('\n')}\n};\n`);
console.log(regels.length, 'logo\'s,', readFileSync(uit).length, 'bytes');
