// TELEGRAM-AANMELDEN v1 — alle teksten van de bot (uk en nl) en de opdrachten. Opdrachtnamen in het Latijn en in het Nederlands
// (Telegram staat alleen a–z, 0–9 en _ toe); de omschrijvingen per taal. Elke boodschap eindigt met de vaste voetregel.
import type { Taal } from './model';

export type BotTekst = { uk: string; nl: string };
export const t = (x: BotTekst, taal: Taal | 'beide'): string => (taal === 'beide' ? `${x.uk}\n\n${x.nl}` : x[taal]);

export const VOETREGEL: BotTekst = { uk: '🔒 Я ніколи не прошу паролів чи кодів.', nl: '🔒 Ik vraag nooit om wachtwoorden of codes.' };

export const OPDRACHTEN = ['start', 'status', 'aanmeldingen', 'koppelen', 'ontkoppelen', 'taal', 'hulp'] as const;
export type Opdracht = typeof OPDRACHTEN[number];
export const OPDRACHT_OMSCHRIJVING: Record<Opdracht, BotTekst> = {
  start: { uk: 'Почати й обрати мову', nl: 'Beginnen en taal kiezen' },
  status: { uk: 'Мої прив’язки та їхній стан', nl: 'Mijn koppelingen en hun stand' },
  aanmeldingen: { uk: 'Останні входи на сайт', nl: 'Laatste aanmeldingen op de site' },
  koppelen: { uk: 'Як прив’язати цей Telegram', nl: 'Hoe deze Telegram te koppelen' },
  ontkoppelen: { uk: 'Відв’язати цей Telegram', nl: 'Deze Telegram ontkoppelen' },
  taal: { uk: 'Змінити мову бота', nl: 'Taal van de bot wijzigen' },
  hulp: { uk: 'Довідка й безпека', nl: 'Hulp en veiligheid' },
};

export const TEKST = {
  kiesTaal: { uk: 'Оберіть мову · Kies uw taal', nl: 'Оберіть мову · Kies uw taal' },
  taalHerkend: {
    uk: 'Ми бачимо, що ваш Telegram українською, тож пишемо українською. Змінити мову можна командою /taal або кнопкою нижче.',
    nl: 'We zien dat uw Telegram in het Nederlands staat, dus we schrijven in het Nederlands. Wijzig de taal met /taal of met de knop hieronder.',
  },
  taalGekozen: { uk: '✅ Мову бота змінено на українську. Мова сайту не змінюється.', nl: '✅ De taal van de bot is nu Nederlands. De taal van de site verandert niet.' },
  welkom: {
    uk: 'Вітаю! Це офіційний бот сайту «Мій простір» (id.tarasevych.com).\n\nЩо я вмію:\n• підтверджувати ваш вхід на сайт;\n• підтверджувати важливі дії;\n• показувати сповіщення про вхід і зміни.\n\nЩоб почати, прив’яжіть цей Telegram на сайті: «Налаштування» → «Способи входу» → «Прив’язати Telegram».',
    nl: 'Welkom! Dit is de officiële bot van «Mijn Ruimte» (id.tarasevych.com).\n\nWat ik doe:\n• uw aanmelding op de site bevestigen;\n• belangrijke handelingen bevestigen;\n• meldingen over aanmeldingen en wijzigingen tonen.\n\nKoppel deze Telegram eerst op de site: «Instellingen» → «Aanmeldmethoden» → «Telegram koppelen».',
  },
  koppelUitleg: {
    uk: 'Прив’язати Telegram можна лише з уже відкритого сайту, ніколи звідси. Відкрийте «Способи входу» на сайті й натисніть «Прив’язати Telegram». Так ніхто чужий не прив’яже свій Telegram до вашого облікового запису.',
    nl: 'Koppelen kan alleen vanuit de site waar u al bent aangemeld, nooit vanaf hier. Open «Aanmeldmethoden» op de site en kies «Telegram koppelen». Zo kan niemand anders zijn Telegram aan uw account koppelen.',
  },
  telefoonVraag: {
    uk: '📱 Крок 2 з 3: поділіться своїм номером телефону.\n\nНавіщо: номер підтверджує, що цей Telegram належить саме вам. Без нього хтось інший міг би прив’язати свій обліковий запис до вашого профілю.\n\nНатисніть кнопку «📱 Поділитися номером» унизу. Набраний вручну номер не приймається. Номер бачите лише ви та адміністратор сайту, повністю.',
    nl: '📱 Stap 2 van 3: deel uw telefoonnummer.\n\nWaarom: het nummer bevestigt dat deze Telegram echt van u is. Zonder nummer zou iemand anders zijn account aan uw profiel kunnen koppelen.\n\nTik onderaan op «📱 Nummer delen». Een getypt nummer wordt niet aanvaard. Alleen u en de beheerder van de site zien het nummer, volledig.',
  },
  deelKnop: { uk: '📱 Поділитися номером', nl: '📱 Nummer delen' },
  getyptNummer: { uk: '⛔ Набраний вручну номер не приймається. Натисніть кнопку «📱 Поділитися номером».', nl: '⛔ Een getypt nummer wordt niet aanvaard. Tik op «📱 Nummer delen».' },
  vreemdContact: { uk: '⛔ Це контакт іншої людини. Поділитися можна лише власним номером через кнопку.', nl: '⛔ Dit is het contact van iemand anders. Alleen uw eigen nummer via de knop telt.' },
  telefoonOntvangen: {
    uk: '✅ Номер отримано. Крок 3 з 3: поверніться на сайт і підтвердьте прив’язку ключем доступу. Ключ доступу підтверджує, що прив’язку робите саме ви, а не хтось із доступом до вашого Telegram.',
    nl: '✅ Nummer ontvangen. Stap 3 van 3: ga terug naar de site en bevestig de koppeling met uw passkey. De passkey bevestigt dat u zelf koppelt, niet iemand met toegang tot uw Telegram.',
  },
  koppelVerlopen: { uk: '⌛ Час на прив’язку минув. Почніть знову на сайті.', nl: '⌛ De tijd om te koppelen is verstreken. Begin opnieuw op de site.' },
  gekoppeld: { uk: '✅ Telegram прив’язано до облікового запису «{account}».', nl: '✅ Telegram is gekoppeld aan het account «{account}».' },
  nietGekoppeld: { uk: 'Цей Telegram ще не прив’язано до жодного облікового запису. Команда /koppelen пояснить, як це зробити.', nl: 'Deze Telegram is nog aan geen enkel account gekoppeld. /koppelen legt uit hoe.' },
  welkAccount: { uk: 'До якого облікового запису увійти?', nl: 'Bij welk account aanmelden?' },
  inlogVraag: {
    uk: '🔐 Запит на вхід\n\nХто: {account}\nЩо: вхід на сайт «Мій простір»\nКоли: {tijd}\nЗвідки: {apparaat}\n\nЩо це означає: хтось (сподіваємось, ви) натиснув «Увійти через Telegram» на сайті.\nЩо далі: якщо це ви, натисніть «✅ Це я, увійти». Якщо ні, натисніть «⛔ Це не я», і вхід буде заблоковано.',
    nl: '🔐 Aanmeldverzoek\n\nWie: {account}\nWat: aanmelden op «Mijn Ruimte»\nWanneer: {tijd}\nVanwaar: {apparaat}\n\nWat dit betekent: iemand (hopelijk u) koos «Aanmelden met Telegram» op de site.\nWat nu: bent u het, tik dan «✅ Ik ben het, aanmelden». Zo niet, tik «⛔ Dit ben ik niet» en de aanmelding wordt geblokkeerd.',
  },
  bevestigVraag: {
    uk: '🛡️ Підтвердження дії\n\nХто: {account}\nЩо: {actie}\nКоли: {tijd}\n\nЩо це означає: на сайті потрібне ваше підтвердження цієї дії.\nЩо далі: якщо це ви, натисніть «✅ Підтвердити». Якщо ні, «⛔ Це не я».',
    nl: '🛡️ Bevestiging van een handeling\n\nWie: {account}\nWat: {actie}\nWanneer: {tijd}\n\nWat dit betekent: de site vraagt uw bevestiging voor deze handeling.\nWat nu: bent u het, tik «✅ Bevestigen». Zo niet, «⛔ Dit ben ik niet».',
  },
  knopJaInloggen: { uk: '✅ Це я, увійти', nl: '✅ Ik ben het, aanmelden' },
  knopBevestigen: { uk: '✅ Підтвердити', nl: '✅ Bevestigen' },
  knopNietIk: { uk: '⛔ Це не я', nl: '⛔ Dit ben ik niet' },
  knopWasIk: { uk: '✅ Це був я', nl: '✅ Dat was ik' },
  knopOpenSite: { uk: '🌐 Відкрити на сайті', nl: '🌐 Openen op de site' },
  knopOpnieuw: { uk: '🔄 Спробувати ще', nl: '🔄 Opnieuw proberen' },
  knopAnnuleren: { uk: '❌ Скасувати', nl: '❌ Annuleren' },
  knopOntkoppelBevestig: { uk: '⚠️ Так, відв’язати', nl: '⚠️ Ja, ontkoppelen' },
  ontvangen: { uk: '⏳ Прийнято, перевіряю…', nl: '⏳ Ontvangen, ik controleer…' },
  bezig: { uk: '⏳ Виконую…', nl: '⏳ Bezig…' },
  nogEven: { uk: '⏳ Ще трохи, перевіряю з’єднання…', nl: '⏳ Nog even, ik controleer de verbinding…' },
  alBezig: { uk: 'Вже виконується', nl: 'Al bezig' },
  alGedaan: { uk: 'Вже виконано', nl: 'Al gedaan' },
  verlopen: { uk: '⌛ Ця кнопка вже недійсна. Почніть знову на сайті.', nl: '⌛ Deze knop is niet meer geldig. Begin opnieuw op de site.' },
  teSnel: { uk: '⏸️ Забагато натискань. Зачекайте хвилину.', nl: '⏸️ Te veel tikken. Wacht een minuut.' },
  ingelogd: { uk: '✅ Вхід підтверджено. Поверніться на сайт, він відкриється сам.', nl: '✅ Aanmelding bevestigd. Ga terug naar de site; die opent vanzelf.' },
  bevestigd: { uk: '✅ Підтверджено.', nl: '✅ Bevestigd.' },
  geweigerd: { uk: '⛔ Заблоковано. Ми повідомили власника облікового запису й адміністратора.', nl: '⛔ Geblokkeerd. We hebben de eigenaar van het account en de beheerder ingelicht.' },
  storingTijdelijk: { uk: '⚠️ Не вдалося, спробую ще раз автоматично через 10 секунд.', nl: '⚠️ Mislukt; ik probeer het over 10 seconden vanzelf opnieuw.' },
  storingLang: { uk: '⚠️ Сайт зараз не відповідає, ми це вже бачимо. Я напишу вам, щойно запрацює. Можна увійти іншим способом.', nl: '⚠️ De site antwoordt nu niet; we weten het al. Ik laat het u weten zodra het weer werkt. U kunt op een andere manier aanmelden.' },
  storingVast: { uk: '⛔ Цей спосіб зараз не працює, і повторна спроба не допоможе. Скористайтеся ключем доступу або кодом відновлення.', nl: '⛔ Deze manier werkt nu niet en opnieuw proberen helpt niet. Gebruik uw passkey of een herstelcode.' },
  geheimVerwijderd: {
    uk: '⛔ Я видалив ваше повідомлення: воно схоже на код чи пароль. Ніколи не надсилайте таємний код у цей чат. Якщо це був ваш таємний код, змініть його на сайті (ключем доступу). Доти підтвердження з таємним кодом вимкнено.',
    nl: '⛔ Ik heb uw bericht verwijderd: het lijkt op een code of wachtwoord. Stuur uw geheime code nooit in deze chat. Was het uw geheime code, wijzig die dan op de site (met uw passkey). Tot dan staat bevestigen met de geheime code uit.',
  },
  wijzigingVraag: {
    uk: '⚠️ Ми помітили зміну у вашому Telegram\n\nОбліковий запис: {account}\nЩо змінилось: {veld}\nБуло: {oud}\nСтало: {nieuw}\nКоли: {tijd}\n\nЩо це означає: поки ви не підтвердите зміну на сайті ключем доступу, вхід через цей Telegram призупинено.\nЩо далі: «Це був я» лише позначає зміну як побачену; підтвердити можна тільки на сайті. Якщо це не ви, натисніть «⛔ Це не я».',
    nl: '⚠️ We zagen een wijziging in uw Telegram\n\nAccount: {account}\nWat veranderde: {veld}\nWas: {oud}\nIs nu: {nieuw}\nWanneer: {tijd}\n\nWat dit betekent: tot u de wijziging op de site met uw passkey bevestigt, staat aanmelden met deze Telegram op pauze.\nWat nu: «Dat was ik» markeert de wijziging alleen als gezien; bevestigen kan alleen op de site. Bent u het niet, tik «⛔ Dit ben ik niet».',
  },
  gezien: { uk: '👁️ Позначено як побачене. Тепер підтвердіть зміну на сайті ключем доступу.', nl: '👁️ Gemarkeerd als gezien. Bevestig de wijziging nu op de site met uw passkey.' },
  conflict: {
    uk: '🚨 Увага: у Telegram хтось підтвердив зміну, а на сайті її заперечили. Схоже, ваш Telegram міг бути зламаний. Прив’язку вимкнено.\n\nЩо зробити:\n1. Telegram → Налаштування → Пристрої: завершіть усі чужі сеанси.\n2. Увімкніть хмарний пароль (двоетапну перевірку).\n3. Перевірте пристрої на сайті.',
    nl: '🚨 Let op: in Telegram bevestigde iemand de wijziging, maar op de site werd ze ontkend. Mogelijk is uw Telegram gekaapt. De koppeling staat uit.\n\nWat te doen:\n1. Telegram → Instellingen → Apparaten: beëindig alle vreemde sessies.\n2. Zet het cloudwachtwoord (tweestapsverificatie) aan.\n3. Controleer de apparaten op de site.',
  },
  ontkoppelVraag: { uk: 'Відв’язати цей Telegram від облікового запису «{account}»? Після цього входити через нього не вийде.', nl: 'Deze Telegram ontkoppelen van het account «{account}»? Daarna kunt u er niet meer mee aanmelden.' },
  ontkoppeld: { uk: '✅ Відв’язано.', nl: '✅ Ontkoppeld.' },
  laatsteMethode: { uk: '⛔ Це ваш останній спосіб входу, тому його не можна відв’язати. Спершу додайте інший.', nl: '⛔ Dit is uw laatste aanmeldmethode en kan dus niet ontkoppeld worden. Voeg eerst een andere toe.' },
  hulp: {
    uk: 'ℹ️ Довідка\n\n/status — мої прив’язки\n/aanmeldingen — останні входи\n/koppelen — як прив’язати\n/ontkoppelen — відв’язати\n/taal — мова бота\n\nБезпека: я ніколи не прошу паролів, кодів чи номерів карток. Таємний код вводиться лише на сайті. Посилання від мене ведуть тільки на id.tarasevych.com.',
    nl: 'ℹ️ Hulp\n\n/status — mijn koppelingen\n/aanmeldingen — laatste aanmeldingen\n/koppelen — hoe koppelen\n/ontkoppelen — ontkoppelen\n/taal — taal van de bot\n\nVeiligheid: ik vraag nooit om wachtwoorden, codes of kaartnummers. De geheime code typt u alleen op de site. Mijn links gaan alleen naar id.tarasevych.com.',
  },
  onbekend: { uk: 'Я не розумію цього повідомлення. Команда /hulp покаже, що я вмію.', nl: 'Ik begrijp dit bericht niet. /hulp toont wat ik kan.' },
  testBericht: { uk: '✅ Пробне повідомлення: бот налаштовано й він працює.', nl: '✅ Testbericht: de bot is ingesteld en werkt.' },
  hersteld: { uk: '✅ Вхід через Telegram знову працює.', nl: '✅ Aanmelden met Telegram werkt weer.' },
} as const satisfies Record<string, BotTekst>;

export const VELD_NAMEN: Record<string, BotTekst> = {
  telegramId: { uk: 'номер облікового запису Telegram', nl: 'Telegram-accountnummer' },
  telefoon: { uk: 'номер телефону', nl: 'telefoonnummer' },
  gebruikersnaam: { uk: '@ім’я користувача', nl: '@gebruikersnaam' },
  voornaam: { uk: 'ім’я', nl: 'voornaam' },
  achternaam: { uk: 'прізвище', nl: 'achternaam' },
  fotoId: { uk: 'фото профілю', nl: 'profielfoto' },
  apparaat: { uk: 'пристрій', nl: 'apparaat' },
};

/** Vult {sleutel} in; waarden worden ontdaan van stuurtekens. Bot-berichten gaan als platte tekst (geen parse_mode). */
export function invullen(sjabloon: string, waarden: Record<string, string>): string {
  return sjabloon.replace(/\{([a-z]+)\}/g, (_m, k: string) => String(waarden[k] ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').slice(0, 200));
}
/** Boodschap + voetregel, in één taal of tweetalig. */
export function metVoet(tekst: string, taal: Taal | 'beide'): string {
  return `${tekst}\n\n${t(VOETREGEL, taal)}`;
}
