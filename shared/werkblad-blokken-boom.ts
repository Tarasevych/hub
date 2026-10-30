// Werkblad «Blokken» — boomhulpen (stroom A). PUUR: geen DOM, geen netwerk. Browser én server gebruiken dezelfde code.
//   • normaliseerBlok / valideerBlok: vorm, veilige standaarden, limieten (diepte ≤ 4, ≤ 60 kinderen per blok, ≤ 400 knopen),
//     unieke ids, kringcontrole, alleen toegestane itemIds, kleuren alleen als thematoken of #rrggbb;
//   • blokUitWidget / blokUitMap / mapUitBlok: lui omzetten en verliesvrij terug;
//   • boombewerkingen (zoekKnoop, verplaats, wijzig, herstelEigenschap, pasVoorinstellingToe, groepeer, ontgroepeer,
//     naarCanvas, vanCanvas): geven altijd een NIEUWE boom terug; ongeldige bewerking → BlokFout (code), boom blijft heel.
// Contract: shared/werkblad-blokken.ts. Ontwerp: docs/ontwerp/WERKBLAD-BLOKKEN.md.
import {
  BLOKKEN_LIMIETEN as L, BLOKKEN_SCHEMA, KNOOP_ID_RE, MAAT_AUTO, STANDAARD_INDELING, VOORINSTELLINGEN,
  type Afmeting, type Blok, type BlokIndeling, type BlokInhoud, type BlokModus, type EntryMetBlok, type Icoon, type Knoop,
  type KnoopId, type Kleur, type Label, type Maat, type Onderdeel, type Uiterlijk, type Uitlijning, type ValideerUitkomst, type VoorinstellingId,
} from './werkblad-blokken';
import type { DesktopEntry } from './werkblad-v3-types';

const APP = ['computer', 'tablet', 'telefoon'] as const;
const ITEM_RE = /^(svc|pg|cmd|wdg|usr):[a-z0-9][a-z0-9._/-]{0,79}$/; // geen map: binnen een blok (een blok IS de map)
const ICOON_RE = /^[a-z0-9][a-z0-9:_-]{0,59}$/;
const KLEUR_RE = /^(thema|token:[a-z0-9-]{1,40}|#[0-9a-f]{6})$/;
const CONFIG_SLEUTEL = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;

export class BlokFout extends Error { constructor(public code: string) { super(code); } }

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const getal = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const klem = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const geheel = (v: unknown, a: number, b: number): number | undefined => { const n = getal(v); return n === null ? undefined : klem(Math.round(n), a, b); };
const uit = <T extends string>(v: unknown, lijst: readonly T[], terug?: T): T | undefined => ((lijst as readonly unknown[]).includes(v) ? v as T : terug);
const tekst = (v: unknown, max = 60): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || undefined;
};
const schoon = <T extends Record<string, unknown>>(o: T): T => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };

// ---------------------------------------------------------------- bladwaarden
export function maatOf(v: unknown, soorten: ReadonlyArray<Maat['soort']> = ['auto', 'px', 'procent', 'deel'], px: [number, number] = [L.minPx, L.maxPx]): Maat {
  const o = obj(v); if (!o || !soorten.includes(o.soort as Maat['soort'])) return MAAT_AUTO;
  const n = getal(o.waarde);
  if (o.soort === 'auto' || n === null) return MAAT_AUTO;
  if (o.soort === 'px') return { soort: 'px', waarde: klem(Math.round(n), px[0], px[1]) };
  if (o.soort === 'procent') return { soort: 'procent', waarde: klem(Math.round(n * 10) / 10, 1, 100) };
  return { soort: 'deel', waarde: klem(Math.round(n), 1, 12) };
}
export const kleurOf = (v: unknown): Kleur | undefined => (typeof v === 'string' && KLEUR_RE.test(v.toLowerCase()) ? v.toLowerCase() as Kleur : undefined);

function afmetingOf(v: unknown): Afmeting {
  const o = obj(v) ?? {};
  const a: Afmeting = { breedte: maatOf(o.breedte), hoogte: maatOf(o.hoogte) };
  for (const k of ['minBreedte', 'maxBreedte', 'minHoogte', 'maxHoogte'] as const) { const n = geheel(o[k], L.minPx, L.maxPx); if (n !== undefined) a[k] = n; }
  if (a.minBreedte !== undefined && a.maxBreedte !== undefined && a.maxBreedte < a.minBreedte) delete a.maxBreedte;
  if (a.minHoogte !== undefined && a.maxHoogte !== undefined && a.maxHoogte < a.minHoogte) delete a.maxHoogte;
  return a;
}
function uiterlijkOf(v: unknown): Uiterlijk | undefined {
  const o = obj(v); if (!o) return undefined;
  const d = getal(o.doorzichtigheid);
  const u = schoon<Uiterlijk & Record<string, unknown>>({
    achtergrond: kleurOf(o.achtergrond), icoonKleur: kleurOf(o.icoonKleur), tekstKleur: kleurOf(o.tekstKleur), randKleur: kleurOf(o.randKleur),
    randDikte: geheel(o.randDikte, 0, 8), vorm: uit(o.vorm, ['rechthoek', 'afgerond', 'cirkel', 'pil'] as const),
    straal: geheel(o.straal, 0, L.maxStraal), doorzichtigheid: d === null ? undefined : klem(Math.round(d * 100) / 100, 0.2, 1),
    schaduw: uit(o.schaduw, ['geen', 'zacht', 'sterk'] as const),
  });
  return Object.keys(u).length ? u : undefined;
}
function icoonOf(v: unknown): Icoon | undefined {
  const o = obj(v); if (!o) return undefined;
  const vervang = typeof o.vervang === 'string' && ICOON_RE.test(o.vervang) ? o.vervang : undefined;
  return schoon<Icoon & Record<string, unknown>>({ grootte: maatOf(o.grootte, ['auto', 'px'], [L.minIcoonPx, L.maxIcoonPx]), stijl: uit(o.stijl, ['kader', 'los', 'rond'] as const), vervang });
}
function labelOf(v: unknown): Label | undefined {
  const o = obj(v); if (!o) return undefined;
  return schoon<Label & Record<string, unknown>>({
    tonen: uit(o.tonen, ['ja', 'nee', 'auto'] as const, 'auto')!, plaats: uit(o.plaats, ['onder', 'rechts', 'boven', 'links'] as const, 'onder')!,
    grootte: uit(o.grootte, ['mini', 'klein', 'normaal', 'groot'] as const), tekst: tekst(o.tekst),
  });
}
function configOf(v: unknown): Record<string, string | number | boolean> | undefined {
  const o = obj(v); if (!o) return undefined;
  const r: Record<string, string | number | boolean> = {};
  for (const [k, w] of Object.entries(o).slice(0, 16)) {
    if (!CONFIG_SLEUTEL.test(k)) continue;
    if (typeof w === 'boolean') r[k] = w; else if (getal(w) !== null) r[k] = w as number; else if (typeof w === 'string') r[k] = w.replace(/[<>]/g, '').slice(0, 200);
  }
  return Object.keys(r).length ? r : undefined;
}
const UITL: readonly Uitlijning[] = ['begin', 'midden', 'eind', 'rek', 'verdeeld'];
export function indelingOf(v: unknown): BlokIndeling {
  const o = obj(v) ?? {}, S = STANDAARD_INDELING;
  const modus = uit(o.modus, ['vrij', 'rij', 'kolom', 'raster'] as const, S.modus)!;
  const ind: BlokIndeling = {
    modus, tussenruimte: geheel(o.tussenruimte, 0, L.maxTussenruimte) ?? S.tussenruimte, binnenrand: geheel(o.binnenrand, 0, L.maxBinnenrand) ?? S.binnenrand,
    uitlijningHoofd: uit(o.uitlijningHoofd, UITL, S.uitlijningHoofd)!, uitlijningDwars: uit(o.uitlijningDwars, UITL, S.uitlijningDwars)!,
    omloop: typeof o.omloop === 'boolean' ? o.omloop : S.omloop, richting: uit(o.richting, ['normaal', 'omgekeerd'] as const, 'normaal')!,
  };
  if (modus === 'vrij' && o.overlapToestaan === true) ind.overlapToestaan = true;
  if (modus === 'raster') {
    ind.rasterKolommen = o.rasterKolommen === 'auto' || o.rasterKolommen === undefined ? 'auto' : (geheel(o.rasterKolommen, 1, 12) ?? 'auto');
    ind.rasterMinCel = geheel(o.rasterMinCel, 24, 600) ?? S.rasterMinCel;
    ind.rasterRijHoogte = maatOf(o.rasterRijHoogte, ['auto', 'px']);
  }
  return ind;
}

// ---------------------------------------------------------------- normaliseren / valideren
export type NormaliseerOpties = {
  /** Registercontrole voor onderdelen (ruimte, apparaat). */
  toegestaan: (itemId: string, config?: Record<string, unknown>) => boolean;
  /** streng (server, bij schrijven): elke overtreding = fout. mild (bij lezen): niet-toegestane onderdelen vallen stil weg. */
  streng: boolean;
};
type Teller = { knopen: number; ids: Set<string>; gezien: WeakSet<object>; fouten: string[] };

function knoopOf(v: unknown, diepte: number, t: Teller, opt: NormaliseerOpties, index: number): Knoop | null {
  const o = obj(v);
  if (!o) { t.fouten.push('vorm-ongeldig'); return null; }
  if (t.gezien.has(o)) { t.fouten.push('kring'); return null; }
  t.gezien.add(o);
  const id = typeof o.id === 'string' && KNOOP_ID_RE.test(o.id) ? o.id : null;
  if (!id) { t.fouten.push('id-ongeldig'); return null; }
  if (t.ids.has(id)) { t.fouten.push(`dubbele-id:${id}`); return null; }
  t.ids.add(id);
  if (++t.knopen > L.maxKnopenTotaal) { t.fouten.push('te-veel-knopen'); return null; }
  const basis = schoon<Record<string, unknown>>({
    id, afmeting: afmetingOf(o.afmeting), volgorde: geheel(o.volgorde, 0, 100000) ?? index,
    uiterlijk: uiterlijkOf(o.uiterlijk), vergrendeld: o.vergrendeld === true ? true : undefined,
  });
  const p = obj(o.positie);
  if (p) basis.positie = { x: geheel(p.x, 0, 12000) ?? 0, y: geheel(p.y, 0, 12000) ?? 0, z: geheel(p.z, 1, 400) ?? 1 };
  const rs = obj(o.rasterSpan);
  if (rs) basis.rasterSpan = { kolommen: geheel(rs.kolommen, 1, 12) ?? 1, rijen: geheel(rs.rijen, 1, 12) ?? 1 };
  const ap = obj(o.apparaten);
  if (ap) { const a: Record<string, string> = {}; for (const k of APP) { const w = uit(ap[k], ['tonen', 'verbergen'] as const); if (w) a[k] = w; } if (Object.keys(a).length) basis.apparaten = a; }

  if (o.soort === 'onderdeel') {
    const itemId = typeof o.itemId === 'string' && ITEM_RE.test(o.itemId) ? o.itemId : null;
    const config = configOf(o.config);
    if (!itemId || !opt.toegestaan(itemId, config)) {
      if (opt.streng || !itemId) t.fouten.push(`item-niet-toegestaan:${String(o.itemId ?? '').slice(0, 90)}`);
      t.knopen--; t.ids.delete(id);
      return null;
    }
    return schoon({ ...basis, soort: 'onderdeel', itemId, icoon: icoonOf(o.icoon), label: labelOf(o.label), config }) as unknown as Onderdeel;
  }
  if (o.soort !== 'blok') { t.fouten.push('soort-onbekend'); return null; }
  if (diepte > L.maxDiepte) { t.fouten.push('te-diep'); return null; }
  const ruw = Array.isArray(o.kinderen) ? o.kinderen : [];
  if (ruw.length > L.maxOnderdelenPerBlok) { t.fouten.push(`te-veel-kinderen:${id}`); return null; }
  const kinderen: Knoop[] = [];
  ruw.forEach((k, i) => { const n = knoopOf(k, diepte + 1, t, opt, i); if (n) kinderen.push(n); });
  kinderen.sort((a, b) => a.volgorde - b.volgorde);
  const so = obj(o.standaardOnderdeel);
  const standaardOnderdeel = so ? schoon({ icoon: icoonOf(so.icoon), label: labelOf(so.label), uiterlijk: uiterlijkOf(so.uiterlijk) }) : undefined;
  return schoon({
    ...basis, soort: 'blok', titel: tekst(o.titel), indeling: indelingOf(o.indeling), kinderen,
    standaardOnderdeel: standaardOnderdeel && Object.keys(standaardOnderdeel).length ? standaardOnderdeel : undefined,
  }) as unknown as Blok;
}

/** Normaliseert een BlokInhoud. Geeft de schone waarde plus alle fouten (leeg = alles in orde). */
export function normaliseerBlok(invoer: unknown, opt: NormaliseerOpties): { waarde: BlokInhoud | null; fouten: string[] } {
  const o = obj(invoer);
  if (!o) return { waarde: null, fouten: ['vorm-ongeldig'] };
  if (o.schema !== undefined && o.schema !== BLOKKEN_SCHEMA) return { waarde: null, fouten: ['schema-onbekend'] };
  const w = obj(o.wortel);
  if (!w || w.soort !== 'blok') return { waarde: null, fouten: ['wortel-geen-blok'] };
  const t: Teller = { knopen: 0, ids: new Set(), gezien: new WeakSet(), fouten: [] };
  const wortel = knoopOf(w, 1, t, opt, 0) as Blok | null;
  if (!wortel) return { waarde: null, fouten: t.fouten.length ? t.fouten : ['vorm-ongeldig'] };
  const bron = uit(o.bron, ['widget-standaard', 'eigen'] as const);
  return { waarde: schoon({ schema: BLOKKEN_SCHEMA, wortel, bron }) as BlokInhoud, fouten: t.fouten };
}

/** Contractfunctie: streng. ok=false zodra er één fout is. */
export function valideerBlok(invoer: unknown, toegestaan: (itemId: string, config?: Record<string, unknown>) => boolean): ValideerUitkomst {
  const r = normaliseerBlok(invoer, { toegestaan, streng: true });
  return r.waarde && !r.fouten.length ? { ok: true, waarde: r.waarde } : { ok: false, fouten: r.fouten.length ? r.fouten : ['vorm-ongeldig'] };
}

/** Alle knoop-ids van een boom (ook de wortel). */
export function knoopIds(wortel: Blok): string[] {
  const r: string[] = [];
  const loop = (k: Knoop) => { r.push(k.id); if (k.soort === 'blok') k.kinderen.forEach(loop); };
  loop(wortel); return r;
}
export function telKnopen(wortel: Blok): number { return knoopIds(wortel).length; }
export function diepteVan(k: Knoop): number { return k.soort === 'blok' ? 1 + Math.max(0, ...k.kinderen.map(diepteVan)) : 0; }

// ---------------------------------------------------------------- omzetten
const idDeel = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'x';
function leegBlok(id: string, modus: BlokModus = 'raster'): Blok {
  return { soort: 'blok', id, afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde: 0, indeling: { ...STANDAARD_INDELING, modus }, kinderen: [] };
}
function onderdeel(id: string, itemId: string, volgorde: number): Onderdeel {
  return { soort: 'onderdeel', id, itemId, afmeting: { breedte: MAAT_AUTO, hoogte: MAAT_AUTO }, volgorde };
}

export function blokUitWidget(widgetId: string, itemIds: string[]): BlokInhoud {
  const w = leegBlok(`w-${idDeel(widgetId)}`);
  const gezien = new Set<string>();
  w.kinderen = itemIds.filter((i) => ITEM_RE.test(i) && !gezien.has(i) && gezien.add(i)).slice(0, L.maxOnderdelenPerBlok)
    .map((itemId, i) => onderdeel(`o-${i + 1}`, itemId, i));
  return { schema: BLOKKEN_SCHEMA, wortel: w, bron: 'widget-standaard' };
}

/** Map → blok (modus 'vrij', zodat x/y/w/h exact bewaard blijven). Kinderen houden hun instanceId als knoop-id. */
export function blokUitMap(map: DesktopEntry, kinderen: DesktopEntry[]): BlokInhoud {
  const w = leegBlok(map.instanceId, 'vrij');
  if (map.titleOverride) w.titel = map.titleOverride;
  w.kinderen = kinderen.filter((k) => k.parent === map.instanceId && k.kind === 'shortcut').sort((a, b) => a.z - b.z).slice(0, L.maxOnderdelenPerBlok)
    .map((k, i) => vanCanvas(k, k.instanceId, i));
  return { schema: BLOKKEN_SCHEMA, wortel: w, bron: 'eigen' };
}

/** Terug naar een gewone map (één niveau). null als dat niet verliesvrij kan (geneste blokken, widgets in het blok). */
export function mapUitBlok(map: EntryMetBlok): { map: DesktopEntry; kinderen: DesktopEntry[] } | null {
  const b = map.blok?.wortel;
  if (!b) return null;
  if (b.kinderen.some((k) => k.soort !== 'onderdeel' || k.itemId.startsWith('wdg:'))) return null;
  const { blok: _weg, ...kaal } = map; void _weg;
  const terug: DesktopEntry = { ...kaal, kind: 'folder' };
  if (b.titel) terug.titleOverride = b.titel; else delete terug.titleOverride;
  const kinderen = (b.kinderen as Onderdeel[]).map((o, i) => ({ ...naarCanvas(o, o.positie ?? { x: 0, y: 0, z: i + 1 }, o.id), parent: map.instanceId }));
  return { map: terug, kinderen };
}

/** Onderdeel → zelfstandige snelkoppeling. Wat het canvas kan dragen blijft: titel (label.tekst), icoon (vervang), vaste px-maat. */
export function naarCanvas(o: Onderdeel, plek: { x: number; y: number; z: number }, instanceId: string): DesktopEntry {
  const e: DesktopEntry = { instanceId, itemId: o.itemId, kind: o.itemId.startsWith('wdg:') ? 'widget' : 'shortcut', x: plek.x, y: plek.y, w: 96, h: 104, z: plek.z };
  if (o.afmeting.breedte.soort === 'px') e.w = o.afmeting.breedte.waarde;
  if (o.afmeting.hoogte.soort === 'px') e.h = o.afmeting.hoogte.waarde;
  if (o.label?.tekst) e.titleOverride = o.label.tekst;
  if (o.icoon?.vervang) e.iconOverride = o.icoon.vervang;
  if (o.vergrendeld) e.locked = true;
  if (o.config) e.config = { ...o.config };
  return e;
}
export function vanCanvas(e: DesktopEntry, knoopId: KnoopId, volgorde = 0): Onderdeel {
  const o: Onderdeel = { ...onderdeel(knoopId, e.itemId, volgorde), afmeting: { breedte: { soort: 'px', waarde: e.w }, hoogte: { soort: 'px', waarde: e.h } }, positie: { x: e.x, y: e.y, z: e.z } };
  if (e.titleOverride) o.label = { tonen: 'auto', plaats: 'onder', tekst: e.titleOverride };
  if (e.iconOverride) o.icoon = { grootte: MAAT_AUTO, vervang: e.iconOverride };
  if (e.locked) o.vergrendeld = true;
  if (e.config) o.config = { ...e.config };
  return o;
}

// ---------------------------------------------------------------- boombewerkingen (altijd een nieuwe boom)
const kloon = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function zoekKnoop(wortel: Blok, id: KnoopId): { knoop: Knoop; ouder: Blok | null; pad: KnoopId[] } | null {
  const loop = (k: Knoop, ouder: Blok | null, pad: KnoopId[]): ReturnType<typeof zoekKnoop> => {
    const p = [...pad, k.id];
    if (k.id === id) return { knoop: k, ouder, pad: p };
    if (k.soort === 'blok') for (const c of k.kinderen) { const r = loop(c, k, p); if (r) return r; }
    return null;
  };
  return loop(wortel, null, []);
}
const herNummer = (b: Blok) => { b.kinderen.forEach((k, i) => { k.volgorde = i; }); };

export function verplaats(wortel: Blok, id: KnoopId, naarBlok: KnoopId, voor: KnoopId | null, positie?: { x: number; y: number }): Blok {
  const w = kloon(wortel);
  const bron = zoekKnoop(w, id), doel = zoekKnoop(w, naarBlok);
  if (!bron || !doel) throw new BlokFout('niet-gevonden');
  if (!bron.ouder) throw new BlokFout('wortel-vast');
  if (doel.knoop.soort !== 'blok') throw new BlokFout('soort-niet-toegestaan');
  if (doel.pad.includes(id)) throw new BlokFout('kring');
  if (bron.knoop.vergrendeld) throw new BlokFout('vergrendeld');
  const naar = doel.knoop;
  if (bron.ouder !== naar && naar.kinderen.length >= L.maxOnderdelenPerBlok) throw new BlokFout('vol');
  if (doel.pad.length + diepteVan(bron.knoop) > L.maxDiepte) throw new BlokFout('te-diep');
  bron.ouder.kinderen = bron.ouder.kinderen.filter((k) => k.id !== id);
  const k = bron.knoop;
  if (positie && naar.indeling.modus === 'vrij') k.positie = { x: klem(Math.round(positie.x), 0, 12000), y: klem(Math.round(positie.y), 0, 12000), z: k.positie?.z ?? Math.min(400, naar.kinderen.length + 1) };
  const i = voor ? naar.kinderen.findIndex((c) => c.id === voor) : -1;
  naar.kinderen.splice(i < 0 ? naar.kinderen.length : i, 0, k);
  herNummer(bron.ouder); herNummer(naar);
  return w;
}

export function wijzig(wortel: Blok, id: KnoopId, deel: Record<string, unknown>): Blok {
  const w = kloon(wortel);
  const z = zoekKnoop(w, id); if (!z) throw new BlokFout('niet-gevonden');
  const { id: _i, soort: _s, kinderen: _k, ...rest } = deel; void _i; void _s; void _k;
  Object.assign(z.knoop, kloon(rest));
  return w;
}

const STANDAARD_PADEN: Record<string, unknown> = {
  'afmeting.breedte': MAAT_AUTO, 'afmeting.hoogte': MAAT_AUTO, 'icoon.grootte': MAAT_AUTO, 'label.tonen': 'auto', 'label.plaats': 'onder',
};
export function herstelEigenschap(wortel: Blok, id: KnoopId, pad: string): Blok {
  if (!/^[a-zA-Z]+(\.[a-zA-Z]+){0,2}$/.test(pad) || ['id', 'soort', 'kinderen'].includes(pad)) throw new BlokFout('pad-ongeldig');
  const w = kloon(wortel);
  const z = zoekKnoop(w, id); if (!z) throw new BlokFout('niet-gevonden');
  const delen = pad.split('.');
  if (delen[0] === 'indeling' && z.knoop.soort === 'blok') {
    const k = delen[1] as keyof BlokIndeling | undefined;
    if (!k) z.knoop.indeling = { ...STANDAARD_INDELING }; else (z.knoop.indeling as unknown as Record<string, unknown>)[k] = (STANDAARD_INDELING as unknown as Record<string, unknown>)[k];
    return w;
  }
  let o = z.knoop as unknown as Record<string, unknown>;
  for (const d of delen.slice(0, -1)) { const n = obj(o[d]); if (!n) return w; o = n; }
  const laatste = delen[delen.length - 1];
  if (pad in STANDAARD_PADEN) o[laatste] = kloon(STANDAARD_PADEN[pad]); else delete o[laatste];
  return w;
}

export function pasVoorinstellingToe(wortel: Blok, id: KnoopId, v: VoorinstellingId): Blok {
  const vi = VOORINSTELLINGEN[v]; if (!vi) throw new BlokFout('voorinstelling-onbekend');
  const w = kloon(wortel);
  const z = zoekKnoop(w, id); if (!z) throw new BlokFout('niet-gevonden');
  if (z.knoop.soort === 'blok') {
    const b = z.knoop;
    b.indeling = v === 'raster-automatisch' ? { ...STANDAARD_INDELING } : indelingOf({ ...b.indeling, ...vi.indeling });
    if (v === 'raster-automatisch') delete b.standaardOnderdeel;
    else {
      const so = { ...(b.standaardOnderdeel ?? {}) };
      if (vi.icoon) so.icoon = { grootte: MAAT_AUTO, ...(so.icoon ?? {}), ...vi.icoon } as Icoon;
      if (vi.label) so.label = { tonen: 'auto', plaats: 'onder', ...(so.label ?? {}), ...vi.label } as Label;
      b.standaardOnderdeel = so;
    }
  } else {
    const o = z.knoop;
    if (v === 'raster-automatisch') { delete o.icoon; delete o.label; }
    if (vi.icoon) o.icoon = { grootte: MAAT_AUTO, ...(o.icoon ?? {}), ...vi.icoon } as Icoon;
    if (vi.label) o.label = { tonen: 'auto', plaats: 'onder', ...(o.label ?? {}), ...vi.label } as Label;
  }
  return w;
}

/** Nieuwe unieke id binnen de boom (g-1, g-2, …). */
export function nieuweId(wortel: Blok, voorvoegsel = 'g'): KnoopId {
  const ids = new Set(knoopIds(wortel));
  for (let i = 1; ; i++) if (!ids.has(`${voorvoegsel}-${i}`)) return `${voorvoegsel}-${i}`;
}

/** «Blok in blok»: de gekozen knopen (zelfde ouder) gaan samen in een nieuw blok op de plek van de eerste. */
export function groepeer(wortel: Blok, ids: KnoopId[], modus: BlokModus): Blok {
  if (!ids.length) throw new BlokFout('leeg');
  const w = kloon(wortel);
  const gevonden = ids.map((i) => zoekKnoop(w, i));
  if (gevonden.some((g) => !g || !g.ouder)) throw new BlokFout('niet-gevonden');
  const ouder = gevonden[0]!.ouder!;
  if (gevonden.some((g) => g!.ouder !== ouder)) throw new BlokFout('verschillende-ouders');
  const padOuder = zoekKnoop(w, ouder.id)!.pad.length;
  const diepsteKind = Math.max(0, ...gevonden.map((g) => diepteVan(g!.knoop)));
  if (padOuder + 1 + diepsteKind > L.maxDiepte) throw new BlokFout('te-diep');
  if (telKnopen(w) + 1 > L.maxKnopenTotaal) throw new BlokFout('vol');
  const set = new Set(ids);
  const eerste = ouder.kinderen.findIndex((k) => set.has(k.id));
  const nieuw = leegBlok(nieuweId(w), modus);
  nieuw.kinderen = ouder.kinderen.filter((k) => set.has(k.id));
  herNummer(nieuw);
  ouder.kinderen = ouder.kinderen.filter((k) => !set.has(k.id));
  ouder.kinderen.splice(eerste, 0, nieuw);
  herNummer(ouder);
  return w;
}

export function ontgroepeer(wortel: Blok, blokId: KnoopId): Blok {
  const w = kloon(wortel);
  const z = zoekKnoop(w, blokId);
  if (!z) throw new BlokFout('niet-gevonden');
  if (!z.ouder || z.knoop.soort !== 'blok') throw new BlokFout('soort-niet-toegestaan');
  const ouder = z.ouder, i = ouder.kinderen.findIndex((k) => k.id === blokId);
  if (ouder.kinderen.length - 1 + z.knoop.kinderen.length > L.maxOnderdelenPerBlok) throw new BlokFout('vol');
  ouder.kinderen.splice(i, 1, ...z.knoop.kinderen);
  herNummer(ouder);
  return w;
}
