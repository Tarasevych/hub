# Push-синхронізація Gmail через Google Cloud Pub/Sub

Стан на 07.10.2026: код push **є** (`backend/index.ts`: `mailGoogleWatch`, `mailGooglePush`, перевірка підпису JWT, маршрут
`POST /api/owner/mail/google/pubsub/push`), але на сервері **не налаштовано** три секрети, тому система працює на запасному варіанті
(історія Gmail + перевірка кожні 15 хвилин, cron `mail-provider-maintenance`). Для акаунта з новим дозволом
(`google_oauth_grant_v1`) push тепер вмикається автоматично, щойно секрети з'являться (`mailPushConfigured()`); до того нічого не змінюється.

Усе в Google Cloud Console виконує власник (потрібен ваш акаунт Google; пароль чи токени мені не передавайте).

## 1. Увімкнути API
У проєкті, де створений OAuth-клієнт `google_suite_web_oauth_client`: **APIs & Services → Library**: увімкніть **Gmail API** і **Cloud Pub/Sub API**.
Перевірте OAuth-згоду: scope `https://www.googleapis.com/auth/gmail.modify` (покриває читання, архів, чернетки і watch), `gmail.send`, `gmail.labels`.
Повний доступ `https://mail.google.com/` **не потрібен** і не рекомендований (ширший за потреби).

## 2. Тема Pub/Sub
Pub/Sub → **Topics → Create topic**: наприклад `gmail-push`. Повне ім'я: `projects/<PROJECT_ID>/topics/gmail-push`.
Дайте Gmail право публікувати: у темі **Permissions → Add principal** `gmail-api-push@system.gserviceaccount.com`, роль **Pub/Sub Publisher**.

## 3. Push-підписка
Pub/Sub → **Subscriptions → Create**: тема `gmail-push`, **Delivery type = Push**, endpoint:
`https://mail.tarasevych.com/api/owner/mail/google/pubsub/push`.
Увімкніть **Authentication** (OIDC-токен): виберіть/створіть service account (наприклад `gmail-push-sender@<PROJECT_ID>.iam.gserviceaccount.com`),
**Audience** = точно `https://mail.tarasevych.com/api/owner/mail/google/pubsub/push`.
Google потребує, щоб service account мав роль **Service Account Token Creator** для сервісного агента Pub/Sub (Console підкаже).

## 4. Секрети на сервері
Додайте в `/etc/mijn-ruimte/geheimen.env` (скрипт `deploy/geheimen-aanvullen.sh`, значення вводите самі):

```
GOOGLE_GMAIL_PUBSUB_TOPIC=projects/<PROJECT_ID>/topics/gmail-push
GOOGLE_GMAIL_PUBSUB_AUDIENCE=https://mail.tarasevych.com/api/owner/mail/google/pubsub/push
GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL=gmail-push-sender@<PROJECT_ID>.iam.gserviceaccount.com
```

Потім `sudo systemctl restart mijn-ruimte`. Cloudflare не повинен блокувати запити Google на цей шлях (WAF/Bot Fight: правило Skip для `/api/owner/mail/google/pubsub/push`).

## 5. Перевірка
- За 5 хвилин cron створить завдання `provider.watch.renew`; у `app.records` (`tbl='mail_subscriptions_v2'`) з'явиться запис `status=active` з `expiresAt` (watch діє 7 днів, оновлюється кожні 12 годин до кінця).
- Надішліть собі лист: у журналі `journalctl -u mijn-ruimte` має бути `POST mail.tarasevych.com /api/owner/mail/google/pubsub/push 200`, а синхронізація піде за секунди, не за 15 хвилин.
- Запасний варіант (кожні 15 хв) лишається працювати як страховка.

## Що я НЕ перевіряв
Справжній push від Google (потребує кроків 1–4 у вашому Google Cloud). Перевірено лише, що без конфігурації нічого не змінюється і синхронізація працює (див. `deploy/MAIL-AUDIT-20261007.md`).
