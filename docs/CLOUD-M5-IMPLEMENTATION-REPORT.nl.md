> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./CLOUD-M5-IMPLEMENTATION-REPORT.uk.md) · **🇳🇱 Nederlands** ([origineel](./CLOUD-M5-IMPLEMENTATION-REPORT.md)) · [🏠 Hoofdpagina (NL)](../LEESMIJ.md) · [🏠 Головна (UK)](../README.md) · [📚 Documentatie-index](../docs/INDEX.nl.md)

# Cloud Full Integration M5 — Golf van 10 diensten, driverlaag en vrijgavecontrole
**Status: DEVELOPMENT ONLY / NIET INSTALLEREN.**
Basis: projectkopie `20261027-212158` met opeenvolgende M1–M4. Datum: 28-10-2026.

## 1. Wat er daadwerkelijk is gewijzigd

Alle M1–M4-onderdelen zijn behouden en uitgebreid met:
- `shared/cloud-m5-catalogus.ts`: catalogus van **11 verbindingstypen / 10 diensten** (OneDrive Personal/Business gescheiden), API-families, autorisatie, bovengrens van mogelijkheden, beperkingen en een eerlijke gereedheidsstatus. Publieke capabilities in de catalogus betekenen **NIET** dat bijbehorende UI-acties al gereed zijn.
- `backend/cloud-m5-pcloud.ts`: transport voor `stat/download/upload` naar pCloud, met strikte keuze tussen US/EU API-host, bearer-authenticatie uitsluitend vanaf de server, geen token in CDN-verzoeken, responscontrole en limieten van 32 MiB.
- `backend/cloud-m5-pcloud-oauth.ts`: serverlogica voor pCloud OAuth 2.0 `code`-flow: toestemmings-URL, eenmalige state, controle van eigenaar/ruimte, host/locationid, server-side tokenuitwisseling en doorgifte van het ontvangen token aan de **versleutelde opslaginterface** (vereist een daadwerkelijke repository-implementatie). pCloud retourneert geen standaard refresh-token; de code verzint deze niet.
- `backend/cloud-m5-backblaze.ts`: B2 S3-compatibele SigV4 `HEAD/GET/PUT`, eindpunt `s3.<region>.backblazeb2.com`, server-side B2-applicatiesleutels en bescherming tegen overschrijven. Geen willekeurige eindpunt-URL's.
- `backend/cloud-m5-github.ts`: GitHub REST Contents `stat/download/create`, verplichte geverifieerde server-repo/branch, per-repo toegangstoken via broker. Upload is het **aanmaken van een commit**, geen gewone bestandsupload. Verwijderen, MOVE, LFS en grote bestanden zijn nog niet geïmplementeerd.
- `backend/cloud-m5-driver-registry.ts`: registratie uitsluitend na geverifieerde bevestiging door een afzonderlijke CI/accepted-live verifier, met overeenkomst op owner+space+accountId.
- `backend/cloud-m5-governor.ts`: beslissingsmodel van de eigenaar in de actieve technische ruimte. Atomaire wijziging met audit via repository-interface en CAS-versies. Nog niet gekoppeld aan de beheerroute totdat de autorisatie is geverifieerd.
- `backend/cloud-m5-catalogue-routes.ts`: één alleen-staging beveiligde route `POST /api/owner/cloud/integrations/v1/catalogue`; retourneert **not-ready**-statussen zolang bewijs ontbreekt. Alleen gekoppeld binnen de bestaande `ladePoort('cloud')` in `cloud-platform.ts`. Vlag `CLOUD_M5_CATALOGUE_STAGING` staat standaard op OFF.
- `src/cloud/CloudAanbiedersM5.tsx` + CSS: responsieve overzichtspagina van ondersteuning, zonder duplicatie van CanonicalChrome en zonder fictieve knop "Verbinden". De component is nog niet ingebouwd in de productienavigatie.
- `shared/cloud-integratie-contract.ts`: namen `pcloud`, `backblaze-b2` voor eenduidige bestandsverwijzingen.
- `scripts/cloud-volledige-uitgave-poort.mjs`: +9 live/CI-bewijsblokkades voor M5. Nu **45 verplichte controles**, in dit pakket op `BLOCKED`.
- `tests/eenheid/cloud-m5-aanbieder-golf.test.mjs`: 29 nieuwe offline tests.

## 2. Eerste golf van providers: werkelijke API-mogelijkheden ≠ integratiegereedheid

| Dienst | Toegang | Code vóór M5 | Nieuwe code M5 | Blokkade voor live gebruik |
|---|---|---|---|---|
| Google Drive | Canonieke Google OAuth | Aanwezig in huidig project en M1/M2 | Mogelijkhedencatalogus | Live E2E, uniforme overdrachten/rechten |
| OneDrive Personal | Microsoft OAuth PKCE | M2/M4 | Catalogus | app-registratie, scopes, live E2E |
| OneDrive Business | Microsoft OAuth PKCE | M2/M4 | Catalogus | tenant-beleid, live E2E |
| SharePoint | Microsoft Graph, consent | M2/M4 | Catalogus | site/drive-detectie, tenant-toestemming |
| Dropbox | OAuth PKCE | M2/M4 | Catalogus | app-registratie, teamaccount-scopes, E2E |
| Box | OAuth confidential | M3/M4 | Catalogus | app-registratie, samenwerkingsbeleid, E2E |
| Nextcloud | Login Flow v2 + WebDAV/OCS | WebDAV-transport M3 | Catalogus | onboarding van vertrouwde instantie, SSRF/DNS/egress-controles |
| Amazon S3 | IAM/STS SigV4 | M3 | Catalogus | veilige IAM-rol-onboarding, multipart/resume E2E |
| Backblaze B2 | Bucket-gebonden app-sleutel / S3-compatibel | — | SigV4 read/stat/upload | versleutelde sleutelkluis, rechten, live E2E |
| pCloud | OAuth-code US/EU | — | OAuth-flow + bestandstransport | echte versleutelde repository, callback, live E2E |
| GitHub | GitHub App gebruikers-/installatietoegang | GitHub-ecosysteem afzonderlijk | Repository-bestandstransport | GitHub App-installatie/gebruikerstoestemming, repo-selectie, rechten, versie-/commit-E2E |

In totaal 10 diensten en **11 afzonderlijke connectortypen**, omdat OneDrive Personal en OneDrive Business niet veilig aan elkaar gelijkgesteld kunnen worden.

## 3. Hoe het beheer georganiseerd moet zijn

### Gebruiker
Afzonderlijke combinatie van eigenaar+ruimte+verbindings-ID; elk account krijgt een herkenbare alias. De bronkeuze in één tabblad wijzigt de overige tabbladen niet. De lijst met verbindingen komt altijd van de server. Na intrekking van toegang start er geen enkele nieuwe achtergrondoverdracht meer vanuit dat account. De browser ontvangt nooit refresh-tokens of geheime inloggegevens.

### Site-eigenaar
Providercatalogus -> toegestaan beleid -> controle van live CI-bewijs -> inschakelen. Inschakelen biedt GEEN mogelijkheid om OAuth en ACL per gebruiker te omzeilen. Er zijn twee afzonderlijke opties: nieuwe verbindingen en bewerkingen op bestaande verbindingen. Elke wijziging heeft een auditregistratie en atomaire CAS. In M5 zijn dit een domeinmodule en tests; het admin HTTP-eindpunt + PG-implementatie en attestatie ontbreken nog.

### Verbindingswizard
OAuth: "Verbinden" -> officiële toestemming -> server-callback -> account met rechten -> bestandscontrole. Verbindingen op basis van sleutels (S3, B2) **kunnen niet eerlijk één-klik-OAuth worden genoemd**: hiervoor moet eerst een IAM-rol of app-sleutel met minimale rechten worden aangemaakt, gevolgd door sleutel- en regiocontrole op de server. Nextcloud gebruikt Login Flow v2 met een bevestigde instantie-URL; GitHub gebruikt GitHub App-installatie + toestemming in plaats van een willekeurig PAT.

## 4. Teststatus

- `node --experimental-strip-types --test` voor M1–M5: **133/133 geslaagd** (offline unit/mock). Uitsluitend mock/logica, geen echte serviceaccounts.
- `node scripts/kaart-controle.mjs --stil`: retourneert 0 met waarschuwingen over enkele Engelstalige bestandsnamen.
- `node scripts/cloud-volledige-uitgave-poort.mjs`: exit 2, **BLOCKED 45/45** — geen live E2E-bewijsstukken aanwezig.
- **Niet uitgevoerd:** volledige Node.js 24+ build, DB-migraties op staging, multi-browser E2E, limieten/tarieven van live accounts, echte OAuth voor elke provider.

## 5. Kritieke beveiligingseisen vóór vrijgave

1. **M5-transportcode wordt nog niet geregistreerd in het productieregister**, hoewel realistische netwerkverzoeken zijn geïmplementeerd. Er zijn credential-resolvers vanuit PostgreSQL/Vault en owner-space-account-identiteit voor elke provider nodig, inclusief tests voor ingetrokken grants.
2. Nextcloud en alle zelfgehoste opslagdiensten: bescherming van netwerkadressen, DNS-rebinding, privé-IP's, redirects en poorten. Een regex-URL-controle op JS-niveau is onvoldoende — de netwerkproxy moet uitgaand verkeer (egress) afdwingen.
3. Kopiëren: hervatbare overdracht (resumable transfer), echte opslag van job-status, SHA-256 na download en compensatie bij gedeeltelijke kopie. MOVE mag niet worden geactiveerd voor pCloud/GitHub/B2 zonder geverifieerde voorwaardelijke verwijdering of een veilig alternatief.
4. Meerdere accounts van dezelfde provider: live twee-tabbladen, twee-browsers, gelijktijdig persoonlijk/zakelijk, selectie per tabblad en annulering van taken bij ontkoppeld account.
5. Behoud van gedeelde ACL's tussen providers is niet gegarandeerd. Er is een expliciete conversie/rapportage met verschillen vereist, geen stilzwijgende ACL-kopie.
6. De uniforme viewer en Cloud-UI worden pas samen met echte adapters geactiveerd. Demoknoppen en statische statussen zijn niet toegestaan op een productiepagina.
7. Afzonderlijk eigenaarsbeheer: toegestane servicetools, scope-configuratie, OAuth-app-status, webhooks, wachtrijen, audit, foutmeldingen zonder geheimen; vereist superadmin-rechten + actief technisch profiel.
8. De code en de huidige productieserver kunnen van elkaar afwijken. Vóór integratie is bevestiging van de exacte productierelease/commit vereist; bouw GEEN release op basis van een historisch archief als productie inmiddels is bijgewerkt.

## 6. Officiële API-documentatie

- Google Drive v3: https://developers.google.com/workspace/drive/api/reference/rest/v3
- Microsoft Graph Drive: https://learn.microsoft.com/en-us/graph/api/resources/driveitem
- Dropbox: https://www.dropbox.com/developers/documentation/http/documentation
- Box: https://developer.box.com/reference/
- Nextcloud Login Flow/WebDAV: https://docs.nextcloud.com/server/stable/developer_manual/client_apis/
- AWS S3: https://docs.aws.amazon.com/AmazonS3/latest/API/Welcome.html
- Backblaze S3-compatibel: https://www.backblaze.com/apidocs/introduction-to-the-s3-compatible-api
- pCloud OAuth/API: https://docs.pcloud.com/methods/oauth_2.0/authorize.html
- pCloud toegangstoken: https://docs.pcloud.com/methods/oauth_2.0/index.html
- GitHub App gebruikerstokens: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
- GitHub repository Contents: https://docs.github.com/en/rest/repos/contents

## 7. Volgende golven

Na de eerste golf van 10 diensten te beoordelen: Wasabi S3, Cloudflare R2, DigitalOcean Spaces (S3), Synology DSM, ownCloud / generieke WebDAV, Google Cloud Storage, Azure Blob, iCloud Drive (uitsluitend indien er een aanvaardbare officiële API of juridisch toegestaan mechanisme bestaat). Geen "volledige" functies zonder technische of juridische API-bevestiging.

**Maak geen `.tar.gz`-updatepakket aan** zolang de vrijgavepoort geen geverifieerd CI-bewijs heeft en alles in één gezamenlijke release is samengevoegd.
