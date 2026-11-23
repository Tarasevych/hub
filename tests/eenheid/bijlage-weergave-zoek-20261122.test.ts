// ПОЧАТОК РОБОТИ, НЕ ПЕРЕВІРЕНО: скелет модульних тестів для zoek.ts.
// Цей файл ще не проганяли. Це початок, не готовий результат.
// Лишилося: прогнати через звичайний запуск тестів; додати зразки великого
// тексту, кількох збігів у одному файлі, порожньої назви; перевірка, що
// інтерфейс ще не підключено (немає ZoekVeld.tsx, Weergave.tsx без імпорту zoek).
// Спільний перегляд вкладень, етап 3, крок 3 (Grok: hub.tarasevych.com).
import { checker } from './hulp/nep-google';
import { normaliseerZoek, zoekInBijlagen, type ZoekItem } from '../../src/bijlage-weergave/zoek';

function item(id: string, naam: string, tekst: string): ZoekItem {
  return { bijlageId: id, naam, tekst };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('bijlage-weergave-zoek');

  check('регістр не розрізняємо', normaliseerZoek('Рахунок') === normaliseerZoek('рахунок'));
  check(
    'діакритика: café і cafe — одна форма',
    normaliseerZoek('café') === normaliseerZoek('cafe') && normaliseerZoek('café') === 'cafe',
  );
  check(
    "варіанти апострофа: зв'язок і звʼязок — одна форма",
    normaliseerZoek("зв'язок") === normaliseerZoek('звʼязок') && normaliseerZoek("зв'язок") === 'звязок',
  );
  check('порожній рядок дає порожню форму', normaliseerZoek('   ') === '' && normaliseerZoek('***') === '');

  const lijst = [
    item('a1', 'photo.jpg', 'Лише знімок без слів рахунку.'),
    item('a2', 'rekening.pdf', 'Підсумок. Разом до сплати 120 євро за звʼязок.'),
  ];

  const hit = zoekInBijlagen(lijst, 'РАЗОМ');
  check(
    'збіг лише в другому файлі, регістр не заважає',
    hit.length === 1 && hit[0].bijlageId === 'a2' && hit[0].veld === 'tekst' && hit[0].fragment.includes('Разом'),
  );
  check('позиція вказує на слово в початковому тексті', lijst[1].tekst.slice(hit[0].start, hit[0].einde) === 'Разом');

  const apostrof = zoekInBijlagen(lijst, "зв'язок");
  check(
    'апостроф у запиті знаходить текст із іншим апострофом',
    apostrof.length === 1 && apostrof[0].bijlageId === 'a2' && apostrof[0].fragment.includes('звʼязок'),
  );

  const inNaam = zoekInBijlagen(lijst, 'Rekening');
  check('збіг у назві файла', inNaam.length === 1 && inNaam[0].veld === 'naam' && inNaam[0].bijlageId === 'a2');

  check('немає збігів — порожній список', zoekInBijlagen(lijst, 'договір').length === 0);
  check('порожній запит — порожній список', zoekInBijlagen(lijst, '  ').length === 0);
  check('порожній список вкладень — порожня відповідь', zoekInBijlagen([], 'рахунок').length === 0);

  const cafe = zoekInBijlagen([item('c1', 'menu.txt', 'Café au lait')], 'cafe');
  check(
    'діакритика в тексті: cafe знаходить Café',
    cafe.length === 1 && cafe[0].fragment.includes('Café') && cafe[0].start === 0,
  );

  return einde();
}
