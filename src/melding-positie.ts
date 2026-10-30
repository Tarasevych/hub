// Slimme plaatsing van het meldingenvenster en de pop-up bij de bel: altijd volledig binnen het scherm, aan de kant met de meeste ruimte (boven of onder,
// links of rechts van de bel), met een maximale hoogte zodat inhoud scrollt in plaats van buiten beeld te vallen. Zuivere functie (getest).
export type Box = { left: number; top: number; width: number; height: number };
export type Placement = { left: number; top: number; maxHeight: number; side: 'above' | 'below' };

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
