// Mappen in E-mail: bekeken = stil; alleen echt nieuwe post (+N) maakt de teller weer zichtbaar. Server bewaart seenUnread.
import { gezienStaat } from '../../src/mail-gezien';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-gezien');
  check('nooit bezocht: 7 ongelezen → tonen, geen +N', JSON.stringify(gezienStaat(undefined, 7)) === '{"toon":true,"nieuw":0}');
  check('Spam bekeken bij 12, nog 12 → stil (ook na F5: stand komt van de server)', JSON.stringify(gezienStaat(12, 12)) === '{"toon":false,"nieuw":0}');
  check('bekeken bij 12, er zijn er 10 (gelezen/verwijderd) → stil', !gezienStaat(12, 10).toon);
  check('bekeken bij 12, nu 15 → tonen met +3', JSON.stringify(gezienStaat(12, 15)) === '{"toon":true,"nieuw":3}');
  check('bekeken bij 0, nu 0 → stil', !gezienStaat(0, 0).toon);
  check('rommel (NaN) → veilig', gezienStaat(Number.NaN, 2).toon && gezienStaat(3, Number.NaN).toon === false);
  // serverkant: seenUnread blijft bewaard bij het normaliseren
  const bron = await import('node:fs').then((f) => f.readFileSync('backend/mail-view-preferences.ts', 'utf8'));
  check('server bewaart seenUnread in navigationVisits', /seenUnread:Math\.max\(0,Math\.min\(1e7/.test(bron));
  return einde();
}
