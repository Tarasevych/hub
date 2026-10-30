// Externe beelden per afzender (pakket 2 «Adaptive Mail Canvas», 24.10.2026): «Завжди від цього відправника» in de veiligheidsstrook
// van een brief en in het contextpaneel («Безпека»). Alleen op dit apparaat (localStorage, zoals «Вигляд»): het is een keuze over wat
// deze browser ophaalt, niet over de post zelf. Adressen genormaliseerd (kleine letters, zonder naam), hoogstens 300, nieuwste achteraan.
import { useSyncExternalStore } from 'react';
import { normalizeMailAddress } from '../mail-email';

export const BEELDEN_SLEUTEL = 'mail-beelden-afzenders-v1';
export const BEELDEN_MAX = 300;
const luisteraars = new Set<() => void>();
let cache: string[] | null = null;

function lijst(): string[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(BEELDEN_SLEUTEL) || '[]');
    cache = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.includes('@')).slice(-BEELDEN_MAX) : [];
  } catch { cache = []; }
  return cache;
}
const melden = () => { for (const l of luisteraars) l(); };

/** Toont deze browser externe beelden van dit adres altijd? */
export function beeldenAltijd(from: string): boolean {
  const a = normalizeMailAddress(from);
  return Boolean(a) && lijst().includes(a);
}
/** Zet «altijd» aan of uit voor dit adres (het adres gaat naar achteren bij opnieuw aanzetten; de oudste valt weg boven 300). */
export function zetBeeldenAltijd(from: string, aan: boolean): void {
  const a = normalizeMailAddress(from);
  if (!a) return;
  const zonder = lijst().filter((x) => x !== a);
  cache = (aan ? [...zonder, a] : zonder).slice(-BEELDEN_MAX);
  try { localStorage.setItem(BEELDEN_SLEUTEL, JSON.stringify(cache)); } catch { /* privévenster: alleen deze sessie */ }
  melden();
}
const abonneer = (l: () => void) => {
  luisteraars.add(l);
  const opslag = (e: StorageEvent) => { if (e.key === BEELDEN_SLEUTEL) { cache = null; l(); } }; // ander tabblad
  if (typeof window !== 'undefined') window.addEventListener('storage', opslag);
  return () => { luisteraars.delete(l); if (typeof window !== 'undefined') window.removeEventListener('storage', opslag); };
};
/** React: of externe beelden van dit adres altijd mogen (volgt wijzigingen in elk onderdeel en andere tabbladen). */
export function useBeeldenAltijd(from: string): boolean {
  return useSyncExternalStore(abonneer, () => beeldenAltijd(from), () => false);
}
/** Alleen voor tests: de cache vergeten (na het wisselen van een nagebootste localStorage). */
export function vergeetBeeldenCache() { cache = null; }
