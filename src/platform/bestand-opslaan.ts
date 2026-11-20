// IDENTITEIT-014: спільний помічник «віддати файл людині» (a[download], без переходу на іншу сторінку). Раніше жив лише в
// src/cloud-vnext/hulp.ts; звідти його тепер реекспортовано, щоб налаштування не тягнули клієнт хмари у свій фрагмент збірки.
// Gedeelde helper om een Blob als download aan de mens te geven; cloud-vnext exporteert hem opnieuw.

/** Blob als download aan de gebruiker geven (a[download], geen navigatie). */
export function bewaarBlob(naam: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = naam || 'bestand'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
