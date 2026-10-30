// Donkere mailweergave (shared/mail-donker.ts): kleuren lezen, contrast (WCAG), lichte achtergrond → donker, tekst bijstellen.
import { contrast, donkereAchtergrond, donkerVerloop, heeftEigenDonkerOntwerp, isLichteAchtergrond, leesKleur, naarTekst, pasTekstAan } from '../../shared/mail-donker';
import { beoordeelPixels } from '../../src/mail-donker/logo-toets';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-donker');
  const opp = leesKleur('#1e2026')!;
  const wit = ['#fff', '#ffffff', '#FAFAFA', 'ffffff', 'white', 'whitesmoke', 'rgb(255,255,255)', 'rgb(255 255 255)', 'rgba(255,255,255,1)', 'hsl(0,0%,100%)', 'hsl(0 0% 98%)', '#fffe', 'snow', 'ivory'];
  for (const w of wit) { const k = leesKleur(w); check(`«${w}» wordt gelezen en is licht`, !!k && isLichteAchtergrond(k)); }
  check('wit → precies het systeemoppervlak', naarTekst(donkereAchtergrond(leesKleur('#fff')!, opp)) === '#1e2026');
  check('#fafafa → het systeemoppervlak', naarTekst(donkereAchtergrond(leesKleur('#fafafa')!, opp)) === '#1e2026');
  const pastel = donkereAchtergrond(leesKleur('#e8f5e9')!, opp);
  check('pastelgroen → donkergroen (zelfde tint, donker)', pastel.g > pastel.r && contrast(pastel, leesKleur('#e7e9ee')!) >= 7);
  for (const merk of ['#1a73e8', '#ff6d00', '#ffd400', '#004d40', '#dd2476']) check(`merkkleur ${merk} blijft`, !isLichteAchtergrond(leesKleur(merk)!));
  check('transparant is geen achtergrond', !isLichteAchtergrond(leesKleur('transparent')!));
  check('onzin wordt niet gelezen', leesKleur('url(x)') === null && leesKleur('') === null && leesKleur('#ggg') === null);
  for (const [fg, bg, doel] of [['#000', '#1e2026', 4.5], ['#333333', '#1e2026', 4.5], ['#767676', '#1e2026', 3], ['#ffffff', '#ffd400', 4.5], ['#1a0dab', '#1e2026', 4.5], ['#ffffff', '#ffffff', 4.5], ['#444', '#2a2d36', 4.5]] as [string, string, number][]) {
    const uit = pasTekstAan(leesKleur(fg)!, leesKleur(bg)!, doel);
    check(`tekst ${fg} op ${bg} haalt ≥ ${doel}:1`, contrast(uit, leesKleur(bg)!) >= doel, `${naarTekst(uit)} = ${contrast(uit, leesKleur(bg)!).toFixed(2)}`);
  }
  const goed = leesKleur('#e8eaed')!;
  check('al leesbare tekst blijft exact dezelfde', pasTekstAan(goed, opp) === goed);
  const blauw = pasTekstAan(leesKleur('#1a0dab')!, opp); check('donkerblauwe koppeling blijft blauw (tint bewaard)', blauw.b > blauw.r && blauw.b > blauw.g);
  check('verloop: lichte stops donker, merkverloop blijft', donkerVerloop('linear-gradient(180deg, #ffffff 0%, #eef2ff 100%)', opp).includes('#1e2026') && donkerVerloop('linear-gradient(90deg, #ff512f, #dd2476)', opp) === 'linear-gradient(90deg, #ff512f, #dd2476)');
  check('eigen donker ontwerp: media-query', heeftEigenDonkerOntwerp('<style>@media (prefers-color-scheme: dark){}</style>'));
  check('eigen donker ontwerp: meta color-scheme', heeftEigenDonkerOntwerp('<meta name="color-scheme" content="light dark">'));
  check('eigen donker ontwerp: css color-scheme', heeftEigenDonkerOntwerp('<div style="color-scheme: light dark">'));
  check('gewone brief heeft geen eigen donker ontwerp', !heeftEigenDonkerOntwerp('<p style="color:#000">x</p>'));
  const px = (r: number, g: number, b: number, a: number, n: number) => Array.from({ length: n }, () => [r, g, b, a]).flat();
  check('logo: donker op transparant', beoordeelPixels([...px(10, 10, 10, 255, 50), ...px(0, 0, 0, 0, 50)]) === 'donker-transparant');
  check('logo: licht op transparant', beoordeelPixels([...px(250, 250, 250, 255, 50), ...px(0, 0, 0, 0, 50)]) === 'licht-transparant');
  check('foto: dekkend', beoordeelPixels(px(120, 80, 60, 255, 100)) === 'dekkend');
  // lineair: 200 000 kleuren lezen + bijstellen ruim binnen de tijd
  const t0 = performance.now(); for (let i = 0; i < 200000; i += 1) pasTekstAan(leesKleur(`#${(i * 2654435761 >>> 8).toString(16).padStart(6, '0').slice(0, 6)}`)!, opp);
  const ms = performance.now() - t0; check('200 000 kleuren bijstellen < 4 s', ms < 4000, `${ms.toFixed(0)} ms`);
  return einde();
}
