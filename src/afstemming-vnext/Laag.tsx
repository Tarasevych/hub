// Laag (paneel rechts / volledig scherm op de telefoon / venster) voor Afstemming vNext: portaal in <body> boven de chrome
// (z-index 230 in afstemming.css), focus erin, Esc sluit (ook als de focus de laag verloor), Tab blijft binnen.
// Eén-op-één de werkwijze van src/cloud-vnext/Laag.tsx, alleen met afv-klassen en [data-afv-eerste] als eerste focusdoel.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { tr, type Lang } from './tekst';

type Props = { lang: Lang; soort: 'paneel' | 'scherm' | 'venster'; titel: string; onSluit: () => void; children: ReactNode; data?: Record<string, string> };
export default function Laag({ lang, soort, titel, onSluit, children, data = {} }: Props) {
  const vak = useRef<HTMLDivElement | null>(null);
  const terug = useRef<HTMLElement | null>(typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
  useEffect(() => {
    const eerste = vak.current?.querySelector<HTMLElement>('[data-afv-eerste], input, textarea, select, button:not(.afv-laag-sluit)');
    (eerste || vak.current)?.focus();
    const knop = terug.current; const html = document.documentElement; const was = html.style.overflow; html.style.overflow = 'hidden';
    return () => { html.style.overflow = was; if (knop && document.contains(knop)) knop.focus(); };
  }, []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const lagen = document.querySelectorAll('.afv-laag'); if (lagen[lagen.length - 1] !== vak.current?.parentElement) return;
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
    <div className={`afv-laag is-${soort}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}>
      <div ref={vak} className='afv-laag-vak' role='dialog' aria-modal='true' aria-label={titel} tabIndex={-1} onKeyDown={toets} {...dataAttr}>
        <header className='afv-laag-kop'><h2>{titel}</h2><button type='button' className='afv-icoonknop afv-laag-sluit' onClick={onSluit} aria-label={tr(lang, 'Закрити', 'Sluiten')} title='Esc'><X aria-hidden='true' /></button></header>
        <div className='afv-laag-inhoud'>{children}</div>
      </div>
    </div>, document.body);
}
