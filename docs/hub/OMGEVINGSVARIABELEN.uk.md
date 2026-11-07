> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./OMGEVINGSVARIABELEN.md)) · [🇳🇱 **Nederlandse versie**](./OMGEVINGSVARIABELEN.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей](../INDEX.md)
> 🧭 **Розділи Хабу (`docs/hub/`):** [1. Архітектура](./ARCHITECTUUR.uk.md) · [2. Історія](./GESCHIEDENIS.uk.md) · [3. Гілки, PR та Випуски](./TAKKEN-EN-PRS.uk.md) · [4. Структура коду](./MAP-STRUCTUUR.uk.md) · [5. Змінні середовища](./OMGEVINGSVARIABELEN.uk.md) · [6. Оркестрація та Розгортання](./ORCHESTRATIE-EN-UITROL.uk.md)

# Довідник змінних середовища та ключів шифрування (`ENV-VARS`)

Усі секрети на production ВМ платформи «Мій простір / Mijn Ruimte» зберігаються виключно у файлі **`/etc/mijn-ruimte/geheimen.env`** (права `0600 root:root` або `0640 root:mijnruimte`), який завантажується через директиву `EnvironmentFile=` у systemd-юнітах. Окремий файл **`/etc/mijn-ruimte/migratie.env`** (`0600 root:root`) використовується виключно під час запуску SQL-міграцій. Жоден секрет ніколи не комітиться в Git і не потрапляє у клієнтський бандл.

> [!TIP]
> **Автоматична генерація відсутніх ключів на ВМ:**
> Команда `sudo /usr/local/sbin/mijn-ruimte-installeer geheimen` ([`deploy/geheimen-aanmaken.sh`](../../deploy/geheimen-aanmaken.sh)) автоматично створює всі відсутні ключі шифрування за допомогою `openssl rand`, не перезаписуючи наявні, і записує лише криптографічні відбитки (fingerprints) у журнал аудиту.

---

## 1. Обов'язкові змінні та ключі шифрування (`/etc/mijn-ruimte/geheimen.env`)

| Змінна | Призначення | Формат / Генерація |
|---|---|---|
| `DATABASE_URL` | Основне під'єднання до PostgreSQL (БД `mijnruimte`, версія PG ≥ 16, на продакшені PG 18.6). Після розділення ролей переноситься у `/etc/mijn-ruimte/migratie.env`. | `postgres://mijnruimte:<пароль>@127.0.0.1:5432/mijnruimte` |
| `OWNER_EMAIL` | E-mail адреса власника платформи (super-admin). Сервер не запуститься без цієї змінної. | E-mail у нижньому регістрі |
| `AUDIT_IP_PEPPER` | Таємний pepper (`HMAC-SHA256`, мін. 32 символи) для хешування IP-адрес у `app.audit` (`ip_hash`). Сервер не стартує без нього. | `openssl rand -base64 48 \| tr -d '\n'` |
| `TOTP_ENCRYPTION_KEY_V1` | Ключ `AES-256-GCM` (32 байти, AAD = `userId`) для шифрування секретів TOTP двофакторної автентифікації. | `openssl rand -base64 32` |
| `RECOVERY_CODE_PEPPER` | Таємний pepper (`HMAC-SHA256`, мін. 32 символи) для одноразових кодів відновлення входу. | `openssl rand -base64 48` |
| `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1` | Шифрує збережені Google OAuth гранти та refresh-токени. | `openssl rand -base64 32` |
| `OWNER_VAULT_ENCRYPTION_KEY_V1` | Шифрує секрети в API-сховищі власника (`admin` / `api`). | `openssl rand -base64 32` |
| `MAIL_TOKEN_ENCRYPTION_KEY_V1` | Шифрує OAuth-токени поштових провайдерів (рівно 32 байти). | `openssl rand -base64 32` |
| `MAIL_APP_WACHTWOORD_SLEUTEL_V1` | Шифрує паролі додатків IMAP/SMTP-скриньок (iCloud, Ukr.net, Yahoo, I.ua), прив'язані до `user + row + ruimte`. Без ключа під'єднання відхиляється (жодного fallback). | `openssl rand -base64 32` |
| `AGENDA_ABONNEMENT_SLEUTEL_V1` | Шифрує паролі додатків CalDAV-календарів (iCloud, Fastmail, Nextcloud). | `openssl rand -base64 32` |
| `SLEUTELKLUIS_SLEUTEL_V1` | Серверний pepper Сховища ключів (міграція `0092`) для обгортання ключа даних (DEK) користувача при створенні MCP-конвертів ШІ-агентів через `HKDF(agent_token + pepper)`. **Не видаляти і не ротувати без перевипуску конвертів.** | `openssl rand -base64 32` |
| `GITHUB_KOPPELING_SLEUTEL_V1` | Шифрує збережені токени інтеграції GitHub (OAuth, refresh, installation token). За відсутності використовує `TOTP_ENCRYPTION_KEY_V1`. | `openssl rand -base64 32` |
| `HUIS_ADAPTER_SLEUTEL_V1` | Шифрує токени Home Assistant у Huis vNext (міграція `0128`, `app.huis_integraties.geheim`). За відсутності використовує `TOTP_ENCRYPTION_KEY_V1`. | `openssl rand -base64 32` |

---

## 2. Додаткові ключі, ролі БД та перемикачі безпеки

| Змінна | Категорія | Типово | Призначення |
|---|---|---|---|
| `AGENT_SLEUTEL_V1` | Криптографія | fallback на TOTP | Окремий ключ для токенів ШІ-агентів (`backend/connectors-crypto.ts`). |
| `AI_ARCHIEF_SLEUTEL_V1` | Криптографія | fallback на TOTP | Шифрування архіву браузерної діагностики (`backend/browser-diag-archief.ts`). |
| `AFZENDER_BEELD_PEPPER` | Криптографія | fallback на `AUDIT_IP_PEPPER` | HMAC-pepper для хешування адрес відправників у таблиці аватарів `app.afzender_beeld` (міграція `0093`). |
| `SCIM_BEARER_TOKEN` | Провижинінг | порожньо (вимк.) | Токен для вхідного SCIM-провижинінгу користувачів. |
| `DATABASE_URL_MIGRATIE` | Ролі БД (`migratie.env`) | — | Роль `mijnruimte_migrator` (власник схеми `app`), завантажується лише під час міграцій. |
| `DATABASE_URL_APP` | Ролі БД (`geheimen.env`) | — | Роль `mijnruimte_app` (`NOBYPASSRLS`, лише DML під політиками RLS для запитів користувачів). |
| `DATABASE_URL_SYSTEM` | Ролі БД (`geheimen.env`) | — | Роль `mijnruimte_system` (`BYPASSRLS` для сесій, входу, cron, резервних копій, але без права зміни `app.audit`). |
| `AUTH_POORT_AFDWINGEN` | Безпека | `0` (лог) | `1` = центральний шлюз `auth-poort.ts` блокує (`401`) будь-яку анонімну 2xx-відповідь поза `PUBLIEKE_ROUTES`. |
| `STAP_OP_UIT` | Безпека | `0` | Аварійне вимкнення вимоги Step-Up (`STEP_UP_REQUIRED`) для чутливих дій. |
| `STAP_OP_GOOGLE_ZONDER_AUTH_TIME` | Безпека | `0` | `1` = дозволити Google Step-Up без `auth_time` у токені, якщо OAuth-потік завершено менш ніж за 5 хв. |
| `ACCOUNT_DEFINITIEF_WISSEN` | Приватність | `0` (dry-run) | `1` = фонова задача `opruimen` остаточно видаляє облікові записи після завершення 30-денного періоду відновлення. |

---

## 3. Зовнішні інтеграції (Google, Microsoft Graph, Gmail Pub/Sub)

| Змінна | Призначення |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth 2.0 клієнт Google (Redirect URI: `https://id.tarasevych.com/`). Може також задаватися через Сховище власника у `Admin → Інтеграції → Майстер під'єднань` без перезапуску сервера. |
| `GOOGLE_SUITE_CLIENT_ID` / `GOOGLE_SUITE_CLIENT_SECRET` | Аліас клієнта для Google Suite (якщо заданий, має збігатися з `GOOGLE_OAUTH_CLIENT_ID`). |
| `GOOGLE_GMAIL_PUBSUB_TOPIC` / `_AUDIENCE` / `_SERVICE_ACCOUNT_EMAIL` | Параметри миттєвих push-сповіщень Gmail через Google Cloud Pub/Sub (`deploy/MAIL-PUSH-PUBSUB.md`). |
| `MICROSOFT_GRAPH_CLIENT_ID` / `_CLIENT_SECRET` / `_TENANT_ID` | Дані реєстрації додатка в Microsoft Entra ID для пошти Outlook (`mijn-ruimte-installeer oauth-client microsoft`). |
| `MICROSOFT_GRAPH_WEBHOOK_URL` / `_WEBHOOK_CLIENT_STATE` | URL та спільний секрет для webhook-сповіщень про нові листи Microsoft Graph. |

---

## 4. Параметри часу виконання (Runtime), Пошуку `/zoek`, Координації та Приватності (`PRIVACY-001`)

| Змінна | Стандартне значення | Призначення |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `8080` | Локальна адреса і порт HTTP-сервера (трафік надходить виключно через `cloudflared`). |
| `DIST_DIR` / `MIGRATIONS_DIR` | `<release>/dist` / `<release>/migrations` | Шляхи до зібраного фронтенду та SQL-міграцій активного випуску. |
| `UPLOADS_DIR` | `/srv/data/uploads` | Єдина директорія, відкрита на запис для основного сервісу (`ReadWritePaths`). |
| `DASHBOARD_DIR` | `/srv/mijn-ruimte/dashboard` | Директорія статичного панелі керування для `dashboard.tarasevych.com`. |
| `MERK_EIGEN_MAP` | `/srv/mijn-ruimte/merk-eigen` | Директорія власних офіційних логотипів брендів (`.svg`/`.png` ≤ 200 КБ). |
| `MAX_BODY_BYTES` / `PG_POOL_MAX` | `12582912` (12 MiB) / `10` | Ліміт розміру HTTP-тіла запиту та розмір пулу з'єднань PostgreSQL. |
| `API_RATE_LIMIT_PER_MIN` | `600` | Загальний ліміт запитів до `/api/*` з одного IP на хвилину (для входу/MFA діють жорсткіші ліміти: 10–20/хв). |
| `ZOEK_TEKST_MAX_BYTES` / `ZOEK_TEKST_TIMEOUT_MS` / `ZOEK_TEKST_WERKER_MB` | `26214400` (25 MiB) / `60000` / `512` | Обмеження воркера `zoek-werker.mjs` при вилученні тексту з PDF, Office та архівів. |
| `ZOEK_OCR_ENGINE` / `ZOEK_OCR_TALEN` / `ZOEK_OCR_TALEN_MAP` | `auto` / `ukr+nld+eng+rus` / `/srv/mijn-ruimte/ocr/tessdata` | Налаштування OCR-рушія (`tesseract-cli` / `tesseract-js` / `platform-ai`) та мовних пакетів. |
| `ZOEK_INDEX_RUN_MS` / `ZOEK_INDEX_ITEMS` / `ZOEK_INDEX_SCAN_RIJEN` | `120000` / `60` / `400` | Бюджет часу та кількість елементів за один запуск індексатора `zoek-index` (кожні 5 хв). |
| `CHAT_MODEL` | `claude-sonnet-5-5` | Типова модель чату на `ai.*` (API-ключ кожен користувач зберігає у власному сховищі). |
| `EXTERNE_MCP_HOSTS` / `MCP_RECHTEN_PAD` | порожньо / `/etc/mijn-ruimte/mcp-rechten.json` | Білий список хостів зовнішніх MCP-серверів (також керується власником через Passkey на сайті). |
| `ORCH_WORTEL` / `ORCH_INBOX` | `/srv/mijn-ruimte/orch-repo` / `/srv/mijn-ruimte/orch-inbox` | Серверна робоча копія репозиторію координації `ORCH-001` та директорія прийому пакетів від агентів. |
| `BESLUIT_INBOX` / `BESLUIT_APP_ROOT` | `/srv/mijn-ruimte/besluit-inbox` / `/srv/mijn-ruimte` | Шляхи обміну підписаними Passkey-рішеннями власника між вебдодатком та root-службою `mijn-ruimte-besluit`. |
| `ROOK_CHROMIUM` | автопошук `/srv/mijn-ruimte/browser/chrome-headless-shell` | Шлях до headless-браузера для автоматичної перевірки відмальовування сторінок після випуску. |
| `MR_EIGENAAR_NAAM` / `MR_CONTACT_EMAIL` | `власник / eigenaar` / `op aanvraag` | Ім'я контролера даних та контактний e-mail для публічних сторінок `/privacy` і `/terms` (`PRIVACY-001` / `B-010`). |
| `MR_BEHEERSUBNET` / `MR_VM_SSH` | `10.0.0.0/8` / `mijn-ruimte-vm` | Підмережа управління для захисту шлюзів Huis vNext та SSH-ціль для адміністративних скриптів (`B-010`). |

---

## Пов'язана документація (🇺🇦 UK ↔ 🇳🇱 NL)

- **Повна специфікація `ENV-VARS`:** [🇺🇦 `ENV-VARS.uk.md`](../../ENV-VARS.uk.md) ↔ [🇳🇱 `ENV-VARS.nl.md`](../../ENV-VARS.nl.md) ([оригінал `ENV-VARS.md`](../../ENV-VARS.md))
- **Реєстр секретів та ключів шифрування:** [🇺🇦 `deploy/GEHEIMEN-REGISTER.uk.md`](../../deploy/GEHEIMEN-REGISTER.uk.md) ↔ [🇳🇱 `deploy/GEHEIMEN-REGISTER.nl.md`](../../deploy/GEHEIMEN-REGISTER.nl.md) · [🇺🇦 `deploy/KLYUCHI-I-SHYFRUVANNYA.uk.md`](../../deploy/KLYUCHI-I-SHYFRUVANNYA.uk.md) ↔ [🇳🇱 `deploy/KLYUCHI-I-SHYFRUVANNYA.nl.md`](../../deploy/KLYUCHI-I-SHYFRUVANNYA.nl.md)
