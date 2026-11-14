// KLASSIEK-008A (Хвиля 7А тем оформлення «Біла класика» та «Чорна класика» для піддомену mcp.tarasevych.com):
// перевірка ядра управління з'єднувачами McpDienstWeergave, діалогу дозволів McpToestemmingVenster, панелі засобів McpHulpmiddelenPaneel,
// розгортання застосунків McpAppsWeergave, прив'язки сервера ServerKoppelen та резервних копій McpBackupsKaart / McpServerBeheerKaart —
// відсікання студійних правил світлого режиму й примусово темних блоків .mq-held через :not([data-maquette-stijl="klassiek"]),
// монохромні змінні класичної палітри й чисті семантичні змінні --hub-*, усунення подвійних шапок під MaquetteHeld зі збереженням кнопок дій,
// суцільні матові поверхні без градієнтів і розмиття, заокруглення 16px / 11px / 999px, первинні кнопки на var(--mq-knop-primair-bg) без #fff,
// захист рамок :not(#_mqk) проти flat-content винятково без padding і gap, табличні цифри tabular-nums та дисципліна мобільного каскаду.
// Eenheidstest voor McpDienstWeergave, McpToestemmingVenster, McpHulpmiddelenPaneel en McpAppsWeergave op mcp.tarasevych.com (KLASSIEK-008A).

import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const RUW_WIT_KLEUR = /(?<![-\w])(?:#fff(?:fff)?|white)(?![-\w])/i;

const VERWACHTE_KLASSIEKE_VARS: readonly [string, string][] = [
  ['--mq-accent-mcp', 'var(--mq-accent)'],
  ['--mq-accent-mcp-diep', 'var(--mq-accent-2)'],
  ['--mq-accent-mcp-op', 'var(--mq-accent-op)'],
  ['--mq-mcp-indigo', 'var(--mq-accent)'],
  ['--mq-mcp-kobalt', 'var(--mq-gedempt)'],
  ['--mq-mcp-halo', 'transparent'],
  ['--mq-mcp-halo-kobalt', 'transparent'],
  ['--mq-mcp-halo-zacht', 'transparent'],
  ['--mq-mcp-rand', 'var(--mq-rand)'],
  ['--mq-mcp-rand-sterk', 'var(--mq-rand-sterk)'],
  ['--mq-mcp-rand-accent', 'var(--mq-rand-sterk)'],
  ['--mq-mcp-glas-diep', 'var(--mq-oppervlak)'],
  ['--mq-mcp-glas-verhoogd', 'var(--mq-oppervlak)'],
  ['--mq-mcp-glas-glans', 'transparent'],
  ['--mq-mcp-code-put', 'var(--mq-oppervlak-2)'],
  ['--mq-mcp-goed', 'var(--ok)'],
  ['--mq-mcp-goed-zacht', 'var(--ok-zacht)'],
  ['--mq-mcp-wacht', 'var(--warn)'],
  ['--mq-mcp-wacht-zacht', 'var(--warn-zacht)'],
  ['--mq-mcp-gevaar', 'var(--fout)'],
  ['--mq-mcp-gevaar-zacht', 'var(--fout-zacht)'],
  ['--panel', 'var(--mq-oppervlak)'],
  ['--surface', 'var(--mq-oppervlak-2)'],
  ['--surface2', 'var(--mq-oppervlak-2)'],
  ['--soft', 'var(--mq-oppervlak-2)'],
  ['--line', 'var(--mq-rand)'],
  ['--text', 'var(--mq-tekst)'],
  ['--muted', 'var(--mq-gedempt)'],
  ['--faint', 'var(--mq-stil)'],
  ['--accent', 'var(--mq-accent)'],
  ['--accenttext', 'var(--mq-accent-op)'],
  ['--text-on-accent', 'var(--mq-accent-op)'],
  ['--accent-soft', 'var(--mq-oppervlak-zacht)'],
  ['--focus', 'var(--mq-accent)'],
];

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-008a-mcp-kern-uitrol');

  const kernCss = readFileSync('src/mcp-kern-maquette.css', 'utf8');
  const uitrolCss = readFileSync('src/mcp-uitrol-maquette.css', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-008a-mcp-kern-uitrol.test.ts', 'utf8');

  const kernZonderCommentaar = kernCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const uitrolZonderCommentaar = uitrolCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const idxKernKlassiek = kernCss.indexOf('8. ПРАГМАТИЧНИЙ КЛАСИЧНИЙ ШАР «БІЛА КЛАСИКА» ТА «ЧОРНА КЛАСИКА» (KLASSIEK-008A)');
  const idxKernEersteMedia = kernCss.search(/@media\s*\(/);
  const kernKlassiekPc =
    idxKernKlassiek > 0 && idxKernEersteMedia > idxKernKlassiek
      ? kernCss.slice(idxKernKlassiek, idxKernEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const idxUitrolKlassiek = uitrolCss.indexOf('5. ПРАГМАТИЧНИЙ КЛАСИЧНИЙ ШАР «БІЛА КЛАСИКА» ТА «ЧОРНА КЛАСИКА» (KLASSIEK-008A)');
  const idxUitrolEersteMedia = uitrolCss.search(/@media\s*\(/);
  const uitrolKlassiekPc =
    idxUitrolKlassiek > 0 && idxUitrolEersteMedia > idxUitrolKlassiek
      ? uitrolCss.slice(idxUitrolKlassiek, idxUitrolEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const kernRegels = leesCss(kernCss);
  const uitrolRegels = leesCss(uitrolCss);

  // 1. Відсікання студійних блоків світлого режиму та примусово темних блоків .mq-held у mcp-kern-maquette.css.
  const kernLichtRegels = kernRegels.filter((r) =>
    r.selectors.some(
      (s) => s.includes('data-theme="light"') || s.includes('theme-light') || s.includes('theme-plum-light'),
    ),
  );
  const kernHeldRegels = kernRegels.filter((r) => r.selectors.some((s) => s.includes('.mq-held')));
  const kernColorSchemeRegels = kernRegels.filter((r) => r.decls.some((d) => d.eig === 'color-scheme'));

  check(
    'у mcp-kern-maquette.css усі студійні блоки світлого режиму (11 гілок) та примусово темні блоки .mq-held відсічені через :not([data-maquette-stijl="klassiek"])',
    kernLichtRegels.length === 2 &&
      kernLichtRegels[0].selectors.length === 9 &&
      kernLichtRegels[1].selectors.length === 2 &&
      kernLichtRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ) &&
      kernHeldRegels.length === 2 &&
      kernHeldRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ) &&
      kernColorSchemeRegels.length === 1 &&
      kernColorSchemeRegels[0].selectors.every((s) =>
        s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])'),
      ),
  );

  // 2. Відсікання студійних блоків світлого режиму у mcp-uitrol-maquette.css.
  const uitrolLichtRegels = uitrolRegels.filter((r) =>
    r.selectors.some(
      (s) => s.includes('data-theme="light"') || s.includes('theme-light') || s.includes('theme-plum-light'),
    ),
  );
  const uitrolColorSchemeRegels = uitrolRegels.filter((r) => r.decls.some((d) => d.eig === 'color-scheme'));

  check(
    'у mcp-uitrol-maquette.css усі студійні блоки світлого режиму (3 гілки) відсічені через :not([data-maquette-stijl="klassiek"])',
    uitrolLichtRegels.length === 2 &&
      uitrolLichtRegels[0].selectors.length === 1 &&
      uitrolLichtRegels[1].selectors.length === 2 &&
      uitrolLichtRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ) &&
      uitrolColorSchemeRegels.length === 0,
  );

  // 3. Монохромні похідні змінні класичної палітри та чистота змінних --hub-* без індиго/кобальту, #hex, rgb() і color-mix().
  const kernVarRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-maquette-wikkel') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-consent-venster') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] [data-mcp-tools-panel="true"]') &&
      r.decls.some((d) => d.eig === '--mq-mcp-indigo'),
  );
  const uitrolVarRegel = uitrolRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mapps') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-geheim') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] [data-venster="apps-geheim"]') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-block.mbk') &&
      r.decls.some((d) => d.eig === '--mq-mcp-indigo'),
  );
  const kernVarMap = new Map((kernVarRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const uitrolVarMap = new Map((uitrolVarRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const alleHubDecls = [...kernRegels, ...uitrolRegels]
    .filter((r) => r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]')))
    .flatMap((r) => r.decls.filter((d) => d.eig.startsWith('--hub-')));

  check(
    'в обох файлах класичний шар перевизначає всі 34 похідні змінні на чисті матові поверхні ядра, а змінні --hub-* містять винятково чисті var(--ok/--warn/--fout/--mq-gedempt)',
    VERWACHTE_KLASSIEKE_VARS.every(([eig, waarde]) => kernVarMap.get(eig) === waarde && uitrolVarMap.get(eig) === waarde) &&
      kernKlassiekPc.includes('--accentText: var(--mq-accent-op);') &&
      uitrolKlassiekPc.includes('--accentText: var(--mq-accent-op);') &&
      kernVarMap.get('--hub-ok') === 'var(--ok)' &&
      kernVarMap.get('--hub-warn') === 'var(--warn)' &&
      kernVarMap.get('--hub-bad') === 'var(--fout)' &&
      kernVarMap.get('--hub-off') === 'var(--mq-gedempt)' &&
      alleHubDecls.length >= 4 &&
      alleHubDecls.every((d) => /^var\(--(?:ok|warn|fout|info|mq-[a-z0-9-]+)\)$/.test(d.waarde)),
  );

  // 4. Усунення подвійних шапок під MaquetteHeld із повним збереженням живих кнопок дій в обох файлах.
  const kernHeadVerberg = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-maquette-wikkel .mcp-page-head:not(:has(.mcp-page-actions))'),
  );
  const kernHeadActies = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-maquette-wikkel .mcp-page-head:has(.mcp-page-actions)') &&
      r.decls.some((d) => d.eig === 'display'),
  );
  const kernHeadBinnenVerberg = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-maquette-wikkel .mcp-page-head:has(.mcp-page-actions) .mcp-page-icon') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-maquette-wikkel .mcp-page-head:has(.mcp-page-actions) .mcp-kicker') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-maquette-wikkel .mcp-page-head:has(.mcp-page-actions) h1'),
  );
  const kernActiesVerborgen = kernRegels.some(
    (r) =>
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.endsWith('.mcp-page-actions')) &&
      r.decls.some((d) => d.eig === 'display' && d.waarde === 'none'),
  );
  const uitrolKopVerberg = uitrolRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-maquette-wikkel .mapps>.mapps-kop:not(:has(button, a, input, select))'),
  );
  const uitrolKopDicht = uitrolRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-kop') &&
      r.decls.some((d) => d.eig === 'padding'),
  );
  const kernHeadActiesMap = new Map((kernHeadActies?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const uitrolKopMap = new Map((uitrolKopDicht?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'дубльовані шапки .mcp-page-head без дій і .mapps-kop без елементів керування приховані, а .mcp-page-head:has(.mcp-page-actions) та .mapps-kop ущільнені в однорядкові панелі 16px зі збереженням кнопок дій',
    kernHeadVerberg?.decls.some((d) => d.eig === 'display' && d.waarde === 'none') === true &&
      kernHeadActiesMap.get('display') === 'flex' &&
      kernHeadActiesMap.get('align-items') === 'center' &&
      kernHeadActiesMap.get('justify-content') === 'space-between' &&
      kernHeadActiesMap.get('gap') === '12px' &&
      kernHeadActiesMap.get('padding') === '10px 16px' &&
      kernHeadActiesMap.get('border-radius') === '16px' &&
      kernHeadActiesMap.get('background') === 'var(--mq-oppervlak)' &&
      kernHeadActiesMap.get('border') === '1px solid var(--mq-rand)' &&
      kernHeadActiesMap.get('box-shadow') === 'none' &&
      kernHeadBinnenVerberg?.decls.some((d) => d.eig === 'display' && d.waarde === 'none') === true &&
      !kernActiesVerborgen &&
      uitrolKopVerberg?.decls.some((d) => d.eig === 'display' && d.waarde === 'none') === true &&
      uitrolKopMap.get('padding') === '12px 16px' &&
      uitrolKopMap.get('border-radius') === '16px' &&
      uitrolKopMap.get('background') === 'var(--mq-oppervlak)' &&
      uitrolKopMap.get('box-shadow') === 'none',
  );

  // 5. Матові великі картки, колонки дошки завдань, порожні стани й вікно дозволів у mcp-kern-maquette.css (16px, без розмиття, venster-kop <= 20px).
  const kernGroteDoelen = [
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-maquette-wikkel .weergave-richting',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-block',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-stat',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-col',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-task',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-empty',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-empty',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-section',
    'html.palet-maquette[data-maquette-stijl="klassiek"] [data-mcp-tools-panel="true"]',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-card',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-feed-item',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-tool',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-switch',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .venster.mcp-consent-venster',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-consent-dialog',
  ];
  const kernVensterKop = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .venster.mcp-consent-venster .venster-kop'),
  );

  check(
    'у mcp-kern-maquette.css усі великі картки, блоки, колонки дошки, порожні стани й діалоги мають кути 16px, матове тло (background-image: none, backdrop-filter: none), рамку 1px і правий відступ шапки вікна <= 20px',
    kernGroteDoelen.every((sel) => {
      const r = kernRegels.find(
        (regel) => regel.media.length === 0 && regel.selectors.includes(sel) && regel.decls.some((d) => d.eig === 'border-radius'),
      );
      if (!r) return false;
      const m = new Map(r.decls.map((d) => [d.eig, d.waarde]));
      return (
        m.get('border-radius') === '16px' &&
        m.get('border') === '1px solid var(--mq-rand)' &&
        m.get('background-image') === 'none' &&
        m.get('backdrop-filter') === 'none'
      );
    }) && kernVensterKop?.decls.some((d) => d.eig === 'padding' && d.waarde === '10px 16px') === true,
  );

  // 6. Матові великі картки, елементи застосунків, резервні копії та діалог таємниць у mcp-uitrol-maquette.css (16px, без розмиття, venster-kop <= 20px).
  const uitrolGroteDoelen = [
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-kaart',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-melding',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-apps>li',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .venster[data-venster="apps-geheim"]',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-keuze',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-commando',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-block.mbk .mbk-list>li',
  ];
  const uitrolVensterKop = uitrolRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .venster[data-venster="apps-geheim"] .venster-kop'),
  );

  check(
    'у mcp-uitrol-maquette.css усі великі картки, елементи списку застосунків, сповіщення, вибори серверів, списки резервних копій і вікно таємниць мають кути 16px, матове тло без розмиття та правий відступ шапки вікна <= 20px',
    uitrolGroteDoelen.every((sel) => {
      const r = uitrolRegels.find(
        (regel) => regel.media.length === 0 && regel.selectors.includes(sel) && regel.decls.some((d) => d.eig === 'border-radius'),
      );
      if (!r) return false;
      const m = new Map(r.decls.map((d) => [d.eig, d.waarde]));
      return (
        m.get('border-radius') === '16px' &&
        m.get('border') === '1px solid var(--mq-rand)' &&
        m.get('background-image') === 'none' &&
        m.get('backdrop-filter') === 'none'
      );
    }) && uitrolVensterKop?.decls.some((d) => d.eig === 'padding' && d.waarde === '10px 16px') === true,
  );

  // 7. Вкладені елементи, кнопки, поля вводу та блоки виводу з єдиним заокругленням 11px у mcp-kern-maquette.css.
  const kernBinnen11Doelen = [
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-btn',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-btn.small',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-input',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-choice',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-choice button',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-note',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-error',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-item',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-item-icon',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-block-icon',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-toolnav button',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-out',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-track-step',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-url',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-tip',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-btn',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-tab',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-confirm',
  ];
  const kernVeldRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('.mcp-estate :where(input') && s.includes('select, textarea)')) &&
      r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '11px'),
  );

  check(
    'у mcp-kern-maquette.css усі вкладені елементи, кнопки, поля вводу, перемикачі вибору, нотатки, помилки та блоки виводу мають кути 11px',
    kernVeldRegel !== undefined &&
      kernBinnen11Doelen.every((sel) =>
        kernRegels.some(
          (r) =>
            r.media.length === 0 &&
            r.selectors.includes(sel) &&
            r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '11px'),
        ),
      ),
  );

  // 8. Вкладені елементи, кнопки, поля вводу й журнали з радіусом 11px та пігулки 999px у mcp-uitrol-maquette.css.
  const uitrolBinnen11Doelen = [
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps button',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-meta',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-bevestig',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-log',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-stappen pre',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-sub',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-waarschuwing',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-commando pre',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-block.mbk .mbk-files li',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-block.mbk .mbk-error',
  ];
  const uitrolVeldRegel = uitrolRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('.mapps :where(input') && s.includes('select, textarea)')) &&
      r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '11px'),
  );
  const uitrolPillenDoelen = [
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-badge',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-gezond',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-block.mbk .mbk-badge',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps .mapps-chips button:not(.secondary)',
  ];

  check(
    'у mcp-uitrol-maquette.css усі кнопки, поля вводу, журнали, попередження та файли резервних копій мають кути 11px, а пігулки станів і перемикачі профілів — 999px',
    uitrolVeldRegel !== undefined &&
      uitrolBinnen11Doelen.every((sel) =>
        uitrolRegels.some(
          (r) =>
            r.media.length === 0 &&
            r.selectors.includes(sel) &&
            r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '11px'),
        ),
      ) &&
      uitrolPillenDoelen.every((sel) =>
        uitrolRegels.some(
          (r) =>
            r.media.length === 0 &&
            r.selectors.includes(sel) &&
            r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '999px'),
        ),
      ),
  );

  // 9. Первинні кнопки на var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) та увімкнений перемикач .mcp-toggle[aria-checked="true"].
  const kernPrimairRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-btn:not(.ghost)') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-consent-primary') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hub-btn.tone-primary'),
  );
  const uitrolPrimairRegel = uitrolRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mapps button:not(.secondary):not(.mapps-gevaar)') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-geheim button[type="submit"]'),
  );
  const toggleAanRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-toggle[aria-checked="true"]'),
  );
  const toggleKnopRegel = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-toggle[aria-checked="true"] i'),
  );
  const kernPillen999 = [
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-badge',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-col-count',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-toggle',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-pill',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-toggle',
  ];
  const kernPrimMap = new Map((kernPrimairRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const uitrolPrimMap = new Map((uitrolPrimairRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const toggleAanMap = new Map((toggleAanRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const toggleKnopMap = new Map((toggleKnopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'первинні кнопки обох файлів використовують var(--mq-knop-primair-bg) і var(--mq-knop-primair-tekst) з box-shadow: none, а увімкнений .mcp-toggle[aria-checked="true"] має доріжку var(--mq-accent) і кульку var(--mq-accent-op)',
    kernPrimMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      kernPrimMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      kernPrimMap.get('border') === '1px solid var(--mq-knop-primair-bg)' &&
      kernPrimMap.get('border-radius') === '11px' &&
      kernPrimMap.get('box-shadow') === 'none' &&
      uitrolPrimMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      uitrolPrimMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      uitrolPrimMap.get('border') === '1px solid var(--mq-knop-primair-bg)' &&
      uitrolPrimMap.get('border-radius') === '11px' &&
      uitrolPrimMap.get('box-shadow') === 'none' &&
      toggleAanMap.get('background') === 'var(--mq-accent)' &&
      toggleAanMap.get('box-shadow') === 'none' &&
      toggleKnopMap.get('background') === 'var(--mq-accent-op)' &&
      toggleKnopMap.get('box-shadow') === 'none' &&
      kernPillen999.every((sel) =>
        kernRegels.some(
          (r) =>
            r.media.length === 0 &&
            r.selectors.includes(sel) &&
            r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '999px'),
        ),
      ),
  );

  // 10. Захист рамок html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) проти flat-content (0, 19, 0) — суворо без padding і gap.
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-left', 'border-radius', 'box-shadow']);
  const kernMqkRegels = kernRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const uitrolMqkRegels = uitrolRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const alleMqkRegels = [...kernMqkRegels, ...uitrolMqkRegels];
  const verbodenMqkEig = alleMqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );

  const klassiekStralen = [...kernRegels, ...uitrolRegels]
    .filter((r) =>
      r.selectors.some(
        (s) => s.includes('[data-maquette-stijl="klassiek"]') && !s.includes(':not([data-maquette-stijl="klassiek"])'),
      ),
    )
    .flatMap((r) => r.decls.filter((d) => d.eig === 'border-radius').map((d) => d.waarde));

  check(
    'в обох файлах правила html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) містять винятково border/border-inline/border-left, border-radius: 16px і box-shadow (нуль padding і нуль gap), а всі класичні радіуси належать 16px / 11px / 999px',
    kernMqkRegels.length === 4 &&
      uitrolMqkRegels.length === 4 &&
      kernMqkRegels.every((r) => r.selectors.every((s) => s.includes(':not([data-mq-m12])'))) &&
      uitrolMqkRegels.every((r) => r.selectors.every((s) => s.includes(':not([data-mq-u12])'))) &&
      alleMqkRegels.every(
        (r) =>
          r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')) &&
          r.decls.some((d) => d.eig === 'border') &&
          r.decls.some((d) => d.eig === 'border-inline') &&
          r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') &&
          r.decls.some((d) => d.eig === 'box-shadow'),
      ) &&
      verbodenMqkEig.length === 0 &&
      klassiekStralen.length >= 45 &&
      klassiekStralen.every((w) => w === '16px' || w === '11px' || w === '999px'),
    verbodenMqkEig.join(', ') || klassiekStralen.join(', '),
  );

  // 11. Беззасічковий шрифт заголовків var(--mq-font-ui), рівноширинні цифри tabular-nums та спокійне наведення без стрибків transform.
  const kernKopFont = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.includes(':is(h1, h2, h3, h4)')),
  );
  const uitrolKopFont = uitrolRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.includes(':is(h1, h2, h3, .mapps-geheim-kop)')),
  );
  const kernTabular = kernRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-stat strong') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-col-count') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-ring b') &&
      r.decls.some((d) => d.eig === 'font-variant-numeric' && d.waarde === 'tabular-nums'),
  );
  const uitrolTabular = uitrolRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-meta dd') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-block.mbk .mbk-meta') &&
      r.decls.some((d) => d.eig === 'font-variant-numeric' && d.waarde === 'tabular-nums'),
  );
  const kernHoverGeenSprong = kernRegels.some(
    (r) =>
      r.media.some((m) => m.includes('hover: hover')) &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-btn:not(:disabled):hover') &&
      r.decls.some((d) => d.eig === 'transform' && d.waarde === 'none'),
  );
  const uitrolHoverGeenSprong = uitrolRegels.some(
    (r) =>
      r.media.some((m) => m.includes('hover: hover')) &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .mapps button:not([disabled]):hover') &&
      r.decls.some((d) => d.eig === 'transform' && d.waarde === 'none'),
  );

  check(
    'заголовки використовують беззасічковий шрифт var(--mq-font-ui), числові показники переведені на tabular-nums, а наведення в класиці вимикає стрибки transform',
    kernKopFont?.decls.some((d) => d.eig === 'font-family' && d.waarde === 'var(--mq-font-ui)') === true &&
      uitrolKopFont?.decls.some((d) => d.eig === 'font-family' && d.waarde === 'var(--mq-font-ui)') === true &&
      kernTabular !== undefined &&
      uitrolTabular !== undefined &&
      kernHoverGeenSprong &&
      uitrolHoverGeenSprong,
  );

  // 12. Повна відсутність градієнтів, розмиття blur(...) і сирого білого кольору #fff / white у класичних шарах.
  check(
    'класичні шари обох файлів не містять градієнтів чи blur(...), а обидві таблиці стилів не мають сирих #fff / #ffffff / white',
    !/linear-gradient|radial-gradient|conic-gradient/i.test(kernKlassiekPc) &&
      !/linear-gradient|radial-gradient|conic-gradient/i.test(uitrolKlassiekPc) &&
      !/blur\(/i.test(kernKlassiekPc) &&
      !/blur\(/i.test(uitrolKlassiekPc) &&
      !RUW_WIT_KLEUR.test(kernZonderCommentaar) &&
      !RUW_WIT_KLEUR.test(uitrolZonderCommentaar),
  );

  // 13. Сувора дисципліна каскаду: нуль !important, prefers-color-scheme, position: fixed; класика перед першим @media; мобільні уточнення перемагають.
  const kernEersteMediaVolg = Math.min(...kernRegels.filter((r) => r.media.length > 0).map((r) => r.volg));
  const kernBasisNaMedia = kernRegels.filter((r) => r.media.length === 0 && !r.overig && r.volg > kernEersteMediaVolg);

  const uitrolEersteMediaVolg = Math.min(...uitrolRegels.filter((r) => r.media.length > 0).map((r) => r.volg));
  const uitrolBasisNaMedia = uitrolRegels.filter((r) => r.media.length === 0 && !r.overig && r.volg > uitrolEersteMediaVolg);

  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };

  const kernWikkelSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate.mcp-maquette-wikkel';
  const kernBlokKopSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-block-head';
  const kernStatSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .mcp-estate .mcp-stat';
  const uitrolKopSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-kop';
  const uitrolKaartSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-kaart';
  const uitrolAppLiSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .mapps-apps > li';

  check(
    'обидві таблиці стилів не містять !important, prefers-color-scheme чи position: fixed, класичні настільні правила стоять суворо перед першим @media, а мобільні відступи перемагають на вузькому екрані',
    !/!\s*important/i.test(kernCss) &&
      !/!\s*important/i.test(uitrolCss) &&
      !/prefers-color-scheme/i.test(kernCss) &&
      !/prefers-color-scheme/i.test(uitrolCss) &&
      !/position\s*:\s*fixed/i.test(kernCss) &&
      !/position\s*:\s*fixed/i.test(uitrolCss) &&
      idxKernKlassiek > 0 &&
      idxKernEersteMedia > idxKernKlassiek &&
      idxUitrolKlassiek > 0 &&
      idxUitrolEersteMedia > idxUitrolKlassiek &&
      kernBasisNaMedia.length === 0 &&
      uitrolBasisNaMedia.length === 0 &&
      wint(kernRegels, kernWikkelSel, 'gap', pcProfiel)?.waarde === '16px' &&
      wint(kernRegels, kernWikkelSel, 'gap', telProfiel)?.waarde === '12px' &&
      wint(kernRegels, kernBlokKopSel, 'padding', pcProfiel)?.waarde === '14px 18px' &&
      wint(kernRegels, kernBlokKopSel, 'padding', telProfiel)?.waarde === '12px 14px' &&
      wint(kernRegels, kernStatSel, 'padding', pcProfiel)?.waarde === '16px 18px' &&
      wint(kernRegels, kernStatSel, 'padding', telProfiel)?.waarde === '14px' &&
      wint(uitrolRegels, uitrolKopSel, 'padding', pcProfiel)?.waarde === '12px 16px' &&
      wint(uitrolRegels, uitrolKopSel, 'padding', telProfiel)?.waarde === '10px 14px' &&
      wint(uitrolRegels, uitrolKaartSel, 'padding', pcProfiel)?.waarde === '18px 20px' &&
      wint(uitrolRegels, uitrolKaartSel, 'padding', telProfiel)?.waarde === '14px' &&
      wint(uitrolRegels, uitrolAppLiSel, 'padding', pcProfiel)?.waarde === '14px 16px' &&
      wint(uitrolRegels, uitrolAppLiSel, 'padding', telProfiel)?.waarde === '12px 14px',
  );

  // 14. Абсолютна мовна чистота у всіх трьох файлах контуру KLASSIEK-008A.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    ['src/mcp-kern-maquette.css', kernCss],
    ['src/mcp-uitrol-maquette.css', uitrolCss],
    ['tests/eenheid/klassiek-008a-mcp-kern-uitrol.test.ts', zelfTest],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);

  check(
    'жоден файл пакета KLASSIEK-008A не містить заборонених літер російської абетки',
    taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
