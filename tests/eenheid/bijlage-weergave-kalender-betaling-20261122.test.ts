// ПОЧАТОК РОБОТИ, НЕ ПЕРЕВІРЕНО: скелет модульних тестів для kalender-betaling.ts.
// Цей файл ще не проганяли. Це початок, не готовий результат.
// Питання 2 закрито 22.11.2026: людина щоразу сама вибирає календар.
// Лишилося: прогнати через звичайний запуск тестів; додати зразки без суми,
// без відправника, іншої мови; перевірка, що інтерфейс ще не підключено
// (Weergave.tsx і acties.ts без імпорту kalender-betaling) і що модуль
// не викликає agenda-client; вікно з вибором цілі ще попереду.
// Спільний перегляд вкладень, етап 3, розділ 15.3 (Grok: hub.tarasevych.com).
import { checker } from './hulp/nep-google';
import type { RekeningVelden } from '../../src/bijlage-weergave/rekening-velden';
import {
  BETALING_DOEL_LABEL,
  BETALING_DOELEN,
  BETALING_LABEL,
  BETALING_TOELICHTING,
  STANDAARD_HERINNERINGEN_MINUTEN,
  betalingSleutel,
  briefVerwijzing,
  geldigBetalingDoel,
  geldigeIsoDag,
  herinneringenVoor,
  maakBetalingOntwerp,
  toontKalenderBetaling,
  type BetalingBron,
} from '../../src/bijlage-weergave/kalender-betaling';

const VELDEN: RekeningVelden = {
  bedrag: { centen: 123456, valuta: 'UAH', bron: '1 234,56 грн' },
  termijn: { iso: '2026-12-15', bron: '15.12.2026' },
  nummer: { waarde: 'FV-42', bron: 'FV-42' },
};

function bron(deel: Partial<BetalingBron> = {}): BetalingBron {
  return {
    velden: VELDEN,
    afzender: 'ТОВ «Світло»',
    bestandsnaam: 'rekening.pdf',
    soort: 'rekening',
    profielId: 'p1',
    rekeningId: 'acc1',
    briefId: 'br1',
    bijlageId: 'bj1',
    ...deel,
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('bijlage-weergave-kalender-betaling');

  check('рахунок зі строком показує дію', toontKalenderBetaling('rekening', VELDEN) === true);
  check(
    'без строку дії немає',
    toontKalenderBetaling('rekening', { ...VELDEN, termijn: null }) === false,
  );
  check('фото зі строком дії немає', toontKalenderBetaling('foto', VELDEN) === false);
  check('договір зі строком дії немає', toontKalenderBetaling('contract', VELDEN) === false);

  check('підпис дії українською', BETALING_LABEL[0] === 'Додати оплату в Календар');
  check('підпис дії нідерландською', BETALING_LABEL[1] === 'Betaling aan Agenda toevoegen');
  check(
    'пояснення обіцяє запис лише після згоди',
    BETALING_TOELICHTING[0].includes('після вашої згоди') &&
      BETALING_TOELICHTING[1].includes('na uw instemming'),
  );

  check('дата 2026-12-15 чинна', geldigeIsoDag('2026-12-15') === true);
  check('дата 2026-13-40 нечинна', geldigeIsoDag('2026-13-40') === false);
  check('дата 2026-02-30 нечинна', geldigeIsoDag('2026-02-30') === false);

  const ok = maakBetalingOntwerp(bron(), 'onze-agenda');
  check(
    'чорнетка складається',
    ok.ok === true &&
      ok.ontwerp.wachtOpBevestiging === true &&
      ok.ontwerp.doel === 'onze-agenda' &&
      ok.ontwerp.meldDeelnemers === 'none',
  );
  check(
    'форма події: увесь день на строк сплати',
    ok.ok === true &&
      ok.ontwerp.vorm.heleDag === true &&
      ok.ontwerp.vorm.begin === '2026-12-15' &&
      ok.ontwerp.vorm.einde === '2026-12-15' &&
      ok.ontwerp.vorm.agendaId === 'primary' &&
      ok.ontwerp.vorm.gebeurtenisId === '',
  );
  check(
    'назва несе номер рахунку',
    ok.ok === true && ok.ontwerp.vorm.titel === 'Оплата: FV-42',
  );
  check(
    'опис має суму, строк, номер і відправника',
    ok.ok === true &&
      ok.ontwerp.vorm.beschrijving.includes('1 234,56 грн') &&
      ok.ontwerp.vorm.beschrijving.includes('15.12.2026') &&
      ok.ontwerp.vorm.beschrijving.includes('FV-42') &&
      ok.ontwerp.vorm.beschrijving.includes('ТОВ «Світло»'),
  );
  check(
    'посилання внутрішнє, без http',
    ok.ok === true &&
      ok.ontwerp.briefVerwijzing === 'posta-brief:acc1/br1/bj1' &&
      ok.ontwerp.vorm.beschrijving.includes('posta-brief:acc1/br1/bj1') &&
      !/https?:\/\//.test(ok.ontwerp.vorm.beschrijving) &&
      !/https?:\/\//.test(ok.ontwerp.briefVerwijzing),
  );
  check(
    'нагадування: за день і в день сплати',
    ok.ok === true &&
      STANDAARD_HERINNERINGEN_MINUTEN.join(',') === '1440,0' &&
      ok.ontwerp.vorm.standaardHerinneringen === false &&
      ok.ontwerp.vorm.herinneringen.map((h) => h.minuten).join(',') === '1440,0' &&
      ok.ontwerp.vorm.herinneringen.every((h) => h.methode === 'popup'),
  );

  const google = maakBetalingOntwerp(bron(), 'google-agenda');
  check(
    'ціль Google зберігається, запису немає',
    google.ok === true &&
      google.ontwerp.doel === 'google-agenda' &&
      google.ontwerp.wachtOpBevestiging === true &&
      google.ontwerp.vorm.gebeurtenisId === '',
  );
  check(
    'обидві цілі відомі, типової немає',
    BETALING_DOELEN.join(',') === 'onze-agenda,google-agenda' &&
      geldigBetalingDoel('onze-agenda') === true &&
      geldigBetalingDoel('google-agenda') === true &&
      geldigBetalingDoel('') === false &&
      BETALING_DOEL_LABEL['onze-agenda'][0] === 'Наш Календар' &&
      BETALING_DOEL_LABEL['google-agenda'][0] === 'Google Календар',
  );
  check(
    'без цілі — geen-doel',
    (maakBetalingOntwerp(bron(), '' as never) as { ok: false; fout: string }).fout === 'geen-doel',
  );

  const zonderSom = maakBetalingOntwerp(
    bron({ velden: { ...VELDEN, bedrag: null } }),
    'onze-agenda',
  );
  check(
    'без суми чорнетка є, у описі суми немає',
    zonderSom.ok === true &&
      zonderSom.ontwerp.vorm.titel === 'Оплата: FV-42' &&
      !zonderSom.ontwerp.vorm.beschrijving.includes('грн') &&
      zonderSom.ontwerp.vorm.beschrijving.includes('FV-42'),
  );

  const zonderNummer = maakBetalingOntwerp(
    bron({ velden: { ...VELDEN, nummer: null } }),
    'onze-agenda',
  );
  check(
    'без номера назва бере ім’я файла',
    zonderNummer.ok === true && zonderNummer.ontwerp.vorm.titel === 'Оплата: rekening.pdf',
  );

  const nl = maakBetalingOntwerp(bron({ taal: 'nl' }), 'onze-agenda');
  check(
    'нідерландська назва й опис',
    nl.ok === true &&
      nl.ontwerp.vorm.titel === 'Betaling: FV-42' &&
      nl.ontwerp.vorm.beschrijving.includes('Bedrag') &&
      nl.ontwerp.vorm.beschrijving.includes('Te betalen tot'),
  );

  check(
    'той самий набір дає той самий ключ',
    betalingSleutel(bron()) === betalingSleutel(bron()) &&
      ok.ok === true &&
      ok.ontwerp.sleutel === betalingSleutel(bron()),
  );
  const andereSom = betalingSleutel(
    bron({ velden: { ...VELDEN, bedrag: { centen: 1, valuta: 'UAH', bron: '0,01' } } }),
  );
  check('інша сума дає інший ключ', andereSom !== betalingSleutel(bron()));

  check(
    'без строку — geen-termijn',
    (maakBetalingOntwerp(bron({ velden: { ...VELDEN, termijn: null } }), 'onze-agenda') as { ok: false; fout: string }).fout ===
      'geen-termijn',
  );
  check(
    'фото — geen-rekening',
    (maakBetalingOntwerp(bron({ soort: 'foto' }), 'onze-agenda') as { ok: false; fout: string }).fout === 'geen-rekening',
  );
  check(
    'без виду — geen-rekening',
    (maakBetalingOntwerp(bron({ soort: undefined }), 'onze-agenda') as { ok: false; fout: string }).fout === 'geen-rekening',
  );
  check(
    'хибна дата — ongeldige-datum',
    (maakBetalingOntwerp(
      bron({ velden: { ...VELDEN, termijn: { iso: '2026-02-30', bron: '30.02.2026' } } }),
      'onze-agenda',
    ) as { ok: false; fout: string }).fout === 'ongeldige-datum',
  );

  check(
    'посилання порожнє, якщо немає листа',
    briefVerwijzing(bron({ briefId: '' })) === '' && briefVerwijzing(bron({ rekeningId: '' })) === '',
  );
  check(
    'нагадування без від’ємних і без повторів',
    herinneringenVoor([1440, -1, 1440, 0]).map((h) => h.minuten).join(',') === '1440,0',
  );

  return einde();
}
