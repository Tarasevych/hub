// KLASSIEK-006C (Хвиля 5 тем оформлення «Біла класика» та «Чорна класика» для вільного полотна робочого столу Werkblad v3):
// перевірка нейтралізації кольорових градієнтних шпалер оболонки schil-achtergrond і столу зі збереженням власного зображення eigen,
// оформлення вільного полотна .wb3-houder / .wbc та тонкої монохромної сітки в режимі налаштування,
// елементів полотна .wbc-item, .wb3-widget, .wb3-tegel, .wb3-map-blok, ярликів .sc-tegel / .bib-tegel / .blk-tegel, тек .map-tegel,
// ручок зміни розміру .wbc-greep і панелей дій, панелей .wb3-instellingen, .wb3-bibliotheek, .bib-paneel, .eig-paneel,
// діалогу вибору блока .wb-plekkiezer, повідомлень .wb3-bevestig / .wb3-melding, радіусів 16px / 11px,
// суцільних головних кнопок без #fff, табличних цифр tabular-nums та каскадної і мовної дисципліни.
// Eenheidstest voor het vrije canvas Werkblad v3 en neutralisatie van schil-achtergrond in klassieke thema's (KLASSIEK-006C).

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
  const { check, einde } = checker('klassiek-006c-werkblad');

  const wbCss = readFileSync('src/werkblad/werkblad-maquette.css', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-006c-werkblad.test.ts', 'utf8');
  const wbZonderCommentaar = wbCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const idxWbKlassiek = wbCss.indexOf('7. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-005A)');
  const idxWbEersteMedia = wbCss.search(/@media\s*\(\s*max-width/);
  const wbKlassiekPc =
    idxWbKlassiek > 0 && idxWbEersteMedia > idxWbKlassiek
      ? wbCss.slice(idxWbKlassiek, idxWbEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const wbRegels = leesCss(wbCss);
  const vindRegel = (sel: string, metEig?: string) =>
    wbRegels.find(
      (r) =>
        r.media.length === 0 &&
        r.selectors.includes(sel) &&
        (!metEig || r.decls.some((d) => d.eig === metEig)),
    );
  const eigMap = (sel: string, metEig?: string) =>
    new Map((vindRegel(sel, metEig)?.decls ?? []).map((d) => [d.eig, d.waarde]));

  // 1. Нейтралізація градієнтних шпалер оболонки schil-achtergrond і столу в класиці зі збереженням власного фото eigen.
  const schilSel =
    'html.palet-maquette[data-maquette-stijl="klassiek"] .canonical-chrome.schil-achtergrond[data-achtergrond]:not([data-achtergrond="eigen"])';
  const schilVoorSel = `${schilSel}::before`;
  const wbAchtergrondVoorSel =
    'html.palet-maquette[data-maquette-stijl="klassiek"] section.werkblad[class*="wb-achtergrond-"]:not(.wb-achtergrond-eigen)::before';
  const schilMap = eigMap(schilSel, '--pagina-verloop');
  const schilVoorMap = eigMap(schilVoorSel, 'background');
  const wbAchtergrondVoorMap = eigMap(wbAchtergrondVoorSel, 'opacity');
  const eigenGeblokkeerd = wbRegels.some(
    (r) =>
      r.selectors.some(
        (s) =>
          (s.includes('[data-achtergrond="eigen"]') && !s.includes(':not([data-achtergrond="eigen"])')) ||
          (s.includes('.wb-achtergrond-eigen::before') && !s.includes(':not(.wb-achtergrond-eigen)::before')),
      ) && r.decls.some((d) => d.eig === '--pagina-verloop' || (d.eig === 'opacity' && d.waarde === '0')),
  );

  check(
    'градієнтні шпалери оболонки .canonical-chrome.schil-achtergrond[data-achtergrond]:not([data-achtergrond="eigen"]) та section.werkblad[class*="wb-achtergrond-"]:not(.wb-achtergrond-eigen)::before нейтралізовані на var(--mq-bg), а власне зображення eigen збережене',
    schilMap.get('--pagina-verloop') === 'none' &&
      schilMap.get('--achtergrond-sluier') === 'transparent' &&
      schilMap.get('background-color') === 'var(--mq-bg)' &&
      schilVoorMap.get('background') === 'var(--mq-bg)' &&
      schilVoorMap.get('background-image') === 'none' &&
      wbAchtergrondVoorMap.get('background') === 'none' &&
      wbAchtergrondVoorMap.get('opacity') === '0' &&
      !eigenGeblokkeerd,
  );

  // 2. Вільне полотно .wb3-houder, .wbc та тонка монохромна сітка в режимі налаштування без кольорового світіння й розмиття.
  const houderMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wb3-houder');
  const wbcMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wbc', 'background-color');
  const wbcInstellenMap = eigMap(
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.is-instellen .wbc',
    'background-image',
  );
  const wbcBewerkenMap = eigMap(
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wbc.wbc-bewerken',
    'background-image',
  );

  check(
    'вільне полотно .wb3-houder та .wbc має матову основу var(--mq-bg), кути 16px, backdrop-filter: none і тонку монохромну сітку на var(--mq-rand) під час налаштування без кольорових ореолів',
    houderMap.get('border-radius') === '16px' &&
      houderMap.get('backdrop-filter') === 'none' &&
      houderMap.get('box-shadow') === 'none' &&
      wbcMap.get('border-radius') === '16px' &&
      wbcMap.get('background-color') === 'var(--mq-bg)' &&
      wbcMap.get('background-image') === 'none' &&
      wbcMap.get('backdrop-filter') === 'none' &&
      wbcInstellenMap.get('border-radius') === '16px' &&
      wbcInstellenMap.get('border') === '1px dashed var(--mq-rand-sterk)' &&
      wbcInstellenMap.get('background-color') === 'var(--mq-oppervlak-2)' &&
      (wbcInstellenMap.get('background-image') ?? '').includes('var(--mq-rand)') &&
      wbcInstellenMap.get('backdrop-filter') === 'none' &&
      wbcInstellenMap.get('box-shadow') === 'none' &&
      wbcBewerkenMap.get('background-image') === wbcInstellenMap.get('background-image'),
  );

  // 3. Елементи полотна .wbc-item, ручки зміни розміру .wbc-greep, тінь перетягування .wbc-geest і панелі дій у режимі налаштування.
  const wbcItemMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wbc-item', 'border-radius');
  const wbcGreepMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wbc-greep');
  const wbcGeestMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wbc-geest');
  const vakBalkMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .blk-vak-balk');
  const werkbalkMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .blk-werkbalk');
  const wbcMenuMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wbc-menu');

  check(
    'елементи .wbc-item, ручки .wbc-greep, контур перетягування .wbc-geest та панелі дій (.blk-vak-balk, .blk-werkbalk, .wbc-menu) оформлені на матових поверхнях без розмиття',
    wbcItemMap.get('border-radius') === '16px' &&
      wbcItemMap.get('backdrop-filter') === 'none' &&
      wbcGreepMap.get('border') === '2px solid var(--mq-accent)' &&
      wbcGreepMap.get('background') === 'var(--mq-oppervlak)' &&
      wbcGeestMap.get('border-radius') === '16px' &&
      wbcGeestMap.get('border') === '1px dashed var(--mq-accent)' &&
      wbcGeestMap.get('background') === 'var(--mq-oppervlak-hover)' &&
      wbcGeestMap.get('backdrop-filter') === 'none' &&
      vakBalkMap.get('border-radius') === '11px' &&
      vakBalkMap.get('border') === '1px solid var(--mq-rand)' &&
      vakBalkMap.get('background') === 'var(--mq-oppervlak)' &&
      vakBalkMap.get('backdrop-filter') === 'none' &&
      werkbalkMap.get('border-radius') === '11px' &&
      werkbalkMap.get('border') === '1px solid var(--mq-rand)' &&
      wbcMenuMap.get('border-radius') === '16px' &&
      wbcMenuMap.get('background') === 'var(--mq-oppervlak)' &&
      wbcMenuMap.get('backdrop-filter') === 'none',
  );

  // 4. Картки віджетів, тек та блоків на вільному полотні (.wb3-widget.is-kaart, .wb3-map-blok, .map-tegel, .bib-map>.bib-tegel, .blk-blok) — 16px.
  const kaartSels = [
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wb3-widget.is-kaart',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wb3-map-blok',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .map-tegel',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .bib-map>.bib-tegel',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .blk-blok',
  ];
  const kaartenOk = kaartSels.every((sel) => {
    const m = eigMap(sel, 'background');
    return (
      m.get('border-radius') === '16px' &&
      m.get('border') === '1px solid var(--mq-rand)' &&
      m.get('background') === 'var(--mq-oppervlak)' &&
      m.get('background-image') === 'none' &&
      m.get('backdrop-filter') === 'none'
    );
  });
  const kaalMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wb3-widget.is-kaal');

  check(
    'віджети-картки .wb3-widget.is-kaart, теки .wb3-map-blok / .map-tegel / .bib-map>.bib-tegel і блоки .blk-blok мають матове тло var(--mq-oppervlak), рамку 1px solid var(--mq-rand), кути 16px і вимкнене розмиття',
    kaartenOk && kaalMap.get('background') === 'transparent' && kaalMap.get('backdrop-filter') === 'none',
  );

  // 5. Ярлики на вільному полотні (.sc-tegel, .bib-tegel, .blk-tegel, .wb3-tegel) — матові картки 11px і спокійні монохромні значки.
  const snelkoppelingSels = [
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .sc-tegel',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .bib-tegel',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .blk-tegel',
  ];
  const snelkoppelingenOk = snelkoppelingSels.every((sel) => {
    const m = eigMap(sel, 'background');
    return (
      m.get('border-radius') === '11px' &&
      m.get('border') === '1px solid var(--mq-rand)' &&
      m.get('background') === 'var(--mq-oppervlak)' &&
      m.get('background-image') === 'none' &&
      m.get('backdrop-filter') === 'none'
    );
  });
  const shortcutItemMap = eigMap(
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wbc-item[data-kind="shortcut"]',
  );
  const wb3TegelMap = eigMap(
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wb3-tegel:not(.wb3-map-blok)',
  );
  const bibTegelIcoonMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .bib-tegel-icoon');

  check(
    'ярлики .sc-tegel, .bib-tegel, .blk-tegel та .wb3-tegel мають матові картки var(--mq-oppervlak) з кутами 11px, рамкою 1px solid var(--mq-rand) та спокійними значками .bib-tegel-icoon без кольорового сяйва',
    snelkoppelingenOk &&
      shortcutItemMap.get('border-radius') === '11px' &&
      wb3TegelMap.get('backdrop-filter') === 'none' &&
      bibTegelIcoonMap.get('border-radius') === '11px' &&
      bibTegelIcoonMap.get('background') === 'var(--mq-oppervlak-2)' &&
      bibTegelIcoonMap.get('color') === 'var(--mq-tekst)' &&
      bibTegelIcoonMap.get('box-shadow') === 'none',
  );

  // 6. Панелі налаштувань, бібліотеки та повідомлень (.wb3-instellingen, .wb3-bibliotheek, .bib-paneel, .wb3-bevestig, .wb3-melding).
  const paneelSels = [
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wb3-instellingen',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wb3-bibliotheek',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .bib-paneel',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wb3-bevestig',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad .wb3-melding',
  ];
  const panelenOk = paneelSels.every((sel) => {
    const m = eigMap(sel, 'background');
    return (
      m.get('border-radius') === '16px' &&
      m.get('border') === '1px solid var(--mq-rand)' &&
      m.get('background') === 'var(--mq-oppervlak)' &&
      m.get('background-image') === 'none' &&
      m.get('backdrop-filter') === 'none'
    );
  });
  const bibZoekMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .bib-zoek');
  const bibChipMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .bib-chip', 'background');

  check(
    'панелі .wb3-instellingen, .wb3-bibliotheek, .bib-paneel, .wb3-bevestig і .wb3-melding матові з кутами 16px, а поле пошуку .bib-zoek і вкладки фільтрів .bib-chip мають кути 11px',
    panelenOk &&
      bibZoekMap.get('border-radius') === '11px' &&
      bibZoekMap.get('background') === 'var(--mq-oppervlak)' &&
      bibChipMap.get('background') === 'var(--mq-oppervlak-2)' &&
      wbKlassiekPc.includes(':where(.bib-chip, .bib-knop, .bib-ikoonknop, .bib-icoonkeuze, .bib-map-uit)'),
  );

  // 7. Бічна панель властивостей блока .eig-paneel (та .blk-zijpaneel) і правило відступу шапки <= 20px.
  const eigPaneelMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .eig-paneel', 'background');
  const blkZijpaneelMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .blk-zijpaneel', 'background');
  const eigKopMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .eig-paneel .eig-kop');
  const eigTabsMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .eig-paneel .eig-tabs');
  const eigVoorbeeldMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .eig-paneel .eig-voorbeeld');
  const eigKopPaddingDelen = (eigKopMap.get('padding') ?? '').split(/\s+/);
  const eigKopRechtsPx = Number.parseFloat(eigKopPaddingDelen[1] ?? '999');

  check(
    'бічна панель властивостей .eig-paneel та .blk-zijpaneel має матове тло var(--mq-oppervlak), кути 16px, backdrop-filter: none, вкладки 11px і шапку .eig-kop із правим відступом <= 20px',
    eigPaneelMap.get('border-radius') === '16px' &&
      eigPaneelMap.get('border') === '1px solid var(--mq-rand)' &&
      eigPaneelMap.get('background') === 'var(--mq-oppervlak)' &&
      eigPaneelMap.get('backdrop-filter') === 'none' &&
      blkZijpaneelMap.get('border-radius') === '16px' &&
      blkZijpaneelMap.get('background') === 'var(--mq-oppervlak)' &&
      blkZijpaneelMap.get('backdrop-filter') === 'none' &&
      eigKopMap.get('display') === 'grid' &&
      eigKopRechtsPx <= 20 &&
      eigTabsMap.get('border-radius') === '11px' &&
      eigVoorbeeldMap.get('border-radius') === '16px',
  );

  // 8. Діалог вибору блока .wb-plekkiezer та суцільні акцентні кнопки дії без градієнтів і без #fff.
  const plekkiezerMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .wb-plekkiezer', 'background');
  const plekkiezerRijMap = eigMap('html.palet-maquette[data-maquette-stijl="klassiek"] .wb-plekkiezer .wb-plekkiezer-lijst>li');
  const primairSels = [
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .bib-knop.bib-primair',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .eig-paneel .eig-hoofd',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .wb-plekkiezer .wb-plekkiezer-knoppen button.hoofd',
  ];
  const primairOk = primairSels.every((sel) => {
    const m = eigMap(sel, 'background');
    return (
      m.get('border-radius') === '11px' &&
      m.get('background') === 'var(--mq-knop-primair-bg)' &&
      m.get('background-image') === 'none' &&
      m.get('color') === 'var(--mq-knop-primair-tekst)' &&
      m.get('box-shadow') === 'none'
    );
  });

  check(
    'діалог вибору блока .wb-plekkiezer матовий із кутами 16px, позиції списку 11px, а головні кнопки (.bib-primair, .eig-hoofd, .wb-plekkiezer button.hoofd) мають суцільне var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без #fff',
    plekkiezerMap.get('border-radius') === '16px' &&
      plekkiezerMap.get('background') === 'var(--mq-oppervlak)' &&
      plekkiezerMap.get('backdrop-filter') === 'none' &&
      plekkiezerRijMap.get('border-radius') === '11px' &&
      primairOk &&
      !/#fff\b|#ffffff\b|\bwhite\b/i.test(wbZonderCommentaar),
  );

  // 9. Табличні цифри font-variant-numeric: tabular-nums на всіх розмірах блока, одиницях виміру та лічильниках бібліотеки й полотна.
  const tabulaireSels = [
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .bib-aantal',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .bib-badge',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wbc-status',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .eig-paneel .eig-getal input',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .eig-paneel .eig-eenheid',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .eig-paneel .eig-maat',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .eig-paneel .eig-grenzen',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .eig-paneel .eig-hex',
    'html.palet-maquette[data-maquette-stijl="klassiek"] .eig-paneel .eig-contrast',
  ];
  const tabulairOk = tabulaireSels.every(
    (sel) => eigMap(sel, 'font-variant-numeric').get('font-variant-numeric') === 'tabular-nums',
  );

  check(
    'усі розміри блока, межі, коди кольорів та лічильники вільного полотна й бібліотеки мають font-variant-numeric: tabular-nums',
    tabulairOk,
  );

  // 10. Захист специфічності :not(#_mqk) проти flat-content (0, 19, 0) для карток і панелей Werkblad v3 суворо без padding і gap.
  const mqkRegels = wbRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = mqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  const verplichteMqkDoelen = [
    '.wb3-instellingen',
    '.wb3-bibliotheek',
    '.wb3-widget.is-kaart',
    '.wb3-map-blok',
    '.map-tegel',
    '.bib-paneel',
    '.blk-blok',
    '.wb3-bevestig',
    '.wb3-melding',
  ];
  const alleMqkSelectors = mqkRegels.flatMap((r) => r.selectors).join(' ');

  check(
    'захист специфічності :not(#_mqk) охоплює картки й панелі Werkblad v3 та містить винятково border, border-inline, border-radius: 16px і box-shadow без жодного padding чи gap',
    mqkRegels.length >= 2 &&
      verplichteMqkDoelen.every((doel) => alleMqkSelectors.includes(doel)) &&
      mqkRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')),
      ) &&
      mqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 11. Каскадна дисципліна: нуль !important, prefers-color-scheme, position: fixed; усі настільні правила до першого @media; перемога мобільних відступів.
  const wbBuitenMedia = inhoudBuitenMediaBlokken(wbCss, idxWbEersteMedia);
  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };
  const wb3InstSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .werkblad.wb3 .wb3-instellingen';

  check(
    'таблиця стилів не містить !important, prefers-color-scheme чи position: fixed, усі настільні правила стоять перед першим @media, а мобільні відступи .wb3-instellingen перемагають на вузькому екрані',
    !/!\s*important/i.test(wbCss) &&
      !/prefers-color-scheme/i.test(wbCss) &&
      !/position\s*:\s*fixed/i.test(wbCss) &&
      idxWbKlassiek > 0 &&
      idxWbEersteMedia > idxWbKlassiek &&
      wbBuitenMedia === '' &&
      wint(wbRegels, wb3InstSel, 'padding', pcProfiel)?.waarde === '14px 16px' &&
      wint(wbRegels, wb3InstSel, 'padding', telProfiel)?.waarde === '12px 14px',
  );

  // 12. Абсолютна мовна чистота у зміненому файлі стилів та новому модульному тесті KLASSIEK-006C.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    ['src/werkblad/werkblad-maquette.css', wbCss],
    ['tests/eenheid/klassiek-006c-werkblad.test.ts', zelfTest],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);

  check(
    'жоден файл контуру KLASSIEK-006C не містить заборонених символів російської абетки',
    taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
