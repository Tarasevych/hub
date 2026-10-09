// Menumodel v2 (RUNBOOK §14): data-gedreven beschrijving van het zijmenu, gedeeld door frontend en backend.
// Elk item heeft een STABIELE id ('svc:<dienst>' of 'pg:<dienst>/<pagina>'), een standaardplaats en een accentkleur.
// Gebruikersvoorkeuren (ZijbalkVoorkeuren) zijn alleen OVERRIDES daarop: fase 2 (dock links/rechts/boven/onder, transparantie,
// vergroting, bewerkmodus met slepen, kopieën van items op andere plaatsen, reset per item / alles) voegt alleen UI toe;
// het formaat, de normalisatie en het samenstellen (menuSamenstellen) bestaan al en zijn getest.
// Geen React, geen DOM: dit bestand draait ook op de server (normalisatie van wat de browser opslaat).

export const DIENST_IDS = ['hub', 'ai', 'mail', 'cloud', 'github', 'huis', 'mcp', 'tasks', 'calendar', 'notes', 'identity', 'api', 'admin', 'social'] as const;
export type DienstId = typeof DIENST_IDS[number];

/** Pagina's per dienst — moet gelijk blijven aan `tabs` in public/canonical-service.js (eenheidstest controleert dat). */
export const MENU_PAGINAS: Record<string, readonly string[]> = {
  hub: ['overview', 'recent', 'tasks', 'calendar', 'notes'],
  ai: ['workspace', 'agents', 'runs', 'workflows', 'connections'],
  mail: ['inbox', 'starred', 'snoozed', 'sent', 'drafts', 'archive', 'labels', 'accounts', 'local', 'unread', 'all', 'important', 'spam', 'trash', 'subscriptions', 'scheduled', 'settings'],
  cloud: ['overview', 'workspaces', 'capture', 'inbox', 'search', 'recent', 'calendar', 'photos', 'accounts', 'google', 'onedrive', 'dropbox'],
  github: ['overview', 'repositories', 'projects', 'documentation', 'research', 'accounts', 'activity'],
  huis: ['overview'],
  identity: ['personalization', 'menu', 'themes', 'languages', 'widgets', 'sharing', 'identity', 'account', 'sessions', 'methods', 'security', 'recovery'],
  api: ['connections', 'vault', 'oauth', 'access', 'webhooks', 'events', 'logs', 'import', 'reconciliation'],
  admin: ['overview', 'access', 'contour', 'updates', 'apps', 'devices', 'sso', 'directories', 'roles', 'diagnostics', 'audit'],
  mcp: ['overview', 'services', 'tools', 'board', 'agents', 'playground', 'traffic', 'connect', 'roadmap', 'download'],
};

/** Accentkleuren (palet in menu-v2.css, licht + donker). Pagina's erven het accent van hun dienst. */
export const ACCENTEN = ['teal', 'violet', 'blauw', 'hemel', 'grafiet', 'amber', 'indigo', 'groen', 'koraal', 'oker', 'pruim', 'framboos', 'roest', 'leisteen'] as const;
export type Accent = typeof ACCENTEN[number];
export const DIENST_ACCENT: Record<DienstId, Accent> = {
  hub: 'teal', ai: 'violet', mail: 'blauw', cloud: 'hemel', github: 'grafiet', huis: 'amber', mcp: 'indigo',
  tasks: 'groen', calendar: 'koraal', notes: 'oker', identity: 'pruim', api: 'framboos', admin: 'roest', social: 'leisteen',
};

export type MenuItemSoort = 'dienst' | 'pagina';
export type MenuNode = { id: string; soort: MenuItemSoort; dienst: string; pagina?: string; ouder?: string; accent: Accent; standaardVolgorde: number };
export const dienstItemId = (dienst: string) => `svc:${dienst}`;
export const paginaItemId = (dienst: string, pagina: string) => `pg:${dienst}/${pagina}`;
const ITEM_ID = /^(svc:[a-z]{2,12}|pg:[a-z]{2,12}\/[a-z-]{2,24})$/;
export const isMenuItemId = (id: unknown): id is string => typeof id === 'string' && ITEM_ID.test(id);

/** Alle items met stabiele id's: diensten (hoofdniveau) en hun pagina's (subniveau). */
export function menuNodes(): MenuNode[] {
  const uit: MenuNode[] = [];
  DIENST_IDS.forEach((d, i) => {
    uit.push({ id: dienstItemId(d), soort: 'dienst', dienst: d, accent: DIENST_ACCENT[d], standaardVolgorde: i });
    (MENU_PAGINAS[d] || []).forEach((p, j) => uit.push({ id: paginaItemId(d, p), soort: 'pagina', dienst: d, pagina: p, ouder: dienstItemId(d), accent: DIENST_ACCENT[d], standaardVolgorde: j }));
  });
  return uit;
}

// ------------------------------------------------------------------------------------------------ voorkeuren
/** auto = smal, verbreedt bij aanwijzen; open = altijd breed (vastgezet); dicht = altijd smal (vastgezet, geen hover). */
export const ZIJBALK_MODI = ['auto', 'open', 'dicht'] as const;
export type ZijbalkModus = typeof ZIJBALK_MODI[number];
export const ICOON_STIJLEN = ['klassiek', 'kleur'] as const;
export type IcoonStijl = typeof ICOON_STIJLEN[number];
/** Fase 2: waar het menu staat. */
export const DOCK_POSITIES = ['links', 'rechts', 'boven', 'onder'] as const;
export type DockPositie = typeof DOCK_POSITIES[number];
/** Fase 2: plaatsen waar een item (of een kopie) kan staan. */
export const MENU_PLAATSEN = ['zijbalk', 'snelbalk', 'start'] as const;
export type MenuPlaats = typeof MENU_PLAATSEN[number];

export type ItemOverride = { zichtbaar?: boolean; volgorde?: number; plaats?: MenuPlaats; ouder?: string | null; icoon?: string };
export type ItemKopie = { id: string; item: string; plaats: MenuPlaats; volgorde: number };
export type ZijbalkVoorkeuren = {
  versie: 1;
  modus: ZijbalkModus;
  icoonStijl: IcoonStijl;
  dock: { positie: DockPositie; transparantie: number; vergroting: boolean };
  items: Record<string, ItemOverride>;
  kopieen: ItemKopie[];
};
export const MAX_OVERRIDES = 200, MAX_KOPIEEN = 50, MAX_TRANSPARANTIE = 60;
export const standaardZijbalk = (): ZijbalkVoorkeuren => ({ versie: 1, modus: 'auto', icoonStijl: 'klassiek', dock: { positie: 'links', transparantie: 0, vergroting: false }, items: {}, kopieen: [] });

const een = <T extends string>(lijst: readonly T[], v: unknown, std: T): T => (lijst as readonly string[]).includes(String(v)) ? v as T : std;
const geheel = (v: unknown, min: number, max: number, std: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : std; };
const ICOON_ID = /^[a-z][a-z0-9-]{1,23}$/;
const KOPIE_ID = /^k-[a-z0-9]{4,16}$/;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** Strikte normalisatie (browser én server): onbekende velden weg, id's gevalideerd, grenzen afgedwongen. */
export function normaliseerZijbalk(raw: unknown): ZijbalkVoorkeuren {
  const r = obj(raw), std = standaardZijbalk(), d = obj(r.dock);
  const items: Record<string, ItemOverride> = {};
  for (const [id, waarde] of Object.entries(obj(r.items)).slice(0, MAX_OVERRIDES)) {
    if (!isMenuItemId(id)) continue;
    const o = obj(waarde), x: ItemOverride = {};
    if (typeof o.zichtbaar === 'boolean') x.zichtbaar = o.zichtbaar;
    if (o.volgorde !== undefined && Number.isFinite(Number(o.volgorde))) x.volgorde = geheel(o.volgorde, 0, 999, 0);
    if (o.plaats !== undefined && (MENU_PLAATSEN as readonly string[]).includes(String(o.plaats))) x.plaats = o.plaats as MenuPlaats;
    if (o.ouder === null || (isMenuItemId(o.ouder) && String(o.ouder).startsWith('svc:') && o.ouder !== id)) x.ouder = o.ouder as string | null;
    if (typeof o.icoon === 'string' && ICOON_ID.test(o.icoon)) x.icoon = o.icoon;
    if (Object.keys(x).length) items[id] = x;
  }
  const gezien = new Set<string>();
  const kopieen: ItemKopie[] = [];
  for (const k of Array.isArray(r.kopieen) ? r.kopieen : []) {
    const o = obj(k);
    if (kopieen.length >= MAX_KOPIEEN || !KOPIE_ID.test(String(o.id)) || gezien.has(String(o.id)) || !isMenuItemId(o.item)) continue;
    if (!(MENU_PLAATSEN as readonly string[]).includes(String(o.plaats))) continue;
    gezien.add(String(o.id));
    kopieen.push({ id: String(o.id), item: String(o.item), plaats: o.plaats as MenuPlaats, volgorde: geheel(o.volgorde, 0, 999, 0) });
  }
  return {
    versie: 1,
    modus: een(ZIJBALK_MODI, r.modus, std.modus),
    icoonStijl: een(ICOON_STIJLEN, r.icoonStijl, std.icoonStijl),
    dock: { positie: een(DOCK_POSITIES, d.positie, 'links'), transparantie: geheel(d.transparantie, 0, MAX_TRANSPARANTIE, 0), vergroting: d.vergroting === true },
    items, kopieen,
  };
}

/** Fase 2: één item terug naar de standaard (override weg + alle kopieën ervan weg). */
export function itemTerugzetten(v: ZijbalkVoorkeuren, id: string): ZijbalkVoorkeuren {
  const items = { ...v.items }; delete items[id];
  return { ...v, items, kopieen: v.kopieen.filter((k) => k.item !== id) };
}
/** Fase 2: alles terug (indeling, kopieën, dock); de gekozen modus en icoonstijl blijven. */
export function allesTerugzetten(v: ZijbalkVoorkeuren): ZijbalkVoorkeuren {
  const std = standaardZijbalk();
  return { ...std, modus: v.modus, icoonStijl: v.icoonStijl };
}

export type GeplaatstItem = { id: string; node: MenuNode; plaats: MenuPlaats; ouder: string | null; volgorde: number; kopie?: string };
/** Standaard + overrides + kopieën → per plaats een gesorteerde lijst. Verborgen items vallen weg; kopieën zijn extra verwijzingen. */
export function menuSamenstellen(v: ZijbalkVoorkeuren, nodes: MenuNode[] = menuNodes()): Record<MenuPlaats, GeplaatstItem[]> {
  const uit: Record<MenuPlaats, GeplaatstItem[]> = { zijbalk: [], snelbalk: [], start: [] };
  const perId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    const o = v.items[n.id] || {};
    if (o.zichtbaar === false) continue;
    const ouder = o.ouder !== undefined ? o.ouder : n.ouder ?? null;
    if (ouder && v.items[ouder]?.zichtbaar === false) continue;
    uit[o.plaats || 'zijbalk'].push({ id: n.id, node: n, plaats: o.plaats || 'zijbalk', ouder: ouder && perId.has(ouder) ? ouder : null, volgorde: o.volgorde ?? n.standaardVolgorde });
  }
  for (const k of v.kopieen) { const n = perId.get(k.item); if (n) uit[k.plaats].push({ id: `${k.id}:${n.id}`, node: n, plaats: k.plaats, ouder: null, volgorde: k.volgorde, kopie: k.id }); }
  for (const p of MENU_PLAATSEN) uit[p].sort((a, b) => a.volgorde - b.volgorde || a.id.localeCompare(b.id));
  return uit;
}
