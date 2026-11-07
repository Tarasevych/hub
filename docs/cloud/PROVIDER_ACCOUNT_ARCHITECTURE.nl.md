> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./PROVIDER_ACCOUNT_ARCHITECTURE.uk.md) · **🇳🇱 Nederlands** ([origineel](./PROVIDER_ACCOUNT_ARCHITECTURE.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Architectuur voor provideraccounts — canonieke B+

## Kernrecords

- `provider_principals_v1`: één Google-/Microsoft-/enz.-identiteit per eigenaar en provideraccount.
- `google_oauth_grant_v1`: één versleutelde Google refresh-credential per Google-provider-principal.
- `provider_service_grants_v1`: één servicespecifiek levenscyclusrecord per principal en service.
- `provider_service_tokens_v1`: logische service-handles die verwijzen naar een canonieke grant en geen versleutelde inloggegevens (ciphertext) bevatten.
- door de service beheerde accountrecords: operationele metadata voor Drive, Mail, Calendar, Photos en toekomstige services.

## Primair account

De Google-identiteit die wordt gebruikt voor aanmelding bij het ecosysteem wordt de primaire provider-principal na exacte verificatie van het e-mailadres en het provider-subject. Het systeem presenteert een plan volgens Mail → Drive → Calendar → Photos. Elke nieuwe gevoelige (sensitive) of beperkte (restricted) set scopes vereist expliciete incrementele toestemming.

Na toestemming hergebruiken services de canonieke grant van de principal. Er wordt geen herhaalde autorisatie gevraagd zolang de grant geldig blijft en de vereiste scopes van de service bevat.

## Aanvullende accounts

Aanvullende accounts worden altijd expliciet gekoppeld en blijven buiten de primaire reeks. Elk aanvullend Google-account heeft een eigen provider-principal, canonieke grant, service-grants, logische handles, operationele accountrecords, selectiestatus en auditlevenscyclus. Het hergebruikt dezelfde Suite Web OAuth Client, maar hergebruikt nooit de refresh-credential van een andere principal.

## Logische tokennamen

- `google_identity_token` — Identity-authenticatie blijft een afzonderlijk contract.
- `google_mail_token`
- `google_drive_token`
- `google_calendar_token`
- `google_photos_token`

De vier Suite-namen zijn logische handles, geen vier kopieën van refresh-tokens. Access-tokens zijn vluchtig (ephemeral) en worden nooit persistent opgeslagen.

## OAuth- en scopegrens

Mail, Drive, Calendar en Photos gebruiken één Web OAuth Client en één Google Cloud-project. Incrementele autorisatie verzamelt door de aanbieder goedgekeurde scopes in de canonieke principal-grant. Vóór elke service-aanroep dwingt de backend het volgende af:

```text
requiredScopes ⊆ grantedScopes
```

Servicestatus, tijdstempels, audit en lokale intrekking blijven onafhankelijk. Een lokale ontkoppeling van een service trekt een gedeelde provider-grant niet in zolang een andere actieve service-handle ervan afhankelijk is.

## Wisselen van account

Het wisselen van het ecosysteemaccount bepaalt de bijbehorende provider-principal en diens service-handles. Het geselecteerde provideraccount van Drive blijft gebonden aan de eigenaar (`owner-scoped`) en kan onafhankelijk worden gewijzigd. Aanvullende accounts worden nooit gepromoveerd tot primair account zonder een exact aan de identiteit gekoppelde handeling.

## Runtimegrens

De beschikbaarheid van een grant staat niet gelijk aan activering in runtime. Mail-providermigratie, Drive-indexering/Changes/workers, Calendar-ingestie en Photos-ingestie vereisen afzonderlijk geaccepteerde checkpoints.
