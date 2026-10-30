// Vite-plugin (21.10.2026): extensie-downloads in <outDir>/downloads/ bij ELKE vite-build.
// Elke pagina op elk subdomein vraagt /downloads/extension-version.json op (src/ExtensieUpdateBand.tsx; ook BrowserExtensionPanel,
// TabApparaten, AgentSetupWizard). emptyOutDir wist dist/downloads/ en alleen `npm run build` maakte die map opnieuw
// (scripts/bouw-extensie.mjs) → na een losse `vite build` gaf elk subdomein een 404 in de console. Het script is snel (~0,1 s) en
// deterministisch; `npm run build` roept het daarna nog eens aan met dezelfde uitkomst.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./bouw-extensie.mjs', import.meta.url));

export function extensieDownloadsPlugin() {
  let uit = resolve('dist');
  return {
    name: 'mr-extensie-downloads',
    apply: 'build',
    configResolved(c) { uit = resolve(c.root, c.build.outDir); },
    closeBundle() {
      execFileSync(process.execPath, [SCRIPT], { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, MR_DIST_DIR: uit } });
    },
  };
}
