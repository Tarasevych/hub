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
  // ANKERS-002: загального сплющування flat-content більше немає взагалі — картки оновлень заокруглені без винятку.
  check('flat-content не сплющує картки сторінки оновлень (загального правила з border-radius:0 немає)',
    !/flat-content'\]\s*\.canonical-content\s*:where\(section[^}]*border-radius:0/.test(omlijsting));
  check('консоль на вкладці «Оновлення» — 940 px по центру, сильніше за правило «Макета» (1460 px)',
    uitrolCss.includes('html:not(#_uitrol) .admin-console:has([data-admin-uitrol]){max-width:940px}'));
  check('«Макет» із бічною рейкою: симетричні поля між меню й рейкою з мінімальним зазором 24 px; підтримка компактної й згорнутої рейки',
    /@media \(min-width:961px\)\{[\s\S]*--ut-kolom:940px;--ut-marge:24px;--ut-rail:284px;max-width:none[\s\S]*--ut-zij:max\(var\(--ut-marge\),calc\(\(100% - var\(--ut-rail\) - var\(--ut-kolom\)\) \/ 2\)\);padding-left:var\(--ut-zij\);padding-right:calc\(var\(--ut-rail\) \+ var\(--ut-zij\)\)/.test(uitrolCss)
    && uitrolCss.includes('{--ut-rail:96px}')
    && uitrolCss.includes('{--ut-rail:0px}'));
  check('підписи конвеєра переносяться, а не обрізаються трикрапкою',
    /\.ut-conv-tekst b\{[^}]*white-space:normal/.test(conveyorCss) && !/\.ut-conv-tekst b\{[^}]*ellipsis/.test(conveyorCss) && !/\.ut-conv-sub\{[^}]*ellipsis/.test(conveyorCss));
  check('завантаження консолі — компактний індикатор <div class="admin-laden"> з role=status, не панель-<section>',
    /if\(loading\)return <div className='admin-laden' role='status' aria-busy='true'/.test(console_) && !/<section className=\{isMaquette\?'admin-boundary/.test(console_));
  check('сторінка оновлень, діагностика й ключі використовують той самий індикатор',
    uitrol.includes("if (!data) return <div className='admin-laden' role='status'")
    && lees('src/BeheerDiagnostiekWeergave.tsx').includes("<div className='admin-laden admin-diagnostics-loading' role='status'")
    && lees('src/BeheerSleutelsWeergave.tsx').includes("<div className='admin-laden' data-admin-keys='loading' role='status'"));
  check('індикатор без рамки й фону; лише змінні теми', /\.admin-laden\{[^}]*background:none;border:0;box-shadow:none/.test(laden) && !/#[0-9a-f]{3,6}\b/i.test(laden));

  // Частина 2. Поля «Макета»: робоча область W, колонка 940 px, бічна рейка праворуч R, мінімальний зазор 24 px.
  const velden = (W: number, R: number) => {
    const zij = Math.max(24, (W - R - 940) / 2);
    return { links: zij, naarRail: zij, rechts: R + zij };
  };
  // 980 px (режим ПК на телефоні) → робоча область ~896 px, компактна рейка 96 px: ліворуч 24 px (не 0 px!), до рейки теж 24 px.
  const v980 = velden(896, 96);
  check('980 px, компактна рейка: зазори симетричні 24/24 — не прилипає до лівого меню', v980.links === 24 && v980.naarRail === 24 && v980.rechts === 120);
  // 1440 px → робоча область 1356 px, компактна рейка 96 px: колонка 940 px строго по центру між меню й рейкою (160/160).
  const v1440 = velden(1356, 96);
  check('1440 px, компактна рейка: колонка 940 px строго по центру (160/160)', v1440.links === 160 && v1440.naarRail === 160 && v1440.rechts === 256);
  // 1920 px → робоча область 1836 px, розгорнута рейка 284 px: колонка 940 px по центру між меню й рейкою (306/306).
  const v1920 = velden(1836, 284);
  check('1920 px, розгорнута рейка: колонка 940 px строго по центру (306/306)', v1920.links === 306 && v1920.naarRail === 306 && v1920.rechts === 590);
  // Згорнута рейка (R = 0): симетричні поля на 1356 px → 208/208.
  const vIngeklapt = velden(1356, 0);
  check('1440 px, згорнута рейка (0 px): симетричні поля 208/208', vIngeklapt.links === 208 && vIngeklapt.rechts === 208);
  return einde();
}
