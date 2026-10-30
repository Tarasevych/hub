// UI-001 (29.10.2026): snel het submenu van ELKE dienst bekijken in het horizontale menu (boven/onder), zonder te navigeren.
// Hergebruikt het bestaande dockpaneel (dockOpen/dockAnker/dockPaneel in CanoniekOmlijsting); er komt geen nieuw menu bij.
// - Rechterklik (contextmenu) op een dienst met submenu: paneel open/dicht, geen navigatie. Native contextmenu alleen daar onderdrukt.
// - Aanraken/pen: lang indrukken (500 ms, ≤ 8 px bewegen) doet hetzelfde; de klik die daarna volgt wordt ingeslikt. Korte tik = gewoon.
// - Toetsenbord: Shift+F10, ContextMenu-toets of pijl omlaag op de dienst opent het paneel en zet de focus op de eerste link.
//   Esc/klik buiten sluit (bestaande afhandeling in CanoniekOmlijsting, die de focus teruggeeft aan de dienst).
// - Uit in de bewerkmodus (daar blijven rechterklik/lang indrukken = slepen/acties zoals voorheen) en buiten het horizontale dock.
import { useEffect, useRef } from 'react';
import './dock-snelmenu.css';

export const SNELMENU_KNOP = '.canonical-sidebar .canonical-service-button.has-submenu';
export const LANG_DRUKKEN_MS = 500, DRUK_DREMPEL = 8;

type Opties = { aan: boolean; open: string; zet: (id: string, knop: HTMLElement) => void; sluit: () => void };

export const knopVan = (t: EventTarget | null) => ((t as Element | null)?.closest?.(SNELMENU_KNOP) as HTMLElement | null) || null;
export const isSnelmenuToets = (e: { key: string; shiftKey: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) =>
  !e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey) || (e.key === 'ArrowDown' && !e.shiftKey));

export function useDockSnelmenu(o: Opties) {
  const ref = useRef(o); ref.current = o;
  useEffect(() => {
    if (!o.aan) return;
    let druk: { knop: HTMLElement; x: number; y: number; id: number; timer: number } | null = null;
    let slikTot = 0;
    const wissel = (knop: HTMLElement, focus = false) => {
      const id = knop.dataset.serviceId || '';
      if (!id) return;
      if (ref.current.open === id && !focus) { ref.current.sluit(); return; }
      ref.current.zet(id, knop);
      if (focus) requestAnimationFrame(() => requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`.dock-paneel[data-dock-paneel="${id}"] a[href],.dock-paneel[data-dock-paneel="${id}"] button`)?.focus();
      }));
    };
    const stop = () => { if (druk) window.clearTimeout(druk.timer); druk = null; };
    const contextmenu = (e: MouseEvent) => {
      const knop = knopVan(e.target); if (!knop) return;
      e.preventDefault();
      if (Date.now() < slikTot) return; // Android stuurt na lang drukken nog een contextmenu: al afgehandeld
      wissel(knop, e.button === -1 || (e.clientX === 0 && e.clientY === 0 && e.detail === 0));
    };
    const omlaag = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !e.isPrimary) return;
      const knop = knopVan(e.target); if (!knop) return;
      stop();
      druk = { knop, x: e.clientX, y: e.clientY, id: e.pointerId, timer: window.setTimeout(() => {
        if (!druk) return; const k = druk.knop; druk = null; slikTot = Date.now() + 1200; wissel(k);
      }, LANG_DRUKKEN_MS) };
    };
    const beweeg = (e: PointerEvent) => { if (druk && e.pointerId === druk.id && Math.hypot(e.clientX - druk.x, e.clientY - druk.y) > DRUK_DREMPEL) stop(); };
    const los = (e: PointerEvent) => { if (druk && e.pointerId === druk.id) stop(); };
    const klik = (e: MouseEvent) => { if (Date.now() < slikTot && knopVan(e.target)) { e.preventDefault(); e.stopPropagation(); slikTot = 0; } };
    const toets = (e: KeyboardEvent) => {
      const knop = knopVan(e.target); if (!knop || !isSnelmenuToets(e)) return;
      e.preventDefault(); wissel(knop, true);
    };
    document.addEventListener('contextmenu', contextmenu, true);
    document.addEventListener('pointerdown', omlaag, true);
    document.addEventListener('pointermove', beweeg, true);
    document.addEventListener('pointerup', los, true);
    document.addEventListener('pointercancel', los, true);
    document.addEventListener('click', klik, true);
    document.addEventListener('keydown', toets, true);
    return () => {
      stop();
      document.removeEventListener('contextmenu', contextmenu, true);
      document.removeEventListener('pointerdown', omlaag, true);
      document.removeEventListener('pointermove', beweeg, true);
      document.removeEventListener('pointerup', los, true);
      document.removeEventListener('pointercancel', los, true);
      document.removeEventListener('click', klik, true);
      document.removeEventListener('keydown', toets, true);
    };
  }, [o.aan]);
}
