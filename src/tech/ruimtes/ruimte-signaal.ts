// Welke ruimte is NU actief in dit tabblad, en een seintje bij elke wissel (vlag tech-ruimtes-v2).
// Alle onderdelen die gegevens per ruimte tonen (post: leesvenster, lijst, selectie, concepten; tellers; caches) luisteren hierop en
// maken hun toestand leeg bij een wissel — anders blijft een persoonlijke brief open in de technische ruimte (schermafdruk t338u).
// Vlag UIT of geen status: altijd 'prive' en er wordt nooit iets verstuurd → precies het oude gedrag.
import { useSyncExternalStore } from 'react';
import type { SleutelRuimte as RuimteScope } from './ruimte-sleutel';

export const RUIMTE_WISSEL_GEBEURTENIS = 'mr-ruimte-gewisseld';
export type RuimteWisselDetail = { van: RuimteScope; naar: RuimteScope };

/** Pure afleiding (getest): technisch alleen als de vlag-status aan is én de server 'technisch' als actief meldt. */
export const ruimteVanStatus = (s: { aan?: boolean; actief?: string } | null | undefined): RuimteScope => (s && s.aan && s.actief === 'technisch' ? 'technisch' : 'prive');

let laatste: RuimteScope = 'prive';
let ooitTechnisch = false;
/** True zodra dit tabblad ooit de technische ruimte (v2) zag: dan filteren tellers zelf op ruimte (oude gegevens van vóór de wissel tellen niet). */
export const ruimteFilterActief = (): boolean => ooitTechnisch;
const luisteraars = new Set<() => void>();
export const huidigeRuimte = (): RuimteScope => laatste;

/** Door ruimtes-opslag aangeroepen na elke statuswijziging. Geeft true als er echt gewisseld is. */
export function meldRuimte(naar: RuimteScope): boolean {
  if (naar === laatste) return false;
  const van = laatste;
  laatste = naar;
  if (naar === 'technisch') ooitTechnisch = true;
  if (typeof document !== 'undefined') document.documentElement.dataset.ruimte = naar;
  luisteraars.forEach((f) => f());
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<RuimteWisselDetail>(RUIMTE_WISSEL_GEBEURTENIS, { detail: { van, naar } }));
  return true;
}
export function opRuimteWissel(f: (d: RuimteWisselDetail) => void): () => void {
  const h = (e: Event) => f((e as CustomEvent<RuimteWisselDetail>).detail);
  window.addEventListener(RUIMTE_WISSEL_GEBEURTENIS, h);
  return () => window.removeEventListener(RUIMTE_WISSEL_GEBEURTENIS, h);
}
export const useHuidigeRuimte = (): RuimteScope => useSyncExternalStore((f) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; }, () => laatste, () => 'prive');
