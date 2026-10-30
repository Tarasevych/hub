// Другий крок входу (блок 4). Правила без бази: чи ця сесія вже назвала кодове слово.
// Строк збігається з абсолютним життям сесії власника (30 діб). Нова сесія питає знову.

export const CODEWOORD_LOGIN_MS = 30 * 24 * 60 * 60 * 1000;
const SPELING_MS = 60_000;

/** Чи позначка часу ще чинна для цієї сесії. */
export function loginVers(bevestigdOp: number, nu: number, maxMs = CODEWOORD_LOGIN_MS): boolean {
  return Number.isFinite(bevestigdOp) && bevestigdOp > 0 && bevestigdOp <= nu + SPELING_MS && nu - bevestigdOp < maxMs;
}

/** true = після Google ще треба кодове слово. Без слова ворота зачинені. */
export function poortNodig(heeftCodewoord: boolean, bevestigdOp: number, nu: number): boolean {
  if (!heeftCodewoord) return false;
  return !loginVers(bevestigdOp, nu);
}

/**
 * Яке id сесії пам’ятає слово: якір, якщо він цього акаунта; інакше вкладка.
 * Чужий якір (другий акаунт у тій самій браузерній сесії) не підтверджує цей акаунт.
 */
export function codewoordSessieId(input: { userId: string; anchorUserId?: string; anchorId?: string; tabUserId?: string; tabId?: string }): string {
  if (input.anchorId && input.anchorUserId === input.userId) return input.anchorId;
  if (input.tabId && (!input.tabUserId || input.tabUserId === input.userId)) return input.tabId;
  return '';
}

/** Ці маршрути лишаються, доки слово ще не назване: інакше нікуди його ввести і ніяк вийти. */
const VRIJ = new Set([
  'POST /api/owner/session/bootstrap',
  'POST /api/owner/session/codewoord',
  'POST /api/owner/session/logout-current',
  'POST /api/owner/session/logout-browser-all',
  'POST /api/owner/session/logout-account-browser',
  'POST /api/owner/session/accounts',
  'POST /api/owner/browser/accounts',
]);

export function codewoordRouteVrij(route: string): boolean {
  return VRIJ.has(route);
}
