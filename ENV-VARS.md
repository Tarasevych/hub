# Omgevingsvariabelen en geheimen

Alle waarden staan op de VM in **`/etc/mijn-ruimte/geheimen.env`** (`0600 root:root` volstaat: systemd leest het als root; of `root:mijnruimte 0640`),
geladen door systemd (`EnvironmentFile=` in `deploy/mijn-ruimte.service` en de cron-units).
Nooit in git, nooit in de build, nooit in logs. **Genereer ALLE geheimen nieuw**: de oude AppDeploy-waarden
moeten als gelekt worden beschouwd (zie SECURITY-NOTES.md).

Formaat van `geheimen.env`: één `NAAM=waarde` per regel, zonder aanhalingstekens of `export`.

## Verplicht

| Naam | Doel | Genereren / waarde |
|---|---|---|
| `DATABASE_URL` | Postgres-verbinding (database `mijnruimte`, rol `mijnruimte`). | `postgres://mijnruimte:<wachtwoord>@127.0.0.1:5432/mijnruimte`; wachtwoord: `openssl rand -base64 32 \| tr -d '/+='` |
| `OWNER_EMAIL` | E-mailadres van de eigenaar (super-admin). Vervangt het vroeger hardgecodeerde adres. De server start niet zonder. | Het Google-adres van de eigenaar, kleine letters. |
| `TOTP_ENCRYPTION_KEY_V1` | AES-256-GCM-sleutel voor TOTP-geheimen (gebonden aan de gebruikers-id). Zonder sleutel: TOTP-inschrijving geeft 503. | `openssl rand -base64 32` (32 bytes; base64 of 64 hex-tekens) |
| `RECOVERY_CODE_PEPPER` | Geheime pepper (HMAC-SHA256) voor herstelcodes. Min. 32 tekens. Zonder pepper: geen nieuwe herstelcodes (503). | `openssl rand -base64 48` |
| `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1` | Versleutelt opgeslagen Google-grants en refresh tokens. | `openssl rand -base64 32` |
| `OWNER_VAULT_ENCRYPTION_KEY_V1` | Versleutelt items in de API-platform-kluis (admin/api). | `openssl rand -base64 32` |
| `MAIL_TOKEN_ENCRYPTION_KEY_V1` | Versleutelt tokens van mailproviders. Moet exact 32 bytes zijn. | `openssl rand -base64 32` |

> Wissel je een `*_KEY_V1` later, dan kunnen bestaande versleutelde gegevens niet meer worden gelezen.
> Bewaar de sleutels daarom ook in de offline back-up (wachtwoordmanager), los van de databaseback-up.


### Databaserollen (beveiliging fase 2, optioneel)
Worden alleen door `deploy/db-rollen-instellen.sh instellen` geschreven (nooit met de hand nodig). Ontbreekt een
variabele, dan valt de app terug op `DATABASE_URL` en werkt alles zoals vroeger (één rol, RLS-policy's laten alles door).

| Naam | Rol | Gebruikt door |
|---|---|---|
| `DATABASE_URL_MIGRATIE` | `mijnruimte_migrator` (eigenaar schema `app`) | `dist-server/migrate.mjs` (installeer-app.sh) |
| `DATABASE_URL_APP` | `mijnruimte_app` (NOBYPASSRLS, alleen DML op `app.records`) | verzoeken van ingelogde gebruikers (`SET LOCAL app.user_id`) |
| `DATABASE_URL_SYSTEM` | `mijnruimte_system` (BYPASSRLS) | cron, webhooks, aanmelden/sessies, beheerroutes, `backup-maken.sh` |

RLS afdwingen staat in de database (`app.rls_instellingen.afdwingen`), niet in een variabele: de app kan het niet
zelf uitzetten. Schakelen: `db-rollen-instellen.sh rls-aan|rls-uit`.

### Beveiliging fase 2/3: schakelaars (optioneel)

| Naam | Standaard | Doel |
|---|---|---|
| `AUTH_POORT_AFDWINGEN` | uit | `1` = de vangrail in de router antwoordt **401** op elke anonieme 2xx-respons van een route die niet in `PUBLIEKE_ROUTES` staat (`server/platform/auth-poort.ts`). Zonder: alleen loggen (`[auth-poort]`) en tellen in `app.rls_audit` (actie `anoniem-2xx`). Zie `deploy/RUNBOOK-FASE-2-3.md`. |
| `STAP_OP_UIT` | uit | Noodschakelaar: `1` zet de step-up-eis (`STEP_UP_REQUIRED`) voor gevoelige acties uit. Alleen tijdelijk gebruiken, bv. als de frontend de step-up nog niet afhandelt en een beheeractie dringend is. |
| `AUDIT_IP_PEPPER` | `RECOVERY_CODE_PEPPER` | Pepper voor de IP-hash in `app.audit` (`ip_hash`). Wisselen maakt oude en nieuwe hashes onvergelijkbaar (geen gegevensverlies). `openssl rand -base64 48` |
| `ACCOUNT_DEFINITIEF_WISSEN` | uit | `1` = de opruimjob wist accounts **definitief** (inhoud, identiteiten, bestanden; grafsteen zonder persoonsgegevens) zodra de herstelperiode van 30 dagen voorbij is. Zonder: alleen een droog verslag in het cron-log. **Onomkeerbaar** — pas aanzetten na een geslaagde back-up/hersteltest. |

## Google-login en Google Suite (optioneel: zonder deze waarden is Google-login uit)

| Naam | Doel | Genereren / waarde |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` (alias `GOOGLE_SUITE_CLIENT_ID`; staat die er ook, dan wint `GOOGLE_SUITE_CLIENT_ID` — dan moet het dezelfde client zijn) | OAuth-client-ID (publiek). | Google Cloud Console → *Credentials* → nieuwe OAuth-client (type *Web*). Toegestane redirect-URI: **`https://id.tarasevych.com/`** (exact, met slash). |
| `GOOGLE_OAUTH_CLIENT_SECRET` (alias `GOOGLE_SUITE_CLIENT_SECRET` geldt alleen voor de contour-status; **de login zelf leest uitsluitend `GOOGLE_OAUTH_CLIENT_SECRET`**) | OAuth-clientgeheim. | Uit dezelfde client; maak een **nieuwe** client of roteer het geheim. |

Zonder client-ID antwoordt `POST /api/auth/google/start` met **503 `GOOGLE_NOT_CONFIGURED`** (en maakt geen state-rijen).

## Microsoft (Outlook-mail, optioneel)

| Naam | Doel | Genereren / waarde |
|---|---|---|
| `MICROSOFT_GRAPH_CLIENT_ID` / `MICROSOFT_GRAPH_CLIENT_SECRET` / `MICROSOFT_GRAPH_TENANT_ID` | Azure-app voor Microsoft Graph. | Entra ID → *App registrations*. Redirect-URI `https://id.tarasevych.com/`; tenant meestal `common`. |
| `MICROSOFT_GRAPH_WEBHOOK_URL` | Endpoint voor change notifications. | `https://mail.tarasevych.com/api/owner/mail/microsoft/webhook` |
| `MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE` | Gedeeld geheim dat Graph meestuurt. | `openssl rand -hex 32` |

## Gmail-push via Pub/Sub (optioneel)

| Naam | Doel | Genereren / waarde |
|---|---|---|
| `GOOGLE_GMAIL_PUBSUB_TOPIC` | Pub/Sub-topic voor Gmail `watch`. | `projects/<project>/topics/<topic>` |
| `GOOGLE_GMAIL_PUBSUB_AUDIENCE` | Verwachte `aud` van de push-JWT. | `https://mail.tarasevych.com/api/owner/mail/google/pubsub/push` |
| `GOOGLE_GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL` | Serviceaccount dat de push ondertekent. | Uit de Pub/Sub-subscription. |

## Overig (optioneel)

| Naam | Doel | Genereren / waarde |
|---|---|---|
| `SCIM_BEARER_TOKEN` | Inkomende SCIM-provisioning. Leeg = uit. | `openssl rand -base64 48` |

## Runtime (geen geheimen; standaardwaarden zijn goed voor productie)

| Naam | Standaard | Doel |
|---|---|---|
| `HOST` | `127.0.0.1` | Luisteradres. **Niet** wijzigen: publiek verkeer komt alleen via cloudflared. |
| `PORT` | `8080` | Poort; moet gelijk zijn aan `deploy/cloudflared-config.yml`. |
| `DIST_DIR` | `<release>/dist` | Gebouwde frontend. |
| `DASHBOARD_DIR` | `/srv/mijn-ruimte/dashboard` | Statisch dashboard voor `dashboard.tarasevych.com`. |
| `UPLOADS_DIR` | `/srv/data/uploads` | Bestandsopslag (enige schrijfbare map voor de dienst). |
| `MAX_BODY_BYTES` | `12582912` (12 MiB) | Maximale requestgrootte. |
| `PG_POOL_MAX` | `10` | Maximaal aantal Postgres-verbindingen. |
| `MIGRATIONS_DIR` | `<release>/migrations` | Map met SQL-migraties. |
| `API_RATE_LIMIT_PER_MIN` | `600` | Algemene limiet per IP per minuut voor `/api/*` (in het geheugen). Strengere limieten voor login/MFA/handoff staan vast in `server/start.ts`. |
| `NODE_ENV` | `production` | Gezet in de systemd-unit. |

## Alleen bij het bouwen

| Naam | Doel |
|---|---|
| `SOURCEMAP` | `1` = sourcemaps bouwen (alleen lokaal debuggen; de server serveert `*.map` nooit). |

## Snel alles genereren (op de VM, als root)

Bestaat `geheimen.env` al (met `DATABASE_URL`), gebruik dan `deploy/geheimen-aanvullen.sh --eigenaar <e-mailadres>`:
dat voegt alleen ontbrekende sleutels toe en toont geen waarden. Voor een volledig nieuw bestand:

```bash
install -d -m 0750 -o root -g mijnruimte /etc/mijn-ruimte
umask 027
cat > /etc/mijn-ruimte/geheimen.env <<EOT
DATABASE_URL=postgres://mijnruimte:$(openssl rand -base64 32 | tr -d '/+=')@127.0.0.1:5432/mijnruimte
OWNER_EMAIL=<eigenaar@gmail.com>
TOTP_ENCRYPTION_KEY_V1=$(openssl rand -base64 32)
RECOVERY_CODE_PEPPER=$(openssl rand -base64 48 | tr -d '\n')
GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1=$(openssl rand -base64 32)
OWNER_VAULT_ENCRYPTION_KEY_V1=$(openssl rand -base64 32)
MAIL_TOKEN_ENCRYPTION_KEY_V1=$(openssl rand -base64 32)
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
EOT
chown root:mijnruimte /etc/mijn-ruimte/geheimen.env && chmod 0640 /etc/mijn-ruimte/geheimen.env
```
(Het databasewachtwoord daarna ook instellen met `ALTER ROLE mijnruimte PASSWORD '…'`.)

## Ook intrekken of roteren (oude AppDeploy-omgeving)
- Elk `tsv_`-API-token en elk kluisitem (Home Assistant, Telegram-bot, GitHub-PAT, webhooks).
- Alle eigenaarssessies (revocation-epoch verhogen) en alle opgeslagen Google-/Microsoft-refresh tokens (ontkoppelen en opnieuw koppelen).
- AppDeploy-accountgegevens en API-sleutels.
- Wachtwoorden en TOTP van alle gebruikers (oude TOTP-geheimen stonden leesbaar in de database).
