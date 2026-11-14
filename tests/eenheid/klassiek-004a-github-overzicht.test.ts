// KLASSIEK-004A (Хвиля 3 тем оформлення «Біла класика» та «Чорна класика» для інженерного простору GitHub):
// перевірка відсікання студійного індиго та темної схеми шапки, прагматичної робочої щільності огляду,
// компактної смуги профілю, матових карток сховищ, проєктів, дошки, пошуку й приєднання (16px / 11px),
// захисту специфічності проти flat-content без порушення мобільного каскаду, типографіки та табличних цифр.
// Eenheidstest voor de klassieke overzichts-, profiel-, opslagplaats- en koppelopmaak van GitHub (KLASSIEK-004A).

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
  const { check, einde } = checker('klassiek-004a-github-overzicht');

  const overzichtCss = readFileSync('src/github/github-overzicht-maquette.css', 'utf8');
  const maquetteKlassiekCss = readFileSync('src/maquette-kern/maquette-klassiek.css', 'utf8');
  const weergaveTsx = readFileSync('src/GitHubWeergave.tsx', 'utf8');
  const eenklikTsx = readFileSync('src/github/EenklikKoppelPaneel.tsx', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-004a-github-overzicht.test.ts', 'utf8');

  const zonderCommentaar = overzichtCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const idxKlassiekSectie = overzichtCss.indexOf('9. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ');
  const idxEersteMedia = overzichtCss.search(/@media\s*\(\s*max-width/);
  const klassiekNaastPc =
    idxKlassiekSectie > 0 && idxEersteMedia > idxKlassiekSectie
      ? overzichtCss.slice(idxKlassiekSectie, idxEersteMedia).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const regels = leesCss(overzichtCss);

  // 1. Відсікання студійного індигово-фіолетового світлого блока (75, 70, 107) та темної схеми шапки .mq-held.
  const indigoRegel = regels.find((r) =>
    r.decls.some((d) => d.eig === '--mq-accent-rgb' && d.waarde === '75, 70, 107'),
  );
  const indigoTakken = indigoRegel ? indigoRegel.selectors : [];
  const donkerHeldRegels = regels.filter((r) =>
    r.decls.some((d) => d.eig === 'color-scheme' && d.waarde === 'dark'),
  );
  check(
    'студійний індиговий світлий блок (75, 70, 107) та темна колірна схема на .gh-maquette-wikkel > .mq-held відсічені через :not([data-maquette-stijl="klassiek"]), зберігаючи антрацит #181c24 і світлу шапку у Білій класиці',
    indigoTakken.length === 2 &&
      indigoTakken.every((tak) => tak.includes('html.palet-maquette:not([data-maquette-stijl="klassiek"])')) &&
      donkerHeldRegels.length === 1 &&
      donkerHeldRegels[0].selectors.length === 1 &&
      donkerHeldRegels[0].selectors[0] ===
        'html.palet-maquette:not([data-maquette-stijl="klassiek"]) .gh-maquette-wikkel>.mq-held' &&
      maquetteKlassiekCss.includes('--mq-kl-wit-accent: #181c24;'),
    indigoTakken.join(' | '),
  );

  // 2. Змінні на .gh-maquette-wikkel, щільність gap: 14px та компактна ділова смуга профілю .gh-me.
  const wikkelKlassiek = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .gh-maquette-wikkel'),
  );
  const wikkelMap = new Map((wikkelKlassiek?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const meKlassiek = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .gh-maquette-wikkel .gh-me'),
  );
  const meMap = new Map((meKlassiek?.decls ?? []).map((d) => [d.eig, d.waarde]));
  check(
    'класична оболонка .gh-maquette-wikkel перепризначає монохромні змінні, кути 16px/11px і щільність gap: 14px, а смуга профілю .gh-me має компактний padding: 10px 16px і матове тло без ореолів',
    wikkelMap.get('--mq-gh-indigo') === 'var(--mq-accent)' &&
      wikkelMap.get('--mq-straal-kaart') === '16px' &&
      wikkelMap.get('--mq-straal-knop') === '11px' &&
      wikkelMap.get('--mq-gloed') === 'transparent' &&
      wikkelMap.get('--mq-werk-gloed-a') === 'transparent' &&
      wikkelMap.get('--panel') === 'var(--mq-oppervlak)' &&
      wikkelMap.get('--surface') === 'var(--mq-oppervlak-2)' &&
      wikkelMap.get('--surface2') === 'var(--mq-oppervlak-hover)' &&
      wikkelMap.get('--line') === 'var(--mq-rand)' &&
      wikkelMap.get('--text') === 'var(--mq-tekst)' &&
      wikkelMap.get('--muted') === 'var(--mq-gedempt)' &&
      wikkelMap.get('--faint') === 'var(--mq-stil)' &&
      wikkelMap.get('--accent') === 'var(--mq-accent)' &&
      wikkelMap.get('--accenttext') === 'var(--mq-knop-primair-tekst)' &&
      wikkelMap.get('--accent-soft') === 'var(--mq-oppervlak-hover)' &&
      wikkelMap.get('--focus') === 'var(--mq-accent)' &&
      wikkelMap.get('gap') === '14px' &&
      meMap.get('padding') === '10px 16px' &&
      meMap.get('background') === 'var(--mq-oppervlak)' &&
      meMap.get('background-image') === 'none' &&
      meMap.get('box-shadow') === 'var(--mq-schaduw-zacht)',
  );

  // 3. Чисті матові поверхні всіх карток огляду, сховищ, проєктів, дошки, пошуку, приєднання та станів.
  check(
    'усі картки (.gh-card, .gh-me, .gh-uitgave-kaart, .gh-stat-kaart, .gh-subkaart, .gh-veld, .gh-pad, .gh-eenklik-held, .gh-apparaatcode-doos, .gh-pijler, .gh-repo, .gh-item, .gh-mq-bord-kaart, .gh-mq-kolom-tegel) мають матові поверхні, кути 16px та вимкнені градієнти, розмиття і стрибки',
    klassiekNaastPc.includes('.gh-card') &&
      klassiekNaastPc.includes('.gh-uitgave-kaart') &&
      klassiekNaastPc.includes('.gh-stat-kaart') &&
      klassiekNaastPc.includes('.gh-subkaart') &&
      klassiekNaastPc.includes('.gh-veld') &&
      klassiekNaastPc.includes('.gh-pad') &&
      klassiekNaastPc.includes('.gh-eenklik-held') &&
      klassiekNaastPc.includes('.gh-apparaatcode-doos') &&
      klassiekNaastPc.includes('.gh-pijler') &&
      klassiekNaastPc.includes('.gh-repo') &&
      klassiekNaastPc.includes('.gh-item') &&
      klassiekNaastPc.includes('.gh-mq-bord-kaart') &&
      klassiekNaastPc.includes('.gh-mq-kolom-tegel') &&
      klassiekNaastPc.includes('background: var(--mq-oppervlak);') &&
      klassiekNaastPc.includes('background: var(--mq-oppervlak-2);') &&
      klassiekNaastPc.includes('background-image: none;') &&
      klassiekNaastPc.includes('backdrop-filter: none;') &&
      klassiekNaastPc.includes('transform: none;') &&
      klassiekNaastPc.includes('border-radius: 16px;') &&
      klassiekNaastPc.includes('border: 1px solid var(--mq-rand);') &&
      !/linear-gradient|radial-gradient/i.test(klassiekNaastPc) &&
      !/translateY|scale\(/i.test(klassiekNaastPc),
  );

  // 4. Окреме правило специфічності :not(#_mqk) проти flat-content (0, 19, 0) винятково без padding і gap.
  const mqkRegels = regels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = mqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'правила з html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) перемагають flat-content (0, 19, 0) і містять винятково border, border-inline, border-radius: 16px та box-shadow без жодного padding чи gap',
    mqkRegels.length >= 3 &&
      mqkRegels.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')),
      ) &&
      mqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px')) &&
      mqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-inline')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 5. Плавні кути 11px на кнопках, вкладках навігації, пігулках відбору та полях пошуку й вибору.
  check(
    'кнопки (.gh-btn, .gh-btn-groot, .gh-icon), вкладки (.gh-snel-pil, .gh-tabs > button:not(.gh-btn)), пігулки (.gh-label-knop, .gh-kruimel, .gh-segment, .gh-chip, .gh-staat, .gh-label, .gh-rate) і поля (.gh-select-wikkel, .gh-search, .gh-form) мають заокруглення 11px, а .gh-search > input зберігає прозору безрамкову будову',
    klassiekNaastPc.includes('.gh-btn') &&
      klassiekNaastPc.includes('.gh-snel-pil') &&
      klassiekNaastPc.includes('.gh-tabs > button:not(.gh-btn)') &&
      klassiekNaastPc.includes('.gh-label-knop') &&
      klassiekNaastPc.includes('.gh-segment') &&
      klassiekNaastPc.includes('.gh-select-wikkel') &&
      klassiekNaastPc.includes('.gh-search') &&
      klassiekNaastPc.includes('border-radius: 11px;') &&
      /\.gh-search\s*>\s*input\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/.test(klassiekNaastPc),
  );

  // 6. Головна акцентна кнопка .gh-btn.gh-primary без градієнтів і без сирого білого кольору.
  const hoofdKnopRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .gh-maquette-wikkel .gh-btn.gh-primary'),
  );
  const hoofdHoverRegel = regels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes(
        'html.palet-maquette[data-maquette-stijl="klassiek"] .gh-maquette-wikkel .gh-btn.gh-primary:hover:not(:disabled)',
      ),
  );
  const hoofdMap = new Map((hoofdKnopRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const hoofdHoverMap = new Map((hoofdHoverRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  check(
    'головна кнопка .gh-btn.gh-primary використовує суцільне var(--mq-knop-primair-bg) та var(--mq-knop-primair-tekst), border-color: var(--mq-knop-primair-bg), box-shadow: none, opacity: 0.92 при наведенні і не містить сирого білого кольору',
    hoofdMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      hoofdMap.get('background-image') === 'none' &&
      hoofdMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      hoofdMap.get('border-color') === 'var(--mq-knop-primair-bg)' &&
      hoofdMap.get('border-radius') === '11px' &&
      hoofdMap.get('box-shadow') === 'none' &&
      hoofdHoverMap.get('opacity') === '0.92' &&
      !/#fff\b|#ffffff\b|\bwhite\b/i.test(zonderCommentaar),
  );

  // 7. Беззасічкова ділова типографіка заголовків h1..h4 та табличні цифри tabular-nums.
  check(
    'усі заголовки h1..h4 використовують беззасічковий var(--mq-font-ui) без курсиву, а лічильники, квоти API, дати, зірки та відгалуження мають font-variant-numeric: tabular-nums',
    klassiekNaastPc.includes(':is(h1, h2, h3, h4)') &&
      klassiekNaastPc.includes('font-family: var(--mq-font-ui);') &&
      klassiekNaastPc.includes('font-style: normal;') &&
      klassiekNaastPc.includes('font-variant-numeric: tabular-nums;') &&
      klassiekNaastPc.includes('.gh-rate') &&
      klassiekNaastPc.includes('.gh-repo-meta') &&
      klassiekNaastPc.includes('.gh-facts') &&
      klassiekNaastPc.includes('.gh-stat-kaart') &&
      klassiekNaastPc.includes('.gh-feiten dd') &&
      klassiekNaastPc.includes('.gh-apparaatcode-waarde') &&
      klassiekNaastPc.includes('.mq-held-stat-pil'),
  );

  // 8. Непорушна дисципліна каскаду: нуль примусової важливості, системної схеми та фіксованого позиціонування, усі @media наприкінці.
  const buitenMedia = inhoudBuitenMediaBlokken(overzichtCss, idxEersteMedia);
  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };
  const kaartSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .gh-maquette-wikkel .gh-card';
  const meSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .gh-maquette-wikkel .gh-me';
  check(
    'github-overzicht-maquette.css не містить заборонених CSS-конструкцій, класичний розділ стоїть суворо перед першим @media (max-width), а мобільні відступи чесно перемагають на вузькому екрані',
    !/!\s*important/i.test(overzichtCss) &&
      !/prefers-color-scheme/i.test(overzichtCss) &&
      !/position\s*:\s*fixed/i.test(overzichtCss) &&
      idxKlassiekSectie > 0 &&
      idxEersteMedia > idxKlassiekSectie &&
      buitenMedia === '' &&
      wint(regels, kaartSel, 'padding', pcProfiel)?.waarde === '18px 20px' &&
      wint(regels, kaartSel, 'padding', telProfiel)?.waarde === '12px 14px' &&
      wint(regels, meSel, 'padding', pcProfiel)?.waarde === '10px 16px' &&
      wint(regels, meSel, 'padding', telProfiel)?.waarde === '10px 12px',
  );

  // 9. Абсолютна мовна чистота у всіх файлах контуру KLASSIEK-004A.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    ['src/github/github-overzicht-maquette.css', overzichtCss],
    ['src/GitHubWeergave.tsx', weergaveTsx],
    ['src/github/EenklikKoppelPaneel.tsx', eenklikTsx],
    ['tests/eenheid/klassiek-004a-github-overzicht.test.ts', zelfTest],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  check(
    'жоден файл контуру KLASSIEK-004A не містить заборонених символів російської абетки',
    taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
