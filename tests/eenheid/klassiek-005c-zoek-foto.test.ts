// KLASSIEK-005C (Хвиля 4 тем оформлення «Біла класика» та «Чорна класика» для головного простору: єдиний пошук і світлини з повноекранним переглядачем):
// перевірка відсікання студійних світлих блоків .theme-light / .theme-plum-light, охайних однорядкових шапок .zk-kop та .foto-kop,
// монохромних медальйонів джерел і спокійного підсвічування <mark>, матових карток 16px, захисту специфічності проти flat-content без padding/gap,
// геометрії 11px зі збереженням відступу під піктограму лупи, контрасту на світлинах і в .foto-viewer / .foto-info в обох класичних палітрах,
// ділової типографіки, табличних цифр та непорушної дисципліни мобільного каскаду.
// Eenheidstest voor de klassieke zoekpagina, fotogalerij en beeldviewer (KLASSIEK-005C).

import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

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
      const treffer = rest.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*@media\s*\([^)]*\)\s*\{/);
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

function relatieveHelderheid(hexKleur: string): number {
  const schoon = hexKleur.replace('#', '');
  const kanalen = [0, 2, 4].map((start) => {
    const deel = parseInt(schoon.slice(start, start + 2), 16) / 255;
    return deel <= 0.03928 ? deel / 12.92 : ((deel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * kanalen[0] + 0.7152 * kanalen[1] + 0.0722 * kanalen[2];
}

function contrastVerhouding(kleurA: string, kleurB: string): number {
  const helderA = relatieveHelderheid(kleurA);
  const helderB = relatieveHelderheid(kleurB);
  const lichtste = Math.max(helderA, helderB);
  const donkerste = Math.min(helderA, helderB);
  return (lichtste + 0.05) / (donkerste + 0.05);
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-005c-zoek-foto');

  const zoekCss = readFileSync('src/zoek/zoek-maquette.css', 'utf8');
  const fotoCss = readFileSync('src/foto/foto-maquette.css', 'utf8');
  const maquetteKlassiekCss = readFileSync('src/maquette-kern/maquette-klassiek.css', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-005c-zoek-foto.test.ts', 'utf8');

  const zoekZonderCommentaar = zoekCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const fotoZonderCommentaar = fotoCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const zoekIdxKlassiek = zoekCss.indexOf('8. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ');
  const zoekIdxEersteMedia = zoekCss.search(/@media\s*\(/);
  const zoekIdxMaxWidth = zoekCss.search(/@media\s*\(\s*max-width/);
  const zoekKlassiekPc =
    zoekIdxKlassiek > 0 && zoekIdxEersteMedia > zoekIdxKlassiek
      ? zoekCss.slice(zoekIdxKlassiek, zoekIdxEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const fotoIdxKlassiek = fotoCss.indexOf('6. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ');
  const fotoIdxEersteMedia = fotoCss.search(/@media\s*\(/);
  const fotoIdxMaxWidth = fotoCss.search(/@media\s*\(\s*max-width/);
  const fotoKlassiekPc =
    fotoIdxKlassiek > 0 && fotoIdxEersteMedia > fotoIdxKlassiek
      ? fotoCss.slice(fotoIdxKlassiek, fotoIdxEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const zoekRegels = leesCss(zoekCss);
  const fotoRegels = leesCss(fotoCss);

  // 1. Відсікання студійних світлих блоків .theme-light / .theme-plum-light на кожній гілці селекторів в обох файлах.
  const zoekLichtRegels = zoekRegels.filter((r) =>
    r.selectors.some((s) => s.includes('theme-light') || s.includes('theme-plum-light')),
  );
  const fotoLichtRegels = fotoRegels.filter((r) =>
    r.selectors.some((s) => s.includes('theme-light') || s.includes('theme-plum-light')),
  );
  const fotoOudeFlatRegels = fotoRegels.filter((r) =>
    r.selectors.some((s) => s.includes(':not([data-mq-a])')),
  );
  check(
    'усі студійні світлі блоки .theme-light / .theme-plum-light та старі обхідні правила у zoek-maquette.css і foto-maquette.css відсічені через :not([data-maquette-stijl="klassiek"]) на кожній гілці селекторів',
    zoekLichtRegels.length === 1 &&
      zoekLichtRegels.every((r) =>
        r.selectors.every((tak) => tak.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ) &&
      fotoLichtRegels.length === 2 &&
      fotoLichtRegels[0].selectors.length === 2 &&
      fotoLichtRegels.every((r) =>
        r.selectors.every((tak) => tak.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ) &&
      fotoOudeFlatRegels.length === 3 &&
      fotoOudeFlatRegels.every((r) =>
        r.selectors.every((tak) => tak.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ),
  );

  // 2. Компактні однорядкові внутрішні шапки .zk-kop та .foto-kop без кольорових прожекторів і ореолів.
  const zkKopRegel = zoekRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .zk-kop'),
  );
  const fotoKopRegel = fotoRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .foto-kop'),
  );
  const zkKopMap = new Map((zkKopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const fotoKopMap = new Map((fotoKopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  check(
    'внутрішні шапки .zk-kop (14px 18px) та .foto-kop (12px 16px) стиснені до охайних робочих блоків на var(--mq-oppervlak) без градієнтів і ореолів',
    zkKopMap.get('padding') === '14px 18px' &&
      zkKopMap.get('border-radius') === '16px' &&
      zkKopMap.get('background') === 'var(--mq-oppervlak)' &&
      zkKopMap.get('background-image') === 'none' &&
      zkKopMap.get('box-shadow') === 'var(--mq-schaduw-zacht)' &&
      zoekKlassiekPc.includes('.zk-kop-tekst > div') &&
      fotoKopMap.get('padding') === '12px 16px' &&
      fotoKopMap.get('border-radius') === '16px' &&
      fotoKopMap.get('background') === 'var(--mq-oppervlak)' &&
      fotoKopMap.get('background-image') === 'none' &&
      fotoKopMap.get('box-shadow') === 'var(--mq-schaduw-zacht)' &&
      fotoKlassiekPc.includes('filter: none;'),
  );

  // 3. Монохромні медальйони джерел .zk-kaart.bron-* .zk-kaart-ic та спокійне монохромне виділення збігів <mark>.
  const markRegel = zoekRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .zk-pagina mark') &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .zk-uitklap mark'),
  );
  const markMap = new Map((markRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  check(
    'медальйони джерел .zk-kaart.bron-* .zk-kaart-ic переведені на монохромний var(--mq-oppervlak-2) / var(--mq-rand) / var(--mq-tekst) з кутами 11px, а підсвічування <mark> має спокійне монохромне тло з тонкою рамкою',
    zoekKlassiekPc.includes('.zk-kaart[class*="bron-"] .zk-kaart-ic') &&
      zoekKlassiekPc.includes('.bron-mail') &&
      zoekKlassiekPc.includes('.bron-agenda') &&
      zoekKlassiekPc.includes('.bron-bord') &&
      zoekKlassiekPc.includes('.bron-github') &&
      zoekKlassiekPc.includes('.zk-groep-sectie[class*="cat-"] .zk-groep-ic') &&
      zoekKlassiekPc.includes('.zk-kaart-ic:is(.is-afzender, .is-merk)') &&
      markMap.get('background') === 'var(--mq-oppervlak-hover)' &&
      markMap.get('color') === 'var(--mq-tekst)' &&
      markMap.get('box-shadow') === 'inset 0 0 0 1px var(--mq-rand-sterk)',
  );

  // 4. Матові поверхні карток, фільтрів, порожніх станів і накладних вікон пошуку (16px, без градієнтів, розмиття і стрибків).
  check(
    'усі картки пошуку (.zk-kaart, .zk-paneel.kaart, .zk-recent.kaart, .zk-wat, .zk-bronnen, .zk-weg, .zk-gesloten-groep, .zk-dym, .zk-niets, .zk-tip, .zk-pop, .venster.zk-iv) є матовими з кутами 16px без градієнтів, розмиття та зсувів',
    zoekKlassiekPc.includes('.zk-kaart') &&
      zoekKlassiekPc.includes('.zk-paneel.kaart') &&
      zoekKlassiekPc.includes('.zk-recent.kaart') &&
      zoekKlassiekPc.includes('.zk-wat') &&
      zoekKlassiekPc.includes('.zk-bronnen') &&
      zoekKlassiekPc.includes('.zk-niets') &&
      zoekKlassiekPc.includes('.zk-tip') &&
      zoekKlassiekPc.includes('.venster.zk-iv') &&
      zoekKlassiekPc.includes('border-radius: 16px;') &&
      zoekKlassiekPc.includes('background: var(--mq-oppervlak);') &&
      zoekKlassiekPc.includes('background: var(--mq-oppervlak-2);') &&
      zoekKlassiekPc.includes('background-image: none;') &&
      zoekKlassiekPc.includes('backdrop-filter: none;') &&
      zoekKlassiekPc.includes('transform: none;') &&
      !/linear-gradient|radial-gradient/i.test(zoekKlassiekPc) &&
      !/translateY|scale\(/i.test(zoekKlassiekPc),
  );

  // 5. Матові поверхні альбомів .foto-album, груп джерел .foto-bron-groep, карток світлин .foto-tegel та порожніх станів .foto-leeg (16px).
  check(
    'альбоми .foto-album, групи джерел .foto-bron-groep, картки джерел .foto-bron, фільтри .foto-filters, картки світлин .foto-tegel та порожні стани .foto-leeg мають матові поверхні 16px без градієнтів, розмиття і збільшення при наведенні',
    fotoKlassiekPc.includes('.foto-album') &&
      fotoKlassiekPc.includes('.foto-bron-groep') &&
      fotoKlassiekPc.includes('.foto-bron') &&
      fotoKlassiekPc.includes('.foto-filters') &&
      fotoKlassiekPc.includes('.foto-tegel') &&
      fotoKlassiekPc.includes('.foto-leeg') &&
      fotoKlassiekPc.includes('.foto-tegel:hover .foto-mini img') &&
      fotoKlassiekPc.includes('border-radius: 16px;') &&
      fotoKlassiekPc.includes('background: var(--mq-oppervlak);') &&
      fotoKlassiekPc.includes('background: var(--mq-oppervlak-2);') &&
      fotoKlassiekPc.includes('background-image: none;') &&
      fotoKlassiekPc.includes('backdrop-filter: none;') &&
      fotoKlassiekPc.includes('transform: none;') &&
      !/linear-gradient|radial-gradient/i.test(fotoKlassiekPc) &&
      !/translateY|scale\(/i.test(fotoKlassiekPc),
  );

  // 6. Правила специфічності :not(#_mqk) проти flat-content (0, 19, 0) в обох файлах без padding і gap.
  const alleMqkRegels = [
    ...zoekRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)'))),
    ...fotoRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)'))),
  ];
  const zoekMqkAantal = zoekRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)'))).length;
  const fotoMqkAantal = fotoRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)'))).length;
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = alleMqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'окремі правила з html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) в обох файлах перемагають flat-content (0, 19, 0) і містять винятково border, border-inline, border-radius: 16px та box-shadow без padding і gap',
    zoekMqkAantal >= 3 &&
      fotoMqkAantal >= 3 &&
      alleMqkRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')),
      ) &&
      alleMqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px')) &&
      alleMqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-inline')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 7. Заокруглення 11px для кнопок, перемикачів джерел, сегментів та полів вводу зі збереженням відступу під піктограму лупи.
  const zkBoxInputRegel = zoekRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .zk-box input'),
  );
  const zkGrootInputRegel = zoekRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .zk-veld.is-groot .zk-box input'),
  );
  const zkBoxInputMap = new Map((zkBoxInputRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const zkGrootInputMap = new Map((zkGrootInputRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  check(
    'кнопки, перемикачі джерел пошуку, сегменти альбомів/стрічки та поля вводу мають border-radius: 11px, а поля пошуку .zk-box input (40px / 46px) та .foto .foto-zoek input зберігають відступ під лупу і прозору будову',
    zoekKlassiekPc.includes('.zk-tab') &&
      zoekKlassiekPc.includes('.zk-weergave-knoppen') &&
      zoekKlassiekPc.includes('.zk-box') &&
      zoekKlassiekPc.includes('border-radius: 11px;') &&
      zkBoxInputMap.get('border') === '0' &&
      zkBoxInputMap.get('background') === 'transparent' &&
      zkBoxInputMap.get('padding') === '8px 10px 8px 40px' &&
      zkGrootInputMap.get('padding') === '9px 12px 9px 46px' &&
      fotoKlassiekPc.includes('.foto-segment') &&
      fotoKlassiekPc.includes('.foto-segment button') &&
      fotoKlassiekPc.includes('.foto-zoek') &&
      fotoKlassiekPc.includes('.foto .foto-zoek input') &&
      fotoKlassiekPc.includes('border-radius: 11px;'),
  );

  // 8. Суцільні головні кнопки дії на var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без сирого білого кольору.
  const fotoHoofdKnopRegel = fotoRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .foto .foto-knop.is-hoofd'),
  );
  const fotoHoofdMap = new Map((fotoHoofdKnopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  check(
    'головні кнопки дії (.zk-go, .zk-tab.is-aan, .knop-primair, .foto-knop.is-hoofd, .foto-segment button.is-actief) використовують суцільні var(--mq-knop-primair-bg) і var(--mq-knop-primair-tekst) без сирого білого кольору',
    zoekKlassiekPc.includes('.zk-go') &&
      zoekKlassiekPc.includes('.zk-tab.is-aan') &&
      zoekKlassiekPc.includes('background: var(--mq-knop-primair-bg);') &&
      zoekKlassiekPc.includes('color: var(--mq-knop-primair-tekst);') &&
      fotoHoofdMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      fotoHoofdMap.get('background-image') === 'none' &&
      fotoHoofdMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      fotoHoofdMap.get('border-radius') === '11px' &&
      !/#fff\b|#ffffff\b|(?<![\w-])white(?![\w-])/i.test(zoekZonderCommentaar) &&
      !/#fff\b|#ffffff\b|(?<![\w-])white(?![\w-])/i.test(fotoZonderCommentaar),
  );

  // 9. Контраст накладних підписів та значків поверх мініатюр світлин і на темній сцені .foto-viewer в обох класичних палітрах.
  const bijschriftRegel = fotoRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] .foto-tegel>.foto-tegel-open[data-foto-bijschrift]::after',
      ),
  );
  const viewerRegel = fotoRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .foto-viewer'),
  );
  const viewerBalkRegel = fotoRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .foto-viewer-balk'),
  );
  const viewerKnopRegel = fotoRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .foto-viewer-balk .foto-knop'),
  );
  const viewerPijlRegel = fotoRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .foto-viewer .foto-pijl'),
  );
  const bijschriftMap = new Map((bijschriftRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const viewerMap = new Map((viewerRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const viewerBalkMap = new Map((viewerBalkRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const viewerKnopMap = new Map((viewerKnopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const viewerPijlMap = new Map((viewerPijlRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const contrastOpDonkereScene = contrastVerhouding('#0c0e12', '#f3f4f6');
  check(
    'накладні підписи й значки поверх мініатюр та темна сцена переглядача .foto-viewer мають непрозору темну підкладку rgba(12, 14, 18, 0.84) / #0c0e12 і світлий текст #f3f4f6 (контраст > 15:1) в обох класичних палітрах без витоку --mq-held-tekst чи --mq-nacht-accent',
    bijschriftMap.get('background') === 'rgba(12, 14, 18, 0.84)' &&
      bijschriftMap.get('color') === '#f3f4f6' &&
      viewerMap.get('background') === '#0c0e12' &&
      viewerMap.get('color') === '#f3f4f6' &&
      viewerBalkMap.get('background') === 'rgba(12, 14, 18, 0.84)' &&
      viewerBalkMap.get('color') === '#f3f4f6' &&
      viewerKnopMap.get('background') === 'rgba(12, 14, 18, 0.84)' &&
      viewerKnopMap.get('color') === '#f3f4f6' &&
      viewerPijlMap.get('background') === 'rgba(12, 14, 18, 0.84)' &&
      viewerPijlMap.get('color') === '#f3f4f6' &&
      fotoKlassiekPc.includes('.foto-tegel-hart') &&
      fotoKlassiekPc.includes('.foto-tegel-video') &&
      fotoKlassiekPc.includes('.foto-tegel-kies') &&
      fotoKlassiekPc.includes('.foto-album-meer summary') &&
      fotoKlassiekPc.includes('.foto-orde-beelden small') &&
      fotoKlassiekPc.includes('.foto-viewer-titel') &&
      fotoKlassiekPc.includes('.foto-viewer .foto-spinner') &&
      !fotoKlassiekPc.includes('--mq-held-tekst') &&
      !fotoKlassiekPc.includes('--mq-nacht-accent') &&
      contrastOpDonkereScene > 15,
    `contrast=${contrastOpDonkereScene.toFixed(2)}`,
  );

  // 10. Контраст бічної інформаційної панелі .foto-viewer .foto-info у Білій класиці та в Чорній класиці.
  const fotoInfoRegel = fotoRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .foto-viewer .foto-info'),
  );
  const fotoInfoKnopRegel = fotoRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .foto-viewer .foto-info .foto-knop'),
  );
  const fotoInfoHoofdRegel = fotoRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] .foto-viewer .foto-info .foto-knop.is-hoofd',
      ),
  );
  const fotoInfoMap = new Map((fotoInfoRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const fotoInfoKnopMap = new Map((fotoInfoKnopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const fotoInfoHoofdMap = new Map((fotoInfoHoofdRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const contrastInfoWit = contrastVerhouding('#ffffff', '#111418');
  const contrastInfoZwart = contrastVerhouding('#14171d', '#f3f4f6');
  check(
    'бічна інформаційна панель .foto-viewer .foto-info використовує матову поверхню var(--mq-oppervlak) з текстом var(--mq-tekst) і контрастними кнопками в обох класичних палітрах (контраст > 15:1)',
    fotoInfoMap.get('background') === 'var(--mq-oppervlak)' &&
      fotoInfoMap.get('background-image') === 'none' &&
      fotoInfoMap.get('color') === 'var(--mq-tekst)' &&
      fotoInfoMap.get('backdrop-filter') === 'none' &&
      fotoInfoKnopMap.get('background') === 'var(--mq-oppervlak-2)' &&
      fotoInfoKnopMap.get('color') === 'var(--mq-tekst)' &&
      fotoInfoHoofdMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      fotoInfoHoofdMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      maquetteKlassiekCss.includes('--mq-oppervlak: #ffffff;') &&
      maquetteKlassiekCss.includes('--mq-tekst: #111418;') &&
      maquetteKlassiekCss.includes('--mq-oppervlak: #14171d;') &&
      maquetteKlassiekCss.includes('--mq-tekst: #f3f4f6;') &&
      contrastInfoWit > 15 &&
      contrastInfoZwart > 15,
  );

  // 11. Ділова типографіка h1..h4, табличні цифри tabular-nums та непорушна дисципліна каскаду @media.
  const zoekBuitenMedia = inhoudBuitenMediaBlokken(zoekCss, zoekIdxEersteMedia);
  const fotoBuitenMedia = inhoudBuitenMediaBlokken(fotoCss, fotoIdxEersteMedia);
  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };
  const zkKaartSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .zk-kaart';
  const fotoKopSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .foto-kop';
  const fotoInfoSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .foto-viewer .foto-info';
  check(
    'заголовки h1..h4 використовують var(--mq-font-ui) без курсиву, лічильники й дати мають tabular-nums, класичні розділи стоять суворо перед @media, нуль заборонених CSS-конструкцій, а мобільні значення перемагають на вузькому екрані',
    zoekKlassiekPc.includes(':is(h1, h2, h3, h4)') &&
      zoekKlassiekPc.includes('font-family: var(--mq-font-ui);') &&
      zoekKlassiekPc.includes('font-style: normal;') &&
      zoekKlassiekPc.includes('font-variant-numeric: tabular-nums;') &&
      fotoKlassiekPc.includes(':is(h1, h2, h3, h4)') &&
      fotoKlassiekPc.includes('font-family: var(--mq-font-ui);') &&
      fotoKlassiekPc.includes('font-style: normal;') &&
      fotoKlassiekPc.includes('font-variant-numeric: tabular-nums;') &&
      !/!\s*important/i.test(zoekCss) &&
      !/!\s*important/i.test(fotoCss) &&
      !/prefers-color-scheme/i.test(zoekCss) &&
      !/prefers-color-scheme/i.test(fotoCss) &&
      !/position\s*:\s*fixed/i.test(zoekCss) &&
      !/position\s*:\s*fixed/i.test(fotoCss) &&
      zoekIdxKlassiek > 0 &&
      zoekIdxMaxWidth > zoekIdxKlassiek &&
      zoekBuitenMedia === '' &&
      fotoIdxKlassiek > 0 &&
      fotoIdxMaxWidth > fotoIdxKlassiek &&
      fotoBuitenMedia === '' &&
      wint(zoekRegels, zkKaartSel, 'padding', pcProfiel)?.waarde === '14px 16px' &&
      wint(zoekRegels, zkKaartSel, 'padding', telProfiel)?.waarde === '12px 14px' &&
      wint(fotoRegels, fotoKopSel, 'padding', pcProfiel)?.waarde === '12px 16px' &&
      wint(fotoRegels, fotoKopSel, 'padding', telProfiel)?.waarde === '10px 12px' &&
      wint(fotoRegels, fotoInfoSel, 'border-radius', telProfiel)?.waarde === '16px 16px 0 0',
  );

  // 12. Абсолютна мовна чистота у всіх редагованих та створеному файлах контуру KLASSIEK-005C.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    ['src/zoek/zoek-maquette.css', zoekCss],
    ['src/foto/foto-maquette.css', fotoCss],
    ['tests/eenheid/klassiek-005c-zoek-foto.test.ts', zelfTest],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  check(
    'жоден файл контуру KLASSIEK-005C не містить заборонених символів російської абетки',
    taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
