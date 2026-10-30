// Werkblad «Blokken» — sleepregelaar (stroom D). Eén regelaar voor canvas ↔ blok ↔ blok en het zijmenu.
// - Muis: start na 5 px. Aanraken/pen: lang indrukken 450 ms (≤ 8 px bewegen; eerder bewegen = gewoon scrollen).
// - Alt/Ctrl/⌘ bij loslaten = kopie. Esc = annuleren. Rand van een scrollbare plek (36 px) = automatisch scrollen.
// - Tijdens slepen: doelplek licht op (data-wb-doel="ja|nee"), invoeglijn, en bij «nee» de reden in tekst (aria-live).
// - Er wordt NIETS gewijzigd tijdens het bewegen; alleen bij pointerup (geldig) roept de regelaar `opNeerzetten` aan.
// DOM-afspraak (geen HTML5-drag, dat werkt niet op aanraken):
//   [data-wb-sleep]  = sleepbaar; waarde = 'blok:<knoopId>' | 'canvas:<instanceId>' | 'bibliotheek:<itemId>' | 'menu:<sleutel>'
//   [data-wb-plek]   = doelplek; waarde = Plek.id ('canvas:computer', 'blok:<knoopId>', 'menu:<lijst>', ...)
//   [data-wb-richting="h|v|vrij"] op de plek (standaard v); kinderen met [data-wb-knoop] bepalen `voor`.
// Plekken van buiten (het hubmenu) worden via `extraPlekken` (zie menu-adapter.ts) herkend zonder hun code te wijzigen.
import type { Neerzetting, NeerzetOordeel, Plek, Sleepbron } from '../../../shared/werkblad-blokken';

export const LANG_INDRUKKEN_MS = 450, MUIS_DREMPEL = 5, AANRAAK_DREMPEL = 8, SCROL_RAND = 36;

export function leesBron(waarde: string): Sleepbron | null {
  const i = waarde.indexOf(':'); if (i < 1) return null;
  const soort = waarde.slice(0, i), rest = waarde.slice(i + 1);
  if (!rest) return null;
  if (soort === 'blok') return { van: 'blok', knoopId: rest };
  if (soort === 'canvas') return { van: 'canvas', instanceId: rest };
  if (soort === 'menu') return { van: 'menu', sleutel: rest };
  if (soort === 'bibliotheek') return { van: 'bibliotheek', itemId: rest };
  return null;
}

/** Externe plek-herkenner (bv. hubmenu): geeft voor een element onder de aanwijzer een plek-element + id + volgorde. */
export interface ExternePlek {
  vind(el: Element | null): { el: HTMLElement; plekId: string } | null;
  voor(plekEl: HTMLElement, x: number, y: number, sleepEl: HTMLElement): { voor: string | null; lijn: DOMRect | null; richting: 'h' | 'v' };
}

export interface SleepregelaarOpties {
  wortel: HTMLElement;                      // gebied waarbinnen slepen start (bewerkmodus)
  plek: (id: string) => Plek | null;        // Plek-beschrijving voor een id
  beoordeel: (bron: Sleepbron, n: Neerzetting) => NeerzetOordeel;
  redenTekst: (o: NeerzetOordeel, plek: Plek) => string;
  opNeerzetten: (bron: Sleepbron, n: Neerzetting, oordeel: NeerzetOordeel) => void;
  opStart?: (bron: Sleepbron) => void;
  opEinde?: (uitkomst: 'neergezet' | 'geannuleerd' | 'geweigerd') => void;
  extraPlekken?: ExternePlek[];
  /** Testhaak: tijd voor lang indrukken. */
  langIndrukkenMs?: number;
}

type Doel = { plekEl: HTMLElement; plek: Plek; n: Neerzetting; oordeel: NeerzetOordeel } | null;

export function eigenVoor(plekEl: HTMLElement, x: number, y: number, sleepEl: HTMLElement) {
  const richting = (plekEl.dataset.wbRichting || 'v') as 'h' | 'v' | 'vrij';
  const kinderen = Array.from(plekEl.querySelectorAll<HTMLElement>(':scope > [data-wb-knoop], :scope > * > [data-wb-knoop]'))
    .filter((c) => c !== sleepEl && !sleepEl.contains(c) && c.closest('[data-wb-plek]') === plekEl);
  if (richting === 'vrij') return { voor: null, lijn: null, richting: 'h' as const };
  let voorEl: HTMLElement | null = null;
  for (const c of kinderen) {
    const r = c.getBoundingClientRect();
    const ervoor = richting === 'h' ? (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) : y < r.top + r.height / 2;
    if (ervoor) { voorEl = c; break; }
  }
  const ref = voorEl || kinderen[kinderen.length - 1] || null;
  let lijn: DOMRect | null = null;
  if (ref) {
    const r = ref.getBoundingClientRect();
    lijn = richting === 'h'
      ? new DOMRect(voorEl ? r.left - 3 : r.right + 1, r.top, 3, r.height)
      : new DOMRect(r.left, voorEl ? r.top - 3 : r.bottom + 1, r.width, 3);
  }
  return { voor: voorEl?.dataset.wbKnoop || null, lijn, richting: richting === 'h' ? 'h' as const : 'v' as const };
}

export function installeerSleepregelaar(o: SleepregelaarOpties): { verwijder: () => void; bezig: () => boolean } {
  const langMs = o.langIndrukkenMs ?? LANG_INDRUKKEN_MS;
  let wacht: { el: HTMLElement; bron: Sleepbron; x: number; y: number; id: number; soort: string; timer?: number } | null = null;
  let sleep: { el: HTMLElement; bron: Sleepbron; geest: HTMLElement; lijn: HTMLElement; melding: HTMLElement; doel: Doel; x: number; y: number; kopie: boolean; raf?: number; licht?: HTMLElement } | null = null;

  const doof = () => { if (sleep?.licht) { delete sleep.licht.dataset.wbDoel; sleep.licht = undefined; } };
  const opruimen = () => {
    if (wacht?.timer) window.clearTimeout(wacht.timer);
    wacht = null;
    if (!sleep) return;
    doof();
    sleep.geest.remove(); sleep.lijn.remove(); sleep.melding.remove();
    delete sleep.el.dataset.wbSleept;
    if (sleep.raf) cancelAnimationFrame(sleep.raf);
    document.documentElement.classList.remove('wb-sleept');
    sleep = null;
  };

  const begin = () => {
    if (!wacht) return;
    const { el, bron, x, y } = wacht;
    if (wacht.timer) window.clearTimeout(wacht.timer);
    wacht = null;
    const geest = el.cloneNode(true) as HTMLElement;
    geest.removeAttribute('id'); geest.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    geest.className = 'wb-sleep-geest'; geest.setAttribute('aria-hidden', 'true');
    const r = el.getBoundingClientRect();
    Object.assign(geest.style, { width: `${r.width}px`, height: `${r.height}px` });
    const lijn = document.createElement('div'); lijn.className = 'wb-sleep-lijn'; lijn.setAttribute('aria-hidden', 'true');
    const melding = document.createElement('div'); melding.className = 'wb-sleep-melding'; melding.setAttribute('role', 'status'); melding.setAttribute('aria-live', 'polite');
    document.body.append(geest, lijn, melding);
    el.dataset.wbSleept = 'ja';
    document.documentElement.classList.add('wb-sleept');
    sleep = { el, bron, geest, lijn, melding, doel: null, x, y, kopie: false };
    o.opStart?.(bron);
    bewegen(x, y, false);
  };

  const vindPlek = (onder: Element | null): { el: HTMLElement; plekId: string; ext?: ExternePlek } | null => {
    let el = onder?.closest<HTMLElement>('[data-wb-plek]') || null;
    // een blok kan niet in zichzelf: start buiten het gesleepte element
    while (el && sleep && sleep.el.contains(el)) el = el.parentElement?.closest<HTMLElement>('[data-wb-plek]') || null;
    if (el) return { el, plekId: el.dataset.wbPlek || '' };
    for (const x of o.extraPlekken || []) { const r = x.vind(onder); if (r) return { ...r, ext: x }; }
    return null;
  };

  const bewegen = (x: number, y: number, kopie: boolean) => {
    if (!sleep) return;
    sleep.x = x; sleep.y = y; sleep.kopie = kopie;
    const g = sleep.geest;
    g.style.transform = `translate(${x + 10}px, ${y + 10}px)`;
    g.dataset.kopie = kopie ? 'ja' : 'nee';
    const onder = document.elementFromPoint(x, y);
    const gevonden = vindPlek(onder);
    doof();
    const plek = gevonden ? o.plek(gevonden.plekId) : null;
    if (!gevonden || !plek) {
      sleep.doel = null; g.dataset.geldig = 'nee'; sleep.lijn.dataset.zichtbaar = 'nee'; sleep.melding.textContent = ''; sleep.melding.dataset.zichtbaar = 'nee';
      return autoScroll(onder, x, y);
    }
    const v = gevonden.ext ? gevonden.ext.voor(gevonden.el, x, y, sleep.el) : eigenVoor(gevonden.el, x, y, sleep.el);
    const pr = gevonden.el.getBoundingClientRect();
    const n: Neerzetting = { doel: plek, voor: v.voor, kopie, positie: { x: Math.round(x - pr.left + gevonden.el.scrollLeft), y: Math.round(y - pr.top + gevonden.el.scrollTop) } };
    const oordeel = o.beoordeel(sleep.bron, n);
    sleep.doel = { plekEl: gevonden.el, plek, n, oordeel };
    gevonden.el.dataset.wbDoel = oordeel.ok ? 'ja' : 'nee'; sleep.licht = gevonden.el;
    g.dataset.geldig = oordeel.ok ? 'ja' : 'nee';
    const tekst = oordeel.ok ? '' : o.redenTekst(oordeel, plek);
    sleep.melding.textContent = tekst; sleep.melding.dataset.zichtbaar = tekst ? 'ja' : 'nee';
    Object.assign(sleep.melding.style, { left: `${Math.min(x + 14, innerWidth - 260)}px`, top: `${Math.max(y - 44, 4)}px` });
    const l = sleep.lijn;
    if (oordeel.ok && v.lijn) {
      Object.assign(l.style, { left: `${v.lijn.left}px`, top: `${v.lijn.top}px`, width: `${v.lijn.width}px`, height: `${v.lijn.height}px` });
      l.dataset.zichtbaar = 'ja';
    } else l.dataset.zichtbaar = 'nee';
    autoScroll(gevonden.el, x, y);
  };

  const autoScroll = (start: Element | null, x: number, y: number) => {
    if (!sleep) return;
    if (sleep.raf) { cancelAnimationFrame(sleep.raf); sleep.raf = undefined; }
    let el: HTMLElement | null = start instanceof HTMLElement ? start : (start?.parentElement || null);
    while (el && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) && !(el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowX))) el = el.parentElement;
    const doelEl: HTMLElement | null = el || (document.scrollingElement as HTMLElement | null);
    if (!doelEl) return;
    const r = el ? el.getBoundingClientRect() : new DOMRect(0, 0, innerWidth, innerHeight);
    const dy = y < r.top + SCROL_RAND ? -12 : y > r.bottom - SCROL_RAND ? 12 : 0;
    const dx = x < r.left + SCROL_RAND ? -12 : x > r.right - SCROL_RAND ? 12 : 0;
    if (!dx && !dy) return;
    const stap = () => { if (!sleep) return; doelEl.scrollBy(dx, dy); sleep.raf = requestAnimationFrame(stap); };
    sleep.raf = requestAnimationFrame(stap);
  };

  const neer = (kopie: boolean) => {
    if (!sleep) return;
    bewegen(sleep.x, sleep.y, kopie);
    const { bron, doel } = sleep;
    opruimen();
    const stop = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
    if (doel && doel.oordeel.ok) { o.opNeerzetten(bron, doel.n, doel.oordeel); o.opEinde?.('neergezet'); }
    else o.opEinde?.(doel ? 'geweigerd' : 'geannuleerd');
  };

  const omlaag = (e: PointerEvent) => {
    if (e.button !== 0 || sleep) return;
    const t = e.target as Element | null;
    if (!t || t.closest('[data-wb-geen-sleep],input,select,textarea,[contenteditable="true"]')) return;
    const el = t.closest<HTMLElement>('[data-wb-sleep]');
    if (!el || !o.wortel.contains(el) || el.dataset.wbVergrendeld === 'ja') return;
    const bron = leesBron(el.dataset.wbSleep || ''); if (!bron) return;
    wacht = { el, bron, x: e.clientX, y: e.clientY, id: e.pointerId, soort: e.pointerType };
    if (e.pointerType !== 'mouse') wacht.timer = window.setTimeout(begin, langMs);
  };
  const beweeg = (e: PointerEvent) => {
    if (wacht && e.pointerId === wacht.id) {
      const d = Math.hypot(e.clientX - wacht.x, e.clientY - wacht.y);
      if (wacht.soort === 'mouse' ? d > MUIS_DREMPEL : d > AANRAAK_DREMPEL) { if (wacht.soort === 'mouse') begin(); else opruimen(); }
    }
    if (sleep) { e.preventDefault(); bewegen(e.clientX, e.clientY, e.altKey || e.ctrlKey || e.metaKey); }
  };
  const los = (e: PointerEvent) => { if (sleep) neer(e.altKey || e.ctrlKey || e.metaKey); else opruimen(); };
  const annuleer = () => { if (sleep) o.opEinde?.('geannuleerd'); opruimen(); };
  const toets = (e: KeyboardEvent) => {
    if (!sleep) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); opruimen(); o.opEinde?.('geannuleerd'); }
    else if (e.key === 'Alt' || e.key === 'Control' || e.key === 'Meta') bewegen(sleep.x, sleep.y, e.type === 'keydown');
  };
  const raak = (e: TouchEvent) => { if (sleep && e.cancelable) e.preventDefault(); };
  const contextmenu = (e: Event) => { if (wacht || sleep) e.preventDefault(); };

  o.wortel.addEventListener('pointerdown', omlaag);
  window.addEventListener('pointermove', beweeg, { passive: false });
  window.addEventListener('pointerup', los);
  window.addEventListener('pointercancel', annuleer);
  window.addEventListener('keydown', toets, true);
  window.addEventListener('keyup', toets, true);
  window.addEventListener('touchmove', raak, { passive: false });
  o.wortel.addEventListener('contextmenu', contextmenu);
  return {
    bezig: () => !!sleep,
    verwijder: () => {
      opruimen();
      o.wortel.removeEventListener('pointerdown', omlaag);
      window.removeEventListener('pointermove', beweeg);
      window.removeEventListener('pointerup', los);
      window.removeEventListener('pointercancel', annuleer);
      window.removeEventListener('keydown', toets, true);
      window.removeEventListener('keyup', toets, true);
      window.removeEventListener('touchmove', raak);
      o.wortel.removeEventListener('contextmenu', contextmenu);
    },
  };
}
