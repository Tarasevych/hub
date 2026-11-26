// SITE-001 (пункт 17): перевірка коду гостьового доступу ще до надсилання.
// Сервер (backend/toegangscodes.ts → codeNormaal) приймає Crockford base32 і сам замінює O→0, I/L→1.
// На українській розкладці люди часто вводять кириличні літери, що виглядають як латинські (А, В, Е, К, М, Н, О, Р, С, Т, Х, І) —
// такий код сервер відкинув би як неправильний. Тут ці літери перетворюються на латинські, а інші недопустимі знаки
// показуються людині одразу, з поясненням. nl: controle van de gastcode vóór verzenden; Cyrillische lookalikes → Latijn.

/** Кириличні літери, що на вигляд збігаються з латинськими (великі після toUpperCase). */
const SCHIJN: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: '0', Р: 'P', С: 'C', Т: 'T', Х: 'X', І: '1', З: '3',
};
/** Знаки, які приймає сервер: Crockford base32 (без U) + O, I, L, які він сам замінює; пробіли й дефіси ігноруються. */
const GELDIG = /^[0-9A-HJ-NP-TV-Z OIL-]$/;
export const GAST_CODE_LENGTE = 16;

/** Нормалізує введене: великі літери, кириличні двійники → латинські. Інші знаки лишає, щоб людина бачила свою помилку. */
export function schoonGastCode(invoer: string): string {
  return [...invoer.toUpperCase()].map((t) => SCHIJN[t] ?? t).join('').slice(0, 24);
}

export type GastCodeStatus = { tekens: number; ongeldig: string[]; volledig: boolean };
/** Скільки значущих знаків уже введено, які знаки недопустимі (без повторів) і чи код повний. */
export function gastCodeStatus(code: string): GastCodeStatus {
  const ongeldig = [...new Set([...code].filter((t) => !GELDIG.test(t)))];
  const tekens = code.replace(/[\s-]/g, '').length;
  return { tekens, ongeldig, volledig: tekens >= GAST_CODE_LENGTE && ongeldig.length === 0 };
}
