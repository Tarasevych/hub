> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./WIJZIGINGEN-20261028-HUIS-VNEXT.uk.md) · [🇳🇱 **Nederlandse versie**](./WIJZIGINGEN-20261028-HUIS-VNEXT.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей / Index](../docs/INDEX.md)

## Huis vNext — huis.tarasevych.com (28.10.2026)

Реалізація пакета `Mijn_Ruimte_Huis_vNext` (ТЗ `ТЕХНІЧНЕ_ЗАВДАННЯ_HUIS_VNEXT.md`, старт з `00_АГЕНТУ_ПОЧАТИ_ЗВІДСИ.md`) у наявному проєкті. База: архів **`mijn-ruimte-20261028-224316`** + гілка `notities-vnext` (міграція 0127). Гілка **`huis-vnext`**, міграція **`0128_huis_vnext.sql`**, прапорець **`huis-vnext`** (вимкнено типово → стара інформаційна сторінка без змін). **Production не змінено й не розгорнуто.**

> **Перебазовано 29.10.2026:** база тепер **`mijn-ruimte-20261028-233308`** (сторінка «Повернення стану», tak fix-technische-modules, commit f7eafb075585) — проміжний випуск іншого агента. Перетину файлів немає (той випуск міняв повернення стану/огляд/здоров'я, цей — notities/huis); перебазування чисте, без жодної зміни у файлах цього пакета. Повторно на новій базі: huis-vnext 53/53, notities-vnext 62/62, terugdraai-controle 25/25, e2e huis 49/49, e2e notities 39/39, `npm run build` PASS, tsc 3/20 (базові).


Пріоритет за ТЗ дотримано: 1) identity/access + Huis Core стан model → 2) лише для читання адаптер → 3) UI → 4) confirmed команда path → 5) сцени/правила (правила — лише чернетка+симуляція) → 6) реальні інтеграції (лише Home Assistant) → 7) showroom/калькулятор (без цін).

### Принципи, зафіксовані в коді (shared/huis-model.ts, backend/huis-vnext.ts)

* **Жодного вигаданого стану.** Стан існує лише як спостереження з `waargenomen_op`/`ontvangen_op`/`kwaliteit`. Без виміру — `onbekend`; старше 15 хв — `verouderd`; `unavailable` у джерела — `onbeschikbaar`. UI показує це на кожній картці (ліва смуга + текст), ніколи «зелене = увімкнено» без даних.
* **Команда виконана лише з ACK.** Машина станів `verzocht → aanvaard → verzonden → bevestigd → waargenomen → voltooid` (або `geweigerd/verlopen/mislukt/gedeeltelijk/offline`); `voltooid` тільки коли джерело повернуло бажаний стан (3 опитування по 500 мс, потім дочитування до дедлайну 20 с). Ключ ідемпотентності унікальний на оселю; все у журналі з кореляцією.
* **Критична безпека лише людиною.** Замок, охорона, сирена, дим/газ: ШІ-пропозиція відхиляється вже при створенні (`KRITIEK_ALLEEN_MENS`), сцени й правила не приймають таких кроків (`STAP_KRITIEK_NIET_TOEGESTAAN`/`DAN_KRITIEK_NIET_TOEGESTAAN`), людина — тільки через явне підтвердження в UI + step-up сервера (`STEP_UP_VEREIST`). Команди взагалі можливі лише після окремого «Дозволити команди» для інтеграції (також step-up; лише власник оселі).
* **Сумісність за моделлю/можливостями, не за брендом.** Capability-модель (`aan_uit, helderheid, kleurtemperatuur, temperatuur, doeltemperatuur, open_dicht, positie, vergrendeld, alarm, contact, beweging, water, rook, gas, aanwezigheid, energie, vermogen, …`) виводиться з HA-домену + атрибутів (`vertaalEntiteit`). Логотипів брендів немає; каталог інтеграцій каже чесно: **лише Home Assistant `beschikbaar`**; Matter/Zigbee/Z-Wave/KNX/Loxone/Tuya/Google Home/Alexa/MQTT — `gepland` (адаптера немає, кнопок немає); Ajax, Apple Home, камери/RTSP — `niet_ondersteund` з причиною та посиланням на джерело.
* **Без відкритих портів.** Адаптер — вихідне з'єднання з сервера до Home Assistant (LAN/VPN), http(s) без userinfo/query, loopback/link-local відхиляються (`veiligAdres`), 8 с таймаут, 6 МБ ліміт. Токен шифрується envelope-ключем (`HUIS_ADAPTER_SLEUTEL_V1`, fallback `TOTP_ENCRYPTION_KEY_V1`), ніколи не повертається клієнту й не потрапляє в журнал.
* **Ізоляція.** Усі таблиці `app.huis_*` під RLS через членство в оселі (`app.huis_leden`: eigenaar/lid/gast/installateur/ondersteuning, останні два — тимчасово з `geldig_tot`); запити через `alsGebruiker` (та сама поворітня, що в нотатках).

### Що зроблено

| Розділ (ТЗ) | Стан | Де |
|---|---|---|
| Огляд: канал (локально/застаріло/відмовлено/немає шлюзу), чесна порожня стадія з однією CTA, плитки лише з вимірів (температура з джерелом і часом, світло «увімкнено (підтверджено)», енергія виміряна/сумарно, охорона «невідомо» без офіційного статусу), міні-план, сцени, 3 останні події | **implemented** | `src/huis/onderdelen/Overzicht.tsx` |
| Кімнати: поверхи, схематичний 2D-план (SVG, клавіатура, завжди є список), додати/перейменувати/прибрати, зсув/розмір кнопками, панель кімнати з керуванням, перенесення пристроїв | **implemented** (без 3D, без сканування) | `Kamers.tsx`, `Plattegrond.tsx` |
| Пристрої: пошук/фільтри (тип, кімната, актуальність), картки з реальною величиною + актуальність, інспектор (стани, можливості, джерело, перейменувати/кімната/приховати), керування з життєвим циклом команди | **implemented** | `Apparaten.tsx`, `ApparaatBediening.tsx` |
| Сцени: редактор (лише керовані некритичні пристрої), виконання з ACK по кроках, результат `voltooid/gedeeltelijk/mislukt`, кореляція | **implemented** | `Scenes.tsx`, `sceneUitvoeren` |
| Автоматизації: редактор Коли/Якщо/Тоді (час+дні, стан, поріг; вікно часу, стан, присутність; сцена/команда/сповіщення), запобіжники (охолодження, макс/день, затримка), **droogloop** без I/O на реальних спостереженнях з поясненням кожної умови та попередженнями (петля, без охолодження, критичне в «Тоді») | **implemented як чернетка+симуляція**; **виконання правил сервером — НЕ IMPLEMENTED** (стан `aan` чесно відхиляється: `NOG_NIET_UITVOERBAAR`) | `Automatiseringen.tsx`, `droogloop()` |
| Безпека: лише спостереження (контакт/рух/дим/газ/вода/замок/панель/присутність), явне `gecertificeerd: false`, попередження при спрацьованому датчику, замок/панель лише людиною з підтвердженням | **implemented** (не охоронна система — так і написано) | `Beveiliging.tsx` |
| Енергія: тільки виміряні значення (vermogen/energie), історія з `history/period` джерела як SVG-лінія, без тарифів/оцінок | **implemented** | `Energie.tsx`, `haGeschiedenis` |
| Події: журнал з джерелом, типом, серйозністю, часом джерела, кореляцією, фільтр, курсор | **implemented** | `Gebeurtenissen.tsx` |
| Інтеграції: чесний каталог + майстер Home Assistant (адреса+токен → перевірка `/api/`, `/api/config` → знайти (з «уже на сайті»/критично/офлайн) → імпорт вибраного → синхронізація (оновлено/зникло/нові) → дозволити команди (посилене підтвердження) → від'єднати) | **implemented** | `Integraties.tsx`, `backend/huis-adapter-thuis-assistent.ts` |
| ШІ-помічник: ланцюжок пропозиція → рішення людини → команда через `ai-voorstel` з ACK; критичне відхиляється; TTL пропозиції; ручне створення для тесту ланцюжка | **implemented** (вбудованого чат-бота оселі немає — пропозиції приходять через MCP/сторінку; так і написано) | `Assistent.tsx`, `voorstelMaken/voorstelBesluiten` |
| Налаштування: назва/часовий пояс/поверхи, учасники з ролями (тимчасові для інсталятора/підтримки), ще одна оселя | **implemented** | `Instellingen.tsx` |
| Showroom: демо на вигаданих даних з явною позначкою, демо-план, 3 сценарії («Вечір», «Ранок», «Вода») як покроковий текстовий playback, без API/команд/токенів | **implemented** | `Showroom.tsx` |
| Калькулятор: тип житла/м²/стадія/функції → зони, кількості, фактори складності; **без цін** (ТЗ: прайс не верифіковано) | **implemented** | `Planner.tsx`, `plannerStructuur()` |
| uk/nl, клавіатура (Esc, Tab-пастка у шарах), aria (switch з `aria-checked="mixed"` при невідомому стані, role=tablist), тик-цілі ≥ 44 px, safe-area, світла/темна через токени, нижня панель на телефоні | **implemented** | `src/huis/huis.css`, `HuisLaag.tsx` |
| WebSocket/push оновлення | **НЕ IMPLEMENTED** — опитування 30 с + кнопка «Оновити»; команди опитуються кожні 1,5 с до кінцевого стану | — |

Навігація: 13 вкладок `huis` зареєстровано в `public/canonical-service.js` (slugs: `overzicht, kamers, apparaten, scenes, automatiseringen, beveiliging, energie, activiteit, integraties, assistent, instellingen, showroom, planner`), `shared/menu-model.ts`, `shared/werkblad-register.ts`, `src/menu-voorkeuren.tsx`, `src/VerenigdDienstApp.tsx`. Піктограми підменю унікальні й не збігаються з головними (тест `menu-v2`).

### Матриця інтеграцій (чесно)

| Інтеграція | Стан у коді | Примітка |
|---|---|---|
| Home Assistant (REST, long-lived token) | **implemented** — читання всіх сутностей; команди light/switch/input_boolean/fan/cover/climate/lock (lock лише людина+step-up); history | перевірено лише проти **імітованого** HA (`tests/eenheid/hulp/nep-thuis-assistent.ts`); **реальне обладнання — НЕ TESTED** |
| Matter/Thread, Zigbee, Z-Wave, Tuya/LSC, MQTT/ESPHome | **planned** — лише через Home Assistant | власного адаптера немає, кнопок «Під'єднати» немає |
| KNX, Loxone, Google Home, Alexa | **planned** | адаптера немає |
| Ajax Systems | **restricted/unsupported** — Enterprise API партнерський | не обіцяємо; керування лише з рідного застосунку |
| Apple Home | **не підтримується** з вебсайту | HomeKit лише через нативний SDK |
| Камери/RTSP | **не підтримується** у цьому випуску | без потоків |

### Перевірки (реальні цифри, це середовище)

Середовище: Node v22.22.0 (репозиторій просить ≥ 24; EBADENGINE), PostgreSQL 16 локально (`127.0.0.1:55432`), Chromium (Playwright 1194), самопідписаний сертифікат `*.tarasevych.com` (`ignoreHTTPSErrors` лише в e2e), імітований Home Assistant на не-loopback адресі машини (адаптер відхиляє loopback).

| Набір | Результат |
|---|---|
| `tests/eenheid/huis-vnext-20261028.test.ts` (міграція ×2 ідемпотентно, RLS/ролі, адреси/токен, verbinden/ontdekken/importeren, versheid, команда з ACK, повільне джерело → `verzonden` без «виконано», глухе джерело → `verlopen`, критичне → step-up, гість → `ROL_ALLEEN_LEZEN`, сцена з кроковим ACK, droogloop без I/O, автоматизація `aan` відхилена, ШІ-пропозиція → схвалення → команда, енергія/безпека/журнал без токена, синхронізація, джерело недоступне → `offline`, від'єднання, модель, каталог, планер без цін) | **53/53 PASS** |
| `tests/e2e/huis-vnext.e2e.ts` (справжній сервер + Postgres + nep-Google + nep-HA; прапорець вимк → стара сторінка; увімк → оселя → порожня стадія → майстер HA (токен ніде на сторінці, у БД — envelope) → знайти 13 → імпорт → картки 11 актуально/1 невідомо/1 поза мережею → інспектор лише-читання → «Дозволити команди» → лампа `voltooid` з ACK (`turn_on` у джерелі, рядок `voltooid/site/site-…` у БД) → замок: підтвердження, нічого не надіслано до «Так» → кімнати/план/перенесення/`heeft-licht` → сцена (замок не вибирається) `voltooid` 2/2 → правило: лише concept/simulatie, droogloop 07:00 так / 09:00 ні без жодного виклику джерела → безпека `gecertificeerd=false` → енергія 2 лічильники без € → ШІ-пропозиція → схвалення → `switch` у джерелі → журнал без токена → showroom/planner → 320/390/768/1024/1440 × світла/темна без горизонтальної прокрутки, інспектор на весь екран на 390, тик-ціль 44 px, «Ще»-меню; 0 помилок консолі/сторінки/4xx/зовнішніх запитів) | **49/49 PASS** (знімки екрана в архіві доказів) |
| `npm run build` (kaart-controle, plaatsing-controle, zoek-ui-catalogus, l002-audit, mail-slimme-inbox-audit, kleur-contrast-controle, vite, tech-bundels, extensie, server) | **PASS** (exit 0) |
| `tsc -p tsconfig.json` / `tsc -p tsconfig.server.json` | 3 / 20 помилок — **ті самі, що в базовому архіві** (cloud/React unused; mail-afzenders, index.ts gmail*); 0 у нових файлах |
| Регресія реєстрів/меню: `menu-indeling` 32/32, `menu-v2` 35/35, `menu-oppervlak` 14/14, `werkblad-register-20261027` 34/34, `plaatsing-20261025` 68/68, `vertaalpaneel-20261019` 33/33, `gebruiker-audit-2026-10-19` 44/44, `zoek-in-menu-20261024` 23/23, `zoek-ui-20261022` 61/61, `integraties-catalogus` 22/22, `menu-per-profiel-20261019` 40/40, `thema` 17/17 | PASS |
| `ui-audit-g` 58/59 | **той самий збій на базовому архіві** (8a band-verbergen) |
| Notities vNext на цій гілці: `notities-vnext-20261028` 62/62 (повторно після змін huis); e2e 39/39 на коміті `notities-vnext` | PASS (файли не перетинаються) |
| `deploy/huis-vnext-terugdraaien.sql` | **прогнано** на окремій БД `mr_vers`: 11 таблиць + прапорець + запис міграції прибрано; `migrate.mjs` потім знову застосував 0128 без помилок |

**НЕ TESTED:** реальний Home Assistant та реальні пристрої (лише імітований REST); RLS з ролями `mijnruimte_app/system` на production (тут одна суперроль; policies створюються, але ефективну ізоляцію між користувачами перевіряє лише логіка `lidVan`); step-up із **застарілою** сесією (в e2e сесія свіжа, тож step-up проходить; на production з'явиться вікно «Підтвердіть доступ» — спільний механізм `src/platform/stap-op.ts`); поведінка при >1000 сутностей (ліміт імпорту за кодом 2000).

### Міграція 0128 (безпечна, ідемпотентна)

`CREATE TABLE IF NOT EXISTS` ×11 (`huis_woningen, huis_leden, huis_ruimtes, huis_integraties, huis_apparaten, huis_toestanden, huis_opdrachten, huis_scenes, huis_automatiseringen, huis_gebeurtenissen, huis_voorstellen`), RLS policies за членством, GRANT'и (`migrations/rechten.sql` доповнено), прапорець `huis-vnext` (`ON CONFLICT DO NOTHING`, вимкнено). Наявних таблиць не торкається. Нова змінна **`HUIS_ADAPTER_SLEUTEL_V1`** (необов'язкова; `ENV-VARS.md`).

### План повернення стану

1. Звичайний: `mijn-ruimte-installeer` → попередній реліз. Таблиці 0128 лишаються, старий код їх не читає; стара сторінка `huis` без змін.
2. Лише вимкнути нову сторінку: прапорець `huis-vnext` → UIT (Перемикачі функцій) — миттєво стара інформаційна сторінка, дані збережено.
3. Прибрати таблиці: `deploy/huis-vnext-terugdraaien.sql` після `pg_dump -t 'app.huis_*'` (інструкція у файлі). У Home Assistant нічого не змінюється.

### Змінені/нові файли

Нові: `migrations/0128_huis_vnext.sql`, `shared/huis-model.ts`, `backend/huis-vnext.ts`, `backend/huis-adapter-thuis-assistent.ts`, `src/huis/{HuisPagina,HuisLaag,ApparaatBediening}.tsx`, `src/huis/{huis-client,huis-vlag,tekst}.ts`, `src/huis/huis.css`, `src/huis/onderdelen/{Overzicht,Plattegrond,Kamers,Apparaten,Scenes,Automatiseringen,Beveiliging,Energie,Gebeurtenissen,Integraties,Assistent,Instellingen,Showroom,Planner}.tsx`, `tests/eenheid/huis-vnext-20261028.test.ts`, `tests/eenheid/hulp/nep-thuis-assistent.ts`, `tests/e2e/huis-vnext.e2e.ts`, `deploy/huis-vnext-terugdraaien.sql`, цей файл.
Змінені: `backend/index.ts` (реєстрація маршрутів `huisRoutes` зі step-up), `src/DomoticaWeergave.tsx` (перемикач за прапорцем; стара сторінка `SmartHomeOud` без змін), `src/VerenigdDienstApp.tsx` (вкладки huis + `onNavigateTab`), `public/canonical-service.js`, `shared/menu-model.ts`, `shared/werkblad-register.ts`, `src/menu-voorkeuren.tsx` (13 вкладок), `shared/vlaggen.ts` (пояснення прапорця), `migrations/rechten.sql` (GRANT 0128), `scripts/plaatsing-vaste-elementen.json` (`.hv-laag`, `.hv-onderbalk` з причиною), `scripts/e2e-lokaal.mjs` (власні адреси інтерфейсів машини вважаються локальними — для nep-HA; назовні так само нічого не йде), `ENV-VARS.md`.

### Знахідки під час роботи (виправлено)

* Chrome `data-surface-model=flat-content` прибирає бокові рамки та радіус у кожного `<section>/<article>` у вмісті — картки оселі несуть актуальність у лівій смузі, тож повернуто з тією ж специфічністю (`huis.css`, кінець файлу).
* Загальне правило `.hv svg {16px}` зменшувало SVG-план до піктограми — вимкнено `.hv-plan`/`.hv-lijn`.
* У e2e nep-Google перехоплює **весь** `fetch` (599) — для nep-HA справжній fetch лише на власну адресу машини; сокет-замок `e2e-lokaal.mjs` тепер дозволяє власні інтерфейси.
* `menu-v2`: піктограми підменю мають бути унікальні й не збігатися з головними — `scenes:workspace`, `automations:workflows`, `assistant:ai-access`.

**Розгортання лише після окремої фрази власника `DEPLOY ПІДТВЕРДЖЕНО` і схвалення passkey на сайті.**
