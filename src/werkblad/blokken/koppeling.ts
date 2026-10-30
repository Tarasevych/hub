// Werkblad «Blokken» — koppeling met Werkblad v3 (integratie). PURE hulpen, geen React, geen netwerk.
//  • Welke canvasobjecten een blok tonen (widget «Швидкий доступ» en mappen) en hun standaardblok als er nog niets bewaard is.
//  • Samengestelde ids `<instanceId>~<knoopId>` voor slepen/«Перемістити в…» over meerdere blokken tegelijk.
//  • Stijl van een onderdeel dat als losse snelkoppeling op het canvas belandt: DesktopEntry heeft geen kleur/vorm-velden en
//    config is plat (string/number/boolean). Daarom bewaren we die stijl als JSON-tekst onder de vaste sleutel
//    `config.blokStijl` (STIJL_SLEUTEL) = { uiterlijk?, icoon? (zonder vervang), label? (zonder tekst) }. Titel en icoon gaan
//    zoals altijd via titleOverride/iconOverride. Terug in een blok wordt de stijl weer op het onderdeel gezet (heen-en-terug).
import { BLOKKEN_SCHEMA, MAAT_AUTO, STANDAARD_INDELING, type Blok, type BlokInhoud, type Icoon, type Knoop, type KnoopId, type Label, type Onderdeel, type Uiterlijk } from '../../../shared/werkblad-blokken';
import { blokUitWidget, knoopIds, naarCanvas, normaliseerBlok, vanCanvas } from '../../../shared/werkblad-blokken-boom';
import type { DesktopEntry } from '../../../shared/werkblad-v3-types';

export const SNEL_TOEGANG = 'wdg:snel-toegang';
/** Tegels van «Швидкий доступ» (src/werkblad/widgets/Start.tsx, TEGELS) als register-ids, zelfde volgorde. Houd gelijk. */
export const SNEL_TOEGANG_ITEMS: readonly string[] = ['mail', 'calendar', 'cloud', 'github', 'tasks', 'notes', 'ai', 'mcp', 'huis', 'identity', 'api', 'admin'].map((d) => `svc:${d}`);
export const STIJL_SLEUTEL = 'blokStijl';
export const SCHEIDER = '~';

/** Toont dit canvasobject een blok (vlag aan)? */
export const heeftBlok = (e: DesktopEntry) => e.itemId === SNEL_TOEGANG || e.kind === 'folder';

export const samen = (instanceId: string, knoopId: KnoopId) => `${instanceId}${SCHEIDER}${knoopId}`;
export function uiteen(s: string): { instanceId: string; knoopId: KnoopId } | null {
  const i = s.indexOf(SCHEIDER); if (i < 1) return null;
  return { instanceId: s.slice(0, i), knoopId: s.slice(i + 1) };
}

const kloon = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const kort = (instanceId: string) => instanceId.replace(/[^a-z0-9]/g, '').slice(-10) || 'x';

/** Alle knoop-ids in de laag (de server eist uniek over de hele laag). */
export function alleIds(blokken: Record<string, BlokInhoud>): Set<string> {
  return new Set(Object.values(blokken).flatMap((b) => knoopIds(b.wortel)));
}
export function vrijeId(bezet: Set<string>, voorvoegsel: string): KnoopId {
  const v = voorvoegsel.replace(/[^a-z0-9-]/g, '').slice(0, 30) || 'k';
  for (let i = 1; ; i++) { const id = `${v}-${i}`; if (!bezet.has(id)) { bezet.add(id); return id; } }
}
/** Een knoop (en kinderen) met nieuwe ids die nog niet bezet zijn. */
export function herId(k: Knoop, bezet: Set<string>, voorvoegsel: string): Knoop {
  const n = kloon(k); const loop = (x: Knoop) => { x.id = vrijeId(bezet, voorvoegsel); if (x.soort === 'blok') x.kinderen.forEach(loop); };
  loop(n); return n;
}

/** Standaardblok «Швидкий доступ»: dezelfde tegels en volgorde als de widget nu, ids met het instanceId (uniek per laag). */
export function standaardSnelToegang(instanceId: string, itemIds: string[]): BlokInhoud {
  const b = blokUitWidget('snel-toegang', itemIds); const p = kort(instanceId);
  b.wortel.id = `w-${p}`;
  b.wortel.kinderen.forEach((k, i) => { k.id = `${p}-${i + 1}`; });
  return b;
}
/** Standaardblok van een map: de snelkoppelingen in de map als raster met automatische maten (zoals het mappaneel). */
export function standaardMap(map: DesktopEntry, kinderen: DesktopEntry[]): BlokInhoud {
  const w: Blok = { soort: 'blok', id: map.instanceId, afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: 0, indeling: { ...STANDAARD_INDELING }, kinderen: [] };
  if (map.titleOverride) w.titel = map.titleOverride;
  w.kinderen = kinderen.filter((k) => k.parent === map.instanceId && k.kind === 'shortcut').sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)
    .map((k, i) => { const o = onderdeelVanCanvas(k, k.instanceId, i); delete o.positie; o.afmeting = { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }; return o; });
  return { schema: BLOKKEN_SCHEMA, wortel: w, bron: 'widget-standaard' };
}

type Stijl = { uiterlijk?: Uiterlijk; icoon?: Omit<Icoon, 'vervang'>; label?: Omit<Label, 'tekst'> };
export function stijlUitConfig(config: Record<string, unknown> | undefined): Stijl | null {
  const s = config?.[STIJL_SLEUTEL]; if (typeof s !== 'string') return null;
  try {
    const v = JSON.parse(s) as Stijl;
    // door dezelfde strenge vorm-controle als een blok (kleuren alleen token/#hex, maten begrensd)
    const proef = normaliseerBlok({ schema: BLOKKEN_SCHEMA, wortel: { soort: 'blok', id: 'p', afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: 0, indeling: STANDAARD_INDELING,
      kinderen: [{ soort: 'onderdeel', id: 'o', itemId: 'svc:hub', afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: 0, ...v }] } }, { toegestaan: () => true, streng: false }).waarde;
    const o = proef?.wortel.kinderen[0] as Onderdeel | undefined; if (!o) return null;
    const uit: Stijl = {};
    if (o.uiterlijk && Object.keys(o.uiterlijk).length) uit.uiterlijk = o.uiterlijk;
    if (o.icoon) { const { vervang: _v, ...r } = o.icoon; void _v; uit.icoon = r; }
    if (o.label) { const { tekst: _t, ...r } = o.label; void _t; uit.label = r; }
    return Object.keys(uit).length ? uit : null;
  } catch { return null; }
}
/** Onderdeel → losse snelkoppeling, stijl mee in config.blokStijl. */
export function onderdeelNaarCanvas(o: Onderdeel, plek: { x: number; y: number; z: number }, instanceId: string): DesktopEntry {
  const e = naarCanvas(o, plek, instanceId);
  const s: Stijl = {};
  if (o.uiterlijk && Object.keys(o.uiterlijk).length) s.uiterlijk = o.uiterlijk;
  if (o.icoon) { const { vervang: _v, ...r } = o.icoon; void _v; if (Object.keys(r).length && !(r.grootte?.soort === 'auto' && Object.keys(r).length === 1)) s.icoon = r; }
  if (o.label) { const { tekst: _t, ...r } = o.label; void _t; if (r.tonen !== 'auto' || r.plaats !== 'onder' || r.grootte) s.label = r; }
  const c: Record<string, unknown> = { ...(e.config || {}) }; delete c[STIJL_SLEUTEL];
  if (Object.keys(s).length) c[STIJL_SLEUTEL] = JSON.stringify(s);
  if (Object.keys(c).length) e.config = c as DesktopEntry['config']; else delete e.config;
  return e;
}
/** Losse snelkoppeling → onderdeel; stijl uit config.blokStijl komt terug op het onderdeel. */
export function onderdeelVanCanvas(e: DesktopEntry, knoopId: KnoopId, volgorde = 0): Onderdeel {
  const s = stijlUitConfig(e.config);
  const c = e.config ? { ...e.config } : undefined; if (c) delete c[STIJL_SLEUTEL];
  const o = vanCanvas({ ...e, ...(c && Object.keys(c).length ? { config: c } : { config: undefined }) }, knoopId, volgorde);
  if (!o.config || !Object.keys(o.config).length) delete o.config;
  if (s?.uiterlijk) o.uiterlijk = s.uiterlijk;
  if (s?.icoon) o.icoon = { ...s.icoon, grootte: s.icoon.grootte ?? MAAT_AUTO, ...(o.icoon?.vervang ? { vervang: o.icoon.vervang } : {}) };
  if (s?.label) o.label = { ...s.label, ...(o.label?.tekst ? { tekst: o.label.tekst } : {}) };
  return o;
}

/** Knoop weghalen (nieuwe boom + de weggehaalde knoop). */
export function haalWeg(wortel: Blok, id: KnoopId): { wortel: Blok; knoop: Knoop } | null {
  const w = kloon(wortel); let weg: Knoop | null = null;
  const loop = (b: Blok): boolean => {
    const i = b.kinderen.findIndex((k) => k.id === id);
    if (i >= 0) { weg = b.kinderen.splice(i, 1)[0]; b.kinderen.forEach((k, j) => { k.volgorde = j; }); return true; }
    return b.kinderen.some((k) => k.soort === 'blok' && loop(k));
  };
  return loop(w) && weg ? { wortel: w, knoop: weg } : null;
}
/** Knoop invoegen in blok `naar` vóór `voor` (null = achteraan); positie alleen voor modus 'vrij'. */
export function voegIn(wortel: Blok, naar: KnoopId, knoop: Knoop, voor: KnoopId | null, positie?: { x: number; y: number }): Blok | null {
  const w = kloon(wortel);
  const zoek = (b: Blok): Blok | null => (b.id === naar ? b : b.kinderen.reduce<Blok | null>((r, k) => r || (k.soort === 'blok' ? zoek(k) : null), null));
  const doel = zoek(w); if (!doel) return null;
  const k = kloon(knoop);
  if (doel.indeling.modus === 'vrij' && positie) k.positie = { x: Math.max(0, Math.round(positie.x)), y: Math.max(0, Math.round(positie.y)), z: doel.kinderen.length + 1 };
  const i = voor ? doel.kinderen.findIndex((c) => c.id === voor) : -1;
  doel.kinderen.splice(i < 0 ? doel.kinderen.length : i, 0, k);
  doel.kinderen.forEach((c, j) => { c.volgorde = j; });
  return w;
}
/** Kopie van alle wortels met samengestelde ids, zodat beoordeelNeerzetting over meerdere blokken tegelijk kan zoeken. */
export function samengesteldeWortels(blokken: Record<string, BlokInhoud>): Blok[] {
  return Object.entries(blokken).map(([inst, b]) => {
    const w = kloon(b.wortel); const loop = (k: Knoop) => { k.id = samen(inst, k.id); if (k.soort === 'blok') k.kinderen.forEach(loop); };
    loop(w); return w;
  });
}
