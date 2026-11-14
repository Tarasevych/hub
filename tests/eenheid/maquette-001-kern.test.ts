// MAQUETTE-001 (контур ядра входу, 404, гостьового залу та центру облікового запису):
// перевірка інтеграції загальносайтової палітри «Макет» без порушення чинних меж безпеки й навігації.
// Eenheidstest voor de integratie van het sitebrede palet «maquette» met aanmelden, 404, gasttoegang en accountcentrum.
import { readFileSync } from 'node:fs';
import { checker } from './hulp/nep-google';

const VERBODEN_LETTERS = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;

export async function main(): Promise<number> {
  const { check, einde } = checker('maquette-001-kern');

  const vormgeving = readFileSync('src/identiteit/identiteit-vormgeving.ts', 'utf8');
  const accountPagina = readFileSync('src/identiteit/IdentiteitAccountPagina.tsx', 'utf8');
  const omlijsting = readFileSync('src/CanoniekOmlijsting.tsx', 'utf8');
  const nietGevonden = readFileSync('src/NietGevonden.tsx', 'utf8');
  const gast = readFileSync('src/GastToegang.tsx', 'utf8');
  const autoriseer = readFileSync('src/EigenaarIdentiteitAutoriseer.tsx', 'utf8');
  const aanmeldenCss = readFileSync('src/maquette-kern/maquette-aanmelden.css', 'utf8');
  const mainTsx = readFileSync('src/main.tsx', 'utf8');

  // 1. Інтеграція вибору вигляду центру облікового запису з палітрою «Макет».
  check(
    'identiteit-vormgeving поєднує прапорець і загальносайтову палітру maquette без втрати базових підрядків',
    vormgeving.includes("useThemaStand") &&
      vormgeving.includes("leesKeuze") &&
      vormgeving.includes("=== 'maquette'") &&
      vormgeving.includes("VORMGEVINGEN.filter((v) => v !== 'maquette')") &&
      vormgeving.includes("return beschikbaar[0] ?? 'studio';") &&
      vormgeving.includes("['maquette', 'studio', 'klassiek']") &&
      vormgeving.includes('[beschikbaar.length, stand.palet]'),
  );

  check(
    'IdentiteitAccountPagina вмикає вибір вигляду та запобіжник MaquetteGrens за палітри maquette',
    accountPagina.includes('useThemaStand') &&
      accountPagina.includes('leesKeuze') &&
      accountPagina.includes("=== 'maquette'") &&
      accountPagina.includes('class MaquetteGrens extends Component') &&
      accountPagina.includes('<MaquetteGrens terugval={klassiek}>') &&
      accountPagina.includes("vormgeving === 'maquette'") &&
      accountPagina.includes("vormgeving === 'studio'") &&
      accountPagina.includes('<VormgevingKiezer lang={lang} compact />') &&
      accountPagina.includes("<div className='ia-vormgeving-voet'><VormgevingKiezer lang={lang} /></div>") &&
      accountPagina.includes('werkruimte.scrollTo({ top: 0 })'),
  );

  // 2. Підключення таблиць стилів палітри «Макет» у точці входу застосунку.
  const idxFundament = mainTsx.indexOf("import './ontwerp/fundament.css';");
  const idxMobiel = mainTsx.indexOf("import './mobiel-ux.css';");
  const idxTokens = mainTsx.indexOf("import './maquette-kern/maquette-tokens.css';");
  const idxOppervlakken = mainTsx.indexOf("import './maquette-kern/maquette-oppervlakken.css';");
  const idxAanmelden = mainTsx.indexOf("import './maquette-kern/maquette-aanmelden.css';");
  check(
    'main.tsx підключає всі три таблиці стилів maquette-kern у правильному порядку після fundament.css та mobiel-ux.css',
    idxFundament >= 0 &&
      idxMobiel > idxFundament &&
      idxTokens > idxMobiel &&
      idxOppervlakken > idxTokens &&
      idxAanmelden > idxOppervlakken,
  );

  // 3. Збереження ключових ознак безпеки й входу в CanoniekOmlijsting.tsx.
  check(
    'CanoniekOmlijsting позначає контур data-oppervlak і зберігає всі елементи входу LOGIN-001 поруч зі сферою maquette',
    omlijsting.includes('data-oppervlak={oppervlak}') &&
      omlijsting.includes("data-login-design='LOGIN-001'") &&
      omlijsting.includes("data-merk-officieel='google'") &&
      omlijsting.includes('<AanmeldAndereOpties') &&
      omlijsting.includes('<AanmeldTelegram') &&
      omlijsting.includes("className='mq-aanmeld-sfeer'") &&
      omlijsting.includes('МІЙ ПРОСТІР · ЄДИНИЙ ВХІД') &&
      omlijsting.includes('MIJN RUIMTE · ÉÉN AANMELDING'),
  );

  // 4. Сторінка 404 (NietGevonden.tsx) та гостьовий зал (GastToegang.tsx) і перехід підтвердження (EigenaarIdentiteitAutoriseer.tsx).
  check(
    'NietGevonden зберігає ознаки доступності й навігації та додає студійну вітрину 404 для палітри maquette',
    nietGevonden.includes("className='niet-gevonden' role='main' aria-labelledby='niet-gevonden-kop' data-niet-gevonden={route.path}") &&
      nietGevonden.includes("<h1 id='niet-gevonden-kop'>") &&
      nietGevonden.includes("className='mq-niet-gevonden-vitrine'") &&
      nietGevonden.includes("className='mq-niet-gevonden-bovenregel'"),
  );

  check(
    'GastToegang синхронізує палітру на автономному маршруті /toegang і зберігає всі маркери гостьового сеансу',
    gast.includes('__TSV_PRESENTATION__') &&
      gast.includes('palet-maquette') &&
      gast.includes('data-gast-inwisselen') &&
      gast.includes('data-gast-banner') &&
      gast.includes('data-gast-tab=') &&
      gast.includes('data-gast-inhoud=') &&
      gast.includes("className='mq-gast-sfeer'"),
  );

  check(
    'EigenaarIdentiteitAutoriseer використовує змінну стартового тла --boot-bg замість прозорого спалаху',
    autoriseer.includes("background:'var(--boot-bg, transparent)'") &&
      !autoriseer.includes("background:'transparent'"),
  );

  // 5. Дисципліна таблиці стилів maquette-aanmelden.css: без position: fixed, мобільні медіазапити лише наприкінці.
  const eersteMedia = aanmeldenCss.search(/@media\s*\(\s*max-width/);
  const naEersteMedia = eersteMedia >= 0 ? aanmeldenCss.slice(eersteMedia) : '';
  const voorEersteMedia = eersteMedia >= 0 ? aanmeldenCss.slice(0, eersteMedia) : aanmeldenCss;
  const laatsteBasisRegel = Math.max(
    voorEersteMedia.lastIndexOf('.gast-inhoud'),
    voorEersteMedia.lastIndexOf('.niet-gevonden'),
    voorEersteMedia.lastIndexOf('.mr-sign-in'),
  );
  // Перевіряємо, що після першого @media (max-width: ...) немає правил вищого рівня поза блоками @media.
  const zonderMediaBlokken = naEersteMedia.replace(/@media\s*\([^)]*\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '').trim();

  check(
    'maquette-aanmelden.css оформлює темний (#090e1b) і світлий (#edf0f6) режими входу, 404 та гостьового залу без position: fixed',
    aanmeldenCss.includes('html.palet-maquette') &&
      aanmeldenCss.includes('#090e1b') &&
      aanmeldenCss.includes('#edf0f6') &&
      aanmeldenCss.includes('.canonical-signed-out.mr-sign-in') &&
      aanmeldenCss.includes('.niet-gevonden') &&
      aanmeldenCss.includes('.gast-kaart') &&
      aanmeldenCss.includes('.gast-banner') &&
      aanmeldenCss.includes('.gast-tabs') &&
      aanmeldenCss.includes('.gast-inhoud') &&
      !/position\s*:\s*fixed/i.test(aanmeldenCss) &&
      !/prefers-color-scheme/i.test(aanmeldenCss),
  );

  check(
    'усі правила @media (max-width: ...) у maquette-aanmelden.css розміщено суворо наприкінці після основних правил',
    eersteMedia > laatsteBasisRegel && laatsteBasisRegel > 0 && zonderMediaBlokken === '',
  );

  // 6. Сувора перевірка мовної чистоти у всіх змінених і створених файлах контуру.
  const bestanden: readonly [string, string][] = [
    ['src/identiteit/identiteit-vormgeving.ts', vormgeving],
    ['src/identiteit/IdentiteitAccountPagina.tsx', accountPagina],
    ['src/CanoniekOmlijsting.tsx', omlijsting],
    ['src/NietGevonden.tsx', nietGevonden],
    ['src/GastToegang.tsx', gast],
    ['src/EigenaarIdentiteitAutoriseer.tsx', autoriseer],
    ['src/maquette-kern/maquette-aanmelden.css', aanmeldenCss],
    ['src/main.tsx', mainTsx],
    ['tests/eenheid/maquette-001-kern.test.ts', readFileSync('tests/eenheid/maquette-001-kern.test.ts', 'utf8')],
  ];
  const overtredingen = bestanden.filter(([, inhoud]) => VERBODEN_LETTERS.test(inhoud)).map(([pad]) => pad);
  check(
    'жоден файл контуру MAQUETTE-001-kern не містить заборонених символів російської абетки',
    overtredingen.length === 0,
    overtredingen.join(', '),
  );

  return einde();
}
