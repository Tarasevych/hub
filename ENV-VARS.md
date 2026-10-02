# Secrets / env vars (generate ALL new values; never reuse old ones)

| Name | Purpose |
|---|---|
| GOOGLE_OAUTH_CLIENT_SECRET (alias GOOGLE_SUITE_CLIENT_SECRET) | Google OAuth client secret (login and Google Suite). Rotate it in Google Cloud Console, or create a new client. |
| GOOGLE_OAUTH_CLIENT_ID / GOOGLE_SUITE_CLIENT_ID | Google OAuth client ID (public). A default is hardcoded in google-contour.ts. |
| GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 | Encrypts stored Google grants and refresh tokens (≥32 random chars, dedicated). |
| OWNER_VAULT_ENCRYPTION_KEY_V1 | Encrypts API-platform vault items. Now mandatory. |
| MAIL_TOKEN_ENCRYPTION_KEY_V1 | Encrypts mail provider tokens. |
| MICROSOFT_GRAPH_CLIENT_ID / _CLIENT_SECRET / _TENANT_ID | Microsoft (Outlook) mail OAuth app. |
| MICROSOFT_GRAPH_WEBHOOK_URL / MICROSOFT_GRAPH_WEBHOOK_CLIENT_STATE | Graph change-notification endpoint and shared client state. |
| GOOGLE_GMAIL_PUBSUB_TOPIC / _AUDIENCE / _SERVICE_ACCOUNT_EMAIL | Gmail push (Pub/Sub) topic and push-JWT verification. |
| SCIM_BEARER_TOKEN | Inbound SCIM provisioning token (optional). |
| APPDEPLOY_VITE_OUT_DIR, APPDEPLOY_VITE_SOURCEMAP | Build-time only (not secret). |

Also revoke or rotate the following:
- Every tsv_ API token.
- Every vault item (Home Assistant, Telegram bot token, GitHub PAT, webhooks).
- All owner sessions (bump the revocation epoch).
- All Google and Microsoft refresh tokens stored in the DB. Disconnect them and connect again.
- AppDeploy account credentials and API keys.
- Password-login passwords and TOTP for all users.
