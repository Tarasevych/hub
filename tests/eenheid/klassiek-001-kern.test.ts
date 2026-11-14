// KLASSIEK-001 (Хвиля 0 тем оформлення «Біла класика» та «Чорна класика»):
// перевірка ядра палітр klassiek-wit і klassiek-zwart, прагматичної системи maquette-kern,
// класичного центру облікового запису id.tarasevych.com та екранів входу без порушення чинних тем.
// Eenheidstest voor het kernstelsel van «Witte klassiek» en «Zwarte klassiek», maquette-kern en het accountcentrum.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

export async function main(): Promise<number> {
  const { check, einde } = checker('klassiek-001-kern');

  const uiterlijk = readFileSync('shared/uiterlijk.ts', 'utf8');
  const kern = readFileSync('src/thema/kern.ts', 'utf8');
  const canonicalRuntime = readFileSync('public/canonical-service.js', 'utf8');
  const paletten = readFileSync('src/thema/paletten.ts', 'utf8');
  const useThema = readFileSync('src/thema/useThema.ts', 'utf8');
  const themaInstellingen = readFileSync('src/thema/ThemaInstellingen.tsx', 'utf8');
  const accountMenu = readFileSync('src/CanoniekAccountMenu.tsx', 'utf8');
  const am3Voorkeuren = readFileSync('src/accountmenu-v3/accountmenu-v3-voorkeuren.ts', 'utf8');
  const indexHtml = readFileSync('index.html', 'utf8');
  const mainTsx = readFileSync('src/main.tsx', 'utf8');

  const klassiekHulp = readFileSync('src/maquette-kern/klassiek-hulp.ts', 'utf8');
  const maquetteHeld = readFileSync('src/maquette-kern/MaquetteHeld.tsx', 'utf8');
  const maquetteKaart = readFileSync('src/maquette-kern/MaquetteSectieKaart.tsx', 'utf8');
  const maquetteRail = readFileSync('src/maquette-kern/MaquetteAnkerRail.tsx', 'utf8');
  const maquetteVoet = readFileSync('src/maquette-kern/MaquetteVoet.tsx', 'utf8');
  const maquetteKlassiekCss = readFileSync('src/maquette-kern/maquette-klassiek.css', 'utf8');

  const vormgeving = readFileSync('src/identiteit/identiteit-vormgeving.ts', 'utf8');
  const accountPagina = readFileSync('src/identiteit/IdentiteitAccountPagina.tsx', 'utf8');
  const identiteitKlassiek = readFileSync('src/identiteit/IdentiteitKlassiekMaquette.tsx', 'utf8');
  const identiteitKlassiekCss = readFileSync('src/identiteit/identiteit-klassiek-maquette.css', 'utf8');
  const gast = readFileSync('src/GastToegang.tsx', 'utf8');
  const omlijsting = readFileSync('src/CanoniekOmlijsting.tsx', 'utf8');
  const nietGevonden = readFileSync('src/NietGevonden.tsx', 'utf8');
  const aanmeldenCss = readFileSync('src/maquette-kern/maquette-aanmelden.css', 'utf8');

  // 1. Наскрізна реєстрація палітр klassiek-wit та klassiek-zwart.
  check(
    'shared/uiterlijk, src/thema/kern, public/canonical-service та index.html узгоджено реєструють klassiek-wit і klassiek-zwart',
    uiterlijk.includes("'klassiek-wit'") &&
      uiterlijk.includes("'klassiek-zwart'") &&
      kern.includes("'klassiek-wit'") &&
      kern.includes("'klassiek-zwart'") &&
      kern.includes('isKlassiekPalet') &&
      canonicalRuntime.includes('klassiek-wit') &&
      canonicalRuntime.includes('klassiek-zwart') &&
      paletten.includes('KLASSIEK_WIT') &&
      paletten.includes('KLASSIEK_ZWART') &&
      useThema.includes('useIsKlassiek') &&
      indexHtml.includes('klassiek-wit') &&
      indexHtml.includes('klassiek-zwart'),
  );

  check(
    'Налаштування тем та обидва меню облікового запису (CanoniekAccountMenu і AccountMenuV3) пропонують Білу класику та Чорну класику',
    themaInstellingen.includes('Біла класика') &&
      themaInstellingen.includes('Witte klassiek') &&
      themaInstellingen.includes('Чорна класика') &&
      themaInstellingen.includes('Zwarte klassiek') &&
      accountMenu.includes('data-thema-klassiek-wit') &&
      accountMenu.includes('data-thema-klassiek-zwart') &&
      am3Voorkeuren.includes("'klassiek-wit'") &&
      am3Voorkeuren.includes("'klassiek-zwart'"),
  );

  // 2. Порядок таблиць стилів у точці входу застосунку.
  const idxAanmelden = mainTsx.indexOf("import './maquette-kern/maquette-aanmelden.css';");
  const idxKlassiek = mainTsx.indexOf("import './maquette-kern/maquette-klassiek.css';");
  check(
    'src/main.tsx підключає maquette-klassiek.css одразу після maquette-aanmelden.css',
    idxAanmelden > 0 && idxKlassiek > idxAanmelden,
  );

  // 3. Прагматичне спільне ядро maquette-kern.
  check(
    'MaquetteHeld, MaquetteSectieKaart, MaquetteAnkerRail та MaquetteVoet втілюють прагматичний режим класики без декоративних сцен і зі згорнутою за замовчуванням рейкою',
    klassiekHulp.includes('useIsKlassiekMaquette') &&
      maquetteHeld.includes('is-klassiek') &&
      maquetteKaart.includes('is-klassiek') &&
      maquetteRail.includes('mr-klassiek-rail-v1') &&
      maquetteRail.includes('mq-anker-ingeklapt-pil') &&
      maquetteVoet.includes('is-klassiek'),
  );

  const mkEersteMedia = maquetteKlassiekCss.search(/@media\s*\(\s*max-width/);
  const mkNaMedia = mkEersteMedia >= 0 ? maquetteKlassiekCss.slice(mkEersteMedia).replace(/@media\s*\([^)]*\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '').trim() : '';
  check(
    'maquette-klassiek.css визначає порцелянову (#f6f7f9) та оніксову (#0c0e12) палітри з заокругленнями 16px/11px без position:fixed та з @media наприкінці',
    maquetteKlassiekCss.includes('html.palet-klassiek-wit') &&
      maquetteKlassiekCss.includes('html.palet-klassiek-zwart') &&
      maquetteKlassiekCss.includes('#f6f7f9') &&
      maquetteKlassiekCss.includes('#0c0e12') &&
      maquetteKlassiekCss.includes('16px') &&
      maquetteKlassiekCss.includes('11px') &&
      !/position\s*:\s*fixed/i.test(maquetteKlassiekCss) &&
      !/prefers-color-scheme/i.test(maquetteKlassiekCss) &&
      !/!important/i.test(maquetteKlassiekCss) &&
      mkEersteMedia > 0 &&
      mkNaMedia === '',
  );

  // 4. Класичний центр облікового запису id.tarasevych.com та екрани входу/404/гостьового залу.
  const ikEersteMedia = identiteitKlassiekCss.search(/@media\s*\(\s*max-width/);
  const ikNaMedia = ikEersteMedia >= 0 ? identiteitKlassiekCss.slice(ikEersteMedia).replace(/@media\s*\([^)]*\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '').trim() : '';
  check(
    'IdentiteitAccountPagina монтує IdentiteitKlassiekMaquette для klassiek-wit та klassiek-zwart із дотриманням CSS-дисципліни',
    vormgeving.includes('isKlassiekMaquettePalet') &&
      accountPagina.includes('IdentiteitKlassiekMaquette') &&
      identiteitKlassiek.includes('ikm-wortel') &&
      identiteitKlassiek.includes('identity-sectie-') &&
      identiteitKlassiek.includes('MaquetteSnelNaar') &&
      identiteitKlassiek.includes('MaquetteAnkerRail') &&
      !/position\s*:\s*fixed/i.test(identiteitKlassiekCss) &&
      !/prefers-color-scheme/i.test(identiteitKlassiekCss) &&
      !/!important/i.test(identiteitKlassiekCss) &&
      ikEersteMedia > 0 &&
      ikNaMedia === '',
  );

  check(
    'GastToegang, CanoniekOmlijsting, NietGevonden і maquette-aanmelden.css узгоджено підтримують Білу та Чорну класику',
    gast.includes('klassiek-wit') &&
      gast.includes('klassiek-zwart') &&
      omlijsting.includes('klassiek') &&
      nietGevonden.includes('klassiek') &&
      aanmeldenCss.includes('palet-klassiek-wit') &&
      aanmeldenCss.includes('palet-klassiek-zwart'),
  );

  // 5. Перевірка мовної чистоти у всіх файлах контуру KLASSIEK-001.
  const bestanden: readonly [string, string][] = [
    ['shared/uiterlijk.ts', uiterlijk],
    ['src/thema/kern.ts', kern],
    ['public/canonical-service.js', canonicalRuntime],
    ['src/thema/paletten.ts', paletten],
    ['src/thema/useThema.ts', useThema],
    ['src/thema/ThemaInstellingen.tsx', themaInstellingen],
    ['src/CanoniekAccountMenu.tsx', accountMenu],
    ['src/accountmenu-v3/accountmenu-v3-voorkeuren.ts', am3Voorkeuren],
    ['src/main.tsx', mainTsx],
    ['src/maquette-kern/klassiek-hulp.ts', klassiekHulp],
    ['src/maquette-kern/MaquetteHeld.tsx', maquetteHeld],
    ['src/maquette-kern/MaquetteSectieKaart.tsx', maquetteKaart],
    ['src/maquette-kern/MaquetteAnkerRail.tsx', maquetteRail],
    ['src/maquette-kern/MaquetteVoet.tsx', maquetteVoet],
    ['src/maquette-kern/maquette-klassiek.css', maquetteKlassiekCss],
    ['src/identiteit/identiteit-vormgeving.ts', vormgeving],
    ['src/identiteit/IdentiteitAccountPagina.tsx', accountPagina],
    ['src/identiteit/IdentiteitKlassiekMaquette.tsx', identiteitKlassiek],
    ['src/identiteit/identiteit-klassiek-maquette.css', identiteitKlassiekCss],
    ['src/GastToegang.tsx', gast],
    ['src/CanoniekOmlijsting.tsx', omlijsting],
    ['src/NietGevonden.tsx', nietGevonden],
    ['src/maquette-kern/maquette-aanmelden.css', aanmeldenCss],
    ['tests/eenheid/klassiek-001-kern.test.ts', readFileSync('tests/eenheid/klassiek-001-kern.test.ts', 'utf8')],
  ];
  const overtredingen = bestanden.filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud)).map(([pad]) => pad);
  check(
    'жоден файл контуру KLASSIEK-001 не містить заборонених символів російської абетки',
    overtredingen.length === 0,
    overtredingen.join(', '),
  );

  return einde();
}
