// Bundelt tests/eenheid/*.test.ts met esbuild naar een tijdelijke map en voert ze uit.
// Gebruik: DATABASE_URL=... TOTP_ENCRYPTION_KEY_V1=... RECOVERY_CODE_PEPPER=... node scripts/eenheidstests.mjs
import { build } from 'esbuild';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Binnen de repo (node_modules moet resolvebaar zijn); rapporten/ staat in .gitignore.
const filter = process.argv[2] || '';
const bestanden = (await readdir('tests/eenheid')).filter(n => n.endsWith('.test.ts') && n.includes(filter));
// INTEG-001: elk testbestand in een eigen proces. Alle bestanden in één proces lieten globals (window, location, localStorage)
// en openstaande handles van eerdere tests doorwerken: dat gaf afwijkingen die alleen in de volledige run optraden, en één
// hangend bestand hield de hele run vast. Een bestand alleen (of met een exacte naam) draait gewoon in het eigen proces.
if (bestanden.length > 1) {
  let status = 0;
  for (const f of bestanden) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), f], { stdio: 'inherit', env: process.env });
    if (r.status) status = r.status;
  }
  process.exit(status);
}
await mkdir('rapporten', { recursive: true });
const map = await mkdtemp(join('rapporten', 'eenheid-'));
let code = 0;
try {
  for (const f of bestanden) {
    const uit = join(map, f.replace(/\.ts$/, '.mjs'));
    await build({ entryPoints: [join('tests/eenheid', f)], outfile: uit, bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', logLevel: 'warning' });
    const mod = await import(pathToFileURL(resolve(uit)).href);
    code = (await mod.main()) || code;
  }
} finally {
  await rm(map, { recursive: true, force: true });
}
process.exit(code);
