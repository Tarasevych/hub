// Hoeveel externe-bureaubladsessies dit tabblad open heeft — voor de aanduiding «активний віддалений сеанс» op de technische band.
// Klein en zonder afhankelijkheden: TechLaag laadt dit direct; het eigenlijke venster (en guacamole-common-js) laadt pas bij gebruik.
import { useSyncExternalStore } from 'react';

let aantal = 0;
const luisteraars = new Set<() => void>();
const meld = () => { for (const f of luisteraars) f(); };
export function remoteSessieBegin(): () => void {
  aantal += 1; meld();
  let klaar = false;
  return () => { if (klaar) return; klaar = true; aantal = Math.max(0, aantal - 1); meld(); };
}
export const remoteAantal = () => aantal;
export const useRemoteAantal = () => useSyncExternalStore((f) => { luisteraars.add(f); return () => luisteraars.delete(f); }, () => aantal, () => 0);
