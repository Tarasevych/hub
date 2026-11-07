> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./LEESMIJ.md)) · [🇳🇱 **Nederlandse versie**](./LEESMIJ.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей](../docs/INDEX.md)

# Файли розгортання «Mijn Ruimte» (VM за Cloudflare Tunnel)

Нічого з цього не розгортається автоматично. Порядок дій для нової віртуальної машини (Debian/Ubuntu, від імені root):

1. **Пакети**: Node 24 (`/usr/bin/node`, напр. через NodeSource), `npm`, `git`, `rsync`, `curl`,
   PostgreSQL 17 (сервер + `postgresql-client-17` для `pg_dump`), `age` (зашифровані резервні копії), `cloudflared`.
   **Версія PostgreSQL**: щонайменше **16** (Ubuntu 24.04 LTS: `postgresql-16`; усі міграції протестовано), рекомендовано **17**.
   Нижчі версії (напр. Ubuntu 22.04: PG 14) не підтримуються: `installeren` перевіряє версію перед резервним копіюванням і
   міграціями (`dist-server/migrate.mjs --pg-controle`) та зупиняється з повідомленням нідерландською й українською мовами,
   нічого не змінюючи в базі даних. Оновлення: `pg_upgradecluster` або пакет PGDG із postgresql.org.
   Клієнт `pg_dump` має бути щонайменше тієї самої основної версії, що й сервер. Мінімум у коді: `server/pg-versie.ts`.
   Покладіть публічний age-ключ у `/etc/mijn-ruimte/backup-ontvanger.age.pub` (root, 0644); без цього ключа
   резервне копіювання відмовить у роботі (а отже й `installeren`, який спершу робить резервну копію). Див. `HERSTEL.md`.
2. **Початкове налаштування**: `deploy/installeer-app.sh inrichten /pad/naar/checkout`
   - системний користувач `mijnruimte` (без оболонки), група `mijnruimte-backup` (для хоста, який забирає резервні копії);
   - теки `/srv/mijn-ruimte/{releases,dashboard}`, `/srv/data/uploads`, `/srv/backups/mijn-ruimte`, `/etc/mijn-ruimte`;
   - юніти й таймери systemd у `/etc/systemd/system/` та їх увімкнення.
3. **База даних**: створити роль і базу даних `mijnruimte` (команду показує `inrichten`).
4. **Секрети**: `/etc/mijn-ruimte/geheimen.env` із `DATABASE_URL`, після чого згенерувати решту обов'язкових ключів на самій VM:
   `deploy/geheimen-aanvullen.sh --eigenaar <e-mailadres>` (нічого не перезаписує, значень не показує).
   Режиму `0600 root:root` достатньо: systemd читає файл від імені root перед запуском служби.
5. **Встановлення**: `deploy/installeer-app.sh installeren /pad/naar/checkout`
   копіювання вихідного коду (лише закомічений HEAD) → складання від імені `mijnruimte` (`npm ci`, аудит, vite, серверний бандл,
   `npm prune --omit=dev`) → резервна копія → міграції → атомарне перемикання симлінка `current` → перезапуск →
   перевірка працездатності (`/__gezondheid`); у разі невдачі — автоматичний повернення стану до попереднього релізу.
6. **Панель (Dashboard)**: `deploy/installeer-app.sh dashboard /pad/naar/dashboardmap` (лише `*.html/*.css/*.js`/зображення,
   у `/srv/mijn-ruimte/dashboard`, `root:mijnruimte`, файли 0640: лише читання для служби).
7. **Тунель**: див. розділ «Тунель» нижче. `inrichten` готує `/etc/cloudflared/config.yml` із заповнювачем
   `TUNNEL-ID-INVULLEN`; створення тунелю, налаштування DNS і `cloudflared.service` виконуються після цього (потребує входу в Cloudflare).
8. **Ролі бази даних (безпека, фаза 2, необов'язково, але рекомендовано)**: після успішного `installeren`:
   `deploy/db-rollen-instellen.sh instellen` — створює `mijnruimte_migrator` (власник схеми), `mijnruimte_app`
   (лише DML на `app.records`, під RLS) та `mijnruimte_system` (BYPASSRLS: cron, вхід, адміністрування, резервне копіювання),
   записує `DATABASE_URL_MIGRATIE/_APP/_SYSTEM` у `geheimen.env` (паролі створюються на VM, ніколи не показуються),
   перезапускає й перевіряє; у разі помилки все повертається назад. Після цього RLS працює в **режимі аудиту**:
   `db-rollen-instellen.sh status` показує, що було б відхилено при примусовому застосуванні; `rls-aan` / `rls-uit` перемикає миттєво (без
   перезапуску). Без цього кроку все працює з однією старою роллю, як раніше. Див. `RUNBOOK-FASE-2-3.md`.
9. **Перевірка**: `systemctl status mijn-ruimte`, `systemctl list-timers 'mijn-ruimte-*'`,
   `journalctl -u mijn-ruimte -f`, `curl -s http://127.0.0.1:8080/__gezondheid`.

## Файли

| Файл | Призначення |
|---|---|
| `mijn-ruimte.service` | HTTP-сервер (`dist-server/start.mjs`), користувач `mijnruimte`, `EnvironmentFile=/etc/mijn-ruimte/geheimen.env`, посилення безпеки (NoNewPrivileges, ProtectSystem=strict, доступ на запис лише до `/srv/data/uploads`, PrivateTmp, ProtectHome, порожній CapabilityBoundingSet, SystemCallFilter, …). |
| `mijn-ruimte-cron@.service` | Одне cron-завдання з `cron.json` (`dist-server/cron.mjs %i`), таке саме посилення безпеки. |
| `mijn-ruimte-mail-onderhoud.timer` | `mail-provider-maintenance`, кожні 5 хв. |
| `mijn-ruimte-google-sync.timer` | `google-suite-bplus-sync`, кожні 5 хв (зі зсувом на 2 хв). |
| `mijn-ruimte-opruimen.timer` | `opruimen` (прострочені OAuth-стани, PKCE, транзакції, handoffs, сесії, рядки лімітів), щогодини. |
| `mijn-ruimte-backup.service` / `.timer` | Щодня о 03:30 запускає `backup-maken.sh`. |
| `backup-maken.sh` | `pg_dump` (custom-формат) і tar завантажень, напряму через `age -R` (на VM лежить лише публічний ключ) → `database.dump.age`, `uploads.tar.gz.age` + `info.txt`, `SHA256SUMS`, `KLAAR` у `/srv/backups/mijn-ruimte/<дата>/`; зберігає на VM за 7 днів. |
| `reservekopie-ophalen.ps1` | Хост Windows: забирає найновішу зашифровану резервну копію через SSH у `R:\mijn-ruimte-reservekopie\vm-back-ups\` (відхиляє незашифровані), а потім запускає `cloud/cloud-reservekopie.ps1` (Google Диск; `-ZonderCloud` пропускає цей крок). |
| `HERSTEL.md` | Аварійний план: відновлення з GitHub + зашифрованої резервної копії + age-ключа відновлення. |
| `cloud/` | Хост Windows: `cloud-reservekopie.ps1` щодня (після отримання копії, те саме завдання о 09:00) вивантажує лише `.age` + SHA256 на Google Диск через rclone (скоуп `drive.file`, тека `mijn-ruimte-reservekopie`; 30 щоденних + 12 щомісячних; набір для відновлення як `herstelset-<штамп>.zip.age`). `cloud-koppelen.ps1` = одноразовий вхід у Google; `cloud-wachtwoord.ps1` = DPAPI-пароль для зашифрованого `rclone.conf`. Див. `cloud/UITLEG-LEESMIJ.txt`. |
| `herstelset/` | Офлайн-набір для відновлення на зовнішньому диску: інструкція (UA/NL), `herstel-vm.sh` (кроки на новій VM), `ontsleutel-naar-vm.ps1` (потік age ПК→VM без відкритого тексту на диску), `nieuwe-vm-maken.ps1`, `controleer-herstelset.ps1`, `herstelset-bijwerken.ps1`. |
| `vtpm/` | Автоматичне розблокування LUKS через Hyper-V vTPM: `stap1-admin.ps1` (хост, адміністратор) і `luks-tpm-ontgrendelen.sh` (clevis tpm2, PCR 7; слот пароля зберігається). |
| `cloudflared.service` | Посилений юніт для тунелю (`tunnel run` із `/etc/cloudflared/config.yml`). |
| `cloudflared-config.yml` | Шаблон: hub, id, mail, cloud, ai, github, huis, api, admin, dashboard → `http://127.0.0.1:8080`; решта — 404. |
| `installeer-app.sh` | `inrichten`, `installeren`, `terugdraaien [release]`, `lijst`, `dashboard <map>`. Після успішного встановлення також запускає таймери. |
| `db-rollen-instellen.sh` | Від імені root: `instellen`, `status`, `rls-aan`, `rls-uit`, `rls-groepen`, `rls-groep <groep> aan\|uit` (RLS по групах таблиць, міграція 0033; відмовляє в `aan`, доки `app.rls_audit` фіксує порушення для цих таблиць, якщо не вказано `FORCEER=1`; сайт показує лише поточний стан у Діагностика → Ізоляція даних), `terugdraaien`, `env-splitsen`/`env-samenvoegen` (`DATABASE_URL` + `DATABASE_URL_MIGRATIE` у/з `migratie.env`), `audit-beheerder[-weg] <e-mail\|id>`. Виконує `db-rollen.sql` + `../migrations/rechten.sql` (або `db-rollen-terug.sql`) від імені `postgres` через stdin; у Postgres передається лише SCRAM-верифікатор (`scram-verifier.mjs`), наявні паролі використовуються повторно. `geheimen.env`/`migratie.env` оновлюються атомарно (власник і права зберігаються). |
| `RUNBOOK-FASE-2-3.md` | Розгортання фази безпеки 2+3: перевірка архіву, встановлення, ролі, RLS від режиму аудиту до примусового, примусовий auth-шлюз, повернення стану. |
| `RUNBOOK-AUDIT-FIXES.md` | Розгортання виправлень аудиту: резервна копія, `AUDIT_IP_PEPPER`, встановлення (0007/0008), ролі, `env-splitsen`, адміністратор аудиту, архів секретів, перевірка, повернення стану, аварійні ситуації. |
| `db-rollen.sql` / `db-rollen-terug.sql` | Ролі, власність, права, `FORCE ROW LEVEL SECURITY`, `jsonb_contains` LEAKPROOF (GIN-індекс під RLS; запустити повторно після мажорного оновлення Postgres) / повернення власності старій ролі, вимкнення FORCE та примусового режиму. |
| `geheimen-aanmaken.sh` | **20.10.2026.** Генерує ВСІ відсутні ключі (`openssl rand`) у `geheimen.env` (включно з `MAIL_APP_WACHTWOORD_SLEUTEL_V1`, `AGENDA_ABONNEMENT_SLEUTEL_V1`); наявні значення зберігаються; показує лише назву + відбиток; записує `geheimen.journaal`. Запускається автоматично як перший крок `installeer-app.sh installeren`; вручну: `mijn-ruimte-installeer geheimen`. `geheimen-aanvullen.sh` (стара назва) посилається на нього. |
| `geheimen-register.sh` | Реєстр усіх секретів без значень (назва, призначення, де лежить, відбиток, дата, хто ротує): `mijn-ruimte-installeer geheimen-register --uit /etc/mijn-ruimte/GEHEIMEN-REGISTER.md`. Шаблон для власника: `GEHEIMEN-REGISTER.md`. |
| `oauth-client-zetten.sh` | Запис OAuth-клієнта Google або Microsoft у `geheimen.env` із ПРИХОВАНИМ введенням (термінал) або через stdin (скрипт на ПК), перевірка формату, атомарний запис, перезапуск + перевірка `/__gezondheid`: `mijn-ruimte-installeer oauth-client google|microsoft`. `google-login-zetten.sh` (стара назва) посилається на нього. Самі значення вказані в admin → Інтеграції → Майстер під'єднань. |
| `google-login-zetten.sh` | Встановити як `/usr/local/sbin/google-login-zetten` (`install -o root -g root -m 0755`). Читає два рядки зі stdin (client-ID, client-secret), перевіряє формат, записує `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` у `geheimen.env` (власник і права зберігаються, атомарно через тимчасовий файл + `mv`), видаляє відмінний `GOOGLE_SUITE_CLIENT_ID` (інакше він матиме пріоритет), перезапускає `mijn-ruimte`, вимагає `is-active` + HTTP 200 для `Host: hub.tarasevych.com` на `127.0.0.1:8080`. Резервна копія (root, 0600) після успіху знищується через `shred`; у разі збою повертається старий файл + перезапуск. Ніколи не показує значень. |
| `../scripts/google-login-instellen.ps1` | ПК з Windows: запитує Client ID (видимий) і Client secret (`Read-Host -AsSecureString`) та передає їх через **stdin** команди `ssh -i T:\mijn-ruimte\hulpmiddelen\ssh\mijn-ruimte-webserver -o BatchMode=yes beheer@<VM-IP> sudo -n /usr/local/sbin/google-login-zetten`; показує лише OK/помилку. Вимагає, щоб `beheer` мав право виконувати це без пароля (`sudo -n`, як у `HERSTEL.md`). |

## Опції (змінні середовища скриптів)
Це не секрети застосунку (вони описані в `ENV-VARS.md`), а лише налаштування скриптів розгортання:

| Змінна | Скрипт | Типово | Значення |
|---|---|---|---|
| `BEWAAR_RELEASES` | `installeer-app.sh` | `5` | Кількість релізів, які зберігаються (старіші видаляються, активний і попередній — ніколи). |
| `ZONDER_BACKUP=1` | `installeer-app.sh` | вимкнено | Пропустити резервне копіювання перед міграцією (лише якщо щойно зроблено свіжу резервну копію). |
| `NODE` | `installeer-app.sh` | `/usr/bin/node` | Шлях до Node 24. |
| `PORT` | `installeer-app.sh`, `mijn-ruimte.service` | `8080` | Локальний порт (перевірка працездатності на `http://127.0.0.1:$PORT/__gezondheid`); тримайте однаковим з юнітом і `cloudflared-config.yml`. |
| `UPLOADS_DIR` | `backup-maken.sh`, юніти | `/srv/data/uploads` | Тека із завантаженими файлами. |
| `BOUW_GEHEUGEN_MAX` / `BOUW_SWAP_MAX` / `BOUW_HEAP_MB` | `installeer-app.sh` | `1400M` / `2G` / `2048` | Ліміт пам'яті (cgroup) і купа (heap) Node для складання. Складанні vite потрібно ~1,5 ГБ купи; на VM з 2 ГБ ОЗП вона використовує swap. Нестача пам'яті зупиняє лише складання. |
| `ROOK_UIT` / `ROOK_CHROMIUM` / `ROOK_GEHEUGEN_MAX` / `ROOK_TIJD_SEC` / `ROOK_PAGINA_SEC` | `installeer-app.sh` | вимкнено / (шукає сам) / `1500M` / `600` / `20` | Перевірка відмальовування після активації (22.10.2026, RUNBOOK-VEILIGE-UITROL §8a): `ROOK_UIT=1` пропускає її; шлях до браузера; ліміт пам'яті й часу стенду; секунд на сторінку. |
| `NAZORG_ROOK_NA` / `NAZORG_ROOK_TUSSEN` | `mijn-ruimte-nazorg.sh` | `120` / `600` | Секунд після активації перед живою перевіркою відмальовування; мінімальний інтервал для запитів із сайту («Перевірити відмальовування»). |
| `BACKUP_DIR` | `backup-maken.sh` | `/srv/backups/mijn-ruimte` | Цільова тека резервних копій на VM. |
| `BACKUP_BEWAAR_DAGEN` | `backup-maken.sh` | `7` | Скільки днів резервні копії зберігаються на VM. |
| `BACKUP_ONTVANGER` | `backup-maken.sh` | `/etc/mijn-ruimte/backup-ontvanger.age.pub` | Публічний age-ключ, на який виконується шифрування. |
| `BACKUP_ONVERSLEUTELD` | `backup-maken.sh` | вимкнено | `1` = без шифрування (лише для тестів). |

## Власні логотипи сервісів (BYOS, 21.10.2026)
Сайт **не** перемальовує логотипи чужих брендів. Бренди, для яких код містить форму з підтвердженим походженням (simple-icons, CC0;
lobehub, MIT), показують цю форму; усі інші (Outlook, Ukr.net, I.ua, Online.ua, Yahoo, Windows, Edge, Teams, …) показують одну й ту саму
**нейтральну плашку**: 1–2 літери назви у фірмовому тоні (контраст ≥ 4,5:1). Хто хоче мати офіційний логотип на власному сервері, надає
файл самостійно — файл, який ви взяли з **офіційної сторінки бренду** відповідного сервісу (ви самі відповідаєте за
право на використання).

| | |
|---|---|
| Тека | `/srv/mijn-ruimte/merk-eigen` (змінюється через `MERK_EIGEN_MAP` у `geheimen.env`). `installeer-app.sh` створює теку (власник `mijnruimte`, 0755); юніт має `ReadWritePaths=-/srv/mijn-ruimte/merk-eigen`. |
| Назва файла | `<ключ>.svg` або `<ключ>.png`, малими літерами — ключ із реєстру брендів: `microsoftoutlook`, `ukrnet`, `iua`, `onlineua`, `yahoo`, `windows`, `edge`, `microsoft`, `microsoftteams`, `microsoftonedrive`, … (див. `src/merk/merk-tabel.ts`). Якщо є обидва, діє перший за алфавітом, а інший позначається як дублікат. |
| Розмір | ≤ **200 КБ** на файл, щонайбільше 64 файли. |
| PNG | має бути справжнім PNG (сигнатура + IHDR). |
| SVG | **очищується (санітизується)**: XML-пролог, коментарі, `<metadata>` та простори назв редакторів (inkscape, sodipodi, …) видаляються. **Відхиляється** (із зазначенням причини) кожен файл зі `<script>`, `<foreignObject>`, `<image>`, `<a>`, елементами анімації, атрибутами `on…`, `javascript:`, `href`/`url()` на будь-що крім `#…`, `@import`, `DOCTYPE`/`ENTITY` або невідомим елементом. Браузер отримує файл як data-URI всередині `<img>` (там SVG ніколи не виконує скрипти). |
| Завантаження через сайт | admin → **Інтеграції** → «Майстер під'єднань» → «Власні логотипи сервісів»: вибрати сервіс, вибрати файл. Лише власник, зі свіжим підтвердженням **passkey**; кожна зміна записується в журнал адміністрування (`integration.merk-eigen.*`). Там само показуються файли з теки, які НЕ були прийняті, із причиною. |
| Вручну | від імені `beheer`: спершу скопіювати файл у домашню теку (`scp`), потім `sudo -u mijnruimte install -m 0644 ~/ukrnet.svg /srv/mijn-ruimte/merk-eigen/ukrnet.svg`. Перезапуск не потрібен: сервер перечитує теку (кеш 30 с); відкрита сторінка побачить зміни після оновлення. |
| Видалення | в admin натиснути «Видалити» або видалити файл із теки. Тоді повертається нейтральна плашка (або вбудована форма). |

API: `POST /api/owner/merk-eigen/lijst` (будь-яка підтверджена сесія; список відхилених файлів — лише для власника),
`POST /api/owner/admin/merk-eigen/zetten` та `…/wissen` (власник, адмін, passkey).
Правила й очищення: `shared/merk-eigen.ts`; сервер: `backend/merk-eigen.ts`; тест: `tests/eenheid/mail-accounts-beheer-20261021.test.ts`.

### Офіційні логотипи та логотипи/фото відправників (21.10.2026, міграція 0093)
Порядок для кожного бренду: **власний файл** (вище) → **офіційний логотип із вбудованої бази** (`src/merk/officieel/`: Windows, Edge,
Microsoft, Node.js, Outlook, OneDrive, OneNote, Teams, Azure, Yahoo, monday.com, Pipedrive, Webhooks, OAuth — з npm-пакетів із
ліцензією CC0/MIT, походження і sha256 у `HERKOMST.json`; працює без інтернету) → форма з походженням (simple-icons/lobehub) →
**логотип із бази даних сайту** (`app.merk_beeld`) → нейтральна плашка. Оновлення вбудованої бази: `node scripts/merk-officieel-maken.mjs`
(з `--ua <тека>` для файлів з власного вебсайту сервісу, разом із `bron.json`).

Базу даних наповнює **сам сервер** (ніколи не браузер): для домену бренду без вбудованого логотипа (Ukr.net, I.ua, Online.ua,
Entra, Fastmail, Freshdesk, Mollie, Tuya) і для домену відправника організації: спершу запис **BIMI**
(`default._bimi.<домен>`), потім **власний вебсайт** (`<link rel=icon>`, маніфест ≥ 128 px), наостанок `/favicon.ico`; також
домен організації. Лише https, лише публічні адреси (DNS-pinning), ≤ 3 перенаправлень, 5 с, ≤ 256 КБ, SVG очищується; успішно = 30 днів,
невдало = 1 день. Для цього сервер має мати вихід назовні по порту **443** (і DNS). Вимкнути: admin → **Інтеграції** → «Логотипи відправників»
(типово увімкнено; домен тоді бачить лише IP сервера). Адреса безкоштовної поштової служби (gmail.com, ukr.net …) ніколи не отримує
логотип цієї служби як фото відправника.

Фото **людей** (`app.afzender_beeld`, окремо для користувача й простору, адреса лише як HMAC, під власним ключем, якщо сховище ключів
увімкнено) беруться лише з того, що людина сама ввімкнула в Пошта → Налаштування → «Відправники»: власні **контакти Google** (People API,
лише читання; у проєкті Google Cloud також увімкніть People API) і **Gravatar** (типово вимкнено). Сервер: `backend/merk-bron.ts`;
правила: `shared/merk-bron.ts`; тести: `tests/eenheid/merk-bron-20261021.test.ts`, `merk-bron-google-20261021.test.ts`, `merk-officieel-20261021.test.ts`.

## Тунель (Cloudflare) — налаштовано 3 жовт. 2026
Тунель `mijn-ruimte`, ID `a176c08b-29e7-47b0-95d9-9ec9383572f2` (сам ID не є секретом). Усі десять імен хостів є
CNAME-записами на `<ID>.cfargotunnel.com` (створені командою `cloudflared tunnel route dns`; раніше записів не існувало).

На VM:
- `/etc/cloudflared/config.yml` (root, 0644): правила входу (ingress) як у `deploy/cloudflared-config.yml`, із підставленим ID.
- `/etc/cloudflared/<ID>.json` (root:root, 0600): облікові дані тунелю. **Секрет**; не входить у резервну копію застосунку, але зберігається
  (разом із `geheimen.env`) в age-архіві `R:\mijn-ruimte-reservekopie\geheimen\` (див. `HERSTEL.md`).
- `cloudflared.service` із `deploy/cloudflared.service` (замість `cloudflared service install`): працює від імені root, але
  без capabilities, із `ProtectSystem=strict` тощо (`systemd-analyze security`: 1,8 OK). Лише вихідні з'єднання (QUIC/7844);
  ufw без змін. Локально cloudflared слухає лише `127.0.0.1:20241` (метрики).
- `cert.pem` (сертифікат облікового запису від `tunnel login`) після створення й маршрутизації **знищено через shred**. Для додавання нових
  DNS-маршрутів або керування тунелем виконайте `cloudflared tunnel login` заново й після завершення знову видаліть `cert.pem`.

Повторне розгортання (напр. на новій VM), від імені root:
```bash
cloudflared tunnel login                                  # cert.pem у /root/.cloudflared
# отримати облікові дані для наявного тунелю (або: tunnel create + route dns --overwrite-dns)
cloudflared tunnel token --cred-file /etc/cloudflared/<ID>.json mijn-ruimte && chmod 600 /etc/cloudflared/<ID>.json
sed 's/<TUNNEL-ID>/<ID>/g' deploy/cloudflared-config.yml > /etc/cloudflared/config.yml
cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
for h in hub id mail cloud ai github huis api admin dashboard; do cloudflared tunnel route dns mijn-ruimte $h.tarasevych.com; done
install -m 0644 deploy/cloudflared.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now cloudflared
shred -u /root/.cloudflared/cert.pem
```
Рекомендовано в панелі Cloudflare: SSL/TLS **Full**, увімкнути **Always Use HTTPS** (зараз `http://` ще відповідає 200;
HSTS застосунку захищає браузери лише після першого https-відвідування). Після цього в Google Cloud установіть URI перенаправлення на
`https://id.tarasevych.com/…` (`ENV-VARS.md`).

## Пошук «/zoek» (22.10.2026)
Глобальний пошук по інтерфейсу, пошті, вкладеннях, файлах, календарі, дошці та GitHub. Індекс у PostgreSQL (міграції 0100–0104), наповнюється
cron-завданням `zoek-index` (таймер `mijn-ruimte-zoek-index.timer`); OCR опційно через `mijn-ruimte-installeer ocr-talen` (tesseract + poppler-utils).
Документація: `docs/zoek/ZOEKEN.md` (архітектура, індекс, API, ранжування), `docs/zoek/ZOEK-BEHEER.md` (перегляд стану, відновлення, міграції, розгортання,
повернення стану, продуктивність), `docs/zoek/ZOEK-BEVEILIGING.md` (ізоляція), `docs/zoek/ZOEK-UITBREIDEN.md` (нове джерело/тип), `docs/zoek/ZOEK-TESTEN.md`.
Змінні середовища `ZOEK_*`: `ENV-VARS.md`. Індекс є похідними даними: `TRUNCATE app.zoek_objecten` завжди безпечний.

## Перевірка відмальовування (22.10.2026)
HTTP 200 не є доказом того, що сторінка справді відмальовується (реліз 20261021-221718: «Buffer is not defined», кожна адмін-сторінка біла). Після активації
інсталятор відкриває ключові сторінки в headless Chromium на сервері (одноразова копія релізу на окремій базі даних
`mijnruimte_rook_<штамп>`, тестовий власник + технічний профіль) та імпортує кожен бандл; якщо зламано — автоматичний повернення стану до попереднього релізу
(подія `ROOK_TERUGGEDRAAID` на сторінці «Оновлення»). Без браузера виконується лише перевірка модулів у Node, про що чесно повідомляється як «відмальовування не перевірено».
```bash
sudo /usr/local/sbin/mijn-ruimte-installeer browser-controle      # одноразово: chrome-headless-shell (зафіксована версія, SHA-256) у /srv/mijn-ruimte/browser
sudo /usr/local/sbin/mijn-ruimte-installeer rook-controle [--live]  # вручну; «Діагностика» → «Перевірити відмальовування» робить те саме через таймер nazorg
```
Результат: `/var/lib/mijn-ruimte-uitrol-status/rook-controle.json` (і `rook-controle-kapot.json`). Деталі: `RUNBOOK-VEILIGE-UITROL.md` §8a.

## Повернення стану (Terugdraaien)
`deploy/installeer-app.sh terugdraaien` (попередній реліз) або `… terugdraaien 20261003-101500`.
Починаючи з 22.10.2026 інсталятор також автоматично виконує повернення стану, якщо сторінки не відмальовуються (див. «Перевірка відмальовування» вище).
Міграції працюють лише вперед: схема бази даних залишається на найновішому стані. Тому робіть міграції
розширювальними (додавайте стовпці/таблиці, нічого не перейменовуйте й не видаляйте в тому самому релізі).
Якщо налаштовано ролі бази даних: спершу виконайте `deploy/db-rollen-instellen.sh terugdraaien` (прибирає змінні, повертає власність, вимикає FORCE),
і лише ПОТІМ `installeer-app.sh terugdraaien` до релізу, створеного до фази 2. Старіший реліз ігнорує змінні
`DATABASE_URL_*`, але `pg_dump` від імені старої ролі під FORCE RLS більше не працюватиме.

## Отримання резервних копій (pull із хоста)
Сама VM нікуди не виштовхує копії. Хост Windows забирає їх скриптом `deploy/reservekopie-ophalen.ps1` (SSH як `beheer`, учасник групи
`mijnruimte-backup`): найновіша тека з маркером `KLAAR`, лише файли `.age`, перевірка `SHA256SUMS`, у
`R:\mijn-ruimte-reservekopie\vm-back-ups\<штамп>\`. Хост Linux може робити те саме за допомогою rsync:
```bash
rsync -a vm:/srv/backups/mijn-ruimte/ /pad/op/host/mijn-ruimte/
for d in /pad/op/host/mijn-ruimte/2*/; do [ -f "$d/KLAAR" ] && (cd "$d" && sha256sum -c --quiet SHA256SUMS); done
```
Резервні копії зашифровані публічним age-ключем; розшифрувати їх можна лише офлайн-ключем
відновлення. Файл `geheimen.env` (особливо всі `*_KEY_V1` та `RECOVERY_CODE_PEPPER`) туди не входить, а зберігається
в окремому age-архіві: без цих ключів секрети TOTP, токени й записи сховища в дампі бази непридатні до використання.

## Відновлення з резервної копії
Повний покроковий план (розшифрування на ПК, передача відкритого потоку через SSH на VM): `HERSTEL.md`. Коротко, на машині
з ключем відновлення:
```bash
age -d -i herstelsleutel-age.txt -o database.dump database.dump.age
age -d -i herstelsleutel-age.txt uploads.tar.gz.age | tar -xzf - -C /srv/data
systemctl stop mijn-ruimte 'mijn-ruimte-*.timer'
sudo -u postgres dropdb mijnruimte && sudo -u postgres createdb -O mijnruimte mijnruimte
sudo -u postgres pg_restore --no-owner --role=mijnruimte -d mijnruimte database.dump && shred -u database.dump
chown -R mijnruimte:mijnruimte /srv/data/uploads
systemctl start mijn-ruimte 'mijn-ruimte-*.timer'
```
Якщо ролі бази даних були налаштовані, після цього знову запустіть `deploy/db-rollen-instellen.sh instellen` (відновлює власність,
права та FORCE; наявні паролі зберігаються).
