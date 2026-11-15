// СТОРІНКА «ПІДКЛЮЧЕННЯ ШІ» (mcp.tarasevych.com/agents): ЗАОКРУГЛЕНІ БЛОКИ Й ОДНЕ МЕНЮ ЯКОРІВ (15.11.2026). Без браузера й бази.
// AI-KOPPELINGEN: AFGERONDE BLOKKEN EN ÉÉN ANKERMENU. Zonder browser en zonder database.
//
// Скарги власника:
//  1. Блоки сторінки (попередження «Підключені ШІ зараз бачать не всі надані інструменти», розділи «Огляд», «Конектори»…) мали
//     гострі кути. Причина: загальне правило flat-content (src/canoniek-omlijsting.css) сплющувало кожен <section>/<article>/…-card
//     у вмісті (border-inline:0; border-radius:0; box-shadow:none), а винятки були лише для окремих сторінок.
//  2. Розділи були двічі: липка смуга вкладок над вмістом і меню якорів «Макета» праворуч, з різними назвами й лічильниками,
//     а на сторінці окремого ШІ (#agent/claude) меню якорів зникало, лишалась лише смуга, що лягала поверх вмісту.
//  3. «Технічне» й «Журнал» ховались за нижнім краєм меню без жодної смуги прокрутки.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('ankers-002-agenten-20261115');
  const omlijsting = lees('src/canoniek-omlijsting.css');
  const pagina = lees('src/agenten/AgentenPagina.tsx');
  const mcp = lees('src/McpDienstWeergave.tsx');
  const bron = lees('src/agenten/anker-bron.ts');
  const rail = lees('src/maquette-kern/MaquetteAnkerRail.tsx');
  const railCss = lees('src/maquette-kern/maquette-oppervlakken.css');

  // 1. Кути.
  check('загальне правило flat-content більше не знімає заокруглення з блоків вмісту',
    !/flat-content'\]\s*\.canonical-content\s*:where\(section[^}]*border-radius:0/.test(omlijsting));
  check('ширина вмісту flat-content лишилась (лише кути й рамки повернуто сторінкам)',
    omlijsting.includes(".canonical-chrome[data-surface-model='flat-content'] .canonical-content{width:100%;max-width:none}"));
  check('блоки сторінки мають власне заокруглення (.ag-blok, головні картки розділів)',
    /\.ag-blok\{[^}]*border-radius:var\(--straal-l\)/.test(lees('src/agenten/agenten-pagina.css'))
    && /html\.palet-maquette \.ag-blok \{[^}]*border-radius: var\(--mq-straal-kaart\)/.test(lees('src/agenten/agenten-kern-maquette.css')));

  // 2. Одне меню якорів.
  check('сторінка публікує свої розділи в спільне джерело (назви, піктограми, лічильники, поточний розділ, перехід)',
    pagina.includes('zetAgentAnkers({') && pagina.includes('actief: huidig') && pagina.includes('ga: gaAnker') && bron.includes('export function useAgentAnkers'));
  check('у «Макеті» липкої смуги вкладок немає — розділи лише в меню якорів',
    pagina.includes("{isMaquette ? null : <div className='ag-ankers' data-ag-ankers='1'>"));
  check('меню якорів бере розділи /agents лише зі спільного джерела (жодного власного списку з «Огляд підключень»)',
    mcp.includes('agentAnkers.onderdelen.map(') && !mcp.includes('Огляд підключень') && !mcp.includes('"ag-tab-journaal"'));
  check('меню якорів показується й на сторінці окремого ШІ (#agent/…)',
    !mcp.includes('isAgentDetail') && /isMaquette && !verborgen && !consent && !laagOpen \? \(/.test(mcp));
  check('вибір у меню веде туди ж, куди й сторінка (функція сторінки), а підсвічення стежить за розділом у полі зору',
    mcp.includes('agentAnkers.ga(ankerId.slice("ag-tab-".length))') && mcp.includes('actief={railActief}'));

  // 2b. Стара вада переходу: ціль тримається, поки ліниві розділи вище міняють висоту; людська прокрутка перериває.
  check('перехід до розділу тримає ціль до 4 с і переривається колесом/дотиком/клавішею',
    pagina.includes('const tot = Date.now() + 4000;') && pagina.includes("window.addEventListener('wheel', door") && pagina.includes("window.addEventListener('touchstart', door"));
  check('лінія «у полі зору» — під верхнім краєм прокрутки й scroll-margin-top розділу (без смуги не 24 px від краю екрана)',
    pagina.includes('function doelBoven(el: HTMLElement)') && pagina.includes("Math.max(balk, eerste ? doelBoven(eerste) : 0) + 24"));
  check('у «Макеті» запас прокрутки розділу більше не розрахований на смугу вкладок (6rem замість 11rem)',
    /html\.palet-maquette \.ag-pagina \.ag-sectie \{\s*scroll-margin-top: 6rem;/.test(lees('src/agenten/agenten-kern-maquette.css')));

  // 3. Довгий перелік видно.
  check('смуга прокрутки меню якорів видима (тонка), а не прихована',
    /\.mq-rail-lijst \{[^}]*scrollbar-width: thin/.test(railCss) && !/\.mq-rail-lijst \{[^}]*scrollbar-width: none/.test(railCss));
  check('активний пункт сам прокручується у видиму частину меню', rail.includes('ref={lijstRef}') && rail.includes("querySelector<HTMLElement>('.is-actief')"));

  // Мобільний шар у кінці файла (тест mobiel-cascade стереже весь src/), тут лише контроль, що нове правило не після @media.
  const eersteMedia = railCss.indexOf('@media (max-width');
  check('нові правила меню — до мобільного шару', railCss.indexOf('scrollbar-width: thin') < eersteMedia);
  return einde();
}
