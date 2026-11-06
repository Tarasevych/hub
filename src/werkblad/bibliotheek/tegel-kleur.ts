// Kleur van een bibliotheektegel en de tekst/glief daarop. Dezelfde vlag (donker) kiest beide, zodat ze nooit uiteenlopen.
// In donker zijn de tegelkleuren uit ACCENT_KLEUREN pastel: wit haalde daar 1,2–2,6:1 (oude fout, 05.11.2026), donkere tekst haalt
// ≥ 7:1. In licht blijft het wit (≥ 4,4:1; een glief vraagt 3:1). Rekentest: tests/eenheid/contrast-tegels-20261105.test.ts.
import type { CSSProperties } from 'react';
import { ACCENT_KLEUREN, type Accent } from '../../../shared/menu-model';

/** Tekst/glief op de tegelkleur per modus: wit op de lichte varianten, bijna-zwart (= --text-on-vlak in donker) op de pastel. */
export const BIB_TEKST = Object.freeze({ licht: '#ffffff', donker: '#10161c' } as const);

export const accentStijl = (accent: Accent | undefined, donker: boolean): CSSProperties | undefined => {
  if (!accent) return undefined;
  const modus = donker ? 'donker' : 'licht';
  return { ['--bib-accent' as string]: ACCENT_KLEUREN[accent][modus].hoofd, ['--bib-accent-tekst' as string]: BIB_TEKST[modus] } as CSSProperties;
};
