// Plaats van de melding (toast) — 25.10.2026.
//
// Twee afspraken met de eigenaar die elkaar kunnen raken:
//  - voorstel «Плаваючі кнопки» (MAKET-PLAVAYUCHI-KNOPKY-2026-10-25): op de computer onder de bel, op de telefoon bovenaan onder de
//    balk en nooit boven de stapel;
//  - QA 12.10.2026 №11 / M7: een melding ligt nooit op een kleine bedieningsknop (knoppen van een rij, «Надіслати», de bel) — na het
//    automatisch verdwijnen viel een klik op de knop eronder en werd een brief als ongelezen gemarkeerd.
// Gemeten op de stand: onder de bel lag de melding op de post op «‹ 1–10 із 18 ›». Daarom: kandidaten in volgorde van voorkeur, de
// eerste zonder kleine knop eronder wint; zijn alle kandidaten bezet, dan de eerste (en `vrij: false`, zichtbaar in data-melding-vrij).
//
// Rekenen in VENSTERcoördinaten (wat je ziet); pas op het einde terug naar het kader van de melding: de verschuiving wordt gemeten op de
// melding zelf (getBoundingClientRect − berekende left/top), zodat het klopt met én zonder technische band, met of zonder translate.
import { placeNear } from '../melding-positie';
import type { Klasse } from '../../shared/plaatsing';
import { plaatsStaat } from './plaatsing-staat';

export type Doos = { left: number; top: number; width: number; height: number };
export type MeldingPlek = 'bel' | 'onder' | 'boven' | 'midden';
export type Kandidaat = { plek: MeldingPlek; doos: Doos };
export type MeldingKeuze = { left: number; top: number; plek: MeldingPlek; vrij: boolean };

export const overlapDoos = (a: Doos, b: Doos, marge = 0) =>
  a.left < b.left + b.width + marge && a.left + a.width + marge > b.left && a.top < b.top + b.height + marge && a.top + a.height + marge > b.top;

/** Eerste kandidaat zonder hindernis (rakende randen mogen; `marge` px extra lucht); anders de eerste kandidaat, `vrij: false`. Zuiver (getest). */
export function kiesMeldingPlek(kandidaten: Kandidaat[], hindernissen: Doos[], marge = 0): (Kandidaat & { vrij: boolean }) | null {
  for (const k of kandidaten) if (!hindernissen.some((h) => overlapDoos(k.doos, h, marge))) return { ...k, vrij: true };
  return kandidaten.length ? { ...kandidaten[0], vrij: false } : null;
}

/** Eerste y ≥ `van` waar een band van hoogte `h` vrij is van hindernissen (met `marge` lucht) en die vóór `tot` eindigt; anders null.
 *  Gebruikt als laatste kandidaat: een kolom (computer: het midden van het werkvlak, telefoon: de hele breedte) van boven naar onder. */
export function vrijeBand(van: number, tot: number, h: number, hindernissen: Array<{ top: number; height: number }>, marge = 4): number | null {
  let y = van;
  for (const o of [...hindernissen].map((x) => ({ top: x.top - marge, bottom: x.top + x.height + marge })).sort((a, b) => a.top - b.top)) {
    if (o.bottom <= y) continue;
    if (o.top >= y + h) break;
    y = o.bottom;
  }
  return y + h <= tot ? Math.round(y) : null;
}

/** Wat als bediening telt. Grote klikvlakken (een hele rij van de lijst) tellen niet mee: die liggen overal, en daar ging 12.10 niet over. */
export const BEDIENING = 'button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch],[role=menuitem],[contenteditable=true]';
export const GROOT_KLIKVLAK = { breedte: 400, hoogte: 120 };

type Zichtbaar = Element & { checkVisibility?: (o?: Record<string, boolean>) => boolean };
const zichtbaar = (el: Element) => {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const z = el as Zichtbaar;
  if (typeof z.checkVisibility === 'function') return z.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true });
  return getComputedStyle(el).visibility !== 'hidden';
};

/** Kleine, echt zichtbare bediening die een van de dozen raakt (venstercoördinaten). «Echt zichtbaar»: niet weggeknipt door een
 *  scrollvak en niet bedekt door een andere laag — getoetst met elementFromPoint in het zichtbare deel (de melding zelf laat dan door). */
export function bedieningOnder(dozen: Doos[], melding: HTMLElement): Doos[] {
  if (typeof document === 'undefined' || !dozen.length) return [];
  const uit: Doos[] = [];
  const vw = window.innerWidth, vh = window.innerHeight;
  const oud = melding.style.pointerEvents;
  melding.style.pointerEvents = 'none';
  try {
    for (const k of document.querySelectorAll<HTMLElement>(BEDIENING)) {
      if (k.closest('.canonical-notification-toast,.canonical-notification-panel')) continue;
      const r = k.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.width > GROOT_KLIKVLAK.breedte || r.height > GROOT_KLIKVLAK.hoogte) continue;
      const d: Doos = { left: r.left, top: r.top, width: r.width, height: r.height };
      if (!dozen.some((b) => overlapDoos(b, d, 4))) continue;
      if (!zichtbaar(k)) continue;
      const x0 = Math.max(0, r.left), x1 = Math.min(vw, r.right), y0 = Math.max(0, r.top), y1 = Math.min(vh, r.bottom);
      if (x1 - x0 < 1 || y1 - y0 < 1) continue;
      const t = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
      if (!t || !(t === k || k.contains(t) || t.contains(k))) continue;
      uit.push(d);
    }
  } finally {
    melding.style.pointerEvents = oud;
  }
  return uit;
}

/** Kandidaten in venstercoördinaten. Computer: onder de bel → onderaan in het midden van het werkvlak (12.10) → bovenaan in het midden
 *  onder de balk. Telefoon (de melding is dan schermbreed, CSS): bovenaan onder de balk → boven de stapel. */
export function meldingKandidaten(o: { klasse: Klasse; breedte: number; hoogte: number; vw: number; vh: number; bel: Doos | null; balkOnder: number; werk: Doos | null; stapel: Doos | null; onder: number; kader: { left: number; top: number; width: number; height: number; kx: number; ky: number } }): Kandidaat[] {
  const { klasse, breedte: w, hoogte: h, vw, vh } = o;
  const boven = Math.max(8, o.balkOnder + 6);
  if (klasse === 'telefoon') {
    const links = 8, br = Math.max(0, vw - 16);
    const bodem = o.stapel && o.stapel.height ? o.stapel.top - 8 : vh - o.onder - 12;
    return [{ plek: 'boven', doos: { left: links, top: boven, width: br, height: h } }, { plek: 'onder', doos: { left: links, top: bodem - h, width: br, height: h } }];
  }
  const uit: Kandidaat[] = [];
  if (o.bel) {
    const v = o.kader;
    const p = placeNear({ left: o.bel.left - v.kx, top: o.bel.top - v.ky, width: o.bel.width, height: o.bel.height }, { width: w, height: h }, v, { gap: 10 });
    uit.push({ plek: 'bel', doos: { left: p.left + v.kx, top: p.top + v.ky, width: w, height: h } });
  }
  const midden = o.werk && o.werk.width > w ? o.werk.left + o.werk.width / 2 : vw / 2;
  const links = Math.max(8, Math.min(vw - w - 8, Math.round(midden - w / 2)));
  let bodem = vh - o.onder - 24;
  if (o.stapel && o.stapel.height && links < o.stapel.left + o.stapel.width && links + w > o.stapel.left) bodem = Math.min(bodem, o.stapel.top - 8);
  uit.push({ plek: 'onder', doos: { left: links, top: Math.round(bodem - h), width: w, height: h } });
  uit.push({ plek: 'boven', doos: { left: links, top: Math.round(boven + 4), width: w, height: h } });
  return uit;
}

/** Onderkant van de bovenbalk in vensterpixels. De <header> zelf heeft geen hoogte (de stukken erin staan vast), dus: het laagste
 *  zichtbare stuk bovenaan — foto/zoeken/bel, de opdrachtbalk van de post, ☰. */
export const BALK_STUKKEN = ".canonical-topbar .canonical-account-anchor,.mail-top-command-bar,.canonical-sidebar .canonical-menu-toggle[data-sidebar-action='open-drawer']";
export function balkOnder(): number {
  let b = 0;
  for (const e of document.querySelectorAll(BALK_STUKKEN)) { const r = e.getBoundingClientRect(); if (r.height > 0 && r.top < 120 && zichtbaar(e)) b = Math.max(b, r.bottom); }
  return b || 56;
}

const doosVan = (el: Element | null | undefined): Doos | null => {
  if (!el || !el.isConnected || !zichtbaar(el)) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** De plek van de melding `el` in de coördinaten van haar eigen kader (wat in style.left/top hoort), of null als ze niet getekend is. */
export function meldingPlaats(el: HTMLElement, bel: HTMLElement | null, klasse: Klasse, kader: { left: number; top: number; width: number; height: number; kx: number; ky: number }): MeldingKeuze | null {
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h) return null;
  const kandidaten = meldingKandidaten({
    klasse, breedte: w, hoogte: h, vw: window.innerWidth, vh: window.innerHeight,
    bel: doosVan(bel), balkOnder: balkOnder(),
    werk: doosVan(document.querySelector('.canonical-workspace')), stapel: doosVan(document.querySelector('.plaats-actiestapel')),
    onder: plaatsStaat().onder || 0, kader,
  });
  let keuze = kiesMeldingPlek(kandidaten, bedieningOnder(kandidaten.map((k) => k.doos), el));
  if (!keuze) return null;
  if (!keuze.vrij) {
    // laatste kandidaat: de eerste vrije band in de kolom van de melding, van onder de balk tot boven de stapel
    const eerste = kandidaten[kandidaten.length - 1].doos, vh = window.innerHeight;
    const stapel = doosVan(document.querySelector('.plaats-actiestapel'));
    const van = Math.max(8, balkOnder() + 6), tot = stapel && stapel.left < eerste.left + eerste.width && stapel.left + stapel.width > eerste.left ? stapel.top - 8 : vh - (plaatsStaat().onder || 0) - 12;
    const kolom: Doos = { left: eerste.left, top: van, width: eerste.width, height: Math.max(0, tot - van) };
    const y = vrijeBand(van, tot, h, bedieningOnder([kolom], el));
    if (y !== null) keuze = { plek: 'midden', doos: { left: eerste.left, top: y, width: eerste.width, height: h }, vrij: true };
  }
  // venster → kader van de melding: de verschuiving zoals ze nu getekend wordt (kader, translate van #root, eigen compensatie), zonder
  // de lopende intro-animatie (translate 0 8px → 0): die wordt voor de meting even naar haar einde gezet en daarna teruggezet.
  const { dx, dy } = verschuivingZonderAnimatie(el);
  return { left: Math.round(keuze.doos.left - dx), top: Math.round(keuze.doos.top - dy), plek: keuze.plek, vrij: keuze.vrij };
}

function verschuivingZonderAnimatie(el: HTMLElement): { dx: number; dy: number } {
  const anims = typeof el.getAnimations === 'function' ? el.getAnimations().filter((a) => a.playState !== 'finished' && a.playState !== 'idle') : [];
  const tijden = anims.map((a) => a.currentTime);
  try {
    for (const a of anims) { const eind = a.effect?.getComputedTiming().endTime; if (typeof eind === 'number' && Number.isFinite(eind)) a.currentTime = eind; }
    const r0 = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return { dx: r0.left - (parseFloat(cs.left) || 0), dy: r0.top - (parseFloat(cs.top) || 0) };
  } finally {
    anims.forEach((a, i) => { try { a.currentTime = tijden[i]; } catch { /* animatie al weg */ } });
  }
}
