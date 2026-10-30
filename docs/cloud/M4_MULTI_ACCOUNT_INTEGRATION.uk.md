# Cloud Full Integration M4 — підключення та робота з кількома акаунтами

Статус: **DEVELOPMENT ONLY / NOT DEPLOYABLE**. База: 20261027-212158 + M1–M3. Жодного live сервера, OAuth-консолі, PostgreSQL, GitHub-проєкту чи адміністративного оновлення не змінено.

## 1. Зміст реалізації

- Серверне підключення Microsoft OneDrive Personal/Business, SharePoint, Dropbox, Box з OAuth 2.0 authorization code. Microsoft і Dropbox — PKCE S256; Box — confidential-code flow із серверним client secret та випадковим одноразовим state. Microsoft `prompt=select_account` підтримує свідомий вибір наступного акаунта. Dropbox/Box використовують власний інтерфейс провайдера.
- Відокремлені записи підключення за `(owner, ruimte, provider, external_subject)`. Один користувач може мати декілька акаунтів одного провайдера. Повторне підключення того самого remote subject оновлює його чинний запис, не створює дубль.
- Режим читання чи читання+запис. Backend токен-брокер перевіряє наявність потрібних scopes (Microsoft/Dropbox), status і додатковий локальний дозвіл; не довіряє бажаному типу операції з браузера. Box встановлює OAuth scopes у своїй developer-консолі, а тому «лише читання» у власному UI — локальне обмеження, **не обіцянка вузької сторонньої згоди**.
- Браузер ніколи не отримує refresh/access tokens. Токени й одноразові OAuth матеріали зберігаються AES-256-GCM у PostgreSQL, AAD містить owner+space+account record id. База доступна лише server system role.
- Перед початком OAuth визначаємо owner і `ruimte` у `ladePoort('cloud',...)`; після callback звіряємо із записаним власником і простором, а state споживаємо один раз. Callback повертає лише код результату до `/overzicht`.
- Відключення відразу блокує локальний доступ, а потім пробує відкликати токен у Dropbox/Box. У Microsoft немає еквівалентного гарантованого per-grant endpoint: локальний grant блокується, а UI має пояснити, де відкликати сторонню згоду. Якщо remote revoke не підтверджено — `disconnect_pending` (не «все відкликано»).
- Refresh-lock у PostgreSQL не дає двом браузерам одночасно використати один Box refresh token. При невизначеному результаті expired lease — `reauth_required`, а не небезпечний повтор.
- Збережено канонічний Google Suite B+ grant; M4 не переназначає primary Gmail/Drive.
- React `CloudVerbindingCentrum` — окремий адаптивний компонент без дублювання CanonicalChrome. Він написаний, але **не вмонтований** у живу сторінку. Сигнал `BroadcastChannel` передає лише факт зміни, не акаунт/токен; між браузерами/пристроями перелік оновлюється періодичним запитом до сервера. Обраний акаунт — `sessionStorage` поточної вкладки.

## 2. Зміни

- `backend/cloud-verbinding-m4.ts`: одноразові OAuth, валідація власника та простору, підключення, повторне підключення, перейменування, відключення.
- `backend/cloud-verbinding-m4-providers.ts`: провайдерські OAuth URL, token exchange, `/me`, refresh, revoke.
- `backend/cloud-verbinding-m4-pg.ts`: flow/account repo, AES-GCM, multi-account identity, PostgreSQL refresh lease.
- `backend/cloud-verbinding-m4-token.ts`: token broker за `accountId` та операцією, refresh serialization.
- `backend/cloud-verbinding-m4-config.ts`: env-конфігурація, зафіксований callback host і path.
- `backend/cloud-verbinding-m4-routes.ts`: staging API `list/start/callback/rename/disconnect`.
- `backend/cloud-platform.ts`: нові маршрути всередині існуючого `ladePoort('cloud')`.
- `backend/cloud-overdracht-credentials.ts`: новий token broker тільки для не-Google провайдерів і тільки за staging gate; Google залишається без змін.
- `migrations/0120_cloud_multi_account_connections.sql`: зашифровані grants, OAuth flows, унікальність акаунтів, refresh lease, RLS.
- `src/cloud/cloud-account-sync.ts`, `CloudVerbindingCentrum.tsx`, `cloud-verbinding-centrum.css`.
- `scripts/cloud-full-release-gate.mjs`: 36 незалежних пунктів приймання, включно з мультиакаунтами та багатобраузерним доступом.

## 3. Необхідна конфігурація лише на ізольованому тестовому оточенні

Встановити окремі app registrations / дозволені callback URL в Microsoft Entra / Microsoft Account, Dropbox App Console, Box Developer Console:

- `CLOUD_MICROSOFT_CLIENT_ID`, `CLOUD_MICROSOFT_CLIENT_SECRET` (серверна confidential app, consumer+organization registration згідно з підтримуваними типами акаунтів);
- `CLOUD_DROPBOX_CLIENT_ID`, `CLOUD_DROPBOX_CLIENT_SECRET`;
- `CLOUD_BOX_CLIENT_ID`, `CLOUD_BOX_CLIENT_SECRET`;
- `CLOUD_OAUTH_M4_REDIRECT_URI` — **точно** `https://api.tarasevych.com/api/owner/cloud/oauth/m4/callback` або `https://cloud.tarasevych.com/api/owner/cloud/oauth/m4/callback` за фактичним API reverse proxy;
- `CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1` — новий окремий 32-байтний серверний ключ, **не** включати його в архів; план ротації ключа ще потребує реалізації.

`CLOUD_M4_CONNECTIONS_STAGING=enabled` застосовувати тільки на **ізольованому тестовому стенді**, а не в production. За замовчуванням API повертає `CLOUD_M4_NOT_RELEASED`. OAuth clients слід реєструвати для фактичного hostname, реального redirect URI, точного складу read/write permissions; admin consent policies Microsoft можуть блокувати корпоративні акаунти.

## 4. API після активації staging

Усі запити у контурі `ladePoort('cloud')`. Не приймають browser-supplied `owner`, `ruimte`, bearer або будь-який довільний API host.

- `POST /api/owner/cloud/integrations/v1/accounts/list` -> перелік метаданих (жодних токенів).
- `POST /api/owner/cloud/integrations/v1/accounts/start` -> `{provider, mode}` -> офіційний `url` і `flowId`.
- `GET /api/owner/cloud/oauth/m4/callback?state=...&code=...` -> повторна перевірка сесії та простору, одноразове сховище PKCE, перевірка remote identity, 303 назад у Cloud.
- `POST /api/owner/cloud/integrations/v1/accounts/:id/rename` -> `{label}`.
- `POST /api/owner/cloud/integrations/v1/accounts/:id/disconnect` -> `{confirm:true}`, локальне блокування + спроба remote revoke.

Відсутні API виконання MOVE/COPY через фронтенд; M2/M3 transport code ще не ввімкнено до live acceptance. Токен-брокер готовий як dependency, але контур фонового воркера повинен перевіряти `owner+space` із PostgreSQL job, а не довіряти фоновому AsyncLocalStorage за замовчуванням.

## 5. Принципи роботи в кількох браузерах / вкладках

- Підключення та відкликання доступу записані на сервері та стають видимими іншим пристроям при наступному опитуванні.
- `BroadcastChannel('tsv-cloud-accounts-v1')` пробуджує вкладки того самого origin; між піддоменами цей канал не діє — потрібен спільний серверний стан і polling або подальший SSE.
- Конкретний active account не записують у загальний browser localStorage і **не** синхронізують як глобальний для всіх. Для різних вкладок — `sessionStorage`, для задач воркера — явний account id у server-side job.
- Зміна OAuth у будь-якій вкладці інвалідовує власні показані дані після наступного server refresh. Довготривалі операції при відкликанні grant мають зупинятися після повторної перевірки права.

## 6. Жорсткі блокери перед full-release

1. Зареєстровані провайдерські OAuth apps та server secrets, успішні auth-code/PKCE callback, реальні 2 акаунти одного провайдера та робочий+особистий одночасно.
2. Box confidential OAuth без удавання вузьких scopes; перевірка least privilege, адмін-консенсу для Microsoft, refresh/revoke per provider; реальна ротація Vault encryption key.
3. Nextcloud Login Flow v2 із egress/SSRF/DNS-rebinding захистом, S3 IAM/role credentials без довільних access keys у браузері; ці майстри **НЕ написані** в M4.
4. Реальне включення background worker, resume large-file, COPY/MOVE E2E для всіх заявлених провайдерів. Conditional DELETE, crash/reconciliation; M2/M3 наразі не працюють у production.
5. Реальні provider-share permissions із зазначенням терміну/ролі/revoke і версії з restore; повна перевірка Universal File Workspace.
6. Staging PostgreSQL migration 0119 + key management/RLS test; Node.js 24+ full typecheck/build, desktop/mobile та 2 браузери/2 вкладки/2 пристрої E2E.
7. Визначити остаточний список підтримуваних провайдерів. Не можна позначати як «підключення доступне» ті, у яких немає повноцінного API/onboarding.
8. Звірка з **найновішою** production base. Наша база — 20261027-212158; якщо вже є пізніший випуск, спочатку тристороннє злиття.

Технічний релізний контроль — `node scripts/cloud-full-release-gate.mjs`. Нині результат BLOCKED із 36/36 невиконаних доказів. Сам цей локальний gate ще **не вбудовано в адміністративний інсталятор**. Не обходити його вручну: потрібні справжні CI артефакти та живі E2E.

## 7. Перевірки

```bash
node --experimental-strip-types --test \
  tests/eenheid/cloud-integratie-contract.test.ts \
  tests/eenheid/cloud-overdracht-m2.test.mjs \
  tests/eenheid/cloud-overdracht-m3.test.mjs \
  tests/eenheid/cloud-m3-gate.test.mjs \
  tests/eenheid/cloud-versies-m3.test.mjs \
  tests/eenheid/cloud-delen-m3.test.mjs \
  tests/eenheid/cloud-verbinding-m4.test.mjs
node scripts/cloud-full-release-gate.mjs
```

Результат: **104/104 offline unit/mock tests passed; release gate BLOCKED/exit 2**.

`npm run typecheck:server` у поточному контейнері не виконав повної перевірки через відсутні `@types/node`. `node scripts/plaatsing-controle.mjs` — відсутній esbuild. Node.js 22 локально, проєкт вимагає 24+. Ці помилки середовища не дозволяють оголосити збірку успішною.
