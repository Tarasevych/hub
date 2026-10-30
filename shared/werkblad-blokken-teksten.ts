// Werkblad «Blokken» — alle teksten van het eigenschappenpaneel (stroom C). Oekraïens (uk) en Nederlands (nl).
// Elke optie heeft een gewone naam en een eenvoudige uitleg voor de (?)-knop. Geen vaktaal, geen Engelse woorden.

export type Taal = 'uk' | 'nl';
export interface Tekst { uk: string; nl: string; uitleg?: { uk: string; nl: string } }

const t = (uk: string, nl: string, uitlegUk?: string, uitlegNl?: string): Tekst =>
  uitlegUk ? { uk, nl, uitleg: { uk: uitlegUk, nl: uitlegNl || uitlegUk } } : { uk, nl };

export const BLOKKEN_TEKSTEN = {
  // kop en algemeen
  paneelTitel: t('Властивості', 'Eigenschappen', 'Тут ви налаштовуєте вибраний значок або блок: розмір, вигляд, місце і на яких пристроях його видно. Зміни видно одразу.', 'Hier stelt u het gekozen icoon of blok in: maat, uiterlijk, plaats en op welke apparaten het zichtbaar is. Wijzigingen ziet u meteen.'),
  geenSelectie: t('Нічого не вибрано. Натисніть на значок або блок.', 'Niets gekozen. Klik op een icoon of blok.'),
  soortOnderdeel: t('Значок', 'Icoon'),
  soortBlok: t('Блок', 'Blok'),
  sluiten: t('Закрити', 'Sluiten'),
  klaar: t('Готово', 'Klaar'),
  ongedaan: t('Скасувати дію', 'Ongedaan maken', 'Повертає останню зміну назад. Клавіші: Ctrl+Z.', 'Zet de laatste wijziging terug. Toetsen: Ctrl+Z.'),
  opnieuw: t('Повторити', 'Opnieuw', 'Повертає скасовану зміну. Клавіші: Ctrl+Shift+Z.', 'Zet een ongedaan gemaakte wijziging terug. Toetsen: Ctrl+Shift+Z.'),
  herstel: t('Скинути', 'Herstellen', 'Повертає цей параметр до «авто», тобто як було раніше.', 'Zet deze instelling terug op «automatisch», zoals het vroeger was.'),
  herstelAlles: t('Скинути все', 'Alles herstellen', 'Повертає всі параметри цього значка або блоку до «авто». Скасувати можна кнопкою «Скасувати дію».', 'Zet alle instellingen van dit icoon of blok terug op «automatisch». Terugdraaien kan met «Ongedaan maken».'),
  vergrendeld: t('Заблоковано: зміни вимкнені', 'Vergrendeld: wijzigen staat uit'),
  hulpOpen: t('Пояснення', 'Uitleg'),

  // voortgang
  bezig: t('Зберігаю…', 'Bezig met bewaren…'),
  bewaard: t('Збережено', 'Bewaard'),
  mislukt: t('Не вдалося зберегти', 'Bewaren mislukt'),
  probeerOpnieuw: t('Спробувати знову', 'Opnieuw proberen'),
  ongedaanGedaan: t('Скасовано', 'Ongedaan gemaakt'),
  opnieuwGedaan: t('Повторено', 'Opnieuw gedaan'),

  // tabbladen
  tabMaat: t('Розмір', 'Maat'),
  tabUiterlijk: t('Вигляд', 'Uiterlijk'),
  tabIndeling: t('Розташування', 'Indeling'),
  tabApparaten: t('Пристрої', 'Apparaten'),

  // voorinstellingen
  voorinstellingen: t('Готові набори', 'Voorinstellingen', 'Один клік змінює весь блок. Можна потім підправити кожен значок окремо.', 'Eén klik verandert het hele blok. Daarna kunt u elk icoon apart bijstellen.'),
  voorinstellingAlleenBlok: t('Готові набори діють для блоку. Виберіть блок, щоб їх застосувати.', 'Voorinstellingen gelden voor een blok. Kies een blok om ze te gebruiken.'),
  voorinstellingToegepast: t('Набір застосовано', 'Voorinstelling toegepast'),

  // maat
  breedte: t('Ширина', 'Breedte', 'Наскільки широким буде значок або блок.', 'Hoe breed het icoon of blok is.'),
  hoogte: t('Висота', 'Hoogte', 'Наскільки високим буде значок або блок.', 'Hoe hoog het icoon of blok is.'),
  maatAuto: t('Авто', 'Automatisch', '«Авто» — розмір вибирає сайт сам, як зараз.', '«Automatisch» — de site kiest de maat zelf, zoals nu.'),
  maatPx: t('Пікселі', 'Pixels', 'Точний розмір у пікселях екрана. Не змінюється, коли вікно більшає чи меншає.', 'Vaste maat in schermpixels. Verandert niet als het venster groter of kleiner wordt.'),
  maatProcent: t('Відсотки', 'Procent', 'Частина від розміру блоку, у якому лежить значок. 50 % — половина.', 'Deel van de maat van het blok waarin het staat. 50 % is de helft.'),
  maatDeel: t('Частка', 'Deel', 'Ділить вільне місце між сусідами. Значок із часткою 2 отримує вдвічі більше, ніж із часткою 1.', 'Verdeelt de vrije ruimte tussen buren. Deel 2 krijgt twee keer zoveel als deel 1.'),
  eenheidPx: t('пікселів', 'pixels'),
  eenheidProcent: t('% ширини блоку', '% van de blokbreedte'),
  eenheidProcentH: t('% висоти блоку', '% van de blokhoogte'),
  eenheidDeel: t('частка вільного місця', 'deel van de vrije ruimte'),
  grenzen: t('Межі', 'Grenzen', 'Найменший і найбільший дозволений розмір. Порожнє поле — без межі.', 'Kleinste en grootste toegestane maat. Leeg veld — geen grens.'),
  minBreedte: t('Ширина не менше', 'Breedte minstens'),
  maxBreedte: t('Ширина не більше', 'Breedte hoogstens'),
  minHoogte: t('Висота не менше', 'Hoogte minstens'),
  maxHoogte: t('Висота не більше', 'Hoogte hoogstens'),
  rasterSpan: t('Займає клітинок', 'Neemt cellen in', 'Лише для сітки: скільки клітинок у ширину та висоту займає цей значок.', 'Alleen bij een raster: hoeveel cellen dit icoon breed en hoog is.'),
  spanKolommen: t('у ширину', 'breed'),
  spanRijen: t('у висоту', 'hoog'),
  icoonGrootte: t('Розмір значка', 'Icoongrootte', 'Розмір самої картинки значка. «Авто» — як зараз (менший у вузьких блоках).', 'Grootte van het plaatje zelf. «Automatisch» — zoals nu (kleiner in smalle blokken).'),

  // uiterlijk
  kleuren: t('Кольори', 'Kleuren', 'Колір тла, значка, тексту й рамки. «Як у темі» — колір підбирається сам для світлої і темної теми.', 'Kleur van achtergrond, icoon, tekst en rand. «Zoals het thema» — de kleur past zich aan licht en donker aan.'),
  achtergrond: t('Тло', 'Achtergrond'),
  icoonKleur: t('Значок', 'Icoon'),
  tekstKleur: t('Текст', 'Tekst'),
  randKleur: t('Рамка', 'Rand'),
  kleurThema: t('Як у темі', 'Zoals het thema'),
  kleurEigen: t('Свій колір', 'Eigen kleur'),
  contrastLaag: t('Погано видно: різниця кольорів {v}:1, потрібно щонайменше 4,5:1. Виберіть світліший або темніший колір.', 'Slecht leesbaar: kleurverschil {v}:1, nodig is minstens 4,5:1. Kies een lichtere of donkerdere kleur.'),
  contrastGoed: t('Добре видно ({v}:1)', 'Goed leesbaar ({v}:1)'),
  icoonStijl: t('Стиль значка', 'Icoonstijl', '«У рамці» — картинка на плитці, «Без рамки» — лише картинка, «Круглий» — у колі.', '«In kader» — plaatje op een tegel, «Los» — alleen het plaatje, «Rond» — in een cirkel.'),
  stijlKader: t('У рамці', 'In kader'), stijlLos: t('Без рамки', 'Los'), stijlRond: t('Круглий', 'Rond'),
  label: t('Підпис', 'Onderschrift', 'Текст під значком або поруч. Можна сховати або написати свій.', 'Tekst onder of naast het icoon. U kunt hem verbergen of zelf schrijven.'),
  labelTonen: t('Показувати підпис', 'Onderschrift tonen'),
  labelJa: t('Так', 'Ja'), labelNee: t('Ні', 'Nee'), labelAuto: t('Авто', 'Automatisch'),
  labelPlaats: t('Де підпис', 'Plaats van het onderschrift'),
  plaatsOnder: t('Знизу', 'Onder'), plaatsRechts: t('Праворуч', 'Rechts'), plaatsBoven: t('Зверху', 'Boven'), plaatsLinks: t('Ліворуч', 'Links'),
  labelGrootte: t('Розмір тексту', 'Tekstgrootte'),
  grootteMini: t('Дуже малий', 'Heel klein'), grootteKlein: t('Малий', 'Klein'), grootteNormaal: t('Звичайний', 'Normaal'), grootteGroot: t('Великий', 'Groot'),
  labelTekst: t('Свій текст', 'Eigen tekst', 'Замість стандартної назви. До 60 знаків. Порожнє — стандартна назва.', 'In plaats van de gewone naam. Hoogstens 60 tekens. Leeg — gewone naam.'),
  vorm: t('Форма', 'Vorm', 'Форма плитки: кути, коло або «пігулка».', 'Vorm van de tegel: hoeken, cirkel of «pil».'),
  vormRechthoek: t('Прямокутник', 'Rechthoek'), vormAfgerond: t('Заокруглена', 'Afgerond'), vormCirkel: t('Коло', 'Cirkel'), vormPil: t('Пігулка', 'Pil'),
  straal: t('Заокруглення кутів', 'Hoekafronding', 'Наскільки круглі кути, у пікселях.', 'Hoe rond de hoeken zijn, in pixels.'),
  randDikte: t('Товщина рамки', 'Randdikte', 'Від 0 (без рамки) до 8 пікселів.', 'Van 0 (geen rand) tot 8 pixels.'),
  doorzichtigheid: t('Непрозорість', 'Dekking', '100 % — звичайний вигляд, менше — крізь значок видно тло.', '100 % — gewoon, minder — de achtergrond schijnt erdoor.'),
  schaduw: t('Тінь', 'Schaduw', 'Тінь під плиткою, щоб вона «піднімалась» над тлом.', 'Schaduw onder de tegel, zodat hij boven de achtergrond «zweeft».'),
  schaduwGeen: t('Немає', 'Geen'), schaduwZacht: t('Легка', 'Zacht'), schaduwSterk: t('Сильна', 'Sterk'),

  // indeling
  modus: t('Як розкладати', 'Hoe neerzetten', '«Вільно» — кожен значок там, куди ви його поставили. «Рядок» — в один ряд. «Колонка» — один під одним. «Сітка» — рівними клітинками.', '«Vrij» — elk icoon waar u het neerzet. «Rij» — naast elkaar. «Kolom» — onder elkaar. «Raster» — gelijke cellen.'),
  modusVrij: t('Вільно', 'Vrij'), modusRij: t('Рядок', 'Rij'), modusKolom: t('Колонка', 'Kolom'), modusRaster: t('Сітка', 'Raster'),
  tussenruimte: t('Відстань між значками', 'Ruimte tussen iconen', 'Скільки пікселів між сусідніми значками.', 'Hoeveel pixels tussen naburige iconen.'),
  binnenrand: t('Відступ від краю', 'Binnenrand', 'Порожнє місце між краєм блоку і значками.', 'Lege ruimte tussen de rand van het blok en de iconen.'),
  uitlijningHoofd: t('Вирівнювання вздовж', 'Uitlijning in de lengte', 'Куди притискати значки вздовж рядка чи колонки.', 'Waarheen de iconen schuiven langs de rij of kolom.'),
  uitlijningDwars: t('Вирівнювання впоперек', 'Uitlijning in de breedte', 'Як ставити значки поперек рядка чи колонки.', 'Hoe de iconen dwars op de rij of kolom staan.'),
  uitBegin: t('На початок', 'Begin'), uitMidden: t('По центру', 'Midden'), uitEind: t('В кінець', 'Eind'), uitRek: t('Розтягнути', 'Uitrekken'), uitVerdeeld: t('Рівномірно', 'Verdeeld'),
  omloop: t('Переносити на новий рядок', 'Doorlopen naar nieuwe regel', 'Коли значки не вміщаються, вони переходять у наступний рядок.', 'Als de iconen niet passen, gaan ze naar de volgende regel.'),
  richting: t('Зворотний порядок', 'Omgekeerde volgorde', 'Показувати значки від останнього до першого.', 'Iconen van laatste naar eerste tonen.'),
  rasterKolommen: t('Кількість стовпців', 'Aantal kolommen', '«Авто» — скільки вміститься, як зараз. Або точне число.', '«Automatisch» — zoveel als past, zoals nu. Of een vast aantal.'),
  rasterMinCel: t('Найменша ширина клітинки', 'Kleinste celbreedte', 'Для «Авто»: клітинка не стає вужчою за це число пікселів.', 'Bij «Automatisch»: een cel wordt niet smaller dan dit aantal pixels.'),
  overlap: t('Дозволити накладання', 'Overlappen toestaan', 'Вимкнено: значки самі розсуваються, щоб не закривати один одного. Увімкнено: можна класти один на інший.', 'Uit: iconen schuiven opzij zodat ze elkaar niet bedekken. Aan: ze mogen over elkaar liggen.'),
  vergrendel: t('Заблокувати', 'Vergrendelen', 'Заблокований значок не можна випадково зсунути чи змінити. Зніміть, щоб редагувати.', 'Een vergrendeld icoon kan niet per ongeluk verschuiven of veranderen. Haal het weg om te bewerken.'),

  // apparaten
  apparaten: t('Де показувати', 'Waar tonen', 'Можна сховати значок на телефоні, але лишити на комп\'ютері, і навпаки.', 'U kunt een icoon op de telefoon verbergen en op de computer houden, en andersom.'),
  computer: t('Комп\'ютер', 'Computer'), tablet: t('Планшет', 'Tablet'), telefoon: t('Телефон', 'Telefoon'),
  tonen: t('Показувати', 'Tonen'), verbergen: t('Сховати', 'Verbergen'),
} as const satisfies Record<string, Tekst>;

export type TekstSleutel = keyof typeof BLOKKEN_TEKSTEN;

export function tekst(s: TekstSleutel, taal: Taal = 'uk', vars: Record<string, string> = {}): string {
  return BLOKKEN_TEKSTEN[s][taal].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
export function uitleg(s: TekstSleutel, taal: Taal = 'uk'): string | undefined {
  const e = BLOKKEN_TEKSTEN[s] as Tekst; return e.uitleg?.[taal];
}
