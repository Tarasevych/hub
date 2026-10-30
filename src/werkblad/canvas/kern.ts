// Werkblad v3 — interactiekern van het vrije canvas (Etappe C). Puur TypeScript: geen React, geen DOM.
//
// Alle posities zijn LOGISCHE px in het canvas van de indeling (CanvasLayout.canvasWidth). De React-laag rekent pointer-px om met
// `schaal` (= echte containerbreedte / canvasWidth), zodat zoom 200 %, een in-/uitgeklapte zijbalk of een draaiende tablet de
// opgeslagen posities NIET verandert.
//
// Eén atomaire commit: een gebaar (verplaatsen/formaat) leeft in een synchroon object (`Gebaar`). `beweeg()` geeft een nieuw object
// terug; `eindGebaar()` berekent de definitieve indeling UITSLUITEND uit dat object + de indeling bij de start — nooit uit React-state.
// Daarmee is de race uit v2 (startMaat/beweegMaat via setState, eindMaat via indelingRef) structureel uitgesloten.
import type { ApparaatKlasse, CanvasLayout, DesktopEntry } from '../../../shared/werkblad-v3-types';
import { WERKBLAD_V3_LIMIETEN } from '../../../shared/werkblad-v3-types';

export type Rect = { x: number; y: number; w: number; h: number };
export type Afmetingsgrenzen = { minW: number; minH: number; maxW: number; maxH: number };
/** Grenzen per register-item (itemId). Onbekend → algemene grenzen uit het contract. */
export type LimietenFn = (itemId: string) => Partial<Afmetingsgrenzen> | undefined;
export type Rand = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const RANDEN: readonly Rand[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

export type Beleid = {
  /** Uitlijnen op een raster (stap in logische px). */
  snap: boolean;
  raster: number;
  /** true = overlappen mag (z-volgorde + «На передній план»); false = onbedoelde overlap vermijden. */
  overlap: boolean;
};
export const RASTER_STANDAARD = 8;
/** free → overlap toegestaan, geen raster; snap → raster + geen overlap; flow → geen overlap. Overschrijfbaar per prop. */
export function beleidVoor(l: CanvasLayout, o: Partial<Beleid> = {}): Beleid {
  return { snap: o.snap ?? l.mode === 'snap', raster: Math.max(1, Math.round(o.raster ?? RASTER_STANDAARD)), overlap: o.overlap ?? l.mode === 'free' };
}

const L = WERKBLAD_V3_LIMIETEN;
const eindig = (n: number, s = 0) => (Number.isFinite(n) ? n : s);
export function grenzenVan(limieten: LimietenFn | undefined, itemId: string, canvasW?: number): Afmetingsgrenzen {
  const g = limieten?.(itemId) || {};
  const minW = Math.min(canvasW || Infinity, Math.max(L.minAfm, eindig(g.minW ?? L.minAfm, L.minAfm))), minH = Math.max(L.minAfm, eindig(g.minH ?? L.minAfm, L.minAfm));
  let maxW = Math.min(L.maxAfm, eindig(g.maxW ?? L.maxAfm, L.maxAfm)), maxH = Math.min(L.maxAfm, eindig(g.maxH ?? L.maxAfm, L.maxAfm));
  if (canvasW) maxW = Math.min(maxW, canvasW);
  // Een minimum breder dan het canvas (v2-widget op de telefoon) mag niet buiten beeld duwen: dan geldt de canvasbreedte.
  return { minW, minH, maxW: Math.max(minW, maxW), maxH: Math.max(minH, maxH) };
}

export const klem = (v: number, a: number, b: number) => Math.min(Math.max(v, a), Math.max(a, b));
const rond = (n: number) => Math.round(n);
export const rechthoek = (e: Pick<DesktopEntry, 'x' | 'y' | 'w' | 'h'>): Rect => ({ x: e.x, y: e.y, w: e.w, h: e.h });
export const overlapt = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const zichtbareItems = (l: CanvasLayout) => l.items.filter((e) => !e.parent);

/** Houdt een rechthoek binnen het canvas: 0 ≤ x ≤ canvasWidth − w, y ≥ 0 (naar beneden groeit het canvas mee, tot maxCanvas). */
export function klemInCanvas(r: Rect, l: Pick<CanvasLayout, 'canvasWidth'>): Rect {
  const w = Math.min(r.w, l.canvasWidth);
  return { x: rond(klem(r.x, 0, l.canvasWidth - w)), y: rond(klem(r.y, 0, L.maxCanvas - r.h)), w: rond(w), h: rond(r.h) };
}
export const naarRaster = (v: number, stap: number) => Math.round(v / stap) * stap;

/** Botsingen met andere (niet-genestelde) items. */
export function botsingen(l: CanvasLayout, id: string, r: Rect): DesktopEntry[] {
  return zichtbareItems(l).filter((e) => e.instanceId !== id && overlapt(r, rechthoek(e)));
}

/** Dichtstbijzijnde vrije plek rond `r` (spiraal in rasterstappen, binnen het canvas). null als er binnen `bereik` niets vrij is. */
export function vrijePlek(l: CanvasLayout, id: string, r: Rect, stap = RASTER_STANDAARD, bereik = 1600): Rect | null {
  const basis = klemInCanvas(r, l);
  if (!botsingen(l, id, basis).length) return basis;
  let beste: Rect | null = null, besteD = Infinity;
  for (let ring = 1; ring * stap <= bereik; ring++) {
    if (ring * stap > Math.sqrt(besteD)) break;
    for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const k = klemInCanvas({ ...basis, x: basis.x + dx * stap, y: basis.y + dy * stap }, l);
      const d = (k.x - basis.x) ** 2 + (k.y - basis.y) ** 2;
      if (d < besteD && !botsingen(l, id, k).length) { beste = k; besteD = d; }
    }
  }
  return beste;
}

/** Hoogte die het canvas minimaal nodig heeft (onderkant van het laagste item + marge), zodat op de telefoon niets verborgen raakt. */
export function benodigdeHoogte(l: CanvasLayout, marge = 24): number {
  return Math.min(L.maxCanvas, Math.max(l.canvasHeight, ...zichtbareItems(l).map((e) => e.y + e.h + marge)));
}

export function vervang(l: CanvasLayout, id: string, wijzig: Partial<DesktopEntry>): CanvasLayout {
  return { ...l, items: l.items.map((e) => (e.instanceId === id ? { ...e, ...wijzig } : e)) };
}
export const zoek = (l: CanvasLayout, id: string) => l.items.find((e) => e.instanceId === id);
const maxZ = (l: CanvasLayout) => l.items.reduce((m, e) => Math.max(m, e.z), 0);

// ── Gebaren ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type Gebaar = {
  soort: 'verplaats' | 'formaat';
  id: string;
  rand?: Rand;
  start: Rect;          // rechthoek bij pointerdown (logisch)
  px0: number; py0: number; // pointer bij pointerdown (logisch)
  /** Rechthoek die de echte tegel nu volgt (onder de cursor; geklemd, nog niet opgelost). */
  live: Rect;
  /** Waar hij bij loslaten terechtkomt (raster + overlapbeleid toegepast). null = ongeldig → terug naar start. */
  doel: Rect | null;
};

export function startGebaar(l: CanvasLayout, id: string, px: number, py: number, rand?: Rand): Gebaar | null {
  const e = zoek(l, id);
  if (!e || e.locked) return null;
  const r = rechthoek(e);
  return { soort: rand ? 'formaat' : 'verplaats', id, rand, start: r, px0: px, py0: py, live: r, doel: r };
}

/** Nieuwe toestand van het gebaar voor pointer (px,py) in logische px. Puur. */
export function beweeg(g: Gebaar, l: CanvasLayout, px: number, py: number, beleid: Beleid, limieten?: LimietenFn): Gebaar {
  const e = zoek(l, g.id);
  if (!e) return { ...g, doel: null };
  const dx = px - g.px0, dy = py - g.py0, s = g.start;
  let live: Rect;
  if (g.soort === 'verplaats') {
    live = klemInCanvas({ ...s, x: s.x + dx, y: s.y + dy }, l);
  } else {
    const gr = grenzenVan(limieten, e.itemId, l.canvasWidth), r = g.rand!;
    let x = s.x, y = s.y, w = s.w, h = s.h;
    if (r.includes('e')) w = klem(s.w + dx, gr.minW, Math.min(gr.maxW, l.canvasWidth - s.x));
    if (r.includes('s')) h = klem(s.h + dy, gr.minH, gr.maxH);
    if (r.includes('w')) { const rechts = s.x + s.w; w = klem(s.w - dx, gr.minW, Math.min(gr.maxW, rechts)); x = rechts - w; }
    if (r.includes('n')) { const onder = s.y + s.h; h = klem(s.h - dy, gr.minH, Math.min(gr.maxH, onder)); y = onder - h; }
    live = { x: rond(x), y: rond(y), w: rond(w), h: rond(h) };
  }
  return { ...g, live, doel: losOp(g, live, l, beleid, limieten) };
}

/** Raster + overlapbeleid op de live-rechthoek. */
function losOp(g: Gebaar, live: Rect, l: CanvasLayout, b: Beleid, limieten?: LimietenFn): Rect | null {
  let r = { ...live };
  if (b.snap) {
    if (g.soort === 'verplaats') r = klemInCanvas({ ...r, x: naarRaster(r.x, b.raster), y: naarRaster(r.y, b.raster) }, l);
    else {
      const e = zoek(l, g.id)!, gr = grenzenVan(limieten, e.itemId, l.canvasWidth), rd = g.rand!;
      const rechts = r.x + r.w, onder = r.y + r.h;
      if (rd.includes('e')) r.w = klem(naarRaster(rechts, b.raster) - r.x, gr.minW, gr.maxW);
      if (rd.includes('s')) r.h = klem(naarRaster(onder, b.raster) - r.y, gr.minH, gr.maxH);
      if (rd.includes('w')) { r.x = klem(naarRaster(r.x, b.raster), 0, rechts - gr.minW); r.w = klem(rechts - r.x, gr.minW, gr.maxW); r.x = rechts - r.w; }
      if (rd.includes('n')) { r.y = klem(naarRaster(r.y, b.raster), 0, onder - gr.minH); r.h = klem(onder - r.y, gr.minH, gr.maxH); r.y = onder - r.h; }
    }
  }
  if (b.overlap || !botsingen(l, g.id, r).length) return r;
  // Formaat dat tegen een buur aanloopt: niet stiekem verschuiven — ongeldig (de tegel veert terug).
  if (g.soort === 'formaat') return null;
  return vrijePlek(l, g.id, r, b.snap ? b.raster : RASTER_STANDAARD, 480);
}

export type Eind = { layout: CanvasLayout; gewijzigd: boolean };
/** Pointerup: ÉÉN atomaire nieuwe indeling, uit het synchrone gebaar. Ongeldig of onveranderd → de oude indeling, gewijzigd=false. */
export function eindGebaar(g: Gebaar, l: CanvasLayout, beleid: Beleid): Eind {
  const d = g.doel, s = g.start;
  if (!d || (d.x === s.x && d.y === s.y && d.w === s.w && d.h === s.h)) return { layout: l, gewijzigd: false };
  let nieuw = vervang(l, g.id, d);
  // Bij toegestane overlap komt de gesleepte tegel bovenop (anders zou hij onder de buur verdwijnen).
  if (beleid.overlap && botsingen(nieuw, g.id, d).length) nieuw = naarVoorgrond(nieuw, g.id);
  return { layout: { ...nieuw, canvasHeight: benodigdeHoogte(nieuw) }, gewijzigd: true };
}

// ── z-volgorde, vergrendelen, verwijderen, toevoegen ─────────────────────────────────────────────────────────────────────

export function naarVoorgrond(l: CanvasLayout, id: string): CanvasLayout {
  const e = zoek(l, id); if (!e) return l;
  const top = maxZ(l); if (e.z === top && l.items.filter((x) => x.z === top).length === 1) return l;
  return normaliseerZ(vervang(l, id, { z: top + 1 }));
}
export function naarAchtergrond(l: CanvasLayout, id: string): CanvasLayout {
  const e = zoek(l, id); if (!e) return l;
  return normaliseerZ(vervang(l, id, { z: Math.min(...l.items.map((x) => x.z)) - 1 }));
}
/** Eén stap naar voren: wisselt met het eerstvolgende item erboven dat hem overlapt (of erboven in het algemeen). */
export function stapNaarVoren(l: CanvasLayout, id: string): CanvasLayout {
  const z = normaliseerZ(l), e = zoek(z, id); if (!e) return l;
  const boven = z.items.filter((x) => x.z > e.z).sort((a, b) => a.z - b.z);
  const buur = boven.find((x) => overlapt(rechthoek(x), rechthoek(e))) || boven[0];
  if (!buur) return l;
  return { ...z, items: z.items.map((x) => (x.instanceId === id ? { ...x, z: buur.z } : x.instanceId === buur.instanceId ? { ...x, z: e.z } : x)) };
}
/** z = 1..n zonder gaten, volgorde behouden (stabiel op instanceId bij gelijke z). */
export function normaliseerZ(l: CanvasLayout): CanvasLayout {
  const volg = [...l.items].sort((a, b) => a.z - b.z || (a.instanceId < b.instanceId ? -1 : 1));
  const nz = new Map(volg.map((e, i) => [e.instanceId, i + 1]));
  return { ...l, items: l.items.map((e) => ({ ...e, z: nz.get(e.instanceId)! })) };
}
export const wisselVergrendeling = (l: CanvasLayout, id: string) => vervang(l, id, { locked: !zoek(l, id)?.locked || undefined });
export function verwijder(l: CanvasLayout, id: string): CanvasLayout {
  return { ...l, items: l.items.filter((e) => e.instanceId !== id && e.parent !== id) };
}
/** «Розмістити тут…»: zet het item met de linkerbovenhoek op (x,y), met hetzelfde beleid als slepen. */
export function plaatsOp(l: CanvasLayout, id: string, x: number, y: number, beleid: Beleid): Eind {
  const g = startGebaar(l, id, 0, 0); if (!g) return { layout: l, gewijzigd: false };
  return eindGebaar(beweeg(g, l, x - g.start.x, y - g.start.y, beleid), l, beleid);
}

// ── Toetsenbord (WCAG 2.5.7) ───────────────────────────────────────────────────────────────────────────────────────────────

export type Toets = { key: string; shift?: boolean; ctrl?: boolean; alt?: boolean };
/** Pijltjes = verplaatsen, Shift+pijltjes = formaat (rechter-/onderrand), Ctrl = 1 px fijn. null = geen canvastoets. */
export function toetsStap(l: CanvasLayout, id: string, t: Toets, beleid: Beleid, limieten?: LimietenFn): Eind | null {
  const richting: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const r = richting[t.key]; if (!r) return null;
  const e = zoek(l, id); if (!e || e.locked) return { layout: l, gewijzigd: false };
  const stap = t.ctrl ? 1 : beleid.snap ? beleid.raster : RASTER_STANDAARD;
  const g = startGebaar(l, id, 0, 0, t.shift ? 'se' : undefined)!;
  // Toetsenbord: bij een botsing springen we over de buur heen in de gekozen richting (vrijePlek kan anders terug naar af kiezen).
  const b = { ...beleid, snap: t.ctrl ? false : beleid.snap };
  let res = eindGebaar(beweeg(g, l, r[0] * stap, r[1] * stap, b, limieten), l, b);
  if (!res.gewijzigd && !t.shift && !b.overlap) {
    for (let n = 2; n <= 200 && !res.gewijzigd; n++) {
      const kand = klemInCanvas({ ...g.start, x: g.start.x + r[0] * stap * n, y: g.start.y + r[1] * stap * n }, l);
      if ((kand.x === g.start.x && r[0]) || (kand.y === g.start.y && r[1])) break;
      if (!botsingen(l, id, kand).length) res = { layout: { ...vervang(l, id, kand), canvasHeight: benodigdeHoogte(vervang(l, id, kand)) }, gewijzigd: true };
    }
  }
  return res;
}

// ── Ongedaan maken / opnieuw ───────────────────────────────────────────────────────────────────────────────────────────────

export type Geschiedenis = { verleden: CanvasLayout[]; toekomst: CanvasLayout[] };
export const MAX_GESCHIEDENIS = 50;
export const legeGeschiedenis = (): Geschiedenis => ({ verleden: [], toekomst: [] });
/** Legt `oud` vast vóór een wijziging. */
export const vastleggen = (h: Geschiedenis, oud: CanvasLayout): Geschiedenis => ({ verleden: [...h.verleden, oud].slice(-MAX_GESCHIEDENIS), toekomst: [] });
export function ongedaan(h: Geschiedenis, huidig: CanvasLayout): { h: Geschiedenis; layout: CanvasLayout } | null {
  const vorige = h.verleden[h.verleden.length - 1]; if (!vorige) return null;
  return { h: { verleden: h.verleden.slice(0, -1), toekomst: [huidig, ...h.toekomst] }, layout: vorige };
}
export function opnieuw(h: Geschiedenis, huidig: CanvasLayout): { h: Geschiedenis; layout: CanvasLayout } | null {
  const volgende = h.toekomst[0]; if (!volgende) return null;
  return { h: { verleden: [...h.verleden, huidig].slice(-MAX_GESCHIEDENIS), toekomst: h.toekomst.slice(1) }, layout: volgende };
}

// ── Apparaatprofielen ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Klasse uit de ECHTE containerbreedte (ResizeObserver), niet uit window.innerWidth. */
export function apparaatVoorBreedte(containerBreedte: number): ApparaatKlasse {
  return containerBreedte < 600 ? 'telefoon' : containerBreedte < 1024 ? 'tablet' : 'computer';
}
export const STANDAARD_CANVASBREEDTE: Record<ApparaatKlasse, number> = { computer: 1280, tablet: 768, telefoon: 390 };

/**
 * Eerste keer op tablet/telefoon: proportioneel afgeleid van de computerindeling (alleen als die klasse nog GEEN eigen indeling
 * heeft — de aanroeper beslist). x/w schalen mee, grenzen gerespecteerd; overlap die door het verkleinen ontstaat wordt
 * opgelost door naar beneden te schuiven (nooit buiten beeld, nooit verborgen). Volgorde: van boven naar beneden, links naar rechts.
 */
export function aanpassenVanaf(bron: CanvasLayout, doelBreedte: number, limieten?: LimietenFn): CanvasLayout {
  const f = doelBreedte / Math.max(1, bron.canvasWidth);
  const leeg: CanvasLayout = { mode: bron.mode, canvasWidth: doelBreedte, canvasHeight: 0, items: [] };
  const volg = [...bron.items].sort((a, b) => a.y - b.y || a.x - b.x);
  let uit = leeg;
  for (const e of volg) {
    if (e.parent) { uit = { ...uit, items: [...uit.items, { ...e }] }; continue; }
    const gr = grenzenVan(limieten, e.itemId, doelBreedte);
    const w = klem(Math.round(e.w * f), gr.minW, gr.maxW);
    const h = klem(Math.round(e.h * Math.max(f, Math.min(1, gr.minH / Math.max(1, e.h)))), gr.minH, gr.maxH);
    let r = klemInCanvas({ x: Math.round(e.x * f), y: Math.round(e.y * f), w, h }, uit);
    while (botsingen(uit, e.instanceId, r).length) {
      const onder = Math.max(...botsingen(uit, e.instanceId, r).map((b) => b.y + b.h));
      r = { ...r, y: onder + 8 };
    }
    uit = { ...uit, items: [...uit.items, { ...e, ...r }] };
  }
  return { ...uit, mode: bron.mode === 'free' ? 'free' : bron.mode, canvasHeight: benodigdeHoogte({ ...uit, canvasHeight: 0 }) };
}

/** Schaal waarmee logische px op het scherm komen: containerbreedte / canvasbreedte (nooit 0). */
export const schaalVoor = (containerBreedte: number, l: CanvasLayout) => Math.max(0.05, containerBreedte / Math.max(1, l.canvasWidth));

// ── Aankondigingen (aria-live) ────────────────────────────────────────────────────────────────────────────────────────────

export type Taal = 'uk' | 'nl';
export const TEKST = {
  uk: {
    opgepakt: (t: string) => `${t}: перетягування. Стрілки — перемістити, Escape — скасувати.`,
    verplaatst: (t: string, r: Rect) => `${t} переміщено: x ${r.x}, y ${r.y}.`,
    formaat: (t: string, r: Rect) => `${t}: розмір ${r.w} × ${r.h}.`,
    geannuleerd: (t: string) => `${t}: скасовано, нічого не змінено.`,
    geblokkeerd: (t: string) => `${t}: там немає вільного місця, повернуто назад.`,
    vergrendeld: (t: string) => `${t} зафіксовано.`, ontgrendeld: (t: string) => `${t} відкріплено.`,
    voorgrond: (t: string) => `${t} на передньому плані.`, verwijderd: (t: string) => `${t} видалено. Ctrl+Z — повернути.`,
    plaatsKies: (t: string) => `Розмістити «${t}»: клацніть або торкніться місця на столі. Escape — скасувати.`,
    ongedaan: 'Скасовано останню зміну.', opnieuw: 'Повторено зміну.',
    status: { saving: 'Зберігаю…', error: 'Не вдалося зберегти. Зміни лишилися тут — спробуйте ще раз.', conflict: 'Стіл змінено в іншій вкладці чи на іншому пристрої. Оновіть, щоб побачити останню версію.' },
    opnieuwProberen: 'Спробувати ще раз', herladen: 'Оновити',
    menu: { toevoegen: 'Додати', formaat: 'Змінити розмір', voren: 'Вперед', voorgrond: 'На передній план', vast: 'Зафіксувати', los: 'Відкріпити', verwijder: 'Видалити', plaats: 'Розмістити тут…' },
    canvas: 'Робочий стіл', greep: (r: Rand) => `Змінити розмір: ${({ n: 'верх', s: 'низ', e: 'праворуч', w: 'ліворуч', ne: 'верх-праворуч', nw: 'верх-ліворуч', se: 'низ-праворуч', sw: 'низ-ліворуч' })[r]}`,
    hulp: 'Режим налаштування: стрілки — перемістити, Shift+стрілки — розмір, Ctrl — точно на 1 px, Enter або Shift+F10 — меню.',
  },
  nl: {
    opgepakt: (t: string) => `${t}: slepen. Pijltjes = verplaatsen, Escape = annuleren.`,
    verplaatst: (t: string, r: Rect) => `${t} verplaatst: x ${r.x}, y ${r.y}.`,
    formaat: (t: string, r: Rect) => `${t}: formaat ${r.w} × ${r.h}.`,
    geannuleerd: (t: string) => `${t}: geannuleerd, niets gewijzigd.`,
    geblokkeerd: (t: string) => `${t}: daar is geen vrije plek, teruggezet.`,
    vergrendeld: (t: string) => `${t} vastgezet.`, ontgrendeld: (t: string) => `${t} losgemaakt.`,
    voorgrond: (t: string) => `${t} naar voren.`, verwijderd: (t: string) => `${t} verwijderd. Ctrl+Z = terugzetten.`,
    plaatsKies: (t: string) => `«${t}» plaatsen: klik of tik op een plek op het werkblad. Escape = annuleren.`,
    ongedaan: 'Laatste wijziging ongedaan gemaakt.', opnieuw: 'Wijziging opnieuw uitgevoerd.',
    status: { saving: 'Opslaan…', error: 'Opslaan mislukt. De wijzigingen staan hier nog — probeer opnieuw.', conflict: 'Het werkblad is in een ander tabblad of op een ander apparaat gewijzigd. Vernieuw om de laatste versie te zien.' },
    opnieuwProberen: 'Opnieuw proberen', herladen: 'Vernieuwen',
    menu: { toevoegen: 'Toevoegen', formaat: 'Formaat wijzigen', voren: 'Naar voren', voorgrond: 'Op de voorgrond', vast: 'Vastzetten', los: 'Losmaken', verwijder: 'Verwijderen', plaats: 'Hier plaatsen…' },
    canvas: 'Werkblad', greep: (r: Rand) => `Formaat wijzigen: ${({ n: 'boven', s: 'onder', e: 'rechts', w: 'links', ne: 'rechtsboven', nw: 'linksboven', se: 'rechtsonder', sw: 'linksonder' })[r]}`,
    hulp: 'Instelmodus: pijltjes = verplaatsen, Shift+pijltjes = formaat, Ctrl = 1 px precies, Enter of Shift+F10 = menu.',
  },
} as const;
