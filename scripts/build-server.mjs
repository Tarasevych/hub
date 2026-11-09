// Bundelt de backend + zelf-gehoste server met esbuild naar dist-server/*.mjs (Node 24, ESM).
// Ingangen: start (HTTP-server), cron (CLI voor systemd-timers), migrate (migratierunner).
// Runtime-dependencies (pg, pdf-lib, html-entities) blijven extern en komen uit node_modules.
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

await rm('dist-server', { recursive: true, force: true });
await build({
  entryPoints: { start: 'server/start.ts', cron: 'server/cron.ts', migrate: 'server/migrate.ts', 'zoek-werker': 'backend/zoek/tekst-werker.ts', rook: 'server/rook.ts', 'apparaat-koppelcode': 'server/apparaat-koppelcode.ts', 'migratie-proef': 'server/migratie-proef.ts' },   // zoek-werker: worker_thread voor tekstextractie (backend/zoek/tekst-extractie.ts); rook: wegwerpstand voor de rendercontrole (scripts/rook-controle.mjs --stand, zone A 22.10); apparaat-koppelcode: koppelcode voor de server als apparaat (deploy/apparaat-inrichten.sh, zone G 22.10); migratie-proef: proef op een wegwerpkopie van het schema (UITROL-001)
  outdir: 'dist-server',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  platform: 'node',
  format: 'esm',
  target: 'node24',
  packages: 'external',
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'info',
  banner: { js: "import { createRequire as __mrCreateRequire } from 'node:module'; const require = __mrCreateRequire(import.meta.url);" },
});
console.log('Server-bundel klaar in dist-server/');
