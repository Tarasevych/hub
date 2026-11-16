// Foutteksten (uk/nl) van het goedkeur-/grantsysteem.
//
// Punt 3 van de audit 19.10.2026: geen gegokte oorzaken meer en nooit een melding zonder feiten. De uitleg van codes, statussen en
// «wat nu» staat in ÉÉN bron: shared/foutuitleg.ts (die ook shared/uitrol-codes.ts leest). Hier staat alleen wat eigen is aan het
// goedkeurpaneel. Wie feiten meegeeft (een catch-blok kent de route, de status, het tijdstip en het pogingnummer), krijgt ze
// achter de melding als feitenregel; een vaste hint (geen mislukte poging) krijgt er niets bij.
import { tr, type Lang } from './types';
import { uitrolCodeDoen, uitrolCodeTitel } from '../../shared/uitrol-codes';
import { bestandLeesUitleg, feitRegel, isBestandLeesfout, onbekendeOorzaak, type Feiten } from '../../shared/foutuitleg';

const FOUTEN: Record<string, [string, string]> = {
  REDEN_TE_KORT: ['Вкажіть причину (щонайменше 10 символів).', 'Geef een reden op (minstens 10 tekens).'],
  REDEN_TE_LANG: ['Причина задовга (максимум 500 символів).', 'De reden is te lang (maximaal 500 tekens).'],
  STEP_UP_STRONG_REQUIRED: ['Потрібне підтвердження passkey, кодом із застосунку або кодом відновлення (повторного входу Google недостатньо).', 'Bevestiging met passkey, app-code of herstelcode is nodig (opnieuw inloggen bij Google is niet genoeg).'],
  PASSKEY_GOEDKEURING_UIT: ['Схвалення через passkey вимкнено на сервері (перемикач «passkey-goedkeuring»).', 'Goedkeuren met een passkey staat op de server uit (schakelaar «passkey-goedkeuring»).'],
  GEEN_PASSKEY: ['На сервері ще немає passkey, що може схвалювати. Додайте його у вкладці «Налаштування».', 'Er is op de server nog geen passkey die mag goedkeuren. Voeg er een toe in het tabblad «Налаштування».'],
  EERSTE_VIA_SSH: ['Перший passkey підтверджується лише через SSH-команду.', 'De eerste passkey wordt alleen met de SSH-opdracht bevestigd.'],
  UITDAGING_ONGELDIG: ['Запит застарів або вже використаний. Спробуйте ще раз.', 'Het verzoek is verlopen of al gebruikt. Probeer het opnieuw.'],
  STATUS_ONGELDIG: ['Стан оновлення змінився. Оновіть сторінку.', 'De status van de update is gewijzigd. Vernieuw de pagina.'],
  RISICO_NIET_BEVESTIGD: ['Пакет має червоні прапорці: перегляньте їх і поставте позначку «Я переглянув ці зміни» перед схваленням.', 'Het pakket heeft rode vlaggen: bekijk ze en zet het vinkje «Ik heb deze wijzigingen bekeken» vóór het goedkeuren.'],
  PAKKET_GEWIJZIGD: ['Пакет змінився після завантаження — схвалення скасовано.', 'Het pakket is na het uploaden gewijzigd — goedkeuring geannuleerd.'],
  NotAllowedError: ['Підтвердження passkey скасовано або час вийшов.', 'Passkey-bevestiging geannuleerd of de tijd is verstreken.'],
  InvalidStateError: ['Цей passkey уже зареєстровано.', 'Deze passkey is al geregistreerd.'],
  SecurityError: ['Браузер не дозволив passkey на цій адресі.', 'De browser staat de passkey op dit adres niet toe.'],
  RATE_LIMITED: ['Забагато спроб. Зачекайте кілька хвилин.', 'Te veel pogingen. Wacht een paar minuten.'],
  TE_VEEL_OPEN: ['Забагато незавершених пакетів (макс. 3). Відхиліть або схваліть наявні й спробуйте ще раз.', 'Te veel onvoltooide pakketten (max. 3). Keur de bestaande goed of af en probeer opnieuw.'],
  VERSIE_BESTAAT_AL: ['Ця версія вже чекає на схвалення, схвалена або встановлена. Змініть номер версії (UITROL-VERSIE) у пакеті.', 'Deze versie wacht al op goedkeuring, is goedgekeurd of is al geïnstalleerd. Pas het versienummer (UITROL-VERSIE) in het pakket aan.'],
  GEEN_VOORBEREIDER_GRANT: ['Немає чинного дозволу готувати оновлення. Додайте його у вкладці «Налаштування» (блок «Хто готує оновлення»).', 'Geen geldige toestemming om updates voor te bereiden. Voeg die toe in het tabblad «Налаштування» (stap 4).'],
  VOORCONTROLE_MISLUKT: ['Перевірка пакета на сайті виявила помилки — пакет не можна схвалити. Подробиці нижче.', 'De voorcontrole van de site vond fouten — het pakket kan niet worden goedgekeurd. Details hieronder.'],
  PASSKEY_SLEUTEL_ONBEKEND: ['Цей passkey не підтверджено на сервері.', 'Deze passkey is niet bevestigd op de server.'],
  // 502/503/504 en 520–530: wat de proxy feitelijk zei. Of de server herstart (of een update installeert) weet de pagina hier
  // NIET — dat staat er dan ook zo, met het echte getal. Zie shared/foutuitleg.ts voor dezelfde regels in de plakkaat.
  HTTP_502: ['Процес сайту не відповів проксі (код 502), тому запит не виконано. Чи він перезапускається — сайт не підтверджував; стан розгортання не перевірено. Відкрийте журнал або натисніть «Повторити».', 'Het proces van de site antwoordde de proxy niet (code 502), dus het verzoek is niet uitgevoerd. Of hij herstart, is niet bevestigd; de uitrolstand is niet nagekeken. Open het logboek of probeer opnieuw.'],
  HTTP_503: ['Процес сайту не приймає запитів (код 503), тому запит не виконано. Причину сайт не знає: стан розгортання не перевірено. Відкрийте журнал або натисніть «Повторити».', 'Het proces van de site neemt geen verzoeken aan (code 503), dus het verzoek is niet uitgevoerd. De oorzaak kent de site niet: de uitrolstand is niet nagekeken. Open het logboek of probeer opnieuw.'],
  HTTP_504: ['Процес сайту не вклався у час очікування проксі (код 504), тому результат невідомий. Перевірте журнал, перш ніж повторювати.', 'Het proces van de site bleef niet binnen de wachttijd van de proxy (code 504), dus de uitkomst is onbekend. Kijk in het logboek voordat u opnieuw probeert.'],
  UITROL_FOUT: ['Внутрішня помилка сервера. Спробуйте ще раз; якщо повторюється — вкладка «Діагностика».', 'Interne serverfout. Probeer opnieuw; blijft het gebeuren, kijk dan op het tabblad «Діагностика».'],
  ONDERWERP_ONBEKEND: ['Такого агента чи підключення не знайдено.', 'Die agent of koppeling bestaat niet.'],
  RUIMTE_PRIVE: ['Приватне підключення не може готувати оновлення сервера — потрібне підключення в технічному просторі.', 'Een privékoppeling kan geen serverupdates voorbereiden — gebruik een koppeling in de technische ruimte.'],
  PASSKEY_GEEN_VERIFICATIE: ['Потрібне розблокування (відбиток, обличчя або PIN).', 'Ontgrendeling is vereist (vingerafdruk, gezicht of pincode).'],
  STROOM_VERSIE_ONGELDIG: ['Неправильний формат версії (очікується РРРРММДД-ГГХХСС).', 'Ongeldig versienummer (verwacht JJJJMMDD-UUMMSS).'],
  STROOM_NOTITIE_LEEG: ['Вкажіть заголовок і текст нотатки.', 'Vul titel en tekst van de notitie in.'],
  STROOM_NOTITIE_NIET_GEVONDEN: ['Нотатку не знайдено або вона системна.', 'Notitie niet gevonden of door het systeem gemaakt.'],
  STROOM_CONTROLE_LEEG: ['Вкажіть назву пункту контрольного списку.', 'Geef een titel voor het controlelijstpunt.'],
  STROOM_CONTROLE_NIET_GEVONDEN: ['Пункт контрольного списку не знайдено.', 'Controlelijstpunt niet gevonden.'],
  STROOM_REDEN_VEREIST: ['Щоб пропустити обов’язковий пункт, зазначте причину (щонайменше 10 символів).', 'Geef een reden op (minstens 10 tekens) om een verplicht punt over te slaan.'],
  STROOM_VERPLICHT_HANDMATIG: ['Провал автоматичної перевірки не можна позначити виконаним вручну — виправте причину або зафіксуйте обґрунтований пропуск.', 'Een mislukte automatische controle kunt u niet handmatig afvinken — los de fout op of sla onderbouwd over.'],
  STROOM_NIET_VERWIJDERBAAR: ['Системні пункти не можна видалити.', 'Systeemonderdelen kunnen niet worden verwijderd.'],
  TELEGRAM_ARCHIEF_VEREIST: ['Обов’язкове архівування в Telegram увімкнено: спершу заархівуйте поточний випуск у Telegram у розділі нижче або в налаштуваннях, перш ніж схвалювати новий.', 'Verplichte Telegram-archivering staat aan: archiveer eerst de huidige release naar Telegram voordat u een nieuwe goedkeurt.'],
  TELEGRAM_SLEUTEL_ONTBREEKT: ['Не вказано 256-бітний ключ шифрування архівів для Telegram. Збережіть або згенеруйте його в розділі «Налаштування → Архів у Telegram».', 'Geen 256-bits versleutelingssleutel voor Telegram ingesteld. Sla er een op of genereer er een in «Instellingen → Archief in Telegram».'],
  TELEGRAM_SLEUTEL_ONGELDIG: ['Ключ шифрування має бути завдовжки щонайменше 32 символи або містити 64 шістнадцяткові символи.', 'De versleutelingssleutel moet minstens 32 tekens of 64 hexadecimale tekens lang zijn.'],
  TELEGRAM_CHAT_ONTBREEKT: ['Вкажіть коректний chat_id каналу/групи Telegram і підключіть ключ доступу бота в налаштуваннях.', 'Vul een geldig Telegram chat_id en een bot-token in bij de instellingen.'],
  TELEGRAM_BOT_ONGELDIG: ['Ключ доступу Telegram-бота має неправильний формат або відхилений через API Telegram.', 'De Telegram bot-token heeft een ongeldig formaat of is door Telegram geweigerd.'],
  TELEGRAM_BOT_NIET_IN_GROEP: ['Бота ще не додано до вказаного каналу чи групи Telegram (або його видалено). Додайте бота до чату й повторіть перевірку.', 'De bot is nog niet toegevoegd aan het opgegeven Telegram-kanaal of de groep (of is verwijderd). Voeg de bot toe en test opnieuw.'],
  TELEGRAM_GEEN_SCHRIJFRECHT: ['Бот є в чаті, але не має прав надсилати повідомлення та документи (або прав публікації адміністратора в каналі).', 'De bot zit in de chat, maar heeft geen recht om berichten en documenten te plaatsen (of geen beheerdersrecht in het kanaal).'],
  TELEGRAM_GEEN_FORUM: ['Вказано номер теми (message_thread_id), але цей чат є звичайною групою або супергрупою без увімкнених тем (форуму). Увімкніть теми або залиште поле порожнім.', 'Er is een topicnummer (message_thread_id) opgegeven, maar deze chat is een gewone groep of een supergroep zonder topics (forum). Schakel topics in of laat het veld leeg.'],
  TELEGRAM_WEBHOOK_ONGELDIG: ['Недійсний маркер безпеки вхідного приймача Telegram (X-Telegram-Bot-Api-Secret-Token). Налаштуйте або оновіть вхідний приймач бота.', 'Ongeldig beveiligingstoken van de Telegram-webhook (X-Telegram-Bot-Api-Secret-Token). Stel de bot-webhook opnieuw in.'],
  TELEGRAM_ARCHIEF_NIET_GEVONDEN: ['Запис архіву Telegram не знайдено.', 'Het Telegram-archiefitem is niet gevonden.'],
  TELEGRAM_HERSTEL_INTEGRITEIT: ['Перевірка SHA-256 або розшифрування архіву з Telegram не збіглася — файл пошкоджено або ключ інший.', 'SHA-256-controle of ontsleuteling van het Telegram-archief is mislukt — het bestand is beschadigd of de sleutel klopt niet.'],
  GITHUB_ASSET_ONTBREEKT: ['У вибраному випуску на GitHub немає файлу архіву .tar.gz.', 'De gekozen GitHub-release bevat geen .tar.gz-archief.'],
  GITHUB_SHA256_VERSCHILT: ['Завантажений із GitHub файл має інший SHA-256, ніж очікувалося, або не є чинним архівом .tar.gz.', 'Het uit GitHub opgehaalde bestand heeft een andere SHA-256 dan verwacht of is geen geldig .tar.gz-archief.'],
  GITHUB_TE_GROOT: ['Архів на GitHub перевищує допустимий розмір (300 МБ).', 'Het archief op GitHub overschrijdt de maximale grootte (300 MB).'],
  GITHUB_WEBHOOK_GEHEIM_ONTBREEKT: ['Не вказано секрет для перевірки підпису вхідних подій GitHub. Введіть або згенеруйте його.', 'Geen geheim ingesteld voor de handtekeningcontrole van de GitHub-webhook.'],
  TAG_PREFIX_ONGELDIG: ['Префікс міток випусків містить неприпустимі символи (дозволено літери, цифри, «.», «_», «-»).', 'De tag-prefix bevat ongeldige tekens (alleen letters, cijfers, «.», «_», «-»).'],
  TAG_ONGELDIG: ['Неправильний формат мітки випуску GitHub.', 'Ongeldig formaat van de GitHub-release-tag.'],
  TELEGRAM_TE_VEEL_DELEN: ['Архів виходить за межі дозволеної кількості частин для Telegram.', 'Het archief overschrijdt het maximale aantal delen voor Telegram.'],
  GITHUB_DOWNLOAD_HOST_GEWEIGERD: ['Сервер відхилив перенаправлення завантаження на недовірений домен.', 'De server weigerde een downloadomleiding naar een niet-vertrouwd domein.'],
  GITHUB_REDIRECT_ONGELDIG: ['GitHub повернув некоректну адресу перенаправлення для завантаження файлу.', 'GitHub gaf een ongeldig omleidingsadres terug voor het downloaden van het bestand.'],
  NIET_NIEUWER: ['Отриманий архів має версію не новішу за поточну на сервері.', 'De ontvangen versie is niet nieuwer dan de huidige release op de server.'],
  GITHUB_ONJUISTE_BRON: [
    'Передане сховище GitHub відхилено: воно не збігається з дозволеним джерелом оновлень.',
    'De opgegeven GitHub-opslagplaats is geweigerd: deze komt niet overeen met de toegestane updatebron.',
  ],
};
const OORZAAK: Record<string, [string, string]> = {
  NETWORK_ERROR: ['немає зв’язку із сервером (мережа, VPN чи проксі обірвали запит)', 'geen verbinding met de server (netwerk, VPN of proxy brak het verzoek af)'],
  RATE_LIMITED: ['забагато запитів за хвилину', 'te veel verzoeken per minuut'],
  BODY_TOO_LARGE: ['запит завеликий для проксі/сервера', 'verzoek te groot voor proxy/server'],
  STATUS_ONGELDIG: ['пакет уже не в стані «завантажується»', 'het pakket staat niet meer op «wordt geüpload»'],
  GEEN_VOORBEREIDER_GRANT: ['закінчився дозвіл готувати оновлення', 'de toestemming om voor te bereiden is verlopen'],
  STAP_OP_VENSTER_FOUT: ['не вдалося відкрити вікно підтвердження доступу', 'het venster voor extra bevestiging kon niet openen'],
};
/**
 * Eén zin voor het goedkeurpaneel.
 * @param feiten wat de mislukte poging ECHT was (route, status, tijd, poging). Meegeven = feitenregel erachter; weglaten = alleen
 *   de zin (voor vaste hints die geen mislukte poging zijn).
 */
export const foutTekst = (lang: Lang, code: string, feiten?: Partial<Feiten>) => `${zinZonderFeiten(lang, code)}${feiten ? ` ${feitRegel(lang, { dienst: feiten.dienst || 'admin', route: feiten.route, code, status: feiten.status, tijd: feiten.tijd, poging: feiten.poging, zone: feiten.zone })}` : ''}`;

const zinZonderFeiten = (lang: Lang, code: string) => {
  // Leesfout van de schijf (File API van de browser, bv. NotReadableError): de oorzaak IS bekend en de server had er geen deel
  // in. Daarom nooit «причина невідома» of «сервер повернув», maar de oorzaak + de handeling uit de enige bron.
  if (isBestandLeesfout(code)) {
    const u = bestandLeesUitleg(lang, code);
    return `${u.waarom} ${u.doen}`;
  }
  if (code.startsWith('UPLOAD_ONDERBROKEN|')) {
    const [, oorzaak, procent] = code.split('|');
    const o = OORZAAK[oorzaak];
    return tr(lang, `Завантаження перервано на ${procent}%: ${o ? o[0] : `код ${oorzaak}`}. Нічого не втрачено — виберіть той самий файл ще раз, і воно продовжиться з місця зупинки.`,
      `Upload onderbroken op ${procent}%: ${o ? o[1] : `code ${oorzaak}`}. Er is niets verloren — kies hetzelfde bestand opnieuw en de upload gaat verder waar hij stopte.`);
  }
  const t = FOUTEN[code]; if (t) return tr(lang, t[0], t[1]);
  // Audit 19.10.2026 (A1 + punt 3): elke tijdelijke 5xx (ook Cloudflare 520–530 «origin unreachable») krijgt gewone taal met het
  // echte getal — maar nooit meer de GOK dat er een update loopt. Dat de server herstart is een vermoeden; dat staat er zo bij.
  if (isHerstart(code) && code !== 'NETWORK_ERROR') {
    const n = code.replace('HTTP_', '');
    return tr(lang,
      `Проксі відповів кодом ${n}: процес сайту не дав відповіді, тому запит не виконано. Чи сервер перезапускається — сайт не підтверджував (стан розгортання не перевірено). Відкрийте журнал або натисніть «Повторити».`,
      `De proxy antwoordde met code ${n}: het proces van de site gaf geen antwoord, dus het verzoek is niet uitgevoerd. Of de server herstart, is niet bevestigd (de uitrolstand is niet nagekeken). Open het logboek of probeer opnieuw.`);
  }
  if (code === 'NETWORK_ERROR') return tr(lang, 'Запит не дійшов до сервера: браузер обірвав зʼєднання, коду відповіді немає. Перевірте мережу — сторінка спробує ще раз сама.', 'Het verzoek bereikte de server niet: de browser brak de verbinding af, er is geen antwoordcode. Controleer het netwerk — de pagina probeert het vanzelf opnieuw.');
  // Onbekende code: één bron, één formulering (shared/foutuitleg.ts). Nooit «Помилка: <код>» als enige uitleg.
  return code ? onbekendeOorzaak(lang, code) : tr(lang, 'Відповіді від сервера не було зовсім (код відсутній). Перевірте мережу й повторіть.', 'Er kwam helemaal geen antwoord van de server (geen code). Controleer het netwerk en probeer opnieuw.'); };

/** Tijdelijke serverfouten (herstart, proxy/Cloudflare 502–504 en 520–530, netwerk): de melding verdwijnt vanzelf zodra een volgend verzoek slaagt. */
export const isHerstart = (code: string) => /^HTTP_(50[234]|52\d|530)$/.test(code) || code === 'NETWORK_ERROR';

const GEBEURTENIS: Record<string, [string, string]> = {
  GOEDGEKEURD: ['Схвалено', 'Goedgekeurd'], OK: ['Готово', 'Klaar'], INSTALLATIE_MISLUKT: ['Установлення не вдалося', 'Installatie mislukt'],
  GEWEIGERD: ['Сервер відмовив', 'Door de server geweigerd'], SSH_OK: ['Встановлено через SSH', 'Via SSH geïnstalleerd'], SSH_TERUG: ['Відкат через SSH', 'Terugdraaien via SSH'],
  NAZORG_TERUGGEDRAAID: ['Автовідкат після збою', 'Automatisch teruggedraaid na storing'], NAZORG_MISLUKT: ['Автовідкат не вдався', 'Automatisch terugdraaien mislukt'],
  NIET_NIEUWER: ['Версія не новіша', 'Versie niet nieuwer'], RUN_STIL: ['Сервер не повідомив результат', 'De server meldde geen uitkomst'],
};
/** Leesbare naam van een code van een gebeurtenis/uitkomst (onbekende codes blijven zoals ze zijn). */
export const codeTekst = (lang: Lang, code: string) => { const t = GEBEURTENIS[code]; return t ? tr(lang, t[0], t[1]) : uitrolCodeTitel(lang, code); };
/** Wat de gebruiker bij deze uitkomst/weigering kan doen (shared/uitrol-codes.ts); leeg als er niets te doen is. */
export const codeHulp = (lang: Lang, code: string) => uitrolCodeDoen(lang, code);
