// Werkblad v3 — normalisatie, validatie en de eenmalige overzetting v2 → v3. Zuiver (geen DOM, geen database): dezelfde functies
// draaien in de browser én op de server. De server vertrouwt de browser niet: wat binnenkomt gaat ALTIJD door normaliseerLaag /
// normaliseerWerkbladV3 met de context van DEZE lade (user_id + ruimte uit de sessie, nooit uit het verzoek).
//
// Regels (idempotent: tweemaal toepassen verandert niets):
//  • onbekende velden vallen weg; alleen de velden van shared/werkblad-v3-types.ts blijven;
//  • itemId moet de vorm van een registersleutel hebben (svc:/pg:/cmd:/wdg:/usr:/map:) en past bij kind; het register zelf
//    (bibliotheek, werker B) beslist via ctx.itemToegestaan / ctx.grenzen — zonder register geldt een veilige standaard
//    (v2-widgets volgen hun v2-regels; wdg:tech-* alleen in de technische lade);
//  • x/y/w/h/z eindig, afgerond op hele px en begrensd (WERKBLAD_V3_LIMIETEN + registergrenzen); niets valt buiten het canvas;
//  • dubbele instanceIds krijgen een nieuwe vaste id (i-1, i-2, …); z wordt 1..n uniek in de oorspronkelijke stapelvolgorde;
//  • mappen: één niveau; parent alleen naar een bestaande map in dezelfde laag; een map en een widget hebben zelf geen parent;
//  • titleOverride platte tekst ≤ 60; iconOverride alleen een id (nooit SVG/URL); config plat (string/number/boolean), begrensd.
import {
  plaatsen, toegestaan as v2Toegestaan, werkbladWidget, achtergrondOf, normaliseerWerkblad,
  type WerkbladIndeling, type WerkbladContext,
} from './werkblad-indeling';
import {
  WERKBLAD_V3_LIMIETEN as L,
  type ApparaatKlasse, type CanvasLayout, type CanvasModus, type DesktopEntry, type ItemSoort, type WerkbladRuimte, type WerkbladV3,
} from './werkblad-v3-types';

export const APPARATEN: readonly ApparaatKlasse[] = ['computer', 'tablet', 'telefoon'];
export const MODI: readonly CanvasModus[] = ['free', 'snap', 'flow'];
export const SOORTEN: readonly ItemSoort[] = ['shortcut', 'folder', 'widget'];
export const INSTANCE_RE = /^[a-z0-9-]{1,40}$/;
export const ITEM_RE = /^(svc|pg|cmd|wdg|usr|map):[a-z0-9][a-z0-9._/-]{0,79}$/;
export const ICOON_RE = /^[a-z0-9][a-z0-9:_-]{0,59}$/;
const CONFIG_SLEUTEL = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;
export const CONFIG_MAX_SLEUTELS = 16;
export const CONFIG_TEKST_MAX = 1600;
export const CONFIG_MAX_BYTES = 4000;

/** Logische canvasbreedte per apparaatklasse bij een eerste of overgezette laag. */
export const STANDAARD_CANVAS: Record<ApparaatKlasse, { w: number; h: number; mode: CanvasModus }> = {
  computer: { w: 1280, h: 1600, mode: 'free' },
  tablet: { w: 768, h: 2000, mode: 'free' },
  telefoon: { w: 390, h: 3000, mode: 'flow' },
};
/** v2-raster (werkblad.css: --wb-rij 96px, --wb-kier 12px). */
export const V2_RIJ_PX = 96, V2_KIER_PX = 12;

export type Afmetingen = { min: { w: number; h: number }; max: { w: number; h: number } };
export type V3Context = {
  ruimte: WerkbladRuimte; eigenaar?: boolean;
  /** Registercontrole (bibliotheek). Zonder: standaardItemToegestaan. */
  itemToegestaan?: (itemId: string, kind: ItemSoort, ruimte: WerkbladRuimte, apparaat: ApparaatKlasse, config?: Record<string, unknown>) => boolean;
  /** Registergrenzen voor w/h. Zonder: alleen de algemene limieten. */
  grenzen?: (itemId: string, kind: ItemSoort) => Afmetingen | undefined;
  /** Mag maar één keer per laag. */
  singleton?: (itemId: string) => boolean;
};

export const apparaatOf = (v: unknown): ApparaatKlasse | null => ((APPARATEN as readonly string[]).includes(String(v)) ? v as ApparaatKlasse : null);
const eindig = (v: unknown, terug: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : terug);
const klem = (v: number, min: number, max: number): number => Math.min(Math.max(v, min), Math.max(min, max));

/** kind ↔ voorvoegsel: widget ⇔ wdg:, map ⇒ map:/usr:, ярлик ⇒ svc:/pg:/cmd:/usr:. */
export function vormKlopt(itemId: unknown, kind: unknown): boolean {
  if (typeof itemId !== 'string' || !ITEM_RE.test(itemId) || !(SOORTEN as readonly string[]).includes(String(kind))) return false;
  const p = itemId.slice(0, itemId.indexOf(':'));
  if (kind === 'widget') return p === 'wdg';
  if (kind === 'folder') return p === 'map' || p === 'usr';
  return p === 'svc' || p === 'pg' || p === 'cmd' || p === 'usr';
}

/** Veilige standaard zonder register: v2-widgets volgen de v2-regel van deze lade; technische dingen alleen in de technische lade. */
export function standaardItemToegestaan(itemId: string, kind: ItemSoort, ruimte: WerkbladRuimte): boolean {
  const naam = itemId.slice(itemId.indexOf(':') + 1);
  if (kind === 'widget') {
    const def = werkbladWidget(naam);
    if (def) return v2Toegestaan(def.id, { ruimte } as WerkbladContext);
  }
  if (/^(tech|beheer|root)([-._/]|$)/.test(naam)) return ruimte === 'technisch';
  return true;
}

export function titelSchonen(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[<>]/g, '').trim().slice(0, L.maxTitel).trim();
  return s || undefined;
}

export function configSchonen(raw: unknown): Record<string, string | number | boolean> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const uit: Record<string, string | number | boolean> = {};
  let n = 0, bytes = 2;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= CONFIG_MAX_SLEUTELS) break;
    if (!CONFIG_SLEUTEL.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    let w: string | number | boolean | undefined;
    if (typeof v === 'string') { const s = v.replace(/\u0000/g, '').slice(0, CONFIG_TEKST_MAX); if (s) w = s; }
    else if (typeof v === 'number' && Number.isFinite(v)) w = v;
    else if (typeof v === 'boolean') w = v;
    if (w === undefined) continue;
    const extra = new TextEncoder().encode(`${JSON.stringify(k)}:${JSON.stringify(w)},`).length;
    if (bytes + extra > CONFIG_MAX_BYTES) continue;
    bytes += extra; uit[k] = w; n += 1;
  }
  return n ? uit : undefined;
}

/** Eén laag (één apparaatklasse) geldig maken voor DEZE lade. */
export function normaliseerLaag(raw: unknown, apparaat: ApparaatKlasse, ctx: V3Context): CanvasLayout {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const std = STANDAARD_CANVAS[apparaat];
  const mode: CanvasModus = (MODI as readonly string[]).includes(String(o.mode)) ? o.mode as CanvasModus : std.mode;
  const canvasWidth = Math.round(klem(eindig(o.canvasWidth, std.w), 200, L.maxCanvas));
  let canvasHeight = Math.round(klem(eindig(o.canvasHeight, std.h), 200, L.maxCanvas));
  const mag = ctx.itemToegestaan ?? ((id: string, k: ItemSoort, r: WerkbladRuimte) => standaardItemToegestaan(id, k, r));
  const bron = Array.isArray(o.items) ? o.items.slice(0, L.maxItemsPerLaag * 2) : [];
  type Tussen = DesktopEntry & { _i: number; _parent?: string };
  const lijst: Tussen[] = [];
  const ids = new Set<string>();
  const enkel = new Set<string>();
  bron.forEach((rij, i) => {
    if (lijst.length >= L.maxItemsPerLaag || !rij || typeof rij !== 'object' || Array.isArray(rij)) return;
    const r = rij as Record<string, unknown>;
    if (!vormKlopt(r.itemId, r.kind)) return;
    const itemId = String(r.itemId), kind = r.kind as ItemSoort;
    if (!mag(itemId, kind, ctx.ruimte, apparaat, configSchonen(r.config))) return;
    if (ctx.singleton?.(itemId)) { if (enkel.has(itemId)) return; enkel.add(itemId); }
    const g = ctx.grenzen?.(itemId, kind);
    const minW = Math.min(canvasWidth, Math.max(L.minAfm, g?.min.w ?? L.minAfm)), minH = Math.max(L.minAfm, g?.min.h ?? L.minAfm);
    const maxW = Math.min(L.maxAfm, canvasWidth, g?.max.w ?? L.maxAfm), maxH = Math.min(L.maxAfm, L.maxCanvas, g?.max.h ?? L.maxAfm);
    const w = Math.round(klem(eindig(r.w, minW), minW, maxW)), h = Math.round(klem(eindig(r.h, minH), minH, maxH));
    const x = Math.round(klem(eindig(r.x, 0), 0, canvasWidth - w)), y = Math.round(klem(eindig(r.y, 0), 0, L.maxCanvas - h));
    let instanceId = typeof r.instanceId === 'string' && INSTANCE_RE.test(r.instanceId) && !ids.has(r.instanceId) ? r.instanceId : '';
    if (!instanceId) { for (let n = 1; ; n += 1) { const k = `i-${n}`; if (!ids.has(k) && !bron.some((b) => (b as Record<string, unknown>)?.instanceId === k)) { instanceId = k; break; } } }
    ids.add(instanceId);
    const e: Tussen = { instanceId, itemId, kind, x, y, w, h, z: eindig(r.z, 0), _i: i };
    if (r.locked === true) e.locked = true;
    if (typeof r.parent === 'string' && kind === 'shortcut') e._parent = r.parent;
    const t = titelSchonen(r.titleOverride); if (t) e.titleOverride = t;
    if (typeof r.iconOverride === 'string' && ICOON_RE.test(r.iconOverride)) e.iconOverride = r.iconOverride;
    const c = configSchonen(r.config); if (c) e.config = c;
    lijst.push(e);
  });
  const mappen = new Set(lijst.filter((e) => e.kind === 'folder').map((e) => e.instanceId));
  // z: 1..n uniek, in de stapelvolgorde (z, dan invoervolgorde). Stabiel.
  const opZ = [...lijst].sort((a, b) => (a.z - b.z) || (a._i - b._i));
  opZ.forEach((e, n) => { e.z = n + 1; });
  const items: DesktopEntry[] = lijst.map(({ _i, _parent, ...e }) => {
    void _i;
    return _parent && _parent !== e.instanceId && mappen.has(_parent) ? { ...e, parent: _parent } : e;
  }).map((e) => {
    // vaste sleutelvolgorde: dan is JSON van een genormaliseerde laag stabiel
    const s: DesktopEntry = { instanceId: e.instanceId, itemId: e.itemId, kind: e.kind, x: e.x, y: e.y, w: e.w, h: e.h, z: e.z };
    if (e.locked) s.locked = true; if (e.parent) s.parent = e.parent; if (e.titleOverride) s.titleOverride = e.titleOverride;
    if (e.iconOverride) s.iconOverride = e.iconOverride; if (e.config) s.config = e.config;
    return s;
  });
  canvasHeight = Math.round(Math.min(L.maxCanvas, Math.max(canvasHeight, ...items.map((e) => e.y + e.h))));
  return { mode, canvasWidth, canvasHeight, items };
}

export function normaliseerWerkbladV3(raw: unknown, ctx: V3Context): WerkbladV3 {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const lagen = o.layouts && typeof o.layouts === 'object' && !Array.isArray(o.layouts) ? o.layouts as Record<string, unknown> : {};
  const layouts: WerkbladV3['layouts'] = {};
  for (const a of APPARATEN) if (lagen[a] !== undefined && lagen[a] !== null) layouts[a] = normaliseerLaag(lagen[a], a, ctx);
  return { v: 3, achtergrond: achtergrondOf(o.achtergrond), layouts };
}

const kolomLaag = (v2: WerkbladIndeling, apparaat: ApparaatKlasse, kolommen: number, ctx: V3Context): CanvasLayout => {
  const std = STANDAARD_CANVAS[apparaat];
  const kolB = (std.w - V2_KIER_PX * (kolommen + 1)) / kolommen;
  const plekken = plaatsen(v2.items, kolommen);
  const items = plekken.map((p, n) => {
    const t = v2.items.find((x) => x.tid === p.tid)!;
    return {
      instanceId: p.tid, itemId: `wdg:${t.id}`, kind: 'widget' as const,
      x: Math.round(V2_KIER_PX + p.x * (kolB + V2_KIER_PX)), y: Math.round(V2_KIER_PX + p.y * (V2_RIJ_PX + V2_KIER_PX)),
      w: Math.round(p.k * kolB + (p.k - 1) * V2_KIER_PX), h: p.r * V2_RIJ_PX + (p.r - 1) * V2_KIER_PX, z: n + 1,
      ...(t.inst ? { config: t.inst } : {}),
    };
  });
  return normaliseerLaag({ mode: std.mode, canvasWidth: std.w, canvasHeight: std.h, items }, apparaat, ctx);
};

/**
 * Eenmalige overzetting v2 → v3 (zuiver; de server zorgt dat ze per lade maar ÉÉN keer wordt bewaard).
 *  • computer: plaatsen(v2.items, 12) — precies wat de mens op het 12-kolommenraster zag — in px (canvas 1280);
 *  • tablet: eigen veilige laag uit plaatsen(…, 6) op 768 px (twee kolommen, zoals v2 op tablet);
 *  • telefoon: eigen laag in flow-modus, één kolom onder elkaar op 390 px — nooit een kopie van PC-coördinaten;
 *  • backup: de v2-indeling ongewijzigd (genormaliseerd) — de server bewaart haar apart voor terugdraaien.
 * Geeft een v3 binnen: dan is er niets over te zetten (idempotent) en komt die genormaliseerd terug.
 */
export function migreerV2NaarV3(raw: unknown, ctx: V3Context): { v3: WerkbladV3; backup: WerkbladIndeling | null } {
  if (raw && typeof raw === 'object' && (raw as { v?: unknown }).v === 3) return { v3: normaliseerWerkbladV3(raw, ctx), backup: null };
  const v2 = normaliseerWerkblad(raw, { ruimte: ctx.ruimte, eigenaar: ctx.eigenaar });
  return {
    v3: { v: 3, achtergrond: v2.achtergrond, layouts: { computer: kolomLaag(v2, 'computer', 12, ctx), tablet: kolomLaag(v2, 'tablet', 6, ctx), telefoon: kolomLaag(v2, 'telefoon', 1, ctx) } },
    backup: v2,
  };
}

export const leegLaag = (apparaat: ApparaatKlasse): CanvasLayout => ({ mode: STANDAARD_CANVAS[apparaat].mode, canvasWidth: STANDAARD_CANVAS[apparaat].w, canvasHeight: STANDAARD_CANVAS[apparaat].h, items: [] });
