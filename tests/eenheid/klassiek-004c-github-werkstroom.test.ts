// KLASSIEK-004C (Хвиля 3 тем оформлення «Біла класика» та «Чорна класика»):
// перевірка прагматичного матового оформлення задач, запитів на злиття, конвеєрів дій,
// випусків, архівів і двостороннього мосту синхронізації інженерного простору.
// Eenheidstest voor vraagstukken, samenvoegingsverzoeken, werkstromen, uitgaven en tweerichtingsspiegel.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { leesCss } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

type StijlbladOntleding = {
  pad: string;
  inhoud: string;
  zonderCommentaar: string;
  eersteContainer: number;
  eersteMaxMedia: number;
  desktopDeel: string;
  mobielDeel: string;
  klassiekStart: number;
  klassiekDesktop: string;
};

function ontleedStijlblad(pad: string): StijlbladOntleding {
  const inhoud = readFileSync(pad, 'utf8');
  const zonderCommentaar = inhoud.replace(/\/\*[\s\S]*?\*\//g, '');
  const eersteContainer = zonderCommentaar.search(/@container\b/);
  const eersteMaxMedia = zonderCommentaar.search(/@media\s*\(\s*max-width/);
  const grens =
    eersteContainer >= 0 && (eersteMaxMedia < 0 || eersteContainer < eersteMaxMedia)
      ? eersteContainer
      : eersteMaxMedia;
  const desktopDeel = grens >= 0 ? zonderCommentaar.slice(0, grens) : zonderCommentaar;
  const mobielDeel = eersteMaxMedia >= 0 ? zonderCommentaar.slice(eersteMaxMedia) : '';
  const klassiekStart = desktopDeel.indexOf('html.palet-maquette[data-maquette-stijl="klassiek"]');
  const klassiekDesktop = klassiekStart >= 0 ? desktopDeel.slice(klassiekStart) : '';
  return {
    pad,
    inhoud,
    zonderCommentaar,
    eersteContainer,
    eersteMaxMedia,
    desktopDeel,
    mobielDeel,
    klassiekStart,
    klassiekDesktop,
  };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-004c-github-werkstroom');

  const werkstroom = ontleedStijlblad('src/github/github-werkstroom-maquette.css');
  const alleRegels = leesCss(werkstroom.inhoud);

  // 1. Ізоляція студійного світлого блоку .theme-light / .theme-plum-light на всіх гілках селекторів.
  const studioLichtRegels = alleRegels.filter((r) =>
    r.selectors.some((s) => s.includes('.theme-light')),
  );
  const alleLichtTakkenAfgeschermd =
    studioLichtRegels.length >= 1 &&
    studioLichtRegels.every((r) =>
      r.selectors.every((s) =>
        s.includes('html.palet-maquette:not([data-maquette-stijl="klassiek"])'),
      ),
    );

  check(
    'студійний блок .theme-light / .theme-plum-light повністю відсічений через :not([data-maquette-stijl="klassiek"]) на кожній гілці селекторів',
    alleLichtTakkenAfgeschermd &&
      werkstroom.desktopDeel.includes(
        'html.palet-maquette:not([data-maquette-stijl="klassiek"]):is(.theme-light, .theme-plum-light)',
      ) &&
      werkstroom.desktopDeel.includes(
        'html.palet-maquette:not([data-maquette-stijl="klassiek"]) .canonical-chrome:is(.theme-light, .theme-plum-light)',
      ) &&
      werkstroom.desktopDeel.includes(
        'html.palet-maquette:not([data-maquette-stijl="klassiek"]):has(.canonical-chrome:is(.theme-light, .theme-plum-light)) dialog.gh-dialoog',
      ),
  );

  // 2. Монохромні змінні робочого потоку на панелях задач, дій, мосту синхронізації та діалогових вікнах.
  const heeftMonochromeVariabelen =
    /html\.palet-maquette\[data-maquette-stijl="klassiek"\]\s*:is\(\s*\[data-mq-paneel="zaken"\],\s*\[data-mq-paneel="acties"\],\s*\[data-mq-paneel="spiegel"\],\s*dialog\.gh-dialoog\s*\)\s*\{[\s\S]*?--gh-wk-indigo:\s*var\(--mq-accent\);[\s\S]*?--gh-wk-merge:\s*var\(--mq-accent\);[\s\S]*?--gh-wk-oppervlak-kaart:\s*var\(--mq-oppervlak\);[\s\S]*?--gh-wk-invoer-bg:\s*var\(--mq-oppervlak-2\);/.test(
      werkstroom.klassiekDesktop,
    );

  check(
    'класичний розділ оголошує монохромні змінні --gh-wk-indigo, --gh-wk-merge, --gh-wk-oppervlak-kaart та --gh-wk-invoer-bg для всіх трьох панелей і dialog.gh-dialoog',
    werkstroom.klassiekStart > 0 && heeftMonochromeVariabelen,
  );

  // 3. Світлочутливий термінал журналів дій у темах «Біла класика» і «Чорна класика» без світлофорних кульок.
  const heeftWitConsole =
    /html\.palet-maquette\.palet-klassiek-wit\[data-maquette-stijl="klassiek"\][\s\S]*?\{[\s\S]*?--gh-wk-console-bg:\s*#f6f7f9;[\s\S]*?--gh-wk-console-kop:\s*#eef0f4;[\s\S]*?--gh-wk-console-rand:\s*var\(--mq-rand-sterk\);[\s\S]*?--gh-wk-console-tekst:\s*#111418;/.test(
      werkstroom.klassiekDesktop,
    );
  const heeftZwartConsole =
    /html\.palet-maquette\.palet-klassiek-zwart\[data-maquette-stijl="klassiek"\][\s\S]*?\{[\s\S]*?--gh-wk-console-bg:\s*#0e1116;[\s\S]*?--gh-wk-console-kop:\s*#14171d;[\s\S]*?--gh-wk-console-rand:\s*var\(--mq-rand-sterk\);[\s\S]*?--gh-wk-console-tekst:\s*#f3f4f6;/.test(
      werkstroom.klassiekDesktop,
    );
  const heeftStippenVerborgen =
    /\.gh-mq-terminal-stippen\s*\{\s*display:\s*none;\s*\}/.test(werkstroom.klassiekDesktop);

  check(
    'термінал журналів дій світлочутливий (світле полотно #f6f7f9 / #eef0f4 / #111418 у Білій класиці та оніксове #0e1116 / #14171d / #f3f4f6 у Чорній класиці) і приховує кольорові кульки .gh-mq-terminal-stippen',
    heeftWitConsole &&
      heeftZwartConsole &&
      heeftStippenVerborgen &&
      werkstroom.klassiekDesktop.includes('.gh-mq-terminal-doos') &&
      werkstroom.klassiekDesktop.includes('.gh-mq-terminal-kop') &&
      werkstroom.klassiekDesktop.includes('.gh-logboek-vak'),
  );

  // 4. Матові картки 16px без градієнтів, розмиття та зсувів для всіх робочих поверхонь.
  const vereisteKaarten = [
    '.gh-card',
    '.gh-werkbalk',
    '.gh-uitgave-kaart',
    '.gh-stat-kaart',
    '.gh-subkaart',
    '.gh-vastleg-kaart',
    '.gh-reactie',
    '.gh-zaak-tekst',
    '.gh-logboek-vak',
    '.gh-mq-spiegel-held',
    '.gh-diff-bestand',
    '.gh-mq-zaak-rij',
    '.gh-werkstroom-rij',
    '.gh-run-rij',
    '.gh-mq-archief-rij',
    '.gh-mq-spiegel-rij',
    'dialog.gh-dialoog',
  ];

  check(
    'усі картки задач, запитів на злиття, коментарів, конвеєрів дій, випусків, архівів і двостороннього мосту переведені на матові поверхні 16px без градієнтів, розмиття та зсувів',
    vereisteKaarten.every((sel) => werkstroom.klassiekDesktop.includes(sel)) &&
      werkstroom.klassiekDesktop.includes('border-radius: 16px;') &&
      werkstroom.klassiekDesktop.includes('background: var(--mq-oppervlak);') &&
      werkstroom.klassiekDesktop.includes('background: var(--mq-oppervlak-2);') &&
      werkstroom.klassiekDesktop.includes('background-image: none;') &&
      werkstroom.klassiekDesktop.includes('backdrop-filter: none;') &&
      werkstroom.klassiekDesktop.includes('transform: none;') &&
      !/linear-gradient|radial-gradient|blur\s*\(/i.test(werkstroom.klassiekDesktop),
  );

  // 5. Правило високої специфічності :not(#_mqk) проти flat-content винятково для рамок, скруглення й тіні без padding і gap.
  const mqkRegels = alleRegels.filter((r) =>
    r.selectors.some((s) => s.includes(':not(#_mqk)')),
  );
  const toegestaneMqkEigenschappen = new Set([
    'border',
    'border-inline',
    'border-radius',
    'box-shadow',
  ]);
  const verbodenMqkDeclaraties = mqkRegels.flatMap((r) =>
    r.decls
      .filter((d) => !toegestaneMqkEigenschappen.has(d.eig))
      .map((d) => `${d.eig}: ${d.waarde}`),
  );

  check(
    'правила з :not(#_mqk) перемагають flat-content для border / border-inline / border-radius: 16px / box-shadow і не містять жодного padding чи gap',
    mqkRegels.length >= 2 &&
      verbodenMqkDeclaraties.length === 0 &&
      werkstroom.klassiekDesktop.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)',
      ) &&
      werkstroom.klassiekDesktop.includes('border-inline: 1px solid var(--mq-rand);'),
    verbodenMqkDeclaraties.join(', '),
  );

  // 6. Кнопки, вкладки станів, фільтри й поля 11px, суцільні головні кнопки без #fff та спокійні значки станів.
  const heeftPrimaireKnop =
    /\.gh-btn\.gh-primary\s*\{[\s\S]*?border-color:\s*var\(--mq-knop-primair-bg\);[\s\S]*?background:\s*var\(--mq-knop-primair-bg\);[\s\S]*?background-image:\s*none;[\s\S]*?color:\s*var\(--mq-knop-primair-tekst\);[\s\S]*?box-shadow:\s*none;/.test(
      werkstroom.klassiekDesktop,
    );

  check(
    'кнопки, сегменти станів, пошук і поля форм мають скруглення 11px, головні кнопки використовують --mq-knop-primair-bg / --mq-knop-primair-tekst без #fff, а семантичні стани позбавлені світіння',
    heeftPrimaireKnop &&
      werkstroom.klassiekDesktop.includes('border-radius: 11px;') &&
      werkstroom.klassiekDesktop.includes('.gh-segment') &&
      werkstroom.klassiekDesktop.includes('.gh-search') &&
      werkstroom.klassiekDesktop.includes('.gh-staat.tone-ok') &&
      werkstroom.klassiekDesktop.includes('.gh-staat.tone-waarschuwing') &&
      werkstroom.klassiekDesktop.includes('.gh-staat.tone-fout') &&
      !/color\s*:\s*(#fff(?:fff)?\b|white\b|rgb\(\s*255)/i.test(werkstroom.klassiekDesktop),
  );

  // 7. Ділова беззасічкова типографіка заголовків h1..h4.
  const heeftKopTypografie =
    /:is\(h1,\s*h2,\s*h3,\s*h4,\s*\.gh-dialoog-kop h3\)\s*\{\s*font-family:\s*var\(--mq-font-ui\);\s*font-style:\s*normal;\s*\}/.test(
      werkstroom.klassiekDesktop,
    );

  check(
    'заголовки h1..h4 та шапки діалогових вікон переводяться на гротеск var(--mq-font-ui) без курсиву',
    heeftKopTypografie,
  );

  // 8. Табличні цифри tabular-nums на номерах #123, кроках, датах, відбитках SHA та розмірах архівів випусків.
  const vereisteTellerSelectoren = [
    '.gh-mq-nr',
    '.gh-mq-kop-nr',
    '.gh-mq-taak-staat',
    '.gh-mq-run-meta',
    '.gh-mq-sha-pil',
    '.gh-mq-maat-badge',
    '.gh-mq-archief-meta',
    '.gh-stat-kaart strong',
    'time',
  ];

  check(
    'номери #123, тривалості кроків, лічильники, дати, відбитки SHA та розміри архівів випусків мають font-variant-numeric: tabular-nums',
    vereisteTellerSelectoren.every((sel) => werkstroom.klassiekDesktop.includes(sel)) &&
      werkstroom.klassiekDesktop.includes('font-variant-numeric: tabular-nums;'),
  );

  // 9. Дисципліна каскаду @container / @media (max-width: ...) та інваріанти таблиці стилів.
  const restNaMedia = werkstroom.mobielDeel
    .replace(/@media\s*\([^)]*\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
    .trim();
  const drempels = [
    ...werkstroom.mobielDeel.matchAll(/@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)/g),
  ].map((m) => Number(m[1]));
  const dalendeDrempels =
    drempels.length >= 3 && drempels.every((w, i) => i === 0 || w <= drempels[i - 1]);
  const heeftVerbodenCss =
    /!important/i.test(werkstroom.zonderCommentaar) ||
    /prefers-color-scheme/i.test(werkstroom.zonderCommentaar) ||
    /position\s*:\s*fixed/i.test(werkstroom.zonderCommentaar);

  check(
    'класичний розділ розміщений суворо перед @container і @media (max-width), мобільні пороги спадають у кінці файла, відсутні !important, prefers-color-scheme та position: fixed',
    werkstroom.klassiekStart > 0 &&
      werkstroom.eersteContainer > werkstroom.klassiekStart &&
      werkstroom.eersteMaxMedia > werkstroom.eersteContainer &&
      restNaMedia === '' &&
      dalendeDrempels &&
      !heeftVerbodenCss,
    `drempels=${drempels.join('>')}, rest=${restNaMedia.length}`,
  );

  // 10. Підключення таблиці стилів у всіх трьох панелях та повна мовна чистота контуру KLASSIEK-004C.
  const zakenTsx = readFileSync('src/github/ZakenEnSamenvoegingenPaneel.tsx', 'utf8');
  const actiesTsx = readFileSync('src/github/ActiesEnUitgavenPaneel.tsx', 'utf8');
  const spiegelTsx = readFileSync('src/github/SpiegelEnBrugPaneel.tsx', 'utf8');
  const zelfInhoud = readFileSync('tests/eenheid/klassiek-004c-github-werkstroom.test.ts', 'utf8');

  const gecontroleerdeBestanden: readonly [string, string][] = [
    [werkstroom.pad, werkstroom.inhoud],
    ['src/github/ZakenEnSamenvoegingenPaneel.tsx', zakenTsx],
    ['src/github/ActiesEnUitgavenPaneel.tsx', actiesTsx],
    ['src/github/SpiegelEnBrugPaneel.tsx', spiegelTsx],
    ['tests/eenheid/klassiek-004c-github-werkstroom.test.ts', zelfInhoud],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, tekst]) => VERBODEN_LETTERS.test(tekst))
    .map(([pad]) => pad);

  check(
    'таблиця стилів підключена у всіх трьох панелях, присутні ознаки data-mq-paneel і жоден файл контуру KLASSIEK-004C не містить заборонених літер російської абетки',
    zakenTsx.includes("import './github-werkstroom-maquette.css';") &&
      actiesTsx.includes("import './github-werkstroom-maquette.css';") &&
      spiegelTsx.includes("import './github-werkstroom-maquette.css';") &&
      zakenTsx.includes('data-mq-paneel="zaken"') &&
      actiesTsx.includes('data-mq-paneel="acties"') &&
      spiegelTsx.includes('data-mq-paneel="spiegel"') &&
      taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
