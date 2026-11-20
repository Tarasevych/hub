// KLASSIEK-002B (Хвиля 1 тем оформлення «Біла класика» та «Чорна класика» на піддомені mail.tarasevych.com):
// перевірка прагматичного монохромного оформлення читача листа, вкладень, згорнутого переглядача,
// кнопки швидкого написання та діалогу створення й відкладеного надсилання листа.
// Eenheidstest voor het klassieke leesvenster, de bijlagen, de geminimaliseerde weergave en het opstelvenster.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-002b-lezer-opstel');

  const cssPad = 'src/mail/mail-lezer-opstel-maquette.css';
  const css = readFileSync(cssPad, 'utf8');
  const werkbalk = readFileSync('src/MailLezerWerkbalk.tsx', 'utf8');
  const geminimaliseerd = readFileSync('src/MailGeminimaliseerdeViewer.tsx', 'utf8');
  const dialoog = readFileSync('src/MailNieuwBerichtDialoog.tsx', 'utf8');
  const zwevend = readFileSync('src/MailOpstelZwevend.tsx', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-002b-lezer-opstel.test.ts', 'utf8');

  const eersteMaxMedia = css.search(/@media\s*\(\s*max-width/);
  const desktopDeel = eersteMaxMedia >= 0 ? css.slice(0, eersteMaxMedia) : css;
  const mobielDeel = eersteMaxMedia >= 0 ? css.slice(eersteMaxMedia) : '';

  // 1. Ізоляція студійних змінних і чисті монохромні змінні порталів для Білої та Чорної класики.
  check(
    'розділ змінних ізолює студійні тони через :not([data-maquette-stijl="klassiek"]) та задає чисті монохромні змінні порталів для klassiek-wit і klassiek-zwart',
    desktopDeel.includes('html.palet-maquette:not([data-maquette-stijl="klassiek"]) body :is(') &&
      desktopDeel.includes(
        'html.palet-maquette:not([data-maquette-stijl="klassiek"]) body .google-mail-workspace:not([data-mail-unread-custom=\'true\'])',
      ) &&
      desktopDeel.includes('html.palet-klassiek-wit[data-maquette-stijl="klassiek"] body :is(') &&
      desktopDeel.includes('html.palet-klassiek-zwart[data-maquette-stijl="klassiek"] body :is(') &&
      desktopDeel.includes('color-scheme: light;') &&
      desktopDeel.includes('color-scheme: dark;') &&
      desktopDeel.includes('--accent-soft: rgba(24, 28, 36, 0.075);') &&
      desktopDeel.includes('--accent-soft: rgba(243, 244, 246, 0.11);'),
  );

  // 2. Класичний читач листа, картки вкладень, згорнутий переглядач та діалог написання на матових поверхнях без розмиття.
  const klassiekStart = desktopDeel.indexOf('html.palet-maquette[data-maquette-stijl="klassiek"]');
  const klassiekDesktop = klassiekStart >= 0 ? desktopDeel.slice(klassiekStart) : '';

  check(
    'класичний блок перед @media охоплює читач листа, вкладення, згорнутий переглядач і діалог написання на матових поверхнях var(--mq-oppervlak) та var(--mq-oppervlak-2) без розмиття',
    klassiekStart > 0 &&
      klassiekDesktop.includes('.google-mail-reader') &&
      klassiekDesktop.includes('.mail-thread-content') &&
      klassiekDesktop.includes('.mail-thread-toolbar') &&
      klassiekDesktop.includes('.mail-thread-message') &&
      klassiekDesktop.includes('.mail-thread-reply') &&
      klassiekDesktop.includes('.mail-attachment-card') &&
      klassiekDesktop.includes('.google-mail-attachment-preview') &&
      klassiekDesktop.includes('.mail-minimized-viewer') &&
      klassiekDesktop.includes('.mail-geminimaliseerde-viewer') &&
      klassiekDesktop.includes('.mail-new-message-backdrop') &&
      klassiekDesktop.includes('.mail-new-message-dialog') &&
      klassiekDesktop.includes('.mail-new-message') &&
      klassiekDesktop.includes('.mail-sched-pop') &&
      klassiekDesktop.includes('var(--mq-oppervlak)') &&
      klassiekDesktop.includes('var(--mq-oppervlak-2)') &&
      klassiekDesktop.includes('backdrop-filter: none;') &&
      !/linear-gradient|radial-gradient/i.test(klassiekDesktop) &&
      !/blur\s*\(/i.test(klassiekDesktop),
  );

  // 3. Монохромна кнопка .mail-compose-float і головні кнопки дій на var(--mq-accent) та var(--mq-accent-op) без сирого білого кольору.
  const heeftFloatBlok =
    /\.mail-compose-float[\s\S]*?background:\s*var\(--mq-accent\);[\s\S]*?color:\s*var\(--mq-accent-op\);[\s\S]*?border:\s*1px solid var\(--mq-rand-sterk\);[\s\S]*?box-shadow:\s*var\(--mq-schaduw-zacht\);/.test(
      klassiekDesktop,
    );
  const heeftRondeGniezdo =
    /\.plaats-gniezdo\s*>\s*\.mail-compose-float:not\(\[data-vorm='rij'\]\)\s*\{\s*border-radius:\s*50%;\s*\}/.test(
      klassiekDesktop,
    );
  const heeftRauweWitKleur = /color\s*:\s*(#fff(?:fff)?\b|white\b|rgb\(\s*255)/i.test(klassiekDesktop);

  check(
    'кнопка .mail-compose-float та головні кнопки дій використовують суцільний var(--mq-accent) і текст var(--mq-accent-op) зі збереженням круглої форми 50% у гнізді .plaats-gniezdo',
    heeftFloatBlok &&
      heeftRondeGniezdo &&
      klassiekDesktop.includes('.mail-reader-primair-antwoord') &&
      klassiekDesktop.includes('.mail-thread-reply > footer button.primary') &&
      klassiekDesktop.includes('> footer button.primary') &&
      klassiekDesktop.includes('.mail-sched-custom button') &&
      !heeftRauweWitKleur,
  );

  // 4. Плавна сучасна геометрія 16px / 11px і збереження мінімальної зони натискання 44px на кнопках читача.
  check(
    'класичні правила застосовують заокруглення 16px для панелей і карток, 11px для кнопок і полів та утримують 44px на кнопках читача включно з мобільним шаром',
    klassiekDesktop.includes('border-radius: 16px;') &&
      klassiekDesktop.includes('border-radius: 11px;') &&
      klassiekDesktop.includes('min-width: 44px;') &&
      klassiekDesktop.includes('min-height: 44px;') &&
      mobielDeel.includes('min-width: 44px;') &&
      mobielDeel.includes('min-height: 44px;') &&
      mobielDeel.includes('border-radius: 16px 16px 0 0;'),
  );

  // 5. Табличні цифри tabular-nums для дат листів, лічильників бесіди, розмірів вкладень і таймерів відкладеного надсилання.
  const tabularBlok = klassiekDesktop.slice(klassiekDesktop.lastIndexOf('html.palet-maquette[data-maquette-stijl="klassiek"]'));
  check(
    'табличні цифри tabular-nums охоплюють дати листів, лічильники ланцюжка, розміри вкладень і таймери відкладеного надсилання',
    tabularBlok.includes('font-variant-numeric: tabular-nums;') &&
      tabularBlok.includes('.mail-row-date-block time') &&
      tabularBlok.includes('.mail-thread-message-meta time') &&
      tabularBlok.includes('.mail-reader-navigatie-plaats') &&
      tabularBlok.includes('.mail-thread-count') &&
      tabularBlok.includes('.mail-attachment-size-badge') &&
      tabularBlok.includes('.mail-nm-bijlagen li small') &&
      tabularBlok.includes('.mail-sched-count') &&
      tabularBlok.includes('.mail-sched-presets button small'),
  );

  // 6. Сувора CSS-дисципліна: нуль position:fixed, !important, prefers-color-scheme та каскад @media наприкінці.
  const naMediaRest =
    eersteMaxMedia >= 0
      ? mobielDeel.replace(/@media\s*\([^)]*\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '').trim()
      : 'geen-media';
  const drempels = [...mobielDeel.matchAll(/@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)/g)].map((m) => Number(m[1]));
  const dalendeVolgorde = drempels.length >= 3 && drempels.every((w, i) => i === 0 || w <= drempels[i - 1]);

  check(
    'mail-lezer-opstel-maquette.css не містить position:fixed, !important, prefers-color-scheme та тримає спадні @media (max-width) суворо наприкінці файла',
    !/position\s*:\s*fixed/i.test(css) &&
      !/!important/i.test(css) &&
      !/prefers-color-scheme/i.test(css) &&
      eersteMaxMedia > klassiekStart &&
      naMediaRest === '' &&
      dalendeVolgorde,
  );

  // 7. Цілісність компонентів підгрупи, однорядковий інваріант MailGeminimaliseerdeViewer.tsx та мовна чистота.
  const geminimaliseerdRegels = geminimaliseerd.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  check(
    'компоненти читача й написання підключають mail-lezer-opstel-maquette.css, а MailGeminimaliseerdeViewer.tsx залишається суворо однорядковим',
    werkbalk.includes('./mail/mail-lezer-opstel-maquette.css') &&
      geminimaliseerd.includes('./mail/mail-lezer-opstel-maquette.css') &&
      dialoog.includes('./mail/mail-lezer-opstel-maquette.css') &&
      zwevend.includes('./mail/mail-lezer-opstel-maquette.css') &&
      geminimaliseerdRegels.length === 1,
  );

  const bestanden: readonly [string, string][] = [
    [cssPad, css],
    ['src/MailLezerWerkbalk.tsx', werkbalk],
    ['src/MailGeminimaliseerdeViewer.tsx', geminimaliseerd],
    ['src/MailNieuwBerichtDialoog.tsx', dialoog],
    ['src/MailOpstelZwevend.tsx', zwevend],
    ['tests/eenheid/klassiek-002b-lezer-opstel.test.ts', zelfTest],
  ];
  const overtredingen = bestanden.filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud)).map(([pad]) => pad);
  check(
    'жоден файл контуру KLASSIEK-002B не містить заборонених символів російської абетки',
    overtredingen.length === 0,
    overtredingen.join(', '),
  );

  return einde();
}
