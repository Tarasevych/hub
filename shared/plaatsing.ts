// Plaatsing van de zwevende knoppen: ZONES en GNIEZDA (25.10.2026, melding van de eigenaar).
//
// Klacht: op de telefoon trilde/verdween «Написати» bij scrollen en schoof de bel in de bovenbalk; bij inzoomen werd de bel bijna
// schermgroot en bleef hij in de hoek van het SCHERM. Gemeten (stand plaatsing-nu): de bel rekende vanaf visualViewport («hoek van
// het scherm» letterlijk), «Написати» rekende vanaf de bel (met een overgang van 0,25 s), één positie (x,y) gold voor alle apparaten.
//
// Nu: een ZONE is een deel van de PAGINA (bovenbalk, kop van het menu, het menu zelf, actiestapel rechtsonder in het inhoudsvlak),
// geen hoek van het scherm. Een knop heeft één GNIEZDO in één zone; de browser legt de zone uit (flex), dus knoppen kunnen niet over
// elkaar liggen, bewegen niet mee met scrollen, adresbalk of zoom en rekenen nooit vanaf elkaar. De keuze van de gebruiker geldt per
// apparaatklasse (telefoon / tablet / computer) en staat op de server (zijbalkvoorkeuren, veld `plaatsing`).
//
// Zuiver: geen DOM, geen React — gedeeld door browser, server (normalisatie), bouwcontrole en tests
// (tests/eenheid/plaatsing-20261025.test.ts, scripts/plaatsing-controle.mjs).

export const KLASSEN = ['telefoon', 'tablet', 'computer'] as const;
export type Klasse = typeof KLASSEN[number];
/** Dezelfde grens als de lade van het menu (CanoniekOmlijsting: max-width:700px). */
export const TELEFOON_MAX = 700;
export const TABLET_MAX = 1099;
export function klasseVan(breedte: number): Klasse {
  return breedte <= TELEFOON_MAX ? 'telefoon' : breedte <= TABLET_MAX ? 'tablet' : 'computer';
}

/** De zones uit het macket (MAKET-PLAVAYUCHI-KNOPKY-2026-10-25): bovenbalk, kop van het menu (telefoon), het menu, actiestapel. */
export const ZONES = ['bovenbalk', 'lade-kop', 'zijbalk', 'actiestapel'] as const;
export type ZoneId = typeof ZONES[number];
/** Verplaatsbare knoppen. Zoeken en account zijn BEWONERS: ze hebben een vaste plek in hun zone en tellen mee voor de ruimte. */
export const KNOPPEN = ['bel', 'opstellen', 'naar-boven'] as const;
export type KnopId = typeof KNOPPEN[number];
export type BewonerId = 'zoeken' | 'account';
export type ItemId = KnopId | BewonerId;

export const isZone = (v: unknown): v is ZoneId => (ZONES as readonly string[]).includes(String(v));
export const isKnop = (v: unknown): v is KnopId => (KNOPPEN as readonly string[]).includes(String(v));
export const isKlasse = (v: unknown): v is Klasse => (KLASSEN as readonly string[]).includes(String(v));

/** In welke richting de gniezda van een zone lopen. */
export const ZONE_RICHTING: Record<ZoneId, 'rij' | 'kolom'> = { bovenbalk: 'rij', 'lade-kop': 'rij', zijbalk: 'kolom', actiestapel: 'kolom' };
/** Vorm van een knop in een zone: rond (bovenbalk, kop van het menu, stapel) of als regel van het menu (icoon + naam). */
export const ZONE_VORM: Record<ZoneId, 'rond' | 'rij'> = { bovenbalk: 'rond', 'lade-kop': 'rond', zijbalk: 'rij', actiestapel: 'rond' };
/** Zones die je pas ziet als het menu open is (telefoon: de lade). Staat de bel daar, dan telt ☰ de nieuwe meldingen. */
export const IN_LADE: readonly ZoneId[] = ['lade-kop', 'zijbalk'];

/** Hoeveel gniezda een zone heeft (bewoners en knoppen van de dienst meegeteld); 0 = de zone bestaat niet in deze klasse. */
export const PLAATSEN: Record<ZoneId, Record<Klasse, number>> = {
  bovenbalk: { telefoon: 5, tablet: 6, computer: 6 },
  'lade-kop': { telefoon: 2, tablet: 0, computer: 0 },
  zijbalk: { telefoon: 3, tablet: 3, computer: 3 },
  actiestapel: { telefoon: 3, tablet: 3, computer: 3 },
};

/** Knoppen van de dienst zelf rechts in de bovenbalk (ze staan links van de zone en tellen mee voor de ruimte). Post: ⟳ en ⚙,
 *  op de telefoon ook de foto van de mailbox. Andere diensten hebben daar niets. */
export const DIENST_BOVEN: Record<string, Partial<Record<Klasse, number>>> = { mail: { telefoon: 3, tablet: 2, computer: 2 } };

/** In welke zones een knop mag staan. «Вгору» hoort bij de inhoud: alleen in de actiestapel. */
export const KNOP_ZONES: Record<KnopId, readonly ZoneId[]> = {
  bel: ['bovenbalk', 'lade-kop', 'zijbalk', 'actiestapel'],
  opstellen: ['actiestapel', 'bovenbalk', 'lade-kop', 'zijbalk'],
  'naar-boven': ['actiestapel'],
};

export type Plek = { zone: ZoneId; index: number };

/** Standaardplaatsen, zoals de eigenaar ze beschreef (25.10.2026):
 *  telefoon — bel in de kop van het menu rechts van de foto; «Написати» rechtsonder boven de lijst, daarboven het gniezdo van «Вгору»;
 *  tablet/computer — bel in de bovenbalk rechts van de foto; «Написати» en «Вгору» in de actiestapel. */
export const STANDAARD: Record<Klasse, Record<KnopId, Plek>> = {
  telefoon: { bel: { zone: 'lade-kop', index: 1 }, opstellen: { zone: 'actiestapel', index: 0 }, 'naar-boven': { zone: 'actiestapel', index: 1 } },
  tablet: { bel: { zone: 'bovenbalk', index: 1 }, opstellen: { zone: 'actiestapel', index: 0 }, 'naar-boven': { zone: 'actiestapel', index: 1 } },
  computer: { bel: { zone: 'bovenbalk', index: 1 }, opstellen: { zone: 'actiestapel', index: 0 }, 'naar-boven': { zone: 'actiestapel', index: 1 } },
};

/** Wat de pagina bepaalt: klasse, dienst, en of zoeken in het menu staat (post: in de lade / werkbalk, elders in de bovenbalk). */
export type PaginaContext = { klasse: Klasse; dienst: string; zoekInMenu: boolean };

export function zoneBestaat(zone: ZoneId, ctx: PaginaContext): boolean {
  return PLAATSEN[zone][ctx.klasse] > 0;
}

/** Bewoners VOORAAN die niet op elke pagina bestaan (zoeken buiten de post): altijd eerst, tellen niet mee voor de index — zo staat
 *  «rechts van de foto» op de post en elders op dezelfde plek. */
export function voorBewoners(zone: ZoneId, ctx: PaginaContext): BewonerId[] {
  return zone === 'bovenbalk' && zoneBestaat(zone, ctx) && !ctx.zoekInMenu ? ['zoeken'] : [];
}
/** Vaste bewoners: de index van een knop telt vanaf hier (foto = account). */
export function bewoners(zone: ZoneId, ctx: PaginaContext): BewonerId[] {
  if (!zoneBestaat(zone, ctx)) return [];
  if (zone === 'bovenbalk') return ctx.klasse === 'telefoon' ? [] : ['account'];
  if (zone === 'lade-kop') return ['account'];
  return [];
}
export const dienstKnoppen = (zone: ZoneId, ctx: PaginaContext): number => (zone === 'bovenbalk' && zoneBestaat(zone, ctx) ? DIENST_BOVEN[ctx.dienst]?.[ctx.klasse] ?? 0 : 0);

/** Of een knop op deze pagina bestaat. «Написати» alleen bij de post; bel en «Вгору» overal (het gniezdo van «Вгору» blijft
 *  gereserveerd, ook als hij even niet getoond wordt — daarom springt «Написати» niet als «Вгору» verschijnt). */
export function knopAanwezig(knop: KnopId, ctx: PaginaContext): boolean {
  return knop === 'opstellen' ? ctx.dienst === 'mail' : true;
}

export type PlaatsingKlasse = Partial<Record<KnopId, Plek>>;
export type PlaatsingVoorkeur = { versie: 1; klassen: Partial<Record<Klasse, PlaatsingKlasse>> };
export const standaardPlaatsing = (): PlaatsingVoorkeur => ({ versie: 1, klassen: {} });
export const MAX_INDEX = 20;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** Strikte normalisatie (browser én server): onbekende klassen/knoppen weg, zone moet de knop toelaten, index 0..MAX_INDEX. */
export function normaliseerPlaatsing(raw: unknown): PlaatsingVoorkeur {
  const r = obj(raw), uit = standaardPlaatsing();
  for (const k of KLASSEN) {
    const waarde = obj(obj(r.klassen)[k]);
    const per: PlaatsingKlasse = {};
    for (const knop of KNOPPEN) {
      if (!(knop in waarde)) continue;
      const p = obj(waarde[knop]), zone = p.zone, index = Number(p.index);
      if (!isZone(zone) || !KNOP_ZONES[knop].includes(zone) || PLAATSEN[zone][k] === 0 || !Number.isFinite(index)) continue;
      per[knop] = { zone, index: Math.max(0, Math.min(MAX_INDEX, Math.round(index))) };
    }
    if (Object.keys(per).length) uit.klassen[k] = per;
  }
  return uit;
}

export type ZoneItem = { id: ItemId; bewoner: boolean };
/** `voor`: bewoners vooraan (zonder index); `lijst`: vaste bewoners en knoppen in volgorde (hierin telt de index). */
export type ZoneInhoud = { voor: BewonerId[]; lijst: ZoneItem[]; dienst: number };
export type Indeling = { zones: Record<ZoneId, ZoneInhoud>; plek: Partial<Record<KnopId, ZoneId>> };

export const bezet = (z: ZoneInhoud) => z.voor.length + z.lijst.length + z.dienst;

/** De wens van de gebruiker voor deze klasse, anders de standaard. Een zone die hier niet bestaat of de knop niet toelaat → standaard. */
function wens(v: PlaatsingVoorkeur, knop: KnopId, ctx: PaginaContext): Plek {
  const eigen = v.klassen[ctx.klasse]?.[knop];
  if (eigen && KNOP_ZONES[knop].includes(eigen.zone) && zoneBestaat(eigen.zone, ctx)) return eigen;
  const std = STANDAARD[ctx.klasse][knop];
  if (zoneBestaat(std.zone, ctx)) return std;
  const andere = KNOP_ZONES[knop].find((z) => zoneBestaat(z, ctx));
  return { zone: andere || 'actiestapel', index: MAX_INDEX };
}

const legeZones = (ctx: PaginaContext) => Object.fromEntries(ZONES.map((z) => [z, {
  voor: voorBewoners(z, ctx), lijst: bewoners(z, ctx).map((id) => ({ id, bewoner: true })), dienst: dienstKnoppen(z, ctx),
}])) as Record<ZoneId, ZoneInhoud>;

/**
 * Welke knop staat op deze pagina in welke zone, in welke volgorde. Deterministisch: dezelfde voorkeur + dezelfde pagina geeft altijd
 * dezelfde indeling (geen timing, geen metingen, geen cookies). Een volle zone neemt een knop niet aan: die gaat naar zijn standaardzone
 * (en als die ook vol is, naar de eerste zone met ruimte) — er wordt nooit iets stil uit een zone geduwd.
 */
export function indeling(v: PlaatsingVoorkeur, ctx: PaginaContext): Indeling {
  const zones = legeZones(ctx);
  const plek: Partial<Record<KnopId, ZoneId>> = {};
  const wensen = KNOPPEN.filter((k) => knopAanwezig(k, ctx)).map((k, volgorde) => ({ k, volgorde, p: wens(v, k, ctx) }));
  // eerst de laagste index (zoals de gebruiker ze neerzette), bij gelijke index de vaste volgorde van KNOPPEN
  wensen.sort((a, b) => a.p.index - b.p.index || a.volgorde - b.volgorde);
  const ruimte = (z: ZoneId) => zoneBestaat(z, ctx) && bezet(zones[z]) < PLAATSEN[z][ctx.klasse];
  for (const { k, p } of wensen) {
    let zone = p.zone, index = p.index;
    if (!ruimte(zone)) {
      const std = STANDAARD[ctx.klasse][k];
      const alt = [std.zone, ...KNOP_ZONES[k]].find((z) => ruimte(z));
      if (!alt) continue; // nergens plaats (kan met de standaardindeling niet gebeuren; tests en de bouwcontrole bewaken dat)
      zone = alt; index = alt === std.zone ? std.index : MAX_INDEX;
    }
    const lijst = zones[zone].lijst;
    lijst.splice(Math.min(index, lijst.length), 0, { id: k, bewoner: false });
    plek[k] = zone;
  }
  return { zones, plek };
}

export type Weigering = 'niet-toegestaan' | 'geen-zone' | 'vol';
export type VerplaatsUitkomst = { ok: true; v: PlaatsingVoorkeur; index: number } | { ok: false; reden: Weigering };

/** Mag `knop` naar `doel`? (zonder hem te verplaatsen; voor het oplichten van zones tijdens het slepen en «Перемістити до…») */
export function magNaar(v: PlaatsingVoorkeur, ctx: PaginaContext, knop: KnopId, doel: ZoneId): { ok: true } | { ok: false; reden: Weigering } {
  if (!KNOP_ZONES[knop].includes(doel)) return { ok: false, reden: 'niet-toegestaan' };
  if (!zoneBestaat(doel, ctx)) return { ok: false, reden: 'geen-zone' };
  const nu = indeling(v, ctx);
  if (nu.plek[knop] !== doel && bezet(nu.zones[doel]) >= PLAATSEN[doel][ctx.klasse]) return { ok: false, reden: 'vol' };
  return { ok: true };
}

/**
 * Knop `knop` naar zone `doel` op positie `index` (in de lijst van de zone ZONDER de knop zelf, vaste bewoners meegeteld). Weigert
 * een volle zone met reden 'vol' (de eigenaar: «спершу приберіть звідти кнопку»). Daarna krijgen alle verplaatsbare knoppen in bron-
 * en doelzone hun werkelijke positie als index, zodat de volgorde na herladen precies zo is als op het scherm.
 */
export function verplaats(v: PlaatsingVoorkeur, ctx: PaginaContext, knop: KnopId, doel: ZoneId, index: number): VerplaatsUitkomst {
  const mag = magNaar(v, ctx, knop, doel);
  if (!mag.ok) return mag;
  const nu = indeling(v, ctx);
  const zonder = nu.zones[doel].lijst.filter((x) => x.id !== knop);
  const i = Math.max(0, Math.min(Math.round(Number.isFinite(index) ? index : zonder.length), zonder.length));
  const nieuweLijst: ZoneItem[] = [...zonder.slice(0, i), { id: knop, bewoner: false }, ...zonder.slice(i)];
  const per: PlaatsingKlasse = { ...(v.klassen[ctx.klasse] || {}) };
  const vastleggen = (zone: ZoneId, lijst: ZoneItem[]) => lijst.forEach((x, pos) => { if (!x.bewoner && isKnop(x.id)) per[x.id] = { zone, index: pos }; });
  vastleggen(doel, nieuweLijst);
  const bron = nu.plek[knop];
  if (bron && bron !== doel) vastleggen(bron, nu.zones[bron].lijst.filter((x) => x.id !== knop));
  return { ok: true, v: normaliseerPlaatsing({ versie: 1, klassen: { ...v.klassen, [ctx.klasse]: per } }), index: i };
}

/** Eén knop (of alle knoppen) van deze klasse terug naar de standaardplaats. */
export function terugzetten(v: PlaatsingVoorkeur, klasse: Klasse, knop?: KnopId): PlaatsingVoorkeur {
  const per: PlaatsingKlasse = { ...(v.klassen[klasse] || {}) };
  if (knop) delete per[knop]; else for (const k of KNOPPEN) delete per[k];
  const klassen = { ...v.klassen, [klasse]: per };
  if (!Object.keys(per).length) delete klassen[klasse];
  return normaliseerPlaatsing({ versie: 1, klassen });
}

/** Of een knop door de gebruiker verplaatst is (voor «Повернути на типове місце»). */
export const isVerplaatst = (v: PlaatsingVoorkeur, klasse: Klasse, knop: KnopId) => Boolean(v.klassen[klasse]?.[knop]);
/** Of een klasse iets anders heeft dan de standaard (voor «Скинути все до типового»). */
export const heeftEigen = (v: PlaatsingVoorkeur, klasse: Klasse) => Boolean(v.klassen[klasse] && Object.keys(v.klassen[klasse]!).length);

// ---- maten van de actiestapel (dezelfde getallen staan in src/plaatsing/plaatsing.css; venster-dok-logica en tests rekenen ermee)
/** Gniezdo van de actiestapel: telefoon 52 px (aanraken ≥ 44 px), anders 48 px. Afstand tussen gniezda en tot de randen. */
export const STAPEL_GNIEZDO: Record<Klasse, number> = { telefoon: 52, tablet: 48, computer: 48 };
export const STAPEL_GAT = 12;
export const STAPEL_RAND: Record<Klasse, number> = { telefoon: 12, tablet: 16, computer: 20 };
/** In een iframe (de site in een venster van een ander programma): 72 px van de rand, zoals de bel vroeger (L002). */
export const IFRAME_INZET = 72;

export type Randen = { boven: number; onder: number; links: number; rechts: number };
/** Rechthoek van de actiestapel met `aantal` gniezda (vensterpixels), boven een onderbalk van `onder` px, rechts `rechts` px vrij
 *  (menu rechts) en de veilige rand. */
export function stapelRechthoek(klasse: Klasse, aantal: number, vw: number, vh: number, r: Randen = { boven: 0, onder: 0, links: 0, rechts: 0 }, onder = 0, inzet = 0, rechts = 0) {
  const g = STAPEL_GNIEZDO[klasse], rand = STAPEL_RAND[klasse] + inzet;
  const h = aantal > 0 ? aantal * g + (aantal - 1) * STAPEL_GAT : 0;
  const right = vw - r.rechts - rand - rechts, bottom = vh - r.onder - rand - onder;
  return { left: right - g, top: bottom - h, width: g, height: h, right, bottom };
}

/** Tekst voor mensen (uk/nl): zones, knoppen, weigeringen. Eén plek, zodat menu, aankondigingen en tests hetzelfde zeggen. */
export const ZONE_NAAM: Record<ZoneId, { uk: string; nl: string }> = {
  bovenbalk: { uk: 'Верхня панель', nl: 'Bovenbalk' },
  'lade-kop': { uk: 'Шапка меню', nl: 'Kop van het menu' },
  zijbalk: { uk: 'Список меню', nl: 'Menulijst' },
  actiestapel: { uk: 'Стос дій', nl: 'Actiestapel' },
};
export const KNOP_NAAM: Record<KnopId, { uk: string; nl: string }> = {
  bel: { uk: 'Дзвоник', nl: 'Bel' },
  opstellen: { uk: 'Написати', nl: 'Nieuw bericht' },
  'naar-boven': { uk: 'Вгору', nl: 'Naar boven' },
};
export function weigeringTekst(lang: 'uk' | 'nl', reden: Weigering, zone: ZoneId, ctx: PaginaContext): string {
  const z = ZONE_NAAM[zone][lang];
  if (reden === 'vol') {
    const n = PLAATSEN[zone][ctx.klasse];
    return lang === 'uk' ? `${z} · ${n} з ${n} — усі гнізда зайняті. Спершу приберіть звідси кнопку (утримайте її й перенесіть), тоді ставте нову.`
      : `${z} · ${n} van ${n} — alle plekken bezet. Haal hier eerst een knop weg (houd hem vast en sleep), zet dan de nieuwe.`;
  }
  if (reden === 'geen-zone') return lang === 'uk' ? `${z} немає на цьому пристрої.` : `${z} bestaat niet op dit apparaat.`;
  return lang === 'uk' ? `Ця кнопка не стає в «${z}».` : `Deze knop kan niet in «${z}».`;
}
export function tellerTekst(lang: 'uk' | 'nl', zone: ZoneId, inhoud: ZoneInhoud, ctx: PaginaContext): string {
  return `${ZONE_NAAM[zone][lang]} · ${bezet(inhoud)} ${lang === 'uk' ? 'з' : 'van'} ${PLAATSEN[zone][ctx.klasse]}`;
}
