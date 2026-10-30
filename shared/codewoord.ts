// Кодове слово (блок 8). Тут лише правила. Хеш — у backend/codewoord.ts (scrypt).

export function normaliseerCodewoord(woord: string): string {
  return String(woord || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/** Щонайменше 8 символів, не самі цифри, не локальна частина пошти. */
export function codewoordSterk(woord: string, email = ''): boolean {
  const w = normaliseerCodewoord(woord);
  if (w.length < 8 || w.length > 200) return false;
  if (/^\d+$/.test(w)) return false;
  const local = String(email || '').split('@')[0]?.trim().toLowerCase() || '';
  if (local && w.toLowerCase() === local) return false;
  return true;
}

/** Після 5 помилок — 15 хвилин. Коли блок минув, лічильник скидає викликач. */
export function pogingToegestaan(mislukt: number, geblokkeerdTot: number, nu: number): { ok: boolean; wachtMs: number } {
  const n = Number(mislukt) || 0;
  const tot = Number(geblokkeerdTot) || 0;
  if (n >= 5 && tot > nu) return { ok: false, wachtMs: tot - nu };
  return { ok: true, wachtMs: 0 };
}

export const CODEWOORD_BLOK_MS = 15 * 60 * 1000;
export const CODEWOORD_MAX_MISLUKT = 5;
