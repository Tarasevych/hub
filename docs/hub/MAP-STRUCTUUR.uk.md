> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./MAP-STRUCTUUR.md)) · [🇳🇱 **Nederlandse versie**](./MAP-STRUCTUUR.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей](../INDEX.md)
> 🧭 **Розділи Хабу (`docs/hub/`):** [1. Архітектура](./ARCHITECTUUR.uk.md) · [2. Історія](./GESCHIEDENIS.uk.md) · [3. Гілки, PR та Випуски](./TAKKEN-EN-PRS.uk.md) · [4. Структура коду](./MAP-STRUCTUUR.uk.md) · [5. Змінні середовища](./OMGEVINGSVARIABELEN.uk.md) · [6. Оркестрація та Розгортання](./ORCHESTRATIE-EN-UITROL.uk.md)

# Структура репозиторію та Карта коду (`Tarasevych/hub`)

Цей документ описує повну карту директорій репозиторію `Tarasevych/hub`, призначення кожного рівня архітектури (`server/`, `backend/`, `src/`, `shared/`, `orchestratie/`, `migrations/`, `deploy/`, `scripts/`, `tests/`, `extension/`), а також обов'язкове правило нідерландських назв файлів (`kaart-controle`).

---

## 1. Загальне дерево репозиторію

```text
Tarasevych/hub
├── AGENTS.md                        # Канонічні правила для всіх ШІ-агентів та розробників (ORCH-001)
├── ENV-VARS.md                      # Повний опис змінних середовища та ключів шифрування (/etc/mijn-ruimte/geheimen.env)
├── SECURITY-NOTES.md                # Аудит безпеки, виправлення фаз A/B/1/2/3/Audit/Zoek/Werkblad та відкриті питання
├── PORTEERPLAN.md                   # Архітектурний план міграції з AppDeploy на self-hosted Node.js + PostgreSQL
├── cron.json                        # Визначення 6 фонових завдань (mail, google-sync, opruimen, mail-queue, diagnostiek, zoek-index)
├── package.json                     # Залежності (Node >= 24) та скрипти складання, перевірок, міграцій і тестів
│
├── orchestratie/                    # Координація ШІ-агентів (ORCH-001) та трасування випусків (TRACE-001)
│   ├── beleid.json                  # Машинна політика координації, списки агентів, каналів, обов'язкових перевірок
│   ├── BESLUITEN.md                 # Append-only реєстр архітектурних і організаційних рішень (B-001 .. B-011)
│   ├── regels.lock.json             # Криптографічний відбиток файлів правил та підпис власника (SSH / Passkey)
│   ├── CONTEXT-COMPACT.md           # Автогенерований компактний контекст (≤ 12 КБ) для агентів без прямого доступу до git
│   ├── wachtrij.json                # Послідовна черга інтеграції задач (FIFO за базою)
│   ├── eigenaar-ondertekenaars      # Публічні ключі власника (ed25519) для перевірки підписів правил та випусків
│   ├── taken/                       # Декларації активних і виконаних задач (<TASK-ID>.json)
│   ├── ontwikkelarchieven/          # Комічені журнали розробки TRACE-001 (<TASK-ID>.json)
│   └── sjablonen/                   # Шаблони передачі результатів (ORCH-OVERDRACHT.json)
│
├── server/                          # HTTP-сервер, маршрутизатор та платформне ядро (@platform/server)
│   ├── start.ts                     # Точка входу сервера (127.0.0.1:8080, Host-перевірка, CSP, HSTS, CSRF, Rate Limits)
│   ├── migrate.ts                   # Виконавець SQL-міграцій та перевірка версії PostgreSQL
│   ├── cron.ts                      # CLI-раннер фонових завдань із pg_advisory_lock
│   └── platform/                    # Сумісний платформний шар поверх PostgreSQL та ФС
│       ├── db.ts                    # Робота з app.records (JSONB), атомарні takeOne / takeArrayValue / zetAlsHoger, RLS-контекст
│       ├── pg.ts                    # Пули з'єднань для 3 ролей БД (migrator, app, system)
│       ├── opslag.ts                # Локальне файлове сховище (/srv/data/uploads) із захистом шляхів та власника
│       ├── geheimen.ts              # Доступ до секретів середовище за білим списком
│       ├── router.ts                # HTTP-маршрутизатор із перевіркою канонічності шляхів (PATH_NOT_CANONICAL)
│       ├── auth-poort.ts            # Центральний шлюз авторизації та облік публічних маршрутів (PUBLIEKE_ROUTES)
│       ├── beveiliging.ts           # Rate limiting, блокування входів (lockouts), криптографічні хелпери
│       ├── rls-audit.ts             # Дзеркало перевірок Row-Level Security та логування порушень у app.rls_audit
│       └── audit.ts                 # Запис у захищений хеш-ланцюгом журнал app.audit
│
├── backend/                         # Серверна бізнес-логіка всіх 10 активних сервісів
│   ├── index.ts                     # Основний реєстр маршрутів API, сесій, OAuth-транзакцій та робочих просторів
│   ├── deployment-identity.ts       # Єдине джерело доменів (*.tarasevych.com) та параметрів сесійних кук
│   ├── toegangslaag.ts              # Паролі, TOTP (AES-256-GCM), коди відновлення (HMAC), телефони, політики входу
│   ├── toegangssleutels.ts          # Користувацькі WebAuthn Passkeys
│   ├── stap-op.ts                   # Механізм Step-Up повторного підтвердження для чутливих дій
│   ├── eigenaar-besluit.ts          # Passkey-рішення власника для root-дій (повернення стану, правила, зовнішні MCP-хости)
│   ├── uitrol-goedkeuring.ts        # Перевірка, передконтроль (voorcontrole) та схвалення пакетів оновлень
│   ├── uitrol-github.ts             # Перевірка походження коміту, гілки та SHA-256 GitHub Release-архіву (TRACE-001)
│   ├── orch-routes.ts / orch-opslag.ts / orch-hulpmiddelen.ts # Веб/HTTP/MCP-інтерфейс системи координації ORCH-001
│   ├── connector-v2.ts / mcp-klant/ # Шлюз ШІ-конекторів v2 (/claude, /gpt, /grok...) та клієнт зовнішніх MCP
│   ├── google-suite-*.ts            # OAuth, Gmail, Google Drive, Google Calendar, Google Contacts (People API)
│   ├── mail-microsoft.ts / mail-imap.ts # Інтеграція Outlook (Microsoft Graph) та універсального IMAP/SMTP
│   ├── globaal-zoek.ts / zoek-index.ts / zoek/ # Глобальний пошук /zoek, індексатор, воркер текстів та OCR
│   ├── cloud-platform.ts / cloud-google-drive.ts # Хмарне сховище Cloud vNext
│   ├── werkblad-v3.ts               # Серверне ядро робочого полотна Werkblad v3
│   └── juridisch.ts                 # Статичні двомовні юридичні сторінки GET /privacy та GET /terms
│
├── src/                             # Фронтенд (React 19 + TypeScript + Tailwind CSS)
│   ├── main.tsx / App.tsx           # Точка входу SPA
│   ├── VerenigdDienstApp.tsx        # Об'єднана оболонка сервісів, меню v2, перемикач просторів
│   ├── GoogleMailWerkruimte.tsx     # Головний робочий простір пошти
│   ├── mail/                        # Модулі Adaptive Mail Canvas (LeesVenster, ContextPaneel, WatNodigBlok, MailOrbitIntro, MailKoppelVenster)
│   ├── Mail*Bewerker.tsx / Mail*Voorbeeld.tsx # 147 спеціалізованих переглядачів і редакторів форматів вкладень
│   ├── plaatsing/                   # Система рухомих кнопок «Зони й гнізда» (Plek.tsx, plaats-slepen.ts)
│   ├── agenten/                     # Інтерфейс керування ШІ-агентами, дозволами та вкладка «Координація» (TabOrch.tsx)
│   ├── afstemming-vnext/            # Інтерфейс узгодження задач, конфліктів і випусків
│   ├── merk/                        # Система офіційних та власних логотипів брендів (CC0/MIT + санітизований SVG)
│   └── zoek/                        # Інтерфейс глобального пошуку /zoek та управління індексацією
│
├── shared/                          # Спільні типи, моделі, правила та константи (доступні і на сервері, і в браузері)
│   ├── orch-model.ts                # Модель даних та коди помилок координації агентів (ORCH_CODES)
│   ├── ontwikkelarchief.ts          # Схема та валідатор журналу розробки TRACE-001 (ONTWIKKELARCHIEF.json)
│   ├── uitrol-manifest.ts / uitrol-codes.ts # Маніфест пакета розгортання та коди відмов інсталятора
│   ├── plaatsing.ts                 # Математична модель зон і гнізд рухомих кнопок
│   ├── mail-acties.ts               # Єдиний реєстр 39 дій над листами (тексти uk/nl, клавіші, кольорові тони)
│   ├── ai-bronnen.ts                # Верифікація цитат і дат ШІ за оригінальним текстом листа
│   ├── sleutelkluis.ts              # Типи та константи Сховища ключів (Sleutelkluis)
│   └── geheim-patronen.ts           # Регулярні вирази для автоматичного приховування секретів у пошуковому індексі
│
├── migrations/                      # 139 SQL-міграцій PostgreSQL (0001_basis.sql .. 0198_aanmeldmethoden_vnext.sql + rechten.sql)
├── deploy/                          # Скрипти встановлення (installeer-app.sh), systemd-юніти, таймери, резервні копії, runbooks
├── docs/                            # Архітектурна документація, специфікації та карта файлів (docs/kaart/KAART-BESTANDEN.md)
├── scripts/                         # CLI-утиліти складання, перевірок (kaart-controle, plaatsing-controle, l002-audit) та orch.mjs
├── tests/                           # Модульні (tests/eenheid/), візуальні (tests/visueel/) та E2E (tests/e2e/) тести
└── extension/                       # Браузерне розширення Mijn Ruimte (Chrome / Edge)
```

---

## 2. Детальний опис ключових модулів

### 2.1. Платформне ядро (`server/`)
Платформне ядро відповідає за прийом HTTP-трафіку, безпеку на рівні транспорту, роботу з PostgreSQL (`app.records` та типізовані таблиці) і файловою системою:
- [`server/start.ts`](../../server/start.ts) — запускає HTTP-сервер на `127.0.0.1:8080`, перевіряє `Host` за білим списком 11 піддоменів `*.tarasevych.com`, встановлює заголовки безпеки (`CSP`, `HSTS`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), застосовує CSRF-захист (`Sec-Fetch-Site` + `Origin`) та ініціалізує контекст сесії.
- [`server/platform/db.ts`](../../server/platform/db.ts) — надає сумісний API поверх `app.records` з атомарними операціями (`takeOne`, `takeArrayValue`, `zetAlsHoger`) та автоматичним встановленням контексту PostgreSQL RLS (`SET LOCAL app.current_user_id`, `app.current_session_role`, `app.current_workspace`).
- [`server/platform/auth-poort.ts`](../../server/platform/auth-poort.ts) — центральний шлюз авторизації: перевіряє кожен запит до API за списком `PUBLIEKE_ROUTES` і блокує будь-які несанкціоновані анонімні відповіді.
- [`server/platform/audit.ts`](../../server/platform/audit.ts) — записує події безпеки в таблицю `app.audit` із криптографічним хеш-ланцюгом (`prev_hash` → `entry_hash`) та HMAC-хешуванням IP (`AUDIT_IP_PEPPER`).

### 2.2. Серверна бізнес-логіка (`backend/`)
Містить реалізацію всіх 10 активних сервісів платформи та системних підсистем:
- **Автентифікація та безпека облікового запису:** [`backend/toegangslaag.ts`](../../backend/toegangslaag.ts), [`backend/toegangssleutels.ts`](../../backend/toegangssleutels.ts) (WebAuthn Passkeys), [`backend/stap-op.ts`](../../backend/stap-op.ts) (Step-Up верифікація), [`backend/eigenaar-besluit.ts`](../../backend/eigenaar-besluit.ts) (рішення власника з Passkey).
- **Пошта та Календар:** [`backend/google-suite-mail-browser.ts`](../../backend/google-suite-mail-browser.ts), [`backend/mail-microsoft.ts`](../../backend/mail-microsoft.ts), [`backend/mail-imap.ts`](../../backend/mail-imap.ts), [`backend/google-suite-agenda-sync.ts`](../../backend/google-suite-agenda-sync.ts).
- **Хмара, Пошук та Робоче полотно:** [`backend/cloud-platform.ts`](../../backend/cloud-platform.ts), [`backend/globaal-zoek.ts`](../../backend/globaal-zoek.ts), [`backend/zoek-index.ts`](../../backend/zoek-index.ts), [`backend/werkblad-v3.ts`](../../backend/werkblad-v3.ts).
- **ШІ-конектори, Оркестрація та Розгортання:** [`backend/connector-v2.ts`](../../backend/connector-v2.ts), [`backend/orch-routes.ts`](../../backend/orch-routes.ts), [`backend/uitrol-goedkeuring.ts`](../../backend/uitrol-goedkeuring.ts), [`backend/uitrol-github.ts`](../../backend/uitrol-github.ts).

### 2.3. Фронтенд (`src/`)
Побудований на **React 19 + TypeScript + Tailwind CSS (Vite)**:
- [`src/VerenigdDienstApp.tsx`](../../src/VerenigdDienstApp.tsx) — головна оболонка сервісів, меню v2 (док праворуч/угорі/унизу), глобальний пошуковий бар та перемикач просторів (`Особистий` / `Робочий` / `Технічний`).
- [`src/GoogleMailWerkruimte.tsx`](../../src/GoogleMailWerkruimte.tsx) та `src/mail/*` — поштовий клієнт із Adaptive Mail Canvas (`LeesVenster.tsx`, `ContextPaneel.tsx`, `WatNodigBlok.tsx`, `MailOrbitIntro.tsx`, `MailKoppelVenster.tsx`) та 147 спеціалізованими переглядачами/редакторами вкладень (`Mail*Voorbeeld.tsx`, `Mail*Bewerker.tsx`).
- `src/agenten/*` та `src/afstemming-vnext/*` — інтерфейс управління ШІ-агентами, MCP-під'єднаннями, Сховищем секретів та вкладкою «Координація» (`TabOrch.tsx`).

### 2.4. Спільні контракти (`shared/`)
Містить ізоморфний TypeScript-код без серверних або браузерних залежностей, що гарантує ідентичну валідацію на клієнті, сервері та в CLI-скриптах (`orch-model.ts`, `ontwikkelarchief.ts`, `uitrol-manifest.ts`, `plaatsing.ts`, `mail-acties.ts`, `ai-bronnen.ts`, `sleutelkluis.ts`, `geheim-patronen.ts`).

---

## 3. Правило нідерландських назв файлів (`kaart-controle`)

24 жовтня 2026 року в межах нідерландської канонізації коду **531 файл** у `src/`, `backend/`, `shared/`, `server/`, `tests/` та `scripts/` було перейменовано нідерландською мовою за єдиним словником доменних термінів.

- **Повна таблиця відповідності старих (EN) та нових (NL) імен файлів:** [`docs/kaart/KAART-BESTANDEN.md`](../kaart/KAART-BESTANDEN.md) ([🇺🇦 UK](../kaart/KAART-BESTANDEN.uk.md) ↔ [🇳🇱 NL](../kaart/KAART-BESTANDEN.nl.md)).
- **Автоматичний контроль під час складання:** скрипт [`scripts/kaart-controle.mjs`](../../scripts/kaart-controle.mjs) запускається першим кроком у `npm run build` і перевіряє, щоб жодне старе англомовне ім'я файлу не повернулося в репозиторій під час злиття гілок.

---

## Пов'язана документація (🇺🇦 UK ↔ 🇳🇱 NL)

- **Карта файлів (EN → NL):** [🇺🇦 `docs/kaart/KAART-BESTANDEN.uk.md`](../kaart/KAART-BESTANDEN.uk.md) ↔ [🇳🇱 `docs/kaart/KAART-BESTANDEN.nl.md`](../kaart/KAART-BESTANDEN.nl.md)
- **Архітектура платформи:** [🇺🇦 `docs/hub/ARCHITECTUUR.uk.md`](./ARCHITECTUUR.uk.md) ↔ [🇳🇱 `docs/hub/ARCHITECTUUR.nl.md`](./ARCHITECTUUR.nl.md)
- **Оркестрація та розгортання:** [🇺🇦 `docs/hub/ORCHESTRATIE-EN-UITROL.uk.md`](./ORCHESTRATIE-EN-UITROL.uk.md) ↔ [🇳🇱 `docs/hub/ORCHESTRATIE-EN-UITROL.nl.md`](./ORCHESTRATIE-EN-UITROL.nl.md)
