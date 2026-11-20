// KLASSIEK-008C (Хвиля 7В тем оформлення «Біла класика» та «Чорна класика» для піддомену mcp.tarasevych.com):
// перевірка стилів розширення оглядача, пристроїв ПК, маркерів доступу, прав користувачів, розмежування просторів,
// технічного контуру та журналу подій у src/agenten/agenten-toegang-maquette.css — відсікання студійних світлих
// селекторів, монохромних змінних поверхонь, чистоти мініпалітр --ag-* і --eo-*, контрасту кнопок, векторних схем
// майстра та перемикачів, прагматичної геометрії 16px / 11px / 999px, табличних цифр, захисту специфічності
// :not(#_mqk) винятково без padding і gap та каскадної дисципліни.
// Eenheidstest voor de klassieke opmaak van agenten- en toegangsonderdelen op mcp.tarasevych.com (KLASSIEK-008C).

import { readFileSync } from 'node:fs';
import { kopReserves } from '../../scripts/plaatsing-controle.mjs';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const KLASSIEK_PREFIX = 'html.palet-maquette[data-maquette-stijl="klassiek"]';
const MQK_PREFIX = 'html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)';

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

function rechterPaddingPx(paddingWaarde: string): number {
  const delen = paddingWaarde.trim().split(/\s+/);
  const rechts = delen[1] ?? delen[0] ?? '';
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(rechts);
  return m ? Number(m[1]) : Number.NaN;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-008c-agenten-toegang');

  const controlePad = 'tests/eenheid/klassiek-008c-agenten-toegang.test.ts';
  const cssPad = 'src/agenten/agenten-toegang-maquette.css';
  const agCss = readFileSync(cssPad, 'utf8');
  const zelfControle = readFileSync(controlePad, 'utf8');
  const agZonderCommentaar = agCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const idxKlassiekTitel = agCss.indexOf('7. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-008C');
  const idxKlassiek = idxKlassiekTitel > 0 ? agCss.lastIndexOf('/*', idxKlassiekTitel) : -1;
  const idxEersteMedia = agCss.search(/@media\s*\(/);
  const klassiekRauw =
    idxKlassiek > 0 && idxEersteMedia > idxKlassiek ? agCss.slice(idxKlassiek, idxEersteMedia) : '';
  const klassiekSectie = klassiekRauw.replace(/\/\*[\s\S]*?\*\//g, '');

  const agRegels = leesCss(agCss);
  const klassiekBureaubladRegels = leesCss(klassiekRauw);
  const bewaarDecls = (r: (typeof agRegels)[number] | undefined) =>
    new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };

  // 1. Відсікання всіх студійних світлих селекторів через :not([data-maquette-stijl="klassiek"]).
  const studioLichtRegels = agRegels.filter((r) =>
    r.selectors.some(
      (s) =>
        s.includes('[data-theme="light"]') ||
        s.includes('.theme-light') ||
        s.includes('.theme-plum-light'),
    ),
  );
  check(
    'усі три гілки студійного світлого селектора ([data-theme="light"], .theme-light, .theme-plum-light) обмежені через :not([data-maquette-stijl="klassiek"])',
    studioLichtRegels.length >= 1 &&
      studioLichtRegels.every(
        (r) =>
          r.selectors.length >= 3 &&
          r.selectors.every((s) => s.includes(':not([data-maquette-stijl="klassiek"])')),
      ),
  );

  // 2. Префікс і повнота класичних настільних та адаптивних селекторів.
  const klassiekMediaRegels = agRegels.filter(
    (r) =>
      r.media.length > 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]')),
  );
  check(
    'усі класичні настільні та адаптивні селектори використовують префікс html.palet-maquette[data-maquette-stijl="klassiek"] зі специфічністю вищою за студійну',
    klassiekBureaubladRegels.length >= 60 &&
      klassiekMediaRegels.length >= 8 &&
      klassiekBureaubladRegels.every((r) =>
        r.selectors.every((s) => s.startsWith(KLASSIEK_PREFIX)),
      ) &&
      klassiekMediaRegels.every((r) =>
        r.selectors
          .filter((s) => s.includes('[data-maquette-stijl="klassiek"]'))
          .every((s) => s.startsWith(KLASSIEK_PREFIX)),
      ),
  );

  // 3. Скидання всіх студійних похідних змінних на суцільні монохромні поверхні та чистота мініпалітр --ag-* і --eo-*.
  const varRegel = klassiekBureaubladRegels.find((r) =>
    r.decls.some((d) => d.eig === '--mq-mcp-glas'),
  );
  const varKaart = bewaarDecls(varRegel);
  const varSel = varRegel?.selectors[0] ?? '';
  const miniDecls = klassiekBureaubladRegels.flatMap((r) =>
    r.decls.filter((d) => d.eig.startsWith('--ag-') || d.eig.startsWith('--eo-')),
  );
  check(
    'головний класичний селектор охоплює всі контури mcp.tarasevych.com, скидає --mq-mcp-* і --panel/--surface на монохромні поверхні, а мініпалітри --ag-* і --eo-* посилаються виключно на чисті змінні без hex чи rgb',
    varKaart.get('--mq-accent-mcp') === 'var(--mq-accent)' &&
      varKaart.get('--mq-accent-mcp-diep') === 'var(--mq-accent-2)' &&
      varKaart.get('--mq-accent-mcp-op') === 'var(--mq-accent-op)' &&
      varKaart.get('--mq-mcp-halo') === 'transparent' &&
      varKaart.get('--mq-mcp-halo-zacht') === 'transparent' &&
      varKaart.get('--mq-mcp-glas') === 'var(--mq-oppervlak)' &&
      varKaart.get('--mq-mcp-glas-verhoogd') === 'var(--mq-oppervlak-2)' &&
      varKaart.get('--mq-mcp-put') === 'var(--mq-bg)' &&
      varKaart.get('--mq-mcp-glans') === 'transparent' &&
      varKaart.get('--mq-mcp-rand') === 'var(--mq-rand)' &&
      varKaart.get('--mq-mcp-rand-sterk') === 'var(--mq-rand-sterk)' &&
      varKaart.get('--mq-mcp-ok') === 'var(--ok)' &&
      varKaart.get('--mq-mcp-ok-zacht') === 'var(--ok-zacht)' &&
      varKaart.get('--mq-mcp-warn') === 'var(--warn)' &&
      varKaart.get('--mq-mcp-warn-zacht') === 'var(--warn-zacht)' &&
      varKaart.get('--mq-mcp-fout') === 'var(--fout)' &&
      varKaart.get('--mq-mcp-fout-zacht') === 'var(--fout-zacht)' &&
      varKaart.get('--mq-mcp-info') === 'var(--info)' &&
      varKaart.get('--mq-mcp-info-zacht') === 'var(--info-zacht)' &&
      varKaart.get('--mq-mcp-prive') === 'var(--mq-accent)' &&
      varKaart.get('--mq-mcp-tech') === 'var(--mq-gedempt)' &&
      varKaart.get('--panel') === 'var(--mq-oppervlak)' &&
      varKaart.get('--panel-2') === 'var(--mq-bg)' &&
      varKaart.get('--surface') === 'var(--mq-oppervlak-2)' &&
      varKaart.get('--surface2') === 'var(--mq-oppervlak-2)' &&
      varKaart.get('--line') === 'var(--mq-rand)' &&
      varKaart.get('--text') === 'var(--mq-tekst)' &&
      varKaart.get('--muted') === 'var(--mq-gedempt)' &&
      varKaart.get('--accent') === 'var(--mq-accent)' &&
      varKaart.get('--accent-soft') === 'var(--mq-oppervlak-zacht)' &&
      varKaart.get('--text-on-accent') === 'var(--mq-accent-op)' &&
      varKaart.get('--focus') === 'var(--mq-accent)' &&
      [
        '[data-tab-inhoud="extensie"]',
        '[data-tab-inhoud="browser"]',
        '[data-tab-inhoud="apparaten"]',
        '[data-tab-inhoud="tokens"]',
        '[data-tab-inhoud="toegang"]',
        '[data-tab-inhoud="technisch"]',
        '[data-tab-inhoud="journaal"]',
        '.eo',
        '.wiz[data-browser-extension="true"]',
        '.wiz[data-agents-pairing]',
        '[data-ai-verbinden="1"]',
        '.at[data-toegang]',
        '[data-ag-blok="ruimte-scheiding"]',
        '[data-tech-verbindingen="1"]',
        '[data-ag-blok="site-schakelaars"]',
        '[id="ag-deuren"]',
        '[data-lijst="deur-verbindingen"]',
        '.tg-venster-achter',
      ].every((onderdeel) => varSel.includes(onderdeel)) &&
      miniDecls.length >= 12 &&
      miniDecls.every(
        (d) =>
          /^var\(--(?:ok|ok-zacht|warn|warn-zacht|fout|fout-zacht|info|info-zacht|mq-[a-z0-9-]+)\)$/.test(
            d.waarde,
          ) && !/#|rgba?\(|color-mix/i.test(d.waarde),
      ),
  );

  // 4. Повна відсутність кольорових переливів, розмиття, свічіння піктограм і стрибків та діловий шрифт заголовків.
  const kopLettertypeRegel = klassiekBureaubladRegels.find((r) =>
    r.selectors.some((s) => s.includes(':is(h2, h3, h4, .ag-blok-titel)')),
  );
  const kopIcoonRegel = klassiekBureaubladRegels.find((r) =>
    r.selectors.some((s) => s.endsWith('.ag-blok-titel>svg')),
  );
  const kopLettertypeKaart = bewaarDecls(kopLettertypeRegel);
  const kopIcoonKaart = bewaarDecls(kopIcoonRegel);
  check(
    'класичний розділ не містить переливів, розмиття, свічіння чи зсувів, вимикає розмиття завіси діалогу та встановлює беззасічковий шрифт заголовків',
    !/gradient/i.test(klassiekSectie) &&
      !/drop-shadow/i.test(klassiekSectie) &&
      !/translateY|scale\(/i.test(klassiekSectie) &&
      !/color-mix|rgba?\(/i.test(klassiekSectie) &&
      klassiekSectie.includes('background-image: none;') &&
      klassiekSectie.includes('backdrop-filter: none;') &&
      kopLettertypeKaart.get('font-family') === 'var(--mq-font-ui, Inter, system-ui, sans-serif)' &&
      kopLettertypeKaart.get('font-style') === 'normal' &&
      kopIcoonKaart.get('filter') === 'none',
  );

  // 5. Матові поверхні з радіусом 16px та рамкою 1px solid var(--mq-rand) на всіх одинадцяти головних групах карток і вікон.
  const agBlokKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.some((s) => s.endsWith(') .ag-blok'))),
  );
  const eoBlokKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.includes(`${KLASSIEK_PREFIX} .eo`)),
  );
  const eoKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.includes(`${KLASSIEK_PREFIX} .eo-kaart`)),
  );
  const wizKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.includes(`${KLASSIEK_PREFIX} .wiz`)),
  );
  const beaSlotKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .bea-sloten>[data-bea-slot]`),
    ),
  );
  const atKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .at[data-toegang]`),
    ),
  );
  const keuzeKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} [data-ag-blok="ruimte-scheiding"] .ag-keuze`),
    ),
  );
  const dienstKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} [data-ag-blok="ruimte-scheiding"] li.ag2-dienst`),
    ),
  );
  const vensterKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.includes(`${KLASSIEK_PREFIX} .tg-venster`)),
  );
  const verbindKlantKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .ag-verbind-klant`),
    ),
  );
  const verbindWegKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .ag-verbind-weg`),
    ),
  );
  const alleHoofdKaarten = [
    agBlokKaart,
    eoBlokKaart,
    eoKaart,
    wizKaart,
    beaSlotKaart,
    atKaart,
    keuzeKaart,
    dienstKaart,
    vensterKaart,
    verbindKlantKaart,
    verbindWegKaart,
  ];
  check(
    'усі великі картки, блоки, слоти керування оглядачем, майстри, картки просторів і модальне вікно мають матові поверхні з border-radius: 16px та рамкою 1px solid var(--mq-rand)',
    alleHoofdKaarten.every(
      (k) =>
        k.get('border-radius') === '16px' &&
        k.get('border') === '1px solid var(--mq-rand)' &&
        k.get('background-image') === 'none',
    ),
  );

  // 6. Заокруглення 11px для вкладених карток, кнопок, полів введення, панелей фільтрів, списків і блоків коду/маркерів.
  const genestBlokKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.some((s) => s.endsWith(') .ag-blok .ag-blok'))),
  );
  const veldKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.some((s) => s.includes('select, textarea)'))),
  );
  const knopKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.includes(`${KLASSIEK_PREFIX} .eo-knop`)),
  );
  const filterKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.includes(`${KLASSIEK_PREFIX} .ag2-filters`)),
  );
  const werkbalkKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.includes(`${KLASSIEK_PREFIX} .tg-werkbalk`)),
  );
  const lijstKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.some((s) => s.endsWith(') .ag-lijst'))),
  );
  const rijToggleKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.some((s) => s.endsWith(') .ag-rij-toggle'))),
  );
  const codeTokenKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(
        `${KLASSIEK_PREFIX} [data-lijst="tokens"] li.ag-rij[data-rij^="tok:"] .ag-rij-titel code`,
      ),
    ),
  );
  check(
    'вкладені картки .ag-blok .ag-blok, поля введення, кнопки, панелі фільтрів (.ag2-filters, .tg-werkbalk), списки, рядки та блоки коду й маркерів мають border-radius: 11px',
    genestBlokKaart.get('border-radius') === '11px' &&
      genestBlokKaart.get('background-image') === 'none' &&
      veldKaart.get('border-radius') === '11px' &&
      veldKaart.get('box-shadow') === 'none' &&
      knopKaart.get('border-radius') === '11px' &&
      knopKaart.get('box-shadow') === 'none' &&
      filterKaart.get('border-radius') === '11px' &&
      werkbalkKaart.get('border-radius') === '11px' &&
      lijstKaart.get('border-radius') === '11px' &&
      rijToggleKaart.get('border-radius') === '11px' &&
      codeTokenKaart.get('border-radius') === '11px',
  );

  // 7. Пігулки станів та перемикачі з радіусом 999px.
  const pilKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.includes(`${KLASSIEK_PREFIX} .eo-rest`)),
  );
  const slotkeuzeKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) => r.selectors.includes(`${KLASSIEK_PREFIX} .ag2-slotkeuze`)),
  );
  const schakelBasisKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.some((s) =>
        s.endsWith(':is(.hub-toggle, .at-schakelaar, .eo-schakel, button[role="switch"])'),
      ),
    ),
  );
  check(
    'пігулки станів (.ag-badge, .eo-rest, .eo-chip, .wiz-badge, .tg-chip, .ag-chip), вибір профілю .ag2-slotkeuze та перемикачі мають border-radius: 999px',
    pilKaart.get('border-radius') === '999px' &&
      slotkeuzeKaart.get('border-radius') === '999px' &&
      schakelBasisKaart.get('border-radius') === '999px',
  );

  // 8. Контраст первинних кнопок на var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без #fff і без var(--mq-wit).
  const primKnopRegel = klassiekBureaubladRegels.find((r) =>
    r.selectors.includes(`${KLASSIEK_PREFIX} .eo-knop.is-hoofd`),
  );
  const primKnopKaart = bewaarDecls(primKnopRegel);
  const primSelectors = primKnopRegel?.selectors ?? [];
  const witKleurRegel = /(?<![-\w])color\s*:\s*(?:#fff(?:fff)?|white)\b/i;
  check(
    'усі первинні кнопки (.ag-knop-primair, .eo-knop.is-hoofd, .wiz-primary, .at-knop-prim, .tg-venster .ag-knop-primair) мають var(--mq-knop-primair-bg) і var(--mq-knop-primair-tekst) без тіней, #fff чи var(--mq-wit)',
    primSelectors.some((s) => s.endsWith(') .ag-knop-primair')) &&
      primSelectors.includes(`${KLASSIEK_PREFIX} .eo-knop.is-hoofd`) &&
      primSelectors.includes(`${KLASSIEK_PREFIX} .wiz-primary`) &&
      primSelectors.includes(`${KLASSIEK_PREFIX} .at[data-toegang] .at-knop-prim`) &&
      primSelectors.includes(`${KLASSIEK_PREFIX} .tg-venster .ag-knop-primair`) &&
      primKnopKaart.get('background') === 'var(--mq-knop-primair-bg)' &&
      primKnopKaart.get('background-image') === 'none' &&
      primKnopKaart.get('color') === 'var(--mq-knop-primair-tekst)' &&
      primKnopKaart.get('border-color') === 'var(--mq-knop-primair-bg)' &&
      primKnopKaart.get('border-radius') === '11px' &&
      primKnopKaart.get('box-shadow') === 'none' &&
      !klassiekSectie.includes('var(--mq-wit)') &&
      !witKleurRegel.test(agZonderCommentaar),
  );

  // 9. Контраст векторних ілюстрацій майстра (.wiz-mock), номерів кроків (.wiz-num) та увімкнених перемикачів у «Чорній класиці».
  const wizNumKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .wiz-step:is(.now, .active, .done) .wiz-num`),
    ),
  );
  const mockKnobKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .wiz-mock .m-knob`),
    ),
  );
  const mockBtnKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .wiz-mock .m-btn`),
    ),
  );
  const mockHlKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .wiz-mock .m-hl`),
    ),
  );
  const schakelAanKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.some((s) => s.includes('button[role="switch"]:is([aria-checked="true"], .is-aan)')),
    ),
  );
  const schakelKnopAanKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.some((s) => s.includes('.at-schakelaar:is(.is-aan, [aria-checked="true"]) .at-knop')),
    ),
  );
  check(
    'кулька .wiz-mock .m-knob, напис .wiz-mock .m-btn, номери кроків .wiz-step:is(.now, .active, .done) .wiz-num та кульки увімкнених перемикачів використовують контрастний var(--mq-accent-op) на тлі var(--mq-accent)',
    wizNumKaart.get('background') === 'var(--mq-accent)' &&
      wizNumKaart.get('color') === 'var(--mq-accent-op)' &&
      mockHlKaart.get('fill') === 'var(--mq-accent)' &&
      mockBtnKaart.get('fill') === 'var(--mq-accent-op)' &&
      mockKnobKaart.get('fill') === 'var(--mq-accent-op)' &&
      schakelAanKaart.get('background') === 'var(--mq-accent)' &&
      schakelKnopAanKaart.get('background') === 'var(--mq-accent-op)',
  );

  // 10. Чесні семантичні сигнали станів у розблокуванні, розмежуванні просторів і журналі подій без переливів.
  const eoOntgrendeldKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .eo-kaart.is-ontgrendeld`),
    ),
  );
  const dienstGedeeldKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(
        `${KLASSIEK_PREFIX} [data-ag-blok="ruimte-scheiding"] li.ag2-dienst[data-stand="gedeeld"]`,
      ),
    ),
  );
  const dienstBevrorenKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(
        `${KLASSIEK_PREFIX} [data-ag-blok="ruimte-scheiding"] li.ag2-dienst[data-stand="bevroren"]`,
      ),
    ),
  );
  const journaalFoutKaart = bewaarDecls(
    klassiekBureaubladRegels.find((r) =>
      r.selectors.includes(
        `${KLASSIEK_PREFIX} ul.ag-journaal[data-journaal]>li.ag-rij[data-toon="bad"]`,
      ),
    ),
  );
  check(
    'картки розблокування, рядки розмежування просторів та записи журналу передають стани через чисті var(--ok), var(--warn), var(--fout), var(--info) з background-image: none',
    eoOntgrendeldKaart.get('border-left') === '4px solid var(--ok)' &&
      eoOntgrendeldKaart.get('background') === 'var(--ok-zacht)' &&
      eoOntgrendeldKaart.get('background-image') === 'none' &&
      dienstGedeeldKaart.get('border-left') === '4px solid var(--warn)' &&
      dienstGedeeldKaart.get('background') === 'var(--warn-zacht)' &&
      dienstBevrorenKaart.get('border-left') === '4px solid var(--info)' &&
      dienstBevrorenKaart.get('background') === 'var(--info-zacht)' &&
      journaalFoutKaart.get('background') === 'var(--fout-zacht)' &&
      journaalFoutKaart.get('background-image') === 'none',
  );

  // 11. Табличні цифри tabular-nums для лічильників, таймера, відбитків маркерів, портів брами та часу журналу.
  const tabellarischRegel = klassiekBureaubladRegels.find((r) =>
    r.selectors.some((s) => s.includes('[data-apparaten-telling]') && s.includes('[data-tokens-telling]')),
  );
  const tabellarischSel = tabellarischRegel?.selectors[0] ?? '';
  check(
    'лічильники пристроїв і маркерів, таймер .eo-rest, відбитки маркерів, таблиця серверної брами та часові позначки журналу мають font-variant-numeric: tabular-nums',
    bewaarDecls(tabellarischRegel).get('font-variant-numeric') === 'tabular-nums' &&
      codeTokenKaart.get('font-variant-numeric') === 'tabular-nums' &&
      [
        '[data-apparaten-telling]',
        '[data-tokens-telling]',
        '.eo-rest',
        '.tg-feiten dd',
        '.tg-tijd',
        '[id="ag-deuren"] table.ag-deuren',
        'ul.ag-journaal[data-journaal] time',
      ].every((onderdeel) => tabellarischSel.includes(onderdeel)),
  );

  // 12. Захист специфічності :not(#_mqk) проти обрамлення винятково з border, border-inline, border-radius: 16px та box-shadow (нуль padding і нуль gap).
  const mqkRegels = agRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = mqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'правила html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) містять винятково border, border-inline, border-radius: 16px та box-shadow — суворо нуль padding і нуль gap',
    mqkRegels.length >= 5 &&
      mqkRegels.every((r) => r.selectors.every((s) => s.startsWith(MQK_PREFIX))) &&
      mqkRegels.every((r) =>
        r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px'),
      ) &&
      mqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-inline')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 13. Каскадна дисципліна, розміщення перед першим @media, перемога мобільних правил на 390×844 та праві відступи шапки діалогу <= 20px.
  const buitenMedia = inhoudBuitenMediaBlokken(agCss, idxEersteMedia);
  const reserves = kopReserves(cssPad, agCss);
  const vensterKopSel = `${KLASSIEK_PREFIX} .tg-venster>:is(header, h3, .venster-kop)`;
  const vensterKopPcPad = wint(agRegels, vensterKopSel, 'padding', pcProfiel)?.waarde ?? '';
  const vensterKopTelPad = wint(agRegels, vensterKopSel, 'padding', telProfiel)?.waarde ?? '';
  check(
    'таблиця стилів не містить !important, prefers-color-scheme чи position: fixed, класичний блок стоїть суворо перед першим @media, мобільні правила перемагають на 390×844, а правий відступ шапок діалогів <= 20px',
    !/!\s*important/i.test(agCss) &&
      !/prefers-color-scheme/i.test(agCss) &&
      !/position\s*:\s*fixed/i.test(agCss) &&
      idxKlassiek > 0 &&
      idxEersteMedia > idxKlassiek &&
      buitenMedia === '' &&
      reserves.length === 0 &&
      vensterKopPcPad === '0 16px 10px 0' &&
      vensterKopTelPad === '0 12px 8px 0' &&
      rechterPaddingPx(vensterKopPcPad) <= 20 &&
      rechterPaddingPx(vensterKopTelPad) <= 20 &&
      wint(
        agRegels,
        `${KLASSIEK_PREFIX} .bea-sloten>[data-bea-slot]`,
        'padding',
        telProfiel,
      )?.waarde === '14px' &&
      wint(
        agRegels,
        `${KLASSIEK_PREFIX} [data-ag-blok="ruimte-scheiding"] li.ag2-dienst`,
        'padding',
        telProfiel,
      )?.waarde === '12px 14px' &&
      wint(agRegels, `${KLASSIEK_PREFIX} .tg-venster`, 'padding', telProfiel)?.waarde ===
        '14px 16px' &&
      wint(agRegels, `${KLASSIEK_PREFIX} .tg-werkbalk`, 'padding', telProfiel)?.waarde ===
        '10px 12px',
  );

  // 14. Абсолютна мовна чистота обох файлів контуру KLASSIEK-008C.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    [cssPad, agCss],
    [controlePad, zelfControle],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  const controleBestandsnaam = controlePad.split('/').pop() ?? '';
  check(
    'жоден із двох файлів контуру KLASSIEK-008C не містить заборонених літер російської абетки, а назва файла випробувань відповідає нідерландському іменуванню',
    taalOvertredingen.length === 0 &&
      !/\b(access|devices|permissions|journal|settings)\b/i.test(controleBestandsnaam),
    taalOvertredingen.join(', '),
  );

  return einde();
}
