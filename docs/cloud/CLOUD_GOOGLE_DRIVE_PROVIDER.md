> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./CLOUD_GOOGLE_DRIVE_PROVIDER.uk.md) · [🇳🇱 **Nederlandse versie**](./CLOUD_GOOGLE_DRIVE_PROVIDER.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Провайдер Cloud Google Drive — інтеграція B+ grant

Google Drive використовує `https://www.googleapis.com/auth/drive` — повний обмежений (restricted) область дії Google Drive. Базова платформа провайдера запитує можливості читання, створення, оновлення, видалення та керування дозволами, але на цій контрольній точці (checkpoint) не виконує автоматичного видалення, перезапису, індексації, обробки Зміни API чи фонової синхронізації.

## Модель облікових записів

Drive є частиною спільної архітектури `provider-principal`. Google-ідентичність, що збігається з обліковим записом входу в систему, є основним суб'єктом (`primary principal`) і підключається на другому кроці плану Suite. Інші облікові записи Drive є явними додатковими суб'єктами (`additional principals`) і залишаються поза межами основної послідовності. Вибір активного Drive ізольований у межах власника (`owner-scoped`) і не залежить від сесії ідентичності екосистеми.

## Модель токенів B+

Drive більше не володіє окремим сховищем refresh-токенів або окремим клієнтом OAuth. Один канонічний зашифрований дозвіл (grant) зберігається для кожного суб'єкта провайдера Google у таблиці `google_oauth_grant_v1` і використовує спільне посилання на клієнта `google_suite_web_oauth_client`.

`google_drive_token` — це логічний дескриптор (handle) у `provider_service_tokens_v1`:

```text
google_drive_token
→ oauthGrantId
→ requiredScopes = [https://www.googleapis.com/auth/drive]
```

Перед оновленням токена або викликом API бекенд вимагає виконання умови `requiredScopes ⊆ grantedScopes`. Access-токени є ефемерними й ніколи не зберігаються на диску.

Необхідні секрети AppDeploy:

- `GOOGLE_SUITE_CLIENT_ID`
- `GOOGLE_SUITE_CLIENT_SECRET`
- `GOOGLE_SUITE_REDIRECT_URI` — точно `https://id.tarasevych.com/`
- `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1`

## Таблиці

- `provider_principals_v1`
- `google_oauth_grant_v1`
- `provider_service_tokens_v1`
- `provider_service_grants_v1`
- `google_suite_oauth_states_v1`
- `cloud_provider_accounts_v1`
- `cloud_provider_selections_v1`
- `cloud_audit_v1`

Таблиця `cloud_provider_tokens_v1` підтримується лише для сумісності зі спадщиною (legacy-only). Відповідна застаріла копія refresh-токена Drive видаляється після успішного збереження канонічного дозволу.

## Семантика згоди та відключення

Надання згоди для основного Drive вимагає проходження кожного попереднього кроку Suite. Підключення додаткових облікових записів Drive залишається явним і створює окремий дозвіл суб'єкта (`principal grant`). Невідповідний обліковий запис Google не може непомітно стати основним.

Відключення деактивує лише дескриптор Drive та обліковий запис Drive. Якщо Mail, Calendar або Photos все ще залежать від того самого дозволу суб'єкта, відкликання на рівні Google не здійснюється. Коли Drive є останнім активним дескриптором для цього суб'єкта, виконується спроба відкликання за принципом `best-effort`, а канонічний дозвіл позначається як відкликаний (`revoked`). Локальні копії зберігаються.

## Межі контрольної точки (Checkpoint boundary)

Включено: інкрементальна згода спільного клієнта, PKCE S256, один зашифрований дозвіл суб'єкта, логічний дескриптор Drive, основні/додаткові облікові записи, вибір активного облікового запису, аудит та явне відключення.

Не активно: початковий перелік файлів, Зміни API, воркери, автоматичні зміни файлів, розв'язання конфліктів, спільний доступ (sharing), OneDrive, Dropbox, міграція середовища виконання Mail, середовище виконання Calendar або Photos.
