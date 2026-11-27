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
export const RUIMTE_WEERGAVE_COOKIE = 'mr_ruimte_weergave_v1';

const isGedeeldDomein = (): boolean => {
  try {
    const h = typeof location !== 'undefined' ? String(location.hostname || '').toLowerCase() : '';
    return h === 'tarasevych.com' || h.endsWith('.tarasevych.com');
  } catch { return false; }
};
const leesRuimteCookie = (): RuimteScope | null => {
  try {
    if (typeof document === 'undefined' || typeof document.cookie !== 'string') return null;
    const deel = document.cookie.split('; ').find((s) => s.startsWith(`${RUIMTE_WEERGAVE_COOKIE}=`));
    if (!deel) return null;
    const w = decodeURIComponent(deel.slice(RUIMTE_WEERGAVE_COOKIE.length + 1));
    return w === 'technisch' ? 'technisch' : w === 'prive' ? 'prive' : null;
  } catch { return null; }
};
const schrijfRuimteCookie = (r: RuimteScope | null): void => {
  try {
    if (typeof document === 'undefined') return;
    const desc = Object.getOwnPropertyDescriptor(document, 'cookie');
    if (desc && 'value' in desc && desc.writable) {
      const overig = String(document.cookie || '').split('; ').filter((s) => s && !s.startsWith(`${RUIMTE_WEERGAVE_COOKIE}=`));
      if (r) overig.push(`${RUIMTE_WEERGAVE_COOKIE}=${r}`);
      document.cookie = overig.join('; ');
      return;
    }
    const domein = isGedeeldDomein() ? '; Domain=.tarasevych.com' : '';
    const secure = typeof location !== 'undefined' && location.protocol === 'http:' ? '' : '; Secure';
    if (r) {
      document.cookie = `${RUIMTE_WEERGAVE_COOKIE}=${r}; Path=/; SameSite=Lax${secure}${domein}`;
    } else {
      document.cookie = `${RUIMTE_WEERGAVE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}${domein}`;
      if (domein) document.cookie = `${RUIMTE_WEERGAVE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    }
  } catch { /* приватний режим або поза оглядачем */ }
};

const leesTabRuimte = (): RuimteScope => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const s = sessionStorage.getItem(TAB_RUIMTE_SLEUTEL);
      if (s === 'technisch') return 'technisch';
      if (s === 'prive') return 'prive';
    }
    return leesRuimteCookie() === 'technisch' ? 'technisch' : 'prive';
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
let gebruikerPriveKeuze: boolean | null = null;
/** Позначає, що користувач свідомо перемкнувся на звичайний інтерфейс (діє на всіх сторінках і піддоменах, доки користувач сам не перемкне на технічний простір). */
export function zetGebruikerPrive(aan: boolean): void {
  gebruikerPriveKeuze = aan ? true : false;
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (aan) sessionStorage.setItem(GEBRUIKER_PRIVE_SLEUTEL, '1');
      else sessionStorage.removeItem(GEBRUIKER_PRIVE_SLEUTEL);
    }
  } catch { /* приватний режим без сховища */ }
  schrijfRuimteCookie(aan ? 'prive' : null);
}
export const wisGebruikerPrive = (): void => zetGebruikerPrive(false);
export function gebruikerKoosPrive(): boolean {
  if (gebruikerPriveKeuze !== null) return gebruikerPriveKeuze;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const s = sessionStorage.getItem(GEBRUIKER_PRIVE_SLEUTEL);
      if (s) return true;
    }
  } catch { /* немає сховища сеансу */ }
  return leesRuimteCookie() === 'prive';
}
/** Явне перемикання простору дією користувача, щоб інтерфейс міг одразу показати смугу чи підказку і не відкочувати вибір назад. */
export function meldGebruikerWissel(naar: RuimteScope): void {
  zetGebruikerPrive(naar === 'prive');
  if (naar === 'technisch') schrijfRuimteCookie('technisch');
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
