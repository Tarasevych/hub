// KLASSIEK-006B (Хвиля 5 тем оформлення «Біла класика» та «Чорна класика» для простору ai.tarasevych.com):
// перевірка стилів відкритої екосистеми агентів ШІ (ai-ecosysteem-maquette.css) та підтверджень і дозволів ШІ (ai-bevestigingen-maquette.css),
// відсікання студійних світлих блоків, світлочутливої термінальної консолі, однорядкової шапки .aie-kop,
// матових поверхонь 16px / 11px, табличних цифр, семантики ризику, захисту специфічності :not(#_mqk) без padding і gap та каскадної дисципліни.
// Eenheidstest voor de klassieke opmaak van AI-ecosysteem en AI-bevestigingen (KLASSIEK-006B).

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

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-006b-ai-kaarten');

  const controlePad = 'tests/eenheid/klassiek-006b-ai-kaarten.test.ts';
  const aieCss = readFileSync('src/ai-ecosysteem/ai-ecosysteem-maquette.css', 'utf8');
  const abCss = readFileSync('src/ai-bevestiging/ai-bevestigingen-maquette.css', 'utf8');
  const zelfControle = readFileSync(controlePad, 'utf8');

  const aieZonderCommentaar = aieCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const abZonderCommentaar = abCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const idxAieKlassiek = aieCss.indexOf('10. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-006B)');
  const idxAieEersteMedia = aieCss.search(/@media\s*\(/);
  const idxAieMaxMedia = aieCss.search(/@media\s*\(\s*max-width/);
  const klassiekAie =
    idxAieKlassiek > 0 && idxAieEersteMedia > idxAieKlassiek
      ? aieCss.slice(idxAieKlassiek, idxAieEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const idxAbKlassiek = abCss.indexOf('5. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-006B)');
  const idxAbEersteMedia = abCss.search(/@media\s*\(/);
  const idxAbMaxMedia = abCss.search(/@media\s*\(\s*max-width/);
  const klassiekAb =
    idxAbKlassiek > 0 && idxAbEersteMedia > idxAbKlassiek
      ? abCss.slice(idxAbKlassiek, idxAbEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const aieRegels = leesCss(aieCss);
  const abRegels = leesCss(abCss);
  const mapDecls = (r: (typeof aieRegels)[number] | undefined) =>
    new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde]));

  // 1. Відсікання студійних світлих блоків .theme-light / .theme-plum-light через :not([data-maquette-stijl="klassiek"]).
  const aieStudioLicht = aieRegels.filter((r) =>
    r.selectors.some((s) => s.includes('.theme-light') || s.includes('.theme-plum-light')),
  );
  const abStudioLicht = abRegels.filter((r) =>
    r.selectors.some((s) => s.includes('.theme-light') || s.includes('.theme-plum-light')),
  );
  check(
    'усі студійні блоки .theme-light / .theme-plum-light в ai-ecosysteem-maquette.css та ai-bevestigingen-maquette.css обмежені через :not([data-maquette-stijl="klassiek"]) на кожній гілці селекторів',
    aieStudioLicht.length >= 1 &&
      abStudioLicht.length >= 1 &&
      [...aieStudioLicht, ...abStudioLicht].every(
        (r) =>
          r.selectors.length >= 2 &&
          r.selectors.every((s) => s.includes('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ),
  );

  // 2. Перевизначення монохромних змінних без прозорості та світіння в обох таблицях стилів.
  const aieVarRegel = aieRegels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette[data-maquette-stijl="klassiek"] :is(.aie-container, .aie-chat-koppeling, .aiw-nog-niet.aie-mq-laden)',
    ),
  );
  const abVarRegel = abRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.ab-paneel') &&
        s.includes('.ai-grants') &&
        s.includes('.ai-stop') &&
        s.includes('.hub-goedkeuring'),
    ),
  );
  const aieVarMap = mapDecls(aieVarRegel);
  const abVarMap = mapDecls(abVarRegel);
  check(
    'класичні змінні перевизначають скляні шари, рамки, поля введення й підписи на наголосі в ai-ecosysteem-maquette.css та ai-bevestigingen-maquette.css',
    aieVarMap.get('--mq-accent-ai') === 'var(--mq-accent)' &&
      aieVarMap.get('--mq-aie-rand') === 'var(--mq-rand)' &&
      aieVarMap.get('--mq-aie-rand-sterk') === 'var(--mq-rand-sterk)' &&
      aieVarMap.get('--mq-aie-rand-accent') === 'var(--mq-rand-sterk)' &&
      aieVarMap.get('--mq-aie-glas') === 'var(--mq-oppervlak)' &&
      aieVarMap.get('--mq-aie-glas-hoog') === 'var(--mq-oppervlak-2)' &&
      aieVarMap.get('--mq-aie-invoer') === 'var(--mq-invoer)' &&
      aieVarMap.get('--mq-aie-glans') === 'transparent' &&
      aieVarMap.get('--mq-aie-gloed') === 'transparent' &&
      aieVarMap.get('--mq-aie-gloed-zacht') === 'transparent' &&
      aieVarMap.get('--text-on-accent') === 'var(--mq-accent-op)' &&
      abVarMap.get('--mq-ab-glas') === 'var(--mq-oppervlak)' &&
      abVarMap.get('--mq-ab-glas-kaart') === 'var(--mq-oppervlak-2)' &&
      abVarMap.get('--mq-ab-glans') === 'transparent' &&
      abVarMap.get('--mq-ab-invoer') === 'var(--mq-invoer)' &&
      abVarMap.get('--mq-ab-code-vlak') === 'var(--mq-oppervlak-2)' &&
      abVarMap.get('--accenttext') === 'var(--mq-accent-op)' &&
      klassiekAb.includes('--accentText: var(--mq-accent-op);') &&
      abVarMap.get('--text-on-accent') === 'var(--mq-accent-op)',
  );

  // 3. Світлочутливий термінал і консоль команд агентів (--mq-aie-console-*) для palet-klassiek-wit та palet-klassiek-zwart.
  const consoleWitRegel = aieRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.includes('palet-klassiek-wit[data-maquette-stijl="klassiek"]') &&
        s.includes('.aie-container') &&
        s.includes('.aie-chat-koppeling'),
    ),
  );
  const consoleZwartRegel = aieRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.includes('palet-klassiek-zwart[data-maquette-stijl="klassiek"]') &&
        s.includes('.aie-container') &&
        s.includes('.aie-chat-koppeling'),
    ),
  );
  const consoleWitMap = mapDecls(consoleWitRegel);
  const consoleZwartMap = mapDecls(consoleZwartRegel);
  check(
    'термінальна консоль команд агентів має світлочутливі поверхні #f1f3f6 / #e7eaef / #111418 у palet-klassiek-wit та #0f1217 / #161a22 / #f3f4f6 у palet-klassiek-zwart',
    consoleWitMap.get('--mq-aie-console-bg') === '#f1f3f6' &&
      consoleWitMap.get('--mq-aie-console-kop') === '#e7eaef' &&
      consoleWitMap.get('--mq-aie-console-rand') === 'var(--mq-rand-sterk)' &&
      consoleWitMap.get('--mq-aie-console-tekst') === '#111418' &&
      consoleZwartMap.get('--mq-aie-console-bg') === '#0f1217' &&
      consoleZwartMap.get('--mq-aie-console-kop') === '#161a22' &&
      consoleZwartMap.get('--mq-aie-console-rand') === 'var(--mq-rand-sterk)' &&
      consoleZwartMap.get('--mq-aie-console-tekst') === '#f3f4f6' &&
      klassiekAie.includes('.aie-mq-console-wikkel') &&
      klassiekAie.includes('.aie-mq-console-kop') &&
      klassiekAie.includes('.aie-codeblok'),
  );

  // 4. Однорядкова ділова внутрішня шапка .aie-kop.aie-mq-held-kop та компактна смуга .aie-chat-koppeling.
  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const aieKopPaddingPc = wint(
    aieRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .aie-container .aie-kop.aie-mq-held-kop',
    'padding',
    pcProfiel,
  );
  const aieBovenregelDisplay = wint(
    aieRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .aie-container .aie-kop .aie-mq-bovenregel',
    'display',
    pcProfiel,
  );
  const aieKopTekstPDisplay = wint(
    aieRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .aie-container .aie-kop .aie-mq-kop-tekst p',
    'display',
    pcProfiel,
  );
  const aieKopH1Grootte = wint(
    aieRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .aie-kop.aie-mq-held-kop h1',
    'font-size',
    pcProfiel,
  );
  const aieKopH1Gewicht = wint(
    aieRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .aie-kop.aie-mq-held-kop h1',
    'font-weight',
    pcProfiel,
  );
  const aieKopH1Marge = wint(
    aieRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .aie-kop.aie-mq-held-kop h1',
    'margin',
    pcProfiel,
  );
  const chatKoppelingPadding = wint(
    aieRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .aie-chat-koppeling',
    'padding',
    pcProfiel,
  );
  const chatKoppelingBg = wint(
    aieRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .aie-chat-koppeling',
    'background',
    pcProfiel,
  );
  const chatKoppelingBgImg = wint(
    aieRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .aie-chat-koppeling',
    'background-image',
    pcProfiel,
  );
  const chatKoppelingBlur = wint(
    aieRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .aie-chat-koppeling',
    'backdrop-filter',
    pcProfiel,
  );
  check(
    'внутрішня шапка .aie-kop.aie-mq-held-kop стиснута до однорядкової панелі (10px 16px, h1 1rem/650/margin 0) з прихованими .aie-mq-bovenregel і p, а смуга .aie-chat-koppeling має 10px 14px без розмиття й градієнтів',
    aieKopPaddingPc?.waarde === '10px 16px' &&
      aieBovenregelDisplay?.waarde === 'none' &&
      aieKopTekstPDisplay?.waarde === 'none' &&
      aieKopH1Grootte?.waarde === '1rem' &&
      aieKopH1Gewicht?.waarde === '650' &&
      aieKopH1Marge?.waarde === '0' &&
      chatKoppelingPadding?.waarde === '10px 14px' &&
      chatKoppelingBg?.waarde === 'var(--mq-oppervlak)' &&
      chatKoppelingBgImg?.waarde === 'none' &&
      chatKoppelingBlur?.waarde === 'none',
  );

  // 5. Матові поверхні карток, панелей і секцій із заокругленням 16px та повною відсутністю градієнтів і розмиття.
  check(
    'усі картки, секції, середовища, таблиці прав і блоки підтверджень мають матові поверхні з радіусом 16px, background-image: none, backdrop-filter: none та нуль градієнтів у класичних розділах',
    klassiekAie.includes('--mq-straal-kaart: 16px;') &&
      klassiekAie.includes('article.aie-kaart') &&
      klassiekAie.includes('section.aie-chat-koppeling') &&
      klassiekAie.includes('.aie-omgeving-vak') &&
      klassiekAie.includes('.aie-item') &&
      klassiekAie.includes('.aie-kop') &&
      klassiekAie.includes('border-radius: 16px;') &&
      klassiekAie.includes('background-image: none;') &&
      klassiekAie.includes('backdrop-filter: none;') &&
      klassiekAb.includes('--mq-straal-kaart: 16px;') &&
      klassiekAb.includes('section.ab-paneel') &&
      klassiekAb.includes('section.ab-google') &&
      klassiekAb.includes('.ai-grants .ai-blok') &&
      klassiekAb.includes('table.ai-tabel') &&
      klassiekAb.includes('.ai-stop .ag-bevestig') &&
      klassiekAb.includes('.hub-goedkeuring') &&
      klassiekAb.includes('border-radius: 16px;') &&
      klassiekAb.includes('background-image: none;') &&
      klassiekAb.includes('backdrop-filter: none;') &&
      !/gradient/i.test(klassiekAie) &&
      !/gradient/i.test(klassiekAb) &&
      !/translateY|scale\(/i.test(klassiekAie) &&
      !/translateY|scale\(/i.test(klassiekAb),
  );

  // 6. Плавні заокруглення 11px для всіх кнопок, полів введення, списків вибору, перемикачів наборів і плашок.
  check(
    'кнопки дій, поля введення, списки вибору, перемикачі наборів дозволів та плашки в обох таблицях стилів мають заокруглення 11px',
    klassiekAie.includes('--mq-straal-veld: 11px;') &&
      klassiekAie.includes('--mq-straal-knop: 11px;') &&
      klassiekAie.includes('.aie-veld') &&
      klassiekAie.includes('.aie-vink') &&
      klassiekAie.includes('.aie-badge') &&
      klassiekAie.includes('.aie-knop-tweede') &&
      klassiekAie.includes('.aie-knop-gevaar') &&
      klassiekAie.includes('.aie-knop-hoofd') &&
      klassiekAie.includes('.aie-knop-primair') &&
      klassiekAie.includes('border-radius: 11px;') &&
      klassiekAb.includes('--mq-straal-veld: 11px;') &&
      klassiekAb.includes('--mq-straal-knop: 11px;') &&
      klassiekAb.includes('.ab-paneel .ab-knop') &&
      klassiekAb.includes('.ai-grants .hub-btn') &&
      klassiekAb.includes('.ai-stop .hub-btn') &&
      klassiekAb.includes('.ai-grants .ai-presets button[role="radio"]') &&
      klassiekAb.includes('span.hub-pill[data-aanvrager]') &&
      klassiekAb.includes('border-radius: 11px;'),
  );

  // 7. Суцільні первинні кнопки на var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без світіння та без #fff.
  const aieHoofdRegel = aieRegels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette[data-maquette-stijl="klassiek"] :is(.aie-container, .aie-chat-koppeling) :is(.aie-knop-hoofd, .aie-knop-primair)',
    ),
  );
  const abHoofdRegel = abRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.ab-paneel .ab-knop-hoofd:not(.risico-hoog):not(.risico-kritiek)') &&
        s.includes('.ai-grants .hub-btn.tone-primary'),
    ),
  );
  const aieHoofdMap = mapDecls(aieHoofdRegel);
  const abHoofdMap = mapDecls(abHoofdRegel);
  const witKleurRegel = /(?<![-\w])color\s*:\s*(?:#fff(?:fff)?|white)\b/i;
  check(
    'головні кнопки екосистеми ШІ та підтверджень використовують суцільні var(--mq-knop-primair-bg) і var(--mq-knop-primair-tekst) з box-shadow: none та border-radius: 11px без жодного сирого color: #fff',
    aieHoofdMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      aieHoofdMap.get('background-image') === 'none' &&
      aieHoofdMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      aieHoofdMap.get('border-radius') === '11px' &&
      aieHoofdMap.get('box-shadow') === 'none' &&
      abHoofdMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      abHoofdMap.get('background-image') === 'none' &&
      abHoofdMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      abHoofdMap.get('border-radius') === '11px' &&
      abHoofdMap.get('box-shadow') === 'none' &&
      !witKleurRegel.test(aieZonderCommentaar) &&
      !witKleurRegel.test(abZonderCommentaar),
  );

  // 8. Виразний семантичний сигнал безпеки на аварійній зупинці .ai-stop і високому ризику без градієнтів.
  const stopBevestigRegel = abRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ai-stop .ag-bevestig'),
  );
  const risicoHoogKaartRegel = abRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ab-paneel .ab-kaart.risico-hoog'),
  );
  const risicoHoogKnopRegel = abRegels.find((r) =>
    r.selectors.some(
      (s) =>
        s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"] :is(') &&
        s.includes('.ab-paneel .ab-knop-hoofd.risico-hoog') &&
        s.includes('button.hub-btn.tone-danger[data-ai-geen-actie]'),
    ),
  );
  const stopBevestigMap = mapDecls(stopBevestigRegel);
  const risicoHoogKaartMap = mapDecls(risicoHoogKaartRegel);
  const risicoHoogKnopMap = mapDecls(risicoHoogKnopRegel);
  check(
    'аварійна зупинка .ai-stop, картки й кнопки високого ризику зберігають чіткий семантичний сигнал безпеки через var(--fout) / var(--fout-vlak) / var(--warn) без строкатих градієнтів',
    stopBevestigMap.get('border') === '1px solid var(--fout)' &&
      stopBevestigMap.get('border-left') === '4px solid var(--fout)' &&
      stopBevestigMap.get('backdrop-filter') === 'none' &&
      risicoHoogKaartMap.get('border-color') === 'var(--fout)' &&
      risicoHoogKaartMap.get('border-left') === '4px solid var(--fout)' &&
      risicoHoogKaartMap.get('background-image') === 'none' &&
      risicoHoogKnopMap.get('background') === 'var(--fout-vlak)' &&
      risicoHoogKnopMap.get('color') === 'var(--text-on-vlak)' &&
      risicoHoogKnopMap.get('box-shadow') === 'none' &&
      klassiekAb.includes('var(--warn)'),
  );

  // 9. Таблиця прав table.ai-tabel, плашки hub-pill[data-aanvrager], картки .hub-goedkeuring, типографіка й табличні цифри tabular-nums.
  const tabelBorderPc = wint(
    abRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .ai-grants table.ai-tabel',
    'border',
    pcProfiel,
  );
  const tabelNumsPc = wint(
    abRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .ai-grants table.ai-tabel',
    'font-variant-numeric',
    pcProfiel,
  );
  const pillBorderPc = wint(
    abRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] span.hub-pill[data-aanvrager]',
    'border',
    pcProfiel,
  );
  const goedkeuringBorderPc = wint(
    abRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-goedkeuring',
    'border',
    pcProfiel,
  );
  const kopMetaNumsPc = wint(
    aieRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .aie-container .aie-mq-kop-meta',
    'font-variant-numeric',
    pcProfiel,
  );
  check(
    'таблиця прав table.ai-tabel, плашки hub-pill[data-aanvrager], картки .hub-goedkeuring і лічильники .aie-mq-kop-meta мають чіткі лінії 1px solid var(--mq-rand), беззасічкову типографіку та font-variant-numeric: tabular-nums',
    tabelBorderPc?.waarde === '1px solid var(--mq-rand)' &&
      tabelNumsPc?.waarde === 'tabular-nums' &&
      pillBorderPc?.waarde === '1px solid var(--mq-rand)' &&
      goedkeuringBorderPc?.waarde === '1px solid var(--mq-rand)' &&
      kopMetaNumsPc?.waarde === 'tabular-nums' &&
      klassiekAie.includes('font-family: var(--mq-font-ui);') &&
      klassiekAb.includes('font-family: var(--mq-font-ui);'),
  );

  // 10. Критичне правило специфічності :not(#_mqk) проти flat-content (0, 19, 0) винятково без padding і без gap.
  const mqkAie = aieRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const mqkAb = abRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = [...mqkAie, ...mqkAb].flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'правила html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) в обох CSS-файлах містять винятково border, border-inline, border-radius: 16px та box-shadow без жодного padding чи gap',
    mqkAie.length >= 2 &&
      mqkAb.length >= 2 &&
      [...mqkAie, ...mqkAb].every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')),
      ) &&
      [...mqkAie, ...mqkAb].every((r) =>
        r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px'),
      ) &&
      [...mqkAie, ...mqkAb].every((r) => r.decls.some((d) => d.eig === 'border-inline')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 11. Каскадна дисципліна, відсутність !important / prefers-color-scheme / position: fixed та чисті праві відступи шапок.
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };
  const buitenAie = inhoudBuitenMediaBlokken(aieCss, idxAieEersteMedia);
  const buitenAb = inhoudBuitenMediaBlokken(abCss, idxAbEersteMedia);
  const reservesAie = kopReserves('src/ai-ecosysteem/ai-ecosysteem-maquette.css', aieCss);
  const reservesAb = kopReserves('src/ai-bevestiging/ai-bevestigingen-maquette.css', abCss);
  check(
    'обидві таблиці стилів не містять !important, prefers-color-scheme чи position: fixed, класичні настільні правила стоять суворо перед першим @media, мобільні відступи перемагають на вузькому екрані, а kopReserves порожній',
    !/!\s*important/i.test(aieCss) &&
      !/!\s*important/i.test(abCss) &&
      !/prefers-color-scheme/i.test(aieCss) &&
      !/prefers-color-scheme/i.test(abCss) &&
      !/position\s*:\s*fixed/i.test(aieCss) &&
      !/position\s*:\s*fixed/i.test(abCss) &&
      !MINI_PALET_RAUW.test(aieZonderCommentaar) &&
      !MINI_PALET_RAUW.test(abZonderCommentaar) &&
      idxAieKlassiek > 0 &&
      idxAieEersteMedia > idxAieKlassiek &&
      idxAieMaxMedia >= idxAieEersteMedia &&
      idxAbKlassiek > 0 &&
      idxAbEersteMedia > idxAbKlassiek &&
      idxAbMaxMedia >= idxAbEersteMedia &&
      buitenAie === '' &&
      buitenAb === '' &&
      reservesAie.length === 0 &&
      reservesAb.length === 0 &&
      wint(
        aieRegels,
        'html.palet-maquette[data-maquette-stijl="klassiek"] .aie-container .aie-kop.aie-mq-held-kop',
        'padding',
        telProfiel,
      )?.waarde === '10px 14px' &&
      wint(abRegels, 'html.palet-maquette[data-maquette-stijl="klassiek"] section.ab-paneel', 'padding', telProfiel)
        ?.waarde === '14px' &&
      wint(
        abRegels,
        'html.palet-maquette[data-maquette-stijl="klassiek"] .ab-paneel .ab-kaart',
        'padding',
        telProfiel,
      )?.waarde === '12px 14px',
  );

  // 12. Абсолютна мовна чистота всіх 3 файлів контуру KLASSIEK-006B.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    ['src/ai-ecosysteem/ai-ecosysteem-maquette.css', aieCss],
    ['src/ai-bevestiging/ai-bevestigingen-maquette.css', abCss],
    [controlePad, zelfControle],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  const controleBestandsnaam = controlePad.split('/').pop() ?? '';
  check(
    'жоден файл контуру KLASSIEK-006B не містить заборонених літер російської абетки, а назва файла перевірок відповідає нідерландському іменуванню',
    taalOvertredingen.length === 0 && !/\b(cards|approvals|ecosystem|view)\b/i.test(controleBestandsnaam),
    taalOvertredingen.join(', '),
  );

  return einde();
}
