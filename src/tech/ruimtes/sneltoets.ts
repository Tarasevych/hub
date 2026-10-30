// Sneltoets voor de wissel: Ctrl+Alt+1 = звичайний простір, Ctrl+Alt+2 = технічний простір (ook Ctrl+Option+1/2 op de Mac).
// Waarom deze: Ctrl+1…9 (tabbladen), Alt+1…9 (sommige browsers), Alt+Shift (wisselen van toetsenbordtaal in Windows) zijn bezet.
// Ctrl+Alt is op sommige toetsenborden AltGr; AltGr+1/2 typt daar een teken (bv. ² in het Duits/Pools). Daarom: met
// getModifierState('AltGraph') NIET wisselen — dan typt de toets gewoon zoals altijd. We kijken naar e.code (Digit1/Numpad1),
// zodat de Oekraïense indeling niet uitmaakt.
import type { SleutelRuimte as RuimteScope } from './ruimte-sleutel';

export type ToetsLike = { ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; code: string; repeat?: boolean; getModifierState?: (k: string) => boolean };
/** Pure beslissing (getest): welke ruimte vraagt deze toets, of null. */
export function sneltoetsRuimte(e: ToetsLike): RuimteScope | null {
  if (!e.ctrlKey || !e.altKey || e.shiftKey || e.metaKey || e.repeat) return null;
  try { if (e.getModifierState?.('AltGraph')) return null; } catch { /* oude browser */ }
  if (e.code === 'Digit1' || e.code === 'Numpad1') return 'prive';
  if (e.code === 'Digit2' || e.code === 'Numpad2') return 'technisch';
  return null;
}
export const SNELTOETS_TEKST = { prive: 'Ctrl+Alt+1', technisch: 'Ctrl+Alt+2' } as const;
