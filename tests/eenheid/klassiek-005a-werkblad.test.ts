// KLASSIEK-005A (Хвиля 4 тем оформлення «Біла класика» та «Чорна класика» для головного простору hub.tarasevych.com):
// перевірка огляду, стрічки недавніх дій, вітальної картки, робочого столу та задач —
// відсікання студійних палітр, вимкнення ореолів, смужки ::before, жовтого сонця та градієнтів смуги поступу,
// компактності смуги керування й привітання (min-height: 52px), матових поверхонь 16px, елементів керування 11px,
// захисту специфічності :not(#_mqk) без padding і gap, збереження прокрутки каталогу та мобільного каскаду.
// Eenheidstest voor het klassieke hoofdoverzicht, welkomstkaart, recente activiteit, werkblad en taken (KLASSIEK-005A).

import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const MINI_PALET_FOUT =
  /--hub-(?:ok|warn|err|bad|info|laag|midden|kritiek|g|b|op|bijna|off|uit|unk)(?:-bg|-zacht)?\s*:\s*(?:#|rgba?\(|color-mix)/i;

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
      const match = rest.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*@media\s*\([^)]+\)\s*\{/);
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
  const { check, einde } = checker('klassiek-005a-werkblad');

  const hubCss = readFileSync('src/hub-overzicht-maquette.css', 'utf8');
  const wbCss = readFileSync('src/werkblad/werkblad-maquette.css', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-005a-werkblad.test.ts', 'utf8');

  const hubZonderCommentaar = hubCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const wbZonderCommentaar = wbCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const idxHubKlassiek = hubCss.indexOf('9. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-005A)');
  const idxHubEersteMedia = hubCss.search(/@media\s*\(\s*max-width/);
  const hubKlassiekPc =
    idxHubKlassiek > 0 && idxHubEersteMedia > idxHubKlassiek
      ? hubCss.slice(idxHubKlassiek, idxHubEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const idxWbKlassiek = wbCss.indexOf('7. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-005A)');
  const idxWbEersteMedia = wbCss.search(/@media\s*\(\s*max-width/);
  const wbKlassiekPc =
    idxWbKlassiek > 0 && idxWbEersteMedia > idxWbKlassiek
      ? wbCss.slice(idxWbKlassiek, idxWbEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const hubRegels = leesCss(hubCss);
  const wbRegels = leesCss(wbCss);

  // 1. Відсікання студійних світлих палітр (.theme-light / .theme-plum-light) та примусового нічного наголосу .mq-held.
  const hubLichtRegels = hubRegels.filter((r) =>
    r.selectors.some((s) => s.includes('theme-light') || s.includes('theme-plum-light')),
  );
  const wbLichtRegels = wbRegels.filter((r) =>
    r.selectors.some((s) => s.includes('theme-light') || s.includes('theme-plum-light')),
  );
  const hubStudioHeldRegels = hubRegels.filter(
    (r) =>
      r.selectors.some((s) => s.includes('.mq-held')) &&
      !r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && !s.includes(':not([data-maquette-stijl="klassiek"])')),
  );
  check(
    'усі студійні гілки .theme-light / .theme-plum-light в обох таблицях стилів та примусові правила .mq-held в огляді відсічені через :not([data-maquette-stijl="klassiek"])',
    hubLichtRegels.length === 1 &&
      hubLichtRegels[0].selectors.length === 6 &&
      hubLichtRegels[0].selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')) &&
      wbLichtRegels.length === 1 &&
      wbLichtRegels[0].selectors.length === 6 &&
      wbLichtRegels[0].selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')) &&
      hubStudioHeldRegels.length >= 3 &&
      hubStudioHeldRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ),
  );

  // 2. Вимкнення кольорових ореолів, смужки ::before, жовтого сонця, градієнта смуги поступу та чистота змінних --hub-*.
  const hubWikkelRegel = hubRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hub-maquette-wikkel') &&
      r.decls.some((d) => d.eig === '--mq-hub-halo'),
  );
  const wbWikkelRegel = wbRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad') &&
      r.decls.some((d) => d.eig === '--mq-wb-halo'),
  );
  const hubVarMap = new Map((hubWikkelRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const wbVarMap = new Map((wbWikkelRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const recentVoorRegel = hubRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hub-recent.is-maquette .hub-recent-kaart::before'),
  );
  const recentVoorMap = new Map((recentVoorRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const zonIcoonRegel = wbRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad .wb-begroeting-icoon'),
  );
  const zonIcoonMap = new Map((zonIcoonRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const voortgangSpanRegel = wbRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad .wb-voortgang>span'),
  );
  const voortgangSpanMap = new Map((voortgangSpanRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'ореоли --mq-hub-halo і --mq-wb-halo прозорі, смужка .hub-recent-kaart::before прихована, жовта піктограма .wb-begroeting-icoon переведена на var(--mq-gedempt), смуга .wb-voortgang суцільна на var(--mq-accent), а змінні --hub-* чисті',
    hubVarMap.get('--mq-hub-halo') === 'transparent' &&
      hubVarMap.get('--mq-glas-glans') === 'transparent' &&
      hubVarMap.get('--hub-ok') === 'var(--ok)' &&
      hubVarMap.get('--hub-warn') === 'var(--warn)' &&
      hubVarMap.get('--hub-bad') === 'var(--fout)' &&
      hubVarMap.get('--hub-info') === 'var(--info)' &&
      wbVarMap.get('--mq-wb-halo') === 'transparent' &&
      wbVarMap.get('--mq-wb-glans') === 'transparent' &&
      wbVarMap.get('--hub-ok') === 'var(--ok)' &&
      wbVarMap.get('--hub-warn') === 'var(--warn)' &&
      wbVarMap.get('--hub-bad') === 'var(--fout)' &&
      wbVarMap.get('--hub-info') === 'var(--info)' &&
      !MINI_PALET_FOUT.test(hubZonderCommentaar) &&
      !MINI_PALET_FOUT.test(wbZonderCommentaar) &&
      recentVoorMap.get('display') === 'none' &&
      recentVoorMap.get('background') === 'none' &&
      zonIcoonMap.get('color') === 'var(--mq-gedempt)' &&
      zonIcoonMap.get('background') === 'none' &&
      zonIcoonMap.get('box-shadow') === 'none' &&
      zonIcoonMap.get('filter') === 'none' &&
      voortgangSpanMap.get('background') === 'var(--mq-accent)' &&
      voortgangSpanMap.get('background-image') === 'none',
  );

  // 3. Компактна однорядкова ділова смуга .wb-balk, блок привітання .wb-begroeting та шапка огляду .mq-held (min-height: 52px).
  const wbBalkRegel = wbRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad .wb-balk'),
  );
  const wbBegroetingRegel = wbRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad .wb-begroeting'),
  );
  const hubHeldRegel = hubRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hub-maquette-wikkel>.mq-held'),
  );
  const wbBalkMap = new Map((wbBalkRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const wbBegroetingMap = new Map((wbBegroetingRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const hubHeldMap = new Map((hubHeldRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'ділова смуга .wb-balk, привітання .wb-begroeting та шапка огляду .mq-held мають компактну висоту min-height: 52px, щільні відступи, матове тло var(--mq-oppervlak) і нульове розмиття',
    wbBalkMap.get('min-height') === '52px' &&
      wbBalkMap.get('padding') === '8px 14px' &&
      wbBalkMap.get('background') === 'var(--mq-oppervlak)' &&
      wbBalkMap.get('background-image') === 'none' &&
      wbBalkMap.get('backdrop-filter') === 'none' &&
      wbBegroetingMap.get('min-height') === '52px' &&
      wbBegroetingMap.get('padding') === '10px 16px' &&
      wbBegroetingMap.get('background') === 'var(--mq-oppervlak)' &&
      wbBegroetingMap.get('background-image') === 'none' &&
      wbBegroetingMap.get('backdrop-filter') === 'none' &&
      hubHeldMap.get('min-height') === '52px' &&
      hubHeldMap.get('padding') === '12px 16px' &&
      hubHeldMap.get('background') === 'var(--mq-oppervlak)' &&
      hubHeldMap.get('backdrop-filter') === 'none',
  );

  // 4. Чисті матові поверхні карток головного огляду, недавнього, вітальної картки, блоків, віджетів та діалогів (16px).
  check(
    'усі картки головного огляду (.welkom-kaart, .hub-recent-kaart, .block, .hub-block-widget, .empty-workspace, .hidden-panel, .hub-sectie-menu-lijst, .modal) мають матові поверхні var(--mq-oppervlak) / var(--mq-oppervlak-2), кути 16px і вимкнені градієнти, розмиття та стрибки',
    hubKlassiekPc.includes('.welkom-kaart') &&
      hubKlassiekPc.includes('.hub-recent-kaart') &&
      hubKlassiekPc.includes('.block') &&
      hubKlassiekPc.includes('.hub-block-widget') &&
      hubKlassiekPc.includes('.empty-workspace') &&
      hubKlassiekPc.includes('.hidden-panel') &&
      hubKlassiekPc.includes('.hub-sectie-menu-lijst') &&
      hubKlassiekPc.includes('.modal-backdrop .modal') &&
      hubKlassiekPc.includes('background: var(--mq-oppervlak);') &&
      hubKlassiekPc.includes('background: var(--mq-oppervlak-2);') &&
      hubKlassiekPc.includes('border-radius: 16px;') &&
      hubKlassiekPc.includes('background-image: none;') &&
      hubKlassiekPc.includes('backdrop-filter: none;') &&
      hubKlassiekPc.includes('transform: none;') &&
      !/linear-gradient|radial-gradient/i.test(hubKlassiekPc) &&
      !/translateY|translateX|scale\(/i.test(hubKlassiekPc),
  );

  // 5. Чисті матові поверхні робочого столу, задач, каталогу віджетів і діалогів без порушення висоти й прокрутки каталогу.
  const catalogusHoogteOfScrollFout = wbRegels.filter(
    (r) =>
      r.selectors.some(
        (s) =>
          s.includes('.wb-catalogus-lijst') ||
          s.endsWith('.wb-catalogus') ||
          s.includes('.wb-catalogus-venster'),
      ) && r.decls.some((d) => d.eig === 'max-height' || d.eig === 'height' || d.eig === 'overflow' || d.eig === 'overflow-y'),
  );
  check(
    'картки столу (.wb-tegel.is-kaart, .wb-kaart, .wb-kolom, .wb-taak, .wb-snel-tegel, .wb-catalogus-venster, .wb-catalogus-lijst > li, .bib-paneel, .bib-bewerk, .eig-paneel) матові з кутами 16px, а висота й прокрутка каталогу залишаються недоторканними',
    wbKlassiekPc.includes('.wb-tegel.is-kaart') &&
      wbKlassiekPc.includes('.wb-kaart') &&
      wbKlassiekPc.includes('.wb-kolom') &&
      wbKlassiekPc.includes('.wb-taak') &&
      wbKlassiekPc.includes('.wb-snel-tegel') &&
      wbKlassiekPc.includes('.wb-catalogus-venster') &&
      wbKlassiekPc.includes('.wb-catalogus-lijst > li') &&
      wbKlassiekPc.includes('.bib-paneel') &&
      wbKlassiekPc.includes('.bib-bewerk') &&
      wbKlassiekPc.includes('.eig-paneel') &&
      wbKlassiekPc.includes('background: var(--mq-oppervlak);') &&
      wbKlassiekPc.includes('background: var(--mq-oppervlak-2);') &&
      wbKlassiekPc.includes('border-radius: 16px;') &&
      wbKlassiekPc.includes('background-image: none;') &&
      wbKlassiekPc.includes('backdrop-filter: none;') &&
      wbKlassiekPc.includes('transform: none;') &&
      !/linear-gradient|radial-gradient/i.test(wbKlassiekPc) &&
      !/translateY|translateX|scale\(/i.test(wbKlassiekPc) &&
      catalogusHoogteOfScrollFout.length === 0,
  );

  // 6. Окремі правила специфічності :not(#_mqk) проти flat-content (0, 19, 0) суворо без padding і gap в обох таблицях стилів.
  const hubMqkRegels = hubRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const wbMqkRegels = wbRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const alleMqkRegels = [...hubMqkRegels, ...wbMqkRegels];
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = alleMqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'усі правила з html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) в обох файлах містять винятково border, border-inline, border-radius: 16px та box-shadow без жодного padding чи gap',
    hubMqkRegels.length >= 2 &&
      wbMqkRegels.length >= 2 &&
      alleMqkRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')),
      ) &&
      alleMqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px')) &&
      alleMqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-inline')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 7. Кнопки, пігулки, перемикачі та поля з кутами 11px; суцільні головні кнопки дії без градієнтів і без сирого білого кольору.
  const hubPrimairRegel = hubRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hub-maquette-wikkel .mq-knop-primair'),
  );
  const wbPrimairRegel = wbRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad .knop-primair') &&
      r.decls.some((d) => d.eig === 'background'),
  );
  const hubPrimairMap = new Map((hubPrimairRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const wbPrimairMap = new Map((wbPrimairRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'кнопки, пігулки, перемикачі та поля мають кути 11px, а головні кнопки дії використовують суцільне var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без #fff та градієнтів',
    hubKlassiekPc.includes('border-radius: 11px;') &&
      wbKlassiekPc.includes('border-radius: 11px;') &&
      wbKlassiekPc.includes('.wb-chips button') &&
      wbKlassiekPc.includes('.wb-ruimte-pil') &&
      wbKlassiekPc.includes('.bib-chip') &&
      wbKlassiekPc.includes('.eig-knop') &&
      hubPrimairMap.get('border-radius') === '11px' &&
      hubPrimairMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      hubPrimairMap.get('background-image') === 'none' &&
      hubPrimairMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      hubPrimairMap.get('box-shadow') === 'none' &&
      wbPrimairMap.get('border-radius') === '11px' &&
      wbPrimairMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      wbPrimairMap.get('background-image') === 'none' &&
      wbPrimairMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      wbPrimairMap.get('box-shadow') === 'none' &&
      !/#fff\b|#ffffff\b|\bwhite\b/i.test(hubZonderCommentaar) &&
      !/#fff\b|#ffffff\b|\bwhite\b/i.test(wbZonderCommentaar),
  );

  // 8. Беззасічкова ділова типографіка заголовків h1..h4 та табличні цифри tabular-nums в обох файлах.
  check(
    'заголовки h1..h4 в огляді та на робочому столі використовують var(--mq-font-ui) без курсиву, а лічильники задач, показники сховища, дати й час мають font-variant-numeric: tabular-nums',
    hubKlassiekPc.includes(':is(h1, h2, h3, h4)') &&
      hubKlassiekPc.includes('font-family: var(--mq-font-ui);') &&
      hubKlassiekPc.includes('font-style: normal;') &&
      hubKlassiekPc.includes('font-variant-numeric: tabular-nums;') &&
      hubKlassiekPc.includes('.hub-widget-metrics strong') &&
      hubKlassiekPc.includes('.mq-held-stat-pil') &&
      wbKlassiekPc.includes(':is(h1, h2, h3, h4)') &&
      wbKlassiekPc.includes('font-family: var(--mq-font-ui);') &&
      wbKlassiekPc.includes('font-style: normal;') &&
      wbKlassiekPc.includes('font-variant-numeric: tabular-nums;') &&
      wbKlassiekPc.includes('.wb-teller') &&
      wbKlassiekPc.includes('.wb-tellers strong') &&
      wbKlassiekPc.includes('.wb-taak-stand') &&
      wbKlassiekPc.includes('.wb-opslag-cijfer') &&
      wbKlassiekPc.includes('.wb-begroeting-klok'),
  );

  // 9. Дисципліна каскаду: нуль !important, prefers-color-scheme, position: fixed; розділ класики перед першим @media; перемога мобільних відступів.
  const hubBuitenMedia = inhoudBuitenMediaBlokken(hubCss, idxHubEersteMedia);
  const wbBuitenMedia = inhoudBuitenMediaBlokken(wbCss, idxWbEersteMedia);
  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };
  const hubBlokSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-maquette-wikkel .block';
  const wbBegroetingSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad .wb-begroeting';

  check(
    'обидві таблиці стилів не містять !important, prefers-color-scheme чи position: fixed, класичні розділи стоять суворо перед першим @media, а мобільні відступи перемагають на вузькому екрані',
    !/!\s*important/i.test(hubCss) &&
      !/!\s*important/i.test(wbCss) &&
      !/prefers-color-scheme/i.test(hubCss) &&
      !/prefers-color-scheme/i.test(wbCss) &&
      !/position\s*:\s*fixed/i.test(hubCss) &&
      !/position\s*:\s*fixed/i.test(wbCss) &&
      idxHubKlassiek > 0 &&
      idxHubEersteMedia > idxHubKlassiek &&
      hubBuitenMedia === '' &&
      idxWbKlassiek > 0 &&
      idxWbEersteMedia > idxWbKlassiek &&
      wbBuitenMedia === '' &&
      wint(hubRegels, hubBlokSel, 'padding', pcProfiel)?.waarde === '16px 18px' &&
      wint(hubRegels, hubBlokSel, 'padding', telProfiel)?.waarde === '14px' &&
      wint(wbRegels, wbBegroetingSel, 'padding', pcProfiel)?.waarde === '10px 16px' &&
      wint(wbRegels, wbBegroetingSel, 'padding', telProfiel)?.waarde === '10px 12px',
  );

  // 10. Абсолютна мовна чистота у всіх файлах контуру KLASSIEK-005A.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    ['src/hub-overzicht-maquette.css', hubCss],
    ['src/werkblad/werkblad-maquette.css', wbCss],
    ['tests/eenheid/klassiek-005a-werkblad.test.ts', zelfTest],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  check(
    'жоден файл пакета KLASSIEK-005A не містить заборонених символів російської абетки',
    taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
