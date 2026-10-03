// Security-build: haalt de inline <script>/<style>-blokken uit index.html en zet ze in
// externe bestanden, zodat de CSP zonder 'unsafe-inline' kan (script-src 'self').
//
// Vroeger herschreef dit script index.html en public/ IN DE WERKBOOM. Nu is het een
// zuivere functie die door de Vite-plugin in vite.config.ts tijdens `vite build` wordt
// gebruikt: de bron (index.html) blijft ongewijzigd, het resultaat komt alleen in dist/.
//
// Los aanroepen (`node scripts/security-build.mjs`) doet een controle zonder te schrijven.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BLOKKEN = [
  { naam: 'PRESENTATION', patroon: /<script id="presentation-init">([\s\S]*?)<\/script>/, bestand: 'canonical-presentation.js', tag: '<script src="./canonical-presentation.js"></script>' },
  { naam: 'BOOT_CSS', patroon: /<style id="canonical-single-boot">([\s\S]*?)<\/style>/, bestand: 'canonical-boot.css', tag: '<link rel="stylesheet" href="./canonical-boot.css">' },
  { naam: 'BOOT', patroon: /<script id="canonical-boot">([\s\S]*?)<\/script>/, bestand: 'canonical-boot.js', tag: '<script src="./canonical-boot.js"></script>' },
];

/** Externaliseert de inline blokken. Geeft { html, files: [{fileName, source}] } terug. */
export function externalizeInline(input) {
  let html = input;
  const files = [];
  for (const blok of BLOKKEN) {
    const match = html.match(blok.patroon);
    if (!match) throw new Error(`SECURITY_BUILD_MISSING_${blok.naam}`);
    files.push({ fileName: blok.bestand, source: match[1] });
    html = html.replace(blok.patroon, blok.tag);
  }
  // Na externaliseren mag er geen uitvoerbare inline code meer over zijn.
  // (Het Vite-module-script met src= telt niet.)
  if (/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html) || /<style\b/i.test(html)) {
    throw new Error('SECURITY_BUILD_INLINE_EXECUTABLE_REMAINS');
  }
  return { html, files };
}

/** Vite-plugin: past externalizeInline toe op index.html tijdens de productie-build. */
export function securityBuildPlugin() {
  let files = [];
  return {
    name: 'mijn-ruimte-security-build',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const result = externalizeInline(html);
        files = result.files;
        return result.html;
      },
    },
    generateBundle() {
      for (const file of files) this.emitFile({ type: 'asset', fileName: file.fileName, source: file.source });
    },
  };
}

// CLI: alleen controleren, niets schrijven.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { files } = externalizeInline(readFileSync('index.html', 'utf8'));
  console.log(`Security build-controle OK (${files.length} inline blokken worden bij de build geëxternaliseerd)`);
}
