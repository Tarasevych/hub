> 🌐 **Taal / Мова:** [Українська](РЕЄСТР-ТАЄМНИЦЬ.uk.md) · **Nederlands** | [Hoofdpagina](../LEESMIJ.md) · [Documentatie-index](../docs/INDEX.nl.md)

# Geheimenregister «Mijn Ruimte» — SJABLOON

> **Geen enkele waarde staat hier — en dat hoort zo.** Waarden leven alleen op uw server (`/etc/mijn-ruimte/geheimen.env`,
> de versleutelde kluis in de database) en in uw wachtwoordmanager. Dit bestand is de kaart: wat er is, waarvoor, waar het staat,
> welke vingerafdruk het heeft en wanneer het is aangemaakt. Met de vingerafdruk (SHA-256 van de waarde, eerste 8 hex-tekens) kunt u
> controleren of het om dezelfde sleutel gaat zonder de sleutel zelf te tonen.

## Zo maakt u het actuele register

Op de server, vanuit de werkgebruiker (bijv. `beheer`), eenmalig na elke wijziging van geheimen:

```bash
sudo /usr/local/sbin/mijn-ruimte-installeer geheimen-register --uit /etc/mijn-ruimte/GEHEIMEN-REGISTER.md
sudo cat /etc/mijn-ruimte/GEHEIMEN-REGISTER.md      # bekijken; bestand is root 0600
```

Zonder `--uit` wordt het register in de terminal afgedrukt. Script: `deploy/geheimen-register.sh`. Datums komen uit `geheimen.journaal`
(bijgehouden door `mijn-ruimte-installeer geheimen` en `… oauth-client`); voor oudere items wordt de bestandsdatum van `geheimen.env`
gebruikt met de aanduiding «(bestand)».

Ontbrekende sleutels aanmaken (bestaande worden niet gewijzigd): `sudo /usr/local/sbin/mijn-ruimte-installeer geheimen`.
Dezelfde stap wordt automatisch uitgevoerd aan het begin van elke `mijn-ruimte-installeer installeren`.

## Wat in de tabel staat

| Naam | Doel | Waar | Vingerafdruk | Datum | Wie roteert |
|---|---|---|---|---|---|
| `AUDIT_IP_PEPPER` | pepper voor IP-hashes in het auditlogboek | geheimen.env | `xxxxxxxx` | 2026-… | `mijn-ruimte-installeer geheimen` (nieuw = oude hashes niet meer vergelijkbaar) |
| `RECOVERY_CODE_PEPPER` | pepper voor herstelcodes | geheimen.env | `xxxxxxxx` | 2026-… | niet roteren zonder nieuwe herstelcodes voor iedereen |
| `TOTP_ENCRYPTION_KEY_V1` | AES-256 voor TOTP (en terugval voor GitHub/agenten/archief) | geheimen.env | `xxxxxxxx` | 2026-… | niet roteren |
| `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1` | AES-256 voor Google-tokens | geheimen.env | `xxxxxxxx` | 2026-… | niet roteren |
| `OWNER_VAULT_ENCRYPTION_KEY_V1` | AES-256 voor de geheimenkluis | geheimen.env | `xxxxxxxx` | 2026-… | niet roteren |
| `MAIL_TOKEN_ENCRYPTION_KEY_V1` | AES-256 voor tokens van e-mailproviders | geheimen.env | `xxxxxxxx` | 2026-… | niet roteren |
| `MAIL_APP_WACHTWOORD_SLEUTEL_V1` | AES-256 voor IMAP/SMTP-appwachtwoorden (iCloud, Ukr.net, Yahoo, I.ua) | geheimen.env | `xxxxxxxx` | 2026-… | niet roteren (anders moet e-mail opnieuw worden gekoppeld) |
| `AGENDA_ABONNEMENT_SLEUTEL_V1` | AES-256 voor CalDAV-wachtwoorden | geheimen.env | `xxxxxxxx` | 2026-… | niet roteren |
| `GITHUB_KOPPELING_SLEUTEL_V1` | AES-256 voor GitHub-tokens (optioneel; zonder deze sleutel wordt de TOTP-sleutel gebruikt) | geheimen.env | `xxxxxxxx` | 2026-… | niet roteren |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID van Google (openbaar) | geheimen.env **of** kluis (doel `google`) | openbaar | 2026-… | Google Cloud Console → Credentials |
| `GOOGLE_OAUTH_CLIENT_SECRET` | client geheim van Google | geheimen.env **of** kluis | `xxxxxxxx` | 2026-… | Console → Reset geheim → `mijn-ruimte-installeer oauth-client google` of Koppelwizard |
| `MICROSOFT_GRAPH_CLIENT_ID` / `…_TENANT_ID` | Entra Application (client) ID, tenant | geheimen.env | openbaar | 2026-… | Entra → App registrations |
| `MICROSOFT_GRAPH_CLIENT_SECRET` | client geheim van Entra (**geldigheid ≤ 24 mnd.** — noteer de vervaldatum!) | geheimen.env | `xxxxxxxx` | 2026-… | Entra → Certificates & geheimen → `… oauth-client microsoft` |
| `MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE` | gedeeld geheim voor de Graph-webhook | geheimen.env | `xxxxxxxx` | 2026-… | `mijn-ruimte-installeer geheimen` |
| `DATABASE_URL_APP` / `DATABASE_URL_SYSTEM` / `DATABASE_URL_MIGRATIE` | wachtwoorden van de PostgreSQL-rollen | geheimen.env / migratie.env | `xxxxxxxx` | 2026-… | `db-rollen-instellen.sh` |
| `SCIM_BEARER_TOKEN` | inkomende SCIM | geheimen.env | `xxxxxxxx` of leeg | 2026-… | handmatig + in de directory |

### Geheimenkluis van de eigenaar (niet env)

Items in de kluis — GitHub OAuth-app (`github-oauth`), GitHub App (`github-app`), Google-client (`google`), Telegram,
Anthropic, Home Assistant… — hebben een eigen overzicht onder **Beheer → «Geheimen en sleutels»** (namen, datums, vervaltermijnen, zonder
waarden). Ze worden uitsluitend via de site ingevoerd met passkey/TOTP en worden in dit bestand niet gedupliceerd.

### Waar dit bestand hoort

- Naast de waarden zelf in de wachtwoordmanager van de eigenaar (apart item «Mijn Ruimte — register»).
- In de versleutelde back-up van de geheimen (`deploy/HERSTEL.nl.md`), los van de databaseback-up.
- **Niet** in git, **niet** in de chat, **niet** in tickets.

### Regel

Geen enkel geheim gaat ooit via de chat, bestanden van AI of instructies: het wordt op de server gegenereerd (`openssl rand`) of in de console
van de aanbieder aangemaakt en direct op de server gezet (verborgen invoer). De AI-assistent ziet uitsluitend namen en vingerafdrukken.
