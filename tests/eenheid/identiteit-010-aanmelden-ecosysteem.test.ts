// IDENTITEIT-010: комплексні модульні випробування екосистеми входу, сесій, сповіщень, теми, світлин і вигляду «Макет» (усі 16 вимог).
// Omvattende eenheidstests voor aanmelden via Telegram op elk subdomein, knoppen en volledig aanmeldscherm, eerlijke pauze bij te veel
// verzoeken (429), pijlen, themaknoppen, meldingen van 2 seconden met vasthouden, uniform accountmenu v3, opgeslagen accounts, actieve
// sessiestabiliteit, vierkante profielfoto's, hoofdmenu en zoeken in de maquette, secties onder aanmeldmethoden en de taalwet.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { checker, nepGoogle } from './hulp/nep-google';
import { error as antwoordFout } from '../../server/platform/antwoord';
import { closePool, getPool } from '../../server/platform/pg';
import { nepBrowser } from './hulp/nep-browser';
import { instellingenCacheWissen, vlagCacheWissen } from '../../backend/telegram-aanmelden/opslag';
import { zetKluisVoorTest } from '../../backend/telegram-aanmelden/sleutels';

const lees = (pad: string): string => readFileSync(pad, 'utf8');
const leesOptioneel = (pad: string): string => (existsSync(pad) ? readFileSync(pad, 'utf8') : '');

/** Легке ізольоване середовище оглядача для перевірки маршрутизації піддоменів у Node без зовнішніх залежностей. */
function metNepLocatie<T>(adres: string, fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const namen = ['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'navigator'] as const;
  const vorige = new Map(namen.map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const maakOpslag = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => { m.set(k, String(v)); },
      removeItem: (k: string) => { m.delete(k); },
      clear: () => m.clear(),
      key: () => null,
      length: 0,
    };
  };
  const u = new URL(adres);
  const doc = {
    hidden: false,
    title: '',
    cookie: '',
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    querySelector: () => null,
    querySelectorAll: () => [],
    head: { appendChild: () => undefined },
    createElement: () => ({ getContext: () => null, dataset: {} }),
  };
  Object.defineProperty(g, 'document', { value: doc, configurable: true, writable: true });
  Object.defineProperty(g, 'location', {
    value: { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(g, 'sessionStorage', { value: maakOpslag(), configurable: true, writable: true });
  Object.defineProperty(g, 'localStorage', { value: maakOpslag(), configurable: true, writable: true });
  Object.defineProperty(g, 'history', { value: { pushState: () => undefined, replaceState: () => undefined, state: null }, configurable: true, writable: true });
  Object.defineProperty(g, 'navigator', { value: { language: 'uk-UA', maxTouchPoints: 0 }, configurable: true, writable: true });
  g.window = Object.assign(g, { name: '', innerWidth: 1280, innerHeight: 800, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }) });
  runInNewContext(lees('public/canonical-service.js'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  try {
    return fn();
  } finally {
    for (const [k, d] of vorige) {
      if (d) Object.defineProperty(g, k, d);
      else delete g[k];
    }
    delete g.__TSV_CANONICAL_SERVICE__;
  }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-010-aanmelden-ecosysteem');
  nepBrowser('https://hub.tarasevych.com');
  const { domains, sessieDienst } = await import('../../src/canoniek-navigatie');
  const { AUTO_SECONDEN, popupLevensduurMs } = await import('../../src/canoniek-meldingen');
  const { MIN_NA_PAUZE_MS, fractie, gepauzeerd, klaar, nieuweAftelling, pauze, tik, verleng } = await import('../../src/meldingen/aftelling');
  const { ACCOUNTMENU_V3_VLAG } = await import('../../src/accountmenu-v3/vlag');

  const backend = lees('backend/index.ts');
  const startServer = lees('server/start.ts');
  const antwoordBron = lees('server/platform/antwoord.ts');
  const tgRoutes = lees('backend/telegram-aanmelden/routes.ts');
  const tgInloggen = lees('backend/telegram-aanmelden/inloggen.ts');
  const tgSleutels = lees('backend/telegram-aanmelden/sleutels.ts');
  const aanmeldKoppel = lees('backend/aanmeld-koppel.ts');
  const clientBron = lees('src/platform/client.ts');
  const appBron = lees('src/App.tsx');
  const verenigdBron = lees('src/VerenigdDienstApp.tsx');
  const hubAuthBron = lees('src/useCanoniekHubAuth.ts');
  const omleidingBron = lees('src/aanmeld-omleiding.ts');
  const pauzeBron = leesOptioneel('src/aanmeld-pauze.ts');
  const omlijstingBron = lees('src/CanoniekOmlijsting.tsx');
  const canoniekCss = lees('src/canoniek-omlijsting.css');
  const aanmeldHerontwerpCss = lees('src/aanmeld-herontwerp.css');
  const tgAanmeldBron = lees('src/telegram-aanmelden/AanmeldTelegram.tsx');
  const tgApiBron = lees('src/telegram-aanmelden/api.ts');
  const tgConfigBron = lees('src/telegram-aanmelden/aanmeld-config.ts');
  const tgSectieBron = lees('src/telegram-aanmelden/TelegramSectie.tsx');
  const tgCss = lees('src/telegram-aanmelden/telegram.css');
  const plaatsingBeheerBron = lees('src/telegram-aanmelden/PlaatsingBeheer.tsx');
  const primitievenCss = lees('src/ontwerp/primitieven.css');
  const accountMenuBron = lees('src/CanoniekAccountMenu.tsx');
  const accountMenuCss = lees('src/canoniek-account-menu.css');
  const afgemeldMenuCss = lees('src/account-afgemeld-menu.css');
  const am2Css = lees('src/accountmenu-v2/accountmenu-v2.css');
  const am3VlagBron = lees('src/accountmenu-v3/vlag.ts');
  const am3Bron = lees('src/accountmenu-v3/AccountMenuV3.tsx');
  const am3Css = lees('src/accountmenu-v3/accountmenu-v3.css');
  const meldingCentrumBron = lees('src/CanoniekMeldingencentrum.tsx');
  const meldingCentrumCss = lees('src/canoniek-meldingencentrum.css');
  const gedeeldeVoorkeuren = lees('src/gedeelde-voorkeuren.ts');
  const stabielAvatarBron = lees('src/StabielAvatar.tsx');
  const profielfotoBron = lees('src/identiteit/Profielfoto.tsx');
  const maquetteCss = lees('src/identiteit/maquette/maquette-omlijsting.css');
  const maquetteSjabloon = lees('src/identiteit/maquette/maquette-sjabloon.ts');
  const zoekGlobaalBron = lees('src/zoek/ZoekGlobaal.tsx');
  const toegangslaagCss = lees('src/toegangslaag.css');

  // =========================================================================
  // 1. Вхід через Telegram на всіх 10 канонічних піддоменах без OWNER_TRANSACTION_ORIGIN_INVALID
  // =========================================================================
  const verwachteDiensten: ReadonlyArray<readonly [string, string]> = [
    ['hub.tarasevych.com', 'hub'],
    ['id.tarasevych.com', 'identity'],
    ['ai.tarasevych.com', 'ai'],
    ['mail.tarasevych.com', 'mail'],
    ['cloud.tarasevych.com', 'cloud'],
    ['github.tarasevych.com', 'github'],
    ['huis.tarasevych.com', 'huis'],
    ['api.tarasevych.com', 'api'],
    ['admin.tarasevych.com', 'admin'],
    ['mcp.tarasevych.com', 'mcp'],
  ];
  check(
    '01a. sessieDienst визначає точну канонічну службу для кожного з 10 піддоменів *.tarasevych.com (включно з hub → hub)',
    verwachteDiensten.every(([host, dienst]) => Object.values(domains).includes(host) && metNepLocatie(`https://${host}/`, () => sessieDienst()) === dienst),
  );
  check(
    '01b. telegramAanmeldStart у серверному ядрі визначає службу динамічно за піддоменом, звіряє походження та підтримує повернення на піддомен джерела',
    !/telegramAanmeldStart\s*=[\s\S]{0,160}const service:ServiceId='identity'/.test(backend) &&
      backend.includes('telegramAanmeldStart') &&
      backend.includes('ownerOrigin(') &&
      backend.includes('ownerRedirectReturnTo(') &&
      tgAanmeldBron.includes('/api/aanmelden/telegram/start') &&
      (tgAanmeldBron.includes('sessieDienst') || tgAanmeldBron.includes('sourceOrigin')) &&
      tgAanmeldBron.includes('returnTo') &&
      tgApiBron.includes('OWNER_TRANSACTION_ORIGIN_INVALID'),
  );

  // =========================================================================
  // 2. Зовнішній вигляд кнопки «Увійти через Telegram» на екрані входу (усі 4 теми без ефекту зрізаного верху)
  // =========================================================================
  check(
    '02. кнопка «Увійти через Telegram» захищена від правила .canonical-signed-out button, має цілісну форму пігулки й контрастні повідомлення .tga-fout',
    (aanmeldHerontwerpCss.includes('.canonical-signed-out.mr-sign-in .tga-aanmeld-knop') ||
      canoniekCss.includes(':not(.tga-aanmeld-knop)')) &&
      aanmeldHerontwerpCss.includes('theme-plum-light') &&
      aanmeldHerontwerpCss.includes('theme-plum-dark') &&
      !tgCss.includes('.tga-fout{color:#c62828;'),
  );

  // =========================================================================
  // 3. Єдність сховища ключів сервісної інтеграції Telegram та стійкість завантаження налаштувань
  // =========================================================================
  check(
    '03. модуль входу через Telegram читає ключ бота зі сховища власника (owner_vault_v1, purpose=telegram) та не блокує налаштування після тимчасового збою мережі',
    (tgSleutels.includes('telegram-bot-token') || tgSleutels.includes("purpose === 'telegram'")) &&
      !aanmeldKoppel.includes('вбудову заплановано наступним кроком') &&
      tgConfigBron.includes('/api/aanmelden/telegram/config'),
  );

  // =========================================================================
  // 4. Міграція 0209 контексту безпеки Telegram та відсутність колізії параметра id у вікні входу
  // =========================================================================
  const migratiePad0209 = readdirSync('migrations').find((naam) => naam.startsWith('0209_') && naam.endsWith('.sql'));
  const migratie0209 = migratiePad0209 ? lees(`migrations/${migratiePad0209}`) : '';
  check(
    '04a. міграція 0209 повторостійка (IF NOT EXISTS) та розширює контекст безпеки входу через Telegram',
    Boolean(migratiePad0209) &&
      migratie0209.includes('IF NOT EXISTS') &&
      migratie0209.includes('tg_inlog_verzoeken'),
  );
  check(
    '04b. офіційне вікно входу Telegram не перезаписує код запиту числовим id користувача Telegram і повертає користувача на перевірену адресу транзакції',
    !/widget-terug\?id=\$\{/.test(tgRoutes) &&
      (/widget-terug\?(?:i|verzoek)=/.test(tgRoutes) || tgInloggen.includes('widgetTerug')) &&
      tgRoutes.includes('inlogGeluktMelden'),
  );

  // =========================================================================
  // 5. Повноекранний інтерфейс сторінки входу (100 % вікна без вкладеної рамки та чужого тла)
  // =========================================================================
  check(
    '05. екран входу займає 100 % області перегляду без зовнішніх полів, вимикає тло попереднього робочого столу й не накладає білу завісу на темну тему',
    /min-height:\s*100dvh/.test(aanmeldHerontwerpCss) &&
      /margin:\s*0\s*!important/.test(aanmeldHerontwerpCss) &&
      aanmeldHerontwerpCss.includes('.schil-achtergrond:has(.mr-sign-in)::before') &&
      /font-family:\s*inherit/.test(aanmeldHerontwerpCss) &&
      !/rgba\(255,\s*255,\s*255,\s*\.29\)/.test(aanmeldHerontwerpCss),
  );

  // =========================================================================
  // 6. Чесне обмеження частоти запитів HTTP 429 із точним Retry-After та живим зворотним відліком
  // =========================================================================
  const fout429 = (antwoordFout as (m: string, s?: number, extra?: { retryAfter?: number }) => { statusCode: number; headers: Record<string, string>; body: string })(
    'RATE_LIMITED',
    429,
    { retryAfter: 42 },
  );
  const fout429Data = JSON.parse(fout429.body) as { error?: string; retryAfter?: number };
  check(
    '06a. серверний формувач помилок та обмежувач частоти запитів повертають заголовок Retry-After і точне число секунд retryAfter при HTTP 429',
    fout429.statusCode === 429 &&
      fout429.headers['Retry-After'] === '42' &&
      fout429Data.error === 'RATE_LIMITED' &&
      fout429Data.retryAfter === 42 &&
      antwoordBron.includes('Retry-After') &&
      startServer.includes('Retry-After'),
  );
  check(
    '06b. клієнт зберігає retryAfter у ApiError та веде зворотний відлік очікування замість суперечливого напису «можна одразу спробувати ще раз» при RATE_LIMITED',
    clientBron.includes('retryAfter') &&
      !/RATE_LIMITED[^\n]{0,80}одразу спробувати/.test(hubAuthBron) &&
      (Boolean(pauzeBron) || omleidingBron.includes('retryAfter') || hubAuthBron.includes('Pauze') || verenigdBron.includes('Pauze')),
  );

  // =========================================================================
  // 7. Векторні стрілки розгортання та єдиний стандарт <details > summary> без сплющення
  // =========================================================================
  check(
    '07. розкривні блоки <details > summary> мають єдиний векторний кутик з обертанням на 180°, усі стрілки розгортання захищені flex-shrink: 0, а сирі символи ⌄ прибрано',
    primitievenCss.includes('::-webkit-details-marker') &&
      primitievenCss.includes('rotate(180deg)') &&
      /flex-shrink:\s*0/.test(primitievenCss) &&
      !omlijstingBron.includes(">⌄<") &&
      !plaatsingBeheerBron.includes('Інші способи входу ⌄') &&
      maquetteCss.includes(':where(.mr-mq .mq-echt-inhoud svg)'),
  );

  // =========================================================================
  // 8. Кнопки вибору теми та кольорів без налізання й кругла кнопка профілю у кутку екрана входу
  // =========================================================================
  check(
    '08. перемикачі теми вишикувані у простору сітку 2×2 із незмінними піктограмами flex: none, а кутова кнопка профілю на екрані входу зберігає круглу форму 38×38 px',
    /repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(am2Css) &&
      /repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(accountMenuCss) &&
      /min-height:\s*38px/.test(afgemeldMenuCss) &&
      (/not\(\[data-signed-out=['"]true['"]\]\)/.test(am3Css) || am3VlagBron.includes('STANDAARD_ACCOUNTMENU_V3 = true')),
  );

  // =========================================================================
  // 9. Спливні сповіщення на 2 секунди (2000 мс) із призупиненням мишею та пальцем на дотиковому екрані
  // =========================================================================
  const standaardLevensduur = (['success', 'info', 'warning', 'error'] as const).every(
    (soort) => AUTO_SECONDEN[soort] === 2 && popupLevensduurMs({ vast: false, seconden: 0 }, 'Довгий текст перевірки сповіщення', 'Додаткове пояснення', soort) === 2000,
  );
  const eigenLevensduur = popupLevensduurMs({ vast: false, seconden: 6 }, 'Текст', '', 'info') === 6000 && popupLevensduurMs({ vast: true, seconden: 0 }, 'Текст', '', 'info') === null;
  let klok = nieuweAftelling(2000);
  klok = tik(klok, 700); // залишилося 1300 мс
  klok = pauze(klok, 'aanraking', true);
  const tijdensVasthouden = tik(klok, 5000); // під пальцем час стоїть на місці
  const naLoslaten = pauze(tijdensVasthouden, 'aanraking', false);
  let bijnaOp = tik(nieuweAftelling(2000), 1850); // залишилося 150 мс (< 500 мс)
  bijnaOp = pauze(pauze(bijnaOp, 'muis', true), 'muis', false);
  const verlengdeKlok = verleng(bijnaOp, 2000);
  check(
    '09a. спливні сповіщення типово тривають рівно 2000 мс, зупиняються під час утримання мишею чи пальцем (aanraking) та зберігають щонайменше 500 мс після відпускання',
    standaardLevensduur &&
      eigenLevensduur &&
      MIN_NA_PAUZE_MS === 500 &&
      gepauzeerd(tijdensVasthouden) &&
      tijdensVasthouden.over === 1300 &&
      !gepauzeerd(naLoslaten) &&
      naLoslaten.over === 1300 &&
      bijnaOp.over === 500 &&
      verlengdeKlok.over === 2000 &&
      fractie(verlengdeKlok) === 1 &&
      klaar(tik(naLoslaten, 1300)),
  );
  check(
    '09b. картка сповіщення слухає ведення й утримання пальцем (touchstart / touchmove / touchend), вимикає виділення тексту й зупиняє смужку через animation-play-state: paused',
    meldingCentrumBron.includes("'aanraking'") &&
      meldingCentrumBron.includes('touchmove') &&
      /user-select:\s*none/.test(meldingCentrumCss) &&
      /animation-play-state:\s*paused/.test(meldingCentrumCss),
  );

  // =========================================================================
  // 10. Єдиний вигляд спадного вікна облікових записів (AccountMenuV3) до входу й після входу без кутових насічок
  // =========================================================================
  check(
    `10. спадне вікно ${ACCOUNTMENU_V3_VLAG} увімкнено типово до входу та після входу (displayUser: AccountMenuUser | null) і не має видимих косих насічок у кутах нижньої частини`,
    /STANDAARD_ACCOUNTMENU_V3\s*=\s*true/.test(am3VlagBron) &&
      !accountMenuBron.includes('am3 && displayUser') &&
      /displayUser:\s*AccountMenuUser\s*\|\s*null/.test(am3Bron) &&
      !am3Bron.includes('M2 6l4 4M2 2l8 8') &&
      !am3Bron.includes('M10 6l-4 4M10 2l-8 8'),
  );

  // =========================================================================
  // 11. Швидкий вхід за збереженим обліковим записом в один дотик, світлина профілю та перевірений login_hint
  // =========================================================================
  check(
    '11. екран входу показує світлину збереженого облікового запису, запускає прямий вхід в один дотик на всіх піддоменах та передає перевірений login_hint у Google',
    (omlijstingBron.includes('resolveAccountPhoto') || omlijstingBron.includes('mr-sign-in-avatar')) &&
      omlijstingBron.includes('onSelectAccount') &&
      appBron.includes('onSelectAccount={selectKnownAccount}') &&
      verenigdBron.includes('onSelectAccount={selectKnownAccount}') &&
      verenigdBron.includes("onGoogle={()=>connect('login')}") &&
      backend.includes('login_hint'),
  );

  // =========================================================================
  // 12. Єдиний активний обліковий запис оглядача та стабільність сесії між сторінками й піддоменами
  // =========================================================================
  check(
    '12. зміна облікового запису узгоджує спільні налаштування подання між піддоменами й негайно завершує технічний профіль попереднього облікового запису',
    backend.includes('ownerActivateBrowserAccount') &&
      backend.includes('techBeeindigenBijUitloggen') &&
      gedeeldeVoorkeuren.includes('tsv_ecosystem_preferences') &&
      (gedeeldeVoorkeuren.includes('WEERGAVE_ACCOUNT_REV') || gedeeldeVoorkeuren.includes('rememberViewAccountEverywhere')),
  );

  // =========================================================================
  // 13. Квадратне кадрування 1:1 власної світлини профілю та надійні круглі світлини з переходом на ініціали
  // =========================================================================
  check(
    '13. підготовка світлини профілю кадрує зображення у квадрат 1:1 у межах серверного обмеження base64, а круглі світлини мають referrerPolicy="no-referrer" і перехід на ініціали при збої',
    /square\?:\s*boolean/.test(clientBron) &&
      /square:\s*true/.test(appBron) &&
      /square:\s*true/.test(verenigdBron) &&
      /referrerPolicy=['"]no-referrer['"]/.test(stabielAvatarBron) &&
      stabielAvatarBron.includes('onError') &&
      /referrerPolicy=['"]no-referrer['"]/.test(profielfotoBron),
  );

  // =========================================================================
  // 14. Головне меню платформи та загальносайтовий пошук у вигляді «Макет» на id.tarasevych.com
  // =========================================================================
  check(
    '14. вигляд «Макет» зберігає головне меню сайту, виносить внутрішній перемикач розділів сторінки в окрему підсмугу й підключає єдиний пошук платформи з пріоритетом розділів ідентичності',
    !maquetteCss.includes("html[data-identiteit-maquette='aan'] .canonical-chrome :is(.canonical-sidebar,.canonical-sidebar-edge-zone") &&
      maquetteSjabloon.includes('mqSectieBalk') &&
      !omlijstingBron.includes('{zoekInMenu&&<ZoekMenuKnop') &&
      zoekGlobaalBron.includes('IDENTITEIT_TABS'),
  );

  // =========================================================================
  // 15. Охайне впорядкування розділів і перемикачів під «Способами входу» (id.tarasevych.com/aanmeldmethoden)
  // =========================================================================
  check(
    '15. розділи під «Способами входу» захищають перемикачі й прапорці від розтягування в .settings-center, зберігають стилі кнопок у шарі .amv-laag і компактно групують таблицю дій Telegram',
    (tgSectieBron.includes('tga-schakel-invoer') || tgCss.includes('.settings-center')) &&
      toegangslaagCss.includes('.amv-laag') &&
      (tgSectieBron.includes('MATRIX_GROEPEN') || tgSectieBron.includes('openForm')),
  );

  // =========================================================================
  // 16a. Живий інтеграційний контур маршрутів (справжній обробник запитів і база даних PostgreSQL, коли задано DATABASE_URL)
  // =========================================================================
  if (process.env.DATABASE_URL) {
    const { createServer } = await import('node:http');
    const nepTg = createServer((req, res) => {
      const m = String(req.url || '').split('/').pop() || '';
      const result = m === 'getMe'
        ? { id: 7712039941, is_bot: true, username: 'MijnRuimteTest_Bot', first_name: 'Мій простір' }
        : m === 'getUserProfilePhotos'
          ? { total_count: 0, photos: [] }
          : { message_id: 1 };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, result }));
    });
    await new Promise<void>((ok) => nepTg.listen(0, '127.0.0.1', () => ok()));
    const tgPoort = (nepTg.address() as { port: number }).port;
    const vorigeTgBasis = process.env.TELEGRAM_API_BASIS;
    process.env.TELEGRAM_API_BASIS = `http://127.0.0.1:${tgPoort}`;

    const pool = getPool('systeem');
    const T = `${Date.now()}-${randomBytes(3).toString('hex')}`;
    const bestaandeEigenaar = (await pool.query<{ email: string }>(
      "SELECT data->>'email' AS email FROM app.records WHERE tbl = 'users' AND data->>'role' = 'owner' LIMIT 1",
    )).rows[0];
    const eigenaarEmail = bestaandeEigenaar?.email || `id010-eigenaar-${T}@example.test`;
    const subEigenaar = `sub-id010-${T}`;
    const kluisGeheugen = new Map<string, string>([
      ['telegram-bot-token', '7712039941:AAHeenheidstest_geldig_formaat_sleutel_01'],
      ['TELEGRAM_AANMELD_WEBHOOK_GEHEIM', 'w'.repeat(40)],
      ['TELEGRAM_AANMELD_PEPER', 'p'.repeat(40)],
    ]);
    const G = await nepGoogle({ ownerEmail: eigenaarEmail });
    let vorigeVlag: { aan: boolean; standaard: boolean } | null = null;
    let vorigeInstellingen: { waarde: unknown } | null = null;
    try {
      const vlagRij = await pool.query<{ aan: boolean; standaard: boolean }>(
        "SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'telegram-aanmelden-v1'",
      );
      vorigeVlag = vlagRij.rows[0] ?? null;
      const instRij = await pool.query<{ waarde: unknown }>(
        "SELECT waarde FROM app.tg_instellingen WHERE id = 'actief'",
      );
      vorigeInstellingen = instRij.rows[0] ?? null;
      await pool.query("UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel = 'telegram-aanmelden-v1'");
      await pool.query(
        `INSERT INTO app.tg_instellingen (id, waarde)
         VALUES ('actief', $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET waarde = app.tg_instellingen.waarde || EXCLUDED.waarde`,
        [JSON.stringify({ aan: true })],
      );
      zetKluisVoorTest({
        eigenaar: async () => 'id010-eigenaar',
        lees: async (_o, naam) => kluisGeheugen.get(naam) || '',
        leesIntegratie: async () => ({ waarde: kluisGeheugen.get('telegram-bot-token')!, naam: 'telegram-bot-token' }),
        bewaar: async (_o, naam, waarde) => { kluisGeheugen.set(naam, waarde); },
        wis: async (_o, naam) => { kluisGeheugen.delete(naam); },
      } as never);
      vlagCacheWissen();
      instellingenCacheWissen();

      // Створюємо схваленого користувача для живого входу через імітований вхід Google з remember=true, а потім перевіряємо чистий оглядач.
      const opzetBrowser = G.browser();
      const loginMail = `id010-tg-${T}@example.test`;
      await opzetBrowser.aanmelden(subEigenaar, loginMail, { service: 'hub', intent: 'login', remember: true });
      await pool.query(
        "UPDATE app.records SET data = jsonb_set(data, '{status}', '\"approved\"'::jsonb, true) WHERE tbl = 'users' AND data->>'email' = $1",
        [loginMail],
      );
      const bootEigenaar = await opzetBrowser.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', opzetBrowser.ctxBody('hub'));
      const userId = String(bootEigenaar.data?.user?.id || '');

      // Прив'язуємо випробувальний обліковий запис Telegram у базі даних для перевірки повного потоку входу з hub.tarasevych.com та mail.tarasevych.com.
      const tgUserId = String(900_000_000 + Math.floor(Math.random() * 90_000_000));
      const koppelRij = await pool.query<{ id: string }>(
        `INSERT INTO app.tg_koppelingen (user_id, telegram_id, chat_id, telefoon, gebruikersnaam, voornaam, naam, rechten, stand)
         VALUES ($1, $2, $2, '+380501112233', 'id010_gebruiker', 'Павло', 'Основний', ARRAY['aanmelden','bevestigen','meldingen'], 'actief')
         RETURNING id`,
        [userId, tgUserId],
      );
      const koppelingId = koppelRij.rows[0]!.id;

      // Перевірка старту входу через Telegram на піддоменах hub.tarasevych.com та mail.tarasevych.com.
      const hubBrowser = G.browser();
      const startHub = await hubBrowser.verzoek('hub.tarasevych.com', '/api/aanmelden/telegram/start', {
        service: 'hub',
        tab: hubBrowser.tab,
        tabContext: hubBrowser.tab,
        sourceOrigin: 'https://hub.tarasevych.com',
        returnTo: 'https://hub.tarasevych.com/?tab=notes',
        locale: 'uk',
        remember: true,
      });
      const mailBrowser = G.browser();
      const startMail = await mailBrowser.verzoek('mail.tarasevych.com', '/api/aanmelden/telegram/start', {
        service: 'mail',
        tab: mailBrowser.tab,
        tabContext: mailBrowser.tab,
        sourceOrigin: 'https://mail.tarasevych.com',
        returnTo: 'https://mail.tarasevych.com/',
        locale: 'nl',
        remember: false,
      });
      check(
        '16a-1. живий старт входу через Telegram успішно працює на hub.tarasevych.com та mail.tarasevych.com і видає захищений реп’яшок прив’язки вкладки',
        startHub.status === 200 &&
          typeof startHub.data.id === 'string' &&
          typeof startHub.data.geheim === 'string' &&
          [...hubBrowser.jar.keys()].some((naam) => naam.startsWith('__Secure-tsv_aanmeld_binding_')) &&
          startMail.status === 200 &&
          typeof startMail.data.id === 'string',
        `hub=${startHub.status} (${String(startHub.data.error || 'ok')}), mail=${startMail.status}`,
      );

      // Перевірка відсікання підміни походження та відкритого переспрямування.
      const kwaadOrigin = await G.browser().verzoek(
        'hub.tarasevych.com',
        '/api/aanmelden/telegram/start',
        { service: 'hub', tab: hubBrowser.tab, sourceOrigin: 'https://evil.example', returnTo: 'https://hub.tarasevych.com/', locale: 'uk', remember: false },
        { kop: { origin: 'https://evil.example' } },
      );
      const kwaadReturn = await G.browser().verzoek('hub.tarasevych.com', '/api/aanmelden/telegram/start', {
        service: 'hub',
        tab: hubBrowser.tab,
        sourceOrigin: 'https://hub.tarasevych.com',
        returnTo: 'https://evil.example/stelen',
        locale: 'uk',
        remember: false,
      });
      check(
        '16a-2. сервер відхиляє підміну Origin та спробу відкритого переспрямування returnTo на сторонній домен',
        kwaadOrigin.status >= 400 && kwaadReturn.status === 400,
        `origin=${kwaadOrigin.status}, returnTo=${kwaadReturn.status}`,
      );

      // Підтвердження запиту входу на hub.tarasevych.com: спроба завершити в іншому оглядачі без реп'яшка прив'язки мусить отримати 403 LOGIN_BINDING_MISMATCH,
      // а в рідному оглядачі — створити живу екосистемну сесію з поверненням на https://hub.tarasevych.com/?tab=notes.
      await pool.query(
        `UPDATE app.tg_inlog_verzoeken
            SET stand = 'goedgekeurd', user_id = $2, koppeling_id = $3, telegram_id = $4, code_nodig = false
          WHERE id = $1`,
        [startHub.data.id, userId, koppelingId, tgUserId],
      );
      const vreemdeBrowser = G.browser();
      const gestolenPoging = await vreemdeBrowser.verzoek('hub.tarasevych.com', '/api/aanmelden/telegram/voltooien', {
        id: startHub.data.id,
        geheim: startHub.data.geheim,
      });
      await pool.query("UPDATE app.tg_inlog_verzoeken SET stand = 'goedgekeurd' WHERE id = $1", [startHub.data.id]);
      const voltooidHub = await hubBrowser.verzoek('hub.tarasevych.com', '/api/aanmelden/telegram/voltooien', {
        id: startHub.data.id,
        geheim: startHub.data.geheim,
      });
      const bootNaTelegram = await hubBrowser.verzoek('hub.tarasevych.com', '/api/owner/session/bootstrap', {
        service: 'hub',
        tabContext: hubBrowser.tab,
      });
      check(
        '16a-3. завершення входу через Telegram блокує чужий оглядач без реп’яшка прив’язки (403) і відкриває повноцінну сесію в рідному оглядачі на hub.tarasevych.com',
        gestolenPoging.status === 403 &&
          String(gestolenPoging.data.reasonCode || gestolenPoging.data.error) === 'LOGIN_BINDING_MISMATCH' &&
          voltooidHub.status === 200 &&
          voltooidHub.data.sessionCreated === true &&
          String(voltooidHub.data.returnTo || '').startsWith('https://hub.tarasevych.com/') &&
          String(bootNaTelegram.data?.state || '') !== 'signed_out' &&
          bootNaTelegram.data?.user?.id === userId,
        `gestolen=${gestolenPoging.status} (${String(gestolenPoging.data.reasonCode || gestolenPoging.data.error)}), voltooid=${voltooidHub.status}, user=${String(bootNaTelegram.data?.user?.id || '')}`,
      );

      await pool.query('DELETE FROM app.tg_inlog_verzoeken WHERE id IN ($1, $2)', [startHub.data.id, startMail.data.id]);
      await pool.query('DELETE FROM app.tg_koppelingen WHERE id = $1', [koppelingId]);
    } finally {
      if (vorigeVlag) {
        await pool.query("UPDATE app.feature_flags SET aan = $1, standaard = $2 WHERE sleutel = 'telegram-aanmelden-v1'", [
          vorigeVlag.aan,
          vorigeVlag.standaard,
        ]).catch(() => undefined);
      }
      if (vorigeInstellingen) {
        await pool.query("UPDATE app.tg_instellingen SET waarde = $1::jsonb WHERE id = 'actief'", [
          JSON.stringify(vorigeInstellingen.waarde),
        ]).catch(() => undefined);
      } else {
        await pool.query("DELETE FROM app.tg_instellingen WHERE id = 'actief'").catch(() => undefined);
      }
      if (vorigeTgBasis === undefined) delete process.env.TELEGRAM_API_BASIS;
      else process.env.TELEGRAM_API_BASIS = vorigeTgBasis;
      await new Promise<void>((ok) => nepTg.close(() => ok()));
      zetKluisVoorTest(null);
      vlagCacheWissen();
      instellingenCacheWissen();
      G.herstel();
      await closePool().catch(() => undefined);
    }
  }

  // =========================================================================
  // 16b. Абсолютний мовний закон та політика безпеки вмісту (відсутність заборонених літер і вбудованих сценаріїв)
  // =========================================================================
  const verbodenLetters = /[\u0401\u0451\u042a\u044a\u042b\u044b\u042d\u044d]/;
  const gecontroleerdeBestanden: ReadonlyArray<readonly [string, string]> = [
    ['backend/index.ts', backend],
    ['server/platform/antwoord.ts', antwoordBron],
    ['backend/telegram-aanmelden/routes.ts', tgRoutes],
    ['backend/telegram-aanmelden/inloggen.ts', tgInloggen],
    ['backend/telegram-aanmelden/sleutels.ts', tgSleutels],
    ['src/platform/client.ts', clientBron],
    ['src/App.tsx', appBron],
    ['src/VerenigdDienstApp.tsx', verenigdBron],
    ['src/aanmeld-omleiding.ts', omleidingBron],
    ['src/useCanoniekHubAuth.ts', hubAuthBron],
    ['src/CanoniekOmlijsting.tsx', omlijstingBron],
    ['src/aanmeld-herontwerp.css', aanmeldHerontwerpCss],
    ['src/telegram-aanmelden/AanmeldTelegram.tsx', tgAanmeldBron],
    ['src/telegram-aanmelden/api.ts', tgApiBron],
    ['src/telegram-aanmelden/aanmeld-config.ts', tgConfigBron],
    ['src/telegram-aanmelden/TelegramSectie.tsx', tgSectieBron],
    ['src/telegram-aanmelden/telegram.css', tgCss],
    ['src/telegram-aanmelden/PlaatsingBeheer.tsx', plaatsingBeheerBron],
    ['src/ontwerp/primitieven.css', primitievenCss],
    ['src/CanoniekAccountMenu.tsx', accountMenuBron],
    ['src/account-afgemeld-menu.css', afgemeldMenuCss],
    ['src/accountmenu-v2/accountmenu-v2.css', am2Css],
    ['src/accountmenu-v3/vlag.ts', am3VlagBron],
    ['src/accountmenu-v3/AccountMenuV3.tsx', am3Bron],
    ['src/accountmenu-v3/accountmenu-v3.css', am3Css],
    ['src/CanoniekMeldingencentrum.tsx', meldingCentrumBron],
    ['src/canoniek-meldingencentrum.css', meldingCentrumCss],
    ['src/gedeelde-voorkeuren.ts', gedeeldeVoorkeuren],
    ['src/StabielAvatar.tsx', stabielAvatarBron],
    ['src/identiteit/Profielfoto.tsx', profielfotoBron],
    ['src/identiteit/maquette/maquette-omlijsting.css', maquetteCss],
    ['src/zoek/ZoekGlobaal.tsx', zoekGlobaalBron],
    ['src/toegangslaag.css', toegangslaagCss],
    ...(pauzeBron ? [['src/aanmeld-pauze.ts', pauzeBron] as const] : []),
    ...(migratie0209 && migratiePad0209 ? [[`migrations/${migratiePad0209}`, migratie0209] as const] : []),
  ];
  const overtreders = gecontroleerdeBestanden.filter(([, inhoud]) => verbodenLetters.test(inhoud)).map(([naam]) => naam);
  const clientTsxBestanden = [appBron, verenigdBron, omlijstingBron, tgAanmeldBron, tgSectieBron, accountMenuBron, am3Bron, meldingCentrumBron, stabielAvatarBron, profielfotoBron, zoekGlobaalBron];
  const geenIngebedScriptOfStijl = clientTsxBestanden.every((inhoud) => !/<script\b|<style\b/i.test(inhoud));
  check(
    '16b. усі змінені файли IDENTITEIT-010 дотримуються мовного закону (жодної літери російської абетки) та політики безпеки вмісту (без вбудованих <script> і <style>)',
    overtreders.length === 0 && geenIngebedScriptOfStijl,
    overtreders.join(', '),
  );

  return einde();
}
