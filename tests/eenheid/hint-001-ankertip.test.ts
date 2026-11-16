// HINT-001 (15.11.2026): у навігації якорів «Макета» (id /menu тощо) при наведенні назва пункту з'являлась ще двічі:
// темна загальна підказка сайту (шар data-tooltip) і кольорова бульбашка меню — навіть коли назву й так видно.
// Тепер: лише одна підказка (бульбашка меню), лише коли пункт показує саму піктограму; на дотик — жодної.
// Стереже вихідний код двигуна й спільної рейки (поведінку в Chromium перевіряє стенд /mnt/project-files/hint-001/stand).
// Eén hint, alleen bij alleen-pictogram; de algemene data-tooltip-laag pakt de ankeritems niet meer.
// Запуск: node scripts/eenheidstests.mjs hint-001-ankertip.test.ts
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

export async function main(): Promise<number> {
  const motor = readFileSync(new URL('../../src/identiteit/maquette/maquette-motor.ts', import.meta.url), 'utf8');
  const rail = readFileSync(new URL('../../src/maquette-kern/MaquetteAnkerRail.tsx', import.meta.url), 'utf8');

  // 1. Пункти якорів не мають data-tooltip — інакше загальний шар сайту показує другу (темну) підказку.
  assert.ok(!/class="(anchor-link|nav-group-toggle)"[^>]*data-tooltip=/.test(motor), 'пункти якорів не повинні мати data-tooltip');
  assert.ok(motor.includes('data-anker-tip="'), 'власний атрибут бульбашки меню');
  // 2. Підпис для зчитувачів екрана лишається.
  assert.ok(/class="anchor-link"[^>]*aria-label="'\+name\+'"/.test(motor), 'aria-label якоря');
  assert.ok(/class="nav-group-toggle"[^>]*aria-label="'\+label\+'"/.test(motor), 'aria-label групи');
  // 3. Бульбашка залежить від того, чи справді видно назву, а не від налаштування «компактно/авто».
  assert.ok(/function isIconNav\(el\)\{[\s\S]{0,400}\.anchor-name,\.nav-group-name[\s\S]{0,200}getClientRects/.test(motor), 'isIconNav перевіряє видимість назви');
  assert.ok(!/function isIconNav\(\)\{[\s\S]{0,120}preferences\.compact/.test(motor), 'не за preferences.compact');
  assert.ok(/isIconNav\(el\)/.test(motor.slice(motor.indexOf('function showAnchorTooltip'))), 'showAnchorTooltip передає пункт');
  // 4. Авто-панель, що розгортається під мишею, ховає бульбашку.
  assert.ok(/function applyRailCollapsed\(collapsed\)\{[\s\S]{0,120}if\(!collapsed\)herzieAnkerTip\(\)/.test(motor), 'розгортання ховає бульбашку');
  // 5. Дотик не показує підказку; фокус — лише з клавіатури.
  assert.ok(/addEventListener\("pointerover",e=>\{[\s\S]{0,160}pointerType==="touch"\)return/.test(motor), 'дотик без підказки');
  assert.ok(/focusin",e=>\{[^}]*:focus-visible/.test(motor), 'фокус лише з клавіатури');
  // 6. Спільна рейка інших сторінок: підказка-title лише в компактному режимі (коли назви сховані CSS), без data-tooltip.
  assert.equal((rail.match(/title=\{compact \? item\.label : undefined\}/g) || []).length, 2, 'title лише в компактному режимі');
  assert.ok(!/mq-anker-(knop|groep-toggle)[^\n]*data-tooltip/.test(rail), 'рейка без data-tooltip');

  console.log('hint-001-ankertip: 12/12 OK');
  return 0;
}
