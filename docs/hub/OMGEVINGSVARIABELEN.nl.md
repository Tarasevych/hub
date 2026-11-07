> 🌐 **Taal / Мова:** [Українська](ЗМІННІ-СЕРЕДОВИЩА-ЦЕНТРУ.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)
> 🧭 **Hub-secties (`docs/hub/`):** [1. Architectuur](./ARCHITECTUUR.nl.md) · [2. Geschiedenis](./GESCHIEDENIS.nl.md) · [3. Takken, PR's & Releases](./TAKKEN-EN-SAMENVOEGVERZOEKEN.nl.md) · [4. Mapstructuur](./MAP-STRUCTUUR.nl.md) · [5. Omgevingsvariabelen](./OMGEVINGSVARIABELEN.nl.md) · [6. Orchestratie & Uitrol](./ORCHESTRATIE-EN-UITROL.nl.md)

# Overzicht van Omgevingsvariabelen en Encryptiesleutels (`ENV-VARS`)

Alle geheimen op de productie-VM van het platform "Mijn Ruimte / Мій простір" worden uitsluitend opgeslagen in het bestand **`/etc/mijn-ruimte/geheimen.env`** (rechten `0600 root:root` of `0640 root:mijnruimte`), dat wordt ingeladen via `EnvironmentFile=` in de systemd-units. Een apart bestand **`/etc/mijn-ruimte/migratie.env`** (`0600 root:root`) wordt uitsluitend gebruikt tijdens het uitvoeren van SQL-migraties. Geen enkel geheim wordt ooit in Git gecommit of opgenomen in de client-build.

> [!TIP]
> **Automatische generatie van ontbrekende sleutels op de VM:**
> Het commando `sudo /usr/local/sbin/mijn-ruimte-installeer geheimen` ([`deploy/geheimen-aanmaken.sh`](../../deploy/geheimen-aanmaken.sh)) maakt automatisch alle ontbrekende encryptiesleutels aan met `openssl rand`, zonder bestaande sleutels te overschrijven, en logt uitsluitend cryptografische vingerafdrukken (fingerprints).

---

## 1. Verplichte Variabelen en Encryptiesleutels (`/etc/mijn-ruimte/geheimen.env`)

| Variabele | Doel | Formaat / Generatie |
|---|---|---|
| `DATABASE_URL` | Primaire verbinding met PostgreSQL (DB `mijnruimte`, versie PG ≥ 16, in productie PG 18.6). Wordt na rolscheiding verplaatst naar `/etc/mijn-ruimte/migratie.env`. | `postgres://mijnruimte:<wachtwoord>@127.0.0.1:5432/mijnruimte` |
| `OWNER_EMAIL` | E-mailadres van de platformeigenaar (super-admin). De server start niet zonder deze variabele. | E-mail in kleine letters |
| `AUDIT_IP_PEPPER` | Geheime pepper (`HMAC-SHA256`, min. 32 tekens) voor het hashen van IP-adressen in `app.audit` (`ip_hash`). De server start niet zonder deze waarde. | `openssl rand -base64 48 \| tr -d '\n'` |
| `TOTP_ENCRYPTION_KEY_V1` | `AES-256-GCM`-sleutel (32 bytes, AAD = `userId`) voor versleuteling van TOTP-geheimen voor tweefactorauthenticatie. | `openssl rand -base64 32` |
| `RECOVERY_CODE_PEPPER` | Geheime pepper (`HMAC-SHA256`, min. 32 tekens) voor eenmalige herstelcodes. | `openssl rand -base64 48` |
| `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1` | Versleutelt opgeslagen Google OAuth-grants en refresh-tokens. | `openssl rand -base64 32` |
| `OWNER_VAULT_ENCRYPTION_KEY_V1` | Versleutelt geheimen in de API-sleutelkluis van de eigenaar (`admin` / `api`). | `openssl rand -base64 32` |
| `MAIL_TOKEN_ENCRYPTION_KEY_V1` | Versleutelt OAuth-tokens van e-mailproviders (exact 32 bytes). | `openssl rand -base64 32` |
| `MAIL_APP_WACHTWOORD_SLEUTEL_V1` | Versleutelt app-wachtwoorden van IMAP/SMTP-mailboxen (iCloud, Ukr.net, Yahoo, I.ua), gekoppeld aan `user + row + ruimte`. Zonder sleutel wordt de koppeling geweigerd (geen fallback). | `openssl rand -base64 32` |
| `AGENDA_ABONNEMENT_SLEUTEL_V1` | Versleutelt app-wachtwoorden van CalDAV-agenda's (iCloud, Fastmail, Nextcloud). | `openssl rand -base64 32` |
| `SLEUTELKLUIS_SLEUTEL_V1` | Server-side pepper van de Sleutelkluis (migratie `0092`) voor het inpakken van de datasleutel (DEK) van de gebruiker bij het maken van MCP-enveloppen voor AI-agenten via `HKDF(agent_token + pepper)`. **Niet verwijderen of roteren zonder heruitgifte van enveloppen.** | `openssl rand -base64 32` |
| `GITHUB_KOPPELING_SLEUTEL_V1` | Versleutelt opgeslagen GitHub-integratietokens (OAuth, refresh, installation token). Gebruikt bij afwezigheid `TOTP_ENCRYPTION_KEY_V1`. | `openssl rand -base64 32` |
| `HUIS_ADAPTER_SLEUTEL_V1` | Versleutelt Home Assistant-tokens in Huis vNext (migratie `0128`, `app.huis_integraties.geheim`). Gebruikt bij afwezigheid `TOTP_ENCRYPTION_KEY_V1`. | `openssl rand -base64 32` |

---

## 2. Aanvullende Sleutels, DB-rollen en Beveiligingsschakelaars

| Variabele | Categorie | Standaard | Doel |
|---|---|---|---|
| `AGENT_SLEUTEL_V1` | Cryptografie | fallback naar TOTP | Aparte sleutel voor AI-agenttokens (`backend/connectors-crypto.ts`). |
| `AI_ARCHIEF_SLEUTEL_V1` | Cryptografie | fallback naar TOTP | Versleuteling van het browserdiagnose-archief (`backend/browser-diag-archief.ts`). |
| `AFZENDER_BEELD_PEPPER` | Cryptografie | fallback naar `AUDIT_IP_PEPPER` | HMAC-pepper voor het hashen van afzenderadressen in de avatartabel `app.afzender_beeld` (migratie `0093`). |
| `SCIM_BEARER_TOKEN` | Provisioning | leeg (uit) | Token voor inkomende SCIM-gebruikersprovisioning. |
| `DATABASE_URL_MIGRATIE` | DB-rollen (`migratie.env`) | — | Rol `mijnruimte_migrator` (eigenaar van schema `app`), uitsluitend geladen tijdens migraties. |
| `DATABASE_URL_APP` | DB-rollen (`geheimen.env`) | — | Rol `mijnruimte_app` (`NOBYPASSRLS`, alleen DML onder RLS-beleid voor gebruikersverzoeken). |
| `DATABASE_URL_SYSTEM` | DB-rollen (`geheimen.env`) | — | Rol `mijnruimte_system` (`BYPASSRLS` voor sessies, login, cron, back-ups, maar zonder wijzigingsrechten op `app.audit`). |
| `AUTH_POORT_AFDWINGEN` | Beveiliging | `0` (log) | `1` = centrale poort `auth-poort.ts` blokkeert (`401`) elk anoniem 2xx-antwoord buiten `PUBLIEKE_ROUTES`. |
| `STAP_OP_UIT` | Beveiliging | `0` | Nooduitschakeling van de Step-Up vereiste (`STEP_UP_REQUIRED`) voor gevoelige acties. |
| `STAP_OP_GOOGLE_ZONDER_AUTH_TIME` | Beveiliging | `0` | `1` = sta Google Step-Up toe zonder `auth_time` in het token als de OAuth-flow binnen 5 min is voltooid. |
| `ACCOUNT_DEFINITIEF_WISSEN` | Gegevensbescherming | `0` (dry-run) | `1` = achtergrondtaak `opruimen` verwijdert accounts definitief na afloop van de herstelperiode van 30 dagen. |

---

## 3. Externe Integraties (Google, Microsoft Graph, Gmail Pub/Sub)

| Variabele | Doel |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth 2.0-client van Google (Redirect URI: `https://id.tarasevych.com/`). Kan ook via de Sleutelkluis van de eigenaar in `Admin → Integraties → Koppelwizard` worden ingesteld zonder herstart van de server. |
| `GOOGLE_SUITE_CLIENT_ID` / `GOOGLE_SUITE_CLIENT_SECRET` | Client-alias voor Google Suite (indien ingesteld, moet deze overeenkomen met `GOOGLE_OAUTH_CLIENT_ID`). |
| `GOOGLE_GMAIL_PUBSUB_TOPIC` / `_AUDIENCE` / `_SERVICE_ACCOUNT_EMAIL` | Parameters voor directe Gmail push-meldingen via Google Cloud Pub/Sub (`deploy/POST-MELDINGEN-PUBSUB.nl.md`). |
| `MICROSOFT_GRAPH_CLIENT_ID` / `_CLIENT_SECRET` / `_TENANT_ID` | App-registratiegegevens in Microsoft Entra ID voor Outlook-e-mail (`mijn-ruimte-installeer oauth-client microsoft`). |
| `MICROSOFT_GRAPH_WEBHOOK_URL` / `_WEBHOOK_CLIENT_STATE` | URL en gedeeld geheim voor webhook-meldingen over nieuwe Microsoft Graph-berichten. |

---

## 4. Runtime-parameters, Zoeken `/zoek`, Coördinatie en Gegevensbescherming (`PRIVACY-001`)

| Variabele | Standaardwaarde | Doel |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `8080` | Lokaal adres en poort van de HTTP-server (verkeer komt uitsluitend binnen via `cloudflared`). |
| `DIST_DIR` / `MIGRATIONS_DIR` | `<release>/dist` / `<release>/migrations` | Paden naar de gebouwde frontend en SQL-migraties van de actieve release. |
| `UPLOADS_DIR` | `/srv/data/uploads` | Enige map met schrijftoegang voor de hoofdservice (`ReadWritePaths`). |
| `DASHBOARD_DIR` | `/srv/mijn-ruimte/dashboard` | Map van het statische dashboard voor `dashboard.tarasevych.com`. |
| `MERK_EIGEN_MAP` | `/srv/mijn-ruimte/merk-eigen` | Map voor eigen officiële merklogo's (`.svg`/`.png` ≤ 200 KB). |
| `MAX_BODY_BYTES` / `PG_POOL_MAX` | `12582912` (12 MiB) / `10` | Limiet voor HTTP-requestbody en grootte van de PostgreSQL-verbindingspool. |
| `API_RATE_LIMIT_PER_MIN` | `600` | Algemene verzoeklimiet voor `/api/*` per IP per minuut (voor login/MFA gelden strengere limieten: 10–20/min). |
| `ZOEK_TEKST_MAX_BYTES` / `ZOEK_TEKST_TIMEOUT_MS` / `ZOEK_TEKST_WERKER_MB` | `26214400` (25 MiB) / `60000` / `512` | Limieten voor de achtergrondproces `zoek-werker.mjs` bij tekstextractie uit PDF-, Office- en archiefbestanden. |
| `ZOEK_OCR_ENGINE` / `ZOEK_OCR_TALEN` / `ZOEK_OCR_TALEN_MAP` | `auto` / `ukr+nld+eng+rus` / `/srv/mijn-ruimte/ocr/tessdata` | Instellingen voor de OCR-engine (`tesseract-cli` / `tesseract-js` / `platform-ai`) en taalpakketten. |
| `ZOEK_INDEX_RUN_MS` / `ZOEK_INDEX_ITEMS` / `ZOEK_INDEX_SCAN_RIJEN` | `120000` / `60` / `400` | Tijdsbudget en aantal items per run van de indexer `zoek-index` (elke 5 min). |
| `CHAT_MODEL` | `claude-sonnet-5-5` | Standaard chatmodel op `ai.*` (elke gebruiker bewaart zijn eigen API-sleutel in zijn persoonlijke kluis). |
| `EXTERNE_MCP_HOSTS` / `MCP_RECHTEN_PAD` | leeg / `/etc/mijn-ruimte/mcp-rechten.json` | Allowlist van externe MCP-serverhosts (ook beheerd door de eigenaar via Passkey op de website). |
| `ORCH_WORTEL` / `ORCH_INBOX` | `/srv/mijn-ruimte/orch-repo` / `/srv/mijn-ruimte/orch-inbox` | Server-side werkkopie van de coördinatierepository `ORCH-001` en inboxmap voor agentpakketten. |
| `BESLUIT_INBOX` / `BESLUIT_APP_ROOT` | `/srv/mijn-ruimte/besluit-inbox` / `/srv/mijn-ruimte` | Paden voor uitwisseling van ondertekende Passkey-besluiten tussen de webapplicatie en de root-service `mijn-ruimte-besluit`. |
| `ROOK_CHROMIUM` | auto-detectie `/srv/mijn-ruimte/browser/chrome-headless-shell` | Pad naar de headless-browser voor automatische rookcontrole na uitrol. |
| `MR_EIGENAAR_NAAM` / `MR_CONTACT_EMAIL` | `власник / eigenaar` / `op aanvraag` | Naam van de verwerkingsverantwoordelijke en contact-e-mailadres voor publieke pagina's `/privacy` en `/terms` (`PRIVACY-001` / `B-010`). |
| `MR_BEHEERSUBNET` / `MR_VM_SSH` | `10.0.0.0/8` / `mijn-ruimte-vm` | Beheersubnet voor bescherming van Huis vNext-gateways en SSH-doel voor beheerscripts (`B-010`). |

---

## Gerelateerde Documentatie (🇺🇦 UK ↔ 🇳🇱 NL)

- **Volledige `ENV-VARS`-specificatie:** [🇺🇦 `ENV-VARS.uk.md`](../../ЗМІННІ-СЕРЕДОВИЩА.uk.md) ↔ [🇳🇱 `OMGEVINGSVARIABELEN.nl.md`](../../OMGEVINGSVARIABELEN.nl.md) ([origineel `OMGEVINGSVARIABELEN.nl.md`](../../OMGEVINGSVARIABELEN.nl.md))
- **Geheimenregister en encryptiesleutels:** [🇺🇦 `deploy/GEHEIMEN-REGISTER.uk.md`](../../deploy/РЕЄСТР-ТАЄМНИЦЬ.uk.md) ↔ [🇳🇱 `deploy/GEHEIMEN-REGISTER.nl.md`](../../deploy/GEHEIMEN-REGISTER.nl.md) · [🇺🇦 `deploy/KLYUCHI-I-SHYFRUVANNYA.uk.md`](../../deploy/КЛЮЧІ-ТА-ШИФРУВАННЯ.uk.md) ↔ [🇳🇱 `deploy/SLEUTELS-EN-VERSLEUTELING.nl.md`](../../deploy/SLEUTELS-EN-VERSLEUTELING.nl.md)
