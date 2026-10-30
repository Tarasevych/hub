// Technische meldingen voor het paneel in de technische band (18.10.2026, verzoek eigenaar: meldingen voor de gebruiker los van de
// beheermeldingen). CanonicalChrome (hoofdroot) zet hier de technische serverMeldingen + de «gelezen»-functie; TechLaag (eigen root,
// main.tsx) leest ze. De server levert technische meldingen alleen aan een account met technisch profiel (backend/index.ts →
// meldingOntvanger), dus voor een gewoon account blijft deze lijst leeg.
import { useSyncExternalStore } from 'react';
import type { CanonicalServerNotification } from '../canoniek-meldingen';
import type { ActivityEvent } from '../connector-activiteit';
import { openTechVenster, techActief } from '../tech/tech-opslag';

export type TechMeldingenStaat = { items: readonly CanonicalServerNotification[]; lees: ((id: string) => void | Promise<void>) | null;
  /** 22.10.2026: technische ACTIVITEITEN (beheer, uitrol, diagnose, SIEM, звірка, AI in het technische profiel) uit /api/owner/agents/activity — sfeer 'technisch' (shared/meldingen-soorten.ts). «Gelezen» is lokaal (zelfde set als de bel). */
  activiteit: readonly ActivityEvent[]; activiteitGelezen: ReadonlySet<string>; leesActiviteit: ((id: string) => void) | null };
let staat: TechMeldingenStaat = { items: [], lees: null, activiteit: [], activiteitGelezen: new Set(), leesActiviteit: null };
const luisteraars = new Set<() => void>();
const handtekening = (items: readonly CanonicalServerNotification[]) => items.map((m) => `${m.id}:${m.read ? 1 : 0}`).join('|');
const handtekeningActiviteit = (items: readonly ActivityEvent[], gelezen: ReadonlySet<string>) => items.map((e) => `${e.id}:${e.status}:${gelezen.has(e.id) ? 1 : 0}`).join('|');

export function zetTechMeldingen(items: readonly CanonicalServerNotification[], lees?: ((id: string) => void | Promise<void>) | null): void {
  const l = lees ?? null;
  if (handtekening(items) === handtekening(staat.items) && l === staat.lees) return;
  staat = { ...staat, items, lees: l };
  luisteraars.forEach((f) => f());
}
/** De bel (CanonicalNotificationCenter) zet hier de technische activiteiten; het paneel in de band toont ze onder de meldingen. */
export function zetTechActiviteit(activiteit: readonly ActivityEvent[], gelezen: ReadonlySet<string>, lees?: ((id: string) => void) | null): void {
  const l = lees ?? null;
  if (handtekeningActiviteit(activiteit, gelezen) === handtekeningActiviteit(staat.activiteit, staat.activiteitGelezen) && l === staat.leesActiviteit) return;
  staat = { ...staat, activiteit, activiteitGelezen: gelezen, leesActiviteit: l };
  luisteraars.forEach((f) => f());
}
/** Ongelezen technische activiteiten (voor de teller op de knop in de band). */
export const ongelezenTechActiviteit = (s: TechMeldingenStaat = staat) => s.activiteit.filter((e) => !s.activiteitGelezen.has(e.id)).length;
export const techMeldingenStaat = () => staat;
export const useTechMeldingen = () => useSyncExternalStore((f) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; }, () => staat, () => staat);

/** Gebeurtenis waarop het paneel in de band opengaat. */
export const TECH_MELDINGEN_EVENT = 'mr-tech-meldingen';
/** Na het activeren van het technisch profiel het paneel openen (de regel in de bel bood activering aan). */
export const NA_ACTIVEREN = 'mr-tech-na-activeren';

/**
 * Vanuit de regel «У технічній панелі N нових сповіщень» in de gewone bel: actief → paneel in de band openen; niet actief → eerst het
 * venster «Увімкнути технічний профіль», daarna (zodra de band verschijnt) meteen terug naar het paneel.
 */
export function openTechMeldingen(): void {
  if (techActief()) { window.dispatchEvent(new CustomEvent(TECH_MELDINGEN_EVENT)); return; }
  try { sessionStorage.setItem(NA_ACTIVEREN, `meldingen:${Date.now()}`); } catch { /* privémodus: alleen activeren */ }
  openTechVenster('activeren');
}
/** Eenmalig: stond er (in de laatste 10 min) een «na activeren → meldingen»-verzoek klaar? Wordt meteen gewist; een geannuleerde
 *  activering laat zo geen verrassing achter voor later. */
export function naActiverenMeldingen(nu = Date.now()): boolean {
  try {
    const v = sessionStorage.getItem(NA_ACTIVEREN) || '';
    if (!v) return false;
    sessionStorage.removeItem(NA_ACTIVEREN);
    const t = Number(v.split(':')[1] || 0);
    return v.startsWith('meldingen:') && nu - t >= 0 && nu - t < 10 * 60_000;
  } catch { return false; }
}
