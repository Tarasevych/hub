// Agenda v3 — pure rekenhulp (geen React, geen netwerk), zodat alles los te toetsen is (tests/eenheid/agenda-v3-tijd.test.ts).
// Tijden: een afspraak met tijd komt als ISO-moment met zone; wij tonen haar in de TIJD VAN DE BROWSER (zoals de oude agenda).
// Op een dag met zomer-/wintertijdwissel rekenen wij met de wandklok (uur × 60 + minuut), zodat 09:00 altijd op de 09:00-lijn staat.
import { isoDag, opDag, sorteerItems, type AgendaItem, type AgendaWeergave, WEERGAVEN } from '../../../shared/agenda-model';

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const twee = (n: number) => String(n).padStart(2, '0');
/** Plaatselijke kalenderdag (browsertijd) van een Date. */
export const plaatselijkeDag = (d: Date) => `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())}`;
export const vandaagPlaatselijk = () => plaatselijkeDag(new Date());
/** ZOEKDIEP-001: de plaatselijke dag waarop een afspraak begint (hele dag: de datum zelf, nooit verschoven door de tijdzone). */
export function dagVanItem(item: Pick<AgendaItem, 'begin' | 'heleDag'>): string {
  const b = String(item.begin || '');
  if (item.heleDag || DATUM.test(b)) return b.slice(0, 10);
  const d = new Date(b);
  return Number.isNaN(d.getTime()) ? '' : plaatselijkeDag(d);
}

/** Valt de afspraak (deels) op deze plaatselijke dag? Hele dagen zoals het model het zegt (inclusief einde). */
export function opPlaatselijkeDag(item: Pick<AgendaItem, 'begin' | 'einde' | 'heleDag'>, dag: string): boolean {
  if (!DATUM.test(dag)) return false;
  if (item.heleDag || DATUM.test(item.begin)) return opDag(item, dag);
  const b = new Date(item.begin), e = new Date(item.einde || item.begin);
  if (Number.isNaN(b.getTime())) return opDag(item, dag);
  const eind = Number.isNaN(e.getTime()) || e < b ? b : e;
  const [j, m, d] = dag.split('-').map(Number);
  const dagBegin = new Date(j, m - 1, d, 0, 0, 0, 0), dagEinde = new Date(j, m - 1, d + 1, 0, 0, 0, 0);
  if (+eind === +b) return b >= dagBegin && b < dagEinde;
  return b < dagEinde && eind > dagBegin;
}
export const itemsOpDag = (items: readonly AgendaItem[], dag: string) => sorteerItems(items.filter((i) => opPlaatselijkeDag(i, dag)));

/** Wandklokminuten (0…1440) van een moment binnen een plaatselijke dag; ervoor = 0, erna = 1440. */
export function wandMinuten(moment: Date, dag: string): number {
  const eigen = plaatselijkeDag(moment);
  if (eigen < dag) return 0;
  if (eigen > dag) return 1440;
  return moment.getHours() * 60 + moment.getMinutes();
}

export type Tijdblok = { item: AgendaItem; boven: number; hoogte: number; baan: number; banen: number; beginMin: number; eindMin: number };
/**
 * Blokken voor het uurraster van één dag: boven/hoogte in minuten (0…1440), en banen naast elkaar bij overlap.
 * Minimaal 20 minuten hoog zodat een korte afspraak leesbaar en aanklikbaar blijft.
 */
export function tijdblokken(items: readonly AgendaItem[], dag: string): Tijdblok[] {
  const met = items.filter((i) => !i.heleDag && !DATUM.test(i.begin) && opPlaatselijkeDag(i, dag)).map((item) => {
    const b = new Date(item.begin), e = new Date(item.einde || item.begin);
    const beginMin = wandMinuten(b, dag);
    const eindMin = Math.max(beginMin, Number.isNaN(e.getTime()) ? beginMin + 30 : wandMinuten(e, dag));
    return { item, beginMin, eindMin, boven: beginMin, hoogte: Math.max(20, eindMin - beginMin), baan: 0, banen: 1 };
  }).sort((a, b) => a.beginMin - b.beginMin || b.eindMin - a.eindMin);
  // Groepen van elkaar overlappende afspraken; binnen een groep de eerste vrije baan.
  let groep: Tijdblok[] = []; let groepEinde = -1;
  const sluit = () => { const n = Math.max(1, ...groep.map((g) => g.baan + 1)); groep.forEach((g) => { g.banen = n; }); groep = []; };
  for (const blok of met) {
    const eind = blok.boven + blok.hoogte;
    if (groep.length && blok.boven >= groepEinde) sluit();
    const bezet = new Set(groep.filter((g) => g.boven + g.hoogte > blok.boven).map((g) => g.baan));
    let baan = 0; while (bezet.has(baan)) baan++;
    blok.baan = baan; groep.push(blok); groepEinde = Math.max(groepEinde, eind);
  }
  if (groep.length) sluit();
  return met;
}
export const heleDagItems = (items: readonly AgendaItem[], dag: string) => items.filter((i) => (i.heleDag || DATUM.test(i.begin)) && opDag(i, dag));

/** Zoeken in wat er geladen is: titel, plaats en agendanaam; hoofdletters en accenten tellen niet. */
const plat = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
export function filterItems(items: readonly AgendaItem[], zoek: string, verborgen: ReadonlySet<string>): AgendaItem[] {
  const z = plat(zoek.trim());
  return items.filter((i) => !verborgen.has(agendaSleutel(i)) && (!z || plat(`${i.titel} ${i.locatie} ${i.agendaNaam}`).includes(z)));
}
/** Eén sleutel per agenda in de lijst links (Google per agenda-id, ICS/CalDAV per bron + naam). */
export const agendaSleutel = (i: Pick<AgendaItem, 'bron' | 'agendaId' | 'agendaNaam'>) => (i.bron === 'google' ? `google:${i.agendaId}` : `${i.bron}:${i.agendaId || i.agendaNaam}`);

/** Vaste, rustige kleuren als de agenda zelf geen kleur geeft (kleur is nooit het enige teken: de naam staat er altijd bij). */
export const PALET = ['#167a70', '#6d5bd0', '#b7642c', '#2f6db3', '#a23b72', '#5b7f2a'];
export function kleurVoor(sleutel: string, eigen = ''): string {
  if (/^#[0-9a-f]{6}$/i.test(eigen)) return eigen;
  let h = 0; for (const c of sleutel) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALET[h % PALET.length];
}

// ------------------------------------------------------------------ weergave en datum in de adresregel
export type AgendaStand = { weergave: AgendaWeergave; datum: string };
export function leesAdres(zoekdeel: string, smal: boolean, vandaag = vandaagPlaatselijk()): AgendaStand {
  const p = new URLSearchParams(zoekdeel);
  const w = p.get('weergave'), d = p.get('datum') || '';
  const weergave = WEERGAVEN.includes(w as AgendaWeergave) ? (w as AgendaWeergave) : (smal ? 'dag' : 'maand');
  const geldig = DATUM.test(d) && !Number.isNaN(new Date(`${d}T12:00:00Z`).getTime()) && isoDag(new Date(`${d}T12:00:00Z`)) === d;
  return { weergave, datum: geldig ? d : vandaag };
}
export function schrijfAdres(zoekdeel: string, stand: AgendaStand): string {
  const p = new URLSearchParams(zoekdeel);
  p.set('weergave', stand.weergave); p.set('datum', stand.datum);
  return `?${p.toString()}`;
}
/** Een stap vooruit/achteruit in de huidige weergave. */
export function verschuif(stand: AgendaStand, richting: number): string {
  const d = new Date(`${stand.datum}T12:00:00Z`);
  if (stand.weergave === 'maand') { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + richting); return isoDag(d); }
  d.setUTCDate(d.getUTCDate() + richting * (stand.weergave === 'week' ? 7 : stand.weergave === 'lijst' ? 7 : 1));
  return isoDag(d);
}
export const plusDagen = (dag: string, n: number) => { const d = new Date(`${dag}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return isoDag(d); };
