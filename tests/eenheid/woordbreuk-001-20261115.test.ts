// РОЗІРВАНІ СЛОВА У ВУЗЬКИХ БЛОКАХ (WOORDBREUK-001, 15.11.2026). Без браузера й бази.
// GEBROKEN WOORDEN IN SMALLE BLOKKEN. Zonder browser en zonder database.
//
// Скарга власника (знімки віджетів «Оновлення» й «Діагностика»): позначка стану стояла стовпчиком «г-о-т-о-в-о», «ува-га»,
// а назва («Рендеринг сторінок (браузер на серве») різалась посеред слова без «…». Те саме — у швидкому доступі
// («Налаштува-ння»), у привітанні («Доброг / о») і в рядку «Мова · тема».
// Причини (відтворено в Chromium: /mnt/project-files/woordbreuk-001/stand, 10 сценаріїв, 90 дефектів → 0):
//  1. overflow-wrap:anywhere на пілюлях робить їх мінімальну ширину однією літерою; у флекс-рядку з довгою назвою
//     пілюля стискалась до стовпчика. break-word переносить лише слово, ширше за весь рядок, і не зменшує мінімальну ширину.
//  2. .wb-rij-titel був флекс-контейнером — text-overflow:ellipsis на ньому не діє, тож текст різався без «…».
//  3. modern.css додавав .wb-snel-naam overflow-wrap:anywhere; глобальний svg{display:block} розривав «Українська · ☀ світла».
// Частина 1 сторожить усі CSS у src/: жодна пілюля/бейдж/чип не може мати overflow-wrap:anywhere чи word-break:break-all.
// Частина 2 — правила робочого столу. Частина 3 — опис розгортання без повтору версії.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from './hulp/nep-google';
import { zonderVersieKop } from '../../shared/werkblad-indeling';

const lees = (p: string) => readFileSync(p, 'utf8');
const regel = (css: string, selector: string) => {
  // Лише правило, що починається з нового рядка: «.wb-rijen li>a:hover .wb-rij-titel{» не є правилом «.wb-rij-titel{».
  const i = css.indexOf('\n' + selector + '{');
  return i < 0 ? '' : css.slice(i + 1, css.indexOf('}', i) + 1);
};
function cssBestanden(dir: string, uit: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) cssBestanden(p, uit); else if (p.endsWith('.css')) uit.push(p);
  }
  return uit;
}
/** Усі правила «селектор { оголошення }» без коментарів (вкладені @media/@container розгортаються). */
function regels(css: string): Array<{ selector: string; body: string }> {
  const schoon = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const uit: Array<{ selector: string; body: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schoon))) uit.push({ selector: m[1].replace(/^[\s\S]*\{/, '').trim(), body: m[2] });
  return uit;
}
/** Короткі мітки: клас останньої частини селектора закінчується/складається з pil, pill, badge, chip, label, etiket. */
const LABEL = /\.(?:[\w-]*-)?(?:pil|pill|badge|chip|label|etiket)(?:-[\w-]*)?(?=[\s:.,>+~)[]|$)/;
const laatsteDeel = (sel: string) => sel.split(',').map((s) => s.trim().split(/\s+|>|\+|~/).filter(Boolean).pop() || '');

export async function main(): Promise<number> {
  const { check, einde } = checker('woordbreuk-001-20261115');

  // Частина 1. Пілюлі сайту.
  const prim = lees('src/ontwerp/primitieven.css');
  const pil = prim.slice(prim.indexOf(':where(.pil, .badge, .status-pill'), prim.indexOf('}', prim.indexOf(':where(.pil, .badge, .status-pill')));
  check('базова пілюля (.pil/.badge/.status-pill) переносить лише між словами: overflow-wrap:break-word, без anywhere', /overflow-wrap:break-word/.test(pil) && !/anywhere/.test(pil));
  const порушення: string[] = [];
  for (const f of cssBestanden('src')) {
    for (const { selector, body } of regels(lees(f))) {
      if (!/overflow-wrap:\s*anywhere|word-break:\s*break-all/.test(body)) continue;
      const delen = laatsteDeel(selector).filter((d) => LABEL.test(d));
      if (delen.length) порушення.push(`${f}: ${selector.slice(0, 80)}`);
    }
  }
  check(`жодна пілюля/бейдж/чип/мітка в src/ не має overflow-wrap:anywhere чи word-break:break-all (знайдено ${порушення.length}${порушення.length ? ': ' + порушення.slice(0, 4).join(' | ') : ''})`, порушення.length === 0);
  for (const [f, sel] of [['src/verbindingen/verbindingen.css', '.vbc-badge'], ['src/github-weergave.css', '.gh-chip'], ['src/github-weergave.css', '.gh-label'], ['src/agenten/toegang/toegang.css', '.tg-chip'], ['src/beheer-console.css', '.admin-groep-chip']] as const) {
    const css = lees(f).replace(/\s+/g, ' ');
    const i = css.indexOf(sel + '{') >= 0 ? css.indexOf(sel + '{') : css.indexOf(sel + ' {');
    const r = css.slice(i, css.indexOf('}', i));
    check(`${sel} (${f}) переносить між словами`, i >= 0 && /overflow-wrap: ?break-word/.test(r) && !/anywhere/.test(r));
  }
  // Сам фільтр мусить ловити те, що ловив би: інакше зелений результат нічого не важить.
  check('фільтр міток ловить .pil, .pil-ok, .vbc-badge, .gh-label-knop і не ловить code/pre чи .wb-rij-titel',
    ['.pil', '.pil-ok', '.vbc-badge', '.gh-label-knop', '.admin-groep-chip'].every((s) => LABEL.test(s)) && !['code', 'pre', '.wb-rij-titel', '.label-tekst-groot p'].some((s) => laatsteDeel(s).some((d) => LABEL.test(d))));

  // Частина 2. Робочий стіл.
  const wb = lees('src/werkblad/werkblad.css');
  check('назва рядка (.wb-rij-titel) — блок, а не флекс: «…» справді з’являється', /display:block/.test(regel(wb, '.wb-rij-titel')) && /text-overflow:ellipsis/.test(regel(wb, '.wb-rij-titel')));
  check('рядок «стан · назва · час» — сітка, позначка не стискається (nowrap)', /display:grid;grid-template-columns:auto minmax\(0,1fr\) auto/.test(regel(wb, '.wb-rijen li:has(> .pil:first-child)')) && /white-space:nowrap/.test(regel(wb, '.wb-rijen li:has(> .pil:first-child)>.pil')));
  check('назви рядків вирівняні по одній лінії (subgrid)', wb.includes('@supports (grid-template-columns:subgrid){.wb-rijen>li:has(> .pil:first-child){grid-template-columns:subgrid}}'));
  check('у вузькому блоці (≤ 240 px, ширина блока, а не вікна) назва першим рядком, позначка й час під нею', /@container wb-inhoud \(max-width:240px\)\{\s*\.wb-rijen li:has\(> \.pil:first-child\)\{grid-template-columns:auto minmax\(0,1fr\)\}\s*\.wb-rijen li:has\(> \.pil:first-child\)>\.wb-rij-titel\{grid-column:1 \/ -1;grid-row:1\}/.test(wb));
  check('назва в рядку стану — до двох рядків із переносом між словами', /-webkit-line-clamp:2/.test(regel(wb, '.wb-rij-naam')) && /overflow-wrap:break-word/.test(regel(wb, '.wb-rij-naam')));
  check('системні рядки: значення переходить нижче, а не з’їдає назву', /flex-wrap:wrap/.test(regel(wb, '.wb-systeem li')) && /flex:1 0 auto/.test(regel(wb, '.wb-systeem li>.wb-rij-titel')));
  check('піктограма теми в рядку «Мова · тема» — inline-block (глобальний svg{display:block} не ламає рядок)', /display:inline-block/.test(regel(wb, '.wb-inline-icoon')));
  check('привітання: overflow-wrap:break-word і вузький варіант за шириною блока', /overflow-wrap:break-word/.test(regel(wb, '.wb-begroeting-tekst h2')) && /@container \(max-width:520px\)\{[^\n]*\.wb-begroeting-icoon\{display:none\}[^\n]*\.wb-begroeting-datum\{display:none\}/.test(wb));
  check('швидкий доступ: назва служби без дефісного переносу, шрифт зменшується з плиткою', /hyphens:manual/.test(regel(wb, '.wb-snel-naam')) && /font-size:min\(var\(--tekst-mini\),13cqi\)/.test(regel(wb, '.wb-snel-naam')) && /container-type:inline-size/.test(regel(wb, '.wb-snel-tegel')));
  check('запит ширини віджета для плиток названий (wb-inhoud), бо плитка тепер сама контейнер', /container:wb-inhoud \/ inline-size/.test(regel(wb, '.wb-tegel-inhoud')) && wb.includes('@container wb-inhoud (max-width:380px){.wb-snel{'));
  check('modern.css більше не вмикає anywhere для назв плиток', !/\.wb-snel-naam\s*\{[^}]*anywhere/.test(lees('src/ontwerp/modern.css')));
  const overig = lees('src/werkblad/widgets/Overig.tsx');
  check('віджети «Оновлення» й «Діагностика» кладуть назву в .wb-rij-naam', (overig.match(/className='wb-rij-naam'/g) || []).length >= 2);

  // Частина 3. Опис розгортання без повтору версії.
  check('«Випуск 20261115-162533 встановлено (схвалено passkey).» → «Встановлено (схвалено passkey).»', zonderVersieKop('Випуск 20261115-162533 встановлено (схвалено passkey).', '20261115-162533', 'uk') === 'Встановлено (схвалено passkey).');
  check('«Випуск 20261115-121044: перевірка…» → «Перевірка…»', zonderVersieKop('Випуск 20261115-121044: перевірка служб триває.', '20261115-121044', 'uk') === 'Перевірка служб триває.');
  check('NL «Release 20261115-162533 geïnstalleerd» → «Geïnstalleerd»', zonderVersieKop('Release 20261115-162533 geïnstalleerd.', '20261115-162533', 'nl') === 'Geïnstalleerd.');
  check('інша версія в описі лишається («Повернуто на випуск 20261115-121044…» не чіпаємо)', zonderVersieKop('Повернуто на випуск 20261115-121044 за рішенням власника.', '20261115-135345', 'uk') === 'Повернуто на випуск 20261115-121044 за рішенням власника.');
  check('опис лише з версією не стає порожнім', zonderVersieKop('Випуск 20261115-162533', '20261115-162533', 'uk') === 'Випуск 20261115-162533');
  check('версія з символами регулярного виразу не ламає опис', zonderVersieKop('Випуск a(b встановлено', 'a(b', 'uk') === 'Випуск a(b встановлено');
  return einde();
}
