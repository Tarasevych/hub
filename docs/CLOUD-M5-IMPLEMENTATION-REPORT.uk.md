> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./CLOUD-M5-IMPLEMENTATION-REPORT.uk.md) · [🇳🇱 **Nederlandse versie**](./CLOUD-M5-IMPLEMENTATION-REPORT.nl.md) · [🏠 Головна (UK)](../README.md) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [📚 Каталог статей / Index](../docs/INDEX.md)

# Повна інтеграція Хмари M5 — 10-сервісна хвиля, драйверний шар, контроль випуску
**Статус: ЛИШЕ ДЛЯ РОЗРОБКИ / НЕ ВСТАНОВЛЮВАТИ.**
База: копія проєкту `20261027-212158` з послідовними M1–M4. Дата: 28.10.2026.

## 1. Що реально змінилося

Зберегли всі M1–M4 і додали:
- `shared/cloud-m5-catalogus.ts`: каталог **11 типів під'єднань / 10 сервісів** (OneDrive Personal/Business розділені), сімейства API, авторизація, верхня межа можливостей, обмеження й чесний статус готовності. Публічні capabilities у каталозі **НЕ** означають готові інтерфейсні дії.
- `backend/cloud-m5-pcloud.ts`: транспорт `stat/download/upload` до pCloud, із жорстким вибором US/EU API host, bearer лише сервером, відсутністю токена у CDN-запиті, перевіркою відповіді й лімітами 32 MiB.
- `backend/cloud-m5-pcloud-oauth.ts`: серверна логіка OAuth 2.0 `code` потік pCloud: URL погодження, одноразовий стан, перевірка власника/простору, host/locationid, серверний token exchange та передавання отриманого токена до **інтерфейсу зашифрованого сховища** (потрібна реальна реалізація репозиторію). pCloud не повертає стандартний refresh token; код не створює його вигадано.
- `backend/cloud-m5-backblaze.ts`: B2 S3-compatible SigV4 `HEAD/GET/PUT`, endpoint `s3.<region>.backblazeb2.com`, серверні B2 application ключі, захист від overwrite. Без довільних endpoint URL.
- `backend/cloud-m5-github.ts`: GitHub REST Contents `stat/download/create`, обов'язковий перевірений server repo/branch, per-repo access token через broker. Upload — **створення коміту**, не звичайна завантаження. Видалення, MOVE, LFS, великі файли ще не реалізовані.
- `backend/cloud-m5-driver-registry.ts`: реєстрація лише після перевіреного підтвердження від окремого CI/accepted-live verifier, match власник+space+accountId.
- `backend/cloud-m5-governor.ts`: модель рішень власника в активному технічному просторі. Атомарна зміна з audit через repository interface, версії CAS. Не під'єднана до адмін-маршруту до перевірки авторизації.
- `backend/cloud-m5-catalogue-routes.ts`: один staging-only захищений route `POST /api/owner/cloud/integrations/v1/catalogue`; повертає статуси **not-ready** без доказів. Під'єднано лише всередині чинного `ladePoort('cloud')` у `cloud-platform.ts`. Flag `CLOUD_M5_CATALOGUE_STAGING` типово OFF.
- `src/cloud/CloudAanbiedersM5.tsx` + CSS: адаптивна оглядова сторінка підтримки, без дублю CanonicalChrome, без фіктивної кнопки «Під'єднати». Компонент поки не вмонтовано у production nav.
- `shared/cloud-integratie-contract.ts`: назви `pcloud`, `backblaze-b2` для єдиного посилання на файл.
- `scripts/cloud-volledige-uitgave-poort.mjs`: +9 live/CI evidence-блокерів M5. Тепер **45 обов’язково перевірки**, у цьому пакеті `BLOCKED`.
- `tests/eenheid/cloud-m5-aanbieder-golf.test.mjs`: 29 нових offline тестів.

## 2. Перша хвиля провайдерів: реальні можливості API ≠ готовність інтеграції

| Сервіс | Доступ | Код до M5 | Новий код M5 | Блокер реального використання |
|---|---|---|---|---|
| Google Drive | Canonical Google OAuth | Є в поточному проєкті та M1/M2 | Каталог спроможностей | Live E2E, єдині передачі/права |
| OneDrive Personal | Microsoft OAuth PKCE | M2/M4 | Каталог | app registration, scopes, live E2E |
| OneDrive Business | Microsoft OAuth PKCE | M2/M4 | Каталог | tenant policy, live E2E |
| SharePoint | Microsoft Graph, consent | M2/M4 | Каталог | site/drive discovery, tenant consent |
| Dropbox | OAuth PKCE | M2/M4 | Каталог | app registration, team account scopes, E2E |
| Box | OAuth confidential | M3/M4 | Каталог | app registration, collaboration policies, E2E |
| Nextcloud | Login Потік v2 + WebDAV/OCS | WebDAV transport M3 | Каталог | trusted-instance onboarding, SSRF/DNS/egress controls |
| Amazon S3 | IAM/STS SigV4 | M3 | Каталог | secure IAM role onboarding, multipart/resume E2E |
| Backblaze B2 | Bucket-scoped app ключ / S3 compatible | — | SigV4 read/stat/upload | encrypted ключ vault, permissions, live E2E |
| pCloud | OAuth code US/EU | — | OAuth потік + файл transport | real encrypted repository, callback, live E2E |
| GitHub | GitHub App user/install access | GitHub ecosystem separate | Repository-file transport | GitHub App install/user consent, repo selection, permissions, version/commit E2E |

Загалом 10 сервісів, **11 окремих типів конекторів**, оскільки OneDrive Personal і OneDrive Business не можна безпечно ототожнювати.

## 3. Як має бути організовано управління

### Користувач
Окремий власник+простір+ID під'єднання; кожен обліковий запис називається ідентифікованим аліасом. Вибір джерела вкладки не змінює решту вкладок. Список під'єднань завжди серверний. Після відкликання доступу жодна нова фонова передача з цього облікового запису не стартує. Браузер не отримує refresh-токенів чи credential secrets.

### Власник сайту
Каталог провайдерів -> дозволена політика -> перевірка live CI evidence -> enable. Увімкнення НЕ дає можливості обійти per-user OAuth та ACL. Дві окремі опції: нові під'єднання та операції наявних під'єднань. Зміна має аудиторський запис і atomic CAS. У M5 це доменний модуль і тести; admin HTTP endpoint + PG реалізація та атестація ще відсутні.

### Майстер під'єднання
OAuth: «Під'єднати» -> офіційний consent -> server callback -> обліковий запис із дозволами -> перевірка файлів. Під'єднання на основі ключів (S3, B2) **не можна чесно назвати одно-кнопковим OAuth**: потрібне створення least-privileged IAM role/app ключ, а потім перевірка ключа/регіону на сервері. Nextcloud — Login Потік v2 з підтвердженим instance URL; GitHub — GitHub App install + consent, а не довільний PAT. 

## 4. Стан тестування

- `node --experimental-strip-types --test` для M1–M5: **133/133 passed** (offline unit/mock). Тільки mock/logic, не реальні сервісні облікові записи.
- `node scripts/kaart-controle.mjs --stil`: повертає 0 із попередженнями про декілька англомовних назв файлів.
- `node scripts/cloud-volledige-uitgave-poort.mjs`: exit 2, **BLOCKED 45/45** — немає підтверджень live E2E.
- **Не виконано:** повну Node.js 24+ build, DB migrations у staging, багатобраузерні E2E, ліміти/тарифи живих облікових записів, реальний OAuth для кожного провайдера.

## 5. Критичні захисні вимоги перед релізом

1. **M5 transport code поки не реєструється в production registry**, хоча вірогідні мережеві запити реалізовано. Потрібні credential resolvers з PostgreSQL/Vault і owner-space-account identity для кожного провайдера, тести скасованих grants.
2. Nextcloud і всі custom-hosted сховища: захист мережевих адрес, DNS rebinding, private IP, redirect, port. Не достатньо перевірити regex URL на рівні JS — мережевий proxy має обмежити egress.
3. Копіювання: resumable transfer, реальне сховище завдання стан, SHA-256 після download, компенсація часткової копії. MOVE не може активуватися для pCloud/GitHub/B2 без перевіреного conditional видалити або безпечної альтернативи.
4. Багато облікових записів одного провайдера: live two-tab, two-browser, simultaneous personal/business, per-tab selection, disconnected-account завдання cancellation.
5. Збереження shared ACL між провайдерами не гарантується. Потрібен явний conversion/report із відмінностями, а не мовчазне копіювання ACL.
6. Уніфікований переглядач та Cloud UI активуються разом із реальними адаптерами. Demo кнопки і статичні statuses не допускаються на робочій сторінці.
7. Окремий власник admin: дозволені сервісні інструменти, scope-конфігурація, стан OAuth app, webhook, черги, аудит, помилки без секретів; права superadmin + active technical profile.
8. Код і поточний сервер можуть бути різними. Перед інтеграцією потрібне підтвердження exact production release/commit; НЕ збирати реліз на підставі історичного архіву, якщо production вже оновлено.

## 6. Офіційна документація API

- Google Drive v3: https://developers.google.com/workspace/drive/api/reference/rest/v3
- Microsoft Graph Drive: https://learn.microsoft.com/en-us/graph/api/resources/driveitem
- Dropbox: https://www.dropbox.com/developers/documentation/http/documentation
- Box: https://developer.box.com/reference/
- Nextcloud Login Flow/WebDAV: https://docs.nextcloud.com/server/stable/developer_manual/client_apis/
- AWS S3: https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html
- Backblaze S3 compatible: https://www.backblaze.com/apidocs/introduction-to-the-s3-compatible-api
- pCloud OAuth/API: https://docs.pcloud.com/methods/oauth_2.0/authorize.html
- pCloud access token: https://docs.pcloud.com/methods/oauth_2.0/index.html
- GitHub App користувач tokens: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- GitHub repository Contents: https://docs.github.com/en/rest/repos/contents

## 7. Наступні хвилі

Розглядати після першої 10-сервісної хвилі: Wasabi S3, Cloudflare R2, DigitalOcean Spaces (S3), Synology DSM, ownCloud / generic WebDAV, Google Cloud Storage, Azure Blob, iCloud Drive (лише якщо існує прийнятний офіційний API/юридично дозволений механізм). Ніяких «повних» функцій без технічного або юридичного підтвердження API.

**Не створювати `.tar.gz` для оновлення**, доки gate не матиме перевірені CI докази та все не буде об'єднано в один реліз.
