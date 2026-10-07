// Plaatsing van het meldingenvenster: altijd binnen het scherm, aan de kant met de meeste ruimte.
import { placeNear } from '../../src/notification-position';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('notification-position');
  const vp = { left: 0, top: 0, width: 1200, height: 800 };
  const inside = (p: { left: number; top: number; maxHeight: number }, w: number, h: number) => p.left >= 0 && p.left + w <= vp.width && p.top >= 0 && p.top + Math.min(h, p.maxHeight) <= vp.height;
  const bottomRight = placeNear({ left: 1140, top: 740, width: 48, height: 48 }, { width: 480, height: 500 }, vp);
  check('bel rechtsonder: venster komt boven de bel, rechterrand gelijk aan de bel, volledig in beeld', bottomRight.side === 'above' && inside(bottomRight, 480, 500) && bottomRight.left + 480 === 1188);
  const topLeft = placeNear({ left: 10, top: 10, width: 48, height: 48 }, { width: 480, height: 500 }, vp);
  check('bel linksboven: venster klapt naar onder en schuift naar rechts binnen het scherm', topLeft.side === 'below' && topLeft.left >= 8 && inside(topLeft, 480, 500), JSON.stringify(topLeft));
  const tall = placeNear({ left: 600, top: 400, width: 48, height: 48 }, { width: 480, height: 900 }, vp);
  check('te hoog venster midden in beeld: kiest de ruimere kant en krijgt een maximale hoogte (scrolt) in plaats van buiten beeld te vallen', tall.maxHeight < 900 && inside(tall, 480, 900), JSON.stringify(tall));
  const narrow = placeNear({ left: 300, top: 600, width: 48, height: 48 }, { width: 480, height: 300 }, { left: 0, top: 0, width: 360, height: 700 });
  check('smal scherm: breder dan het scherm wordt teruggebracht en blijft binnen beeld', narrow.left >= 8 && narrow.left + Math.min(480, 344) <= 360);
  const scrolled = placeNear({ left: 100, top: 1500, width: 48, height: 48 }, { width: 400, height: 300 }, { left: 0, top: 1000, width: 1200, height: 800 });
  check('visuele viewport met offset (zoom/scroll): coördinaten blijven binnen de viewport', scrolled.top >= 1008 && scrolled.top + 300 <= 1800);
  return einde();
}
