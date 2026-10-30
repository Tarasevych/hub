// Context van een gesprek (pakket 2 «Adaptive Mail Canvas», 24.10.2026) — pure regels, zonder DOM en zonder ШІ:
// versies van bijlagen, tijdlijn, verwante brieven met hun reden, afzendercontrole, «N eerdere brieven», ontvangers.
// Gebruikt door src/mail/ContextPaneel.tsx en src/MailGesprekInhoud.tsx; getoetst in tests/eenheid/gesprek-context-20261024.test.ts.
// Eigenaar (макет «Adaptive Mail Canvas»): «вкладення: група версій одного документа (v3/v2/v1)», «зв'язки: з причиною («та сама
// адреса», «той самий відправник») і чесною позначкою «без ШІ»», «хронологія: … листи гілки кольором відправника, «ви тут», майбутня подія».
import { normalizeMailAddress } from '../mail-email';
import { splitsAfzender } from '../mail-afzender-weergave';

export type CtxBijlage = { providerAttachmentId: string; filename: string; contentType: string; sizeBytes: number };
export type CtxDetails = { authentication?: { spf?: string; dkim?: string; dmarc?: string }; transport?: { status?: string } };
export type CtxBericht = {
  id: string; threadId: string; from: string; to?: string; cc?: string; subject: string; snippet?: string; receivedAt: number;
  attachments: CtxBijlage[]; details?: CtxDetails;
};

// ------------------------------------------------------------------ personen
export const adresVan = (from: string) => normalizeMailAddress(from);
export function naamVan(from: string): string {
  const s = splitsAfzender(from);
  return (s.naam || s.adres || '').trim();
}
/** Twee beginletters voor een rondje («Lotte Vermeulen» → «LV», «info@bank.be» → «IB»). */
export function beginletters(from: string): string {
  const naam = naamVan(from) || adresVan(from);
  // zonder naam: «info@bank.be» → «info bank» (deel vóór @ en de domeinnaam zonder .be)
  const bron = naam.includes('@') ? naam.replace('@', ' ').replace(/\.[a-z]{2,}$/i, '') : naam;
  const delen = bron.split(/[\s._-]+/).filter((d) => /[\p{L}\p{N}]/u.test(d));
  return delen.slice(0, 2).map((d) => ([...d][0] || '').toLocaleUpperCase()).join('') || '?';
}

/** Adressen uit een To-/Cc-veld: «Bart Peeters <bart@x.be>, "Achternaam, Voornaam" <y@z>» → [{naam, adres}]. Komma's binnen
 *  aanhalingstekens of <> scheiden niets. Ongeldige stukken vallen weg. */
export function adressenUit(veld?: string): Array<{ naam: string; adres: string }> {
  const uit: Array<{ naam: string; adres: string }> = [];
  let stuk = '', inAanh = false, inHaak = false;
  const sluit = () => {
    const s = stuk.trim(); stuk = '';
    if (!s) return;
    const adres = normalizeMailAddress(s);
    if (!adres) return;
    const naam = splitsAfzender(s).naam;
    uit.push({ naam: naam && normalizeMailAddress(naam) !== adres ? naam.replace(/^"|"$/g, '') : '', adres });
  };
  for (const ch of String(veld || '')) {
    if (ch === '"' && !inHaak) inAanh = !inAanh;
    else if (ch === '<' && !inAanh) inHaak = true;
    else if (ch === '>' && !inAanh) inHaak = false;
    if ((ch === ',' || ch === ';') && !inAanh && !inHaak) { sluit(); continue; }
    stuk += ch;
  }
  sluit();
  return uit;
}

/** «кому: мені · копія: Bart Peeters»: wie de brief kreeg, met «ik» apart (mijn adressen = de gekoppelde accounts). */
export function ontvangers(b: Pick<CtxBericht, 'to' | 'cc'>, mijnAdressen: string[]): { aan: Array<{ naam: string; adres: string; ik: boolean }>; cc: Array<{ naam: string; adres: string; ik: boolean }> } {
  const ik = new Set(mijnAdressen.map((a) => normalizeMailAddress(a)).filter(Boolean));
  const merk = (l: Array<{ naam: string; adres: string }>) => l.map((x) => ({ ...x, ik: ik.has(x.adres) }));
  return { aan: merk(adressenUit(b.to)), cc: merk(adressenUit(b.cc)) };
}

// ------------------------------------------------------------------ versies van bijlagen
// Woorden die een versie of status noemen en niet het document zelf (nl, en, uk): «Huurcontract-concept», «…-getekend»,
// «…-ondertekend» zijn hetzelfde document. Getallen blijven (factuur 12 ≠ factuur 13), behalve na een versiewoord (v2, versie 3).
const VERSIE_WOORDEN = new Set([
  'v', 'versie', 'version', 'ver', 'rev', 'revisie', 'revision', 'final', 'finaal', 'definitief', 'definitieve', 'def', 'concept', 'draft',
  'ontwerp', 'getekend', 'ondertekend', 'ondertekende', 'signed', 'nieuw', 'nieuwe', 'new', 'oud', 'oude', 'old', 'kopie', 'copy', 'update',
  'updated', 'bijgewerkt', 'aangepast', 'gewijzigd', 'corrected', 'gecorrigeerd', 'scan', 'scanned', 'чернетка', 'остаточна', 'остаточний',
  'підписаний', 'підписана', 'підписано', 'копія', 'версія', 'фінал', 'нова', 'новий', 'оновлено',
]);
const datumWeg = (s: string) => s.replace(/(?:19|20)\d{2}[-_.]?(?:0[1-9]|1[0-2])[-_.]?(?:0[1-9]|[12]\d|3[01])/g, ' ').replace(/\(\d{1,3}\)/g, ' ');
const extensie = (f: string) => { const m = /\.([a-z0-9]{1,8})$/i.exec(f.trim()); return m ? m[1].toLowerCase() : ''; };
const zonderExtensie = (f: string) => f.trim().replace(/\.[a-z0-9]{1,8}$/i, '');
function stamDelen(filename: string): string[] {
  const delen = datumWeg(zonderExtensie(filename)).split(/[\s._\-()[\]{}+,]+/).filter(Boolean);
  const uit: string[] = [];
  for (let i = 0; i < delen.length; i++) {
    const d = delen[i], kl = d.toLocaleLowerCase();
    if (VERSIE_WOORDEN.has(kl) || /^v\d+(?:\.\d+)*$/i.test(d) || /^rev\d+$/i.test(d)) { if (i + 1 < delen.length && /^\d{1,3}$/.test(delen[i + 1])) i++; continue; }
    uit.push(d);
  }
  return uit;
}
/** Sleutel van «hetzelfde document» (kleine letters, zonder versie-/statuswoorden en datums, met extensie); '' = niet groeperen. */
export function documentSleutel(filename: string): string {
  const delen = stamDelen(filename).map((d) => d.toLocaleLowerCase());
  const ext = extensie(filename);
  if (!delen.length || !delen.some((d) => /\p{L}/u.test(d))) return '';
  return `${delen.join('-')}.${ext}`;
}

export type VersieItem = { berichtId: string; bijlage: CtxBijlage; wanneer: number; van: string; nummer: number; laatste: boolean };
export type VersieGroep = { sleutel: string; titel: string; totaal: number; items: VersieItem[] };
export type LosseBijlage = { berichtId: string; bijlage: CtxBijlage; wanneer: number; van: string };

/** Bijlagen van het gesprek in groepen «versies van hetzelfde document» (≥ 2 verschillende versies) en losse bestanden.
 *  Versie 1 is de oudste. Een ongewijzigd doorgestuurd bestand (zelfde naam en grootte) is geen nieuwe versie. Nieuwste eerst. */
export function bijlageVersies(thread: CtxBericht[]): { groepen: VersieGroep[]; los: LosseBijlage[] } {
  const perSleutel = new Map<string, Array<{ b: CtxBericht; a: CtxBijlage }>>();
  const losVolgorde: Array<{ b: CtxBericht; a: CtxBijlage }> = [];
  const chrono = [...thread].sort((x, y) => x.receivedAt - y.receivedAt);
  for (const b of chrono) for (const a of b.attachments || []) {
    const k = documentSleutel(a.filename);
    if (!k) { losVolgorde.push({ b, a }); continue; }
    if (!perSleutel.has(k)) perSleutel.set(k, []);
    perSleutel.get(k)!.push({ b, a });
  }
  const groepen: VersieGroep[] = [];
  for (const [sleutel, lijst] of perSleutel) {
    let nummer = 0, vorige = '';
    const items: VersieItem[] = lijst.map(({ b, a }) => {
      const id = `${a.filename.toLocaleLowerCase()}\u0000${a.sizeBytes}`;
      if (id !== vorige) { nummer++; vorige = id; }
      return { berichtId: b.id, bijlage: a, wanneer: b.receivedAt, van: b.from, nummer, laatste: false };
    });
    if (nummer < 2) { for (const x of lijst) losVolgorde.push(x); continue; }
    for (const it of items) it.laatste = it.nummer === nummer;
    const nieuwste = items[items.length - 1];
    const titel = stamDelen(nieuwste.bijlage.filename).join(' ') || zonderExtensie(nieuwste.bijlage.filename);
    groepen.push({ sleutel, titel, totaal: nummer, items: items.reverse() });
  }
  groepen.sort((x, y) => (y.items[0]?.wanneer || 0) - (x.items[0]?.wanneer || 0));
  const los = losVolgorde.sort((x, y) => y.b.receivedAt - x.b.receivedAt).map(({ b, a }) => ({ berichtId: b.id, bijlage: a, wanneer: b.receivedAt, van: b.from }));
  return { groepen, los };
}
/** Versie van één bijlage voor het etiket op de kaart («v3 · остання»), of null als het bestand geen versies heeft. */
export function versieVan(groepen: VersieGroep[], berichtId: string, providerAttachmentId: string): { nummer: number; totaal: number; laatste: boolean } | null {
  for (const g of groepen) for (const it of g.items) if (it.berichtId === berichtId && it.bijlage.providerAttachmentId === providerAttachmentId) return { nummer: it.nummer, totaal: g.totaal, laatste: it.laatste };
  return null;
}

// ------------------------------------------------------------------ verwante brieven (zonder ШІ)
export type Kandidaat = { id: string; threadId: string; subject: string; from: string; receivedAt: number; snippet?: string };
export type VerwantReden = 'afzender' | 'onderwerp';
export type VerwantBericht = Kandidaat & { reden: VerwantReden };

const ONDERWERP_WEG = /^\s*(?:(?:re|fw|fwd|aw|wg|antw|antwoord|doorst|tr|sv|ref|відп|відповідь|пересл|пересилання)\s*(?:\[\d+\])?\s*:\s*)+/i;
const STOPWOORDEN = new Set([
  'voor', 'over', 'van', 'met', 'naar', 'door', 'deze', 'dit', 'een', 'het', 'de', 'en', 'of', 'uw', 'jouw', 'onze', 'ons', 'mijn', 'bij',
  'the', 'and', 'for', 'with', 'your', 'from', 'this', 'that', 'about', 'info', 'informatie', 'vraag', 'bericht', 'mail', 'email', 'nieuws',
  'nieuwsbrief', 'update', 'reminder', 'herinnering', 'bevestiging', 'confirmation', 'order', 'bestelling', 'factuur', 'invoice', 'versie',
  'для', 'про', 'від', 'щодо', 'лист', 'питання', 'нагадування', 'підтвердження',
]);
/** Onderscheidende woorden van een onderwerp (≥ 4 letters, geen stopwoord, zonder Re:/Fwd:). */
export function onderwerpWoorden(onderwerp: string): string[] {
  const s = String(onderwerp || '').replace(ONDERWERP_WEG, '').normalize('NFKC').toLocaleLowerCase();
  const woorden = s.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4 && /\p{L}/u.test(w) && !STOPWOORDEN.has(w));
  return [...new Set(woorden)];
}
const hetzelfdeOnderwerp = (a: string, b: string) => {
  const wa = onderwerpWoorden(a), wb = new Set(onderwerpWoorden(b));
  const samen = wa.filter((w) => wb.has(w));
  return samen.length >= 2 || samen.some((w) => w.length >= 7);
};

/** Andere brieven die bij dit gesprek horen, elk met een eerlijke reden: dezelfde afzender (een deelnemer die ik niet ben) of
 *  hetzelfde onderwerp (gedeelde onderscheidende woorden). Eén per gesprek (de nieuwste), nieuwste eerst, hoogstens `max`. */
export function verwanteBrieven(o: { thread: CtxBericht[]; kandidaten: Kandidaat[]; mijnAdressen: string[]; max?: number }): VerwantBericht[] {
  const ik = new Set(o.mijnAdressen.map((a) => normalizeMailAddress(a)).filter(Boolean));
  const draden = new Set(o.thread.map((b) => b.threadId).filter(Boolean)), ids = new Set(o.thread.map((b) => b.id));
  const deelnemers = new Set(o.thread.map((b) => adresVan(b.from)).filter((a) => a && !ik.has(a)));
  const onderwerp = o.thread[o.thread.length - 1]?.subject || o.thread[0]?.subject || '';
  const perDraad = new Map<string, VerwantBericht>();
  for (const k of o.kandidaten) {
    if (!k || ids.has(k.id) || (k.threadId && draden.has(k.threadId))) continue;
    const afz = adresVan(k.from);
    const reden: VerwantReden | null = afz && deelnemers.has(afz) ? 'afzender' : hetzelfdeOnderwerp(k.subject, onderwerp) ? 'onderwerp' : null;
    if (!reden) continue;
    const sleutel = k.threadId || k.id, oud = perDraad.get(sleutel);
    if (!oud || k.receivedAt > oud.receivedAt) perDraad.set(sleutel, { ...k, reden });
  }
  return [...perDraad.values()].sort((a, b) => b.receivedAt - a.receivedAt).slice(0, Math.max(0, o.max ?? 6));
}

// ------------------------------------------------------------------ tijdlijn
export type Gebeurtenis = { titel: string; start: number; einde?: number; plaats?: string; berichtId: string; providerAttachmentId: string };
export type TijdlijnItem = {
  soort: 'bericht' | 'verwant' | 'gebeurtenis'; id: string; threadId?: string; wanneer: number; titel: string; van: string;
  hier: boolean; toekomst: boolean; versies: number[];
};
/** Tijdlijn van het gesprek: verwante brieven (stippellijn), de brieven zelf (in de kleur van de afzender, «ви тут» bij de open
 *  brief) en afspraken uit .ics-bijlagen (toekomst gemarkeerd). Oudste boven. */
export function tijdlijn(o: { thread: CtxBericht[]; openId: string; verwant?: VerwantBericht[]; gebeurtenissen?: Gebeurtenis[]; groepen?: VersieGroep[]; nu: number }): TijdlijnItem[] {
  const versiesPer = new Map<string, number[]>();
  for (const g of o.groepen || []) for (const it of g.items) { const l = versiesPer.get(it.berichtId) || []; if (!l.includes(it.nummer)) l.push(it.nummer); versiesPer.set(it.berichtId, l.sort((a, b) => a - b)); }
  const items: TijdlijnItem[] = [];
  for (const v of o.verwant || []) items.push({ soort: 'verwant', id: v.id, threadId: v.threadId, wanneer: v.receivedAt, titel: v.subject.replace(ONDERWERP_WEG, '') || v.subject, van: v.from, hier: false, toekomst: v.receivedAt > o.nu, versies: [] });
  for (const b of o.thread) {
    const kort = String(b.snippet || '').replace(/\s+/g, ' ').trim();
    items.push({ soort: 'bericht', id: b.id, threadId: b.threadId, wanneer: b.receivedAt, titel: kort ? (kort.length > 80 ? `${kort.slice(0, 79)}…` : kort) : b.subject, van: b.from, hier: b.id === o.openId, toekomst: false, versies: versiesPer.get(b.id) || [] });
  }
  for (const g of o.gebeurtenissen || []) if (g.start > 0) items.push({ soort: 'gebeurtenis', id: `${g.berichtId}:${g.providerAttachmentId}:${g.start}`, wanneer: g.start, titel: g.titel, van: '', hier: false, toekomst: g.start > o.nu, versies: [] });
  return items.sort((a, b) => a.wanneer - b.wanneer || (a.soort === 'gebeurtenis' ? 1 : 0) - (b.soort === 'gebeurtenis' ? 1 : 0));
}

/** Verschil (ms) tussen de kloktijd in zone `tz` en UTC op dat moment, of null als de zone onbekend is (bv. een Windows-naam). */
function zoneVerschil(utc: number, tz: string): number | null {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(new Date(utc)).map((x) => [x.type, x.value])) as Record<string, string>;
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - utc;
  } catch { return null; }
}
/** «20261028T100000Z» → ms (UTC); zonder Z de kloktijd in `tz` (TZID uit het bestand, als de browser die zone kent), anders de
 *  plaatselijke tijd van deze browser; «20261028» → begin van die dag. Onleesbaar → 0. */
export function icsTijd(waarde: string, tz = ''): number {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(waarde || '').trim());
  if (!m) return 0;
  const [j, mn, d, u = '0', mi = '0', s = '0'] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((x) => x ?? '0');
  if (m[7]) { const t = Date.UTC(+j, +mn - 1, +d, +u, +mi, +s); return Number.isFinite(t) ? t : 0; }
  if (tz && m[4]) {
    const klok = Date.UTC(+j, +mn - 1, +d, +u, +mi, +s), v1 = zoneVerschil(klok, tz);
    if (v1 !== null) { let t = klok - v1; const v2 = zoneVerschil(t, tz); if (v2 !== null && v2 !== v1) t = klok - v2; return Number.isFinite(t) ? t : 0; }
  }
  const t = new Date(+j, +mn - 1, +d, +u, +mi, +s).getTime();
  return Number.isFinite(t) ? t : 0;
}
/** Een hele dag («20261028», zonder tijd)? */
export const icsHeleDag = (waarde: string) => /^\d{8}$/.test(String(waarde || '').trim());
export const isIcs = (a: Pick<CtxBijlage, 'filename' | 'contentType'>) => /(^|\/)(calendar|ics)\b/i.test(String(a.contentType || '')) || /\.(ics|ical|ifb|vcs)$/i.test(String(a.filename || ''));

// ------------------------------------------------------------------ afzender en «eerdere brieven»
export type AfzenderControle = 'ok' | 'deels' | 'mislukt' | 'onbekend';
const pas = (v?: string) => /^pass$/i.test(String(v || '').trim());
const faal = (v?: string) => /^(fail|softfail|permerror|temperror)$/i.test(String(v || '').trim());
/** SPF/DKIM/DMARC zoals de provider ze meldde. DMARC beslist over het domein in «Від»: DMARC fail = mislukt, ook als SPF en DKIM
 *  slagen (die kunnen voor een ánder domein gelden). Verder: ok (DMARC pass, of SPF én DKIM pass zonder DMARC-uitslag), mislukt
 *  (SPF en DKIM allebei niet goed), deels, of onbekend (niets gemeld — dat bewijst niets). */
export function afzenderControle(details?: CtxDetails): AfzenderControle {
  const a = details?.authentication; if (!a) return 'onbekend';
  if (faal(a.dmarc)) return 'mislukt';
  if (pas(a.dmarc) || (pas(a.spf) && pas(a.dkim))) return 'ok';
  if (faal(a.spf) && faal(a.dkim)) return 'mislukt';
  if (pas(a.spf) || pas(a.dkim)) return 'deels';
  return faal(a.spf) || faal(a.dkim) ? 'mislukt' : 'onbekend';
}

/** De brieven vóór de laatste, samen te vatten in één regel («2 попередні листи · 22–23 жовт.») vanaf 2 stuks; anders null. */
export function eerdereBrieven(thread: CtxBericht[]): { aantal: number; ids: string[]; afzenders: Array<{ naam: string; adres: string; from: string }>; van: number; tot: number } | null {
  if (thread.length < 3) return null;
  const eerder = thread.slice(0, -1);
  const gezien = new Set<string>(), afzenders: Array<{ naam: string; adres: string; from: string }> = [];
  for (const b of eerder) { const adres = adresVan(b.from) || b.from; if (gezien.has(adres)) continue; gezien.add(adres); afzenders.push({ naam: naamVan(b.from), adres, from: b.from }); }
  const tijden = eerder.map((b) => b.receivedAt).filter((t) => t > 0);
  return { aantal: eerder.length, ids: eerder.map((b) => b.id), afzenders, van: Math.min(...tijden), tot: Math.max(...tijden) };
}

// ------------------------------------------------------------------ veiligheid van de brieftekst
/** Afbeeldingen in de HTML van een brief (zonder DOM: een benadering met de <img>-tags en url(...) in style):
 *  extern — https, die laadt de eigen server (MailBerichtTekst → /reader/remote-image), nooit de browser;
 *  onveilig — http, die worden niet geladen; pixels — extern én ≤ 3×3 px of verborgen: «схожі на пікселі стеження».
 *  Een eenvoudige controle op maat en zichtbaarheid, geen lijst van trackers — zo staat het ook op het scherm. */
export function beeldenTellen(html: string): { extern: number; pixels: number; onveilig: number } {
  let extern = 0, pixels = 0, onveilig = 0;
  const s = String(html || '');
  for (const m of s.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = /\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
    const url = (src?.[1] ?? src?.[2] ?? src?.[3] ?? '').trim();
    if (/^http:\/\//i.test(url)) { onveilig++; continue; }
    if (!/^https:\/\//i.test(url)) continue; // cid:, data: — zit in de brief zelf
    extern++;
    const stijl = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag), css = (stijl?.[1] ?? stijl?.[2] ?? '').toLowerCase();
    const attr = (naam: string) => { const r = new RegExp(`\\s${naam}\\s*=\\s*["']?\\s*(\\d+(?:\\.\\d+)?)`, 'i').exec(tag); return r ? Number(r[1]) : NaN; };
    const cssMaat = (naam: string) => { const r = new RegExp(`(?:^|[;\\s])${naam}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`).exec(css); return r ? Number(r[1]) : NaN; };
    const w = Number.isFinite(attr('width')) ? attr('width') : cssMaat('width'), h = Number.isFinite(attr('height')) ? attr('height') : cssMaat('height');
    const klein = (w <= 3 && h <= 3) || w <= 1 || h <= 1; // NaN-vergelijkingen zijn false: zonder maat is het geen pixel
    const verborgen = /display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)/.test(css);
    if (klein || verborgen) pixels++;
  }
  for (const m of s.matchAll(/url\(\s*(['"]?)\s*(https?):\/\//gi)) { if (m[2].toLowerCase() === 'https') extern++; else onveilig++; }
  // background="…" op tabellen en cellen (oude nieuwsbrieven): ook die laadt nu de eigen server (MailBerichtTekst)
  for (const m of s.matchAll(/<[a-z][a-z0-9]*\b[^>]*\sbackground\s*=\s*(?:"\s*(https?):|'\s*(https?):|(https?):)/gi)) { if ((m[1] || m[2] || m[3] || '').toLowerCase() === 'https') extern++; else onveilig++; }
  return { extern, pixels, onveilig };
}

/** Kleur van een contact uit de afzenderregels van de Post (mail-kleur-palet), of '' als er geen is gekozen. */
export function contactKleur(regels: Array<{ email: string; color: string }>, from: string): string {
  const a = adresVan(from); if (!a) return '';
  const r = regels.find((x) => normalizeMailAddress(x.email) === a);
  return r && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '';
}
