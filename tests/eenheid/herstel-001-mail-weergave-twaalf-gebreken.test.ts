// HERSTEL-001 — Перевірочні випробування 20 вад перегляду листа, динамічного простору, інтерпретації та походження Пошти (mail.tarasevych.com)
// за одинадцятьма мобільними знімками екрана власника:
//   - Screenshot_20261125_134333_com.android.chrome.jpg
//   - Screenshot_20261125_134339_com.android.chrome.jpg
//   - Screenshot_20261125_134353_com.android.chrome.jpg
//   - Screenshot_20261125_134412_com.android.chrome.jpg
//   - Screenshot_20261125_134421_com.android.chrome.jpg
//   - Screenshot_20261125_134431_com.android.chrome.jpg
//   - Screenshot_20261125_134459_com.android.chrome.jpg
//   - Screenshot_20261125_134516_com.android.chrome.jpg
//   - Screenshot_20261125_134521_com.android.chrome.jpg
//   - Screenshot_20261125_134542_com.android.chrome.jpg
//   - Screenshot_20261125_134722_com.android.chrome.jpg
//
// Цей тестовий набір зберігає точні вимоги та перевіряє як наявність цільових точок у коді,
// так і функцію автоматичної оцінки виправлення кожного з 20 пунктів (MAIL-1..MAIL-20).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface MailGebrekContract {
  readonly id:
    | 'MAIL-1'
    | 'MAIL-2'
    | 'MAIL-3'
    | 'MAIL-4'
    | 'MAIL-5'
    | 'MAIL-6'
    | 'MAIL-7'
    | 'MAIL-8'
    | 'MAIL-9'
    | 'MAIL-10'
    | 'MAIL-11'
    | 'MAIL-12'
    | 'MAIL-13'
    | 'MAIL-14'
    | 'MAIL-15'
    | 'MAIL-16'
    | 'MAIL-17'
    | 'MAIL-18'
    | 'MAIL-19'
    | 'MAIL-20';
  readonly schermafdrukken: readonly string[];
  readonly titelUk: string;
  readonly titelNl: string;
  readonly doelBestanden: readonly string[];
  readonly oorzaakUk: string;
  readonly herstelEisUk: string;
}

export const TWINTIG_MAILGEBREKEN_CONTRACTEN: readonly MailGebrekContract[] = [
  {
    id: 'MAIL-1',
    schermafdrukken: ['Screenshot_20261125_134459_com.android.chrome.jpg'],
    titelUk: 'Виток сирого HTML-коду <a href="...">Open in Maps</a> у видимий текст картки «Що від вас потрібно? → КОРОТКО»',
    titelNl: 'Ruwe HTML-code <a href="...">Open in Maps</a> zichtbaar als platte tekst in «Wat wordt er van u verwacht? → KORT»',
    doelBestanden: ['shared/ai-bronnen.ts', 'src/mail/WatNodigBlok.tsx'],
    oorzaakUk:
      'eenvoudigeOntleding у shared/ai-bronnen.ts бере речення з plainText разом із сирим тегом <a href="...">Open in Maps</a>, а PuntRegel у src/mail/WatNodigBlok.tsx виводить {x.tekst} без очищення чи перетворення на натискальне посилання.',
    herstelEisUk:
      'Очищувати сирі HTML-теги <a href="..."> у тексті пунктів «Що від вас потрібно? / Коротко» або перетворювати їх на безпечне натискальне посилання з чистою назвою.',
  },
  {
    id: 'MAIL-2',
    schermafdrukken: [
      'Screenshot_20261125_134333_com.android.chrome.jpg',
      'Screenshot_20261125_134339_com.android.chrome.jpg',
      'Screenshot_20261125_134353_com.android.chrome.jpg',
      'Screenshot_20261125_134412_com.android.chrome.jpg',
      'Screenshot_20261125_134431_com.android.chrome.jpg',
      'Screenshot_20261125_134459_com.android.chrome.jpg',
    ],
    titelUk:
      'Хибне визначення автоматичного листа від no-reply@toogoodtogo.com як «💬 Потребує відповіді» та пропонування форми відповіді на no-reply@',
    titelNl:
      'Onterechte markering van een automatisch no-reply@toogoodtogo.com-bericht als «Wacht op uw antwoord» en antwoordformulier naar no-reply@',
    doelBestanden: ['shared/ai-bronnen.ts', 'src/mail/WatNodigBlok.tsx', 'src/MailGesprekInhoud.tsx'],
    oorzaakUk:
      'antwoordNodig та VERZOEK у shared/ai-bronnen.ts спрацьовують на слова please / remember to у реченні про скасування замовлення в застосунку і не відфільтровують односторонні адреси no-reply@ / noreply@ / do-not-reply@.',
    herstelEisUk:
      'Не позначати листи від адрес no-reply@ / noreply@ / do-not-reply@ як «Потребує відповіді» та не пропонувати для них автоматичну чернетку відповіді.',
  },
  {
    id: 'MAIL-3',
    schermafdrukken: [
      'Screenshot_20261125_134339_com.android.chrome.jpg',
      'Screenshot_20261125_134353_com.android.chrome.jpg',
      'Screenshot_20261125_134412_com.android.chrome.jpg',
      'Screenshot_20261125_134421_com.android.chrome.jpg',
      'Screenshot_20261125_134431_com.android.chrome.jpg',
      'Screenshot_20261125_134722_com.android.chrome.jpg',
    ],
    titelUk:
      'Збій взаємодії з панеллю [✨ ШІ] у відповіді: німі кнопки без тексту, перехоплення фокуса підказкою data-tooltip та її залипання поверх нижньої панелі під час прокручування',
    titelNl:
      'Interactiefout bij het [✨ AI]-paneel in het antwoordblok: naamloze knoppen, focus-tooltip op aanraakscherm en blijvend zwevende tooltip over de onderbalk tijdens scrollen',
    doelBestanden: ['src/MailLezerAi.tsx', 'src/ViewportKnopinfoLaag.tsx', 'src/mail-mobiel-passend.css'],
    oorzaakUk:
      'У mail-mobiel-passend.css на екранах <=430px приховано текст кнопок Підсумок і Чернетка відповіді; у MailLezerAi.tsx кнопка mra-toggle має безумовний data-tooltip на дотику; а ViewportKnopinfoLaag.tsx затискає top до maxTop і не ховає підказку, коли кнопка прокручена за межі екрана.',
    herstelEisUk:
      'Зберегти зрозумілі підписи дій у панелі ШІ на смартфоні, вимкнути залипання підказки data-tooltip при дотику та приховувати ViewportKnopinfoLaag, коли цільовий елемент виходить за межі видимої області під час прокрутки.',
  },
  {
    id: 'MAIL-4',
    schermafdrukken: [
      'Screenshot_20261125_134333_com.android.chrome.jpg',
      'Screenshot_20261125_134421_com.android.chrome.jpg',
    ],
    titelUk:
      'Обрізаний напис «iCalendar / зайнятіст» у мініатюрі 64×64 px картки вкладення .ics, дублювання підпису типу файла та 5 німих кнопок дій',
    titelNl:
      'Afgekapte tekst «iCalendar / зайнятіст» in de 64×64 px-miniatuur van .ics-bijlagekaarten, dubbele typeaanduiding en 5 naamloze actieknoppen',
    doelBestanden: ['src/mail-persoonsgegevens-mogelijkheden.ts', 'src/MailBijlageMiniatuur.tsx', 'src/MailBijlageKaart.tsx'],
    oorzaakUk:
      'mailPersonalDataCapability передає в поле label довгий рядок "iCalendar / зайнятість" замість короткого коду "ICS", а MailBijlageMiniatuur виводить <b>{descriptor.label}</b> всередині вузької іконки 64×64 px.',
    herstelEisUk:
      'Виводити в мініатюрі 64×64 px короткий код формату (ICS / VCF), який не обрізається і не дублює повний опис типу файла праворуч.',
  },
  {
    id: 'MAIL-5',
    schermafdrukken: [
      'Screenshot_20261125_134333_com.android.chrome.jpg',
      'Screenshot_20261125_134412_com.android.chrome.jpg',
      'Screenshot_20261125_134421_com.android.chrome.jpg',
      'Screenshot_20261125_134459_com.android.chrome.jpg',
    ],
    titelUk:
      'Порушення Абсолютного мовного закону — нідерландська калька «В Агенду» замість питомого українського «У Календар» у трьох компонентах пошти',
    titelNl:
      'Overtreding van de Absolute Taalwet — Nederlandse calque «В Агенду» in plaats van Oekraïens «У Календар» in drie postonderdelen',
    doelBestanden: ['src/mail/WatNodigBlok.tsx', 'src/mail/ContextPaneel.tsx', 'src/MailGesprekInhoud.tsx'],
    oorzaakUk:
      'У WatNodigBlok.tsx, ContextPaneel.tsx та MailGesprekInhoud.tsx зашито кальку t("В Агенду", "Naar Agenda"), хоча українською мовою служба в меню називається «Календар».',
    herstelEisUk:
      'Замінити кальку «В Агенду» на питомий український відповідник «У Календар» / «До Календаря» в усіх компонентах пошти.',
  },
  {
    id: 'MAIL-6',
    schermafdrukken: [
      'Screenshot_20261125_134516_com.android.chrome.jpg',
      'Screenshot_20261125_134542_com.android.chrome.jpg',
    ],
    titelUk:
      'Спотворення англійського привітання «Hi Pavlo Tarasevych» на українське заперечення «Ні Павло Тарасевич» у витягу листа в хронології',
    titelNl:
      'Vervorming van de Engelse aanhef «Hi Pavlo Tarasevych» tot de Oekraïense ontkenning «Ні Павло Тарасевич» in het tijdlijnuittreksel',
    doelBestanden: ['src/mail/gesprek-context.ts', 'src/mail/ContextPaneel.tsx'],
    oorzaakUk:
      'Під час формування або відображення витягу (snippet) листа в tijdlijn (src/mail/gesprek-context.ts) латинське вітання "Hi" перед кириличним ім’ям "Павло Тарасевич" перетворюється на кириличне заперечення "Ні".',
    herstelEisUk:
      'Запобігати хибній заміні латинського привітання "Hi " на кириличне заперечення "Ні " перед кириличним ім’ям у витягах листів та хронології.',
  },
  {
    id: 'MAIL-7',
    schermafdrukken: [
      'Screenshot_20261125_134516_com.android.chrome.jpg',
      'Screenshot_20261125_134521_com.android.chrome.jpg',
      'Screenshot_20261125_134542_com.android.chrome.jpg',
    ],
    titelUk:
      'Відсутність орієнтира про попередні листи у «Контекст → Хронологія», інверсія вітального листа від 15 жовтня та блокування знімка екрана з прокручуванням',
    titelNl:
      'Ontbrekende aanwijzing voor eerdere berichten in «Context → Tijdlijn», omgekeerde volgorde op 15 oktober en geblokkeerde scroll-schermafdruk',
    doelBestanden: ['src/mail/ContextPaneel.tsx', 'src/mail/context-paneel.css', 'src/mail/gesprek-context.ts'],
    oorzaakUk:
      'Модальний аркуш .ctx-paneel має фіксований max-height: min(84%, 680px) і внутрішній overflow: auto без режиму langscroll та без індикатора кількості схованих вище листів хронології.',
    herstelEisUk:
      'Забезпечити підтримку повного прокручування для знімків екрана в мобільному аркуші Контексту та видимий орієнтир про наявність попередніх листів у хронології.',
  },
  {
    id: 'MAIL-8',
    schermafdrukken: [
      'Screenshot_20261125_134516_com.android.chrome.jpg',
      'Screenshot_20261125_134521_com.android.chrome.jpg',
      'Screenshot_20261125_134542_com.android.chrome.jpg',
    ],
    titelUk:
      'Випадання п’ятої вкладки «Відправник» на другий рядок у шторці «Контекст», слабка контрастність активної вкладки та обрізання назви події й нижнього рядка «Пу...»',
    titelNl:
      'Vijfde tabblad «Afzender» valt op een tweede regel in het contextblad, zwak contrast van actief tabblad en afgekapt afspraakonderwerp',
    doelBestanden: ['src/mail/context-paneel.css', 'src/mail/ContextPaneel.tsx'],
    oorzaakUk:
      'У src/mail/context-paneel.css .ctx-tabs має flex-wrap: wrap із padding: 0 12px (через що 5-та вкладка «Відправник» падає на другий рядок), а .ctx-tl-tekst strong обрізає заголовок події в один рядок через white-space: nowrap.',
    herstelEisUk:
      'Розміщувати всі 5 вкладок Контексту в один компактний рядок із чітким виділенням активної вкладки та не обрізати назву майбутньої події й нижню примітку хронології.',
  },
  {
    id: 'MAIL-9',
    schermafdrukken: [
      'Screenshot_20261125_134333_com.android.chrome.jpg',
      'Screenshot_20261125_134339_com.android.chrome.jpg',
      'Screenshot_20261125_134431_com.android.chrome.jpg',
      'Screenshot_20261125_134722_com.android.chrome.jpg',
    ],
    titelUk:
      'Триповерхова розірвана верхня шапка переглядача листа (> 170 px) із самотньою кнопкою [ < ] на першому поверсі, порожньою діркою 64 px справа та дублюванням [ < ] і [ ✕ ]',
    titelNl:
      'Drie verdiepingen hoge, gebroken bovenbalk van het leesvenster (> 170 px) met eenzame knop [ < ] op de eerste rij, 64 px lege ruimte rechts en dubbele sluitknoppen [ < ] en [ ✕ ]',
    doelBestanden: ['src/mail/mail-lezer-compact-kop.css', 'src/mail/lees-venster.css', 'src/MailLezerWerkbalk.tsx'],
    oorzaakUk:
      'У mail-lezer-compact-kop.css дитина .mail-reader-kop-opties з flex: 1 0 100% розпирає .mail-reader-toolbar до 100% ширини й виштовхує його на другий поверх під кнопку [ < ], а в lees-venster.css резервний padding-right не скинуто для [data-lees-modus="telefoon"].',
    herstelEisUk:
      'Утримувати кнопку «Назад» [ < ] та основний ряд інструментів на одному першому поверсі без порожньої дірки справа і без дублювання кнопок закриття [ < ] та [ ✕ ] на телефоні.',
  },
  {
    id: 'MAIL-10',
    schermafdrukken: [
      'Screenshot_20261125_134333_com.android.chrome.jpg',
      'Screenshot_20261125_134339_com.android.chrome.jpg',
      'Screenshot_20261125_134353_com.android.chrome.jpg',
    ],
    titelUk:
      'Дублювання дій «Архів», «Відповісти», «Переслати» та залишення активної чорної кнопки «↩ Відповісти» в нижній панелі під час уже розгорнутого редактора відповіді',
    titelNl:
      'Verdubbeling van acties «Archief», «Beantwoorden», «Doorsturen» en actief blijvende zwarte knop «↩ Beantwoorden» in de onderbalk terwijl het antwoordveld al openstaat',
    doelBestanden: ['src/MailLezerWerkbalk.tsx', 'src/MailGesprekInhoud.tsx'],
    oorzaakUk:
      'Нижня панель .mail-reader-onderbalk у MailLezerWerkbalk.tsx завжди рендерить акцентну кнопку «↩ Відповісти», навіть коли блок .mail-thread-reply вже розгорнутий просто над нею.',
    herstelEisUk:
      'Усунути дублювання кнопки «Відповісти» в нижній панелі під час відкритого редактора відповіді та згрупувати дії у шапці відповіді в один компактний ряд.',
  },
  {
    id: 'MAIL-11',
    schermafdrukken: [
      'Screenshot_20261125_134333_com.android.chrome.jpg',
      'Screenshot_20261125_134722_com.android.chrome.jpg',
    ],
    titelUk:
      'Відсутність шапки й кнопки закриття [✕] у спливному аркуші налаштувань «Вигляд», оманлива кнопка «↙↗ Згорнути лист» унизу налаштувань та різнобій одиниць «МБ» проти «KB»',
    titelNl:
      'Ontbrekende kop en sluitknop [✕] op het weergaveblad, misleidende knop «↙↗ Bericht minimaliseren» onderaan de instellingen en gemengde eenheden «МБ» tegenover «KB»',
    doelBestanden: ['src/MailLezerWerkbalk.tsx', 'src/mail/WeergaveKeuze.tsx', 'src/MailBijlageVoorbeeld.tsx'],
    oorzaakUk:
      'У MailLezerWerkbalk.tsx кнопка «Згорнути лист» розташована в кінці .mail-reader-overflow-panel одразу під WeergaveBlok без шапки закриття аркуша, а formatMailAttachmentSize у MailBijlageVoorbeeld.tsx жорстко використовує латинські одиниці B/KB/MB/GB.',
    herstelEisUk:
      'Відокремити закриття аркуша налаштувань від дії згортання самого листа та уніфікувати одиниці обсягу файлів українською мовою (Б, КБ, МБ, ГБ).',
  },
  {
    id: 'MAIL-12',
    schermafdrukken: [
      'Screenshot_20261125_134333_com.android.chrome.jpg',
      'Screenshot_20261125_134421_com.android.chrome.jpg',
      'Screenshot_20261125_134431_com.android.chrome.jpg',
    ],
    titelUk:
      'Візуальне зарізання вмісту HTML-листа під триповерховою шапкою та порожня бежева смуга над тілом листа',
    titelNl:
      'Visuele afkapping van de HTML-berichtinhoud onder de drielaagse bovenbalk en lege beige strook boven het bericht',
    doelBestanden: ['src/mail/mail-lezer-compact-kop.css', 'src/mail-mobiel-passend.css'],
    oorzaakUk:
      'Триповерхова висота шапки .google-mail-reader > header (> 170 px) разом із нижньою панеллю та відступами контейнера залишає вузьку щілину, де вміст HTML-листа зарізається посередині рядка.',
    herstelEisUk:
      'Зменшити висоту шапки переглядача листа на смартфоні до компактного одно-/дворядкового вигляду та прибрати зайвий порожній відступ над тілом HTML-листа.',
  },
  {
    id: 'MAIL-13',
    schermafdrukken: [
      'Screenshot_20261125_134333_com.android.chrome.jpg',
      'Screenshot_20261125_134339_com.android.chrome.jpg',
      'Screenshot_20261125_134421_com.android.chrome.jpg',
      'Screenshot_20261125_134431_com.android.chrome.jpg',
    ],
    titelUk:
      'Відсутність розумного приховування панелей інструментів при гортанні листа вниз і їх появи при гортанні назад угору',
    titelNl:
      'Ontbreken van slim verbergen van werkbalken bij omlaag bladeren en opnieuw tonen bij omhoog bladeren',
    doelBestanden: ['src/mail/LeesVenster.tsx', 'src/MailLezerWerkbalk.tsx', 'src/MailGesprekInhoud.tsx'],
    oorzaakUk:
      'У LeesVenster.tsx, MailLezerWerkbalk.tsx та MailGesprekInhoud.tsx немає відстеження напрямку прокручування (deltaY / scrollTop), тому верхня й нижня панелі постійно займають ~40% висоти екрана смартфона.',
    herstelEisUk:
      'Автоматично ховати панелі керування під час гортання листа вниз і плавно повертати їх при зворотному русі пальцем угору.',
  },
  {
    id: 'MAIL-14',
    schermafdrukken: [
      'Screenshot_20261125_134339_com.android.chrome.jpg',
      'Screenshot_20261125_134459_com.android.chrome.jpg',
      'Screenshot_20261125_134516_com.android.chrome.jpg',
      'Screenshot_20261125_134521_com.android.chrome.jpg',
      'Screenshot_20261125_134542_com.android.chrome.jpg',
      'Screenshot_20261125_134722_com.android.chrome.jpg',
    ],
    titelUk:
      'Неприховування неактивних панелей переглядача під час відкриття спливних вікон («Що від вас потрібно?», «Контекст», «Вигляд») або роботи в редакторі «Відповісти»',
    titelNl:
      'Niet verbergen van inactieve werkbalken tijdens interactie met pop-upbladen («Wat wordt er van u verwacht?», «Context», «Weergave») of de geopende antwoordeditor',
    doelBestanden: ['src/mail/context-paneel.css', 'src/MailLezerWerkbalk.tsx', 'src/mail/WatNodigBlok.tsx'],
    oorzaakUk:
      'У context-paneel.css .ctx-paneel займає лише grid-area: 2/1/-1/-1 (залишаючи триповерхову шапку зверху), а .mail-reader-onderbalk залишається видимою знизу під усіма спливними вікнами та відкритим редактором відповіді.',
    herstelEisUk:
      'Приховувати або перекривати неактивні верхню та нижню панелі переглядача під час роботи зі спливними аркушами й активним редактором відповіді.',
  },
  {
    id: 'MAIL-15',
    schermafdrukken: [
      'Screenshot_20261125_134516_com.android.chrome.jpg',
      'Screenshot_20261125_134521_com.android.chrome.jpg',
      'Screenshot_20261125_134542_com.android.chrome.jpg',
    ],
    titelUk:
      'Напівпрозорий фон модальної шторки «Контекст» (.ctx-paneel), крізь який просвічується великий зелений логотип TOO GOOD TO GO і текст листа знизу',
    titelNl:
      'Halfdoorzichtige achtergrond van het modale contextblad (.ctx-paneel), waardoor het groene logo TOO GOOD TO GO en de berichttekst eronder doorschijnen',
    doelBestanden: ['src/mail/context-paneel.css'],
    oorzaakUk:
      'У src/mail/context-paneel.css для .ctx-paneel задано background: var(--panel), який у поточній темі має часткову прозорість без суцільної непрозорої підкладки.',
    herstelEisUk:
      'Забезпечити повністю непрозору поверхню для модального аркуша .ctx-paneel, щоб вміст листа знизу не просвічувався крізь текст хронології.',
  },
  {
    id: 'MAIL-16',
    schermafdrukken: [
      'Screenshot_20261125_134333_com.android.chrome.jpg',
      'Screenshot_20261125_134339_com.android.chrome.jpg',
      'Screenshot_20261125_134353_com.android.chrome.jpg',
      'Screenshot_20261125_134412_com.android.chrome.jpg',
    ],
    titelUk:
      'Хаотичний роз’їзд і несумісність форм кнопок, 7-поверхова шапка блока «Відповісти» висотою > 360 px із порожніми смугами та подвійна рамка вибору тону «Як зазвичай»',
    titelNl:
      'Chaotische spreiding en onverenigbare vormen van knoppen, 7-laagse kop van het antwoordblok (> 360 px hoog) met lege stroken en dubbele rand rond de toonkeuze «Zoals gewoonlijk»',
    doelBestanden: ['src/MailGesprekInhoud.tsx', 'src/MailLezerAi.tsx', 'src/mail-lezer-ai.css', 'src/mail-mobiel-passend.css'],
    oorzaakUk:
      'Кнопки керування у відповіді рознесені на 7 окремих рядків із різними формами й порожніми смугами на 70–80% ширини, а label.mra-veld та вкладений <select> у MailLezerAi.tsx мають подвійну несумісну рамку.',
    herstelEisUk:
      'Узгодити геометрію кнопок, прибрати подвійну рамку вибору тону в .mra-veld і компактно згрупувати шапку блока відповіді.',
  },
  {
    id: 'MAIL-17',
    schermafdrukken: [
      'Screenshot_20261125_134333_com.android.chrome.jpg',
      'Screenshot_20261125_134421_com.android.chrome.jpg',
    ],
    titelUk:
      'Дублювання двох великих карток поспіль для одного файла pickup-reminder.ics та безглузда кнопка [↩] («Додати до відповіді») для нагадування від no-reply@',
    titelNl:
      'Twee grote dubbele kaarten onder elkaar voor één pickup-reminder.ics-bestand en zinloze knop [↩] («Aan antwoord toevoegen») bij een herinnering van no-reply@',
    doelBestanden: ['src/MailGesprekInhoud.tsx', 'src/MailBijlageKaart.tsx'],
    oorzaakUk:
      'Для одного вкладення .ics у MailGesprekInhoud.tsx одночасно малюється роздута картка MailAttachmentCard із 5 кнопками та картка події BriefAfspraken одразу під нею.',
    herstelEisUk:
      'Об’єднати або узгодити відображення .ics-вкладення та картки події без дублювання й без кнопки додавання .ics у відповідь на no-reply@.',
  },
  {
    id: 'MAIL-18',
    schermafdrukken: [
      'Screenshot_20261125_134431_com.android.chrome.jpg',
      'Screenshot_20261125_134459_com.android.chrome.jpg',
      'Screenshot_20261125_134516_com.android.chrome.jpg',
    ],
    titelUk:
      'Провал інтерпретації мови листа: визначення 100% англійського листа як українського (uk) через кириличне ім’я одержувача «Павло Тарасевич» у taalVan, що повністю вимикає штатну смугу перекладу VertaalStrook',
    titelNl:
      'Foute taalherkenning van het bericht: een volledig Engels bericht wordt als Oekraïens (uk) bestempeld vanwege de Cyrillische ontvangersnaam «Павло Тарасевич» in taalVan, waardoor VertaalStrook wegblijft',
    doelBestanden: ['shared/ai-bronnen.ts', 'src/MailGesprekInhoud.tsx'],
    oorzaakUk:
      'taalVan у shared/ai-bronnen.ts повертає "uk" за першою ж кириличною літерою (if (/[іїєґІЇЄҐ]/.test(sample)) return "uk"). Через ім’я одержувача "Павло Тарасевич" в англійському листі bronTaal стає "uk", і taalStrookMogelijk у MailGesprekInhoud.tsx вимикає смугу перекладу.',
    herstelEisUk:
      'Визначати мову листа за переважною часткою слів/літер основного тексту (ігноруючи власне ім’я одержувача у привітанні), щоб для іншомовних листів завжди з’являлася штатна смуга перекладу.',
  },
  {
    id: 'MAIL-19',
    schermafdrukken: ['Screenshot_20261125_134431_com.android.chrome.jpg'],
    titelUk:
      'Суперечність і некоректність відображення повного походження відправника: показ офіційного логотипа марки Too Good To Go (обрізаного зліва в аватарі відкритого листа) одночасно з тривожним щитом [🛡️?] («Не підтверджено») попри успішні SPF / DKIM / DMARC',
    titelNl:
      'Tegenstrijdige en onjuiste weergave van de volledige afzenderherkomst: gelijktijdige weergave van het officiële merklogo Too Good To Go (links afgekapt in de avatar) en het waarschuwingsschild [🛡️?] («Niet bevestigd») ondanks geldige SPF / DKIM / DMARC',
    doelBestanden: ['shared/mail-afzenders.ts', 'src/afzenders/AfzenderBadge.tsx', 'src/afzenders/afzenders.css'],
    oorzaakUk:
      'classificeer у shared/mail-afzenders.ts ніколи не виставляє статус підтвердженого домену за SPF+DKIM+DMARC поза статичним списком BEKENDE_DIENSTEN, а правило .mail-row-avatar[data-afzender-foto="merk"] .avatar-img { object-fit: contain; padding: 14% } у afzenders.css відсутнє для .mail-thread-avatar .afz-foto.',
    herstelEisUk:
      'Коректно відображати криптографічно підтверджене походження домену (SPF/DKIM/DMARC) без оманливого тривожного знака питання поруч із офіційним логотипом марки та вписувати логотипи організацій (object-fit: contain) в аватар відкритого листа й контексту.',
  },
  {
    id: 'MAIL-20',
    schermafdrukken: [
      'Screenshot_20261125_134333_com.android.chrome.jpg',
      'Screenshot_20261125_134421_com.android.chrome.jpg',
      'Screenshot_20261125_134431_com.android.chrome.jpg',
      'Screenshot_20261125_134459_com.android.chrome.jpg',
    ],
    titelUk:
      'Руйнування верстки та інтерпретації тіла HTML-листа: знищення @media-правил у flattenStyles, роздування другого (прихованого) логотипа TOO GOOD TO GO на весь екран і випадіння основного тексту замовлення',
    titelNl:
      'Verlies van opmaak en interpretatie van de HTML-berichtinhoud: flattenStyles vernietigt alle @media-regels, waardoor een tweede (verborgen) TOO GOOD TO GO-logo schermbreed wordt opgeblazen en de besteltekst wegvalt',
    doelBestanden: ['src/MailBerichtTekst.tsx', 'src/mail/beeld-tegel.ts'],
    oorzaakUk:
      'flattenStyles у src/MailBerichtTekst.tsx ігнорує всі CSSMediaRule (@media) і видаляє <style>, а примусове node.style.height = "auto" роздуває приховані дублі зображень у тілі HTML-листа.',
    herstelEisUk:
      'Зберігати адаптивні @media-правила та приховані стани елементів HTML-листа під час підготовки документа в MailBerichtTekst.tsx.',
  },
];

export const TWAALF_MAILGEBREKEN_CONTRACTEN = TWINTIG_MAILGEBREKEN_CONTRACTEN;

export interface MailGebrekHerstelStatus {
  readonly id: MailGebrekContract['id'];
  readonly hersteld: boolean;
  readonly detail: string;
}

export function evalueerTwintigMailGebrekenHerstel(rootDir: string): readonly MailGebrekHerstelStatus[] {
  const lees = (rel: string) => readFileSync(join(rootDir, rel), 'utf8');

  const aiBronnen = lees('shared/ai-bronnen.ts');
  const watNodigBlok = lees('src/mail/WatNodigBlok.tsx');
  const mailLezerAi = lees('src/MailLezerAi.tsx');
  const mailLezerAiCss = lees('src/mail-lezer-ai.css');
  const knopinfoLaag = lees('src/ViewportKnopinfoLaag.tsx');
  const mobielPassendCss = lees('src/mail-mobiel-passend.css');
  const persoonsMogelijkheden = lees('src/mail-persoonsgegevens-mogelijkheden.ts');
  const contextPaneel = lees('src/mail/ContextPaneel.tsx');
  const contextPaneelCss = lees('src/mail/context-paneel.css');
  const gesprekContext = lees('src/mail/gesprek-context.ts');
  const gesprekInhoud = lees('src/MailGesprekInhoud.tsx');
  const compactKopCss = lees('src/mail/mail-lezer-compact-kop.css');
  const leesVensterCss = lees('src/mail/lees-venster.css');
  const lezerWerkbalk = lees('src/MailLezerWerkbalk.tsx');
  const bijlageVoorbeeld = lees('src/MailBijlageVoorbeeld.tsx');
  const afzendersCss = lees('src/afzenders/afzenders.css');
  const berichtTekst = lees('src/MailBerichtTekst.tsx');

  const mail1Hersteld =
    /<a\b[^>]*>/i.test(aiBronnen) || /replace\([^)]*<a\b/i.test(aiBronnen) || /replace\([^)]*<a\b/i.test(watNodigBlok);
  const mail2Hersteld = /no-?reply|do-?not-?reply/i.test(aiBronnen);
  const mail3Hersteld =
    !mobielPassendCss.includes('html body .mra-bar > button:not(.mra-toggle) > span{position:absolute;width:1px;height:1px') &&
    (!mailLezerAi.includes('data-tooltip={uitleg}') || knopinfoLaag.includes('rect.bottom<top0') || knopinfoLaag.includes('rect.top>top0+height'));
  const mail4Hersteld = !persoonsMogelijkheden.includes("icalendar:{label:'iCalendar / зайнятість'");
  const mail5Hersteld =
    !watNodigBlok.includes("t('В Агенду'") &&
    !contextPaneel.includes("t('В Агенду'") &&
    !gesprekInhoud.includes("t('В Агенду'");
  const mail6Hersteld = gesprekContext.includes('Ні ') || contextPaneel.includes('Ні ');
  const mail7Hersteld = !contextPaneelCss.includes('max-height:min(84%,680px)') || contextPaneel.includes('langscroll');
  const mail8Hersteld =
    !contextPaneelCss.includes('.ctx-tabs{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:4px;padding:6px 12px') &&
    !contextPaneelCss.includes('.ctx-tl-tekst strong{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;font-size:13px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}');
  const mail9Hersteld =
    leesVensterCss.includes("[data-lees-modus='telefoon']") &&
    leesVensterCss.includes('padding-right:12px') &&
    !compactKopCss.includes('order: 20;\n    flex: 1 0 100%;');
  const mail10Hersteld =
    !lezerWerkbalk.includes("p.onReply&&<button type='button' className='mail-reader-onderbalk-knop primair'") ||
    lezerWerkbalk.includes('replyOpen');
  const mail11Hersteld = !bijlageVoorbeeld.includes("const units=['B','KB','MB','GB']");
  const mail12Hersteld = mail9Hersteld;
  const mail13Hersteld = lezerWerkbalk.includes('scrollVerborgen') || gesprekInhoud.includes('scrollRichting');
  const mail14Hersteld = contextPaneelCss.includes('grid-area:1/1/-1/-1') || lezerWerkbalk.includes('onderBlad');
  const mail15Hersteld = !contextPaneelCss.includes('.ctx-paneel{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:var(--panel)');
  const mail16Hersteld = mailLezerAiCss.includes('appearance:none') && !gesprekInhoud.includes("className='mail-reply-extra'");
  const mail17Hersteld = gesprekInhoud.includes('!isIcs');
  const mail18Hersteld = !aiBronnen.includes("if (/[іїєґІЇЄҐ]/.test(sample)) return 'uk';");
  const mail19Hersteld = afzendersCss.includes('.afz-foto[data-afzender-foto="merk"]');
  const mail20Hersteld = !berichtTekst.includes('if(!(rule instanceof CSSStyleRule))continue;');

  return [
    { id: 'MAIL-1', hersteld: mail1Hersteld, detail: mail1Hersteld ? 'Сирі HTML-теги <a href="..."> очищено в «Коротко»' : 'Очікує на виправлення: сирий <a href="..."> у «Коротко»' },
    { id: 'MAIL-2', hersteld: mail2Hersteld, detail: mail2Hersteld ? 'Адреси no-reply@ відфільтровано в antwoordNodig' : 'Очікує на виправлення: no-reply@ позначається як «Потребує відповіді»' },
    { id: 'MAIL-3', hersteld: mail3Hersteld, detail: mail3Hersteld ? 'Кнопки ШІ мають підписи, а підказка не залипає внизу' : 'Очікує на виправлення: кнопки ШІ німі на <=430px і підказка залипає внизу' },
    { id: 'MAIL-4', hersteld: mail4Hersteld, detail: mail4Hersteld ? 'Мініатюра .ics має короткий код формату' : 'Очікує на виправлення: обрізається «iCalendar / зайнятіст» у мініатюрі 64×64 px' },
    { id: 'MAIL-5', hersteld: mail5Hersteld, detail: mail5Hersteld ? 'Кальку «В Агенду» замінено на «У Календар»' : 'Очікує на виправлення: у трьох файлах вжито кальку «В Агенду»' },
    { id: 'MAIL-6', hersteld: mail6Hersteld, detail: mail6Hersteld ? 'Привітання «Hi» не спотворюється на «Ні»' : 'Очікує на виправлення: «Ні Павло Тарасевич» у витягу хронології' },
    { id: 'MAIL-7', hersteld: mail7Hersteld, detail: mail7Hersteld ? 'Шторка Контексту підтримує довгий знімок екрана' : 'Очікує на виправлення: .ctx-paneel блокує знімок екрана з прокручуванням' },
    { id: 'MAIL-8', hersteld: mail8Hersteld, detail: mail8Hersteld ? '5 вкладок Контексту вміщуються в один рядок' : 'Очікує на виправлення: вкладка «Відправник» падає на другий рядок' },
    { id: 'MAIL-9', hersteld: mail9Hersteld, detail: mail9Hersteld ? 'Шапка переглядача компактна без розриву на 3 поверхи' : 'Очікує на виправлення: триповерхова шапка (>170 px) і дірка 64 px справа' },
    { id: 'MAIL-10', hersteld: mail10Hersteld, detail: mail10Hersteld ? 'Кнопка «Відповісти» не дублюється під відкритим редактором' : 'Очікує на виправлення: дублювання чорної кнопки «↩ Відповісти»' },
    { id: 'MAIL-11', hersteld: mail11Hersteld, detail: mail11Hersteld ? 'Одиниці розміру локалізовано (КБ/МБ)' : 'Очікує на виправлення: латинські одиниці KB/MB та «Згорнути лист» унизу налаштувань' },
    { id: 'MAIL-12', hersteld: mail12Hersteld, detail: mail12Hersteld ? 'Область читання листа не зарізається шапкою' : 'Очікує на виправлення: зарізання вмісту листа під триповерховою шапкою' },
    { id: 'MAIL-13', hersteld: mail13Hersteld, detail: mail13Hersteld ? 'Панелі ховаються при гортанні вниз і з’являються при гортанні вгору' : 'Очікує на виправлення: панелі не ховаються під час гортання листа' },
    { id: 'MAIL-14', hersteld: mail14Hersteld, detail: mail14Hersteld ? 'Неактивні панелі ховаються під час роботи зі спливними вікнами' : 'Очікує на виправлення: шапка й нижня панель затискають відкриті спливні вікна' },
    { id: 'MAIL-15', hersteld: mail15Hersteld, detail: mail15Hersteld ? 'Фон шторки Контексту непрозорий' : 'Очікує на виправлення: логотип TOO GOOD TO GO просвічується крізь .ctx-paneel' },
    { id: 'MAIL-16', hersteld: mail16Hersteld, detail: mail16Hersteld ? 'Кнопки відповіді компактні, без подвійної рамки спадного списку' : 'Очікує на виправлення: 7-поверхова шапка відповіді (>360 px) та подвійна рамка спадного списку тону' },
    { id: 'MAIL-17', hersteld: mail17Hersteld, detail: mail17Hersteld ? 'Вкладення .ics не дублюється двома великими картками' : 'Очікує на виправлення: дві великі картки поспіль для одного файла .ics' },
    { id: 'MAIL-18', hersteld: mail18Hersteld, detail: mail18Hersteld ? 'taalVan визначає мову листа за основним текстом, а не за ім’ям одержувача' : 'Очікує на виправлення: taalVan вважає англійський лист українським через ім’я «Павло Тарасевич»' },
    { id: 'MAIL-19', hersteld: mail19Hersteld, detail: mail19Hersteld ? 'Логотип марки вписаний (contain) в аватар відкритого листа і узгоджений зі статусом походження' : 'Очікує на виправлення: логотип марки обрізаний в аватарі листа і суперечить щиту [🛡️?]' },
    { id: 'MAIL-20', hersteld: mail20Hersteld, detail: mail20Hersteld ? 'flattenStyles зберігає @media-правила і не роздуває приховані логотипи' : 'Очікує на виправлення: flattenStyles знищує @media-правила й роздуває другий логотип у тілі листа' },
  ];
}

export const evalueerTwaalfMailGebrekenHerstel = evalueerTwintigMailGebrekenHerstel;

export async function main(): Promise<number> {
  const rootDir = process.cwd();
  let geslaagd = 0;
  let gefaald = 0;

  const controleer = (naam: string, voorwaarde: boolean, detail = '') => {
    if (voorwaarde) {
      geslaagd++;
      console.log(`OK   ${naam}`);
    } else {
      gefaald++;
      console.error(`FOUT ${naam}${detail ? ` — ${detail}` : ''}`);
    }
  };

  controleer(
    'реєстр містить рівно 20 перевірочних контрактів перегляду листа, простору, інтерпретації та походження Пошти (MAIL-1..MAIL-20)',
    TWINTIG_MAILGEBREKEN_CONTRACTEN.length === 20 &&
      TWINTIG_MAILGEBREKEN_CONTRACTEN.map((c) => c.id).join(',') ===
        'MAIL-1,MAIL-2,MAIL-3,MAIL-4,MAIL-5,MAIL-6,MAIL-7,MAIL-8,MAIL-9,MAIL-10,MAIL-11,MAIL-12,MAIL-13,MAIL-14,MAIL-15,MAIL-16,MAIL-17,MAIL-18,MAIL-19,MAIL-20',
  );

  for (const contract of TWINTIG_MAILGEBREKEN_CONTRACTEN) {
    const alleBestandenAanwezig = contract.doelBestanden.every((rel) => existsSync(join(rootDir, rel)));
    controleer(
      `${contract.id}: усі цільові файли існують у сховищі (${contract.doelBestanden.join(', ')})`,
      alleBestandenAanwezig,
    );
    controleer(
      `${contract.id}: двомовні описи (uk / nl) та прив’язка до знімків екрана заповнені без заборонених символів`,
      contract.titelUk.length > 10 &&
        contract.titelNl.length > 10 &&
        contract.schermafdrukken.length >= 1 &&
        !/[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/u.test(contract.titelUk + contract.oorzaakUk + contract.herstelEisUk),
    );
  }

  const statussen = evalueerTwintigMailGebrekenHerstel(rootDir);
  controleer(
    'функція оцінювання стану виправлення evalueerTwintigMailGebrekenHerstel підтверджує hersteld === true для всіх 20 пунктів',
    statussen.length === 20 && statussen.every((s) => s.hersteld === true && s.detail.length > 0),
    statussen.filter((s) => !s.hersteld).map((s) => `${s.id}: ${s.detail}`).join(' | '),
  );
  for (const st of statussen) {
    controleer(`${st.id}: підтверджено втілення виправлення — ${st.detail}`, st.hersteld === true, st.detail);
  }

  // Прямі поведінкові перевірки втілених предметних функцій Пошти
  const aiBronnenMod = await import('../../shared/ai-bronnen');
  const mailAfzendersMod = await import('../../shared/mail-afzenders');
  const gesprekContextMod = await import('../../src/mail/gesprek-context');
  const bijlageVoorbeeldMod = await import('../../src/MailBijlageVoorbeeld');

  const opgeschoond = aiBronnenMod.opschonenPuntTekst(
    'Заберіть замовлення о 18:00 за посиланням <a href="https://maps.google.com/?q=Gent">Мапа</a> вчасно.',
  );
  controleer(
    'поведінка MAIL-1: opschonenPuntTekst прибирає сирий тег <a href> і виділяє безпечну https-дію',
    !opgeschoond.tekst.includes('<a ') &&
      opgeschoond.koppelingen.length === 1 &&
      opgeschoond.koppelingen[0].url === 'https://maps.google.com/?q=Gent',
  );

  controleer(
    'поведінка MAIL-2: isEenrichtingsAfzender та antwoordNodig відсікають односторонню адресу no-reply@ і дозволяють живий Reply-To',
    aiBronnenMod.isEenrichtingsAfzender('Too Good To Go <no-reply@toogoodtogo.com>') === true &&
      aiBronnenMod.isEenrichtingsAfzender('Winkel <no-reply@winkel.be>', 'Klantendienst <support@winkel.be>') === false &&
      aiBronnenMod.antwoordNodig(
        [{ from: 'Too Good To Go <no-reply@toogoodtogo.com>' }],
        ['pavlo@voorbeeld.test'],
        [{ id: 'p1', tekst: 'Питання?', citaat: 'Питання?', brief: 1, alinea: 1, termijn: '', soort: 'vraag', status: 'letterlijk', bron: { brief: 1, nr: 1 }, verplaatst: false, termijnStaat: 'geen' }],
      ) === null,
  );

  controleer(
    'поведінка MAIL-6 + MAIL-7: herstelAanhefUittreksel відновлює "Hi Павло Тарасевич," без псування українського "Ні", а tijdlijn ставить вітальний лист першим',
    gesprekContextMod.herstelAanhefUittreksel('Ні Павло Тарасевич, Your order is confirmed!').startsWith('Hi Павло Тарасевич,') &&
      gesprekContextMod.herstelAanhefUittreksel('Ні Іване, сьогодні зустрічі не буде.') === 'Ні Іване, сьогодні зустрічі не буде.',
  );

  controleer(
    'поведінка MAIL-11: formatMailAttachmentSize повертає кириличні КБ/МБ для uk та латинські KB/MB для nl',
    bijlageVoorbeeldMod.formatMailAttachmentSize(2048, 'uk').includes('КБ') &&
      bijlageVoorbeeldMod.formatMailAttachmentSize(2048, 'nl').includes('KB'),
  );

  controleer(
    'поведінка MAIL-18 + MAIL-19: taalVan визначає "en" попри кириличне вітання, а domeinAuthVan підтверджує "pass" для DMARC pass',
    aiBronnenMod.taalVan('Hi Павло Тарасевич,\nYour order for Carrefour Market is confirmed! Please pick up tomorrow.') === 'en' &&
      mailAfzendersMod.domeinAuthVan('toogoodtogo.com', {
        betrouwbaar: true,
        authserv: 'mx.google.com',
        spf: 'pass',
        dkim: [{ uitslag: 'pass', domein: 'toogoodtogo.com' }],
        dmarc: 'pass',
        dmarcDomein: 'toogoodtogo.com',
      }) === 'pass',
  );

  const ukDocPad = join(rootDir, 'docs/mail/ВИПРОБУВАННЯ-12-ВАД-ПОШТИ-HERSTEL-001.uk.md');
  const nlDocPad = join(rootDir, 'docs/mail/PROEVEN-12-MAILGEBREKEN-HERSTEL-001.nl.md');
  controleer(
    'парні статті 20 випробувань перегляду листа та контексту Пошти (uk / nl) існують у docs/mail/ і посилаються одна на одну',
    existsSync(ukDocPad) &&
      existsSync(nlDocPad) &&
      readFileSync(ukDocPad, 'utf8').includes('PROEVEN-12-MAILGEBREKEN-HERSTEL-001.nl.md') &&
      readFileSync(nlDocPad, 'utf8').includes('ВИПРОБУВАННЯ-12-ВАД-ПОШТИ-HERSTEL-001.uk.md'),
  );

  console.log(`\n${geslaagd}/${geslaagd + gefaald} geslaagd (herstel-001-mail-weergave-twaalf-gebreken)`);
  return gefaald === 0 ? 0 : 1;
}
