export const meta = {
  name: 'beveiligingsaudit',
  description: 'Глибокий аудит безпеки всього сховища — 13 ділянок, відтворення кожної знахідки тестом, патчі за групами файлів, незалежна перевірка патчів і доопрацювання',
  phases: [
    { title: 'Audit', detail: '13 перевіряльників, лише читання' },
    { title: 'Herstel', detail: 'відтворення тестом і патчі за групами файлів, що не перетинаються' },
    { title: 'Toets', detail: 'незалежна перевірка патчів: обхід, регресії, інтерфейс і мова' },
    { title: 'Afwerking', detail: 'доопрацювання й звіт двома мовами' },
  ],
}
// Параметри (args) — усі обов'язкові, крім wortel:
//   taak            номер завдання, наприклад "SEC-003" (зареєструй через node scripts/orch.mjs taak-start)
//   datum           дата для назв тестів, РРРРММДД
//   klad            абсолютний шлях робочої теки сесії для тимчасових файлів (поза сховищем)
//   testOmgeving    абсолютний шлях файлу зі змінними тестової бази (DATABASE_URL, ключі тестів)
//   basisCommit     фіксація змін, від якої рахувати різницю (HEAD на початку аудиту)
//   eersteMigratie  перший вільний номер міграції (число), наприклад 209
//   wortel          корінь сховища; типово /home/user/hub
const A = (typeof args === 'string' ? JSON.parse(args) : args) || {}
for (const k of ['taak', 'datum', 'klad', 'testOmgeving', 'basisCommit', 'eersteMigratie']) if (A[k] == null || A[k] === '') return { gestart: false, reden: `бракує параметра ${k} — див. .claude/skills/beveiligingsaudit/SKILL.md` }
const R = A.wortel || '/home/user/hub'
const TAAK = String(A.taak)
const TK = TAAK.toLowerCase()
const DATUM = String(A.datum)
const KLAD = String(A.klad)
const OMG = String(A.testOmgeving)
const BASIS_COMMIT = String(A.basisCommit)
const EERSTE = Number(A.eersteMigratie)
const nr4 = n => String(n).padStart(4, '0')

const BASIS = `
КОНТЕКСТ. Репозиторій ${R} — платформа «Mijn Ruimte» (сайти *.tarasevych.com): багатокористувацький особистий хаб — пошта, хмара файлів, календар, нотатки, ШІ-агенти й MCP-конектори, термінал і віддалений стіл, розгортання оновлень, розумний будинок, розширення браузера. Стек: React 19 + Vite (src/), власний HTTP-сервер на node:http (server/start.ts, server/platform/*), обробники backend/*.ts (реєстр маршрутів backend/index.ts), спільне shared/, PostgreSQL із RLS (migrations/*.sql), розширення браузера (extension/), скрипти розгортання з правами root (deploy/), складання й координація (scripts/), робочі процеси GitHub (.github/workflows/).
ЗАДАЧА ${TAAK} (власник дав повну автономію, нічого не уточнюй): глибокий аудит безпеки ВСЬОГО сховища й патчі, щоб екосистема кожного користувача була стійкою до кібератак і помилок; попутно — вади інтерфейсу, опцій інструментів та інтеграцій, що стосуються безпеки.
НАЯВНІ МАТЕРІАЛИ (прочитай те, що стосується твоєї ділянки, щоб не повторювати вже закрите й знати задум): ${R}/НОТАТКИ-БЕЗПЕКИ.uk.md; ${R}/docs/beveiliging/ЗАХОДИ-БЕЗПЕКИ-ЗА-МАРШРУТАМИ-20261022.uk.md; ${R}/deploy/SLEUTELS-EN-VERSLEUTELING.nl.md; ${R}/deploy/GEHEIMEN-REGISTER.nl.md; ${R}/deploy/POST-AUDIT-20261007.nl.md; тести ${R}/tests/eenheid/sec-001-20261031.test.ts, beveiliging*.test.ts; правила ${R}/AGENTS.md.
ЖОРСТКІ ПРАВИЛА: аналіз лише ЛОКАЛЬНИЙ — жодних запитів до робочих сайтів (*.tarasevych.com) чи сторонніх систем, жодних атак назовні. Ніколи не виводь значень секретів, токенів, паролів, ключів (у звіті — лише назва й місце). Не роби git commit/push, не запускай orch-команд, не запускай npm run build / build:server (спільні теки dist). Тимчасові файли — лише в ${KLAD}/<твоя назва>/, нічого не видаляй. Не пиши bash-скриптів із heredoc: файли — Write/Edit, запуск — node. Мова звітів — українська.
`

const BEV = {
  type: 'object',
  properties: {
    bevindingen: { type: 'array', items: { type: 'object', properties: {
      ernst: { type: 'string', enum: ['kritiek', 'hoog', 'midden', 'laag'] },
      soort: { type: 'string' },
      titel: { type: 'string' },
      bestand: { type: 'string' },
      regels: { type: 'string' },
      spoor: { type: 'string' },
      aanval: { type: 'string' },
      zekerheid: { type: 'number' },
      herstel: { type: 'string' },
      herstel_bestanden: { type: 'array', items: { type: 'string' } },
    }, required: ['ernst', 'soort', 'titel', 'bestand', 'regels', 'spoor', 'aanval', 'zekerheid', 'herstel', 'herstel_bestanden'] } },
    gedekt: { type: 'string' },
    niet_gedekt: { type: 'string' },
  },
  required: ['bevindingen', 'gedekt', 'niet_gedekt'],
}

const GEBIEDEN = [
  { sl: 'aanmelden', taak: `ВХІД, СЕАНСИ, ІДЕНТИЧНІСТЬ. Файли: server/platform/auth-poort.ts, beveiliging.ts, context.ts, uitnodigingen.ts, server/apparaat-koppelcode.ts; backend/aanmeld-*.ts, toegangssleutels.ts (ключі доступу WebAuthn), toegangscodes*.ts, stap-op.ts (підтвердження входу), codewoord.ts, nieuw-apparaat.ts, apparaat-bevestiging.ts і тека backend/apparaat-bevestiging/, telegram-aanmelden.ts і тека, impersonatie*.ts, eigenaar-sessie-overdracht.ts, eigenaar-*.ts, ruimte-sessie.ts, toegang-*.ts, toegangsfout-tellers.ts, account-koppeling.ts, account-wissen.ts, koppel-binding.ts, overdracht-binding.ts, oauth-pkce.ts, google-contour.ts; shared/* з тих самих тем; сторінки входу в src/. Шукай: обхід автентифікації, фіксацію й викрадення сеансу, слабкі чи передбачувані токени, відсутність прив'язки до пристрою чи походження, повтор одноразових кодів, перегони (TOCTOU) при видачі й погашенні кодів, перебір без обмежень, перелік користувачів, помилки WebAuthn (challenge, origin, rpId, лічильник, userVerification), обхід підтвердження входу, небезпечне відновлення доступу, підміну особи (impersonatie) без меж, атрибути cookie, вихід із сеансу, що не відкликає токени.` },
  { sl: 'autorisatie', taak: `ПРАВА, ІЗОЛЯЦІЯ КОРИСТУВАЧІВ, RLS. Файли: backend/index.ts (реєстр усіх маршрутів і диспетчер), backend/rbac.ts, toegangslaag.ts, api-recht.ts, beleid.ts, ruimte-scheiding*.ts, ruimtes-compatibiliteit.ts, tech-profiel.ts, tech-ruimtes*.ts, tech-routes.ts, vlaggen.ts, werkruimte-delen.ts, server/platform/db.ts, pg.ts, rls-audit.ts, router.ts; УСІ migrations/*.sql (політики RLS, SECURITY DEFINER, GRANT, search_path), migrations/rechten.sql, deploy/db-rollen*.sql. Метод: пройди реєстр маршрутів і для кожної родини перевір ланцюг «автентифікація → роль → власник запису → RLS»; шукай IDOR (ідентифікатор із запиту без перевірки власника), маршрути без перевірки ролі, масове присвоєння полів (userId, rol, eigenaar у тілі запиту), обхід поділу приватного й технічного просторів, запити поза контекстом користувача (пул без SET app.user), таблиці без RLS чи з політикою USING (true), функції SECURITY DEFINER без search_path, SQL-ін'єкції (конкатенація в запитах, динамічні назви стовпців і сортування), привілеї ролі застосунку. Напиши скрипт, що перелічує таблиці схеми app з міграцій і позначає ті, що не мають ENABLE ROW LEVEL SECURITY чи політики.` },
  { sl: 'http-rand', taak: `HTTP-МЕЖА Й СЕРВЕР. Файли: server/start.ts (CSP, заголовки, хости, статика, WebSocket, клієнтська IP-адреса, ліміти), server/platform/*.ts, server/cron.ts, cron.json, backend/extern-routes.ts, veilige-fetch.ts, juridisch.ts, site-aanroep.ts, diepe-gezondheid.ts, rook-controle.ts, deployment-identiteit.ts, public/. Шукай: відсутній чи обхідний захист від CSRF для змін станом (SameSite, перевірка Origin, типи вмісту), CORS, підміну Host і X-Forwarded-*, довіру до заголовків проксі, слабкі місця CSP, clickjacking, відкриті перенаправлення, обхід шляху в роздачі статики й файлів, отруєння кешу, відсутні ліміти розміру тіла, часу й частоти (вичерпання ресурсів), необроблені відхилення промісів і винятки, що валять процес, витік стеку чи внутрішніх даних у помилках, SSRF у будь-якому серверному fetch (перевір ВСІ виклики fetch/http.request у backend/: чи йдуть через veilige-fetch із закріпленням DNS і забороною приватних адрес, перенаправлень), перевірку походження WebSocket, cron-маршрути без автентифікації.` },
  { sl: 'geheimen', taak: `СЕКРЕТИ Й КРИПТОГРАФІЯ. Файли: backend/sleutelkluis*.ts, geheimen.ts, server/platform/geheimen.ts, backend/connectors-crypto.ts, api-platform-kluis.ts, api-platform-tokens.ts, api-platform-verbindingen.ts, integraties-kluis.ts, cloud-overdracht-credentials.ts, cloud-verbinding-m4-token.ts, github-koppeling-opslag.ts, mcp-connector-opslag.ts, connector-v2-opslag.ts, connectors-opslag.ts, ssh-ca*.ts, deploy/geheimen-*.sh, deploy/SLEUTELS-EN-VERSLEUTELING.nl.md, scripts/age-versleutel.mjs. Шукай: слабкі алгоритми й режими, повтор IV/nonce, відсутність автентифікації шифротексту, ключі з недостатньою ентропією, Math.random для токенів, порівняння секретів не за сталий час, секрети в журналах, відповідях API, повідомленнях про помилки, URL, локальному сховищі браузера; токени в базі без шифрування чи гешування; відсутність ротації версій ключа; KDF зі слабкими параметрами; секрети за замовчуванням і запасні значення в коді («|| 'dev'»); розкриття секретів у діагностиці. Напиши скрипт пошуку по всьому сховищу (включно з tests/, deploy/, scripts/, .github/, кореневими файлами) закомічених секретів: приватні ключі, токени за відомими форматами, рядки високої ентропії поруч зі словами key, token, secret, wachtwoord, sleutel — і перевір кожен збіг очима (тестові заглушки не рахуй).` },
  { sl: 'ai-mcp', taak: `ШІ-АГЕНТИ, MCP-КОНЕКТОРИ, ДОЗВОЛИ ІНСТРУМЕНТІВ. Файли: backend/mcp-connector*.ts, mcp-console.ts, mcp-deur-brug.ts, mcp-klant*.ts і тека backend/mcp-klant/, mcp-namens.ts, connector-v2*.ts, connectors-*.ts, ai-*.ts, agent-*.ts, audit-codes-agent.ts, site-hulpmiddelen.ts, dev-rechten-gebruiker.ts, dev-mg-*.ts, dev-gebruiker-hulpmiddeldefinities.ts, orch-*.ts, cognitief-context.ts, ontwerp-context.ts, shared/connector-v2/*, shared/ai-*.ts, deploy/mcp/, deploy/agent/agent.mjs. Шукай: обхід дозволів агента (інструмент, вимкнений власником, усе одно виконується іншим шляхом), агент розширює собі права, плутанину повноважень (агент діє від імені іншого користувача чи простору), обхід схвалення («Питати») і повтор схваленого запиту, дірки OAuth для MCP (реєстрація клієнта, redirect_uri, PKCE, state, обмін коду, область дії, термін і відкликання токенів), ін'єкцію інструкцій через вміст (листи, файли, сторінки) без позначення як даних, вихід інструментів за межі дозволених тек і хостів, запис файлів і виконання команд без підтвердження, витік приватних даних у технічний простір і навпаки, відсутній запис дій агента в журнал і центр сповіщень, небезпечні інструменти, ввімкнені типово. Принцип власника: небезпечний інструмент типово «Вимкнено», але власник може обрати «Завжди»; поруч — знак «!» і пояснення ризику.` },
  { sl: 'server-uitrol', taak: `ТЕРМІНАЛ, СЕРВЕР, РОЗГОРТАННЯ ОНОВЛЕНЬ. Файли: backend/terminal*.ts, remote-bureaublad.ts, server-beheer.ts, uitrol-*.ts, uitgave-info.ts, apps-overdracht.ts, opruimen.ts, shared/terminal-opdrachten.ts, shared/extern-bureaublad.ts; УСІ скрипти deploy/*.sh, deploy/*.service, *.path, *.timer, deploy/gitops, deploy/goedkeuring, deploy/besluit, deploy/herstelset, deploy/guacamole, deploy/cloud, deploy/extensie-native, cloudflared-config.yml; scripts/orch/*.mjs (пакування й перевірка пакета), scripts/uitrol-*. Шукай: ін'єкцію команд (exec/spawn із рядком оболонки, неекрановані аргументи, змінні в shell-скриптах без лапок), обхід шляху й слідування символьним посиланням під час розпакування архіву оновлення (tar), перевірку цілісності й походження пакета (контрольна сума, підпис, основа), виконання коду з пакета до перевірки, перегони в теках із правами на запис для непривілейованого користувача, надмірні права служб systemd (User, NoNewPrivileges, ProtectSystem), світочитні файли секретів, резервні копії без шифрування чи з поганими правами, повтор і підміну рішення про схвалення розгортання, термінал: перевірку походження, прив'язку сеансу до користувача, перелік дозволених команд і його обхід, журналювання.` },
  { sl: 'post', taak: `ПОШТА. Файли: backend/mail-*.ts, ai-mail-assistent.ts, google-suite-mail-browser.ts, shared/mail-*.ts, src/ — уся тека пошти (відображення листа, вкладення, редактор). Шукай: XSS через HTML листа (перевір ланцюг очищення: де викликається DOMPurify, з якими налаштуваннями, чи є шляхи повз нього — перегляд, друк, цитування у відповіді, попередній перегляд вкладень, тема, імена відправників і файлів), вихід із пісочниці iframe, завантаження зовнішніх ресурсів (стеження, витік IP) і чи блокуються вони типово, небезпечні посилання (javascript:, data:), ін'єкцію заголовків при надсиланні (CRLF у темі, адресах, іменах), ін'єкцію в команди IMAP, розбір MIME на шкідливих даних (глибока вкладеність, величезні частини — вичерпання ресурсів), обхід шляху в іменах вкладень, тип вмісту вкладень при віддачі (Content-Disposition, nosniff), зберігання облікових даних пошти, доступ до чужої скриньки за ідентифікатором, підробку відправника в інтерфейсі (омогліфи, відображуване ім'я), автоматичні дії ШІ-помічника над листом зловмисника.` },
  { sl: 'wolk', taak: `ХМАРА, ФАЙЛИ, НОТАТКИ, МЕДІА. Файли: backend/cloud-*.ts і .mjs, foto-dienst.ts, media-generator.ts, notities-vnext.ts, werkruimte-delen.ts, server/platform/opslag.ts, integrations/universal-file-workspace-core-v0.2/, shared/ з тих самих тем, відповідні екрани src/. Шукай: обхід шляху (../, абсолютні шляхи, кодування, нульовий байт) у завантаженні, скачуванні, перейменуванні, переміщенні; слідування символьним посиланням; доступ до чужих файлів і версій за ідентифікатором; посилання спільного доступу (ентропія, термін, відкликання, область, пароль, перебір); небезпечну віддачу файлів (тип вмісту, вбудований показ HTML/SVG на основному походженні — збережений XSS), попередній перегляд документів; XXE й вибух сутностей у backend/cloud-m9-xml.ts; zip-бомби й обхід шляху в архівах; ліміти розміру й квоти; перегони в сеансах завантаження; OAuth сторонніх хмар (state, redirect, зберігання токенів); «сліпе» передавання між хмарами — чи не розкриває воно дані чи облікові дані; SSRF через адреси джерел.` },
  { sl: 'integraties', taak: `ЗОВНІШНІ ІНТЕГРАЦІЇ. Файли: backend/github-*.ts, uitrol-github.ts, ruimte-bord-github.ts, betalingen-stripe.ts, agenda-*.ts, google-suite-*.ts, cloud-integratie-*.ts, integraties-wizard.ts, beheer-integraties.ts, verbinding-adapters.ts і тека, huis-vnext.ts, huis-adapter-thuis-assistent.ts, telegram-aanmelden (бот), siem.ts, melder.ts, ondersteuning*.ts, merk-bron.ts, merk-eigen.ts, mcp-klant (вихідні з'єднання). Шукай: вебхуки без перевірки підпису чи з порівнянням не за сталий час, повтор вебхуків, OAuth (state, PKCE, redirect_uri, підміна облікового запису при прив'язці — account takeover через connect-CSRF), зберігання й область токенів, SSRF через адреси, які вводить користувач (CalDAV, ICS, Home Assistant, власні сервери) включно з перенаправленнями й DNS-rebinding, розбір ICS/XML/HTML зі сторонніх джерел, ін'єкцію в запити до сторонніх API, надмірні області доступу GitHub App, витік токенів у журнали й відповіді, дії від імені чужої прив'язки, обробку помилок і таймаутів сторонніх служб (зависання, каскадні збої).` },
  { sl: 'interface', taak: `ІНТЕРФЕЙС (src/, index.html, public/): клієнтська безпека й вади інтерфейсу, що стосуються безпеки. Шукай скриптом і перевір очима КОЖЕН збіг: dangerouslySetInnerHTML, innerHTML/outerHTML/insertAdjacentHTML, document.write, eval/new Function, href і src із даних користувача (javascript:, data:), window.open і target=_blank без noopener, обробники postMessage без перевірки origin, вбудовані iframe без sandbox, відкриті перенаправлення за параметрами URL, секрети й токени в localStorage/sessionStorage/URL, рендер Markdown чи HTML зі сторонніх джерел, service worker і кеш із приватними даними, витік даних через Referer. ОКРЕМО — інтерфейс налаштувань безпеки (за принципами власника): небезпечні інструменти й режими мають бути типово «Вимкнено», але з можливістю обрати «Завжди», зі знаком «!» і докладним поясненням ризику, не заблоковані жорстко; підказки пояснюють НАСЛІДКИ дії, а не повторюють назву кнопки; дії системи й ШІ-агентів потрапляють до центру сповіщень; тексти лише українською й нідерландською (англійська — тільки неперекладні технічні терміни); помилки безпеки зрозумілі людині й не розкривають внутрішнього; небезпечні дії (видалення облікового запису, відкликання ключів, вимкнення захисту) мають підтвердження. Знайди конкретні місця, де це порушено.` },
  { sl: 'extensie', taak: `РОЗШИРЕННЯ БРАУЗЕРА Й КЕРУВАННЯ БРАУЗЕРОМ. Файли: extension/* (manifest.json, background.js, bridge.js, collector.js, native.js, offscreen.js, sidepanel*.js, popup.js, options*.js, shared.js, markering*.js, lokale-ai.js), deploy/extensie-native, deploy/*.ps1, backend/extensie-*.ts, browser-*.ts, connector-v2-browser.ts, google-suite-browser.ts, shared/ з тих самих тем. Шукай: надмірні дозволи маніфесту й host_permissions, externally_connectable, обмін повідомленнями без перевірки відправника (runtime.onMessage, onMessageExternal, postMessage між сторінкою й скриптом вмісту), виконання коду зі сторінки в контексті розширення, використання chrome.debugger і його межі (на яких вкладках, чи бачить користувач, чи можна керувати вкладкою технічного профілю з приватного), збір даних сторінок (паролі, платіжні поля) і куди вони йдуть, зберігання токенів у chrome.storage, рідний хост (native messaging): перевірка походження, ін'єкція команд, шляхи; ланцюг розблокування розширення (extensie-ontgrendeling): перебір, повтор, прив'язка до пристрою; CSP сторінок розширення; оновлення поза крамницею.` },
  { sl: 'keten-config', taak: `ЛАНЦЮГ ПОСТАЧАННЯ, КОНФІГУРАЦІЯ, СТІЙКІСТЬ. Перевір: package.json і package-lock.json — виконай npm audit --json (реєстр доступний) і розбери КОЖНЕ попередження: чи досяжний уразливий код у цьому застосунку; залежності з URL поза реєстром (наприклад cdn.sheetjs.com) без перевірки цілісності; скрипти встановлення. УСІ .github/workflows/*.yml: надмірні permissions, ін'єкцію через неперевірені значення в run (github.event.*, назви гілок, заголовки PR), дії без закріплення за SHA, pull_request_target, секрети в журналах, чи може стороння гілка оприлюднити випуск. Конфігурацію: vite.config.ts, tsconfig*, cron.json, deploy/*.service і cloudflared-config.yml, ЗМІННІ-СЕРЕДОВИЩА.uk.md — небезпечні типові значення, режими налагодження, source maps у робочій збірці, докладні помилки. Стійкість серверного коду (backend/, server/): process.on('uncaughtException'/'unhandledRejection'), проміси без catch у фонових задачах, таймери й з'єднання, що течуть, зовнішні виклики без таймауту, необмежені черги й кеші в пам'яті, регулярні вирази з катастрофічним перебором на даних користувача (ReDoS) — знайди скриптом кандидатів і перевір. Кореневі файли-сміття (наприклад CUserst…aanroepen.txt): чи немає в них приватних даних. scripts/*.mjs, що виконуються під час збірки на сервері.` },
  { sl: 'privacy-logboek', taak: `ПРИВАТНІСТЬ, ЖУРНАЛИ, ДІАГНОСТИКА, ПОШУК. Файли: backend/privacy.ts, account-wissen.ts, diagnose.ts, diagnostiek-account.ts, beheer-diagnostiek*.ts, beheer-journaal*.ts, beheer-overzicht*.ts, browser-diag-archief.ts, audit-gebeurtenis.ts, agent-audit.ts, server/platform/audit.ts, siem.ts, site-activiteit.ts, zoek*.ts і тека backend/zoek/, globaal-zoek.ts, zoek-geschiedenis.ts, meldingen-*.ts, hub-*.ts, werkblad*.ts, weergave.ts, vensters-onthouden.ts, waarheid-claims.ts, foto-dienst.ts, shared/ з тих самих тем. Шукай: приватні дані одного користувача в результатах пошуку, сповіщеннях, журналах чи діагностиці іншого (зокрема адміністратора чи технічного простору без підстави); секрети, токени, вміст листів і файлів у журналах і діагностичних архівах; журнал аудиту, який можна змінити чи обійти (дії без запису, запис після дії, що може не статися); ін'єкцію в журнали (CRLF, підробка записів); видалення облікового запису, що лишає дані (перелічи таблиці з посиланням на користувача й порівняй із тим, що чистить account-wissen); експорт даних без підтвердження входу; строки зберігання; дії ШІ-агента чи системи, які НЕ потрапляють до центру сповіщень.` },
]

phase('Audit')
const ruw = await parallel(GEBIEDEN.map(g => () => agent(`${BASIS}
ТИ — АУДИТОР БЕЗПЕКИ ділянки «${g.sl}». Файлів репозиторію НЕ змінюй (лише читання; власні скрипти й нотатки — у ${KLAD}/${g.sl}/). ${g.taak}
МЕТОД: спершу склади перелік файлів ділянки (ls, wc) і прочитай їх по суті, а не лише пошуком; для кожної підозри простеж шлях від джерела, яким керує нападник, до небезпечної дії, і перевір, чи немає захисту вище за течією (диспетчер backend/index.ts, server/platform/auth-poort.ts, rbac, stap-op, RLS). Де можливо — доведи локально: маленький node-скрипт або виклик функції з тестовими даними (приклад запуску тестів: node scripts/eenheidstests.mjs <файл>.test.ts; тестова база — змінні в ${OMG}, читати можна, значень не виводь).
ЩО ЗВІТУВАТИ: лише справжні вади з конкретним нападником, передумовами й наслідком; zekerheid ≥ 0,6. Не звітуй загальні поради, стиль, теоретичне без шляху атаки, уже закрите (перевір чинний код). Стійкість до помилок (падіння процесу, зависання, вичерпання ресурсів) — soort «stabiliteit». Вади інтерфейсу щодо безпеки — soort «interface». Рівні: kritiek — захоплення облікового запису чи сервера, читання чужих даних без передумов; hoog — те саме з реалістичними передумовами, виконання коду, обхід дозволів агента; midden — обмежений вплив або складні передумови; laag — захист у глибину.
ПОЛЯ: bestand — шлях від кореня сховища до головного місця вади; regels — рядки; spoor — шлях «джерело → небезпечна дія» з файлами й рядками; aanval — хто, з якими правами, що робить, що отримує; herstel — конкретний патч; herstel_bestanden — ТОЧНИЙ перелік файлів (шляхи від кореня), які треба змінити для виправлення. gedekt — що ти фактично прочитав і перевірив; niet_gedekt — що з ділянки лишилося не переглянутим. До 25 знахідок, найважливіші першими.`, { label: `audit:${g.sl}`, phase: 'Audit', schema: BEV })
  .then(x => x ? { sl: g.sl, gedekt: x.gedekt, niet_gedekt: x.niet_gedekt, bevindingen: x.bevindingen.map((b, i) => ({ ...b, id: `${g.sl}-${String(i + 1).padStart(2, '0')}`, gebied: g.sl })) } : null)))
const audits = ruw.filter(Boolean)
const alle = audits.flatMap(a => a.bevindingen)
const tel = e => alle.filter(b => b.ernst === e).length
log(`Аудит: ${alle.length} знахідок — критичних ${tel('kritiek')}, високих ${tel('hoog')}, середніх ${tel('midden')}, низьких ${tel('laag')}`)

// Групи файлів, що не перетинаються: об'єднання за спільними файлами, далі розкладання щонайбільше на 10 виконавців.
const norm = f => String(f || '').trim().replace(/^\/home\/user\/hub\//, '').replace(/^\.\//, '').replace(/[:#(].*$/, '').replace(/\s.*$/, '')
const ouder = new Map()
const vind = x => { if (!ouder.has(x)) ouder.set(x, x); let r = x; while (ouder.get(r) !== r) r = ouder.get(r); ouder.set(x, r); return r }
const voegSamen = (a, b) => { const ra = vind(a), rb = vind(b); if (ra !== rb) ouder.set(ra, rb) }
for (const b of alle) {
  b.files = [...new Set([norm(b.bestand), ...(b.herstel_bestanden || []).map(norm)].filter(f => f && f.includes('/') || /\.(json|ts|md|yml|html)$/.test(f)))]
  if (!b.files.length) b.files = [norm(b.bestand) || `onbekend-${b.id}`]
  for (const f of b.files) voegSamen(b.files[0], f)
}
const clusters = new Map()
for (const b of alle) { const k = vind(b.files[0]); if (!clusters.has(k)) clusters.set(k, []); clusters.get(k).push(b) }
const MAX = 10
const groepen = Array.from({ length: MAX }, () => [])
for (const c of [...clusters.values()].sort((a, b) => b.length - a.length)) groepen.sort((a, b) => a.length - b.length)[0].push(...c)
const gevuld = groepen.filter(g => g.length)
const RANG = { kritiek: 0, hoog: 1, midden: 2, laag: 3 }
log(`Груп виправлення: ${gevuld.length} (${gevuld.map(g => g.length).join(', ')})`)

const regel = b => `### ${b.id} [${b.ernst}; ${b.soort}; певність ${b.zekerheid}] ${b.titel}
- місце: ${b.bestand} (${b.regels})
- шлях: ${b.spoor}
- атака: ${b.aanval}
- пропозиція: ${b.herstel}
- файли для зміни: ${b.files.join(', ')}`

const HERSTEL_REGELS = (naam, nr) => `
ЯК ПРАЦЮВАТИ З КОЖНОЮ ЗНАХІДКОЮ (у порядку ваги):
1. ПЕРЕВІР САМ, не вір аудиторові: прочитай код, знайди захист вище за течією. Спробуй ВІДТВОРИТИ тестом у ${R}/tests/eenheid/${TK}-${naam}-${DATUM}.test.ts (зразок будови й імпортів — tests/eenheid/sec-001-20261031.test.ts; запуск: node scripts/eenheidstests.mjs ${TK}-${naam}-${DATUM}.test.ts): тест має показати ваду ДО патча (запусти й переконайся, що він падає саме через неї).
2. Якщо знахідка хибна (захист є, шлях недосяжний) — НЕ змінюй код, запиши «спростовано» з точним поясненням (файл, рядок захисту).
3. Якщо справжня — мінімальний точний патч у першопричині, без переписування довколишнього; тест після патча зелений; додай перевірку суміжних варіантів тієї самої вади в цих же файлах.
4. Не послаблюй наявний захист і не ламай поведінку: запусти наявні тести зачеплених модулів (знайди їх пошуком за назвою модуля в tests/eenheid/), npm run typecheck:server і npx tsc --noEmit (вони лише читають; помилки в файлах, яких ти не чіпав, можуть бути тимчасовими — паралельно працюють інші; перевір ще раз наприкінці).
ФАЙЛИ: редагуй ЛИШЕ файли зі свого переліку нижче та власний тестовий файл (і нові файли, яких ще немає). Якщо патч потребує іншого наявного файлу — не чіпай його, а запиши у звіт як «відкладено» з точним описом потрібної зміни.
МІГРАЦІЇ: нові — лише з номерами ${nr}, ${nr + 1}, ${nr + 2} (формат NNNN_naam_met_kleine_letters.sql; наявні міграції не змінюй); ідемпотентні (IF NOT EXISTS, DROP POLICY IF EXISTS), RLS через наявні допоміжні функції.
БАЗА ДАНИХ для тестів: власна база mr_sec_${naam.replace(/-/g, '_')} у локальному PostgreSQL 16 (змінні з ${OMG}; користувач має право створювати бази; застосування міграцій: DATABASE_URL=<твоя база> MIGRATIONS_DIR=${R}/migrations OWNER_EMAIL=eigenaar@example.invalid node dist-server/migrate.mjs разом з іншими змінними з того файлу). Спільну базу mr_test не змінюй.
КОД І ТЕКСТИ: коментарі українською або нідерландською (як у файлі); тексти інтерфейсу — пари українська/нідерландська наявними помічниками (tr, t), без англійських слів; підказки пояснюють наслідки; небезпечне — типово «Вимкнено», але власник може обрати «Завжди», зі знаком «!» і поясненням ризику; дії системи й агентів — у центр сповіщень (emitCanonicalNotice / наявні серверні сповіщення). У тестах — лише вигадані секрети.
ЗВІТ (стисло, по кожній знахідці за її id): «виправлено» (що змінено, які файли, як доведено: назва тесту, результат до й після) / «спростовано» (чому) / «відкладено» (що саме треба зробити й у якому файлі, або яке рішення потрібне від власника). Наприкінці — перелік змінених і нових файлів та підсумок запусків тестів і перевірки типів.`

phase('Herstel')
const verslagen = await parallel(gevuld.map((g, i) => async () => {
  const naam = `g${String(i + 1).padStart(2, '0')}`
  const nr = EERSTE + i * 3
  const gesorteerd = [...g].sort((a, b) => RANG[a.ernst] - RANG[b.ernst] || b.zekerheid - a.zekerheid)
  const bestanden = [...new Set(g.flatMap(b => b.files))].sort()
  const delen = []
  for (let k = 0; k < gesorteerd.length; k += 14) delen.push(gesorteerd.slice(k, k + 14))
  const uit = []
  for (let d = 0; d < delen.length; d++) {
    const eerder = uit.length ? `\nПОПЕРЕДНЯ ЧАСТИНА ЦІЄЇ ГРУПИ ВЖЕ ЗРОБЛЕНА (той самий тестовий файл — доповнюй його, не перезаписуй). Її звіт:\n${String(uit[uit.length - 1]).slice(0, 3500)}\n` : ''
    const r = await agent(`${BASIS}
ТИ — ІНЖЕНЕР БЕЗПЕКИ, група виправлень «${naam}»${delen.length > 1 ? `, частина ${d + 1} з ${delen.length}` : ''}. Аудит дав знахідки нижче. Паралельно інші групи редагують ІНШІ файли.
ТВОЇ ФАЙЛИ (лише їх можна редагувати): ${bestanden.join(', ')}
${HERSTEL_REGELS(naam, nr)}
${eerder}
ЗНАХІДКИ:
${delen[d].map(regel).join('\n\n')}`, { label: `herstel:${naam}${delen.length > 1 ? `.${d + 1}` : ''}`, phase: 'Herstel' })
    uit.push(String(r || ''))
  }
  return { naam, ids: g.map(b => b.id), bestanden, verslag: uit.join('\n\n=== наступна частина ===\n\n') }
}))
const klaar = verslagen.filter(Boolean)
const verslagKort = klaar.map(v => `=== група ${v.naam} (${v.ids.join(', ')}) ===\n${v.verslag.slice(0, 5000)}`).join('\n\n')

const TOETS = {
  type: 'object',
  properties: { bevindingen: { type: 'array', items: { type: 'object', properties: {
    ernst: { type: 'string', enum: ['kritiek', 'hoog', 'midden', 'laag'] }, bestand: { type: 'string' }, probleem: { type: 'string' }, voorstel: { type: 'string' } },
    required: ['ernst', 'bestand', 'probleem', 'voorstel'] } }, oordeel: { type: 'string' } },
  required: ['bevindingen', 'oordeel'],
}
const DIFF = `git -C ${R} status --short ; git -C ${R} diff ${BASIS_COMMIT} --stat ; git -C ${R} diff ${BASIS_COMMIT} -- <файл> (читай частинами; нові файли — напряму)`

phase('Toets')
const toetsen = await parallel([
  () => agent(`${BASIS}
ТИ — НЕЗАЛЕЖНИЙ ПЕРЕВІРЯЛЬНИК ПАТЧІВ: ОБХІД І ПОВНОТА. Файлів репозиторію НЕ змінюй. Зміни: ${DIFF}. Звіти інженерів (не вір на слово):
${verslagKort.slice(0, 30000)}
Для кожного патча безпеки: (1) чи закриває він першопричину, а не один шлях; спробуй ОБІЙТИ (інше кодування, інший маршрут до тієї самої функції, інший метод HTTP, регістр, перегони, порожні й граничні значення) — доведи локальним скриптом у ${KLAD}/toets-omzeiling/; (2) знайди ТАКУ САМУ ваду в сусідньому коді, якого патч не торкнувся (пошук за шаблоном по backend/, server/, shared/, src/, extension/, deploy/); (3) чи не відкрив патч нової вади (помилка, що розкриває дані; відмова в обслуговуванні; закрито для законного користувача). Переглянь і знахідки, позначені «спростовано»: якщо спростування непереконливе — поверни знахідку. Лише справжнє, з кроками відтворення; bestand — де виправляти.`, { label: 'toets:omzeiling', phase: 'Toets', schema: TOETS }),
  () => agent(`${BASIS}
ТИ — НЕЗАЛЕЖНИЙ ПЕРЕВІРЯЛЬНИК ПАТЧІВ: РЕГРЕСІЇ Й ПРАВИЛЬНІСТЬ. Файлів репозиторію НЕ змінюй. Зміни: ${DIFF}.
ЗРОБИ ФАКТИЧНО: npm run typecheck:server ; npx tsc --noEmit ; node scripts/plaatsing-controle.mjs ; node scripts/zoek-ui-catalogus.mjs --controle ; усі нові тести tests/eenheid/${TK}-*.test.ts ; наявні тести безпеки (sec-001-20261031, beveiliging, beveiliging-schakelaars, beveiliging-beoordeling-20261021) і тести кожного зміненого модуля (знайди пошуком за назвою модуля в tests/eenheid/) — зі змінними з ${OMG}; для тестів із базою створи власну базу mr_sec_toets і застосуй УСІ міграції (DATABASE_URL=<база> MIGRATIONS_DIR=${R}/migrations OWNER_EMAIL=eigenaar@example.invalid node dist-server/migrate.mjs) — двічі поспіль, щоб перевірити ідемпотентність нових міграцій; перевір, що номери нових міграцій не збігаються й ідуть після ${nr4(EERSTE - 1)}. Прочитай кожен патч: логічні помилки, зламані законні сценарії (вхід, прив'язка інтеграцій, завантаження файлів, пошта, агенти), невідповідність типів клієнта й сервера, зміни відповіді API без оновлення клієнта в src/, тести, що нічого не доводять (зелені й без патча). Кожен збій — із точним виводом; bestand — де виправляти.`, { label: 'toets:regressie', phase: 'Toets', schema: TOETS }),
  () => agent(`${BASIS}
ТИ — НЕЗАЛЕЖНИЙ ПЕРЕВІРЯЛЬНИК: ІНТЕРФЕЙС, МОВА, СЛІД ДІЙ. Файлів репозиторію НЕ змінюй. Зміни: ${DIFF}.
Перевір у всіх змінених і нових файлах: (1) мовний закон — тексти для людини лише українською й нідерландською парами, без англійських слів (логіка tests/eenheid/hulp/taalcontrole.ts; запусти node scripts/eenheidstests.mjs hulpmiddelen-tweetalig-20261020.test.ts і тести з «taal» у назві); коментарі в коді — українською чи нідерландською; (2) повідомлення про помилки безпеки зрозумілі людині, кажуть, що робити далі, і не розкривають внутрішнього (шляхи, SQL, стек, існування чужих записів); (3) нові чи змінені опції безпеки: небезпечне типово «Вимкнено», але власник може обрати «Завжди»; є знак «!» і пояснення ризику; підказки пояснюють наслідки й зв'язки; нічого не заблоковано жорстко без можливості вибору власника; (4) кожна нова відмова, блокування чи дія системи й агента лишає слід: запис аудиту й сповіщення в центрі сповіщень із зрозумілим описом; (5) документація: чи потребують оновлення НОТАТКИ-БЕЗПЕКИ.uk.md / BEVEILIGINGSNOTITIES.nl.md, ЗМІННІ-СЕРЕДОВИЩА.uk.md / OMGEVINGSVARIABELEN.nl.md (нові змінні), docs/beveiliging/. bestand — де виправляти; voorstel — точний текст.`, { label: 'toets:interface', phase: 'Toets', schema: TOETS }),
])
const toetsBev = toetsen.filter(Boolean).flatMap(t => t.bevindingen || [])
log(`Перевірка патчів: ${toetsBev.length} зауважень (критичних і високих ${toetsBev.filter(b => b.ernst === 'kritiek' || b.ernst === 'hoog').length})`)

phase('Afwerking')
const afwerking = await agent(`${BASIS}
ТИ — ЄДИНИЙ ІНЖЕНЕР НА ЗАВЕРШАЛЬНОМУ КРОЦІ ${TAAK} (усі інші вже завершили; можеш редагувати будь-які файли, крім docs/huis/ і orchestratie/). Зміни від основи: ${DIFF}.
ЧАСТИНА 1 — зауваження незалежної перевірки патчів (виправ по суті кожне критичне, високе й середнє; низьке — де швидко; хибне — поясни):
${toetsBev.sort((a, b) => RANG[a.ernst] - RANG[b.ernst]).map(b => `- [${b.ernst}] ${b.bestand}: ${b.probleem} → ${b.voorstel}`).join('\n') || '(зауважень немає)'}
ЧАСТИНА 2 — «відкладено» у звітах груп: те, що потребувало файлів поза групою (тепер меж немає — зроби, якщо це не потребує рішення власника), із тестом у tests/eenheid/${TK}-afwerking-${DATUM}.test.ts. Звіти груп:
${verslagKort.slice(0, 26000)}
ПРАВИЛА ПАТЧІВ: спершу тест, що показує ваду, потім мінімальний патч; нові міграції — лише номери ${nr4(EERSTE + 31)}–${nr4(EERSTE + 36)}; база для тестів — власна mr_sec_afwerking (змінні з ${OMG}; міграції: DATABASE_URL=<база> MIGRATIONS_DIR=${R}/migrations OWNER_EMAIL=eigenaar@example.invalid node dist-server/migrate.mjs); тексти — пари українська/нідерландська; коментарі українською чи нідерландською.
ЧАСТИНА 3 — наприкінці прожени й добийся зеленого: npm run typecheck:server ; npx tsc --noEmit ; node scripts/plaatsing-controle.mjs ; node scripts/zoek-ui-catalogus.mjs --controle (якщо каталог застарів — перегенеруй тим самим скриптом без --controle) ; усі tests/eenheid/${TK}-*.test.ts ; sec-001-20261031, beveiliging, beveiliging-schakelaars ; тести змінених модулів.
ЗВІТ: по кожному пункту — виправлено / відхилено й чому / лишилося власникові (рішення, яке можу прийняти лише він); підсумкові числа тестів; перелік файлів.`, { label: 'afwerking', phase: 'Afwerking' })

return {
  audit: audits.map(a => ({ sl: a.sl, aantal: a.bevindingen.length, gedekt: a.gedekt, niet_gedekt: a.niet_gedekt })),
  bevindingen: alle.map(({ files, ...b }) => ({ ...b, files })),
  groepen: klaar.map(v => ({ naam: v.naam, ids: v.ids, bestanden: v.bestanden, verslag: v.verslag })),
  toets: toetsen.filter(Boolean).map(t => ({ oordeel: t.oordeel, bevindingen: t.bevindingen })),
  afwerking: String(afwerking || ''),
}
