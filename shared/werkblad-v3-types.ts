// Werkblad v3 — gedeeld contract (browser, API, backend, DB). Alleen types en constanten, geen logica.
// Eigenaar van wijzigingen aan dit bestand: de data-laag-werker (Etappe A). Anderen vragen via de coördinator.

export type WerkbladRuimte = 'prive' | 'technisch';
export type ApparaatKlasse = 'computer' | 'tablet' | 'telefoon';
export type ItemSoort = 'shortcut' | 'folder' | 'widget';
export type CanvasModus = 'free' | 'snap' | 'flow';

export interface DesktopEntry {
  instanceId: string;            // uniek per laag, [a-z0-9-]{1,40}
  itemId: string;                // stabiele id uit het register (svc:..., pg:..., cmd:..., wdg:..., usr:...)
  kind: ItemSoort;
  x: number; y: number;          // logische CSS-px binnen het canvas
  w: number; h: number;          // grenzen komen uit het register
  z: number;
  locked?: boolean;
  parent?: string;               // instanceId van een map (kind:'folder'), één niveau diep
  titleOverride?: string;        // max 60 tekens, platte tekst
  iconOverride?: string;         // id uit het iconenregister, nooit vrije SVG/URL
  config?: Record<string, unknown>; // alleen waarden die het register toestaat
}

export interface CanvasLayout {
  mode: CanvasModus;
  canvasWidth: number;           // logische breedte waarop x/w zijn opgeslagen
  canvasHeight: number;
  items: DesktopEntry[];
}

export interface WerkbladV3 {
  v: 3;
  achtergrond: string;
  layouts: Partial<Record<ApparaatKlasse, CanvasLayout>>;
}

export const WERKBLAD_V3_FLAG = 'werkblad-v3';
export const WERKBLAD_V3_LIMIETEN = {
  maxItemsPerLaag: 400,
  maxMapNiveaus: 1,
  minAfm: 24, maxAfm: 4000,
  maxCanvas: 12000,
  maxTitel: 60,
  maxBytesBody: 400_000,
} as const;

// Registerregel (bibliotheek «Alles op de site»). Eén bron voor catalogus, launcher en server-validatie.
export type Beschikbaarheid = 'ready' | 'planned' | 'denied';
export interface RegisterItem {
  id: string;
  kind: ItemSoort;
  dienst?: string;
  route?: string;                // alleen via canonieke router; nooit vrije URL
  actionId?: string;             // veilige launcher-actie; schrijfacties bevestigen op de oorspronkelijke plek
  titel: { uk: string; nl: string };
  icoon: string;
  categorie: 'dienst' | 'pagina' | 'opdracht' | 'widget' | 'persoonlijk' | 'map' | 'technisch';
  ruimtes: WerkbladRuimte[];
  beschikbaarheid: Beschikbaarheid;
  standaardAfm: { w: number; h: number };
  minAfm: { w: number; h: number };
  maxAfm: { w: number; h: number };
  apparaten: ApparaatKlasse[];
  zoekwoorden: string[];
  singleton?: boolean;
  liveBron?: string;
}
