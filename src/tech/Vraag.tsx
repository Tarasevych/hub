// «?» naast een opties: wat het is, wat er verandert, risico's — en, alleen in een actief technisch profiel, «Для розробників»
// (waarom zo gebouwd, welke alternatieven). Opent bij aanwijzen, focus of tik; sluit met Esc of door weg te gaan. Toegankelijk:
// echte knop met aria-expanded en aria-controls, de uitleg is gewone tekst (geen title-attribuut dat schermlezers missen).
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { HelpLagen } from '../../shared/tech-rollen';
import { techActief, useTech } from './tech-store';
import './tech.css';

export default function Vraag({ help, uk, label }: { help: HelpLagen; uk: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [vast, setVast] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement | null>(null);
  const pop = useRef<HTMLSpanElement | null>(null);
  const t = useTech();
  const dev = techActief(t) && !!help.dev;
  const [plek, setPlek] = useState<CSSProperties>({ visibility: 'hidden' });
  // Uitleg in een portal met vaste positie: anders knipt een venster of paneel (overflow) haar af. Onder de knop, of erboven als
  // er onderaan geen plaats is; altijd binnen het scherm.
  useLayoutEffect(() => {
    if (!open) return;
    const zet = () => {
      const k = wrap.current?.getBoundingClientRect(); const h = pop.current?.offsetHeight || 0; const w = pop.current?.offsetWidth || 340;
      if (!k) return;
      const left = Math.min(Math.max(8, k.left + k.width / 2 - w / 2), window.innerWidth - w - 8);
      const onder = k.bottom + 6 + h <= window.innerHeight - 8 || k.top < h + 14;
      setPlek({ left, top: onder ? Math.min(k.bottom + 6, window.innerHeight - h - 8) : k.top - h - 6 });
    };
    zet();
    window.addEventListener('resize', zet); window.addEventListener('scroll', zet, true);
    return () => { window.removeEventListener('resize', zet); window.removeEventListener('scroll', zet, true); };
  }, [open, dev]);
  const tx = (p: readonly [string, string]) => (uk ? p[0] : p[1]);
  useEffect(() => {
    if (!open) return;
    // Esc sluit eerst alleen de uitleg (vangfase: vóór het venster eromheen, dat anders mee zou sluiten).
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); setVast(false); } };
    const buiten = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node)) { setOpen(false); setVast(false); } };
    document.addEventListener('keydown', esc, true); document.addEventListener('pointerdown', buiten, true);
    return () => { document.removeEventListener('keydown', esc, true); document.removeEventListener('pointerdown', buiten, true); };
  }, [open]);
  return (
    <span className='tech-vraag' ref={wrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => { if (!vast) setOpen(false); }}>
      <button type='button' className='tech-vraag-knop' aria-expanded={open} aria-controls={id} aria-label={label ? `${uk ? 'Пояснення' : 'Uitleg'}: ${label}` : (uk ? 'Пояснення' : 'Uitleg')}
        onFocus={() => setOpen(true)} onBlur={(e) => { if (!vast && !wrap.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
        onClick={() => { setVast((v) => !v); setOpen(true); }}>?</button>
      {open ? createPortal(
        <span id={id} ref={pop} role='note' className='tech-vraag-uitleg' data-tech-vraag='1' style={plek}
          onMouseEnter={() => setOpen(true)} onMouseLeave={() => { if (!vast) setOpen(false); }}>
          <span className='tech-vraag-laag'><b>{uk ? 'Що це' : 'Wat is het'}</b>{tx(help.wat)}</span>
          <span className='tech-vraag-laag'><b>{uk ? 'Що зміниться' : 'Wat verandert er'}</b>{tx(help.gevolg)}</span>
          {help.risico ? <span className='tech-vraag-laag is-risico'><b>{uk ? 'Ризики' : 'Risico\'s'}</b>{tx(help.risico)}</span> : null}
          {dev ? <span className='tech-vraag-laag is-dev' data-tech-vraag-dev='1'><b>{uk ? 'Для розробників' : 'Voor ontwikkelaars'}</b>{tx(help.dev!)}</span> : null}
        </span>, document.body,
      ) : null}
    </span>
  );
}
