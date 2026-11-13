// Eén laag voor paneel (rechts), onderblad (telefoon) en kleine vensters: focus erin, Esc sluit, focus terug naar de knop die
// opende, Tab blijft binnen de laag. Geen eigen browservensters (geen alert/confirm/prompt).
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { tr, type Lang } from '../tekst';

type Props = { lang: Lang; soort: 'paneel' | 'blad' | 'venster'; titel: string; onSluit: () => void; children: ReactNode; data?: Record<string, string>; breed?: boolean };
export default function Laag({ lang, soort, titel, onSluit, children, data = {}, breed }: Props) {
  const vak = useRef<HTMLDivElement | null>(null);
  const terug = useRef<HTMLElement | null>(typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
  useEffect(() => {
    const eerste = vak.current?.querySelector<HTMLElement>('[data-agv-eerste], input, select, textarea, button:not(.agv-laag-sluit)');
    (eerste || vak.current)?.focus();
    const knop = terug.current;
    return () => { if (knop && document.contains(knop)) knop.focus(); };
  }, []);
  const toets = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onSluit(); return; }
    if (e.key !== 'Tab' || !vak.current) return;
    const f = Array.from(vak.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex="0"],summary')).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const [a, z] = [f[0], f[f.length - 1]];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };
  const dataAttr = Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v]));
  return (
    <div className={`agv-laag is-${soort}`} data-mq-laag-open='1' onMouseDown={(e) => { if (e.target === e.currentTarget) onSluit(); }}>
      <div ref={vak} className={`agv-laag-vak${breed ? ' is-breed' : ''}`} role='dialog' aria-modal='true' aria-label={titel} tabIndex={-1} onKeyDown={toets} {...dataAttr}>
        <header className='agv-laag-kop'>
          <h2>{titel}</h2>
          <button type='button' className='agv-icoonknop agv-laag-sluit' onClick={onSluit} aria-label={tr(lang, 'Закрити', 'Sluiten')}><X aria-hidden='true' /></button>
        </header>
        <div className='agv-laag-inhoud'>{children}</div>
      </div>
    </div>
  );
}
