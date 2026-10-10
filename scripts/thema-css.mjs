// Maakt src/thema/paletten.css en de opstartregels in index.html uit src/thema/paletten.ts (gebundeld met esbuild).
// Gebruik: node scripts/thema-css.mjs   (de eenheidstest «thema» faalt als de bestanden verouderd zijn)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const tmp = mkdtempSync(join('rapporten', 'thema-'));
const uitJs = join(tmp, 'paletten.mjs');
await build({ entryPoints: ['src/thema/paletten.ts'], outfile: uitJs, bundle: true, platform: 'node', format: 'esm', logLevel: 'warning' });
const { paletCss, bootCss } = await import(pathToFileURL(join(process.cwd(), uitJs)).href);
rmSync(tmp, { recursive: true, force: true });
writeFileSync(new URL('../src/thema/paletten.css', import.meta.url), paletCss());
const pad = new URL('../index.html', import.meta.url);
const html = readFileSync(pad, 'utf8');
const begin = '/*thema-paletten*/', eind = '/*/thema-paletten*/';
const blok = `${begin}${bootCss()}${eind}`;
let uit;
if (html.includes(begin)) uit = html.replace(new RegExp(`${begin.replace(/[*/]/g, '\\$&')}[\\s\\S]*?${eind.replace(/[*/]/g, '\\$&')}`), () => blok);
else uit = html.replace('</style>', `${blok}</style>`); // eerste <style> = canonical-single-boot
writeFileSync(pad, uit);
console.log('paletten.css + index.html bijgewerkt');
