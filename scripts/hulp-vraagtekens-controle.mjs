// Controle «één (?) per kop» (29.10.2026). Wens van de eigenaar: «абсурдність, що на одному місці аж 3 знаки питання, які
// розповідають замість одного». Een blok krijgt ÉÉN (?) bij zijn kop, met één uitleg die alles samenvat (Що це / Що зміниться /
// Ризики; per bedieningselement een korte alinea: <HulpVraag k='kop' meer={[['sleutel','назва','naam'], …]} />).
//
// Wat telt als (?): <HulpVraag …>, <InfoTip …>, <Vraag help=…> in .tsx onder src/.
// Regels (statisch, per bestand; een «kop» is <h1>–<h6>, <legend> of <summary>):
//   K1  meer dan één (?) binnen dezelfde kop                                         → bevinding
//   K2  de kop heeft een (?) en tussen deze kop en de volgende staat nog een (?)       → bevinding
//   K3  de kop heeft geen (?) en tussen deze kop en de volgende staan er twee of meer  → bevinding
// Een los veld zonder kop in zijn blok mag een eigen (?) houden: zet dan «hulp:eigen-vraag» (met reden) op dezelfde regel.
// Bevindingen in STRENG (admin-, toegangs- en beheerpagina's) zijn fouten (exit 1, de build stopt); elders waarschuwingen.
//
// Gebruik: node scripts/hulp-vraagtekens-controle.mjs [--stil] [--alles-streng]  ·  import { controleerTekst, controleer } (test)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STRENG = [
  'src/BeheerConsoleWeergave.tsx', 'src/ssh/SshBeheer.tsx', 'src/agenten/toegang/AlleGebruikers.tsx', 'src/agenten/toegang/MijnToegang.tsx',
  'src/BeheerAiBeleidWeergave.tsx', 'src/toegangslaag-panelen.tsx', 'src/impersonatie/Impersonatie.tsx',
];
const VRAAG = /<(?:HulpVraag|InfoTip)\b|<Vraag\s+help=/g;
const KOP = /<(h[1-6]|legend|summary)\b[^>]*>/g;

const regelVan = (t, i) => t.slice(0, i).split('\n').length;

/** Bevindingen voor één brontekst: [{ regel, code, tekst }]. */
export function controleerTekst(t) {
  const uit = [];
  const vragen = [...t.matchAll(VRAAG)].map((m) => m.index).filter((i) => !/hulp:eigen-vraag/.test(t.slice(t.lastIndexOf('\n', i) + 1, (t.indexOf('\n', i) + 1 || t.length + 1) - 1)));
  const koppen = [];
  for (const m of t.matchAll(KOP)) {
    if (m[0].endsWith('/>')) continue;
    const eind = t.indexOf(`</${m[1]}>`, m.index);
    if (eind < 0) continue;
    // Een (?) direct na de kop (alleen witruimte ertussen, bv. <header><h2>…</h2> <InfoTip>) hoort bij de kop zelf.
    const na = eind + m[1].length + 3; const volg = /^\s*<(HulpVraag|InfoTip|Vraag)\b/.exec(t.slice(na));
    koppen.push({ van: m.index, tot: volg ? na + volg[0].length : eind, tag: m[1] });
  }
  const grenzen = [...t.matchAll(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s|^(?:export\s+)?const\s+[A-Z]\w*\s*=\s*\(/gm)].map((m) => m.index);
  koppen.forEach((k, n) => {
    const binnen = vragen.filter((i) => i > k.van && i < k.tot).length;
    // Het blok eindigt bij de volgende kop of bij het begin van een andere component (functie op het hoogste niveau).
    const grens = grenzen.find((g) => g > k.tot) ?? t.length;
    const volgende = Math.min(n + 1 < koppen.length ? koppen[n + 1].van : t.length, grens);
    const daarna = vragen.filter((i) => i > k.tot && i < volgende).length;
    const r = regelVan(t, k.van);
    if (binnen > 1) uit.push({ regel: r, code: 'K1', tekst: `${binnen} (?) in één <${k.tag}> — maak er één (?) van met meer={[…]}` });
    else if (binnen === 1 && daarna > 0) uit.push({ regel: r, code: 'K2', tekst: `<${k.tag}> heeft een (?) en het blok eronder nog ${daarna} — neem ze op in de (?) van de kop` });
    else if (binnen === 0 && daarna > 1) uit.push({ regel: r, code: 'K3', tekst: `<${k.tag}> zonder (?) maar het blok eronder heeft er ${daarna} — één (?) bij de kop` });
  });
  return uit;
}

function* tsx(map) {
  for (const n of readdirSync(map).sort()) {
    const p = join(map, n);
    if (statSync(p).isDirectory()) yield* tsx(p); else if (n.endsWith('.tsx')) yield p;
  }
}

export function controleer(wortel = '.', alles = false) {
  const fouten = [], waarschuwingen = [];
  for (const p of tsx(join(wortel, 'src'))) {
    const rel = p.slice(wortel === '.' ? 0 : wortel.length + 1).replace(/^\.\//, '');
    for (const b of controleerTekst(readFileSync(p, 'utf8'))) (alles || STRENG.includes(rel) ? fouten : waarschuwingen).push(`${rel}:${b.regel} ${b.code} ${b.tekst}`);
  }
  return { fouten, waarschuwingen };
}

/**
 * SEC-002 (interface-04): elk riskant hulpmiddel (RISKY_TOOLS in backend/connectors-hulpmiddelen.ts) heeft in src/mcp-teksten.ts
 * een eigen tekst MET risico (zesde argument van T(…)). Zonder tekst toonde het paneel een kale Engelse naam, geen «!» en een dode
 * knop «Завжди». Statisch: alleen de bronteksten worden gelezen. Geeft [] als alles klopt.
 */
export function controleerToolTeksten(wortel = '.') {
  const backend = readFileSync(join(wortel, 'backend/connectors-hulpmiddelen.ts'), 'utf8');
  const teksten = readFileSync(join(wortel, 'src/mcp-teksten.ts'), 'utf8');
  const begin = backend.indexOf('export const RISKY_TOOLS');
  if (begin < 0) return ['backend/connectors-hulpmiddelen.ts: RISKY_TOOLS niet gevonden'];
  const risky = [...backend.slice(begin, backend.indexOf(']);', begin)).matchAll(/'([a-z][a-z0-9_]+)'/g)].map((m) => m[1]);
  const fouten = [];
  for (const naam of risky) {
    const m = new RegExp(`^\\s{2}${naam}:\\s*T\\(`, 'm').exec(teksten);
    if (!m) { fouten.push(`src/mcp-teksten.ts: geen tekst voor riskant hulpmiddel ${naam}`); continue; }
    const rest = teksten.slice(m.index + m[0].length);
    const volgende = rest.search(/^\s{2}[a-z][a-z0-9_]+:\s*T\(|^};/m);
    const blok = volgende < 0 ? rest : rest.slice(0, volgende);
    // T(title, what, touches, on, off, risk): zes paren [uk, nl] → minstens zes keer «['» of «["» aan het begin van een paar.
    if ((blok.match(/\[\s*(['"`])/g) || []).length < 6) fouten.push(`src/mcp-teksten.ts: riskant hulpmiddel ${naam} heeft geen risicotekst (zesde argument van T)`);
  }
  return fouten;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { fouten, waarschuwingen } = controleer('.', process.argv.includes('--alles-streng'));
  fouten.push(...controleerToolTeksten('.'));
  if (!process.argv.includes('--stil') || fouten.length) for (const w of waarschuwingen) console.warn(`waarschuwing (?): ${w}`);
  for (const f of fouten) console.error(`FOUT (?): ${f}`);
  console.log(`hulp-vraagtekens: ${fouten.length} fout(en), ${waarschuwingen.length} waarschuwing(en)`);
  process.exit(fouten.length ? 1 : 0);
}
