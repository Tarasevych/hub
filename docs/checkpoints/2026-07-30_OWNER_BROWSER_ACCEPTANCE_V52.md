> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.uk.md) · [🇳🇱 **Nederlandse versie**](./2026-07-30_OWNER_BROWSER_ACCEPTANCE_V52.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Owner Browser Acceptance v52

## Scope

- B-003 Session Rotation and Refresh Hardening
- B-004 Revocation Propagation
- B-005 Owner Browser Acceptance
- L-002 Bilingual Hardening Continuation

## Controlled rollout

The owner canary runs on the existing custom domains only when `owner_test=1` is present. Default production routes, production OAuth secret and production authority are not replaced by this checkpoint.

Rollback: AppDeploy production v51 (`1785379626280`).

## Owner URLs

- Hub: `https://hub.tarasevych.com/?owner_test=1&tab=overview&lang=uk`
- AI: `https://ai.tarasevych.com/?owner_test=1&tab=workspace&lang=uk`
- Mail: `https://mail.tarasevych.com/?owner_test=1&tab=overview&lang=uk`
- Cloud: `https://cloud.tarasevych.com/?owner_test=1&tab=overview&lang=uk`
- GitHub: `https://github.tarasevych.com/?owner_test=1&tab=overview&lang=uk`
- Identity profile: `https://id.tarasevych.com/?owner_test=1&tab=profile&lang=uk`
- Identity sessions: `https://id.tarasevych.com/?owner_test=1&tab=sessions&lang=uk`
- Identity recovery: `https://id.tarasevych.com/?owner_test=1&tab=recovery&lang=uk`
- API security: `https://api.tarasevych.com/?owner_test=1&tab=testing&lang=uk`
- API bilingual QA: `https://api.tarasevych.com/?owner_test=1&tab=bilingual&lang=uk`
- System truth: `https://api.tarasevych.com/?owner_test=1&tab=truth&lang=uk`

## Evidence boundary

Automated QA proves deterministic refresh behavior, cookie rotation on the technical host, revocation records, central epoch checks, audit hash-chain integrity and bilingual critical routes. External Google OAuth, browser popup lifecycle, browser-specific tab restoration and custom-domain cookie inspection remain owner-browser observations until the owner completes the checklist.