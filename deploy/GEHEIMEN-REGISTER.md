# Реєстр секретів «Mijn Ruimte» / Geheimenregister — ШАБЛОН

> **Тут немає жодного значення — і не має бути.** Значення живуть лише на вашому сервері (`/etc/mijn-ruimte/geheimen.env`,
> зашифроване сховище в базі) і в вашому менеджері паролів. Цей файл — карта: що є, для чого, де лежить, який у нього
> відбиток і коли його створили. Відбиток (SHA-256 значення, перші 8 hex) дозволяє звірити «той самий ключ чи ні», не
> показуючи ключ.
>
> **Geen enkele waarde staat hier — en dat hoort zo.** Waarden leven alleen op uw server en in uw wachtwoordmanager. Dit is
> de kaart: wat er is, waarvoor, waar, met welke vingerafdruk en sinds wanneer.

## Як отримати актуальний реєстр / Zo maakt u het actuele register

На сервері, від робочого користувача (напр. `beheer`), один раз після кожної зміни секретів:

```bash
sudo /usr/local/sbin/mijn-ruimte-installeer geheimen-register --uit /etc/mijn-ruimte/GEHEIMEN-REGISTER.md
sudo cat /etc/mijn-ruimte/GEHEIMEN-REGISTER.md      # перегляд; файл root 0600
```

Без `--uit` реєстр друкується в термінал. Скрипт: `deploy/geheimen-register.sh`. Дати беруться з `geheimen.journaal`
(який ведуть `mijn-ruimte-installeer geheimen` і `… oauth-client`); для старіших записів — дата файлу `geheimen.env` з
позначкою «(bestand)».

Відсутні ключі створити (наявні не змінюються): `sudo /usr/local/sbin/mijn-ruimte-installeer geheimen`.
Цей самий крок виконується автоматично на початку кожного `mijn-ruimte-installeer installeren`.

## Що буде в таблиці / Wat in de tabel staat

| Назва / Naam | Призначення / Doel | Де / Waar | Відбиток / Vingerafdruk | Дата / Datum | Хто ротує / Wie roteert |
|---|---|---|---|---|---|
| `AUDIT_IP_PEPPER` | pepper IP-хешів журналу аудиту | geheimen.env | `xxxxxxxx` | 2026-… | `mijn-ruimte-installeer geheimen` (нова = старі хеші непорівнянні) |
| `RECOVERY_CODE_PEPPER` | pepper кодів відновлення | geheimen.env | `xxxxxxxx` | 2026-… | не ротувати без нових кодів для всіх |
| `TOTP_ENCRYPTION_KEY_V1` | AES-256 для TOTP (і резерв для GitHub/агентів/архіву) | geheimen.env | `xxxxxxxx` | 2026-… | не ротувати |
| `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1` | AES-256 для Google-токенів | geheimen.env | `xxxxxxxx` | 2026-… | не ротувати |
| `OWNER_VAULT_ENCRYPTION_KEY_V1` | AES-256 сховища секретів | geheimen.env | `xxxxxxxx` | 2026-… | не ротувати |
| `MAIL_TOKEN_ENCRYPTION_KEY_V1` | AES-256 токенів поштових провайдерів | geheimen.env | `xxxxxxxx` | 2026-… | не ротувати |
| `MAIL_APP_WACHTWOORD_SLEUTEL_V1` | AES-256 паролів застосунку IMAP/SMTP (iCloud, Ukr.net, Yahoo, I.ua) | geheimen.env | `xxxxxxxx` | 2026-… | не ротувати (інакше — перепідключення пошти) |
| `AGENDA_ABONNEMENT_SLEUTEL_V1` | AES-256 паролів CalDAV | geheimen.env | `xxxxxxxx` | 2026-… | не ротувати |
| `GITHUB_KOPPELING_SLEUTEL_V1` | AES-256 токенів GitHub (необов’язковий; без нього — TOTP-ключ) | geheimen.env | `xxxxxxxx` | 2026-… | не ротувати |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID Google (публічний) | geheimen.env **або** сховище (doel `google`) | публічне | 2026-… | Google Cloud Console → Credentials |
| `GOOGLE_OAUTH_CLIENT_SECRET` | client secret Google | geheimen.env **або** сховище | `xxxxxxxx` | 2026-… | Console → Reset secret → `mijn-ruimte-installeer oauth-client google` або Майстер |
| `MICROSOFT_GRAPH_CLIENT_ID` / `…_TENANT_ID` | Entra Application (client) ID, tenant | geheimen.env | публічне | 2026-… | Entra → App registrations |
| `MICROSOFT_GRAPH_CLIENT_SECRET` | client secret Entra (**термін ≤ 24 міс.** — занотуйте дату!) | geheimen.env | `xxxxxxxx` | 2026-… | Entra → Certificates & secrets → `… oauth-client microsoft` |
| `MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE` | спільний секрет вебхука Graph | geheimen.env | `xxxxxxxx` | 2026-… | `mijn-ruimte-installeer geheimen` |
| `DATABASE_URL_APP` / `DATABASE_URL_SYSTEM` / `DATABASE_URL_MIGRATIE` | паролі ролей PostgreSQL | geheimen.env / migratie.env | `xxxxxxxx` | 2026-… | `db-rollen-instellen.sh` |
| `SCIM_BEARER_TOKEN` | вхідний SCIM | geheimen.env | `xxxxxxxx` або порожнє | 2026-… | вручну + у каталозі |

### Сховище секретів власника (не env) / Geheimenkluis (niet env)

Записи сховища — GitHub OAuth-застосунок (`github-oauth`), GitHub App (`github-app`), Google-клієнт (`google`), Telegram,
Anthropic, Home Assistant… — мають власний перелік **Адміністрування → «Секрети й ключі»** (назви, дати, терміни, без
значень). Їх вводять лише через сайт із passkey/TOTP; у цьому файлі їх не дублюють.

### Де зберігати цей файл / Waar dit bestand hoort

- Поруч із самими значеннями у менеджері паролів власника (окремий запис «Mijn Ruimte — реєстр»).
- У зашифрованій резервній копії секретів (`deploy/HERSTEL.md`), окремо від копії бази.
- **Не** в git, **не** в чаті, **не** в тикетах.

### Правило / Regel

Жоден секрет не проходить через чат, файли від ШІ чи інструкції: він генерується на сервері (`openssl rand`) або в консолі
провайдера й одразу лягає на сервер (прихований ввід). ШІ-помічник бачить лише назви й відбитки.
