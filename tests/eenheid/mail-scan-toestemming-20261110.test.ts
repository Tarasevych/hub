// MAILSCAN-002 · Відсутність згоди, незалежність скриньок та м'яка геометрія тла.
import { readFileSync } from 'node:fs';
import { magScanAutomatisch, normaliseerScanVoorkeur, STANDAARD_SCAN_VOORKEUR } from '../../shared/contacten-scan-voorkeuren';
import { dagSleutel, golfImpuls, schrijfDoel, vloeibaarDoel } from '../../src/mail/mail-vloeistof';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-scan-toestemming-20261110');
  const uit = normaliseerScanVoorkeur(undefined);
  check('без запису згода вимкнена', !uit.aan && STANDAARD_SCAN_VOORKEUR.aan === false && uit.werkwijze === 'handmatig');
  check('попередній глобальний вибір повторних спроб не вмикає перевірку', !normaliseerScanVoorkeur({ beleid: 'automatisch' }).aan);
  check('ручний спосіб ніколи не запускається за розкладом', !magScanAutomatisch({ ...uit, aan: true }, null, Date.now()));
  check('окремі скриньки не успадковують згоду', normaliseerScanVoorkeur({ aan: true }).aan && !normaliseerScanVoorkeur({}).aan);
  const per = normaliseerScanVoorkeur({ aan: true, werkwijze: 'periodiek', intervalMinuten: 60, voorwaarde: 'verbonden', melding: 'begin' });
  const nu = Date.now();
  check('розклад запускається після обраної години', !magScanAutomatisch(per, nu - 59 * 60_000, nu) && magScanAutomatisch(per, nu - 61 * 60_000, nu));
  check('відкриття дозволяє окремий запуск, якщо користувач увімкнув саме цей спосіб', magScanAutomatisch({ ...per, werkwijze: 'bij-openen' }, null, nu));
  check('неприпустимі значення повертаються до безпечних', !normaliseerScanVoorkeur({ aan: 'так', werkwijze: 'невідомо', intervalMinuten: 1, melding: 'завжди' }).aan);

  const backend = readFileSync('backend/mail-afzenders.ts', 'utf8');
  const melding = readFileSync('src/afzenders/ContactenScanMelding.tsx', 'utf8');
  const inst = readFileSync('src/mail/MailAchtergrond.tsx', 'utf8');
  check('сервер відхиляє запуск без згоди і не починає перевірку всіх скриньок', backend.includes("fout('SCAN_GEEN_TOESTEMMING', 403)") && backend.includes('const toegestaan = new Set(stand.gekoppeld.filter((a) => a.voorkeur.aan)'));
  check('фоновий запуск обмежено дозволеними і вибраними скриньками', backend.includes('magScanAutomatisch(a.voorkeur') && backend.includes('gevraagd.includes(a.accountId)'));
  check('сповіщення лише в переліку, коротке на дві секунди', melding.includes('alleenPaneel: true') && melding.includes('2000)'));
  check('налаштування тла поза обрізаним контейнером', inst.includes('createPortal(') && inst.includes('document.body'));
  const doel = vloeibaarDoel(12, 700, 1.7, 390, 840);
  check('геометрія зграї лишається в межах екрана', doel.x > 0 && doel.x < 390 && doel.y > 0 && doel.y < 840);
  check('письмо повертає форму шляху', schrijfDoel(2, 10, [{ x: 10, y: 20 }, { x: 50, y: 40 }], 390) !== null);
  check('постукування створює хвилю лише поблизу', golfImpuls({ x: 20, y: 10 }, { x: 10, y: 10 }).x > 0 && golfImpuls({ x: 300, y: 300 }, { x: 10, y: 10 }).x === 0);
  check('одна календарна доба має стабільний ключ', dagSleutel(new Date(2026, 10, 10)) === '2026-11-10');
  return einde();
}
