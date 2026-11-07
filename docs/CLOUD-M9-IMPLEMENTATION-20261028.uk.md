# Cloud Full Integration M9 — каталоги S3/DAV та безпечні великі завантаження

**Основа:** ізольована копія `cloud-full-integration-m8`, що походить від `mijn-ruimte-20261027-212158`. Це DEVELOPMENT ONLY, не production. Поточний стан робочого сервера після цього архіву не перевірений.

## Що справді створено

1. `backend/cloud-m9-xml.ts` — вузький структурний XML-аналізатор для метаданих з лімітами 1 MiB, 3000 вузлів, 24 рівні глибини, забороною DTD/ENTITY/CDATA/PI. Читає DAV multistatus та S3 XML за QName і URI namespace. **Не замінює загальнопризначений повний XML-аналізатор**; потрібен незалежний огляд та provider-fixtures.
2. `backend/cloud-m9-directory.ts` — `NextcloudDirectory`, `S3CompatibleDirectory('s3')`, `S3CompatibleDirectory('backblaze-b2')`; серверні перевірені резолвери облікових записів; WebDAV PROPFIND Depth:1; AWS S3 ListObjectsV2 з SigV4 і B2 S3-compatible subset; `encoding-type=url`; відокремлені курсори S3; обмеження на розмір, DNS/SSRF для Nextcloud через зовнішню політику й захищену мережеву конфігурацію; `redirect:'error'`.
3. `backend/cloud-m9-directory-composition.ts` — фабрика для 11 типів каталогів із явним інжектуванням токенів, регіонів, облікових записів і egress policy. Ця фабрика не додає автоматично маршрути у production. Для роботи потрібен чинний M8 coordinator + M4/M6 авторизація та перевірені облікові записи.
4. `backend/cloud-m9-upload-sessions.ts` — контрольована передача одного блока за раз Microsoft Graph і Dropbox; точний `Content-Range` / Dropbox offset; запити не надсилають Graph access token на upload session URL; стан `uploaded_not_verified` після кінцевого коміту, не «успіх»; невизначений мережевий результат вимагає перевірки.
5. `backend/cloud-m9-checkpoints-pg.ts` і `migrations/0122_cloud_m9_upload_checkpoints.sql` — зашифровані на сервері session capabilities, атомарний CAS по попередньому offset + owner/space/account/provider/source revision/lease, карантин прострочених оренд. Не запускати міграцію в production без перевірки ролей і сумісності зі схемою.
6. Усунено нестабільність тестів M7 та M8: змінювання останнього символу base64url могло не змінити декодований байт. Зміна першого символу дає детерміновану перевірку пошкодження.
7. Скрипт `scripts/cloud-full-release-gate.mjs` розширено з 73 до **84** live-критеріїв, статус продовжує `BLOCKED`.

## Результат

- `node --test tests/eenheid/cloud-*test.mjs`: **228 PASS / 0 FAIL**, модульні mock-тести.
- `node scripts/kaart-controle.mjs --stil`: exit 0 (зберігаються історичні warnings).
- `node scripts/cloud-full-release-gate.mjs`: exit 2 `BLOCKED`, 84/84 непідтверджено.
- TypeScript transpile нових модулів — проходить; **не є повним tsc typecheck**.
- Немає live OAuth, реальних API E2E, повного Node24 build, staging migration, security audit.

## Межі безпеки та відкриті задачі

- Сервер може технічно мати доступ до OAuth-токенів і нативних незашифрованих файлів. AES-256-GCM шифрування upload capability у PostgreSQL не є гарантією захисту від адміністратора з контролем сервера. Для приватного Vault потрібні незалежний клієнт, перевірка походження коду, окрема модель відновлення ключів.
- Наступний етап має додати контрольовану перезвірку `nextExpectedRanges` та Dropbox offset із провайдерами після переривання, а не відновлюватися навмання. Прострочені lease нині лише карантинуються.
- Фоновий worker, який створює upload sessions, читає великі файли потоково та зв'язує M9 з M4 account grants, ще **не під'єднаний**. М9 — стадійне ядро, не live файловий рушій.
- Кінцевий `uploaded_not_verified` має пройти незалежний read-back/checksum і лише після цього може перейти до verified copy; оригінал не видаляти без умовного delete із підтвердженим revision.
- Нативний `NextcloudTransport.stat` старого M3 використовує розбір WebDAV-XML регулярними виразами. Його необхідно перенести на перевірений XML-модуль до live-випуску. **Наявність M9-directory не усуває цей борг автоматично.**
- Довільні Nextcloud сервери потребують реального DNS rebind/SSRF firewall на рівні мережі, не лише URL-перевірку.
- S3 pseudo-folders, B2 application-key restrictions, права SharePoint tenant та GitHub repositories мають залишатися provider-aware: не обіцяти недоступний функціонал.
- Повне мапування ACL, версій, спільного доступу, великих файлів для всіх 11 типів, multi-tab/browser sync і UI E2E ще не закрито. Публічний Cloud не активувати.

## Публічні протокольні джерела

- AWS S3 ListObjectsV2: https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html
- Backblaze B2 S3 subset: https://www.backblaze.com/apidocs/introduction-to-the-s3-compatible-api
- Nextcloud WebDAV: https://docs.nextcloud.com/server/latest/developer_manual/client_apis/WebDAV/index.html
- Microsoft Graph upload sessions: https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0
- Dropbox session append: https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload-session-append-v-2
- Dropbox session finish: https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload-session-finish

## Рекомендоване продовження (M10)

1. На окремому staging з Node.js 24+ та тестовою PostgreSQL провести всі міграції M1–M9, rollback та повний `npm ci; npm run typecheck:server; npm run build`.
2. Замінити M3 DAV regex-stat на структурний parser і виконати provider fixtures.
3. Під'єднати PostgreSQL session checkpoint до trust-scoped worker, encrypted session bootstrap, throttling/rate limits, retry policy та recovery reconciliation.
4. Авторизувати два різні облікові записи одного провайдера й провести реальні COPY з read-back SHA-256 та revocation під час передачі; підтвердити move-конфлікти.
5. Перевірити обмін між браузерами, вкладками і пристроями, роль технічного профілю і нуль витоків між користувачами.
6. Зовнішній крипто- й безпековий аудит. Лише після нього дозволити кандидат на один повний Cloud-реліз.
