// СТОРІНКА ОНОВЛЕНЬ admin.tarasevych.com/updates ПО ЦЕНТРУ, ВУЖЧА, ІЗ ЗАОКРУГЛЕНИМИ КАРТКАМИ (15.11.2026). Без браузера й бази.
// UPDATES-PAGINA GECENTREERD, SMALLER EN MET AFGERONDE KAARTEN. Zonder browser en zonder database.
//
// Скарги власника:
//  1. Блоки сторінки оновлень мали гострі кути й тягнулися на 1320–1460 px. Причина кутів: загальне правило flat-content
//     (src/canoniek-omlijsting.css) сплющувало кожен <section> у вмісті: border-inline:0 і border-radius:0. Захист був лише для
//     класичного стилю «Макета»; в інших палітрах картки оновлень були плоскими.
//  2. Стан «Завантажуємо адміністративний контекст…» був великою панеллю на всю ширину з гострими кутами (той самий flat-content).
//  3. У вужчій колонці підписи конвеєра обрізались трикрапкою («Перевірка са…»); на планшеті 768 px таких було 5.
// Частина 1 перевіряє правила й розмітку; частина 2 перераховує поля «Макета» з меню розділів праворуч.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-centrering-20261115');
  const omlijsting = lees('src/canoniek-omlijsting.css');
  const uitrolCss = lees('src/beheer-uitrol.css');
  const conveyorCss = lees('src/uitrol/uitrol.css');
  const laden = lees('src/beheer-laden.css');
  const console_ = lees('src/BeheerConsoleWeergave.tsx');
  const uitrol = lees('src/BeheerUitrolWeergave.tsx');

  // Частина 1. Правила й розмітка.
  check('flat-content не сплющує картки сторінки оновлень (:not(.ut-root *))',
    omlijsting.includes(':not(.mr-mq *):not(.ut-root *){border-inline:0;border-radius:0;box-shadow:none}'));
  check('консоль на вкладці «Оновлення» — 1180 px по центру, сильніше за правило «Макета» (1460 px)',
    uitrolCss.includes('html:not(#_uitrol) .admin-console:has([data-admin-uitrol]){max-width:1180px}'));
  check('«Макет» з меню збоку: поля симетричні, коли є місце; запас під меню — нижня межа; лише від 961 px',
    /@media \(min-width:961px\)\{[\s\S]*padding-right:max\(var\(--ut-rail\),calc\(\(100% - 1180px\) \/ 2\)\);padding-left:max\(0px,min\(calc\(\(100% - 1180px\) \/ 2\),calc\(100% - 1180px - var\(--ut-rail\)\)\)\)/.test(uitrolCss)
    && uitrolCss.includes('{--ut-rail:96px}'));
  check('підписи конвеєра переносяться, а не обрізаються трикрапкою',
    /\.ut-conv-tekst b\{[^}]*white-space:normal/.test(conveyorCss) && !/\.ut-conv-tekst b\{[^}]*ellipsis/.test(conveyorCss) && !/\.ut-conv-sub\{[^}]*ellipsis/.test(conveyorCss));
  check('завантаження консолі — компактний індикатор <div class="admin-laden"> з role=status, не панель-<section>',
    /if\(loading\)return <div className='admin-laden' role='status' aria-busy='true'/.test(console_) && !/<section className=\{isMaquette\?'admin-boundary/.test(console_));
  check('сторінка оновлень, діагностика й ключі використовують той самий індикатор',
    uitrol.includes("if (!data) return <div className='admin-laden' role='status'")
    && lees('src/BeheerDiagnostiekWeergave.tsx').includes("<div className='admin-laden admin-diagnostics-loading' role='status'")
    && lees('src/BeheerSleutelsWeergave.tsx').includes("<div className='admin-laden' data-admin-keys='loading' role='status'"));
  check('індикатор без рамки й фону; лише змінні теми', /\.admin-laden\{[^}]*background:none;border:0;box-shadow:none/.test(laden) && !/#[0-9a-f]{3,6}\b/i.test(laden));

  // Частина 2. Поля «Макета»: робоча область W, колонка 1180 px, меню праворуч R.
  const velden = (W: number, R: number) => {
    const half = (W - 1180) / 2;
    return { rechts: Math.max(R, half), links: Math.max(0, Math.min(half, W - 1180 - R)) };
  };
  // 1920 px екрана → робоча область 1836 px (смуга сайту 60 + поле 24).
  const v1920 = velden(1836, 284);
  check('1920 px, меню праворуч: поля 328/328 — колонка точно по центру, меню вміщується', v1920.links === 328 && v1920.rechts === 328);
  const v1366 = velden(1282, 284);
  check('1366 px: місця мало — запас під меню 284 px, ліворуч 0 (як раніше, вміст не стискається)', v1366.rechts === 284 && v1366.links === 0);
  const vCompact = velden(1452, 96);
  check('1536 px, згорнуте меню (96 px): колонка по центру 136/136', vCompact.links === 136 && vCompact.rechts === 136);
  return einde();
}
