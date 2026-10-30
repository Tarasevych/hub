// «Контекст дизайну» (21.10.2026, recht dev.screenshot_design → screenshot_design): wat een AI nodig heeft om iets te ontwerpen dat
// eruitziet als DEZE site — en niets meer. Alleen stijlen, nooit gegevens van de mens:
//   • de tokens van src/ontwerp/tokens.css (statuskleuren licht/donker, ritme: ruimte, straal, tekstgroottes, tikhoogte, schaduwen,
//     focus, overlay) — gelezen uit de bron van de live release, niet nagetypt;
//   • het PALET van deze mens (zijn keuze op de site: kleur per sectie / grifel / puur / violet, en licht-donker-modus) met de
//     echte hexwaarden uit src/thema/paletten.ts (dezelfde tabel waaruit paletten.css gegenereerd wordt en die de contrasttest meet);
//   • de primitieven van src/ontwerp/primitieven.css (knop, veld, kaart, pil, melding …) als selector → declaraties;
//   • de lettertypen uit src/index.css.
// De release bevat de bron (deploy/uitrol/maak-uitrolpakket.sh pakt de hele boom in, alleen node_modules/dist niet), dus de
// bestanden staan op de server naast dist/. Ontbreekt er een, dan zegt het antwoord dat eerlijk (`ontbreekt`), het verzint niets.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getPool } from '../server/platform/pg';
import { PUUR, SECTIES, kleurWaarden, type Waarden } from '../src/thema/paletten';
import { uiterlijkVoorRuimte, UITERLIJK_PALETTEN } from '../shared/uiterlijk';

export type CssBlok = { selector: string; media: string; declaraties: Array<[string, string]> };

/** Kleine CSS-lezer: commentaar weg, blokken op het hoogste niveau en binnen @media. Geen @import, geen @font-face-inhoud. */
export function cssBlokken(css: string, media = ''): CssBlok[] {
  const tekst = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const uit: CssBlok[] = [];
  let i = 0;
  while (i < tekst.length) {
    const open = tekst.indexOf('{', i);
    if (open < 0) break;
    const selector = tekst.slice(i, open).trim().replace(/\s+/g, ' ');
    let diepte = 1, j = open + 1;
    while (j < tekst.length && diepte > 0) { if (tekst[j] === '{') diepte++; else if (tekst[j] === '}') diepte--; j++; }
    const binnen = tekst.slice(open + 1, j - 1);
    if (selector.startsWith('@media') || selector.startsWith('@supports')) uit.push(...cssBlokken(binnen, selector));
    else if (!selector.startsWith('@')) {
      const declaraties: Array<[string, string]> = [];
      for (const d of binnen.split(';')) {
        const k = d.indexOf(':');
        if (k < 1) continue;
        const prop = d.slice(0, k).trim(), waarde = d.slice(k + 1).trim().replace(/\s+/g, ' ');
        if (prop && waarde && /^(--)?-?[a-z][-a-z0-9]*$/i.test(prop)) declaraties.push([prop, waarde.slice(0, 300)]);
      }
      if (declaraties.length) uit.push({ selector: selector.slice(0, 300), media, declaraties });
    }
    i = j;
  }
  return uit;
}
const variabelen = (b: CssBlok | undefined): Record<string, string> => Object.fromEntries((b?.declaraties ?? []).filter(([p]) => p.startsWith('--')));
const blok = (bl: CssBlok[], selector: string) => bl.find((b) => !b.media && b.selector === selector);

let bronCache: { op: number; bestanden: Record<string, string | null> } | null = null;
/** Waar de bron staat: ONTWERP_BRON_DIR, anders naast dist/ (de releasewortel), anders de werkmap. */
async function bronBestanden(): Promise<Record<string, string | null>> {
  if (bronCache && Date.now() - bronCache.op < 5 * 60_000) return bronCache.bestanden;
  const dist = process.env.DIST_DIR || path.join(process.cwd(), 'dist');
  const wortels = [process.env.ONTWERP_BRON_DIR, path.resolve(dist, '..'), process.cwd()].filter(Boolean) as string[];
  const namen = ['src/ontwerp/tokens.css', 'src/ontwerp/primitieven.css', 'src/index.css'];
  const bestanden: Record<string, string | null> = {};
  for (const n of namen) {
    bestanden[n] = null;
    for (const w of wortels) { try { bestanden[n] = (await readFile(path.join(w, n), 'utf8')).slice(0, 400_000); break; } catch { /* volgende */ } }
  }
  bronCache = { op: Date.now(), bestanden };
  return bestanden;
}
/** Alleen voor tests. */
export const ontwerpCacheWeg = () => { bronCache = null; };

/** Palet en modus die DEZE mens in zijn privéruimte koos (owner_ui_preferences_v1 → weergave.gebruiker). */
async function keuzeVan(userId: string): Promise<{ palet: string; modus: string }> {
  try {
    const { rows } = await getPool('systeem').query(
      `SELECT data->'weergave' AS weergave FROM app.records WHERE tbl = 'owner_ui_preferences_v1' AND data->>'userId' = $1
        ORDER BY COALESCE((data->>'updatedAt')::numeric, 0) DESC LIMIT 1`, [userId]);
    const r = uiterlijkVoorRuimte(rows[0]?.weergave ?? null, 'gebruiker');
    return { palet: r.palet && (UITERLIJK_PALETTEN as readonly string[]).includes(r.palet) ? r.palet : 'kleur', modus: r.modus ? String(r.modus) : 'device' };
  } catch { return { palet: 'kleur', modus: 'device' }; }
}

const WAARDE_NAAM: Record<keyof Waarden, string> = { bg: '--bg', panel: '--panel', surface: '--surface', surface2: '--surface2', line: '--line', text: '--text', muted: '--muted', faint: '--faint', accent: '--accent', accentText: '--accentText', accentSoft: '--accent-soft' };
const alsVars = (w: Waarden) => Object.fromEntries((Object.keys(WAARDE_NAAM) as Array<keyof Waarden>).map((k) => [WAARDE_NAAM[k], w[k]]));

export async function ontwerpContext(userId: string, opties: { sectie?: string } = {}) {
  const bron = await bronBestanden();
  const tokens = bron['src/ontwerp/tokens.css'] ? cssBlokken(bron['src/ontwerp/tokens.css']!) : [];
  const prim = bron['src/ontwerp/primitieven.css'] ? cssBlokken(bron['src/ontwerp/primitieven.css']!) : [];
  const index = bron['src/index.css'] ? cssBlokken(bron['src/index.css']!) : [];
  const keuze = await keuzeVan(userId);
  const sectie = (SECTIES as readonly string[]).includes(String(opties.sectie)) ? String(opties.sectie) : 'hub';
  // Palet: de echte waarden. «kleur» = per sectie (de gevraagde vooraan, alle andere erbij); grifel/violet = de basiswaarden uit tokens.css.
  let palet: Record<string, unknown>;
  if (keuze.palet === 'kleur') {
    const w = kleurWaarden(sectie as never);
    palet = { naam: 'kleur', sectie, licht: alsVars(w.licht), donker: alsVars(w.donker), perSectie: Object.fromEntries(SECTIES.map((s) => { const x = kleurWaarden(s); return [s, { licht: x.licht.accent, donker: x.donker.accent }]; })) };
  } else if (keuze.palet === 'puur') palet = { naam: 'puur', licht: alsVars(PUUR.licht), donker: alsVars(PUUR.donker) };
  else if (keuze.palet === 'violet') palet = { naam: 'violet', licht: variabelen(blok(tokens, '.theme-plum-light')), donker: variabelen(blok(tokens, '.theme-plum-dark')) };
  else palet = { naam: 'grifel', licht: variabelen(blok(tokens, ':root, .theme-light')), donker: variabelen(blok(tokens, '.theme-dark')) };
  const ritme = variabelen(tokens.find((b) => !b.media && b.selector === ':root' && b.declaraties.some(([p]) => p === '--ruimte-1')));
  const fonts = index.flatMap((b) => b.declaraties.filter(([p]) => p === 'font-family').map(([, v]) => ({ selector: b.selector, fontFamily: v }))).slice(0, 10);
  const primitieven = prim.filter((b) => /\.[a-z]/i.test(b.selector)).slice(0, 120).map((b) => ({ selector: b.selector, ...(b.media ? { media: b.media } : {}), stijl: Object.fromEntries(b.declaraties) }));
  return {
    soort: 'mijn-ruimte-design-context',
    note: 'Styles of the Mijn Ruimte site only (no user data). Use these CSS variables (var(--name)) and primitives instead of inventing colors; text on --accent uses --accentText.',
    keuze: { palet: keuze.palet, modus: keuze.modus },
    palet,
    staat: { licht: variabelen(blok(tokens, ':root, .theme-light, .theme-plum-light')), donker: variabelen(blok(tokens, '.theme-dark, .theme-plum-dark')) },
    ritme,
    lettertypen: fonts,
    primitieven,
    themaKlassen: { modus: ['theme-light', 'theme-dark'], palet: ['palet-grifel', 'palet-puur', 'palet-violet', 'palet-kleur'] },
    bron: Object.fromEntries(Object.entries(bron).map(([k, v]) => [k, v === null ? 'ontbreekt' : 'gelezen'])),
  };
}
