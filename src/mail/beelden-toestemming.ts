// Externe beelden per afzender (pakket 2 «Adaptive Mail Canvas», 24.10.2026): «Завжди від цього відправника» in de veiligheidsstrook
// van een brief en in het contextpaneel («Безпека»). Alleen op dit apparaat (localStorage, zoals «Вигляд»): het is een keuze over wat
// deze browser ophaalt, niet over de post zelf. Adressen genormaliseerd (kleine letters, zonder naam), hoogstens 300, nieuwste achteraan.
//
// SEC-002 (interface-06, 12.11.2026): de lijst stond onder ÉÉN sleutel voor de hele browser. De site kent meerdere accounts per
// browser: wat account A «altijd» toestond, gold dan ook voor de brieven van account B (de afzender zag dat B de brief opende),
// en B kon de lijst van A lezen en wijzigen. Nu één lijst per BEREIK = site-account (+ ruimte) + mailbox — dezelfde sleutel als de
// privécache van de post (`cacheAccountId`, src/mail-bijlage-cache.ts → mailCacheScope). Zonder bereik (niet aangemeld, tests):
// 'anon'. De oude gedeelde lijst (v1) wordt bij het eerste gebruik gewist en NIET overgenomen: van wie zij was, is niet te zeggen.
import { useSyncExternalStore } from 'react';
import { normalizeMailAddress } from '../mail-email';
import { normaliseerWeergave, WEERGAVE_SLEUTEL, type LezerBeelden } from './lees-modus';
import { BEELDEN_VOORVOEGSEL, naWissen } from '../lokale-sporen';

/** Voorvoegsel van alle lijsten (v2), uit src/lokale-sporen.ts: dat wist ermee bij afmelden. */
export { BEELDEN_VOORVOEGSEL };
const OUDE_SLEUTEL = 'mail-beelden-afzenders-v1';
/** Opslagsleutel van één bereik ('' = niet aangemeld / onbekend → 'anon'; deelt niets met een aangemeld account). */
export const beeldenSleutel = (bereik = ''): string => `${BEELDEN_VOORVOEGSEL}${bereik ? encodeURIComponent(bereik) : 'anon'}`;
/** De sleutel zonder bereik (tests, niet aangemeld). */
export const BEELDEN_SLEUTEL = beeldenSleutel();
export const BEELDEN_MAX = 300;
const luisteraars = new Set<() => void>();
const cache = new Map<string, string[]>();
let oudGewist = false;

function lijst(bereik: string): string[] {
  const sleutel = beeldenSleutel(bereik);
  const bekend = cache.get(sleutel);
  if (bekend) return bekend;
  let uit: string[] = [];
  try {
    if (!oudGewist) { oudGewist = true; localStorage.removeItem(OUDE_SLEUTEL); }
    const v = JSON.parse(localStorage.getItem(sleutel) || '[]');
    uit = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.includes('@')).slice(-BEELDEN_MAX) : [];
  } catch { uit = []; }
  cache.set(sleutel, uit);
  return uit;
}
const melden = () => { for (const l of luisteraars) l(); };

/** Toont deze browser externe beelden van dit adres altijd — voor dit bereik (account + mailbox)? */
export function beeldenAltijd(from: string, bereik = ''): boolean {
  const a = normalizeMailAddress(from);
  return Boolean(a) && lijst(bereik).includes(a);
}
/** Zet «altijd» aan of uit voor dit adres in dit bereik (het adres gaat naar achteren bij opnieuw aanzetten; de oudste valt weg boven 300). */
export function zetBeeldenAltijd(from: string, aan: boolean, bereik = ''): void {
  const a = normalizeMailAddress(from);
  if (!a) return;
  const zonder = lijst(bereik).filter((x) => x !== a);
  const nieuw = (aan ? [...zonder, a] : zonder).slice(-BEELDEN_MAX);
  cache.set(beeldenSleutel(bereik), nieuw);
  try { localStorage.setItem(beeldenSleutel(bereik), JSON.stringify(nieuw)); } catch { /* privévenster: alleen deze sessie */ }
  melden();
}
/** De twee functies vast aan één bereik (voor een onderdeel dat het bereik als eigenschap krijgt). */
export const beeldenVoor = (bereik = '') => ({
  altijd: (from: string) => beeldenAltijd(from, bereik),
  zet: (from: string, aan: boolean) => zetBeeldenAltijd(from, aan, bereik),
});
const abonneer = (l: () => void) => {
  luisteraars.add(l);
  const opslag = (e: StorageEvent) => { if (e.key === null || e.key.startsWith(BEELDEN_VOORVOEGSEL)) { cache.clear(); l(); } }; // ander tabblad
  if (typeof window !== 'undefined') window.addEventListener('storage', opslag);
  return () => { luisteraars.delete(l); if (typeof window !== 'undefined') window.removeEventListener('storage', opslag); };
};
/** React: of externe beelden van dit adres altijd mogen in dit bereik (volgt wijzigingen in elk onderdeel en andere tabbladen). */
export function useBeeldenAltijd(from: string, bereik = ''): boolean {
  return useSyncExternalStore(abonneer, () => beeldenAltijd(from, bereik), () => false);
}
/** Alleen voor tests: de cache vergeten (na het wisselen van een nagebootste localStorage). */
export function vergeetBeeldenCache() { cache.clear(); oudGewist = false; }
/** Na het wissen van lijsten in localStorage (afmelden, src/lokale-sporen.ts): het geheugen volgt en de onderdelen tekenen opnieuw. */
export function beeldenLijstenGewist(): void { cache.clear(); melden(); }
naWissen.add(beeldenLijstenGewist);

/**
 * SEC-002 (post-05): welke instelling «Зовнішні зображення» geldt voor een brief. BINNEN het leesvenster die van het kader;
 * BUITEN het leesvenster (venster «Попередній перегляд») de op dit apparaat bewaarde instelling van datzelfde leesvenster, en
 * zonder bewaarde keuze 'vragen'. Vroeger was dat buiten het kader altijd 'altijd': het voorbeeldvenster haalde elk extern beeld
 * meteen op en de afzender zag dat de brief geopend was, terwijl de lezer zelf «vragen» beloofde.
 */
export function beeldenInstelling(kader: { beelden: LezerBeelden } | null | undefined, lees: (sleutel: string) => string | null = leesOpslag): LezerBeelden {
  if (kader) return kader.beelden === 'altijd' ? 'altijd' : 'vragen';
  try { return normaliseerWeergave(JSON.parse(lees(WEERGAVE_SLEUTEL) || 'null')).beelden; } catch { return 'vragen'; }
}
const leesOpslag = (sleutel: string): string | null => { try { return localStorage.getItem(sleutel); } catch { return null; } };
