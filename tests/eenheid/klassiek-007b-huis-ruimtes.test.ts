// KLASSIEK-007B (Хвиля 6 тем оформлення «Біла класика» та «Чорна класика» для піддомену huis.tarasevych.com):
// перевірка стилів просторів оселі (src/huis/huis-ruimtes-maquette.css) — кімнати (Kamers), план поверху (Plattegrond),
// каталог пристроїв (Apparaten), тактильне керування пристроєм (ApparaatBediening), сцени (Scenes) та автоматизації (Automatiseringen):
// відсікання студійних світлих блоків, суцільні матові поверхні, контрастна кулька перемикача на var(--mq-accent-op),
// монохромні повзунки, інженерне креслення плану поверху, заокруглення 16px / 11px, табличні цифри,
// захист специфічності :not(#_mqk) без padding і gap та каскадна дисципліна.
// Eenheidstest voor de klassieke opmaak van kamers, plattegrond, apparaten, bediening, scènes en automatiseringen (KLASSIEK-007B).

import { readFileSync } from 'node:fs';
import { kopReserves } from '../../scripts/plaatsing-controle.mjs';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const MINI_PALET_RAUW =
  /--(?:aj|ut|hub|ag|v2|gm|adg|il|eo|aib|vm|rb|afz|ov)-(?:ok|warn|err|bad|info|laag|midden|kritiek|g|b|op|bijna|off|uit|unk)(?:-bg|-zacht)?\s*:\s*(?:#|rgba?\(|color-mix)/;

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
      const match = rest.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*@media\s*\([^)]*\)\s*\{/);
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

function rechtsPaddingPx(paddingWaarde: string | undefined): number {
  if (!paddingWaarde) return NaN;
  const delen = paddingWaarde.trim().split(/\s+/);
  const rechtsDeel = delen.length >= 2 ? delen[1] : delen[0];
  const m = /^([\d.]+)px$/.exec(rechtsDeel ?? '');
  return m ? Number(m[1]) : NaN;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-007b-huis-ruimtes');

  const cssPad = 'src/huis/huis-ruimtes-maquette.css';
  const controlePad = 'tests/eenheid/klassiek-007b-huis-ruimtes.test.ts';
  const ruimtesCss = readFileSync(cssPad, 'utf8');
  const zelfControle = readFileSync(controlePad, 'utf8');

  const zonderCommentaar = ruimtesCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const idxKlassiek = ruimtesCss.indexOf('10. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-007B)');
  const idxEersteMedia = ruimtesCss.search(/@media\s*\(/);
  const idxMaxMedia = ruimtesCss.search(/@media\s*\(\s*max-width/);
  const klassiekSectie =
    idxKlassiek > 0 && idxEersteMedia > idxKlassiek
      ? ruimtesCss.slice(idxKlassiek, idxEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const regels = leesCss(ruimtesCss);
  const mapDecls = (r: (typeof regels)[number] | undefined) =>
    new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };

  // 1. Відсікання студійних світлих блоків [data-theme="light"] / .theme-light / .theme-plum-light через :not([data-maquette-stijl="klassiek"]).
  const studioLichtRegels = regels.filter((r) =>
    r.selectors.some(
      (s) => s.includes('[data-theme="light"]') || s.includes('.theme-light') || s.includes('.theme-plum-light'),
    ),
  );
  check(
    'усі студійні світлі правила з [data-theme="light"], .theme-light та .theme-plum-light у huis-ruimtes-maquette.css обмежені через html.palet-maquette:not([data-maquette-stijl="klassiek"]) на кожній гілці селекторів',
    studioLichtRegels.length >= 3 &&
      studioLichtRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ),
  );

  // 2. Перевизначення всіх змінних на головному груповому селекторі просторів оселі (суцільні поверхні, стани, наголос).
  const hoofdVarRegel = regels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.hv-kamers') &&
        s.includes('.hv-apparaten') &&
        s.includes('.hv-scenes') &&
        s.includes('.hv-automatiseringen') &&
        s.includes('.hv-bediening') &&
        s.includes('.hv-plan') &&
        s.includes('.hv-scenes-rij') &&
        s.includes('[data-hv-voorstel]') &&
        s.includes('.hv-laag:has('),
    ),
  );
  const varMap = mapDecls(hoofdVarRegel);
  check(
    'головний класичний селектор просторів оселі задає суцільні матові --mq-huis-glas / --mq-huis-kaart / --mq-huis-invoer, прозорі --mq-huis-gloed / --mq-huis-glans, семантичні стани та --accentText: var(--mq-accent-op)',
    varMap.get('--mq-accent-huis') === 'var(--mq-accent)' &&
      varMap.get('--mq-huis-koper') === 'var(--mq-accent-2)' &&
      varMap.get('--mq-huis-gloed') === 'transparent' &&
      varMap.get('--mq-huis-zacht') === 'var(--mq-oppervlak-hover)' &&
      varMap.get('--mq-huis-rand-goud') === 'var(--mq-rand-sterk)' &&
      varMap.get('--mq-huis-ok') === 'var(--ok)' &&
      varMap.get('--mq-huis-ok-zacht') === 'var(--ok-vlak)' &&
      varMap.get('--mq-huis-warn') === 'var(--warn)' &&
      varMap.get('--mq-huis-warn-zacht') === 'var(--warn-vlak)' &&
      varMap.get('--mq-huis-fout') === 'var(--fout)' &&
      varMap.get('--mq-huis-fout-zacht') === 'var(--fout-vlak)' &&
      varMap.get('--mq-huis-info') === 'var(--info)' &&
      varMap.get('--mq-huis-info-zacht') === 'var(--info-vlak)' &&
      varMap.get('--mq-huis-glas') === 'var(--mq-oppervlak)' &&
      varMap.get('--mq-huis-kaart') === 'var(--mq-oppervlak)' &&
      varMap.get('--mq-huis-invoer') === 'var(--mq-bg)' &&
      varMap.get('--mq-huis-glans') === 'transparent' &&
      varMap.get('--mq-straal-kaart') === '16px' &&
      varMap.get('--mq-straal-veld') === '11px' &&
      varMap.get('--mq-straal-knop') === '11px' &&
      varMap.get('--accenttext') === 'var(--mq-accent-op)' &&
      klassiekSectie.includes('--accentText: var(--mq-accent-op);') &&
      varMap.get('--text-on-accent') === 'var(--mq-accent-op)',
  );

  // 3. Чистий архітектурний план поверху Plattegrond (.hv-plan) без бурштинового туману й ореолів світіння.
  const planRegel = regels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] svg.hv-plan'),
  );
  const planGloedRegel = regels.find(
    (r) =>
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] svg.hv-plan .hv-plan-kamer .hv-plan-binnenrand',
      ) &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] svg.hv-plan .hv-plan-lichtgloed'),
  );
  const planGekozenRegel = regels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette[data-maquette-stijl="klassiek"] svg.hv-plan .hv-plan-kamer.is-gekozen rect',
    ),
  );
  const planMap = mapDecls(planRegel);
  const planGloedMap = mapDecls(planGloedRegel);
  const planGekozenMap = mapDecls(planGekozenRegel);
  check(
    'архітектурний план поверху Plattegrond (.hv-plan) використовує чисті інженерні змінні --mq-huis-plan-*, радіус 16px, background-image: none та прибирає ореоли .hv-plan-lichtgloed / drop-shadow',
    varMap.get('--mq-huis-plan-vlak') === 'var(--mq-oppervlak-2)' &&
      varMap.get('--mq-huis-plan-kamer') === 'var(--mq-oppervlak)' &&
      varMap.get('--mq-huis-plan-rand') === 'var(--mq-rand-sterk)' &&
      varMap.get('--mq-huis-plan-lijn') === 'var(--mq-rand)' &&
      planMap.get('border') === '1px solid var(--mq-huis-plan-rand)' &&
      planMap.get('border-radius') === '16px' &&
      planMap.get('background-color') === 'var(--mq-huis-plan-vlak)' &&
      planMap.get('background-image') === 'none' &&
      planMap.get('box-shadow') === 'none' &&
      planGloedMap.get('display') === 'none' &&
      planGloedMap.get('opacity') === '0' &&
      planGekozenMap.get('stroke') === 'var(--mq-accent)' &&
      planGekozenMap.get('filter') === 'none',
  );

  // 4. Тактильні перемикачі з контрастною кулькою var(--mq-accent-op) та монохромні повзунки в ApparaatBediening.
  const schakelaarAanRegel = regels.find(
    (r) =>
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv-bediening .hv-schakelaar.is-aan') &&
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-bediening .hv-schakelaar[aria-checked="true"]',
      ),
  );
  const schakelaarBolAanRegel = regels.find(
    (r) =>
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-bediening .hv-schakelaar.is-aan .hv-schakelaar-knop',
      ) &&
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-bediening .hv-schakelaar[aria-checked="true"] .hv-schakelaar-knop',
      ),
  );
  const schuifRegel = regels.find(
    (r) =>
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv-bediening input[type="range"]') &&
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-bediening input[type="range"][data-hv-schuif="kleurtemperatuur"]',
      ) &&
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-bediening input[type="range"][data-hv-schuif="doeltemperatuur"]',
      ),
  );
  const schakelaarAanMap = mapDecls(schakelaarAanRegel);
  const schakelaarBolAanMap = mapDecls(schakelaarBolAanRegel);
  const schuifMap = mapDecls(schuifRegel);
  check(
    'увімкнений перемикач .hv-schakelaar.is-aan має доріжку var(--mq-accent) і внутрішню кульку .hv-schakelaar-knop на var(--mq-accent-op), а повзунки яскравості й температури монохромні без кольорових градієнтів',
    schakelaarAanMap.get('background') === 'var(--mq-accent)' &&
      schakelaarAanMap.get('border-color') === 'var(--mq-accent)' &&
      schakelaarAanMap.get('background-image') === 'none' &&
      schakelaarAanMap.get('box-shadow') === 'none' &&
      schakelaarBolAanMap.get('background') === 'var(--mq-accent-op)' &&
      schakelaarBolAanMap.get('background-image') === 'none' &&
      schakelaarBolAanMap.get('box-shadow') === 'none' &&
      schuifMap.get('background') === 'var(--mq-huis-invoer)' &&
      schuifMap.get('background-image') === 'none' &&
      schuifMap.get('accent-color') === 'var(--mq-accent)' &&
      schuifMap.get('box-shadow') === 'none',
  );

  // 5. Первинні кнопки .hv-knop.is-hoofd на var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без світіння та без сирого #fff.
  const hoofdKnopRegel = regels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.hv-kamers') &&
        s.includes('.hv-bediening') &&
        s.endsWith(') .hv-knop.is-hoofd'),
    ),
  );
  const bevestigHoofdKnopRegel = regels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-bediening .hv-bevestig .hv-knop.is-hoofd',
    ),
  );
  const hoofdKnopMap = mapDecls(hoofdKnopRegel);
  const bevestigHoofdKnopMap = mapDecls(bevestigHoofdKnopRegel);
  const witKleurRegel = /(?<![-\w])color\s*:\s*(?:#fff(?:fff)?|white)\b/i;
  check(
    'первинні кнопки .hv-knop.is-hoofd використовують var(--mq-knop-primair-bg) та var(--mq-knop-primair-tekst) з border-radius: 11px і box-shadow: none, критичне підтвердження — var(--fout-vlak) / var(--text-on-vlak), без жодного color: #fff',
    hoofdKnopMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      hoofdKnopMap.get('background-image') === 'none' &&
      hoofdKnopMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      hoofdKnopMap.get('border-radius') === '11px' &&
      hoofdKnopMap.get('box-shadow') === 'none' &&
      bevestigHoofdKnopMap.get('background') === 'var(--fout-vlak)' &&
      bevestigHoofdKnopMap.get('background-image') === 'none' &&
      bevestigHoofdKnopMap.get('color') === 'var(--text-on-vlak)' &&
      bevestigHoofdKnopMap.get('border-radius') === '11px' &&
      bevestigHoofdKnopMap.get('box-shadow') === 'none' &&
      !witKleurRegel.test(zonderCommentaar),
  );

  // 6. Суцільні матові поверхні з радіусом 16px на картках кімнат, пристроїв, сцен, правил автоматизацій та інспекторі без градієнтів і розмиття.
  const kamerVoorRegel = regels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-kamers ul.hv-lijst[data-mq-kamer-raster="1"]>li::before',
    ),
  );
  const laagVakRegel = regels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] .hv-laag:has(') &&
        s.includes('[data-hv-inspector]') &&
        s.endsWith(') .hv-laag-vak'),
    ),
  );
  const kamerVoorMap = mapDecls(kamerVoorRegel);
  const laagVakMap = mapDecls(laagVakRegel);
  check(
    'картки кімнат, пристроїв, сцен, правил автоматизації, пробного прогону та інспектор HuisLaag мають матові поверхні з радіусом 16px, без градієнтів, без backdrop-filter та без стрибків translateY / scale',
    klassiekSectie.includes('section.hv-blok') &&
      klassiekSectie.includes('section.hv-leeg') &&
      klassiekSectie.includes('ul.hv-lijst[data-mq-kamer-raster="1"] > li') &&
      klassiekSectie.includes('button.hv-kaart[data-hv-apparaat-kaart]') &&
      klassiekSectie.includes('article.hv-apparaat') &&
      klassiekSectie.includes('article.hv-kaart.is-scene') &&
      klassiekSectie.includes('.hv-scenes-rij .hv-scene-kaart') &&
      klassiekSectie.includes('ul.hv-lijst[data-mq-regels-lijst="1"] > li') &&
      klassiekSectie.includes('li[data-hv-voorstel]') &&
      klassiekSectie.includes('section.hv-blok.is-regel') &&
      klassiekSectie.includes('section.hv-droogloop') &&
      klassiekSectie.includes('border-radius: 16px;') &&
      kamerVoorMap.get('display') === 'none' &&
      laagVakMap.get('background') === 'var(--mq-oppervlak)' &&
      laagVakMap.get('background-image') === 'none' &&
      laagVakMap.get('backdrop-filter') === 'none' &&
      !/gradient/i.test(klassiekSectie) &&
      !/translateY|scale\(/i.test(klassiekSectie),
  );

  // 7. Плавні заокруглення 11px на всіх кнопках, полях введення, пошуковій рамці (зі збереженням відступу лупи) та плашках .hv-chip.
  const zoekVeldRadius = wint(
    regels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-apparaten .hv-zoekveld',
    'border-radius',
    pcProfiel,
  );
  const zoekInputPadding = wint(
    regels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-apparaten .hv-zoekveld > input',
    'padding',
    pcProfiel,
  );
  check(
    'поля введення, пошукова рамка .hv-zoekveld (із відступом лупи 7px 12px 7px 38px), кнопки .hv-knop / .hv-icoonknop та плашки відбору .hv-chip мають заокруглення 11px',
    zoekVeldRadius?.waarde === '11px' &&
      zoekInputPadding?.waarde === '7px 12px 7px 38px' &&
      klassiekSectie.includes(':where(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]), select, textarea)') &&
      klassiekSectie.includes(':is(.hv-knop, .hv-knop.is-klein)') &&
      klassiekSectie.includes('.hv-icoonknop') &&
      klassiekSectie.includes('.hv-chip') &&
      klassiekSectie.includes('.hv-stappen .hv-stap') &&
      klassiekSectie.includes('border-radius: 11px;'),
  );

  // 8. Чіткі семантичні позначки свіжості пристроїв, критичних дій та станів виконання команд без розмитих градієнтів.
  const kritiekBevestigRegel = regels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .hv-bediening .hv-bevestig'),
  );
  const opdrachtVoltooidRegel = regels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-bediening .hv-opdracht-stand.is-voltooid',
    ),
  );
  const apparaatKritiekRegel = regels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-apparaten button.hv-kaart[data-mq-kritiek="ja"]',
    ),
  );
  const kritiekBevestigMap = mapDecls(kritiekBevestigRegel);
  const opdrachtVoltooidMap = mapDecls(opdrachtVoltooidRegel);
  const apparaatKritiekMap = mapDecls(apparaatKritiekRegel);
  check(
    'критичні картки пристроїв, вікно підтвердження .hv-bevestig та смуги стану виконання .hv-opdracht-stand зберігають чіткі семантичні стани через var(--ok) / var(--warn) / var(--fout) без градієнтних ореолів',
    kritiekBevestigMap.get('border') === '1px solid var(--fout)' &&
      kritiekBevestigMap.get('border-left') === '4px solid var(--fout)' &&
      kritiekBevestigMap.get('border-radius') === '16px' &&
      kritiekBevestigMap.get('background') === 'var(--fout-zacht)' &&
      kritiekBevestigMap.get('background-image') === 'none' &&
      opdrachtVoltooidMap.get('border-color') === 'var(--ok)' &&
      opdrachtVoltooidMap.get('background') === 'var(--ok-zacht)' &&
      opdrachtVoltooidMap.get('color') === 'var(--ok)' &&
      apparaatKritiekMap.get('border-color') === 'var(--fout)' &&
      apparaatKritiekMap.get('border-left-color') === 'var(--fout)' &&
      apparaatKritiekMap.get('background') === 'var(--mq-huis-kaart)' &&
      apparaatKritiekMap.get('background-image') === 'none',
  );

  // 9. Беззасічкова типографіка заголовків без курсиву та табличні цифри tabular-nums на показниках температури, потужності й таблицях.
  const kopFontRegel = regels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.endsWith(') :is(h1, h2, h3, h4, strong)'),
    ),
  );
  const tabNumsRegel = regels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.hv-apparaten button.hv-kaart[data-hv-apparaat-kaart] .hv-waarde') &&
        s.includes('.hv-bediening .hv-regelaar-naam small') &&
        s.includes('table.hv-tabel td'),
    ),
  );
  const kopFontMap = mapDecls(kopFontRegel);
  const tabNumsMap = mapDecls(tabNumsRegel);
  check(
    'заголовки кімнат, пристроїв, сцен і правил мають беззасічковий шрифт var(--mq-font-ui) без курсиву, а числові показники температури, потужності, відсотків і таблиць — font-variant-numeric: tabular-nums',
    kopFontMap.get('font-family') === 'var(--mq-font-ui)' &&
      kopFontMap.get('font-style') === 'normal' &&
      tabNumsMap.get('font-variant-numeric') === 'tabular-nums',
  );

  // 10. Критичне правило специфічності :not(#_mqk) проти flat-content (0, 19, 0) винятково без padding і без gap.
  const mqkRegels = regels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = mqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'усі правила html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) містять винятково border, border-inline, border-radius: 16px та box-shadow (нуль padding і нуль gap)',
    mqkRegels.length >= 6 &&
      mqkRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')),
      ) &&
      mqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px')) &&
      mqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-inline')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 11. Каскадна дисципліна, відсутність !important / prefers-color-scheme / position: fixed, праві відступи шапок <= 20px та мобільні відступи.
  const buitenMedia = inhoudBuitenMediaBlokken(ruimtesCss, idxEersteMedia);
  const reserves = kopReserves(cssPad, ruimtesCss);
  const laagKopSel =
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-laag:has([data-hv-kamer-paneel], [data-hv-inspector], [data-hv-scene-bewerker], [data-hv-scene-uitkomst], [data-hv-auto-bewerker]) .hv-laag-kop';
  const laagKopPc = wint(regels, laagKopSel, 'padding', pcProfiel)?.waarde;
  const laagKopTel = wint(regels, laagKopSel, 'padding', telProfiel)?.waarde;
  const blokTel = wint(
    regels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] :is(.hv-kamers, .hv-apparaten, .hv-scenes, .hv-automatiseringen) section.hv-blok',
    'padding',
    telProfiel,
  )?.waarde;
  const sceneKaartTel = wint(
    regels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hv-scenes article.hv-kaart.is-scene',
    'padding',
    telProfiel,
  )?.waarde;
  check(
    'таблиця стилів не містить !important, prefers-color-scheme чи position: fixed, класичні настільні правила стоять суворо перед першим @media, у шапках вікон padding-right <= 20px, kopReserves порожній, а на телефоні перемагають мобільні відступи',
    !/!\s*important/i.test(ruimtesCss) &&
      !/prefers-color-scheme/i.test(ruimtesCss) &&
      !/position\s*:\s*fixed/i.test(ruimtesCss) &&
      !MINI_PALET_RAUW.test(zonderCommentaar) &&
      idxKlassiek > 0 &&
      idxEersteMedia > idxKlassiek &&
      idxMaxMedia >= idxEersteMedia &&
      buitenMedia === '' &&
      reserves.length === 0 &&
      rechtsPaddingPx(laagKopPc) <= 20 &&
      rechtsPaddingPx(laagKopTel) <= 20 &&
      blokTel === '14px' &&
      sceneKaartTel === '13px 14px',
  );

  // 12. Абсолютна мовна чистота обох файлів контуру KLASSIEK-007B.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    [cssPad, ruimtesCss],
    [controlePad, zelfControle],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  const controleBestandsnaam = controlePad.split('/').pop() ?? '';
  check(
    'жоден файл контуру KLASSIEK-007B не містить заборонених літер російської абетки, а назва файла перевірок відповідає нідерландському іменуванню',
    taalOvertredingen.length === 0 && !/\b(rooms|devices|scenes|automations|controls|view)\b/i.test(controleBestandsnaam),
    taalOvertredingen.join(', '),
  );

  return einde();
}
