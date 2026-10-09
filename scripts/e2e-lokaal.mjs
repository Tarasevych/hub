// E2E met een echte Chrome tegen de lokale build. Vereist: `npx vite build` (dist/), lokale Postgres (DATABASE_URL,
// AUDIT_IP_PEPPER, RECOVERY_CODE_PEPPER… zoals bij de eenheidstests), playwright-core (PLAYWRIGHT_CORE) en een test-CA die
// Chrome vertrouwt (NSS, $HOME/.pki/nssdb) met een certificaat voor *.tarasevych.com in E2E_TLS (srv.key, srv.crt).
// Gebruik: node scripts/e2e-lokaal.mjs [filter]
import { build } from 'esbuild';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('rapporten', { recursive: true });
const map = await mkdtemp(join('rapporten', 'e2e-'));
let code = 0;
try {
  const filter = process.argv[2] || '';
  for (const f of (await readdir('tests/e2e')).filter((n) => n.endsWith('.e2e.ts') && n.includes(filter))) {
    const uit = join(map, f.replace(/\.ts$/, '.mjs'));
    await build({ entryPoints: [join('tests/e2e', f)], outfile: uit, bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', logLevel: 'warning' });
    const mod = await import(pathToFileURL(resolve(uit)).href);
    code = (await mod.main()) || code;
  }
} finally {
  await rm(map, { recursive: true, force: true });
}
process.exit(code);
