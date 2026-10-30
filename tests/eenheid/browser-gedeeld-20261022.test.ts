// GEDEELDE MODULES IN DE BROWSER (22.10.2026). Oorzaak van de witte admin.*/updates na 20261021-221718: shared/merk-eigen.ts deed
// `Buffer.from(…)` op moduleniveau; de browser kent geen Buffer, het laden van de technische bundel gooide «Buffer is not defined»
// en élke beheerpagina bleef leeg. De eenheidstests draaien in Node (waar Buffer wél bestaat) en zagen het niet; de stand was die
// dag alleen voor post/dok gedraaid.
//
// Deze test bundelt ELKE shared/*.ts die vanuit src/ geïmporteerd wordt met esbuild voor de browser en voert hem uit in een kale
// vm-context ZONDER Buffer, process, require en fs — precies wat een browser biedt. Laadt een module dan niet, dan faalt dit hier,
// niet pas op de server van de eigenaar.
import { build } from 'esbuild';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { checker } from './hulp/nep-google';

function bestanden(map: string, uit: string[] = []): string[] {
  for (const n of readdirSync(map)) {
    const p = join(map, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') bestanden(p, uit); }
    else if (/\.(tsx?|mts)$/.test(n)) uit.push(p);
  }
  return uit;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('browser-gedeeld-20261022');
  const W = process.cwd();
  // 1) welke shared-modules laadt de browser?
  const modules = new Set<string>();
  for (const f of bestanden(join(W, 'src'))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from\s+['"](?:\.\.\/)+shared\/([A-Za-z0-9_./-]+?)(?:\.ts)?['"]/g)) modules.add(m[1]);
  }
  check('src/ importeert gedeelde modules (shared/*)', modules.size >= 20, `${modules.size}`);

  // 2) elke module: browser-bundel + uitvoeren zonder Node-globals
  const kapot: string[] = [];
  for (const m of [...modules].sort()) {
    const pad = join(W, 'shared', `${m}.ts`);
    try {
      const r = await build({ entryPoints: [pad], bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2022', logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' } });
      const code = r.outputFiles[0].text;
      // Kale context: alleen wat een browser ook heeft. Geen Buffer, geen process, geen require.
      const ctx = vm.createContext({ console, URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, setTimeout, clearTimeout, Intl, Date, Math, JSON, atob, btoa, structuredClone, globalThis: undefined as unknown });
      (ctx as Record<string, unknown>).globalThis = ctx; (ctx as Record<string, unknown>).window = ctx; (ctx as Record<string, unknown>).self = ctx;
      vm.runInContext(code, ctx, { filename: `shared/${m}.ts (browser)`, timeout: 5000 });
    } catch (e) {
      kapot.push(`shared/${m}: ${String((e as Error).message || e).split('\n')[0].slice(0, 160)}`);
    }
  }
  check('elke door src/ geïmporteerde shared-module laadt in een browser-context zonder Buffer/process/require', kapot.length === 0, kapot.join(' | '));

  // 3) de gekende boosdoener blijft schoon op moduleniveau
  const me = readFileSync(join(W, 'shared/merk-eigen.ts'), 'utf8');
  check('shared/merk-eigen.ts: geen Buffer op moduleniveau (PNG-handtekening als bytereeks)', !/^(export )?const \w+ = Buffer\./m.test(me) && /PNG_HANDTEKENING: readonly number\[\]/.test(me));
  return einde();
}
