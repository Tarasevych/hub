// KLASSIEK-010B (Фінальна Хвиля 9Б тем оформлення «Біла класика» та «Чорна класика» у консолі керування):
// перевірка живої панелі огляду (overzicht-maquette.css), сховища таємниць платформи (geheimen-maquette.css)
// та майстра безпечних оновлень сервера (uitrol-maquette.css): відсікання студійних блоків світлого режиму,
// чистота семантичних мініпалітр --ov-* (зокрема --ov-s1..--ov-s5), --gm-*, --vm-* та --ut-*,
// світле інженерне поле термінала оновлень у palet-klassiek-wit і матове оніксове у palet-klassiek-zwart
// без торкання інтерактивного емулятора .term-doos та стрілок .ut-tabs-pijl, матові поверхні без градієнтів
// і розмиття, суцільні первинні кнопки без білих літералів, геометрія 16px / 11px / 999px, правий відступ
// шапок діалогів <= 20px, правила захисту :not(#_mqk) без padding і gap, каскад @media та мовна чистота.
// Eenheidstest voor het beheeroverzicht, de geheimenkluis en de serveruitrol in Klassiek Wit en Klassiek Zwart (KLASSIEK-010B).

import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';
import { leesCss, wint, type Regel } from './mobiel-cascade-20261105.test';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
const ZUIVERE_TOKEN_WAARDE = /^var\(--(?:ok|warn|fout|info|mq-[a-z0-9-]+)\)$/;

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
      const treffer = rest.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)*@media\s*[^{]+\{/);
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

function rechtseOpvullingPx(paddingWaarde: string): number {
  const delen = paddingWaarde.trim().split(/\s+/);
  const rechts = delen.length === 1 ? delen[0] : delen[1];
  const treffer = /^([\d.]+)px$/.exec(rechts ?? '');
  return treffer ? Number(treffer[1]) : NaN;
}

function klassiekeRegels(regels: Regel[]): Regel[] {
  return regels.filter((r) =>
    r.selectors.some(
      (s) =>
        !s.includes(':not([data-maquette-stijl="klassiek"])') &&
        (s.includes('[data-maquette-stijl="klassiek"]') ||
          s.includes('palet-klassiek-wit') ||
          s.includes('palet-klassiek-zwart')),
    ),
  );
}

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-010b-beheer-kluis-uitrol');

  const overzichtCss = readFileSync('src/overzicht/overzicht-maquette.css', 'utf8');
  const geheimenCss = readFileSync('src/geheimen/geheimen-maquette.css', 'utf8');
  const uitrolCss = readFileSync('src/uitrol/uitrol-maquette.css', 'utf8');
  const maquetteKlassiekCss = readFileSync('src/maquette-kern/maquette-klassiek.css', 'utf8');
  const zelfTest = readFileSync('tests/eenheid/klassiek-010b-beheer-kluis-uitrol.test.ts', 'utf8');

  const ovRegels = leesCss(overzichtCss);
  const gmRegels = leesCss(geheimenCss);
  const utRegels = leesCss(uitrolCss);

  const idxKlassiekOv = overzichtCss.indexOf('7. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-010B)');
  const idxKlassiekGm = geheimenCss.indexOf('6. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-010B)');
  const idxKlassiekUt = uitrolCss.indexOf('7. ПРАГМАТИЧНЕ ДІЛОВЕ ОФОРМЛЕННЯ КЛАСИКИ (KLASSIEK-010B)');

  const idxMediaOv = overzichtCss.search(/@media\s*\(/);
  const idxMediaGm = geheimenCss.search(/@media\s*\(/);
  const idxMediaUt = uitrolCss.search(/@media\s*\(/);

  const klassiekPcOv =
    idxKlassiekOv > 0 && idxMediaOv > idxKlassiekOv
      ? overzichtCss.slice(idxKlassiekOv, idxMediaOv).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';
  const klassiekPcGm =
    idxKlassiekGm > 0 && idxMediaGm > idxKlassiekGm
      ? geheimenCss.slice(idxKlassiekGm, idxMediaGm).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';
  const klassiekPcUt =
    idxKlassiekUt > 0 && idxMediaUt > idxKlassiekUt
      ? uitrolCss.slice(idxKlassiekUt, idxMediaUt).replace(/\/\*[\s\S]*?\*\//g, '')
      : '';

  const klassiekStaartOv = idxKlassiekOv > 0 ? overzichtCss.slice(idxKlassiekOv).replace(/\/\*[\s\S]*?\*\//g, '') : '';
  const klassiekStaartGm = idxKlassiekGm > 0 ? geheimenCss.slice(idxKlassiekGm).replace(/\/\*[\s\S]*?\*\//g, '') : '';
  const klassiekStaartUt = idxKlassiekUt > 0 ? uitrolCss.slice(idxKlassiekUt).replace(/\/\*[\s\S]*?\*\//g, '') : '';

  // 1. Відсікання усіх студійних блоків світлого режиму через :not([data-maquette-stijl="klassiek"]) у всіх трьох таблицях.
  const isLichtSelector = (s: string) =>
    s.includes('data-theme="light"') || s.includes('theme-light') || s.includes('theme-plum-light');
  const ovLicht = ovRegels.filter((r) => r.selectors.some(isLichtSelector));
  const gmLicht = gmRegels.filter((r) => r.selectors.some(isLichtSelector));
  const utLicht = utRegels.filter((r) => r.selectors.some(isLichtSelector));
  check(
    'усі студійні блоки світлого режиму в overzicht-maquette.css, geheimen-maquette.css та uitrol-maquette.css відсічені через :not([data-maquette-stijl="klassiek"]) на кожній гілці селекторів',
    ovLicht.length === 2 &&
      gmLicht.length === 2 &&
      utLicht.length === 2 &&
      [...ovLicht, ...gmLicht, ...utLicht].every((r) =>
        r.selectors.every((tak) => tak.startsWith('html.palet-maquette:not([data-maquette-stijl="klassiek"])')),
      ),
  );

  // 2. Чистота мініпалітри --ov-* (зокрема серій графіків --ov-s1..--ov-s5) у панелі огляду.
  const ovKlassiekDecls = klassiekeRegels(ovRegels).flatMap((r) => r.decls);
  const ovMiniDecls = ovKlassiekDecls.filter((d) => d.eig.startsWith('--ov-'));
  const ovWortelRegel = ovRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ov-root'),
  );
  const ovWortelMap = new Map((ovWortelRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const ovOnzuiver = ovMiniDecls.filter((d) => !ZUIVERE_TOKEN_WAARDE.test(d.waarde));
  check(
    'усі змінні --ov-* у класичному контурі огляду (включно з серіями --ov-s1..--ov-s5) використовують винятково чисті var(--ok), var(--warn), var(--fout), var(--info) або var(--mq-*) без hex, rgb чи color-mix',
    ovMiniDecls.length >= 15 &&
      ovOnzuiver.length === 0 &&
      ovWortelMap.get('--ov-s1') === 'var(--mq-accent)' &&
      ovWortelMap.get('--ov-s2') === 'var(--mq-gedempt)' &&
      ovWortelMap.get('--ov-s3') === 'var(--ok)' &&
      ovWortelMap.get('--ov-s4') === 'var(--info)' &&
      ovWortelMap.get('--ov-s5') === 'var(--warn)',
    ovOnzuiver.map((d) => `${d.eig}: ${d.waarde}`).join(', '),
  );

  // 3. Чистота мініпалітр --gm-*, --vm-* та --ut-* у сховищі таємниць і майстрі оновлень.
  const gmKlassiekDecls = klassiekeRegels(gmRegels).flatMap((r) => r.decls);
  const utKlassiekDecls = klassiekeRegels(utRegels).flatMap((r) => r.decls);
  const gmMiniDecls = gmKlassiekDecls.filter((d) => d.eig.startsWith('--gm-') || d.eig.startsWith('--vm-'));
  const utMiniDecls = utKlassiekDecls.filter((d) => d.eig.startsWith('--ut-'));
  const onzuiverGmUt = [...gmMiniDecls, ...utMiniDecls].filter((d) => !ZUIVERE_TOKEN_WAARDE.test(d.waarde));
  const vreemdeTussenVars = [...ovKlassiekDecls, ...gmKlassiekDecls, ...utKlassiekDecls].filter(
    (d) =>
      d.eig.startsWith('--') &&
      !d.eig.startsWith('--ov-') &&
      !d.eig.startsWith('--gm-') &&
      !d.eig.startsWith('--vm-') &&
      !d.eig.startsWith('--ut-') &&
      !d.eig.startsWith('--mq-ov-') &&
      !d.eig.startsWith('--mq-gm-') &&
      !d.eig.startsWith('--mq-ut-') &&
      d.eig !== '--accenttext' &&
      d.eig !== '--accent-soft' &&
      d.eig !== '--text-on-accent',
  );
  check(
    'усі змінні --gm-*, --vm-* та --ut-* у класичних блоках отримують винятково чисті семантичні змінні ядра, а проміжні змінні мають префікси --mq-ov-*, --mq-gm-*, --mq-ut-*',
    gmMiniDecls.length >= 17 &&
      utMiniDecls.length >= 16 &&
      onzuiverGmUt.length === 0 &&
      vreemdeTussenVars.length === 0,
    [...onzuiverGmUt, ...vreemdeTussenVars].map((d) => `${d.eig}: ${d.waarde}`).join(', '),
  );

  // 4. Світле інженерне поле термінала оновлень у «Білій класиці» (html.palet-klassiek-wit .ut-root).
  const termWitRegel = utRegels.find(
    (r) => r.media.length === 0 && r.selectors.includes('html.palet-klassiek-wit .ut-root'),
  );
  const termWitMap = new Map((termWitRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const terminalBlokRegel = utRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ut-root .ut-terminal'),
  );
  const terminalBlokMap = new Map((terminalBlokRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const contrastTermWit = contrastVerhouding('#111418', '#f1f3f6');
  check(
    'у «Білій класиці» (html.palet-klassiek-wit .ut-root) термінал оновлень .ut-terminal, .ud-uitvoer та .ut-oorzaak-context pre отримує світле інженерне поле var(--mq-oppervlak-2) із контрастом тексту > 14:1',
    termWitMap.get('--mq-ut-term-bg') === 'var(--mq-oppervlak-2)' &&
      termWitMap.get('--mq-ut-term-balk') === 'var(--mq-oppervlak)' &&
      termWitMap.get('--mq-ut-term-rand') === 'var(--mq-rand-sterk)' &&
      termWitMap.get('--mq-ut-term-tekst') === 'var(--mq-tekst)' &&
      termWitMap.get('--mq-ut-term-gedempt') === 'var(--mq-gedempt)' &&
      termWitMap.get('--mq-ut-term-goed') === 'var(--ok)' &&
      termWitMap.get('--mq-ut-term-waarsch') === 'var(--warn)' &&
      termWitMap.get('--mq-ut-term-gevaar') === 'var(--fout)' &&
      termWitMap.get('--mq-ut-term-info') === 'var(--info)' &&
      terminalBlokMap.get('background') === 'var(--mq-ut-term-bg)' &&
      terminalBlokMap.get('color') === 'var(--mq-ut-term-tekst)' &&
      klassiekPcUt.includes('.ud-uitvoer') &&
      klassiekPcUt.includes('.ut-oorzaak-context pre') &&
      maquetteKlassiekCss.includes('--mq-oppervlak-2: #f1f3f6;') &&
      maquetteKlassiekCss.includes('--mq-tekst: #111418;') &&
      contrastTermWit > 14,
  );

  // 5. Матове оніксове поле термінала у «Чорній класиці» (html.palet-klassiek-zwart .ut-root), недоторканність .term-doos і стрілок .ut-tabs-pijl.
  const termZwartRegel = utRegels.find(
    (r) => r.media.length === 0 && r.selectors.includes('html.palet-klassiek-zwart .ut-root'),
  );
  const termZwartMap = new Map((termZwartRegel?.decls ?? []).map((d) => [d.eig, d.waarde]));
  const pijlRegels = utRegels.filter((r) => r.selectors.some((s) => s.includes('.ut-tabs-pijl')));
  const verbodenPijlEig = pijlRegels.flatMap((r) =>
    r.decls.filter((d) => ['display', 'left', 'right', 'position'].includes(d.eig)).map((d) => d.eig),
  );
  const contrastTermZwart = contrastVerhouding('#f3f4f6', '#0c0e12');
  check(
    'у «Чорній класиці» (html.palet-klassiek-zwart .ut-root) термінал має оніксове поле var(--mq-bg) із контрастом > 16:1, справжній емулятор .term-doos не зачіпається, а геометрія .ut-tabs-pijl збережена',
    termZwartMap.get('--mq-ut-term-bg') === 'var(--mq-bg)' &&
      termZwartMap.get('--mq-ut-term-balk') === 'var(--mq-oppervlak)' &&
      termZwartMap.get('--mq-ut-term-tekst') === 'var(--mq-tekst)' &&
      contrastTermZwart > 16 &&
      !overzichtCss.replace(/\/\*[\s\S]*?\*\//g, '').includes('.term-doos') &&
      !geheimenCss.replace(/\/\*[\s\S]*?\*\//g, '').includes('.term-doos') &&
      !uitrolCss.replace(/\/\*[\s\S]*?\*\//g, '').includes('.term-doos') &&
      pijlRegels.length >= 2 &&
      verbodenPijlEig.length === 0,
    verbodenPijlEig.join(', '),
  );

  // 6. Матові поверхні без градієнтів, ореолів, розмиття backdrop-filter і підстрибувань transform у класичних шарах усіх трьох таблиць.
  const alleKlassiekeRegels = [
    ...klassiekeRegels(ovRegels),
    ...klassiekeRegels(gmRegels),
    ...klassiekeRegels(utRegels),
  ];
  const gradientInKlassiek = alleKlassiekeRegels.filter((r) =>
    r.decls.some((d) => /linear-gradient|radial-gradient|conic-gradient/i.test(d.waarde)),
  );
  const blurInKlassiek = alleKlassiekeRegels.filter((r) =>
    r.decls.some((d) => d.eig.endsWith('backdrop-filter') && d.waarde !== 'none'),
  );
  const sprongInKlassiek = alleKlassiekeRegels.filter((r) =>
    r.decls.some((d) => d.eig === 'transform' && d.waarde !== 'none'),
  );
  check(
    'у класичних настільних і адаптивних правилах усіх 3 файлів немає жодного градієнта, розмиття backdrop-filter чи підстрибування transform при наведенні',
    gradientInKlassiek.length === 0 &&
      blurInKlassiek.length === 0 &&
      sprongInKlassiek.length === 0 &&
      klassiekPcOv.includes('backdrop-filter: none;') &&
      klassiekPcGm.includes('backdrop-filter: none;') &&
      klassiekPcUt.includes('backdrop-filter: none;') &&
      klassiekPcGm.includes('.gm-teller > span') &&
      klassiekPcUt.includes('.ut-voortgang-balk i') &&
      klassiekPcUt.includes('.ut-conv-rij::after'),
  );

  // 7. Суцільні первинні кнопки у всіх трьох модулях без #fff та var(--mq-wit).
  const ovHoofdRegel = ovRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.includes('html.palet-maquette[data-maquette-stijl="klassiek"] .ov-root .ov-knop-hoofd'),
  );
  const gmHoofdRegel = gmRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some(
        (s) =>
          s.includes('[data-maquette-stijl="klassiek"]') &&
          s.includes('.gm-knop.is-primair') &&
          s.includes('.gm-knop-primair') &&
          s.includes('.gm-knop-hoofd'),
      ),
  );
  const utHoofdRegel = utRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some(
        (s) =>
          s.includes('[data-maquette-stijl="klassiek"]') &&
          s.includes('.ut-knop-primair') &&
          s.includes('.uitrol-meester-cta'),
      ),
  );
  const heeftPrimaireStijl = (r: Regel | undefined) => {
    const m = new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde]));
    return (
      m.get('background') === 'var(--mq-knop-primair-bg)' &&
      m.get('background-image') === 'none' &&
      m.get('color') === 'var(--mq-knop-primair-tekst)' &&
      m.get('box-shadow') === 'none'
    );
  };
  const klassiekGecombineerd = `${klassiekPcOv}\n${klassiekPcGm}\n${klassiekPcUt}`;
  const klassiekMetMedia = alleKlassiekeRegels.flatMap((r) => r.decls.map((d) => `${d.eig}:${d.waarde}`)).join(';');
  check(
    'первинні кнопки (.ov-knop-hoofd, .gm-knop.is-primair / .gm-knop-primair / .gm-knop-hoofd, .ut-knop-primair, .uitrol-meester-cta) використовують var(--mq-knop-primair-bg) та var(--mq-knop-primair-tekst) без #fff і var(--mq-wit)',
    heeftPrimaireStijl(ovHoofdRegel) &&
      heeftPrimaireStijl(gmHoofdRegel) &&
      heeftPrimaireStijl(utHoofdRegel) &&
      !klassiekGecombineerd.includes('var(--mq-wit)') &&
      !klassiekMetMedia.includes('var(--mq-wit)') &&
      !/#fff\b|#ffffff\b|(?<![\w-])white(?![\w-])/i.test(klassiekMetMedia),
  );

  // 8. Геометрія заокруглень 16px / 11px / 999px у панелі огляду (overzicht-maquette.css).
  const ovKaartRegel = ovRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.includes('.ov-w') && s.includes('.ov-balk')),
  );
  const ovKnopRegel = ovRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.includes('.ov-knop') && s.includes('.ov-sluit')),
  );
  const ovPilRegel = ovRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.includes('.ov-live') && s.includes('.ov-seg button')),
  );
  check(
    'у панелі огляду картки й секції (.ov-balk, .ov-lade, .ov-w) мають кути 16px, кнопки та поля — 11px, а пігулки (.ov-live, .ov-seg button, .ov-chips li) — 999px',
    new Map((ovKaartRegel?.decls ?? []).map((d) => [d.eig, d.waarde])).get('border-radius') === '16px' &&
      new Map((ovKnopRegel?.decls ?? []).map((d) => [d.eig, d.waarde])).get('border-radius') === '11px' &&
      new Map((ovPilRegel?.decls ?? []).map((d) => [d.eig, d.waarde])).get('border-radius') === '999px',
  );

  // 9. Геометрія заокруглень 16px / 11px / 999px у сховищі таємниць та майстрі оновлень.
  const gmKaartRegel = gmRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.includes('.gm-kaart')),
  );
  const gmWaardeRegel = gmRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.endsWith('.gm-waarde')),
  );
  const gmPilRegel = gmRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.includes('.gm-chip') && s.includes('.gm-chips button')),
  );
  const utKaartRegel = utRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.includes('.ut-kaart') && s.includes('.uitrol-meester')),
  );
  const utCodeRegel = utRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.includes('.ud-uitvoer') && s.includes('.ut-pre')),
  );
  const utPilRegel = utRegels.find(
    (r) =>
      r.media.length === 0 &&
      r.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && s.includes('.ut-badge') && s.includes('.ud-chip')),
  );
  check(
    'у сховищі таємниць і майстрі оновлень картки, секції, термінал та діалоги мають кути 16px, кнопки, поля, .gm-waarde і консольні блоки коду — 11px, а пігулки — 999px',
    new Map((gmKaartRegel?.decls ?? []).map((d) => [d.eig, d.waarde])).get('border-radius') === '16px' &&
      new Map((gmWaardeRegel?.decls ?? []).map((d) => [d.eig, d.waarde])).get('border-radius') === '11px' &&
      new Map((gmPilRegel?.decls ?? []).map((d) => [d.eig, d.waarde])).get('border-radius') === '999px' &&
      new Map((utKaartRegel?.decls ?? []).map((d) => [d.eig, d.waarde])).get('border-radius') === '16px' &&
      terminalBlokMap.get('border-radius') === '16px' &&
      new Map((utCodeRegel?.decls ?? []).map((d) => [d.eig, d.waarde])).get('border-radius') === '11px' &&
      new Map((utPilRegel?.decls ?? []).map((d) => [d.eig, d.waarde])).get('border-radius') === '999px',
  );

  // 10. Правий відступ шапок діалогів та бічних панелей у всіх трьох модулях суворо <= 20px.
  const normSel = (s: string) => s.replace(/\s*>\s*/g, '>');
  const vindPadding = (regels: Regel[], sub: string, mobiel: boolean) => {
    const doel = normSel(sub);
    const r = regels.find(
      (item) =>
        (mobiel ? item.media.length > 0 : item.media.length === 0) &&
        item.selectors.some((s) => s.includes('[data-maquette-stijl="klassiek"]') && normSel(s).includes(doel)),
    );
    return rechtseOpvullingPx(new Map((r?.decls ?? []).map((d) => [d.eig, d.waarde])).get('padding') ?? '');
  };
  const rechtsWaarden = [
    vindPadding(ovRegels, '.ov-modal-kop', false),
    vindPadding(ovRegels, '.ov-modal-kop', true),
    vindPadding(gmRegels, '.venster.gm-venster .venster-kop', false),
    vindPadding(gmRegels, '.venster.gm-venster .venster-kop', true),
    vindPadding(utRegels, '.ut-lade > header', false),
    vindPadding(utRegels, '.ut-lade > header', true),
    vindPadding(utRegels, '.ut-vr-modal > header', false),
    vindPadding(utRegels, '.ut-modal > header', false),
  ];
  check(
    'правий внутрішній відступ шапок усіх діалогів і бічних шухляд (.ov-modal-kop, .venster.gm-venster .venster-kop, .ut-lade > header, .ut-vr-modal > header, .ut-modal > header) суворо <= 20px на компʼютері й телефоні',
    rechtsWaarden.every((px) => Number.isFinite(px) && px <= 20),
    rechtsWaarden.join(', '),
  );

  // 11. Типографіка без засічок на заголовках і табличні цифри tabular-nums на показниках, таймері 30 с, версіях і контрольних сумах.
  check(
    'заголовки всіх 3 модулів використовують шрифт без засічок var(--mq-font-ui, Inter, system-ui, sans-serif), а показники, таймер 30 с (.gm-teller), версії та часові позначки мають font-variant-numeric: tabular-nums',
    klassiekPcOv.includes('font-family: var(--mq-font-ui, Inter, system-ui, sans-serif);') &&
      klassiekPcGm.includes('font-family: var(--mq-font-ui, Inter, system-ui, sans-serif);') &&
      klassiekPcUt.includes('font-family: var(--mq-font-ui, Inter, system-ui, sans-serif);') &&
      klassiekPcOv.includes('font-variant-numeric: tabular-nums;') &&
      klassiekPcGm.includes('font-variant-numeric: tabular-nums;') &&
      klassiekPcUt.includes('font-variant-numeric: tabular-nums;') &&
      klassiekPcOv.includes('.ov-groot strong') &&
      klassiekPcGm.includes('.gm-teller') &&
      klassiekPcUt.includes('.ut-voortgang b') &&
      klassiekPcUt.includes('.ut-regel-tijd'),
  );

  // 12. Захист рамок :not(#_mqk) поверх flat-content у всіх трьох таблицях: нуль padding і нуль gap.
  const mqkOv = ovRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const mqkGm = gmRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const mqkUt = utRegels.filter((r) => r.selectors.some((s) => s.includes(':not(#_mqk)')));
  const alleMqk = [...mqkOv, ...mqkGm, ...mqkUt];
  const toegestaneMqkEig = new Set(['border', 'border-inline', 'border-left', 'border-radius', 'box-shadow']);
  const verbodenMqkEig = alleMqk.flatMap((r) =>
    r.decls.filter((d) => !toegestaneMqkEig.has(d.eig)).map((d) => d.eig),
  );
  check(
    'правила захисту html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk) у всіх трьох таблицях мають border-radius: 16px і містять винятково border / border-inline / border-left / border-radius / box-shadow (нуль padding і нуль gap)',
    mqkOv.length >= 2 &&
      mqkGm.length >= 2 &&
      mqkUt.length >= 2 &&
      alleMqk.every((r) =>
        r.selectors.every((s) => s.startsWith('html.palet-maquette[data-maquette-stijl="klassiek"]:not(#_mqk)')),
      ) &&
      alleMqk.every((r) => r.decls.some((d) => d.eig === 'border-radius' && d.waarde === '16px')) &&
      verbodenMqkEig.length === 0,
    verbodenMqkEig.join(', '),
  );

  // 13. Порядок настільного класичного блоку перед першим @media, мобільний каскад (wint) та нуль !important / prefers-color-scheme / position: fixed.
  const pcProfiel = { breedte: 1280, hoogte: 800, pointer: 'fine' as const, hover: 'hover' as const };
  const telProfiel = { breedte: 390, hoogte: 844, pointer: 'coarse' as const, hover: 'none' as const };
  const ovModalKopSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .ov-root .ov-modal-kop';
  const gmVensterKopSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .venster.gm-venster .venster-kop';
  const utLadeSel = 'html.palet-maquette[data-maquette-stijl="klassiek"] .ut-root .ut-lade';
  const alleDrieCss = `${overzichtCss}\n${geheimenCss}\n${uitrolCss}`;
  check(
    'класичні настільні блоки розміщені суворо перед першим @media у всіх 3 файлах, поза @media немає пізніших правил, нуль !important / prefers-color-scheme / position: fixed, а мобільні значення перемагають на 390×844',
    idxKlassiekOv > 0 &&
      idxMediaOv > idxKlassiekOv &&
      idxKlassiekGm > 0 &&
      idxMediaGm > idxKlassiekGm &&
      idxKlassiekUt > 0 &&
      idxMediaUt > idxKlassiekUt &&
      inhoudBuitenMediaBlokken(overzichtCss, idxMediaOv) === '' &&
      inhoudBuitenMediaBlokken(geheimenCss, idxMediaGm) === '' &&
      inhoudBuitenMediaBlokken(uitrolCss, idxMediaUt) === '' &&
      klassiekStaartOv.includes('@media (max-width: 700px)') &&
      klassiekStaartGm.includes('@media (max-width: 640px)') &&
      klassiekStaartUt.includes('@media (max-width: 640px)') &&
      !/!\s*important/i.test(alleDrieCss) &&
      !/prefers-color-scheme/i.test(alleDrieCss) &&
      !/position\s*:\s*fixed/i.test(alleDrieCss) &&
      wint(ovRegels, ovModalKopSel, 'padding', pcProfiel)?.waarde === '16px 20px' &&
      wint(ovRegels, ovModalKopSel, 'padding', telProfiel)?.waarde === '14px 16px' &&
      wint(gmRegels, gmVensterKopSel, 'padding', pcProfiel)?.waarde === '10px 16px' &&
      wint(gmRegels, gmVensterKopSel, 'padding', telProfiel)?.waarde === '8px 14px' &&
      wint(utRegels, utLadeSel, 'padding', pcProfiel)?.waarde === '18px 20px' &&
      wint(utRegels, utLadeSel, 'padding', telProfiel)?.waarde === '14px 16px',
  );

  // 14. Абсолютна мовна чистота у всіх 4 файлах контуру KLASSIEK-010B.
  const gecontroleerdeBestanden: readonly [string, string][] = [
    ['src/overzicht/overzicht-maquette.css', overzichtCss],
    ['src/geheimen/geheimen-maquette.css', geheimenCss],
    ['src/uitrol/uitrol-maquette.css', uitrolCss],
    ['tests/eenheid/klassiek-010b-beheer-kluis-uitrol.test.ts', zelfTest],
  ];
  const taalOvertredingen = gecontroleerdeBestanden
    .filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud))
    .map(([pad]) => pad);
  check(
    'жоден із чотирьох файлів контуру KLASSIEK-010B не містить заборонених символів російської абетки',
    taalOvertredingen.length === 0,
    taalOvertredingen.join(', '),
  );

  return einde();
}
