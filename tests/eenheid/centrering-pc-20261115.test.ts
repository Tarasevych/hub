// ЦЕНТРУВАННЯ ЦЕНТРУ ОБЛІКОВОГО ЗАПИСУ НА ШИРОКОМУ ПК (15.11.2026). Без браузера й бази.
// CENTREREN VAN HET ACCOUNTCENTRUM OP EEN BREDE PC. Zonder browser en zonder database.
//
// Скарга власника: на id.tarasevych.com/beveiliging блоки притиснуті вліво, а головна сторінка стоїть не по центру.
// Причини (відтворено в Chromium на 1366/1920/2560):
//  1. .access-plane (ключі доступу, 2FA, шифрування, відновлення) мав max-width 860 px без margin:auto — колонка липла до лівого краю
//     панелі в усіх трьох виглядах, праворуч лишалося до 600 px порожнечі.
//  2. У «Макеті» колонка справжньої панелі (.settings-center, до 1100 px) мала margin:0 — теж ліворуч.
//  3. У «Макеті» .page-wrap (max-width 1580, margin:auto) тримав запас під меню якорів від СВОГО краю, а не від екрана: сторінка
//     зсувалася на 116 px (меню ліворуч) чи 44 px (праворуч) навіть на 2560 px, де меню далеко.
//  4. У «Студії» картки груп на головній (.mr-at-tegels) мали auto-fill — на широкому екрані резервувалися порожні колонки праворуч.
// Частина 1 перевіряє правила; частина 2 перераховує формулу полів «Макета» для типових ширин і запасів.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const regel = (css: string, selector: string) => {
  const i = css.indexOf(selector + '{');
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1);
};

export async function main(): Promise<number> {
  const { check, einde } = checker('centrering-pc-20261115');
  const toegang = lees('src/toegangslaag.css');
  const omlijsting = lees('src/identiteit/maquette/maquette-omlijsting.css');
  const atelier = lees('src/identiteit/identiteit-atelier.css');

  // Частина 1. Правила.
  // width:100% обов'язкова: з margin:auto елемент сітки стискається до вмісту, а container-type:inline-size дає вмісту ширину 0 (перша спроба виправлення так і зникла).
  check('колонка панелей входу й безпеки (.access-plane, 860 px) стоїть по центру свого блоку й не стискається до 0', /margin-inline:auto/.test(regel(toegang, '.access-plane')) && /width:100%;max-width:860px/.test(regel(toegang, '.access-plane')));
  check('«Макет»: колонка справжньої панелі (.settings-center) по центру блоку, не margin:0',
    /margin:0 auto/.test(regel(omlijsting, '.mr-mq.mr-mq.mr-mq.mr-mq .mq-echt-inhoud>.settings-center')));
  check('«Студія»: картки груп на головній заповнюють рядок (auto-fit), а не лишають порожні колонки праворуч (auto-fill)',
    /repeat\(auto-fit,/.test(regel(atelier, '.mr-at-tegels')) && !/repeat\(auto-fill,/.test(regel(atelier, '.mr-at-tegels')));
  const links = regel(omlijsting, '.mr-mq.mr-mq.mr-mq.mr-mq.mr-mq.mr-mq:not(.bp-max-1280):not(.rail-smart-condensed).rail-left .page-wrap');
  const rechts = regel(omlijsting, '.mr-mq.mr-mq.mr-mq.mr-mq.mr-mq.mr-mq:not(.bp-max-1280):not(.rail-smart-condensed).rail-right .page-wrap');
  check('«Макет» понад 1280 px: .page-wrap на всю робочу область, поля симетричні, запас під меню якорів — нижня межа',
    [links, rechts].every(r => r.includes('max-width:none!important') && r.includes('max(var(--mq-rand),calc((100% - 1476px) / 2))!important')
      && r.includes('max(52px,min(calc((100% - 1476px) / 2),calc(100% - 1476px - var(--mq-rand))))!important')));
  check('запаси --mq-rand повторюють чинні значення макета (168/96 px для «авто» й згорнутого меню)',
    omlijsting.includes('.mr-mq.mr-mq.mr-mq.mr-mq.rail-left:is(.rail-mode-auto,.rail-compact){--mq-rand:168px}')
    && omlijsting.includes('.mr-mq.mr-mq.mr-mq.mr-mq.rail-right:is(.rail-mode-auto,.rail-compact){--mq-rand:96px}'));
  const stijlen = lees('src/identiteit/maquette/maquette-stijlen.css');
  check('ці запаси справді є в згенерованих стилях (якщо макет зміниться — тест нагадає оновити --mq-rand)',
    stijlen.includes('padding-left:calc(91px + 60px + 17px)!important') && stijlen.includes('padding-right:calc(19px + 60px + 17px)!important')
    && stijlen.includes('padding-left:calc(91px + var(--side-nav-width,212px) + 17px)!important'));
  // Мобільний шар має лишитися в кінці файла (правило mobiel-cascade-20261105): новий блок стоїть до нього.
  check('новий блок центрування стоїть перед мобільним шаром', omlijsting.indexOf('Центрування сторінки на широкому ПК') < omlijsting.indexOf('Мобільний шар наприкінці файла'));

  // Частина 2. Формула полів (те саме, що рахує браузер): робоча область B, вміст 1476 px, запас r з боку меню.
  const velden = (B: number, r: number) => {
    const half = (B - 1476) / 2;
    const menu = Math.max(r, half);
    const ander = Math.max(52, Math.min(half, B - 1476 - r));
    return { menu, ander, vlak: B - menu - ander };
  };
  // 1920 px екрана = 1860 px робочої області (смуга сайту 60 px). 2560 → 2500.
  const v1920 = velden(1860, 168), v2560 = velden(2500, 168);
  check('1920 px, меню ліворуч («авто»): поля 192/192, вміст 1476 px (було 308/192 і 1360 px)', v1920.menu === 192 && v1920.ander === 192 && v1920.vlak === 1476);
  check('2560 px: поля 512/512 — сторінка точно по центру (було 628/512)', v2560.menu === 512 && v2560.ander === 512);
  const v1366 = velden(1306, 168);
  check('1366 px: місця мало — запас під меню 168 px зберігається, інший бік 52 px (як і раніше)', v1366.menu === 168 && v1366.ander === 52);
  const vOpen = velden(1860, 320);
  check('1920 px, розгорнуте меню (320 px): вміст не заходить під меню, інший бік поступається', vOpen.menu === 320 && vOpen.ander === 64 && vOpen.vlak === 1476);
  return einde();
}
