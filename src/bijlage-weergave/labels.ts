// Спільний перегляд вкладень, afwerking etappe 2 (Grok: hub.tarasevych.com): de formaatweergaven tonen labels die de
// lezers (src/mail-*-inhoud.ts) zonder taal maken: meestal Oekraïens, soms nog een Engelse sleutel (Size, Inspected…).
// Bij het tonen: Engels → Oekraïens, en in de NL-modus de gangbare labels → Nederlands. De gegevens zelf blijven
// ongewijzigd (lookups en vergelijkingen in de lezers werken op de oorspronkelijke tekst). Onbekend label: ongewijzigd.
import { NL_MOTOR_TEKSTEN } from './nl-teksten';
type Taal = 'uk' | 'nl';
const L: Record<string, [string, string]> = {
  // HEIC/AVIF en e-mail (afwerking etappe 2, gevonden bij de NL-proef)
  'Основний бренд ISO BMFF': ['Основний бренд ISO BMFF', 'Hoofdmerk ISO BMFF'], 'Сумісні бренди': ['Сумісні бренди', 'Compatibele merken'],
  'Рядки MIME': ['Рядки MIME', 'MIME-regels'],
  // Engelse sleutels die de lezers nog maken
  Size: ['Розмір', 'Grootte'], Inspected: ['Перевірено', 'Geïnspecteerd'], Evidence: ['Структурний доказ', 'Structuurbewijs'],
  Route: ['Маршрут формату', 'Formaatroute'], Lines: ['Рядків', 'Regels'], Vertices: ['Вершин', 'Hoekpunten'], Faces: ['Граней', 'Vlakken'],
  Triangles: ['Трикутників', 'Driehoeken'], Signature: ['Підпис', 'Handtekening'], Encoding: ['Кодування', 'Codering'], Encrypted: ['Зашифровано', 'Versleuteld'],
  Title: ['Назва', 'Titel'], Description: ['Опис', 'Beschrijving'], Reference: ['Посилання', 'Verwijzing'], Relationship: ['Зв’язок', 'Relatie'],
  Aborted: ['Перервано', 'Afgebroken'], 'first bytes': ['Перші байти', 'Eerste bytes'], Modality: ['Модальність', 'Modaliteit'],
  // gangbare Oekraïense labels → Nederlands
  'Розмір файла': ['Розмір файла', 'Bestandsgrootte'], 'Формат': ['Формат', 'Formaat'], 'Байтів': ['Байтів', 'Bytes'], 'Підпис': ['Підпис', 'Handtekening'],
  'Розбір': ['Розбір', 'Verwerking'], 'Ширина': ['Ширина', 'Breedte'], 'Висота': ['Висота', 'Hoogte'], 'Сімейство': ['Сімейство', 'Familie'],
  'Версія': ['Версія', 'Versie'], 'Розібрані рядки': ['Розібрані рядки', 'Verwerkte regels'], 'Корінь': ['Корінь', 'Hoofdelement'], 'Кодування': ['Кодування', 'Codering'],
  'Таблиці': ['Таблиці', 'Tabellen'], 'Контейнер': ['Контейнер', 'Container'], 'Записи': ['Записи', 'Records'], 'Елементи XML': ['Елементи XML', 'XML-elementen'],
  'Частини': ['Частини', 'Delen'], 'Розміри': ['Розміри', 'Afmetingen'], 'Правила': ['Правила', 'Regels'], 'Заявлено байтів': ['Заявлено байтів', 'Opgegeven bytes'],
  'Записи пакета': ['Записи пакета', 'Pakketitems'], 'Тип даних': ['Тип даних', 'Gegevenstype'], 'Стиснення': ['Стиснення', 'Compressie'],
  'Спроєктовано атомів': ['Спроєктовано атомів', 'Geprojecteerde atomen'], 'Серіалізація': ['Серіалізація', 'Serialisatie'], 'Розібрані точки': ['Розібрані точки', 'Verwerkte punten'],
  'Розпізнавання': ['Розпізнавання', 'Herkenning'], 'Заголовок': ['Заголовок', 'Kop'], 'Вид джерела': ['Вид джерела', 'Soort bron'], 'Індекс': ['Індекс', 'Index'],
  'Шифрування': ['Шифрування', 'Versleuteling'], 'Стовпці': ['Стовпці', 'Kolommen'], 'Розібрані вершини': ['Розібрані вершини', 'Verwerkte hoekpunten'],
  'Підписи': ['Підписи', 'Handtekeningen'], 'Прапорці': ['Прапорці', 'Vlaggen'], 'Посилання': ['Посилання', 'Verwijzingen'], 'Обгортка': ['Обгортка', 'Omhulsel'],
  'Корінь XML': ['Корінь XML', 'XML-hoofdelement'], 'Канали': ['Канали', 'Kanalen'], 'Змінний шрифт': ['Змінний шрифт', 'Variabel lettertype'], 'Зв’язки': ['Зв’язки', 'Relaties'],
  'Глибина': ['Глибина', 'Diepte'], 'Байтів заголовка': ['Байтів заголовка', 'Kopbytes'], 'Алгоритм': ['Алгоритм', 'Algoritme'], 'Шрифти': ['Шрифти', 'Lettertypen'],
  'Чутливі значення': ['Чутливі значення', 'Gevoelige waarden'], 'Фотометрія': ['Фотометрія', 'Fotometrie'], 'Сітки': ['Сітки', 'Netten'], 'Сторінки': ['Сторінки', 'Pagina’s'],
  'Різновид': ['Різновид', 'Variant'], 'Рядки заголовка': ['Рядки заголовка', 'Kopregels'], 'Розібрані грані': ['Розібрані грані', 'Verwerkte vlakken'],
  'Розмір контейнера': ['Розмір контейнера', 'Containergrootte'], 'Площини': ['Площини', 'Vlakken'], 'Ознаки контейнера': ['Ознаки контейнера', 'Containerkenmerken'],
  'Одиниць на em': ['Одиниць на em', 'Eenheden per em'], 'Оглянуто байтів': ['Оглянуто байтів', 'Geïnspecteerde bytes'], 'Об’єкт': ['Об’єкт', 'Object'],
  'Недійсні записи': ['Недійсні записи', 'Ongeldige records'], 'Насиченість': ['Насиченість', 'Verzadiging'], 'Назва': ['Назва', 'Naam'], 'Крок вокселів': ['Крок вокселів', 'Voxelafstand'],
  'Контакти': ['Контакти', 'Contacten'], 'Коментар': ['Коментар', 'Opmerking'], 'Команди': ['Команди', 'Opdrachten'], 'Кольори': ['Кольори', 'Kleuren'], 'Кадри': ['Кадри', 'Beelden'],
  'Зсув вокселів': ['Зсув вокселів', 'Voxelverschuiving'], 'Зовнішня перевірка': ['Зовнішня перевірка', 'Externe controle'], 'Заявлений розмір': ['Заявлений розмір', 'Opgegeven grootte'],
  'Записи контейнера': ['Записи контейнера', 'Containeritems'], 'Записи каталогу': ['Записи каталогу', 'Mapitems'], 'Дія середовища': ['Дія середовища', 'Omgevingsactie'],
  'Відліків на піксель': ['Відліків на піксель', 'Monsters per pixel'], 'Відліки': ['Відліки', 'Monsters'], 'Вузли': ['Вузли', 'Knooppunten'], 'Версія колекції': ['Версія колекції', 'Collectieversie'],
  'Бітів на піксель': ['Бітів на піксель', 'Bits per pixel'], 'Бітів на воксель': ['Бітів на воксель', 'Bits per voxel'], 'Байтів шифротексту': ['Байтів шифротексту', 'Bytes versleutelde tekst'],
  'Авторське право': ['Авторське право', 'Auteursrecht'], 'Центральний каталог': ['Центральний каталог', 'Centrale map'], 'Ознаки пакета': ['Ознаки пакета', 'Pakketkenmerken'],
  'Перші байти': ['Перші байти', 'Eerste bytes'], 'Структура': ['Структура', 'Structuur'], 'Модальність': ['Модальність', 'Modaliteit'], 'Розмір': ['Розмір', 'Grootte'],
  'Перевірено': ['Перевірено', 'Geïnspecteerd'], 'Показано записів': ['Показано записів', 'Getoonde items'], 'Змінено': ['Змінено', 'Gewijzigd'], 'Оригінальна назва': ['Оригінальна назва', 'Oorspronkelijke naam'],
};
export function toonLabel(label: unknown, taal: Taal): string {
  const k = String(label ?? '');
  const w = L[k];
  if (w) return w[taal === 'nl' ? 1 : 0];
  return taal === 'nl' ? motorNl(k) ?? k : k;
}

/* Lezerteksten → Nederlands (afwerking etappe 2). Eerst een exacte treffer, dan een sjabloon met {n} (langste vaste
 * tekst eerst; ingevoegde stukken worden zelf ook vertaald, ten hoogste drie niveaus), dan per deel rond « · ».
 * Geen treffer: null, zodat de oorspronkelijke tekst blijft staan. Alleen voor de NL-modus. */
const exact = new Map<string, string>();
const sjablonen: { re: RegExp; nl: string; vast: number }[] = [];
for (const [uk, nl] of NL_MOTOR_TEKSTEN) {
  if (!/\{\d\}/.test(uk)) { exact.set(uk, nl); continue; }
  const delen = uk.split(/(\{\d\})/);
  const volgorde: number[] = [];
  const bron = delen.map(d => { const m = /^\{(\d)\}$/.exec(d); if (m) { volgorde.push(+m[1]); return '([\\s\\S]*?)'; } return d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('');
  const vast = delen.filter(d => !/^\{\d\}$/.test(d)).join('').trim().length;
  if (vast < 2) continue;
  sjablonen.push({ re: new RegExp('^' + bron + '$'), nl: nl.replace(/\{(\d)\}/g, (_, n) => `{${volgorde.indexOf(+n)}}`), vast });
}
sjablonen.sort((a, b) => b.vast - a.vast);
const geheugen = new Map<string, string | null>();
const CYR = /[\u0400-\u04ff]/;
function motorNl(tekst: string, diepte = 0): string | null {
  if (!tekst || !CYR.test(tekst)) return null;
  const e = exact.get(tekst) ?? exact.get(tekst.trim());
  if (e !== undefined) return e;
  if (diepte > 3) return null;
  if (diepte === 0 && geheugen.has(tekst)) return geheugen.get(tekst)!;
  let uit: string | null = null;
  for (const s of sjablonen) {
    const m = s.re.exec(tekst);
    if (!m) continue;
    uit = s.nl.replace(/\{(\d)\}/g, (_, n) => { const deel = m[+n + 1] ?? ''; return motorNl(deel, diepte + 1) ?? waardeNl(deel); });
    break;
  }
  if (uit === null && tekst.includes(' · ')) {
    const delen = tekst.split(' · ');
    const vertaald = delen.map(d => motorNl(d, diepte + 1));
    if (vertaald.some(v => v !== null)) uit = delen.map((d, i) => vertaald[i] ?? waardeNl(d)).join(' · ');
  }
  if (diepte === 0) { if (geheugen.size > 4000) geheugen.clear(); geheugen.set(tekst, uit); }
  return uit;
}
/** Exacte treffer alleen (voor namen van items, paden en dergelijke: geen sjablonen, zodat een bestandsnaam als
 *  «Розділ 1.docx» niet wordt «vertaald»). */
export function toonNaam<T>(waarde: T, taal: Taal): T | string {
  if (taal !== 'nl' || typeof waarde !== 'string') return waarde;
  return exact.get(waarde) ?? waarde;
}

/** Waarden in de NL-modus: alleen vaste, veelvoorkomende Oekraïense stukjes die de lezers in waarden zetten («N байтів»,
 *  «записів: N», «підтверджено»). Getallen, namen en de rest blijven zoals ze zijn; UK-modus en niet-tekst: ongewijzigd. */
const W: [RegExp, string][] = [
  [/(\d(?:[\d\s.,]*\d)?)\s*байтів/g, '$1 bytes'], [/записів: (\d+)/g, 'vermeldingen: $1'],
  [/^кандидат \/ не підтверджено$/, 'kandidaat / niet bevestigd'], [/^не підтверджено$/, 'niet bevestigd'], [/^підтверджено$/, 'bevestigd'],
  [/^так$/, 'ja'], [/^ні$/, 'nee'], [/^немає$/, 'geen'], [/ · encrypted\b/g, ' · versleuteld'], [/ · unsafe path\b/g, ' · onveilig pad'],
];
function waardeNl(tekst: string): string {
  let uit = tekst;
  for (const [re, nl] of W) uit = uit.replace(re, nl);
  return uit;
}
export function toonWaarde<T>(waarde: T, taal: Taal): T | string {
  if (taal !== 'nl' || typeof waarde !== 'string') return waarde;
  const m = motorNl(waarde);
  return waardeNl(m ?? waarde);
}
