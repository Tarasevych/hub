// СПЛИВНЕ МЕНЮ ОБЛІКОВИХ ЗАПИСІВ: БЕЗ КВАДРАТНОЇ СМУГИ ТЛА ДО НИЗУ ВІКНА (MENU-STROOK-001, 15.11.2026). Без браузера й бази.
// ACCOUNTMENU: GEEN VIERKANTE ACHTERGRONDSTROOK TOT ONDERAAN HET VENSTER. Zonder browser en zonder database.
//
// Скарга власника (знімок ai.tarasevych.com, темна тема): меню з аватара стало довгою темною смугою на всю висоту сторінки,
// заокруглений контур картки видно, але тло малюється поверх і нижче нього, квадратне.
// Причина: шар .canonical-account-portal (з 14.11.2026, GEMINI-001) отримує клас теми (theme-dark/-light) заради змінних,
// а загальне правило src/index.css «.theme-dark,.theme-light{min-height:100svh;background:var(--bg)}» робило з шару смугу
// заввишки з вікно. Те саме — мобільний шар .am3-mobiel-laag (там тло перекривало напівпрозоре затемнення).
// Друга дрібниця: загальне «footer{margin:2rem auto 0}» додавало 32 px порожнечі між «Вийти» і підвалом меню v3.
// Перевірено на стенді (справжня збірка, Playwright): висота шару = висоті картки, тло прозоре, у низькому вікні прокрутка
// всередині картки.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('accountmenu-strook-20261115');
  const menuCss = lees('src/canoniek-account-menu.css');
  const v3Css = lees('src/accountmenu-v3/accountmenu-v3.css');
  const index = lees('src/index.css');
  const menu = lees('src/CanoniekAccountMenu.tsx');

  // Передумова: глобальне правило теми досі існує (якщо його приберуть — тест нагадає переглянути заплатку).
  check('загальне правило теми з висотою на весь екран є в src/index.css (причина вади)',
    /\.theme-dark,\s*\.theme-light\s*\{[^}]*min-height:100svh[^}]*background:var\(--bg\)/.test(index));

  // 1. Шар меню не має власної висоти й тла за жодної теми.
  const strook = menuCss.match(/:is\(\.canonical-account-portal,\.am3-mobiel-laag\):is\(\.theme-dark,\.theme-light,\.theme-plum-dark,\.theme-plum-light\)\{([^}]*)\}/);
  check('шар меню (ПК і телефон) з будь-яким класом теми: min-height:0 і без тла', !!strook && /min-height:0/.test(strook[1]) && /background:none/.test(strook[1]));
  check('шар меню на ПК отримує клас теми з порталу (вада відтворювалась саме так)', /className=\{`canonical-account-portal \$\{portaalCtx\.themaKlasse\}`\}/.test(menu));

  // 2. Висота картки v3 за вікном, прокрутка всередині картки.
  const v3 = menuCss.match(/\.canonical-account-portal \.canonical-account-menu\[data-account-menu-v3\] \.canonical-account-panel\{([^}]*)\}/);
  check('картка v3 на ПК: max-height від --am3-portaal-max з урахуванням масштабу', !!v3 && /max-height:calc\(var\(--am3-portaal-max,[^)]*\)\) \/ var\(--am3-scale,1\)\)/.test(v3[1]));
  check('картка v3 на ПК прокручується всередині (overflow-y:auto), без бічної прокрутки', !!v3 && /overflow-y:auto/.test(v3[1]) && /overflow-x:hidden/.test(v3[1]) && /overscroll-behavior:contain/.test(v3[1]));
  check('CanoniekAccountMenu ставить --am3-portaal-max для меню v3 (висота вікна мінус верх меню)',
    /if \(am3\) \{[\s\S]{0,300}'--am3-portaal-max'/.test(menu) && /calc\(100dvh - \$\{\(parseInt\(String\(stijl\.top\), 10\) \|\| 70\) \+ 16\}px\)/.test(menu));

  // 3. Підвал меню v3 без успадкованих правил footer (відступ 2rem, на телефоні — стовпчик).
  check('загальні правила footer існують (причина порожнечі й стовпчика)', /footer \{[^}]*margin:2rem auto 0/.test(index) && /footer \{ align-items:flex-start; flex-direction:column; \}/.test(index));
  check('підвал меню v3 скидає margin і лишається рядком', /\[data-account-menu-v3\] \.am3-footer \{\s*position: relative;\s*margin: 0;\s*flex-direction: row;/.test(v3Css));

  return einde();
}
