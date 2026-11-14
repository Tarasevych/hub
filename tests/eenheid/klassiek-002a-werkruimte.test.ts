// KLASSIEK-002A (Хвиля 1 тем оформлення «Біла класика» та «Чорна класика» на mail.tarasevych.com):
// перевірка прагматичної робочої області пошти, штатного заголовка без студійної вітрини,
// монохромного табличного списку листів, заокруглень 16px/11px, табличних цифр та дисципліни каскаду стилів.
// Eenheidstest voor de klassieke e-mailwerkruimte en berichtenlijst (KLASSIEK-002A).
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

function inhoudBuitenMediaBlokken(cssInhoud: string, eersteMediaIndex: number): string {
  if (eersteMediaIndex < 0) return 'GEEN_MEDIA';
  const staart = cssInhoud.slice(eersteMediaIndex);
  let diepte = 0;
  let inMedia = false;
  let buiten = '';
  let i = 0;
  while (i < staart.length) {
    if (!inMedia) {
      const rest = staart.slice(i);
      const match = rest.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*@media\s*\(\s*max-width[^)]*\)\s*\{/);
      if (match) {
        inMedia = true;
        diepte = 1;
        i += match[0].length;
        continue;
      }
      buiten += staart[i];
      i += 1;
    } else {
      const teken = staart[i];
      if (teken === '{') diepte += 1;
      else if (teken === '}') {
        diepte -= 1;
        if (diepte === 0) inMedia = false;
      }
      i += 1;
    }
  }
  return buiten.replace(/\/\*[\s\S]*?\*\//g, '').trim();
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-002a-werkruimte');

  const werkruimteTsx = readFileSync('src/GoogleMailWerkruimte.tsx', 'utf8');
  const maquetteCss = readFileSync('src/mail/mail-werkruimte-maquette.css', 'utf8');
  const klassiekLijstCss = readFileSync('src/mail/mail-lijst-klassiek.css', 'utf8');
  const berichtRijTsx = readFileSync('src/MailBerichtRij.tsx', 'utf8');
  const minimumRijTsx = readFileSync('src/MailMinimumBerichtRij.tsx', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-002a-werkruimte.test.ts', 'utf8');

  // 1. Робоча область GoogleMailWerkruimte: підключення класики, вимкнення вітрини й рейки, збереження штатного заголовка.
  const idxMaquetteCss = werkruimteTsx.indexOf('mail/mail-werkruimte-maquette.css');
  const idxKlassiekCss = werkruimteTsx.indexOf('mail/mail-lijst-klassiek.css');
  check(
    'GoogleMailWerkruimte підключає useIsKlassiekMaquette та імпортує mail-lijst-klassiek.css одразу після mail-werkruimte-maquette.css',
    werkruimteTsx.includes('useIsKlassiekMaquette') &&
      idxMaquetteCss > 0 &&
      idxKlassiekCss > idxMaquetteCss &&
      idxKlassiekCss - idxMaquetteCss < 90,
  );

  check(
    'GoogleMailWerkruimte вимикає студійну вітрину MaquetteHeld і бічну MaquetteAnkerRail у класичних темах та зберігає штатний заголовок h1',
    /isKlassiek\s*=\s*useIsKlassiekMaquette\(\)/.test(werkruimteTsx) &&
      /maquetteBasisZichtbaar\s*=\s*isMaquette\s*&&\s*!isKlassiek/.test(werkruimteTsx) &&
      /toonMaquetteHeld\s*=\s*maquetteBasisZichtbaar\s*&&\s*!isKlassiek/.test(werkruimteTsx) &&
      /toonMaquetteRail\s*=\s*maquetteBasisZichtbaar\s*&&\s*!isKlassiek/.test(werkruimteTsx) &&
      werkruimteTsx.includes("<h1 className='mail-workspace-heading'>{workspaceHeading}</h1>"),
  );

  // 2. Студійний файл mail-werkruimte-maquette.css відсікає градієнти, розмиття та кольорові ореоли для класики.
  const aantalUitsluitingen = (maquetteCss.match(/:not\(\[data-maquette-stijl="klassiek"\]\)/g) || []).length;
  const mwEersteMedia = maquetteCss.search(/@media\s*\(\s*max-width/);
  const mwBuitenMedia = inhoudBuitenMediaBlokken(maquetteCss, mwEersteMedia);
  check(
    'mail-werkruimte-maquette.css застосовує відсікачі :not([data-maquette-stijl="klassiek"]) і тримає @media (max-width) суворо наприкінці',
    aantalUitsluitingen >= 20 &&
      !/position\s*:\s*fixed/i.test(maquetteCss) &&
      !/!important/i.test(maquetteCss) &&
      !/prefers-color-scheme/i.test(maquetteCss) &&
      mwEersteMedia > 0 &&
      mwBuitenMedia === '',
  );

  // 3. Класичний файл mail-lijst-klassiek.css: монохромні змінні, радіуси 16px/11px, відсутність градієнтів і сирого #fff.
  check(
    'mail-lijst-klassiek.css оформлює робочу область і список під html.palet-maquette[data-maquette-stijl="klassiek"] монохромними поверхнями з радіусами 16px та 11px',
    klassiekLijstCss.includes('html.palet-maquette[data-maquette-stijl="klassiek"]') &&
      klassiekLijstCss.includes('var(--mq-oppervlak)') &&
      klassiekLijstCss.includes('var(--mq-oppervlak-2)') &&
      klassiekLijstCss.includes('var(--mq-accent)') &&
      klassiekLijstCss.includes('var(--mq-accent-op)') &&
      klassiekLijstCss.includes('border-radius: 16px;') &&
      klassiekLijstCss.includes('border-radius: 11px;') &&
      klassiekLijstCss.includes('font-weight: 650;') &&
      klassiekLijstCss.includes('box-shadow: none;') &&
      !/linear-gradient|radial-gradient/i.test(klassiekLijstCss) &&
      !/#fff\b|#ffffff\b/i.test(klassiekLijstCss),
  );

  // 4. Плавучі дії рядка листа: вимкнено backdrop-filter без жодної зміни top або додавання transform.
  const hoverActiesBlok = klassiekLijstCss.match(/[^\n{}]*\.mail-row-hover-actions[^{]*\{([^}]*)\}/);
  check(
    'mail-lijst-klassiek.css прибирає backdrop-filter на .mail-row-hover-actions без втручання у властивості top або transform',
    hoverActiesBlok !== null &&
      /backdrop-filter\s*:\s*none/.test(hoverActiesBlok[1]) &&
      !/\btop\s*:/.test(hoverActiesBlok[1]) &&
      !/\btransform\s*:|\btranslate\b/.test(klassiekLijstCss),
  );

  // 5. Табличні цифри tabular-nums на лічильниках, посторінковому перегляді, розмірах вкладень і часових позначках.
  check(
    'mail-lijst-klassiek.css задає font-variant-numeric: tabular-nums для лічильників, посторінкового перегляду, розмірів вкладень і дат рядків',
    klassiekLijstCss.includes('font-variant-numeric: tabular-nums;') &&
      klassiekLijstCss.includes('.mail-section-visible-count') &&
      klassiekLijstCss.includes('.mail-category-pager-status') &&
      klassiekLijstCss.includes('.mail-attachment-compact-size') &&
      klassiekLijstCss.includes('.mail-row-date-block time') &&
      klassiekLijstCss.includes('.mail-minimum-date time'),
  );

  // 6. Непорушні обмеження CSS у mail-lijst-klassiek.css.
  const klEersteMedia = klassiekLijstCss.search(/@media\s*\(\s*max-width/);
  const klNaEersteMedia = klEersteMedia >= 0 ? klassiekLijstCss.slice(klEersteMedia) : '';
  const klBuitenMedia = inhoudBuitenMediaBlokken(klassiekLijstCss, klEersteMedia);
  check(
    'mail-lijst-klassiek.css не містить position: fixed, !important, prefers-color-scheme та розташовує всі настільні правила перед першим @media (max-width)',
    !/position\s*:\s*fixed/i.test(klassiekLijstCss) &&
      !/!important/i.test(klassiekLijstCss) &&
      !/prefers-color-scheme/i.test(klassiekLijstCss) &&
      klEersteMedia > 0 &&
      klBuitenMedia === '' &&
      klNaEersteMedia.includes('@media (max-width: 960px)') &&
      klNaEersteMedia.includes('@media (max-width: 720px)'),
  );

  // 7. Перевірка мовної чистоти у всіх файлах контуру KLASSIEK-002A.
  const bestanden: readonly [string, string][] = [
    ['src/GoogleMailWerkruimte.tsx', werkruimteTsx],
    ['src/mail/mail-werkruimte-maquette.css', maquetteCss],
    ['src/mail/mail-lijst-klassiek.css', klassiekLijstCss],
    ['src/MailBerichtRij.tsx', berichtRijTsx],
    ['src/MailMinimumBerichtRij.tsx', minimumRijTsx],
    ['tests/eenheid/klassiek-002a-werkruimte.test.ts', zelfTest],
  ];
  const overtredingen = bestanden.filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud)).map(([pad]) => pad);
  check(
    'жоден файл контуру KLASSIEK-002A не містить заборонених символів російської абетки',
    overtredingen.length === 0,
    overtredingen.join(', '),
  );

  return einde();
}
