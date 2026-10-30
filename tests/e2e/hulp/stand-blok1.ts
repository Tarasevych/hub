// Blok 1 (25.10.2026, «швидкі виправлення»): de stappen van de vier teams staan elk in een eigen bestand, zodat niemand tegelijk
// stand-knipsels-20261020.ts bewerkt. Namen beginnen met «blok1-»; kies met STAND_FILTER, bv. FILTER='blok1-acties'.
//   stand-blok1-acties.ts         — knoppen in de rij, één bron van acties en kleuren, «Перегляд» niet bedekt (1.1, 1.2, 6.1)
//   stand-blok1-geminimaliseerd.ts — dok van ingeklapte brieven, slepen zonder uitrekken, bijlage groeit niet in de rij (1.3, 1.4, 6.3)
//   stand-blok1-vensters.ts       — de bel en de zone bedekken nooit de knoppen van een venster (2.5)
//   stand-blok1-toegang.ts        — venster «Підтвердіть доступ» en chips in de toestemming: niets buiten het venster, contrast (8.6)
import type { Page } from 'playwright-core';
import type { SERVICE_HOSTS } from '../../../backend/deployment-identity';
import { actiesStappen } from './stand-blok1-acties';
import { geminimaliseerdStappen } from './stand-blok1-geminimaliseerd';
import { venstersStappen } from './stand-blok1-vensters';
import { toegangStappen } from './stand-blok1-toegang';

/** Zelfde vorm als `Stap` in stand-knipsels-20261020.ts. */
export type Blok1Stap = { naam: string; url: string | (() => Promise<string>); voor?: (page: Page) => Promise<void>; na?: (page: Page) => Promise<void>; alleen1280?: boolean; wachtOp?: string; fase?: 'prive' | 'tech' };
export type Blok1Ctx = {
  H: (dienst: keyof typeof SERVICE_HOSTS) => string;
  uid: () => string;
  uit: string;
  axe: string;
  zeg: (s: string) => void;
  /** Schrijft de meting in het logboek; een niet-lege `slecht` wordt een defect «meting». */
  meting: (naam: string, p: Page, slecht: string, detail: string) => void;
  /** Adres van een toestemmingsvenster (OAuth) voor een agent: zelfde helper als de stappen `consent-*`. */
  consentUrl: (agent: 'claude' | 'gpt' | null, naam: string) => Promise<string>;
};

export const blok1Stappen = (ctx: Blok1Ctx): Blok1Stap[] => [
  ...actiesStappen(ctx),
  ...geminimaliseerdStappen(ctx),
  ...venstersStappen(ctx),
  ...toegangStappen(ctx),
];
