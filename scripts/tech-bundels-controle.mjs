#!/usr/bin/env node
// Bouwcontrole technische bundels (shared/tech-bundels.ts, 18.10.2026).
// Faalt (exit 1) als een OPENBARE bundel of index.html een bundel uit assets/tech/ STATISCH laadt: dan zou de gewone site zonder
// technisch profiel breken (de server geeft 404 op assets/tech/ zonder toegangscookie) en is de scheiding stuk.
// Dynamisch laden (`import("./tech/…")`, na activering) mag wel. Ook: zonder één enkele technische bundel klopt de configuratie niet.
// Gebruik: node scripts/tech-bundels-controle.mjs [distmap]   (standaard dist)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function statischeTechImports(code) {
  const uit = [];
  // `import{a}from"./tech/X.js"`, `import"./tech/X.js"`, `export{a}from"./tech/X.js"` — niet `import("./tech/X.js")`.
  for (const m of String(code).matchAll(/(?:\bfrom|\bimport)\s*["'](\.\/tech\/[^"']+)["']/g)) uit.push(m[1]);
  return uit;
}

export function controleer(dist) {
  const fouten = [];
  const assets = join(dist, 'assets'), tech = join(assets, 'tech');
  if (!existsSync(assets)) return { fouten: [`geen ${assets}`], openbaar: 0, technisch: 0 };
  const openbaar = readdirSync(assets).filter((f) => f.endsWith('.js'));
  const technisch = existsSync(tech) ? readdirSync(tech).filter((f) => f.endsWith('.js')) : [];
  if (!technisch.length) fouten.push('geen enkele bundel in assets/tech/ — vite.config.ts (chunkFileNames) of shared/tech-bundels.ts klopt niet');
  for (const f of openbaar) {
    const st = statischeTechImports(readFileSync(join(assets, f), 'utf8'));
    for (const s of st) fouten.push(`openbare bundel assets/${f} laadt ${s} statisch`);
  }
  const index = join(dist, 'index.html');
  if (existsSync(index) && /assets\/tech\//.test(readFileSync(index, 'utf8'))) fouten.push('index.html verwijst naar assets/tech/ (modulepreload of script)');
  return { fouten, openbaar: openbaar.length, technisch: technisch.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = process.argv[2] || 'dist';
  const r = controleer(dist);
  if (r.fouten.length) {
    console.error(`[tech-assets] FOUT: ${r.fouten.length} probleem/problemen:\n  - ${r.fouten.join('\n  - ')}`);
    console.error('[tech-assets] Een openbare module importeert technische code statisch. Maak de import dynamisch (lazy) of haal de module uit shared/tech-bundels.ts.');
    process.exit(1);
  }
  console.log(`[tech-assets] in orde: ${r.technisch} technische bundels in assets/tech/, ${r.openbaar} openbare; geen statische verwijzing van openbaar naar technisch.`);
}
