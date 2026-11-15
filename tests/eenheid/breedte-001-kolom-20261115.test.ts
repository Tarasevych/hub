// ОДНА КОЛОНКА ДЛЯ ВСІХ БЛОКІВ СТОРІНОК СЛУЖБ + БЛОК «ПІДКЛЮЧИТИ» ПІКТОГРАМАМИ (BREEDTE-001, 15.11.2026). Без браузера й бази.
// ÉÉN KOLOM VOOR ALLE BLOKKEN VAN DIENSTPAGINA'S + BLOK «KOPPELEN» ALS PICTOGRAMMEN. Zonder browser en zonder database.
//
// Скарга власника: на ai.tarasevych.com/agenten блоки різної ширини. Виміряно в Chromium (1920, «Макет», меню якорів праворуч):
// вітрина 24–1561 (уся ширина мінус меню), «ШІ для вас» і плитки «Підключити» 113–1473 (.ai-maquette-inhoud, 1360 px), картки
// агентів 231–1355 (.aie-container 1180 px мінус 28 px відступу). Тепер усе 345–1525 — одна колонка 1180 px, поля зліва й справа
// однакові (321/320), за меню ліворуч так само. Той самий підхід — для «Підключення ШІ» (mcp), розумного дому й GitHub.
// Друге побажання: слово «Підключити» не повторюється на кожній плитці — один заголовок і ряд піктограм із підказкою наслідку.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const W = 1180;

/** Поля «Макета» за формулою з maquette-oppervlakken.css (бік меню / протилежний бік). */
const velden = (breed: number, rail: number) => {
  const centr = (breed - W) / 2;
  return { menu: Math.max(rail, centr), ander: Math.max(0, Math.min(centr, breed - W - rail)) };
};

export async function main(): Promise<number> {
  const { check, einde } = checker('breedte-001-kolom-20261115');
  const opp = lees('src/maquette-kern/maquette-oppervlakken.css');
  const ing = lees('src/agenten/ai-ingangen-pictogrammen.css');
  const tsx = lees('src/AIDienstWeergave.tsx');
  const wikkels = ':is(.ai-maquette-wikkel, .mcp-maquette-wikkel, .domotica-maquette-wikkel, .gh-maquette-wikkel)';

  // Частина 1. Правила колонки.
  check('«Макет» від 961 px: обгортки ШІ, «Підключення ШІ», дому й GitHub мають одну колонку --mq-kolom: 1180px без власної межі',
    opp.includes(`@media (min-width: 961px)`) && opp.includes(`.mq-schil${wikkels} {\n    --mq-kolom: 1180px;`) && /--mq-kolom: 1180px;[\s\S]{0,200}max-width: none;\s*margin-inline: 0;/.test(opp));
  check('запас під меню якорів 284 px, згорнуте — 96 px; він — нижня межа поля з боку меню (праворуч і ліворуч)',
    opp.includes('--mq-kolom-rail: 284px;') && opp.includes('--mq-kolom-rail: 96px;')
    && opp.includes('padding-right: max(var(--mq-kolom-rail), calc((100% - var(--mq-kolom)) / 2));')
    && opp.includes('padding-left: max(var(--mq-kolom-rail), calc((100% - var(--mq-kolom)) / 2));')
    && opp.includes('padding-left: max(0px, min(calc((100% - var(--mq-kolom)) / 2), calc(100% - var(--mq-kolom) - var(--mq-kolom-rail))));'));
  check('внутрішні обгортки (.ai-maquette-inhoud 1360, .aie-container 1180+28, .ag-pagina 1200) займають усю колонку (width:100%, без власної межі) — на будь-якій ширині',
    /\.ai-maquette-wikkel \.ai-maquette-inhoud,\n[^{]*\.ai-maquette-wikkel \.aie-container,\n[^{]*\.mcp-maquette-wikkel \.ag-pagina \{\n  box-sizing: border-box;\n  width: 100%;\n  max-width: none;\n  padding-inline: 0;/.test(opp));
  check('правило колонки сильніше за правила обгорток (:not(#_mq):not(#_kolom) — дві частини id)', (opp.match(/:not\(#_mq\):not\(#_kolom\)/g) || []).length >= 8);
  check('класичні палітри: стрічка, «Підключити» й панель агентів — одна колонка 1180 px по центру',
    /html:not\(\.palet-maquette\):not\(#_ing\) \.canonical-content > :is\(\.ai-richting, \.ag\.ag-ai-ingangen, \.aie-container\) \{[^}]*max-width: 1180px;[^}]*margin-inline: auto;/.test(ing));

  // Частина 2. Формула полів (робоча область = ширина .canonical-content).
  const r1920 = velden(1821, 284);
  check('1920 px, меню праворуч: колонка по центру, поля 320,5/320,5 (виміряно в Chromium 321/320)', r1920.menu === 320.5 && r1920.ander === 320.5, JSON.stringify(r1920));
  const r2560 = velden(2461, 284);
  check('2560 px: колонка по центру (поля 640,5 з обох боків)', r2560.menu === r2560.ander, JSON.stringify(r2560));
  const r1366 = velden(1267, 284);
  check('1366 px: місця замало — з боку меню 284 px запасу, з іншого 0 (колонка звужується, під меню нічого не заходить)', r1366.menu === 284 && r1366.ander === 0, JSON.stringify(r1366));
  const rCompact = velden(1440, 96);
  check('згорнуте меню (96 px) на 1440: колонка по центру, поля 130/130', rCompact.menu === 130 && rCompact.ander === 130, JSON.stringify(rCompact));

  // Частина 3. Блок «Підключити».
  check('слово «Підключити» — один раз як заголовок блоку, а не на кожній плитці', tsx.includes(`<h2 id='ag-ingangen-titel'>{tr('Підключити', 'Koppelen')}</h2>`) && !tsx.includes(`<b>{tr(\`Підключити \${a.naam}\``));
  check('повна назва «Підключити Claude» лишається для читачів екрана (aria-label) і підказка прив\'язана через aria-describedby',
    tsx.includes("aria-label={tr(`Підключити ${a.naam}`, `${a.naam} koppelen`)} aria-describedby={`ag-ingang-tip-${a.slug}`}") && tsx.includes("role='tooltip' id={`ag-ingang-tip-${a.slug}`}"));
  check('підказка пояснює наслідок (куди веде й що там станеться), а не лише назву', tsx.includes('там ви дасте йому доступ лише до свого простору') && tsx.includes('daar geeft u alleen toegang tot uw eigen ruimte'));
  check('наведення / фокус клавіатурою збільшує плитку й показує підказку лише там, де є наведення',
    /@media \(hover: hover\) and \(pointer: fine\) \{[\s\S]*:hover,[\s\S]*:focus-visible \{[\s\S]*transform: scale\(1\.14\);/.test(ing));
  check('сенсорний екран: коротка назва під піктограмою, підказку не показуємо, ряд — сітка без виходу за ширину',
    /@media \(hover: none\), \(pointer: coarse\) \{[\s\S]*grid-template-columns: repeat\(auto-fill, minmax\(68px, 1fr\)\);[\s\S]*\.ag-ingang-naam \{\n    display: block;[\s\S]*\.ag-ingang-tip \{\n    display: none;/.test(ing));
  check('стиль блоку підключено до сторінки', tsx.includes("import './agenten/ai-ingangen-pictogrammen.css';"));
  check('менше руху — без анімацій', /prefers-reduced-motion: reduce[\s\S]*transition: none;/.test(ing));
  return einde();
}
