// Het uitklapvenster van het zoekveld (INTEG-001, 03.11.2026) — ZUIVERE logica, zonder DOM/React, gedeeld door ZoekGlobaal.tsx, de
// zoekpagina en tests/eenheid/zoek-menu-20261103.test.ts. Wens van de eigenaar:
//   1. de zoekknop klapt een menu open (zoals Windows), geen nieuwe pagina;
//   2. in het menu: de recente zoekopdrachten met TYPE (zoekopdracht / functie / pagina), PICTOGRAM en SECTIE (categorie);
//   3. een aparte knop «Перейти до пошуку» opent de zoekpagina met het HUIDIGE resultaat (niet gewist: meteen getoond);
//   4. Esc sluit het menu, Enter zoekt, pijltjes ↑/↓ lopen door de rijen, een klik ernaast sluit.
// Dit bestand bouwt de rijen van het menu (recent · suggesties · resultaten), beslist wat een gekozen rij doet en wat een toets doet.
import type { ZoekRoute, ZoekSuggestie, ZoekTreffer } from '../../shared/zoek-model';
import type { ZoekUitkomst } from './zoek-api';
import { githubUrl, norm, relatiefTijd, type Lang } from './zoek-kern';
import { CATEGORIE_NAAM, SOORT_NAAM, categorieVanBron, type Categorie } from './zoek-logica';
import { CATEGORIE_ICOON, RECENT_SOORT_ICOON, SOORT_ICOON } from './ZoekCategorieIcoon';
import { RECENT_MAX, type RecenteZoekopdracht, type RecentSoort } from './zoek-recent';
import type { VeldSuggestie } from './ZoekVeld';

/** Zoals de zoekpagina: korter dan 2 tekens zoekt niet (suggesties wel vanaf 1 teken). */
export const MENU_MIN_TEKENS = 2;
export const MENU_SUGGESTIES_MAX = 4;
export const MENU_RESULTATEN_MAX = 6;
/** Bij een getypte tekst: hoogstens zoveel recente zoekopdrachten die met de tekst beginnen. */
export const MENU_RECENT_BIJ_TYPEN = 2;

/** Naam van het type van een recente rij (zichtbaar in het menu). */
export const RECENT_SOORT_NAAM: Readonly<Record<RecentSoort, { uk: string; nl: string }>> = Object.freeze({
  zoek: { uk: 'Запит', nl: 'Zoekopdracht' }, functie: { uk: 'Функція', nl: 'Functie' }, pagina: { uk: 'Сторінка', nl: 'Pagina' },
});

/** «Запит · Пошта · 5 хв тому» — type · sectie (categorie) · tijd. De tijd valt weg als die onbekend of ouder dan 7 dagen is. */
export function recentMeta(r: Pick<RecenteZoekopdracht, 'soort' | 'sectie' | 'tijd'>, lang: Lang, nu: number = Date.now()): string {
  return [RECENT_SOORT_NAAM[r.soort][lang], CATEGORIE_NAAM[r.sectie][lang], relatiefTijd(r.tijd, lang, nu)].filter(Boolean).join(' · ');
}

/** Een recente rij als rij van het menu: pictogram van het type (zoekopdracht: dat van haar sectie), type + sectie + tijd als meta. */
export function recentRij(r: RecenteZoekopdracht, lang: Lang, nu: number, groep?: string): VeldSuggestie {
  return { soort: 'geschiedenis', tekst: r.vraag, id: String(r.tijd), icoon: r.soort === 'zoek' ? CATEGORIE_ICOON[r.sectie] : RECENT_SOORT_ICOON[r.soort], meta: recentMeta(r, lang, nu), recent: r, groep };
}

/** Een resultaat als rij van het menu, of null als er geen bestemming is (geen route en geen GitHub-link): zo'n rij kan niets doen. */
export function trefferRij(t: ZoekTreffer, lang: Lang, groep?: string): VeldSuggestie | null {
  const extern = t.route ? '' : githubUrl(t.extra);
  if (!t.route && !extern) return null;
  const cat = categorieVanBron(t.bron);
  return { soort: 'resultaat', tekst: t.titels[lang] || t.titel || t.pad || '—', id: `${t.bron}:${t.id}`, icoon: SOORT_ICOON[t.soort] || SOORT_ICOON.overig, meta: `${SOORT_NAAM[t.soort][lang]} · ${CATEGORIE_NAAM[cat][lang]}`, route: t.route, ...(extern ? { extern } : {}), groep };
}

const VOLGORDE: Record<ZoekSuggestie['soort'], number> = { functie: 0, pagina: 1, categorie: 2, correctie: 3, synoniem: 4, aanvulling: 5 };

export type MenuInvoer = {
  q: string; lang: Lang; nu: number;
  recent: readonly RecenteZoekopdracht[];
  suggesties: readonly ZoekSuggestie[];
  treffers: readonly ZoekTreffer[];
  /** Kopjes van de groepen (teksten staan in de component). */
  groepen: { recent: string; suggesties: string; resultaten: string };
};

/**
 * Alle rijen van het menu, in de volgorde van het scherm (ook de volgorde van de pijltjestoetsen):
 *  • leeg veld: de recente zoekopdrachten (type · pictogram · sectie);
 *  • getypt: eerst suggesties (functies/pagina's met een route eerst, dan correcties/aanvullingen; ≤ 4), dan de resultaten van de
 *    zoekopdracht zelf (≤ 6, alleen met een bestemming), dan recente die met de tekst beginnen (≤ 2). Geen dubbele teksten.
 */
export function bouwMenuRijen(inv: MenuInvoer): VeldSuggestie[] {
  const v = norm(inv.q);
  if (!v) return inv.recent.slice(0, RECENT_MAX).map(r => recentRij(r, inv.lang, inv.nu, inv.groepen.recent));
  const gezien = new Set<string>();
  const sug: VeldSuggestie[] = [...inv.suggesties].sort((a, b) => VOLGORDE[a.soort] - VOLGORDE[b.soort])
    .filter(s => { const k = norm(s.tekst); if (!k || gezien.has(k)) return false; gezien.add(k); return true; })
    .slice(0, MENU_SUGGESTIES_MAX).map(s => ({ ...s, groep: inv.groepen.suggesties }));
  const res: VeldSuggestie[] = [];
  for (const t of inv.treffers) { if (res.length >= MENU_RESULTATEN_MAX) break; const rij = trefferRij(t, inv.lang, inv.groepen.resultaten); if (rij) res.push(rij); }
  const rec = inv.recent.filter(r => { const k = norm(r.vraag); return k.startsWith(v) && k !== v && !gezien.has(k); })
    .slice(0, MENU_RECENT_BIJ_TYPEN).map(r => recentRij(r, inv.lang, inv.nu, inv.groepen.recent));
  return [...sug, ...res, ...rec];
}

/** Wat een gekozen rij doet: openen (functie, pagina, resultaat; met wat er bewaard moet worden) of de tekst als zoekopdracht uitvoeren. */
export type KeuzeActie =
  | { type: 'open'; route: ZoekRoute | null; extern: string; bewaar: { tekst: string; sectie: Categorie; soort: RecentSoort; route: ZoekRoute | null } | null }
  | { type: 'zoek'; tekst: string };

/**
 * Beslist de actie van een rij. `q` = de getypte tekst, `sectie` = waarin nu gezocht wordt.
 *  • resultaat → openen; de getypte zoekopdracht wordt bewaard (NIET de titel van het resultaat: die kan uit post of bestanden komen);
 *  • recente functie/pagina → rechtstreeks openen met de bewaarde route; recente zoekopdracht → opnieuw uitvoeren in het menu;
 *  • suggestie functie/pagina met route → openen en als functie/pagina bewaren; alle andere suggesties → de tekst zoeken.
 */
export function keuzeActie(s: VeldSuggestie, q: string, sectie: Categorie): KeuzeActie {
  const vraag = q.trim();
  if (s.soort === 'resultaat') return { type: 'open', route: s.route || null, extern: s.extern || '', bewaar: vraag ? { tekst: vraag, sectie, soort: 'zoek', route: null } : null };
  if (s.soort === 'geschiedenis') {
    const r = s.recent;
    if (r && r.soort !== 'zoek' && r.route) return { type: 'open', route: r.route, extern: '', bewaar: { tekst: r.vraag, sectie: r.sectie, soort: r.soort, route: r.route } };
    return { type: 'zoek', tekst: s.tekst };
  }
  if ((s.soort === 'functie' || s.soort === 'pagina') && s.route) return { type: 'open', route: s.route, extern: '', bewaar: { tekst: s.tekst, sectie: s.bron ? categorieVanBron(s.bron) : 'paginas', soort: s.soort, route: s.route } };
  return { type: 'zoek', tekst: s.tekst };
}

/** Toetsen van het hele venster (de pijltjes, Enter op een rij en Esc in het veld zelf staan in ZoekVeld; dit zijn de venstertoetsen). */
export type MenuToets = 'sluit' | 'naar-pagina' | null;
export function menuToets(e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; isComposing?: boolean }): MenuToets {
  if (e.isComposing) return null; // tijdens het samenstellen (IME) is Esc/Enter voor het invoermiddel, niet voor ons
  if (e.key === 'Escape' && !e.altKey && !e.ctrlKey && !e.metaKey) return 'sluit';
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey) return 'naar-pagina';
  return null;
}

/**
 * De zoekpagina met het HUIDIGE resultaat: de getypte tekst en sectie; is het veld leeg, dan de laatste zoekopdracht (recent, type 'zoek')
 * — zo opent de knop nooit een leeg scherm als er iets te hervatten is.
 */
export function paginaDoel(q: string, sectie: Categorie, recent: readonly RecenteZoekopdracht[]): { q: string; cat: Categorie } {
  const v = q.trim();
  if (v) return { q: v, cat: sectie };
  const laatste = recent.find(r => r.soort === 'zoek');
  return laatste ? { q: laatste.vraag, cat: laatste.sectie } : { q: '', cat: sectie };
}

/** Is het resultaat in het menu het resultaat van precies deze vraag? (dan mag de pagina het meteen tonen) */
export const uitkomstVoor = (u: { q: string; cat: Categorie } | null, q: string, cat: Categorie): boolean => !!u && u.cat === cat && u.q.trim().toLocaleLowerCase() === q.trim().toLocaleLowerCase();

// ---------------------------------------------------------------- van het menu naar de zoekpagina zonder herladen
/** Staat de zoekpagina al open, dan hoeft er niets te herladen: het menu meldt tekst, sectie en resultaat, de pagina neemt ze over. */
export const ZOEK_NAAR_PAGINA_EVENT = 'tsv:zoek-naar-pagina';
export type NaarPaginaDetail = { q: string; cat: Categorie; uitkomst: ZoekUitkomst | null };
/** true = de zoekpagina heeft de melding overgenomen (preventDefault); anders moet de aanroeper zelf naar de pagina navigeren. */
export function meldZoekPagina(detail: NaarPaginaDetail): boolean {
  try {
    if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return false;
    const e = new CustomEvent<NaarPaginaDetail>(ZOEK_NAAR_PAGINA_EVENT, { detail, cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  } catch {
    return false;
  }
}
