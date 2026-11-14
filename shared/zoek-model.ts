// ZOEKKERN v2 — HET UNIVERSELE ZOEKOBJECT EN HET CONTRACT VAN DE ZOEKKERN (Z1, 22.10.2026).
// Dit bestand is het contract tussen de kern (backend/zoek-index.ts), de bronnen (Z2: backend/zoek/*), OCR/archieven (Z3),
// de pagina /zoek (Z4: src/zoek/*) en de tests (Z5). Volledige uitleg: docs/zoek/ZOEKEN.nl.md §4 (bij
// elke wijziging van een handtekening bijwerken). Eén tabel: app.zoek_objecten (migrations/0100_zoek_kern.sql).
//
// De LADE (userId + ruimte) komt ALTIJD van de server (poort backend/ruimte-projecties.ts / gegevensLade), nooit uit het
// verzoek. Een object zonder lade bestaat niet; een object buiten de lade van de aanroep wordt geweigerd (ZOEK_LADE_MISMATCH).
import type { AiRuimte } from './ai-ruimte';

// ------------------------------------------------------------------------------------------------ talen
/** De negen talen van de opdracht. 'simple' = onbekend/gemengd. */
export const ZOEK_TALEN = ['uk', 'ru', 'nl', 'en', 'de', 'fr', 'pl', 'ro', 'bg'] as const;
export type ZoekTaal = typeof ZOEK_TALEN[number];
export const isZoekTaal = (v: unknown): v is ZoekTaal => (ZOEK_TALEN as readonly string[]).includes(String(v));
/**
 * Welke PostgreSQL-stemmer er ECHT bestaat (geverifieerd op PG 16: `select cfgname from pg_ts_config`): dutch, english,
 * german, french, romanian, russian. GEEN ukrainian, bulgarian, polish → die talen krijgen 'simple' + de lichte
 * achtervoegselregels van shared/zoek-normalisatie.ts (lichteStam). Eerlijk: uk/bg/pl-morfologie is daardoor beperkt.
 */
export const PG_STEMMER: Readonly<Record<ZoekTaal, string | null>> = Object.freeze({
  uk: null, ru: 'russian', nl: 'dutch', en: 'english', de: 'german', fr: 'french', pl: null, ro: 'romanian', bg: null,
});

// ------------------------------------------------------------------------------------------------ bronnen en soorten
/**
 * Bronnen. Uitbreidbaar: voeg hier een naam toe (a-z en _; 2–32 tekens — dat is de CHECK in 0100) en, als de bron bij een
 * deelbare dienst hoort, de koppeling in DIENST_VAN_BRON. Een bron zonder dienst (ui/pagina/instelling/hulp) ligt in de
 * basislade van het verzoek (de ruimte van het tabblad).
 */
export const ZOEK_BRONNEN = ['ui', 'pagina', 'instelling', 'hulp', 'mail', 'bijlage', 'cloud', 'drive', 'agenda', 'bord', 'github', 'contact', 'apparaat'] as const;
export type ZoekBron = typeof ZOEK_BRONNEN[number];
export const isZoekBron = (v: unknown): v is ZoekBron => (ZOEK_BRONNEN as readonly string[]).includes(String(v));
/** Bron → deelbare dienst (shared/ruimte-scheiding.ts). null = basislade van het verzoek. 'calendar' (0093) heet nu 'agenda'. */
export const DIENST_VAN_BRON: Readonly<Record<ZoekBron, 'mail' | 'cloud' | 'agenda' | 'contacten' | 'ai' | 'bord' | 'github' | null>> = Object.freeze({
  ui: null, pagina: null, instelling: null, hulp: null,
  mail: 'mail', bijlage: 'mail', contact: 'contacten', cloud: 'cloud', drive: 'cloud', agenda: 'agenda', bord: 'bord', github: 'github', apparaat: 'ai',
});
export const BRON_NAAM: Readonly<Record<ZoekBron, { uk: string; nl: string }>> = Object.freeze({
  ui: { uk: 'Інтерфейс', nl: 'Interface' }, pagina: { uk: 'Сторінки', nl: 'Pagina’s' }, instelling: { uk: 'Налаштування', nl: 'Instellingen' },
  hulp: { uk: 'Довідка', nl: 'Hulp' }, mail: { uk: 'Пошта', nl: 'E-mail' }, bijlage: { uk: 'Вкладення', nl: 'Bijlagen' },
  cloud: { uk: 'Хмара', nl: 'Cloud' }, drive: { uk: 'Drive', nl: 'Drive' }, agenda: { uk: 'Календар', nl: 'Agenda' },
  bord: { uk: 'Дошка', nl: 'Bord' }, github: { uk: 'GitHub', nl: 'GitHub' }, contact: { uk: 'Контакти', nl: 'Contacten' },
  apparaat: { uk: 'Пристрої', nl: 'Apparaten' },
});

export const ZOEK_SOORTEN = [
  'pagina', 'knop', 'menu', 'actie', 'veld', 'instelling', 'dialoog', 'integratie', 'hulp',          // interface
  'bericht', 'bijlage', 'bestand', 'map', 'notitie', 'taak', 'afspraak', 'repo', 'issue', 'pull', 'commit', 'contact', 'apparaat', 'overig',
] as const;
export type ZoekSoort = typeof ZOEK_SOORTEN[number];
export const isZoekSoort = (v: unknown): v is ZoekSoort => (ZOEK_SOORTEN as readonly string[]).includes(String(v));
/** Soorten die een HANDELING zijn (korte zoekvragen-als-opdracht «змінити мову» krijgen hiervoor een bonus). */
export const ACTIE_SOORTEN: ReadonlySet<ZoekSoort> = new Set<ZoekSoort>(['pagina', 'knop', 'menu', 'actie', 'veld', 'instelling', 'dialoog', 'integratie', 'hulp']);
/** Rang van de soort bij gelijke titeltreffer: een pagina/menu staat boven een instelling, die boven een knop/veld. */
export const SOORT_RANG: Readonly<Record<string, number>> = Object.freeze({ pagina: 1.0, menu: 1.0, instelling: 0.7, integratie: 0.6, hulp: 0.5, actie: 0.4, dialoog: 0.3, knop: 0.25, veld: 0.2 });

/** Bestandsformaat (facet). Vrij veld; deze waarden zijn de aanbevolen canon. */
export const ZOEK_FORMATEN = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv', 'md', 'html', 'json', 'zip', 'afbeelding', 'audio', 'video', 'overig'] as const;

// ------------------------------------------------------------------------------------------------ het object
/**
 * Hosts van een route: de diensten van de site (public/canonical-service.js → domains). 'id' en 'identity' zijn dezelfde dienst
 * (id.*): de UI-catalogus (backend/zoek/catalogus-ui.ts) schrijft de dienst-id, de oudere bronnen 'id'. 'huis', 'api' en 'admin'
 * ontbraken tot 05.11.2026, waardoor de client elk catalogusobject van die diensten zonder link toonde (ORCH-001, oude fout).
 */
export const ZOEK_ROUTE_HOSTS = ['hub', 'mail', 'cloud', 'id', 'identity', 'mcp', 'ai', 'github', 'huis', 'api', 'admin'] as const;
/**
 * Veilige overgang: host = dienst van de site, pad = waar binnen die dienst. Nooit een vrije URL.
 * `pad` is een pad («/instellingen») OF een tabblad-id van die dienst («account», «local»: zo schrijven de UI-catalogus en de
 * adapters het). De client (src/zoek/zoek-kern.ts → routeUrl) maakt van een tabblad-id het canonieke Nederlandse pad
 * (/<slug>, public/canonical-service.js → tabSlug); een onbekend tabblad of onveilig pad → «/».
 */
export type ZoekRoute = { host: typeof ZOEK_ROUTE_HOSTS[number]; pad: string; hash?: string; params?: Record<string, string> };

export type ZoekRechten = { userId: string; ruimte: AiRuimte; integratie?: string };

export type ZoekObject = {
  /** Stabiel id binnen (lade, bron): bv. mail-id, bestand-id, 'instellingen/taal'. Max 700 tekens. */
  id: string;
  bron: ZoekBron;
  soort: ZoekSoort;
  /** Canonieke titel (de taal van de bron). Gewicht A. */
  titel: string;
  /** Titel per taal (ui/instelling/pagina: uk + nl). Alle vormen gaan in het titelveld (gewicht A). */
  titels?: Partial<Record<ZoekTaal, string>>;
  /** Korte omschrijving / wat deze knop of pagina DOET (gewicht C). */
  omschrijving?: string;
  /** Volledige tekst voor FTS (gewicht D); max 200 000 tekens, de rest wordt afgekapt. */
  tekst?: string;
  /** Extra trefwoorden / alternatieve namen / synoniemen van de bron zelf (gewicht B). */
  trefwoorden?: string[];
  /** Waar het fragment vandaan komt (voor de uitleg op de kaart). */
  fragmentBron?: 'tekst' | 'omschrijving' | 'ocr' | 'bijlage' | 'titel';
  /** Context/plaats, leesbaar: «Налаштування › Мова», «Inbox › werk@…». */
  pad?: string;
  route?: ZoekRoute | null;
  /** Taal van de inhoud; '' = onbekend (de kern raadt dan op schrift en stopwoorden). */
  taal?: ZoekTaal | '';
  formaat?: string;
  bijgewerktOp: number;        // ms sinds epoch
  aangemaaktOp?: number;
  /** Versie/hash van de inhoud. Leeg → de kern berekent sha256 over de inhoudsvelden. Gelijk aan de bewaarde versie = overslaan. */
  versie?: string;
  /** Vrije metagegevens (jsonb): afzender, mime, grootte, repo, paginanummer … Max 8 KiB. GEEN geheimen. */
  extra?: Record<string, unknown>;
  rechten: ZoekRechten;
};

// ------------------------------------------------------------------------------------------------ zoeken
export type ZoekSortering = 'relevantie' | 'nieuwste' | 'oudste' | 'titel';
export type ZoekVraag = {
  q: string;
  bronnen?: readonly ZoekBron[];
  soorten?: readonly ZoekSoort[];
  formaten?: readonly string[];
  talen?: readonly ZoekTaal[];
  /** ms sinds epoch, op bijgewerktOp. */
  sinds?: number;
  tot?: number;
  sorteer?: ZoekSortering;
  /** 1-gebaseerd. */
  pagina?: number;
  /** 1–100, standaard 20. */
  perPagina?: number;
  /** Standaard aan. */
  vaag?: boolean;
  synoniemen?: boolean;
  /** Facetten meetellen (tweede query). Standaard aan. */
  facets?: boolean;
};

export type ZoekUitlegCode =
  | 'exacte_titel' | 'volledige_zin' | 'voorvoegsel' | 'titelwoorden' | 'tekst' | 'omschrijving' | 'trefwoord'
  | 'synoniem' | 'vertaling' | 'translit' | 'stam' | 'vaag' | 'handeling' | 'vers' | 'gedeeltelijk';
export type ZoekUitleg = { code: ZoekUitlegCode; uk: string; nl: string };
export type ZoekFragment = { tekst: string; bron: 'titel' | 'omschrijving' | 'tekst'; posities: Array<[number, number]> };

export type ZoekTreffer = {
  id: string; bron: ZoekBron; soort: ZoekSoort; titel: string; titels: Partial<Record<ZoekTaal, string>>;
  omschrijving: string; pad: string; route: ZoekRoute | null; taal: ZoekTaal | ''; formaat: string;
  bijgewerktOp: number; extra: Record<string, unknown>; integratie: string;
  /** Ruwe score (zie zoek-API.md, «Ранжування»). */
  score: number;
  /** «Відповідність запиту» 0–100, monotone normalisatie t.o.v. het maximum in DEZE zoekopdracht. */
  percent: number;
  uitleg: ZoekUitleg[];
  fragment: ZoekFragment;
};
export type ZoekFacets = { bron: Record<string, number>; soort: Record<string, number>; formaat: Record<string, number>; taal: Record<string, number> };
export type ZoekSuggestieSoort = 'aanvulling' | 'functie' | 'pagina' | 'categorie' | 'correctie' | 'synoniem';
export type ZoekSuggestie = { soort: ZoekSuggestieSoort; tekst: string; label?: { uk: string; nl: string }; bron?: ZoekBron; id?: string; route?: ZoekRoute | null; aantal?: number };
export type ZoekAntwoord = {
  q: string; qNorm: string;
  items: ZoekTreffer[];
  /** Alleen aanwezig als ze echt geteld zijn (facets !== false). */
  facets?: ZoekFacets;
  /** Correcties («Можливо, ви мали на увазі»); het origineel blijft altijd geldig. */
  suggesties: ZoekSuggestie[];
  totaal: number; pagina: number; perPagina: number;
  /** 'index' = app.zoek_objecten; 'live' = de aanroeper viel terug op het geheugen (lege index voor deze lade). */
  bron: 'index' | 'live';
  /** true = de strikte vraag (≥ ½ van de woordgroepen) gaf niets; dit zijn treffers op WILLEKEURIG welke groep (uitleg 'gedeeltelijk'). */
  verzwakt?: boolean;
  duurMs: number;
  versie: typeof ZOEK_VERSIE;
};
export const ZOEK_VERSIE = 'zoek-kern-2' as const;

// ------------------------------------------------------------------------------------------------ stand per bron
export const BRON_STANDEN = ['niet_gekoppeld', 'indexeert', 'gedeeltelijk', 'fout', 'klaar'] as const;
export type BronStandNaam = typeof BRON_STANDEN[number];
export type ZoekBronStand = {
  bron: ZoekBron; stand: BronStandNaam;
  /** 0–100. */
  voortgang: number;
  /** Aantal objecten in de index voor deze lade+bron (geteld, niet beweerd). */
  aantal: number;
  laatsteOk: number; laatstePoging: number; fout: string; versie: string; bijgewerktOp: number;
};
export const BRON_STAND_NAAM: Readonly<Record<BronStandNaam, { uk: string; nl: string }>> = Object.freeze({
  niet_gekoppeld: { uk: 'Не підключено', nl: 'Niet gekoppeld' },
  indexeert: { uk: 'Індексується', nl: 'Indexeert' },
  gedeeltelijk: { uk: 'Частково', nl: 'Gedeeltelijk' },
  fout: { uk: 'Помилка', nl: 'Fout' },
  klaar: { uk: 'Готово', nl: 'Klaar' },
});

// ------------------------------------------------------------------------------------------------ synoniemen (eigenaar)
export type ZoekSynoniemGroep = { canoniek: string; taal: ZoekTaal | 'multi'; synoniemen: string[]; bron: 'ingebouwd' | 'eigenaar'; domein?: string };

/** Achterwaartse compatibiliteit (Etap A+B): oude naam van de soort per bron. */
export const SOORT_VAN_BRON: Readonly<Partial<Record<ZoekBron, ZoekSoort>>> = Object.freeze({
  mail: 'bericht', bijlage: 'bijlage', drive: 'bestand', cloud: 'bestand', agenda: 'afspraak', bord: 'taak', github: 'repo', contact: 'contact', apparaat: 'apparaat',
  ui: 'knop', pagina: 'pagina', instelling: 'instelling', hulp: 'hulp',
});
