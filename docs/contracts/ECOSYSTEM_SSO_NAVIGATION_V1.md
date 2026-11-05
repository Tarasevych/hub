> 🌐 **Мова / Taal:** [🇺🇦 **Українська версія**](./ECOSYSTEM_SSO_NAVIGATION_V1.uk.md) · [🇳🇱 **Nederlandse versie**](./ECOSYSTEM_SSO_NAVIGATION_V1.nl.md) · [🏠 Головна (UK)](../../README.md) · [🏠 Hoofdpagina (NL)](../../LEESMIJ.md) · [📚 Каталог статей / Index](../../docs/INDEX.md)

# Ecosystem SSO Navigation v1

## Goal
All production subdomains behave as sections of one ecosystem rather than unrelated sites.

## Session model
- Hub keeps its existing tab-scoped Hub session.
- Every service keeps a host-only HttpOnly session selected by a non-secret tab ID.
- A two-minute one-time handoff transfers the selected account between services in the same browser tab.
- Service-to-service and service-to-Hub navigation never sends access tokens, account IDs or email addresses in URLs.

## Flows
- Hub -> service: Hub session creates a handoff for the target service.
- Service -> service: the current service session creates a handoff through Hub.
- Service -> Hub: the current service session creates a Hub handoff; Hub consumes it into its tab session.
- Direct signed-out service visit: the service sends the user to Hub with `continue=<service>`; after Google sign-in Hub returns through a handoff.

## Source of truth
Hub backend remains the source of truth for users, status, workspaces, notifications, permissions and audit.

## UI contract
All services use the same global rail order, theme tokens, language control, current-service indicator, profile context and notification count.