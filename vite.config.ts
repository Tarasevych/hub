import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
// @ts-expect-error -- plain ESM-script zonder typedeclaraties
import { securityBuildPlugin } from './scripts/beveiliging-bouw.mjs';
// @ts-expect-error -- plain ESM-script zonder typedeclaraties
import { extensieDownloadsPlugin } from './scripts/extensie-downloads.mjs';
// @ts-expect-error -- plain ESM-script zonder typedeclaraties
import { vendorOngebundeldPlugin } from './scripts/vendor-ongebundeld.mjs';
import { isTechChunk } from './shared/tech-bundels';

// Technische chunks (beheerpagina's, zie shared/tech-bundels.ts) → dist/assets/tech/; de server serveert die map alleen met een
// geldige technische toegangscookie (backend/tech-bundels.ts). Ook de CSS van zo'n chunk gaat mee naar assets/tech/.
const WORTEL = process.cwd();
const leesBegin = (rel: string) => readFileSync(`${WORTEL}/${rel}`, 'utf8').slice(0, 200);
const techChunkNamen = new Set<string>(), openbareChunkNamen = new Set<string>();
const chunkNaam = (c: { name: string; facadeModuleId: string | null; moduleIds: readonly string[]; isEntry: boolean }) => {
  const tech = isTechChunk(c, WORTEL, leesBegin);
  (tech ? techChunkNamen : openbareChunkNamen).add(c.name);
  return tech ? 'assets/tech/[name]-[hash].js' : 'assets/[name]-[hash].js';
};
const assetNaam = (a: { names?: readonly string[]; name?: string }) => {
  const n = String(a.names?.[0] || a.name || '');
  const stam = n.replace(/\.css$/, '');
  return n.endsWith('.css') && techChunkNamen.has(stam) && !openbareChunkNamen.has(stam) ? 'assets/tech/[name]-[hash][extname]' : 'assets/[name]-[hash][extname]';
};

// Zelf-gehoste build: output altijd in dist/ (geen APPDEPLOY_*-variabelen meer).
// SOURCEMAP=hidden maakt sourcemaps zonder verwijzing in de bundel.
// Eigen versie in de bundel (18.10.2026): open tabbladen vergelijken die met /api/version en tonen «Сайт оновлено» (src/platform/
// nieuwe-versie.ts). Bron: UITROL-VERSIE van het pakket; zonder dat bestand leeg (dan geen vergelijking, nooit een valse melding).
const bouwVersie = (() => { try { const v = readFileSync('UITROL-VERSIE', 'utf8').trim(); return /^[0-9]{8}-[0-9]{6}$/.test(v) ? v : ''; } catch { return ''; } })();

export default defineConfig({
  // extensieDownloadsPlugin: dist/downloads/ (o.a. extension-version.json) bij elke vite-build, anders 404 op elk subdomein.
  // vendorOngebundeldPlugin (23.10.2026): officeparser/slim en h5wasm ongewijzigd naar dist/assets/vendor/ i.p.v. door Rollup — scheelt het
  // grootste deel van de build-heap (zie scripts/vendor-ongebundeld.mjs).
  plugins: [vendorOngebundeldPlugin(), react(), securityBuildPlugin(), extensieDownloadsPlugin()],
  define: { __MR_BOUW_VERSIE__: JSON.stringify(bouwVersie) },
  base: './',
  build: {
    // 22.10.2026: het berekenen van gzip-groottes na het bouwen liet vite met 2,5 GB heap sterven (OOM bij «computing gzip size»,
    // 5 400+ modules met mermaid/tesseract/merk-officieel). De cijfers zijn alleen informatief — uit, zodat de installer op een
    // BYOS-server met BOUW_HEAP_MB=2560 blijft werken.
    reportCompressedSize: false,
    cssCodeSplit: true,
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.SOURCEMAP === 'hidden' ? 'hidden' : false,
    rollupOptions: {
      // 23.10.2026 (gemeten met BOUW_HEAP_MB 2560 → 1536): zonder Rollup-cache (alleen nuttig in watch-modus) en met minder gelijktijdige
      // bestandsoperaties blijft er minder vast in de heap; samen met vendorOngebundeldPlugin slaagt de build nu met 2048 MB
      // (vroeger faalde hij af en toe met 2560).
      cache: false,
      maxParallelFileOps: 32,
      output: { chunkFileNames: chunkNaam, assetFileNames: assetNaam },
    },
  },
});
