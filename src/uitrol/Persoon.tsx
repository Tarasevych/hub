// Rond/afgerond gezicht van een account: echte foto (als de site er een heeft), anders een monogram met vaste kleur per naam.
// Apart bestand zodat de pagina «Хто готує оновлення» en de zijkolom hetzelfde gezicht tonen.
import { useState } from 'react';

const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

export default function Persoon({ naam, id, foto, klein = false }: { naam: string; id?: string; foto?: string | null; klein?: boolean }) {
  const [stuk, setStuk] = useState(false);
  const h = hue(id || naam || '?');
  const klasse = `ut-avatar ut-persoon${klein ? ' is-klein' : ''}`;
  if (foto && !stuk) return <span className={klasse} aria-hidden='true'><img src={foto} alt='' loading='lazy' decoding='async' referrerPolicy='no-referrer' onError={() => setStuk(true)} /></span>;
  return <span className={klasse} style={{ background: `linear-gradient(140deg,hsl(${h} 58% 30%),hsl(${(h + 50) % 360} 62% 26%))` }} aria-hidden='true'>{[...(naam || '').trim()][0]?.toUpperCase() || '?'}</span>;
}
