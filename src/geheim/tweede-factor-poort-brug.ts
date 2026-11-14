// IDENTITEIT-015 (етап 1.4): місток для воріт «другий чинник обов'язковий». Клієнт API ставить прапорець за полем
// `tweedeFactorPoort` у відповіді bootstrap (як codewoordPoort), вікно src/geheim/TweedeFactorPoort.tsx підписується.
// Brug: de API-client zet de vlag, het venster luistert. Zonder import van de client (cyclus).
import { useSyncExternalStore } from 'react';

let open = false;
const set = new Set<() => void>();

export function zetTweedeFactorPoort(volgende: boolean) {
  if (open === volgende) return;
  open = volgende;
  set.forEach((fn) => fn());
}

export function useTweedeFactorPoort(): boolean {
  return useSyncExternalStore((cb) => { set.add(cb); return () => set.delete(cb); }, () => open);
}
