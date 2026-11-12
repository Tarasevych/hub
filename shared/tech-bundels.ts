// Welke frontendcode is «technisch» (alleen voor een sessie met actief technisch profiel)?
// Gebruikt door vite.config.ts (chunks → dist/assets/tech/), scripts/tech-bundels-controle.mjs (bouwcontrole) en de tests.
//
// Waarom (verslag van de eigenaar, 18.10.2026: «технічні ассети лише для tech-сесії — не перевірено»): de beheerpagina's
// (updates, geheimen, diagnostiek, logboek, overzicht, integraties, terminal, vlaggen, SSH…) werden als gewone, openbare
// bundels geserveerd: iedereen kon /assets/AdminConsoleView-….js downloaden en lezen welke beheer-API's en controles er zijn.
// De rechten liggen op de server (routes), maar de code zelf hoort er niet bij voor wie geen technisch profiel heeft.
//
// Regel: een module is technisch als haar pad (relatief aan de repo) hieronder valt, of als het bestand begint met de markering
// `// @tech-asset` (voor nieuwe beheerpagina's van andere uitvoerders, zonder deze lijst aan te raken).
// Bewust NIET technisch: src/tech/TechLaag.tsx en src/tech/* (de band en het activeervenster zijn nodig VÓÓR activering),
// src/diagnose/ en src/ondersteuning/ (statisch door TechLaag geladen), src/agenten/ (ook op mcp.* voor gewone gebruikers).

export const TECH_MAPPEN: readonly string[] = [
  'src/uitrol/', 'src/geheimen/', 'src/diagnostiek/', 'src/overzicht/', 'src/audit/', 'src/integraties/',
  'src/terminal/', 'src/vlaggen/', 'src/ssh/',
  // Voorzien voor de beheeronderdelen die nu gebouwd worden (Guacamole, beveiliging/RLS/OPA, «увійти як» beheerzijde).
  'src/guacamole/', 'src/extern/', 'src/extern-bureaublad/', 'src/beheer/', 'src/beveiliging/', 'src/bescherming/',
];
export const TECH_BESTANDEN: readonly RegExp[] = [
  /^src\/Beheer[A-Z][A-Za-z]*\.tsx$/,          // BeheerConsoleWeergave, BeheerUitrolWeergave, BeheerAiBeleidWeergave, BeheerSleutelsWeergave, … (tot 24.10.2026: Admin*View)
  /^src\/beheer-[a-z0-9-]+\.(tsx?|css)$/,       // beheer-termen.tsx, beheer-console.css, beheer-uitrol.css, …
  /^src\/UitrolMeester\.tsx$/,
];
export const TECH_MARKERING = '// @tech-asset';
// Bewust openbaar BINNEN een technische map: de integratiestrook staat op gewone pagina's (Пошта, Хмара, Дім, GitHub, API).
// Tot PERF-001 (09.11.2026) zat ze toevallig in de ingangsbundel; sinds GitHub/API lui laden krijgt ze een eigen chunk, en die
// werd «technisch» → zonder tech-cookie 403 op openbare pagina's. Відкритий смуговий блок інтеграцій потрібен звичайним сторінкам.
export const TECH_OPENBAAR: readonly string[] = [
  'src/integraties/IntegratieStrook.tsx', 'src/integraties/catalogus-vlag.ts', 'src/integraties/integraties.css',
];

/** Pad van een module (absoluut of relatief, met of zonder ?query) naar 'src/…' relatief aan de repo; '' als het geen eigen bron is. */
export function bronPad(id: string, wortel = ''): string {
  if (!id || id.startsWith('\0')) return '';
  const zonderQuery = id.split('?')[0].replace(/\\/g, '/');
  if (zonderQuery.includes('/node_modules/')) return '';
  const w = wortel.replace(/\\/g, '/').replace(/\/+$/, '');
  let rel = w && zonderQuery.startsWith(w + '/') ? zonderQuery.slice(w.length + 1) : zonderQuery;
  const i = rel.lastIndexOf('/src/');
  if (!rel.startsWith('src/') && i >= 0) rel = rel.slice(i + 1);
  return rel.startsWith('src/') ? rel : '';
}

/** Is deze module technisch? `lees` geeft (optioneel) het begin van het bestand voor de markering. */
export function isTechModule(id: string, wortel = '', lees?: (pad: string) => string): boolean {
  const rel = bronPad(id, wortel);
  if (!rel) return false;
  if (TECH_OPENBAAR.includes(rel)) return false;
  if (TECH_MAPPEN.some((m) => rel.startsWith(m))) return true;
  if (TECH_BESTANDEN.some((r) => r.test(rel))) return true;
  if (lees) { try { return lees(rel).trimStart().startsWith(TECH_MARKERING); } catch { return false; } }
  return false;
}

/**
 * Hoort een (Rollup-)chunk in assets/tech/? Ja als de chunk de ingang van een technische module is (facade), of als ALLE eigen
 * bronmodules erin technisch zijn. Een gedeelde chunk met ook openbare code blijft openbaar (anders breekt de gewone site).
 * Chunks met alleen node_modules (xterm, …) blijven openbaar: dat is geen eigen code.
 */
export function isTechChunk(c: { facadeModuleId?: string | null; moduleIds?: readonly string[]; isEntry?: boolean }, wortel = '', lees?: (pad: string) => string): boolean {
  if (c.isEntry) return false;
  if (c.facadeModuleId && bronPad(c.facadeModuleId, wortel)) return isTechModule(c.facadeModuleId, wortel, lees);
  const eigen = (c.moduleIds || []).filter((m) => bronPad(m, wortel));
  return eigen.length > 0 && eigen.every((m) => isTechModule(m, wortel, lees));
}

/** URL-pad van technische bestanden; de server serveert ze alleen met een geldige technische toegangscookie. */
export const TECH_ASSET_PREFIX = '/assets/tech/';
export const TECH_ASSET_COOKIE = '__Secure-tsv_tech_assets';
