// Laag (paneel rechts / volledig scherm op de telefoon / venster) voor het huis: portaal in <body> boven de chrome, focus erin,
// Esc sluit (ook als de focus de laag verloor), Tab blijft binnen. Zelfde regels als src/notities/Laag.tsx.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useIsMaquette } from '../thema/useThema';
import { tr, type Lang } from './tekst';

type Props = { lang: Lang; soort: 'paneel' | 'scherm' | 'venster'; titel: string; onSluit: () => void; children: ReactNode; data?: Record<string, string> };
export default function HuisLaag({ lang, soort, titel, onSluit, children, data = {} }: Props) {
  const isMaquette = useIsMaquette();
  const vak = useRef<HTMLDivElement | null>(null);
  const terug = useRef<HTMLElement | null>(typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
  useEffect(() => {
    const eerste = vak.current?.querySelector<HTMLElement>('[data-hv-eerste], input, textarea, select, button:not(.hv-laag-sluit)');
    (eerste || vak.current)?.focus();
    const knop = terug.current; const html = document.documentElement; const was = html.style.overflow; html.style.overflow = 'hidden';
    return () => { html.style.overflow = was; if (knop && document.contains(knop)) knop.focus(); };
  }, []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const lagen = document.querySelectorAll('.hv-laag'); if (lagen[lagen.length - 1] !== vak.current?.parentElement) return;
      if (vak.current && vak.current.contains(document.activeElement)) return;
      e.preventDefault(); onSluit();
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  }, [onSluit]);
  const toets = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onSluit(); return; }
    if (e.key !== 'Tab' || !vak.current) return;
    const f = Array.from(vak.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex="0"]')).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const [a, z] = [f[0], f[f.length - 1]];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };
  const dataAttr = Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v]));
  return createPortal(
    <div
      className={`hv-laag is-${soort}${isMaquette ? ' is-maquette' : ''}`}
      data-mq-laag-open={isMaquette ? '1' : undefined}
      data-mq-dienst={isMaquette ? 'huis' : undefined}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}
    >
      <div ref={vak} className='hv-laag-vak' role='dialog' aria-modal='true' aria-label={titel} tabIndex={-1} onKeyDown={toets} {...dataAttr}>
        <header className='hv-laag-kop'><h2>{titel}</h2><button type='button' className='hv-icoonknop hv-laag-sluit' onClick={onSluit} aria-label={tr(lang, 'Закрити', 'Sluiten')} title='Esc'><X aria-hidden='true' /></button></header>
        <div className='hv-laag-inhoud'>{children}</div>
      </div>
    </div>, document.body);
}
