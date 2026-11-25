// HERSTEL-001 — Перевірочні випробування 12 вад перегляду листа та контексту Пошти (mail.tarasevych.com)
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
// так і функцію автоматичної оцінки виправлення кожного з 12 пунктів (MAIL-1..MAIL-12).

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
    | 'MAIL-12';
  readonly schermafdrukken: readonly string[];
  readonly titelUk: string;
  readonly titelNl: string;
  readonly doelBestanden: readonly string[];
  readonly oorzaakUk: string;
  readonly herstelEisUk: string;
}

export const TWAALF_MAILGEBREKEN_CONTRACTEN: readonly MailGebrekContract[] = [
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
];

export interface MailGebrekHerstelStatus {
  readonly id: MailGebrekContract['id'];
  readonly hersteld: boolean;
  readonly detail: string;
}

export function evalueerTwaalfMailGebrekenHerstel(rootDir: string): readonly MailGebrekHerstelStatus[] {
  const lees = (rel: string) => readFileSync(join(rootDir, rel), 'utf8');

  const aiBronnen = lees('shared/ai-bronnen.ts');
  const watNodigBlok = lees('src/mail/WatNodigBlok.tsx');
  const mailLezerAi = lees('src/MailLezerAi.tsx');
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

  // MAIL-1: чи очищуються сирі теги <a href="..."> у простих пунктах / Коротко
  const mail1Hersteld =
    /<a\b[^>]*>/i.test(aiBronnen) || /replace\([^)]*<a\b/i.test(aiBronnen) || /replace\([^)]*<a\b/i.test(watNodigBlok);

  // MAIL-2: чи відфільтровуються адреси no-reply@ / noreply@ у antwoordNodig
  const mail2Hersteld = /no-?reply|do-?not-?reply/i.test(aiBronnen);

  // MAIL-3: чи не ховаються підписи кнопок у .mra-bar і чи приховується ViewportKnopinfoLaag поза екраном
  const mail3Hersteld =
    !mobielPassendCss.includes('html body .mra-bar > button:not(.mra-toggle) > span{position:absolute;width:1px;height:1px') &&
    (!mailLezerAi.includes('data-tooltip={uitleg}') || knopinfoLaag.includes('rect.bottom<top0') || knopinfoLaag.includes('rect.top>top0+height'));

  // MAIL-4: чи не обрізається довгий підпис "iCalendar / зайнятість" у мініатюрі 64×64 px
  const mail4Hersteld = !persoonsMogelijkheden.includes("icalendar:{label:'iCalendar / зайнятість'");

  // MAIL-5: чи замінено кальку "В Агенду" на "У Календар" / "До Календаря"
  const mail5Hersteld =
    !watNodigBlok.includes("t('В Агенду'") &&
    !contextPaneel.includes("t('В Агенду'") &&
    !gesprekInhoud.includes("t('В Агенду'");

  // MAIL-6: чи виправляється спотворене "Ні " на початку привітання у витягу хронології
  const mail6Hersteld = gesprekContext.includes('Ні ') || contextPaneel.includes('Ні ');

  // MAIL-7: чи підтримує шторка Контексту langscroll / повне прокручування
  const mail7Hersteld = !contextPaneelCss.includes('max-height:min(84%,680px)') || contextPaneel.includes('langscroll');

  // MAIL-8: чи вміщуються 5 вкладок Контексту в один рядок і чи не обрізається назва події
  const mail8Hersteld =
    !contextPaneelCss.includes('.ctx-tabs{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:4px;padding:6px 12px') &&
    !contextPaneelCss.includes('.ctx-tl-tekst strong{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;font-size:13px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}');

  // MAIL-9: чи усунуто триповерховий розрив шапки й порожню дірку справа для режиму telefoon
  const mail9Hersteld =
    leesVensterCss.includes("[data-lees-modus='telefoon']") &&
    leesVensterCss.includes('padding-right:12px') &&
    !compactKopCss.includes('order: 20;\n    flex: 1 0 100%;');

  // MAIL-10: чи враховує нижня панель стан відкритого редактора відповіді
  const mail10Hersteld = !lezerWerkbalk.includes("p.onReply&&<button type='button' className='mail-reader-onderbalk-knop primair'") || lezerWerkbalk.includes('replyOpen');

  // MAIL-11: чи локалізовані одиниці КБ/МБ у formatMailAttachmentSize і чи відокремлено «Згорнути лист»
  const mail11Hersteld = !bijlageVoorbeeld.includes("const units=['B','KB','MB','GB']");

  // MAIL-12: чи зменшено висоту шапки переглядача на смартфоні
  const mail12Hersteld = mail9Hersteld;

  return [
    {
      id: 'MAIL-1',
      hersteld: mail1Hersteld,
      detail: mail1Hersteld
        ? 'Сирі HTML-теги <a href="..."> очищуються або перетворюються на посилання в розділі «Коротко»'
        : 'Очікує на виправлення: сирий HTML-тег <a href="...">Open in Maps</a> виводиться як текст у «Коротко»',
    },
    {
      id: 'MAIL-2',
      hersteld: mail2Hersteld,
      detail: mail2Hersteld
        ? 'Автоматичні адреси no-reply@ не позначаються як «Потребує відповіді»'
        : 'Очікує на виправлення: antwoordNodig у shared/ai-bronnen.ts не відфільтровує адреси no-reply@',
    },
    {
      id: 'MAIL-3',
      hersteld: mail3Hersteld,
      detail: mail3Hersteld
        ? 'Кнопки панелі ШІ мають зрозумілі підписи, а підказка data-tooltip не залипає внизу екрана'
        : 'Очікує на виправлення: кнопки ШІ німі на <=430px, а підказка mra-toggle залипає внизу екрана при прокрутці',
    },
    {
      id: 'MAIL-4',
      hersteld: mail4Hersteld,
      detail: mail4Hersteld
        ? 'Мініатюра .ics виводить короткий код формату без обрізання «iCalendar / зайнятіст»'
        : 'Очікує на виправлення: у мініатюрі 64×64 px обрізається рядок «iCalendar / зайнятість»',
    },
    {
      id: 'MAIL-5',
      hersteld: mail5Hersteld,
      detail: mail5Hersteld
        ? 'Усі кнопки додавання події використовують питому назву «У Календар»'
        : 'Очікує на виправлення: у трьох файлах пошти вжито нідерландську кальку «В Агенду»',
    },
    {
      id: 'MAIL-6',
      hersteld: mail6Hersteld,
      detail: mail6Hersteld
        ? 'Привітання «Hi» перед українським ім’ям не спотворюється на «Ні» у витягу хронології'
        : 'Очікує на виправлення: витяг листа в хронології показує «Ні Павло Тарасевич» замість «Hi Павло Тарасевич»',
    },
    {
      id: 'MAIL-7',
      hersteld: mail7Hersteld,
      detail: mail7Hersteld
        ? 'Шторка Контексту підтримує знімок екрана з прокручуванням і показує орієнтир попередніх листів'
        : 'Очікує на виправлення: модальний аркуш .ctx-paneel блокує знімок екрана з прокручуванням',
    },
    {
      id: 'MAIL-8',
      hersteld: mail8Hersteld,
      detail: mail8Hersteld
        ? 'Усі 5 вкладок Контексту стоять в одному рядку, а назва події не обрізається'
        : 'Очікує на виправлення: 5-та вкладка «Відправник» падає на другий рядок, а назва події обрізається',
    },
    {
      id: 'MAIL-9',
      hersteld: mail9Hersteld,
      detail: mail9Hersteld
        ? 'Верхня шапка переглядача листа компактна, без порожньої дірки справа і без розриву на 3 поверхи'
        : 'Очікує на виправлення: шапка розірвана на 3 поверхи (>170 px) із порожньою діркою 64 px справа',
    },
    {
      id: 'MAIL-10',
      hersteld: mail10Hersteld,
      detail: mail10Hersteld
        ? 'Кнопка «Відповісти» в нижній панелі не дублюється під час відкритого редактора відповіді'
        : 'Очікує на виправлення: чорна кнопка «↩ Відповісти» світиться внизу навіть під відкритим редактором відповіді',
    },
    {
      id: 'MAIL-11',
      hersteld: mail11Hersteld,
      detail: mail11Hersteld
        ? 'Одиниці розміру файлів локалізовано (КБ/МБ), а закриття налаштувань відокремлено від згортання листа'
        : 'Очікує на виправлення: formatMailAttachmentSize використовує латинські KB/MB, а «Згорнути лист» стоїть унизу налаштувань',
    },
    {
      id: 'MAIL-12',
      hersteld: mail12Hersteld,
      detail: mail12Hersteld
        ? 'Область читання HTML-листа має достатню висоту без зарізання під триповерховою шапкою'
        : 'Очікує на виправлення: триповерхова шапка зарізає область читання HTML-листа на смартфоні',
    },
  ];
}

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
    'реєстр містить рівно 12 перевірочних контрактів перегляду листа та контексту Пошти (MAIL-1..MAIL-12)',
    TWAALF_MAILGEBREKEN_CONTRACTEN.length === 12 &&
      TWAALF_MAILGEBREKEN_CONTRACTEN.map((c) => c.id).join(',') ===
        'MAIL-1,MAIL-2,MAIL-3,MAIL-4,MAIL-5,MAIL-6,MAIL-7,MAIL-8,MAIL-9,MAIL-10,MAIL-11,MAIL-12',
  );

  for (const contract of TWAALF_MAILGEBREKEN_CONTRACTEN) {
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
        !/[ЁёЪъЫыЭэ]/.test(contract.titelUk + contract.oorzaakUk + contract.herstelEisUk),
    );
  }

  const statussen = evalueerTwaalfMailGebrekenHerstel(rootDir);
  controleer(
    'функція оцінювання стану виправлення evalueerTwaalfMailGebrekenHerstel повертає звіти для всіх 12 пунктів',
    statussen.length === 12 && statussen.every((s) => typeof s.hersteld === 'boolean' && s.detail.length > 0),
  );

  const ukDocPad = join(rootDir, 'docs/mail/ВИПРОБУВАННЯ-12-ВАД-ПОШТИ-HERSTEL-001.uk.md');
  const nlDocPad = join(rootDir, 'docs/mail/PROEVEN-12-MAILGEBREKEN-HERSTEL-001.nl.md');
  controleer(
    'парні статті 12 випробувань перегляду листа та контексту Пошти (uk / nl) існують у docs/mail/ і посилаються одна на одну',
    existsSync(ukDocPad) &&
      existsSync(nlDocPad) &&
      readFileSync(ukDocPad, 'utf8').includes('PROEVEN-12-MAILGEBREKEN-HERSTEL-001.nl.md') &&
      readFileSync(nlDocPad, 'utf8').includes('ВИПРОБУВАННЯ-12-ВАД-ПОШТИ-HERSTEL-001.uk.md'),
  );

  console.log(`\n${geslaagd}/${geslaagd + gefaald} geslaagd (herstel-001-mail-weergave-twaalf-gebreken)`);
  return gefaald === 0 ? 0 : 1;
}
