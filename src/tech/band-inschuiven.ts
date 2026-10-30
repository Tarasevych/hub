// Technische band: verbergen bij naar beneden scrollen, tonen bij naar boven scrollen («headroom»), 18.10.2026.
//
// Waarom zo: de eerste versie (band-verbergen.ts) verschoof #root via `top` → de scrollcontainer werd hoger → de browser corrigeerde
// scrollTop → scroll-gebeurtenis → band terug → … (live 305 wissels in 15 s, schokkende bel). Nu:
//  1. verbergen verandert NOOIT de geometrie: alleen `translate` op #root/band (tech.css). Hoogtes, top en padding blijven gelijk,
//     dus de browser heeft niets te corrigeren en er komt geen scroll-gebeurtenis uit het wisselen zelf;
//  2. de beslissing (verwerkScroll, zuiver en getest in tests/eenheid/band-inschuiven.test.ts) kijkt naar ÉÉN echte scrollcontainer,
//     telt de afgelegde weg in één richting op (drempel 24 px), wisselt hooguit eens per 300 ms en negeert alles wat binnen 220 ms
//     na een wissel binnenkomt (de duur van de schuifanimatie);
//  3. bovenaan (scrollTop ≤ bandhoogte) is de band altijd zichtbaar; muis tegen de bovenrand, focus in de band en Esc tonen hem ook.

export const DREMPEL_PX = 24;
export const MIN_TUSSEN_MS = 300;
export const OVERGANG_MS = 220;
/** Muis binnen zoveel px van de bovenrand → band tonen. */
export const RAND_PX = 6;
/** Alleen containers die minstens dit deel van de vensterhoogte beslaan tellen mee (geen kleine lijstjes/menu's). */
export const MIN_HOOGTE_DEEL = 0.5;

export type Staat = {
  verborgen: boolean;
  /** Tijdstip (ms) van de laatste wissel. */
  laatsteWissel: number;
  /** Opgetelde weg in de huidige richting (+ = naar beneden). */
  som: number;
  /** De container waarvan de vorige meting kwam. */
  bron: unknown;
  /** Vorige (begrensde) scrollTop van die container. */
  vorige: number;
};

export type Meting = {
  tijd: number;
  bron: unknown;
  scrollTop: number;
  /** scrollHeight − clientHeight. */
  max: number;
  bandH: number;
  /** true = nu niet verbergen (lijst «⋯» of een venster van de band is open). */
  vast?: boolean;
};

export type Uitkomst = { staat: Staat; gewisseld: boolean; /** Opnieuw beslissen op dit tijdstip (een wissel moest wachten). */ opnieuwOm?: number };

export const beginStaat = (): Staat => ({ verborgen: false, laatsteWissel: Number.NEGATIVE_INFINITY, som: 0, bron: null, vorige: 0 });

const wissel = (s: Staat, tijd: number, verborgen: boolean): Uitkomst => ({ staat: { ...s, verborgen, laatsteWissel: tijd, som: 0 }, gewisseld: true });

/** Eén scroll-gebeurtenis van een container verwerken. */
export function verwerkScroll(s: Staat, m: Meting): Uitkomst {
  // Rubberband (iOS/macOS) begrenzen: boven 0 en voorbij het einde telt niet als beweging.
  const top = Math.min(Math.max(m.scrollTop, 0), Math.max(m.max, 0));
  const sinds = m.tijd - s.laatsteWissel;
  const wacht = s.laatsteWissel + MIN_TUSSEN_MS;
  if (s.bron !== m.bron) {
    // Andere container: alleen een nieuw beginpunt, geen beweging.
    const n = { ...s, bron: m.bron, vorige: top, som: 0 };
    if (top <= m.bandH && n.verborgen) return sinds >= MIN_TUSSEN_MS ? wissel(n, m.tijd, false) : { staat: n, gewisseld: false, opnieuwOm: wacht };
    return { staat: n, gewisseld: false };
  }
  const d = top - s.vorige;
  const n: Staat = { ...s, vorige: top };
  if (top <= m.bandH) {
    n.som = 0;
    if (!n.verborgen) return { staat: n, gewisseld: false };
    return sinds >= MIN_TUSSEN_MS ? wissel(n, m.tijd, false) : { staat: n, gewisseld: false, opnieuwOm: wacht };
  }
  if (sinds < OVERGANG_MS) { n.som = 0; return { staat: n, gewisseld: false }; }
  if (d !== 0) n.som = n.som !== 0 && (d > 0) !== (n.som > 0) ? d : n.som + d;
  const wil = !n.verborgen ? n.som >= DREMPEL_PX && !m.vast : n.som <= -DREMPEL_PX;
  if (!wil) return { staat: n, gewisseld: false };
  return sinds >= MIN_TUSSEN_MS ? wissel(n, m.tijd, !n.verborgen) : { staat: n, gewisseld: false, opnieuwOm: wacht };
}

/** Tonen op verzoek van de gebruiker (muis aan de bovenrand, focus in de band, Esc). */
export function toonNu(s: Staat, tijd: number): Uitkomst {
  return s.verborgen ? wissel(s, tijd, false) : { staat: s, gewisseld: false };
}

/** Telt deze container mee? Verticaal scrollbaar en minstens de helft van het venster hoog. */
export function teltMee(c: { clientHeight: number; scrollHeight: number }, vensterH: number): boolean {
  return c.scrollHeight > c.clientHeight + 1 && c.clientHeight >= vensterH * MIN_HOOGTE_DEEL;
}

/** Kenmerk op <html> dat tech.css gebruikt. */
export const VERBORGEN_KENMERK = 'data-tech-verborgen';

/**
 * Koppelt de beslissing aan de pagina. Geeft een opruimfunctie terug (haalt ook het kenmerk weg).
 * `band`: het band-element (scrollen daarin telt niet; focus erin toont). `vast`: nu niet verbergen.
 */
export function koppelHeadroom(o: { band: () => Element | null; vast?: () => boolean; nu?: () => number }): () => void {
  if (typeof document === 'undefined') return () => undefined;
  const html = document.documentElement;
  const nu = o.nu || (() => performance.now());
  const laatst = new WeakMap<Element, number>();
  let s = beginStaat();
  let timer = 0;
  let laatsteMeting: Meting | null = null;
  const bandH = () => parseFloat(getComputedStyle(html).getPropertyValue('--tech-band-h')) || 40;
  const pas = (u: Uitkomst) => {
    s = u.staat;
    if (u.gewisseld) { if (s.verborgen) html.setAttribute(VERBORGEN_KENMERK, ''); else html.removeAttribute(VERBORGEN_KENMERK); }
    if (timer) { window.clearTimeout(timer); timer = 0; }
    if (u.opnieuwOm !== undefined) {
      timer = window.setTimeout(() => {
        timer = 0;
        if (laatsteMeting) pas(verwerkScroll(s, { ...laatsteMeting, tijd: nu(), vast: o.vast?.() }));
      }, Math.max(0, u.opnieuwOm - nu()) + 5);
    }
  };
  const opScroll = (e: Event) => {
    const el = e.target === document ? document.scrollingElement : e.target instanceof Element ? e.target : null;
    if (!el || o.band()?.contains(el)) return;
    const top = el.scrollTop;
    if (laatst.get(el) === top) return; // alleen horizontaal gescrold
    laatst.set(el, top);
    if (!teltMee(el, window.innerHeight)) return;
    laatsteMeting = { tijd: nu(), bron: el, scrollTop: top, max: el.scrollHeight - el.clientHeight, bandH: bandH(), vast: o.vast?.() };
    pas(verwerkScroll(s, laatsteMeting));
  };
  const toon = () => { if (s.verborgen) pas(toonNu(s, nu())); };
  const opMuis = (e: PointerEvent) => { if (s.verborgen && e.pointerType === 'mouse' && e.clientY <= RAND_PX) toon(); };
  const opFocus = (e: FocusEvent) => { if (e.target instanceof Node && o.band()?.contains(e.target)) toon(); };
  const opToets = (e: KeyboardEvent) => { if (e.key === 'Escape') toon(); };
  document.addEventListener('scroll', opScroll, { capture: true, passive: true });
  document.addEventListener('pointermove', opMuis, { passive: true });
  document.addEventListener('focusin', opFocus);
  document.addEventListener('keydown', opToets);
  return () => {
    document.removeEventListener('scroll', opScroll, { capture: true });
    document.removeEventListener('pointermove', opMuis);
    document.removeEventListener('focusin', opFocus);
    document.removeEventListener('keydown', opToets);
    if (timer) window.clearTimeout(timer);
    html.removeAttribute(VERBORGEN_KENMERK);
  };
}
