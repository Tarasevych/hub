// PRIJ-002 (16.11.2026) — швидкі дії рядка на комп'ютері розгортаються з «⋮». Павло: кнопки «Перегляд», «Відкласти», «Архівувати»,
// «До кошика», «Прочитано» світилися при кожному наведенні на лист; хоче, щоб при наведенні на лист була лише «⋮», а кнопки
// розгорталися, коли наводиш на «⋮». Стенд (справжня збірка, 1280×720): ДО — смужка 159 px при наведенні на рядок; ПІСЛЯ — 27 px
// («⋮»), при наведенні на «⋮» / фокусі — 159 px; курсор на «Архівувати» не згортає смужку; «око» в даті видно, поки «Перегляд» згорнуто.
// Snelle acties op de computer klappen uit vanuit «⋮»; telefoon ongewijzigd (daar opent «⋮» het menu).
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

export async function main(): Promise<number> {
  const { check, einde } = checker('prij-002-uitklap');
  const css = zc(lees('src/mail-rij-uitklap.css'));
  const bron = lees('src/MailRijSnelleActies.tsx');
  check('стилі розгортання підключає сам компонент швидких дій', bron.includes("import'./mail-rij-uitklap.css';"));
  check('лише миша й ширина > 720 px (телефон не зачеплено)', /@media \(hover:hover\) and \(pointer:fine\) and \(min-width:721px\)\{/.test(css));
  check('згорнуто, доки смужка не під курсором, без фокусу й без відкритого меню', css.includes('.mail-row-hover-actions:not(:hover):not(:focus-within):not(:has([aria-expanded=true]))>button{max-width:0;width:0!important;'));
  check('згорнуті кнопки не фокусуються й не ловлять курсор', /:not\(:has\(\[aria-expanded=true\]\)\)>button\{[^}]*visibility:hidden;pointer-events:none;/.test(css));
  check('«⋮» не згортається (правило лише для прямих кнопок, «⋮» — у .mail-row-actions-overflow)', !/actions-overflow[^{]*\{[^}]*width:0/.test(css));
  check('без анімації за prefers-reduced-motion', /@media \(prefers-reduced-motion:reduce\)\{[^@]*transition:none!important/.test(css));
  check('«око» в даті ховається лише коли «Перегляд» у смужці справді видно', bron.includes(`(balk.querySelector<HTMLElement>("[data-mail-actie='preview']")?.offsetWidth||0)>0`));
  // PRIJ-003 (16.11.2026): Павло — підказка «⋮» лише за правим кліком, щоб не світилася постійно
  check('PRIJ-003: «⋮» без data-tooltip (загальний шар підказок її не показує при наведенні)', !/className='mail-row-actions-more'[^>]*data-tooltip=/.test(bron));
  check('PRIJ-003: правий клік (contextmenu) показує підказку, без системного меню; сама зникає за 4 с і коли курсор іде з кнопки', bron.includes('data-hint-open={hint?\'true\':undefined} onContextMenu={event=>{') && bron.includes('event.preventDefault();event.stopPropagation();setHint(true)') && bron.includes('setTimeout(()=>setHint(false),4000)') && bron.includes('onPointerLeave={()=>{window.clearTimeout(hintTimer.current);setHint(false)}}'));
  check('PRIJ-003: таймер прибирається при демонтажі рядка', bron.includes('useEffect(()=>()=>window.clearTimeout(hintTimer.current),[])'));
  check('PRIJ-003: підказка пояснює наслідки наведення й натискання (uk/nl)', bron.includes('Наведіть — розгорнуться швидкі дії; натисніть — меню з усіма діями з листом') && bron.includes('Aanwijzen toont snelle acties; klikken opent het menu met alle berichtacties'));
  const css2 = zc(lees('src/mail-rij-uitklap.css'));
  check('PRIJ-003: CSS ховає підказку без data-hint-open і показує з ним (не при відкритому меню)', css2.includes(".mail-row-actions-more:not([data-hint-open])>span[role='tooltip']{opacity:0!important;visibility:hidden}") && css2.includes(".mail-row-actions-more[data-hint-open]:not([aria-expanded=true])>span[role='tooltip']{opacity:1;visibility:visible}"));
  check('мобільний шар у кінці: mail-mobiel.css не змінено цим файлом, а uitklap не має @media max-width', !/max-width:\s*720px/.test(css));
  check('PRIJ-003: підказка «⋮» вирівняна по правому краю й переноситься (не виходить за екран)', css2.includes(".mail-row-actions-more>span[role='tooltip']{right:0;translate:0 0;width:max-content;max-width:min(260px,calc(100vw - 24px));white-space:normal;"));
  return einde();
}
