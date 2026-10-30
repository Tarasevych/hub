// Toegankelijkheid (WCAG 2.2 AA, recensie 21.10.2026): kleine, zuivere hulpmiddelen voor focus en toetsenbord, gedeeld door het
// meldingenpaneel, het venster «Новий лист» en de menu's van de mail (rij «⋮», mailboxkiezer, editor «⋯» en keuzelijsten).
// Eén regelset in plaats van vijf eigen varianten:
//   • menu (role=menu/menuitem*) en keuzelijst (role=listbox/option): ↑/↓ rond, Home/End, Escape sluit en zet de focus terug op de
//     knop, Tab sluit (de browser gaat daarna verder vanaf de knop);
//   • een venster/paneel dat het scherm bedekt houdt Tab binnen (houdTab); bij sluiten gaat de focus terug naar de opener (focusTerug);
//   • alleen-voor-schermlezer-tekst via SR_ALLEEN (geen globale CSS-klasse nodig).
// Geen afhankelijkheden; tests/eenheid/toegankelijk-mail-20261021.test.ts test volgendeIndex/houdTab/menuToets met nep-elementen.
import type { CSSProperties } from 'react';

/** Wat met Tab bereikbaar is (zelfde lijst als het vensterbeheer, plus contenteditable voor de editor). */
export const FOCUSBAAR =
  'button:not([disabled]),[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';

type Focusbaar = { offsetParent?: Element | null; getClientRects?: () => { length: number }; closest?: (s: string) => Element | null };
/** Zichtbaar (niet display:none, niet in een gesloten <details>, niet inert). */
export const zichtbaar = (e: Focusbaar): boolean =>
  (e.offsetParent !== null || (typeof e.getClientRects === 'function' && e.getClientRects().length > 0)) && !e.closest?.('[inert]');

/** Zichtbare, focusbare elementen in `root`, in DOM-volgorde. */
export function focusbaar(root: ParentNode | null | undefined): HTMLElement[] {
  if (!root) return [];
  // tabindex=-1 (bv. de schuifpijlen van TabsRij) en links ín de bewerkbare tekst zijn geen Tab-stops.
  return [...root.querySelectorAll<HTMLElement>(FOCUSBAAR)].filter((e) => zichtbaar(e) && !(e.tabIndex < 0 && e.getAttribute('contenteditable') !== 'true') && !e.parentElement?.closest('[contenteditable="true"]'));
}

/**
 * Index na een pijl/Home/End-toets in een lijst van `lengte` items (zuiver). null = geen navigatietoets.
 * Verticaal: ↑/↓; horizontaal: ←/→. Rond: na het laatste weer het eerste (WAI-ARIA menu/listbox).
 */
export function volgendeIndex(toets: string, huidig: number, lengte: number, opties: { horizontaal?: boolean; rond?: boolean } = {}): number | null {
  if (lengte <= 0) return null;
  const rond = opties.rond !== false;
  const vooruit = opties.horizontaal ? 'ArrowRight' : 'ArrowDown', terug = opties.horizontaal ? 'ArrowLeft' : 'ArrowUp';
  if (toets === 'Home') return 0;
  if (toets === 'End') return lengte - 1;
  if (toets === vooruit) return huidig < 0 ? 0 : huidig + 1 < lengte ? huidig + 1 : rond ? 0 : lengte - 1;
  if (toets === terug) return huidig < 0 ? lengte - 1 : huidig > 0 ? huidig - 1 : rond ? lengte - 1 : 0;
  return null;
}

type Toets = { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; preventDefault: () => void };
type FocusEl = { focus: (o?: FocusOptions) => void };

/** Pijl/Home/End op een lijst items: focus verplaatsen. true = afgehandeld (preventDefault gedaan). */
export function menuToets(e: Toets, items: FocusEl[], actief: unknown = typeof document !== 'undefined' ? document.activeElement : null, opties: { horizontaal?: boolean } = {}): boolean {
  if (e.altKey || e.ctrlKey || e.metaKey) return false;
  const i = items.indexOf(actief as FocusEl);
  const n = volgendeIndex(e.key, i, items.length, opties);
  if (n === null) return false;
  e.preventDefault();
  items[n]?.focus();
  return true;
}

/**
 * Tab binnen `items` houden (modaal venster/paneel): van het laatste naar het eerste en omgekeerd. true = afgehandeld.
 * `houder` = het venster zelf (tabindex=-1): staat de focus dáár, dan gaat Tab naar het eerste item. Staat de focus ergens anders
 * (bv. in een geportaald menu van de editor, waarvan de toetsen via de React-boom ook hier aankomen), dan doet dit NIETS.
 */
export function houdTab(e: Toets, items: FocusEl[], opties: { actief?: unknown; houder?: unknown } = {}): boolean {
  if (e.key !== 'Tab' || !items.length) return false;
  const actief = 'actief' in opties ? opties.actief : typeof document !== 'undefined' ? document.activeElement : null;
  const i = items.indexOf(actief as FocusEl);
  if (i === -1 && (opties.houder === undefined || actief !== opties.houder)) return false;
  if (e.shiftKey && (i <= 0)) { e.preventDefault(); items[items.length - 1].focus(); return true; }
  if (!e.shiftKey && (i === -1 || i === items.length - 1)) { e.preventDefault(); items[0].focus(); return true; }
  return false;
}

/** Focus terugzetten na het sluiten van een laag: alleen naar een element dat nog in het document staat. */
export function focusTerug(doel: (HTMLElement & { isConnected?: boolean }) | null | undefined): boolean {
  if (!doel || doel.isConnected === false || typeof doel.focus !== 'function') return false;
  try { doel.focus({ preventScroll: true }); } catch { return false; }
  return true;
}

/** Staat de focus nergens (body of een verwijderd element)? Dan mag een sluitende laag hem terugzetten. */
export const focusVerloren = (): boolean => {
  if (typeof document === 'undefined') return false;
  const a = document.activeElement;
  return !a || a === document.body || a === document.documentElement || (a as HTMLElement).isConnected === false;
};

/** prefers-reduced-motion: reduce (WCAG 2.3.3 / beweging alleen als de mens dat wil). */
export const minderBeweging = (): boolean => {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** Alleen voor de schermlezer (1×1 px, geknipt): geen globale klasse nodig. */
export const SR_ALLEEN: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 };
