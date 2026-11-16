// КНОПКА «НАЛАШТУВАТИ РОБОЧИЙ СТІЛ» — ПІКТОГРАМА В КУТІ (WB-HOEK-001, 15.11.2026). Без браузера й бази.
// KNOP «WERKBLAD INSTELLEN» — ICOON IN DE HOEK. Zonder browser en zonder database.
//
// Скарга власника: на головній під шапкою з лічильниками стояла широка темна смуга на всю ширину з великою кнопкою
// «Налаштувати робочий стіл». Причина: у «Макеті» (обидва стилі) смуга .wb-balk мала власну підкладку з рамкою, а кнопка —
// підпис. Тепер смуга прозора, кнопка — кругла піктограма в куті; назва — aria-label, пояснення наслідку — підказка
// data-tooltip (спільний шар підказок). Перевірено в Chromium на 1440 і 390 px.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
const zonderCommentaar = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
// Усі правила, чий селектор (весь, після коми) закінчується заданим фрагментом.
const tila = (css: string, einde: string) => {
  const uit: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    if (m[1].split(',').some(s => s.trim().endsWith(einde))) uit.push(m[2]);
  }
  return uit;
};

export async function main(): Promise<number> {
  const { check, einde } = checker('werkblad-hoek-20261115');
  const tsx = lees('src/werkblad/WerkbladV3.tsx');
  const maquette = zonderCommentaar(lees('src/werkblad/werkblad-maquette.css'));
  const basis = zonderCommentaar(lees('src/werkblad/werkblad.css'));

  const knop = tsx.slice(tsx.indexOf("data-wb3='instellen'") - 200, tsx.indexOf("data-wb3='instellen'") + 900);
  const knopTag = knop.slice(knop.lastIndexOf('<button', 200), knop.indexOf('</button>') + 9);
  check('кнопка «Налаштувати робочий стіл» — лише піктограма, без видимого підпису',
    /className='[^']*wb3-instellen-icoon/.test(knopTag) && /<Settings2 aria-hidden='true' \/><\/button>$/.test(knopTag));
  check('у неї є назва для читачів екрана українською й нідерландською',
    /aria-label=\{tr\(lang, 'Налаштувати робочий стіл', 'Werkblad instellen'\)\}/.test(knopTag));
  check('підказка пояснює, що станеться, а не лише повторює назву (обидві мови)',
    /data-tooltip=\{tr\(lang, 'Налаштувати робочий стіл: [^']{40,}', 'Werkblad instellen: [^']{40,}'\)\}/.test(knopTag));

  const balk = tila(maquette, '.werkblad .wb-balk');
  check('«Макет»: смуга .wb-balk без підкладки, рамки й тіні (обидва стилі, ПК і телефон)',
    balk.length >= 2 && balk.every(t => !/background:(?!\s*transparent)|border:\s*1px|box-shadow:(?!\s*none)|backdrop-filter:\s*blur|padding:(?!\s*0;)\s*\d/.test(t)));
  check('«Класичний» стиль «Макета» більше не повертає смузі картку через захист специфічності',
    !maquette.includes('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) .werkblad .wb-balk,'));
  const icoon = tila(basis, '.wb-balk-acties .wb3-instellen-icoon').join(';');
  check('піктограма кругла й не менша за зону дотику (--tik-hoogte: 40 px ПК, 44 px телефон)',
    /border-radius:999px/.test(icoon) && /width:var\(--tik-hoogte\)/.test(icoon) && /height:var\(--tik-hoogte\)/.test(icoon) && /padding:0/.test(icoon));
  check('телефон: піктограма лишається в правому куті, а не на початку рядка',
    /\.wb-balk-acties:has\(> \.wb3-instellen-icoon\)\{justify-content:flex-end\}/.test(basis));
  const glas = tila(maquette, '.werkblad .wb-balk-acties .wb3-instellen-icoon').join(';');
  check('«Макет»: у піктограми власне скло й рамка лише змінними теми',
    /border:\s*1px solid var\(--mq-border-outer\)/.test(glas) && /background:\s*color-mix\(in srgb, var\(--mq-wb-glas\)/.test(glas) && !/#[0-9a-f]{3,8}\b/i.test(glas));
  check('«Макет»: тихі кнопки режиму налаштування («Параметри») мають власне скло, щоб не губитися на живому тлі',
    tila(maquette, '.werkblad .wb-balk-acties .knop-stil').some(t => /background:\s*color-mix\(in srgb, var\(--mq-wb-glas\)/.test(t) && /color:\s*var\(--mq-tekst\)/.test(t)));
  return einde();
}
