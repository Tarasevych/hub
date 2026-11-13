// Soorten meldingen waarvoor de gebruiker zelf kiest: geluid, opduiken (toast) en tonen (18.10.2026, verzoek eigenaar: «у
// користувацькій панелі можна обеззвучити, вимкнути спливні сповіщення для будь-якого типу»).
// Zonder afhankelijkheden: shared/menu-meldingen-voorkeuren.ts (browser én server) normaliseert hiermee het `sidebar`-veld.
// Welke serversoort (kind) bij welk type hoort, staat in shared/melding-soorten.ts.

export type MeldingRuimteType = 'prive' | 'technisch';
export type MeldingErnst = 'kritiek' | 'belangrijk' | 'info';

export type MeldingTypeInfo = {
  ruimte: MeldingRuimteType;
  naam: readonly [uk: string, nl: string];
  /** Kritiek: geluid en opduiken mogen uit, maar het type kan NIET helemaal verborgen worden (beveiliging/mislukte uitrol). */
  kritiek?: true;
};

export const MELDING_TYPES = {
  // ---------------------------------------------------------------- persoonlijk (account)
  post: { ruimte: 'prive', naam: ['Пошта', 'E-mail'] },
  agenda: { ruimte: 'prive', naam: ['Календар', 'Agenda'] },
  cloud: { ruimte: 'prive', naam: ['Хмара й файли', 'Cloud en bestanden'] },
  beveiliging: { ruimte: 'prive', naam: ['Безпека мого акаунта', 'Beveiliging van mijn account'], kritiek: true },
  toegang: { ruimte: 'prive', naam: ['Мій доступ і запити', 'Mijn toegang en verzoeken'] },
  delen: { ruimte: 'prive', naam: ['Спільний доступ', 'Delen'] },
  ai: { ruimte: 'prive', naam: ['ШІ-агенти (мій простір)', 'AI-agenten (mijn ruimte)'] },
  apparaten: { ruimte: 'prive', naam: ['Мої пристрої', 'Mijn apparaten'] },
  'inzage': { ruimte: 'prive', naam: ['Запити на перегляд мого акаунта', 'Verzoeken om mijn account in te zien'], kritiek: true },
  // INTEG-001: niet het vage «Інше» — wat er wel onder valt (meldingen van de site zelf: indeling, ruimte, concepten …).
  systeem: { ruimte: 'prive', naam: ['Сайт і система (решта)', 'Site en systeem (overige)'] },
  // ---------------------------------------------------------------- technisch (alleen wie een technisch profiel heeft)
  'tech.toegang': { ruimte: 'technisch', naam: ['Запити на доступ до сайту', 'Toegangsverzoeken voor de site'] },
  'tech.uitrol': { ruimte: 'technisch', naam: ['Оновлення сайту', 'Updates van de site'] },
  'tech.uitrol-mislukt': { ruimte: 'technisch', naam: ['Збій встановлення оновлення', 'Mislukte installatie van een update'], kritiek: true },
  'tech.server': { ruimte: 'technisch', naam: ['Сервер і служби', 'Server en diensten'] },
  'tech.diagnose': { ruimte: 'technisch', naam: ['Діагностика', 'Diagnose'] },
  'tech.audit': { ruimte: 'technisch', naam: ['Журнал і SIEM', 'Logboek en SIEM'] },
  'tech.grants': { ruimte: 'technisch', naam: ['Права агентів і підготовників', 'Rechten van agenten en voorbereiders'] },
  'tech.geheimen': { ruimte: 'technisch', naam: ['Секрети й ключі', 'Geheimen en sleutels'] },
  'tech.integraties': { ruimte: 'technisch', naam: ['Інтеграції й Google-вхід', 'Integraties en Google-aanmelding'] },
  'tech.bescherming': { ruimte: 'technisch', naam: ['Захист (OPA, RLS, шлюз)', 'Beveiliging (OPA, RLS, poort)'], kritiek: true },
  'tech.ssh': { ruimte: 'technisch', naam: ['SSH-сертифікати', 'SSH-certificaten'] },
  'tech.remote': { ruimte: 'technisch', naam: ['Віддалений стіл', 'Extern bureaublad'] },
  'tech.impersonatie': { ruimte: 'technisch', naam: ['«Увійти як»: відповіді користувачів', '«Inloggen als»: antwoorden van gebruikers'] },
} as const satisfies Record<string, MeldingTypeInfo>;

export type MeldingType = keyof typeof MELDING_TYPES;
export const MELDING_TYPE_IDS = Object.keys(MELDING_TYPES) as MeldingType[];
export const isMeldingType = (v: unknown): v is MeldingType => typeof v === 'string' && Object.prototype.hasOwnProperty.call(MELDING_TYPES, v);
export const typeInfo = (t: MeldingType): MeldingTypeInfo => MELDING_TYPES[t];
export const isKritiekType = (t: MeldingType): boolean => (MELDING_TYPES[t] as MeldingTypeInfo).kritiek === true;

/**
 * Per type: geluid (bel), opduiken (pop-up), tonen (bel/geschiedenis), vast (blijft staan tot u sluit) en seconden (hoe lang de pop-up staat,
 * zonder «vast»; 0 = automatisch volgens soort en lengte, zie src/canoniek-meldingen.ts popupLevensduurMs).
 *
 * INTEG-001 (eigenaar: «Сповіщення не має висіти, доки його не закриють вручну»): GEEN enkel type staat nog standaard vast — ook
 * beveiliging niet (die blijft wel altijd zichtbaar en gaat na het sluiten naar het paneel). «Vast» geldt alleen als de gebruiker het
 * zelf koos (`vastGekozen`). Vroeger stond kritiek standaard vast en schreef elke andere wijziging die standaard mee in de opslag;
 * zo'n oude `vast: true` zonder eigen keuze telt niet meer.
 */
export type TypeVoorkeur = { geluid: boolean; opduiken: boolean; tonen: boolean; vast: boolean; seconden: number; vastGekozen?: boolean };
/** 0 = standaard (2 s); wie langer wil lezen houdt de muis of vinger op de melding. */
export const TOAST_SECONDEN_STANDAARD = 0;
export const TOAST_SECONDEN_KEUZES = [3, 5, 7, 10, 14, 20, 30, 60] as const;
export const standaardTypeVoorkeur = (_type?: MeldingType): TypeVoorkeur => ({
  geluid: true, opduiken: true, tonen: true, vast: false, seconden: TOAST_SECONDEN_STANDAARD,
});

export function normaliseerTypeVoorkeuren(raw: unknown): Record<MeldingType, TypeVoorkeur> {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const uit = {} as Record<MeldingType, TypeVoorkeur>;
  for (const t of MELDING_TYPE_IDS) {
    const v = r[t] && typeof r[t] === 'object' && !Array.isArray(r[t]) ? r[t] as Record<string, unknown> : {};
    const b = (x: unknown) => (typeof x === 'boolean' ? x : true);
    const sec = typeof v.seconden === 'number' ? Math.round(v.seconden) : NaN;
    const vast = v.vast === true && v.vastGekozen === true;
    uit[t] = {
      geluid: b(v.geluid), opduiken: b(v.opduiken), tonen: isKritiekType(t) ? true : b(v.tonen),
      vast, ...(vast ? { vastGekozen: true } : {}),
      seconden: Number.isFinite(sec) && sec > 0 ? Math.min(60, Math.max(2, sec)) : TOAST_SECONDEN_STANDAARD,
    };
  }
  return uit;
}

/** Effectieve voorkeur (kritiek → altijd tonen, wat er ook in de opslag staat; «vast» alleen als de gebruiker het koos). */
export function voorkeurVoor(v: Partial<Record<MeldingType, TypeVoorkeur>> | undefined, t: MeldingType): TypeVoorkeur {
  // Oude opslag (zonder vast/seconden) krijgt de standaard voor de ontbrekende velden.
  const x: TypeVoorkeur = v?.[t] ? { ...standaardTypeVoorkeur(t), ...v[t] } : standaardTypeVoorkeur(t);
  const vast = x.vast === true && x.vastGekozen === true;
  return { ...x, vast, tonen: isKritiekType(t) ? true : x.tonen };
}

/**
 * INTEG-001: één keuze «hoe» per type in gewone woorden (in plaats van drie losse schakelaars):
 *   beide        — pop-up met geluid
 *   popup        — pop-up zonder geluid
 *   geluid       — alleen het geluid, geen pop-up (de melding staat in het paneel)
 *   paneel       — stil, alleen in het paneel
 *   uit          — niet tonen (kan niet bij kritieke types)
 */
export type MeldingWeergave = 'beide' | 'popup' | 'geluid' | 'paneel' | 'uit';
export const MELDING_WEERGAVEN: readonly MeldingWeergave[] = ['beide', 'popup', 'geluid', 'paneel', 'uit'];
export function weergaveVan(v: Pick<TypeVoorkeur, 'geluid' | 'opduiken' | 'tonen'>): MeldingWeergave {
  if (!v.tonen) return 'uit';
  if (v.opduiken) return v.geluid ? 'beide' : 'popup';
  return v.geluid ? 'geluid' : 'paneel';
}
export function metWeergave(v: TypeVoorkeur, w: MeldingWeergave, t: MeldingType): TypeVoorkeur {
  if (w === 'uit' && isKritiekType(t)) w = 'paneel';
  return { ...v, tonen: w !== 'uit', opduiken: w === 'beide' || w === 'popup', geluid: w === 'beide' || w === 'geluid' };
}
