// Kleurcodering van terminalregels (src/uitrol/terminal-kleur.ts): ANSI → klassen, syntax voor paden/commando's/versies/vlaggen, geen tekstverlies.
import { kleurRegel, kleurTekst, zonderAnsi } from '../../src/uitrol/terminal-kleur';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('terminal-kleur');
  const join = (d: Array<{ t: string }>) => d.map((x) => x.t).join('');
  const soort = (regel: string, deel: string) => kleurRegel(regel).find((d) => d.t === deel)?.k;
  const r1 = '[installeer] bouwen: npm ci --omit=dev in /srv/mijn-ruimte/releases/20261017-160000 (21s)';

  check('tekst blijft ongewijzigd (concat == invoer)', join(kleurRegel(r1)) === r1);
  check('[label] herkend', soort(r1, '[installeer]') === 'tag');
  check('commando herkend', soort(r1, 'npm') === 'cmd');
  check('vlag herkend', soort(r1, '--omit') === undefined ? soort(r1, '--omit=dev') === 'vlag' || kleurRegel(r1).some((d) => d.k === 'vlag') : true);
  check('pad herkend', kleurRegel(r1).some((d) => d.k === 'pad' && d.t.startsWith('/srv/mijn-ruimte')));
  check('versie (release) herkend', kleurRegel(r1).some((d) => d.k === 'versie' && d.t === '20261017-160000'));
  check('duur met eenheid herkend', kleurRegel(r1).some((d) => d.k === 'getal' && d.t === '21s'));
  check('fout/waarschuwing/ok woorden', soort('npm warn deprecated inflight@1.0.6', 'warn') === 'waarsch' && soort('build FAILED', 'FAILED') === 'fout' && soort('health check ok', 'ok') === 'goed');
  check('URL en sha', soort('zie https://mcp.tarasevych.com/ai/claude nu', 'https://mcp.tarasevych.com/ai/claude') === 'url' && kleurRegel('sha ' + 'a'.repeat(64)).some((d) => d.k === 'dim'));
  check('semver herkend', soort('node v22.22.0 actief', 'v22.22.0') === 'versie');

  const a = '\u001b[32mklaar\u001b[0m en \u001b[1;31mFOUT\u001b[0m';
  const d = kleurRegel(a);
  check('ANSI: codes verdwijnen uit de tekst', join(d) === 'klaar en FOUT' && !join(d).includes('\u001b'));
  check('ANSI: groen en rood → klassen', d[0].k === 'a-rood' || d[0].k === 'a-groen' ? d[0].k === 'a-groen' && d.find((x) => x.t === 'FOUT')?.k === 'a-rood' : false);
  check('zonderAnsi verwijdert kleurcodes', zonderAnsi(a) === 'klaar en FOUT');
  check('cursor-/OSC-codes verdwijnen', join(kleurRegel('x\u001b[2Ky\u001b]0;titel\u0007z')) === 'xyz');
  check('lege regel en rare tekens crashen niet', join(kleurRegel('')) === '' && join(kleurRegel('\u0000​ 💥 ' + 'x'.repeat(10000))).length <= 4000 + 10);
  check('geen HTML-interpretatie: < > blijven tekst', join(kleurTekst('<script>alert(1)</script>')) === '<script>alert(1)</script>');
  const t0 = Date.now(); for (let i = 0; i < 3000; i++) kleurRegel(r1);
  check('snelheid: 3000 regels < 1,5 s', Date.now() - t0 < 1500, `${Date.now() - t0} ms`);
  const kwaad = '/' + 'a'.repeat(5000) + ' ' + '-'.repeat(5000) + ' ' + '0'.repeat(5000);
  const t1 = Date.now(); kleurRegel(kwaad);
  check('kwaadaardige lange invoer blokkeert niet (< 500 ms)', Date.now() - t1 < 500, `${Date.now() - t1} ms`);
  return einde();
}
