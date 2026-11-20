// IDENTITEIT-014: нагадування про резервний доступ. Коли після використання коду відновлення їх лишилося 2 або менше,
// сервер один раз (на кожен набір кодів) шле сповіщення access_recovery_low у центр сповіщень — якщо власник не вимкнув
// «Нагадувати про резервний доступ» у Меню → Сповіщення в меню. Перевірка на сервері, бо код використовують і під час входу,
// і на іншому пристрої, де інтерфейсу ще немає.
// Herinnering aan reservetoegang: bij ≤2 resterende herstelcodes precies één melding per codeset (atomisch via zetEenmalig),
// tenzij de eigenaar de schakelaar in het menu uitzette. Een fout in de melding breekt het aanmelden nooit.
import { meld, meldingVoorkeurenVan } from './melder';

export const RESERVE_DREMPEL = 2;
export const RESERVE_SOORT = 'access_recovery_low';
// IDENTITEIT-014 (herstel): #herstel bestond nergens en /methods heeft (op de accountpagina) geen codes — het doel is «Відновлення доступу».
export const RESERVE_LINK = 'https://id.tarasevych.com/recovery#aanmeldmethoden-herstel';

/** Is er na gebruik «bijna niets» over? Ingetrokken sets tellen niet (daarvoor is er al een eigen melding). */
export function reserveOnderDrempel(over: number, ingetrokken = false): boolean {
  return !ingetrokken && Number.isFinite(over) && over >= 0 && over <= RESERVE_DREMPEL;
}

/** Tweetalige tekst «uk / nl» zoals de andere beveiligingsmeldingen; zegt wat er gebeurt als u niets doet en wat te doen. */
export function reserveTekst(over: number): { titel: string; tekst: string } {
  const n = Math.max(0, Math.floor(over));
  const uk = n === 0
    ? 'Кодів відновлення більше немає. Якщо ви втратите телефон чи ключ доступу, увійти без них не вийде. Створіть новий набір кодів у розділі «Відновлення» і збережіть його поза цим пристроєм.'
    : `Залишилося кодів відновлення: ${n}. Коли вони закінчаться, без телефона чи ключа доступу увійти не вийде. Створіть новий набір кодів у розділі «Відновлення» — старі коди тоді перестануть діяти.`;
  const nl = n === 0
    ? 'Er zijn geen herstelcodes meer. Raakt u uw telefoon of passkey kwijt, dan kunt u zonder codes niet meer aanmelden. Maak een nieuwe set bij «Herstel» en bewaar die buiten dit apparaat.'
    : `Nog ${n} herstelcode(s) over. Zijn ze op, dan kunt u zonder telefoon of passkey niet meer aanmelden. Maak een nieuwe set bij «Herstel»; de oude codes werken dan niet meer.`;
  return { titel: 'Залишилося мало кодів відновлення / Weinig herstelcodes over', tekst: `${uk} / ${nl}` };
}

export type ReserveStand = { over: number; ingetrokken: boolean } | null;
export type ReserveUitkomst = 'gemeld' | 'boven-drempel' | 'uit' | 'al-gemeld' | 'fout';

/**
 * Na een geslaagd gebruik van een herstelcode. `lees` geeft de stand NA het verbruik; `eenmalig` zet atomisch een vlag per
 * codeset (true = déze aanroep zette hem; gelijktijdige aanroepen → precies één true). De voorkeur wordt vóór de vlag gelezen:
 * met de schakelaar uit wordt niets verbruikt, zodat na weer aanzetten het volgende gebruik onder de drempel alsnog meldt.
 */
export async function reserveBijnaOpMelden(userId: string, lees: () => Promise<ReserveStand>, eenmalig: () => Promise<boolean>): Promise<ReserveUitkomst> {
  try {
    const stand = await lees();
    if (!stand || !reserveOnderDrempel(stand.over, stand.ingetrokken)) return 'boven-drempel';
    if ((await meldingVoorkeurenVan(userId))?.reserveHerinnering === false) return 'uit';
    if (!(await eenmalig())) return 'al-gemeld';
    const { titel, tekst } = reserveTekst(stand.over);
    await meld(userId, RESERVE_SOORT, titel, tekst, RESERVE_LINK);
    return 'gemeld';
  } catch (err) {
    console.error('[reserve-herinnering] melding mislukt:', (err as Error).message);
    return 'fout';
  }
}
