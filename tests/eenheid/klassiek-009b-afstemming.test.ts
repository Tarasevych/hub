// KLASSIEK-009B (Хвиля 8Б тем оформлення «Біла класика» та «Чорна класика» для піддомену api.tarasevych.com/afstemming):
// перевірка центру звірки продукту Afstemming vNext (усі 8 розділів), позаоболонкових шарів .afv-laag у тілі документа
// та класичної Матриці фактичної реалізації .implementation-truth:
// 1-рядкові підключення у AfstemmingWissel.tsx та AfstemmingPagina.tsx, відсікання студійних світлих і вітринних селекторів
// у afstemming-maquette.css, чистота матових поверхонь і мініпалітр --afz-* без сирих кольорів і color-mix,
// позаоболонкові змінні klassiek-wit / klassiek-zwart, ущільнена ділова смуга .afv-kop зі збереженням пошуку й кнопки додавання,
// контраст первинних кнопок без #fff і без var(--mq-wit), суворе правило :not(#_mqk) без padding і gap та дисципліна каскаду.
// Eenheidstest voor de klassieke opmaak van productafstemming op api.tarasevych.com/afstemming (KLASSIEK-009B).

import { readFileSync } from 'node:fs';
import { kopReserves } from '../../scripts/plaatsing-controle.mjs';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const MINI_PALET_BESTAND =
  /--(?:aj|ut|hub|ag|v2|gm|adg|il|eo|aib|vm|rb|afz|ov)-(?:ok|warn|err|bad|fout|info|laag|midden|kritiek|g|b|op|bijna|off|uit|unk)(?:-bg|-zacht)?\s*:\s*(?:#|rgba?\(|color-mix)/;

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
  const { check, einde } = checker('klassiek-009b-afstemming');

  const wisselPad = 'src/AfstemmingWissel.tsx';
  const paginaPad = 'src/afstemming-vnext/AfstemmingPagina.tsx';
  const studioPad = 'src/afstemming-vnext/afstemming-maquette.css';
  const klassiekPad = 'src/afstemming-vnext/afstemming-klassiek.css';
  const controlePad = 'tests/eenheid/klassiek-009b-afstemming.test.ts';

  const wisselTsx = readFileSync(wisselPad, 'utf8');
  const paginaTsx = readFileSync(paginaPad, 'utf8');
  const studioCss = readFileSync(studioPad, 'utf8');
  const klassiekCss = readFileSync(klassiekPad, 'utf8');
  const zelfControle = readFileSync(controlePad, 'utf8');

  const studioZonderCommentaar = studioCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const klassiekZonderCommentaar = klassiekCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const idxEersteMedia = klassiekCss.search(/@media\s*\(/);
  const idxMaxMedia = klassiekCss.search(/@media\s*\(\s*max-width/);
  const klassiekBasisZonderMedia =
    idxEersteMedia > 0 ? klassiekCss.slice(0, idxEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '') : '';

  const studioRegels = leesCss(studioCss);
  const klassiekRegels = leesCss(klassiekCss);
  const mapDecls = (r: (typeof klassiekRegels)[number] | undefined) =>
    new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };

  // 1. Точне підключення таблиці afstemming-klassiek.css одразу після afstemming-maquette.css в обох точках входу.
  check(
    'AfstemmingWissel.tsx та AfstemmingPagina.tsx підключають afstemming-klassiek.css одразу після afstemming-maquette.css',
    wisselTsx.includes(
      "import './afstemming-vnext/afstemming-maquette.css';\nimport './afstemming-vnext/afstemming-klassiek.css';",
    ) &&
      paginaTsx.includes("import './afstemming-maquette.css';\nimport './afstemming-klassiek.css';"),
  );

  // 2. Відсікання студійних світлих селекторів і тіней вітрини в afstemming-maquette.css через :not([data-maquette-stijl="klassiek"]).
  const studioLichtRegels = studioRegels.filter((r) =>
    r.selectors.some(
      (s) => s.includes('[data-theme="light"]') || s.includes('.theme-light') || s.includes('.theme-plum-light'),
    ),
  );
  const studioHeldCompact = studioRegels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette:not([data-maquette-stijl="klassiek"]) .afv-mq-schil>.mq-held.is-compact',
    ),
  );
  const studioHeldVol = studioRegels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette:not([data-maquette-stijl="klassiek"]) .afv-mq-schil>.mq-held:not(.is-compact)',
    ),
  );
  const onbeschermdeHeldRegels = studioRegels.filter((r) =>
    r.selectors.some(
      (s) => s.includes('.afv-mq-schil>.mq-held') && !s.includes(':not([data-maquette-stijl="klassiek"])'),
    ),
  );
  check(
    'у afstemming-maquette.css усі 5 селекторів світлих рубінових правил і обидва селектори вітрини .mq-held обмежені через :not([data-maquette-stijl="klassiek"])',
    studioLichtRegels.length === 2 &&
      studioLichtRegels[0].selectors.length === 2 &&
      studioLichtRegels[1].selectors.length === 3 &&
      studioLichtRegels.every((r) =>
        r.selectors.every((s) => s.includes(':not([data-maquette-stijl="klassiek"])')),
      ) &&
      Boolean(studioHeldCompact) &&
      Boolean(studioHeldVol) &&
      onbeschermdeHeldRegels.length === 0,
  );

  // 3. Чистота матових змінних поверхонь, радіусів 11px/16px та мініпалітри --afz-* без сирих кольорів і color-mix.
  const hoofdVarRegel = klassiekRegels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette[data-maquette-stijl="klassiek"] :is(.afv-mq-schil, .afv, .afv-laag, .implementation-truth)',
    ),
  );
  const hoofdVarMap = mapDecls(hoofdVarRegel);
  const heeftRauweOfMixInVars = [...(hoofdVarRegel?.decls ?? [])].some((d) =>
    /#|rgba?\(|color-mix/i.test(d.waarde),
  );
  check(
    'головний класичний селектор задає матові змінні --afv-mq-*, радіуси 11px / 16px, --accentText: var(--mq-accent-op) та чисті змінні --afz-* без #hex, rgb() і color-mix()',
    !heeftRauweOfMixInVars &&
      !MINI_PALET_BESTAND.test(klassiekZonderCommentaar) &&
      !MINI_PALET_BESTAND.test(studioZonderCommentaar) &&
      hoofdVarMap.get('--afv-mq-glas') === 'var(--mq-oppervlak)' &&
      hoofdVarMap.get('--afv-mq-glas-diep') === 'var(--mq-oppervlak)' &&
      hoofdVarMap.get('--afv-mq-glas-zacht') === 'var(--mq-oppervlak-2)' &&
      hoofdVarMap.get('--afv-mq-veld-bg') === 'var(--mq-oppervlak-2)' &&
      hoofdVarMap.get('--afv-mq-rand') === 'var(--mq-rand)' &&
      hoofdVarMap.get('--afv-mq-rand-sterk') === 'var(--mq-rand-sterk)' &&
      hoofdVarMap.get('--afv-mq-rand-accent') === 'var(--mq-accent)' &&
      hoofdVarMap.get('--afv-mq-halo') === 'transparent' &&
      hoofdVarMap.get('--afv-mq-halo-zacht') === 'transparent' &&
      hoofdVarMap.get('--straal-s') === '11px' &&
      hoofdVarMap.get('--straal-m') === '11px' &&
      hoofdVarMap.get('--straal-l') === '16px' &&
      hoofdVarMap.get('--straal-xl') === '16px' &&
      hoofdVarMap.get('--accent') === 'var(--mq-accent)' &&
      hoofdVarMap.get('--accenttext') === 'var(--mq-accent-op)' &&
      klassiekBasisZonderMedia.includes('--accentText: var(--mq-accent-op);') &&
      hoofdVarMap.get('--text-on-accent') === 'var(--mq-accent-op)' &&
      hoofdVarMap.get('--afz-ok') === 'var(--ok)' &&
      hoofdVarMap.get('--afz-warn') === 'var(--warn)' &&
      hoofdVarMap.get('--afz-fout') === 'var(--fout)' &&
      hoofdVarMap.get('--afz-info') === 'var(--info)',
  );

  // 4. Позаоболонкові шари .afv-laag у body для Білої та Чорної класики, матова завіса без розмиття, радіус 16px і правий відступ шапки <= 20px.
  const laagWitRegel = klassiekRegels.find((r) => r.selectors.includes('html.palet-klassiek-wit .afv-laag'));
  const laagZwartRegel = klassiekRegels.find((r) => r.selectors.includes('html.palet-klassiek-zwart .afv-laag'));
  const laagSluierRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv-laag'),
  );
  const laagVakRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv-laag .afv-laag-vak'),
  );
  const laagKopSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .afv-laag .afv-laag-kop';
  const laagKopPc = wint(klassiekRegels, laagKopSel, 'padding', pcProfiel)?.waarde;
  const laagKopTel = wint(klassiekRegels, laagKopSel, 'padding', telProfiel)?.waarde;
  check(
    'позаоболонкові шари html.palet-klassiek-wit/zwart .afv-laag задають color-scheme: light/dark і монохромні змінні, завіса не має backdrop-filter, .afv-laag-vak має радіус 16px, а правий відступ .afv-laag-kop <= 20px',
    mapDecls(laagWitRegel).get('color-scheme') === 'light' &&
      mapDecls(laagWitRegel).get('--mq-knop-primair-bg') === 'var(--mq-kl-wit-accent)' &&
      mapDecls(laagWitRegel).get('--mq-knop-primair-tekst') === 'var(--mq-kl-wit-accent-op)' &&
      mapDecls(laagZwartRegel).get('color-scheme') === 'dark' &&
      mapDecls(laagZwartRegel).get('--mq-knop-primair-bg') === 'var(--mq-kl-zwart-accent)' &&
      mapDecls(laagZwartRegel).get('--mq-knop-primair-tekst') === 'var(--mq-kl-zwart-accent-op)' &&
      mapDecls(laagSluierRegel).get('background') === 'var(--mq-sluier-glas)' &&
      mapDecls(laagSluierRegel).get('-webkit-backdrop-filter') === 'none' &&
      mapDecls(laagSluierRegel).get('backdrop-filter') === 'none' &&
      mapDecls(laagVakRegel).get('border-radius') === '16px' &&
      mapDecls(laagVakRegel).get('background') === 'var(--mq-oppervlak)' &&
      mapDecls(laagVakRegel).get('background-image') === 'none' &&
      rechtsPaddingPx(laagKopPc) <= 20 &&
      rechtsPaddingPx(laagKopTel) <= 20,
  );

  // 5. Ущільнена однорядкова ділова смуга .afv-kop зі збереженням поля пошуку .afv-zoek та панелі дій .afv-kop-acties.
  const kopRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-kop'),
  );
  const kopTitelRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-kop-titel'),
  );
  const kopActiesRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-kop-acties'),
  );
  const zoekInputRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-zoek input'),
  );
  const kopMap = mapDecls(kopRegel);
  check(
    'внутрішня шапка .afv-kop ущільнена в однорядкову матову смугу (min-height: 52px, padding: 10px 16px, border-radius: 16px, box-shadow: none) із видимими .afv-kop-acties та пошуком .afv-zoek (11px)',
    kopMap.get('display') === 'flex' &&
      kopMap.get('min-height') === '52px' &&
      kopMap.get('padding') === '10px 16px' &&
      kopMap.get('border-radius') === '16px' &&
      kopMap.get('background') === 'var(--mq-oppervlak)' &&
      kopMap.get('background-image') === 'none' &&
      kopMap.get('box-shadow') === 'none' &&
      mapDecls(kopTitelRegel).get('flex-direction') === 'row' &&
      mapDecls(kopActiesRegel).get('display') === 'flex' &&
      mapDecls(kopActiesRegel).get('margin-left') === 'auto' &&
      mapDecls(zoekInputRegel).get('border-radius') === '11px',
  );

  // 6. Контраст і геометрія первинних кнопок на var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без #fff і без var(--mq-wit).
  const primairKnopRegel = klassiekRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.afv .afv-knop.is-hoofd') &&
        s.includes('.afv-laag .afv-knop.is-hoofd') &&
        s.includes('.afv .afv-onderbalk .afv-plus') &&
        s.includes('.implementation-truth .implementation-filters button.active'),
    ),
  );
  const primMap = mapDecls(primairKnopRegel);
  check(
    'усі первинні кнопки використовують var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst), border-radius: 11px, box-shadow: none та нуль #hex, rgb(), color-mix() чи var(--mq-wit)',
    primMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      primMap.get('background-image') === 'none' &&
      primMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      primMap.get('border-color') === 'var(--mq-knop-primair-bg)' &&
      primMap.get('border-radius') === '11px' &&
      primMap.get('box-shadow') === 'none' &&
      !klassiekZonderCommentaar.includes('var(--mq-wit)') &&
      !/#[0-9a-f]{3,8}\b/i.test(klassiekZonderCommentaar) &&
      !/rgba?\(/i.test(klassiekZonderCommentaar) &&
      !/color-mix\(/i.test(klassiekZonderCommentaar),
  );

  // 7. Бічна навігація .afv-zijnav, блоки .afv-blok, конвеєр .afv-pijplijn, плитки .afv-tegel і картки .afv-kaartje.
  const zijnavRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-zijnav'),
  );
  const zijnavActiefRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-zijnav button.is-actief'),
  );
  const zijnavActiefSvgRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-zijnav button.is-actief svg'),
  );
  const blokRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] :is(.afv, .afv-laag) .afv-blok'),
  );
  const pijplijnRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-pijplijn'),
  );
  const tegelRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-tegel'),
  );
  const kaartjeRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-kaartje'),
  );
  check(
    'бічна навігація .afv-zijnav є суцільною матовою (16px, без backdrop-filter) із монохромним активним пунктом, а .afv-blok, .afv-pijplijn, .afv-tegel і .afv-kaartje мають радіус 16px, background-image: none та box-shadow: none',
    mapDecls(zijnavRegel).get('border-radius') === '16px' &&
      mapDecls(zijnavRegel).get('backdrop-filter') === 'none' &&
      mapDecls(zijnavActiefRegel).get('background') === 'var(--mq-accent)' &&
      mapDecls(zijnavActiefRegel).get('color') === 'var(--mq-accent-op)' &&
      mapDecls(zijnavActiefSvgRegel).get('color') === 'var(--mq-accent-op)' &&
      [blokRegel, pijplijnRegel, tegelRegel, kaartjeRegel].every(
        (r) =>
          mapDecls(r).get('border-radius') === '16px' &&
          mapDecls(r).get('background') === 'var(--mq-oppervlak)' &&
          mapDecls(r).get('background-image') === 'none' &&
          mapDecls(r).get('box-shadow') === 'none',
      ),
  );

  // 8. Оформлення решти розділів Afstemming vNext: мапа зв'язків, перевірки, випуски, можливості, часова шкала історії та джерела.
  const graafSvgRegel = klassiekRegels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette[data-maquette-stijl="klassiek"] .afv :is([data-afv-graaf] svg, svg[data-afv-graaf])',
    ),
  );
  const graafKnoopRegel = klassiekRegels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette[data-maquette-stijl="klassiek"] .afv [data-afv-graaf] g[data-afv-knoop] circle',
    ),
  );
  const zoomRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv [data-afv-zoom]'),
  );
  const graafMiniRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv aside[data-afv-graaf-mini]'),
  );
  const releaseRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv details[data-afv-release]'),
  );
  const mogelijkheidRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv article[data-afv-mogelijkheid]'),
  );
  const tijdlijnLiRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] :is(.afv, .afv-laag) .afv-tijdlijn>li'),
  );
  const bronRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv [data-afv-bron]'),
  );
  check(
    'полотно мапи зв\'язків, вузли графа, панель масштабу, картка випуску, картка можливості, часова шкала історії та картки джерел очищені від градієнтів, розмиття й drop-shadow та мають геометрію 16px / 11px',
    mapDecls(graafSvgRegel).get('background-image') === 'none' &&
      mapDecls(graafKnoopRegel).get('filter') === 'none' &&
      mapDecls(zoomRegel).get('border-radius') === '11px' &&
      mapDecls(zoomRegel).get('backdrop-filter') === 'none' &&
      [graafMiniRegel, releaseRegel, mogelijkheidRegel].every(
        (r) => mapDecls(r).get('border-radius') === '16px' && mapDecls(r).get('background-image') === 'none',
      ) &&
      mapDecls(tijdlijnLiRegel).get('border-radius') === '11px' &&
      mapDecls(bronRegel).get('border-radius') === '11px',
  );

  // 9. Мобільна нижня панель .afv-onderbalk оформлена лише кольором і рамкою без зміни фіксованого позиціонування.
  const onderbalkRegels = klassiekRegels.filter((r) =>
    r.selectors.some((s) => s.includes('.afv-onderbalk')),
  );
  const onderbalkHoofd = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-onderbalk'),
  );
  const verbodenPosEig = new Set(['position', 'top', 'right', 'bottom', 'left', 'inset', 'z-index']);
  const heeftPosWijzigingOpOnderbalk = onderbalkRegels.some((r) =>
    r.decls.some((d) => verbodenPosEig.has(d.eig)),
  );
  check(
    'мобільна нижня панель .afv-onderbalk оформлена матовою поверхнею var(--mq-oppervlak) без backdrop-filter і без жодної зміни position / inset / z-index',
    Boolean(onderbalkHoofd) &&
      mapDecls(onderbalkHoofd).get('background') === 'var(--mq-oppervlak)' &&
      mapDecls(onderbalkHoofd).get('backdrop-filter') === 'none' &&
      !heeftPosWijzigingOpOnderbalk,
  );

  // 10. Класична Матриця фактичної реалізації .implementation-truth: ущільнений .implementation-hero та 6 станів тверджень.
  const implHeroRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .implementation-truth .implementation-hero'),
  );
  const implFiltersRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .implementation-truth .implementation-filters'),
  );
  const implSearchRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .implementation-truth .implementation-search'),
  );
  const implClaimRegel = klassiekRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .implementation-truth .implementation-claim'),
  );
  const alleStatussenAanwezig = [
    '.confirmed_in_canonical',
    '.partial',
    '.regressed',
    '.missing',
    '.present_only_in_archive',
    '.deprecated',
  ].every((st) => klassiekBasisZonderMedia.includes(st));
  check(
    'класична матриця .implementation-truth має ущільнений .implementation-hero (14px 18px, 16px, без градієнтів), фільтри без розмиття, пошук 11px, картки тверджень 16px та всі 6 станів без color-mix',
    mapDecls(implHeroRegel).get('padding') === '14px 18px' &&
      mapDecls(implHeroRegel).get('border-radius') === '16px' &&
      mapDecls(implHeroRegel).get('background-image') === 'none' &&
      mapDecls(implHeroRegel).get('box-shadow') === 'none' &&
      mapDecls(implFiltersRegel).get('border-radius') === '16px' &&
      mapDecls(implFiltersRegel).get('backdrop-filter') === 'none' &&
      mapDecls(implSearchRegel).get('border-radius') === '11px' &&
      mapDecls(implClaimRegel).get('border-radius') === '16px' &&
      mapDecls(implClaimRegel).get('background-image') === 'none' &&
      alleStatussenAanwezig,
  );

  // 11. Суворе правило підвищеної специфічності :not(#_mqk) проти flat-content винятково з border, border-inline, border-radius: 16px та box-shadow.
  const alleMqkRegels = klassiekRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = alleMqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'усі правила з :not(#_mqk) починаються з html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) і містять винятково border, border-inline, border-radius: 16px та box-shadow (нуль padding і нуль gap)',
    alleMqkRegels.length >= 2 &&
      alleMqkRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')),
      ) &&
      alleMqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px')) &&
      alleMqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-inline')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 12. Типографіка гротеском на заголовках, табличні цифри tabular-nums та відсутність стрибків translateY при наведенні.
  const fontGroepRegel = klassiekRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.afv h2') &&
        s.includes('.afv-laag h2') &&
        s.includes('.implementation-truth h1'),
    ),
  );
  const tabNumsRegel = klassiekRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.afv .afv-tegel strong') &&
        s.includes('.afv .afv-chip') &&
        s.includes('.implementation-truth .implementation-filters button'),
    ),
  );
  const kaartjeHoverPc = wint(
    klassiekRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-kaartje:hover',
    'transform',
    pcProfiel,
  )?.waarde;
  const hoofdKnopHoverPc = wint(
    klassiekRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] :is(.afv, .afv-laag) .afv-knop.is-hoofd:not(:disabled):hover',
    'transform',
    pcProfiel,
  )?.waarde;
  const claimHoverPc = wint(
    klassiekRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .implementation-truth .implementation-claim:hover',
    'transform',
    pcProfiel,
  )?.waarde;
  check(
    'заголовки використовують гротеск var(--mq-font-ui, Inter, system-ui, sans-serif), показники й осі звірки мають font-variant-numeric: tabular-nums, а наведення не спричиняє стрибків translateY',
    mapDecls(fontGroepRegel).get('font-family') === 'var(--mq-font-ui, Inter, system-ui, sans-serif)' &&
      mapDecls(tabNumsRegel).get('font-variant-numeric') === 'tabular-nums' &&
      kaartjeHoverPc === 'none' &&
      hoofdKnopHoverPc === 'none' &&
      claimHoverPc === 'none' &&
      !klassiekZonderCommentaar.includes('translateY'),
  );

  // 13. Дисципліна каскаду @media суворо наприкінці, відсутність !important / prefers-color-scheme / position: fixed / градієнтів, kopReserves та мобільні відступи на 390×844.
  const buitenMedia = inhoudBuitenMediaBlokken(klassiekCss, idxEersteMedia);
  const studioReserves = kopReserves(studioPad, studioCss);
  const klassiekReserves = kopReserves(klassiekPad, klassiekCss);
  const kopTel = wint(
    klassiekRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .afv .afv-kop',
    'padding',
    telProfiel,
  )?.waarde;
  const blokTel = wint(
    klassiekRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] :is(.afv, .afv-laag) .afv-blok',
    'padding',
    telProfiel,
  )?.waarde;
  const implHeroTel = wint(
    klassiekRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .implementation-truth .implementation-hero',
    'padding',
    telProfiel,
  )?.waarde;
  check(
    'afstemming-klassiek.css не містить !important, prefers-color-scheme, position: fixed і градієнтів, усі @media стоять суворо наприкінці, kopReserves порожній, а на телефоні 390×844 перемагають мобільні відступи',
    !/!\s*important/i.test(klassiekCss) &&
      !/prefers-color-scheme/i.test(klassiekCss) &&
      !/position\s*:\s*fixed/i.test(klassiekZonderCommentaar) &&
      !/(?:linear|radial|conic)-gradient\(/i.test(klassiekZonderCommentaar) &&
      idxEersteMedia > 0 &&
      idxMaxMedia >= idxEersteMedia &&
      buitenMedia === '' &&
      studioReserves.length === 0 &&
      klassiekReserves.length === 0 &&
      kopTel === '10px 14px' &&
      blokTel === '14px' &&
      implHeroTel === '14px' &&
      laagKopTel === '12px 16px',
  );

  // 14. Абсолютна мовна чистота всіх 5 файлів контуру KLASSIEK-009B.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    [wisselPad, wisselTsx],
    [paginaPad, paginaTsx],
    [studioPad, studioCss],
    [klassiekPad, klassiekCss],
    [controlePad, zelfControle],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  const controleBestandsnaam = controlePad.split('/').pop() ?? '';
  check(
    'жоден із п\'яти файлів контуру KLASSIEK-009B не містить заборонених літер російської абетки, а назва файла випробування відповідає нідерландському іменуванню',
    taalOvertredingen.length === 0 && !/\b(reconciliation|alignment|view|studio|classic)\b/i.test(controleBestandsnaam),
    taalOvertredingen.join(', '),
  );

  return einde();
}
