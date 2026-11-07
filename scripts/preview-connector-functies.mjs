import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('/tmp/preview-cf', { recursive: true });
await mkdir('rapporten', { recursive: true });
const uit = 'rapporten/preview-cf-entry.mjs';
await build({
  entryPoints: ['scripts/preview-connector-functies-entry.tsx'],
  outfile: uit,
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  packages: 'external',
  loader: { '.css': 'empty' },
  logLevel: 'warning',
});
await import(pathToFileURL(resolve(uit)).href);
console.log('preview html klaar');
