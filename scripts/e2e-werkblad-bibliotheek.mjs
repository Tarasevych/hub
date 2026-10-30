// Draait tests/e2e/werkblad-bibliotheek.e2e.ts (alleen lokaal, geen server/DB). Gebruik: node scripts/e2e-werkblad-bibliotheek.mjs
import { mkdirSync } from 'node:fs'; mkdirSync('rapporten', { recursive: true });
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
await build({ entryPoints: ['tests/e2e/werkblad-bibliotheek.e2e.ts'], outfile: 'rapporten/bib-e2e.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'warning' });
const m = await import(pathToFileURL(resolve('rapporten/bib-e2e.mjs')).href);
process.exit((await m.main()) || 0);
