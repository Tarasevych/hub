// FOCUS-DOEL (Z4 ↔ Z2, 22.10.2026): een zoekresultaat van het soort knop/veld/instelling/menu verwijst naar een ELEMENT op een
// pagina, niet alleen naar de pagina. Afspraak: de route draagt `?focus=<hulp-sleutel>`; de catalogus (Z2) geeft elk element
// zijn sleutel uit shared/hulp-register.ts en de pagina's markeren ze met `data-hulp="<sleutel>"`. Deze module (één keer
// gestart in CanonicalChrome) zoekt het element — ook als het later wordt gerenderd (MutationObserver, max 10 s) —, scrolt het in
// beeld, zet er een tijdelijke markering op (klasse is-focus-doel, CSS in src/zoek/zoek.css; zonder beweging bij
// prefers-reduced-motion), focust het (tabindex=-1 als het zelf niet focusbaar is) en haalt `focus` uit de adresbalk.
import { minderBeweging } from './toegankelijk';

export const FOCUS_PARAM = 'focus';
export const FOCUS_KLASSE = 'is-focus-doel';
const SLEUTEL_OK = /^[a-zA-Z0-9_.:/-]{1,120}$/;

/** De CSS-selector voor een hulp-sleutel (zuiver; ongeldige sleutel → null). */
export function focusSelector(sleutel: string): string | null {
  if (!SLEUTEL_OK.test(sleutel)) return null;
  return `[data-hulp="${sleutel.replace(/"/g, '')}"], #${CSS.escape(sleutel)}`;
}
/** De sleutel uit een zoekreeks (?focus=…), zuiver. */
export function focusUitUrl(search: string): string {
  const v = new URLSearchParams(search).get(FOCUS_PARAM) || '';
  return SLEUTEL_OK.test(v) ? v : '';
}

export const DOEL_PARAM = 'doel';
/** ?doel=<soort>:<id> uit een zoekreeks (zuiver). */
export function doelUitUrl(search: string): string {
  const v = new URLSearchParams(search).get(DOEL_PARAM) || '';
  return SLEUTEL_OK.test(v) ? v : '';
}
/** De CSS-selector voor een doel (data-zoek-doel), zuiver; ongeldig → null. */
export function doelSelector(doel: string): string | null {
  if (!SLEUTEL_OK.test(doel)) return null;
  return `[data-zoek-doel="${doel.replace(/"/g, '')}"]`;
}

export function markeerEnFocus(el: HTMLElement): void {
  const kort = minderBeweging();
  try { el.scrollIntoView({ block: 'center', behavior: kort ? 'auto' : 'smooth' }); } catch { /* oude browser */ }
  if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
  el.classList.add(FOCUS_KLASSE);
  // <details> openen zodat een instelling binnenin zichtbaar is.
  let p: HTMLElement | null = el.parentElement; while (p) { if (p.tagName === 'DETAILS') (p as HTMLDetailsElement).open = true; p = p.parentElement; }
  try { el.focus({ preventScroll: true }); } catch { /* niet focusbaar */ }
  window.setTimeout(() => el.classList.remove(FOCUS_KLASSE), 6000);
}

let gestart = false;
/** Eén keer per pagina: ?focus=<sleutel> → element zoeken (nu of zodra het verschijnt), markeren, focussen, parameter wissen. */
export function focusDoelStarten(): void {
  if (gestart || typeof document === 'undefined') return;
  gestart = true;
  // ZOEKDIEP-001 (05.11.2026): naast ?focus=<hulp-sleutel> ook ?doel=<soort>:<id> — een ITEM op de pagina (bijv. een taak op mcp/board,
  // gemarkeerd met data-zoek-doel). Zelfde gedrag: zoeken, in beeld scrollen, markeren, focussen, parameter wissen.
  const sleutel = focusUitUrl(location.search), doel = doelUitUrl(location.search); if (!sleutel && !doel) return;
  const sel = sleutel ? focusSelector(sleutel) : doelSelector(doel); if (!sel) return;
  const url = new URL(location.href); url.searchParams.delete(FOCUS_PARAM); url.searchParams.delete(DOEL_PARAM); history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  const probeer = (): boolean => { const el = document.querySelector<HTMLElement>(sel); if (!el) return false; markeerEnFocus(el); return true; };
  if (probeer()) return;
  const mo = new MutationObserver(() => { if (probeer()) { mo.disconnect(); window.clearTimeout(t); } });
  mo.observe(document.body, { childList: true, subtree: true });
  const t = window.setTimeout(() => mo.disconnect(), 10000);
}
