> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./CLOUD-FULL-INTEGRATION-M1.uk.md) · [🇳🇱 **Nederlandse versie**](./CLOUD-FULL-INTEGRATION-M1.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Cloud Full Integration · M1 (розробка, НЕ реліз)

**Дата:** 2026-10-28. **База:** `mijn-ruimte-20261027-212158.tar.gz` — *інтеграційний кандидат*, НЕ доказ встановлення. Встановлена версія може відрізнятися. **Release gate:** `BLOCKED_PENDING_FULL_PROVIDER_ACCEPTANCE`. Цей документ доповнює `CLOUD-RELEASE-CONTRACT-FULL-INTEGRATION-20261028.uk.md`.

## Що написано в коді

- `shared/cloud-integratie-contract.ts`: стабільні ідентифікатори файлів/просторів/акаунтів, 16 дій, типи результатів (`native`, `gateway`, `needs-consent`, `forbidden`, `unavailable`, `temporarily-unavailable`), правила доступності, whitelist чинного Cloud-native 6 MiB та fail-closed план операції.
- `shared/cloud-aanbieder-register.ts`: строгий реєстр адаптерів провайдерів; не дозволяє двічі реєструвати provider та не читає між різними просторами.
- `backend/cloud-integratie-google.ts`: актуальний Google Drive `files.get` через наявний B+ grant та наявний snapshot акаунтів; токен не повертається користувачеві; metadata ACL береться з Google під час кожного запиту; timeout 12 s, без несанкціонованих редиректів.
- `backend/cloud-integratie-register.ts`: справді підключено лише Google Drive для live inspection; інших адаптерів не фальсифіковано.
- `backend/cloud-integratie-routes.ts`: нові **read-only** POST маршрути `status`, `google/file/capabilities`, `transfer/plan`.
- `backend/cloud-platform.ts`: мінімальна інтеграція маршрутів у **вже існуючий** `ladePoort('cloud', authorize, ...)`.
- `tests/eenheid/cloud-integratie-contract.test.ts`: автоматичні перевірки політик, помилкових дозволів, ізоляції, MOVE, MIME, 6 MiB.

**Жодної зміни** у `package.json`, OAuth, міграціях, Identity, UI, CanonicalChrome, SSH, розгортанні, платіжних функціях. Новий Cloud UI **не активовано**.

## Чого НЕ реалізовано (не можна називати готовим)

1. Працюючі OAuth-конектори OneDrive, SharePoint, Dropbox, Nextcloud, Box, S3 і GitHub у Cloud; корпоративні політики й tenant-consent.
2. Повний Cloud-native файловий драйвер: чинний Quick Capture має обмеження **6 MiB** і не еквівалентний повноцінному сховищу.
3. Потоковий worker передачі між провайдерами, довговічні transfer jobs, дедуплікація й ідемпотентність, delete-after-verify.
4. Нативний/gateway sharing та безпекове доведення isolation/ACL/revocation.
5. Universal File Workspace як фактичний єдиний редактор/переглядач для всіх джерел; preview у єдиному API навмисно **disabled**.
6. Реальна перевірка в авторизованому Google account, production Node24 build, provider E2E. Нові API маршрути не тестувалися через справжню сесію; unit-тести перевіряють лише чисту логіку.

## Наявні серверні маршрути (НЕ фронтенд)

```text
POST /api/owner/cloud/integrations/v1/status
POST /api/owner/cloud/integrations/v1/google/file/capabilities
  body: { "accountId": "<connected-account-id>", "fileId": "<google-drive-file-id>", "tabContext": "<existing-session-context>" }
POST /api/owner/cloud/integrations/v1/transfer/plan
  body: {
    "mode": "copy",
    "source": { "provider": "google-drive", "accountId": "...", "fileId": "...", "space": "prive" },
    "target": { "provider": "cloud-native", "accountId": "own", "space": "prive" },
    "tabContext": "<existing-session-context>"
  }
```

Третій маршрут завжди повертає `decision: blocked` і причину `TRANSFER_EXECUTOR_NOT_READY`, навіть якщо всі вхідні права правильні. **POST виконання передачі не існує**. Це свідома вимога безпеки, а не готовий бізнес-сценарій. Клієнт не має відображати кнопку «Перенести» як активну.

## Наступний етап M2

1. Звірити копію з актуальним deployed Git SHA / архівом. `Tarasevych/hub` у доступній гілці `voornaamst` не містить `package.json`; GitHub-commit `bdb63c9d...` в ньому не знайдений. Не форсувати merge в цей репозиторій без підтвердження джерела істини.
2. Узгодити атомарний процес життєвого циклу переносів у PostgreSQL: `plan → authorize → stream → verify → commit`, `idempotency` з унікальним індексом і повторним ACL при кожній зміні. План повинен зберігати owner + space + provider/account/resource + etag, без токенів.
3. Підключити Google → власний Cloud лише після усунення 6 MiB/форматного обмеження або чіткого спеціального bounded flow. Спочатку COPY. MOVE — лише після підтвердження copy і delete-after-verify.
4. Додати уніфіковані адаптери і contract-тести Microsoft Graph (Personal/Business/SharePoint), Dropbox, Nextcloud/WebDAV+OCS, Box. Кожен з власною моделлю OAuth/ACL/pagination/resumable upload/rate limits.
5. Реалізувати isolated QA fixture для permission negative-tests. Перенести наявний Mail/Drive document viewer у спільне ядро без регресій.
6. Після затвердження всіх заявлених провайдерів — впровадити `/overzicht` та інтегроване UI, прогнати повні e2e, staging та rollback; сформувати єдиний новий UITROL-VERSIE.

## Перевірки локально

```bash
node --experimental-strip-types --test tests/eenheid/cloud-integratie-contract.test.ts
# На машині Node24+ із залежностями:
npm ci
npm run typecheck:server
npm run build
```

У sandbox поточного сеансу: Node 22.16.0, npm ci не завершився; реального Google API consent test нема. **Не розгортати в production** до повної перевірки.
