// ПОЧАТОК РОБОТИ, НЕ ПЕРЕВІРЕНО: скелет модульних тестів для ondertekenen.ts.
// Цей файл ще не проганяли. Це початок, не готовий результат.
// Лишилося: прогнати через звичайний запуск тестів; додати зразки кількох
// сторінок, завеликого розміру, порожньої назви файла; перевірка, що
// інтерфейс ще не підключено (acties.ts без окремої дії, Weergave.tsx
// без імпорту ondertekenen).
// Спільний перегляд вкладень, етап 3, розділ 15.4 (Grok: hub.tarasevych.com).
import { checker } from './hulp/nep-google';
import {
  ONDERTEKEN_LABEL,
  ONDERTEKEN_TOELICHTING,
  STANDAARD_BREEDTE,
  controleerPlaatsing,
  gereedschapVoor,
  maakPlan,
  naamKopije,
  toontOndertekenen,
  type Pagina,
  type Plaatsing,
} from '../../src/bijlage-weergave/ondertekenen';

const A4: Pagina[] = [{ index: 0, breedte: 595, hoogte: 842 }];

function plaats(deel: Partial<Plaatsing> & Pick<Plaatsing, 'soort'>): Plaatsing {
  return { pagina: 0, x: 50, y: 50, ...deel };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('bijlage-weergave-ondertekenen');

  check('рахунок показує дію', toontOndertekenen('rekening', 'JPG') === true);
  check('договір показує дію', toontOndertekenen('contract', '') === true);
  check('звичайний PDF показує дію', toontOndertekenen('document', 'PDF') === true);
  check('фото не показує дію', toontOndertekenen('foto', 'JPG') === false);
  check('архів не показує дію, навіть якщо згадано PDF', toontOndertekenen('archief', 'PDF') === false);

  check('підпис дії українською', ONDERTEKEN_LABEL[0] === 'Підписати');
  check('підпис дії нідерландською', ONDERTEKEN_LABEL[1] === 'Ondertekenen');
  check(
    'пояснення не обіцяє кваліфікований підпис',
    ONDERTEKEN_TOELICHTING[0].includes('не кваліфікований') && ONDERTEKEN_TOELICHTING[1].includes('geen gekwalificeerde'),
  );
  check(
    'у підписах дій немає слів Sign або Edit',
    !/Sign|Edit|Legal/.test(ONDERTEKEN_LABEL.join(' ') + ONDERTEKEN_TOELICHTING.join(' ')),
  );

  check('вид tekening відповідає signature', gereedschapVoor('tekening') === 'signature');
  check('вид initialen відповідає text', gereedschapVoor('initialen') === 'text');
  check('вид datum відповідає date', gereedschapVoor('datum') === 'date');

  const okTekening = maakPlan(plaats({ soort: 'tekening' }), A4);
  check(
    'план малюнка в центрі сторінки проходить',
    okTekening.ok === true &&
      okTekening.plan.gereedschap === 'signature' &&
      okTekening.plan.breedte === STANDAARD_BREEDTE.tekening &&
      okTekening.plan.mark.page === 0 &&
      okTekening.plan.mark.x === 50 &&
      okTekening.plan.mark.tool === 'signature' &&
      okTekening.plan.mark.image === '',
  );
  check('звірка того самого розміщення без вади', controleerPlaatsing(plaats({ soort: 'tekening' }), A4) === null);

  const okInitialen = maakPlan(plaats({ soort: 'initialen', tekst: 'ПТ' }), A4);
  check(
    'план ініціалів несе текст у mark',
    okInitialen.ok === true && okInitialen.plan.mark.tool === 'text' && okInitialen.plan.mark.text === 'ПТ',
  );
  check(
    'ініціали без тексту — вада lege-tekst',
    maakPlan(plaats({ soort: 'initialen', tekst: '  ' }), A4).ok === false &&
      !maakPlan(plaats({ soort: 'initialen', tekst: '  ' }), A4).ok &&
      (maakPlan(plaats({ soort: 'initialen' }), A4) as { ok: false; fout: string }).fout === 'lege-tekst',
  );

  const okDatum = maakPlan(plaats({ soort: 'datum' }), A4);
  check(
    'план дати без тексту проходить: дату підставить редактор',
    okDatum.ok === true && okDatum.plan.gereedschap === 'date' && okDatum.plan.tekst === '',
  );

  check(
    'невідома сторінка — onbekende-pagina',
    (maakPlan(plaats({ soort: 'tekening', pagina: 1 }), A4) as { ok: false; fout: string }).fout === 'onbekende-pagina',
  );
  check(
    'центр за межею — buiten-grenzen',
    (maakPlan(plaats({ soort: 'tekening', x: 150, y: 50 }), A4) as { ok: false; fout: string }).fout === 'buiten-grenzen',
  );
  check(
    'рамка виходить за край — buiten-grenzen',
    (maakPlan(plaats({ soort: 'tekening', x: 5, y: 50, breedte: 25, hoogte: 10 }), A4) as { ok: false; fout: string }).fout ===
      'buiten-grenzen',
  );
  check(
    'нульовий розмір — ongeldig-formaat',
    (maakPlan(plaats({ soort: 'tekening', breedte: 0, hoogte: 10 }), A4) as { ok: false; fout: string }).fout ===
      'ongeldig-formaat',
  );

  check('назва копії зберігає розширення', naamKopije('rekening.pdf') === 'rekening-kopie.pdf');
  check('назва без розширення', naamKopije('dohovir') === 'dohovir-kopie');

  return einde();
}
