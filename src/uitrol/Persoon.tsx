// Rond/afgerond gezicht van een account: echte foto (als de site er een heeft), anders een monogram met vaste kleur per naam.
// Apart bestand zodat de pagina «Хто готує оновлення» en de zijkolom hetzelfde gezicht tonen.
import { useEffect, useState } from 'react';
import { cachedAvatarUrl, normalizeAvatarUrl } from '../gedeelde-voorkeuren';

const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

/**
 * Повертає фото профілю учасника: серверні дані, а кеш профілю й аватар шапки — ЛИШЕ коли це сам глядач (ikZelf).
 * Раніше кожен учасник без фото отримував фото того, хто дивиться сторінку (15.11.2026).
 * Foto van een deelnemer; de cache en het avatar in de kop alleen voor de kijker zelf.
 */
export function actieveAccountFoto(foto?: string | null, ikZelf = false): string {
  const direct = normalizeAvatarUrl(foto);
  if (direct || !ikZelf) return direct;
  const cached = cachedAvatarUrl();
  if (cached) return cached;
  if (typeof document !== 'undefined') {
    const img = document.querySelector<HTMLImageElement>('.canonical-account-avatar img, .id-foto-avatar img');
    const src = normalizeAvatarUrl(img?.currentSrc || img?.src || '');
    if (src) return src;
  }
  return '';
}

export default function Persoon({ naam, id, foto, klein = false, ikZelf = false }: { naam: string; id?: string; foto?: string | null; klein?: boolean; ikZelf?: boolean }) {
  const bron = actieveAccountFoto(foto, ikZelf);
  const [stuk, setStuk] = useState(false);
  useEffect(() => { setStuk(false); }, [bron]);
  const h = hue(id || naam || '?');
  const klasse = `ut-avatar ut-persoon${klein ? ' is-klein' : ''}`;
  if (bron && !stuk) return <span className={klasse} aria-hidden='true'><img src={bron} alt='' loading='lazy' decoding='async' referrerPolicy='no-referrer' onError={() => setStuk(true)} /></span>;
  return <span className={klasse} style={{ background: `linear-gradient(140deg,hsl(${h} 58% 30%),hsl(${(h + 50) % 360} 62% 26%))` }} aria-hidden='true'>{[...(naam || '').trim()][0]?.toUpperCase() || '?'}</span>;
}
