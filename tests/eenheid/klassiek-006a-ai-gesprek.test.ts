// KLASSIEK-006A (Хвиля 5 тем оформлення «Біла класика» та «Чорна класика» для піддомену ai.tarasevych.com):
// перевірка оболонки служби ШІ, робочої області AiWerkruimte та вікна бесіди AiWerkruimteChat —
// відсікання студійних перевизначень світлого режиму й нічного склепіння шапки, скидання похідних змінних на монохромне ядро,
// приховування дубльованої смуги напрямку, прибирання зірочок «✦» і кольорових ореолів, діловий порядок блоків з бесідою на першому екрані,
// компактна однорядкова смуга стану зі збереженням фактів про модель та інструменти, монохромні позначки станів і кнопок,
// плавна геометрія 16px / 11px, табличні цифри tabular-nums, ізоляція :not(#_mqk) без padding і gap та дисципліна мобільного каскаду.
// Eenheidstest voor de klassieke AI-werkruimte en het werkgesprek op ai.tarasevych.com (KLASSIEK-006A).

import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const RUW_WIT_KLEUR = /(?<![-\w])(?:#fff(?:fff)?|white)(?![-\w])/i;

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-006a-ai-gesprek');

  const aiCss = readFileSync('src/ai-werkruimte-maquette.css', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-006a-ai-gesprek.test.ts', 'utf8');
  const aiZonderCommentaar = aiCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const idxKlassiek = aiCss.indexOf('9. ПРАГМАТИЧНИЙ КЛАСИЧНИЙ ШАР «БІЛА КЛАСИКА» ТА «ЧОРНА КЛАСИКА» (KLASSIEK-006A)');
  const idxEersteMedia = aiCss.search(/@media\s*\(/);
  const klassiekPc =
    idxKlassiek > 0 && idxEersteMedia > idxKlassiek
      ? aiCss.slice(idxKlassiek, idxEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const regels = leesCss(aiCss);

  // 1. Відсікання студійного світлого замісу (.theme-light / .theme-plum-light) та нічного склепіння .mq-held через :not([data-maquette-stijl="klassiek"]).
  const lichtRegels = regels.filter((r) =>
    r.selectors.some((s) => s.includes('theme-light') || s.includes('theme-plum-light')),
  );
  const studioHeldRegels = regels.filter(
    (r) =>
      r.selectors.some((s) => s.includes('.mq-held') && !s.includes('.mq-held-stat-pil')) &&
      !r.selectors.some((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]')),
  );
  const colorSchemeRegels = regels.filter((r) => r.decls.some((d) => d.eig === 'color-scheme'));

  check(
    'студійні правила .theme-light / .theme-plum-light та примусове нічне склепіння .mq-held повністю відсічені через :not([data-maquette-stijl="klassiek"])',
    lichtRegels.length === 1 &&
      lichtRegels[0].selectors.length === 4 &&
      lichtRegels[0].selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')) &&
      studioHeldRegels.length === 2 &&
      studioHeldRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ) &&
      colorSchemeRegels.length === 1 &&
      colorSchemeRegels[0].selectors.every((s) =>
        s.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])'),
      ),
  );

  // 2. Скидання всіх похідних змінних на чисті монохромні змінні ядра під html.palet-maquette[data-maquette-stijl="klassiek"].
  const varRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ai-maquette-wikkel') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .aiw') &&
      r.decls.some((d) => d.eig === '--mq-ai-halo'),
  );
  const varMap = new Map((varRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'похідні змінні на .ai-maquette-wikkel та .aiw скинуті на чисті монохромні змінні ядра, а ореоли й відблиски скла прозорі',
    varMap.get('--mq-accent-ai') === 'var(--mq-accent)' &&
      varMap.get('--mq-accent-ai-diep') === 'var(--mq-accent-2)' &&
      varMap.get('--mq-accent-ai-op') === 'var(--mq-accent-op)' &&
      varMap.get('--mq-ai-halo') === 'transparent' &&
      varMap.get('--mq-ai-halo-zacht') === 'transparent' &&
      varMap.get('--mq-ai-glas-glans') === 'transparent' &&
      varMap.get('--mq-ai-rand') === 'var(--mq-rand)' &&
      varMap.get('--mq-ai-rand-sterk') === 'var(--mq-rand-sterk)' &&
      varMap.get('--mq-ai-rand-accent') === 'var(--mq-rand-sterk)' &&
      varMap.get('--mq-ai-glas-diep') === 'var(--mq-oppervlak)' &&
      varMap.get('--mq-ai-glas-verhoogd') === 'var(--mq-oppervlak-2)' &&
      varMap.get('--mq-ai-chat-put') === 'var(--mq-invoer)' &&
      varMap.get('--panel') === 'var(--mq-oppervlak)' &&
      varMap.get('--surface') === 'var(--mq-oppervlak-2)' &&
      varMap.get('--surface2') === 'var(--mq-oppervlak-3, var(--mq-oppervlak-2))' &&
      varMap.get('--soft') === 'var(--mq-accent-zacht)' &&
      varMap.get('--line') === 'var(--mq-rand)' &&
      varMap.get('--text') === 'var(--mq-tekst)' &&
      varMap.get('--muted') === 'var(--mq-gedempt)' &&
      varMap.get('--faint') === 'var(--mq-stil)' &&
      varMap.get('--accent') === 'var(--mq-accent)' &&
      varMap.get('--accenttext') === 'var(--mq-accent-op)' &&
      klassiekPc.includes('--accentText: var(--mq-accent-op);') &&
      varMap.get('--text-on-accent') === 'var(--mq-accent-op)' &&
      varMap.get('--accent-soft') === 'var(--mq-accent-zacht)' &&
      varMap.get('--focus') === 'var(--mq-accent)',
  );

  // 3. Приховування дубльованої смуги напрямку, повне вимкнення зірочок «✦», ореолів, градієнтів і розмиття.
  const richtingRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ai-maquette-wikkel .ai-richting'),
  );
  const sterRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .aiw-kaart[data-aiw-vragen="1"]>h2::before') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .chat-panel[data-aiw-chat="true"] .chat-busy::before'),
  );
  const sterMap = new Map((sterRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'дубльована смуга .ai-richting прихована під шапкою, декоративні зірочки «✦» вимкнені, а в класичному блоці немає градієнтів, розмиття та зсувів',
    richtingRegel?.decls.some((d) => d.eig === 'display' && d.waarde === 'none') === true &&
      sterMap.get('content') === 'none' &&
      sterMap.get('display') === 'none' &&
      klassiekPc.includes('background-image: none;') &&
      klassiekPc.includes('backdrop-filter: none;') &&
      klassiekPc.includes('-webkit-backdrop-filter: none;') &&
      !/linear-gradient|radial-gradient/i.test(klassiekPc) &&
      !/✦/.test(klassiekPc) &&
      !/translateY|translateX|translate\(|scale\(/i.test(klassiekPc),
  );

  // 4. Гнучкий діловий стовпчик section.aiw[data-aiw="1"] та практичний порядок елементів на першому екрані (1..5).
  const aiwKolomRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] section.aiw[data-aiw="1"]'),
  );
  const aiwKolomMap = new Map((aiwKolomRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const volgordeVan = (kindSelector: string): string | undefined => {
    const r = regels.find(
      (regel) =>
        regel.media.length === 0 &&
        regel.selectors.includes(`html.palet-maquette[data-maquette-stijl="klassiek"] section.aiw[data-aiw="1"]>${kindSelector}`),
    );
    return r?.decls.find((d) => d.eig === 'order')?.waarde;
  };

  check(
    'section.aiw[data-aiw="1"] є гнучким стовпчиком із відступом 12px і порядком: перемикач (1) → екосистема (2) → бесіда (3) → підказки (4) → смуга стану (5)',
    aiwKolomMap.get('display') === 'flex' &&
      aiwKolomMap.get('flex-direction') === 'column' &&
      aiwKolomMap.get('gap') === '12px' &&
      volgordeVan('.aiw-schakel') === '1' &&
      volgordeVan('.aie-chat-koppeling') === '2' &&
      volgordeVan('.chat-panel') === '3' &&
      volgordeVan('.aiw-kaart[data-aiw-vragen="1"]') === '4' &&
      volgordeVan('.aiw-kop') === '5',
  );

  // 5. Компактна однорядкова смуга стану .aiw-kop із збереженням усіх фактів про модель та кількість інструментів.
  const kopRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .aiw-kop') &&
      r.decls.some((d) => d.eig === 'padding'),
  );
  const kopH1Regel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .aiw-kop h1'),
  );
  const kopPRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .aiw-kop p'),
  );
  const kopMap = new Map((kopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const kopH1Map = new Map((kopH1Regel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const kopPMap = new Map((kopPRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'внутрішня шапка .aiw-kop оформлена як однорядкова смуга стану (padding: 10px 14px, border-radius: 16px, h1: 0.92rem) без приховування підсумку про інструменти й модель',
    kopMap.get('display') === 'flex' &&
      kopMap.get('flex-direction') === 'row' &&
      kopMap.get('padding') === '10px 14px' &&
      kopMap.get('border-radius') === '16px' &&
      kopH1Map.get('font-size') === '0.92rem' &&
      kopH1Map.get('display') !== 'none' &&
      kopPMap.get('display') !== 'none' &&
      kopPMap.get('font-variant-numeric') === 'tabular-nums',
  );

  // 6. Монохромні позначки станів .aiw-vlag та інверсна позначка активного стану .aiw-staat-aan без фіолетового забарвлення.
  const vlagRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .aiw-vlag') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .aiw-staat-niet-in-chat'),
  );
  const staatAanRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .aiw-staat-aan'),
  );
  const vlagMap = new Map((vlagRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const staatAanMap = new Map((staatAanRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'усі плашки .aiw-vlag і .aiw-staat-niet-in-chat переведені на нейтральні монохромні кольори, а .aiw-staat-aan має інверсну контрастну позначку',
    vlagMap.get('background') === 'var(--mq-oppervlak-2)' &&
      vlagMap.get('color') === 'var(--mq-tekst)' &&
      vlagMap.get('border') === '1px solid var(--mq-rand-sterk)' &&
      vlagMap.get('border-radius') === '999px' &&
      staatAanMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      staatAanMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      staatAanMap.get('border') === '1px solid var(--mq-knop-primair-bg)' &&
      staatAanMap.get('border-radius') === '999px',
  );

  // 7. Первинні кнопки відправлення/дії на змінних --mq-knop-primair-bg / --mq-knop-primair-tekst з кутами 11px без сирого білого кольору.
  const primairKnopRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .aiw button.aiw-hoofd') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .chat-panel[data-aiw-chat="true"] button'),
  );
  const primairKnopMap = new Map((primairKnopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));

  check(
    'первинні кнопки дії у бесіді та робочому просторі використовують var(--mq-knop-primair-bg) і var(--mq-knop-primair-tekst), кути 11px і нульову тінь без #fff',
    primairKnopMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      primairKnopMap.get('background-image') === 'none' &&
      primairKnopMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      primairKnopMap.get('border') === '1px solid var(--mq-knop-primair-bg)' &&
      primairKnopMap.get('border-radius') === '11px' &&
      primairKnopMap.get('box-shadow') === 'none' &&
      !RUW_WIT_KLEUR.test(aiZonderCommentaar),
  );

  // 8. Плавні заокруглення 16px для карток/панелей/бульбашок і 11px для кнопок/полів/чіпів/коду без квадратних кутів.
  const chatUserRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .chat-panel[data-aiw-chat="true"] .chat-user'),
  );
  const chatAssistentRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .chat-panel[data-aiw-chat="true"] .chat-assistant'),
  );
  const agentIngangRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] .ai-maquette-wikkel .ag-ai-ingangen .ag-kaart.ag-agent-ingang',
      ) &&
      r.decls.some((d) => d.eig === 'border-radius'),
  );
  const preRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] :is(.chat-panel, .aiw) pre'),
  );
  const codeRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] :is(.chat-panel, .aiw) :not(pre)>code'),
  );
  const vraagKnopRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .aiw-vraagrij button'),
  );

  const straalWaardenKlassiek = regels
    .filter((r) => r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && !s.includes(':not([data-maquette-stijl="klassiek"])')))
    .flatMap((r) => r.decls.filter((d) => d.eig === 'border-radius').map((d) => d.waarde));

  check(
    'бульбашки повідомлень і картки агентів матові з кутами 16px, блоки коду, перемикачі й підказки мають 11px, а квадратні кути 0px відсутні',
    chatUserRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') === true &&
      chatUserRegel?.decls.some((d) => d.eig === 'background' && d.waarde === 'var(--mq-oppervlak-2)') === true &&
      chatAssistentRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') === true &&
      chatAssistentRegel?.decls.some((d) => d.eig === 'background' && d.waarde === 'var(--mq-oppervlak)') === true &&
      agentIngangRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') === true &&
      preRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '11px') === true &&
      codeRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '11px') === true &&
      vraagKnopRegel?.decls.some((d) => d.eig === 'border-radius' && d.waarde === '11px') === true &&
      straalWaardenKlassiek.length >= 15 &&
      straalWaardenKlassiek.every((w) => w === '16px' || w === '11px' || w === '999px'),
    straalWaardenKlassiek.join(', '),
  );

  // 9. Окреме правило специфічності :not(#_mqk) проти flat-content (0, 19, 0) винятково без padding і gap.
  const mqkRegels = regels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = mqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  const alleMqkSelectors = mqkRegels.flatMap((r) => r.selectors);

  check(
    'правило html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) охоплює .aiw-kaart, .chat-panel, section.ag-ai-ingangen, .ag-agent-ingang, .aiw-kop і містить винятково border, border-inline, border-radius: 16px та box-shadow без padding чи gap',
    mqkRegels.length >= 1 &&
      alleMqkSelectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')) &&
      alleMqkSelectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) .aiw-kaart') &&
      alleMqkSelectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) .chat-panel') &&
      alleMqkSelectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) section.ag-ai-ingangen') &&
      alleMqkSelectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) .ag-ai-ingangen .ag-agent-ingang') &&
      alleMqkSelectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) .aiw-kop') &&
      mqkRegels.every(
        (r) =>
          r.decls.length === 4 &&
          r.decls.some((d) => d.eig === 'border' && d.waarde === '1px solid var(--mq-rand)') &&
          r.decls.some((d) => d.eig === 'border-inline' && d.waarde === '1px solid var(--mq-rand)') &&
          r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px') &&
          r.decls.some((d) => d.eig === 'box-shadow' && d.waarde === 'var(--mq-schaduw-kaart)'),
      ) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 10. Беззасічкова ділова типографіка заголовків та табличні цифри tabular-nums.
  check(
    'заголовки h1..h4 використовують беззасічковий шрифт var(--mq-font-ui) без курсиву, а числові лічильники в шапці й вікні бесіди мають font-variant-numeric: tabular-nums',
    klassiekPc.includes(':is(.ai-maquette-wikkel, .aiw) :is(h1, h2, h3, h4)') &&
      klassiekPc.includes('font-family: var(--mq-font-ui);') &&
      klassiekPc.includes('font-style: normal;') &&
      klassiekPc.includes('font-variant-numeric: tabular-nums;') &&
      klassiekPc.includes('.aiw-model') &&
      klassiekPc.includes('.mq-held-stat-pil'),
  );

  // 11. Сувора дисципліна каскаду: нуль !important, prefers-color-scheme, position: fixed; класика перед першим @media; мобільні відступи перемагають.
  const eersteMediaVolg = Math.min(...regels.filter((r) => r.media.length > 0).map((r) => r.volg));
  const basisRegelsNaMedia = regels.filter((r) => r.media.length === 0 && !r.overig && r.volg > eersteMediaVolg);
  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };
  const chatSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .chat-panel[data-aiw-chat="true"]';
  const kaartSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .aiw-kaart';
  const kopSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .aiw-kop';

  check(
    'таблиця стилів не містить !important, prefers-color-scheme чи position: fixed, класичний розділ стоїть суворо перед першим @media, а мобільні відступи перемагають на вузькому екрані',
    !/!\s*important/i.test(aiCss) &&
      !/prefers-color-scheme/i.test(aiCss) &&
      !/position\s*:\s*fixed/i.test(aiCss) &&
      idxKlassiek > 0 &&
      idxEersteMedia > idxKlassiek &&
      Number.isFinite(eersteMediaVolg) &&
      basisRegelsNaMedia.length === 0 &&
      wint(regels, chatSel, 'padding', pcProfiel)?.waarde === '16px 18px' &&
      wint(regels, chatSel, 'padding', telProfiel)?.waarde === '14px' &&
      wint(regels, kaartSel, 'padding', pcProfiel)?.waarde === '16px 18px' &&
      wint(regels, kaartSel, 'padding', telProfiel)?.waarde === '14px' &&
      wint(regels, kopSel, 'padding', pcProfiel)?.waarde === '10px 14px' &&
      wint(regels, kopSel, 'padding', telProfiel)?.waarde === '10px 12px',
  );

  // 12. Абсолютна мовна чистота в обох файлах контуру KLASSIEK-006A.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    ['src/ai-werkruimte-maquette.css', aiCss],
    ['tests/eenheid/klassiek-006a-ai-gesprek.test.ts', zelfTest],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);

  check(
    'жоден файл пакета KLASSIEK-006A не містить заборонених символів російської абетки',
    taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
