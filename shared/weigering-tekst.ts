// SEC-002 (slot «u», 12.11.2026): ÉÉN tabel met mensentekst voor de weigeringen die de server sinds het audit geeft en die
// nog nergens in de interface een tekst hadden (gevonden door alle foutcodes die in de diff t.o.v. de basis 11e0aad8 in backend/
// en server/ nieuw zijn, te zoeken in src/, shared/ en extension/: codes zonder enige tekst daar staan hier). Plus RBAC_FORBIDDEN van de rol «лише перегляд»: die
// code bestond al, maar buiten de hmara zag de mens «Не вдалося (RBAC_FORBIDDEN).».
//
// Gebruik:
//   • shared/foutuitleg.ts neemt deze regels op in zijn enige tabel (meldingen met «Деталі», agenten, mail, schijf…);
//   • de eigen foutentabellen van de modules (notities, huis, agenda, toegang, werkblad…) vragen weigeringZin() vóór hun
//     terugval «Не вдалося (CODE)»: een bekende weigering krijgt zo overal dezelfde zin — wat er gebeurde én wat nu te doen.
// Elke tekst: uk + nl, zonder Engelse woorden, met een advies. Puur (geen DOM, geen fetch): dezelfde regel in browser en test.
export type Lang = 'uk' | 'nl';
export type WeigeringRegel = { uk: string; nl: string; doenUk: string; doenNl: string };

/** De bovengrens van de lichamen (server/platform/body-budget.ts) stuurt Retry-After: 5. Zonder getal uit het antwoord: dit. */
export const STANDAARD_WACHT_SECONDEN = 5;

const secUk = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'секунду' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'секунди' : 'секунд'}`;
const secNl = (n: number) => `${n} ${n === 1 ? 'seconde' : 'seconden'}`;
const wacht = (s?: number) => (Number.isFinite(s) && Number(s) > 0 ? Math.min(3600, Math.ceil(Number(s))) : STANDAARD_WACHT_SECONDEN);

/** Rol «лише перегляд» (backend/kijker-alleen-lezen.ts → 403 RBAC_FORBIDDEN, reden KIJKER_ALLEEN_LEZEN; ook backend/rbac.ts). */
export const ALLEEN_LEZEN: WeigeringRegel = Object.freeze({
  uk: 'Ваша роль — лише перегляд: тут можна дивитися, але не змінювати. Нічого не змінено. Змінювати можуть учасники з повним доступом, адміністратори й власник сайту.',
  nl: 'Uw rol is alleen-lezen: u kunt hier kijken, maar niets wijzigen. Er is niets gewijzigd. Wijzigen kunnen leden met volledige toegang, beheerders en de eigenaar van de site.',
  doenUk: 'Якщо вам потрібно змінювати, попросіть власника або адміністратора сайту змінити вашу роль (Адміністрування → Користувачі). Спробу записано в журнал.',
  doenNl: 'Moet u kunnen wijzigen, vraag dan de eigenaar of een beheerder van de site uw rol aan te passen (Beheer → Gebruikers). De poging staat in het journaal.',
});

/** Grenzen van de lichamen (server/platform/body-budget.ts): het verzoek is NIET aangenomen, er is niets bewaard. */
function lichaamRegel(code: string, s: number): WeigeringRegel | null {
  const doenUk = `Спробуйте за ${secUk(s)} — повторіть ту саму дію.`;
  const doenNl = `Probeer het over ${secNl(s)} opnieuw — herhaal dezelfde actie.`;
  switch (code) {
    case 'SERVER_BUSY':
      return {
        uk: 'Сервер зараз зайнятий: він саме приймає багато великих запитів одночасно, тому цей запит не прийнято. Нічого не збережено.',
        nl: 'De server is nu bezet: hij neemt op dit moment veel grote verzoeken tegelijk aan, daarom is dit verzoek niet aangenomen. Er is niets bewaard.',
        doenUk, doenNl,
      };
    case 'TOO_MANY_BODIES':
      return {
        uk: 'З вашої мережі зараз надходить забагато запитів із даними одночасно (наприклад, кілька завантажень паралельно). Цей запит не прийнято, нічого не збережено.',
        nl: 'Vanaf uw netwerk komen nu te veel verzoeken met gegevens tegelijk binnen (bijvoorbeeld meerdere uploads naast elkaar). Dit verzoek is niet aangenomen, er is niets bewaard.',
        doenUk: `Дочекайтеся завершення інших завантажень і спробуйте за ${secUk(s)}.`,
        doenNl: `Wacht tot de andere uploads klaar zijn en probeer het over ${secNl(s)} opnieuw.`,
      };
    case 'TOO_MANY_BODY_BYTES':
      return {
        uk: 'З вашої мережі зараз надходить забагато даних одночасно (великі файли паралельно). Цей запит не прийнято, нічого не збережено.',
        nl: 'Vanaf uw netwerk komen nu te veel gegevens tegelijk binnen (grote bestanden naast elkaar). Dit verzoek is niet aangenomen, er is niets bewaard.',
        doenUk: `Надсилайте великі файли по одному й спробуйте за ${secUk(s)}.`,
        doenNl: `Verstuur grote bestanden één voor één en probeer het over ${secNl(s)} opnieuw.`,
      };
    default:
      return null;
  }
}

const VAST: Readonly<Record<string, WeigeringRegel>> = Object.freeze({
  RBAC_FORBIDDEN: ALLEEN_LEZEN,
  KIJKER_ALLEEN_LEZEN: ALLEEN_LEZEN,
  BODY_TIMEOUT: {
    uk: 'Дані запиту надходили надто повільно, і сервер перестав чекати (без входу на сайт — не довше 15 секунд). Нічого не збережено.',
    nl: 'De gegevens van het verzoek kwamen te traag binnen en de server stopte met wachten (zonder aanmelding hoogstens 15 seconden). Er is niets bewaard.',
    doenUk: 'Перевірте мережу й повторіть. Після входу на сайт ця межа не діє.',
    doenNl: 'Controleer het netwerk en probeer opnieuw. Na aanmelden op de site geldt deze grens niet.',
  },
  BODY_LENGTH_INVALID: {
    uk: 'Браузер повідомив неправильний розмір даних запиту, тому сервер його не прийняв. Нічого не збережено.',
    nl: 'De browser gaf een onjuiste grootte van de gegevens op, daarom nam de server het verzoek niet aan. Er is niets bewaard.',
    doenUk: 'Оновіть сторінку й повторіть. Якщо повторюється — вимкніть розширення чи проксі, що змінюють запити.',
    doenNl: 'Ververs de pagina en probeer opnieuw. Blijft het, zet dan extensies of een proxy uit die verzoeken wijzigen.',
  },
  BODY_ABORTED: {
    uk: 'Передавання даних обірвалося посередині (зв’язок перервано або сторінку закрито). Нічого не збережено.',
    nl: 'Het versturen van de gegevens brak halverwege af (verbinding verbroken of pagina gesloten). Er is niets bewaard.',
    doenUk: 'Перевірте мережу й повторіть дію.',
    doenNl: 'Controleer het netwerk en herhaal de actie.',
  },
  JSON_VEREIST: {
    uk: 'Сервер приймає дії лише від сторінок самого сайту (дані у форматі JSON), а цей запит прийшов як звичайна форма. Так сайт захищено від підроблених форм на чужих сторінках. Нічого не змінено.',
    nl: 'De server neemt acties alleen aan van pagina’s van de site zelf (gegevens als JSON), en dit verzoek kwam als gewoon formulier. Zo is de site beschermd tegen nagemaakte formulieren op andere pagina’s. Er is niets gewijzigd.',
    doenUk: 'Оновіть сторінку (вкладка може працювати на старій версії) і повторіть. Якщо ви цього не робили — закрийте сторінку, з якої прийшли.',
    doenNl: 'Ververs de pagina (het tabblad draait misschien een oude versie) en probeer opnieuw. Deed u dit niet, sluit dan de pagina waar u vandaan kwam.',
  },
  JOURNAAL_NIET_BESCHIKBAAR: {
    uk: 'Дію не виконано (наприклад, токен доступу не видано): сервер не зміг записати подію в журнал аудиту, а без запису в журналі така дія не виконується. Нічого не змінено.',
    nl: 'De actie is niet uitgevoerd (bijvoorbeeld: geen toegangstoken uitgegeven): de server kon de gebeurtenis niet in het auditjournaal schrijven, en zonder regel in het journaal gebeurt zo’n actie niet. Er is niets gewijzigd.',
    doenUk: 'Спробуйте за хвилину. Якщо повториться — повідомте власника сайту: журнал аудиту або база даних недоступні.',
    doenNl: 'Probeer het over een minuut opnieuw. Gebeurt het weer, meld het dan aan de eigenaar van de site: het auditjournaal of de database is niet bereikbaar.',
  },
  APPARAAT_COOKIE_ONGELDIG: {
    uk: 'Позначка цього браузера пошкоджена, тому його не впізнано як відомий пристрій.',
    nl: 'De markering van deze browser is beschadigd, daarom is hij niet herkend als bekend apparaat.',
    doenUk: 'Увійдіть знову: після входу браузер отримає нову позначку. Якщо повторюється — видаліть файли cookie цього сайту.',
    doenNl: 'Meld u opnieuw aan: na het aanmelden krijgt de browser een nieuwe markering. Blijft het, wis dan de cookies van deze site.',
  },
  ARGON2_ONTBREEKT: {
    uk: 'На сервері бракує модуля шифрування для входу через Телеграм, тому вхід не завершено. Нічого не змінено.',
    nl: 'Op de server ontbreekt de versleutelmodule voor aanmelden via Telegram, daarom is de aanmelding niet afgerond. Er is niets gewijzigd.',
    doenUk: 'Увійдіть іншим способом (Google або passkey) і повідомте власника сайту: сервер треба оновити.',
    doenNl: 'Meld u op een andere manier aan (Google of passkey) en meld het aan de eigenaar van de site: de server moet worden bijgewerkt.',
  },
  BINDING_RID_ONGELDIG: {
    uk: 'Запит на підключення ШІ має неправильний номер, тому згоду не прийнято.',
    nl: 'Het verzoek om een AI te koppelen heeft een onjuist nummer, daarom is de toestemming niet aangenomen.',
    doenUk: 'Почніть підключення ШІ заново з його вікна. Якщо ви не починали підключення — нічого не робіть.',
    doenNl: 'Begin het koppelen van de AI opnieuw vanuit het eigen venster. Bent u niet zelf begonnen, doe dan niets.',
  },
  CAP_ONBEKEND: {
    uk: 'Сервер не зміг прочитати перемикачі доступності інструментів ШІ, тому з обережності виклик відхилено. Нічого не змінено.',
    nl: 'De server kon de beschikbaarheidsschakelaars van de AI-hulpmiddelen niet lezen, daarom is de aanroep uit voorzorg geweigerd. Er is niets gewijzigd.',
    doenUk: 'Спробуйте за хвилину. Якщо повторюється — повідомте власника сайту (сторінка «Доступ ШІ»).',
    doenNl: 'Probeer het over een minuut opnieuw. Blijft het, meld het dan aan de eigenaar van de site (pagina «AI-toegang»).',
  },
  DNS_TIJD: {
    uk: 'Адресу домашнього сервера не вдалося знайти вчасно (служба імен не відповіла).',
    nl: 'Het adres van de thuisserver is niet op tijd gevonden (de naamdienst antwoordde niet).',
    doenUk: 'Перевірте адресу й мережу (VPN, домашній інтернет) і повторіть.',
    doenNl: 'Controleer het adres en het netwerk (VPN, internet thuis) en probeer opnieuw.',
  },
  PROEF_URL_ONGELDIG: {
    uk: 'Адреса тестової бази для перевірки міграцій неправильна, тому перевірку не запущено. Робочу базу не змінено.',
    nl: 'Het adres van de testdatabase voor de migratieproef is onjuist, daarom is de proef niet gestart. De echte database is niet gewijzigd.',
    doenUk: 'Виправте адресу тестової бази в налаштуваннях сервера й запустіть перевірку знову.',
    doenNl: 'Verbeter het adres van de testdatabase in de serverinstellingen en start de proef opnieuw.',
  },
  REMOTE_STATUS_INVALID: {
    uk: 'Зовнішній сервіс відповів неприпустимим кодом стану, тому його відповідь не прийнято.',
    nl: 'De externe dienst antwoordde met een ongeldige statuscode, daarom is het antwoord niet aangenomen.',
    doenUk: 'Перевірте адресу або спробуйте пізніше; якщо так і лишиться — зверніться до постачальника сервісу.',
    doenNl: 'Controleer het adres of probeer het later; blijft het zo, neem dan contact op met de aanbieder van de dienst.',
  },
  REMOTE_STREAM_FAILED: {
    uk: 'Отримання даних від зовнішнього сервісу обірвалося посередині. Збережено лише те, що вже було.',
    nl: 'Het ophalen van gegevens bij de externe dienst brak halverwege af. Alleen wat er al was, is bewaard.',
    doenUk: 'Повторіть за хвилину.',
    doenNl: 'Probeer het over een minuut opnieuw.',
  },
  SLEUTELKLUIS_KDF_PARAMETERS: {
    uk: 'Параметри захисту сховища ключів пошкоджені або невідомі, тому сховище не відкрито. Дані не змінено.',
    nl: 'De beveiligingsinstellingen van de sleutelkluis zijn beschadigd of onbekend, daarom is de kluis niet geopend. Er is niets gewijzigd.',
    doenUk: 'Не повторюйте спроби багато разів — повідомте власника сайту; відновлення можливе з кодом відновлення сховища.',
    doenNl: 'Probeer het niet steeds opnieuw — meld het aan de eigenaar van de site; herstel kan met de herstelcode van de kluis.',
  },
  STORAGE_MOVE_SAME_PATH: {
    uk: 'Файл уже лежить у цьому місці — переміщувати нічого.',
    nl: 'Het bestand staat al op deze plek — er valt niets te verplaatsen.',
    doenUk: 'Виберіть іншу теку чи назву.',
    doenNl: 'Kies een andere map of naam.',
  },
  STORAGE_MOVE_TARGET_EXISTS: {
    uk: 'У новому місці вже є файл із такою назвою; його не перезаписано.',
    nl: 'Op de nieuwe plek staat al een bestand met die naam; het is niet overschreven.',
    doenUk: 'Перейменуйте один із файлів або виберіть іншу теку.',
    doenNl: 'Geef een van de bestanden een andere naam of kies een andere map.',
  },
  STORAGE_MOVE_ROLLBACK_FAILED: {
    uk: 'Переміщення файлу не вдалося, і повернути його на старе місце теж не вийшло.',
    nl: 'Het verplaatsen van het bestand mislukte, en terugzetten op de oude plek lukte ook niet.',
    doenUk: 'Більше нічого не змінюйте з цим файлом і повідомте власника сайту — у журналі сервера є обидва шляхи.',
    doenNl: 'Wijzig verder niets aan dit bestand en meld het aan de eigenaar van de site — het serverlogboek noemt beide paden.',
  },
  // Codes die slot «s» parallel toevoegde (server/platform/router.ts, backend/telegram-aanmelden/inloggen.ts, backend/github-platform.ts).
  INVOER_NUL: {
    // 400 alleen bij een nulteken in een naam, kenmerk of pad (sleutel van het lichaam, zoekparameter, deel van het adres);
    // in gewone tekst haalt de server het teken zelf weg (server/platform/router.ts).
    uk: 'Запит містив недопустимий невидимий символ (нульовий) у назві, ідентифікаторі чи шляху, тому сервер його не прийняв. Нічого не змінено.',
    nl: 'Het verzoek bevatte een ongeldig onzichtbaar teken (nulteken) in een naam, kenmerk of pad, daarom nam de server het niet aan. Er is niets gewijzigd.',
    doenUk: 'Наберіть назву чи адресу заново (не вставляйте її зі скопійованого тексту) або оновіть сторінку й повторіть дію. Якщо посилання вам надіслали — не відкривайте його.',
    doenNl: 'Typ de naam of het adres opnieuw (niet plakken uit gekopieerde tekst) of ververs de pagina en herhaal de actie. Kreeg u de link toegestuurd, open hem dan niet.',
  },
  NIEUW_APPARAAT_ANDERE_WEG: {
    uk: 'Цей браузер ще не відомий вашому обліковому запису: після оновлення безпеки кожен браузер один раз підтверджується, а ключа доступу у вас немає.',
    nl: 'Deze browser is nog niet bekend bij uw account: na de beveiligingsupdate wordt elke browser één keer bevestigd, en u hebt geen toegangssleutel.',
    doenUk: 'Увійдіть у цьому браузері іншим способом — через Google. Після цього вхід через Телеграм тут працюватиме без додаткових кроків.',
    doenNl: 'Meld u in deze browser op een andere manier aan — met Google. Daarna werkt aanmelden met Telegram hier zonder extra stappen.',
  },
  WEBHOOKS_OPRUIMEN_MISLUKT: {
    uk: 'Зв’язок із GitHub від’єднано, але вебгуки сайту в сховищах GitHub прибрати не вдалося.',
    nl: 'De koppeling met GitHub is losgemaakt, maar de webhooks van de site in de repositories op GitHub konden niet worden weggehaald.',
    doenUk: 'Приберіть їх вручну: на GitHub — налаштування сховища → вебгуки. Сайт такі повідомлення однаково відхиляє.',
    doenNl: 'Haal ze met de hand weg: op GitHub — instellingen van de repository → webhooks. De site weigert zulke berichten hoe dan ook.',
  },
  WEBHOOK_KOPPELING_WEG: {
    uk: 'Повідомлення від GitHub не прийнято: зв’язку з цим сховищем на сайті більше немає.',
    nl: 'Het bericht van GitHub is niet aangenomen: de koppeling met deze repository bestaat op de site niet meer.',
    doenUk: 'Підключіть сховище знову або приберіть старий вебгук у налаштуваннях сховища на GitHub.',
    doenNl: 'Koppel de repository opnieuw of haal de oude webhook weg in de instellingen van de repository op GitHub.',
  },
  WEBHOOK_TIJDELIJK_ONBESLIST: {
    uk: 'Повідомлення від GitHub тимчасово не прийнято: сайт не зміг перевірити його підпис.',
    nl: 'Het bericht van GitHub is tijdelijk niet aangenomen: de site kon de handtekening niet controleren.',
    doenUk: 'Нічого робити не треба: GitHub надішле його повторно. Якщо так триває годинами — перевірте ключ вебгука.',
    doenNl: 'U hoeft niets te doen: GitHub stuurt het opnieuw. Duurt dit uren, controleer dan de sleutel van de webhook.',
  },
});

/** Alle codes met een tekst hier (voor de tests en voor shared/foutuitleg.ts). */
export const WEIGERING_CODES: readonly string[] = Object.freeze([...Object.keys(VAST), 'SERVER_BUSY', 'TOO_MANY_BODIES', 'TOO_MANY_BODY_BYTES']);

/** De regel voor een code, of null als die hier niet staat. `seconden` = Retry-After uit het antwoord (anders 5). */
export function weigeringRegel(code: string, seconden?: number): WeigeringRegel | null {
  const c = String(code || '').trim();
  if (Object.prototype.hasOwnProperty.call(VAST, c)) return VAST[c];
  return lichaamRegel(c, wacht(seconden));
}

/** Eén zin voor het scherm: wat er gebeurde + wat nu te doen. null = onbekende code (het scherm houdt zijn eigen tekst). */
export function weigeringZin(lang: Lang, code: string, seconden?: number): string | null {
  const r = weigeringRegel(code, seconden);
  return r ? (lang === 'uk' ? `${r.uk} ${r.doenUk}` : `${r.nl} ${r.doenNl}`) : null;
}

/** Hetzelfde, maar rechtstreeks uit een fout van src/platform/client.ts (ApiError: message/response.data.error + retryAfter). */
export function weigeringZinUitFout(lang: Lang, e: unknown): string | null {
  const f = (e ?? {}) as { message?: unknown; retryAfter?: unknown; response?: { data?: { error?: unknown; retryAfter?: unknown } } };
  const data = f.response?.data && typeof f.response.data === 'object' ? f.response.data : undefined;
  const code = String(data?.error || f.message || '');
  const s = Number(f.retryAfter) > 0 ? Number(f.retryAfter) : Number(data?.retryAfter) || 0;
  return weigeringZin(lang, code, s);
}
