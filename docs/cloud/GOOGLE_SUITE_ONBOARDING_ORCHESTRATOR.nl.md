> 🌐 **Taal / Мова:** [🇺🇦 **Українська версія**](./GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR.uk.md) · **🇳🇱 Nederlands** ([origineel](./GOOGLE_SUITE_ONBOARDING_ORCHESTRATOR.md)) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [🏠 Головна (UK)](../../README.md) · [📚 Documentatie-index](../../docs/INDEX.nl.md)

# Primaire Google Suite Onboarding-orchestrator — B+

## Scope

De primaire Google-identiteit wordt gekoppeld via één Google Cloud-project en één Web OAuth Client. Toestemming blijft contextueel en opeenvolgend:

1. Mail
2. Drive
3. Calendar
4. Photos

Elke stap is een expliciet incrementeel autorisatieverzoek. De reeks activeert geen Mail-migratie, Drive-indexering/Changes/workers, Calendar-ingestie of Photos-ingestie.

## Canoniek grant-model

`google_oauth_grant_v1` slaat exact één versleutelde refresh-credential op per Google-provider-principal:

- `principalId`
- `providerAccountId`
- `clientRef = google_suite_web_oauth_client`
- AES-256-GCM-envelop
- cumulatieve `grantedScopes`
- `grantStatus`
- `issuedAt`
- `lastVerifiedAt`

Het refresh-token wordt nooit gekopieerd naar servicerijen. Access-tokens worden op aanvraag vernieuwd en nooit persistent opgeslagen.

## Logische service-handles

`provider_service_tokens_v1` bevat uitsluitend logische handles:

- `google_mail_token`
- `google_drive_token`
- `google_calendar_token`
- `google_photos_token`

Elke handle verwijst naar `oauthGrantId`, bewaart zijn eigen `requiredScopes`, status, tijdstempels en intrekkingsstatus, en bevat geen cijfertekst (ciphertext). Vóór een API-aanroep dwingt de backend het volgende af:

```text
requiredScopes ⊆ grantedScopes
```

`provider_service_grants_v1` blijft de servicespecifieke levenscyclus- en auditgrens.

## Isolatie van principals en accounts

De Google-identiteit die overeenkomt met de aanmelding bij het ecosysteem is de primaire provider-principal. Aanvullende Drive-accounts blijven expliciet en vallen buiten de primaire reeks. Elke aanvullende Google-identiteit krijgt een eigen provider-principal en een eigen canonieke `google_oauth_grant_v1`-rij, terwijl dezelfde Web OAuth Client-configuratie wordt hergebruikt.

Het ontkoppelen van één Drive-handle trekt een gedeelde primaire Google-grant niet in zolang een andere service-handle actief is. Intrekking bij de provider wordt alleen geprobeerd wanneer geen enkele andere actieve handle afhankelijk is van die principal-grant.

## Persistente tabellen

- `provider_principals_v1`
- `google_oauth_grant_v1`
- `provider_service_tokens_v1` — uitsluitend logische handles
- `provider_service_grants_v1`
- `google_suite_oauth_states_v1`
- `google_suite_onboarding_v1`
- `cloud_provider_accounts_v1`
- `cloud_provider_selections_v1`

Legacy-kopieën van refresh-tokens in `provider_service_tokens_v1` of `cloud_provider_tokens_v1` worden pas verwijderd nadat een canonieke grant succesvol is weggeschreven.

## OAuth- en tokenregels

- één clientreferentie: `google_suite_web_oauth_client`;
- `access_type=offline`;
- `include_granted_scopes=true`;
- PKCE S256;
- exacte redirect naar de Identity-root;
- expliciete toestemming voor elke nieuwe set servicescopes;
- exacte overeenkomst met het primaire e-mailadres;
- tegen herhaling beveiligde (replay-safe) adresseerbare status en verwerkingslease;
- geen opslag van access-tokens;
- geen duplicatie van refresh-tokens.

## AppDeploy-secrets

- `GOOGLE_SUITE_CLIENT_ID`
- `GOOGLE_SUITE_CLIENT_SECRET`
- `GOOGLE_SUITE_REDIRECT_URI` — exact `https://id.tarasevych.com/`
- `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1`

Een ontbrekende of ongeldige gedeelde configuratie schakelt elke Suite-toestemmingsstap en alle extra Drive-koppelingen uit. De UI blijft fail-closed en claimt geen connectiviteit.
