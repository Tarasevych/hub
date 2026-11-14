// KLASSIEK-010C (Фінальна Хвиля 9В тем оформлення «Біла класика» та «Чорна класика» у консолі керування):
// перевірка каталогу інтеграцій (integraties-maquette.css), діагностики служб і контуру захисту (diagnostiek-maquette.css)
// та криптографічного журналу подій (audit-maquette.css): відсікання студійних блоків світлого режиму й рамок flat-content,
// чистота семантичних мініпалітр --il-*, --adg-* та --aj-*, явний color-scheme для білої та чорної класики,
// матові поверхні без градієнтів, ореолів і розмиття backdrop-filter, контрастні первинні кнопки без #fff і var(--mq-wit),
// геометрія заокруглень 16px / 11px / 999px, правий відступ шапок діалогів і панелей <= 20px,
// беззасічковий гротеск і табличні цифри tabular-nums, захист рамок :not(#_mqk) без padding і gap, каскад @media та мовна чистота.
// Eenheidstest voor de integratiecatalogus, systeemdiagnostiek en het auditlogboek in Klassiek Wit en Klassiek Zwart (KLASSIEK-010C).

import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { leesCss, wint, type Regel } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const ZUIVERE_TOKEN_WAARDE = /^var\(--(?:ok|ok-zacht|warn|warn-zacht|fout|fout-zacht|info|info-zacht|mq-[a-z0-9-]+)\)$/;

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
      const treffer = rest.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*@media\s*[^{]+\{/);
      if (treffer) {
        inMedia = true;
        diepte = 1;
        i += treffer[0].length;
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

function rechtseOpvullingPx(paddingWaarde: string): number {
  const delen = paddingWaarde.trim().split(/\s+/);
  const rechts = delen.length === 1 ? delen[0] : delen[1];
  const treffer = /^([\d.]+)px$/.exec(rechts ?? '');
  return treffer ? Number(treffer[1]) : NaN;
}

function klassiekeRegels(regels: Regel[]): Regel[] {
  return regels.filter((r) =>
    r.selectors.some(
      (s) =>
        !s.includes(':not([data-maquette-stijl="klassiek"])') &&
        (s.includes('[data-maquette-stijl="klassiek"]') ||
          s.includes('palet-klassiek-wit') ||
          s.includes('palet-klassiek-zwart')),
    ),
  );
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-010c-beheer-diagnostiek-journaal');

  const integratiesCss = readFileSync('src/integraties/integraties-maquette.css', 'utf8');
  const diagnostiekCss = readFileSync('src/diagnostiek/diagnostiek-maquette.css', 'utf8');
  const auditCss = readFileSync('src/audit/audit-maquette.css', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-010c-beheer-diagnostiek-journaal.test.ts', 'utf8');

  const ilRegels = leesCss(integratiesCss);
  const adgRegels = leesCss(diagnostiekCss);
  const ajRegels = leesCss(auditCss);

  const idxKlassiekIl = integratiesCss.indexOf('KLASSIEK-010C');
  const idxKlassiekAdg = diagnostiekCss.indexOf('KLASSIEK-010C');
  const idxKlassiekAj = auditCss.indexOf('KLASSIEK-010C');

  const idxMediaIl = integratiesCss.search(/@media\s*\(/);
  const idxMediaAdg = diagnostiekCss.search(/@media\s*\(/);
  const idxMediaAj = auditCss.search(/@media\s*\(/);

  const klassiekPcIl =
    idxKlassiekIl > 0 && idxMediaIl > idxKlassiekIl
      ? integratiesCss.slice(idxKlassiekIl, idxMediaIl).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';
  const klassiekPcAdg =
    idxKlassiekAdg > 0 && idxMediaAdg > idxKlassiekAdg
      ? diagnostiekCss.slice(idxKlassiekAdg, idxMediaAdg).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';
  const klassiekPcAj =
    idxKlassiekAj > 0 && idxMediaAj > idxKlassiekAj
      ? auditCss.slice(idxKlassiekAj, idxMediaAj).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  // 1. Відсікання студійних блоків світлого режиму через :not([data-maquette-stijl="klassiek"]) у всіх трьох таблицях.
  const isLichtSelector = (s: string) =>
    s.includes('data-theme="light"') || s.includes('theme-light') || s.includes('theme-plum-light');
  const ilLicht = ilRegels.filter((r) => r.selectors.some(isLichtSelector));
  const adgLicht = adgRegels.filter((r) => r.selectors.some(isLichtSelector));
  const ajLicht = ajRegels.filter((r) => r.selectors.some(isLichtSelector));
  check(
    'усі студійні блоки світлого режиму в integraties-maquette.css, diagnostiek-maquette.css та audit-maquette.css відсічені через :not([data-maquette-stijl="klassiek"])',
    ilLicht.length >= 1 &&
      adgLicht.length >= 2 &&
      ajLicht.length >= 2 &&
      [...ilLicht, ...adgLicht, ...ajLicht].every((r) =>
        r.selectors.every((tak) => tak.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ),
  );

  // 2. Явне встановлення color-scheme: light для palet-klassiek-wit та color-scheme: dark для palet-klassiek-zwart у всіх 3 модулях.
  const heeftColorScheme = (regels: Regel[], paletKlas: string, verwacht: string) =>
    regels.some(
      (r) =>
        r.media.length === 0 &&
        r.selectors.some((s) => s.includes(paletKlas)) &&
        r.decls.some((d) => d.eig === 'color-scheme' && d.waarde === verwacht),
    );
  check(
    'обидві класичні теми явно встановлюють color-scheme: light для palet-klassiek-wit та color-scheme: dark для palet-klassiek-zwart у каталозі інтеграцій, діагностиці та журналі подій',
    heeftColorScheme(ilRegels, 'palet-klassiek-wit', 'light') &&
      heeftColorScheme(ilRegels, 'palet-klassiek-zwart', 'dark') &&
      heeftColorScheme(adgRegels, 'palet-klassiek-wit', 'light') &&
      heeftColorScheme(adgRegels, 'palet-klassiek-zwart', 'dark') &&
      heeftColorScheme(ajRegels, 'palet-klassiek-wit', 'light') &&
      heeftColorScheme(ajRegels, 'palet-klassiek-zwart', 'dark'),
  );

  // 3. Чистота семантичних мініпалітр (--il-*, --adg-*, --aj-*) у класичних розділах без #hex, rgb() чи color-mix().
  const ilMini = klassiekeRegels(ilRegels)
    .flatMap((r) => r.decls)
    .filter((d) => d.eig.startsWith('--il-'));
  const adgMini = klassiekeRegels(adgRegels)
    .flatMap((r) => r.decls)
    .filter((d) => d.eig.startsWith('--adg-'));
  const ajMini = klassiekeRegels(ajRegels)
    .flatMap((r) => r.decls)
    .filter((d) => d.eig.startsWith('--aj-'));
  const onzuiverMini = [...ilMini, ...adgMini, ...ajMini].filter((d) => !ZUIVERE_TOKEN_WAARDE.test(d.waarde));
  check(
    'усі змінні мініпалітр --il-*, --adg-* та --aj-* у класичних розділах використовують винятково чисті змінні var(--ok/--warn/--fout/--info/--mq-*) без hex, rgb чи color-mix',
    ilMini.length >= 6 && adgMini.length >= 5 && ajMini.length >= 14 && onzuiverMini.length === 0,
    onzuiverMini.map((d) => `${d.eig}: ${d.waarde}`).join(', '),
  );

  // 4. Повна відсутність градієнтів, розмиття backdrop-filter та підстрибування transform у класичних правилах усіх 3 таблиць.
  const alleKlassiek = [
    ...klassiekeRegels(ilRegels),
    ...klassiekeRegels(adgRegels),
    ...klassiekeRegels(ajRegels),
  ];
  const metGradient = alleKlassiek.filter((r) =>
    r.decls.some((d) => /linear-gradient|radial-gradient|conic-gradient/i.test(d.waarde)),
  );
  const metBlur = alleKlassiek.filter((r) =>
    r.decls.some((d) => d.eig.endsWith('backdrop-filter') && d.waarde !== 'none'),
  );
  const metSprong = alleKlassiek.filter((r) =>
    r.decls.some((d) => d.eig === 'transform' && d.waarde !== 'none'),
  );
  check(
    'класичні настільні та мобільні правила усіх 3 таблиць не містять градієнтів, розмиття backdrop-filter чи підстрибувань transform',
    metGradient.length === 0 &&
      metBlur.length === 0 &&
      metSprong.length === 0 &&
      klassiekPcIl.includes('backdrop-filter: none;') &&
      klassiekPcAj.includes('backdrop-filter: none;'),
  );

  // 5. Первинні кнопки (.il-knop.is-primair, .ic2-knop.is-primair, .adg-knop-hoofd, .aj-knop-hoofd) використовують var(--mq-knop-primair-bg) та var(--mq-knop-primair-tekst) без #fff і var(--mq-wit).
  const heeftPrimair = (regels: Regel[], deel: string) =>
    regels.some((r) => {
      if (r.media.length > 0 || !r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.includes(deel))) {
        return false;
      }
      const m = new Map(r.decls.map((d) => [d.eig, d.waarde]));
      return (
        m.get('background') === 'var(--mq-knop-primair-bg)' &&
        m.get('background-image') === 'none' &&
        m.get('color') === 'var(--mq-knop-primair-tekst)' &&
        m.get('box-shadow') === 'none'
      );
    });
  const klassiekWaarden = alleKlassiek.flatMap((r) => r.decls.map((d) => `${d.eig}:${d.waarde}`)).join(';');
  check(
    'первинні кнопки (.il-knop.is-primair, .ic2-knop.is-primair, .adg-knop-hoofd, .aj-knop-hoofd) мають суцільне тло var(--mq-knop-primair-bg) і текст var(--mq-knop-primair-tekst) без #fff і var(--mq-wit)',
    heeftPrimair(ilRegels, '.il-knop.is-primair') &&
      heeftPrimair(ilRegels, '.ic2-knop.is-primair') &&
      heeftPrimair(adgRegels, '.adg-knop-hoofd') &&
      heeftPrimair(ajRegels, '.aj-knop-hoofd') &&
      !klassiekWaarden.includes('var(--mq-wit)') &&
      !/#fff\b|#ffffff\b|(?<![\w-])white(?![\w-])/i.test(klassiekWaarden),
  );

  // 6. Геометрія заокруглень у каталозі інтеграцій: 16px картки/діалоги, 11px кнопки/поля/коди, 999px пігулки.
  const vindStraal = (regels: Regel[], deel: string) => {
    const ontsnapt = deel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const eindPatroon = new RegExp(`${ontsnapt}(?:\\s*$|(?:\\s*,[^)]*)?\\)\\s*$)`);
    const kandidaten = klassiekeRegels(regels).filter(
      (item) =>
        item.media.length === 0 &&
        item.selectors.some((s) => !s.includes(':not(#_mqk)') && eindPatroon.test(s.replace(/:not\([^)]*\)/g, ''))) &&
        item.decls.some((d) => d.eig === 'border-radius'),
    );
    const r = kandidaten[kandidaten.length - 1];
    return new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde])).get('border-radius');
  };
  check(
    'у каталозі інтеграцій (.il-hero, .il-kaart, .il-dialoog) картки мають кути 16px, кнопки й поля (.il-knop, .ic2-zoek) — 11px, а вкладки й стани (.il-status) — 999px',
    vindStraal(ilRegels, '.il-hero') === '16px' &&
      vindStraal(ilRegels, '.il-kaart') === '16px' &&
      vindStraal(ilRegels, '.il-dialoog') === '16px' &&
      vindStraal(ilRegels, '.il-knop') === '11px' &&
      vindStraal(ilRegels, '.ic2-zoek') === '11px' &&
      vindStraal(ilRegels, '.il-status') === '999px',
  );

  // 7. Геометрія заокруглень у діагностиці служб: 16px секції/картки, 11px кнопки/коди/поля, 999px пігулки.
  check(
    'у діагностиці служб (.adg-root, .adg-kaart, .adg-trend) секції та картки мають кути 16px, кнопки й коди (.adg-knop, .admin-diagnostic-raw pre) — 11px, а пігулки (.adg-pil) — 999px',
    vindStraal(adgRegels, '.adg-root') === '16px' &&
      vindStraal(adgRegels, '.adg-kaart') === '16px' &&
      vindStraal(adgRegels, '.adg-trend') === '16px' &&
      vindStraal(adgRegels, '.adg-knop') === '11px' &&
      vindStraal(adgRegels, '.admin-diagnostic-raw pre') === '11px' &&
      vindStraal(adgRegels, '.adg-pil') === '999px',
  );

  // 8. Геометрія заокруглень у криптографічному журналі подій: 16px картки/стрічка/фільтри, 11px кнопки/поля/хеші, 999px пігулки/результати.
  check(
    'у криптографічному журналі подій (.aj-root, .aj-kaart, .aj-filters, .aj-regel) картки мають кути 16px, кнопки й блоки SHA-256 (.aj-knop, .aj-json) — 11px, а пігулки й результати (.aj-chip, .aj-res) — 999px',
    vindStraal(ajRegels, '.aj-root') === '16px' &&
      vindStraal(ajRegels, '.aj-kaart') === '16px' &&
      vindStraal(ajRegels, '.aj-filters') === '16px' &&
      vindStraal(ajRegels, '.aj-regel') === '16px' &&
      vindStraal(ajRegels, '.aj-knop') === '11px' &&
      vindStraal(ajRegels, '.aj-json') === '11px' &&
      vindStraal(ajRegels, '.aj-chip') === '999px' &&
      vindStraal(ajRegels, '.aj-res') === '999px',
  );

  // 9. Усі радіуси в настільних класичних правилах трьох таблиць належать винятково до {0, 16px, 11px, 999px}.
  const toegestaneStralen = new Set(['0', '0px', '16px', '11px', '999px']);
  const vreemdeStralen = alleKlassiek
    .filter((r) => r.media.length === 0)
    .flatMap((r) => r.decls.filter((d) => d.eig === 'border-radius' && !toegestaneStralen.has(d.waarde)));
  check(
    'усі настільні класичні значення border-radius у трьох модулях належать винятково до множини {0, 16px, 11px, 999px} без квадратних чи студійних кутів',
    vreemdeStralen.length === 0,
    vreemdeStralen.map((d) => d.waarde).join(', '),
  );

  // 10. Правий відступ шапок діалогу інтеграцій (.il-d-kop) та бічної панелі журналу (.aj-paneel > header) <= 20px на ПК і телефоні.
  const normSel = (s: string) => s.replace(/\s*>\s*/g, '>');
  const vindPadding = (regels: Regel[], onderdelen: string[], mobiel: boolean) => {
    const doelen = onderdelen.map(normSel);
    const kandidaten = klassiekeRegels(regels).filter(
      (item) =>
        (mobiel ? item.media.length > 0 : item.media.length === 0) &&
        item.selectors.some((s) => {
          const genorm = normSel(s);
          return doelen.every((d) => genorm.includes(d));
        }) &&
        item.decls.some((d) => d.eig === 'padding'),
    );
    const r = kandidaten[kandidaten.length - 1];
    return rechtseOpvullingPx(new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde])).get('padding') ?? '');
  };
  const kopRechts = [
    vindPadding(ilRegels, ['.il-d-kop'], false),
    vindPadding(ilRegels, ['.il-d-kop'], true),
    vindPadding(ajRegels, ['.aj-paneel', '>header'], false),
    vindPadding(ajRegels, ['.aj-paneel', '>header'], true),
  ];
  check(
    'правий відступ шапок діалогу інтеграцій (.il-d-kop) та панелі подробиць журналу (.aj-paneel > header) суворо <= 20px на компʼютері й телефоні',
    kopRechts.every((px) => Number.isFinite(px) && px <= 20),
    kopRechts.join(', '),
  );

  // 11. Беззасічковий гротеск заголовків та табличні цифри tabular-nums лічильників, часів і контрольних сум.
  check(
    'заголовки всіх 3 модулів використовують шрифт без засічок var(--mq-font-ui, Inter, system-ui, sans-serif), а лічильники, часові позначки й контрольні суми мають font-variant-numeric: tabular-nums',
    klassiekPcIl.includes('font-family: var(--mq-font-ui, Inter, system-ui, sans-serif);') &&
      klassiekPcAdg.includes('font-family: var(--mq-font-ui, Inter, system-ui, sans-serif);') &&
      klassiekPcAj.includes('font-family: var(--mq-font-ui, Inter, system-ui, sans-serif);') &&
      klassiekPcIl.includes('font-variant-numeric: tabular-nums;') &&
      klassiekPcAdg.includes('font-variant-numeric: tabular-nums;') &&
      klassiekPcAj.includes('font-variant-numeric: tabular-nums;') &&
      klassiekPcAj.includes('.aj-tijd'),
  );

  // 12. Правила захисту рамок :not(#_mqk) поверх flat-content містять винятково border / border-inline / border-left / border-radius: 16px / box-shadow (нуль padding і нуль gap).
  const mqkIl = ilRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const mqkAdg = adgRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const mqkAj = ajRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const alleMqk = [...mqkIl, ...mqkAdg, ...mqkAj];
  const toegestaanMqk = new Set(['border', 'border-inline', 'border-left', 'border-radius', 'box-shadow']);
  const verbodenMqk = alleMqk.flatMap((r) => r.decls.filter((d) => !toegestaanMqk.has(d.eig)).map((d) => d.eig));
  check(
    'правила захисту html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) у всіх трьох таблицях мають border-radius: 16px і нуль padding та нуль gap',
    mqkIl.length >= 1 &&
      mqkAdg.length >= 1 &&
      mqkAj.length >= 2 &&
      alleMqk.every((r) => r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px')) &&
      verbodenMqk.length === 0,
    verbodenMqk.join(', '),
  );

  // 13. Настільний класичний блок перед першим @media, перемога мобільних відступів на 390×844 та нуль !important / prefers-color-scheme / position: fixed.
  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };
  const ilKopSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .admin-console .il-d-kop';
  const adgRootSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .adg-root';
  const ajRootSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .aj-root';
  const alleDrie = `${integratiesCss}\n${diagnostiekCss}\n${auditCss}`;
  check(
    'класичні настільні блоки розміщені суворо перед першим @media у всіх 3 файлах, поза @media немає пізніших правил, нуль !important / prefers-color-scheme / position: fixed, а мобільні значення перемагають на 390×844',
    idxKlassiekIl > 0 &&
      idxMediaIl > idxKlassiekIl &&
      idxKlassiekAdg > 0 &&
      idxMediaAdg > idxKlassiekAdg &&
      idxKlassiekAj > 0 &&
      idxMediaAj > idxKlassiekAj &&
      inhoudBuitenMediaBlokken(integratiesCss, idxMediaIl) === '' &&
      inhoudBuitenMediaBlokken(diagnostiekCss, idxMediaAdg) === '' &&
      inhoudBuitenMediaBlokken(auditCss, idxMediaAj) === '' &&
      !/!\s*important/i.test(alleDrie) &&
      !/prefers-color-scheme/i.test(alleDrie) &&
      !/position\s*:\s*fixed/i.test(alleDrie) &&
      wint(ilRegels, ilKopSel, 'padding', pcProfiel)?.waarde === '14px 18px' &&
      wint(ilRegels, ilKopSel, 'padding', telProfiel)?.waarde === '12px 16px' &&
      wint(adgRegels, adgRootSel, 'padding', pcProfiel)?.waarde === '18px 20px' &&
      wint(adgRegels, adgRootSel, 'padding', telProfiel)?.waarde === '12px' &&
      wint(ajRegels, ajRootSel, 'padding', pcProfiel)?.waarde === '18px 20px' &&
      wint(ajRegels, ajRootSel, 'padding', telProfiel)?.waarde === '12px 14px',
  );

  // 14. Повна відсутність заборонених символів російської абетки у всіх 4 файлах контуру KLASSIEK-010C.
  const bestanden: readonly [string, string][] = [
    ['src/integraties/integraties-maquette.css', integratiesCss],
    ['src/diagnostiek/diagnostiek-maquette.css', diagnostiekCss],
    ['src/audit/audit-maquette.css', auditCss],
    ['tests/eenheid/klassiek-010c-beheer-diagnostiek-journaal.test.ts', zelfTest],
  ];
  const overtredingen = bestanden.filter(([, txt]) => VERBODEN_LETTERS.test(txt)).map(([pad]) => pad);
  check(
    'жоден із чотирьох файлів контуру KLASSIEK-010C не містить заборонених літер російської абетки',
    overtredingen.length === 0,
    overtredingen.join(', '),
  );

  return einde();
}
