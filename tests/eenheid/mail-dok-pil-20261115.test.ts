// СМУГА ГОРТАННЯ НАД ЛИСТАМИ У «МАКЕТІ» (MAILDOK-001, 15.11.2026). Без браузера й бази.
// PAGINERINGSSTROOK BOVEN DE BERICHTEN IN «MAQUETTE». Zonder browser en zonder database.
//
// Скарга власника: між шапкою розділу й першим листом лежала порожня смуга на всю ширину, у якій праворуч було лише
// гортання «< 1–10 із 9 110 >». Причина: у «Макеті» (обидва стилі) підкладку з рамкою й тінню мала сама обгортка
// .mail-pagination-selection-dock, яка завжди займає всю ширину рядка. Тепер обгортка прозора, а гортання й панель
// вибору мають кожна свою заокруглену «пігулку» за розміром вмісту. Перевірено в Chromium на 1440 і 390 px.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const lees = (p: string) => readFileSync(p, 'utf8');
// Усі тіла правил, чий селектор містить заданий фрагмент (з урахуванням вкладених @media).
const tila = (css: string, fragment: string) => {
  const uit: { selector: string; tilo: string; media: boolean }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const selector = m[1].trim();
    if (!selector.includes(fragment)) continue;
    const voor = css.slice(0, m.index);
    const media = (voor.match(/@media[^{]*\{/g) || []).length > (voor.match(/\}\s*\}/g) || []).length;
    uit.push({ selector, tilo: m[2], media });
  }
  return uit;
};
const zonderCommentaar = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-dok-pil-20261115');
  const maquette = zonderCommentaar(lees('src/mail/mail-werkruimte-maquette.css'));
  const klassiek = zonderCommentaar(lees('src/mail/mail-lijst-klassiek.css'));
  const dok = '.mail-pagination-selection-dock:not(:empty)';

  const dokMaquette = tila(maquette, dok).filter(r => !r.media);
  check('«Макет»: обгортка смуги гортання прозора, без рамки, тіні й відступів (не панель на всю ширину)',
    dokMaquette.length === 1 && /background:\s*transparent/.test(dokMaquette[0].tilo) && /border:\s*0/.test(dokMaquette[0].tilo)
    && /box-shadow:\s*none/.test(dokMaquette[0].tilo) && /padding:\s*0/.test(dokMaquette[0].tilo));
  check('«Макет»: жодне правило обгортки (у т. ч. телефонне) не повертає їй фон чи рамку',
    tila(maquette, dok).every(r => !/background:(?!\s*transparent)|border:\s*1px|box-shadow:\s*var/.test(r.tilo)));
  check('«Макет» → стиль «Класичний»: обгортка більше не отримує власну підкладку',
    tila(klassiek, dok).every(r => !/background|border:\s*1px|box-shadow/.test(r.tilo)));

  const pil = tila(maquette, '.mail-pagination-selection-dock > :is(.mail-category-pager, .mail-selection-strip)');
  const pilPk = pil.find(r => !r.media);
  check('«Макет»: гортання й панель вибору — окремі пігулки (рамка, заокруглення, фон змінними теми, ширина за вмістом)',
    !!pilPk && /width:\s*auto/.test(pilPk.tilo) && /border:\s*1px solid var\(--mq-rand\)/.test(pilPk.tilo)
    && /border-radius:\s*18px/.test(pilPk.tilo) && /background:[^;]*var\(--mq-oppervlak/.test(pilPk.tilo) && !/#[0-9a-f]{3,8}\b/i.test(pilPk.tilo));
  check('«Макет»: пігулка не нижча за 44 px (зона дотику) і рахує висоту з рамкою',
    !!pilPk && /min-height:\s*44px/.test(pilPk.tilo) && /box-sizing:\s*border-box/.test(pilPk.tilo));
  check('телефон: пігулка гортання притиснута праворуч і не розтягується на весь рядок',
    tila(maquette, '.mail-pagination-selection-dock > .mail-category-pager').some(r => r.media && /justify-self:\s*end/.test(r.tilo) && /width:\s*auto/.test(r.tilo)));
  check('телефон: пігулка вибору ліворуч за вмістом і не вилазить за екран',
    tila(maquette, '.mail-pagination-selection-dock > .mail-selection-strip').some(r => r.media && /justify-self:\s*start/.test(r.tilo)
      && /width:\s*fit-content/.test(r.tilo) && /overflow-x:\s*auto/.test(r.tilo)));
  check('«Класичний» стиль «Макета» лишає свої кути 16 px і фон --mq-oppervlak — але вже на пігулках',
    tila(klassiek, '.mail-pagination-selection-dock > :is(.mail-category-pager, .mail-selection-strip)').some(r => !r.media
      && /border-radius:\s*16px/.test(r.tilo) && /background:\s*var\(--mq-oppervlak\)/.test(r.tilo)));

  return einde();
}
