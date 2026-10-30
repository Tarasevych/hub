// Версія правил відправника. Старий автоматичний вердикт можна замінити новішим. Ручний — ні.
// 3: автоматично знімається ЛИШЕ автоматичний вердикт «ім’я контакту», і лише коли лист підписаний власним доменом.
export const AFZENDER_REGELS_VERSIE = 3;

const HANDMATIG = new Set(['HANDMATIG', 'HANDMATIG_VERDACHT']);
export const CONTACTNAAM_REDEN = 'NAAM_VAN_CONTACT_ANDER_ADRES';

/** Чи автоматичний новий вердикт «перевірений» має право замінити збережений. Ручна позначка лишається. */
export function magAutomatischOverschrijven(oudeReden: string, nieuweStatus: string): boolean {
  if (HANDMATIG.has(String(oudeReden || ''))) return false;
  return nieuweStatus === 'geverifieerd';
}

/** Лише автоматичне «ім’я контакту», і лише при підписі власним доменом. Інші причини й ручні позначки не чіпає. */
export function magContactnaamOpheffen(oudeReden: string, eigenDomein: boolean): boolean {
  if (!eigenDomein || HANDMATIG.has(String(oudeReden || ''))) return false;
  return oudeReden === CONTACTNAAM_REDEN;
}

/** Пояснення кнопки «Перевірити зараз» (uk, nl): звідки беруться свіжі дані. */
export const NU_UITLEG: [string, string] = [
  'Джерела цього разу: свіжий DNS домену (MX, SPF, DMARC, BIMI — запит робить ваш сервер) і Authentication-Results недавнього листа з вашої пошти. Вміст листа не читається. Для безкоштовної пошти DNS домену не питаємо: він нічого не каже про особу.',
  'Bronnen deze keer: verse DNS van het domein (MX, SPF, DMARC, BIMI — de vraag gaat via uw server) en de Authentication-Results van een recent bericht uit uw mail. De inhoud wordt niet gelezen. Bij een gratis mailbox vragen we de DNS van het domein niet: die zegt niets over de persoon.',
];
