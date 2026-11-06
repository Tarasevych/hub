> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./ENV-VARS.uk.md) · **🇳🇱 Nederlands** ([origineel](./ENV-VARS.md)) · [🏠 Hoofdpagina (NL)](./LEESMIJ.md) · [🏠 Головна (UK)](./README.md) · [📚 Documentatie-index](./docs/INDEX.nl.md)

# Omgevingsvariabelen en geheimen

Alle waarden staan op de VM in **`/etc/mijn-ruimte/geheimen.env`** (`0600 root:root` volstaat: systemd leest het als root; of `root:mijnruimte 0640`),
geladen door systemd (`EnvironmentFile=` in `deploy/mijn-ruimte.service` en de cron-units).
Nooit in git, nooit in de build, nooit in logs. **Genereer ALLE geheimen nieuw**: de oude AppDeploy-waarden
moeten als gelekt worden beschouwd (zie [SECURITY-NOTES.nl.md](./SECURITY-NOTES.nl.md) / [SECURITY-NOTES.md](./SECURITY-NOTES.md)).

Formaat van `geheimen.env`: één `NAAM=waarde` per regel, zonder aanhalingstekens of `export`.

**Aanmaken en bijhouden (20.10.2026):** `sudo /usr/local/sbin/mijn-ruimte-installeer geheimen` maakt alle ONTBREKENDE
sleutels aan (bestaande blijven; alleen naam + vingerafdruk worden getoond) en `mijn-ruimte-installeer installeren` doet dat
automatisch als eerste stap. Het register zonder waarden (naam, doel, waar, vingerafdruk, datum): `mijn-ruimte-installeer
geheimen-register --uit /etc/mijn-ruimte/GEHEIMEN-REGISTER.md` (sjabloon: `deploy/GEHEIMEN-REGISTER.md`). OAuth-clients van
Google/Microsoft: `mijn-ruimte-installeer oauth-client google|microsoft` (verborgen invoer) of — voor Google en GitHub — het veld
in admin → Інтеграції → **Майстер підключень** (kluis, passkey, geen herstart).

## Verplicht

| Naam | Doel | Genereren / waarde |
|---|---|---|
| `DATABASE_URL` | Postgres-verbinding (database `mijnruimte`, rol `mijnruimte`). PostgreSQL **16 of nieuwer** (aanbevolen 17; zie `deploy/LEESMIJ.md`). | `postgres://mijnruimte:<wachtwoord>@127.0.0.1:5432/mijnruimte`; wachtwoord: `openssl rand -base64 32 \| tr -d '/+='` |
| `AUDIT_IP_PEPPER` | Geheime pepper (HMAC-SHA256) voor de IP-hash in `app.audit` (`ip_hash`). Min. 32 tekens. **De server start niet zonder** (audit-fix 10; geen terugval meer op `RECOVERY_CODE_PEPPER`). Wisselen maakt oude en nieuwe hashes onvergelijkbaar (geen gegevensverlies). | `deploy/geheimen-aanvullen.sh` of `openssl rand -base64 48 \| tr -d '\n'` |
| `OWNER_EMAIL` | E-mailadres van de eigenaar (super-admin). Vervangt het vroeger hardgecodeerde adres. De server start niet zonder. | Het Google-adres van de eigenaar, kleine letters. |
| `TOTP_ENCRYPTION_KEY_V1` | AES-256-GCM-sleutel voor TOTP-geheimen (gebonden aan de gebruikers-id). Zonder sleutel: TOTP-inschrijving geeft 503. | `openssl rand -base64 32` (32 bytes; base64 of 64 hex-tekens) |
| `RECOVERY_CODE_PEPPER` | Geheime pepper (HMAC-SHA256) voor herstelcodes. Min. 32 tekens. Zonder pepper: geen nieuwe herstelcodes (503). | `openssl rand -base64 48` |
| `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1` | Versleutelt opgeslagen Google-grants en refresh tokens. | `openssl rand -base64 32` |
| `OWNER_VAULT_ENCRYPTION_KEY_V1` | Versleutelt items in de API-platform-kluis (admin/api). | `openssl rand -base64 32` |
| `GITHUB_KOPPELING_SLEUTEL_V1` | Versleutelt de bewaarde GitHub-tokens van de koppeling (OAuth-token, vernieuwingstoken, installatietoken van een GitHub App), gebonden aan gebruiker + weg. Optioneel: zonder deze sleutel gebruikt de server `TOTP_ENCRYPTION_KEY_V1`. Een eigen sleutel is beter: dan raakt een rotatie van TOTP de GitHub-koppeling niet. | `openssl rand -base64 32` |
| `HUIS_ADAPTER_SLEUTEL_V1` | Versleutelt de bewaarde Home Assistant-tokens van Huis vNext (migratie 0128, `app.huis_integraties.geheim`), gebonden aan woning + integratie. Optioneel: zonder deze sleutel gebruikt de server `TOTP_ENCRYPTION_KEY_V1`. Een eigen sleutel is beter: dan raakt een rotatie van TOTP de gateway-koppelingen niet. Roteren = alle integraties opnieuw koppelen (het token wordt nooit teruggegeven). | `openssl rand -base64 32` |
| `MAIL_TOKEN_ENCRYPTION_KEY_V1` | Versleutelt tokens van mailproviders. Moet exact 32 bytes zijn. | `openssl rand -base64 32` |
| `MAIL_APP_WACHTWOORD_SLEUTEL_V1` | **Verplicht sinds 20.10.2026.** Versleutelt het app-wachtwoord van IMAP/SMTP-koppelingen (iCloud, Ukr.net, Yahoo, I.ua; `backend/mail-imap.ts`), gebonden aan gebruiker + rij + ruimte. Zonder sleutel weigert het koppelen met een foutcode (nooit onversleuteld bewaren). Geen terugval op een andere sleutel. | `mijn-ruimte-installeer geheimen` of `openssl rand -base64 32` |
| `AGENDA_ABONNEMENT_SLEUTEL_V1` | Versleutelt het app-wachtwoord van een CalDAV-agenda (iCloud, Fastmail, Nextcloud), gebonden aan gebruiker + serveradres. Alleen nodig als iemand CalDAV koppelt; zonder sleutel weigert de site het koppelen met `CALDAV_SLEUTEL_ONTBREEKT` in plaats van het wachtwoord onversleuteld te bewaren. ICS-abonnementen en Google Calendar hebben haar niet nodig. | `openssl rand -base64 32` |
| `SLEUTELKLUIS_SLEUTEL_V1` | **Verplicht sinds 21.10.2026** — wordt door `mijn-ruimte-installeer` aangemaakt vóór migratie 0092 (sleutelkluis). Niet verwijderen of roteren. Pepper voor de omslagen van AI-verbindingen: de gegevenssleutel (DEK) van een mens wordt voor een MCP-verbinding omgeslagen met HKDF(token van de agent + deze pepper). De DEK zelf staat NOOIT op schijf; deze pepper opent niets zonder het token van de agent. Ontbreekt zij, dan valt de kluis terug op `TOTP_ENCRYPTION_KEY_V1`; ontbreken beide, dan krijgen AI-verbindingen geen omslag (agenten zien dan «ключ закритий» bij versleutelde rijen). | `openssl rand -base64 32` |

> Wissel je een `*_KEY_V1` later, dan kunnen bestaande versleutelde gegevens niet meer worden gelezen.
> Bewaar de sleutels daarom ook in de offline back-up (wachtwoordmanager), los van de databaseback-up.

### Optionele eigen sleutels met terugval op `TOTP_ENCRYPTION_KEY_V1`

| Naam | Doel |
|---|---|
| `GITHUB_KOPPELING_SLEUTEL_V1` | GitHub-koppelingstokens (zie boven). |
| `AGENT_SLEUTEL_V1` | Tokens van AI-agenten (`backend/connectors-crypto.ts`). |
| `AI_ARCHIEF_SLEUTEL_V1` | Archief van de browserdiagnose (`backend/browser-diag-archief.ts`). |

Ontbreekt zo'n sleutel, dan gebruikt de code `TOTP_ENCRYPTION_KEY_V1`. **Daarom maakt `mijn-ruimte-installeer geheimen` ze op
een bestaande installatie NIET automatisch aan** (er kunnen al gegevens onder de TOTP-sleutel staan; een nieuwe eigen sleutel
zou die onleesbaar maken). Op een nieuw, leeg `geheimen.env` worden ze wel aangemaakt; later bewust: `… geheimen --ook-optioneel`.


### Databaserollen (beveiliging fase 2, optioneel)
Worden alleen door `deploy/db-rollen-instellen.sh instellen` geschreven (nooit met de hand nodig). Ontbreekt een
variabele, dan valt de app terug op `DATABASE_URL` en werkt alles zoals vroeger (één rol, RLS-policy's laten alles door).

**Audit-fix 4: twee bestanden.** Na `db-rollen-instellen.sh env-splitsen` staan de migratie- en legacy-URL's
(`DATABASE_URL`, `DATABASE_URL_MIGRATIE`) alleen nog in **`/etc/mijn-ruimte/migratie.env`** (0600 root:root). Dat
bestand wordt alleen door de migratiestap van `installeer-app.sh` en door `db-rollen-instellen.sh` geladen, nooit door
`mijn-ruimte.service`/`-cron`/`-backup`. In `geheimen.env` blijven `DATABASE_URL_APP` en `DATABASE_URL_SYSTEM`. De app
waarschuwt bij het starten als een migratie- of legacy-URL toch in de runtime-omgeving staat. Terug: `env-samenvoegen`.
`migratie.env` hoort in de versleutelde geheimen-back-up (zie `deploy/HERSTEL.md`).

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
| `STAP_OP_GOOGLE_ZONDER_AUTH_TIME` | uit | Opt-in noodpad (audit-fix 5): `1` = een expliciete step-up-aanmelding bij Google (`prompt=login`, `max_age=0`) telt ook zonder `auth_time`-claim in het id_token, mits het OAuth-verloop binnen 5 minuten na de start is afgerond. Standaard telt Google-step-up alleen met `auth_time` (zet in de Google Cloud Console bij de OAuth-client **"sessie age claims"** aan). TOTP-step-up werkt altijd. |
| `ACCOUNT_DEFINITIEF_WISSEN` | uit | `1` = de opruimjob wist accounts **definitief** (inhoud, identiteiten, bestanden; grafsteen zonder persoonsgegevens) zodra de herstelperiode van 30 dagen voorbij is. Zonder: alleen een droog verslag in het cron-log. **Onomkeerbaar** — pas aanzetten na een geslaagde back-up/hersteltest. |

## Google-login en Google Suite (optioneel: zonder deze waarden is Google-login uit)

| Naam | Doel | Genereren / waarde |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` (alias `GOOGLE_SUITE_CLIENT_ID`; staat die er ook, dan wint `GOOGLE_SUITE_CLIENT_ID` — dan moet het dezelfde client zijn) | OAuth-client-ID (publiek). | Google Cloud Console → *APIs & Services* → *Credentials* → *Aanmaken credentials* → *OAuth client ID*, type *Web application*. Redirect-URI: **`https://id.<uw-domein>/`** (exact, met slash); JavaScript origins: `https://id.`, `https://hub.`, `https://mail.`, `https://cloud.<uw-domein>`. Scopes en branding onder *Google Auth Platform* (vroeger «OAuth consent screen»). De Майстер підключень toont deze waarden kant-en-klaar voor uw domein. |
| `GOOGLE_OAUTH_CLIENT_SECRET` (alias `GOOGLE_SUITE_CLIENT_SECRET`) | OAuth-clientgeheim. | Uit dezelfde client. Zetten: `mijn-ruimte-installeer oauth-client google` (verborgen invoer, herstart + controle). **Of** via de wizard in de kluis (doel `google`, naam `google-oauth-client`, regels `client_id:`/`client_secret:`): env wint; staat er GEEN env-client, dan geldt de kluis van de eigenaar — zonder herstart (aanmelden via Google binnen 5 min; Gmail/Drive/Agenda meteen). Nooit half: alleen een id of alleen een geheim in env wordt niet uit de kluis aangevuld. |

Zonder client (env noch kluis) antwoordt de Google-aanmelding met **503 `GOOGLE_NOT_CONFIGURED`** (en maakt geen state-rijen).
De wizard controleert de client zonder aanmelding: token endpoint met een testcode → `invalid_grant` = geldig, `invalid_client` = niet.

**Foto's van afzenders uit Google-contacten (optioneel, 21.10.2026):** zet in hetzelfde Google Cloud-project ook de **People API** aan.
De site vraagt `contacts.readonly` en `contacts.other.readonly` pas als een mens in Пошта → Налаштування → «Відправники» zelf
«Фото відправників з ваших Google-контактів» aanzet (incrementele toestemming op de bestaande Gmail-koppeling; de gewone koppeling
vraagt ze niet). Staat de API uit, dan meldt de pagina dat eerlijk en blijft alles verder werken.

## Microsoft (Outlook-mail, optioneel)

| Naam | Doel | Genereren / waarde |
|---|---|---|
| `MICROSOFT_GRAPH_CLIENT_ID` / `MICROSOFT_GRAPH_CLIENT_SECRET` / `MICROSOFT_GRAPH_TENANT_ID` | App-registratie voor Microsoft Graph (Outlook-mail). **Alleen env**: de mailroutes lezen uitsluitend deze namen; een herstart is nodig (de opdracht doet dat zelf). | Microsoft Entra admin center (entra.microsoft.com) → *App registrations* → *New registration*: platform *Web*, Redirect-URI **`https://id.<uw-domein>/`** (exact, met slash); *Certificates & geheimen* → client geheim (max. 24 maanden — noteer de datum in het register); *API permissions* → Microsoft Graph, Delegated: `offline_access openid profile email Mail.Read Mail.ReadWrite Mail.Send`. Tenant: `common` of de Directory (tenant) ID. Zetten: `mijn-ruimte-installeer oauth-client microsoft`. |
| `MICROSOFT_GRAPH_WEBHOOK_URL` | Endpoint voor wijziging notifications (optioneel). | `https://mail.<uw-domein>/api/owner/mail/microsoft/webhook` |
| `MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE` | Gedeeld geheim dat Graph meestuurt. | `mijn-ruimte-installeer geheimen` maakt het aan zodra `MICROSOFT_GRAPH_WEBHOOK_URL` gezet is (`openssl rand -hex 32`). |

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
| `AFZENDER_BEELD_PEPPER` | Pepper (HMAC-SHA256, min. 32 tekens) voor het adres van een afzender in `app.afzender_beeld` (foto's van afzenders, migratie 0093): het adres staat daar alleen als HMAC. Leeg = de server gebruikt `AUDIT_IP_PEPPER` met een eigen voorvoegsel. Wisselen = de bewaarde foto's worden niet meer gevonden en opnieuw opgehaald (geen gegevensverlies). | `openssl rand -base64 48 \| tr -d '\n'` |

## Runtime (geen geheimen; standaardwaarden zijn goed voor productie)

| Naam | Standaard | Doel |
|---|---|---|
| `HOST` | `127.0.0.1` | Luisteradres. **Niet** wijzigen: publiek verkeer komt alleen via cloudflared. |
| `PORT` | `8080` | Poort; moet gelijk zijn aan `deploy/cloudflared-config.yml`. |
| `DIST_DIR` | `<release>/dist` | Gebouwde frontend. |
| `DASHBOARD_DIR` | `/srv/mijn-ruimte/dashboard` | Statisch dashboard voor `dashboard.tarasevych.com`. |
| `UPLOADS_DIR` | `/srv/data/uploads` | Bestandsopslag (enige schrijfbare map voor de dienst). |
| `MERK_EIGEN_MAP` | `/srv/mijn-ruimte/merk-eigen` | Officiële logo's die de beheerder zelf neerlegt (`<sleutel>.svg` of `.png`, ≤ 200 KB, SVG ontsmet) — zie `deploy/LEESMIJ.md`, «Eigen logo's». |
| `MAX_BODY_BYTES` | `12582912` (12 MiB) | Maximale requestgrootte. |
| `PG_POOL_MAX` | `10` | Maximaal aantal Postgres-verbindingen. |
| `MIGRATIONS_DIR` | `<release>/migrations` | Map met SQL-migraties. |
| `API_RATE_LIMIT_PER_MIN` | `600` | Algemene limiet per IP per minuut voor `/api/*` (in het geheugen). Strengere limieten voor login/MFA/handoff staan vast in `server/start.ts`. |
| `NODE_ENV` | `production` | Gezet in de systemd-unit. |
| `ZOEK_DEBUG` | (leeg) | /zoek kern: `aan` logt per zoekopdracht alleen de SQL-duur en het aantal rijen naar stderr (nooit de vraag of inhoud). De index zelf staat altijd aan; de vroegere vlag `ZOEK_INDEX=aan` bestaat niet meer (0100): zonder rijen in de index voor deze lade zoekt `/api/owner/global-search` in het geheugen en meldt `index:false`. |
| `ZOEK_TEKST_MAX_BYTES` | `26214400` (25 MiB) | /zoek: maximale grootte van één bestand/bijlage voor tekstextractie (groter → status `te_groot`, alleen de naam wordt geïndexeerd). |
| `ZOEK_TEKST_TIMEOUT_MS` / `ZOEK_TEKST_WERKER_MB` | `60000` / `512` | /zoek: tijdslimiet en V8-heaplimiet van de werker-thread (`dist-server/zoek-werker.mjs`) die PDF/Office/archieven leest; bij overschrijding wordt de gesprek beëindigd (status `fout`: `TIJDSLIMIET`/`GEHEUGENLIMIET`), de server merkt er niets van. |
| `ZOEK_PDF_MAX_PAGINAS` / `ZOEK_OCR_MAX_PAGINAS` | `500` / `50` | /zoek: pagina's van een PDF voor de tekstlaag, en hoeveel gescande pagina's per document door OCR gaan. |
| `ZOEK_OCR_ENGINE` | `auto` | /zoek OCR: `auto` (systeem-`tesseract` → `tesseract.js` (WASM) → platform-AI), `tesseract-cli`, `tesseract-js`, `platform-ai` of `uit`. Zonder engine of taalbestanden meldt de bronstatus eerlijk «OCR niet beschikbaar». |
| `ZOEK_OCR_TALEN` / `ZOEK_OCR_TALEN_MAP` | `ukr+nld+eng+rus` / `/srv/mijn-ruimte/ocr/tessdata` | /zoek OCR: gewenste talen (tesseract-codes) en de map met `.traineddata`. Vullen met `sudo mijn-ruimte-installeer ocr-talen [--talen …]` (apt tesseract-ocr + poppler-utils, tessdata_fast 4.1.0 met SHA-256; ±29 MB voor 9 talen, niet in de release-tar). Ook `/usr/share/tesseract-ocr/*/tessdata` wordt gelezen. |
| `ZOEK_OCR_MAX_BYTES` / `ZOEK_OCR_PAGINA_TIMEOUT_MS` / `ZOEK_OCR_PARALLEL` | `20971520` / `45000` / `1` | /zoek OCR: grootte-grens, tijdslimiet per pagina (proces wordt gedood), gelijktijdige OCR-runs per proces. |
| `ZOEK_OCR_TESSERACT_PAD` / `ZOEK_OCR_PDFTOPPM_PAD` | (via PATH) | /zoek OCR: expliciet pad naar `tesseract` / `pdftoppm` als ze niet op PATH staan. |
| `ZOEK_ARCHIEF_MAX_TOTAAL_MB` / `_BESTAND_MB` / `_AANTAL` / `_DIEPTE` / `_VERHOUDING` | `200` / `50` / `2000` / `3` / `200` | /zoek archieven (zip/tar/gz): totaal uitgepakt, per bestand, aantal bestanden, nestdiepte, compressieverhouding (zip-bom). zip64, wachtwoord, rar/7z: niet ondersteund (eerlijk gemeld). |
| `ZOEK_INDEX_RUN_MS` / `ZOEK_INDEX_ITEMS` / `ZOEK_INDEX_SCAN_RIJEN` | `120000` / `60` / `400` | /zoek indexering (cron `zoek-index`, elke 5 min, + achtergrondronde in het serverproces bij een open sleutelkluis): tijdsbudget per run, wachtrij-items per run, bronrijen per scanstap (meer rijen → de stap plant zichzelf opnieuw; voortgang in de bronstand). |
| `ZOEK_INDEX_VOLLEDIG_MIN` / `ZOEK_INDEX_GITHUB_MIN` | `15` / `30` | /zoek: minuten tussen afstemmingen op verdwenen rijen (alleen id’s), en tussen volledige GitHub-lezingen (geen wijzigingsfeed). Werkelijke vertraging per bron: ui ≤ 5 min; mail/cloud/drive/agenda/bord ≤ 5 min na de eigen synchronisatie; github ≤ 30 min; verwijderingen ≤ 15 min; bijlagen/inhoud/OCR: via de wachtrij daarna. |
| `ZOEK_BEHEER_RUN_MS` / `ZOEK_BEHEER_ITEMS` | `600000` / `2000` | /zoek, handmatige indexatie vanuit het technisch profiel (zone D, 22.10.2026; `POST /api/owner/zoek/index/starten`, venster «Індексація» op /zoek): tijdsbudget en wachtrij-items per handmatige run. De run pakt alleen items van de eigen laden, onder dezelfde advisory lock als de cron (`cron:zoek-index`); daarna stopt hij netjes (status `tijd`/`limiet`) en pakt de cron de rest. Zie docs/zoek/ZOEK-BEHEER.md §5. |
| `ROOK_CHROMIUM` | (zoekt `/srv/mijn-ruimte/browser/chrome-headless-shell`, `/usr/bin/chromium`…) | Rendercontrole (22.10.2026): pad naar de headless browser die de installer gebruikt; de app leest alleen OF hij bestaat («Діагностика» → «Рендеринг сторінок», knop «Перевірити рендеринг»). De app start zelf nooit een browser; de uitslag komt van root via `/var/lib/mijn-ruimte-uitrol-status/rook-controle.json`. Installeren: `sudo mijn-ruimte-installeer browser-controle`. |
| `ZOEK_INDEX_INHOUD_MAX_MB` / `ZOEK_INDEX_SLEUTEL_WACHT_MIN` | `25` / `10` | /zoek: grootste bijlage/bestand waarvan de inhoud gelezen wordt; hoe lang een item wacht als de sleutelkluis (0092) dicht is (geen fout: stand «очікує входу»). |

## Alleen bij het bouwen

| Naam | Doel |
|---|---|
| `SOURCEMAP` | `1` = sourcemaps bouwen (alleen lokaal debuggen; de server serveert `*.map` nooit). |

## Snel alles genereren (op de VM, als root)

Bestaat `geheimen.env` al (met `DATABASE_URL`), gebruik dan `mijn-ruimte-installeer geheimen --eigenaar <e-mailadres>`
(`deploy/geheimen-aanmaken.sh`; de oude naam `geheimen-aanvullen.sh` verwijst ernaar): dat voegt alleen ontbrekende sleutels
toe, toont geen waarden en schrijft naam + vingerafdruk in `geheimen.journaal`. Voor een volledig nieuw bestand kan het ook
met de hand:

```bash
install -d -m 0750 -o root -g mijnruimte /etc/mijn-ruimte
umask 027
cat > /etc/mijn-ruimte/geheimen.env <<EOT
DATABASE_URL=postgres://mijnruimte:$(openssl rand -base64 32 | tr -d '/+=')@127.0.0.1:5432/mijnruimte
OWNER_EMAIL=<eigenaar@gmail.com>
TOTP_ENCRYPTION_KEY_V1=$(openssl rand -base64 32)
RECOVERY_CODE_PEPPER=$(openssl rand -base64 48 | tr -d '\n')
AUDIT_IP_PEPPER=$(openssl rand -base64 48 | tr -d '\n')
GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1=$(openssl rand -base64 32)
OWNER_VAULT_ENCRYPTION_KEY_V1=$(openssl rand -base64 32)
GITHUB_KOPPELING_SLEUTEL_V1=$(openssl rand -base64 32)
MAIL_TOKEN_ENCRYPTION_KEY_V1=$(openssl rand -base64 32)
MAIL_APP_WACHTWOORD_SLEUTEL_V1=$(openssl rand -base64 32)
AGENDA_ABONNEMENT_SLEUTEL_V1=$(openssl rand -base64 32)
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

## Optioneel (geen geheim)
- `CHAT_MODEL` — model voor de chat op ai.* (standaard `claude-sonnet-5-5`). De Anthropic-sleutel zelf staat NIET in de omgeving:
  elke gebruiker bewaart zijn eigen sleutel in de owner-kluis (doel `anthropic`, API → Koppelingen → Kluis).
- `EXTERNE_MCP_HOSTS` — de witte lijst van hosts waar de site als **MCP-klant** naartoe mag (de site praat dan zelf met een
  vreemde MCP-server; `backend/mcp-klant/*`, migratie 0078). Komma- of spatiegescheiden; een regel is een hostnaam
  (`api.githubcopilot.com`) of een achtervoegsel met één sterretje vooraan (`*.githubcopilot.com`). Een los `*` wordt
  genegeerd. **Niets instellen betekent: geen enkele uitgaande MCP-verbinding** — dat is de bedoeling (BYOS: alleen waar de
  eigenaar het bewust toestaat). Dezelfde lijst kan ook in het root-bestand staan dat de deur al gebruikt,
  `/etc/mijn-ruimte/mcp-rechten.json` (pad instelbaar met `MCP_RECHTEN_PAD`), onder de sleutel `externeMcpHosts`:
  `{ "externeMcpHosts": ["api.githubcopilot.com"] }`. Staan beide er, dan geldt de som. Tokens horen NIET hier: die zet de
  gebruiker zelf in zijn kluis bij het koppelen (mcp.* → Підключення ШІ → «Зовнішні MCP»).
  Sinds 22.10.2026 beheert de eigenaar `externeMcpHosts` op die pagina zelf met een **passkey-besluit** (root schrijft het bestand;
  RUNBOOK §15); hosts uit `EXTERNE_MCP_HOSTS` staan daar als «оточення» en zijn alleen hier te wijzigen.
- `BESLUIT_INBOX` (standaard `/srv/mijn-ruimte/besluit-inbox`), `BESLUIT_APP_ROOT` (standaard `/srv/mijn-ruimte`: `current`, `VORIGE`,
  `releases/`) — besluiten van de eigenaar met passkey (`backend/eigenaar-besluit.ts`, RUNBOOK §15): waar de app het ondertekende
  besluit voor root neerlegt en waar ze de actieve/vorige release leest. De uitkomst komt uit `OPDRACHT_STATUS_DIR/besluit-<id>.json`.
  Alleen voor tests en de stand; op de server gelden de vaste paden. Het root-script zelf (`mijn-ruimte-besluit`) leest `BESLUIT_*`
  (`BESLUIT_WERK`, `BESLUIT_STATUS`, `BESLUIT_RECHTEN`, `BESLUIT_PASSKEY`, `BESLUIT_INSTALLEER`, `BESLUIT_GROEP`, `BESLUIT_WACHT_TERUG`)
  uitsluitend buiten root en alleen met paden onder /tmp.
