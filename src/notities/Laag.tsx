// Eén laag voor het bewerkpaneel (rechts op een breed scherm), het volledige scherm (telefoon) en kleine vensters: focus erin,
// Esc sluit, focus terug naar de knop die opende, Tab blijft binnen de laag. Geen alert/confirm/prompt van de browser.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { tr, type Lang } from './tekst';

type Props = { lang: Lang; soort: 'paneel' | 'scherm' | 'venster'; titel: string; onSluit: () => void; children: ReactNode; data?: Record<string, string>; kopExtra?: ReactNode };
export default function Laag({ lang, soort, titel, onSluit, children, data = {}, kopExtra }: Props) {
  const vak = useRef<HTMLDivElement | null>(null);
  const terug = useRef<HTMLElement | null>(typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
  useEffect(() => {
    const eerste = vak.current?.querySelector<HTMLElement>('[data-vn-eerste], input, textarea, select, button:not(.vn-laag-sluit)');
    (eerste || vak.current)?.focus();
    const knop = terug.current;
    const html = document.documentElement; const was = html.style.overflow; html.style.overflow = 'hidden';
    return () => { html.style.overflow = was; if (knop && document.contains(knop)) knop.focus(); };
  }, []);
  // Esc óók als de focus buiten de laag is geraakt (bv. de knop waarop geklikt werd is net verdwenen): op venster-niveau, alleen
  // voor de bovenste laag. Zo blijft Esc altijd «sluiten», wat de focus ook doet.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const lagen = document.querySelectorAll('.vn-laag'); if (lagen[lagen.length - 1] !== vak.current?.parentElement) return;
      if (vak.current && vak.current.contains(document.activeElement)) return; // de laag zelf handelt het af (toets hieronder)
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
  // Als portaal in <body>: de werkruimte van de chrome is een eigen stapelcontext (z-index 1), dus daarbinnen zou de laag
  // ONDER de bovenbalk en het accountmenu (z-index 220) blijven. De themaklasse staat ook op <html>, dus de kleuren kloppen.
  return createPortal(
    <div className={`vn-laag is-${soort}`} data-mq-laag-open='1' onMouseDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}>
      <div ref={vak} className='vn-laag-vak' role='dialog' aria-modal='true' aria-label={titel} tabIndex={-1} onKeyDown={toets} {...dataAttr}>
        <header className='vn-laag-kop'>
          <h2>{titel}</h2>
          {kopExtra}
          <button type='button' className='vn-icoonknop vn-laag-sluit' onClick={onSluit} aria-label={tr(lang, 'Закрити', 'Sluiten')} title={tr(lang, 'Закрити (Esc)', 'Sluiten (Esc)')}><X aria-hidden='true' /></button>
        </header>
        <div className='vn-laag-inhoud'>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
