# Primary Google Suite Onboarding Orchestrator — B+

## Scope

The primary Google identity is onboarded through one Google Cloud project and one Web OAuth Client. Consent remains contextual and sequential:

1. Mail
2. Drive
3. Calendar
4. Photos

Every step is an explicit incremental authorization request. The sequence does not activate Mail migration, Drive indexing/Changes/workers, Calendar ingestion, or Photos ingestion.

## Canonical grant model

`google_oauth_grant_v1` stores exactly one encrypted refresh credential per Google provider principal:

- `principalId`
- `providerAccountId`
- `clientRef = google_suite_web_oauth_client`
- AES-256-GCM envelope
- cumulative `grantedScopes`
- `grantStatus`
- `issuedAt`
- `lastVerifiedAt`

The refresh token is never copied into service rows. Access tokens are refreshed on demand and never persisted.

## Logical service handles

`provider_service_tokens_v1` contains logical handles only:

- `google_mail_token`
- `google_drive_token`
- `google_calendar_token`
- `google_photos_token`

Each handle points to `oauthGrantId`, stores its own `requiredScopes`, status, timestamps and revocation state, and contains no ciphertext. Before an API call the backend enforces:

```text
requiredScopes ⊆ grantedScopes
```

`provider_service_grants_v1` remains the service-specific lifecycle and audit boundary.

## Principal and account isolation

The ecosystem sign-in-matching Google identity is the primary provider principal. Additional Drive accounts remain explicit and outside the primary sequence. Each additional Google identity receives its own provider principal and its own canonical `google_oauth_grant_v1` row, while reusing the same Web OAuth Client configuration.

Disconnecting one Drive handle does not revoke a shared primary Google grant while another service handle is active. Provider revocation is attempted only when no other active handle depends on that principal grant.

## Persistent tables

- `provider_principals_v1`
- `google_oauth_grant_v1`
- `provider_service_tokens_v1` — logical handles only
- `provider_service_grants_v1`
- `google_suite_oauth_states_v1`
- `google_suite_onboarding_v1`
- `cloud_provider_accounts_v1`
- `cloud_provider_selections_v1`

Legacy refresh-token copies in `provider_service_tokens_v1` or `cloud_provider_tokens_v1` are removed only after a canonical grant has been written successfully.

## OAuth and token rules

- one client reference: `google_suite_web_oauth_client`;
- `access_type=offline`;
- `include_granted_scopes=true`;
- PKCE S256;
- exact Identity-root redirect;
- explicit consent for every new service scope set;
- exact primary-email match;
- replay-safe addressable state and processing lease;
- no access-token persistence;
- no refresh-token duplication.

## AppDeploy secrets

- `GOOGLE_SUITE_CLIENT_ID`
- `GOOGLE_SUITE_CLIENT_SECRET`
- `GOOGLE_SUITE_REDIRECT_URI` — exactly `https://id.tarasevych.com/`
- `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1`

Missing or invalid shared configuration disables every Suite consent step and all additional Drive linking. The UI remains fail-closed and does not claim connectivity.
