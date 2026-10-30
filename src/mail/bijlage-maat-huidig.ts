import { bijlageMaatVan, type BijlageMaat } from '../../shared/bijlage-voorbeeld-maat';

const SLEUTEL = 'tsv:mail-view-preferences-v1:';

/** Розмір, який уже лежить у дзеркалі налаштувань цього браузера. Серверне поле — те саме. */
export function huidigeBijlageMaat(): BijlageMaat {
  try {
    if (typeof localStorage === 'undefined') return 'S';
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      if (!key.startsWith(SLEUTEL)) continue;
      const row = JSON.parse(localStorage.getItem(key) || '{}') as { attachmentHoverSize?: unknown };
      if (row && row.attachmentHoverSize) return bijlageMaatVan(row.attachmentHoverSize);
    }
  } catch { /* приватний режим або ще немає дзеркала */ }
  return 'S';
}
