// Welke ruimte is NU actief in dit tabblad, en een seintje bij elke wissel (vlag tech-ruimtes-v2).
// Alle onderdelen die gegevens per ruimte tonen (post: leesvenster, lijst, selectie, concepten; tellers; caches) luisteren hierop en
// maken hun toestand leeg bij een wissel — anders blijft een persoonlijke brief open in de technische ruimte (schermafdruk t338u).
// Vlag UIT of geen status: altijd 'prive' en er wordt nooit iets verstuurd → precies het oude gedrag.
import { useSyncExternalStore } from 'react';
import type { SleutelRuimte as RuimteScope } from './ruimte-sleutel';

export const RUIMTE_WISSEL_GEBEURTENIS = 'mr-ruimte-gewisseld';
export const RUIMTE_GEBRUIKER_WISSEL_GEBEURTENIS = 'mr-ruimte-gebruiker-wissel';
export type RuimteWisselDetail = { van: RuimteScope; naar: RuimteScope };

/** Pure afleiding (getest): technisch alleen als de vlag-status aan is én de server 'technisch' als actief meldt. */
export const ruimteVanStatus = (s: { aan?: boolean; actief?: string } | null | undefined): RuimteScope => (s && s.aan && s.actief === 'technisch' ? 'technisch' : 'prive');

export const TAB_RUIMTE_SLEUTEL = 'mr-ruimte-tab-v1';
const leesTabRuimte = (): RuimteScope => {
  try {
    if (typeof sessionStorage === 'undefined') return 'prive';
    return sessionStorage.getItem(TAB_RUIMTE_SLEUTEL) === 'technisch' ? 'technisch' : 'prive';
  } catch { return 'prive'; }
};
const bewaarTabRuimte = (r: RuimteScope): void => {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (r === 'technisch') sessionStorage.setItem(TAB_RUIMTE_SLEUTEL, 'technisch');
    else sessionStorage.removeItem(TAB_RUIMTE_SLEUTEL);
  } catch { /* приватний режим без сховища */ }
};

let laatste: RuimteScope = leesTabRuimte();
let ooitTechnisch = laatste === 'technisch';
/** True zodra dit tabblad ooit de technische ruimte (v2) zag: dan filteren tellers zelf op ruimte (oude gegevens van vóór de wissel tellen niet). */
export const ruimteFilterActief = (): boolean => ooitTechnisch;
const luisteraars = new Set<() => void>();
export const huidigeRuimte = (): RuimteScope => laatste;

/** Door ruimtes-opslag aangeroepen na elke statuswijziging. Geeft true als er echt gewisseld is. */
export function meldRuimte(naar: RuimteScope): boolean {
  bewaarTabRuimte(naar);
  if (typeof document !== 'undefined') document.documentElement.dataset.ruimte = naar;
  if (naar === laatste) return false;
  const van = laatste;
  laatste = naar;
  if (naar === 'technisch') ooitTechnisch = true;
  luisteraars.forEach((f) => f());
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<RuimteWisselDetail>(RUIMTE_WISSEL_GEBEURTENIS, { detail: { van, naar } }));
  return true;
}
export const GEBRUIKER_PRIVE_SLEUTEL = 'mr-gebruiker-prive-pad-v1';
let gebruikerPrivePad: string | null = null;
const huidigePaginaSleutel = (): string => (typeof location !== 'undefined' ? `${location.origin}${location.pathname}${location.search}` : '1');
/** Позначає, що користувач у цій вкладці свідомо перемкнувся на звичайний інтерфейс на поточній сторінці (щоб TechPoort не відкочував вкладку назад у технічний простір). */
export function zetGebruikerPrive(aan: boolean): void {
  const waarde = aan ? huidigePaginaSleutel() : null;
  gebruikerPrivePad = waarde;
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (waarde) sessionStorage.setItem(GEBRUIKER_PRIVE_SLEUTEL, waarde);
    else sessionStorage.removeItem(GEBRUIKER_PRIVE_SLEUTEL);
  } catch { /* приватний режим без сховища */ }
}
export const wisGebruikerPrive = (): void => zetGebruikerPrive(false);
export function gebruikerKoosPrive(): boolean {
  const nu = huidigePaginaSleutel();
  if (gebruikerPrivePad !== null) return gebruikerPrivePad === nu;
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(GEBRUIKER_PRIVE_SLEUTEL) === nu;
  } catch { return false; }
}
/** Явне перемикання простору дією користувача, щоб інтерфейс міг одразу показати смугу чи підказку і не відкочувати вибір назад. */
export function meldGebruikerWissel(naar: RuimteScope): void {
  zetGebruikerPrive(naar === 'prive');
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<{ naar: RuimteScope }>(RUIMTE_GEBRUIKER_WISSEL_GEBEURTENIS, { detail: { naar } }));
}
export function opGebruikerWissel(f: (naar: RuimteScope) => void): () => void {
  const h = (e: Event) => f((e as CustomEvent<{ naar: RuimteScope }>).detail.naar);
  window.addEventListener(RUIMTE_GEBRUIKER_WISSEL_GEBEURTENIS, h);
  return () => window.removeEventListener(RUIMTE_GEBRUIKER_WISSEL_GEBEURTENIS, h);
}
export function opRuimteWissel(f: (d: RuimteWisselDetail) => void): () => void {
  const h = (e: Event) => f((e as CustomEvent<RuimteWisselDetail>).detail);
  window.addEventListener(RUIMTE_WISSEL_GEBEURTENIS, h);
  return () => window.removeEventListener(RUIMTE_WISSEL_GEBEURTENIS, h);
}
export const useHuidigeRuimte = (): RuimteScope => useSyncExternalStore((f) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; }, () => laatste, () => 'prive');
