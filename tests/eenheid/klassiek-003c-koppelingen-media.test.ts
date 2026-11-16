// KLASSIEK-003C (Хвиля 2 тем оформлення «Біла класика» та «Чорна класика»):
// перевірка прагматичного матового оформлення зовнішніх сховищ, класичної хмари, провідника диска,
// календаря, світлин, центру підключень та універсального вікна перегляду файлів.
// Eenheidstest voor externe koppelingen, klassieke opslagweergave, agenda, beeldkeuze en het universele bestandsvenster.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

type StijlbladOntleding = {
  pad: string;
  inhoud: string;
  zonderCommentaar: string;
  eersteMaxMedia: number;
  desktopDeel: string;
  mobielDeel: string;
  klassiekStart: number;
  klassiekDesktop: string;
};

function ontleedStijlblad(pad: string): StijlbladOntleding {
  const inhoud = readFileSync(pad, 'utf8');
  const zonderCommentaar = inhoud.replace(/\/\*[\s\S]*?\*\//g, '');
  const eersteMaxMedia = zonderCommentaar.search(/@media\s*\(\s*max-width/);
  const desktopDeel = eersteMaxMedia >= 0 ? zonderCommentaar.slice(0, eersteMaxMedia) : zonderCommentaar;
  const mobielDeel = eersteMaxMedia >= 0 ? zonderCommentaar.slice(eersteMaxMedia) : '';
  const klassiekStart = desktopDeel.indexOf('html.palet-maquette[data-maquette-stijl="klassiek"]');
  const klassiekDesktop = klassiekStart >= 0 ? desktopDeel.slice(klassiekStart) : '';
  return {
    pad,
    inhoud,
    zonderCommentaar,
    eersteMaxMedia,
    desktopDeel,
    mobielDeel,
    klassiekStart,
    klassiekDesktop,
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-003c-koppelingen-media');

  const integraties = ontleedStijlblad('src/cloud-vnext/cloud-integraties-maquette.css');
  const klassiekOppervlak = ontleedStijlblad('src/cloud-klassiek-maquette.css');
  const universeelVenster = ontleedStijlblad('src/bestand/universeel-bestand-maquette.css');
  const alleDrie = [integraties, klassiekOppervlak, universeelVenster];

  // 1. Ізоляція студійних змінних та оголошення монохромних змінних класичних тем у всіх трьох таблицях стилів.
  check(
    'усі три таблиці стилів оголошують монохромні змінні для palet-klassiek-wit і palet-klassiek-zwart та ізолюють студійне прокидання тонів',
    integraties.desktopDeel.includes('html.palet-maquette:not([data-maquette-stijl="klassiek"]) body :is(.cvi, .cvi-laag)') &&
      integraties.desktopDeel.includes('html.palet-klassiek-wit[data-maquette-stijl="klassiek"] body :is(.cvi, .cvi-laag)') &&
      integraties.desktopDeel.includes('html.palet-klassiek-zwart[data-maquette-stijl="klassiek"] body :is(.cvi, .cvi-laag)') &&
      klassiekOppervlak.desktopDeel.includes('html.palet-maquette:not([data-maquette-stijl="klassiek"]) body :is(') &&
      klassiekOppervlak.desktopDeel.includes('html.palet-klassiek-wit[data-maquette-stijl="klassiek"] body :is(') &&
      klassiekOppervlak.desktopDeel.includes('html.palet-klassiek-zwart[data-maquette-stijl="klassiek"] body :is(') &&
      universeelVenster.desktopDeel.includes('html.palet-klassiek-wit[data-maquette-stijl="klassiek"] body .venster.universeel-bestand-venster') &&
      universeelVenster.desktopDeel.includes('html.palet-klassiek-zwart[data-maquette-stijl="klassiek"] body .venster.universeel-bestand-venster'),
  );

  // 2. Зовнішні сховища (.cvi, .cvi-laag): плоскі матові картки 16px без прожекторів, градієнтів і розмиття.
  check(
    'cloud-integraties-maquette.css оформлює картки постачальників, блоки section.cvn-blok.cvi, порожні стани, таблиці та вікно .cvi-laag матовими картками 16px без розмиття й градієнтів',
    integraties.klassiekStart > 0 &&
      integraties.klassiekDesktop.includes('section.cvn-blok.cvi') &&
      integraties.klassiekDesktop.includes('section.cvn-leeg.cvi') &&
      integraties.klassiekDesktop.includes('.cvi-kaart') &&
      integraties.klassiekDesktop.includes('[data-cvi-aanbieder="onedrive"]') &&
      integraties.klassiekDesktop.includes('[data-cvi-aanbieder="dropbox"]') &&
      integraties.klassiekDesktop.includes('.cvi-bestand') &&
      integraties.klassiekDesktop.includes('.cvi table') &&
      integraties.klassiekDesktop.includes('.cvi-laag .cvi-laag-vak') &&
      integraties.klassiekDesktop.includes('border-radius: 16px;') &&
      integraties.klassiekDesktop.includes('background: var(--mq-oppervlak);') &&
      integraties.klassiekDesktop.includes('border: 1px solid var(--mq-rand);') &&
      integraties.klassiekDesktop.includes('box-shadow: var(--mq-schaduw-zacht);') &&
      integraties.klassiekDesktop.includes('backdrop-filter: none;') &&
      !/linear-gradient|radial-gradient|blur\s*\(/i.test(integraties.klassiekDesktop),
  );

  // 3. Зовнішні сховища (.cvi, .cvi-laag): кнопки та поля 11px, суцільні головні кнопки, беззасічкові заголовки й табличні цифри.
  const heeftHoofdKnopIntegraties =
    /\.cvn-knop\.is-hoofd\s*\{\s*background:\s*var\(--mq-knop-primair-bg\);\s*color:\s*var\(--mq-knop-primair-tekst\);\s*border-color:\s*var\(--mq-knop-primair-bg\);\s*box-shadow:\s*none;\s*\}/.test(
      integraties.klassiekDesktop,
    );

  check(
    'cloud-integraties-maquette.css задає заокруглення 11px кнопкам і полям, суцільні головні кнопки .cvn-knop.is-hoofd, шрифт var(--mq-font-ui) і табличні цифри tabular-nums',
    heeftHoofdKnopIntegraties &&
      integraties.klassiekDesktop.includes('.cvn-knop') &&
      integraties.klassiekDesktop.includes('.cvi-zoek') &&
      integraties.klassiekDesktop.includes('.cvi-accountkeuze select') &&
      integraties.klassiekDesktop.includes('border-radius: 11px;') &&
      integraties.klassiekDesktop.includes('font-family: var(--mq-font-ui);') &&
      integraties.klassiekDesktop.includes('font-style: normal;') &&
      integraties.klassiekDesktop.includes('font-variant-numeric: tabular-nums;') &&
      !/--mq-accent-2[\s\S]{0,40}linear-gradient|rgba\(\s*var\(--mq-accent-rgb\)/i.test(integraties.klassiekDesktop),
  );

  // 4. Поверхні хмари (cloud-klassiek-maquette.css): охоплення всіх 11 груп класів матовими картками 16px без світлових плям.
  const vereisteOppervlakken = [
    '.cloud-functional',
    '.cloud-functional-loading',
    '.drive-browser',
    '.drive-viewer-backdrop',
    '.suite-calendar',
    '.suite-photos',
    '.suite-media-connect',
    '.vbc',
    '.cloud-m5',
    '.tsv-cloud-m10',
    '.tsv-cloud-accounts',
  ];

  check(
    'cloud-klassiek-maquette.css переводить усі хмарні, дискові й медійні поверхні на чисті матові картки 16px без градієнтів і підсвічувань',
    klassiekOppervlak.klassiekStart > 0 &&
      vereisteOppervlakken.every((sel) => klassiekOppervlak.klassiekDesktop.includes(sel)) &&
      klassiekOppervlak.klassiekDesktop.includes('border-radius: 16px;') &&
      klassiekOppervlak.klassiekDesktop.includes('background: var(--mq-oppervlak);') &&
      klassiekOppervlak.klassiekDesktop.includes('border: 1px solid var(--mq-rand);') &&
      klassiekOppervlak.klassiekDesktop.includes('box-shadow: var(--mq-schaduw-zacht);') &&
      klassiekOppervlak.klassiekDesktop.includes('backdrop-filter: none;') &&
      !/linear-gradient|radial-gradient|blur\s*\(|--mq-werk-gloed-a|rgba\(\s*var\(--mq-accent-rgb\)/i.test(
        klassiekOppervlak.klassiekDesktop,
      ),
  );

  // 5. Поверхні хмари (cloud-klassiek-maquette.css): кнопки й поля 11px, суцільні акцентні кнопки, гротеск і tabular-nums.
  const heeftPrimaireActiesCloud =
    /background:\s*var\(--mq-knop-primair-bg\);\s*color:\s*var\(--mq-knop-primair-tekst\);\s*border-color:\s*var\(--mq-knop-primair-bg\);\s*box-shadow:\s*none;/.test(
      klassiekOppervlak.klassiekDesktop,
    );

  check(
    'cloud-klassiek-maquette.css оформлює кнопки й поля із заокругленням 11px, суцільні акцентні кнопки, заголовки var(--mq-font-ui) і табличні цифри на енергії, датах календаря й обсягах файлів',
    heeftPrimaireActiesCloud &&
      klassiekOppervlak.klassiekDesktop.includes('border-radius: 11px;') &&
      klassiekOppervlak.klassiekDesktop.includes('.cloud-functional .cloud-primary') &&
      klassiekOppervlak.klassiekDesktop.includes('.vbc .vbc-knop.is-hoofd') &&
      klassiekOppervlak.klassiekDesktop.includes('.suite-calendar-search button') &&
      klassiekOppervlak.klassiekDesktop.includes('.cloud-functional .cloud-energy button') &&
      klassiekOppervlak.klassiekDesktop.includes('.suite-event-list time') &&
      klassiekOppervlak.klassiekDesktop.includes('.drive-browser .drive-file-copy small') &&
      klassiekOppervlak.klassiekDesktop.includes('.tsv-cloud-m10-details small') &&
      klassiekOppervlak.klassiekDesktop.includes('font-family: var(--mq-font-ui);') &&
      klassiekOppervlak.klassiekDesktop.includes('font-variant-numeric: tabular-nums;'),
  );

  // 6. Універсальне вікно файла: матовий корпус 16px (0 для .is-max), backdrop-filter: none, спокійна рамка .is-boven.
  const heeftMatVenster =
    /html\.palet-maquette\[data-maquette-stijl="klassiek"\]\s+body\s+\.venster\.universeel-bestand-venster\s*\{[\s\S]*?border-radius:\s*16px;[\s\S]*?border:\s*1px solid var\(--mq-rand-sterk\);[\s\S]*?background:\s*var\(--mq-oppervlak\);[\s\S]*?backdrop-filter:\s*none;[\s\S]*?box-shadow:\s*var\(--mq-schaduw\);/.test(
      universeelVenster.klassiekDesktop,
    );
  const heeftMaxNul =
    /\.venster\.universeel-bestand-venster\.is-max\s*\{\s*border-radius:\s*0;\s*\}/.test(
      universeelVenster.klassiekDesktop,
    );
  const heeftBovenMonochroom =
    /\.venster\.universeel-bestand-venster\.is-boven\s*\{\s*border-color:\s*var\(--mq-rand-sterk\);\s*box-shadow:\s*var\(--mq-schaduw\);\s*\}/.test(
      universeelVenster.klassiekDesktop,
    );

  check(
    'universeel-bestand-maquette.css замінює скляну залу на матове ділове вікно 16px (0 для .is-max) з backdrop-filter: none та монохромною рамкою .is-boven без світіння',
    universeelVenster.klassiekStart > 0 &&
      heeftMatVenster &&
      heeftMaxNul &&
      heeftBovenMonochroom &&
      universeelVenster.klassiekDesktop.includes('.universeel-bestand-werkvlak') &&
      universeelVenster.klassiekDesktop.includes('background: var(--mq-bg);') &&
      !/linear-gradient|radial-gradient|blur\s*\(|rgba\(\s*var\(--mq-accent-rgb\)/i.test(
        universeelVenster.klassiekDesktop,
      ),
  );

  // 7. Універсальне вікно файла: шапка > .venster-kop з безпечним відступом <= 16px, кнопки 11px і табличні цифри.
  const heeftVeiligeVensterKop =
    /\.venster\.universeel-bestand-venster\s*>\s*\.venster-kop\s*\{\s*padding:\s*8px 12px 8px 16px;\s*border-bottom:\s*1px solid var\(--mq-rand\);\s*background:\s*var\(--mq-oppervlak-2\);\s*\}/.test(
      universeelVenster.klassiekDesktop,
    );
  const heeftHoofdKnopVenster =
    /\.universeel-bestand-balk button:last-of-type\s*\{\s*border-radius:\s*11px;\s*background:\s*var\(--mq-knop-primair-bg\);\s*color:\s*var\(--mq-knop-primair-tekst\);\s*border-color:\s*var\(--mq-knop-primair-bg\);\s*box-shadow:\s*none;\s*\}/.test(
      universeelVenster.klassiekDesktop,
    );

  check(
    'шапка > .venster-kop утримує безпечний відступ padding: 8px 12px 8px 16px (<= 16px), тло var(--mq-oppervlak-2), кнопки 11px, суцільну головну дію та tabular-nums на розмірах',
    heeftVeiligeVensterKop &&
      heeftHoofdKnopVenster &&
      universeelVenster.klassiekDesktop.includes('> .venster-kop .venster-knoppen button') &&
      universeelVenster.klassiekDesktop.includes('border-radius: 11px;') &&
      universeelVenster.klassiekDesktop.includes('.universeel-grootte') &&
      universeelVenster.klassiekDesktop.includes('font-variant-numeric: tabular-nums;'),
  );

  // 8. Каскад @media (max-width: ...): усі настільні правила стоять суворо перед першим @media, а пороги спадають.
  const cascadeGeldig = alleDrie.every((item) => {
    if (item.eersteMaxMedia <= 0 || item.klassiekStart <= 0 || item.klassiekStart >= item.eersteMaxMedia) {
      return false;
    }
    const restNaMedia = item.mobielDeel.replace(/@media\s*\([^)]*\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '').trim();
    const drempels = [...item.mobielDeel.matchAll(/@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)/g)].map((m) =>
      Number(m[1]),
    );
    const dalend = drempels.length >= 1 && drempels.every((w, i) => i === 0 || w <= drempels[i - 1]);
    return restNaMedia === '' && dalend;
  });

  check(
    'у всіх трьох CSS-файлах класичні правила розміщені суворо перед першим @media (max-width), а мобільні блоки стоять у кінці у спадному порядку ширин',
    cascadeGeldig,
  );

  // 9. Інваріанти чистоти CSS: нуль !important, prefers-color-scheme, position:fixed і сирого білого кольору на кнопках.
  const heeftVerbodenCss = alleDrie.some(
    (item) =>
      /!important/i.test(item.zonderCommentaar) ||
      /prefers-color-scheme/i.test(item.zonderCommentaar) ||
      /position\s*:\s*fixed/i.test(item.zonderCommentaar) ||
      /color\s*:\s*(#fff(?:fff)?\b|white\b|rgb\(\s*255)/i.test(item.klassiekDesktop),
  );

  check(
    'жоден із трьох CSS-файлів не містить !important, prefers-color-scheme, position: fixed або сирого білого тексту на кнопках класичного режиму',
    !heeftVerbodenCss,
  );

  // 10. Мовний закон: повна відсутність заборонених літер російської абетки у змінених таблицях стилів і в тесті.
  const zelfInhoud = readFileSync('tests/eenheid/klassiek-003c-koppelingen-media.test.ts', 'utf8');
  const gecontroleerdeBestanden: readonly [string, string][] = [
    [integraties.pad, integraties.inhoud],
    [klassiekOppervlak.pad, klassiekOppervlak.inhoud],
    [universeelVenster.pad, universeelVenster.inhoud],
    ['tests/eenheid/klassiek-003c-koppelingen-media.test.ts', zelfInhoud],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, tekst]) => VERBODEN_LETTERS.test(tekst))
    .map(([pad]) => pad);

  check(
    'жоден файл контуру KLASSIEK-003C не містить заборонених символів російської абетки',
    taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
