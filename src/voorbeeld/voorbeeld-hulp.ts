// Zuivere hulpfuncties van het voorbeeld (zonder React of CSS), zodat de eenheidstests ze rechtstreeks kunnen laden.
import type { MailAttachment } from '../MailBijlageVoorbeeld';

/** Grootste aantal woorden dat (met «…») in `ruimte` px past — nooit midden in een woord. */
export function pasOpWoorden(tekst: string, ruimte: number, meet: (t: string) => number): string {
  if (meet(tekst) <= ruimte) return tekst;
  const woorden = tekst.replace(/…$/, '').split(' ');
  let lo = 1, hi = woorden.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (meet(`${woorden.slice(0, mid).join(' ')}…`) <= ruimte) lo = mid; else hi = mid - 1;
  }
  return `${woorden.slice(0, lo).join(' ').replace(/[\s,;:–—-]+$/, '')}…`;
}

/**
 * Ingesloten afbeelding uit de brief zelf (base64url → data-URL). Alleen rasterafbeeldingen; SVG niet (kan script bevatten);
 * nooit een externe URL — externe afbeeldingen blijven onder het bestaande beleid van MailMessageBody.
 */
export const ingeslotenBeeld = (r: { contentType: string; data: string }) => {
  const type = String(r.contentType || '').toLowerCase();
  if (!/^image\/(png|jpe?g|gif|webp|avif|bmp)$/.test(type) || !r.data) return '';
  const b64 = r.data.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  return /^[A-Za-z0-9+/=]+$/.test(b64) ? `data:${type};base64,${b64}` : '';
};

export const isBeeldBijlage = (a: Pick<MailAttachment, 'contentType' | 'filename'>) =>
  /^image\/(png|jpe?g|gif|webp|avif|bmp|heic|heif)$/i.test(a.contentType) || /\.(png|jpe?g|gif|webp|avif|bmp|heic)$/i.test(a.filename);

export const grootteTekst = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

/** Volgende/vorige index met ←/→ (rondlopend). */
export const volgende = (i: number, n: number, richting: 1 | -1) => (n <= 0 ? 0 : (i + richting + n) % n);
