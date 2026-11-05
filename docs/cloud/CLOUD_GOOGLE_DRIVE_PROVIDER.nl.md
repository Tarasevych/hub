> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./CLOUD_GOOGLE_DRIVE_PROVIDER.uk.md) · **🇳🇱 Nederlands** ([origineel](./CLOUD_GOOGLE_DRIVE_PROVIDER.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Cloud Google Drive-provider — B+ grant-integratie

Google Drive gebruikt `https://www.googleapis.com/auth/drive`, de volledige beperkte (restricted) Drive-scope van Google. De providerbasis vraagt rechten aan voor lezen, aanmaken, bijwerken, verwijderen en machtigingen, maar voert in dit checkpoint geen automatische verwijdering, overschrijving, indexering, Changes API-verwerking of achtergrondsynchronisatie uit.

## Accountmodel

Drive neemt deel aan de gedeelde `provider-principal`-architectuur. De Google-identiteit die overeenkomt met de aanmelding is de primaire principal en wordt gekoppeld via de tweede stap van het Suite-plan. Andere Drive-accounts zijn expliciete aanvullende principals en blijven buiten de primaire reeks. De actieve Drive-selectie is gebonden aan de eigenaar (`owner-scoped`) en onafhankelijk van de identiteitssessie van het ecosysteem.

## B+ tokenmodel

Drive beheert niet langer een afzonderlijke refresh-token-kluis of OAuth-client. Er wordt één canonieke versleutelde grant per Google-provider-principal opgeslagen in `google_oauth_grant_v1`, die gebruikmaakt van de gedeelde clientreferentie `google_suite_web_oauth_client`.

`google_drive_token` is een logische handle in `provider_service_tokens_v1`:

```text
google_drive_token
→ oauthGrantId
→ requiredScopes = [https://www.googleapis.com/auth/drive]
```

Vóór het vernieuwen of gebruiken van de API vereist de backend `requiredScopes ⊆ grantedScopes`. Access-tokens zijn vluchtig (ephemeral) en worden nooit persistent opgeslagen.

Vereiste AppDeploy-secrets:

- `GOOGLE_SUITE_CLIENT_ID`
- `GOOGLE_SUITE_CLIENT_SECRET`
- `GOOGLE_SUITE_REDIRECT_URI` — exact `https://id.tarasevych.com/`
- `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1`

## Tabellen

- `provider_principals_v1`
- `google_oauth_grant_v1`
- `provider_service_tokens_v1`
- `provider_service_grants_v1`
- `google_suite_oauth_states_v1`
- `cloud_provider_accounts_v1`
- `cloud_provider_selections_v1`
- `cloud_audit_v1`

`cloud_provider_tokens_v1` is uitsluitend voor legacy-doeleinden. Een overeenkomstige legacy-kopie van een Drive refresh-token wordt verwijderd nadat de canonieke grant is vastgelegd.

## Semantiek voor toestemming en ontkoppelen

Primaire Drive-toestemming vereist elke voorgaande Suite-stap. Het koppelen van extra Drive-accounts blijft expliciet en maakt een afzonderlijke principal-grant aan. Een niet-overeenkomend Google-account kan niet stilzwijgend primair worden.

Ontkoppelen deactiveert alleen de Drive-handle en het Drive-account. Als Mail, Calendar of Photos nog afhankelijk is van dezelfde principal-grant, wordt geen intrekking op Google-niveau geprobeerd. Wanneer Drive de laatste actieve handle voor die principal is, wordt intrekking op best-effort-basis geprobeerd en wordt de canonieke grant gemarkeerd als ingetrokken (`revoked`). Lokale kopieën blijven behouden.

## Checkpointgrens

Inbegrepen: incrementele toestemming via gedeelde client, PKCE S256, één versleutelde principal-grant, logische Drive-handle, primaire/aanvullende accounts, selectie, audit en expliciete ontkoppeling.

Niet actief: initiële lijstweergave, Changes API, workers, automatische bestandsmutaties, conflictoplossing, delen (sharing), OneDrive, Dropbox, Mail-runtimemigratie, Calendar-runtime of Photos-runtime.
