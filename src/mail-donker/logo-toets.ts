/**
 * Logo-toets (donkere mailweergave): achter elk mogelijk transparant beeld legt shared/mail-donker.ts een licht plaatje
 * (alleen achtergrondkleur, geen maat). Zodra het beeld geladen is en de pixels leesbaar zijn (data:, blob: van de eigen
 * server/inline-bijlage — zelfde oorsprong), meten we: is het echt transparant én donker op transparant? Zo niet, dan gaat het
 * plaatje weg (een foto of een licht logo heeft het niet nodig). Onleesbaar (ander domein, «tainted» canvas) → plaatje blijft:
 * veilig, nooit omkeren.
 */
export type LogoOordeel = 'donker-transparant' | 'licht-transparant' | 'dekkend' | 'onbekend';

/** Beoordeelt RGBA-pixels (stap = elke n-de pixel). Puur, testbaar. */
export function beoordeelPixels(data: ArrayLike<number>, stap = 1): LogoOordeel {
  let totaal = 0, doorzichtig = 0, som = 0, dekkend = 0;
  for (let i = 0; i + 3 < data.length; i += 4 * stap) {
    totaal += 1;
    const a = data[i + 3];
    if (a < 200) doorzichtig += 1;
    if (a > 40) { dekkend += 1; som += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255; }
  }
  if (!totaal) return 'onbekend';
  if (doorzichtig / totaal < 0.05) return 'dekkend';
  if (!dekkend) return 'licht-transparant';
  return som / dekkend < 0.55 ? 'donker-transparant' : 'licht-transparant';
}

export function toetsLogo(img: HTMLImageElement): LogoOordeel {
  if (!img.complete || !img.naturalWidth) return 'onbekend';
  try {
    const w = Math.min(64, img.naturalWidth), h = Math.min(64, img.naturalHeight || 1);
    const c = (img.ownerDocument || document).createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) return 'onbekend';
    ctx.drawImage(img, 0, 0, w, h);
    return beoordeelPixels(ctx.getImageData(0, 0, w, h).data);
  } catch { return 'onbekend'; }
}

/** Koppelt de toets aan alle beelden met een plaatje in `doc`. */
export function volgLogos(doc: Document) {
  const pas = (img: HTMLImageElement) => {
    const o = toetsLogo(img);
    if (o === 'dekkend' || o === 'licht-transparant') { img.style.removeProperty('background-color'); img.dataset.mailDonkerLogo = o; }
    else if (o === 'donker-transparant') img.dataset.mailDonkerLogo = 'plaat-bevestigd';
  };
  doc.querySelectorAll<HTMLImageElement>('img[data-mail-donker-logo="plaat"]').forEach((img) => {
    if (img.complete && img.naturalWidth) pas(img); else img.addEventListener('load', () => pas(img), { once: true });
  });
}
