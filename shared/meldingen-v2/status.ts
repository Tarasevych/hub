// UI-014 fase 2B (vlag meldingen-uitleg-v3, standaard UIT) — BLIJVENDE STATUS per melding per gebruiker. Puur (geen React/netwerk):
// dezelfde code draait op de server (backend/meldingen-status.ts: normaliseren, opschonen) en in de browser (tabs, tellers, export).
//
// Statussen: нове (geen record) / прочитане / вирішено / архів / відкладено (tot een tijdstip; daarna weer bovenaan en ongelezen).
// Virішено en архів bewaren WIE / WANNEER / HOE. Een groep ×N krijgt ALTIJD dezelfde status voor alle onderliggende records.
// Opschonen: вирішено ouder dan de termijn (standaard 30 dagen) → архів (automatisch). Archief ouder dan nog eens de termijn →
// «opgeruimd» (niet meer in de tab Архів, wél in «Вся історія»). Beveiligingsmeldingen worden NOOIT opgeruimd, alleen gearchiveerd.
// Er wordt nergens een melding gewist.
import type { Ernst, Filters, V2Groep, V2Melding } from './groepering';
import { vraagtAandacht } from './groepering';

export type MeldingStatus = 'gelezen' | 'opgelost' | 'archief' | 'uitgesteld';
export const MELDING_STATUSSEN: readonly MeldingStatus[] = ['gelezen', 'opgelost', 'archief', 'uitgesteld'];
export type StatusHoe = 'kaart' | 'bulk' | 'automatisch';
export type StatusItem = { s: MeldingStatus; op: number; door: string; hoe: StatusHoe; tot?: number; beveiliging?: boolean; opgeruimd?: boolean };
export type StatusStand = { versie: 1; items: Record<string, StatusItem>; bewaarDagen: number; bijgewerkt: number };

export const STANDAARD_BEWAARDAGEN = 30;
export const BEWAARDAGEN_KEUZES = [7, 14, 30, 90, 365] as const;
export const STATUS_MAX = 3000;
export const MAX_UITSTEL_MS = 30 * 86400_000;
const DAG = 86400_000;
const ID = /^[\w:.@|-]{1,160}$/;

export const legeStatus = (): StatusStand => ({ versie: 1, items: {}, bewaarDagen: STANDAARD_BEWAARDAGEN, bijgewerkt: 0 });
export const geldigeId = (v: unknown): v is string => typeof v === 'string' && ID.test(v);
export const normaliseerBewaarDagen = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 1 && n <= 3650 ? n : STANDAARD_BEWAARDAGEN; };

function normItem(v: unknown, nu: number): StatusItem | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!MELDING_STATUSSEN.includes(o.s as MeldingStatus)) return null;
  const op = Number(o.op); const tot = Number(o.tot);
  const it: StatusItem = { s: o.s as MeldingStatus, op: Number.isFinite(op) && op > 0 ? Math.min(op, nu) : nu, door: typeof o.door === 'string' ? o.door.slice(0, 80) : '', hoe: (['kaart', 'bulk', 'automatisch'] as const).includes(o.hoe as StatusHoe) ? (o.hoe as StatusHoe) : 'kaart' };
  if (it.s === 'uitgesteld') { if (!Number.isFinite(tot) || tot <= 0) return null; it.tot = Math.min(tot, it.op + MAX_UITSTEL_MS); }
  if (o.beveiliging === true) it.beveiliging = true; else if (o.beveiliging === false) it.beveiliging = false;
  if (o.opgeruimd === true && it.s === 'archief' && it.beveiliging === false) it.opgeruimd = true;
  return it;
}
/** Strikt: wat uit de opslag komt. Te veel records → eerst de oudste «gelezen», dan de oudste andere (nooit beveiliging). */
export function normaliseerStatus(raw: unknown, nu = Date.now()): StatusStand {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const items: Record<string, StatusItem> = {};
  const bron = r.items && typeof r.items === 'object' ? (r.items as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(bron)) { if (!geldigeId(k)) continue; const it = normItem(v, nu); if (it) items[k] = it; }
  const bw = Number(r.bijgewerkt);
  return begrens({ versie: 1, items, bewaarDagen: normaliseerBewaarDagen(r.bewaarDagen), bijgewerkt: Number.isFinite(bw) && bw > 0 ? bw : 0 });
}
function begrens(st: StatusStand): StatusStand {
  const e = Object.entries(st.items);
  if (e.length <= STATUS_MAX) return st;
  const rang = ([, v]: [string, StatusItem]) => (v.beveiliging ? 3 : v.s === 'gelezen' ? 0 : v.opgeruimd ? 1 : 2);
  e.sort((a, b) => rang(a) - rang(b) || a[1].op - b[1].op);
  return { ...st, items: Object.fromEntries(e.slice(e.length - STATUS_MAX)) };
}

export type StatusWijziging = { ids: string[]; status: MeldingStatus | 'nieuw'; hoe: StatusHoe; tot?: number; beveiliging?: string[] };
/** Zet één status voor ALLE meegegeven ids (groep ×N of selectie). 'nieuw' = record weg (terug naar нове). */
export function zetStatus(st: StatusStand, w: StatusWijziging, door: string, nu = Date.now()): StatusStand {
  const items = { ...st.items };
  const bev = new Set((w.beveiliging || []).filter(geldigeId));
  for (const id of [...new Set(w.ids)].filter(geldigeId).slice(0, 1000)) {
    if (w.status === 'nieuw') { delete items[id]; continue; }
    const it: StatusItem = { s: w.status, op: nu, door: door.slice(0, 80), hoe: w.hoe, beveiliging: bev.has(id) || items[id]?.beveiliging === true ? true : w.beveiliging ? false : items[id]?.beveiliging };
    if (it.beveiliging === undefined) delete it.beveiliging;
    if (w.status === 'uitgesteld') { const tot = Number(w.tot); if (!Number.isFinite(tot) || tot <= nu) continue; it.tot = Math.min(tot, nu + MAX_UITSTEL_MS); }
    items[id] = it;
  }
  return begrens({ ...st, items, bijgewerkt: nu });
}

/** Automatisch opschonen. Geeft de nieuwe stand en wat er gebeurde (voor de journal/test). */
export function opschonen(st: StatusStand, nu = Date.now()): { stand: StatusStand; gearchiveerd: number; opgeruimd: number } {
  const termijn = st.bewaarDagen * DAG;
  let gearchiveerd = 0, opgeruimd = 0;
  const items: Record<string, StatusItem> = {};
  for (const [k, v] of Object.entries(st.items)) {
    if (v.s === 'opgelost' && nu - v.op >= termijn) { items[k] = { ...v, s: 'archief', op: nu, hoe: 'automatisch', door: v.door }; gearchiveerd++; continue; }
    // Alleen als de bron uitdrukkelijk zegt «geen beveiliging» (onbekend = veilig: blijft in het archief).
    if (v.s === 'archief' && !v.opgeruimd && v.beveiliging === false && nu - v.op >= termijn) { items[k] = { ...v, opgeruimd: true }; opgeruimd++; continue; }
    items[k] = v;
  }
  return { stand: gearchiveerd || opgeruimd ? { ...st, items, bijgewerkt: nu } : st, gearchiveerd, opgeruimd };
}

/** Status op de meldingen toepassen (vóór groeperen). */
export function pasStatusToe(ms: readonly V2Melding[], st: StatusStand, nu = Date.now()): V2Melding[] {
  return ms.map((m) => {
    const it = st.items[m.id];
    if (!it) return m;
    if (it.s === 'gelezen') return { ...m, gelezen: true };
    if (it.s === 'uitgesteld') return (it.tot || 0) > nu ? { ...m, gelezen: true, uitgesteldTot: it.tot } : { ...m, gelezen: false, terugOp: it.tot };
    // INTEG-001: een uitdrukkelijk «вирішено»/«очищено» is nooit meer alleen «proces klaar» (afgerond).
    return { ...m, gelezen: true, toestand: it.s, opgeruimd: it.opgeruimd || undefined, afgerond: undefined };
  });
}

// ── Tabs: tellers ZIJN de lijstlengtes (één functie voor beide). ──
export type Tab = 'belangrijk' | 'alle' | 'ongelezen' | 'opgelost' | 'archief';
export const TABS: readonly Tab[] = ['belangrijk', 'alle', 'ongelezen', 'opgelost', 'archief'];
export type Verborgen = { reden: 'regel-uit' | 'regel-stil' | 'stil-standaard'; };
/** Waarom een groep niet in de gewone tabs staat (regel «Вимкнене»/«Тихе» of standaard-stil succes), of null. */
export function verborgenReden(g: V2Groep): Verborgen['reden'] | null {
  if (g.levering.beschermd) return null;
  if (!g.levering.centrum) return 'regel-uit';
  if (g.levering.modus === 'stil') return g.levering.gedempt === 'regel' ? 'regel-stil' : 'stil-standaard';
  return null;
}
export const isUitgesteld = (g: V2Groep, nu: number) => (g.hoofd.uitgesteldTot || 0) > nu;
const sorteerTijd = (g: V2Groep) => Math.max(g.hoofd.tijd, ...g.leden.map((x) => x.terugOp || 0));
export function tabLijst(groepen: readonly V2Groep[], tab: Tab, nu: number, o: { toonVerborgen?: boolean } = {}): V2Groep[] {
  const l = groepen.filter((g) => {
    if (isUitgesteld(g, nu) || g.hoofd.opgeruimd) return false;
    if (!o.toonVerborgen && verborgenReden(g)) return false;
    if (tab === 'archief') return g.toestand === 'archief';
    if (g.toestand === 'archief') return false;
    if (tab === 'opgelost') return g.toestand === 'opgelost';
    if (tab === 'alle') return true;
    if (g.toestand === 'opgelost') return false;
    if (tab === 'ongelezen') return g.ongelezen > 0;
    return vraagtAandacht(g) || g.levering.modus === 'prioriteit';
  });
  return l.sort((a, b) => sorteerTijd(b) - sorteerTijd(a));
}
export function tabTellers(groepen: readonly V2Groep[], nu: number, o: { toonVerborgen?: boolean } = {}): Record<Tab, number> {
  return Object.fromEntries(TABS.map((t) => [t, tabLijst(groepen, t, nu, o).length])) as Record<Tab, number>;
}
export function verborgenTelling(groepen: readonly V2Groep[], nu: number): { totaal: number; regel: number; stil: number } {
  let regel = 0, stil = 0;
  for (const g of groepen) { if (isUitgesteld(g, nu) || g.toestand === 'archief') continue; const r = verborgenReden(g); if (r === 'stil-standaard') stil++; else if (r) regel++; }
  return { totaal: regel + stil, regel, stil };
}

// ── Geschiedenis: filters + export (zonder geheimen). ──
export type HistorieFilters = Filters & { ernst?: Ernst[]; soort?: string[] };
/** `typeVan`: sleutel voor het filter «Тип» (in de browser: het meldingstype uit shared/melding-soorten, met mensennaam). */
export function historieLijst(ms: readonly V2Melding[], f: HistorieFilters, typeVan: (m: V2Melding) => string = (m) => m.categorie || m.soort || ''): V2Melding[] {
  const q = (f.zoek || '').trim().toLowerCase();
  return ms.filter((m) =>
    (!f.dienst?.length || f.dienst.includes(m.dienst)) && (!f.ernst?.length || f.ernst.includes(m.ernst)) &&
    (!f.soort?.length || f.soort.includes(typeVan(m))) && (!f.vanaf || m.tijd >= f.vanaf) && (!f.tot || m.tijd <= f.tot) &&
    (!q || `${m.titel} ${m.tekst || ''} ${m.dienst} ${m.aanbieder || ''} ${m.accountLabel || ''} ${m.soort || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => b.tijd - a.tijd);
}
/** Geheimen eruit: tokens, codes, wachtwoorden, sleutels, query-strings. Technische tekst en links gaan nooit mee. */
export function zonderGeheimen(s: string): string {
  return s
    .replace(/(?<![\p{L}\d_])(Bearer|token|wachtwoord|password|пароль|secret|geheim|api[_-]?key|sleutel|code|код|ключ)\s*[:=]\s*\S+/giu, '$1: [приховано]')
    .replace(/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{5,}\b/g, '[приховано]')
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|xox[abp]-[\w-]{10,}|AKIA[0-9A-Z]{16})\b/g, '[приховано]')
    .replace(/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, '[приховано]')
    .replace(/(https?:\/\/[^\s?#]+)[?#]\S*/g, '$1');
}
export type ExportRij = { id: string; tijd: string; dienst: string; aanbieder: string; soort: string; ernst: Ernst; titel: string; tekst: string; status: string; statusOp: string; statusHoe: string };
export function exportRijen(ms: readonly V2Melding[], st: StatusStand): ExportRij[] {
  return ms.map((m) => { const it = st.items[m.id];
    return { id: m.id, tijd: new Date(m.tijd).toISOString(), dienst: m.dienst, aanbieder: m.aanbieder || '', soort: m.categorie || m.soort || '', ernst: m.ernst, titel: zonderGeheimen(m.titel), tekst: zonderGeheimen(m.tekst || ''), status: it ? (it.opgeruimd ? 'opgeruimd' : it.s) : m.gelezen ? 'gelezen' : 'nieuw', statusOp: it ? new Date(it.op).toISOString() : '', statusHoe: it?.hoe || '' }; });
}
export function naarCsv(rijen: readonly ExportRij[]): string {
  const kol: (keyof ExportRij)[] = ['id', 'tijd', 'dienst', 'aanbieder', 'soort', 'ernst', 'titel', 'tekst', 'status', 'statusOp', 'statusHoe'];
  const cel = (v: string) => { const s = /^[=+\-@]/.test(v) ? `'${v}` : v; return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '\uFEFF' + [kol.join(','), ...rijen.map((r) => kol.map((k) => cel(String(r[k]))).join(','))].join('\n');
}
