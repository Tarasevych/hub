// Bundelt tests/eenheid/*.test.ts met esbuild naar een tijdelijke map en voert ze uit.
// Gebruik: DATABASE_URL=... TOTP_ENCRYPTION_KEY_V1=... RECOVERY_CODE_PEPPER=... node scripts/eenheidstests.mjs
import { build } from 'esbuild';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Binnen de repo (node_modules moet resolvebaar zijn); rapporten/ staat in .gitignore.
await mkdir('rapporten', { recursive: true });
const map = await mkdtemp(join('rapporten', 'eenheid-'));
let code = 0;
try {
  const filter = process.argv[2] || '';
  for (const f of (await readdir('tests/eenheid')).filter(n => n.endsWith('.test.ts') && n.includes(filter))) {
    const uit = join(map, f.replace(/\.ts$/, '.mjs'));
    await build({ entryPoints: [join('tests/eenheid', f)], outfile: uit, bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', logLevel: 'warning' });
    const mod = await import(pathToFileURL(resolve(uit)).href);
    code = (await mod.main()) || code;
  }
} finally {
  await rm(map, { recursive: true, force: true });
}
process.exit(code);
