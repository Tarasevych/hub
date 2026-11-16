// UNIF-ANKER-001 (16.11.2026): у класичному вигляді центру облікового запису розділи були у власній смузі з 13 пігулок із номерами —
// без положення, компактності, згортання й шкали перегляду, тобто не так, як меню якорів на інших сторінках сайту.
// Тепер класичний вигляд використовує ту саму рейку MaquetteAnkerRail (чотири змістові групи з піктограмами, вибір вигляду як дія),
// а в звичайних палітрах сайту рейка бере кольори з токенів теми (maquette-rail-site.css) і типово розгорнута.
// Стереже вихідний код; поведінку в Chromium (ПК/телефон, світла/темна тема, клік, положення, перезавантаження) перевіряє стенд
// /mnt/project-files/unif-anker-001/stand/stand.mjs.
// Klassieke weergave van het accountcentrum gebruikt het gedeelde ankermenu; in gewone sitepaletten met de kleuren van het thema.
// Запуск: node scripts/eenheidstests.mjs unif-anker-001-20261116.test.ts
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

export async function main(): Promise<number> {
  const lees = (pad: string) => readFileSync(new URL(`../../${pad}`, import.meta.url), 'utf8');
  const pagina = lees('src/identiteit/IdentiteitAccountPagina.tsx');
  const css = lees('src/identiteit/identiteit-account.css');
  const rail = lees('src/maquette-kern/MaquetteAnkerRail.tsx');
  const siteCss = lees('src/maquette-kern/maquette-rail-site.css');

  // 1. Класичний вигляд: спільна рейка замість власної смуги; оболонка .mq-schil отримує ознаки краю від рейки.
  assert.ok(pagina.includes('<MaquetteAnkerRail'), 'класичний вигляд показує MaquetteAnkerRail');
  assert.ok(!pagina.includes('ia-toc'), 'старої смуги .ia-toc немає');
  assert.ok(pagina.includes("className='ia-account mq-schil'"), 'оболонка .mq-schil для запасу під меню');
  assert.ok(pagina.includes("opslagSleutel='identiteit-account'"), 'власний ключ положення для цієї сторінки');
  // 2. Ті самі чотири змістові групи й піктограми, що в «Студії» та класичному центрі; номер розділу — значок.
  assert.ok(/import \{ ATELIER_GROEPEN, ATELIER_SYMBOLEN, IdentiteitAtelier \} from '\.\/IdentiteitAtelier'/.test(pagina), 'групи й піктограми зі спільного джерела');
  assert.ok(/soort: 'groep' as const[\s\S]{0,200}kiesbaar: false/.test(pagina), 'групи розкриваються, а не ведуть кудись');
  assert.ok(/padStart\(2, '0'\)/.test(pagina), 'номер розділу як значок');
  // 3. Вибір вигляду сторінки — дія меню (раніше компактний перемикач сидів у смузі).
  assert.ok(/soort: 'actie' as const[\s\S]{0,120}onActie: \(\) => kiesVormgeving\(v\)/.test(pagina), 'вибір вигляду як дія меню');
  // 4. Хуки до раннього повернення (інакше React падає при зміні прапорців).
  const hookPos = pagina.indexOf('const ankerItems = useMemo');
  const returnPos = pagina.indexOf("if (!vlaggenBekend()) return");
  assert.ok(hookPos > 0 && returnPos > hookPos, 'useMemo меню до раннього повернення');
  // 5. Запас під меню: колонка по центру, запас біля краю — нижня межа; на ≤ 960 px (підсмуга) запасу немає.
  assert.ok(/@media \(min-width: 961px\) \{[\s\S]*?\.ia-account\.mq-schil\[data-mq-rail-zijde="rechts"\]/.test(css), 'запас праворуч лише на широкому екрані');
  assert.ok(/:not\(#_mq\):not\(#_kolom\) \.ia-account\.mq-schil/.test(css), 'сильніше за загальні правила .mq-schil «Макета»');
  // 6. Звичайні палітри: класичний вигляд рейки, типово розгорнута, акцент теми як r, g, b.
  assert.ok(rail.includes("import './maquette-rail-site.css';"), 'стилі рейки для палітр сайту підключено');
  assert.ok(/const isSitePalet = !useIsMaquette\(\) && !isKlassiekPalet;/.test(rail), 'ознака звичайної палітри');
  assert.ok(/const isKlassiek = isKlassiekPalet \|\| isSitePalet;/.test(rail), 'стриманий класичний вигляд і капсула в палітрах сайту');
  assert.ok(/const standaardIngeklapt = !isSitePalet;/.test(rail), 'у палітрах сайту типово розгорнута');
  assert.ok(/leesKlassiekRailStaat\(opslagSleutel, standaardIngeklapt\)/.test(rail), 'типовий стан передано');
  assert.ok(/function leesSiteAccentRgb\(\)[\s\S]{0,400}color:var\(--accent\)/.test(rail), 'акцент читається з теми');
  assert.ok((rail.match(/style=\{siteStijl\}/g) || []).length === 3, 'акцент — на рейці, вікні положення й підсмузі');
  // 7. Токени для палітр сайту беруться з теми й не зачіпають родину «Макет».
  assert.ok(/html:not\(\.palet-maquette\) :is\(\.mq-anker-rail, \.mq-rail-popover, \.mq-anker-onderbalk/.test(siteCss), 'лише поза «Макетом»');
  for (const [mq, site] of [['--mq-tekst', 'var(--text)'], ['--mq-oppervlak', 'var(--panel)'], ['--mq-rand', 'var(--line)'], ['--mq-accent', 'var(--accent)']]) {
    assert.ok(siteCss.includes(`${mq}: ${site};`), `${mq} ← ${site}`);
  }
  // 8. Стара вада спільної рейки: пошук активного пункту в групі не повертає перший пункт групи.
  assert.ok(/function zoekActiefItem[\s\S]{0,400}return null;\n\}/.test(rail) && /zoekActiefItem\(items, actief\) \?\? items\[0\] \?\? null/.test(rail), 'запасний перший пункт лише на верхньому рівні');
  // 9. Стара вада класичного вигляду: ціль переходу тримається, поки ліниві розділи ростуть; дія людини зупиняє утримання.
  assert.ok(/function gaNaarSectie\(id: string, vasthouden/.test(pagina) && /Date\.now\(\) - begin > 5000/.test(pagina) && /\['wheel', 'touchstart', 'keydown'\]/.test(pagina), 'утримання цілі до 5 с');
  assert.ok(/if \(vasthouden\.current\) return;/.test(pagina), 'під час переходу підсвічування не стрибає');
  // 10. Вікно положення — той самий вигляд, що в «Макеті»: схеми країв, «Вміст кнопок», «Поведінка меню», заокруглені кути.
  assert.ok(/className=\{`mq-zijde-schema is-\$\{z\}`\}/.test(rail), 'схема краю на кожній плитці');
  assert.ok(rail.includes('mq-popover-keuze') && rail.includes('mq-popover-modus') && rail.includes('mq-popover-noot'), 'групи вікна як у «Макеті»');
  assert.ok(siteCss.includes('--mq-straal-kaart: 22px;'), 'вікно положення заокруглене в палітрах сайту');
  console.log('unif-anker-001: 10 groepen controles geslaagd');
  return 0;
}
