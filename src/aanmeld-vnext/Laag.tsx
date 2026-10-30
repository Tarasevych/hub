// UI-015 — de modale laag van een methodedetail (zelfde gedrag als src/afstemming-vnext/Laag.tsx, met amv-klassen):
// Escape sluit, de focus blijft binnen het vak en keert bij het sluiten terug naar het element dat de laag opende.
// Op een smal scherm wordt het detail een volledig scherm (css .amv-laag.is-scherm), elders een zijpaneel.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Lang } from '../toegangslaag-teksten';

const tr = (lang: Lang, uk: string, nl: string) => (lang === 'nl' ? nl : uk);

type Props = { lang: Lang; soort: 'paneel' | 'scherm'; titel: string; onSluit: () => void; children: ReactNode; data?: Record<string, string> };
export default function Laag({ lang, soort, titel, onSluit, children, data = {} }: Props) {
  const vak = useRef<HTMLDivElement | null>(null);
  const terug = useRef<HTMLElement | null>(null);
  useEffect(() => {
    terug.current = document.activeElement as HTMLElement | null;
    vak.current?.focus();
    // Zoals afstemming-vnext/Laag.tsx: de achtergrond scrolt niet mee zolang de laag open is — dat voorkomt
    // «doorscrollen» op mobiel én de scrollbalkgeul, zodat het detail op een smal scherm echt beeldvullend is.
    const html = document.documentElement; const was = html.style.overflow; html.style.overflow = 'hidden';
    const toets = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onSluit();
    };
    window.addEventListener('keydown', toets);
    return () => { window.removeEventListener('keydown', toets); html.style.overflow = was; try { terug.current?.focus?.(); } catch { /* element weg */ } };
  }, [onSluit]);
  const vang = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onSluit(); return; }
    if (e.key !== 'Tab' || !vak.current) return;
    const doelen = vak.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!doelen.length) return;
    const eerste = doelen[0], laatste = doelen[doelen.length - 1];
    if (e.shiftKey && document.activeElement === eerste) { e.preventDefault(); laatste.focus(); }
    else if (!e.shiftKey && document.activeElement === laatste) { e.preventDefault(); eerste.focus(); }
  };
  const dataAttr = Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v]));
  // Portaal in <body>, zoals afstemming/cloud: binnen de instellingenweergave zou een voorouder met transform het
  // «fixed»-kader overnemen en de laag smaller dan het scherm maken — in <body> is fixed écht het hele scherm.
  return createPortal(
    <div className={`amv-laag is-${soort}`} role='presentation' onMouseDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}>
      <div ref={vak} className='amv-laag-vak' role='dialog' aria-modal='true' aria-label={titel} tabIndex={-1} onKeyDown={vang} {...dataAttr}>
        <header className='amv-laag-kop'>
          <h2>{titel}</h2>
          <button type='button' className='amv-icoonknop' onClick={onSluit} aria-label={tr(lang, 'Закрити', 'Sluiten')}><X aria-hidden='true' /></button>
        </header>
        <div className='amv-laag-inhoud'>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
