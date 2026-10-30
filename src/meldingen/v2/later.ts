// UI-014: «Нагадати через годину» — een kaart tijdelijk uit «Важливі/Усі/Непрочитані» (niet uit «Уся історія»). Per apparaat
// (localStorage); na de tijd komt hij vanzelf terug. Niets wordt gewist of als gelezen gemarkeerd.
const SLEUTEL = 'mr-meldingen-later-v1';
export function laterActief(nu = Date.now()): Record<string, number> {
  try { const o = JSON.parse(localStorage.getItem(SLEUTEL) || '{}') as Record<string, number>; return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number' && v > nu)); } catch { return {}; }
}
export function zetLater(sleutel: string, tot: number): Record<string, number> {
  const o = { ...laterActief(), [sleutel]: tot };
  try { localStorage.setItem(SLEUTEL, JSON.stringify(Object.fromEntries(Object.entries(o).slice(-200)))); } catch { /* geen opslag */ }
  return o;
}
