// Мініатюра лише в браузері: менше пікселів, без EXIF. Сервер користувацький файл не бачить.

/** Перші символи для текстової плитки. */
export function tekstTegel(tekst: string, max = 400): string {
  return String(tekst || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Зображення → WebP близько 320 px. null, якщо API немає або кадр завеликий (понад 40 Мпікс). */
export async function maakBeeldMiniatuur(blob: Blob, maxPx = 320): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function' || !blob) return null;
  const bitmap = await createImageBitmap(blob);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000) return null;
    const schaal = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * schaal));
    const h = Math.max(1, Math.round(bitmap.height * schaal));
    const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    if ('convertToBlob' in canvas) return await canvas.convertToBlob({ type: 'image/webp', quality: 0.7 });
    return await new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob((b) => resolve(b), 'image/webp', 0.7));
  } finally { bitmap.close?.(); }
}
