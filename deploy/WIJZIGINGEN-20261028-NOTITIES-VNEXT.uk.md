> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./WIJZIGINGEN-20261028-NOTITIES-VNEXT.md)) · [🇳🇱 **Nederlandse versie**](./WIJZIGINGEN-20261028-NOTITIES-VNEXT.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей](../docs/INDEX.md)

## Notities vNext — hub.tarasevych.com/notities (28.10.2026)

Реалізація пакета `Mijn_Ruimte_Notes_vNext` (ТЗ від 28.10.2026) у наявному проєкті. База: архів **`mijn-ruimte-20261028-224316`** (`herstel technische modules`, tak `fix-technische-modules`, commit 9d157545528b) — гілку `notities-vnext` перебазовано на нього після того, як власник випустив проміжне оновлення. **Production не змінено й не розгорнуто.**

> **Перебазовано 29.10.2026:** база тепер **`mijn-ruimte-20261028-233308`** (сторінка «Відкат», tak fix-technische-modules, commit f7eafb075585) — проміжний випуск іншого агента. Перетину файлів немає (той випуск міняв відкат/огляд/здоров'я, цей — notities/huis); перебазування чисте, без жодної зміни у файлах цього пакета. Повторно на новій базі: huis-vnext 53/53, notities-vnext 62/62, terugdraai-controle 25/25, e2e huis 49/49, e2e notities 39/39, `npm run build` PASS, tsc 3/20 (базові).


Адаптація до проміжного оновлення (28.10, 22:43): власник додав `migrations/0126_tech_assets_ruimtes_v2.sql` і змінив `backend/tech-bundels.ts` та `tests/eenheid/tech-bundels-ruimtes-v2.test.ts`. Жоден із моїх файлів з ними не перетинається; єдиний конфлікт — **номер міграції 0126**. Моя міграція перейменована на **`0127_notities_vnext.sql`** (усі посилання в коді, тестах, документах і скрипті відкату оновлено). Міграція власника 0126 лишається незмінною й виконується першою. Хто вже застосував мій попередній пакет `20261028-222128` (не було — він не встановлювався): там таблиці створювала `0126_notities_vnext`; у `app.schema_migrations` ця версія вже не впізнається, але 0127 ідемпотентна (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) і просто пройде поверх без втрат.

### Що зроблено (P0 за ТЗ)

| Модуль | Стан | Де |
|---|---|---|
| Окреме сховище нотаток (title 300, Markdown до 200 000 знаків, 24 теги в т.ч. українські, теки, закріплення, архів, кошик 30 днів, версія, ревізії) | **implemented** | `migrations/0127_notities_vnext.sql`, `backend/notities-vnext.ts` |
| Перенесення старих hub-нотаток (`mcp_console_items`, kind=note, тег hub) без втрат — **той самий id**, простір, дати, sha256 у `herkomst` | **implemented** | 0127 (ON CONFLICT DO NOTHING, без UPDATE/DELETE старих рядків) |
| Дзеркало в старий бордер (ті самі id; title ≤ 160, body ≤ 4000, ≤ 8 тегів за старим правилом) — тому `manage_hub_notes`, `/api/mcp/board*`, стара сторінка та відкат на старий реліз працюють без змін | **implemented** | `backend/notities-vnext.ts` (spiegelSchrijf/spiegelWis), гачки в `backend/mcp-console.ts` |
| API `/api/notities/*` (lijst з пагінацією/фільтрами/пошуком, een, nieuw, wijzig з 409 `VERSIE_VEROUDERD`, actie, revisies, revisie-herstel, mappen, import/voorbeeld, import/uitvoeren, export) через **ту саму поворітню бордера** (`bordLade`: простір prive/technisch з вкладки, RLS через `alsGebruiker`) | **implemented** | `backend/notities-vnext.ts`, реєстрація в `backend/index.ts` |
| React UI за прапорцем `notities-vnext` (вимкнено): рейл (усі/сьогодні/закріплені/чеклісти/архів/кошик/інтеграції, теки, теги), картки/список, чипи, пошук, колонка «Сьогодні» (мінікалендар, чеклісти), редактор Markdown (панель справа / весь екран на телефоні, тулбар, перегляд, чеклісти, тип/колір/тека/теги/закріплення, чернетка в браузері, 409-конфлікт із порівнянням, історія з поверненням), імпорт з попереднім переглядом і дублікатами, експорт JSON/Markdown, нижня панель + «+» на телефоні | **implemented** | `src/notities/*`, перемикач у `src/HubNotities.tsx` |
| uk/nl, клавіатура (`/`, Ctrl+N, Ctrl+S, Esc, Tab-пастка), aria, тик-цілі ≥ 44 px, safe-area, світла/темна тема через токени | **implemented** | `src/notities/notities-vnext.css` |
| Безпечний рендер Markdown (усе екранується, лише https-посилання, DOMPurify другим шаром) | **implemented** | `shared/notities-vnext-model.ts` → `markdownNaarHtml`, `src/notities/NotitieKaart.tsx` |
| Екран «Інтеграції» з чесними станами (`beschikbaar` лише файли; `alleen-invoer`; `beperkt`; `gepland`) — жодної кнопки «Підключити» без конектора | **implemented** | `shared/notities-vnext-model.ts` → `NOTITIE_BRONNEN`, `src/notities/NotitiesBronnen.tsx` |

Матриця інтеграцій: Markdown/TXT/JSON — **implemented**; Obsidian, Apple Нотатки, HONOR/HUAWEI, Samsung — **import-only** (через ті самі файли); Google Зберігати — **restricted** (Workspace); Google Calendar link, OneNote Graph, Evernote (MCP/ENEX), Notion, ColorNote — **planned** (конекторів немає, кнопок немає). Вкладення, бек-лінки, нагадування, OCR/голос, ШІ, спільне редагування, PWA offline — **не реалізовано** (P1/P2 за ТЗ).

### Поведінка старої дороги після 0127

* `POST /api/mcp/board` kind=note з тегом hub → створює нотатку в `app.notities` + дзеркало; відповідь у старій формі.
* `PATCH … kind=edit` → оновлює vNext (ревізія зберігається). Якщо `body` прийшов **незмінним обрізаним** (≤ 4000) — повна довга інхоуд не обрізається.
* `PATCH … kind=delete` → **кошик** (30 днів, можна відновити), а не миттєве видалення; дзеркальний рядок зникає з бордера.
* Теги, що не вкладаються в старе правило (`[a-z0-9:_-]{1,32}`), лишаються тільки у vNext; у дзеркалі додатково з'являється тег `archief` для архівованих.
* Якщо таблиці 0127 немає — бордер поводиться як раніше (виявлення за кодом помилки `42P01`).

### Перевірки (реальні цифри, це середовище)

Середовище: Node v22.22.0 (репозиторій просить ≥ 24; `npm ci` з EBADENGINE), PostgreSQL 16 локально (`127.0.0.1:55432`), Chromium (Playwright 1194), самопідписаний сертифікат для `*.tarasevych.com` (`ignoreHTTPSErrors` лише в e2e).

| Набір | Результат |
|---|---|
| `tests/eenheid/notities-vnext-20261028.test.ts` (міграція 0 втрат ×2 ідемпотентно, дзеркало, стара дорога, простори/RLS, 409, ревізії, архів/теки/пошук/сьогодні/пагінація, імпорт/експорт/дублікати/XSS, модель, каталог) | **62/62 PASS** |
| `tests/e2e/notities-vnext.e2e.ts` (справжній сервер + Postgres + nep-Google; прапорець вимк/увімк, створення Ctrl+N/Ctrl+S, перегляд з `<script>` як текст, конфлікт версій, `/`-пошук, архів, кошик/відновлення, імпорт з попереднім переглядом, інтеграції, 320/390/768/1024/1440 × світла/темна без горизонтальної прокрутки, мобільний редактор на весь екран, тик-цілі 44 px, 0 помилок консолі/сторінки/4xx/зовнішніх запитів) | **39/39 PASS** |
| `ruimte-bord-github-20261020`, `hub-agenda-notities-20261019`, `dev-rechten-media-github-20261021` (регресія бордера/старої сторінки) | 45/45, 64/64, 67/67 PASS |
| `npm run build` (kaart-controle, plaatsing-controle, zoek-ui-catalogus, l002-audit, mail-slimme-inbox-audit, kleur-contrast-controle, vite, tech-bundels, extensie, server) | **PASS** (exit 0) |
| `tsc -p tsconfig.server.json`, `tsc -p tsconfig.json` | 20 / 3 помилок — **ті самі, що в базовому архіві** (mail-afzenders, index.ts gmail*, cloud/React unused); 0 у нових файлах |
| Повний `eenheidstests.mjs` без фільтра | **не доходить до кінця в цьому середовищі**: `ai-beleid` (потрібен root-відбиток OPA/beleid), `ai-toegang-beheer` (`CANONICAL_SERVICE_RUNTIME_MISSING`) — передумови середовища, не код нотаток. Те саме було до змін. |
| Регресія суміжних наборів: `mcp-console-c2` 19/19, `mcp-spiegel` 11/11, `mcp-acties` 12/12, `site-hulpmiddelen` 27/27, `hulpmiddelen-tweetalig` 25/25, `plaatsing-20261025` 68/68, `zoek-ui-20261022` 61/61, `ai-agent-bord` 20/20, `connector-v2` 49/49, `mcp-connector` 74/74 | PASS |
| `ontwerp-fundament` 31/34, `vlaggen` 53/54, `tech-bundels` 33/34, `account-wissen` 19/20 | **ті самі 4 збої на базовому архіві без моїх змін** (ruimtes.css/werkblad CSS, app-rol vlaggen, TechLaag, cloud_provider_policy_audit_m6) — жоден не стосується файлів нотаток |
| Відкат (`deploy/notities-vnext-terugdraaien.sql`) | SOURCE-ONLY: не проганявся на живій БД; логіка: кошик → бордер, DROP трьох таблиць, зняття прапорця й запису 0127 |

НЕ TESTED: зовнішні інтеграції (їх немає в коді), RLS із ролями `mijnruimte_app/system` (у цьому середовищі одна суперроль; policies ідентичні 0019), screen reader, zoom 400 %, навантаження.

### План відкату

1. Звичайний: `mijn-ruimte-installeer` → попередній реліз. Таблиці 0127 лишаються; старий код читає дзеркало в `app.mcp_console_items` (усі hub-нотатки, той самий id). Втрати: нічого видимого старому коду; довгі тексти в старому UI показуються обрізаними до 4000 (повний текст лишається в `app.notities`).
2. Лише вимкнути нову сторінку: прапорець `notities-vnext` → UIT (Перемикачі функцій). Дані спільні.
3. Прибрати таблиці: `deploy/notities-vnext-terugdraaien.sql` після `pg_dump` трьох таблиць (інструкція у файлі).

### Змінені/нові файли

Нові: `migrations/0127_notities_vnext.sql`, `shared/notities-vnext-model.ts`, `backend/notities-vnext.ts`, `src/notities/{NotitiesPagina,NotitieKaart,NotitieBewerker,NotitiesImport,NotitiesBronnen,Laag}.tsx`, `src/notities/{notities-client,notities-vlag,tekst}.ts`, `src/notities/notities-vnext.css`, `tests/eenheid/notities-vnext-20261028.test.ts`, `tests/e2e/notities-vnext.e2e.ts`, `deploy/notities-vnext-terugdraaien.sql`, цей файл.
Змінені: `backend/mcp-console.ts` (гачки для hub-нотаток), `backend/index.ts` (реєстрація маршрутів), `src/HubNotities.tsx` (перемикач за прапорцем; стара сторінка без змін), `shared/vlaggen.ts` (пояснення прапорця), `migrations/rechten.sql` (GRANT для `mijnruimte_app`), `scripts/plaatsing-vaste-elementen.json` (дозвіл для `.vn-laag` і `.vn-onderbalk`).

### Знахідки під час роботи (виправлено)

* Ctrl+K зайнятий глобальним пошуком chrome — на сторінці нотаток пошук фокусується клавішею `/`.
* `position:fixed` усередині `.canonical-workspace` (z-index 1) опиняється під верхньою панеллю (z-index 220) — шари рендеряться порталом у `<body>` з z-index 230.
* DOMPurify з власним `ALLOWED_URI_REGEXP` прибирав `type="checkbox"` — додано `ADD_URI_SAFE_ATTR`.
* Глобальні стилі `footer`/`h3` (index.css) ламали картки — явно скинуті в `notities-vnext.css`.
* Esc не закривав шар, коли кнопка, на яку натиснули, зникла (фокус у body) — Esc тепер працює і на рівні вікна для верхнього шару.

**Деплой лише після окремої фрази власника `DEPLOY ПІДТВЕРДЖЕНО` і схвалення passkey на сайті.**
