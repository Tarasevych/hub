> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./PROVIDER_ACCOUNT_ARCHITECTURE.uk.md) · [🇳🇱 **Nederlandse versie**](./PROVIDER_ACCOUNT_ARCHITECTURE.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Provider Account Architecture — canonical B+

## Core records

- `provider_principals_v1`: one Google/Microsoft/etc. identity per owner and provider account.
- `google_oauth_grant_v1`: one encrypted Google refresh credential per Google provider principal.
- `provider_service_grants_v1`: one service-specific lifecycle record per principal and service.
- `provider_service_tokens_v1`: logical service handles that point to a canonical grant and contain no credential ciphertext.
- service-owned account records: operational metadata for Drive, Mail, Calendar, Photos and future services.

## Primary account

The Google identity used for ecosystem sign-in becomes the primary provider principal after exact email and provider-subject verification. The system presents a Mail → Drive → Calendar → Photos plan. Every new sensitive or restricted scope set requires an explicit incremental consent.

After consent, services reuse the principal's canonical grant. No repeated authorization is requested while the grant remains valid and contains the service's required scopes.

## Additional accounts

Additional accounts are always linked explicitly and remain outside the primary sequence. Each additional Google account has its own provider principal, canonical grant, service grants, logical handles, operational account records, selection state and audit lifecycle. It reuses the same Suite Web OAuth Client but never reuses another principal's refresh credential.

## Logical token names

- `google_identity_token` — Identity authentication remains a separate contract.
- `google_mail_token`
- `google_drive_token`
- `google_calendar_token`
- `google_photos_token`

The four Suite names are logical handles, not four refresh-token copies. Access tokens are ephemeral and never persisted.

## OAuth and scope boundary

Mail, Drive, Calendar and Photos use one Web OAuth Client and one Google Cloud project. Incremental authorization accumulates provider-approved scopes in the canonical principal grant. Before any service call the backend enforces:

```text
requiredScopes ⊆ grantedScopes
```

Service status, timestamps, audit and local revocation remain independent. A local service disconnect does not revoke a shared provider grant while another active service handle depends on it.

## Account switching

Switching the ecosystem account resolves the matching provider principal and its service handles. Drive's selected provider account remains owner-scoped and can be changed independently. Additional accounts are never promoted to primary without an exact identity-linked operation.

## Runtime boundary

Grant availability is not equivalent to runtime activation. Mail provider migration, Drive indexing/Changes/workers, Calendar ingestion and Photos ingestion require separate accepted checkpoints.
