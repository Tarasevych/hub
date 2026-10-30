// Draait tests/e2e/tech-ruimtes-ui.e2e.ts (alleen lokaal, nepserver in het geheugen, geen DB). Gebruik: node scripts/e2e-tech-ruimtes-ui.mjs
import { mkdirSync } from 'node:fs'; mkdirSync('rapporten', { recursive: true });
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
await build({ entryPoints: ['tests/e2e/tech-ruimtes-ui.e2e.ts'], outfile: 'rapporten/tech-ruimtes-ui-e2e.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'warning' });
const m = await import(pathToFileURL(resolve('rapporten/tech-ruimtes-ui-e2e.mjs')).href);
process.exit((await m.main()) || 0);
