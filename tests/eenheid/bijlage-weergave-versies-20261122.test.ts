// ПОЧАТОК РОБОТИ, НЕ ПЕРЕВІРЕНО: скелет модульних тестів для versies.ts.
// Цей файл ще не проганяли. Це початок, не готовий результат.
// Лишилося: прогнати через звичайний запуск тестів; додати зразки пересланої
// копії без змін, великого тексту з afgekapt, файла без пари; перевірка, що
// інтерфейс ще не підключено (Weergave.tsx без імпорту versies).
// Спільний перегляд вкладень, етап 3, крок 2 (Grok: hub.tarasevych.com).
import { checker } from './hulp/nep-google';
import {
  actieBijschrift,
  documentSleutel,
  groepVoor,
  vergelijkKeuze,
  verschilVersies,
  versiesOpDatum,
  versiesVanGesprek,
  vorigeVersie,
  type CtxBericht,
} from '../../src/bijlage-weergave/versies';

function brief(id: string, wanneer: number, bijlagen: Array<{ id: string; naam: string; bytes: number }>): CtxBericht {
  return {
    id,
    threadId: 't1',
    from: 'a@b.be',
    subject: 'x',
    receivedAt: wanneer,
    attachments: bijlagen.map((b) => ({
      providerAttachmentId: b.id,
      filename: b.naam,
      contentType: 'application/pdf',
      sizeBytes: b.bytes,
    })),
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('bijlage-weergave-versies');

  check(
    'рахунок і рахунок-v2 — той самий ключ',
    documentSleutel('рахунок.pdf') === documentSleutel('рахунок-v2.pdf') && documentSleutel('рахунок.pdf') !== '',
  );
  check(
    'factuur 12 і factuur 13 — різні документи',
    documentSleutel('factuur 12.pdf') !== documentSleutel('factuur 13.pdf')
      && documentSleutel('factuur 12.pdf') !== ''
      && documentSleutel('factuur 13.pdf') !== '',
  );

  const gesprek = [
    brief('b1', 1_000, [{ id: 'a1', naam: 'рахунок.pdf', bytes: 100 }]),
    brief('b2', 2_000, [{ id: 'a2', naam: 'рахунок-v2.pdf', bytes: 120 }]),
  ];
  const { groepen, los } = versiesVanGesprek(gesprek);
  check('одна група з двох версій, без окремих файлів', groepen.length === 1 && los.length === 0 && groepen[0].totaal === 2);
  const opDatum = versiesOpDatum(groepen[0]);
  check(
    'список за датою: спочатку старіша версія',
    opDatum.length === 2 && opDatum[0].nummer === 1 && opDatum[0].berichtId === 'b1' && opDatum[1].nummer === 2 && opDatum[1].berichtId === 'b2',
  );

  const groep = groepVoor(gesprek, 'b2', 'a2');
  check('група для відкритого v2 є', !!groep && groep.totaal === 2);
  const vorige = groep ? vorigeVersie(groep, 'b2', 'a2') : null;
  check('попередня для v2 — версія 1', !!vorige && vorige.nummer === 1 && vorige.bijlage.providerAttachmentId === 'a1');
  check('у найстарішої попередньої немає', !!groep && vorigeVersie(groep, 'b1', 'a1') === null);
  check('підпис дії українською', actieBijschrift('uk', vorige) === 'Порівняти з попередньою версією');
  check('підпис дії нідерландською', actieBijschrift('nl', vorige) === 'Vergelijken met de vorige versie');
  check('без попередньої версії підпису немає', actieBijschrift('uk', null) === null);

  const keus = groep ? vergelijkKeuze(groep, 'b2', 'a2') : null;
  check('вибір порівняння: стара v1, нова v2', !!keus && keus.oud.nummer === 1 && keus.nieuw.nummer === 2);

  const alone = [brief('b3', 3_000, [{ id: 'a3', naam: 'photo.jpg', bytes: 50 }])];
  check('єдиний файл — групи немає', groepVoor(alone, 'b3', 'a3') === null && versiesVanGesprek(alone).groepen.length === 0);

  const tweeFacturen = [
    brief('f1', 1_000, [{ id: 'x1', naam: 'factuur 12.pdf', bytes: 10 }]),
    brief('f2', 2_000, [{ id: 'x2', naam: 'factuur 13.pdf', bytes: 11 }]),
  ];
  check('factuur 12 і 13 не складають однієї групи', versiesVanGesprek(tweeFacturen).groepen.length === 0);

  const zelfdeKopie = [
    brief('k1', 1_000, [{ id: 'c1', naam: 'contract.pdf', bytes: 80 }]),
    brief('k2', 2_000, [{ id: 'c2', naam: 'contract.pdf', bytes: 80 }]),
  ];
  check('однакова назва й розмір — не нова версія, групи немає', versiesVanGesprek(zelfdeKopie).groepen.length === 0);

  const uitkomst = verschilVersies('Рядок один.\n\nРядок два.', 'Рядок один.\n\nРядок три.');
  check(
    'коротка різниця: один рівний абзац і один змінений',
    !!uitkomst && uitkomst.telling.gelijk === 1 && uitkomst.telling.gewijzigd === 1 && uitkomst.afgekapt === false,
  );
  check('порожні тексти — різниці немає', verschilVersies('   ', '') === null);

  return einde();
}
