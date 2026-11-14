// KLASSIEK-004B (Хвиля 3 тем оформлення «Біла класика» та «Чорна класика»):
// перевірка прагматичного матового оформлення провідника вихідного коду, редактора файлів,
// висококонтрастного полотна порівняння змін, журналу фіксацій змін та спільного вікна dialog.gh-dialoog.
// Eenheidstest voor codeverkenner, bestandsbewerker, verschilweergave, vastleggingsgeschiedenis en GhDialoog.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { merkContrast } from '../../src/merk/merk-register';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

function splitsSelectorTakken(sel: string): string[] {
  const uit: string[] = [];
  let diep = 0;
  let start = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '(' || c === '[') diep++;
    else if (c === ')' || c === ']') diep--;
    else if (c === ',' && diep === 0) {
      uit.push(sel.slice(start, i).trim());
      start = i + 1;
    }
  }
  uit.push(sel.slice(start).trim());
  return uit.filter(Boolean);
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-004b-github-brontekst');

  const brontekstCss = readFileSync('src/github/github-brontekst-maquette.css', 'utf8');
  const codePaneelTsx = readFileSync('src/github/CodeEnEditorPaneel.tsx', 'utf8');
  const ghToepassingTsx = readFileSync('src/github/github-client.tsx', 'utf8');
  const zelf = readFileSync('tests/eenheid/klassiek-004b-github-brontekst.test.ts', 'utf8');

  const zonderCommentaar = brontekstCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const eersteMedia = zonderCommentaar.search(/@media\b/);
  const eersteMaxMedia = zonderCommentaar.search(/@media\s*\(\s*max-width/);
  const bureaubladDeel = eersteMedia >= 0 ? zonderCommentaar.slice(0, eersteMedia) : zonderCommentaar;
  const mobielDeel = eersteMaxMedia >= 0 ? zonderCommentaar.slice(eersteMaxMedia) : '';
  const klassiekStart = bureaubladDeel.indexOf('html.palet-maquette[data-maquette-stijl="klassiek"]');
  const studioDeel = klassiekStart >= 0 ? bureaubladDeel.slice(0, klassiekStart) : bureaubladDeel;
  const klassiekDeel = klassiekStart >= 0 ? bureaubladDeel.slice(klassiekStart) : '';

  // 1. Відсікання студійних індигових блоків світлого режиму (54, 74, 122 та rgba(40, 63, 104, ...)).
  const studioRegels = [...studioDeel.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const indigoBlokken = studioRegels.filter(
    ([, , lijf]) => lijf.includes('54, 74, 122') || lijf.includes('40, 63, 104'),
  );
  const lichtVerschilBlokken = studioRegels.filter(
    ([, sel]) => sel.includes('.theme-light') && sel.includes('.gh-diff-wikkel'),
  );
  const alleLichtStudioGeisoleerd =
    indigoBlokken.length === 2 &&
    lichtVerschilBlokken.length >= 2 &&
    [...indigoBlokken, ...lichtVerschilBlokken].every(([, sel]) => {
      const takken = splitsSelectorTakken(sel);
      return (
        takken.length >= 1 &&
        takken.every((tak) => tak.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])'))
      );
    });

  check(
    'студійні індигові блоки світлого режиму (54, 74, 122 та rgba(40, 63, 104, ...)) відсічені через :not([data-maquette-stijl="klassiek"]) на кожній гілці селектора',
    alleLichtStudioGeisoleerd && !/54,\s*74,\s*122|40,\s*63,\s*104/.test(klassiekDeel),
  );

  // 2. Монохромні змінні, світлочутливе полотно коду та дерево тек без кольорового світіння піктограм.
  const contrastCodeWit = merkContrast('#111418', '#ffffff');
  const contrastCodeZwart = merkContrast('#f3f4f6', '#0e1116');

  check(
    'класичний розділ задає монохромні змінні, світлочутливе полотно коду (var(--mq-oppervlak) у Білій класиці та #0e1116 у Чорній класиці) і спокійні піктограми дерева без підсвічувань',
    klassiekStart > 0 &&
      klassiekDeel.includes('--gh-mq-indigo: var(--mq-accent);') &&
      klassiekDeel.includes('--gh-mq-kop-gloed: none;') &&
      klassiekDeel.includes('--gh-mq-goot-bg: var(--mq-oppervlak-2);') &&
      /html\.palet-klassiek-wit[\s\S]*?--gh-mq-code-bg:\s*var\(--mq-oppervlak\);/.test(klassiekDeel) &&
      /html\.palet-klassiek-zwart[\s\S]*?--gh-mq-code-bg:\s*#0e1116;/.test(klassiekDeel) &&
      klassiekDeel.includes('.gh-map-icoon') &&
      klassiekDeel.includes('color: var(--mq-gedempt);') &&
      klassiekDeel.includes('filter: none;') &&
      contrastCodeWit >= 4.5 &&
      contrastCodeZwart >= 4.5,
  );

  // 3. Висококонтрастна таблиця порівняння змін (WCAG AA >= 4.5:1) для обох класичних палітр.
  const verschilParen: readonly [string, string, string][] = [
    ['Біла класика · додавання', '#14532d', '#eaf6ee'],
    ['Біла класика · вилучення', '#991b1b', '#fdeeee'],
    ['Біла класика · шапка уривка', '#3f4753', '#f1f3f6'],
    ['Чорна класика · додавання', '#86efac', '#11261b'],
    ['Чорна класика · вилучення', '#fecaca', '#2a1417'],
    ['Чорна класика · шапка уривка', '#b8c0cc', '#1b1f27'],
  ];
  const laagsteVerschilContrast = Math.min(...verschilParen.map(([, tekst, vlak]) => merkContrast(tekst, vlak)));

  check(
    'таблиця порівняння змін (.gh-diff-rij.is-erbij, .is-eraf, .is-kop та клітинки номерів і коду) має класичні кольори з контрастом WCAG AA >= 4.5:1 в обох палітрах',
    klassiekDeel.includes('.is-erbij') &&
      klassiekDeel.includes('.is-eraf') &&
      klassiekDeel.includes('.is-kop') &&
      klassiekDeel.includes('.gh-diff-nr') &&
      klassiekDeel.includes('.gh-diff-teken') &&
      klassiekDeel.includes('.gh-diff-tekst') &&
      klassiekDeel.includes('background-color: #eaf6ee;') &&
      klassiekDeel.includes('color: #14532d;') &&
      klassiekDeel.includes('background-color: #fdeeee;') &&
      klassiekDeel.includes('color: #991b1b;') &&
      klassiekDeel.includes('background-color: #11261b;') &&
      klassiekDeel.includes('color: #86efac;') &&
      klassiekDeel.includes('background-color: #2a1417;') &&
      klassiekDeel.includes('color: #fecaca;') &&
      klassiekDeel.includes('background-color: var(--mq-oppervlak-2);') &&
      laagsteVerschilContrast >= 4.5,
    `найнижчий контраст: ${laagsteVerschilContrast.toFixed(2)}:1`,
  );

  // 4. Картки та секції з кутами 16px через :not(#_mqk) без padding чи gap (захист мобільного каскаду).
  const mqkRegels = [...klassiekDeel.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel]) =>
    sel.includes(':not(#_mqk)'),
  );
  const mqkMetPaddingOfGap = mqkRegels
    .filter(([, , lijf]) => /(?:^|;|\s)(?:padding(?:-[a-z-]+)?|(?:row-|column-)?gap)\s*:/i.test(lijf))
    .map(([sel]) => sel.trim());

  const vereisteKaarten = [
    '.gh-werkruimte-code .gh-card',
    '.gh-code-leeg-repo.gh-card',
    '.gh-werkruimte-code .gh-code-tabel-wikkel',
    '.gh-diff-wikkel',
    '.gh-diff-bestand',
    '.gh-werkruimte-code .gh-vastleg-kaart',
    '.gh-subkaart',
    '.gh-werkruimte-code .gh-editor-voet',
    'dialog.gh-dialoog',
  ];

  check(
    'картки й секції коду оформлені через html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) з радіусом 16px без градієнтів і без жодного padding чи gap у блоках :not(#_mqk)',
    klassiekDeel.includes('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)') &&
      vereisteKaarten.every((sel) => klassiekDeel.includes(sel)) &&
      klassiekDeel.includes('border: 1px solid var(--mq-rand);') &&
      klassiekDeel.includes('border-inline: 1px solid var(--mq-rand);') &&
      klassiekDeel.includes('border-radius: 16px;') &&
      klassiekDeel.includes('background: var(--mq-oppervlak);') &&
      klassiekDeel.includes('background-image: none;') &&
      klassiekDeel.includes('box-shadow: var(--mq-schaduw-zacht);') &&
      klassiekDeel.includes('backdrop-filter: none;') &&
      klassiekDeel.includes('transform: none;') &&
      mqkRegels.length > 0 &&
      mqkMetPaddingOfGap.length === 0,
    mqkMetPaddingOfGap.join(' | '),
  );

  // 5. Кнопки, перемикач гілок, хлібні крихти, поля пошуку й форми фіксації з кутами 11px та суцільні головні кнопки без #fff.
  const heeftPrimaireKnop =
    /\.gh-btn\.gh-primary\s*\{[\s\S]*?border-radius:\s*11px;[\s\S]*?border-color:\s*var\(--mq-knop-primair-bg\);[\s\S]*?background:\s*var\(--mq-knop-primair-bg\);[\s\S]*?background-image:\s*none;[\s\S]*?color:\s*var\(--mq-knop-primair-tekst\);[\s\S]*?box-shadow:\s*none;/.test(
      klassiekDeel,
    );

  check(
    'кнопки, перемикач гілок, хлібні крихти, поля пошуку й форми фіксації мають border-radius: 11px, а головні кнопки працюють на var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без #fff і градієнтів',
    heeftPrimaireKnop &&
      klassiekDeel.includes('.gh-select-wikkel') &&
      klassiekDeel.includes('.gh-segment') &&
      klassiekDeel.includes('.gh-kruimels') &&
      klassiekDeel.includes('.gh-kruimel') &&
      klassiekDeel.includes('label.gh-search') &&
      klassiekDeel.includes('.gh-radio') &&
      klassiekDeel.includes('border-radius: 11px;') &&
      !/color\s*:\s*(?:#fff(?:fff)?\b|white\b|rgb\(\s*255)/i.test(klassiekDeel) &&
      !/linear-gradient|radial-gradient/i.test(klassiekDeel),
  );

  // 6. Спільне діалогове вікно dialog.gh-dialoog у верхньому шарі: класичні поверхні, відсутність розмиття та безпечна шапка.
  const kopRuimteTreffer = /dialog\.gh-dialoog\s+\.gh-dialoog-kop\s*\{\s*padding:\s*(\d+)px\s+(\d+)px;\s*\}/.exec(
    klassiekDeel,
  );
  const kopRuimteRechts = kopRuimteTreffer ? Number(kopRuimteTreffer[2]) : NaN;

  check(
    'dialog.gh-dialoog у верхньому шарі отримує чисто білі (#ffffff / #f6f7f9, #111418) і матово-графітові (#14171d / #1b1f27, #f3f4f6) змінні, backdrop-filter: none, border-radius: 16px та безпечний відступ шапки <= 20px',
    /html\.palet-klassiek-wit\s+dialog\.gh-dialoog[^{]*\{[\s\S]*?--mq-bg:\s*#f6f7f9;[\s\S]*?--mq-oppervlak:\s*#ffffff;[\s\S]*?--mq-oppervlak-2:\s*#f6f7f9;[\s\S]*?--mq-tekst:\s*#111418;/.test(
      klassiekDeel,
    ) &&
      /html\.palet-klassiek-zwart\s+dialog\.gh-dialoog[^{]*\{[\s\S]*?--mq-oppervlak:\s*#14171d;[\s\S]*?--mq-oppervlak-2:\s*#1b1f27;[\s\S]*?--mq-tekst:\s*#f3f4f6;/.test(
        klassiekDeel,
      ) &&
      /dialog\.gh-dialoog::backdrop\s*\{[\s\S]*?backdrop-filter:\s*none;/.test(klassiekDeel) &&
      !Number.isNaN(kopRuimteRechts) &&
      kopRuimteRechts <= 20 &&
      !/blur\s*\(/i.test(klassiekDeel),
    `відступ праворуч: ${String(kopRuimteRechts)}px`,
  );

  // 7. Ділова типографіка заголовків h1..h4 на гротеску var(--mq-font-ui) без курсиву.
  check(
    'заголовки h1..h4 у провіднику вихідного коду та діалоговому вікні використовують font-family: var(--mq-font-ui) і font-style: normal',
    klassiekDeel.includes(':is(h1, h2, h3, h4)') &&
      klassiekDeel.includes('font-family: var(--mq-font-ui);') &&
      klassiekDeel.includes('font-style: normal;'),
  );

  // 8. Табличні цифри tabular-nums для номерів рядків коду, відбитків SHA, байтів та лічильників +N / -M.
  check(
    'номери рядків коду, відбитки SHA фіксацій змін, обсяги у байтах та лічильники різниці +N / -M оформлені з font-variant-numeric: tabular-nums',
    klassiekDeel.includes('font-variant-numeric: tabular-nums;') &&
      klassiekDeel.includes('.gh-werkruimte-code .gh-code-nr') &&
      klassiekDeel.includes('.gh-diff-nr') &&
      klassiekDeel.includes('.gh-werkruimte-code .gh-boom-maat') &&
      klassiekDeel.includes('.gh-werkruimte-code .gh-editor-voet') &&
      klassiekDeel.includes('.gh-diff-bestand > summary .gh-sub') &&
      klassiekDeel.includes('.gh-sub code') &&
      klassiekDeel.includes('dialog.gh-dialoog .gh-facts'),
  );

  // 9. Каскад @media наприкінці файла та суворі інваріанти CSS (нуль !important, prefers-color-scheme, position: fixed).
  const naMaxMedia =
    eersteMaxMedia >= 0
      ? mobielDeel.replace(/@media\s*\([^)]*\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '').trim()
      : 'GEEN_MEDIA';
  const drempels = [...mobielDeel.matchAll(/@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)/g)].map((m) =>
    Number(m[1]),
  );
  const dalend = drempels.length >= 2 && drempels.every((w, i) => i === 0 || w <= drempels[i - 1]);

  check(
    'github-brontekst-maquette.css не містить !important, prefers-color-scheme чи position: fixed, а класичний розділ стоїть суворо перед @media із спадними мобільними порогами наприкінці',
    !/!important/i.test(zonderCommentaar) &&
      !/prefers-color-scheme/i.test(zonderCommentaar) &&
      !/position\s*:\s*fixed/i.test(zonderCommentaar) &&
      klassiekStart > 0 &&
      eersteMedia > klassiekStart &&
      eersteMaxMedia > klassiekStart &&
      naMaxMedia === '' &&
      dalend,
    `пороги: ${drempels.join(' -> ')}, залишок: ${naMaxMedia}`,
  );

  // 10. Мовна чистота всіх файлів ділянки KLASSIEK-004B.
  const bestanden: readonly [string, string][] = [
    ['src/github/github-brontekst-maquette.css', brontekstCss],
    ['src/github/CodeEnEditorPaneel.tsx', codePaneelTsx],
    ['src/github/github-client.tsx', ghToepassingTsx],
    ['tests/eenheid/klassiek-004b-github-brontekst.test.ts', zelf],
  ];
  const overtredingen = bestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);

  check(
    'жоден файл контуру KLASSIEK-004B не містить заборонених символів російської абетки',
    overtredingen.length === 0,
    overtredingen.join(', '),
  );

  return einde();
}
