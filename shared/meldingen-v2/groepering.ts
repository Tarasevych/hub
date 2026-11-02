// Meldingen v2 (vlag `meldingen-v2`) — GROEPERING, TOESTAND en TELLERS. Puur (geen React/netwerk), los te toetsen
// (tests/eenheid/meldingen-v2-20261029.test.ts).
//
// Waarom: op de live site stonden 129 ongelezen, 163 regels en 39 «problemen». Oorzaak (docs/meldingen-v2/INVENTARIS-EN-OORZAKEN.md):
// elke start/einde van een achtergrondproces (bv. adrescontrole) was een EIGEN ongelezen regel, succesvolle achtergrondwerk telde
// mee in de bel, en gelezen werd gelijkgesteld aan opgelost. Hier: één item per proces, tellers per item (niet per regel),
// en een aparte teller «потребує уваги».
import { levering, type BeleidInvoer, type LeverRegels, type Levering } from './beleid';

export type Ernst = 'fout' | 'aandacht' | 'succes' | 'info';
/** Toestand los van gelezen: gelezen ≠ opgelost. */
export type Toestand = 'open' | 'actie' | 'opgelost' | 'archief';

export type V2Melding = {
  id: string;
  /** Interne dienst: post, cloud, identity, huis, github, ai, agenda, site, … */
  dienst: string;
  /** Externe aanbieder als die er is (google, microsoft, dropbox, homeassistant …) — alleen wat de bron echt opgeeft. */
  aanbieder?: string;
  /** Het gekoppelde account (stabiele sleutel, bv. e-mailadres of koppelings-id). */
  account?: string;
  /** Wat de mens ziet als accountlabel (Особистий / Робочий / Сімейний of een kort adres). */
  accountLabel?: string;
  categorie?: string;
  soort?: string;
  ernst: Ernst;
  titel: string;
  tekst?: string;
  /** Hoe vaak dezelfde lokale melding zich herhaalde (samengevoegd tot één regel, zie canoniek-meldingen.ts). */
  herhaald?: number;
  tijd: number;
  gelezen: boolean;
  toestand?: Toestand;
  vraagtActie?: boolean;
  vraagtBevestiging?: boolean;
  verplicht?: boolean;
  /** Stabiele proces-id (bv. id van een adrescontrole-ronde of een uitroltaak): alle regels van één proces → één item. */
  procesId?: string;
  /** Faseregel van een proces (start/voortgang/einde) — telt nooit los. */
  fase?: 'start' | 'bezig' | 'einde';
  link?: string;
  /** Originele technische gegevens (bewaard, alleen in uitklap). */
  technischeTekst?: string;
  sfeer?: 'prive' | 'technisch';
  /** UI-014 (uitleg): wie het deed (agent, apparaat, account) en waarop (bestand, recht, ruimte) — alleen wat de bron echt geeft. */
  wie?: string;
  object?: string;
  /** UI-014: einde van een toegang (ISO) als de bron het geeft. */
  eind?: string;
  /** UI-014: herkomst van de regel. */
  herkomst?: 'server' | 'lokaal' | 'activiteit';
  /** UI-014 fase 2B (shared/meldingen-v2/status.ts): uitgesteld tot (ms); na afloop: terugOp = toen kwam hij terug (bovenaan). */
  uitgesteldTot?: number;
  terugOp?: number;
  /** UI-014 fase 2B: automatisch opgeruimd uit de tab Архів (blijft in «Вся історія»). */
  opgeruimd?: boolean;
};

export type V2Groep = {
  sleutel: string;
  hoofd: V2Melding;
  leden: V2Melding[];
  aantal: number;
  ongelezen: number;
  ernst: Ernst;
  toestand: Toestand;
  /** Er is een echte fout in dit proces die NIET door een latere geslaagde ronde is opgelost. */
  openFout: boolean;
  levering: Levering;
};

const normTitel = (t: string) => t.toLowerCase().replace(/[\d«»"'“”‘’.,:;!?()[\]{}%/#-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
export const groepSleutel = (m: V2Melding) =>
  m.procesId ? `p|${m.dienst}|${m.procesId}` : `s|${m.dienst}|${m.account || ''}|${m.soort || ''}|${normTitel(m.titel)}`;

const ERNST_RANG: Record<Ernst, number> = { fout: 0, aandacht: 1, succes: 2, info: 3 };

/** Technische ruis die NIET in het gewone centrum hoort (gaat naar de technische ruimte / logboeken). */
const RUIS = /(herhaalpoging|retry|opnieuw geprobeerd|повторн[аі] спроб|extensie (ontgrendeld|geweigerd)|розширення (розблоковано|відхилено)|agent[- ]?service|служб[аи] агента|heartbeat|keepalive|tool[_ ]call|mcp[._]call)/i;
/** Interne code in de titel (HOOFDLETTERS_MET_LIJNEN), hoofdlettergevoelig: `mail_sync_failed` als soort is GEEN ruis. */
const CODE = /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+){2,}\b/;
export type Indeling = 'gebruiker' | 'technisch';
/** Gewone ruimte of technische lade. Een fout die de gebruiker raakt blijft in het gewone centrum (met mensentaal + uitklap). */
export function indeling(m: V2Melding): Indeling {
  if (m.sfeer === 'technisch') return 'technisch';
  const ruis = RUIS.test(`${m.soort || ''} ${m.titel}`) || CODE.test(m.titel);
  if (!ruis) return 'gebruiker';
  return m.ernst === 'fout' && (m.vraagtActie || m.link) ? 'gebruiker' : 'technisch';
}

export function toestandVan(m: V2Melding): Toestand {
  if (m.toestand === 'archief' || m.toestand === 'opgelost') return m.toestand;
  if (m.vraagtActie || m.vraagtBevestiging || m.toestand === 'actie') return 'actie';
  return 'open';
}

const beleidVan = (m: V2Melding): BeleidInvoer => ({ dienst: m.dienst, account: m.account, categorie: m.categorie, soort: m.soort, vraagtBevestiging: m.vraagtBevestiging, verplicht: m.verplicht });
/** Modus zonder regel: succesvol achtergrondwerk en procesfasen zijn stil; fouten en verzoeken normaal; de rest normaal. */
export function standaardModus(m: V2Melding) {
  if (m.fase && m.fase !== 'einde') return 'stil' as const;
  if (m.ernst === 'succes' && !m.vraagtActie) return 'stil' as const;
  return 'normaal' as const;
}

/** Duplicaatbescherming: dezelfde id telt één keer (laatste versie wint, bv. statusupdate van een lopend proces). */
export function ontdubbel(items: readonly V2Melding[]): V2Melding[] {
  const m = new Map<string, V2Melding>();
  for (const i of items) { const oud = m.get(i.id); if (!oud || i.tijd >= oud.tijd) m.set(i.id, oud ? { ...i, gelezen: i.gelezen || oud.gelezen } : i); }
  return [...m.values()];
}

export function groepeer(items: readonly V2Melding[], regels: LeverRegels, nu = Date.now()): V2Groep[] {
  const map = new Map<string, V2Melding[]>();
  for (const i of ontdubbel(items)) { const k = groepSleutel(i); const l = map.get(k); if (l) l.push(i); else map.set(k, [i]); }
  const uit: V2Groep[] = [];
  for (const [sleutel, lijst] of map) {
    lijst.sort((a, b) => b.tijd - a.tijd);
    const hoofd = lijst[0];
    const laatsteSucces = lijst.find((x) => x.ernst === 'succes' || toestandVan(x) === 'opgelost');
    const openFout = lijst.some((x) => x.ernst === 'fout' && toestandVan(x) !== 'opgelost' && toestandVan(x) !== 'archief' && (!laatsteSucces || x.tijd > laatsteSucces.tijd));
    // Ernst van het item = die van de nieuwste regel, maar een nog open fout gaat nooit verloren.
    const ernst: Ernst = openFout ? 'fout' : hoofd.ernst;
    const toestanden = lijst.map(toestandVan);
    const toestand: Toestand = toestanden[0] === 'archief' ? 'archief' : toestanden.includes('actie') && !toestanden.slice(0, toestanden.indexOf('actie')).includes('opgelost') ? 'actie' : toestanden[0];
    const lev = levering(regels, beleidVan(hoofd), openFout ? 'normaal' : standaardModus(hoofd), nu);
    uit.push({ sleutel, hoofd, leden: lijst, aantal: lijst.length, ongelezen: lijst.filter((x) => !x.gelezen).length, ernst, toestand, openFout, levering: lev });
  }
  return uit.sort((a, b) => b.hoofd.tijd - a.hoofd.tijd);
}

export type Tellers = { bel: number; aandacht: number; ongelezen: number; totaal: number; regels: number };
/** Bel = ongelezen ITEMS die tellen (prioriteit/normaal); aandacht = open fout, waarschuwing of gevraagde actie (niet opgelost/archief). */
export function tellers(groepen: readonly V2Groep[]): Tellers {
  let bel = 0, aandacht = 0, ongelezen = 0, regels = 0, totaal = 0;
  for (const g of groepen) {
    regels += g.aantal;
    if (!g.levering.centrum) continue;
    totaal++;
    if (g.ongelezen) ongelezen++;
    if (g.ongelezen && g.levering.teller) bel++;
    if (vraagtAandacht(g)) aandacht++;
  }
  return { bel, aandacht, ongelezen, totaal, regels };
}
export const vraagtAandacht = (g: V2Groep) =>
  g.toestand !== 'opgelost' && g.toestand !== 'archief' && g.levering.centrum && (g.openFout || g.ernst === 'aandacht' || g.toestand === 'actie' || (g.levering.beschermd && g.ongelezen > 0));

export type Weergave = 'belangrijk' | 'alle' | 'ongelezen';
export type Filters = { dienst?: string[]; account?: string[]; categorie?: string[]; toestand?: Toestand[]; vanaf?: number; tot?: number; zoek?: string; sortering?: 'nieuw' | 'oud' | 'ernst' };
export const actieveFilters = (f: Filters) => (f.dienst?.length ? 1 : 0) + (f.account?.length ? 1 : 0) + (f.categorie?.length ? 1 : 0) + (f.toestand?.length ? 1 : 0) + (f.vanaf || f.tot ? 1 : 0) + (f.sortering && f.sortering !== 'nieuw' ? 1 : 0);

export function filter(groepen: readonly V2Groep[], weergave: Weergave, f: Filters): V2Groep[] {
  const q = (f.zoek || '').trim().toLowerCase();
  const lijst = groepen.filter((g) => {
    if (!g.levering.centrum) return false;
    if (weergave === 'belangrijk' && !(vraagtAandacht(g) || g.levering.modus === 'prioriteit')) return false;
    if (weergave === 'ongelezen' && !g.ongelezen) return false;
    if (weergave !== 'alle' && g.toestand === 'archief') return false;
    const h = g.hoofd;
    if (f.dienst?.length && !f.dienst.includes(h.dienst)) return false;
    if (f.account?.length && !f.account.includes(h.account || '')) return false;
    if (f.categorie?.length && !f.categorie.includes(h.categorie || '')) return false;
    if (f.toestand?.length && !f.toestand.includes(g.toestand)) return false;
    if (f.vanaf && h.tijd < f.vanaf) return false;
    if (f.tot && h.tijd > f.tot) return false;
    if (q && !`${h.titel} ${h.tekst || ''} ${h.dienst} ${h.aanbieder || ''} ${h.accountLabel || ''} ${h.account || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  if (f.sortering === 'oud') lijst.sort((a, b) => a.hoofd.tijd - b.hoofd.tijd);
  else if (f.sortering === 'ernst') lijst.sort((a, b) => ERNST_RANG[a.ernst] - ERNST_RANG[b.ernst] || b.hoofd.tijd - a.hoofd.tijd);
  return lijst;
}

/** Hoeveel accounts per aanbieder: bij >1 moet het account ALTIJD zichtbaar zijn. */
export function accountsPerAanbieder(items: readonly V2Melding[]): Map<string, number> {
  const s = new Map<string, Set<string>>();
  for (const i of items) { const a = i.aanbieder || i.dienst; if (!i.account) continue; const set = s.get(a) || new Set(); set.add(i.account); s.set(a, set); }
  return new Map([...s].map(([k, v]) => [k, v.size]));
}
/** Privacy: volledig adres alleen als nodig (meerdere accounts zonder label) of als de gebruiker het wil; anders gemaskeerd. */
export function accountWeergave(m: V2Melding, meerdere: boolean, volledig: boolean): string | null {
  if (m.accountLabel && !volledig) return m.accountLabel;
  if (!m.account) return m.accountLabel || null;
  if (!meerdere && !volledig) return m.accountLabel || null;
  if (volledig) return m.accountLabel ? `${m.accountLabel} · ${m.account}` : m.account;
  const at = m.account.indexOf('@');
  return at > 1 ? `${m.account[0]}…${m.account.slice(at)}` : m.account;
}
