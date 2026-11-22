// Спільний перегляд вкладень, етап 2 (Grok: hub.tarasevych.com). Vlag `bijlage-weergave-gedeeld-v1`, standaard UIT.
// Gedrag rond de viewer: vegen op de telefoon, de mailbalk erachter onbereikbaar maken zolang de viewer open is,
// en per bestand de plek onthouden (scrollpositie en zoom), lokaal en per accountprofiel.
import { useEffect, useRef } from 'react';

/** Vegen met een vinger: links = volgende, rechts = vorige. Niet als de inhoud zelf horizontaal scrolt of ingezoomd is. */
export function veegRichting(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (ms > 700 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return 0;
  return dx < 0 ? 1 : -1;
}

function scroltHorizontaal(doel: EventTarget | null, grens: Element): boolean {
  let e = doel instanceof Element ? doel : null;
  while (e && e !== grens) {
    const cs = getComputedStyle(e);
    if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 4) return true;
    if (e.matches('input, textarea, select, [contenteditable="true"], .weergave-strook')) return true;
    e = e.parentElement;
  }
  return false;
}

export function useVeeg(ref: { current: HTMLElement | null }, actief: boolean, opVeeg: (r: -1 | 1) => void, ingezoomd = false) {
  const cb = useRef(opVeeg); cb.current = opVeeg;
  useEffect(() => {
    const el = ref.current;
    if (!actief || !el) return;
    let start: { x: number; y: number; t: number; mag: boolean } | null = null;
    const begin = (e: TouchEvent) => {
      if (e.touches.length !== 1 || ingezoomd) { start = null; return; }
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, t: Date.now(), mag: !scroltHorizontaal(e.target, el) };
    };
    const einde = (e: TouchEvent) => {
      const s = start; start = null;
      if (!s || !s.mag || (window.visualViewport && window.visualViewport.scale > 1.05)) return;
      const t = e.changedTouches[0];
      const r = veegRichting(t.clientX - s.x, t.clientY - s.y, Date.now() - s.t);
      if (r) cb.current(r);
    };
    el.addEventListener('touchstart', begin, { passive: true });
    el.addEventListener('touchend', einde, { passive: true });
    return () => { el.removeEventListener('touchstart', begin); el.removeEventListener('touchend', einde); };
  }, [ref, actief, ingezoomd]);
}

/** Zolang de viewer open is, zijn de elementen achter hem (de balk van het bericht) niet klikbaar en niet bereikbaar met Tab. */
export function useAchterInert(actief: boolean, selector: string) {
  useEffect(() => {
    if (!actief) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((e) => !e.hasAttribute('inert'));
    for (const e of els) { e.setAttribute('inert', ''); e.setAttribute('data-weergave-inert', ''); }
    return () => { for (const e of els) { e.removeAttribute('inert'); e.removeAttribute('data-weergave-inert'); } };
  }, [actief, selector]);
}

// ── plek onthouden ─────────────────────────────────────────────────────────────
export type Plek = { boven: number; links: number; zoom: number; t: number };
const VOORVOEGSEL = 'tsv:bijlage-plek:';
const MAX_PLEKKEN = 200;

export function plekSleutel(profiel: string, account: string, bericht: string, bijlage: string): string {
  return `${VOORVOEGSEL}${profiel || '-'}:${account || '-'}:${bericht}:${bijlage}`;
}

export function leesPlek(opslag: Storage | null, sleutel: string): Plek | null {
  try {
    const v = JSON.parse(opslag?.getItem(sleutel) || 'null') as Plek | null;
    if (!v || typeof v.boven !== 'number' || typeof v.zoom !== 'number') return null;
    return { boven: Math.max(0, v.boven), links: Math.max(0, Number(v.links) || 0), zoom: Math.min(4, Math.max(0.25, v.zoom)), t: Number(v.t) || 0 };
  } catch { return null; }
}

export function bewaarPlek(opslag: Storage | null, sleutel: string, plek: Omit<Plek, 't'>, nu = Date.now()) {
  if (!opslag) return;
  try {
    opslag.setItem(sleutel, JSON.stringify({ ...plek, t: nu }));
    // opruimen: alleen de nieuwste MAX_PLEKKEN bewaren
    const alle: Array<[string, number]> = [];
    for (let i = 0; i < opslag.length; i++) {
      const k = opslag.key(i);
      if (k && k.startsWith(VOORVOEGSEL)) alle.push([k, leesPlek(opslag, k)?.t || 0]);
    }
    if (alle.length > MAX_PLEKKEN) alle.sort((a, b) => a[1] - b[1]).slice(0, alle.length - MAX_PLEKKEN).forEach(([k]) => opslag.removeItem(k));
  } catch { /* vol of geblokkeerd: niets onthouden */ }
}

/** Het grootste scrollende element in de inhoud van de viewer (kop en strook tellen niet). */
export function zoekScroller(wortel: Element | null): HTMLElement | null {
  if (!wortel) return null;
  let beste: HTMLElement | null = null, oppervlak = 0;
  for (const e of Array.from(wortel.querySelectorAll<HTMLElement>('*'))) {
    if (e.closest('.weergave-kop, .weergave-strook, .weergave-paneel')) continue;
    if (e.scrollHeight <= e.clientHeight + 20 && e.scrollWidth <= e.clientWidth + 20) continue;
    const cs = getComputedStyle(e);
    if (!/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) continue;
    const o = e.clientWidth * e.clientHeight;
    if (o > oppervlak) { oppervlak = o; beste = e; }
  }
  return beste;
}

const opslagVan = (): Storage | null => { try { return window.localStorage; } catch { return null; } };

/** Herstelt de plek zodra de inhoud lang genoeg is (tot 4 s wachten op trage rendering) en bewaart elke wijziging. */
export function usePlekOnthouden(o: { actief: boolean; sleutel: string; wortel: { current: HTMLElement | null }; zoom: number; zetZoom?: (z: number) => void }) {
  const zoomRef = useRef(o.zoom); zoomRef.current = o.zoom;
  const zet = useRef(o.zetZoom); zet.current = o.zetZoom;
  useEffect(() => {
    if (!o.actief || !o.sleutel) return;
    const opslag = opslagVan();
    const plek = leesPlek(opslag, o.sleutel);
    let scroller: HTMLElement | null = null, klaar = !plek, weg = false, timer = 0;
    if (plek && zet.current && Math.abs(plek.zoom - zoomRef.current) > 0.01) zet.current(plek.zoom);
    const opslaan = () => {
      if (!scroller || !klaar) return;
      bewaarPlek(opslag, o.sleutel, { boven: scroller.scrollTop, links: scroller.scrollLeft, zoom: zoomRef.current });
    };
    const opScroll = () => { window.clearTimeout(timer); timer = window.setTimeout(opslaan, 250); };
    const begin = Date.now();
    const probeer = () => {
      if (weg) return;
      const s = zoekScroller(o.wortel.current);
      if (s && s !== scroller) { scroller?.removeEventListener('scroll', opScroll); scroller = s; s.addEventListener('scroll', opScroll, { passive: true }); }
      if (!klaar && scroller && plek) {
        if (scroller.scrollHeight - scroller.clientHeight >= plek.boven - 2 || Date.now() - begin > 4000) {
          scroller.scrollTo({ top: plek.boven, left: plek.links });
          klaar = true;
        }
      }
      if ((!klaar || !scroller) && Date.now() - begin < 4000) window.setTimeout(probeer, 150);
      else klaar = true;
    };
    window.setTimeout(probeer, 60);
    return () => { weg = true; window.clearTimeout(timer); opslaan(); scroller?.removeEventListener('scroll', opScroll); };
  }, [o.actief, o.sleutel, o.wortel]);
  // zoom wijzigt zonder scroll: ook bewaren (niet bij de eerste weergave van een bestand: dan wordt juist hersteld)
  const gezien = useRef('');
  useEffect(() => {
    if (!o.actief || !o.sleutel) return;
    if (gezien.current !== o.sleutel) { gezien.current = o.sleutel; return; }
    const opslag = opslagVan();
    const oud = leesPlek(opslag, o.sleutel);
    if (!oud || Math.abs(oud.zoom - o.zoom) > 0.01) bewaarPlek(opslag, o.sleutel, { boven: oud?.boven || 0, links: oud?.links || 0, zoom: o.zoom });
  }, [o.zoom, o.sleutel, o.actief]);
}
