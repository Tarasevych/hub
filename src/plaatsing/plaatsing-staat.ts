// Gedeelde staat van de zones en gniezda (25.10.2026, zwevende knoppen — shared/plaatsing.ts is het model).
//
// Waarom een losse winkel (useSyncExternalStore) en geen React-context: «Написати» (MailComposeFloat) staat in VerenigdDienstApp
// BUITEN CanonicalChrome. De omlijsting legt de zones en gniezda neer en publiceert hier de indeling; elke knop zoekt via <Plek> zijn
// eigen gniezdo op en tekent zich daarin (portal). Niemand rekent een positie uit, niemand kijkt naar een andere knop.
//
// Ook hier: de teller van de bel (voor ☰ als de bel in het menu staat), de hoogte van onderbalken (de stapel staat erboven), het
// sleepvoorbeeld en het menu «Перемістити до…».
//
// En de RUIMTE van de bovenbalk (25.10.2026, 2.5 «дзвоник перекриває кнопки вікна»): de vensters van de post liggen in
// .canonical-workspace (z-index 1) en kunnen dus nooit boven de zone komen — de zone krijgt ruimte, ze wordt niet verborgen. De laag
// MEET de zone (ResizeObserver: volgorde, aantal knoppen, tekstgrootte; resize/visualViewport: zoom; de omlijsting: menu rechts,
// uitklappen) en zet op <html> de maten van die ene meting — de enige bron voor elke kop eronder (opdrachtbalk van de post, kop van het
// leesvenster, bijlage):
//   --plaats-boven-reserve  afstand van de linkerrand van de zone tot de rechterrand van het venster (px; 0 = geen zone) — wat een kop
//                           BOVENAAN (leesvenster volledig/telefoon, opdrachtbalk) rechts vrijhoudt;
//   --plaats-boven-onder    onderrand van de zone (px vanaf de bovenrand; 0 = geen zone) — vensters die ONDER de balk beginnen
//                           (leesvenster rechts, bijlage) beginnen nooit hoger (grotere letters maken de zone hoger, 58 px niet);
//   --plaats-boven-paneel   als reserve, voor het open accountpaneel dat aan de foto in de zone hangt (0 = dicht).
// Een vaste reserve in een kop (vroeger padding-right:4.75rem) laat de build stoppen (scripts/plaatsing-controle.mjs, regel 5).
// Verplaatsbare vensters (het zwevende leesvenster) ontwijken de zone en de actiestapel: vensterHindernissen().
import { useSyncExternalStore } from 'react';
import { indeling as maakIndeling, standaardPlaatsing, type Indeling, type KnopId, type PaginaContext, type PlaatsingVoorkeur, type ZoneId } from '../../shared/plaatsing';

export type SleepDoel = { zone: ZoneId; index: number };
export type Sleep = { knop: KnopId; doel: SleepDoel | null; vol: ZoneId | null };
export type PlaatsMenu = { knop: KnopId; anker: { left: number; top: number; width: number; height: number } };
export type LadeBediening = { open: () => void; sluit: () => void; isOpen: () => boolean };

export type PlaatsStaat = {
  ctx: PaginaContext;
  voorkeur: PlaatsingVoorkeur;
  indeling: Indeling;
  /** Gniezda (het element waarin de knop zich tekent), per knop. */
  gniezda: Partial<Record<KnopId, HTMLElement>>;
  /** Zone-elementen, voor het slepen (raakvlak) en het dok (hindernissen). */
  zones: Partial<Record<ZoneId, HTMLElement>>;
  sleep: Sleep | null;
  menu: PlaatsMenu | null;
  /** Ongelezen meldingen (de bel publiceert); ☰ toont ze als de bel in het menu staat. */
  teller: number;
  /** Hoogte (px) van balken onderaan het scherm (verbindingsbanner, onderbalk van de lezer, geminimaliseerde brief, dok onder). */
  onder: number;
  /** Status voor schermlezers (aria-live). */
  status: string;
};

const startCtx: PaginaContext = { klasse: 'computer', dienst: '', zoekInMenu: false };
let staat: PlaatsStaat = { ctx: startCtx, voorkeur: standaardPlaatsing(), indeling: maakIndeling(standaardPlaatsing(), startCtx), gniezda: {}, zones: {}, sleep: null, menu: null, teller: 0, onder: 0, status: '' };
const luisteraars = new Set<() => void>();
let lade: LadeBediening | null = null;

function zet(patch: Partial<PlaatsStaat>) {
  staat = { ...staat, ...patch };
  for (const f of luisteraars) f();
}
const abonneer = (f: () => void) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; };
export const plaatsStaat = () => staat;
export function usePlaatsStaat(): PlaatsStaat { return useSyncExternalStore(abonneer, plaatsStaat, plaatsStaat); }
export function useGniezdo(knop: KnopId): HTMLElement | null {
  return useSyncExternalStore(abonneer, () => staat.gniezda[knop] || null, () => null);
}
export function useBelTeller(): number { return useSyncExternalStore(abonneer, () => staat.teller, () => 0); }

/** Melden aan wie zelf rekent met de stapel (het vensterdok): indeling of onderrand veranderd. */
function meldPlaatsing() { if (typeof window !== 'undefined') window.dispatchEvent(new Event('tsv:plaatsing')); }

/** De omlijsting publiceert (layout-effect): pagina, voorkeur en de indeling die ze zelf al tekende. */
export function publiceer(ctx: PaginaContext, voorkeur: PlaatsingVoorkeur, indeling: Indeling) {
  if (staat.ctx === ctx && staat.voorkeur === voorkeur && staat.indeling === indeling) return;
  const anders = JSON.stringify(staat.indeling) !== JSON.stringify(indeling) || staat.ctx.klasse !== ctx.klasse;
  zet({ ctx, voorkeur, indeling });
  if (anders) meldPlaatsing();
}

const gniezdoRefs = new Map<KnopId, (el: HTMLElement | null) => (() => void) | void>();
/** Ref-callback (React 19: met opruimfunctie) voor het gniezdo van `knop`. Stabiel per knop. */
export function gniezdoRef(knop: KnopId) {
  let f = gniezdoRefs.get(knop);
  if (!f) {
    f = (el) => {
      if (!el) return;
      if (staat.gniezda[knop] !== el) zet({ gniezda: { ...staat.gniezda, [knop]: el } });
      return () => { if (staat.gniezda[knop] === el) { const g = { ...staat.gniezda }; delete g[knop]; zet({ gniezda: g }); } };
    };
    gniezdoRefs.set(knop, f);
  }
  return f;
}
const zoneRefs = new Map<ZoneId, (el: HTMLElement | null) => (() => void) | void>();
export function zoneRef(zone: ZoneId) {
  let f = zoneRefs.get(zone);
  if (!f) {
    f = (el) => {
      if (!el) return;
      if (staat.zones[zone] !== el) zet({ zones: { ...staat.zones, [zone]: el } });
      const stop = zone === 'bovenbalk' ? volgBovenbalk(el) : undefined;
      return () => { stop?.(); if (staat.zones[zone] === el) { const z = { ...staat.zones }; delete z[zone]; zet({ zones: z }); } };
    };
    zoneRefs.set(zone, f);
  }
  return f;
}

// ------------------------------------------------------------------------------------------------------------------ ruimte van de bovenbalk
export type BovenRuimte = { reserve: number; onder: number; paneel: number };
const GEEN_BOVEN: BovenRuimte = { reserve: 0, onder: 0, paneel: 0 };
let boven: BovenRuimte = GEEN_BOVEN;
let bovenVolger: { el: HTMLElement; stop: () => void } | null = null;
/** De gemeten ruimte van de bovenbalk (px): zone (rechts en onderrand) en open accountpaneel. */
export const bovenRuimte = () => boven;
/** Ruimte die een vak rechts in het venster (breedte `vw`) inneemt: van zijn linkerrand tot de rechterrand; 0 zonder vak. Zuiver (getest). */
export function ruimteRechts(r: { left: number; width: number; height: number } | null | undefined, vw: number): number {
  return r && r.width >= 1 && r.height >= 1 ? Math.max(0, Math.ceil(vw - r.left)) : 0;
}
function zetBoven(b: BovenRuimte) {
  if (b.reserve === boven.reserve && b.onder === boven.onder && b.paneel === boven.paneel) return;
  const zoneAnders = b.reserve !== boven.reserve || b.onder !== boven.onder;
  boven = b;
  if (typeof document !== 'undefined') {
    const s = document.documentElement.style;
    s.setProperty('--plaats-boven-reserve', `${b.reserve}px`);
    s.setProperty('--plaats-boven-onder', `${b.onder}px`);
    s.setProperty('--plaats-boven-paneel', `${b.paneel}px`);
  }
  if (zoneAnders) meldPlaatsing(); // wie zelf met de zone rekent (zwevende vensters, het dok) rekent opnieuw
}
/** Volgt de zone «bovenbalk» zolang ze getekend is. Eén volger tegelijk: verschijnt de telefoonzone vóór de computerzone verdwijnt,
 *  dan zet de oude bij het opruimen de maat niet meer op 0. Geeft de opruimfunctie (React 19-ref). */
function volgBovenbalk(el: HTMLElement): () => void {
  bovenVolger?.stop();
  if (typeof window === 'undefined') return () => undefined;
  let raf = 0;
  const meet = () => {
    raf = 0;
    if (!el.isConnected) return;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const r = el.getBoundingClientRect(), paneel = el.querySelector('.canonical-account-panel');
    const reserve = ruimteRechts(r, vw);
    zetBoven({ reserve, onder: reserve ? Math.max(0, Math.ceil(r.bottom)) : 0, paneel: paneel ? ruimteRechts(paneel.getBoundingClientRect(), vw) : 0 });
  };
  const plan = () => { if (!raf) raf = requestAnimationFrame(meet); };
  // grootte: volgorde en aantal knoppen, tekstgrootte, open plek tijdens het slepen
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(plan) : null;
  ro?.observe(el);
  // inhoud (accountpaneel open/dicht) en plaats (menu rechts, uitgeklapt menu, iframe-inzet: klassen van de omlijsting)
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(plan) : null;
  mo?.observe(el, { childList: true, subtree: true });
  const omlijsting = el.closest('.canonical-chrome');
  if (omlijsting) mo?.observe(omlijsting, { attributes: true, attributeFilter: ['class', 'data-dock', 'data-plaats-iframe'] });
  // zoom en schermmaat
  window.addEventListener('resize', plan);
  window.visualViewport?.addEventListener('resize', plan);
  void document.fonts?.ready?.then(plan);
  meet();
  const volger = {
    el,
    stop: () => {
      cancelAnimationFrame(raf); ro?.disconnect(); mo?.disconnect();
      window.removeEventListener('resize', plan); window.visualViewport?.removeEventListener('resize', plan);
      if (bovenVolger === volger) { bovenVolger = null; zetBoven(GEEN_BOVEN); }
    },
  };
  bovenVolger = volger;
  return volger.stop;
}

export type Hindernis = { left: number; top: number; width: number; height: number };
/** Wat een verplaatsbaar venster (het zwevende leesvenster, src/mail/lees-modus.ts) niet mag bedekken: de zone «bovenbalk» en de
 *  actiestapel — die met al haar gereserveerde gniezda, ook als «Написати» even verborgen is, zodat het venster niet springt als een
 *  knop verschijnt (zelfde afspraak als het vensterdok). Vensterpixels; een zone die niet getekend of verborgen is, telt niet. */
export function vensterHindernissen(): Hindernis[] {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return [];
  const uit: Hindernis[] = [];
  for (const zone of ['bovenbalk', 'actiestapel'] as const) {
    const el = staat.zones[zone];
    if (!el || !el.isConnected) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || getComputedStyle(el).visibility === 'hidden') continue;
    uit.push({ left: r.left, top: r.top, width: r.width, height: r.height });
  }
  return uit;
}

export const zetSleep = (sleep: Sleep | null) => { if (JSON.stringify(sleep) !== JSON.stringify(staat.sleep)) zet({ sleep }); };
export const zetPlaatsMenu = (menu: PlaatsMenu | null) => zet({ menu });
export const zetBelTeller = (n: number) => { if (n !== staat.teller) zet({ teller: n }); };
export const zetOnder = (px: number) => { const n = Math.max(0, Math.round(px)); if (n !== staat.onder) { zet({ onder: n }); meldPlaatsing(); } };
export const zetPlaatsStatus = (status: string) => zet({ status });

/** De omlijsting geeft de lade (telefoon) in bediening: slepen naar ☰ of de linkerrand opent haar (veerlade). */
export function zetLade(b: LadeBediening | null) { lade = b; }
export const ladeBediening = () => lade;

/** Alleen voor tests. */
export function __plaatsReset() {
  staat = { ctx: startCtx, voorkeur: standaardPlaatsing(), indeling: maakIndeling(standaardPlaatsing(), startCtx), gniezda: {}, zones: {}, sleep: null, menu: null, teller: 0, onder: 0, status: '' };
  lade = null;
  bovenVolger?.stop(); bovenVolger = null; boven = GEEN_BOVEN;
  for (const f of luisteraars) f();
}
