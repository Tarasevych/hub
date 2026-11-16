// Спливне меню поверх усього (ZWEVEND-001, 15.11.2026). Знімок власника: меню «⋯» у шапці «Живий робочий стіл» ховалося за смугою
// лічильників і краєм картки — бо вітрина .mq-held має overflow:hidden + isolation:isolate (декоративне сяйво мусить обрізатися).
// Рішення не «відкрити» картку, а винести саме меню в портал на рівень .canonical-chrome із position:fixed, координати — від кнопки.
// Zwevend menu: portaal naar .canonical-chrome (thema-variabelen blijven gelden), vaste plek naast de knop, binnen het venster
// geklemd; past het onder de knop niet, dan erboven. Herberekend bij scrollen (capture) en bij een andere vensterbreedte.
import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import './zwevend-menu.css';

export type ZwevendOpties = { uitlijning?: 'begin' | 'eind'; gat?: number; rand?: number };

/** Puur (getest): plek van een popover met afmeting `pop` naast knop `knop` binnen venster `vw`×`vh`. */
export function zwevendePlek(knop: { left: number; right: number; top: number; bottom: number }, pop: { width: number; height: number }, vw: number, vh: number, o: ZwevendOpties = {}): { top: number; left: number; boven: boolean } {
  const gat = o.gat ?? 6, rand = o.rand ?? 10;
  const voorkeur = o.uitlijning === 'begin' ? knop.left : knop.right - pop.width;
  const left = Math.min(Math.max(rand, voorkeur), Math.max(rand, vw - pop.width - rand));
  const onder = vh - knop.bottom - gat, boven = knop.top - gat;
  const naarBoven = onder < pop.height + rand && boven > onder;
  const top = naarBoven ? Math.max(rand, knop.top - gat - pop.height) : Math.min(knop.bottom + gat, Math.max(rand, vh - pop.height - rand));
  return { top: Math.round(top), left: Math.round(left), boven: naarBoven };
}

export function useZwevendePlek(open: boolean, knop: RefObject<HTMLElement | null>, pop: RefObject<HTMLElement | null>, o: ZwevendOpties = {}): CSSProperties | null {
  const [stijl, zetStijl] = useState<CSSProperties | null>(null);
  const { uitlijning, gat, rand } = o;
  const plaats = useCallback(() => {
    const k = knop.current, p = pop.current; if (!k || !p) return;
    const r = k.getBoundingClientRect(), m = p.getBoundingClientRect();
    const z = zwevendePlek(r, { width: m.width, height: m.height }, window.innerWidth, window.innerHeight, { uitlijning, gat, rand });
    zetStijl((oud) => (oud && oud.top === z.top && oud.left === z.left ? oud : { top: z.top, left: z.left }));
  }, [knop, pop, uitlijning, gat, rand]);
  useLayoutEffect(() => { if (open) plaats(); else zetStijl(null); }, [open, plaats]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', plaats); window.addEventListener('scroll', plaats, true);
    return () => { window.removeEventListener('resize', plaats); window.removeEventListener('scroll', plaats, true); };
  }, [open, plaats]);
  return stijl;
}

/** Portaal naar de dichtstbijzijnde .canonical-chrome (anders body). Geef de popover `zwevendStijl(stijl)`: eerst meten, dan tonen. */
export function ZwevendPortaal(p: { anker: RefObject<HTMLElement | null>; children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  const doel = (p.anker.current?.closest('.canonical-chrome') as HTMLElement | null) ?? document.body;
  return createPortal(p.children, doel);
}

/** Inline-stijl voor de popover: onzichtbaar tot de plek gemeten is. */
export const zwevendStijl = (s: CSSProperties | null): CSSProperties => s ?? { top: 0, left: 0, visibility: 'hidden' };
