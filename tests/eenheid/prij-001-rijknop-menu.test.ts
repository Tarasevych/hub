// PRIJ-001 (15.11.2026) — перелік листів на телефоні (mail.tarasevych.com/postvak-in), скарга власника: кнопки «⋮» у рядках
// завеликі й негарні (суцільне коло-плитка 44 px з фоном панелі), а меню, яке вони відкривають, штучно коротке — треба гортати,
// хоча екран його вміщає. Причина меню: place() брав лише бік під або над «⋮» (більший із двох), а не всю висоту робочого простору.
// Виміри стенду (справжня збірка, 390×700, 4-й рядок): ДО — меню 465 px при вмісті 483 px → прокрутка; ПІСЛЯ — 431 px, без прокрутки.
// Крім того: підказка «Інші дії» (ViewportKnopinfoLaag) лягала поверх відкритого меню, бо тап на телефоні = фокус.
// Lijst op de telefoon: geen dikke «⋮»-schijf meer, menu gebruikt de hele beschikbare hoogte, tooltip wijkt voor het open menu.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

export async function main(): Promise<number> {
  const { check, einde } = checker('prij-001-rijknop-menu');
  const bron = lees('src/MailRijSnelleActies.tsx');
  // справжня логіка розміщення з компонента, виконана на числах (без браузера) · de echte plaatsingslogica, uitgevoerd op getallen
  const begin = bron.indexOf('const area=maxBottom-minTop;'), eind = bron.indexOf('else{top=minTop;height=area}');
  check('place(): блок розміщення знайдено в MailRijSnelleActies.tsx', begin > 0 && eind > begin);
  const blok = bron.slice(begin, eind + 'else{top=minTop;height=area}'.length).replace(/let top:number,height:number;/, 'let top,height;');
  const plaats = new Function('natural', 'rect', 'minTop', 'maxBottom', `const below=maxBottom-(rect.bottom+6),above=rect.top-6-minTop;${blok};return{top,height}`) as (n: number, r: { top: number; bottom: number; height: number }, minTop: number, maxBottom: number) => { top: number; height: number };
  const knop = (top: number) => ({ top, bottom: top + 44, height: 44 });
  // 390×700: верхня панель до 56 px → minTop 64, низ 692; кнопка на середині екрана, меню 483 px — ні під, ні над не вміщається
  const a = plaats(483, knop(330), 64, 692);
  check('вміщається в робочий простір, але не з одного боку → повна висота, без обрізання, у межах екрана', a.height === 483 && a.top >= 64 && a.top + a.height <= 692, JSON.stringify(a));
  const b = plaats(300, knop(100), 64, 692);
  check('вміщається під кнопкою → під кнопкою, як і раніше', b.top === 150 && b.height === 300, JSON.stringify(b));
  const c = plaats(300, knop(600), 64, 692);
  check('вміщається над кнопкою → над кнопкою, як і раніше', c.top + c.height === 594 && c.height === 300, JSON.stringify(c));
  const d = plaats(900, knop(300), 64, 692);
  check('вище за весь простір → займає всю висоту (64…692), прокрутка лише тоді', d.top === 64 && d.height === 628, JSON.stringify(d));
  check('прокрутка вмикається тільки коли natural > height', bron.includes("pop.style.overflowY=natural>height?'auto':'visible'"));

  const mob = zc(lees('src/mail-mobiel.css'));
  check('«⋮» на телефоні: зона дотику 44×44, але без фону, рамки й тіні', /\.mail-row-actions-more\{display:grid!important;place-items:center;width:44px!important;height:44px!important;padding:0;border:0;border-radius:50%;background:transparent!important;box-shadow:none!important;/.test(mob));
  check('«⋮» на телефоні: м\'який підклад лише під час дотику/наведення/фокусу/відкритого меню', /\.mail-row-actions-more::before\{content:'';position:absolute;inset:5px;/.test(mob) && /\.mail-row-actions-more:is\(:hover,:active,:focus-visible,\[aria-expanded=true\]\)::before\{background:/.test(mob));
  check('«⋮» на телефоні: тонша іконка 18 px', /\.mail-row-actions-more svg\{position:relative;width:18px;height:18px;/.test(mob));
  check('обгортка швидких дій на телефоні без рамки й скла «Макета»', /\.mail-row-hover-actions\{[^}]*border:0!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;/.test(mob));

  const tip = lees('src/ViewportKnopinfoLaag.tsx');
  check('підказка не показується для кнопки з відкритим меню і зникає, щойно меню відкрилося', tip.includes("target?.getAttribute('aria-expanded')!=='true'") && tip.includes("active.target.getAttribute('aria-expanded')==='true')setActive(null)") && tip.includes("attributeFilter:['data-tooltip','aria-expanded']"));
  return einde();
}
