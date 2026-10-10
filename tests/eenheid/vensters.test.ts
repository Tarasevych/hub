// Regels van het vensterbeheer: een gevolg staat boven de oorzaak, kritiek altijd bovenaan, vensters blijven bereikbaar.
import { binnenScherm, bovensteZichtbaar, stapel, type Item } from '../../src/platform/vensters-logica';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('vensters');
  const it = (id: string, volgorde: number, prioriteit: Item['prioriteit'] = 'normaal', klein = false): Item => ({ id, titel: id, prioriteit, modaal: true, volgorde, klein, wacht: false });
  const incident = stapel([it('bevestig', 2, 'kritiek'), it('toestemming', 1)]);
  check('incident 9.10: «Підтвердіть доступ» (later, kritiek) boven het toestemmingsvenster', incident.map((x) => x.id).join('>') === 'toestemming>bevestig');
  check('kritiek blijft boven, ook als het normale venster later naar voren kwam', stapel([it('bevestig', 1, 'kritiek'), it('toestemming', 5)]).pop()!.id === 'bevestig');
  check('gewone vensters: laatst geopend/naar voren = bovenaan', stapel([it('a', 3), it('b', 7), it('c', 5)]).map((x) => x.id).join('') === 'acb');
  check('bovenste ZICHTBARE: geminimaliseerd telt niet', bovensteZichtbaar([it('a', 1), it('b', 2, 'kritiek', true)])!.id === 'a' && bovensteZichtbaar([it('a', 1, 'normaal', true)]) === null);
  const g = binnenScherm({ x: 5000, y: -300, b: 4000, h: 50, max: false }, 1280, 800);
  check('buiten het scherm gesleept → terug binnen, minimaal 180 hoog, titelbalk bereikbaar', g.x >= 8 && g.x + g.b <= 1272 && g.y === 8 && g.h === 180 && g.b === 1264);
  const smal = binnenScherm({ x: 0, y: 0, b: 520, h: 400, max: false }, 360, 700);
  check('smal scherm (360 px): breedte past (344 px)', smal.b === 344 && smal.x === 8);
  return einde();
}
