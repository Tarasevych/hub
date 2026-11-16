// KLASSIEK-005B (Хвиля 4 тем оформлення «Біла класика» та «Чорна класика» для простору hub.tarasevych.com):
// перевірка стилів нотаток (notities-maquette.css) і календаря (agenda-maquette.css) разом з усіма портальними вікнами,
// відсікання студійних світлих блоків, компактних робочих шапок, матових поверхонь 16px / 11px,
// захисту специфічності проти flat-content без padding і gap, типографіки, табличних цифр і каскадної дисципліни.
// Eenheidstest voor de klassieke notitie- en agenda-opmaak inclusief modale lagen (KLASSIEK-005B).

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
  const { check, einde } = checker('klassiek-005b-notities-agenda');

  const testPad = 'tests/eenheid/klassiek-005b-notities-agenda.test.ts';
  const notitiesCss = readFileSync('src/notities/notities-maquette.css', 'utf8');
  const agendaCss = readFileSync('src/agenda/agenda-maquette.css', 'utf8');
  const zelfTest = readFileSync(testPad, 'utf8');

  const notitiesZonderCommentaar = notitiesCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const agendaZonderCommentaar = agendaCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const idxNotitiesKlassiek = notitiesCss.indexOf('7. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-005B)');
  const idxNotitiesEersteMedia = notitiesCss.search(/@media\s*\(/);
  const idxNotitiesMaxMedia = notitiesCss.search(/@media\s*\(\s*max-width/);
  const klassiekNotities =
    idxNotitiesKlassiek > 0 && idxNotitiesEersteMedia > idxNotitiesKlassiek
      ? notitiesCss.slice(idxNotitiesKlassiek, idxNotitiesEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const idxAgendaKlassiek = agendaCss.indexOf('5. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-005B)');
  const idxAgendaEersteMedia = agendaCss.search(/@media\s*\(/);
  const idxAgendaMaxMedia = agendaCss.search(/@media\s*\(\s*max-width/);
  const klassiekAgenda =
    idxAgendaKlassiek > 0 && idxAgendaEersteMedia > idxAgendaKlassiek
      ? agendaCss.slice(idxAgendaKlassiek, idxAgendaEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const notitiesRegels = leesCss(notitiesCss);
  const agendaRegels = leesCss(agendaCss);

  // 1. Відсікання студійних світлих блоків .theme-light / .theme-plum-light на кожній гілці селекторів.
  const notitiesStudioLicht = notitiesRegels.filter((r) =>
    r.selectors.some((s) => s.includes('.theme-light') || s.includes('.theme-plum-light')),
  );
  const agendaStudioLicht = agendaRegels.filter((r) =>
    r.selectors.some((s) => s.includes('.theme-light') || s.includes('.theme-plum-light')),
  );
  check(
    'усі студійні блоки .theme-light / .theme-plum-light у notities-maquette.css та agenda-maquette.css відсічені через :not([data-maquette-stijl="klassiek"]) на кожній гілці селекторів',
    notitiesStudioLicht.length >= 1 &&
      agendaStudioLicht.length >= 2 &&
      [...notitiesStudioLicht, ...agendaStudioLicht].every((r) =>
        r.selectors.every((s) => s.includes('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ),
  );

  // 2. Портальні шари поза .canonical-chrome отримують точні порцелянові та оніксово-графітові поверхні й наголоси.
  const vnPortaalWit = notitiesRegels.find((r) => r.selectors.includes('html.palet-klassiek-wit .vn-laag'));
  const vnPortaalZwart = notitiesRegels.find((r) => r.selectors.includes('html.palet-klassiek-zwart .vn-laag'));
  const agPortaalWit = agendaRegels.find((r) =>
    r.selectors.some((s) => s.startsWith('html.palet-klassiek-wit') && s.includes('.agv-laag') && s.includes('.agenda-venster-laag')),
  );
  const agPortaalZwart = agendaRegels.find((r) =>
    r.selectors.some((s) => s.startsWith('html.palet-klassiek-zwart') && s.includes('.agv-laag') && s.includes('.agenda-venster-laag')),
  );
  const mapDecls = (r: typeof vnPortaalWit) => new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const vnWitMap = mapDecls(vnPortaalWit);
  const vnZwartMap = mapDecls(vnPortaalZwart);
  const agWitMap = mapDecls(agPortaalWit);
  const agZwartMap = mapDecls(agPortaalZwart);
  check(
    'портальні шари (.vn-laag, .agv-laag, .agenda-venster-laag, iCloud) у palet-klassiek-wit мають порцелянові поверхні й наголос #181c24/#ffffff, а в palet-klassiek-zwart — оніксово-графітові поверхні й наголос #f3f4f6/#0c0e12 без розмитого тексту',
    vnWitMap.get('--mq-oppervlak') === '#ffffff' &&
      vnWitMap.get('--mq-oppervlak-2') === '#f1f3f6' &&
      vnWitMap.get('--mq-accent') === '#181c24' &&
      vnWitMap.get('--mq-accent-op') === '#ffffff' &&
      agWitMap.get('--mq-oppervlak') === '#ffffff' &&
      agWitMap.get('--mq-oppervlak-2') === '#f1f3f6' &&
      agWitMap.get('--mq-accent') === '#181c24' &&
      agWitMap.get('--mq-accent-op') === '#ffffff' &&
      vnZwartMap.get('--mq-oppervlak') === '#14171d' &&
      vnZwartMap.get('--mq-oppervlak-2') === '#1b1f27' &&
      vnZwartMap.get('--mq-tekst') === '#f3f4f6' &&
      vnZwartMap.get('--mq-accent') === '#f3f4f6' &&
      vnZwartMap.get('--mq-accent-op') === '#0c0e12' &&
      agZwartMap.get('--mq-oppervlak') === '#14171d' &&
      agZwartMap.get('--mq-oppervlak-2') === '#1b1f27' &&
      agZwartMap.get('--mq-tekst') === '#f3f4f6' &&
      agZwartMap.get('--mq-accent') === '#f3f4f6' &&
      agZwartMap.get('--mq-accent-op') === '#0c0e12',
  );

  // 3. Компактні внутрішні шапки (padding: 12px 16px) без прожекторів та безпечні праві відступи шапок вікон (<= 20px).
  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const vnKopPc = wint(notitiesRegels, 'html.palet-maquette[data-maquette-stijl="klassiek"] .vn-kop', 'padding', pcProfiel);
  const hubKopPc = wint(
    notitiesRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .hub-notes>header',
    'padding',
    pcProfiel,
  );
  const vnLaagKopPc = wint(
    notitiesRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .vn-laag-kop',
    'padding',
    pcProfiel,
  );
  const agendaKopPc = wint(
    agendaRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .agenda-kop',
    'padding',
    pcProfiel,
  );
  const agvKopPc = wint(agendaRegels, 'html.palet-maquette[data-maquette-stijl="klassiek"] .agv-kop', 'padding', pcProfiel);
  const agvLaagKopPc = wint(
    agendaRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .agv-laag-kop',
    'padding',
    pcProfiel,
  );
  const icloudKopPc = wint(
    agendaRegels,
    'html.palet-maquette[data-maquette-stijl="klassiek"] .venster[data-venster="agenda-icloud"] .venster-kop',
    'padding',
    pcProfiel,
  );
  const reservesNotities = kopReserves('src/notities/notities-maquette.css', notitiesCss);
  const reservesAgenda = kopReserves('src/agenda/agenda-maquette.css', agendaCss);
  check(
    'внутрішні шапки (.vn-kop, .hub-notes > header, .agenda-kop, .agv-kop) та шапки вікон (.vn-laag-kop, .agv-laag-kop, .venster-kop) стиснуті до 12px 16px (padding-right <= 20px) без порушень plaatsing-controle',
    vnKopPc?.waarde === '12px 16px' &&
      hubKopPc?.waarde === '12px 16px' &&
      vnLaagKopPc?.waarde === '12px 16px' &&
      agendaKopPc?.waarde === '12px 16px' &&
      agvKopPc?.waarde === '12px 16px' &&
      agvLaagKopPc?.waarde === '12px 16px' &&
      icloudKopPc?.waarde === '12px 16px' &&
      reservesNotities.length === 0 &&
      reservesAgenda.length === 0,
  );

  // 4. Матові поверхні нотаток, редактора, сітки календаря, карток подій та портальних вікон (16px / 11px, без градієнтів і розмиття).
  check(
    'усі картки нотаток, бічний список, редактор нотатки, сітки місяця/тижня/дня календаря, картки подій і портальні вікна мають матові поверхні (--agv-r: 16px, --mq-straal-kaart: 16px, --mq-straal-knop: 11px), background-image: none, backdrop-filter: none і transform: none',
    klassiekNotities.includes('--mq-straal-kaart: 16px;') &&
      klassiekNotities.includes('--mq-straal-knop: 11px;') &&
      klassiekNotities.includes('.vn-rail') &&
      klassiekNotities.includes('.vn-kaart') &&
      klassiekNotities.includes('.vn-laag-vak') &&
      klassiekNotities.includes('.vn-werkbalk') &&
      klassiekNotities.includes('.hub-notes-lijst > li') &&
      klassiekNotities.includes('background: var(--mq-oppervlak);') &&
      klassiekNotities.includes('background: var(--mq-oppervlak-2);') &&
      klassiekNotities.includes('background-image: none;') &&
      klassiekNotities.includes('backdrop-filter: none;') &&
      klassiekNotities.includes('transform: none;') &&
      klassiekAgenda.includes('--agv-r: 16px;') &&
      klassiekAgenda.includes('--mq-straal-kaart: 16px;') &&
      klassiekAgenda.includes('--mq-straal-knop: 11px;') &&
      klassiekAgenda.includes('.agv-zijbalk') &&
      klassiekAgenda.includes('.agv-maand') &&
      klassiekAgenda.includes('.agv-raster') &&
      klassiekAgenda.includes('.agv-item') &&
      klassiekAgenda.includes('.agenda-item-knop') &&
      klassiekAgenda.includes('.agenda-venster') &&
      klassiekAgenda.includes('.agv-laag-vak') &&
      klassiekAgenda.includes('background: var(--mq-oppervlak);') &&
      klassiekAgenda.includes('background: var(--mq-oppervlak-2);') &&
      klassiekAgenda.includes('background-image: none;') &&
      klassiekAgenda.includes('backdrop-filter: none;') &&
      klassiekAgenda.includes('transform: none;') &&
      !/gradient/i.test(klassiekNotities) &&
      !/gradient/i.test(klassiekAgenda) &&
      !/translateY|scale\(/i.test(klassiekNotities) &&
      !/translateY|scale\(/i.test(klassiekAgenda),
  );

  // 5. Критичне правило специфічності :not(#_mqk) проти flat-content (0, 19, 0) винятково без padding і gap.
  const mqkNotities = notitiesRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const mqkAgenda = agendaRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = [...mqkNotities, ...mqkAgenda].flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'правила з html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) присутні в обох таблицях стилів і містять винятково border, border-inline, border-radius: 16px та box-shadow без жодного padding чи gap',
    mqkNotities.length >= 2 &&
      mqkAgenda.length >= 2 &&
      [...mqkNotities, ...mqkAgenda].every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')),
      ) &&
      [...mqkNotities, ...mqkAgenda].every((r) =>
        r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px'),
      ) &&
      [...mqkNotities, ...mqkAgenda].every((r) => r.decls.some((d) => d.eig === 'border-inline')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 6. Кнопки, сегменти режимів «День / Тиждень / Місяць / Розклад», пігулки міток і поля форм мають border-radius: 11px.
  check(
    'кнопки, сегменти режимів (.agenda-weergaven, .agv-segment), пігулки міток (.vn-chip, .vn-etiket, .agv-pil, .agv-label) та поля форм і пошуку мають border-radius: 11px зі збереженням безрамкового .vn-zoekveld input',
    klassiekNotities.includes('.vn-knop') &&
      klassiekNotities.includes('.vn-chip') &&
      klassiekNotities.includes('.vn-etiket') &&
      klassiekNotities.includes('.vn .vn-zoekveld') &&
      klassiekNotities.includes('border-radius: 11px;') &&
      /\.vn\s+\.vn-zoekveld\s+input[^{]*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/.test(klassiekNotities) &&
      klassiekAgenda.includes('.agenda-weergaven') &&
      klassiekAgenda.includes('.agv-segment') &&
      klassiekAgenda.includes('.agv-segment button') &&
      klassiekAgenda.includes('.agv-pil') &&
      klassiekAgenda.includes('.agv-label') &&
      klassiekAgenda.includes('.agv-zoek input') &&
      klassiekAgenda.includes('border-radius: 11px;'),
  );

  // 7. Суцільні головні кнопки дії на --mq-knop-primair-bg / --mq-knop-primair-tekst без #fff у кнопках, без світіння та чисті мініпалітри.
  const vnHoofdRegel = notitiesRegels.find((r) =>
    r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] :is(.vn, .vn-laag) .vn-knop.is-hoofd'),
  );
  const agHoofdRegel = agendaRegels.find((r) =>
    r.selectors.includes(
      'html.palet-maquette[data-maquette-stijl="klassiek"] :is(.agv, .agv-laag) :is(.agv-hoofdknop, .agv-knop.is-hoofd)',
    ),
  );
  const vnHoofdMap = mapDecls(vnHoofdRegel);
  const agHoofdMap = mapDecls(agHoofdRegel);
  const witKleurRegel = /(?<![-\w])color\s*:\s*(?:#fff(?:fff)?|white)\b/i;
  check(
    'головні кнопки нотаток і календаря використовують суцільні var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) з box-shadow: none без color: #fff та без сирих значень у мініпалітрах --ag-* / --hub-*',
    vnHoofdMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      vnHoofdMap.get('background-image') === 'none' &&
      vnHoofdMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      vnHoofdMap.get('box-shadow') === 'none' &&
      agHoofdMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      agHoofdMap.get('background-image') === 'none' &&
      agHoofdMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      agHoofdMap.get('box-shadow') === 'none' &&
      !witKleurRegel.test(notitiesZonderCommentaar) &&
      !witKleurRegel.test(agendaZonderCommentaar) &&
      !MINI_PALET_RAUW.test(notitiesZonderCommentaar) &&
      !MINI_PALET_RAUW.test(agendaZonderCommentaar),
  );

  // 8. Беззасічкова ділова типографіка заголовків h1..h4 та табличні цифри tabular-nums у обох просторах.
  check(
    'заголовки h1..h4 у нотатках і календарі використовують var(--mq-font-ui) без курсиву, а дати, години сітки календаря, лічильники нотаток і слів мають font-variant-numeric: tabular-nums',
    klassiekNotities.includes(':is(h1, h2, h3, h4)') &&
      klassiekNotities.includes('font-family: var(--mq-font-ui);') &&
      klassiekNotities.includes('font-style: normal;') &&
      klassiekNotities.includes('font-variant-numeric: tabular-nums;') &&
      klassiekNotities.includes('.vn-telling') &&
      klassiekNotities.includes('.vn-kaart-datum') &&
      klassiekNotities.includes('.vn-bewaarstand') &&
      klassiekAgenda.includes(':is(h1, h2, h3, h4)') &&
      klassiekAgenda.includes('font-family: var(--mq-font-ui);') &&
      klassiekAgenda.includes('font-style: normal;') &&
      klassiekAgenda.includes('font-variant-numeric: tabular-nums;') &&
      klassiekAgenda.includes('.agv-uren') &&
      klassiekAgenda.includes('.agv-item-tijd') &&
      klassiekAgenda.includes('.agenda-item-knop time'),
  );

  // 9. Непорушна каскадна дисципліна обох файлів: нуль !important, prefers-color-scheme, position: fixed, медіаблоки наприкінці.
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };
  const buitenNotities = inhoudBuitenMediaBlokken(notitiesCss, idxNotitiesEersteMedia);
  const buitenAgenda = inhoudBuitenMediaBlokken(agendaCss, idxAgendaEersteMedia);
  check(
    'обидві таблиці стилів не містять !important, prefers-color-scheme чи position: fixed, класичні розділи стоять суворо перед першим @media, а мобільні відступи перемагають на вузькому екрані',
    !/!\s*important/i.test(notitiesCss) &&
      !/!\s*important/i.test(agendaCss) &&
      !/prefers-color-scheme/i.test(notitiesCss) &&
      !/prefers-color-scheme/i.test(agendaCss) &&
      !/position\s*:\s*fixed/i.test(notitiesCss) &&
      !/position\s*:\s*fixed/i.test(agendaCss) &&
      idxNotitiesKlassiek > 0 &&
      idxNotitiesEersteMedia > idxNotitiesKlassiek &&
      idxNotitiesMaxMedia >= idxNotitiesEersteMedia &&
      idxAgendaKlassiek > 0 &&
      idxAgendaEersteMedia > idxAgendaKlassiek &&
      idxAgendaMaxMedia >= idxAgendaEersteMedia &&
      buitenNotities === '' &&
      buitenAgenda === '' &&
      wint(notitiesRegels, 'html.palet-maquette[data-maquette-stijl="klassiek"] .vn-kop', 'padding', telProfiel)
        ?.waarde === '10px 12px' &&
      wint(agendaRegels, 'html.palet-maquette[data-maquette-stijl="klassiek"] .agenda-kop', 'padding', telProfiel)
        ?.waarde === '10px 12px' &&
      wint(agendaRegels, 'html.palet-maquette[data-maquette-stijl="klassiek"] .agv-kop', 'padding', telProfiel)
        ?.waarde === '10px 12px',
  );

  // 10. Абсолютна мовна чистота та дотримання нідерландських назв без заборонених слів.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    ['src/notities/notities-maquette.css', notitiesCss],
    ['src/agenda/agenda-maquette.css', agendaCss],
    [testPad, zelfTest],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  const testBestandsnaam = testPad.split('/').pop() ?? '';
  check(
    'жоден файл контуру KLASSIEK-005B не містить заборонених символів російської абетки, а назва тесту не містить англійських слів',
    taalOvertredingen.length === 0 && !/\b(notes|calendar|view)\b/i.test(testBestandsnaam),
    taalOvertredingen.join(', '),
  );

  return einde();
}
