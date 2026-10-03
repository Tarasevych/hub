import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error -- plain ESM-script zonder typedeclaraties
import { securityBuildPlugin } from './scripts/security-build.mjs';

// Zelf-gehoste build: output altijd in dist/ (geen APPDEPLOY_*-variabelen meer).
// SOURCEMAP=hidden maakt sourcemaps zonder verwijzing in de bundel.
export default defineConfig({
  plugins: [react(), securityBuildPlugin()],
  base: './',
  build: {
    cssCodeSplit: true,
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.SOURCEMAP === 'hidden' ? 'hidden' : false,
    rollupOptions: {
      maxParallelFileOps: 128,
    },
  },
});
