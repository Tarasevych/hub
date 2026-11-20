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

/**
 * IDENTITEIT-015 (приймання aanmelden-sleutels): відмова сервера «ворота зачинені» (другий чинник або кодове слово ще не
 * підтверджено) — це не збій завантаження: вікно воріт уже пояснює, що до підтвердження дані не показуються. Розділи, які
 * показують «Не вдалося завантажити…», для такої відмови мовчать. Weigering van de poort is geen laadfout.
 */
export function isPoortWeigering(e: unknown): boolean {
  const x = e as { response?: { data?: { error?: unknown } }; data?: { error?: unknown } } | null;
  const code = String(x?.response?.data?.error ?? x?.data?.error ?? '');
  return code === 'TWEEDE_FACTOR_POORT' || code === 'CODEWOORD_POORT';
}

export function useTweedeFactorPoort(): boolean {
  return useSyncExternalStore((cb) => { set.add(cb); return () => set.delete(cb); }, () => open);
}
