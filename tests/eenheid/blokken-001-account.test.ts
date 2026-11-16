// BLOKKEN-001 (15.11.2026): браковані блоки центру облікового запису (id.tarasevych.com/account, /menu). Без браузера й бази.
// GEBREKKIGE BLOKKEN IN HET ACCOUNTCENTRUM. Zonder browser en zonder database.
//
// Скарга власника (зі знімками):
//  1. «Ваші дані» → «Формат файлу»: перемикачі намальовано величезними кружками посеред порожнього поля, а підписи з описами
//     вилетіли у вузький стовпчик за правим краєм рамки (по кілька літер у рядку). Відтворено в Chromium: radio мав 927×44 px.
//     Корінь — загальне .settings-center input{width:100%;min-height:44px;padding;border;background} діяв і на radio/checkbox.
//  2. Картка профілю: посеред аватара сіра/кольорова «крапка» — значок камери стояв по центру фото (top/left 50%).
//  3. «Макет»: кнопка «Справжнє налаштування» в картках «Профіль» і «Небезпечні дії» мала порожню ціль і лише прокручувала
//     до верху розділу, нічого не розгортаючи. Тепер кожна картка веде до свого справжнього блоку, запасна ціль — гніздо
//     справжніх налаштувань розділу (а не верх розділу).
//  4. Меню-док знизу/вгорі перекривало кнопку дії після прокрутки до неї: тепер scroll-padding тримає запас на висоту дока.
// Поведінку в браузері перевіряє стенд /mnt/project-files/blokken-001/stand (scan.mjs, echt.mjs, dock.mjs).
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const regel = (css: string, selector: string) => {
  const i = css.indexOf(selector + '{');
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1);
};

export async function main(): Promise<number> {
  const { check, einde } = checker('blokken-001-account');
  const centrum = lees('src/instellingencentrum.css');
  const uitvoerCss = lees('src/instellingen/gegevensuitvoer.css');
  const account = lees('src/identiteit/identiteit-account.css');
  const motor = lees('src/identiteit/maquette/maquette-motor.ts');
  const menu = lees('src/menu-v2.css');

  // 1. Перемикачі й прапорці не розтягуються загальним правилом полів. NL: keuzerondjes en vinkjes niet uitgerekt.
  check('загальне правило полів налаштувань не чіпає radio/checkbox/range (виключення через :where, без зміни специфічності)',
    centrum.includes('.settings-center input:where(:not([type=radio],[type=checkbox],[type=range],[type=color])),.settings-center select,.settings-center textarea{width:100%;min-height:44px;'));
  check('у файлі немає іншого правила, що дає width:100% усім input центру налаштувань',
    !/\.settings-center input,\.settings-center select,\.settings-center textarea\{width:100%/.test(centrum));
  const radio = regel(uitvoerCss, '.gegevensuitvoer-formaat label input[type=radio]');
  check('«Формат файлу»: перемикач має сталий розмір 18 px і не тягнеться (flex 0 0 18px, без min-height 44 px)',
    /width:18px;height:18px;min-width:18px;min-height:0/.test(radio) && /flex:0 0 18px/.test(radio));
  check('«Формат файлу»: підпис займає решту рядка поруч із перемикачем', /\.gegevensuitvoer-formaat label > span\{flex:1 1 auto\}/.test(uitvoerCss));

  // 2. Камера на аватарі — у куті, не посеред обличчя. NL: camera in de hoek.
  const camera = regel(account, '.ia-avatar-camera ').replace(/\/\*[\s\S]*?\*\//g, '');
  check('значок камери на аватарі в правому нижньому куті, без центрування посеред фото',
    /right: -2px;/.test(camera) && /bottom: -2px;/.test(camera) && !/top: 50%/.test(camera) && !/translate\(-50%, -50%\)/.test(camera));

  // 3. «Справжнє налаштування» у «Макеті». NL: «Echte instelling» opent het echte blok.
  check('картки «Профіль», «Дані й експорт», «Небезпечні дії», «Пристрої» мають точну ціль справжнього блоку',
    motor.includes('const ЦІЛЬ_КАРТКИ={"account-0":".ia-profiel","account-1":"#gegevensuitvoer","account-2":".settings-danger","sessions-0":".sessies-overzicht"};')
    && motor.includes('ЦІЛЬ_КАРТКИ[sectionId+"-"+i]||демоДоСайту[sectionId]'));
  check('цілі карток існують у справжніх компонентах (клас/ід не перейменовано)',
    lees('src/identiteit/Profielfoto.tsx').includes("className='settings-profile-card ia-profiel'")
    && lees('src/instellingen/Gegevensuitvoer.tsx').includes("<section id='gegevensuitvoer'")
    && lees('src/InstellingencentrumWeergave.tsx').includes("<section className='settings-danger'>")
    && lees('src/SessiesOverzicht.tsx').includes("className='sessies-overzicht'"));
  const zoek = motor.slice(motor.indexOf('function відкритиНаСайті('), motor.indexOf('function gaNaar('));
  check('без точної цілі кнопка веде до гнізда справжніх налаштувань розділу, а не лише до верху розділу',
    !/if\(!ціль\)return;/.test(zoek) && zoek.includes('if(!доціль&&!ціль&&гніздоГотове&&спроби>=3)доціль=гніздо;'));
  check('якщо селектор цілі не знайшовся за ~3 с, перехід усе одно показує гніздо справжніх налаштувань',
    zoek.includes('if(!доціль){if(++спроби<50){setTimeout(шукати,60);return;}if(гніздоГотове)доціль=гніздо;else return;}'));
  check('знайдену ціль розгорнуто (усі батьківські <details>), прокручено й позначено', zoek.includes('if(!d.open)d.open=true;') && zoek.includes('доціль.scrollIntoView(') && zoek.includes('mq-kaart-doel'));

  // 4. Док знизу/вгорі не перекриває кнопку, до якої прокрутили. NL: dock bedekt de knop niet.
  check('док знизу: scroll-padding-bottom на висоту дока (документ і робоча область)',
    menu.includes("html:has(.canonical-chrome[data-dock='onder']),.canonical-chrome[data-dock='onder'] .canonical-workspace{scroll-padding-bottom:calc(var(--dock-hoogte,62px) + 24px)}"));
  check('док угорі: scroll-padding-top на висоту дока',
    menu.includes("html:has(.canonical-chrome[data-dock='boven']),.canonical-chrome[data-dock='boven'] .canonical-workspace{scroll-padding-top:calc(var(--dock-hoogte,62px) + 24px)}"));
  return einde();
}
