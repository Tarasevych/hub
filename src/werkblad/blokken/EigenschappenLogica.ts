// Werkblad «Blokken» — pure hulpfuncties van het eigenschappenpaneel (stroom C). Geen DOM, geen netwerk.
// Werkt alleen met de types uit het contract (shared/werkblad-blokken.ts); als stroom A eigen boombewerkingen levert,
// kan de integrator die via de prop `functies` van EigenschappenPaneel inprikken — deze versies zijn de terugval.
import {
  BLOKKEN_LIMIETEN, MAAT_AUTO, STANDAARD_INDELING, VOORINSTELLINGEN,
  type Blok, type Knoop, type KnoopId, type Maat, type VoorinstellingId,
} from '../../../shared/werkblad-blokken';

export function zoekKnoop(wortel: Blok, id: KnoopId): { knoop: Knoop; ouder: Blok | null } | null {
  if (wortel.id === id) return { knoop: wortel, ouder: null };
  for (const k of wortel.kinderen) {
    if (k.id === id) return { knoop: k, ouder: wortel };
    if (k.soort === 'blok') { const r = zoekKnoop(k, id); if (r) return r; }
  }
  return null;
}

/** Vervangt knoop `id` door f(knoop); geeft een nieuwe boom (structureel gedeeld), of dezelfde als id niet bestaat. */
export function wijzigKnoop(wortel: Blok, id: KnoopId, f: (k: Knoop) => Knoop): Blok {
  if (wortel.id === id) { const n = f(wortel); return n.soort === 'blok' ? n : wortel; }
  let veranderd = false;
  const kinderen = wortel.kinderen.map((k) => {
    if (k.id === id) { veranderd = true; return f(k); }
    if (k.soort === 'blok') { const n = wijzigKnoop(k, id, f); if (n !== k) { veranderd = true; return n; } }
    return k;
  });
  return veranderd ? { ...wortel, kinderen } : wortel;
}

const kloon = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Zet een waarde op een pad als 'icoon.grootte' of 'uiterlijk.achtergrond'. `undefined` = sleutel weghalen. */
export function zetPad<T extends Knoop>(k: T, pad: string, waarde: unknown): T {
  const n = kloon(k) as Record<string, unknown>;
  const delen = pad.split('.');
  let o = n;
  for (const d of delen.slice(0, -1)) { if (typeof o[d] !== 'object' || o[d] === null) o[d] = {}; o = o[d] as Record<string, unknown>; }
  const laatste = delen[delen.length - 1];
  if (waarde === undefined) delete o[laatste]; else o[laatste] = waarde;
  return n as T;
}
export function leesPad(k: unknown, pad: string): unknown {
  return pad.split('.').reduce<unknown>((o, d) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[d] : undefined), k);
}

/** Standaardwaarde per pad («Скинути» = terug naar авто). */
export function standaardVoor(pad: string): unknown {
  if (pad === 'afmeting.breedte' || pad === 'afmeting.hoogte' || pad === 'icoon.grootte') return MAAT_AUTO;
  if (pad.startsWith('indeling.')) return (STANDAARD_INDELING as unknown as Record<string, unknown>)[pad.slice(9)];
  return undefined;
}
export function isStandaard(k: Knoop, pad: string): boolean {
  const w = leesPad(k, pad), s = standaardVoor(pad);
  return JSON.stringify(w ?? null) === JSON.stringify(s ?? null);
}
export function herstelPad(k: Knoop, pad: string): Knoop {
  const s = standaardVoor(pad);
  let n = zetPad(k, pad, s === undefined ? undefined : kloon(s));
  // lege objecten opruimen (icoon zonder grootte is ongeldig → hele icoon weg als alles standaard is)
  if (pad.startsWith('icoon.') && n.soort === 'onderdeel' && n.icoon && Object.keys(n.icoon).every((x) => x === 'grootte' && isStandaard(n, 'icoon.grootte'))) n = { ...n, icoon: undefined };
  for (const g of ['uiterlijk', 'label', 'apparaten', 'rasterSpan'] as const) {
    const v = (n as unknown as Record<string, unknown>)[g];
    if (v && typeof v === 'object' && Object.keys(v).length === 0) n = { ...n, [g]: undefined } as Knoop;
  }
  return n;
}
export function herstelAlles(k: Knoop): Knoop {
  const basis = { id: k.id, afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: k.volgorde, positie: k.positie };
  if (k.soort === 'onderdeel') return { ...basis, soort: 'onderdeel', itemId: k.itemId, config: k.config };
  return { ...basis, soort: 'blok', titel: k.titel, indeling: { ...STANDAARD_INDELING }, kinderen: k.kinderen };
}

/** Voorinstelling op een blok: indeling samenvoegen, icoon/label als standaard voor alle kinderen zonder eigen waarde. */
export function pasVoorinstellingToe(b: Blok, v: VoorinstellingId): Blok {
  const p = VOORINSTELLINGEN[v];
  const indeling = v === 'raster-automatisch' ? { ...STANDAARD_INDELING } : { ...b.indeling, ...p.indeling };
  const std = v === 'raster-automatisch' ? undefined : {
    ...(p.icoon ? { icoon: { grootte: MAAT_AUTO, ...p.icoon } } : {}),
    ...(p.label ? { label: { tonen: 'auto' as const, plaats: 'onder' as const, ...p.label } } : {}),
  };
  return { ...b, indeling, standaardOnderdeel: std && Object.keys(std).length ? std : undefined };
}

export function begrensMaat(m: Maat): Maat {
  if (m.soort === 'auto') return m;
  const r = (lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(m.waarde) ? m.waarde : lo)));
  if (m.soort === 'px') return { soort: 'px', waarde: r(BLOKKEN_LIMIETEN.minPx, BLOKKEN_LIMIETEN.maxPx) };
  if (m.soort === 'procent') return { soort: 'procent', waarde: r(1, 100) };
  return { soort: 'deel', waarde: r(1, 12) };
}

// ---------------------------------------------------------------- contrast (WCAG 2)
export function hexNaarRgb(h: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(h.trim()); if (!m) return null;
  const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export function luminantie(rgb: [number, number, number]) { return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]); }
export function contrastVerhouding(a: string, b: string): number | null {
  const x = hexNaarRgb(a), y = hexNaarRgb(b); if (!x || !y) return null;
  const l1 = luminantie(x), l2 = luminantie(y);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
export const CONTRAST_MIN = 4.5;

// ---------------------------------------------------------------- geschiedenis (ongedaan/opnieuw), max 50
export interface Geschiedenis<T> { verleden: T[]; heden: T; toekomst: T[] }
export const nieuweGeschiedenis = <T,>(heden: T): Geschiedenis<T> => ({ verleden: [], heden, toekomst: [] });
export function duw<T>(g: Geschiedenis<T>, nieuw: T): Geschiedenis<T> {
  if (nieuw === g.heden) return g;
  return { verleden: [...g.verleden, g.heden].slice(-BLOKKEN_LIMIETEN.maxGeschiedenis), heden: nieuw, toekomst: [] };
}
export function terug<T>(g: Geschiedenis<T>): Geschiedenis<T> {
  if (!g.verleden.length) return g;
  return { verleden: g.verleden.slice(0, -1), heden: g.verleden[g.verleden.length - 1], toekomst: [g.heden, ...g.toekomst] };
}
export function vooruit<T>(g: Geschiedenis<T>): Geschiedenis<T> {
  if (!g.toekomst.length) return g;
  return { verleden: [...g.verleden, g.heden], heden: g.toekomst[0], toekomst: g.toekomst.slice(1) };
}
