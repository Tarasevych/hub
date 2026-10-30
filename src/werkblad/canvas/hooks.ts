// Werkblad v3 — React-hooks van het canvas: echte containerbreedte (ResizeObserver) en pointergebaren.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CanvasLayout } from '../../../shared/werkblad-v3-types';
import * as K from './kern';

/** Breedte van de ECHTE container (zijbalk in/uit, zoom, draaien, split-screen) — nooit window.innerWidth. */
export function useContainerBreedte(ref: React.RefObject<HTMLElement | null>): number {
  const [b, zetB] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    zetB(el.clientWidth);
    const ro = new ResizeObserver((r) => { const w = r[0]?.contentRect.width ?? el.clientWidth; zetB((o) => (Math.abs(o - w) < 0.5 ? o : w)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return b;
}

export const LANG_INDRUKKEN_MS = 500; // binnen 450–550 ms (spec 2.2)
export const MUIS_DREMPEL = 5, AANRAAK_DREMPEL = 8;

type Wacht = { id: string; pointerId: number; soort: string; cx: number; cy: number; el: HTMLElement; timer?: number; lang?: boolean };
export type Actief = { g: K.Gebaar; pointerId: number; el: HTMLElement; start: CanvasLayout; soort: string; lang: boolean };

export type GebaarOpties = {
  bewerken: boolean;
  layout: () => CanvasLayout;           // indeling bij de start van een gebaar (synchroon gelezen)
  beleid: () => K.Beleid;
  limieten?: K.LimietenFn;
  /** clientX/Y → logische px in het canvas. */
  naarLogisch: (cx: number, cy: number) => { x: number; y: number };
  opStart: (a: Actief) => void;
  opBeweeg: (a: Actief) => void;
  /** Eén keer per gebaar: pointerup → klaar (commit), annuleren → geannuleerd. */
  opEinde: (a: Actief, uitkomst: 'klaar' | 'geannuleerd') => void;
  /** Lang indrukken zonder bewegen (aanraken) of rechtermuisknop → contextmenu. */
  opMenu: (id: string, cx: number, cy: number) => void;
};

/**
 * Pointergebaren. Muis: slepen na 5 px met ingedrukte knop. Aanraken/pen: eerst 500 ms stil vasthouden (≤ 8 px), eerder bewegen =
 * gewoon scrollen (touch-action: pan-y op de tegel; we roepen dan niets aan). Grepen: direct formaat wijzigen (touch-action: none).
 * Tijdens een gebaar: setPointerCapture; vrijgegeven bij pointerup én pointercancel. De toestand staat in een ref (synchroon), de
 * commit leest NOOIT React-state.
 */
export function usePointerGestures(wortel: React.RefObject<HTMLElement | null>, o: GebaarOpties) {
  const opt = useRef(o); opt.current = o;
  const wacht = useRef<Wacht | null>(null);
  const actief = useRef<Actief | null>(null);

  const ruimOp = () => { const w = wacht.current; if (w?.timer) clearTimeout(w.timer); wacht.current = null; };
  const laatLos = (a: Actief) => { try { if (a.el.hasPointerCapture(a.pointerId)) a.el.releasePointerCapture(a.pointerId); } catch { /* al los */ } };
  const eindig = (uitkomst: 'klaar' | 'geannuleerd') => {
    const a = actief.current; if (!a) return; actief.current = null; laatLos(a); opt.current.opEinde(a, uitkomst);
  };
  const begin = (id: string, pointerId: number, el: HTMLElement, cx: number, cy: number, soort: string, rand?: K.Rand, lang = false) => {
    const l = opt.current.layout(); const p = opt.current.naarLogisch(cx, cy);
    const g = K.startGebaar(l, id, p.x, p.y, rand); if (!g) return false;
    try { el.setPointerCapture(pointerId); } catch { /* pointer al weg */ }
    actief.current = { g, pointerId, el, start: l, soort, lang };
    opt.current.opStart(actief.current);
    return true;
  };

  useEffect(() => {
    const w = wortel.current; if (!w) return;
    const neer = (e: PointerEvent) => {
      if (!opt.current.bewerken || actief.current || !e.isPrimary) return;
      const doel = e.target as HTMLElement;
      const tegel = doel.closest<HTMLElement>('[data-wbc-id]'); if (!tegel || !w.contains(tegel)) return;
      if (doel.closest('[data-wbc-menu]')) return;
      const id = tegel.dataset.wbcId!; const greep = doel.closest<HTMLElement>('[data-wbc-rand]');
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (greep) { e.preventDefault(); begin(id, e.pointerId, greep, e.clientX, e.clientY, e.pointerType, greep.dataset.wbcRand as K.Rand); return; }
      ruimOp();
      const nw: Wacht = { id, pointerId: e.pointerId, soort: e.pointerType, cx: e.clientX, cy: e.clientY, el: tegel };
      if (e.pointerType !== 'mouse') nw.timer = window.setTimeout(() => {
        if (wacht.current !== nw) return; nw.lang = true; wacht.current = null;
        if (begin(id, nw.pointerId, tegel, nw.cx, nw.cy, nw.soort, undefined, true)) navigator.vibrate?.(10);
      }, LANG_INDRUKKEN_MS);
      wacht.current = nw;
    };
    const beweeg = (e: PointerEvent) => {
      const wt = wacht.current;
      if (wt && e.pointerId === wt.pointerId) {
        const d = Math.hypot(e.clientX - wt.cx, e.clientY - wt.cy);
        if (wt.soort === 'mouse') { if (d >= MUIS_DREMPEL) { ruimOp(); begin(wt.id, e.pointerId, wt.el, wt.cx, wt.cy, 'mouse'); } }
        else if (d > AANRAAK_DREMPEL) ruimOp(); // vinger beweegt vóór 500 ms = scrollen; niets kapen
      }
      const a = actief.current;
      if (a && e.pointerId === a.pointerId) {
        const p = opt.current.naarLogisch(e.clientX, e.clientY);
        a.g = K.beweeg(a.g, a.start, p.x, p.y, opt.current.beleid(), opt.current.limieten);
        opt.current.opBeweeg(a);
      }
    };
    const op = (e: PointerEvent) => {
      const a = actief.current;
      if (a && e.pointerId === a.pointerId) {
        // Lang ingedrukt en niet bewogen → menu in plaats van een lege commit.
        if (a.lang && a.g.live.x === a.g.start.x && a.g.live.y === a.g.start.y) { const id = a.g.id; eindig('geannuleerd'); opt.current.opMenu(id, e.clientX, e.clientY); return; }
        eindig('klaar'); return;
      }
      if (wacht.current && e.pointerId === wacht.current.pointerId) ruimOp();
    };
    const annuleer = (e: PointerEvent) => { if (actief.current && e.pointerId === actief.current.pointerId) eindig('geannuleerd'); if (wacht.current?.pointerId === e.pointerId) ruimOp(); };
    const kwijt = (e: PointerEvent) => { if (actief.current && e.pointerId === actief.current.pointerId) eindig('geannuleerd'); };
    const toets = (e: KeyboardEvent) => { if (e.key === 'Escape' && actief.current) { e.preventDefault(); e.stopPropagation(); eindig('geannuleerd'); } };
    // Alleen tijdens een gebaar: scroll tegenhouden (anders stuurt de browser pointercancel zodra de vinger beweegt).
    const raak = (e: TouchEvent) => { if (actief.current && e.cancelable) e.preventDefault(); };
    const ctx = (e: MouseEvent) => {
      if (!opt.current.bewerken) return;
      const tegel = (e.target as HTMLElement).closest<HTMLElement>('[data-wbc-id]'); if (!tegel) return;
      e.preventDefault();
      // Aanraken: het systeemmenu van lang drukken onderdrukken; ons menu komt bij loslaten zonder bewegen.
      if (actief.current || wacht.current?.lang) return;
      if ((e as PointerEvent).pointerType === 'touch' || wacht.current) return;
      opt.current.opMenu(tegel.dataset.wbcId!, e.clientX, e.clientY);
    };
    w.addEventListener('pointerdown', neer);
    window.addEventListener('pointermove', beweeg);
    window.addEventListener('pointerup', op);
    window.addEventListener('pointercancel', annuleer);
    w.addEventListener('lostpointercapture', kwijt);
    window.addEventListener('keydown', toets, true);
    w.addEventListener('touchmove', raak, { passive: false });
    w.addEventListener('contextmenu', ctx);
    return () => {
      ruimOp(); if (actief.current) { laatLos(actief.current); actief.current = null; }
      w.removeEventListener('pointerdown', neer); window.removeEventListener('pointermove', beweeg); window.removeEventListener('pointerup', op);
      window.removeEventListener('pointercancel', annuleer); w.removeEventListener('lostpointercapture', kwijt); window.removeEventListener('keydown', toets, true);
      w.removeEventListener('touchmove', raak); w.removeEventListener('contextmenu', ctx);
    };
  }, [wortel]);

  // Instelmodus uit midden in een gebaar → annuleren, niets opslaan.
  useEffect(() => { if (!o.bewerken) { ruimOp(); if (actief.current) eindig('geannuleerd'); } }, [o.bewerken]);
  return { actief, annuleer: () => eindig('geannuleerd') };
}
