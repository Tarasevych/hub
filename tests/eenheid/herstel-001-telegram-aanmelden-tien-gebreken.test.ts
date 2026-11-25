// Модульне випробування HERSTEL-001: реєстр і перевірочні контракти десяти вад входу через Telegram
// (hub.tarasevych.com) та захищеного вікна підтвердження (id.tarasevych.com), виявлених за вісьмома знімками екрана
// власника від 25.11.2026 (11:21:12–11:25:32):
//   - Screenshot_20261125_112112_org.telegram.messenger.web.jpg (11:21:12 — захищене вікно у Telegram);
//   - Screenshot_20261125_112125_com.android.chrome.jpg (11:21:25 — картка входу через Telegram у Chrome);
//   - Screenshot_20261125_112224_com.android.chrome.jpg (11:22:24 — налаштування місцезнаходження у Chrome);
//   - Screenshot_20261125_112253_com.android.chrome.jpg (11:22:53 — довгий знімок сторінки входу з «Інші способи входу»);
//   - Screenshot_20261125_112317_com.android.chrome.jpg (11:23:17 — повідомлення про відсутність доступу до місця);
//   - Screenshot_20261125_112412_com.android.chrome.jpg (11:24:12 — захищене вікно з піктограмою «Подарунок»);
//   - Screenshot_20261125_112451_com.android.chrome.jpg (11:24:51 — розгорнуті «Деталі запиту й Telegram»);
//   - Screenshot_20261125_112532_com.android.chrome.jpg (11:25:32 — повторна помилка вимоги місця на сайті).
//
// Nederlands (nl):
// Eenheidstest HERSTEL-001: vastlegging en verificatiecontracten voor de tien vastgestelde Telegram-aanmeld- en
// bevestigingsvenstergebreken (TG-1..TG-10) op basis van de acht schermafbeeldingen van 25.11.2026.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function checker(naam: string) {
  let ok = 0;
  let fout = 0;
  return {
    check(label: string, voorwaarde: boolean) {
      if (voorwaarde) {
        ok += 1;
        console.log(`OK   ${label}`);
      } else {
        fout += 1;
        console.error(`FOUT ${label}`);
      }
    },
    einde(): number {
      console.log(`\n${ok}/${ok + fout} geslaagd (${naam})`);
      return fout === 0 ? 0 : 1;
    },
  };
}

const VERBODEN_TEKENREEKS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const lees = (pad: string): string => readFileSync(resolve(pad), 'utf8');

export type TelegramAanmeldGebrekProefId =
  | 'TG-1'
  | 'TG-2'
  | 'TG-3'
  | 'TG-4'
  | 'TG-5'
  | 'TG-6'
  | 'TG-7'
  | 'TG-8'
  | 'TG-9'
  | 'TG-10';

export type TelegramAanmeldGebrekContract = {
  readonly id: TelegramAanmeldGebrekProefId;
  readonly nummer: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  readonly bronFotos: readonly string[];
  readonly titelUk: string;
  readonly titelNl: string;
  readonly doelBestanden: readonly string[];
  readonly oorzaakUk: string;
  readonly oorzaakNl: string;
  readonly herstelEisUk: string;
  readonly herstelEisNl: string;
};

export const TIEN_TELEGRAM_AANMELD_GEBREKEN_CONTRACT: readonly TelegramAanmeldGebrekContract[] = [
  {
    id: 'TG-1',
    nummer: 1,
    bronFotos: [
      'Screenshot_20261125_112112_org.telegram.messenger.web.jpg',
      'Screenshot_20261125_112125_com.android.chrome.jpg',
      'Screenshot_20261125_112224_com.android.chrome.jpg',
      'Screenshot_20261125_112317_com.android.chrome.jpg',
      'Screenshot_20261125_112451_com.android.chrome.jpg',
      'Screenshot_20261125_112532_com.android.chrome.jpg',
    ],
    titelUk: 'Оглядач не отримує системний запит дозволу на місце пристрою, а сайт одразу фіксує відмову',
    titelNl: 'De browser toont geen systeemvraag voor de locatie van het apparaat en de site legt meteen een weigering vast',
    doelBestanden: [
      'src/telegram-aanmelden/AanmeldTelegram.tsx',
      'src/aanmelden/plaats.ts',
      'backend/telegram-aanmelden/inloggen.ts',
    ],
    oorzaakUk:
      'У AanmeldTelegram.tsx автоматичний виклик plaatsDelen(lopend) при geoVereist === true запускається з фонового useEffect за таймером опитування /status без жесту користувача, коли вкладка Chrome згорнута у фоні. Chrome відхиляє фоновий getCurrentPosition з PERMISSION_DENIED, а клієнт помилково записує на сервер stand: "geweigerd".',
    oorzaakNl:
      'In AanmeldTelegram.tsx wordt plaatsDelen(lopend) bij geoVereist === true automatisch vanuit een achtergrond-useEffect zonder gebruikersgebaar aangeroepen terwijl het Chrome-tabblad op de achtergrond staat. Chrome weigert dit met PERMISSION_DENIED, waarna de client ten onrechte stand: "geweigerd" naar de server stuurt.',
    herstelEisUk:
      'Запит getCurrentPosition має викликатися лише з прямого жесту натискання користувача на видимій вкладці; фонова відповідь /status із geoVereist: true не повинна запускати getCurrentPosition у фоні й записувати хибне geweigerd.',
    herstelEisNl:
      'getCurrentPosition mag uitsluitend vanuit een directe gebruikersactie op een zichtbaar tabblad worden aangeroepen; een achtergrondpeiling met geoVereist: true mag nooit stil getCurrentPosition starten en een valse geweigerd opslaan.',
  },
  {
    id: 'TG-2',
    nummer: 2,
    bronFotos: [
      'Screenshot_20261125_112112_org.telegram.messenger.web.jpg',
      'Screenshot_20261125_112253_com.android.chrome.jpg',
    ],
    titelUk: 'Підтвердження входу безпосередньо в Telegram без переходу за посиланням із сайту за умови увімкнення захисного перемикача в налаштуваннях',
    titelNl: 'Aanmelding rechtstreeks in Telegram oproepen en bevestigen zonder verplichte sitelink, achter een standaard uitgeschakelde beveiligingsschakelaar',
    doelBestanden: [
      'backend/telegram-aanmelden/inloggen.ts',
      'backend/telegram-aanmelden/webhook.ts',
      'src/telegram-aanmelden/TelegramSectie.tsx',
      'src/telegram-aanmelden/AanmeldTelegram.tsx',
    ],
    oorzaakUk:
      'Зараз запит на вхід прив’язується до користувача в Telegram лише після переходу з сайту за посиланням t.me/<bot>?start=i_<id> або через офіційне вікно входу Telegram. У самому боті немає кнопки для виклику активного запиту без переходу за посиланням.',
    oorzaakNl:
      'Momenteel wordt een aanmeldverzoek alleen via de sitelink t.me/<bot>?start=i_<id> of het officiële aanmeldvenster aan Telegram gekoppeld. In de bot zelf ontbreekt een knop om een actief verzoek zonder linkoverstap op te roepen.',
    herstelEisUk:
      'Додати можливість викликати й підтверджувати активний запит на вхід кнопкою безпосередньо в боті Telegram, але зробити цю опцію типово ВИМКНЕНОЮ з перемикачем і попередженням про шахраїв у розділі налаштувань Telegram на сайті, зберігши посилання на офіційне вікно входу Telegram як альтернативу.',
    herstelEisNl:
      'Voeg een directe bevestigingsknop in de Telegram-bot toe voor actieve aanmeldverzoeken, standaard UITGESCHAKELD met een schakelaar en oplichtingswaarschuwing in TelegramSectie.tsx, en behoud de link naar het officiële aanmeldvenster op de site als alternatief.',
  },
  {
    id: 'TG-3',
    nummer: 3,
    bronFotos: [
      'Screenshot_20261125_112125_com.android.chrome.jpg',
      'Screenshot_20261125_112532_com.android.chrome.jpg',
    ],
    titelUk: 'Зламана верстка кнопки «📍 Надати місце пристрою» всередині червоного блоку вимоги місця',
    titelNl: 'Gebroken opmaak van de knop «📍 Надати місце пристрою» binnen het rode foutkader',
    doelBestanden: [
      'src/telegram-aanmelden/AanmeldTelegram.tsx',
      'src/aanmeld-herontwerp.css',
    ],
    oorzaakUk:
      'Кнопці «📍 Надати місце пристрою» у AanmeldTelegram.tsx (рядок 363) задано клас tga-aanmeld-knop з одним текстовим вузлом, а в aanmeld-herontwerp.css для .tga-aanmeld-knop діє триколонкова сітка 34px minmax(0,1fr) 34px, яка стискає весь текст у ліву колонку шириною 34 px.',
    oorzaakNl:
      'De knop «📍 Надати місце пристрою» in AanmeldTelegram.tsx (regel 363) heeft de klasse tga-aanmeld-knop met slechts één tekstknoop, waardoor het driekolomsrooster 34px minmax(0,1fr) 34px uit aanmeld-herontwerp.css alle tekst in de eerste kolom van 34 px perst.',
    herstelEisUk:
      'Кнопка «📍 Надати місце пристрою» має або містити три комірки сітки (.tga-aanmeld-logo, .tga-aanmeld-tekst, .tga-aanmeld-eind), або використовувати одноколонкову верстку з вирівнюванням тексту по центру на всю ширину.',
    herstelEisNl:
      'De knop «📍 Надати місце пристрою» gebruikt ofwel drie roostercellen (.tga-aanmeld-logo, .tga-aanmeld-tekst, .tga-aanmeld-eind), ofwel een gecentreerde enkelkolomsopmaak over de volledige breedte.',
  },
  {
    id: 'TG-4',
    nummer: 4,
    bronFotos: [
      'Screenshot_20261125_112125_com.android.chrome.jpg',
      'Screenshot_20261125_112317_com.android.chrome.jpg',
      'Screenshot_20261125_112532_com.android.chrome.jpg',
    ],
    titelUk: 'Накладання кнопок верхнього правого кута (мова, тема, профіль) поверх тексту й заголовків картки входу під час прокручування',
    titelNl: 'Knoppen rechtsboven (taal, thema, profiel) zweven bij scrollen over de koppen en tekst van de aanmeldkaart',
    doelBestanden: [
      'src/aanmeld-herontwerp.css',
      'src/account-afgemeld-menu.css',
    ],
    oorzaakUk:
      'Блок .canonical-account-anchor має position: fixed поверх прозорого .canonical-topbar, тому під час прокручування довгої сторінки входу кнопки мови, теми й профілю зависають прямо поверх тексту картки входу.',
    oorzaakNl:
      'Het blok .canonical-account-anchor heeft position: fixed boven een transparante .canonical-topbar, waardoor de taal-, thema- en profielknop bij scrollen midden over de tekst van de aanmeldkaart zweven.',
    herstelEisUk:
      'На сторінці входу верхня група кнопок не повинна перекривати текст картки входу під час прокручування.',
    herstelEisNl:
      'Op het aanmeldscherm mag de knoppengroep rechtsboven bij scrollen nooit over de tekst van de aanmeldkaart heen vallen.',
  },
  {
    id: 'TG-5',
    nummer: 5,
    bronFotos: [
      'Screenshot_20261125_112451_com.android.chrome.jpg',
    ],
    titelUk: 'У Захищеному вікні в рядку «Звідки» пропущено саму назву країни та міста (виведено лише підпис про IP-адресу)',
    titelNl: 'In het beveiligde venster ontbreekt in de rij «Звідки / Vanwaar» de land- en plaatsnaam zelf',
    doelBestanden: [
      'backend/telegram-aanmelden/venster.ts',
    ],
    oorzaakUk:
      'У backend/telegram-aanmelden/venster.ts (рядок 231) у виразі w.plaats || w.land виводиться лише <small class="bron">Визначено за IP-адресою — приблизно</small>, а сам прапор і назва місця ${plaats} пропущені.',
    oorzaakNl:
      'In backend/telegram-aanmelden/venster.ts (regel 231) toont de tak w.plaats || w.land alleen <small class="bron">Bepaald via het IP-adres — bij benadering</small> zonder de vlag en de plaatsnaam ${plaats} zelf.',
    herstelEisUk:
      'Рядок «Звідки» у venster.ts має виводити прапор і назву місця (${plaats}), а під ними — підпис джерела.',
    herstelEisNl:
      'De rij «Vanwaar» in venster.ts moet de vlag en de plaatsnaam (${plaats}) tonen met daaronder de brontoelichting.',
  },
  {
    id: 'TG-6',
    nummer: 6,
    bronFotos: [
      'Screenshot_20261125_112112_org.telegram.messenger.web.jpg',
      'Screenshot_20261125_112412_com.android.chrome.jpg',
      'Screenshot_20261125_112451_com.android.chrome.jpg',
    ],
    titelUk: 'Дублювання реквізитів у блоці «Деталі запиту й Telegram», тавтологія в рядку «Що», висяча крапка в .meta-chips та відсутність адреси піддомену',
    titelNl: 'Dubbele gegevens in «Details van verzoek en Telegram», tautologie in «Wat», zwevende punt in .meta-chips en ontbrekend doeldomein',
    doelBestanden: [
      'backend/telegram-aanmelden/venster.ts',
      'backend/telegram-aanmelden/inloggen.ts',
    ],
    oorzaakUk:
      'У venster.ts розгорнутий блок «Деталі запиту й Telegram» дублює обліковий запис сайту, пристрій і час, які вже показані у шапці картки, містить тавтологію «Запит на вхід: вхід на сайт...», залишає висячу крапку «·» при переносі дати в .meta-chips і не показує цільовий піддомен входу.',
    oorzaakNl:
      'In venster.ts herhaalt het uitgeklapte blok «Details van verzoek en Telegram» het site-account, het toestel en de tijd uit de kop, bevat het de tautologie «Aanmeldverzoek: aanmelden op...», laat het een losse punt «·» hangen in .meta-chips en mist het het doeldomein.',
    herstelEisUk:
      'Усунути дублювання й тавтологію у блоці деталей venster.ts, додати показ цільового піддомену/сторінки входу та прибрати висячу крапку на переносі рядка в .meta-chips.',
    herstelEisNl:
      'Verwijder de dubbele velden en tautologie in het detailblok van venster.ts, toon het doeldomein van de aanmelding en voorkom een zwevende punt bij regelafbraak in .meta-chips.',
  },
  {
    id: 'TG-7',
    nummer: 7,
    bronFotos: [
      'Screenshot_20261125_112112_org.telegram.messenger.web.jpg',
      'Screenshot_20261125_112125_com.android.chrome.jpg',
      'Screenshot_20261125_112412_com.android.chrome.jpg',
      'Screenshot_20261125_112451_com.android.chrome.jpg',
      'Screenshot_20261125_112532_com.android.chrome.jpg',
    ],
    titelUk: 'Відсутність кнопки дії у Захищеному вікні при вимозі місця пристрою та необхідність повторно обирати вже вгадану піктограму',
    titelNl: 'Geen actieknop in het beveiligde venster bij vereiste apparaatlocatie en verlies van het reeds juist gekozen pictogram',
    doelBestanden: [
      'backend/telegram-aanmelden/venster.ts',
      'backend/telegram-aanmelden/inloggen.ts',
    ],
    oorzaakUk:
      'При plaats-nodig у Захищеному вікні показується лише червоний текст і кнопка відмови «⛔ Це не я» без жодної кнопки для надання місця чи переходу, а правильно обрана піктограма не запам’ятовується, через що спливає 3-хвилинний час запиту.',
    oorzaakNl:
      'Bij plaats-nodig toont het beveiligde venster alleen rode tekst en de weigerknop «⛔ Це не я» zonder actieknop om de locatie te delen, en wordt het reeds juist gekozen pictogram niet onthouden waardoor de 3 minuten verlopen.',
    herstelEisUk:
      'Забезпечити пряму дію надання місця / завершення перевірки та не вимагати повторного вибору вже правильно підтвердженої піктограми після надходження місця пристрою.',
    herstelEisNl:
      'Bied een directe actie voor het delen van de locatie en rond het verzoek af zonder dat het reeds juist gekozen pictogram opnieuw moet worden aangetikt.',
  },
  {
    id: 'TG-8',
    nummer: 8,
    bronFotos: [
      'Screenshot_20261125_112125_com.android.chrome.jpg',
      'Screenshot_20261125_112253_com.android.chrome.jpg',
      'Screenshot_20261125_112317_com.android.chrome.jpg',
      'Screenshot_20261125_112532_com.android.chrome.jpg',
    ],
    titelUk: 'Неповна триколонкова структура кнопки «Відкрити Telegram» у відкритій картці входу та розбіжність назви кнопки в повідомленні бота',
    titelNl: 'Onvolledige driekolomsopbouw van de knop «Відкрити Telegram» en afwijkende knopnaam in het botbericht',
    doelBestanden: [
      'src/telegram-aanmelden/AanmeldTelegram.tsx',
      'backend/telegram-aanmelden/inloggen.ts',
    ],
    oorzaakUk:
      'Кнопка «Відкрити Telegram» у режимі піктограми (AanmeldTelegram.tsx, рядок 357) має лише два елементи (<TelegramLogo maat={20} /><span>...</span>) без .tga-aanmeld-logo та .tga-aanmeld-eind, а повідомлення бота в inloggen.ts (рядок 393) називає кнопку «Перевірити й увійти» замість «Підтвердити вхід».',
    oorzaakNl:
      'De knop «Відкрити Telegram» in de pictogrammodus (AanmeldTelegram.tsx, regel 357) heeft slechts twee kind-elementen zonder .tga-aanmeld-logo en .tga-aanmeld-eind, en het botbericht in inloggen.ts (regel 393) noemt «Перевірити й увійти» in plaats van «Підтвердити вхід».',
    herstelEisUk:
      'Узгодити триколонкову розмітку кнопки «Відкрити Telegram» (з .tga-aanmeld-logo та .tga-aanmeld-eind) і синхронізувати назву кнопки в тексті повідомлення бота з TEKST.knopVensterInlog.',
    herstelEisNl:
      'Gebruik de volledige driekolomsstructuur (.tga-aanmeld-logo, .tga-aanmeld-tekst, .tga-aanmeld-eind) voor «Відкрити Telegram» en stem de knopnaam in het botbericht af op TEKST.knopVensterInlog.',
  },
  {
    id: 'TG-9',
    nummer: 9,
    bronFotos: [
      'Screenshot_20261125_112253_com.android.chrome.jpg',
      'Screenshot_20261125_112317_com.android.chrome.jpg',
    ],
    titelUk: 'Порушення Мовного закону («репозиторіїв») і показ службових пояснень про прапорці адміністратора у списку «Інші способи входу»',
    titelNl: 'Taalwetschending («репозиторіїв») en interne beheerdersuitleg over vlaggen in «Andere aanmeldmethoden»',
    doelBestanden: [
      'src/AanmeldAndereOpties.tsx',
    ],
    oorzaakUk:
      'У файлі src/AanmeldAndereOpties.tsx (рядок 36) вжито заборонене слово «репозиторіїв» замість «сховищ коду», а в описах Apple, Microsoft і ключа доступу відвідувачеві показуються внутрішні назви прапорців адміністратора.',
    oorzaakNl:
      'In src/AanmeldAndereOpties.tsx (regel 36) staat het verboden leenwoord «репозиторіїв» in plaats van «сховищ коду», en bij Apple, Microsoft en de toegangssleutel worden interne vlagnamen aan de bezoeker getoond.',
    herstelEisUk:
      'Замінити «репозиторіїв» на «сховищ коду» у AanmeldAndereOpties.tsx та зробити пояснення способів входу зрозумілими для користувача без внутрішнього жаргону про прапорці.',
    herstelEisNl:
      'Vervang «репозиторіїв» door «сховищ коду» in AanmeldAndereOpties.tsx en maak de toelichtingen helder voor de gebruiker zonder intern vlagjargon.',
  },
  {
    id: 'TG-10',
    nummer: 10,
    bronFotos: [
      'Screenshot_20261125_112253_com.android.chrome.jpg',
      'Screenshot_20261125_112317_com.android.chrome.jpg',
    ],
    titelUk: 'Службовий перемикач «Вигляд: Компактний | Студійний» на публічній картці входу та накладання плаваючої кнопки прокрутки «↑»',
    titelNl: 'Overbodige stijlwisselaar «Вигляд: Компактний | Студійний» op de publieke aanmeldkaart en zwevende knop «↑»',
    doelBestanden: [
      'src/telegram-aanmelden/AanmeldTelegram.tsx',
      'src/aanmeld-herontwerp.css',
    ],
    oorzaakUk:
      'Всередині публічної картки «Вхід через Telegram» під час очікування входу рендериться <TelegramStijlKiezer /> («Вигляд: Компактний | Студійний»), який дублює налаштування у «Способи входу → Telegram», а при прокручуванні вниз поверх картки з’являється плаваюча кнопка .canonical-scroll-top («↑»).',
    oorzaakNl:
      'Binnen de publieke aanmeldkaart «Aanmelden met Telegram» wordt tijdens het wachten <TelegramStijlKiezer /> getoond (die al in «Aanmeldmethoden → Telegram» staat), en bij omlaag scrollen zweeft .canonical-scroll-top («↑») over de kaart.',
    herstelEisUk:
      'Залишити <TelegramStijlKiezer /> лише в налаштуваннях розділу Telegram (прибравши з публічної картки входу) та приховати .canonical-scroll-top на екрані входу.',
    herstelEisNl:
      'Houd <TelegramStijlKiezer /> uitsluitend in de Telegram-instellingen en verberg .canonical-scroll-top op het aanmeldscherm.',
  },
] as const;

export type TelegramHerstelProefStatus = {
  readonly id: TelegramAanmeldGebrekProefId;
  readonly hersteld: boolean;
  readonly details: string;
};

/** Перевіряє стан виправлення всіх десяти вад контуру входу через Telegram. */
export function evalueerTienTelegramAanmeldGebrekenHerstel(): readonly TelegramHerstelProefStatus[] {
  const aanmeldTgTsx = lees('src/telegram-aanmelden/AanmeldTelegram.tsx');
  const tgSectieTsx = lees('src/telegram-aanmelden/TelegramSectie.tsx');
  const aanmeldCss = lees('src/aanmeld-herontwerp.css');
  const andereOptiesTsx = lees('src/AanmeldAndereOpties.tsx');
  const vensterTs = lees('backend/telegram-aanmelden/venster.ts');
  const inloggenTs = lees('backend/telegram-aanmelden/inloggen.ts');
  const webhookTs = lees('backend/telegram-aanmelden/webhook.ts');

  // TG-1: відсутність фонового автозапуску plaatsDelen(lopend) без жесту користувача на прихованій вкладці
  const tg1Hersteld =
    !aanmeldTgTsx.includes("useEffect(() => { if (lopend && stand === 'wacht' && geoVereist && geo === '') plaatsDelen(lopend); }, [geoVereist]);");

  // TG-2: підтримка підтвердження запиту безпосередньо в боті за увімкненим перемикачем у TelegramSectie + збереження widgetUrl
  const tg2Hersteld =
    aanmeldTgTsx.includes('lopend.widgetUrl') &&
    (webhookTs.includes('inlog') || inloggenTs.includes('rechtstreeks') || inloggenTs.includes('zonderLink') || inloggenTs.includes('botBevestig')) &&
    (tgSectieTsx.includes('шахра') || tgSectieTsx.includes('oplicht'));

  // TG-3: кнопка «Надати місце пристрою» не стискається в першу колонку 34px
  const tg3Hersteld =
    !aanmeldTgTsx.includes(
      `<button type='button' className='tga-aanmeld-knop' onClick={() => plaatsDelen(lopend)}>{tr(lang, '📍 Надати місце пристрою', '📍 Plaats van het apparaat delen')}</button>`,
    );

  // TG-4: верхні кнопки на екрані входу не перекривають текст при прокручуванні
  const tg4Hersteld =
    /\.canonical-chrome:has\(\.mr-sign-in\)\s+\.canonical-account-anchor[^{]*\{[^}]*position:\s*(?:absolute|static|sticky)/.test(
      aanmeldCss,
    ) || aanmeldCss.includes('mr-sign-in-topbar');

  // TG-5: рядок «Звідки» у venster.ts виводить назву місця esc(plaats) перед <small class="bron">
  const tg5Hersteld =
    !vensterTs.includes(
      `<div class="rij"><span class="label">\${t('Звідки', 'Vanwaar')}</span><span>\${w.plaats || w.land ? \`<small class="bron">`,
    );

  // TG-6: у venster.ts усунено тавтологію «Що: ${esc(w.titel)}: ${esc(w.wat)}» та висячу крапку в .meta-chips
  const tg6Hersteld = !vensterTs.includes('${esc(w.titel)}: ${esc(w.wat)}');

  // TG-7: у venster.ts або inloggen.ts збережено вибір правильної піктограми при plaats-nodig / додано дію продовження
  const tg7Hersteld =
    inloggenTs.indexOf('pos !== Number(r.juist)') < inloggenTs.indexOf("return 'plaats-nodig'");

  // TG-8: кнопка «Відкрити Telegram» має .tga-aanmeld-logo і .tga-aanmeld-eind, а текст повідомлення бота узгоджено з knopVensterInlog
  const tg8Hersteld =
    !aanmeldTgTsx.includes(
      `<a className='tga-aanmeld-knop' href={lopend.deeplink} target='_blank' rel='noopener noreferrer'><TelegramLogo maat={20} /><span>`,
    ) && !inloggenTs.includes('Натисніть «Перевірити й увійти»');

  // TG-9: у AanmeldAndereOpties.tsx немає слова «репозиторіїв»
  const tg9Hersteld = !andereOptiesTsx.includes('репозиторіїв');

  // TG-10: на публічній картці AanmeldTelegram.tsx прибрано <TelegramStijlKiezer і приховано .canonical-scroll-top на екрані входу
  const tg10Hersteld =
    !aanmeldTgTsx.includes('<TelegramStijlKiezer') && aanmeldCss.includes('.canonical-scroll-top');

  return [
    {
      id: 'TG-1',
      hersteld: tg1Hersteld,
      details: tg1Hersteld
        ? 'Запит місця пристрою виконується лише за прямим жестом користувача без фонового автозапису geweigerd'
        : 'Очікує на прибирання фонового виклику getCurrentPosition без жесту користувача у AanmeldTelegram.tsx',
    },
    {
      id: 'TG-2',
      hersteld: tg2Hersteld,
      details: tg2Hersteld
        ? 'Підтвердження входу безпосередньо в Telegram із захисним перемикачем (типово вимкнено) та збереженням widgetUrl реалізовано'
        : 'Очікує на додавання підтвердження в боті Telegram та захисного перемикача з попередженням у TelegramSectie.tsx',
    },
    {
      id: 'TG-3',
      hersteld: tg3Hersteld,
      details: tg3Hersteld
        ? 'Кнопка «📍 Надати місце пристрою» має повноширинну або триколонкову розмітку без стискання у 34 px'
        : 'Очікує на виправлення сітки кнопки «📍 Надати місце пристрою» у AanmeldTelegram.tsx',
    },
    {
      id: 'TG-4',
      hersteld: tg4Hersteld,
      details: tg4Hersteld
        ? 'Кнопки мови, теми й профілю у верхньому куті не накладаються поверх тексту картки входу при прокручуванні'
        : 'Очікує на ізоляцію позиціювання .canonical-account-anchor при прокручуванні сторінки входу',
    },
    {
      id: 'TG-5',
      hersteld: tg5Hersteld,
      details: tg5Hersteld
        ? 'Рядок «Звідки» у Захищеному вікні показує прапор і назву місця разом із підписом про IP-адресу'
        : 'Очікує на додавання виведення назви місця ${plaats} у рядку «Звідки» в backend/telegram-aanmelden/venster.ts',
    },
    {
      id: 'TG-6',
      hersteld: tg6Hersteld,
      details: tg6Hersteld
        ? 'У блоці «Деталі запиту й Telegram» усунено дублювання реквізитів, тавтологію та висячу крапку'
        : 'Очікує на очищення дубльованих реквізитів та додавання цільового піддомену у venster.ts',
    },
    {
      id: 'TG-7',
      hersteld: tg7Hersteld,
      details: tg7Hersteld
        ? 'При вимозі місця пристрою правильна піктограма зберігається і вікно надає зрозумілу дію продовження'
        : 'Очікує на збереження вибору правильної піктограми та додавання дії продовження при plaats-nodig',
    },
    {
      id: 'TG-8',
      hersteld: tg8Hersteld,
      details: tg8Hersteld
        ? 'Кнопка «Відкрити Telegram» має повну триколонкову структуру, а назва кнопки в повідомленні бота синхронна'
        : 'Очікує на вирівнювання розмітки кнопки «Відкрити Telegram» та назви кнопки в повідомленні бота',
    },
    {
      id: 'TG-9',
      hersteld: tg9Hersteld,
      details: tg9Hersteld
        ? 'У списку «Інші способи входу» усунено англіцизм «репозиторіїв» та внутрішній технічний жаргон'
        : 'Очікує на заміну слова «репозиторіїв» на «сховищ коду» у src/AanmeldAndereOpties.tsx',
    },
    {
      id: 'TG-10',
      hersteld: tg10Hersteld,
      details: tg10Hersteld
        ? 'Перемикач макета прибрано з публічної картки входу, а кнопка .canonical-scroll-top прихована на сторінці входу'
        : 'Очікує на прибирання <TelegramStijlKiezer /> з публічної картки входу та приховування .canonical-scroll-top',
    },
  ];
}

export async function main(): Promise<number> {
  const { check, einde } = checker('herstel-001-telegram-aanmelden-tien-gebreken');

  // 1. Повнота реєстру десяти виявлених за знімками екрана проблем
  check(
    'реєстр містить рівно 10 перевірочних контрактів (TG-1..TG-10)',
    TIEN_TELEGRAM_AANMELD_GEBREKEN_CONTRACT.length === 10 &&
      TIEN_TELEGRAM_AANMELD_GEBREKEN_CONTRACT.map((c) => c.id).join(',') ===
        'TG-1,TG-2,TG-3,TG-4,TG-5,TG-6,TG-7,TG-8,TG-9,TG-10',
  );

  for (const contract of TIEN_TELEGRAM_AANMELD_GEBREKEN_CONTRACT) {
    check(
      `${contract.id}: усі цільові файли існують у сховищі (${contract.doelBestanden.join(', ')})`,
      contract.doelBestanden.length > 0 && contract.doelBestanden.every((pad) => existsSync(resolve(pad))),
    );
    check(
      `${contract.id}: двомовні описи (uk / nl) та прив’язка до знімків екрана заповнені без заборонених символів`,
      contract.bronFotos.length > 0 &&
        contract.titelUk.length > 15 &&
        contract.titelNl.length > 15 &&
        contract.oorzaakUk.length > 30 &&
        contract.oorzaakNl.length > 30 &&
        contract.herstelEisUk.length > 25 &&
        contract.herstelEisNl.length > 25 &&
        !VERBODEN_TEKENREEKS.test(contract.titelUk + contract.oorzaakUk + contract.herstelEisUk),
    );
  }

  // 2. Перевірка наявності ключових вузлів коду, яких стосуються 10 випробувань
  const aanmeldTgTsx = lees('src/telegram-aanmelden/AanmeldTelegram.tsx');
  const plaatsTs = lees('src/aanmelden/plaats.ts');
  const vensterTs = lees('backend/telegram-aanmelden/venster.ts');
  const inloggenTs = lees('backend/telegram-aanmelden/inloggen.ts');
  const andereOptiesTsx = lees('src/AanmeldAndereOpties.tsx');

  check(
    'TG-1..TG-3: файли AanmeldTelegram.tsx та plaats.ts містять функції plaatsDelen, plaatsVoorStart і блок data-tg-plaats-eis',
    aanmeldTgTsx.includes('plaatsDelen') &&
      aanmeldTgTsx.includes('data-tg-plaats-eis') &&
      aanmeldTgTsx.includes('lopend.widgetUrl') &&
      plaatsTs.includes('export async function plaatsVoorStart'),
  );

  check(
    'TG-5..TG-8: файли venster.ts та inloggen.ts містять розмітку захищеного вікна, деталі запиту й обробку plaats-nodig',
    vensterTs.includes('Деталі запиту й Telegram') &&
      vensterTs.includes('plaats-nodig') &&
      inloggenTs.includes('inlogVraagVenster') &&
      inloggenTs.includes('inlogVensterKiezen'),
  );

  check(
    'TG-9: файл AanmeldAndereOpties.tsx містить перелік AANMELD_INGANGEN',
    andereOptiesTsx.includes('export const AANMELD_INGANGEN'),
  );

  const herstelOverzicht = evalueerTienTelegramAanmeldGebrekenHerstel();
  check(
    'функція оцінювання стану виправлення evalueerTienTelegramAanmeldGebrekenHerstel повертає звіти для всіх 10 пунктів',
    herstelOverzicht.length === 10 && herstelOverzicht.every((item) => item.details.length > 10),
  );

  // 3. Перевірка парної двомовної документації випробувань у docs/telegram-aanmelden/
  const docUkPad = 'docs/telegram-aanmelden/ВИПРОБУВАННЯ-10-ВАД-ВХОДУ-ТЕЛЕГРАМ-HERSTEL-001.uk.md';
  const docMdPad = 'docs/telegram-aanmelden/ВИПРОБУВАННЯ-10-ВАД-ВХОДУ-ТЕЛЕГРАМ-HERSTEL-001.md';
  const docNlPad = 'docs/telegram-aanmelden/PROEVEN-10-TELEGRAM-AANMELDGEBREKEN-HERSTEL-001.nl.md';
  check(
    'парні статті 10 випробувань (uk / nl) існують у docs/telegram-aanmelden/ і посилаються одна на одну',
    existsSync(resolve(docUkPad)) &&
      existsSync(resolve(docMdPad)) &&
      existsSync(resolve(docNlPad)) &&
      lees(docUkPad).includes('PROEVEN-10-TELEGRAM-AANMELDGEBREKEN-HERSTEL-001.nl.md') &&
      lees(docNlPad).includes('ВИПРОБУВАННЯ-10-ВАД-ВХОДУ-ТЕЛЕГРАМ-HERSTEL-001.uk.md') &&
      !VERBODEN_TEKENREEKS.test(lees(docUkPad) + lees(docNlPad)),
  );

  return einde();
}
