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
  check('підказка «⋮» пояснює наслідок натискання (uk/nl)', (bron.match(/Натисніть, щоб відкрити всі дії з листом/g) || []).length === 2 && bron.includes('Klik om alle acties voor dit bericht te openen'));
  check('мобільний шар у кінці: mail-mobiel.css не змінено цим файлом, а uitklap не має @media max-width', !/max-width:\s*720px/.test(css));
  return einde();
}
