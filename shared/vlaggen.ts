// Feature flags (architectuur 13.10.2026, etap F). Eigen tabel op de eigen server, antwoord in de vorm van OpenFeature (OFREP).
//
// Waarom zo (en niet anders):
//  - Een vlag zet een FUNCTIE aan of uit (wat iemand ziet of kan proberen), NOOIT een recht. Rechten blijven op de server: sessie,
//    rollen, technisch profiel, OPA. tests/eenheid/vlaggen.test.ts controleert dat geen autorisatiemodule deze code importeert.
//    Alternatief «vlag = recht» afgewezen: dan wordt een UI-schakelaar een toegangsbron die niemand als zodanig controleert.
//  - Eigen tabel in plaats van een externe dienst (LaunchDarkly, Unleash Cloud): BYOS — niets verlaat de server.
//  - Antwoord in OFREP-vorm (key, value, reason, variant, metadata): een OpenFeature-provider voor OFREP werkt met
//    baseUrl = https://<host>/api, zonder eigen SDK.
//  - Procent-uitrol per gebruiker met een vaste emmer (FNV-1a van sleutel + gebruiker): dezelfde persoon ziet bij 30 % altijd
//    hetzelfde, en verhogen naar 40 % neemt niemand iets af die het al had.
//  - Testers (recht flags.test) zetten een vlag alleen VOOR ZICHZELF en alleen tot het einde van hun technisch profiel.
import type { HelpLagen } from './tech-rollen';

export const SLEUTEL_RE = /^[a-z][a-z0-9-]{2,40}$/;
export const MAX_GEBRUIKERS = 200;

export type Vlag = {
  sleutel: string; omschrijving: string;
  /** Hoofdschakelaar: uit = voor iedereen uit (behalve een tester die het voor zichzelf test). */
  aan: boolean;
  /** Waarde voor wie niet in de lijst of de procent-uitrol valt. */
  standaard: boolean;
  /** 0 = geen uitrol; 1..100 = dit deel van de gebruikers krijgt «aan». */
  percentage: number;
  /** Gebruikers (id) die de vlag altijd aan hebben. */
  gebruikers: string[];
};

export type Reden = 'STATIC' | 'TARGETING_MATCH' | 'SPLIT' | 'DISABLED' | 'ERROR';
export type Uitkomst = {
  key: string; value: boolean; variant: 'aan' | 'uit'; reason: Reden;
  errorCode?: 'FLAG_NOT_FOUND';
  metadata?: { test?: boolean };
};

/** Vaste emmer 0..99 per (sleutel, gebruiker): FNV-1a 32-bit. Zelfde invoer = zelfde emmer, in de browser en op de server. */
export function emmer(sleutel: string, userId: string): number {
  let h = 0x811c9dc5;
  const s = `${sleutel}:${userId}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % 100;
}

const uit = (key: string, value: boolean, reason: Reden, extra: Partial<Uitkomst> = {}): Uitkomst =>
  ({ key, value, variant: value ? 'aan' : 'uit', reason, ...extra });

/**
 * Waarde van één vlag voor één gebruiker. Volgorde:
 *  1. vlag bestaat niet          → false, ERROR / FLAG_NOT_FOUND (code die naar een oude vlag vraagt blijft werken: «uit»);
 *  2. eigen test van de tester   → die waarde, TARGETING_MATCH, metadata.test (ook als de hoofdschakelaar uit staat);
 *  3. hoofdschakelaar uit        → false, DISABLED;
 *  4. gebruiker in de lijst      → true, TARGETING_MATCH;
 *  5. procent-uitrol > 0         → emmer < percentage, SPLIT;
 *  6. anders                     → standaard, STATIC.
 */
export function evalueer(key: string, vlag: Vlag | undefined, userId: string, test?: boolean | null): Uitkomst {
  if (!vlag) return uit(key, false, 'ERROR', { errorCode: 'FLAG_NOT_FOUND' });
  if (typeof test === 'boolean') return uit(key, test, 'TARGETING_MATCH', { metadata: { test: true } });
  if (!vlag.aan) return uit(key, false, 'DISABLED');
  if (vlag.gebruikers.includes(userId)) return uit(key, true, 'TARGETING_MATCH');
  if (vlag.percentage > 0) return uit(key, emmer(vlag.sleutel, userId) < vlag.percentage, 'SPLIT');
  return uit(key, vlag.standaard, 'STATIC');
}

/** Controle van invoer bij opslaan (server). Geeft een foutcode of null. */
export function vlagFout(v: Partial<Vlag>): string | null {
  if (typeof v.sleutel !== 'string' || !SLEUTEL_RE.test(v.sleutel)) return 'SLEUTEL_ONGELDIG';
  if (typeof v.omschrijving !== 'string' || v.omschrijving.length > 300) return 'OMSCHRIJVING_ONGELDIG';
  if (typeof v.aan !== 'boolean' || typeof v.standaard !== 'boolean') return 'WAARDE_ONGELDIG';
  if (!Number.isInteger(v.percentage) || (v.percentage as number) < 0 || (v.percentage as number) > 100) return 'PERCENTAGE_ONGELDIG';
  if (!Array.isArray(v.gebruikers) || v.gebruikers.length > MAX_GEBRUIKERS) return 'GEBRUIKERS_ONGELDIG';
  return null;
}

/**
 * Uitleg in gewone woorden per bekende schakelaar (20261028, vraag van Pavlo: «що і для чого незрозуміло»).
 * [wat het doet, wanneer aanzetten, wat er gebeurt] — Oekraïens en Nederlands apart, zonder vreemde woorden.
 * De omschrijving in de database blijft ongemoeid (geen migratie); onbekende sleutels tonen die omschrijving.
 */
export type VlagUitleg = { naam: [string, string]; wat: [string, string]; wanneer: [string, string]; gevolg: [string, string] };
export const VLAG_UITLEG: Record<string, VlagUitleg> = {
  'identiteit-account-atelier': {
    naam: ['Нове оформлення «Керування обліковим записом»', 'Nieuwe vorm van «Accountbeheer»'],
    wat: ['Оновлене оформлення сторінки облікового запису: дванадцять зрозумілих розділів, змістовні кольорові піктограми, ілюстрації та розгортні налаштування. Справжні дії залишаються незмінними.', 'Vernieuwde accountpagina met twaalf duidelijke onderdelen, betekenisvolle gekleurde pictogrammen, illustraties en uitklapbare instellingen. De echte handelingen blijven hetzelfde.'],
    wanneer: ['Увімкніть спершу тільки для себе. Потім можна відкрити для вибраних людей, частини користувачів або всіх.', 'Zet eerst alleen voor uzelf aan. Daarna eventueel voor gekozen mensen, een deel van de gebruikers of iedereen.'],
    gevolg: ['Вимкнення негайно повертає попереднє оформлення без втрати налаштувань. Перемикач не змінює прав доступу й способів входу.', 'Uitschakelen brengt de vorige vorm onmiddellijk terug zonder instellingen te verliezen. De schakelaar verandert geen rechten of aanmeldmethoden.'],
  },
  'identiteit-account-maquette': {
    naam: ['Вигляд «Макет» у «Керуванні обліковим записом»', 'Weergave «Ontwerp» in «Accountbeheer»'],
    wat: ['Дизайн власника як типовий вигляд сторінки облікового запису: герой, картки чотирьох груп, якірне меню з будь-якого краю, швидкий пошук Ctrl+K. Справжні дії й права ті самі; у вигляді лишається вибір «Студія» або класичний.', 'Het ontwerp van de eigenaar als standaardweergave van de accountpagina: hero, kaarten in vier groepen, een ankermenu aan elke rand, snel zoeken met Ctrl+K. Echte handelingen en rechten blijven gelijk; de keuze «Studio» of klassiek blijft.'],
    wanneer: ['Потребує ввімкненого прапорця «Нове оформлення». Спершу тільки для себе, потім для частини людей або всіх. Надалі цей вигляд планується як тема сайту.', 'Vereist de vlag «Nieuwe vorm». Eerst alleen voor uzelf, daarna voor een deel of iedereen. Later is deze weergave bedoeld als thema van de site.'],
    gevolg: ['Вимкнення прибирає вигляд «Макет» з вибору; хто його обрав, бачить «Студію». Налаштування й дані не змінюються.', 'Uitschakelen haalt «Ontwerp» uit de keuze; wie het koos, ziet de Studio. Instellingen en gegevens veranderen niet.'],
  },
  'apparaat-bevestiging-v1': {
    naam: ['Підтвердження з іншого пристрою', 'Bevestigen vanaf een ander apparaat'],
    wat: ['У вікні «Підтвердіть доступ» з’являються вкладки «Інший пристрій» і «У Telegram». На іншому увійденому пристрої вискакує вікно «Це ви?» з тими самими трьома символами; на запитувачі один виділено. Одна спроба, відлік, «Це не я» завжди перемагає. Налаштування — у «Способах входу» й в адмініструванні → «Єдиний вхід».', 'In het venster «Toegang bevestigen» komen de tabbladen «Ander apparaat» en «In Telegram». Op een ander aangemeld apparaat verschijnt «Bent u het?» met dezelfde drie symbolen; op het vragende apparaat is er één uitgelicht. Eén poging, aftelling, «Dit ben ik niet» wint altijd. Instellingen bij «Aanmeldmethoden» en in beheer → «Eenmalige aanmelding».'],
    wanneer: ['Типово увімкнено: не потребує ключа бота чи зовнішніх служб. Вимкніть, якщо хочете, щоб підтвердження відбувалося лише ключем доступу чи кодом на самому пристрої.', 'Standaard aan: geen botsleutel of externe dienst nodig. Zet uit als bevestigen alleen met toegangssleutel of code op het apparaat zelf mag.'],
    gevolg: ['Вимкнення одразу ховає вкладки й зупиняє швидкий потік; відкриті запити згасають самі. Налаштування й лічильники зберігаються. Інші способи підтвердження не змінюються.', 'Uitschakelen verbergt meteen de tabbladen en stopt de snelle stroom; open verzoeken verlopen vanzelf. Instellingen en tellers blijven bewaard. Andere bevestigingsmanieren veranderen niet.'],
  },
  'mobiel-breedte-veilig-v1': {
    naam: ['Безпечна вузька верстка на телефоні', 'Veilige smalle opmaak op de telefoon'],
    wat: ['На вузькому екрані (до 700 пікселів) сайт більше не застосовує важке загальне правило ширини, через яке сторінка «Конектори» займала гігабайти пам’яті й зависала. Замість нього вузьке правило лише для верхніх блоків сторінки, коду, рисунків і груп полів; таблиці, зображення, кнопки й поля мають свої правила, як і раніше. Також ощадливіше стеження за нижніми смугами й за розділом у полі зору: адреса (наприклад #connectors) лишається тією, яку ви відкрили.', 'Op een smal scherm (tot 700 pixels) past de site de zware algemene breedteregel niet meer toe, waardoor de pagina «Connectoren» gigabytes geheugen at en vastliep. In de plaats komt een smalle regel alleen voor de bovenste blokken van de pagina, code, figuren en veldgroepen; tabellen, afbeeldingen, knoppen en velden houden hun eigen regels. Ook zuiniger volgen van de onderbalken en van de sectie in beeld: het adres (bijvoorbeeld #connectors) blijft wat u opende.'],
    wanneer: ['Спершу тільки для себе: увімкніть, відкрийте сайт на телефоні й перевірте сторінки за списком з інструкції. Потім — для всіх.', 'Eerst alleen voor uzelf: zet aan, open de site op de telefoon en controleer de pagina’s volgens de lijst uit de instructie. Daarna voor iedereen.'],
    gevolg: ['Вимкнення після перезавантаження сторінки повертає попередню верстку без змін. Дані, права й налаштування не змінюються.', 'Uitschakelen brengt na het herladen van de pagina de vorige opmaak ongewijzigd terug. Gegevens, rechten en instellingen veranderen niet.'],
  },
  // POSTA-LEZER (21.11.2026, migratie 0307): drie vlaggen, alle standaard UIT.
  'lezer-fout-blijft-open-v1': {
    naam: ['Лист, що не відкрився, лишає вікно відкритим', 'Leesvenster blijft open bij een laadfout'],
    wat: ['Якщо лист не завантажився, вікно читання більше не зникає саме. У ньому видно причину (наприклад, Google відповідав надто довго або не дав доступу) і кнопку «Спробувати ще раз». Сервер повідомляє зрозумілу причину замість загальної помилки.', 'Kan een bericht niet geladen worden, dan verdwijnt het leesvenster niet meer vanzelf. Het toont de reden (bijvoorbeeld: Google antwoordde te traag of gaf geen toegang) en de knop «Opnieuw proberen». De server meldt een duidelijke reden in plaats van een algemene fout.'],
    wanneer: ['Спершу тільки для себе: увімкніть, відкрийте кілька листів і перевірте за списком з інструкції. Потім — для всіх.', 'Eerst alleen voor uzelf: zet aan, open een paar berichten en controleer met de lijst uit de instructie. Daarna voor iedereen.'],
    gevolg: ['Вимкнення після перезавантаження сторінки повертає попередню поведінку: вікно закривається й угорі видно коротку примітку. Дані не змінюються.', 'Uitschakelen brengt na het herladen het vorige gedrag terug: het venster sluit en bovenaan staat een korte melding. Gegevens veranderen niet.'],
  },
  'mail-tekst-utf8-terugval-v1': {
    naam: ['Правильні літери в листах із хибним кодуванням', 'Juiste letters in berichten met een verkeerde tekenset'],
    wat: ['Деякі відправники пишуть лист у UTF-8, але позначають його як західноєвропейське кодування. Тоді замість «möchten» видно «mÃ¶chten». З прапорцем сервер розпізнає такий лист і показує правильні літери. Звичайні листи не змінюються.', 'Sommige afzenders schrijven in UTF-8 maar melden een West-Europese tekenset. Dan staat er «mÃ¶chten» in plaats van «möchten». Met de vlag herkent de server zo’n bericht en toont de juiste letters. Gewone berichten veranderen niet.'],
    wanneer: ['Цей прапорець діє для всього сервера одразу (не для окремої людини): увімкніть його загалом. Сервер перевіряє стан раз на хвилину. Уже збережені в оглядачі листи можуть лишитися старими, доки їх не завантажено знову.', 'Deze vlag geldt voor de hele server tegelijk (niet per persoon): zet hem algemeen aan. De server kijkt elke minuut. Berichten die al in de browser bewaard zijn, kunnen oud blijven tot ze opnieuw geladen worden.'],
    gevolg: ['Вимкнення протягом хвилини повертає попереднє читання листів. Дані не змінюються.', 'Uitschakelen brengt binnen een minuut het vorige lezen van berichten terug. Gegevens veranderen niet.'],
  },
  'maquette-zwevend-rail-verbergen-v1': {
    naam: ['«Макет»: смуга розділів не закриває «вікно у вікні»', '«Макет»: ankerrail bedekt het zwevende venster niet'],
    wat: ['В оформленні «Макет» праворуч є смуга «На цій сторінці». Коли лист відкрито зменшеним вікном поверх пошти, ця смуга лежала над кнопками вікна. З прапорцем смуга в цьому режимі ховається.', 'In de vormgeving «Макет» staat rechts de rail «Op deze pagina». Bij een verkleind venster boven de post lag die rail over de knoppen van het venster. Met de vlag verdwijnt de rail in die stand.'],
    wanneer: ['Спершу тільки для себе: увімкніть, оберіть «Макет», відкрийте лист зменшеним вікном і перевірте кнопки. Потім — для всіх.', 'Eerst alleen voor uzelf: zet aan, kies «Макет», open een bericht in een verkleind venster en controleer de knoppen. Daarna voor iedereen.'],
    gevolg: ['Вимкнення після перезавантаження сторінки повертає смугу в усіх режимах. Дані не змінюються.', 'Uitschakelen brengt na het herladen de rail in alle standen terug. Gegevens veranderen niet.'],
  },
  'posta-vensters-herstel-v1': {
    naam: ['Перегляд вкладень і вікно листа без накладок', 'Bijlageviewer en leesvenster zonder overlappingen'],
    wat: ['Перегляд вкладення на телефоні займає весь екран, і кнопку «Закрити» завжди видно. Назва вкладення більше не скорочується до однієї літери. Текстовий файл показується на всю висоту. Кнопка «Назад» спершу закриває лише перегляд, а лист лишається відкритим. Після закриття курсор повертається до картки вкладення. Архів чи невідомий файл більше не позначається хибно як «JWK». У зменшеному вікні листа смуга «Оригінал / Переклад / Порівняти» стоїть окремим рядком і не закриває кнопок.', 'De bijlageviewer vult op de telefoon het hele scherm en «Sluiten» blijft zichtbaar. De naam van de bijlage krimpt niet meer tot één letter. Een tekstbestand krijgt de volle hoogte. «Terug» sluit eerst alleen de viewer; het bericht blijft open. Na het sluiten keert de focus terug naar de kaart van de bijlage. Een archief of onbekend bestand heet niet meer ten onrechte «JWK». In het verkleinde leesvenster staat de strook «Origineel / Vertaling / Vergelijken» op een eigen regel en bedekt geen knoppen.'],
    wanneer: ['Спершу тільки для себе: увімкніть, відкрийте лист із кількома вкладеннями на телефоні й на комп’ютері, натисніть «Назад» і перевірте кнопки. Потім — для всіх.', 'Eerst alleen voor uzelf: zet aan, open een bericht met meerdere bijlagen op de telefoon en de computer, druk op «Terug» en controleer de knoppen. Daarna voor iedereen.'],
    gevolg: ['Вимкнення після перезавантаження сторінки повертає попередній вигляд і поведінку. Дані не змінюються.', 'Uitschakelen brengt na het herladen het vorige uiterlijk en gedrag terug. Gegevens veranderen niet.'],
  },
  'bijlage-weergave-gedeeld-v1': {
    naam: ['Новий спільний перегляд вкладень (етап 1)', 'Nieuwe gedeelde bijlageviewer (fase 1)'],
    wat: ['Вкладення відкривається в новій рамці: зверху видно, що це за файл, його розмір і місце серед вкладень листа; одна кольорова позначка довіри каже, чи справжній тип збігається з назвою і чи немає макросів або прихованих дій; одна головна кнопка під тип файлу, решта — під «⋯»; технічні дані — під «Подробиці»; унизу стрічка всіх вкладень листа. Якщо файл не завантажився, вікно не зникає, а пояснює причину й пропонує «Спробувати ще раз». «Назад» закриває лише перегляд.', 'Een bijlage opent in een nieuwe omlijsting: bovenaan staat wat het bestand is, de grootte en de plaats tussen de bijlagen; één gekleurd vertrouwenslabel zegt of de echte soort bij de naam past en of er geen macro’s of verborgen acties zijn; één hoofdknop per soort, de rest onder «⋯»; technische gegevens onder «Подробиці»; onderaan een strook met alle bijlagen. Laadt het bestand niet, dan blijft het venster open met de reden en «Opnieuw proberen». «Terug» sluit alleen de viewer.'],
    wanneer: ['Спершу тільки для себе: увімкніть, відкрийте лист із кількома вкладеннями (рахунок, фото, архів) на комп’ютері й телефоні, перевірте позначку довіри, кнопки, стрічку й «Назад». Потім — для всіх. Концепція: docs/concept/bijlage-weergave/CONCEPT.md.', 'Eerst alleen voor uzelf: zet aan, open een bericht met meerdere bijlagen (rekening, foto, archief) op de computer en de telefoon, controleer het label, de knoppen, de strook en «Terug». Daarna voor iedereen. Concept: docs/concept/bijlage-weergave/CONCEPT.md.'],
    gevolg: ['Вимкнення після перезавантаження сторінки повертає попередній перегляд. Дані й файли не змінюються.', 'Uitschakelen brengt na het herladen de vorige viewer terug. Gegevens en bestanden veranderen niet.'],
  },
  'telegram-aanmelden-v1': {
    naam: ['Вхід і підтвердження через Telegram', 'Aanmelden en bevestigen via Telegram'],
    wat: ['Офіційна кнопка Telegram на сторінці входу, прив’язка Telegram з обов’язковим власним номером телефону, підтвердження дій у боті @MijnRuimte_Bot, гарні картки сповіщень, таблиця «що чим підтверджувати», таємний код і чесна служба стану. В адмінці з’являється розділ «Способи входу» → Telegram.', 'Officiële Telegram-knop op het aanmeldscherm, Telegram koppelen met verplicht eigen telefoonnummer, handelingen bevestigen in de bot @MijnRuimte_Bot, mooie meldingskaarten, een tabel «wat waarmee bevestigen», een geheime code en een eerlijke statusdienst. In het beheer verschijnt «Aanmeldmethoden» → Telegram.'],
    wanneer: ['Спершу тільки для себе: у адмінці введіть ключ бота й натисніть «Налаштувати бота», прив’яжіть свій Telegram і перевірте. Потім — для частини людей або всіх.', 'Eerst alleen voor uzelf: voer in het beheer de botsleutel in en kies «Bot instellen», koppel uw eigen Telegram en test. Daarna voor een deel van de mensen of iedereen.'],
    gevolg: ['Вимкнення одразу ховає кнопку Telegram і зупиняє бота; прив’язки, коди й налаштування зберігаються до наступного вмикання. Інші способи входу не змінюються.', 'Uitschakelen verbergt de Telegram-knop meteen en zet de bot stil; koppelingen, codes en instellingen blijven bewaard tot de volgende inschakeling. Andere aanmeldmethoden veranderen niet.'],
  },
  'telegram-v2': {
    naam: ['Захищене вікно входу й підтвердження Telegram', 'Beveiligd Telegram-venster voor aanmelden en bevestigen'],
    wat: ['Показує однакові контрольні піктограми на сайті та у захищеному вікні Telegram, приймає таємний код лише у вікні поза перепискою бота й зберігає історію світлин профілю для перевірки безпеки.', 'Toont dezelfde controlepictogrammen op de site en in het beveiligde Telegram-venster, vraagt de geheime code uitsluitend in het venster buiten het gesprek en bewaart de geschiedenis van profielfoto’s voor veiligheidscontrole.'],
    wanneer: ['Увімкніть після налаштування ключа бота та таємного ключа приймача подій, щоб посилити захист входу й підтвердження чутливих дій.', 'Zet aan nadat de botsleutel en het ontvangstgeheim zijn ingesteld om aanmelden en het bevestigen van gevoelige handelingen sterker te beveiligen.'],
    gevolg: ['Вимкнення повертає класичне підтвердження кнопкою в боті без втрати прив’язок, кодів чи збереженої історії світлин.', 'Uitschakelen brengt het klassieke bevestigen met een knop in de bot terug zonder koppelingen, codes of fotogeschiedenis te verliezen.'],
  },
  'telegram-aanmeld-maket-v1': {
    naam: ['Наочний вигляд вікна входу через Telegram', 'Visuele weergave van het Telegram-aanmeldvenster'],
    wat: ['Додає у відкриту панель входу через Telegram живу шкалу залишку часу, наочні кроки перевірки, зразок очікуваного повідомлення від бота з попередженням про підозрілий запит і перемикач між компактним та студійним поданням.', 'Voegt aan het geopende Telegram-aanmeldvenster een tijdsbalk, duidelijke stappen, een voorbeeld van het verwachte botbericht met waarschuwing bij een verdacht verzoek en een keuze tussen compact en uitgebreid uiterlijk toe.'],
    wanneer: ['Увімкніть спершу для себе, перевірте компактний і студійний режими на телефоні та комп’ютері, а потім відкрийте для всіх.', 'Zet eerst voor uzelf aan, controleer de compacte en uitgebreide stand op telefoon en computer, en open daarna voor iedereen.'],
    gevolg: ['Вимкнення залишає компактний вигляд вікна входу без зміни протоколу перевірки чи збережених прив’язок.', 'Uitschakelen houdt het compacte aanmeldvenster aan zonder het controleprotocol of bestaande koppelingen te wijzigen.'],
  },
  // IDENTITEIT-015 (aanmelden): чотири окремі шляхи без Google; міграція 0275 ставить кожен на «Тільки я» (лише власник сайту).
  'aanmelden-passkey': {
    naam: ['! Вхід лише ключем доступу (без Google)', '! Aanmelden met alleen een toegangssleutel (zonder Google)'],
    wat: ['На сторінці входу з’являється «Увійти ключем доступу»: браузер пропонує збережений ключ (відбиток, обличчя, PIN або телефон), і сайт відкриває той самий сеанс, що й після Google. Ключ із перевіркою користувача — одразу два чинники.', 'Op de aanmeldpagina verschijnt «Aanmelden met toegangssleutel»: de browser biedt een bewaarde sleutel aan (vingerafdruk, gezicht, pincode of telefoon) en de site opent dezelfde sessie als na Google. Een sleutel met gebruikerscontrole telt meteen als twee factoren.'],
    wanneer: ['Спершу тільки для себе: додайте ключ доступу в «Безпеці», вийдіть і увійдіть ним. Ризик: хто має розблокований пристрій із вашим ключем, той увійде без Google — тож давайте іншим лише тоді, коли вони розуміють це.', 'Eerst alleen voor uzelf: voeg een sleutel toe bij «Beveiliging», meld af en meld aan met de sleutel. Risico: wie uw ontgrendelde apparaat met de sleutel heeft, meldt aan zonder Google — geef het anderen pas als ze dat begrijpen.'],
    gevolg: ['Вимкнення одразу прибирає кнопку і відмовляє новим входам ключем; відкриті сеанси й самі ключі лишаються. Підтвердження дій ключем працює як раніше.', 'Uitschakelen haalt de knop meteen weg en weigert nieuwe aanmeldingen met een sleutel; open sessies en de sleutels zelf blijven. Handelingen bevestigen met een sleutel werkt zoals voorheen.'],
  },
  'aanmelden-wachtwoord': {
    naam: ['! Вхід паролем', '! Aanmelden met wachtwoord'],
    wat: ['На сторінці входу з’являється форма «Увійти паролем»: адреса, пароль і (якщо налаштовано) код із застосунку або код відновлення — одним запитом. Після кількох помилок спроби тимчасово блокуються.', 'Op de aanmeldpagina verschijnt het formulier «Aanmelden met wachtwoord»: adres, wachtwoord en (als ingesteld) app-code of herstelcode in één verzoek. Na enkele fouten worden pogingen tijdelijk geblokkeerd.'],
    wanneer: ['Коли комусь потрібен вхід без Google. Ризик: пароль можна вгадати або викрасти — радьте додати код із застосунку.', 'Wanneer iemand zonder Google moet kunnen aanmelden. Risico: een wachtwoord kan geraden of gestolen worden — raad een app-code aan.'],
    gevolg: ['Вимкнення прибирає форму й відмовляє новим входам паролем; паролі не видаляються. Захист від блокування тоді не рахує пароль як спосіб входу.', 'Uitschakelen haalt het formulier weg en weigert nieuwe wachtwoord-aanmeldingen; wachtwoorden blijven bewaard. De bescherming tegen buitensluiten telt het wachtwoord dan niet als aanmeldweg.'],
  },
  'aanmelden-extern': {
    naam: ['! Вхід через Microsoft, Discord або Apple', '! Aanmelden met Microsoft, Discord of Apple'],
    wat: ['Людина, яка прив’язала свій Microsoft, Discord чи Apple у «Способах входу», може ним і входити. Кнопка з’являється лише для провайдера, у якого є ключі власника й пройдена самоперевірка.', 'Wie zijn Microsoft, Discord of Apple koppelde bij «Aanmeldmethoden», kan er ook mee aanmelden. De knop verschijnt alleen voor een aanbieder met sleutels van de eigenaar en een geslaagde zelftest.'],
    wanneer: ['Після того, як ключі AANMELD_* введено й самоперевірку пройдено. Ризик: доступ до облікового запису залежить і від безпеки чужого облікового запису.', 'Nadat de AANMELD_*-sleutels zijn ingevoerd en de zelftest geslaagd is. Risico: de toegang hangt dan ook af van de beveiliging van dat andere account.'],
    gevolg: ['Вимкнення прибирає кнопки й відмовляє новим входам; прив’язки лишаються.', 'Uitschakelen haalt de knoppen weg en weigert nieuwe aanmeldingen; koppelingen blijven.'],
  },
  // IDENTITEIT-015 (sleutels-gasten): міграція 0274 ставить «Тільки я» — коди доступу видає лише власник сайту, як і раніше.
  'gastcodes-iedereen': {
    naam: ['! Коди доступу для гостей — і для інших облікових записів', '! Gastcodes — ook voor andere accounts'],
    wat: ['Схвалені облікові записи, яким увімкнено прапорець, бачать у «Безпеці» блок «Коди доступу для інших» і можуть видати гостю код на перегляд СВОЇХ даних (ім’я й фото, пристрої, журнал агентів). Гість ніколи не бачить даних інших людей чи сайту; кожне використання видно власникові коду, кожен код можна відкликати.', 'Goedgekeurde accounts met deze vlag zien bij «Beveiliging» het blok «Toegangscodes voor anderen» en kunnen een gast een code geven om hun EIGEN gegevens te bekijken (naam en foto, apparaten, journaal van agents). Een gast ziet nooit gegevens van anderen of van de site; elk gebruik is zichtbaar voor de eigenaar van de code en elke code is in te trekken.'],
    wanneer: ['Коли людям потрібно показати комусь свої пристрої чи журнал без входу в обліковий запис. Ризик: код відкриває перегляд без входу будь-кому, хто його знає, — давайте лише тим, хто це розуміє.', 'Wanneer mensen iemand hun apparaten of journaal moeten tonen zonder aanmelding. Risico: de code opent het bekijken zonder aanmelding voor iedereen die hem kent — geef het alleen wie dat begrijpt.'],
    gevolg: ['Вимкнення одразу ховає блок у тих, кому його вимкнено; їхні коди перестають відкривати дані, а гостьові сеанси — показувати будь-що. Самі коди й журнал зберігаються; ваші коди власника сайту діють як раніше.', 'Uitschakelen verbergt het blok meteen voor wie het niet meer heeft; hun codes openen geen gegevens meer en gastsessies tonen niets meer. De codes en het journaal blijven bewaard; uw eigen codes als site-eigenaar werken zoals voorheen.'],
  },
  'aanmelden-sms': {
    naam: ['Підтвердження номера кодом із SMS', 'Telefoonnummer bevestigen met sms-code'],
    wat: ['У «Способах входу» людина вводить номер і отримує код у SMS; після правильного коду номер стає «Підтверджено». Входу за номером немає.', 'Bij «Aanmeldmethoden» voert iemand een nummer in en krijgt een sms-code; na de juiste code staat het nummer op «Bevestigd». Aanmelden met het nummer kan niet.'],
    wanneer: ['Коли в «Сховищі секретів» є ключ SMS_AANBIEDER (Twilio). Кожне SMS коштує грошей власнику — ліміт 5 на годину на людину.', 'Als de geheimenkluis de sleutel SMS_AANBIEDER (Twilio) bevat. Elke sms kost de eigenaar geld — limiet 5 per uur per persoon.'],
    gevolg: ['Вимкнення приховує надсилання коду; підтверджені номери лишаються.', 'Uitschakelen verbergt het versturen van codes; bevestigde nummers blijven.'],
  },
  'aanmeldmethoden-vnext': {
    naam: ['Нові «Способи входу» (UI-015)', 'Nieuwe aanmeldmethoden (UI-015)'],
    wat: ['Сучасна сторінка способів входу: банер, зрозумілі картки методів з однією дією, деталі в бокових панелях. Усі чинні механізми (Google, passkeys, TOTP, коди відновлення, шифрування, коди доступу, step-up) — ті самі, лише в новому поданні; плюс чесний каталог майбутніх провайдерів.', 'Moderne aanmeldmethoden-pagina: hero, duidelijke methodekaarten met één hoofdactie, details in zijpanelen. Alle bestaande mechanismen (Google, passkeys, TOTP, herstelcodes, versleuteling, toegangscodes, step-up) blijven dezelfde; plus een eerlijke catalogus van toekomstige aanbieders.'],
    wanneer: ['Вмикайте, щоб отримати нове подання; стара форма завжди доступна вимкненням прапорця.', 'Zet aan voor de nieuwe weergave; het oude formulier blijft via de vlag altijd beschikbaar.'],
    gevolg: ['Вимкнено — стара сторінка без змін. «Безпека» і «Відновлення» в обох станах лишаються на чинній формі.', 'Uit = de huidige pagina, ongewijzigd. «Beveiliging» en «Herstel» blijven in beide standen op het bestaande formulier.'],
  },
  'aanmeldmethoden-kaart-v2': {
    naam: ['Картковий режим розділу «Способи входу»', 'Kaartweergave van «Aanmeldmethoden»'],
    wat: ['Додає перемикач карткового подання способів входу поруч із поточним оглядом: згортані групи з лічильниками, компактні плитки постачальників, двомовний пошук і бічну панель подробиць.', 'Voegt naast het huidige overzicht een kaartweergave van aanmeldmethoden toe: inklapbare groepen met tellers, aanbiedertegels, tweetalig zoeken en een zijpaneel met gegevens.'],
    wanneer: ['Увімкніть спершу лише для себе, перевірте перемикання між оглядом та картковою сіткою, а далі відкрийте для всіх.', 'Zet eerst alleen voor uzelf aan, controleer het wisselen tussen overzicht en kaartweergave, en zet daarna voor iedereen aan.'],
    gevolg: ['Типовим залишається поточний огляд; вимкнення прибирає картковий перемикач без зміни жодного налаштованого способу входу.', 'Het huidige overzicht blijft standaard; uitschakelen verbergt de kaartkeuze zonder ingestelde aanmeldmethoden te veranderen.'],
  },
  'afstemming-vnext': {
    naam: ['Нова «Звірка» (UI-014, Afstemming vNext)', 'Nieuwe afstemming (UI-014, Afstemming vNext)'],
    wat: ['Розумна картотека розвитку продукту на api/afstemming: картки з життєвим циклом і ЧЕСНИМ станом придатності, незмінна історія рішень, зв’язки/дублікати/конфлікти з рішенням власника, прив’язка до реальних випусків, звіти.', 'Slimme productkartotheek op api/afstemming: kaarten met levensloop en EERLIJKE gezondheid, onveranderlijke beslisgeschiedenis, relaties/duplicaten/conflicten met eigenaarsbesluit, koppeling aan echte releases, rapporten.'],
    wanneer: ['Вмикайте, щоб вести задуми, вимоги й докази в одному місці; 25 старих тверджень матриці мігрують як legacy-картки без підвищення доказовості.', 'Zet aan om ideeën, eisen en bewijs op één plek te beheren; de 25 oude matrix-claims migreren als legacy-kaarten zonder hogere bewijslaag.'],
    gevolg: ['Вимкнено — стара «Матриця фактичної реалізації» без змін. Дані карток зберігаються і чекають наступного вмикання.', 'Uit = de oude waarheidsmatrix, ongewijzigd. De kaartgegevens blijven bewaard tot de volgende inschakeling.'],
  },
  'cloud-vnext': {
    naam: ['Нова «Хмара» (Cloud vNext)', 'Nieuwe cloud (Cloud vNext)'],
    wat: ['Нова сторінка хмари: «Мої файли» з теками, тегами, обраним, кошиком (30 днів) і версіями; завантаження частинами до 64 МБ; огляд із реальною статистикою; чесний центр інтеграцій (Google працює; OneDrive/Dropbox/Box — після ключів власника; iCloud/Proton — чому неможливо).', 'Nieuwe cloudpagina: «Mijn bestanden» met mappen, labels, favorieten, prullenbak (30 dagen) en versies; upload in stukken tot 64 MB; overzicht met echte cijfers; eerlijk integratiecentrum (Google werkt; OneDrive/Dropbox/Box na sleutels van de eigenaar; iCloud/Proton: waarom niet kan).'],
    wanneer: ['Увімкніть спершу лише для себе; дані спільні зі старою сторінкою, нічого не переноситься.', 'Zet eerst alleen voor uzelf aan; de gegevens zijn gedeeld met de oude pagina, er wordt niets gemigreerd.'],
    gevolg: ['Старі записи й файли видно одразу (без тек, доки ви їх не створите). Вимкнено — стара сторінка хмари без змін.', 'Bestaande records en bestanden zijn meteen zichtbaar (zonder mappen tot u ze maakt). Uit = de oude cloudpagina, ongewijzigd.'],
  },
  'foto-dienst': {
    naam: ['Новий розділ «Фото»', 'Nieuwe dienst «Foto’s»'],
    wat: ['Розділ «Фото» в «Моєму просторі»: одна стрічка всіх фото й відео, альбоми, пошук і фільтри, дублікати, імпорт архівів Google Takeout, Instagram, Facebook, VK, Telegram, Flickr, ZIP і тек.', 'Onderdeel «Foto’s» in «Mijn ruimte»: één tijdlijn van alle foto’s en video’s, albums, zoeken en filters, duplicaten, import van Google Takeout, Instagram, Facebook, VK, Telegram, Flickr, ZIP en mappen.'],
    wanneer: ['Увімкніть спершу лише для себе. Фото з «Хмарного сховища» з’являться без копіювання.', 'Zet eerst alleen voor uzelf aan. Foto’s uit «Cloudopslag» verschijnen zonder kopie.'],
    gevolg: ['Нічого не видаляється із зовнішніх сервісів. Вимкнено — розділу немає, імпортовані фото лишаються на сервері.', 'Er wordt niets uit externe diensten verwijderd. Uit = geen onderdeel, geïmporteerde foto’s blijven op de server.'],
  },
  'cloud-m4-koppelingen-v1': {
    naam: ['Підключення зовнішніх хмарних сховищ за OAuth', 'Koppeling van externe cloudopslag via OAuth'],
    wat: ['Дозволяє підключати зовнішні хмарні сховища до власного або технічного простору через захищений контур OAuth без розкриття ключів.', 'Maakt het mogelijk externe cloudopslag per eigen of technische ruimte via een beveiligde OAuth-stroom te koppelen zonder sleutels bloot te geven.'],
    wanneer: ['Увімкніть спершу лише для себе після додавання клієнтських ключів зовнішніх постачальників у сховище власника.', 'Zet eerst uitsluitend voor uzelf aan nadat de clientsleutels van de externe aanbieders in de kluis van de eigenaar zijn geplaatst.'],
    gevolg: ['Вимкнення зупиняє нові підключення та звернення до зовнішніх сховищ без видалення збережених прив’язок. Прав доступу не додає.', 'Uitschakelen stopt nieuwe koppelingen en aanroepen naar externe opslag zonder bewaarde koppelingen te wissen. Geeft geen extra rechten.'],
  },
  'cloud-m5-catalogus-v1': {
    naam: ['Каталог готовності зовнішніх хмарних постачальників', 'Gereedheidscatalogus van externe cloudaanbieders'],
    wat: ['Показує схваленому сеансу хмарного сховища чесний стан готовності кожного зовнішнього постачальника та наявність серверних налаштувань.', 'Toont binnen een goedgekeurde cloudsessie de eerlijke gereedheidsstatus van elke externe aanbieder en de aanwezigheid van serverinstellingen.'],
    wanneer: ['Увімкніть спершу для себе під час перевірки центру підключень хмарного сховища, а потім відкрийте іншим.', 'Zet eerst voor uzelf aan bij het controleren van het integratiecentrum van de cloudopslag en open daarna voor anderen.'],
    gevolg: ['Вимкнення приховує розширений каталог готовності без зміни підключених облікових записів чи файлів.', 'Uitschakelen verbergt de uitgebreide gereedheidscatalogus zonder gekoppelde accounts of bestanden te wijzigen.'],
  },
  'cloud-m6-beheer-v1': {
    naam: ['Керування політиками зовнішніх хмарних постачальників', 'Beheerbeleid voor externe cloudaanbieders'],
    wat: ['Відкриває власнику в активному технічному профілі налаштування доступності та обмежень для зовнішніх хмарних постачальників.', 'Opent voor de eigenaar in een actief technisch profiel de instellingen voor beschikbaarheid en grenzen van externe cloudaanbieders.'],
    wanneer: ['Увімкніть для себе, коли потрібно керувати правилами підключення зовнішніх хмарних служб.', 'Zet voor uzelf aan wanneer de koppelregels van externe clouddiensten beheerd moeten worden.'],
    gevolg: ['Вимкнення закриває адміністративні маршрути керування політиками хмари без зміни раніше збережених правил.', 'Uitschakelen sluit de beheerroutes voor cloudbeleid zonder eerder opgeslagen regels te veranderen.'],
  },
  'cloud-m8-mappen-v1': {
    naam: ['Єдиний перегляд тек підключених хмарних сховищ', 'Uniform mappenoverzicht van gekoppelde cloudopslag'],
    wat: ['Забезпечує перегляд тек і переліку об’єктів підключених зовнішніх хмарних сховищ із захищеним серверним вказівником сторінки.', 'Biedt mappenweergave en objectoverzicht van gekoppelde externe cloudopslag met een versleutelde paginawijzer op de server.'],
    wanneer: ['Увімкніть разом із середовищем виконання зовнішньої хмари після підключення першого сховища.', 'Zet samen met de serveromgeving voor externe cloudopslag aan zodra de eerste opslag is gekoppeld.'],
    gevolg: ['Вимкнення припиняє читання тек зовнішніх сховищ без жодних змін у самих файлах.', 'Uitschakelen stopt het uitlezen van externe mappen zonder enige wijziging aan de bestanden zelf.'],
  },
  'cloud-m10-beheer-v1': {
    naam: ['Адміністративний міст керування хмарними постачальниками', 'Beheerbrug voor cloudaanbieders'],
    wat: ['Дозволяє власнику з посиленим підтвердженням особи перевіряти та перемикати готовність контурів зовнішніх хмарних постачальників.', 'Stelt de eigenaar na sterke identiteitsbevestiging in staat de gereedheid van externe cloudaanbieders te controleren en te schakelen.'],
    wanneer: ['Увімкніть лише для власника під час налаштування зовнішніх хмарних підключень.', 'Zet uitsluitend voor de eigenaar aan tijdens het inrichten van externe cloudkoppelingen.'],
    gevolg: ['Вимкнення закриває адміністративний міст керування без втрати збережених налаштувань.', 'Uitschakelen sluit de beheerbrug zonder opgeslagen instellingen te verliezen.'],
  },
  'cloud-m10-omgeving-v1': {
    naam: ['Серверне середовище огляду тек і попереднього перегляду хмари', 'Serveromgeving voor mappen en voorbeeldweergave in de cloud'],
    wat: ['Вмикає робоче серверне середовище для живого читання тек і безпечного попереднього перегляду файлів із підключених зовнішніх хмар.', 'Schakelt de actieve serveromgeving in voor het uitlezen van mappen en beveiligde voorbeeldweergave van bestanden uit gekoppelde cloudopslag.'],
    wanneer: ['Увімкніть після перевірки ключів шифрування та підключення зовнішнього сховища.', 'Zet aan nadat de versleutelingssleutels en de koppeling met externe opslag zijn gecontroleerd.'],
    gevolg: ['Вимкнення переводить зовнішні маршрути читання тек і перегляду у вимкнений стан без втрати підключень.', 'Uitschakelen zet de externe routes voor mappen en voorbeeldweergave stil zonder verlies van koppelingen.'],
  },
  'cloud-m11-voorbeeld-v1': {
    naam: ['Захищений попередній перегляд файлів зовнішніх хмар', 'Beveiligde voorbeeldweergave van externe cloudbestanden'],
    wat: ['Відкриває попередній перегляд підтримуваних файлів із підключених зовнішніх сховищ із перевіркою версії та контрольної суми.', 'Opent een voorbeeldweergave van ondersteunde bestanden uit gekoppelde externe opslag met revisie- en somcontrole.'],
    wanneer: ['Увімкніть спершу лише для себе разом із серверним середовищем хмари, перевірте перегляд документів і світлин, а потім відкрийте іншим.', 'Zet eerst uitsluitend voor uzelf aan samen met de cloudomgeving, controleer documenten en afbeeldingen, en open daarna voor anderen.'],
    gevolg: ['Вимкнення вимикає попередній перегляд зовнішніх файлів без зміни самих файлів.', 'Uitschakelen stopt de voorbeeldweergave van externe bestanden zonder de bestanden zelf aan te raken.'],
  },
  'cloud-webdav-v1': {
    naam: ['Підключення власних мережевих сховищ за HTTPS', 'Koppeling van eigen netwerkopslag via HTTPS'],
    wat: ['Дозволяє підключати власну хмару чи домашнє мережеве сховище NAS за захищеним з’єднанням HTTPS із шифруванням пароля застосунку у сховищі ключів та захистом від звернень до внутрішньої мережі.', 'Maakt het mogelijk een eigen cloud of netwerkopslag via HTTPS te koppelen met versleuteling van het toepassingswachtwoord in de sleutelkluis en bescherming tegen interne netwerkadressen.'],
    wanneer: ['Увімкніть спершу лише для себе, перевірте з’єднання з власним сервером хмари й огляд тек, а далі відкрийте іншим за потреби.', 'Zet eerst uitsluitend voor uzelf aan, controleer de verbinding met de eigen opslagserver en het mappenoverzicht, en open daarna zo nodig voor anderen.'],
    gevolg: ['Вимкнення приховує підключення мережевих сховищ і зупиняє запити до них; зашифровані записи залишаються незмінними.', 'Uitschakelen verbergt de netwerkopslag en stopt verzoeken ernaartoe; versleutelde koppelingen blijven ongewijzigd bewaard.'],
  },
  'foto-google-drive-v1': {
    naam: ['Показ світлин із Google Drive та підключених сховищ у «Фото»', 'Foto’s uit Google Drive en gekoppelde opslag in «Foto’s»'],
    wat: ['Додає за явною згодою людини пряме відображення світлин із підключеного Google Drive та власних мережевих сховищ у службі «Фото» в межах поточного простору.', 'Voegt na uitdrukkelijke toestemming rechtstreekse weergave van foto’s uit gekoppelde Google Drive en eigen netwerkopslag toe aan de dienst «Foto’s» binnen dezelfde ruimte.'],
    wanneer: ['Потребує увімкненого розділу «Фото». Увімкніть спершу для себе, надайте згоду на обране джерело й перевірте стрічку світлин.', 'Vereist de dienst «Foto’s». Zet eerst voor uzelf aan, geef toestemming voor een bron en controleer de fotostroom.'],
    gevolg: ['Вимкнення припиняє завантаження зовнішніх світлин у стрічку без видалення жодного знімка у джерелі чи локальних альбомів.', 'Uitschakelen stopt het ophalen van externe foto’s zonder opnamen bij de bron of lokale albums te wissen.'],
  },
  'menu-kalender-foto-eigen': {
    naam: ['Календар і Фото в «Моєму просторі»', 'Agenda en Foto’s in «Mijn ruimte»'],
    wat: ['Прибирає «Календар» і «Фото» з меню «Хмарне сховище» і показує їх у «Моєму просторі». Старі адреси переводять на нові.', 'Haalt «Agenda» en «Foto’s» uit het menu «Cloudopslag» en toont ze in «Mijn ruimte». Oude adressen sturen door.'],
    wanneer: ['Разом із «Новий розділ «Фото»» або окремо.', 'Samen met «Nieuwe dienst «Foto’s»» of los.'],
    gevolg: ['Сам календар не змінюється. Вимкнено — меню як раніше.', 'De agenda zelf verandert niet. Uit = menu zoals vroeger.'],
  },
  'huis-vnext': {
    naam: ['Новий «Розумний будинок» (Huis vNext)', 'Nieuw slim huis (Huis vNext)'],
    wat: ['Нова сторінка huis: кімнати з планом, пристрої, сцени, автоматизації (чернетки й симуляція), безпека, енергія, події, інтеграції (Home Assistant), ШІ-пропозиції, showroom, калькулятор.', 'Nieuwe huis-pagina: kamers met plattegrond, apparaten, scènes, automatiseringen (concept en simulatie), beveiliging, energie, gebeurtenissen, integraties (Home Assistant), AI-voorstellen, showroom, planner.'],
    wanneer: ['Увімкніть спершу лише для себе; без підключеного Home Assistant сторінка чесно порожня.', 'Zet eerst alleen voor uzelf aan; zonder gekoppelde Home Assistant is de pagina eerlijk leeg.'],
    gevolg: ['Стани лише з підтверджених джерел; команди — лише після окремого дозволу на запис; замки/охорона — лише людина з підтвердженням входу. Вимкнено — стара інформаційна сторінка.', 'Toestanden alleen uit bevestigde bronnen; opdrachten alleen na aparte schrijftoestemming; sloten/alarm alleen een mens met bevestiging van de aanmelding. Uit = de oude informatiepagina.'],
  },
  'notities-vnext': {
    naam: ['Нові нотатки (Notities vNext)', 'Nieuwe notities (Notities vNext)'],
    wat: ['Нова сторінка «Нотатки»: теки, теги, закріплення, архів і кошик, редактор Markdown із чеклістами, імпорт/експорт файлів.', 'Nieuwe pagina «Notities»: mappen, etiketten, vastzetten, archief en prullenbak, Markdown-editor met checklists, bestandsimport/-export.'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати нові нотатки.', 'Zet eerst alleen voor uzelf aan om de nieuwe notities te proberen.'],
    gevolg: ['Записи ті самі (старі нотатки перенесено без втрат, дошка й інструмент manage_hub_notes працюють як раніше). Вимкнено — стара сторінка, усі нотатки на місці.', 'Dezelfde notities (oude zijn zonder verlies overgezet; het bord en manage_hub_notes werken als voorheen). Uit = de oude pagina, alle notities blijven.'],
  },
  'notities-agenda-brug-v1': {
    naam: ['Двосторонній зв’язок нотаток із календарем, завданнями та сховищем', 'Tweerichtingskoppeling van notities met agenda, taken en opslag'],
    wat: ['Дозволяє прив’язувати нотатку до події календаря за підтвердженням людини, переходити між нотаткою й зустріччю в один натиск, створювати завдання простору з нотатки та прикріплювати власні файли зі сховища.', 'Maakt het mogelijk een notitie na bevestiging aan een agenda-afspraak te koppelen, met één klik heen en weer te springen, ruimtetaken te maken en eigen opslagbestanden te koppelen.'],
    wanneer: ['Потребує увімкнених нових нотаток. Увімкніть спершу лише для себе, перевірте створення зв’язку з подією календаря, а потім відкрийте для всіх.', 'Vereist de nieuwe notities. Zet eerst uitsluitend voor uzelf aan, controleer de koppeling met een afspraak en open daarna voor iedereen.'],
    gevolg: ['Вимкнення ховає блок міжслужбових зв’язків у нотатці; збережені нотатки та події календаря залишаються на місці.', 'Uitschakelen verbergt het koppelblok in de notitie; bewaarde notities en agenda-afspraken blijven intact.'],
  },
  'bijlage-viewer-v2': {
    naam: ['Новий перегляд вкладень у пошті', 'Nieuwe bijlageviewer in mail'],
    wat: ['Компактні кнопки зі значками й підказками, документ займає майже все вікно, переклад і відомості про файл відкриваються збоку на вимогу.', 'Compacte knoppen met pictogrammen en uitleg, het document vult bijna het hele venster, vertaling en bestandsgegevens openen op verzoek opzij.'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий вигляд.', 'Zet eerst alleen voor uzelf aan om de nieuwe weergave te proberen.'],
    gevolg: ['Усі дії ті самі (завантажити, зберегти, друк, редагувати, переклад); змінюється лише вигляд. Вимкнено — старий перегляд без змін.', 'Alle acties blijven (downloaden, opslaan, afdrukken, bewerken, vertalen); alleen het uiterlijk verandert. Uit = de oude viewer, ongewijzigd.'],
  },
  'accountmenu-v2': {
    naam: ['Охайніше меню акаунта', 'Verfijnd accountmenu'],
    wat: ['Велике фото й імʼя лишаються, кнопки компактні й згруповані, пояснення сховані під ⓘ, справжні прапорці мов, перемикач «Звичайний / Технічний» унизу меню.', 'Grote foto en naam blijven, knoppen compact en gegroepeerd, uitleg achter ⓘ, echte taalvlaggen, wissel «Gewone / Technische» onderaan het menu.'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий вигляд.', 'Zet eerst alleen voor uzelf aan om de nieuwe weergave te proberen.'],
    gevolg: ['Усі дії ті самі; змінюється лише вигляд. Вимкнено — старе меню без змін.', 'Alle acties blijven; alleen het uiterlijk verandert. Uit = het oude menu, ongewijzigd.'],
  },
  'accountmenu-v3': {
    naam: ['Нове меню облікового запису (орбіта світлин, палітра та доступ)', 'Nieuw accountmenu (foto-orbita, palet en toegang)'],
    wat: ['Єдина композиція спадного меню облікового запису: «Орбіта світлин» у шапці (або «Секційна картка» у Налаштуваннях), швидке перемикання палітри кольорів, концентричне кільце часу доступу з трьома умовами завершення технічного простору, вихід у два стовпці з міні-кружечками та масштабування за кутик.', 'Eén samenhangend accountmenu: foto-orbita bovenaan (of sectiekaart via Instellingen), snelle paletwissel, concentrische tijdring met drie duidelijke eindvoorwaarden van de technische ruimte, tweekoloms afmelden met minicirkels en schalen via de hoek.'],
    wanneer: ['Увімкніть спершу лише для себе у «Перемикачах функцій», перевірте обидва режими вигляду в «Налаштування → Налаштувати меню», а далі за потреби відкрийте вибраним людям або всім.', 'Zet eerst alleen voor uzelf aan bij «Functieschakelaars», probeer beide weergaven via «Instellingen → Menu instellen» en open daarna zo nodig voor gekozen mensen of iedereen.'],
    gevolg: ['Вимкнення миттєво повертає попереднє меню облікового запису без втрати сеансів, кольорів чи налаштувань. Перемикач не змінює прав доступу.', 'Uitzetten brengt meteen het vorige accountmenu terug zonder sessies, kleuren of instellingen te verliezen. De schakelaar verandert geen rechten.'],
  },
  'integraties-catalogus-v2': {
    naam: ['Новий каталог інтеграцій (теми й групи)', 'Nieuwe integratiecatalogus (thema’s en groepen)'],
    wat: ['Каталог на «Інтеграціях» групується за темами, а в кожній темі — за справжнім станом: підключені, можна підключити, потребують уваги, потребують налаштування, у розробці. Замість «Скоро» — чесний план.', 'De catalogus op «Integraties» staat per thema en daarbinnen per echte stand: gekoppeld, klaar om te koppelen, vraagt aandacht, instellen nodig, in ontwikkeling. In plaats van «Binnenkort» een eerlijk plan.'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий вигляд.', 'Zet eerst alleen voor uzelf aan om de nieuwe weergave te proberen.'],
    gevolg: ['Усі 160 карток лишаються, нічого не підключається й не відключається само. Вимкнено — старий каталог без змін.', 'Alle 160 kaarten blijven; niets wordt vanzelf gekoppeld of losgekoppeld. Uit = de oude catalogus, ongewijzigd.'],
  },
  'verbindingen-centrum-v2': {
    naam: ['Новий центр підключень («Акаунти»)', 'Nieuw verbindingencentrum («Accounts»)'],
    wat: ['Сторінка «Акаунти» у Хмарному сховищі: короткий стан, мої підключення, каталог сервісів, синхронізація та історія, по одному «?» на блок.', 'De pagina «Accounts» in de cloud: korte status, mijn verbindingen, catalogus, synchronisatie en geschiedenis, één «?» per blok.'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати нову сторінку.', 'Zet eerst alleen voor uzelf aan om de nieuwe pagina te proberen.'],
    gevolg: ['Підключення ті самі, нічого не видаляється й не відключається. Вимкнено — стара сторінка «Акаунти».', 'Dezelfde verbindingen; niets wordt gewist of losgekoppeld. Uit = de oude pagina «Accounts».'],
  },
  'uitrol-weergave-v2': {
    naam: ['Новий вигляд «Оновлення»', 'Nieuwe weergave «Updates»'],
    wat: ['Термінал українською (оригінал завжди доступний), учасники кожного випуску, компактний блок «Хто має доступ до підготовки», історія з групами спроб і діями відновлення, короткий підсумок проблем в «Огляді».', 'Terminal in het Oekraïens (origineel altijd beschikbaar), deelnemers per release, compact blok «Wie heeft toegang tot voorbereiden», geschiedenis met gegroepeerde pogingen en herstelacties, korte probleemsamenvatting op «Overzicht».'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий вигляд.', 'Zet eerst alleen voor uzelf aan om de nieuwe weergave te proberen.'],
    gevolg: ['Розгортання, passkey, перевірки, журнал і відкат ті самі; змінюється лише вигляд. Вимкнено — стара сторінка.', 'Uitrol, passkey, controles, logboek en terugdraaien blijven gelijk; alleen de weergave verandert. Uit = de oude pagina.'],
  },
  'mail-zoeken-v2': {
    naam: ['Новий пошук і фільтри в Пошті', 'Nieuw zoeken en filters in Mail'],
    wat: ['Одна компактна панель пошуку: швидкі фільтри, згруповані умови, зручний вибір періоду. Пошук запускається лише кнопкою «Шукати».', 'Eén compact zoekpaneel: snelle filters, gegroepeerde voorwaarden, eenvoudige periodekeuze. Zoeken start pas met «Zoeken».'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий пошук.', 'Zet eerst alleen voor uzelf aan om het nieuwe zoeken te proberen.'],
    gevolg: ['Умови пошуку, збережені пошуки й результати ті самі; змінюється лише панель. Вимкнено — стара панель фільтрів і «Ще умови».', 'Zoekvoorwaarden, opgeslagen zoekopdrachten en resultaten blijven gelijk; alleen het paneel verandert. Uit = het oude filterpaneel en «Meer voorwaarden».'],
  },
  'mail-dienstbruggen-v1': {
    naam: ['Швидкі міжслужбові дії з листа та вкладень у Пошті', 'Snelle dienstbruggen vanuit berichten en bijlagen in E-mail'],
    wat: ['Додає у відкритому листі та переглядачі вкладень швидкі дії створення нотатки, завдання простору, переходу до звірки, події в календарі та картки клієнта без передавання приватного тексту в адресу сторінки.', 'Voegt in het geopende bericht en de bijlageweergave snelle acties toe voor een notitie, ruimtetaak, afstemming, agenda-afspraak en klantkaart zonder privégegevens in het webadres.'],
    wanneer: ['Увімкніть спершу лише для себе, перевірте переходи з листа у нотатки, календар і картку клієнта в обох просторах, а потім відкрийте іншим.', 'Zet eerst uitsluitend voor uzelf aan, controleer de acties vanuit een bericht naar notities, agenda en klantkaart in beide ruimtes, en open daarna voor anderen.'],
    gevolg: ['Вимкнення прибирає кнопки міжслужбових дій із пошти; раніше створені нотатки, завдання, події й досьє клієнтів зберігаються.', 'Uitschakelen verbergt de brugknoppen in de post; eerder aangemaakte notities, taken, afspraken en klantdossiers blijven bewaard.'],
  },
  'agenda-v3': {
    naam: ['Новий календар (Agenda v3)', 'Nieuwe agenda (Agenda v3)'],
    wat: ['Нова сторінка «Календар»: великий календар, мінікалендар, список календарів, зручний вигляд на телефоні.', 'Nieuwe pagina «Agenda»: grote agenda, minikalender, lijst met agenda’s, prettig op de telefoon.'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий вигляд календаря.', 'Zet eerst alleen voor uzelf aan om de nieuwe agenda te proberen.'],
    gevolg: ['Події, підключення й дозволи ті самі; змінюється лише вигляд. Вимкнено — старий календар без змін.', 'Afspraken, koppelingen en rechten blijven gelijk; alleen het uiterlijk verandert. Uit = de oude agenda, ongewijzigd.'],
  },
  'agenda-koppelingen-v1': {
    naam: ['Двосторонній запис CalDAV, вивантаження ICS і переходи в Календарі', 'Tweerichtings-CalDAV, ICS-uitvoer en sprongen in de Agenda'],
    wat: ['Вмикає збереження й видалення подій у зовнішніх календарях CalDAV із перевіркою прав запису та версії, вивантаження події у файл ICS для календарів лише для читання та швидкі переходи до листів, контакту й нотатки зустрічі.', 'Schakelt opslaan en wissen in externe CalDAV-agenda’s met rechten- en versiecontrole in, biedt ICS-uitvoer voor alleen-lezen agenda’s en voegt snelle sprongen naar berichten, contact en gespreksnotitie toe.'],
    wanneer: ['Увімкніть спершу лише для себе, перевірте запис у підключений календар CalDAV або завантаження ICS та переходи з картки події, а потім відкрийте для всіх.', 'Zet eerst uitsluitend voor uzelf aan, controleer het schrijven naar een gekoppelde CalDAV-agenda of ICS-uitvoer en de sprongen vanuit een afspraak, en open daarna voor iedereen.'],
    gevolg: ['Вимкнення залишає зовнішні календарі CalDAV у режимі читання й ховає додаткові переходи без втрати підписок чи подій.', 'Uitschakelen houdt externe CalDAV-agenda’s op alleen-lezen en verbergt de extra sprongen zonder abonnementen of afspraken te verliezen.'],
  },
  'meldingen-v2': {
    naam: ['Новий центр сповіщень', 'Nieuw meldingencentrum'],
    wat: ['Компактний список: повтори зливаються в один рядок, окремий лічильник «потребує уваги», правила для кожного сервісу й акаунта, «Не турбувати».', 'Compacte lijst: herhalingen worden één regel, aparte teller «vraagt aandacht», regels per dienst en account, «Niet storen».'],
    wanneer: ['Увімкніть спершу лише для себе, щоб спробувати новий центр сповіщень.', 'Zet eerst alleen voor uzelf aan om het nieuwe meldingencentrum te proberen.'],
    gevolg: ['Сповіщення ті самі, нічого не видаляється. Важливі сповіщення безпеки не можна приглушити. Вимкнено — старий центр.', 'Dezelfde meldingen, niets wordt gewist. Belangrijke beveiligingsmeldingen kunnen niet gedempt worden. Uit = het oude centrum.'],
  },
  'meldingen-uitleg-v3': {
    naam: ['Зрозумілі сповіщення й розмір панелі', 'Begrijpelijke meldingen en paneelgrootte'],
    wat: ['У кожному сповіщенні: хто, що саме, коли, чому, чим загрожує й що робити, плюс кнопки швидких дій (відкрити, переглянути зміну, відкликати, вимкнути цей тип). Розмір тексту й панелі можна обрати.', 'In elke melding: wie, wat precies, wanneer, waarom, wat het gevolg is en wat te doen, plus snelle acties (openen, wijziging bekijken, intrekken, dit soort uitzetten). Tekst- en paneelgrootte instelbaar.'],
    wanneer: ['Потрібен увімкнений «Новий центр сповіщень». Увімкніть спершу лише для себе.', 'Vereist «Nieuw meldingencentrum». Zet eerst alleen voor uzelf aan.'],
    gevolg: ['Сповіщення ті самі. Небезпечні дії (відкликати, заборонити) ведуть на сторінку, де їх треба підтвердити; самі не виконуються. Вимкнено — як зараз.', 'Dezelfde meldingen. Gevaarlijke acties (intrekken, verbieden) leiden naar de pagina waar u ze bevestigt; ze gebeuren nooit vanzelf. Uit = zoals nu.'],
  },
  'ruimtes-scheiding': {
    naam: ['Суворе розділення просторів', 'Strikte scheiding van de ruimtes'],
    wat: ['Технічний простір працює лише, поки ви увійшли на сайт у цьому самому вході.', 'De technische ruimte werkt alleen zolang u in dezelfde aanmelding op de site bent.'],
    wanneer: ['Увімкніть, щоб перевірити нове, суворіше розділення звичайного й технічного простору.', 'Zet aan om de nieuwe, strengere scheiding van gewone en technische ruimte te proberen.'],
    gevolg: ['Після виходу з сайту технічний простір закривається сам; журнали ведуться окремо. Прав не додає.', 'Na afmelden sluit de technische ruimte vanzelf; logboeken apart. Geeft geen rechten.'],
  },
  'ssh-certificaat': {
    naam: ['Кнопка «Сертифікат SSH»', 'Knop «SSH-certificaat»'],
    wat: ['Показує в технічному профілі кнопку для короткого сертифіката входу на сервер.', 'Toont in het technisch profiel een knop voor een kort certificaat om op de server in te loggen.'],
    wanneer: ['Увімкніть, якщо хочете спробувати вхід на сервер через сайт.', 'Zet aan als u inloggen op de server via de site wilt proberen.'],
    gevolg: ['З’явиться лише кнопка; підписати сертифікат можна тільки з окремим дозволом. Прав не додає.', 'Alleen de knop verschijnt; ondertekenen kan alleen met een aparte toestemming. Geeft geen rechten.'],
  },
  'tech-ruimtes-v2': {
    naam: ['Два простори одного акаунта (нова версія)', 'Twee ruimtes van één account (nieuwe versie)'],
    wat: ['Звичайний і технічний простір поруч: три терміни, пауза, перемикач угорі.', 'Gewone en technische ruimte naast elkaar: drie termijnen, pauze, schakelaar bovenaan.'],
    wanneer: ['Увімкніть, щоб працювати з новим перемикачем просторів.', 'Zet aan om met de nieuwe ruimteschakelaar te werken.'],
    gevolg: ['Змінюється лише вигляд і порядок входу в технічний простір. Прав не додає й не забирає.', 'Alleen het uiterlijk en de manier van binnengaan veranderen. Geeft of neemt geen rechten.'],
  },
  'tech-ruimtes-v2-schaduw': {
    naam: ['Тихе порівняння перевірок', 'Stille vergelijking van controles'],
    wat: ['Сайт тихо порівнює стару й нову перевірку доступу і записує розбіжності в журнал.', 'De site vergelijkt stil de oude en nieuwe toegangscontrole en schrijft verschillen in het logboek.'],
    wanneer: ['Увімкніть перед переходом на нову версію, щоб побачити, чи щось відрізняється.', 'Zet aan vóór de overstap naar de nieuwe versie, om te zien of er iets verschilt.'],
    gevolg: ['Для вас нічого не змінюється; лише з’являються записи в журналі.', 'Voor u verandert niets; er komen alleen regels in het logboek.'],
  },
  'werkblad-v3': {
    naam: ['Новий робочий стіл', 'Nieuw werkblad'],
    wat: ['Вільне полотно: значки й вікна можна ставити будь-де, окремо для ПК, планшета й телефона.', 'Vrij vlak: pictogrammen en vensters overal neerzetten, apart voor pc, tablet en telefoon.'],
    wanneer: ['Увімкніть, щоб спробувати новий робочий стіл.', 'Zet aan om het nieuwe werkblad te proberen.'],
    gevolg: ['Вимкнення повертає старий стіл; ваші розкладки не видаляються. Прав не додає.', 'Uitzetten geeft het oude werkblad terug; uw indelingen blijven bewaard. Geeft geen rechten.'],
  },
  'werkblad-blokken': {
    naam: ['Блоки на робочому столі', 'Blokken op het werkblad'],
    wat: ['Значки можна групувати в блоки (і блок у блоці) з власним розміром.', 'Pictogrammen in blokken groeperen (ook blok in blok) met een eigen grootte.'],
    wanneer: ['Увімкніть, щоб спробувати блоки.', 'Zet aan om blokken te proberen.'],
    gevolg: ['Вимкнення ховає блоки, але не видаляє їх. Прав не додає.', 'Uitzetten verbergt de blokken maar wist ze niet. Geeft geen rechten.'],
  },
  'klantrelatiebeheer-v1': {
    naam: ['Клієнтські взаємини', 'Klantrelatiebeheer'],
    wat: ['Середовище клієнтських взаємин: зашифровані власним ключем досьє клієнтів, угоди за етапами, історія взаємодій, подальші завдання, розрахунок кошторису та безпечний зв’язок із поштою, хмарним сховищем і календарем.', 'Klantrelatiebeheer: met uw eigen gegevenssleutel versleutelde klantdossiers, verkoopkansen per fase, contactgeschiedenis, vervolgtaken, begroting en veilige koppeling met e-mail, cloudopslag en agenda.'],
    wanneer: ['Увімкніть спершу лише для себе в «Перемикачах функцій», перевірте досьє клієнтів, угоди й завдання за відкритого сховища ключів, а потім відкрийте для вибраних людей або всіх.', 'Zet eerst alleen voor uzelf aan bij «Functieschakelaars», controleer klantdossiers, verkoopkansen en taken met geopende sleutelkluis, en open daarna voor gekozen mensen of iedereen.'],
    gevolg: ['Вимкнення негайно закриває доступ до маршрутів та екрана клієнтських взаємин без втрати чи зміни збережених зашифрованих досьє. Прав доступу перемикач не додає.', 'Uitschakelen sluit meteen de routes en het scherm van klantrelatiebeheer zonder verlies of wijziging van de versleutelde dossiers. De schakelaar geeft geen extra rechten.'],
  },
};

export const HELP_FLAGS: HelpLagen = {
  wat: ['Перемикачі функцій вмикають нову можливість сайту поступово: спершу для себе, потім для вибраних людей або частини користувачів.',
    'Functieschakelaars zetten een nieuwe mogelijkheid van de site stap voor stap aan: eerst voor uzelf, dan voor gekozen mensen of een deel van de gebruikers.'],
  gevolg: ['Перемикач змінює лише те, що людина бачить або може спробувати. Прав він не дає й не забирає.',
    'Een schakelaar verandert alleen wat iemand ziet of kan proberen. Rechten geeft of neemt hij niet.'],
  risico: ['Головний вимикач вимикає функцію для всіх одразу. «Увімкнено для мене» діє лише для вас і лише до кінця технічного сеансу (не довше 8 годин).',
    'De hoofdschakelaar zet de functie voor iedereen meteen uit. «Aan voor mij» geldt alleen voor u en alleen tot het einde van de technische sessie (hoogstens 8 uur).'],
  dev: ['Таблиця app.feature_flags на вашому сервері; відповідь у форматі OpenFeature OFREP: POST /api/ofrep/v1/evaluate/flags[/<ключ>]. Частка — постійний «кошик» FNV-1a(ключ:користувач) % 100. Порядок: тест тестувальника → головний перемикач → список → частка → типове значення.',
    'Tabel app.feature_flags op uw server; antwoord in OpenFeature-OFREP-vorm: POST /api/ofrep/v1/evaluate/flags[/<sleutel>]. Deel = vaste emmer FNV-1a(sleutel:gebruiker) % 100. Volgorde: test van de tester → hoofdschakelaar → lijst → deel → standaard.'],
};
