// Menu v2 fase 2: slepen en neerzetten in de bewerkmodus (muis, pen en aanraken; geen HTML5-drag, dat werkt niet op touch).
// - Muis: slepen begint na 5 px beweging. Aanraken/pen: lang indrukken (450 ms, ≤ 8 px bewegen); eerder bewegen = gewoon scrollen.
// - Doel: de binnenste lijst met [data-menu-lijst] onder de aanwijzer ('plaats|ouder'); positie = vóór het eerste item waarvan
//   het midden voorbij de aanwijzer ligt (verticaal of horizontaal, ook bij een raster dat over meer regels loopt).
// - Een dienst boven een sectie valt terug op de lijst eromheen (diensten staan nooit in een sectie).
// - Ingeklapte sectie: 650 ms boven de dienst blijven klapt hem open (zoals een map in de Finder).
// - Alt/Ctrl/⌘ bij loslaten = kopie in plaats van verplaatsen. Esc = annuleren. Bij de rand van de lijst scrolt die mee.
// Het controller-object kent geen voorkeuren: het meldt alleen (sleutel, lijst, voor, kopie) aan de aanroeper.

export type SleepDoel = { lijst: string; voor: string | null };
export type SleepOpties = {
  wortel: HTMLElement;
  magNaar: (sleutel: string, lijst: string) => boolean;
  opNeerzetten: (sleutel: string, doel: SleepDoel, kopie: boolean) => void;
  opSectieOpenen: (dienst: string) => void;
  opStart?: (sleutel: string) => void;
};

const LANG_INDRUKKEN = 450, MUIS_DREMPEL = 5, AANRAAK_DREMPEL = 8, SECTIE_OPEN_MS = 650, RAND = 36;

function voorAanwijzer(el: Element, x: number, y: number, richting: string) {
  const kop = el.querySelector(':scope > .canonical-service-main-row') || el;
  const r = kop.getBoundingClientRect();
  if (richting === 'h') return y < r.top || (y <= r.bottom && x < r.left + r.width / 2);
  return y < r.top + r.height / 2;
}
const kopRect = (el: Element) => (el.querySelector(':scope > .canonical-service-main-row') || el).getBoundingClientRect();

export function installeerSlepen(o: SleepOpties): () => void {
  let wacht: { el: HTMLElement; sleutel: string; x: number; y: number; id: number; soort: string; timer?: number } | null = null;
  let sleep: { el: HTMLElement; sleutel: string; geest: HTMLElement; lijn: HTMLElement; doel: SleepDoel | null; geldig: boolean; x: number; y: number; open?: { dienst: string; timer: number }; raf?: number } | null = null;

  const opruimen = () => {
    if (wacht?.timer) window.clearTimeout(wacht.timer);
    wacht = null;
    if (!sleep) return;
    sleep.geest.remove(); sleep.lijn.remove();
    delete sleep.el.dataset.sleept;
    if (sleep.open) window.clearTimeout(sleep.open.timer);
    if (sleep.raf) cancelAnimationFrame(sleep.raf);
    document.documentElement.classList.remove('menu-sleept');
    sleep = null;
  };

  const begin = () => {
    if (!wacht) return;
    const { el, sleutel, x, y } = wacht;
    if (wacht.timer) window.clearTimeout(wacht.timer);
    wacht = null;
    const knop = el.matches('button,a') ? el : el.querySelector<HTMLElement>('button,a') || el;
    const geest = document.createElement('div');
    geest.className = 'menu-sleep-geest';
    geest.setAttribute('aria-hidden', 'true');
    const acc = el.closest<HTMLElement>('[data-accent]')?.dataset.accent;
    if (acc) geest.dataset.accent = acc;
    const icoon = knop.querySelector('.canonical-menu-icon-slot,svg');
    if (icoon) geest.appendChild(icoon.cloneNode(true));
    const tekst = document.createElement('span');
    tekst.textContent = (knop.querySelector('.canonical-service-label,.canonical-local-label,.menu-start-label')?.textContent || knop.getAttribute('aria-label') || '').trim();
    geest.appendChild(tekst);
    const plus = document.createElement('b'); plus.className = 'menu-sleep-plus'; plus.textContent = '+'; geest.appendChild(plus);
    (o.wortel.closest('.canonical-chrome') || o.wortel).appendChild(geest);
    const lijn = document.createElement('div');
    lijn.className = 'menu-sleep-lijn';
    lijn.setAttribute('aria-hidden', 'true');
    (o.wortel.closest('.canonical-chrome') || o.wortel).appendChild(lijn);
    el.dataset.sleept = 'ja';
    document.documentElement.classList.add('menu-sleept');
    sleep = { el, sleutel, geest, lijn, doel: null, geldig: false, x, y };
    try { navigator.vibrate?.(12); } catch { /* niet ondersteund */ }
    o.opStart?.(sleutel);
    bewegen(x, y, false);
    const rol = () => {
      if (!sleep) return;
      const lijst = document.elementFromPoint(sleep.x, sleep.y)?.closest('.canonical-service-list,.dock-paneel .canonical-local-pages');
      if (lijst) {
        const r = lijst.getBoundingClientRect();
        if (sleep.y < r.top + RAND) lijst.scrollBy(0, -8); else if (sleep.y > r.bottom - RAND) lijst.scrollBy(0, 8);
      }
      sleep.raf = requestAnimationFrame(rol);
    };
    sleep.raf = requestAnimationFrame(rol);
  };

  const bewegen = (x: number, y: number, kopie: boolean) => {
    if (!sleep) return;
    sleep.x = x; sleep.y = y;
    sleep.geest.style.transform = `translate(${Math.round(x + 12)}px, ${Math.round(y + 10)}px)`;
    sleep.geest.dataset.kopie = kopie ? 'ja' : 'nee';
    const onder = document.elementFromPoint(x, y);
    let lijstEl = onder?.closest<HTMLElement>('[data-menu-lijst]') || null;
    if (lijstEl && !o.magNaar(sleep.sleutel, lijstEl.dataset.menuLijst || '')) {
      const buiten = lijstEl.parentElement?.closest<HTMLElement>('[data-menu-lijst]') || null;
      if (buiten && o.magNaar(sleep.sleutel, buiten.dataset.menuLijst || '')) lijstEl = buiten;
    }
    // ingeklapte sectie openklappen als je erboven blijft hangen
    const groep = onder?.closest<HTMLElement>('.canonical-service-group[data-submenu-manual-state="closed"]');
    const dienst = groep && sleep.sleutel.includes('pg:') ? groep.dataset.serviceGroup || '' : '';
    if (sleep.open && sleep.open.dienst !== dienst) { window.clearTimeout(sleep.open.timer); sleep.open = undefined; }
    if (dienst && !sleep.open) sleep.open = { dienst, timer: window.setTimeout(() => { o.opSectieOpenen(dienst); if (sleep) sleep.open = undefined; }, SECTIE_OPEN_MS) };
    if (!lijstEl) { sleep.doel = null; sleep.geldig = false; sleep.lijn.dataset.zichtbaar = 'nee'; sleep.geest.dataset.geldig = 'nee'; return; }
    const lijst = lijstEl.dataset.menuLijst || '', richting = lijstEl.dataset.menuRichting || 'v';
    const kinderen = Array.from(lijstEl.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute('data-menu-sleutel') && c !== sleep!.el);
    const voorEl = kinderen.find((c) => voorAanwijzer(c, x, y, richting)) || null;
    const geldig = o.magNaar(sleep.sleutel, lijst);
    sleep.doel = { lijst, voor: voorEl?.dataset.menuSleutel || null };
    sleep.geldig = geldig;
    sleep.geest.dataset.geldig = geldig ? 'ja' : 'nee';
    // invoeglijn
    const l = sleep.lijn.style, lr = lijstEl.getBoundingClientRect();
    const ref = voorEl ? kopRect(voorEl) : kinderen.length ? kopRect(kinderen[kinderen.length - 1]) : null;
    if (richting === 'h') {
      const lx = ref ? (voorEl ? ref.left - 3 : ref.right + 1) : lr.left + 4;
      const top = ref ? ref.top : lr.top + 4, h = ref ? ref.height : Math.max(24, lr.height - 8);
      Object.assign(l, { left: `${lx}px`, top: `${top}px`, width: '3px', height: `${h}px` });
    } else {
      const ly = ref ? (voorEl ? ref.top - 2 : ref.bottom + 1) : lr.top + 4;
      const left = ref ? ref.left : lr.left + 4, wdt = ref ? Math.max(ref.width, 36) : Math.max(36, lr.width - 8);
      Object.assign(l, { left: `${left}px`, top: `${ly}px`, width: `${wdt}px`, height: '3px' });
    }
    sleep.lijn.dataset.zichtbaar = geldig ? 'ja' : 'nee';
  };

  const neer = (kopie: boolean) => {
    if (!sleep) return;
    const { sleutel, doel, geldig } = sleep;
    opruimen();
    // de klik die op loslaten volgt mag geen actiemenu openen
    const stop = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
    if (doel && geldig) o.opNeerzetten(sleutel, doel, kopie);
  };

  const omlaag = (e: PointerEvent) => {
    if (e.button !== 0 || sleep) return;
    const doel = e.target as Element | null;
    if (!doel || doel.closest('[data-menu-geen-sleep],input,select,textarea')) return;
    const el = doel.closest<HTMLElement>('[data-menu-sleutel]');
    if (!el || !o.wortel.contains(el)) return;
    wacht = { el, sleutel: el.dataset.menuSleutel || '', x: e.clientX, y: e.clientY, id: e.pointerId, soort: e.pointerType };
    if (e.pointerType !== 'mouse') wacht.timer = window.setTimeout(begin, LANG_INDRUKKEN);
  };
  const beweeg = (e: PointerEvent) => {
    if (wacht && e.pointerId === wacht.id) {
      const d = Math.hypot(e.clientX - wacht.x, e.clientY - wacht.y);
      if (wacht.soort === 'mouse' ? d > MUIS_DREMPEL : d > AANRAAK_DREMPEL) {
        if (wacht.soort === 'mouse') begin(); else opruimen(); // aanraken: eerst bewegen = scrollen
      }
    }
    if (sleep) { e.preventDefault(); bewegen(e.clientX, e.clientY, e.altKey || e.ctrlKey || e.metaKey); }
  };
  const los = (e: PointerEvent) => { if (sleep) neer(e.altKey || e.ctrlKey || e.metaKey); else opruimen(); };
  const annuleer = () => opruimen();
  const toets = (e: KeyboardEvent) => {
    if (!sleep) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); opruimen(); }
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
  return () => {
    opruimen();
    o.wortel.removeEventListener('pointerdown', omlaag);
    window.removeEventListener('pointermove', beweeg);
    window.removeEventListener('pointerup', los);
    window.removeEventListener('pointercancel', annuleer);
    window.removeEventListener('keydown', toets, true);
    window.removeEventListener('keyup', toets, true);
    window.removeEventListener('touchmove', raak);
    o.wortel.removeEventListener('contextmenu', contextmenu);
  };
}
