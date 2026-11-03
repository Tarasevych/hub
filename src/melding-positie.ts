// Slimme plaatsing van het meldingenvenster en de pop-up bij de bel: altijd volledig binnen het scherm, aan de kant met de meeste ruimte (boven of onder,
// links of rechts van de bel), met een maximale hoogte zodat inhoud scrollt in plaats van buiten beeld te vallen. Zuivere functie (getest).
export type Box = { left: number; top: number; width: number; height: number };
export type Placement = { left: number; top: number; maxHeight: number; side: 'above' | 'below' };

/**
 * INTEG-001: het pijltje dat het venster (paneel of pop-up) zichtbaar aan de bel vastmaakt. Staat het venster onder de bel, dan op de
 * bovenrand ('boven'); erboven: op de onderrand ('onder'); horizontaal boven het midden van de bel, binnen de randen van het venster.
 * Overlapt het venster de bel (geen ruimte), dan geen pijltje (null).
 */
export type Pijl = { left: number; top: number; kant: 'boven' | 'onder' };
export function pijlNaarBel(venster: Box, bel: Box, maat = 14): Pijl | null {
  if (venster.width < maat * 3 || venster.height < maat) return null;
  const midden = bel.left + bel.width / 2;
  const left = Math.round(Math.max(venster.left + 12, Math.min(venster.left + venster.width - 12 - maat, midden - maat / 2)));
  if (venster.top >= bel.top + bel.height - 1) return { left, top: Math.round(venster.top - maat / 2), kant: 'boven' };
  if (venster.top + venster.height <= bel.top + 1) return { left, top: Math.round(venster.top + venster.height - maat / 2), kant: 'onder' };
  return null;
}

/** Strook van het vensterdok (src/platform/vensters.css: --venster-dok-<rand> op <html>) uit het kader halen: het venster komt er nooit onder. */
export function zonderDok<T extends Box>(kader: T, dok: { boven: number; onder: number; links: number; rechts: number }): T {
  return { ...kader, left: kader.left + dok.links, top: kader.top + dok.boven, width: Math.max(0, kader.width - dok.links - dok.rechts), height: Math.max(0, kader.height - dok.boven - dok.onder) };
}

export function placeNear(anchor: Box, size: { width: number; height: number }, viewport: Box, opts: { pad?: number; gap?: number } = {}): Placement {
  const pad = opts.pad ?? 8; const gap = opts.gap ?? 8;
  const width = Math.min(size.width, viewport.width - pad * 2);
  const spaceAbove = anchor.top - viewport.top - pad - gap;
  const spaceBelow = viewport.top + viewport.height - (anchor.top + anchor.height) - pad - gap;
  // Past het hele venster boven (of onder) de bel, dan daar; anders naar de kant met de meeste ruimte, met een maximale hoogte.
  const fitsAbove = size.height <= spaceAbove; const fitsBelow = size.height <= spaceBelow;
  const side: 'above' | 'below' = fitsAbove ? 'above' : fitsBelow ? 'below' : spaceAbove >= spaceBelow ? 'above' : 'below';
  const room = Math.max(120, side === 'above' ? spaceAbove : spaceBelow);
  const height = Math.min(size.height, room);
  const top = side === 'above' ? anchor.top - gap - height : anchor.top + anchor.height + gap;
  // Horizontaal: rechterrand gelijk aan de bel; past dat niet, schuif dan binnen het scherm.
  const left = Math.max(viewport.left + pad, Math.min(anchor.left + anchor.width - width, viewport.left + viewport.width - width - pad));
  return { left: Math.round(left), top: Math.round(Math.max(viewport.top + pad, top)), maxHeight: Math.round(room), side };
}
