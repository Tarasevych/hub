// Menu v2 fase 2: indeling van het menu (puur, geen DOM/React; ook in de eenheidstests).
// - `menuWeergave` maakt van de standaardindeling + de overrides/kopieën uit ZijbalkVoorkeuren de lijsten die de UI toont:
//   «snelbalk» (Швидкий доступ, boven in het menu), «zijbalk» (het hoofdmenu; secties = de submenu's per dienst) en «start»
//   (snelkoppelingen op de startpagina van Мій простір).
// - Bewerkingen (verplaatsen, kopiëren, kopie weg, één stap omhoog/omlaag) geven een NIEUWE, genormaliseerde voorkeur terug of
//   een reden waarom het niet kan. Alle lijsten worden na een wijziging opnieuw doorgenummerd (volgorde = positie).
// Regels: een dienst staat altijd op het hoogste niveau (nooit in een sectie); een pagina mag overal. Een kopie houdt de kleur van
// haar herkomst (itemAccent). Diensten waar het account geen recht op heeft (`toegestaan`) verschijnen nergens, ook niet via een kopie.
import { DIENST_ACCENT, MAX_KOPIEEN, MENU_PAGINAS, MENU_PLAATSEN, normaliseerZijbalk, type Accent, type DienstId, type ItemKopie, type ItemOverride, type MenuPlaats, type ZijbalkVoorkeuren } from './menu-model';

export type Rij = { sleutel: string; item: string; kopie?: string; dienst: string; pagina?: string; accent: Accent; volgorde: number; plaats: MenuPlaats; ouder: string | null };
export type Weergave = { snelbalk: Rij[]; zijbalk: Rij[]; start: Rij[]; secties: Record<string, Rij[]> };
/** `diensten`: de zichtbare diensten in hun basisvolgorde (oude menuvoorkeur); `toegestaan`: alle diensten van dit account. */
export type Basis = { diensten: readonly string[]; toegestaan: readonly string[] };
export type Doel = { plaats: MenuPlaats; ouder: string | null; voor?: string | null };
export type Uitkomst = { ok: true; v: ZijbalkVoorkeuren } | { ok: false; fout: 'onbekend' | 'ongeldig' | 'al-hier' | 'te-veel' | 'rand' };

const ITEM = /^(svc):([a-z]{2,12})$|^(pg):([a-z]{2,12})\/([a-z-]{2,24})$/;
export function ontleed(item: string): { soort: 'dienst' | 'pagina'; dienst: string; pagina?: string } | null {
  const m = ITEM.exec(item);
  if (!m) return null;
  return m[1] ? { soort: 'dienst', dienst: m[2] } : { soort: 'pagina', dienst: m[4], pagina: m[5] };
}
/** Sleutel van een rij: het item-id, of voor een kopie 'k-…:item'. */
export function itemVanSleutel(sleutel: string): { item: string; kopie?: string } {
  const i = sleutel.indexOf(':'), voor = sleutel.slice(0, i);
  return /^k-[a-z0-9]{4,16}$/.test(voor) ? { item: sleutel.slice(i + 1), kopie: voor } : { item: sleutel };
}
export const standaardPlek = (item: string): { plaats: MenuPlaats; ouder: string | null } => {
  const o = ontleed(item);
  return { plaats: 'zijbalk', ouder: o?.soort === 'pagina' ? `svc:${o.dienst}` : null };
};
export const lijstNaam = (plaats: MenuPlaats, ouder: string | null) => `${plaats}|${ouder || ''}`;
export function lijst(w: Weergave, plaats: MenuPlaats, ouder: string | null): Rij[] {
  if (plaats === 'zijbalk' && ouder) return w.secties[ouder.replace(/^svc:/, '')] || [];
  return w[plaats];
}
export function alleRijen(w: Weergave): Rij[] {
  return [...w.snelbalk, ...w.zijbalk, ...w.start, ...Object.values(w.secties).flat()];
}
export const vindRij = (w: Weergave, sleutel: string) => alleRijen(w).find((r) => r.sleutel === sleutel);
/** Een dienst kan niet in een sectie (submenu) van een andere dienst. */
export const magNaar = (item: string, doel: { plaats: MenuPlaats; ouder: string | null }) => !(item.startsWith('svc:') && !!doel.ouder);

export function menuWeergave(v: ZijbalkVoorkeuren, basis: Basis): Weergave {
  const w: Weergave = { snelbalk: [], zijbalk: [], start: [], secties: {} };
  const toeg = new Set(basis.toegestaan);
  const accent = (d: string) => DIENST_ACCENT[d as DienstId] || 'grijs';
  const sectieOk = (ouder: string | null) => !ouder || toeg.has(ouder.slice(4));
  const zet = (r: Rij) => {
    if (r.plaats === 'zijbalk' && r.ouder) (w.secties[r.ouder.slice(4)] ||= []).push(r);
    else w[r.plaats].push({ ...r, ouder: null });
  };
  basis.diensten.forEach((d, i) => {
    if (!toeg.has(d)) return;
    const id = `svc:${d}`, o: ItemOverride = v.items[id] || {};
    if (o.zichtbaar === false) return;
    zet({ sleutel: id, item: id, dienst: d, accent: accent(d), volgorde: o.volgorde ?? i, plaats: o.plaats || 'zijbalk', ouder: null });
  });
  for (const d of basis.toegestaan) {
    (MENU_PAGINAS[d] || []).forEach((p, j) => {
      const id = `pg:${d}/${p}`, o: ItemOverride = v.items[id] || {};
      if (o.zichtbaar === false) return;
      const plaats = o.plaats || 'zijbalk';
      const ouder = plaats === 'zijbalk' ? (o.ouder !== undefined ? o.ouder : `svc:${d}`) : null;
      if (!sectieOk(ouder)) return;
      zet({ sleutel: id, item: id, dienst: d, pagina: p, accent: accent(d), volgorde: o.volgorde ?? j, plaats, ouder });
    });
  }
  for (const k of v.kopieen) {
    const o = ontleed(k.item);
    if (!o || !toeg.has(o.dienst) || (o.pagina && !(MENU_PAGINAS[o.dienst] || []).includes(o.pagina))) continue;
    const ouder = k.plaats === 'zijbalk' && k.ouder ? k.ouder : null;
    if (!sectieOk(ouder)) continue;
    zet({ sleutel: `${k.id}:${k.item}`, item: k.item, kopie: k.id, dienst: o.dienst, pagina: o.pagina, accent: accent(o.dienst), volgorde: k.volgorde, plaats: k.plaats, ouder });
  }
  const sorteer = (l: Rij[]) => l.sort((a, b) => a.volgorde - b.volgorde || Number(!!a.kopie) - Number(!!b.kopie) || a.sleutel.localeCompare(b.sleutel));
  for (const p of MENU_PLAATSEN) sorteer(w[p]);
  for (const l of Object.values(w.secties)) sorteer(l);
  return w;
}

/** Nummer een lijst door en schrijf plaats/ouder alleen weg waar ze van de standaard afwijken (zo blijven overrides klein). */
function schrijf(v: ZijbalkVoorkeuren, rijen: Rij[]): ZijbalkVoorkeuren {
  const items: Record<string, ItemOverride> = { ...v.items };
  const kopieen: ItemKopie[] = v.kopieen.map((k) => ({ ...k }));
  rijen.forEach((r, i) => {
    if (r.kopie) {
      const k = kopieen.find((x) => x.id === r.kopie);
      if (!k) return;
      k.plaats = r.plaats; k.volgorde = i;
      if (r.plaats === 'zijbalk' && r.ouder) k.ouder = r.ouder; else delete k.ouder;
      return;
    }
    const std = standaardPlek(r.item), o: ItemOverride = { ...(items[r.item] || {}), volgorde: i };
    if (r.plaats !== 'zijbalk') o.plaats = r.plaats; else delete o.plaats;
    const ouder = r.plaats === 'zijbalk' ? r.ouder : null;
    if (r.plaats === 'zijbalk' && ouder !== std.ouder) o.ouder = ouder; else delete o.ouder;
    items[r.item] = o;
  });
  return normaliseerZijbalk({ ...v, items, kopieen });
}
function invoegen(w: Weergave, nieuw: Rij, doel: Doel): Rij[] {
  const l = lijst(w, doel.plaats, doel.ouder).filter((r) => r.sleutel !== nieuw.sleutel);
  let i = doel.voor ? l.findIndex((r) => r.sleutel === doel.voor) : -1;
  if (i < 0) i = l.length;
  return [...l.slice(0, i), { ...nieuw, plaats: doel.plaats, ouder: doel.plaats === 'zijbalk' ? doel.ouder : null }, ...l.slice(i)];
}

export function verplaatsen(v: ZijbalkVoorkeuren, w: Weergave, sleutel: string, doel: Doel): Uitkomst {
  const r = vindRij(w, sleutel);
  if (!r) return { ok: false, fout: 'onbekend' };
  if (!magNaar(r.item, doel)) return { ok: false, fout: 'ongeldig' };
  const elders = lijst(w, doel.plaats, doel.ouder).some((x) => x.item === r.item && x.sleutel !== sleutel);
  if (elders && (doel.plaats !== r.plaats || doel.ouder !== r.ouder)) return { ok: false, fout: 'al-hier' };
  return { ok: true, v: schrijf(v, invoegen(w, r, doel)) };
}

export function kopieren(v: ZijbalkVoorkeuren, w: Weergave, sleutel: string, doel: Doel, id: string): Uitkomst {
  const r = vindRij(w, sleutel);
  if (!r) return { ok: false, fout: 'onbekend' };
  if (!magNaar(r.item, doel)) return { ok: false, fout: 'ongeldig' };
  if (lijst(w, doel.plaats, doel.ouder).some((x) => x.item === r.item)) return { ok: false, fout: 'al-hier' };
  if (v.kopieen.length >= MAX_KOPIEEN || !/^k-[a-z0-9]{4,16}$/.test(id)) return { ok: false, fout: 'te-veel' };
  const k: ItemKopie = { id, item: r.item, plaats: doel.plaats, volgorde: 0 };
  const nieuw: Rij = { ...r, sleutel: `${id}:${r.item}`, kopie: id };
  return { ok: true, v: schrijf({ ...v, kopieen: [...v.kopieen, k] }, invoegen(w, nieuw, doel)) };
}

export function kopieWeg(v: ZijbalkVoorkeuren, kopie: string): ZijbalkVoorkeuren {
  return normaliseerZijbalk({ ...v, kopieen: v.kopieen.filter((k) => k.id !== kopie) });
}

/** Eén plaats omhoog (-1) of omlaag (+1) binnen de eigen lijst. */
export function stap(v: ZijbalkVoorkeuren, w: Weergave, sleutel: string, delta: -1 | 1): Uitkomst {
  const r = vindRij(w, sleutel);
  if (!r) return { ok: false, fout: 'onbekend' };
  const l = lijst(w, r.plaats, r.ouder), i = l.findIndex((x) => x.sleutel === sleutel), j = i + delta;
  if (i < 0 || j < 0 || j >= l.length) return { ok: false, fout: 'rand' };
  const zonder = l.filter((x) => x.sleutel !== sleutel);
  const voor = delta < 0 ? l[j].sleutel : zonder[j]?.sleutel ?? null;
  return verplaatsen(v, w, sleutel, { plaats: r.plaats, ouder: r.ouder, voor });
}

/** Waar een item heen kan (menu «Перемістити до…» / «Дублювати до…»), zonder de plek waar het al staat. */
export function mogelijkeDoelen(w: Weergave, sleutel: string, secties: readonly string[], soort: 'verplaats' | 'kopie'): Array<{ plaats: MenuPlaats; ouder: string | null }> {
  const r = vindRij(w, sleutel);
  if (!r) return [];
  const doelen: Array<{ plaats: MenuPlaats; ouder: string | null }> = [{ plaats: 'snelbalk', ouder: null }, { plaats: 'zijbalk', ouder: null }, { plaats: 'start', ouder: null }];
  if (r.item.startsWith('pg:')) for (const d of secties) doelen.push({ plaats: 'zijbalk', ouder: `svc:${d}` });
  return doelen.filter((d) => {
    if (d.plaats === r.plaats && d.ouder === r.ouder) return false;
    const l = lijst(w, d.plaats, d.ouder);
    return !l.some((x) => x.item === r.item);
  }).filter((d) => soort === 'kopie' || magNaar(r.item, d));
}

/** Overzicht voor Instellingen → Меню: items op een andere plek (plaats/sectie) en/of met kopieën; `volgorde` = alleen de positie. */
export function aangepasteItems(v: ZijbalkVoorkeuren): Array<{ item: string; verplaatst: boolean; volgorde: boolean; kopieen: number }> {
  const uit = new Map<string, { item: string; verplaatst: boolean; volgorde: boolean; kopieen: number }>();
  for (const [item, o] of Object.entries(v.items)) {
    if (o.plaats !== undefined || o.ouder !== undefined || o.volgorde !== undefined) uit.set(item, { item, verplaatst: o.plaats !== undefined || o.ouder !== undefined, volgorde: o.volgorde !== undefined, kopieen: 0 });
  }
  for (const k of v.kopieen) { const x = uit.get(k.item) || { item: k.item, verplaatst: false, volgorde: false, kopieen: 0 }; x.kopieen++; uit.set(k.item, x); }
  return [...uit.values()];
}

/** Nieuwe kopie-id (k- + 8 tekens a-z0-9). */
export function nieuweKopieId(rnd: (n: number) => Uint8Array): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return 'k-' + Array.from(rnd(8), (b) => a[b % a.length]).join('');
}
