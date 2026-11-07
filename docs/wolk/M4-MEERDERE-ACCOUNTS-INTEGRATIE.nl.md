> 🌐 **Taal / Мова:** [Українська](ІНТЕГРАЦІЯ-БАГАТЬОХ-ОБЛІКОВИХ-ЗАПИСІВ-М4.uk.md) · **Nederlands** | [Hoofdpagina](../../LEESMIJ.md) · [Documentatie-index](../INDEX.nl.md)

# Volledige Cloud-integratie M4 — koppeling en werken met meerdere accounts

Status: **DEVELOPMENT ALLEEN / NIET DEPLOYABLE**. Basis: 20261027-212158 + M1–M3. Er zijn geen wijzigingen aangebracht aan live servers, OAuth-consoles, PostgreSQL, het GitHub-project of beheerdersupdates.

## 1. Inhoud van de implementatie

- Server-side koppeling van Microsoft OneDrive Personal/Business, SharePoint, Dropbox en Box met OAuth 2.0 authorization code. Microsoft en Dropbox gebruiken PKCE S256; Box gebruikt de confidential-code stroom met een server-side client geheim en een willekeurige eenmalige state. Microsoft `prompt=select_account` ondersteunt de bewuste keuze van een volgend account. Dropbox en Box gebruiken de eigen interface van de provider.
- Gescheiden koppelingsrecords per `(owner, ruimte, provider, external_subject)`. Eén gebruiker kan meerdere accounts van dezelfde aanbieder hebben. Het opnieuw koppelen van hetzelfde externe subject werkt het bestaande item bij en maakt geen duplicaat aan.
- Modus voor alleen-lezen of lezen+schrijven. De backend-tokenbroker controleert de aanwezigheid van de vereiste scopes (Microsoft/Dropbox), de status en de aanvullende lokale machtiging; deze vertrouwt niet op het vanuit de browser gewenste operatietype. Box stelt OAuth-scopes in binnen de eigen developer-console, waardoor 'alleen-lezen' in onze eigen UI een lokale beperking is en **geen belofte van een beperkte externe toestemming**.
- De browser ontvangt nooit refresh- of access-tokens. Tokens en eenmalige OAuth-gegevens worden met AES-256-GCM opgeslagen in PostgreSQL, waarbij de AAD `owner+space+account record id` bevat. De database is uitsluitend toegankelijk voor de systeemrol van de server.
- Vóór de start van OAuth bepalen we `owner` en `ruimte` in `ladePoort('cloud',...)`; na de callback vergelijken we deze met de opgeslagen eigenaar en ruimte, en wordt de toestand eenmalig verbruikt. De callback stuurt uitsluitend een resultaatcode terug naar `/overzicht`.
- Ontkoppelen blokkeert direct de lokale toegang en probeert vervolgens het token bij Dropbox/Box in te trekken. Microsoft heeft geen gelijkwaardig gegarandeerd per-grant endpoint: de lokale grant wordt geblokkeerd en de UI moet uitleggen waar de externe toestemming kan worden ingetrokken. Als externe intrekking niet is bevestigd, wordt de status `disconnect_pending` (niet 'alles ingetrokken').
- Een refresh-lock in PostgreSQL voorkomt dat twee browsers tegelijkertijd hetzelfde Box refresh-token gebruiken. Bij een onbepaald resultaat van een verlopen lease volgt `reauth_required` in plaats van een onveilige herhaalpoging.
- De canonieke Google Suite B+ grant blijft behouden; M4 wijst geen nieuwe primaire Gmail/Drive toe.
- React `CloudVerbindingCentrum` is een afzonderlijke responsieve component zonder duplicatie van CanonicalChrome. Deze is geschreven, maar **niet ingebouwd** in een live pagina. Het `BroadcastChannel`-signaal geeft uitsluitend het feit van een wijziging door, geen account of token; tussen browsers en apparaten wordt de lijst bijgewerkt via periodieke verzoeken aan de server. Het geselecteerde account staat in de `sessionStorage` van het huidige tabblad.

## 2. Wijzigingen

- `backend/cloud-verbinding-m4.ts`: eenmalige OAuth, validatie van eigenaar en ruimte, koppelen, opnieuw koppelen, hernoemen en ontkoppelen.
- `backend/cloud-verbinding-m4-providers.ts`: OAuth-URL's van aanbieders, tokenwisseling, `/me`, vernieuwen (refresh) en intrekken (revoke).
- `backend/cloud-verbinding-m4-pg.ts`: flow-/accountrepository, AES-GCM, multi-account-identiteit, PostgreSQL refresh-lease.
- `backend/cloud-verbinding-m4-token.ts`: tokenbroker op basis van `accountId` en operatie, serialisatie van refresh-acties.
- `backend/cloud-verbinding-m4-config.ts`: omgevingsconfiguratie (env), vastgelegde callback-host en -pad.
- `backend/cloud-verbinding-m4-routes.ts`: staging-API `list/start/callback/rename/disconnect`.
- `backend/cloud-platform.ts`: nieuwe routes binnen de bestaande `ladePoort('cloud')`.
- `backend/cloud-overdracht-credentials.ts`: nieuwe tokenbroker uitsluitend voor niet-Google-providers en alleen achter de staging-gate; Google blijft ongewijzigd.
- `migrations/0120_cloud_multi_account_connections.sql`: versleutelde grants, OAuth-flows, uniekheid van accounts, refresh-lease, RLS.
- `src/cloud/cloud-account-sync.ts`, `CloudVerbindingCentrum.tsx`, `cloud-verbinding-centrum.css`.
- `scripts/cloud-volledige-uitgave-poort.mjs`: 36 onafhankelijke acceptatiepunten, inclusief multi-account en toegang vanuit meerdere browsers.

## 3. Vereiste configuratie uitsluitend op een geïsoleerde testomgeving

Stel afzonderlijke app-registraties en toegestane callback-URL's in binnen Microsoft Entra / Microsoft Account, Dropbox App Console en Box Developer Console:

- `CLOUD_MICROSOFT_CLIENT_ID`, `CLOUD_MICROSOFT_CLIENT_SECRET` (server-side confidential app, consumer+organization-registratie volgens de ondersteunde accounttypen);
- `CLOUD_DROPBOX_CLIENT_ID`, `CLOUD_DROPBOX_CLIENT_SECRET`;
- `CLOUD_BOX_CLIENT_ID`, `CLOUD_BOX_CLIENT_SECRET`;
- `CLOUD_OAUTH_M4_REDIRECT_URI` — **exact** `https://api.tarasevych.com/api/owner/cloud/oauth/m4/callback` of `https://cloud.tarasevych.com/api/owner/cloud/oauth/m4/callback` volgens de feitelijke API reverse proxy;
- `CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1` — een nieuwe afzonderlijke 32-byte serversleutel; neem deze **niet** op in het archief; een plan voor sleutelrotatie moet nog worden geïmplementeerd.

Pas `CLOUD_M4_CONNECTIONS_STAGING=enabled` uitsluitend toe op een **geïsoleerde testomgeving**, niet in productie. Standaard retourneert de API `CLOUD_M4_NOT_RELEASED`. OAuth-clients moeten worden geregistreerd voor de feitelijke hostnaam, de echte redirect-URI en de exacte samenstelling van lees-/schrijfrechten; beleid voor beheerderstoestemming (admin consent) van Microsoft kan zakelijke accounts blokkeren.

## 4. API na activering van staging

Alle verzoeken lopen binnen de contour van `ladePoort('cloud')`. Ze accepteren geen door de browser aangeleverde `owner`, `ruimte`, bearer-token of willekeurige API-host.

- `POST /api/owner/cloud/integrations/v1/accounts/list` -> lijst met metadata (geen tokens).
- `POST /api/owner/cloud/integrations/v1/accounts/start` -> `{provider, mode}` -> officiële `url` en `flowId`.
- `GET /api/owner/cloud/oauth/m4/callback?state=...&code=...` -> hercontrole van sessie en ruimte, eenmalige PKCE-opslag, verificatie van externe identiteit, 303-redirect terug naar Cloud.
- `POST /api/owner/cloud/integrations/v1/accounts/:id/rename` -> `{label}`.
- `POST /api/owner/cloud/integrations/v1/accounts/:id/disconnect` -> `{confirm:true}`, lokale blokkering + poging tot externe intrekking (remote revoke).

Er zijn geen API's voor het uitvoeren van MOVE/COPY via de frontend; de M2/M3-transportcode is nog niet ingeschakeld voor live acceptatie. De tokenbroker is gereed als afhankelijkheid, maar de achtergrondworker moet `owner+space` verifiëren vanuit de PostgreSQL-job en niet standaard vertrouwen op een achtergrond-AsyncLocalStorage.

## 5. Werkingsprincipes in meerdere browsers / tabbladen

- Koppelingen en intrekkingen van toegang worden op de server vastgelegd en worden bij de volgende polling-ronde zichtbaar voor andere apparaten.
- `BroadcastChannel('tsv-cloud-accounts-v1')` wekt tabbladen van dezelfde origin; tussen subdomeinen werkt dit kanaal niet — daarvoor zijn een gedeelde serverstatus en polling of toekomstige SSE vereist.
- Het specifieke actieve account wordt niet opgeslagen in de algemene `localStorage` van de browser en wordt **niet** voor iedereen als globaal gesynchroniseerd. Voor verschillende tabbladen wordt `sessionStorage` gebruikt, en voor workertaken een expliciet account-ID in de server-side job.
- Een OAuth-wijziging in een willekeurig tabblad maakt de lokaal weergegeven gegevens ongeldig na de eerstvolgende serververnieuwing. Langlopende operaties moeten bij intrekking van een grant stoppen na hercontrole van de rechten.

## 6. Harde blokkades vóór volledige release

1. Geregistreerde OAuth-apps bij aanbieders en server-secrets, succesvolle auth-code/PKCE-callbacks, daadwerkelijk 2 accounts van dezelfde aanbieder én zakelijk+privé tegelijk.
2. Box confidential OAuth zonder de schijn van beperkte scopes; verificatie van least privilege, admin-consent voor Microsoft, refresh/revoke per aanbieder; daadwerkelijke rotatie van de Vault-encryptiesleutel.
3. Nextcloud Login Stroom v2 met bescherming tegen egress/SSRF/DNS-rebinding, S3 IAM-/rol-credentials zonder willekeurige access sleutels in de browser; deze wizards zijn **NIET geschreven** in M4.
4. Daadwerkelijke inschakeling van de achtergrondworker, hervatten van grote bestanden, COPY/MOVE E2E voor alle aangekondigde providers. Voorwaardelijke VERWIJDEREN, crash/reconciliatie; M2/M3 werken momenteel niet in productie.
5. Echte provider-deelrechten (share permissions) met opgave van vervaldatum/rol/intrekking en versiebeheer met herstel; volledige controle van de Universal Bestand Workspace.
6. Staging PostgreSQL-migratie 0119 + test van sleutelbeheer/RLS; Node.js 24+ volledige typecheck/build, desktop/mobiel en E2E met 2 browsers / 2 tabbladen / 2 apparaten.
7. Definitieve lijst van ondersteunde aanbieders vaststellen. Aanbieders zonder volwaardige API of onboarding mogen niet worden gemarkeerd als 'koppeling beschikbaar'.
8. Afstemming met de **nieuwste** productiebasis. Onze basis is 20261027-212158; als er al een latere uitgave bestaat, is eerst een drieweg-merge (three-way merge) vereist.

Technische releasecontrole — `node scripts/cloud-volledige-uitgave-poort.mjs`. Momenteel is het resultaat BLOCKED met 36/36 onvervulde bewijsstukken. Deze lokale poort zelf is nog **niet ingebouwd in het beheerdersinstallatieprogramma**. Omzeil deze niet handmatig: er zijn echte CI-artefacten en live E2E-tests nodig.

## 7. Controles

```bash
node --experimental-strip-types --test \
  tests/eenheid/cloud-integratie-contract.test.ts \
  tests/eenheid/cloud-overdracht-m2.test.mjs \
  tests/eenheid/cloud-overdracht-m3.test.mjs \
  tests/eenheid/cloud-m3-gate.test.mjs \
  tests/eenheid/cloud-versies-m3.test.mjs \
  tests/eenheid/cloud-delen-m3.test.mjs \
  tests/eenheid/cloud-verbinding-m4.test.mjs
node scripts/cloud-volledige-uitgave-poort.mjs
```

Resultaat: **104/104 offline unit-/mocktests geslaagd; release gate BLOCKED/exit 2**.

`npm run typecheck:server` kon in de huidige container geen volledige controle uitvoeren vanwege ontbrekende `@types/node`. `node scripts/plaatsing-controle.mjs` mist esbuild. Lokaal draait Node.js 22, terwijl het project 24+ vereist. Deze omgevingsfouten staan niet toe dat de build als geslaagd wordt verklaard.
