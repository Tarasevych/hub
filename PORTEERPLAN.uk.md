> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./PORTEERPLAN.md)) · [🇳🇱 **Nederlandse versie**](./PORTEERPLAN.nl.md) · [🏠 Головна (UK)](./README.md) · [🏠 Hoofdpagina (NL)](./LEESMIJ.md) · [📚 Каталог статей](./docs/INDEX.md)

# План портування «Мій простір»: власний хостинг (self-hosting) без AppDeploy

Статус: план (на момент складання плану код іще не змінювався; виконання зафіксовано у §10). Гілка: `zelf-hosten`. База: `b161610` (виправлення безпеки).
Дата аналізу: 3 жовтня 2026 року.
Цільове середовище (на момент портування): Ubuntu 24.04.5 (з листопада 2026 оновлено до Ubuntu 26.04.1 LTS — див. `B-009`), Node.js 24.21 / npm 11 (оновлено до Node.js 26.13.0 LTS), PostgreSQL 17 на `127.0.0.1:5432` (оновлено до PostgreSQL 18.6; база даних і роль `mijnruimte`), завантаження у `/srv/data/uploads`, застосунок у `/srv/mijn-ruimte`, системний користувач `mijnruimte`, systemd та Cloudflare Tunnel (`cloudflared`, виключно вихідні з'єднання) до порту на `localhost`.

---

## 0. Резюме

* Застосунок являє собою React/Vite-SPA з одним великим TypeScript-бекендом (`backend/index.ts`, 415 КБ, ±285 маршрутів: 278× POST і 8× GET). AppDeploy запускав бекенд як Lambda-подібний обробник (`export const handler = router({...})`) і два cron-обробники.
* **61 файл** імпортує SDK: 28 у `backend/` (`@appdeploy/sdk`) і 33 у `src/` (`@appdeploy/client`).
* Основна залежність зосереджена в **`db`**: ±770 викликів `db.add/get/list/update/delete` до **82 фіксованих логічних таблиць** та ±10 сімейств динамічних таблиць із префіксом.
  Крім того, код використовує `secrets` (±40×), `storage` (2 файли), `ai` (3 виклики), `invites` (1 потік), `ws` (мертвий код) і `router/json/error`.
  На боці фронтенду це `api.post/get` (±200 викликів), `image.resizeIfNeeded` (3×) та `invitesClient` (4×).
* **Автентифікація AppDeploy не використовується.** Застосунок має власний шар автентифікації: Google OIDC для власника, пароль із TOTP та кодами відновлення, власні сесійні куки та власний RBAC. Отже, замінювати auth-провайдера не потрібно.
* **Рекомендований підхід: шар сумісності ("shim").** Ми пишемо власні модулі з точно таким самим API (`db`, `storage`, `secrets`, `ai`, `invites`, `router/json/error`; клієнт: `api`, `image`, `invitesClient`) поверх Postgres (JSONB), локальної файлової системи та змінних оточення.
  Тоді ±770 викликів `db` залишаються без змін. Повністю реляційна схема (як у `docs/mail/MAIL_DATABASE_SCHEMA.md`) — це фаза 2 і є опціональною.
* **Оцінка трудомісткості:** ±14–19 робочих днів для одного розробника, включно з пунктами безпеки та тестуванням. Див. §7.
* **Стан збірки на старті:** файлу `package-lock.json` немає, тому `npm ci` одразу падає. `npm install` проходить успішно. `npm run build` падає у Vite на `Rollup failed to resolve import "@appdeploy/client"` (як на Node 20, так і на Node 24.21/npm 11).
  Із тимчасовою заглушкою (stub) клієнтського SDK фронтенд збирається повністю (`✓ built in 29.64s`). Деталі в §6.
* **Жодної жорсткої перешкоди немає.** Усі сервіси AppDeploy можна замінити. Лише `ai.*` потребує зовнішнього ШІ-провайдера (або локальних моделей), а production-дані з AppDeploy непросто експортувати. Див. рішення у §9.

---

## 1. Поточна архітектура (як виявлено під час аналізу)

| Компонент | Знахідка |
|---|---|
| Фронтенд | Vite 6 + React 19 + Tailwind 3. Точка входу `index.html` → `src/main.tsx`. `base: './'`, вивід у `dist/` (`APPDEPLOY_VITE_OUT_DIR`). Є service worker (`public/service-worker.js`, пропускає `/api/`). |
| Pre-build скрипти | `scripts/l002-audit.mjs` (статичний аудит, який лише записує `public/l002-diagnostic.json` і ніколи не падає), `scripts/beveiliging-bouw.mjs` та `scripts/mail-slimme-inbox-audit.mjs`. **Увага:** `beveiliging-bouw.mjs` перезаписує `index.html` **безпосередньо в робочому дереві**: вбудовані скрипти та стилі виносяться в `public/canonical-*.js/css`. Тому запускайте збірку в чистій копії або адаптуйте скрипт, щоб він писав у директорію збірки. |
| Runtime-конфігурація фронтенду | `public/canonical-service.js` містить імена хостів 9 служб: `hub`, `id`, `mail`, `cloud`, `ai`, `github`, `huis`, `api` та `admin` (`*.tarasevych.com`). «Технічний хост» розпізнавався за суфіксом `*.v2.appdeploy.ai`. |
| CSP | Встановлювався лише через тег `<meta>` скриптом `public/canonical-security.js`. Продакшен: `script-src 'self'`, `connect-src` із `api-v2.appdeploy.ai`. Технічний хост: `'unsafe-inline' 'unsafe-eval'`. |
| Бекенд | `backend/index.ts` експортує `handler` (маршрутизатор), `mailMaintenanceCron` та `googleSuiteSyncCron`. Поля Lambda-події, які використовуються: `event.headers`, `event.body`, `event.queryStringParameters` та `event.requestContext.http.sourceIp`. Відповіді завжди мають вигляд `{statusCode, headers, body:string}` (без base64/бінарних тіл). Зовнішні npm-залежності бекенду: лише `pdf-lib` та `html-entities`, решта — вбудовані модулі `node:*`. |
| API-транспорт | Клієнтський SDK викликав `https://api-v2.appdeploy.ai/app/migrated-bg2v4h/...` (див. `connect-src` та `API_COOKIE_PATH=/app/migrated-bg2v4h/`). Через це куки були міжсайтовими (cross-site): `SameSite=None; Partitioned`. |
| Cron | `cron.json`: `mail-provider-maintenance` (`*/5`, `batchLimit:3`) та `google-suite-bplus-sync` (`*/5`, `accountLimit:10`), часовий пояс `Europe/Brussels`. |
| Realtime | `backend/realtime.ts` та `backend/realtime-subscribers.ts` (`ws.send`, таблиця `entity_subscriptions`) **ніде не імпортуються** файлом `index.ts`, і фронтенд не використовує `ws`. Це мертвий код. |
| Документація | `docs/mail/MAIL_DATABASE_SCHEMA.md` уже описує нормативну цільову схему PostgreSQL для пошти (фаза 2). |

---

## 2. Інвентаризація використання AppDeploy та заміна

### 2.1 Бекенд (`@appdeploy/sdk`): 28 файлів

| Файл | Імпорт | Використання (кількість викликів) |
|---|---|---|
| `backend/index.ts` | `db, error, invites, isInviteError, json, router, secrets` | db 344, secrets 33, invites 2, router 1 |
| `backend/toegangslaag.ts` | `db` | db 34 |
| `backend/google-suite-inrichting.ts` | `db, error, json, secrets` | db 37, secrets 6 |
| `backend/mail-zoek-duurzaam.ts` | `db` | db 13 |
| `backend/cloud-platform.ts` | `ai, db, error, json, storage` | db 10, storage 6, ai.extract 1 |
| `backend/google-suite-mail-browser.ts` | `ai, db, error, json` | db 9, ai.extract 1 (переклад) |
| `backend/mail-weergave-voorkeuren.ts` | `db, error, json, storage` | db 6, storage 4 (аватари відправників) |
| `backend/google-suite-agenda-fotos.ts` | `db, error, json` | db 6 |
| `backend/google-suite-agenda-sync.ts` | `db` | db 6 |
| `backend/google-suite-sync.ts` | `db` | db 6 |
| `backend/mail-uitstel.ts` | `db, error, json` | db 5 |
| `backend/api-platform-kluis.ts` | `db, secrets` | db 4, secrets 2 |
| `backend/eigenaar-sessie-overdracht.ts` | `db` | db 4 |
| `backend/realtime-subscribers.ts` | `db, ws, json, error` | db 4, ws.send 1 (мертвий код) |
| `backend/google-contour.ts` | `db, secrets` | db 3, secrets 2 + **глобальне перевизначення `secrets.readSecret`** (рядки 162–163) |
| `backend/api-platform-tokens.ts` | `db, error, json` | db 3 |
| `backend/api-platform-verbindingen.ts`, `cognitief-context.ts`, `hub-indeling-voorkeuren.ts`, `mail-pmid-opstart.ts` | `db` (+ `error/json`) | db 1–2 на файл |
| `backend/mail-periode-grenzen-cache.ts` | `db` | db 1 (динамічна таблиця `mail_period_bounds_v2:<hash>`) |
| `backend/mail-handschrift.ts` | `ai, error, json` | ai.ocr 1 (розпізнавання рукописного вводу) |
| `backend/globaal-zoek.ts`, `hub-block-data.ts`, `mail-search.ts` | `db, error, json` | db через хелпери |
| `backend/cloud-google-drive.ts`, `google-suite-browser.ts`, `rbac.ts` | `error, json` | лише хелпери відповідей |

### 2.2 Фронтенд (`@appdeploy/client`): 33 файли

* `api`: ±200 викликів, майже всі — `api.post('/api/...')` із JSON-тілом. Найбільші споживачі: `GoogleMailWerkruimte.tsx` (39), `App.tsx` (31), `VerenigdDienstApp.tsx` (30), `OwnerTestApp.tsx` (19), `ApiPlatformWeergave.tsx` (11) та `MailFunctioneelWeergave.tsx` (10).
  Код очікує `response.data`. При помилках він читає `err.response.status`, `err.response.data.error`, `err.status`, `err.responseText` та `err.message`.
* `image.resizeIfNeeded`: `App.tsx` та `VerenigdDienstApp.tsx` (фото профілю, 512 px JPEG) і `MailHandschriftInvoer.tsx` (1200 px PNG для OCR).
* `invitesClient.getPendingCode / clearPendingCode / buildJoinUrl`: `App.tsx` (`#/join`) та `VerenigdDienstApp.tsx` (`?join=1`). Йдеться про спільний доступ до робочих просторів (workspaces).

### 2.3 Заміна за кожною функцією

| Функція AppDeploy | Використання в застосунку | Заміна у власному хостингу (self-hosted) |
|---|---|---|
| `db.add/get/list/update/delete` | ±770 викликів, 82 фіксовані та ±10 динамічних логічних таблиць, фільтри на рівність полів верхнього рівня (`{userId}`, `{ownerUserId, mailAccountId}`, `{email}`, ...), `limit` і `nextToken` | **Шар сумісності `server/platform/db.ts`** з тими самими сигнатурами поверх `pg` (`node-postgres`, пул з'єднань). Єдина універсальна таблиця `app.records(tbl, id, seq, data jsonb, ...)`. Фільтр перетворюється на `data @> $1::jsonb` (GIN-індекс `jsonb_path_ops`). Порядок за `seq`. `nextToken` = `base64(останній seq)`, тобто keyset-пагінація. `update` замінює весь запис, як і в AppDeploy. Ліміти (500 елементів і 1 MiB за виклик, 256 KiB на запис) контролюються з тими самими повідомленнями про помилки. **Відмінність у поведінці (покращення):** AppDeploy при `limit` рахував *прочитані* елементи, а не *знайдені*. Через це пошуки на зразок `db.list('users',{filter:{email},limit:5})` могли пропускати записи. Postgres повертає справжні збіги. Крім того, додаються методи для атомарних дій (`takeOne`/`deleteWhere ... RETURNING`), необхідні для усунення гонитви (race condition) у handoff (§5). |
| `storage.write/read/delete` (вміст у base64) | Завантаження в Хмару (`cloud/<hash>/<ts>-<rand>.<ext>`, макс. 6 МБ) та аватари відправників (webp) | **Шар сумісності `server/platform/opslag.ts`** поверх `/srv/data/uploads` (`UPLOADS_DIR`). Base64 декодується під час запису і знову кодується під час читання. Сувора валідація шляху: `^[a-zA-Z0-9/_.-]+$`, жодних `..`, і після `path.resolve` шлях повинен залишатися всередині кореневої директорії. Атомарний запис (`tmp` + `rename`), права файлів `0640` і директорій `0750`. Опціонально метадані зберігаються в `app.storage_objects`. `storage.url` не використовується, тому ми його не реалізуємо (кидається чітка помилка). |
| `secrets.readSecret / listSecretNames` | ±40 викликів, 15+ назв (§4.3) | **Шар сумісності `server/platform/geheimen.ts`:** читає з `process.env`, заповненого через `EnvironmentFile=/etc/mijn-ruimte/geheimen.env`. Діє білий список дозволених назв. `listSecretNames` повертає лише ті назви зі списку, які фактично задані. `readSecret` кидає помилку, якщо назва відсутня, як і в AppDeploy. Перевизначення в `google-contour.ts` (рядки 162–163) **видалити**. |
| `router/json/error` | 1 маршрутизатор, ±285 маршрутів `'POST /api/...'` із `:params`, `ctx = {body, query, params, event}` | **Власний `router()` із тією самою семантикою** плюс HTTP-адаптер на `node:http`. Адаптер формує Lambda-подібну подію (`headers` у нижньому регістрі, `body` як рядок, `queryStringParameters`, `requestContext.http.sourceIp` = `cf-connecting-ip`). `json(data,status)` та `error(msg,status)` повертають `{"error": msg}`. Встановлюється ліміт тіла запиту ±12 МБ (6 МБ файл як base64 у JSON). |
| `invites.create/join` (+ `isInviteError`) | Спільний доступ до робочих просторів (`resourceType:'workspace_share'`, `authMode:'anonymous'`, із терміном дії) | **Власний модуль і таблиця `app.invites`.** Код — 128 біт випадкових даних (`base64url`). Поля: `status`, `expires_at`, `revoked_at` та `context jsonb`. `InviteError` отримує ті самі значення `code`. `resolve`/`revoke` — лише за потреби. |
| `ai.extract` (2×) та `ai.ocr` (1×) | Пропозиція метаданих для елементів хмари (з детермінованим резервним варіантом), переклад листів та OCR рукописного тексту | **Адаптер `server/platform/ai.ts`** із `AI_PROVIDER=none|openai|anthropic|gemini|xai|ollama`. `extract` означає виклик чату з JSON-схемою (structured output) плюс валідацію. `ocr` означає vision-виклик. При `none` кидається `AI_UNAVAILABLE` (`AI_NOT_CONFIGURED`). Тоді хмара переходить на детерміновану логіку, а переклад і рукописне введення показують охайне повідомлення. Це **рішення власника** (§9). |
| `ws.send` + `realtime.ts` | Не підключено | **Видалити**: `backend/realtime.ts`, `backend/realtime-subscribers.ts` та невикористовуваний маршрут `/api/subscriptions`. |
| Cron (`cron.json`, обробники в `index.ts`) | 2 задачі, кожні 5 хвилин | **systemd-таймери**, які викликають невеликий CLI (`node dist-server/cron.mjs <назва>`) із тим самим корисним навантаженням, що й у `cron.json`. `Type=oneshot` запобігає накладанню запусків. Логування йде в `journald`. Додатково: `pg_advisory_lock` на кожну задачу. Альтернатива: внутрішньопроцесний `croner` (простіше, але менш ізольовано). |
| `@appdeploy/client` `api` | ±200 викликів | **`src/platform/client.ts`:** `fetch` на same-origin `/api/...`, `credentials:'same-origin'`, JSON, axios-подібна відповідь `{data}` та об'єкт помилки з `response:{status,statusText,data}`, `status`, `responseText` і `message`. |
| `image.resizeIfNeeded` | 3× | Власна реалізація (±60 рядків) через `createImageBitmap` + `canvas`/`OffscreenCanvas` → `toBlob` → base64. Формат повернення: `{data,mimeType,width,height,bytes,resized}`. |
| `invitesClient` | 4× | Власний хелпер, який будує URL із параметром `invite`. Код, що очікує застосування, зберігається в `sessionStorage`. |
| Хостинг і статичні файли | CDN AppDeploy | Той самий Node-сервер роздає `dist/` (напр., з `sirv` або власним обробником). Файли з хешем у назві отримують кешування `immutable`. SPA-fallback на `index.html`. Параметр `base` стає `'/'` замість `'./'`, оскільки URL із шляхом вкладки на зразок `/inbox` не повинні ламатися. |

**Стратегія імпортів:** замінити `'@appdeploy/sdk'` на аліас `'@platform/server'`, а `'@appdeploy/client'` — на `'@platform/client'` (`tsconfig` `paths` + Vite `resolve.alias` + esbuild `alias`). Це механічна зміна 61 рядка. Не використовуйте старі назви пакетів: це створює плутанину і конфліктуватиме, якщо хтось пізніше встановить справжній пакет.

---

## 3. Модель даних і схема Postgres

### 3.1 Чого очікує застосунок

* Записи — це **JSON-документи без жорсткої схеми** в «таблиці» (рядкова назва). Поле `id` (uuid як рядок) генерується базою даних. `db.list` додає `id`, а `db.get` — ні.
* Часові мітки зберігаються в мілісекундах епохи Unix (`createdAt`, `updatedAt`, `expiresAt`, ...) у самому документі.
* Усі записи прив'язані до власника/користувача через поля на зразок `userId`, `ownerUserId` та `tenantKey`.
* Динамічні «таблиці» з префіксом (сторінки кешу, контрольні точки): `mail_period_bounds_v2:*`, `mail_search_cursor_v1:*`, `mail_search_manifest_v1:*`, `mail_search_result_page_v1:*`, `mail_pmid_map_v1:*`, `mail_pmid_bootstrap_v1:*`, `hub_layout_preferences_v1:*`, `mail_state_bulk_active_v1:*`, `mail_state_bulk_operation_v1:*` та `mail_state_bulk_page_v1:*`.
  Вони постійно ростуть і в Postgres потребують **фонової задачі очищення** (TTL, напр., 30 днів за полем `updated_at`).

**Логічні таблиці за доменами (82):**

| Домен | Таблиці |
|---|---|
| Ідентичність та акаунти | `users`, `account_identities`, `access_requests`, `identity_passwords_v1`, `identity_totp_v1`, `identity_recovery_codes_v1`, `identity_phones_v1`, `identity_webauthn_v1`, `identity_method_bindings_v1`, `access_method_policy_v1` |
| Сесії та токени | `owner_service_sessions_v1`, `owner_tab_sessions_v1`, `owner_browser_grants_v1`, `owner_auth_transactions_v1`, `owner_revocation_state_v1`, `service_sessions`, `service_handoffs`, `browser_grants`, `browser_policies`, `google_sessions`, `google_auth_codes`, `google_oauth_states`, `auth_broker_requests`, `api_machine_tokens_v1` |
| Адміністрування та аудит | `admin_role_assignments_v1`, `admin_sso_policy_v1`, `admin_oauth_access_policy_v1`, `admin_directory_connectors_v1`, `owner_security_audit_v2`, `security_audit`, `credential_contours_v1`, `owner_ui_preferences_v1` |
| API-платформа | `owner_vault_v1`, `owner_connections_v1` |
| Хаб і робочі простори | `workspaces`, `workspace_members`, `workspace_blocks`, `site_notifications`, `notification_jobs`, `cognitive_resume_context_v1` |
| Хмара (Cloud) | `cloud_workspaces_v1`, `cloud_items_v1`, `cloud_resume_v1`, `cloud_audit_v1`, `cloud_ai_decisions_v1`, `cloud_provider_accounts_v1`, `cloud_provider_selections_v1`, `cloud_provider_tokens_v1` |
| Google Suite / провайдери | `google_oauth_grant_v1`, `google_suite_onboarding_v1`, `google_suite_oauth_states_v1`, `google_suite_sync_state_v1`, `google_suite_calendar_sync_state_v1`, `google_suite_calendar_events_v1`, `google_suite_drive_projection_v1`, `google_suite_mail_selections_v1`, `google_photos_picker_sessions_v1`, `google_photos_picker_selections_v1`, `provider_principals_v1`, `provider_service_grants_v1`, `provider_service_tokens_v1`, `provider_endpoint_verifications_v1` |
| Пошта (Mail) | `mail_accounts_v1`, `mail_items_v1`, `mail_oauth_states_v2`, `mail_oauth_tokens_v2`, `mail_jobs_v2`, `mail_commands_v2`, `mail_sync_state_v2`, `mail_provider_labels_v2`, `mail_provider_threads_v2`, `mail_provider_subscriptions_v2`, `mail_webhook_events_v2`, `mail_endpoint_verifications_v1`, `mail_metrics_v1`, `mail_notification_preferences_v1`, `mail_view_preferences_v1`, `mail_resume_v1`, `mail_snoozes_v1`, `mail_state_intents_v1`, `mail_state_intent_events_v1` |
| Мертвий код | `entity_subscriptions` (realtime) |

Типові форми записів (із коду): `User {email, sub, name, picture, role: owner|admin|member|viewer, status, accessLevel, entitlements, createdAt, ...}`, `OwnerSession {tokenHash, previousTokenHash, userId, service, sourceOrigin, tabHash, grantId, idleExpiresAt, absoluteExpiresAt, revocationEpoch, rotation, qaSynthetic?, scope}`, `CloudItemRecord {ownerUserId, workspaceId, kind, title, storagePath, mimeType, sizeBytes, tags, status, aiState, ...}` та `MailAccountRecord {ownerUserId, provider: google|microsoft, email, status, grantedScopes, ...}`.

### 3.2 Пропозиція файлу міграції: `migrations/0001_basis.sql` (фаза 1, сумісна)

```sql
-- 0001_basis.sql : базова схема для self-hosted шару сумісності
-- Виконувати від імені власника бази даних mijnruimte (роль mijnruimte).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- gen_random_uuid()
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION mijnruimte;

-- Облік виконаних міграцій
CREATE TABLE IF NOT EXISTS app.schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- Універсальне сховище документів (замінює AppDeploy db.*)
CREATE TABLE app.records (
  tbl         text        NOT NULL CHECK (length(tbl) BETWEEN 1 AND 200),
  id          text        NOT NULL DEFAULT gen_random_uuid()::text,
  seq         bigint      GENERATED ALWAYS AS IDENTITY,
  data        jsonb       NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tbl, id)
);
CREATE UNIQUE INDEX records_tbl_seq_idx ON app.records (tbl, seq);         -- порядок + keyset-пагінація
CREATE INDEX records_data_gin      ON app.records USING gin (data jsonb_path_ops);  -- фільтр: data @> '{...}'
-- Цільові індекси для полів фільтрації, що використовуються найчастіше
CREATE INDEX records_owner_idx  ON app.records (tbl, (data->>'ownerUserId')) WHERE data ? 'ownerUserId';
CREATE INDEX records_user_idx   ON app.records (tbl, (data->>'userId'))      WHERE data ? 'userId';
CREATE INDEX records_email_idx  ON app.records (tbl, lower(data->>'email'))  WHERE data ? 'email';
CREATE INDEX records_mailacc_idx ON app.records (tbl, (data->>'mailAccountId')) WHERE data ? 'mailAccountId';
CREATE INDEX records_tokenhash_idx ON app.records (tbl, (data->>'tokenHash')) WHERE data ? 'tokenHash';
CREATE INDEX records_updated_idx ON app.records (updated_at);                -- TTL-очищення

-- Метадані файлів у /srv/data/uploads (опціонально, для цілісності та очищення)
CREATE TABLE app.storage_objects (
  path          text PRIMARY KEY CHECK (path ~ '^[A-Za-z0-9/_.-]{1,512}$' AND path !~ '\.\.'),
  content_type  text   NOT NULL,
  size_bytes    bigint NOT NULL CHECK (size_bytes >= 0),
  sha256        text   NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Запрошення (замінює AppDeploy invites)
CREATE TABLE app.invites (
  code           text PRIMARY KEY,                  -- 128 біт випадкових даних, base64url
  resource_type  text NOT NULL,
  auth_mode      text NOT NULL CHECK (auth_mode IN ('anonymous','required')),
  allow_list     text[] NOT NULL DEFAULT '{}',
  context        jsonb  NOT NULL DEFAULT '{}',
  created_by     text,
  expires_at     timestamptz,
  revoked_at     timestamptz,
  join_count     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invites_expires_idx ON app.invites (expires_at) WHERE revoked_at IS NULL;

-- Обмеження частоти запитів (Rate limiting) / блокування (пароль, TOTP, коди відновлення, OAuth-старт, ...)
CREATE TABLE app.rate_limits (
  bucket        text        NOT NULL,               -- напр. 'login:ip:203.0.113.5' або 'login:email:<sha256>'
  window_start  timestamptz NOT NULL,
  hits          integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX rate_limits_window_idx ON app.rate_limits (window_start);

CREATE TABLE app.login_lockouts (
  subject       text PRIMARY KEY,                   -- 'email:<sha256>' або 'ip:<addr>'
  failures      integer     NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Запуски cron-задач (спостережуваність; доповнення до journald)
CREATE TABLE app.cron_runs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error')),
  detail       text
);
CREATE INDEX cron_runs_name_idx ON app.cron_runs (name, started_at DESC);

INSERT INTO app.schema_migrations (version) VALUES ('0001_basis');
COMMIT;
```

Примітки:
* Поле `id` має тип `text`, а не `uuid`. Завдяки цьому невалідні ID із запитів не викликають SQL-помилок, а просто повертають `null`, як і в AppDeploy.
* `db.add` виконує `INSERT ... RETURNING id`, `db.get` виконує `WHERE tbl=$1 AND id = ANY($2)`, а shim впорядковує результати відповідно до порядку в запиті. `db.update` виконує `UPDATE ... SET data=$, updated_at=now()`, `db.delete` виконує `DELETE ... WHERE id = ANY`.
* `db.list` виконує `WHERE tbl=$1 AND seq > $cursor AND data @> $filter ORDER BY seq LIMIT $n+1`.
* Транзакції: в AppDeploy їх не було. Наш shim отримує `db.tx(fn)` для нового коду (обмін handoff, ліміти частоти запитів).
* Фаза 2 (опціонально, пізніше): нормалізувати «гарячі» таблиці (`users`, `owner_service_sessions_v1`, `mail_items_v1`, `mail_accounts_v1`, `cloud_items_v1`) у справжні реляційні колонки згідно з `docs/mail/MAIL_DATABASE_SCHEMA.md`. Це потребує ±2–4 тижні додатково і має сенс тоді, коли цього вимагатиме продуктивність.

### 3.3 Дані з AppDeploy

Функції експорту для бази даних або файлового сховища AppDeploy не існує (навіть через MCP-інструменти AppDeploy). Є два варіанти:
1. **Почати з чистого аркуша (рекомендовано).** Усі токени, гранти, елементи сховища, TOTP-секрети та сесії все одно мають бути ротовані й перепідключені згідно з `SECURITY-NOTES.md`. Що втрачається: робочі простори/блоки/нотатки в Хабі, елементи хмари та завантажені файли, а також користувацькі налаштування.
2. Тимчасово розгорнути ендпоінт експорту (лише для власника) на старому застосунку AppDeploy. Він вивантажить кожну таблицю у JSON і файли у base64, після чого ми імпортуємо їх в `app.records`. Це вимагає додаткового деплою на скомпрометованій платформі. Робіть це лише якщо ці дані справді необхідні, і спершу проведіть криміналістичну перевірку.

---

## 4. Фронтенд, автентифікація та секрети

### 4.1 Збірка та роздача фронтенду
* Збірка залишається `vite build` → `dist/` разом із pre-build скриптами. Адаптувати `vite.config.ts`: зафіксувати `outDir` на `dist`, прибрати `APPDEPLOY_*` (за потреби `SOURCEMAP=hidden`), встановити `base: '/'`.
* `beveiliging-bouw.mjs` повинен записувати вивід у директорію збірки (раніше він перезаписував `index.html` у git). Інакше робоче дерево залишається «брудним» після кожної збірки.
* `public/canonical-service.js`: `isTechnicalHost` стає `false` у продакшені (хост AppDeploy зникає). Список доменів має бути конфігурованим, щоб ми могли тестувати локально (див. §7.3). Наприклад, винести його у згенерований сервером `/canonical-config.js` або у змінну збірки `VITE_PUBLIC_DOMAIN`. Той самий список також присутній у `backend/index.ts` (`SERVICE_ORIGINS`), `backend/eigenaar-sessie-overdracht.ts`, `backend/google-suite-inrichting.ts` (`CALLBACK`), `backend/api-platform-kluis.ts` (`revealHostAllowed`) та кількох файлах `src/*`. Це стає **єдиним джерелом** у `backend/deployment-identity.ts` (`TECH_ORIGIN`, `API_COOKIE_PATH`, імена кук).
* Node-сервер обслуговує всі імена хостів з одного процесу. Служба визначається за заголовком `Host` (`ownerCustomHostService`), і це вже працює саме так.

### 4.2 Як працює автентифікація
* **Вхід власника:** Google OIDC (authorization code + PKCE S256, `response_mode=query`) із `redirect_uri = https://id.tarasevych.com/` (корінь). Фронтенд на `id.` надсилає `code`/`state` на callback-маршрути `/api/owner/...`. Власник розпізнавався за **жорстко закодованою e-mail адресою** (`backend/index.ts:30`, `backend/rbac.ts:8`).
* **Вхід за паролем** (`/api/owner/access/password/login` та `/api/owner/auth/password/login`) з опціональним TOTP та кодами відновлення (`backend/toegangslaag.ts`). Старі маршрути Passkeys/WebAuthn зберігали лише `credentialId`, без публічного ключа чи криптографічної перевірки. Отже, це не був справжній метод входу: не вмикати, доки не буде реалізовано належним чином.
* **Сесії** — це власні куки: `__Secure-tsv_ecosystem_<APP_ID>` (спільна сесія), окремі куки на вкладку для кожної служби (`SameSite=Strict`), браузерні гранти (`tsv_bg_*`, `tsv_bp_*`, `SameSite=Lax`), плюс handoff між службами (`eigenaar-sessie-overdracht.ts`). Зберігання відбувається в `owner_service_sessions_v1` та споріднених таблицях (хеш токена) із епохою відкликання (`revocationEpoch`).
* **Машинний API:** Bearer-токени `tsv_...` (`api_machine_tokens_v1`, `GET /api/v1/me`). Вхідний SCIM працює через `SCIM_BEARER_TOKEN`.
* **Провайдери інтеграцій:** Google (Gmail, Drive, Calendar, Photos Picker, Tasks через онбординг «Google Suite») та Microsoft Graph (пошта Outlook). Push-сповіщення працюють через Gmail Pub/Sub (`/api/owner/mail/google/pubsub/push`, перевірка JWT) та вебхуки Graph (`/api/owner/mail/microsoft/webhook`).
* **Куки при власному хостингу:** API стає *same-origin*. `SameSite=None; Partitioned` та `Path=/app/<id>/` більше не потрібні. Пропозиція:
  * Екосистемна кука стає `__Secure-tsv_ecosystem; Domain=tarasevych.com; Path=/api/; HttpOnly; Secure; SameSite=Lax` (або `Path=/`). Так усі піддомени мають спільну сесію, як і з партиціонованою кукою раніше.
  * Куки на службу/вкладку стають host-only (`Path=/; SameSite=Strict`).
  * Вбудовані самотести, які перевіряють `SameSite=None`/`Partitioned`, оновлюються відповідно.

### 4.3 Секрети та змінні оточення (усі згенерувати **заново**)
У `/etc/mijn-ruimte/geheimen.env` (`0640 root:mijnruimte`):
`DATABASE_URL` (вже існує), `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (аліаси `GOOGLE_SUITE_CLIENT_ID` та `GOOGLE_SUITE_CLIENT_SECRET`), `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1`, `OWNER_VAULT_ENCRYPTION_KEY_V1`, `MAIL_TOKEN_ENCRYPTION_KEY_V1`, `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET`, `MICROSOFT_GRAPH_TENANT_ID`, `MICROSOFT_GRAPH_WEBHOOK_URL`, `MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE`, `GOOGLE_GMAIL_PUBSUB_TOPIC`, `GOOGLE_GMAIL_PUBSUB_AUDIENCE`, `GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL`, `SCIM_BEARER_TOKEN` (необов'язково).
**Нові через портування:** `OWNER_EMAIL`, `OWNER_GOOGLE_SUB` (рекомендовано), `IDENTITY_TOTP_ENCRYPTION_KEY_V1` (`TOTP_ENCRYPTION_KEY_V1`), `IDENTITY_RECOVERY_PEPPER_V1` (`RECOVERY_CODE_PEPPER`), `SESSION_TOKEN_PEPPER_V1` (необов'язково), `AI_PROVIDER` та `AI_API_KEY` (залежно від вибору), `PUBLIC_DOMAIN=tarasevych.com`, `PORT=8080`, `HOST=127.0.0.1`, `UPLOADS_DIR=/srv/data/uploads`.
**Скасовуються:** `APPDEPLOY_VITE_OUT_DIR`, `APPDEPLOY_VITE_SOURCEMAP` та ключі акаунта AppDeploy (обов'язково відкликати в AppDeploy).
Крім того, відкликати і створити заново: усі `tsv_`-токени, елементи сховища (Home Assistant, Telegram, GitHub PAT, вебхуки), усі refresh-токени Google і Microsoft, паролі та TOTP.
**OAuth-додатки, які потрібно створити заново:**
* Google Cloud: **новий OAuth-клієнт** (старий секрет скомпрометовано, а стандартний Client ID жорстко закодований у `google-contour.ts:5` та `src/CanoniekImplementatieWaarheidMatrix.tsx`). Redirect URI `https://id.tarasevych.com/`, JS-origins для використовуваних хостів. Крім того, Pub/Sub-топік із push-підпискою на `https://<host>/api/owner/mail/google/pubsub/push` і сервісний акаунт.
* Microsoft Entra: новий клієнтський секрет (або нова реєстрація додатка), redirect `https://id.tarasevych.com/` та URL вебхука Graph на публічному хості.

---

## 5. Відкриті питання безпеки: розташування в коді та рішення

| # | Пункт | Де в коді | Рішення |
|---|---|---|---|
| 1 | **Відсутність rate limit або lockout** на вході за паролем (brute force пароля, TOTP і кодів відновлення; перебір користувачів) | `backend/toegangslaag.ts:203` `verifyPasswordLogin`. Маршрути р. 273 (`/api/owner/access/password/login`) та р. 279 (`/api/owner/auth/password/login`). Також `totp/confirm` (р. 403) і `account/recover`. | Проміжний шар `rateLimit(bucket, max, window)` на `app.rate_limits` (атомарний `INSERT ... ON CONFLICT DO UPDATE SET hits=hits+1 RETURNING hits`). На IP напр. 10/15 хв, на e-mail (sha256) 5/15 хв, і прогресивне блокування в `app.login_lockouts`. TOTP: запам'ятовувати використаний часовий крок (захист від повтору / replay). Відповіді й таймінги тримати однаковими для наявних і неіснуючих користувачів (фіктивний хеш). IP клієнта береться **виключно** з `cf-connecting-ip` (`requestMeta` в `index.ts` раніше дивився спершу на `x-forwarded-for`, який легко підробити). Додатковий шар: правило rate-limit у Cloudflare WAF на `/api/*/password/login`. |
| 2 | **PKCE-verifier та nonce виводилися** через HMAC від клієнтського секрету | `backend/index.ts:321` `ownerOAuthMaterial`, `backend/mail-platform.ts:17` `mailGoogleOAuthMaterial`, `backend/mail-microsoft.ts:1` `mailMicrosoftOAuthMaterial`, `backend/google-suite-inrichting.ts:110` `oauthMaterial` | При старті генерувати `randomBytes(32)` для verifier та nonce, зберігати на сервері в записі стану (`owner_auth_transactions_v1`, `mail_oauth_states_v2`, `google_suite_oauth_states_v1`, `google_oauth_states` / `oauth_pkce_v1`) із TTL ≤ 10 хв та одноразовим використанням (атомарно видаляти під час callback). Поле `nonce` перевіряється в ID-токені. |
| 3 | **`SameSite=None/Partitioned` без перевірки CSRF** | Конструктори кук у `backend/index.ts` (екосистемні, грант-, identity- та redirect-куки) і `backend/eigenaar-sessie-overdracht.ts`. Немає перевірки `Origin` на POST-запитах. | Same-origin API із `SameSite=Lax/Strict` (§4.2), плюс **глобальний білий список Origin** в HTTP-адаптері: для кожного не-GET `/api/*` заголовок `Origin` (або `Referer`) повинен дорівнювати `https://<Host>` і входити до списку служб. Винятки: вебхуки (`/api/owner/mail/microsoft/webhook`, `/api/owner/mail/google/pubsub/push`, які мають власну криптографічну перевірку), `/api/v1/*` із Bearer та SCIM. `Content-Type` має бути `application/json`. |
| 4 | **Довіра до `x-forwarded-host`** | `backend/index.ts:278` `ownerHost`, `backend/eigenaar-sessie-overdracht.ts:17` `hostOf`, `backend/api-platform-kluis.ts:69` `requestHost` | Використовувати лише `Host` і валідувати за списком дозволених хостів (інакше 421/400). Сервер слухає на `127.0.0.1`. У `cloudflared` **не** встановлювати `httpHostHeader`. Адаптер видаляє вхідний `x-forwarded-host` із `event.headers`. **Також:** `revealHostAllowed` (`api-platform-kluis.ts:73`) дозволяв `localhost`, `127.0.0.1` та `internal.appdeploy.runtime`. Це небезпечно при власному хостингу, бо будь-який локальний процес міг би звернутися до сховища секретів. Ці значення потрібно прибрати. |
| 5 | **CSP `unsafe-inline`/`unsafe-eval`** | `public/canonical-security.js` (qa/технічна політика). HTML-сторінка callback із `script-src 'unsafe-inline'` у `backend/index.ts:321`. CSP стояв лише в meta-тезі. | Технічний хост зникає, а разом із ним і qa-політика. CSP передається як **HTTP-заголовок** від Node-сервера: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob: https://*.googleusercontent.com; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'`. Директива `'wasm-unsafe-eval'` необхідна, оскільки `sql.js`, `h5wasm` і `pdf.js` використовують WebAssembly. Сторінка callback отримує per-request `nonce` або `sha256`-хеш. Meta-тег залишається як другий шар, без хостів AppDeploy. Інші заголовки (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP) додаються також на статичні відповіді. |
| 6 | **Відсутній DOMPurify** | `src/MailOpgemaaktDocumentVoorbeeld.tsx:1` `dangerouslySetInnerHTML={{__html:content.html}}`. Додатково перевірити: `src/mail-document-inhoud.ts` та `src/mail-docx-kopie.ts` (`template.innerHTML`, інертний, але вивід рендериться). | Додати `dompurify`. `DOMPurify.sanitize(html,{USE_PROFILES:{html:true}, FORBID_TAGS:['style','form','input','iframe','object','embed'], FORBID_ATTR:['style'], ALLOW_DATA_ATTR:false})` та хук, який блокує або перезаписує зовнішні `src`/`href`. Використовувати єдиний хелпер `sanitizeHtml()` в усіх місцях. |
| 7 | **TOTP-секрети у відкритому тексті. Коди відновлення хешовані через HMAC із фіксованим ключем** | `backend/toegangslaag.ts:30` (`createHmac('sha256','mij-prostir-access-v1')`). Запис TOTP `identity_totp_v1.secret` (base32, використовується на р. 216 і 409). | Шифрувати TOTP-секрет за допомогою `AES-256-GCM` (`TOTP_ENCRYPTION_KEY_V1`, `AAD = userId`). Коди відновлення: `HMAC-SHA256` із `RECOVERY_CODE_PEPPER`, одноразове використання. Оскільки ми починаємо з чистої БД (а старі записи мігруються автоматично при першому використанні), усі секрети захищені. |
| 8 | **Жорстко закодований власник** | `backend/index.ts:30` `OWNER`, `backend/rbac.ts:8` `OWNER_EMAIL` | Береться зі змінної оточення `OWNER_EMAIL` (і за бажанням `OWNER_GOOGLE_SUB`). Перевірка під час запуску: без цього значення сервер не стартує. Окремо захистити Google-акаунт власника (див. `SECURITY-NOTES.md`). |
| 9 | Перевизначення секретів через базу даних у `google-contour` | `backend/google-contour.ts:162–163` (`mutable.readSecret=...`) | Видалити. Секрети надходять виключно з оточення (пізніше — також із криптографічно захищеного сховища власника). Текст UI про «контурне» зберігання оновити. |
| 10 | Обмін handoff працює за схемою list-then-delete (гонитва) та вразливий до login-CSRF через `?handoff=` | `backend/eigenaar-sessie-overdracht.ts:48` (`POST /api/owner/session/handoff/redeem`) | Атомарно: `DELETE FROM app.records WHERE tbl='service_handoffs' AND data @> {...} RETURNING data` (через `db.takeOne`). Handoff-токен прив'язується до браузерної куки `tsv_handoff_binding`, встановленої під час створення, а обмін вимагає POST із перевіркою `Origin`. |
| 11 | DNS-rebinding TOCTOU у захисті від SSRF для зовнішніх зображень | `backend/google-suite-mail-browser.ts:26` (`publicHttpsTarget` виконує `lookup()`, а потім окремо `fetch()`) | Власний `pinnedFetch` із перевіркою та закріпленням (pinning) публічної IP-адреси безпосередньо в `lookup`-хуку сокета під час з'єднання, із відхиленням приватних діапазонів. Не слідувати за редиректами автоматично (перевіряти кожен хоп окремо). Обмеження на розмір і час. |
| 12 | Невикористовувані `/api/subscriptions` та realtime-код | `backend/realtime*.ts` | Видалити. |
| 13 | QA-фікстури та технічний хост | `OWNER_QA_FIXTURES_ENABLED=false` (`index.ts`), `src/OwnerTestApp.tsx`, `internal.appdeploy.runtime` у самотесті | Повністю видалити з коду продакшену. |
| 14 | Наявна раніше проблема: WebAuthn без верифікації | `backend/toegangslaag.ts:366–390` | Вимкнути в UI у Фазі B, а згодом реалізувати повноцінну криптографічну перевірку (див. гілки `passkey-schvalennya` та `aanmeldmethoden`). |

---

## 6. Стан збірки й тестів на момент аналізу (протестовано в чистій копії у `/tmp`)

| Крок | Результат |
|---|---|
| `npm ci` | **Падає одразу:** `EUSAGE: The npm ci command can only install with an existing package-lock.json`. У репозиторії не було lock-файлу. |
| `npm install` | Успішно (284 пакети). Попередження: `file-type@22` та `pdfjs-dist@6` вимагають Node ≥ 22 (на тестовій машині був Node 20.19). З Node 24.21/npm 11.21 (через `npx -p node@24`) також проходить добре, але npm 11 повідомляє, що скрипти встановлення `esbuild` та `tesseract.js` іще не схвалені (`npm install-scripts approve`). |
| `npm run build` (Node 20 та Node 24) | Аудити проходять успішно. L002 повідомляє 2 діагностичні пункти, які не блокують збірку: `b4-important-free:src/mail-zijbalk-navigatie.css` та `test-suite-current-generation-count`. Після цього **падає Vite:** `[vite]: Rollup failed to resolve import "@appdeploy/client" from "src/App.tsx"`. **Цього пакета навіть немає в `package.json`**: він інжектитьcя платформою AppDeploy. |
| Збірка з тимчасовою заглушкою для `@appdeploy/client` | **Успішно** (`✓ built in 29.64s`). Є великі чанки (зокрема `hdf5_hl` 4,8 МБ, `officeparser` 2,7 МБ, головний чанк 2,9 МБ). Працює, але розділення коду (code-splitting) є бажаним покращенням. |
| `tsc` бекенду (із заглушками типів SDK) | 15 помилок типів, які **не мають жодного стосунку до SDK** (напр. `toegangslaag.ts:52/56` "Expected 3 arguments, but got 4", `index.ts:241` порівняння з `'owner'` та `mail-search.ts:1`). AppDeploy, вочевидь, не виконував перевірку типів. Бандлінг через `esbuild` працює. |
| `tsc -p tsconfig.json` (фронтенд, із заглушками) | 219 наявних помилок типів у 58 файлах (`strict`, невикористані змінні, ...). Це не блокує збірку Vite. Очищення типів не залежить від портування. |
| Тести | Тест-раннера не було. `tests/tests.txt` містив 10 ручних/E2E-сценаріїв (у форматі AppDeploy QA). |

Висновок: єдине, що падало через SDK — це резолюція імпортів (`@appdeploy/client` у фронтенді, `@appdeploy/sdk` у бекенді). Решта збірки працювала.

---

## 7. Обсяг робіт, покроковий план і підхід до тестування

### 7.1 Обсяг робіт
* **Механічні зміни:** 61 рядок імпортів (28 у бекенді, 33 у фронтенді).
* **Змістовні зміни наявних файлів:** ±15 файлів: `backend/index.ts`, `toegangslaag.ts`, `eigenaar-sessie-overdracht.ts`, `google-contour.ts`, `api-platform-kluis.ts`, `mail-platform.ts`, `mail-microsoft.ts`, `google-suite-inrichting.ts`, `google-suite-mail-browser.ts`, `rbac.ts`, `deployment-identity.ts`, `public/canonical-security.js`, `public/canonical-service.js`, `src/MailOpgemaaktDocumentVoorbeeld.tsx`, `vite.config.ts`, `package.json` та `scripts/beveiliging-bouw.mjs`/`l002-audit.mjs`.
* **Нові файли:** ±15 файлів: `server/platform/{db,opslag,geheimen,router,uitnodigingen,ai,beveiliging}.ts`, `server/start.ts`, `server/cron.ts`, `src/platform/client.ts`, `migrations/0001_basis.sql` плюс виконавець міграцій, `deploy/` (systemd-юніти, приклад `cloudflared`, шаблон env) і тести.
* **Видалення:** `backend/realtime.ts`, `backend/realtime-subscribers.ts`.

| Пакет робіт | Оцінка |
|---|---|
| HTTP-сервер + сумісний маршрутизатор + статика + білий список хостів + заголовки + перевірка здоров'я | 2 дні |
| db-shim на Postgres + виконавець міграцій + модульні тести проти справжньої PG | 1,5–2 дні |
| storage-shim (ФС) + тести | 0,5 дня |
| secrets (env) + валідація конфігурації під час запуску | 0,5 дня |
| invites + клієнтські хелпери (`api`, `image`, `invitesClient`) | 1 день |
| ai-адаптер (1 провайдер) або охайне вимкнення | 0,5–1 день |
| cron-CLI + systemd-таймери | 0,5 дня |
| Централізація доменів/кук/технічного хоста, оновлення самотестів | 1,5 дня |
| Пункти безпеки 1–11 (§5) | 4–5 днів |
| Артефакти розгортання (systemd, cloudflared, env, резервне копіювання з `pg_dump` + uploads) | 1 день |
| Локальне тестування, E2E (10 сценаріїв) і виправлення | 2–3 дні |
| **Разом** | **±14–19 робочих днів** (3–4 тижні для одного розробника) |
| (Опціонально, фаза 2) реляційна схема для пошти/сесій | +2–4 тижні |

### 7.2 Кроки виконання (у цьому порядку)
1. **Lock-файл та інструментарій:** додати поле `engines` (`node >=24`). На Node 24/npm 11 запустити `npm install` і закомітити `package-lock.json`. Схвалити install-скрипти (`esbuild`). Так знову запрацює `npm ci`.
2. **Зробити збірку гігієнічною:** `beveiliging-bouw.mjs` працює як плагін або пише в директорію збірки, `vite.config.ts` без `APPDEPLOY_*` та з `base:'/'`.
3. **Клієнтський shim** `src/platform/client.ts` плюс аліас. Завдяки цьому збирається фронтенд.
4. **Каркас сервера:** `server/start.ts` (`node:http`, ліміт тіла запиту, побудова події, валідація `Host`, перевірка `Origin`, заголовки безпеки, статична `dist/` із SPA-fallback, `/api/_healthcheck` та `/__gezondheid`). `router/json/error` із тією самою семантикою.
5. **Платформні shims:** `db` (Postgres JSONB), `storage` (ФС), `secrets` (env), `invites`, `ai`. Міграція `0001_basis.sql` плюс виконавець (`node dist-server/migrate.mjs`).
6. **Перевести імпорти бекенду** на новий аліас. Бандлінг через `esbuild` (`--platform=node --format=esm --target=node24 --packages=external`) у `dist-server/server.mjs`, `cron.mjs` та `migrate.mjs`.
7. **Очищення:** прибрати realtime-код, технічний хост і QA-фікстури, зробити `deployment-identity.ts` єдиним джерелом доменів та імен кук, оновити атрибути кук.
8. **Пункти безпеки** з §5 у порядку критичності: 4 (`Host`), 3 (CSRF), 1 (rate limit), 2 (PKCE), 8 (власник), 9 (контур), 7 (TOTP), 6 (DOMPurify), 5 (CSP), 10 (handoff), 11 (SSRF).
9. **Cron** перевести на CLI і таймери, додавши фонову задачу TTL-очищення для динамічних таблиць, `rate_limits` і прострочених сесій.
10. **Локальне тестування** (§7.3).
11. **Розгортання на ВМ** (§8). Спершу лише `hub` та `id` через тунель, потім решта хостів.
12. **Налаштувати нові OAuth-клієнти й секрети**, перепідключити інтеграції (Google, Microsoft, сховище). Після цього вимкнути застосунок в AppDeploy і відкликати ключі AppDeploy.

### 7.3 Локальне тестування
* **Node 24+:** `npx -y -p node@24 -p npm@11 ...` або встановлений системно Node LTS.
* **Postgres 17/18:** через Docker або локальний кластер PostgreSQL, після чого `node dist-server/migrate.mjs`.
* **Імена хостів:** використовувати `PUBLIC_DOMAIN=localhost` із `hub.localhost`, `id.localhost`, ... або `--host-resolver-rules="MAP *.tarasevych.com 127.0.0.1"` із локальним TLS-проксі.
* **Тести:**
  * Модульні тести для db-shim проти справжньої PG (семантика `add/get/list/update/delete`, фільтри, пагінація, ліміти та відхилення невалідних ID).
  * Валідація шляхів файлового сховища (захист від path traversal).
  * Маршрутизатор: параметри та форми помилок.
  * Rate limiter та перевірка `Origin`.
* **Димовий тест (Smoke-test):** `curl -H 'Host: hub.tarasevych.com' http://127.0.0.1:8080/api/_healthcheck`, плюс негативні тести: невідомий `Host` повертає 421, POST без `Origin` або з чужим `Origin` повертає 403, а `x-forwarded-host` ігнорується.
* **E2E:** 10 сценаріїв із `tests/tests.txt` за допомогою Playwright (десктоп `1280×800` і мобільний `375×667`).

---

## 8. Розгортання на ВМ (концепція)

**Структура директорій:** `/srv/mijn-ruimte/releases/<git-sha>/` (містить `dist/`, `dist-server/`, `node_modules` через `npm ci --omit=dev`) і символічне посилання `/srv/mijn-ruimte/current`.

`/etc/systemd/system/mijn-ruimte.service`:
```ini
[Unit]
Description=Мій простір (mijn-ruimte) web-app
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=mijnruimte
Group=mijnruimte
WorkingDirectory=/srv/mijn-ruimte/current
EnvironmentFile=/etc/mijn-ruimte/geheimen.env
Environment=NODE_ENV=production HOST=127.0.0.1 PORT=8080 UPLOADS_DIR=/srv/data/uploads
ExecStart=/usr/bin/node dist-server/server.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ReadWritePaths=/srv/data/uploads
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
LockPersonality=yes
MemoryMax=1500M

[Install]
WantedBy=multi-user.target
```
*(Примітка: згідно з рішенням `B-009` на Ubuntu 26.04.1 LTS у всіх `deploy/*.service` також встановлено `RestrictSUIDSGID=no`, щоб seccomp у `systemd 259` не блокував системний виклик `openat2` у `GNU tar 1.35`.)*

Cron: `mijn-ruimte-cron@.service` (`Type=oneshot`, `ExecStart=/usr/bin/node dist-server/cron.mjs %i`, з тим самим захистом) плюс таймери з `OnCalendar=*:0/5` і `RandomizedDelaySec=30`, а також щогодинний таймер `opruimen`.

`cloudflared` (`/etc/cloudflared/config.yml`):
```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /etc/cloudflared/<TUNNEL-UUID>.json
ingress:
  - hostname: hub.tarasevych.com
    service: http://127.0.0.1:8080
  - hostname: id.tarasevych.com
    service: http://127.0.0.1:8080
  # mail/cloud/ai/mcp/github/huis/admin/api/dashboard -> до тієї самої служби
  - service: http_status:404
```
Не перезаписувати `httpHostHeader`/`originServerName`: застосунку потрібен оригінальний заголовок `Host`.
Вебхуки (`/api/owner/mail/microsoft/webhook`, `/api/owner/mail/google/pubsub/push`) та OAuth-callback (`https://id.tarasevych.com/`) мають залишатися публічно доступними.

**Резервні копії:** щоденний `pg_dump -Fc mijnruimte` та копія `/srv/data/uploads`, обидва зашифровані (`age`) і збережені поза межами ВМ, із обов'язковою перевіркою відновлення.

---

## 9. Рішення для власника (питання на старті портування)

1. **Імена хостів.** Код знав 9 служб: `hub`, `id`, `mail`, `cloud`, `ai`, `github`, `huis`, `api` та `admin` (плюс статичний `dashboard`, а пізніше додано 11-й піддомен `mcp`). Які хости вмикаємо в першому релізі в тунелі?
2. **Спільна сесія між піддоменами:** кука з `Domain=.tarasevych.com` (рекомендовано, відповідає поточній поведінці) чи окрема на кожен хост плюс handoff?
3. **Дані:** почати з чистої бази даних (рекомендовано) чи робити одноразовий експорт із AppDeploy (§3.3)?
4. **ШІ-функції** (метадані хмари, переклад пошти, OCR рукописного тексту): який провайдер і API-ключ, чи тимчасово вимкнути на етапі переїзду?
5. **Google OAuth:** створити новий клієнт із Redirect URI `https://id.tarasevych.com/`.
6. **Microsoft Graph (Outlook):** чи потрібен у першому релізі? Якщо так — новий клієнтський секрет і публічний webhook-URL.
7. **Cron:** systemd-таймери (рекомендовано) чи всередині процесу.
8. **Passkeys (WebAuthn):** тимчасово вимкнути у Фазі B (рекомендовано), а потім реалізувати справжню криптографічну перевірку.
9. **Фаза 2** (реляційна схема для пошти) — зараз чи пізніше.
10. **Cloudflare Access** для `admin.`/`api.` як додатковий шар чи власна двофакторна ізоляція Технічного профілю?

---

## 10. Хід виконання (Журнал реалізації портування)

### 10.1 Фаза A: завершено (3 жовтня 2026, гілка `zelf-hosten`)

Застосовані рішення власника:
1. **Чиста база даних.** Жодної міграції даних із AppDeploy і жодного ендпоінта експорту.
2. **ШІ на старті Фази A вимкнено.**
   - `ai.extract`/`ai.ocr`/`ai.generate` повертали `AI_NOT_CONFIGURED` (503).
   - Хмара використовувала вбудовані детерміновані пропозиції (`aiState=fallback`, `CLOUD_AI_FALLBACK`).
   - Переклад повертав 503 `AI_NOT_CONFIGURED`. OCR рукописного тексту — 503 `MAIL_HANDWRITING_OCR_UNAVAILABLE`.
3. **Дашборд (`dashboard.tarasevych.com`).**
   - Сервер роздає статичні файли з `DASHBOARD_DIR` (стандартно `/srv/mijn-ruimte/dashboard`) для `dashboard.tarasevych.com`.
   - Якщо директорія відсутня, повертає 404. Жодного API там немає.
4. **Google лише через змінні оточення.**
   - Жорстко закодований Client ID та перевизначення секретів через базу даних видалено.
   - Без `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` діє стан `configured:false` без падіння сервера.
   - Microsoft/Outlook вимкнено, доки змінні оточення відсутні.
5. **Єдиний вхід для всіх піддоменів `*.tarasevych.com`.**
   - Куки: `Domain=.tarasevych.com; Path=/; Secure; HttpOnly; SameSite=Lax` (куки вкладок — `Strict`).
   - Більше немає `SameSite=None`/`Partitioned`. API працює як same-origin на кожному хості (`/api/*`).
   - Багатокористувацький і мультиакаунтний режими (екосистемна сесія, сесії вкладок, браузерні гранти, перемикання акаунтів) збережено повністю.

Що створено у Фазі A:
- **Платформний шар** (`server/platform/`):
  - `db` поверх Postgres-JSONB (`app.records`).
  - `storage` (`opslag.ts`) на локальній ФС (`UPLOADS_DIR`, сувора перевірка шляхів, атомарний запис).
  - `secrets` (`geheimen.ts`) з env (білий список), `ai`, `invites` (`uitnodigingen.ts`), `router/json/error`.
- **Міграції:** `migrations/0001_basis.sql` плюс виконавець `server/migrate.ts` (advisory lock, транзакція на кожен файл).
- **Фронтенд-шар:** `src/platform/client.ts` (same-origin `api`, `image.resizeIfNeeded`, `invitesClient`).
- **Сервер** `server/start.ts` (`node:http`, `127.0.0.1:PORT`):
  - Білий список хостів: 421 для невідомих хостів.
  - Перевірка здоров'я `/__gezondheid` (включно з БД).
  - Lambda-подібна подія для наявного маршрутизатора.
  - IP клієнта виключно з `cf-connecting-ip`. Заголовки `x-forwarded-*`, `forwarded` та `x-real-ip` ігноруються або перезаписуються.
  - Роздача `dist/` із SPA-fallback, ETag/304 та `immutable` для хешованих асетів.
  - CSP як HTTP-заголовок (плюс `frame-ancestors 'none'`), HSTS, `nosniff`, `Referrer-Policy`, `X-Frame-Options` та `Permissions-Policy`.
  - Ліміт тіла запиту 12 МБ, коректне завершення роботи (graceful shutdown).
- **Cron:** `server/cron.ts`, CLI для `mail-provider-maintenance` та `google-suite-bplus-sync`. Призначено для systemd-таймерів із `pg_try_advisory_lock` і логуванням у `app.cron_runs`.
- **Збірка:**
  - `security-build` (`beveiliging-bouw`) оформлено як плагін Vite, щоб робоче дерево більше не перезаписувалося.
  - `npm run build` = аудити + Vite + `dist-server/*.mjs` (`esbuild`).
  - Згенеровано `package-lock.json` (Node 24).

Димові тести (Postgres 17.11, Node 24.21):
- **curl:**
  - `/__gezondheid` → `{"ok":true,"db":true}`; `/api/_healthcheck` → 200.
  - `hub`/`id`/`cloud` завантажуються зі статусом 200 та заголовком CSP. SPA-fallback працює; відсутній асет повертає 404. Асети: `immutable` + ETag/304.
  - Невідомий хост → 421. Підробка `X-Forwarded-Host` → 421. Path traversal → `index`/404, ніколи не видає файли поза `dist/`.
  - Дашборд: 404 без директорії, 200 із директорією (власний CSP). `/api/*` на дашборді → 404.
- **`scripts/rooktest-lokaal.mjs`** (22/22):
  - Анонімний bootstrap; кука очищення з `Domain=.tarasevych.com` і `SameSite=Lax`, без `Partitioned`.
  - Одна посіяна сесія дійсна на `hub`, `cloud`, `mail` та `id`. Служба, що не відповідає хосту → 401.
  - Список акаунтів (multi-account) відповідає. IP сесії = `cf-connecting-ip`.
  - Створення робочого простору; рядок з'являється в `app.records`.
  - Завантаження і скачування файлу повертає ідентичні байти, із рядком у `storage_objects` та файлом на диску. Пошук знаходить елемент.
  - Другий користувач не бачить елементів власника.
  - Перевірка пароля: правильний → ok, неправильний → 401.
  - Google без env: `configured:false`, без помилки 500.
- **`scripts/lokaal-e2e/`** (Playwright із Chrome через тестовий https-проксі, що імітує тунель), 6/6:
  - `tests.txt` тест 1: анонімна оболонка на `hub`/`id` не порожня.
  - `tests.txt` тест 3: авторизований Хаб показує «Огляд» із вмістом; `cloud` також працює.
  - Кука діє і для `mail`. Жодних порушень CSP.
- **Міграції:** повторний запуск є ідемпотентним.
- **Cron:**
  - Обидві задачі: ok.
  - Другий одночасний запуск пропускається (advisory lock).
  - Невідома задача повертає код виходу 2.

### 10.2 Об'єднання змін AppDeploy v30–v56 (коміт `142f625`)
- Патч `appdeploy-v31-v56.patch` (база v29) застосовано через `git apply --3way`; `@appdeploy/client` замінено на `./platform/client`.
- Перенесено: редактор написання листа (зміна розміру, чернетки), відносні дати, попередній перегляд вкладень, бічна/верхня панель, контраст світлої теми, виправлення `use-external-rect`, час очікування handoff 12 с із повтором, білий список редиректів.
- **Свідомо відкинуто:** усі зміни v54–v56, які перенаправляли Google-вхід назад на хост AppDeploy (`migrated-bg2v4h.v2.appdeploy.ai`). Callback залишається `https://id.tarasevych.com/`, ціль після входу — `hub.tarasevych.com`; origin AppDeploy більше ніде не фігурує в білому списку.

### 10.3 Рішення власника щодо відкритих питань (коміти `1287f21`, `cd9712e`)
1. Не публікувати `l002-diagnostic.json`: аудит пише у `rapporten/` (у `.gitignore`); сервер повертає 404 на цей шлях, `*.map` і dotfiles.
2. Атрибут `Domain=.tarasevych.com` підтверджено (усі піддомени належать власнику).
3. Директиву `'wasm-unsafe-eval'` дозволено в `script-src` (у заголовку та meta), а `'unsafe-eval'` — заборонено.
4. Технічний хост AppDeploy, `OwnerTestApp`, QA-фікстури та інтеграційні лабораторії видалено; `l002-audit` і `tests/tests.txt` оновлено.

### 10.4 Фаза B безпеки: завершено (коміт `8a2d63f`)
Усі пункти з §5 вирішено; деталі та статус за кожним пунктом наведено в [`SECURITY-NOTES.uk.md`](./SECURITY-NOTES.uk.md) §3, змінні оточення — в [`ENV-VARS.uk.md`](./ENV-VARS.uk.md).
Неверифіковані Passkeys було вимкнено до впровадження справжньої WebAuthn-верифікації (яку реалізовано 08–09.10.2026 у гілках `passkey-schvalennya` та `aanmeldmethoden`).
Тести: димовий тест 42/42, модульні тести 12/12 (`scripts/eenheidstests.mjs`), браузерний тест 7/7 (`scripts/lokaal-e2e/test-alles.sh` запускає все).

### 10.5 Артефакти розгортання (директорія `deploy/`)
`mijn-ruimte.service`, `mijn-ruimte-cron@.service` + таймери (`mail-onderhoud`, `google-sync`, `opruimen`),
`mijn-ruimte-backup.service/.timer` + `backup-maken.sh` (pull-модель), `cloudflared-config.yml`,
`installeer-app.sh` (ініціалізація / встановлення з автоматичним відкатом / відкат / список релізів). Див. [`deploy/LEESMIJ.uk.md`](./deploy/LEESMIJ.uk.md) / [`deploy/LEESMIJ.md`](./deploy/LEESMIJ.md).

### 10.6 Закриття останніх теоретичних ризиків (коміт `0160a0b`)
Handoff прив'язано до браузера, який його створює (`tsv_handoff_binding`), код відновлення витрачається атомарно (`db.takeArrayValue`).
Див. [`SECURITY-NOTES.uk.md`](./SECURITY-NOTES.uk.md) §3 (пункти 14 і 15). Тести: димовий тест 47/47, модульні тести 19/19, браузерний тест 10/10.

### 10.7 Перше розгортання на ВМ (3 жовтня 2026, коміт `0b32ecd`, реліз `20261003-115704`)
ВМ `mijn-ruimte-webserver` (`<VM-IP>`): виконано `installeer-app.sh inrichten` + `installeren`, секрети згенеровано на ВМ
(`geheimen-aanvullen.sh`), дашборд розміщено в `/srv/mijn-ruimte/dashboard`, основна служба + чотири таймери активні, резервне копіювання протестовано
(включно з пробним відновленням). Відкрито лише локальний порт `127.0.0.1:8080`; правила `ufw` без змін. Під час розгортання виявлено й вирішено:
нестачу пам'яті (OOM) при збірці Vite на 2 ГБ RAM (збірку перенесено в cgroup з обмеженням пам'яті), самопосилальний симлінк `current` під час
першої інсталяції та тихий не-старт сервера через симлінк `current/` (виправлено перевірку `isMain` із `realpath`).

### 10.8 Запуск Cloudflare Tunnel (3 жовтня 2026, ~12:16)
Тунель `mijn-ruimte` (`a176c08b-29e7-47b0-95d9-9ec9383572f2`), 10 нових CNAME-записів, захищений `cloudflared.service`,
4 з'єднання (`ams`/`bru`). Усі десять хостів ззовні повертають 200; тимчасовий `cert.pem` знищено через `shred`.

### 10.9 Зашифровані резервні копії за допомогою `age` (3 жовтня 2026, ~12:40)
Модель із публічним ключем: одна пара ключів X25519, згенерована на робочому ПК; приватний ключ зберігається виключно на ПК власника
в `R:\mijn-ruimte-reservekopie\sleutels\herstelsleutel-age.txt` (ACL лише для власника), а ВМ має лише публічний ключ
`/etc/mijn-ruimte/backup-ontvanger.age.pub`. Скрипт `backup-maken.sh` передає потік `pg_dump` та архів завантажень безпосередньо через
`age -R` (реліз `20261003-123345`, коміт `c4429df`); сама ВМ не може розшифрувати створені нею резервні копії. Зашифрований
архів секретів (`geheimen.env` + облікові дані тунелю) збережено на `R:\`; пробне розшифрування та пробне відновлення (через конвеєр із ПК у тимчасову базу даних) пройшли успішно. Скрипт `deploy/reservekopie-ophalen.ps1` завантажує найновішу резервну копію на `R:\`; [`deploy/HERSTEL.md`](./deploy/HERSTEL.md) — план аварійного відновлення. Пояснення по кожній папці (українською + нідерландською): `deploy/pc-uitleg/`.

### 10.10 Подальші кроки (виконані у жовтні–листопаді 2026)
- Офлайн-копія ключа відновлення (USB/папір); заплановане завдання для автоматичного завантаження бекапів; Cloudflare: Always Use HTTPS.
- Старі незашифровані тестові резервні копії `20261003-115845`/`-115908` на ВМ автоматично видалені за 7-денною ротацією.
- Новий Google OAuth-клієнт (`redirect_uri: https://id.tarasevych.com/`), повноцінне WebAuthn-ядро (`passkey-schvalennya` та `aanmeldmethoden`), інтеграція ШІ-агентів через MCP (`mcp.tarasevych.com`), глобальний пошук `/zoek` та мультиагентна оркестрація `ORCH-001` / `TRACE-001` повністю реалізовані на наступних етапах (див. [Історію проєкту](./docs/hub/GESCHIEDENIS.uk.md)).
