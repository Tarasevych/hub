// Gezamenlijke stapel «Згорнуті» van Пошта: geminimaliseerde vensters die NIET van de leesweergave zelf zijn (nu: het concept van
// een nieuwe brief) melden zich hier aan. De stapel (MailMinimizedViewer in GoogleMailWorkspace) toont ze naast de geminimaliseerde
// brieven en bijlagen — één plek, één stijl, en u kunt elk venster terughalen, niet alleen het laatst geminimaliseerde.
// Is er geen stapel op het scherm (geen houder), dan tekent het venster zijn eigen plashka.
import { useEffect, useSyncExternalStore } from 'react';

export type Zwevend = { id: string; titel: string; sub: string; open: () => void; sluit: () => void };
let lijst: Zwevend[] = [];
let houders = 0;
const luisteraars = new Set<() => void>();
const melden = () => { lijst = [...lijst]; luisteraars.forEach((f) => f()); };
const abonneer = (f: () => void) => { luisteraars.add(f); return () => { luisteraars.delete(f); }; };

export function registreerZwevend(z: Zwevend) {
  const i = lijst.findIndex((x) => x.id === z.id);
  if (i >= 0) lijst[i] = z; else lijst.push(z);
  melden();
}
export function verwijderZwevend(id: string) { if (lijst.some((x) => x.id === id)) { lijst = lijst.filter((x) => x.id !== id); melden(); } }
export const useZwevend = () => useSyncExternalStore(abonneer, () => lijst, () => lijst);

let houderStand = 0;
/** Voor de stapel: «ik toon de zwevende vensters». */
export function useZwevendHouderZijn() {
  useEffect(() => { houders++; houderStand = houders; luisteraars.forEach((f) => f()); return () => { houders--; houderStand = houders; luisteraars.forEach((f) => f()); }; }, []);
}
/** Voor een venster: is er een stapel die mij toont? (anders eigen plashka) */
export const useZwevendHouder = () => useSyncExternalStore(abonneer, () => houderStand > 0, () => false);
