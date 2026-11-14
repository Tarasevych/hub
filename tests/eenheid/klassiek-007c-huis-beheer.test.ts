// KLASSIEK-007C (Хвиля 6 тем оформлення «Біла класика» та «Чорна класика» для простору huis.tarasevych.com):
// перевірка стилів контуру керування оселею (huis-beheer-maquette.css — Beveiliging, Energie, Gebeurtenissen,
// Integraties, Assistent, Instellingen, UitnodigingenVoorMij та діалоги hv-ha-wizard / hv-ontdekt),
// відсікання студійних світлих блоків, підвищеної специфічності :not([data-mq-uit])[data-maquette-stijl="klassiek"],
// матових поверхонь 16px / 11px, монохромних діаграм енергії, табличних цифр, чесної семантики безпеки,
// захисту специфічності :not(#_mqk) без padding і gap та каскадної дисципліни.
// Eenheidstest voor de klassieke opmaak van Huis-beheeronderdelen (KLASSIEK-007C).

import { readFileSync } from 'node:fs';
import { kopReserves } from '../../scripts/plaatsing-controle.mjs';
import { checker } from './hulp/nep-google';
import { leesCss, wint } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const KLASSIEK_PREFIX = 'html.palet-maquette:not([data-mq-uit])[data-maquette-stijl="klassiek"]';
const MQK_PREFIX = 'html.palet-maquette:not([data-mq-uit])[data-maquette-stijl="klassiek"]:not(#_mqk)';

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

function rechterPaddingPx(paddingWaarde: string): number {
  const delen = paddingWaarde.trim().split(/\s+/);
  const rechts = delen[1] ?? delen[0] ?? '';
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(rechts);
  return m ? Number(m[1]) : Number.NaN;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-007c-huis-beheer');

  const controlePad = 'tests/eenheid/klassiek-007c-huis-beheer.test.ts';
  const cssPad = 'src/huis/huis-beheer-maquette.css';
  const hbCss = readFileSync(cssPad, 'utf8');
  const zelfControle = readFileSync(controlePad, 'utf8');
  const hbZonderCommentaar = hbCss.replace(/\/\*[\s\S]*?\*\//g, '');

  const idxKlassiekTitel = hbCss.indexOf('9. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-007C)');
  const idxKlassiek = idxKlassiekTitel > 0 ? hbCss.lastIndexOf('/*', idxKlassiekTitel) : -1;
  const idxEersteMedia = hbCss.search(/@media\s*\(/);
  const idxMaxMedia = hbCss.search(/@media\s*\(\s*max-width/);
  const klassiekRauw =
    idxKlassiek > 0 && idxEersteMedia > idxKlassiek ? hbCss.slice(idxKlassiek, idxEersteMedia) : '';
  const klassiekSectie = klassiekRauw.replace(/\/\*[\s\S]*?\*\//g, '');

  const hbRegels = leesCss(hbCss);
  const klassiekDesktopRegels = leesCss(klassiekRauw);
  const mapDecls = (r: (typeof hbRegels)[number] | undefined) =>
    new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde]));

  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };

  // 1. Відсікання всіх студійних світлих блоків через :not([data-maquette-stijl="klassiek"]).
  const studioLichtRegels = hbRegels.filter((r) =>
    r.selectors.some(
      (s) =>
        s.includes('[data-theme="light"]') ||
        s.includes('.theme-light') ||
        s.includes('.theme-plum-light'),
    ),
  );
  check(
    'усі студійні блоки світлого режиму ([data-theme="light"], .theme-light, .theme-plum-light) у huis-beheer-maquette.css обмежені через :not([data-maquette-stijl="klassiek"]) на кожній гілці селекторів',
    studioLichtRegels.length >= 6 &&
      studioLichtRegels.every(
        (r) =>
          r.selectors.length >= 2 &&
          r.selectors.every((s) => s.includes(':not([data-maquette-stijl="klassiek"])')),
      ),
  );

  // 2. Підвищена специфічність усіх класичних селекторів для чистої перемоги над студійними :not([data-mq-uit]).
  const klassiekMobielRegels = hbRegels.filter(
    (r) =>
      r.media.length > 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]')),
  );
  check(
    'усі класичні настільні та мобільні селектори використовують префікс html.palet-maquette:not([data-mq-uit])[data-maquette-stijl="klassiek"] зі специфічністю вищою за студійну',
    klassiekDesktopRegels.length >= 70 &&
      klassiekMobielRegels.length >= 6 &&
      klassiekDesktopRegels.every((r) =>
        r.selectors.every((s) => s.startsWith(KLASSIEK_PREFIX)),
      ) &&
      klassiekMobielRegels.every((r) =>
        r.selectors
          .filter((s) => s.includes('[data-maquette-stijl="klassiek"]'))
          .every((s) => s.startsWith(KLASSIEK_PREFIX)),
      ),
  );

  // 3. Скидання студійних градієнтних змінних на суцільні матові поверхні ядра.
  const varRegel = klassiekDesktopRegels.find((r) =>
    r.decls.some((d) => d.eig === '--mq-hb-kaart-bg'),
  );
  const varMap = mapDecls(varRegel);
  const varSel = varRegel?.selectors[0] ?? '';
  check(
    'класичний шар скидає змінні --mq-hb-* на суцільні матові поверхні ядра та охоплює всі сім розділів і діалоги майстра шлюзу',
    varMap.get('--mq-hb-accent') === 'var(--mq-accent)' &&
      varMap.get('--mq-hb-accent-diep') === 'var(--mq-accent-2)' &&
      varMap.get('--mq-hb-kaart-bg') === 'var(--mq-oppervlak)' &&
      varMap.get('--mq-hb-paneel-bg') === 'var(--mq-oppervlak)' &&
      varMap.get('--mq-hb-glans') === 'transparent' &&
      varMap.get('--mq-hb-rand-zacht') === 'var(--mq-rand)' &&
      varMap.get('--mq-hb-focus-ring') === 'var(--mq-oppervlak-hover)' &&
      varMap.get('--mq-straal-kaart') === '16px' &&
      varMap.get('--mq-straal-veld') === '11px' &&
      varMap.get('--mq-straal-knop') === '11px' &&
      varMap.get('--accenttext') === 'var(--mq-accent-op)' &&
      varMap.get('--text-on-accent') === 'var(--mq-accent-op)' &&
      [
        '.hv-beveiliging',
        '.hv-energie',
        '.hv-gebeurtenissen-pagina',
        '.hv-integraties',
        '.hv-assistent',
        '.hv-instellingen',
        '[data-hv-uitnodigingen-mij]',
        '.hv-laag[data-hv-ha-wizard]',
        '.hv-laag[data-hv-ontdekt]',
      ].every((onderdeel) => varSel.includes(onderdeel)),
  );

  // 4. Повна відсутність кольорових ореолів, градієнтів, розмиття та зарубчастих шрифтів у класичному розділі.
  const kopFontRegel = klassiekDesktopRegels.find((r) =>
    r.selectors.some((s) => s.endsWith(':is(h2, h3, h4)')),
  );
  const kopFontMap = mapDecls(kopFontRegel);
  check(
    'класичний розділ повністю прибирає radial-gradient і linear-gradient ореоли, розмиття backdrop-filter, зсуви translateY / scale та встановлює беззасічковий шрифт заголовків',
    !/gradient/i.test(klassiekSectie) &&
      !/translateY|scale\(/i.test(klassiekSectie) &&
      klassiekSectie.includes('background-image: none;') &&
      klassiekSectie.includes('backdrop-filter: none;') &&
      kopFontMap.get('font-family') === 'var(--mq-font-ui, Inter, system-ui, sans-serif)' &&
      kopFontMap.get('font-style') === 'normal',
  );

  // 5. Сучасні плавні заокруглення 16px на всіх секціях section.hv-blok, картках, діалогах майстра, подіях і запрошеннях.
  const blokUitnodigMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} section.hv-blok[data-hv-uitnodigingen-mij]`),
    ),
  );
  const bevKaartMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-beveiliging article.hv-kaart`),
    ),
  );
  const energieTegelMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-energie .hv-tegel`),
    ),
  );
  const energieMeterMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-energie article.hv-kaart[data-hv-meter]`),
    ),
  );
  const gebRijMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-gebeurtenissen-pagina .hv-gebeurtenissen>li`),
    ),
  );
  const integratieMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-integraties article.hv-integratie`),
    ),
  );
  const wizardVakMap = mapDecls(
    klassiekDesktopRegels.find((r) => r.selectors.some((s) => s.endsWith(') .hv-laag-vak'))),
  );
  const voorstelMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-assistent .hv-lijst>li[data-hv-voorstel]`),
    ),
  );
  const uitnodigRijMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} section.hv-blok[data-hv-uitnodigingen-mij] .hv-lijst>li`),
    ),
  );
  check(
    'усі секції section.hv-blok, картки безпеки, плити й лічильники енергії, рядки подій, шлюзи інтеграцій, діалоги майстра, пропозиції помічника та запрошення мають матові поверхні з радіусом 16px',
    blokUitnodigMap.get('border-radius') === '16px' &&
      blokUitnodigMap.get('background') === 'var(--mq-oppervlak)' &&
      bevKaartMap.get('border-radius') === '16px' &&
      energieTegelMap.get('border-radius') === '16px' &&
      energieMeterMap.get('border-radius') === '16px' &&
      gebRijMap.get('border-radius') === '16px' &&
      integratieMap.get('border-radius') === '16px' &&
      wizardVakMap.get('border-radius') === '16px' &&
      wizardVakMap.get('backdrop-filter') === 'none' &&
      voorstelMap.get('border-radius') === '16px' &&
      uitnodigRijMap.get('border-radius') === '16px',
  );

  // 6. Плавні заокруглення 11px для кнопок, полів введення, списків вибору, вкладок і жетонів.
  const veldRegel = klassiekDesktopRegels.find((r) =>
    r.selectors.some((s) => s.includes('select, textarea)')),
  );
  const knopRegel = klassiekDesktopRegels.find((r) =>
    r.selectors.some((s) => s.endsWith(') .hv-knop')),
  );
  const icoonKnopRegel = klassiekDesktopRegels.find((r) =>
    r.selectors.some((s) => s.endsWith(') .hv-icoonknop')),
  );
  const tablistRegel = klassiekDesktopRegels.find((r) =>
    r.selectors.some((s) => s.endsWith(') .hv-chips[role="tablist"]')),
  );
  const chipRegel = klassiekDesktopRegels.find((r) =>
    r.selectors.some((s) => s.endsWith(') .hv-chip')),
  );
  check(
    'поля введення, списки вибору, текстові області, кнопки .hv-knop, .hv-icoonknop, вкладки role="tablist" і жетони .hv-chip мають заокруглення 11px',
    mapDecls(veldRegel).get('border-radius') === '11px' &&
      mapDecls(veldRegel).get('box-shadow') === 'none' &&
      mapDecls(knopRegel).get('border-radius') === '11px' &&
      mapDecls(knopRegel).get('box-shadow') === 'none' &&
      mapDecls(icoonKnopRegel).get('border-radius') === '11px' &&
      mapDecls(tablistRegel).get('border-radius') === '11px' &&
      mapDecls(chipRegel).get('border-radius') === '11px',
  );

  // 7. Суцільні первинні кнопки на var(--mq-knop-primair-bg) / var(--mq-knop-primair-tekst) без #fff та перемикачі з кулькою var(--mq-accent-op).
  const hoofdKnopRegel = klassiekDesktopRegels.find((r) =>
    r.selectors.some((s) => s.endsWith(') .hv-knop.is-hoofd')),
  );
  const hoofdKnopMap = mapDecls(hoofdKnopRegel);
  const schakelaarAanMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-beveiliging .hv-bediening .hv-schakelaar.is-aan`),
    ),
  );
  const schakelaarKnopAanMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(
        `${KLASSIEK_PREFIX} .hv-beveiliging .hv-bediening .hv-schakelaar.is-aan .hv-schakelaar-knop`,
      ),
    ),
  );
  const witKleurRegel = /(?<![-\w])color\s*:\s*(?:#fff(?:fff)?|white)\b/i;
  check(
    'первинні кнопки .hv-knop.is-hoofd використовують var(--mq-knop-primair-bg) і var(--mq-knop-primair-tekst) без тіней і без сирого #fff, а увімкнені перемикачі охорони фарбують кульку у var(--mq-accent-op)',
    hoofdKnopMap.get('background') === 'var(--mq-knop-primair-bg)' &&
      hoofdKnopMap.get('background-image') === 'none' &&
      hoofdKnopMap.get('color') === 'var(--mq-knop-primair-tekst)' &&
      hoofdKnopMap.get('border-radius') === '11px' &&
      hoofdKnopMap.get('box-shadow') === 'none' &&
      schakelaarAanMap.get('background') === 'var(--mq-accent)' &&
      schakelaarKnopAanMap.get('background') === 'var(--mq-accent-op)' &&
      !witKleurRegel.test(hbZonderCommentaar),
  );

  // 8. Строгий графітово-сріблястий монохром в .hv-energie та табличні цифри tabular-nums для лічильників і часу подій.
  const schaalBalkMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(
        `${KLASSIEK_PREFIX} .hv-energie article.hv-kaart[data-hv-meter][data-mq-schaal="ja"]::after`,
      ),
    ),
  );
  const lijnMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-energie .hv-lijn`),
    ),
  );
  const lijnPadMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-energie .hv-lijn path`),
    ),
  );
  const lijnBalkMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-energie .hv-lijn rect`),
    ),
  );
  const lijnTekstMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-energie .hv-lijn-tekst`),
    ),
  );
  const tegelGetalMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-energie .hv-tegel strong`),
    ),
  );
  const gebTijdMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-gebeurtenissen-pagina .hv-gebeurtenissen>li>span`),
    ),
  );
  const intTabelMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(`${KLASSIEK_PREFIX} .hv-integraties .hv-tabel`),
    ),
  );
  check(
    'стовпчики й графіки .hv-energie переведені на строгий графітово-сріблястий монохром (var(--mq-accent) / var(--mq-gedempt) / var(--mq-oppervlak-2)), а показники кВт·год, потужності, часу подій і таблиці мають font-variant-numeric: tabular-nums',
    schaalBalkMap.get('width') === 'var(--mq-meter-pct, 0%)' &&
      schaalBalkMap.get('background-color') === 'var(--mq-accent)' &&
      schaalBalkMap.get('background-image') === 'none' &&
      lijnMap.get('background') === 'var(--mq-oppervlak-2)' &&
      lijnMap.get('background-image') === 'none' &&
      lijnPadMap.get('stroke') === 'var(--mq-accent)' &&
      lijnBalkMap.get('fill') === 'var(--mq-accent)' &&
      lijnTekstMap.get('fill') === 'var(--mq-gedempt)' &&
      lijnTekstMap.get('font-variant-numeric') === 'tabular-nums' &&
      tegelGetalMap.get('font-variant-numeric') === 'tabular-nums' &&
      gebTijdMap.get('font-variant-numeric') === 'tabular-nums' &&
      intTabelMap.get('font-variant-numeric') === 'tabular-nums',
  );

  // 9. Чесні семантичні сигнали безпеки в .hv-beveiliging та .hv-integraties без ореолів і без анімації пульсу.
  const gevaarBannerMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(
        `${KLASSIEK_PREFIX} .hv-beveiliging .hv-melding[data-mq-schild-banner="gevaar"]`,
      ),
    ),
  );
  const versWaardeMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(
        `${KLASSIEK_PREFIX} .hv-beveiliging article.hv-kaart[data-mq-versheid="vers"] .hv-waarde`,
      ),
    ),
  );
  const verouderdWaardeMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(
        `${KLASSIEK_PREFIX} .hv-beveiliging article.hv-kaart[data-mq-versheid="verouderd"] .hv-waarde`,
      ),
    ),
  );
  const hartslagAanMap = mapDecls(
    klassiekDesktopRegels.find((r) =>
      r.selectors.includes(
        `${KLASSIEK_PREFIX} .hv-integraties article.hv-integratie.is-verbonden .hv-chip[data-mq-pil="hartslag"]::before`,
      ),
    ),
  );
  check(
    'розділи безпеки й інтеграцій зберігають чесні семантичні сигнали через var(--fout), var(--warn), var(--ok) без декоративних ореолів і вимикають анімацію пульсу в класиці',
    gevaarBannerMap.get('border-left') === '4px solid var(--fout)' &&
      gevaarBannerMap.get('background') === 'var(--fout-zacht)' &&
      gevaarBannerMap.get('background-image') === 'none' &&
      versWaardeMap.get('border-color') === 'var(--ok)' &&
      versWaardeMap.get('color') === 'var(--ok)' &&
      verouderdWaardeMap.get('border-color') === 'var(--warn)' &&
      verouderdWaardeMap.get('color') === 'var(--warn)' &&
      hartslagAanMap.get('background') === 'var(--ok)' &&
      hartslagAanMap.get('animation') === 'none' &&
      hartslagAanMap.get('box-shadow') === 'none',
  );

  // 10. Критичний захист специфічності :not(#_mqk) проти flat-content (0, 19, 0) винятково без padding і без gap.
  const mqkRegels = hbRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = mqkRegels.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'правила html.palet-maquette:not([data-mq-uit])[data-maquette-stijl="klassiek"]:not(#_mqk) містять винятково border, border-inline, border-radius: 16px та box-shadow — нуль padding і нуль gap',
    mqkRegels.length >= 4 &&
      mqkRegels.every((r) => r.selectors.every((s) => s.startsWith(MQK_PREFIX))) &&
      mqkRegels.every((r) =>
        r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px'),
      ) &&
      mqkRegels.every((r) => r.decls.some((d) => d.eig === 'border-inline')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 11. Каскадна дисципліна, розміщення перед першим @media, мобільні перемоги на 390×844 та праві відступи шапок <= 20px.
  const buitenMedia = inhoudBuitenMediaBlokken(hbCss, idxEersteMedia);
  const reserves = kopReserves(cssPad, hbCss);
  const laagKopDesktopRegel = klassiekDesktopRegels.find((r) =>
    r.selectors.some((s) => s.endsWith(') .hv-laag-kop')),
  );
  const laagKopSel = laagKopDesktopRegel?.selectors[0] ?? '';
  const laagKopPcPad = wint(hbRegels, laagKopSel, 'padding', pcProfiel)?.waarde ?? '';
  const laagKopTelPad = wint(hbRegels, laagKopSel, 'padding', telProfiel)?.waarde ?? '';
  check(
    'таблиця стилів не містить !important, prefers-color-scheme чи position: fixed, класичний блок стоїть суворо перед першим @media, мобільні відступи перемагають на 390×844, а правий відступ шапок діалогів <= 20px',
    !/!\s*important/i.test(hbCss) &&
      !/prefers-color-scheme/i.test(hbCss) &&
      !/position\s*:\s*fixed/i.test(hbCss) &&
      idxKlassiek > 0 &&
      idxEersteMedia > idxKlassiek &&
      idxMaxMedia === idxEersteMedia &&
      buitenMedia === '' &&
      reserves.length === 0 &&
      laagKopPcPad === '14px 18px 12px' &&
      laagKopTelPad === '12px 14px 10px' &&
      rechterPaddingPx(laagKopPcPad) <= 20 &&
      rechterPaddingPx(laagKopTelPad) <= 20 &&
      wint(
        hbRegels,
        `${KLASSIEK_PREFIX} section.hv-blok[data-hv-uitnodigingen-mij]`,
        'padding',
        telProfiel,
      )?.waarde === '14px' &&
      wint(
        hbRegels,
        `${KLASSIEK_PREFIX} .hv-beveiliging article.hv-kaart`,
        'padding',
        telProfiel,
      )?.waarde === '12px 14px' &&
      wint(
        hbRegels,
        `${KLASSIEK_PREFIX} .hv-integraties article.hv-integratie`,
        'padding',
        telProfiel,
      )?.waarde === '12px 14px' &&
      wint(
        hbRegels,
        `${KLASSIEK_PREFIX} .hv-gebeurtenissen-pagina .hv-gebeurtenissen>li`,
        'grid-template-columns',
        telProfiel,
      )?.waarde === 'minmax(0, 1fr)',
  );

  // 12. Абсолютна мовна чистота обох файлів контуру KLASSIEK-007C.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    [cssPad, hbCss],
    [controlePad, zelfControle],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  const controleBestandsnaam = controlePad.split('/').pop() ?? '';
  check(
    'жоден із двох файлів контуру KLASSIEK-007C не містить заборонених літер російської абетки, а назва файла перевірок відповідає нідерландському іменуванню',
    taalOvertredingen.length === 0 && !/\b(security|energy|events|settings|wizard)\b/i.test(controleBestandsnaam),
    taalOvertredingen.join(', '),
  );

  return einde();
}
