// KLASSIEK-009A (Хвиля 8А тем оформлення «Біла класика» та «Чорна класика» для піддомену api.tarasevych.com):
// перевірка програмної брами машинних ключів (/toegang), зашифрованого сховища таємниць власника (/kluis)
// та реєстру зовнішніх з’єднань (/verbindingen) у ApiPlatformWeergave.tsx, api-sleutels-maquette.css та api-sleutels-klassiek.css —
// підключення стилів без втручання в розмітку й захист від ШІ ({...verborgenVoorAi}, data-api-plaintext-once, GeheimFormulier),
// відсікання студійних світлих і вітринних блоків через :not([data-maquette-stijl="klassiek"]), колірні схеми обох класичних тем,
// перевизначення всіх похідних змінних --mq-api-* і чистих мініпалітр --gm-*/--vm-*/--il-*, приховування дубльованого заголовка під MaquetteHeld,
// високий контраст одноразового секрету .api-platform-secret в обох класичних темах, первинні кнопки без #fff та var(--mq-wit),
// сучасна плавна геометрія 16px / 11px / 999px, захист рамок :not(#_mqk) винятково без padding і gap, гротеск без засічок,
// табличні цифри tabular-nums, відсутність ореолів і стрибків та сувора каскадна дисципліна.
// Eenheidstest voor de klassieke opmaak van de programmatische sleutelpoort op api.tarasevych.com (KLASSIEK-009A).

import { readFileSync } from 'node:fs';
import { kopReserves } from '../../scripts/plaatsing-controle.mjs';
import { merkContrast } from '../../src/merk/merk-register';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const RUW_WIT_KLEUR = /(?<![-\w])(?:#fff(?:fff)?|white)(?![-\w])/i;
const KLASSIEK_PREFIX = 'html.palet-maquette[data-maquette-stijl="klassiek"]';
const MQK_PREFIX = 'html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)';

const VERWACHTE_KLASSIEKE_VARS: readonly [string, string][] = [
  ['--mq-api-accent', 'var(--mq-accent)'],
  ['--mq-api-robijn', 'var(--mq-accent-2)'],
  ['--mq-api-accent-op', 'var(--mq-accent-op)'],
  ['--mq-api-halo', 'transparent'],
  ['--mq-api-halo-diep', 'transparent'],
  ['--mq-api-halo-zacht', 'transparent'],
  ['--mq-api-rand', 'var(--mq-rand)'],
  ['--mq-api-rand-sterk', 'var(--mq-rand-sterk)'],
  ['--mq-api-rand-actief', 'var(--mq-rand-sterk)'],
  ['--mq-api-glas-verhoogd', 'var(--mq-oppervlak)'],
  ['--mq-api-glas-diep', 'var(--mq-oppervlak)'],
  ['--mq-api-glas-glans', 'transparent'],
  ['--mq-api-veld-put', 'var(--mq-oppervlak-2)'],
  ['--mq-api-goed', 'var(--ok)'],
  ['--mq-api-goed-zacht', 'var(--ok-zacht)'],
  ['--mq-api-wacht', 'var(--warn)'],
  ['--mq-api-wacht-zacht', 'var(--warn-zacht)'],
  ['--mq-api-gevaar', 'var(--fout)'],
  ['--mq-api-gevaar-zacht', 'var(--fout-zacht)'],
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
      const overeenkomst = rest.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*@media\s*[^{]+\{/);
      if (overeenkomst) {
        inMedia = true;
        diepte = 1;
        i += overeenkomst[0].length;
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
  const { check, einde } = checker('klassiek-009a-sleutelpoort');

  const tsxPad = 'src/ApiPlatformWeergave.tsx';
  const studioPad = 'src/api-sleutels-maquette.css';
  const klassiekPad = 'src/api-sleutels-klassiek.css';
  const kernKlassiekPad = 'src/maquette-kern/maquette-klassiek.css';
  const testPad = 'tests/eenheid/klassiek-009a-sleutelpoort.test.ts';

  const tsxBron = readFileSync(tsxPad, 'utf8');
  const studioCss = readFileSync(studioPad, 'utf8');
  const klassiekCss = readFileSync(klassiekPad, 'utf8');
  const kernKlassiekCss = readFileSync(kernKlassiekPad, 'utf8');
  const zelfBron = readFileSync(testPad, 'utf8');

  const klassiekZonderCommentaar = klassiekCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const idxEersteMedia = klassiekCss.search(/@media\s*\(/);
  const klassiekPcSectie =
    idxEersteMedia > 0 ? klassiekCss.slice(0, idxEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '') : '';

  const studioRegels = leesCss(studioCss);
  const klassiekRegels = leesCss(klassiekCss);
  const klassiekPcRegels = klassiekRegels.filter((r) => r.media.length === 0 && !r.overig);
  const declKaart = (r: (typeof klassiekRegels)[number] | undefined) =>
    new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };

  // 1. Підключення таблиці стилів у ApiPlatformWeergave.tsx та збереження захисних атрибутів секрету і канонічної форми сховища.
  const idxStudioImport = tsxBron.indexOf("import './api-sleutels-maquette.css';");
  const idxKlassiekImport = tsxBron.indexOf("import './api-sleutels-klassiek.css';");
  check(
    'у ApiPlatformWeergave.tsx додано рівно один рядок підключення api-sleutels-klassiek.css одразу після студійного зі збереженням {...verborgenVoorAi}, data-api-plaintext-once та GeheimFormulier',
    idxStudioImport > 0 &&
      idxKlassiekImport > idxStudioImport &&
      tsxBron.slice(idxStudioImport, idxKlassiekImport).trim() === "import './api-sleutels-maquette.css';" &&
      tsxBron.includes('{...verborgenVoorAi}') &&
      tsxBron.includes("data-api-plaintext-once='true'") &&
      tsxBron.includes('<GeheimFormulier') &&
      tsxBron.includes('<MaquetteHeld') &&
      tsxBron.includes('<MaquetteAnkerRail') &&
      tsxBron.includes("<IntegratieStrook dienst='ai'/>"),
  );

  // 2. Відсікання студійних світлих режимів та примусово темної шапки вітрини у api-sleutels-maquette.css.
  const studioLichtRegels = studioRegels.filter((r) =>
    r.selectors.some(
      (s) => s.includes('data-theme="light"') || s.includes('theme-light') || s.includes('theme-plum-light'),
    ),
  );
  const studioHeldRegels = studioRegels.filter((r) => r.selectors.some((s) => s.includes('>.mq-held')));
  check(
    'у api-sleutels-maquette.css усі студійні правила світлого режиму та обидва вітринні блоки >.mq-held відсічені через :not([data-maquette-stijl="klassiek"])',
    studioLichtRegels.length === 2 &&
      studioLichtRegels[0].selectors.length === 1 &&
      studioLichtRegels[1].selectors.length === 2 &&
      studioLichtRegels.every((r) =>
        r.selectors.every((s) => s.includes(':not([data-maquette-stijl="klassiek"])')),
      ) &&
      studioHeldRegels.length === 2 &&
      studioHeldRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ),
  );

  // 3. Колірні схеми «Білої класики» та «Чорної класики» і префікси класичної таблиці стилів.
  const witSchemaRegel = klassiekPcRegels.find(
    (r) =>
      r.selectors.includes('html.palet-klassiek-wit .api-platform.mq-schil') &&
      r.decls.some((d) => d.eig === 'color-scheme' && d.waarde === 'light'),
  );
  const zwartSchemaRegel = klassiekPcRegels.find(
    (r) =>
      r.selectors.includes('html.palet-klassiek-zwart .api-platform.mq-schil') &&
      r.decls.some((d) => d.eig === 'color-scheme' && d.waarde === 'dark'),
  );
  check(
    'обидві класичні теми явно задають color-scheme: light для palet-klassiek-wit і color-scheme: dark для palet-klassiek-zwart, а всі селектори обмежені класичними палітрами',
    witSchemaRegel !== undefined &&
      zwartSchemaRegel !== undefined &&
      klassiekRegels.every((r) =>
        r.selectors.every(
          (s) =>
            s.startsWith(KLASSIEK_PREFIX) ||
            s.startsWith('html.palet-klassiek-wit') ||
            s.startsWith('html.palet-klassiek-zwart') ||
            s.startsWith('html.palet-maquette.palet-klassiek-wit') ||
            s.startsWith('html.palet-maquette.palet-klassiek-zwart'),
        ),
      ),
  );

  // 4. Перевизначення всіх похідних змінних --mq-api-* та локальних змінних на чисті матові поверхні ядра і семантичні стани.
  const varRegel = klassiekPcRegels.find(
    (r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .api-platform.mq-schil`) &&
      r.decls.some((d) => d.eig === '--mq-api-accent'),
  );
  const varMap = declKaart(varRegel);
  check(
    'класичний корінь перевизначає всі 33 похідні та локальні змінні на суцільні матові поверхні ядра і семантичні var(--ok), var(--warn), var(--fout)',
    VERWACHTE_KLASSIEKE_VARS.every(([eig, waarde]) => varMap.get(eig) === waarde) &&
      klassiekPcSectie.includes('--accentText: var(--mq-accent-op);'),
  );

  // 5. Чистота змінних мініпалітр (--gm-*, --vm-*, --il-*) без жодного #hex, rgb() чи color-mix().
  const miniDecls = klassiekRegels.flatMap((r) =>
    r.decls.filter(
      (d) => d.eig.startsWith('--gm-') || d.eig.startsWith('--vm-') || d.eig.startsWith('--il-'),
    ),
  );
  check(
    'усі змінні мініпалітр (--gm-*, --vm-*, --il-*) посилаються винятково на чисті змінні станів і поверхонь без #hex, rgb() чи color-mix()',
    miniDecls.length >= 20 &&
      miniDecls.every(
        (d) =>
          /^var\(--(?:ok|ok-zacht|warn|warn-zacht|fout|fout-zacht|info|info-zacht|mq-[a-z0-9-]+)\)$/.test(
            d.waarde,
          ) && !/#|rgba?\(|color-mix/i.test(d.waarde),
      ),
  );

  // 6. Приховування дубльованого внутрішнього заголовка під MaquetteHeld зі збереженням вкладок і можливих живих дій.
  const headerVerbergRegel = klassiekPcRegels.find((r) =>
    r.selectors.includes(
      `${KLASSIEK_PREFIX} .api-platform.mq-schil>header:not(:has(button, a, input, select))`,
    ),
  );
  const headerActiesRegel = klassiekPcRegels.find((r) =>
    r.selectors.includes(`${KLASSIEK_PREFIX} .api-platform.mq-schil>header:has(button, a, input, select)`),
  );
  const tabsVerborgen = klassiekRegels.some(
    (r) =>
      r.selectors.some((s) => s.includes('.api-platform-tabs')) &&
      r.decls.some((d) => d.eig === 'display' && d.waarde === 'none'),
  );
  check(
    'дубльований заголовок >.header та .api-platform-header без дій приховано під MaquetteHeld, а панель вкладок .api-platform-tabs і варіант шапки з діями збережено',
    headerVerbergRegel?.decls.some((d) => d.eig === 'display' && d.waarde === 'none') === true &&
      headerVerbergRegel.selectors.some((s) => s.includes('.api-platform-header:not(:has(button, a, input, select))')) &&
      declKaart(headerActiesRegel).get('border-radius') === '16px' &&
      !tabsVerborgen,
  );

  // 7. Контраст і читабельність одноразового секрету .api-platform-secret у «Білій класиці» та «Чорній класиці».
  const secretRegel = klassiekPcRegels.find(
    (r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .api-platform.mq-schil .api-platform-secret`) &&
      r.decls.some((d) => d.eig === 'border-radius'),
  );
  const secretCodeRegel = klassiekPcRegels.find((r) =>
    r.selectors.includes(`${KLASSIEK_PREFIX} .api-platform.mq-schil .api-platform-secret>code`),
  );
  const secretZwartCodeRegel = klassiekPcRegels.find((r) =>
    r.selectors.includes('html.palet-klassiek-zwart[data-maquette-stijl="klassiek"] .api-platform.mq-schil .api-platform-secret>code'),
  );
  const secretKaart = declKaart(secretRegel);
  const secretCodeKaart = declKaart(secretCodeRegel);
  const secretZwartCodeKaart = declKaart(secretZwartCodeRegel);

  // Звіряємо справжні кольори з ядра maquette-klassiek.css для обчислення контрасту WCAG:
  const witContrastKaart = merkContrast('#111418', '#f1f3f6');
  const witContrastCode = merkContrast('#111418', '#ffffff');
  const zwartContrastKaart = merkContrast('#f3f4f6', '#1b1f27');
  const zwartContrastCode = merkContrast('#f3f4f6', '#0c0e12');

  check(
    'одноразовий секрет .api-platform-secret і блок коду мають матові контрастні поверхні (≥ 14:1 у Білій і Чорній класиці) та чітку рамку 1px solid var(--mq-rand-sterk)',
    kernKlassiekCss.includes('--mq-oppervlak-2: #f1f3f6;') &&
      kernKlassiekCss.includes('--mq-tekst: #111418;') &&
      kernKlassiekCss.includes('--mq-bg: #0c0e12;') &&
      kernKlassiekCss.includes('--mq-oppervlak-2: #1b1f27;') &&
      kernKlassiekCss.includes('--mq-tekst: #f3f4f6;') &&
      secretKaart.get('background') === 'var(--mq-oppervlak-2)' &&
      secretKaart.get('color') === 'var(--mq-tekst)' &&
      secretKaart.get('border') === '1px solid var(--mq-rand-sterk)' &&
      secretKaart.get('border-radius') === '16px' &&
      secretKaart.get('box-shadow') === 'none' &&
      secretCodeKaart.get('background') === 'var(--mq-oppervlak)' &&
      secretCodeKaart.get('color') === 'var(--mq-tekst)' &&
      secretCodeKaart.get('border') === '1px solid var(--mq-rand-sterk)' &&
      secretCodeKaart.get('border-radius') === '11px' &&
      secretZwartCodeKaart.get('background') === 'var(--mq-bg)' &&
      witContrastKaart >= 14 &&
      witContrastCode >= 15 &&
      zwartContrastKaart >= 14 &&
      zwartContrastCode >= 15,
  );

  // 8. Контраст первинних кнопок на var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без #fff і без var(--mq-wit).
  const primKnopRegel = klassiekPcRegels.find((r) =>
    r.selectors.some((s) => s.includes('button[data-api-create-token-button="enabled"]')),
  );
  const primKaart = declKaart(primKnopRegel);
  const primSelTekst = primKnopRegel?.selectors.join(' ') ?? '';
  check(
    'усі первинні кнопки використовують винятково var(--mq-knop-primair-bg) та var(--mq-knop-primair-tekst) із border-radius: 11px і box-shadow: none без #fff чи var(--mq-wit)',
    primKaart.get('background') === 'var(--mq-knop-primair-bg)' &&
      primKaart.get('background-image') === 'none' &&
      primKaart.get('color') === 'var(--mq-knop-primair-tekst)' &&
      primKaart.get('border') === '1px solid var(--mq-knop-primair-bg)' &&
      primKaart.get('border-radius') === '11px' &&
      primKaart.get('box-shadow') === 'none' &&
      [
        'button[data-api-create-token-button="enabled"]',
        '.api-platform-secret .api-platform-secret-actions button:first-child',
        '.api-platform-connections a[data-api-connection-next]',
        '.gm-kluis-formulier .gm-knop.is-primair',
        '.vault-meta-knoppen button[type="submit"]',
      ].every((onderdeel) => primSelTekst.includes(onderdeel)) &&
      !klassiekZonderCommentaar.includes('var(--mq-wit)') &&
      !RUW_WIT_KLEUR.test(klassiekZonderCommentaar),
  );

  // 9. Плавні заокруглення 16px і матові поверхні для всіх карток, панелей, смуги з’єднань і діалогових вікон.
  const grote16Doelen = [
    `${KLASSIEK_PREFIX} .api-platform.mq-schil .api-platform-tabs`,
    `${KLASSIEK_PREFIX} .api-platform.mq-schil .api-platform-panel`,
    `${KLASSIEK_PREFIX} .api-platform.mq-schil .api-platform-table`,
    `${KLASSIEK_PREFIX} .api-platform.mq-schil .api-platform-forbidden`,
    `${KLASSIEK_PREFIX} .api-platform.mq-schil p[data-api-notice="true"]`,
    `${KLASSIEK_PREFIX} .api-platform.mq-schil .api-platform-secret`,
    `${KLASSIEK_PREFIX} .api-platform.mq-schil .api-platform-tokens>li`,
    `${KLASSIEK_PREFIX} .api-platform.mq-schil .api-platform-connections>li`,
    `${KLASSIEK_PREFIX} .api-platform.mq-schil section.is2`,
    `${KLASSIEK_PREFIX} .api-platform.mq-schil .gm-kluis-formulier`,
    `${KLASSIEK_PREFIX} .api-platform.mq-schil .vault-meta-velden`,
  ];
  const dialoogRegel = klassiekPcRegels.find((r) =>
    r.selectors.some((s) => s.includes(':is(.venster, dialog[open], [role="dialog"], .il-dialoog)')),
  );
  check(
    'усі панелі, таблиця, картки ключів, сховища та підключень, смуга section.is2 і діалогові вікна мають border-radius: 16px та суцільне матове тло без background-image',
    grote16Doelen.every((sel) => {
      const r = klassiekPcRegels.find(
        (regel) => regel.selectors.includes(sel) && regel.decls.some((d) => d.eig === 'border-radius'),
      );
      if (!r) return false;
      const m = declKaart(r);
      return m.get('border-radius') === '16px' && m.get('background-image') === 'none';
    }) &&
      declKaart(dialoogRegel).get('border-radius') === '16px' &&
      declKaart(dialoogRegel).get('backdrop-filter') === 'none',
  );

  // 10. Єдині радіуси 11px для кнопок, полів введення, пошуку й кодів та 999px для пігулок станів і прапорців прав (scopes).
  const binnen11Onderdelen = [
    '.api-platform-tabs a',
    '.api-platform-secret>code',
    '.api-platform-tokens>li code',
    '.api-platform-table tbody td:first-child code',
    '.api-platform-connections .api-platform-secret-actions button',
    '.gm-kluis-formulier :is(select, input, textarea)',
    '.gm-kluis-formulier .gm-knop:not(.is-primair)',
    '.gm-kluis-formulier :is(.gm-extra, .gm-github-urls, .gm-vaste-kop, .gm-banner, .gm-waarde)',
    '.vault-meta-velden.vault-meta-velden :is(input, select)',
    ':is(.ic2-zoek, .iw2-zoek, .iw2-veld input, .il-zoek input)',
  ];
  const pillen999Onderdelen = [
    '.api-platform-meta span',
    '[data-api-connection-badge]',
    '.api-platform-forbidden ul>li',
    '.vault-meta .vault-meta-termijn',
    '.gm-kluis-formulier .gm-chip',
    '.is2-lijst>li',
  ];
  const alleStralen = klassiekRegels.flatMap((r) =>
    r.decls.filter((d) => d.eig === 'border-radius').map((d) => d.waarde),
  );
  check(
    'кнопки, поля введення, пошук, префікси ключів і блоки коду мають радіус 11px, пігулки станів і прапорці прав — 999px, а сторонніх радіусів немає',
    binnen11Onderdelen.every((onderdeel) =>
      klassiekPcRegels.some(
        (r) =>
          r.selectors.some((s) => s.includes(onderdeel)) &&
          r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '11px'),
      ),
    ) &&
      pillen999Onderdelen.every((onderdeel) =>
        klassiekPcRegels.some(
          (r) =>
            r.selectors.some((s) => s.includes(onderdeel)) &&
            r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '999px'),
        ),
      ) &&
      alleStralen.length >= 24 &&
      alleStralen.every((w) => w === '16px' || w === '11px' || w === '999px'),
    alleStralen.filter((w) => w !== '16px' && w !== '11px' && w !== '999px').join(', '),
  );

  // 11. Правило захисту від flat-content через html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) суворо без padding і gap.
  const mqkRegels = klassiekRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = mqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'правила захисту :not(#_mqk) містять винятково border, border-inline, border-radius: 16px та box-shadow — нуль padding і нуль gap',
    mqkRegels.length === 2 &&
      mqkRegels.every(
        (r) =>
          r.selectors.every((s) => s.startsWith(MQK_PREFIX) && s.includes(':not([data-mq-a12])')) &&
          r.decls.some((d) => d.eig === 'border') &&
          r.decls.some((d) => d.eig === 'border-inline') &&
          r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') &&
          r.decls.some((d) => d.eig === 'box-shadow'),
      ) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 12. Відсутність градієнтів, ореолів, розмиття і стрибків transform, беззасічковий гротеск заголовків та табличні цифри tabular-nums.
  const kopFontRegel = klassiekPcRegels.find((r) =>
    r.selectors.some((s) => s.includes('.api-platform-panel>strong') && s.includes('.is2-kop h3')),
  );
  const tabularRegel = klassiekPcRegels.find(
    (r) =>
      r.selectors.some((s) => s.includes('[data-api-token-count-value]') && s.includes('.vault-meta-van-tot')) &&
      r.decls.some((d) => d.eig === 'font-variant-numeric' && d.waarde === 'tabular-nums'),
  );
  const hoverZonderSprong = klassiekRegels.some(
    (r) =>
      r.media.some((m) => m.includes('hover: hover')) &&
      r.selectors.some((s) => s.includes('button[data-api-create-token-button="enabled"]')) &&
      r.decls.some((d) => d.eig === 'transform' && d.waarde === 'none') &&
      r.decls.some((d) => d.eig === 'box-shadow' && d.waarde === 'none'),
  );
  check(
    'класична таблиця не має градієнтів, blur(), color-mix() і зсувів translateY/scale, заголовки мають гротеск без засічок, а лічильники й дати — tabular-nums',
    !/gradient/i.test(klassiekZonderCommentaar) &&
      !/blur\(/i.test(klassiekZonderCommentaar) &&
      !/translateY|scale\(/i.test(klassiekZonderCommentaar) &&
      !/color-mix|rgba?\(|#[0-9a-f]{3,8}/i.test(klassiekZonderCommentaar) &&
      declKaart(kopFontRegel).get('font-family') === 'var(--mq-font-ui, Inter, system-ui, sans-serif)' &&
      tabularRegel !== undefined &&
      hoverZonderSprong,
  );

  // 13. Сувора каскадна дисципліна: нуль !important, prefers-color-scheme, position: fixed; усі настільні правила перед першим @media; мобільні відступи перемагають.
  const buitenMedia = inhoudBuitenMediaBlokken(klassiekCss, idxEersteMedia);
  const reserves = kopReserves(klassiekPad, klassiekCss);
  const paneelSel = `${KLASSIEK_PREFIX} .api-platform.mq-schil .api-platform-panel`;
  const secretSel = `${KLASSIEK_PREFIX} .api-platform.mq-schil .api-platform-secret`;
  const tokenLiSel = `${KLASSIEK_PREFIX} .api-platform.mq-schil .api-platform-tokens>li`;
  const is2Sel = `${KLASSIEK_PREFIX} .api-platform.mq-schil section.is2`;

  check(
    'немає !important, prefers-color-scheme, position: fixed чи надмірних резервів шапки вікна, настільні правила стоять перед першим @media, а мобільні правила перемагають на 390×844',
    !/!\s*important/i.test(klassiekCss) &&
      !/prefers-color-scheme/i.test(klassiekCss) &&
      !/position\s*:\s*fixed/i.test(klassiekCss) &&
      idxEersteMedia > 0 &&
      buitenMedia === '' &&
      reserves.length === 0 &&
      wint(klassiekRegels, paneelSel, 'padding', pcProfiel)?.waarde === '18px 20px' &&
      wint(klassiekRegels, paneelSel, 'padding', telProfiel)?.waarde === '14px' &&
      wint(klassiekRegels, secretSel, 'padding', pcProfiel)?.waarde === '16px 18px' &&
      wint(klassiekRegels, secretSel, 'padding', telProfiel)?.waarde === '14px' &&
      wint(klassiekRegels, tokenLiSel, 'padding', pcProfiel)?.waarde === '14px 16px' &&
      wint(klassiekRegels, tokenLiSel, 'padding', telProfiel)?.waarde === '12px 14px' &&
      wint(klassiekRegels, is2Sel, 'padding', pcProfiel)?.waarde === '14px 18px' &&
      wint(klassiekRegels, is2Sel, 'padding', telProfiel)?.waarde === '12px 14px',
  );

  // 14. Абсолютний мовний закон у всіх чотирьох файлах контуру KLASSIEK-009A.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    [tsxPad, tsxBron],
    [studioPad, studioCss],
    [klassiekPad, klassiekCss],
    [testPad, zelfBron],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  check(
    'жоден із чотирьох файлів контуру KLASSIEK-009A не містить заборонених літер російської абетки',
    taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
