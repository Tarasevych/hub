// Technische band: inschuiven tot een dunne strook en weer uitschuiven — ÉÉN mechanisme (beslissing eigenaar 03.11.2026).
//
// Geschiedenis:
//  • 18.10.2026 «headroom»: verbergen bij naar beneden scrollen. De eerste versie (band-verbergen.ts) verschoof #root via `top` → de
//    scrollcontainer werd hoger → de browser corrigeerde scrollTop → scroll-gebeurtenis → band terug → … (live 305 wissels in 15 s).
//  • 02.11.2026: modi uitgeklapt / ingeklapt / automatisch (strook-voorkeur.ts), alleen met de vlag tech-ruimtes-v2, NAAST headroom.
//  • 03.11.2026 (eigenaar): «згортатися в тонку смужку, щоб займати менше місця, і розгортатися, коли наводжу на верхню область
//    вікна», zoals het menu van de site (open / dicht / auto, ZijbalkWerkbalk.tsx). Eén mechanisme, voor iedereen (zonder vlag):
//      - «Розгорнуто»: volle band; de ruimte is gereserveerd (#root top = volle hoogte). Er schuift niets.
//      - «Згорнуто»: dunne strook (gereserveerd = strookhoogte); uitschuiven alleen op verzoek (klik op de strook, knop ▾, toetsenbord).
//      - «Автоматично»: dunne strook; schuift uit als de muis tegen de bovenrand komt en weer in als hij wegglijdt.
//    Uitgeschoven ligt de band OVER de pagina (position:fixed; alleen de band zelf wordt hoger): #root, scrollHeight en clientHeight
//    veranderen nooit door in- of uitschuiven. Het aparte «verbergen bij scrollen» (data-tech-verborgen, translate van #root) is vervallen.
//
// Lusbescherming uit headroom (blijft; getest in tests/eenheid/band-inschuiven.test.ts):
//  1. wisselen verandert NOOIT de geometrie van de pagina, alleen de vaste band → de browser heeft niets te corrigeren;
//  2. hooguit één wissel per MIN_TUSSEN_MS; een wissel die eerder zou komen wacht (opnieuwOm) in plaats van te gebeuren;
//  3. muis: hysterese — uitschuiven alleen vanuit de bovenrand (strookhoogte), inschuiven pas als de muis de band + MARGE_PX verlaat,
//     telkens na een vertraging (OPEN_NA_MS / DICHT_NA_MS); kort langs de rand strijken (naar de tabbladen van de browser) opent niets;
//  4. scrollen: een uitgeschoven band (aangetikt of via het toetsenbord) schuift weer in na ≥ DREMPEL_PX naar beneden in ÉÉN echte
//     scrollcontainer (verwerkScroll: drempel, weg in één richting opgeteld, niets binnen OVERGANG_MS na een wissel, rubberband
//     begrensd, alleen grote containers). Scrollen schuift de band nooit UIT.

export const DREMPEL_PX = 24;
export const MIN_TUSSEN_MS = 300;
export const OVERGANG_MS = 220;
/** Muis binnen zoveel px van de bovenrand telt altijd als «bovenrand» (ook als de strook dunner zou zijn). */
export const RAND_PX = 6;
/** Alleen containers die minstens dit deel van de vensterhoogte beslaan tellen mee (geen kleine lijstjes/menu's). */
export const MIN_HOOGTE_DEEL = 0.5;
/** Muis zo lang in de bovenrand → uitschuiven (het menu van de site: 180 ms). */
export const OPEN_NA_MS = 150;
/** Muis zo lang buiten de band → inschuiven. Ruimer dan het menu (110 ms): de band ligt vlak onder de tabbladen van de browser. */
export const DICHT_NA_MS = 400;
/** Uitgeschoven: de muis mag zoveel px onder of naast de band komen zonder dat die inschuift (hysterese). */
export const MARGE_PX = 8;

export type Modus = 'uitgeklapt' | 'ingeklapt' | 'auto';

// ================================================================ scrollen (uit headroom; `verborgen` = ingeschoven)
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
  /** true = nu niet inschuiven (lijst «⋯», een paneel of venster van de band is open, of de muis staat op de band). */
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

// ================================================================ muis (zoals het menu van de site, met hysterese)
export type PiekStaat = {
  /** true = de band is uitgeschoven (over de pagina). */
  open: boolean;
  laatsteWissel: number;
  /** De stand die de muis nu wil maar die nog moet wachten (vertraging), of null. */
  wens: boolean | null;
  /** Sinds wanneer die wens geldt. */
  sinds: number;
};
export type PiekMeting = {
  tijd: number;
  /** De muis staat in de zone (dicht: de bovenrand; open: de band + MARGE_PX). Zie inZone. */
  binnen: boolean;
  /** true = open houden (lijst «⋯», paneel, snelmenu, focus in de band, slepen). */
  vast?: boolean;
};
export type PiekUitkomst = { staat: PiekStaat; gewisseld: boolean; opnieuwOm?: number };

export const beginPiek = (open = false): PiekStaat => ({ open, laatsteWissel: Number.NEGATIVE_INFINITY, wens: null, sinds: 0 });

/** Eén muisbeweging (of herbeoordeling) verwerken: uitschuiven na OPEN_NA_MS in de zone, inschuiven na DICHT_NA_MS erbuiten. */
export function verwerkWijzer(s: PiekStaat, m: PiekMeting): PiekUitkomst {
  const wil = !!m.vast || m.binnen;
  if (wil === s.open) return { staat: s.wens === null ? s : { ...s, wens: null }, gewisseld: false };
  const n: PiekStaat = s.wens === wil ? s : { ...s, wens: wil, sinds: m.tijd };
  // «vast» (menu/paneel/focus) wacht niet op de muisvertraging, wel op MIN_TUSSEN_MS.
  const vertraging = m.vast ? 0 : wil ? OPEN_NA_MS : DICHT_NA_MS;
  const klaar = Math.max(n.sinds + vertraging, n.laatsteWissel + MIN_TUSSEN_MS);
  if (m.tijd >= klaar) return { staat: { open: wil, laatsteWissel: m.tijd, wens: null, sinds: m.tijd }, gewisseld: true };
  return { staat: n, gewisseld: false, opnieuwOm: klaar };
}

/** Op verzoek (klik op de strook, knop ▾/📌, Esc, klik ernaast): meteen, zonder vertraging — de gebruiker vraagt het zelf. */
export function zetPiek(s: PiekStaat, open: boolean, tijd: number): PiekUitkomst {
  return s.open === open ? { staat: { ...s, wens: null }, gewisseld: false } : { staat: { open, laatsteWissel: tijd, wens: null, sinds: tijd }, gewisseld: true };
}

/**
 * Hysterese van de zone. Dicht: alleen de bovenrand van het venster (strookhoogte, minstens RAND_PX). Open: de band zelf plus
 * MARGE_PX eronder en ernaast. Zo kan de band die onder de muis uitschuift de muis nooit «buiten» zetten en andersom.
 */
export function inZone(open: boolean, x: number, y: number, band: { left: number; right: number; bottom: number } | null, strookH: number): boolean {
  if (!open) return y <= Math.max(RAND_PX, strookH);
  if (!band) return false;
  return y <= band.bottom + MARGE_PX && x >= band.left - MARGE_PX && x <= band.right + MARGE_PX;
}

/** Selectors van alles wat bij de band hoort maar buiten het element ligt (geportaleerd): klikken daarin is niet «ernaast». */
export const BAND_LAGEN = '[data-tech-band], [data-tech-strook-paneel], .tech-strook-menu, .venster, .venster-achter';

/**
 * Koppelt het mechanisme aan de pagina. `zet(open)` krijgt elke wissel (React-state in TechLaag). Geeft bediening terug:
 * `open()`/`sluit()` op verzoek van de gebruiker, `herstel()` na een moduswissel, `stop()` om alles los te koppelen.
 * Schrijft NIETS op <html> of #root: de stand staat alleen op de band (klasse in TechLaag) — geen geometrie, geen lus.
 */
export function koppelInschuiven(o: {
  band: () => Element | null;
  modus: () => Modus;
  /** Strookhoogte in px (ingeschoven). */
  strookH?: () => number;
  vast?: () => boolean;
  zet: (open: boolean) => void;
  nu?: () => number;
}): { open: () => void; sluit: () => void; herstel: () => void; stop: () => void } {
  const geen = { open: () => undefined, sluit: () => undefined, herstel: () => undefined, stop: () => undefined };
  if (typeof document === 'undefined') return geen;
  const nu = o.nu || (() => performance.now());
  const strookH = o.strookH || (() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tech-strook-h')) || 24);
  let piek = beginPiek(false);
  let scroll: Staat = beginStaat();
  let muisBinnen = false;
  // Na een uitdrukkelijk «in» (Esc, klik ernaast, scrollen, «Згорнути», moduswissel) schuift de muis de band pas weer uit nadat hij
  // de zone eerst verlaten heeft — anders klapt de band meteen weer open onder de muis die nog op de knop staat.
  let vertrekNodig = false;
  let laatsteXY: { x: number; y: number } | null = null;
  let timer = 0;
  const laatst = new WeakMap<Element, number>();
  const vast = () => !!o.vast?.();
  const ingeklapt = () => o.modus() !== 'uitgeklapt';

  const plan = (om: number | undefined) => {
    if (timer) { window.clearTimeout(timer); timer = 0; }
    if (om === undefined) return;
    timer = window.setTimeout(() => { timer = 0; beoordeel(); }, Math.max(0, om - nu()) + 5);
  };
  const pas = (u: PiekUitkomst) => {
    const was = piek.open;
    piek = u.staat;
    if (u.gewisseld && piek.open !== was) {
      if (piek.open) scroll = beginStaat(); // nieuw beginpunt voor «scrollen schuift weer in»
      o.zet(piek.open);
    }
    plan(u.opnieuwOm);
  };
  const zone = () => {
    if (!laatsteXY) return false;
    const r = o.band()?.getBoundingClientRect() ?? null;
    return inZone(piek.open, laatsteXY.x, laatsteXY.y, r, strookH());
  };
  /** Herbeoordeling (timer, focus, einde van een menu): dezelfde regel als bij een muisbeweging. */
  function beoordeel() {
    if (!ingeklapt()) { if (piek.open) pas(zetPiek(piek, false, nu())); return; }
    // «Згорнуто»: de muis schuift niets UIT (zoals het menu «dicht»), wel weer IN als de band op verzoek open staat.
    let binnen = muisBinnen && zone();
    if (vertrekNodig) { if (binnen && !piek.open) binnen = false; else if (!binnen) vertrekNodig = false; }
    if (o.modus() === 'ingeklapt' && !piek.open && !vast()) { plan(undefined); return; }
    pas(verwerkWijzer(piek, { tijd: nu(), binnen, vast: vast() }));
  }
  /** Uitdrukkelijk in: meteen, en de muis moet eerst weg voordat hij de band weer uitschuift. */
  const sluitNu = () => { vertrekNodig = true; pas(zetPiek(piek, false, nu())); };

  const opMuis = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return; // aanraken: geen «zweven», alleen tikken (zoals het menu op de telefoon)
    muisBinnen = true;
    laatsteXY = { x: e.clientX, y: e.clientY };
    if (!ingeklapt()) return;
    beoordeel();
  };
  const opUit = (e: PointerEvent) => {
    // Muis verlaat het venster (bv. naar de tabbladen van de browser): telt als «buiten».
    if (e.pointerType !== 'mouse' || (e as PointerEvent & { relatedTarget: EventTarget | null }).relatedTarget) return;
    muisBinnen = false;
    if (ingeklapt()) beoordeel();
  };
  const opFocus = () => { if (ingeklapt()) beoordeel(); };
  const opFocusIn = (e: FocusEvent) => {
    if (!ingeklapt() || !(e.target instanceof Node) || !o.band()?.contains(e.target)) return;
    if (!piek.open) pas(zetPiek(piek, true, nu())); // toetsenbord in de strook: meteen uit (de focus blijft op hetzelfde element)
  };
  const opToets = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !ingeklapt() || !piek.open || vast()) return;
    sluitNu();
  };
  const opDruk = (e: PointerEvent) => {
    if (!ingeklapt() || !piek.open) return;
    const t = e.target as Element | null;
    if (t && typeof t.closest === 'function' && t.closest(BAND_LAGEN)) return;
    if (vast()) return;
    sluitNu();
  };
  const opScroll = (e: Event) => {
    if (!ingeklapt() || !piek.open) return;
    const el = e.target === document ? document.scrollingElement : e.target instanceof Element ? e.target : null;
    if (!el || o.band()?.contains(el) || (typeof el.closest === 'function' && el.closest(BAND_LAGEN))) return;
    const top = el.scrollTop;
    if (laatst.get(el) === top) return; // alleen horizontaal gescrold
    laatst.set(el, top);
    if (!teltMee(el, window.innerHeight)) return;
    // De muis op de band of een open menu houdt hem uit; anders: ≥ DREMPEL_PX naar beneden → weer in.
    const u = verwerkScroll(scroll, { tijd: nu(), bron: el, scrollTop: top, max: el.scrollHeight - el.clientHeight, bandH: -1, vast: vast() || (muisBinnen && zone()) });
    scroll = u.staat;
    if (u.gewisseld && scroll.verborgen) { vertrekNodig = true; pas(zetPiek(piek, false, nu())); }
  };
  document.addEventListener('pointermove', opMuis, { passive: true });
  document.addEventListener('pointerout', opUit, { passive: true });
  document.addEventListener('pointerdown', opDruk, { capture: true, passive: true });
  document.addEventListener('focusin', opFocusIn);
  document.addEventListener('focusout', opFocus);
  document.addEventListener('keydown', opToets);
  document.addEventListener('scroll', opScroll, { capture: true, passive: true });
  return {
    open: () => { if (ingeklapt()) { vertrekNodig = false; pas(zetPiek(piek, true, nu())); } },
    sluit: sluitNu,
    herstel: () => { piek = beginPiek(false); vertrekNodig = true; plan(undefined); o.zet(false); },
    stop: () => {
      document.removeEventListener('pointermove', opMuis);
      document.removeEventListener('pointerout', opUit);
      document.removeEventListener('pointerdown', opDruk, { capture: true });
      document.removeEventListener('focusin', opFocusIn);
      document.removeEventListener('focusout', opFocus);
      document.removeEventListener('keydown', opToets);
      document.removeEventListener('scroll', opScroll, { capture: true });
      if (timer) window.clearTimeout(timer);
    },
  };
}
