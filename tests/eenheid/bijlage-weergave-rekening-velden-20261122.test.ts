// ПОЧАТОК РОБОТИ, НЕ ПЕРЕВІРЕНО: скелет модульних тестів для rekening-velden.ts і snelkaart.ts.
// Цей файл ще не проганяли. Це початок, не готовий результат.
// Лишилося: прогнати через звичайний запуск тестів; додати зразки з живих рахунків; випадки
// кількох сум, номера схожого на дату, порожнього й пошкодженого тексту, файла не-рахунку;
// перевірка мови підписів карток; тест, що інтерфейс ще не підключено (Weergave.tsx без імпорту).
// Спільний перегляд вкладень, етап 3, крок 1 (Grok: hub.tarasevych.com).
import { checker } from './hulp/nep-google';
import { rekeningVelden, parsuvatyChyslo, parsuvatyDatu, normaValuta } from '../../src/bijlage-weergave/rekening-velden';
import { snelkaartVoor, snelkaartRijen, opysBedrag, opysTermijn } from '../../src/bijlage-weergave/snelkaart';

const UK_TEKST = [
  'Рахунок № 2026-104',
  'Сплатити до: 05.12.2026',
  'Позиція 1     500,00 грн',
  'Позиція 2     200,00 грн',
  'Разом         700,00 грн',
].join('\n');

const NL_TEKST = [
  'Factuurnummer: F-998',
  'Vervaldatum: 05-12-2026',
  'Te betalen: € 1.234,56',
].join('\n');

const DE_TEKST = [
  'Rechnungsnummer: 5512',
  'Fällig am: 05.12.2026',
  'Gesamtbetrag: 1.234,56 EUR',
].join('\n');

const EN_TEKST = [
  'Invoice number: INV-441',
  'Due date: 5 December 2026',
  'Total due: EUR 1,234.56',
].join('\n');

export async function main(): Promise<number> {
  const { check, einde } = checker('bijlage-weergave-rekening-velden');

  check('парс числа: пробіл і кома', parsuvatyChyslo('1 234,56') === 123456);
  check('парс числа: крапка як тисячі', parsuvatyChyslo('1.234,56') === 123456);
  check('парс числа: кома як тисячі, крапка як десяткова', parsuvatyChyslo('1,234.56') === 123456);
  check('парс числа: 1.234 без десяткової — тисячі', parsuvatyChyslo('1.234') === 123400);
  check('валюта грн і євро', normaValuta('грн') === 'UAH' && normaValuta('€') === 'EUR');

  check('дата з крапок', parsuvatyDatu('05.12.2026') === '2026-12-05');
  check('дата ISO', parsuvatyDatu('2026-12-05') === '2026-12-05');
  check('дата словами українською', parsuvatyDatu('5 грудня 2026') === '2026-12-05');
  check('дата 31.02 відкидається', parsuvatyDatu('31.02.2026') === null);

  const uk = rekeningVelden(UK_TEKST);
  check('український рахунок: сума — підсумок, не рядок товару', uk.bedrag?.centen === 70000 && uk.bedrag?.valuta === 'UAH');
  check('український рахунок: строк', uk.termijn?.iso === '2026-12-05');
  check('український рахунок: номер', uk.nummer?.waarde === '2026-104');

  const nl = rekeningVelden(NL_TEKST);
  check('нідерландський рахунок: сума й валюта', nl.bedrag?.centen === 123456 && nl.bedrag?.valuta === 'EUR');
  check('нідерландський рахунок: строк і номер', nl.termijn?.iso === '2026-12-05' && nl.nummer?.waarde === 'F-998');

  const de = rekeningVelden(DE_TEKST);
  check('німецький рахунок: усі три поля', de.bedrag?.centen === 123456 && de.bedrag?.valuta === 'EUR' && de.termijn?.iso === '2026-12-05' && de.nummer?.waarde === '5512');

  const en = rekeningVelden(EN_TEKST);
  check('англійський рахунок: усі три поля', en.bedrag?.centen === 123456 && en.bedrag?.valuta === 'EUR' && en.termijn?.iso === '2026-12-05' && en.nummer?.waarde === 'INV-441');

  check('порожній текст — усі поля порожні', (() => {
    const p = rekeningVelden('   ');
    return p.bedrag === null && p.termijn === null && p.nummer === null;
  })());
  check('числа без підпису підсумку не вигадуємо', rekeningVelden('Позиція 500,00 грн\\nЩе 200,00 грн').bedrag === null);

  const kartkaUk = snelkaartVoor(uk, 'uk');
  check('картка українською: три рядки й підсумок', kartkaUk.length === 3 && kartkaUk[0].label === 'Сума' && kartkaUk[0].waarde === '700,00 грн' && kartkaUk[1].waarde === '05.12.2026' && kartkaUk[2].waarde === '2026-104');
  const kartkaNl = snelkaartVoor(nl, 'nl');
  check('картка нідерландською: сума з євро', kartkaNl[0].label === 'Bedrag' && kartkaNl[0].waarde === '€ 1.234,56' && kartkaNl[1].waarde === '05-12-2026');
  check('порожні поля не дають рядків картки', snelkaartRijen({ bedrag: null, termijn: null, nummer: null }).length === 0);
  check('запис суми й дати', opysBedrag(123456, 'EUR', 'uk') === '1 234,56 €' && opysTermijn('2026-12-05', 'nl') === '05-12-2026');

  return einde();
}
