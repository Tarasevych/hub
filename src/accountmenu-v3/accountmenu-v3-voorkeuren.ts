// Налаштування спадного меню облікового запису v3 (IDENTITEIT-008):
// - вигляд переліку облікових записів: 'orbita' (Режим А, типово) або 'kaart' (Режим Б);
// - пропорційний масштаб вікна: 0.78 .. 1.34 (типово 1.00);
// - палітра кольорів (Модель В): короткий натиск гортає палітри по колу, правий натиск або утримання відкриває повний перелік.
import { useSyncExternalStore } from 'react';
import { ACCENT_KLEUREN, DIENST_ACCENT, type Accent, type DienstId } from '../../shared/menu-model';
import { contrast, meng, type Waarden } from '../thema/paletten';
import type { Palet } from '../thema/kern';

export const ACCOUNTMENU_V3_INDELINGEN = ['orbita', 'kaart'] as const;
export type AccountmenuV3Indeling = typeof ACCOUNTMENU_V3_INDELINGEN[number];

export const ACCOUNTMENU_V3_SYSTEEM_PALETTEN = ['kleur', 'maquette', 'grifel', 'puur', 'violet'] as const;
export const ACCOUNTMENU_V3_VASTE_TINTEN = ['blauw', 'hemel', 'teal', 'groen', 'oranje', 'roze', 'indigo', 'bruin'] as const;
export type AccountmenuV3VasteTint = typeof ACCOUNTMENU_V3_VASTE_TINTEN[number];
export const ACCOUNTMENU_V3_PALET_KEUZES = [
  ...ACCOUNTMENU_V3_SYSTEEM_PALETTEN,
  ...ACCOUNTMENU_V3_VASTE_TINTEN,
] as const;
export type AccountmenuV3PaletKeuze = typeof ACCOUNTMENU_V3_PALET_KEUZES[number];

export const SCHAAL_MIN = 0.78;
export const SCHAAL_MAX = 1.34;
export const SCHAAL_STANDAARD = 1;

export type PaletKeuzeInfo = {
  id: AccountmenuV3PaletKeuze;
  groep: 'systeem' | 'vast';
  kleur: string;
  uk: string;
  nl: string;
  subUk: string;
  subNl: string;
};

export const PALET_KEUZES_INFO: readonly PaletKeuzeInfo[] = [
  { id: 'kleur', groep: 'systeem', kleur: '#0f766e', uk: 'Кольоровий (за розділом)', nl: 'Kleurrijk (per onderdeel)', subUk: 'Кожна служба має власний колір', subNl: 'Elke dienst zijn eigen kleur' },
  { id: 'maquette', groep: 'systeem', kleur: '#7c66dc', uk: 'Макет (студійний)', nl: 'Ontwerp (studio)', subUk: 'Нічні вітрини, скло та якірна навігація', subNl: 'Nachtvitrines, glas en ankernavigatie' },
  { id: 'grifel', groep: 'systeem', kleur: '#475569', uk: 'Грифельний (класичний)', nl: 'Grafiet (klassiek)', subUk: 'Спокійний темно-грифельний тон', subNl: 'Rustig donker leisteen' },
  { id: 'puur', groep: 'systeem', kleur: '#18181b', uk: 'Чистий (виразний)', nl: 'Puur (hoog contrast)', subUk: 'Чіткий чорно-білий вигляд', subNl: 'Helder zwart-wit uiterlijk' },
  { id: 'violet', groep: 'systeem', kleur: '#9333ea', uk: 'Фіолетовий (лише ШІ)', nl: 'Violet (alleen AI)', subUk: 'Фірмовий тон простору ШІ', subNl: 'Kenmerkende tint voor AI' },
  { id: 'blauw', groep: 'vast', kleur: '#1a5fd6', uk: 'Синій', nl: 'Blauw', subUk: 'Пошта та спокійний робочий тон', subNl: 'Mail en rustige werktint' },
  { id: 'hemel', groep: 'vast', kleur: '#027fbd', uk: 'Небесний', nl: 'Hemelsblauw', subUk: 'Хмарне сховище та легкість', subNl: 'Cloudopslag en luchtigheid' },
  { id: 'teal', groep: 'vast', kleur: '#0f766e', uk: 'Бірюзовий', nl: 'Teal', subUk: 'Фірмовий колір Mijn Ruimte', subNl: 'Kenmerkende Mijn Ruimte-kleur' },
  { id: 'groen', groep: 'vast', kleur: '#15803d', uk: 'Зелений', nl: 'Groen', subUk: 'З’єднувачі та живі служби', subNl: 'Verbindingen en actieve diensten' },
  { id: 'oranje', groep: 'vast', kleur: '#c2570c', uk: 'Бурштиновий', nl: 'Oranje', subUk: 'Теплий затишний відтінок', subNl: 'Warme huiselijke tint' },
  { id: 'roze', groep: 'vast', kleur: '#be185d', uk: 'Малиновий', nl: 'Roze', subUk: 'Виразний насичений відтінок', subNl: 'Uitgesproken verzadigde tint' },
  { id: 'indigo', groep: 'vast', kleur: '#4f46e5', uk: 'Індиго', nl: 'Indigo', subUk: 'Календар та глибока зосередженість', subNl: 'Agenda en diepe aandacht' },
  { id: 'bruin', groep: 'vast', kleur: '#8b5a2b', uk: 'Теплий теракотовий', nl: 'Warm bruin', subUk: 'М’який природний відтінок', subNl: 'Zachte natuurlijke tint' },
];

export type AccountmenuV3Voorkeuren = {
  indeling: AccountmenuV3Indeling;
  schaal: number;
  vasteTint: AccountmenuV3VasteTint | null;
};

const BASIS_SLEUTEL = 'mr-accountmenu-v3-voorkeuren-v1';
const huidigScope = (): string => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const s = sessionStorage.getItem('tsv-zijbalk-scope');
      if (s) return s;
    }
  } catch {
    /* сховище сеансу недоступне */
  }
  return 'anon';
};
const opslagSleutel = () => `${BASIS_SLEUTEL}:${huidigScope()}`;

export function begrensschaal(waarde: unknown): number {
  const n = Number(waarde);
  if (!Number.isFinite(n)) return SCHAAL_STANDAARD;
  const begrensd = Math.min(SCHAAL_MAX, Math.max(SCHAAL_MIN, n));
  return Math.round(begrensd * 100) / 100;
}

export function isAccountmenuV3Indeling(v: unknown): v is AccountmenuV3Indeling {
  return v === 'orbita' || v === 'kaart';
}

export function isVasteTint(v: unknown): v is AccountmenuV3VasteTint {
  return typeof v === 'string' && (ACCOUNTMENU_V3_VASTE_TINTEN as readonly string[]).includes(v);
}

export function isSysteemPalet(v: unknown): v is Palet {
  return typeof v === 'string' && (ACCOUNTMENU_V3_SYSTEEM_PALETTEN as readonly string[]).includes(v);
}

const standaardVoorkeuren = (): AccountmenuV3Voorkeuren => ({
  indeling: 'orbita',
  schaal: SCHAAL_STANDAARD,
  vasteTint: null,
});

function leesUitOpslag(): AccountmenuV3Voorkeuren {
  try {
    if (typeof localStorage === 'undefined') return standaardVoorkeuren();
    const ruw = localStorage.getItem(opslagSleutel());
    if (!ruw) return standaardVoorkeuren();
    const parsed = JSON.parse(ruw) as Record<string, unknown>;
    return {
      indeling: isAccountmenuV3Indeling(parsed?.indeling) ? parsed.indeling : 'orbita',
      schaal: begrensschaal(parsed?.schaal),
      vasteTint: isVasteTint(parsed?.vasteTint) ? parsed.vasteTint : null,
    };
  } catch {
    return standaardVoorkeuren();
  }
}

let staat: AccountmenuV3Voorkeuren = leesUitOpslag();
let laatstScope = typeof localStorage !== 'undefined' ? opslagSleutel() : '';
const luisteraars = new Set<() => void>();

function schrijfNaarOpslag(volgende: AccountmenuV3Voorkeuren): void {
  staat = volgende;
  laatstScope = opslagSleutel();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(laatstScope, JSON.stringify(volgende));
    }
  } catch {
    /* сховище оглядача недоступне */
  }
  luisteraars.forEach((fn) => fn());
}

function controleerScopeWissel(): void {
  const nuSleutel = opslagSleutel();
  if (nuSleutel === laatstScope) return;
  laatstScope = nuSleutel;
  staat = leesUitOpslag();
  pasVasteTintStijlToe(staat.vasteTint);
  luisteraars.forEach((fn) => fn());
}

let zijbalkGeabonneerd = false;
function abonneer(fn: () => void): () => void {
  if (!zijbalkGeabonneerd && typeof window !== 'undefined') {
    zijbalkGeabonneerd = true;
    void import('../zijbalk-voorkeuren').then(({ abonneerZijbalk }) => {
      abonneerZijbalk(controleerScopeWissel);
    }, () => {});
  }
  luisteraars.add(fn);
  return () => {
    luisteraars.delete(fn);
  };
}

export function leesAccountmenuV3Voorkeuren(): AccountmenuV3Voorkeuren {
  controleerScopeWissel();
  return staat;
}

export function useAccountmenuV3Voorkeuren(): AccountmenuV3Voorkeuren {
  return useSyncExternalStore(abonneer, leesAccountmenuV3Voorkeuren, leesAccountmenuV3Voorkeuren);
}

export function zetAccountmenuV3Indeling(indeling: AccountmenuV3Indeling): void {
  if (!isAccountmenuV3Indeling(indeling)) return;
  schrijfNaarOpslag({ ...leesAccountmenuV3Voorkeuren(), indeling });
}

export function zetAccountmenuV3Schaal(schaal: number): void {
  schrijfNaarOpslag({ ...leesAccountmenuV3Voorkeuren(), schaal: begrensschaal(schaal) });
}

export function herstelAccountmenuV3Schaal(): void {
  zetAccountmenuV3Schaal(SCHAAL_STANDAARD);
}

const totContrast = (kleur: string, tegen: string, min: number, richting: '#000000' | '#ffffff') => {
  let k = kleur;
  for (let i = 0; i < 40 && contrast(k, tegen) < min; i++) k = meng(richting, k, 0.06);
  return k;
};

export function vasteTintWaarden(accent: Accent): { licht: Waarden; donker: Waarden } {
  const k = ACCENT_KLEUREN[accent];
  const L = k.licht.hoofd;
  const D = k.donker.hoofd;
  const bgL = meng(L, '#f7f8fa', 0.05);
  const panelL = meng(L, '#ffffff', 0.02);
  const accentL = totContrast(totContrast(L, '#ffffff', 4.6, '#000000'), bgL, 4.6, '#000000');
  const softL = meng(L, '#ffffff', 0.14);
  const bgD = meng(D, '#14181d', 0.05);
  const panelD = meng(D, '#20262d', 0.06);
  const softD = meng(D, '#20262d', 0.2);
  return {
    licht: {
      bg: bgL,
      panel: panelL,
      surface: meng(L, '#f1f3f5', 0.06),
      surface2: meng(L, '#e7ebef', 0.1),
      line: meng(L, '#d5dbe1', 0.16),
      text: '#17212b',
      muted: '#4b5563',
      faint: '#5f6873',
      accent: totContrast(accentL, softL, 4.6, '#000000'),
      accentText: '#ffffff',
      accentSoft: softL,
    },
    donker: {
      bg: bgD,
      panel: panelD,
      surface: meng(D, '#29313a', 0.08),
      surface2: meng(D, '#35404b', 0.1),
      line: meng(D, '#46515c', 0.14),
      text: '#f3f6f8',
      muted: '#c3cbd5',
      faint: '#a3aeb9',
      accent: totContrast(D, softD, 4.6, '#ffffff'),
      accentText: '#10161c',
      accentSoft: softD,
    },
  };
}

const cssReeks = (w: Waarden) =>
  `--bg:${w.bg};--panel:${w.panel};--surface:${w.surface};--surface2:${w.surface2};--line:${w.line};--text:${w.text};--muted:${w.muted};--faint:${w.faint};--accent:${w.accent};--accentText:${w.accentText};--accent-soft:${w.accentSoft}`;

const STIJL_ELEMENT_ID = 'mr-am3-vaste-tint';

export function pasVasteTintStijlToe(tint: AccountmenuV3VasteTint | null): void {
  if (typeof document === 'undefined') return;
  const bestaand = document.getElementById(STIJL_ELEMENT_ID) as HTMLStyleElement | null;
  if (!tint || !isVasteTint(tint)) {
    if (bestaand) bestaand.remove();
    document.documentElement.removeAttribute('data-am3-vaste-tint');
    return;
  }
  const w = vasteTintWaarden(tint);
  const el = bestaand || (() => {
    const nieuw = document.createElement('style');
    nieuw.id = STIJL_ELEMENT_ID;
    document.head.appendChild(nieuw);
    return nieuw;
  })();
  const sel = 'html[data-am3-vaste-tint]';
  el.textContent = `${sel}.theme-light,${sel} .theme-light{${cssReeks(w.licht)}}\n${sel}.theme-dark,${sel} .theme-dark{${cssReeks(w.donker)}}`;
  document.documentElement.setAttribute('data-am3-vaste-tint', tint);
}

/** Визначає поточний вибір палітри (5 системних або 8 фіксованих відтінків). */
export function huidigePaletKeuze(systeemPalet: Palet | undefined, voorkeuren: AccountmenuV3Voorkeuren, violetToegestaan: boolean): AccountmenuV3PaletKeuze {
  if (voorkeuren.vasteTint && isVasteTint(voorkeuren.vasteTint)) {
    return voorkeuren.vasteTint;
  }
  if (systeemPalet === 'violet' && !violetToegestaan) return 'grifel';
  if (systeemPalet && isSysteemPalet(systeemPalet)) return systeemPalet;
  return 'grifel';
}

/** Модель В: короткий натиск перемикає на наступну доступну палітру по колу. */
export function volgendePaletKeuze(huidig: AccountmenuV3PaletKeuze, violetToegestaan: boolean): AccountmenuV3PaletKeuze {
  const beschikbaar = PALET_KEUZES_INFO.filter((p) => p.id !== 'violet' || violetToegestaan).map((p) => p.id);
  const idx = beschikbaar.indexOf(huidig);
  if (idx < 0) return beschikbaar[0] || 'kleur';
  return beschikbaar[(idx + 1) % beschikbaar.length]!;
}

/** Встановлює палітру (системну або фіксований відтінок) і синхронізує стан теми. */
export function kiesAccountmenuV3Palet(
  keuze: AccountmenuV3PaletKeuze,
  violetToegestaan = true,
  zetSysteemPalet?: (p: Palet) => void,
): AccountmenuV3PaletKeuze {
  const doel: AccountmenuV3PaletKeuze = keuze === 'violet' && !violetToegestaan ? 'kleur' : keuze;
  const huidig = leesAccountmenuV3Voorkeuren();
  if (isVasteTint(doel)) {
    schrijfNaarOpslag({ ...huidig, vasteTint: doel });
    zetSysteemPalet?.('kleur');
    pasVasteTintStijlToe(doel);
    return doel;
  }
  const sys: Palet = isSysteemPalet(doel) ? doel : 'grifel';
  schrijfNaarOpslag({ ...huidig, vasteTint: null });
  pasVasteTintStijlToe(null);
  zetSysteemPalet?.(sys);
  return sys;
}

/** Очищує фіксований відтінок, якщо в системних налаштуваннях обрано іншу базову палітру. */
export function wisAccountmenuV3VasteTint(): void {
  const huidig = leesAccountmenuV3Voorkeuren();
  if (!huidig.vasteTint) return;
  schrijfNaarOpslag({ ...huidig, vasteTint: null });
  pasVasteTintStijlToe(null);
}

/** Колір для самої піктограми палітри в меню v3 (без кутового кружечка). */
export function paletIcoonKleur(keuze: AccountmenuV3PaletKeuze, dienst: string, donker: boolean): string {
  if (isVasteTint(keuze)) {
    return ACCENT_KLEUREN[keuze][donker ? 'donker' : 'licht'].hoofd;
  }
  if (keuze === 'kleur') {
    const d = (DIENST_ACCENT[dienst as DienstId] || 'teal') as Accent;
    return ACCENT_KLEUREN[d][donker ? 'donker' : 'licht'].hoofd;
  }
  if (keuze === 'maquette') return donker ? '#b3a0ff' : '#5c46a3';
  if (keuze === 'violet') {
    return ACCENT_KLEUREN.violet[donker ? 'donker' : 'licht'].hoofd;
  }
  if (keuze === 'puur') {
    return donker ? '#f4f4f5' : '#18181b';
  }
  return donker ? '#94a3b8' : '#475569';
}
