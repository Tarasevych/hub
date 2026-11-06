> 🌐 **Мова / Taal:** **🇺🇦 Українська** ([оригінал](./GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR.md)) · [🇳🇱 **Nederlandse versie**](./GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей](../../docs/INDEX.md)

# Оркестратор підключення основного облікового запису Google Suite — B+

## Обсяг

Основна ідентичність Google підключається через один проєкт Google Cloud та один клієнт Web OAuth. Надання згоди залишається контекстним і послідовним:

1. Mail
2. Drive
3. Calendar
4. Photos

Кожен крок є явним інкрементальним запитом авторизації. Ця послідовність не активує міграцію Mail, індексацію/Changes/воркери Drive, імпорт Calendar або імпорт Photos.

## Канонічна модель дозволів (Canonical grant model)

Таблиця `google_oauth_grant_v1` зберігає рівно один зашифрований refresh-токен на кожного суб'єкта провайдера Google (`provider principal`):

- `principalId`
- `providerAccountId`
- `clientRef = google_suite_web_oauth_client`
- конверт AES-256-GCM
- сукупні надані області доступу `grantedScopes`
- `grantStatus`
- `issuedAt`
- `lastVerifiedAt`

Refresh-токен ніколи не копіюється в рядки окремих сервісів. Access-токени оновлюються за запитом і ніколи не зберігаються на диску.

## Логічні дескриптори сервісів (Logical service handles)

Таблиця `provider_service_tokens_v1` містить лише логічні дескриптори:

- `google_mail_token`
- `google_drive_token`
- `google_calendar_token`
- `google_photos_token`

Кожен дескриптор вказує на `oauthGrantId`, зберігає власні `requiredScopes`, статус, часові мітки та стан відкликання і не містить шифротексту. Перед викликом API бекенд примусово перевіряє умову:

```text
requiredScopes ⊆ grantedScopes
```

Таблиця `provider_service_grants_v1` залишається специфічною для сервісу межею життєвого циклу та аудиту.

## Ізоляція суб'єктів та облікових записів

Google-ідентичність, що збігається з обліковим записом входу в екосистему, є основним суб'єктом провайдера (`primary provider principal`). Додаткові облікові записи Drive залишаються явними та поза межами основної послідовності. Кожна додаткова ідентичність Google отримує власного суб'єкта провайдера та власний канонічний рядок у `google_oauth_grant_v1`, повторно використовуючи ту саму конфігурацію Web OAuth Client.

Відключення одного дескриптора Drive не відкликає спільний основний дозвіл Google, доки активний інший сервісний дескриптор. Спроба відкликання на боці провайдера виконується лише тоді, коли жоден інший активний дескриптор не залежить від цього дозволу суб'єкта.

## Постійні таблиці

- `provider_principals_v1`
- `google_oauth_grant_v1`
- `provider_service_tokens_v1` — лише логічні дескриптори
- `provider_service_grants_v1`
- `google_suite_oauth_states_v1`
- `google_suite_onboarding_v1`
- `cloud_provider_accounts_v1`
- `cloud_provider_selections_v1`

Застарілі копії refresh-токенів у `provider_service_tokens_v1` або `cloud_provider_tokens_v1` видаляються лише після успішного запису канонічного дозволу.

## Правила OAuth і токенів

- одне посилання на клієнта: `google_suite_web_oauth_client`;
- `access_type=offline`;
- `include_granted_scopes=true`;
- PKCE S256;
- точний редирект у корінь Identity;
- явна згода для кожного нового набору областей доступу сервісу;
- точний збіг основної електронної пошти;
- захищений від повторного відтворення (replay-safe) адресований стан та оренда обробки (processing lease);
- жодного збереження access-токенів;
- жодного дублювання refresh-токенів.

## Секрети AppDeploy

- `GOOGLE_SUITE_CLIENT_ID`
- `GOOGLE_SUITE_CLIENT_SECRET`
- `GOOGLE_SUITE_REDIRECT_URI` — точно `https://id.tarasevych.com/`
- `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1`

Відсутня або некоректна спільна конфігурація вимикає кожен крок надання згоди Suite та все підключення додаткових облікових записів Drive. Інтерфейс користувача залишається в безпечному закритому стані (`fail-closed`) і не заявляє про наявність підключення.
