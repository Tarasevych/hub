// Notities vNext (28.10.2026, hub.tarasevych.com/notities, migratie 0127): het DOMEINMODEL van een notitie, los van het bord.
//
// Wat hier staat draait in de browser (src/notities/*), op de server (backend/notities-vnext.ts) en in de test
// (tests/eenheid/notities-vnext-20261028.test.ts), zodat alle drie dezelfde grenzen hanteren:
//   • grenzen (titel 300, inhoud 200 000 tekens, 24 etiketten van hoogstens 40 tekens, mapnaam 80);
//   • etiketten: vrije tekst (ook Oekraïens), kleine letters, zonder spaties;
//   • checklist-regels «- [ ] …» / «- [x] …» — dezelfde vorm als de oude notities, dus die blijven leesbaar;
//   • een KLEINE, VEILIGE Markdown-weergave: alles wordt eerst ontsnapt, er komt nooit ruwe HTML door, koppelingen alleen https;
//   • de SPIEGEL naar het oude bord (app.mcp_console_items): titel ≤ 160, tekst ≤ 4000 en ≤ 8 etiketten op /^[a-z0-9:_-]{1,32}$/,
//     met de systeem-etiketten hub / soort:… / kleur:… / vast / archief. Zo blijft manage_hub_notes werken en kan een oudere
//     release na terugdraaien de notities gewoon lezen;
//   • de parser van de import (Markdown, tekst, JSON-export van deze pagina) met een voorbeeld en dubbelen vooraf;
//   • de catalogus van bronnen met de EERLIJKE stand (04_Specification/МАТРИЦЯ_ІНТЕГРАЦІЙ.md): 'beschikbaar' alleen wat
//     deze release werkelijk doet, 'alleen-invoer' voor een bevestigde bestandsweg, 'beperkt', 'gepland'. Nooit een knop die
//     niets doet.
import { KLEUREN, SOORT_IDS, HUB_ETIKET, VAST_ETIKET, type NotitieKleur, type NotitieSoort, type Tweetalig } from './notities-model';

export { KLEUREN, SOORT_IDS, type NotitieKleur, type NotitieSoort, type Tweetalig };

// ------------------------------------------------------------------------------- grenzen
export const VN_MAX_TITEL = 300;
export const VN_MAX_INHOUD = 200_000;
export const VN_MAX_ETIKETTEN = 24;
export const VN_MAX_ETIKET_LENGTE = 40;
export const VN_MAX_MAPNAAM = 80;
export const VN_MAX_MAPPEN = 60;
export const VN_LIJST_LIMIET = 60;
export const VN_LIJST_MAX = 200;
export const VN_REVISIES_PER_NOTITIE = 50;
export const VN_IMPORT_MAX_BESTANDEN = 200;
export const VN_IMPORT_MAX_BYTES = 4_000_000;
export const VN_PRULLENBAK_DAGEN = 30;
export const VN_SCHEMA = 'notities-vnext/1';

/** Spiegelgrenzen van het oude bord (backend/mcp-console.ts → schoneTags, addItem, editItem). */
export const SPIEGEL_MAX_TITEL = 160;
export const SPIEGEL_MAX_TEKST = 4000;
export const SPIEGEL_MAX_ETIKETTEN = 8;
export const SPIEGEL_ETIKET = /^[a-z0-9][a-z0-9:_-]{0,31}$/;
export const ARCHIEF_ETIKET = 'archief';

export type Weergave = 'alle' | 'vandaag' | 'vast' | 'lijsten' | 'archief' | 'prullenbak';
export const WEERGAVEN: readonly Weergave[] = Object.freeze(['alle', 'vandaag', 'vast', 'lijsten', 'archief', 'prullenbak']);
export const WEERGAVE_LABEL: Record<Weergave, Tweetalig> = Object.freeze({
  alle: ['Усі нотатки', 'Alle notities'], vandaag: ['Сьогодні', 'Vandaag'], vast: ['Закріплені', 'Vastgezet'],
  lijsten: ['Чеклісти', 'Checklists'], archief: ['Архів', 'Archief'], prullenbak: ['Кошик', 'Prullenbak'],
});

export type Notitie = {
  id: string;
  titel: string;
  inhoud: string;
  soort: NotitieSoort;
  kleur: NotitieKleur;
  etiketten: string[];
  mapId: string | null;
  vast: boolean;
  gearchiveerdOp: string | null;
  verwijderdOp: string | null;
  auteur: string;
  herkomst: Record<string, unknown>;
  versie: number;
  aangemaaktOp: string;
  gewijzigdOp: string;
};
export type NotitieMap = { id: string; naam: string; kleur: NotitieKleur; volgorde: number; aantal: number };
export type NotitieRevisie = { id: string; versie: number; titel: string; inhoud: string; soort: NotitieSoort; kleur: NotitieKleur; etiketten: string[]; reden: string; aangemaaktOp: string };

/** Wat de gebruiker (of de import) van een notitie kan instellen. */
export type NotitieInvoer = {
  titel: string; inhoud: string; soort: NotitieSoort; kleur: NotitieKleur; etiketten: string[]; mapId: string | null; vast: boolean;
};
export const legeInvoer = (): NotitieInvoer => ({ titel: '', inhoud: '', soort: 'tekst', kleur: 'geen', etiketten: [], mapId: null, vast: false });

// ------------------------------------------------------------------------------- etiketten
/** Eén etiket opschonen: kleine letters, spaties → «-», alleen letters/cijfers (ook Cyrillisch), «-», «_», «:». Leeg = niet bruikbaar. */
export function vnSchoonEtiket(raw: unknown): string {
  const basis = String(raw ?? '').normalize('NFC').trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}:_-]/gu, '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/-{2,}/g, '-').slice(0, VN_MAX_ETIKET_LENGTE);
  if (!basis) return '';
  if (basis === HUB_ETIKET || basis === VAST_ETIKET || basis === ARCHIEF_ETIKET || basis.startsWith('soort:') || basis.startsWith('kleur:')) return '';
  return basis;
}
export function vnEtiketten(raw: unknown): string[] {
  const uit: string[] = [];
  for (const e of Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[,\n]/) : []) {
    const s = vnSchoonEtiket(e);
    if (s && !uit.includes(s) && uit.length < VN_MAX_ETIKETTEN) uit.push(s);
  }
  return uit;
}

// ------------------------------------------------------------------------------- invoer controleren
export type InvoerFout = 'TITEL_ONGELDIG' | 'INHOUD_TE_LANG' | 'SOORT_ONGELDIG' | 'KLEUR_ONGELDIG' | 'MAP_ONGELDIG';
/** Volledige invoer opschonen; geeft de schone invoer of een foutcode. Een lege titel krijgt de eerste regel van de inhoud. */
export function schoneInvoer(raw: unknown): { ok: true; invoer: NotitieInvoer } | { ok: false; fout: InvoerFout } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const inhoud = String(r.inhoud ?? '').replace(/\r\n?/g, '\n');
  if (inhoud.length > VN_MAX_INHOUD) return { ok: false, fout: 'INHOUD_TE_LANG' };
  let titel = String(r.titel ?? '').replace(/\s+/g, ' ').trim();
  if (!titel) titel = titelUitInhoud(inhoud);
  if (!titel || titel.length > VN_MAX_TITEL) return { ok: false, fout: 'TITEL_ONGELDIG' };
  const soort = r.soort === undefined ? 'tekst' : r.soort;
  if (!(SOORT_IDS as readonly unknown[]).includes(soort)) return { ok: false, fout: 'SOORT_ONGELDIG' };
  const kleur = r.kleur === undefined ? 'geen' : r.kleur;
  if (!(KLEUREN as readonly unknown[]).includes(kleur)) return { ok: false, fout: 'KLEUR_ONGELDIG' };
  const mapId = r.mapId === undefined || r.mapId === null || r.mapId === '' ? null : String(r.mapId);
  if (mapId !== null && !/^[0-9a-f-]{36}$/i.test(mapId)) return { ok: false, fout: 'MAP_ONGELDIG' };
  return { ok: true, invoer: { titel, inhoud, soort: soort as NotitieSoort, kleur: kleur as NotitieKleur, etiketten: vnEtiketten(r.etiketten), mapId, vast: r.vast === true } };
}
/** De eerste zinvolle regel als titel (zonder Markdown-tekens), hoogstens 120 tekens. */
export function titelUitInhoud(inhoud: string): string {
  for (const regel of String(inhoud ?? '').split('\n')) {
    const schoon = regel.replace(/^\s*(#{1,6}\s+|[-*+]\s+(\[[ xX]\]\s*)?|\d+[.)]\s+|>\s+)/, '').replace(/[*_`~]/g, '').trim();
    if (schoon) return schoon.slice(0, 120);
  }
  return '';
}

// ------------------------------------------------------------------------------- platte tekst (zoeken, spiegel, voorbeeld)
/** Markdown → gewone tekst: koppen, lijsttekens, opmaak en koppelingen eruit; de woorden blijven. */
export function platteTekst(md: string): string {
  return String(md ?? '')
    .replace(/```[\s\S]*?```/g, (b) => b.replace(/```[^\n]*\n?/g, ''))
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1 $2')
    .replace(/[*_~`]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ------------------------------------------------------------------------------- checklist
export type LijstRegel = { af: boolean; tekst: string; regel: number };
/** Alle «- [ ]»/«- [x]»-regels met hun regelnummer, zodat één vinkje precies die regel in de inhoud omzet. */
export function lijstRegels(inhoud: string): LijstRegel[] {
  const uit: LijstRegel[] = [];
  String(inhoud ?? '').split('\n').forEach((regel, i) => {
    const t = /^\s*[-*+]\s*\[( |x|X)\]\s?(.*)$/.exec(regel);
    if (t && t[2].trim()) uit.push({ af: t[1].toLowerCase() === 'x', tekst: t[2].trim(), regel: i });
  });
  return uit;
}
export function lijstRegelOmzetten(inhoud: string, regel: number): string {
  const regels = String(inhoud ?? '').split('\n');
  if (regel < 0 || regel >= regels.length) return inhoud;
  regels[regel] = regels[regel].replace(/^(\s*[-*+]\s*)\[( |x|X)\]/, (_m, p: string, v: string) => `${p}[${v === ' ' ? 'x' : ' '}]`);
  return regels.join('\n');
}
/** Losse regels (één punt per regel, zonder vinkjes) → checklist. Regels die al een vinkje hebben blijven zoals ze zijn. */
export function naarChecklist(inhoud: string): string {
  return String(inhoud ?? '').split('\n').map((r) => (!r.trim() || /^\s*[-*+]\s*\[[ xX]\]/.test(r) ? r : `- [ ] ${r.replace(/^\s*[-*+]\s+/, '').trim()}`)).join('\n');
}
export const lijstVoortgang = (inhoud: string) => { const r = lijstRegels(inhoud); return { af: r.filter((x) => x.af).length, totaal: r.length }; };

// ------------------------------------------------------------------------------- koppelingen
export function vnVeiligeKoppeling(raw: unknown): string {
  const w = String(raw ?? '').trim();
  if (!w || /[\s<>"']/.test(w)) return '';
  try { const u = new URL(w); return u.protocol === 'https:' ? u.toString() : ''; } catch { return ''; }
}
export function vnKoppelingen(inhoud: string): string[] {
  const uit: string[] = [];
  for (const stuk of String(inhoud ?? '').split(/[\s()<>"']+/)) { const v = vnVeiligeKoppeling(stuk); if (v && !uit.includes(v)) uit.push(v); }
  return uit.slice(0, 20);
}

// ------------------------------------------------------------------------------- veilige Markdown-weergave
const ontsnap = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** Opmaak binnen een regel: code, vet, cursief, doorgestreept, koppelingen (alleen https) en losse https-adressen. */
function regelOpmaak(tekst: string): string {
  const stukken: string[] = [];
  // Code eerst apart, zodat sterretjes daarbinnen met rust gelaten worden.
  const zonderCode = tekst.replace(/`([^`\n]+)`/g, (_m, c: string) => { stukken.push(`<code>${ontsnap(c)}</code>`); return `\u0000${stukken.length - 1}\u0000`; });
  let h = ontsnap(zonderCode);
  h = h.replace(/\[([^\]]{1,200})\]\((https?:\/\/[^)\s]{1,2000})\)/g, (_m, t: string, u: string) => {
    const v = vnVeiligeKoppeling(u.replace(/&amp;/g, '&'));
    return v ? `<a href="${ontsnap(v)}" target="_blank" rel="noopener noreferrer">${t}</a>` : t;
  });
  h = h.replace(/(^|[\s(])(https:\/\/[^\s<)]{3,2000})/g, (_m, p: string, u: string) => {
    const v = vnVeiligeKoppeling(u.replace(/&amp;/g, '&').replace(/[.,;:!?]+$/, ''));
    return v ? `${p}<a href="${ontsnap(v)}" target="_blank" rel="noopener noreferrer">${ontsnap(v)}</a>` : `${p}${u}`;
  });
  h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  h = h.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  return h.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => stukken[Number(i)] ?? '');
}
/**
 * Markdown → HTML, ALTIJD veilig: elk teken wordt ontsnapt vóór er opmaak op komt; ruwe HTML in de notitie verschijnt als
 * tekst; alleen https-koppelingen worden klikbaar. Koppen, lijsten, checklists (met data-regel voor het vinkje), citaten,
 * codeblokken, horizontale lijnen, alinea's. Klein genoeg om te toetsen, groot genoeg voor een notitie.
 */
export function markdownNaarHtml(md: string): string {
  const regels = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const uit: string[] = [];
  let i = 0;
  let lijst: { soort: 'ul' | 'ol' | 'check'; items: string[] } | null = null;
  const sluitLijst = () => {
    if (!lijst) return;
    const tag = lijst.soort === 'ol' ? 'ol' : 'ul';
    uit.push(`<${tag}${lijst.soort === 'check' ? ' class="vn-checklist"' : ''}>${lijst.items.join('')}</${tag}>`);
    lijst = null;
  };
  let alinea: string[] = [];
  const sluitAlinea = () => { if (alinea.length) { uit.push(`<p>${alinea.map(regelOpmaak).join('<br>')}</p>`); alinea = []; } };
  while (i < regels.length) {
    const regel = regels[i];
    const code = /^\s{0,3}```\s*([\w+-]*)\s*$/.exec(regel);
    if (code) {
      sluitAlinea(); sluitLijst();
      const buf: string[] = []; i++;
      while (i < regels.length && !/^\s{0,3}```\s*$/.test(regels[i])) { buf.push(regels[i]); i++; }
      i++;
      const taal = /^[\w+-]{1,20}$/.test(code[1]) ? ` data-taal="${ontsnap(code[1])}"` : '';
      uit.push(`<pre${taal}><code>${ontsnap(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (!regel.trim()) { sluitAlinea(); sluitLijst(); i++; continue; }
    const kop = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(regel);
    if (kop) { sluitAlinea(); sluitLijst(); const n = Math.min(6, kop[1].length + 1); uit.push(`<h${n}>${regelOpmaak(kop[2])}</h${n}>`); i++; continue; }
    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(regel)) { sluitAlinea(); sluitLijst(); uit.push('<hr>'); i++; continue; }
    const check = /^\s*[-*+]\s*\[( |x|X)\]\s?(.*)$/.exec(regel);
    if (check) {
      sluitAlinea();
      if (!lijst || lijst.soort !== 'check') { sluitLijst(); lijst = { soort: 'check', items: [] }; }
      const af = check[1].toLowerCase() === 'x';
      lijst.items.push(`<li class="${af ? 'is-af' : ''}" data-regel="${i}"><input type="checkbox" ${af ? 'checked ' : ''}data-regel="${i}" aria-label="${ontsnap(check[2].trim())}"><span>${regelOpmaak(check[2].trim())}</span></li>`);
      i++; continue;
    }
    const punt = /^\s*[-*+]\s+(.+)$/.exec(regel);
    if (punt) { sluitAlinea(); if (!lijst || lijst.soort !== 'ul') { sluitLijst(); lijst = { soort: 'ul', items: [] }; } lijst.items.push(`<li>${regelOpmaak(punt[1])}</li>`); i++; continue; }
    const nummer = /^\s*\d+[.)]\s+(.+)$/.exec(regel);
    if (nummer) { sluitAlinea(); if (!lijst || lijst.soort !== 'ol') { sluitLijst(); lijst = { soort: 'ol', items: [] }; } lijst.items.push(`<li>${regelOpmaak(nummer[1])}</li>`); i++; continue; }
    const citaat = /^\s*>\s?(.*)$/.exec(regel);
    if (citaat) { sluitAlinea(); sluitLijst(); const buf = [citaat[1]]; i++; while (i < regels.length && /^\s*>\s?/.test(regels[i])) { buf.push(regels[i].replace(/^\s*>\s?/, '')); i++; } uit.push(`<blockquote><p>${buf.map(regelOpmaak).join('<br>')}</p></blockquote>`); continue; }
    sluitLijst();
    alinea.push(regel);
    i++;
  }
  sluitAlinea(); sluitLijst();
  return uit.join('\n');
}

// ------------------------------------------------------------------------------- spiegel naar het oude bord
/**
 * De etiketten van de spiegelrij in app.mcp_console_items, in de volgorde die de oude pagina (shared/notities-model.ts →
 * vormUitEtiketten) verwacht: hub, soort:…, kleur:…, vast, archief, en dan zoveel vrije etiketten als er nog passen EN die
 * aan de oude regel voldoen. Oekraïense etiketten passen niet in de oude regel en blijven dus alleen in app.notities.
 */
export function spiegelEtiketten(n: Pick<Notitie, 'soort' | 'kleur' | 'etiketten' | 'vast' | 'gearchiveerdOp'>): string[] {
  const uit = [HUB_ETIKET];
  if (n.soort !== 'tekst') uit.push(`soort:${n.soort}`);
  if (n.kleur !== 'geen') uit.push(`kleur:${n.kleur}`);
  if (n.vast) uit.push(VAST_ETIKET);
  if (n.gearchiveerdOp) uit.push(ARCHIEF_ETIKET);
  for (const e of n.etiketten) { if (SPIEGEL_ETIKET.test(e) && !uit.includes(e) && uit.length < SPIEGEL_MAX_ETIKETTEN) uit.push(e); }
  return uit;
}
export const spiegelTitel = (titel: string) => (titel.trim() || '—').slice(0, SPIEGEL_MAX_TITEL);
export const spiegelTekst = (inhoud: string) => inhoud.slice(0, SPIEGEL_MAX_TEKST);
/** Van de oude vorm (titel, tekst, etiketten van het bord) naar de invoer van vNext. Onbekende etiketten worden vrije etiketten. */
export function invoerUitBord(title: unknown, body: unknown, tags: unknown): NotitieInvoer & { gearchiveerd: boolean } {
  const lijst = (Array.isArray(tags) ? tags : []).map((t) => String(t ?? '').toLowerCase());
  const soort = lijst.find((e) => e.startsWith('soort:'))?.slice(6) ?? '';
  const kleur = lijst.find((e) => e.startsWith('kleur:'))?.slice(6) ?? '';
  return {
    titel: String(title ?? '').slice(0, VN_MAX_TITEL),
    inhoud: String(body ?? '').slice(0, VN_MAX_INHOUD),
    soort: (SOORT_IDS as readonly string[]).includes(soort) ? (soort as NotitieSoort) : 'tekst',
    kleur: (KLEUREN as readonly string[]).includes(kleur) && kleur !== 'geen' ? (kleur as NotitieKleur) : 'geen',
    vast: lijst.includes(VAST_ETIKET),
    gearchiveerd: lijst.includes(ARCHIEF_ETIKET),
    mapId: null,
    etiketten: vnEtiketten(lijst.filter((e) => e !== HUB_ETIKET && e !== VAST_ETIKET && e !== ARCHIEF_ETIKET && !e.startsWith('soort:') && !e.startsWith('kleur:'))),
  };
}

// ------------------------------------------------------------------------------- import
export type ImportItem = { titel: string; inhoud: string; soort: NotitieSoort; kleur: NotitieKleur; etiketten: string[]; bestand: string; vingerafdruk: string };
export type ImportFout = { bestand: string; fout: 'LEEG' | 'TE_GROOT' | 'ONBEKEND_FORMAAT' | 'JSON_ONGELDIG' | 'TITEL_ONGELDIG' | 'INHOUD_TE_LANG' };
/** Een stabiele vingerafdruk van titel + inhoud (FNV-1a, 64 bit als hex): genoeg om dubbelen in één lijst te herkennen. */
export function vingerafdruk(titel: string, inhoud: string): string {
  const s = `${titel.trim().toLowerCase()}\n${inhoud.replace(/\s+/g, ' ').trim()}`;
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0; h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0; }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
function uitFrontmatter(tekst: string): { tekst: string; etiketten: string[]; titel: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(tekst);
  if (!m) return { tekst, etiketten: [], titel: '' };
  let titel = ''; let etiketten: string[] = [];
  for (const regel of m[1].split('\n')) {
    const t = /^(title|titel|назва)\s*:\s*(.+)$/i.exec(regel); if (t) titel = t[2].trim().replace(/^["']|["']$/g, '');
    const e = /^(tags|etiketten|теги)\s*:\s*(.+)$/i.exec(regel); if (e) etiketten = vnEtiketten(e[2].replace(/^\[|\]$/g, '').split(','));
  }
  return { tekst: tekst.slice(m[0].length), etiketten, titel };
}
const bestandsnaamTitel = (naam: string) => naam.replace(/^.*[\\/]/, '').replace(/\.(md|markdown|txt|json)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 120);
/**
 * Eén bestand → nul of meer notities. Markdown/tekst = één notitie (titel uit frontmatter, eerste kop of bestandsnaam);
 * JSON = de export van deze pagina of een lijst {title/titel, body/inhoud, tags/etiketten}. Nooit uitvoerbaar, nooit HTML.
 */
export function parseerImport(bestand: { naam: string; tekst: string }): { items: ImportItem[]; fouten: ImportFout[] } {
  const naam = String(bestand.naam || 'bestand');
  const tekst = String(bestand.tekst ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const ext = (naam.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '');
  // Eerst het formaat (een .png is «onbekend formaat», niet «leeg»), dan leeg, dan te groot.
  if (ext && !['md', 'markdown', 'txt', 'text', 'json'].includes(ext)) return { items: [], fouten: [{ bestand: naam, fout: 'ONBEKEND_FORMAAT' }] };
  if (!tekst.trim()) return { items: [], fouten: [{ bestand: naam, fout: 'LEEG' }] };
  if (tekst.length > VN_IMPORT_MAX_BYTES) return { items: [], fouten: [{ bestand: naam, fout: 'TE_GROOT' }] };
  const maak = (titel: string, inhoud: string, soort: NotitieSoort, kleur: NotitieKleur, etiketten: string[]): ImportItem | ImportFout => {
    const s = schoneInvoer({ titel, inhoud, soort, kleur, etiketten });
    if (!s.ok) return { bestand: naam, fout: s.fout === 'INHOUD_TE_LANG' ? 'INHOUD_TE_LANG' : 'TITEL_ONGELDIG' };
    return { titel: s.invoer.titel, inhoud: s.invoer.inhoud, soort: s.invoer.soort, kleur: s.invoer.kleur, etiketten: s.invoer.etiketten, bestand: naam, vingerafdruk: vingerafdruk(s.invoer.titel, s.invoer.inhoud) };
  };
  if (ext === 'json') {
    let data: unknown;
    try { data = JSON.parse(tekst); } catch { return { items: [], fouten: [{ bestand: naam, fout: 'JSON_ONGELDIG' }] }; }
    const lijst = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { notities?: unknown }).notities) ? (data as { notities: unknown[] }).notities
      : data && typeof data === 'object' && Array.isArray((data as { notes?: unknown }).notes) ? (data as { notes: unknown[] }).notes : null;
    if (!lijst) return { items: [], fouten: [{ bestand: naam, fout: 'JSON_ONGELDIG' }] };
    const items: ImportItem[] = []; const fouten: ImportFout[] = [];
    for (const r of lijst.slice(0, VN_IMPORT_MAX_BESTANDEN)) {
      const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      const soort = (SOORT_IDS as readonly unknown[]).includes(o.soort) ? (o.soort as NotitieSoort) : o.kind === 'checklist' ? 'lijst' : o.kind === 'code' ? 'code' : o.kind === 'link' ? 'koppeling' : 'tekst';
      const kleur = (KLEUREN as readonly unknown[]).includes(o.kleur) ? (o.kleur as NotitieKleur) : 'geen';
      let inhoud = String(o.inhoud ?? o.body ?? o.content ?? o.text ?? '');
      if (soort === 'lijst' && Array.isArray(o.items)) inhoud = (o.items as unknown[]).map((x) => { const it = (x && typeof x === 'object' ? x : { text: x }) as Record<string, unknown>; return `- [${it.done === true || it.af === true ? 'x' : ' '}] ${String(it.text ?? it.tekst ?? '')}`; }).join('\n');
      const u = maak(String(o.titel ?? o.title ?? ''), inhoud, soort, kleur, vnEtiketten(o.etiketten ?? o.tags));
      if ('fout' in u) fouten.push(u); else items.push(u);
    }
    return { items, fouten };
  }
  const fm = uitFrontmatter(tekst);
  let inhoud = fm.tekst.trim();
  let titel = fm.titel;
  const kop = /^\s{0,3}#\s+(.+?)\s*#*\s*$/m.exec(inhoud.split('\n')[0] ?? '');
  if (!titel && kop) { titel = kop[1].trim(); inhoud = inhoud.split('\n').slice(1).join('\n').trim(); }
  if (!titel) titel = bestandsnaamTitel(naam) || titelUitInhoud(inhoud);
  const regels = lijstRegels(inhoud);
  const soort: NotitieSoort = regels.length && regels.length >= inhoud.split('\n').filter((r) => r.trim()).length / 2 ? 'lijst' : 'tekst';
  const u = maak(titel, inhoud, soort, 'geen', fm.etiketten);
  return 'fout' in u ? { items: [], fouten: [u] } : { items: [u], fouten: [] };
}
/** Dubbelen aanwijzen: binnen de import zelf én tegenover de bestaande vingerafdrukken. */
export function markeerDubbelen(items: readonly ImportItem[], bestaand: ReadonlySet<string>): Array<ImportItem & { dubbel: 'bestaand' | 'in-import' | '' }> {
  const gezien = new Set<string>();
  return items.map((it) => {
    const d: 'bestaand' | 'in-import' | '' = bestaand.has(it.vingerafdruk) ? 'bestaand' : gezien.has(it.vingerafdruk) ? 'in-import' : '';
    gezien.add(it.vingerafdruk);
    return { ...it, dubbel: d };
  });
}

// ------------------------------------------------------------------------------- export
export function exportJson(notities: readonly Notitie[], mappen: readonly NotitieMap[]): string {
  const mapNaam = new Map(mappen.map((m) => [m.id, m.naam]));
  return JSON.stringify({
    schema: VN_SCHEMA, geexporteerd: new Date().toISOString(), aantal: notities.length,
    notities: notities.map((n) => ({ id: n.id, titel: n.titel, inhoud: n.inhoud, soort: n.soort, kleur: n.kleur, etiketten: n.etiketten, map: n.mapId ? mapNaam.get(n.mapId) ?? null : null, vast: n.vast, gearchiveerdOp: n.gearchiveerdOp, aangemaaktOp: n.aangemaaktOp, gewijzigdOp: n.gewijzigdOp })),
  }, null, 2);
}
export function exportMarkdown(notities: readonly Notitie[]): string {
  return notities.map((n) => `---\ntitel: ${n.titel.replace(/\n/g, ' ')}\nsoort: ${n.soort}\netiketten: [${n.etiketten.join(', ')}]\ngewijzigd: ${n.gewijzigdOp}\n---\n# ${n.titel}\n\n${n.inhoud}\n`).join('\n\n');
}

// ------------------------------------------------------------------------------- ordenen en zoeken (browser, na de server)
export function ordenVnext<T extends Pick<Notitie, 'vast' | 'gewijzigdOp' | 'aangemaaktOp'>>(rijen: readonly T[], volgorde: 'gewijzigd' | 'aangemaakt' | 'titel' = 'gewijzigd'): T[] {
  const tijd = (n: T) => Date.parse(volgorde === 'aangemaakt' ? n.aangemaaktOp : n.gewijzigdOp) || 0;
  return [...rijen].sort((a, b) => {
    if (a.vast !== b.vast) return a.vast ? -1 : 1;
    if (volgorde === 'titel') return String((a as unknown as Notitie).titel ?? '').localeCompare(String((b as unknown as Notitie).titel ?? ''));
    return tijd(b) - tijd(a);
  });
}
export function zoekWoorden(vraag: unknown): string[] {
  // Alleen kleine letters, geen «accenten strippen»: in het Oekraïens zijn й/ї eigen letters (NFD zou ze tot и/і maken).
  return String(vraag ?? '').normalize('NFC').toLowerCase().split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 1).slice(0, 8);
}
export function vnEtiketWolk(rijen: ReadonlyArray<Pick<Notitie, 'etiketten'>>): Array<{ etiket: string; aantal: number }> {
  const tel = new Map<string, number>();
  for (const n of rijen) for (const e of n.etiketten) tel.set(e, (tel.get(e) ?? 0) + 1);
  return [...tel.entries()].map(([etiket, aantal]) => ({ etiket, aantal })).sort((a, b) => (a.aantal !== b.aantal ? b.aantal - a.aantal : a.etiket.localeCompare(b.etiket)));
}

// ------------------------------------------------------------------------------- bronnen en integraties (eerlijke stand)
export type BronStand = 'beschikbaar' | 'alleen-invoer' | 'beperkt' | 'gepland';
export const BRON_STAND_LABEL: Record<BronStand, Tweetalig> = Object.freeze({
  beschikbaar: ['працює', 'werkt'], 'alleen-invoer': ['лише імпорт файлів', 'alleen bestandsimport'], beperkt: ['обмежено', 'beperkt'], gepland: ['заплановано', 'gepland'],
});
export type NotitieBron = {
  id: string; naam: string; stand: BronStand; soort: Tweetalig; uitleg: Tweetalig; wat: Tweetalig; bron: string;
  /** Welke bestandsformaten deze release voor deze bron werkelijk inleest (leeg = geen bestandsweg). */
  formaten: readonly string[];
};
export const NOTITIE_BRONNEN: readonly NotitieBron[] = Object.freeze([
  { id: 'bestanden', naam: 'Markdown / TXT / JSON', stand: 'beschikbaar', soort: ['Файли', 'Bestanden'], formaten: ['md', 'markdown', 'txt', 'json'], bron: 'https://daringfireball.net/projects/markdown/',
    uitleg: ['Імпорт файлів .md, .txt і .json (експорт цієї сторінки) з попереднім переглядом і перевіркою дублікатів; експорт у JSON та Markdown.', 'Import van .md, .txt en .json (de export van deze pagina) met voorbeeld en dubbelcontrole; export naar JSON en Markdown.'],
    wat: ['Працює в цьому випуску. Теки з Obsidian — просто перетягніть файли .md.', 'Werkt in deze release. Mappen uit Obsidian: sleep de .md-bestanden hierheen.'] },
  { id: 'obsidian', naam: 'Obsidian', stand: 'alleen-invoer', soort: ['Локальні файли .md', 'Lokale .md-bestanden'], formaten: ['md'], bron: 'https://obsidian.md',
    uitleg: ['Сховище Obsidian — це тека з файлами .md на вашому ПК. Їх можна імпортувати як файли (frontmatter із тегами розпізнається).', 'Een Obsidian-kluis is een map met .md-bestanden op uw pc. Die kunt u als bestanden importeren (frontmatter met tags wordt herkend).'],
    wat: ['Автоматичної синхронізації теки немає: потрібен агент на ПК і ваш дозвіл на теку.', 'Geen automatische mapsynchronisatie: daarvoor is een agent op de pc en uw toestemming voor de map nodig.'] },
  { id: 'apple-notes', naam: 'Apple Notes', stand: 'alleen-invoer', soort: ['Експорт із Mac', 'Export vanaf Mac'], formaten: ['md', 'txt'], bron: 'https://support.apple.com/en-gb/guide/notes/not201900c07/4.13/mac/27',
    uitleg: ['На Mac Notes експортує нотатки в Markdown або PDF; Markdown і текст можна імпортувати тут.', 'Op de Mac exporteert Notes naar Markdown of PDF; Markdown en tekst kunt u hier importeren.'],
    wat: ['Публічного API iCloud Notes для двосторонньої синхронізації не підтверджено — ми її не обіцяємо.', 'Er is geen bevestigde publieke iCloud-Notes-API voor tweerichtingssynchronisatie — die beloven wij niet.'] },
  { id: 'honor-huawei', naam: 'HONOR / HUAWEI Notes', stand: 'alleen-invoer', soort: ['Експорт TXT', 'TXT-export'], formaten: ['txt'], bron: 'https://www.honor.com/uk/support/content/en-us15847168/',
    uitleg: ['Застосунки нотаток HONOR і HUAWEI експортують у TXT (HTML/PDF залежно від версії). Файли TXT імпортуються тут.', 'De notitie-apps van HONOR en HUAWEI exporteren naar TXT (HTML/PDF per versie). TXT-bestanden importeert u hier.'],
    wat: ['Імпорт HTML і PDF (з розпізнаванням) ще не реалізовано.', 'Import van HTML en PDF (met tekstherkenning) is nog niet gebouwd.'] },
  { id: 'samsung-notes', naam: 'Samsung Notes', stand: 'alleen-invoer', soort: ['Експорт файлів', 'Bestandsexport'], formaten: ['txt'], bron: 'https://support.microsoft.com/en-us/onenote/use-the-onenote-feed-in-microsoft-onenote',
    uitleg: ['Samsung Notes надсилає нотатки в стрічку OneNote лише обмежено; повного API немає. Експортований текст можна імпортувати.', 'Samsung Notes stuurt notities slechts beperkt naar de OneNote-feed; een volledige API is er niet. Geëxporteerde tekst kunt u importeren.'],
    wat: ['Жодної автоматичної синхронізації без окремого підтримуваного API.', 'Geen automatische synchronisatie zonder een aparte ondersteunde API.'] },
  { id: 'google-calendar', naam: 'Google Calendar', stand: 'gepland', soort: ['Зв’язок із подією', 'Koppeling met een afspraak'], formaten: [], bron: 'https://developers.google.com/workspace/calendar/api/guides/create-events',
    uitleg: ['Зв’язок «нотатка ↔ подія» через наявний календар Mijn Ruimte (noteId ↔ eventId), з підтвердженням кожного запису.', 'Koppeling «notitie ↔ afspraak» via de bestaande agenda van Mijn Ruimte (noteId ↔ eventId), met bevestiging per schrijfactie.'],
    wat: ['Це не синхронізація нотаток. Серверної таблиці відповідностей ще немає.', 'Dit is geen notitiesynchronisatie. De servertabel met de koppelingen bestaat nog niet.'] },
  { id: 'onenote', naam: 'Microsoft OneNote', stand: 'gepland', soort: ['Microsoft Graph', 'Microsoft Graph'], formaten: [], bron: 'https://learn.microsoft.com/en-us/graph/api/resources/onenote?view=graph-rest-1.0',
    uitleg: ['Офіційний Graph API для блокнотів, розділів і сторінок (делегований OAuth).', 'Officiële Graph-API voor notitieblokken, secties en pagina’s (gedelegeerde OAuth).'],
    wat: ['Немає OAuth-клієнта Microsoft у сейфі, адаптера Graph і таблиці відповідностей. Окремий серверний модуль.', 'Geen Microsoft-OAuth-client in de kluis, geen Graph-adapter en geen koppeltabel. Een eigen servermodule.'] },
  { id: 'evernote', naam: 'Evernote', stand: 'gepland', soort: ['MCP (beta) / ENEX', 'MCP (beta) / ENEX'], formaten: [], bron: 'https://dev.evernote.com/mcp',
    uitleg: ['Офіційний Evernote MCP (beta) і експорт ENEX/HTML.', 'Officiële Evernote-MCP (beta) en ENEX/HTML-export.'],
    wat: ['Імпортер ENEX (XML із вкладеннями, потрібна санітизація) і шлюз MCP ще не реалізовано.', 'De ENEX-importer (XML met bijlagen, sanering nodig) en de MCP-gateway zijn nog niet gebouwd.'] },
  { id: 'google-keep', naam: 'Google Keep', stand: 'beperkt', soort: ['Workspace API', 'Workspace-API'], formaten: [], bron: 'https://developers.google.com/workspace/keep/api/guides',
    uitleg: ['API Keep орієнтований на Google Workspace (корпоративні акаунти). Для особистого Keep двостороннього доступу немає.', 'De Keep-API is gericht op Google Workspace (zakelijke accounts). Voor een persoonlijk Keep is er geen tweerichtingstoegang.'],
    wat: ['Потрібна перевірка Workspace-права; наш вхід Google не просить області Keep.', 'Er is een Workspace-controle nodig; onze Google-aanmelding vraagt geen Keep-scopes.'] },
  { id: 'notion', naam: 'Notion', stand: 'gepland', soort: ['Сторінки й бази', 'Pagina’s en databases'], formaten: [], bron: 'https://www.notion.so',
    uitleg: ['Сторінки Notion як нотатки.', 'Notion-pagina’s als notities.'],
    wat: ['Немає OAuth-застосунку, місця для токена в сейфі й маршруту. Окремий серверний модуль.', 'Geen OAuth-app, geen plek voor een token in de kluis en geen route. Een eigen servermodule.'] },
  { id: 'colornote', naam: 'ColorNote', stand: 'gepland', soort: ['Власний бекап', 'Eigen back-up'], formaten: [], bron: 'https://www.colornote.com/faq-question/what-is-colornotes-backup-system/',
    uitleg: ['ColorNote має лише власний бекап і ручне «поділитися».', 'ColorNote heeft alleen een eigen back-up en handmatig «delen».'],
    wat: ['Публічного API не підтверджено; поділений текст можна зберегти як .txt і імпортувати.', 'Geen bevestigde publieke API; gedeelde tekst kunt u als .txt bewaren en importeren.'] },
]);
export const notitieBron = (id: unknown) => NOTITIE_BRONNEN.find((b) => b.id === id);
export const vnTekst = (paar: Tweetalig, lang: 'uk' | 'nl') => (lang === 'uk' ? paar[0] : paar[1]);
