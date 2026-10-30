# Cloud Google Drive Provider — B+ grant integration

Google Drive uses `https://www.googleapis.com/auth/drive`, Google's full restricted Drive scope. The provider foundation requests read, create, update, delete and permission capabilities, but performs no automatic deletion, overwrite, indexing, Changes API processing or background synchronization in this checkpoint.

## Account model

Drive participates in the shared provider-principal architecture. The sign-in-matching Google identity is the primary principal and is connected through the second step of the Suite plan. Other Drive accounts are explicit additional principals and remain outside the primary sequence. Active Drive selection is owner-scoped and independent from the ecosystem identity session.

## B+ token model

Drive no longer owns a separate refresh-token vault or OAuth client. One canonical encrypted grant is stored per Google provider principal in `google_oauth_grant_v1` and uses the shared client reference `google_suite_web_oauth_client`.

`google_drive_token` is a logical handle in `provider_service_tokens_v1`:

```text
google_drive_token
→ oauthGrantId
→ requiredScopes = [https://www.googleapis.com/auth/drive]
```

Before refresh or API use the backend requires `requiredScopes ⊆ grantedScopes`. Access tokens are ephemeral and never persisted.

Required AppDeploy secrets:

- `GOOGLE_SUITE_CLIENT_ID`
- `GOOGLE_SUITE_CLIENT_SECRET`
- `GOOGLE_SUITE_REDIRECT_URI` — exactly `https://id.tarasevych.com/`
- `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1`

## Tables

- `provider_principals_v1`
- `google_oauth_grant_v1`
- `provider_service_tokens_v1`
- `provider_service_grants_v1`
- `google_suite_oauth_states_v1`
- `cloud_provider_accounts_v1`
- `cloud_provider_selections_v1`
- `cloud_audit_v1`

`cloud_provider_tokens_v1` is legacy-only. A matching legacy Drive refresh-token copy is deleted after the canonical grant is committed.

## Consent and disconnect semantics

Primary Drive consent requires every prior Suite step. Additional Drive linking remains explicit and creates a separate principal grant. A mismatched Google account cannot silently become primary.

Disconnect deactivates only the Drive handle and Drive account. If Mail, Calendar or Photos still depends on the same principal grant, Google-level revocation is not attempted. When Drive is the final active handle for that principal, revocation is attempted best-effort and the canonical grant is marked revoked. Local copies are retained.

## Checkpoint boundary

Included: shared-client incremental consent, PKCE S256, one encrypted principal grant, logical Drive handle, primary/additional accounts, selection, audit and explicit disconnect.

Not active: initial listing, Changes API, workers, automatic file mutations, conflict resolution, sharing, OneDrive, Dropbox, Mail runtime migration, Calendar runtime or Photos runtime.
