// APPARAAT-001 — alle zichtbare teksten van «Підтвердження з іншого пристрою» in de browser, één taal tegelijk (de taal van de
// pagina). Geen Engelse woorden in zichtbare tekst: «ключ доступу / toegangssleutel», «інший пристрій / ander apparaat».
export type Lang = 'uk' | 'nl';
export const tr = (lang: Lang, uk: string, nl: string): string => (lang === 'nl' ? nl : uk);

export const FOUTEN: Record<string, [string, string]> = {
  VLAG_UIT: ['Підтвердження з іншого пристрою ще не ввімкнено для вашого облікового запису.', 'Bevestigen vanaf een ander apparaat staat nog niet aan voor uw account.'],
  NIET_GEVONDEN: ['Підтвердження з іншого пристрою ще не ввімкнено для вашого облікового запису.', 'Bevestigen vanaf een ander apparaat staat nog niet aan voor uw account.'],
  UITGESCHAKELD: ['Цей спосіб зараз вимкнено (адміністратором або у ваших налаштуваннях).', 'Deze manier staat nu uit (door de beheerder of in uw instellingen).'],
  NIET_TOEGESTAAN: ['Для вашого облікового запису цей спосіб не дозволено.', 'Voor uw account is deze manier niet toegestaan.'],
  METHODE_UIT: ['Спосіб вимкнено після забагатьох неправильних символів. Відновіть його ключем доступу у «Способах входу».', 'De manier staat uit na te veel verkeerde symbolen. Herstel hem met uw toegangssleutel bij «Aanmeldmethoden».'],
  METHODE_PAUZE: ['Забагато помилок поспіль. Зачекайте трохи — ми не блокуємо вас назавжди.', 'Te veel fouten na elkaar. Wacht even — u bent niet blijvend geblokkeerd.'],
  GEEN_ANDER_APPARAAT: ['Зараз немає іншого пристрою, де ви увійшли нещодавно. Відкрийте сайт на телефоні чи іншому комп’ютері й спробуйте знову.', 'Er is nu geen ander apparaat waarop u onlangs bent aangemeld. Open de site op uw telefoon of een andere computer en probeer opnieuw.'],
  RATE_LIMITED: ['Забагато запитів. Зачекайте хвилину.', 'Te veel verzoeken. Wacht een minuut.'],
  VERZOEK_ONBEKEND: ['Запит не знайдено або він уже завершився.', 'Verzoek niet gevonden of al afgerond.'],
  VERLOPEN: ['Час на підтвердження вийшов. Спробуйте ще раз.', 'De tijd om te bevestigen is om. Probeer het opnieuw.'],
  AL_AFGEROND: ['Цей запит уже завершено.', 'Dit verzoek is al afgerond.'],
  ZELFDE_APPARAAT: ['Це той самий браузер, що й запит. Підтвердити можна лише з іншого пристрою.', 'Dit is dezelfde browser als het verzoek. Bevestigen kan alleen vanaf een ander apparaat.'],
  TE_SNEL: ['Зачекайте, доки закінчиться відлік, і спершу прочитайте, що саме підтверджуєте.', 'Wacht tot het aftellen klaar is en lees eerst wat u bevestigt.'],
  KEUZE_ONGELDIG: ['Невідомий символ.', 'Onbekend symbool.'],
  STEP_UP_PASSKEY_REQUIRED: ['Підтвердьте ключем доступу на цьому пристрої.', 'Bevestig met uw toegangssleutel op dit apparaat.'],
  PASSKEY_GEANNULEERD: ['Підтвердження ключем доступу скасовано — нічого не змінено.', 'Bevestiging met toegangssleutel geannuleerd — er is niets gewijzigd.'],
  BEHEERDER_NODIG: ['Потрібні права адміністратора.', 'Beheerdersrechten vereist.'],
  SESSIE_ONBEKEND: ['Сеанс не розпізнано. Оновіть сторінку.', 'Sessie niet herkend. Vernieuw de pagina.'],
  TELEGRAM_NIET_GEVRAAGD: ['За вашою таблицею підтверджень Telegram для цієї дії не використовується.', 'Volgens uw bevestigingstabel wordt Telegram voor deze handeling niet gebruikt.'],
  TELEGRAM_NIET_BEREIKBAAR: ['Не вдалося надіслати запит у Telegram. Перевірте, що бот не заблоковано, або підтвердьте іншим способом.', 'Het verzoek kon niet naar Telegram. Controleer dat de bot niet geblokkeerd is, of bevestig op een andere manier.'],
  METHODE_ONBESCHIKBAAR: ['Потрібний спосіб підтвердження зараз не працює. Скористайтеся іншим.', 'De nodige bevestigingsmanier werkt nu niet. Gebruik een andere.'],
  TELEGRAM_BEVESTIGING_NODIG: ['Потрібне ще одне підтвердження.', 'Er is nog een bevestiging nodig.'],
  NETWORK_ERROR: ['Немає з’єднання із сервером. Перевірте інтернет — спроба повториться сама.', 'Geen verbinding met de server. Controleer uw internet — er wordt vanzelf opnieuw geprobeerd.'],
};
export const foutTekst = (lang: Lang, code: string): string => {
  const f = FOUTEN[code];
  return f ? f[lang === 'nl' ? 1 : 0] : lang === 'nl' ? `Er ging iets mis (${code || 'onbekend'}). Er is niets half gewijzigd.` : `Щось пішло не так (${code || 'невідомо'}). Нічого не змінено наполовину.`;
};

/** Namen van de redenen waarom een verzoek eindigde (voor het overzicht). */
export const REDEN_NAMEN: Record<string, [string, string]> = {
  '': ['', ''],
  'fout-symbool': ['інший символ', 'ander symbool'],
  'niet-ik': ['«Це не я»', '«Dit ben ik niet»'],
  'door-a': ['скасовано на запитувачі', 'geannuleerd op het vragende apparaat'],
  vervangen: ['замінено новим запитом', 'vervangen door een nieuw verzoek'],
};
export const STAND_NAMEN: Record<string, [string, string]> = {
  wacht: ['очікує', 'wacht'], bevestigd: ['підтверджено', 'bevestigd'], gebruikt: ['підтверджено й використано', 'bevestigd en gebruikt'],
  geweigerd: ['відхилено', 'geweigerd'], verlopen: ['час вийшов', 'verlopen'], ingetrokken: ['відкликано', 'ingetrokken'],
};
export const tijd = (iso: string | null | undefined, lang: Lang) => (iso ? new Date(iso).toLocaleString(lang === 'nl' ? 'nl-BE' : 'uk-UA', { timeZone: 'Europe/Brussels', dateStyle: 'medium', timeStyle: 'short' }) : '—');
