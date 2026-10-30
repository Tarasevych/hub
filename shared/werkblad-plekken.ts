// Werkblad «Blokken» — plekken en neerzetregels (stroom D). PUUR: geen DOM, geen netwerk; browser én server.
// Ontwerp: docs/ontwerp/WERKBLAD-BLOKKEN.md §2 «Plekken» en «Slepen en neerzetten». Contracttypes: shared/werkblad-blokken.ts.
// Eerste uitgave (besluit Павло): canvas ↔ blok ↔ blok en het zijmenu. 'pagina' (vak op een pagina), 'zijbalk' en 'werkbalk'
// zijn UITBREIDINGSPUNTEN: ze bestaan als plek-soort en worden beoordeeld, maar zijn alleen open als `uitbreidingen` het zegt.
import { BLOKKEN_LIMIETEN, type Blok, type Knoop, type KnoopId, type Neerzetting, type NeerzetOordeel, type Onderdeel, type Plek, type PlekSoort, type Sleepbron } from './werkblad-blokken';
import type { DesktopEntry, WerkbladRuimte } from './werkblad-v3-types';

export type Maatklasse = 'klein' | 'middel' | 'groot';
export type Reden = Extract<NeerzetOordeel, { ok: false }>['reden'];

/** Standaardregels per plek-soort: wat ze aanvaardt en welke maten (menu = alleen klein). */
export const PLEK_REGELS: Record<PlekSoort, Omit<Plek, 'soort' | 'id'> & { open: boolean }> = {
  canvas: { aanvaardt: ['onderdeel', 'blok', 'widget'], maten: ['klein', 'middel', 'groot'], open: true },
  blok: { aanvaardt: ['onderdeel', 'blok'], maxDiepte: BLOKKEN_LIMIETEN.maxDiepte, maxAantal: BLOKKEN_LIMIETEN.maxOnderdelenPerBlok, maten: ['klein', 'middel', 'groot'], open: true },
  menu: { aanvaardt: ['onderdeel'], maxDiepte: 1, maten: ['klein'], open: true },
  zijbalk: { aanvaardt: ['onderdeel'], maxDiepte: 1, maten: ['klein'], open: false },
  werkbalk: { aanvaardt: ['onderdeel'], maxDiepte: 1, maten: ['klein'], open: false },
  pagina: { aanvaardt: ['onderdeel', 'blok'], maxDiepte: 2, maten: ['klein', 'middel'], open: false },
};

export function maakPlek(soort: PlekSoort, sleutel: string): Plek {
  const { open: _o, ...r } = PLEK_REGELS[soort];
  return { soort, id: `${soort}:${sleutel}`, ...r, aanvaardt: [...r.aanvaardt], maten: r.maten ? [...r.maten] : undefined };
}

/** Oekraïens (+ Nederlands) voor elke weigering, zoals de sleepregelaar en «Перемістити в…» ze tonen. */
export const REDEN_TEKST: Record<Reden | 'gesloten', { uk: string; nl: string }> = {
  kring: { uk: 'Тут не можна: блок не можна покласти сам у себе', nl: 'Kan niet: een blok kan niet in zichzelf' },
  'te-diep': { uk: `Тут не можна: більше ${BLOKKEN_LIMIETEN.maxDiepte} рівнів вкладення`, nl: `Kan niet: meer dan ${BLOKKEN_LIMIETEN.maxDiepte} niveaus diep` },
  vol: { uk: `Тут не можна: у блоці вже ${BLOKKEN_LIMIETEN.maxOnderdelenPerBlok} значків`, nl: `Kan niet: blok heeft al ${BLOKKEN_LIMIETEN.maxOnderdelenPerBlok} onderdelen` },
  'soort-niet-toegestaan': { uk: 'Тут не можна: це місце не приймає такий елемент', nl: 'Kan niet: deze plek aanvaardt dit soort niet' },
  'niet-toegestaan-in-ruimte': { uk: 'Тут не можна: технічний елемент не можна класти у звичайний простір', nl: 'Kan niet: technisch onderdeel hoort niet in de privéruimte' },
  vergrendeld: { uk: 'Тут не можна: елемент або блок закріплено', nl: 'Kan niet: vergrendeld' },
  'maat-past-niet': { uk: 'Тут не можна: тут дозволені лише малі значки', nl: 'Kan niet: hier mogen alleen kleine maten' },
  gesloten: { uk: 'Ще недоступно: це місце з’явиться в наступному оновленні', nl: 'Nog niet beschikbaar: deze plek komt in een volgende uitgave' },
};

export interface PlekContext {
  wortels: Blok[];
  plekken: Plek[];
  /** Ruimte waarin de gebruiker nu werkt (standaard 'prive'). */
  ruimte?: WerkbladRuimte;
  /** Ruimtes waarin een register-item mag staan (register: `ruimtes`); onbekend = overal. */
  ruimtesVan?: (itemId: string) => readonly WerkbladRuimte[] | undefined;
  canvas?: DesktopEntry[];
  /** Menusleutel → register-itemId (voor bron 'menu'). */
  menuItem?: (sleutel: string) => string | undefined;
  /** Gesloten plek-soorten toch openen (uitbreidingspunt, standaard alleen canvas/blok/menu). */
  uitbreidingen?: PlekSoort[];
}

// ------------------------------------------------------------------ boomhulpen (lokaal, puur)
export function zoek(wortels: Blok[], id: KnoopId): { knoop: Knoop; ouder: Blok | null; pad: Blok[] } | null {
  const stap = (b: Blok, pad: Blok[]): ReturnType<typeof zoek> => {
    if (b.id === id) return { knoop: b, ouder: pad[pad.length - 1] || null, pad };
    for (const k of b.kinderen) {
      if (k.id === id) return { knoop: k, ouder: b, pad: [...pad, b] };
      if (k.soort === 'blok') { const r = stap(k, [...pad, b]); if (r) return r; }
    }
    return null;
  };
  for (const w of wortels) { const r = stap(w, []); if (r) return r; }
  return null;
}
/** Hoogte van een knoop in niveaus blokken (onderdeel = 0, blok zonder subblokken = 1). */
export function hoogte(k: Knoop): number { return k.soort === 'onderdeel' ? 0 : 1 + Math.max(0, ...k.kinderen.map(hoogte)); }
export function bevat(b: Blok, id: KnoopId): boolean { return b.id === id || b.kinderen.some((k) => k.id === id || (k.soort === 'blok' && bevat(k, id))); }
export function itemIdsIn(k: Knoop): string[] { return k.soort === 'onderdeel' ? [k.itemId] : k.kinderen.flatMap(itemIdsIn); }
export function aantalOnderdelen(b: Blok): number { return b.kinderen.length; }

/** Maatklasse van een onderdeel: ≤32px icoon of compact = klein, ≤64 middel, anders groot. 'auto' = middel. */
export function maatklasse(o: Onderdeel | DesktopEntry): Maatklasse {
  if ('soort' in o) { const g = o.icoon?.grootte; if (!g || g.soort !== 'px') return 'middel'; return g.waarde <= 32 ? 'klein' : g.waarde <= 64 ? 'middel' : 'groot'; }
  return Math.max(o.w, o.h) <= 64 ? 'klein' : Math.max(o.w, o.h) <= 208 ? 'middel' : 'groot';
}

type BronInfo = { soort: 'onderdeel' | 'blok' | 'widget'; knoop?: Knoop; entry?: DesktopEntry; itemIds: string[]; vergrendeld: boolean; ouder?: Blok | null };
function bronInfo(bron: Sleepbron, ctx: PlekContext): BronInfo | null {
  if (bron.van === 'blok') {
    const r = zoek(ctx.wortels, bron.knoopId); if (!r) return null;
    return { soort: r.knoop.soort, knoop: r.knoop, itemIds: itemIdsIn(r.knoop), vergrendeld: !!r.knoop.vergrendeld, ouder: r.ouder };
  }
  if (bron.van === 'canvas') {
    const e = ctx.canvas?.find((x) => x.instanceId === bron.instanceId); if (!e) return null;
    const blok = (e as DesktopEntry & { blok?: { wortel: Blok } }).blok?.wortel;
    return { soort: e.kind === 'shortcut' ? 'onderdeel' : blok || e.kind === 'folder' ? 'blok' : 'widget', entry: e, knoop: blok, itemIds: blok ? [e.itemId, ...itemIdsIn(blok)] : [e.itemId], vergrendeld: !!e.locked };
  }
  if (bron.van === 'menu') { const id = ctx.menuItem?.(bron.sleutel) ?? bron.sleutel; return { soort: 'onderdeel', itemIds: [id], vergrendeld: false }; }
  return { soort: bron.itemId.startsWith('wdg:') ? 'widget' : 'onderdeel', itemIds: [bron.itemId], vergrendeld: false };
}
const bronPlekSoort = (b: Sleepbron): PlekSoort | 'bibliotheek' => (b.van === 'bibliotheek' ? 'bibliotheek' : b.van);

/**
 * Mag dit hier neer? Volgorde van controle (eerste weigering wint): onbekend/gesloten → soort → ruimte → vergrendeling →
 * kring → diepte → aantal → maat. Gesloten uitbreidingsplekken geven 'soort-niet-toegestaan' (tekst: REDEN_TEKST.gesloten
 * via `isGesloten`). De server herhaalt dezelfde beoordeling.
 */
export function beoordeelNeerzetting(bron: Sleepbron, n: Neerzetting, ctx: PlekContext): NeerzetOordeel {
  const nee = (reden: Reden): NeerzetOordeel => ({ ok: false, reden });
  const plek = n.doel;
  if (isGesloten(plek, ctx)) return nee('soort-niet-toegestaan');
  const b = bronInfo(bron, ctx);
  if (!b) return nee('soort-niet-toegestaan');
  if (!plek.aanvaardt.includes(b.soort)) return nee('soort-niet-toegestaan');
  // ruimte: technische items nooit in de privéruimte
  const ruimte = ctx.ruimte ?? 'prive';
  if (ctx.ruimtesVan && b.itemIds.some((id) => { const r = ctx.ruimtesVan!(id); return r && !r.includes(ruimte); })) return nee('niet-toegestaan-in-ruimte');
  if (b.vergrendeld && !n.kopie) return nee('vergrendeld');
  let doelBlok: Blok | null = null, doelDiepte = 0;
  if (plek.soort === 'blok') {
    const r = zoek(ctx.wortels, plek.id.slice(5));
    if (!r || r.knoop.soort !== 'blok') return nee('soort-niet-toegestaan');
    doelBlok = r.knoop; doelDiepte = r.pad.length + 1;
    if (doelBlok.vergrendeld || r.pad.some((p) => p.vergrendeld)) return nee('vergrendeld');
    if (b.knoop?.soort === 'blok' && bron.van === 'blok' && bevat(b.knoop, doelBlok.id)) return nee('kring');
    const max = Math.min(plek.maxDiepte ?? BLOKKEN_LIMIETEN.maxDiepte, BLOKKEN_LIMIETEN.maxDiepte);
    if (b.knoop && doelDiepte + hoogte(b.knoop) > max) return nee('te-diep');
    const zelfdeOuder = bron.van === 'blok' && b.ouder?.id === doelBlok.id && !n.kopie;
    if (!zelfdeOuder && aantalOnderdelen(doelBlok) >= Math.min(plek.maxAantal ?? BLOKKEN_LIMIETEN.maxOnderdelenPerBlok, BLOKKEN_LIMIETEN.maxOnderdelenPerBlok)) return nee('vol');
  } else if (b.knoop && hoogte(b.knoop) > Math.min(plek.maxDiepte ?? BLOKKEN_LIMIETEN.maxDiepte, BLOKKEN_LIMIETEN.maxDiepte)) {
    return nee('te-diep');
  }
  if (plek.maten && !plek.maten.includes('middel') && !plek.maten.includes('groot')) {
    // smalle plek: alleen een los onderdeel; het wordt daar altijd klein getekend (geen eigen grote maat mee)
    if (b.soort !== 'onderdeel') return nee('maat-past-niet');
  }
  const van = bronPlekSoort(bron);
  if (plek.soort === 'menu' && van !== 'menu') return { ok: true, omzetting: 'onderdeel→menu' };
  if (plek.soort === 'canvas' && van === 'blok' && b.soort === 'onderdeel') return { ok: true, omzetting: 'onderdeel→snelkoppeling' };
  if (plek.soort === 'blok' && (van === 'canvas' || van === 'menu' || van === 'bibliotheek') && b.soort === 'onderdeel') return { ok: true, omzetting: 'snelkoppeling→onderdeel' };
  return { ok: true };
}
export function isGesloten(p: Plek, ctx: Pick<PlekContext, 'uitbreidingen'>): boolean {
  return !PLEK_REGELS[p.soort].open && !(ctx.uitbreidingen || []).includes(p.soort);
}
export function redenTekst(o: NeerzetOordeel, plek: Plek, ctx: Pick<PlekContext, 'uitbreidingen'>, taal: 'uk' | 'nl' = 'uk'): string {
  if (o.ok) return '';
  return (isGesloten(plek, ctx) ? REDEN_TEKST.gesloten : REDEN_TEKST[o.reden])[taal];
}

// ------------------------------------------------------------------ ongedaan/opnieuw (per laag, max 50, over plekken heen)
export interface Geschiedenis<T> { terug: T[]; vooruit: T[]; max: number }
export const nieuweGeschiedenis = <T>(max: number = BLOKKEN_LIMIETEN.maxGeschiedenis): Geschiedenis<T> => ({ terug: [], vooruit: [], max });
/** Leg de toestand VÓÓR een handeling vast. Nieuwe handeling wist «opnieuw». */
export function legVast<T>(g: Geschiedenis<T>, voor: T): Geschiedenis<T> {
  const terug = [...g.terug, voor]; while (terug.length > g.max) terug.shift();
  return { ...g, terug, vooruit: [] };
}
export function ongedaan<T>(g: Geschiedenis<T>, nu: T): { g: Geschiedenis<T>; toestand: T } | null {
  if (!g.terug.length) return null;
  const terug = g.terug.slice(0, -1);
  return { g: { ...g, terug, vooruit: [...g.vooruit, nu] }, toestand: g.terug[g.terug.length - 1] };
}
export function opnieuw<T>(g: Geschiedenis<T>, nu: T): { g: Geschiedenis<T>; toestand: T } | null {
  if (!g.vooruit.length) return null;
  return { g: { ...g, terug: [...g.terug, nu], vooruit: g.vooruit.slice(0, -1) }, toestand: g.vooruit[g.vooruit.length - 1] };
}
/** Eén geschiedenis per laag (apparaatklasse/ruimte), sleutel bv. 'prive:computer'. */
export class LaagGeschiedenis<T> {
  private lagen = new Map<string, Geschiedenis<T>>();
  constructor(private max: number = BLOKKEN_LIMIETEN.maxGeschiedenis) {}
  private g(l: string) { return this.lagen.get(l) || nieuweGeschiedenis<T>(this.max); }
  legVast(laag: string, voor: T) { this.lagen.set(laag, legVast(this.g(laag), voor)); }
  ongedaan(laag: string, nu: T): T | null { const r = ongedaan(this.g(laag), nu); if (!r) return null; this.lagen.set(laag, r.g); return r.toestand; }
  opnieuw(laag: string, nu: T): T | null { const r = opnieuw(this.g(laag), nu); if (!r) return null; this.lagen.set(laag, r.g); return r.toestand; }
  kan(laag: string) { const g = this.g(laag); return { terug: g.terug.length, vooruit: g.vooruit.length }; }
}
