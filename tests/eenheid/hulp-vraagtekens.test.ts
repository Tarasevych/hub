// 29.10.2026 — eigenaar: «на одному місці аж 3 знаки питання» en «коло збоку від знака питання». Toetst:
// (1) de controle «één (?) per kop» (scripts/hulp-vraagtekens-controle.mjs): regels K1/K2/K3, uitzondering, en dat de admin-,
//     toegangs- en beheerpagina's (STRENG) geen bevindingen meer hebben; de build roept de controle aan;
// (2) de vorm van de knop: één vaste cirkel 22×22 (inline-grid, place-items:center, line-height 1, geen opvulling), tikvlak 44 via
//     ::after, het teken is een SVG (geen letter met lettertype-ruimte) — en de oude regels die de knop ovaal maakten zijn weg;
// (3) HulpVraag met meer/naam: alle sleutels uit het register, uitleg als alinea's in dezelfde (?).
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
// @ts-expect-error — .mjs zonder types
import { controleer, controleerTekst, STRENG } from '../../scripts/hulp-vraagtekens-controle.mjs';
import { hulpVan } from '../../shared/hulp-register';

export async function main(): Promise<number> {
  const { check, einde } = checker('hulp-vraagtekens');
  type B = { code: string };
  const codes = (t: string) => (controleerTekst(t) as B[]).map((b) => b.code).join(',');
  check('K1: drie (?) in één kop', codes(`<h2>Gebruikers <HulpVraag k='a' /> <HulpVraag k='b' /> <HulpVraag k='c' /></h2>`) === 'K1');
  check('K2: (?) bij de kop en nog een bij een knop eronder', codes(`<h3>Beheer <HulpVraag k='a' /></h3><button/> <HulpVraag k='b' />`) === 'K2');
  check('K3: kop zonder (?) en twee knoppen met elk een (?)', codes(`<h3>Beheer</h3><button/><HulpVraag k='a' /><button/><HulpVraag k='b' />`) === 'K3');
  check('in orde: één (?) bij de kop met meer={[…]}', codes(`<h3>Beheer <HulpVraag k='a' meer={[['b','Б','B']]} /></h3><button/><button/>`) === '');
  check('in orde: (?) direct na de kop in <header> (InfoTip)', codes(`<header><h2>Вхід</h2>\n  <InfoTip label='x'><p>t</p></InfoTip></header><div/>`) === '');
  check('uitzondering hulp:eigen-vraag (los veld zonder kop)', codes(`<h3>A</h3><HulpVraag k='a' /> {/* hulp:eigen-vraag */}<HulpVraag k='b' />`) === '');
  check('een andere component is een ander blok', codes(`<h3>A</h3><HulpVraag k='a' />\nfunction B() {\n  return <HulpVraag k='b' />;\n}`) === '');
  check('useState<Vraag> telt niet als (?)', codes(`<h3>A</h3>const [v] = useState<Vraag | null>(null); <HulpVraag k='a' />`) === '');
  const { fouten } = controleer('.') as { fouten: string[] };
  check(`admin-/toegangs-/beheerpagina's (${STRENG.length}): geen rij (?) meer`, fouten.length === 0, fouten.join('\n'));
  check('pagina\'s uit de schermafbeeldingen staan in STRENG', ['src/BeheerConsoleWeergave.tsx', 'src/ssh/SshBeheer.tsx'].every((p) => (STRENG as string[]).includes(p)));
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  check('build roept de controle aan', /node scripts\/hulp-vraagtekens-controle\.mjs --stil/.test(pkg.scripts.build));
  const beheer = readFileSync('src/BeheerConsoleWeergave.tsx', 'utf8');
  check('«Користувачі та запити доступу»: één (?) met status, rol en rechten', /Користувачі та запити доступу','Gebruikers en toegangsaanvragen'\)\} <HulpVraag k='admin\.user\.status' naam=\{[^}]*\} meer=\{\[\['admin\.user\.rol'[^\n]*\['admin\.user\.rechten'/.test(beheer) && (beheer.match(/<HulpVraag k='admin\.user\./g) || []).length === 1);
  const ssh = readFileSync('src/ssh/SshBeheer.tsx', 'utf8');
  check('SSH «Керування»: één (?) bij de kop, geen (?) naast elke knop', /'Керування' : 'Beheer'\} <HulpVraag k='ssh\.voorbereiden'[^\n]*'ssh\.schakelaar'[^\n]*'ssh\.ontmantelen'/.test(ssh) && !/<HulpVraag k='ssh\.(schakelaar|ontmantelen|intrekken)'/.test(ssh) && (ssh.match(/<HulpVraag k='ssh\.duur'/g) || []).length === 1);

  // (2) vorm
  const css = readFileSync('src/hulp/hulp-knop.css', 'utf8').replace(/\s+/g, ' ');
  const regel = /button\.tech-vraag-knop\.tech-vraag-knop,button\.info-tip-knop\.info-tip-knop\{([^}]*)\}/.exec(css.replace(/ ?([{};,:]) ?/g, '$1'))?.[1] || '';
  for (const d of ['display:inline-grid!important', 'place-items:center', 'width:22px!important', 'height:22px!important', 'min-width:22px!important', 'max-width:22px!important', 'padding:0!important', 'border-radius:50%!important', 'line-height', 'box-shadow:none!important'])
    check(`knop: ${d}`, regel.replace(/font:700 13px\/1/, 'line-height').includes(d), regel);
  check('tikvlak 44×44 via ::after op de telefoon', /::after\{content:'';position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate\(-50%,-50%\)/.test(css.replace(/ ?([{};,:]) ?/g, '$1')));
  const teken = readFileSync('src/hulp/HulpTeken.tsx', 'utf8');
  check('teken is SVG 24×24, decoratief', /viewBox='0 0 24 24'/.test(teken) && /aria-hidden='true'/.test(teken));
  check('Vraag en InfoTip gebruiken het SVG-teken (geen letter «?»)', !/>\?<\/button>/.test(readFileSync('src/tech/Vraag.tsx', 'utf8')) && !/>\?<\/button>/.test(readFileSync('src/InfoTip.tsx', 'utf8')) && /<HulpTeken/.test(readFileSync('src/InfoTip.tsx', 'utf8')));
  const tl = readFileSync('src/toegangslaag.css', 'utf8');
  check('oude doorzichtige rand van 13 px (cirkel naast het teken) is weg', !/--tip-rand/.test(tl));
  check('toegang: geen min-width:28px meer op de (?) (maakte hem ovaal)', !/\.tg \.tech-vraag-knop\{min-width:28px;min-height:28px\}/.test(readFileSync('src/agenten/toegang/toegang.css', 'utf8')));

  // (3) meer/naam
  const hv = readFileSync('src/hulp/HulpVraag.tsx', 'utf8');
  check('HulpVraag: meer en naam → onderdelen (alinea\'s in dezelfde uitleg)', /meer\?: HulpMeer/.test(hv) && /onderdelen=\{onderdelen\}/.test(hv));
  const alle = [...beheer.matchAll(/\['([a-z0-9.-]+)',\s*'[^']+',\s*'[^']+'\]/g), ...ssh.matchAll(/\['([a-z0-9.-]+)',\s*'[^']+',\s*'[^']+'\]/g)].map((m) => m[1]);
  check(`alle sleutels in meer={…} staan in het register (${alle.length})`, alle.length >= 5 && alle.every((k) => !!hulpVan(k)), alle.filter((k) => !hulpVan(k)).join(', '));
  return einde();
}
