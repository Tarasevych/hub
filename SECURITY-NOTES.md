# Security notes (static audit, 2026-10-02)

Source: newest archive 6c86816a…863194.zip (2026-09-16), a strict superset of 53859f30…a7b191.zip (2026-09-12). Nothing had to be restored.
Assume the attacker has this full source and every old secret. **Rotate everything listed in ENV-VARS.md before redeploying.**

## Fixed in the commit "security fixes"
1. CRITICAL: unauthenticated owner/super-admin session mint. `POST /api/owner/security/session-fixture` only checked the public body field `sourceOrigin`.
   It minted a 30-day `qaSynthetic` session, which `ownerSyntheticUser` treats as role=owner. That session passed `adminContext` (super_admin), access-plane `ownerGate` and google-contour `owner()`.
   Fix: `OWNER_QA_FIXTURES_ENABLED=false` gates session-fixture, integration-lab, integration-lab-v2, self-test and mail/qa-fixture (they now return 404).
   qaSynthetic sessions are rejected in `ownerRequireAnchor` and `ownerRequireRedirectAnchor`, skipped by the browser overlay, and no longer get owner rights in `adminContext`.
2. CRITICAL: `/api/owner/google-contour/reveal` returned the plaintext Google client secret and the grant encryption key. It is now disabled (403).
3. HIGH: the google-contour `wrapKey` fell back to a key derived from the OAuth client secret. Removed: a dedicated `GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1` is now required.
4. HIGH: the vault key fell back to the grant key, the mail key and the OAuth client secrets. It now uses only `OWNER_VAULT_ENCRYPTION_KEY_V1`.
5. MEDIUM: `MailComposeEditor.parseValue` used `innerHTML` on a live element (image onerror could fire). It now parses with `DOMParser` in an inert document.

## Still to do manually
- HIGH: password-login endpoints (`backend/access-plane.ts`, `verifyPasswordLogin` and the 2 routes that call it) have no rate limit or lockout, which allows brute force on passwords and TOTP/recovery codes and user enumeration. Add per-email and per-IP limits.
- HIGH: the PKCE verifier and nonce are derived by HMAC of the OAuth client secret (`ownerOAuthMaterial` in index.ts, mail-platform.ts, google-suite-onboarding.ts, mail-microsoft.ts). Rotating the secrets closes the current exposure. Better: random per-transaction values stored server-side.
- HIGH: the owner is hardcoded as tarasevych.pavlo@gmail.com (index.ts, rbac.ts). Secure that Google account: change the password, use a hardware key or passkey, revoke all sessions and third-party grants.
- MEDIUM: cookies are SameSite=None; Partitioned and there is no explicit Origin/CSRF check on state-changing POSTs. Add an Origin allow-list check.
  `ownerHost` and handoff `hostOf` trust `x-forwarded-host`: confirm the platform proxy overwrites it.
- MEDIUM: the technical-host CSP allows 'unsafe-inline' 'unsafe-eval' (public/canonical-security.js). Lock down or disable the technical host in production.
- MEDIUM: `src/MailRichDocumentPreview.tsx` uses dangerouslySetInnerHTML with attachment-rendered HTML. Sanitize with DOMPurify.
- MEDIUM: TOTP secrets are stored in plaintext. Recovery codes are HMAC'd with a constant key ('mij-prostir-access-v1'). Encrypt and pepper them with a new secret.
- MEDIUM: google-contour overrides `secrets.readSecret` globally from DB values. Remove the DB override and use platform secrets only.
- LOW: handoff redeem is list-then-delete (race), plus login CSRF through `?handoff=`. Unused `/api/subscriptions` handler. DNS-rebinding TOCTOU in the mail-browser SSRF guard.
- The Google client ID default is hardcoded (`DEFAULT_GOOGLE_CLIENT_ID` in google-contour.ts, also listed in src/CanonicalImplementationTruthMatrix.tsx). If you create a new OAuth client, update it, or set GOOGLE_OAUTH_CLIENT_ID / GOOGLE_SUITE_CLIENT_ID.

## Forensics (production DB)
Look for audit actions `owner.qa.synthetic-fixture.created`, `access.google-contour.reveal`, `access.user.reset-password`, `access.policy.save` and `owner.admin.user.*`.
Also look for sessions with `qaSynthetic:true` in owner_service_sessions_v1, unexpected rows in credential_contours_v1, and unknown users or tsv_ tokens.
