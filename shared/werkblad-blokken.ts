// Werkblad «Blokken» — gedeeld contract (browser, API, backend). Alleen types, constanten en handtekeningen van PURE functies.
// Ontwerp: docs/ontwerp/WERKBLAD-BLOKKEN.md. Vlag: `werkblad-blokken` (standaard UIT = exact het gedrag van Werkblad v3).
// Eigenaar van dit bestand: stroom A (data). Wijzigingen alleen via de coördinator; andere stromen importeren, wijzigen niet.
// Uitbreiding is ADDITIEF: WerkbladV3 blijft `v: 3`; een DesktopEntry van soort 'widget' of 'folder' kan een optioneel veld
// `blok` krijgen. Zonder `blok` tekent alles zoals nu (automatisch raster, automatische icoongrootte).

import type { ApparaatKlasse, DesktopEntry } from './werkblad-v3-types';

export const WERKBLAD_BLOKKEN_VLAG = 'werkblad-blokken';
export const BLOKKEN_SCHEMA = 1; // versie van het `blok`-veld zelf (los van v:3)

export const BLOKKEN_LIMIETEN = {
  maxDiepte: 4,            // blok in blok in blok in blok; dieper = weigeren
  maxOnderdelenPerBlok: 60,
  maxKnopenTotaal: 400,    // telt mee met WERKBLAD_V3_LIMIETEN.maxItemsPerLaag
  minPx: 16, maxPx: 4000,
  maxTussenruimte: 128, maxBinnenrand: 128,
  maxStraal: 64,
  maxIcoonPx: 256, minIcoonPx: 12,
  maxGeschiedenis: 50,
} as const;

// ------------------------------------------------------------------ maten
/** Eén maat. 'auto' = huidig gedrag (inhoud/omgeving bepaalt). */
export type Maat =
  | { soort: 'auto' }
  | { soort: 'px'; waarde: number }        // vaste logische CSS-px
  | { soort: 'procent'; waarde: number }   // 1–100 van de binnenmaat van het ouderblok
  | { soort: 'deel'; waarde: number };     // aandeel van de vrije ruimte (1–12), zoals flex-grow
export const MAAT_AUTO: Maat = { soort: 'auto' };

export interface Afmeting {
  breedte: Maat; hoogte: Maat;
  minBreedte?: number; maxBreedte?: number; minHoogte?: number; maxHoogte?: number; // px
}

// ------------------------------------------------------------------ blok (container)
export type BlokModus = 'vrij' | 'rij' | 'kolom' | 'raster';
export type Uitlijning = 'begin' | 'midden' | 'eind' | 'rek' | 'verdeeld';
export interface BlokIndeling {
  modus: BlokModus;
  tussenruimte: number;          // px tussen onderdelen
  binnenrand: number;            // px rondom binnen het blok
  uitlijningHoofd: Uitlijning;   // langs de rij/kolom
  uitlijningDwars: Uitlijning;   // dwars erop
  omloop: boolean;               // rij/kolom: doorlopen naar een volgende regel
  richting: 'normaal' | 'omgekeerd';
  rasterKolommen?: number | 'auto'; // raster: vast aantal kolommen, of 'auto' (= huidig auto-fill)
  rasterMinCel?: number;            // raster 'auto': minimale celbreedte px (nu 84)
  rasterRijHoogte?: Maat;
  /** Alleen modus 'vrij': onderdelen mogen elkaar overlappen (standaard false = ze schuiven opzij). */
  overlapToestaan?: boolean;
}
export const STANDAARD_INDELING: BlokIndeling = {
  modus: 'raster', tussenruimte: 8, binnenrand: 0, uitlijningHoofd: 'rek', uitlijningDwars: 'rek',
  omloop: true, richting: 'normaal', rasterKolommen: 'auto', rasterMinCel: 84, rasterRijHoogte: MAAT_AUTO,
};

// ------------------------------------------------------------------ uiterlijk
/** Kleuren alleen als thematoken of #rrggbb; nooit vrije CSS. 'thema' = niets overschrijven. */
export type Kleur = 'thema' | `token:${string}` | `#${string}`;
export interface Uiterlijk {
  achtergrond?: Kleur; icoonKleur?: Kleur; tekstKleur?: Kleur; randKleur?: Kleur;
  randDikte?: number;            // 0–8 px
  vorm?: 'rechthoek' | 'afgerond' | 'cirkel' | 'pil';
  straal?: number;               // px, alleen bij 'afgerond'
  doorzichtigheid?: number;      // 0.2–1
  schaduw?: 'geen' | 'zacht' | 'sterk';
}
export interface Icoon {
  grootte: Maat;                 // 'auto' = huidig (36px kader / 20px tekening, kleiner in smalle blokken)
  stijl?: 'kader' | 'los' | 'rond';
  vervang?: string;              // id uit het iconenregister, nooit SVG/URL
}
export interface Label {
  tonen: 'ja' | 'nee' | 'auto';
  plaats: 'onder' | 'rechts' | 'boven' | 'links';
  grootte?: 'mini' | 'klein' | 'normaal' | 'groot';
  tekst?: string;                // max 60 tekens, platte tekst
}

// ------------------------------------------------------------------ boom
export type KnoopId = string;    // [a-z0-9-]{1,40}, uniek binnen het hele werkblad (per laag)

interface KnoopBasis {
  id: KnoopId;
  afmeting: Afmeting;
  positie?: { x: number; y: number; z: number }; // alleen gebruikt als de ouder modus 'vrij' heeft
  volgorde: number;              // rij/kolom/raster
  rasterSpan?: { kolommen: number; rijen: number };
  uiterlijk?: Uiterlijk;
  apparaten?: Partial<Record<ApparaatKlasse, 'tonen' | 'verbergen'>>; // ontbreekt = overal tonen
  vergrendeld?: boolean;
}
/** Onderdeel = één aanklikbaar ding (snelkoppeling uit het register of een kleine widget). */
export interface Onderdeel extends KnoopBasis {
  soort: 'onderdeel';
  itemId: string;                // stabiele register-id (svc:/pg:/cmd:/wdg:/usr:); doel komt ALTIJD uit het register
  icoon?: Icoon; label?: Label;
  config?: Record<string, unknown>; // alleen waarden die het register toestaat
}
export interface Blok extends KnoopBasis {
  soort: 'blok';
  titel?: string;
  indeling: BlokIndeling;
  kinderen: Knoop[];
  standaardOnderdeel?: { icoon?: Icoon; label?: Label; uiterlijk?: Uiterlijk }; // geldt voor kinderen zonder eigen waarde
}
export type Knoop = Onderdeel | Blok;

/** Het nieuwe, optionele veld op een DesktopEntry (widget of map). */
export interface BlokInhoud {
  schema: typeof BLOKKEN_SCHEMA;
  wortel: Blok;
  bron?: 'widget-standaard' | 'eigen'; // 'widget-standaard' = automatisch afgeleid, nog niet aangepast
}
export type EntryMetBlok = DesktopEntry & { blok?: BlokInhoud };

// ------------------------------------------------------------------ plekken (waar iets mag staan)
export type PlekSoort = 'canvas' | 'blok' | 'menu' | 'pagina' | 'zijbalk' | 'werkbalk';
export interface Plek {
  soort: PlekSoort;
  id: string;                    // 'canvas:<klasse>' | 'blok:<knoopId>' | 'menu:<lijst>' | 'pagina:<route>#<vak>' | ...
  aanvaardt: Array<'onderdeel' | 'blok' | 'widget'>;
  maxDiepte?: number; maxAantal?: number;
  maten?: Array<'klein' | 'middel' | 'groot'>; // smalle plekken (menu) staan alleen kleine maten toe
}
export type Sleepbron =
  | { van: 'canvas'; instanceId: string }
  | { van: 'blok'; knoopId: KnoopId }
  | { van: 'menu'; sleutel: string }
  | { van: 'bibliotheek'; itemId: string };
export interface Neerzetting { doel: Plek; voor: KnoopId | null; positie?: { x: number; y: number }; kopie: boolean }
export type NeerzetOordeel =
  | { ok: true; omzetting?: 'onderdeel→snelkoppeling' | 'snelkoppeling→onderdeel' | 'onderdeel→menu' }
  | { ok: false; reden: 'kring' | 'te-diep' | 'vol' | 'soort-niet-toegestaan' | 'niet-toegestaan-in-ruimte' | 'vergrendeld' | 'maat-past-niet' };

// ------------------------------------------------------------------ uitkomst van de rekenmachine
export interface Kader { x: number; y: number; w: number; h: number }
export interface Berekend { id: KnoopId; kader: Kader; icoonPx: number; labelTonen: boolean; diepte: number }

// ------------------------------------------------------------------ voorinstellingen
export type VoorinstellingId = 'grote-iconen' | 'compacte-rij' | 'kolom' | 'raster-automatisch' | 'vrij';
export const VOORINSTELLINGEN: Record<VoorinstellingId, { uk: string; nl: string; indeling: Partial<BlokIndeling>; icoon?: Partial<Icoon>; label?: Partial<Label> }> = {
  'raster-automatisch': { uk: 'Автоматично (як зараз)', nl: 'Automatisch (zoals nu)', indeling: STANDAARD_INDELING },
  'grote-iconen': { uk: 'Великі значки', nl: 'Grote iconen', indeling: { modus: 'raster', rasterKolommen: 'auto', rasterMinCel: 120 }, icoon: { grootte: { soort: 'px', waarde: 56 } } },
  'compacte-rij': { uk: 'Компактний ряд', nl: 'Compacte rij', indeling: { modus: 'rij', omloop: false, tussenruimte: 4 }, icoon: { grootte: { soort: 'px', waarde: 24 } }, label: { tonen: 'nee' } },
  kolom: { uk: 'Колонка', nl: 'Kolom', indeling: { modus: 'kolom', omloop: false, uitlijningDwars: 'rek' }, label: { tonen: 'ja', plaats: 'rechts' } },
  vrij: { uk: 'Вільно (куди завгодно)', nl: 'Vrij (waar je wilt)', indeling: { modus: 'vrij' } },
};

// ------------------------------------------------------------------ handtekeningen van pure functies
// Uitvoering: stroom A (valideer*, migreer*, boom-bewerkingen) en stroom B (bereken*, doel*). Geen DOM, geen netwerk.
export type ValideerUitkomst = { ok: true; waarde: BlokInhoud } | { ok: false; fouten: string[] };
export interface BlokkenFuncties {
  /** Server én browser: vorm, limieten, diepte, unieke ids, geen kring, alleen toegestane itemIds/kleuren. */
  valideerBlok(invoer: unknown, toegestaan: (itemId: string) => boolean): ValideerUitkomst;
  /** Leidt de huidige inhoud van een widget (bv. «Швидкий доступ», 12 tegels) af als blok met modus 'raster' en alles 'auto'. */
  blokUitWidget(widgetId: string, itemIds: string[]): BlokInhoud;
  /** Map (kind:'folder' + kinderen met parent) → blok; omgekeerd voor terugdraaien. Verliesvrij. */
  blokUitMap(map: DesktopEntry, kinderen: DesktopEntry[]): BlokInhoud;
  mapUitBlok(map: EntryMetBlok): { map: DesktopEntry; kinderen: DesktopEntry[] } | null;
  /** Rekenmachine: binnenmaat van het blok → kaders van alle knopen (rij/kolom/raster/vrij, geneste blokken, min/max). */
  bereken(wortel: Blok, binnen: { w: number; h: number }, apparaat: ApparaatKlasse): Berekend[];
  /** 'auto'-icoongrootte zoals nu: 36 → 28 px onder 380 px blokbreedte. Vaste maat wint altijd. */
  icoonPx(icoon: Icoon | undefined, blokBreedte: number): number;
  zoekKnoop(wortel: Blok, id: KnoopId): { knoop: Knoop; ouder: Blok | null; pad: KnoopId[] } | null;
  /** Mag dit hier neer? Kringen (blok in eigen kind), diepte, aantal, soort, ruimte (prive/technisch), vergrendeling. */
  beoordeelNeerzetting(bron: Sleepbron, n: Neerzetting, context: { wortels: Blok[]; plekken: Plek[] }): NeerzetOordeel;
  verplaats(wortel: Blok, id: KnoopId, naarBlok: KnoopId, voor: KnoopId | null, positie?: { x: number; y: number }): Blok;
  wijzig(wortel: Blok, id: KnoopId, deel: Partial<Omit<Onderdeel, 'id' | 'soort'>> | Partial<Omit<Blok, 'id' | 'soort' | 'kinderen'>>): Blok;
  /** Eén eigenschap terug naar standaard («Скинути»). pad bv. 'icoon.grootte' of 'uiterlijk.achtergrond'. */
  herstelEigenschap(wortel: Blok, id: KnoopId, pad: string): Blok;
  pasVoorinstellingToe(wortel: Blok, id: KnoopId, v: VoorinstellingId): Blok;
  groepeer(wortel: Blok, ids: KnoopId[], modus: BlokModus): Blok;   // «blok in blok» maken
  ontgroepeer(wortel: Blok, blokId: KnoopId): Blok;
  /** Uit een blok naar het canvas: onderdeel → zelfstandige snelkoppeling (DesktopEntry kind 'shortcut'), stijl blijft. */
  naarCanvas(o: Onderdeel, plek: { x: number; y: number; z: number }, instanceId: string): DesktopEntry;
  vanCanvas(e: DesktopEntry, knoopId: KnoopId): Onderdeel;
}

// ------------------------------------------------------------------ opslag en API (stroom A, ADDITIEF 28.10.2026)
// Routes: POST /api/owner/hub/werkblad/v3/blokken/{laden,bewaren,plek-bewaren,herstellen}. Versie = de LAAGVERSIE van v3
// (app.werkblad_layout.versie) voor blokken op een DesktopEntry; plekken hebben een eigen versie per plek. Botsing → 409
// WERKBLAD_V3_VEROUDERD (zelfde code als v3). Vlag uit → laden {aan:false}, schrijven 403 WERKBLAD_BLOKKEN_UIT; herstellen werkt altijd.
/** Plek-id buiten het canvas (menu, pagina-vak, zijbalk, werkbalk). Canvas en blokken zitten in werkblad_items, niet hier. */
export const PLEK_ID_RE = /^(menu|pagina|zijbalk|werkbalk):[a-z0-9][a-z0-9._/#-]{0,79}$/;
export const KNOOP_ID_RE = /^[a-z0-9-]{1,40}$/;
export const BLOKKEN_OPSLAG = { maxBytesBlok: 65536, maxBytesBackup: 1048576, maxPlekken: 64 } as const;
export type BlokkenFoutcode =
  | 'WERKBLAD_BLOKKEN_UIT' | 'WERKBLAD_V3_VEROUDERD' | 'WERKBLAD_BLOKKEN_ONGELDIG' | 'WERKBLAD_BLOKKEN_TE_GROOT'
  | 'WERKBLAD_BLOKKEN_GEEN_ITEM' | 'WERKBLAD_BLOKKEN_PLEK_ONGELDIG' | 'WERKBLAD_BLOKKEN_GEEN_BACKUP' | 'WERKBLAD_BLOKKEN_MISLUKT';
/** Alle blokken van één laag: instanceId (widget/map) → inhoud. */
export interface BlokkenLaag { versie: number; blokken: Record<string, BlokInhoud> }
export interface PlekStand { plekId: string; blok: BlokInhoud; versie: number; bijgewerktOp: number }
export interface BlokkenStand {
  ruimte: 'prive' | 'technisch';
  lagen: Partial<Record<ApparaatKlasse, BlokkenLaag>>;
  plekken: PlekStand[];
  backup: { op: number; heeftVoor: boolean; heeftNa: boolean } | null;
}
/** Momentopname in app.werkblad_v3_lade.blokken_backup. `na` = stand na de laatste schrijf (herstel na een oude release),
 *  `voor` = stand vlak daarvoor (laatste wijziging ongedaan maken). */
export interface BlokkenMomentopname { lagen: Partial<Record<ApparaatKlasse, Record<string, BlokInhoud>>>; plekken: Record<string, BlokInhoud> }
export interface BlokkenBackup { op: number; voor: BlokkenMomentopname | null; na: BlokkenMomentopname | null }
