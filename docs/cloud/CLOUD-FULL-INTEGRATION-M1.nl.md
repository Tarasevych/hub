> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./CLOUD-FULL-INTEGRATION-M1.uk.md) · **🇳🇱 Nederlands** ([origineel](./CLOUD-FULL-INTEGRATION-M1.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Cloud Full Integration · M1 (ontwikkeling, GEEN release)

**Datum:** 2026-10-28. **Basis:** `mijn-ruimte-20261027-212158.tar.gz` — *integratiekandidaat*, GEEN bewijs van installatie. De geïnstalleerde versie kan afwijken. **Release gate:** `BLOCKED_PENDING_FULL_PROVIDER_ACCEPTANCE`. Dit document vormt een aanvulling op `CLOUD-RELEASE-CONTRACT-FULL-INTEGRATION-20261028.uk.md`.

## Wat er in de code is geschreven

- `shared/cloud-integratie-contract.ts`: stabiele identificatoren voor bestanden/ruimtes/accounts, 16 acties, resultaattypen (`native`, `gateway`, `needs-consent`, `forbidden`, `unavailable`, `temporarily-unavailable`), toegankelijkheidsregels, whitelist van de huidige Cloud-native 6 MiB en een fail-closed uitvoeringsplan.
- `shared/cloud-aanbieder-register.ts`: strikt register van provideradapters; staat niet toe dat een provider tweemaal wordt geregistreerd en leest niet tussen verschillende ruimtes.
- `backend/cloud-integratie-google.ts`: actuele Google Drive `files.get` via de bestaande B+ grant en de bestaande accountsnapshot; token wordt niet aan de gebruiker geretourneerd; metadata-ACL wordt bij elk verzoek opgehaald van Google; timeout van 12 s, zonder ongeautoriseerde redirects.
- `backend/cloud-integratie-register.ts`: daadwerkelijk is alleen Google Drive gekoppeld voor live inspectie; er zijn geen andere adapters gesimuleerd.
- `backend/cloud-integratie-routes.ts`: nieuwe **read-only** POST-routes `status`, `google/file/capabilities`, `transfer/plan`.
- `backend/cloud-platform.ts`: minimale integratie van routes in de **reeds bestaande** `ladePoort('cloud', authorize, ...)`.
- `tests/eenheid/cloud-integratie-contract.test.ts`: geautomatiseerde controles van beleid, foutieve machtigingen, isolatie, MOVE, MIME, 6 MiB.

**Geen enkele wijziging** in `package.json`, OAuth, migraties, Identity, UI, CanonicalChrome, SSH, uitrol of betaalfuncties. De nieuwe Cloud UI is **niet geactiveerd**.

## Wat NIET is geïmplementeerd (mag niet als gereed worden bestempeld)

1. Werkende OAuth-connectoren voor OneDrive, SharePoint, Dropbox, Nextcloud, Box, S3 en GitHub in Cloud; zakelijk beleid en tenant-consent.
2. Volledig Cloud-native bestandsstuurprogramma: de huidige Quick Capture heeft een limiet van **6 MiB** en is niet gelijkwaardig aan volwaardige opslag.
3. Streaming overdrachtsworker tussen providers, duurzame transfer jobs, deduplicatie en idempotentie, delete-after-verify.
4. Native/gateway-sharing en veiligheidsbewijs voor isolatie/ACL/intrekking (revocation).
5. Universal File Workspace als feitelijke uniforme editor/viewer voor alle bronnen; preview in de uniforme API is opzettelijk **disabled**.
6. Echte verificatie in een geautoriseerd Google-account, productie-Node24-build, provider E2E. De nieuwe API-routes zijn niet getest via een echte sessie; unit-tests controleren alleen zuivere logica.

## Beschikbare serverroutes (GEEN frontend)

```text
POST /api/owner/cloud/integrations/v1/status
POST /api/owner/cloud/integrations/v1/google/file/capabilities
  body: { "accountId": "<connected-account-id>", "fileId": "<google-drive-file-id>", "tabContext": "<existing-session-context>" }
POST /api/owner/cloud/integrations/v1/transfer/plan
  body: {
    "mode": "copy",
    "source": { "provider": "google-drive", "accountId": "...", "fileId": "...", "space": "prive" },
    "target": { "provider": "cloud-native", "accountId": "own", "space": "prive" },
    "tabContext": "<existing-session-context>"
  }
```

De derde route retourneert altijd `decision: blocked` en als reden `TRANSFER_EXECUTOR_NOT_READY`, zelfs als alle invoerrechten kloppen. **Er bestaat geen POST voor het uitvoeren van de overdracht**. Dit is een bewuste veiligheidseis en geen afgerond bedrijfsscenario. De client mag de knop 'Overzetten' niet als actief weergeven.

## Volgende fase M2

1. De kopie vergelijken met de actuele gedeployde Git SHA / het archief. `Tarasevych/hub` bevat in de beschikbare branch `voornaamst` geen `package.json`; GitHub-commit `bdb63c9d...` is daarin niet gevonden. Forceer geen merge naar deze repository zonder bevestiging van de bron van waarheid.
2. Het atomaire levenscyclusproces voor overdrachten in PostgreSQL afstemmen: `plan → authorize → stream → verify → commit`, `idempotency` met unieke index en herhaalde ACL-controle bij elke wijziging. Het plan moet owner + space + provider/account/resource + etag opslaan, zonder tokens.
3. Google → eigen Cloud pas koppelen na het opheffen van de 6 MiB-/formaatlimiet of via een duidelijke speciale bounded flow. Eerst COPY. MOVE pas na bevestiging van copy en delete-after-verify.
4. Uniforme adapters en contracttests toevoegen voor Microsoft Graph (Personal/Business/SharePoint), Dropbox, Nextcloud/WebDAV+OCS en Box. Elk met een eigen model voor OAuth/ACL/paginering/resumable upload/rate limits.
5. Geïsoleerde QA-fixture implementeren voor negatieve permissietests. De bestaande Mail/Drive-documentviewer zonder regressies overbrengen naar de gedeelde kern.
6. Na goedkeuring van alle aangekondigde providers — `/overzicht` en de geïntegreerde UI implementeren, volledige e2e, staging en rollback uitvoeren; één nieuwe UITROL-VERSIE vormen.

## Lokale controles

```bash
node --experimental-strip-types --test tests/eenheid/cloud-integratie-contract.test.ts
# Op een Node24+-machine met afhankelijkheden:
npm ci
npm run typecheck:server
npm run build
```

In de sandbox van de huidige sessie: Node 22.16.0, `npm ci` is niet voltooid; er is geen echte Google API-consenttest. **Niet uitrollen naar productie** vóór volledige verificatie.
