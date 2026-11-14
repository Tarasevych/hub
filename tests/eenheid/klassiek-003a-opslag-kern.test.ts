// KLASSIEK-003A (Хвиля 2 тем оформлення «Біла класика» та «Чорна класика» для хмарного сховища):
// перевірка відсікання морського лазуриту від класичних тем, прагматичної робочої щільності ядра сховища,
// матових карток і провідника файлів (16px / 11px), беззасічкової типографіки, табличних цифр та дисципліни каскаду.
// Eenheidstest voor de klassieke kernopmaak van de bestandsopslag (KLASSIEK-003A).

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
      const match = rest.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*@media\s*\(\s*max-width[^)]*\)\s*\{/);
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
  const { check, einde } = checker('klassiek-003a-opslag-kern');

  const opslagCss = readFileSync('src/cloud-vnext/cloud-kern-maquette.css', 'utf8');
  const maquetteKlassiekCss = readFileSync('src/maquette-kern/maquette-klassiek.css', 'utf8');
  const paginaTsx = readFileSync('src/cloud-vnext/CloudPagina.tsx', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-003a-opslag-kern.test.ts', 'utf8');

  const zonderCommentaar = opslagCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const idxKlassiekSectie = opslagCss.indexOf('8. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ');
  const idxEersteMedia = opslagCss.search(/@media\s*\(\s*max-width/);
  const klassiekNaastPc =
    idxKlassiekSectie > 0 && idxEersteMedia > idxKlassiekSectie
      ? opslagCss.slice(idxKlassiekSectie, idxEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  // 1. Відсікання студійного морського лазуриту (12, 108, 144) від класичних тем на всіх гілках світлого блока.
  const regels = leesCss(opslagCss);
  const lazuurRegel = regels.find((r) =>
    r.decls.some((d) => d.eig === '--mq-accent-rgb' && d.waarde === '12, 108, 144'),
  );
  const lazuurTakken = lazuurRegel ? lazuurRegel.selectors : [];
  check(
    'студійний блок морського лазуриту (12, 108, 144) відсічено від Класики на кожній гілці через :not([data-maquette-stijl="klassiek"]), зберігаючи антрацит #181c24 у Білій класиці',
    lazuurTakken.length === 3 &&
      lazuurTakken.every((tak) => tak.includes('html.palet-maquette:not([data-maquette-stijl="klassiek"])')) &&
      zonderCommentaar.includes(
        'html.palet-maquette:not([data-maquette-stijl="klassiek"]):not(.theme-light):not(.theme-plum-light) .cvn-laag.theme-light',
      ) &&
      zonderCommentaar.includes('html.palet-maquette:not([data-maquette-stijl="klassiek"]) .cvn-laag.theme-light') &&
      maquetteKlassiekCss.includes('--mq-kl-wit-accent: #181c24;'),
    lazuurTakken.join(' | '),
  );

  // 2. Оболонка .cvn.mq-schil і портальний шар .cvn-laag: робоча щільність gap: 14px, чисте тло без ореолів і безпечна шапка вікна.
  check(
    'класичний розділ задає для .cvn.mq-schil і .cvn-laag робочу щільність gap: 14px, завісу var(--mq-sluier-glas), background-image: none та шапку .cvn-laag-kop із правим відступом <= 24px',
    klassiekNaastPc.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .cvn.mq-schil') &&
      klassiekNaastPc.includes('gap: 14px;') &&
      klassiekNaastPc.includes('background-image: none;') &&
      klassiekNaastPc.includes('background-color: var(--mq-sluier-glas);') &&
      /\.cvn-laag-kop\s*\{[^}]*padding:\s*14px\s+20px\s+12px;/.test(klassiekNaastPc),
  );

  // 3. Картки розділів .cvn-blok, плитки .cvn-tegel, порожні стани .cvn-leeg і черга передач .cvn-uploads.
  check(
    'картки .cvn-blok, .cvn-tegel, .cvn-uploads і порожні стани .cvn-leeg у Класиці мають плоскі поверхні var(--mq-oppervlak)/var(--mq-oppervlak-2), рамку 1px solid var(--mq-rand), тінь var(--mq-schaduw-zacht) і заокруглення 16px без градієнтів',
    klassiekNaastPc.includes('.cvn-blok') &&
      klassiekNaastPc.includes('.cvn-uploads') &&
      klassiekNaastPc.includes('.cvn-tegel') &&
      klassiekNaastPc.includes('.cvn-leeg') &&
      klassiekNaastPc.includes('background: var(--mq-oppervlak);') &&
      klassiekNaastPc.includes('background: var(--mq-oppervlak-2);') &&
      klassiekNaastPc.includes('border: 1px solid var(--mq-rand);') &&
      klassiekNaastPc.includes('box-shadow: var(--mq-schaduw-zacht);') &&
      klassiekNaastPc.includes('border-radius: var(--mq-straal-kaart, 16px);') &&
      !/linear-gradient|radial-gradient/i.test(klassiekNaastPc),
  );

  // 4. Провідник файлів, таблиці, простори, вхідний розбір і пошук: відсутність розмиття карток списку і стрибків transform.
  check(
    'провідник файлів (.cvn-werkbalk, .cvn-filters, .cvn-map, .cvn-kaart, .cvn-bestand, .cvn-tabel), простори (.cvn-ws-kaart), вхід (.cvn-postvak-rijen > li) і пошук (.cvn-zoek-rij) вимикають backdrop-filter і transform',
    klassiekNaastPc.includes('.cvn-werkbalk') &&
      klassiekNaastPc.includes('.cvn-filters') &&
      klassiekNaastPc.includes('.cvn-map, .cvn-kaart, .cvn-bestand') &&
      klassiekNaastPc.includes('.cvn-tabel') &&
      klassiekNaastPc.includes('.cvn-ws-kaart, .cvn-postvak-rijen > li, .cvn-zoek-rij') &&
      klassiekNaastPc.includes('backdrop-filter: none;') &&
      klassiekNaastPc.includes('transform: none;') &&
      !/translateY|scale\(/i.test(klassiekNaastPc),
  );

  // 5. Кнопки, вкладки відбору, перемикачі вигляду, хлібні крихти та поля введення з відступом під піктограму лупи.
  check(
    'кнопки .cvn-knop, .cvn-knop.is-klein, перемикачі [data-cvn-weergave], крихти .cvn-kruimel та поля введення мають заокруглення 11px і зберігають padding-left: 38px у .cvn-zoekveld input',
    klassiekNaastPc.includes('border-radius: var(--mq-straal-knop, 11px);') &&
      klassiekNaastPc.includes('.cvn-knop.is-klein') &&
      klassiekNaastPc.includes('[data-cvn-weergave]') &&
      klassiekNaastPc.includes('.cvn-kruimel') &&
      /\.cvn-zoekveld\s+input\s*\{[^}]*padding-left:\s*38px;/.test(klassiekNaastPc),
  );

  // 6. Головна кнопка дії .cvn-knop.is-hoofd: суцільний акцент без двоколірних градієнтів і без сирого білого кольору #fff.
  const hoofdKnopBlok = klassiekNaastPc.match(
    /html\.palet-maquette\[data-maquette-stijl="klassiek"\]\s*:is\(\.cvn\.mq-schil,\s*\.cvn-laag\)\s*\.cvn-knop\.is-hoofd\s*\{([^}]*)\}/,
  );
  const hoofdHoverBlok = klassiekNaastPc.match(
    /html\.palet-maquette\[data-maquette-stijl="klassiek"\]\s*:is\(\.cvn\.mq-schil,\s*\.cvn-laag\)\s*\.cvn-knop\.is-hoofd:hover:not\(:disabled\)\s*\{([^}]*)\}/,
  );
  check(
    'головна кнопка .cvn-knop.is-hoofd використовує var(--mq-knop-primair-bg) і var(--mq-knop-primair-tekst), box-shadow: none, transform: none, opacity: 0.92 при наведенні та не містить #fff',
    hoofdKnopBlok !== null &&
      hoofdHoverBlok !== null &&
      hoofdKnopBlok[1].includes('background: var(--mq-knop-primair-bg)') &&
      hoofdKnopBlok[1].includes('color: var(--mq-knop-primair-tekst)') &&
      hoofdKnopBlok[1].includes('border-color: var(--mq-knop-primair-bg)') &&
      hoofdKnopBlok[1].includes('box-shadow: none') &&
      hoofdKnopBlok[1].includes('transform: none') &&
      hoofdHoverBlok[1].includes('opacity: 0.92') &&
      hoofdHoverBlok[1].includes('transform: none') &&
      !/#fff\b|#ffffff\b|\bwhite\b/i.test(klassiekNaastPc),
  );

  // 7. Беззасічкова ділова типографіка заголовків h1–h4 та табличні цифри tabular-nums.
  check(
    'усі заголовки h1, h2, h3, h4 у Класиці використовують беззасічковий гротеск var(--mq-font-ui) без курсиву, а розміри байтів, лічильники, дати та відсотки — font-variant-numeric: tabular-nums',
    klassiekNaastPc.includes(':is(h1, h2, h3, h4)') &&
      klassiekNaastPc.includes('font-family: var(--mq-font-ui);') &&
      klassiekNaastPc.includes('font-style: normal;') &&
      klassiekNaastPc.includes('font-variant-numeric: tabular-nums;') &&
      klassiekNaastPc.includes('.cvn-tegel strong') &&
      klassiekNaastPc.includes('.cvn-balk-cijfer') &&
      klassiekNaastPc.includes('.cvn-kaart-meta') &&
      klassiekNaastPc.includes('.cvn-tabel td') &&
      klassiekNaastPc.includes('.cvn-upload-info') &&
      klassiekNaastPc.includes('.cvn-zoek-pct'),
  );

  // 8. Непорушні обмеження каскаду: відсутність !important, prefers-color-scheme, position: fixed та розташування настільних правил перед першим @media (max-width).
  const buitenMedia = inhoudBuitenMediaBlokken(opslagCss, idxEersteMedia);
  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };
  const blokSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .cvn.mq-schil .cvn-blok';
  check(
    'cloud-kern-maquette.css не містить !important, prefers-color-scheme чи position: fixed, усі настільні правила стоять перед першим @media (max-width), а мобільний каскад перемагає на вузькому екрані',
    !/!important/i.test(opslagCss) &&
      !/prefers-color-scheme/i.test(opslagCss) &&
      !/position\s*:\s*fixed/i.test(opslagCss) &&
      idxKlassiekSectie > 0 &&
      idxEersteMedia > idxKlassiekSectie &&
      buitenMedia === '' &&
      wint(regels, blokSel, 'padding', pcProfiel)?.waarde === '18px 20px' &&
      wint(regels, blokSel, 'padding', telProfiel)?.waarde === '14px 16px',
  );

  // 9. Мовна чистота та архітектурні межі CloudPagina.tsx.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    ['src/cloud-vnext/cloud-kern-maquette.css', opslagCss],
    ['src/cloud-vnext/CloudPagina.tsx', paginaTsx],
    ['tests/eenheid/klassiek-003a-opslag-kern.test.ts', zelfTest],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  check(
    'жоден файл контуру KLASSIEK-003A не містить заборонених символів російської абетки, а CloudPagina.tsx не імпортує src/merk',
    taalOvertredingen.length === 0 && !/from\s+['"][^'"]*merk['"]/.test(paginaTsx),
    taalOvertredingen.join(', '),
  );

  return einde();
}
