#!/usr/bin/env node
// KLIMOP-018 (21.11.2026) · Межа «клієнт ↔ сервер» для пакунка переглядача.
// Незалежна перевірка «Плюща» виявила, що src/agenten/KlimopPaneel.tsx через shared/klimop/diensten.ts затягнув
// node:crypto у клієнтський пакунок Vite, і чисте складання впало з кодом 1 після 4387 модулів. Ця перевірка
// відтворює граф звичайних (не типових) імпортів від точки входу переглядача src/main.tsx за допомогою esbuild і
// завершується з кодом 1, якщо будь-який власний модуль сховища імпортує вбудований модуль Node.js
// (node:crypto, fs, path тощо). Сторонні пакунки з node_modules не розбираються — їх складає Vite за своїми правилами.
// Виконується в npm run build перед vite build, а також у випробуванні klimop-018.
//
// KLIMOP-018 · Grenscontrole browserbundel: geen eigen module die vanuit src/main.tsx bereikbaar is, mag een
// ingebouwde Node.js-module importeren. Gebruik: node scripts/klant-servergrens-controle.mjs [--stil] [--json]
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { relative, resolve } from 'node:path';
import { build } from 'esbuild';

const INGEBOUWD = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
const isIngebouwd = (s) => s.startsWith('node:') || INGEBOUWD.has(s) || INGEBOUWD.has(s.split('/')[0]);

/** Явно оголошені в package.json → dependencies клієнтські заміники (наприклад, пакунок «buffer») — не порушення. */
function klantVervangers(wortel) {
  try {
    const pkg = JSON.parse(readFileSync(resolve(wortel, 'package.json'), 'utf8'));
    return new Set(Object.keys(pkg.dependencies ?? {}));
  } catch {
    return new Set();
  }
}


/**
 * Повертає перелік порушень: [{ module, importeur }] — власні файли, що імпортують вбудовані модулі Node.js.
 * @param {{ ingang?: string, wortel?: string }} [opties]
 */
export async function klantServergrensFouten(opties = {}) {
  const wortel = resolve(opties.wortel ?? '.');
  const ingang = resolve(wortel, opties.ingang ?? 'src/main.tsx');
  const fouten = [];
  const vervangers = klantVervangers(wortel);
  const grens = {
    name: 'klimop-018-servergrens',
    setup(b) {
      // Суфікси Vite (?raw, ?url, ?worker) та віртуальні модулі не є частиною перевірки межі.
      b.onResolve({ filter: /\?/ }, (a) => ({ path: a.path, external: true }));
      b.onResolve({ filter: /^virtual:|^\/@/ }, (a) => ({ path: a.path, external: true }));
      b.onResolve({ filter: /.*/ }, (a) => {
        if (a.kind === 'entry-point') return undefined;
        if (isIngebouwd(a.path) && !(!a.path.startsWith('node:') && vervangers.has(a.path.split('/')[0]))) {
          fouten.push({ module: a.path, importeur: relative(wortel, a.importer) });
          return { path: a.path, external: true };
        }
        return undefined;
      });
    },
  };
  await build({
    entryPoints: [ingang],
    absWorkingDir: wortel,
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty', '.jpg': 'empty', '.webp': 'empty', '.woff2': 'empty', '.woff': 'empty', '.wasm': 'empty', '.txt': 'empty', '.md': 'empty' },
    plugins: [grens],
  });
  const uniek = new Map(fouten.map((f) => [`${f.importeur}|${f.module}`, f]));
  return [...uniek.values()].sort((x, y) => (x.importeur < y.importeur ? -1 : x.importeur > y.importeur ? 1 : x.module < y.module ? -1 : 1));
}

const isHoofd = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isHoofd) {
  const stil = process.argv.includes('--stil');
  const json = process.argv.includes('--json');
  const fouten = await klantServergrensFouten();
  if (json) console.log(JSON.stringify({ fouten }, null, 2));
  if (fouten.length) {
    console.error(`klant-servergrens: ${fouten.length} порушень межі клієнт↔сервер / grensovertredingen:`);
    for (const f of fouten) console.error(`  ${f.importeur} → ${f.module}`);
    console.error('Винесіть чисті дані до модуля без серверних залежностей (див. shared/klimop/diensten-catalogus.ts).');
    process.exit(1);
  }
  if (!stil && !json) console.log('klant-servergrens: OK — жоден власний модуль переглядача не імпортує вбудовані модулі Node.js');
}
