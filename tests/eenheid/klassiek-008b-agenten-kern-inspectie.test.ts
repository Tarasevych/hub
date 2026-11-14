// KLASSIEK-008B (Хвиля 7Б тем оформлення «Біла класика» та «Чорна класика» для піддомену mcp.tarasevych.com):
// перевірка таблиць стилів ядра осередку агентів і з'єднувачів другого покоління (src/agenten/agenten-kern-maquette.css)
// та студії інспектора, зовнішніх серверів і багатоагентної координації (src/agenten/agenten-inspectie-maquette.css):
// відсікання індиго-кобальтового акценту й студійних світлих блоків, чистота змінних мініпалітр без сирих кольорів і color-mix,
// збереження живої ділової смуги шапки з кнопкою екстреної зупинки .ai-stop та прозорого контейнера якорів .ag-ankers,
// суцільна матова прилипальна рейка вкладок, геометрія 16px / 11px / 999px, контраст первинних кнопок, табличні цифри,
// суворе правило специфічності :not(#_mqk) без padding і gap та дисципліна мобільного каскаду.
// Eenheidstest voor de klassieke opmaak van het agentenhart, connectoren v2, inspectiestudio en coördinatie (KLASSIEK-008B).

import { readFileSync } from 'node:fs';
import { kopReserves } from '../../scripts/plaatsing-controle.mjs';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const MINI_PALET_BESTAND =
  /--(?:aj|ut|hub|ag|v2|gm|adg|il|eo|aib|vm|rb|afz|ov)-(?:ok|warn|err|bad|info|laag|midden|kritiek|g|b|op|bijna|off|uit|unk)(?:-bg|-zacht)?\s*:\s*(?:#|rgba?\(|color-mix)/;
const MINI_PALET_KLASSIEK =
  /--(?:ag|v2)-(?:ok|warn|err|bad|info|laag|midden|hoog|kritiek|g|b|op|bijna|off|uit|unk)(?:-bg|-zacht)?\s*:\s*(?:#|rgba?\(|color-mix)/;

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
      const match = rest.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*@media\s+[^{]+\{/);
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
  const { check, einde } = checker('klassiek-008b-agenten-kern-inspectie');

  const kernPad = 'src/agenten/agenten-kern-maquette.css';
  const inspectiePad = 'src/agenten/agenten-inspectie-maquette.css';
  const controlePad = 'tests/eenheid/klassiek-008b-agenten-kern-inspectie.test.ts';

  const kernCss = readFileSync(kernPad, 'utf8');
  const inspectieCss = readFileSync(inspectiePad, 'utf8');
  const zelfControle = readFileSync(controlePad, 'utf8');

  const kernZonderCommentaar = kernCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const inspectieZonderCommentaar = inspectieCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const idxKernKlassiek = kernCss.indexOf('8. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-008B)');
  const idxKernEersteMedia = kernCss.search(/@media\s*\(/);
  const idxKernMaxMedia = kernCss.search(/@media\s*\(\s*max-width/);
  const kernKlassiekSectie =
    idxKernKlassiek > 0 && idxKernEersteMedia > idxKernKlassiek
      ? kernCss.slice(idxKernKlassiek, idxKernEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const idxInspKlassiek = inspectieCss.indexOf('5. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-008B)');
  const idxInspEersteMedia = inspectieCss.search(/@media\s*\(/);
  const idxInspMaxMedia = inspectieCss.search(/@media\s*\(\s*max-width/);
  const inspKlassiekSectie =
    idxInspKlassiek > 0 && idxInspEersteMedia > idxInspKlassiek
      ? inspectieCss.slice(idxInspKlassiek, idxInspEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const kernRegels = leesCss(kernCss);
  const inspRegels = leesCss(inspectieCss);
  const mapDecls = (r: (typeof kernRegels)[number] | undefined) =>
    new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };

  // 1. Відсікання студійного індиго-кобальтового акценту й світлих блоків у agenten-kern-maquette.css та перевизначення --mq-accent-mcp.
  const kernRootStudio = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette:not([data-maquette-stijl="klassiek"]):where(:root)'),
  );
  const kernLichtRegels = kernRegels.filter((r) =>
    r.selectors.some(
      (s) => s.includes('[data-theme="light"]') || s.includes('.theme-light') || s.includes('.theme-plum-light'),
    ),
  );
  const kernRootKlassiek = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"]:where(:root)'),
  );
  check(
    'у agenten-kern-maquette.css студійний :where(:root) та всі 6 гілок світлих правил обмежені через :not([data-maquette-stijl="klassiek"]), а класичний :where(:root) задає --mq-accent-mcp: var(--mq-accent)',
    Boolean(kernRootStudio) &&
      kernLichtRegels.length === 2 &&
      kernLichtRegels[0].selectors.length === 2 &&
      kernLichtRegels[1].selectors.length === 4 &&
      kernLichtRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ) &&
      mapDecls(kernRootKlassiek).get('--mq-accent-mcp') === 'var(--mq-accent)',
  );

  // 2. Відсікання студійного акценту й світлих блоків у agenten-inspectie-maquette.css та перевизначення --mq-accent-mcp.
  const inspRootStudio = inspRegels.find((r) =>
    r.selectors.includes('html.palet-maquette:not([data-maquette-stijl="klassiek"]):where(:root)'),
  );
  const inspLichtRegels = inspRegels.filter((r) =>
    r.selectors.some(
      (s) => s.includes('[data-theme="light"]') || s.includes('.theme-light') || s.includes('.theme-plum-light'),
    ),
  );
  const inspRootKlassiek = inspRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"]:where(:root)'),
  );
  check(
    'у agenten-inspectie-maquette.css студійний :where(:root) та всі 6 гілок світлих правил обмежені через :not([data-maquette-stijl="klassiek"]), а класичний :where(:root) задає --mq-accent-mcp: var(--mq-accent)',
    Boolean(inspRootStudio) &&
      inspLichtRegels.length === 2 &&
      inspLichtRegels[0].selectors.length === 2 &&
      inspLichtRegels[1].selectors.length === 4 &&
      inspLichtRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ) &&
      mapDecls(inspRootKlassiek).get('--mq-accent-mcp') === 'var(--mq-accent)',
  );

  // 3. Чистота змінних мініпалітри ядра та з'єднувачів другого покоління (--mq-ag-*, --ag-*, --v2-*) без сирих кольорів і без color-mix.
  const kernHoofdVar = kernRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.ag-pagina') &&
        s.includes('.v2b') &&
        s.includes('.v2-kiezer') &&
        s.includes('.v2-wizard') &&
        s.includes('.v2b-overlay'),
    ),
  );
  const kernVarMap = mapDecls(kernHoofdVar);
  const heeftRauweOfMixInKernVars = [...(kernHoofdVar?.decls ?? [])].some((d) =>
    /#|rgba?\(|color-mix/i.test(d.waarde),
  );
  check(
    'головний класичний селектор ядра агентів і з\'єднувачів v2 передає лише чисті var(--ok/--warn/--fout/--info/--mq-*) та числові радіуси 16px (включно з --v2-hoog: var(--fout) без color-mix)',
    !heeftRauweOfMixInKernVars &&
      !MINI_PALET_KLASSIEK.test(kernKlassiekSectie) &&
      kernVarMap.get('--mq-ag-accent') === 'var(--mq-accent)' &&
      kernVarMap.get('--mq-ag-accent-diep') === 'var(--mq-accent-2)' &&
      kernVarMap.get('--mq-ag-accent-op') === 'var(--mq-accent-op)' &&
      kernVarMap.get('--mq-ag-gloed') === 'transparent' &&
      kernVarMap.get('--mq-ag-gloed-zacht') === 'var(--mq-oppervlak-zacht)' &&
      kernVarMap.get('--mq-ag-glas') === 'var(--mq-oppervlak)' &&
      kernVarMap.get('--mq-ag-glas-binnen') === 'var(--mq-oppervlak-2)' &&
      kernVarMap.get('--mq-ag-rand') === 'var(--mq-rand)' &&
      kernVarMap.get('--mq-ag-rand-sterk') === 'var(--mq-rand-sterk)' &&
      kernVarMap.get('--accent') === 'var(--mq-accent)' &&
      kernVarMap.get('--accenttext') === 'var(--mq-accent-op)' &&
      kernKlassiekSectie.includes('--accentText: var(--mq-accent-op);') &&
      kernVarMap.get('--text-on-accent') === 'var(--mq-accent-op)' &&
      kernVarMap.get('--ag-ok') === 'var(--ok)' &&
      kernVarMap.get('--ag-warn') === 'var(--warn)' &&
      kernVarMap.get('--ag-bad') === 'var(--fout)' &&
      kernVarMap.get('--ag-off') === 'var(--mq-gedempt)' &&
      kernVarMap.get('--ag-info') === 'var(--info)' &&
      kernVarMap.get('--ag-r') === '16px' &&
      kernVarMap.get('--v2-g') === 'var(--mq-accent)' &&
      kernVarMap.get('--v2-g-zacht') === 'var(--mq-oppervlak-zacht)' &&
      kernVarMap.get('--v2-b') === 'var(--warn)' &&
      kernVarMap.get('--v2-b-zacht') === 'var(--warn-zacht)' &&
      kernVarMap.get('--v2-uit') === 'var(--mq-stil)' &&
      kernVarMap.get('--v2-laag') === 'var(--ok)' &&
      kernVarMap.get('--v2-midden') === 'var(--warn)' &&
      kernVarMap.get('--v2-hoog') === 'var(--fout)' &&
      kernVarMap.get('--v2-kritiek') === 'var(--fout)' &&
      kernVarMap.get('--v2-r') === '16px',
  );

  // 4. Чистота змінних студії інспектора, зовнішніх серверів та координації (--mq-insp-*).
  const inspHoofdVar = inspRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('[data-mcp-inspector-studio]') &&
        s.includes('[data-tab-inhoud="extern"]') &&
        s.includes('[data-orch]'),
    ),
  );
  const inspVarMap = mapDecls(inspHoofdVar);
  const heeftRauweOfMixInInspVars = [...(inspHoofdVar?.decls ?? [])].some((d) =>
    /#|rgba?\(|color-mix/i.test(d.waarde),
  );
  check(
    'головний класичний селектор інспектора, зовнішніх серверів та координації задає чисті матові змінні --mq-insp-* та --accentText: var(--mq-accent-op) без color-mix',
    !heeftRauweOfMixInInspVars &&
      inspVarMap.get('--mq-insp-accent') === 'var(--mq-accent)' &&
      inspVarMap.get('--mq-insp-accent-diep') === 'var(--mq-accent-2)' &&
      inspVarMap.get('--mq-insp-accent-op') === 'var(--mq-accent-op)' &&
      inspVarMap.get('--mq-insp-gloed') === 'transparent' &&
      inspVarMap.get('--mq-insp-gloed-zacht') === 'var(--mq-oppervlak-zacht)' &&
      inspVarMap.get('--mq-insp-glas') === 'var(--mq-oppervlak)' &&
      inspVarMap.get('--mq-insp-binnen') === 'var(--mq-oppervlak-2)' &&
      inspVarMap.get('--mq-insp-code-bg') === 'var(--mq-oppervlak-2)' &&
      inspVarMap.get('--mq-insp-rand') === 'var(--mq-rand)' &&
      inspVarMap.get('--mq-insp-rand-sterk') === 'var(--mq-rand-sterk)' &&
      inspVarMap.get('--accent') === 'var(--mq-accent)' &&
      inspVarMap.get('--accenttext') === 'var(--mq-accent-op)' &&
      inspKlassiekSectie.includes('--accentText: var(--mq-accent-op);') &&
      inspVarMap.get('--text-on-accent') === 'var(--mq-accent-op)',
  );

  // 5. Збереження живої шапки .ag-pagina-kop з кнопкою екстреної зупинки .ai-stop, приховування .ag-pagina-icoon та збереження .ag-ankers.
  const kopRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina-kop'),
  );
  const icoonRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina-icoon'),
  );
  const kopTitelRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina-tekst h1'),
  );
  const stopKnopRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina-kop .ai-stop'),
  );
  const ankersRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette .ag-pagina>.ag-ankers'),
  );
  const kopMap = mapDecls(kopRegel);
  const kopTitelMap = mapDecls(kopTitelRegel);
  check(
    'шапка .ag-pagina-kop залишається живою компактною смугою (min-height: 48px, padding: 10px 16px, border-radius: 16px, box-shadow: none) з видимою праворуч кнопкою .ai-stop, прихованою іконкою .ag-pagina-icoon і недоторканним .ag-ankers { display: contents }',
    kopMap.get('display') === 'flex' &&
      kopMap.get('padding') === '10px 16px' &&
      kopMap.get('min-height') === '48px' &&
      kopMap.get('border-radius') === '16px' &&
      kopMap.get('background') === 'var(--mq-oppervlak)' &&
      kopMap.get('background-image') === 'none' &&
      kopMap.get('border') === '1px solid var(--mq-rand)' &&
      kopMap.get('box-shadow') === 'none' &&
      mapDecls(icoonRegel).get('display') === 'none' &&
      kopTitelMap.get('font-family') === 'var(--mq-font-ui)' &&
      kopTitelMap.get('font-size') === '1.04rem' &&
      kopTitelMap.get('font-weight') === '650' &&
      mapDecls(stopKnopRegel).get('margin-left') === 'auto' &&
      mapDecls(ankersRegel).get('display') === 'contents',
  );

  // 6. Суцільна матова прилипальна рейка вкладок .ag-tabs-wrap та монохромна вибрана вкладка .ag-tab-knop[aria-selected="true"].
  const tabsWrapRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina .ag-tabs-wrap'),
  );
  const tabKnopRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina .ag-tab-knop'),
  );
  const tabActiefRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina .ag-tab-knop[aria-selected="true"]'),
  );
  const tabActiefSvgRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina .ag-tab-knop[aria-selected="true"] svg'),
  );
  const tabActiefTellerRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina .ag-tab-knop[aria-selected="true"] .ag-teller'),
  );
  const tabsWrapMap = mapDecls(tabsWrapRegel);
  const tabActiefMap = mapDecls(tabActiefRegel);
  check(
    'прилипальна рейка .ag-tabs-wrap є суцільною матовою (16px, без backdrop-filter і тіні), кнопки .ag-tab-knop мають радіус 11px, а вибрана вкладка монохромна з контрастною іконкою svg та лічильником .ag-teller',
    tabsWrapMap.get('background') === 'var(--mq-oppervlak)' &&
      tabsWrapMap.get('border') === '1px solid var(--mq-rand)' &&
      tabsWrapMap.get('border-radius') === '16px' &&
      tabsWrapMap.get('box-shadow') === 'none' &&
      tabsWrapMap.get('-webkit-backdrop-filter') === 'none' &&
      tabsWrapMap.get('backdrop-filter') === 'none' &&
      mapDecls(tabKnopRegel).get('border-radius') === '11px' &&
      tabActiefMap.get('background') === 'var(--mq-accent)' &&
      tabActiefMap.get('color') === 'var(--mq-accent-op)' &&
      tabActiefMap.get('border-color') === 'var(--mq-accent)' &&
      tabActiefMap.get('box-shadow') === 'none' &&
      mapDecls(tabActiefSvgRegel).get('color') === 'var(--mq-accent-op)' &&
      mapDecls(tabActiefTellerRegel).get('background') === 'var(--mq-oppervlak)' &&
      mapDecls(tabActiefTellerRegel).get('color') === 'var(--mq-tekst)',
  );

  // 7. Матові картки, панелі, секції та вікна з геометрією 16px у ядрі агентів і з'єднувачів v2.
  const blokRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-blok'),
  );
  const hoofdBlokRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina .ag-sectie.ag-blok-hoofd'),
  );
  const statRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina .ag-stat'),
  );
  const v2bKaartRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .v2b-kaart'),
  );
  const v2bPaneelRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .v2b-paneel'),
  );
  const vensterGroepRegel = kernRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.v2b-venster') &&
        s.includes('.ag-bord-paneel'),
    ),
  );
  const kaartGroepRegel = kernRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.ag-bord-kaart') &&
        s.includes('.v2-instelling') &&
        s.includes('.v2-kant') &&
        s.includes('.v2-ruimte-kaart'),
    ),
  );
  check(
    'головні картки, секції, показники, панелі та вікна ядра й з\'єднувачів v2 (.ag-blok, .ag-sectie.ag-blok-hoofd, .ag-stat, .ag-bord-kaart, .v2b-kaart, .v2b-paneel, .v2-instelling, .v2b-venster, .v2-kant, .v2-ruimte-kaart) мають радіус 16px, background-image: none та нуль ореолів і розмиття',
    [blokRegel, hoofdBlokRegel, statRegel, v2bKaartRegel, v2bPaneelRegel, vensterGroepRegel, kaartGroepRegel].every(
      (r) =>
        mapDecls(r).get('border-radius') === '16px' &&
        mapDecls(r).get('background-image') === 'none' &&
        mapDecls(r).get('box-shadow') === 'none',
    ) && mapDecls(vensterGroepRegel).get('backdrop-filter') === 'none',
  );

  // 8. Матові секції та картки з геометрією 16px у студії інспектора, зовнішніх серверах та координації [data-orch].
  const studioRegel = inspRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] [data-mcp-inspector-studio="1"]'),
  );
  const consoleRegel = inspRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] [data-mcp-inspector-studio="1"] [data-inspector-console="1"]'),
  );
  const inspSectieRegel = inspRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('[data-tab-inhoud="extern"]>section.ag-blok') &&
        s.includes('[data-orch]>section.ag-blok'),
    ),
  );
  const inspKaartRegel = inspRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('[data-inspector-recepten="1"]') &&
        s.includes('[data-orch] .orch-kv') &&
        s.includes('[data-orch] .ag-formrij') &&
        s.includes('[data-orch] .orch-bestand'),
    ),
  );
  check(
    'секції та картки студії інспектора ([data-mcp-inspector-studio="1"], [data-inspector-console="1"]), зовнішніх серверів і координації [data-orch] мають радіус 16px, матове тло без градієнтів і нуль тіней',
    [studioRegel, consoleRegel, inspSectieRegel, inspKaartRegel].every(
      (r) =>
        mapDecls(r).get('border-radius') === '16px' &&
        mapDecls(r).get('background-image') === 'none' &&
        mapDecls(r).get('box-shadow') === 'none',
    ) && mapDecls(studioRegel).get('backdrop-filter') === 'none',
  );

  // 9. Прагматична геометрія 11px для вкладених блоків, кнопок, полів вводу, сегментів, кодових блоків і редакторів правил та 999px для пігулок.
  const binnenBlokRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ag-blok .ag-blok'),
  );
  const kernKnopRegel = kernRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.ag-knop') &&
        s.includes('.v2-knop'),
    ),
  );
  const kernSubGroepRegel = kernRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.v2b-modus button') &&
        s.includes('.v2b-presets button') &&
        s.includes('.v2b-teller') &&
        s.includes('.v2b-rij') &&
        s.includes('.v2-groep') &&
        s.includes('.v2-modus') &&
        s.includes('.v2-verschil-deel') &&
        s.includes('.v2-account') &&
        s.includes('.v2-samenvatting'),
    ),
  );
  const kernPilRegel = kernRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.ag-teller') &&
        s.includes('.v2-stappen li'),
    ),
  );
  const inspSubGroepRegel = inspRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('[data-mcp-inspector-studio="1"] .ag-segment') &&
        s.includes('textarea[data-inspector-veld="params"]') &&
        s.includes('.ag-ruw') &&
        s.includes('[data-orch] .orch-regel-uit') &&
        s.includes('[data-orch] .orch-bestand textarea'),
    ),
  );
  const inspRadioRegel = inspRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] [data-mcp-inspector-studio="1"] .ag-segment button[role="radio"]'),
  );
  const bslKnopRegel = inspRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] [data-orch] .bsl-knop'),
  );
  const orchChipRegel = inspRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] [data-orch] .orch-chips>li'),
  );
  check(
    'вкладені блоки (.ag-blok .ag-blok), кнопки (.ag-knop, .v2-knop, .bsl-knop), сегменти, поля, кодові панелі JSON-RPC та редактори правил мають радіус 11px, а пігулки й кроки — 999px',
    [binnenBlokRegel, kernKnopRegel, kernSubGroepRegel, inspSubGroepRegel, inspRadioRegel, bslKnopRegel].every(
      (r) => mapDecls(r).get('border-radius') === '11px',
    ) &&
      mapDecls(kernPilRegel).get('border-radius') === '999px' &&
      mapDecls(orchChipRegel).get('border-radius') === '999px',
  );

  // 10. Контраст первинних кнопок, радіокнопок, перемикачів та кроків майстра без #fff і без var(--mq-wit) на акценті.
  const kernPrimairRegel = kernRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.ag-knop-primair') &&
        s.includes('.ag-knop.is-primair') &&
        s.includes('.v2-knop-primair') &&
        s.includes('.v2-knop.is-primair'),
    ),
  );
  const inspPrimairRegel = inspRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('[data-orch] .bsl-knop.bsl-knop-primair') &&
        s.includes('[data-mcp-inspector-studio="1"] .ag-segment button[role="radio"][aria-checked="true"]'),
    ),
  );
  const stapKlaarRegel = kernRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .v2-stappen li.is-klaar span'),
  );
  const gevaarPrimairRegel = kernRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.v2b .v2-knop.is-primair.is-gevaar'),
    ),
  );
  const kernPrimMap = mapDecls(kernPrimairRegel);
  const inspPrimMap = mapDecls(inspPrimairRegel);
  check(
    'первинні кнопки та активні радіокнопки використовують var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без тіней, крок .v2-stappen li.is-klaar span має var(--mq-accent) / var(--mq-accent-op), а сирий білий або var(--mq-wit) у класичних блоках відсутній',
    kernPrimMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      kernPrimMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      kernPrimMap.get('border-color') === 'var(--mq-knop-primair-bg)' &&
      kernPrimMap.get('box-shadow') === 'none' &&
      inspPrimMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      inspPrimMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      inspPrimMap.get('border-color') === 'var(--mq-knop-primair-bg)' &&
      inspPrimMap.get('box-shadow') === 'none' &&
      mapDecls(stapKlaarRegel).get('background') === 'var(--mq-accent)' &&
      mapDecls(stapKlaarRegel).get('color') === 'var(--mq-accent-op)' &&
      mapDecls(gevaarPrimairRegel).get('background') === 'var(--fout-vlak)' &&
      mapDecls(gevaarPrimairRegel).get('color') === 'var(--text-on-vlak)' &&
      !kernKlassiekSectie.includes('var(--mq-wit)') &&
      !inspKlassiekSectie.includes('var(--mq-wit)') &&
      !/#[0-9a-f]{3,8}\b/i.test(kernKlassiekSectie) &&
      !/#[0-9a-f]{3,8}\b/i.test(inspKlassiekSectie),
  );

  // 11. Типографіка заголовків на var(--mq-font-ui), табличні цифри tabular-nums та вимкнення стрибків translateY при наведенні.
  const kernFontRegel = kernRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.ag-blok-titel') &&
        s.includes('.v2b-kaart-titel h3') &&
        s.includes('.v2-wizard-kop h2'),
    ),
  );
  const kernTabNumsRegel = kernRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.ag-pagina .ag-stat strong') &&
        s.includes('.ag-teller') &&
        s.includes('.v2b-teller'),
    ),
  );
  const inspFontRegel = inspRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('[data-mcp-inspector-studio="1"] .ag-kaart-kop h4') &&
        s.includes('[data-orch] .orch-kv>b'),
    ),
  );
  const inspTabNumsRegel = inspRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('[data-badge="rpc-duur"]') &&
        s.includes('[data-orch] .orch-kv code'),
    ),
  );
  const statHoverPc = wint(
    kernRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina .ag-stat:hover',
    'transform',
    pcProfiel,
  )?.waarde;
  const v2bHoverPc = wint(
    kernRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .v2b-kaart:hover',
    'transform',
    pcProfiel,
  )?.waarde;
  check(
    'заголовки обох таблиць мають шрифт var(--mq-font-ui), лічильники та часи — font-variant-numeric: tabular-nums, а наведення на картки не спричиняє стрибків translateY',
    mapDecls(kernFontRegel).get('font-family') === 'var(--mq-font-ui)' &&
      mapDecls(inspFontRegel).get('font-family') === 'var(--mq-font-ui)' &&
      mapDecls(kernTabNumsRegel).get('font-variant-numeric') === 'tabular-nums' &&
      mapDecls(inspTabNumsRegel).get('font-variant-numeric') === 'tabular-nums' &&
      statHoverPc === 'none' &&
      v2bHoverPc === 'none' &&
      !kernKlassiekSectie.includes('translateY') &&
      !inspKlassiekSectie.includes('translateY'),
  );

  // 12. Суворе правило підвищеної специфічності :not(#_mqk) проти flat-content винятково без padding і без gap в обох таблицях.
  const alleMqkRegels = [
    ...kernRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)'))),
    ...inspRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)'))),
  ];
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = alleMqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'усі правила з :not(#_mqk) в обох таблицях стилів містять винятково border, border-inline, border-radius: 16px та box-shadow (нуль padding і нуль gap)',
    alleMqkRegels.length === 3 &&
      alleMqkRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')),
      ) &&
      alleMqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px')) &&
      alleMqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-inline')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 13. Каскадна дисципліна, відсутність !important / prefers-color-scheme / position: fixed, kopReserves та мобільні відступи на 390×844.
  const kernBuitenMedia = inhoudBuitenMediaBlokken(kernCss, idxKernEersteMedia);
  const inspBuitenMedia = inhoudBuitenMediaBlokken(inspectieCss, idxInspEersteMedia);
  const kernReserves = kopReserves(kernPad, kernCss);
  const inspReserves = kopReserves(inspectiePad, inspectieCss);
  const vensterKopSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .v2b-venster > header';
  const vensterKopPc = wint(kernRegels, vensterKopSel, 'padding', pcProfiel)?.waarde;
  const vensterKopTel = wint(kernRegels, vensterKopSel, 'padding', telProfiel)?.waarde;
  const paginaKopTel = wint(
    kernRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .ag-pagina-kop',
    'padding',
    telProfiel,
  )?.waarde;
  const blokTel = wint(
    kernRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .ag-blok',
    'padding',
    telProfiel,
  )?.waarde;
  const studioTel = wint(
    inspRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] [data-mcp-inspector-studio="1"]',
    'padding',
    telProfiel,
  )?.waarde;
  const consoleTel = wint(
    inspRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] [data-mcp-inspector-studio="1"] [data-inspector-console="1"]',
    'padding',
    telProfiel,
  )?.waarde;
  check(
    'обидві таблиці не містять !important, prefers-color-scheme чи position: fixed, настільні класичні правила стоять перед першим @media, kopReserves порожній, праві відступи шапок вікон <= 20px, а на телефоні 390×844 перемагають мобільні відступи',
    !/!\s*important/i.test(kernCss) &&
      !/!\s*important/i.test(inspectieCss) &&
      !/prefers-color-scheme/i.test(kernCss) &&
      !/prefers-color-scheme/i.test(inspectieCss) &&
      !/position\s*:\s*fixed/i.test(kernCss) &&
      !/position\s*:\s*fixed/i.test(inspectieCss) &&
      !MINI_PALET_BESTAND.test(kernZonderCommentaar) &&
      !MINI_PALET_BESTAND.test(inspectieZonderCommentaar) &&
      idxKernKlassiek > 0 &&
      idxKernEersteMedia > idxKernKlassiek &&
      idxKernMaxMedia >= idxKernEersteMedia &&
      idxInspKlassiek > 0 &&
      idxInspEersteMedia > idxInspKlassiek &&
      idxInspMaxMedia >= idxInspEersteMedia &&
      kernBuitenMedia === '' &&
      inspBuitenMedia === '' &&
      kernReserves.length === 0 &&
      inspReserves.length === 0 &&
      rechtsPaddingPx(vensterKopPc) <= 20 &&
      rechtsPaddingPx(vensterKopTel) <= 20 &&
      paginaKopTel === '9px 12px' &&
      blokTel === '14px' &&
      studioTel === '14px 16px' &&
      consoleTel === '14px',
  );

  // 14. Абсолютна мовна чистота всіх трьох файлів контуру KLASSIEK-008B.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    [kernPad, kernCss],
    [inspectiePad, inspectieCss],
    [controlePad, zelfControle],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  const controleBestandsnaam = controlePad.split('/').pop() ?? '';
  check(
    'жоден із трьох файлів контуру KLASSIEK-008B не містить заборонених літер російської абетки, а назва файла модульного випробування відповідає нідерландському іменуванню',
    taalOvertredingen.length === 0 &&
      !/\b(agents|core|inspection|connectors|coordinator|view|studio)\b/i.test(controleBestandsnaam),
    taalOvertredingen.join(', '),
  );

  return einde();
}
