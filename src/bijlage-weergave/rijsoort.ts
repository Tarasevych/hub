// Спільний перегляд вкладень, етап 2 (Grok: hub.tarasevych.com): de kolom «Тип» in de tabellen van de formaatweergaven
// toonde de interne soortnaam van een rij in het Engels (entry, header, record…). Hier één woordenboek voor de weergave;
// de interne waarde (row.kind) blijft ongewijzigd, want de logica gebruikt die. Onbekende woorden blijven zoals ze zijn.
type Taal = 'uk' | 'nl';
const WOORDEN: Record<string, [string, string]> = {
  entry: ['запис', 'item'], directory: ['тека', 'map'], header: ['заголовок', 'kop'], string: ['рядок', 'tekenreeks'], section: ['розділ', 'sectie'],
  field: ['поле', 'veld'], directive: ['директива', 'richtlijn'], text: ['текст', 'tekst'], table: ['таблиця', 'tabel'], name: ['назва', 'naam'],
  value: ['значення', 'waarde'], segment: ['сегмент', 'segment'], record: ['запис', 'record'], packet: ['пакет', 'pakket'], member: ['складник', 'onderdeel'],
  image: ['зображення', 'afbeelding'], archive: ['архів', 'archief'], video: ['відео', 'video'], tensor: ['тензор', 'tensor'], signature: ['підпис', 'handtekening'],
  sheet: ['аркуш', 'blad'], rule: ['правило', 'regel'], printable: ['друковані символи', 'afdrukbare tekens'], metadata: ['метадані', 'metadata'],
  message: ['повідомлення', 'bericht'], map: ['карта', 'kaart'], line: ['рядок', 'regel'], key: ['ключ', 'sleutel'], headword: ['заголовне слово', 'trefwoord'],
  graphics: ['графіка', 'grafiek'], font: ['шрифт', 'lettertype'], filesystem: ['файлова система', 'bestandssysteem'], document: ['документ', 'document'],
  database: ['база даних', 'database'], citation: ['посилання', 'citaat'], binary: ['двійкові дані', 'binaire gegevens'], axis: ['вісь', 'as'], audio: ['аудіо', 'audio'],
  array: ['масив', 'reeks'], block: ['блок', 'blok'], chunk: ['частина', 'deel'], node: ['вузол', 'knoop'], element: ['елемент', 'element'], attribute: ['атрибут', 'attribuut'],
  object: ['об’єкт', 'object'], stream: ['потік', 'stroom'], page: ['сторінка', 'pagina'], layer: ['шар', 'laag'], track: ['доріжка', 'spoor'], event: ['подія', 'gebeurtenis'],
  frame: ['кадр', 'frame'], file: ['файл', 'bestand'], folder: ['тека', 'map'], comment: ['коментар', 'opmerking'], property: ['властивість', 'eigenschap'],
  partition: ['розділ', 'partitie'], sector: ['сектор', 'sector'], certificate: ['сертифікат', 'certificaat'], resource: ['ресурс', 'bron'], style: ['стиль', 'stijl'],
  variable: ['змінна', 'variabele'], dimension: ['вимір', 'dimensie'], sample: ['відлік', 'monster'], sequence: ['послідовність', 'reeks'], feature: ['ознака', 'kenmerk'],
  item: ['елемент', 'item'], list: ['список', 'lijst'], config: ['налаштування', 'instelling'], setting: ['налаштування', 'instelling'], command: ['команда', 'opdracht'],
  part: ['частина', 'deel'], unknown: ['невідомо', 'onbekend'], data: ['дані', 'gegevens'], index: ['індекс', 'index'], tag: ['мітка', 'tag'], marker: ['позначка', 'markering'],
  row: ['рядок', 'rij'], column: ['стовпець', 'kolom'], cell: ['клітинка', 'cel'], note: ['примітка', 'notitie'], pdf: ['PDF', 'PDF'], subkey: ['підключ', 'subsleutel'],
  public: ['відкритий', 'openbaar'], private: ['приватний', 'privé'], secret: ['секретний', 'geheim'], user: ['користувач', 'gebruiker'], trust: ['довіра', 'vertrouwen'],
  host: ['вузол', 'host'], network: ['мережа', 'netwerk'], device: ['пристрій', 'apparaat'], route: ['маршрут', 'route'], zone: ['зона', 'zone'], address: ['адреса', 'adres'],
  service: ['служба', 'dienst'], group: ['група', 'groep'], interface: ['інтерфейс', 'interface'], policy: ['правило', 'beleid'],
};
export function rijSoort(kind: unknown, taal: Taal): string {
  const k = String(kind ?? '').trim();
  if (!k) return '';
  const heel = WOORDEN[k.toLowerCase()];
  if (heel) return heel[taal === 'nl' ? 1 : 0];
  return k.split(/([-_ /]+)/).map((d) => { const w = WOORDEN[d.toLowerCase()]; return w ? w[taal === 'nl' ? 1 : 0] : d.replace(/^[-_]+$/, ' '); }).join('');
}
