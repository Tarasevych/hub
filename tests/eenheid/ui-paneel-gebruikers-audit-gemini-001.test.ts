// Комплексна модульна перевірка для задачі GEMINI-001 (портал меню облікових записів, ліве й праве меню,
// пошукова кнопка, групування й картки користувачів, фільтри й картки аудиту, таблиця пристроїв, перетягування
// способів входу, локальне розкриття майстра інтеграцій та сторінка підключень API).
// Без зовнішнього з'єднання з базою даних (перевірка чистих функцій і вихідних артефактів інтерфейсу).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checker } from './hulp/nep-google';
import {
  groepeerVergelijkbareGebruikers,
  normaliseerNaamSleutel,
  redenLabel,
  translitNaarLatijn,
  type GroepeerbareGebruiker,
} from '../../shared/gebruikers-groepering';
import { STANDAARD_PLAATSING, verplaatsen } from '../../shared/aanmeld-plaatsing/plaatsing';
import { LEEG, filtersActief, periodeLabel } from '../../src/audit/types';

const lees = (relPad: string) => readFileSync(resolve(relPad), 'utf8');

export async function main(): Promise<number> {
  const { check, einde } = checker('ui-paneel-gebruikers-audit-gemini-001');

  // 1. Портал панелі облікових записів та захист від закриття лівої панелі при відкритті меню
  const accountMenuTsx = lees('src/CanoniekAccountMenu.tsx');
  const accountMenuCss = lees('src/canoniek-account-menu.css');
  const omlijstingTsx = lees('src/CanoniekOmlijsting.tsx');
  const menuV2Css = lees('src/menu-v2.css');
  const maquetteCss = lees('src/maquette-kern/maquette-oppervlakken.css');

  const railZMatch = /\.mq-anker-rail\s*\{[^}]*z-index:\s*(\d+)/.exec(maquetteCss);
  const portaalZMatch = /\.canonical-account-portal\s*\{[^}]*z-index:\s*(\d+)/.exec(accountMenuCss);
  const railZ = Number(railZMatch?.[1] || 0);
  const portaalZ = Number(portaalZMatch?.[1] || 0);

  check(
    '1a портал меню облікових записів виводиться напряму в document.body із шаром вище .mq-anker-rail',
    accountMenuTsx.includes('createPortal(') &&
      accountMenuTsx.includes('document.body') &&
      accountMenuTsx.includes("className={`canonical-account-portal ${portaalCtx.themaKlasse}`}") &&
      portaalZ > railZ &&
      railZ > 0,
    `rail=${railZ}, portal=${portaalZ}`,
  );
  check(
    '1b оболонка лівого меню не закривається при кліку чи Escape усередині порталу облікових записів',
    omlijstingTsx.includes('.canonical-account-portal') &&
      accountMenuTsx.includes('portaalRef.current?.contains(event.target as Node)'),
  );
  check(
    '1c верхівка розгорнутого лівого меню не переносить кнопки та не обрізає позначки',
    menuV2Css.includes('width:min(316px,calc(100vw - var(--zijbalk-rail)))') &&
      menuV2Css.includes('.zijbalk-werkbalk.breed{display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap') &&
      menuV2Css.includes('.zijbalk-werkbalk-titel{display:inline-flex;align-items:center;gap:5px;flex:none;white-space:nowrap'),
  );

  // 2. Групова структура правої панелі якорів та релевантні пункти на службах
  const ankerRailTsx = lees('src/maquette-kern/MaquetteAnkerRail.tsx');
  const aiDienstTsx = lees('src/AIDienstWeergave.tsx');
  const mcpDienstTsx = lees('src/McpDienstWeergave.tsx');
  const beheerConsoleTsx = lees('src/BeheerConsoleWeergave.tsx');

  check(
    '2a MaquetteAnkerRail підтримує вкладені групи (kinderen), перемикач стану та налаштування',
    ankerRailTsx.includes('kinderen?: ReadonlyArray<MaquetteAnkerItem>') &&
      ankerRailTsx.includes('openStandaard?: boolean') &&
      ankerRailTsx.includes('mq-anker-groep-toggle') &&
      ankerRailTsx.includes('mq-anker-sublijst') &&
      ankerRailTsx.includes('<Settings '),
  );
  check(
    '2b сторінка ai.*/werkgebied має групову праву навігацію (Робота / Усі інструменти) і підключені переходи',
    aiDienstTsx.includes("id: 'ai-voor-u'") &&
      aiDienstTsx.includes("label: tr('ШІ для вас', 'AI voor u')") &&
      aiDienstTsx.includes("label: tr('Робота', 'Werken')") &&
      aiDienstTsx.includes("label: tr('Усі інструменти', 'Alle hulpmiddelen')") &&
      aiDienstTsx.includes('tsv:ai-werk-weergave'),
  );
  check(
    '2c сторінка admin.*/updates у правій панелі показує локальні розділи оновлень, а mcp.* — локальні блоки',
    beheerConsoleTsx.includes("id:'upd-tab:overzicht'") &&
      beheerConsoleTsx.includes("label:tr(lang,'Огляд','Overzicht')") &&
      beheerConsoleTsx.includes("id:'upd-tab:historie'") &&
      beheerConsoleTsx.includes("id:'upd-tab:log'") &&
      beheerConsoleTsx.includes("id:'upd-tab:diagnose'") &&
      beheerConsoleTsx.includes("id:'upd-tab:instellen'") &&
      mcpDienstTsx.includes('actiefBlok') &&
      mcpDienstTsx.includes('t("На цій сторінці", "Op deze pagina")'),
  );

  // 3. Адаптивність пошукової кнопки та картки + групування користувачів
  const zoekCss = lees('src/zoek/zoek.css');
  const consoleCss = lees('src/beheer-console.css');

  check(
    '3a рядок пошуку .zk-trigger має гнучку ширину та стискання/згортання до кнопки при вузькому вікні',
    zoekCss.includes('width:clamp(9.5rem,19vw,19rem)') &&
      zoekCss.includes('@media (max-width:1380px)') &&
      zoekCss.includes('@media (max-width:1160px)') &&
      zoekCss.includes('@media (max-width:960px)'),
  );

  check(
    '3b транслітерація об’єднує кириличний і латинський запис імені та очищує псевдо-назви',
    translitNaarLatijn('Павло Тарасевич') === translitNaarLatijn('Pavlo Tarasevych') &&
      normaliseerNaamSleutel('Тарасевич Павло') === normaliseerNaamSleutel('Pavlo Tarasevych') &&
      normaliseerNaamSleutel('admin owner user') === '',
  );

  const testGebruikers: GroepeerbareGebruiker[] = [
    {
      id: 'u-1',
      name: 'Павло Тарасевич',
      email: 'pavlo.tarasevych@gmail.com',
      personRef: 'PRS-101',
      owner: true,
      workspaceRole: 'admin',
      status: 'approved',
    },
    {
      id: 'u-2',
      name: 'Pavlo Tarasevych',
      email: 'p.tarasevych+work@googlemail.com',
      personRef: 'PRS-101',
      owner: false,
      workspaceRole: 'member',
      status: 'approved',
    },
    {
      id: 'u-3',
      name: 'Pavlo T.',
      email: 'pavlots@outlook.com',
      personRef: 'PRS-101',
      owner: false,
      workspaceRole: 'member',
      status: 'approved',
    },
    {
      id: 'u-4',
      name: 'Тарасевич Павло',
      email: 'ptarasevych@proton.me',
      owner: false,
      workspaceRole: 'member',
      status: 'approved',
    },
    {
      id: 'u-5',
      name: 'Олена Ковальчук',
      email: 'olena.kovalchuk@example.org',
      personRef: 'PRS-202',
      owner: false,
      workspaceRole: 'member',
      status: 'approved',
    },
    {
      id: 'u-6',
      name: 'Admin',
      email: 'admin@example.org',
      personRef: 'PRS-303',
      owner: false,
      workspaceRole: 'viewer',
      status: 'pending',
    },
  ];

  const groepering = groepeerVergelijkbareGebruikers(testGebruikers);
  check(
    '3c алгоритм групує 4 пов’язані облікові записи в одну групу з власником і не чіпає сторонніх',
    groepering.groepen.length === 1 &&
      groepering.groepen[0].leden.length === 4 &&
      groepering.groepen[0].heeftEigenaar === true &&
      groepering.groepen[0].sterkte === 'hoog' &&
      !groepering.groepPerUserId.has('u-5') &&
      !groepering.groepPerUserId.has('u-6'),
    `groepen=${groepering.groepen.length}, leden=${groepering.groepen[0]?.leden.length ?? 0}`,
  );
  check(
    '3d двомовні пояснення підстав групування uk/nl без заборонених літер російської абетки',
    (['person_ref', 'email_alias', 'email_local', 'name_match', 'name_email_match'] as const).every((r) => {
      const uk = redenLabel('uk', r);
      const nl = redenLabel('nl', r);
      return Boolean(uk && nl) && !/[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/.test(uk) && !/[\u0401\u0451\u042A\u044A\u042B\u044B\u042D\u044D]/.test(nl);
    }),
  );
  check(
    '3e захист власника в картці користувача виразно позначений, а перемикачі мають сучасний вигляд',
    beheerConsoleTsx.includes('admin-user-lock-note') &&
      beheerConsoleTsx.includes("data-vergrendeld={item.owner?'true':undefined}") &&
      consoleCss.includes('.admin-user-veld[data-vergrendeld=\'true\']') &&
      consoleCss.includes('.admin-recht-schakelaar') &&
      consoleCss.includes('@container admin-access'),
  );

  // 4. Журнал аудиту: чесний статус ланцюжка, підзаголовки фільтрів і вкладення дій усередині картки
  const auditTsx = lees('src/audit/AuditPagina.tsx');
  const auditCss = lees('src/audit/audit.css');

  check(
    '4a у картці ланцюжка немає панічного «Не перевірено» до запуску звірки',
    !auditTsx.includes('Не перевірено') &&
      auditTsx.includes('Готово до перевірки') &&
      auditTsx.includes('Потрібна повторна звірка'),
  );
  check(
    '4b фільтри аудиту мають розділені секції з підзаголовками та прозорий рядок активного періоду',
    auditTsx.includes('aj-filter-sectie') &&
      auditTsx.includes('aj-filter-samenvatting') &&
      auditTsx.includes('aj-actief-kop') &&
      filtersActief(LEEG) === 0 &&
      filtersActief({ ...LEEG, periode: '30d' }) === 1 &&
      periodeLabel('7d', 'uk') === '7 днів',
  );
  check(
    '4c рядки журналу аудиту мають внутрішню сітку .aj-regel-hoofd і контейнерну перебудову без виходу кнопок назовні',
    auditTsx.includes('aj-regel-hoofd') &&
      auditTsx.includes('aj-regel-status') &&
      auditCss.includes('@container aj-lijst (max-width:860px)') &&
      auditCss.includes('@container aj-lijst (max-width:560px)'),
  );

  // 5. Адаптація admin.*/apparaten і перетягування способів входу
  check(
    '5a таблиця подій пристроїв має адаптивний перехід у картковий вигляд з підписами data-label',
    beheerConsoleTsx.includes("id='admin-devices-list'") &&
      beheerConsoleTsx.includes("data-label={tr(lang,'Подія / користувач'") &&
      consoleCss.includes('.admin-table article>span[data-label]::before') &&
      consoleCss.includes('@media (max-width:520px)'),
  );

  const voorNaarAchter = verplaatsen(STANDAARD_PLAATSING, 'google', 'apple');
  const achterNaarVoor = verplaatsen(voorNaarAchter, 'apple', 'telegram');
  const gelijk = verplaatsen(STANDAARD_PLAATSING, 'telegram', 'telegram');
  const plaatingTsx = lees('src/telegram-aanmelden/PlaatsingBeheer.tsx');
  const telegramCss = lees('src/telegram-aanmelden/telegram.css');

  check(
    '5b verplaatsen коректно переставляє елементи вперед і назад без дублювання або втрати методів',
    voorNaarAchter.volgorde.indexOf('google') === 3 &&
      achterNaarVoor.volgorde.indexOf('apple') === 0 &&
      gelijk === STANDAARD_PLAATSING &&
      voorNaarAchter.volgorde.length === STANDAARD_PLAATSING.volgorde.length,
  );
  check(
    '5c PlaatsingBeheer підтримує перетягування (draggable, onDragStart, onDrop) поруч зі стрілками',
    plaatingTsx.includes('draggable={!bezig}') &&
      plaatingTsx.includes('verplaatsen(p, bron, m)') &&
      plaatingTsx.includes('tga-plaatsing-greep') &&
      telegramCss.includes('.tga-plaatsing-greep'),
  );

  // 6. Локальний майстер підключень CatalogusV2 та виправлення api.*/verbindingen
  const catalogusTsx = lees('src/integraties/CatalogusV2.tsx');
  const integratiesCss = lees('src/integraties/integraties.css');
  const integratiesMaquetteCss = lees('src/integraties/integraties-maquette.css');
  const apiPlatformTsx = lees('src/ApiPlatformWeergave.tsx');
  const apiSleutelsCss = lees('src/api-sleutels-maquette.css');
  const apiWeergaveCss = lees('src/api-platform-weergave.css');

  check(
    '6a CatalogusV2 відкриває майстер одразу під натиснутою карткою без стрибка window.scrollTo',
    !catalogusTsx.includes('window.scrollTo') &&
      catalogusTsx.includes('wisselWizard') &&
      catalogusTsx.includes("className='ic2-wizard-rij'") &&
      catalogusTsx.includes("data-wizard-open={isWizardOpen ? 'ja' : undefined}") &&
      integratiesCss.includes('.ic2-wizard-rij') &&
      integratiesMaquetteCss.includes('.ic2-kaart[data-wizard-open="ja"]'),
  );

  const hadWindow = 'window' in globalThis;
  const hadLocation = 'location' in globalThis;
  const hadDocument = 'document' in globalThis;
  const oudeWindow = (globalThis as Record<string, unknown>).window;
  const oudeLocation = (globalThis as Record<string, unknown>).location;
  const oudeDocument = (globalThis as Record<string, unknown>).document;

  const nepLoc = { hostname: 'api.tarasevych.com', pathname: '/verbindingen', search: '', hash: '', origin: 'https://api.tarasevych.com', replace: () => {} };
  const nepDoc = {
    documentElement: { lang: 'uk', style: { visibility: '' } },
    head: { appendChild: () => {} },
    cookie: '',
    querySelectorAll: () => [],
    createElement: () => ({ rel: '', href: '', type: '', dataset: {}, getContext: () => null }),
  };
  const nepWin: Record<string, unknown> = {
    location: nepLoc,
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  new Function('window', 'location', 'document', lees('public/canonical-service.js'))(nepWin, nepLoc, nepDoc);
  (globalThis as Record<string, unknown>).window = nepWin;
  (globalThis as Record<string, unknown>).location = nepLoc;
  (globalThis as Record<string, unknown>).document = nepDoc;

  const { strookItems } = await import('../../src/integraties/IntegratieStrook');
  const zonderSkip = strookItems('api');
  const metSkip = strookItems('api', ['telegram']);

  if (!hadWindow) delete (globalThis as Record<string, unknown>).window;
  else (globalThis as Record<string, unknown>).window = oudeWindow;
  if (!hadLocation) delete (globalThis as Record<string, unknown>).location;
  else (globalThis as Record<string, unknown>).location = oudeLocation;
  if (!hadDocument) delete (globalThis as Record<string, unknown>).document;
  else (globalThis as Record<string, unknown>).document = oudeDocument;

  check(
    '6b IntegratieStrook підтримує пропуск дубльованого telegram на api.*/verbindingen без втрати інших',
    zonderSkip.zichtbaar.some((i) => i.id === 'telegram') &&
      !metSkip.zichtbaar.some((i) => i.id === 'telegram') &&
      metSkip.zichtbaar.some((i) => i.id === 'rest-api') &&
      metSkip.zichtbaar.some((i) => i.id === 'oauth-clients') &&
      zonderSkip.totaal === metSkip.totaal + 1,
  );
  check(
    '6c ApiPlatformWeergave має канонічні переходи, умовну смугу v2, приховування дубля заголовка й обтікання вузьких рядків',
    apiPlatformTsx.includes('canoniekeStapHref') &&
      apiPlatformTsx.includes("canonicalNavigationUrl('api','access',lang)") &&
      apiPlatformTsx.includes("canonicalNavigationUrl('api','vault',lang)") &&
      apiPlatformTsx.includes("canonicalNavigationUrl('api','verbindingen',lang)") &&
      apiPlatformTsx.includes('useCatalogusV2()') &&
      apiPlatformTsx.includes("<IntegratieStrook lang={lang} dienst='api' overslaan={['telegram']}/>") &&
      apiSleutelsCss.includes('overflow-wrap: anywhere') &&
      apiWeergaveCss.includes('overflow-wrap:anywhere'),
  );

  return einde();
}
