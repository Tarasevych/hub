---
name: uitgave-voorbereiden
description: Готуй випуски Mijn Ruimte, перевіряй основу, міграції на PostgreSQL 18.6, каталог пошуку, походження TRACE-001, запасні копії на R:\, встановлення та безпечне повернення попередньої версії без обходу ключа доступу власника. Bereid een uitgave van Mijn Ruimte voor, controleer basis, PostgreSQL 18.6-migraties, zoekcatalogus, TRACE-001, reservekopieën, installatie en veilig terugdraaien zonder de passkey van de eigenaar te omzeilen.
---

# Підготовка, встановлення й повернення випусків Mijn Ruimte

## Коли застосовувати

Застосовуй цю навичку, коли власник просить зібрати випуск, перевірити готовність до оновлення, оприлюднити архів у GitHub, перевірити запасні копії та можливість відновлення, передати оновлення до `admin.tarasevych.com/updates`, перевірити живий сайт після оновлення або безпечно повернути попередню версію.

Навичка описує обов’язкову послідовність роботи. Вона **не надає дозволів**, не дозволяє обійти ключ доступу власника та не замінює канонічні правила координації.

## Джерела істини та зв’язок із пам’яттю розвитку

Перед діями прочитай і звір:
- `AGENTS.md`, `orchestratie/beleid.json`, `orchestratie/BESLUITEN.md` та `orchestratie/wachtrij.json` — чинні правила, поточна основа й черга інтеграції;
- `orchestratie/CONTEXT-COMPACT.md` — короткий покажчик (завжди звіряй із правилами й живим станом);
- `deploy/ПРАВИЛА-ПАКЕТА-РОЗГОРТАННЯ.uk.md` та `deploy/ВІДНОВЛЕННЯ.uk.md` / `deploy/HERSTEL.nl.md` — правила пакета, копій і відновлення;
- `backend/uitrol-goedkeuring.ts`, `backend/uitrol-voorcontrole.ts`, `backend/uitrol-vereisten.ts`, `backend/uitrol-ontwikkelarchief.ts`, `backend/uitrol-runs.ts`, `backend/uitrol-github.ts`.

Також застосовуй `ontwikkelgeheugen-bewaken`: до початку перевір пов’язані завдання в `orchestratie/taken/` та `orchestratie/ontwikkelarchieven/`, а після завершення передай результат і контрольні відбитки за зразком `WERKOVERDRACHT.uk.md`.

Якщо ця навичка розходиться із захищеними правилами або фактичним станом сервера — перевагу мають захищені правила й фактичний стан сервера.

## Частина 1. Звірка робочої основи й перелік підготовки випуску

1. **Звірка робочої основи, гілки й черги (`AGENTS.md` + `beleid.json`).**
   - Заборонено обирати гілку наосліп лише за «встановленою» версією або лише за `integratie` без перевірки чотирьох джерел: `orchestratie/beleid.json` (`basis.versie`, `basis.bronCommit`), `orchestratie/geinstalleerd.json` та `/api/version` (за наявності доступу), стану гілок `voornaamst` і `integratie`, а також `node scripts/orch.mjs wachtrij toon`.
   - Розрізняй `basisCommit` задачі (від якої гілка приймається в чергу `integratie` через `taak-start`) і `UITROL-BASIS` зібраного пакета (`geinstalleerd.json` або `beleid.json → basis`).
   - Зареєструй завдання (`taak-start`) і перевіряй свіжість до початку та перед передаванням: `node scripts/orch.mjs controleer` і `node scripts/orch.mjs versheid --taak <ID> --fase start|overdracht`.

2. **Стан міграцій на PostgreSQL 18.6 і права БД.**
   - Звір номери `migrations/NNNN_*.sql`, наявність `ENABLE ROW LEVEL SECURITY` / `FORCE ROW LEVEL SECURITY` та функцій просторів (`app.huidige_gebruiker()`, `app.huidige_ruimte()`), оновлення `migrations/rechten.sql` для `mijnruimte_app` і `mijnruimte_system`, а для таблиць із таємницями — `shared/sleutelkluis.ts`.
   - **Обов’язковий прогін нових міграцій на чистій PostgreSQL 18.6** (цільовий стек ВМ за `AGENTS.md` §1 / `B-009`, не застаріла згадка старіших версій PostgreSQL): накат, повторний запуск (повторостійкість), перевірка обмежень на значення полів і збереження наявних даних за логікою `deploy/uitrol/mijn-ruimte-migratie-proef.sh`.

3. **Типи, тести, збірка та каталог пошуку.**
   - Запусти перевірки типів: `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit` і `npm run typecheck:server`.
   - Запусти відповідні модульні тести (`node scripts/eenheidstests.mjs <фільтр>`), з явним зазначенням пропущених частин (як-от БД без `DATABASE_URL`).
   - Виконай або звір повну збірку `npm run build`, яка проганяє: `scripts/kaart-controle.mjs`, `scripts/plaatsing-controle.mjs`, `scripts/hulp-vraagtekens-controle.mjs`, **`scripts/zoek-ui-catalogus.mjs`** (каталог пошуку інтерфейсу, окрема перевірка `node scripts/zoek-ui-catalogus.mjs --controle`), `scripts/l002-audit.mjs`, `scripts/mail-slimme-inbox-audit.mjs`, `scripts/kleur-contrast-controle.mjs`, `scripts/tech-bundels-controle.mjs`, `vite build` і `build:server`.

4. **Походження архіву (`TRACE-001`) та оприлюднення у GitHub.**
   - Збирай архів виключно чинним конвеєром (`node scripts/orch.mjs pakket` → `deploy/uitrol/maak-voorstelpakket.sh`), із зафіксованим у git файлом `orchestratie/ontwikkelarchieven/<TASK-ID>.json`, `ONTWIKKELARCHIEF.json` (обов’язково від `20261103-211555`), `UITROL-MANIFEST.json` (`uk + nl`, автор, агенти, модель) і точними результатами випробувань (`TESTRESULTATEN`).
   - Після публікації в GitHub Release перевір наявність файла `mijn-ruimte-<versie>.tar.gz` і **точний збіг його SHA-256**. Стан «опубліковано» **ніколи не означає** «встановлено».

5. **Передавання та зв’язок із пам’яттю розвитку.**
   - Оформи сталий звіт (з точним переліком виконаних команд, фактичних цифр, SHA-256 та обмежень) і онови запис передавання за `WERKOVERDRACHT.uk.md`.

## Частина 2. Пам’ятка встановлення, запасних копій та повернення версії

1. **Обов’язкова перевірка запасних копій і їхньої відновлюваності ДО встановлення.**
   - **Серверна копія на ВМ:** перевір свіжу копію служби `mijn-ruimte-backup.service` (`deploy/backup-maken.sh`) у `/srv/backups/mijn-ruimte/<РРРРММДД-ГГХХСС>/` — наявність `database.dump.age`, `uploads.tar.gz.age`, `systeem.tar.gz.age`, `info.txt`, `SHA256SUMS` та завершального маркера `KLAAR` (додатково `deploy/installeer-app.sh` створює передміграційну копію).
   - **Копії та ключ на ПК власника (`R:\` проти `T:\`):** за `deploy/ВІДНОВЛЕННЯ.uk.md` і `deploy/HERSTEL.nl.md` канонічний шлях офлайнових резервних копій на ПК власника — **`R:\mijn-ruimte-reservekopie\`** (зокрема `sleutels/herstelsleutel-age.txt`, `vm-back-ups/`, `geheimen/geheimen-<stempel>.tar.age`, `herstelset/`), тоді як робочі інструменти адміністрування — у `T:\mijn-ruimte\`.
   - **Сувора заборона вигадування:** агент **не має права** припускати або заявляти, що копія на `R:\` є й вона свіжа, якщо не перевірив її напряму. Якщо доступу до `R:\` немає, прямо вкажи власнику як обов’язкову передумову до схвалення: перевірити свіжість копії на `R:\mijn-ruimte-reservekopie\`, цілісність `SHA256SUMS` та доступність `herstelsleutel-age.txt` і `geheimen-<stempel>.tar.age`.

2. **Встановлення через чинний адміністративний розділ (`admin.tarasevych.com/updates`).**
   - Перевір проходження статичної попередньої перевірки (`backend/uitrol-voorcontrole.ts`) та пробного прогону нових міграцій на одноразовій копії схеми (`backend/uitrol-vereisten.ts` → `/srv/mijn-ruimte/proef-inbox`).
   - Встановлення запускається **лише після схвалення власником через ключ доступу** (`backend/uitrol-goedkeuring.ts`), після чого root-встановлювач (`deploy/uitrol/mijn-ruimte-uitrol.sh` → `deploy/installeer-app.sh`) оновлює сервер. Агент ніколи не схвалює оновлення сам.

3. **Перевірки живого сайту після оновлення.**
   - Звір `/api/version` (`versie` і повний `commit` мають дорівнювати новому випуску), `/__gezondheid`, стан `diagnose.json` і `mijn-ruimte-nazorg.sh`, журнал `app.uitrol_runs`, а також перевірку відмальовування в переглядачі (`node scripts/rook-controle.mjs --live`).
   - Якщо встановлення не завершилося або впало на перевірці, не називай його успішним.

4. **Порядок безпечного повернення попередньої версії.**
   - Штатне повернення: через `Admin → Оновлення → Відкотити` (`TERUGDRAAIEN` у `backend/uitrol-runs.ts`) або автоматичний нагляд `mijn-ruimte-nazorg.sh`.
   - **Критичне застереження щодо бази даних:** під час повернення коду **міграції БД автоматично не скасовуються** (`src/uitrol/Voorcontrole.tsx`). Якщо новий випуск застосував несумісні міграції (`DROP`, зміна типів чи даних), повернення потребує відновлення бази з зашифрованої резервної копії `database.dump.age` (`pg_restore`) за інструкцією `deploy/ВІДНОВЛЕННЯ.uk.md` / `deploy/HERSTEL.nl.md`.

## Приймання випусків із GitHub та зашифрований архів Telegram (`UITROL-002`)

- **Отримання архіву сервером із GitHub:** впроваджено в `backend/uitrol-github-ontvangen.ts` (підписаний вхідний приймач подій GitHub із перевіркою HMAC-SHA256 та захистом від повторів, ручне отримання та інструмент MCP `uitrol_github_ophalen` виключно в межах налаштованого сховища власника). Отримання переводить випуск у `wacht-op-goedkeuring` після попередньої перевірки та **ніколи не підміняє** підтвердження ключем доступу власника.
- **Обов’язкова зашифрована копія в окремій темі Telegram до схвалення:** впроваджено в `backend/uitrol-telegram.ts` (окремий ключ бота `TELEGRAM_UITROL_BOT_TOKEN`, перевірка `getChatMember` і прав публікації в групі та темі, потокове шифрування AES-256-GCM, блокування схвалення за увімкненого `verplichtVoorInstallatie`, відповіді лише на `/status` і `/help` у зазначеній темі без таємних значень).
- **Обов’язкова чесна звірка живого стану:** агент не має права вважати окремого бота випусків, тему чи секрет підпису GitHub у робочому середовищі налаштованими без прямої перевірки стану в адміністративному розділі (`admin.tarasevych.com/updates`) і живого з’єднання.

## Персональні ключі, 3-чинникова довіра та вибіркове відкликання (`B-023`)

- **3-чинникова довіра (`GitHub` ↔ `MCP ШІ` ↔ `Сайт`):** кожен адміністратор або делегована особа має власний відкличний ключ (`app.uitrol_beheer_sleutels`). Для «лише завантаження» пакет потрапляє в кумулятивну чергу та перевіряється сайтом; для права «завантаження + встановлення» потрібна взаємна синхронізація всіх 3 чинників (прив’язка GitHub + `TRACE-001`, MCP-з’єднувач ШІ + чинні правила `regelsVersie`, чинний обліковий запис і права на сайті).
- **Реєстр змін і вибіркове відкликання:** кожен випуск зберігається в `app.uitrol_release_wijzigingen` із точним джерелом (`github|mcp|site|ssh`), переліком файлів і міграцій. Якщо власнику потрібно скасувати одне конкретне старіше оновлення без втрати пізніших випусків, звір `releasesRegister` (у `uitrol_voorstel_status` або в «Історії»), виконай пофайловий план вибіркового відкликання (збережи пізніші правки в перетинних файлах, не видаляй руйнівно міграції БД) та збери новий компенсаційний випуск.

## Повідомлення власникові та умови перегляду

Завжди чітко розділяй стани: «підготовлено», «опубліковано», «завантажено на сервер», «перевірено», «очікує погодження», «встановлено», «збережено в Telegram». Не замінюй звітними перевірками рішення власника.

Відтворюваний зразок і заповнений документ передавання: [VOORBEELD.uk.md](VOORBEELD.uk.md) та [WERKOVERDRACHT.uk.md](../ontwikkelgeheugen-bewaken/WERKOVERDRACHT.uk.md).
