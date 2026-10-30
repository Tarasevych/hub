// Блок 8.4 (26.10.2026): хаб агентів — одна довга сторінка з ледачими секціями й липкою смугою якорів.
// Старі адреси лишаються: #extension-lokaal, #ruimte, ?ontgrendelen=prive|technisch.
// Клік по якорю й далі пише хеш і aria-selected (e2e: [role=tab][aria-selected=true]).
import { readFileSync } from 'node:fs';
import { leesHash, ontgrendelDoel } from '../../src/agenten/agenten-hash';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('agenten-pagina-20261026');
  const pagina = lees('src/agenten/AgentenPagina.tsx');
  const css = lees('src/agenten/agenten.css');
  const hash = lees('src/agenten/agenten-hash.ts');
  const browser = lees('src/extensie/BrowserEnAgenten.tsx');

  check('ледачі секції: не всі важкі панелі змонтовані одразу', pagina.includes('function LuieSectie') && pagina.includes("data-ag-lui={open ? 'open' : 'dicht'}") && pagina.includes('data-ag-sectie={tab}') && pagina.includes('IntersectionObserver') && pagina.includes("data-ag-lang='1'"));
  check('липка смуга якорів', pagina.includes("data-ag-ankers='1'") && pagina.includes("navKlasse='ag-tabs'") && pagina.includes("wrapKlasse='ag-tabs-wrap'") && css.includes('position:sticky') && css.includes('.ag-tabs-wrap{') && css.includes('.ag-sectie,#extension-lokaal,#ruimte{scroll-margin-top:'));
  check('aria-selected лишається на поточному якорі, клік пише хеш', /aria-selected=\{huidig === t\}/.test(pagina) && pagina.includes("role='tab'") && pagina.includes('schrijf(tab, item, true)') && pagina.includes("data-tab={t}"));
  const lok = leesHash('#extension-lokaal');
  const ruim = leesHash('#ruimte');
  check('#extension-lokaal і #ruimte — секція, не «Огляд»', lok.tab === 'extensie' && lok.anker === 'extension-lokaal' && ruim.tab === 'technisch' && ruim.anker === 'ruimte' && hash.includes("'extension-lokaal': 'extensie'") && hash.includes("ruimte: 'technisch'"));
  check('сторінка гортає до цих якорів і монтує «Технічне» навіть поза рядочком', pagina.includes("ANKER_ID.has(plek.anker)") && pagina.includes("plek.anker === 'ruimte'") && pagina.includes("id='extension-lokaal'") === false && lees('src/agenten/TabExtensie.tsx').includes("id='extension-lokaal'") && lees('src/agenten/TabTechnisch.tsx').includes("id='ruimte'"));
  check('?ontgrendelen=prive|technisch відкриває слот браузера, сміття — ні', ontgrendelDoel('?ontgrendelen=prive', new URLSearchParams()) === 'prive' && ontgrendelDoel('?ontgrendelen=technisch', new URLSearchParams()) === 'technisch' && ontgrendelDoel('?ontgrendelen=anders', new URLSearchParams()) === '' && pagina.includes("doel === 'prive' || doel === 'technisch'") && pagina.includes("tab: 'browser'") && browser.includes('data-bea-termijn') && browser.includes('bea-slot-'));
  check('підписи лишаються uk/nl через tr, без третьої мови', pagina.includes("tr(tabInfo[t].uk, tabInfo[t].nl)") && !pagina.includes("lang === 'en'") && !pagina.includes("tr(tabInfo[t].uk, tabInfo[t].nl,"));
  check('закрита секція висока, сусід монтується, прокрутка пише хеш', css.includes(".ag-sectie[data-ag-lui='dicht']{min-height:18rem}") && css.includes('.ag-lui-plaats{min-height:16rem}') && pagina.includes("schrijf(gezien as TabId, '', false)") && pagina.includes('toon[Math.max(0, toon.indexOf(huidig) + 1)] === t') && pagina.includes('schrijf(tab, item, true)'));

  return einde();
}
