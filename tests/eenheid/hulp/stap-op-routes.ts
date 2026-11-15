// Testhulp (geen test zelf) voor tests/eenheid/stap-op-omschrijving-20261115.test.ts.
// STAPOP-OMSCHR-001 (15.11.2026): vindt in backend/*.ts elke HTTP-route die om een verse bevestiging vraagt («Підтвердіть доступ»,
// 403 STEP_UP_REQUIRED / STEP_UP_STRONG_REQUIRED), zodat de test kan eisen dat het venster voor elk ervan een eigen omschrijving
// in het Oekraïens én het Nederlands heeft — en niet «сайт не знає її опису» met het kale API-adres.
// Знаходить у backend/*.ts кожен HTTP-маршрут, що вимагає підтвердження доступу. Лише читання файлів, без мережі й бази.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type StapOpRoute = { bestand: string; methode: string; pad: string; voorbeeld: string };

/** Herkent een routesleutel: 'POST /api/…', "POST /api/…", `POST ${P}/…` (ook als [`…`]: berekende sleutel). */
const SLEUTEL = /\[?(['"`])(GET|POST|PUT|PATCH|DELETE) ((?:\/api\/|\$\{\w+\})[^'"`\s]*)\1\]?\s*:/g;
/** Tekenen in de routetekst dat het verzoek om een verse bevestiging kan vragen. */
const STAP_OP = /\bstepUp\s*:\s*true\b|\bpasskey\s*:\s*true\b|\bbevestig\s*\(\s*ctx\b|\bstepUp\s*\(|\.stepUp\s*\(|\bstapOp\s*\(|\bstapOpVereist\b|\bsterkeStapOp\w*\s*\(|\bkritiekStapOp\b|\bdeelStapOp\b|\bsterk\s*:\s*true\b|STEP_UP_(?:STRONG_)?REQUIRED/;

function bestandenIn(map: string): string[] {
  const uit: string[] = [];
  for (const n of readdirSync(map)) {
    const p = join(map, n);
    const s = statSync(p);
    if (s.isDirectory()) uit.push(...bestandenIn(p));
    else if (n.endsWith('.ts') && !n.endsWith('.d.ts') && !n.endsWith('.test.ts')) uit.push(p);
  }
  return uit;
}

/** Eenvoudige stringconstanten van een bestand: const P = '/api/…', ook `const T = '…', S = '…'` (backticks zonder ${}). */
function constanten(bron: string): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const m of bron.matchAll(/\b(\w+)\s*(?::\s*string)?\s*=\s*(['"`])(\/api\/[^'"`$]*)\2/g)) uit[m[1]] = m[3];
  return uit;
}

/** Alle routes met step-up in backend/ (map instelbaar voor tests van deze hulp zelf). */
export function routesMetStapOp(wortel = 'backend'): StapOpRoute[] {
  const uit: StapOpRoute[] = [];
  for (const bestand of bestandenIn(wortel)) {
    const bron = readFileSync(bestand, 'utf8');
    const c = constanten(bron);
    const sleutels = [...bron.matchAll(SLEUTEL)];
    sleutels.forEach((m, i) => {
      const einde = i + 1 < sleutels.length ? sleutels[i + 1].index! : Math.min(bron.length, m.index! + 6000);
      // Tekst van de route zelf: zonder commentaar (de uitleg bóven de volgende route noemt vaak STEP_UP_REQUIRED) en tot een
      // eventuele spreiding `...andereRoutes(…)` (die hoort niet bij deze route).
      const tekst = bron.slice(m.index! + m[0].length, einde).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1').split(/\n\s*\.\.\.\w/)[0];
      if (!STAP_OP.test(tekst)) return;
      const pad = m[3].replace(/\$\{(\w+)\}/g, (_x, n: string) => c[n] ?? `\${${n}}`);
      if (pad.includes('${')) return; // niet op te lossen sjabloon — de test meldt het aantal, niet stil negeren (zie test)
      uit.push({ bestand, methode: m[2], pad, voorbeeld: pad.replace(/:(\w+)/g, 'x1') });
    });
  }
  return uit;
}

/** Sjablonen die de hulp niet kon oplossen (om ze zichtbaar te maken in de test). */
export function onopgelosteSjablonen(wortel = 'backend'): string[] {
  const uit: string[] = [];
  for (const bestand of bestandenIn(wortel)) {
    const bron = readFileSync(bestand, 'utf8');
    const c = constanten(bron);
    for (const m of bron.matchAll(SLEUTEL)) {
      const pad = m[3].replace(/\$\{(\w+)\}/g, (_x, n: string) => c[n] ?? `\${${n}}`);
      if (pad.includes('${')) uit.push(`${bestand}: ${m[2]} ${m[3]}`);
    }
  }
  return uit;
}
