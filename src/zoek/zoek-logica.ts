// /zoek — zuivere logica zonder DOM/React (Z4, 22.10.2026): categorieën ↔ bronnen, filters ↔ serververzoek (ZoekVraag),
// URL ↔ staat, geschiedenis-samenvoeging (nieuw / niet meer beschikbaar) en de stand van de bronnen. Gedeeld door
// ZoekPagina, ZoekPalet en tests/eenheid/zoek-ui-20261022.test.ts. Alle tellingen komen van de server (facets); hier wordt niets geraden.
import { ZOEK_BRONNEN, ZOEK_FORMATEN, ZOEK_SOORTEN, ZOEK_TALEN, isZoekBron, isZoekSoort, isZoekTaal, type ZoekBron, type ZoekBronStand, type ZoekFacets, type ZoekSoort, type ZoekSortering, type ZoekTaal, type ZoekTreffer, type ZoekVraag } from '../../shared/zoek-model';

export type Categorie = 'all' | 'mail' | 'files' | 'paginas' | 'instellingen' | 'agenda' | 'github' | 'bord' | 'overig';
export const CATEGORIEEN: readonly Categorie[] = ['all', 'mail', 'files', 'paginas', 'instellingen', 'agenda', 'github', 'bord', 'overig'];
/** Categorie → bronnen (alle bronnen van shared/zoek-model.ts komen precies één keer voor). */
export const CATEGORIE_BRONNEN: Readonly<Record<Categorie, readonly ZoekBron[]>> = Object.freeze({
  all: [], mail: ['mail', 'bijlage'], files: ['cloud', 'drive'], paginas: ['pagina', 'ui', 'hulp'], instellingen: ['instelling'],
  agenda: ['agenda'], github: ['github'], bord: ['bord'], overig: ['contact', 'apparaat'],
});
export const CATEGORIE_NAAM: Readonly<Record<Categorie, { uk: string; nl: string }>> = Object.freeze({
  all: { uk: 'Усе', nl: 'Alles' }, mail: { uk: 'Пошта', nl: 'E-mail' }, files: { uk: 'Файли', nl: 'Bestanden' }, paginas: { uk: 'Сторінки', nl: 'Pagina’s' },
  instellingen: { uk: 'Налаштування', nl: 'Instellingen' }, agenda: { uk: 'Календар', nl: 'Agenda' }, github: { uk: 'GitHub', nl: 'GitHub' }, bord: { uk: 'Дошка', nl: 'Bord' }, overig: { uk: 'Інше', nl: 'Overig' },
});
export const SOORT_NAAM: Readonly<Record<ZoekSoort, { uk: string; nl: string }>> = Object.freeze({
  pagina: { uk: 'Сторінка', nl: 'Pagina' }, knop: { uk: 'Кнопка', nl: 'Knop' }, menu: { uk: 'Меню', nl: 'Menu' }, actie: { uk: 'Дія', nl: 'Actie' }, veld: { uk: 'Поле', nl: 'Veld' },
  instelling: { uk: 'Налаштування', nl: 'Instelling' }, dialoog: { uk: 'Діалог', nl: 'Dialoog' }, integratie: { uk: 'Інтеграція', nl: 'Integratie' }, hulp: { uk: 'Довідка', nl: 'Hulp' },
  bericht: { uk: 'Лист', nl: 'E-mail' }, bijlage: { uk: 'Вкладення', nl: 'Bijlage' }, bestand: { uk: 'Файл', nl: 'Bestand' }, map: { uk: 'Тека', nl: 'Map' }, notitie: { uk: 'Нотатка', nl: 'Notitie' },
  taak: { uk: 'Задача', nl: 'Taak' }, afspraak: { uk: 'Подія', nl: 'Afspraak' }, repo: { uk: 'Репозиторій', nl: 'Repository' }, issue: { uk: 'Issue', nl: 'Issue' }, pull: { uk: 'Pull request', nl: 'Pull request' },
  commit: { uk: 'Коміт', nl: 'Commit' }, contact: { uk: 'Контакт', nl: 'Contact' }, apparaat: { uk: 'Пристрій', nl: 'Apparaat' }, overig: { uk: 'Інше', nl: 'Overig' },
});
export const TAAL_NAAM: Readonly<Record<ZoekTaal, string>> = Object.freeze({ uk: 'Українська', ru: 'Русский', nl: 'Nederlands', en: 'English', de: 'Deutsch', fr: 'Français', pl: 'Polski', ro: 'Română', bg: 'Български' });

/** Bron → categorie (elke bron zit in precies één categorie; zie de test zoek-etap-d). */
export const categorieVanBron = (b: ZoekBron): Categorie => (Object.keys(CATEGORIE_BRONNEN) as Categorie[]).find(c => c !== 'all' && CATEGORIE_BRONNEN[c].includes(b)) || 'overig';

// ---------------------------------------------------------------- weergave (zone D, 22.10.2026): lijst/raster en «за джерелами»
export type Weergave = 'lijst' | 'raster';
export type Ordening = 'relevantie' | 'bron';
export const WEERGAVE_SLEUTEL = 'mr.zoek.weergave.v1';
export type WeergaveKeuze = { weergave: Weergave; ordening: Ordening };
export const STANDAARD_WEERGAVE: WeergaveKeuze = Object.freeze({ weergave: 'lijst', ordening: 'relevantie' }) as WeergaveKeuze;
/** Alleen gemak per browser (localStorage); zonder opslag: de standaard. Onbekende waarden vallen terug op de standaard. */
export function leesWeergave(opslag: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): WeergaveKeuze {
  try { const v = JSON.parse(opslag?.getItem(WEERGAVE_SLEUTEL) || 'null') as Partial<WeergaveKeuze> | null; return { weergave: v?.weergave === 'raster' ? 'raster' : 'lijst', ordening: v?.ordening === 'bron' ? 'bron' : 'relevantie' }; } catch { return { ...STANDAARD_WEERGAVE }; }
}
export function bewaarWeergave(k: WeergaveKeuze, opslag: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined' ? localStorage : null): void {
  try { opslag?.setItem(WEERGAVE_SLEUTEL, JSON.stringify(k)); } catch { /* geen opslag: niet erg */ }
}
export type Groep<T> = { categorie: Categorie; items: T[] };
/**
 * «За джерелами»: de treffers gegroepeerd per categorie, in de vaste volgorde van CATEGORIEEN, binnen een groep in de volgorde van de
 * server (relevantie/sortering blijft). Lege groepen worden weggelaten; 'all' bestaat niet als groep. Zuiver, zonder DOM.
 */
export function groepeerPerCategorie<T extends Pick<ZoekTreffer, 'bron'>>(items: readonly T[]): Groep<T>[] {
  const per = new Map<Categorie, T[]>();
  for (const it of items) { const c = categorieVanBron(it.bron); const l = per.get(c) || []; l.push(it); per.set(c, l); }
  return CATEGORIEEN.filter(c => c !== 'all' && per.has(c)).map(c => ({ categorie: c, items: per.get(c)! }));
}

export type DatumPreset = 'any' | 'd1' | 'd7' | 'd30' | 'y1' | 'eigen';
export const DATUM_PRESETS: readonly DatumPreset[] = ['any', 'd1', 'd7', 'd30', 'y1', 'eigen'];
export type MinPercent = 0 | 50 | 75 | 90;
export const MIN_PERCENTEN: readonly MinPercent[] = [0, 50, 75, 90];
export type IndexStandFilter = 'alle' | 'klaar';
export const SORTERINGEN: readonly ZoekSortering[] = ['relevantie', 'nieuwste', 'oudste', 'titel'];

export interface ZoekFilters {
  bronnen: ZoekBron[]; soorten: ZoekSoort[]; formaten: string[]; talen: ZoekTaal[];
  datum: DatumPreset; van: string; tot: string;   // van/tot: YYYY-MM-DD bij datum 'eigen'
  minPercent: MinPercent; indexStand: IndexStandFilter; sorteer: ZoekSortering;
}
export const LEEG_FILTER: ZoekFilters = Object.freeze({ bronnen: [], soorten: [], formaten: [], talen: [], datum: 'any', van: '', tot: '', minPercent: 0, indexStand: 'alle', sorteer: 'relevantie' }) as ZoekFilters;
export const PER_PAGINA = 20;
const DAG = 864e5;
const datumOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const sindsVoor = (f: Pick<ZoekFilters, 'datum' | 'van'>, now = Date.now()): number =>
  f.datum === 'any' ? 0 : f.datum === 'eigen' ? (datumOk(f.van) ? Date.parse(f.van) : 0) : now - ({ d1: 1, d7: 7, d30: 30, y1: 365 }[f.datum]) * DAG;
export const totVoor = (f: Pick<ZoekFilters, 'datum' | 'tot'>): number => f.datum === 'eigen' && datumOk(f.tot) ? Date.parse(f.tot) + DAG - 1 : 0;

/** Aantal actieve filtervoorwaarden (voor de teller op de knop «Фільтри»). */
export const aantalFilters = (f: ZoekFilters): number =>
  f.bronnen.length + f.soorten.length + f.formaten.length + f.talen.length + (f.datum !== 'any' ? 1 : 0) + (f.minPercent ? 1 : 0) + (f.indexStand !== 'alle' ? 1 : 0) + (f.sorteer !== 'relevantie' ? 1 : 0);

/** Bronnen die ECHT iets kunnen opleveren: gekoppeld volgens /zoek/stand (null = stand onbekend → alles). */
export const gekoppeldeBronnen = (stand: readonly ZoekBronStand[] | null): ZoekBron[] =>
  stand ? stand.filter(s => s.stand !== 'niet_gekoppeld').map(s => s.bron) : [...ZOEK_BRONNEN];
/** Categorieën die zichtbaar zijn: 'all' altijd; een andere alleen als minstens één bron ervan gekoppeld is. */
export const zichtbareCategorieen = (stand: readonly ZoekBronStand[] | null): Categorie[] => {
  const g = new Set(gekoppeldeBronnen(stand));
  return CATEGORIEEN.filter(c => c === 'all' || CATEGORIE_BRONNEN[c].some(b => g.has(b)));
};
/** Teller per categorie uit de facets van de server (undefined = niet geteld → geen getal tonen). */
export const categorieTelling = (c: Categorie, facets: ZoekFacets | undefined): number | undefined => {
  if (!facets) return undefined;
  const b = facets.bron || {};
  return c === 'all' ? Object.values(b).reduce((a, n) => a + n, 0) : CATEGORIE_BRONNEN[c].reduce((a, s) => a + (b[s] || 0), 0);
};

/**
 * Effectieve bronnen voor het serververzoek = categorie ∩ bronfilter ∩ (indexStand 'klaar' → alleen bronnen met stand klaar).
 * Leeg = «alle» (de server beslist). Een lege doorsnede valt terug op de categorie (de filterkeuze geldt dan niet).
 */
export function effectieveBronnen(cat: Categorie, f: Pick<ZoekFilters, 'bronnen' | 'indexStand'>, stand: readonly ZoekBronStand[] | null = null): ZoekBron[] {
  const c = CATEGORIE_BRONNEN[cat];
  let uit: ZoekBron[] = !c.length ? [...f.bronnen] : !f.bronnen.length ? [...c] : c.filter(s => f.bronnen.includes(s));
  if (c.length && !uit.length) uit = [...c];
  if (f.indexStand === 'klaar' && stand) {
    const klaar = new Set(stand.filter(s => s.stand === 'klaar').map(s => s.bron));
    const basis = uit.length ? uit : [...ZOEK_BRONNEN];
    uit = basis.filter(b => klaar.has(b));
  }
  return uit;
}
/** Filter «лише повністю проіндексовані» staat aan en geen enkele bron in beeld is klaar → niets vragen, eerlijk melden. */
export const nietsGeindexeerd = (cat: Categorie, f: Pick<ZoekFilters, 'bronnen' | 'indexStand'>, stand: readonly ZoekBronStand[] | null): boolean =>
  f.indexStand === 'klaar' && !!stand && effectieveBronnen(cat, f, stand).length === 0;

/** Het serververzoek (ZoekVraag) uit de staat van de pagina — elk filter gaat ECHT mee. */
export function bouwVraag(q: string, cat: Categorie, f: ZoekFilters, pagina = 1, stand: readonly ZoekBronStand[] | null = null, now = Date.now()): ZoekVraag {
  const bronnen = effectieveBronnen(cat, f, stand), sinds = sindsVoor(f, now), tot = totVoor(f);
  return {
    q: q.trim().slice(0, 300), ...(bronnen.length ? { bronnen } : {}), ...(f.soorten.length ? { soorten: f.soorten } : {}), ...(f.formaten.length ? { formaten: f.formaten } : {}),
    ...(f.talen.length ? { talen: f.talen } : {}), ...(sinds ? { sinds } : {}), ...(tot ? { tot } : {}), sorteer: f.sorteer, pagina: Math.max(1, pagina), perPagina: PER_PAGINA, facets: true,
  };
}
/** De filters zoals ze in de geschiedenis staan (0103): alleen gevulde sleutels, in vaste volgorde. */
export function filtersVoorGeschiedenis(cat: Categorie, f: ZoekFilters): Record<string, unknown> {
  const uit: Record<string, unknown> = {};
  if (cat !== 'all') uit.cat = cat;
  if (f.bronnen.length) uit.bronnen = [...f.bronnen].sort();
  if (f.soorten.length) uit.soorten = [...f.soorten].sort();
  if (f.formaten.length) uit.formaten = [...f.formaten].sort();
  if (f.talen.length) uit.talen = [...f.talen].sort();
  if (f.datum !== 'any') uit.datum = f.datum;
  if (f.datum === 'eigen' && f.van) uit.van = f.van;
  if (f.datum === 'eigen' && f.tot) uit.tot = f.tot;
  if (f.minPercent) uit.minPercent = f.minPercent;
  if (f.indexStand !== 'alle') uit.indexStand = f.indexStand;
  if (f.sorteer !== 'relevantie') uit.sorteer = f.sorteer;
  return uit;
}
/** Terug: filters uit een geschiedenisrij (onbekende waarden vallen weg). */
export function filtersUitGeschiedenis(v: Record<string, unknown>): { cat: Categorie; f: ZoekFilters } {
  const l = (k: string) => (Array.isArray(v[k]) ? (v[k] as unknown[]).map(String) : []);
  return {
    cat: CATEGORIEEN.find(c => c === v.cat) || 'all',
    f: {
      bronnen: l('bronnen').filter(isZoekBron), soorten: l('soorten').filter(isZoekSoort), formaten: l('formaten').filter(x => (ZOEK_FORMATEN as readonly string[]).includes(x)), talen: l('talen').filter(isZoekTaal),
      datum: DATUM_PRESETS.find(d => d === v.datum) || 'any', van: datumOk(String(v.van || '')) ? String(v.van) : '', tot: datumOk(String(v.tot || '')) ? String(v.tot) : '',
      minPercent: MIN_PERCENTEN.find(m => m === Number(v.minPercent)) || 0, indexStand: v.indexStand === 'klaar' ? 'klaar' : 'alle', sorteer: SORTERINGEN.find(s => s === v.sorteer) || 'relevantie',
    },
  };
}

/** Client-side vangnet dat de server niet kent: «-woord» uitsluiten en de minimale «Відповідність» (percent is een serverwaarde). */
export function filterLokaal<T extends Pick<ZoekTreffer, 'titel' | 'pad' | 'omschrijving' | 'fragment' | 'percent'>>(rs: readonly T[], f: Pick<ZoekFilters, 'minPercent'>, excl: readonly string[] = []): T[] {
  return rs.filter(r => r.percent >= f.minPercent && !excl.some(w => `${r.titel} ${r.pad} ${r.omschrijving} ${r.fragment?.tekst || ''}`.toLocaleLowerCase().includes(w)));
}
/** "factuur -concept" → serververzoek «factuur» + lokaal uit te sluiten woorden. */
export function parseQuery(raw: string): { query: string; excludeTerms: string[] } {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  const excludeTerms = parts.filter(p => p.length > 2 && p.startsWith('-')).map(p => p.slice(1).toLocaleLowerCase());
  return { query: parts.filter(p => !(p.length > 2 && p.startsWith('-'))).join(' '), excludeTerms };
}

// ---------------------------------------------------------------- geschiedenis: momentopname ⇄ actueel
export type TrefferRef = { bron: string; id: string };
export type Markering = 'nieuw' | 'gebleven';
/** Zuiver: actuele treffers gemarkeerd als «nieuw» (niet in de momentopname) en de verwijzingen die «niet meer beschikbaar» zijn. Zonder dubbels. */
export function markeerTegenMomentopname<T extends TrefferRef>(momentopname: readonly TrefferRef[], actueel: readonly T[]): { items: Array<T & { markering: Markering }>; weg: TrefferRef[] } {
  const k = (t: TrefferRef) => `${t.bron}\u0000${t.id}`;
  const toen = new Set(momentopname.map(k)); const gezien = new Set<string>();
  const items: Array<T & { markering: Markering }> = [];
  for (const t of actueel) { const s = k(t); if (gezien.has(s)) continue; gezien.add(s); items.push({ ...t, markering: toen.has(s) ? 'gebleven' : 'nieuw' }); }
  const wegGezien = new Set<string>();
  const weg = momentopname.filter(t => { const s = k(t); if (gezien.has(s) || wegGezien.has(s)) return false; wegGezien.add(s); return true; });
  return { items, weg };
}

// ---------------------------------------------------------------- URL ⇄ staat
/** ?q=…&cat=mail&bron=mail,bijlage&soort=bericht&formaat=pdf&taal=uk&datum=d7|eigen&van=…&tot=…&min=75&index=klaar&sorteer=nieuwste */
export function leesUrl(search: string): { q: string; cat: Categorie; f: ZoekFilters; focus: string } {
  const p = new URLSearchParams(search); const lijst = (k: string) => (p.get(k) || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    q: (p.get('q') || '').slice(0, 300), cat: CATEGORIEEN.find(c => c === p.get('cat')) || 'all', focus: (p.get('focus') || '').slice(0, 120),
    f: {
      bronnen: lijst('bron').filter(isZoekBron), soorten: lijst('soort').filter(isZoekSoort), formaten: lijst('formaat').filter(x => (ZOEK_FORMATEN as readonly string[]).includes(x)), talen: lijst('taal').filter(isZoekTaal),
      datum: DATUM_PRESETS.find(d => d === p.get('datum')) || 'any', van: datumOk(p.get('van') || '') ? String(p.get('van')) : '', tot: datumOk(p.get('tot') || '') ? String(p.get('tot')) : '',
      minPercent: MIN_PERCENTEN.find(m => m === Number(p.get('min'))) || 0, indexStand: p.get('index') === 'klaar' ? 'klaar' : 'alle', sorteer: SORTERINGEN.find(s => s === p.get('sorteer')) || 'relevantie',
    },
  };
}
export function schrijfUrl(base: string, q: string, cat: Categorie, f: ZoekFilters): string {
  const u = new URL(base); const set = (k: string, v: string) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
  set('q', q.trim()); set('cat', cat === 'all' ? '' : cat); set('bron', f.bronnen.join(',')); set('soort', f.soorten.join(',')); set('formaat', f.formaten.join(',')); set('taal', f.talen.join(','));
  set('datum', f.datum === 'any' ? '' : f.datum); set('van', f.datum === 'eigen' ? f.van : ''); set('tot', f.datum === 'eigen' ? f.tot : '');
  set('min', f.minPercent ? String(f.minPercent) : ''); set('index', f.indexStand === 'klaar' ? 'klaar' : ''); set('sorteer', f.sorteer === 'relevantie' ? '' : f.sorteer);
  u.searchParams.delete('focus');
  return `${u.pathname}${u.search}${u.hash}`;
}
export const ALLE_SOORTEN = ZOEK_SOORTEN; export const ALLE_FORMATEN = ZOEK_FORMATEN; export const ALLE_TALEN = ZOEK_TALEN; export const ALLE_BRONNEN = ZOEK_BRONNEN;
