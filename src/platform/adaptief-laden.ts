// UPD-012: адаптивне завантаження, визначення спроможностей пристрою й мережі,
// планувальник пріоритету натискання користувача та чесний облік активних запитів.
// Adaptief laden, netwerk- en toestelprofiel, klikprioriteit en nauwkeurige verzoektelling.

import {
  bepaalSchermProfiel,
  type BepaaldSchermProfiel,
} from '../../shared/scherm-profielen';

export type LaadModus = 'spaarzaam' | 'normaal' | 'snel';
export type LaadModusKeuze = 'auto' | LaadModus;

export const LAAD_MODUS_SLEUTEL = 'tsv:laad-modus';
const LAAD_MODUS_GEBEURTENIS = 'tsv:laad-modus-wijziging';
const KLIK_FOCUS_STANDAARD_MS = 2500;
const ORIENTATIE_DEBOUNCE_MS = 180;

export interface NetwerkInfo {
  readonly effectiveType?: string;
  readonly downlink?: number;
  readonly rtt?: number;
  readonly saveData?: boolean;
  addEventListener?: (type: string, listener: EventListener) => void;
  removeEventListener?: (type: string, listener: EventListener) => void;
}

export interface LaadProfielInvoer {
  readonly voorkeur?: LaadModusKeuze;
  readonly effectiveType?: string;
  readonly downlink?: number;
  readonly rtt?: number;
  readonly saveData?: boolean;
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
  readonly aanraking?: boolean;
}

export interface LaadProfiel {
  readonly modus: LaadModus;
  readonly voorkeur: LaadModusKeuze;
  readonly maxParallelAchtergrond: number;
  readonly vooruitladenToegestaan: boolean;
  readonly vooruitladenMax: number;
  readonly levendeAchtergrondToegestaan: boolean;
  readonly pollFactor: number;
  readonly mailCacheTtlMs: number;
  readonly redenen: readonly string[];
}

export interface LaadStand {
  readonly actief: number;
  readonly achtergrondActief: number;
  readonly totaalInBatch: number;
  readonly voltooidInBatch: number;
  readonly voortgang: number;
  readonly alleenAchtergrond: boolean;
  readonly klikFocus: boolean;
  readonly laatsteLabel: string;
}

export interface AchtergrondTaakOpties {
  readonly sleutel?: string;
  readonly prioriteit?: number;
  readonly label?: string;
}

type VerzoekOpties = { readonly achtergrond?: boolean };

const PROFIEL_WAARDEN: Record<LaadModus, Omit<LaadProfiel, 'modus' | 'voorkeur' | 'redenen'>> = {
  spaarzaam: {
    maxParallelAchtergrond: 1,
    vooruitladenToegestaan: false,
    vooruitladenMax: 0,
    levendeAchtergrondToegestaan: false,
    pollFactor: 3,
    mailCacheTtlMs: 180_000,
  },
  normaal: {
    maxParallelAchtergrond: 2,
    vooruitladenToegestaan: true,
    vooruitladenMax: 3,
    levendeAchtergrondToegestaan: true,
    pollFactor: 1.5,
    mailCacheTtlMs: 90_000,
  },
  snel: {
    maxParallelAchtergrond: 4,
    vooruitladenToegestaan: true,
    vooruitladenMax: 8,
    levendeAchtergrondToegestaan: true,
    pollFactor: 1,
    mailCacheTtlMs: 60_000,
  },
};

type UitgebreideNavigator = Navigator & {
  connection?: NetwerkInfo;
  mozConnection?: NetwerkInfo;
  webkitConnection?: NetwerkInfo;
  deviceMemory?: number;
};

function leesNetwerkInfo(): NetwerkInfo | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const nav = navigator as UitgebreideNavigator;
  return nav.connection || nav.mozConnection || nav.webkitConnection;
}

function isAanraakApparaat(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof window.matchMedia === 'function') {
      if (window.matchMedia('(pointer: coarse)').matches) return true;
      if (window.matchMedia('(hover: none)').matches) return true;
    }
  } catch {
    /* середовище без matchMedia */
  }
  return typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints || 0) > 0;
}

/** Читає збережений вибір користувача з localStorage['tsv:laad-modus']. */
export function leesLaadModusVoorkeur(): LaadModusKeuze {
  if (typeof localStorage === 'undefined') return 'auto';
  try {
    const ruw = localStorage.getItem(LAAD_MODUS_SLEUTEL);
    if (ruw === 'spaarzaam' || ruw === 'normaal' || ruw === 'snel' || ruw === 'auto') {
      return ruw;
    }
  } catch {
    /* приватний режим або недоступне сховище */
  }
  return 'auto';
}

/** Зберігає вибір режиму завантаження і миттєво оновлює стан сторінки та підписників. */
export function zetLaadModusVoorkeur(keuze: LaadModusKeuze): LaadProfiel {
  if (typeof localStorage !== 'undefined') {
    try {
      if (keuze === 'auto') localStorage.removeItem(LAAD_MODUS_SLEUTEL);
      else localStorage.setItem(LAAD_MODUS_SLEUTEL, keuze);
    } catch {
      /* сховище недоступне */
    }
  }
  const nieuw = pasAdaptiefProfielToe();
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent(LAAD_MODUS_GEBEURTENIS, { detail: nieuw }));
    } catch {
      /* без події вікна */
    }
  }
  return nieuw;
}

/**
 * Визначає режим завантаження (`spaarzaam` | `normaal` | `snel`) за показниками мережі,
 * обсягом пам’яті, кількістю ядер процесора та ручним вибором користувача.
 */
export function bepaalLaadProfiel(invoer?: LaadProfielInvoer): LaadProfiel {
  const voorkeur = invoer?.voorkeur ?? leesLaadModusVoorkeur();
  if (voorkeur !== 'auto') {
    return {
      modus: voorkeur,
      voorkeur,
      ...PROFIEL_WAARDEN[voorkeur],
      redenen: ['handmatig'],
    };
  }

  // На сервері без браузера використовуємо збалансований нейтральний режим.
  if (!invoer && typeof window === 'undefined') {
    return {
      modus: 'normaal',
      voorkeur: 'auto',
      ...PROFIEL_WAARDEN.normaal,
      redenen: ['server'],
    };
  }

  const net = leesNetwerkInfo();
  const nav = typeof navigator !== 'undefined' ? (navigator as UitgebreideNavigator) : undefined;

  const effectiveType = String(invoer?.effectiveType ?? net?.effectiveType ?? '').toLowerCase();
  const downlink = invoer?.downlink ?? (typeof net?.downlink === 'number' ? net.downlink : undefined);
  const rtt = invoer?.rtt ?? (typeof net?.rtt === 'number' ? net.rtt : undefined);
  const saveData = invoer?.saveData ?? Boolean(net?.saveData);
  const deviceMemory =
    invoer?.deviceMemory ?? (typeof nav?.deviceMemory === 'number' ? nav.deviceMemory : undefined);
  const hardwareConcurrency =
    invoer?.hardwareConcurrency ??
    (typeof nav?.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined);
  const aanraking = invoer?.aanraking ?? isAanraakApparaat();

  const redenen: string[] = [];
  if (saveData) redenen.push('save-data');
  if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') {
    redenen.push(`netwerk-${effectiveType}`);
  }
  if (typeof downlink === 'number' && Number.isFinite(downlink) && downlink > 0 && downlink < 2.5) {
    redenen.push('lage-bandbreedte');
  }
  if (typeof rtt === 'number' && Number.isFinite(rtt) && rtt > 250) {
    redenen.push('hoge-vertraging');
  }
  if (typeof deviceMemory === 'number' && Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 4) {
    redenen.push('geheugen-beperkt');
  }
  if (
    typeof hardwareConcurrency === 'number' &&
    Number.isFinite(hardwareConcurrency) &&
    hardwareConcurrency > 0 &&
    hardwareConcurrency <= 4
  ) {
    redenen.push('cpu-beperkt');
  }

  if (redenen.length > 0) {
    return {
      modus: 'spaarzaam',
      voorkeur: 'auto',
      ...PROFIEL_WAARDEN.spaarzaam,
      redenen,
    };
  }

  const normaalRedenen: string[] = [];
  if (typeof downlink === 'number' && Number.isFinite(downlink) && downlink >= 2.5 && downlink < 8) {
    normaalRedenen.push('gemiddelde-bandbreedte');
  }
  if (typeof rtt === 'number' && Number.isFinite(rtt) && rtt > 120 && rtt <= 250) {
    normaalRedenen.push('gemiddelde-vertraging');
  }
  if (typeof deviceMemory === 'number' && Number.isFinite(deviceMemory) && deviceMemory > 4 && deviceMemory < 8) {
    normaalRedenen.push('gemiddeld-geheugen');
  }
  if (
    typeof hardwareConcurrency === 'number' &&
    Number.isFinite(hardwareConcurrency) &&
    hardwareConcurrency > 4 &&
    hardwareConcurrency <= 6
  ) {
    normaalRedenen.push('gemiddelde-cpu');
  }
  if (aanraking && (downlink === undefined || downlink < 10)) {
    normaalRedenen.push('mobiel-evenwicht');
  }

  const modus: LaadModus = normaalRedenen.length > 0 ? 'normaal' : 'snel';
  return {
    modus,
    voorkeur: 'auto',
    ...PROFIEL_WAARDEN[modus],
    redenen: normaalRedenen,
  };
}

// ------------------------------------------------------------------------------------------------
// Чесний облік активних запитів і планувальник пріоритету натискання користувача
// ------------------------------------------------------------------------------------------------

let actief = 0;
let achtergrondActief = 0;
let totaalInBatch = 0;
let voltooidInBatch = 0;
let laatsteLabel = '';

let klikFocusActief = false;
let klikFocusGeneratie = 0;
let klikFocusTimer: ReturnType<typeof setTimeout> | undefined;
let hervatNaStilteTimer: ReturnType<typeof setTimeout> | undefined;

const standLuisteraars = new Set<(stand: LaadStand) => void>();
const profielLuisteraars = new Set<(profiel: LaadProfiel) => void>();

function maakStand(): LaadStand {
  const bezigTotaal = actief + achtergrondActief;
  const voortgang =
    bezigTotaal === 0
      ? 1
      : totaalInBatch > 0
        ? Math.max(0, Math.min(0.99, voltooidInBatch / totaalInBatch))
        : 0;
  return {
    actief,
    achtergrondActief,
    totaalInBatch,
    voltooidInBatch,
    voortgang,
    alleenAchtergrond: actief === 0 && achtergrondActief > 0,
    klikFocus: klikFocusActief,
    laatsteLabel,
  };
}

function meldStand(): void {
  const stand = maakStand();
  for (const fn of standLuisteraars) {
    try {
      fn(stand);
    } catch {
      /* підписник не має ламати ланцюг запитів */
    }
  }
}

/** Поточний знімок стану активних і фонових мережевих запитів. */
export function huidigeLaadStand(): LaadStand {
  return maakStand();
}

/** Підписка на миттєві оновлення стану завантаження для верхньої смуги поступу. */
export function abonneerLaadStand(luisteraar: (stand: LaadStand) => void): () => void {
  standLuisteraars.add(luisteraar);
  try {
    luisteraar(maakStand());
  } catch {
    /* ігноруємо збій початкового виклику */
  }
  return () => {
    standLuisteraars.delete(luisteraar);
  };
}

/** Підписка на зміну режиму завантаження (зміна мережі або ручний вибір). */
export function abonneerLaadProfiel(luisteraar: (profiel: LaadProfiel) => void): () => void {
  profielLuisteraars.add(luisteraar);
  return () => {
    profielLuisteraars.delete(luisteraar);
  };
}

function meldProfiel(profiel: LaadProfiel): void {
  for (const fn of profielLuisteraars) {
    try {
      fn(profiel);
    } catch {
      /* підписник не має зупиняти оновлення */
    }
  }
}

/**
 * Реєструє реальний запит і повертає ідемопотентну функцію `klaar()`.
 * Веде точні лічильники партії для чесної верхньої смуги поступу.
 */
export function registreerActiefVerzoek(label?: string, opties?: VerzoekOpties): () => void {
  const isAchtergrond = Boolean(opties?.achtergrond);
  if (actief === 0 && achtergrondActief === 0) {
    totaalInBatch = 0;
    voltooidInBatch = 0;
  }
  if (isAchtergrond) achtergrondActief += 1;
  else actief += 1;
  totaalInBatch += 1;
  if (label) laatsteLabel = label;

  if (!isAchtergrond && hervatNaStilteTimer !== undefined) {
    clearTimeout(hervatNaStilteTimer);
    hervatNaStilteTimer = undefined;
  }

  meldStand();

  let afgerond = false;
  return () => {
    if (afgerond) return;
    afgerond = true;
    if (isAchtergrond) achtergrondActief = Math.max(0, achtergrondActief - 1);
    else actief = Math.max(0, actief - 1);
    voltooidInBatch = Math.min(totaalInBatch, voltooidInBatch + 1);
    meldStand();

    // Коли активні запити натискання завершились, плавно знімаємо паузу фонової черги.
    if (!isAchtergrond && actief === 0 && klikFocusActief) {
      const gen = klikFocusGeneratie;
      if (hervatNaStilteTimer !== undefined) clearTimeout(hervatNaStilteTimer);
      hervatNaStilteTimer = setTimeout(() => {
        hervatNaStilteTimer = undefined;
        if (klikFocusGeneratie === gen && actief === 0) {
          eindeKlikFocus(gen);
        }
      }, 160);
    }
  };
}

// ------------------------------------------------------------------------------------------------
// Черга фонових завдань із пріоритетом кліку користувача
// ------------------------------------------------------------------------------------------------

interface WachtendeTaak {
  readonly sleutel?: string;
  readonly prioriteit: number;
  readonly label: string;
  readonly run: () => Promise<unknown> | unknown;
  readonly resolve: (waarde: unknown) => void;
  readonly reject: (reden: unknown) => void;
}

const achtergrondWachtrij: WachtendeTaak[] = [];
const actieveSleutels = new Set<string>();
let lopendeAchtergrondTaken = 0;

function eindeKlikFocus(gen: number): void {
  if (!klikFocusActief || klikFocusGeneratie !== gen) return;
  klikFocusActief = false;
  if (klikFocusTimer !== undefined) {
    clearTimeout(klikFocusTimer);
    klikFocusTimer = undefined;
  }
  if (hervatNaStilteTimer !== undefined) {
    clearTimeout(hervatNaStilteTimer);
    hervatNaStilteTimer = undefined;
  }
  meldStand();
  verwerkAchtergrondWachtrij();
}

/** Чи діє зараз пріоритет натискання/переходу користувача (фонові завдання на паузі). */
export function isKlikFocusActief(): boolean {
  return klikFocusActief;
}

/**
 * Переводить пріоритет на натискання або перехід користувача:
 * миттєво призупиняє старт фонових завдань і відновлює їх після завершення
 * або захисного таймауту (типово 2500 мс), не втрачаючи відкладеної роботи.
 */
export function focusOpKlik(actieNaam?: string, timeoutMs = KLIK_FOCUS_STANDAARD_MS): () => void {
  const gen = ++klikFocusGeneratie;
  klikFocusActief = true;
  if (actieNaam) laatsteLabel = actieNaam;
  if (klikFocusTimer !== undefined) clearTimeout(klikFocusTimer);
  if (hervatNaStilteTimer !== undefined) {
    clearTimeout(hervatNaStilteTimer);
    hervatNaStilteTimer = undefined;
  }
  const veiligTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(10_000, timeoutMs) : KLIK_FOCUS_STANDAARD_MS;
  klikFocusTimer = setTimeout(() => eindeKlikFocus(gen), veiligTimeout);
  meldStand();
  return () => eindeKlikFocus(gen);
}

function verwerkAchtergrondWachtrij(): void {
  if (klikFocusActief || achtergrondWachtrij.length === 0) return;
  const maxParallel = bepaalLaadProfiel().maxParallelAchtergrond;
  while (!klikFocusActief && lopendeAchtergrondTaken < maxParallel && achtergrondWachtrij.length > 0) {
    achtergrondWachtrij.sort((a, b) => b.prioriteit - a.prioriteit);
    const volgende = achtergrondWachtrij.shift();
    if (!volgende) break;
    lopendeAchtergrondTaken += 1;
    if (volgende.sleutel) actieveSleutels.add(volgende.sleutel);
    const klaar = registreerActiefVerzoek(volgende.label, { achtergrond: true });

    Promise.resolve()
      .then(() => volgende.run())
      .then(
        (res) => volgende.resolve(res),
        (err) => volgende.reject(err),
      )
      .finally(() => {
        klaar();
        lopendeAchtergrondTaken = Math.max(0, lopendeAchtergrondTaken - 1);
        if (volgende.sleutel) actieveSleutels.delete(volgende.sleutel);
        if (achtergrondWachtrij.length > 0 && !klikFocusActief) {
          verwerkAchtergrondWachtrij();
        }
      });
  }
}

/**
 * Ставить фонове завдання в керовану чергу.
 * Під час активного натискання користувача завдання чекає в черзі й виконується після завершення кліку.
 */
export function planAchtergrondTaak<T>(
  taak: () => Promise<T> | T,
  opties?: AchtergrondTaakOpties,
): Promise<T | undefined> {
  const sleutel = opties?.sleutel;
  if (sleutel) {
    if (actieveSleutels.has(sleutel) || achtergrondWachtrij.some((t) => t.sleutel === sleutel)) {
      return Promise.resolve(undefined);
    }
  }
  return new Promise<T | undefined>((resolve, reject) => {
    achtergrondWachtrij.push({
      sleutel,
      prioriteit: opties?.prioriteit ?? 0,
      label: opties?.label ?? sleutel ?? 'achtergrond',
      run: taak,
      resolve: resolve as (waarde: unknown) => void,
      reject,
    });
    verwerkAchtergrondWachtrij();
  });
}

// ------------------------------------------------------------------------------------------------
// Одноразове застосування профілю екрана та режиму на document.documentElement
// ------------------------------------------------------------------------------------------------

let laatstSchermProfiel: BepaaldSchermProfiel | null = null;
let laatstLaadProfiel: LaadProfiel | null = null;
let laatstMaatSleutel = '';
let initAantal = 0;
let stopInitLuisteraars: (() => void) | null = null;

/** Повертає поточний обчислений профіль екрана (без зайвих звернень до макета). */
export function huidigSchermProfiel(): BepaaldSchermProfiel {
  if (laatstSchermProfiel) return laatstSchermProfiel;
  const w = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  laatstSchermProfiel = bepaalSchermProfiel(w, h, dpr, isAanraakApparaat());
  return laatstSchermProfiel;
}

function pasSchermProfielToe(forceer = false): BepaaldSchermProfiel {
  const w = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const aanraking = isAanraakApparaat();
  const sleutel = `${w}x${h}@${Math.round(dpr * 100)}:${aanraking ? 1 : 0}`;
  if (!forceer && sleutel === laatstMaatSleutel && laatstSchermProfiel) {
    return laatstSchermProfiel;
  }
  laatstMaatSleutel = sleutel;
  const profiel = bepaalSchermProfiel(w, h, dpr, aanraking);
  laatstSchermProfiel = profiel;

  if (typeof document !== 'undefined' && document.documentElement) {
    const root = document.documentElement;
    if (root.dataset) {
      root.dataset.schermProfiel = profiel.klasse;
      root.dataset.schermBron = profiel.bron;
    }
    if (root.style && typeof root.style.setProperty === 'function') {
      root.style.setProperty('--profiel-klasse', profiel.cssVariabelen['--profiel-klasse']);
      root.style.setProperty('--profiel-kolom-max', profiel.cssVariabelen['--profiel-kolom-max']);
      root.style.setProperty('--profiel-aanraak-min', profiel.cssVariabelen['--profiel-aanraak-min']);
    }
  }
  return profiel;
}

function pasAdaptiefProfielToe(): LaadProfiel {
  const profiel = bepaalLaadProfiel();
  const veranderd = !laatstLaadProfiel || laatstLaadProfiel.modus !== profiel.modus || laatstLaadProfiel.voorkeur !== profiel.voorkeur;
  laatstLaadProfiel = profiel;
  if (typeof document !== 'undefined' && document.documentElement?.dataset) {
    document.documentElement.dataset.laadModus = profiel.modus;
  }
  if (veranderd) {
    meldProfiel(profiel);
    verwerkAchtergrondWachtrij();
  }
  return profiel;
}

/**
 * Ініціалізує атрибути `data-scherm-profiel`, `data-laad-modus` і CSS-змінні на `<html>`
 * один раз при запуску та оновлює їх лише при зміні орієнтації чи мережі (без слухачів прокручування).
 */
export function initAdaptiefProfiel(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined;
  }
  initAantal += 1;
  if (initAantal === 1) {
    pasSchermProfielToe(true);
    pasAdaptiefProfielToe();

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const planSchermUpdate = () => {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        pasSchermProfielToe(false);
      }, ORIENTATIE_DEBOUNCE_MS);
    };

    const opNetwerkWijziging = () => {
      pasAdaptiefProfielToe();
    };
    const opOpslag = (ev: StorageEvent) => {
      if (!ev.key || ev.key === LAAD_MODUS_SLEUTEL) pasAdaptiefProfielToe();
    };

    window.addEventListener('orientationchange', planSchermUpdate, { passive: true });
    window.addEventListener('resize', planSchermUpdate, { passive: true });
    window.addEventListener('storage', opOpslag);

    const net = leesNetwerkInfo();
    net?.addEventListener?.('change', opNetwerkWijziging);

    stopInitLuisteraars = () => {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      window.removeEventListener('orientationchange', planSchermUpdate);
      window.removeEventListener('resize', planSchermUpdate);
      window.removeEventListener('storage', opOpslag);
      net?.removeEventListener?.('change', opNetwerkWijziging);
    };
  }

  let afgemeld = false;
  return () => {
    if (afgemeld) return;
    afgemeld = true;
    initAantal = Math.max(0, initAantal - 1);
    if (initAantal === 0) {
      stopInitLuisteraars?.();
      stopInitLuisteraars = null;
    }
  };
}
