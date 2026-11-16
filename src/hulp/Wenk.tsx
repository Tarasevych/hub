// Спливаюча підказка в стилі сайту для кнопок-піктограм (REESTR-LOGO-001, 16.11.2026). Павло: «на наведення має бути спливаюча
// підказка в своєму стилі», а не сіра системна (title). Той самий вигляд, що й у InfoTip (.info-tip-tekst), але навколо будь-якої
// кнопки: з'являється при наведенні або фокусі з клавіатури, ховається при відведенні, Esc чи прокрутці. Позиція fixed — картки з
// overflow:hidden її не обрізають; ніколи не виходить за край екрана. Текст пов'язано з кнопкою через aria-describedby.
// Zwevende hint in de stijl van de site rond een pictogramknop (geen native title).
import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import './hulp-knop.css';

type Kind = ReactElement<{ 'aria-describedby'?: string }>;

export default function Wenk({ tekst, children }: { tekst: ReactNode; children: Kind }) {
  const id = useId();
  const wortel = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [plek, setPlek] = useState<CSSProperties>({});
  const zet = useCallback(() => {
    const r = wortel.current?.getBoundingClientRect(); if (!r) return;
    const breed = Math.min(300, window.innerWidth - 16);
    const w = Math.min(breed, tip.current?.offsetWidth || breed);
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    const hoog = tip.current?.offsetHeight || 0;
    const erboven = r.bottom + 8 + hoog > window.innerHeight - 8 && r.top - 8 - hoog > 8;
    setPlek(erboven ? { bottom: Math.round(window.innerHeight - r.top + 8), left: Math.round(left), maxWidth: breed } : { top: Math.round(r.bottom + 8), left: Math.round(left), maxWidth: breed });
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    zet(); const raf = window.requestAnimationFrame(zet);
    const dicht = () => setOpen(false);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('scroll', dicht, true); window.addEventListener('resize', dicht); document.addEventListener('keydown', esc);
    return () => { window.cancelAnimationFrame(raf); window.removeEventListener('scroll', dicht, true); window.removeEventListener('resize', dicht); document.removeEventListener('keydown', esc); };
  }, [open, zet]);
  // Op een aanraakscherm geen zwevende hint (hij zou blijven hangen na de tik); daar zegt aria-label/de rij zelf genoeg.
  const [aanraak, setAanraak] = useState(false);
  useEffect(() => { try { setAanraak(window.matchMedia('(hover: none)').matches); } catch { /* geen matchMedia */ } }, []);
  return <span ref={wortel} className='wenk' onMouseEnter={() => !aanraak && setOpen(true)} onMouseLeave={() => setOpen(false)}
    onFocus={(e) => { if (!aanraak && (e.target as HTMLElement).matches?.(':focus-visible')) setOpen(true); }} onBlur={() => setOpen(false)}>
    {cloneElement(children, { 'aria-describedby': id })}
    <span id={id} ref={tip} role='tooltip' className='info-tip-tekst wenk-tekst' style={plek} hidden={!open}>{tekst}</span>
  </span>;
}
