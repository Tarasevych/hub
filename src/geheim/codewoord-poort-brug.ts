// Місток: клієнт API ставить прапорець, вікно підписується. Без імпорту клієнта сюди (цикл).

import { useSyncExternalStore } from 'react';

let open = false;
const set = new Set<() => void>();

export function zetCodewoordPoort(volgende: boolean) {
  if (open === volgende) return;
  open = volgende;
  set.forEach((fn) => fn());
}

export function useCodewoordPoort(): boolean {
  return useSyncExternalStore((cb) => { set.add(cb); return () => set.delete(cb); }, () => open);
}
