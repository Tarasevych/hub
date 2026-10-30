// Блок 5.1–5.2: фон на оболонці, скляне закріплене меню, запасні варіанти прозорості.
import { readFileSync } from 'node:fs';

const lees = (p: string) => readFileSync(p, 'utf8');
const resultaten: Array<{ naam: string; ok: boolean }> = [];
const check = (naam: string, ok: boolean) => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}`); };

export async function main() {
  const schil = lees('src/schil-achtergrond.css');
  const omlijst = lees('src/CanoniekOmlijsting.tsx');
  const menu = lees('src/menu-naadloos.css');
  const wb = lees('src/werkblad/werkblad.css');
  const hook = lees('src/werkblad/pagina-achtergrond.ts');
  const wbTs = lees('src/werkblad/Werkblad.tsx');
  const nacht = "linear-gradient(160deg,color-mix(in srgb,var(--info-vlak) 38%,var(--bg))";

  check('оболонка має клас schil-achtergrond і свій CSS', omlijst.includes('canonical-chrome schil-achtergrond') && omlijst.includes("import './schil-achtergrond.css'"));
  check('гачок data-achtergrond на .canonical-chrome', hook.includes("querySelector<HTMLElement>('.canonical-chrome')") && hook.includes('dataset.achtergrond') && wbTs.includes('pasPaginaAchtergrondToe'));
  check('фон малюється на оболонці (::before), не в блоці .werkblad', schil.includes('.canonical-chrome.schil-achtergrond[data-achtergrond]:not([data-achtergrond=\'geen\'])::before') && schil.includes('var(--pagina-beeld,none)') && schil.includes('var(--pagina-verloop,none)') && schil.includes(".canonical-chrome.schil-achtergrond[data-achtergrond='nacht']"));
  check('той самий градієнт, що в робочого столу', schil.includes(nacht) && wb.includes(nacht) && wb.includes(".canonical-chrome[data-achtergrond='nacht']"));
  check('робоча область прозора, віджет не малює свій шар', schil.includes('.canonical-workspace{background:transparent}') && schil.includes('.werkblad::before') && schil.includes('background:none') && !wb.includes('.canonical-workspace{background:linear-gradient'));
  check('меню 0.64 світле і 0.56 темне на --panel', menu.includes('--menu-alpha-licht:0.64') && menu.includes('--menu-alpha-donker:0.56') && menu.includes('color-mix(in srgb,var(--panel) 64%,transparent)') && menu.includes('color-mix(in srgb,var(--panel) 56%,transparent)') && menu.includes('html.theme-dark') && menu.includes('html.theme-plum-dark'));
  check('слабкі кольори підпису меню замінені на --text', menu.includes('--muted:var(--text)') && menu.includes('--faint:var(--text)'));

  const uit = menu.slice(menu.indexOf('prefers-reduced-transparency'));
  check('reduced-transparency і високий контраст вимикають скло', menu.includes('prefers-reduced-transparency:reduce') && menu.includes('prefers-contrast:more') && uit.includes('background:var(--panel)!important') && uit.includes('backdrop-filter:none') && !uit.includes('64%,transparent') && !uit.includes('56%,transparent'));
  const forced = menu.slice(menu.indexOf('forced-colors:active'));
  check('forced-colors вимикає прозорість (суцільна панель)', menu.includes('forced-colors:active') && forced.includes('background:Canvas!important') && forced.includes('backdrop-filter:none') && !forced.includes('64%,transparent'));
  check('підзаголовок привітання на --text, не --muted', wb.includes('.wb-begroeting-tekst p{margin:2px 0 0;color:var(--text)') && wb.includes('.wb-begroeting-datum{color:var(--text)'));

  const mis = resultaten.filter((r) => !r.ok);
  console.log(`${resultaten.length - mis.length}/${resultaten.length} geslaagd (schil-achtergrond-20261026)`);
  return mis.length ? 1 : 0;
}
