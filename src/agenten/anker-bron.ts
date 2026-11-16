// ANKERS-002 (15.11.2026): één bron voor de onderdelen van /agents. De pagina (AgentenPagina) publiceert hier haar onderdelen —
// dezelfde namen, iconen en tellers als de koppen van de blokken — en de functie om erheen te gaan. Het ankermenu van «Макет»
// (McpDienstWeergave → MaquetteAnkerRail) leest alleen hieruit, zodat er geen tweede, met de hand bijgehouden lijst meer is
// (vroeger «Огляд підключень», «Конектори ШІ» met een eigen teller tegenover «Огляд», «Конектори» in de strook).
// Одне джерело розділів сторінки /agents: меню якорів «Макета» бере назви, піктограми й лічильники звідси, а не з власного списку.
import { useSyncExternalStore, type ReactElement } from 'react';

export type AgentAnkerOnderdeel = { tab: string; uk: string; nl: string; icoon: ReactElement; teller?: number; waarschuwing?: boolean };
export type AgentAnkerBron = {
  /** Onderdelen in de volgorde van de pagina; leeg zolang de pagina niet geladen is. */
  onderdelen: ReadonlyArray<AgentAnkerOnderdeel>;
  /** Het onderdeel in beeld (of gekozen); 'agent' op de pagina van één AI. */
  actief: string;
  /** Naar een onderdeel gaan zoals de pagina het zelf doet (hash, openklappen, scrollen). */
  ga: ((tab: string) => void) | null;
};

const LEEG: AgentAnkerBron = { onderdelen: [], actief: '', ga: null };
let bron: AgentAnkerBron = LEEG;
let vingerafdruk = '';
const luisteraars = new Set<() => void>();

const afdruk = (b: AgentAnkerBron) => `${b.actief}|${b.onderdelen.map((o) => `${o.tab}:${o.uk}:${o.nl}:${o.teller ?? ''}:${o.waarschuwing ? 1 : 0}`).join(',')}`;

/** Publiceert de onderdelen; meldt luisteraars alleen bij een echte verandering (geen lus van renders). */
export function zetAgentAnkers(volgende: AgentAnkerBron): void {
  const nieuw = afdruk(volgende);
  if (nieuw === vingerafdruk && volgende.ga === bron.ga) return; // zelfde momentopname houden (useSyncExternalStore)
  bron = volgende;
  vingerafdruk = nieuw;
  luisteraars.forEach((f) => f());
}

/** Bij het verlaten van de pagina: het menu valt terug op «На початок». */
export function wisAgentAnkers(): void {
  bron = LEEG; vingerafdruk = '';
  luisteraars.forEach((f) => f());
}

export function leesAgentAnkers(): AgentAnkerBron { return bron; }

export function useAgentAnkers(): AgentAnkerBron {
  return useSyncExternalStore((f) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; }, () => bron, () => LEEG);
}
